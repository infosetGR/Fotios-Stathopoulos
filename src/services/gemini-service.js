// Gemini AI Service for form value predictions
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
export class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async predictFieldValues(currentField, similarFields) {
    console.group('🤖 Predicting field values');
    try {
      const prompt = this.buildPredictionPrompt(currentField, similarFields);
      
      const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      const result = await response.json();
      const prediction = JSON.parse(result.candidates[0].content.parts[0].text);
      
      console.log('✅ Generated prediction:', prediction);
      return prediction;
    } catch (error) {
      console.error('❌ Prediction failed:', error);
      return null;
    } finally {
      console.groupEnd();
    }
  }

  async generateFieldSuggestion(prompt, fieldType) {
    console.group('🧠 Generating field suggestion with Gemini');
    try {
      console.log('📝 Field type:', fieldType);
      console.log('💭 Prompt length:', prompt.length);
      console.log('🌐 Making API request to:', GEMINI_API_URL);
      
      const requestBody = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };
      console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('📥 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error Response:', errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('📋 Full API Response:', JSON.stringify(result, null, 2));
      
      if (!result.candidates || result.candidates.length === 0) {
        console.error('❌ No candidates in response');
        throw new Error('No response from Gemini');
      }

      const rawSuggestion = result.candidates[0].content.parts[0].text;
      console.log('📝 Raw suggestion from Gemini:', rawSuggestion);
      
      // Clean and validate the suggestion
      const cleanSuggestion = this.validateAndCleanSuggestion(rawSuggestion, fieldType);
      console.log('✨ Cleaned suggestion:', cleanSuggestion);
      
      return cleanSuggestion;
      
    } catch (error) {
      console.error('❌ Gemini suggestion failed:', error);
      console.error('❌ Error stack:', error.stack);
      return null;
    } finally {
      console.groupEnd();
    }
  }

  validateAndCleanSuggestion(suggestion, fieldType) {
    // Remove any markdown formatting or extra text
    let cleaned = suggestion.replace(/```[^`]*```/g, '').trim();
    cleaned = cleaned.replace(/^\*\*.*\*\*:?\s*/gm, '').trim();
    cleaned = cleaned.replace(/^[-•]\s*/gm, '').trim();
    
    // Take only the first line if multiple lines returned
    cleaned = cleaned.split('\n')[0].trim();
    
    // Remove quotes if present
    cleaned = cleaned.replace(/^["']|["']$/g, '');
    
    // Field-specific validation and cleaning
    switch (fieldType?.toLowerCase()) {
      case 'email':
        // Ensure it looks like an email
        if (!cleaned.includes('@') || !cleaned.includes('.')) {
          return 'user@example.com';
        }
        break;
        
      case 'tel':
        // Clean phone number formatting
        cleaned = cleaned.replace(/[^\d\-\+\(\)\s]/g, '');
        if (cleaned.length < 10) {
          return '+1-555-123-4567';
        }
        break;
        
      case 'url':
        // Ensure it starts with http
        if (!cleaned.startsWith('http')) {
          cleaned = 'https://' + cleaned.replace(/^(www\.)?/, 'www.');
        }
        break;
        
      case 'number':
        // Extract only numbers
        const numberMatch = cleaned.match(/\d+(\.\d+)?/);
        return numberMatch ? numberMatch[0] : '42';
        
      case 'date':
        // Validate date format
        const dateMatch = cleaned.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          return dateMatch[0];
        }
        // Try other date formats
        const altDateMatch = cleaned.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
        if (altDateMatch) {
          const parts = altDateMatch[0].split('/');
          return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
        return '2025-07-26';
    }
    
    // General cleanup - limit length
    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 97) + '...';
    }
    
    return cleaned || 'Generated value';
  }

  buildPredictionPrompt(currentField, similarFields) {
    return `
      Given a form field with these characteristics:
      ${JSON.stringify(currentField, null, 2)}

      And these similar fields that were previously filled:
      ${JSON.stringify(similarFields, null, 2)}

      Analyze the patterns and predict the most appropriate value for this field.
      Consider:
      1. Field type and constraints
      2. Similar field values and their frequency
      3. Context and relationships between fields
      4. Required format if specified

      Return a JSON object with:
      {
        "predictedValue": "the predicted value",
        "confidence": 0.0-1.0,
        "reasoning": "brief explanation of the prediction"
      }
    `;
  }
}
