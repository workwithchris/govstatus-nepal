"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Error
      </p>
      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred while loading this page. You can try again,
        or head back to the dashboard.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
