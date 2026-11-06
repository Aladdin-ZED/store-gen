"use client";
/**
 * Settings → AI building blocks (P7 AI; ai.md AI-§K.1; core §I.6, §I.8): the choice group (a segmented radiogroup
 * with one sentence per option, full width at 390 px, arrow keys, an option disabled with its reason), the switch
 * row (44 px target, label and one sentence), the credits meter, the inline save error with retry, and `useSaved`,
 * the optimistic write with Undo (the toast is up before the server answers; a failure keeps the input and offers
 * Retry; the props from the server settle the value).
 */
import { LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

/** The admin locale for Intl, with Latin digits in Arabic (the admin's convention). */
export const intlLocale = (l: string) => (l === "ar" ? "ar-MA-u-nu-latn" : l === "fr" ? "fr-MA" : "en-GB");

export function useFormat() {
  const locale = intlLocale(useAdminLocale());
  return {
    int: (n: number) => new Intl.NumberFormat(locale).format(n),
    date: (ymd: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`)),
    ms: (ms: number) => new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1 }).format(ms / 1000),
    bytes: (n: number) => new Intl.NumberFormat(locale, { style: "unit", unit: n >= 1e9 ? "gigabyte" : "megabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(n >= 1e9 ? n / 1e9 : n / 1e6),
    when: (iso: string) => {
      const diff = (new Date(iso).getTime() - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
      const a = Math.abs(diff);
      if (a < 60) return rtf.format(Math.round(diff), "second");
      if (a < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (a < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
      return rtf.format(Math.round(diff / 86_400), "day");
    },
  };
}

/* ------------------------------------------------------------------ */
/* optimistic writes                                                   */
/* ------------------------------------------------------------------ */

export const newKey = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export interface SavedState {
  pending: boolean;
  error: string | null;
  retry: (() => void) | null;
}

/**
 * One stored value written optimistically. `set(v)` shows v at once with a "Saved · Undo" toast, sends the action
 * with a fresh idempotency key; a failure keeps v on screen with the inline error and Retry (same key). New props
 * from the server (after revalidation) replace the local value when nothing is pending.
 */
export function useSaved<T>(server: T, send: (value: T, key: string) => Promise<ActionResult<unknown>>): [T, (v: T) => void, SavedState] {
  const t = useT();
  const [value, setValue] = useState(server);
  const [seen, setSeen] = useState(server);
  const [state, setState] = useState<SavedState>({ pending: false, error: null, retry: null });
  const seq = useRef(0);
  const current = useRef(server);
  useEffect(() => {
    current.current = value;
  }, [value]);
  if (!Object.is(seen, server) && JSON.stringify(seen) !== JSON.stringify(server)) {
    setSeen(server);
    if (!state.pending && !state.error) setValue(server);
  }
  const run = (next: T, prev: T, key: string, withUndo: boolean) => {
    const mine = ++seq.current;
    setState({ pending: true, error: null, retry: null });
    if (withUndo) {
      toast(t("ai.settings.saved"), { id: `ai-settings-${key}`, duration: 5_000, action: { label: t("ai.settings.undo"), onClick: () => apply(prev, false) } });
    }
    const failed = (message?: string) => {
      if (mine !== seq.current) return;
      toast.dismiss(`ai-settings-${key}`);
      setState({ pending: false, error: message ? t(message) : t("ai.settings.error"), retry: () => run(next, prev, key, false) });
    };
    void send(next, key)
      .then((r) => {
        if (mine !== seq.current) return;
        if (r.ok) setState({ pending: false, error: null, retry: null });
        else failed(r.message);
      })
      .catch(() => failed());
  };
  const apply = (next: T, withUndo = true) => {
    const prev = current.current;
    if (Object.is(prev, next)) return;
    current.current = next;
    setValue(next);
    run(next, prev, newKey(), withUndo);
  };
  return [value, (v: T) => apply(v), state];
}

/** The inline failure line: the input stays as typed, one Retry. */
export function SaveError({ state, className }: { state: SavedState; className?: string }) {
  const t = useT();
  if (!state.error) return null;
  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-destructive", className)}>
      <span>{state.error}</span>
      {state.retry && (
        <button type="button" onClick={state.retry} className="inline-flex min-h-11 items-center gap-1.5 font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none sm:min-h-0">
          <RotateCcwIcon aria-hidden="true" className="size-3.5" />
          {t("ai.settings.retry")}
        </button>
      )}
    </p>
  );
}

export function Pending({ on }: { on: boolean }) {
  const t = useT();
  return on ? <LoaderCircleIcon aria-label={t("ai.settings.saving")} className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" /> : null;
}

/* ------------------------------------------------------------------ */
/* choice group                                                        */
/* ------------------------------------------------------------------ */

export interface ChoiceOption<V extends string> {
  value: V;
  label: ReactNode;
  /** a small marker next to the label ("Default") */
  badge?: ReactNode;
  disabled?: boolean;
}

/**
 * A segmented radiogroup: equal columns that fill the row (full width at 390 px), roving tab index, arrow keys
 * (mirrored in RTL by the browser's own order), Home / End. The selected option's sentence sits under the group.
 */
export function ChoiceGroup<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  describe,
  className,
}: {
  label: string;
  value: V;
  options: ChoiceOption<V>[];
  onChange: (v: V) => void;
  disabled?: boolean;
  /** the sentence of the selected option */
  describe?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (disabled || !keys.includes(e.key)) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const at = Math.max(0, enabled.findIndex((o) => o.value === value));
    const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const back = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
    const next = e.key === "Home" ? 0 : e.key === "End" ? enabled.length - 1 : fwd ? (at + 1) % enabled.length : back ? (at - 1 + enabled.length) % enabled.length : at;
    const o = enabled[next];
    if (!o) return;
    onChange(o.value);
    refs.current[options.indexOf(o)]?.focus();
  };
  return (
    <div className={cn("grid gap-2", className)}>
      <div
        role="radiogroup"
        aria-label={label}
        aria-describedby={describe ? `${id}-d` : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={move}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-foreground/[0.045] p-1 ring-1 ring-foreground/[0.06] ring-inset"
      >
        {options.map((o, i) => {
          const on = o.value === value;
          const off = disabled || o.disabled;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={off}
              tabIndex={on ? 0 : -1}
              onClick={() => !on && onChange(o.value)}
              className={cn(
                "relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[0.625rem] px-2 py-1.5 text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-[var(--dur-fast,140ms)] ease-out sm:min-h-9",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on ? "bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-foreground/[0.08]" : "text-muted-foreground hover:text-foreground",
                off && !on && "cursor-not-allowed opacity-45 hover:text-muted-foreground",
                off && on && "cursor-default",
              )}
            >
              <span className="min-w-0 text-center leading-tight text-balance">{o.label}</span>
              {o.badge}
            </button>
          );
        })}
      </div>
      {describe && (
        <p id={`${id}-d`} className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
          {describe}
        </p>
      )}
    </div>
  );
}

export function DefaultBadge() {
  const t = useT();
  return <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-px text-[0.6875rem] font-medium text-muted-foreground">{t("ai.settings.default")}</span>;
}

/* ------------------------------------------------------------------ */
/* switch row                                                          */
/* ------------------------------------------------------------------ */

export function SwitchRow({
  label,
  body,
  checked,
  onChange,
  disabled,
  state,
  className,
}: {
  label: ReactNode;
  body?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  state?: SavedState;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <label htmlFor={id} className={cn("grid min-w-0 gap-0.5", disabled ? "cursor-default" : "cursor-pointer")}>
          <span className="flex items-center gap-2 text-[0.875rem] font-medium">
            {label}
            {state && <Pending on={state.pending} />}
          </span>
          {body && <span className="text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">{body}</span>}
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="shrink-0" />
      </div>
      {state && <SaveError state={state} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* meter                                                               */
/* ------------------------------------------------------------------ */

/** A thin bar; the fill turns to the warning tone from 80 % and to the destructive tone at 100 %. */
export function Meter({ fraction, label, className }: { fraction: number | null; label: string; className?: string }) {
  if (fraction === null) return null;
  const pct = Math.round(fraction * 1000) / 10;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-[var(--dur-base,200ms)] ease-out motion-reduce:transition-none",
          fraction >= 1 ? "bg-destructive" : fraction >= 0.8 ? "bg-[var(--warn)]" : "bg-foreground/80",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** One quiet line with an icon (a notice inside a section). */
export function Note({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-xl bg-foreground/[0.03] px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground ring-1 ring-foreground/[0.06] ring-inset", className)}>
      {icon && <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </p>
  );
}
