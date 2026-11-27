// Element picker (CSS tab of the popup): hover highlights an element, click appends its
// selector to the page's custom CSS. ↑ goes to the parent, ↓ back down, Esc cancels.
// Disabled during a recording.

(() => {
  const ks = globalThis.__keyScroll;
  if (ks.loaded.picker) return;
  ks.loaded.picker = true;

  let picking = null;

  // Classes that look generated (CSS Modules, styled-components, emotion...): unstable, skipped.
  const generatedClass = (c) =>
    /^(css|sc|jsx|emotion|svelte|astro)-/i.test(c) ||
    /__[\w-]*[0-9a-f]{5,}$/i.test(c) ||
    /[0-9a-f]{6,}/i.test(c) ||
    /\d{3,}/.test(c) ||
    c.length > 40;
  const generatedId = (id) => /\d{3,}|[0-9a-f]{8,}|^:|^radix-|^headlessui-/i.test(id);

  const unique = (sel) => {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch (e) {
      return false;
    }
  };

  function selectorPart(el) {
    const tag = el.localName;
    if (el.id && !generatedId(el.id)) return { sel: '#' + CSS.escape(el.id), strong: true };
    for (const a of ['data-testid', 'data-test', 'data-component', 'data-block', 'role', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && v.length < 40) return { sel: `${tag}[${a}="${CSS.escape(v)}"]`, strong: a.startsWith('data-') };
    }
    const cls = [...el.classList].filter((c) => !generatedClass(c)).slice(0, 3);
    return { sel: tag + cls.map((c) => '.' + CSS.escape(c)).join(''), strong: false };
  }

  function buildSelector(el) {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && node !== document.documentElement && depth < 6; depth++) {
      const p = selectorPart(node);
      parts.unshift(p.sel);
      let sel = parts.join(' > ');
      if (unique(sel)) return sel;
      // Ambiguous: add the position among siblings of the same type.
      const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.localName === node.localName) : [];
      if (same.length > 1) {
        parts[0] = p.sel + `:nth-of-type(${same.indexOf(node) + 1})`;
        sel = parts.join(' > ');
        if (unique(sel)) return sel;
      }
      if (p.strong) break; // an ambiguous #id / data-* won't get better by going up
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function startPicker() {
    if (ks.recording) return { ok: false, reason: 'Unavailable while recording' };
    if (picking) return { ok: true, already: true };
    const host = document.createElement('div');
    host.setAttribute('data-key-scroll', 'picker');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      .box{position:fixed;pointer-events:none;outline:2px solid #2a7;background:rgba(34,170,119,.15);border-radius:2px;transition:all .05s}
      .tip{position:fixed;pointer-events:none;max-width:60vw;font:12px/1.4 ui-monospace,monospace;color:#fff;background:#163;padding:4px 7px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,.3)}
      .help{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto;display:flex;align-items:center;gap:10px;font:12px/1.4 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.8);padding:6px 6px 6px 10px;border-radius:6px}
      .help button{font:inherit;color:#fff;background:#3a474e;border:0;border-radius:4px;padding:3px 8px;cursor:pointer;outline:none}
      .help button:hover{background:#46555d}
    </style><div class="box"></div><div class="tip"></div><div class="help">Click an element to add it to the CSS · ↑ parent · ↓ child · Esc to cancel<button type="button">Cancel</button></div>`;
    const box = shadow.querySelector('.box'),
      tip = shadow.querySelector('.tip');
    const help = shadow.querySelector('.help'),
      cancel = shadow.querySelector('.help button');
    document.documentElement.appendChild(host);
    // Keyboard events must reach the page (not an iframe or the previously focused field) for Esc
    // to work without clicking first: focus the Cancel button of the help bar.
    try {
      window.focus();
      cancel.focus({ preventScroll: true });
    } catch (e) {}

    let target = null;
    const trail = []; // for ↓ after ↑
    const show = (el) => {
      target = el;
      if (!el) {
        box.style.display = tip.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        display: 'block',
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px'
      });
      tip.textContent = buildSelector(el);
      tip.style.display = 'block';
      const ty = r.top > 28 ? r.top - 26 : Math.min(innerHeight - 26, r.bottom + 4);
      Object.assign(tip.style, { left: Math.max(4, Math.min(r.left, innerWidth - 300)) + 'px', top: ty + 'px' });
    };
    const pickable = (el) =>
      el &&
      el !== host &&
      el !== document.documentElement &&
      el.nodeType === 1 &&
      !(el.hasAttribute && el.hasAttribute('data-key-scroll'));
    const onMove = (e) => {
      if (e.composedPath().includes(help)) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (pickable(el) && el !== target) {
        trail.length = 0;
        show(el);
      }
    };
    const block = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const onClick = async (e) => {
      block(e);
      if (e.composedPath().includes(help)) {
        if (e.composedPath().includes(cancel)) finish();
        return;
      }
      if (!target) return;
      const sel = buildSelector(target);
      finish();
      const k = ks.cssKey();
      const cur = (await chrome.storage.local.get(k))[k] || '';
      const add = `${sel} {\n  \n}\n`;
      await chrome.storage.local.set({ [k]: cur + (cur && !cur.endsWith('\n') ? '\n' : '') + (cur.trim() ? '\n' : '') + add });
      chrome.runtime.sendMessage({ target: 'background', type: 'picked', selector: sel }).catch(() => {});
    };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        block(e);
        finish();
      } else if (e.key === 'ArrowUp' && target && pickable(target.parentElement)) {
        block(e);
        trail.push(target);
        show(target.parentElement);
      } else if (e.key === 'ArrowDown' && trail.length) {
        block(e);
        show(trail.pop());
      }
    };
    const onScroll = () => target && show(target);
    const opts = { capture: true, passive: false };
    addEventListener('mousemove', onMove, true);
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu'])
      addEventListener(t, t === 'click' ? onClick : block, opts);
    addEventListener('keydown', onKey, true);
    addEventListener('scroll', onScroll, true);
    function finish() {
      removeEventListener('mousemove', onMove, true);
      for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu'])
        removeEventListener(t, t === 'click' ? onClick : block, opts);
      removeEventListener('keydown', onKey, true);
      removeEventListener('scroll', onScroll, true);
      host.remove();
      picking = null;
    }
    picking = { finish };
    return { ok: true };
  }

  ks.picker = { start: startPicker };
})();
