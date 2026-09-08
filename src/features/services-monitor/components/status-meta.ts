import type { HealthStatus } from "@/features/services-monitor/types";

interface StatusMeta {
  label: string;
  badge: "success" | "warning" | "destructive";
  dot: string;
  bar: string;
  edge: string;
  order: number;
}

export const STATUS_META: Record<HealthStatus, StatusMeta> = {
  operational: {
    label: "Operational",
    badge: "success",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    edge: "border-l-emerald-500",
    order: 2,
  },
  degraded: {
    label: "Degraded",
    badge: "warning",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    edge: "border-l-amber-500",
    order: 1,
  },
  down: {
    label: "Down",
    badge: "destructive",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    edge: "border-l-rose-500",
    order: 0,
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  citizen: "Citizen",
  finance: "Finance",
  business: "Business",
  ministry: "Ministry",
  palika: "Palika",
  core: "Core",
};
