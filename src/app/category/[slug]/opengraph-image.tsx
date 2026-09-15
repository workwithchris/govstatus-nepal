import { ImageResponse } from "next/og";

import seedData from "@/data/seed-services.json";
import { CATEGORY_LABELS } from "@/features/services-monitor/components/status-meta";
import { SITE_URL } from "@/lib/site";

export const alt = "IsGovOnline — Nepal government portals by category";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return [...new Set(seedData.map((service) => service.category))].map(
    (slug) => ({ slug })
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const label = CATEGORY_LABELS[slug] ?? slug;
  const count = seedData.filter((service) => service.category === slug).length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(135deg, #0a0a0a 0%, #18181b 100%)",
          color: "#fff",
          fontFamily: "geist",
        }}
      >
        <div
          style={{
            fontSize: 34,
            letterSpacing: "0.2em",
            color: "#a1a1aa",
            textTransform: "uppercase",
          }}
        >
          IsGovOnline
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
            {`${label} portals`}
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.1,
              backgroundImage:
                "linear-gradient(90deg, #007cf0 0%, #7928ca 50%, #ff0080 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            live status
          </div>
          <div style={{ fontSize: 30, color: "#a1a1aa", marginTop: 24 }}>
            {`${count} Nepal government services, checked from Nepal`}
          </div>
        </div>

        <div style={{ fontSize: 20, color: "#71717a" }}>
          {new URL(SITE_URL).hostname}
        </div>
      </div>
    ),
    { ...size }
  );
}
