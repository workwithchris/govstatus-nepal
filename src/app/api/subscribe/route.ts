import { NextRequest } from "next/server";

import {
  addSubscriber,
  removeAllSubscriptions,
  removeSubscriber,
  subscribeSchema,
} from "@/features/services-monitor/server/subscribers";

export const dynamic = "force-dynamic";

/**
 * Public email notifications are DISABLED by default. Enable by setting
 * ENABLE_NOTIFICATIONS=true (plus EMAIL_SENDING_* / NOTIFY_FROM on the probe)
 * — otherwise the subscribe UI is hidden and this API refuses writes.
 */
const NOTIFICATIONS_ENABLED = process.env.ENABLE_NOTIFICATIONS === "true";

/** Subscribe an email to status-change notifications for one service. */
export async function POST(request: NextRequest) {
  if (!NOTIFICATIONS_ENABLED) {
    return Response.json(
      { error: "notifications disabled" },
      { status: 503 }
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const ok = await addSubscriber(parsed.data.email, parsed.data.serviceId);
  if (!ok) {
    return Response.json(
      { error: "subscriptions unavailable (D1 not configured)" },
      { status: 503 }
    );
  }
  return Response.json({ success: true });
}

/**
 * Unsubscribe. With `service` param: one service only. Without it: all
 * subscriptions for that email (one-click unsubscribe from notification mails).
 */
export async function DELETE(request: NextRequest) {
  if (!NOTIFICATIONS_ENABLED) {
    return Response.json(
      { error: "notifications disabled" },
      { status: 503 }
    );
  }
  const email = request.nextUrl.searchParams.get("email") ?? "";
  if (!subscribeSchema.shape.email.safeParse(email).success) {
    return Response.json({ error: "invalid email" }, { status: 400 });
  }
  const serviceId = request.nextUrl.searchParams.get("service") ?? "";
  if (serviceId) {
    await removeSubscriber(email, serviceId);
  } else {
    await removeAllSubscriptions(email);
  }
  return Response.json({ success: true });
}