/**
 * Canonical site URL. Single source of truth — everything (metadata,
 * canonical tags, sitemap, robots `Sitemap:`, llms.txt, OG URLs, embeds,
 * unsubscribe links) follows this. Must match the deployed custom domain.
 */
export const SITE_URL = "https://isgov.online";

/**
 * Feature flag for the per-service status pages (`/status/<id>`).
 * While false the route 404s and every link/listing that points at it is
 * hidden (dashboard, category, ranking, compare, detail modal, sitemap,
 * RSS, llms.txt). Set to true to restore the pages. Typed as `boolean`
 * (not a literal) so the disabled branches stay type-checked.
 */
export const STATUS_PAGES_ENABLED: boolean = false;