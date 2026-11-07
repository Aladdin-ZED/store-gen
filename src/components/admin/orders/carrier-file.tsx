"use client";

/**
 * The Carrier file (P4 CALL CENTER; operations.md OPE-§12.8, OD55, OD64): the first use opens the column picker (the
 * fixed sources of the `manifest` kind, the header the carrier's portal expects, drag order, the delimiter, "Mark
 * exported orders as packed"), saved to ops.carrierCsv; then the download goes through the step-up sheet and
 * src/components/admin/lib/download.ts. Held orders (OD49) are left out on the client and named in a toast; the route
 * refuses them anyway.
 */
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveCarrierCsvColumnsAction } from "@/app/app/[store]/orders/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { OrdersBoot } from "@/lib/admin-data/orders";
import type { ManifestSource } from "@/lib/callcenter/carrier-csv";
import type { MessageKey } from "@/lib/i18n/admin";
import { dirOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { downloadFile } from "../lib/download";
import { useStoreStepUp } from "../shell/step-up";
import { useStore } from "../shell/store-context";
import { settle } from "./ops-ui";

export type CarrierSpec = NonNullable<OrdersBoot["carrierCsv"]>;
type Col = { key: number; header: string; source: ManifestSource; value?: string };

/** carrier-csv.ts MANIFEST_SOURCES, kept here so the phone library stays out of the browser bundle */
const MANIFEST_SOURCES = ["order_id", "name", "phone", "city", "address", "landmark", "cod_amount", "content", "qty", "note", "constant"] as const satisfies readonly ManifestSource[];

const STARTER: ManifestSource[] = ["order_id", "name", "phone", "city", "address", "cod_amount", "content", "qty"];

/**
 * Download the Carrier file of `ids` (the spec must exist); true when a file was saved. R2 (OPS-27, OPE-§M.2; contract
 * step C2-E): `format: "xlsx"` asks S4's route for the Excel file (S3's writer); the default is today's CSV.
 */
export function useCarrierDownload() {
  const storeView = useStore();
  const stepUp = useStoreStepUp();
  const t = useT();
  return async (ids: readonly string[], heldIds: readonly string[], format: "csv" | "xlsx" = "csv"): Promise<boolean> => {
    const go = ids.filter((id) => !heldIds.includes(id));
    if (heldIds.length) toast.message(t("ops.carrier.heldLeftOut", { n: heldIds.length }));
    if (!go.length) return false;
    const xlsx = format === "xlsx" ? "&format=xlsx" : "";
    return downloadFile(`${storeView.api("/orders/carrier-csv")}?ids=${go.join(",")}&partial=1${xlsx}`, stepUp, xlsx ? "carrier.xlsx" : "carrier.csv");
  };
}

export function CarrierColumnsDialog({ open, onOpenChange, spec, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; spec: CarrierSpec | null; onSaved: (spec: CarrierSpec) => void }) {
  const t = useT();
  const dir = dirOf(useAdminLocale());
  const [cols, setCols] = useState<Col[]>(() =>
    (spec?.columns.length ? spec.columns : STARTER.map((s): CarrierSpec["columns"][number] => ({ source: s, header: "" }))).map((c, i) => ({ key: i, header: c.header, source: c.source as ManifestSource, ...(c.value ? { value: c.value } : {}) })),
  );
  const [delimiter, setDelimiter] = useState<"," | ";">(spec?.delimiter ?? ";");
  const [markPacked, setMarkPacked] = useState(spec?.markPacked ?? true);
  const [drag, setDrag] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (s: ManifestSource) => t(`ops.carrier.src.${s}` as MessageKey);

  const move = (from: number, to: number) =>
    setCols((cur) => {
      if (to < 0 || to >= cur.length || from === to) return cur;
      const next = [...cur];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });

  const save = async () => {
    const columns = cols.map((c) => ({ header: c.header.trim() || label(c.source), source: c.source, ...(c.source === "constant" ? { value: c.value ?? "" } : {}) }));
    setBusy(true);
    const res = await settle(saveCarrierCsvColumnsAction({ columns, delimiter, markPacked }));
    setBusy(false);
    if (!res.ok) {
      toast.error(t("ops.carrier.invalid"));
      return;
    }
    onSaved({ columns, delimiter, markPacked });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent dir={dir} className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("ops.carrier.title")}</DialogTitle>
          <DialogDescription>{t("ops.carrier.hint")}</DialogDescription>
        </DialogHeader>
        <div className="adm-scroll -mx-1 grid content-start gap-4 overflow-y-auto px-1">
          <ol className="grid gap-1.5">
            {cols.map((c, i) => (
              <li
                key={c.key}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag !== null && drag !== i) {
                    move(drag, i);
                    setDrag(i);
                  }
                }}
                onDragEnd={() => setDrag(null)}
                className={cn("grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 rounded-xl p-1.5 ring-1 ring-border transition-shadow ring-inset", drag === i && "shadow-md ring-foreground/20")}
              >
                <span className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing" aria-hidden="true">
                  <GripVerticalIcon className="size-4" />
                </span>
                <select
                  value={c.source}
                  aria-label={t("ops.carrier.source")}
                  onChange={(e) => setCols((cur) => cur.map((x) => (x.key === c.key ? { ...x, source: e.target.value as ManifestSource } : x)))}
                  className="h-9 min-w-0 rounded-lg border border-input bg-background px-2 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {MANIFEST_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
                {c.source === "constant" ? (
                  <span className="grid min-w-0 grid-cols-2 gap-1.5">
                    <input value={c.header} maxLength={60} placeholder={t("ops.carrier.header")} aria-label={t("ops.carrier.header")} onChange={(e) => setCols((cur) => cur.map((x) => (x.key === c.key ? { ...x, header: e.target.value } : x)))} className="h-9 min-w-0 rounded-lg border border-input bg-transparent px-2 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
                    <input value={c.value ?? ""} maxLength={60} placeholder={t("ops.carrier.value")} aria-label={t("ops.carrier.value")} onChange={(e) => setCols((cur) => cur.map((x) => (x.key === c.key ? { ...x, value: e.target.value } : x)))} className="h-9 min-w-0 rounded-lg border border-input bg-transparent px-2 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
                  </span>
                ) : (
                  <input value={c.header} maxLength={60} placeholder={label(c.source)} aria-label={t("ops.carrier.header")} onChange={(e) => setCols((cur) => cur.map((x) => (x.key === c.key ? { ...x, header: e.target.value } : x)))} className="h-9 min-w-0 rounded-lg border border-input bg-transparent px-2 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
                )}
                <span className="flex items-center">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t("ops.carrier.up")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] disabled:opacity-30">
                    <ArrowUpIcon className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === cols.length - 1} aria-label={t("ops.carrier.down")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] disabled:opacity-30">
                    <ArrowDownIcon className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => setCols((cur) => cur.filter((x) => x.key !== c.key))} disabled={cols.length === 1} aria-label={t("ops.carrier.remove")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30">
                    <Trash2Icon className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {cols.length < 20 && (
            <Button type="button" variant="ghost" size="sm" className="justify-self-start rounded-full" onClick={() => setCols((cur) => [...cur, { key: Date.now(), header: "", source: "note" }])}>
              <PlusIcon /> {t("ops.carrier.add")}
            </Button>
          )}
          <div className="grid gap-3 rounded-xl bg-foreground/[0.025] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-medium">{t("ops.carrier.delimiter")}</span>
              <div role="radiogroup" className="flex gap-1 rounded-full bg-background p-0.5 ring-1 ring-border">
                {([";", ","] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={delimiter === d} onClick={() => setDelimiter(d)} className={cn("h-7 rounded-full px-3 text-xs font-medium", delimiter === d ? "bg-foreground text-background" : "text-muted-foreground")}>
                    {d === ";" ? t("ops.carrier.semicolon") : t("ops.carrier.comma")}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[0.8125rem]">{t("ops.carrier.markPacked")}</span>
              <Switch checked={markPacked} onCheckedChange={setMarkPacked} />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("ops.common.cancel")}
          </Button>
          <Button className="rounded-full" onClick={() => void save()} disabled={busy || !cols.length}>
            {busy && <Loader2Icon className="animate-spin" />}
            {t("ops.carrier.saveAndDownload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
