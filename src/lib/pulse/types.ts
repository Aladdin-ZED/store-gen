/**
 * The store pulse (docs/STORE-SAAS.md §I.4, D46, D57; PLA Q.14, SF-06): `GET /api/app/<h>/pulse` every 15 s while the
 * tab is visible, one poller per browser and store (`BroadcastChannel("sg-pulse:<storeId>")`), `ETag` → 304 when
 * nothing changed. Store-level parts are cached 5 s per store; per-user parts are always fresh. Isomorphic types,
 * maintainer-owned (frozen at P0); the route is P2's.
 */
import type { KillKey } from "@/lib/flags/registry";
import type { StoreScope, StoreStatus } from "@/lib/tenancy/types";

export interface StorePulse {
  v: 1;
  at: string;
  build: string;
  unread: number;
  store: { status: StoreStatus; statusReason: string | null; review: "none" | "pending" | "submitted" | "needs_info" | "approved" | "rejected" };
  kill: KillKey[]; // active kill switches that affect tenants
  impersonation: { endsAt: string } | null; // the viewer's own impersonation of this store
  reaccept: boolean; // legal re-acceptance pending for the viewer
  health: { score: number; attention: 0 | 1 | 2 | 3; computedAt: string } | null; // §I.7
  jobs: { running: number; done: string[] }; // the viewer's ai_jobs that finished since the last poll (§H.12)
  counts: Record<string, number>; // contributed by tracks (P4: newOrders, dueCallbacks, queueNow, syncFailed; P3: leadsDue)
}

/** A track's counters: `src/lib/pulse/contributors/<track>.ts` exports `contributor: PulseContributor`. */
export interface PulseContributor {
  id: string; // the track
  /** ≤ 50 ms; a failure omits its keys; per-user keys must not be cached across viewers */
  contribute(scope: StoreScope, viewer: { userId: string; role: string }): Promise<Record<string, number>>;
}
