import { Activity } from "lucide-react";

import { ThemeToggle } from "@/components/common/theme-toggle";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-foreground" aria-hidden />
          <span className="text-base font-semibold tracking-tight text-foreground">
            GovStatus Nepal
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <a
            href="#services"
            className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Services
          </a>
          <a
            href="#metrics"
            className="hidden rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Metrics
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
