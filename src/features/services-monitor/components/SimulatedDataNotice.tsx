"use client";

import { TriangleAlert } from "lucide-react";

import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import { useLang } from "@/lib/i18n";

/**
 * Shown when status history is fabricated (D1 unconfigured/unreachable) so
 * the dashboard never presents simulated bars as real uptime data.
 */
export function SimulatedDataNotice() {
  const { data } = useServicesHealth();
  const { t } = useLang();

  if (data?.source !== "simulated") return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <p className="text-amber-700 dark:text-amber-300">
        <span className="font-semibold">{t("simulated.title")}</span>{" "}
        {t("simulated.body")}
      </p>
    </div>
  );
}
