"use client";
/**
 * Replay, Send again and "Replay all dead of this kind" (OPE-§28.1 row actions, core §H.1 re-send rule). The row
 * turns "Queued" at once and rolls back when the server refuses; a second click on a queued row is never sent (the
 * button is gone, and the server treats a pending row as a no-op). Replay all touches at most 50 rows and its confirm
 * names the count. The server re-checks everything (`integrations.manage`, the 30/h bucket, the store's own rows).
 */
import { Loader2Icon, RotateCwIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/i18n/admin";
import type { HubKind } from "@/lib/integrations/hub.server";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { replayDeadOfKindAction, replayDeliveryAction } from "@/app/app/[store]/integrations/actions";
import { kindKey } from "./hub-format";

/** The words of a refused action: its own message, else the shared `error.<code>`. */
export function refusalText(t: (k: MessageKey) => string, res: Extract<ActionResult<unknown>, { ok: false }>): string {
  return t(res.message ?? `error.${res.error}`);
}

export function ReplayButton({
  id,
  mode,
  onQueued,
  onRollback,
  className,
}: {
  id: string;
  mode: "replay" | "sendAgain";
  onQueued: () => void;
  onRollback: () => void;
  className?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    onQueued();
    try {
      const res = await replayDeliveryAction(id);
      if (!res.ok) {
        onRollback();
        toast.error(refusalText(t, res));
        return;
      }
      const o = res.data.outcome;
      toast.success(t(o === "noop" ? "int.deliveries.toast.noop" : o === "resent" ? "int.deliveries.toast.resent" : "int.deliveries.toast.replayed"));
    } catch {
      onRollback();
      toast.error(t("int.deliveries.loadError"));
    } finally {
      setBusy(false);
    }
  }
  const Icon = mode === "replay" ? RotateCwIcon : SendIcon;
  return (
    <Button variant="outline" size="sm" className={cn("h-11 px-3 sm:h-7 sm:px-2.5", className)} disabled={busy} onClick={run}>
      <Icon className="rtl:-scale-x-100" aria-hidden="true" />
      {t(mode === "replay" ? "int.deliveries.replay" : "int.deliveries.sendAgain")}
    </Button>
  );
}

/** "Replay all dead of this kind": a confirm naming the count (≤ 50 per call), then one call. */
export function ReplayAllButton({ kind, count, max, onDone }: { kind: HubKind; count: number; max: number; onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const n = Math.min(count, max);
  const kindWord = t(kindKey(kind));
  async function confirm() {
    setPending(true);
    try {
      const res = await replayDeadOfKindAction(kind);
      if (!res.ok) {
        toast.error(refusalText(t, res));
        return;
      }
      toast.success(t("int.deliveries.replayAll.done", { count: res.data.replayed }), res.data.more ? { description: t("int.deliveries.replayAll.more") } : undefined);
      setOpen(false);
      onDone();
    } catch {
      toast.error(t("int.deliveries.loadError"));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" className="h-11 px-3 sm:h-8" onClick={() => setOpen(true)}>
        <RotateCwIcon aria-hidden="true" />
        {t("int.deliveries.replayAllOf", { kind: kindWord, count })}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent className="gap-5 rounded-2xl p-6 duration-200 data-[size=default]:sm:max-w-md">
          <AlertDialogHeader className="gap-2">
            <AlertDialogMedia className="size-11 rounded-xl bg-foreground/[0.06] text-foreground/80">
              <RotateCwIcon className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{t("int.deliveries.replayAll.title", { count: n })}</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-pretty">
              <span className="font-medium text-foreground">{kindWord}</span>. {t("int.deliveries.replayAll.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-6 -mb-6 rounded-b-2xl px-6 py-4">
            <AlertDialogCancel disabled={pending} className="h-11 sm:h-8">
              {t("int.deliveries.cancel")}
            </AlertDialogCancel>
            <Button disabled={pending} className="h-11 sm:h-8" onClick={confirm}>
              {pending && <Loader2Icon className="animate-spin" />}
              {t("int.deliveries.replayAll.confirm", { count: n })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
