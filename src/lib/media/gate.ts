/**
 * The processing gate of the upload pipeline (sharp/libvips work is CPU-heavy on shared hosting): at most
 * MAX_CONCURRENT jobs run and MAX_WAITING wait per process; beyond that an upload fails fast with "busy" (each
 * waiter holds its file in memory).
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.6; TENANCY-MAP MED-04): inside those limits a store has at most one job running
 * and one waiting, and a finished job hands its slot to the oldest waiter of a store that has nothing running, so
 * one store's batch of uploads never makes every other store wait behind it.
 */
import { MediaError } from "./errors";

export const MAX_CONCURRENT = 2;
/** jobs allowed to wait for a slot */
export const MAX_WAITING = 4;
/** per store, inside the limits above */
export const MAX_CONCURRENT_PER_STORE = 1;
export const MAX_WAITING_PER_STORE = 1;

interface GateWaiter {
  storeId: string;
  grant: () => void;
}
interface MediaGate {
  active: number;
  waiters: GateWaiter[];
  /** running and waiting jobs per store (an entry is dropped once both are 0) */
  stores: Map<string, { active: number; waiting: number }>;
}

declare global {
  var __codMediaGate: MediaGate | undefined;
}
const gate = (): MediaGate => (globalThis.__codMediaGate ??= { active: 0, waiters: [], stores: new Map() });

function storeEntry(g: MediaGate, storeId: string): { active: number; waiting: number } {
  let e = g.stores.get(storeId);
  if (!e) g.stores.set(storeId, (e = { active: 0, waiting: 0 }));
  return e;
}
function tidy(g: MediaGate, storeId: string): void {
  const e = g.stores.get(storeId);
  if (e && !e.active && !e.waiting) g.stores.delete(storeId);
}

/** Start the oldest waiters whose store has no job running, while the process has room. */
function pump(g: MediaGate): void {
  while (g.active < MAX_CONCURRENT) {
    const i = g.waiters.findIndex((w) => (g.stores.get(w.storeId)?.active ?? 0) < MAX_CONCURRENT_PER_STORE);
    if (i < 0) return;
    const w = g.waiters.splice(i, 1)[0]!;
    const e = storeEntry(g, w.storeId);
    e.waiting--;
    e.active++;
    g.active++;
    w.grant();
  }
}

/** Wait for a processing slot of the store (MediaError "busy" when the store's or the process's queue is full). */
export async function acquireMediaGate(storeId: string): Promise<void> {
  const g = gate();
  const e = storeEntry(g, storeId);
  if (e.active < MAX_CONCURRENT_PER_STORE && g.active < MAX_CONCURRENT) {
    e.active++;
    g.active++;
    return;
  }
  if (e.waiting >= MAX_WAITING_PER_STORE || g.waiters.length >= MAX_WAITING) {
    tidy(g, storeId);
    throw new MediaError("busy");
  }
  e.waiting++;
  await new Promise<void>((resolve) => g.waiters.push({ storeId, grant: resolve })); // started by pump()
}
/** Give the slot back (exactly once per successful acquire), starting the next eligible waiter. */
export function releaseMediaGate(storeId: string): void {
  const g = gate();
  const e = storeEntry(g, storeId);
  e.active--;
  g.active--;
  pump(g);
  tidy(g, storeId);
}
