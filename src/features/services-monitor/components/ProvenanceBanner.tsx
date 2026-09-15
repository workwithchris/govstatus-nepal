"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";

import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import { useLang } from "@/lib/i18n";

/**
 * Provenance + freshness banner. Tells readers how the data was gathered and
 * how stale it is — "down" is vantage-relative, and a stale snapshot is
 * called out instead of masquerading as live.
 */
export function ProvenanceBanner() {
  const { data } = useServicesHealth();
  const { t } = useLang();
  // Ticks once a minute so the freshness readout stays live without calling
  // Date.now() during render (React purity rule).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const minutesOld = Math.round((now - Date.parse(data.checkedAt)) / 60000);
  if (!data) return null;
  const isSimulated = data.source === "simulated";
  const stale = !isSimulated && minutesOld > 10;

  const freshness = isSimulated
    ? t("provenance.simulated")
    : stale
      ? t("provenance.stale", { min: minutesOld })
      : minutesOld <= 1
        ? t("provenance.justNow")
        : t("provenance.updated", { min: minutesOld });

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span>
        {t("provenance.vantage")}
        {freshness}.
      </span>
      <span className="inline-flex items-center gap-1">
        {t("provenance.note")}
      </span>
    </p>
  );
}