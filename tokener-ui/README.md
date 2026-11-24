# tokener-ui, Control Plane

Next.js 15 (App Router) + TypeScript + Tailwind. The Enterprise Portal from
`03-control-plane-ui.md`, styled after Confluent Cloud's console conventions (dark left nav
rail with active-item accent bar, light top bar with org switcher, card-based content, pill
status badges) using tok∑ner's own brand: the `#07191E` / `#02F5A1` palette pulled directly
from the logo.

**Real build + runtime verified in this environment**: `npm install` → `npm run build` →
`npm run start`, all routes checked over HTTP with actual rendered content, plus Playwright
screenshots of the login carousel and dashboard to confirm the visual result. Not just
"should work", actually run.

## Setup

```bash
cd tokener-ui
npm install
npm run dev
```

No login is wired up yet, either use any of the sign-in buttons (they don't call a real
backend), or click **"Skip sign-in, explore the demo console"** at the bottom of the login
card to go straight to `/dashboard`. Remove that link once real auth is connected.

## Studio: drag-and-drop builders

Three routes share one node canvas (`src/components/studio/`), modeled on a visual pipeline
builder: grouped searchable palette, HTML5 drag to add, connect by dragging from a node's
green output handle, pan (scroll) and zoom (Ctrl/Cmd + scroll or the buttons), undo/redo,
Delete key, auto-tidy, fullscreen, per-node inspector with an About tab, validation, and
saved graphs in `localStorage`.

| Route | Purpose |
|---|---|
| `/policy-studio` | Build a policy visually. Live output: Policy DSL (valid for the real grammar), compiled Rego, and the `POST /api/v1/policies` body. |
| `/pipeline-studio` | Design the request pipeline (auth, policy, budget, quota, router, providers, observers, notifiers). Simulate success, policy deny, over budget, rate limit and provider failover. Exports a pipeline spec and Mermaid. |
| `/trace-studio` | One request rendered as the same graph with per-stage timings, status and attributes, plus a waterfall. Deep-linkable: `/trace-studio?req=failover`. Linked from the Usage Explorer. |

Brand icons come from the `simple-icons` package; where a brand is missing from it
(Mistral, DeepSeek, Azure, Teams) the node loads `https://cdn.simpleicons.org/<slug>/<hex>`
and falls back to a neutral glyph if the CDN is unreachable.

Nodes marked **planned** (region pinning, PII masking, semantic cache) are not enforced by
the backend yet. In the Policy DSL they are emitted as `#` comments, which the parser
ignores. The pipeline spec is a design artifact: the backend does not persist or load it
yet. The trace view runs on bundled sample traces until a trace API exists.

## Brand assets

`public/brand/`, hand-vectorized SVGs (transparent background, unlike the original PNGs):
- `logomark.svg`, the Σ mark alone (used collapsed-sidebar / favicon-sized)
- `logo-light.svg`, full "tok∑ner" wordmark, dark ink lettering, for light backgrounds
- `logo-dark.svg`, full wordmark, white lettering, for dark backgrounds (sidebar, login panel)
- `architecture-overview.png`, the platform diagram, also embedded in the root project README

## Typography

Two genuinely distinct font families, not two weights of the same one: `font-sans` (system
sans stack) for all UI chrome, tables, and stats; `font-display` (system serif stack) for
carousel/marketing headlines only. Both are OS-native stacks, no `next/font/google` network
fetch, which is a real, load-bearing decision: this platform targets air-gapped/on-prem
deployment (`16-deployment.md`), and a build-time font fetch fails exactly the way it failed
in this environment when first tried.

## Login page

Four-slide auto-rotating carousel (governance, policy, cost, multi-provider, one slide per
platform pillar), each with an **original abstract vector background** (dot-grid, radar
rings, bar chart, node graph, hand-drawn SVG, brand-colored) rather than stock photography,
which keeps licensing unambiguous and reads as more premium than generic tech photos on a
sign-in screen. Auto-advances every 6.5s, respects `prefers-reduced-motion`, manual dot
navigation.

## Structure

```
src/app/(auth)/login/       , sign-in (SSO buttons + email/password + carousel), unauthenticated entry point
src/app/(console)/          , every authenticated screen, one folder per nav item
src/components/shell/       , Sidebar, TopBar
src/components/ui/          , Card, Badge, Button, Table, PageHeader, EmptyState
src/components/icons/       , SimpleIcon: renders real brand icons from the `simple-icons` package
src/components/marketing/   , LoginCarousel
src/components/dashboard/   , chart components (Recharts)
src/lib/nav.ts              , single source of truth for the sidebar nav (all 20 items)
public/brand/               , logo SVGs + architecture-overview.png
```

## Pages

Every item in `03-control-plane-ui.md`'s nav list has a real, routed page, not an empty
placeholder. Built to full visual fidelity: **Dashboard** (all 8 cards from the spec),
**Provider Registry**, **Policy Builder** (DSL editor + simulation panel), **Budget
Management**. The rest (Tenant Management, Model Registry, Quota Management, Analytics/Usage/
Audit Explorers, Notification Center, Billing, and the eight System-group screens) are real
functional pages with live data tables/cards following the same design system, intentionally
less elaborate than the four flagship pages above, not stubs.

## Icons

- **Brand/provider logos** (OpenAI, Anthropic, Gemini, AWS, Slack, Discord, Stripe,
  Kubernetes, Kafka, Flink, Postgres, Redis, language logos for the SDK page, SSO provider
  logos on the login page): real icons from the `simple-icons` npm package (simpleicons.org),
  rendered via `components/icons/SimpleIcon.tsx`, **every export name verified against the
  actual installed package** (three brands, Microsoft, Azure, and Mistral, have no entry
  in simple-icons at all; those spots use a real Lucide line icon instead of a fabricated
  logo, and the login page's Microsoft SSO button was swapped for Auth0, which is also a
  real documented IdP option in `15-security.md`).
- **UI/navigation icons** (dashboard, settings, search, etc., not brand marks): `lucide-react`.

## No colored emoji, no generic template look

Status is always conveyed via the `Badge` component (tone-based dot + label, healthy/degraded/
down/info/neutral) or Lucide line icons, never emoji. Every icon that represents a real brand
is that brand's actual logo, never a generic stand-in, and where simple-icons genuinely has
no entry for a named brand, that's called out in code rather than papered over.

## MLOps and AI infrastructure (demo mode)

The `AI Infrastructure` group in the console adds MLOps (`/mlops`) and Build Agents. Everything
runs in the browser against seeded sample data for a fictional organisation, NexI Corp. Demo mode
never contacts real infrastructure and never reports a real success. Real connectors are
planned and the integration catalogue states each status honestly.

- Console pages: `src/app/(console)/mlops/`. Domain model: `src/lib/mlops/`.
- Public pages: `/product/mlops`, `/product/mlops/integrations`, `/developers/tutorials`.
- Demo state is stored in local storage under `tokener.mlops.v1`. Use "Reset demo" to restore it.
- Documentation: `docs/20` to `docs/26` in the backend repository.
