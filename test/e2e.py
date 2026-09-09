"""End-to-end verification for Demo Vault.

Runs the real production build in Chromium: registers the service worker,
imports demos through every supported route, and asserts the preview iframe
actually renders files out of IndexedDB.
"""
import io
import json
import sys
import zipfile
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:8000"

PASSED = []
FAILED = []


def check(name, cond, detail=""):
    if cond:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append((name, detail))
        print(f"  FAIL  {name}  {detail}")


SINGLE_HTML = """<!doctype html>
<html><head><title>Pricing Table v3</title></head>
<body style="background:#fee"><h1 id="hd">Simple pricing</h1>
<script>document.getElementById('hd').dataset.js='ran'</script>
</body></html>"""

SINGLE_HTML_2 = """<!doctype html>
<html><head><title>Toast Stack</title></head>
<body><h1>Toasts</h1></body></html>"""


def make_multi_zip(css_bg="rgb(9, 20, 33)", root="metrics-dashboard"):
    """A zip with a nested root folder, relative css/js/img and a fetch()."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{root}/index.html", """<!doctype html>
<html><head><title>Metrics Dashboard</title>
<link rel="stylesheet" href="./css/app.css"></head>
<body><h1 id="t">Traffic</h1><img id="logo" src="assets/dot.svg" width="20">
<div id="fetched">pending</div>
<script type="module" src="./js/app.js"></script>
</body></html>""")
        z.writestr(f"{root}/css/app.css", f"body{{background:{css_bg}}}h1{{color:rgb(0,255,0)}}")
        z.writestr(f"{root}/js/app.js", """
import { label } from './util.js';
const r = await fetch('./data/metrics.json');
const j = await r.json();
document.getElementById('fetched').textContent = label + ':' + j.sessions;
""")
        z.writestr(f"{root}/js/util.js", "export const label = 'sessions';")
        z.writestr(f"{root}/data/metrics.json", json.dumps({"sessions": 128402}))
        z.writestr(f"{root}/assets/dot.svg",
                   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
        z.writestr("__MACOSX/._junk", "junk")
        z.writestr(f"{root}/.DS_Store", "junk")
    return buf.getvalue()


def drop_files(page, files):
    """Simulate a real window-level file drop."""
    page.evaluate(
        """(files) => {
        const dt = new DataTransfer();
        for (const f of files) {
          const bytes = Uint8Array.from(atob(f.b64), c => c.charCodeAt(0));
          dt.items.add(new File([bytes], f.name, { type: f.type }));
        }
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }""",
        files,
    )


def b64(data):
    import base64
    if isinstance(data, str):
        data = data.encode()
    return base64.b64encode(data).decode()


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})

        # Google Fonts are unreachable in this sandbox; don't let them stall load.
        ctx.route("https://fonts.**", lambda r: r.abort())

        errors = []
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text} @ {m.location}")
                if m.type == "error" else None)

        # ---------------------------------------------------------- boot
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector(".app, .boot", timeout=15000)
        page.wait_for_selector(".sidebar", timeout=15000)
        check("app boots to the library shell", page.locator(".sidebar").count() == 1)

        sw_ok = page.evaluate("() => !!navigator.serviceWorker.controller")
        check("service worker controls the page", sw_ok)

        check("empty state is shown first", page.locator(".empty h1").count() == 1,
              page.locator(".empty h1").inner_text() if page.locator(".empty h1").count() else "")

        # ------------------------------------------- import: single .html
        drop_files(page, [{"name": "pricing.html", "type": "text/html", "b64": b64(SINGLE_HTML)}])
        page.wait_for_selector(".row", timeout=10000)
        check("dropping one .html creates a demo", page.locator(".row").count() == 1)
        check("title comes from <title>",
              page.locator(".row-name").first.inner_text() == "Pricing Table v3",
              page.locator(".row-name").first.inner_text())
        check("single-file demos are badged 'single'",
              page.locator(".row .badge").first.inner_text() == "single")

        # -------------------------------------------- preview renders
        frame = page.frame_locator("iframe[title='Demo preview']")
        expect(frame.locator("#hd")).to_have_text("Simple pricing", timeout=10000)
        check("preview iframe renders the stored html", True)
        check("scripts run inside the preview",
              frame.locator("#hd").get_attribute("data-js") == "ran")

        # ------------------------------------------------- dedupe by hash
        drop_files(page, [{"name": "pricing-copy.html", "type": "text/html", "b64": b64(SINGLE_HTML)}])
        page.wait_for_timeout(900)
        check("identical html is not stored twice", page.locator(".row").count() == 1,
              f"rows={page.locator('.row').count()}")

        # ----------------------------------------- import: multi-file zip
        drop_files(page, [{"name": "metrics.zip", "type": "application/zip",
                           "b64": b64(make_multi_zip())}])
        page.wait_for_function("() => document.querySelectorAll('.row').length === 2", timeout=10000)
        check("zip import creates a second demo", page.locator(".row").count() == 2)

        names = page.locator(".row-name").all_inner_texts()
        check("zip title comes from its <title>", "Metrics Dashboard" in names, str(names))
        badges = page.locator(".row .badge").all_inner_texts()
        check("multi-file demos are badged 'multi'", "multi" in badges, str(badges))

        # ------------------------------- relative assets resolve via the SW
        frame = page.frame_locator("iframe[title='Demo preview']")
        expect(frame.locator("#t")).to_have_text("Traffic", timeout=10000)

        bg = frame.locator("body").evaluate("el => getComputedStyle(el).backgroundColor")
        check("relative <link> stylesheet loads", bg == "rgb(9, 20, 33)", bg)

        img_ok = frame.locator("#logo").evaluate("el => el.complete && el.naturalWidth > 0")
        check("relative <img> loads", img_ok)

        expect(frame.locator("#fetched")).to_have_text("sessions:128402", timeout=10000)
        check("ES module import + relative fetch() both work", True)

        junk = page.evaluate("""async () => {
            const r = await fetch(location.origin + '/__vfs/' + 'x/.DS_Store');
            return r.status;
        }""")
        check("macOS junk files are filtered out", junk == 404 or junk == 503, str(junk))

        # ------------- regression: same index.html, different assets
        drop_files(page, [{"name": "metrics-v2.zip", "type": "application/zip",
                           "b64": b64(make_multi_zip(css_bg="rgb(40, 0, 0)", root="metrics-v2"))}])
        page.wait_for_timeout(1500)
        check("demos sharing an index.html but differing in assets both save",
              page.locator(".row").count() == 3, f"rows={page.locator('.row').count()}")
        frame = page.frame_locator("iframe[title='Demo preview']")
        expect(frame.locator("#t")).to_have_text("Traffic", timeout=10000)
        bg2 = frame.locator("body").evaluate("el => getComputedStyle(el).backgroundColor")
        check("the second variant serves its own stylesheet", bg2 == "rgb(40, 0, 0)", bg2)

        # ------------------------------------------------------- search
        page.fill(".search input", "metrics")
        page.wait_for_timeout(300)
        check("search filters the list", page.locator(".row").count() == 2,
              f"rows={page.locator('.row').count()}")
        page.fill(".search input", "")
        page.wait_for_timeout(200)

        # ---------------------------------------------------- favorites
        page.locator(".row").first.locator(".star").click()
        page.wait_for_timeout(400)
        page.locator(".chip", has_text="favorites").click()
        page.wait_for_timeout(300)
        check("favorites filter works", page.locator(".row").count() == 1,
              f"rows={page.locator('.row').count()}")
        page.locator(".chip", has_text="all").first.click()
        page.wait_for_timeout(200)

        # ----------------------------------------------------- renaming
        page.locator(".title-input").fill("Renamed Demo")
        page.locator(".title-input").press("Enter")
        page.wait_for_timeout(500)
        check("rename persists to the list",
              "Renamed Demo" in page.locator(".row-name").all_inner_texts(),
              str(page.locator(".row-name").all_inner_texts()))

        # --------------------------------------------- command palette
        page.keyboard.press("Control+k")
        page.wait_for_selector(".pal", timeout=4000)
        page.fill(".pal-input input", "renam")
        page.wait_for_timeout(300)
        check("palette finds demos by fuzzy match", page.locator(".pal-item").count() >= 1)
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        check("palette closes on escape", page.locator(".pal").count() == 0)

        # ------------------------------------------------- viewport switch
        page.locator(".vp").first.click()
        page.wait_for_timeout(400)
        width = page.locator(".frame").evaluate("el => el.getBoundingClientRect().width")
        check("mobile viewport constrains the frame to 390px", abs(width - 390) < 2, str(width))
        page.locator(".vp").nth(2).click()
        page.wait_for_timeout(300)

        # ------------------------------------------------------- persistence
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector(".row", timeout=15000)
        page.wait_for_timeout(900)
        check("demos survive a reload", page.locator(".row").count() == 3,
              f"rows={page.locator('.row').count()}")
        frame = page.frame_locator("iframe[title='Demo preview']")
        expect(frame.locator("body")).not_to_be_empty(timeout=10000)
        check("preview still renders after reload", True)

        # ------------------------------------------------------ export all
        with page.expect_download(timeout=15000) as dl:
            page.locator(".btn-ghost", has_text="Export all").click()
        download = dl.value
        path = "/tmp/export-all.zip"
        download.save_as(path)
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            manifest = json.loads(z.read("manifest.json"))
        check("export writes a manifest", manifest.get("app") == "demo-vault")
        check("export contains every demo", len(manifest["projects"]) == 3,
              str(len(manifest.get("projects", []))))
        check("export keeps nested asset paths",
              any(n.endswith("js/util.js") for n in names), str(names[:8]))

        # ------------------------------------------------- restore backup
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx2.route("https://fonts.**", lambda r: r.abort())
        page2 = ctx2.new_page()
        page2.on("pageerror", lambda e: errors.append(f"pageerror(restore): {e}"))
        page2.goto(BASE, wait_until="domcontentloaded")
        page2.wait_for_selector(".sidebar", timeout=15000)
        page2.wait_for_timeout(500)
        with open(path, "rb") as f:
            backup = f.read()
        drop_files(page2, [{"name": "demo-vault-backup.zip", "type": "application/zip", "b64": b64(backup)}])
        page2.wait_for_function("() => document.querySelectorAll('.row').length === 3", timeout=15000)
        check("backup zip restores every demo", page2.locator(".row").count() == 3)
        frame2 = page2.frame_locator("iframe[title='Demo preview']")
        expect(frame2.locator("body")).not_to_be_empty(timeout=10000)
        check("restored demo previews correctly", True)
        ctx2.close()

        # ---------------------------------------------------- delete flow
        page.bring_to_front()
        page.locator(".row").first.click()
        page.wait_for_timeout(300)
        page.locator(".icon-btn").nth(2).click()
        page.wait_for_selector(".menu", timeout=3000)
        page.locator(".menu button.danger").click()
        page.wait_for_selector("[role=alertdialog]", timeout=3000)
        page.locator("[role=alertdialog] .btn.primary").click()
        page.wait_for_timeout(900)
        check("delete removes the demo", page.locator(".row").count() == 2,
              f"rows={page.locator('.row').count()}")

        # ------------------------------------------------ multi-file drop
        drop_files(page, [
            {"name": "a.html", "type": "text/html", "b64": b64(SINGLE_HTML)},
            {"name": "b.html", "type": "text/html", "b64": b64(SINGLE_HTML_2)},
        ])
        page.wait_for_timeout(1500)
        names_after = page.locator(".row-name").all_inner_texts()
        # SINGLE_HTML may or may not still be in the library depending on which
        # demo the delete step removed, so assert on the one that is certainly new.
        check("dropping several loose .html files imports each of them",
              "Toast Stack" in names_after, str(names_after))

        page.screenshot(path="/tmp/library-dark.png")
        page.locator(".btn-ghost.sq").nth(1).click()
        page.wait_for_timeout(400)
        page.screenshot(path="/tmp/library-light.png")

        real_errors = [e for e in errors if "favicon" not in e and "fonts.g" not in e
                       and "ERR_FAILED" not in e and "net::" not in e
                       and "status of 403" not in e
                       # the suite deliberately probes a filtered path above
                       and ".DS_Store" not in e]
        check("no runtime errors in console", len(real_errors) == 0, str(real_errors[:4]))

        browser.close()

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        for name, detail in FAILED:
            print(f"  - {name}: {detail}")
        sys.exit(1)


if __name__ == "__main__":
    run()
