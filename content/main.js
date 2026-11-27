// Entry point of the content scripts: routes the messages sent by the service worker
// (popup actions and keyboard shortcuts) and restores the recording state on load.

(() => {
  const ks = globalThis.__keyScroll;
  if (ks.loaded.main) return;
  ks.loaded.main = true;

  const routes = {
    next: () => ks.scroll.next(),
    prev: () => ks.scroll.prev(),
    play: () => ks.scroll.play(),
    add: () => ks.scroll.add(),
    goto: (msg) => ks.scroll.gotoIndex(msg.index),
    stop: () => {
      ks.scroll.stop();
      return { ok: true };
    },
    getScroll: () => ({ ok: true, ...ks.scroll.position(), key: ks.anchorKey() }),
    ping: () => ({ ok: true }),
    'assist-on': () => ks.captureAssist.on(),
    'assist-off': () => ks.captureAssist.off(),
    preview: (msg) => ks.pageStyle.setPreview(msg.on),
    pick: () => ks.picker.start()
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return;
    const route = routes[msg.type];
    Promise.resolve()
      .then(() => (route ? route(msg) : { ok: false, reason: 'Unknown command' }))
      .then(sendResponse, (e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
    return true; // async response
  });

  ks.captureAssist.sync('load');
  // Page restored from the back/forward cache: the state may have changed in the meantime.
  addEventListener('pageshow', (e) => {
    if (e.persisted) ks.captureAssist.sync('bfcache');
  });
})();
