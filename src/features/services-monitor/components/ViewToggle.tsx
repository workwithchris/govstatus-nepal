"use client";

import { LayoutGrid, Table } from "lucide-react";

import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "grid", label: "Card grid view", Icon: LayoutGrid },
  { key: "table", label: "Table view", Icon: Table },
] as const;

export function ViewToggle() {
  const view = useFilterStore((s) => s.view);
  const setView = useFilterStore((s) => s.setView);

  return (
    <div
      // The table view is only rendered on lg+ screens (ServicesView), so the
      // toggle is meaningless on smaller viewports.
      className="hidden items-center gap-0.5 rounded-full border border-border bg-card p-0.5 lg:flex"
      role="group"
      aria-label="Switch view"
    >
      {VIEWS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={view === key}
          onClick={() => setView(key)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full transition-colors",
            view === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
