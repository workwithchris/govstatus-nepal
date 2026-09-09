import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";
import seedData from "@/data/seed-services.json";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const servicePages: MetadataRoute.Sitemap = seedData.map((service) => ({
    url: `${SITE_URL}/status/${service.id}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...servicePages,
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/feed.xml`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.3,
    },
  ];
}