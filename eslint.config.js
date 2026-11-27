// ESLint flat config. Run with `npm run lint`.
const js = require('@eslint/js');
const globals = require('globals');

// Globals defined by the plain scripts in lib/ (shared by the content scripts, the popup, the
// settings page and the service worker).
const libGlobals = Object.fromEntries(
  [
    'KS_ANCHOR_DEFAULTS',
    'KS_REC_DEFAULTS',
    'KS_FPS_OPTIONS',
    'KS_OUTPUT_DEFAULTS',
    'KS_DEFAULTS_VERSION',
    'ksAnchorOwnValues',
    'ksSameEasing',
    'KS_PRESETS',
    'KS_PRESET_LABELS',
    'ksBezier',
    'ksParseEasing',
    'ksFormatEasing',
    'ksPresetOf',
    'ksAnchorKey',
    'ksCssKey',
    'ksStripLineComments',
    'KS_BAD_CHARS',
    'ksCleanFileName',
    'ksCleanFolder',
    'ksLocalStamp',
    'ksRecordingPath',
    'KS_COMMON_RATIOS',
    'ksRatioLabel',
    'ksPresetLabel',
    'KS_CURSOR_SHAPES',
    'KS_CURSOR_SHAPE_LABELS',
    'KS_CURSOR_DEFAULTS',
    'KS_CURSOR_CUSTOM_DEFAULT',
    'KS_CURSOR_BUILTIN',
    'KS_HANDS_MAC',
    'KS_HANDS_WIN',
    'ksCursorIconSet',
    'ksSvgSize',
    'ksCursorShadow',
    'ksSvgUrl',
    'ksHandSvg',
    'ksArc',
    'ksHandIcons',
    'ksIBeam'
  ].map((name) => [name, 'readonly'])
);

module.exports = [
  { ignores: ['vendor/**', 'node_modules/**', '.preview/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions, ...libGlobals }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    // lib/ defines the shared globals: top-level declarations are used by other files.
    files: ['lib/**/*.js'],
    rules: { 'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }], 'no-redeclare': 'off' }
  },
  {
    files: ['background.js'],
    languageOptions: { globals: { ...globals.serviceworker, importScripts: 'readonly' } }
  },
  {
    files: ['offscreen/**/*.js'],
    languageOptions: { globals: { Mp4Muxer: 'readonly', MediaStreamTrackProcessor: 'readonly' } }
  },
  {
    files: ['popup/**/*.js'],
    languageOptions: { sourceType: 'module' }
  },
  {
    files: ['eslint.config.js', 'tests/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
  }
];
