"""Look at a docs page: python3 scripts/docs-page.py /docs/start/concepts [width] -> /tmp/docs_page.png (full page, scaled down)."""
import sys
from playwright.sync_api import sync_playwright
from PIL import Image
w = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": w, "height": 900})
    pg.goto("http://localhost:3111" + sys.argv[1], wait_until="load", timeout=60000); pg.wait_for_timeout(1200)
    pg.screenshot(path="/tmp/docs_page_full.png", full_page=True); b.close()
im = Image.open("/tmp/docs_page_full.png"); print(im.size)
im.crop((0, 0, im.width, min(im.height, 3600))).resize((im.width // 2, min(im.height, 3600) // 2)).save("/tmp/docs_page.png")
