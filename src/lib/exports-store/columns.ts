/**
 * Which columns the store export writes (docs/STORE-SAAS.md §F.9 "Never exported", §F.10; R1 P8 step 8). Pure: no I/O.
 *
 * Columns are read generically from the Drizzle table objects, so a column an owning track adds later is exported
 * without editing this file, minus:
 *   - the per-table deny list (`EXPORT_DENY`): `capi_ctx`, token hashes, claim tokens, share tokens, console flags;
 *   - any column whose name looks like a secret (`COLUMN_SECRET_RE`), whatever its table: a credential column added
 *     tomorrow is withheld until someone decides otherwise here;
 *   - columns this database does not have yet (a migration still to run): skipped and named in README.txt.
 * The order is the schema's. Headers and JSON keys are the SQL column names.
 */
import { getTableColumns } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { agentStatsDaily, aiMemory, auditLog, campaigns, customers, deliveryZones, leads, messageTemplates, orderEvents, orders, shortLinks } from "@/lib/db/schema";

/** A column name that is never exported, in any table (secrets, credentials, tokens and their hashes). */
export const COLUMN_SECRET_RE = /token|secret|passw|credential|api_?key|private_?key|capi_ctx|recovery|cookie|totp|(^|_)otp(_|$)/i;

/** §F.9 "Never exported", per table (SQL names). */
export const EXPORT_DENY: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // the server-side CAPI context (fbp, fbc, ip, ua for Meta), the upsell link's token hash, the queue's claim token
  orders: ["capi_ctx", "upsell_token_hash", "claim_token"],
  // the read-only share token's hash (§F.9: kits without share tokens)
  campaigns: ["share_token_hash"],
  // console flags never reach a tenant (PLA-§6.3); health.json comes from getStoreHealth, this is belt and braces
  store_health: ["flags"],
});

/** The tables the export reads generically: SQL name → drizzle columns (schema order). */
export const EXPORT_TABLES = Object.freeze({
  orders: getTableColumns(orders),
  leads: getTableColumns(leads),
  customers: getTableColumns(customers),
  order_events: getTableColumns(orderEvents),
  audit_log: getTableColumns(auditLog),
  agent_stats_daily: getTableColumns(agentStatsDaily),
  message_templates: getTableColumns(messageTemplates),
  short_links: getTableColumns(shortLinks),
  campaigns: getTableColumns(campaigns),
  delivery_zones: getTableColumns(deliveryZones),
  ai_memory: getTableColumns(aiMemory),
} satisfies Record<string, Record<string, AnyMySqlColumn>>);

export type ExportTable = keyof typeof EXPORT_TABLES;

/** May column `name` of `table` be exported? */
export function columnAllowed(table: string, name: string): boolean {
  return !COLUMN_SECRET_RE.test(name) && !(EXPORT_DENY[table] ?? []).includes(name);
}

export interface PickedColumns {
  /** the select map: SQL name → drizzle column */
  fields: Record<string, AnyMySqlColumn>;
  /** SQL names in schema order (the CSV header, the JSON keys) */
  names: string[];
  /** schema columns this database does not have (`present` given) */
  missing: string[];
}

/** The exportable columns of `table` (schema order), limited to those `present` in the database (null = all). */
export function pickColumns(table: string, columns: Record<string, AnyMySqlColumn>, present: ReadonlySet<string> | null): PickedColumns {
  const fields: Record<string, AnyMySqlColumn> = {};
  const names: string[] = [];
  const missing: string[] = [];
  for (const col of Object.values(columns)) {
    const name = (col as unknown as { name: string }).name;
    if (!columnAllowed(table, name)) continue;
    if (present && !present.has(name)) {
      missing.push(name);
      continue;
    }
    fields[name] = col;
    names.push(name);
  }
  return { fields, names, missing };
}

/** Removes, at any depth, object keys that name a secret (the audit's own rule, plus the column rule). */
export function stripSecretKeys(value: unknown, secretKey: RegExp, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => stripSecretKeys(v, secretKey, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (secretKey.test(k) || COLUMN_SECRET_RE.test(k)) continue;
    out[k] = stripSecretKeys(v, secretKey, depth + 1);
  }
  return out;
}

/** a key naming an AI run: run, runs, runId, run_ids, lastRunId, sourceRuns… */
const RUN_KEY_RE = /^runs?$|runs?_?ids?$|^(source|last|first)_?runs?$/i;

/** ai_memory.evidence without run ids (AI R17): any key naming a run, at any depth. */
export function stripRunIds(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => stripRunIds(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (RUN_KEY_RE.test(k)) continue;
    out[k] = stripRunIds(v, depth + 1);
  }
  return out;
}

/** A page slug as an archive folder or file name (slugs are [a-z0-9-] already; anything else gets the id's tail). */
export function slugName(slug: string, id: string): string {
  const clean = slug.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return clean && clean === slug ? clean : `${clean || "page"}-${id.slice(-6).toLowerCase()}`;
}

const EXT: Readonly<Record<string, string>> = Object.freeze({
  "image/webp": "webp",
  "image/avif": "avif",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
});

/** media/<assetId>.<ext>: the extension of a stored file's type ("bin" for an unknown one). */
export const mediaExt = (mime: string): string => EXT[mime.toLowerCase()] ?? "bin";
