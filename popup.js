async function init() {
  const {
    enabledCategories = {
      pokedex: true,
      moves: true,
      abilities: true,
      items: true,
      natures: true,
    },
  } = await chrome.storage.sync.get("enabledCategories");

  const categoryIds = ["pokedex", "moves", "abilities", "items", "natures"];
  for (const key of categoryIds) {
    const el = document.querySelector(`#${key}`);
    el.checked = enabledCategories[key] ?? true;
    el.addEventListener("change", async (e) => {
      const { enabledCategories = {} } = await chrome.storage.sync.get("enabledCategories");
      enabledCategories[key] = e.target.checked;
      await chrome.storage.sync.set({ enabledCategories });
    });
  }

  document.querySelector("#active-all-btn").addEventListener("click", async () => {
    categoryIds.forEach((key) => (document.querySelector(`#${key}`).checked = true));
    await chrome.storage.sync.set({
      enabledCategories: Object.fromEntries(categoryIds.map((k) => [k, true])),
    });
  });

  document.querySelector("#deactive-all-btn").addEventListener("click", async () => {
    categoryIds.forEach((key) => (document.querySelector(`#${key}`).checked = false));
    await chrome.storage.sync.set({
      enabledCategories: Object.fromEntries(categoryIds.map((k) => [k, false])),
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    let host = "";
    try {
      if (tab?.url) host = new URL(tab.url).hostname;
    } catch (e) {
      console.warn("Invalid URL:", tab?.url);
    }

    const hostEl = document.querySelector("#current-host");
    if (!host) {
      hostEl.value = "감지 불가";
      document.querySelector("#add-site-btn").disabled = true;
      return;
    }
    hostEl.value = host;

    chrome.storage.sync.get(["sitelist"], ({ sitelist = [] }) => {
      rendersitelist(sitelist);
      updateAddBtn(host, sitelist);
    });

    document.querySelector("#add-site-btn").addEventListener("click", () => {
      chrome.storage.sync.get(["sitelist"], ({ sitelist = [] }) => {
        if (!sitelist.includes(host)) {
          const updated = [...sitelist, host];
          chrome.storage.sync.set({ sitelist: updated }, () => {
            rendersitelist(updated);
            updateAddBtn(host, updated);
          });
        }
      });
    });
  });

  function rendersitelist(sitelist) {
    const el = document.querySelector("#sitelist");
    document.querySelector("#sitelist-empty-msg").style.display = sitelist.length === 0 ? "block" : "none";
    el.innerHTML = "";
    sitelist.forEach((host, i) => {
      const tag = document.createElement("div");
      tag.className = "site-tag";
      tag.innerHTML = `<div class="site-container"><span class="site-flag" title="${host}">${host}</span><button class="site-remove-btn" data-i="${i}">✕</button></div>`;
      tag.querySelector(".site-remove-btn").addEventListener("click", () => {
        chrome.storage.sync.get(["sitelist"], ({ sitelist = [] }) => {
          sitelist.splice(i, 1);
          chrome.storage.sync.set({ sitelist }, () => {
            rendersitelist(sitelist);
            updateAddBtn(host, sitelist);
          });
        });
      });
      el.appendChild(tag);
    });
  }

  function updateAddBtn(host, sitelist) {
    const btn = document.querySelector("#add-site-btn");
    const already = sitelist.includes(host);
    btn.textContent = already ? "✓ 추가됨" : "+ 추가";
    btn.disabled = already;
  }
}

init();
