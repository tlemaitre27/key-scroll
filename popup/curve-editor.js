// Cubic-bezier curve editor (160 × 160 grid with a vertical preview track) and its binding
// to an "Ease" text field and a "Preset" menu.

import { icon } from './dom.js';

const SIZE = 160;

export function createCurveEditor(host, onChange) {
  const sx = (x) => x * SIZE;
  const sy = (y) => SIZE - y * SIZE;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round2 = (v) => Math.round(v * 100) / 100;
  let grid = '';
  for (let i = 1; i < 10; i++) {
    const p = i * 16 - 0.5;
    grid += `<line x1="${p}" y1="0" x2="${p}" y2="${SIZE}"/><line x1="0" y1="${p}" x2="${SIZE}" y2="${p}"/>`;
  }

  host.innerHTML = `
    <div class="graph">
      <svg class="curve" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
        <rect class="bg" x="0.5" y="0.5" width="${SIZE - 1}" height="${SIZE - 1}"/>
        <g class="grid">${grid}</g>
        <line class="diag" x1="0" y1="${SIZE}" x2="${SIZE}" y2="0"/>
        <line class="arm1"/><line class="arm2"/>
        <path class="bez"/>
        <circle class="h h1" r="6"/><circle class="h h2" r="6"/>
      </svg>
      <div class="track"><div class="ball"></div></div>
      <button class="btn icon replay" type="button" title="Preview the ease"><img src="${icon('preview-play')}" width="14" height="14" alt=""></button>
    </div>`;
  const svg = host.querySelector('svg');
  const el = (s) => host.querySelector(s);
  let v = KS_ANCHOR_DEFAULTS.easing.slice();

  function draw() {
    const [x1, y1, x2, y2] = v;
    el('.bez').setAttribute('d', `M${sx(0)},${sy(0)} C${sx(x1)},${sy(y1)} ${sx(x2)},${sy(y2)} ${sx(1)},${sy(1)}`);
    const a1 = el('.arm1'),
      a2 = el('.arm2');
    a1.setAttribute('x1', sx(0));
    a1.setAttribute('y1', sy(0));
    a1.setAttribute('x2', sx(x1));
    a1.setAttribute('y2', sy(y1));
    a2.setAttribute('x1', sx(1));
    a2.setAttribute('y1', sy(1));
    a2.setAttribute('x2', sx(x2));
    a2.setAttribute('y2', sy(y2));
    el('.h1').setAttribute('cx', sx(x1));
    el('.h1').setAttribute('cy', sy(y1));
    el('.h2').setAttribute('cx', sx(x2));
    el('.h2').setAttribute('cy', sy(y2));
  }

  function drag(handle, idx) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const move = (ev) => {
        const rect = svg.getBoundingClientRect();
        v[idx] = round2(clamp((ev.clientX - rect.left) / SIZE, 0, 1));
        v[idx + 1] = round2(clamp((SIZE - (ev.clientY - rect.top)) / SIZE, -0.6, 1.6));
        draw();
        onChange(v.slice(), false);
      };
      // Listening on window: the drag keeps going even when the mouse leaves the handle.
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        onChange(v.slice(), true);
        play();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
  drag(el('.h1'), 0);
  drag(el('.h2'), 2);

  // Preview: the ball goes up the track once with the curve, then jumps back down.
  const ball = el('.ball');
  let raf = 0,
    back = 0;
  function play() {
    cancelAnimationFrame(raf);
    clearTimeout(back);
    const ease = ksBezier(...v),
      duration = 1100,
      t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      ball.style.transform = `translateY(${-ease(t) * SIZE}px)`;
      if (t < 1) raf = requestAnimationFrame(step);
      else
        back = setTimeout(() => {
          ball.style.transform = '';
        }, 600);
    };
    raf = requestAnimationFrame(step);
  }
  el('.replay').addEventListener('click', play);

  return {
    set(e) {
      v = e.slice();
      draw();
    },
    play
  };
}

// Binds an "Ease" text field, a "Preset" menu and a curve editor together.
// Menu options:
//   "Default": the curve is the default value (empty field); picking it empties the field.
//   the named presets (Linear, Ease...);
//   "Custom": label shown when the curve matches neither the default nor a preset (can't be picked).
// defaultValue(): the current default curve.
// onCommit(easing | null): called when the user commits a value (null = back to default).
export function bindEasing({ input, preset, curveHost, onCommit, defaultValue }) {
  preset.add(new Option('Default', 'default'));
  for (const name of Object.keys(KS_PRESETS)) {
    if (name !== 'default') preset.add(new Option(KS_PRESET_LABELS[name] || name, name));
  }
  const custom = new Option('Custom', '');
  custom.disabled = true;
  preset.add(custom);

  const curve = createCurveEditor(curveHost, (e, final) => {
    input.value = ksFormatEasing(e);
    input.classList.remove('invalid');
    syncPreset(e);
    if (final) onCommit(e);
  });

  // "Default" if the curve equals the default, otherwise the matching preset, otherwise "Custom".
  // empty: the field is empty (the default applies) → the menu is dimmed like a placeholder.
  function syncPreset(e, empty) {
    let name = '';
    if (empty || ksSameEasing(e, defaultValue())) name = 'default';
    else {
      const p = ksPresetOf(e);
      if (p && p !== 'default') name = p;
    }
    custom.hidden = name !== '';
    preset.value = name;
    preset.classList.toggle('isDefault', !!empty);
  }

  input.addEventListener('change', () => {
    if (!input.value.trim()) {
      input.classList.remove('invalid');
      onCommit(null);
      curve.play();
      return;
    }
    const e = ksParseEasing(input.value);
    input.classList.toggle('invalid', !e);
    if (e) {
      curve.set(e);
      syncPreset(e);
      onCommit(e);
      curve.play();
    }
  });

  preset.addEventListener('change', () => {
    if (preset.value === 'default') {
      input.value = '';
      onCommit(null);
      curve.play();
      return;
    }
    const e = KS_PRESETS[preset.value];
    if (!e) return; // "Custom": nothing to apply
    input.value = ksFormatEasing(e);
    input.classList.remove('invalid');
    curve.set(e);
    onCommit(e.slice());
    curve.play();
  });

  return { ...curve, syncPreset };
}
