"use client";
/**
 * Publish with a pre-flight checklist: blocking errors (fix first), warnings (honesty & quality),
 * an explicit confirmation when example reviews/numbers remain, then a calm success state.
 *
 * Pixels (docs/OFFERS.md §A.4): PX's "Pixels that will fire" block sits under the checklist with
 * the draft's and the live version's tracking; when it reports that the page sends no ad events
 * (`onNeedsConfirm(true)`), the publish button reads "Publish without pixels" — that click is the
 * explicit confirmation. Its "Add pixel" opens the page's pixels (SEO & tracking).
 */
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, CircleAlert, Copy, Globe, LoaderCircle, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PublishPixelsBlock } from "@/components/admin/pixels/publish-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { publish } from "@/lib/editor/actions";
import { buildChecklist, type CheckFix, type CheckItem, type Checklist } from "@/lib/editor/checklist";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "./context";
import { useEnv } from "./env";
import { usePersistence } from "./persistence";
import { EASE } from "./ui";
import { resolveStoreHref, useStore } from "@/components/admin/shell/store-context";

type Phase = "check" | "publishing" | "done";

const NOTHING: Checklist = { errors: [], warnings: [], sampleSectionIds: [] };

export function PublishDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const store = useEditorStore();
  const doc = useEditor((s) => s.doc);
  const page = useEditor((s) => s.page);
  const { storeHealth, user } = useEnv();
  const { flush, call } = usePersistence();
  const [phase, setPhase] = useState<Phase>("check");
  const [confirmReal, setConfirmReal] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ path: string; message: string; sectionId?: string }[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** PX block: publishing now means publishing without any ad pixel */
  const [noPixels, setNoPixels] = useState(false);
  const liveDoc = useEditor((s) => s.liveDoc);

  // checked only while the dialog is open (validating every section on each keystroke is wasted
  // work); the last result stays on screen while the dialog fades out
  const isPublished = page.status === "published";
  const live = useMemo<Checklist | null>(() => (open ? buildChecklist(doc, storeHealth, undefined, { library: null, health: {}, live: isPublished }) : null), [open, doc, storeHealth, isPublished]);
  const [kept, setKept] = useState<Checklist>(NOTHING);
  if (live && live !== kept) setKept(live);
  const list = live ?? kept;
  const needsConfirm = list.sampleSectionIds.length > 0;
  const blocked = list.errors.length > 0 || (needsConfirm && !confirmReal) || !user.canPublish;
  const storeView = useStore();
  // the page's public address in its store (storeUrl: "/s/<h>/<slug>" on the platform host, P mode)
  const url = storeView.live(page.slug);

  const reset = () => {
    setPhase("check");
    setConfirmReal(false);
    setServerIssues([]);
    setFailure(null);
  };

  const goFix = (fix: CheckFix | undefined) => {
    if (!fix) return;
    const s = store.getState();
    onOpenChange(false);
    if (fix.sectionId) {
      s.setInteractive(false);
      s.select(fix.sectionId);
    } else if (fix.tab) {
      s.select(null);
      s.setLeftTab(fix.tab);
    }
  };

  const run = async () => {
    setFailure(null);
    setServerIssues([]);
    setPhase("publishing");
    if (needsConfirm && confirmReal) {
      // the merchant confirmed the remaining content is real: record it in the page
      store.getState().updateDoc((d) => {
        for (const s of d.sections) if (list.sampleSectionIds.includes(s.id)) (s.data as Record<string, unknown>).sample = false;
      });
    }
    if (!(await flush())) {
      setPhase("check");
      const st = store.getState();
      setFailure(st.conflict ? "This page was changed somewhere else — resolve that first." : (st.saveError === "offline" ? "You are offline. Publishing will work once the connection is back." : st.saveError) ?? "Your latest changes could not be saved.");
      return;
    }
    let res;
    try {
      // the token is read when the job starts: publish exactly the draft this editor saved
      res = await call(() => publish({ pageId: page.id, baseUpdatedAt: store.getState().page.updatedAt }));
    } catch {
      setPhase("check");
      setFailure("The server could not be reached. Check your connection and try again.");
      return;
    }
    if (!res.ok) {
      setPhase("check");
      if (res.error === "conflict") {
        // hand over to the conflict dialog (load theirs / keep mine), then publish again
        onOpenChange(false);
        setTimeout(reset, 200);
        store.getState().saveConflict(res.serverUpdatedAt ?? 0);
        return;
      }
      setFailure(res.message);
      setServerIssues(res.issues ?? []);
      return;
    }
    const st = store.getState();
    st.setPage(res.page);
    if (res.version) st.upsertVersion(res.version);
    st.markLive(st.savedDoc);
    setPhase("done");
    if (res.skippedSections.length) toast.warning(`${res.skippedSections.length} section(s) failed to render and were left out of the live page.`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — select the link and copy it manually.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (phase === "publishing") return;
        onOpenChange(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[30rem]" showCloseButton={phase !== "publishing"}>
        <AnimatePresence mode="wait" initial={false}>
          {phase === "done" ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE }} className="relative px-7 pb-7 pt-9 text-center">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--brand)_20%,transparent),transparent)]" />
              <SuccessMark />
              <DialogTitle className="relative mt-5 font-display text-[26px] font-semibold leading-none tracking-[-0.035em]">Your page is live</DialogTitle>
              <DialogDescription className="relative mt-2 text-[13px]">Visitors can order from it right now.</DialogDescription>
              <div className="relative mx-auto mt-5 flex max-w-sm items-center gap-1 rounded-xl bg-foreground/[0.04] p-1 ring-1 ring-inset ring-foreground/[0.06]">
                <span className="min-w-0 flex-1 truncate px-2.5 text-left font-mono text-xs text-foreground/80">{url}</span>
                <Button size="sm" variant="ghost" onClick={() => void copy()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="relative mt-6 flex justify-center gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Keep editing
                </Button>
                <Button asChild variant="brand">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Open live page
                    <ArrowUpRight />
                  </a>
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="check" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="border-b border-[var(--bld-hairline)] px-6 pb-4 pt-5">
                <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">{page.status === "published" ? "Publish changes" : "Publish page"}</DialogTitle>
                <DialogDescription className="mt-1 text-[12.5px]">
                  Goes live at <span className="font-mono text-foreground/80">{storeView.livePath(page.slug)}</span>
                </DialogDescription>
              </div>

              <div className="bld-scroll max-h-[min(60vh,28rem)] overflow-y-auto px-6 py-4">
                {list.errors.length === 0 && list.warnings.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-[13px] text-emerald-800 dark:text-emerald-300">
                    <Check className="size-4" />
                    Everything looks good.
                  </div>
                ) : null}
                <CheckGroup title="Fix before publishing" items={list.errors} tone="error" onFix={goFix} />
                <CheckGroup title="Worth a look" items={list.warnings} tone="warning" onFix={goFix} />
                <PublishPixelsBlock pageId={page.id} draft={doc.tracking} live={isPublished ? (liveDoc?.tracking ?? null) : null} onNeedsConfirm={setNoPixels} onAddPixel={() => goFix({ tab: "seo" })} />
                {serverIssues.length ? (
                  <div className="mt-4 rounded-xl bg-destructive/8 p-3 text-[12px] text-destructive">
                    {serverIssues.slice(0, 6).map((i, k) => (
                      <p key={k}>
                        <span className="font-mono">{i.path}</span> — {i.message}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 border-t border-[var(--bld-hairline)] bg-muted/30 px-6 py-4">
                {needsConfirm ? (
                  <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-snug">
                    <Checkbox checked={confirmReal} onCheckedChange={(v) => setConfirmReal(v === true)} className="mt-0.5" />
                    <span>
                      <span className="font-medium text-foreground">The reviews, chats and numbers on this page are real.</span>{" "}
                      <span className="text-muted-foreground">They come from actual customers or verifiable facts — not the examples.</span>
                    </span>
                  </label>
                ) : null}
                {failure ? (
                  <p role="alert" className="flex items-start gap-2 text-[12.5px] font-medium text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    {failure}
                  </p>
                ) : null}
                {!user.canPublish ? <p className="text-[12.5px] text-muted-foreground">Your role can edit but not publish. Ask an owner or editor.</p> : null}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={phase === "publishing"}>
                    Cancel
                  </Button>
                  <Button onClick={() => void run()} disabled={blocked || phase === "publishing"} aria-busy={phase === "publishing"} variant="brand" className="min-w-32">
                    {phase === "publishing" ? <LoaderCircle className="animate-spin" /> : <Globe />}
                    {phase === "publishing" ? "Publishing…" : list.errors.length ? `${list.errors.length} to fix` : noPixels ? "Publish without pixels" : "Publish now"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function CheckGroup({ title, items, tone, onFix }: { title: string; items: CheckItem[]; tone: "error" | "warning"; onFix: (fix: CheckFix | undefined) => void }) {
  const storeView = useStore();
  if (!items.length) return null;
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground">
        {title}
        <span className={cn("rounded-full px-1.5 text-[10.5px] tabular-nums", tone === "error" ? "bg-destructive/10 text-destructive" : "bg-warn/15 text-warn-ink")}>{items.length}</span>
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 8) * 0.03 }}
            className="group flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.03]"
          >
            {tone === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-foreground">{item.title}</p>
              {item.detail ? <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{item.detail}</p> : null}
            </div>
            {item.fix?.href ? (
              <Button variant="ghost" size="xs" className="shrink-0 opacity-70 group-hover:opacity-100" asChild>
                <a href={resolveStoreHref(storeView, item.fix.href)} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">
                  Open
                  <ArrowUpRight />
                </a>
              </Button>
            ) : item.fix ? (
              <Button variant="ghost" size="xs" className="shrink-0 opacity-70 group-hover:opacity-100" onClick={() => onFix(item.fix)}>
                Fix
              </Button>
            ) : null}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/** Check mark drawn inside a soft ring. */
function SuccessMark() {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className="relative mx-auto grid size-16 place-items-center rounded-full bg-brand text-brand-foreground shadow-[0_12px_30px_-10px_var(--brand)]"
    >
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: EASE, delay: 0.15 }} />
      </svg>
    </motion.div>
  );
}
