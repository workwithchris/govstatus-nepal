# GovStatus Nepal

Real-time uptime monitor, health checker, and reliability tracker for Nepal's
government portals and digital public services.

Live probe results are embedded server-side, refreshed every 5 minutes, and
backed by a persisted status history in Cloudflare D1.

![Tech](https://img.shields.io/badge/Next.js%2016-App%20Router-black)
![Tech](https://img.shields.io/badge/TypeScript-strict-blue)
![Tech](https://img.shields.io/badge/Cloudflare-D1-F6821F)

## What it does

- **Parallel health probes** — 145 government services (passports, tax, land
  records, ministries, palikas…) checked concurrently every 5 minutes with an
  8s→45s `AbortController` timeout (configurable via `PROBE_TIMEOUT_MS`)
  and a browser-like user agent, **from a
  Nepal-vantage point** (Cloudflare datacenter IPs are WAF-blocked and
  TLS-strict-rejected by many .np portals, which made foreign-vantage
  "down" readings unreliable; a self-describing bot UA likewise gets
  reset/stalled by .np WAFs, so the probe presents as a normal browser)
- **Down confirmation** — a "down" reading is re-probed once after a short
  delay; only a second failure flips the service red, cutting single-fetch
  false alarms on flaky .np infrastructure
- **Deep checks** — services may declare an optional `checkUrl` (a key API or
  flow endpoint). When set, the probe hits it in addition to the homepage and
  reports the worse of the two, so "portal up but the login/API broken" isn't
  missed
- **Status derivation** — `operational` (200–399 under 3.5s), `degraded`
  (slow or 403/WAF), `down` (5xx, refused, timeout)
- **TLS-relaxed retry** — Node/undici rejects incomplete certificate chains
  that browsers tolerate; probes retry once with relaxed TLS so certificate
  quirks don't read as outages
- **24-hour uptime bars** — hourly history per service, aggregated per hour
  from every probe sample and persisted to Cloudflare D1 (**90-day retention**).
  An hour counts as `down` if any sample in that hour was down, so a
  one-minute blip isn't hidden by a good final check
- **Long-term uptime** — 30/90-day per-service uptime % and daily bars via
  `/api/health/history?service=<id>&days=30` (rolled up from the hourly
  buckets); surfaced in the service detail dialog
- **TLS cert tracking** — cert expiry is captured via a lightweight TLS
  handshake (re-checked every 6h, Node only) and surfaced per service
- **Status-change alerts** — when a service transitions to/from down or
  degraded, a JSON webhook (`ALERT_WEBHOOK_URL`) fires with the transition
  details
- **Public subscribe (disabled by default)** — per-service email status-change
  notifications. Plumbing is in place (D1 `subscribers` table, `/api/subscribe`,
  probe-side delivery) but gated behind `ENABLE_NOTIFICATIONS=true` plus
  `EMAIL_SENDING_ACCOUNT_ID` / `EMAIL_SENDING_API_TOKEN` / `NOTIFY_FROM`
  (domain onboarded to Cloudflare Email Sending). Until then the subscribe UI
  is hidden and the API refuses writes.
- **Incident log** — `/api/incidents` (JSON), `/feed.xml` (RSS 2.0), and an
  Incidents tab: contiguous non-operational runs per service over the last
  7 days, ongoing vs resolved
- **Provenance + freshness banner** — the dashboard always says how the data
  was gathered (Nepal vantage) and how stale it is; a stale snapshot or
  simulated fallback is flagged, never presented as live
- **Embed widget** — `/embed/<serviceId>` renders a server-side, no-JS status
  widget (copy the iframe snippet from the service dialog)
- **Nepali UI toggle** — English/नेपाली language switch for the main chrome
- **Live probe loader** — a full-page loader with real progress
  (checked/total, down/degraded counts, recent completions) streamed from a
  progress endpoint
- **Dashboard** — metric cards, instant search, category tabs with counts,
  sort by status/name/latency, card grid + sortable table view, dark/light
  mode
- **SEO & AI crawlability** — every monitored service has a dedicated
  server-rendered status page (`/status/<id>`, "Is … down?" metadata,
  `GovernmentService` JSON-LD, per-service OG image), a 171-URL sitemap, an
  `llms.txt` manifest for AI engines (ChatGPT/Perplexity/Gemini), keyword-rich
  homepage content, and incident RSS items linking to the affected service's
  status page
- **Caching** — ISR (`revalidate = 60`) plus `s-maxage=60,
  stale-while-revalidate=30`; the Worker is serve-only and never probes
- **Honest fallback** — when D1 is unconfigured/unreachable the API reports
  `source: "simulated"` and the dashboard shows a banner, so fabricated
  history is never mistaken for real uptime
- **Ops diagnostics** — `/api/diag` reports whether D1 is configured (with
  account/database ids), the served source, and snapshot freshness, so a
  stale database id is visible instead of silently producing wrong status

## Monitored services

Citizen (passports, licenses, land records, police clearance, exams),
finance (tax, NEPSE, NRB, EPF, SSF, customs), business (OCR, e-GP), core
(national portal, election commission, NPC, CIAA), ministries, and
metropolitan cities. The catalog lives in
[`src/data/seed-services.json`](src/data/seed-services.json) — add an entry
and the tabs, counts, and probes pick it up automatically. Add an optional
`"checkUrl"` to any entry to also probe a key API/flow endpoint.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn-style primitives |
| Server state | TanStack React Query (staleTime/refetchInterval 60s) |
| Client state | Zustand (search, category, sort, view) |
| Validation | Zod for every API payload and internal model |
| History | Cloudflare D1 (SQLite) via REST API |
| Fonts/icons | Geist Sans + Geist Mono, Lucide |

## Architecture

```
src/
├── app/
│   ├── api/health/route.ts           # ISR probe API (revalidate 60)
│   ├── api/health/progress/route.ts  # Live probe progress (uncached)
│   ├── layout.tsx / page.tsx         # Shell + dashboard (SSR-prefetched)
│   ├── loading.tsx                   # Full-page live probe loader
│   └── providers.tsx                 # React Query + theme providers
├── data/seed-services.json           # Service catalog
├── features/services-monitor/        # Feature module
│   ├── api/                          # useServicesHealth, useFilteredServices
│   ├── components/                   # Cards, grid, table, metrics, loader…
│   ├── server/health-probe.ts        # Probe engine + D1 history + cache
│   ├── store/useFilterStore.ts       # Zustand filters
│   └── types/                        # Zod schemas → inferred types
├── components/{ui,common}/           # Primitives, navbar/footer/toggle
└── lib/                              # Query client, cn, D1 REST client
```

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

### Optional: Cloudflare D1 status history

Without D1 credentials the app degrades gracefully to simulated history.
To persist real status history:

```bash
# 1. Create the database (or use the existing govstatus-history)
npx wrangler login
npx wrangler d1 create govstatus-history

# 2. Apply the schema
npx wrangler d1 execute govstatus-history --remote --file d1/schema.sql

# 3. Create an API token with "D1: Edit" permission
#    https://dash.cloudflare.com/profile/api-tokens

# 4. Fill in .env.local
cp .env.example .env.local
```

```
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_D1_DATABASE_ID=...
CLOUDFLARE_API_TOKEN=...
```

Each probe cycle then reads the last 24h of real history, upserts the current
hour's aggregate bucket, refreshes per-service state, and prunes rows older
than **90 days** (was 7 — run the migration below once). The Nepal-vantage
probe runs every **5 minutes** (cron), probing all services and writing that
cycle's buckets each run — ~53k D1 writes/day, well inside the free-tier
100k/day limit. Probing is decoupled from website traffic: the cron machine
keeps writing history whether or not anyone visits; the serve-only Worker
only reads D1 on request and never probes.

> Existing database from a previous schema? Rebuild it once:
>
> ```bash
> npx wrangler d1 execute govstatus-history --remote --file d1/migrations/001_hourly-bucket-aggregation.sql
> npx wrangler d1 execute govstatus-history --remote --file d1/migrations/002_subscribers.sql
> ```

### Optional: status-change alerts

Set `ALERT_WEBHOOK_URL` to any endpoint that accepts a POST JSON body
(Telegram bot, ntfy, Slack, Make/Zapier…). The probe cycle posts on
transitions to/from `down`/`degraded`:

```json
{ "text": "[DOWN] Department of Passports — https://… (was operational, http 503)", "checkedAt": "…", "events": [ … ] }
```

## Scripts

```bash
npm run dev      # Dev server (Turbopack)
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint
```

## Deployment

Any Node host works (Vercel, Fly, VPS). The D1 REST client needs no native
bindings, so the same code also ports to Cloudflare Workers via
[OpenNext](https://opennext.js.org/) without changes to the probe engine.
The probe engine is runtime-agnostic: the relaxed-TLS retry is Node-only and
skips itself on Workers.

### Cloudflare Workers (OpenNext)

```bash
npm install -g opennextjs-cloudflare
opennextjs-cloudflare build
npx wrangler deploy --dry-run   # via open-next.output/
```

A root `wrangler.jsonc` is committed: it pins the Worker name to
`govstatus-nepal` (must match your Cloudflare Pages project name) and sets
`WORKER_SELF_REFERENCE.service` to the same value — OpenNext uses that
binding for ISR revalidation, and if the two diverge, deploy fails with
error 10143.

Workers notes:
- Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and
  `CLOUDFLARE_API_TOKEN` as Worker secrets/vars
  (`wrangler secret put …` / `wrangler.toml` vars). The Worker is serve-only;
  `CRON_SECRET` is only needed if you host the probe cycle on a Node platform
  (Vercel Cron, self-hosted — see `/api/probe`).
- ISR (`revalidate = 60`) needs a KV binding on Workers (OpenNext cache
  binding); without it the page regenerates per request but still serves the
  fast module cache / D1 snapshot.
- Probes on Workers do a single strict fetch (no relaxed-TLS retry).

### Nepal-vantage probing

A standalone Node script probes every service from a Nepal IP and writes
results straight to D1. The deployed Worker renders those results.

```bash
# 1. The script reads CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID /
#    CLOUDFLARE_API_TOKEN from .env.local (or the environment).
# 2. Test once (probes, no writes):
node probe/nepal-probe.mjs --dry-run

# 3. Run for real (probes + writes D1 + optional alerts):
node probe/nepal-probe.mjs

# 4. Schedule it every 5 minutes on the Nepal machine (crontab -e):
0,5,10,15,20,25,30,35,40,45,50,55 * * * * cd /path/to/govstatus && node probe/nepal-probe.mjs >> probe/probe.log 2>&1
```

Writes ~53k D1 rows/day at 5-min cadence (well inside the 100k free limit).
Set `ALERT_WEBHOOK_URL` in the environment to keep status-change alerts
working from the Nepal probe. Optional env:

- `VANTAGE_NAME` — a label for this probe machine, included in probe logs.
  Running the script from **multiple machines** (e.g. two ISPs) writes
  multiple samples per hour bucket; the D1 aggregation already handles this
  (worst-status + average latency), giving you multi-vantage coverage without
  code changes.
- `EMAIL_SENDING_ACCOUNT_ID` / `EMAIL_SENDING_API_TOKEN` / `NOTIFY_FROM` —
  enables emailing public subscribers on status transitions. `NOTIFY_FROM`
  must be a domain onboarded to Cloudflare Email Sending.

**Verify served data matches reality** (the #1 thing to check after any DB or
secret change): hit the live API and compare with a fresh `--dry-run`:

```bash
curl -s https://<your-domain>/api/diag          # source, staleness, summary
node probe/nepal-probe.mjs --dry-run            # ground truth from Nepal
```

If `/api/diag` shows dozens of `down` while the dry-run shows a handful, the
Worker's `CLOUDFLARE_D1_DATABASE_ID` doesn't match the DB the probe writes —
the serve-only worker then silently falls back and fabricates mass "down".
Check the Worker secrets and `/api/diag`'s `databaseId` field.

## Notes

- Independent tracker — not affiliated with any government body
- "Down" means *unreachable from the probe's vantage point*; some .np
  portals filter foreign/datacenter traffic and may show as down while
  loading fine for citizens inside Nepal
- Uptime percentages only count hours with recorded data (grey slots =
  no data yet)
- **Adaptive probe cadence** — to avoid tripping government WAFs, a
  service that returns repeated 403/429/down is backed off (probed every
  2nd, then 4th, then 8th cycle) and recovers only after sustained healthy
  responses. Backed-off services keep their last persisted status (with an
  older timestamp — never fabricated). The cron script persists this state
  in `probe/cadence-state.json` (gitignored) so it survives process
  restarts; the app's `/api/probe` path keeps the same state in memory.

## License

MIT
