/**
 * Console → AI, Quality (P7 AI; ai.md AI-§K.2 Quality, AI-§O quality and Director dashboards, AI-§E.3): the guard
 * rejection heat-map (field × locale × provider, rates with their n), latency p50 / p95 per task and provider from
 * the rollups' histograms, the outcome counts (invalid_output, max_tokens, refusals, PII redactions, injection flags),
 * the flagged rows with the staff clear action for screened ones, and the Director dashboard.
 */
import type { loadDirector, loadHeatmap, loadInjectionFlags, loadLatency, loadOutcomes } from "@/lib/ai/platform/console-read";
import { ClearScreenedButton } from "./quality-client";
import { ago, c, DataRows, EmptyPreview, int, ms, Panel, pct, usd } from "./ui";

export function HeatmapPanel({ d }: { d: Awaited<ReturnType<typeof loadHeatmap>> }) {
  const cols = d.cols.slice(0, 8);
  return (
    <Panel title={c("ai.console.quality.heatmap")} meta={c("ai.console.days7")} bodyClassName="p-0">
      {d.rows.length === 0 ? (
        <div className="p-4">
          <EmptyPreview text={c("ai.console.quality.heatmap_none")} cols={5} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 text-start font-normal">
                  {c("ai.console.quality.field")}
                </th>
                {cols.map((col) => (
                  <th key={col.key} scope="col" className="px-2 py-2 text-end font-normal">
                    <span className="block">{col.locale}</span>
                    <span className="block text-[11px]">
                      {c(`ai.console.provider.${col.provider}`)} · n {int(col.n)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.rows.map((r) => (
                <tr key={r.field}>
                  <th scope="row" className="max-w-[200px] truncate px-4 py-1.5 text-start font-mono text-[12px] font-normal">
                    {r.field}
                  </th>
                  {cols.map((col, i) => {
                    const n = r.cells[i] ?? 0;
                    const rate = col.n ? n / col.n : 0;
                    return (
                      <td key={col.key} className="px-2 py-1.5 text-end tabular-nums">
                        <span className="inline-block min-w-14 rounded px-1.5 py-0.5" style={{ background: n ? `color-mix(in oklch, var(--destructive) ${Math.min(45, Math.round(rate * 300) + 6)}%, transparent)` : undefined }}>
                          {n ? pct(rate) : <span className="text-muted-foreground">0</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function LatencyPanel({ d }: { d: Awaited<ReturnType<typeof loadLatency>> }) {
  return (
    <Panel title={c("ai.console.quality.latency")} meta={c("ai.console.days7")}>
      <DataRows
        caption={c("ai.console.quality.latency")}
        cols={[
          { key: "task", label: c("ai.console.store.col.task"), primary: true, width: "minmax(0,2fr)" },
          { key: "provider", label: c("ai.console.store.col.provider") },
          { key: "n", label: "n", align: "end" },
          { key: "p50", label: "p50", align: "end" },
          { key: "p95", label: "p95", align: "end" },
        ]}
        rows={d.slice(0, 20).map((r) => ({ key: `${r.task}-${r.provider}`, cells: { task: <span className="font-mono text-[12.5px]">{r.task}</span>, provider: c(`ai.console.provider.${r.provider}`), n: int(r.n), p50: ms(r.p50), p95: ms(r.p95) } }))}
        empty={<EmptyPreview text={c("ai.console.quality.none")} cols={5} />}
      />
      <p className="mt-3 text-xs text-muted-foreground">{c("ai.console.quality.latency_note")}</p>
    </Panel>
  );
}

export function OutcomesPanel({ d }: { d: Awaited<ReturnType<typeof loadOutcomes>> }) {
  return (
    <Panel title={c("ai.console.quality.outcomes")} meta={c("ai.console.days7")}>
      <DataRows
        caption={c("ai.console.quality.outcomes")}
        cols={[
          { key: "task", label: c("ai.console.store.col.task"), primary: true, width: "minmax(0,2fr)" },
          { key: "n", label: "n", align: "end" },
          { key: "invalid", label: c("ai.console.quality.invalid"), align: "end" },
          { key: "max", label: c("ai.console.quality.max_tokens"), align: "end" },
          { key: "refused", label: c("ai.console.quality.refused"), align: "end" },
          { key: "pii", label: c("ai.console.quality.pii"), align: "end" },
          { key: "inj", label: c("ai.console.quality.injection"), align: "end" },
        ]}
        rows={d.map((r) => ({ key: r.task, cells: { task: <span className="font-mono text-[12.5px]">{r.task}</span>, n: int(r.n), invalid: int(r.invalid), max: int(r.maxTokens), refused: int(r.refused), pii: int(r.pii), inj: int(r.injection) } }))}
        empty={<EmptyPreview text={c("ai.console.quality.none")} cols={6} />}
      />
    </Panel>
  );
}

export function InjectionPanel({ d }: { d: Awaited<ReturnType<typeof loadInjectionFlags>> }) {
  return (
    <Panel title={c("ai.console.quality.flags")} meta={c("ai.console.days30")}>
      {d.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c("ai.console.quality.flags_none")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {d.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-[12.5px]">{r.task}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.handle} · {c(`ai.console.provider.${r.provider}`)} · {ago(r.at)}
                </div>
              </div>
              {r.screened ? <ClearScreenedButton runId={r.id} /> : <span className="text-xs text-muted-foreground">{c("ai.console.quality.flag_info")}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function DirectorPanel({ d }: { d: Awaited<ReturnType<typeof loadDirector>> }) {
  return (
    <Panel title={c("ai.console.quality.director")} meta={c("ai.console.days30")}>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground">{c("ai.console.quality.passes")}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{int(d.passes)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{c("ai.console.quality.cost_pass")}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{d.costPerPassMicros === null ? "-" : usd(d.costPerPassMicros)}</div>
        </div>
      </div>
      <DataRows
        caption={c("ai.console.quality.director")}
        cols={[
          { key: "task", label: c("ai.console.store.col.task"), primary: true, width: "minmax(0,1.6fr)" },
          { key: "class", label: c("ai.console.store.col.class"), width: "minmax(0,1.3fr)" },
          { key: "n", label: "n", align: "end" },
          { key: "p50", label: "p50", align: "end" },
          { key: "p95", label: "p95", align: "end" },
          { key: "fallback", label: c("ai.console.quality.fallback"), align: "end" },
          { key: "contra", label: c("ai.console.quality.contradictions"), align: "end" },
        ]}
        rows={d.rows.map((r) => ({
          key: `${r.task}-${r.class}`,
          cells: {
            task: <span className="font-mono text-[12.5px]">{r.task}</span>,
            class: r.class === "-" ? "-" : c(`ai.console.class.${r.class}`),
            n: int(r.n),
            p50: ms(r.p50),
            p95: ms(r.p95),
            fallback: `${int(r.fallback)}`,
            contra: `${int(r.contradiction)}`,
          },
        }))}
        empty={<EmptyPreview text={c("ai.console.quality.director_none")} cols={6} />}
      />
      <p className="mt-3 text-xs text-muted-foreground">{c("ai.console.quality.director_note")}</p>
    </Panel>
  );
}
