function findNearbyHeadings(element) {
  const headings = [];
  let current = element;
  const maxDistance = 500; // pixels

  // Get element position
  const elementRect = element.getBoundingClientRect();

  // Look for headings in the document
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    const headingRect = heading.getBoundingClientRect();
    
    // Calculate distance between element and heading
    const distance = Math.abs(elementRect.top - headingRect.bottom);
    
    if (distance < maxDistance) {
      // Check if heading is above or in the same container as the element
      let isRelevant = false;
      let parent = element.parentElement;
      
      while (parent && parent !== document.body) {
        if (parent.contains(heading)) {
          isRelevant = true;
          break;
        }
        parent = parent.parentElement;
      }

      if (isRelevant) {
        headings.push({
          element: heading,
          distance: distance,
          text: heading.textContent.trim()
        });
      }
    }
  });

  // Sort by distance and get closest 2
  return headings
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2)
    .map(h => h.element);
}

function getPrecedingTextNode(element) {
  const range = 100; // characters to look for
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node = element;
  let precedingText = '';
  
  while (node && precedingText.length < range) {
    // Get previous sibling or parent's previous sibling
    let previous = node.previousSibling;
    while (previous) {
      if (previous.nodeType === 3 && previous.textContent.trim()) {
        precedingText = previous.textContent.trim() + ' ' + precedingText;
      }
      previous = previous.previousSibling;
    }
    node = node.parentElement;
    if (node && (node.tagName === 'FORM' || node.tagName === 'BODY')) break;
  }

  return precedingText.slice(-range).trim();
}

function findTooltipText(element) {
  const tooltipSelectors = [
    '[role="tooltip"]',
    '.tooltip',
    '.help-text',
    '.hint',
    '.description',
    '[aria-describedby]',
    '.form-text',
    '.field-help'
  ];

  // Check element's own tooltip attributes
  let tooltipText = element.getAttribute('data-tooltip') ||
                   element.getAttribute('aria-description') ||
                   element.getAttribute('title');

  if (tooltipText) return tooltipText;

  // Check for aria-describedby
  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const descElement = document.getElementById(describedBy);
    if (descElement) {
      return descElement.textContent.trim();
    }
  }

  // Look for tooltip elements nearby
  const parent = element.closest('div, form, fieldset') || element.parentElement;
  if (parent) {
    for (const selector of tooltipSelectors) {
      const tooltipElement = parent.querySelector(selector);
      if (tooltipElement && tooltipElement !== element) {
        return tooltipElement.textContent.trim();
      }
    }
  }

  return '';
}

function getNearbyDescriptiveElements(element) {
  const descriptive = [];
  const maxElements = 3;
  const container = element.closest('div, form, fieldset') || element.parentElement;
  
  if (container) {
    // Get all text-containing elements
    const textElements = Array.from(container.querySelectorAll('*')).filter(el => {
      if (el === element) return false;
      if (el.matches('input, select, textarea, button')) return false;
      
      const text = el.textContent.trim();
      return text.length > 0 && text.length < 100; // Avoid very long text blocks
    });

    // Sort by distance to our element
    const elementRect = element.getBoundingClientRect();
    textElements.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      const aDist = Math.abs(elementRect.top - aRect.top);
      const bDist = Math.abs(elementRect.top - bRect.top);
      return aDist - bDist;
    });

    // Take the closest elements
    descriptive.push(...textElements.slice(0, maxElements));
  }

  return descriptive;
}

// Update the background script with improved analysis
function analyzeFieldContext(fieldInfo) {
  const contextScore = {};
  
  // Score each context clue
  fieldInfo.contextualInfo.contextClues.forEach(clue => {
    let score = 0;
    switch (clue.type) {
      case 'explicit_label':
        score = 1.0;
        break;
      case 'aria':
        score = 0.9;
        break;
      case 'heading':
        score = 0.7;
        break;
      case 'preceding_text':
        score = 0.6;
        break;
      case 'tooltip':
        score = 0.5;
        break;
      case 'nearby_element':
        score = 0.4;
        break;
      case 'placeholder':
        score = 0.3;
        break;
    }
    
    contextScore[clue.text] = score;
  });

  return {
    fieldInfo,
    contextScore,
    bestGuess: Object.entries(contextScore)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  };
}
