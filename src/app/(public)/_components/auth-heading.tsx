import type { ReactNode } from "react";

/** Page heading for the auth screens: an optional step kicker, a tight semibold title, a muted lead. */
export function AuthHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 grid gap-2">
      {eyebrow && <p className="text-[0.8rem] font-medium text-muted-foreground tabular-nums">{eyebrow}</p>}
      <h1 className="font-display text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">{title}</h1>
      {children && <div className="text-sm text-pretty text-muted-foreground">{children}</div>}
    </header>
  );
}
