"use client";

import { ServiceDetailDialog } from "@/features/services-monitor/components/ServiceDetailDialog";
import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import { ServiceGrid } from "@/features/services-monitor/components/ServiceGrid";
import { ServiceTable } from "@/features/services-monitor/components/ServiceTable";

export function ServicesView() {
  const view = useFilterStore((s) => s.view);
  return (
    <>
      {view === "table" ? <ServiceTable /> : <ServiceGrid />}
      <ServiceDetailDialog />
    </>
  );
}
