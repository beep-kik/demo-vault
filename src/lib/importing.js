import { unzipSync } from 'fflate';
import {
  encodeText,
  decodeText,
  hashFiles,
  isHtmlPath,
  mimeFor,
  normalizePath,
  readArrayBuffer
} from './util.js';

/* A "bundle" is a demo ready to be written to storage:
 *   { title, entryPath, tags, files: [{ path, data: ArrayBuffer, mime }] } */

export const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;

/* ------------------------------------------------------------ entry picking */

/** Choose the file that should open when the demo is selected. */
export function pickEntry(paths) {
  const html = paths.filter(isHtmlPath);
  if (!html.length) return null;

  const atRoot = html.find((p) => p === 'index.html' || p === 'index.htm');
  if (atRoot) return atRoot;

  return html.slice().sort((a, b) => {
    const da = a.split('/').length;
    const db = b.split('/').length;
    if (da !== db) return da - db; // shallowest wins
    const ia = /(^|\/)index\.x?html?$/i.test(a) ? 0 : 1;
    const ib = /(^|\/)index\.x?html?$/i.test(b) ? 0 : 1;
    if (ia !== ib) return ia - ib; // then anything called index
    return a.localeCompare(b);
  })[0];
}

/** "myproject/index.html" -> "index.html" when every path shares a root folder. */
export function stripCommonRoot(map) {
  let current = map;
  for (let guard = 0; guard < 12; guard++) {
    const paths = Object.keys(current);
    if (paths.length === 0) break;
    const head = paths[0].split('/')[0];
    const shared = paths.every((p) => p.includes('/') && p.split('/')[0] === head);
    if (!shared) break;
    const next = {};
    for (const p of paths) next[p.slice(head.length + 1)] = current[p];
    current = next;
  }
  return current;
}

export function extractTitle(html, fallback) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const t = doc.querySelector('title');
    const title = t && t.textContent ? t.textContent.trim().replace(/\s+/g, ' ') : '';
    if (title) return title.slice(0, 120);
    const h1 = doc.querySelector('h1');
    const heading = h1 && h1.textContent ? h1.textContent.trim().replace(/\s+/g, ' ') : '';
    if (heading) return heading.slice(0, 120);
  } catch (_) {
    /* malformed markup — fall back to the filename */
  }
  return fallback;
}

function baseName(path) {
  const name = String(path).split('/').pop() || 'demo';
  return name.replace(/\.x?html?$/i, '') || name;
}

function isJunk(path) {
  return (
    path.startsWith('__MACOSX/') ||
    path.split('/').some((s) => s === '.DS_Store' || s === 'Thumbs.db' || s === '.git')
  );
}

/* ------------------------------------------------------------ bundle making */

/** @param {Record<string, ArrayBuffer>} map path -> bytes */
export function bundleFromMap(map, hint = {}) {
  const cleaned = {};
  for (const [rawPath, data] of Object.entries(map)) {
    const path = normalizePath(rawPath);
    if (!path || isJunk(path)) continue;
    cleaned[path] = data;
  }

  const stripped = stripCommonRoot(cleaned);
  const paths = Object.keys(stripped);
  if (!paths.length) throw new Error('That looks empty — no files found');

  const entryPath = pickEntry(paths);
  if (!entryPath) throw new Error('No .html file in there, so there is nothing to preview');

  const total = paths.reduce((n, p) => n + stripped[p].byteLength, 0);
  if (total > MAX_BUNDLE_BYTES) {
    throw new Error('That demo is over 200 MB, which is too big to keep in the browser');
  }

  const title = hint.title || extractTitle(decodeText(stripped[entryPath]), baseName(entryPath));

  return {
    title,
    entryPath,
    tags: hint.tags || [],
    files: paths.map((p) => ({ path: p, data: stripped[p], mime: mimeFor(p) }))
  };
}

export function bundleFromHtml(html, hint = {}) {
  const data = encodeText(html).buffer;
  return bundleFromMap({ 'index.html': data }, hint);
}

/* ----------------------------------------------------------------- archives */

function unzipToMap(arrayBuffer) {
  const raw = unzipSync(new Uint8Array(arrayBuffer));
  const map = {};
  for (const [path, bytes] of Object.entries(raw)) {
    if (path.endsWith('/')) continue; // directory record
    if (isJunk(path)) continue;
    // Copy into a standalone ArrayBuffer; fflate hands back views into a
    // shared buffer, and IndexedDB would otherwise store the whole thing.
    map[path] = bytes.slice().buffer;
  }
  return map;
}

/** A Demo Vault backup zip, as written by exportAll(). */
function readManifest(map) {
  const key = Object.keys(map).find((p) => p === 'manifest.json' || p.endsWith('/manifest.json'));
  if (!key) return null;
  try {
    const parsed = JSON.parse(decodeText(map[key]));
    if (parsed && parsed.app === 'demo-vault' && Array.isArray(parsed.projects)) {
      return { manifest: parsed, prefix: key.slice(0, key.length - 'manifest.json'.length) };
    }
  } catch (_) {
    /* not ours */
  }
  return null;
}

export function bundlesFromZip(arrayBuffer, hint = {}) {
  const map = unzipToMap(arrayBuffer);
  const found = readManifest(map);

  if (!found) return [bundleFromMap(map, hint)];

  // Backup restore: rebuild every project the manifest describes.
  const out = [];
  for (const p of found.manifest.projects) {
    const dir = found.prefix + p.dir + '/';
    const sub = {};
    for (const path of Object.keys(map)) {
      if (path.startsWith(dir)) sub[path.slice(dir.length)] = map[path];
    }
    if (!Object.keys(sub).length) continue;
    out.push({
      title: p.title,
      entryPath: p.entryPath && sub[p.entryPath] ? p.entryPath : pickEntry(Object.keys(sub)),
      tags: p.tags || [],
      favorite: !!p.favorite,
      createdAt: p.createdAt,
      files: Object.keys(sub).map((path) => ({
        path,
        data: sub[path],
        mime: mimeFor(path)
      }))
    });
  }
  if (!out.length) throw new Error('That backup did not contain any demos');
  return out;
}

/* ------------------------------------------------- drag & drop / file picker */

/** Must run synchronously inside the drop handler; the item list dies after. */
export function entriesFromDataTransfer(dataTransfer) {
  const out = [];
  const items = dataTransfer.items;
  if (items && items.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) out.push(entry);
      else {
        const file = item.getAsFile();
        if (file) out.push({ plainFile: file });
      }
    }
  }
  if (!out.length && dataTransfer.files) {
    for (const file of dataTransfer.files) out.push({ plainFile: file });
  }
  return out;
}

function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const acc = [];
    const step = () => {
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(acc);
        acc.push(...batch);
        step(); // readEntries returns at most ~100 per call
      }, reject);
    };
    step();
  });
}

async function walkEntry(entry, prefix, out) {
  if (entry.plainFile) {
    out.push({ path: entry.plainFile.name, file: entry.plainFile });
    return;
  }
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    out.push({ path: prefix + entry.name, file });
    return;
  }
  if (entry.isDirectory) {
    const children = await readAllEntries(entry.createReader());
    for (const child of children) await walkEntry(child, prefix + entry.name + '/', out);
  }
}

/** Flatten dropped entries into [{ path, file }], keeping folder structure. */
export async function flattenEntries(entries) {
  const out = [];
  for (const entry of entries) await walkEntry(entry, '', out);
  return out.filter((f) => !isJunk(normalizePath(f.path)));
}

/** For <input type="file" webkitdirectory> and multi-file pickers. */
export function flattenFileList(fileList) {
  return [...fileList].map((file) => ({
    path: file.webkitRelativePath || file.name,
    file
  }));
}

/* ------------------------------------------------------------------ planning */

/**
 * Decide how a set of dropped paths splits into demos.
 * Loose .html files each become their own demo; folders and zips become one
 * each; Chrome's "Save page as complete" pair is stitched back together.
 */
export async function planBundles(flatFiles, hint = {}) {
  const files = flatFiles.filter((f) => f.path && !isJunk(normalizePath(f.path)));
  if (!files.length) throw new Error('Nothing usable in that drop');

  const groups = new Map(); // key -> [{path, file}]
  const looseHtml = [];
  const looseOther = [];

  for (const f of files) {
    const path = normalizePath(f.path);
    const segments = path.split('/');
    if (segments.length > 1) {
      const key = segments[0];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ path: segments.slice(1).join('/'), file: f.file });
    } else if (isHtmlPath(path)) {
      looseHtml.push({ path, file: f.file });
    } else {
      looseOther.push({ path, file: f.file });
    }
  }

  const jobs = []; // { files:[{path,file}], hint }

  // Chrome save-complete: page.html next to page_files/
  for (const html of looseHtml.slice()) {
    const stem = html.path.replace(/\.x?html?$/i, '');
    const dirKey = [...groups.keys()].find(
      (k) => k === stem + '_files' || k === stem + ' files' || k === stem + '_fichiers'
    );
    if (!dirKey) continue;
    const assets = groups.get(dirKey).map((a) => ({ path: dirKey + '/' + a.path, file: a.file }));
    groups.delete(dirKey);
    looseHtml.splice(looseHtml.indexOf(html), 1);
    jobs.push({ files: [html, ...assets], hint });
  }

  for (const [key, members] of groups) jobs.push({ files: members, hint: { ...hint, folder: key } });

  const zips = looseOther.filter((f) => /\.zip$/i.test(f.path));
  const rest = looseOther.filter((f) => !/\.zip$/i.test(f.path));

  if (looseHtml.length === 1 && rest.length) {
    jobs.push({ files: [looseHtml[0], ...rest], hint });
  } else {
    for (const html of looseHtml) jobs.push({ files: [html], hint });
  }

  const bundles = [];

  for (const zip of zips) {
    const buffer = await readArrayBuffer(zip.file);
    bundles.push(...bundlesFromZip(buffer, hint));
  }

  for (const job of jobs) {
    const map = {};
    for (const member of job.files) {
      map[member.path] = await readArrayBuffer(member.file);
    }
    const folderTitle = job.hint.folder;
    const bundle = bundleFromMap(map, { tags: hint.tags });
    if (folderTitle && bundle.title === 'index') bundle.title = folderTitle;
    if (hint.title && bundles.length === 0 && jobs.length === 1 && !zips.length) {
      bundle.title = hint.title;
    }
    bundles.push(bundle);
  }

  if (!bundles.length) throw new Error('No .html file in that drop, so there is nothing to preview');
  return bundles;
}

export function hashBundle(bundle) {
  return hashFiles(bundle.files);
}
