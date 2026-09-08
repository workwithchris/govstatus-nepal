"use client";

import { Card } from "@/components/ui/card";
import { ProbeLoader } from "@/features/services-monitor/components/ProbeLoader";
import {
  CategoryUptimeChart,
  IncidentChart,
  LatencyTrendChart,
  SlowestServices,
} from "@/features/services-monitor/components/analytics/charts";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";

function ChartCard({
  title,
  caption,
  children,
  className,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-6 ${className ?? ""}`}>
      <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function AnalyticsView() {
  const { data, isLoading } = useServicesHealth();
  const services = data?.services ?? [];

  if (isLoading || services.length === 0) {
    return <ProbeLoader variant="compact" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Response time trend"
          caption="Average latency across all services · last 24h"
          className="lg:col-span-2"
        >
          <LatencyTrendChart services={services} />
        </ChartCard>

        <ChartCard
          title="Incidents per hour"
          caption="Services down or degraded at each hour · last 24h"
        >
          <IncidentChart services={services} />
        </ChartCard>

        <ChartCard
          title="Uptime by category"
          caption="Average 24h availability per category"
        >
          <CategoryUptimeChart services={services} />
        </ChartCard>

        <ChartCard
          title="Least reliable · 24h"
          caption="Bottom 5 services by uptime percentage"
          className="lg:col-span-2"
        >
          <SlowestServices services={services} />
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">
        Aggregated from the persisted per-service status history recorded every
        probe cycle.
      </p>
    </div>
  );
}
