"use client";
/**
 * The console pulse in the browser (platform.md PLA-§4.6, PD38, PD56, PD57): `GET /api/admin/pulse` every 15 s while
 * the tab is visible, with `If-None-Match` (an unchanged pulse answers 304). One poller per browser: the tabs talk on
 * `BroadcastChannel("sg-console-pulse")`, the polling tab shares every answer, the others listen; when the poller goes
 * hidden it resigns, and a silent poller (40 s) is replaced, so a closed or sleeping tab never stops the console.
 * Where the channel is missing every tab polls on its own.
 *
 *   const { pulse, okAt, stale, failed } = useConsolePulse();
 *
 * `stale` turns on after two missed pulses (the topbar dot goes neutral with the time of the last success, never red
 * without a reason, PLA-§4.7); a new `build` raises "New version available · Reload" once.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/admin/client";
import type { ConsolePulse } from "@/lib/platform/pulse-rules";
import { useNow } from "./context";

export const PULSE_MS = 15_000;
/** a poller unheard for this long is replaced (two and a half pulses) */
const SILENCE_MS = 40_000;
/** two missed pulses */
const STALE_MS = 2 * PULSE_MS + 5_000;
const CHANNEL = "sg-console-pulse";

type Message = { t: "pulse"; from: string; pulse: ConsolePulse; okAt: number } | { t: "ok"; from: string; okAt: number } | { t: "resign"; from: string };

export interface ConsolePulseState {
  pulse: ConsolePulse | null;
  /** when the last answer arrived (ms), null before the first */
  okAt: number | null;
  /** the last poll failed (the data shown is the last good one) */
  failed: boolean;
  /** older than two pulses */
  stale: boolean;
}

const PulseContext = createContext<ConsolePulseState>({ pulse: null, okAt: null, failed: false, stale: false });

export function useConsolePulse(): ConsolePulseState {
  return useContext(PulseContext);
}

export function ConsolePulseProvider({ initial, children }: { initial: ConsolePulse | null; children: ReactNode }) {
  const t = useT();
  const [pulse, setPulse] = useState<ConsolePulse | null>(initial);
  const [okAt, setOkAt] = useState<number | null>(() => (initial ? Date.parse(initial.at) : null));
  const [failed, setFailed] = useState(false);
  const now = useNow(5_000);
  const firstBuild = useRef<string | null>(initial?.build ?? null);
  const told = useRef(false);

  // a new build: say it once, with Reload (the page keeps working until the person chooses)
  useEffect(() => {
    if (!pulse) return;
    if (firstBuild.current === null) firstBuild.current = pulse.build;
    else if (pulse.build !== firstBuild.current && !told.current) {
      told.current = true;
      toast(t("console.version.new"), { duration: Infinity, action: { label: t("console.version.reload"), onClick: () => window.location.reload() } });
    }
  }, [pulse, t]);

  useEffect(() => {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let channel: BroadcastChannel | null = null;
    try {
      channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }
    let etag: string | null = null;
    let leading = false;
    let leader: { id: string; at: number } | null = null;
    let inFlight = false;
    let disposed = false;

    const post = (m: Message) => {
      try {
        channel?.postMessage(m);
      } catch {
        // a closed channel: this tab keeps its own state
      }
    };

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/admin/pulse", { cache: "no-store", credentials: "same-origin", headers: etag ? { "If-None-Match": etag } : {} });
        if (disposed) return;
        if (res.status === 304) {
          const at = Date.now();
          setOkAt(at);
          setFailed(false);
          post({ t: "ok", from: id, okAt: at });
        } else if (res.ok) {
          const body = (await res.json()) as ConsolePulse;
          etag = res.headers.get("ETag");
          const at = Date.now();
          setPulse(body);
          setOkAt(at);
          setFailed(false);
          post({ t: "pulse", from: id, pulse: body, okAt: at });
        } else {
          setFailed(true);
        }
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        inFlight = false;
      }
    };

    const tick = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) {
        if (leading) post({ t: "resign", from: id });
        leading = false;
        return;
      }
      const other = leader && leader.id !== id && Date.now() - leader.at < SILENCE_MS;
      if (channel && other) {
        leading = false;
        return;
      }
      leading = true;
      void poll();
    };

    if (channel) {
      channel.onmessage = (e: MessageEvent<Message>) => {
        const m = e.data;
        if (!m || typeof m !== "object" || m.from === id) return;
        if (m.t === "resign") {
          if (leader?.id === m.from) leader = null;
          return;
        }
        // two pollers at once (both started together): the smaller id keeps polling
        if (leading && m.from > id) return;
        leader = { id: m.from, at: Date.now() };
        leading = false;
        setOkAt(m.okAt);
        setFailed(false);
        if (m.t === "pulse") setPulse(m.pulse);
      };
    }

    const timer = setInterval(tick, PULSE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
      else if (leading) {
        post({ t: "resign", from: id });
        leading = false;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const onUnload = () => leading && post({ t: "resign", from: id });
    window.addEventListener("pagehide", onUnload);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onUnload);
      if (leading) post({ t: "resign", from: id });
      channel?.close();
    };
  }, []);

  const value = useMemo<ConsolePulseState>(() => ({ pulse, okAt, failed, stale: okAt === null || now - okAt > STALE_MS }), [pulse, okAt, failed, now]);
  return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}
