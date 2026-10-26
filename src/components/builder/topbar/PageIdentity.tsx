"use client";
/**
 * Page identity in the top bar: editable name, address (slug) popover with validation, live status.
 */
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Copy, Globe, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { updatePageMeta } from "@/lib/editor/actions";
import { PageName, SlugInput } from "@/lib/editor/schemas";
import { selectIsLive } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { useEditor, useEditorApi, useEditorStore } from "../context";
import { useEnv } from "../env";
import { usePersistence } from "../persistence";
import { EASE, Hint } from "../ui";
import { useStore } from "@/components/admin/shell/store-context";

/* ------------------------------------------------------------------ */
/* name                                                                */
/* ------------------------------------------------------------------ */

export function PageNameField() {
  const name = useEditor((s) => s.page.name);
  const pageId = useEditor((s) => s.page.id);
  const api = useEditorApi();
  const { call } = usePersistence();
  const { user } = useEnv();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    const parsed = PageName.safeParse(value);
    if (!parsed.success || parsed.data === name) {
      setValue(name);
      return;
    }
    const prev = name;
    api.setPage({ name: parsed.data });
    const res = await call(() => updatePageMeta({ pageId, name: parsed.data }));
    // a rename leaves the draft (and its concurrency token) alone
    if (res.ok) api.setPage({ name: res.page.name });
    else {
      api.setPage({ name: prev });
      setValue(prev);
      toast.error(res.message);
    }
  };

  if (editing) {
    return (
      <Input
        ref={input}
        value={value}
        maxLength={160}
        aria-label="Page name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
        className="h-7 w-56 rounded-md px-2 text-[13px] font-semibold"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={!user.canWrite}
      onClick={() => {
        setValue(name);
        setEditing(true);
      }}
      title="Rename page"
      className="max-w-60 truncate rounded-md px-2 py-1 text-left text-[13px] font-semibold tracking-[-0.01em] text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:hover:bg-transparent"
    >
      {name}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* status                                                              */
/* ------------------------------------------------------------------ */

export function LiveStatus() {
  const status = useEditor((s) => s.page.status);
  const live = useEditor(selectIsLive);
  const published = status === "published";
  const label = !published ? "Draft" : live ? "Live" : "Live · edited";
  const tip = !published
    ? "Not visible to visitors yet."
    : live
      ? "Visitors see exactly this version."
      : "Visitors still see the last published version. Publish to update it.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold",
            !published && "bg-foreground/[0.06] text-muted-foreground",
            published && live && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
            published && !live && "bg-warn/14 text-warn-ink",
          )}
        >
          <span className="bld-dot" data-pulse={published && live ? "true" : "false"} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* slug                                                                */
/* ------------------------------------------------------------------ */

export function SlugControl() {
  const page = useEditor((s) => s.page);
  const store = useEditorStore();
  const { call, flush } = usePersistence();
  const { user } = useEnv();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(page.slug);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const storeView = useStore();
  // the store's public base ("https://<host>/s/<h>" in P mode): the prefix of every page address
  const origin = storeView.live("");
  const published = page.status === "published";
  const parsed = SlugInput.safeParse(value);
  const next = parsed.success ? parsed.data : null;
  const changed = next !== null && next !== page.slug;

  const save = async () => {
    if (!next || !changed) return;
    setBusy(true);
    setError(null);
    if (published && !(await flush())) {
      setBusy(false);
      setError("Save your changes first (see the status in the top bar).");
      return;
    }
    const res = await call(() => updatePageMeta({ pageId: page.id, slug: next, ...(published ? { baseUpdatedAt: store.getState().page.updatedAt } : {}) }));
    setBusy(false);
    if (!res.ok) {
      if (res.error === "conflict") {
        setOpen(false);
        store.getState().saveConflict(res.serverUpdatedAt ?? 0);
        return;
      }
      setError(res.message);
      return;
    }
    const st = store.getState();
    // a move only touches the draft token when it re-published (checked against ours first)
    st.setPage(res.republished ? res.page : { slug: res.page.slug, name: res.page.name });
    if (res.republished) {
      st.upsertVersion(res.republished);
      // the server published the saved draft
      st.markLive(st.savedDoc);
    }
    setOpen(false);
    toast.success(published ? `Live page moved to ${storeView.livePath(res.page.slug)}` : `Address set to ${storeView.livePath(res.page.slug)}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(storeView.live(page.slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Copy failed — select the address and copy it manually.");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValue(page.slug);
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 max-w-52 items-center gap-1.5 rounded-md px-2 font-mono text-[11.5px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Page address"
        >
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate">{storeView.livePath(page.slug)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[22rem] p-0">
        <div className="space-y-3 p-4">
          <div>
            <p className="text-sm font-semibold">Page address</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Short, lowercase, easy to say on the phone.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-2"
          >
            <div className="flex h-9 items-center overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <span className="max-w-32 truncate border-e bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground" title={origin}>
                {origin.replace(/^https?:\/\//, "")}/
              </span>
              <input
                value={value}
                disabled={!user.canWrite || busy}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                spellCheck={false}
                autoCapitalize="none"
                aria-label="Address"
                aria-invalid={!parsed.success || !!error || undefined}
                className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-xs outline-none"
              />
            </div>
            <AnimatePresence initial={false}>
              {!parsed.success || error ? (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="text-[11.5px] font-medium text-destructive"
                  role="alert"
                >
                  {error ?? parsed.error?.issues[0]?.message}
                </motion.p>
              ) : next && next !== value ? (
                <p className="text-[11.5px] text-muted-foreground">
                  Will be saved as <span className="font-mono text-foreground">/{next}</span>
                </p>
              ) : null}
            </AnimatePresence>
            {published && changed ? (
              <Hint tone="warn">
                {user.canPublish
                  ? "Moving a live page re-publishes it at the new address right away (with any unpublished edits). Links to the old address stop working."
                  : "This page is live: only someone who can publish can move it."}
              </Hint>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                {published ? (
                  <Button type="button" variant="ghost" size="sm" asChild>
                    <a href={storeView.live(page.slug)} target="_blank" rel="noopener noreferrer">
                      <ArrowUpRight />
                      Open
                    </a>
                  </Button>
                ) : null}
              </div>
              <Button type="submit" size="sm" disabled={!changed || busy || !user.canWrite || (published && !user.canPublish)}>
                {busy ? <LoaderCircle className="animate-spin" /> : null}
                {published ? "Move & publish" : "Save address"}
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
