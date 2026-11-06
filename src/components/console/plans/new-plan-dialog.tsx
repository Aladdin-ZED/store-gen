"use client";
/**
 * "New plan" (platform.md PLA-§9.1; `plans.manage`): an id (`^[a-z][a-z0-9_]{1,31}$`, checked as typed), a name, the
 * status (active or hidden) and "copy limits from" an existing plan; the new plan opens in the editor.
 * "Status" (PLA-§9.1): active / hidden / retired for one plan; beta stays active (the default of new stores).
 *
 *   <NewPlanButton plans={[{ id: "beta", name: "Beta" }]} />
 *   <PlanStatusMenu planId="starter" status="active" locked={false} />
 */
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { toast } from "sonner";
import { createPlanAction, setPlanStatusAction } from "@/app/admin/(console)/plans/actions";
import { useT } from "@/lib/i18n/admin/client";
import { PLAN_ID_RE, PLAN_NAME_MAX, PLAN_STATUSES, type PlanStatus } from "@/lib/platform/plan-rules";
import { cn } from "@/lib/utils";
import { useGuarded } from "../guarded";
import { button, ConsoleDialog } from "../queue/decision-dialogs";

const field =
  "h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11";

export function NewPlanButton({ plans }: { plans: { id: string; name: string }[] }) {
  const t = useT();
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setN((x) => x + 1)} className={cn(button.base, button.primary)}>
        <PlusIcon aria-hidden="true" className="size-3.5" />
        {t("console.plans.new")}
      </button>
      {n > 0 && <NewPlanDialog key={n} plans={plans} onClose={() => setN(0)} />}
    </>
  );
}

function NewPlanDialog({ plans, onClose }: { plans: { id: string; name: string }[]; onClose(): void }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.plans.create_failed");
  const ids = { id: useId(), name: useId(), copy: useId(), status: useId() };
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState(plans[0]?.id ?? "");
  const [status, setStatus] = useState<"active" | "hidden">("hidden");
  const [tried, setTried] = useState(false);
  const idOk = PLAN_ID_RE.test(id);
  const taken = plans.some((p) => p.id === id);
  const nameOk = name.trim().length >= 1 && name.trim().length <= PLAN_NAME_MAX;

  const submit = async () => {
    setTried(true);
    if (!idOk || taken || !nameOk) return;
    await g.run(
      (opId) => createPlanAction({ id, name: name.trim(), copyFrom: copyFrom || null, status, opId }),
      (d) => {
        toast.success(t("console.plans.created", { name: name.trim() }));
        onClose();
        router.push(`/admin/plans/${d.id}`);
      },
    );
  };

  const idProblem = id && !idOk ? t("console.plans.id_invalid") : taken ? t("console.plans.id_taken") : tried && !id ? t("console.plans.id_invalid") : null;
  return (
    <>
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("console.plans.new_title")}
        description={t("console.plans.new_lead")}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button type="button" disabled={g.busy} onClick={() => void submit()} className={cn(button.base, button.primary)}>
              {t("console.plans.create")}
            </button>
          </>
        }
      >
        <div className="grid gap-1.5">
          <label htmlFor={ids.id} className="text-[12.5px] font-medium">
            {t("console.plans.field.id")}
          </label>
          <input id={ids.id} dir="ltr" autoComplete="off" spellCheck={false} value={id} aria-invalid={!!idProblem || undefined} onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s/g, "_"))} className={cn(field, "font-mono")} autoFocus />
          <p className={cn("text-[12px]", idProblem ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>{idProblem ?? t("console.plans.id_hint")}</p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={ids.name} className="text-[12.5px] font-medium">
            {t("console.plans.field.name")}
          </label>
          <input id={ids.name} dir="auto" value={name} maxLength={PLAN_NAME_MAX} aria-invalid={(tried && !nameOk) || undefined} onChange={(e) => setName(e.target.value)} className={field} />
          {tried && !nameOk && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.plans.name_invalid")}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={ids.copy} className="text-[12.5px] font-medium">
              {t("console.plans.field.copy_from")}
            </label>
            <select id={ids.copy} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={field}>
              <option value="">{t("console.plans.copy_none")}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.status} className="text-[12.5px] font-medium">
              {t("console.plans.field.status")}
            </label>
            <select id={ids.status} value={status} onChange={(e) => setStatus(e.target.value === "active" ? "active" : "hidden")} className={field}>
              <option value="hidden">{t("console.plans.status.hidden")}</option>
              <option value="active">{t("console.plans.status.active")}</option>
            </select>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground">{t(`console.plans.status.${status}.hint`)}</p>
        {g.problem && (
          <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
            {g.problem}
          </p>
        )}
      </ConsoleDialog>
      {g.sheet}
    </>
  );
}

export function PlanStatusMenu({ planId, status, locked }: { planId: string; status: PlanStatus; locked: boolean }) {
  const t = useT();
  const router = useRouter();
  const g = useGuarded("console.plans.status_failed");
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[11.5px] text-muted-foreground">
        {t("console.plans.field.status")}
      </label>
      <select
        id={id}
        value={status}
        disabled={locked || g.busy}
        title={locked ? t("console.plans.default_plan_locked") : undefined}
        onChange={(e) => {
          const next = e.target.value as PlanStatus;
          g.reset();
          void g.run(
            (opId) => setPlanStatusAction({ planId, status: next, opId }),
            () => {
              toast.success(t("console.plans.status_saved", { status: t(`console.plans.status.${next}`) }));
              router.refresh();
            },
          );
        }}
        className={cn(field, "w-[160px] disabled:opacity-60")}
      >
        {PLAN_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`console.plans.status.${s}`)}
          </option>
        ))}
      </select>
      {g.problem && <p className="text-[12px] text-[var(--c-danger-ink)]">{g.problem}</p>}
      {g.sheet}
    </div>
  );
}
