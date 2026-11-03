"use client";
/**
 * Skeletons of the admin (P2 SHELL; platform.md PLA-§22.12; design.md DES-§16.8 "Skeletons", §16.17 item 5): the
 * exact final layout as static tinted blocks, never a shimmer. A skeleton appears only when loading lasts longer
 * than `SKELETON_DELAY_MS` (200 ms) and, once shown, stays at least `SKELETON_MIN_MS` (300 ms), so a fast answer
 * never flashes grey.
 *
 *   <Skeleton className="h-4 w-32" />                       a block (CSS-delayed: invisible for the first 200 ms)
 *   <SkeletonText lines={3} />                              text lines of the final paragraph
 *   const show = useSkeletonGate(loading);                  client loading: delayed in, held ≥ 300 ms
 *
 * A Suspense fallback unmounts as soon as its content resolves, so only the delay applies there (the CSS one); a
 * client loader holds its own state and gets both through `useSkeletonGate`. Reduced motion: the fade is skipped,
 * the delay kept (it is not motion).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "@/components/admin/styles/primitives.css";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { SKELETON_DELAY_MS, SKELETON_MIN_MS } from "./primitive-logic";

const DELAYED: CSSProperties = { animationDelay: `${SKELETON_DELAY_MS}ms` };

/** One block of the final layout (size it with classes); `immediate` drops the delay (a client gate already waited). */
export function Skeleton({ className, immediate = false }: { className?: string; immediate?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-skeleton=""
      style={immediate ? undefined : DELAYED}
      className={cn("adm-skeleton block rounded-[var(--r-chip)]", !immediate && "adm-skeleton-delayed", className)}
    />
  );
}

/** Text lines: full width, the last one shorter, at the line height of the text they stand for. */
export function SkeletonText({ lines = 2, className, immediate }: { lines?: number; className?: string; immediate?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid gap-2", className)}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} immediate={immediate} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

/** A panel's generic fallback: a title line and three rows, announced once to assistive tech. */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  const t = useT();
  return (
    <div role="status" aria-live="polite" className={cn("grid gap-4", className)}>
      <span className="sr-only">{t("shell.common.loading")}</span>
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-[var(--r-control)]" />
            <SkeletonText lines={2} className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * `loading` as the skeleton should show it: false for the first 200 ms, then true for at least 300 ms even when the
 * loading ends sooner. Timers are cleared on unmount.
 */
export function useSkeletonGate(loading: boolean): boolean {
  const [show, setShow] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (loading && !show) {
      timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShow(true);
      }, SKELETON_DELAY_MS);
    } else if (!loading && show) {
      const held = shownAt.current === null ? SKELETON_MIN_MS : Date.now() - shownAt.current;
      timer = setTimeout(
        () => {
          shownAt.current = null;
          setShow(false);
        },
        Math.max(0, SKELETON_MIN_MS - held),
      );
    }
    return () => clearTimeout(timer);
  }, [loading, show]);
  return show;
}
