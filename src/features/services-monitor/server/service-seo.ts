import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import type { HealthStatus, SeedService } from "@/features/services-monitor/types";

/**
 * SEO helpers for the per-service status pages (`/status/<id>`).
 * Centralized so metadata and JSON-LD stay consistent across the
 * page, and so a service's keyword surface (name, url, category) is
 * generated from one source of truth.
 */

const STATUS_SENTENCES: Record<HealthStatus, (name: string) => string> = {
  operational: (name) => `${name} is online and responding normally.`,
  degraded: (name) => `${name} is responding slowly or is partially blocked.`,
  down: (name) => `${name} is down and unreachable right now.`,
};

/** Human-readable one-liner used as the page lead paragraph. */
export function statusSentence(status: HealthStatus, name: string): string {
  return STATUS_SENTENCES[status](name);
}

/**
 * Per-service page metadata. Titles target the exact queries a citizen
 * searches: "Is <service> down?", "<name> status", "<domain> down".
 */
export function buildServiceMetadata(
  seed: SeedService,
  status: HealthStatus
): Metadata {
  const description = `Is ${seed.name} down? ${statusSentence(
    status,
    seed.name
  )} See live status, 24-hour uptime and reliability for ${seed.name} (${seed.url}). Monitored every 5 minutes from Nepal.`;

  return {
    title: `Is ${seed.name} down? Status & uptime`,
    description,
    alternates: { canonical: `/status/${seed.id}` },
    openGraph: {
      type: "website",
      url: `${SITE_URL}/status/${seed.id}`,
      siteName: "GovStatus Nepal",
      title: `Is ${seed.name} down?`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `Is ${seed.name} down?`,
      description,
    },
  };
}

/**
 * Schema.org `GovernmentService` node for the per-service page. Gives
 * Google's knowledge graph and AI engines structured facts (name, url,
 * category, provider) instead of having to parse prose.
 */
export function buildServiceJsonLd(
  seed: SeedService
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: seed.name,
    url: seed.url,
    serviceType: `Nepal government ${seed.category} portal`,
    description: seed.description,
    provider: {
      "@type": "Organization",
      name: "GovStatus Nepal",
      url: SITE_URL,
    },
    audience: { "@type": "Audience", audienceType: "Nepali citizens" },
    areaServed: { "@type": "Country", name: "Nepal" },
  };
}