import { CompareView } from "@/features/services-monitor/components/CompareView";

export const metadata = {
  title: "Compare portals",
  description:
    "Compare the live status and uptime history of up to three Nepal government portals side by side.",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ services?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.services)
    ? params.services.join(",")
    : (params.services ?? "");
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Compare · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Compare portals
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Pick up to three Nepali government portals and see their current
          status, 24-hour history, and 30-day reliability side by side.
        </p>
      </header>
      <CompareView initialServiceIds={ids} />
    </main>
  );
}
