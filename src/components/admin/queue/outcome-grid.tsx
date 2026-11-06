"use client";
/**
 * The outcome grid (P4 CALL CENTER; operations.md OPE-§13.1 thumb geometry, §13.2c, §13.3, §13.6, OD48). Six cells in
 * a `role="group"`, each with `aria-keyshortcuts` 1-6. Phones and tablets: 2 × 3 in the thumb zone, the two most
 * frequent taps (Confirmed, No answer; in the delivery lane Customer informed, Reschedule) in the bottom row; desktop:
 * 3 × 2 in key order with the key caps shown. The delivery lane remaps the same keys (OPE-§6.1a), with the same
 * geometry and colours. The focus order follows the keys; the grid mirrors under `dir="rtl"`.
 */
import { forwardRef } from "react";
import type { MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import type { OutcomeKey } from "./keys";

export type CellTone = "ok" | "info" | "danger" | "neutral";

export interface GridCell {
  key: OutcomeKey;
  label: MessageKey;
  tone: CellTone;
  /** an extra line under the label (the pending hold date of Confirmed) */
  sub?: string;
}

/** OPE-§13.3 key order of each lane */
export const CONFIRM_CELLS: readonly GridCell[] = [
  { key: "o1", label: "ops.outcome.confirmed", tone: "ok" },
  { key: "o2", label: "ops.outcome.no_answer", tone: "neutral" },
  { key: "o3", label: "ops.outcome.busy", tone: "neutral" },
  { key: "o4", label: "ops.outcome.callback", tone: "info" },
  { key: "o5", label: "ops.outcome.cancelled", tone: "danger" },
  { key: "o6", label: "ops.outcome.more", tone: "neutral" },
];
export const DELIVERY_CELLS: readonly GridCell[] = [
  { key: "o1", label: "ops.rescue.customer_informed", tone: "ok" },
  { key: "o2", label: "ops.rescue.reschedule", tone: "info" },
  { key: "o3", label: "ops.outcome.no_answer", tone: "neutral" },
  { key: "o4", label: "ops.rescue.busy", tone: "neutral" },
  { key: "o5", label: "ops.rescue.cancel_recall", tone: "danger" },
  { key: "o6", label: "ops.skip", tone: "neutral" },
];

/** phone placement: [row, column] of each key (keys 1-2 nearest the thumb) */
const PHONE_PLACE: Record<OutcomeKey, string> = {
  o1: "row-start-3 col-start-1",
  o2: "row-start-3 col-start-2",
  o3: "row-start-2 col-start-1",
  o4: "row-start-2 col-start-2",
  o5: "row-start-1 col-start-1",
  o6: "row-start-1 col-start-2",
};

export const OutcomeGrid = forwardRef<HTMLDivElement, {
  cells: readonly GridCell[];
  disabled: boolean;
  pending: OutcomeKey | null;
  onPress: (key: OutcomeKey) => void;
  label: string;
}>(function OutcomeGrid({ cells, disabled, pending, onPress, label }, ref) {
  const t = useT();
  return (
    <div ref={ref} role="group" aria-label={label} tabIndex={-1} className="grid grid-cols-2 grid-rows-3 gap-2 outline-none lg:grid-cols-3 lg:grid-rows-2">
      {cells.map((c, i) => (
        <button
          key={c.key}
          type="button"
          data-tone={c.tone === "neutral" ? undefined : c.tone}
          data-pending={pending === c.key ? "true" : undefined}
          aria-keyshortcuts={String(i + 1)}
          disabled={disabled}
          onClick={() => onPress(c.key)}
          className={cn("q-cell q-sm lg:row-auto lg:col-auto", PHONE_PLACE[c.key], "lg:row-start-auto lg:col-start-auto")}
        >
          <span className="flex min-w-0 flex-col items-center leading-tight">
            <span className="text-balance">{t(c.label)}</span>
            {c.sub ? <span className="q-2xs mt-0.5 font-normal opacity-85">{c.sub}</span> : null}
          </span>
          <kbd aria-hidden="true" className="q-kbd hidden lg:inline-flex">
            {i + 1}
          </kbd>
        </button>
      ))}
    </div>
  );
});
