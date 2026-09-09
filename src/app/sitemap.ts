import type { MetadataRoute } from "next";

const SITE_URL = "https://govstatusnepal.techyatraa.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/feed.xml`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.3,
    },
  ];
}