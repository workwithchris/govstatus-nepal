"use client";

import { ArrowDownWideNarrow, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ViewToggle } from "@/features/services-monitor/components/ViewToggle";
import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import {
  sortBySchema,
  type SortBy,
} from "@/features/services-monitor/types";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "name", label: "Name" },
  { value: "latency", label: "Latency" },
];

export function SearchAndSortBar() {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search services…"
          aria-label="Search services"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
          role="group"
          aria-label="Sort services"
        >
          <ArrowDownWideNarrow
            className="ml-1.5 mr-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {SORT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              aria-pressed={sortBy === option.value}
              className={cn(
                "rounded-full px-3",
                sortBy === option.value
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground"
              )}
              onClick={() => setSortBy(sortBySchema.parse(option.value))}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <ViewToggle />
      </div>
    </div>
  );
}
