"use client";

import { Activity, Eye, MapPin, ShieldCheck } from "lucide-react";

import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import seedData from "@/data/seed-services.json";
import { useLang, type TranslationKey } from "@/lib/i18n";

const SECTION_ICON = "size-4 shrink-0 text-muted-foreground";

const STATUS_ORDER = ["operational", "degraded", "down"] as const;

const MEASURE_KEY: Record<string, TranslationKey> = {
  operational: "about.measure.operational",
  degraded: "about.measure.degraded",
  down: "about.measure.down",
};

export function AboutContent() {
  const { t } = useLang();

  return (
    <>
      <header className="mb-10 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("about.eyebrow")}
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          {t("about.title")}
        </h1>
        <p className="text-base text-muted-foreground">{t("about.intro")}</p>
      </header>

      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Activity className={SECTION_ICON} aria-hidden />
            {t("about.problem.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("about.problem.p1")}</p>
            <p>{t("about.problem.p2")}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Eye className={SECTION_ICON} aria-hidden />
            {t("about.does.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("about.does.p1", { count: seedData.length })}</p>
            <p>{t("about.does.p2")}</p>
            <p>{t("about.does.p3")}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <MapPin className={SECTION_ICON} aria-hidden />
            {t("about.measure.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("about.measure.intro")}</p>
            <div className="space-y-2">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_META[status].dot}`}
                    aria-hidden
                  />
                  <p>
                    <span className="font-semibold text-foreground">
                      {STATUS_META[status].label}
                    </span>
                    {" — "}
                    {t(MEASURE_KEY[status])}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("about.measure.note")}
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <ShieldCheck className={SECTION_ICON} aria-hidden />
            {t("about.honesty.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("about.honesty.body")}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            {t("about.bigger.title")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("about.bigger.body")}
          </p>
        </section>
      </div>
    </>
  );
}
