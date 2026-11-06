import "server-only";
/**
 * The Google Sheets screen's one read (P5 INTEGRATIONS; operations.md OPE-§19.8, OD54, EXP-03): what
 * `/app/<h>/integrations/sheets` shows, every part through the store's scope. Each block loads on its own: a failed
 * read is `null` for that block (the screen shows an inline retry there) and never blanks the others.
 *
 * - `sheet`: connected means configured and bound (OPE-§19.2); an unbound config reads as not connected.
 * - `proof`: the pending ownership proof's expiry only (the code is shown once, when it is issued).
 * - `status`: the `integration_status` row of the sheet; `lastPushAt` / `lastPullAt` come from the run history.
 * - `labels`: the sheet's "Agent" labels of the last 28 days with no mapped member (OD54), with their decided and
 *   confirmed counts, for the Working-in-the-sheet card ("Map to a member" links P4's /team/agents).
 * - `exportKey`: set / not set, the account and the key id (never the key).
 */
import { and, count, desc, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { exportKeyInfo, type ExportKeyInfo } from "@/lib/export/service-account";
import { getStoreSetting } from "@/lib/settings";
import { getSheetsConfig, pendingProof, sheetBound } from "@/lib/sheets/config";
import { serviceAccountEmail, sheetsConfigProblem } from "@/lib/sheets/client";
import { sheetsRunHistory, type SheetsRunReport } from "@/lib/sheets/history";
import { foldLabel } from "@/lib/sheets/row";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { whatToCheck, type CheckItem } from "./causes";
import { integrationHealth, sheetsBacklog, type IntegrationHealthRow, type SheetsBacklog } from "./health";

export interface SheetsScreenSheet {
  url: string;
  sheetTitle: string;
  connectedAt: string | null;
  enabled: boolean;
  pull: boolean;
}

export interface SheetLabelSeen {
  label: string;
  /** confirm moves to a decided state (confirmed, cancelled, unreachable, fake, duplicate) */
  decided: number;
  confirmed: number;
}

export interface SheetsScreen {
  /** the platform's service account is usable (members only see whether Sheets is available, ADM-35) */
  available: boolean;
  serviceAccountEmail: string | null;
  sheet: SheetsScreenSheet | null | "error";
  proof: { expiresAt: string } | null;
  status: IntegrationHealthRow | null;
  backlog: SheetsBacklog | null;
  runs: SheetsRunReport[] | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
  checks: CheckItem[];
  labels: SheetLabelSeen[] | null;
  exportKey: ExportKeyInfo | null;
}

export const LABELS_WINDOW_DAYS = 28;
const LABELS_MAX = 50;
const DECIDED = ["confirmed", "cancelled", "unreachable", "fake", "duplicate"] as const;

/** The sheet's "Agent" labels of the last 28 days that no member is mapped to (OD54, OPE-§14.1 "Agents named in your sheet"). */
export async function sheetLabelsSeen(scope: StoreScope, now = Date.now()): Promise<SheetLabelSeen[]> {
  const since = new Date(now - LABELS_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({
      label: orders.confirmedByLabel,
      decided: sql<number>`sum(${orders.confirmState} in (${sql.join(
        DECIDED.map((s) => sql`${s}`),
        sql`, `,
      )}))`,
      confirmed: sql<number>`sum(${orders.confirmState} = 'confirmed')`,
      n: count(),
    })
    .from(orders)
    .where(whereStore(orders, scope, and(gte(orders.createdAt, since), sql`${orders.isTest} = 0`, isNull(orders.confirmedBy), isNotNull(orders.confirmedByLabel))))
    .groupBy(orders.confirmedByLabel)
    .orderBy(desc(count()))
    .limit(LABELS_MAX);
  // a label mapped meanwhile (ops.agentLabels, P4's key, read only) leaves this list for the agents table
  const mapped = new Set(Object.keys((await getStoreSetting(scope, "ops").catch(() => null))?.agentLabels ?? {}).map(foldLabel));
  return rows
    .filter((r): r is typeof r & { label: string } => !!r.label && !mapped.has(foldLabel(r.label)))
    .map((r) => ({ label: r.label, decided: Number(r.decided ?? 0), confirmed: Number(r.confirmed ?? 0) }));
}

/** The last run that wrote to the sheet, and the last that brought changes back (or was a pull run). Pure. */
export function lastPushPull(runs: readonly SheetsRunReport[]): { lastPushAt: string | null; lastPullAt: string | null } {
  return {
    lastPushAt: runs.find((r) => r.ok && r.trigger !== "pull")?.at ?? null,
    lastPullAt: runs.find((r) => r.ok && (r.trigger === "pull" || r.pulled > 0))?.at ?? null,
  };
}

const settled = <T>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);

export async function sheetsScreen(scope: StoreScope): Promise<SheetsScreen> {
  const [cfg, proof, health, backlog, runs, labels, exportKey] = await Promise.allSettled([
    getSheetsConfig(scope).then(async (c) => (c && (await sheetBound(scope, c.spreadsheetId)) ? c : null)),
    pendingProof(scope),
    integrationHealth(scope),
    sheetsBacklog(scope),
    sheetsRunHistory(scope),
    sheetLabelsSeen(scope),
    exportKeyInfo(scope),
  ]);
  const c = settled(cfg);
  const status = settled(health)?.find((r) => r.kind === "sheets") ?? null;
  const history = settled(runs);
  return {
    available: !sheetsConfigProblem(),
    serviceAccountEmail: serviceAccountEmail(),
    sheet: cfg.status === "rejected" ? "error" : c && { url: c.url, sheetTitle: c.sheetTitle, connectedAt: c.connectedAt, enabled: c.enabled, pull: c.pull },
    proof: c ? null : (settled(proof) && { expiresAt: settled(proof)!.expiresAt }) || null,
    status,
    backlog: settled(backlog),
    runs: history,
    ...lastPushPull(history ?? []),
    checks: status?.state === "failing" ? whatToCheck("sheets", status.lastErrorCode) : [],
    labels: settled(labels),
    exportKey: settled(exportKey),
  };
}
