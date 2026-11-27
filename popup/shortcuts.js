// Keyboard shortcuts: the ones actually assigned in the browser, shown at the bottom of every
// tab and as "( ⌥ ⇧ A )" chips inside buttons.

import { $, icon } from './dom.js';

// Same order as the browser's shortcuts page (which sorts commands by name).
const ORDER = ['add-anchor', 'next-anchor', 'prev-anchor', 'run-playback', 'toggle-recording'];

// Play has no default shortcut in the manifest (Chrome allows 4); content/scroll.js listens to
// ⌥⇧P in the page instead.
const PLAY_FALLBACK = 'Alt+Shift+P';

let commands = [];

// "⌥⇧A" (Mac) or "Alt+Shift+A" → ['Alt', 'Shift', 'A'].
export function shortcutKeys(shortcut) {
  if (!shortcut) return [];
  const mac = { '⌥': 'Alt', '⇧': 'Shift', '⌘': 'Cmd', '⌃': 'Ctrl' };
  const keys = shortcut.includes('+')
    ? shortcut.split('+')
    : shortcut.replace(/[⌥⇧⌘⌃]/g, (m) => mac[m] + '\u0000').split('\u0000');
  return keys
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => ({ Down: '↓', Up: '↑', Left: '←', Right: '→', Command: 'Cmd', MacCtrl: 'Ctrl' })[k] || k);
}

export const shortcutText = (shortcut) => shortcutKeys(shortcut).join(' + ');

// Shortcut of a command, as readable text ('' if none).
export function shortcutFor(name) {
  const c = commands.find((x) => x.name === name);
  return c && c.shortcut ? shortcutText(c.shortcut) : '';
}

// "( ⌥ ⇧ A )" chips inside buttons, with the mockup's icons for Alt and Shift.
function renderChips() {
  for (const chip of document.querySelectorAll('.kbd[data-cmd]')) {
    const c = commands.find((x) => x.name === chip.dataset.cmd);
    const keys = shortcutKeys(c && c.shortcut);
    chip.hidden = !keys.length;
    chip.textContent = '';
    if (!keys.length) continue;
    chip.append('(');
    for (const k of keys) {
      if (k === 'Alt' || k === 'Shift') {
        const img = new Image(13, 13);
        img.src = icon(k === 'Alt' ? 'option' : 'shift');
        img.alt = k;
        chip.append(img);
      } else chip.append(k + ' ');
    }
    chip.append(')');
  }
}

function renderList() {
  const ul = $('shortcuts');
  ul.textContent = '';
  const sorted = commands.filter((c) => c.description).sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  for (const c of sorted) {
    const li = document.createElement('li');
    li.append(c.description + ': ');
    if (c.shortcut) li.append(shortcutText(c.shortcut));
    else {
      const none = document.createElement('span');
      none.className = 'none';
      none.textContent = 'not assigned';
      li.append(none);
    }
    ul.appendChild(li);
  }
}

export async function loadShortcuts() {
  commands = await chrome.commands.getAll();
  const play = commands.find((c) => c.name === 'run-playback');
  if (play && !play.shortcut) play.shortcut = PLAY_FALLBACK;
  renderList();
  renderChips();
  const add = shortcutFor('add-anchor');
  $('hAdd').title = add ? `Add anchor (${add})` : 'Add anchor';
}

export function setupShortcuts() {
  $('shortcutsBtn').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
}
