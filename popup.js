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
    document.getElementById(key).checked = enabledCategories[key] ?? true;
    document.getElementById(key).addEventListener("change", async (e) => {
      const { enabledCategories = {} } = await chrome.storage.sync.get("enabledCategories");
      enabledCategories[key] = e.target.checked;
      await chrome.storage.sync.set({ enabledCategories });
    });
  }
}

init();
