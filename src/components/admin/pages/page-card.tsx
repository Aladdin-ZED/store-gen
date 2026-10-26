"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowUpRightIcon,
  CloudOffIcon,
  CopyPlusIcon,
  EyeIcon,
  GlobeIcon,
  HomeIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PackageOpenIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadCloudIcon,
} from "lucide-react";
import Link from "next/link";
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StoreInfo } from "@/landing/context";
import type { PageListItem } from "@/lib/admin-data/pages";
import { cn } from "@/lib/utils";
import { CopyButton } from "../common/copy-button";
import { StatusChip } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { compact } from "../lib/format";
import { PAGE_STATUS_META } from "../lib/status";
import { LivePixelChips } from "./page-pixels";
import type { LivePagePixels } from "@/lib/pixels/actions";
import { useStore } from "../shell/store-context";

export type PageAction = "edit" | "preview" | "publish" | "unpublish" | "home" | "home-auto" | "duplicate" | "export" | "archive" | "restore" | "delete" | "copy-link";

export interface PagePermissions {
  write: boolean;
  publish: boolean;
  export: boolean;
}

const ARCH_LABEL: Record<string, string> = {
  maison: "Maison",
  apothecary: "Apothecary",
  souk: "Souk",
  playground: "Playground",
  kinetic: "Kinetic",
  circuit: "Circuit",
  hearth: "Hearth",
  bloom: "Bloom",
  field: "Field",
  editorial: "Editorial",
  garage: "Garage",
};

/** The builder of one of the store's pages: "/app/<h>/pages/<id>/edit". */
export function editHref(store: { href(path: `/${string}`): string }, id: string) {
  return store.href(`/pages/${id}/edit`);
}

/** Page tile: live thumbnail, status, address, 7-day numbers and every page action. */
export function PageCard({
  page,
  assets,
  store,
  liveUrl,
  can,
  focused,
  busy,
  onAction,
  style,
  livePixels,
}: {
  page: PageListItem;
  /** what the live version fires (live pages; undefined while loading) */
  livePixels?: { live: LivePagePixels | undefined; labels: Record<string, string> };
  assets: PreviewAssets;
  store?: StoreInfo;
  liveUrl: string;
  can: PagePermissions;
  focused?: boolean;
  busy?: boolean;
  onAction: (action: PageAction, page: PageListItem) => void;
  style?: React.CSSProperties;
}) {
  const storeView = useStore();
  const meta = PAGE_STATUS_META[page.status] ?? PAGE_STATUS_META.draft!;
  const live = page.status === "published";
  const archived = page.status === "archived";
  const accent = page.doc?.theme.palette.accent;
  const pop = page.doc?.theme.palette.pop;

  return (
    <article
      id={`page-${page.id}`}
      style={style}
      className={cn(
        "adm-surface adm-lift adm-rise group/card relative flex flex-col overflow-hidden p-2",
        focused && "ring-2 ring-brand ring-offset-2 ring-offset-background",
        busy && "pointer-events-none opacity-60",
        archived && "saturate-[0.6]",
      )}
      aria-busy={busy || undefined}
    >
      <div className="relative overflow-hidden rounded-[14px] bg-muted">
        {page.doc ? (
          <LandingThumbnail
            doc={page.doc}
            assets={assets}
            store={store}
            device="mobile"
            sections={3}
            aspectRatio="4 / 5"
            className="transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover/card:scale-[1.025]"
            label={`Preview of ${page.name}`}
          />
        ) : (
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 p-6 text-center">
            <TriangleAlertIcon className="size-5 text-warn-ink" />
            <p className="text-sm font-medium">This draft can&apos;t be rendered</p>
            <p className="text-xs text-muted-foreground">Open it in the builder to fix it.</p>
          </div>
        )}

        {/* chips over the picture */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <StatusChip tone={meta.tone} pulse={live} className="adm-glass shadow-none ring-0">
            {meta.label}
          </StatusChip>
          <span className="flex items-center gap-1.5">
            {page.unpublishedChanges && (
              <span className="adm-glass inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.68rem] font-medium text-warn-ink">
                <span className="size-1.5 rounded-full bg-warn" />
                Unpublished edits
              </span>
            )}
            {page.isHome && (
              <span className="adm-glass inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.68rem] font-medium" title="Shown at your domain's root">
                <HomeIcon className="size-3" />
                Home
              </span>
            )}
          </span>
        </div>

        {/* quick actions on hover / focus */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-2 bg-gradient-to-t from-black/45 via-black/10 to-transparent p-3 pt-12 opacity-0 transition-opacity duration-300 group-focus-within/card:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
          {page.doc && (
            <Button size="sm" variant="secondary" className="adm-glass h-8 rounded-full px-3 text-foreground" onClick={() => onAction("preview", page)}>
              <EyeIcon /> Preview
            </Button>
          )}
          {can.write && !archived && (
            <Button asChild size="sm" className="h-8 rounded-full px-3 shadow-lg">
              <Link href={editHref(storeView, page.id)}>
                <PencilIcon /> Edit
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2.5 px-2 pt-3 pb-1.5">
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h3 className="truncate text-[0.95rem] leading-snug font-semibold tracking-[-0.01em]" title={page.name}>
              {page.name}
            </h3>
            <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate font-mono">{storeView.livePath(page.slug)}</span>
              <CopyButton value={liveUrl} label="Copy page link" toastMessage="Page link copied" size="icon-xs" className="-my-1 text-muted-foreground" />
            </div>
            {live && livePixels ? <LivePixelChips live={livePixels.live} labels={livePixels.labels} className="mt-1" /> : null}
          </div>
          <PageMenu page={page} can={can} onAction={onAction} liveUrl={liveUrl} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-3 tabular-nums">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <strong className="font-semibold text-foreground">{compact(page.week.uniques)}</strong> visitors
                </span>
              </TooltipTrigger>
              <TooltipContent>Unique visitors, last 7 days</TooltipContent>
            </Tooltip>
            <span>
              <strong className="font-semibold text-foreground">{compact(page.week.orders)}</strong> orders
            </span>
          </span>
          <span className="flex items-center gap-2">
            {(accent || pop) && (
              <span className="flex -space-x-1" title={page.archetype ? `${ARCH_LABEL[page.archetype] ?? page.archetype} direction` : undefined}>
                {[accent, pop].filter(Boolean).map((c) => (
                  <span key={c} className="size-3 rounded-full ring-2 ring-card" style={{ background: c }} />
                ))}
              </span>
            )}
            <RelativeTime iso={page.updatedAt} />
          </span>
        </div>
      </div>
    </article>
  );
}

function PageMenu({ page, can, onAction, liveUrl }: { page: PageListItem; can: PagePermissions; onAction: (a: PageAction, p: PageListItem) => void; liveUrl: string }) {
  const storeView = useStore();
  const live = page.status === "published";
  const archived = page.status === "archived";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="-me-1 shrink-0 rounded-full text-muted-foreground data-open:bg-muted" aria-label={`Actions for ${page.name}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
        {can.write && !archived && (
          <DropdownMenuItem asChild>
            <Link href={editHref(storeView, page.id)}>
              <PencilIcon /> Edit in builder
            </Link>
          </DropdownMenuItem>
        )}
        {page.doc && (
          <DropdownMenuItem onSelect={() => onAction("preview", page)}>
            <EyeIcon /> Preview draft
          </DropdownMenuItem>
        )}
        {live && (
          <DropdownMenuItem asChild>
            <a href={liveUrl} target="_blank" rel="noopener noreferrer">
              <ArrowUpRightIcon /> Open live page
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onAction("copy-link", page)}>
          <LinkIcon /> Copy link
        </DropdownMenuItem>

        {can.publish && !archived && (
          <>
            <DropdownMenuSeparator />
            {(!live || page.unpublishedChanges) && (
              <DropdownMenuItem onSelect={() => onAction("publish", page)}>
                {live ? <UploadCloudIcon /> : <GlobeIcon />} {live ? "Publish changes" : "Publish"}
              </DropdownMenuItem>
            )}
            {live && !page.isHome && (
              <DropdownMenuItem onSelect={() => onAction("home", page)}>
                <HomeIcon /> Set as home page
              </DropdownMenuItem>
            )}
            {page.isHome && (
              <DropdownMenuItem onSelect={() => onAction("home-auto", page)}>
                <HomeIcon /> Stop using as home page
              </DropdownMenuItem>
            )}
            {live && (
              <DropdownMenuItem onSelect={() => onAction("unpublish", page)}>
                <CloudOffIcon /> Unpublish
              </DropdownMenuItem>
            )}
          </>
        )}

        {(can.write || can.export) && <DropdownMenuSeparator />}
        {can.write && (
          <DropdownMenuItem onSelect={() => onAction("duplicate", page)}>
            <CopyPlusIcon /> Duplicate
          </DropdownMenuItem>
        )}
        {can.export && !archived && (
          <DropdownMenuItem onSelect={() => onAction("export", page)}>
            <PackageOpenIcon /> Export as site…
          </DropdownMenuItem>
        )}
        {can.write && (
          <>
            <DropdownMenuSeparator />
            {archived ? (
              <DropdownMenuItem onSelect={() => onAction("restore", page)}>
                <ArchiveRestoreIcon /> Restore from archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onAction("archive", page)}>
                <ArchiveIcon /> Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete", page)}>
              <Trash2Icon /> Delete…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
