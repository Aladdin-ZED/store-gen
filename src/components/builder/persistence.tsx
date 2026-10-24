"use client";
/**
 * Talking to the server from the builder.
 *
 *  - Every server action goes through one serial queue whose jobs read the store when they START
 *    (not when queued), so the optimistic-concurrency token (page.updatedAt) is always the newest —
 *    an autosave queued behind a rename never reports a false conflict.
 *  - Autosave: 1.5 s after the last edit, on tab hide, when the network comes back, on Ctrl+S
 *    (flush). Failures retry with backoff; a conflict stops autosave until the user decides.
 *  - Leaving the page with unsaved work asks for confirmation.
 *  - Edits the server has not confirmed are kept in this browser (localStorage) whenever a save
 *    fails or the tab is hidden / closed, so a reload, a crash, an expired session or a redeploy
 *    never loses them: the next time the page opens, the builder offers to bring them back. The copies are
 *    keyed by store and member (LND-29, TENANCY-MAP §7.8): on a shared device, another member or another store's
 *    dashboard never sees them.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveDraft } from "@/lib/editor/actions";
import type { EditorStore } from "@/lib/editor/store";
import { jsonBytes, MAX_DOC_BYTES } from "@/lib/editor/types";
import { PageDoc } from "@/lib/page/schema";
import { useStore } from "@/components/admin/shell/store-context";
import { useEditorStore } from "./context";
import { fullTime, useEnv } from "./env";

const AUTOSAVE_DELAY = 1500;
const RETRY_STEPS = [3_000, 8_000, 20_000, 45_000, 60_000];

export interface Persistence {
  /** run a server call after every earlier one finished */
  call<T>(job: () => Promise<T>): Promise<T>;
  /** save now if needed; true when the server holds the current doc */
  flush(): Promise<boolean>;
  /** overwrite the server draft with ours after a conflict */
  overwrite(): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/* local copy of unsaved edits                                         */
/* ------------------------------------------------------------------ */

/** Unsaved copies older than this are not offered any more. */
const BACKUP_TTL_MS = 7 * 24 * 3_600_000;
const BACKUP_PREFIX = "bld:unsaved:";

interface Backup {
  v: 1;
  /** epoch ms when the copy was written */
  at: number;
  /** the server's updatedAt the edits were based on */
  baseUpdatedAt: number;
  doc: unknown;
}

/** Whose copies: the store on screen and the signed-in member ("<storeId>:<userId>:"). */
type Owner = string;
const ownerOf = (storeId: string, userId: string): Owner => `${storeId}:${userId}:`;

/** One copy per store, member, page and editor tab, so a clean tab never wipes another tab's unsaved work. */
const backupKey = (owner: Owner, pageId: string, tab: string) => `${BACKUP_PREFIX}${owner}${pageId}:${tab}`;

function removeBackup(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable (private mode, blocked): nothing to remove
  }
}

/** Keep the current doc in this browser while the server does not hold it. */
function writeBackup(store: EditorStore, owner: Owner, tab: string): void {
  const s = store.getState();
  if (s.doc === s.savedDoc) return;
  try {
    const backup: Backup = { v: 1, at: Date.now(), baseUpdatedAt: s.page.updatedAt, doc: s.doc };
    localStorage.setItem(backupKey(owner, s.page.id, tab), JSON.stringify(backup));
  } catch {
    // quota or storage blocked: the beforeunload prompt is the remaining safety net
  }
}

/** Every valid copy left for a page, newest first (expired or damaged ones are deleted). */
function readBackups(owner: Owner, pageId: string): { key: string; at: number; baseUpdatedAt: number; doc: PageDoc }[] {
  const out: { key: string; at: number; baseUpdatedAt: number; doc: PageDoc }[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${BACKUP_PREFIX}${owner}${pageId}:`)) keys.push(key);
    }
    for (const key of keys) {
      try {
        const b = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Backup> | null;
        const parsed = PageDoc.safeParse(b?.doc);
        if (b?.v === 1 && typeof b.at === "number" && typeof b.baseUpdatedAt === "number" && parsed.success && Date.now() - b.at <= BACKUP_TTL_MS) {
          out.push({ key, at: b.at, baseUpdatedAt: b.baseUpdatedAt, doc: parsed.data });
        } else removeBackup(key);
      } catch {
        removeBackup(key);
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------------------------ */
/* queue + autosave                                                    */
/* ------------------------------------------------------------------ */

function createPersistence(store: EditorStore, owner: Owner): Persistence & { start(): () => void } {
  const tab = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  const backup = () => writeBackup(store, owner, tab);
  const dropBackup = () => removeBackup(backupKey(owner, store.getState().page.id, tab));
  let tail: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const call = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    timer = setTimeout(() => void save(false), ms);
  };

  const save = (force: boolean): Promise<boolean> =>
    call(async () => {
      clear();
      const s = store.getState();
      if (s.conflict && !force) return false;
      if (s.doc === s.savedDoc && !force) return true;
      const doc = s.doc;
      if (jsonBytes(doc) > MAX_DOC_BYTES) {
        s.saveFailed("This page is too large to save. Remove some sections or long texts.");
        backup();
        return false;
      }
      s.beginSave();
      try {
        const res = await saveDraft({ pageId: s.page.id, doc, baseUpdatedAt: s.page.updatedAt, force });
        const now = store.getState();
        if (res.ok) {
          failures = 0;
          now.saveSucceeded(doc, res.updatedAt, res.version);
          const after = store.getState();
          if (after.doc === doc) dropBackup();
          else schedule(AUTOSAVE_DELAY);
          return after.doc === doc;
        }
        backup();
        if (res.error === "conflict") {
          now.saveConflict(res.serverUpdatedAt ?? 0);
          return false;
        }
        now.saveFailed(res.message);
        if (res.error === "server" || res.error === "auth") schedule(RETRY_STEPS[Math.min(failures++, RETRY_STEPS.length - 1)]!);
        return false;
      } catch {
        // network failure (offline, server restarting): keep the edits, retry with backoff
        store.getState().saveFailed("offline");
        backup();
        schedule(RETRY_STEPS[Math.min(failures++, RETRY_STEPS.length - 1)]!);
        return false;
      }
    });

  const start = () => {
    const unsub = store.subscribe((s, prev) => {
      if (s.doc !== prev.doc && s.doc !== s.savedDoc && !s.conflict) schedule(AUTOSAVE_DELAY);
      // "load the latest" after a conflict: the local edits were dropped on purpose
      if (s.conflict === null && prev.conflict !== null && s.doc === s.savedDoc) dropBackup();
    });
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      backup();
      void save(false);
    };
    const onOnline = () => void save(false);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = store.getState();
      if (s.doc !== s.savedDoc || s.saving) {
        backup();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      unsub();
      clear();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  };

  return {
    call,
    flush: () => save(false),
    overwrite: () => save(true),
    start,
  };
}

/**
 * On a shared device (LND-29): the copies another member left, and the pre-store copies ("bld:unsaved:<page>:<tab>"),
 * are deleted when this member opens the builder. The member's own copies in their other stores stay.
 */
function purgeForeignBackups(owner: Owner): void {
  const userId = owner.split(":")[1];
  try {
    const foreign: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(BACKUP_PREFIX)) continue;
      // "<storeId>:<userId>:<pageId>:<tab>"
      const parts = key.slice(BACKUP_PREFIX.length).split(":");
      if (parts.length !== 4 || parts[1] !== userId) foreign.push(key);
    }
    for (const key of foreign) removeBackup(key);
  } catch {
    // storage unavailable: nothing to purge
  }
}

/** Offer the unsaved edits an earlier session of this page left in the browser (the newest copy). */
function offerRecovery(store: EditorStore, owner: Owner): () => void {
  purgeForeignBackups(owner);
  const s = store.getState();
  const current = JSON.stringify(s.doc);
  const copies = readBackups(owner, s.page.id).filter((b) => {
    if (JSON.stringify(b.doc) !== current) return true;
    removeBackup(b.key); // already what the server holds
    return false;
  });
  const found = copies[0];
  if (!found) return () => undefined;
  const changedSince = found.baseUpdatedAt !== s.page.updatedAt;
  const id = toast("Unsaved edits found", {
    description: changedSince
      ? `From ${fullTime(found.at)}. The page was saved elsewhere since — restoring replaces that version.`
      : `From ${fullTime(found.at)}, not saved before this page was closed.`,
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Restore",
      onClick: () => {
        store.getState().replaceDoc(found.doc);
        removeBackup(found.key);
        toast.success("Your edits are back", { description: "They will be saved in a moment. Undo puts the saved version back." });
      },
    },
    cancel: { label: "Discard", onClick: () => removeBackup(found.key) },
  });
  return () => toast.dismiss(id);
}

const PersistenceContext = createContext<Persistence | null>(null);

export function PersistenceProvider({ children }: { children: ReactNode }) {
  const store = useEditorStore();
  const owner = ownerOf(useStore().id, useEnv().user.id);
  const [p] = useState(() => createPersistence(store, owner));
  useEffect(() => p.start(), [p]);
  useEffect(() => offerRecovery(store, owner), [store, owner]);
  return <PersistenceContext.Provider value={p}>{children}</PersistenceContext.Provider>;
}

export function usePersistence(): Persistence {
  const p = useContext(PersistenceContext);
  if (!p) throw new Error("usePersistence must be used inside <PersistenceProvider>");
  return p;
}
