"use client";

import { ServiceDetailDialog } from "@/features/services-monitor/components/ServiceDetailDialog";
import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import { ServiceGrid } from "@/features/services-monitor/components/ServiceGrid";
import { ServiceTable } from "@/features/services-monitor/components/ServiceTable";

export function ServicesView() {
  const view = useFilterStore((s) => s.view);
  return (
    <>
      {view === "table" ? (
        <>
          {/* The wide table doesn't fit a phone viewport; fall back to the
              stacked cards so every column stays in view without scrolling. */}
          <div className="lg:hidden">
            <ServiceGrid />
          </div>
          <div className="hidden lg:block">
            <ServiceTable />
          </div>
        </>
      ) : (
        <ServiceGrid />
      )}
      <ServiceDetailDialog />
    </>
  );
}
