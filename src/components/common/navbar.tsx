"use client";

import Link from "next/link";

import { NepalFlag } from "@/components/NepalFlag";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { lang, setLang, t } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-1.5">
          <NepalFlag className="inline-block h-4 w-auto shrink-0" />
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
          <div
            role="group"
            aria-label="Language / भाषा"
            className="flex items-center rounded-full border border-border p-0.5"
          >
            {(["en", "ne"] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                className={cn(
                  "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                  lang === code
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {code === "en" ? "EN" : "नेपाली"}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}