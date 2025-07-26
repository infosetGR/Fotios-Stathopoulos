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
      analyzePage().then(success => {
        sendResponse({ success, message: success ? 'Page analyzed successfully' : 'No forms found' });
      });
      break;

    case 'fillForm':
      console.log('🤖 Starting form fill process...');
      fillFormsOnPage().then(success => {
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

async function fillFormsOnPage() {
  console.group('🤖 Form Filling Process');
  
  try {
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
        // Generate a test value based on the field's title and type
        const fieldTitle = fieldInfo.title.text;
        let testValue;

        // Handle different input types
        switch(fieldInfo.type.toLowerCase()) {
          case 'checkbox':
            testValue = true;
            break;
          case 'number':
            testValue = '42';
            break;
          case 'email':
            testValue = `test.${fieldTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;
            break;
          case 'tel':
            testValue = '+1-555-0123';
            break;
          case 'url':
            testValue = `https://example.com/${fieldTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            break;
          case 'date':
            testValue = '2025-07-26';
            break;
          default:
            // For text inputs and others, prefix with TEST: or UNKNOWN:
            const prefix = fieldInfo.contextualInfo.contextClues.length > 0 ? 'TEST:' : 'UNKNOWN:';
            testValue = `${prefix} ${fieldTitle}`;
        }

        const mockSuggestion = {
          value: testValue,
          confidence: 1.0
        };

        await fillField(fieldInfo, mockSuggestion);
        console.log(`✅ Field "${fieldTitle}" filled with:`, testValue);
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

async function fillField(fieldInfo, suggestion) {
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
