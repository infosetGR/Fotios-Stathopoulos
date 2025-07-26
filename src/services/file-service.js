// File processing and knowledge base service
export class FileService {
  constructor(embeddingService) {
    this.embeddingService = embeddingService;
  }

  async processFile(fileData) {
    console.group(`📄 Processing file: ${fileData.name}`);
    
    try {
      // Split content into chunks for better embedding processing
      const chunks = this.splitIntoChunks(fileData.content, 1000); // ~1000 chars per chunk
      console.log(`📊 Split "${fileData.name}" into ${chunks.length} chunks`);
      
      const embeddings = [];
      let successfulEmbeddings = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`🔄 Processing chunk ${i + 1}/${chunks.length} for "${fileData.name}"`);
        
        // Add small delay between requests to avoid rate limiting
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        }
        
        const embedding = await this.embeddingService.generateEmbedding(chunk);
        
        if (embedding) {
          embeddings.push({
            chunkId: `${fileData.name}_chunk_${i}`,
            fileName: fileData.name,
            fileType: fileData.type,
            content: chunk,
            embedding: embedding.values || embedding, // Handle different API response formats
            chunkIndex: i,
            totalChunks: chunks.length,
            timestamp: Date.now()
          });
          successfulEmbeddings++;
        } else {
          console.warn(`⚠️ Failed to generate embedding for chunk ${i + 1} of "${fileData.name}"`);
        }
      }
      
      // Store file metadata and embeddings
      await this.storeFileData(fileData, embeddings);
      
      console.log(`✅ Successfully processed "${fileData.name}"`);
      console.log(`📊 Embedded ${successfulEmbeddings}/${chunks.length} chunks`);
      console.log(`💾 Total embeddings created: ${embeddings.length}`);
      
      return {
        success: true,
        fileName: fileData.name,
        chunksProcessed: successfulEmbeddings,
        totalChunks: chunks.length,
        embeddingsCreated: embeddings.length
      };
      
    } catch (error) {
      console.error(`❌ Error processing file ${fileData.name}:`, error);
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  splitIntoChunks(text, maxChunkSize = 1000) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        // If single sentence is too long, split by words
        if (trimmedSentence.length > maxChunkSize) {
          const words = trimmedSentence.split(' ');
          let wordChunk = '';
          
          for (const word of words) {
            if (wordChunk.length + word.length + 1 <= maxChunkSize) {
              wordChunk += (wordChunk ? ' ' : '') + word;
            } else {
              if (wordChunk) {
                chunks.push(wordChunk);
              }
              wordChunk = word;
            }
          }
          
          if (wordChunk) {
            currentChunk = wordChunk;
          } else {
            currentChunk = '';
          }
        } else {
          currentChunk = trimmedSentence;
        }
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  async storeFileData(fileData, embeddings) {
    try {
      // Get existing data
      const result = await chrome.storage.local.get(['uploadedFiles', 'knowledgeBase']);
      const uploadedFiles = result.uploadedFiles || [];
      const knowledgeBase = result.knowledgeBase || [];
      
      // Remove any existing entries for this file
      const filteredFiles = uploadedFiles.filter(f => f.name !== fileData.name);
      const filteredKnowledgeBase = knowledgeBase.filter(k => k.fileName !== fileData.name);
      
      // Add new file metadata
      filteredFiles.push({
        name: fileData.name,
        type: fileData.type,
        size: fileData.size,
        lastModified: fileData.lastModified,
        uploadedAt: Date.now(),
        chunksCount: embeddings.length
      });
      
      // Add new embeddings
      filteredKnowledgeBase.push(...embeddings);
      
      // Store updated data
      await chrome.storage.local.set({
        uploadedFiles: filteredFiles,
        knowledgeBase: filteredKnowledgeBase
      });
      
      console.log(`💾 Stored file metadata and ${embeddings.length} embeddings`);
      
    } catch (error) {
      console.error('❌ Error storing file data:', error);
      throw error;
    }
  }

  async searchSimilarContent(query, limit = 5) {
    console.group(`🔍 Searching knowledge base for: "${query.substring(0, 50)}..."`);
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      if (!queryEmbedding) {
        console.warn('⚠️ Failed to generate query embedding');
        return [];
      }
      
      // Get knowledge base
      const result = await chrome.storage.local.get('knowledgeBase');
      const knowledgeBase = result.knowledgeBase || [];
      
      if (knowledgeBase.length === 0) {
        console.log('📭 No knowledge base entries found');
        return [];
      }
      
      console.log(`📊 Searching through ${knowledgeBase.length} chunks`);
      
      // Calculate similarity scores
      const similarities = knowledgeBase.map(chunk => ({
        ...chunk,
        similarity: this.cosineSimilarity(
          queryEmbedding.values || queryEmbedding,
          chunk.embedding
        )
      }));
      
      // Sort by similarity and return top results
      const topResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
      
      console.log(`✅ Found ${topResults.length} relevant chunks`);
      topResults.forEach((result, i) => {
        console.log(`${i + 1}. ${result.fileName} (similarity: ${result.similarity.toFixed(3)}): ${result.content.substring(0, 100)}...`);
      });
      
      return topResults;
      
    } catch (error) {
      console.error('❌ Error searching knowledge base:', error);
      return [];
    } finally {
      console.groupEnd();
    }
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  async getKnowledgeStats() {
    try {
      const result = await chrome.storage.local.get(['uploadedFiles', 'knowledgeBase']);
      const files = result.uploadedFiles || [];
      const chunks = result.knowledgeBase || [];
      
      return {
        filesCount: files.length,
        chunksCount: chunks.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0)
      };
    } catch (error) {
      console.error('Error getting knowledge stats:', error);
      return { filesCount: 0, chunksCount: 0, totalSize: 0 };
    }
  }
}
