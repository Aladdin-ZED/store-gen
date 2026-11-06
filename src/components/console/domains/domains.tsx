"use client";
/**
 * `/admin/domains` (platform.md PLA-§16, OS-06, core §C.10; PD82, V12, V13): the status card (non-secret values,
 * EDGE_KEY / EDGE_KEY_PREV as set / not set only, the ADMIN_HOST line, the sign-up default the addresses imply),
 * the re-render progress (Retry failed, Re-render all ↑), the move checklist with Mark done (date and staff member),
 * and V1 … V13: Run for the server-runnable ones (V10 / V13 with a token from the test widget), a note and Passed for
 * the manual ones. When every check has passed, the banner offers "Switch sign-up to approval" and links the D69
 * ceilings card. No secret value is ever shown.
 */
import { CheckIcon, PlayIcon, RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { markDomainCheckAction, markDomainStepAction, rerenderAllAction, retryFailedRendersAction, runDomainCheckAction } from "@/app/admin/(console)/domains/actions";
import { savePlatformSettingsAction } from "@/app/admin/(console)/settings/actions";
import { TurnstileField } from "@/app/(public)/_components/turnstile-field";
import { useT } from "@/lib/i18n/admin/client";
import type { DomainMoveView, DomainStatus, RerenderState } from "@/lib/platform/domain-move";
import type { DomainCheckResult, DomainCheckView } from "@/lib/platform/domain-move-rules";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { useGuarded } from "../guarded";
import { PrefetchLink } from "../prefetch-link";
import { ConsoleDialog } from "../queue/decision-dialogs";
import { Banner, button, card, inputCls, Meter, SettingsCard, StatusText } from "../kit";
import { consoleUrl } from "@/lib/platform/console-url";

const mono = "font-mono text-[12px]";

export function DomainStatusCard({ s }: { s: DomainStatus }) {
  const t = useT();
  const set = (v: "set" | "not_set") => <StatusText tone={v === "set" ? "ok" : "neutral"}>{t(`console.domains.${v}`)}</StatusText>;
  const val = (v: string | null) =>
    v ? (
      <bdi dir="ltr" className={mono}>
        {v}
      </bdi>
    ) : (
      <span className="text-muted-foreground">{t("console.domains.not_set")}</span>
    );
  const rows: [string, ReactNode][] = [
    [t("console.domains.mode"), <StatusText key="m" tone={s.sMode ? "ok" : "neutral"}>{t(s.sMode ? "console.domains.s_on" : "console.domains.p_only")}</StatusText>],
    ["PLATFORM_URL", val(s.platformHost)],
    ["STORE_ROOT_DOMAIN", val(s.storeRootDomain)],
    ["LEGACY_PLATFORM_HOSTS", val(s.legacyHosts.join(", ") || null)],
    ["BEHIND_CLOUDFLARE", val(s.behindCloudflare ? "1" : null)],
    ["TRUSTED_PROXY_HOPS", val(String(s.trustedProxyHops))],
    ["EDGE_KEY", s.edgeKey === "set" && !s.edgeKeyUsable ? <StatusText key="e" tone="danger">{t("console.domains.edge_unusable")}</StatusText> : set(s.edgeKey)],
    ["EDGE_KEY_PREV", set(s.edgeKeyPrev)],
  ];
  return (
    <SettingsCard title={t("console.domains.status")} lead={t("console.domains.status_lead")}>
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([k, v]) => (
          <div key={k} className="grid min-w-0 gap-0.5">
            <dt className={cn("text-[11.5px] text-muted-foreground", k === k.toUpperCase() && "font-mono")}>{k}</dt>
            <dd className="min-w-0 truncate text-[12.5px]">{v}</dd>
          </div>
        ))}
        <div className="grid min-w-0 gap-0.5 sm:col-span-2">
          <dt className="font-mono text-[11.5px] text-muted-foreground">ADMIN_HOST</dt>
          <dd className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {s.adminHost && (
              <bdi dir="ltr" className={mono}>
                {s.adminHost}
              </bdi>
            )}
            <StatusText tone={s.adminHostLine === "own_host" ? "ok" : s.adminHostLine === "shared_origin" ? "danger" : "neutral"}>{s.adminHostText}</StatusText>
          </dd>
        </div>
        <div className="grid min-w-0 gap-0.5 sm:col-span-2">
          <dt className="text-[11.5px] text-muted-foreground">{t("console.domains.signup_default")}</dt>
          <dd className="text-[12.5px]">
            {t("console.domains.signup_default_value", { mode: t(`console.signup.mode.${s.signup.defaultMode}`) })}
            {s.signup.stored && <span className="text-muted-foreground"> · {t("console.domains.signup_stored", { mode: t(`console.signup.mode.${s.signup.stored}`) })}</span>}
          </dd>
        </div>
      </dl>
    </SettingsCard>
  );
}

export function RerenderCard({ state, canManage }: { state: RerenderState | null; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [confirm, setConfirm] = useState(false);
  const running = state !== null && !state.done && !state.unavailable;
  return (
    <SettingsCard
      title={t("console.domains.rerender")}
      lead={t("console.domains.rerender_lead")}
      aside={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => retryFailedRendersAction({ opId }), (d) => (g.reset(), toast.success("unavailable" in d ? t("console.action.unavailable") : t("console.domains.retried", { stores: d.stores, pages: d.enqueued })), router.refresh()))} className={cn(button.base, button.secondary)}>
              <RotateCwIcon aria-hidden="true" className="size-3.5" />
              {t("console.domains.retry_failed")}
            </button>
            <button type="button" disabled={running} onClick={() => setConfirm(true)} className={cn(button.base, button.primary)}>
              {t("console.domains.rerender_all")}
            </button>
          </div>
        ) : null
      }
    >
      {g.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      {!state ? (
        <p className="text-[12.5px] text-muted-foreground">{t("console.domains.rerender_never")}</p>
      ) : state.unavailable ? (
        <StatusText tone="neutral">{t("console.domains.rerender_unavailable")}</StatusText>
      ) : (
        <>
          <Meter
            label={state.done ? t("console.domains.rerender_done") : t("console.domains.rerender_running")}
            used={state.done ? 1 : 0}
            limit={1}
            tone={state.failed > 0 ? "warn" : "ok"}
            text={t("console.domains.rerender_line", { stores: state.stores, pages: state.enqueued, failed: state.failed })}
          />
          <p className="text-[12px] text-muted-foreground">
            {t("console.domains.rerender_requested")} <Ago iso={state.requestedAt} />
            {state.finishedAt && (
              <>
                {" · "}
                {t("console.domains.rerender_finished")} <Ago iso={state.finishedAt} />
              </>
            )}
          </p>
        </>
      )}
      {confirm && (
        <ConsoleDialog
          open
          onOpenChange={(o) => !o && setConfirm(false)}
          title={t("console.domains.rerender_all")}
          description={t("console.domains.rerender_confirm")}
          footer={
            <>
              <button type="button" onClick={() => setConfirm(false)} className={cn(button.base, button.secondary)}>
                {t("console.form.cancel")}
              </button>
              <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => rerenderAllAction({ opId }), (d) => (g.reset(), setConfirm(false), toast.success(d.started ? t("console.domains.rerender_started") : t("console.domains.rerender_already")), router.refresh()))} className={cn(button.base, button.primary)}>
                {t("console.domains.rerender_go")}
              </button>
            </>
          }
        >
          <p className="text-[12.5px] text-muted-foreground">{t("console.step_up_note")}</p>
        </ConsoleDialog>
      )}
      {g.sheet}
    </SettingsCard>
  );
}

export function Checklist({ move, names, canManage }: { move: DomainMoveView; names: Record<string, string>; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const done = move.steps.filter((s) => s.done).length;
  return (
    <section aria-label={t("console.domains.checklist")} className={card}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.domains.checklist")}</h2>
          <p className="text-[12.5px] text-muted-foreground">{t("console.domains.checklist_lead")}</p>
        </div>
        <span className="num text-[12px] text-muted-foreground">{t("console.domains.progress", { done, total: move.steps.length })}</span>
      </div>
      {g.problem && <p className="px-5 pb-2 text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      <ol className="divide-y divide-[var(--c-hairline)] border-t border-[var(--c-hairline)]">
        {move.steps.map((s, i) => (
          <li key={s.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[28px_minmax(0,1fr)_auto] md:px-5">
            <span aria-hidden="true" className={cn("num mt-0.5 inline-grid size-6 place-items-center rounded-full text-[11px] font-medium", s.done ? "bg-[var(--brand)] text-[var(--brand-foreground)]" : "bg-muted text-muted-foreground")}>
              {s.done ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                {s.title}
                <span className="rounded-[var(--r-chip)] bg-muted px-1.5 text-[10.5px] font-medium text-muted-foreground">{t(`console.domains.by.${s.by}`)}</span>
              </span>
              <span className="text-[12px] leading-[1.5] text-muted-foreground">{s.detail}</span>
              {s.done && <span className="text-[11.5px] text-muted-foreground">{t("console.domains.done_by", { name: names[s.done.by] ?? "—", date: s.done.at.slice(0, 10) })}</span>}
            </span>
            {canManage && (
              <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => markDomainStepAction({ stepId: s.id, done: !s.done, opId }), () => (g.reset(), router.refresh()))} className={cn(button.base, s.done ? button.ghost : button.secondary, "col-start-2 justify-self-start sm:col-start-3 sm:self-start")}>
                {s.done ? t("console.domains.undo") : t("console.domains.mark_done")}
              </button>
            )}
          </li>
        ))}
      </ol>
      {g.sheet}
    </section>
  );
}

export function Checks({ move, names, canManage, siteKey, nonce, root }: { move: DomainMoveView; names: Record<string, string>; canManage: boolean; siteKey: string | null; nonce?: string; root: string | null }) {
  const t = useT();
  const router = useRouter();
  const passed = move.checks.filter((c) => c.passed).length;
  return (
    <div className="grid gap-4">
      {move.allPassed && (
        <Banner tone="ok" action={canManage ? <SwitchSignup /> : undefined}>
          {t("console.domains.all_passed")}{" "}
          <PrefetchLink href={consoleUrl("/settings/signup?tab=mode#ceilings")} className="font-medium text-[var(--c-brand-ink)] underline-offset-2 hover:underline">
            {t("console.domains.ceilings_link")}
          </PrefetchLink>
        </Banner>
      )}
      <section aria-label={t("console.domains.checks")} className={card}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 md:px-5">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.domains.checks")}</h2>
            <p className="text-[12.5px] text-muted-foreground">{t("console.domains.checks_lead")}</p>
          </div>
          <span className="num text-[12px] text-muted-foreground">{t("console.domains.progress", { done: passed, total: move.checks.length })}</span>
        </div>
        <ul className="divide-y divide-[var(--c-hairline)] border-t border-[var(--c-hairline)]">
          {move.checks.map((c) => (
            <CheckRow key={c.id} c={c} names={names} canManage={canManage} siteKey={siteKey} nonce={nonce} root={root} onChanged={() => router.refresh()} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SwitchSignup() {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  return (
    <>
      <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => savePlatformSettingsAction({ section: "signup", patch: { mode: null }, opId }), () => (toast.success(t("console.domains.switched")), router.refresh()))} className={cn(button.base, button.primary)}>
        {t("console.domains.switch_signup")}
      </button>
      {g.problem && <span className="w-full text-[12px] text-[var(--c-danger-ink)]">{g.problem}</span>}
      {g.sheet}
    </>
  );
}

function CheckRow({ c, names, canManage, siteKey, nonce, root, onChanged }: { c: DomainCheckView; names: Record<string, string>; canManage: boolean; siteKey: string | null; nonce?: string; root: string | null; onChanged(): void }) {
  const t = useT();
  const g = useGuarded();
  const [result, setResult] = useState<DomainCheckResult | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(c.passed?.note ?? "");
  const [handle, setHandle] = useState("");
  const [hostnames, setHostnames] = useState(false);
  const [round, setRound] = useState(0);
  const needsToken = c.id === "V10" || c.id === "V13";
  const run = (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const token = e ? String(new FormData(e.currentTarget).get("cf-turnstile-response") ?? "") : "";
    void g.run(
      () => runDomainCheckAction({ id: c.id, token: token || null, hostnamesConfirmed: hostnames, handle: handle.trim() || null }),
      (d) => {
        setResult(d);
        setRound((n) => n + 1);
        if (d.outcome === "passed") onChanged();
      },
    );
  };
  return (
    <li className="grid gap-2 px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="num mt-0.5 w-9 shrink-0 font-mono text-[12px] font-semibold text-muted-foreground">{c.id}</span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[13px] font-medium">{c.title}</span>
          <span className="text-[12px] leading-[1.5] text-muted-foreground">{c.pass}</span>
          {c.how && <span className="font-mono text-[11.5px] text-muted-foreground">{c.how}</span>}
          {c.passed && (
            <span className="text-[11.5px] text-muted-foreground">
              {t("console.domains.passed_by", { name: names[c.passed.by] ?? "—", date: c.passed.at.slice(0, 10) })}
              {c.passed.note ? ` · ${c.passed.note}` : ""}
            </span>
          )}
        </span>
        {c.passed ? <StatusText tone="ok">{t("console.domains.passed")}</StatusText> : <StatusText tone="neutral">{t(c.runnable ? "console.domains.not_run" : "console.domains.manual")}</StatusText>}
        {canManage && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn(button.base, c.runnable ? button.secondary : button.ghost)}>
            {c.runnable ? <PlayIcon aria-hidden="true" className="size-3.5" /> : null}
            {c.runnable ? t("console.domains.run") : c.passed ? t("console.domains.edit_note") : t("console.domains.mark_passed")}
          </button>
        )}
      </div>
      {open && canManage && (
        <div className="ms-12 grid gap-2 rounded-[var(--r-control)] bg-muted/40 p-3">
          {c.runnable ? (
            <form onSubmit={run} className="grid gap-2">
              {c.id === "V7" && <input aria-label={t("console.domains.handle")} dir="ltr" placeholder={t("console.domains.handle_placeholder")} value={handle} onChange={(e) => setHandle(e.target.value)} className={cn(inputCls, "max-w-xs font-mono")} />}
              {c.id === "V13" && (
                <label className="flex items-start gap-2 text-[12.5px]">
                  <input type="checkbox" checked={hostnames} onChange={(e) => setHostnames(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                  {t("console.domains.hostnames_confirm", { root: root ?? "—" })}
                </label>
              )}
              {needsToken && (siteKey ? <TurnstileField siteKey={siteKey} nonce={nonce} locale="en" resetKey={round || undefined} /> : <StatusText tone="warn">{t("console.domains.widget_missing")}</StatusText>)}
              <button type="submit" disabled={g.busy} className={cn(button.base, button.primary, "justify-self-start")}>
                <PlayIcon aria-hidden="true" className="size-3.5" />
                {g.busy ? t("console.domains.running") : t("console.domains.run_now")}
              </button>
            </form>
          ) : (
            <div className="grid gap-2">
              <input aria-label={t("console.domains.note")} maxLength={200} placeholder={t("console.domains.note_placeholder")} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => markDomainCheckAction({ id: c.id, passed: true, note: note.trim(), opId }), () => (g.reset(), setOpen(false), onChanged()))} className={cn(button.base, button.primary)}>
                  <CheckIcon aria-hidden="true" className="size-3.5" />
                  {t("console.domains.mark_passed")}
                </button>
                {c.passed && (
                  <button type="button" disabled={g.busy} onClick={() => void g.run((opId) => markDomainCheckAction({ id: c.id, passed: false, opId }), () => (g.reset(), setOpen(false), onChanged()))} className={cn(button.base, button.ghost)}>
                    {t("console.domains.unmark")}
                  </button>
                )}
              </div>
            </div>
          )}
          {g.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          {result && (
            <div className="grid gap-1" aria-live="polite">
              <StatusText tone={result.outcome === "passed" ? "ok" : result.outcome === "failed" ? "danger" : result.outcome === "skipped" ? "neutral" : "warn"}>
                {t(`console.domains.outcome.${result.outcome}`)} · {result.message}
              </StatusText>
              {result.answers.length > 0 && (
                <ul className="grid gap-0.5 font-mono text-[11.5px] text-muted-foreground">
                  {result.answers.map((a) => (
                    <li key={a}>
                      <bdi dir="ltr">{a}</bdi>
                    </li>
                  ))}
                </ul>
              )}
              <span className="text-[11px] text-muted-foreground">{t(result.network ? "console.domains.network_yes" : "console.domains.network_no")}</span>
            </div>
          )}
          {g.sheet}
        </div>
      )}
    </li>
  );
}
