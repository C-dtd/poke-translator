function buildTrieRegex(keys) {
  const trie = {};
  for (const key of keys) {
    let node = trie;
    for (const char of key.toLowerCase()) {
      node[char] ??= {};
      node = node[char];
    }
    node.$ = true;
  }

  function trieToPattern(node) {
    const parts = [];

    for (const [char, child] of Object.entries(node)) {
      if (char === "$") continue;
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sub = trieToPattern(child);
      parts.push(sub ? `${escaped}(?:${sub})` : escaped);
    }

    if (parts.length === 0) return "";

    const pattern = parts.length === 1 ? parts[0] : parts.join("|");
    return node.$ ? `(?:${pattern})?` : pattern;
  }

  return new RegExp(`\\b(?:${trieToPattern(trie)})\\b`, "gi");
}
const categoryFiles = {
  pokedex: "pokedex.json",
  moves: "moves.json",
  abilities: "abilities.json",
  items: "items.json",
  natures: "natures.json",
};

let observer;

async function init() {
  const { enabledCategories, replacements, regex } = await fetchConfigs();
  observer = main(replacements, regex);
}

async function fetchConfigs() {
  const { enabledCategories = { pokedex: true, moves: true, abilities: true, items: true, natures: true } } =
    await chrome.storage.sync.get("enabledCategories");

  const entries = await Promise.all(
    Object.entries(categoryFiles)
      .filter(([k, v]) => enabledCategories[k])
      .map(async ([k, v]) => {
        const res = await fetch(chrome.runtime.getURL(v));
        const data = await res.json();
        return { category: k, data };
      }),
  );

  const replacements = new Map();

  for (const { category, data } of entries) {
    for (const [k, v] of Object.entries(data)) {
      replacements.set(k.toLowerCase(), { text: v, category: category });
    }
  }
  const regex = buildTrieRegex(replacements.keys());
  return { enabledCategories, replacements, regex };
}

function main(replacements, regex) {
  function replaceInTextNode(node) {
    if (node.parentElement?.classList.contains("poke-translator")) return;
    const text = node.textContent;
    const html = text.replace(regex, (m) => {
      const translated = replacements.get(m.toLowerCase());
      if (!translated) return m;
      return `<span class="poke-translator" data-category="${translated.category}" title="${m}">${translated.text}</span>`;
    });

    if (html === text) return;
    const container = document.createElement("span");
    container.innerHTML = html;
    node.replaceWith(...container.childNodes);
  }

  function acceptNode(node) {
    const parent = node.parentElement;
    return !parent || ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(parent.tagName)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT;
  }
  function walk(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    for (const n of nodes) {
      replaceInTextNode(n);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) {
          replaceInTextNode(added);
          continue;
        }
        if (added.nodeType !== Node.ELEMENT_NODE || added.classList.contains("poke-translator")) continue;
        walk(added);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  walk(document.body);
  return observer;
}

async function revert(enabledCategories) {
  console.log(enabledCategories);
  function replaceInTextNode(node) {
    if (!enabledCategories[node.dataset.category]) node.replaceWith(node.title);
  }

  function acceptNode(node) {
    return node.tagName === "SPAN" && node.classList.contains("poke-translator")
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_SKIP;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, { acceptNode });
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }
  for (const n of nodes) {
    replaceInTextNode(n);
  }
}

init();

chrome.storage.onChanged.addListener(async (c) => {
  if (!c.enabledCategories) return;
  observer.disconnect();
  const { enabledCategories, replacements, regex } = await fetchConfigs();
  revert(enabledCategories);
  observer = main(replacements, regex);
});
