// Google Generative AI Embeddings Service
const EMBEDDING_API_URL = 'https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent';
const EMBEDDING_CACHE_KEY = 'form_embeddings';
const MAX_EMBEDDINGS_PER_URL = 50;

export class EmbeddingService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async generateEmbedding(text, retryCount = 0) {
    console.group('🧮 Generating embedding');
    try {
      // Show progress in console for debugging
      console.log('Text to embed:', text.substring(0, 100) + '...');
      console.log('📡 Making request to:', `${EMBEDDING_API_URL}?key=${this.apiKey.substring(0, 10)}...`);
      
      const requestBody = {
        model: 'models/embedding-001',
        content: {
          parts: [{
            text: text
          }]
        }
      };
      
      console.log('📤 Request body structure:', {
        model: requestBody.model,
        contentParts: requestBody.content.parts.length,
        textLength: requestBody.content.parts[0].text.length
      });
      
      const response = await fetch(`${EMBEDDING_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Response Status:', response.status);
        console.error('❌ API Response Text:', errorText);
        
        // Handle rate limiting with retry
        if (response.status === 429 && retryCount < 3) {
          const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`⏳ Rate limited, retrying in ${waitTime}ms (attempt ${retryCount + 1}/3)`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.generateEmbedding(text, retryCount + 1);
        }
        
        // Try to parse error as JSON for better debugging
        try {
          const errorJson = JSON.parse(errorText);
          console.error('❌ API Error Details:', errorJson);
        } catch (e) {
          // Error text is not JSON, already logged above
        }
        
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ API Response structure:', {
        hasEmbedding: !!result.embedding,
        hasValues: !!(result.embedding && result.embedding.values),
        valuesLength: result.embedding && result.embedding.values ? result.embedding.values.length : 0
      });
      
      // The API should return the embedding in result.embedding.values
      if (result.embedding && result.embedding.values) {
        console.log('✅ Embedding generated successfully, dimension:', result.embedding.values.length);
        return result.embedding;
      } else {
        console.error('❌ Unexpected API response format:', result);
        throw new Error('Invalid embedding response format');
      }
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      return null;
    } finally {
      console.groupEnd();
    }
  }

  async storeFormEmbeddings(formData, url) {
    console.group('💾 Storing form embeddings');
    console.log('📍 URL Pattern:', this.extractUrlPattern(url));
    console.log('📊 Processing', Object.keys(formData).length, 'fields');
    
    try {
      const urlPattern = this.extractUrlPattern(url);
      const { formEmbeddings = {} } = await chrome.storage.local.get(EMBEDDING_CACHE_KEY);

      if (!formEmbeddings[urlPattern]) {
        formEmbeddings[urlPattern] = [];
        console.log('🆕 Created new embedding storage for', urlPattern);
      }

      // Generate embeddings for each field
      console.log('🧮 Generating embeddings...');
      const embeddingsPromises = Object.entries(formData).map(async ([fieldId, field]) => {
        const contextText = this.buildFieldContext(field);
        console.log(`🔤 Field "${field.title.text}": Context="${contextText}"`);
        
        const embedding = await this.generateEmbedding(contextText);

        if (embedding) {
          console.log(`✅ Generated embedding for "${field.title.text}" (${embedding.length} dimensions)`);
          return {
            fieldId,
            embedding,
            value: field.value,
            type: field.type,
            context: this.extractFieldContext(field),
            fieldTitle: field.title.text,
            timestamp: Date.now()
          };
        } else {
          console.warn(`❌ Failed to generate embedding for "${field.title.text}"`);
        }
      });

      const newEmbeddings = (await Promise.all(embeddingsPromises)).filter(Boolean);
      console.log(`📝 Successfully generated ${newEmbeddings.length} embeddings`);
      
      // Store embeddings with size management
      const totalEmbeddings = formEmbeddings[urlPattern].length + newEmbeddings.length;
      formEmbeddings[urlPattern] = [
        ...formEmbeddings[urlPattern],
        ...newEmbeddings
      ].slice(-MAX_EMBEDDINGS_PER_URL);

      if (totalEmbeddings > MAX_EMBEDDINGS_PER_URL) {
        console.log(`⚠️ Removed ${totalEmbeddings - MAX_EMBEDDINGS_PER_URL} old embeddings (keeping latest ${MAX_EMBEDDINGS_PER_URL})`);
      }

      await chrome.storage.local.set({ [EMBEDDING_CACHE_KEY]: formEmbeddings });
      console.log(`💾 Stored embeddings successfully. Total for ${urlPattern}: ${formEmbeddings[urlPattern].length}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to store embeddings:', error);
      return false;
    } finally {
      console.groupEnd();
    }
  }

  async findSimilarFields(field, url) {
    console.group('🔍 Finding similar fields');
    try {
      const urlPattern = this.extractUrlPattern(url);
      const { formEmbeddings = {} } = await chrome.storage.local.get(EMBEDDING_CACHE_KEY);
      const urlEmbeddings = formEmbeddings[urlPattern] || [];

      if (urlEmbeddings.length === 0) {
        return [];
      }

      const contextText = this.buildFieldContext(field);
      const currentEmbedding = await this.generateEmbedding(contextText);

      if (!currentEmbedding) {
        return [];
      }

      // Find similar fields using cosine similarity
      const similarFields = urlEmbeddings
        .map(stored => ({
          ...stored,
          similarity: this.cosineSimilarity(currentEmbedding, stored.embedding)
        }))
        .filter(result => result.similarity > 0.85)
        .sort((a, b) => b.similarity - a.similarity);

      console.log(`✅ Found ${similarFields.length} similar fields`);
      return similarFields;
    } catch (error) {
      console.error('❌ Error finding similar fields:', error);
      return [];
    } finally {
      console.groupEnd();
    }
  }

  buildFieldContext(field) {
    return [
      field.title?.text,
      field.contextualInfo?.label,
      field.name,
      field.id,
      field.placeholder
    ].filter(Boolean).join(' ').toLowerCase().trim();
  }

  extractFieldContext(field) {
    return {
      type: field.type,
      required: field.required,
      pattern: field.pattern,
      constraints: field.constraints
    };
  }

  cosineSimilarity(embedding1, embedding2) {
    const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
    const mag1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  }

  extractUrlPattern(url) {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname.replace(/\/[0-9]+/g, '/:id')}`;
  }
}
