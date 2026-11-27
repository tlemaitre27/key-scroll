// Record tab: start / stop, hidden scrollbars, recording log, viewport size.

import { $, icon, state, send, patchStored } from './dom.js';
import { setPreviewButton } from './css-tab.js';

let recording = false; // recording or countdown in progress

const size = () => ({ width: parseInt($('w').value, 10), height: parseInt($('h').value, 10) });

// =====================================================================
// Recording
// =====================================================================

async function startRecording() {
  await send({ type: 'start', opts: { tabId: state.tabId, ...size() } });
  showLog('Countdown...');
}
const stopRecording = () => send({ type: 'stop' });

// One "key: value" line per piece of information.
function showLog(value) {
  const out = $('out');
  out.classList.remove('idle');
  if (typeof value === 'string') {
    out.textContent = value;
    return;
  }
  out.textContent = Object.entries(value)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function setRecording(on) {
  recording = on;
  $('hRec').classList.toggle('recording', on);
  $('hRec').title = on ? 'Stop recording' : 'Record';
}

// Shows the recording state kept by the service worker (session storage).
export function renderStatus(s) {
  setRecording(!!(s.recording || s.busy));
  setPreviewButton((s.previewTabs || []).includes(state.tabId));
  if (s.error) return showLog('Error: ' + s.error);
  if (s.recording) {
    const info = s.startInfo || {};
    return showLog({ state: 'RECORDING', size: info.captureSize, format: info.mime, warning: info.warning });
  }
  if (s.busy) return showLog('Countdown / preparing...');
  if (s.lastResult) {
    const st = s.lastResult.stats || {};
    return showLog({
      state: 'Done',
      file: s.lastResult.filename,
      log: s.lastResult.logFile || '—',
      format: s.lastResult.mime + (st.codec ? ` (${st.codec}, ${st.fps} fps constant)` : ''),
      size: st.videoSize,
      MB: st.sizeMB,
      seconds: st.seconds,
      ...(st.pipeline === 'webcodecs'
        ? {
            framesCaptured: st.framesCaptured,
            framesWritten: st.framesWritten,
            duplicated: st.duplicated,
            skipped: st.skipped,
            maxCaptureGapMs: st.maxCaptureGapMs
          }
        : { pipeline: st.pipeline })
    });
  }
}

export async function refreshStatus() {
  const r = await send({ type: 'status' });
  if (r && r.ok) renderStatus(r.state);
}

// =====================================================================
// Viewport size
// =====================================================================

// Linked ratio: when one field changes, the other follows to keep the ratio of the moment the
// link was turned on (or the last preset picked).
let ratio = null; // width / height
const captureRatio = () => {
  const { width, height } = size();
  ratio = width > 0 && height > 0 ? width / height : null;
};
const isLinked = () => $('ratioLink').getAttribute('aria-pressed') === 'true';

export function setLinked(on, save = true) {
  const btn = $('ratioLink');
  btn.setAttribute('aria-pressed', String(!!on));
  btn.querySelector('img').src = icon(on ? 'link' : 'unlink');
  btn.title = on ? 'Width and height are linked (click to unlink)' : 'Link width and height (keeps the current ratio)';
  if (on) captureRatio();
  if (save) patchStored('recOptions', { linkRatio: !!on });
}

// Presets added in the settings page, after the standard presets.
export async function renderUserPresets() {
  const list = (await chrome.storage.local.get('sizePresets')).sizePresets || [];
  const select = $('preset');
  select.querySelector('optgroup.user')?.remove();
  if (!list.length) return;
  const group = document.createElement('optgroup');
  group.className = 'user';
  group.label = 'My presets';
  for (const p of list) group.appendChild(new Option(ksPresetLabel(p), `${p.w}x${p.h}`));
  select.appendChild(group);
}

function setupSize() {
  $('ratioLink').addEventListener('click', () => setLinked(!isLinked()));
  $('w').addEventListener('input', () => {
    const w = parseInt($('w').value, 10);
    if (isLinked() && ratio && w > 0) $('h').value = Math.max(1, Math.round(w / ratio));
  });
  $('h').addEventListener('input', () => {
    const h = parseInt($('h').value, 10);
    if (isLinked() && ratio && h > 0) $('w').value = Math.max(1, Math.round(h * ratio));
  });

  $('preset').addEventListener('change', () => {
    const v = $('preset').value;
    if (!v) return;
    const [w, h] = v.split('x');
    $('w').value = w;
    $('h').value = h;
    if (isLinked()) captureRatio(); // the picked preset becomes the reference ratio
  });

  $('apply').addEventListener('click', async () => {
    const { width, height } = size();
    showLog('Applying...');
    const r = await send({ type: 'apply', tabId: state.tabId, width, height });
    showLog(
      r.ok
        ? { requested: `${width}×${height}`, obtained: `${r.measured.iw}×${r.measured.ih}`, warning: r.warning }
        : 'Error: ' + r.error
    );
  });

  $('reset').addEventListener('click', async () => {
    await send({ type: 'reset' });
    showLog('Size reset.');
  });
}

export async function setupRecordTab() {
  const st = await chrome.storage.local.get(['settings', 'recOptions']);
  const rec = st.recOptions || {};
  const sz = { width: KS_REC_DEFAULTS.width, height: KS_REC_DEFAULTS.height, ...(st.settings || {}) };
  $('w').value = sz.width;
  $('h').value = sz.height;
  setLinked(!!rec.linkRatio, false);
  setupSize();
  renderUserPresets();

  $('rec').addEventListener('click', startRecording);
  $('stop').addEventListener('click', stopRecording);
  $('hRec').addEventListener('click', () => (recording ? stopRecording() : startRecording()));

  $('hideScrollbars').checked = !!rec.hideScrollbars;
  $('hideScrollbars').addEventListener('change', () =>
    patchStored('recOptions', { hideScrollbars: $('hideScrollbars').checked })
  );
}
