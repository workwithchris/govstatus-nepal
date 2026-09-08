import { z } from "zod";

/* ---------------------------------- Domain --------------------------------- */

export const healthStatusSchema = z.enum(["operational", "degraded", "down"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const serviceCategorySchema = z.enum([
  "citizen",
  "education",
  "finance",
  "business",
  "ministry",
  "province",
  "palika",
  "core",
  "infrastructure",
]);
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export const categoryFilterSchema = z.enum([
  "all",
  ...serviceCategorySchema.options,
]);
export type CategoryFilter = z.infer<typeof categoryFilterSchema>;

export const sortBySchema = z.enum(["status", "name", "latency"]);
export type SortBy = z.infer<typeof sortBySchema>;

/* ------------------------------- Seed service ------------------------------ */

export const seedServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
  category: serviceCategorySchema,
  description: z.string(),
});
export type SeedService = z.infer<typeof seedServiceSchema>;

/* ------------------------------- Health check ------------------------------ */

export const uptimeSlotSchema = z.object({
  /** ISO timestamp for the start of the hour this slot covers. */
  timestamp: z.string(),
  /** Null when no probe data exists for that hour (history not yet recorded). */
  status: healthStatusSchema.nullable(),
  responseTime: z.number().nullable(),
});
export type UptimeSlot = z.infer<typeof uptimeSlotSchema>;

export const serviceHealthSchema = seedServiceSchema.extend({
  status: healthStatusSchema,
  responseTime: z.number().nullable(),
  httpStatus: z.number().nullable(),
  checkedAt: z.string(),
  uptimePercentage: z.number().min(0).max(100),
  /** Compact 24-hour history: one char per slot (o/d/x, n = no data). */
  history: z.string().length(24),
  /** One latency (ms) per history slot, aligned by index. */
  latencies: z.array(z.number().nullable()).length(24),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const overallStatusSchema = z.enum(["normal", "degraded", "outage"]);
export type OverallStatus = z.infer<typeof overallStatusSchema>;

export const healthSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  operational: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  averageResponseTime: z.number().nullable(),
  overallStatus: overallStatusSchema,
});
export type HealthSummary = z.infer<typeof healthSummarySchema>;

export const healthResponseSchema = z.object({
  checkedAt: z.string(),
  summary: healthSummarySchema,
  services: z.array(serviceHealthSchema),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/* ------------------------------ Probe progress ----------------------------- */

export const lastRunSchema = z.object({
  total: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  finishedAt: z.string(),
});

export const probeProgressSchema = z.object({
  phase: z.enum(["idle", "probing", "persisting", "done"]),
  total: z.number().int().nonnegative(),
  checked: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  recent: z.array(z.object({ name: z.string(), status: healthStatusSchema })),
  startedAt: z.string().nullable(),
  lastRun: lastRunSchema.nullable(),
});
export type ProbeProgress = z.infer<typeof probeProgressSchema>;
