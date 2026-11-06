"use client";
/**
 * Console → AI, Prompts & evals (P7 AI; ai.md AI-§K.2, AI-§F.5-F.8, AI-07 (3)(4)(5), AI-19 (9)(10)): per family the
 * active, canary and draft versions with their scorecards (raw and guarded rates, the pairwise win-rate with its lower
 * bound and noise floor, judge calibration per property, the online counts of the canary against the active version);
 * "Run smoke eval" and "Run eval" (estimate, then confirm); "Canary" only with a passing smoke or full run ≤ 14 days,
 * with the computed slice; "Activate" at the earlier promotion threshold (runs collected, days left); "Activate on the
 * offline gate alone" at low volume after day 28; "Roll back" (step-up, a reason); the rubric version; the calibration
 * queue, the 40-case naturalness labelling form and the preference-test record. The server re-checks every rule.
 */
import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  activateAiPromptAction,
  activateAiPromptLowVolumeAction,
  canaryAiPromptAction,
  recordAiCalibrationAction,
  recordAiPreferenceAction,
  rollbackAiPromptAction,
  saveAiRubricAction,
  startAiEvalAction,
} from "@/app/admin/(console)/ai/actions";
import type { EvalEstimate } from "@/lib/ai/eval/live";
import type { EvalRunView, loadPrompts, naturalnessCases, VersionView } from "@/lib/ai/platform/console-read";
import { t } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { NumberField, sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

const c = (k: string, v?: Record<string, string | number>) => t(k, v, "en");
type Data = Awaited<ReturnType<typeof loadPrompts>>;
type Family = Data["families"][number];
type Case = ReturnType<typeof naturalnessCases>[number];
const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "-" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: d }).format(x));
const usd = (m: number) => `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 1_000_000)}`;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

export function PromptsTab({ d, cases }: { d: Data; cases: Case[] }) {
  return (
    <div className="space-y-6">
      <RubricBar version={d.rubricVersion} />
      <div className="space-y-3">
        {d.families.map((f) => (
          <FamilyCard key={f.family} f={f} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CalibrationQueue d={d} />
        <PreferenceRecord d={d} />
      </div>
      <NaturalnessForm cases={cases} last={d.calibrations[0] ?? null} />
    </div>
  );
}

function RubricBar({ version }: { version: string }) {
  const id = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState(version);
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveAiRubricAction({ version: v }), (r) => setSaid(sayOf(r, c("ai.console.saved"))));
      }}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs text-muted-foreground">
          {c("ai.console.prompts.rubric")}
        </label>
        <input id={id} className="mt-1 block h-9 w-28 rounded-md border bg-background px-2.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" value={v} onChange={(e) => setV(e.target.value.trim())} />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending || v === version || !v}>
        {c("ai.console.prompts.rubric_save")}
      </Button>
      <p className="min-w-0 flex-1 basis-64 text-xs text-muted-foreground">{c("ai.console.prompts.rubric_rule")}</p>
      <Status said={said} className="basis-full" />
      {sheet}
    </form>
  );
}

const STATUS_TONE: Record<string, string> = { active: "text-success-ink", canary: "text-foreground", draft: "text-muted-foreground", retired: "text-muted-foreground" };

function FamilyCard({ f }: { f: Family }) {
  const canary = f.versions.find((v) => v.status === "canary");
  const latest = f.runs[0];
  const server = f.versions.filter((v) => v.provider === "server");
  const local = f.versions.filter((v) => v.provider === "local");
  return (
    <details className="group rounded-xl border bg-card [&_summary::-webkit-details-marker]:hidden" open={canary !== undefined}>
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform rtl:-scale-x-100 group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1 basis-40 truncate font-mono text-[13px] font-medium">{f.family}</span>
        <span className="text-xs text-muted-foreground">
          {c("ai.console.prompts.active")} <span className="font-mono text-foreground">{f.active}</span>
        </span>
        {canary ? (
          <span className="text-xs text-muted-foreground">
            {c("ai.console.prompts.canary")} <span className="font-mono text-foreground">{canary.version}</span> · {pct(canary.canaryBp / 10_000, 0)}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">{latest ? c("ai.console.prompts.last_run", { kind: c(`ai.console.eval_kind.${latest.kind}`), when: day(latest.at), verdict: latest.passed === null ? c(`ai.console.eval_status.${latest.status}`) : latest.passed ? c("ai.console.prompts.passed") : c("ai.console.prompts.failed") }) : c("ai.console.prompts.no_runs")}</span>
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        <p className="text-xs text-muted-foreground">{c("ai.console.prompts.slice", { pct: pct(f.slice / 10_000, 0), runs: f.weeklyRuns, hash: f.hash.slice(0, 12) })}</p>
        <div className="divide-y rounded-lg border">
          {server.map((v) => (
            <VersionRow key={v.version} f={f} v={v} />
          ))}
          {local.map((v) => (
            <div key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-mono text-[13px]">{v.version}</span>
              <span className="text-xs text-muted-foreground">{c("ai.console.prompts.local", { status: c(`ai.console.version_status.${v.status}`) })}</span>
            </div>
          ))}
        </div>
        {canary && f.online ? <OnlineCompare f={f} canary={canary} /> : null}
        <RunsList runs={f.runs} />
      </div>
    </details>
  );
}

function EvalButtons({ f, version }: { f: Family; version: string }) {
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [est, setEst] = useState<{ kind: "smoke" | "live"; e: EvalEstimate } | null>(null);
  const ask = (kind: "smoke" | "live") =>
    void run(
      () => startAiEvalAction({ family: f.family, version, kind, confirm: false }),
      (r) => {
        if (r.ok && r.data.ok && r.data.value.estimate) setEst({ kind, e: r.data.value.estimate });
        else setSaid(sayOf(r));
      },
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {est ? (
        <>
          <span className="text-xs">{c(est.kind === "smoke" ? "ai.console.prompts.estimate_smoke" : "ai.console.prompts.estimate_live", { line: est.e.line })}</span>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              void run(
                () => startAiEvalAction({ family: f.family, version, kind: est.kind, confirm: true }),
                (r) => {
                  setEst(null);
                  setSaid(sayOf(r, r.ok && r.data.ok ? c("ai.console.prompts.eval_started", { status: r.data.value.status ?? "" }) : undefined));
                },
              )
            }
          >
            {c("ai.console.confirm")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEst(null)}>
            {c("ai.console.cancel")}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => ask("smoke")} title={f.estimates.smoke?.line}>
            {c("ai.console.prompts.run_smoke")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => ask("live")} title={f.estimates.live?.line}>
            {c("ai.console.prompts.run_live")}
          </Button>
        </>
      )}
      <Spinner on={pending} />
      <Status said={said} className="basis-full" />
      {sheet}
    </div>
  );
}

function VersionRow({ f, v }: { f: Family; v: VersionView }) {
  const ids = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [reason, setReason] = useState("");
  const [rolling, setRolling] = useState(false);
  const p = v.promotion;
  const input = { family: f.family, version: v.version };
  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-[13px]">{v.version}</span> <span className={cn("ms-2 text-xs font-medium", STATUS_TONE[v.status])}>{c(`ai.console.version_status.${v.status}`)}</span>
          {v.notes ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v.notes}</div> : null}
        </div>
        <div className="text-xs text-muted-foreground">{v.canaryRun ? c("ai.console.prompts.gate_run", { kind: c(`ai.console.eval_kind.${v.canaryRun.kind}`), at: day(v.canaryRun.at) }) : c("ai.console.prompts.gate_none")}</div>
      </div>
      {v.status === "canary" && p ? (
        <p className="text-xs">
          {p.status === "ready"
            ? c("ai.console.prompts.promo_ready", { days: p.rule.days, runs: p.rule.minRuns })
            : p.status === "low_volume"
              ? c("ai.console.prompts.promo_low")
              : c(`ai.console.prompts.promo_${p.reason}`, { left: p.next.map((n) => c("ai.console.prompts.promo_next", { days: n.daysLeft, runs: n.runsLeft })).join(c("ai.console.or")) })}
          <span className="text-muted-foreground"> · {c("ai.console.prompts.canary_runs", { n: v.canaryRuns, days: v.days ?? 0, pct: pct(v.canaryBp / 10_000, 0) })}</span>
        </p>
      ) : null}
      {v.rollbackReason ? <p className="text-xs text-muted-foreground">{c("ai.console.prompts.rolled_back", { at: day(v.rolledBackAt), why: v.rollbackReason })}</p> : null}
      {v.status !== "retired" ? <EvalButtons f={f} version={v.version} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {v.status === "draft" ? (
          <Button type="button" size="sm" disabled={pending || !v.canaryRun} title={v.canaryRun ? undefined : c("ai.console.code.no_canary_run")} onClick={() => void run(() => canaryAiPromptAction(input), (r) => setSaid(sayOf(r, r.ok && r.data.ok ? c("ai.console.prompts.canaried", { pct: pct(r.data.value.bp / 10_000, 0) }) : undefined)))}>
            {c("ai.console.prompts.canary_go", { pct: pct(f.slice / 10_000, 0) })}
          </Button>
        ) : null}
        {v.status === "canary" ? (
          <>
            <Button type="button" size="sm" disabled={pending || p?.status !== "ready"} onClick={() => void run(() => activateAiPromptAction(input), (r) => setSaid(sayOf(r, c("ai.console.prompts.activated"))))}>
              {c("ai.console.prompts.activate")}
            </Button>
            {p?.status === "low_volume" ? (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void run(() => activateAiPromptLowVolumeAction(input), (r) => setSaid(sayOf(r, c("ai.console.prompts.activated"))))}>
                {c("ai.console.prompts.activate_low")}
              </Button>
            ) : null}
          </>
        ) : null}
        {v.status === "canary" || (v.status === "active" && !v.seed) ? (
          <Button type="button" size="sm" variant="ghost" aria-expanded={rolling} onClick={() => setRolling((x) => !x)}>
            {c("ai.console.prompts.rollback")}
          </Button>
        ) : null}
        <Spinner on={pending} />
      </div>
      {rolling ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => rollbackAiPromptAction({ ...input, reason }), (r) => setSaid(sayOf(r, c("ai.console.prompts.rolled"))));
          }}
        >
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor={`${ids}-why`} className="text-xs text-muted-foreground">
              {c("ai.console.prompts.rollback_reason")}
            </label>
            <input id={`${ids}-why`} required minLength={3} maxLength={100} className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" size="sm" variant="destructive" disabled={pending || reason.trim().length < 3}>
            {c("ai.console.prompts.rollback_go")}
          </Button>
        </form>
      ) : null}
      <Status said={said} />
      {sheet}
    </div>
  );
}

function OnlineCompare({ f, canary }: { f: Family; canary: VersionView }) {
  const rows = [canary.version, f.active].map((v) => ({ v, s: f.online?.[v] as { generations: number; rejectedFields: number; invalid: number; refusals: number; timeouts: number; regeneratedBeforeChoose?: number } | undefined }));
  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{c("ai.console.prompts.online")}</div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-2 px-3 py-2 text-xs text-muted-foreground">
        <span>{c("ai.console.prompts.version")}</span>
        <span className="text-end">n</span>
        <span className="text-end">{c("ai.console.prompts.rejects")}</span>
        <span className="text-end">{c("ai.console.prompts.failures")}</span>
        <span className="text-end">{c("ai.console.prompts.keep")}</span>
      </div>
      {rows.map(({ v, s }) => {
        const n = s?.generations ?? 0;
        return (
          <div key={v} className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-2 border-t px-3 py-2 text-sm tabular-nums">
            <span className="truncate font-mono text-[12.5px]">{v}</span>
            <span className="text-end">{n}</span>
            <span className="text-end">{n ? pct((s?.rejectedFields ?? 0) / n) : "-"}</span>
            <span className="text-end">{n ? pct(((s?.invalid ?? 0) + (s?.refusals ?? 0) + (s?.timeouts ?? 0)) / n) : "-"}</span>
            <span className="text-end text-xs text-muted-foreground">{c("ai.console.prompts.from_r2")}</span>
          </div>
        );
      })}
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">{c("ai.console.prompts.online_note")}</p>
    </div>
  );
}

function RunsList({ runs }: { runs: EvalRunView[] }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground">{c("ai.console.prompts.no_runs_long")}</p>;
  return (
    <div className="rounded-lg border">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{c("ai.console.prompts.runs")}</div>
      <div className="divide-y">
        {runs.map((r) => (
          <div key={r.id} className="space-y-1 px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-medium">{c(`ai.console.eval_kind.${r.kind}`)}</span>
              <span className="font-mono text-[12.5px]">{r.version}</span>
              <span className={cn("text-xs font-medium", r.passed ? "text-success-ink" : r.passed === false ? "text-destructive" : "text-muted-foreground")}>{r.passed === null ? c(`ai.console.eval_status.${r.status}`) : r.passed ? c("ai.console.prompts.passed") : c("ai.console.prompts.failed")}</span>
              {!r.hashCurrent ? <span className="text-xs text-muted-foreground">{c("ai.console.prompts.old_hash")}</span> : null}
              <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                {day(r.at)} · {usd(r.costMicros)}
                {r.judgeCostMicros ? ` + ${c("ai.console.prompts.judge_cost", { cost: usd(r.judgeCostMicros) })}` : ""}
              </span>
            </div>
            {r.scores ? (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                <span>
                  {c("ai.console.prompts.schema")} <span className="text-foreground">{pct(r.scores.schemaValid)}</span>
                </span>
                <span>
                  {c("ai.console.prompts.refusal")} <span className="text-foreground">{pct(r.scores.refusalRate)}</span>
                </span>
                <span>
                  {c("ai.console.prompts.rejects")} <span className="text-foreground">{pct(r.scores.rejectRate)}</span>
                </span>
                <span>
                  {c("ai.console.prompts.length")} <span className="text-foreground">{pct(r.scores.lengthFit)}</span>
                </span>
                <span>
                  {c("ai.console.prompts.diversity")} <span className="text-foreground">{r.scores.diversity === null ? "-" : r.scores.diversity.toFixed(2)}</span>
                </span>
              </div>
            ) : null}
            {r.pairwise ? (
              <div className="text-xs tabular-nums">
                {c("ai.console.prompts.winrate", { rate: pct(r.pairwise.winRate), lower: pct(r.pairwise.lower), floor: pct(r.pairwise.floor, 0), n: r.pairwise.n })}
                {r.pairwise.properties.length ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {r.pairwise.properties.map((p) => `${p.property} ${pct(p.winRate, 0)}${p.agreement === null ? "" : ` (${c("ai.console.prompts.agreement", { a: pct(p.agreement, 0) })})`}${p.counted ? "" : ` ${c("ai.console.prompts.not_counted")}`}`).join(" · ")}
                  </span>
                ) : null}
              </div>
            ) : null}
            {r.gate && (r.gate.hard.length || r.gate.soft.length) ? <div className="text-xs text-destructive">{[...r.gate.hard, ...r.gate.soft].slice(0, 4).join(" · ")}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalibrationQueue({ d }: { d: Data }) {
  return (
    <section aria-label={c("ai.console.prompts.queue")} className="rounded-xl border bg-card">
      <header className="flex min-h-11 items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{c("ai.console.prompts.queue")}</h2>
        <span className="text-xs text-muted-foreground">{c("ai.console.prompts.queue_meta", { min: pct(d.minAgreement, 0) })}</span>
      </header>
      <div className="p-4 text-sm">
        {d.queue.length === 0 ? (
          <p className="text-muted-foreground">{c("ai.console.prompts.queue_none")}</p>
        ) : (
          <ul className="divide-y">
            {d.queue.map((q) => (
              <li key={`${q.family}-${q.property}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-[12.5px]">{q.family}</span> · {q.property}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{q.agreement === null ? c("ai.console.prompts.uncalibrated") : c("ai.console.prompts.agreement", { a: pct(q.agreement, 0) })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PreferenceRecord({ d }: { d: Data }) {
  const ids = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState({ lowerBound: "" as number | "", pairs: "" as number | "", note: "" });
  return (
    <section aria-label={c("ai.console.prompts.preference")} className="rounded-xl border bg-card">
      <header className="flex min-h-11 items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{c("ai.console.prompts.preference")}</h2>
        <span className="text-xs text-muted-foreground">{d.preferenceTest ? c("ai.console.prompts.pref_recorded", { lb: d.preferenceTest.lowerBound.toFixed(2), at: day(d.preferenceTest.at) }) : c("ai.console.prompts.pref_none")}</span>
      </header>
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => recordAiPreferenceAction({ lowerBound: Number(v.lowerBound), pairs: Number(v.pairs), note: v.note || undefined }), (r) => setSaid(sayOf(r, r.ok && r.data.ok ? c(r.data.value.pass ? "ai.console.prompts.pref_pass" : "ai.console.prompts.pref_fail") : undefined)));
        }}
      >
        <p className="text-xs text-muted-foreground">{c("ai.console.prompts.pref_rule")}</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField id={`${ids}-lb`} label={c("ai.console.prompts.pref_lb")} value={v.lowerBound} min={0} max={1} step={0.01} onChange={(x) => setV({ ...v, lowerBound: x })} />
          <NumberField id={`${ids}-pairs`} label={c("ai.console.prompts.pref_pairs")} value={v.pairs} min={1} max={10_000} onChange={(x) => setV({ ...v, pairs: x })} />
        </div>
        <div>
          <label htmlFor={`${ids}-note`} className="text-xs text-muted-foreground">
            {c("ai.console.prompts.pref_note")}
          </label>
          <input id={`${ids}-note`} maxLength={300} className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || v.lowerBound === "" || v.pairs === ""}>
            {c("ai.console.prompts.pref_save")}
          </Button>
          <Spinner on={pending} />
        </div>
        <Status said={said} />
      </form>
      {sheet}
    </section>
  );
}

function NaturalnessForm({ cases, last }: { cases: Case[]; last: Data["calibrations"][number] | null }) {
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const n = Object.keys(scores).length;
  return (
    <section aria-label={c("ai.console.prompts.natural")} className="rounded-xl border bg-card">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{c("ai.console.prompts.natural")}</h2>
        <span className="text-xs text-muted-foreground">{last ? c("ai.console.prompts.natural_last", { mean: last.mean ?? "-", min: last.min ?? "-", at: day(last.at), verdict: last.passed ? c("ai.console.prompts.passed") : c("ai.console.prompts.failed") }) : c("ai.console.prompts.natural_none")}</span>
      </header>
      <form
        className="p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => recordAiCalibrationAction({ labels: Object.entries(scores).map(([caseId, score]) => ({ caseId, score })) }), (r) => setSaid(sayOf(r, r.ok && r.data.ok ? c("ai.console.prompts.natural_saved", { mean: r.data.value.mean ?? "-", min: r.data.value.min ?? "-" }) : undefined)));
        }}
      >
        <p className="text-xs text-muted-foreground">{c("ai.console.prompts.natural_rule", { n: cases.length })}</p>
        <div className="mt-3 divide-y rounded-lg border">
          {cases.map((k) => (
            <fieldset key={k.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2">
              <legend className="sr-only">{k.id}</legend>
              <div className="min-w-0 flex-1 basis-60">
                <div className="truncate text-sm" dir="auto">
                  {k.product || k.id}
                </div>
                <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                  {k.family} · {k.locale} · {k.id}
                </div>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={c("ai.console.prompts.natural_score", { id: k.id })}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={scores[k.id] === s}
                    onClick={() => setScores({ ...scores, [k.id]: s })}
                    className={cn("size-8 rounded-md border text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", scores[k.id] === s ? "border-brand bg-brand text-brand-foreground" : "hover:bg-muted")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || n === 0}>
            {c("ai.console.prompts.natural_save", { n, of: cases.length })}
          </Button>
          <Spinner on={pending} />
          <Status said={said} />
        </div>
      </form>
      {sheet}
    </section>
  );
}
