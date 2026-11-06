"use client";

/**
 * The selection bar (P4 CALL CENTER; operations.md OPE-§12.4, §12.5, §12.8): bottom, sticky, slides in (180 ms).
 * Assign to…, Move to…, Pin, Export selection, Print slips, Carrier file, Clear. Moves are optimistic: the rows re-chip
 * at once and the failed ids roll back with the reason in a toast ("38 moved · 2 skipped: already shipped"); "Undo"
 * stays 10 s. Every call carries an idem (OD36). Agents never see Export or Carrier file.
 */
import { DownloadIcon, FileSpreadsheetIcon, Loader2Icon, PinIcon, PrinterIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { bulkAssignAction, bulkMoveAction, bulkPinAction, undoMoveAction } from "@/app/app/[store]/orders/actions";
import { Button } from "@/components/ui/button";
import type { OrdersMember } from "@/lib/admin-data/orders";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import type { OrderListRow } from "@/lib/orders/admin";
import type { OrderStatus } from "@/lib/orders/contract";
import { cn } from "@/lib/utils";
import "./orders.css";
import { downloadFile } from "../lib/download";
import { useStoreStepUp } from "../shell/step-up";
import { useStore } from "../shell/store-context";
import { CarrierColumnsDialog, useCarrierDownload, type CarrierSpec } from "./carrier-file";
import { AssignMenu } from "./order-drawer";
import { bulkEntries, newIdem, settle, viewerMovePerms } from "./ops-ui";
import { MoveMenu, type MovePick } from "./status-menu";

export const BULK_MAX = 200;
/** the legacy labels that are ship moves (their reasons come from the return list, OD50) */
const SHIP_LABELS: ReadonlySet<OrderStatus> = new Set(["shipped", "in_transit", "delivered", "refused", "returned", "lost"]);

interface BulkResult {
  ok: string[];
  failed: { id: string; error: string }[];
  undo?: string | null;
}

export interface BulkPerms {
  write: boolean;
  assign: boolean;
  ship: boolean;
  export: boolean;
}

export function BulkBar({
  rows,
  perms,
  members,
  carrier,
  onCarrier,
  onClear,
  onOptimistic,
  onChanged,
}: {
  rows: readonly OrderListRow[];
  perms: BulkPerms;
  members: readonly OrdersMember[];
  carrier: CarrierSpec | null;
  onCarrier: (spec: CarrierSpec) => void;
  onClear: () => void;
  /** re-chip the rows now; the returned function rolls back the given ids */
  onOptimistic: (ids: readonly string[], label: OrderStatus) => (failed: readonly string[]) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const storeView = useStore();
  const stepUp = useStoreStepUp();
  const downloadCarrier = useCarrierDownload();
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const ids = rows.map((r) => r.id);
  const n = rows.length;
  const entries = perms.write ? bulkEntries(rows.map((r) => r.states), viewerMovePerms((p) => (p === "orders.write" ? perms.write : p === "orders.assign" ? perms.assign : p === "shipments.write" ? perms.ship : false))) : [];
  const held = rows.filter((r) => r.shipAfter && Date.parse(r.shipAfter) > Date.now()).map((r) => r.id);

  const report = (res: BulkResult, verb: MessageKey) => {
    const skipped = res.failed.length;
    const why = skipped ? t(`ops.error.${res.failed[0]!.error}` as MessageKey) : "";
    const text = `${t(verb, { ok: res.ok.length })}${skipped ? ` · ${t("ops.bulk.skipped", { n: skipped })}: ${why}` : ""}`;
    return text;
  };

  const move = async (pick: MovePick) => {
    setBusy("move");
    const rollback = onOptimistic(ids, pick.label);
    const target = pick.reason ? { want: SHIP_LABELS.has(pick.label) ? { ship: pick.label } : { confirm: pick.label }, reason: pick.reason } : { legacy: pick.label };
    const res = await settle<BulkResult>(bulkMoveAction(ids, target, newIdem()));
    setBusy(null);
    if (!res.ok) {
      rollback(ids);
      toast.error(t(`ops.error.${res.error}` as MessageKey) === `ops.error.${res.error}` ? t("ops.error.generic") : t(`ops.error.${res.error}` as MessageKey));
      return;
    }
    rollback(res.data.failed.map((f) => f.id));
    const token = res.data.undo;
    const msg = report(res.data, "ops.bulk.moved");
    (res.data.failed.length ? toast.warning : toast.success)(msg, {
      duration: 10_000,
      ...(token && res.data.ok.length
        ? {
            action: {
              label: t("ops.bulk.undo"),
              onClick: async () => {
                const u = await settle(undoMoveAction(token));
                if (u.ok) toast.success(t("ops.bulk.undone"));
                else toast.error(t("ops.bulk.undoExpired"));
                onChanged();
              },
            },
          }
        : {}),
    });
    onClear();
    onChanged();
  };

  const assign = async (userId: string | null) => {
    setBusy("assign");
    const res = await settle<BulkResult>(bulkAssignAction(ids, userId, newIdem()));
    setBusy(null);
    if (!res.ok) return void toast.error(t("ops.error.generic"));
    toast.success(report(res.data, "ops.bulk.assigned"));
    onClear();
    onChanged();
  };

  const pin = async () => {
    setBusy("pin");
    const pinned = !rows.every((r) => r.pinned);
    const res = await settle<BulkResult>(bulkPinAction(ids, pinned, newIdem()));
    setBusy(null);
    if (!res.ok) return void toast.error(t("ops.error.generic"));
    toast.success(report(res.data, pinned ? "ops.bulk.pinned" : "ops.bulk.unpinned"));
    onChanged();
  };

  const exportSel = async () => {
    setBusy("export");
    await downloadFile(`${storeView.api("/orders/export")}?ids=${ids.join(",")}`, stepUp, "orders.csv");
    setBusy(null);
  };

  const carrierFile = async (spec: CarrierSpec | null) => {
    if (!spec) return setPicker(true);
    setBusy("carrier");
    const ok = await downloadCarrier(ids, held);
    setBusy(null);
    if (ok) onChanged();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="toolbar"
        aria-label={t("ops.bulk.toolbar")}
        className="adm-bulk-in pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-popover p-1.5 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10 adm-scroll"
      >
        <span className="flex shrink-0 items-center gap-2 ps-2.5 pe-2 text-[0.8125rem] font-medium tabular-nums">
          {t("ops.bulk.selected", { n })}
          {n >= BULK_MAX && <span className="text-xs font-normal text-muted-foreground">{t("ops.bulk.selectUpTo")}</span>}
        </span>
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        {perms.assign && <AssignMenu members={members} current={null} pending={busy === "assign"} onPick={(id) => void assign(id)} label={t("ops.bulk.assign")} />}
        {entries.length > 0 && <MoveMenu entries={entries} onMove={move} pending={busy === "move"} align="start" />}
        {perms.assign && (
          <BarButton onClick={() => void pin()} busy={busy === "pin"} icon={<PinIcon />}>
            {rows.every((r) => r.pinned) ? t("ops.drawer.unpin") : t("ops.drawer.pin")}
          </BarButton>
        )}
        {perms.export && (
          <BarButton onClick={() => void exportSel()} busy={busy === "export"} icon={<DownloadIcon />}>
            {t("ops.bulk.export")}
          </BarButton>
        )}
        {perms.ship && (
          <BarButton onClick={() => window.open(`${storeView.api("/orders/print")}?ids=${ids.join(",")}`, "_blank", "noopener")} icon={<PrinterIcon />}>
            {t("ops.bulk.slips")}
          </BarButton>
        )}
        {perms.ship && perms.export && (
          <BarButton onClick={() => void carrierFile(carrier)} busy={busy === "carrier"} icon={<FileSpreadsheetIcon />}>
            {t("ops.bulk.carrier")}
          </BarButton>
        )}
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-xl" onClick={onClear} aria-label={t("ops.bulk.clear")} title={t("ops.bulk.clear")}>
          <XIcon />
        </Button>
      </div>
      {picker && (
        <CarrierColumnsDialog
          open={picker}
          onOpenChange={setPicker}
          spec={carrier}
          onSaved={(spec) => {
            setPicker(false);
            onCarrier(spec);
            void carrierFile(spec);
          }}
        />
      )}
    </div>
  );
}

function BarButton({ onClick, busy, icon, children }: { onClick: () => void; busy?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button variant="ghost" className={cn("h-9 shrink-0 rounded-xl px-3 text-[0.8125rem]")} onClick={onClick} disabled={busy}>
      {busy ? <Loader2Icon className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}
