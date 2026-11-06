/**
 * Pulse counters of the integrations track (P5 INTEGRATIONS, operations.md OPE-§27.3, §28.1; core §I.4, D57, SF-06).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3), created at P0 and imported by src/lib/pulse/registry.ts; the track
 * never edits the registry.
 *
 * `syncFailed` = failed sheet rows + dead deliveries of the store (`syncFailedCount`, src/lib/integrations/health.ts):
 * the integrations page polls it and refreshes its deliveries list on a change. A store-level number, cached 5 s per
 * store; ≤ 50 ms (a slower or failing read omits the key, and the load still fills the cache for the next poll).
 * Only viewers who can open the integrations page (`integrations.manage` or `callcenter.configure`) get it; agents
 * never see that page (OD12).
 *
 * Decision (OPE-§27.3 says both contributors call P4's `opsPulse`): P5 computes its own key, so it never reads a
 * stub that answers nothing until P4 merges; P4 may import `syncFailedCount` instead of counting it twice.
 *
 * The registry is imported outside the server bundle too (P2's `test:pulse`), so the server read loads lazily.
 */
import { can, isStoreRole } from "@/lib/auth/permissions";
import { scopedCache } from "@/lib/tenancy/cache";
import type { PulseContributor } from "../types";

/** the pulse's budget per contributor (core §I.4) */
export const PULSE_BUDGET_MS = 50;

const counts = scopedCache<number>({ name: "pulse-integrations", maxEntries: 5_000, ttlMs: 5_000 });

const TIMED_OUT = Symbol("timeout");

export const contributor: PulseContributor = {
  id: "integrations",
  contribute: async (scope, viewer): Promise<Record<string, number>> => {
    if (!isStoreRole(viewer.role) || !(can(viewer.role, "integrations.manage") || can(viewer.role, "callcenter.configure"))) return {};
    try {
      const load = counts.getOrLoad(scope.storeId, "syncFailed", async () => {
        const { syncFailedCount } = await import("@/lib/integrations/health");
        return syncFailedCount(scope);
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), PULSE_BUDGET_MS);
      });
      const n = await Promise.race([load, late]).finally(() => clearTimeout(timer));
      load.catch(() => undefined);
      return n === TIMED_OUT ? {} : { syncFailed: n };
    } catch {
      return {};
    }
  },
};
