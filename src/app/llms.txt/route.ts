import { SITE_URL, STATUS_PAGES_ENABLED } from "@/lib/site";
import seedData from "@/data/seed-services.json";

export const revalidate = 3600;

/** llms.txt — machine/AI-crawler manifest (llmstxt.org format). */
export function GET() {
  const serviceLines = seedData
    .map((s) =>
      STATUS_PAGES_ENABLED
        ? `- [${s.name}](${SITE_URL}/status/${s.id}): ${s.description}`
        : `- ${s.name}: ${s.description}`
    )
    .join("\n");

  const servicePageFact = STATUS_PAGES_ENABLED
    ? "- Each service has a dedicated status page with current status, 24-hour uptime, latency, and HTTP code."
    : "- Each service's current status, latency, and HTTP code are shown on the live dashboard.";

  const body = `# IsGovOnline

> Real-time uptime monitor, health checker, and reliability tracker for Nepal's government portals and digital public services. Government websites — citizen services, ministries, banks, universities, municipalities, provinces — are checked by our own probe and reported as operational, degraded, or down.

## Key facts

- Independent, non-governmental uptime tracker for Nepal's digital public services.
- Monitors ${seedData.length}+ portals: passports, tax, NEPSE, NRB, land records, ministries, palikas, and more.
- Status is measured by our own probe: "down" means the service was unreachable from the probe, which may differ from your network.
${servicePageFact}
- Status is fetched live in each visitor's browser; readings refresh about every 5 minutes.
- A "down" reading is confirmed with a second probe before being reported.

## Services monitored

${serviceLines}

## How status is measured

Statuses are operational (responding under 3.5s), degraded (slow, 403/WAF-blocked, or rate-limited), or down (server error, refused, or timeout). A service may also declare a deep-check URL so that "portal up but login/API broken" is not missed. A "down" result is confirmed with a second probe before it is reported, to cut false alarms on flaky .np infrastructure.

## Links

- [Dashboard](${SITE_URL}): all services, live summary, search and filters
- [About](${SITE_URL}/about): why the tracker exists
- [Methodology](${SITE_URL}/methodology): how status is measured

## Example questions this site can answer

- Is the e-passport portal down? What is the current status of nepalpassport.gov.np?
- Is the NEPSE website up right now?
- Is the Department of Transport Management license portal degraded?
- Which Nepal government portals are down at the moment?
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
    },
  });
}