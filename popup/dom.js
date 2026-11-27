// Small helpers and the state shared by the popup modules.

export const $ = (id) => document.getElementById(id);

// URL of an icon in assets/icons/ (relative to popup/popup.html).
export const icon = (name) => `../assets/icons/${name}.svg`;

// What the popup knows about the current tab and page.
export const state = {
  tabId: null,
  anchorKey: null, // storage key of the page's anchors (null = unsupported page)
  cssKey: null, // storage key of the page's custom CSS
  anchors: [],
  next: { ...KS_ANCHOR_DEFAULTS }, // settings copied into the next anchor added (storage key "globals")
  editingId: null // id of the anchor open in the editor
};

// Message to the service worker.
export const send = (msg) => chrome.runtime.sendMessage({ target: 'background', ...msg });

// Message to the content scripts of the current tab (relayed by the service worker).
export const toPage = (msg) => send({ type: 'content', tabId: state.tabId, msg });

// Merges `patch` into a stored object (e.g. recOptions) without losing its other fields.
export async function patchStored(key, patch) {
  const prev = (await chrome.storage.local.get(key))[key] || {};
  await chrome.storage.local.set({ [key]: { ...prev, ...patch } });
}
