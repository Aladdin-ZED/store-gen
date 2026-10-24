import "server-only";
/**
 * The system seam (docs/STORE-SAAS.md §E.2): cron jobs, boot tasks, the outbox drainer and renders reach store data
 * only through a `SystemCtx` and `systemScope(ctx, storeId)`; cross-store iteration goes through `forEachStore`
 * (round-robin cursor in `cron_cursors`, per-store isolation, the job's budget).
 *
 *   const ctx = systemCtx("sheets.push");
 *   await forEachStore(ctx, { job: ctx.job, states: ["active", "restricted"], budgetMs: 18_000 }, (scope, store) => push(scope, store));
 *
 * C0a: `systemCtx` and `systemScope` work; T1 completes the file (`forEachStore`, §K.1).
 */
import { mintScope } from "@/lib/tenancy/seam";
import type { StoreRow, StoreScope, StoreStatus, SystemCtx } from "@/lib/tenancy/types";

const JOB_RE = /^[a-z][a-z0-9_.:-]{0,47}$/;

/** The context of one job run (actor kind "system", no user, no IP). */
export function systemCtx(job: string): SystemCtx {
  if (!JOB_RE.test(job)) throw new Error(`jobs: bad job name "${job}"`);
  return { job, actor: { kind: "system", userId: null, impersonatorId: null, ip: null } };
}

/** kind "system" (a WriteScope: jobs write tenant rows). */
export function systemScope(ctx: SystemCtx, storeId: string): StoreScope & { readonly kind: "system" } {
  if (ctx.actor.kind !== "system") throw new Error("jobs: systemScope needs a system actor");
  return mintScope("system", storeId);
}

export interface ForEachStoreOpts {
  job: string;
  states: readonly StoreStatus[];
  budgetMs: number;
  where?: "pending_sheets" | "pending_outbox" | "pending_renders";
}

/** Visits stores in `states` from the job's cursor until `budgetMs` is spent; a store whose step throws is skipped and logged. T1. */
export async function forEachStore(
  ctx: SystemCtx,
  opts: ForEachStoreOpts,
  fn: (scope: StoreScope, store: StoreRow) => Promise<void>,
): Promise<{ visited: number; done: boolean }> {
  void ctx;
  void opts;
  void fn;
  throw new Error("not implemented: T1 (forEachStore)");
}
