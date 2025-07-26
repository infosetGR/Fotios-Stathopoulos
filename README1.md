# AI Form Filler - Multi-Agent Chrome Extension

An intelligent Chrome extension powered by a **multi-agent architecture** that automatically analyzes and fills web forms using AI-powered field recognition and a knowledge base built from your uploaded documents.

## 🤖 Multi-Agent Architecture

This extension employs **four specialized autonomous agents** that collaborate to provide intelligent form filling:

- **🧠 Gemini Agent**: Makes autonomous decisions for intelligent field value generation
- **🔍 Embedding Agent**: Independently manages semantic search and vector operations  
- **📄 File Processing Agent**: Autonomously processes documents and builds knowledge base
- **🎯 UI Feedback Agent**: Intelligently provides real-time user feedback and status updates

## 🌟 Features

### Core Functionality
- **Multi-Agent AI Analysis**: Four specialized agents collaborate to detect and analyze form fields using contextual information
- **Autonomous Field Recognition**: Agents use multiple strategies to independently identify field types and purposes
- **Intelligent Knowledge Base**: File Processing Agent creates a searchable knowledge base from your uploaded documents
- **Collaborative Semantic Matching**: Embedding Agent and Gemini Agent work together to match form fields with relevant information

### Supported Field Types
- Text inputs (name, address, etc.)
- Email addresses
- Phone numbers
- URLs/websites
- Dates
- Numbers
- Checkboxes and dropdowns

### File Upload Support
- **Text files** (.txt, .md)
- **JSON files** (.json)
- **CSV files** (.csv)
- **Structured data** with automatic chunking and embedding

## � API Configuration

### Required API Key
This extension requires a Google Generative AI API key for embedding generation and AI-powered suggestions.

1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Replace the `API_KEY` in `background.js` with your actual key
3. Ensure your API key has access to:
   - `embedding-001` model for embeddings
   - `gemini-pro` model for AI suggestions

### Troubleshooting API Issues

#### 404 Errors
- **Issue**: "API error: 404" when uploading files
- **Solution**: Ensure you're using the correct Google Generative AI API key
- **Check**: API endpoint format and request structure

#### Rate Limiting
- **Issue**: "API error: 429" - too many requests
- **Solution**: The extension automatically retries with exponential backoff
- **Prevention**: Small delays (500ms) are added between embedding requests

#### Authentication Issues
- **Issue**: "API error: 403" - forbidden
- **Solution**: Verify your API key is valid and has proper permissions
- **Check**: API key restrictions and quotas in Google AI Studio

### API Endpoints Used
- **Embeddings**: `https://generativelanguage.googleapis.com/v1/models/embedding-001:embedContent`
- **AI Suggestions**: `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent`

## �🚀 Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select this directory
4. The extension icon should appear in your Chrome toolbar

## 📋 Usage

### Setting Up Your Knowledge Base
1. Click the extension icon to open the popup
2. Use the file upload section to upload documents containing your personal information
3. Supported formats: TXT, JSON, CSV, MD files
4. **File Processing Agent** will automatically analyze and chunk your documents
5. **Embedding Agent** will generate semantic vectors for intelligent search
6. **NEW**: View detailed embedding statistics (files count, chunks count)
7. **NEW**: Use the "📚🗑️ Clear Library" button to remove all uploaded files and embeddings

### Filling Forms
1. Navigate to any webpage with forms
2. Click "📄 Read Page" to activate **multi-agent form analysis**
3. Click "🤖 Fill Form" to trigger **collaborative form filling**
4. **Embedding Agent** searches knowledge base while **Gemini Agent** generates contextual values
5. **UI Feedback Agent** provides real-time status updates during the process

### Testing the Extension
1. **Knowledge Base Test**: Open the included `test-form.html` file in Chrome
2. Upload the provided `sample-data.txt` file using the extension
3. Use the "Read Page" and "Fill Form" buttons to test knowledge-based filling

4. **AI Fallback Test**: Open `gemini-test-form.html` without uploading any files
5. The extension will use Gemini AI to generate intelligent form values
6. Check console logs to see the source of each suggestion (📚 Knowledge Base, 🤖 AI Generated, 🔧 Fallback)

## 🧠 Multi-Agent Intelligence System

### Autonomous Agent Collaboration
- **Form Analysis**: Content scripts work with all agents to analyze form structure and field context
- **Context Extraction**: Agents collaboratively extract meaningful field labels from multiple sources (labels, placeholders, ARIA attributes, etc.)
- **AI-Powered Processing**: Gemini Agent and Embedding Agent leverage Google's Generative AI models

### Knowledge Base Intelligence
- **File Processing Agent**: Autonomously splits uploaded documents into optimal semantic chunks
- **Embedding Agent**: Independently generates embeddings for each chunk using Google's embedding API
- **Local Storage Management**: Agents collaboratively store embeddings locally for fast similarity search

### Collaborative Form Filling
- **Context-Aware Search**: Embedding Agent creates intelligent search queries based on field context
- **Semantic Matching**: Autonomous similarity search finds relevant content from your knowledge base
- **Intelligent Fallback**: **NEW** - Gemini Agent provides AI fallback when no relevant data is found
- **Type-Specific Extraction**: Agents extract relevant values based on field type (email, phone, etc.)
- **Adaptive Learning**: All agents continuously improve through user interaction patterns

## 🔧 Configuration

### API Key Setup
Update the `API_KEY` in `background.js` with your Google Generative AI API key:
```javascript
const API_KEY = 'your-google-ai-api-key-here';
```

### Storage
- **Agent Coordination Data**: Chrome sync/local storage for inter-agent communication
- **Knowledge Base**: Chrome local storage managed by File Processing Agent (higher capacity)  
- **Embeddings**: Embedding Agent manages vector storage and retrieval
- **File Metadata**: File Processing Agent handles document relationships and timestamps

## 🛡️ Agent Security & Privacy

- **Local Data Processing**: All agents process data locally in Chrome's secure storage environment
- **Minimal External Communication**: Only Gemini and Embedding agents communicate with Google APIs for AI processing
- **Agent Isolation**: Each agent operates within defined security boundaries
- **User Control**: File Processing Agent allows complete control over uploaded documents with easy deletion
- **Secure API Integration**: Embedding and Gemini agents use secure, authenticated connections to Google's AI services

## 📁 Multi-Agent Project Structure

```
├── manifest.json          # Extension manifest with agent permissions
├── popup.html/js          # Extension popup interface
├── content.js             # Content script for form interaction
├── background.js          # Agent coordination and service worker
├── services/              # Autonomous Agent Layer
│   ├── embedding-service.js   # 🔍 Embedding Agent (semantic search)
│   ├── file-service.js       # 📄 File Processing Agent (knowledge base)
│   ├── gemini-service.js     # 🧠 Gemini Agent (AI generation)
│   └── badge-service.js      # 🎯 UI Feedback Agent (user interface)
├── test-form.html         # Test page for multi-agent development
└── sample-data.txt        # Sample personal data for agent testing
```

## 🧪 Development & Testing

### Test Files Included
- `test-form.html`: Comprehensive test form with various field types (tests knowledge base)
- `gemini-test-form.html`: Creative form to test Gemini AI fallback functionality
- `sample-data.txt`: Sample personal information for testing

### Console Logging
The multi-agent system provides detailed console logging. Open Chrome DevTools (F12) to see:
- **Agent Coordination**: Inter-agent communication and collaboration patterns
- **File Processing Agent**: Document analysis, chunking strategies, and embedding statistics  
- **Embedding Agent**: Vector generation, semantic search, and similarity calculations
- **Gemini Agent**: AI decision-making, prompt engineering, and response validation
- **UI Feedback Agent**: Status updates, visual feedback timing, and user experience optimization
- **Knowledge Base Stats**: Total files and embeddings managed by agents
- Form analysis progress and field recognition details

### Debugging Multi-Agent Behavior
- Use "📄 Read Page" to observe agent collaboration during form analysis
- Check storage in DevTools > Application > Storage to see agent-managed data
- Monitor network requests to see Gemini and Embedding agent API calls
- Console logs show agent decision-making processes and coordination

## 🔄 Recent Updates

### Version 2.1 Multi-Agent Features
- **NEW**: Multi-agent architecture with four specialized autonomous agents
- **NEW**: Agent coordination and collaborative decision-making
- **NEW**: Clear Library button with confirmation dialog (File Processing Agent)
- **NEW**: Enhanced embedding process logging with detailed agent statistics
- **NEW**: Knowledge base stats display managed by multiple agents
- **NEW**: Source file attribution for form field suggestions (agent collaboration)
- **NEW**: Inter-agent communication and state synchronization
- Added file upload functionality with drag & drop support (File Processing Agent)
- Implemented AI-powered knowledge base using document embeddings (Embedding Agent)
- Enhanced form field recognition with multi-agent detection strategies
- Added semantic search with collaborative agent intelligence
- Improved error handling and user feedback through UI Feedback Agent

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test your changes with the provided test forms
4. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.
