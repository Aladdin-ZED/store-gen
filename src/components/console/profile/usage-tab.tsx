"use client";
/**
 * The store profile's Usage & plan tab (platform.md PLA-§7.9, §9.3, §9.4; PL-11, D69):
 *   - the plan card (name, since) with Change plan (`entitlements.override`): active and hidden plans, a note →
 *     `assignPlanAction` (the store hears `plan.changed`);
 *   - the entitlements table, one row per key of this release: plan value, override / boost (value, expiry, set by,
 *     reason), the state cap, the kill switch effect, the effective value, and Add override / Add boost / Remove;
 *     keys of later releases collapse under "Later". A boost needs an expiry (presets 7 / 30 / 90 days, at most 90),
 *     a reason is required (≤ 200), and `take_orders` can never be turned off (the server refuses it too);
 *   - the usage meters (used / limit / %) with the last reconcile time, this month in the store's time zone, and the
 *     "Above the soft order limit" line (banner only, orders are never blocked); the plan and entitlement history.
 *
 *   <UsageTab storeId={id} usage={u} plans={[…]} canOverride />
 */
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { assignPlanAction, clearEntitlementAction, setEntitlementAction } from "@/app/admin/(console)/stores/[id]/actions";
import { UsageMeter } from "@/components/admin/common/usage-meter";
import { useT } from "@/lib/i18n/admin/client";
import type { EntitlementLine, StoreUsage } from "@/lib/platform/profile/usage";
import { cn } from "@/lib/utils";
import { Ago, Until } from "../ago";
import { bytesText } from "../format";
import { newOpId } from "../op";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";

const MIB = 1024 * 1024;
const PRESETS = [7, 30, 90] as const;
const UNIT: Record<string, "bytes" | "count" | "credits"> = { media_bytes: "bytes", ai_credits: "credits" };

type PlanOption = { id: string; name: string; status: string };

function valueText(t: ReturnType<typeof useT>, line: Pick<EntitlementLine, "kind" | "unit">, v: number | boolean | null | undefined): string {
  if (v === undefined) return "";
  if (line.kind === "feature") return v ? t("console.strip.on") : t("console.strip.off");
  if (v === null) return t("console.usage_tab.unlimited");
  return line.unit === "bytes" ? bytesText(Number(v)) : String(v);
}

export function UsageTab({ storeId, usage, plans, canOverride }: { storeId: string; usage: StoreUsage; plans: PlanOption[]; canOverride: boolean }) {
  const t = useT();
  const router = useRouter();
  const [planOpen, setPlanOpen] = useState(0);
  const [grant, setGrant] = useState<{ line: EntitlementLine; source: "override" | "boost"; n: number } | null>(null);
  const [showLater, setShowLater] = useState(false);
  const [pending, start] = useTransition();
  const now = usage.entitlements.filter((l) => !l.later);
  const later = usage.entitlements.filter((l) => l.later);

  const remove = (line: EntitlementLine, source: "override" | "boost") =>
    start(async () => {
      const r = await clearEntitlementAction({ storeId, key: line.key, source, opId: newOpId() });
      if (r.ok) {
        toast.success(t("console.usage_tab.removed", { key: t(`console.entitlement.${line.key}`) }));
        router.refresh();
      } else toast.error(r.message ? t(r.message) : t("console.usage_tab.failed"));
    });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[var(--r-card)] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[11.5px] text-muted-foreground">{t("console.usage_tab.plan")}</span>
          <span className="text-[17px] font-semibold tracking-[-0.01em]">{usage.plan.name ?? usage.plan.id}</span>
          <span className="text-[12px] text-muted-foreground">
            <bdi dir="ltr" className="font-mono">
              {usage.plan.id}
            </bdi>
            {usage.plan.since && (
              <>
                {" · "}
                <Ago iso={usage.plan.since} template="console.usage_tab.since" />
              </>
            )}
          </span>
        </div>
        {canOverride && (
          <button type="button" onClick={() => setPlanOpen((n) => n + 1)} className={cn(button.base, button.secondary)}>
            {t("console.usage_tab.change_plan")}
          </button>
        )}
      </section>

      {usage.aboveSoftOrders && <p className="rounded-[var(--r-control)] bg-[var(--c-warn-soft)] px-3.5 py-2.5 text-[13px]">{t("console.usage_tab.soft_orders")}</p>}

      <section aria-label={t("console.usage_tab.meters")} className="grid gap-3 rounded-[var(--r-card)] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold">{t("console.usage_tab.meters")}</h2>
          <span className="text-[11.5px] text-muted-foreground">{t("console.usage_tab.month", { month: usage.month })}</span>
        </div>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {usage.meters.map((m) => (
            <div key={m.metric} className="grid gap-1 [&>div:not([class])]:grid [&>div:not([class])]:grid-cols-[minmax(0,1fr)_auto] [&>div:not([class])]:gap-x-3 [&>div:not([class])]:text-[12.5px] [&>div:not([class])>meter]:col-span-2 [&>div:not([class])>meter]:h-1.5 [&>div:not([class])>meter]:w-full [&>div:not([class])>span:first-child]:text-muted-foreground">
              <UsageMeter label={t(`console.usage.metric.${m.metric}`)} used={m.used} limit={m.limit} unit={UNIT[m.metric] ?? "count"} />
              <span className="num text-[11px] text-muted-foreground">
                {m.pct !== null ? `${m.pct} %` : t("console.usage_tab.unlimited")}
                {m.soft && ` · ${t("console.usage_tab.soft")}`}
                {m.updatedAt && (
                  <>
                    {" · "}
                    <Ago iso={m.updatedAt} template="console.usage_tab.reconciled" />
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label={t("console.usage_tab.entitlements")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <div className="flex min-h-11 items-center border-b border-[var(--c-hairline)] px-4">
          <h2 className="text-[13px] font-semibold">{t("console.usage_tab.entitlements")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--c-hairline)] text-[11.5px] text-muted-foreground">
                {["key", "plan", "grant", "cap", "effective", "actions"].map((c) => (
                  <th key={c} scope="col" className={cn("h-9 px-3 text-start font-medium first:ps-4 last:pe-4", c === "actions" && "text-end")}>
                    {t(`console.usage_tab.col.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {now.map((l) => (
                <EntRow key={l.key} line={l} canOverride={canOverride} busy={pending} onAdd={(source) => setGrant((g) => ({ line: l, source, n: (g?.n ?? 0) + 1 }))} onRemove={(s) => remove(l, s)} />
              ))}
            </tbody>
          </table>
        </div>
        {later.length > 0 && (
          <div className="border-t border-[var(--c-hairline)] px-4 py-2.5">
            <button type="button" aria-expanded={showLater} onClick={() => setShowLater((s) => !s)} className="text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
              {showLater ? t("console.usage_tab.later_hide") : t("console.usage_tab.later_show", { count: later.length })}
            </button>
            {showLater && (
              <ul className="mt-2 grid gap-1 text-[12.5px] text-muted-foreground">
                {later.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span>{t(`console.entitlement.${l.key}`)}</span>
                    <span className="num">{valueText(t, l, l.plan)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-label={t("console.usage_tab.history")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        <div className="flex min-h-11 items-center border-b border-[var(--c-hairline)] px-4">
          <h2 className="text-[13px] font-semibold">{t("console.usage_tab.history")}</h2>
        </div>
        {usage.history.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted-foreground">{t("console.usage_tab.no_history")}</p>
        ) : (
          <ol>
            {usage.history.map((h, i) => (
              <li key={`${h.at}:${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--c-hairline)] px-4 py-2 text-[12.5px] last:border-b-0">
                <span className="min-w-0 truncate">
                  {h.kind === "subscription" ? t("console.usage_tab.history_plan", { plan: h.planId ?? "" }) : h.key ? t("console.usage_tab.history_key", { key: t(`console.entitlement.${h.key}`) }) : <bdi dir="ltr" className="font-mono text-[11.5px]">{h.action}</bdi>}
                  {h.by && <span className="text-muted-foreground"> · {h.by}</span>}
                </span>
                <Ago iso={h.at} className="text-[11.5px] text-muted-foreground" />
              </li>
            ))}
          </ol>
        )}
      </section>

      {planOpen > 0 && <PlanDialog key={planOpen} storeId={storeId} current={usage.plan.id} plans={plans} onClose={() => setPlanOpen(0)} />}
      {grant && <GrantDialog key={grant.n} storeId={storeId} line={grant.line} source={grant.source} onClose={() => setGrant(null)} />}
    </div>
  );
}

function EntRow({ line, canOverride, busy, onAdd, onRemove }: { line: EntitlementLine; canOverride: boolean; busy: boolean; onAdd(s: "override" | "boost"): void; onRemove(s: "override" | "boost"): void }) {
  const t = useT();
  const g = line.override ?? line.boost;
  const source = line.override ? "override" : line.boost ? "boost" : null;
  const locked = line.key === "take_orders";
  return (
    <tr className="border-b border-[var(--c-hairline)] last:border-b-0">
      <td className="py-2 ps-4 pe-3">
        <span className="block font-medium">{t(`console.entitlement.${line.key}`)}</span>
        {locked && <span className="block text-[11.5px] text-muted-foreground">{t("console.plans.take_orders_locked")}</span>}
      </td>
      <td className="num px-3 text-muted-foreground">
        {valueText(t, line, line.plan)}
        {!line.planSets && <span className="ms-1 text-[11px]">{t("console.usage_tab.default")}</span>}
      </td>
      <td className="px-3">
        {g && source ? (
          <span className="grid gap-0.5">
            <span className="num">
              {t(`console.usage_tab.source.${source}`)}: {valueText(t, line, g.value)}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {g.expiresAt ? <Until iso={g.expiresAt} template="console.usage_tab.expires" /> : t("console.usage_tab.no_expiry")}
              {g.setBy.name && ` · ${g.setBy.name}`}
            </span>
            <span className="truncate text-[11.5px] text-muted-foreground" title={g.reason}>
              {g.reason}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t("console.usage_tab.none")}</span>
        )}
      </td>
      <td className="px-3 text-[12px]">
        {line.stateCap !== undefined && <span className="block">{t("console.usage_tab.cap", { value: valueText(t, line, line.stateCap) })}</span>}
        {line.killedBy.length > 0 && <span className="block text-[var(--c-danger-ink)]">{t("console.usage_tab.killed", { list: line.killedBy.join(", ") })}</span>}
        {line.stateCap === undefined && line.killedBy.length === 0 && <span className="text-muted-foreground">{t("console.usage_tab.none")}</span>}
      </td>
      <td className="num px-3 font-medium">{valueText(t, line, line.effective)}</td>
      <td className="py-2 pe-4 ps-3 text-end">
        {canOverride && (
          <span className="inline-flex flex-wrap justify-end gap-1">
            {source ? (
              <button type="button" disabled={busy} onClick={() => onRemove(source)} className={cn(button.base, button.ghost, "h-7 px-2 text-[12px]")}>
                {t("console.usage_tab.remove")}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => onAdd("override")} className={cn(button.base, button.ghost, "h-7 px-2 text-[12px]")}>
                  {t("console.usage_tab.add_override")}
                </button>
                <button type="button" onClick={() => onAdd("boost")} className={cn(button.base, button.ghost, "h-7 px-2 text-[12px]")}>
                  {t("console.usage_tab.add_boost")}
                </button>
              </>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

function PlanDialog({ storeId, current, plans, onClose }: { storeId: string; current: string; plans: PlanOption[]; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const name = useId();
  const [opId] = useState(newOpId);
  const [planId, setPlanId] = useState(current);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const options = plans.filter((p) => p.status === "active" || p.status === "hidden" || p.id === current);
  const submit = async () => {
    if (planId === current) return onClose();
    setBusy(true);
    const r = await assignPlanAction({ storeId, planId, note: note.trim() || undefined, opId }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      toast.success(t("console.usage_tab.plan_changed", { plan: plans.find((p) => p.id === planId)?.name ?? planId }));
      onClose();
      router.refresh();
    } else setProblem(r?.message ? t(r.message) : t("console.usage_tab.failed"));
  };
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("console.usage_tab.change_plan")}
      description={t("console.usage_tab.change_plan_lead")}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" disabled={busy || planId === current} onClick={submit} className={cn(button.base, button.primary)}>
            {t("console.usage_tab.assign")}
          </button>
        </>
      }
    >
      <fieldset className="grid gap-1">
        <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.usage_tab.plan")}</legend>
        {options.map((p) => (
          <label key={p.id} className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] max-md:min-h-11", planId === p.id && "bg-[color-mix(in_oklch,var(--brand)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_45%,transparent)]")}>
            <input type="radio" name={name} checked={planId === p.id} onChange={() => setPlanId(p.id)} className="size-3.5 accent-[var(--brand)]" />
            <span className="flex-1">{p.name}</span>
            <bdi dir="ltr" className="font-mono text-[11.5px] text-muted-foreground">
              {p.id}
            </bdi>
            {p.id === current && <span className="text-[11.5px] text-muted-foreground">{t("console.usage_tab.current")}</span>}
            {p.status === "hidden" && <span className="text-[11.5px] text-muted-foreground">{t("console.usage_tab.hidden")}</span>}
          </label>
        ))}
      </fieldset>
      <NoteField label={t("console.usage_tab.note")} value={note} onChange={setNote} max={500} rows={2} />
      <p className="text-[12px] text-muted-foreground">{t("console.usage_tab.plan_told")}</p>
      {problem && (
        <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
          {problem}
        </p>
      )}
    </ConsoleDialog>
  );
}

function GrantDialog({ storeId, line, source, onClose }: { storeId: string; line: EntitlementLine; source: "override" | "boost"; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const ids = useId();
  const [opId] = useState(newOpId);
  const bytes = line.unit === "bytes";
  const [num, setNum] = useState(() => (typeof line.effective === "number" ? String(bytes ? Math.round(line.effective / MIB) : line.effective) : ""));
  const [unlimited, setUnlimited] = useState(line.effective === null);
  const [on, setOn] = useState(line.effective === true);
  const [days, setDays] = useState<number | null>(source === "boost" ? 30 : null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const locked = line.key === "take_orders" && !on;
  const numberOk = unlimited || (/^\d+$/.test(num.trim()) && Number(num) >= 0);
  const value: number | boolean | null = line.kind === "feature" ? on : unlimited ? null : bytes ? Number(num) * MIB : Number(num);
  const expiryOk = source === "override" || (days !== null && days >= 1 && days <= 90);

  const submit = async () => {
    setTried(true);
    if (!reason.trim() || reason.length > 200 || !expiryOk || locked || (line.kind === "limit" && !numberOk)) return;
    setBusy(true);
    setProblem(null);
    const expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    const r = await setEntitlementAction({ storeId, key: line.key, source, value, expiresAt, reason: reason.trim(), opId }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      toast.success(t("console.usage_tab.saved", { key: t(`console.entitlement.${line.key}`) }));
      onClose();
      router.refresh();
    } else setProblem(r?.message ? t(r.message) : t("console.usage_tab.failed"));
  };

  const field = "h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] disabled:opacity-50 max-md:h-11";
  return (
    <ConsoleDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(source === "boost" ? "console.usage_tab.boost_title" : "console.usage_tab.override_title", { key: t(`console.entitlement.${line.key}`) })}
      description={t("console.usage_tab.grant_lead", { value: valueText(t, line, line.effective) })}
      footer={
        <>
          <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
          <button type="button" disabled={busy} onClick={submit} className={cn(button.base, button.primary)}>
            {t("console.usage_tab.save")}
          </button>
        </>
      }
    >
      {line.kind === "feature" ? (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.usage_tab.value")}</legend>
          <div className="inline-flex w-fit rounded-[var(--r-control)] bg-secondary p-0.5">
            {[true, false].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={on === v} onClick={() => setOn(v)} className={cn("h-8 rounded-[calc(var(--r-control)-2px)] px-4 text-[12.5px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]", on === v && "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]")}>
                {v ? t("console.strip.on") : t("console.strip.off")}
              </button>
            ))}
          </div>
          {locked && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.plans.take_orders_locked")}</p>}
        </fieldset>
      ) : (
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-v`} className="text-[12.5px] font-medium">
            {t(bytes ? "console.usage_tab.value_mib" : "console.usage_tab.value")}
          </label>
          <div className="flex items-center gap-3">
            <input id={`${ids}-v`} inputMode="numeric" disabled={unlimited} value={num} onChange={(e) => setNum(e.target.value)} className={cn(field, "num max-w-[180px]")} aria-invalid={(tried && !numberOk) || undefined} />
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="size-3.5 accent-[var(--brand)]" />
              {t("console.usage_tab.unlimited")}
            </label>
          </div>
          {tried && !numberOk && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.entitlement.value_type")}</p>}
        </div>
      )}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-[12.5px] font-medium">
          {t("console.usage_tab.expiry")}
          {source === "override" && <span className="ms-1.5 font-normal text-muted-foreground">{t("console.form.optional")}</span>}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {source === "override" && (
            <button type="button" aria-pressed={days === null} onClick={() => setDays(null)} className={cn(button.base, days === null ? button.primary : button.secondary, "h-8 px-3 text-[12.5px]")}>
              {t("console.usage_tab.no_expiry")}
            </button>
          )}
          {PRESETS.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={cn(button.base, days === d ? button.primary : button.secondary, "num h-8 px-3 text-[12.5px]")}>
              {t("console.profile.kpi.days", { count: d })}
            </button>
          ))}
        </div>
        {source === "boost" && <p className="text-[12px] text-muted-foreground">{t("console.usage_tab.boost_hint")}</p>}
      </fieldset>
      <NoteField label={t("console.usage_tab.reason")} value={reason} onChange={setReason} max={200} required rows={2} problem={tried && !reason.trim() ? t("console.entitlement.reason_length") : null} />
      {problem && (
        <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
          {problem}
        </p>
      )}
    </ConsoleDialog>
  );
}
