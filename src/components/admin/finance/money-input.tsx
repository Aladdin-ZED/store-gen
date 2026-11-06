"use client";
/**
 * The Profit screen's amount field (P4 CALL CENTER; OPE-§16.2, OD35): the owner types a decimal ("38", "38.5",
 * "38,50"); it becomes integer cents once, here, through `toCents`. The field commits on blur or Enter and only when
 * the value changed; an empty field commits `null` when `nullable` (otherwise it is left as it was). A malformed value stays red and is never sent.
 */
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { toCents } from "@/lib/finance/lite/cents";
import { cn } from "@/lib/utils";

const AMOUNT = /^\d{1,9}(?:[.,]\d{1,2})?$/;

/** "38.5" → 3850; "" → null; anything else → undefined (invalid). */
export function parseAmount(text: string): number | null | undefined {
  const s = text.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (!AMOUNT.test(s)) return undefined;
  return toCents(s.replace(",", "."));
}

/** cents → "38.50" ("38" when whole), plain digits for an input */
export const centsText = (c: number | null): string => (c === null ? "" : c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

export function MoneyInput({
  id,
  cents,
  onCommit,
  disabled,
  nullable = true,
  placeholder,
  label,
  suffix,
  className,
  max,
}: {
  id?: string;
  cents: number | null;
  onCommit: (cents: number | null) => Promise<boolean> | boolean;
  disabled?: boolean;
  nullable?: boolean;
  placeholder?: string;
  label: string;
  suffix?: string;
  className?: string;
  max?: number;
}) {
  const [text, setText] = useState(centsText(cents));
  const [busy, setBusy] = useState(false);
  // a new value from the server (after a save elsewhere re-renders) replaces the field's text
  const [prev, setPrev] = useState(cents);
  if (prev !== cents) {
    setPrev(cents);
    setText(centsText(cents));
  }
  const parsed = parseAmount(text);
  const bad = parsed === undefined || (typeof parsed === "number" && max !== undefined && parsed > max);

  async function commit() {
    if (bad || parsed === undefined || parsed === cents || (parsed === null && !nullable)) return;
    setBusy(true);
    const ok = await onCommit(parsed);
    setBusy(false);
    if (!ok) setText(centsText(cents));
  }

  return (
    <span dir="ltr" className={cn("relative inline-flex items-center", className)}>
      <Input
        id={id}
        value={text}
        inputMode="decimal"
        disabled={disabled || busy}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={bad || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") setText(centsText(cents));
        }}
        className={cn("q-num h-9 w-full text-end", suffix && "pe-12")}
        dir="ltr"
      />
      {suffix && !busy && <span className="q-2xs pointer-events-none absolute end-2.5 text-muted-foreground">{suffix}</span>}
      {busy && <Loader2Icon className="absolute end-2.5 size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
    </span>
  );
}
