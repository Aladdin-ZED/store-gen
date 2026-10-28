/**
 * Two-store attack cases of the platform track (P1 CONSOLE, platform.md PLA-§O.3).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), loaded by scripts/qa/tenancy-check.ts
 * (`test:tenancy`). Case files import only types from the harness; the modules under test load inside `run`.
 *
 * Step 3 (the health engine): the read half of PLA-§O.3 cases 8 and 9 on the snapshot API. Step 7 adds the actions
 * (`snoozeHealthIssueAction`, `recomputeHealthAction` from B's session on A's path) and the other special cases.
 */
import type { TenancyCase } from "../tenancy-check";

export const cases: TenancyCase[] = [
  {
    name: "store_health: each store reads its own snapshot; tenants never get the console flags (PLA-§O.3 cases 8-9, read half)",
    async run(k) {
      const { computeStoreHealth } = await import("@/lib/health/run");
      const { getStoreHealth, markHealthDirty } = await import("@/lib/platform/health-snapshot");
      const { systemCtx } = await import("@/lib/jobs/scope");
      const job = systemCtx("platform.health");
      const a = await computeStoreHealth(job, k.fx.rows.A);
      const b = await computeStoreHealth(job, k.fx.rows.B);
      const before = await k.snapshotA();

      const fromB = await getStoreHealth(k.scope("B"));
      k.check("store_health: B's member reads B's own computed row", fromB !== null && fromB.score === b.score, fromB && { score: fromB.score, want: b.score });
      k.check("store_health: … without the console flags", fromB !== null && !("flags" in fromB));
      k.check("store_health: … with nothing of A", k.leaks(fromB).length === 0, k.leaks(fromB));
      const viewing = await getStoreHealth(k.scope("A", "impersonation"));
      k.check("store_health: staff viewing A read what A's members read (no flags)", viewing !== null && viewing.score === a.score && !("flags" in viewing));
      const staff = await getStoreHealth(k.scope("A", "platform"));
      k.check("store_health: the platform scope reads A's flags", staff !== null && Array.isArray(staff.flags));
      k.check("store_health: no customer data or secret inside A's own snapshot (case 8)", k.leaks(staff, { only: ["customer", "secret"] }).length === 0, k.leaks(staff, { only: ["customer", "secret"] }));
      await markHealthDirty(k.fx.B.id);
      await markHealthDirty(k.fx.ghostHandle);
      k.check("store_health: B's dirty mark (and a malformed id) leave A's rows unchanged", (await k.snapshotA()) === before);
    },
  },
];
