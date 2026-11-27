// Name and location of the downloaded video.
// Plain script (see lib/defaults.js for why).

// Characters not allowed in file names (Windows + macOS) and control characters.
// eslint-disable-next-line no-control-regex -- control characters are exactly what must be removed
var KS_BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

// Tab title → safe file name, 27 characters at most.
function ksCleanFileName(title) {
  let name = String(title || '')
    .replace(KS_BAD_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  if (name.length > 27) name = name.slice(0, 27).trim();
  return name || 'recording';
}

// Subfolder relative to Downloads: each segment is cleaned, never ".." nor an absolute path.
function ksCleanFolder(folder) {
  return String(folder || '')
    .split(/[\\/]+/)
    .map((p) => p.replace(KS_BAD_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim())
    .filter(Boolean)
    .join('/');
}

// "2026-11-24 23-28-46" in local time.
function ksLocalStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Full relative path of a recording: "folder/Tab title 2026-11-24 23-28-46.mp4".
function ksRecordingPath(folder, title, ext, d = new Date()) {
  const f = ksCleanFolder(folder);
  return (f ? f + '/' : '') + `${ksCleanFileName(title)} ${ksLocalStamp(d)}.${ext}`;
}
