"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

interface ServiceLogoProps {
  url: string;
  name: string;
}

/**
 * Favicon sources, fastest/most-reliable first. Google's proxy is cached on a
 * global CDN and answers in tens of ms, whereas many .np origins stall or hang
 * on `/favicon.ico` — so we try the CDN first and fall back to the origin.
 */
function buildSources(url: string): string[] {
  const { origin, hostname } = new URL(url);
  return [
    `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    `${origin}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
  ];
}

/** Hostname → winning source, so repeat mounts paint instantly. */
const resolvedCache = new Map<string, string>();

/**
 * Renders the service favicon. The `<img>` is mounted immediately (the browser
 * starts the request during first paint — no JS preload round trip) and steps
 * to the next source on error. Until one loads, the service initial shows
 * behind it, so a slow/hanging source never flashes a broken image.
 */
export function ServiceLogo({ url, name }: ServiceLogoProps) {
  const { hostname } = new URL(url);
  const cached = resolvedCache.get(hostname);
  const sources = buildSources(url);
  const ordered = cached
    ? [cached, ...sources.filter((src) => src !== cached)]
    : sources;

  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const src = ordered[step] ?? null;

  return (
    <span
      aria-hidden
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted font-mono text-sm font-medium text-muted-foreground"
    >
      {!loaded && (
        <span className="absolute inset-0 flex items-center justify-center">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon, no optimization pipeline wanted
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => {
            resolvedCache.set(hostname, src);
            setLoaded(true);
          }}
          onError={() => {
            setLoaded(false);
            setStep((current) => current + 1);
          }}
          className={cn(
            "absolute inset-0 size-full bg-card object-contain p-1 transition-opacity duration-150",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </span>
  );
}
