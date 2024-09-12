/* global chrome */

let projectNameDiv = document.getElementById("projectNameDiv");
let linkToTarjim = document.getElementById('linkToTarjim');
let refreshCacheButton = document.getElementById('refreshCacheButton');
let refreshCacheMessage = document.getElementById('refreshCacheMessage');
let loader = document.getElementById('loader');
let content = document.getElementById('content');

async function getCurrentTab() {
  let queryOptions = { active: true, currentWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

window.addEventListener('load', async (event) => {
  content.classList.add('d-none');
  loader.classList.remove('d-none');

  // Get current tab location
  let tab = await getCurrentTab(); 

  let url = tab.url;
  url = new URL(url);
  let host = url.host;

  // host = host.split('.');
  // Get project id from tarjim
  let projectId;
  let updateCacheEndpoint;
  await fetch(`https://app.tarjim.io/api/v1/projects/getProjectIdFromDomain/${host}`)
    .then(res => res.json())
    .then(response => {
      if (response.status === 'success') {
        projectId = response.result.data.project_id;
        updateCacheEndpoint = response.result.data.update_cache_url;
        //return { id: projectId, name: host, updateCacheEndpoint: updateCacheEndpoint };
        chrome.storage.sync.set({ projectId: projectId, projectName: host, updateCacheEndpoint: updateCacheEndpoint });
      }
      else {
        //return {id: null, name: 'No tarjim project found', updateCacheEndpoint: null}
        chrome.storage.sync.set({ projectId: null, projectName: 'No tarjim project found', updateCacheEndpoint: null});
      }
    })

  content.classList.remove('d-none');
  loader.classList.add('d-none');


  chrome.storage.sync.get('projectId', async (storage) => {
    if (storage.projectId != null) {
      linkToTarjim.setAttribute('href', `https://app.tarjim.io/translationkeys/index/${storage.projectId}`);
      // Show show or hide key depending on highlight state
      chrome.storage.sync.get('nodesHighlighted', (storage) => {
        if (storage.nodesHighlighted === true) {
          getTarjimNodes.style = "display: none;";
          clearTarjimNodes.style = "display: block;";
        }
        else {
          getTarjimNodes.style = "display: block;";
          clearTarjimNodes.style = "display: none;";
        }
      })

      // Highlight nodes on popup open
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: highlightTarjimNodes,
      });
    }
    else {
      return;
    }
  });

  chrome.storage.sync.get('updateCacheEndpoint', (storage) => {
    if (storage.updateCacheEndpoint != null) {
      //refreshCacheButton.setAttribute('href', storage.updateCacheEndpoint);
    }
    else {
      refreshCacheButton.style = "display: none;";
    }
  })
});


chrome.storage.sync.get('projectName', (storage) => {
  let projectName = storage.projectName;
  if (projectName === 'No tarjim project found') {
    projectNameDiv.innerHTML = projectName;
    // Hide both buttons
    getTarjimNodes.style = "display: none;";
    clearTarjimNodes.style = "display: none";
  }
  else {
    chrome.storage.sync.get('projectId', (storage) => {
      projectNameDiv.innerHTML ='Project: ' +  projectName + ' (id: ' + storage.projectId + ')';
    })
  }
})

let getTarjimNodes = document.getElementById("getTarjimNodes");

getTarjimNodes.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: highlightTarjimNodes,
  });
});

async function highlightTarjimNodes() {
  let assignEventHandler = function (projectId) {
    // Highlight tarjim values 
    // Add event listener to nodes
    let nodes = document.querySelectorAll('[data-tid]');

    let style = `
        .tarjim-extension-injected-subtext:hover {
          background-color: rgb(245, 180, 180);
          color: #2E3193;
          border-radius: .25rem;
          cursor: pointer;
        }
    `;

    let styleNode = document.createElement('style');
    styleNode.id = 'tarjim-extension-injected-style-tag';
    styleNode.innerHTML = style;
    document.head.appendChild(styleNode);

    nodes.forEach((node, index) => {
      let tarjimId = node.getAttribute("data-tid");
      let subtextId = `tarjim-extension-subtext-id-${tarjimId}-${index}`;
      let subtext = document.getElementById(subtextId);
      if (subtext == null) {
        // Insert tarjim id
        subtext = document.createElement("div");
        subtext.innerHTML = `edit in tarjim tid: ${tarjimId}`;
        subtext.id = `tarjim-extension-subtext-id-${tarjimId}-${index}`;
        subtext.style = `
          display: flex;
          font-size: 0.7rem;
          flex-flow: column;
          margin-top: -4px;
          color: darkgrey;
          font-weight: normal;
          text-transform: lowercase;
          width: fit-content;
          margin: auto;
          padding: 5px;
        `;
        subtext.classList.add("tarjim-extension-injected-subtext");
        node.parentNode.insertBefore(subtext, node.nextSibling)

        // Hightlight span
        node.style = `
          border-left: 4px dashed rgb(236, 30, 73);
        `;

        // Add event listener
        subtext.addEventListener("click", function _clickListener(e) {
          // Disable default buttons/clicks
          e.preventDefault();
          // Open tarjim edit page
          window.open(`https://app.tarjim.io/translationvalues/edit/${projectId}/${tarjimId}?ext=1`, "extension_popup", "width=600,height=700,status=no,scrollbars=yes,resizable=yes");
          e.stopPropagation();
          return false;
        });
      }
    })
    chrome.storage.sync.set({ nodesHighlighted: true });
  }

  chrome.storage.sync.get('projectId', async (storage) => {
    let projectId = storage.projectId;
    // Fallback if project id wasnt set properly
    if (projectId === null) {
      let location = window.location.host;
      location = location.split('.');
      let domain = location.slice(-2) 
      domain = domain.join('.');
      let projectId 
      await fetch(`https://app.tarjim.io/projects/project_id_from_domain/${domain}`)
        .then(res => res.json())
        .then(response => {
          projectId = response.project_id;
          assignEventHandler(projectId);
        })
    }
    else {
      let projectNameDiv = document.getElementById("project-name");
      assignEventHandler(projectId);
    }
  });
}


let clearTarjimNodes = document.getElementById("clearTarjimNodes");

clearTarjimNodes.addEventListener("click", async() => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: clearTarjimNodesHighlight,
  });
});

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

// Listen to highlight state change
chrome.storage.sync.onChanged.addListener(() => {
  chrome.storage.sync.get('nodesHighlighted', (storage) => {
    if (storage.nodesHighlighted === true) {
      getTarjimNodes.style = "display: none;";
      clearTarjimNodes.style = "display: block;";
    }
    else {
      getTarjimNodes.style = "display: block;";
      clearTarjimNodes.style = "display: none;";
    }
  })

  chrome.storage.sync.get('projectName', (storage) => {
    let projectName = storage.projectName;
    if (projectName === 'No tarjim project found') {
      projectNameDiv.innerHTML = projectName;
      // Hide both buttons
      getTarjimNodes.style = "display: none;";
      clearTarjimNodes.style = "display: none";
    }
    else {
      chrome.storage.sync.get('projectId', (storage) => {
        projectNameDiv.innerHTML ='Project: ' +  projectName + ' (id: ' + storage.projectId + ')';
      })
    }
  })
})

/**
 *
 */
refreshCacheButton.addEventListener('click', async() => {
  content.classList.add('d-none');
  loader.classList.remove('d-none');

  var updateEndpoint;
  await chrome.storage.sync.get('updateCacheEndpoint', async (storage) => {
    await fetch(storage.updateCacheEndpoint)
      .then(res => res.json())
      .then(response => {
        if (response.status === 'success') {
          refreshCacheMessage.innerHTML = 'Cache updated, refresh the page to see the changes'
        }
        else {
          refreshCacheMessage.innerHTML = 'Cache update failed, check the update cache url in tarjim environments'
        }
        content.classList.remove('d-none');
        loader.classList.add('d-none');
      })
      .catch(err => {
        refreshCacheMessage.innerHTML = 'Cache update failed, check the update cache url in tarjim environments'
        content.classList.remove('d-none');
        loader.classList.add('d-none');
      })
  })
})
