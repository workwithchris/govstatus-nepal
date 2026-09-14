#!/usr/bin/env node
/**
 * Nepal public-proxy pool.
 *
 * Scrapes FreeProxy.World's Nepal list, verifies the exits are alive and
 * (optionally) actually in Nepal, then hands out proxies round-robin. Used by
 * probe/nepal-probe.mjs in USE_PROXY_POOL mode to give the *foreign* GitHub
 * Actions vantage a Nepal egress.
 *
 * SAFETY CONTRACT — do not break:
 *   probeOnceThroughProxy() returns `null` when no HTTP response was ever
 *   received (dead proxy, SOCKS/TLS handshake failure, timeout). Callers MUST
 *   treat `null` as "no sample" and skip the service. Only a real HTTP response
 *   may be classified operational/degraded/down. This is what stops a flaky
 *   free-proxy pool from fabricating outages in status_checks_foreign.
 *
 * Config (env):
 *   PROXY_CACHE_MINUTES         in-memory scrape cache TTL (default 20)
 *   PROXY_PREFLIGHT             "false" to skip liveness/country preflight
 *   PROXY_REQUIRE_NEPAL         "false" to keep non-NP exit countries
 *   PROXY_PREFLIGHT_URL         preflight target (default https://ipinfo.io/json)
 *   PROXY_PREFLIGHT_TIMEOUT_MS  per-proxy preflight timeout (default 6000)
 *
 * CLI: node probe/nepal-proxy-pool.mjs   (scrape + preflight + print ranking)
 */
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";
import { fetch as undiciFetch, ProxyAgent } from "undici";

const SOURCE_URL = "https://www.freeproxy.world/?country=NP";
// Browser-like UA: the source also fronts a CDN/WAF that rejects self-describing
// bots. Same rationale as the probe's own UA (see nepal-probe.mjs).
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/* ------------------------------ table parsing ----------------------------- */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isValidIpv4(ip) {
  const m = IPV4.exec(ip);
  return m !== null && m.slice(1).every((o) => Number(o) <= 255);
}

/** Normalizes the source's type cell ("http", "HTTPS", "socks4", …) or null. */
export function normalizeProtocol(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (t.includes("socks5")) return "socks5";
  if (t.includes("socks4")) return "socks4";
  if (t.includes("https")) return "https";
  if (t.includes("http")) return "http";
  return null;
}

/** Normalizes the source's anonymity cell to high | anonymous | transparent. */
export function normalizeAnonymity(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (t.includes("high") || t.includes("elite")) return "high";
  if (t.includes("anon")) return "anonymous";
  if (t.includes("no") || t.includes("transparent")) return "transparent";
  return "unknown";
}

/**
 * Parses the FreeProxy.World results table into normalized proxy records.
 * Column positions are resolved from the <thead> labels (with sane fallbacks)
 * so a layout tweak on the source doesn't silently produce garbage rows.
 */
export async function parseProxies(html) {
  const { load } = await import("cheerio");
  const $ = load(html);
  const headers = $("table thead th")
    .map((_, th) => $(th).text().trim().toLowerCase())
    .get();
  const col = (needle, fallback) => {
    const i = headers.findIndex((h) => h.includes(needle));
    return i >= 0 ? i : fallback;
  };
  const cIp = col("ip", 0);
  const cPort = col("port", 1);
  const cCity = col("city", 3);
  const cSpeed = col("speed", 4);
  const cType = col("type", 5);
  const cAnon = col("anonymity", 6);
  const cLast = col("last", 7);

  const proxies = [];
  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length <= Math.max(cIp, cPort, cType, cAnon)) return;

    const host = $(tds[cIp]).text().trim();
    const portMatch = /\d+/.exec($(tds[cPort]).text());
    const port = portMatch ? Number(portMatch[0]) : NaN;
    const protocol = normalizeProtocol($(tds[cType]).text());
    if (!isValidIpv4(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !protocol) {
      return;
    }

    const speedMatch = /(\d+)\s*ms/i.exec($(tds[cSpeed]).text());
    proxies.push({
      id: `${protocol}://${host}:${port}`,
      host,
      port,
      protocol,
      anonymity: normalizeAnonymity($(tds[cAnon]).text()),
      city: cCity >= 0 ? $(tds[cCity]).text().trim() : "",
      lastChecked: cLast >= 0 ? $(tds[cLast]).text().trim() : "",
      // Latency the source reports; replaced by measured rttMs after preflight.
      speedMs: speedMatch ? Number(speedMatch[1]) : null,
    });
  });
  return proxies;
}

/* -------------------------------- transport ------------------------------- */

function isSocks(proxy) {
  return proxy.protocol === "socks4" || proxy.protocol === "socks5";
}

const dispatchers = new Map();

/** Cached undici ProxyAgent for HTTP/HTTPS proxies (CONNECT for https targets). */
function getProxyDispatcher(proxy) {
  let dispatcher = dispatchers.get(proxy.id);
  if (!dispatcher) {
    // Always connect to the proxy over plain HTTP; the listed "https" type
    // means it can CONNECT to https targets, not that the proxy itself is TLS.
    dispatcher = new ProxyAgent({ uri: `http://${proxy.host}:${proxy.port}` });
    dispatchers.set(proxy.id, dispatcher);
  }
  return dispatcher;
}

export function closeProxyDispatcher(proxy) {
  const dispatcher = dispatchers.get(proxy.id);
  if (!dispatcher) return;
  dispatchers.delete(proxy.id);
  dispatcher.close().catch(() => {});
}

export function closeAllProxyDispatchers() {
  for (const dispatcher of dispatchers.values()) {
    dispatcher.close().catch(() => {});
  }
  dispatchers.clear();
}

async function httpProxyRequest(urlString, proxy, { timeoutMs, readBody, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await undiciFetch(urlString, {
      headers,
      redirect: "follow",
      signal: controller.signal,
      dispatcher: getProxyDispatcher(proxy),
    });
    const status = res.status;
    let body = null;
    if (readBody) {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    } else {
      try {
        await res.body?.cancel();
      } catch {
        /* already closed */
      }
    }
    return { status, body };
  } catch {
    // Proxy unreachable / handshake failed / aborted — no response from origin.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let SocksProxyAgentCtor = null;

async function socksProxyRequest(urlString, proxy, { timeoutMs, readBody, headers }) {
  if (!SocksProxyAgentCtor) {
    ({ SocksProxyAgent: SocksProxyAgentCtor } = await import("socks-proxy-agent"));
  }
  const agent = new SocksProxyAgentCtor(`${proxy.protocol}://${proxy.host}:${proxy.port}`, {
    timeout: timeoutMs,
    // Cron probes are low-volume; don't hold keep-alive sockets open (which
    // would also keep the short-lived process alive after main() finishes).
    keepAlive: false,
  });

  return await new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const url = new URL(urlString);
      const mod = url.protocol === "http:" ? http : https;
      const req = mod.request(
        url,
        { method: "GET", headers, agent, timeout: timeoutMs },
        (res) => {
          const status = res.statusCode ?? 200;
          if (!readBody) {
            res.resume();
            done({ status, body: null });
            return;
          }
          const chunks = [];
          let size = 0;
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size <= 64 * 1024) chunks.push(chunk);
          });
          res.on("end", () => done({ status, body: Buffer.concat(chunks).toString("utf8") }));
          res.on("error", () => done({ status, body: null }));
        }
      );
      req.on("error", () => done(null));
      req.on("timeout", () => {
        req.destroy();
        done(null);
      });
      req.end();
    } catch {
      done(null);
    }
  });
}

/**
 * Issues one GET through `proxy`. Returns `{ status, body }` only when the
 * origin (via the proxy) actually answered; `null` on any transport failure.
 */
async function proxyRequest(urlString, proxy, { timeoutMs, readBody = false, headers = {} }) {
  return isSocks(proxy)
    ? socksProxyRequest(urlString, proxy, { timeoutMs, readBody, headers })
    : httpProxyRequest(urlString, proxy, { timeoutMs, readBody, headers });
}

/* --------------------------------- probing -------------------------------- */

/**
 * Probe `urlString` once through `proxy`, mirroring nepal-probe.mjs's probeOnce
 * classification. Returns null (skip!) when no HTTP response was received.
 */
export async function probeOnceThroughProxy(urlString, proxy, options = {}) {
  const timeoutMs = options.timeoutMs ?? 45000;
  const slowThresholdMs = options.slowThresholdMs ?? 3500;
  const startedAt = Date.now();
  const res = await proxyRequest(urlString, proxy, {
    timeoutMs,
    readBody: false,
    headers: options.headers ?? {},
  });
  if (!res) return null;

  const responseTime = Math.round(Date.now() - startedAt);
  const httpStatus = res.status;
  if (httpStatus >= 200 && httpStatus < 400) {
    return {
      status: responseTime > slowThresholdMs ? "degraded" : "operational",
      responseTime,
      httpStatus,
    };
  }
  return {
    status: httpStatus === 403 || httpStatus === 429 ? "degraded" : "down",
    responseTime,
    httpStatus,
  };
}

/* --------------------------------- scrape --------------------------------- */

export async function scrapeNepalProxies(options = {}) {
  const logger = options.logger ?? console;
  const sourceUrl = options.sourceUrl ?? SOURCE_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const res = await fetch(sourceUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await parseProxies(await res.text());
  } catch (err) {
    logger.error?.(`[proxy-pool] scrape failed: ${err?.message ?? err}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------- preflight ------------------------------- */

function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  return Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  ).then(() => results);
}

/**
 * Drops proxies that can't complete a request (or don't exit in Nepal) and
 * records a measured rttMs. Preflight failures are silent skips, never errors.
 */
export async function preflightProxies(proxies, options = {}) {
  const logger = options.logger ?? console;
  const targetUrl = options.targetUrl ?? process.env.PROXY_PREFLIGHT_URL ?? "https://ipinfo.io/json";
  const timeoutMs = options.timeoutMs ?? Math.max(1000, Number(process.env.PROXY_PREFLIGHT_TIMEOUT_MS) || 6000);
  const requireNepal = options.requireNepal ?? process.env.PROXY_REQUIRE_NEPAL !== "false";
  const concurrency = options.concurrency ?? 6;

  const alive = [];
  await mapLimit(proxies, concurrency, async (proxy) => {
    const startedAt = Date.now();
    const res = await proxyRequest(targetUrl, proxy, {
      timeoutMs,
      readBody: true,
      headers: { Accept: "application/json" },
    });
    if (!res || res.status < 200 || res.status >= 400) return;
    let country = null;
    try {
      country = JSON.parse(res.body).country ?? null;
    } catch {
      country = null;
    }
    // Only reject on a *known* non-NP country; an unparseable body still passes.
    if (requireNepal && country && country !== "NP") return;
    alive.push({ ...proxy, country, rttMs: Date.now() - startedAt });
  });
  logger.log?.(`[proxy-pool] preflight: ${alive.length}/${proxies.length} alive`);
  return alive;
}

/* ---------------------------------- pool ---------------------------------- */

const ANONYMITY_RANK = { high: 0, anonymous: 1, unknown: 2, transparent: 3 };
// Prefer high anonymity, then lowest measured (or source-reported) latency.
export function rankProxies(a, b) {
  const aRank = ANONYMITY_RANK[a.anonymity] ?? 9;
  const bRank = ANONYMITY_RANK[b.anonymity] ?? 9;
  if (aRank !== bRank) return aRank - bRank;
  return (a.rttMs ?? a.speedMs ?? Infinity) - (b.rttMs ?? b.speedMs ?? Infinity);
}

export class NepalProxyPool {
  constructor(entries, options = {}) {
    this.entries = entries;
    this.logger = options.logger ?? console;
    this.maxFailures = options.maxFailures ?? Math.max(1, Number(process.env.PROXY_MAX_FAILURES) || 1);
    this.bad = new Set();
    this.failures = new Map();
    this.cursor = 0;
  }

  get size() {
    return this.entries.length;
  }

  get healthyCount() {
    return this.entries.reduce((n, e) => n + (this.bad.has(e.id) ? 0 : 1), 0);
  }

  /** Next healthy proxy (round-robin), or null when none remain. */
  pick() {
    const healthy = this.entries.filter((e) => !this.bad.has(e.id));
    if (healthy.length === 0) return null;
    const entry = healthy[this.cursor % healthy.length];
    this.cursor = (this.cursor + 1) % healthy.length;
    return entry;
  }

  penalize(proxy, reason) {
    const failures = (this.failures.get(proxy.id) ?? 0) + 1;
    this.failures.set(proxy.id, failures);
    if (failures >= this.maxFailures) {
      this.bad.add(proxy.id);
      closeProxyDispatcher(proxy);
      this.logger.warn?.(`[proxy-pool] dropped ${proxy.id}${reason ? ` (${reason})` : ""}`);
    }
  }

  reward(proxy) {
    this.failures.set(proxy.id, 0);
  }

  summary() {
    return { total: this.size, healthy: this.healthyCount, bad: this.bad.size };
  }
}

let cachedPool = null;

/**
 * Returns a ready-to-use pool: scrape → preflight (unless disabled) → rank.
 * Cached in memory for PROXY_CACHE_MINUTES so repeated calls in one process
 * (e.g. a long-running server) don't re-scrape on every request.
 */
export async function getNepalProxyPool(options = {}) {
  const now = Date.now();
  const ttlMs =
    options.ttlMs ?? Math.max(60_000, (Number(process.env.PROXY_CACHE_MINUTES) || 20) * 60_000);
  if (!options.refresh && cachedPool && now - cachedPool.fetchedAt < ttlMs) {
    return cachedPool.pool;
  }

  const logger = options.logger ?? console;
  const scraped = await scrapeNepalProxies({ logger });
  logger.log?.(`[proxy-pool] scraped ${scraped.length} Nepal proxies`);

  const preflightEnabled = options.preflight ?? process.env.PROXY_PREFLIGHT !== "false";
  let usable = scraped;
  if (preflightEnabled && scraped.length > 0) {
    const alive = await preflightProxies(scraped, { ...options, logger });
    // If preflight rejected everything (e.g. the checker itself is blocked),
    // fall back to the raw list rather than disabling the vantage entirely;
    // dead proxies still degrade safely to "no sample" at probe time.
    if (alive.length > 0) {
      usable = alive;
    } else {
      logger.warn?.("[proxy-pool] preflight found no usable proxies — using raw list");
    }
  }

  usable.sort(rankProxies);
  const pool = new NepalProxyPool(usable, { logger, maxFailures: options.maxFailures });
  cachedPool = { fetchedAt: now, pool };
  return pool;
}

/* ----------------------------------- CLI ---------------------------------- */

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const pool = await getNepalProxyPool({ refresh: true });
  console.log(`\n[proxy-pool] ${pool.summary().healthy}/${pool.summary().total} healthy`);
  for (const entry of pool.entries) {
    const exit = entry.country ? ` exit=${entry.country}` : "";
    const rtt = entry.rttMs ?? entry.speedMs;
    console.log(
      `  ${entry.protocol.padEnd(7)} ${entry.host}:${entry.port}  ${entry.anonymity.padEnd(11)} rtt=${rtt ?? "?"}ms${exit}`
    );
  }
  closeAllProxyDispatchers();
}
