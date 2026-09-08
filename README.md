# GovStatus Nepal

Real-time uptime monitor, health checker, and reliability tracker for Nepal's
government portals and digital public services.

Live probe results are embedded server-side, refreshed every minute, and
backed by a persisted status history in Cloudflare D1.

![Tech](https://img.shields.io/badge/Next.js%2016-App%20Router-black)
![Tech](https://img.shields.io/badge/TypeScript-strict-blue)
![Tech](https://img.shields.io/badge/Cloudflare-D1-F6821F)

## What it does

- **Parallel health probes** — 38 government services (passports, tax, land
  records, ministries, palikas…) checked concurrently every 60s with an 8s
  `AbortController` timeout and a custom bot user agent
- **Status derivation** — `operational` (200–399 under 3.5s), `degraded`
  (slow or 403/WAF), `down` (5xx, refused, timeout)
- **TLS-relaxed retry** — Node/undici rejects incomplete certificate chains
  that browsers tolerate; probes retry once with relaxed TLS so certificate
  quirks don't read as outages
- **24-hour uptime bars** — hourly history per service, persisted to
  Cloudflare D1 (7-day retention), newest slot always from the live probe
- **Live probe loader** — a full-page loader with real progress
  (checked/total, down/degraded counts, recent completions) streamed from a
  progress endpoint
- **Dashboard** — metric cards, instant search, category tabs with counts,
  sort by status/name/latency, card grid + sortable table view, dark/light
  mode
- **Caching** — ISR (`revalidate = 60`) plus `s-maxage=60,
  stale-while-revalidate=30`; probes run at most once per minute regardless
  of traffic

## Monitored services

Citizen (passports, licenses, land records, police clearance, exams),
finance (tax, NEPSE, NRB, EPF, SSF, customs), business (OCR, e-GP), core
(national portal, election commission, NPC, CIAA), ministries, and
metropolitan cities. The catalog lives in
[`src/data/seed-services.json`](src/data/seed-services.json) — add an entry
and the tabs, counts, and probes pick it up automatically.

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

Each probe cycle then reads the last 24h of real history and appends its
results (one batch insert + a retention delete per run).

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

Workers notes:
- Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
  `CLOUDFLARE_API_TOKEN`, and `CRON_SECRET` as Worker secrets/vars
  (`wrangler secret put …` / `wrangler.toml` vars).
- ISR (`revalidate = 60`) needs a KV binding on Workers (OpenNext cache
  binding); without it the page regenerates per request but still serves the
  fast module cache / D1 snapshot.
- Probes on Workers do a single strict fetch (no relaxed-TLS retry).

### Scheduled probing (Cloudflare Cron)

Probing runs on a schedule, never on the request path — `/api/health` and the
page only serve the last published result from the module cache or D1. A tiny
Cloudflare Worker (`cron-worker/`) triggers `/api/probe` every minute:

```bash
# 1. Point the worker at your app and set the shared secret
npx wrangler secret put CRON_SECRET -c cron-worker/wrangler.jsonc

# 2. PROBE_URL is preconfigured to https://govstatusnepal.techyatraa.com/api/probe

# 3. Deploy the cron worker
npx wrangler deploy -c cron-worker/wrangler.jsonc
```

Local trigger for testing: `npx wrangler dev --test-scheduled -c cron-worker/wrangler.jsonc`.

## Notes

- Independent tracker — not affiliated with any government body
- "Down" means *unreachable from the probe's vantage point*; some .np
  portals filter foreign/datacenter traffic and may show as down while
  loading fine for citizens inside Nepal
- Uptime percentages only count hours with recorded data (grey slots =
  no data yet)

## License

MIT
