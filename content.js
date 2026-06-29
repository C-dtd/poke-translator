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

    const entries = Object.entries(node)
      .filter(([char]) => char !== "$")
      .sort(([, a], [, b]) => depth(b) - depth(a));

    for (const [char, child] of entries) {
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sub = trieToPattern(child);
      parts.push(sub ? `${escaped}(?:${sub})` : escaped);
    }

    if (parts.length === 0) return "";

    const pattern = parts.length === 1 ? parts[0] : parts.join("|");
    return node.$ ? `(?:${pattern})?` : pattern;
  }

  function depth(node) {
    const children = Object.entries(node).filter(([k]) => k !== "$");
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map(([, child]) => depth(child)));
  }

  return new RegExp(`(?<![\\w\\p{L}])(?:${trieToPattern(trie)})(?![\\w\\p{L}])`, "giu");
}
// function buildTrieRegex(keys) {
//   const trie = {};
//   for (const key of keys) {
//     let node = trie;
//     for (const char of key.toLowerCase()) {
//       node[char] ??= {};
//       node = node[char];
//     }
//     node.$ = true;
//   }

//   function trieToPattern(node) {
//     const parts = [];

//     const entries = Object.entries(node)
//       .filter(([char]) => char !== "$")
//       .sort(([, a], [, b]) => depth(b) - depth(a));

//     for (const [char, child] of entries) {
//       const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//       const sub = trieToPattern(child);
//       parts.push(sub ? `${escaped}(?:${sub})` : escaped);
//     }

//     if (parts.length === 0) return "";

//     const pattern = parts.length === 1 ? parts[0] : parts.join("|");
//     return node.$ ? `(?:${pattern})?` : pattern;
//   }

//   function depth(node) {
//     const children = Object.entries(node).filter(([k]) => k !== "$");
//     if (children.length === 0) return 0;
//     return 1 + Math.max(...children.map(([, child]) => depth(child)));
//   }

//   const asciiKeys = keys.filter((k) => /^[\x00-\x7F]+$/.test(k));
//   const unicodeKeys = keys.filter((k) => !/^[\x00-\x7F]+$/.test(k));

//   return new RegExp(`\\b(?:${trieToPattern(trie)})\\b`, "gi");
// }
const categoryFiles = {
  pokedex: "pokedex.json",
  moves: "moves.json",
  abilities: "abilities.json",
  items: "items.json",
  natures: "natures.json",
};
const defaultEnabledCategories = { pokedex: true, moves: true, abilities: true, items: true, natures: true };

let observer;
let isActivated;

async function init() {
  const { enabledCategories: stored = {} } = await chrome.storage.sync.get("enabledCategories");
  const enabledCategories = { ...defaultEnabledCategories, ...stored };
  const { wordDict, regex } = await fetchConfigs(enabledCategories);
  observer = main(wordDict, regex);
}

async function fetchConfigs(enabledCategories) {
  const entries = await Promise.all(
    Object.entries(categoryFiles)
      .filter(([k, v]) => enabledCategories[k])
      .map(async ([k, v]) => {
        const res = await fetch(chrome.runtime.getURL(v));
        const data = await res.json();
        return { category: k, data };
      }),
  );

  const wordDict = new Map();
  for (const { category, data } of entries) {
    for (const [k, v] of Object.entries(data)) {
      wordDict.set(k.toLowerCase(), { text: v, category: category });
    }
  }

  const regex = buildTrieRegex(wordDict.keys());
  return { wordDict, regex };
}

function main(wordDict, regex) {
  function replaceInTextNode(node) {
    if (node.parentElement?.classList.contains("poke-translator")) return;
    const text = node.textContent;
    const html = text.replace(regex, (m) => {
      const translated = wordDict.get(m.toLowerCase());
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
    if (!isActivated) return;
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
  function replaceInTextNode(node) {
    if (!enabledCategories[node.dataset.category]) {
      const parent = node.parentNode;
      node.replaceWith(node.title);
      parent.normalize();
    }
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

  document.body.normalize();
}

chrome.storage.sync.get(["sitelist"], ({ sitelist = [] }) => {
  if (!sitelist.includes(location.hostname)) {
    isActivated = false;
    return;
  }
  isActivated = true;
  init();
});

chrome.storage.onChanged.addListener(async (c) => {
  if (!c.enabledCategories && !c.sitelist) return;

  if (isActivated && c.enabledCategories && observer) {
    observer.disconnect();
    const enabledCategories = { ...defaultEnabledCategories, ...c.enabledCategories.newValue };
    const { wordDict, regex } = await fetchConfigs(enabledCategories);
    revert(enabledCategories);
    observer = main(wordDict, regex);
  }

  if (c.sitelist.newValue.includes(location.hostname) && !c.sitelist.oldValue.includes(location.hostname)) {
    isActivated = true;
    init();
  }

  if (!c.sitelist.newValue.includes(location.hostname) && c.sitelist.oldValue.includes(location.hostname)) {
    isActivated = false;
    observer.disconnect();
    revert({ pokedex: false, moves: false, abilities: false, items: false, natures: false });
  }
});
