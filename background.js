// Service worker: viewport size, countdown, capture, download, keyboard shortcuts, and the
// relay between the popup and the page (content scripts).

importScripts('lib/defaults.js', 'lib/files.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =====================================================================
// Toolbar icon
// =====================================================================

// Chrome doesn't accept SVG icons in the manifest, so the toolbar icon is drawn from
// assets/icons/toolbar.svg into a canvas. Supports what that file uses: filled <path> and <rect>
// shapes inside one translated group.
async function setToolbarIcon() {
  try {
    const svg = await (await fetch(chrome.runtime.getURL('assets/icons/toolbar.svg'))).text();
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1].split(/\s+/).map(Number);
    const tr = (svg.match(/translate\(([-\d.]+)[\s,]+([-\d.]+)\)/) || [0, 0, 0]).slice(1).map(Number);
    const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
    const shapes = [...svg.matchAll(/<(path|rect)\b[^>]*>/g)].map((m) => m[0]);
    const imageData = {};
    for (const size of [16, 32]) {
      const ctx = new OffscreenCanvas(size, size).getContext('2d');
      ctx.scale(size / vb[2], size / vb[3]);
      ctx.translate(tr[0] - vb[0], tr[1] - vb[1]);
      for (const tag of shapes) {
        ctx.fillStyle = attr(tag, 'fill') || '#000';
        if (tag.startsWith('<path')) {
          ctx.fill(new Path2D(attr(tag, 'd')));
          continue;
        }
        const [x, y, w, h, rx] = ['x', 'y', 'width', 'height', 'rx'].map((k) => +attr(tag, k) || 0);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, rx);
        ctx.fill();
      }
      imageData[size] = ctx.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn('Key Scroll: could not draw the toolbar icon', e);
  }
}
setToolbarIcon();
chrome.runtime.onStartup.addListener(setToolbarIcon);

// =====================================================================
// Storage migrations (run on install / update / reload)
// =====================================================================

chrome.runtime.onInstalled.addListener(async () => {
  const { globals = {} } = await chrome.storage.local.get('globals');
  await freezeAnchorValues(globals);
  // A default easing changed since this install: apply the new one once.
  if ((globals.defaultsVersion || 1) < KS_DEFAULTS_VERSION) {
    await chrome.storage.local.set({
      globals: { ...globals, easing: KS_ANCHOR_DEFAULTS.easing.slice(), defaultsVersion: KS_DEFAULTS_VERSION }
    });
  }
});

// v0.1.0: the settings at the top of the popup (`globals`) stopped being global; they now only
// pre-fill new anchors. Once: anchors without their own values (which followed those settings)
// get the values of that moment, so they keep scrolling the same way.
async function freezeAnchorValues(globals) {
  const all = await chrome.storage.local.get(null);
  if (all.anchorsFrozen) return;
  const own = ksAnchorOwnValues({ ...KS_ANCHOR_DEFAULTS, ...globals });
  const out = { anchorsFrozen: true };
  for (const [key, list] of Object.entries(all)) {
    if (!key.startsWith('anchors:') || !Array.isArray(list)) continue;
    let changed = false;
    for (const a of list) {
      for (const p of ['speed', 'pause', 'easing']) {
        if (a[p] == null && own[p] != null) {
          a[p] = Array.isArray(own[p]) ? own[p].slice() : own[p];
          changed = true;
        }
      }
    }
    if (changed) out[key] = list;
  }
  await chrome.storage.local.set(out);
}

// =====================================================================
// Session state (the service worker can be stopped in the middle of a recording)
// =====================================================================

async function getS() {
  return (await chrome.storage.session.get('s')).s || {};
}
async function setS(patch) {
  const s = { ...(await getS()), ...patch };
  await chrome.storage.session.set({ s });
  return s;
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

// Short feedback in the toolbar badge (never in the page, so it can't end up in the video).
async function flashBadge(text, color) {
  const s = await getS();
  if (s.recording || s.busy) return;
  await setBadge(text, color);
  setTimeout(async () => {
    const s2 = await getS();
    if (!s2.recording && !s2.busy) await setBadge('');
  }, 1200);
}

// =====================================================================
// Viewport: resizing the browser window
// =====================================================================

async function measure(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      iw: innerWidth,
      ih: innerHeight,
      ow: outerWidth,
      oh: outerHeight,
      dpr: devicePixelRatio,
      availW: screen.availWidth,
      availH: screen.availHeight
    })
  });
  return result;
}

async function applyViewport(tabId, width, height) {
  const tab = await chrome.tabs.get(tabId);
  const win = await chrome.windows.get(tab.windowId);
  const s = await getS();
  if (!s.origBounds) {
    await setS({
      origBounds: { left: win.left, top: win.top, width: win.width, height: win.height, state: win.state },
      origWindowId: win.id
    });
  }
  if (win.state !== 'normal') {
    await chrome.windows.update(win.id, { state: 'normal' });
    await sleep(400);
  }
  // Two passes: the second one fixes any remaining gap (toolbars changing size, rounding).
  let m = await measure(tabId);
  for (let pass = 0; pass < 2; pass++) {
    if (m.iw === width && m.ih === height) break;
    const w = await chrome.windows.get(win.id);
    await chrome.windows.update(win.id, { width: w.width + (width - m.iw), height: w.height + (height - m.ih) });
    await sleep(400);
    m = await measure(tabId);
  }
  return m;
}

async function resetViewport() {
  const s = await getS();
  if (!s.origBounds) return;
  const b = s.origBounds;
  try {
    if (b.state === 'normal') {
      await chrome.windows.update(s.origWindowId, { left: b.left, top: b.top, width: b.width, height: b.height });
    } else {
      await chrome.windows.update(s.origWindowId, { state: b.state });
    }
  } catch (e) {
    /* window closed */
  }
  await setS({ origBounds: null });
}

// =====================================================================
// Recording
// =====================================================================

async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctx.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record the tab and encode the video'
  });
}

// The state says "recording" but there is no offscreen document: the state is stale.
async function cleanStaleState() {
  const s = await getS();
  if (!s.recording && !s.busy) return s;
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!ctx.length && s.recording) {
    await setBadge('');
    return await setS({ recording: false });
  }
  return s;
}

// Capture helper layer in the page (see content/capture-assist.js). Never blocks the recording.
async function setAssist(tabId, on) {
  if (tabId == null) return null;
  try {
    return await toContent(tabId, { type: on ? 'assist-on' : 'assist-off' });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// CSS preview, remembered per tab (survives page reloads). It alone decides whether the custom
// CSS is applied, including during a recording.
async function setPreviewState(tabId, on) {
  const st = await getS();
  const tabs = new Set(st.previewTabs || []);
  if (on) tabs.add(tabId);
  else tabs.delete(tabId);
  await setS({ previewTabs: [...tabs] });
  try {
    return await toContent(tabId, { type: 'preview', on: !!on });
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

// When a recording starts the preview is forced on (the previous state is kept); it is restored at the end.
async function forcePreviewForRecording(tabId) {
  const st = await getS();
  await setS({ previewBefore: { tabId, on: (st.previewTabs || []).includes(tabId) } });
  await setPreviewState(tabId, true);
}
async function restorePreviewAfterRecording() {
  const st = await getS();
  if (!st.previewBefore) return;
  await setS({ previewBefore: null });
  await setPreviewState(st.previewBefore.tabId, st.previewBefore.on);
}

// Recording options saved in the settings page, with defaults for missing values.
async function recOptions() {
  const rec = (await chrome.storage.local.get('recOptions')).recOptions || {};
  return {
    quality: rec.quality > 0 ? rec.quality : KS_REC_DEFAULTS.quality,
    countdown: Number.isInteger(rec.countdown) && rec.countdown >= 0 ? rec.countdown : KS_REC_DEFAULTS.countdown,
    fps: KS_FPS_OPTIONS.includes(rec.fps) ? rec.fps : KS_REC_DEFAULTS.fps,
    debug: !!rec.debug
  };
}

// width / height: the size asked for in the popup, only used to warn when the viewport differs.
async function startFlow({ tabId, width, height }) {
  const { quality, countdown, fps } = await recOptions();
  const bitrate = Math.round(quality * 1e6);
  const s0 = await cleanStaleState();
  if (s0.busy || s0.recording) return;
  await setS({ busy: true, cancel: false, error: null, lastResult: null });
  let assistRes = null;
  try {
    // Recording never touches the window: the viewport is captured as it is.
    const actual = await measure(tabId);
    // The tab title at start is used for the file name.
    try {
      await setS({ tabTitle: (await chrome.tabs.get(tabId)).title || '' });
    } catch (e) {
      await setS({ tabTitle: '' });
    }
    // H.264 needs even dimensions.
    const capW = actual.iw - (actual.iw % 2);
    const capH = actual.ih - (actual.ih % 2);
    const warning =
      width && height && (actual.iw !== width || actual.ih !== height)
        ? `Current viewport ${actual.iw}×${actual.ih}, different from the popup's ${width}×${height} (click “Apply size” before recording if needed)`
        : null;

    // CSS applied from the countdown on, so the page has time to settle before the first frame.
    await forcePreviewForRecording(tabId);
    for (let i = countdown; i > 0; i--) {
      await setBadge(String(i), '#d33');
      await sleep(1000);
      if ((await getS()).cancel) throw new Error('Cancelled during the countdown');
    }

    // The helper layer is set before the capture starts, so it is active from the first frame.
    assistRes = await setAssist(tabId, true);
    await ensureOffscreen();
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const res = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'start',
      streamId,
      fps,
      bitrate,
      width: capW,
      height: capH
    });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Failed to start in the offscreen document');
    await setS({
      recording: true,
      tabId,
      startInfo: {
        requested: { width, height },
        actualViewport: actual,
        captureSize: `${capW}x${capH}`,
        warning,
        assist: assistRes,
        ...res.info
      }
    });
    await setBadge('REC', '#d33');
  } catch (e) {
    if (assistRes) await setAssist(tabId, false);
    await restorePreviewAfterRecording();
    await setS({ error: String((e && e.message) || e), recording: false });
    await setBadge('ERR', '#888');
  } finally {
    await setS({ busy: false });
  }
}

async function stopFlow() {
  const s = await cleanStaleState();
  if (s.busy && !s.recording) {
    await setS({ cancel: true });
    return;
  }
  if (s.recording) await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
}

async function onRecordingDone(msg) {
  const s = await getS();
  await setAssist(s.tabId, false);
  await restorePreviewAfterRecording();
  const { output } = await chrome.storage.local.get('output');
  const folder = (output && output.folder) ?? KS_OUTPUT_DEFAULTS.folder;
  const filename = ksRecordingPath(folder, s.tabTitle, msg.ext);
  let downloadId = null;
  try {
    downloadId = await chrome.downloads.download({ url: msg.url, filename, saveAs: false });
  } catch (e) {
    await setS({ error: 'Download: ' + e.message });
  }
  // Diagnostic log next to the video (debug option).
  let logFile = null;
  if (msg.logUrl && (await recOptions()).debug) {
    logFile = filename.replace(/\.[^.]+$/, '.log.json');
    try {
      await chrome.downloads.download({ url: msg.logUrl, filename: logFile, saveAs: false });
    } catch (e) {
      logFile = null;
    }
  }
  await setS({
    recording: false,
    lastResult: { filename, logFile, downloadId, mime: msg.mime, stats: msg.stats, start: s.startInfo }
  });
  await setBadge('');
  // Close the offscreen document later, unless a new recording started in the meantime.
  setTimeout(async () => {
    const now = await getS();
    if (now.recording || now.busy) return;
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      /* already closed */
    }
  }, 60000);
}

// =====================================================================
// Relay to the content scripts (anchors, scrolling, CSS, picker)
// =====================================================================

async function toContent(tabId, msg) {
  const payload = { target: 'content', ...msg };
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (e) {
    // Tab opened before the extension was installed / reloaded: inject the content scripts
    // (same list as in the manifest).
    const files = chrome.runtime.getManifest().content_scripts[0].js;
    await chrome.scripting.executeScript({ target: { tabId }, files });
    return await chrome.tabs.sendMessage(tabId, payload);
  }
}

// =====================================================================
// Messages
// =====================================================================

const handlers = {
  ping: () => ({ ok: true }),

  // A (re)loaded page asks whether it must restore the capture helper and the CSS preview.
  'assist-query': async (_msg, sender) => {
    const st = await getS();
    const tabId = sender.tab && sender.tab.id;
    return { on: !!(st.recording && tabId === st.tabId), preview: (st.previewTabs || []).includes(tabId) };
  },

  picked: async () => {
    await flashBadge('✓', '#2a7');
    return { ok: true };
  },

  'preview-set': async (msg) => {
    const r = await setPreviewState(msg.tabId, msg.on);
    return { ok: true, preview: !!msg.on, content: r };
  },

  status: async () => ({ ok: true, state: await cleanStaleState() }),

  apply: async (msg) => {
    try {
      const m = await applyViewport(msg.tabId, msg.width, msg.height);
      const warning =
        m.iw !== msg.width || m.ih !== msg.height
          ? `Got ${m.iw}×${m.ih} instead of ${msg.width}×${msg.height}: the browser limited the window to the screen.`
          : null;
      return { ok: true, measured: m, warning };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  },

  reset: async () => {
    await resetViewport();
    return { ok: true };
  },

  start: async (msg) => {
    await chrome.storage.local.set({ settings: { width: msg.opts.width, height: msg.opts.height } });
    startFlow(msg.opts); // not awaited: the countdown runs in the background
    return { ok: true };
  },

  stop: async () => {
    await stopFlow();
    return { ok: true };
  },

  content: async (msg) => {
    try {
      return await toContent(msg.tabId, msg.msg);
    } catch (e) {
      return { ok: false, reason: String(e.message || e) };
    }
  },

  done: async (msg) => {
    await onRecordingDone(msg);
    return { ok: true };
  },

  'offscreen-error': async (msg) => {
    await setAssist((await getS()).tabId, false);
    await restorePreviewAfterRecording();
    await setS({ recording: false, busy: false, error: msg.error });
    await setBadge('ERR', '#888');
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      /* already closed */
    }
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'background' || !handlers[msg.type]) return;
  Promise.resolve(handlers[msg.type](msg, sender)).then(sendResponse);
  return true; // async response
});

// =====================================================================
// Keyboard shortcuts (manifest "commands")
// =====================================================================

const ANCHOR_COMMANDS = { 'next-anchor': 'next', 'prev-anchor': 'prev', 'add-anchor': 'add', 'run-playback': 'play' };

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;

  if (ANCHOR_COMMANDS[command]) {
    try {
      const r = await toContent(tab.id, { type: ANCHOR_COMMANDS[command] });
      if (command === 'add-anchor' && r && r.ok) await flashBadge(r.duplicate ? '=' : '+' + r.count, '#2a7');
      else if (r && !r.ok) await flashBadge('–', '#888');
    } catch (e) {
      await flashBadge('ERR', '#888');
    }
    return;
  }

  if (command !== 'toggle-recording') return;
  const s = await getS();
  if (s.busy || s.recording) {
    await stopFlow();
    return;
  }
  const { settings } = await chrome.storage.local.get('settings');
  startFlow({ ...(settings || {}), tabId: tab.id });
});

// Tab closed: forget its CSS preview state.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const st = await getS();
  if ((st.previewTabs || []).includes(tabId)) await setS({ previewTabs: st.previewTabs.filter((t) => t !== tabId) });
});
