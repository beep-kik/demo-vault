import { zipSync } from 'fflate';
import { downloadBlob, encodeText, slugify } from './util.js';
import { getFiles } from './store.js';

function bytes(data) {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function uniqueDir(taken, base) {
  let dir = base;
  let n = 2;
  while (taken.has(dir)) dir = base + '-' + n++;
  taken.add(dir);
  return dir;
}

/** Single-file demos download as plain .html; multi-file demos as a .zip. */
export async function exportProject(project) {
  const files = await getFiles(project.id);
  if (!files.length) throw new Error('That demo has no files left to export');

  const name = slugify(project.title, project.id);

  if (files.length === 1) {
    const only = files[0];
    downloadBlob(new Blob([only.data], { type: only.mime }), name + '.html');
    return name + '.html';
  }

  const tree = {};
  for (const f of files) tree[f.path] = bytes(f.data);
  downloadBlob(new Blob([zipSync(tree, { level: 6 })], { type: 'application/zip' }), name + '.zip');
  return name + '.zip';
}

/**
 * Write the entire library to one zip. The manifest makes it restorable:
 * dropping this file back onto Demo Vault rebuilds every demo inside it.
 */
export async function exportAll(projects) {
  if (!projects.length) throw new Error('There is nothing saved yet');

  const tree = {};
  const taken = new Set();
  const manifest = {
    app: 'demo-vault',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: []
  };

  for (const project of projects) {
    const files = await getFiles(project.id);
    if (!files.length) continue;
    const dir = uniqueDir(taken, slugify(project.title, project.id));
    for (const f of files) tree[dir + '/' + f.path] = bytes(f.data);
    manifest.projects.push({
      id: project.id,
      title: project.title,
      kind: project.kind,
      entryPath: project.entryPath,
      tags: project.tags || [],
      hash: project.hash,
      size: project.size,
      createdAt: project.createdAt,
      favorite: !!project.favorite,
      dir
    });
  }

  tree['manifest.json'] = encodeText(JSON.stringify(manifest, null, 2));
  const filename = 'demo-vault-' + stamp() + '.zip';
  downloadBlob(new Blob([zipSync(tree, { level: 6 })], { type: 'application/zip' }), filename);
  return filename;
}
