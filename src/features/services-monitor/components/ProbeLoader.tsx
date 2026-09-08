"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { Card } from "@/components/ui/card";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import {
  probeProgressSchema,
  type ProbeProgress,
} from "@/features/services-monitor/types";
import { cn, formatTimeAgo } from "@/lib/utils";

const PHASE_HEADLINES: Record<ProbeProgress["phase"], string> = {
  idle: "Waking up the probe",
  probing: "Probing government portals",
  persisting: "Recording status history",
  done: "Finishing up",
};

async function fetchProgress(): Promise<ProbeProgress> {
  const res = await fetch("/api/health/progress");
  if (!res.ok) throw new Error("Probe progress unavailable");
  return probeProgressSchema.parse(await res.json());
}

function useProbeProgress() {
  return useQuery({
    queryKey: ["probe-progress"],
    queryFn: fetchProgress,
    refetchInterval: (query) =>
      query.state.data?.phase === "done" ? false : 500,
    staleTime: 0,
  });
}

function ProgressBar({ checked, total }: { checked: number; total: number }) {
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function RecentChecks({ recent }: { recent: ProbeProgress["recent"] }) {
  if (recent.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {recent.map((item, index) => {
        const meta = STATUS_META[item.status];
        return (
          <li
            key={`${item.name}-${index}`}
            className={cn(
              "flex items-center gap-2 text-sm transition-opacity",
              index === 0 ? "text-foreground" : "opacity-50"
            )}
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
              aria-hidden
            />
            <span className="truncate">{item.name}</span>
            <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
              {meta.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Elapsed({ startedAt }: { startedAt: string | null }) {
  // Ticking clock state; renders after the first interval tick.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!startedAt || now === 0) return null;
  const seconds = Math.max(0, Math.round((now - Date.parse(startedAt)) / 1000));
  return <span className="font-mono">{seconds}s</span>;
}

interface ProbeLoaderProps {
  variant?: "page" | "compact";
}

export function ProbeLoader({ variant = "page" }: ProbeLoaderProps) {
  const { data } = useProbeProgress();
  const progress: ProbeProgress =
    data ?? {
      phase: "idle",
      total: 0,
      checked: 0,
      down: 0,
      degraded: 0,
      recent: [],
      startedAt: null,
      lastRun: null,
    };

  const detail =
    progress.phase === "probing"
      ? progress.checked === 0
        ? `Queuing ${progress.total} parallel checks…`
        : `${progress.checked} of ${progress.total} portals checked…`
      : progress.phase === "persisting"
        ? "Saving results to Cloudflare D1…"
        : progress.phase === "done"
          ? "Rendering the dashboard…"
          : "Starting the first probe cycle…";

  return (
    <Card
      className={cn(
        "w-full bg-card p-6 shadow-xs",
        variant === "page" && "mx-auto max-w-xl p-8"
      )}
    >
      <p className="flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Activity className="size-3.5" aria-hidden />
        Live probe
      </p>

      <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-foreground">
        {PHASE_HEADLINES[progress.phase]}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>

      <div className="mt-6 space-y-2">
        <ProgressBar checked={progress.checked} total={progress.total} />
        <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          {progress.total > 0 && (
            <span>
              {progress.checked}/{progress.total} checked
            </span>
          )}
          {progress.down > 0 && (
            <span className="text-rose-600 dark:text-rose-400">
              {progress.down} down
            </span>
          )}
          {progress.degraded > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {progress.degraded} degraded
            </span>
          )}
          <span className="ml-auto">
            <Elapsed startedAt={progress.startedAt} />
          </span>
        </p>
        {progress.lastRun && progress.phase !== "done" && (
          <p className="text-xs text-muted-foreground">
            Last full check: {progress.lastRun.total}/{progress.lastRun.total}{" "}
            · {progress.lastRun.down} down ·{" "}
            {progress.lastRun.degraded} degraded ·{" "}
            {formatTimeAgo(progress.lastRun.finishedAt)}
          </p>
        )}
      </div>

      <div className="mt-5 min-h-24">
        {progress.recent.length > 0 ? (
          <RecentChecks recent={progress.recent} />
        ) : (
          <p className="animate-pulse text-sm text-muted-foreground">
            Waiting for the first portals to respond…
          </p>
        )}
      </div>

      <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
        Parallel fetches with an 8s timeout, relaxed-TLS retry on certificate
        errors, and 24h history persisted per run.
      </p>
    </Card>
  );
}
