# Writing the documentation

The documentation site is at `/docs` (opened from the "Documentation" link under the account name in the console sidebar). It is data, not hand built pages.

## Where things live

| What | Where |
| --- | --- |
| Block types (the whole vocabulary) | `src/lib/docs/types.ts` |
| One file per section, each exporting a `DocSection` | `src/lib/docs/content/<section>.ts` |
| Section order, search, previous and next | `src/lib/docs/registry.ts` (do not edit while writing a section) |
| Renderers | `src/components/docs/` (`Blocks.tsx`, `Diagrams.tsx`, `Demos.tsx`, `Shot.tsx`) |
| Screenshot manifests | `scripts/docs-shots/<section>.json` |
| Screenshot runner | `scripts/docs-shots.py` |
| Screenshot files | `public/docs/shots/<name>.webp` |

A page is `{ slug, title, summary, console?, role?, blocks: Block[] }`. Section ids and page slugs make the address `/docs/<section>/<slug>`.

## Page slugs (fixed, so links between sections never break)

- start: overview, concepts, first-request, console-tour, roles-and-access
- governance: policy-studio, policy-builder, document-policies, budgets, quotas, cost-optimization
- agents: control-arena, constellation, networks, mesh, agents, approvals, traces, evals, forge, conductor, context, adapters, cli, protocols, code-mode
- models: providers, model-registry, model-versions, rag, data-services
- crucible: overview, projects, experiments-and-runs, datasets, storage, lineage, jobs, continuous-training, memory, adapters
- refinery: overview, connections, datasets, recipes, runs, runners, streams, sovereignty, activity
- mlops: overview, pipeline-studio, pipelines, functions, runs, deployments, gpu, build-agents, integrations, mcp-servers, ai-canvas, learn
- observability: dashboard, analytics, request-trace, usage, audit, mlops-observability
- organization: tenants, people, roles, billing, payments, notifications, account-settings
- developer: api-keys, service-accounts, sdks, api-reference, errors
- platform: system-settings, cluster, connector-catalogue, model-library, plans, access-requests, catalogue-requests, role-management, feature-flags, platform-health

A section may add pages of its own, and may leave out a page if the console has no such screen. Link to other sections only with the slugs above.

## How a page reads

Each page answers, in this order, using `h2` headings: what it is and when you use it; how it works (a diagram when a picture explains the mechanism better than a paragraph); how to use it (a `steps` block with a screenshot per step, or a `walkthrough` when the task crosses screens); a reference (`table` for fields, states, limits, roles); good to know (limits, what is sample data, what is not built yet). End with links to related pages in a `cards` block.

Rules of voice, which are the same as the product's:

- Plain, calm, second person ("you"). Short paragraphs. Say what a screen does and why, not that it is powerful.
- No em dashes. No emojis. No marketing words. No "phase" or "demo" wording; the sample workspace is "the sample workspace".
- Every claim must be true of the console as it is. Read the page source under `src/app/(console)/...`, the components and the matching file in `/home/claude/work/backend/tokener/docs` before writing. Use the real labels on buttons and fields, in the same capitalisation. Do not invent a feature, a field or a number.
- Be honest where the console runs on sample data or a feature is design only. Use a `callout` with tone `sample` for that, once per page at most, and say exactly what is and is not live.
- The person in screenshots is **James Doe** (the runner sets it). The organization is Nexi Corp. Never show or type a real email, a real key or a real secret. Sample keys start `crk_sample_`.
- Use `**bold**` for button and field names the reader must find, and `code` for values, routes and commands.

## Screenshots

Add each shot to `scripts/docs-shots/<section>.json` (see the top of `scripts/docs-shots.py` for the format) and run it with the lock, because the machine is small:

```
flock /tmp/docs-shots.lock python3 scripts/docs-shots.py <section>            # the whole manifest
flock /tmp/docs-shots.lock python3 scripts/docs-shots.py <section>:name       # one shot
```

The console must be running on http://localhost:3111 (it is; never stop or restart it). Then **open every image you made with the Read tool and check it**: it shows the screen the caption says, the data has loaded (no spinner or skeleton), nothing is cut off, a dialog or panel you meant to open is open. Use `highlight` to outline the control a step tells the reader to use. Prefer a viewport shot of 1440 by 900; use `selector` to crop to a card or panel when the whole screen is noise; use `full` only for a long page that reads well top to bottom. Give each shot a stable, descriptive `name` that starts with the section id, for example `governance-budget-new-limits`. A step's `alt` text says what the picture shows.

Aim for 3 to 8 screenshots on a feature page, more on a page that covers a long task.

## Diagrams and things to try

Blocks `flow`, `layers` and `tree` draw diagrams from data (see `types.ts`). Use them to explain mechanism: how a request moves, how a hierarchy inherits, how data becomes a model. Keep labels short; put detail in `sub` or in the caption. Demos you can embed with `{ t: "demo", id }`: `request-path`, `budget-breach`, `policy-tester`, `promotion-gates`, `run-filter`. Embed one only on the page it belongs to.

## Checks before you finish

```
npx tsc --noEmit -p .                       # from tokener-ui; must be clean
curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/docs/<section>/<slug>     # 200 for each page
```

Then open one of your pages in the browser runner and look at it (a screenshot of `/docs/<section>/<slug>` via a throwaway script, not in the manifest) to confirm the layout reads well.
