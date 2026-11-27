// Lightweight CSS syntax highlighting, no dependency.
// How: the <textarea> stays the editor (transparent text, visible caret) and a <pre> placed
// exactly underneath shows the same text, colored.

export function highlightCss(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const span = (cls, s) => `<span class="t-${cls}">${esc(s)}</span>`;
  let out = '';
  let i = 0;
  let mode = 'start'; // start (beginning of a statement) | selector | prop | value | at
  const n = src.length;

  // At the beginning of a statement: selector (followed by "{") or declaration (";" or "}" first)?
  const nextIsBlock = (from) => {
    let depthParen = 0;
    for (let j = from; j < n; j++) {
      const c = src[j];
      if (c === '/' && src[j + 1] === '*') {
        const e = src.indexOf('*/', j + 2);
        j = e < 0 ? n : e + 1;
        continue;
      }
      if (c === '/' && src[j + 1] === '/') {
        const e = src.indexOf('\n', j);
        j = e < 0 ? n : e;
        continue;
      }
      if (c === '"' || c === "'") {
        const e = src.indexOf(c, j + 1);
        j = e < 0 ? n : e;
        continue;
      }
      if (c === '(') depthParen++;
      else if (c === ')') depthParen--;
      else if (depthParen <= 0 && c === '{') return true;
      else if (depthParen <= 0 && (c === ';' || c === '}')) return false;
    }
    return false;
  };
  let depth = 0;

  while (i < n) {
    const c = src[i];
    // Comment
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      out += span('comment', src.slice(i, end));
      i = end;
      continue;
    }
    // "//" line comment: not standard CSS, removed before injection (ksStripLineComments).
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i);
      const end = e < 0 ? n : e;
      out += span('comment', src.slice(i, end));
      i = end;
      continue;
    }
    // String
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        j++;
      }
      const end = Math.min(n, j + 1);
      out += span('string', src.slice(i, end));
      i = end;
      continue;
    }
    // Whitespace
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j++;
      out += esc(src.slice(i, j));
      i = j;
      continue;
    }
    if (mode === 'start') {
      if (c === '@') mode = 'at';
      else if (depth === 0 || nextIsBlock(i)) mode = 'selector';
      else mode = 'prop';
    }
    if (c === '{') {
      out += span('punct', c);
      depth++;
      mode = 'start';
      i++;
      continue;
    }
    if (c === '}') {
      out += span('punct', c);
      depth = Math.max(0, depth - 1);
      mode = 'start';
      i++;
      continue;
    }
    if (c === ';') {
      out += span('punct', c);
      mode = 'start';
      i++;
      continue;
    }

    if (mode === 'at') {
      let j = i + 1;
      while (j < n && /[\w-]/.test(src[j])) j++;
      out += span('at', src.slice(i, j));
      i = j;
      mode = 'value'; // the rest ("screen and (...)") is colored like a value
      continue;
    }
    if (mode === 'selector') {
      // Up to "{", without cutting inside [attr="..."] or a string.
      let j = i,
        q = null,
        br = 0;
      while (j < n) {
        const d = src[j];
        if (q) {
          if (d === q) q = null;
          j++;
          continue;
        }
        if (d === '"' || d === "'") {
          q = d;
          j++;
          continue;
        }
        if (d === '[') br++;
        else if (d === ']') br--;
        if (br <= 0 && (d === '{' || d === '}' || (d === '/' && (src[j + 1] === '*' || src[j + 1] === '/')))) break;
        j++;
      }
      if (j === i) j = i + 1;
      out += span('selector', src.slice(i, j));
      i = j;
      continue;
    }
    if (mode === 'prop') {
      if (c === ':') {
        out += span('punct', c);
        mode = 'value';
        i++;
        continue;
      }
      let j = i;
      while (j < n && !/[:;{}\s]/.test(src[j]) && !(src[j] === '/' && (src[j + 1] === '*' || src[j + 1] === '/'))) j++;
      if (j === i) j = i + 1;
      out += span(src.startsWith('--', i) ? 'var' : 'prop', src.slice(i, j));
      i = j;
      continue;
    }
    // Value
    let m;
    const rest = src.slice(i, i + 80);
    if ((m = /^!\s*important/i.exec(rest))) {
      out += span('important', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^#[0-9a-fA-F]{3,8}\b/.exec(rest))) {
      out += span('number', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^-?(\d+\.?\d*|\.\d+)([a-zA-Z%]+)?/.exec(rest))) {
      out += span('number', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^--[\w-]+/.exec(rest))) {
      out += span('var', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^url\(/i.exec(rest))) {
      // Unquoted url(...) may contain "//" (https://...): it is not a comment.
      out += span('func', m[0].slice(0, -1)) + span('punct', '(');
      i += m[0].length;
      let j = i;
      while (j < n && src[j] !== ')' && src[j] !== '\n') j++;
      if (j > i) out += span('string', src.slice(i, j));
      i = j;
      continue;
    }
    if ((m = /^[a-zA-Z_][\w-]*(?=\()/.exec(rest))) {
      out += span('func', m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^[a-zA-Z_-][\w-]*/.exec(rest))) {
      out += span('value', m[0]);
      i += m[0].length;
      continue;
    }
    out += span('punct', c);
    i++;
  }
  // A trailing newline must take up a line in the <pre>.
  return out + (src.endsWith('\n') ? ' ' : '');
}

// Attaches the highlighting to a textarea already in the DOM.
export function attachHighlighter(ta) {
  const wrap = document.createElement('div');
  wrap.className = 'code';
  const pre = document.createElement('pre');
  pre.setAttribute('aria-hidden', 'true');
  ta.parentNode.insertBefore(wrap, ta);
  wrap.appendChild(pre);
  wrap.appendChild(ta);
  const render = () => {
    pre.innerHTML = highlightCss(ta.value);
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };
  ta.addEventListener('input', render);
  ta.addEventListener('scroll', () => {
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  });
  // The textarea can be resized: the <pre> follows its height.
  new ResizeObserver(() => {
    pre.style.height = ta.offsetHeight + 'px';
  }).observe(ta);
  render();
  return { render };
}
