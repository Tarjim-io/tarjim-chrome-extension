/* global chrome */

let projectNameDiv = document.getElementById("projectNameDiv");
let linkToTarjim = document.getElementById("linkToTarjim");
let refreshCacheButton = document.getElementById("refreshCacheButton");
let refreshCacheMessage = document.getElementById("refreshCacheMessage");
let loader = document.getElementById("loader");
let content = document.getElementById("content");
let addHostContainer = document.getElementById("addHostContainer");
let addHostButton = document.getElementById("addHostButton");
const currentVersion = chrome.runtime.getManifest().version;


let projectSelection = document.getElementById("projectSelection");

let base_url = 'https://app.tarjim.io';
// let base_url = "http://localhost:8080";

async function getCurrentTab() {
  let queryOptions = { active: true, currentWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

async function fetchProjectData(host) {
  try {
    let response = await fetch(
      `${base_url}/api/v1/projects/getProjectIdFromDomain/${host}?version=${currentVersion}`
    );
    let data = await response.json();
    console.log("response data", data);

    return data;
  } catch (error) {
    console.error("Error fetching project data:", error);
    return null;
  }
}

async function fetchMappingKey(projectId) {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getNodesAndSendToBackend,
    args: [projectId, base_url],
  });
}

function getNodesAndSendToBackend(projectId, base_url) {
  let nodes = document.querySelectorAll("[data-tid]");

  let nodeData = Array.from(nodes).map((node) => ({
    tid: node.getAttribute("data-tid"),
    text: node.textContent.trim(),
  }));


  fetch(`${base_url}/api/v1/chrome_extension/mapping-key`, {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, nodes: nodeData }),
  })
    .then((res) => res.json())
    .then((response) => {
      chrome.storage.sync.set(
        { mappingKeys: response.result.data },
        function () {
          console.log("mappingKey  saved!");
        }
      );
    })
    .catch((error) => console.error("Error fetching mapping key:", error));
}

window.addEventListener("load", async () => {
  content.classList.add("d-none");
  loader.classList.remove("d-none");

  let tab = await getCurrentTab();
  let url = new URL(tab.url);
  let host = url.host; 

  let projectData = await fetchProjectData(host);

  if (!projectData) {
    chrome.storage.sync.clear();
    linkToTarjim.classList.remove("d-none");
    loader.classList.add("d-none");
    return;
  }

  if (
    projectData.result === "Invalid API Key"
  ) {
    chrome.storage.sync.clear();
    linkToTarjim.classList.remove("d-none");
    loader.classList.add("d-none");
    chrome.storage.sync.clear();
    return;
  }

  if (
    projectData.status === "fail" &&
    projectData.result.error === "Project id not found"
  ) {
    addHostContainer.classList.remove("d-none");
    addHostButton.innerHTML = `Add "${host}" In you Tarjim.io Environment`;
    addHostButton.addEventListener("click", function () {});
    loader.classList.add("d-none");
    chrome.storage.sync.clear();
    return;
  }

  if (
    projectData.status === "fail" &&
    projectData.result.error === "old_version"
  ) {
    loader.classList.add("d-none");
    chrome.storage.sync.clear();
    alert("A new version of the extension is available. Please update.");
    return;
  }

  if (
    projectData.status === "fail" &&
    projectData.result.error === "Missing domain"
  ) {
    loader.classList.add("d-none");
    chrome.storage.sync.clear();
    alert("Can't retrieve your domain or hosting information.");
    return;
  }

  if (projectData.status === "success" && projectData.result.data) {
    chrome.storage.sync.get(["projectId"], (storedData) => {
      let storedProjectId = storedData.projectId; // Get stored project ID
      let update_cache_url = projectData.result.data.update_cache_url;
      let projectList = projectData.result.data?.projects;
      let project_id = projectData.result.data?.project_id;
      let project_name = projectData.result.data?.project_name;


      if (!projectList || !projectList.length) {
        if (project_id) {
          chrome.storage.sync.set({
            projectId: project_id,
            projectName: project_name || host,
            updateCacheEndpoint: update_cache_url,
            is_branch: "false",
            mappingKeys: null,
          });
          content.classList.remove("d-none");
        }
        loader.classList.add("d-none");
        return;
      }

      projectSelection.classList.remove("d-none");
      let selectProjectDropdown = document.createElement("select");

      projectList.forEach((proj) => {
        let option = document.createElement("option");
        option.value = proj.Project.id;
        option.textContent = proj.Project.name;
        selectProjectDropdown.appendChild(option);
      });

      projectSelection.appendChild(selectProjectDropdown);

      // Check if a projectId exists in storage
      if (storedProjectId) {
        selectProjectDropdown.value = storedProjectId; // Set stored project as selected
      } else {
        let firstProject = projectList[0].Project;
        chrome.storage.sync.set({
          projectId: firstProject.id,
          projectName: firstProject.name,
          updateCacheEndpoint: update_cache_url,
          is_branch: "false",
          mappingKeys: null,
        });
        selectProjectDropdown.value = firstProject.id; // Select first project
      }

      // Handle project selection change
      selectProjectDropdown.addEventListener("change", async () => {
        let selectedProject = projectList.find(
          (p) => p.Project.id === selectProjectDropdown.value
        );
        selectedProject = selectedProject.Project;
        let [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: clearTarjimNodesHighlight,
        });

        chrome.storage.sync.set({
          projectId: selectedProject.id,
          projectName: selectedProject.name,
          updateCacheEndpoint: update_cache_url,
          is_branch:
            selectedProject.project_parent_id != "0" ? "true" : "false",
          mappingKeys: null,
        });

        if (selectedProject.project_parent_id) {
          await fetchMappingKey(selectedProject.id);
        }
      });

      content.classList.remove("d-none");
      loader.classList.add("d-none");

      chrome.storage.sync.get("nodesHighlighted", (storage) => {
        if (storage.nodesHighlighted === true) {
          getTarjimNodes.style = "display: none;";
          clearTarjimNodes.style = "display: block;";
        } else {
          getTarjimNodes.style = "display: block;";
          clearTarjimNodes.style = "display: none;";
        }
      });
    });
  }
});

chrome.storage.sync.get("projectName", (storage) => {
  let projectName = storage.projectName;
  if (projectName === "No tarjim project found, please login to Tarjim") {
    projectNameDiv.innerHTML = projectName;
    //Hide both buttons
    getTarjimNodes.style = "display: none;";
    clearTarjimNodes.style = "display: none";
  } else {
    chrome.storage.sync.get("projectId", (storage) => {
      projectNameDiv.innerHTML =
        "Project: " + projectName + " (id: " + storage.projectId + ")";
    });
  }
});

let getTarjimNodes = document.getElementById("getTarjimNodes");

getTarjimNodes.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let nodes = document.querySelectorAll("[data-tid]");

  chrome.storage.sync.get(
    ["projectId", "is_branch", "mappingKeys"],
    (storage) => {
      let projectId = storage.projectId;
      let is_branch = storage.is_branch;
      let mappingKeys = storage.mappingKeys;

      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: highlightTarjimNodes,
          args: [projectId, is_branch, mappingKeys, base_url],
        })
        .then(() => console.log("Script executed successfully"))
        .catch((error) => console.error("Error executing script:", error));
    }
  );
});

async function highlightTarjimNodes(projectId, is_branch, mappingKeys, base_url) {
  is_branch = is_branch == "true" ? true : false;


  let nodes = document.querySelectorAll("[data-tid]");

  let style = `
      .tarjim-extension-injected-subtext:hover {
        background-color: rgb(245, 180, 180);
        color: #2E3193;
        border-radius: .25rem;
        cursor: pointer;
      }`;

  let styleNode = document.createElement("style");
  styleNode.id = "tarjim-extension-injected-style-tag";
  styleNode.innerHTML = style;
  document.head.appendChild(styleNode);

  nodes.forEach((node, index) => {
    let tarjimId = node.getAttribute("data-tid");
    let show_edit_btn = true;
    if (is_branch && !mappingKeys[tarjimId]) {
      show_edit_btn = false;
    }
    if (is_branch && mappingKeys[tarjimId]) {
      node.dataset.originalText = node.textContent;
      if (mappingKeys[tarjimId]?.value) {
        node.textContent = mappingKeys[tarjimId]?.value;
      } else {
        node.textContent = "No Value Found";
      }
      tarjimId = mappingKeys[tarjimId]["translationkey_id"];
    }
    if (show_edit_btn) {
      let subtextId = `tarjim-extension-subtext-id-${tarjimId}-${index}`;
      let subtext = document.getElementById(subtextId);
      if (!subtext) {
        subtext = document.createElement("div");
        subtext.innerHTML = `Edit in tarjim tid: ${tarjimId}`;
        subtext.id = subtextId;
        subtext.classList.add("tarjim-extension-injected-subtext");
        node.parentNode.insertBefore(subtext, node.nextSibling);

        node.style.borderLeft = "4px dashed rgb(236, 30, 73)";

        subtext.addEventListener("click", function (e) {
          e.preventDefault();
          window.open(
            `${base_url}/translationvalues/edit/${projectId}/${tarjimId}?ext=1`,
            "extension_popup",
            "width=600,height=700,status=no,scrollbars=yes,resizable=yes"
          );
          e.stopPropagation();
          return false;
        });
      }
    }
  });

  chrome.storage.sync.set({ nodesHighlighted: true });
}

let clearTarjimNodes = document.getElementById("clearTarjimNodes");

clearTarjimNodes.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: clearTarjimNodesHighlight,
  });
});

function clearTarjimNodesHighlight() {
  // Remove injected style tag
  let styleNodeId = "tarjim-extension-injected-style-tag";
  let styleNode = document.getElementById(styleNodeId);
  if (styleNode != null) {
    styleNode.remove();
  }

  // Remove injected subtext
  let subtextNodes = document.querySelectorAll(
    ".tarjim-extension-injected-subtext"
  );
  subtextNodes.forEach((node) => {
    node.remove();
  });

  // Remove injected style
  let nodes = document.querySelectorAll("[data-tid]");
  nodes.forEach((node, index) => {
    node.style = "";
    if (node.dataset.originalText) {
      node.textContent = node.dataset.originalText;
    }
  });
  chrome.storage.sync.set({ nodesHighlighted: false });
}

// Listen to highlight state change
chrome.storage.sync.onChanged.addListener(() => {
  chrome.storage.sync.get("nodesHighlighted", (storage) => {
    if (storage.nodesHighlighted === true) {
      getTarjimNodes.style = "display: none;";
      clearTarjimNodes.style = "display: block;";
    } else {
      getTarjimNodes.style = "display: block;";
      clearTarjimNodes.style = "display: none;";
    }
  });

  chrome.storage.sync.get("projectName", (storage) => {
    let projectName = storage.projectName;
    if (projectName === "No tarjim project found, please login to Tarjim") {
      projectNameDiv.innerHTML = projectName;
      // Hide both buttons
      getTarjimNodes.style = "display: none;";
      clearTarjimNodes.style = "display: none";
    } else {
      chrome.storage.sync.get("projectId", (storage) => {
        projectNameDiv.innerHTML =
          "Project: " + projectName + " (id: " + storage.projectId + ")";
      });
    }
  });
});

/**
 *
 */
refreshCacheButton.addEventListener("click", async () => {
  content.classList.add("d-none");
  loader.classList.remove("d-none");

  var updateEndpoint;
  await chrome.storage.sync.get(
    ["updateCacheEndpoint", "projectId", "is_branch"],
    async (storage) => {

      if (storage.is_branch == "true") {
        await fetchMappingKey(storage.projectId);
        let [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: clearTarjimNodesHighlight,
        });
        content.classList.remove("d-none");
        loader.classList.add("d-none");
      } else {
        await fetch(storage.updateCacheEndpoint)
          .then((res) => res.json())
          .then((response) => {
            if (response.status === "success") {
              refreshCacheMessage.innerHTML =
                "Cache updated, refresh the page to see the changes";
            } else {
              refreshCacheMessage.innerHTML =
                "Cache update failed, check the update cache url in tarjim environments";
            }
            content.classList.remove("d-none");
            loader.classList.add("d-none");
          })
          .catch((err) => {
            refreshCacheMessage.innerHTML =
              "Cache update failed, check the update cache url in tarjim environments";
            content.classList.remove("d-none");
            loader.classList.add("d-none");
          });
      }
    }
  );
});
