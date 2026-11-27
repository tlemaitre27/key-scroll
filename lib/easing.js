// Cubic-bezier easing: presets, evaluation, parsing and formatting.
// Plain script (see lib/defaults.js for why).

var KS_PRESETS = {
  default: [0.69, 0, 0.36, 1],
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
};

// Labels shown in the "Preset" menus.
var KS_PRESET_LABELS = {
  default: 'Default',
  linear: 'Linear',
  ease: 'Ease',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in-out'
};

// cubic-bezier(x1, y1, x2, y2) → progress(t) function, with t in [0, 1].
function ksBezier(x1, y1, x2, y2) {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  // Finds the curve parameter for a given x: Newton's method, then bisection if the slope is too flat.
  function solveT(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0,
      hi = 1;
    t = x;
    for (let i = 0; i < 60; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : sampleY(solveT(p)));
}

// Accepts "0.42, 0, 0.58, 1", "cubic-bezier(...)" or a preset name. Returns null if invalid.
function ksParseEasing(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (KS_PRESETS[s]) return KS_PRESETS[s].slice();
  const nums = s
    .replace(/cubic-bezier\s*\(|\)/gi, '')
    .split(',')
    .map((n) => parseFloat(n));
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null;
  if (nums[0] < 0 || nums[0] > 1 || nums[2] < 0 || nums[2] > 1) return null;
  return nums;
}

// "0.69, 0, 0.36, 1" (3 decimals at most).
function ksFormatEasing(e) {
  return e.map((n) => +(+n).toFixed(3)).join(', ');
}

// Name of the preset equal to this easing, or null.
function ksPresetOf(e) {
  if (!e) return null;
  for (const [name, value] of Object.entries(KS_PRESETS)) {
    if (value.every((n, i) => Math.abs(n - e[i]) < 1e-3)) return name;
  }
  return null;
}
