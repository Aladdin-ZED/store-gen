"use client";
/**
 * Pages list — live pixel chips per page and the data behind the "No pixel" filter (docs/OFFERS.md
 * §A.4): what each LIVE page fires right now (labels from the pixel library), read once per visit.
 */
import { RadarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { pagesPixelsAction, type LivePagePixels } from "@/lib/pixels/actions";
import { PIXEL_NAMES } from "@/lib/pixels/ids";
import { maskPixelId } from "@/lib/pixels/library";
import { cn } from "@/lib/utils";

export interface LivePixelsData {
  pages: Record<string, LivePagePixels>;
  labels: Record<string, string>;
}

export function useLivePixels(): LivePixelsData | null {
  const [data, setData] = useState<LivePixelsData | null>(null);
  useEffect(() => {
    let alive = true;
    pagesPixelsAction()
      .then((res) => alive && res.ok && setData(res.data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** A live page with no ids and no explicit "No pixel": the "No pixel" filter. */
export const livePageMissingPixels = (p: LivePagePixels | undefined) => !!p && p.pixels.length === 0 && !p.none;

/** Chips of a live page's pixels (labels), "No pixel" when it fires none. */
export function LivePixelChips({ live, labels, className }: { live: LivePagePixels | undefined; labels: Record<string, string>; className?: string }) {
  if (!live) return null;
  if (!live.pixels.length) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[0.66rem] font-medium ring-1 ring-inset",
            live.none ? "bg-foreground/[0.05] text-foreground/65 ring-foreground/10" : "bg-warn/15 text-warn-ink ring-warn/40",
          )}
          title={live.none ? "Organic or test page: no ad events by choice" : "This live page sends no ad events"}
        >
          <RadarIcon className="size-3" />
          {live.none ? "No pixel (organic)" : "No pixel"}
        </span>
      </span>
    );
  }
  const shown = live.pixels.slice(0, 2);
  const more = live.pixels.length - shown.length;
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)} aria-label="Live pixels">
      {shown.map((p) => (
        <span
          key={`${p.platform}:${p.id}`}
          className="inline-flex h-5 min-w-0 items-center gap-1 rounded-full bg-foreground/[0.045] px-2 text-[0.66rem] font-medium text-foreground/75 ring-1 ring-foreground/[0.08] ring-inset"
          title={`${PIXEL_NAMES[p.platform]} ${maskPixelId(p.id)}`}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="truncate" dir="auto">
            {labels[`${p.platform}:${p.id}`] || `${PIXEL_NAMES[p.platform]} ${maskPixelId(p.id)}`}
          </span>
        </span>
      ))}
      {more > 0 && <span className="shrink-0 text-[0.66rem] font-medium text-muted-foreground">+{more}</span>}
    </span>
  );
}
