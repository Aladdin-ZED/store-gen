/**
 * One pulse poller per browser and store (P2 SHELL; docs/STORE-SAAS.md §I.4, D57; platform.md PLA-§22.6, SF-06): a
 * leader-election state machine over an injectable channel and clock, so `test:pulse` drives it without a browser.
 * `use-pulse.ts` (step p2-07) wires it to `BroadcastChannel("sg-pulse:<storeId>")`, `fetch` and `document.visibilityState`.
 *
 *   const election = createPulseElection({ storeId, channel: browserPulseChannel(storeId), poll, onBody });
 *   election.start(); election.setVisible(document.visibilityState === "visible"); … election.stop();
 *
 * The rules:
 * - **leader**: polls every 15 s while visible and posts each new body (and a beat on `304`) on the channel;
 * - **follower**: listens; any leader message resets its silence timer; after 40 s of silence a *visible* follower
 *   elects itself and polls at once;
 * - a new tab asks (`probe`) and becomes leader when nobody answers within `probeMs`; two leaders that hear each other
 *   keep the one with the smaller id (the other steps down), so the channel converges on one poller;
 * - a leader that is hidden or stops says `bye`, and a visible follower takes over at once;
 * - **solo** (no BroadcastChannel): every tab polls on its own;
 * - polling pauses while hidden and resumes with an immediate poll when the tab is visible again.
 */
import type { StorePulse } from "@/lib/pulse/types";

export const PULSE_INTERVAL_MS = 15_000;
export const PULSE_SILENCE_MS = 40_000;
export const PULSE_PROBE_MS = 400;

export type PulseMessage =
  | { t: "probe"; from: string }
  | { t: "claim"; from: string }
  | { t: "body"; from: string; etag: string; body: StorePulse }
  | { t: "beat"; from: string; etag: string | null }
  | { t: "bye"; from: string };

/** The channel seam: `BroadcastChannel` in the browser, an in-memory bus in the selftest. Never echoes to the sender. */
export interface PulseChannel {
  post(msg: PulseMessage): void;
  listen(fn: (msg: PulseMessage) => void): () => void;
  close(): void;
}

/** The clock seam: the window's timers in the browser, a fake clock in the selftest. */
export interface PulseClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** One poll of `GET /api/app/<h>/pulse?since=` with `If-None-Match`. */
export type PollResult = { status: 200; body: StorePulse; etag: string } | { status: 304 } | { status: "error" };
export type PulsePoll = (req: { since: string | null; etag: string | null }) => Promise<PollResult>;

export type ElectionRole = "idle" | "probing" | "leader" | "follower" | "solo" | "stopped";

export interface PulseElection {
  readonly id: string;
  readonly storeId: string;
  start(): void;
  stop(): void;
  setVisible(visible: boolean): void;
  role(): ElectionRole;
  /** the last body this tab saw (polled or heard), and when it arrived */
  last(): { body: StorePulse; etag: string; receivedAt: number } | null;
}

export interface PulseElectionOptions {
  storeId: string;
  channel: PulseChannel | null;
  poll: PulsePoll;
  onBody(body: StorePulse, etag: string): void;
  clock?: PulseClock;
  id?: string;
  visible?: boolean;
  intervalMs?: number;
  silenceMs?: number;
  probeMs?: number;
}

const realClock: PulseClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Live elections per store, so a store switch or sign-out can stop them (`clearStoreClientState`). */
const LIVE = new Map<string, Set<PulseElection>>();

/** Stops every live poller of `storeId` (all of them without an id); answers how many stopped. */
export function stopPulsePollers(storeId?: string): number {
  let n = 0;
  for (const [sid, set] of [...LIVE]) {
    if (storeId !== undefined && sid !== storeId) continue;
    for (const e of [...set]) {
      e.stop();
      n++;
    }
  }
  return n;
}

export function createPulseElection(opts: PulseElectionOptions): PulseElection {
  const clock = opts.clock ?? realClock;
  const id = opts.id ?? randomId();
  const interval = opts.intervalMs ?? PULSE_INTERVAL_MS;
  const silence = opts.silenceMs ?? PULSE_SILENCE_MS;
  const probeMs = opts.probeMs ?? PULSE_PROBE_MS;
  const channel = opts.channel;

  let role: ElectionRole = "idle";
  let visible = opts.visible ?? true;
  let last: { body: StorePulse; etag: string; receivedAt: number } | null = null;
  let pollTimer: unknown = null;
  let silenceTimer: unknown = null;
  let probeTimer: unknown = null;
  let unlisten: (() => void) | null = null;
  let inflight = false;

  const clear = (h: unknown) => {
    if (h !== null) clock.clearTimeout(h);
  };
  const post = (msg: PulseMessage) => {
    try {
      channel?.post(msg);
    } catch {
      // a closed channel: the next silence timeout re-elects
    }
  };

  function accept(body: StorePulse, etag: string) {
    if (last && last.etag === etag) {
      last = { ...last, receivedAt: clock.now() };
      return;
    }
    last = { body, etag, receivedAt: clock.now() };
    opts.onBody(body, etag);
  }

  function schedulePoll(ms: number) {
    clear(pollTimer);
    pollTimer = clock.setTimeout(() => {
      pollTimer = null;
      void pollOnce();
    }, ms);
  }

  async function pollOnce() {
    if ((role !== "leader" && role !== "solo") || !visible || inflight) return;
    inflight = true;
    let res: PollResult;
    try {
      res = await opts.poll({ since: last?.body.at ?? null, etag: last?.etag ?? null });
    } catch {
      res = { status: "error" };
    }
    inflight = false;
    if (role !== "leader" && role !== "solo") return; // stopped or stepped down while the request was out
    if (res.status === 200) {
      accept(res.body, res.etag);
      if (role === "leader") post({ t: "body", from: id, etag: res.etag, body: res.body });
    } else if (res.status === 304) {
      if (last) last = { ...last, receivedAt: clock.now() };
      if (role === "leader") post({ t: "beat", from: id, etag: last?.etag ?? null });
    }
    if (visible) schedulePoll(interval);
  }

  function armSilence() {
    clear(silenceTimer);
    silenceTimer = clock.setTimeout(() => {
      silenceTimer = null;
      if (role === "follower" && visible) becomeLeader();
      else if (role === "follower") armSilence();
    }, silence);
  }

  function becomeLeader() {
    clear(probeTimer);
    probeTimer = null;
    clear(silenceTimer);
    silenceTimer = null;
    role = "leader";
    post({ t: "claim", from: id });
    if (visible) void pollOnce();
  }

  function becomeFollower() {
    clear(pollTimer);
    pollTimer = null;
    clear(probeTimer);
    probeTimer = null;
    role = "follower";
    armSilence();
  }

  /** Ask for the leader; nobody answering within `probeMs` makes this tab the leader (when visible). */
  function probe() {
    clear(silenceTimer);
    silenceTimer = null;
    clear(probeTimer);
    role = "probing";
    post({ t: "probe", from: id });
    probeTimer = clock.setTimeout(() => {
      probeTimer = null;
      if (role !== "probing") return;
      if (visible) becomeLeader();
      else becomeFollower();
    }, probeMs);
  }

  function onMessage(msg: PulseMessage) {
    if (msg.from === id || role === "stopped" || role === "solo" || role === "idle") return;
    switch (msg.t) {
      case "probe":
        if (role === "leader" && last) post({ t: "body", from: id, etag: last.etag, body: last.body });
        else if (role === "leader") post({ t: "beat", from: id, etag: null });
        return;
      case "claim":
      case "body":
      case "beat":
        if (msg.t === "body") accept(msg.body, msg.etag);
        if (role === "leader") {
          if (msg.from < id) becomeFollower(); // two leaders: the smaller id keeps the channel
          else if (msg.t === "claim") post({ t: "claim", from: id }); // tell the newcomer it lost
          return;
        }
        becomeFollower();
        return;
      case "bye":
        if (role === "follower" || role === "probing") {
          if (visible) becomeLeader();
          else armSilence();
        }
        return;
    }
  }

  const election: PulseElection = {
    id,
    storeId: opts.storeId,
    start() {
      if (role !== "idle") return;
      let set = LIVE.get(opts.storeId);
      if (!set) LIVE.set(opts.storeId, (set = new Set()));
      set.add(election);
      if (!channel) {
        role = "solo";
        if (visible) void pollOnce();
        return;
      }
      unlisten = channel.listen(onMessage);
      probe();
    },
    stop() {
      if (role === "stopped") return;
      if (role === "leader") post({ t: "bye", from: id });
      role = "stopped";
      for (const h of [pollTimer, silenceTimer, probeTimer]) clear(h);
      pollTimer = silenceTimer = probeTimer = null;
      unlisten?.();
      unlisten = null;
      try {
        channel?.close();
      } catch {
        // already closed
      }
      LIVE.get(opts.storeId)?.delete(election);
      if (LIVE.get(opts.storeId)?.size === 0) LIVE.delete(opts.storeId);
    },
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      if (role === "stopped" || role === "idle") return;
      if (!visible) {
        clear(pollTimer);
        pollTimer = null;
        if (role === "leader") {
          post({ t: "bye", from: id }); // a visible tab takes over at once
          becomeFollower();
        }
        return;
      }
      // visible again: an immediate poll (solo / leader), or ask the leader for its last body
      if (role === "solo" || role === "leader") void pollOnce();
      else if (role === "follower") probe();
    },
    role: () => role,
    last: () => last,
  };
  return election;
}

/** `BroadcastChannel("sg-pulse:<storeId>")` as a `PulseChannel`, or null where the browser has none (solo polling). */
export function browserPulseChannel(storeId: string): PulseChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  let bc: BroadcastChannel;
  try {
    bc = new BroadcastChannel(`sg-pulse:${storeId}`);
  } catch {
    return null;
  }
  return {
    post: (msg) => bc.postMessage(msg),
    listen(fn) {
      const handler = (e: MessageEvent) => {
        const msg = e.data as PulseMessage | null;
        if (msg && typeof msg === "object" && typeof msg.t === "string" && typeof msg.from === "string") fn(msg);
      };
      bc.addEventListener("message", handler);
      return () => bc.removeEventListener("message", handler);
    },
    close: () => bc.close(),
  };
}
