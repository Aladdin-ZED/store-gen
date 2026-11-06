"use client";
/**
 * The order drawer's "Google Sheets" block (operations.md OPE-§12.7; owner, admin, manager), mounted by P4's drawer:
 *
 *   const s = useOrderIntegration(order.id);
 *   <OrderSheetBlock orderId={order.id} state={s} canResend={can("callcenter.configure")} />
 *   <OrderAdEvents state={s} />                                  (./order-ad-events.tsx; owner, admin)
 *
 * The sync state as its word, the stored failure's words while it failed, and Send again (`requeueSheetRowAction`,
 * the row goes back to the sheet's queue). `useOrderIntegration` loads both blocks in one call
 * (`orderIntegrationAction`); a block the viewer's role does not see comes back null and renders nothing.
 */
import { CheckIcon, Loader2Icon, RotateCwIcon, SheetIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { orderIntegrationAction, type OrderIntegrationView } from "@/app/app/[store]/integrations/actions";
import { requeueSheetRowAction } from "@/app/app/[store]/integrations/sheets/actions";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import type { SheetState } from "@/lib/integrations/order-state";
import { cn } from "@/lib/utils";
import type { HubTone } from "./hub-format";
import { StateBadge } from "./state-badge";

/** The blocks' data: undefined while loading, null when the read failed (the blocks offer a retry). */
export type OrderIntegrationLoad = { data: OrderIntegrationView | null | undefined; reload: () => void };

export function useOrderIntegration(orderId: string | null): OrderIntegrationLoad {
  const [data, setData] = useState<OrderIntegrationView | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!orderId) return;
    let live = true;
    orderIntegrationAction(orderId)
      .then((res) => live && setData(res.ok ? res.data : null))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [orderId, tick]);
  const reload = useCallback(() => {
    setData(undefined);
    setTick((n) => n + 1);
  }, []);
  return { data, reload };
}

const TONE: Record<SheetState, HubTone> = { synced: "success", pending: "neutral", failed: "danger", disabled: "neutral" };

export function OrderSheetBlock({ orderId, state, canResend }: { orderId: string; state: OrderIntegrationLoad; canResend: boolean }) {
  const t = useT();
  const [sending, setSending] = useState(false);
  const { data, reload } = state;
  if (data === undefined) return <BlockSkeleton title={t("int.ord.sheet.title")} />;
  if (data === null) return <BlockError title={t("int.ord.sheet.title")} onRetry={reload} />;
  const sheet = data.sheet;
  if (!sheet) return null;

  async function resend() {
    setSending(true);
    try {
      const res = await requeueSheetRowAction(orderId);
      if (!res.ok) return void toast.error(t(res.message ?? `error.${res.error}`));
      toast.success(t("int.ord.sheet.queued"));
      reload();
    } catch {
      toast.error(t("int.sheets.network"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label={t("int.ord.sheet.title")} className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <SheetIcon className="size-3.5" aria-hidden="true" />
          {t("int.ord.sheet.title")}
        </h3>
        <StateBadge tone={TONE[sheet.status]}>
          {sheet.status === "synced" && <CheckIcon className="-ms-0.5 size-3" aria-hidden="true" />}
          {t(sheet.label)}
        </StateBadge>
      </div>
      {sheet.error && <p className="rounded-xl bg-destructive/[0.05] px-3 py-2 text-xs leading-relaxed text-pretty text-destructive ring-1 ring-destructive/12 ring-inset">{sheet.error}</p>}
      {canResend && (sheet.status === "failed" || sheet.status === "synced") && (
        <div>
          <Button variant="outline" size="sm" className="h-11 sm:h-7" disabled={sending} onClick={() => void resend()}>
            {sending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <RotateCwIcon aria-hidden="true" />}
            {t("int.ord.sheet.resend")}
          </Button>
        </div>
      )}
    </section>
  );
}

export function BlockSkeleton({ title }: { title: string }) {
  return (
    <section aria-label={title} aria-busy="true" className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="adm-shimmer h-3 w-24 rounded-full" />
        <div className="adm-shimmer h-6 w-20 rounded-full" />
      </div>
      <div className="adm-shimmer h-3 w-2/3 rounded-full" />
    </section>
  );
}

export function BlockError({ title, onRetry, className }: { title: string; onRetry: () => void; className?: string }) {
  const t = useT();
  return (
    <section aria-label={title} className={cn("flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground", className)}>
      <span>
        {title}: {t("int.ord.loadError")}
      </span>
      <Button variant="ghost" size="sm" className="h-11 sm:h-7" onClick={onRetry}>
        {t("int.hub.retry")}
      </Button>
    </section>
  );
}
