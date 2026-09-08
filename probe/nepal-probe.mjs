#!/usr/bin/env node
/**
 * GovStatus Nepal — Nepal-vantage probe.
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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { Agent, fetch as undiciFetch } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const HOUR_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 7;
// Long timeout: several .np municipal portals take 20-40s to respond (bharatpur
// ~19s, biratnagar ~28s, pokhara ~38s). An 8s abort marked them "down" even
// though they work. Overridable via PROBE_TIMEOUT_MS.
const PROBE_TIMEOUT_MS = Math.max(1000, Number(process.env.PROBE_TIMEOUT_MS) || 45000);
const SLOW_THRESHOLD_MS = 3500;
const DRY_RUN = process.argv.includes("--dry-run");

/* --------------------------------- env ---------------------------------- */

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq > 0) env[t.slice(0, eq)] = t.slice(eq + 1);
    }
  } catch {
    /* no .env.local */
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

if (!d1Config) {
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

const seeds = JSON.parse(readFileSync(join(ROOT, "src/data/seed-services.json"), "utf8"));
// Browser-like UA: .np WAFs reset/stall the old self-describing bot UA
// (kathmandu.gov.np, nea.org.np) but serve normal responses to a browser UA.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let relaxedAgent = null;
function getRelaxedAgent() {
  if (!relaxedAgent) relaxedAgent = new Agent({ connect: { rejectUnauthorized: false } });
  return relaxedAgent;
}

async function probeService(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();

  const makeRequest = (dispatcher) =>
    (dispatcher ? undiciFetch : fetch)(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
    });

  try {
    let res;
    try {
      res = await makeRequest();
    } catch (err) {
      if (controller.signal.aborted) throw err;
      // Retry once with relaxed TLS (Node-only; Nepal vantage).
      res = await makeRequest(getRelaxedAgent());
    }
    try {
      if (res.body) await res.body.cancel();
    } catch {
      /* closed */
    }
    const responseTime = Math.round(Date.now() - startedAt);

    if (res.status >= 200 && res.status < 400) {
      return {
        status: responseTime > SLOW_THRESHOLD_MS ? "degraded" : "operational",
        responseTime,
        httpStatus: res.status,
      };
    }
    return { status: res.status === 403 ? "degraded" : "down", responseTime, httpStatus: res.status };
  } catch {
    return { status: "down", responseTime: null, httpStatus: null };
  } finally {
    clearTimeout(timer);
  }
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
      }, 6000);
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

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${d1Config.accountId}/d1/database/${d1Config.databaseId}/query`;

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

/* -------------------------------- cycle ---------------------------------- */

async function main() {
  const checkedAt = new Date().toISOString();
  const checkedAtMs = Date.parse(checkedAt);
  const bucketMs = Math.floor(checkedAtMs / HOUR_MS) * HOUR_MS;

  const [metaRows, certResults] = await Promise.all([
    d1Config ? query("SELECT service_id, last_status, cert_expires_at_ms FROM service_meta") : Promise.resolve([]),
    mapLimit(seeds, 20, async (s) => ({ id: s.id, expiresMs: await probeCertExpiryMs(s.url) })),
  ]);
  const prevMeta = new Map(metaRows.map((r) => [r.service_id, r]));

  const results = await mapLimit(seeds, 20, async (seed) => {
    const probe = await probeService(seed.url);
    return { seed, probe };
  });

  const certs = new Map(certResults.filter((c) => c.expiresMs !== null).map((c) => [c.id, c.expiresMs]));

  if (DRY_RUN) {
    const count = (s) => results.filter((r) => r.probe.status === s).length;
    console.log(`[dry-run] ${checkedAt} · total=${seeds.length} operational=${count("operational")} degraded=${count("degraded")} down=${count("down")} certs=${certs.size}`);
    return;
  }

  const statements = [];
  for (const { seed, probe } of results) {
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

  await batch(statements);

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

  const count = (s) => results.filter((r) => r.probe.status === s).length;
  console.log(
    `[nepal-probe] ${checkedAt} · persisted bucket=${bucketMs} operational=${count("operational")} degraded=${count("degraded")} down=${count("down")} certs=${certs.size} alerts=${events.length}`
  );
}

main().catch((err) => {
  console.error("[nepal-probe] failed:", err);
  process.exit(1);
});