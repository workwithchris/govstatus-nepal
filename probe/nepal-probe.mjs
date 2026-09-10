#!/usr/bin/env node
/**
 * IsGovOnline — Nepal-vantage probe.
 *
 * Standalone Node script meant to run on a machine with a Nepal IP
 * (VPS, home server, or dev laptop) via cron/systemd. It probes every
 * service from that vantage point and writes hourly aggregates + current
 * state straight to Cloudflare D1 via the REST API. The Cloudflare Worker
 * runs in serve-only mode (SERVE_ONLY=true) and just renders these results.
 *
 * Schedule (every 5 minutes keeps D1 writes ~53k/day, well inside the free tier):
 *   crontab: 0,5,10,15,20,25,30,35,40,45,50,55 * * * * cd /path/to/govstatus && node probe/nepal-probe.mjs >> probe/probe.log 2>&1
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID,
 *      CLOUDFLARE_API_TOKEN, ALERT_WEBHOOK_URL (optional).
 * Also loads .env.local if present (gitignored, like the app).
 *
 * Dry run (probe only, no D1 writes): node probe/nepal-probe.mjs --dry-run
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import { Agent, fetch as undiciFetch } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const HOUR_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 90;
// Long timeout: several .np municipal portals take 20-40s to respond (bharatpur
// ~19s, biratnagar ~28s, pokhara ~38s). An 8s abort marked them "down" even
// though they work. Overridable via PROBE_TIMEOUT_MS.
const PROBE_TIMEOUT_MS = Math.max(1000, Number(process.env.PROBE_TIMEOUT_MS) || 45000);
const SLOW_THRESHOLD_MS = 3500;
const DRY_RUN = process.argv.includes("--dry-run");

/* --------------------------------- env ---------------------------------- */

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(join(ROOT, file), "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq > 0) env[t.slice(0, eq)] = t.slice(eq + 1);
      }
    } catch {
      /* ignore missing */
    }
  }
  return env;
}

const env = loadEnv();
const d1Config = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN"].every(
  (k) => env[k]
)
  ? {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      databaseId: env.CLOUDFLARE_D1_DATABASE_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
    }
  : null;

if (!d1Config && !DRY_RUN) {
  console.error("[nepal-probe] missing Cloudflare D1 env vars");
  process.exit(1);
}

/* ------------------------------ concurrency ------------------------------ */

/** Runs `fn` over `items` with at most `limit` concurrent calls. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

/* -------------------------------- probing -------------------------------- */

const allSeeds = JSON.parse(readFileSync(join(ROOT, "src/data/seed-services.json"), "utf8"));
// Optional sharding: PROBE_SHARD/PROBE_SHARDS split the catalog across parallel
// runners (shard N takes indexes i % SHARDS === N). Unset = probe everything.
const SHARD = Number(env.PROBE_SHARD);
const SHARDS = Number(env.PROBE_SHARDS);
const seeds =
  SHARDS > 0 && Number.isInteger(SHARD) && SHARD >= 0 && SHARD < SHARDS
    ? allSeeds.filter((_, i) => i % SHARDS === SHARD)
    : allSeeds;
// Browser-like UA: .np WAFs reset/stall the old self-describing bot UA
// (kathmandu.gov.np, nea.org.np) but serve normal responses to a browser UA.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION =
  crypto.constants?.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION ?? 0x00040000;

// Explicit connect.timeout, headersTimeout, and bodyTimeout are critical:
// Undici connector defaults connect.timeout to 10s, which silently aborts
// slow .np portals (e.g. municipal servers taking 15-30s) despite PROBE_TIMEOUT_MS.
// allowH2: false is required because several .np WAFs/Nginx proxies reset on h2.
const primaryAgent = new Agent({
  allowH2: false,
  connect: {
    timeout: PROBE_TIMEOUT_MS,
    secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
  },
  headersTimeout: PROBE_TIMEOUT_MS,
  bodyTimeout: PROBE_TIMEOUT_MS,
});

let relaxedAgent = null;
function getRelaxedAgent() {
  if (!relaxedAgent) {
    relaxedAgent = new Agent({
      allowH2: false,
      connect: {
        timeout: PROBE_TIMEOUT_MS,
        rejectUnauthorized: false,
        secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
      },
      headersTimeout: PROBE_TIMEOUT_MS,
      bodyTimeout: PROBE_TIMEOUT_MS,
    });
  }
  return relaxedAgent;
}

/**
 * Fallback probe using Node's native http/https modules. Immune to ALPN-rejecting
 * legacy servers (e.g. Oracle WebLogic on OPCR or older Apache) where undici's
 * forced ALPN extension causes ECONNRESET.
 */
function nativeProbeFallback(urlString) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlString);
      const mod = u.protocol === "http:" ? http : https;
      const req = mod.request(
        u,
        {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          },
          rejectUnauthorized: false,
          secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
          timeout: PROBE_TIMEOUT_MS,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 200);
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

async function probeOnce(url) {
  const startedAt = Date.now();

  const makeRequest = (dispatcher) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    return undiciFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
      dispatcher: dispatcher ?? primaryAgent,
    }).finally(() => clearTimeout(timer));
  };

  try {
    let res;
    let httpStatus = null;
    try {
      res = await makeRequest();
      httpStatus = res.status;
    } catch {
      // Retry once with relaxed TLS (Node-only; Nepal vantage).
      try {
        res = await makeRequest(getRelaxedAgent());
        httpStatus = res.status;
      } catch {
        // Native fallback for legacy servers that reject ALPN
        httpStatus = await nativeProbeFallback(url);
      }
    }

    if (res) {
      try {
        if (res.body) await res.body.cancel();
      } catch {
        /* closed */
      }
    }

    const responseTime = Math.round(Date.now() - startedAt);

    if (httpStatus !== null && httpStatus >= 200 && httpStatus < 400) {
      return {
        status: responseTime > SLOW_THRESHOLD_MS ? "degraded" : "operational",
        responseTime,
        httpStatus,
      };
    }
    return {
      status: httpStatus === 403 || httpStatus === 429 ? "degraded" : "down",
      responseTime,
      httpStatus,
    };
  } catch {
    return { status: "down", responseTime: null, httpStatus: null };
  }
}

const CONFIRM_DELAY_MS = 2500;
const WORSE = { down: 2, degraded: 1, operational: 0 };

function worse(a, b) {
  if (WORSE[b.status] > WORSE[a.status]) return b;
  if (WORSE[b.status] === WORSE[a.status]) return a.httpStatus != null ? a : b;
  return a;
}

/**
 * Probes homepage + optional deep checkUrl (worse wins), and confirms a "down"
 * reading with a second probe after a short delay before reporting it down —
 * cuts single-fetch false alarms on flaky .np infra.
 */
async function probeService(url, checkUrl) {
  let result = await probeOnce(url);
  if (checkUrl && checkUrl !== url) {
    result = worse(result, await probeOnce(checkUrl));
  }
  if (result.status === "down") {
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELAY_MS));
    const confirm = await probeOnce(url);
    if (confirm.status !== "down") result = confirm;
  }
  return result;
}

async function probeCertExpiryMs(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return null;
    return await new Promise((resolve) => {
      const socket = tls.connect({
        host: url.hostname,
        servername: url.hostname,
        port: Number(url.port) || 443,
        rejectUnauthorized: false,
      });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(null);
      }, 15000);
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve(cert.valid_to ? Date.parse(cert.valid_to) || null : null);
      });
      socket.once("error", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

/* --------------------------------- D1 ------------------------------------ */

const D1_URL = d1Config
  ? `https://api.cloudflare.com/client/v4/accounts/${d1Config.accountId}/d1/database/${d1Config.databaseId}/query`
  : null;

async function query(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${d1Config.apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const json = await res.json();
  if (!res.ok || json.success !== true) {
    throw new Error(`D1 query failed: ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  }
  return json.result?.[0]?.results ?? [];
}

async function batch(statements) {
  for (let i = 0; i < statements.length; i += 60) {
    const chunk = statements.slice(i, i + 60);
    const res = await fetch(D1_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${d1Config.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ batch: chunk }),
    });
    const json = await res.json();
    if (!res.ok || json.success !== true) {
      throw new Error(`D1 batch failed: ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
    }
  }
}

/* -------------------------- adaptive probe cadence ------------------------- */

/**
 * Anti-blocking pacing for government WAFs (mirrors the app's
 * health-probe.ts cadence logic). Two problems it solves:
 *
 *  1. **Lockstep bursts** — pinging all services every 5 min from one Nepal
 *     IP at :00/:05/:10 looks like a crawler. Each service gets a
 *     deterministic `phase` (0..7), so once backed off, services spread
 *     across cycles instead of re-pinging together.
 *  2. **No relief when throttled** — a portal that 429s/403s you was hit
 *     again 5 minutes later. After 2 consecutive stressful outcomes the
 *     service's `shift` rises (probe every 2nd, 4th, 8th cycle); it drops
 *     back down after 2 consecutive healthy responses.
 *
 * The cron script is a *new process every run*, so backoff state is
 * persisted to `cadence-state.json` (gitignored) next to this script and
 * atomically rewritten each cycle. Skipped services keep their last
 * persisted status from D1 — nothing fabricated, just an older timestamp.
 */
const CADENCE_FILE = join(__dirname, "cadence-state.json");
const CADENCE_MAX_SHIFT = 3;
const CADENCE_STRESS_THRESHOLD = 2;
const CADENCE_RECOVERY_HITS = 2;
const PROBE_CYCLE_MS = 5 * 60 * 1000;

function hashSeed(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function probePhase(seedId) {
  return hashSeed(seedId) % (1 << CADENCE_MAX_SHIFT);
}

function cycleIndex(nowMs) {
  return Math.floor(nowMs / PROBE_CYCLE_MS);
}

function isProbeDue(state, cycle, phase) {
  const stride = 1 << state.shift;
  return (cycle + phase) % stride === 0;
}

/** Outcomes that look like the origin throttling us: down, 403 (WAF), 429. */
function isStressful(probe) {
  return (
    probe.status === "down" ||
    probe.httpStatus === 403 ||
    probe.httpStatus === 429
  );
}

function updateCadence(prev, stressful) {
  if (stressful) {
    const stress = prev.stress + 1;
    return {
      shift:
        stress >= CADENCE_STRESS_THRESHOLD
          ? Math.min(prev.shift + 1, CADENCE_MAX_SHIFT)
          : prev.shift,
      stress: stress >= CADENCE_STRESS_THRESHOLD ? 0 : stress,
      healthy: 0,
    };
  }
  const healthy = prev.healthy + 1;
  return {
    shift:
      healthy >= CADENCE_RECOVERY_HITS
        ? Math.max(prev.shift - 1, 0)
        : prev.shift,
    stress: 0,
    healthy: healthy >= CADENCE_RECOVERY_HITS ? 0 : healthy,
  };
}

function loadCadence() {
  try {
    return JSON.parse(readFileSync(CADENCE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCadence(cadence) {
  if (DRY_RUN) return; // dry-run never mutates state
  try {
    const tmp = `${CADENCE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(cadence));
    renameSync(tmp, CADENCE_FILE); // atomic — overlapping cron runs can't half-write
  } catch (err) {
    console.error("[nepal-probe] cadence save failed:", err);
  }
}

/* -------------------------------- cycle ---------------------------------- */

async function main() {
  const checkedAt = new Date().toISOString();
  const checkedAtMs = Date.parse(checkedAt);
  const bucketMs = Math.floor(checkedAtMs / HOUR_MS) * HOUR_MS;
  const cycle = cycleIndex(checkedAtMs);

  const cadence = loadCadence();
  const dueSeeds = seeds.filter((seed) => {
    const state = cadence[seed.id] ?? { shift: 0, stress: 0, healthy: 0 };
    return isProbeDue(state, cycle, probePhase(seed.id));
  });
  const skippedSeeds = seeds.filter((seed) => !dueSeeds.includes(seed));

  const [metaRows, certResults] = await Promise.all([
    d1Config ? query("SELECT service_id, last_status, cert_expires_at_ms FROM service_meta") : Promise.resolve([]),
    mapLimit(dueSeeds, 15, async (s) => ({ id: s.id, expiresMs: await probeCertExpiryMs(s.url) })),
  ]);
  const prevMeta = new Map(metaRows.map((r) => [r.service_id, r]));

  const results = await mapLimit(dueSeeds, 15, async (seed) => {
    const probe = await probeService(seed.url, seed.checkUrl);
    cadence[seed.id] = updateCadence(
      cadence[seed.id] ?? { shift: 0, stress: 0, healthy: 0 },
      isStressful(probe)
    );
    return { seed, probe };
  });

  // Backed-off services keep their last persisted status in D1 — no new
  // sample is written this cycle (the hourly bucket simply gets no extra
  // row), so the dashboard shows them with an older `lastChecked`, honestly.

  saveCadence(cadence);
  const certs = new Map(certResults.filter((c) => c.expiresMs !== null).map((c) => [c.id, c.expiresMs]));

  if (DRY_RUN) {
    const count = (s) => results.filter((r) => r.probe.status === s).length;
    console.log(`[dry-run] ${checkedAt} · total=${seeds.length} probed=${results.length} skipped=${skippedSeeds.length} operational=${count("operational")} degraded=${count("degraded")} down=${count("down")} certs=${certs.size}`);
    return;
  }

  const OUTCOME_COLS = ["outcome_ok", "outcome_slow", "outcome_blocked", "outcome_rate_limited", "outcome_http5xx", "outcome_network"];
  // Mirrors src/features/services-monitor/server/outcomes.ts. Keep in sync.
  function outcomeColForProbe(probe) {
    const http = probe.httpStatus;
    if (http === 403) return "outcome_blocked";
    if (http === 429) return "outcome_rate_limited";
    if (http !== null && http >= 500) return "outcome_http5xx";
    if (probe.status === "down") return "outcome_network";
    if (probe.status === "degraded") return "outcome_slow";
    return "outcome_ok";
  }

  const buildStatements = (withOutcomes) => {
    const statements = [];
    for (const { seed, probe } of results) {
      if (withOutcomes) {
        const outcome = OUTCOME_COLS.map((col) => (outcomeColForProbe(probe) === col ? 1 : 0));
        statements.push({
          sql: `INSERT INTO status_checks (service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms, ${OUTCOME_COLS.join(", ")})
                VALUES (?, ?, ?, 1, ?, ?, ${OUTCOME_COLS.map(() => "?").join(", ")})
                ON CONFLICT(service_id, bucket_ms) DO UPDATE SET
                  worst_status = CASE
                    WHEN worst_status = 'down' OR excluded.worst_status = 'down' THEN 'down'
                    WHEN worst_status = 'degraded' OR excluded.worst_status = 'degraded' THEN 'degraded'
                    ELSE 'operational' END,
                  sample_count = sample_count + 1,
                  sum_response_ms = sum_response_ms + excluded.sum_response_ms,
                  checked_at_ms = excluded.checked_at_ms,
                  ${OUTCOME_COLS.map((col) => `${col} = ${col} + excluded.${col}`).join(", ")}`,
          params: [seed.id, bucketMs, probe.status, probe.responseTime ?? 0, checkedAtMs, ...outcome],
        });
      } else {
        statements.push({
          sql: `INSERT INTO status_checks (service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms)
                VALUES (?, ?, ?, 1, ?, ?)
                ON CONFLICT(service_id, bucket_ms) DO UPDATE SET
                  worst_status = CASE
                    WHEN worst_status = 'down' OR excluded.worst_status = 'down' THEN 'down'
                    WHEN worst_status = 'degraded' OR excluded.worst_status = 'degraded' THEN 'degraded'
                    ELSE 'operational' END,
                  sample_count = sample_count + 1,
                  sum_response_ms = sum_response_ms + excluded.sum_response_ms,
                  checked_at_ms = excluded.checked_at_ms`,
          params: [seed.id, bucketMs, probe.status, probe.responseTime ?? 0, checkedAtMs],
        });
      }
      statements.push({
        sql: `INSERT INTO service_meta
                (service_id, last_status, last_checked_at_ms, cert_expires_at_ms, cert_checked_at_ms)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(service_id) DO UPDATE SET
                last_status = excluded.last_status,
                last_checked_at_ms = excluded.last_checked_at_ms,
                cert_expires_at_ms = COALESCE(excluded.cert_expires_at_ms, service_meta.cert_expires_at_ms),
                cert_checked_at_ms = COALESCE(excluded.cert_checked_at_ms, service_meta.cert_checked_at_ms)`,
        params: [seed.id, probe.status, checkedAtMs, certs.get(seed.id) ?? null, certs.has(seed.id) ? checkedAtMs : null],
      });
    }
    statements.push({
      sql: "DELETE FROM status_checks WHERE bucket_ms < ?",
      params: [checkedAtMs - RETENTION_DAYS * 24 * HOUR_MS],
    });
    return statements;
  };

  try {
    await batch(buildStatements(true));
  } catch (err) {
    console.warn("[nepal-probe] outcome columns missing on this DB — retrying without outcome counters:", err?.message ?? err);
    await batch(buildStatements(false));
  }

  // Transitions → alert webhook (same payload shape as the app).
  const events = [];
  for (const { seed, probe } of results) {
    const prev = prevMeta.get(seed.id)?.last_status ?? null;
    if (prev === null || prev === probe.status) continue;
    events.push({ serviceId: seed.id, name: seed.name, url: seed.url, previousStatus: prev, currentStatus: probe.status, httpStatus: probe.httpStatus });
  }
  if (events.length > 0 && env.ALERT_WEBHOOK_URL) {
    const text = events
      .map((e) => `[${e.currentStatus.toUpperCase()}] ${e.name} — ${e.url} (was ${e.previousStatus ?? "unknown"}, http ${e.httpStatus ?? "—"})`)
      .join("\n");
    try {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, checkedAt, events }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[nepal-probe] alert failed:", err);
    }
  }

  // Public subscribers → email via Cloudflare Email Sending REST (config-gated).
  // Requires EMAIL_SENDING_ACCOUNT_ID, EMAIL_SENDING_API_TOKEN, NOTIFY_FROM set.
  const emailSent = await notifySubscribers(events);

  const count = (s) => results.filter((r) => r.probe.status === s).length;
  console.log(
    `[nepal-probe] ${checkedAt} · vantage=${env.VANTAGE_NAME ?? "default"} bucket=${bucketMs} probed=${results.length} skipped=${skippedSeeds.length} operational=${count("operational")} degraded=${count("degraded")} down=${count("down")} certs=${certs.size} alerts=${events.length} emails=${emailSent}`
  );
}

/**
 * Email public subscribers on status transitions via Cloudflare Email Sending
 * REST. Config-gated: no-op unless EMAIL_SENDING_ACCOUNT_ID,
 * EMAIL_SENDING_API_TOKEN, and NOTIFY_FROM are all set (from must be an
 * onboarded domain). Returns number of emails sent.
 */
async function notifySubscribers(events) {
  const accountId = env.EMAIL_SENDING_ACCOUNT_ID;
  const apiToken = env.EMAIL_SENDING_API_TOKEN;
  const from = env.NOTIFY_FROM;
  if (!accountId || !apiToken || !from || events.length === 0) return 0;

  // Group affected services, load their subscribers.
  const affected = [...new Set(events.map((e) => e.serviceId))];
  const byEmail = new Map();
  for (const serviceId of affected) {
    const rows = await query(
      "SELECT email FROM subscribers WHERE service_id = ?",
      [serviceId]
    );
    for (const row of rows) {
      const event = events.find((e) => e.serviceId === serviceId);
      if (!event) continue;
      if (!byEmail.has(row.email)) byEmail.set(row.email, []);
      byEmail.get(row.email).push(event);
    }
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;
  let sent = 0;
  for (const [email, userEvents] of byEmail) {
    const lines = userEvents
      .map(
        (e) =>
          `[${e.currentStatus.toUpperCase()}] ${e.name} — ${e.url} (was ${e.previousStatus ?? "unknown"}, http ${e.httpStatus ?? "—"})`
      )
      .join("\n");
    const unsub = `https://isgovonline.techyatraa.com/?unsub=${encodeURIComponent(email)}`;
    const text = `${lines}\n\nIsGovOnline\nUnsubscribe: ${unsub}`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          from: { address: from, name: "IsGovOnline" },
          subject: `[IsGovOnline] ${userEvents.length} service update${userEvents.length > 1 ? "s" : ""}`,
          text,
          headers: { "List-Unsubscribe": `<${unsub}>` },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        sent += 1;
      } else {
        console.error(`[nepal-probe] email to ${email} failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.error(`[nepal-probe] email to ${email} failed:`, err);
    }
  }
  return sent;
}

main().catch((err) => {
  console.error("[nepal-probe] failed:", err);
  process.exit(1);
});