"use client";

import { useMemo } from "react";

import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import type { ServiceHealth } from "@/features/services-monitor/types";

/**
 * Applies the filter store (search, category, sort) to the health query data.
 * Shared by the card grid and the table view.
 */
export function useFilteredServices(): {
  services: ServiceHealth[];
  isLoading: boolean;
} {
  const { data, isLoading } = useServicesHealth();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectedCategory = useFilterStore((s) => s.selectedCategory);
  const sortBy = useFilterStore((s) => s.sortBy);

  const filtered = useMemo(() => {
    const services = data?.services ?? [];
    const query = searchQuery.trim().toLowerCase();
    const matched = services.filter(
      (service) =>
        (selectedCategory === "all" || service.category === selectedCategory) &&
        (!query ||
          service.name.toLowerCase().includes(query) ||
          service.description.toLowerCase().includes(query) ||
          service.url.toLowerCase().includes(query))
    );

    return [...matched].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "latency":
          return (a.responseTime ?? Infinity) - (b.responseTime ?? Infinity);
        case "status":
          return (
            STATUS_META[a.status].order - STATUS_META[b.status].order ||
            a.name.localeCompare(b.name)
          );
      }
    });
  }, [data, searchQuery, selectedCategory, sortBy]);

  return { services: filtered, isLoading };
}
