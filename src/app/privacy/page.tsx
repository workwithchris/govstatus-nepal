import type { Metadata } from "next";

import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description:
    "What IsGovOnline stores and what it doesn't — no accounts, no tracking cookies.",
  path: "/privacy",
});

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "What we collect",
    body: "IsGovOnline has no accounts, sign-in, or advertising. We don't run third-party analytics or tracking cookies. Language preference and light/dark theme are kept in your browser's local storage and never sent to us.",
  },
  {
    heading: "Server logs",
    body: "Like any website, our host may log standard request metadata (IP address, user agent, timestamp) for security and reliability. These logs are short-lived and are not used to build visitor profiles.",
  },
  {
    heading: "Third-party requests",
    body: "Service logos are loaded through public favicon proxies (Google, DuckDuckGo). Those providers may see the domain being resolved, as they would for any page that embeds a favicon.",
  },
  {
    heading: "Status data",
    body: "The status shown is measured from our own probe and is public information about services, not about you. We never sell or share visitor data.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd({ name: "Privacy", path: "/privacy" })
          ),
        }}
      />
      <header className="mb-10 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Privacy · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Privacy
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
