"use client";
/**
 * The agent console (P4 CALL CENTER; operations.md OPE-§13 entirely, §5.7, §6.4, §6.5, §7.2, §8.2, OD36, OD37, OD53,
 * OD60; core §I.3, §I.6, §I.8). One order at a time, phone-first and keyboard-first. It talks only to the hot path:
 *
 *   N              POST /ops/next (Idempotency-Key minted when the control rendered); skeleton after 150 ms, ≥ 300 ms
 *   C / W          POST /ops/reveal (why call / whatsapp + template) → tel: / wa.me; the number lives in this state only
 *   1-6            POST /ops/outcome with andNext: the pressed cell pending at once, the next card slides in (240 ms);
 *                  a network error goes to the one-entry outbox (outbox.ts: 0.5 … 15 s, the same key, "Saving…",
 *                  then "Saved" or "Could not save, tap to retry"); 409 → the fresh card + "Updated by {name} just now"
 *   presence       POST /ops/presence (Online / Break / Offline), and the heartbeat every 60 s while the tab is visible
 *   counters       GET /ops/state?view=queue every 15 s while visible, If-None-Match → 304 (my callbacks, today)
 *
 * The rest goes through the queue's own server actions (Skip, inbound lookup and Take, the note, the script's language
 * tab, the timeline column) and two of P4's other actions (Keep both, Open calls now). Returning from the dialer
 * (`visibilitychange` / `pageshow`) focuses the grid and announces "How did the call go?" with "Call started n min ago".
 * Keys by `event.code` (keys.ts), never inside a field or under an open sheet. Read-only (impersonation, a read-only
 * store): a banner, no outcome and no reveal.
 */
import "./queue.css";
import { ArrowRightIcon, ChevronDownIcon, KeyboardIcon, ListChecksIcon, MessageCircleIcon, PhoneIcon, PhoneIncomingIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dismissDuplicateAction } from "@/app/app/[store]/orders/actions";
import { addNoteAction, inboundLookupAction, queueScriptAction, queueTimelineAction, releaseOrderAction, takeOrderAction } from "@/app/app/[store]/queue/actions";
import { openCallsNowAction } from "@/app/app/[store]/team/callcenter/actions";
import type { QueueState } from "@/lib/callcenter/board.server";
import type { QueueOrder } from "@/lib/callcenter/card";
import type { ConsoleBoot } from "@/lib/callcenter/console.server";
import type { OutcomeData } from "@/lib/callcenter/outcomes";
import type { Presence } from "@/lib/callcenter/presence";
import type { CompiledScript, ScriptLocale } from "@/lib/callcenter/script";
import { dirOf, type MessageKey } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import type { TimelineItem } from "@/lib/orders/events";
import type { NextResult } from "@/lib/orders/queue";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { isEditable, overlayOpen, queueKeyOf, type OutcomeKey, type QueueKeyId } from "./keys";
import { OrderCard, type Revealed } from "./order-card";
import { CONFIRM_CELLS, DELIVERY_CELLS, OutcomeGrid } from "./outcome-grid";
import { clearOtherPending, clearPending, hot, loadPending, NetworkError, newIdem, opsPath, savePending, withRetry, type HotAnswer, type PendingEntry } from "./outbox";
import { HistoryBlock, InboundPanel, NoteComposer, PresenceSwitch, TimelineBlock, TodayCounters, type InboundAnswer } from "./parts";
import { CallbackList, CallbackSheet, CallbacksSheet, DateSheet, KeysSheet, MoreSheet, ReasonSheet, WaSheet, type PickReason } from "./pickers";
import { ScriptPanel } from "./script-panel";
import { ago, clock, countdown, ymdLabel } from "./time";

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

type NoCard = Exclude<NextResult, { ok: true }>;
type View = { k: "idle" } | { k: "card"; card: QueueOrder; seq: number } | { k: "none"; r: NoCard } | { k: "error"; code: string };
type Notice = { tone: "info" | "ok" | "error"; text: string; sticky?: boolean } | null;
type SheetId = null | "callback" | "cancel" | "recall" | "more" | "hold" | "reschedule" | "wa" | "keys" | "callbacks";
interface Saving {
  key: OutcomeKey | null;
  phase: "saving" | "failed";
  entry: PendingEntry;
  body: Record<string, unknown>;
}
/** the idempotency keys of one card, minted when it renders (OD36) */
interface CardKeys {
  outcome: string;
  reveal: Map<string, string>;
}

type OutcomeAnswer = OutcomeData | { ok: false; error: string; card?: QueueOrder | null; updatedBy?: string | null };
type RevealAnswer = { ok: true; e164: string; national: string; tel: string; wa: string } | { ok: false; error: string };

const HEARTBEAT_MS = 60_000;
const POLL_MS = 15_000;
const TICK_MS = 30_000;
const SKELETON_AFTER_MS = 150;
const SKELETON_MIN_MS = 300;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const WA_DEFAULT = "builtin:wa:confirm";

/** a media query as an external store (no state set inside an effect) */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const mintCardKeys = (card: QueueOrder): CardKeys => {
  const reveal = new Map<string, string>();
  for (const why of ["call", "whatsapp", "view"]) reveal.set(why, newIdem());
  for (const tpl of card.templates) reveal.set(`whatsapp:${tpl.id}`, newIdem());
  return { outcome: newIdem(), reveal };
};

/* ------------------------------------------------------------------ */
/* the console                                                         */
/* ------------------------------------------------------------------ */

export function AgentConsole({ boot, autoNext }: { boot: ConsoleBoot; autoNext: boolean }) {
  const t = useT();
  const locale = boot.locale;
  const dir = dirOf(locale);
  const handle = boot.handle;
  const readOnly = boot.readOnly !== null;
  const canOutcome = boot.can.outcome;

  const [presence, setPresence] = useState<Presence>(boot.presence);
  const [held, setHeld] = useState(boot.held);
  const [view, setView] = useState<View>({ k: "idle" });
  const [keys, setKeys] = useState<CardKeys | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<Saving | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [qstate, setQstate] = useState<QueueState>(boot.state);
  const [nextKey, setNextKey] = useState(() => newIdem());
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [askLine, setAskLine] = useState(false);
  const [holdYmd, setHoldYmd] = useState<string | null>(null);
  const [objectionId, setObjectionId] = useState<string | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptOverride, setScriptOverride] = useState<CompiledScript | null>(null);
  const [scriptLoading, setScriptLoading] = useState<ScriptLocale | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [inboundOpen, setInboundOpen] = useState(false);
  const [takingId, setTakingId] = useState<string | null>(null);
  const [opensAt, setOpensAt] = useState<string | null>(boot.opensAt);
  const [now, setNow] = useState(() => Date.parse(boot.now));
  const wide = useMedia("(min-width: 1024px)");
  const mid = useMedia("(min-width: 768px)");
  const router = useRouter();

  const gridRef = useRef<HTMLDivElement>(null);
  const inboundRef = useRef<HTMLInputElement>(null);
  const inboundWideRef = useRef<HTMLInputElement>(null);
  const etagRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const card = view.k === "card" ? view.card : null;
  const lane = card?.lane ?? "confirm";
  const cells = useMemo(() => {
    const base = lane === "delivery" ? DELIVERY_CELLS : CONFIRM_CELLS;
    return holdYmd && lane === "confirm" ? base.map((c) => (c.key === "o1" ? { ...c, sub: t("ops.hold.shipFrom", { date: ymdLabel(holdYmd, locale) }) } : c)) : base;
  }, [lane, holdYmd, t, locale]);
  const script = card ? (scriptOverride && scriptOverride.templateId !== "" ? scriptOverride : card.script) : null;

  /* ---------------- small helpers ---------------- */

  const say = useCallback((n: Notice, ms = 4_000) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(n);
    if (n && !n.sticky) noticeTimer.current = setTimeout(() => setNotice(null), ms);
  }, []);

  const errorText = useCallback(
    (code: string): string => {
      for (const k of [`ops.error.${code}`, `error.${code}`] as MessageKey[]) {
        const v = t(k);
        if (v !== k) return v;
      }
      return t("ops.error.generic");
    },
    [t],
  );

  const showCard = useCallback((c: QueueOrder) => {
    seqRef.current += 1;
    setKeys(mintCardKeys(c));
    setView({ k: "card", card: c, seq: seqRef.current });
    setScriptOverride(null);
    setObjectionId(null);
    setHoldYmd(null);
    setAskLine(false);
    setTimeline(null);
    setScriptOpen(window.matchMedia("(min-width: 1024px)").matches);
    setRevealed((r) => (r && r.orderId === c.id ? r : null));
  }, []);

  const applyNext = useCallback(
    (r: NextResult) => {
      setHeld(false);
      if (r.ok) {
        setPresence("online");
        showCard(r.order);
        return;
      }
      setKeys(null);
      setRevealed(null);
      if (r.reason === "on_break") setPresence("break");
      if (r.reason === "outside_window") setOpensAt(r.opensAt);
      setView({ k: "none", r });
    },
    [showCard],
  );

  /** the skeleton rule of core §I.8 rule 1: after 150 ms, then kept at least 300 ms */
  const withSkeleton = useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    let shownAt = 0;
    const timer = setTimeout(() => {
      shownAt = Date.now();
      setLoading(true);
    }, SKELETON_AFTER_MS);
    try {
      return await p;
    } finally {
      clearTimeout(timer);
      if (shownAt) {
        const left = SKELETON_MIN_MS - (Date.now() - shownAt);
        if (left > 0) await sleep(left);
      }
      setLoading(false);
    }
  }, []);

  /* ---------------- Next (N) ---------------- */

  const busyRef = useRef(false);
  const next = useCallback(async () => {
    if (readOnly || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    say(null);
    try {
      const a = await withSkeleton(hot<NextResult | { ok: false; error: string }>(handle, "next", {}, nextKey));
      setNextKey(newIdem());
      const b = a.body;
      if (a.status === 200 && b && ("order" in b || "reason" in b)) applyNext(b as NextResult);
      else setView({ k: "error", code: "error" in b ? b.error : "server" });
    } catch (err) {
      setView({ k: "error", code: err instanceof NetworkError ? "network" : "server" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [readOnly, handle, nextKey, withSkeleton, applyNext, say]);

  /* ---------------- outcomes (1-6) and the outbox ---------------- */

  const finishOutcome = useCallback(
    (a: HotAnswer<OutcomeAnswer>, orderId: string) => {
      const b = a.body;
      if (a.status === 200 && b.ok) {
        say({ tone: "ok", text: t("ops.saved") }, 1_600);
        const n = (b as OutcomeData).next;
        if (n) applyNext(n);
        else setView({ k: "idle" });
        if (b.ok && "warning" in b && b.warning === "outside_window") say({ tone: "info", text: t("ops.callback.outsideHours") });
        return;
      }
      const code = "error" in b ? b.error : "server";
      if (code === "conflict") {
        const fresh = "card" in b ? b.card : null;
        if (fresh) {
          showCard(fresh);
          const name = "updatedBy" in b ? b.updatedBy : null;
          say({ tone: "info", text: name ? t("ops.state.conflict", { name }) : t("ops.state.conflictAnon"), sticky: true });
        } else {
          setView({ k: "idle" });
          setKeys(null);
          say({ tone: "info", text: t("ops.state.leaseLost"), sticky: true });
        }
        return;
      }
      if (code === "not_found") {
        setView((v) => (v.k === "card" && v.card.id === orderId ? { k: "idle" } : v));
        setKeys(null);
        say({ tone: "info", text: t("ops.state.leaseLost"), sticky: true });
        return;
      }
      // the server answered a refusal: the grid comes back with the reason, the card stays (a fresh key next time)
      setKeys((k) => (k ? { ...k, outcome: newIdem() } : k));
      say({ tone: "error", text: errorText(code), sticky: true });
    },
    [applyNext, errorText, say, showCard, t],
  );

  const sendOutcome = useCallback(
    async (s: Saving) => {
      setSaving({ ...s, phase: "saving" });
      savePending(boot.storeId, boot.userId, s.entry);
      const a = await withRetry(() => hot<OutcomeAnswer>(handle, "outcome", s.body, s.entry.idem)).catch(() => null);
      if (!a) {
        // offline after the whole schedule: same key, one tap retries (OD37)
        setSaving({ ...s, phase: "failed" });
        return;
      }
      clearPending(boot.storeId, boot.userId);
      setSaving(null);
      setKeys((k) => (k ? { ...k, outcome: newIdem() } : k));
      finishOutcome(a, s.entry.orderId);
    },
    [boot.storeId, boot.userId, handle, finishOutcome],
  );

  const submit = useCallback(
    (cell: OutcomeKey | null, outcome: string, extra: Record<string, unknown> = {}) => {
      if (!card || !keys || saving || readOnly || !canOutcome) return;
      setSheet(null);
      const channel = revealed && revealed.orderId === card.id && revealed.why === "whatsapp" ? "whatsapp" : "call";
      const body: Record<string, unknown> = {
        orderId: card.id,
        expectRev: card.rev,
        channel,
        outcome,
        andNext: true,
        ...(card.inbound ? { inbound: true } : {}),
        ...(objectionId ? { objectionId } : {}),
        ...extra,
      };
      const entry: PendingEntry = { orderId: card.id, rev: card.rev, outcome, idem: keys.outcome, at: Date.now() };
      say(null);
      void sendOutcome({ key: cell, phase: "saving", entry, body });
    },
    [card, keys, saving, readOnly, canOutcome, revealed, objectionId, say, sendOutcome],
  );

  const skip = useCallback(async () => {
    if (!card || readOnly || busyRef.current || saving) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await releaseOrderAction(card.id, "skip");
      if (!r.ok || !r.data.ok) {
        say({ tone: "error", text: errorText(r.ok ? (r.data.ok ? "server" : r.data.error) : r.error), sticky: true });
        return;
      }
      setView({ k: "idle" });
      setKeys(null);
      setRevealed(null);
    } catch {
      say({ tone: "error", text: t("ops.error.network"), sticky: true });
      return;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    say({ tone: "info", text: t("ops.skipped") });
    await next();
  }, [card, readOnly, saving, say, errorText, t, next]);

  const press = useCallback(
    (k: OutcomeKey) => {
      if (!card) return;
      if (lane === "delivery") {
        if (k === "o1") submit(k, "customer_informed");
        else if (k === "o2") setSheet("reschedule");
        else if (k === "o3") submit(k, "no_answer");
        else if (k === "o4") submit(k, "busy");
        else if (k === "o5") setSheet("recall");
        else void skip();
        return;
      }
      if (k === "o1") submit(k, "confirmed", holdYmd ? { shipAfter: holdYmd } : {});
      else if (k === "o2") submit(k, "no_answer");
      else if (k === "o3") submit(k, "busy");
      else if (k === "o4") setSheet("callback");
      else if (k === "o5") setSheet("cancel");
      else setSheet("more");
    },
    [card, lane, holdYmd, submit, skip],
  );

  /* ---------------- reveal (C, W, Show number) ---------------- */

  const reveal = useCallback(
    async (why: "call" | "whatsapp" | "view", templateId?: string) => {
      if (!card || !keys || !boot.can.reveal) return;
      setSheet(null);
      const keyName = why === "whatsapp" && templateId ? `whatsapp:${templateId}` : why;
      const idem = keys.reveal.get(keyName) ?? newIdem();
      keys.reveal.set(keyName, idem);
      // a tab opened inside the tap, so no pop-up blocker refuses it after the await
      const tab = why === "whatsapp" ? window.open("", "_blank") : null;
      try {
        const a = await hot<RevealAnswer>(handle, "reveal", { orderId: card.id, why, ...(why === "whatsapp" ? { templateId: templateId ?? WA_DEFAULT } : {}) }, idem);
        const b = a.body;
        if (!b.ok) {
          tab?.close();
          say({ tone: "error", text: b.error === "rate_limited" ? errorText("rate_limited") : errorText(b.error), sticky: true });
          return;
        }
        setRevealed({ orderId: card.id, national: b.national, e164: b.e164, why, at: Date.now() });
        if (why === "call") {
          const link = document.createElement("a");
          link.href = b.tel;
          link.rel = "noopener";
          link.click();
        } else if (why === "whatsapp") {
          if (tab) {
            tab.opener = null;
            tab.location.href = b.wa;
          } else window.open(b.wa, "_blank", "noopener");
        }
      } catch {
        tab?.close();
        say({ tone: "error", text: t("ops.error.network"), sticky: true });
      }
    },
    [card, keys, boot.can.reveal, handle, say, errorText, t],
  );

  /* ---------------- skip, presence, inbound, callbacks ---------------- */

  const changePresence = useCallback(
    async (p: Presence) => {
      if (readOnly) return;
      const before = presence;
      setPresence(p);
      try {
        const a = await hot<{ ok: boolean; error?: string }>(handle, "presence", { presence: p }, null);
        if (!a.body.ok) {
          setPresence(before);
          say({ tone: "error", text: errorText(a.body.error ?? "server"), sticky: true });
          return;
        }
        if (p !== "online") {
          // Break and Offline release the held claim on the server (OPE-§13.2a)
          setView({ k: "none", r: { ok: false, reason: p === "break" ? "on_break" : "offline" } });
          setKeys(null);
          setRevealed(null);
        } else setView((v) => (v.k === "none" && (v.r.reason === "on_break" || v.r.reason === "offline") ? { k: "idle" } : v));
      } catch {
        setPresence(before);
        say({ tone: "error", text: t("ops.error.network"), sticky: true });
      }
    },
    [readOnly, presence, handle, say, errorText, t],
  );

  const take = useCallback(
    async (id: string, inbound: boolean): Promise<string | null> => {
      if (readOnly || saving) return "read_only";
      setTakingId(id);
      try {
        const r = await takeOrderAction(id, { inbound });
        if (!r.ok) return r.error;
        if (!r.data.ok) return r.data.error;
        setPresence("online");
        showCard(r.data.order);
        setSheet(null);
        setInboundOpen(false);
        return null;
      } catch {
        return "network";
      } finally {
        setTakingId(null);
      }
    },
    [readOnly, saving, showCard],
  );

  const lookup = useCallback(async (phone: string): Promise<InboundAnswer> => {
    const r = await inboundLookupAction(phone);
    if (!r.ok) return { ok: false, error: r.error };
    return r.data.ok ? { ok: true, data: r.data.data } : { ok: false, error: r.data.error };
  }, []);

  const callNow = useCallback(
    async (id: string) => {
      const e = await take(id, false);
      if (e) say({ tone: "error", text: errorText(e), sticky: true });
    },
    [take, say, errorText],
  );

  const keepBoth = useCallback(
    async (otherId: string) => {
      if (!card) return;
      const r = await dismissDuplicateAction(card.id, otherId).catch(() => null);
      if (r && r.ok && r.data.ok) setView((v) => (v.k === "card" ? { ...v, card: { ...v.card, duplicates: v.card.duplicates.filter((d) => d.id !== otherId) } } : v));
      else say({ tone: "error", text: errorText(r && !r.ok ? r.error : "generic"), sticky: true });
    },
    [card, say, errorText],
  );

  const openCalls = useCallback(async () => {
    const r = await openCallsNowAction().catch(() => null);
    if (r && r.ok && r.data.ok) {
      setOpensAt(null);
      setView({ k: "idle" });
      say({ tone: "ok", text: t("ops.state.openCallsDone", { time: clock(r.data.data.until, boot.tz, locale) }) });
    } else say({ tone: "error", text: errorText(r && !r.ok ? r.error : "generic"), sticky: true });
  }, [say, t, boot.tz, locale, errorText]);

  const changeScriptLocale = useCallback(
    async (l: ScriptLocale) => {
      if (!card) return;
      setScriptLoading(l);
      const r = await queueScriptAction(card.id, l).catch(() => null);
      setScriptLoading(null);
      if (r && r.ok && r.data.ok) setScriptOverride(r.data.script);
      else say({ tone: "error", text: errorText("generic"), sticky: true });
    },
    [card, say, errorText],
  );

  const saveNote = useCallback(
    async (text: string) => {
      if (!card) return false;
      const r = await addNoteAction(card.id, text).catch(() => null);
      if (r && r.ok && r.data.ok) {
        setTimeline(null);
        return true;
      }
      say({ tone: "error", text: errorText(r && !r.ok ? r.error : "generic"), sticky: true });
      return false;
    },
    [card, say, errorText],
  );

  /* ---------------- effects ---------------- */

  // the clock of "Call started n min ago" and the countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // first state: the outbox entry of a reload, else the held order or ?next=1 (one claim, its own key); the timer is
  // cleared by the cleanup, so a double-run effect (StrictMode) still sends once
  useEffect(() => {
    clearOtherPending(boot.storeId, boot.userId);
    if (readOnly) return;
    const pending = loadPending(boot.storeId, boot.userId, Date.now());
    const id = setTimeout(() => {
      if (pending) void sendOutcome({ key: null, phase: "saving", entry: pending, body: { orderId: pending.orderId, expectRev: pending.rev, channel: "call", outcome: pending.outcome, andNext: true } });
      else if (boot.held || autoNext) void next();
    }, 0);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // heartbeat (OD60): every 60 s while visible and online; it renews the held order's lease
  useEffect(() => {
    if (readOnly || presence !== "online") return;
    const beat = () => {
      if (document.visibilityState === "visible") void hot(handle, "presence", { heartbeat: true }, null).catch(() => undefined);
    };
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [readOnly, presence, handle]);

  // the counters and my callbacks (15 s while visible, 304 when unchanged)
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${opsPath(handle, "state")}?view=queue`, { headers: etagRef.current ? { "If-None-Match": etagRef.current } : {}, credentials: "same-origin", cache: "no-store" });
        if (stop || res.status !== 200) return;
        etagRef.current = res.headers.get("ETag");
        setQstate((await res.json()) as QueueState);
      } catch {
        // the next poll tries again
      }
    };
    const id = setInterval(poll, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [handle]);

  // back from the dialer: focus the grid, ask how it went (OPE-§13.2 step 3)
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      if (revealed && card && revealed.orderId === card.id && revealed.why !== "view") {
        setAskLine(true);
        requestAnimationFrame(() => (gridRef.current?.querySelector("button:not(:disabled)") as HTMLButtonElement | null)?.focus());
      }
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", back);
    };
  }, [revealed, card]);

  // the timeline column (≥ 768 px) of the held order
  useEffect(() => {
    if (!mid || !card || timeline) return;
    let stop = false;
    queueTimelineAction(card.id)
      .then((r) => !stop && setTimeline(r.ok ? r.data.items : []))
      .catch(() => !stop && setTimeline([]));
    return () => {
      stop = true;
    };
  }, [mid, card, timeline]);

  // keys (OPE-§13.3)
  const act = useEffectEvent((id: QueueKeyId, e: KeyboardEvent): void => {
    const outcomeKey = /^o[1-6]$/.test(id) ? (id as OutcomeKey) : null;
    if (id === "help") return setSheet("keys");
    if (id === "close") return setSheet(null);
    if (id === "inbound") {
      e.preventDefault();
      if (wide) inboundWideRef.current?.focus();
      else {
        setInboundOpen(true);
        requestAnimationFrame(() => inboundRef.current?.focus());
      }
      return;
    }
    if (readOnly) return;
    if (id === "next") return void (card ? null : next());
    if (!card || saving) return;
    if (outcomeKey && canOutcome) return press(outcomeKey);
    if (id === "call") return void reveal("call");
    if (id === "whatsapp") return void reveal("whatsapp", WA_DEFAULT);
    if (id === "skip") return void skip();
    if (id === "script") return setScriptOpen((o) => !o);
    if (id === "deliverFrom" && lane === "confirm") return setSheet("hold");
    if (id === "note") {
      e.preventDefault();
      const el = [...document.querySelectorAll<HTMLTextAreaElement>("[data-note-input]")].find((x) => x.offsetParent !== null);
      return el?.focus();
    }
    if (id === "edit") router.push(`${appHref(handle, "/orders")}?order=${encodeURIComponent(card.id)}`);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isEditable(e.target) || overlayOpen()) return;
      const id = queueKeyOf(e);
      if (!id) return;
      if (id !== "close") e.preventDefault();
      act(id, e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- render ---------------- */

  const nowDate = new Date(now);
  const nextLabel = held && view.k === "idle" ? t("ops.queue.resume") : t("ops.queue.next");
  const callingAgo = revealed && card && revealed.orderId === card.id && revealed.why !== "view" ? ago(revealed.at, now, locale) : null;
  const gridDisabled = !!saving || busy || !canOutcome;

  const banner = (
    <>
      {boot.readOnly ? <Banner tone="info">{t(boot.readOnly === "impersonation" ? "ops.state.readOnlyImpersonation" : "ops.state.readOnlyStore")}</Banner> : null}
      {boot.restricted ? <Banner tone="info">{t("ops.state.restricted")}</Banner> : null}
      <div aria-live="polite" className="contents">
        {notice ? (
          <Banner tone={notice.tone} onClose={notice.sticky ? () => say(null) : undefined} closeLabel={t("ops.close")}>
            {notice.text}
          </Banner>
        ) : null}
      </div>
    </>
  );

  const actionsBar = card && !readOnly ? (
    <div className="grid gap-2">
      {askLine || callingAgo ? (
        <p aria-live="polite" className="q-xs flex flex-wrap items-baseline justify-center gap-x-2 text-center text-muted-foreground">
          {askLine ? <span className="q-sm font-semibold text-foreground">{t("ops.queue.howDidItGo")}</span> : null}
          {callingAgo ? <span>{t(revealed?.why === "whatsapp" ? "ops.waStarted" : "ops.callStarted", { ago: callingAgo })}</span> : null}
        </p>
      ) : null}
      {boot.can.reveal ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void reveal("call")} disabled={!!saving} className="ui-primary q-base inline-flex h-12 items-center justify-center gap-2 rounded-xl font-semibold">
            <PhoneIcon className="size-4" aria-hidden="true" />
            {t("ops.queue.call")}
            <kbd aria-hidden="true" className="q-kbd hidden border-current/30 lg:inline-flex">
              C
            </kbd>
          </button>
          <div className="flex h-12 overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={() => void reveal("whatsapp", WA_DEFAULT)} disabled={!!saving} className="q-base inline-flex min-w-0 flex-1 items-center justify-center gap-2 font-semibold hover:bg-muted disabled:opacity-50">
              <MessageCircleIcon className="size-4" aria-hidden="true" />
              <span className="truncate">{t("ops.queue.whatsapp")}</span>
              <kbd aria-hidden="true" className="q-kbd hidden lg:inline-flex">
                W
              </kbd>
            </button>
            {card.templates.length > 1 ? (
              <button type="button" onClick={() => setSheet("wa")} disabled={!!saving} className="inline-flex w-11 shrink-0 items-center justify-center border-s border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                <ChevronDownIcon className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("ops.wa.title")}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {canOutcome ? (
        <div className="relative">
          <OutcomeGrid ref={gridRef} cells={cells} disabled={gridDisabled} pending={saving?.phase === "saving" ? saving.key : null} onPress={press} label={t("ops.queue.actions")} />
          {saving ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {saving.phase === "saving" ? (
                <span className="q-xs rounded-full bg-popover px-3 py-1 font-medium shadow-sm ring-1 ring-border">{t("ops.saving")}</span>
              ) : (
                <button type="button" onClick={() => void sendOutcome(saving)} className="pointer-events-auto q-sm rounded-xl bg-popover px-4 py-3 font-semibold text-destructive shadow-md ring-1 ring-[color-mix(in_oklab,var(--destructive)_35%,transparent)]">
                  {t("ops.couldNotSave")}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        {lane === "confirm" && canOutcome ? (
          <button type="button" onClick={() => setSheet("hold")} disabled={!!saving} className="q-xs inline-flex h-9 items-center rounded-lg px-2 font-medium text-muted-foreground hover:text-foreground">
            {t("ops.hold.deliverFrom")}
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => void skip()} disabled={!!saving || busy} className="q-xs inline-flex h-9 items-center rounded-lg px-2 font-medium text-muted-foreground hover:text-foreground">
          {t("ops.skip")}
        </button>
      </div>
      <div className="q-xs hidden items-center justify-between gap-3 text-muted-foreground lg:flex">
        <span className="flex items-center gap-3">
          {lane === "confirm" && canOutcome ? (
            <button type="button" onClick={() => setSheet("hold")} disabled={!!saving} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <kbd className="q-kbd">D</kbd>
              {t("ops.hold.deliverFrom")}
            </button>
          ) : null}
          <button type="button" onClick={() => void skip()} disabled={!!saving || busy} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <kbd className="q-kbd">X</kbd>
            {t("ops.skip")}
          </button>
          <a href={`${appHref(handle, "/orders")}?order=${encodeURIComponent(card.id)}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <kbd className="q-kbd">E</kbd>
            {t("ops.edit")}
          </a>
        </span>
        <button type="button" onClick={() => setSheet("keys")} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <KeyboardIcon className="size-3.5" aria-hidden="true" />
          <kbd className="q-kbd">?</kbd>
        </button>
      </div>
    </div>
  ) : null;

  const center = loading ? (
    <CardSkeleton label={t("ops.queue.loading")} />
  ) : card && script ? (
    <div key={view.k === "card" ? view.seq : 0} className="q-in grid gap-4">
      <OrderCard
        card={card}
        locale={locale}
        now={now}
        revealed={revealed}
        holdYmd={holdYmd}
        canAct={canOutcome && !saving}
        onMarkDuplicate={(id) => submit(null, "duplicate", { duplicateOf: id })}
        onKeepBoth={(id) => void keepBoth(id)}
        onShowNumber={boot.can.reveal && !readOnly ? () => void reveal("view") : undefined}
      />
      <ScriptPanel
        script={script}
        open={scriptOpen}
        onToggle={() => setScriptOpen((o) => !o)}
        loadingLocale={scriptLoading}
        onLocale={(l) => void changeScriptLocale(l)}
        objectionId={objectionId}
        onObjection={setObjectionId}
      />
      {!mid && canOutcome ? <NoteComposer id="q-note-phone" disabled={!!saving} onSave={saveNote} /> : null}
    </div>
  ) : (
    <StateSurface
      view={view}
      presence={presence}
      readOnly={readOnly}
      boot={boot}
      opensAt={opensAt}
      now={nowDate}
      qstate={qstate}
      busyId={takingId}
      onPresence={(p) => void changePresence(p)}
      onCallNow={(id) => void callNow(id)}
      onOpenCalls={() => void openCalls()}
      errorText={errorText}
    />
  );

  const nextBar =
    !card && !readOnly && !loading ? (
      <button type="button" onClick={() => void next()} disabled={busy} className="ui-primary q-md inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl font-semibold">
        {nextLabel}
        <ArrowRightIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        <kbd aria-hidden="true" className="q-kbd hidden lg:inline-flex">
          N
        </kbd>
      </button>
    ) : null;

  return (
    <div lang={locale} dir={dir} className="q-root flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col bg-background text-foreground md:h-auto md:min-h-[calc(100dvh-3.5rem)]">
      {/* the top bar of phones and tablets (48 px, never frosted; desktop shows the left column instead) */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4 lg:hidden">
        <PresenceSwitch value={presence} onChange={(p) => void changePresence(p)} disabled={readOnly} compact />
        <div className="ms-auto hidden min-[370px]:block">
          <TodayCounters today={qstate.today} locale={locale} compact />
        </div>
        <button
          type="button"
          onClick={() => setSheet("callbacks")}
          aria-label={t("ops.callbacks.count", { n: qstate.callbacks.length })}
          className={cn("q-xs q-num relative inline-flex h-9 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 font-semibold ring-1 ring-border ring-inset hover:bg-muted", "max-[369px]:ms-auto")}
        >
          <ListChecksIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <bdi dir="ltr">{qstate.callbacks.length}</bdi>
        </button>
        <button
          type="button"
          onClick={() => {
            setInboundOpen((o) => !o);
            requestAnimationFrame(() => inboundRef.current?.focus());
          }}
          aria-expanded={inboundOpen}
          aria-label={t("ops.inbound.placeholder")}
          className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-border ring-inset hover:bg-muted", inboundOpen && "bg-muted")}
        >
          <PhoneIncomingIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {inboundOpen ? (
        <div className="q-rise shrink-0 border-b border-border bg-card px-3 py-3 sm:px-4 lg:hidden">
          <InboundPanel inputRef={inboundRef} locale={locale} currency={boot.currency} tz={boot.tz} now={nowDate} disabled={readOnly} lookup={lookup} onTake={(id) => take(id, true)} ordersHref={(id) => `${appHref(handle, "/orders")}?order=${encodeURIComponent(id)}`} onClose={() => setInboundOpen(false)} />
        </div>
      ) : null}

      <div className="mx-auto grid min-h-0 w-full max-w-[1480px] flex-1 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6 md:px-6 md:py-6 lg:grid-cols-[260px_minmax(0,1fr)_320px] xl:gap-8">
        {/* left column (desktop): presence, today, my callbacks, the inbound field */}
        <aside className="hidden min-w-0 flex-col gap-6 lg:flex">
          <PresenceSwitch value={presence} onChange={(p) => void changePresence(p)} disabled={readOnly} />
          <TodayCounters today={qstate.today} locale={locale} />
          <section className="grid gap-2">
            <h2 className="q-xs font-semibold text-muted-foreground">{t("ops.callbacks.count", { n: qstate.callbacks.length })}</h2>
            <CallbackList callbacks={qstate.callbacks} tz={boot.tz} locale={locale} now={nowDate} busyId={takingId} disabled={readOnly || !!card || !!saving} onCall={(id) => void callNow(id)} />
          </section>
          <InboundPanel inputRef={inboundWideRef} locale={locale} currency={boot.currency} tz={boot.tz} now={nowDate} disabled={readOnly} lookup={lookup} onTake={(id) => take(id, true)} ordersHref={(id) => `${appHref(handle, "/orders")}?order=${encodeURIComponent(id)}`} />
          <a href={appHref(handle, "/queue/me")} className="q-sm inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
            {t("ops.me.title")}
            <ArrowRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </a>
        </aside>

        {/* centre: the card, or the state, then the thumb zone */}
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-3 md:flex-none md:overflow-visible md:p-0">
            <div className="grid gap-3 md:rounded-[22px] md:border md:border-border md:bg-card md:p-6 md:shadow-[0_1px_2px_rgb(0_0_0/0.03),0_16px_40px_-28px_rgb(0_0_0/0.18)]">
              {banner}
              {center}
            </div>
          </div>
          <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:mt-4 md:border-0 md:bg-transparent md:p-0">
            {actionsBar}
            {nextBar}
          </div>
        </main>

        {/* right column (tablet and desktop): history, timeline, note */}
        <aside className="hidden min-w-0 flex-col gap-6 md:flex">
          {card ? (
            <>
              <HistoryBlock history={card.customer.history} locale={locale} />
              <TimelineBlock items={timeline} loading={timeline === null} tz={boot.tz} locale={locale} now={nowDate} />
              {canOutcome ? <NoteComposer id="q-note-wide" disabled={!!saving} onSave={saveNote} /> : null}
            </>
          ) : (
            <div className="grid gap-3" aria-hidden="true">
              <div className="h-3 w-24 rounded-full bg-foreground/[0.06]" />
              <div className="grid grid-cols-3 gap-1.5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-foreground/[0.03]" />
                ))}
              </div>
              <div className="mt-3 h-3 w-20 rounded-full bg-foreground/[0.06]" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 rounded-lg bg-foreground/[0.03]" />
              ))}
            </div>
          )}
          <button type="button" onClick={() => setSheet("keys")} className="q-xs hidden items-center gap-1.5 text-muted-foreground hover:text-foreground lg:inline-flex">
            <KeyboardIcon className="size-3.5" aria-hidden="true" />
            {t("ops.key.title")}
            <kbd className="q-kbd">?</kbd>
          </button>
          <a href={appHref(handle, "/queue/me")} className="q-sm inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground lg:hidden">
            {t("ops.me.title")}
            <ArrowRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </a>
        </aside>
      </div>

      {/* sheets */}
      {card ? (
        <>
          <CallbackSheet open={sheet === "callback"} onOpenChange={(o) => setSheet(o ? "callback" : null)} now={nowDate} w={boot.window} locale={locale} onPick={(at) => submit("o4", "callback", { dueAt: at.toISOString() })} />
          <ReasonSheet open={sheet === "cancel"} onOpenChange={(o) => setSheet(o ? "cancel" : null)} title={t("ops.cancel.title")} onPick={(r: PickReason) => submit("o5", "cancelled", { reason: r })} />
          <ReasonSheet open={sheet === "recall"} onOpenChange={(o) => setSheet(o ? "recall" : null)} title={t("ops.recall.title")} onPick={(r: PickReason) => submit("o5", "cancel_recall", { reason: r })} />
          <MoreSheet
            open={sheet === "more"}
            onOpenChange={(o) => setSheet(o ? "more" : null)}
            card={card}
            canBlock={boot.can.block}
            onFake={(block) => submit("o6", "fake", block ? { blockPhone: true } : {})}
            onWrongNumber={() => submit("o6", "wrong_number")}
            onDuplicate={(of) => submit("o6", "duplicate", { duplicateOf: of })}
          />
          <DateSheet
            open={sheet === "hold"}
            onOpenChange={(o) => setSheet(o ? "hold" : null)}
            title={t("ops.hold.title")}
            description={t("ops.hold.hint")}
            now={nowDate}
            tz={boot.tz}
            locale={locale}
            onPick={(ymd) => {
              setHoldYmd(ymd);
              setSheet(null);
            }}
          />
          <DateSheet open={sheet === "reschedule"} onOpenChange={(o) => setSheet(o ? "reschedule" : null)} title={t("ops.rescue.title")} now={nowDate} tz={boot.tz} locale={locale} onPick={(ymd) => submit("o2", "reschedule", { shipAfter: ymd })} />
          <WaSheet open={sheet === "wa"} onOpenChange={(o) => setSheet(o ? "wa" : null)} templates={card.templates} onPick={(id) => void reveal("whatsapp", id)} />
        </>
      ) : null}
      <KeysSheet open={sheet === "keys"} onOpenChange={(o) => setSheet(o ? "keys" : null)} lane={lane} />
      <CallbacksSheet open={sheet === "callbacks"} onOpenChange={(o) => setSheet(o ? "callbacks" : null)} callbacks={qstate.callbacks} tz={boot.tz} locale={locale} now={nowDate} busyId={takingId} disabled={readOnly || !!card || !!saving} onCall={(id) => void callNow(id)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* the states (OPE-§13.4)                                              */
/* ------------------------------------------------------------------ */

function StateSurface({
  view,
  presence,
  readOnly,
  boot,
  opensAt,
  now,
  qstate,
  busyId,
  onPresence,
  onCallNow,
  onOpenCalls,
  errorText,
}: {
  view: View;
  presence: Presence;
  readOnly: boolean;
  boot: ConsoleBoot;
  opensAt: string | null;
  now: Date;
  qstate: QueueState;
  busyId: string | null;
  onPresence: (p: Presence) => void;
  onCallNow: (id: string) => void;
  onOpenCalls: () => void;
  errorText: (code: string) => string;
}) {
  const t = useT();
  const locale = boot.locale;
  const r = view.k === "none" ? view.r : null;
  const reason = r?.reason ?? (view.k === "idle" && !readOnly ? (presence === "break" ? "on_break" : presence === "offline" ? "offline" : null) : null);

  if (view.k === "error") {
    return <Quiet title={errorText(view.code)} line={t("ops.state.error")} />;
  }
  if (reason === "on_break" || reason === "offline") {
    return (
      <Quiet
        title={t(reason === "on_break" ? "ops.state.break" : "ops.state.offline")}
        line={t(reason === "on_break" ? "ops.state.breakHint" : "ops.state.offlineHint")}
        footer={
          <div className="grid gap-4">
            <div className="max-w-sm">
              <PresenceSwitch value={presence} onChange={onPresence} disabled={readOnly} />
            </div>
            <p className="q-sm q-num text-muted-foreground">{t("ops.me.today", { confirmed: qstate.today.confirmed })}</p>
          </div>
        }
      />
    );
  }
  if (reason === "outside_window") {
    const at = opensAt ?? (r && r.reason === "outside_window" ? r.opensAt : null);
    const left = at ? countdown(Date.parse(at), now.getTime()) : null;
    const today = qstate.callbacks.filter((c) => Date.parse(c.dueAt) - now.getTime() < 86_400_000);
    return (
      <Quiet
        title={at ? t("ops.state.outsideWindow", { time: "⁦" + clock(at, boot.tz, locale) + "⁩" }) : t("ops.state.noWindow")}
        line={left ? t("ops.state.opensIn", { time: left.h ? t("ops.state.hm", { h: left.h, m: left.m }) : t("ops.state.m", { m: left.m }) }) : undefined}
        footer={
          <div className="grid gap-4">
            {boot.can.configure ? (
              <button type="button" onClick={onOpenCalls} className="q-sm inline-flex h-11 w-fit items-center rounded-xl border border-border px-4 font-semibold hover:bg-muted">
                {t("ops.state.openCallsNow")}
              </button>
            ) : null}
            <section className="grid gap-2 lg:hidden">
              <h3 className="q-xs font-semibold text-muted-foreground">{t("ops.state.callbacksToday")}</h3>
              <CallbackList callbacks={today} tz={boot.tz} locale={locale} now={now} busyId={busyId} disabled={readOnly} onCall={onCallNow} />
            </section>
          </div>
        }
      />
    );
  }
  if (reason === "cap_reached") {
    return <Quiet title={boot.dailyCap != null ? t("ops.state.cap", { n: boot.dailyCap }) : t("ops.state.capAnon")} line={t("ops.me.today", { confirmed: qstate.today.confirmed })} />;
  }
  if (reason === "empty") {
    const due = r && r.reason === "empty" ? r.nextDueAt : null;
    return (
      <div className="grid gap-5">
        <GhostCard />
        <div className="grid gap-1">
          <p className="q-base text-foreground">{t("ops.state.empty")}</p>
          {due ? <p className="q-sm q-num text-muted-foreground">{t("ops.state.nextDue", { time: "⁦" + clock(due, boot.tz, locale) + "⁩" })}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-5">
      <GhostCard />
      <div className="grid gap-1">
        <p className="q-md font-semibold text-foreground">{readOnly ? t("ops.queue.title") : t("ops.state.idle")}</p>
        {!readOnly ? <p className="q-sm text-muted-foreground">{t("ops.state.idleHint")}</p> : null}
      </div>
    </div>
  );
}

function Quiet({ title, line, footer }: { title: string; line?: string; footer?: React.ReactNode }) {
  return (
    <div className="q-rise grid gap-5 py-2">
      <GhostCard />
      <div className="grid gap-1.5">
        <h2 className="q-lg font-semibold text-balance text-foreground">{title}</h2>
        {line ? <p className="q-sm text-muted-foreground">{line}</p> : null}
      </div>
      {footer}
    </div>
  );
}

/** the empty states' preview of the real card (core §I.8 rule 8: a skeleton of the UI the data will fill) */
function GhostCard() {
  return (
    <div aria-hidden="true" className="grid gap-3 rounded-2xl border border-dashed border-foreground/10 p-4">
      <div className="h-3 w-28 rounded-full bg-foreground/[0.06]" />
      <div className="h-4 w-3/5 rounded-full bg-foreground/[0.07]" />
      <div className="h-6 w-32 rounded-lg bg-foreground/[0.07]" />
      <div className="mt-1 grid gap-2 border-t border-foreground/[0.06] pt-3">
        <div className="h-3 w-4/5 rounded-full bg-foreground/[0.05]" />
        <div className="h-3 w-2/5 rounded-full bg-foreground/[0.05]" />
      </div>
    </div>
  );
}

function CardSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="q-fade grid gap-4">
      <span className="sr-only">{label}</span>
      <div className="q-shimmer h-3 w-40 rounded-full" />
      <div className="q-shimmer h-5 w-3/4 rounded-full" />
      <div className="q-shimmer h-8 w-36 rounded-lg" />
      <div className="q-shimmer h-3 w-1/2 rounded-full" />
      <div className="grid gap-2.5 border-t border-border pt-4">
        <div className="q-shimmer h-4 w-4/5 rounded-full" />
        <div className="q-shimmer h-4 w-3/5 rounded-full" />
        <div className="q-shimmer h-4 w-2/5 rounded-full" />
      </div>
      <div className="q-shimmer h-11 rounded-2xl" />
    </div>
  );
}

function Banner({ tone, children, onClose, closeLabel }: { tone: "info" | "ok" | "error"; children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "q-rise q-sm flex items-start gap-3 rounded-xl px-3.5 py-2.5",
        tone === "error" && "bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] text-destructive",
        tone === "ok" && "bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success-ink",
        tone === "info" && "q-info-chip",
      )}
    >
      <span className="min-w-0 flex-1 font-medium">{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} className="q-xs -my-1 shrink-0 rounded-md px-1.5 py-1 opacity-75 hover:opacity-100">
          {closeLabel}
        </button>
      ) : null}
    </div>
  );
}

