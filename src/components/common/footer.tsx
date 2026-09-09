export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            IsGovOnline — an independent uptime tracker for Nepal&apos;s
            digital public services. Not affiliated with any government body.
          </p>
          <nav className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <a
              href="/about"
              className="w-fit underline-offset-2 hover:text-foreground hover:underline"
            >
              About
            </a>
            <a
              href="/methodology"
              className="w-fit underline-offset-2 hover:text-foreground hover:underline"
            >
              Methodology
            </a>
            <a
              href="/worst"
              className="w-fit underline-offset-2 hover:text-foreground hover:underline"
            >
              Reliability ranking
            </a>
            <a
              href="/compare"
              className="w-fit underline-offset-2 hover:text-foreground hover:underline"
            >
              Compare
            </a>
            <a
              href="/feed.xml"
              className="w-fit underline-offset-2 hover:text-foreground hover:underline"
            >
              RSS
            </a>
          </nav>
        </div>
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Probes refresh every 5 min
        </p>
      </div>
    </footer>
  );
}