import "server-only";
/**
 * Operation de-duplication of console writes (platform.md PLA-§L "Operation de-duplication", §M.5): a write that
 * carries an `opId` (the client's id of one confirmed sheet) runs once per staff member and id for 10 minutes, so a
 * double click or a retried request never saves twice. The bucket is `p:op:<userId>.<opId>` (the core's
 * `p:op:<userId>:<opId>` with the builder's one-segment key rule, §E.8).
 *
 *   if (!(await firstRun(ctx, opId))) return;   // the same operation already ran
 */
import { z } from "zod";
import { FieldsError } from "@/lib/auth/errors";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import type { PlatformCtx } from "@/lib/tenancy/types";

/** 10 minutes (PLA-§L) */
export const OP_WINDOW_SEC = 600;
/** an operation id: what the client mints (a ULID or a short random id) */
export const OpId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "invalid operation id");

/** true on the first run of `opId` by this staff member in the window; false for a repeat. */
export async function firstRun(ctx: PlatformCtx, opId: string): Promise<boolean> {
  const id = OpId.safeParse(opId);
  if (!id.success) throw new FieldsError({ opId: "console.op.invalid" });
  const r = await rateLimit(platformBucket("op", `${ctx.user.id}.${id.data}`), 1, OP_WINDOW_SEC);
  return r.ok;
}
