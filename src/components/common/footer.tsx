export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            GovStatus Nepal — an independent uptime tracker for Nepal&apos;s
            digital public services. Not affiliated with any government body.
          </p>
          <a
            href="/about"
            className="w-fit text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Why this exists →
          </a>
        </div>
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Probes refresh every 5 min
        </p>
      </div>
    </footer>
  );
}