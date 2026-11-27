// Viewport sizes: readable aspect ratios and preset labels.
// Plain script (see lib/defaults.js for why).

var KS_COMMON_RATIOS = [
  [1, 1],
  [16, 9],
  [9, 16],
  [16, 10],
  [10, 16],
  [4, 3],
  [3, 4],
  [3, 2],
  [2, 3],
  [4, 5],
  [5, 4],
  [21, 9],
  [1, 2],
  [2, 1]
];

// "16:9", "≈ 9:16" (within 1 % of a common ratio), otherwise "1.78:1".
function ksRatioLabel(w, h) {
  if (!(w > 0 && h > 0)) return '';
  // An exact common ratio first: 1440×900 reads 16:10 rather than 8:5.
  const exact = KS_COMMON_RATIOS.find(([a, b]) => w * b === h * a);
  if (exact) return `${exact[0]}:${exact[1]}`;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  if (w / g <= 32 && h / g <= 32) return `${w / g}:${h / g}`;
  const near = KS_COMMON_RATIOS.find(([a, b]) => Math.abs(w / h - a / b) / (a / b) < 0.01);
  if (near) return `≈ ${near[0]}:${near[1]}`;
  return w >= h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`;
}

// "1440 × 900 (16:10, Name)"
function ksPresetLabel(p) {
  return `${p.w} × ${p.h} (${ksRatioLabel(p.w, p.h)}${p.name ? ', ' + p.name : ''})`;
}
