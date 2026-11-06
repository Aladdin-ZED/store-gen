/**
 * Pulse counters of the landing track (P3 LANDING, landing.md LAN-§23.8; core §I.4 `StorePulse.counts`, SF-06).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3), created at P0 and imported by src/lib/pulse/registry.ts; the track
 * never edits the registry.
 *
 * `{ leadsDue, leadsNew, waIntentsNew }` from the lead read repository (`pulseLeadCounts`, src/lib/leads/read.ts: one
 * indexed COUNT each, test leads left out, an agent's own `leadsDue`). Within the 50 ms budget of the pulse route; a
 * failure omits the keys (never a made-up 0). The nav badge of the inbox and the Today brief read them.
 */
import type { PulseContributor } from "../types";

export const contributor: PulseContributor = {
  id: "landing",
  async contribute(scope, viewer) {
    try {
      // loaded on first use, as ops' contributor does: the registry stays importable outside Next (test:pulse; P3 merge)
      const { pulseLeadCounts } = await import("@/lib/leads/read");
      return { ...(await pulseLeadCounts(scope, viewer)) };
    } catch {
      // §I.4: a failing contributor omits its keys
      return {};
    }
  },
};
