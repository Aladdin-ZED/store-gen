"use server";
/**
 * Domains view actions of the console (P1 CONSOLE; platform.md PLA-§16, §M.1, OS-06). A platform action file (lint L9):
 * `domains.manage`; the "re-render every live page" fan-out with a fresh step-up.
 *
 *   await markDomainStepAction({ stepId: "dns", done: true });
 *   const result = await runDomainCheckAction({ id: "V12" });          // the request's own host class is read here
 *   await rerenderAllAction({ opId });                                 // ↑; the request's opId de-duplicates it
 */
import { headers } from "next/headers";
import { effectiveHost } from "@/lib/edge/host";
import { clientIp } from "@/lib/security/ip";
import { markDomainCheck, markDomainStep, requestRerenderAll, retryFailedRenders, runDomainCheck, type RerenderState } from "@/lib/platform/domain-move";
import type { DomainCheckResult } from "@/lib/platform/domain-move-rules";
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

type Op = { opId?: string };

/** `domains.manage`: a checklist step marked done (date and staff member) or cleared. */
export async function markDomainStepAction(input: { stepId: string; done: boolean } & Op): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("domains.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await markDomainStep(ctx, input))));
}

/** `domains.manage`: a manual check marked passed with its note, or unmarked (runnable checks pass by their run only). */
export async function markDomainCheckAction(input: { id: string; passed: boolean; note?: string } & Op): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("domains.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await markDomainCheck(ctx, input))));
}

/** `domains.manage`: runs one check now (a pass is recorded with its time); the request's host class and address feed V12 / V13. */
export async function runDomainCheckAction(input: { id: string; token?: string | null; hostnamesConfirmed?: boolean; handle?: string | null }): Promise<ActionResult<DomainCheckResult>> {
  return platformAction("domains.manage", async (ctx) => {
    const h = await headers();
    const host = effectiveHost(h);
    return done(
      await runDomainCheck(ctx, {
        id: typeof input?.id === "string" ? input.id : "",
        requestHost: { cls: host.cls, host: host.host },
        token: typeof input?.token === "string" ? input.token : null,
        hostnamesConfirmed: input?.hostnamesConfirmed === true,
        handle: typeof input?.handle === "string" ? input.handle : null,
        ip: clientIp(h),
      }),
    );
  });
}

/** `domains.manage` ↑: every live page of every store enqueued again, in slices (`platform.rerender`); one run at a time. */
export async function rerenderAllAction(input: { opId: string }): Promise<ActionResult<{ started: boolean; state: RerenderState }>> {
  return platformAction("domains.manage", async (ctx) => done(await requestRerenderAll(ctx, typeof input?.opId === "string" ? input.opId : "")), { stepUp: true });
}

/** `domains.manage` (PLA-§16.2 "Retry failed"): the stores with failed renders in 24 h enqueued again. */
export async function retryFailedRendersAction(input: Op = {}): Promise<ActionResult<{ stores: number; enqueued: number } | { unavailable: true }>> {
  return platformAction("domains.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await retryFailedRenders(ctx))));
}
