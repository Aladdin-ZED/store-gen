"use client";
/**
 * Console → AI, Prices (P7 AI; ai.md AI-§K.2 Prices, AI-§B.2): the price table in USD per million tokens with the
 * cache and batch columns; each row is editable (Save writes a confirmed row over the seed, Reset removes it); a model
 * in use without a row is flagged "price missing" (the router refuses to price it); a seed row the probe has not
 * confirmed carries the verify chip, a derived cell its note.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveAiPriceAction } from "@/app/admin/(console)/ai/actions";
import type { loadPrices } from "@/lib/ai/platform/console-read";
import { t } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

const c = (k: string, v?: Record<string, string | number>) => t(k, v, "en");
type Data = Awaited<ReturnType<typeof loadPrices>>;
type Row = Data["rows"][number];
const CELLS = ["in", "out", "cacheRead", "cacheWrite5m", "cacheWrite1h", "batchIn", "batchOut"] as const;
type Cell = (typeof CELLS)[number];

export function PricesTab({ d }: { d: Data }) {
  return (
    <section aria-label={c("ai.console.prices.title")} className="rounded-xl border bg-card">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{c("ai.console.prices.title")}</h2>
        <span className="text-xs text-muted-foreground">{d.probeAt ? c("ai.console.prices.probe", { at: d.probeAt.slice(0, 10) }) : c("ai.console.prices.no_probe")}</span>
      </header>
      <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(7,minmax(0,1fr))_minmax(0,1.4fr)] gap-2 border-b px-4 py-2 text-xs text-muted-foreground lg:grid">
        <span>{c("ai.console.prices.model")}</span>
        {CELLS.map((k) => (
          <span key={k} className="text-end">
            {c(`ai.console.prices.${k}`)}
          </span>
        ))}
        <span />
      </div>
      <div className="divide-y">
        {d.rows.map((r) => (
          <PriceRow key={r.model} r={r} />
        ))}
      </div>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{c("ai.console.prices.note")}</p>
    </section>
  );
}

function PriceRow({ r }: { r: Row }) {
  const ids = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState<Record<Cell, string>>(() => Object.fromEntries(CELLS.map((k) => [k, r.row ? String(r.row[k]) : ""])) as Record<Cell, string>);
  const dirty = CELLS.some((k) => v[k] !== (r.row ? String(r.row[k]) : ""));
  const complete = CELLS.every((k) => v[k] !== "" && Number.isFinite(Number(v[k])) && Number(v[k]) >= 0);
  return (
    <form
      className="px-4 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const row = Object.fromEntries(CELLS.map((k) => [k, Number(v[k])]));
        void run(() => saveAiPriceAction({ model: r.model, row }), (res) => setSaid(sayOf(res, c("ai.console.saved"))));
      }}
    >
      <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-4 lg:grid-cols-[minmax(0,2.2fr)_repeat(7,minmax(0,1fr))_minmax(0,1.4fr)]">
        <div className="col-span-2 min-w-0 sm:col-span-4 lg:col-span-1">
          <div className="truncate font-mono text-[13px]">{r.model}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
            {r.row === null ? <span className="rounded border border-destructive/40 px-1.5 text-destructive">{c("ai.console.prices.missing")}</span> : null}
            {r.verify ? <span className="rounded border px-1.5 text-muted-foreground">{c("ai.console.prices.verify")}</span> : null}
            {r.stored ? <span className="rounded border px-1.5 text-success-ink">{c("ai.console.prices.confirmed")}</span> : null}
            {r.inUse ? <span className="text-muted-foreground">{c("ai.console.prices.in_use")}</span> : null}
          </div>
        </div>
        {CELLS.map((k) => (
          <div key={k} className="min-w-0">
            <label htmlFor={`${ids}-${k}`} className="text-[11px] text-muted-foreground lg:sr-only">
              {c(`ai.console.prices.${k}`)}
            </label>
            <input
              id={`${ids}-${k}`}
              inputMode="decimal"
              className={cn("h-8 w-full min-w-0 rounded-md border bg-background px-2 text-end text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring", r.notes[k] && "border-dashed")}
              title={r.notes[k] ? c(`ai.console.prices.note_${r.notes[k]}`) : undefined}
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.value.replace(",", ".") })}
            />
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-end gap-1.5 sm:col-span-4 lg:col-span-1">
          <Spinner on={pending} />
          {r.stored ? (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => void run(() => saveAiPriceAction({ model: r.model, row: null }), (res) => setSaid(sayOf(res, c("ai.console.prices.reset_done"))))}>
              {c("ai.console.prices.reset")}
            </Button>
          ) : null}
          <Button type="submit" size="sm" variant={dirty ? "default" : "outline"} disabled={pending || !complete}>
            {r.stored ? c("ai.console.save") : c("ai.console.prices.confirm")}
          </Button>
        </div>
      </div>
      <Status said={said} className="mt-1" />
      {sheet}
    </form>
  );
}
