"use client";
/**
 * Version history drawer: every generation, save, publish, restore and autosave of the page.
 * Select one to see it, then restore it (a "restore" version is recorded and the current draft is
 * kept as "Before restore"), preview it full-size, or start a new page from it. A restore keeps the
 * page's current pixels unless "Also restore its pixels" is ticked (docs/OFFERS.md §A.4).
 */
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Bookmark, CopyPlus, History, LoaderCircle, Pencil, RotateCcw, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LandingThumbnail } from "@/components/preview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { createVersion, duplicatePage, getVersionPreview, listVersions, renameVersion, restoreVersion, starVersion } from "@/lib/editor/actions";
import { VersionLabel } from "@/lib/editor/schemas";
import type { EditorAsset, VersionKind, VersionSummary } from "@/lib/editor/types";
import type { PageDoc } from "@/lib/page/schema";
import { sameIds } from "@/lib/pixels/library";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "./context";
import { fullTime, relativeTime, useEnv, useNow } from "./env";
import { usePersistence } from "./persistence";
import { EASE, Segmented } from "./ui";
import { useStore } from "@/components/admin/shell/store-context";

const KIND: Record<VersionKind, { label: string; dot: string }> = {
  generation: { label: "Generated", dot: "bg-violet-500" },
  save: { label: "Saved", dot: "bg-sky-500" },
  publish: { label: "Published", dot: "bg-emerald-500" },
  restore: { label: "Restored", dot: "bg-teal-500" },
  import: { label: "Imported", dot: "bg-slate-400" },
  autosave: { label: "Autosave", dot: "bg-foreground/25" },
};

type Filter = "all" | "named" | "publish" | "starred";

function dayLabel(at: number, now: number): string {
  const d = new Date(at);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "long", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export function VersionsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const store = useEditorStore();
  const versions = useEditor((s) => s.versions);
  const hasMore = useEditor((s) => s.hasMoreVersions);
  const page = useEditor((s) => s.page);
  const { user, store: storeInfo } = useEnv();
  const { call, flush } = usePersistence();
  const router = useRouter();
  const storeView = useStore();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; doc: PageDoc; assets: Record<string, EditorAsset> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** "Also restore its pixels" (off: a restore keeps the page's current pixels) */
  const [restorePixelsFor, setRestorePixelsFor] = useState<string | null>(null);
  const restorePixels = restorePixelsFor !== null && restorePixelsFor === selected;
  const draftTracking = useEditor((s) => s.doc.tracking);
  const [newLabel, setNewLabel] = useState("");

  const shown = useMemo(() => {
    switch (filter) {
      case "named":
        return versions.filter((v) => v.kind !== "autosave");
      case "publish":
        return versions.filter((v) => v.kind === "publish");
      case "starred":
        return versions.filter((v) => v.starred);
      default:
        return versions;
    }
  }, [versions, filter]);

  const groups = useMemo(() => {
    const out: { day: string; items: VersionSummary[] }[] = [];
    for (const v of shown) {
      const day = dayLabel(v.createdAt, now);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(v);
      else out.push({ day, items: [v] });
    }
    return out;
  }, [shown, now]);

  /* thumbnail of the selected version */
  useEffect(() => {
    if (!open || !selected || preview?.id === selected) return;
    let alive = true;
    void call(() => getVersionPreview({ pageId: page.id, versionId: selected }))
      .then((res) => {
        if (!alive) return;
        if (res.ok) setPreview({ id: selected, doc: res.doc, assets: res.assets });
        else toast.error(res.message);
      })
      .catch(() => alive && toast.error("Could not load this version."));
    return () => {
      alive = false;
    };
  }, [open, selected, preview?.id, page.id, call]);

  const sel = versions.find((v) => v.id === selected) ?? null;

  const restore = async (v: VersionSummary) => {
    setBusy("restore");
    if (!(await flush()) && store.getState().conflict) {
      setBusy(null);
      toast.error("Resolve the editing conflict first.");
      return;
    }
    // `pixels`: restore the version's pixels too (the server keeps the current ones otherwise)
    const input = { pageId: page.id, versionId: v.id, baseUpdatedAt: store.getState().page.updatedAt, pixels: restorePixels };
    const res = await call(() => restoreVersion(input));
    setBusy(null);
    if (!res.ok) {
      if (res.error === "conflict") {
        // someone else changed the page: let the conflict dialog settle it first
        onOpenChange(false);
        store.getState().saveConflict(res.serverUpdatedAt ?? 0);
      } else toast.error(res.message);
      return;
    }
    const st = store.getState();
    st.addAssets(Object.values(res.assets));
    st.replaceDoc(res.doc);
    // the restored doc is what the server now holds (zone-sorted copies render identically)
    const restored = store.getState().doc;
    st.saveSucceeded(restored, res.updatedAt);
    for (const created of res.versions) st.upsertVersion(created);
    st.markLive(st.page.status === "published" && st.page.publishedVersionId === v.id ? restored : null);
    onOpenChange(false);
    toast.success("Version restored", {
      description: "Your previous draft was kept as “Before restore”.",
      action: { label: "Undo", onClick: () => store.getState().undo() },
    });
  };

  const duplicate = async (v: VersionSummary | null) => {
    setBusy("duplicate");
    const res = await call(() => duplicatePage({ pageId: page.id, versionId: v?.id }));
    setBusy(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("New page created", {
      description: storeView.livePath(res.slug),
      action: {
        label: "Open",
        onClick: () => {
          void flush().then(() => router.push(storeView.href(`/pages/${res.pageId}/edit`)));
        },
      },
    });
  };

  const toggleStar = async (v: VersionSummary) => {
    const st = store.getState();
    st.patchVersion(v.id, { starred: !v.starred });
    const res = await call(() => starVersion({ pageId: page.id, versionId: v.id, starred: !v.starred }));
    if (!res.ok) {
      store.getState().patchVersion(v.id, { starred: v.starred });
      toast.error(res.message);
    }
  };

  const rename = async (v: VersionSummary, label: string) => {
    const parsed = VersionLabel.safeParse(label);
    if (!parsed.success || parsed.data === (v.label ?? "")) return;
    store.getState().patchVersion(v.id, { label: parsed.data || null });
    const res = await call(() => renameVersion({ pageId: page.id, versionId: v.id, label: parsed.data }));
    if (!res.ok) {
      store.getState().patchVersion(v.id, { label: v.label });
      toast.error(res.message);
    }
  };

  const saveVersion = async () => {
    const parsed = VersionLabel.safeParse(newLabel);
    if (!parsed.success) return;
    setSaving(true);
    if (!(await flush())) {
      setSaving(false);
      toast.error("Your latest edits are not saved yet — check the status in the top bar.");
      return;
    }
    const res = await call(() => createVersion({ pageId: page.id, kind: "save", label: parsed.data || undefined }));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    store.getState().upsertVersion(res.version);
    setNewLabel("");
    toast.success("Version saved");
  };

  const loadMore = async () => {
    const last = versions[versions.length - 1];
    if (!last) return;
    setBusy("more");
    const res = await call(() => listVersions({ pageId: page.id, before: last.createdAt }));
    setBusy(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const st = store.getState();
    const known = new Set(st.versions.map((v) => v.id));
    st.setVersions([...st.versions, ...res.versions.filter((v) => !known.has(v.id))], res.hasMore);
  };

  const live = page.status === "published" ? page.publishedVersionId : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[25rem]">
        <div className="border-b border-[var(--bld-hairline)] px-5 pb-4 pt-5">
          <SheetTitle className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
            <History className="size-4 text-muted-foreground" />
            History
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px]">Every version is kept. Restoring never deletes anything.</SheetDescription>
          {user.canWrite ? (
            <form
              className="mt-3.5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveVersion();
              }}
            >
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={160} placeholder="Name this version (optional)" className="h-8 text-[13px]" aria-label="Version name" />
              <Button type="submit" size="sm" variant="secondary" disabled={saving} className="h-8 shrink-0">
                {saving ? <LoaderCircle className="animate-spin" /> : <Bookmark />}
                Save
              </Button>
            </form>
          ) : null}
        </div>

        {/* selected version */}
        <AnimatePresence initial={false}>
          {sel ? (
            <motion.div
              key="preview"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="overflow-hidden border-b border-[var(--bld-hairline)] bg-muted/30"
            >
              <div className="flex gap-4 p-4">
                <div className="relative w-[7.5rem] shrink-0 overflow-hidden rounded-xl shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_20px_-12px_rgb(0_0_0/0.35)]">
                  {preview && preview.id === sel.id ? (
                    <LandingThumbnail doc={preview.doc} assets={preview.assets} store={storeInfo} device="mobile" sections={3} className="w-full" label={`Version of ${fullTime(sel.createdAt)}`} />
                  ) : (
                    <div className="bld-shimmer aspect-[9/16] w-full" role="status" aria-label="Loading preview" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-[13px] font-semibold">{sel.label || KIND[sel.kind].label}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {fullTime(sel.createdAt)}
                    {sel.author ? ` · ${sel.author}` : ""}
                  </p>
                  <div className="mt-auto flex flex-col gap-1.5 pt-3">
                    {user.canWrite && preview && preview.id === sel.id && !sameIds(preview.doc.tracking, draftTracking) ? (
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-foreground/[0.035] px-2.5 py-2 text-[11.5px] leading-snug text-foreground/80">
                        <Checkbox checked={restorePixels} onCheckedChange={(v) => setRestorePixelsFor(v === true ? sel.id : null)} className="mt-px" />
                        <span className="grid gap-0.5">
                          <span className="font-medium">Also restore its pixels</span>
                          <span className="text-muted-foreground">Off: the page keeps the pixels it has now.</span>
                        </span>
                      </label>
                    ) : null}
                    {user.canWrite ? (
                      <Button size="sm" onClick={() => void restore(sel)} disabled={!!busy} className="justify-start">
                        {busy === "restore" ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                        Restore this version
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" asChild className="justify-start">
                      <a href={storeView.href(`/preview/${page.id}?v=${sel.id}`)} target="_blank" rel="noopener noreferrer">
                        <ArrowUpRight />
                        Full preview
                      </a>
                    </Button>
                    {user.canWrite ? (
                      <Button size="sm" variant="ghost" onClick={() => void duplicate(sel)} disabled={!!busy} className="justify-start">
                        {busy === "duplicate" ? <LoaderCircle className="animate-spin" /> : <CopyPlus />}
                        Duplicate as new page
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="px-4 pt-3">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            label="Filter versions"
            size="sm"
            options={[
              { value: "all", label: "All" },
              { value: "named", label: "Milestones" },
              { value: "publish", label: "Published" },
              { value: "starred", label: "Starred" },
            ]}
          />
        </div>

        <div className="bld-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
          {groups.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <History className="mx-auto size-6 text-muted-foreground/60" />
              <p className="mt-3 text-[13px] font-medium">Nothing here yet</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{filter === "starred" ? "Star a version to find it quickly." : "Versions appear as you save and publish."}</p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.day} className="mt-2">
                <p className="sticky top-0 z-10 bg-[color-mix(in_oklab,var(--popover)_92%,transparent)] px-3 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">{g.day}</p>
                <ul>
                  {g.items.map((v) => (
                    <VersionRow
                      key={v.id}
                      v={v}
                      now={now}
                      live={v.id === live}
                      selected={v.id === selected}
                      canWrite={user.canWrite}
                      onSelect={() => setSelected(v.id === selected ? null : v.id)}
                      onStar={() => void toggleStar(v)}
                      onRename={(label) => void rename(v, label)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
          {hasMore ? (
            <div className="px-3 pt-3">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => void loadMore()} disabled={busy === "more"}>
                {busy === "more" ? <LoaderCircle className="animate-spin" /> : null}
                Load older versions
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VersionRow({
  v,
  now,
  live,
  selected,
  canWrite,
  onSelect,
  onStar,
  onRename,
}: {
  v: VersionSummary;
  now: number;
  live: boolean;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onStar: () => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(v.label ?? "");
  const k = KIND[v.kind];
  const auto = v.kind === "autosave";
  return (
    <li
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
        selected ? "bg-brand-soft/70" : "hover:bg-foreground/[0.035]",
      )}
    >
      <button type="button" onClick={onSelect} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-pressed={selected} aria-label={`${v.label || k.label}, ${fullTime(v.createdAt)}`} />
      <span className={cn("relative size-2 shrink-0 rounded-full", k.dot)} aria-hidden="true" />
      <div className="relative min-w-0 flex-1 pointer-events-none">
        {editing ? (
          <input
            autoFocus
            value={value}
            maxLength={160}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              setEditing(false);
              onRename(value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setValue(v.label ?? "");
                setEditing(false);
              }
            }}
            className="pointer-events-auto h-6 w-full rounded-md border border-input bg-background px-1.5 text-[13px] outline-none focus:border-ring"
            aria-label="Version name"
          />
        ) : (
          <p className={cn("truncate text-[13px] font-medium", auto && !v.label && "font-normal text-muted-foreground")}>{v.label || k.label}</p>
        )}
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span title={fullTime(v.createdAt)}>{relativeTime(v.createdAt, now)}</span>
          {v.label ? <span>· {k.label}</span> : null}
          {v.author ? <span className="truncate">· {v.author}</span> : null}
        </p>
      </div>
      {live ? <span className="relative rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">Live</span> : null}
      <div className="relative flex items-center">
        {canWrite && !editing ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Rename version"
            onClick={() => {
              setValue(v.label ?? "");
              setEditing(true);
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil />
          </Button>
        ) : null}
        {canWrite ? (
          <Button variant="ghost" size="icon-xs" aria-label={v.starred ? "Unstar version" : "Star version"} aria-pressed={v.starred} onClick={onStar} className={cn(!v.starred && "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100")}>
            <Star className={cn(v.starred && "fill-warn text-warn-ink")} />
          </Button>
        ) : null}
      </div>
    </li>
  );
}
