import { ImageResponse } from "next/og";

import seedData from "@/data/seed-services.json";
import { SITE_URL } from "@/lib/site";

export const alt = "IsGovOnline — Is the government online?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
            Is the government
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
            online?
          </div>
          <div style={{ fontSize: 30, color: "#a1a1aa", marginTop: 24 }}>
            Real-time uptime for {seedData.length} Nepal government portals
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "#a1a1aa",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              backgroundColor: "#10b981",
              display: "flex",
            }}
          />
          <span>operational</span>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              backgroundColor: "#f59e0b",
              display: "flex",
              marginLeft: 32,
            }}
          />
          <span>degraded</span>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              backgroundColor: "#f43f5e",
              display: "flex",
              marginLeft: 32,
            }}
          />
          <span>down</span>
        </div>

        <div style={{ fontSize: 20, color: "#71717a" }}>
          {new URL(SITE_URL).hostname}
        </div>
      </div>
    ),
    { ...size }
  );
}