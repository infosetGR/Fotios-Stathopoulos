// Simple test to validate the Google Generative AI Embedding API
// This is for debugging purposes only

const API_KEY = 'AIzaSyDeGfKZAnV9AsKWzusYtzq6Pyu58GxV7gg';
const EMBEDDING_API_URL = 'https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent';

async function testEmbeddingAPI() {
  console.log('🧪 Testing Embedding API...');
  
  const testText = 'This is a test text for embedding generation.';
  
  try {
    console.log('📤 Making request to:', EMBEDDING_API_URL);
    
    const response = await fetch(`${EMBEDDING_API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/embedding-001',
        content: {
          parts: [{
            text: testText
          }]
        }
      })
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('✅ API Response:', result);
    
    if (result.embedding && result.embedding.values) {
      console.log('✅ Embedding received! Dimension:', result.embedding.values.length);
      console.log('📊 First 5 values:', result.embedding.values.slice(0, 5));
    } else {
      console.error('❌ Unexpected response format');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Uncomment to run the test
// testEmbeddingAPI();
