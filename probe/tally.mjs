import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";

const seeds = JSON.parse(fs.readFileSync("./src/data/seed-services.json", "utf8"));
const PROBE_TIMEOUT_MS = 25000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION =
  crypto.constants?.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION ?? 0x00040000;

const primaryAgent = new Agent({
  allowH2: false,
  connect: {
    timeout: PROBE_TIMEOUT_MS,
    secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
  },
  headersTimeout: PROBE_TIMEOUT_MS,
  bodyTimeout: PROBE_TIMEOUT_MS,
});

const relaxedAgent = new Agent({
  allowH2: false,
  connect: {
    timeout: PROBE_TIMEOUT_MS,
    rejectUnauthorized: false,
    secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
  },
  headersTimeout: PROBE_TIMEOUT_MS,
  bodyTimeout: PROBE_TIMEOUT_MS,
});

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

async function directCall(seed) {
  const started = Date.now();
  const makeReq = (dispatcher) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
    return undiciFetch(seed.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: ac.signal,
      dispatcher,
    }).finally(() => clearTimeout(t));
  };

  try {
    let res;
    let status = null;
    let method = "primary";
    try {
      res = await makeReq(primaryAgent);
      status = res.status;
    } catch (e1) {
      try {
        res = await makeReq(relaxedAgent);
        status = res.status;
        method = "relaxed-tls";
      } catch (e2) {
        status = await nativeProbeFallback(seed.url);
        method = "native-http";
      }
    }

    if (res?.body) {
      await res.body.cancel().catch(() => {});
    }

    const elapsed = Date.now() - started;
    if (status !== null && status >= 200 && status < 400) {
      return {
        id: seed.id,
        name: seed.name,
        url: seed.url,
        category: seed.category,
        directStatus: elapsed > 3500 ? "degraded" : "operational",
        httpStatus: status,
        elapsed,
        method,
      };
    }
    return {
      id: seed.id,
      name: seed.name,
      url: seed.url,
      category: seed.category,
      directStatus: status === 403 || status === 429 ? "degraded" : "down",
      httpStatus: status,
      elapsed,
      method: status ? method : "failed",
    };
  } catch (err) {
    return {
      id: seed.id,
      name: seed.name,
      url: seed.url,
      category: seed.category,
      directStatus: "down",
      httpStatus: null,
      elapsed: Date.now() - started,
      method: "error",
      error: err.code || err.message,
    };
  }
}

async function run() {
  console.log("== 1. Calling all 92 services directly ==");
  const directResults = new Array(seeds.length);
  let next = 0;
  const workers = Array.from({ length: 15 }, async () => {
    while (next < seeds.length) {
      const idx = next++;
      directResults[idx] = await directCall(seeds[idx]);
    }
  });
  await Promise.all(workers);

  console.log("\n== 2. Fetching Next.js /api/health endpoint ==");
  const apiRes = await fetch("http://localhost:3000/api/health");
  if (!apiRes.ok) {
    throw new Error(`API health fetch failed: ${apiRes.status}`);
  }
  const apiData = await apiRes.json();
  const apiServices = new Map(apiData.services.map((s) => [s.id, s]));

  console.log("\n== 3. Tally & Side-by-Side Comparison ==");
  let matches = 0;
  let differences = [];

  for (const direct of directResults) {
    const api = apiServices.get(direct.id);
    if (!api) {
      differences.push({ id: direct.id, reason: "Missing in API response" });
      continue;
    }
    const match = direct.directStatus === api.status;
    if (match) {
      matches++;
    } else {
      differences.push({
        id: direct.id,
        name: direct.name,
        directStatus: direct.directStatus,
        apiStatus: api.status,
        directHttp: direct.httpStatus,
        elapsed: direct.elapsed,
      });
    }
  }

  const directSummary = {
    total: directResults.length,
    operational: directResults.filter((r) => r.directStatus === "operational").length,
    degraded: directResults.filter((r) => r.directStatus === "degraded").length,
    down: directResults.filter((r) => r.directStatus === "down").length,
  };

  console.log("\n--- Direct Call Summary ---");
  console.log(JSON.stringify(directSummary, null, 2));

  console.log("\n--- Next.js API /api/health Summary ---");
  console.log(JSON.stringify(apiData.summary, null, 2));

  console.log(`\nMatch Rate: ${matches} / ${directResults.length} (${((matches / directResults.length) * 100).toFixed(1)}%)`);

  if (differences.length > 0) {
    console.log("\nDifferences (Direct Call vs API Snapshot):");
    for (const d of differences) {
      console.log(`- [${d.id}] ${d.name}: Direct=${d.directStatus} (HTTP ${d.directHttp}, ${d.elapsed}ms) vs API=${d.apiStatus}`);
    }
  } else {
    console.log("\nPERFECT MATCH: 100% agreement between Direct Calls and Next.js /api/health!");
  }

  // Save the full tally report to json for viewing
  fs.writeFileSync(
    "./probe/tally-report.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        directSummary,
        apiSummary: apiData.summary,
        matches,
        total: directResults.length,
        differences,
        directResults,
      },
      null,
      2
    )
  );
  console.log("\nDetailed tally report written to probe/tally-report.json");
}

run().catch((e) => {
  console.error("Tally script error:", e);
  process.exit(1);
});
