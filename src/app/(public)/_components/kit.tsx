import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The identity surfaces' small kit (the account pages, the store picker, the team page, the console's R1.0 home):
 * hairline sections on the card tier of the radius ladder (§I.6: chip 6 · control 8 · card 12 · sheet 16), status
 * pills on the semantic tokens (info hue 250 and violet hue 295 inline: both outside the banned band), and the store
 * monogram. No motion here beyond colour transitions; entrance motion is the pages' own (≤ 240 ms, ease-out).
 */

export function Section({
  title,
  description,
  aside,
  children,
  className,
  id,
  tone = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "danger";
}) {
  return (
    <section
      id={id}
      className={cn(
        "grid gap-5 rounded-[12px] border bg-card p-5 sm:p-6",
        tone === "danger" ? "border-destructive/25" : "border-[color-mix(in_oklab,var(--foreground)_9%,transparent)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid max-w-2xl min-w-0 flex-1 basis-72 gap-1">
          <h2 className={cn("text-[0.98rem] font-semibold tracking-[-0.01em]", tone === "danger" && "text-destructive")}>{title}</h2>
          {description && <div className="text-sm leading-relaxed text-pretty text-muted-foreground">{description}</div>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export type PillTone = "neutral" | "brand" | "success" | "warn" | "danger" | "info" | "violet";

const PILL: Record<PillTone, string> = {
  neutral: "bg-foreground/[0.06] text-foreground/75",
  brand: "bg-brand/10 text-brand",
  success: "bg-success/12 text-success-ink dark:text-success",
  warn: "bg-warn/22 text-warn-ink dark:text-warn",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-[oklch(0.62_0.12_250/0.12)] text-[oklch(0.45_0.13_250)] dark:text-[oklch(0.8_0.09_250)]",
  violet: "bg-[oklch(0.58_0.16_295/0.12)] text-[oklch(0.45_0.17_295)] dark:text-[oklch(0.8_0.1_295)]",
};

export function Pill({ tone = "neutral", children, className, title }: { tone?: PillTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-5 items-center gap-1 rounded-[6px] px-1.5 text-[0.72rem] leading-none font-medium whitespace-nowrap", PILL[tone], className)}>
      {children}
    </span>
  );
}

/** A hue for `seed` (the store's `brand_seed` hex, or any string), folded out of the banned 25-75° band. Pure. */
export function monogramHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const allowed = h % 309; // 0-24 and 76-359: 25 + 284 hues
  return allowed < 25 ? allowed : allowed + 51;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[1]!].map((w) => [...w][0] ?? "") : [...(words[0] ?? "")].slice(0, 2);
  return letters.join("").toUpperCase() || "?";
}

/** Two initials of a store (or a person) on a tinted disc (PLA-§22.3). */
export function Monogram({ name, seed, size = "md", className }: { name: string; seed: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const hue = monogramHue(seed);
  return (
    <span
      aria-hidden="true"
      style={{
        background: `oklch(0.93 0.035 ${hue})`,
        color: `oklch(0.38 0.07 ${hue})`,
        boxShadow: `inset 0 0 0 1px oklch(0.38 0.07 ${hue} / 0.12)`,
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[-0.02em] select-none",
        size === "sm" ? "size-7 text-[0.7rem]" : size === "lg" ? "size-11 text-[0.95rem]" : "size-9 text-[0.8rem]",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A label / value row of a definition list (account facts, the console's identity block). */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium">{children}</dd>
    </div>
  );
}

/** An inline notice (status, never an error): a hairline box with an accent bar at the inline start. */
export function Notice({ tone = "info", children, className }: { tone?: "info" | "brand" | "warn" | "violet" | "console"; children: ReactNode; className?: string }) {
  const bar =
    tone === "brand"
      ? "before:bg-brand"
      : tone === "warn"
        ? "before:bg-warn"
        : tone === "violet"
          ? "before:bg-[oklch(0.58_0.16_295)]"
          : tone === "console"
            ? "before:bg-[oklch(0.6_0.1_205)]"
            : "before:bg-[oklch(0.62_0.12_250)]";
  return (
    <div
      role="status"
      className={cn(
        "relative overflow-hidden rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] bg-card py-3 ps-4 pe-3 text-sm leading-relaxed text-pretty",
        "before:absolute before:inset-y-0 before:start-0 before:w-[3px]",
        bar,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The title block of a dashboard page without the store shell (the account pages, the picker, /app/new, the console home). */
export function PageTitle({ title, lead, aside }: { title: ReactNode; lead?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-2xl gap-1.5">
        <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.03em] text-balance">{title}</h1>
        {lead && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{lead}</p>}
      </div>
      {aside}
    </div>
  );
}
