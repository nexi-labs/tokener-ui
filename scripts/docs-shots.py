"""
Takes the screenshots the documentation uses, from a running console in the sample workspace, signed in as the sample person James Doe.

  BASE=http://localhost:3111 python3 scripts/docs-shots.py                 every manifest
  python3 scripts/docs-shots.py governance                                 one manifest (scripts/docs-shots/governance.json)
  python3 scripts/docs-shots.py governance:budgets-list other:name         single shots

A manifest is a JSON list of shots:
  { "name": "budgets-list",            file name without extension, written to public/docs/shots/<name>.webp
    "path": "/budgets",                the console route
    "role": "org_admin",               optional: org_admin (default) or operator, which adds the Platform Administration group
    "viewport": [1440, 900],           optional
    "wait": 1200,                      optional pause after load, in ms
    "actions": [                       optional, run in order before the shot
       {"click": "text=New budget"}, {"fill": ["input[name=name]", "Support"]}, {"select": ["select", "tokens"]},
       {"press": "Escape"}, {"hover": "css=..."}, {"wait": 400}, {"scroll": 600}, {"scrollTo": "text=Gates"} ],
    "highlight": ["text=New budget"],  optional: selectors that get a green outline so the reader sees where to click
    "selector": "main",                optional: shoot only this element
    "clip": [0, 0, 288, 900],          optional: shoot only this rectangle of the viewport (x, y, width, height)
    "full": false }                    optional: the whole scrolling page
"""
import json, os, sys
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = os.environ.get("BASE", "http://localhost:3111").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, "..", "public", "docs", "shots")
TMP = "/tmp/_docs_shot.png"
USER = {"name": "James Doe", "email": "jdoe@example.com"}
os.makedirs(DST, exist_ok=True)

want = sys.argv[1:]
manifests = sorted(f[:-5] for f in os.listdir(os.path.join(HERE, "docs-shots")) if f.endswith(".json"))
jobs = []
for m in manifests:
    if want and not any(w == m or w.startswith(m + ":") for w in want): continue
    only = {w.split(":", 1)[1] for w in want if w.startswith(m + ":")}
    for shot in json.load(open(os.path.join(HERE, "docs-shots", m + ".json"))):
        if not only or shot["name"] in only: jobs.append((m, shot))

HIGHLIGHT = """(sel) => { document.querySelectorAll('[data-docs-hl]').forEach(e => e.removeAttribute('data-docs-hl')); }"""
STYLE = "[data-docs-hl]{outline:2px solid #02F5A1 !important;outline-offset:3px !important;border-radius:6px;box-shadow:0 0 0 6px rgba(2,245,161,.18) !important;}"

def run_action(pg, a):
    if "click" in a: pg.locator(a["click"]).first.click(timeout=6000)
    elif "fill" in a: pg.locator(a["fill"][0]).first.fill(a["fill"][1], timeout=6000)
    elif "select" in a: pg.locator(a["select"][0]).first.select_option(a["select"][1], timeout=6000)
    elif "press" in a: pg.keyboard.press(a["press"])
    elif "hover" in a: pg.locator(a["hover"]).first.hover(timeout=6000)
    elif "wait" in a: pg.wait_for_timeout(a["wait"])
    elif "scroll" in a: pg.evaluate("(y) => { const m = document.scrollingElement; window.scrollBy(0, y); }", a["scroll"])
    elif "scrollTo" in a: pg.locator(a["scrollTo"]).first.scroll_into_view_if_needed(timeout=6000)
    pg.wait_for_timeout(250)

failed = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for m, s in jobs:
        vw, vh = s.get("viewport", [1440, 900])
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=1.5)
        role = s.get("role", "org_admin")
        ctx.add_init_script(f"try{{sessionStorage.setItem('tok.demo','1');sessionStorage.setItem('tok.demo.user',{json.dumps(json.dumps(USER))});localStorage.setItem('tokener.role',{json.dumps(role)});localStorage.setItem('tokener.sidebar','open')}}catch(e){{}}")
        pg = ctx.new_page()
        try:
            pg.goto(BASE + s["path"], wait_until="load", timeout=60000)
            pg.wait_for_timeout(s.get("wait", 1400))
            pg.add_style_tag(content=STYLE)
            for a in s.get("actions", []): run_action(pg, a)
            for h in s.get("highlight", []):
                pg.locator(h).first.evaluate("e => e.setAttribute('data-docs-hl','1')")
            pg.wait_for_timeout(200)
            if s.get("clip"): c = s["clip"]; pg.screenshot(path=TMP, clip={"x": c[0], "y": c[1], "width": c[2], "height": c[3]})
            elif s.get("selector"): pg.locator(s["selector"]).first.screenshot(path=TMP)
            else: pg.screenshot(path=TMP, full_page=bool(s.get("full")))
            Image.open(TMP).convert("RGB").save(os.path.join(DST, s["name"] + ".webp"), quality=80, method=6)
            print("saved", m, s["name"])
        except Exception as e:
            failed.append((m, s["name"], str(e).splitlines()[0][:160])); print("FAILED", m, s["name"], str(e).splitlines()[0][:160])
        ctx.close()
    b.close()
print(f"{len(jobs) - len(failed)} saved, {len(failed)} failed")
sys.exit(1 if failed else 0)
