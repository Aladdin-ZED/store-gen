"use client";

/**
 * The orders list's tabs (P4 CALL CENTER; operations.md OPE-§12.1, §12.2): All, the built-in views of the viewer's
 * role (the conditional ones only when they have rows), then the saved views (personal first, then the team's),
 * reordered by drag. "Save view" keeps the current filters as a personal view, or a shared one for orders.assign.
 * A view is a link: the tabs only navigate.
 */
import { BookmarkPlusIcon, Loader2Icon, MoreHorizontalIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteViewAction, renameViewAction, reorderViewsAction, saveViewAction } from "@/app/app/[store]/orders/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import type { OrderQueryInput } from "@/lib/callcenter/views";
import { dirOf, type MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { settle } from "./ops-ui";

export interface ViewTab {
  id: string;
  label: string;
  href: string;
  active: boolean;
  /** saved views */
  saved?: { shared: boolean; mine: boolean };
}

export function ViewTabs({ tabs, base, current, canSave, canShare }: { tabs: ViewTab[]; base: string; current: OrderQueryInput; canSave: boolean; canShare: boolean }) {
  const t = useT();
  const dir = dirOf(useAdminLocale());
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);
  const [rename, setRename] = useState<ViewTab | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const saved = tabs.filter((x) => x.saved);
  const builtins = tabs.filter((x) => !x.saved);
  const savedSorted = order ? (order.map((id) => saved.find((s) => s.id === id)).filter(Boolean) as ViewTab[]) : saved;

  const drop = async () => {
    if (!order) return;
    setDrag(null);
    const mine = order.filter((id) => saved.find((s) => s.id === id)?.saved?.mine);
    const res = await settle(reorderViewsAction(mine));
    if (!res.ok) {
      setOrder(null);
      toast.error(t("ops.error.generic"));
    } else router.refresh();
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <nav aria-label={t("ops.orders.views")} className="adm-scroll -mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 pb-1">
        {builtins.map((v) => (
          <Tab key={v.id} tab={v} />
        ))}
        {savedSorted.length > 0 && <span className="mx-1.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />}
        {savedSorted.map((v) => (
          <div
            key={v.id}
            draggable={!!v.saved?.mine}
            onDragStart={() => {
              setDrag(v.id);
              setOrder(savedSorted.map((s) => s.id));
            }}
            onDragOver={(e) => {
              if (!drag || drag === v.id) return;
              e.preventDefault();
              setOrder((cur) => {
                const list = [...(cur ?? savedSorted.map((s) => s.id))];
                const from = list.indexOf(drag);
                const to = list.indexOf(v.id);
                list.splice(from, 1);
                list.splice(to, 0, drag);
                return list;
              });
            }}
            onDragEnd={() => void drop()}
            className={cn("group flex shrink-0 items-center rounded-full", drag === v.id && "opacity-60")}
          >
            <Tab tab={v} />
            {v.saved?.mine && (
              <DropdownMenu dir={dir} modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={t("ops.orders.viewMenu", { name: v.label })} className="-ms-1 grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/[0.05] focus-visible:opacity-100 data-[state=open]:opacity-100">
                    <MoreHorizontalIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 rounded-xl">
                  <DropdownMenuItem className="rounded-lg" onSelect={() => setRename(v)}>
                    {t("ops.orders.renameView")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-lg"
                    onSelect={async () => {
                      const res = await settle(renameViewAction(v.id, v.label, current));
                      if (res.ok) {
                        toast.success(t("ops.orders.viewUpdated"));
                        router.refresh();
                      } else toast.error(t("ops.error.generic"));
                    }}
                  >
                    {t("ops.orders.updateView")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-lg text-destructive focus:text-destructive"
                    onSelect={async () => {
                      const res = await settle(deleteViewAction(v.id));
                      if (res.ok) {
                        toast.success(t("ops.orders.viewDeleted"));
                        if (v.active) router.replace(base);
                        router.refresh();
                      } else toast.error(t("ops.error.generic"));
                    }}
                  >
                    {t("ops.orders.deleteView")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </nav>
      {canSave && (
        <Button variant="ghost" size="sm" className="h-8 shrink-0 rounded-full text-muted-foreground" onClick={() => setSaveOpen(true)}>
          <BookmarkPlusIcon /> <span className="hidden sm:inline">{t("ops.orders.saveView")}</span>
        </Button>
      )}
      {(saveOpen || rename) && (
        <NameDialog
          title={rename ? t("ops.orders.renameView") : t("ops.orders.saveView")}
          initial={rename?.label ?? ""}
          canShare={!rename && canShare}
          onClose={() => {
            setSaveOpen(false);
            setRename(null);
          }}
          onSave={async (name, shared) => {
            const res = rename ? await settle(renameViewAction(rename.id, name)) : await settle<{ id: string }>(saveViewAction({ name, query: current, shared }));
            if (!res.ok) {
              toast.error(t(`ops.error.${res.error}` as MessageKey) === `ops.error.${res.error}` ? t("ops.error.generic") : t(`ops.error.${res.error}` as MessageKey));
              return false;
            }
            toast.success(rename ? t("ops.orders.viewRenamed") : t("ops.orders.viewSaved"));
            router.refresh();
            return true;
          }}
        />
      )}
    </div>
  );
}

function Tab({ tab }: { tab: ViewTab }) {
  return (
    <Link
      href={tab.href}
      scroll={false}
      aria-current={tab.active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-150",
        tab.active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
      )}
    >
      {tab.saved?.shared && <UsersIcon className="size-3 opacity-70" aria-hidden="true" />}
      {tab.label}
    </Link>
  );
}

function NameDialog({ title, initial, canShare, onClose, onSave }: { title: string; initial: string; canShare: boolean; onClose: () => void; onSave: (name: string, shared: boolean) => Promise<boolean> }) {
  const t = useT();
  const dir = dirOf(useAdminLocale());
  const [name, setName] = useState(initial);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent dir={dir} className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("ops.orders.saveViewHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            const ok = await onSave(name.trim(), shared);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("ops.orders.viewName")} aria-label={t("ops.orders.viewName")} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          {canShare && (
            <label className="flex items-center justify-between gap-3 text-[0.8125rem]">
              <span>{t("ops.orders.shareView")}</span>
              <Switch checked={shared} onCheckedChange={setShared} />
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" className="rounded-full" onClick={onClose} disabled={busy}>
              {t("ops.common.cancel")}
            </Button>
            <Button type="submit" className="rounded-full" disabled={busy || !name.trim()}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t("ops.drawer.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
