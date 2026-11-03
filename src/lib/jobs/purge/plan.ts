/**
 * The purge's plan (docs/STORE-SAAS.md §F.9 "Deletion", §H.9; rev 3 ENGC-31, SEC-21; R1 P8 step 10). Pure: no I/O and
 * no clock, so the purge job, test:jobs and test:migrate (case e, CCR r1-p8-10) read the same list.
 *
 *   purgePlan()            → { steps, tables, keep }: every step of one store's purge, in order
 *   schemaTenantTables()   → every mysqlTable of schema.ts with a store_id column (the lint's tenant set, §F.1)
 *
 * The table set is enumerated from schema.ts, never from a list: every tenant table that is not in PURGE_KEEP is
 * deleted `WHERE store_id = ?`, and a table §F.9 does not name joins the plan before `pages` the day it is added. The
 * two tables without a store column follow their owner: `headline_shingles` by `owner_tag` (D35) and `media_chunks` by
 * the keys of the store's `media_files` rows (deleted just before those rows, which hold the keys). Every per-store
 * area of the DATA_AREAS registry (§G.7, SEC-21) is a step too: `exports` right after `export_jobs` ("and their
 * files"), the others between the store's content rows and its media rows.
 *
 * Order (§F.9; only the store FK exists, D29, so the order is about what a half-done purge leaves, never about keys):
 *   1. the queues and jobs: outbox, render_jobs, export_jobs (+ exports/<id>/), every ai_* table, preview_tokens
 *   2. design_genomes, headline_shingles
 *   3. campaigns … ad_spend_daily, then every tenant table §F.9 does not name (R2 / R3 tables)
 *   4. order_events, the agent_* tables, saved_views … job_runs, error_events
 *   5. leads, orders, customers, stats_daily, page_versions, pages, exports, asset_refs
 *   6. the other per-store DATA_DIR areas (media/v1/<xx>/<id>/, imports/, receipts/, ai/)
 *   7. media_chunks, media_files, assets, the store_* rows, store_health last
 */
import { is } from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "@/lib/db/schema";
import { DATA_AREAS, type DataArea } from "@/lib/storage/paths";

/**
 * The tenant tables a purge keeps (§F.9 "Kept"): the audit trail (meta redacted), the staff's records of the store
 * (impersonation sessions, requests, abuse reports, notes soft-deleted), the proof of acceptance (ua nulled), the review
 * row (signals emptied) and the handle quarantine. `stores` itself stays as the tombstone (it has no store_id column).
 */
export const PURGE_KEEP = Object.freeze([
  "audit_log",
  "impersonation_sessions",
  "platform_requests",
  "abuse_reports",
  "legal_acceptances",
  "signup_reviews",
  "platform_notes",
  "store_handle_history",
] as const);

/** The two tables without a store column a purge still empties of the store's rows. */
export const SHINGLES_TABLE = "headline_shingles";
export const CHUNKS_TABLE = "media_chunks";

export type PurgeStep =
  /** DELETE … WHERE store_id = ? LIMIT n, repeated until a slice deletes fewer than n */
  | { kind: "rows"; group: number; table: string; by: "store_id" }
  /** headline_shingles WHERE owner_tag = hmac(storeId, "shingle-owner")[:16] (D35) */
  | { kind: "rows"; group: number; table: typeof SHINGLES_TABLE; by: "owner_tag" }
  /** media_chunks WHERE key IN (the store's media_files keys) */
  | { kind: "rows"; group: number; table: typeof CHUNKS_TABLE; by: "media_key" }
  /** the store's folder of a per-store DATA_DIR area, removed recursively */
  | { kind: "area"; group: number; area: DataArea };

export interface PurgePlan {
  steps: readonly PurgeStep[];
  /** the tenant tables deleted WHERE store_id = ? (every one exactly once) */
  tables: readonly string[];
  /** the tenant tables kept (PURGE_KEEP ∩ the schema's tenant set) */
  keep: readonly string[];
}

/** Every schema.ts table with a store_id column, sorted by name. */
export function schemaTenantTables(): string[] {
  const out: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, MySqlTable)) continue;
    const config = getTableConfig(value);
    if (config.columns.some((c) => c.name === "store_id")) out.push(config.name);
  }
  return out.sort();
}

/** The per-store areas of the registry, in registry order. */
export function perStoreAreas(): DataArea[] {
  return (Object.keys(DATA_AREAS) as DataArea[]).filter((a) => DATA_AREAS[a].perStore);
}

// §F.9's named tables per group ("*" = the rest of a prefix family, sorted; "@rest" = every table not named anywhere)
const G1 = ["outbox", "render_jobs", "export_jobs", "@area:exports", "ai_jobs", "ai_batch_items", "ai_usage_daily", "ai_*", "preview_tokens"];
const G2 = ["design_genomes", `@by:${SHINGLES_TABLE}`];
const G3 = ["campaigns", "short_links", "page_slug_history", "integration_status", "profit_alerts", "product_costs", "carrier_rates", "ad_spend_daily", "@rest"];
const G4 = ["order_events", "agent_*", "saved_views", "message_templates", "delivery_zones", "sheet_bindings", "notifications", "job_runs", "error_events"];
const G5 = ["leads", "orders", "customers", "stats_daily", "page_versions", "pages", "exports", "asset_refs"];
const G6 = ["@areas"];
const G7 = [`@by:${CHUNKS_TABLE}`, "media_files", "assets", "store_settings", "store_entitlements", "store_usage", "store_subscriptions", "store_invites", "store_members", "store_health"];
const GROUPS = [G1, G2, G3, G4, G5, G6, G7];

/**
 * The purge's steps for a tenant set (default: schema.ts) and the registry's per-store areas. A named table the schema
 * does not have is skipped; a tenant table nobody names lands at "@rest" (group 3, before pages).
 */
export function purgePlan(tenant: readonly string[] = schemaTenantTables(), areas: readonly DataArea[] = perStoreAreas()): PurgePlan {
  const keepSet = new Set<string>(PURGE_KEEP);
  const deletable = new Set(tenant.filter((t) => !keepSet.has(t)));
  const named = new Set<string>();
  const prefixOf = (e: string) => (e.endsWith("_*") ? e.slice(0, -1) : null);
  for (const g of GROUPS) for (const e of g) if (!e.startsWith("@") && !prefixOf(e)) named.add(e);
  const prefixes = GROUPS.flat().map(prefixOf).filter((p): p is string => !!p);
  const placed = new Set<string>();
  const placedAreas = new Set<DataArea>();
  const steps: PurgeStep[] = [];
  const take = (group: number, table: string) => {
    if (!deletable.has(table) || placed.has(table)) return;
    placed.add(table);
    steps.push({ kind: "rows", group, table, by: "store_id" });
  };
  const area = (group: number, a: DataArea) => {
    if (!areas.includes(a) || placedAreas.has(a)) return;
    placedAreas.add(a);
    steps.push({ kind: "area", group, area: a });
  };
  const sorted = [...deletable].sort();
  GROUPS.forEach((entries, i) => {
    const group = i + 1;
    for (const e of entries) {
      const prefix = prefixOf(e);
      if (prefix) {
        for (const t of sorted) if (t.startsWith(prefix) && !named.has(t)) take(group, t);
      } else if (e === "@rest") {
        for (const t of sorted) if (!named.has(t) && !prefixes.some((p) => t.startsWith(p))) take(group, t);
      } else if (e === "@areas") {
        for (const a of areas) area(group, a);
      } else if (e.startsWith("@area:")) {
        area(group, e.slice("@area:".length) as DataArea);
      } else if (e === `@by:${SHINGLES_TABLE}`) {
        steps.push({ kind: "rows", group, table: SHINGLES_TABLE, by: "owner_tag" });
      } else if (e === `@by:${CHUNKS_TABLE}`) {
        steps.push({ kind: "rows", group, table: CHUNKS_TABLE, by: "media_key" });
      } else take(group, e);
    }
  });
  return Object.freeze({
    steps: Object.freeze(steps.map((s) => Object.freeze(s))),
    tables: Object.freeze([...placed]),
    keep: Object.freeze(tenant.filter((t) => keepSet.has(t))),
  });
}
