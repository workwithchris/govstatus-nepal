import type { MetadataRoute } from "next";

import { SITE_URL, STATUS_PAGES_ENABLED } from "@/lib/site";
import seedData from "@/data/seed-services.json";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const servicePages: MetadataRoute.Sitemap = STATUS_PAGES_ENABLED
    ? seedData.map((service) => ({
        url: `${SITE_URL}/status/${service.id}`,
        lastModified: now,
        changeFrequency: "hourly",
        priority: 0.8,
      }))
    : [];

  const categories = [...new Set(seedData.map((service) => service.category))];
  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${SITE_URL}/category/${category}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...servicePages,
    ...categoryPages,
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/methodology`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
