export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-muted-foreground">
          GovStatus Nepal — an independent uptime tracker for Nepal&apos;s
          digital public services. Not affiliated with any government body.
        </p>
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Probes refresh every 60s
        </p>
      </div>
    </footer>
  );
}
