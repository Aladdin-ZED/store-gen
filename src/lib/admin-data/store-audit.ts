import "server-only";
/**
 * Shared bits of the store repositories (docs/STORE-SAAS.md §E.3, §F.5): the audit row of a write, tagged with the
 * scope's store and the seam's actor (never with values from input), and the driver's affected-row count that turns
 * "0 rows" into not found.
 */
import { audit, type AuditAction, type AuditDetails } from "@/lib/audit";
import type { Actor, StoreScope } from "@/lib/tenancy/types";

export type { Actor };

/** One audit row about the scope's store by `actor` (an impersonation row names both identities, §B.8). Never throws. */
export function auditIn(scope: StoreScope, actor: Actor, action: AuditAction, details: Omit<AuditDetails, "userId" | "ip"> = {}): Promise<void> {
  return audit(action, {
    ...details,
    userId: actor.userId,
    ip: actor.ip,
    scope: { storeId: scope.storeId, actorKind: actor.kind, impersonatorId: actor.impersonatorId },
  });
}

/** Rows changed by an UPDATE / DELETE (mysql2's ResultSetHeader, through drizzle's tuple). */
export function affected(res: unknown): number {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

/** A LIKE operand matching `s` literally. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
