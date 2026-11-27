// Capture helper, active in the recorded tab only.
//
// Why: Chromium's tab capture looks for an "animation" (an area of the screen that changes on
// every frame). Once it finds one, it only keeps the frames that touch that area and drops the
// others for ~250 ms whenever the area changes (end of a scroll, a Swiper slider gliding after
// release...). The fix is a tiny transparent canvas (2 px, invisible) moved by the compositor on
// every frame: the changed area is never the same twice, so Chromium never locks onto anything
// and keeps every frame.
// (A full-screen layer did the opposite: it gave Chromium an area to lock onto, and Swiper
// caused dropped frames. Verified with Opera's internal capture trace, "FpsRateLimited".)

(() => {
  const ks = globalThis.__keyScroll;
  if (ks.loaded.captureAssist) return;
  ks.loaded.captureAssist = true;

  let assist = null;

  function assistOn() {
    if (assist) return { ok: true, already: true, mode: assist.mode };
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('data-key-scroll', '');
    c.style.cssText =
      'position:fixed!important;left:0!important;top:0!important;width:2px!important;height:2px!important;' +
      'margin:0!important;padding:0!important;border:0!important;pointer-events:none!important;' +
      'z-index:2147483647!important;background:transparent!important;opacity:1!important;' +
      'display:block!important;will-change:transform;';
    let mode = 'webgl';
    const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) {
      mode = '2d';
      c.getContext('2d');
    }

    // Added after <body> (like at the end of loading), so it doesn't disturb framework
    // hydration while the page is still being built.
    let ready = false; // true once the page is built (the canvas must then always be present)
    const attach = () => {
      ready = true;
      if (assist && assist.canvas === c && !c.isConnected && document.documentElement) document.documentElement.appendChild(c);
    };
    if (document.body) queueMicrotask(attach);
    else document.addEventListener('DOMContentLoaded', attach, { once: true });

    // Movement played by the compositor (keeps going even when the page is busy). Odd duration
    // and path so it never lands on an already-seen position at a regular interval.
    let move = null;
    const startMove = () => {
      if (move) move.cancel();
      try {
        move = c.animate([{ transform: 'translate(0px, 0px)' }, { transform: 'translate(97px, 61px)' }], {
          duration: 997,
          iterations: Infinity
        });
      } catch (e) {
        /* no WAAPI */
      }
    };
    startMove();

    let raf = 0,
      lastTick = 0;
    const tick = (now) => {
      // Diagnostics: the page was blocked (the frame loop couldn't run).
      if (lastTick && now - lastTick > 50) ks.pagelog('slow-frame', +(now - lastTick).toFixed(1));
      lastTick = now;
      // The site removed the canvas (page rewritten, transition replacing <html>...): put it back.
      if (ready && !c.isConnected) {
        attach();
        startMove();
        ks.pagelog('assist-reattached');
      }
      ks.pageStyle.keepAttached(ready);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Diagnostics: clicks, to find them in the log next to the captured frames.
    const logDown = () => ks.pagelog('pointerdown');
    const logUp = () => ks.pagelog('pointerup');
    addEventListener('pointerdown', logDown, { capture: true, passive: true });
    addEventListener('pointerup', logUp, { capture: true, passive: true });

    assist = {
      mode,
      canvas: c,
      off() {
        cancelAnimationFrame(raf);
        if (move) move.cancel();
        removeEventListener('pointerdown', logDown, true);
        removeEventListener('pointerup', logUp, true);
        if (gl) {
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        }
        c.remove();
      }
    };
    ks.recording = true;
    ks.pagelog('assist-on', mode);
    if (ks.cursor) ks.cursor.start(); // drawn cursor (cursor.js)
    ks.pageStyle.applyRecOptions();
    return { ok: true, mode };
  }

  function assistOff() {
    if (ks.cursor) ks.cursor.stop();
    if (assist) {
      assist.off();
      assist = null;
      ks.pagelog('assist-off');
    }
    ks.recording = false;
    ks.pageStyle.applyRecOptions();
    return { ok: true };
  }

  // After a reload or a page change, the helper disappeared with the old page: ask the service
  // worker whether this tab is being recorded (and previewing CSS), and restore both.
  async function sync(reason) {
    try {
      const r = await chrome.runtime.sendMessage({ target: 'background', type: 'assist-query' });
      if (r && r.preview) ks.pageStyle.setPreview(true);
      if (r && r.on) {
        assistOn();
        ks.pagelog('assist-restored', reason);
      } else assistOff();
    } catch (e) {
      /* extension reloaded or unavailable */
    }
  }

  ks.captureAssist = { on: assistOn, off: assistOff, sync };
})();
