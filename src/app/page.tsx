import { HomeTabs } from "@/features/services-monitor";
import { ProvenanceBanner } from "@/features/services-monitor/components/ProvenanceBanner";
import { CATEGORY_LABELS } from "@/features/services-monitor/components/status-meta";
import { serviceCategorySchema } from "@/features/services-monitor/types";
import { SITE_URL } from "@/lib/site";
import seedData from "@/data/seed-services.json";

// Fully static: the shell is served instantly from the CDN edge cache and
// all live data is fetched client-side by React Query (which re-renders on
// data arrival — the metric cards and tables have their own skeletons).
// Keeps per-request work off the Worker and out of D1.
export default function DashboardPage() {
  const byCategory = seedData.reduce<Record<string, typeof seedData>>(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {}
  );

  const knownOrder = serviceCategorySchema.options;
  const knownCategories = knownOrder.filter((c) => byCategory[c]);
  const extraCategories = Object.keys(byCategory).filter(
    (c) => !knownOrder.includes(c as (typeof knownOrder)[number])
  );
  const categories = [...knownCategories, ...extraCategories];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Nepal government portal status",
    description:
      "Live uptime and health status for Nepal's government portals and digital public services.",
    itemListElement: seedData.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      url: `${SITE_URL}/status/${s.id}`,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

      {/* Server-rendered SEO content: crawlable keyword text + internal links */}
      <section className="mt-16 border-t border-border pt-10">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
          Nepal government portal status — every service we monitor
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          GovStatus Nepal checks {seedData.length} Nepali government websites
          and digital public services every 5 minutes from a Nepal vantage
          point — passports, tax filing, driving licenses, land records, NEPSE,
          ministries, universities, and municipalities. Each service has a
          dedicated status page answering &quot;is it down?&quot; with live
          status, 24-hour uptime bars, latency, and confirmed outage alerts.
          See an outage that matters to you? Each status page carries the full
          24-hour and long-term reliability record.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => {
            const services = byCategory[category];
            const label = CATEGORY_LABELS[category] ?? category;
            return (
              <div key={category}>
                <h3 className="flex items-baseline justify-between gap-2 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                  <span className="font-mono text-[10px] normal-case tracking-normal text-muted-foreground/60">
                    {services.length}
                  </span>
                </h3>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {services.map((service) => (
                    <li key={service.id}>
                      <a
                        href={`/status/${service.id}`}
                        className="text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-2"
                      >
                        {service.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}