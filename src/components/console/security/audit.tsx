"use client";
/**
 * The audit log and break-glass views (platform.md PLA-§14.3, SE-04; `audit.platform`): the filters in the URL
 * (store, staff, actor kind, action prefix, dates), rows with the actor (name + platform role), the action as a
 * sentence with its raw name in mono, the target linked (store or person), the redacted meta and the 8-character IP
 * hash; the break-glass weekly review and the pending platform requests with Confirm (a different staff member, ↑)
 * and Cancel.
 */
import { DownloadIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelPlatformRequestAction, confirmPlatformRequestAction, markBreakGlassReviewedAction } from "@/app/admin/(console)/security/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { AuditViewFilter, AuditViewPage, AuditViewRow } from "@/lib/platform/audit-log";
import type { OpenRequestView } from "@/lib/platform/platform-requests";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { useGuarded } from "../guarded";
import { PrefetchLink } from "../prefetch-link";
import { ConsoleDialog } from "../queue/decision-dialogs";
import { Banner, button, card, EmptyLine, Field, inputCls, SettingsCard, StatusText, TypedConfirm } from "../kit";
import { consoleUrl } from "@/lib/platform/console-url";

const ACTOR_KINDS = ["platform", "user", "impersonation", "system", "api"] as const;
const AREAS = ["platform", "store", "auth"] as const;
const link = "rounded-[3px] text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export function AuditFilters({ filter, staff, csv }: { filter: AuditViewFilter; staff: { id: string; name: string }[]; csv: string | null }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState({ storeId: filter.storeId ?? "", userId: filter.userId ?? "", actorKind: filter.actorKind ?? "", area: filter.area ?? "", from: filter.from ?? "", to: filter.to ?? "" });
  const apply = (next = v) => {
    const q = new URLSearchParams();
    for (const [k, x] of Object.entries(next)) if (x.trim()) q.set(k, x.trim());
    router.push(consoleUrl(`/security/audit${q.size ? `?${q}` : ""}`));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className={cn(card, "grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto] lg:items-end")}
    >
      <Field label={t("console.audit_view.store")}>{(id) => <input id={id} dir="ltr" placeholder={t("console.audit_view.store_id")} value={v.storeId} onChange={(e) => setV({ ...v, storeId: e.target.value.toUpperCase() })} className={cn(inputCls, "font-mono")} />}</Field>
      <Field label={t("console.audit_view.staff")}>
        {(id) => (
          <select id={id} value={v.userId} onChange={(e) => setV({ ...v, userId: e.target.value })} className={inputCls}>
            <option value="">{t("console.audit_view.anyone")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t("console.audit_view.actor_kind")}>
        {(id) => (
          <select id={id} value={v.actorKind} onChange={(e) => setV({ ...v, actorKind: e.target.value })} className={inputCls}>
            <option value="">{t("console.audit_view.any_kind")}</option>
            {ACTOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`console.audit_view.kind.${k}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t("console.audit_view.area")}>
        {(id) => (
          <>
            <input id={id} list={`${id}-l`} dir="ltr" placeholder="platform." value={v.area} onChange={(e) => setV({ ...v, area: e.target.value.replace(/\.$/, "") })} className={cn(inputCls, "font-mono")} />
            <datalist id={`${id}-l`}>
              {AREAS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <Field label={t("console.audit_view.from")}>{(id) => <input id={id} type="date" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} className={inputCls} />}</Field>
      <Field label={t("console.audit_view.to")}>{(id) => <input id={id} type="date" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} className={inputCls} />}</Field>
      <div className="flex gap-2">
        <button type="submit" className={cn(button.base, button.primary)}>
          {t("console.audit_view.apply")}
        </button>
        {csv && (
          <a href={csv} className={cn(button.base, button.secondary)} download>
            <DownloadIcon aria-hidden="true" className="size-3.5" />
            CSV
          </a>
        )}
      </div>
    </form>
  );
}

function sentence(t: (k: string, v?: Record<string, string | number>) => string, action: string): string | null {
  const key = `console.audit.${action}`;
  const s = t(key);
  return s === key ? null : s;
}

export function AuditTable({ page, olderHref, label, empty }: { page: AuditViewPage; olderHref: string | null; label: string; empty?: string }) {
  const t = useT();
  if (page.rows.length === 0 && !olderHref) return <section aria-label={label} className={card}>{<EmptyLine>{empty ?? t("console.audit_view.empty")}</EmptyLine>}</section>;
  return (
    <section aria-label={label} className={cn(card, "overflow-hidden")}>
      {page.rows.length === 0 ? (
        <EmptyLine>{t("console.audit_view.none_scanned")}</EmptyLine>
      ) : (
        <ul className="divide-y divide-[var(--c-hairline)]">
          {page.rows.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </ul>
      )}
      {olderHref && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--c-hairline)] px-4 py-2.5 md:px-5">
          {page.partial && <span className="text-[12px] text-muted-foreground">{t("console.audit_view.partial")}</span>}
          <PrefetchLink href={olderHref} className={cn(link, "ms-auto text-[12.5px] font-medium")}>
            {t("console.pager.older")}
          </PrefetchLink>
        </div>
      )}
    </section>
  );
}

function Row({ r }: { r: AuditViewRow }) {
  const t = useT();
  const s = sentence(t, r.action);
  const actor =
    r.actorKind === "system" ? t("console.feed.actor.system") : r.actorKind === "impersonation" ? t("console.activity_tab.during_view", { name: r.impersonator ?? r.actor.name ?? t("console.feed.actor.staff") }) : (r.actor.name ?? t("console.feed.actor.member"));
  return (
    <li className="grid gap-1.5 px-4 py-3 md:grid-cols-[132px_minmax(0,200px)_minmax(0,1fr)_auto] md:gap-4 md:px-5">
      <span className="text-[12px] text-muted-foreground">
        <Ago iso={r.at} />
        <span className="num block text-[11px]">{r.at.slice(0, 16).replace("T", " ")}</span>
      </span>
      <span className="grid min-w-0 content-start gap-0.5">
        {r.actor.id && r.actorKind !== "system" ? (
          <PrefetchLink href={consoleUrl(`/users/${r.actor.id}`)} className={cn(link, "truncate text-[12.5px] font-medium")}>
            {actor}
          </PrefetchLink>
        ) : (
          <span className="truncate text-[12.5px] font-medium">{actor}</span>
        )}
        {r.actorKind !== "system" && <span className="text-[11.5px] text-muted-foreground">{r.actor.role && r.actor.role !== "none" ? t(`console.role.${r.actor.role}`) : t(`console.audit_view.kind.${r.actorKind}`)}</span>}
      </span>
      <span className="grid min-w-0 content-start gap-1">
        {s ? (
          <>
            <span className="text-[13px]">{s}</span>
            <bdi dir="ltr" className="font-mono text-[11px] text-muted-foreground">
              {r.action}
            </bdi>
          </>
        ) : (
          <bdi dir="ltr" className="font-mono text-[12.5px]">
            {r.action}
          </bdi>
        )}
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
          {r.store && (
            <PrefetchLink href={consoleUrl(`/stores/${r.store.id}`)} className={link}>
              <bdi dir="ltr">{r.store.handle ? `@${r.store.handle}` : r.store.id.slice(-8)}</bdi>
            </PrefetchLink>
          )}
          {r.userTarget && (
            <PrefetchLink href={consoleUrl(`/users/${r.userTarget}`)} className={link}>
              {t("console.audit_view.person")}
            </PrefetchLink>
          )}
          {r.target && !r.userTarget && !(r.store && r.target === r.store.id) && (
            <bdi dir="ltr" className="max-w-[320px] truncate font-mono text-[11.5px] text-muted-foreground">
              {r.target}
            </bdi>
          )}
        </span>
        {r.meta && r.meta !== "{}" && (
          <details className="text-[11.5px]">
            <summary className="cursor-pointer text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{t("console.audit_view.details")}</summary>
            <pre dir="ltr" className="mt-1 max-h-48 overflow-auto rounded-[var(--r-control)] bg-muted/50 p-2 font-mono whitespace-pre-wrap break-all">
              {r.meta}
            </pre>
          </details>
        )}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground md:text-end" title={t("console.audit_view.ip_hash")}>
        {r.ip8 ?? ""}
      </span>
    </li>
  );
}

export function BreakGlassReview({ week, reviewed, marks }: { week: string; reviewed: boolean; marks: { week: string; at: string; by: string | null }[] }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  return (
    <SettingsCard
      title={t("console.breakglass.review")}
      lead={t("console.breakglass.review_lead")}
      aside={
        reviewed ? (
          <StatusText tone="ok">{t("console.breakglass.reviewed", { week })}</StatusText>
        ) : (
          <button type="button" disabled={g.busy} onClick={() => void g.run(() => markBreakGlassReviewedAction({ week }), () => (toast.success(t("console.breakglass.marked", { week })), router.refresh()))} className={cn(button.base, button.primary)}>
            <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
            {t("console.breakglass.mark", { week })}
          </button>
        )
      }
    >
      {g.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      {marks.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {marks.map((m) => (
            <li key={m.week} className="rounded-[var(--r-chip)] bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground" title={m.by ?? undefined}>
              <span className="num font-medium text-foreground">{m.week}</span> · {m.at.slice(0, 10)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t("console.breakglass.never")}</p>
      )}
      {g.sheet}
    </SettingsCard>
  );
}

export function PendingRequests({ rows }: { rows: OpenRequestView[] }) {
  const t = useT();
  const [act, setAct] = useState<{ kind: "confirm" | "cancel"; row: OpenRequestView } | null>(null);
  return (
    <section aria-label={t("console.breakglass.requests")} className={card}>
      <div className="grid gap-0.5 px-4 pt-4 pb-3 md:px-5">
        <h2 className="text-[14px] font-semibold tracking-[-0.006em]">{t("console.breakglass.requests_title", { count: rows.length })}</h2>
        <p className="text-[12.5px] text-muted-foreground">{t("console.breakglass.requests_lead")}</p>
      </div>
      {rows.length === 0 ? (
        <EmptyLine>{t("console.breakglass.requests_empty")}</EmptyLine>
      ) : (
        <ul className="divide-y divide-[var(--c-hairline)] border-t border-[var(--c-hairline)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-[13px] font-medium">
                  {r.kind === "store_purge" ? t("console.breakglass.kind.store_purge", { store: r.store?.handle ? `@${r.store.handle}` : (r.store?.name ?? "") }) : t("console.breakglass.kind.staff_super_admin", { name: r.target?.name ?? "" })}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {t("console.breakglass.by", { name: r.requestedBy.name ?? "—" })} · <Ago iso={r.requestedAt} /> · {t(`console.breakglass.mode.${r.mode}`)}
                  {r.reasonNote ? ` · ${r.reasonNote}` : ""}
                </span>
                <span className="flex flex-wrap gap-x-3 text-[12px]">
                  {r.store && (
                    <PrefetchLink href={consoleUrl(`/stores/${r.store.id}`)} className={link}>
                      {t("console.breakglass.open_store")}
                    </PrefetchLink>
                  )}
                  {r.target && (
                    <PrefetchLink href={consoleUrl(`/users/${r.target.id}`)} className={link}>
                      {t("console.breakglass.open_person")}
                    </PrefetchLink>
                  )}
                  <PrefetchLink href={consoleUrl(`/users/${r.requestedBy.id}`)} className={link}>
                    {t("console.breakglass.open_requester")}
                  </PrefetchLink>
                </span>
              </span>
              <span className="text-[12px]">
                {r.status === "confirmed" ? (
                  <StatusText tone="warn">{r.executeAfter ? <Until iso={r.executeAfter} template="console.breakglass.runs_in" /> : t("console.breakglass.confirmed")}</StatusText>
                ) : r.mode === "delayed" && r.executeAfter ? (
                  <StatusText tone="info">
                    <Until iso={r.executeAfter} template="console.breakglass.runs_in" />
                  </StatusText>
                ) : (
                  <StatusText tone="info">{t("console.breakglass.waiting_second")}</StatusText>
                )}
              </span>
              <span className="flex gap-2">
                {r.status === "pending" && !r.mine && (
                  <button type="button" onClick={() => setAct({ kind: "confirm", row: r })} className={cn(button.base, button.primary)}>
                    {t("console.breakglass.confirm")}
                  </button>
                )}
                <button type="button" onClick={() => setAct({ kind: "cancel", row: r })} className={cn(button.base, button.secondary)}>
                  {t("console.form.cancel")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {act && <RequestDialog kind={act.kind} row={act.row} onClose={() => setAct(null)} />}
    </section>
  );
}

function RequestDialog({ kind, row, onClose }: { kind: "confirm" | "cancel"; row: OpenRequestView; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded();
  const [typed, setTyped] = useState("");
  const handle = row.store?.handle ?? "";
  const needsHandle = kind === "confirm" && row.kind === "store_purge" && !!handle;
  const ready = !needsHandle || typed.trim().toLowerCase() === handle.toLowerCase();
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(kind === "confirm" ? "console.breakglass.confirm_title" : "console.breakglass.cancel_title")}
      description={t(kind === "confirm" ? `console.breakglass.confirm_lead.${row.kind}` : "console.breakglass.cancel_lead")}
      footer={
        <>
          {g.problem && <p className="me-auto text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
          <button type="button" onClick={onClose} className={cn(button.base, button.secondary)}>
            {t("console.breakglass.keep")}
          </button>
          <button
            type="button"
            disabled={!ready || g.busy}
            onClick={() => {
              const after = () => (toast.success(t(kind === "confirm" ? "console.breakglass.confirmed_done" : "console.breakglass.cancelled_done")), onClose(), router.refresh());
              if (kind === "confirm") void g.run((opId) => confirmPlatformRequestAction({ requestId: row.id, typedHandle: needsHandle ? typed.trim() : undefined, opId }), after);
              else void g.run((opId) => cancelPlatformRequestAction({ requestId: row.id, opId }), after);
            }}
            className={cn(button.base, kind === "confirm" ? button.dangerSolid : button.primary)}
          >
            {t(kind === "confirm" ? "console.breakglass.confirm" : "console.breakglass.cancel_go")}
          </button>
          {g.sheet}
        </>
      }
    >
      {kind === "confirm" && row.kind === "store_purge" && <Banner tone="danger">{t("console.breakglass.purge_warning")}</Banner>}
      {needsHandle && <TypedConfirm word={handle} value={typed} onChange={setTyped} label={t("console.breakglass.type_handle", { handle })} />}
      <p className="text-[12px] text-muted-foreground">{t("console.step_up_note")}</p>
    </ConsoleDialog>
  );
}
