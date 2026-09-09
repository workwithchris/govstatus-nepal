import { SITE_URL } from "@/lib/site";
import seedData from "@/data/seed-services.json";

export const revalidate = 3600;

/** llms.txt — machine/AI-crawler manifest (llmstxt.org format). */
export function GET() {
  const serviceLines = seedData
    .map(
      (s) =>
        `- [${s.name}](${SITE_URL}/status/${s.id}): ${s.description}`
    )
    .join("\n");

  const body = `# GovStatus Nepal

> Real-time uptime monitor, health checker, and reliability tracker for Nepal's government portals and digital public services. Every 5 minutes, government websites — citizen services, ministries, banks, universities, municipalities, provinces — are checked from a Nepal vantage point and reported as operational, degraded, or down.

## Key facts

- Independent, non-governmental uptime tracker for Nepal's digital public services.
- Monitors ${seedData.length}+ portals: passports, tax, NEPSE, NRB, land records, ministries, palikas, and more.
- Status measured from Nepal: "down" means unreachable from a Nepal vantage point, not from a foreign datacenter.
- Each service has a dedicated status page with current status, 24-hour uptime, latency, and HTTP code.
- Hourly history is persisted and rolled up into 30/90-day uptime; a "down" reading is confirmed twice before being reported.
- Status is refreshed every 5 minutes; pages are server-rendered and revalidated every 60 seconds.

## Services monitored

${serviceLines}

## How status is measured

Statuses are operational (responding under 3.5s), degraded (slow, 403/WAF-blocked, or rate-limited), or down (server error, refused, or timeout). A service may also declare a deep-check URL so that "portal up but login/API broken" is not missed. Uptime percentages only count hours with recorded data; an hour with any down sample counts as down.

## Links

- [Dashboard](${SITE_URL}): all services, live summary, search and filters
- [About](${SITE_URL}/about): why the tracker exists and methodology
- [Incidents RSS](${SITE_URL}/feed.xml): recent outages and degradations
- [Live API](${SITE_URL}/api/health): full current snapshot as JSON (summary, per-service status, 24h history)
- [API diagnostics](${SITE_URL}/api/diag): data source and freshness

## Example questions this site can answer

- Is the e-passport portal down? What is the current status of nepalpassport.gov.np?
- Which Nepal government websites had outages this week?
- What is the 30-day uptime of the NEPSE website?
- Is the Department of Transport Management license portal degraded?
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
    },
  });
}