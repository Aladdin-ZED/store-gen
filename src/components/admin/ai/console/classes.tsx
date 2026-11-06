"use client";
/**
 * Console → AI, Classes & routes (P7 AI; ai.md AI-§K.2, AI-§B.2, AI-§F.6, AI-D15): the four classes with "Check model",
 * the gate status and the jury; a model / effort / max_tokens change goes through the gate (a passing full live run
 * ≤ 14 days for the new model, step-up) and the server says why when it refuses; the emergency switch only while the
 * active model answers not_found (step-up, a typed reason); per-task rows with the AI-§A.2 defaults as placeholders;
 * the pass caps and concurrency.
 */
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { aiEmergencySwitchAction, checkAiModelAction, saveAiClassAction, saveAiJuryAction, saveAiRouteAction, saveAiSettingsAction } from "@/app/admin/(console)/ai/actions";
import type { loadClasses } from "@/lib/ai/platform/console-read";
import { t } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { NumberField, SelectField, sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

const c = (k: string, v?: Record<string, string | number>) => t(k, v, "en");
type Data = Awaited<ReturnType<typeof loadClasses>>;
type ClassView = Data["classes"][number];
type RouteView = Data["routes"][number];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(n);

export function ClassesTab({ d }: { d: Data }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {d.classes.map((k) => (
          <ClassCard key={k.class} k={k} />
        ))}
      </div>
      <CapsCard passCaps={d.passCaps} concurrency={d.concurrency} />
      <section aria-label={c("ai.console.routes.title")} className="rounded-xl border bg-card">
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">{c("ai.console.routes.title")}</h2>
          <span className="text-xs text-muted-foreground">{c("ai.console.routes.meta")}</span>
        </header>
        <div className="divide-y">
          {d.routes.map((r) => (
            <RouteRow key={r.task} r={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ClassCard({ k }: { k: ClassView }) {
  const ids = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [edit, setEdit] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [f, setF] = useState({ model: k.model, effort: k.effort, maxTokens: k.maxTokens as number | "", timeoutMs: k.timeoutMs as number | "", fallbacks: k.fallbacks, batch: k.batch });
  const [jury, setJury] = useState(k.jury.join(", "));
  const [em, setEm] = useState({ model: "", reason: "" });
  const gated = f.model !== k.model || f.effort !== k.effort || f.maxTokens !== k.maxTokens;
  return (
    <section aria-label={c(`ai.console.class.${k.class}`)} className="min-w-0 rounded-xl border bg-card">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{c(`ai.console.class.${k.class}`)}</h2>
        <span className={cn("text-xs font-medium", k.gate ? "text-success-ink" : "text-muted-foreground")}>{k.gate ? c("ai.console.classes.gate_ok", { family: k.gate.family, at: k.gate.at.slice(0, 10) }) : c("ai.console.classes.gate_none")}</span>
      </header>
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-[13px]">{k.model}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{k.info ? c("ai.console.classes.checked", { name: k.info.display_name, at: k.info.checkedAt.slice(0, 10) }) : c("ai.console.classes.unchecked")}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void run(() => checkAiModelAction({ id: f.model }), (r) => setSaid(sayOf(r, r.ok && r.data.ok ? c("ai.console.classes.check_ok", { name: r.data.value.display_name }) : undefined)))}
          >
            {c("ai.console.classes.check")}
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {(
            [
              ["effort", k.effort],
              ["max_tokens", fmt(k.maxTokens)],
              ["timeout", `${fmt(k.timeoutMs / 1000)} s`],
              ["fallbacks", c(`ai.console.fallbacks.${k.fallbacks}`)],
              ["batch", c(`ai.console.batch_policy.${k.batch}`)],
              ["tok", k.tokPerSec === null ? c("ai.console.status.tok_unmeasured") : c("ai.console.status.tok", { n: fmt(k.tokPerSec) })],
            ] as const
          ).map(([key, v]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c(`ai.console.classes.${key}`)}</dt>
              <dd className="truncate tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 text-xs text-muted-foreground">
          {c(k.class === "worker" ? "ai.console.classes.judge" : "ai.console.classes.jury")} <span className="font-mono text-foreground">{k.jury.join(" · ")}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" aria-expanded={edit} onClick={() => setEdit((v) => !v)}>
            {c("ai.console.edit")}
            <ChevronDownIcon className={cn("size-3.5 transition-transform", edit && "rotate-180")} aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="sm" aria-expanded={emergency} onClick={() => setEmergency((v) => !v)}>
            {c("ai.console.classes.emergency")}
          </Button>
          <Spinner on={pending} />
        </div>
        {edit ? (
          <form
            className="mt-4 space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => saveAiClassAction({ class: k.class, ...f, maxTokens: Number(f.maxTokens), timeoutMs: Number(f.timeoutMs) }), (r) => setSaid(sayOf(r, c("ai.console.saved"))));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <label htmlFor={`${ids}-model`} className="text-xs text-muted-foreground">
                  {c("ai.console.classes.model")}
                </label>
                <input id={`${ids}-model`} className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value.trim() })} spellCheck={false} autoComplete="off" />
              </div>
              <SelectField id={`${ids}-effort`} label={c("ai.console.classes.effort")} value={f.effort} options={EFFORTS.map((e) => ({ value: e, label: e }))} onChange={(v) => setF({ ...f, effort: v })} />
              <NumberField id={`${ids}-max`} label={c("ai.console.classes.max_tokens")} value={f.maxTokens} min={256} max={64_000} onChange={(v) => setF({ ...f, maxTokens: v })} />
              <NumberField id={`${ids}-timeout`} label={c("ai.console.classes.timeout_ms")} value={f.timeoutMs} min={5_000} max={90_000} step={1000} onChange={(v) => setF({ ...f, timeoutMs: v })} />
              <SelectField id={`${ids}-fb`} label={c("ai.console.classes.fallbacks")} value={f.fallbacks} options={(["default", "none"] as const).map((v) => ({ value: v, label: c(`ai.console.fallbacks.${v}`) }))} onChange={(v) => setF({ ...f, fallbacks: v })} />
              <SelectField id={`${ids}-batch`} label={c("ai.console.classes.batch")} value={f.batch} options={(["never", "allowed", "always", "fallback"] as const).map((v) => ({ value: v, label: c(`ai.console.batch_policy.${v}`) }))} onChange={(v) => setF({ ...f, batch: v })} />
            </div>
            <p className="text-xs text-muted-foreground">{gated ? c("ai.console.classes.gate_rule", { families: k.families.join(", ") || "-" }) : c("ai.console.classes.no_gate")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${ids}-jury`} className="text-xs text-muted-foreground">
                  {c(k.class === "worker" ? "ai.console.classes.judge" : "ai.console.classes.jury")}
                </label>
                <input id={`${ids}-jury`} className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" value={jury} onChange={(e) => setJury(e.target.value)} spellCheck={false} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  void run(
                    () => saveAiJuryAction({ class: k.class, models: jury.split(/[\s,]+/).filter(Boolean) }),
                    (r) => setSaid(sayOf(r, c("ai.console.saved"))),
                  )
                }
              >
                {c("ai.console.classes.save_jury")}
              </Button>
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {c("ai.console.save")}
            </Button>
          </form>
        ) : null}
        {emergency ? (
          <form
            className="mt-4 space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => aiEmergencySwitchAction({ class: k.class, model: em.model, reason: em.reason }), (r) => setSaid(sayOf(r, c("ai.console.classes.emergency_done"))));
            }}
          >
            <p className="text-xs text-muted-foreground">{c("ai.console.classes.emergency_rule")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor={`${ids}-em-model`} className="text-xs text-muted-foreground">
                  {c("ai.console.classes.emergency_model")}
                </label>
                <input id={`${ids}-em-model`} required className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring" value={em.model} onChange={(e) => setEm({ ...em, model: e.target.value.trim() })} spellCheck={false} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${ids}-em-reason`} className="text-xs text-muted-foreground">
                  {c("ai.console.classes.emergency_reason")}
                </label>
                <input id={`${ids}-em-reason`} required minLength={12} maxLength={300} className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={em.reason} onChange={(e) => setEm({ ...em, reason: e.target.value })} />
              </div>
            </div>
            <Button type="submit" variant="destructive" size="sm" disabled={pending || em.reason.trim().length < 12 || !em.model}>
              {c("ai.console.classes.emergency_go")}
            </Button>
          </form>
        ) : null}
        <Status said={said} className="mt-2" />
      </div>
      {sheet}
    </section>
  );
}

function CapsCard({ passCaps, concurrency }: { passCaps: Data["passCaps"]; concurrency: Data["concurrency"] }) {
  const ids = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [v, setV] = useState({
    directorPassesPerStorePerDay: passCaps.director as number | "",
    deepPassesPerStorePerDay: passCaps.deep as number | "",
    concurrentDirector: concurrency.director as number | "",
    concurrentWorker: concurrency.worker as number | "",
    concurrentFast: concurrency.fast as number | "",
    perStoreWorker: concurrency.perStoreWorker as number | "",
  });
  const fields: [keyof typeof v, number, number][] = [
    ["directorPassesPerStorePerDay", 1, 500],
    ["deepPassesPerStorePerDay", 0, 100],
    ["concurrentDirector", 1, 20],
    ["concurrentWorker", 1, 40],
    ["concurrentFast", 1, 60],
    ["perStoreWorker", 1, 6],
  ];
  return (
    <section aria-label={c("ai.console.caps.title")} className="rounded-xl border bg-card">
      <header className="flex min-h-11 items-center border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{c("ai.console.caps.title")}</h2>
      </header>
      <form
        className="p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const input = Object.fromEntries(Object.entries(v).map(([key, x]) => [key, Number(x)]));
          void run(() => saveAiSettingsAction(input), (r) => setSaid(sayOf(r, c("ai.console.saved"))));
        }}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {fields.map(([key, min, max]) => (
            <NumberField key={key} id={`${ids}-${key}`} label={c(`ai.console.caps.${key}`)} value={v[key]} min={min} max={max} onChange={(x) => setV({ ...v, [key]: x })} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {c("ai.console.save")}
          </Button>
          <Status said={said} />
        </div>
      </form>
      {sheet}
    </section>
  );
}

function RouteRow({ r }: { r: RouteView }) {
  const ids = useId();
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ effort: (r.effort ?? "") as "" | (typeof EFFORTS)[number], deadlineMs: (r.deadlineMs ?? "") as number | "", maxTokens: (r.maxTokens ?? "") as number | "", fast: r.fast });
  const send = (input: Record<string, unknown>) => void run(() => saveAiRouteAction({ task: r.task, ...input }), (res) => setSaid(sayOf(res, c("ai.console.saved"))));
  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-56">
          <div className="truncate font-mono text-[13px]">{r.task}</div>
          <div className="text-xs text-muted-foreground">
            {c(`ai.console.class.${r.class}`)} · {c(`ai.console.pattern.${r.pattern}`)}
            {r.autoPrefersCloud ? ` · ${c("ai.console.routes.prefers_cloud")}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <span>
            {c("ai.console.classes.effort")} <span className={r.effort ? "text-foreground" : ""}>{r.effort ?? r.defaults.effort}</span>
          </span>
          <span>
            {c("ai.console.routes.deadline")} <span className={r.deadlineMs ? "text-foreground" : ""}>{fmt((r.deadlineMs ?? r.defaults.deadlineMs) / 1000)} s</span>
          </span>
          <span>
            max_tokens <span className={r.maxTokens ? "text-foreground" : ""}>{fmt(r.maxTokens ?? r.defaults.maxTokens)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Spinner on={pending} />
          <Switch aria-label={c("ai.console.routes.enabled", { task: r.task })} checked={r.enabled} disabled={pending} onCheckedChange={(on) => send({ enabled: on ? null : false })} />
          <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            {c("ai.console.edit")}
          </Button>
        </div>
      </div>
      {open ? (
        <form
          className="mt-3 grid grid-cols-2 items-end gap-3 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            send({ effort: v.effort === "" ? null : v.effort, deadlineMs: v.deadlineMs === "" ? null : v.deadlineMs, maxTokens: v.maxTokens === "" ? null : v.maxTokens, fast: r.fastAllowed ? (v.fast ? true : null) : undefined });
          }}
        >
          <SelectField id={`${ids}-e`} label={c("ai.console.classes.effort")} value={v.effort} options={[{ value: "" as const, label: c("ai.console.routes.default", { v: r.defaults.effort }) }, ...EFFORTS.map((e) => ({ value: e, label: e }))]} onChange={(x) => setV({ ...v, effort: x })} />
          <NumberField id={`${ids}-d`} label={c("ai.console.routes.deadline_ms")} value={v.deadlineMs} placeholder={String(r.defaults.deadlineMs)} min={5_000} max={90_000} step={1000} onChange={(x) => setV({ ...v, deadlineMs: x })} />
          <NumberField id={`${ids}-m`} label="max_tokens" value={v.maxTokens} placeholder={String(r.defaults.maxTokens)} min={256} max={64_000} onChange={(x) => setV({ ...v, maxTokens: x })} />
          <label className={cn("flex h-9 items-center gap-2 text-sm", !r.fastAllowed && "text-muted-foreground")} title={r.fastAllowed ? undefined : c("ai.console.routes.fast_no")}>
            <Switch checked={v.fast} disabled={!r.fastAllowed} onCheckedChange={(x) => setV({ ...v, fast: x })} />
            {c("ai.console.routes.fast")}
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            {c("ai.console.save")}
          </Button>
        </form>
      ) : null}
      <Status said={said} />
      {sheet}
    </div>
  );
}
