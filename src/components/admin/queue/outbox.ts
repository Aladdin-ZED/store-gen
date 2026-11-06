/**
 * The console's hot-path client and its one-entry outbox (P4 CALL CENTER; operations.md OD36, OD37, OPE-§13.2b).
 * Isomorphic and dependency-free, so `test:ops` drives it with a fake fetch and a fake clock.
 *
 *   hot(handle, path, body, idem)     POST /api/app/<h>/ops/<path> as JSON with the `Idempotency-Key`; an answered
 *                                     request (any status) resolves, a request with no response throws `NetworkError`
 *   withRetry(send, delays, sleep)    the outbox's schedule: retried on network errors only, at 0.5 / 1 / 2 / 4 / 8 /
 *                                     15 s (≤ 30 s); the server answered = never retried (a 4xx is an answer)
 *   pending store                     the one pending outcome mirrored to sessionStorage under
 *                                     `sg:ops:pending:<storeId>:<userId>`: `{ orderId, rev, outcome, idem, at }` only,
 *                                     never a phone, a name or a note (≤ 512 B); a reload resumes it, a store switch
 *                                     clears the other stores' entries
 *
 * Keys are UUIDs minted when a control renders (`newIdem`), so a double tap or a retry carries the same key and the
 * server answers the stored first result.
 */

export const RETRY_DELAYS_MS: readonly number[] = [500, 1_000, 2_000, 4_000, 8_000, 15_000];
/** a resumed entry older than this is dropped (the server keeps an answer 10 minutes, idem.ts) */
export const PENDING_MAX_AGE_MS = 10 * 60_000;
export const PENDING_MAX_BYTES = 512;
const PREFIX = "sg:ops:pending:";

export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

export interface HotAnswer<T> {
  status: number;
  body: T;
}

/** A v4 UUID (the `Idempotency-Key`); `crypto.randomUUID` where the context allows it. */
export function newIdem(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const opsPath = (handle: string, path: string): string => `/api/app/${encodeURIComponent(handle)}/ops/${path}`;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** One hot-path POST (see the header). */
export async function hot<T>(handle: string, path: "next" | "outcome" | "reveal" | "presence", body: unknown, idem: string | null, f: Fetch = fetch): Promise<HotAnswer<T>> {
  let res: Response;
  try {
    res = await f(opsPath(handle, path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idem ? { "Idempotency-Key": idem } : {}) },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new NetworkError();
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = { ok: false, error: res.status >= 500 ? "server" : "invalid" };
  }
  return { status: res.status, body: parsed as T };
}

/** The outbox's retry loop (see the header): the first answer, or `null` once the schedule ran out offline. */
export async function withRetry<T>(send: () => Promise<T>, delays: readonly number[] = RETRY_DELAYS_MS, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T | null> {
  for (let i = 0; ; i++) {
    try {
      return await send();
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      const d = delays[i];
      if (d === undefined) return null;
      await sleep(d);
    }
  }
}

/* ------------------------------------------------------------------ */
/* the pending entry (sessionStorage mirror)                           */
/* ------------------------------------------------------------------ */

export interface PendingEntry {
  orderId: string;
  rev: number;
  outcome: string;
  idem: string;
  at: number;
}

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const storage = (): KV | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

export const pendingKey = (storeId: string, userId: string): string => `${PREFIX}${storeId}:${userId}`;

/** The entry as stored: exactly the five fields, nothing else rides along. */
export function serializePending(e: PendingEntry): string {
  return JSON.stringify({ orderId: e.orderId, rev: e.rev, outcome: e.outcome, idem: e.idem, at: e.at });
}

export function parsePending(raw: string | null, now: number): PendingEntry | null {
  if (!raw || raw.length > PENDING_MAX_BYTES) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingEntry>;
    if (typeof v.orderId !== "string" || typeof v.rev !== "number" || typeof v.outcome !== "string" || typeof v.idem !== "string" || typeof v.at !== "number") return null;
    if (now - v.at > PENDING_MAX_AGE_MS || v.at > now + 60_000) return null;
    return { orderId: v.orderId, rev: v.rev, outcome: v.outcome, idem: v.idem, at: v.at };
  } catch {
    return null;
  }
}

export function savePending(storeId: string, userId: string, e: PendingEntry, s: KV | null = storage()): void {
  try {
    s?.setItem(pendingKey(storeId, userId), serializePending(e));
  } catch {
    // a full or blocked storage keeps the in-memory entry only
  }
}

export function loadPending(storeId: string, userId: string, now: number, s: KV | null = storage()): PendingEntry | null {
  try {
    return parsePending(s?.getItem(pendingKey(storeId, userId)) ?? null, now);
  } catch {
    return null;
  }
}

export function clearPending(storeId: string, userId: string, s: KV | null = storage()): void {
  try {
    s?.removeItem(pendingKey(storeId, userId));
  } catch {
    // nothing to clear
  }
}

/** A store switch (or another member signed in on this tab): every other store's or member's entry goes. */
export function clearOtherPending(storeId: string, userId: string, s: KV | null = storage()): void {
  if (!s) return;
  try {
    const mine = pendingKey(storeId, userId);
    const drop: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX) && k !== mine) drop.push(k);
    }
    for (const k of drop) s.removeItem(k);
  } catch {
    // nothing to clear
  }
}
