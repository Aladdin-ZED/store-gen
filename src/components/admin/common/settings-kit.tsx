"use client";
/**
 * The settings building blocks of P2's screens (P2 SHELL; platform.md PLA-§22.10, §22.11, §22.4, §22.5; design.md
 * DES-§16.4 "settings: 720 px reading width", §16.8; brief p2-10 FORM RULES, UX-37):
 *
 *   SettingsCard     one titled group on a card: title, a muted line, the body, an optional footer bar (the save row)
 *   Field            label above (13 px / 500, never a placeholder as the label), the control, a hint, the error
 *                    under the field (`aria-describedby`); the control gets its id and `aria-invalid`
 *   ErrorSummary     the form's errors in an `aria-live` region that scrolls into view when they appear
 *   BusyButton       a submit button that keeps its width while busy (the label stays, invisible, under a spinner)
 *   FactRow          a read-only fact (label, value, an optional action) in a two-column definition list
 *   FIELD_INPUT      52 px tall with 16 px text under 768 px (no zoom on iOS), 40 px / 14 px above
 *
 * Forms submit on Enter (they are real `<form>`s); a field's error is a catalog key the caller translates.
 */
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

/** The control sizes of UX-37: 52 px / 16 px under 768 px, 40 px / 14 px above. */
export const FIELD_INPUT = "max-md:h-[52px] max-md:text-base md:h-10 md:text-sm rounded-[var(--r-control)] bg-background";
/** A select trigger with the same heights. */
export const FIELD_SELECT = "w-full max-md:!h-[52px] max-md:text-base md:!h-10 md:text-sm rounded-[var(--r-control)] bg-background";
/** The settings column's reading width (DES-§16.4). */
export const READING = "w-full max-w-[720px]";

export function SettingsCard({
  id,
  title,
  description,
  actions,
  footer,
  tone,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  tone?: "danger";
  children?: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        READING,
        "scroll-mt-24 overflow-hidden rounded-[var(--r-card)] bg-card text-card-foreground ring-1 ring-border ring-inset",
        tone === "danger" && "ring-[color-mix(in_oklab,var(--destructive)_28%,var(--border))]",
        className,
      )}
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid min-w-0 gap-1">
            <h2 id={headingId} className={cn("text-[0.95rem] font-semibold tracking-[-0.01em]", tone === "danger" && "text-destructive-ink")}>
              {title}
            </h2>
            {description && <div className="max-w-[60ch] text-[13px] leading-relaxed text-pretty text-muted-foreground">{description}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3 sm:px-6">{footer}</div>}
    </section>
  );
}

/** One field: the label above, the control, the hint, the error (a catalog key, translated here). */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children(p: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }): ReactNode;
}) {
  const t = useT();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[13px] font-medium text-foreground">
        {label}
        {optional && <span className="text-xs font-normal text-muted-foreground">{t("shell.form.optional")}</span>}
      </label>
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        "aria-describedby": described,
      })}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive-ink">
          {t(error)}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/**
 * The form's errors (catalog keys by field) in a polite live region; the box scrolls into view when a submit leaves
 * errors, so a phone user sees why nothing saved. Renders the empty live region while there is nothing to say.
 */
export function ErrorSummary({ errors, labels }: { errors: Record<string, string>; labels?: Record<string, string> }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  const signature = entries.map(([k, v]) => `${k}:${v}`).join("|");
  useEffect(() => {
    if (signature) box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [signature]);
  return (
    <div ref={box} aria-live="polite" className={cn(READING, entries.length === 0 && "sr-only")}>
      {entries.length > 0 && (
        <div className="grid gap-1 rounded-[var(--r-control)] bg-destructive-soft px-3.5 py-2.5 text-[13px] text-destructive-ink">
          <p className="font-medium">{t("shell.form.fix_errors", { count: entries.length })}</p>
          <ul className="grid gap-0.5">
            {entries.map(([field, key]) => (
              <li key={field}>
                {labels?.[field] ? `${labels[field]}: ` : ""}
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A button that keeps its width while busy: the label stays (invisible) under the spinner. */
export function BusyButton({ busy, children, className, ...props }: React.ComponentProps<typeof Button> & { busy: boolean }): ReactElement {
  return (
    <Button {...props} aria-busy={busy || undefined} disabled={props.disabled || busy} className={cn("relative max-md:h-11 max-md:px-4", className)}>
      <span className={cn("inline-flex items-center gap-1.5", busy && "invisible")}>{children}</span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
        </span>
      )}
    </Button>
  );
}

/**
 * A native select in the field sizes (the phone's own picker under 768 px; long lists such as time zones stay fast).
 * The chevron sits at the inline end, so it mirrors in RTL.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        {...props}
        className={cn(
          FIELD_INPUT,
          "w-full appearance-none border border-input ps-3 pe-9 text-foreground transition-[border-color,box-shadow] duration-[var(--dur-1)] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

/** A read-only fact of a settings card. */
export function FactRow({ label, children, action }: { label: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
      <dt className="text-[13px] text-muted-foreground max-sm:col-span-2">{label}</dt>
      <dd className="min-w-0 truncate text-sm text-foreground">{children}</dd>
      {action ? <dd className="justify-self-end">{action}</dd> : <dd className="hidden sm:block" />}
    </div>
  );
}

/** A list of FactRows with hairlines between them. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">{children}</dl>;
}
