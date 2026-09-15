"use client";

import { EmptyState } from "@/features/services-monitor/components/EmptyState";
import { ErrorState } from "@/features/services-monitor/components/ErrorState";
import { ProbeLoader } from "@/features/services-monitor/components/ProbeLoader";
import { ServiceCard } from "@/features/services-monitor/components/ServiceCard";
import { useFilteredServices } from "@/features/services-monitor/api/useFilteredServices";

export function ServiceGrid() {
  const { services, isLoading, isError, refetch } = useFilteredServices();

  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  if (isLoading) {
    return <ProbeLoader variant="compact" />;
  }

  if (services.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      id="services"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </div>
  );
}
