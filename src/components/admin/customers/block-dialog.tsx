"use client";
/**
 * Block (and cancel open orders) (P4 CALL CENTER; operations.md OPE-§9.5, OP-12). Opening the dialog asks the server
 * for the preview line ("This number has 2 open orders and 1 shipped order") before anything changes; the open
 * pre-ship orders then move to Fake (default) or Cancelled with reason `blocked`, or stay as they are; shipped orders
 * are never touched. One `blocklist.added` audit row, the number masked.
 */
import { BanIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { blockPhoneAndCancelAction, blockPreviewAction } from "@/app/app/[store]/customers/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/admin/client";
import type { BlockPreview } from "@/lib/orders/admin";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { settle } from "../orders/ops-ui";

type OpenOrders = "fake" | "cancel" | "keep";

export function BlockDialog({
  open,
  onOpenChange,
  target,
  canMove,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { orderId: string } | { phone: string };
  /** orders.write: without it the open orders stay as they are */
  canMove: boolean;
  onDone: (r: { moved: number; untouched: number }) => void;
}) {
  const t = useT();
  const [preview, setPreview] = useState<BlockPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<OpenOrders>(canMove ? "fake" : "keep");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = "orderId" in target ? target.orderId : target.phone;

  useEffect(() => {
    if (!open) return;
    let stop = false;
    void settle<BlockPreview>(blockPreviewAction(target)).then((res) => {
      if (stop) return;
      if (res.ok) setPreview(res.data);
      else setFailed(true);
    });
    return () => {
      stop = true;
      setPreview(null);
      setFailed(false);
      setError(null);
    };
    // the target's key is what matters, not the object's identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const options: { id: OpenOrders; label: string }[] = [
    ...(canMove ? [{ id: "fake" as const, label: t("ops.block.mode.fake") }, { id: "cancel" as const, label: t("ops.block.mode.cancel") }] : []),
    { id: "keep", label: t("ops.block.mode.keep") },
  ];

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      icon={<BanIcon className="size-5" />}
      title={t("ops.block.title")}
      description={
        preview ? (
          <>
            <bdi dir="ltr" className="font-mono">
              {preview.phoneMasked}
            </bdi>
            {" · "}
            {t("ops.block.preview", { open: preview.open, shipped: preview.shipped })}
          </>
        ) : failed ? (
          t("ops.error.generic")
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
            {t("ops.block.loading")}
          </span>
        )
      }
      confirmLabel={t("ops.block.confirm")}
      pendingLabel={t("ops.block.pending")}
      onConfirm={async () => {
        if (!preview) return false;
        const res = await settle<{ moved: { ok: boolean }[]; untouched: string[] }>(
          blockPhoneAndCancelAction({ ...target, ...(reason.trim() ? { reason: reason.trim() } : {}), openOrders: preview.open > 0 ? mode : "keep" }),
        );
        if (!res.ok) {
          setError(t("ops.error.generic"));
          return false;
        }
        onDone({ moved: res.data.moved.filter((m) => m.ok).length, untouched: res.data.untouched.length });
      }}
    >
      <div className="grid gap-4">
        {preview?.alreadyBlocked && <p className="text-sm text-muted-foreground">{t("ops.block.already")}</p>}
        {preview && preview.open > 0 && (
          <div role="radiogroup" aria-label={t("ops.block.openOrders")} className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("ops.block.openOrders")}</span>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={mode === o.id}
                onClick={() => setMode(o.id)}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-start text-sm transition-colors",
                  mode === o.id ? "bg-foreground/[0.06] font-medium text-foreground ring-1 ring-foreground/20 ring-inset" : "text-foreground/80 hover:bg-foreground/[0.04]",
                )}
              >
                <span className={cn("size-3.5 shrink-0 rounded-full border", mode === o.id ? "border-[5px] border-foreground" : "border-foreground/30")} aria-hidden="true" />
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="block-reason" className="text-xs text-muted-foreground">
            {t("ops.block.reason")}
          </Label>
          <Input id="block-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t("ops.block.reasonPlaceholder")} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
