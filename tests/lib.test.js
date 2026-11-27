const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./load-lib');

const ks = loadLib('defaults.js', 'easing.js', 'pages.js', 'files.js', 'sizes.js');
// Arrays created in the sandbox belong to another realm: copy them before deepEqual.
const arr = (a) => (a ? [...a] : a);

test('ksBezier: linear and endpoints', () => {
  const linear = ks.ksBezier(0, 0, 1, 1);
  assert.equal(linear(0), 0);
  assert.equal(linear(1), 1);
  assert.ok(Math.abs(linear(0.3) - 0.3) < 1e-4);
  const ease = ks.ksBezier(0.42, 0, 0.58, 1);
  assert.ok(Math.abs(ease(0.5) - 0.5) < 1e-4); // symmetric curve
  assert.ok(ease(0.1) < 0.1); // slow start
});

test('ksParseEasing accepts numbers, cubic-bezier() and preset names', () => {
  assert.deepEqual(arr(ks.ksParseEasing('0.42, 0, 0.58, 1')), [0.42, 0, 0.58, 1]);
  assert.deepEqual(arr(ks.ksParseEasing('cubic-bezier(.25,.1,.25,1)')), [0.25, 0.1, 0.25, 1]);
  assert.deepEqual(arr(ks.ksParseEasing('ease-in')), [0.42, 0, 1, 1]);
  assert.equal(ks.ksParseEasing(''), null);
  assert.equal(ks.ksParseEasing('1, 2, 3'), null);
  assert.equal(ks.ksParseEasing('1.5, 0, 0.5, 1'), null); // x out of [0, 1]
});

test('ksFormatEasing / ksPresetOf', () => {
  assert.equal(ks.ksFormatEasing([0.6900001, 0, 0.36, 1]), '0.69, 0, 0.36, 1');
  assert.equal(ks.ksPresetOf([0, 0, 1, 1]), 'linear');
  assert.equal(ks.ksPresetOf([0.1, 0.2, 0.3, 0.4]), null);
});

test('ksAnchorOwnValues keeps only values that differ from the defaults', () => {
  const d = ks.KS_ANCHOR_DEFAULTS;
  assert.deepEqual({ ...ks.ksAnchorOwnValues({ ...d }) }, {});
  assert.deepEqual(
    { ...ks.ksAnchorOwnValues({ speed: 800, pause: d.pause, easing: [0, 0, 1, 1] }) },
    { speed: 800, easing: [0, 0, 1, 1] }
  );
});

test('ksAnchorKey / ksCssKey ignore query, hash and trailing slash', () => {
  assert.equal(ks.ksAnchorKey('https://site.com/work/project/?a=1#top'), 'anchors:https://site.com/work/project');
  assert.equal(ks.ksAnchorKey('https://site.com/'), 'anchors:https://site.com/');
  assert.equal(ks.ksCssKey('https://site.com/work'), 'css:https://site.com/work');
});

test('ksStripLineComments removes // comments but not URLs or strings', () => {
  const src = 'a { color: red; } // gone\nb { background: url(https://x.com/i.png); content: "//kept"; } /* // kept */';
  const out = ks.ksStripLineComments(src);
  assert.ok(!out.includes('gone'));
  assert.ok(out.includes('url(https://x.com/i.png)'));
  assert.ok(out.includes('"//kept"'));
  assert.ok(out.includes('/* // kept */'));
});

test('ksCleanFileName / ksCleanFolder / ksRecordingPath', () => {
  assert.equal(ks.ksCleanFileName('A/B: "test"'), 'A B test');
  assert.equal(ks.ksCleanFileName('x'.repeat(40)).length, 27);
  assert.equal(ks.ksCleanFileName('   '), 'recording');
  assert.equal(ks.ksCleanFolder('../a//b/./c'), 'a/b/c');
  assert.equal(
    ks.ksRecordingPath('key-scroll-recordings', 'My site', 'mp4', new Date(2026, 0, 2, 3, 4, 5)),
    'key-scroll-recordings/My site 2026-01-02 03-04-05.mp4'
  );
  assert.equal(ks.ksRecordingPath('', 'My site', 'mp4', new Date(2026, 0, 2, 3, 4, 5)), 'My site 2026-01-02 03-04-05.mp4');
});

test('ksRatioLabel prefers common ratios', () => {
  assert.equal(ks.ksRatioLabel(1920, 1080), '16:9');
  assert.equal(ks.ksRatioLabel(1440, 900), '16:10');
  assert.equal(ks.ksRatioLabel(885, 1180), '3:4');
  assert.equal(ks.ksRatioLabel(664, 1180), '≈ 9:16');
  assert.equal(ks.ksRatioLabel(0, 10), '');
  assert.equal(ks.ksPresetLabel({ w: 1080, h: 1350, name: 'Feed' }), '1080 × 1350 (4:5, Feed)');
});

test('fps options include the 60 fps default', () => {
  assert.ok(ks.KS_FPS_OPTIONS.includes(ks.KS_REC_DEFAULTS.fps));
});
