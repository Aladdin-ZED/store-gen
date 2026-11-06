"use client";
/**
 * ReasonPicker (P2 SHELL; platform.md PLA-§22.12, §8, §10.1, PD1): one reason out of a typed list (lifecycle actions,
 * "View as store", rejections) as a native radio group (arrow keys move, Space selects; each row ≥ 44 px on touch),
 * then the note: optional, or required for the reasons in `noteRequiredFor` (the label and `aria-required` say so).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). Controlled: every change answers the whole value.
 */
import { useId, type ReactElement } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

export interface ReasonPickerProps<R extends string> {
  reasons: readonly R[];
  labelKey: (r: R) => MessageKey;
  value: R | null;
  note: string;
  noteRequiredFor?: readonly R[];
  onChange(v: { reason: R | null; note: string }): void;
}

export function ReasonPicker<R extends string>(p: ReasonPickerProps<R>): ReactElement | null {
  const t = useT();
  const name = useId();
  const legendId = useId();
  const noteId = useId();
  const noteRequired = p.value !== null && (p.noteRequiredFor ?? []).includes(p.value);
  return (
    <div className="grid gap-4">
      <fieldset aria-labelledby={legendId} className="grid gap-1.5">
        <legend id={legendId} className="mb-1.5 text-[13px] font-medium">
          {t("shell.reason.label")}
        </legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {p.reasons.map((r) => {
            const checked = p.value === r;
            return (
              <label
                key={r}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-3 py-2 text-sm ring-1 ring-border ring-inset transition-colors duration-[var(--dur-1)] max-md:min-h-11",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  checked ? "bg-brand-soft ring-brand/40" : "hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={r}
                  checked={checked}
                  onChange={() => p.onChange({ reason: r, note: p.note })}
                  className="size-4 shrink-0 accent-[var(--brand)] outline-none"
                />
                <span className="min-w-0">{t(p.labelKey(r))}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <label htmlFor={noteId} className="text-[13px] font-medium">
          {noteRequired ? t("shell.reason.note") : t("shell.reason.note_optional")}
        </label>
        <Textarea
          id={noteId}
          value={p.note}
          rows={3}
          required={noteRequired}
          aria-required={noteRequired}
          onChange={(e) => p.onChange({ reason: p.value, note: e.target.value })}
          className="min-h-20 resize-y"
        />
        {noteRequired && <p className="text-xs text-muted-foreground">{t("shell.reason.note_required")}</p>}
      </div>
    </div>
  );
}
