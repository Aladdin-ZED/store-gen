"use client";
/**
 * Builder → SEO & tracking → "Pixels on this page" (docs/OFFERS.md §A.4). The page's own pixels as
 * rows (label, masked id, status chip, health, remove), "Add a pixel" over the library (owners also
 * get New pixel…), "Not in library" ids, the explicit "No pixel on this page (organic / test)", the
 * "Pixels copied from {page}" note with Keep, "Update live page now (pixels only)" when the draft's
 * ids differ from the live ones, and "Test this page" (30 / 60 / 120 min) per Meta/TikTok pixel with
 * a saved test code on the live page.
 */
import { CopyIcon, FlaskConicalIcon, Loader2Icon, RadarIcon, UploadCloudIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyLiveTrackingAction, startPixelTestAction, stopPixelTestAction } from "@/lib/pixels/actions";
import type { Tracking } from "@/lib/page/schema";
import { PIXEL_LIMIT, isServerPlatform, type PixelPlatform, type ServerPlatform } from "@/lib/pixels/ids";
import { TEST_MINUTES, editTracking, findEntryView, idsOnly, pixelLabel, pixelStatus, sameIds, trackingRefs, type LibraryPixel } from "@/lib/pixels/library";
import { trackingIds } from "@/lib/pixels/tracking";
import { cn } from "@/lib/utils";
import { runAction } from "../lib/action-result";
import { PixelEntryDialog, type EntryMode } from "./entry-dialog";
import { MaskedId, PLATFORM_META, PixelHealthLine, PixelStatusChip, PlatformMark } from "./parts";
import { PixelPicker } from "./pixel-picker";
import { useStore } from "../shell/store-context";
import { useNow, usePagePixels } from "./use-page-pixels";

export interface PagePixelsProps {
  pageId: string;
  tracking: Tracking;
  /** builder doc update (undoable): the page's next tracking */
  onChange: (recipe: (t: Tracking) => Tracking, group?: string) => void;
  /** save the draft now (the pixels-only update publishes the SAVED draft's pixels) */
  flush?: () => Promise<boolean>;
}

export function PagePixels({ pageId, tracking, onChange, flush }: PagePixelsProps) {
  const { state, failed, reload, set } = usePagePixels(pageId);
  const storeView = useStore();
  const [entry, setEntry] = useState<EntryMode | null>(null);
  const [updating, setUpdating] = useState(false);
  const now = useNow();
  const library = state?.library ?? null;
  const refs = trackingRefs(tracking);
  const live = state?.live ?? null;
  const differs = !!live && !sameIds(idsOnly(tracking), live.tracking);
  const canCreate = !!library?.canCreate;

  const add = (p: { platform: PixelPlatform; id: string }) => {
    if (trackingIds(tracking, p.platform).length >= PIXEL_LIMIT[p.platform]) return;
    onChange((t) => editTracking(t, p.platform, [...trackingIds(t, p.platform), p.id]), `pixel:${p.platform}`);
  };
  const remove = (p: { platform: PixelPlatform; id: string }) => onChange((t) => editTracking(t, p.platform, trackingIds(t, p.platform).filter((x) => x !== p.id)), `pixel:${p.platform}`);

  const updateLive = async () => {
    if (!live) return;
    setUpdating(true);
    try {
      if (flush && !(await flush())) {
        toast.error("Save the page first — the live update uses the saved pixels.");
        return;
      }
      const res = await runAction(applyLiveTrackingAction({ pageId, baseVersionId: live.versionId }), { success: "Live page updated — only its pixels changed" });
      if (res) await reload();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="grid gap-3">
      {tracking.copiedFrom && refs.length > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-brand-soft px-3 py-2.5 text-[12px] leading-relaxed text-foreground/80">
          <span className="flex min-w-0 items-start gap-2">
            <CopyIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Pixels copied from <span className="font-medium text-foreground">{tracking.copiedFrom}</span>. Keep them, or change them for this page.
            </span>
          </span>
          <button
            type="button"
            onClick={() =>
              onChange((t) => {
                const next = { ...t };
                delete next.copiedFrom;
                return next;
              })
            }
            className="shrink-0 rounded-full bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground shadow-[0_0_0_1px_var(--border)] outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Keep
          </button>
        </div>
      )}

      {refs.length > 0 ? (
        <ul className="grid gap-1.5">
          {refs.map((r) => (
            <PixelLine
              key={`${r.platform}:${r.id}`}
              pageId={pageId}
              platform={r.platform}
              id={r.id}
              pixel={findEntryView(library, r.platform, r.id)}
              libraryLoaded={!!library}
              onLive={!!live && trackingIds(live.tracking, r.platform).includes(r.id)}
              canPublish={!!state?.canPublish}
              canCreate={canCreate}
              now={now}
              onRemove={() => remove(r)}
              onSaveToLibrary={() => setEntry({ kind: "add", platform: r.platform, id: r.id })}
              onTestChanged={reload}
            />
          ))}
        </ul>
      ) : tracking.none ? (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-foreground/[0.035] px-3 py-3">
          <span className="grid gap-0.5">
            <span className="text-[12.5px] font-medium text-foreground/85">No pixel on this page</span>
            <span className="text-[11.5px] leading-relaxed text-muted-foreground">Organic or test page: it sends no ad events.</span>
          </span>
          <button
            type="button"
            onClick={() =>
              onChange((t) => {
                const next = { ...t };
                delete next.none;
                return next;
              })
            }
            className="shrink-0 rounded-full bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground shadow-[0_0_0_1px_var(--border)] outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Add pixels
          </button>
        </div>
      ) : (
        <div className="grid gap-2 rounded-xl bg-warn/10 px-3 py-3 text-[12px] leading-relaxed text-warn-ink">
          <span className="flex items-start gap-2">
            <RadarIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">This page has no pixel yet.</span> Pick its pixels, or say it has none.
            </span>
          </span>
        </div>
      )}

      {!tracking.none && (
        <div className="flex flex-wrap items-center gap-2">
          {library && (library.pixels.length > 0 || canCreate) ? (
            <PixelPicker library={library} tracking={tracking} onPick={add} onNew={canCreate ? () => setEntry({ kind: "add" }) : undefined} />
          ) : library ? null : failed ? null : (
            <span className="h-8 w-28 animate-pulse rounded-full bg-foreground/[0.05]" aria-hidden="true" />
          )}
          {refs.length === 0 && (
            <button
              type="button"
              onClick={() => onChange(() => ({ none: true }))}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground ring-1 ring-foreground/10 ring-inset outline-none transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              No pixel on this page (organic / test)
            </button>
          )}
        </div>
      )}
      {library && !canCreate ? (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {library.pixels.length ? "Ask an owner to add new pixels in Settings → Pixels." : "The pixel library is empty. Ask an owner to add the store's pixels in Settings → Pixels."}
        </p>
      ) : null}
      {failed && <p className="text-[11.5px] text-muted-foreground">The pixel library couldn&apos;t be read just now. The page keeps its pixels.</p>}

      {differs && state?.canPublish && (
        <div className="grid gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-[12px] leading-relaxed text-foreground/80">
          <span>The live page fires {trackingRefs(live!.tracking).length ? "other pixels" : "no pixel"}. Push this page&apos;s pixels live without publishing the other edits:</span>
          <Button type="button" size="sm" className="w-fit rounded-full" onClick={updateLive} disabled={updating}>
            {updating ? <Loader2Icon className="animate-spin" /> : <UploadCloudIcon />}
            Update live page now (pixels only)
          </Button>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        They fire on the live page only, never in the builder or previews. Tokens and test codes live in{" "}
        <Link href={storeView.href("/integrations/pixels")} target="_blank" rel="noopener" className="font-medium text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground">
          Connect → Pixels
        </Link>
        .
      </p>

      {entry && (
        <PixelEntryDialog
          open
          onOpenChange={(o) => !o && setEntry(null)}
          mode={entry}
          library={library}
          onSaved={(p, view) => {
            if (state) set({ ...state, library: view });
            if (!trackingIds(tracking, p.platform).includes(p.id)) add(p);
          }}
        />
      )}
    </div>
  );
}

function PixelLine({
  pageId,
  platform,
  id,
  pixel,
  libraryLoaded,
  onLive,
  canPublish,
  canCreate,
  now,
  onRemove,
  onSaveToLibrary,
  onTestChanged,
}: {
  pageId: string;
  platform: PixelPlatform;
  id: string;
  pixel: LibraryPixel | undefined;
  libraryLoaded: boolean;
  onLive: boolean;
  canPublish: boolean;
  canCreate: boolean;
  now: number;
  onRemove: () => void;
  onSaveToLibrary: () => void;
  onTestChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const status = pixel ? pixelStatus(pixel, now || 1, pageId) : null;
  const testable = !!pixel && isServerPlatform(platform) && pixel.server && pixel.testCode && onLive && canPublish;
  const label = pixel ? pixelLabel(pixel) : `${PLATFORM_META[platform].name} pixel`;

  const start = async (minutes: number) => {
    setBusy(true);
    try {
      const res = await runAction(startPixelTestAction({ pageId, platform: platform as ServerPlatform, id, minutes }), { success: `Test mode on for ${minutes} min — only this page's events` });
      if (res) await onTestChanged();
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      const res = await runAction(stopPixelTestAction({ pageId, platform: platform as ServerPlatform, id }), { success: "Test mode off" });
      if (res !== undefined) await onTestChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-2 rounded-xl bg-card px-2.5 py-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border)_90%,transparent)]">
      <div className="flex items-center gap-2.5">
        <PlatformMark platform={platform} size="sm" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[12.5px] leading-tight font-medium text-foreground/90" dir="auto">
            {label}
          </span>
          <MaskedId id={id} className="text-[11px]" />
        </span>
        <button
          type="button"
          aria-label={`Remove ${label} from this page`}
          onClick={onRemove}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 ps-[2.125rem]">
        {pixel ? (
          <>
            <PixelStatusChip pixel={pixel} pageId={pageId} now={now} className="h-5 px-2 text-[10.5px]" />
            <PixelHealthLine pixel={pixel} className="text-[10.5px]" />
          </>
        ) : libraryLoaded ? (
          <>
            <span className="inline-flex h-5 items-center rounded-full bg-warn/15 px-2 text-[10.5px] font-medium text-warn-ink ring-1 ring-warn/40 ring-inset">Not in library</span>
            {canCreate ? (
              <button type="button" onClick={onSaveToLibrary} className="text-[11px] font-medium text-foreground underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground">
                Save
              </button>
            ) : (
              <span className="text-[10.5px] text-muted-foreground">An owner must add it before publishing</span>
            )}
          </>
        ) : null}
        {testable && status?.kind !== "test" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className="ms-auto inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-muted-foreground ring-1 ring-foreground/10 ring-inset outline-none transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {busy ? <Loader2Icon className="size-3 animate-spin" /> : <FlaskConicalIcon className="size-3" />}
                Test this page
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
              <DropdownMenuLabel className="text-[11px] leading-relaxed font-normal text-muted-foreground">
                This page&apos;s server events go to Test events. Other pages keep sending real events.
              </DropdownMenuLabel>
              {TEST_MINUTES.map((m) => (
                <DropdownMenuItem key={m} onSelect={() => void start(m)}>
                  For {m === 120 ? "2 hours" : m === 60 ? "1 hour" : "30 minutes"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {status?.kind === "test" && canPublish && (
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            className={cn("ms-auto inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-warn-ink ring-1 ring-warn/40 ring-inset outline-none transition-colors hover:bg-warn/10 focus-visible:ring-2 focus-visible:ring-ring/50")}
          >
            {busy ? <Loader2Icon className="size-3 animate-spin" /> : null}
            Stop test
          </button>
        )}
      </div>
    </li>
  );
}
