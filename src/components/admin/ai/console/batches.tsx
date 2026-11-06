"use client";
/**
 * Console → AI, Batches (P7 AI; ai.md AI-§K.2 Batches, AI-§B.8): open and recent Message Batches (kind, items, state,
 * cost); Cancel on an open one (the provider's cancel, then the cron ingests what ended), Retry on the failed items
 * of any batch (queued again for the next submission).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelAiBatchAction, retryAiBatchItemsAction } from "@/app/admin/(console)/ai/actions";
import type { loadBatches } from "@/lib/ai/platform/console-read";
import { t } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

const c = (k: string, v?: Record<string, string | number>) => t(k, v, "en");
type Data = Awaited<ReturnType<typeof loadBatches>>;
type Batch = Data["open"][number];
const int = (n: number) => new Intl.NumberFormat("en-GB").format(n);
const usd = (m: number | null) => (m === null ? "-" : `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(m / 1_000_000)}`);
const OPEN = new Set(["building", "submitted", "in_progress"]);

/** The non-zero outcome counts ("15 ok · 2 errored · 1 expired"), or a dash while nothing ended. */
const outcomeOf = (b: { succeeded: number; errored: number; expired: number; canceled: number }): string => {
  const parts = (
    [
      ["ok", b.succeeded],
      ["errored", b.errored],
      ["expired", b.expired],
      ["canceled", b.canceled],
    ] as const
  ).filter(([, n]) => n > 0);
  return parts.length ? parts.map(([k, n]) => c(`ai.console.batches.n_${k}`, { n: int(n) })).join(" · ") : "-";
};

export function BatchesTab({ d }: { d: Data }) {
  return (
    <div className="space-y-4">
      <BatchList title={c("ai.console.batches.open")} rows={d.open} empty={c("ai.console.batches.open_none")} />
      <BatchList title={c("ai.console.batches.recent")} rows={d.recent} empty={c("ai.console.batches.recent_none")} />
    </div>
  );
}

function BatchList({ title, rows, empty }: { title: string; rows: Batch[]; empty: string }) {
  return (
    <section aria-label={title} className="rounded-xl border bg-card">
      <header className="flex min-h-11 items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{int(rows.length)}</span>
      </header>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.6fr)] gap-3 border-b px-4 py-2 text-xs text-muted-foreground md:grid">
            <span>{c("ai.console.batches.kind")}</span>
            <span>{c("ai.console.batches.state")}</span>
            <span className="text-end">{c("ai.console.batches.items")}</span>
            <span className="text-end">{c("ai.console.batches.outcome")}</span>
            <span className="text-end">{c("ai.console.batches.cost")}</span>
            <span />
          </div>
          <div className="divide-y">
            {rows.map((b) => (
              <BatchRow key={b.id} b={b} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BatchRow({ b }: { b: Batch }) {
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const failed = b.status === "failed" || b.status === "expired";
  return (
    <div className="px-4 py-2.5">
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1 text-sm md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="col-span-2 min-w-0 md:col-span-1">
          <div className="truncate">{c(`ai.console.batch_kind.${b.kind}`)}</div>
          <div className="truncate font-mono text-[11.5px] text-muted-foreground" title={b.id}>
            {b.model} · {b.createdAt.slice(0, 16).replace("T", " ")}
          </div>
        </div>
        <span className={cn("text-xs font-medium", failed ? "text-destructive" : b.status === "ended" ? "text-success-ink" : "text-foreground")}>{c(`ai.console.batch_state.${b.status}`)}</span>
        <span className="text-end tabular-nums">{int(b.items)}</span>
        <span className="col-span-2 text-xs text-muted-foreground tabular-nums md:col-span-1 md:text-end">{outcomeOf(b)}</span>
        <span className="tabular-nums md:text-end">{usd(b.costMicros)}</span>
        <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
          <Spinner on={pending} />
          {b.failedItems > 0 ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void run(() => retryAiBatchItemsAction({ batchId: b.id }), (r) => setSaid(sayOf(r, r.ok && r.data.ok ? c("ai.console.batches.retried", { n: r.data.value.items }) : undefined)))}>
              {c("ai.console.batches.retry", { n: int(b.failedItems) })}
            </Button>
          ) : null}
          {OPEN.has(b.status) ? (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => cancelAiBatchAction({ id: b.id }), (r) => setSaid(sayOf(r, c("ai.console.batches.canceling"))))}>
              {c("ai.console.cancel")}
            </Button>
          ) : null}
        </div>
      </div>
      <Status said={said} className="mt-1" />
      {sheet}
    </div>
  );
}
