"use client";
/**
 * The links screen (P3 LANDING; landing.md LAN-§12.2, LP-12; core §I.8 states): the header with the gauge, then one
 * row per link: code and address, what it opens, channel, tags, clicks (labelled clicks, never visitors), last click
 * and status, with copy, QR, pause / resume and a menu (change what it opens, delete). Two lines per link on a phone,
 * one grid row on a wide screen. Pause is optimistic with Undo; delete asks first; create and change-target open their
 * sheets (./link-sheet.tsx). A refused create (`quota`) opens the limit sheet. Read-only members see the list only.
 */
import { MoreHorizontalIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { LinkPageOption } from "@/lib/links/read";
import type { LinkTarget, ShortLinkRow } from "@/lib/links/types";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { CopyButton, writeClipboard } from "../common/copy-button";
import { EmptyState } from "../common/empty-state";
import { PageHeader } from "../common/page-header";
import { UsageMeter } from "../common/usage-meter";
import { ConfirmSheet } from "../landing/confirm-sheet";
import { ageText, failText, intFmt } from "../leads/format";
import { LimitSheet } from "../shell/limit-sheet";
import { ChannelText, LinkStatus, QrDialog, shortPath, shownUrl, TargetLabel, UtmTags } from "./link-parts";
import { CreateLinkSheet, EditTargetSheet, type CreateLinkValues, type FieldErrors } from "./link-sheet";
import { LINK_COLUMNS, LinkRowsSkeleton } from "./links-skeleton";

export interface LinksActions {
  create: (input: { target: LinkTarget; channel: CreateLinkValues["channel"]; utm: CreateLinkValues["utm"]; code: string | null }) => Promise<ActionResult<{ id: string; code: string; url: string }>>;
  pause: (id: string) => Promise<ActionResult<null>>;
  resume: (id: string) => Promise<ActionResult<null>>;
  remove: (id: string) => Promise<ActionResult<null>>;
  retarget: (id: string, target: LinkTarget) => Promise<ActionResult<null>>;
}

type Failure = { ok: false; error: string; message?: string; items?: readonly { field?: string; title: string }[] };
const NETWORK: Failure = { ok: false, error: "network", message: "landing.common.network" };

/** A refusal as the sheet's field errors (a field item first, then the tags' zod message, else the form line). */
function fieldErrors(res: Failure, t: (k: string, v?: Record<string, string | number>) => string): FieldErrors {
  const item = res.items?.[0];
  if (item?.field === "target" || item?.field === "code") return { [item.field]: t(item.title) };
  if (res.message?.startsWith("landing.links.error.utm")) return { utm: t(res.message) };
  if (res.error === "not_found") return { target: t("landing.links.error.unpublished") };
  return { form: failText(res, t) };
}

export function LinksView(p: { links: ShortLinkRow[]; pages: LinkPageOption[]; gauge: { used: number; limit: number | null }; canWrite: boolean; openNew?: boolean; timeZone: string; renderedAt: string; actions: LinksActions }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const nf = useMemo(() => intFmt(locale), [locale]);
  const now = Date.parse(p.renderedAt);

  // optimistic state over the server's rows (statuses changed, rows removed) until the refresh lands
  const [statusOf, setStatusOf] = useState<Record<string, ShortLinkRow["status"]>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const rows = p.links.filter((l) => !removed.has(l.id)).map((l) => (statusOf[l.id] && statusOf[l.id] !== l.status ? { ...l, status: statusOf[l.id]! } : l));
  const used = Math.max(0, p.gauge.used - [...removed].filter((id) => p.links.some((l) => l.id === id)).length);

  const [creating, setCreating] = useState(p.openNew && p.canWrite ? 1 : 0);
  const [limitOpen, setLimitOpen] = useState(false);
  const [qr, setQr] = useState<ShortLinkRow | null>(null);
  const [editing, setEditing] = useState<ShortLinkRow | null>(null);
  const [deleting, setDeleting] = useState<ShortLinkRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onStale = useCallback(
    (res: { error: string }) => {
      if (res.error === "not_found") {
        toast.error(t("landing.links.error.not_found"));
        router.refresh();
        return true;
      }
      return false;
    },
    [router, t],
  );

  /** One status write: optimistic, rolled back with the reason on a refusal; true when the server took it. */
  const writeStatus = useCallback(
    async (id: string, before: ShortLinkRow["status"], status: ShortLinkRow["status"]): Promise<boolean> => {
      setStatusOf((s) => ({ ...s, [id]: status }));
      const res = await (status === "paused" ? p.actions.pause(id) : p.actions.resume(id)).catch(() => NETWORK);
      if (!res.ok) {
        setStatusOf((s) => ({ ...s, [id]: before }));
        if (!onStale(res)) toast.error(failText(res, t));
        return false;
      }
      router.refresh();
      return true;
    },
    [p.actions, router, t, onStale],
  );

  /** Pause (with Undo) or resume a link. */
  const toggle = useCallback(
    async (link: ShortLinkRow) => {
      const before = link.status;
      const next = before === "active" ? "paused" : "active";
      if (!(await writeStatus(link.id, before, next))) return;
      if (next === "active") return void toast.success(t("landing.links.toast.resumed"));
      toast.success(t("landing.links.toast.paused"), {
        action: {
          label: t("landing.common.undo"),
          onClick: () => void writeStatus(link.id, next, before).then((ok) => ok && toast.success(t("landing.common.undone"))),
        },
      });
    },
    [writeStatus, t],
  );

  const create = async (v: CreateLinkValues): Promise<FieldErrors | null> => {
    const res = await p.actions.create({ target: v.target, channel: v.channel, utm: v.utm, code: v.code }).catch(() => NETWORK);
    if (!res.ok) {
      if (res.error === "quota") {
        setCreating(0);
        setLimitOpen(true);
        return null;
      }
      return fieldErrors(res, t);
    }
    setCreating(0);
    const copied = await writeClipboard(res.data.url);
    toast.success(t(copied ? "landing.links.toast.created" : "landing.links.toast.createdNoCopy"), { description: shownUrl(res.data.url) });
    router.refresh();
    return null;
  };

  const retarget = async (id: string, target: LinkTarget): Promise<FieldErrors | null> => {
    const res = await p.actions.retarget(id, target).catch(() => NETWORK);
    if (!res.ok) {
      if (res.error === "not_found" && !res.items?.length) {
        // the link itself is gone, or the page left the store: the list tells which
        router.refresh();
      }
      return fieldErrors(res, t);
    }
    setEditing(null);
    toast.success(t("landing.links.toast.retargeted"));
    router.refresh();
    return null;
  };

  const remove = async (): Promise<boolean> => {
    if (!deleting) return false;
    const res = await p.actions.remove(deleting.id).catch(() => NETWORK);
    if (!res.ok) {
      if (onStale(res)) return true;
      setDeleteError(failText(res, t));
      return false;
    }
    setRemoved((s) => new Set(s).add(deleting.id));
    toast.success(t("landing.links.toast.deleted"));
    router.refresh();
    return true;
  };

  const newButton = p.canWrite && (
    <Button variant="brand" onClick={() => (p.gauge.limit !== null && used >= p.gauge.limit ? setLimitOpen(true) : setCreating((n) => n + 1))} className="gap-1.5">
      <PlusIcon aria-hidden="true" className="size-4" />
      {t("landing.links.new")}
    </Button>
  );

  return (
    <>
      <PageHeader title={t("landing.links.title")} description={t("landing.links.lead")} actions={rows.length ? newButton : undefined} />

      {rows.length === 0 ? (
        <EmptyState
          title={t("landing.links.empty.title")}
          description={t("landing.links.empty.body")}
          preview={<LinkRowsSkeleton rows={3} preview />}
          actions={
            p.canWrite ? (
              <Button variant="brand" onClick={() => setCreating((n) => n + 1)} className="gap-1.5">
                <PlusIcon aria-hidden="true" className="size-4" />
                {t("landing.links.empty.action")}
              </Button>
            ) : undefined
          }
          teach={p.canWrite ? undefined : t("landing.links.readOnly")}
        />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-xs">
              <UsageMeter label={t("landing.links.title")} used={used} limit={p.gauge.limit} />
            </div>
            {!p.canWrite && <p className="text-[0.8125rem] text-muted-foreground">{t("landing.links.readOnly")}</p>}
          </div>

          <div role="table" aria-label={t("landing.links.title")} className="adm-surface overflow-hidden">
            <div role="row" className={cn("hidden border-b border-border/70 px-5 py-2.5 text-[0.75rem] font-medium text-muted-foreground xl:grid xl:items-center xl:gap-4", LINK_COLUMNS)}>
              <span role="columnheader">{t("landing.links.col.link")}</span>
              <span role="columnheader">{t("landing.links.col.target")}</span>
              <span role="columnheader">{t("landing.links.col.channel")}</span>
              <span role="columnheader">{t("landing.links.col.utm")}</span>
              <span role="columnheader" className="text-end">
                {t("landing.links.col.clicks")}
              </span>
              <span role="columnheader">{t("landing.links.col.last")}</span>
              <span role="columnheader">{t("landing.links.col.status")}</span>
              <span role="columnheader" className="sr-only">
                {t("landing.links.col.actions")}
              </span>
            </div>
            <div role="rowgroup" className="divide-y divide-border/70">
              {rows.map((link) => (
                <LinkRowView
                  key={link.id}
                  link={link}
                  canWrite={p.canWrite}
                  clicks={nf.format(link.clicks)}
                  last={link.lastClickAt ? t("landing.links.ago", { when: ageText(link.lastClickAt, now, locale) }) : null}
                  onQr={() => setQr(link)}
                  onToggle={() => void toggle(link)}
                  onEdit={() => setEditing(link)}
                  onDelete={() => (setDeleteError(null), setDeleting(link))}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {p.canWrite && <CreateLinkSheet key={creating} open={creating > 0} onClose={() => setCreating(0)} pages={p.pages} onSubmit={create} />}
      {p.canWrite && (
        <EditTargetSheet
          link={editing && (editing.target.kind === "page" || editing.target.kind === "home" || editing.target.kind === "policy") ? { id: editing.id, code: editing.code, target: editing.target } : null}
          onClose={() => setEditing(null)}
          pages={p.pages}
          onSubmit={retarget}
        />
      )}
      <QrDialog link={qr} onClose={() => setQr(null)} />
      <ConfirmSheet
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        icon={<Trash2Icon className="size-5" />}
        title={deleting ? t("landing.links.delete.title", { code: deleting.code }) : ""}
        description={t("landing.links.delete.body")}
        confirmLabel={t("landing.links.delete.confirm")}
        cancelLabel={t("landing.links.cancel")}
        error={deleteError}
        onConfirm={remove}
      />
      <LimitSheet open={limitOpen} onOpenChange={setLimitOpen} limit={{ kind: "quota", metric: "short_links", used: Math.max(used, p.gauge.limit ?? used), limit: p.gauge.limit ?? used }} />
    </>
  );
}

function LinkRowView(p: { link: ShortLinkRow; canWrite: boolean; clicks: string; last: string | null; onQr: () => void; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  const { link } = p;
  const paused = link.status === "paused";
  return (
    <div role="row" className={cn("grid gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-foreground/[0.015] xl:items-center xl:px-5 xl:py-3", LINK_COLUMNS)}>
      {/* line 1 on a phone: the address and the clicks */}
      <div role="cell" className="flex min-w-0 items-center gap-2">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <bdi dir="ltr" className={cn("truncate font-mono text-[0.875rem] font-semibold", paused && "text-muted-foreground")}>
            {shortPath(link.code)}
          </bdi>
          <bdi dir="ltr" className="hidden truncate font-mono text-[0.6875rem] text-muted-foreground sm:block" title={link.url}>
            {shownUrl(link.url)}
          </bdi>
        </div>
        <span className="shrink-0 text-[0.8125rem] font-medium tabular-nums xl:hidden">{t("landing.links.clicks", { n: link.clicks })}</span>
      </div>
      {/* line 2 on a phone: what it opens, the status and the actions */}
      <div role="cell" className="flex min-w-0 items-center gap-2 text-[0.8125rem] xl:text-[0.875rem]">
        <TargetLabel link={link} className="min-w-0 flex-1" />
        <LinkStatus status={link.status} className="xl:hidden" />
        <span className="xl:hidden">
          <RowActions {...p} />
        </span>
      </div>
      <div role="cell" className="hidden min-w-0 text-[0.8125rem] xl:flex">
        <ChannelText channel={link.channel} />
      </div>
      <div role="cell" className="hidden min-w-0 xl:flex">
        <UtmTags utm={link.utm} />
      </div>
      <div role="cell" className="hidden text-end text-[0.875rem] font-medium tabular-nums xl:block" aria-label={t("landing.links.clicks", { n: link.clicks })}>
        {p.clicks}
      </div>
      <div role="cell" className="hidden truncate text-[0.8125rem] text-muted-foreground xl:block">
        {p.last ?? t("landing.links.never")}
      </div>
      <div role="cell" className="hidden xl:block">
        <LinkStatus status={link.status} />
      </div>
      <div role="cell" className="hidden xl:block">
        <RowActions {...p} />
      </div>
    </div>
  );
}

function RowActions(p: { link: ShortLinkRow; canWrite: boolean; onQr: () => void; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const t = useT();
  const paused = p.link.status === "paused";
  const iconBtn = "text-muted-foreground hover:text-foreground";
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <CopyButton value={p.link.url} label={t("landing.links.action.copy")} toastMessage={t("landing.links.toast.copied")} size="icon-sm" className={iconBtn} />
      <Button variant="ghost" size="icon-sm" onClick={p.onQr} aria-label={t("landing.links.action.qr")} title={t("landing.links.action.qr")} className={cn(iconBtn, "hidden sm:inline-flex")}>
        <QrCodeIcon className="size-4" />
      </Button>
      {p.canWrite && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={p.onToggle}
          aria-label={t(paused ? "landing.links.action.resume" : "landing.links.action.pause")}
          title={t(paused ? "landing.links.action.resume" : "landing.links.action.pause")}
          className={cn(iconBtn, "hidden sm:inline-flex")}
        >
          {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("landing.links.action.more", { code: p.link.code })} className={iconBtn}>
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem asChild>
            <a href={p.link.url} target="_blank" rel="noopener noreferrer">
              {t("landing.links.action.open")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={p.onQr} className="sm:hidden">
            <QrCodeIcon className="size-4" />
            {t("landing.links.action.qr")}
          </DropdownMenuItem>
          {p.canWrite && (
            <>
              <DropdownMenuItem onSelect={p.onToggle} className="sm:hidden">
                {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
                {t(paused ? "landing.links.action.resume" : "landing.links.action.pause")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onEdit}>
                <PencilIcon className="size-4" />
                {t("landing.links.action.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={p.onDelete}>
                <Trash2Icon className="size-4" />
                {t("landing.links.action.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
