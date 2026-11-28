"""Screenshots of the Agent OS pages used on the site, taken from the sample workspace as the demo user (James Doe).
Run with the dev server up:  BASE=http://localhost:3111 python3 scripts/agentos-shots.py [name ...]
Output goes to public/screens (viewport 1600x1000 at 1.5x, saved as webp)."""
import os, sys
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = os.environ.get("BASE", "http://localhost:3111")
DST = os.environ.get("DST", "public/screens") + "/"
ONLY = set(sys.argv[1:])
TMP = "/tmp/agentos-shot.png"
INIT = "sessionStorage.setItem('tok.demo','1');sessionStorage.setItem('tok.demo.user',JSON.stringify({name:'James Doe',email:'jdoe@example.com',role:'admin'}));"
SCROLL = """(a)=>{const [t,off]=a; const el=[...document.querySelectorAll('*')].find(e=>e.children.length==0&&e.textContent.trim()==t); if(!el) return false; el.scrollIntoView({block:'start'}); let p=el; while(p){ if(p.scrollTop>0){p.scrollTop-=off;} p=p.parentElement;} window.scrollBy(0,-off); return true;}"""

def keep(n): return not ONLY or n in ONLY

with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.5)
    c.add_init_script(INIT); c.set_default_navigation_timeout(180000); c.set_default_timeout(30000)
    pg = c.new_page()

    def save(name):
        pg.screenshot(path=TMP); Image.open(TMP).convert("RGB").save(f"{DST}{name}.webp", quality=84, method=6); print("saved", name, flush=True)

    def page(path, name, wait=2500, pre=None):
        if not keep(name): return
        pg.goto(BASE + path, wait_until="networkidle"); pg.wait_for_timeout(wait)
        if pre: pre()
        save(name)

    page("/agents/constellation", "agentos-constellation", 4500)
    def nets(): pg.evaluate(SCROLL, ["Network canvas", 150]); pg.wait_for_timeout(1200)
    page("/agents/networks", "agentos-networks", 2500, nets)
    def mesh():
        if pg.locator("button[aria-label='Pause']").count(): pg.locator("button[aria-label='Pause']").first.click()
        for _ in range(3): pg.get_by_role("button", name="Next step").click(); pg.wait_for_timeout(500)
        pg.wait_for_timeout(1500)
    page("/agents/mesh/msh_clm", "agentos-mesh", 2500, mesh)
    page("/agents/approvals", "agentos-approvals")
    page("/agents/conductor", "agentos-conductor")
    page("/agents/evals", "agentos-evals")
    page("/agents/context", "agentos-context")
    page("/agents/adapters", "agentos-adapters")
    page("/agents/protocols", "agentos-protocols")
    page("/agents/cli", "agentos-cli")
    page("/agents/registry/agt_01", "agentos-memory", 2000, lambda: (pg.get_by_role("tab", name="Memory").click() if pg.get_by_role("tab", name="Memory").count() else pg.get_by_text("Memory", exact=True).first.click(), pg.wait_for_timeout(1200)))
    page("/agents/registry/agt_15", "agentos-runtime", 2000, lambda: (pg.get_by_role("tab", name="Runtime").click() if pg.get_by_role("tab", name="Runtime").count() else pg.get_by_text("Runtime", exact=True).first.click(), pg.wait_for_timeout(1200)))
    if keep("agentos-requests"):  # the platform team's page: view as a platform operator
        pg.goto(BASE + "/platform/approvals", wait_until="networkidle"); pg.wait_for_timeout(2000)
        if pg.get_by_role("button", name="View as platform operator").count():
            pg.get_by_role("button", name="View as platform operator").click(); pg.wait_for_timeout(2500)
        save("agentos-requests")
    def canvas(): pg.evaluate(SCROLL, ["Canvas", 250]); pg.wait_for_timeout(1200)
    page("/mlops/canvas", "mlops-ai-canvas", 3000, canvas)
    # ---- pages the site shows from other areas (Refinery, Functions, roles, cost optimization)
    def first_link(listing, prefix, name, tab=None, wait=2500, pre=None):
        if not keep(name): return
        pg.goto(BASE + listing, wait_until="networkidle"); pg.wait_for_timeout(1500)
        hrefs = pg.evaluate("(pre)=>[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h.startsWith(pre)&&h.length>pre.length&&!h.includes('/new')&&!h.includes('/build')&&!/\\/(governance|executions|registry)$/.test(h)&&!(pre==='/mlops/functions/'&&/\\/workflows/.test(h)))", prefix)
        target = hrefs[0] if hrefs else None
        if not target: print("no link for", name); return
        pg.goto(BASE + target + (f"?tab={tab}" if tab else ""), wait_until="networkidle"); pg.wait_for_timeout(wait)
        if pre:
            try: pre()
            except Exception as e: print("step skipped for", name, str(e).splitlines()[0][:90])
        save(name)
    page("/refinery/streams", "refinery-streams")
    first_link("/refinery/datasets", "/refinery/datasets/", "refinery-dataset")
    first_link("/refinery/recipes", "/refinery/recipes/", "refinery-builder", wait=3500)
    first_link("/refinery/runs", "/refinery/runs/", "refinery-run")
    page("/mlops/functions", "fn-overview")
    first_link("/mlops/functions/workflows", "/mlops/functions/workflows/", "fn-wf-editor", wait=3500)
    first_link("/mlops/functions", "/mlops/functions/", "fn-cost", tab="cost")
    first_link("/mlops/functions", "/mlops/functions/", "fn-governance", tab="governance")
    page("/org-roles", "org-roles")
    page("/optimization", "cost-optimization")
    b.close()
