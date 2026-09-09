import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { decodeHistory } from "@/lib/utils";
import seedData from "@/data/seed-services.json";
import { seedServiceSchema } from "@/features/services-monitor/types";
import { getServicesHealth } from "@/features/services-monitor/server/health-probe";
import { ServiceHistoryRange } from "@/features/services-monitor/components/ServiceHistoryRange";
import { ReliabilitySummary } from "@/features/services-monitor/components/ReliabilitySummary";
import {
  buildServiceJsonLd,
  buildServiceMetadata,
  statusSentence,
} from "@/features/services-monitor/server/service-seo";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";

// Rendered per request (module cache dedupes the D1 read across requests —
// same pattern as the embed widget and /api/health). Every request still
// returns complete crawlable HTML; the CDN + D1 snapshot cache absorb load.
export const dynamic = "force-dynamic";

const seeds = seedServiceSchema.array().parse(seedData);

type Props = { params: Promise<{ serviceId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { serviceId } = await params;
  const service = seeds.find((s) => s.id === serviceId);

  if (!service) return { title: "Service not found" };

  // Live status feeds the metadata so the SERP snippet mirrors reality.
  const { services } = await getServicesHealth();
  const live = services.find((s) => s.id === serviceId);
  return buildServiceMetadata(service, live?.status ?? "operational");
}

export default async function ServiceStatusPage({ params }: Props) {
  const { serviceId } = await params;
  const { services } = await getServicesHealth();
  const service = services.find((s) => s.id === serviceId);

  const seed = seeds.find((s) => s.id === serviceId);
  if (!service || !seed) notFound();

  const meta = STATUS_META[service.status];
  const slots = decodeHistory(service.checkedAt, service.history, service.latencies);
  const statusText = statusSentence(service.status, service.name);
  const jsonLd = buildServiceJsonLd(seed);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/"
        className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        ← All Nepal government portals
      </Link>

      <header className="mt-4 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {seed.category} · Monitored every 5 minutes from Nepal
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Is {service.name} down?
        </h1>
        <p className="text-base text-muted-foreground">{statusText}</p>
      </header>

      {/* Server-rendered live status (ISR, refreshed every 60s) */}
      <section className="mt-8 rounded-lg border border-border p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 rounded-full ${meta.dot}`}
              aria-hidden
            />
            <span className="text-lg font-semibold text-foreground">
              {meta.label}
            </span>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs uppercase tracking-wide">Latency</dt>
              <dd className="font-semibold text-foreground">
                {service.responseTime === null
                  ? "—"
                  : `${Math.round(service.responseTime)} ms`}
              </dd>
            </div>
            {service.httpStatus !== null && (
              <div className="flex items-baseline gap-1.5">
                <dt className="text-xs uppercase tracking-wide">HTTP</dt>
                <dd className="font-semibold text-foreground">
                  {service.httpStatus}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <ServiceHistoryRange
          serviceId={service.id}
          serviceName={service.name}
          initialSlots={slots}
        />

        <p className="mt-3 text-xs text-muted-foreground">
          Last checked{" "}
          {new Date(service.checkedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          . Measured from a Nepal vantage point every 5 minutes.
        </p>
      </section>

      <ReliabilitySummary serviceId={service.id} />

      {/* Crawlable static context */}
      <section className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          About {service.name}
        </h2>
        <p>
          {service.description}. This page tracks the live availability of{" "}
          {service.name} at{" "}
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {service.url}
          </a>
          , part of IsGovOnline&apos;s {seed.category} category.
        </p>
        <p>
          Every 5 minutes the service is checked from a Nepal vantage point and
          reported as{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            operational
          </span>
          ,{" "}
          <span className="font-medium text-amber-600 dark:text-amber-400">
            degraded
          </span>
          , or{" "}
          <span className="font-medium text-rose-600 dark:text-rose-400">
            down
          </span>
          . A &quot;down&quot; reading is confirmed with a second probe before
          it&apos;s reported, to cut false alarms on flaky infrastructure.
        </p>
        <p>
          Uptime percentages are honest: they only count hours with recorded
          data, and an hour counts as down if any check in that hour failed —
          a one-minute blip is never hidden.
        </p>
      </section>

      <nav className="mt-10 flex flex-wrap gap-2 text-sm">
        <Link
          href="/"
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Full dashboard
        </Link>
        <Link
          href="/about"
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          How status is measured
        </Link>
        <Link
          href="/methodology"
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Methodology
        </Link>
        <Link
          href="/worst"
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Reliability ranking
        </Link>
        <a
          href="/feed.xml"
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Incident feed (RSS)
        </a>
      </nav>
    </main>
  );
}