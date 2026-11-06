/**
 * Console → AI, Overview (P7 AI; ai.md AI-§K.2 Overview, AI-§O, AI-§F.9): the status tile (key source only, the
 * classes' reachability with the measured tok/s against the 150 tok/s assumption, breaker, transports, the stage-driver
 * shares of 7 days), the month's spend against the cap with its labelled straight-line forecast and the pending
 * stores' share, refusals and fallbacks over 7 days, jobs and batches, the alerts, the ten KPIs and the Director
 * default. Each part is its own panel (./ui.tsx `Section`).
 */
import Link from "next/link";
import type { loadKpis, loadReliability, loadSpend, loadStatus } from "@/lib/ai/platform/console-read";
import { consoleHref, PENDING_SHARE_WARN_PCT, TOK_PER_SEC_TARGET } from "@/lib/ai/platform/console-view";
import { DirectorDefaultControl } from "./director-default";
import { ago, c, int, Lines, Meter, Panel, pct, RateWithN, Sparkline, Stat, State, usd, type Tone } from "./ui";

type StatusData = Awaited<ReturnType<typeof loadStatus>>;
type SpendData = Awaited<ReturnType<typeof loadSpend>>;
type ReliabilityData = Awaited<ReturnType<typeof loadReliability>>;
type KpiData = Awaited<ReturnType<typeof loadKpis>>;

const STATE_TONE: Record<string, Tone> = { ok: "ok", paused: "warn", unavailable: "danger" };

/** An age in minutes as minutes, hours or days. */
const ageOf = (min: number | null): string => (min === null ? "-" : min < 120 ? c("ai.console.minutes", { n: int(min) }) : min < 2_880 ? c("ai.console.hours", { n: int(min / 60) }) : c("ai.console.days", { n: int(min / 1_440) }));

export function StatusPanel({ d }: { d: StatusData }) {
  const h = d.health;
  const shares = (["after", "poll", "cron", "batch"] as const).map((k) => ({ k, n: d.drivers.counts[k] ?? 0 }));
  return (
    <Panel title={c("ai.console.status.title")} meta={d.probeAt ? c("ai.console.status.probe", { when: ago(d.probeAt) }) : c("ai.console.status.no_probe")}>
      {h.keySource === "none" ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm">
          <span>{c("ai.console.status.no_key")}</span>
          <Link href={consoleHref.setKey} className="font-medium text-brand underline-offset-4 hover:underline">
            {c("ai.console.settings.key.set")}
          </Link>
        </div>
      ) : null}
      <Lines
        items={[
          { label: c("ai.console.status.key"), value: <State tone={h.keySource === "none" ? "danger" : "plain"}>{c(`ai.console.key_source.${h.keySource}`)}</State> },
          { label: c("ai.console.status.cloud"), value: <State tone={h.enabled ? "ok" : "muted"}>{h.enabled ? c("ai.console.on") : c("ai.console.off")}</State> },
          {
            label: c("ai.console.status.kill"),
            value: (
              <span className="inline-flex items-center gap-2">
                <State tone={d.killSwitch ? "danger" : "ok"}>{d.killSwitch ? c("ai.console.status.kill_on") : c("ai.console.status.kill_off")}</State>
                <Link href={consoleHref.flags} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  {c("ai.console.status.flags")}
                </Link>
              </span>
            ),
          },
          { label: c("ai.console.status.breaker"), value: <State tone={h.breaker === "closed" ? "ok" : h.breaker === "half_open" ? "warn" : "danger"}>{c(`ai.console.breaker.${h.breaker}`)}</State> },
          { label: c("ai.console.status.transport"), value: `${c(`ai.console.transport.${h.transport}`)} · ${c(`ai.console.deep.${h.deepTransport}`)}` },
          { label: c("ai.console.status.last_ok"), value: ago(h.lastOkAt) },
        ]}
      />
      <h3 className="mb-1 mt-5 text-xs font-medium text-muted-foreground">{c("ai.console.status.classes")}</h3>
      <div className="divide-y text-sm">
        {d.classes.map((k) => (
          <div key={k.class} className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-1.5">
            <div className="min-w-0">
              <div className="truncate">{c(`ai.console.class.${k.class}`)}</div>
              <div className="truncate font-mono text-[11.5px] text-muted-foreground" title={k.info?.display_name ?? k.model ?? undefined}>
                {k.model}
              </div>
            </div>
            <div className="flex items-center gap-4 text-end tabular-nums">
              <span className={k.tokPerSec !== null && k.tokPerSec < TOK_PER_SEC_TARGET && k.class.startsWith("director") ? "text-destructive" : "text-muted-foreground"}>
                {k.tokPerSec === null ? c("ai.console.status.tok_unmeasured") : c("ai.console.status.tok", { n: int(k.tokPerSec) })}
              </span>
              <State tone={STATE_TONE[k.state] ?? "plain"}>{c(`ai.console.class_state.${k.state}`)}</State>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{c("ai.console.status.tok_target", { n: TOK_PER_SEC_TARGET })}</p>
      <h3 className="mb-1.5 mt-5 text-xs font-medium text-muted-foreground">{c("ai.console.status.drivers", { n: int(d.drivers.n) })}</h3>
      {d.drivers.n === 0 ? (
        <p className="text-sm text-muted-foreground">{c("ai.console.status.drivers_none")}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {shares.map((s) => (
            <div key={s.k} className="min-w-0 rounded-md bg-muted/50 px-2.5 py-2">
              <div className="truncate text-[11.5px] text-muted-foreground">{c(`ai.console.driver.${s.k}`)}</div>
              <div className="text-sm font-medium tabular-nums">{pct(s.n / d.drivers.n, 0)}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function SpendPanel({ d }: { d: SpendData }) {
  const used = d.capMicros ? d.monthMicros / d.capMicros : null;
  const tone: Tone = d.usedPct === null ? "plain" : d.usedPct >= 100 ? "danger" : d.usedPct >= 85 ? "danger" : d.usedPct >= 70 ? "warn" : "plain";
  const pendingTone: Tone = d.pendingUsedPct !== null && d.pendingUsedPct >= PENDING_SHARE_WARN_PCT ? "warn" : "plain";
  return (
    <Panel title={c("ai.console.spend.title")} meta={d.month}>
      <div className="flex items-start justify-between gap-4">
        <Stat label={c("ai.console.spend.mtd")} value={usd(d.monthMicros)} tone={tone} sub={d.capMicros === null ? c("ai.console.spend.no_cap") : c("ai.console.spend.of_cap", { cap: usd(d.capMicros), pct: d.usedPct ?? 0 })} />
        <Sparkline points={d.series.map((s) => s.micros)} label={c("ai.console.spend.spark", { n: d.series.length })} />
      </div>
      <div className="mt-3">
        <Meter fraction={used} label={c("ai.console.spend.mtd")} />
      </div>
      <Lines
        items={[
          { label: c("ai.console.spend.forecast"), value: <span title={c("ai.console.spend.forecast_how")}>{usd(d.forecastMicros)}</span> },
          {
            label: c("ai.console.spend.pending", { pct: d.pendingSharePct }),
            value: <State tone={pendingTone}>{d.pendingCapMicros === null ? usd(d.pendingMicros) : c("ai.console.spend.pending_value", { used: usd(d.pendingMicros), cap: usd(d.pendingCapMicros), pct: d.pendingUsedPct ?? 0 })}</State>,
          },
        ]}
      />
      <p className="mt-2 text-xs text-muted-foreground">{c("ai.console.spend.forecast_note", { days: Math.floor(d.elapsedDays), of: d.daysInMonth })}</p>
    </Panel>
  );
}

export function ReliabilityPanel({ d }: { d: ReliabilityData }) {
  const refusal = d.runs ? d.refused / d.runs : null;
  return (
    <Panel title={c("ai.console.rel.title")} meta={c("ai.console.days7")}>
      {d.runs === 0 ? (
        <p className="text-sm text-muted-foreground">{c("ai.console.rel.none")}</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <Stat label={c("ai.console.rel.runs")} value={int(d.runs)} sub={c("ai.console.rel.cache", { pct: pct(d.cacheHits / d.runs) })} />
            <Sparkline points={d.series.map((s) => s.runs)} label={c("ai.console.rel.spark", { n: d.series.length })} />
          </div>
          <Lines
            items={[
              { label: c("ai.console.rel.refusals"), value: <RateWithN value={refusal} n={d.runs} tone={refusal !== null && refusal > 0.05 ? "danger" : "plain"} /> },
              { label: c("ai.console.rel.fallbacks"), value: <RateWithN value={d.fallbacks / d.runs} n={d.runs} /> },
              { label: c("ai.console.rel.invalid"), value: <RateWithN value={d.invalid / d.runs} n={d.runs} /> },
              { label: c("ai.console.rel.errors"), value: int(d.errors) },
            ]}
          />
        </>
      )}
    </Panel>
  );
}

export function JobsPanel({ d }: { d: StatusData }) {
  const h = d.health;
  return (
    <Panel title={c("ai.console.jobs.title")}>
      <div className="grid grid-cols-3 gap-4">
        <Stat label={c("ai.console.jobs.running")} value={int(h.jobs.running)} />
        <Stat label={c("ai.console.jobs.orphaned")} value={int(h.jobs.orphaned)} tone={h.jobs.orphaned > 0 ? "warn" : "plain"} />
        <Stat label={c("ai.console.jobs.failed")} value={int(h.jobs.failed24h)} tone={h.jobs.failed24h > 0 ? "warn" : "plain"} />
      </div>
      <Lines
        items={[
          { label: c("ai.console.jobs.batches"), value: <Link href={consoleHref.batches} className="underline-offset-4 hover:underline">{int(h.batches.open)}</Link> },
          { label: c("ai.console.jobs.oldest"), value: ageOf(h.batches.oldestAgeMin) },
          { label: c("ai.console.jobs.detached"), value: <State tone={h.detachedJobs.flag ? "ok" : "muted"}>{h.detachedJobs.flag ? c("ai.console.on") : c("ai.console.off")}</State> },
          { label: c("ai.console.jobs.director_refusals"), value: int(h.directorShareRefusals24h) },
        ]}
      />
    </Panel>
  );
}

/** The alarms AI-§O lists that the health read can show now (spend, key, classes, breaker, jobs, pending share). */
export function AlertsPanel({ status, spend }: { status: StatusData; spend: SpendData }) {
  const h = status.health;
  const out: { tone: Tone; text: string }[] = [];
  if (h.keySource === "none") out.push({ tone: "danger", text: c("ai.console.alert.no_key") });
  if (h.breaker !== "closed") out.push({ tone: "danger", text: c("ai.console.alert.breaker") });
  for (const k of h.classes) if (k.state === "unavailable") out.push({ tone: "danger", text: c("ai.console.alert.class_down", { cls: c(`ai.console.class.${k.class}`) }) });
  if (spend.usedPct !== null && spend.usedPct >= 70) out.push({ tone: spend.usedPct >= 85 ? "danger" : "warn", text: c("ai.console.alert.spend", { pct: spend.usedPct }) });
  if (spend.pendingUsedPct !== null && spend.pendingUsedPct >= PENDING_SHARE_WARN_PCT) out.push({ tone: "warn", text: c("ai.console.alert.pending", { pct: spend.pendingUsedPct }) });
  if (h.jobs.orphaned > 0) out.push({ tone: "warn", text: c("ai.console.alert.orphans", { n: h.jobs.orphaned }) });
  if (h.refusalRate24h !== null && h.refusalRate24h > 0.05) out.push({ tone: "warn", text: c("ai.console.alert.refusals", { pct: pct(h.refusalRate24h) }) });
  for (const k of status.classes) if (k.class.startsWith("director") && k.tokPerSec !== null && k.tokPerSec < TOK_PER_SEC_TARGET) out.push({ tone: "warn", text: c("ai.console.alert.slow", { cls: c(`ai.console.class.${k.class}`), n: int(k.tokPerSec) }) });
  if (h.canary) out.push({ tone: "plain", text: c("ai.console.alert.canary", { version: h.canary.promptVersion }) });
  return (
    <Panel title={c("ai.console.alerts.title")} meta={out.length ? int(out.length) : undefined}>
      {out.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c("ai.console.alerts.none")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {out.map((a, i) => (
            <li key={i} className="flex gap-2">
              <State tone={a.tone} className="shrink-0">
                {a.tone === "danger" ? c("ai.console.alert.act") : a.tone === "warn" ? c("ai.console.alert.watch") : c("ai.console.alert.info")}
              </State>
              <span className="min-w-0">{a.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function kpiValue(unit: string, v: number): string {
  if (unit === "pct" || unit === "ratio") return pct(v);
  if (unit === "usd") return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(v)}`;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v);
}

export function KpiPanel({ d }: { d: KpiData }) {
  return (
    <Panel title={c("ai.console.kpi.title")} meta={c("ai.console.kpi.meta")} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 text-start font-normal">
                {c("ai.console.kpi.metric")}
              </th>
              {d.quarters.map((q) => (
                <th key={q} scope="col" className="px-3 py-2 text-end font-normal tabular-nums">
                  {q}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {d.rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="px-4 py-2 text-start font-normal">
                  {c(`ai.console.kpi.${r.id}`)}
                </th>
                {r.cells.map((cell, i) => (
                  <td key={i} className="whitespace-nowrap px-3 py-2 text-end tabular-nums">
                    {cell.value !== null ? (
                      <span>
                        {kpiValue(r.unit, cell.value)}
                        <span className="text-xs text-muted-foreground"> · n {int(cell.n)}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.minimum > 0 ? c("ai.console.kpi.needs", { min: int(r.minimum), have: int(cell.n) }) : c(`ai.console.kpi.later.${r.id}`)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function DirectorDefaultPanel({ auto, test }: { auto: boolean; test: { runId: string; lowerBound: number; at: string } | null }) {
  return (
    <Panel title={c("ai.console.director.title")}>
      <DirectorDefaultControl auto={auto} recorded={test ? { lowerBound: test.lowerBound, at: test.at } : null} />
    </Panel>
  );
}

