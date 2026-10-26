"use client";

import { ArrowUpRightIcon, CopyPlusIcon, EyeIcon, HistoryIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon, SparklesIcon, StarIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StoreInfo } from "@/landing/context";
import type { VersionItem, VersionKind } from "@/lib/admin-data/history";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { EmptyState } from "../common/empty-state";
import { Pager } from "../common/pager";
import { Segmented } from "../common/segmented";
import { StatusChip } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { runAction, type ActionResult } from "../lib/action-result";
import { useStore } from "../shell/store-context";
import { dateTime } from "../lib/format";
import { VERSION_KIND_META } from "../lib/status";
import { useQueryState } from "../lib/use-query-state";
import { PagePreviewDialog } from "../on-demand";

export interface HistoryActions {
  star: (id: string, starred: boolean) => Promise<ActionResult<null>>;
  restore: (id: string) => Promise<ActionResult<{ pageId: string }>>;
  duplicate: (id: string) => Promise<ActionResult<{ id: string; slug: string }>>;
}

const KIND_FILTERS: { value: VersionKind | "all" | "starred"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "generation", label: "Generated" },
  { value: "publish", label: "Published" },
  { value: "save", label: "Saved" },
  { value: "restore", label: "Restored" },
  { value: "import", label: "Copied" },
  { value: "autosave", label: "Autosaved" },
  { value: "starred", label: "Starred" },
];

/** Calendar day "YYYY-MM-DD" of an instant in the store's time zone. */
function dayIn(t: number | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** Group label for a version date (store time zone, identical on server and client). */
function dayGroup(iso: string, now: number, timeZone: string): string {
  const diff = Math.round((Date.parse(dayIn(now, timeZone)) - Date.parse(dayIn(iso, timeZone))) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone }).format(new Date(iso));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso));
}

export function HistoryView({
  items,
  total,
  page,
  pageSize,
  counts,
  pages,
  assets,
  store,
  canWrite,
  actions,
  now,
  timeZone,
}: {
  items: VersionItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  pages: { id: string; name: string }[];
  assets: PreviewAssets;
  store?: StoreInfo;
  canWrite: boolean;
  actions: HistoryActions;
  /** server time and store time zone, so day groups match on both sides */
  now: number;
  timeZone: string;
}) {
  const router = useRouter();
  const storeView = useStore();
  const query = useQueryState();
  const kind = query.get("starred") ? "starred" : query.get("kind") || "all";
  const pageId = query.get("page_id");
  const [preview, setPreview] = useState<VersionItem | null>(null);
  const [restoring, setRestoring] = useState<VersionItem | null>(null);
  const [, startTransition] = useTransition();
  const [stars, setStar] = useOptimistic(
    useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.starred])) as Record<string, boolean>, [items]),
    (state, change: { id: string; starred: boolean }) => ({ ...state, [change.id]: change.starred }),
  );

  const groups = useMemo(() => {
    const out: { label: string; items: VersionItem[] }[] = [];
    for (const it of items) {
      const label = dayGroup(it.createdAt, now, timeZone);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  }, [items, now, timeZone]);

  const toggleStar = (v: VersionItem) => {
    const next = !stars[v.id];
    startTransition(async () => {
      setStar({ id: v.id, starred: next });
      await runAction(actions.star(v.id, next), { success: next ? "Starred — find it under Starred" : undefined });
      router.refresh();
    });
  };

  const duplicate = async (v: VersionItem) => {
    const res = await runAction(actions.duplicate(v.id), { success: "New draft page created from this version" });
    if (res) router.push(storeView.href(`/pages?focus=${res.id}`));
  };

  const filtered = kind !== "all" || !!pageId;

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* one row when both fit; the page filter wraps below instead of the kinds scrolling out of view */}
      <div className="adm-rise flex flex-wrap items-center justify-between gap-3" style={{ ["--i" as string]: 2 }}>
        <Segmented
          label="Filter versions"
          value={kind as VersionKind | "all" | "starred"}
          onChange={(v) => query.set({ kind: v === "all" || v === "starred" ? null : v, starred: v === "starred" ? 1 : null })}
          options={KIND_FILTERS.map((f) => ({
            ...f,
            count: f.value === "all" ? undefined : counts[f.value],
            icon: f.value === "starred" ? <StarIcon /> : undefined,
          }))}
        />
        <Select value={pageId || "all"} onValueChange={(v) => query.set({ page_id: v === "all" ? null : v })}>
          <SelectTrigger className="h-9 w-full rounded-full sm:w-64" aria-label="Filter by page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80 rounded-xl" align="end">
            <SelectItem value="all">All pages</SelectItem>
            {pages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        filtered ? (
          <EmptyState
            illustration="search"
            title={kind === "starred" ? "Nothing starred yet" : "No versions match"}
            description={kind === "starred" ? "Star the generations you love — they're kept handy here." : "Try another filter or page."}
            actions={
              <button type="button" onClick={() => query.set({ kind: null, starred: null, page_id: null })} className="text-sm font-medium text-brand hover:underline">
                Show everything
              </button>
            }
          />
        ) : (
          <EmptyState
            illustration="history"
            title="Your history starts with the first generation"
            description="Every generated direction, save, publish and restore is kept here. Go back to any of them, or start a new page from one."
            actions={
              canWrite ? (
                <Button asChild variant="brand" className="h-10 rounded-full px-5">
                  <Link href={storeView.href("/generate")}>
                    <SparklesIcon />
                    Generate a page
                  </Link>
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className={cn("grid grid-cols-1 gap-10 transition-opacity duration-300", query.pending && "opacity-60")}>
          {groups.map((g, gi) => (
            <section key={g.label} aria-label={g.label} className="grid grid-cols-1 gap-4">
              <div className="adm-fade sticky top-14 z-10 -mx-2 flex items-center gap-3 px-2 py-1" style={{ ["--i" as string]: gi + 3 }}>
                <h2 className="adm-glass rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground">{g.label}</h2>
                <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent rtl:bg-gradient-to-l" />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {g.items.map((v, i) => (
                  <VersionCard
                    key={v.id}
                    v={v}
                    starred={!!stars[v.id]}
                    assets={assets}
                    store={store}
                    canWrite={canWrite}
                    onStar={() => toggleStar(v)}
                    onPreview={() => setPreview(v)}
                    onRestore={() => setRestoring(v)}
                    onDuplicate={() => duplicate(v)}
                    style={{ ["--i" as string]: Math.min(i, 8) + gi + 3 }}
                  />
                ))}
              </div>
            </section>
          ))}
          <Pager page={page} pageSize={pageSize} total={total} onPage={(p) => query.set({ page: p > 1 ? p : null }, { resetPage: false, scroll: true })} noun="versions" />
        </div>
      )}

      {preview?.doc && (
        <PagePreviewDialog
          open
          onOpenChange={(o) => !o && setPreview(null)}
          title={`${preview.pageName} · ${VERSION_KIND_META[preview.kind]?.label ?? preview.kind} ${dateTime(preview.createdAt)}`}
          doc={preview.doc}
          assets={assets}
          store={store}
        />
      )}

      {restoring && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRestoring(null)}
          icon={<RotateCcwIcon />}
          title="Restore this version?"
          description={`It becomes the draft of “${restoring.pageName}”. The current draft is kept under Autosaved (“Before restore”), and the live page doesn't change until you publish.`}
          confirmLabel="Restore & open"
          pendingLabel="Restoring…"
          onConfirm={async () => {
            const res = await runAction(actions.restore(restoring.id), { success: "Version restored as the draft" });
            if (res) router.push(storeView.href(`/pages/${res.pageId}/edit`));
            return !!res;
          }}
        />
      )}
    </div>
  );
}

function VersionCard({
  v,
  starred,
  assets,
  store,
  canWrite,
  onStar,
  onPreview,
  onRestore,
  onDuplicate,
  style,
}: {
  v: VersionItem;
  starred: boolean;
  assets: PreviewAssets;
  store?: StoreInfo;
  canWrite: boolean;
  onStar: () => void;
  onPreview: () => void;
  onRestore: () => void;
  onDuplicate: () => Promise<void>;
  style?: React.CSSProperties;
}) {
  const meta = VERSION_KIND_META[v.kind] ?? { label: v.kind, tone: "neutral" as const };
  const storeView = useStore();
  const [copying, setCopying] = useState(false);
  return (
    <article className="adm-surface adm-lift adm-rise group/card flex flex-col overflow-hidden p-2" style={style}>
      <div className="relative overflow-hidden rounded-[14px] bg-muted">
        {v.doc ? (
          <button type="button" onClick={onPreview} className="block w-full cursor-zoom-in" aria-label={`Preview ${v.pageName}, ${meta.label} ${dateTime(v.createdAt)}`}>
            <LandingThumbnail doc={v.doc} assets={assets} store={store} device="mobile" sections={3} aspectRatio="4 / 5" className="transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover/card:scale-[1.025]" />
          </button>
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center p-6 text-center text-xs text-muted-foreground">This version can&apos;t be rendered anymore.</div>
        )}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <span className="flex gap-1.5">
            <StatusChip tone={meta.tone} className="adm-glass ring-0">
              {meta.label}
            </StatusChip>
            {v.live && (
              <StatusChip tone="green" pulse className="adm-glass ring-0">
                Live now
              </StatusChip>
            )}
          </span>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={onStar}
            aria-pressed={starred}
            aria-label={starred ? "Unstar version" : "Star version"}
            className={cn(
              "adm-glass absolute end-2.5 top-2.5 flex size-8 items-center justify-center rounded-full transition-all duration-300",
              starred ? "text-warn-ink opacity-100" : "text-foreground/70 opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:text-warn-ink [@media(hover:none)]:opacity-100",
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={starred ? "on" : "off"}
                initial={{ scale: 0.4, rotate: -40, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 22 }}
                className="flex"
              >
                <StarIcon className={cn("size-4", starred && "fill-warn")} />
              </motion.span>
            </AnimatePresence>
          </button>
        )}
      </div>

      <div className="grid gap-2 px-2 pt-3 pb-1.5">
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h3 className="truncate text-[0.92rem] font-semibold tracking-[-0.01em]" title={v.pageName}>
              {v.pageName}
            </h3>
            <p className="truncate text-xs text-muted-foreground" title={v.label ?? undefined}>
              {v.label || `${v.productName} · ${v.sections} sections`}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-me-1 shrink-0 rounded-full text-muted-foreground" aria-label="Version actions">
                {copying ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
              {v.doc && (
                <DropdownMenuItem onSelect={onPreview}>
                  <EyeIcon /> Preview
                </DropdownMenuItem>
              )}
              {canWrite && v.pageStatus !== "archived" && (
                <DropdownMenuItem asChild>
                  <Link href={storeView.href(`/pages/${v.pageId}/edit`)}>
                    <PencilIcon /> Open page in builder
                  </Link>
                </DropdownMenuItem>
              )}
              {v.live && (
                <DropdownMenuItem asChild>
                  <a href={storeView.live(v.pageSlug)} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRightIcon /> Open live page
                  </a>
                </DropdownMenuItem>
              )}
              {canWrite && v.doc && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onRestore}>
                    <HistoryIcon /> Restore as draft…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async () => {
                      setCopying(true);
                      try {
                        await onDuplicate();
                      } finally {
                        setCopying(false);
                      }
                    }}
                  >
                    <CopyPlusIcon /> Duplicate as new page
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span className="truncate">{v.createdBy ? `by ${v.createdBy}` : v.archetype ? `${v.archetype} direction` : ""}</span>
          <RelativeTime iso={v.createdAt} />
        </div>
      </div>
    </article>
  );
}
