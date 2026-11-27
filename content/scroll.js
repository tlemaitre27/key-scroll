// Scroll engine (own requestAnimationFrame loop), anchors and playback.

(() => {
  const ks = globalThis.__keyScroll;
  if (ks.loaded.scroll) return;
  ks.loaded.scroll = true;

  const scroller = () => document.scrollingElement || document.documentElement;
  const maxY = () => Math.max(0, scroller().scrollHeight - innerHeight);

  let anim = null; // running scroll animation: { cancel() }
  let playToken = 0; // changes on every play / stop, invalidates earlier playback loops
  let playing = false;
  let cur = null; // last anchor reached: { key, index, y } (key = page, for Barba-like sites)

  // `defaults`: values used when an anchor has none of its own.
  // `next`: settings at the top of the popup, copied into an anchor when it is added.
  async function load() {
    const key = ks.anchorKey();
    const r = await chrome.storage.local.get([key, 'globals']);
    return { anchors: r[key] || [], defaults: KS_ANCHOR_DEFAULTS, next: { ...KS_ANCHOR_DEFAULTS, ...(r.globals || {}) } };
  }

  function stopPlay() {
    playToken++;
    playing = false;
  }

  function cancelAnim() {
    if (anim) {
      anim.cancel();
      anim = null;
    }
  }

  // Scrolls to `target` at `speed` px/s with the `easing` curve. Resolves true when it arrives,
  // false when interrupted.
  function scrollToY(target, speed, easing) {
    cancelAnim();
    return new Promise((resolve) => {
      const from = scrollY;
      const to = Math.max(0, Math.min(target, maxY()));
      const dist = Math.abs(to - from);
      if (dist < 1) {
        resolve(true);
        return;
      }
      ks.pagelog('scroll-start', Math.round(to - from));
      ks.watchFrames(1e9);
      const duration = (dist / Math.max(1, speed)) * 1000;
      const ease = ksBezier(...easing);
      const t0 = performance.now();
      let raf = 0;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        anim = null;
        ks.pagelog(ok ? 'scroll-end' : 'scroll-cancel', Math.round(scrollY));
        ks.watchFramesFor(1000); // keep watching for 1 s after the scroll stops
        resolve(ok);
      };
      const step = (now) => {
        if (done) return;
        const p = Math.min(1, (now - t0) / duration);
        // 'instant' overrides a possible `scroll-behavior: smooth` on the site.
        window.scrollTo({ top: from + (to - from) * ease(p), behavior: 'instant' });
        if (p < 1) raf = requestAnimationFrame(step);
        else finish(true);
      };
      anim = {
        cancel() {
          cancelAnimationFrame(raf);
          finish(false);
        }
      };
      raf = requestAnimationFrame(step);
    });
  }

  // The user takes over (wheel / touch): stop everything.
  const userInterrupt = () => {
    if (anim || playing) {
      stopPlay();
      cancelAnim();
    }
  };
  addEventListener('wheel', userInterrupt, { passive: true });
  addEventListener('touchstart', userInterrupt, { passive: true });

  // ⌥⇧P (Alt+Shift+P): play / stop. Listened to in the page because Chrome allows only 4
  // default shortcuts per extension. Uses e.code because ⌥⇧P types "∏" on a Mac.
  // A shortcut assigned in chrome://extensions/shortcuts is handled by the browser as well.
  addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'KeyP' || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      play();
    },
    true
  );

  // Next (dir = 1) or previous (dir = -1) anchor, in list order.
  // If we are still on the last anchor reached, move along the list; otherwise (manual scroll)
  // take the first anchor below / the last anchor above the current position.
  function resolveIndex(anchors, dir) {
    if (!anchors.length) return -1;
    const y = scrollY;
    // Page changed without a reload (Barba, Swup...): the last anchor no longer applies.
    if (cur && cur.key !== ks.anchorKey()) cur = null;
    if (cur && cur.index < anchors.length && Math.abs(y - cur.y) < 4) {
      const i = cur.index + dir;
      return i >= 0 && i < anchors.length ? i : -1;
    }
    if (dir > 0) return anchors.findIndex((a) => a.y > y + 2);
    for (let i = anchors.length - 1; i >= 0; i--) if (anchors[i].y < y - 2) return i;
    return -1;
  }

  async function goTo(i, anchors, defaults) {
    const a = anchors[i];
    const ok = await scrollToY(a.y, a.speed ?? defaults.speed, a.easing ?? defaults.easing);
    if (ok) cur = { key: ks.anchorKey(), index: i, y: scrollY };
    return ok;
  }

  async function step(dir) {
    stopPlay();
    const { anchors, defaults } = await load();
    const i = resolveIndex(anchors, dir);
    if (i < 0) return { ok: false, reason: anchors.length ? 'No more anchors in this direction' : 'No anchor on this page' };
    goTo(i, anchors, defaults);
    return { ok: true, index: i };
  }

  // Plays the anchors one after the other (with each anchor's pause). Calling it again stops.
  async function play() {
    if (playing) {
      stopPlay();
      cancelAnim();
      return { ok: true, playing: false };
    }
    const token = ++playToken;
    playing = true;
    const { anchors, defaults } = await load();
    let i = resolveIndex(anchors, 1);
    if (i < 0) {
      playing = false;
      return { ok: false, reason: 'No anchor further down' };
    }
    (async () => {
      while (token === playToken && i >= 0 && i < anchors.length) {
        const ok = await goTo(i, anchors, defaults);
        if (!ok || token !== playToken) break;
        if (i < anchors.length - 1) await new Promise((r) => setTimeout(r, anchors[i].pause ?? defaults.pause));
        i++;
      }
      if (token === playToken) playing = false;
    })();
    return { ok: true, playing: true };
  }

  async function addAnchor() {
    const { anchors, next } = await load();
    const y = Math.round(scrollY);
    const existing = anchors.findIndex((a) => Math.abs(a.y - y) < 2);
    if (existing >= 0) return { ok: true, count: anchors.length, index: existing, duplicate: true };
    const a = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), y };
    // Copy the settings from the top of the popup; a value equal to the default stays empty.
    Object.assign(a, ksAnchorOwnValues(next));
    let index = anchors.findIndex((b) => b.y > y);
    if (index < 0) index = anchors.length;
    anchors.splice(index, 0, a);
    await chrome.storage.local.set({ [ks.anchorKey()]: anchors });
    cur = { key: ks.anchorKey(), index, y: scrollY };
    return { ok: true, count: anchors.length, index };
  }

  async function gotoIndex(i) {
    stopPlay();
    const { anchors, defaults } = await load();
    if (!anchors[i]) return { ok: false, reason: 'Anchor not found' };
    goTo(i, anchors, defaults);
    return { ok: true, index: i };
  }

  ks.scroll = {
    next: () => step(1),
    prev: () => step(-1),
    play,
    add: addAnchor,
    gotoIndex,
    stop: () => {
      stopPlay();
      cancelAnim();
    },
    position: () => ({ y: Math.round(scrollY), max: Math.round(maxY()) })
  };
})();
