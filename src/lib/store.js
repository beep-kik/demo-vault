import Dexie from 'dexie';
import { hashFiles, newId } from './util.js';

/* ============================================================================
 * The whole app talks to storage through the functions exported here and
 * nowhere else. Swapping IndexedDB for a hosted backend (Vercel Blob, S3,
 * Supabase) means reimplementing this file and nothing above it.
 *
 * projects: { id, title, kind, entryPath, tags[], hash, size, fileCount,
 *             createdAt, updatedAt, favorite }
 * files:    { projectId, path, data: ArrayBuffer, mime }
 *
 * The schema below is also read directly by public/sw.js using raw IndexedDB.
 * Changing store names or key paths means changing that file too.
 * ==========================================================================*/

export const db = new Dexie('demo-vault');

db.version(1).stores({
  projects: 'id, title, createdAt, updatedAt, favorite, hash',
  files: '[projectId+path], projectId'
});

export function openDatabase() {
  return db.open();
}

export async function listProjects() {
  const rows = await db.projects.toArray();
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return rows;
}

export function getProject(id) {
  return db.projects.get(id);
}

export function getFile(projectId, path) {
  return db.files.get([projectId, path]);
}

export function getFiles(projectId) {
  return db.files.where('projectId').equals(projectId).toArray();
}

export function findByHash(hash) {
  if (!hash) return Promise.resolve(undefined);
  return db.projects.where('hash').equals(hash).first();
}

/**
 * @param {{title:string, entryPath:string, tags?:string[], files:Array<{path:string,data:ArrayBuffer,mime:string}>, favorite?:boolean, createdAt?:number, id?:string}} input
 */
export async function createProject(input) {
  const files = input.files || [];
  if (!files.length) throw new Error('A demo needs at least one file');

  const entry = files.find((f) => f.path === input.entryPath);
  if (!entry) throw new Error('Entry file ' + input.entryPath + ' is missing');

  const id = input.id || newId();
  const size = files.reduce((n, f) => n + f.data.byteLength, 0);
  const hash = input.hash || (await hashFiles(files));
  const now = Date.now();

  const project = {
    id,
    title: input.title || 'Untitled demo',
    kind: files.length > 1 ? 'multi' : 'single',
    entryPath: input.entryPath,
    tags: dedupeTags(input.tags),
    hash,
    size,
    fileCount: files.length,
    createdAt: input.createdAt || now,
    updatedAt: now,
    favorite: !!input.favorite
  };

  await db.transaction('rw', db.projects, db.files, async () => {
    await db.projects.put(project);
    await db.files.bulkPut(
      files.map((f) => ({ projectId: id, path: f.path, data: f.data, mime: f.mime }))
    );
  });

  return project;
}

export async function updateProject(id, patch) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
  return db.projects.get(id);
}

export async function deleteProject(id) {
  await db.transaction('rw', db.projects, db.files, async () => {
    await db.files.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

export async function duplicateProject(id) {
  const src = await db.projects.get(id);
  if (!src) throw new Error('Demo not found');
  const files = await getFiles(id);
  return createProject({
    // A duplicate is a deliberate second copy, so give it a hash that can
    // never collide with the original and trip the dedupe check.
    hash: 'copy:' + newId(),
    title: nextCopyName(src.title),
    entryPath: src.entryPath,
    tags: src.tags,
    favorite: false,
    files: files.map((f) => ({ path: f.path, data: f.data, mime: f.mime }))
  });
}

function nextCopyName(title) {
  const m = /^(.*) copy(?: (\d+))?$/.exec(title || '');
  if (!m) return (title || 'Untitled') + ' copy';
  return m[1] + ' copy ' + (m[2] ? Number(m[2]) + 1 : 2);
}

export function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    const clean = String(t).trim().toLowerCase().replace(/\s+/g, '-');
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(0, 12);
}

export async function clearAll() {
  await db.transaction('rw', db.projects, db.files, async () => {
    await db.files.clear();
    await db.projects.clear();
  });
}

export async function estimateStorage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  } catch (_) {
    return null;
  }
}

/** Ask the browser not to evict this origin when disk runs low. */
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return false;
  }
}
