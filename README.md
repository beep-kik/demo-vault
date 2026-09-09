# Demo Vault

A personal library for the HTML demos and previews that pile up in your Downloads
folder. Paste or drop them in once; find and open any of them again in two
keystrokes.

Everything is stored in your browser. There is no backend, no account, and no
network call after the page loads.

---

## Deploy

```bash
npm install
npm run build      # -> dist/
```

**Vercel**

```bash
npx vercel --prod
```

`vercel.json` already sets the framework, output directory, the `/sw.js` cache
headers, and a fallback page for `/__vfs/*`. No dashboard configuration needed.

> Vercel's Hobby plan is licensed for non-commercial use. If this is a work tool,
> you need a Pro seat — or skip hosting entirely and run `npm run build` plus any
> static server locally, since the app has no server side.

**Local**

```bash
npm run dev        # http://localhost:5173
```

Service workers need a secure context, so use `localhost` or HTTPS. Opening
`dist/index.html` over `file://` will not work.

---

## How it works

### Storage

`src/lib/store.js` is the only file that talks to the database. Two IndexedDB
stores via Dexie:

```
projects  id, title, kind, entryPath, tags[], hash, size, fileCount,
          createdAt, updatedAt, favorite
files     [projectId+path], data (ArrayBuffer), mime
```

Every other module goes through the functions that file exports. Moving to a
hosted backend later — Vercel Blob, S3, Supabase — means reimplementing
`store.js` and nothing above it.

### The preview

`public/sw.js` is a service worker that acts as a virtual filesystem. It
intercepts `/__vfs/<projectId>/<path>` and answers from IndexedDB, so a stored
demo behaves like a real folder on disk: relative `<link>` and `<img>`, `fetch()`,
and ES module `import` all resolve normally. Verified working for all four.

This is why the app does not inline assets into a single file. Inlining breaks on
`fetch('./data.json')`, dynamic `import()`, and images that JavaScript creates at
runtime — and it breaks silently, which is worse.

The worker is deliberately dependency-free and uses raw IndexedDB, because Vite
does not bundle it and it cannot import Dexie. It only ever reads. If you change
store names or key paths in `store.js`, change them there too.

### Deduplication

Demos are keyed by a SHA-256 content hash, so re-importing something already in
the library selects the existing entry instead of adding a copy.

- A **single file** hashes on content alone. `page.html` and `page (1).html` with
  the same bytes are one demo — which is exactly the duplicate a cluttered
  Downloads folder produces.
- A **bundle** hashes on structure too, so two folders that share an `index.html`
  but differ in their CSS are correctly kept apart.

Duplicating a demo on purpose (`Cmd/Ctrl+D`) always creates a real second copy.

---

## Importing

| Route | What happens |
| --- | --- |
| Paste markup | Saved as a single-file demo |
| Drop one `.html` | One demo |
| Drop many `.html` | One demo each |
| Drop a folder | One demo, structure preserved |
| Drop a `.zip` | One demo; a shared root folder is stripped |
| Chrome "Save page as, complete" | `page.html` + `page_files/` stitched back together |
| Drop a Demo Vault backup | Restores every demo inside it |

`__MACOSX`, `.DS_Store`, `Thumbs.db` and `.git` are filtered out. Titles come from
`<title>`, then `<h1>`, then the filename.

`Cmd/Ctrl+V` anywhere in the app opens the import dialog pre-filled, if what you
copied looks like markup.

---

## Keyboard

| | |
| --- | --- |
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+O` | Add a demo |
| `Cmd/Ctrl+F` | Focus search |
| `↑ ↓` or `j k` | Move through the list |
| `Alt+R` | Reload the preview |
| `Cmd/Ctrl+Enter` | Open the demo in a new tab |
| `F2` | Rename |
| `T` | Edit tags |
| `Cmd/Ctrl+D` | Duplicate |
| `Cmd/Ctrl+E` | Export this demo |
| `Cmd/Ctrl+Shift+E` | Export everything |
| `Backspace` | Delete |

`Alt+R` rather than `Cmd+R` so the browser's own reload still works.

---

## Backups matter here

Browser storage is the single point of failure in this design. The app calls
`navigator.storage.persist()` on boot, which asks the browser not to evict the
data when disk runs low — but that is a request, not a guarantee, and clearing
site data still wipes everything.

**Export all** writes a zip containing every demo plus a `manifest.json`.
Dropping that zip back onto Demo Vault restores the whole library, including
tags and favorites. Do it occasionally.

---

## Known limits

**Data lives in one browser.** Hosting on Vercel means you don't have to run a
dev server, but opening the app from another machine shows an empty library. If
you need it in more than one place, that is the point to move `store.js` to a
hosted backend.

**The preview iframe uses `allow-same-origin`.** A service worker cannot control
an iframe with an opaque origin, so multi-file demos cannot work without it.
Combined with `allow-scripts` this means a demo can reach the app's own
IndexedDB. That is an acceptable trade for demos you wrote yourself with no real
customer data in them — which is the stated use case. If that stops being true,
serve `/__vfs/*` from a separate subdomain; origin isolation is the only real
fix, and no `sandbox` attribute substitutes for it.

`allow-top-navigation` is withheld, so a demo cannot navigate the app away.

**Other limits.** No HTTP range requests, so `<video>` seeking inside a demo may
not work. Zip reading is synchronous, so a very large archive briefly blocks the
tab. Import is capped at 200 MB per demo. The service worker does not cache the
app shell, so the app itself needs the network on first load.

---

## Tests

`test/e2e.py` drives the production build in real Chromium: service worker
registration, every import route, relative assets and ES modules inside the
preview, dedupe, search, rename, export, backup restore, and delete. 34 checks.

```bash
pip install playwright && playwright install chromium
npm run build
cd dist && python3 -m http.server 8000 &
python3 test/e2e.py
```

---

## Design

The dark palette, spacing and type are taken from the Claude Design mockup.
Public Sans for the interface, Space Mono for paths, sizes and shortcuts. The
chrome stays deliberately neutral so it never competes with whatever is in the
preview pane.

Screens that were not in the mockup — empty state, import dialog, command
palette, drag overlay, toasts — were built from the same tokens. The light theme
is derived, not designed; delete the `[data-theme='light']` block in
`src/styles.css` and the toggle in `Sidebar.jsx` if you don't want it.

Two intentional deviations: the toolbar shows the real entry path and file count
instead of the mockup's decorative `~/demos/...` string, and reload is `Alt+R`.
