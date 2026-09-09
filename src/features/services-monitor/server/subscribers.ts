import { z } from "zod";

import { d1Config, d1Query } from "@/lib/d1";

export const subscribeSchema = z.object({
  email: z.string().email(),
  serviceId: z.string().min(1),
});

/** Subscribers for a given service (emails). */
export async function getSubscribers(serviceId: string): Promise<string[]> {
  if (!d1Config) return [];
  try {
    const rows = await d1Query<{ email: string }>(
      `SELECT email FROM subscribers WHERE service_id = ?`,
      [serviceId]
    );
    return rows.map((row) => row.email);
  } catch (err) {
    console.error("[govstatus] subscribers read failed:", err);
    return [];
  }
}

/** Add a subscription (idempotent). Returns false when D1 is unavailable. */
export async function addSubscriber(email: string, serviceId: string): Promise<boolean> {
  if (!d1Config) return false;
  try {
    const { d1Batch } = await import("@/lib/d1");
    await d1Batch([
      {
        sql: `INSERT OR IGNORE INTO subscribers (email, service_id, created_at_ms)
              VALUES (?, ?, ?)`,
        params: [email, serviceId, Date.now()],
      },
    ]);
    return true;
  } catch (err) {
    console.error("[govstatus] add subscriber failed:", err);
    return false;
  }
}

/** Remove a subscription (idempotent). Returns false when D1 is unavailable. */
export async function removeSubscriber(email: string, serviceId: string): Promise<boolean> {
  if (!d1Config) return false;
  try {
    const { d1Batch } = await import("@/lib/d1");
    await d1Batch([
      {
        sql: `DELETE FROM subscribers WHERE email = ? AND service_id = ?`,
        params: [email, serviceId],
      },
    ]);
    return true;
  } catch (err) {
    console.error("[govstatus] remove subscriber failed:", err);
    return false;
  }
}

/** Remove all subscriptions for an email (one-click unsubscribe). */
export async function removeAllSubscriptions(email: string): Promise<boolean> {
  if (!d1Config) return false;
  try {
    const { d1Batch } = await import("@/lib/d1");
    await d1Batch([
      {
        sql: `DELETE FROM subscribers WHERE email = ?`,
        params: [email],
      },
    ]);
    return true;
  } catch (err) {
    console.error("[govstatus] remove all subscriptions failed:", err);
    return false;
  }
}