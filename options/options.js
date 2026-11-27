// Settings page: files, size presets, recording and popup defaults, cursor and custom icons.
// Shares its storage with the popup: changing a value in one changes it in the other.

const $ = (id) => document.getElementById(id);
const PREVIEW_ZOOM = 3; // icon previews are enlarged so the hotspot can be placed precisely

let cursor = { ...KS_CURSOR_DEFAULTS };
let icons = {}; // saved custom icons (only the ones that were changed)

const flashSaved = () => {
  $('saved').classList.add('on');
  clearTimeout(flashSaved.t);
  flashSaved.t = setTimeout(() => $('saved').classList.remove('on'), 1200);
};
const saveCursor = () => chrome.storage.local.set({ cursor }).then(flashSaved);
const saveIcons = () => chrome.storage.local.set({ cursorIcons: icons }).then(flashSaved);
const iconOf = (shape) => icons[shape] || KS_CURSOR_CUSTOM_DEFAULT[shape];

// ---------- Cursor: style / movement / size / smoothing ----------
const fmtScale = (v) => (+v).toFixed(2).replace(/\.?0+$/, '') + '×';
const fmtMs = (v) => v + ' ms';

// Shows the current settings in the controls (on load, after a popup change, after a reset).
function syncControls() {
  $('mode').value = cursor.mode;
  $('style').value = cursor.style;
  $('motion').value = cursor.motion;
  $('scale').value = cursor.scale;
  $('scaleOut').textContent = fmtScale(cursor.scale);
  $('smoothing').value = cursor.smoothing;
  $('smoothingOut').textContent = fmtMs(cursor.smoothing);
  $('shadow').checked = !!cursor.shadow;
  $('clicks').checked = !!cursor.clicks;
  // Smoothing only applies to the fluid movement.
  $('smoothing')
    .closest('.slider')
    .classList.toggle('off', cursor.motion !== 'fluid');
}

function setupControls() {
  const slider = (id, key, fmt, num) => {
    const el = $(id),
      out = $(id + 'Out');
    el.addEventListener('input', () => {
      cursor[key] = num(el.value);
      out.textContent = fmt(cursor[key]);
      renderTest();
    });
    el.addEventListener('change', saveCursor);
  };
  slider('scale', 'scale', fmtScale, parseFloat);
  slider('smoothing', 'smoothing', fmtMs, (v) => parseInt(v, 10));
  const field = (id, key, read) =>
    $(id).addEventListener('change', () => {
      cursor[key] = read($(id));
      syncControls();
      renderTest();
      saveCursor();
    });
  field('mode', 'mode', (el) => el.value);
  field('style', 'style', (el) => el.value);
  field('motion', 'motion', (el) => el.value);
  field('shadow', 'shadow', (el) => el.checked);
  field('clicks', 'clicks', (el) => el.checked);
  $('resetCursor').addEventListener('click', () => {
    cursor = { ...KS_CURSOR_DEFAULTS };
    syncControls();
    renderTest();
    saveCursor();
  });
  syncControls();
}

// ---------- Custom style icons ----------
function renderIcons() {
  const box = $('icons');
  box.innerHTML = '';
  for (const shape of KS_CURSOR_SHAPES) {
    const ic = iconOf(shape);
    const card = document.createElement('div');
    card.className = 'icon';
    card.innerHTML = `
      <h3>${KS_CURSOR_SHAPE_LABELS[shape]} ${icons[shape] ? '<span class="custom-tag">custom</span>' : '<small>default</small>'}</h3>
      <div class="stage"><img alt=""><div class="dot"></div></div>
      <div class="hs">Hotspot x <input type="number" step="0.5" class="hx"> y <input type="number" step="0.5" class="hy"></div>
      <textarea spellcheck="false" placeholder="<svg ...>...</svg>"></textarea>
      <div class="err"></div>
      <div class="row">
        <button class="btn import">Import SVG...</button>
        <button class="btn reset" ${icons[shape] ? '' : 'disabled'}>Reset</button>
        <input type="file" accept=".svg,image/svg+xml" hidden>
      </div>`;
    const img = card.querySelector('img'),
      stage = card.querySelector('.stage');
    const hx = card.querySelector('.hx'),
      hy = card.querySelector('.hy'),
      ta = card.querySelector('textarea'),
      err = card.querySelector('.err');
    const file = card.querySelector('input[type=file]');
    const draw = (icon) => {
      const { w, h } = ksSvgSize(icon.svg);
      img.src = ksSvgUrl(icon.svg);
      img.style.width = w * PREVIEW_ZOOM + 'px';
      img.style.height = h * PREVIEW_ZOOM + 'px';
      // Hotspot in the center of the preview.
      img.style.transform = `translate(${-icon.hx * PREVIEW_ZOOM}px, ${-icon.hy * PREVIEW_ZOOM}px)`;
      hx.value = icon.hx;
      hy.value = icon.hy;
    };
    draw(ic);
    ta.value = ic.svg;

    const commit = (patch) => {
      const next = { ...iconOf(shape), ...patch };
      icons[shape] = next;
      saveIcons();
      draw(next);
      card.querySelector('h3').innerHTML = `${KS_CURSOR_SHAPE_LABELS[shape]} <span class="custom-tag">custom</span>`;
      card.querySelector('.reset').disabled = false;
      renderTest();
    };
    const setSvg = (svg) => {
      svg = String(svg || '').trim();
      if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
        err.textContent = 'Not a valid SVG (must start with <svg and end with </svg>).';
        return;
      }
      err.textContent = '';
      const { w, h } = ksSvgSize(svg);
      const cur = iconOf(shape);
      // New drawing: the hotspot keeps its relative position.
      const old = ksSvgSize(cur.svg);
      commit({ svg, hx: +((cur.hx / old.w) * w).toFixed(2), hy: +((cur.hy / old.h) * h).toFixed(2) });
    };

    stage.addEventListener('click', (e) => {
      // Click in the preview: new hotspot (relative to the displayed icon).
      const r = img.getBoundingClientRect();
      const { w, h } = ksSvgSize(iconOf(shape).svg);
      const x = Math.max(0, Math.min(w, (e.clientX - r.left) / PREVIEW_ZOOM));
      const y = Math.max(0, Math.min(h, (e.clientY - r.top) / PREVIEW_ZOOM));
      commit({ hx: +x.toFixed(1), hy: +y.toFixed(1) });
    });
    hx.addEventListener('change', () => commit({ hx: parseFloat(hx.value) || 0 }));
    hy.addEventListener('change', () => commit({ hy: parseFloat(hy.value) || 0 }));
    ta.addEventListener('change', () => setSvg(ta.value));
    card.querySelector('.import').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const text = await f.text();
      ta.value = text.trim();
      setSvg(text);
      file.value = '';
    });
    card.querySelector('.reset').addEventListener('click', () => {
      delete icons[shape];
      saveIcons();
      renderIcons();
      renderTest();
    });
    box.appendChild(card);
  }
}

// ---------- Cursor test area ----------
const test = { x: 0, y: 0, tx: 0, ty: 0, inside: false, shape: 'arrow', last: 0, imgs: {} };

function renderTest() {
  const set = ksCursorIconSet(cursor.style, icons);
  const sc = document.querySelector('#testCursor .s');
  sc.innerHTML = '';
  for (const k of KS_CURSOR_SHAPES) {
    const ic = set[k];
    const { w, h } = ksSvgSize(ic.svg);
    const img = document.createElement('img');
    img.src = ksSvgUrl(ic.svg);
    img.style.cssText = `width:${w * cursor.scale}px;height:${h * cursor.scale}px;left:${-ic.hx * cursor.scale}px;top:${-ic.hy * cursor.scale}px;display:${k === test.shape ? 'block' : 'none'};filter:${cursor.shadow ? ksCursorShadow(cursor.scale) : 'none'}`;
    sc.appendChild(img);
    test.imgs[k] = img;
  }
}

function setTestShape(shape) {
  if (test.shape === shape) return;
  test.shape = shape;
  for (const k in test.imgs) test.imgs[k].style.display = k === shape ? 'block' : 'none';
}

function setupTest() {
  const zone = $('test'),
    el = $('testCursor'),
    sc = el.querySelector('.s');
  // Shape wanted by each target (the real cursor is hidden in the area, so it can't be read).
  let dragging = false;
  const shapeAt = (t) => {
    const s = ((t.closest && t.closest('[data-shape]')) || {}).dataset?.shape || 'arrow';
    return s === 'grab' && dragging ? 'grabbing' : s;
  };
  zone.addEventListener('pointermove', (e) => {
    const r = zone.getBoundingClientRect();
    test.tx = e.clientX - r.left;
    test.ty = e.clientY - r.top;
    if (!test.inside) {
      test.inside = true;
      test.x = test.tx;
      test.y = test.ty;
      el.style.opacity = '1';
    }
    setTestShape(shapeAt(e.target));
  });
  zone.addEventListener('pointerleave', () => {
    test.inside = false;
    el.style.opacity = '0';
  });
  zone.addEventListener('pointerdown', (e) => {
    if (cursor.clicks) sc.classList.add('down');
    dragging = !!(e.target.closest && e.target.closest('.drag'));
    requestAnimationFrame(() => setTestShape(shapeAt(e.target)));
  });
  addEventListener('pointerup', (e) => {
    sc.classList.remove('down');
    dragging = false;
    if (test.inside) requestAnimationFrame(() => setTestShape(shapeAt(e.target)));
  });
  el.style.opacity = '0';
  const frame = (now) => {
    const dt = Math.min(64, now - (test.last || now));
    test.last = now;
    // Same computation as the recorded cursor (content/cursor.js).
    if (cursor.motion === 'fluid') {
      const k = 1 - Math.exp(-dt / Math.max(10, cursor.smoothing));
      test.x += (test.tx - test.x) * k;
      test.y += (test.ty - test.y) * k;
    } else {
      test.x = test.tx;
      test.y = test.ty;
    }
    const d = devicePixelRatio || 1,
      px = (v) => Math.round(v * d) / d;
    el.style.transform = `translate(${px(test.x)}px, ${px(test.y)}px)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------- Files ----------
let output = { ...KS_OUTPUT_DEFAULTS };
const saveOutput = () => chrome.storage.local.set({ output }).then(flashSaved);

function renderPreview() {
  $('namePreview').textContent = ksRecordingPath(output.folder, 'Tab title', 'mp4');
}
function renderOutput() {
  $('folder').value = output.folder;
  renderPreview();
}

function setupOutput() {
  // While typing only the preview changes; the field is cleaned up on commit.
  $('folder').addEventListener('input', () => {
    output.folder = $('folder').value;
    renderPreview();
  });
  $('folder').addEventListener('change', () => {
    output.folder = ksCleanFolder($('folder').value);
    renderOutput();
    saveOutput();
  });
  $('resetOutput').addEventListener('click', () => {
    output = { ...KS_OUTPUT_DEFAULTS };
    renderOutput();
    saveOutput();
  });
  renderOutput();
}

// ---------- Recording and popup defaults (size, countdown, scrollbars, fps, new anchors) ----------
let rec = { ...KS_REC_DEFAULTS }; // settings.width/height + recOptions
let globals = { ...KS_ANCHOR_DEFAULTS }; // speed / pause / easing given to new anchors

async function saveRec() {
  const st = await chrome.storage.local.get(['settings', 'recOptions']);
  await chrome.storage.local.set({
    settings: { ...(st.settings || {}), width: rec.width, height: rec.height },
    recOptions: {
      ...(st.recOptions || {}),
      countdown: rec.countdown,
      hideScrollbars: rec.hideScrollbars,
      quality: rec.quality,
      fps: rec.fps,
      debug: rec.debug
    }
  });
  flashSaved();
}
const saveGlobals = () => chrome.storage.local.set({ globals }).then(flashSaved);

function syncRec() {
  $('recW').value = rec.width;
  $('recH').value = rec.height;
  $('recQuality').value = String(rec.quality);
  $('recFps').value = String(rec.fps);
  $('recDebug').checked = !!rec.debug;
  $('recCountdown').value = rec.countdown;
  $('recScroll').checked = !!rec.hideScrollbars;
  $('aSpeed').value = globals.speed;
  $('aPause').value = globals.pause;
  $('aEase').value = ksFormatEasing(globals.easing);
  $('aEase').classList.remove('invalid');
}

function setupRec() {
  for (const name of Object.keys(KS_PRESETS)) $('aPreset').add(new Option(KS_PRESET_LABELS[name] || name, name));
  for (const fps of KS_FPS_OPTIONS) $('recFps').add(new Option(`${fps} fps`, String(fps)));
  // Integer >= min, otherwise the field goes back to the saved value.
  const num = (id, min, apply) =>
    $(id).addEventListener('change', () => {
      const v = parseInt($(id).value, 10);
      if (v >= min) apply(v);
      else syncRec();
      syncRec();
    });
  num('recW', 100, (v) => {
    rec.width = v;
    saveRec();
  });
  num('recH', 100, (v) => {
    rec.height = v;
    saveRec();
  });
  num('recCountdown', 0, (v) => {
    rec.countdown = Math.min(10, v);
    saveRec();
  });
  $('recQuality').addEventListener('change', () => {
    rec.quality = parseFloat($('recQuality').value);
    saveRec();
  });
  $('recFps').addEventListener('change', () => {
    rec.fps = parseInt($('recFps').value, 10);
    saveRec();
  });
  $('recDebug').addEventListener('change', () => {
    rec.debug = $('recDebug').checked;
    saveRec();
  });
  $('recScroll').addEventListener('change', () => {
    rec.hideScrollbars = $('recScroll').checked;
    saveRec();
  });
  num('aSpeed', 1, (v) => {
    globals.speed = v;
    saveGlobals();
  });
  num('aPause', 0, (v) => {
    globals.pause = v;
    saveGlobals();
  });
  $('aEase').addEventListener('change', () => {
    const e = ksParseEasing($('aEase').value);
    if (e) {
      globals.easing = e;
      saveGlobals();
      syncRec();
    } else $('aEase').classList.add('invalid');
  });
  $('aPreset').addEventListener('change', () => {
    const e = KS_PRESETS[$('aPreset').value];
    $('aPreset').value = '';
    if (e) {
      globals.easing = e.slice();
      saveGlobals();
      syncRec();
    }
  });
  $('resetRec').addEventListener('click', async () => {
    rec = { ...KS_REC_DEFAULTS };
    globals = { ...KS_ANCHOR_DEFAULTS, easing: KS_ANCHOR_DEFAULTS.easing.slice(), defaultsVersion: KS_DEFAULTS_VERSION };
    syncRec();
    await saveRec();
    await saveGlobals();
  });
  syncRec();
}

// ---------- Size presets ----------
let presets = [];
const savePresets = () => chrome.storage.local.set({ sizePresets: presets }).then(flashSaved);
const intOf = (el) => parseInt(el.value, 10);

function renderPresets() {
  const box = $('presetList');
  box.innerHTML = presets.length ? '' : '<p class="lead" style="margin:0">No custom preset.</p>';
  presets.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'presetRow';
    row.innerHTML = `<input type="number" min="100" class="w"><span>×</span><input type="number" min="100" class="h">
      <input type="text" class="n" placeholder="Name (optional)"><span class="r"></span>
      <span class="row"><button class="btn icon up" title="Move up">↑</button><button class="btn icon del" title="Delete">✕</button></span>`;
    const q = (s) => row.querySelector(s);
    q('.w').value = p.w;
    q('.h').value = p.h;
    q('.n').value = p.name || '';
    q('.r').textContent = ksRatioLabel(p.w, p.h);
    const commit = () => {
      const w = intOf(q('.w')),
        h = intOf(q('.h'));
      if (w >= 100 && h >= 100) {
        p.w = w;
        p.h = h;
      }
      p.name = q('.n').value.trim();
      renderPresets();
      savePresets();
    };
    for (const s of ['.w', '.h', '.n']) q(s).addEventListener('change', commit);
    q('.up').disabled = i === 0;
    q('.up').addEventListener('click', () => {
      [presets[i - 1], presets[i]] = [presets[i], presets[i - 1]];
      renderPresets();
      savePresets();
    });
    q('.del').addEventListener('click', () => {
      presets.splice(i, 1);
      renderPresets();
      savePresets();
    });
    box.appendChild(row);
  });
}

function setupPresets() {
  const preview = () => {
    $('npRatio').textContent = ksRatioLabel(intOf($('npW')), intOf($('npH')));
  };
  $('npW').addEventListener('input', preview);
  $('npH').addEventListener('input', preview);
  $('npAdd').addEventListener('click', () => {
    const w = intOf($('npW')),
      h = intOf($('npH'));
    $('npW').classList.toggle('invalid', !(w >= 100));
    $('npH').classList.toggle('invalid', !(h >= 100));
    if (!(w >= 100 && h >= 100)) return;
    presets.push({ w, h, name: $('npName').value.trim() });
    $('npW').value = $('npH').value = $('npName').value = '';
    preview();
    renderPresets();
    savePresets();
  });
  renderPresets();
}

// ---------- Init ----------
(async () => {
  const r = await chrome.storage.local.get([
    'cursor',
    'cursorIcons',
    'output',
    'settings',
    'recOptions',
    'globals',
    'sizePresets'
  ]);
  presets = r.sizePresets || [];
  setupPresets();
  output = { ...KS_OUTPUT_DEFAULTS, ...(r.output || {}) };
  const o = r.recOptions || {},
    sz = r.settings || {};
  rec = {
    width: sz.width || KS_REC_DEFAULTS.width,
    height: sz.height || KS_REC_DEFAULTS.height,
    countdown: Number.isInteger(o.countdown) ? o.countdown : KS_REC_DEFAULTS.countdown,
    hideScrollbars: !!o.hideScrollbars,
    quality: o.quality > 0 ? o.quality : KS_REC_DEFAULTS.quality,
    fps: KS_FPS_OPTIONS.includes(o.fps) ? o.fps : KS_REC_DEFAULTS.fps,
    debug: !!o.debug
  };
  globals = { ...KS_ANCHOR_DEFAULTS, ...(r.globals || {}) };
  setupOutput();
  setupRec();
  cursor = { ...KS_CURSOR_DEFAULTS, ...(r.cursor || {}) };
  icons = r.cursorIcons || {};
  setupControls();
  renderIcons();
  renderTest();
  setupTest();
  // Settings changed in the popup while this page is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.cursor) return;
    cursor = { ...KS_CURSOR_DEFAULTS, ...(changes.cursor.newValue || {}) };
    syncControls();
    renderTest();
  });
})();

$('ver').textContent = 'v' + chrome.runtime.getManifest().version;
