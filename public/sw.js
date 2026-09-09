/* Demo Vault — virtual filesystem service worker.
 *
 * Serves demo assets out of IndexedDB at /__vfs/<projectId>/<path>, so a stored
 * demo behaves exactly like a folder on disk: relative hrefs, fetch(), dynamic
 * import() and <img src="./a.png"> all resolve normally.
 *
 * Deliberately dependency-free and raw-IDB: this file is NOT bundled by Vite,
 * so it cannot import Dexie. It only ever READS the database.
 */

const DB_NAME = 'demo-vault';
const STORE_FILES = 'files';
const STORE_PROJECTS = 'projects';
const PREFIX = '/__vfs/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'PING') {
    e.source && e.source.postMessage({ type: 'PONG' });
  }
});

/* ---------------------------------------------------------------- IndexedDB */

/* Opening a non-existent database with no version silently CREATES an empty
 * one, which would then block Dexie from installing its own v1 schema. So we
 * check existence first where the browser supports it, and treat a store-less
 * database as "app has not booted yet" rather than an error. */
function openDB() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME);
    } catch (_) {
      return resolve(null);
    }
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (
        !db.objectStoreNames.contains(STORE_FILES) ||
        !db.objectStoreNames.contains(STORE_PROJECTS)
      ) {
        db.close();
        return resolve(null);
      }
      resolve(db);
    };
  });
}

async function getDB() {
  if (indexedDB.databases) {
    try {
      const list = await indexedDB.databases();
      if (!list.some((d) => d.name === DB_NAME)) return null;
    } catch (_) {
      /* fall through and try opening anyway */
    }
  }
  return openDB();
}

function idbGet(db, store, key) {
  return new Promise((resolve) => {
    let req;
    try {
      req = db.transaction(store, 'readonly').objectStore(store).get(key);
    } catch (_) {
      return resolve(undefined);
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

/* --------------------------------------------------------------- MIME types */

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

function mimeFor(path) {
  const i = path.lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  return MIME[path.slice(i + 1).toLowerCase()] || 'application/octet-stream';
}

/* -------------------------------------------------------------------- paths */

/* Resolve "a/./b/../c.png" -> "a/c.png"; never escapes above the project root. */
function normalize(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

/* --------------------------------------------------------------------- HTTP */

function page(status, title, body) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
      `<style>html{color-scheme:dark}body{margin:0;height:100vh;display:flex;align-items:center;` +
      `justify-content:center;background:#0d0e0c;color:#9ba193;` +
      `font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;padding:24px}` +
      `b{display:block;color:#e5e7e0;font-size:14px;margin-bottom:6px}</style>${body}`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function serve(url) {
  const rest = decodeURIComponent(url.pathname.slice(PREFIX.length));
  const slash = rest.indexOf('/');
  const projectId = slash < 0 ? rest : rest.slice(0, slash);
  let path = normalize(slash < 0 ? '' : rest.slice(slash + 1));

  if (!projectId) return page(400, 'Bad request', '<b>Missing demo id</b>');

  const db = await getDB();
  if (!db) {
    return page(
      503,
      'Not ready',
      '<div><b>Demo Vault has not loaded yet</b>Open the app in another tab first, then reload this page.</div>'
    );
  }

  try {
    let rec = path ? await idbGet(db, STORE_FILES, [projectId, path]) : undefined;

    /* Directory-style URL: fall back to its index.html. */
    if (!rec) {
      const asIndex = normalize(path + '/index.html');
      rec = await idbGet(db, STORE_FILES, [projectId, asIndex]);
      if (rec) path = asIndex;
    }

    if (!rec) {
      const project = await idbGet(db, STORE_PROJECTS, projectId);
      if (!project) {
        return page(404, 'Not found', '<div><b>Demo not found</b>It may have been deleted.</div>');
      }
      return page(
        404,
        'Not found',
        `<div><b>File not found</b>${escapeHtml(path || '(root)')} is not part of "${escapeHtml(
          project.title || 'this demo'
        )}".</div>`
      );
    }

    const body = rec.data instanceof ArrayBuffer ? rec.data : rec.data;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': rec.mime || mimeFor(path),
        'Cache-Control': 'no-store',
        'X-Demo-Vault': '1'
      }
    });
  } catch (err) {
    return page(500, 'Error', `<div><b>Could not read demo</b>${escapeHtml(String(err))}</div>`);
  } finally {
    db.close();
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(PREFIX)) return;

  event.respondWith(serve(url));
});
