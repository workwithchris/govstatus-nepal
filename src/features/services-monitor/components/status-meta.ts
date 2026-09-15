import { CircleCheck, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";

import type { HealthStatus } from "@/features/services-monitor/types";

interface StatusMeta {
  label: string;
  badge: "success" | "warning" | "destructive";
  dot: string;
  bar: string;
  edge: string;
  order: number;
  icon: LucideIcon;
  text: string;
}

export const STATUS_META: Record<HealthStatus, StatusMeta> = {
  operational: {
    label: "Operational",
    badge: "success",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    edge: "border-l-emerald-500",
    order: 2,
    icon: CircleCheck,
    text: "text-emerald-600 dark:text-emerald-400",
  },
  degraded: {
    label: "Degraded",
    badge: "warning",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    edge: "border-l-amber-500",
    order: 1,
    icon: TriangleAlert,
    text: "text-amber-600 dark:text-amber-400",
  },
  down: {
    label: "Down",
    badge: "destructive",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    edge: "border-l-rose-500",
    order: 0,
    icon: CircleX,
    text: "text-rose-600 dark:text-rose-400",
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  citizen: "Citizen",
  education: "Education",
  finance: "Finance",
  business: "Business",
  ministry: "Ministry",
  province: "Province",
  palika: "Palika",
  core: "Core",
  infrastructure: "Infrastructure",
};
