"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useIncidents } from "@/features/services-monitor/api/useIncidents";
import { useDetailStore } from "@/features/services-monitor/store/useDetailStore";

function IncidentSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-2 h-3 w-32" />
        </Card>
      ))}
    </div>
  );
}

function formatWindow(startedAt: string, endedAt: string | null, ongoing: boolean) {
  const start = new Date(startedAt);
  const startLabel = start.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (ongoing || !endedAt) return `${startLabel} → now`;
  const end = new Date(endedAt);
  const endLabel = end.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startLabel} → ${endLabel}`;
}

export function IncidentsView() {
  const { data: incidents, isLoading } = useIncidents();
  const setSelectedServiceId = useDetailStore((s) => s.setSelectedServiceId);

  if (isLoading) return <IncidentSkeleton />;

  if (!incidents || incidents.length === 0) {
    return (
      <Card className="p-8 text-center">
        <TriangleAlert className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
        <p className="mt-3 text-sm font-medium text-foreground">No incidents recorded</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Non-operational runs appear here once persisted history covers them.
        </p>
      </Card>
    );
  }

  const ongoing = incidents.filter((i) => i.ongoing);
  const resolved = incidents.filter((i) => !i.ongoing);

  return (
    <div className="space-y-6">
      {ongoing.length > 0 && (
        <section>
          <p className="mb-3 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ongoing · {ongoing.length}
          </p>
          <IncidentList
            incidents={ongoing}
            onSelect={(id) => setSelectedServiceId(id)}
          />
        </section>
      )}
      <section>
        <p className="mb-3 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Resolved · last 7 days
        </p>
        <IncidentList
          incidents={resolved}
          onSelect={(id) => setSelectedServiceId(id)}
        />
      </section>
    </div>
  );
}

function IncidentList({
  incidents,
  onSelect,
}: {
  incidents: ReturnType<typeof useIncidents>["data"];
  onSelect: (serviceId: string) => void;
}) {
  if (!incidents || incidents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing here — smooth sailing.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {incidents.map((incident) => (
        <li key={incident.id}>
          <Card className="gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={incident.status === "down" ? "destructive" : "warning"}>
                {incident.status === "down" ? "Down" : "Degraded"}
              </Badge>
              <span className="text-sm font-semibold text-foreground">
                {incident.serviceName}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {incident.durationHours}h
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatWindow(incident.startedAt, incident.endedAt, incident.ongoing)}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelect(incident.serviceId)}
                className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                View service
              </button>
              <a
                href={incident.serviceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                Open site
              </a>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}