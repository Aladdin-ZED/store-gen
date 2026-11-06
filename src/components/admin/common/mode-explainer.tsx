"use client";
/**
 * ModeCards (P2 SHELL; platform.md PLA-§22.1.5, PD30, PD72, OPS-31; docs/STORE-SAAS.md §A.2): the store-mode choice as
 * three cards (signup step 2, /app/new, the onboarding details step, the mode-switch sheet of Settings → General), each
 * what `modeSummary(mode)` answers: the title, one line and three "you get" bullets that `modeAllows()` keeps honest.
 *
 * A keyboard radio group: arrow keys move the focus along the reading direction (mirrored in RTL), Space or Enter
 * selects, Tab leaves the group; each card is ≥ 44 px tall. A mode not selectable in this release carries the "Coming
 * soon" chip and cannot be chosen; with `notify`, the group ends with the "Tell me when it's ready" checkbox (PD30).
 */
import { CheckIcon, CircleCheckIcon } from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";
import { dirOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { STORE_MODES, type StoreMode } from "@/lib/tenancy/mode";
import { cn } from "@/lib/utils";
import { modeSelectable, modeSummary } from "./mode-summary";

export interface ModeCardsProps {
  value: StoreMode | null;
  onChange(mode: StoreMode): void;
  /** PD30: the "Tell me when it's ready" opt-in shown while a mode is coming soon */
  notify?: { checked: boolean; onChange(checked: boolean): void };
  /** the modes offered (default: all three, in §A.2 order) */
  modes?: readonly StoreMode[];
  /** the field name for a surrounding form (a hidden input carries the value) */
  name?: string;
  /** narrow forms (/signup): the selected card spans the row with its bullets; the others sit as two tiles below */
  compact?: boolean;
}

export function ModeCards(p: ModeCardsProps) {
  const t = useT();
  const locale = useAdminLocale();
  const labelId = useId();
  const notifyId = useId();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const modes = p.modes ?? STORE_MODES;
  const anySoon = modes.some((m) => !modeSelectable(m));
  // roving focus: the selected card, else the first selectable one
  const focusIndex = Math.max(0, p.value ? modes.indexOf(p.value) : modes.findIndex(modeSelectable));

  const onKey = (e: KeyboardEvent, i: number, mode: StoreMode) => {
    const rtl = dirOf(locale) === "rtl";
    const step = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight") ? 1 : e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft") ? -1 : 0;
    if (step) {
      e.preventDefault();
      refs.current[(i + step + modes.length) % modes.length]?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (modeSelectable(mode)) p.onChange(mode);
    }
  };

  return (
    <div className="@container grid gap-3">
      <p id={labelId} className="sr-only">
        {t("auth.signup.mode.title")}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className={cn("grid gap-2.5", p.compact ? "grid-cols-2" : "@xl:grid-cols-3")}>
        {modes.map((mode, i) => {
          const s = modeSummary(mode);
          const selectable = modeSelectable(mode);
          const checked = p.value === mode;
          return (
            <div
              key={mode}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={checked}
              aria-disabled={!selectable || undefined}
              tabIndex={i === focusIndex ? 0 : -1}
              data-mode={mode}
              onClick={() => selectable && p.onChange(mode)}
              onKeyDown={(e) => onKey(e, i, mode)}
              className={cn(
                "group relative flex min-h-11 cursor-pointer flex-col gap-3 rounded-[var(--r-card)] p-4 text-start ring-1 ring-inset outline-none transition-[box-shadow,background-color] duration-[var(--dur-1)]",
                "focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "bg-brand-soft ring-2 ring-brand" : "bg-card ring-border hover:bg-muted/60",
                !selectable && "cursor-not-allowed opacity-75 hover:bg-card",
                p.compact && (checked ? "col-span-2" : "gap-2 p-3"),
              )}
            >
              <div className={cn("flex items-start justify-between gap-3", p.compact && !checked && "flex-col-reverse gap-1.5")}>
                <div className="grid gap-1">
                  <p className="text-sm font-semibold tracking-[-0.006em]">{t(s.title)}</p>
                  <p className={cn("leading-snug text-pretty text-muted-foreground", p.compact && !checked ? "text-xs" : "text-[13px]")}>{t(s.line)}</p>
                </div>
                {selectable ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors duration-[var(--dur-1)]",
                      checked ? "bg-brand text-brand-foreground ring-brand" : "ring-border",
                    )}
                  >
                    {checked && <CheckIcon className="size-3" strokeWidth={3} />}
                  </span>
                ) : (
                  <span className="inline-flex h-5 shrink-0 items-center rounded-[var(--r-chip)] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{t("auth.signup.mode.soon")}</span>
                )}
              </div>
              {(!p.compact || checked) && (
              <ul className="grid gap-1.5">
                {s.get.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-[13px] leading-snug">
                    <CircleCheckIcon aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", checked ? "text-brand" : "text-muted-foreground")} />
                    <span className="text-pretty">{t(key)}</span>
                  </li>
                ))}
              </ul>
              )}
              {checked && <span className="sr-only">{t("shell.mode.selected")}</span>}
            </div>
          );
        })}
      </div>
      {p.name && <input type="hidden" name={p.name} value={p.value ?? ""} />}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-muted-foreground">{t("auth.signup.mode.change_later")}</p>
        {p.notify && anySoon && (
          <label htmlFor={notifyId} className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px] max-md:min-h-11">
            <input
              id={notifyId}
              type="checkbox"
              checked={p.notify.checked}
              onChange={(e) => p.notify?.onChange(e.target.checked)}
              className="size-4 rounded-[4px] accent-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {t("auth.signup.mode.notify")}
          </label>
        )}
      </div>
    </div>
  );
}
