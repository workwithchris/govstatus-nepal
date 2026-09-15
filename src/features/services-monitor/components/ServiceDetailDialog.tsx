"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceLogo } from "@/features/services-monitor/components/ServiceLogo";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { useDetailStore } from "@/features/services-monitor/store/useDetailStore";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import { useLang } from "@/lib/i18n";
import { STATUS_PAGES_ENABLED } from "@/lib/site";
import {
  certDaysLeft,
  cn,
  formatLatency,
  formatTimeAgo,
} from "@/lib/utils";

function TlsCertLine({ certExpiresAt }: { certExpiresAt: string | null }) {
  const { t } = useLang();
  if (!certExpiresAt) {
    return (
      <p className="text-xs text-muted-foreground">{t("detail.tlsUnknown")}</p>
    );
  }

  const daysLeft = certDaysLeft(certExpiresAt);
  const tone =
    daysLeft < 0
      ? "text-rose-600 dark:text-rose-400"
      : daysLeft < 30
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <p className="text-xs text-muted-foreground">
      {t("detail.tlsExpires")}{" "}
      <span className={cn("font-mono", tone)}>
        {new Date(certExpiresAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>{" "}
      (
      {daysLeft < 0
        ? t("detail.expired")
        : t("detail.daysLeft", { days: daysLeft })})
    </p>
  );
}

export function ServiceDetailDialog() {
  const { t } = useLang();
  const selectedServiceId = useDetailStore((s) => s.selectedServiceId);
  const setSelectedServiceId = useDetailStore((s) => s.setSelectedServiceId);
  const { data } = useServicesHealth();

  const service = data?.services.find((s) => s.id === selectedServiceId) ?? null;
  const meta = service ? STATUS_META[service.status] : null;

  return (
    <Dialog
      open={!!service}
      onOpenChange={(open) => !open && setSelectedServiceId(null)}
    >
      <DialogContent>
        {service && meta && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 pr-8">
              <ServiceLogo
                key={service.id}
                url={service.url}
                name={service.name}
              />
              <div className="min-w-0 space-y-1">
                <DialogTitle>{service.name}</DialogTitle>
                <DialogDescription className="line-clamp-2">
                  {service.description}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={meta.badge}>
                <meta.icon className={cn("size-3", meta.text)} aria-hidden />
                {meta.label}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                http {service.httpStatus ?? "—"} · {formatLatency(service.responseTime)}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("detail.lastChecked")} {formatTimeAgo(service.checkedAt)}
            </p>

            <TlsCertLine certExpiresAt={service.certExpiresAt} />

            <Button size="sm" asChild>
              <a
                href={service.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-3.5" />
                {t("detail.open")} {new URL(service.url).hostname}
              </a>
            </Button>

            {STATUS_PAGES_ENABLED && (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`/status/${service.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("detail.statusPage")}
                </a>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Email subscription UI is disabled for now (see /api/subscribe). Re-enable
// by rendering <SubscribeForm serviceId={...} serviceName={...} /> here and
// setting ENABLE_NOTIFICATIONS=true + email env vars.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SubscribeForm({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const subscribe = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage("Enter a valid email address.");
      setState("error");
      return;
    }
    setState("saving");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, serviceId }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setState("done");
      setMessage(`You'll be emailed when ${serviceName} changes status.`);
    } catch {
      setState("error");
      setMessage("Couldn't subscribe — notifications unavailable right now.");
    }
  };

  return (
    <div className="space-y-1.5 border-t border-border pt-4">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Get notified on status change
      </p>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for status notifications"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50"
        />
        <Button size="sm" onClick={subscribe} disabled={state === "saving"}>
          {state === "saving" ? "Subscribing…" : "Notify me"}
        </Button>
      </div>
      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
