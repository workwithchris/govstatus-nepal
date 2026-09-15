/**
 * Canonical site URL. Swap here when the project moves off the
 * techyatraa.com subdomain onto a dedicated domain — everything
 * (metadata, sitemap, robots, RSS, llms.txt, embeds) follows.
 */
export const SITE_URL = "https://isgovonline.techyatraa.com";

/**
 * Feature flag for the per-service status pages (`/status/<id>`).
 * While false the route 404s and every link/listing that points at it is
 * hidden (dashboard, category, ranking, compare, detail modal, sitemap,
 * RSS, llms.txt). Set to true to restore the pages. Typed as `boolean`
 * (not a literal) so the disabled branches stay type-checked.
 */
export const STATUS_PAGES_ENABLED: boolean = false;