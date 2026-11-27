// Cursor drawn in the page during a recording.
//
// Chromium paints the real mouse pointer into captured frames and offers no way to remove it.
// So while recording we hide it and draw our own cursor in the page: what you see is what
// gets recorded.
//
// Hiding: a `data-ks-nocursor` attribute is set only on the element under the mouse and
// targeted by a "cursor: none !important" rule. The site's own styles are never touched (a site
// that switches an element to "grabbing" during a drag keeps working), and reading the cursor
// the site wants only recomputes the styles of that one element.
//
// Modes: on (always visible) · off (never) · auto (appears when the mouse gets within 50 px of a
// clickable / draggable element, disappears 500 ms after leaving it; 300 ms fades; never
// triggered by the page scrolling under a still mouse).
// Movement: native (sticks to the mouse) · fluid (eases toward the mouse without overshooting).

(() => {
  const ks = globalThis.__keyScroll;
  if (ks.loaded.cursor) return;
  ks.loaded.cursor = true;

  const NEAR_PX = 50; // auto mode: distance at which the cursor appears
  const HIDE_DELAY = 500; // auto mode: delay before it disappears
  const FADE_MS = 300;
  const CLICK_SCALE = 0.9;
  const REAL_MOVE_MS = 250; // auto mode: only appears if the mouse really moved recently
  const POS_KEY = '__ksCursorPos'; // last position (sessionStorage), restored after a reload
  const ATTR = 'data-ks-nocursor';

  // Elements treated as interactive in auto mode, on top of those whose real cursor is
  // "pointer" or "grab" (learned on hover).
  const INTERACTIVE = [
    'a[href]',
    'button',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="slider"]',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    'input[type="checkbox"]',
    'input[type="radio"]',
    'input[type="range"]',
    'input[type="file"]',
    'input[type="color"]',
    'select',
    'summary',
    'label[for]',
    '[onclick]',
    '[draggable="true"]',
    '.swiper',
    '.swiper-container',
    '.slick-slider',
    '.flickity-enabled',
    '.splide',
    '.glide',
    '.embla',
    '[class*="slider" i]',
    '[class*="carousel" i]'
  ].join(',');
  const TEXT_FIELD =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="color"]):not([type="file"]), textarea, [contenteditable=""], [contenteditable="true"]';

  let st = null; // state while recording

  // The mouse position is always tracked (very cheap), so the drawn cursor is in the right
  // place as soon as the recording starts, even if the mouse doesn't move.
  let lastSeen = null;
  addEventListener(
    'pointermove',
    (e) => {
      lastSeen = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true }
  );
  document.addEventListener(
    'mouseout',
    (e) => {
      if (!e.relatedTarget) lastSeen = null;
    },
    true
  );

  async function loadSettings() {
    const r = await chrome.storage.local.get(['cursor', 'cursorIcons']);
    const s = { ...KS_CURSOR_DEFAULTS, ...(r.cursor || {}) };
    return { s, icons: ksCursorIconSet(s.style, r.cursorIcons) };
  }

  // ---------- Hiding the real cursor ----------

  function unmark() {
    if (st && st.marked) {
      st.marked.removeAttribute(ATTR);
      st.marked = null;
    }
  }

  function mark(el) {
    if (!st || !el || el.nodeType !== 1 || el === st.marked) return;
    unmark();
    el.setAttribute(ATTR, '');
    st.marked = el;
  }

  // Cursor the site shows on this element (our hiding is removed while reading it).
  function realCursor(el) {
    if (!el || el.nodeType !== 1) return 'auto';
    const isMarked = el === st.marked;
    if (isMarked) el.removeAttribute(ATTR);
    let c = 'auto';
    try {
      c = getComputedStyle(el).cursor || 'auto';
    } catch (e) {}
    if (isMarked) el.setAttribute(ATTR, '');
    return c.split(',').pop().trim(); // "url(...), pointer" → pointer
  }

  // Is the mouse over selectable text (like the system text cursor)?
  function overText(x, y) {
    try {
      const r = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
      if (!r || r.startContainer.nodeType !== 3) return false;
      const node = r.startContainer,
        len = node.length;
      const parent = node.parentElement;
      if (!parent || getComputedStyle(parent).userSelect === 'none') return false;
      const hit = (o) => {
        if (o < 0 || o >= len) return false;
        const rr = document.createRange();
        rr.setStart(node, o);
        rr.setEnd(node, o + 1);
        const b = rr.getBoundingClientRect();
        return b.width > 0 && x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1;
      };
      return hit(r.startOffset) || hit(r.startOffset - 1);
    } catch (e) {
      return false;
    }
  }

  // Shape to draw for the element under the mouse.
  function shapeFor(el) {
    const c = realCursor(el);
    st.siteAuto = false;
    if (c === 'pointer') return 'pointer';
    if (c === 'grab' || c === '-webkit-grab') return 'grab';
    if (c === 'grabbing' || c === '-webkit-grabbing') return 'grabbing';
    if (c === 'text' || c === 'vertical-text') return 'text';
    if (c === 'auto') {
      if (el && el.closest && el.closest(TEXT_FIELD)) return 'text';
      st.siteAuto = true; // the browser would pick arrow or text depending on what is under the mouse
      if (st.s.mode === 'on' && overText(st.tx, st.ty)) return 'text';
    }
    return 'arrow';
  }

  const isInteractive = (shape) => shape === 'pointer' || shape === 'grab' || shape === 'grabbing';

  function applyShape(shape) {
    st.hoverInteractive = isInteractive(shape);
    if (st.ui) setShape(st.s.mode === 'auto' && shape === 'text' ? 'arrow' : shape); // no text cursor in auto mode
    st.dirty = true;
  }

  // ---------- Drawing ----------

  // Positions are rounded to screen pixels: otherwise the browser resamples the icon between
  // two pixels and it looks blurry.
  const dpx = (v) => {
    const d = window.devicePixelRatio || 1;
    return Math.round(v * d) / d;
  };

  function build(icons, s) {
    const host = document.createElement('div');
    host.setAttribute('data-key-scroll', 'cursor');
    host.style.cssText =
      'position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;' +
      'margin:0!important;padding:0!important;border:0!important;pointer-events:none!important;z-index:2147483647!important;' +
      'display:block!important;overflow:visible!important;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .c { position: fixed; left: 0; top: 0; opacity: 0; transition: opacity ${FADE_MS}ms ease; pointer-events: none; }
      .s { transform-origin: 0 0; transition: transform 120ms cubic-bezier(.2,.7,.3,1); }
      .s.down { transform: scale(${CLICK_SCALE}); transition-duration: 90ms; }
      img { position: absolute; display: none; max-width: none; user-select: none; -webkit-user-drag: none; pointer-events: none; }
      img.on { display: block; }
    </style><div class="c"><div class="s"></div></div>`;
    const c = root.querySelector('.c'),
      sc = root.querySelector('.s');
    const imgs = {};
    for (const k of KS_CURSOR_SHAPES) {
      const ic = icons[k];
      const { w, h } = ksSvgSize(ic.svg);
      const img = document.createElement('img');
      img.src = ksSvgUrl(ic.svg);
      img.alt = '';
      img.decoding = 'sync';
      img.style.width = w * s.scale + 'px';
      img.style.height = h * s.scale + 'px';
      // The icon's hotspot sits on the origin: it is the point that follows the mouse and
      // the point the cursor shrinks around on click.
      img.style.left = dpx(-ic.hx * s.scale) + 'px';
      img.style.top = dpx(-ic.hy * s.scale) + 'px';
      if (s.shadow) img.style.filter = ksCursorShadow(s.scale);
      sc.appendChild(img);
      imgs[k] = img;
    }
    return { host, c, sc, imgs };
  }

  function setShape(shape) {
    if (!st.ui || st.shape === shape) return;
    if (st.shape) st.ui.imgs[st.shape].classList.remove('on');
    st.shape = shape;
    st.ui.imgs[shape].classList.add('on');
  }

  function setVisible(v) {
    if (!st.ui || st.visible === v) return;
    st.visible = v;
    st.ui.c.style.opacity = v ? '1' : '0';
  }

  const snap = () => {
    st.x = st.tx;
    st.y = st.ty;
  };

  // ---------- Auto mode ----------

  // Distance (px) between the mouse and the closest interactive element.
  function nearestInteractive(x, y) {
    const now = performance.now();
    if (!st.cands || now - st.candsAt > 1000) {
      try {
        st.cands = [...document.querySelectorAll(INTERACTIVE)];
      } catch (e) {
        st.cands = [];
      }
      st.candsAt = now;
    }
    let best = Infinity;
    const check = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.bottom < -NEAR_PX || r.top > innerHeight + NEAR_PX || r.right < -NEAR_PX || r.left > innerWidth + NEAR_PX) return;
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < best) best = d;
    };
    for (const el of st.cands) {
      check(el);
      if (best === 0) return 0;
    }
    for (const el of st.learned) {
      if (el.isConnected) check(el);
      if (best === 0) return 0;
    }
    return best;
  }

  function evalAuto() {
    if (st.s.mode !== 'auto' || !st.hasPos || st.frozen) return;
    const near = st.hoverInteractive || nearestInteractive(st.tx, st.ty) <= NEAR_PX;
    // Only appear if the mouse itself moved (not the page scrolling under it).
    const userMoved = performance.now() - st.realMoveAt < REAL_MOVE_MS;
    if (near && (st.visible || userMoved)) {
      clearTimeout(st.hideTimer);
      st.hideTimer = 0;
      if (!st.visible) {
        snap();
        setVisible(true);
      }
    } else if (!near && st.visible && !st.hideTimer) {
      st.hideTimer = setTimeout(() => {
        if (st) {
          st.hideTimer = 0;
          setVisible(false);
        }
      }, HIDE_DELAY);
    }
  }

  // ---------- Mouse tracking ----------

  // Element under the mouse: hide the real cursor and pick the drawn shape.
  function onTarget(el) {
    if (!st || !el) return;
    unmark(); // first: a hidden parent would skew the reading (inheritance)
    const shape = shapeFor(el); // read before hiding
    mark(el);
    if (isInteractive(shape)) st.learned.add(el);
    applyShape(shape);
  }

  // Re-reads the shape of the element under the mouse (same element: the site may have changed its cursor).
  function reevaluate() {
    if (!st || !st.hasPos) return;
    const el = document.elementFromPoint(st.tx, st.ty);
    if (!el) return;
    if (el !== st.marked) onTarget(el);
    else applyShape(shapeFor(el));
  }

  // At most one re-read per frame (dragging, text under the mouse).
  function scheduleRecheck(el) {
    st.recheckEl = el || null;
    if (st.recheckRaf) return;
    st.recheckRaf = requestAnimationFrame(() => {
      if (!st) return;
      st.recheckRaf = 0;
      const t = st.recheckEl && st.recheckEl.isConnected ? st.recheckEl : document.elementFromPoint(st.tx, st.ty);
      if (!t) return;
      if (t !== st.marked) onTarget(t);
      else applyShape(shapeFor(t));
    });
  }

  function frame(now) {
    if (!st) return;
    const dt = Math.min(64, now - (st.last || now));
    st.last = now;
    if (document.documentElement) {
      if (!st.ui.host.isConnected) document.documentElement.appendChild(st.ui.host);
      if (!st.hide.isConnected) document.documentElement.appendChild(st.hide);
    }
    if (st.hasPos) {
      if (st.s.motion === 'fluid' && st.visible) {
        // Exponential smoothing: eases toward the mouse and never overshoots it.
        const k = 1 - Math.exp(-dt / Math.max(10, st.s.smoothing));
        st.x += (st.tx - st.x) * k;
        st.y += (st.ty - st.y) * k;
        if (Math.abs(st.tx - st.x) < 0.05 && Math.abs(st.ty - st.y) < 0.05) snap();
      } else snap();
      st.ui.c.style.transform = `translate(${dpx(st.x)}px, ${dpx(st.y)}px)`;
      if (st.dirty) {
        st.dirty = false;
        evalAuto();
      }
    }
    st.raf = requestAnimationFrame(frame);
  }

  const onMove = (e) => {
    if (!st) return;
    // The browser also sends "fake" moves when the page scrolls under a still mouse:
    // same coordinates, the user isn't moving.
    if (e.clientX !== st.tx || e.clientY !== st.ty || !st.hasPos) st.realMoveAt = performance.now();
    st.tx = e.clientX;
    st.ty = e.clientY;
    if (!st.hasPos) {
      st.hasPos = true;
      if (st.ui) snap();
      if (st.ui && st.s.mode === 'on') setVisible(true);
    }
    if (e.target !== st.marked) {
      if (st.frozen)
        mark(e.target); // while scrolling: only hide the real cursor
      else onTarget(e.target);
    } else if (e.buttons & 1)
      scheduleRecheck(e.target); // dragging: "grabbing"?
    else if (st.siteAuto && st.s.mode === 'on') scheduleRecheck(e.target); // text or empty space?
    st.dirty = true;
  };
  // Hover fired without a move (page scrolling): hide the real cursor right away.
  const onOver = (e) => {
    if (!st || e.target === st.marked) return;
    if (st.frozen) mark(e.target);
    else onTarget(e.target);
  };
  const onDown = (e) => {
    if (!st) return;
    if (st.ui && st.s.clicks && e.button === 0) st.ui.sc.classList.add('down');
    setTimeout(reevaluate, 0); // the site may switch to "grabbing" on press
  };
  const onUp = () => {
    if (!st) return;
    if (st.ui) st.ui.sc.classList.remove('down');
    setTimeout(reevaluate, 0);
  };
  // Mouse left the page (tab strip, other screen): the drawn cursor fades out.
  const onLeave = (e) => {
    if (st && st.ui && !e.relatedTarget) {
      setVisible(false);
      st.hasPos = false;
    }
  };
  let scrollTimer = 0,
    scrollRaf = 0;
  const onScroll = () => {
    if (!st) return;
    // While scrolling (anchors), visibility and shape stay frozen; re-evaluated when it stops.
    st.frozen = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!st) return;
      st.frozen = false;
      reevaluate();
    }, 120);
    // But the real cursor stays hidden on the element that moves under the mouse.
    if (!scrollRaf && st.hasPos)
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        if (st) mark(document.elementFromPoint(st.tx, st.ty));
      });
  };

  async function start() {
    if (st || starting) return { ok: true, already: true };
    starting = true;
    const { s, icons } = await loadSettings();
    starting = false;
    if (st) return { ok: true, already: true };
    const hide = document.createElement('style');
    hide.setAttribute('data-key-scroll', 'cursor-hide');
    hide.textContent = `[${ATTR}], [${ATTR}]::before, [${ATTR}]::after { cursor: none !important; }`;
    document.documentElement.appendChild(hide);
    st = {
      s,
      icons,
      ui: null,
      hide,
      marked: null,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      hasPos: false,
      visible: false,
      shape: null,
      learned: new Set(),
      cands: null,
      candsAt: 0,
      hideTimer: 0,
      dirty: false,
      frozen: false,
      hoverInteractive: false,
      siteAuto: false,
      realMoveAt: 0,
      recheckRaf: 0,
      recheckEl: null,
      raf: 0,
      last: 0
    };
    if (s.mode !== 'off') {
      st.ui = build(icons, s);
      document.documentElement.appendChild(st.ui.host);
      setShape('arrow');
    }
    addEventListener('pointermove', onMove, { capture: true, passive: true });
    addEventListener('mouseover', onOver, { capture: true, passive: true });
    addEventListener('pointerdown', onDown, { capture: true, passive: true });
    addEventListener('pointerup', onUp, { capture: true, passive: true });
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('mouseout', onLeave, true);

    // The mouse may already be over the page without having moved: use the last known
    // position (after a reload during a recording), otherwise the currently hovered element.
    let pos = null;
    try {
      pos = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
    } catch (e) {}
    if (!pos && lastSeen) pos = lastSeen;
    if (pos) {
      st.tx = pos.x;
      st.ty = pos.y;
      st.hasPos = true;
      if (st.ui) {
        snap();
        if (s.mode === 'on') setVisible(true);
      }
      queueMicrotask(reevaluate);
    } else {
      const hovered = [...document.querySelectorAll(':hover')].pop();
      if (hovered) onTarget(hovered);
    }
    st.saveTimer = setInterval(() => {
      if (st && st.hasPos)
        try {
          sessionStorage.setItem(POS_KEY, JSON.stringify({ x: st.tx, y: st.ty }));
        } catch (e) {}
    }, 250);
    if (st.ui) st.raf = requestAnimationFrame(frame);
    return { ok: true, mode: s.mode };
  }
  let starting = false;

  function stop({ keepPos = false } = {}) {
    if (!st) return { ok: true };
    unmark();
    const s0 = st;
    st = null;
    cancelAnimationFrame(s0.raf);
    cancelAnimationFrame(s0.recheckRaf);
    cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
    clearTimeout(s0.hideTimer);
    clearInterval(s0.saveTimer);
    clearTimeout(scrollTimer);
    s0.hide.remove();
    if (s0.ui) s0.ui.host.remove();
    // Safety net: no element may keep the hiding attribute.
    document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
    removeEventListener('pointermove', onMove, true);
    removeEventListener('mouseover', onOver, true);
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('scroll', onScroll, true);
    document.removeEventListener('mouseout', onLeave, true);
    if (!keepPos)
      try {
        sessionStorage.removeItem(POS_KEY);
      } catch (e) {}
    return { ok: true };
  }

  // Settings changed during the recording: rebuild with the new ones.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !st || !(changes.cursor || changes.cursorIcons)) return;
    if (st.hasPos)
      try {
        sessionStorage.setItem(POS_KEY, JSON.stringify({ x: st.tx, y: st.ty }));
      } catch (e) {}
    stop({ keepPos: true });
    start();
  });

  ks.cursor = {
    start,
    stop: () => stop(),
    isOn: () => !!st,
    // Diagnostics (tests): current state of the drawn cursor.
    debug: () =>
      st && {
        shape: st.shape,
        visible: st.visible,
        x: +st.x.toFixed(1),
        y: +st.y.toFixed(1),
        tx: st.tx,
        ty: st.ty,
        down: !!(st.ui && st.ui.sc.classList.contains('down')),
        mode: st.s.mode,
        motion: st.s.motion,
        frozen: st.frozen,
        marked: st.marked && (st.marked.id || st.marked.tagName)
      }
  };
})();
