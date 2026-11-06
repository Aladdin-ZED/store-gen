"use client";
/**
 * The pages list (P3 LANDING; landing.md LAN-§15.2, LAN-§4, LAN-§24.1; docs/STORE-SAAS.md §I.1, §I.8; screen 5 of the
 * R1 build order): rows with the 7-day vitals by default, the thumbnails grid on demand (`?layout=grid`), status
 * filters, search, sort by recency, orders, conversion or name, and every page action. Set as home is offered in
 * `landing` mode only; unpublishing the home page first asks where the address goes (another live page or the
 * "No page yet" page). The empty state is the table's own skeleton with one action.
 */
import { ArchiveIcon, GlobeIcon, HomeIcon, LayoutGridIcon, ListIcon, PlusIcon, RadarIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StoreInfo } from "@/landing/context";
import type { PageListItem, PageStatus } from "@/lib/admin-data/pages";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { writeClipboard } from "../common/copy-button";
import { EmptyState } from "../common/empty-state";
import { SearchField } from "../common/search-field";
import { Segmented } from "../common/segmented";
import { ConfirmSheet } from "../landing/confirm-sheet";
import type { ActionResult } from "../lib/action-result";
import { useQueryState } from "../lib/use-query-state";
import { ExportDialog, PagePreviewDialog } from "../on-demand";
import { useStore } from "../shell/store-context";
import { editHref, PageCard, type PageAction, type PagePermissions } from "./page-card";
import { livePageMissingPixels, useLivePixels } from "./page-pixels";
import { PageRowsSkeleton } from "./pages-skeleton";
import { NO_VITALS, PagesTable, type RowVitals } from "./pages-table";

export interface PageActions {
  duplicate: (id: string) => Promise<ActionResult<{ id: string; slug: string; inStoreMode: boolean }>>;
  publish: (id: string) => Promise<ActionResult<{ slug: string; warnings: number; skippedSections: number }>>;
  unpublish: (id: string, home?: string | null) => Promise<ActionResult<null>>;
  setHome: (id: string | null) => Promise<ActionResult<null>>;
  archive: (id: string) => Promise<ActionResult<null>>;
  restore: (id: string) => Promise<ActionResult<null>>;
  remove: (id: string) => Promise<ActionResult<null>>;
}

type ConfirmKind = "publish" | "unpublish" | "home" | "home-auto" | "archive" | "delete";
type Confirm = { kind: ConfirmKind; page: PageListItem } | null;
export type PagesSort = "updated" | "orders" | "conversion" | "name";

export function PagesView({
  pages,
  vitals,
  counts,
  assets,
  store,
  can,
  homeAllowed,
  actions,
  focusId,
}: {
  pages: PageListItem[];
  vitals: Record<string, RowVitals>;
  counts: Record<PageStatus | "active", number>;
  assets: PreviewAssets;
  store?: StoreInfo;
  can: PagePermissions;
  /** LAN-§4: Set as home exists in `landing` mode only */
  homeAllowed: boolean;
  actions: PageActions;
  focusId?: string;
}) {
  const t = useT();
  const router = useRouter();
  const storeView = useStore();
  const query = useQueryState();
  const status = (query.get("status") || "active") as PageStatus | "active";
  const sort = (query.get("sort") || "updated") as PagesSort;
  const layout = query.get("layout") === "grid" ? "grid" : "list";
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [preview, setPreview] = useState<PageListItem | null>(null);
  const [exporting, setExporting] = useState<PageListItem | null>(null);
  // live pixels per page (chips) and the "No pixel" filter: live pages with no ids and no "No pixel"
  const livePixels = useLivePixels();
  const noPixelOnly = query.get("pixels") === "none";
  const noPixelCount = useMemo(() => (livePixels ? pages.filter((p) => p.status === "published" && livePageMissingPixels(livePixels.pages[p.id])).length : 0), [pages, livePixels]);

  const shownPages = useMemo(() => {
    const list = noPixelOnly && livePixels ? pages.filter((p) => p.status === "published" && livePageMissingPixels(livePixels.pages[p.id])) : pages;
    if (sort !== "orders" && sort !== "conversion") return list;
    // the shown 7-day numbers decide; a rate hidden below n = 20 sorts after every measured one
    const v = (p: PageListItem) => vitals[p.id] ?? NO_VITALS;
    return [...list].sort((a, b) =>
      sort === "orders" ? v(b).orders - v(a).orders || v(b).views - v(a).views : (v(b).conversion ?? -1) - (v(a).conversion ?? -1) || v(b).orders - v(a).orders,
    );
  }, [pages, livePixels, noPixelOnly, sort, vitals]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`page-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId]);

  const failText = (res: Extract<ActionResult<unknown>, { ok: false }>) => (res.message ? t(res.message) : t("landing.common.failed"));

  /** Runs an action, toasts its answer and refreshes the list; false on a refusal (the sheet keeps its error). */
  const act = async <T,>(page: PageListItem, promise: Promise<ActionResult<T>>, success: (d: T) => string, onError?: (text: string) => void): Promise<boolean> => {
    setBusy(page.id);
    try {
      let res: ActionResult<T>;
      try {
        res = await promise;
      } catch {
        res = { ok: false, error: "network", message: "landing.common.network" };
      }
      if (!res.ok) {
        const text = failText(res);
        if (onError) onError(text);
        else toast.error(text);
        return false;
      }
      toast.success(success(res.data));
      router.refresh();
      return true;
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
        if (await writeClipboard(storeView.live(page.slug))) toast.success(t("landing.pages.toast.copied"));
        return;
      case "export":
        setExporting(page);
        return;
      case "duplicate":
        await act(page, actions.duplicate(page.id), (d) => t(d.inStoreMode ? "landing.pages.toast.inStoreMode" : "landing.pages.toast.duplicated"));
        return;
      case "restore":
        await act(page, actions.restore(page.id), () => t("landing.pages.toast.restored"));
        return;
      default:
        setConfirm({ kind: action, page });
    }
  };

  const filtersActive = !!query.get("q") || status !== "active" || noPixelOnly;
  const liveOthers = (id: string) => pages.filter((p) => p.status === "published" && p.id !== id);

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="adm-rise flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between" style={{ ["--i" as string]: 2 }}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented
            label={t("landing.pages.filter.label")}
            value={status}
            onChange={(v) => query.set({ status: v === "active" ? null : v })}
            options={[
              { value: "active", label: t("landing.pages.filter.all"), count: counts.active },
              { value: "published", label: t("landing.pages.filter.live"), count: counts.published },
              { value: "draft", label: t("landing.pages.filter.drafts"), count: counts.draft },
              { value: "archived", label: t("landing.pages.filter.archived"), count: counts.archived },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(noPixelCount > 0 || noPixelOnly) && (
            <button
              type="button"
              aria-pressed={noPixelOnly}
              onClick={() => query.set({ pixels: noPixelOnly ? null : "none" })}
              title={t("landing.pages.noPixel.hint")}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-inset outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                noPixelOnly ? "bg-warn/15 text-warn-ink ring-warn/45" : "text-muted-foreground ring-foreground/10 hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <RadarIcon className="size-3.5" />
              {t("landing.pages.noPixel")}
              <span className="tabular-nums opacity-80">{noPixelCount}</span>
            </button>
          )}
          <div className="min-w-0 flex-1 sm:flex-none">
            <SearchField value={query.get("q")} onCommit={(q) => query.set({ q })} placeholder={t("landing.pages.search")} label={t("landing.pages.search")} pending={query.pending} />
          </div>
          <Select value={sort} onValueChange={(v) => query.set({ sort: v === "updated" ? null : v })}>
            <SelectTrigger className="h-9 w-[10.5rem] shrink-0 rounded-full" aria-label={t("landing.pages.sort.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl" align="end">
              <SelectItem value="updated">{t("landing.pages.sort.updated")}</SelectItem>
              <SelectItem value="orders">{t("landing.pages.sort.orders")}</SelectItem>
              <SelectItem value="conversion">{t("landing.pages.sort.conversion")}</SelectItem>
              <SelectItem value="name">{t("landing.pages.sort.name")}</SelectItem>
            </SelectContent>
          </Select>
          <div role="group" aria-label={t("landing.pages.layout.label")} className="flex h-9 shrink-0 items-center rounded-full p-0.5 ring-1 ring-foreground/10 ring-inset">
            {(
              [
                ["list", ListIcon, "landing.pages.layout.list"],
                ["grid", LayoutGridIcon, "landing.pages.layout.grid"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                aria-label={t(label)}
                title={t(label)}
                onClick={() => query.set({ layout: value === "list" ? null : value })}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  layout === value ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {shownPages.length === 0 ? (
        filtersActive ? (
          <EmptyState
            illustration="search"
            title={t("landing.pages.noMatch.title")}
            description={t("landing.pages.noMatch.body")}
            actions={
              <button type="button" onClick={() => query.set({ q: null, status: null, pixels: null })} className="text-sm font-medium text-brand hover:underline">
                {t("landing.pages.clear")}
              </button>
            }
          />
        ) : (
          <div className="relative">
            <PageRowsSkeleton rows={4} still className="opacity-70 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]" />
            <div className="absolute inset-x-0 top-10 flex flex-col items-center gap-3 px-6 text-center">
              <h2 className="text-base font-semibold tracking-[-0.01em]">{t("landing.pages.empty.title")}</h2>
              <p className="max-w-sm text-sm text-pretty text-muted-foreground">{t("landing.pages.empty.body")}</p>
              {can.write && (
                <Button asChild variant="brand" className="mt-1 h-10 rounded-full px-5">
                  <Link href={storeView.href("/pages/new")}>
                    <SparklesIcon />
                    {t("landing.pages.empty.title")}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )
      ) : layout === "list" ? (
        <PagesTable pages={shownPages} vitals={vitals} can={can} homeAllowed={homeAllowed} focusId={focusId} busyId={busy} pending={query.pending} onAction={onAction} />
      ) : (
        <div className={cn("grid grid-cols-1 gap-5 transition-opacity duration-300 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", query.pending && "opacity-60")}>
          {shownPages.map((page, i) => (
            <PageCard
              key={page.id}
              page={page}
              livePixels={livePixels ? { live: livePixels.pages[page.id], labels: livePixels.labels } : undefined}
              assets={assets}
              store={store}
              liveUrl={storeView.live(page.slug)}
              can={can}
              homeAllowed={homeAllowed}
              focused={page.id === focusId}
              busy={busy === page.id}
              onAction={onAction}
              style={{ ["--i" as string]: Math.min(i, 10) + 3 }}
            />
          ))}
          {can.write && status === "active" && pages.length < 3 && (
            <Link
              href={storeView.href("/pages/new")}
              className="adm-surface-flat adm-rise group flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center transition-colors hover:bg-muted/70"
              style={{ ["--i" as string]: pages.length + 3 }}
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.04]">
                <PlusIcon className="size-5 text-brand" />
              </span>
              <span className="text-sm font-semibold">{t("landing.pages.new")}</span>
            </Link>
          )}
        </div>
      )}

      {confirm && (
        <PageConfirm
          key={`${confirm.kind}-${confirm.page.id}`}
          confirm={confirm}
          others={liveOthers(confirm.page.id)}
          homeAllowed={homeAllowed}
          onClose={() => setConfirm(null)}
          run={async (home, onError) => {
            const p = confirm.page;
            switch (confirm.kind) {
              case "publish":
                return act(p, actions.publish(p.id), (d) =>
                  d.skippedSections
                    ? t("landing.pages.toast.publishedSkipped", { path: storeView.livePath(d.slug), n: d.skippedSections })
                    : t("landing.pages.toast.published", { path: storeView.livePath(d.slug) }),
                  onError,
                );
              case "unpublish":
                return act(p, actions.unpublish(p.id, p.isHome ? home : undefined), () => t("landing.pages.toast.unpublished"), onError);
              case "home":
                return act(p, actions.setHome(p.id), () => t("landing.pages.toast.home"), onError);
              case "home-auto":
                return act(p, actions.setHome(null), () => t("landing.pages.toast.homeNone"), onError);
              case "archive":
                return act(p, actions.archive(p.id), () => t("landing.pages.toast.archived"), onError);
              case "delete":
                return act(p, actions.remove(p.id), () => t("landing.pages.toast.deleted"), onError);
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
          liveUrl={preview.status === "published" ? storeView.live(preview.slug) : null}
        />
      )}

      {exporting && <ExportDialog pageId={exporting.id} open onOpenChange={(o: boolean) => !o && setExporting(null)} />}
    </div>
  );
}

/**
 * The confirmation of one page action. Unpublishing the home page (in `landing` mode) first asks where the address
 * goes: another live page, or the branded "No page yet" page (LAN-§4).
 */
function PageConfirm({
  confirm,
  others,
  homeAllowed,
  onClose,
  run,
}: {
  confirm: NonNullable<Confirm>;
  others: PageListItem[];
  homeAllowed: boolean;
  onClose: () => void;
  run: (home: string | null, onError: (text: string) => void) => Promise<boolean>;
}) {
  const t = useT();
  const { page, kind } = confirm;
  const store = useStore();
  const path = store.livePath(page.slug);
  const [home, setHome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handoff = kind === "unpublish" && page.isHome && homeAllowed;
  const vars = { name: page.name, path };
  const copy: Record<ConfirmKind, { title: string; body: string; label: string; icon: React.ReactNode; destructive: boolean; pending: string }> = {
    publish: {
      title: t(page.status === "published" ? "landing.pages.confirm.publishChanges.title" : "landing.pages.confirm.publish.title", vars),
      body: t(page.status === "published" ? "landing.pages.confirm.publishChanges.body" : "landing.pages.confirm.publish.body", vars),
      label: t(page.status === "published" ? "landing.pages.menu.publishChanges" : "landing.pages.menu.publish"),
      icon: <GlobeIcon />,
      destructive: false,
      pending: t("landing.pages.confirm.publishing"),
    },
    unpublish: {
      title: handoff ? t("landing.pages.handoff.title", vars) : t("landing.pages.confirm.unpublish.title", vars),
      body: handoff ? t("landing.pages.handoff.body") : t("landing.pages.confirm.unpublish.body", vars),
      label: t("landing.pages.handoff.confirm"),
      icon: <ArchiveIcon />,
      destructive: true,
      pending: t("landing.pages.confirm.saving"),
    },
    home: { title: t("landing.pages.confirm.home.title", vars), body: t("landing.pages.confirm.home.body"), label: t("landing.pages.menu.setHome"), icon: <HomeIcon />, destructive: false, pending: t("landing.pages.confirm.saving") },
    "home-auto": { title: t("landing.pages.confirm.stopHome.title", vars), body: t("landing.pages.confirm.stopHome.body"), label: t("landing.pages.menu.stopHome"), icon: <HomeIcon />, destructive: false, pending: t("landing.pages.confirm.saving") },
    archive: { title: t("landing.pages.confirm.archive.title", vars), body: t("landing.pages.confirm.archive.body"), label: t("landing.pages.menu.archive"), icon: <ArchiveIcon />, destructive: false, pending: t("landing.pages.confirm.saving") },
    delete: { title: t("landing.pages.confirm.delete.title", vars), body: t("landing.pages.confirm.delete.body"), label: t("landing.pages.menu.delete"), icon: <Trash2Icon />, destructive: true, pending: t("landing.pages.confirm.saving") },
  };
  const c = copy[kind];
  const option = (value: string | null, title: string, hint: string, mono?: boolean) => (
    <label
      key={value ?? "none"}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors",
        home === value ? "bg-brand/[0.06] ring-brand/35" : "ring-foreground/10 hover:bg-foreground/[0.03]",
      )}
    >
      <input type="radio" name="next-home" className="mt-1 accent-brand" checked={home === value} onChange={() => setHome(value)} />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        {mono ? (
          <bdi dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
            {hint}
          </bdi>
        ) : (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
  return (
    <ConfirmSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={c.title}
      description={c.body}
      confirmLabel={c.label}
      cancelLabel={t("landing.attest.cancel")}
      pendingLabel={c.pending}
      icon={c.icon}
      destructive={c.destructive}
      error={error}
      onConfirm={async () => {
        setError(null);
        return run(home, setError);
      }}
    >
      {handoff && (
        <div role="radiogroup" className="grid max-h-64 gap-2 overflow-y-auto">
          {option(null, t("landing.pages.handoff.none"), t("landing.pages.handoff.noneHint"))}
          {others.map((p) => option(p.id, p.name, store.livePath(p.slug), true))}
        </div>
      )}
    </ConfirmSheet>
  );
}
