import "server-only";
/**
 * Integration health reads (P5 INTEGRATIONS; operations.md OPE-§28.1, §28.2, OD40; docs/STORE-SAAS.md §K.2 P0, PLA Q.11):
 * the one read every surface uses (the integrations page strip, the dashboard tile, the console store profile, the
 * `int:*` health rules and P1's platform flags). Typed stubs frozen at P0.
 */
import type { integrationStatus } from "@/lib/db/schema";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";

export type IntegrationKind = (typeof integrationStatus.$inferSelect)["kind"];

/** One `integration_status` row, with its last error code mapped to the plain-words cause (`int.cause.<code>`). */
export interface IntegrationHealthRow {
  kind: IntegrationKind;
  /** "" | "meta:<pixel>" | endpoint id | account id */
  targetId: string;
  state: "ok" | "warn" | "failing" | "off";
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorKey: MessageKey | null;
  /** consecutive failures */
  failures: number;
  backlog: number;
  oldestPendingAt: string | null;
  updatedAt: string;
}

/**
 * The Sheets backlog of the store. OPE-§28.1's fields, plus `lastRunFailedAt`, which P1's `sheets_error` platform flag
 * reads (PLA-§6.3, PD79); PLA Q.11's `oldestMin` is derived from `oldestPendingAt`.
 */
export interface SheetsBacklog {
  pending: number;
  dirty: number;
  failed: number;
  oldestPendingAt: string | null;
  lastRunAt: string | null;
  lastRunFailedAt: string | null;
}

export async function integrationHealth(scope: StoreScope): Promise<IntegrationHealthRow[]> {
  void scope;
  throw new Error("not implemented: P5 integrationHealth");
}

export async function sheetsBacklog(scope: StoreScope): Promise<SheetsBacklog> {
  void scope;
  throw new Error("not implemented: P5 sheetsBacklog");
}
