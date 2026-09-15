"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

/**
 * Shared failure state for data-fetching surfaces. Shown instead of the
 * perpetual skeleton when the health endpoint fails, with a retry action.
 */
export function ErrorState({
  onRetry,
  message,
}: {
  onRetry?: () => void;
  message?: string;
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
      <TriangleAlert className="size-5 text-rose-500" aria-hidden />
      <p className="text-sm font-semibold text-foreground">{t("error.title")}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? t("error.body")}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t("error.retry")}
        </Button>
      )}
    </div>
  );
}
