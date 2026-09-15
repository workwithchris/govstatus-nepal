import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * Per-page metadata helper. The root layout sets marketing defaults for the
 * homepage, and Next shallow-merges metadata — so a child that sets nothing
 * inherits the homepage's canonical, `og:url`, `og:title`, etc. Setting a full
 * per-page block (rather than only `title`) avoids those duplicate signals.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: `${SITE_URL}${path}`,
      siteName: "IsGovOnline",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** Schema.org BreadcrumbList for a page at `path` (includes the home crumb). */
export function breadcrumbJsonLd({
  name,
  path,
}: {
  name: string;
  path: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Dashboard",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name,
        item: `${SITE_URL}${path}`,
      },
    ],
  };
}
