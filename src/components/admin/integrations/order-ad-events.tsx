"use client";
/**
 * The order drawer's "Ad events" block (operations.md OPE-§12.7, OPE-§20; owner, admin), mounted by P4's drawer with
 * the data of `useOrderIntegration` (./order-sheet-block.tsx): per pixel, the server Purchase as one plain line,
 * "Purchase sent", "waiting for confirmation", "skipped: test order", "skipped: risk 74", "dropped: older than 7 days",
 * "failed: token refused". A pixel is its platform and its last 4 digits; a check icon marks a sent event, never an
 * emoji. Nothing for a viewer whose role does not see ad events (the action answers null).
 */
import { CheckIcon, CircleDashedIcon, CircleSlashIcon, ClockIcon, RadioTowerIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { AdEventState, OrderAdEvent } from "@/lib/integrations/order-state";
import { cn } from "@/lib/utils";
import { BlockError, BlockSkeleton, type OrderIntegrationLoad } from "./order-sheet-block";

const ICON: Record<AdEventState, ReactNode> = {
  sent: <CheckIcon />,
  sending: <ClockIcon />,
  waiting: <ClockIcon />,
  skipped_test: <CircleSlashIcon />,
  skipped_spam: <CircleSlashIcon />,
  skipped_manual: <CircleSlashIcon />,
  skipped_risk: <CircleSlashIcon />,
  dropped_old: <CircleSlashIcon />,
  failed_token: <TriangleAlertIcon />,
  failed: <TriangleAlertIcon />,
  none: <CircleDashedIcon />,
};

const toneOf = (s: AdEventState) => (s === "sent" ? "text-success-ink" : s.startsWith("failed") ? "text-destructive" : "text-muted-foreground");

export function OrderAdEvents({ state }: { state: OrderIntegrationLoad }) {
  const t = useT();
  const { data, reload } = state;
  const title = t("int.ord.ads.title");
  if (data === undefined) return <BlockSkeleton title={title} />;
  if (data === null) return <BlockError title={title} onRetry={reload} />;
  const events = data.adEvents;
  if (!events) return null;

  const line = (e: OrderAdEvent) => {
    const base = t(`int.ord.ads.${e.state}`, e.risk !== undefined ? { risk: e.risk } : undefined);
    return e.state === "failed" && e.causeKey ? `${base}: ${t(e.causeKey)}` : base;
  };

  return (
    <section aria-label={title} className="grid gap-2.5">
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <RadioTowerIcon className="size-3.5" aria-hidden="true" />
        {title}
      </h3>
      {events.length === 0 ? (
        <p className="text-xs text-pretty text-muted-foreground">{t("int.ord.ads.empty")}</p>
      ) : (
        <ul className="grid gap-1.5">
          {events.map((e) => (
            <li key={`${e.platform}:${e.pixel}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-medium">{t(`int.ord.ads.platform.${e.platform}`)}</span>
                <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
                  ••{e.pixel}
                </bdi>
              </span>
              <span className={cn("flex min-w-0 items-center gap-1.5 text-end text-xs [&_svg]:size-3.5 [&_svg]:shrink-0", toneOf(e.state))}>
                <span aria-hidden="true">{ICON[e.state]}</span>
                <span className="text-pretty">{line(e)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
