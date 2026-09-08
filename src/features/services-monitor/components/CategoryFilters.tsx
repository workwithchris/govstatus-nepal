"use client";

import { useMemo } from "react";

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
  "citizen",
  "finance",
  "business",
  "ministry",
  "palika",
  "core",
];

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
        {FILTER_ORDER.map((category) => (
          <TabsTrigger key={category} value={category} disabled={isLoading}>
            {category === "all" ? "All" : CATEGORY_LABELS[category]}
            <span className="font-mono text-xs text-muted-foreground">
              {counts.get(category) ?? 0}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
