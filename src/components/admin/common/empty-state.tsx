/**
 * EmptyState (P2 SHELL; platform.md PLA-§22.12; design.md DES-§16.8 "Empty states", §16.17 item 12; core D60 rev 3,
 * UX-38). Server-safe (no hooks). Two variants, no aurora, mesh, grain or gradient field anywhere:
 *
 * - **quiet** (default): a skeleton preview of the real UI in its final shape (`preview`, else three generic rows),
 *   one sentence (`title`, with an optional `description`), one primary action (`actions`) and an optional teaching
 *   line (`teach`). The R1.0 `illustration` prop still renders for the screens that pass it, until their tracks move
 *   to a `preview`.
 * - **celebration** (once: the first store, the first order): a typographic moment, one large tabular number at
 *   56 / 600, a 2 px accent hairline drawn in over 240 ms (ease-out; reduced motion: a fade) and the sentence under it.
 *   Nothing else.
 *
 *   <EmptyState title="No orders yet" description="…" actions={<Button variant="brand">…</Button>} preview={<OrdersRowsSkeleton />} />
 *   <EmptyState variant="celebration" celebration={{ number: 1, label: "Your first order" }} title="…" />
 */
import type { ReactNode } from "react";
import "@/components/admin/styles/primitives.css";
import { cn } from "@/lib/utils";
import { Illustration, type IllustrationName } from "./illustrations";
import { Skeleton } from "./skeleton";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** the one primary action (quiet only) */
  actions?: ReactNode;
  /** the optional teaching line under the action (quiet only) */
  teach?: ReactNode;
  /** a skeleton of the screen's real UI in its final shape (quiet only); default: three generic rows */
  preview?: ReactNode;
  /** R1.0 screens: a drawing instead of the preview */
  illustration?: IllustrationName;
  variant?: "quiet" | "celebration";
  celebration?: { number: number | string; label: string };
  /** smaller variant for cards and drawers */
  compact?: boolean;
  className?: string;
}

function GenericPreview() {
  return (
    <div aria-hidden="true" className="grid w-full max-w-sm gap-2.5 rounded-[var(--r-card)] p-3 ring-1 ring-border ring-inset">
      {["w-40", "w-28", "w-32"].map((w, i) => (
        <div key={w} className={cn("flex items-center gap-3", i === 1 && "opacity-75", i === 2 && "opacity-50")}>
          <Skeleton immediate className="size-7 shrink-0 rounded-[var(--r-control)]" />
          <Skeleton immediate className={cn("h-3", w)} />
          <span className="flex-1" />
          <Skeleton immediate className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, actions, teach, preview, illustration, variant = "quiet", celebration, compact = false, className }: EmptyStateProps) {
  if (variant === "celebration" && celebration) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 px-6 text-center", compact ? "py-10" : "py-16", className)}>
        <div className="grid justify-items-center gap-3">
          <p className="text-[56px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
            <bdi>{celebration.number}</bdi>
          </p>
          <span aria-hidden="true" className="adm-hairline-draw block h-0.5 w-16 rounded-full bg-brand" />
          <p className="text-sm font-medium text-muted-foreground">{celebration.label}</p>
        </div>
        <h3 className="max-w-md text-base font-semibold tracking-[-0.006em] text-balance">{title}</h3>
      </div>
    );
  }
  return (
    <div className={cn("adm-fade flex flex-col items-center justify-center text-center", compact ? "gap-4 px-5 py-8" : "gap-6 px-6 py-14 sm:py-16", className)}>
      {illustration ? <Illustration name={illustration} className={compact ? "w-24" : "w-36"} /> : (preview ?? <GenericPreview />)}
      <div className="grid max-w-md gap-1.5">
        <h3 className={cn("font-semibold tracking-[-0.006em] text-balance", compact ? "text-[0.95rem]" : "text-base")}>{title}</h3>
        {description && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>}
      {teach && <p className="max-w-sm text-xs leading-relaxed text-pretty text-muted-foreground">{teach}</p>}
    </div>
  );
}
