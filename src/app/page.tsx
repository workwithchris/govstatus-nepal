import { HomeTabs } from "@/features/services-monitor";
import { ProvenanceBanner } from "@/features/services-monitor/components/ProvenanceBanner";

// Fully static: the shell is served instantly from the CDN edge cache and
// all live data is fetched client-side by React Query (which re-renders on
// data arrival — the metric cards and tables have their own skeletons).
// Keeps per-request work off the Worker and out of D1.
export default function DashboardPage() {
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
          finance, and ministry portals — refreshed every 5 minutes.
        </p>
        <ProvenanceBanner />
      </header>

      <HomeTabs />
    </main>
  );
}