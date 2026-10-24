"use client";
/**
 * Settings → Pixels = "Pixel library" (docs/OFFERS.md §A.4). Every pixel the store knows, grouped by
 * platform: label (inline edit), masked id (copy), status chip (Browser only · Browser + server ·
 * Test mode · 42 min · {page}), server health, "Used on 3 pages · 2 live · 1 export" (popover: the
 * pages, linking to the builder) and a menu: Edit token & test code, Send test event, Replace on
 * pages…, Remove from pages…, Delete (disabled while used, reason shown). Owners add pixels.
 * Pages own their pixels: nothing here changes a page unless the owner picks Replace / Remove.
 */
import {
  EllipsisIcon,
  EyeOffIcon,
  FlaskConicalIcon,
  KeyRoundIcon,
  Layers3Icon,
  Loader2Icon,
  MonitorSmartphoneIcon,
  PencilIcon,
  PlusIcon,
  RadarIcon,
  RefreshCwIcon,
  ServerIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pixelLibraryAction, pixelUsageAction, removePixelEntryAction, savePixelEntryAction, type PixelPageUse } from "@/lib/pixels/actions";
import { PIXEL_LIMIT, PIXEL_PLATFORMS, isServerPlatform, type PixelPlatform } from "@/lib/pixels/ids";
import { LABEL_MAX, inUse, isDetached, pixelLabel, usageText, type LibraryPixel, type PixelLibraryView } from "@/lib/pixels/library";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { CopyButton } from "../common/copy-button";
import { StatusChip } from "../common/status-chip";
import { runAction } from "../lib/action-result";
import { ReadOnlyNote, SettingsSection } from "../settings/form-kit";
import { PixelEntryDialog, type EntryMode } from "./entry-dialog";
import { MaskedId, PLATFORM_META, PixelHealthLine, PixelStatusChip, PlatformMark } from "./parts";
import { useStore } from "../shell/store-context";
import { ReplaceDialog } from "./replace-dialog";
import { useNow } from "./use-page-pixels";

const HOW = [
  { icon: Layers3Icon, title: "Set per page", text: "Each landing page fires only the pixels you pick for it — in the wizard or the builder." },
  { icon: ServerIcon, title: "Server events", text: "With a token, orders are also sent from the server: ad blockers can't stop them, counted once." },
  { icon: EyeOffIcon, title: "Never in previews", text: "Pixels never load in the builder, previews or for blocked bots, so your data stays clean." },
] as const;

export function PixelLibrary({ initial, canPages, canPublish }: { initial: PixelLibraryView; canPages: boolean; canPublish: boolean }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  // a server refresh (router.refresh) brings a new `initial`: adopt it
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setView(initial);
  }
  const [entry, setEntry] = useState<EntryMode | null>(null);
  const [swap, setSwap] = useState<{ pixel: LibraryPixel; mode: "replace" | "remove" } | null>(null);
  const [deleting, setDeleting] = useState<LibraryPixel | null>(null);
  const now = useNow();
  const owner = view.canCreate;

  const reload = async () => {
    const res = await pixelLibraryAction();
    if (res.ok) setView(res.data);
    router.refresh();
  };

  const groups = useMemo(() => PIXEL_PLATFORMS.map((p) => ({ platform: p, pixels: view.pixels.filter((x) => x.platform === p) })).filter((g) => g.pixels.length), [view]);
  const total = view.pixels.length;
  const servers = view.pixels.filter((p) => p.server).length;
  const testing = view.pixels.filter((p) => p.activeTests.length).length;

  return (
    <>
      {!owner && <ReadOnlyNote />}
      <SettingsSection
        style={{ ["--i" as string]: 0 }}
        title={
          <span className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <RadarIcon className="size-4" />
            </span>
            Pixel library
          </span>
        }
        description="Pixels are set per page. Saved pixels appear here so you can pick them quickly in the wizard and the builder."
        aside={
          owner ? (
            <Button className="rounded-full" onClick={() => setEntry({ kind: "add" })}>
              <PlusIcon />
              Add pixel
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {HOW.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.06] ring-inset">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-background text-foreground/70 shadow-[0_0_0_1px_var(--border)]">
                <Icon className="size-4" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs leading-relaxed text-pretty text-muted-foreground">{text}</span>
              </span>
            </div>
          ))}
        </div>
        {total > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-4 text-sm">
            <Stat label="Pixels" value={total} />
            <Stat label="With server events" value={servers} />
            {testing ? <Stat label="Testing now" value={testing} /> : null}
          </dl>
        )}
      </SettingsSection>

      {groups.length === 0 ? (
        <section className="adm-surface adm-rise grid place-items-center gap-3 px-6 py-12 text-center" style={{ ["--i" as string]: 1 }}>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm ring-1 ring-border">
            <RadarIcon className="size-5" />
          </span>
          <span className="grid max-w-sm gap-1">
            <span className="text-sm font-semibold">No pixels yet</span>
            <span className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {owner ? "Add your Meta, TikTok, Snapchat or GA4 pixels once — then pick them for each page." : "Ask an owner to add the store's pixels here; you can then pick them for each page."}
            </span>
          </span>
          {owner && (
            <Button variant="outline" className="mt-1 rounded-full" onClick={() => setEntry({ kind: "add" })}>
              <PlusIcon />
              Add your first pixel
            </Button>
          )}
        </section>
      ) : (
        groups.map((g, i) => (
          <SettingsSection
            key={g.platform}
            style={{ ["--i" as string]: i + 1 }}
            title={
              <span className="flex items-center gap-2.5">
                <PlatformMark platform={g.platform} />
                <span className="grid leading-tight">
                  {PLATFORM_META[g.platform].name}
                  <span className="text-xs font-normal tracking-normal text-muted-foreground">
                    {PLATFORM_META[g.platform].tagline} · up to {PIXEL_LIMIT[g.platform]} per page
                  </span>
                </span>
              </span>
            }
            aside={
              owner ? (
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => setEntry({ kind: "add", platform: g.platform })}>
                  <PlusIcon />
                  Add
                </Button>
              ) : null
            }
          >
            <ul className="grid gap-2">
              {g.pixels.map((p) => (
                <PixelRow
                  key={p.id}
                  pixel={p}
                  now={now}
                  owner={owner}
                  canPages={canPages}
                  onEdit={(focusTest) => setEntry({ kind: "edit", pixel: p, focusTest })}
                  onSwap={(mode) => setSwap({ pixel: p, mode })}
                  onDelete={() => setDeleting(p)}
                  onLabel={async (label) => {
                    const res = await runAction(savePixelEntryAction({ platform: p.platform, id: p.id, label }), { success: "Label saved" });
                    if (res) setView(res.view);
                    return !!res;
                  }}
                />
              ))}
            </ul>
          </SettingsSection>
        ))
      )}

      {entry && (
        <PixelEntryDialog
          open
          onOpenChange={(o) => !o && setEntry(null)}
          mode={entry}
          library={view}
          onSaved={(_p, v) => {
            setView(v);
            router.refresh();
          }}
        />
      )}
      {swap && <ReplaceDialog open onOpenChange={(o) => !o && setSwap(null)} pixel={swap.pixel} mode={swap.mode} library={view} canPublish={canPublish} onDone={reload} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          destructive
          icon={<Trash2Icon />}
          title={`Delete ${pixelLabel(deleting)}?`}
          description="It leaves the library with its token and test code. No page uses it, so nothing stops firing."
          confirmLabel="Delete pixel"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            const res = await runAction(removePixelEntryAction({ platform: deleting.platform, id: deleting.id }), { success: "Pixel deleted" });
            if (!res) return false;
            setView(res.view);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function PixelRow({
  pixel,
  now,
  owner,
  canPages,
  onEdit,
  onSwap,
  onDelete,
  onLabel,
}: {
  pixel: LibraryPixel;
  now: number;
  owner: boolean;
  canPages: boolean;
  onEdit: (focusTest: boolean) => void;
  onSwap: (mode: "replace" | "remove") => void;
  onDelete: () => void;
  onLabel: (label: string) => Promise<boolean>;
}) {
  const server = isServerPlatform(pixel.platform);
  const used = inUse(pixel.usage);
  const detached = isDetached(pixel.usage);
  return (
    <li className="grid gap-3 rounded-2xl bg-background/60 px-4 py-3.5 ring-1 ring-foreground/[0.07] ring-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <InlineLabel pixel={pixel} editable={owner} onSave={onLabel} />
          <span className="inline-flex items-center gap-0.5">
            <MaskedId id={pixel.id} />
            <CopyButton value={pixel.id} label={`Copy ${PLATFORM_META[pixel.platform].name} pixel ID`} toastMessage="Pixel ID copied" size="icon-xs" className="text-muted-foreground" />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <PixelStatusChip pixel={pixel} now={now} />
          {detached && (
            <StatusChip tone="warn" title="Removed from every draft, still firing on live pages or exports">
              Detached, still live on {pixel.usage.live + pixel.usage.exports} {pixel.usage.live + pixel.usage.exports === 1 ? "place" : "places"}
            </StatusChip>
          )}
          <PixelHealthLine pixel={pixel} />
          {server && !pixel.server && <span className="text-[0.72rem] text-muted-foreground">No token: in-app and iOS purchases are under-counted</span>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <UsagePopover pixel={pixel} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0 rounded-full text-muted-foreground data-open:bg-muted" aria-label={`Actions for ${pixelLabel(pixel)}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
            {owner && (
              <DropdownMenuItem onSelect={() => onEdit(false)}>
                {server ? <KeyRoundIcon /> : <PencilIcon />} {server ? "Edit token & test code" : "Edit label"}
              </DropdownMenuItem>
            )}
            {owner && server && (
              <DropdownMenuItem onSelect={() => onEdit(true)}>
                <FlaskConicalIcon /> Send test event
              </DropdownMenuItem>
            )}
            {canPages && (
              <>
                {owner && <DropdownMenuSeparator />}
                <DropdownMenuItem disabled={!used} onSelect={() => onSwap("replace")}>
                  <RefreshCwIcon /> Replace on pages…
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!used} onSelect={() => onSwap("remove")}>
                  <UnlinkIcon /> Remove from pages…
                </DropdownMenuItem>
              </>
            )}
            {owner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={used} onSelect={onDelete}>
                  <Trash2Icon />
                  <span className="grid">
                    Delete
                    {used && <span className="text-[0.7rem] font-normal text-muted-foreground">Still used — remove it from pages first</span>}
                  </span>
                </DropdownMenuItem>
              </>
            )}
            {!owner && !canPages && (
              <DropdownMenuItem disabled>
                <MonitorSmartphoneIcon /> Owners manage pixels
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function InlineLabel({ pixel, editable, onSave }: { pixel: LibraryPixel; editable: boolean; onSave: (label: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = pixel.label || `${PLATFORM_META[pixel.platform].name} pixel`;
  if (draft === null) {
    return editable ? (
      <button
        type="button"
        onClick={() => setDraft(pixel.label)}
        className={cn("group/label -mx-1 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 text-start text-sm font-medium outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50", !pixel.label && "text-muted-foreground")}
        title="Rename"
      >
        <span className="truncate" dir="auto">
          {shown}
        </span>
        <PencilIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover/label:opacity-60 group-focus-visible/label:opacity-60" />
      </button>
    ) : (
      <span className={cn("truncate text-sm font-medium", !pixel.label && "text-muted-foreground")} dir="auto">
        {shown}
      </span>
    );
  }
  const commit = async () => {
    const next = draft.trim();
    if (next === pixel.label) return setDraft(null);
    setBusy(true);
    const ok = await onSave(next);
    setBusy(false);
    if (ok) setDraft(null);
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        value={draft}
        maxLength={LABEL_MAX}
        dir="auto"
        aria-label="Pixel label"
        placeholder="Compte principal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") setDraft(null);
        }}
        className="h-7 w-48 rounded-lg bg-background px-2 text-sm font-medium shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {busy && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
    </span>
  );
}

function UsagePopover({ pixel }: { pixel: LibraryPixel }) {
  const storeView = useStore();
  const [list, setList] = useState<PixelPageUse[] | null>(null);
  const [open, setOpen] = useState(false);
  const used = inUse(pixel.usage);
  useEffect(() => {
    if (!open || list) return;
    let alive = true;
    void pixelUsageAction({ platform: pixel.platform, id: pixel.id }).then((res) => {
      if (!alive) return;
      if (res.ok) setList(res.data);
      else toast.error(res.error);
    });
    return () => {
      alive = false;
    };
  }, [open, list, pixel.platform, pixel.id]);
  if (!used) return <span className="text-xs text-muted-foreground">{usageText(pixel.usage)}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-full px-2.5 py-1 text-xs font-medium text-foreground/80 ring-1 ring-foreground/10 ring-inset outline-none transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-foreground/[0.05]">
          {usageText(pixel.usage)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-xl p-1.5">
        {list === null ? (
          <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" /> Loading pages…
          </div>
        ) : (
          <ul className="grid max-h-72 gap-0.5 overflow-y-auto adm-scroll">
            {list.map((u) => (
              <li key={u.pageId}>
                <Link href={storeView.href(`/pages/${u.pageId}/edit`)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-foreground/[0.04]">
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {u.name}
                  </span>
                  <span className="flex shrink-0 gap-1 text-[0.65rem] font-medium">
                    {u.inLive && <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">Live</span>}
                    {u.inDraft && !u.inLive && <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-foreground/70">Draft</span>}
                    {u.exports ? <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-foreground/70">{u.exports} export{u.exports === 1 ? "" : "s"}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export type { PixelPlatform };
