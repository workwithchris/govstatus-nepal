"use client";

import { Activity, Database, ShieldCheck } from "lucide-react";

import { useLang } from "@/lib/i18n";

const SECTION_ICON = "size-4 shrink-0 text-muted-foreground";

export function MethodologyContent() {
  const { t } = useLang();

  return (
    <>
      <header className="mb-10 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("meth.eyebrow")}
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          {t("meth.title")}
        </h1>
        <p className="text-base text-muted-foreground">{t("meth.intro")}</p>
      </header>

      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Activity className={SECTION_ICON} aria-hidden />
            {t("meth.probing.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("meth.probing.p1")}</p>
            <p>{t("meth.probing.p2")}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Database className={SECTION_ICON} aria-hidden />
            {t("meth.recording.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("meth.recording.p1")}</p>
            <p>{t("meth.recording.p2")}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <ShieldCheck className={SECTION_ICON} aria-hidden />
            {t("meth.caveats.title")}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t("meth.caveats.body")}</p>
          </div>
        </section>
      </div>
    </>
  );
}
