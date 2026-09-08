"use client";

import { useEffect, useState } from "react";

interface ServiceLogoProps {
  url: string;
  name: string;
}

const SIZES = [64, 128];
/** Per-source load timeout — unreachable origins skip ahead quickly. */
const LOAD_TIMEOUT_MS = 4000;

function buildSources(url: string): string[] {
  const { origin, hostname } = new URL(url);
  return [
    `${origin}/favicon.ico`,
    ...SIZES.map(
      (size) => `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`
    ),
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  ];
}

/** Resolves when the image decodes, or false on error/timeout. */
function tryLoad(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      img.src = "";
      resolve(false);
    }, LOAD_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = src;
  });
}

/**
 * Renders the service's own favicon with a verified fallback chain:
 * direct favicon.ico → Google s2 → DuckDuckGo → service initial.
 * Each candidate is pre-loaded in JS before being painted, so a broken
 * or hanging source never renders as a broken image.
 */
export function ServiceLogo({ url, name }: ServiceLogoProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sources = buildSources(url);

    (async () => {
      for (const source of sources) {
        if (cancelled) return;
        if (await tryLoad(source)) {
          if (!cancelled) setResolvedSrc(source);
          return;
        }
      }
      if (!cancelled) setResolvedSrc(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!resolvedSrc) {
    return (
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-sm font-medium text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon, no optimization pipeline wanted
    <img
      src={resolvedSrc}
      alt={`${name} logo`}
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-9 shrink-0 rounded-md border border-border bg-card object-contain p-1"
    />
  );
}
