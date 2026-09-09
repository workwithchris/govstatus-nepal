"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceLogo } from "@/features/services-monitor/components/ServiceLogo";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { useDetailStore } from "@/features/services-monitor/store/useDetailStore";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import { useServiceHistory } from "@/features/services-monitor/api/useServiceHistory";
import {
  certDaysLeft,
  cn,
  decodeHistory,
  formatHour,
  formatLatency,
  formatTimeAgo,
} from "@/lib/utils";

function StatBox({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold text-foreground", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function TlsCertLine({ certExpiresAt }: { certExpiresAt: string | null }) {
  if (!certExpiresAt) {
    return (
      <p className="text-xs text-muted-foreground">
        TLS certificate expiry unknown
      </p>
    );
  }

  const daysLeft = certDaysLeft(certExpiresAt);
  const tone =
    daysLeft < 0
      ? "text-rose-600 dark:text-rose-400"
      : daysLeft < 30
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <p className="text-xs text-muted-foreground">
      TLS certificate expires{" "}
      <span className={cn("font-mono", tone)}>
        {new Date(certExpiresAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>{" "}
      ({daysLeft < 0 ? "expired" : `${daysLeft}d left`})
    </p>
  );
}

function LongUptimeBars({ history }: { history: NonNullable<ReturnType<typeof useServiceHistory>["data"]> }) {
  return (
    <div className="mt-3 flex items-end gap-[2px]">
      {history.map((day) => {
        const barClass =
          day.status === "down"
            ? "bg-rose-500"
            : day.status === "degraded"
              ? "bg-amber-500"
              : "bg-emerald-500";
        const height = Math.max(6, Math.round(day.uptime * 24));
        return (
          <div
            key={day.day}
            title={`${day.day} · ${(day.uptime * 100).toFixed(0)}% up`}
            className={cn("w-1.5 shrink-0 rounded-[2px] opacity-80", barClass)}
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

export function ServiceDetailDialog() {
  const selectedServiceId = useDetailStore((s) => s.selectedServiceId);
  const setSelectedServiceId = useDetailStore((s) => s.setSelectedServiceId);
  const { data } = useServicesHealth();
  const { data: longHistory } = useServiceHistory(selectedServiceId, 30);

  const service = data?.services.find((s) => s.id === selectedServiceId) ?? null;

  const longStats = useMemo(() => {
    if (!longHistory || longHistory.length === 0) return null;
    const days = longHistory.length;
    const downDays = longHistory.filter((d) => d.status === "down").length;
    const degradedDays = longHistory.filter((d) => d.status === "degraded").length;
    const weightedUptime =
      longHistory.reduce((sum, d) => sum + d.uptime, 0) / days;
    return {
      days,
      uptimePct: Math.round(weightedUptime * 1000) / 10,
      downDays,
      degradedDays,
    };
  }, [longHistory]);

  const stats = useMemo(() => {
    if (!service) return null;
    const slots = [
      ...decodeHistory(service.checkedAt, service.history, service.latencies),
    ].reverse();
    const lastUpSlot = slots.find((slot) => slot.status === "operational");
    const known = slots.filter((slot) => slot.status !== null);
    const latencies = known
      .map((slot) => slot.responseTime)
      .filter((time): time is number => time !== null);

    return {
      lastUp:
        service.status === "operational"
          ? "Up now (live)"
          : lastUpSlot
            ? `${formatHour(lastUpSlot.timestamp)} · ${formatTimeAgo(lastUpSlot.timestamp)}`
            : "No data in window",
      downCount: slots.filter((slot) => slot.status === "down").length,
      degradedCount: slots.filter((slot) => slot.status === "degraded").length,
      avgLatency:
        latencies.length > 0
          ? Math.round(
              latencies.reduce((sum, time) => sum + time, 0) / latencies.length
            )
          : null,
      timeline: slots,
    };
  }, [service]);

  return (
    <Dialog
      open={!!service}
      onOpenChange={(open) => !open && setSelectedServiceId(null)}
    >
      <DialogContent>
        {service && stats && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 pr-8">
              <ServiceLogo url={service.url} name={service.name} />
              <div className="min-w-0 space-y-1">
                <DialogTitle>{service.name}</DialogTitle>
                <DialogDescription className="line-clamp-2">
                  {service.description}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={STATUS_META[service.status].badge}>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    STATUS_META[service.status].dot
                  )}
                  aria-hidden
                />
                {STATUS_META[service.status].label}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                http {service.httpStatus ?? "—"} · {formatLatency(service.responseTime)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Last up" value={stats.lastUp} />
              <StatBox
                label="Avg latency · 24h"
                value={formatLatency(stats.avgLatency)}
              />
              <StatBox
                label="Down · 24h"
                value={`${stats.downCount} hour${stats.downCount === 1 ? "" : "s"}`}
                valueClass={stats.downCount > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
              />
              <StatBox
                label="Degraded · 24h"
                value={`${stats.degradedCount} hour${stats.degradedCount === 1 ? "" : "s"}`}
                valueClass={
                  stats.degradedCount > 0 ? "text-amber-600 dark:text-amber-400" : undefined
                }
              />
            </div>

            {longStats && (
              <div>
                <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Last {longStats.days} days
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <StatBox
                    label="Uptime"
                    value={`${longStats.uptimePct.toFixed(1)}%`}
                    valueClass={
                      longStats.uptimePct >= 99
                        ? "text-emerald-600 dark:text-emerald-400"
                        : longStats.uptimePct >= 95
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400"
                    }
                  />
                  <StatBox
                    label="Days down"
                    value={`${longStats.downDays}`}
                    valueClass={
                      longStats.downDays > 0 ? "text-rose-600 dark:text-rose-400" : undefined
                    }
                  />
                  <StatBox
                    label="Days degraded"
                    value={`${longStats.degradedDays}`}
                    valueClass={
                      longStats.degradedDays > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : undefined
                    }
                  />
                </div>
                <LongUptimeBars history={longHistory ?? []} />
              </div>
            )}

            <div>
              <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Hourly timeline · last 24h
              </p>
              <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {stats.timeline.map((slot) => {
                  const meta = slot.status ? STATUS_META[slot.status] : null;
                  return (
                    <li
                      key={slot.timestamp}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          meta ? meta.dot : "bg-muted-foreground/40"
                        )}
                        aria-hidden
                      />
                      <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatHour(slot.timestamp)}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          meta ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {meta ? meta.label : "No data"}
                      </span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {formatLatency(slot.responseTime)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              Last checked {formatTimeAgo(service.checkedAt)}
            </p>

            <TlsCertLine certExpiresAt={service.certExpiresAt} />

            <Button size="sm" asChild>
              <a
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-3.5" />
                Open {new URL(service.url).hostname}
              </a>
            </Button>

            <EmbedSnippet serviceId={service.id} name={service.name} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Email subscription UI is disabled for now (see /api/subscribe). Re-enable
// by rendering <SubscribeForm serviceId={...} serviceName={...} /> here and
// setting ENABLE_NOTIFICATIONS=true + email env vars.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SubscribeForm({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const subscribe = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email address.");
      setState("error");
      return;
    }
    setState("saving");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, serviceId }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setState("done");
      setMessage(`You'll be emailed when ${serviceName} changes status.`);
    } catch {
      setState("error");
      setMessage("Couldn't subscribe — notifications unavailable right now.");
    }
  };

  return (
    <div className="space-y-1.5 border-t border-border pt-4">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Get notified on status change
      </p>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for status notifications"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50"
        />
        <Button size="sm" onClick={subscribe} disabled={state === "saving"}>
          {state === "saving" ? "Subscribing…" : "Notify me"}
        </Button>
      </div>
      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}

function EmbedSnippet({ serviceId, name }: { serviceId: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<iframe src="https://govstatusnepal.techyatraa.com/embed/${serviceId}" width="380" height="160" style="border:0;border-radius:12px" loading="lazy" title="${name} status"></iframe>`;

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Embed this service
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
          {snippet}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
