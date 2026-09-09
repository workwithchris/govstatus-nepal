import { getServicesHealth } from "@/features/services-monitor/server/health-probe";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { decodeHistory } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 60;

// Embeddable single-service widget (no JS). Copy the iframe snippet from the
// detail dialog. Rendered server-side so it works inside any third-party page.
export default async function EmbedPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const { services } = await getServicesHealth();
  const service = services.find((s) => s.id === serviceId);

  if (!service) {
    return (
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 16,
          fontSize: 13,
          color: "#555",
        }}
      >
        Service not found.
      </div>
    );
  }

  const meta = STATUS_META[service.status];
  const slots = decodeHistory(service.checkedAt, service.history, service.latencies);
  const dotColor = meta.dot.includes("emerald")
    ? "#10b981"
    : meta.dot.includes("amber")
      ? "#f59e0b"
      : "#f43f5e";

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        maxWidth: 360,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: dotColor,
            display: "inline-block",
          }}
        />
        <strong style={{ fontSize: 13, color: "#111" }}>{service.name}</strong>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: meta.badge === "success" ? "#059669" : meta.badge === "warning" ? "#d97706" : "#e11d48" }}>
        {meta.label} · {service.uptimePercentage.toFixed(1)}% uptime (24h)
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 12, alignItems: "flex-end", height: 28 }}>
        {slots.map((slot, i) => {
          const color = !slot.status
            ? "#e5e5e5"
            : slot.status === "operational"
              ? "#10b981"
              : slot.status === "degraded"
                ? "#f59e0b"
                : "#f43f5e";
          return (
            <div
              key={i}
              title={slot.status ?? "no data"}
              style={{
                flex: 1,
                borderRadius: 2,
                background: color,
                height: slot.status === "down" ? 28 : slot.status === "degraded" ? 20 : 12,
              }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
        Last checked {new Date(service.checkedAt).toLocaleString()}
      </div>
      <a
        href={SITE_URL}
        style={{ display: "block", marginTop: 8, fontSize: 11, color: "#0070f3", textDecoration: "none" }}
      >
        GovStatus Nepal
      </a>
    </div>
  );
}