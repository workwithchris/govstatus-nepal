"use client";

import Link from "next/link";
import { Activity } from "lucide-react";

import { ThemeToggle } from "@/components/common/theme-toggle";
import { useLang } from "@/lib/i18n";

export function Navbar() {
  const { lang, setLang, t } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <Activity className="size-5 shrink-0 text-foreground" aria-hidden />
          <span className="truncate text-base font-semibold tracking-tight text-foreground">
            IsGovOnline
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1">
          <a
            href="/about"
            className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:px-3 sm:text-sm"
          >
            {t("nav.about")}
          </a>
          <button
            onClick={() => setLang(lang === "en" ? "ne" : "en")}
            className="whitespace-nowrap rounded-full border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Switch language / भाषा बदल्नुहोस्"
          >
            {lang === "en" ? "नेपाली" : "EN"}
          </button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}