/**
 * The plan editor's value words (platform.md PLA-§9.2, PD58; pure, English per PD9): what a plan value reads as in a
 * row and in the diff sheet ("500 MiB", "Unlimited", "On", "Default (1 GiB)"), and the diff lines of a draft (old →
 * new per changed key, registry order). `test:platform` pins the words.
 *
 *   diffLines(rows, { media_bytes: 500 * MiB, sheets: false })
 *   // [{ key: "media_bytes", label: "Media storage", from: "Default (1 GiB)", to: "500 MiB" }, { key: "sheets", … "On" → "Off" }]
 */
import { t } from "@/lib/i18n/admin";
import { formatAmount, type Effective, type PlanEditorRow, type PlanValue } from "@/lib/platform/plan-rules";
import type { LimitKey } from "@/lib/tenancy/entitlement-keys";

type Row = Pick<PlanEditorRow, "key" | "kind" | "label" | "registryDefault" | "planValue">;

/** One effective value: "On" / "Off", "Unlimited", "500 MiB", "1,500". */
export function effectiveText(row: Pick<Row, "key" | "kind">, value: Effective): string {
  if (row.kind === "feature") return t(value ? "console.plans.value.on" : "console.plans.value.off");
  if (value === null) return t("console.plans.value.unlimited");
  return formatAmount(row.key as LimitKey, value as number);
}

/** One plan value: an effective value, or "Default (…)" when the plan leaves the key to the registry. */
export function planValueText(row: Pick<Row, "key" | "kind" | "registryDefault">, value: PlanValue): string {
  if (value === "default") return t("console.plans.value.default", { value: effectiveText(row, row.registryDefault) });
  return effectiveText(row, value);
}

export interface DiffLine {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** The draft's changed keys as "old → new" lines, in the rows' order; a value equal to the saved one is no change. */
export function diffLines(rows: readonly Row[], draft: Readonly<Record<string, PlanValue>>): DiffLine[] {
  return rows.filter((r) => r.key in draft && draft[r.key] !== r.planValue).map((r) => ({ key: r.key, label: t(r.label), from: planValueText(r, r.planValue), to: planValueText(r, draft[r.key]!) }));
}
