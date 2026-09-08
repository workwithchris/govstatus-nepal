import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default Cloudflare config. ISR/`revalidate` needs a durable incremental
// cache on Workers — add r2IncrementalCache + an R2 binding if you want ISR
// to persist across cold starts (see https://opennext.js.org/cloudflare/caching).
export default defineCloudflareConfig({});