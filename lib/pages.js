// Per-page storage keys and custom CSS helpers.
// Plain script (see lib/defaults.js for why).

// Anchors are stored per page: URL without query string, hash or trailing slash.
function ksAnchorKey(url) {
  const u = new URL(url);
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return 'anchors:' + u.origin + path;
}

// The custom CSS uses the same page identity as the anchors.
function ksCssKey(url) {
  return 'css:' + ksAnchorKey(url).slice('anchors:'.length);
}

// Removes "// ..." comments (not standard CSS, but handy) before the CSS is injected.
// Leaves "//" alone inside strings, /* */ comments and url(...) (https://...).
function ksStripLineComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if ((c === 'u' || c === 'U') && /^url\(/i.test(src.slice(i, i + 4))) {
      let j = i + 4;
      while (j < n && src[j] !== ')' && src[j] !== '\n') j++;
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i);
      i = e < 0 ? n : e;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
