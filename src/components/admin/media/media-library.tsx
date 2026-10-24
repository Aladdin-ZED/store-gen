"use client";

import {
  ArrowUpRightIcon,
  ImageIcon,
  ImageUpIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilLineIcon,
  ScissorsIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssetUsage } from "@/lib/admin-data/assets";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { CopyButton } from "../common/copy-button";
import { EmptyState } from "../common/empty-state";
import { SearchField } from "../common/search-field";
import { Segmented } from "../common/segmented";
import { runAction, type ActionResult } from "../lib/action-result";
import { useStore } from "../shell/store-context";
import { bytes, dateTime, int } from "../lib/format";
import { AssetTile } from "./asset-tile";
import { altOf, deleteMedia, fetchMedia, IMAGE_ACCEPT, MediaInUseError, VIDEO_ACCEPT, useMediaList, type MediaAsset, type MediaFilter } from "./media-client";
import { Dropzone, UploadQueue, useUploads } from "./uploads";
import { AssetFraming } from "./focal/asset-framing";
import type { FocalPoint } from "./focal/frames";
import { withFocalTag } from "./focal/tags";
import { useRemoveBackground, type StoredAiSettings } from "./use-remove-background";

export interface MediaLibraryProps {
  initial: { items: MediaAsset[]; total: number };
  counts: { all: number; photo: number; cutout: number; video: number };
  canWrite: boolean;
  /** saved Settings → Local AI values */
  ai: StoredAiSettings;
  setAlt: (id: string, alt: string) => Promise<ActionResult<{ alt: string }>>;
  /** pages (and the store logo) using a file */
  usage: (id: string) => Promise<ActionResult<AssetUsage>>;
}

export function MediaLibrary({ initial, counts, canWrite, ai, setAlt, usage }: MediaLibraryProps) {
  const params = useSearchParams();
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<MediaAsset | null>(null);
  const list = useMediaList({ filter, q, initial });
  const [localCounts, setLocalCounts] = useState(counts);
  const bg = useRemoveBackground(ai);
  const [dragging, setDragging] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  const onUploaded = useCallback(
    (asset: MediaAsset, deduped: boolean) => {
      if (deduped) {
        toast.info(`${asset.originalName ?? "This file"} is already in your library`);
        return;
      }
      list.mutate((items) => [asset, ...items.filter((i) => i.id !== asset.id)], 1);
      setLocalCounts((c) => ({ ...c, all: c.all + 1, [asset.kind === "video" ? "video" : asset.alpha ? "cutout" : "photo"]: c[asset.kind === "video" ? "video" : asset.alpha ? "cutout" : "photo"] + 1 }));
    },
    [list],
  );
  const uploads = useUploads(onUploaded);
  const addFiles = uploads.add;

  // ⌘K "Upload photos" lands here with ?upload=1
  const openedPicker = useRef(false);
  useEffect(() => {
    if (canWrite && params.get("upload") === "1" && !openedPicker.current) {
      openedPicker.current = true;
      pickerRef.current?.click();
    }
  }, [params, canWrite]);

  // drop files anywhere on the screen
  useEffect(() => {
    if (!canWrite) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      // a drop zone on the page already took these files (it called preventDefault)
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [canWrite, addFiles]);

  const removeBg = async (asset: MediaAsset) => {
    const created = await bg.run(asset);
    if (created) onUploaded(created, false);
  };

  /** true = deleted · false = failed (toasted) · MediaInUseError = the server wants a confirmation */
  const remove = async (asset: MediaAsset, force: boolean): Promise<boolean | MediaInUseError> => {
    try {
      await deleteMedia(asset.id, { force });
      list.mutate((items) => items.filter((i) => i.id !== asset.id), -1);
      setLocalCounts((c) => ({ ...c, all: Math.max(0, c.all - 1), [asset.kind === "video" ? "video" : asset.alpha ? "cutout" : "photo"]: Math.max(0, c[asset.kind === "video" ? "video" : asset.alpha ? "cutout" : "photo"] - 1) }));
      setDetail(null);
      toast.success("Deleted. Pages that used it keep a placeholder until you pick another image.");
      return true;
    } catch (err) {
      if (err instanceof MediaInUseError) return err;
      toast.error(err instanceof Error ? err.message : "Couldn't delete this file.");
      return false;
    }
  };

  const empty = localCounts.all === 0 && list.items.length === 0;

  return (
    <div className="grid grid-cols-1 gap-6">
      {canWrite && (
        <input
          ref={pickerRef}
          type="file"
          multiple
          accept={`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploads.add(e.target.files);
            e.target.value = "";
          }}
        />
      )}

      {empty ? (
        canWrite ? (
          <Dropzone onFiles={uploads.add} className="adm-aurora adm-grain min-h-80 py-16">
            <span className="relative z-10 grid gap-1.5">
              <span className="text-lg font-semibold">Start your library</span>
              <span className="mx-auto max-w-md text-sm text-muted-foreground">
                Drop product photos here — they&apos;re converted to WebP/AVIF in every size your pages need. Transparent PNG cutouts work great for hero stages.
              </span>
            </span>
          </Dropzone>
        ) : (
          <EmptyState illustration="media" title="The library is empty" description="Photos uploaded by your team will appear here." />
        )
      ) : (
        <>
          <div className="adm-rise flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" style={{ ["--i" as string]: 2 }}>
            <Segmented
              label="Filter media"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: localCounts.all },
                { value: "photo", label: "Photos", count: localCounts.photo, icon: <ImageIcon /> },
                { value: "cutout", label: "Cutouts", count: localCounts.cutout, icon: <ScissorsIcon /> },
                { value: "video", label: "Videos", count: localCounts.video },
              ]}
            />
            <div className="flex items-center gap-2">
              <SearchField value={q} onCommit={setQ} placeholder="Search file names & alt text" pending={list.loading && list.items.length > 0} />
              {canWrite && (
                <Button className="h-9 rounded-full px-4" onClick={() => pickerRef.current?.click()}>
                  <UploadIcon /> Upload
                </Button>
              )}
            </div>
          </div>

          {uploads.items.length > 0 && <UploadQueue items={uploads.items} onDismiss={uploads.dismiss} className="sm:grid-cols-2 xl:grid-cols-3" />}

          {list.error ? (
            <EmptyState compact illustration="media" title="The library didn't load" description={list.error} actions={<Button variant="outline" className="rounded-full" onClick={list.reload}>Try again</Button>} />
          ) : list.items.length === 0 && !list.loading ? (
            <EmptyState
              illustration={q ? "search" : "media"}
              title={q ? `Nothing matches “${q}”` : filter === "cutout" ? "No cutouts yet" : filter === "video" ? "No videos yet" : "Nothing here yet"}
              description={
                filter === "cutout" && !q
                  ? bg.available
                    ? "Open a product photo and choose “Remove background” — it runs right here in your browser."
                    : "Upload transparent PNGs, or enable local AI to cut out product photos in one click."
                  : "Try another filter or search."
              }
            />
          ) : (
            <div className={cn("grid grid-cols-2 gap-3 transition-opacity duration-300 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6", list.loading && "opacity-60")}>
              {list.items.map((a, i) => (
                <div key={a.id} className="adm-rise grid min-w-0 grid-cols-1 gap-2" style={{ ["--i" as string]: Math.min(i, 14) }}>
                  <AssetTile
                    asset={a}
                    onClick={() => setDetail(a)}
                    overlay={
                      canWrite && (
                        <div className="absolute end-2 top-2 opacity-0 transition-opacity duration-200 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100">
                          <TileMenu
                            asset={a}
                            bgAvailable={bg.available}
                            bgReason={bg.reason}
                            working={bg.working === a.id}
                            onDetails={() => setDetail(a)}
                            onRemoveBg={() => removeBg(a)}
                          />
                        </div>
                      )
                    }
                  />
                  <div className="flex items-center justify-between gap-2 px-1 text-[0.72rem] text-muted-foreground">
                    <span className="truncate" title={a.originalName ?? undefined}>
                      {a.originalName ?? `${a.kind} ${a.id.slice(0, 6)}`}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {a.width}×{a.height}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {list.hasMore && !list.error && (
            <div className="flex justify-center">
              <Button variant="outline" className="rounded-full px-5" onClick={list.loadMore} disabled={list.loading}>
                {list.loading && <Loader2Icon className="animate-spin" />}
                Load more · {int(list.total - list.items.length)} left
              </Button>
            </div>
          )}
        </>
      )}

      <AssetDetails
        asset={detail}
        onClose={() => setDetail(null)}
        canWrite={canWrite}
        bg={bg}
        onRemoveBg={removeBg}
        onDelete={remove}
        setAlt={setAlt}
        usage={usage}
        onAltSaved={(id, alt) => {
          list.mutate((items) => items.map((i) => (i.id === id ? { ...i, tags: [...i.tags.filter((t) => !t.startsWith("alt:")), ...(alt ? [`alt:${alt}`] : [])] } : i)));
          setDetail((d) => (d && d.id === id ? { ...d, tags: [...d.tags.filter((t) => !t.startsWith("alt:")), ...(alt ? [`alt:${alt}`] : [])] } : d));
        }}
        onFocalSaved={(id, focal) => {
          const retag = (tags: string[]) => withFocalTag(tags, focal);
          list.mutate((items) => items.map((i) => (i.id === id ? { ...i, tags: retag(i.tags) } : i)));
          setDetail((d) => (d && d.id === id ? { ...d, tags: retag(d.tags) } : d));
        }}
        onOpenAsset={setDetail}
      />

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-8 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="adm-surface adm-aurora flex w-full max-w-lg flex-col items-center gap-3 p-12 text-center ring-2 ring-brand/40"
            >
              <ImageUpIcon className="relative z-10 size-8 text-brand" />
              <span className="relative z-10 text-lg font-semibold">Drop to add to your library</span>
              <span className="relative z-10 text-sm text-muted-foreground">Images and short videos, optimized automatically</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TileMenu({
  asset,
  bgAvailable,
  bgReason,
  working,
  onDetails,
  onRemoveBg,
}: {
  asset: MediaAsset;
  bgAvailable: boolean;
  bgReason: string | null;
  working: boolean;
  onDetails: () => void;
  onRemoveBg: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="secondary" className="adm-glass rounded-full" aria-label="File actions">
          {working ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
        <DropdownMenuItem onSelect={onDetails}>
          <PencilLineIcon /> Details & alt text
        </DropdownMenuItem>
        {asset.kind === "image" && !asset.alpha && (
          <DropdownMenuItem onSelect={onRemoveBg} disabled={!bgAvailable || working} title={bgReason ?? undefined}>
            <WandSparklesIcon /> Remove background
          </DropdownMenuItem>
        )}
        {asset.url && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={asset.url} target="_blank" rel="noopener noreferrer">
                <ArrowUpRightIcon /> Open full size
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssetDetails({
  asset,
  onClose,
  canWrite,
  bg,
  onRemoveBg,
  onDelete,
  setAlt,
  usage,
  onAltSaved,
  onFocalSaved,
  onOpenAsset,
}: {
  asset: MediaAsset | null;
  onClose: () => void;
  canWrite: boolean;
  bg: ReturnType<typeof useRemoveBackground>;
  onRemoveBg: (a: MediaAsset) => Promise<void>;
  onDelete: (a: MediaAsset, force: boolean) => Promise<boolean | MediaInUseError>;
  setAlt: MediaLibraryProps["setAlt"];
  usage: MediaLibraryProps["usage"];
  onAltSaved: (id: string, alt: string) => void;
  onFocalSaved: (id: string, focal: FocalPoint | null) => void;
  onOpenAsset: (a: MediaAsset) => void;
}) {
  const [alt, setAltDraft] = useState("");
  const [altFor, setAltFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [related, setRelated] = useState<{ id: string; items: MediaAsset[] } | null>(null);
  const [used, setUsed] = useState<{ id: string; usage: AssetUsage | null } | null>(null);
  // the server refused a delete: live pages (or the store logo) show the file — it needs a second confirm
  const [refused, setRefused] = useState<{ id: string; usage: AssetUsage } | null>(null);

  if (asset && altFor !== asset.id) {
    setAltFor(asset.id);
    setAltDraft(altOf(asset));
  }

  const assetId = asset?.id;
  const cutoutSource = asset && !asset.alpha && asset.kind === "image" ? asset.id : null;

  // cutouts made from this photo
  useEffect(() => {
    if (!cutoutSource) return;
    const ctrl = new AbortController();
    fetchMedia({ filter: "cutout", q: "", page: 1, pageSize: 12, sourceAssetId: cutoutSource, signal: ctrl.signal })
      .then((r) => setRelated({ id: cutoutSource, items: r.items }))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [cutoutSource]);

  // pages using this file (usage null = it couldn't be checked)
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    usage(assetId).then(
      (res) => {
        if (!cancelled) setUsed({ id: assetId, usage: res.ok ? res.data : null });
      },
      () => {
        if (!cancelled) setUsed({ id: assetId, usage: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [assetId, usage]);

  const cutouts = related && asset && related.id === asset.id ? related.items : [];
  const usageNow = used && asset && used.id === asset.id ? used : null;
  const refusedNow = refused && asset && refused.id === asset.id ? refused.usage : null;
  // the server's answer is fresher than the usage loaded when the sheet opened
  const deleteUsage = refusedNow ? mergeUsage(usageNow?.usage ?? null, refusedNow) : (usageNow?.usage ?? null);
  const livePages = deleteUsage?.pages.filter((p) => p.live).length ?? 0;
  /** the dialog already told the admin what the file is used for: the delete may override the guard */
  const usageConfirmed = !!refusedNow || livePages > 0 || !!deleteUsage?.storeLogo;
  const saved = asset ? altOf(asset) : "";

  return (
    <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 duration-300 sm:max-w-[30rem]">
        {asset && (
          <>
            <SheetHeader className="border-b border-border/70 p-5 pe-14">
              <SheetTitle className="truncate">{asset.originalName ?? "Untitled file"}</SheetTitle>
              <SheetDescription>
                {asset.kind === "video" ? "Video" : asset.alpha ? "Transparent cutout" : "Photo"} · {asset.width}×{asset.height} · {bytes(asset.bytes)}
              </SheetDescription>
            </SheetHeader>
            <div className="adm-scroll grid flex-1 content-start gap-5 overflow-y-auto p-5">
              {asset.kind === "video" ? (
                <div
                  className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06] ring-inset"
                  style={{ backgroundColor: `color-mix(in oklab, ${asset.dominant} 30%, var(--muted))` }}
                >
                  <video src={asset.url ?? undefined} controls muted playsInline className="max-h-full max-w-full" />
                </div>
              ) : (
                <AssetFraming key={asset.id} asset={asset} canWrite={canWrite} onSaved={onFocalSaved} />
              )}

              {asset.kind === "image" && (
                <form
                  className="grid gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSaving(true);
                    try {
                      const res = await runAction(setAlt(asset.id, alt), { success: "Alt text saved" });
                      if (res) onAltSaved(asset.id, res.alt);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <label htmlFor="asset-alt" className="text-sm font-medium">
                    Alt text
                  </label>
                  <Textarea
                    id="asset-alt"
                    value={alt}
                    onChange={(e) => setAltDraft(e.target.value)}
                    maxLength={200}
                    rows={2}
                    disabled={!canWrite}
                    placeholder="e.g. Amber glass bottle of argan oil on a stone tray"
                    className="resize-none rounded-xl"
                  />
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Describes the image for screen readers and search. Pre-fills pages that use it.</span>
                    {canWrite && (
                      <Button type="submit" size="sm" className="shrink-0 rounded-full" disabled={saving || alt.trim() === saved}>
                        {saving && <Loader2Icon className="animate-spin" />}
                        Save
                      </Button>
                    )}
                  </div>
                </form>
              )}

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Meta label="Dimensions" value={`${asset.width} × ${asset.height}`} />
                <Meta label="Size" value={bytes(asset.bytes)} />
                <Meta label="Renditions" value={asset.variants.length ? `${asset.variants.length} (WebP${asset.variants.some((v) => v.fmt === "avif") ? " + AVIF" : ""})` : "Original file"} />
                <Meta label="Uploaded" value={dateTime(asset.createdAt)} />
                <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl bg-foreground/[0.03] px-3 py-2 ring-1 ring-foreground/[0.05] ring-inset">
                  <span className="flex items-center gap-2">
                    <span className="size-5 rounded-md ring-1 ring-foreground/10" style={{ background: asset.dominant }} />
                    <span className="text-muted-foreground">Dominant color</span>
                  </span>
                  <span className="flex items-center gap-1 font-mono text-xs uppercase">
                    {asset.dominant}
                    <CopyButton value={asset.dominant} label="Copy color" toastMessage="Color copied" size="icon-xs" />
                  </span>
                </div>
              </dl>

              <UsageList state={usageNow} />

              {cutouts.length > 0 && (
                <section className="grid gap-2">
                  <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Cutouts of this photo</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {cutouts.map((c) => (
                      <AssetTile key={c.id} asset={c} onClick={() => onOpenAsset(c)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-5 py-3">
                <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon /> Delete
                </Button>
                {asset.kind === "image" && !asset.alpha && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" className="rounded-full" disabled={!bg.available || bg.working === asset.id} onClick={() => onRemoveBg(asset)}>
                          {bg.working === asset.id ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
                          Remove background
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {bg.reason && <TooltipContent>{bg.reason}</TooltipContent>}
                  </Tooltip>
                )}
              </div>
            )}
            {confirmDelete && (
              <ConfirmDialog
                open
                onOpenChange={(o) => !o && setConfirmDelete(false)}
                destructive
                icon={<Trash2Icon />}
                title={livePages ? `Delete a file used on ${livePages === 1 ? "a live page" : `${livePages} live pages`}?` : "Delete this file?"}
                description={deleteWarning(deleteUsage, livePages)}
                confirmLabel={refusedNow ? "Delete anyway" : "Delete file"}
                pendingLabel="Deleting…"
                onConfirm={async () => {
                  const res = await onDelete(asset, usageConfirmed);
                  if (!(res instanceof MediaInUseError)) return res;
                  // published (or set as logo) since the sheet opened: show what changed, keep the dialog open
                  setRefused({
                    id: asset.id,
                    usage: { pages: res.livePages.map((p) => ({ ...p, inDraft: false, live: true })), storeLogo: res.storeLogo },
                  });
                  return false;
                }}
              >
                {refusedNow && (
                  <p role="status" className="-mt-2 rounded-xl bg-warn/10 px-3.5 py-2.5 text-sm leading-relaxed text-warn-ink ring-1 ring-warn/40 ring-inset">
                    {refusedNow.pages.length
                      ? `Live right now on ${refusedNow.pages
                          .slice(0, 3)
                          .map((p) => p.name)
                          .join(", ")}${refusedNow.pages.length > 3 ? ` and ${refusedNow.pages.length - 3} more` : ""}.`
                      : "It's your store logo, shown on every live page."}
                  </p>
                )}
              </ConfirmDialog>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Usage loaded with the sheet, updated with the live pages the server just reported. */
function mergeUsage(loaded: AssetUsage | null, server: AssetUsage): AssetUsage {
  // drafts stay listed; "live" now comes from the server alone
  const byId = new Map((loaded?.pages ?? []).filter((p) => p.inDraft).map((p) => [p.id, { ...p, live: false }]));
  for (const p of server.pages) byId.set(p.id, { ...(byId.get(p.id) ?? p), live: true });
  return {
    pages: [...byId.values()].sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name)),
    storeLogo: server.storeLogo,
  };
}

/** What deleting means for the pages that use the file (null usage = unknown). */
function deleteWarning(usage: AssetUsage | null, live: number): string {
  const kept = "Cutouts made from it are kept.";
  if (!usage) return `It's removed from the library and the server. Pages that use it show an empty image spot until you pick another one. ${kept}`;
  const drafts = usage.pages.length - live;
  if (!usage.pages.length && !usage.storeLogo) return `No page uses it. It's removed from the library and the server. ${kept}`;
  const parts = [
    live ? `${live} live page${live === 1 ? "" : "s"} will show an empty image spot right away` : null,
    drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"} will need another image` : null,
    usage.storeLogo ? "your store loses its logo" : null,
  ].filter(Boolean);
  const sentence = parts.join(", ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. ${kept}`;
}

/** "Used in" list of the details sheet: the store logo and pages (live ones first). */
function UsageList({ state }: { state: { usage: AssetUsage | null } | null }) {
  const usage = state?.usage;
  const storeView = useStore();
  return (
    <section className="grid gap-2" aria-live="polite">
      <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Used in</h3>
      {!state ? (
        <div className="adm-shimmer h-7 w-2/3 rounded-full" />
      ) : !usage ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t check which pages use this file.</p>
      ) : usage.pages.length === 0 && !usage.storeLogo ? (
        <p className="text-sm text-muted-foreground">No page uses this file yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {usage.storeLogo && (
            <li>
              <Link href={storeView.href("/settings/general")} className="inline-flex h-7 items-center rounded-full bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-foreground/[0.09]">
                Store logo
              </Link>
            </li>
          )}
          {usage.pages.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link
                href={storeView.href(`/pages?focus=${p.id}`)}
                title={`${storeView.livePath(p.slug)}${p.live ? " · live" : ""}`}
                className="inline-flex h-7 max-w-[16rem] items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 text-xs font-medium transition-colors hover:bg-foreground/[0.09]"
              >
                {p.live && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
                <span className="truncate">{p.name}</span>
                {p.live && <span className="sr-only">(live)</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-foreground/[0.03] px-3 py-2 ring-1 ring-foreground/[0.05] ring-inset">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}
