/* global chrome */

// Remove highlights and injected elements
function clearTarjimNodesHighlight() {
  // Remove injected style tag
  let styleNodeId = 'tarjim-extension-injected-style-tag';
  let styleNode = document.getElementById(styleNodeId);
  if (styleNode != null) {
    styleNode.remove();
  }

  // Remove injected subtext
  let subtextNodes = document.querySelectorAll('.tarjim-extension-injected-subtext')
  subtextNodes.forEach((node) => {
    node.remove(); 
  })

  // Remove injected style
  let nodes = document.querySelectorAll('[data-tid]');
  nodes.forEach((node, index) => {
    node.style = '';
  })
  chrome.storage.sync.set({ nodesHighlighted: false});
}

// Add listener for url changes
chrome.tabs.onUpdated.addListener((tabId) => {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: clearTarjimNodesHighlight,
  });
});
