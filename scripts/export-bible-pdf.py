#!/usr/bin/env python3
"""Export the generated offline reader to PDF with Chromium.

Install Python playwright and Chromium separately; no game runtime dependencies.
Run after build-bible.py. Set BIBLE_CHROMIUM_PATH if Chromium is elsewhere.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
reader = root / "dist" / "design" / "index.html"
destination = reader.parent / "GAME-BIBLE-1.0.pdf"
if not reader.exists():
    raise SystemExit("Run scripts/build-bible.py first")
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(reader.parent)))
Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get("BIBLE_CHROMIUM_PATH", "/usr/bin/chromium"),
        args=["--no-sandbox", "--disable-dev-shm-usage"], headless=True)
    page = browser.new_page()
    page.goto(f"http://127.0.0.1:{server.server_port}/index.html", wait_until="load")
    page.evaluate("document.fonts.ready")
    page.pdf(path=str(destination), print_background=True, prefer_css_page_size=True,
             display_header_footer=True,
             header_template='<span></span>',
             footer_template='<div style="font:9px sans-serif;width:100%;text-align:center;color:#777">'
                             'VORAGH | Design 1.0 &nbsp; · &nbsp; '
                             '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
             outline=True, tagged=True)
    browser.close()
server.shutdown()
server.server_close()
print(f"{destination}: {destination.stat().st_size} bytes")
