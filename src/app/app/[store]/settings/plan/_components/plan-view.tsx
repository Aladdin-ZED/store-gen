"use client";
/**
 * Settings → Plan & usage on screen (P2 SHELL; platform.md PLA-§22.10.4, §22.9, §3.7; PL-11): the plan card (name and
 * the beta line, never a price), the usage meters (`UsageMeter`: the store's own limits only), the features with the
 * reason each one is off, the active boosts, the requests and the subscription history.
 *
 * Requests (owner, `billing.manage`): "Request a plan change" (the active plans other than this one) and "Ask for
 * more" (one metric, an optional amount and message) → `createStoreRequestAction`; an open request of the same kind
 * replaces its button with "Request sent on <date>"; Withdraw on an open one. The answer is "Granted" / "Declined" /
 * "Withdrawn" only: the staff's note never reaches this page (P0b review F-15).
 */
import { CheckIcon, MinusIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/admin/common/empty-state";
import { formatDay } from "@/components/admin/common/primitive-logic";
import { BusyButton, Field, FIELD_INPUT, NativeSelect, SettingsCard } from "@/components/admin/common/settings-kit";
import { UsageMeter } from "@/components/admin/common/usage-meter";
import { REQUEST_MESSAGE_MAX } from "@/components/admin/shell/action-inputs";
import { useActionError } from "@/components/admin/shell/use-action-error";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { StoreRequestRow } from "@/lib/platform/requests";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import type { PlanFacts, PlanMeter } from "../data";

type CreateInput =
  | { kind: "plan_change"; planId: string; message: string | null }
  | {
      kind: "limit_raise";
      key: string;
      used: number;
      limit: number | null;
      asked: number | null;
      message: string | null;
    };

const LIMIT_OF: Record<PlanMeter["id"], string> = {
  media: "media_bytes",
  pages: "pages_max",
  members: "members_max",
  agents: "agents_max",
  exports: "exports_month",
  ai: "ai_credits_month",
};
const OPEN: ReadonlySet<StoreRequestRow["status"]> = new Set(["pending", "needs_info", "snoozed"]);

function statusKey(r: StoreRequestRow): string {
  if (r.outcome) return `shell.plan.request.${r.outcome}`;
  if (r.status === "withdrawn") return "shell.plan.request.withdrawn";
  return "shell.plan.request.open";
}

export function PlanView({
  facts,
  requests,
  canManage,
  create,
  withdraw,
}: {
  facts: PlanFacts;
  requests: StoreRequestRow[];
  canManage: boolean;
  create(input: CreateInput): Promise<ActionResult<{ id: string }>>;
  withdraw(input: { requestId: string }): Promise<ActionResult<null>>;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const actions = useActionError();
  const [dialog, setDialog] = useState<"plan_change" | "limit_raise" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const openOf = (kind: string) => requests.find((r) => r.kind === kind && OPEN.has(r.status));
  const otherPlans = facts.plans.filter((p) => p.id !== facts.plan?.id);
  // a boost names a limit (its meter's label) or a feature (its label); anything else keeps its key
  const boostName = (key: string): string => {
    const meter = (Object.keys(LIMIT_OF) as PlanMeter["id"][]).find((id) => LIMIT_OF[id] === key);
    if (meter) return t(`shell.plan.meter.${meter}`);
    return facts.features.some((f) => f.key === key) ? t(`shell.plan.feature.${key}`) : key;
  };

  const doWithdraw = async (id: string) => {
    setBusy(id);
    try {
      const res = await actions.run(() => withdraw({ requestId: id }));
      if (res.ok) {
        toast.success(t("shell.plan.withdrawn"));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const requestButton = (kind: "plan_change" | "limit_raise", label: string, disabled = false) => {
    const open = openOf(kind);
    if (open)
      return (
        <span className="text-[13px] text-muted-foreground">
          {t("shell.plan.request_sent", {
            date: formatDay(open.createdAt, locale),
          })}
        </span>
      );
    return (
      <Button variant="outline" disabled={disabled} onClick={() => setDialog(kind)} className="max-md:h-11">
        <SendIcon aria-hidden="true" className="rtl:-scale-x-100" />
        {label}
      </Button>
    );
  };

  return (
    <>
      <SettingsCard title={t("shell.plan.title")} description={t("shell.plan.lead")}>
        <div className="flex items-center gap-3 rounded-[var(--r-control)] bg-muted/50 px-4 py-3.5">
          <span className="grid size-9 place-items-center rounded-[var(--r-control)] bg-brand-soft text-brand">
            <SparklesIcon aria-hidden="true" className="size-4" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="truncate text-sm font-semibold">{facts.plan?.name ?? t("shell.plan.beta_name")}</p>
            <p className="text-[13px] text-muted-foreground">{t("shell.plan.beta")}</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t("shell.plan.usage")} description={t("shell.plan.usage_lead")}>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {facts.meters.map((m) => (
            <UsageMeter key={m.id} label={t(`shell.plan.meter.${m.id}`)} used={m.used} limit={m.limit} unit={m.unit} />
          ))}
        </div>
        {facts.versionsKept !== null && <p className="text-xs text-muted-foreground">{t("shell.plan.versions_kept", { count: facts.versionsKept })}</p>}
      </SettingsCard>

      <SettingsCard title={t("shell.plan.features")}>
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {facts.features.map((f) => (
            <li
              key={f.key}
              className="flex min-h-11 items-start gap-2.5 border-b border-[color-mix(in_oklch,var(--foreground)_9%,transparent)] py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full", f.on ? "bg-success-soft text-success-ink" : "bg-muted text-muted-foreground")}>
                {f.on ? <CheckIcon aria-hidden="true" className="size-3" /> : <MinusIcon aria-hidden="true" className="size-3" />}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className={cn("text-sm", !f.on && "text-muted-foreground")}>{t(`shell.plan.feature.${f.key}`)}</span>
                <span className="sr-only">{t(f.on ? "shell.plan.included" : "shell.plan.not_included")}</span>
                {f.reason && <span className="text-xs text-muted-foreground">{t(`shell.plan.reason.${f.reason}`)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </SettingsCard>

      {facts.boosts.length > 0 && (
        <SettingsCard title={t("shell.plan.boosts")}>
          <ul className="grid gap-2">
            {facts.boosts.map((b) => (
              <li key={b.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{typeof b.value === "number" ? t("shell.plan.boost_value", { name: boostName(b.key), value: b.value }) : boostName(b.key)}</span>
                {b.expiresAt && (
                  <span className="text-[13px] text-muted-foreground">
                    {t("shell.plan.boost_until", {
                      date: formatDay(b.expiresAt, locale),
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}

      <SettingsCard
        title={t("shell.plan.requests")}
        description={canManage ? t("shell.plan.requests_lead") : t("shell.plan.read_only")}
        actions={
          canManage ? (
            <>
              {requestButton("plan_change", t("shell.plan.request_plan"), otherPlans.length === 0)}
              {requestButton("limit_raise", t("shell.plan.ask_more"))}
            </>
          ) : undefined
        }
      >
        {requests.length === 0 ? (
          <EmptyState compact title={t("shell.plan.no_requests")} />
        ) : (
          <ul className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">
            {requests.map((r) => (
              <li key={r.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1 text-sm">{t(`shell.plan.kind.${r.kind}`)}</span>
                <span className="text-[13px] text-muted-foreground tabular-nums">{formatDay(r.createdAt, locale)}</span>
                <span
                  className={cn(
                    "rounded-[var(--r-chip)] px-1.5 py-0.5 text-[11px] font-medium",
                    r.outcome === "granted"
                      ? "bg-success-soft text-success-ink"
                      : r.outcome === "declined"
                        ? "bg-destructive-soft text-destructive-ink"
                        : OPEN.has(r.status)
                          ? "bg-info-soft text-info-ink"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(statusKey(r))}
                </span>
                {canManage && OPEN.has(r.status) && (
                  <BusyButton variant="ghost" size="sm" busy={busy === r.id} onClick={() => void doWithdraw(r.id)}>
                    {t("shell.plan.withdraw")}
                  </BusyButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title={t("shell.plan.history")}>
        {facts.history.length === 0 ? (
          <EmptyState compact title={t("shell.plan.history_none")} />
        ) : (
          <ul className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">
            {facts.history.map((h) => (
              <li key={h.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0 flex-1 font-medium">{h.planName}</span>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {formatDay(h.periodStart, locale)}
                  {" · "}
                  {h.periodEnd ? formatDay(h.periodEnd, locale) : t("shell.plan.history_now")}
                </span>
                <span className="rounded-[var(--r-chip)] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{t(`shell.plan.sub.${h.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <RequestDialog
        kind={dialog}
        plans={otherPlans}
        meters={facts.meters}
        onClose={() => setDialog(null)}
        send={async (input) => {
          const res = await actions.run(() => create(input));
          if (res.ok) {
            toast.success(t("shell.plan.request_done"));
            setDialog(null);
            router.refresh();
          }
          return res.ok;
        }}
      />
    </>
  );
}

function RequestDialog({
  kind,
  plans,
  meters,
  onClose,
  send,
}: {
  kind: "plan_change" | "limit_raise" | null;
  plans: { id: string; name: string }[];
  meters: PlanMeter[];
  onClose(): void;
  send(input: CreateInput): Promise<boolean>;
}) {
  const t = useT();
  const [planId, setPlanId] = useState("");
  const [metric, setMetric] = useState<PlanMeter["id"]>("media");
  const [asked, setAsked] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosenPlan = planId || plans[0]?.id || "";
  const meter = meters.find((m) => m.id === metric) ?? meters[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind || busy) return;
    const note = message.trim() || null;
    let input: CreateInput;
    if (kind === "plan_change") {
      if (!chosenPlan) return;
      input = { kind, planId: chosenPlan, message: note };
    } else {
      if (!meter) return;
      const n = asked.trim() === "" ? null : Number(asked);
      if (n !== null && (!Number.isInteger(n) || n < 0)) return setError("shell.plan.asked_invalid");
      input = {
        kind,
        key: LIMIT_OF[meter.id],
        used: meter.used,
        limit: meter.limit,
        asked: n,
        message: note,
      };
    }
    setBusy(true);
    try {
      if (await send(input)) {
        setMessage("");
        setAsked("");
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-5 rounded-[16px] p-6 sm:max-w-md">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{t(kind === "plan_change" ? "shell.plan.request_plan" : "shell.plan.ask_more")}</DialogTitle>
          <DialogDescription>{t("shell.plan.request_lead")}</DialogDescription>
        </DialogHeader>
        <form id="plan-request" onSubmit={submit} noValidate className="grid gap-4">
          {kind === "plan_change" ? (
            <Field label={t("shell.plan.plan_field")}>
              {(p) => (
                <NativeSelect {...p} value={chosenPlan} onChange={(e) => setPlanId(e.target.value)}>
                  {plans.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          ) : (
            <>
              <Field label={t("shell.plan.metric_field")}>
                {(p) => (
                  <NativeSelect {...p} value={metric} onChange={(e) => setMetric(e.target.value as PlanMeter["id"])}>
                    {meters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {t(`shell.plan.meter.${m.id}`)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label={t("shell.plan.asked_field")} optional hint={t("shell.plan.asked_hint")} error={error}>
                {(p) => <Input {...p} className={FIELD_INPUT} inputMode="numeric" dir="ltr" value={asked} onChange={(e) => (setAsked(e.target.value.replace(/[^0-9]/g, "")), setError(null))} />}
              </Field>
            </>
          )}
          <Field label={t("shell.plan.message_field")} optional hint={t("shell.plan.message_hint", { max: REQUEST_MESSAGE_MAX })}>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                maxLength={REQUEST_MESSAGE_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-24 rounded-[var(--r-control)] text-base md:text-sm"
              />
            )}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("shell.common.cancel")}
          </Button>
          <BusyButton type="submit" form="plan-request" variant="brand" busy={busy} disabled={kind === "plan_change" && !chosenPlan}>
            {t("shell.plan.send")}
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
