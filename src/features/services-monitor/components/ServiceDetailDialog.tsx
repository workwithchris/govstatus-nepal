"use client";

import { useMemo } from "react";
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

export function ServiceDetailDialog() {
  const selectedServiceId = useDetailStore((s) => s.selectedServiceId);
  const setSelectedServiceId = useDetailStore((s) => s.setSelectedServiceId);
  const { data } = useServicesHealth();

  const service = data?.services.find((s) => s.id === selectedServiceId) ?? null;

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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
