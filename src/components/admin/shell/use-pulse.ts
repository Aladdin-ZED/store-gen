"use client";
/**
 * The store's pulse in the browser (P2 SHELL; platform.md PLA-§22.6, §10.2, §22.8; docs/STORE-SAAS.md §I.4, D57;
 * SF-06, PL-02, PL-12): one poller per browser and store (`createPulseElection` over `BroadcastChannel
 * ("sg-pulse:<storeId>")`), `GET /api/app/<h>/pulse?since=` every 15 s while the tab is visible, with the last ETag
 * (`304` when nothing changed). The `[store]` layout paints the first body, so nothing waits for the first poll.
 *
 *   const pulse = usePulse();
 *   pulse.body?.counts.newOrders   ·   pulse.ageMs()   ·   pulse.updateAvailable   ·   pulse.trackJob(jobId, href)
 *
 * What a new body does (the pure rules are ./pulse-state.ts): a status, review, kill-switch or re-acceptance change
 * calls `router.refresh()` (locked controls unlock, state pages appear, no reload); another build shows "New version
 * available · Reload" once; a new `health.computedAt` refreshes the dashboard (the ring and its issues); finished jobs
 * become the job chip's "Ready · Open". Polling pauses while the tab is hidden and resumes with a poll on return; the
 * store switch and sign-out stop it (`clearStoreClientState`).
 */
import { usePathname, useRouter } from "next/navigation";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { StorePulse } from "@/lib/pulse/types";
import { useT } from "@/lib/i18n/admin/client";
import { browserPulseChannel, createPulseElection, type PollResult, type PulsePoll } from "./pulse-election";
import { initialPulseState, pulseAge, reducePulse, type ReadyJob } from "./pulse-state";
import { useOptionalStore } from "./store-context";

/** A job a screen of this tab started (`job_queued`): the chip's "Open" goes back to that screen. */
export interface TrackedJob {
  href: string;
  label: string | null;
}

export interface PulseApi {
  /** the last body (the server's first paint until a poll answers); null outside a store */
  body: StorePulse | null;
  /** ms since the last body arrived, or null */
  ageMs(): number | null;
  updateAvailable: boolean;
  /** finished jobs waiting as "Ready · Open" */
  ready: readonly ReadyJob[];
  /** the screen and label of a job this tab started */
  tracked(id: string): TrackedJob | null;
  trackJob(id: string, href: string, label?: string | null): void;
  dismissJob(id: string): void;
  /** bumps when the health snapshot changed (the ring listens) */
  healthTick: number;
}

const INERT: PulseApi = {
  body: null,
  ageMs: () => null,
  updateAvailable: false,
  ready: [],
  tracked: () => null,
  trackJob: () => {},
  dismissJob: () => {},
  healthTick: 0,
};

const PulseContext = createContext<PulseApi>(INERT);

/** One poll of the store's pulse route (`If-None-Match`, `?since=`); a network failure or a refusal is `error`. */
function pollerFor(url: string): PulsePoll {
  return async ({ since, etag }): Promise<PollResult> => {
    const target = since ? `${url}?since=${encodeURIComponent(since)}` : url;
    const res = await fetch(target, { headers: etag ? { "If-None-Match": etag } : {}, cache: "no-store", credentials: "same-origin" });
    if (res.status === 304) return { status: 304 };
    if (!res.ok) return { status: "error" };
    const body = (await res.json()) as StorePulse;
    if (!body || body.v !== 1 || typeof body.at !== "string") return { status: "error" };
    return { status: 200, body, etag: res.headers.get("ETag") ?? "" };
  };
}

export function PulseProvider({ initial, children }: { initial: { body: StorePulse; etag: string } | null; children: ReactNode }) {
  const store = useOptionalStore();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const [state, dispatch] = useReducer(reducePulse, initial?.body ?? null, (body) => initialPulseState(body, Date.now()));
  const [jobs, setJobs] = useState<Readonly<Record<string, TrackedJob>>>({});
  const storeId = store?.id ?? null;
  const url = store ? store.api("/pulse") : null;
  // the first body is the server's: keep it out of the effect's dependencies (a re-render must not restart the poller)
  const first = useRef(initial);

  useEffect(() => {
    if (!storeId || !url) return;
    const visible = () => document.visibilityState === "visible";
    const election = createPulseElection({
      storeId,
      channel: browserPulseChannel(storeId),
      poll: pollerFor(url),
      onBody: (body) => dispatch({ t: "body", body, now: Date.now() }),
      initial: first.current,
      visible: visible(),
    });
    election.start();
    const onVisibility = () => election.setVisible(visible());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      election.stop();
    };
  }, [storeId, url]);

  // a status / review / kill / re-acceptance change: the server components again (locks, state pages, the legal sheet)
  const refreshTick = state.refreshTick;
  useEffect(() => {
    if (refreshTick > 0) router.refresh();
  }, [refreshTick, router]);

  // a new health snapshot: the dashboard's ring and issues (other screens read it on their next visit)
  const healthTick = state.healthTick;
  const home = store ? store.href() : null;
  const onHome = pathname === home;
  useEffect(() => {
    if (healthTick > 0 && onHome) router.refresh();
  }, [healthTick, onHome, router]);

  // another build is live: one quiet toast with Reload (never a modal)
  const announced = useRef(false);
  useEffect(() => {
    if (!state.updateAvailable || announced.current) return;
    announced.current = true;
    toast(t("shell.notifications.new_version"), { duration: Infinity, action: { label: t("shell.notifications.reload"), onClick: () => window.location.reload() } });
  }, [state.updateAvailable, t]);

  const receivedAt = state.receivedAt;
  const ageMs = useCallback(() => pulseAge({ receivedAt }, Date.now()), [receivedAt]);
  const trackJob = useCallback((id: string, href: string, label: string | null = null) => {
    if (typeof id === "string" && id) setJobs((m) => ({ ...m, [id]: { href, label } }));
  }, []);
  const tracked = useCallback((id: string) => (Object.hasOwn(jobs, id) ? jobs[id]! : null), [jobs]);
  const dismissJob = useCallback((id: string) => {
    setJobs((m) => {
      if (!Object.hasOwn(m, id)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
    dispatch({ t: "dismiss_job", id });
  }, []);

  const value = useMemo<PulseApi>(
    () => ({ body: state.body, ageMs, updateAvailable: state.updateAvailable, ready: state.ready, tracked, trackJob, dismissJob, healthTick: state.healthTick }),
    [state.body, ageMs, state.updateAvailable, state.ready, tracked, trackJob, dismissJob, state.healthTick],
  );
  return createElement(PulseContext.Provider, { value }, children);
}

/** The store's pulse (inert outside a store's dashboard: no body, nothing tracked). */
export function usePulse(): PulseApi {
  return useContext(PulseContext);
}
