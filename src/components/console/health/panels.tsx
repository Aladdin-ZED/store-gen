"use client";
/**
 * `/admin/health` panels (platform.md PLA-§15.1, §15.2, OS-09; PD57, PD68, PD78): Cron, Queues, Sheets, Storage,
 * Errors, Runtime, Edge / Worker, Render queue (Retry), Health engine, AI, Design tables, Commerce heartbeat. The page
 * refreshes every 30 s while visible; each panel fails alone, says "Updated hh:mm", and shows its state as text + icon
 * with a tooltip naming the alarm it drives (and "Recovered hh:mm" after one cleared). Machinery data is P8's
 * `getHealth()`: until it is installed those panels read "unavailable"; storage without a snapshot reads "Snapshot not
 * taken yet"; with S mode off the Edge panel reads "S mode off" and raises nothing.
 */
import { RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { retryRendersAction } from "@/app/admin/(console)/stores/[id]/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { AlarmCode, AlarmState } from "@/lib/platform/alarm-rules";
import type { PlatformHealth } from "@/lib/platform/health";
import { meterTone, pendingMediaVars, sandboxVars } from "@/lib/platform/settings-rules";
import type { SystemHealthView } from "@/lib/platform/system";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { bytesText, durationText } from "../format";
import { useGuarded } from "../guarded";
import { PanelError, PanelUnavailable } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { button, card, Meter, StatusText, td, th, type Tone } from "../kit";
import { consoleUrl } from "@/lib/platform/console-url";

const REFRESH_MS = 30_000;

/** The alarms each panel drives (PLA-§15.2), in the panel's order. */
const PANEL_ALARMS: Record<string, readonly AlarmCode[]> = {
  cron: ["no_tick", "tick_lag", "pool_wait", "health_job_slow"],
  queues: ["outbox_dead"],
  sheets: ["sheets_backlog"],
  storage: ["db_70", "db_85", "data_dir_70", "data_dir_85", "inodes_high", "pending_media_budget", "signup_capped"],
  errors: ["error_spike"],
  runtime: ["gate_mismatch"],
  edge: ["edge_silent", "edge_prev_key", "edge_bad_key"],
  renders: ["render_stuck", "render_failed_old"],
  engine: ["health_stale", "health_job_slow"],
  ai: ["ai_cap_70", "ai_cap_85", "ai_cap_reached", "ai_auth_failed", "ai_director_unavailable", "ai_refusal_spike", "ai_job_orphan", "ai_pending_cap"],
  design: ["design_tables_large"],
  commerce: ["commerce_quiet"],
};

type Alarm = AlarmState & { since: string | null };
/** hh:mm in the platform's time zone (the same on the server and in the browser, so it hydrates). */
const HHMM = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Casablanca" });
const hhmm = (iso: string) => HHMM.format(new Date(iso));

/** Refreshes the page every 30 s while the tab is visible (one timer for every panel). */
function useVisibleRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);
}

export function HealthPanels({ view }: { view: SystemHealthView }) {
  const t = useT();
  useVisibleRefresh();
  const alarms = view.alarms.state === "ok" ? view.alarms.data : [];
  const raised = (panel: string) => alarms.filter((a) => (PANEL_ALARMS[panel] ?? []).includes(a.code));
  const recovered = (panel: string) => {
    const keys = Object.entries(view.recovered).filter(([k]) => (PANEL_ALARMS[panel] ?? []).some((c) => k === c || k.startsWith(`${c}:`)));
    return keys.length ? keys.sort((a, b) => b[1].localeCompare(a[1]))[0]![1] : null;
  };
  const m = view.machine;
  const machine = m.state === "ok" ? m.data : null;
  const frame = (id: string, title: string, body: ReactNode, opts: { at?: string; okText?: string; wide?: boolean; data?: boolean } = {}) => (
    <Frame key={id} title={title} at={opts.at ?? view.checkedAt} alarms={raised(id)} recoveredAt={recovered(id)} okText={opts.okText} codes={PANEL_ALARMS[id] ?? []} wide={opts.wide} data={opts.data ?? machine !== null}>
      {body}
    </Frame>
  );
  const needMachine = (body: (h: PlatformHealth) => ReactNode) => (machine ? body(machine) : m.state === "error" ? <PanelError compact reference={m.ref} /> : <PanelUnavailable text={t("console.health.machine_unavailable")} />);

  return (
    <div className="grid gap-4">
      {alarms.length > 0 && (
        <section aria-label={t("console.health.raised")} className={cn(card, "grid gap-2 p-4")}>
          <h2 className="text-[13px] font-semibold">{t("console.health.raised_count", { count: alarms.length })}</h2>
          <ul className="grid gap-1.5">
            {alarms.map((a) => (
              <li key={a.key} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <StatusText tone={a.level === "danger" ? "danger" : a.level === "warn" ? "warn" : "info"}>{t(`console.attention.${a.code}`, a.vars)}</StatusText>
                {a.since && <span className="text-muted-foreground">· {t("console.health.since", { time: hhmm(a.since) })}</span>}
                {a.storeId && (
                  <PrefetchLink href={consoleUrl(`/stores/${a.storeId}`)} className="text-[var(--c-brand-ink)] hover:underline">
                    {t("console.health.open_store")}
                  </PrefetchLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {frame("cron", t("console.health.cron"), needMachine((h) => <Cron h={h} />), { at: machine?.at })}
        {frame("queues", t("console.health.queues"), needMachine((h) => <Queues h={h} />), { at: machine?.at })}
        {frame("renders", t("console.health.renders"), needMachine((h) => <Renders h={h} />), { at: machine?.at })}
        {frame("storage", t("console.health.storage"), <Storage machine={machine} m={m} view={view} />, { at: machine?.at, data: machine !== null || view.pendingMedia.state === "ok" })}
        {frame("engine", t("console.health.engine"), view.engine.state === "ok" ? <Engine e={view.engine.data} /> : view.engine.state === "error" ? <PanelError compact reference={view.engine.ref} /> : <PanelUnavailable />, { data: view.engine.state === "ok" })}
        {frame("edge", t("console.health.edge"), needMachine((h) => <Edge h={h} />), { at: machine?.at })}
        {frame("sheets", t("console.health.sheets"), needMachine((h) => <Sheets h={h} />), { at: machine?.at })}
        {frame("errors", t("console.health.errors"), needMachine((h) => <Errors h={h} />), { at: machine?.at })}
        {frame("runtime", t("console.health.runtime"), needMachine((h) => <Runtime h={h} />), { at: machine?.at })}
        {frame("ai", t("console.health.ai"), needMachine((h) => (h.ai ? <Ai a={h.ai} /> : <PanelUnavailable text={t("console.health.ai_unavailable")} />)), { at: machine?.at })}
        {frame("design", t("console.health.design"), needMachine((h) => <Kv rows={[[t("console.health.genomes"), bytesText(h.design.genomesBytes)], [t("console.health.shingles"), bytesText(h.design.shinglesBytes)]]} />), { at: machine?.at })}
        {frame("commerce", t("console.health.commerce"), needMachine((h) => <Commerce h={h} />), { at: machine?.at })}
      </div>
    </div>
  );
}

function Frame({ title, at, alarms, recoveredAt, codes, okText, children, wide, data }: { title: string; at: string; alarms: Alarm[]; recoveredAt: string | null; codes: readonly string[]; okText?: string; children: ReactNode; wide?: boolean; data: boolean }) {
  const t = useT();
  // no data and nothing raised: say so, never "Normal"
  const worst: Tone = alarms.some((a) => a.level === "danger") ? "danger" : alarms.some((a) => a.level === "warn") ? "warn" : alarms.length ? "info" : data ? "ok" : "neutral";
  const tip = codes.length ? t("console.health.drives", { alarms: codes.join(", ") }) : undefined;
  return (
    <section aria-label={title} className={cn(card, "flex min-w-0 flex-col", wide && "md:col-span-2")}>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--c-hairline)] px-4 py-2">
        <h2 className="me-auto text-[13px] font-semibold tracking-[-0.006em]">{title}</h2>
        <StatusText tone={worst} title={tip}>
          {alarms.length ? t(worst === "danger" ? "console.health.state.red" : "console.health.state.yellow") : !data ? t("console.health.state.no_data") : recoveredAt ? t("console.health.recovered", { time: hhmm(recoveredAt) }) : (okText ?? t("console.health.state.ok"))}
        </StatusText>
        <span className="num text-[11px] text-muted-foreground">{t("console.health.updated", { time: hhmm(at) })}</span>
      </div>
      {alarms.length > 0 && (
        <ul className="grid gap-1 border-b border-[var(--c-hairline)] px-4 py-2">
          {alarms.map((a) => (
            <li key={a.key}>
              <StatusText tone={a.level === "danger" ? "danger" : a.level === "warn" ? "warn" : "info"} title={a.code}>
                {t(`console.attention.${a.code}`, a.vars)}
              </StatusText>
            </li>
          ))}
        </ul>
      )}
      <div className="grid min-w-0 flex-1 content-start gap-3 p-4">{children}</div>
    </section>
  );
}

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[12.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate text-muted-foreground">{k}</dt>
          <dd className="num text-end">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Cron({ h }: { h: PlatformHealth }) {
  const t = useT();
  const runs = h.cron.jobs.flatMap((j) => j.runs).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50).reverse();
  return (
    <>
      <Kv
        rows={[
          [t("console.health.last_tick"), h.cron.lastTickAt ? <Ago iso={h.cron.lastTickAt} /> : t("console.system.tick.never")],
          [t("console.health.tick_ms"), h.cron.lastTickMs === null ? "—" : `${h.cron.lastTickMs} ms`],
          [t("console.health.lag"), h.tick.lagP95Ms === null ? "—" : `${h.tick.lagP95Ms} ms`],
          [t("console.health.skipped"), h.tick.skipped24h],
          [t("console.health.pool"), `${h.db.poolWaitP95Ms ?? "—"} / ${h.db.lockPoolWaitP95Ms ?? "—"} ms`],
        ]}
      />
      {runs.length > 0 && (
        <div className="flex h-5 items-end gap-px" role="img" aria-label={t("console.health.strip", { ok: runs.filter((r) => r.ok).length, total: runs.length })}>
          {runs.map((r, i) => (
            <span key={i} title={`${r.at.slice(11, 16)} · ${r.ms} ms`} className={cn("w-full min-w-[2px] rounded-[1px]", r.ok ? "h-full bg-[oklch(0.7_0.12_160)]" : "h-full bg-[var(--c-danger-ink)]")} />
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px]">
          <thead>
            <tr className="border-b border-[var(--c-hairline)]">
              <th className={cn(th, "px-0")}>{t("console.health.job")}</th>
              <th className={cn(th, "text-end")}>{t("console.health.ms_budget")}</th>
              <th className={cn(th, "text-end")}>{t("console.health.processed")}</th>
              <th className={cn(th, "pe-0")}>{t("console.health.error")}</th>
            </tr>
          </thead>
          <tbody>
            {h.cron.jobs.map((j) => {
              const last = j.runs[0];
              return (
                <tr key={j.job} className="border-b border-[var(--c-hairline)] last:border-0">
                  <td className={cn(td, "px-0 font-mono text-[11.5px]")}>{j.job}</td>
                  <td className={cn(td, "num text-end", last && j.budgetMs !== null && last.ms > j.budgetMs && "text-[var(--c-danger-ink)]")}>{last ? `${last.ms}${j.budgetMs !== null ? ` / ${j.budgetMs}` : ""}` : "—"}</td>
                  <td className={cn(td, "num text-end")}>{last?.processed ?? "—"}</td>
                  <td className={cn(td, "pe-0 font-mono text-[11px] text-[var(--c-danger-ink)]")}>{last?.errorCode ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Queues({ h }: { h: PlatformHealth }) {
  const t = useT();
  const kinds = [...new Set(h.outbox.byKind.map((r) => r.kind))];
  const count = (kind: string, state: string) => h.outbox.byKind.find((r) => r.kind === kind && r.state === state)?.count ?? 0;
  const dead = h.outbox.byKind.filter((r) => r.state === "dead").reduce((s, r) => s + r.count, 0);
  return (
    <>
      {kinds.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("console.health.outbox_empty")}</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-hairline)]">
              <th className={cn(th, "px-0")}>{t("console.health.kind")}</th>
              <th className={cn(th, "text-end")}>{t("console.health.pending")}</th>
              <th className={cn(th, "text-end")}>{t("console.health.dead")}</th>
              <th className={cn(th, "pe-0 text-end")}>{t("console.health.oldest")}</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => {
              const oldest = h.outbox.oldestPending.filter((o) => o.kind === k).sort((a, b) => a.at.localeCompare(b.at))[0];
              return (
                <tr key={k} className="border-b border-[var(--c-hairline)] last:border-0">
                  <td className={cn(td, "px-0 font-mono text-[11.5px]")}>{k}</td>
                  <td className={cn(td, "num text-end")}>{count(k, "pending")}</td>
                  <td className={cn(td, "num text-end", count(k, "dead") > 0 && "font-medium text-[var(--c-danger-ink)]")}>{count(k, "dead")}</td>
                  <td className={cn(td, "pe-0 text-end text-muted-foreground")}>{oldest ? <Ago iso={oldest.at} /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {dead > 0 && <p className="text-[12px] text-muted-foreground">{t("console.health.replay_where")}</p>}
    </>
  );
}

function Renders({ h }: { h: PlatformHealth }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const r = h.renders;
  const pending = r.byReason.reduce((s, x) => s + x.pending, 0);
  const eta = r.doneLastHour > 0 ? Math.ceil((pending / r.doneLastHour) * 60) : null;
  return (
    <>
      <Kv
        rows={[
          [t("console.health.pending"), pending],
          [t("console.health.oldest"), r.oldestPending ? t("console.health.minutes", { minutes: r.oldestPending.ageMin }) : "—"],
          [t("console.health.throughput"), t("console.health.per_hour", { count: r.doneLastHour })],
          [t("console.health.eta"), pending === 0 ? "—" : eta === null ? t("console.health.eta_unknown") : t("console.health.minutes", { minutes: eta })],
          [t("console.health.notes"), r.notes],
        ]}
      />
      {r.byReason.some((x) => x.pending + x.running + x.failed > 0) && (
        <p className="text-[12px] text-muted-foreground">
          {r.byReason
            .filter((x) => x.pending + x.running + x.failed > 0)
            .map((x) => `${x.reason} ${x.pending}/${x.running}/${x.failed}`)
            .join(" · ")}
        </p>
      )}
      {r.failed24h.length > 0 && (
        <ul className="grid gap-1.5">
          {r.failed24h.slice(0, 10).map((f) => (
            <li key={f.storeId} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <PrefetchLink href={consoleUrl(`/stores/${f.storeId}`)} className="text-[var(--c-brand-ink)] hover:underline">
                {f.storeId.slice(-8)}
              </PrefetchLink>
              <span className="num text-[var(--c-danger-ink)]">{t("console.health.failed_n", { count: f.count })}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{f.error ?? ""}</span>
              <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => retryRendersAction({ storeId: f.storeId, opId }), (d) => (g.reset(), toast.success("unavailable" in d ? t("console.action.unavailable") : t("console.health.retried", { count: d.enqueued })), router.refresh()))} className={cn(button.base, button.ghost, "h-8")}>
                <RotateCwIcon aria-hidden="true" className="size-3.5" />
                {t("console.health.retry")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {g.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      {g.sheet}
    </>
  );
}

function Storage({ machine, m, view }: { machine: PlatformHealth | null; m: SystemHealthView["machine"]; view: SystemHealthView }) {
  const t = useT();
  const db = machine?.storage.db ?? null;
  const media = view.pendingMedia;
  const sand = view.sandboxes;
  return (
    <>
      {machine ? (
        db ? (
          <Meter label={t("console.health.db")} used={db.bytes} limit={db.quotaBytes} tone={db.ratio >= 0.85 ? "danger" : db.ratio >= 0.7 ? "warn" : "ok"} text={t("console.health.db_line", { used: bytesText(db.bytes), quota: bytesText(db.quotaBytes) })} />
        ) : (
          <p className="text-[12.5px] text-muted-foreground">{t("console.health.no_snapshot")}</p>
        )
      ) : m.state === "error" ? (
        <PanelError compact reference={m.ref} />
      ) : (
        <PanelUnavailable text={t("console.health.machine_unavailable")} />
      )}
      {machine && machine.dataDir.budgetBytes !== null && (
        <Meter label={t("console.health.data_dir")} used={machine.dataDir.bytes} limit={machine.dataDir.budgetBytes} tone={machine.dataDir.bytes / machine.dataDir.budgetBytes >= 0.85 ? "danger" : machine.dataDir.bytes / machine.dataDir.budgetBytes >= 0.7 ? "warn" : "ok"} text={t("console.health.data_dir_line", { used: bytesText(machine.dataDir.bytes), budget: bytesText(machine.dataDir.budgetBytes), files: machine.dataDir.files.toLocaleString("en-US") })} />
      )}
      {media.state === "ok" && <Meter label={t("console.signup.media_used")} used={media.data.usedBytes} limit={media.data.limitBytes} tone={meterTone(media.data.usedBytes, media.data.limitBytes)} text={t("console.signup.media_meter", pendingMediaVars(media.data))} />}
      {sand.state === "ok" && <Meter label={t("console.signup.sandboxes_today")} used={sand.data.used} limit={sand.data.limit} tone={sand.data.full ? "danger" : meterTone(sand.data.used, sand.data.limit)} text={t(sand.data.full ? "console.signup.sandbox_full" : "console.signup.sandbox_meter", sandboxVars(sand.data))} />}
      {machine && machine.storage.tables.length > 0 && (
        <details className="text-[12.5px]">
          <summary className="cursor-pointer text-muted-foreground">{t("console.health.top_tables")}</summary>
          <Kv rows={machine.storage.tables.slice(0, 15).map((x) => [x.name, bytesText(x.bytes)])} />
        </details>
      )}
      <PrefetchLink href={consoleUrl("/settings/signup?tab=mode#ceilings")} className="text-[12.5px] font-medium text-[var(--c-brand-ink)] hover:underline">
        {t("console.health.ceilings_link")}
      </PrefetchLink>
    </>
  );
}

function Engine({ e }: { e: Extract<SystemHealthView["engine"], { state: "ok" }>["data"] }) {
  const t = useT();
  return (
    <>
      <Kv
        rows={[
          [t("console.health.stale"), e.staleSnapshots],
          [t("console.health.dirty"), e.dirtyRows],
          [t("console.health.last_run"), e.lastRunAt ? <Ago iso={e.lastRunAt} /> : t("console.health.never")],
          [t("console.health.stale_after"), t("console.health.minutes", { minutes: e.staleAfterMin })],
        ]}
      />
      <p className="text-[12.5px] text-muted-foreground">{e.cycleMin === null ? t("console.health.cycle_unknown") : t("console.health.cycle", { minutes: e.cycleMin })}</p>
    </>
  );
}

function Edge({ h }: { h: PlatformHealth }) {
  const t = useT();
  const e = h.edge;
  if (!e.sMode) return <StatusText tone="neutral">{t("console.health.s_mode_off")}</StatusText>;
  return (
    <Kv
      rows={[
        [t("console.health.worker_version"), e.workerVersion ?? "—"],
        [t("console.health.last_edge"), e.lastEdgeAt ? <Ago iso={e.lastEdgeAt} /> : t("console.health.never")],
        [t("console.health.prev_key"), e.prevKeyRequests24h],
        [t("console.health.bad_key"), e.badKey24h],
        [t("console.health.foreign"), e.foreignHosts24h],
      ]}
    />
  );
}

function Sheets({ h }: { h: PlatformHealth }) {
  const t = useT();
  const active = h.sheets.length;
  const threshold = Math.max(15, 5 * Math.ceil(active / 16));
  return (
    <>
      <p className="text-[12.5px] text-muted-foreground">{t("console.health.sheets_capacity", { minutes: threshold })}</p>
      {h.sheetsTop.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t("console.health.sheets_none")}</p>
      ) : (
        <Kv rows={h.sheetsTop.slice(0, 10).map((s) => [s.storeId.slice(-8), t("console.health.minutes", { minutes: s.oldestMin })])} />
      )}
    </>
  );
}

function Errors({ h }: { h: PlatformHealth }) {
  const t = useT();
  if (h.errors24h.length === 0) return <p className="text-[12.5px] text-muted-foreground">{t("console.health.errors_none")}</p>;
  return (
    <ul className="grid gap-1.5">
      {h.errors24h.slice(0, 12).map((e) => (
        <li key={`${e.area}:${e.code}:${e.route}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[12px]">
          <span className="truncate font-mono">
            {e.area} / {e.code}
            {e.route ? ` / ${e.route}` : ""}
          </span>
          <span className="num text-end font-medium">{e.count}</span>
          <span className="text-[11px] text-muted-foreground">{t("console.health.errors_line", { stores: e.stores })}</span>
          <span className="text-end text-[11px] text-muted-foreground">
            <Ago iso={e.lastAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Runtime({ h }: { h: PlatformHealth }) {
  const t = useT();
  const r = h.runtime;
  return (
    <>
      <Kv
        rows={[
          [t("console.health.build"), h.build.id ?? "—"],
          [t("console.health.gate_sha"), h.build.gateSha ? h.build.gateSha.slice(0, 10) : "—"],
          [t("console.health.node"), r.node],
          [t("console.health.memory"), `${bytesText(r.memory.heapUsed)} / ${bytesText(r.memory.heapTotal)} · rss ${bytesText(r.memory.rss)}`],
          [t("console.health.uptime"), durationText(r.uptimeSec * 1_000) ?? "—"],
        ]}
      />
      {r.bootWarnings.length > 0 && (
        <ul className="grid gap-1">
          {r.bootWarnings.map((w) => (
            <li key={w}>
              <StatusText tone="warn">{w}</StatusText>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Ai({ a }: { a: NonNullable<PlatformHealth["ai"]> }) {
  const t = useT();
  return (
    <>
      <StatusText tone={a.enabled && a.breaker === "closed" ? "ok" : "warn"}>{a.enabled ? (a.breaker === "closed" ? t("console.health.ai_ok") : t("console.health.ai_breaker", { state: a.breaker })) : t("console.system.ai.off")}</StatusText>
      <Kv
        rows={[
          [t("console.health.ai_cap"), a.spend.usedPct === null ? "—" : `${Math.round(a.spend.usedPct)} %`],
          [t("console.health.ai_pending"), a.spend.pendingSliceUsedPct === null ? "—" : `${Math.round(a.spend.pendingSliceUsedPct)} %`],
          [t("console.health.ai_jobs"), `${a.jobs.running} · ${a.jobs.orphaned} · ${a.jobs.failed24h}`],
          [t("console.health.ai_batches"), a.batches.open],
          [t("console.health.ai_refusals"), a.refusalRate24h === null ? "—" : `${Math.round(a.refusalRate24h * 100)} %`],
          [t("console.health.ai_probe"), a.detachedJobs.probedAt ? (a.detachedJobs.flag ? t("console.health.pass") : t("console.health.fail")) : t("console.health.not_run")],
        ]}
      />
    </>
  );
}

function Commerce({ h }: { h: PlatformHealth }) {
  const t = useT();
  const max = Math.max(1, ...h.commerce.ordersPerHour24);
  return (
    <>
      <Kv rows={[[t("console.health.last_order"), h.commerce.lastOrderAt ? <Ago iso={h.commerce.lastOrderAt} /> : t("console.health.never")]]} />
      {h.commerce.ordersPerHour24.length > 0 && (
        <div className="flex h-12 items-end gap-0.5" role="img" aria-label={t("console.health.orders_24h", { count: h.commerce.ordersPerHour24.reduce((s, n) => s + n, 0) })}>
          {h.commerce.ordersPerHour24.map((n, i) => (
            <span key={i} title={String(n)} className="w-full rounded-t-[2px] bg-[color-mix(in_oklch,var(--brand)_70%,transparent)]" style={{ height: `${Math.max(4, Math.round((n / max) * 100))}%` }} />
          ))}
        </div>
      )}
    </>
  );
}
