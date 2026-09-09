import { getIncidents } from "@/features/services-monitor/server/incidents";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 feed of recent incidents for subscribers/status consumers. */
export async function GET() {
  const incidents = await getIncidents();
  const generatedAt = new Date().toISOString();

  const items = incidents
    .slice(0, 20)
    .map((incident) => {
      const title = `${incident.serviceName} — ${incident.status.toUpperCase()}`;
      const pubDate = new Date(
        incident.ongoing ? incident.startedAt : (incident.endedAt as string)
      ).toUTCString();
      const status = incident.ongoing ? "ongoing" : "resolved";
      return `    <item>
      <title>${escapeXml(title)}</title>
<link>${SITE_URL}/status/${incident.serviceId}</link>
      <guid isPermaLink="false">${escapeXml(incident.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(
        `${incident.serviceName} (${incident.serviceUrl}) ${
          incident.status
        } for ~${incident.durationHours}h — ${status}.`
      )}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>IsGovOnline — Incidents</title>
    <link>${SITE_URL}</link>
    <description>Recent outages and degradations across Nepal's government digital services.</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${generatedAt}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}