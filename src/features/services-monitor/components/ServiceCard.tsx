"use client";

import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UptimeBar } from "@/features/services-monitor/components/UptimeBar";
import {
  CATEGORY_LABELS,
  STATUS_META,
} from "@/features/services-monitor/components/status-meta";
import { ServiceLogo } from "@/features/services-monitor/components/ServiceLogo";
import { useDetailStore } from "@/features/services-monitor/store/useDetailStore";
import type { ServiceHealth } from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

interface ServiceCardProps {
  service: ServiceHealth;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const meta = STATUS_META[service.status];
  const setSelectedServiceId = useDetailStore((s) => s.setSelectedServiceId);

  const select = () => setSelectedServiceId(service.id);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={select}
      onKeyDown={(e) => {
        // Ignore keys originating from the nested external link so keyboard
        // users can still activate it (Enter would otherwise be swallowed).
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      }}
      className="cursor-pointer gap-0 p-0 transition-shadow hover:shadow-[0_1px_1px_rgba(0,0,0,0.04),0_8px_16px_-4px_rgba(0,0,0,0.08)] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex-1 p-4 pb-3 sm:p-6 sm:pb-4">
        <div className="flex items-start gap-3">
          <ServiceLogo url={service.url} name={service.name} />
          <div className="min-w-0 space-y-1.5">
            <h3 className="line-clamp-2 text-base font-semibold leading-6 tracking-[-0.02em] text-foreground sm:text-lg sm:leading-7">
              {service.name}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant={meta.badge}>
                <span
                  className={cn("size-1.5 rounded-full", meta.dot)}
                  aria-hidden
                />
                {meta.label}
              </Badge>
              <a
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${service.name} in a new tab`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground sm:mt-3">
          {service.description}
        </p>
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="mb-2.5 flex items-center justify-between gap-3 sm:mb-3">
          <Badge variant="secondary">
            {CATEGORY_LABELS[service.category] ?? service.category}
          </Badge>
          <p className="font-mono text-[10px] text-muted-foreground sm:text-[11px]">
            {formatLatency(service.responseTime)}
            <span className="mx-1.5">·</span>
            {service.uptimePercentage.toFixed(1)}% uptime
          </p>
        </div>
        <UptimeBar
          service={service}
          className="h-4 sm:h-5"
        />
      </div>
    </Card>
  );
}
