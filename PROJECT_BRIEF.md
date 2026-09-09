# IsGovOnline — Full Project Brief

Authoritative summary of the IsGovOnline codebase for AI assistants and new
contributors. Supersedes/expands `README.md` with implementation detail, wiring,
and production-env knowledge. Read this first, then `AGENTS.md` (agent rules +
non-obvious wiring), then `DESIGN.md` (visual language) for UI work.

---

## 1. What this is

**IsGovOnline** is a real-time uptime monitor, health checker, and
reliability tracker for Nepal's government portals and digital public services
(145 services as of this writing). It probes each service every 5 minutes,
classifies it `operational` / `degraded` / `down`, and persists hourly-bucket
history in Cloudflare D1 for **90 days** so users see long-term uptime trends,
not just a live snapshot.

Live URL: `https://isgovonline.techyatraa.com`

### Core principle — vantage point honesty

Status is measured **from a probe running on a Nepal IP**. Foreign/datacenter
IPs are WAF-blocked and strict-TLS-rejected by many `.np` portals, which made
foreign-vantage probing produce mass false "down". Therefore:

- The **Cloudflare Worker that serves the website is serve-only** — it never
  probes, never writes D1. It renders the last-known D1 snapshot.
- Probing is owned by **`probe/nepal-probe.mjs`**, a standalone Node script
  running via cron on a Nepal-IP machine. It probes and writes D1 directly.

Breaking either half of this split (probing from the Worker, or the Worker
reading a stale/mismatched D1 DB) silently corrupts served status.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js **16.3.4** (App Router, Turbopack), React 19.2.8 |
| Language | TypeScript **strict** (`tsconfig` → `strict: true`, `noEmit`) |
| Styling | Tailwind CSS **v4** (via `@tailwindcss/postcss`) + shadcn-style primitives |
| Server state | TanStack React Query **v5** (staleTime / refetchInterval 60s) |
| Client state | Zustand **v5** (search, category, sort, view, selected detail) |
| Validation | Zod **v4** — every API payload and internal model |
| History storage | Cloudflare **D1** (SQLite) via REST API (no native binding needed outside the Worker) |
| Deploy target | Cloudflare Workers via **OpenNext** (`opennextjs-cloudflare`) |
| Fonts / icons | Geist Sans + Geist Mono (`next/font/google`), Lucide |
| Charts | Recharts v3 |
| HTTP | `undici` (Node agent w/ custom dispatcher) + native `node:http/https` fallback |

Key deps: `@opennextjs/cloudflare`, `wrangler`, `undici`, `zod`, `zustand`,
`@tanstack/react-query`, `recharts`, `next-themes`, Radix primitives
(dialog/slot/tabs), `clsx` + `tailwind-merge`.

---

## 3. Architecture overview

```
govstatus/
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── layout.tsx               # Root shell: Geist fonts, metadata, OG, JSON-LD
│   │   ├── page.tsx                 # Dashboard (static shell, client-fetched data)
│   │   ├── loading.tsx              # Full-page ProbeLoader
│   │   ├── about/page.tsx           # Static "Why this exists" page
│   │   ├── providers.tsx            # React Query + Theme + Lang providers
│   │   ├── robots.ts / sitemap.ts   # SEO
│   │   ├── feed.xml/route.ts        # RSS 2.0 incident feed
│   │   ├── embed/[serviceId]/page.tsx  # Server-side no-JS embed widget
│   │   └── api/
│   │       ├── health/route.ts        # ISR snapshot (revalidate 60)
│   │       ├── health/history/route.ts  # Daily history (30/90d)
│   │       ├── health/progress/route.ts # Live probe progress (uncached)
│   │       ├── probe/route.ts          # Cron probe trigger (serve-only → 403)
│   │       ├── incidents/route.ts      # Incident feed
│   │       ├── diag/route.ts           # Ops diagnostics
│   │       └── subscribe/route.ts      # Email subs (disabled by default)
│   ├── data/seed-services.json      # 145-service catalog (single source of truth)
│   ├── features/services-monitor/
│   │   ├── api/                     # React Query hooks
│   │   ├── components/              # Cards, grid, table, metrics, loader, dialogs, analytics…
│   │   ├── server/                  # health-probe.ts, history.ts, incidents.ts, subscribers.ts
│   │   ├── store/                   # Zustand stores
│   │   └── types/                   # Zod schemas → inferred types
│   ├── components/{ui,common}/      # Primitives, navbar/footer/toggle
│   └── lib/                         # query-client, cn, i18n, d1 REST client
├── d1/
│   ├── schema.sql                   # Fresh-install schema
│   └── migrations/                  # 001 hourly-bucket, 002 subscribers
├── probe/
│   ├── nepal-probe.mjs              # Nepal-vantage probe (production probing)
│   ├── run-probe.sh                 # launchd wrapper (overlap lock)
│   └── tally.mjs                    # report tool
├── custom-worker.ts                 # Worker entry (imports generated .open-next/worker.js)
├── worker-polyfills.ts              # workerd MessagePort/Channel polyfill
├── wrangler.jsonc                   # Worker config (name/bindings/vars)
├── open-next.config.ts              # OpenNext config
├── next.config.ts                   # Empty (no custom config)
└── public/                          # static assets, _headers
```

---

## 4. Data model & types (`src/features/services-monitor/types/index.ts`)

All Zod-validated. The public contract:

- **`SeedService`** — catalog entry: `id`, `name`, `url`, `category`,
  `description`, optional `checkUrl`. Categories: `citizen`, `education`,
  `finance`, `business`, `ministry`, `province`, `palika`, `core`,
  `infrastructure`.
- **`HealthStatus`** — `operational` | `degraded` | `down`.
- **`ServiceHealth`** — `SeedService` + live `status`, `responseTime`,
  `httpStatus`, `checkedAt`, `uptimePercentage`, compact `history` (24 chars,
  one per hour: `o`/`d`/`x`/`n`), `latencies[24]`, `certExpiresAt`.
- **`HealthResponse`** — `{ checkedAt, summary, services[], source }` where
  `source` is `"live"` (real D1 history) or `"simulated"` (D1 unconfigured).
  `summary`: totals + `averageResponseTime` + `overallStatus`
  (`normal`/`degraded`/`outage`; outage = ≥5 down).
- **`ProbeProgress`** — `phase` (`idle`/`probing`/`persisting`/`done`), counts,
  recent completions, lastRun — drives the live loader.

### D1 schema (`d1/schema.sql`)

Three tables:

1. **`status_checks`** — one row per `(service_id, bucket_ms)` (hourly bucket),
   holding **aggregates** over all probe samples in that hour: `worst_status`,
   `sample_count`, `sum_response_ms`, `checked_at_ms`. The `worst_status`
   upsert logic means an hour counts `down` if **any** sample that hour was
   down — a 1-minute blip is never hidden by a good final check.
2. **`service_meta`** — current per-service state (`last_status`,
   `last_checked_at_ms`) + cached TLS cert expiry (`cert_expires_at_ms`,
   `cert_checked_at_ms`). Used for transition alerts and the fast serve-only
   snapshot.
3. **`subscribers`** — public per-service email subs (`email`, `service_id`).
   Feature is **disabled by default** (see §9).

---

## 5. The probe engine (`src/features/services-monitor/server/health-probe.ts`)

This is the heart. 1050 lines, fully commented. Key concepts:

### 5.1 Probing a single URL (`probeOnce`)

Three-tier resilient fallback, Node-only pieces skip themselves on Workers:

1. **Primary undici probe** — browser-like UA, HTTP/1.1 (`allowH2: false`,
   several .np WAFs reset on h2), explicit connect/headers/body timeouts (undici
   default connect timeout is 10s which silently aborts slow .np portals), and
   `SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION`.
2. **Relaxed-TLS undici retry** — `rejectUnauthorized: false` tolerates
   self-signed / missing-CA-chain gaps that browsers tolerate but Node/undici
   rejects. **Node-only** (Workers can't disable cert validation).
3. **Native `node:http`/`node:https` fallback** — immune to ALPN-rejecting
   legacy servers (Oracle WebLogic, old Apache) where undici's forced ALPN
   causes `ECONNRESET`.

Response body is immediately `cancel()`ed — we only need the status line; this
prevents socket leaks while probing 145 services.

**Status classification** (`probeOnce` returns):
- `operational`: HTTP 200–399 **and** < 3500ms (`SLOW_THRESHOLD_MS`).
- `degraded`: HTTP 403 (WAF block) or 429 (rate limit), or slow (>3.5s).
- `down`: 5xx, other 4xx, connection refused, timeout, or network error.

### 5.2 Per-service probe (`probeService`)

- Probes homepage.
- If `checkUrl` set, also probes it and keeps the **worse** result — catches
  "portal up but login/API broken".
- **Down confirmation**: if result is `down`, waits `CONFIRM_DELAY_MS` (2.5s)
  and re-probes once; only a second failure reports `down`. Cuts single-fetch
  false alarms on flaky .np infra.

### 5.3 Concurrency & runtime split

- Probes run through `mapLimit(seeds, 15, …)` — max 15 concurrent HTTP probes.
- TLS certs (`probeCertExpiryMs`, `node:tls` handshake) probed in parallel, but
  **rate-limited**: only services not seen in the last `CERT_CHECK_INTERVAL_MS`
  (6h) are re-probed each cycle; results cached in a module `Map`.
- `IS_NODE` guards the Node-only pieces (relaxed TLS, native fallback, cert
  probing). On Workers they no-op.

### 5.4 Persistence & write gating

`PERSIST_INTERVAL_MS` (default 5 min, min 1) is the real write gate. **Probes
still run every cycle** (live status served from module cache), but D1 is only
written when `checkedAtMs - lastPersistAt >= PERSIST_INTERVAL_MS`. This keeps
writes ~53k/day (inside D1 free tier 100k) instead of ~266k. History reads are
gated the same way — the loaded `historyCache` index is reused between persist
cycles, cutting D1 reads ~5x.

`persistChecks` builds one batch: upsert each service's hour bucket + upsert
`service_meta` + `DELETE` buckets older than `RETENTION_DAYS` (90). Batches go
through `d1BatchChunked` (chunks of 60 — the D1 REST statement cap).

Alerts fire **only on the persist cycle** so a failed persist retries and never
double-sends a transition.

### 5.5 Serve-only mode & snapshot serving (`getServicesHealth`)

`SERVE_ONLY = env.SERVE_ONLY === "true" || !IS_NODE` — auto-enabled on workerd,
forceable on Node.

In serve-only mode `getServicesHealth`:
1. Serves the module-cached snapshot if fresher than `SNAPSHOT_TTL_MS` (5 min).
2. Else reads the **last-known snapshot straight from D1** (`getLastKnownFromDb`
   — no network probes): `service_meta` for current status, `status_checks` for
   history. This is what the Worker serves; data freshness follows the probe
   cadence.
3. If the D1 read **fails**, it logs a loud error and keeps the previous cache
   (or falls back to `simulated`). It never self-probes — the "silent mass
   down" failure mode is explicitly guarded against with diagnostic logging.

On Node (non-serve-only), it serves cache then falls back to `probeNow()`.

### 5.6 History building & codec

`buildHistory` produces 24 hourly `UptimeSlot`s:
- Newest slot = live probe result.
- Older slots = real D1 bucket (or `null` = grey "no data" if the bucket
  doesn't exist).
- **No D1 history** → `simulateSlot` (deterministic hash of service+hour) so the
  newest slot matches live and older bars are stable. Only used when
  unconfigured/unreachable; `source` stays `"simulated"`.

`encodeHistory` compresses 24 slots to a 24-char string + `latencies` array —
keeps the API payload tiny at 145 services.

### 5.7 Alerting

`computeTransitions` diffs current status vs `service_meta` and `sendAlerts`
POSTs a JSON webhook to `ALERT_WEBHOOK_URL` (Telegram/Slack/ntfy/etc.) on
worsening or recovery.

---

## 6. The Nepal-vantage probe (`probe/nepal-probe.mjs`)

Standalone ESM Node script. **This is what actually probes and writes in
production.** It duplicates the probe engine logic in plain JS (no TS imports —
it reads `seed-services.json` directly). Reads the same `CLOUDFLARE_*` env vars
and loads `.env.local` if present.

- `--dry-run`: probes + reports counts, writes nothing (ground-truth check).
- Full run: probes all services, upserts hourly buckets + `service_meta` + prunes
  old rows (same SQL as the app), fires `ALERT_WEBHOOK_URL` on transitions, and
  emails public subscribers (`notifySubscribers`) via Cloudflare Email Sending
  REST — all gated on the relevant env vars.
- `VANTAGE_NAME` labels the machine; running from multiple machines/ISPs gives
  multi-vantage coverage (D1 aggregation handles worst-status + avg latency).

Scheduling: cron every 5 min
(`0,5,10,15,...,55 * * * * cd /path && node probe/nepal-probe.mjs >> probe/probe.log 2>&1`),
or on macOS via `probe/run-probe.sh` under launchd (uses an atomic `mkdir` lock
to prevent overlapping runs — a cycle can take minutes with 45s timeouts).

The legacy `cron-worker/` (a separate Worker that POSTed `/api/probe` every
minute) has been **removed** — the Worker is serve-only and `/api/probe`
returns 403 there; probing is owned solely by `probe/nepal-probe.mjs`.

---

## 7. API routes

| Route | Method | Purpose | Caching |
|---|---|---|---|
| `/api/health` | GET | Served health snapshot (never probes) | `revalidate=60` + `s-maxage=60, stale-while-revalidate=30` |
| `/api/health/history?service=&days=` | GET | Daily uptime (30/90d) rolled from hourly buckets | `s-maxage=300, stale-while-revalidate=300` |
| `/api/health/progress` | GET | Live probe progress (loader); serve-only returns `done` immediately | uncached |
| `/api/probe` | POST | Cron probe trigger. Serve-only → 403. Auth `Bearer CRON_SECRET` or `x-cron-secret` | — |
| `/api/incidents` | GET | 7-day incident feed (JSON) | `no-store` |
| `/api/diag` | GET | Ops diagnostics: D1 config, source, staleness, DB-id mismatch detection | `no-store` |
| `/api/subscribe` | POST/DELETE | Email subs. **503 unless `ENABLE_NOTIFICATIONS=true`** | — |
| `/feed.xml` | GET | RSS 2.0 incidents feed | `no-store` |
| `/embed/[serviceId]` | GET | No-JS embed widget (SSR) | `revalidate=60` |
| `/robots.txt`, `/sitemap.xml` | GET | SEO | static |

`/api/diag` is the **#1 ops check**: it reports whether D1 is configured, which
`accountId`/`databaseId` it's pointing at, `source`, staleness (minutes since the
newest actual `service_meta` write), and a summary. If served status shows mass
"down" while a `--dry-run` shows healthy, the Worker's
`CLOUDFLARE_D1_DATABASE_ID` doesn't match the DB the probe writes — `/api/diag`
makes that visible instead of silent.

---

## 8. Frontend / UI

Design language per `DESIGN.md`: Vercel/Geist aesthetic — black-on-near-white,
ink/mute/faint/hairline tokens, a single multi-stop gradient for the hero
"online" text, Geist Sans for display type, Geist Mono for technical eyebrows.
Pill buttons for marketing CTAs, 6px square for app chrome. Status colors:
emerald (operational), amber (degraded), rose (down).

### Dashboard (`app/page.tsx` + `HomeTabs`)

Fully **static shell** (rendered instantly from CDN edge); all live data is
fetched client-side by React Query. Three tabs:

1. **Dashboard** — `SimulatedDataNotice` (banner when `source=simulated`),
   `MetricsOverview` (3 stat cards: total monitored, system status, avg response),
   `SearchAndSortBar`, `CategoryFilters` (9 categories with counts), `StatusLegend`,
   `ServicesView` (grid OR sortable table, toggleable).
2. **Analytics** — Recharts: category uptime, latency trend, incident chart,
   slowest services.
3. **Incidents** — derived incident list with ongoing/resolved badges.

### Client state & data flow

- `useFilterStore` (Zustand): `searchQuery`, `selectedCategory`, `sortBy`,
  `view` (grid/table). `useFilteredServices` memoizes filtering/sorting.
- `useDetailStore`: which service is open in the detail dialog.
- `useServicesHealth`: `/api/health`, staleTime + refetchInterval **60s** (README
  says 60, code says 5min stale/refetch — the query client default is 60s stale,
  the health hook uses 5min; trust the code).
- `useServiceHistory` / `useIncidents`: same pattern.
- `Providers`: React Query + `next-themes` (dark/light/system) + `LangProvider`.
- **i18n** (`lib/i18n.tsx`): `en` / `ne` (नेपाली) switch for main chrome,
  persisted in `localStorage`.

### Service detail dialog

Opened from a card/row. Shows status, uptime %, 24h `UptimeBar` (hover tooltips),
30/90d daily history chart (via `useServiceHistory`), response time, HTTP
status, TLS cert days-left, and an **embed iframe snippet** to copy
(`/embed/<id>`).

### `ProbeLoader` / `app/loading.tsx`

Full-page loader polling `/api/health/progress` every 500ms with real counts
(checked/total, down/degraded, recent completions). In serve-only mode the
progress endpoint reports `done` immediately so it never hammers.

### SEO

`layout.tsx`: metadata, OpenGraph, Twitter card, JSON-LD (`WebSite` +
`Organization`). `robots.ts`, `sitemap.ts`, canonical to
`https://isgovonline.techyatraa.com`. `public/_headers` caches
`/_next/static/*` immutable.

---

## 9. Feature flags & config (`env`)

| Env var | Purpose | Default |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | D1 account (REST) | required for D1 |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 DB id | required for D1 |
| `CLOUDFLARE_API_TOKEN` | D1 REST token ("D1: Edit") | required for D1 |
| `CRON_SECRET` | Auth for `/api/probe` (legacy cron) | required for /api/probe |
| `ALERT_WEBHOOK_URL` | Status-change webhook (optional) | off |
| `ENABLE_NOTIFICATIONS` | `"true"` enables public email subs + `/api/subscribe` | off |
| `EMAIL_SENDING_ACCOUNT_ID` | Cloudflare Email Sending account (probe) | off |
| `EMAIL_SENDING_API_TOKEN` | Email Sending token (probe) | off |
| `NOTIFY_FROM` | Sender address, must be onboarded domain | off |
| `VANTAGE_NAME` | Label for probe machine | `default` |
| `PERSIST_INTERVAL_MINUTES` | D1 write gate (min 1) | 5 |
| `PROBE_TIMEOUT_MS` | Probe abort timeout (min 1000) | 45000 |
| `SERVE_ONLY` | Force serve-only on Node too | auto on workerd |
| `WORKER_SELF_REFERENCE.service` / Worker `name` | Must be equal or deploy fails (10143) | `govstatus-nepal` |

**D1 availability is two separate mechanisms** (`lib/d1.ts`):
1. **Native binding** — `globalThis.DB` (workerd), OpenNext
   `getCloudflareContext().env.DB`, or `process.env.DB`. Tokenless, fast.
2. **REST fallback** — the `CLOUDFLARE_*` vars → POST to
   `https://api.cloudflare.com/client/v4/accounts/{acc}/d1/database/{db}/query`.
   Used by local Node and the standalone probe.

Both `d1Query` and `d1Batch` try native first, then REST. Missing/invalid env →
`d1Config` is `null` → app serves `source: "simulated"`. An *empty configured*
DB yields grey "no data" slots, never fabricated bars.

---

## 10. Deployment (production env)

### Cloudflare Workers via OpenNext

`npm run deploy` / `preview` / `upload` all run `opennextjs-cloudflare build`
then wrangler. Build output `.open-next/` (generated `worker.js` + assets) is
the deploy artifact.

- **`custom-worker.ts`** imports `./.open-next/worker.js` (generated, absent on
  fresh checkout → `@ts-ignore`). Re-exports `DOQueueHandler`,
  `DOShardedTagCache` (ISR cache).
- **`worker-polyfills.ts`** must be imported *before* the OpenNext worker:
  workerd lacks `MessagePort`/`MessageChannel` and Next's compiled edge
  primitives throw at module init without them.
- **`wrangler.jsonc`**: Worker `name` `govstatus-nepal` must equal
  `WORKER_SELF_REFERENCE.service` or deploy fails error 10143 (OpenNext uses
  that binding for ISR revalidation). Sets `SERVE_ONLY=true`, the
  `CLOUDFLARE_*` vars, the `DB` D1 binding (`govstatus-history`), and assets.
  Compatibility flags: `nodejs_compat` + `global_fetch_strictly_public`.
- **`open-next.config.ts`**: `defineCloudflareConfig({})` — default. ISR
  persistence across cold starts needs an R2 incremental cache binding if added
  later; currently `revalidate=60` works via the fast module cache / D1 snapshot.

Secrets on Workers: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
`CLOUDFLARE_API_TOKEN`, `CRON_SECRET` via `wrangler secret put`.

### The production probing setup (2 machines)

1. **Cloudflare Worker** — serves the site, serve-only, renders D1 snapshot.
2. **Nepal-IP machine** — runs `probe/nepal-probe.mjs` every 5 min, writes D1.

### Ops checklist

- After any DB/secret change, verify: `curl /api/diag` (source, staleness,
  databaseId) against a fresh `node probe/nepal-probe.mjs --dry-run`. Mismatch
  → mass false "down" (silently falls back to self-probing).
- D1 token needs "D1: Edit". Free tier 100k writes/day; at 5-min cadence ~53k.
- Retention 90 days.

---

## 11. Local dev

```bash
npm install
npm run dev        # Turbopack, http://localhost:3000
```

Without D1 credentials the app gracefully shows simulated history. To use real
D1: `wrangler login`, create/use `govstatus-history`, apply `d1/schema.sql`,
create a "D1: Edit" token, `cp .env.example .env.local` and fill in.

Note: `next dev` re-adds a block to `AGENTS.md` — leave it alone.

---

## 12. Gotchas & invariants (do not break)

1. **Serve-only Worker never probes** — foreign IP probing = mass false "down".
2. **Browser-like User-Agent on purpose** — .np WAFs reset/stall bot UAs; don't
   "make it honest".
3. **Down confirmation + `checkUrl` deep check** — keep both; they cut false
   alarms and catch broken-but-up portals.
4. **Hourly-bucket aggregation is worst-status-in-hour** — a 1-min blip must
   stay visible; don't switch to "last sample wins".
5. **`PERSIST_INTERVAL_MINUTES` gating** — don't write D1 every cycle; stays
   inside free-tier write limit.
6. **`d1BatchChunked` chunks of 60** — D1 REST statement cap; keep for large
   batches.
7. **`wrangler.jsonc` name == `WORKER_SELF_REFERENCE.service`** — else 10143.
8. **`worker-polyfills.ts` before the OpenNext worker** — else module-init
   `ReferenceError: MessagePort` on every request.
9. **DB id match between Worker and probe** — verify via `/api/diag`; mismatch
   silently serves wrong status.
10. **Probing runtime split** — relaxed-TLS retry + native fallback + cert
    probing are Node-only; keep the `IS_NODE` guards.
11. **Vitest suite exists** — `npm test` covers probe classification, down-confirmation + checkUrl worse-result, history codec, bucket worst-status aggregation, and transition alerts. Run it with `npm run lint` + `npx tsc --noEmit`.
12. **145 services, catalog-driven** — add to `seed-services.json`; tabs, counts,
    and probes pick it up automatically (Zod-validated).