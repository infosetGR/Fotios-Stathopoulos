// Background service worker for AI form processing
import { EmbeddingService } from './services/embedding-service.js';
import { GeminiService } from './services/gemini-service.js';
import { FileService } from './services/file-service.js';

// Get the API key from Chrome extension environment variables (chrome.storage)
let API_KEY = null;

// Load API key from chrome.storage.local (set via extension options or install)
async function loadApiKey() {
  try {
    const result = await chrome.storage.local.get(['API_KEY']);
    API_KEY = result.API_KEY || null;
    
    if (!API_KEY) {
      console.warn('⚠️ No API key configured. Please set your API key in extension settings.');
      return null;
    } else {
      console.log('✅ Custom API key loaded successfully');
      return API_KEY;
    }
  } catch (error) {
    console.error('❌ Error loading API key from storage:', error);
    API_KEY = null;
    return null;
  }
}

// Initialize API key on startup
loadApiKey();

// Listen for storage changes to update API key
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.API_KEY) {
    console.log('🔄 API key changed in storage, updating...');
    handleApiKeyUpdate();
  }
});

// Initialize services
let embeddingService = null;
let geminiService = null;
let fileService = null;

// Initialize services
async function initializeServices() {
  if (!API_KEY) {
    await loadApiKey();
  }
  
  if (!API_KEY) {
    throw new Error('No API key configured. Please set your Gemini API key in extension settings.');
  }
  
  if (!embeddingService || !geminiService || !fileService) {
    embeddingService = new EmbeddingService(API_KEY);
    geminiService = new GeminiService(API_KEY);
    fileService = new FileService(embeddingService);
    console.log('🔧 Services initialized with API key');
  }
}

// Icon management for visual feedback
async function setWorkingIcon(tabId) {
  await chrome.action.setIcon({
    tabId: tabId,
    path: {
      "16": "icons/working-16.png",
      "32": "icons/working-32.png",
      "48": "icons/working-48.png",
      "128": "icons/working-128.png"
    }
  });
  
  // Also set badge to show activity
  await chrome.action.setBadgeText({ tabId: tabId, text: "..." });
  await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#4285f4" });
}

async function setNormalIcon(tabId) {
  await chrome.action.setIcon({
    tabId: tabId,
    path: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png", 
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  });
  
  await chrome.action.setBadgeText({ tabId: tabId, text: "" });
}

// Listen for form submissions and prediction requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'formSubmitted') {
    handleFormSubmission(request.formData, request.url, sender.tab?.id);
  } else if (request.action === 'requestFormPrediction') {
    handlePredictionRequest(request.formFields, request.url, sender.tab?.id)
      .then(predictions => sendResponse(predictions));
    return true; // Required for async response
  } else if (request.action === 'uploadFile') {
    handleFileUpload(request.fileData, sender.tab?.id)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Required for async response
  } else if (request.action === 'searchKnowledge') {
    handleKnowledgeSearch(request.query, request.fieldType, request.fieldTitle, request.customInstructions, sender.tab?.id)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Required for async response
  } else if (request.action === 'apiKeyUpdated') {
    // Reload API key and reinitialize services
    handleApiKeyUpdate();
  }
});

// Handle API key updates
async function handleApiKeyUpdate() {
  console.log('🔄 API key updated, reloading...');
  
  try {
    const result = await chrome.storage.local.get(['API_KEY']);
    const newApiKey = result.API_KEY || null;
    
    if (newApiKey !== API_KEY) {
      API_KEY = newApiKey;
      
      // Reset services to force reinitialization with new API key
      embeddingService = null;
      geminiService = null;
      fileService = null;
      
      console.log('✅ API key updated and services reset');
    }
  } catch (error) {
    console.error('❌ Error handling API key update:', error);
  }
}

async function handleFileUpload(fileData, tabId) {
  console.group('📤 Handling File Upload');
  console.log('📄 File:', fileData.name, `(${fileData.size} bytes)`);
  
  try {
    if (tabId) await setWorkingIcon(tabId);
    
    await initializeServices();
    const result = await fileService.processFile(fileData);
    
    console.log('✅ File upload processed successfully');
    console.log(`📊 Embedding Summary for "${result.fileName}":`);
    console.log(`   └─ Chunks processed: ${result.chunksProcessed}/${result.totalChunks}`);
    console.log(`   └─ Embeddings created: ${result.embeddingsCreated}`);
    console.log(`   └─ Success rate: ${((result.chunksProcessed/result.totalChunks)*100).toFixed(1)}%`);
    
    if (tabId) await setNormalIcon(tabId);
    return { 
      success: true, 
      message: `Successfully embedded ${result.chunksProcessed} chunks from ${result.fileName}`,
      ...result 
    };
    
  } catch (error) {
    console.error('❌ Error handling file upload:', error);
    if (tabId) await setNormalIcon(tabId);
    
    // Check if error is due to missing API key
    if (error.message.includes('No API key configured')) {
      throw new Error('Please configure your Gemini API key in extension settings before uploading files.');
    }
    
    throw error;
  } finally {
    console.groupEnd();
  }
}

async function handleKnowledgeSearch(query, fieldType, fieldTitle, customInstructions, tabId) {
  console.group('🔍 Handling Knowledge Search');
  console.log('🔎 Query:', query);
  console.log('📝 Field Type:', fieldType);
  console.log('🏷️ Field Title:', fieldTitle);
  console.log('📋 Custom Instructions:', customInstructions || 'None');
  
  try {
    await initializeServices();
    
    // Search the knowledge base first (without custom instructions)
    const similarChunks = await fileService.searchSimilarContent(query, 3);
    
    if (similarChunks.length === 0) {
      console.log('📭 No relevant content found in knowledge base, attempting Gemini fallback');
      
      // Use Gemini as fallback to generate intelligent suggestions (WITH custom instructions)
      try {
        const geminiSuggestion = await generateGeminiSuggestion(query, fieldType, fieldTitle, customInstructions);
        
        if (geminiSuggestion && geminiSuggestion.trim().length > 0) {
          console.log('🤖 Gemini generated suggestion:', geminiSuggestion);
          return { 
            success: true, 
            suggestions: [{
              content: geminiSuggestion,
              extractedValue: geminiSuggestion,
              similarity: 0.8,
              source: 'gemini_ai',
              fileName: 'AI Generated',
              relevanceScore: 0.9
            }]
          };
        } else {
          console.warn('⚠️ Gemini returned empty suggestion');
        }
      } catch (geminiError) {
        console.error('❌ Gemini fallback failed:', geminiError);
      }
      
      // If Gemini fails, return empty suggestions (content script will handle fallback)
      console.log('📭 No suggestions available from any source');
      return { success: true, suggestions: [] };
    }
    
    // Process the knowledge base results to extract meaningful values
    const suggestions = await processKnowledgeResults(similarChunks, fieldType, fieldTitle);
    
    console.log(`✅ Knowledge search completed with ${suggestions.length} suggestions`);
    return { success: true, suggestions };
    
  } catch (error) {
    console.error('❌ Error handling knowledge search:', error);
    
    // Check if error is due to missing API key
    if (error.message.includes('No API key configured')) {
      return { 
        success: false, 
        error: 'Please configure your Gemini API key in extension settings before searching.',
        suggestions: [] 
      };
    }
    
    // Return empty suggestions so content script can handle fallback
    return { success: true, suggestions: [] };
  } finally {
    console.groupEnd();
  }
}

async function generateGeminiSuggestion(query, fieldType, fieldTitle, customInstructions = '') {
  console.group('🤖 Generating Gemini suggestion');
  console.log('📝 Field details:', { query, fieldType, fieldTitle });
  console.log('📋 Custom instructions:', customInstructions || 'None');
  
  try {
    // Create an intelligent prompt based on field context and custom instructions
    const prompt = createGeminiPrompt(query, fieldType, fieldTitle, customInstructions);
    console.log('💭 Prompt created, length:', prompt.length);
    console.log('💭 Prompt preview:', prompt.substring(0, 300) + '...');
    
    // Use Gemini service to generate suggestion
    console.log('🔄 Calling Gemini service...');
    const suggestion = await geminiService.generateFieldSuggestion(prompt, fieldType);
    
    if (suggestion && suggestion.trim().length > 0) {
      console.log('✅ Gemini suggestion generated successfully:', suggestion);
      return suggestion;
    } else {
      console.warn('⚠️ Gemini returned empty or invalid suggestion:', suggestion);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Error generating Gemini suggestion:', error);
    console.error('❌ Error details:', error.message);
    return null;
  } finally {
    console.groupEnd();
  }
}

function createGeminiPrompt(query, fieldType, fieldTitle, customInstructions = '') {
  const basePrompt = `You are an intelligent form filling assistant. Based on the field context provided, generate an appropriate value for this form field.

Field Information:
- Field Title: "${fieldTitle}"
- Field Type: "${fieldType}"
- Search Query: "${query}"

Instructions:
1. Generate a realistic, appropriate value for this field type
2. Consider common conventions and formats for ${fieldType} fields
3. Make the value professional and suitable for form submission
4. Return ONLY the value itself, without explanations or formatting
5. Ensure the value matches the expected format for a ${fieldType} field`;

  // Add custom instructions if provided
  let customInstructionSection = '';
  if (customInstructions && customInstructions.trim()) {
    customInstructionSection = `

IMPORTANT - Custom User Instructions:
${customInstructions}

Please follow these custom instructions when generating the field value. They take priority over the default instructions above.`;
  }

  // Add field-specific guidance
  let fieldSpecificGuidance = '';
  switch (fieldType?.toLowerCase()) {
    case 'email':
      fieldSpecificGuidance = `
6. Generate a professional email address (e.g., firstname.lastname@company.com)
7. Use common domain names like gmail.com, company.com, or organization names
8. Ensure proper email format with @ symbol and valid domain`;
      break;

    case 'tel':
      fieldSpecificGuidance = `
6. Generate a phone number in standard format (e.g., +1-555-123-4567)
7. Include country code if appropriate
8. Use realistic area codes and number patterns`;
      break;

    case 'url':
      fieldSpecificGuidance = `
6. Generate a complete URL starting with https://
7. Use professional website formats (e.g., https://www.company.com)
8. Make it relevant to the field context if possible`;
      break;

    case 'date':
      fieldSpecificGuidance = `
6. Generate a date in YYYY-MM-DD format
7. Use a reasonable date (not too far in past or future)
8. Consider if this might be a birth date, start date, or other specific date type`;
      break;

    case 'number':
      fieldSpecificGuidance = `
6. Generate a realistic number appropriate for the context
7. Consider if this might be age, salary, quantity, etc.
8. Use whole numbers unless decimals are clearly needed`;
      break;

    case 'text':
    case 'textarea':
      if (fieldTitle?.toLowerCase().includes('name')) {
        fieldSpecificGuidance = `
6. Generate a professional full name (First Last format)
7. Use common, professional-sounding names
8. Avoid unusual characters or formatting`;
      } else if (fieldTitle?.toLowerCase().includes('address')) {
        fieldSpecificGuidance = `
6. Generate a complete address with street, city, state, and ZIP
7. Use realistic street names and locations
8. Format as: Street Address, City, State ZIP`;
      } else if (fieldTitle?.toLowerCase().includes('company')) {
        fieldSpecificGuidance = `
6. Generate a professional company name
7. Use realistic business naming conventions
8. Consider industry-appropriate names`;
      } else if (fieldTitle?.toLowerCase().includes('cover letter') || fieldTitle?.toLowerCase().includes('resume')) {
        fieldSpecificGuidance = `
6. Generate a brief, professional summary or cover letter excerpt
7. Keep it concise but meaningful (2-3 sentences)
8. Make it relevant to a job application context
9. Example: "Experienced professional with 5+ years in the field. Strong background in project management and team leadership. Seeking opportunities to contribute to innovative projects."`;
      } else if (fieldTitle?.toLowerCase().includes('description') || fieldTitle?.toLowerCase().includes('summary')) {
        fieldSpecificGuidance = `
6. Generate a brief, professional description (2-3 sentences)
7. Keep it concise and relevant to the context
8. Make it sound professional and meaningful`;
      } else {
        fieldSpecificGuidance = `
6. Generate appropriate text content based on the field title
7. Keep it concise and professional
8. Match the expected content type for this field
9. For longer text fields, provide meaningful content (2-3 sentences)`;
      }
      break;

    default:
      fieldSpecificGuidance = `
6. Generate content appropriate for the field context
7. Keep it simple and professional
8. Match common expectations for this type of field`;
      break;
  }

  return basePrompt + customInstructionSection + fieldSpecificGuidance;
}

async function processKnowledgeResults(chunks, fieldType, fieldTitle) {
  console.group('🔄 Processing knowledge results');
  
  const suggestions = [];
  
  for (const chunk of chunks) {
    try {
      // Try to extract relevant value from the content based on field type
      const extractedValue = extractValueFromContent(chunk.content, fieldType, fieldTitle);
      
      suggestions.push({
        ...chunk,
        extractedValue: extractedValue,
        relevanceScore: calculateRelevanceScore(chunk, fieldType, fieldTitle)
      });
      
    } catch (error) {
      console.warn('⚠️ Error processing chunk:', error);
    }
  }
  
  // Sort by combined similarity and relevance score
  suggestions.sort((a, b) => {
    const scoreA = (a.similarity * 0.7) + (a.relevanceScore * 0.3);
    const scoreB = (b.similarity * 0.7) + (b.relevanceScore * 0.3);
    return scoreB - scoreA;
  });
  
  console.log(`📊 Processed ${suggestions.length} suggestions`);
  console.groupEnd();
  
  return suggestions;
}

function extractValueFromContent(content, fieldType, fieldTitle) {
  const lowerContent = content.toLowerCase();
  const lowerTitle = fieldTitle ? fieldTitle.toLowerCase() : '';
  
  switch (fieldType?.toLowerCase()) {
    case 'email':
      const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return emailMatch ? emailMatch[0] : null;
      
    case 'tel':
      const phoneMatch = content.match(/[\+]?[1-9]?[\-\.\s]?[\(]?[0-9]{1,3}[\)]?[\-\.\s]?[0-9]{3,4}[\-\.\s]?[0-9]{3,4}/);
      return phoneMatch ? phoneMatch[0] : null;
      
    case 'url':
      const urlMatch = content.match(/https?:\/\/[^\s]+/);
      return urlMatch ? urlMatch[0] : null;
      
    case 'date':
      const dateMatch = content.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4}/);
      return dateMatch ? dateMatch[0] : null;
      
    case 'number':
      const numberMatch = content.match(/\d+(\.\d+)?/);
      return numberMatch ? numberMatch[0] : null;
      
    default:
      // For text fields, try to find relevant sentences or phrases
      if (lowerTitle && lowerTitle.length > 3) {
        // Look for sentences containing the field title
        const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
        const relevantSentence = sentences.find(sentence => 
          sentence.toLowerCase().includes(lowerTitle)
        );
        
        if (relevantSentence) {
          // Extract the part after the title if possible
          const titleIndex = relevantSentence.toLowerCase().indexOf(lowerTitle);
          if (titleIndex !== -1) {
            const afterTitle = relevantSentence.substring(titleIndex + lowerTitle.length).trim();
            const match = afterTitle.match(/^[:\-\s]*([^,\.]+)/);
            return match ? match[1].trim() : relevantSentence;
          }
          return relevantSentence;
        }
      }
      
      // Fallback: return first meaningful sentence
      const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
      return sentences[0] || content.substring(0, 50);
  }
}

function calculateRelevanceScore(chunk, fieldType, fieldTitle) {
  let score = 0;
  const content = chunk.content.toLowerCase();
  const title = fieldTitle ? fieldTitle.toLowerCase() : '';
  
  // Check if field title appears in content
  if (title && content.includes(title)) {
    score += 0.5;
  }
  
  // Check for field type specific keywords
  const typeKeywords = {
    email: ['email', 'mail', 'contact', '@'],
    tel: ['phone', 'telephone', 'number', 'contact'],
    url: ['website', 'url', 'link', 'http'],
    date: ['date', 'time', 'when', 'day'],
    number: ['number', 'amount', 'quantity', 'count']
  };
  
  const keywords = typeKeywords[fieldType?.toLowerCase()] || [];
  const matchedKeywords = keywords.filter(keyword => content.includes(keyword));
  score += (matchedKeywords.length / keywords.length) * 0.3;
  
  // Bonus for shorter, more focused content
  if (chunk.content.length < 200) {
    score += 0.2;
  }
  
  return Math.min(score, 1.0);
}

async function handleFormSubmission(formData, url, tabId) {
  console.group('🧠 Handling Form Submission');
  console.log('📍 URL:', url);
  console.log('📊 Form Data:', formData);
  
  try {
    if (tabId) await setWorkingIcon(tabId);
    
    await initializeServices();
    const success = await learnFromFormSubmission(formData, url);
    
    if (success) {
      console.log('✅ Form submission processed successfully');
    } else {
      console.warn('⚠️ Form submission processing failed');
    }
    
    if (tabId) await setNormalIcon(tabId);
  } catch (error) {
    console.error('❌ Error handling form submission:', error);
    if (tabId) await setNormalIcon(tabId);
  } finally {
    console.groupEnd();
  }
}

async function handlePredictionRequest(formFields, url, tabId) {
  try {
    if (tabId) await setWorkingIcon(tabId);
    
    await initializeServices();
    const predictions = await predictFormValues(formFields, url);
    
    if (tabId) await setNormalIcon(tabId);
    return predictions;
  } catch (error) {
    console.error('Error handling prediction request:', error);
    if (tabId) await setNormalIcon(tabId);
    return {};
  }
}

async function learnFromFormSubmission(formData, url) {
  console.group('🧠 Learning from form submission');
  console.log('📍 Processing URL:', url);
  console.log('📊 Fields to process:', Object.keys(formData).length);
  
  try {
    // Store embeddings for future matching
    const success = await embeddingService.storeFormEmbeddings(formData, url);
    
    if (success) {
      console.log('✅ Form data processed and embedded successfully');
      
      // Log details of what was stored
      Object.entries(formData).forEach(([fieldId, fieldInfo]) => {
        console.log(`📝 Embedded field "${fieldInfo.title.text}": "${fieldInfo.value}"`);
      });
      
      return true;
    } else {
      console.error('❌ Failed to store embeddings');
      return false;
    }
  } catch (error) {
    console.error('❌ Error learning from form:', error);
    return false;
  } finally {
    console.groupEnd();
  }
}

async function predictFormValues(formFields, url) {
  console.group('🔮 Predicting form values');
  try {
    const predictions = {};
    
    // Process each field
    for (const [fieldId, fieldInfo] of Object.entries(formFields)) {
      // Find similar fields using embeddings
      const similarFields = await embeddingService.findSimilarFields(fieldInfo, url);
      
      if (similarFields.length > 0) {
        // Use Gemini to analyze patterns and predict value
        const prediction = await geminiService.predictFieldValues(fieldInfo, similarFields);
        if (prediction) {
          predictions[fieldId] = prediction;
        }
      }
    }

    console.log('✅ Generated predictions:', predictions);
    return predictions;
  } catch (error) {
    console.error('Error predicting form values:', error);
    return {};
  }
}

async function analyzeWithGemini(patterns) {
  try {
    const prompt = `
      Analyze these form submission patterns: ${JSON.stringify(patterns)}
      Identify common patterns, correlations between fields, and user preferences.
      Return a JSON object with pattern analysis and rules for future predictions.
    `;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error('Error analyzing patterns with Gemini:', error);
    return {};
  }
}

function extractUrlPattern(url) {
  // Extract domain and path pattern, ignoring specific IDs/parameters
  const urlObj = new URL(url);
  return `${urlObj.hostname}${urlObj.pathname.replace(/\/[0-9]+/g, '/:id')}`;
}
