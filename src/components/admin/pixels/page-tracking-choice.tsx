"use client";
/**
 * "Ad tracking for this page" — the required answer of the generate wizard's last step
 * (docs/OFFERS.md §A.4): library chips (none ticked) or "No pixel on this page"; "Create page" stays
 * disabled until one is chosen (AD wires the gate with isTrackingChoiceComplete). "Same as…" ticks
 * exactly the set of one of the 8 most recent pages with pixels. Owners add new pixels inline; an
 * editor with an empty library gets only "No pixel" and a hint. Every page has its own setup: nothing
 * is pre-ticked or copied from the store.
 */
import { CheckIcon, CopyIcon, PlusIcon, RadarIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { wizardPixelsAction, type RecentPagePixels } from "@/lib/pixels/actions";
import type { Tracking } from "@/lib/page/schema";
import { PIXEL_LIMIT, PIXEL_PLATFORMS, type PixelPlatform } from "@/lib/pixels/ids";
import { editTracking, findEntryView, idsOnly, maskPixelId, pixelLabel, trackingRefs, type LibraryPixel, type PixelLibraryView } from "@/lib/pixels/library";
import { trackingFromLists, trackingIds } from "@/lib/pixels/tracking";
import { cn } from "@/lib/utils";
import { PixelEntryDialog } from "./entry-dialog";
import { PLATFORM_META, PlatformMark, PixelStatusChip } from "./parts";
import { limitText } from "./pixel-picker";
import { useNow } from "./use-page-pixels";

/** The page's pixels, or the explicit "No pixel on this page" (tracking.none). */
export type TrackingChoice = { kind: "ids"; tracking: Tracking } | { kind: "none" };

export interface PageTrackingChoiceProps {
  value?: TrackingChoice;
  onChange(v: TrackingChoice): void;
  /** the user may add new pixel ids (owners: settings.write) */
  canCreate: boolean;
}

/** An answer the wizard can create the page with: at least one pixel, or "No pixel". */
export function isTrackingChoiceComplete(v: TrackingChoice | undefined): boolean {
  return !!v && (v.kind === "none" || trackingRefs(v.tracking).length > 0);
}

/** The new page's `tracking` for a choice (undefined until answered). */
export function trackingOfChoice(v: TrackingChoice | undefined): Tracking | undefined {
  if (!isTrackingChoiceComplete(v)) return undefined;
  return v!.kind === "none" ? { none: true } : idsOnly(v!.tracking);
}

export function PageTrackingChoice({ value: controlled, onChange: emit, canCreate }: PageTrackingChoiceProps): ReactElement {
  // controlled when the wizard passes `value`; the local copy keeps the step usable either way
  const [local, setLocal] = useState<TrackingChoice | undefined>(undefined);
  const value = controlled ?? local;
  const onChange = (v: TrackingChoice) => {
    setLocal(v);
    emit(v);
  };
  const [data, setData] = useState<{ library: PixelLibraryView; recent: RecentPagePixels[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const now = useNow();

  useEffect(() => {
    let alive = true;
    wizardPixelsAction()
      .then((res) => {
        if (!alive) return;
        if (res.ok) setData(res.data);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const library = data?.library ?? null;
  const owner = canCreate || !!library?.canCreate;
  const tracking: Tracking = value?.kind === "ids" ? value.tracking : {};
  const none = value?.kind === "none";
  const complete = isTrackingChoiceComplete(value);
  const recent = useMemo(() => (data?.recent ?? []).filter((r) => r.pixels.every((p) => !!findEntryView(library, p.platform, p.id))), [data, library]);

  const toggle = (p: LibraryPixel) => {
    const ids = trackingIds(tracking, p.platform);
    const on = ids.includes(p.id);
    if (!on && ids.length >= PIXEL_LIMIT[p.platform]) return;
    onChange({ kind: "ids", tracking: editTracking(tracking, p.platform, on ? ids.filter((x) => x !== p.id) : [...ids, p.id]) });
  };
  const sameAs = (r: RecentPagePixels) => {
    const lists = Object.fromEntries(PIXEL_PLATFORMS.map((pl) => [pl, r.pixels.filter((x) => x.platform === pl).map((x) => x.id)])) as Record<PixelPlatform, string[]>;
    onChange({ kind: "ids", tracking: trackingFromLists(lists) });
  };

  return (
    <section aria-labelledby="ptc-title" className={cn("adm-surface-flat grid gap-4 p-5 transition-shadow", !complete && "ring-1 ring-brand/25")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <RadarIcon className="size-4" />
          </span>
          <span className="grid gap-0.5">
            <h3 id="ptc-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
              Ad tracking for this page
            </h3>
            <span className="text-[0.8rem] leading-relaxed text-pretty text-muted-foreground">
              Pick the pixels this page fires — every page has its own. You can change them later in the builder.
            </span>
          </span>
        </div>
        {recent.length > 0 && !none && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-medium text-foreground/80 ring-1 ring-foreground/10 ring-inset outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <CopyIcon className="size-3.5" />
                Same as…
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 rounded-xl p-1.5">
              <DropdownMenuLabel className="text-[0.72rem] font-normal text-muted-foreground">Tick exactly the pixels of</DropdownMenuLabel>
              {recent.map((r) => (
                <DropdownMenuItem key={r.pageId} onSelect={() => sameAs(r)} className="grid gap-0.5 py-2">
                  <span className="truncate text-sm font-medium" dir="auto">
                    {r.name}
                  </span>
                  <span className="truncate text-[0.72rem] text-muted-foreground">
                    {r.pixels.map((p) => `${pixelLabel(findEntryView(library, p.platform, p.id), p.platform, p.id)} ${maskPixelId(p.id)}`).join(" · ")}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!library && !failed ? (
        <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Reading your pixels">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-11 w-44 animate-pulse rounded-xl bg-foreground/[0.04]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {library && library.pixels.length > 0 && (
            <div role="group" aria-label="Pixels of this page" className={cn("flex flex-wrap gap-2", none && "pointer-events-none opacity-45")}>
              {library.pixels.map((p) => {
                const on = trackingIds(tracking, p.platform).includes(p.id);
                const full = !on && trackingIds(tracking, p.platform).length >= PIXEL_LIMIT[p.platform];
                const chip = (
                  <button
                    key={`${p.platform}:${p.id}`}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={full || undefined}
                    onClick={() => !full && toggle(p)}
                    className={cn(
                      "group/chip flex min-w-0 items-center gap-2.5 rounded-xl py-2 ps-2 pe-3 text-start ring-1 ring-inset outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring/60",
                      on ? "bg-brand/[0.07] ring-brand/45" : "bg-background ring-foreground/10 hover:bg-foreground/[0.03]",
                      full && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 ring-inset transition-colors", on ? "bg-brand text-brand-foreground ring-brand" : "ring-foreground/25")}>
                      {on && <CheckIcon className="size-3" strokeWidth={3} />}
                    </span>
                    <PlatformMark platform={p.platform} size="sm" />
                    <span className="grid min-w-0 leading-tight">
                      <span className="max-w-[11rem] truncate text-[0.82rem] font-medium" dir="auto">
                        {pixelLabel(p)}
                      </span>
                      <span dir="ltr" className="font-mono text-[0.68rem] text-muted-foreground">
                        {p.label ? maskPixelId(p.id) : PLATFORM_META[p.platform].short}
                      </span>
                    </span>
                  </button>
                );
                return full ? (
                  <Tooltip key={`${p.platform}:${p.id}`}>
                    <TooltipTrigger asChild>{chip}</TooltipTrigger>
                    <TooltipContent>{limitText(p.platform)}</TooltipContent>
                  </Tooltip>
                ) : (
                  chip
                );
              })}
              {owner && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-[0.82rem] font-medium text-muted-foreground ring-1 ring-foreground/15 ring-inset outline-none [border-style:dashed] transition-colors hover:bg-foreground/[0.03] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <PlusIcon className="size-4" />
                  New pixel…
                </button>
              )}
            </div>
          )}

          {library && library.pixels.length === 0 && (
            <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.06] ring-inset sm:flex-row sm:items-center sm:justify-between">
              <span className="grid gap-0.5">
                <span className="text-[0.85rem] font-medium">No pixels saved yet</span>
                <span className="text-[0.78rem] leading-relaxed text-pretty text-muted-foreground">
                  {owner ? "Add this page's Meta, TikTok, Snapchat or GA4 pixel — it's saved for your next pages too." : "Ask an owner to add the store's pixels in Settings → Pixels. Until then, this page can go without."}
                </span>
              </span>
              {owner && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-foreground px-4 text-[0.8rem] font-medium text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:self-auto"
                >
                  <PlusIcon className="size-4" />
                  Add a pixel
                </button>
              )}
            </div>
          )}

          <label
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors",
              none ? "bg-foreground/[0.05] ring-foreground/25" : "ring-foreground/10 hover:bg-foreground/[0.03]",
            )}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={none}
              onChange={(e) => onChange(e.target.checked ? { kind: "none" } : { kind: "ids", tracking: {} })}
            />
            <span className={cn("grid size-4 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60", none ? "bg-foreground text-background ring-foreground" : "ring-foreground/25")}>
              {none && <CheckIcon className="size-3" strokeWidth={3} />}
            </span>
            <span className="grid gap-0.5">
              <span className="text-[0.82rem] font-medium">No pixel on this page</span>
              <span className="text-[0.74rem] text-muted-foreground">Organic or test page — it sends no ad events.</span>
            </span>
          </label>

          {value?.kind === "ids" && trackingRefs(value.tracking).length > 0 && library ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.75rem] text-muted-foreground">
              Fires:
              {trackingRefs(value.tracking).map((r) => {
                const px = findEntryView(library, r.platform, r.id);
                return px ? (
                  <span key={`${r.platform}:${r.id}`} className="inline-flex min-w-0 items-center gap-1.5">
                    <PlatformMark platform={r.platform} size="sm" className="size-4 rounded-[5px] text-[0.55rem]" />
                    <span className="max-w-[9rem] truncate font-medium text-foreground/80" dir="auto">
                      {pixelLabel(px)}
                    </span>
                    <PixelStatusChip pixel={px} now={now} className="h-5 px-2 text-[0.66rem]" />
                  </span>
                ) : null;
              })}
            </p>
          ) : null}
          {failed && <p className="text-[0.78rem] text-muted-foreground">Your pixels couldn&apos;t be read just now. You can still choose “No pixel” and add pixels later in the builder.</p>}
          {!complete && (
            <p role="status" className="text-[0.78rem] font-medium text-brand">
              Choose this page&apos;s pixels, or No pixel.
            </p>
          )}
        </div>
      )}

      {adding && (
        <PixelEntryDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          mode={{ kind: "add" }}
          library={library}
          onSaved={(p, view) => {
            setData((d) => (d ? { ...d, library: view } : { library: view, recent: [] }));
            const ids = trackingIds(tracking, p.platform);
            if (ids.length < PIXEL_LIMIT[p.platform] && !ids.includes(p.id)) onChange({ kind: "ids", tracking: editTracking(tracking, p.platform, [...ids, p.id]) });
          }}
        />
      )}
    </section>
  );
}
