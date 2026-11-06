"use client";

/**
 * "Move to…" (P4 CALL CENTER; operations.md OPE-§12.6): the legacy labels people know from the sheet, each mapped to
 * axis moves by the one state machine and filtered by the viewer's rights (ops-ui.ts `moveEntries`), so the menu never
 * offers a move the writer refuses. A move that needs a coded reason opens the reason picker; "Force…" (managers with
 * orders.force_status) takes a written reason. The R1.0 status chip menu this file held is gone with the old drawer.
 */
import { ArrowRightLeftIcon, ChevronDownIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dirOf, type MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { OrderStatus } from "@/lib/orders/contract";
import { CANCEL_REASONS, RETURN_REASONS, SYSTEM_CANCEL_REASONS } from "@/lib/orders/state";
import { cn } from "@/lib/utils";
import { TONE_CLASSES } from "../common/status-chip";
import { ORDER_STATUS_META } from "../lib/status";
import type { MoveEntry, ReasonKind } from "./ops-ui";

export interface MovePick {
  label: OrderStatus;
  /** a coded reason (cancel or return list), or the force reason */
  reason?: string;
  force?: boolean;
}

const statusKey = (s: OrderStatus) => `ops.status.${s}` as MessageKey;

/** The menu button; `onMove` resolves when the write settled (the caller toasts and refreshes). */
export function MoveMenu({
  entries,
  onMove,
  pending,
  size = "default",
  disabled,
  align = "end",
}: {
  entries: readonly MoveEntry[];
  onMove: (pick: MovePick) => Promise<void> | void;
  pending?: boolean;
  size?: "sm" | "default";
  disabled?: boolean;
  align?: "start" | "end";
}) {
  const t = useT();
  const dir = dirOf(useAdminLocale());
  const [ask, setAsk] = useState<{ label: OrderStatus; kind: ReasonKind | "force" } | null>(null);
  const legal = entries.filter((e) => e.mode === "legal");
  const forced = entries.filter((e) => e.mode === "force");
  const pick = (e: MoveEntry) => {
    if (e.mode === "force") setAsk({ label: e.label, kind: "force" });
    else if (e.reason) setAsk({ label: e.label, kind: e.reason });
    else void onMove({ label: e.label });
  };
  return (
    <>
      <DropdownMenu dir={dir} modal={false}>
        <DropdownMenuTrigger asChild disabled={disabled || pending || !entries.length}>
          <Button variant="outline" size={size === "sm" ? "sm" : "default"} className={cn("gap-1.5 rounded-full", size === "sm" ? "h-8 px-3" : "h-9 px-3.5")}>
            {pending ? <Loader2Icon className="animate-spin" /> : <ArrowRightLeftIcon />}
            {t("ops.move.title")}
            <ChevronDownIcon className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-60 rounded-xl">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("ops.move.label")}</DropdownMenuLabel>
          {legal.map((e) => (
            <DropdownMenuItem key={e.label} onSelect={() => pick(e)} className="gap-2.5 rounded-lg">
              <span className={cn("size-2 shrink-0 rounded-full", TONE_CLASSES[ORDER_STATUS_META[e.label].tone].dot)} aria-hidden="true" />
              <span className="flex-1">{t(statusKey(e.label))}</span>
              {e.reason && <span className="text-xs text-muted-foreground">{t("ops.move.withReason")}</span>}
            </DropdownMenuItem>
          ))}
          {!legal.length && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("ops.move.none")}</p>}
          {forced.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2.5 rounded-lg">
                  <ShieldAlertIcon className="size-4 text-muted-foreground" />
                  {t("ops.move.force")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 rounded-xl">
                  {forced.map((e) => (
                    <DropdownMenuItem key={e.label} onSelect={() => pick(e)} className="rounded-lg">
                      {t(statusKey(e.label))}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {ask && (
        <ReasonDialog
          label={ask.label}
          kind={ask.kind}
          onClose={() => setAsk(null)}
          onDone={async (reason) => {
            await onMove({ label: ask.label, reason, force: ask.kind === "force" });
            setAsk(null);
          }}
        />
      )}
    </>
  );
}

/** The reason of a move: a coded list (cancel / return, OPE-§6.4, OD50) or free text for a forced move (≥ 3 chars). */
export function ReasonDialog({ label, kind, onClose, onDone }: { label: OrderStatus; kind: ReasonKind | "force"; onClose: () => void; onDone: (reason: string) => Promise<void> }) {
  const t = useT();
  const dir = dirOf(useAdminLocale());
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const codes: readonly string[] = kind === "cancel" ? CANCEL_REASONS.filter((r) => !SYSTEM_CANCEL_REASONS.includes(r)) : kind === "return" ? RETURN_REASONS : [];
  const run = async (reason: string) => {
    setBusy(true);
    try {
      await onDone(reason);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent dir={dir} className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "force" ? t("ops.move.forceTitle", { status: t(statusKey(label)) }) : t("ops.move.reasonTitle", { status: t(statusKey(label)) })}</DialogTitle>
          <DialogDescription>{kind === "force" ? t("ops.move.forceHint") : t("ops.move.reasonHint")}</DialogDescription>
        </DialogHeader>
        {kind === "force" ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim().length >= 3) void run(text.trim());
            }}
          >
            <textarea
              autoFocus
              rows={3}
              maxLength={200}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("ops.move.forcePlaceholder")}
              className="min-h-20 w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <DialogFooter>
              <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
                {t("ops.common.cancel")}
              </Button>
              <Button type="submit" className="rounded-full" disabled={busy || text.trim().length < 3}>
                {busy && <Loader2Icon className="animate-spin" />}
                {t("ops.move.forceDo")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {codes.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => void run(r)}
                className="min-h-11 rounded-xl px-3 py-2 text-start text-sm font-medium ring-1 ring-border transition-colors ring-inset hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {t((kind === "return" ? `ops.reason.return.${r}` : `ops.reason.${r}`) as MessageKey)}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
