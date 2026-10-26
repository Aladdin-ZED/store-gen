"use client";
/**
 * Builder top bar: identity (back, name, address, status) · canvas (device, zoom) · actions
 * (undo/redo, autosave, remix, history, preview, export, publish).
 */
import { ArrowLeft, ArrowUpRight, ChevronDown, CloudOff, Download, Globe, History, LoaderCircle, Monitor, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/common/confirm-dialog";
import { useOpenedOnce } from "@/components/admin/lib/lazy";
import { ExportDialog } from "@/components/admin/on-demand";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createVersion, unpublish } from "@/lib/editor/actions";
import { selectIsLive, type ZoomLevel } from "@/lib/editor/store";
import { useEditor, useEditorApi, useEditorStore, useHistory } from "../context";
import { useEnv } from "../env";
import { PublishDialog, VersionsDrawer } from "../on-demand";
import { usePersistence } from "../persistence";
import { MOD, Segmented, TipButton } from "../ui";
import { LiveStatus, PageNameField, SlugControl } from "./PageIdentity";
import { RemixMenu } from "./RemixMenu";
import { SaveStatus } from "./SaveStatus";
import { useStore } from "@/components/admin/shell/store-context";

const ZOOMS: { value: ZoomLevel; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
];


export function TopBar() {
  const store = useEditorStore();
  const api = useEditorApi();
  const device = useEditor((s) => s.device);
  const zoom = useEditor((s) => s.zoom);
  const page = useEditor((s) => s.page);
  const { canUndo, canRedo } = useHistory();
  const { user } = useEnv();
  const { flush, call } = usePersistence();
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportVersion, setExportVersion] = useState<string | undefined>(undefined);
  const [preparing, setPreparing] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  // code-split: each mounts on its first open and then stays mounted (state, exit animation)
  const publishMounted = useOpenedOnce(publishOpen);
  const versionsMounted = useOpenedOnce(versionsOpen);
  const exportMounted = useOpenedOnce(exportOpen);
  const storeView = useStore();

  const openPreview = async () => {
    // open the tab inside the click (popup blockers), then point it at the saved draft
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const ok = await flush();
    if (!ok) toast.warning("Showing the last saved version — your latest edits are not saved yet.");
    const url = storeView.href(`/preview/${page.id}`);
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener");
  };

  /**
   * Export what the merchant sees: the published version when the draft is live, else a snapshot of
   * the saved draft (exports are made from immutable versions; an identical newest one is reused).
   */
  const openExport = async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      if (!(await flush())) toast.warning("Exporting the last saved version — your latest edits are not saved yet.");
      const st = store.getState();
      if (selectIsLive(st) && st.page.publishedVersionId) {
        setExportVersion(st.page.publishedVersionId);
      } else {
        const res = await call(() => createVersion({ pageId: st.page.id, kind: "save", label: "Export snapshot", reuse: true }));
        if (res.ok) {
          st.upsertVersion(res.version);
          setExportVersion(res.version.id);
        } else {
          toast.error(res.message);
          setExportVersion(undefined);
        }
      }
      setExportOpen(true);
    } finally {
      setPreparing(false);
    }
  };

  const takeOffline = async (): Promise<boolean> => {
    const res = await call(() => unpublish({ pageId: page.id, baseUpdatedAt: store.getState().page.updatedAt }));
    if (!res.ok) {
      toast.error(res.message);
      return false;
    }
    const st = store.getState();
    // keep our draft token when the draft was changed elsewhere: the next save then reports it
    st.setPage(res.draftChangedElsewhere ? { ...res.page, updatedAt: st.page.updatedAt } : res.page);
    store.getState().markLive(null);
    toast.success("The page is offline", { description: "Its address and every version are kept." });
    return true;
  };

  return (
    <header className="bld-glass relative z-30 flex h-14 shrink-0 items-center gap-2 px-3">
      {/* identity */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <TipButton label="All pages" asChild>
          <Link href={storeView.href("/pages")}>
            <ArrowLeft />
          </Link>
        </TipButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <PageNameField />
        <SlugControl />
        <LiveStatus />
      </div>

      {/* canvas */}
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        <Segmented
          value={device}
          onChange={api.setDevice}
          label="Preview device"
          stretch={false}
          options={[
            { value: "mobile", label: <Smartphone />, title: "Mobile · 390 px" },
            { value: "tablet", label: <Tablet />, title: "Tablet · 820 px" },
            { value: "desktop", label: <Monitor />, title: "Desktop · 1280 px" },
          ]}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="w-[4.5rem] justify-between font-mono text-[11.5px] tabular-nums text-muted-foreground">
              {ZOOMS.find((z) => z.value === zoom)?.label}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-28">
            <DropdownMenuRadioGroup value={String(zoom)} onValueChange={(v) => api.setZoom(v === "fit" ? "fit" : (Number(v) as ZoomLevel))}>
              {ZOOMS.map((z) => (
                <DropdownMenuRadioItem key={String(z.value)} value={String(z.value)}>
                  {z.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* actions */}
      <div className="flex flex-1 items-center justify-end gap-1">
        <TipButton label="Undo" shortcut={`${MOD}+Z`} disabled={!canUndo} onClick={() => api.undo()}>
          <Undo2 />
        </TipButton>
        <TipButton label="Redo" shortcut={`${MOD}+Shift+Z`} disabled={!canRedo} onClick={() => api.redo()}>
          <Redo2 />
        </TipButton>
        <SaveStatus />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <RemixMenu disabled={!user.canWrite} />
        <TipButton label="History" onClick={() => setVersionsOpen(true)}>
          <History />
        </TipButton>
        <TipButton label="Preview in a new tab" onClick={() => void openPreview()}>
          <ArrowUpRight />
        </TipButton>
        {user.canExport ? (
          <TipButton label="Export as a website" onClick={() => void openExport()} disabled={preparing}>
            {preparing ? <LoaderCircle className="animate-spin" /> : <Download />}
          </TipButton>
        ) : null}
        <div className="ms-1 flex items-center">
          <Button onClick={() => setPublishOpen(true)} disabled={!user.canPublish} variant="brand" className="h-8 rounded-e-none px-3.5">
            <Globe />
            Publish
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="More publishing options" disabled={!user.canPublish} variant="brand" className="h-8 w-7 rounded-s-none border-s border-s-brand-foreground/20 px-0">
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-52">
              <DropdownMenuItem onSelect={() => setPublishOpen(true)}>
                <Globe />
                Review & publish…
              </DropdownMenuItem>
              {page.status === "published" ? (
                <>
                  <DropdownMenuItem asChild>
                    <a href={storeView.live(page.slug)} target="_blank" rel="noopener noreferrer">
                      <ArrowUpRight />
                      Open live page
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setOfflineOpen(true)}>
                    <CloudOff />
                    Unpublish
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {publishMounted ? <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} /> : null}
      {versionsMounted ? <VersionsDrawer open={versionsOpen} onOpenChange={setVersionsOpen} /> : null}
      {user.canExport && exportMounted ? <ExportDialog pageId={page.id} versionId={exportVersion} open={exportOpen} onOpenChange={setExportOpen} /> : null}
      <ConfirmDialog
        open={offlineOpen}
        onOpenChange={setOfflineOpen}
        destructive
        icon={<CloudOff />}
        title="Take this page offline?"
        description={
          <>
            Visitors of <span className="font-mono text-foreground/80">{storeView.livePath(page.slug)}</span> will see a “page not found” and can no longer order. Ads pointing here stop
            converting. You can publish it again at any time.
          </>
        }
        confirmLabel="Unpublish"
        pendingLabel="Unpublishing…"
        onConfirm={takeOffline}
      />
    </header>
  );
}
