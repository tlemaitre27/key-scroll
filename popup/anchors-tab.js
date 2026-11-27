// Anchors tab: settings for the next anchor, anchor list (drag to reorder) and anchor editor.
// Every change is saved right away (the popup can close at any time).

import { $, icon, state, toPage } from './dom.js';
import { bindEasing } from './curve-editor.js';
import { shortcutFor } from './shortcuts.js';

const D = KS_ANCHOR_DEFAULTS;
const pad2 = (n) => String(n).padStart(2, '0');
const hasOwnSettings = (a) => a.speed != null || a.pause != null || !!a.easing;
const current = () => state.anchors.find((a) => a.id === state.editingId);
const message = (text) => {
  $('msg').textContent = text || '';
};

export const saveAnchors = () => state.anchorKey && chrome.storage.local.set({ [state.anchorKey]: state.anchors });
const saveNext = () => chrome.storage.local.set({ globals: state.next });

// =====================================================================
// Settings for the next anchor (copied into an anchor when it is added; they don't change
// existing anchors). A value equal to the default is shown as a dimmed placeholder.
// =====================================================================

let nextCurve;

export function renderNextSettings() {
  const n = state.next;
  $('gSpeed').placeholder = String(D.speed);
  $('gSpeed').value = n.speed === D.speed ? '' : n.speed;
  $('gPause').placeholder = String(D.pause);
  $('gPause').value = n.pause === D.pause ? '' : n.pause;
  $('gEase').placeholder = ksFormatEasing(D.easing);
  $('gEase').value = ksSameEasing(n.easing, D.easing) ? '' : ksFormatEasing(n.easing);
  $('gEase').classList.remove('invalid');
  nextCurve.set(n.easing);
  nextCurve.syncPreset(n.easing, $('gEase').value === '');
}

function setupNextSettings() {
  nextCurve = bindEasing({
    input: $('gEase'),
    preset: $('gPreset'),
    curveHost: $('gCurve'),
    defaultValue: () => D.easing,
    onCommit: (e) => {
      state.next.easing = e || D.easing.slice(); // empty field = default curve
      saveNext();
      renderNextSettings();
    }
  });

  for (const [id, prop, min] of [
    ['gSpeed', 'speed', 1],
    ['gPause', 'pause', 0]
  ]) {
    $(id).addEventListener('change', () => {
      const raw = $(id).value.trim();
      const v = raw === '' ? D[prop] : parseInt(raw, 10);
      if (v >= min) {
        state.next[prop] = v;
        saveNext();
      }
      renderNextSettings();
    });
  }

  $('gCurveBtn').addEventListener('click', () => {
    const open = $('gCurve').hidden;
    $('gCurve').hidden = !open;
    $('gCurveBtn').setAttribute('aria-pressed', String(open));
    if (open) nextCurve.play();
  });
}

// =====================================================================
// Anchor list
// =====================================================================

export function renderList() {
  const ol = $('list');
  const editor = $('editor');
  editor.hidden = true;
  ol.parentNode.appendChild(editor); // take the editor out of the list before emptying it
  ol.textContent = '';

  const empty = $('empty');
  if (!state.anchorKey || !state.anchors.length) {
    const add = shortcutFor('add-anchor');
    empty.hidden = false;
    empty.innerHTML = '<span></span>';
    empty.firstChild.textContent = !state.anchorKey
      ? 'Unsupported page (http/https only).'
      : `No anchor. Scroll then click on “+ Add”${add ? ` (${add})` : ''}`;
    return;
  }
  empty.hidden = true;

  state.anchors.forEach((a, i) => {
    const li = document.createElement('li');
    li.dataset.id = a.id;
    const open = a.id === state.editingId;
    li.innerHTML = `
      <div class="anchor${open ? ' open' : ''}">
        <div class="lbl">
          <span class="grip" title="Drag to reorder"><i><b></b><b></b><b></b><b></b><b></b><b></b></i></span>
          <span class="n">${pad2(i + 1)}</span><span>–</span><span class="nm"></span>
        </div>
        <div class="acts">
          <button class="ib" data-act="go" title="Go to this anchor"><img src="${icon('row-play')}" width="18" height="18" alt=""></button>
          <button class="ib" data-act="edit"><img width="18" height="18" alt=""></button>
          <button class="ib" data-act="del" title="Delete"><img src="${icon('row-delete')}" width="18" height="18" alt=""></button>
        </div>
      </div>`;
    fillRow(li, a);
    li.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => rowAction(b.dataset.act, a.id)));
    li.querySelector('.anchor').addEventListener('dblclick', (e) => {
      if (!e.target.closest('button')) rowAction('edit', a.id);
    });
    setupDrag(li.querySelector('.grip'), li);
    ol.appendChild(li);
    if (open) {
      li.appendChild(editor);
      editor.hidden = false;
    }
  });
}

// Name (or position) and "edited" dot of a row.
function fillRow(li, a) {
  const name = li.querySelector('.nm');
  name.textContent = a.name ? a.name : `${a.y} px`;
  name.title = a.name ? `${a.y} px` : '';
  const edit = li.querySelector('[data-act="edit"]');
  edit.title = hasOwnSettings(a) ? 'Edit (custom settings)' : 'Edit';
  edit.querySelector('img').src = icon(hasOwnSettings(a) ? 'row-edited' : 'row-edit');
}

// Updates one row without rebuilding the list (keeps the focus in the editor).
export function refreshRow(a) {
  const li = document.querySelector(`#list li[data-id="${CSS.escape(String(a.id))}"]`);
  if (li) fillRow(li, a);
}

async function rowAction(act, id) {
  const i = state.anchors.findIndex((a) => a.id === id);
  if (i < 0) return;
  if (act === 'go') {
    const r = await toPage({ type: 'goto', index: i });
    message(r && !r.ok ? r.reason : '');
  } else if (act === 'edit') {
    state.editingId = state.editingId === id ? null : id;
    renderList();
    renderEditor(true);
  } else if (act === 'del') {
    state.anchors.splice(i, 1);
    if (id === state.editingId) state.editingId = null;
    await saveAnchors();
    renderList();
    renderEditor(false);
  }
}

// Drag and drop by the grip: the row follows the mouse, the others make room.
function setupDrag(grip, li) {
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rows = [...$('list').children];
    const from = rows.indexOf(li);
    const startY = e.clientY;
    const rects = rows.map((r) => r.getBoundingClientRect());
    const h = rects[from].height;
    let to = from;
    li.classList.add('dragging');
    document.body.classList.add('dragging');

    const move = (ev) => {
      const dy = ev.clientY - startY;
      li.style.transform = `translateY(${dy}px)`;
      const mid = rects[from].top + h / 2 + dy;
      // New index = number of other rows whose middle is above the middle of the dragged row.
      to = rects.filter((r, k) => k !== from && r.top + r.height / 2 < mid).length;
      rows.forEach((r, k) => {
        if (r === li) return;
        const shift = from < to && k > from && k <= to ? -h : from > to && k >= to && k < from ? h : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
        r.style.transition = 'transform .12s';
      });
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
      rows.forEach((r) => {
        r.style.transform = '';
        r.style.transition = '';
      });
      li.classList.remove('dragging');
      if (to !== from) {
        const [a] = state.anchors.splice(from, 1);
        state.anchors.splice(to, 0, a);
        await saveAnchors();
      }
      renderList();
      renderEditor(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function setupListButtons() {
  const pageAction = (type) => async () => {
    const r = await toPage({ type });
    message(r && !r.ok ? r.reason : '');
  };
  $('add').addEventListener('click', pageAction('add'));
  $('hAdd').addEventListener('click', pageAction('add'));
  $('prev').addEventListener('click', pageAction('prev'));
  $('next').addEventListener('click', pageAction('next'));
  $('play').addEventListener('click', pageAction('play'));
  $('clear').addEventListener('click', async () => {
    const n = state.anchors.length;
    if (!n || !confirm(`Delete the ${n} anchors of this page?`)) return;
    state.anchors = [];
    state.editingId = null;
    await saveAnchors();
    renderList();
  });
}

// =====================================================================
// Anchor editor (an empty field = default value)
// =====================================================================

let editorCurve;

export function renderEditor(animate) {
  const a = current();
  if (!a) return;
  $('eTitle').textContent = `Anchor #${state.anchors.indexOf(a) + 1}`;
  if (document.activeElement !== $('eName')) $('eName').value = a.name || '';
  $('ePos').value = a.y;
  $('eSpeed').value = a.speed ?? '';
  $('eSpeed').placeholder = String(D.speed);
  $('ePause').value = a.pause ?? '';
  $('ePause').placeholder = String(D.pause);
  $('eEase').value = a.easing ? ksFormatEasing(a.easing) : '';
  $('eEase').placeholder = ksFormatEasing(D.easing);
  $('eEase').classList.remove('invalid');
  editorCurve.set(a.easing || D.easing);
  editorCurve.syncPreset(a.easing || D.easing, !a.easing);
  if (animate) editorCurve.play();
}

// Saves the edited anchor and updates its row.
function commit(a) {
  saveAnchors();
  refreshRow(a);
}

function setupEditor() {
  editorCurve = bindEasing({
    input: $('eEase'),
    preset: $('ePreset'),
    curveHost: $('eCurve'),
    defaultValue: () => D.easing,
    onCommit: (e) => {
      const a = current();
      if (!a) return;
      if (e) a.easing = e;
      else delete a.easing;
      commit(a);
      renderEditor(false);
    }
  });

  for (const [id, prop, min] of [
    ['eSpeed', 'speed', 1],
    ['ePause', 'pause', 0]
  ]) {
    $(id).addEventListener('change', () => {
      const a = current();
      if (!a) return;
      const raw = $(id).value.trim();
      if (raw === '') delete a[prop];
      else {
        const v = parseInt(raw, 10);
        if (!(v >= min)) {
          renderEditor(false);
          return;
        }
        a[prop] = v;
      }
      commit(a);
    });
  }

  // Name: saved while typing.
  let nameTimer = 0;
  $('eName').addEventListener('input', () => {
    const a = current();
    if (!a) return;
    const v = $('eName').value.trim();
    if (v) a.name = v;
    else delete a.name;
    refreshRow(a);
    clearTimeout(nameTimer);
    nameTimer = setTimeout(saveAnchors, 250);
  });
  $('eName').addEventListener('blur', () => {
    clearTimeout(nameTimer);
    saveAnchors();
  });

  $('ePos').addEventListener('change', () => {
    const a = current();
    const v = parseInt($('ePos').value, 10);
    if (!a || !(v >= 0)) {
      renderEditor(false);
      return;
    }
    a.y = v;
    commit(a);
  });

  // Target button: use the current scroll position of the page.
  $('eCur').addEventListener('click', async () => {
    const a = current();
    const r = await toPage({ type: 'getScroll' });
    if (!a || !r || !r.ok) {
      message(r ? r.reason : 'Page unreachable');
      return;
    }
    a.y = r.y;
    commit(a);
    renderEditor(false);
  });

  $('eClose').addEventListener('click', () => {
    state.editingId = null;
    renderList();
  });

  $('eReset').addEventListener('click', () => {
    const a = current();
    if (!a) return;
    delete a.speed;
    delete a.pause;
    delete a.easing;
    commit(a);
    renderEditor(true);
  });
}

// Anchors changed in storage while the popup is open (shortcut, "+" button, content script).
export function onAnchorsChanged(list) {
  if (document.body.classList.contains('dragging')) return;
  state.anchors = list || [];
  if (state.editingId && !current()) state.editingId = null;
  // Typing in the editor: only refresh the row, so the field keeps its focus.
  if ($('editor').contains(document.activeElement)) {
    const a = current();
    if (a) refreshRow(a);
    return;
  }
  renderList();
  renderEditor(false);
}

export function resetMessage() {
  message('');
}

export function setupAnchorsTab() {
  setupNextSettings();
  setupListButtons();
  setupEditor();
}
