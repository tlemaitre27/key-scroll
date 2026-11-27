// Popup entry point: tabs, current page, cursor quick settings, and wiring of the other modules.

import { $, state } from './dom.js';
import { setupAnchorsTab, renderNextSettings, renderList, onAnchorsChanged, resetMessage } from './anchors-tab.js';
import { setupRecordTab, refreshStatus, renderStatus } from './record-tab.js';
import { setupCssTab, loadCss, flushCss, onCssTabShown } from './css-tab.js';
import { setupShortcuts, loadShortcuts } from './shortcuts.js';

// =====================================================================
// Tabs (the last one opened is remembered)
// =====================================================================

function setupTabs() {
  const buttons = [...document.querySelectorAll('.tabs button')];
  const show = (name) => {
    if (!buttons.some((b) => b.dataset.tab === name)) name = 'anchors';
    for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const s of document.querySelectorAll('section.tab')) s.hidden = s.dataset.tab !== name;
    if (name === 'css') onCssTabShown();
    try {
      localStorage.setItem('tab', name);
    } catch (e) {
      /* storage blocked */
    }
  };
  for (const b of buttons) b.addEventListener('click', () => show(b.dataset.tab));
  let last = 'anchors';
  try {
    last = localStorage.getItem('tab') || 'anchors';
  } catch (e) {
    /* storage blocked */
  }
  show(last);
}

// =====================================================================
// Cursor tab (quick settings; size, smoothing and icons are in the settings page)
// =====================================================================

async function setupCursorTab() {
  const ids = { mode: 'curMode', style: 'curStyle', motion: 'curMotion' };
  const cursor = { ...KS_CURSOR_DEFAULTS, ...((await chrome.storage.local.get('cursor')).cursor || {}) };
  for (const [key, id] of Object.entries(ids)) $(id).value = cursor[key];
  $('curClicks').checked = !!cursor.clicks;
  const save = async () => {
    const prev = (await chrome.storage.local.get('cursor')).cursor || {};
    await chrome.storage.local.set({
      cursor: {
        ...KS_CURSOR_DEFAULTS,
        ...prev,
        mode: $('curMode').value,
        style: $('curStyle').value,
        motion: $('curMotion').value,
        clicks: $('curClicks').checked
      }
    });
  };
  for (const id of [...Object.values(ids), 'curClicks']) $(id).addEventListener('change', save);
}

// =====================================================================
// Current page: anchors + CSS. Reloaded when the tab's URL changes (navigation, Barba...).
// =====================================================================

let pageUrl = null;
async function loadPage(url) {
  let anchorKey = null,
    cssKey = null;
  try {
    if (url && /^https?:/.test(url)) {
      anchorKey = ksAnchorKey(url);
      cssKey = ksCssKey(url);
    }
  } catch (e) {
    /* invalid URL */
  }
  if (anchorKey === state.anchorKey && pageUrl !== null) {
    pageUrl = url;
    return;
  } // same page (query / hash)
  await flushCss();
  pageUrl = url;
  state.anchorKey = anchorKey;
  state.cssKey = cssKey;
  const stored = anchorKey ? await chrome.storage.local.get([anchorKey, cssKey]) : {};
  state.anchors = anchorKey ? stored[anchorKey] || [] : [];
  state.editingId = null;
  resetMessage();
  $('hAdd').disabled = $('add').disabled = !anchorKey;
  loadCss(cssKey ? stored[cssKey] || '' : null);
  renderList();
}

// =====================================================================
// Init
// =====================================================================

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab && tab.id;
  state.next = { ...KS_ANCHOR_DEFAULTS, ...((await chrome.storage.local.get('globals')).globals || {}) };

  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  setupCssTab();
  setupTabs();
  setupAnchorsTab();
  renderNextSettings();
  setupShortcuts();
  await Promise.all([setupRecordTab(), setupCursorTab()]);
  await loadPage(tab && tab.url);
  await loadShortcuts();
  renderList(); // the empty-list hint quotes the "add anchor" shortcut

  // Page changed in the tab while the popup is open.
  chrome.tabs.onUpdated.addListener((id, info, t) => {
    if (id === state.tabId && (info.url || info.status === 'complete')) loadPage(info.url || t.url);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // Anchors added by a shortcut (or the "+" button) while the popup is open.
    if (area === 'local' && state.anchorKey && changes[state.anchorKey]) onAnchorsChanged(changes[state.anchorKey].newValue);
    // Recording state updated by the service worker.
    if (area === 'session' && changes.s) renderStatus(changes.s.newValue || {});
  });
  refreshStatus();
}

init();
