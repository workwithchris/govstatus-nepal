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
import type { ServiceHealth } from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

interface ServiceCardProps {
  service: ServiceHealth;
}

export function ServiceCard({ service }: ServiceCardProps) {
  const meta = STATUS_META[service.status];

  return (
    <Card className="gap-0 p-0">
      <div className="flex-1 p-6 pb-4">
        <div className="flex items-start gap-3">
          <ServiceLogo url={service.url} name={service.name} />
          <div className="min-w-0 space-y-1.5">
            <h3 className="line-clamp-2 text-lg font-semibold leading-7 tracking-[-0.02em] text-foreground">
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
                className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {service.description}
        </p>
      </div>

      <div className="border-t border-border px-6 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Badge variant="secondary">
            {CATEGORY_LABELS[service.category] ?? service.category}
          </Badge>
          <p className="font-mono text-[11px] text-muted-foreground">
            {formatLatency(service.responseTime)}
            <span className="mx-1.5">·</span>
            {service.uptimePercentage.toFixed(1)}% uptime
          </p>
        </div>
        <UptimeBar
          slots={service.uptime24h}
          label={service.name}
          className="h-5"
        />
      </div>
    </Card>
  );
}
