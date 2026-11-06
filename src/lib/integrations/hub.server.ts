import "server-only";
/**
 * The integrations hub's one read (P5 INTEGRATIONS; operations.md OPE-§28.1, §19.8, OD40): what
 * `/app/<h>/integrations` shows, composed from the shared reads (`integrationHealth`, `sheetsBacklog`, the run
 * history, `listDeliveries`) and the store's own settings, every one through its scope. Each block loads on its own:
 * a failed read is `null` for that block (the page shows an inline retry there) and never blanks the others.
 *
 * - `tiles`: one per connected target. The `integration_status` rows first; a sheet or a Telegram chat that is
 *   connected but has no row yet (no run so far) gets a `new` tile, never a made-up state. A pixel's server events
 *   show once their first send wrote the row.
 * - `sheets`: the backlog and the last 20 runs, when a sheet is connected or a run was ever recorded.
 * - `deliveries`: the first page of the log (masked rows, src/lib/integrations/deliveries.ts).
 * - `deadByKind`: dead rows per kind (for "Replay all dead of this kind", ≤ 50 per call).
 * - `checks`: per failing kind (a `failing` row, or dead deliveries of a kind none of whose targets works again)
 *   the three likely causes.
 */
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { outbox } from "@/lib/db/schema";
import { getSheetsConfig } from "@/lib/sheets/config";
import { sheetsRunHistory, type SheetsRunReport } from "@/lib/sheets/history";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";
import { whatToCheck, type CheckItem } from "./causes";
import { listDeliveries, type DeliveryRow } from "./deliveries";
import { integrationHealth, sheetsBacklog, type IntegrationHealthRow, type IntegrationKind, type SheetsBacklog } from "./health";

/** The kinds the R1 log filters offer (R2 adds `webhook`, `carrier`; R3 `whatsapp`). */
export const HUB_KINDS = ["capi", "telegram"] as const;
export type HubKind = (typeof HUB_KINDS)[number];

export interface HubTile {
  kind: IntegrationKind;
  targetId: string;
  /** the platform of a pixel ("meta"), else null */
  platform: string | null;
  /** a masked target: the pixel's or the chat's last 4, never the full id */
  last4: string | null;
  /** `new`: connected, nothing ran yet */
  state: IntegrationHealthRow["state"] | "new";
  backlog: number;
  oldestPendingAt: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorKey: MessageKey | null;
}

export interface HubSheets {
  connected: boolean;
  enabled: boolean;
  backlog: SheetsBacklog;
  runs: SheetsRunReport[];
}

export interface HubCheck {
  kind: IntegrationKind;
  items: CheckItem[];
}

export interface IntegrationsHub {
  tiles: HubTile[] | null;
  sheets: HubSheets | null | "error";
  deliveries: { rows: DeliveryRow[]; next: string | null } | null;
  deadByKind: Partial<Record<HubKind, number>> | null;
  checks: HubCheck[];
}

const KIND_ORDER: Record<string, number> = { sheets: 0, capi: 1, telegram: 2, webhook: 3, carrier: 4, whatsapp: 5 };
const tail4 = (s: string) => s.replace(/[^0-9A-Za-z_]/g, "").slice(-4) || null;

/** A status row as a tile: the pixel's platform and last 4 digits, never the full pixel id. Pure. */
export function tileOf(r: IntegrationHealthRow): HubTile {
  const m = r.kind === "capi" ? /^([a-z]{2,12}):(.+)$/.exec(r.targetId) : null;
  return {
    kind: r.kind,
    targetId: r.kind === "capi" ? (m ? `${m[1]}:${tail4(m[2]!) ?? ""}` : "") : r.targetId === "" ? "" : `${r.kind}:${tail4(r.targetId) ?? ""}`,
    platform: m ? m[1]! : null,
    last4: m ? tail4(m[2]!) : r.kind === "telegram" || r.targetId === "" ? null : tail4(r.targetId),
    state: r.state,
    backlog: r.backlog,
    oldestPendingAt: r.oldestPendingAt,
    lastOkAt: r.lastOkAt,
    lastErrorAt: r.lastErrorAt,
    lastErrorKey: r.lastErrorKey,
  };
}

/** The tiles: status rows, plus a `new` tile for a connected sheet or chat without one. Pure. */
export function hubTiles(rows: readonly IntegrationHealthRow[], connected: { sheets: boolean; telegram: { last4: string } | null }): HubTile[] {
  const tiles = rows.map(tileOf);
  const has = (kind: IntegrationKind) => rows.some((r) => r.kind === kind);
  const fresh = (kind: IntegrationKind, last4: string | null): HubTile => ({
    kind,
    targetId: "",
    platform: null,
    last4,
    state: "new",
    backlog: 0,
    oldestPendingAt: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastErrorKey: null,
  });
  if (connected.sheets && !has("sheets")) tiles.push(fresh("sheets", null));
  if (connected.telegram && !has("telegram")) tiles.push(fresh("telegram", connected.telegram.last4));
  return tiles.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.targetId.localeCompare(b.targetId));
}

/** What to check: per kind with a `failing` row or dead deliveries, its three likely causes (the named one first). Pure. */
export function hubChecks(rows: readonly IntegrationHealthRow[], dead: Partial<Record<HubKind, number>>): HubCheck[] {
  const out: HubCheck[] = [];
  // a kind with dead deliveries counts as failing unless one of its targets is working again
  const recovered = (k: IntegrationKind) => rows.some((r) => r.kind === k && r.state === "ok");
  const kinds = [...new Set<IntegrationKind>([...rows.filter((r) => r.state === "failing").map((r) => r.kind), ...HUB_KINDS.filter((k) => (dead[k] ?? 0) > 0 && !recovered(k))])];
  kinds.sort((a, b) => (KIND_ORDER[a] ?? 9) - (KIND_ORDER[b] ?? 9));
  for (const kind of kinds) {
    const named = rows.find((r) => r.kind === kind && r.state === "failing" && r.lastErrorCode)?.lastErrorCode ?? null;
    const items = whatToCheck(kind, named);
    if (items.length) out.push({ kind, items });
  }
  return out;
}

/** Dead rows of the store per R1 kind (`ob_store_idx`). */
export async function deadByKind(scope: StoreScope): Promise<Partial<Record<HubKind, number>>> {
  const rows = await db
    .select({ kind: outbox.kind, n: count() })
    .from(outbox)
    .where(whereStore(outbox, scope, and(eq(outbox.state, "dead"), inArray(outbox.kind, [...HUB_KINDS]))))
    .groupBy(outbox.kind);
  const out: Partial<Record<HubKind, number>> = {};
  for (const r of rows) out[r.kind as HubKind] = Number(r.n);
  return out;
}

const settled = <T>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);

/** The log's opening filters (`?kind=capi&state=dead`, the ⌘K "Replay failed deliveries" link). */
export interface HubFilters {
  kind?: HubKind;
  state?: DeliveryRow["state"];
}

const STATES: ReadonlySet<string> = new Set(["pending", "running", "done", "dead", "cancelled"]);

/** The filters of a page URL; anything else is ignored. Pure. */
export function hubFilters(q: { kind?: string | string[]; state?: string | string[] }): HubFilters {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const kind = one(q.kind);
  const state = one(q.state);
  return {
    ...(kind && (HUB_KINDS as readonly string[]).includes(kind) ? { kind: kind as HubKind } : {}),
    ...(state && STATES.has(state) ? { state: state as DeliveryRow["state"] } : {}),
  };
}

export async function integrationsHub(scope: StoreScope, filters: HubFilters = {}): Promise<IntegrationsHub> {
  const [health, sheetCfg, telegram, backlog, runs, deliveries, dead] = await Promise.allSettled([
    integrationHealth(scope),
    getSheetsConfig(scope),
    getStoreSetting(scope, "telegram"),
    sheetsBacklog(scope),
    sheetsRunHistory(scope),
    listDeliveries(scope, filters),
    deadByKind(scope),
  ]);
  const rows = settled(health);
  const sheet = settled(sheetCfg);
  const tg = settled(telegram);
  const tgConnected = tg && tg.enabled && tg.botToken && tg.chatId ? { last4: tail4(tg.chatId) ?? "" } : null;
  const deadCounts = settled(dead);

  let sheets: IntegrationsHub["sheets"] = null;
  const b = settled(backlog);
  const r = settled(runs);
  const everRan = (r?.length ?? 0) > 0 || (rows?.some((x) => x.kind === "sheets") ?? false);
  if (sheet || everRan) sheets = b && r ? { connected: !!sheet, enabled: sheet?.enabled ?? false, backlog: b, runs: r } : "error";
  else if (sheetCfg.status === "rejected" || runs.status === "rejected") sheets = "error";

  return {
    tiles: rows && sheetCfg.status === "fulfilled" && telegram.status === "fulfilled" ? hubTiles(rows, { sheets: !!sheet, telegram: tgConnected }) : null,
    sheets,
    deliveries: settled(deliveries),
    deadByKind: deadCounts,
    checks: rows ? hubChecks(rows, deadCounts ?? {}) : [],
  };
}
