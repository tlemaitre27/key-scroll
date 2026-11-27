// Styles added to the page: the custom CSS of the page (CSS tab of the popup) and hidden
// scrollbars during a recording (option of the popup).

(() => {
  const ks = globalThis.__keyScroll;
  if (ks.loaded.pageStyle) return;
  ks.loaded.pageStyle = true;

  // ---------- Hidden scrollbars (recording only) ----------
  // The page still scrolls (wheel, anchors); only the scrollbars disappear.
  const SCROLLBAR_CSS =
    'html, body, * { scrollbar-width: none !important; }' +
    '::-webkit-scrollbar, *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
  let scrollbarStyle = null;

  async function applyRecOptions() {
    const o = (await chrome.storage.local.get('recOptions')).recOptions || {};
    const want = ks.recording && !!o.hideScrollbars;
    if (want && !scrollbarStyle) {
      scrollbarStyle = document.createElement('style');
      scrollbarStyle.setAttribute('data-key-scroll', 'scrollbars');
      scrollbarStyle.textContent = SCROLLBAR_CSS;
      document.documentElement.appendChild(scrollbarStyle);
    } else if (!want && scrollbarStyle) {
      scrollbarStyle.remove();
      scrollbarStyle = null;
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.recOptions && ks.recording) applyRecOptions();
  });

  // ---------- Custom CSS of the page ----------
  // A <style> at the end of <html>, so it comes after the site's own styles.
  // The "preview" switch alone decides whether it is applied, including during a recording
  // (the service worker forces it on when a recording starts and restores it at the end).
  let userCss = null; // { el, key }
  let cssToken = 0;
  let preview = false;

  async function cssApply() {
    const token = ++cssToken;
    const key = ks.cssKey();
    const text = ksStripLineComments((await chrome.storage.local.get(key))[key] || '');
    if (token !== cssToken || !preview) return; // stopped or restarted in the meantime
    if (!userCss) {
      const el = document.createElement('style');
      el.setAttribute('data-key-scroll', 'css');
      userCss = { el, key };
      // Added right away (no flash of a popup at load), then moved to the end once the page is
      // built, so it comes after the site's stylesheets.
      document.documentElement.appendChild(el);
      if (!document.body) {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            if (userCss && userCss.el === el) document.documentElement.appendChild(el);
          },
          { once: true }
        );
      }
    }
    userCss.key = key;
    if (userCss.el.textContent !== text) userCss.el.textContent = text;
    ks.pagelog('css', text.length);
  }

  function cssRemove() {
    cssToken++;
    if (userCss) {
      userCss.el.remove();
      userCss = null;
    }
  }

  // Puts the styles back if the site removed them, and follows page changes without a reload
  // (Barba...). Called on every frame during a recording (capture-assist.js), and every 300 ms
  // while previewing outside a recording.
  function keepAttached(pageReady = true) {
    const root = document.documentElement;
    if (!root) return;
    if (scrollbarStyle && !scrollbarStyle.isConnected) root.appendChild(scrollbarStyle);
    if (!userCss) return;
    if (pageReady && !userCss.el.isConnected) root.appendChild(userCss.el);
    if (userCss.key !== ks.cssKey()) {
      userCss.key = ks.cssKey();
      cssApply();
    }
  }

  let previewTimer = 0;
  function setPreview(on) {
    preview = !!on;
    ks.pagelog('preview', preview);
    clearInterval(previewTimer);
    if (preview)
      previewTimer = setInterval(() => {
        if (!ks.recording) keepAttached();
      }, 300);
    if (preview) cssApply();
    else cssRemove();
    return { ok: true, preview };
  }

  // CSS edited in the popup (also during a recording): applied right away.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && preview && changes[ks.cssKey()]) cssApply();
  });

  ks.pageStyle = { setPreview, applyRecOptions, keepAttached };
})();
