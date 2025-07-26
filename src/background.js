// Background service worker for AI form processing
const GEMINI_API_KEY = 'AIzaSyDeGfKZAnV9AsKWzusYtzq6Pyu58GxV7gg'; // Replace with your API key
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';

// Store form submission patterns
let formPatterns = {};

// Listen for form submissions from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'formSubmitted') {
    learnFromFormSubmission(request.formData, request.url);
  } else if (request.action === 'requestFormPrediction') {
    predictFormValues(request.formFields, request.url)
      .then(predictions => sendResponse(predictions));
    return true; // Required for async response
  }
});

async function learnFromFormSubmission(formData, url) {
  try {
    const urlPattern = extractUrlPattern(url);
    if (!formPatterns[urlPattern]) {
      formPatterns[urlPattern] = [];
    }
    formPatterns[urlPattern].push(formData);
    
    // Store patterns in Chrome storage
    await chrome.storage.sync.set({ formPatterns });

    // Use Gemini to analyze patterns
    const analysis = await analyzeWithGemini(formPatterns[urlPattern]);
    await chrome.storage.sync.set({ 
      aiPatterns: {
        ...await chrome.storage.sync.get('aiPatterns'),
        [urlPattern]: analysis
      }
    });
  } catch (error) {
    console.error('Error learning from form submission:', error);
  }
}

async function predictFormValues(formFields, url) {
  try {
    const urlPattern = extractUrlPattern(url);
    const { aiPatterns } = await chrome.storage.sync.get('aiPatterns');
    const urlPatterns = aiPatterns?.[urlPattern] || {};

    const prompt = `
      Based on these form fields: ${JSON.stringify(formFields)}
      And these learned patterns: ${JSON.stringify(urlPatterns)}
      Predict appropriate values for each field.
      Return only a JSON object mapping field names to predicted values.
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
