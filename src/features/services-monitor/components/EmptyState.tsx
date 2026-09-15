"use client";

import { SearchX } from "lucide-react";

import { useLang } from "@/lib/i18n";

export function EmptyState() {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <SearchX className="size-6 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">{t("empty.title")}</p>
        <p className="text-sm text-muted-foreground">{t("empty.body")}</p>
      </div>
    </div>
  );
}
