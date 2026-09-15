"use client";

import { useMemo } from "react";
import {
  Banknote,
  Briefcase,
  Building,
  Building2,
  GraduationCap,
  Landmark,
  LayoutGrid,
  Map as MapIcon,
  Server,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CATEGORY_LABELS } from "@/features/services-monitor/components/status-meta";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import {
  categoryFilterSchema,
  type CategoryFilter,
} from "@/features/services-monitor/types";

const FILTER_ORDER: CategoryFilter[] = [
  "all",
  "core",
  "citizen",
  "education",
  "finance",
  "business",
  "ministry",
  "province",
  "palika",
  "infrastructure",
];

const CATEGORY_ICON: Record<CategoryFilter, LucideIcon> = {
  all: LayoutGrid,
  core: Landmark,
  citizen: Users,
  education: GraduationCap,
  finance: Banknote,
  business: Briefcase,
  ministry: Building2,
  province: MapIcon,
  palika: Building,
  infrastructure: Server,
};

export function CategoryFilters() {
  const selectedCategory = useFilterStore((s) => s.selectedCategory);
  const setSelectedCategory = useFilterStore((s) => s.setSelectedCategory);
  const { data, isLoading } = useServicesHealth();

  const counts = useMemo(() => {
    const result = new Map<CategoryFilter, number>([
      ["all", data?.services.length ?? 0],
    ]);
    for (const service of data?.services ?? []) {
      result.set(service.category, (result.get(service.category) ?? 0) + 1);
    }
    return result;
  }, [data]);

  return (
    <Tabs
      value={selectedCategory}
      onValueChange={(value) =>
        setSelectedCategory(categoryFilterSchema.parse(value))
      }
    >
      <TabsList aria-label="Filter services by category">
        {FILTER_ORDER.map((category) => {
          const Icon = CATEGORY_ICON[category];
          return (
            <TabsTrigger key={category} value={category} disabled={isLoading}>
              <Icon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              {category === "all" ? "All" : CATEGORY_LABELS[category]}
              <span className="font-mono text-xs text-muted-foreground">
                {counts.get(category) ?? 0}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
