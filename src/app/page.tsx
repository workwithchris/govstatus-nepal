import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import {
  HomeTabs,
  SERVICES_HEALTH_QUERY_KEY,
} from "@/features/services-monitor";
import { getServicesHealth } from "@/features/services-monitor/server/health-probe";
import { getQueryClient } from "@/lib/query-client";

// Page (with embedded health data) regenerates every minute.
export const revalidate = 60;

export default async function DashboardPage() {
  const queryClient = getQueryClient();

  // Prefetch into the shared per-request client so SSR renders with data
  // already on screen (module cache → D1 snapshot; the background probe never
  // blocks first paint). The same getQueryClient() is used by <Providers/>.
  await queryClient.prefetchQuery({
    queryKey: SERVICES_HEALTH_QUERY_KEY,
    queryFn: getServicesHealth,
  });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-10 max-w-2xl space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Real-time monitoring · Digital Nepal
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Is the government{" "}
          <span className="bg-gradient-to-r from-[#007cf0] via-[#7928ca] to-[#ff0080] bg-clip-text text-transparent">
            online
          </span>
          ?
        </h1>
        <p className="text-base text-muted-foreground">
          Live uptime and health checks for Nepal&apos;s essential citizen,
          finance, and ministry portals — refreshed every minute.
        </p>
      </header>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <HomeTabs />
      </HydrationBoundary>
    </main>
  );
}

