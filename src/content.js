// Listen for messages from the popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ success: true });
    return true;
  }
  
  console.group('🎯 Action Received:', request.action);
  
  switch (request.action) {
    case 'readPage':
      console.log('📄 Starting page analysis...');
      showWorkingIndicator('Analyzing page...');
      analyzePage().then(success => {
        hideWorkingIndicator();
        sendResponse({ success, message: success ? 'Page analyzed successfully' : 'No forms found' });
      });
      break;

    case 'fillForm':
      console.log('🤖 Starting form fill process...');
      console.log('📝 Custom instructions:', request.customInstructions || 'None');
      showWorkingIndicator('Filling forms...');
      
      // Start monitoring form submissions when user wants to fill forms
      monitorFormSubmissions();
      
      fillFormsOnPage(request.customInstructions).then(success => {
        hideWorkingIndicator();
        sendResponse({ success, message: success ? 'Forms filled successfully' : 'Failed to fill forms' });
      });
      break;
  }
  console.groupEnd();
  return true; // Keep the message channel open for async response
});

async function analyzePage() {
  // Clear the cache before analyzing the page
  try {
    await chrome.storage.sync.remove('formFields');
    await chrome.storage.local.remove('formFields');
    console.log('🧹 Cleared form fields cache');
  } catch (error) {
    console.warn('⚠️ Failed to clear cache:', error);
  }

  const forms = findForms();
  if (forms.length === 0) {
    console.log('⚠️ No forms found on page');
    return false;
  }

  console.log(`📝 Found ${forms.length} forms`);
  const formFields = await analyzeFormFields(forms);
  
  if (Object.keys(formFields).length > 0) {
    // Compress the field data by removing unnecessary information
    const compressedFields = {};
    for (const [key, field] of Object.entries(formFields)) {
      // Get all attributes needed for selection
      const elementSelectors = {
        id: field.id || '',
        name: field.name || '',
        className: field.className || '',
        tagName: field.type === 'textarea' ? 'textarea' : 'input',
        type: field.type || '',
        ariaLabelledBy: field.attributes?.['aria-labelledby'] || '',
        ariaLabel: field.attributes?.['aria-label'] || '',
        cssPath: field.selectors?.cssPath || '',
        jsname: field.attributes?.['jsname'] || '',
        dataTestid: field.attributes?.['data-testid'] || ''
      };

      compressedFields[key] = {
        type: field.type,
        name: field.name,
        id: field.id,
        required: field.required,
        title: field.title,
        selectors: elementSelectors,
        contextualInfo: {
          label: field.contextualInfo.label,
          ariaLabel: field.contextualInfo.ariaLabel,
          headings: field.contextualInfo.headings.slice(0, 1),
          contextClues: field.contextualInfo.contextClues
            .filter(clue => clue.type === 'explicit_label' || clue.type === 'aria')
            .slice(0, 2)
        }
      };
    }

    try {
      let savedToSync = false;
      // Try sync storage first for small forms (under 8KB)
      const fieldsString = JSON.stringify(compressedFields);
      if (fieldsString.length < 8000) { // Leave some buffer for storage overhead
        try {
          await chrome.storage.sync.set({ formFields: compressedFields });
          console.log('💾 Saved form fields to sync storage');
          savedToSync = true;
        } catch (syncError) {
          console.warn('⚠️ Sync storage failed:', syncError);
        }
      } else {
        console.log('ℹ️ Form data too large for sync storage, using local storage only');
      }

      // Always save to local storage (has much higher limits)
      try {
        await chrome.storage.local.set({ formFields: compressedFields });
        console.log('💾 Saved form fields to local storage');
      } catch (localError) {
        console.error('❌ Local storage failed:', localError);
        if (!savedToSync) {
          throw new Error('Failed to save to both sync and local storage');
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to save form fields:', error);
      return false;
    }
  }
  return false;
}

function findForms() {
  const forms = [];
  
  // Traditional forms
  forms.push(...document.querySelectorAll('form'));
  
  // Div containers that might be forms
  const possibleForms = document.querySelectorAll('div, section');
  for (const container of possibleForms) {
    const inputs = container.querySelectorAll('input, select, textarea');
    if (inputs.length >= 2) { // If container has multiple form elements
      forms.push(container);
    }
  }

  return forms;
}

async function analyzeFormFields(forms) {
  const fields = {};
  
  for (const form of forms) {
    console.group(`Analyzing form: ${getFormIdentifier(form)}`);
    
    // Find all interactive elements
    const elements = form.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    
    for (const element of elements) {
      // Skip hidden or submit elements
      if (shouldSkipElement(element)) continue;

      const fieldInfo = extractFieldInfo(element);
      const meaningfulTitle = findMeaningfulTitle(fieldInfo.contextualInfo, element);
      
      if (meaningfulTitle) {
        // Store field information only if we found a meaningful title
        const fieldKey = fieldInfo.id || fieldInfo.name || `field_${Object.keys(fields).length}`;
        
        // Get all possible selectors for this element
        const selectors = {
          id: element.id || '',
          name: element.name || '',
          className: element.className || '',
          tagName: element.tagName.toLowerCase(),
          type: element.type || '',
          ariaLabelledBy: element.getAttribute('aria-labelledby') || '',
          // Google Forms specific
          jsname: element.getAttribute('jsname') || '',
          // Construct a unique CSS selector path
          cssPath: generateCssPath(element)
        };
        
        fields[fieldKey] = {
          ...fieldInfo,
          title: meaningfulTitle,
          selectors: selectors
        };
        
        console.log('✅ Field identified:', {
          elementId: fieldInfo.id || 'no-id',
          elementName: fieldInfo.name || 'no-name',
          type: fieldInfo.type,
          title: meaningfulTitle,
          source: meaningfulTitle.source,
          confidence: meaningfulTitle.confidence
        });
      } else {
        console.warn('⚠️ Skipping field - No meaningful title found:', {
          elementId: fieldInfo.id || 'no-id',
          elementName: fieldInfo.name || 'no-name',
          type: fieldInfo.type,
          availableContext: {
            label: fieldInfo.contextualInfo.label || 'none',
            ariaLabel: fieldInfo.contextualInfo.ariaLabel || 'none',
            headings: fieldInfo.contextualInfo.headings,
            placeholder: fieldInfo.placeholder || 'none'
          }
        });
      }
    }
    
    console.groupEnd();
  }
  
  return fields;
}

function findMeaningfulTitle(contextualInfo, element) {
  // Try to find the most meaningful title from available context
  // Return both the title and its source for debugging
  
  // 1. Check for aria-labelledby first (highest confidence as it's explicitly linked)
  const labelledByClue = contextualInfo.contextClues.find(clue => clue.type === 'aria_labelledby');
  if (labelledByClue) {
    return {
      text: labelledByClue.text,
      source: 'aria_labelledby',
      confidence: 1.0
    };
  }
  
  // New: Check for meaningful name/id attributes
  if (element) {
    // Check name attribute - often contains descriptive text
    const name = element.name;
    if (name && name.length > 3 && !/^field\d+$/.test(name)) {
      const formattedName = name
        .replace(/([A-Z])/g, ' $1') // Add spaces before capitals
        .replace(/[_-]/g, ' ')      // Replace underscores/hyphens with spaces
        .toLowerCase()
        .trim();
      if (formattedName.length > 3) {
        return {
          text: formattedName,
          source: 'name_attribute',
          confidence: 0.8
        };
      }
    }

    // Check id attribute - sometimes contains descriptive text
    const id = element.id;
    if (id && id.length > 3 && !/^input\d+$/.test(id)) {
      const formattedId = id
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .trim();
      if (formattedId.length > 3) {
        return {
          text: formattedId,
          source: 'id_attribute',
          confidence: 0.7
        };
      }
    }

    // Check placeholder - often contains good descriptive text
    const placeholder = element.placeholder;
    if (placeholder && placeholder.trim().length > 3) {
      return {
        text: placeholder.trim(),
        source: 'placeholder',
        confidence: 0.75
      };
    }
  }

  // 2. Check heading role (high confidence for Google Forms-like structures)
  const headingClue = contextualInfo.contextClues.find(clue => clue.type === 'heading_role');
  if (headingClue) {
    return {
      text: headingClue.text,
      source: 'heading_role',
      confidence: 0.95
    };
  }
  
  // 3. Check explicit label
  if (contextualInfo.label) {
    return {
      text: contextualInfo.label,
      source: 'explicit_label',
      confidence: 0.9
    };
  }
  
  // 4. Check ARIA label
  if (contextualInfo.ariaLabel) {
    return {
      text: contextualInfo.ariaLabel,
      source: 'aria_label',
      confidence: 0.85
    };
  }
  
  // 3. Check contextClues for most relevant ones
  const relevantClue = contextualInfo.contextClues.find(clue => 
    clue.type === 'preceding_text' || 
    clue.type === 'nearby_element' ||
    clue.type === 'tooltip'
  );
  
  if (relevantClue) {
    return {
      text: relevantClue.text,
      source: relevantClue.type,
      confidence: relevantClue.type === 'preceding_text' ? 0.8 : 0.7
    };
  }
  
  // 4. Check nearby headings
  if (contextualInfo.headings && contextualInfo.headings.length > 0) {
    return {
      text: contextualInfo.headings[0],
      source: 'nearby_heading',
      confidence: 0.6
    };
  }
  
  // No meaningful title found
  return null;
}


function getFormIdentifier(form) {
  return form.id || form.name || form.className || 'unnamed form';
}

function shouldSkipElement(element) {
  const skipTypes = ['hidden', 'submit', 'button', 'reset', 'image'];
  return (
    skipTypes.includes(element.type) ||
    element.style.display === 'none' ||
    element.style.visibility === 'hidden' ||
    element.hidden ||
    element.closest('[aria-hidden="true"]')
  );
}

function extractFieldInfo(element) {
  console.group('🔍 Extracting field info');
  const fieldInfo = {
    type: element.type || element.tagName.toLowerCase(),
    name: element.name || '',
    id: element.id || '',
    className: element.className || '',
    placeholder: element.placeholder || '',
    required: element.required || false,
    pattern: element.pattern || '',
    contextualInfo: findContextualInfo(element),
    options: element.tagName === 'SELECT' ? Array.from(element.options).map(opt => ({
      value: opt.value,
      text: opt.text
    })) : null,
    attributes: getRelevantAttributes(element)
  };
  
  console.log('Field info:', fieldInfo);
  console.groupEnd();
  return fieldInfo;
}

function findContextualInfo(element) {
  const info = {
    label: '',
    nearbyText: '',
    headings: [],
    ariaLabel: '',
    tooltips: '',
    contextClues: []
  };

  // 1. Check for aria-labelledby
  const labelledById = element.getAttribute('aria-labelledby');
  if (labelledById) {
    const labelIds = labelledById.split(' ');
    const labelTexts = labelIds
      .map(id => document.getElementById(id)?.textContent.trim())
      .filter(text => text);
    if (labelTexts.length > 0) {
      info.label = labelTexts.join(' ');
      info.contextClues.push({ type: 'aria_labelledby', text: info.label });
    }
  }

  // 2. Check for explicit label
  const labelElement = getExplicitLabel(element);
  if (labelElement && !info.label) {
    info.label = labelElement.textContent.trim();
    info.contextClues.push({ type: 'explicit_label', text: info.label });
  }

  // 3. Check for heading role with aria-level
  if (!info.label) {
    const headingElement = element.closest('[role="heading"]');
    if (headingElement) {
      const headingText = headingElement.querySelector('.M7eMe')?.textContent.trim() || // Google Forms specific
                         headingElement.textContent.trim();
      if (headingText) {
        info.label = headingText;
        info.contextClues.push({ type: 'heading_role', text: headingText });
      }
    }
  }

  // 4. Check ARIA attributes
  info.ariaLabel = element.getAttribute('aria-label') || 
                   element.getAttribute('title') || '';
  if (info.ariaLabel) {
    info.contextClues.push({ type: 'aria', text: info.ariaLabel });
  }

  // 3. Find nearby headings
  const headings = findNearbyHeadings(element);
  info.headings = headings.map(h => h.textContent.trim());
  headings.forEach(h => info.contextClues.push({ type: 'heading', text: h.textContent.trim() }));

  // 4. Get preceding text node content
  const precedingText = getPrecedingTextNode(element);
  if (precedingText) {
    info.contextClues.push({ type: 'preceding_text', text: precedingText });
  }

  // 5. Check for tooltips or help text
  const tooltip = findTooltipText(element);
  if (tooltip) {
    info.tooltips = tooltip;
    info.contextClues.push({ type: 'tooltip', text: tooltip });
  }

  // 6. Look for nearby elements with descriptive text
  const siblings = getNearbyDescriptiveElements(element);
  siblings.forEach(sibling => {
    info.contextClues.push({ type: 'nearby_element', text: sibling.textContent.trim() });
  });

  // 7. Check placeholder
  if (element.placeholder) {
    info.contextClues.push({ type: 'placeholder', text: element.placeholder });
  }

  return info;
}

function getExplicitLabel(element) {
  // First try for="id" label
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label;
  }

  // Then try parent label
  let parent = element.parentElement;
  while (parent && parent.tagName !== 'FORM') {
    if (parent.tagName === 'LABEL') return parent;
    parent = parent.parentElement;
  }

  return null;
}

function findNearbyHeadings(element) {
  const headings = [];
  let current = element;

  // Look up the DOM tree
  while (current && current.tagName !== 'BODY') {
    // Look at previous siblings
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.matches('h1, h2, h3, h4, h5, h6')) {
        headings.push(sibling);
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }

  return headings.slice(0, 2); // Return closest 2 headings
}

function getPrecedingTextNode(element) {
  let node = element;
  while (node) {
    let previous = node.previousSibling;
    while (previous) {
      if (previous.nodeType === 3 && previous.textContent.trim()) { // Text node
        return previous.textContent.trim();
      }
      previous = previous.previousSibling;
    }
    node = node.parentElement;
    if (node && node.tagName === 'FORM') break;
  }
  return '';
}

function findTooltipText(element) {
  // Check common tooltip attributes and related elements
  const tooltipText = element.getAttribute('data-tooltip') ||
                     element.getAttribute('aria-description') ||
                     element.getAttribute('title');
  
  // Look for nearby help text elements
  const helpElement = element.parentElement?.querySelector('.help-text, .tooltip, [role="tooltip"]');
  
  return tooltipText || (helpElement ? helpElement.textContent.trim() : '');
}

function getNearbyDescriptiveElements(element) {
  const descriptive = [];
  const parent = element.parentElement;
  
  if (parent) {
    // Get siblings with descriptive content
    const siblings = Array.from(parent.children);
    siblings.forEach(sibling => {
      if (sibling !== element && 
          !sibling.matches('input, select, textarea') && 
          sibling.textContent.trim()) {
        descriptive.push(sibling);
      }
    });
  }

  return descriptive;
}

function getRelevantAttributes(element) {
  const relevant = ['type', 'name', 'id', 'class', 'placeholder', 'aria-label', 'data-*'];
  const attributes = {};
  
  for (const attr of element.attributes) {
    if (relevant.some(r => attr.name.startsWith(r))) {
      attributes[attr.name] = attr.value;
    }
  }
  
  return attributes;
}

async function fillFormsOnPage(customInstructions = '') {
  console.group('🤖 Form Filling Process');
  
  try {
    // Log custom instructions if provided
    if (customInstructions && customInstructions.trim()) {
      console.log('📝 Using custom instructions:', customInstructions);
    }
    
    // Get knowledge base stats first
    const libraryStats = await getKnowledgeBaseStats();
    console.log(`📚 Knowledge Library Status: ${libraryStats.filesCount} files, ${libraryStats.chunksCount} chunks`);
    if (libraryStats.filesCount > 0) {
      console.log(`📋 Available files:`, libraryStats.fileNames.join(', '));
    }
    
    // Try to get stored field information from sync, then local storage
    let formFields;
    let syncData, localData;
    
    // First try sync storage
    try {
      syncData = await chrome.storage.sync.get('formFields');
      console.log('📦 Sync storage data:', syncData);
      if (syncData.formFields) {
        formFields = syncData.formFields;
        console.log('✅ Found fields in sync storage');
      }
    } catch (syncError) {
      console.warn('⚠️ Failed to read from sync storage:', syncError);
    }

    // If no sync data, try local storage
    if (!formFields) {
      try {
        localData = await chrome.storage.local.get('formFields');
        console.log('📦 Local storage data:', localData);
        if (localData.formFields) {
          formFields = localData.formFields;
          console.log('✅ Found fields in local storage');
        }
      } catch (localError) {
        console.error('❌ Failed to read from local storage:', localError);
      }
    }

    if (!formFields) {
      console.warn('⚠️ No form fields data found. Run page analysis first.');
      return false;
    }

    let filledCount = 0;
    
    for (const [fieldKey, fieldInfo] of Object.entries(formFields)) {
      try {
        // Get intelligent suggestion from knowledge base
        const fieldTitle = fieldInfo.title.text;
        const suggestion = await getIntelligentSuggestion(fieldInfo, customInstructions);

        await fillField(fieldInfo, suggestion);
        
        // Enhanced logging with source information
        const sourceEmoji = {
          'knowledge_base': '📚',
          'gemini_ai': '🤖', 
          'fallback': '🔧'
        };
        const emoji = sourceEmoji[suggestion.source] || '❓';
        
        console.log(`✅ Field "${fieldTitle}" filled with: "${suggestion.value}" ${emoji} (${suggestion.source})`);
        if (suggestion.fileName && suggestion.fileName !== 'Unknown') {
          console.log(`   └─ Source: ${suggestion.fileName}`);
        }
        
        filledCount++;
      } catch (error) {
        console.error(`❌ Error filling field ${fieldKey}:`, error);
      }
    }

    console.log(`✅ Filled ${filledCount} fields`);
    return filledCount > 0;

  } catch (error) {
    console.error('❌ Form filling failed:', error);
    return false;
  } finally {
    console.groupEnd();
  }
}

async function getIntelligentSuggestion(fieldInfo, customInstructions = '') {
  console.group(`🧠 Getting intelligent suggestion for: ${fieldInfo.title?.text}`);
  
  try {
    // Create a search query from field context
    const searchQuery = createSearchQuery(fieldInfo);
    console.log('🔍 Search query:', searchQuery);
    
    // Search knowledge base via background script
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'searchKnowledge',
        query: searchQuery,
        fieldType: fieldInfo.type,
        fieldTitle: fieldInfo.title?.text,
        customInstructions: customInstructions
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('❌ Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        console.log('📨 Background response:', response);
        resolve(response);
      });
    });
    
    if (response && response.success && response.suggestions.length > 0) {
      console.log(`✅ Found ${response.suggestions.length} knowledge base matches`);
      
      // Use the best matching suggestion
      const bestMatch = response.suggestions[0];
      console.log('📝 Best match:', bestMatch);
      
      // Enhanced logging for knowledge base sources
      if (bestMatch.source === 'knowledge_base') {
        console.log(`   └─ Source file: ${bestMatch.fileName}`);
        console.log(`   └─ Similarity: ${(bestMatch.similarity * 100).toFixed(1)}%`);
        console.log(`   └─ Content preview: "${bestMatch.content.substring(0, 80)}..."`);
      }
      
      // Determine the source and confidence based on the suggestion origin
      let sourceInfo = {
        source: bestMatch.source || 'knowledge_base',
        fileName: bestMatch.fileName || 'Unknown',
        confidence: bestMatch.similarity || 0.5
      };
      
      // Handle Gemini AI generated suggestions
      if (bestMatch.source === 'gemini_ai') {
        sourceInfo = {
          source: 'gemini_ai',
          fileName: '🤖 AI Generated',
          confidence: 0.85  // High confidence for AI suggestions
        };
        console.log('🤖 Using Gemini AI generated suggestion');
      }
      
      return {
        value: bestMatch.extractedValue || bestMatch.content.substring(0, 100),
        ...sourceInfo
      };
    } else {
      console.log('🤖 No suggestions from background, generating fallback');
      return generateFallbackSuggestion(fieldInfo);
    }
    
  } catch (error) {
    console.error('❌ Error getting intelligent suggestion:', error);
    console.log('🔧 Falling back to simple suggestion due to error');
    return generateFallbackSuggestion(fieldInfo);
  } finally {
    console.groupEnd();
  }
}

function createSearchQuery(fieldInfo) {
  const title = fieldInfo.title?.text || '';
  const type = fieldInfo.type || '';
  const placeholder = fieldInfo.placeholder || '';
  
  // Combine available context to create a meaningful search query
  const queryParts = [title];
  
  if (placeholder && !title.includes(placeholder)) {
    queryParts.push(placeholder);
  }
  
  // Add type-specific context
  switch (type.toLowerCase()) {
    case 'email':
      queryParts.push('email address contact');
      break;
    case 'tel':
      queryParts.push('phone number telephone');
      break;
    case 'url':
      queryParts.push('website url link');
      break;
    case 'date':
      queryParts.push('date time');
      break;
    case 'number':
      queryParts.push('number value');
      break;
    default:
      // For text fields, use contextual clues
      if (fieldInfo.contextualInfo?.contextClues) {
        const relevantClues = fieldInfo.contextualInfo.contextClues
          .filter(clue => clue.type === 'explicit_label' || clue.type === 'aria')
          .map(clue => clue.text)
          .slice(0, 2);
        queryParts.push(...relevantClues);
      }
  }
  
  return queryParts.join(' ').trim();
}

function generateFallbackSuggestion(fieldInfo) {
  const fieldTitle = fieldInfo.title?.text || 'field';
  let value;

  // Generate fallback values based on field type
  switch(fieldInfo.type.toLowerCase()) {
    case 'checkbox':
      value = true;
      break;
    case 'number':
      value = '42';
      break;
    case 'email':
      value = `user@example.com`;
      break;
    case 'tel':
      value = '+1-555-0123';
      break;
    case 'url':
      value = `https://example.com`;
      break;
    case 'date':
      value = '2025-07-26';
      break;
    default:
      value = `Sample ${fieldTitle.toLowerCase()}`;
  }

    return {
      value: value,
      confidence: 0.3,
      source: 'fallback'
    };
}

async function getKnowledgeBaseStats() {
  try {
    const result = await chrome.storage.local.get(['uploadedFiles', 'knowledgeBase']);
    const files = result.uploadedFiles || [];
    const chunks = result.knowledgeBase || [];
    
    // Get unique file names from chunks (in case files metadata is missing)
    const fileNamesFromChunks = [...new Set(chunks.map(chunk => chunk.fileName))].filter(Boolean);
    const fileNames = files.length > 0 ? files.map(f => f.name) : fileNamesFromChunks;
    
    return {
      filesCount: Math.max(files.length, fileNamesFromChunks.length),
      chunksCount: chunks.length,
      fileNames: fileNames,
      totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0)
    };
  } catch (error) {
    console.error('Error getting knowledge base stats:', error);
    return { filesCount: 0, chunksCount: 0, fileNames: [], totalSize: 0 };
  }
}async function fillField(fieldInfo, suggestion) {
  // Try multiple strategies to find the element
  let element = findFieldElement(fieldInfo);

  if (!element) {
    console.warn('⚠️ Could not find element with primary selectors, trying alternative methods...');
    // Try one more time with a delay (sometimes fields are loaded dynamically)
    await new Promise(resolve => setTimeout(resolve, 500));
    element = findFieldElement(fieldInfo);
  }

  if (!element) {
    throw new Error(`Field element not found in DOM. Field info: ${JSON.stringify({
      id: fieldInfo.id,
      name: fieldInfo.name,
      type: fieldInfo.type,
      title: fieldInfo.title?.text
    })}`);
  }

  console.group(`📝 Filling field: ${fieldInfo.title?.text || fieldInfo.name || fieldInfo.id}`);
  console.log('Suggestion:', suggestion);

  try {
    await simulateHumanInput(element, suggestion.value);
    console.log('✅ Field filled successfully');
  } catch (error) {
    console.error('❌ Field fill failed:', error);
    throw error;
  } finally {
    console.groupEnd();
  }
}

function simulateHumanInput(element, value) {
  // Focus the element
  element.focus();

  if (element.tagName.toLowerCase() === 'select') {
    // Handle dropdowns
    element.value = value;
    triggerEvent(element, 'change');
  } else if (element.type === 'checkbox') {
    // Handle checkboxes
    element.checked = value === true;
    triggerEvent(element, 'change');
  } else {
    // Handle text inputs
    element.value = value;
    triggerEvent(element, 'input');
  }

  // Trigger events
  triggerEvent(element, 'change');
  triggerEvent(element, 'blur');
}

function triggerEvent(element, eventType) {
  const event = new Event(eventType, { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
}

function generateCssPath(element) {
  const path = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let selector = element.tagName.toLowerCase();
    if (element.id) {
      selector += `#${element.id}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = element;
      let nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName === element.tagName) nth++;
      }
      if (nth > 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    element = element.parentElement;
  }
  return path.join(' > ');
}

function findFieldElement(fieldInfo) {
  // Try all possible selectors in order of specificity
  let element = null;

  if (!fieldInfo.selectors) {
    console.warn('No selectors information available for field');
    return null;
  }

  const { selectors } = fieldInfo;
  console.group('🔍 Finding field element:', fieldInfo.title?.text);
  console.log('Available selectors:', selectors);

  // 1. Try ID (most specific)
  if (selectors.id) {
    element = document.getElementById(selectors.id);
    if (element) return element;
  }

  // 2. Try exact CSS path
  if (selectors.cssPath) {
    element = document.querySelector(selectors.cssPath);
    if (element) return element;
  }

  // 3. Try Google Forms specific selectors
  if (document.querySelector('.freebirdFormviewerViewItemsItemItem')) { // If we're in a Google Form
    // Try finding by aria-labelledby
    if (selectors.ariaLabelledBy) {
      const labelElement = document.getElementById(selectors.ariaLabelledBy.split(' ')[0]);
      if (labelElement) {
        const formItem = labelElement.closest('.freebirdFormviewerViewItemsItemItem');
        if (formItem) {
          element = formItem.querySelector('input, textarea, select');
          if (element) {
            console.log('✅ Found by Google Forms aria-labelledby');
            return element;
          }
        }
      }
    }

    // Try finding by class and title text
    if (fieldInfo.title?.text) {
      const formItems = document.querySelectorAll('.freebirdFormviewerViewItemsItemItem');
      for (const item of formItems) {
        if (item.textContent.includes(fieldInfo.title.text)) {
          element = item.querySelector('input, textarea, select');
          if (element) {
            console.log('✅ Found by Google Forms item text');
            return element;
          }
        }
      }
    }
  }

  // 4. Try name attribute
  if (selectors.name) {
    element = document.querySelector(`[name="${selectors.name}"]`);
    if (element) {
      console.log('✅ Found by name attribute');
      return element;
    }
  }

  // 5. Try className and type combination
  if (selectors.className && selectors.type) {
    const classNames = selectors.className.split(' ');
    for (const className of classNames) {
      if (className && className !== 'ng-pristine' && className !== 'ng-untouched') {
        element = document.querySelector(`.${className}[type="${selectors.type}"]`);
        if (element) return element;
      }
    }
  }

  // 5. Try finding by type and nearby text content
  if (fieldInfo.title?.text) {
    const escapedText = fieldInfo.title.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const elementsOfType = document.querySelectorAll(`input[type="${fieldInfo.type}"], textarea, select`);
    
    for (const el of elementsOfType) {
      // Check if the title text appears in nearby elements
      const container = el.closest('div, form, section');
      if (container?.textContent.includes(fieldInfo.title.text)) {
        element = el;
        break;
      }
    }
    if (element) return element;
  }

  // 6. Last resort: Try finding by similar attributes or placeholder
  if (fieldInfo.placeholder) {
    element = document.querySelector(`[placeholder="${fieldInfo.placeholder}"]`);
    if (element) {
      console.log('✅ Found by placeholder');
      return element;
    }
  }

  console.log('❌ Field not found with any selector');
  console.groupEnd();
  return null;
}

// Working indicator functions
function showWorkingIndicator(message = 'Working...') {
  // Remove existing indicator if present
  hideWorkingIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'ai-form-filler-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4285f4;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    ">
      <div style="
        width: 16px;
        height: 16px;
        border: 2px solid #fff;
        border-top: 2px solid transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      ${message}
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(indicator);
}

function hideWorkingIndicator() {
  const indicator = document.getElementById('ai-form-filler-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Form submission monitoring
let isMonitoringSubmissions = false;

function monitorFormSubmissions() {
  if (isMonitoringSubmissions) {
    console.log('🔍 Form submission monitoring already active');
    return;
  }
  
  console.log('🔍 Starting form submission monitoring');
  isMonitoringSubmissions = true;
  
  // Check if there are any forms on the page
  const forms = document.querySelectorAll('form');
  console.log(`📋 Found ${forms.length} forms on page:`, forms);
  
  // Also check for non-form containers that might act as forms
  const containers = document.querySelectorAll('div, section');
  const formLikeContainers = Array.from(containers).filter(container => {
    const inputs = container.querySelectorAll('input, select, textarea');
    return inputs.length >= 2;
  });
  console.log(`📦 Found ${formLikeContainers.length} form-like containers`);
  
  // Monitor form submissions
  document.addEventListener('submit', async (event) => {
    console.log('🚨 FORM SUBMIT EVENT DETECTED!');
    const form = event.target;
    
    console.group('📝 Form Submission Detected');
    console.log('Form element:', form);
    console.log('Form action:', form.action);
    console.log('Form method:', form.method);
    console.log('Event target:', event.target);
    
    // Don't prevent the form submission, just capture the data
    // event.preventDefault(); // Comment this out to let form submit normally
    
    // Show working indicator
    showWorkingIndicator('Processing form submission...');
    
    try {
      await processFormSubmission(form);
    } catch (error) {
      console.error('❌ Error processing form submission:', error);
    } finally {
      hideWorkingIndicator();
      console.groupEnd();
    }
  }, true); // Use capturing to ensure we catch the event first
  
  // Also monitor button clicks that might trigger submissions
  document.addEventListener('click', async (event) => {
    const target = event.target;
    
    // Check if it's a submit button
    if (target.type === 'submit' || 
        target.getAttribute('type') === 'submit' ||
        target.textContent.toLowerCase().includes('submit') ||
        target.textContent.toLowerCase().includes('send') ||
        target.className.includes('submit')) {
      
      console.log('🖱️ Submit button clicked:', target);
      
      // Find the parent form
      const form = target.closest('form') || target.closest('div, section');
      if (form) {
        console.log('📝 Found form for button:', form);
        
        // Delay to allow form to populate values
        setTimeout(async () => {
          console.group('📝 Button-triggered Form Processing');
          showWorkingIndicator('Processing form data...');
          
          try {
            await processFormSubmission(form);
          } catch (error) {
            console.error('❌ Error processing button-triggered form:', error);
          } finally {
            hideWorkingIndicator();
            console.groupEnd();
          }
        }, 500); // Give form time to process
      }
    }
  }, true);
  
  console.log('✅ Form submission monitoring initialized');
}

async function processFormSubmission(form) {
  console.log('🔄 Processing form submission for:', form);
  
  // Gather form data with enhanced field information
  const fieldValues = {};
  
  // Process each field in the form
  const formElements = form.querySelectorAll('input, select, textarea, [contenteditable="true"]');
  console.log(`🔍 Found ${formElements.length} form elements to process`);
  
  for (const element of formElements) {
    if (shouldSkipElement(element)) {
      console.log('⏭️ Skipping element:', element.type, element.name || element.id);
      continue;
    }
    
    console.log('🔍 Processing element:', element.type, element.name || element.id, element.value);
    
    const fieldInfo = extractFieldInfo(element);
    const meaningfulTitle = findMeaningfulTitle(fieldInfo.contextualInfo, element);
    
    if (meaningfulTitle) {
      // Get the actual submitted value
      let submittedValue = '';
      if (element.type === 'checkbox') {
        submittedValue = element.checked;
      } else if (element.type === 'radio') {
        submittedValue = element.checked ? element.value : '';
      } else {
        submittedValue = element.value || '';
      }
      
      // Include all fields, even empty ones for debugging
      const fieldKey = fieldInfo.id || fieldInfo.name || `field_${Object.keys(fieldValues).length}`;
      
      fieldValues[fieldKey] = {
        ...fieldInfo,
        title: meaningfulTitle,
        value: submittedValue,
        timestamp: Date.now()
      };
      
      console.log(`📊 Field "${meaningfulTitle.text}": "${submittedValue}" (${typeof submittedValue})`);
    } else {
      console.warn('⚠️ No meaningful title found for element:', element);
    }
  }
  
  console.log('📋 Complete form data:', fieldValues);
  
  // Send to background script for embedding processing
  if (Object.keys(fieldValues).length > 0) {
    console.log('🚀 Sending form data for embedding processing...');
    
    chrome.runtime.sendMessage({
      action: 'formSubmitted',
      formData: fieldValues,
      url: window.location.href,
      timestamp: Date.now()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Error sending form data:', chrome.runtime.lastError);
      } else {
        console.log('✅ Form data sent successfully:', response);
      }
    });
  } else {
    console.warn('⚠️ No form data found to process');
  }
}

// Initialize form submission monitoring when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', monitorFormSubmissions);
} else {
  monitorFormSubmissions();
}
