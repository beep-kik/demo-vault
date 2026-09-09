import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import Stage from './components/Stage.jsx';
import EmptyState from './components/EmptyState.jsx';
import ImportModal from './components/ImportModal.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import { Confirm, DragOverlay, PromptDialog, Toasts } from './components/Overlays.jsx';

import {
  createProject,
  deleteProject,
  dedupeTags,
  duplicateProject,
  estimateStorage,
  findByHash,
  listProjects,
  openDatabase,
  requestPersistence,
  updateProject
} from './lib/store.js';
import {
  bundleFromHtml,
  bundlesFromZip,
  entriesFromDataTransfer,
  flattenEntries,
  flattenFileList,
  hashBundle,
  planBundles
} from './lib/importing.js';
import { exportAll, exportProject } from './lib/exporting.js';
import { initServiceWorker, vfsUrl } from './lib/swClient.js';
import { MOD, readArrayBuffer } from './lib/util.js';

const isTyping = () => {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
};

const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (_) {
    return fallback;
  }
};

export default function App() {
  const [boot, setBoot] = useState({ state: 'loading', error: null, swReady: false });
  const [projects, setProjects] = useState([]);
  const [selId, setSelId] = useState(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [viewport, setViewport] = useState('desktop');
  const [nonce, setNonce] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importState, setImportState] = useState({ open: false, tab: 'paste', content: '' });
  const [palOpen, setPalOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [storage, setStorage] = useState(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(false);

  const [theme, setTheme] = useState(() => readPref('dv:theme', 'dark'));
  const [density, setDensity] = useState(() => readPref('dv:density', 'compact'));

  const searchRef = useRef(null);
  const titleRef = useRef(null);
  const listRef = useRef(null);
  const busyRef = useRef(false);

  /* ------------------------------------------------------------ toasts */

  const toast = useCallback((text, kind = 'info', action) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 5000);
  }, []);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* -------------------------------------------------------------- boot */

  const refresh = useCallback(async () => {
    const rows = await listProjects();
    setProjects(rows);
    setStorage(await estimateStorage());
    return rows;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await openDatabase();
      } catch (err) {
        if (alive) setBoot({ state: 'error', error: describeDbError(err), swReady: false });
        return;
      }

      let swReady = false;
      try {
        await initServiceWorker();
        swReady = true;
      } catch (err) {
        if (alive) toast(err.message, 'error');
      }

      try {
        await requestPersistence();
        const rows = await refresh();
        if (!alive) return;
        setSelId((cur) => cur || (rows[0] ? rows[0].id : null));
        setBoot({ state: 'ready', error: null, swReady });
      } catch (err) {
        if (alive) setBoot({ state: 'error', error: describeDbError(err), swReady });
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh, toast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('dv:theme', theme);
    } catch (_) {
      /* private mode */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    try {
      localStorage.setItem('dv:density', density);
    } catch (_) {
      /* private mode */
    }
  }, [density]);

  /* --------------------------------------------------------- selection */

  const allTags = useMemo(() => {
    const set = new Set();
    for (const p of projects) for (const t of p.tags || []) set.add(t);
    return ['all', '★', ...[...set].sort()];
  }, [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      const okTag = tag === 'all' ? true : tag === '★' ? !!p.favorite : (p.tags || []).includes(tag);
      if (!okTag) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.includes(q)) ||
        (p.entryPath || '').toLowerCase().includes(q)
      );
    });
  }, [projects, query, tag]);

  const selected = useMemo(() => projects.find((p) => p.id === selId) || null, [projects, selId]);

  useEffect(() => {
    if (!projects.length) {
      if (selId !== null) setSelId(null);
      return;
    }
    if (!projects.some((p) => p.id === selId)) {
      setSelId((visible[0] || projects[0]).id);
    }
  }, [projects, selId, visible]);

  useEffect(() => {
    setTitleDraft(selected ? selected.title : '');
    setMenuOpen(false);
  }, [selected]);

  const anyOverlay = importState.open || palOpen || !!confirmState || tagsOpen;

  /* ------------------------------------------------------------ import */

  const saveBundles = useCallback(
    async (bundles) => {
      const created = [];
      const skipped = [];

      for (const bundle of bundles) {
        const hash = await hashBundle(bundle);
        const existing = await findByHash(hash);
        if (existing) {
          skipped.push(existing);
          continue;
        }
        created.push(
          await createProject({
            title: bundle.title,
            entryPath: bundle.entryPath,
            tags: bundle.tags,
            favorite: bundle.favorite,
            createdAt: bundle.createdAt,
            hash,
            files: bundle.files
          })
        );
      }

      await refresh();

      if (created.length) {
        setSelId(created[created.length - 1].id);
        setQuery('');
        setTag('all');
      } else if (skipped.length) {
        setSelId(skipped[0].id);
      }

      if (created.length === 1 && !skipped.length) {
        toast('Saved “' + created[0].title + '”');
      } else if (created.length && skipped.length) {
        toast(`Saved ${created.length}, skipped ${skipped.length} already in your library`);
      } else if (created.length) {
        toast(`Saved ${created.length} demos`);
      } else if (skipped.length === 1) {
        toast('“' + skipped[0].title + '” is already in your library');
      } else {
        toast(`All ${skipped.length} were already in your library`);
      }
    },
    [refresh, toast]
  );

  const withBusy = useCallback(
    async (fn) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        toast(err && err.message ? err.message : String(err), 'error');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toast]
  );

  const importPaste = useCallback(
    (html, hint) =>
      withBusy(async () => {
        await saveBundles([bundleFromHtml(html, hint)]);
        setImportState({ open: false, tab: 'paste', content: '' });
      }),
    [saveBundles, withBusy]
  );

  const importFiles = useCallback(
    (source) =>
      withBusy(async () => {
        let flat;
        if (source.dataTransfer) {
          const entries = entriesFromDataTransfer(source.dataTransfer);
          flat = await flattenEntries(entries);
        } else {
          flat = flattenFileList(source.fileList);
        }
        if (!flat.length) throw new Error('Nothing usable in that drop');

        // A lone .zip is either one demo or a whole backup.
        if (flat.length === 1 && /\.zip$/i.test(flat[0].path)) {
          const buffer = await readArrayBuffer(flat[0].file);
          await saveBundles(bundlesFromZip(buffer));
        } else {
          await saveBundles(await planBundles(flat));
        }
        setImportState({ open: false, tab: 'paste', content: '' });
      }),
    [saveBundles, withBusy]
  );

  /* ----------------------------------------------------------- actions */

  const openImport = useCallback((tab = 'paste', content = '') => {
    setImportState({ open: true, tab, content });
  }, []);

  const commitTitle = useCallback(async () => {
    if (!selected) return;
    const next = titleDraft.trim();
    if (!next || next === selected.title) {
      setTitleDraft(selected.title);
      return;
    }
    await updateProject(selected.id, { title: next });
    await refresh();
  }, [selected, titleDraft, refresh]);

  const toggleStar = useCallback(
    async (id) => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      await updateProject(id, { favorite: !p.favorite });
      await refresh();
    },
    [projects, refresh]
  );

  const doDuplicate = useCallback(
    () =>
      withBusy(async () => {
        if (!selected) return;
        const copy = await duplicateProject(selected.id);
        await refresh();
        setSelId(copy.id);
        toast('Duplicated as “' + copy.title + '”');
      }),
    [selected, refresh, toast, withBusy]
  );

  const doExport = useCallback(
    () =>
      withBusy(async () => {
        if (!selected) return;
        const name = await exportProject(selected);
        toast('Downloaded ' + name);
      }),
    [selected, toast, withBusy]
  );

  const doExportAll = useCallback(
    () =>
      withBusy(async () => {
        const name = await exportAll(projects);
        toast('Downloaded ' + name);
      }),
    [projects, toast, withBusy]
  );

  const askDelete = useCallback(() => {
    if (!selected) return;
    setMenuOpen(false);
    setConfirmState({
      title: 'Delete “' + selected.title + '”?',
      body: 'This removes it from this browser. Export it first if you might want it back.',
      confirmLabel: 'Delete',
      danger: true,
      run: async () => {
        const order = visible.length ? visible : projects;
        const at = order.findIndex((p) => p.id === selected.id);
        const next = order[at + 1] || order[at - 1] || null;
        await deleteProject(selected.id);
        setSelId(next ? next.id : null);
        await refresh();
        toast('Deleted “' + selected.title + '”');
      }
    });
  }, [selected, visible, projects, refresh, toast]);

  const openTab = useCallback(() => {
    if (!selected) return;
    window.open(vfsUrl(selected.id, selected.entryPath), '_blank', 'noopener');
  }, [selected]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const renameFocus = useCallback(() => {
    setMenuOpen(false);
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus();
        titleRef.current.select();
      }
    }, 10);
  }, []);

  const saveTags = useCallback(
    async (raw) => {
      if (!selected) return;
      await updateProject(selected.id, { tags: dedupeTags(raw.split(/[,\s]+/)) });
      setTagsOpen(false);
      await refresh();
    },
    [selected, refresh]
  );

  /* ---------------------------------------------------------- hotkeys */

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalOpen((v) => !v);
        return;
      }

      if (anyOverlay) {
        if (e.key === 'Escape') {
          setImportState((s) => ({ ...s, open: false }));
          setPalOpen(false);
          setConfirmState(null);
          setTagsOpen(false);
        }
        return;
      }

      if (e.key === 'Escape') {
        setMenuOpen(false);
        if (isTyping() && document.activeElement) document.activeElement.blur();
        return;
      }

      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openImport('upload');
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        doExportAll();
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        doExport();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        doDuplicate();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        openTab();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reload();
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        renameFocus();
        return;
      }
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }

      if (isTyping()) return;

      if (e.key === 't') {
        e.preventDefault();
        if (selected) setTagsOpen(true);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        askDelete();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'ArrowUp' || e.key === 'k') {
        if (!visible.length) return;
        e.preventDefault();
        const down = e.key === 'ArrowDown' || e.key === 'j';
        const at = visible.findIndex((p) => p.id === selId);
        const next = at < 0 ? 0 : Math.min(Math.max(at + (down ? 1 : -1), 0), visible.length - 1);
        setSelId(visible[next].id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    anyOverlay,
    askDelete,
    doDuplicate,
    doExport,
    doExportAll,
    openImport,
    openTab,
    reload,
    renameFocus,
    selId,
    selected,
    visible
  ]);

  /* ------------------------------------------------------- drag & drop */

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      importFiles({ dataTransfer: e.dataTransfer });
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles]);

  /* Paste markup from anywhere without opening the dialog first. */
  useEffect(() => {
    const onPaste = (e) => {
      if (anyOverlay || isTyping()) return;
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!text || !/<\s*(!doctype|html|head|body|div|section|main|svg|table|h1|style|script)\b/i.test(text))
        return;
      e.preventDefault();
      openImport('paste', text);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [anyOverlay, openImport]);

  /* -------------------------------------------------------------- view */

  const commands = useMemo(
    () => [
      { id: 'add', label: 'Add a demo', key: MOD + 'O', run: () => openImport('upload') },
      { id: 'paste', label: 'Paste markup', key: '', run: () => openImport('paste') },
      { id: 'export', label: 'Export this demo', key: MOD + 'E', run: doExport },
      { id: 'exportAll', label: 'Export everything', key: MOD + '⇧E', run: doExportAll },
      { id: 'duplicate', label: 'Duplicate this demo', key: MOD + 'D', run: doDuplicate },
      { id: 'tags', label: 'Edit tags', key: 'T', run: () => selected && setTagsOpen(true) },
      { id: 'tab', label: 'Open in new tab', key: MOD + '⏎', run: openTab },
      { id: 'delete', label: 'Delete this demo', key: '⌫', run: askDelete },
      {
        id: 'theme',
        label: 'Toggle light and dark',
        key: '',
        run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
      }
    ],
    [openImport, doExport, doExportAll, doDuplicate, openTab, askDelete, selected]
  );

  if (boot.state === 'loading') {
    return (
      <div className="boot">
        <p>Opening your library…</p>
      </div>
    );
  }

  if (boot.state === 'error') {
    return (
      <div className="boot">
        <p>{boot.error}</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a3c04a';
  const starOff =
    getComputedStyle(document.documentElement).getPropertyValue('--fg-star-off').trim() || '#4c5045';

  const path = selected
    ? selected.entryPath + (selected.fileCount > 1 ? '  ·  ' + selected.fileCount + ' files' : '')
    : '';

  return (
    <div className="app">
      <Sidebar
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        tags={allTags}
        tag={tag}
        onTag={setTag}
        visible={visible}
        total={projects.length}
        selectedId={selId}
        onSelect={setSelId}
        onStar={toggleStar}
        storage={storage}
        onExportAll={doExportAll}
        onImport={() => openImport('upload')}
        theme={theme}
        onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        density={density}
        onDensity={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
        listRef={listRef}
        accent={accent}
        starOff={starOff}
      />

      <main className="main">
        <Toolbar
          project={selected}
          title={titleDraft}
          onTitle={setTitleDraft}
          onCommitTitle={commitTitle}
          titleRef={titleRef}
          path={path}
          viewport={viewport}
          onViewport={setViewport}
          onReload={reload}
          onOpenTab={openTab}
          menuOpen={menuOpen}
          onMenu={() => setMenuOpen((v) => !v)}
        />

        {!selected ? (
          <EmptyState
            onPaste={() => openImport('paste')}
            onUpload={() => openImport('upload')}
            onFolder={() => openImport('upload')}
          />
        ) : !boot.swReady ? (
          <div className="boot">
            <p>
              Previews need the service worker, which did not start in this browser. Everything else
              still works, and reloading the page usually fixes it.
            </p>
          </div>
        ) : (
          <Stage
            src={vfsUrl(selected.id, selected.entryPath) + '?v=' + nonce}
            viewport={viewport}
            nonce={selected.id + ':' + nonce}
            menuOpen={menuOpen}
            onCloseMenu={() => setMenuOpen(false)}
            actions={{
              rename: renameFocus,
              tags: () => {
                setMenuOpen(false);
                setTagsOpen(true);
              },
              duplicate: () => {
                setMenuOpen(false);
                doDuplicate();
              },
              export: () => {
                setMenuOpen(false);
                doExport();
              },
              remove: askDelete
            }}
          />
        )}
      </main>

      <ImportModal
        open={importState.open}
        initialTab={importState.tab}
        initialContent={importState.content}
        busy={busy}
        onClose={() => setImportState({ open: false, tab: 'paste', content: '' })}
        onPaste={importPaste}
        onFiles={importFiles}
      />

      <CommandPalette
        open={palOpen}
        projects={projects}
        commands={commands}
        onClose={() => setPalOpen(false)}
        onPick={(item) => {
          if (item.type === 'demo') setSelId(item.id);
          else if (item.run) item.run();
        }}
      />

      <PromptDialog
        open={tagsOpen}
        title={'Tags for “' + (selected ? selected.title : '') + '”'}
        label="tags"
        placeholder="landing dashboard wip"
        initial={selected ? (selected.tags || []).join(' ') : ''}
        onCancel={() => setTagsOpen(false)}
        onSubmit={saveTags}
      />

      <Confirm
        open={!!confirmState}
        title={confirmState ? confirmState.title : ''}
        body={confirmState ? confirmState.body : ''}
        confirmLabel={confirmState ? confirmState.confirmLabel : ''}
        danger={confirmState ? confirmState.danger : false}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const action = confirmState;
          setConfirmState(null);
          if (action && action.run) action.run();
        }}
      />

      <DragOverlay show={dragging} />
      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  );
}

function describeDbError(err) {
  const message = err && err.message ? err.message : String(err);
  if (/quota/i.test(message)) {
    return 'The browser is out of storage for this site. Delete a few demos and reload.';
  }
  return (
    'Could not open the local database. Private windows and blocked site data both cause this. ' +
    message
  );
}
