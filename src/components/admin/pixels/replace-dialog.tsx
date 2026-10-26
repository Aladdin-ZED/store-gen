"use client";
/**
 * Replace on pages… / Remove from pages… (docs/OFFERS.md §A.4): the new pixel (library pick; owners
 * can type a new id), the pages using the old one (all ticked — each swap is the owner's explicit
 * choice per page), "Also update live pages now (pixels only)" (on by default) and the exports that
 * bake the old id in ("re-export needed"). The result lists each page: draft ok / conflict, live ok /
 * not live / error.
 */
import { ArrowRightIcon, CheckIcon, CircleAlertIcon, Loader2Icon, PackageOpenIcon, RefreshCwIcon, UnlinkIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { pixelUsageAction, replacePixelAction, type PixelPageUse, type ReplacePageResult } from "@/lib/pixels/actions";
import { ID_HELP } from "@/lib/pixels/form";
import { PIXEL_ID_RE, normalizePixelId } from "@/lib/pixels/ids";
import { pixelLabel, type LibraryPixel, type PixelLibraryView } from "@/lib/pixels/library";
import { cn } from "@/lib/utils";
import { runAction } from "../lib/action-result";
import { Field, TextInput } from "../settings/form-kit";
import { useStore } from "../shell/store-context";
import { MaskedId, PLATFORM_META, PlatformMark } from "./parts";

const NEW = "__new__";

export function ReplaceDialog({
  open,
  onOpenChange,
  pixel,
  mode,
  library,
  canPublish,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pixel: LibraryPixel;
  mode: "replace" | "remove";
  library: PixelLibraryView;
  canPublish: boolean;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-xl">
        {open && <ReplaceForm pixel={pixel} mode={mode} library={library} canPublish={canPublish} onDone={onDone} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReplaceForm({ pixel, mode, library, canPublish, onDone, onClose }: { pixel: LibraryPixel; mode: "replace" | "remove"; library: PixelLibraryView; canPublish: boolean; onDone: () => void; onClose: () => void }) {
  const meta = PLATFORM_META[pixel.platform];
  const others = library.pixels.filter((p) => p.platform === pixel.platform && p.id !== pixel.id);
  const [uses, setUses] = useState<PixelPageUse[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>(others[0]?.id ?? (library.canCreate ? NEW : ""));
  const [typed, setTyped] = useState("");
  const [live, setLive] = useState(canPublish);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ results: ReplacePageResult[]; reexport: { pageId: string; name: string; exports: number }[] } | null>(null);

  useEffect(() => {
    let alive = true;
    void pixelUsageAction({ platform: pixel.platform, id: pixel.id }).then((res) => {
      if (!alive) return;
      const list = res.ok ? res.data : [];
      setUses(list);
      setPicked(new Set(list.filter((u) => u.inDraft || u.inLive).map((u) => u.pageId)));
    });
    return () => {
      alive = false;
    };
  }, [pixel.platform, pixel.id]);

  const pages = useMemo(() => (uses ?? []).filter((u) => u.inDraft || u.inLive), [uses]);
  const exportsUsing = useMemo(() => (uses ?? []).filter((u) => u.exports > 0), [uses]);
  const newId = target === NEW ? normalizePixelId(pixel.platform, typed) : target;
  const newIdError = mode === "replace" && target === NEW && typed && !PIXEL_ID_RE[pixel.platform].test(newId) ? ID_HELP[pixel.platform] : undefined;
  const ready = !busy && picked.size > 0 && (mode === "remove" || (!!newId && !newIdError && newId !== pixel.id));
  const fromLabel = pixelLabel(pixel);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await runAction(replacePixelAction({ platform: pixel.platform, from: pixel.id, to: mode === "remove" ? null : newId, pageIds: [...picked], live }));
      if (res) {
        setDone(res);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Results mode={mode} label={fromLabel} done={done} onClose={onClose} />;

  return (
    <div className="grid">
      <div className="grid gap-1.5 border-b border-border/60 px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", mode === "remove" ? "bg-foreground/[0.06] text-foreground/70" : "bg-brand/10 text-brand")}>
            {mode === "remove" ? <UnlinkIcon className="size-[1.1rem]" /> : <RefreshCwIcon className="size-[1.1rem]" />}
          </span>
          <div className="grid min-w-0">
            <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{mode === "remove" ? `Remove ${fromLabel} from pages` : `Replace ${fromLabel} on pages`}</DialogTitle>
            <DialogDescription className="text-[0.8rem] text-muted-foreground">
              {mode === "remove" ? "The ticked pages stop firing this pixel. It stays in the library." : `The ticked pages fire the new ${meta.name} pixel in its place.`}
            </DialogDescription>
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5">
        {mode === "replace" && (
          <div className="grid gap-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.03] px-3 py-2.5 ring-1 ring-foreground/[0.06] ring-inset">
              <PlatformMark platform={pixel.platform} size="sm" />
              <span className="min-w-0 truncate text-sm font-medium">{fromLabel}</span>
              <MaskedId id={pixel.id} />
              <ArrowRightIcon className="mx-1 size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">New pixel</span>
            </div>
            <Field label="New pixel">
              {(fp) => (
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger id={fp.id} className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Choose a pixel" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {others.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span className="truncate">{pixelLabel(p)}</span>
                          <MaskedId id={p.id} />
                        </span>
                      </SelectItem>
                    ))}
                    {library.canCreate && (
                      <>
                        {others.length ? <SelectSeparator /> : null}
                        <SelectItem value={NEW}>New pixel ID…</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {target === NEW && (
              <Field label={`New ${meta.name} pixel ID`} error={newIdError} hint="It joins the library with an empty label.">
                {(fp) => <TextInput {...fp} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={meta.placeholder} dir="ltr" spellCheck={false} autoComplete="off" className="font-mono text-[0.82rem]" autoFocus />}
              </Field>
            )}
            {!others.length && !library.canCreate ? <p className="text-xs text-muted-foreground">No other {meta.name} pixel in the library. Ask an owner to add one in Settings → Pixels.</p> : null}
          </div>
        )}

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Pages using it</p>
            {pages.length > 1 && (
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setPicked(picked.size === pages.length ? new Set() : new Set(pages.map((p) => p.pageId)))}
              >
                {picked.size === pages.length ? "Untick all" : "Tick all"}
              </button>
            )}
          </div>
          {uses === null ? (
            <div className="grid gap-2" aria-busy="true">
              <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.04]" />
              <div className="h-11 animate-pulse rounded-xl bg-foreground/[0.04]" />
            </div>
          ) : pages.length === 0 ? (
            <p className="rounded-xl bg-foreground/[0.03] px-3 py-3 text-sm text-muted-foreground ring-1 ring-foreground/[0.06] ring-inset">No page uses this pixel.</p>
          ) : (
            <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-xl bg-foreground/[0.02] p-1 ring-1 ring-foreground/[0.06] ring-inset adm-scroll">
              {pages.map((u) => {
                const on = picked.has(u.pageId);
                return (
                  <li key={u.pageId}>
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-foreground/[0.04]", on && "bg-background shadow-[0_0_0_1px_var(--border)]")}>
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => {
                          const next = new Set(picked);
                          if (v) next.add(u.pageId);
                          else next.delete(u.pageId);
                          setPicked(next);
                        }}
                      />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium" dir="auto">
                          {u.name}
                        </span>
                        <span className="truncate font-mono text-[0.7rem] text-muted-foreground">/{u.slug}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {u.inLive && <Tag tone="live">Live</Tag>}
                        {u.inDraft && <Tag tone="draft">Draft</Tag>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <label className={cn("flex items-start justify-between gap-4 rounded-xl px-3 py-3 ring-1 ring-foreground/[0.07] ring-inset", !canPublish && "opacity-60")}>
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Also update live pages now (pixels only)</span>
            <span className="text-xs leading-relaxed text-pretty text-muted-foreground">
              {canPublish ? "Live pages get the change right away; nothing else on them changes. Untick to apply it at their next publish." : "Your role can't publish: live pages change at their next publish."}
            </span>
          </span>
          <Switch checked={live} onCheckedChange={setLive} disabled={!canPublish} />
        </label>

        {exportsUsing.length > 0 && (
          <div className="grid gap-1.5 rounded-xl bg-warn/10 px-3 py-3 text-[0.8rem] text-warn-ink ring-1 ring-warn/35 ring-inset">
            <span className="flex items-center gap-1.5 font-medium">
              <PackageOpenIcon className="size-4" />
              Re-export needed
            </span>
            <span className="leading-relaxed">
              {exportsUsing.map((u) => `${u.name} (${u.exports} export${u.exports === 1 ? "" : "s"})`).join(", ")} keep firing the old pixel until you export them again.
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border/60 bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" className="rounded-full" variant={mode === "remove" ? "outline" : "default"} disabled={!ready} onClick={submit}>
          {busy && <Loader2Icon className="animate-spin" />}
          {mode === "remove" ? `Remove from ${picked.size} page${picked.size === 1 ? "" : "s"}` : `Replace on ${picked.size} page${picked.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function Tag({ tone, children }: { tone: "live" | "draft"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-1.5 text-[0.65rem] font-medium ring-1 ring-inset",
        tone === "live" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300" : "bg-foreground/[0.05] text-foreground/70 ring-foreground/10",
      )}
    >
      {children}
    </span>
  );
}

const DRAFT_TEXT: Record<ReplacePageResult["draft"], string> = { ok: "Draft updated", unchanged: "Draft unchanged", conflict: "Draft being edited: kept as is", not_found: "Page gone" };
const LIVE_TEXT: Record<ReplacePageResult["live"], string> = { ok: "Live updated", unchanged: "Live unchanged", not_live: "Not live", error: "Live not updated", skipped: "Live at next publish" };

function Results({ mode, label, done, onClose }: { mode: "replace" | "remove"; label: string; done: { results: ReplacePageResult[]; reexport: { pageId: string; name: string; exports: number }[] }; onClose: () => void }) {
  const storeView = useStore();
  const problems = done.results.filter((r) => r.draft === "conflict" || r.live === "error");
  return (
    <div className="grid">
      <div className="grid gap-1.5 border-b border-border/60 px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", problems.length ? "bg-warn/20 text-warn-ink" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
            {problems.length ? <CircleAlertIcon className="size-[1.1rem]" /> : <CheckIcon className="size-[1.1rem]" />}
          </span>
          <div className="grid min-w-0">
            <DialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{mode === "remove" ? `${label} removed` : `${label} replaced`}</DialogTitle>
            <DialogDescription className="text-[0.8rem] text-muted-foreground">
              {problems.length ? `${problems.length} page${problems.length === 1 ? "" : "s"} need a look.` : "Every ticked page is done."}
            </DialogDescription>
          </div>
        </div>
      </div>
      <ul className="grid max-h-80 gap-1 overflow-y-auto px-6 py-4 adm-scroll">
        {done.results.map((r) => (
          <li key={r.pageId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-2 odd:bg-foreground/[0.025]">
            <Link href={storeView.href(`/pages/${r.pageId}/edit`)} className="min-w-0 truncate text-sm font-medium hover:underline" dir="auto">
              {r.name || "Page"}
            </Link>
            <span className="flex flex-wrap items-center gap-1.5 text-[0.72rem]">
              <span className={cn("rounded-full px-2 py-0.5 ring-1 ring-inset", r.draft === "conflict" ? "bg-warn/12 text-warn-ink ring-warn/35" : "bg-foreground/[0.04] text-foreground/70 ring-foreground/10")}>{DRAFT_TEXT[r.draft]}</span>
              <span
                title={r.error}
                className={cn(
                  "rounded-full px-2 py-0.5 ring-1 ring-inset",
                  r.live === "ok" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300" : r.live === "error" ? "bg-warn/12 text-warn-ink ring-warn/35" : "bg-foreground/[0.04] text-foreground/70 ring-foreground/10",
                )}
              >
                {LIVE_TEXT[r.live]}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {done.reexport.length > 0 && (
        <p className="mx-6 mb-4 rounded-xl bg-warn/10 px-3 py-2.5 text-[0.8rem] text-warn-ink ring-1 ring-warn/35 ring-inset">
          Re-export needed: {done.reexport.map((u) => u.name).join(", ")}.
        </p>
      )}
      <div className="flex justify-end rounded-b-2xl border-t border-border/60 bg-muted/40 px-6 py-4">
        <Button type="button" className="rounded-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
