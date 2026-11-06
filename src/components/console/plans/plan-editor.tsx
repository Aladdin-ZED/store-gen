"use client";
/**
 * The plan editor (platform.md PLA-§9.2, PL-11, PD8, PD58): rows grouped Limits / Features / Later releases. Each row
 * explains itself three ways: label + one-line description, the registry default, and the plan's value (number with
 * its unit and an Unlimited toggle, a switch for features, "Use default"), followed by the effective sentence and the
 * pending line where a lifecycle cap wins. `take_orders` is locked On (PD8); Later releases rows are read-only with
 * their release chip. Saving opens the diff sheet (old → new, then the impact preview) and only its Confirm writes.
 *
 *   <PlanEditor editor={await getPlanEditor(ctx, id)} canManage={ctx.can("plans.manage")} />
 */
import { LockIcon, RotateCcwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { effectiveOf, effectiveSentence, pendingSentence, type PlanEditorRow, type PlanGroup, type PlanValue } from "@/lib/platform/plan-rules";
import type { PlanEditor as Editor } from "@/lib/platform/plans";
import { cn } from "@/lib/utils";
import { button } from "../queue/decision-dialogs";
import { effectiveText, planValueText } from "./diff-text";
import { PlanDiffSheet } from "./plan-diff-sheet";

const MIB = 1024 * 1024;
const GROUPS: readonly PlanGroup[] = ["limits", "features", "later"];

export function PlanEditor({ editor, canManage }: { editor: Editor; canManage: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState<Record<string, PlanValue>>({});
  const [reviewing, setReviewing] = useState(0);
  const changed = useMemo(() => Object.entries(draft).filter(([k, v]) => editor.rows.find((r) => r.key === k)?.planValue !== v).length, [draft, editor.rows]);
  const set = (key: string, value: PlanValue) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {GROUPS.map((g) => {
        const rows = editor.rows.filter((r) => r.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} aria-labelledby={`group-${g}`} className="overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
            <header className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--c-hairline)] px-4">
              <h2 id={`group-${g}`} className="text-[13px] font-semibold">
                {t(`console.plans.group.${g}`)}
              </h2>
              {g === "later" && <span className="text-[11.5px] text-muted-foreground">{t("console.plans.later_note")}</span>}
            </header>
            <ul className="divide-y divide-[var(--c-hairline)]">
              {rows.map((r) => (
                <Row key={r.key} row={r} value={r.key in draft ? draft[r.key]! : r.planValue} edited={r.key in draft && draft[r.key] !== r.planValue} caps={editor.caps} disabled={!canManage} onChange={(v) => set(r.key, v)} />
              ))}
            </ul>
          </section>
        );
      })}

      {canManage && changed > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-card)] bg-popover px-4 py-3 shadow-[0_12px_40px_-12px_oklch(0.2_0.01_230/0.35),inset_0_0_0_1px_var(--c-hairline)]">
          <span className="text-[13px] font-medium">{t("console.plans.changes", { count: changed })}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setDraft({})} className={cn(button.base, button.ghost)}>
              {t("console.plans.discard")}
            </button>
            <button type="button" onClick={() => setReviewing((n) => n + 1)} className={cn(button.base, button.primary)}>
              {t("console.plans.review")}
            </button>
          </span>
        </div>
      )}
      {reviewing > 0 && <PlanDiffSheet key={reviewing} plan={editor.plan} rows={editor.rows} draft={draft} onClose={() => setReviewing(0)} onSaved={() => setDraft({})} />}
    </div>
  );
}

function Row({ row, value, edited, caps, disabled, onChange }: { row: PlanEditorRow; value: PlanValue; edited: boolean; caps: Editor["caps"]; disabled: boolean; onChange(v: PlanValue): void }) {
  const t = useT();
  const later = row.locked === "release";
  const locked = row.locked !== null;
  const sentence = later ? row.sentence : effectiveSentence(row.key, value);
  const pending = later ? null : pendingSentence(row.key, value, caps);
  const eff = effectiveOf(row.key, value);
  const inputId = `plan-${row.key}`;

  return (
    <li className={cn("grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] md:gap-6", edited && "bg-[color-mix(in_oklch,var(--brand)_5%,var(--card))]", later && "opacity-70")}>
      <div className="grid min-w-0 content-start gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="text-[13px] font-semibold">
            {t(row.label)}
          </label>
          {row.release && later && <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 font-mono text-[10.5px] text-muted-foreground">{row.release}</span>}
          {edited && <span className="inline-flex h-5 items-center rounded-full bg-[var(--brand-soft)] px-2 text-[11px] font-medium text-[var(--c-brand-ink)]">{t("console.plans.edited")}</span>}
        </div>
        <p className="text-[12px] text-muted-foreground">{t(row.description)}</p>
        <p className="text-[12.5px]">{sentence}</p>
        {pending && <p className="text-[11.5px] text-muted-foreground">{pending}</p>}
      </div>

      <div className="grid content-start gap-1.5">
        {row.locked === "take_orders" ? (
          <div className="flex items-center gap-2 text-[12.5px]">
            <Switch id={inputId} on disabled onToggle={() => undefined} label={t(row.label)} />
            <LockIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{t("console.plans.locked_on")}</span>
          </div>
        ) : row.kind === "feature" ? (
          <div className="flex items-center gap-2">
            <Switch id={inputId} on={eff === true} disabled={disabled || locked} onToggle={() => onChange(!(eff === true))} label={t(row.label)} />
            <span className="text-[12.5px]">{effectiveText(row, eff)}</span>
          </div>
        ) : (
          <LimitControl id={inputId} row={row} value={value} disabled={disabled || locked} onChange={onChange} />
        )}
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
          <span>{t("console.plans.registry_default", { value: effectiveText(row, row.registryDefault) })}</span>
          {value === "default" ? (
            <span className="font-medium text-foreground">{t("console.plans.using_default")}</span>
          ) : (
            !disabled &&
            !locked && (
              <button type="button" onClick={() => onChange("default")} className="inline-flex items-center gap-1 rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
                <RotateCcwIcon aria-hidden="true" className="size-3" />
                {t("console.plans.use_default")}
              </button>
            )
          )}
        </div>
        {edited && <span className="sr-only">{t("console.plans.was", { value: planValueText(row, row.planValue) })}</span>}
      </div>
    </li>
  );
}

function Switch({ id, on, disabled, onToggle, label }: { id: string; on: boolean; disabled?: boolean; onToggle(): void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        on ? "bg-[var(--brand)]" : "bg-[color-mix(in_oklch,var(--foreground)_18%,transparent)]",
      )}
    >
      <span aria-hidden="true" className={cn("size-4 rounded-full bg-white shadow-sm transition-transform duration-[var(--dur-1)]", on ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
    </button>
  );
}

/** A limit: the number (MiB for media), the Unlimited toggle; "default" shows the registry value until edited. */
function LimitControl({ id, row, value, disabled, onChange }: { id: string; row: PlanEditorRow; value: PlanValue; disabled: boolean; onChange(v: PlanValue): void }) {
  const t = useT();
  const bytes = row.unit === "bytes";
  const eff = effectiveOf(row.key, value) as number | null;
  const shown = eff === null ? "" : String(bytes ? Math.round(eff / MIB) : eff);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    setText(shown);
  }
  const invalid = eff !== null && text !== "" && !/^\d{1,12}$/.test(text);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-[148px]">
        <input
          id={id}
          dir="ltr"
          inputMode="numeric"
          disabled={disabled || eff === null}
          value={eff === null ? "" : text}
          placeholder={eff === null ? t("console.plans.value.unlimited") : undefined}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (/^\d{1,12}$/.test(v)) onChange(bytes ? Number(v) * MIB : Number(v));
          }}
          className="num h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background ps-3 pe-12 text-start text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] disabled:opacity-60 aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
        />
        <span aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[11.5px] text-muted-foreground">
          {bytes ? "MiB" : t("console.plans.unit.count")}
        </span>
      </div>
      <label className={cn("inline-flex items-center gap-1.5 text-[12.5px] max-md:min-h-11", disabled && "opacity-60")}>
        <input type="checkbox" checked={eff === null} disabled={disabled} onChange={(e) => onChange(e.target.checked ? null : typeof row.planValue === "number" ? row.planValue : typeof row.registryDefault === "number" ? row.registryDefault : 0)} className="size-4 accent-[var(--brand)]" />
        {t("console.plans.value.unlimited")}
      </label>
      {invalid && <span className="basis-full text-[12px] text-[var(--c-danger-ink)]">{t("console.plans.value_type")}</span>}
    </div>
  );
}
