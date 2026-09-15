import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
        404
      </p>
      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
        Page not found
      </h1>
      <p className="text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
