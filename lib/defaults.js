// Factory defaults shared by every part of the extension.
//
// The files in lib/ are plain scripts (not ES modules) because they are loaded in places that
// cannot import modules: content scripts, and the service worker through importScripts().
// They only use `var` and function declarations so a content script can be injected twice
// (see toContent() in background.js) without a redeclaration error.

// Scroll settings of an anchor. An anchor field left empty uses these values.
var KS_ANCHOR_DEFAULTS = { speed: 1000, easing: [0.69, 0, 0.36, 1], pause: 1000 };

// Recording settings (editable in the settings page, which has a "reset" button).
var KS_REC_DEFAULTS = {
  width: 1440,
  height: 810,
  countdown: 3, // seconds
  hideScrollbars: false,
  quality: 12, // video bitrate in Mb/s
  fps: 60, // frames per second of the output video
  debug: false // also save a .log.json diagnostic file next to the video
};

// Frame rates offered in the settings page.
var KS_FPS_OPTIONS = [24, 25, 30, 50, 60];

// Subfolder of the Downloads folder (browsers don't allow saving anywhere else).
var KS_OUTPUT_DEFAULTS = { folder: 'key-scroll-recordings' };

// Bump when a default value changes: the service worker re-applies it once (see background.js).
var KS_DEFAULTS_VERSION = 2;

// Values to store in a new anchor from the "next anchor" settings at the top of the popup.
// Only values that differ from the defaults are kept: a missing value means "default".
function ksAnchorOwnValues(next) {
  const d = KS_ANCHOR_DEFAULTS,
    own = {};
  if (next.speed != null && next.speed !== d.speed) own.speed = next.speed;
  if (next.pause != null && next.pause !== d.pause) own.pause = next.pause;
  if (next.easing && !ksSameEasing(next.easing, d.easing)) own.easing = next.easing.slice();
  return own;
}

// True when two cubic-bezier arrays are equal (to 0.001).
function ksSameEasing(a, b) {
  return !!a && !!b && a.every((n, i) => Math.abs(n - b[i]) < 1e-3);
}
