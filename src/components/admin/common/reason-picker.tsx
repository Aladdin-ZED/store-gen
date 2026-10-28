"use client";
/**
 * ReasonPicker (P2 SHELL; platform.md PLA-§22.12, §8, §10.1, PD1): one reason out of a typed list (lifecycle actions,
 * "View as store", rejections) with a note, required for the reasons in `noteRequiredFor`.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders one radio per reason labelled with its
 * message (`labelKey`) and the note's text box, required while the chosen reason needs a note.
 */
import { useId, type ReactElement } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { MessageKey } from "@/lib/tenancy/types";

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
  const noteRequired = p.value !== null && (p.noteRequiredFor ?? []).includes(p.value);
  return (
    <fieldset>
      {p.reasons.map((r) => (
        <label key={r}>
          <input type="radio" name={name} value={r} checked={p.value === r} onChange={() => p.onChange({ reason: r, note: p.note })} />
          {t(p.labelKey(r))}
        </label>
      ))}
      <textarea value={p.note} required={noteRequired} aria-required={noteRequired} onChange={(e) => p.onChange({ reason: p.value, note: e.target.value })} />
    </fieldset>
  );
}
