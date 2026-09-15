"use client";

import { useLang } from "@/lib/i18n";

export function Footer() {
  const { t } = useLang();
  const links = [
    { href: "/about", label: t("footer.about") },
    { href: "/methodology", label: t("footer.methodology") },
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/terms", label: t("footer.terms") },
  ];

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
          <nav className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="w-fit underline-offset-2 hover:text-foreground hover:underline"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("footer.probes")}
        </p>
      </div>
    </footer>
  );
}
