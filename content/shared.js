// Shared namespace of the content scripts.
//
// Every content script is a plain script wrapped in an IIFE. They talk to each other through
// `globalThis.__keyScroll` (each script registers its part on it), and each one guards against
// being injected twice (see toContent() in background.js).
//
// Nothing here draws anything in the page: whatever appears in the page appears in the video.

(() => {
  const ks = (globalThis.__keyScroll = globalThis.__keyScroll || { loaded: {} });
  if (ks.loaded.shared) return;
  ks.loaded.shared = true;

  // True while this tab is being recorded (set by capture-assist.js).
  ks.recording = false;

  ks.anchorKey = () => ksAnchorKey(location.href);
  ks.cssKey = () => ksCssKey(location.href);

  // Diagnostic log: sent to the offscreen recorder document (ignored when nothing is recording).
  ks.pagelog = (event, value) => {
    try {
      chrome.runtime
        .sendMessage({ target: 'offscreen', type: 'pagelog', epoch: performance.timeOrigin + performance.now(), event, value })
        .catch(() => {});
    } catch (e) {
      /* extension reloaded */
    }
  };

  // Logs slow page frames (> 20 ms between two animation frames) for the next `ms` milliseconds.
  let watchUntil = 0;
  let watching = false;
  ks.watchFrames = (ms) => {
    watchUntil = Math.max(watchUntil, performance.now() + ms);
    if (watching) return;
    watching = true;
    let last = performance.now();
    const tick = (now) => {
      const gap = now - last;
      if (gap > 20) ks.pagelog('slow-frame', +gap.toFixed(1));
      last = now;
      if (now < watchUntil) requestAnimationFrame(tick);
      else watching = false;
    };
    requestAnimationFrame(tick);
  };
  // Stops watching `ms` milliseconds from now.
  ks.watchFramesFor = (ms) => {
    watchUntil = performance.now() + ms;
  };
})();
