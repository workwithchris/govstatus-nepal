"use client";

import { ChevronDown, Info } from "lucide-react";

import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Explains what each status means so readers can interpret the cards/bars
 * correctly. Collapsed by default to keep the dashboard uncluttered.
 */
export function StatusLegend() {
  const { t } = useLang();

  const rows = [
    {
      status: "operational" as const,
      desc: t("legend.operational.desc"),
    },
    {
      status: "degraded" as const,
      desc: t("legend.degraded.desc"),
    },
    {
      status: "down" as const,
      desc: t("legend.down.desc"),
    },
  ];

  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {t("legend.title")}
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-4">
        {rows.map(({ status, desc }) => {
          const meta = STATUS_META[status];
          return (
            <div key={status} className="flex items-start gap-3">
              <span
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.dot)}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {meta.label}
                </p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          );
        })}
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {t("legend.note")}
        </p>
      </div>
    </details>
  );
}