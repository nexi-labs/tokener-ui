"""
Regenerates the console screenshots used on the marketing site (public/screens/*.webp) from a running build.

  BASE=http://localhost:3111 DST=public/screens python3 scripts/site-shots.py [name ...]

The console shows its sample organisation in the top bar, so these images must be retaken whenever the sample data
changes. Needs playwright and Pillow. With no names, every screenshot is taken.
"""
import os, re, sys
from playwright.sync_api import sync_playwright
from PIL import Image

BASE = os.environ.get("BASE", "http://localhost:3000")
DST = os.environ.get("DST", "public/screens").rstrip("/") + "/"
ONLY = set(sys.argv[1:])
TMP = "/tmp/_site_shot.png"


def keep(name):
    return not ONLY or name in ONLY


def save(pg, name):
    pg.screenshot(path=TMP)
    Image.open(TMP).convert("RGB").save(f"{DST}{name}.webp", quality=86, method=6)
    print("saved", name)


def fit(pg, zoom=0):
    pg.get_by_role("button", name="Fit to view").click(); pg.wait_for_timeout(300)
    for _ in range(zoom): pg.get_by_role("button", name="Zoom in").click()
    pg.wait_for_timeout(400)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")

    # ---- gateway console, 1440 x 900 at 1.5x
    desk = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5).new_page()
    for name, path in {"dashboard": "/dashboard", "policies": "/policies", "budgets": "/budgets", "budget-new": "/budgets/new",
                       "document-policies": "/document-policies", "providers": "/providers", "analytics": "/analytics",
                       "audit": "/audit", "models": "/models", "api-keys": "/api-keys", "tenants": "/tenants"}.items():
        if not keep(name): continue
        desk.goto(BASE + path, wait_until="networkidle"); desk.wait_for_timeout(600); save(desk, name)
    mob = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    if keep("mobile-dashboard") or keep("mobile-menu"):
        mob.goto(BASE + "/dashboard", wait_until="networkidle"); mob.wait_for_timeout(500)
        if keep("mobile-dashboard"): save(mob, "mobile-dashboard")
        if keep("mobile-menu"):
            mob.click('button[aria-label="Open menu"]'); mob.wait_for_timeout(400); save(mob, "mobile-menu")

    # ---- MLOps and studio, 1600 x 1000 at 1.5x
    pg = b.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.5).new_page()

    def card(path, name, pre=None, wait=1400):
        if not keep(name): return
        pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(wait)
        if pre: pre()
        save(pg, name)

    card("/mlops", "mlops-overview")

    def builder():
        fit(pg, 6)
        pg.locator('[role="button"][aria-label*="Register"]').first.click(); pg.wait_for_timeout(400)
    card("/mlops/pipelines/pl-release/edit", "mlops-builder", builder, 2000)
    card("/mlops/models", "mlops-models")
    card("/mlops/deployments/dep-prod", "mlops-deployment")
    card("/mlops/build-agents", "mlops-agents")
    card("/mlops/observability", "mlops-observability")
    card("/mlops/settings", "mlops-settings")
    card("/mlops/pipelines/pl-payments/edit", "mlops-payments", lambda: fit(pg, 4), 2000)
    card("/mlops/pipelines/pl-mcp-agent/edit", "mlops-mcp-agent", lambda: fit(pg, 4), 2000)

    if keep("mlops-agent-builder"):
        pg.goto(BASE + "/mlops/pipelines/new", wait_until="load"); pg.wait_for_timeout(1000)
        pg.get_by_placeholder("support-classifier-release-2").fill("morning-briefing")
        pg.get_by_role("radio", name=re.compile("Scheduled briefing")).click()
        pg.get_by_role("button", name=re.compile("Create")).first.click(); pg.wait_for_timeout(1500)
        pg.goto(re.sub(r"/(wizard|edit)$", "/edit", pg.url), wait_until="load"); pg.wait_for_timeout(2000); fit(pg); save(pg, "mlops-agent-builder")

    for term, name in (("mcp", "mlops-mcp"), ("pay", "mlops-integrations")):
        if not keep(name): continue
        pg.goto(BASE + "/mlops/integrations", wait_until="load"); pg.wait_for_timeout(1500)
        pg.get_by_placeholder(re.compile("Search", re.I)).first.fill(term); pg.wait_for_timeout(600); save(pg, name)

    if keep("mlops-mcp-connection"):
        pg.goto(BASE + "/mlops/integrations", wait_until="load"); pg.wait_for_timeout(1500)
        pg.get_by_role("button", name=re.compile("Add connection")).first.click(); pg.wait_for_timeout(600)
        pg.locator("select").last.select_option(value="mcp-http"); pg.wait_for_timeout(300)
        pg.get_by_role("button", name="Continue").click(); pg.wait_for_timeout(300)
        pg.get_by_label("Name").first.fill("Docs MCP server")
        pg.get_by_role("button", name="Continue").click(); pg.wait_for_timeout(300)
        pg.get_by_text("OIDC / OAuth").first.click()
        pg.get_by_role("button", name="Continue").click(); pg.wait_for_timeout(500)
        save(pg, "mlops-mcp-connection")
    if keep("mlops-connection-wizard"):
        pg.goto(BASE + "/mlops/integrations", wait_until="load"); pg.wait_for_timeout(1500)
        pg.get_by_role("button", name=re.compile("Add connection")).first.click(); pg.wait_for_timeout(600)
        pg.locator("select").last.select_option(value="mtn-momo"); pg.wait_for_timeout(500)
        save(pg, "mlops-connection-wizard")

    # ---- knowledge and library
    if keep("mlops-knowledge"):
        pg.goto(BASE + "/mlops/knowledge/support-articles", wait_until="load"); pg.wait_for_timeout(1300)
        pg.get_by_role("tab", name=re.compile("^Flow")).click(); pg.wait_for_timeout(900)
        pg.get_by_text("Split and embed").first.click(); pg.wait_for_timeout(400); save(pg, "mlops-knowledge")
    if keep("mlops-library"):
        pg.goto(BASE + "/platform/library", wait_until="load"); pg.wait_for_timeout(1000)
        pg.get_by_role("button", name="Account menu").click(); pg.get_by_text("Platform operator").first.click(); pg.wait_for_timeout(900)
        save(pg, "mlops-library")

    # ---- studio
    card("/policy-studio", "studio-policy", lambda: (pg.locator('[data-node="allow_model_2"], [data-node]').nth(3).click(), pg.wait_for_timeout(300)))

    def sim():
        pg.get_by_role("button", name="Nodes").click(); pg.get_by_role("button", name="Code").click(); pg.wait_for_timeout(200)
        pg.get_by_role("button", name="Fit to screen").click(); pg.wait_for_timeout(300)
        for _ in range(3): pg.get_by_role("button", name="Zoom in").click()
        pg.get_by_role("button", name="Simulate").click(); pg.get_by_text("Provider failure").click(); pg.wait_for_timeout(9800)
    card("/pipeline-studio", "studio-pipeline", sim)

    def tr():
        pg.get_by_role("button", name="Fit to screen").click(); pg.get_by_role("button", name="Waterfall").click(); pg.wait_for_timeout(300)
    card("/trace-studio?req=failover", "studio-trace", tr)
    b.close()
