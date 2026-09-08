"use client";

import { SearchX } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <SearchX className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">No services found</p>
        <p className="text-sm text-muted-foreground">
          Try a different search term or category.
        </p>
      </div>
    </div>
  );
}
