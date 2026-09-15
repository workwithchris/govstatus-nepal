import type { Metadata } from "next";

import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  description:
    "Terms of use for IsGovOnline — an independent, informational uptime tracker for Nepal's government portals.",
  path: "/terms",
});

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Informational only",
    body: "IsGovOnline is an independent, non-governmental project. Status readings are provided for information only and come with no warranty of accuracy, availability, or fitness for any purpose.",
  },
  {
    heading: "Vantage-relative readings",
    body: "Status is measured from a probe's vantage point. A service may appear down here while it works from your network, or vice versa. Don't rely on this site for decisions with legal or financial consequences.",
  },
  {
    heading: "Not affiliated",
    body: "We are not affiliated with, endorsed by, or acting on behalf of any government body or the services we monitor. All trademarks and names belong to their respective owners.",
  },
  {
    heading: "Fair use",
    body: "You may link to and cite the site. Automated scraping that degrades the service for others is not permitted. The public API may change or be rate-limited at any time.",
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd({ name: "Terms", path: "/terms" })
          ),
        }}
      />
      <header className="mb-10 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Terms · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Terms of use
        </h1>
      </header>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
              {section.heading}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
