import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IsGovOnline — Nepal government portal status",
    short_name: "IsGovOnline",
    description:
      "Live uptime and health status for Nepal's government portals and digital public services.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#171717",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
