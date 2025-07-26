document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');

  function showStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + (isError ? 'error' : 'success');
    setTimeout(() => {
      statusEl.className = 'status';
    }, 3000);
  }

  // Helper function to inject content script if needed
  async function ensureContentScriptLoaded(tabId) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // If content script isn't loaded, inject it
      console.log('Content script not found, injecting...');
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    }
  }

  // Read page button click handler
  document.getElementById('readPage').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('❌ No active tab found', true);
        return;
      }

      // Ensure we can inject into this tab
      if (!tab.url.startsWith('http')) {
        showStatus('❌ Cannot access this page type', true);
        return;
      }

      // Make sure content script is loaded
      await ensureContentScriptLoaded(tab.id);

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { action: 'readPage' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          showStatus(`❌ Error: ${chrome.runtime.lastError.message}`, true);
          return;
        }
        if (response && response.success) {
          showStatus('✅ Page analyzed successfully');
        } else {
          showStatus('❌ No forms found on page', true);
        }
      });
    } catch (error) {
      console.error('Error in readPage:', error);
      showStatus(`❌ Error: ${error.message}`, true);
    }
  });

  // Fill form button click handler
  document.getElementById('fillForm').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('❌ No active tab found', true);
        return;
      }

      // Ensure we can inject into this tab
      if (!tab.url.startsWith('http')) {
        showStatus('❌ Cannot access this page type', true);
        return;
      }

      // Make sure content script is loaded
      await ensureContentScriptLoaded(tab.id);

      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { action: 'fillForm' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          showStatus(`❌ Error: ${chrome.runtime.lastError.message}`, true);
          return;
        }
        if (response && response.success) {
          showStatus('✅ Forms filled successfully');
        } else {
          showStatus('❌ No saved data to fill forms', true);
        }
      });
    } catch (error) {
      console.error('Error in fillForm:', error);
      showStatus(`❌ Error: ${error.message}`, true);
    }
  });
});
