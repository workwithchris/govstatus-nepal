import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import seedData from "@/data/seed-services.json";
import { getServicesHealth } from "@/features/services-monitor/server/health-probe";
import {
  CATEGORY_LABELS,
  STATUS_META,
} from "@/features/services-monitor/components/status-meta";
import {
  seedServiceSchema,
  serviceCategorySchema,
} from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const seeds = seedServiceSchema.array().parse(seedData);
const categoryOrder = serviceCategorySchema.options;

type Props = { params: Promise<{ slug: string }> };

function statusRank(status: string): number {
  if (status === "down") return 0;
  if (status === "degraded") return 1;
  return 2;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = serviceCategorySchema.safeParse(slug).data;
  if (!category) return { title: "Category not found" };
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    title: `${label} portals — live status`,
    description: `Live uptime and health status for Nepal's ${label.toLowerCase()} government portals and digital public services, checked every 5 minutes from Nepal.`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = serviceCategorySchema.safeParse(slug).data;
  if (!category) notFound();

  const label = CATEGORY_LABELS[category] ?? category;
  const { services } = await getServicesHealth();
  const members = services
    .filter((service) => service.category === category)
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        a.name.localeCompare(b.name)
    );

  const operational = members.filter((s) => s.status === "operational").length;
  const degraded = members.filter((s) => s.status === "degraded").length;
  const down = members.filter((s) => s.status === "down").length;

  const siblings = categoryOrder.filter(
    (c) => c !== category && seeds.some((s) => s.category === c)
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Category · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          {label} portals
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {members.length} {label.toLowerCase()} services monitored every 5
          minutes from Nepal — {operational} operational, {degraded} degraded,{" "}
          {down} down right now.
        </p>
      </header>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No services in this category yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((service) => {
            const meta = STATUS_META[service.status];
            return (
              <li key={service.id}>
                <Link
                  href={`/status/${service.id}`}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <span
                    className={cn("size-2 shrink-0 rounded-full", meta.dot)}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {service.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {service.description}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                    {formatLatency(service.responseTime)}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold text-muted-foreground">
                    {service.uptimePercentage.toFixed(1)}%
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-sm text-muted-foreground">
        See how status is measured on the{" "}
        <Link
          href="/methodology"
          className="text-primary underline underline-offset-2"
        >
          methodology page
        </Link>
        , or view the{" "}
        <Link href="/worst" className="text-primary underline underline-offset-2">
          least reliable portals
        </Link>
        .
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Other categories">
        {siblings.map((c) => (
          <Link
            key={c}
            href={`/category/${c}`}
            className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {CATEGORY_LABELS[c] ?? c}
          </Link>
        ))}
      </nav>
    </main>
  );
}
