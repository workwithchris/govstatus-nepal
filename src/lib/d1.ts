import { z } from "zod";
import type { D1Database } from "@cloudflare/workers-types";

/**
 * Cloudflare D1 client.
 * Supports:
 *  1. Native D1 binding via Cloudflare Workers (`DB` binding in wrangler.jsonc)
 *  2. REST API client (fallback for local Node.js and standalone probe scripts)
 */

interface D1Env {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

const d1EnvSchema = z.object({
  accountId: z.string().min(1),
  databaseId: z.string().min(1),
  apiToken: z.string().min(1),
});

function getRestConfig(): D1Env | null {
  const parsed = d1EnvSchema.safeParse({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  });
  return parsed.success && !parsed.data.apiToken.startsWith("replace-me")
    ? parsed.data
    : null;
}

export const d1Config: D1Env | null = getRestConfig();

async function getNativeDb(): Promise<D1Database | null> {
  // 1. Try globalThis.DB (standard workerd global binding)
  if (
    typeof (globalThis as unknown as { DB?: D1Database }).DB !== "undefined" &&
    typeof (globalThis as unknown as { DB?: { prepare?: unknown } }).DB?.prepare === "function"
  ) {
    return (globalThis as unknown as { DB: D1Database }).DB;
  }

  // 2. Try OpenNext Cloudflare Context
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx?.env as unknown as { DB?: D1Database })?.DB;
    if (db && typeof db.prepare === "function") {
      return db;
    }
  } catch {
    /* not in OpenNext Cloudflare worker */
  }

  // 3. Try process.env.DB
  if (
    typeof (process.env as unknown as { DB?: D1Database }).DB !== "undefined" &&
    typeof (process.env as unknown as { DB?: { prepare?: unknown } }).DB?.prepare === "function"
  ) {
    return (process.env as unknown as { DB: D1Database }).DB;
  }

  return null;
}

/** Check if D1 is reachable (either natively or via REST config). */
export async function isD1Available(): Promise<boolean> {
  if (getRestConfig()) return true;
  const native = await getNativeDb();
  return native !== null;
}

interface D1QueryResult<T> {
  success: boolean;
  results: T[];
  errors: { message: string }[];
}

export async function d1Query<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  // 1. Native D1 binding (fast, tokenless on Workers)
  try {
    const native = await getNativeDb();
    if (native) {
      const stmt = native.prepare(sql).bind(...params);
      const { results } = await stmt.all();
      return (results ?? []) as T[];
    }
  } catch (err) {
    console.warn("[d1] native query failed, checking REST fallback:", err);
  }

  // 2. REST API fallback
  const cfg = getRestConfig();
  if (!cfg) return [];

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`D1 query failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    errors: { message: string }[];
    result: D1QueryResult<T>[];
  };

  if (!json.success) {
    throw new Error(`D1 query failed: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  return json.result[0]?.results ?? [];
}

/**
 * Executes multiple statements in one round trip (atomic transaction).
 */
export async function d1Batch(statements: { sql: string; params: unknown[] }[]): Promise<void> {
  if (statements.length === 0) return;

  // 1. Native D1 binding
  try {
    const native = await getNativeDb();
    if (native) {
      const stmts = statements.map((s) => native.prepare(s.sql).bind(...s.params));
      await native.batch(stmts);
      return;
    }
  } catch (err) {
    console.warn("[d1] native batch failed, checking REST fallback:", err);
  }

  // 2. REST API fallback
  const cfg = getRestConfig();
  if (!cfg) return;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batch: statements }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`D1 batch failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    errors: { message: string }[];
  };

  if (!json.success) {
    throw new Error(`D1 batch failed: ${json.errors.map((e) => e.message).join("; ")}`);
  }
}
