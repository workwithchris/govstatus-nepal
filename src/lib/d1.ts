import { z } from "zod";

/**
 * Minimal Cloudflare D1 REST client.
 *
 * Works from any runtime (Node, OpenNext/Workers) without a native binding.
 * When env vars are missing the app degrades gracefully: status history is
 * simulated instead of persisted. Create an API token with "D1: Edit" at
 * https://dash.cloudflare.com/profile/api-tokens
 */

const d1EnvSchema = z.object({
  accountId: z.string().min(1),
  databaseId: z.string().min(1),
  apiToken: z.string().min(1),
});

const parsed = d1EnvSchema.safeParse({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
});

export const d1Config: z.infer<typeof d1EnvSchema> | null =
  parsed.success &&
  !parsed.data.apiToken.startsWith("replace-me")
    ? parsed.data
    : null;

interface D1QueryResult<T> {
  success: boolean;
  results: T[];
  errors: { message: string }[];
}

export async function d1Query<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!d1Config) return [];

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${d1Config.accountId}/d1/database/${d1Config.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${d1Config.apiToken}`,
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
  if (!d1Config || statements.length === 0) return;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${d1Config.accountId}/d1/database/${d1Config.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${d1Config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(statements),
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
