const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newId(len = 12) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function sha256(buf) {
  if (crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      /* insecure context — fall through */
    }
  }
  // Non-cryptographic fallback (FNV-1a). Only used when SubtleCrypto is
  // unavailable, i.e. plain http on a non-localhost host.
  const view = new Uint8Array(buf);
  let h = 0x811c9dc5;
  for (let i = 0; i < view.length; i++) {
    h ^= view[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'fnv' + h.toString(16).padStart(8, '0') + '-' + view.length.toString(16);
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const same = d.getFullYear() === now.getFullYear();
  return MONTHS[d.getMonth()] + ' ' + d.getDate() + (same ? '' : " '" + String(d.getFullYear()).slice(2));
}

export function slugify(s, fallback = 'demo') {
  const out = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || fallback;
}

const MIME = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
  zip: 'application/zip'
};

export function mimeFor(path) {
  const i = String(path).lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  return MIME[path.slice(i + 1).toLowerCase()] || 'application/octet-stream';
}

export function isHtmlPath(p) {
  return /\.x?html?$/i.test(p);
}

export function normalizePath(p) {
  const out = [];
  for (const seg of String(p).replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const MOD = IS_MAC ? '⌘' : 'Ctrl';

export function decodeText(buf) {
  return new TextDecoder('utf-8').decode(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
}

export function encodeText(s) {
  return new TextEncoder().encode(s);
}

/** Read a File/Blob as ArrayBuffer. */
export function readArrayBuffer(file) {
  if (file.arrayBuffer) return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read file'));
    r.readAsArrayBuffer(file);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Content hash for a whole demo: every path and its bytes.
 *
 * Hashing only the entry file would call two different demos identical
 * whenever their index.html matched but their assets did not. Hashing the
 * path of a lone file would do the opposite, treating "page.html" and
 * "page (1).html" as different demos — which is exactly the duplicate a
 * cluttered Downloads folder produces. So single files hash on content
 * alone, and bundles hash on their structure too.
 */
export async function hashFiles(files) {
  const list = [...files];
  if (list.length === 1) return sha256(list[0].data);

  const parts = [];
  for (const f of list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    parts.push(f.path + ':' + f.data.byteLength + ':' + (await sha256(f.data)));
  }
  return sha256(encodeText(parts.join('\n')).buffer);
}
