/**
 * The store profile's AI tab (P7 AI; ai.md AI-§K.4; mounted by P1 in the console store profile, and by Console → AI →
 * Stores at /admin/ai/stores/<id>): `<StoreAiTab ctx storeId />` reads `aiStoreSummary(ctx, storeId)` (console.read
 * through `platformScope`) and shows the store's choices, credits (month, day, boosts), passes today, the month's cost,
 * runs by task, class and provider with latency, refusals and fallbacks, the guard-rejection heat-map, open jobs and
 * the last 50 runs. Metadata only: no prompt, output or memory text (store content only through "View as store").
 * Each part is its own panel, failing alone.
 */
import { aiStoreSummary, type AiStoreSummary } from "@/lib/ai/summary.server";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { ago, c, DataRows, EmptyPreview, int, Lines, Meter, ms, Panel, Section, State, usd } from "./ui";

export function StoreAiTab({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  // one read shared by the panels (each still renders its own error state)
  const data = aiStoreSummary(ctx, storeId);
  // the panels await it; this marks a refusal handled before the first of them does
  data.catch(() => undefined);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <Section title={c("ai.console.store.choices")} rows={5} load={() => data} render={(s) => <Choices s={s} />} />
      <Section title={c("ai.console.store.credits")} rows={5} load={() => data} render={(s) => <Credits s={s} />} />
      <Section title={c("ai.console.store.jobs")} rows={4} load={() => data} render={(s) => <Today s={s} />} />
      <Section title={c("ai.console.store.runs")} rows={6} className="lg:col-span-2" load={() => data} render={(s) => <Runs s={s} />} />
      <Section title={c("ai.console.store.heatmap")} rows={6} load={() => data} render={(s) => <Rejections s={s} />} />
      <Section title={c("ai.console.store.recent")} rows={8} className="lg:col-span-3" load={() => data} render={(s) => <Recent s={s} />} />
    </div>
  );
}

function Choices({ s }: { s: AiStoreSummary }) {
  return (
    <Panel title={c("ai.console.store.choices")}>
      <Lines
        items={[
          { label: c("ai.console.store.mode"), value: c(`ai.console.store.mode.${s.mode}`) },
          { label: c("ai.console.store.director"), value: s.director ? c(`ai.console.store.director.${s.director}`) : c("ai.console.store.director.default") },
          { label: c("ai.console.store.deep"), value: <State tone={s.deepPass ? "plain" : "muted"}>{s.deepPass ? c("ai.console.on") : c("ai.console.off")}</State> },
          { label: c("ai.console.store.learning"), value: <State tone={s.learning.learn ? "plain" : "muted"}>{s.learning.learn ? c("ai.console.on") : c("ai.console.off")}</State> },
          { label: c("ai.console.store.share"), value: <State tone={s.learning.share ? "plain" : "muted"}>{s.learning.share ? c("ai.console.on") : c("ai.console.off")}</State> },
        ]}
      />
    </Panel>
  );
}

function Credits({ s }: { s: AiStoreSummary }) {
  const m = s.credits.month;
  const d = s.credits.day;
  return (
    <Panel title={c("ai.console.store.credits")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xl font-semibold tabular-nums">{int(m.used)}</span>
        <span className="text-xs text-muted-foreground">{m.limit === null ? c("ai.console.store.unlimited") : c("ai.console.store.of", { n: int(m.limit) })}</span>
      </div>
      <div className="mt-2">
        <Meter fraction={m.limit ? m.used / m.limit : null} label={c("ai.console.store.credits")} />
      </div>
      <Lines
        items={[
          { label: c("ai.console.store.today"), value: d.limit === null ? int(d.used) : c("ai.console.store.used_of", { used: int(d.used), limit: int(d.limit) }) },
          { label: c("ai.console.store.boosts"), value: int(s.credits.boosts) },
          { label: c("ai.console.store.cost"), value: usd(s.costMicrosMonth) },
        ]}
      />
    </Panel>
  );
}

function Today({ s }: { s: AiStoreSummary }) {
  return (
    <Panel title={c("ai.console.store.jobs")}>
      <Lines
        items={[
          { label: c("ai.console.store.director_passes"), value: int(s.passesToday.director) },
          { label: c("ai.console.store.deep_passes"), value: int(s.passesToday.deep) },
          { label: c("ai.console.store.open_jobs"), value: <State tone={s.openJobs ? "plain" : "muted"}>{int(s.openJobs)}</State> },
        ]}
      />
    </Panel>
  );
}

function Runs({ s }: { s: AiStoreSummary }) {
  const groups = (["provider", "class", "task"] as const).map((by) => ({ by, rows: s.runs.filter((r) => r.by === by) }));
  return (
    <Panel title={c("ai.console.store.runs")} meta={c("ai.console.store.month")}>
      {s.runs.length === 0 ? (
        <EmptyPreview text={c("ai.console.store.no_runs")} cols={6} />
      ) : (
        <div className="space-y-5">
          {groups
            .filter((g) => g.rows.length)
            .map((g) => (
              <div key={g.by}>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">{c(`ai.console.store.by.${g.by}`)}</h3>
                <DataRows
                  caption={c(`ai.console.store.by.${g.by}`)}
                  cols={[
                    { key: "key", label: c(`ai.console.store.col.${g.by}`), primary: true, width: "minmax(0,1.8fr)" },
                    { key: "n", label: c("ai.console.store.col.runs"), align: "end" },
                    { key: "p50", label: "p50", align: "end" },
                    { key: "p95", label: "p95", align: "end" },
                    { key: "refusals", label: c("ai.console.store.col.refusals"), align: "end" },
                    { key: "fallbacks", label: c("ai.console.store.col.fallbacks"), align: "end" },
                  ]}
                  rows={g.rows.map((r) => ({
                    key: `${g.by}-${r.key}`,
                    cells: {
                      key: g.by === "task" ? <span className="font-mono text-[12.5px]">{r.key}</span> : c(g.by === "class" ? `ai.console.class.${r.key}` : `ai.console.provider.${r.key}`),
                      n: int(r.n),
                      p50: ms(r.p50Ms),
                      p95: ms(r.p95Ms),
                      refusals: int(r.refusals),
                      fallbacks: int(r.fallbacks),
                    },
                  }))}
                />
              </div>
            ))}
        </div>
      )}
    </Panel>
  );
}

function Rejections({ s }: { s: AiStoreSummary }) {
  const max = Math.max(1, ...s.rejections.map((r) => r.n));
  return (
    <Panel title={c("ai.console.store.heatmap")} meta={c("ai.console.store.month")}>
      {s.rejections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c("ai.console.store.no_rejections")}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {s.rejections.slice(0, 12).map((r) => (
            <li key={`${r.task}-${r.field}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <span className="relative min-w-0 overflow-hidden rounded px-2 py-1">
                <span aria-hidden className="absolute inset-y-0 start-0 bg-destructive/10" style={{ width: `${(r.n / max) * 100}%` }} />
                <span className="relative block truncate font-mono text-[12px]">
                  {r.task} · {r.field}
                </span>
              </span>
              <span className="tabular-nums">{int(r.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Recent({ s }: { s: AiStoreSummary }) {
  const tone = (st: string) => (st === "ok" ? "ok" : st === "running" ? "muted" : st === "quota" || st === "cancelled" ? "muted" : "danger");
  return (
    <Panel title={c("ai.console.store.recent")} meta={c("ai.console.store.recent_meta")}>
      <DataRows
        caption={c("ai.console.store.recent")}
        cols={[
          { key: "task", label: c("ai.console.store.col.task"), primary: true, width: "minmax(0,1.6fr)" },
          { key: "class", label: c("ai.console.store.col.class") },
          { key: "provider", label: c("ai.console.store.col.provider") },
          { key: "model", label: c("ai.console.store.col.model"), width: "minmax(0,1.4fr)" },
          { key: "status", label: c("ai.console.store.col.status") },
          { key: "credits", label: c("ai.console.store.col.credits"), align: "end" },
          { key: "ms", label: c("ai.console.store.col.ms"), align: "end" },
          { key: "at", label: c("ai.console.store.col.at"), align: "end" },
        ]}
        rows={s.recent.map((r) => ({
          key: r.id,
          cells: {
            task: <span className="font-mono text-[12.5px]">{r.task}</span>,
            class: r.class ? c(`ai.console.class.${r.class}`) : "-",
            provider: c(`ai.console.provider.${r.provider}`),
            model: <span className="font-mono text-[12px] text-muted-foreground">{r.model ?? "-"}</span>,
            status: <State tone={tone(r.status)}>{r.status}</State>,
            credits: int(r.credits),
            ms: ms(r.ms),
            at: <span className="text-muted-foreground">{ago(r.at)}</span>,
          },
        }))}
        empty={<EmptyPreview text={c("ai.console.store.no_runs")} cols={6} />}
      />
    </Panel>
  );
}
