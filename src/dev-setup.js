// Development utility to set API key from .env file
// This is for development only - users should use the settings UI

async function setupDevApiKey() {
  // Read API key from environment or use fallback
  const API_KEY = 'AIzaSyDeGfKZAnV9AsKWzusYtzq6Pyu58GxV7gg'; // From your .env file
  
  try {
    // Check if API key is already set
    const result = await chrome.storage.local.get(['API_KEY']);
    
    if (!result.API_KEY) {
      // Set the API key from .env for development
      await chrome.storage.local.set({ API_KEY: API_KEY });
      console.log('✅ Development API key set from environment');
    } else {
      console.log('ℹ️ API key already configured:', result.API_KEY.substring(0, 10) + '...');
    }
  } catch (error) {
    console.error('❌ Error setting up development API key:', error);
  }
}

// Auto-run on development extension load
if (typeof chrome !== 'undefined' && chrome.storage) {
  setupDevApiKey();
}
