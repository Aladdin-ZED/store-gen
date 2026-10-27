import "server-only";
/**
 * Short user-facing failures of dashboard server actions: `fail("…")` inside a `storeAction` / `platformAction` body
 * answers `{ ok: false, error: "…" }` without logging (the seam's error mapping, src/lib/tenancy/seam.ts). The
 * single-tenant `adminAction` wrapper went with the legacy /admin at the T4 merge (R1.0).
 */
import type { ActionResult } from "@/components/admin/lib/action-result";

export type { ActionResult };

/** Thrown inside an action to answer with a message (no logging). */
export class ActionError extends Error {}

export const fail = (message: string): never => {
  throw new ActionError(message);
};
