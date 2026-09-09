import { ImageResponse } from "next/og";

import seedData from "@/data/seed-services.json";
import { SITE_URL } from "@/lib/site";

export const alt = "IsGovOnline — live government portal status";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return seedData.map((service) => ({ serviceId: service.id }));
}

export default function Image({ params }: { params: { serviceId: string } }) {
  const service = seedData.find((s) => s.id === params.serviceId);

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
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15 }}>
            {service ? `Is ${service.name} down?` : "Government portal status"}
          </div>
          <div style={{ fontSize: 26, color: "#a1a1aa", marginTop: 20 }}>
            {service
              ? `${service.url} · live uptime, checked every 5 minutes from Nepal`
              : "Live uptime for Nepal's government portals"}
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