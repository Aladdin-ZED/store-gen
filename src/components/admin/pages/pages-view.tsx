"use client";

import { ArchiveIcon, GlobeIcon, HomeIcon, PlusIcon, RadarIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StoreInfo } from "@/landing/context";
import type { PageListItem, PageStatus } from "@/lib/admin-data/pages";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { writeClipboard } from "../common/copy-button";
import { EmptyState } from "../common/empty-state";
import { SearchField } from "../common/search-field";
import { Segmented } from "../common/segmented";
import { runAction, type ActionResult } from "../lib/action-result";
import { useQueryState } from "../lib/use-query-state";
import { useStore } from "../shell/store-context";
import { ExportDialog, PagePreviewDialog } from "../on-demand";
import { editHref, PageCard, type PageAction, type PagePermissions } from "./page-card";
import { livePageMissingPixels, useLivePixels } from "./page-pixels";

export interface PageActions {
  duplicate: (id: string) => Promise<ActionResult<{ id: string; slug: string }>>;
  publish: (id: string) => Promise<ActionResult<{ slug: string; warnings: number; skippedSections: number }>>;
  unpublish: (id: string) => Promise<ActionResult<null>>;
  setHome: (id: string | null) => Promise<ActionResult<null>>;
  archive: (id: string) => Promise<ActionResult<null>>;
  restore: (id: string) => Promise<ActionResult<null>>;
  remove: (id: string) => Promise<ActionResult<null>>;
}

type Confirm = { kind: "publish" | "unpublish" | "home" | "home-auto" | "archive" | "delete"; page: PageListItem } | null;

export function PagesView({
  pages,
  counts,
  assets,
  store,
  can,
  actions,
  focusId,
}: {
  pages: PageListItem[];
  counts: Record<PageStatus | "active", number>;
  assets: PreviewAssets;
  store?: StoreInfo;
  can: PagePermissions;
  actions: PageActions;
  focusId?: string;
}) {
  const router = useRouter();
  const storeView = useStore();
  const query = useQueryState();
  const status = (query.get("status") || "active") as PageStatus | "active";
  const sort = query.get("sort") || "updated";
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [preview, setPreview] = useState<PageListItem | null>(null);
  const [exporting, setExporting] = useState<PageListItem | null>(null);
  // live pixels per page (chips) and the "No pixel" filter: live pages with no ids and no "No pixel"
  const livePixels = useLivePixels();
  const noPixelOnly = query.get("pixels") === "none";
  const noPixelCount = useMemo(() => (livePixels ? pages.filter((p) => p.status === "published" && livePageMissingPixels(livePixels.pages[p.id])).length : 0), [pages, livePixels]);
  const shownPages = useMemo(
    () => (noPixelOnly && livePixels ? pages.filter((p) => p.status === "published" && livePageMissingPixels(livePixels.pages[p.id])) : pages),
    [pages, livePixels, noPixelOnly],
  );

  // the store's public address of a page (storeUrl: P mode "<origin>/s/<h>/<slug>", S mode "https://<h>.<root>/<slug>")
  const urlFor = (slug: string) => storeView.live(slug);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`page-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId]);

  const act = async <T,>(page: PageListItem, promise: Promise<ActionResult<T>>, success: string | ((d: T) => string)) => {
    setBusy(page.id);
    try {
      const data = await runAction(promise, { success });
      if (data !== undefined) router.refresh();
      return data !== undefined;
    } finally {
      setBusy(null);
    }
  };

  const onAction = async (action: PageAction, page: PageListItem) => {
    switch (action) {
      case "edit":
        router.push(editHref(storeView, page.id));
        return;
      case "preview":
        setPreview(page);
        return;
      case "copy-link":
        if (await writeClipboard(urlFor(page.slug))) toast.success("Page link copied");
        return;
      case "export":
        setExporting(page);
        return;
      case "duplicate":
        await act(page, actions.duplicate(page.id), "Copy created — it's a draft");
        return;
      case "restore":
        await act(page, actions.restore(page.id), "Back from the archive as a draft");
        return;
      case "publish":
      case "unpublish":
      case "home":
      case "home-auto":
      case "archive":
      case "delete":
        setConfirm({ kind: action, page });
        return;
    }
  };

  const filtersActive = !!query.get("q") || status !== "active" || noPixelOnly;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="adm-rise flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ ["--i" as string]: 2 }}>
        <Segmented
          label="Filter pages by status"
          value={status}
          onChange={(v) => query.set({ status: v === "active" ? null : v })}
          options={[
            { value: "active", label: "All", count: counts.active },
            { value: "published", label: "Live", count: counts.published },
            { value: "draft", label: "Drafts", count: counts.draft },
            { value: "archived", label: "Archived", count: counts.archived },
          ]}
        />
        <div className="flex items-center gap-2">
          {(noPixelCount > 0 || noPixelOnly) && (
            <button
              type="button"
              aria-pressed={noPixelOnly}
              onClick={() => query.set({ pixels: noPixelOnly ? null : "none" })}
              title="Live pages that send no ad events"
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-inset outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                noPixelOnly ? "bg-warn/15 text-warn-ink ring-warn/45" : "text-muted-foreground ring-foreground/10 hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <RadarIcon className="size-3.5" />
              No pixel
              <span className="tabular-nums opacity-80">{noPixelCount}</span>
            </button>
          )}
          <SearchField value={query.get("q")} onCommit={(q) => query.set({ q })} placeholder="Search pages" pending={query.pending} />
          <Select value={sort} onValueChange={(v) => query.set({ sort: v === "updated" ? null : v })}>
            <SelectTrigger className="h-9 w-[9.5rem] shrink-0 rounded-full" aria-label="Sort pages">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl" align="end">
              <SelectItem value="updated">Recently edited</SelectItem>
              <SelectItem value="orders">Most orders</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {shownPages.length === 0 ? (
        filtersActive ? (
          <EmptyState
            illustration="search"
            title="No pages match"
            description="Try another name or address, or clear the filters."
            actions={
              <button type="button" onClick={() => query.set({ q: null, status: null, pixels: null })} className="text-sm font-medium text-brand hover:underline">
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            illustration="pages"
            title="No pages yet"
            description="Generate your first landing page from a few product photos. It takes about a minute."
            actions={
              can.write ? (
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
        <div className={cn("grid grid-cols-1 gap-5 transition-opacity duration-300 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", query.pending && "opacity-60")}>
          {shownPages.map((page, i) => (
            <PageCard
              key={page.id}
              page={page}
              livePixels={livePixels ? { live: livePixels.pages[page.id], labels: livePixels.labels } : undefined}
              assets={assets}
              store={store}
              liveUrl={urlFor(page.slug)}
              can={can}
              focused={page.id === focusId}
              busy={busy === page.id}
              onAction={onAction}
              style={{ ["--i" as string]: Math.min(i, 10) + 3 }}
            />
          ))}
          {can.write && status === "active" && pages.length < 3 && (
            <Link
              href={storeView.href("/generate")}
              className="adm-surface-flat adm-aurora adm-rise group flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center transition-colors hover:bg-muted/70"
              style={{ ["--i" as string]: pages.length + 3 }}
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border transition-transform duration-500 ease-[cubic-bezier(.34,1.36,.64,1)] group-hover:scale-110 group-hover:rotate-6">
                <PlusIcon className="size-5 text-brand" />
              </span>
              <span className="grid gap-1">
                <span className="text-sm font-semibold">Generate another page</span>
                <span className="text-xs text-muted-foreground">New product, new art direction</span>
              </span>
            </Link>
          )}
        </div>
      )}

      {confirm && (
        <PageConfirm
          confirm={confirm}
          onClose={() => setConfirm(null)}
          run={async () => {
            const p = confirm.page;
            switch (confirm.kind) {
              case "publish":
                return act(p, actions.publish(p.id), (d) =>
                  d.skippedSections ? `Live at ${storeView.livePath(d.slug)} — ${d.skippedSections} section(s) were left out` : `Live at ${storeView.livePath(d.slug)}`,
                );
              case "unpublish":
                return act(p, actions.unpublish(p.id), "Page taken offline");
              case "home":
                return act(p, actions.setHome(p.id), "Home page updated");
              case "home-auto":
                return act(p, actions.setHome(null), "Home page set to automatic");
              case "archive":
                return act(p, actions.archive(p.id), "Page archived");
              case "delete":
                return act(p, actions.remove(p.id), "Page deleted");
            }
          }}
        />
      )}

      {preview?.doc && (
        <PagePreviewDialog
          open
          onOpenChange={(o) => !o && setPreview(null)}
          title={preview.name}
          doc={preview.doc}
          assets={assets}
          store={store}
          editHref={can.write && preview.status !== "archived" ? editHref(storeView, preview.id) : undefined}
          liveUrl={preview.status === "published" ? urlFor(preview.slug) : null}
        />
      )}

      {exporting && <ExportDialog pageId={exporting.id} open onOpenChange={(o: boolean) => !o && setExporting(null)} />}
    </div>
  );
}

function PageConfirm({ confirm, onClose, run }: { confirm: NonNullable<Confirm>; onClose: () => void; run: () => Promise<boolean> }) {
  const { page, kind } = confirm;
  const address = useStore().livePath(page.slug);
  const copy = {
    publish: {
      title: page.status === "published" ? `Publish changes to “${page.name}”?` : `Publish “${page.name}”?`,
      description:
        page.status === "published"
          ? `Visitors of ${address} will get the current draft right away. The previous version stays in History.`
          : `The page goes live at ${address} and starts accepting orders.`,
      label: page.status === "published" ? "Publish changes" : "Publish",
      pending: "Publishing…",
      icon: <GlobeIcon />,
      destructive: false,
    },
    unpublish: {
      title: `Take “${page.name}” offline?`,
      description: `${address} stops answering immediately and ads pointing to it will land on a 404. Your draft and versions are kept.`,
      label: "Unpublish",
      pending: "Unpublishing…",
      icon: <ArchiveIcon />,
      destructive: true,
    },
    home: {
      title: "Make this your home page?",
      description: `Visitors who open your domain without a path will see “${page.name}”.`,
      label: "Set as home",
      pending: "Saving…",
      icon: <HomeIcon />,
      destructive: false,
    },
    "home-auto": {
      title: `Stop using “${page.name}” as the home page?`,
      description: "Your domain's root will show your most recently published page instead. The page itself stays as it is.",
      label: "Use automatic",
      pending: "Saving…",
      icon: <HomeIcon />,
      destructive: false,
    },
    archive: {
      title: `Archive “${page.name}”?`,
      description: "It goes offline and leaves your main list. You can restore it from the Archived filter at any time.",
      label: "Archive",
      pending: "Archiving…",
      icon: <ArchiveIcon />,
      destructive: false,
    },
    delete: {
      title: `Delete “${page.name}” for good?`,
      description: "The page, all its versions and its analytics are removed. Orders it received are kept. This can't be undone.",
      label: "Delete page",
      pending: "Deleting…",
      icon: <Trash2Icon />,
      destructive: true,
    },
  }[kind];
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.label}
      pendingLabel={copy.pending}
      icon={copy.icon}
      destructive={copy.destructive}
      onConfirm={async () => {
        await run();
      }}
    />
  );
}
