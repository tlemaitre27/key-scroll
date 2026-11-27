// CSS tab: custom CSS of the page, element picker and preview switch.

import { $, icon, state, send, toPage } from './dom.js';
import { attachHighlighter } from './css-highlight.js';

let highlighter = null;
let saveTimer = 0;
let badgeTimer = 0;
let pendingKey = null; // page the unsaved typing belongs to

// Badge at the bottom right of the editor: "Saving...", "Saved", or an error.
function badge(text, kind = '') {
  const b = $('cssState');
  clearTimeout(badgeTimer);
  b.hidden = !text;
  b.textContent = text || '';
  b.className = 'badge' + (kind ? ' ' + kind : '');
  if (text && !kind)
    badgeTimer = setTimeout(() => {
      b.hidden = true;
    }, 2500);
}

export function setPreviewButton(on) {
  const btn = $('preview');
  btn.setAttribute('aria-pressed', String(!!on));
  btn.querySelector('span').textContent = `Preview (${on ? 'on' : 'off'})`;
  btn.querySelector('img').src = icon(on ? 'eye' : 'eye-off');
}

// Content of the editor for the current page (null = unsupported page).
export function loadCss(text) {
  const ta = $('css');
  const off = text == null;
  ta.disabled = $('pick').disabled = $('preview').disabled = off;
  ta.placeholder = off ? 'Unsupported page (http/https only).' : '.cookie-banner { display: none; }';
  ta.value = off ? '' : text;
  badge('');
  highlighter.render();
}

// Saves pending typing, for the page it was typed in.
export function flushCss() {
  clearTimeout(saveTimer);
  const key = pendingKey;
  if (!key) return Promise.resolve();
  pendingKey = null;
  const value = $('css').value;
  // Empty editor = no CSS for this page (no useless storage key kept).
  return (value.trim() ? chrome.storage.local.set({ [key]: value }) : chrome.storage.local.remove(key)).then(() => {
    if (key === state.cssKey) badge('Saved');
  });
}

// The editor has no size while its tab is hidden: re-render when the tab is shown.
export function onCssTabShown() {
  if (highlighter) highlighter.render();
}

// Listeners are set once; they always read the current page (state.cssKey).
export function setupCssTab() {
  const ta = $('css');
  highlighter = attachHighlighter(ta);

  // Selector added from the page (element picker) while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[state.cssKey] || document.activeElement === ta) return;
    ta.value = changes[state.cssKey].newValue || '';
    highlighter.render();
  });

  // The popup closes when the user clicks in the page anyway: close it now; the selector will
  // be in the editor next time the popup opens.
  $('pick').addEventListener('click', async () => {
    const r = await toPage({ type: 'pick' });
    if (r && r.ok) window.close();
    else badge((r && r.reason) || 'Not possible on this page.', 'err');
  });

  $('preview').addEventListener('click', async () => {
    const on = $('preview').getAttribute('aria-pressed') !== 'true';
    const r = await send({ type: 'preview-set', tabId: state.tabId, on });
    setPreviewButton(r && r.ok ? r.preview : !on);
    if (r && r.content && r.content.ok === false) badge('Preview: ' + (r.content.reason || 'page unreachable'), 'err');
  });

  // Saved while typing (the popup can close at any time).
  ta.addEventListener('input', () => {
    pendingKey = state.cssKey;
    badge('Saving...', 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushCss, 300);
  });
  ta.addEventListener('blur', flushCss);

  // Tab inserts an indent instead of leaving the editor.
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  });
}
