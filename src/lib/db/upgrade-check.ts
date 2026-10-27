/**
 * Upgrade dry run (docs/OFFERS.md §I.3) — READ ONLY. Every pages.draft, every page_versions.doc and
 * every non-revoked export's version goes through the v1 → v2 upgrade the app now applies on read:
 *
 *  - 0 unreadable documents (neither PageDoc nor validateDoc can read them: such a live page would
 *    refuse orders);
 *  - ids preserved (offers, groups, options; renamed duplicates listed);
 *  - v1 documents: offerMath (cents) == v1 bundleMath per bundle, orderTotals == v1 orderTotals for
 *    each bundle × bump on/off, Sheets labels identical;
 *  - repair counts by kind and every money value changed by rounding.
 *
 * Used by scripts/qa/upgrade-dry-run.ts (deploy gate, `--db <mysql url>`) and once at boot
 * (instrumentation, non-blocking, `[upgrade-check]` log lines). Framework-free: mysql2 + page libs.
 *
 * Multi-tenant (R1.0): the documents are read across every store (a read-only platform gate in src/lib/db/**), and
 * the tenancy section below (`runTenancyCheck`, `[tenancy-check]` at boot) checks the store #1 conversion and the
 * store boundaries.
 */
import { is } from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import type { Connection } from "mysql2/promise";
import { offerSheetLabel } from "@/lib/page/catalog";
import { emptySelection, fromCents, offerMath, orderTotals } from "@/lib/page/pricing";
import { PageDoc, type PageDoc as PageDocT } from "@/lib/page/schema";
import { upgradeDocReport, type RepairKind } from "@/lib/page/upgrade";
import { validateDoc } from "@/lib/page/validate";
import * as schema from "./schema";

export interface UpgradeCheckReport {
  scanned: { drafts: number; versions: number; exportVersions: number; v1: number; v2: number };
  /** documents nothing can read (gate: must be 0) */
  failures: { source: string; id: string; issues: string[] }[];
  /** documents only validateDoc can read (sections / legacy values repaired there): readable */
  viaValidateDoc: number;
  repairs: Partial<Record<RepairKind, number>>;
  renamed: { source: string; id: string; path: string; from: unknown; to: unknown }[];
  money: { source: string; id: string; path: string; from: unknown; to: unknown }[];
  /** ids of the v1 document missing after the upgrade (gate: must be empty) */
  idsLost: { source: string; id: string; what: string }[];
  /** v1 bundleMath ≠ v2 offerMath (gate: must be empty) */
  mathMismatches: { source: string; id: string; offer: string; field: string; v1: unknown; v2: unknown }[];
  /** v1 orderTotals ≠ v2 orderTotals (gate: must be empty) */
  totalsMismatches: { source: string; id: string; offer: string; bump: boolean; field: string; v1: number; v2: number }[];
  /** v1 Sheets label ≠ offerSheetLabel (gate: must be empty) */
  labelMismatches: { source: string; id: string; offer: string; v1: string; v2: string }[];
}

export function emptyReport(): UpgradeCheckReport {
  return {
    scanned: { drafts: 0, versions: 0, exportVersions: 0, v1: 0, v2: 0 },
    failures: [],
    viaValidateDoc: 0,
    repairs: {},
    renamed: [],
    money: [],
    idsLost: [],
    mathMismatches: [],
    totalsMismatches: [],
    labelMismatches: [],
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const round2 = (n: number) => Math.round(n * 100) / 100;
/** v1 math ran on floats; v2 is exact cents: equal within half a cent */
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** The v1 formulas (src/lib/page/pricing.ts before Offers v2), on the raw v1 JSON. */
function v1BundleMath(b: Obj, unit: number) {
  const qty = Math.max(1, num(b.qty, 1));
  const price = num(b.price);
  const reference = round2(b.compareAt !== undefined ? num(b.compareAt) : unit * qty);
  const savings = round2(Math.max(0, reference - price));
  const savingsPct = reference > 0 ? Math.min(99, Math.round((savings / reference) * 100)) : 0;
  return { qty, total: round2(price), reference, savings, savingsPct, perUnit: round2(price / qty), showReference: savings > 0.009 };
}

function idsOf(raw: Obj): { what: string; id: string }[] {
  const out: { what: string; id: string }[] = [];
  const product = isObj(raw.product) ? raw.product : {};
  // options by group position (a duplicate group id is renamed, its options stay with it)
  objs(product.variants).forEach((g, gi) => {
    if (typeof g.id === "string") out.push({ what: "group", id: g.id });
    for (const o of objs(g.options)) if (typeof o.id === "string") out.push({ what: `option of group #${gi + 1}`, id: o.id });
  });
  for (const b of objs(isObj(raw.offers) ? raw.offers.bundles : [])) if (typeof b.id === "string") out.push({ what: "offer", id: b.id });
  return out;
}

function idsOfV2(doc: PageDocT): Set<string> {
  const out = new Set<string>();
  for (const it of doc.items)
    it.groups.forEach((g, gi) => {
      out.add(`group:${g.id}`);
      if (g.kind === "swatch" || g.kind === "text" || g.kind === "image") for (const o of g.options) out.add(`option of group #${gi + 1}:${o.id}`);
    });
  for (const o of doc.offers.bundles) out.add(`offer:${o.id}`);
  return out;
}

/** One stored document through the upgrade (pure; offers-check runs it on fixtures and v1 samples). */
export function checkDoc(raw: unknown, source: string, id: string, report: UpgradeCheckReport): PageDocT | null {
  const up = upgradeDocReport(raw);
  if (up.from === 1) report.scanned.v1++;
  else if (up.from === 2) report.scanned.v2++;
  for (const r of up.repairs) {
    report.repairs[r.kind] = (report.repairs[r.kind] ?? 0) + 1;
    if (r.kind === "duplicate_id") report.renamed.push({ source, id, path: r.path, from: r.from, to: r.to });
    if (r.kind === "money") report.money.push({ source, id, path: r.path, from: r.from, to: r.to });
  }
  let doc: PageDocT | null = null;
  const parsed = PageDoc.safeParse(raw);
  if (parsed.success) doc = parsed.data;
  else {
    const v = validateDoc(raw);
    if (v.doc) {
      doc = v.doc;
      report.viaValidateDoc++;
    } else {
      report.failures.push({ source, id, issues: v.issues.filter((i) => i.level === "error").slice(0, 5).map((i) => `${i.path || "(root)"}: ${i.message}`) });
      return null;
    }
  }
  if (up.from !== 1 || !isObj(raw)) return doc;

  // ids preserved (first occurrences keep theirs; renamed duplicates are listed above)
  const have = idsOfV2(doc);
  for (const x of idsOf(raw)) if (!have.has(`${x.what}:${x.id}`)) report.idsLost.push({ source, id, what: `${x.what} "${x.id}"` });

  // money and labels: v1 formulas on the raw document vs v2 cents
  const product = isObj(raw.product) ? raw.product : {};
  const offers = isObj(raw.offers) ? raw.offers : {};
  const unit = num(product.price);
  const fee = num(offers.shippingFee);
  const bump = isObj(offers.orderBump) ? offers.orderBump : null;
  const rawBundles = objs(offers.bundles);
  const seen = new Set<string>();
  rawBundles.forEach((b) => {
    const bid = String(b.id);
    if (seen.has(bid)) return; // a renamed duplicate: compared under its new id below only when it kept the same position
    seen.add(bid);
    const offer = doc!.offers.bundles.find((o) => o.id === bid);
    if (!offer) return;
    const v1 = v1BundleMath(b, unit);
    const m = offerMath(doc!, offer);
    const v2 = {
      qty: m.units,
      total: fromCents(m.from),
      reference: fromCents(m.displayReference),
      savings: fromCents(m.savings),
      savingsPct: m.savingsPct,
      perUnit: fromCents(m.perUnit ?? Math.round(m.from / Math.max(1, m.units))),
      showReference: m.showReference,
    };
    for (const k of Object.keys(v1) as (keyof typeof v1)[]) {
      const a = v1[k];
      const c = v2[k];
      const ok = typeof a === "number" && typeof c === "number" ? same(a, c) : a === c;
      if (!ok) report.mathMismatches.push({ source, id, offer: bid, field: k, v1: a, v2: c });
    }
    for (const withBump of [false, true]) {
      const t = orderTotals(doc!, emptySelection(bid, withBump));
      if (!t) continue;
      const bumpPrice = withBump && bump?.enabled === true ? round2(num(bump.price)) : 0;
      const subtotal = round2(v1.total + bumpPrice);
      const total = round2(subtotal + round2(fee));
      const pairs: [string, number, number][] = [
        ["bump", bumpPrice, fromCents(t.bump)],
        ["shipping", round2(fee), fromCents(t.shipping)],
        ["subtotal", subtotal, fromCents(t.subtotal)],
        ["total", total, fromCents(t.total)],
      ];
      for (const [field, a, c] of pairs) if (!same(a, c)) report.totalsMismatches.push({ source, id, offer: bid, bump: withBump, field, v1: a, v2: c });
    }
    const title = typeof b.title === "string" ? b.title : "";
    const v1Label = title ? `${title} (x${v1.qty})` : `x${v1.qty}`;
    const v2Label = offerSheetLabel(doc!, offer);
    if (v1Label !== v2Label) report.labelMismatches.push({ source, id, offer: bid, v1: v1Label, v2: v2Label });
  });
  return doc;
}

/** True when the deploy gate passes. */
export function upgradeCheckOk(r: UpgradeCheckReport): boolean {
  return !r.failures.length && !r.idsLost.length && !r.mathMismatches.length && !r.totalsMismatches.length && !r.labelMismatches.length;
}

/** Human summary lines (no document content, ids only). */
export function upgradeCheckSummary(r: UpgradeCheckReport): string[] {
  const s = r.scanned;
  const lines = [
    `scanned ${s.drafts} drafts, ${s.versions} versions (${s.exportVersions} used by exports): ${s.v1} v1, ${s.v2} v2`,
    `unreadable: ${r.failures.length} · read through validateDoc: ${r.viaValidateDoc}`,
    `repairs: ${Object.entries(r.repairs).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
    `ids lost: ${r.idsLost.length} · money mismatches: ${r.mathMismatches.length} · totals mismatches: ${r.totalsMismatches.length} · label mismatches: ${r.labelMismatches.length}`,
  ];
  for (const f of r.failures.slice(0, 10)) lines.push(`  ✗ ${f.source} ${f.id}: ${f.issues.join(" | ")}`);
  for (const x of r.renamed.slice(0, 20)) lines.push(`  renamed ${x.source} ${x.id} ${x.path}: ${String(x.from)} → ${String(x.to)}`);
  for (const x of r.money.slice(0, 20)) lines.push(`  money ${x.source} ${x.id} ${x.path}: ${String(x.from)} → ${String(x.to)}`);
  for (const x of r.idsLost.slice(0, 20)) lines.push(`  ✗ id lost ${x.source} ${x.id}: ${x.what}`);
  for (const x of r.mathMismatches.slice(0, 20)) lines.push(`  ✗ math ${x.source} ${x.id} offer ${x.offer} ${x.field}: v1 ${String(x.v1)} ≠ v2 ${String(x.v2)}`);
  for (const x of r.totalsMismatches.slice(0, 20)) lines.push(`  ✗ totals ${x.source} ${x.id} offer ${x.offer} bump=${x.bump} ${x.field}: v1 ${x.v1} ≠ v2 ${x.v2}`);
  for (const x of r.labelMismatches.slice(0, 20)) lines.push(`  ✗ label ${x.source} ${x.id} offer ${x.offer}: "${x.v1}" ≠ "${x.v2}"`);
  return lines;
}

const parseJson = (v: unknown): unknown => {
  if (typeof v !== "string") return Buffer.isBuffer(v) ? JSON.parse(v.toString("utf8")) : v;
  return JSON.parse(v);
};

/**
 * Run the dry run over a database. The connection is switched to read-only transactions first
 * (SET SESSION TRANSACTION READ ONLY): the check can never write.
 */
export async function runUpgradeCheck(conn: Connection, opts: { batch?: number } = {}): Promise<UpgradeCheckReport> {
  const report = emptyReport();
  const batch = Math.max(1, Math.min(200, opts.batch ?? 40));
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  const read = (raw: unknown, source: string, id: string) => {
    let doc: unknown;
    try {
      doc = parseJson(raw);
    } catch {
      report.failures.push({ source, id, issues: ["stored value is not valid JSON"] });
      return;
    }
    checkDoc(doc, source, id, report);
  };

  // tenancy: platform upgrade dry run over every store's documents (read-only)
  const [exportRows] = (await conn.query("SELECT version_id AS v FROM exports WHERE revoked_at IS NULL")) as unknown as [{ v: string }[]];
  const exportVersions = new Set(exportRows.map((r) => r.v));

  for (let offset = 0; ; offset += batch) {
    // tenancy: platform upgrade dry run over every store's drafts (read-only)
    const [rows] = (await conn.query("SELECT id, draft FROM pages ORDER BY id LIMIT ? OFFSET ?", [batch, offset])) as unknown as [{ id: string; draft: unknown }[]];
    for (const r of rows) {
      report.scanned.drafts++;
      read(r.draft, "draft", r.id);
    }
    if (rows.length < batch) break;
  }
  for (let offset = 0; ; offset += batch) {
    // tenancy: platform upgrade dry run over every store's versions (read-only)
    const [rows] = (await conn.query("SELECT id, kind, doc FROM page_versions ORDER BY id LIMIT ? OFFSET ?", [batch, offset])) as unknown as [{ id: string; kind: string; doc: unknown }[]];
    for (const r of rows) {
      report.scanned.versions++;
      const exp = exportVersions.has(r.id);
      if (exp) report.scanned.exportVersions++;
      read(r.doc, exp ? `export-version(${r.kind})` : `version(${r.kind})`, r.id);
    }
    if (rows.length < batch) break;
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* Tenancy dry run (docs/STORE-SAAS.md §D.8 "Read-only gates", §H.10)   */
/* ------------------------------------------------------------------ */
/*
 * `runTenancyCheck(conn)`: READ ONLY, like runUpgradeCheck. Two modes, picked from the schema:
 *  - "pre-tenancy" (a dump taken before the R1.0 deploy: no `stores` table): what 0004 and the conversion will
 *    find, i.e. whether store #1 will be made, its handle, that it will have an active owner, and whether the legacy
 *    envelopes open with this APP_SECRET (a problem with `requireEnvelopes`, run with the production secret);
 *  - "tenancy" (0004 applied): rows with a NULL store_id, stores without an active owner, cross-store references
 *    (order → page / version / export, lead → page, stats → page, export → page / version, version → page, a page's
 *    live version, a store's home page, asset_refs → asset, media_files → asset, store_members → user),
 *    store_settings rows still in a v1 envelope, legacy rows left in settings, duplicate or malformed handles, the
 *    tenancy_v1 marker.
 * Both modes check that the tenant tables enumerated from schema.ts (every table with a store_id column, what the
 * purge and the lint use) are the T / P* / P (opt. store) rows of §D.2 / §D.3 (ENGC-31), as recorded in TABLE_LEVELS.
 */

/** §D.2 / §D.3 levels: T tenant, P* platform about one store, P-opt platform with an optional store, P platform, root = stores. */
export type TableLevel = "T" | "P*" | "P-opt" | "P" | "root";

/**
 * Every table of the schema up to 0005 with its §D.3 level (the 0000 tables per §D.2). A new table is added here in
 * the release that cuts it; test:migrate compares this list with the §D.3 rows of the document.
 * CCR r1.0-t1-3 item 2 split the §D.3 rows of `legal_acceptances` (P (opt. store), PLA-§2.1) and
 * `notification_reads` (P, no store_id) to match the schema; CCR r1.0-t1-1 moved `platform_usage` (P) to 0004.
 * One recorded drift since P0: §D.3 shares the row "`job_runs`, `cron_cursors` · P (opt. store)", but `cron_cursors`
 * has no store_id in §D.5 (job-keyed cursors and the tick lease), so it is P here (test:migrate's DRIFT list).
 */
export const TABLE_LEVELS: Readonly<Record<string, TableLevel>> = {
  // 0000-0003 (§D.2)
  users: "P",
  sessions: "P",
  pages: "T",
  page_versions: "T",
  assets: "T",
  media_files: "T",
  media_chunks: "P", // keyed by the global media key; drains to empty with the FS backend
  orders: "T",
  leads: "T",
  blocklist: "T",
  exports: "T",
  settings: "P",
  rate_limits: "P",
  audit_log: "P-opt",
  stats_daily: "T",
  stats_visitors: "P", // global page ids, purged after 2 days
  // 0004 (§D.3)
  stores: "root",
  store_members: "T",
  store_invites: "T",
  store_settings: "T",
  store_handle_history: "P*",
  plans: "P",
  store_entitlements: "P*",
  store_usage: "T",
  platform_usage: "P", // CCR r1.0-t1-1: cut in 0004, not 0005
  store_subscriptions: "P*",
  platform_invites: "P",
  waitlist: "P",
  password_resets: "P",
  impersonation_sessions: "P*",
  signup_reviews: "P*",
  identity_links: "P",
  protected_brands: "P",
  legal_documents: "P",
  legal_acceptances: "P-opt",
  notifications: "P-opt",
  notification_reads: "P",
  flags: "P",
  flag_overrides: "P",
  asset_refs: "T",
  page_slug_history: "T",
  preview_tokens: "T",
  // 0005 (§D.3)
  store_health: "P*",
  platform_requests: "P-opt",
  staff_invites: "P",
  campaigns: "T",
  short_links: "T",
  abuse_reports: "P*",
  integration_status: "T",
  product_costs: "T",
  carrier_rates: "T",
  ad_spend_daily: "T",
  profit_alerts: "T",
  ai_jobs: "T",
  ai_batches: "P",
  ai_batch_items: "P-opt",
  ai_eval_runs: "P",
  ai_usage_daily: "T",
  platform_notes: "P-opt",
  job_runs: "P-opt",
  cron_cursors: "P", // §D.3 says P (opt. store) on the shared row; §D.5 gives it no store_id (recorded drift)
  error_events: "P-opt",
  outbox: "P-opt",
  render_jobs: "T",
  export_jobs: "T",
  backup_runs: "P",
  order_events: "T",
  customers: "T",
  agent_profiles: "T",
  agent_stats_daily: "T",
  saved_views: "T",
  message_templates: "T",
  delivery_zones: "T",
  sheet_bindings: "T",
  ai_runs: "T",
  ai_cache: "T",
  ai_memory: "T",
  prompt_versions: "P",
  design_genomes: "T",
  headline_shingles: "P", // cross-tenant MinHash, no store id (R-D37, D35)
};

/** Every schema.ts table and its store_id column ("required" NOT NULL, "optional", or none). */
export function schemaStoreColumns(): { table: string; storeId: "required" | "optional" | null }[] {
  const out: { table: string; storeId: "required" | "optional" | null }[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, MySqlTable)) continue;
    const config = getTableConfig(value);
    const column = config.columns.find((c) => c.name === "store_id");
    out.push({ table: config.name, storeId: column ? (column.notNull ? "required" : "optional") : null });
  }
  return out.sort((a, b) => a.table.localeCompare(b.table));
}

/** The tenant set of schema.ts (every table with a store_id) against TABLE_LEVELS (ENGC-31); [] when they agree. */
export function tenantSetProblems(): string[] {
  const problems: string[] = [];
  const tables = schemaStoreColumns();
  for (const { table, storeId } of tables) {
    const level = TABLE_LEVELS[table];
    if (!level) problems.push(`table ${table} is in schema.ts but has no §D.3 level (TABLE_LEVELS)`);
    else if (storeId === "required" && level !== "T" && level !== "P*") problems.push(`${table}: store_id NOT NULL, but §D.3 says ${level}`);
    else if (storeId === "optional" && level !== "P-opt") problems.push(`${table}: store_id NULL-able, but §D.3 says ${level}`);
    else if (storeId === null && (level === "T" || level === "P*" || level === "P-opt")) problems.push(`${table}: no store_id, but §D.3 says ${level}`);
  }
  const known = new Set(tables.map((t) => t.table));
  for (const table of Object.keys(TABLE_LEVELS)) if (!known.has(table)) problems.push(`TABLE_LEVELS lists ${table}, which schema.ts does not define`);
  return problems;
}

export interface TenancyCheckReport {
  mode: "pre-tenancy" | "tenancy";
  /** gate: must be empty */
  problems: string[];
  /** facts worth reading (never values, never customer data) */
  info: string[];
}

export interface TenancyCheckOptions {
  /** an envelope that does not open with this APP_SECRET is a problem (run it with the production secret) */
  requireEnvelopes?: boolean;
}

const LEGACY_STORE = "00000000000000000000000001";
/** the legacy store-level keys the conversion moves out of `settings` (src/lib/tenancy/convert.server.ts MOVED_KEYS) */
const MOVED_KEYS = ["store", "defaults", "sheets", "pixel_library", "pixel_health", "tracking_secrets", "turnstile", "ai", "home", "pixels"] as const;
const LEGACY_KEYS = new Set<string>([...MOVED_KEYS, "doc_schema"]);

type Rows = Record<string, unknown>[];
async function rows(conn: Connection, q: string, params: unknown[] = []): Promise<Rows> {
  const [r] = (await conn.query(q, params)) as unknown as [Rows];
  return r;
}
async function count(conn: Connection, q: string, params: unknown[] = []): Promise<number> {
  const [r] = await rows(conn, q, params);
  return Number(r ? Object.values(r)[0] : 0);
}
async function tableNames(conn: Connection): Promise<Set<string>> {
  const r = await rows(conn, "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
  return new Set(r.map((x) => String(Object.values(x)[0])));
}

/** Whether a stored envelope opens: true, false, or null when this environment has no usable APP_SECRET. */
function envelopeOpens(raw: unknown, open: (envelope: string) => string): boolean | null {
  let envelope: unknown;
  try {
    envelope = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return false;
  }
  if (typeof envelope !== "string") return false;
  try {
    open(envelope);
    return true;
  } catch (err) {
    return err instanceof Error && /APP_SECRET/.test(err.message) ? null : false;
  }
}

/** Counts the envelopes of `sealed` that do not open; `push` gets the line (problem or info). */
function envelopeLine(label: string, sealed: Rows, opener: (r: Record<string, unknown>) => (envelope: string) => string, push: (line: string) => void, ok: (line: string) => void): void {
  if (!sealed.length) return;
  let unreadable = 0;
  for (const r of sealed) {
    const res = envelopeOpens(r.value, opener(r));
    if (res === null) {
      ok(`${sealed.length} ${label} not checked: no usable APP_SECRET in this environment`);
      return;
    }
    if (!res) unreadable++;
  }
  if (unreadable) push(`${unreadable} of ${sealed.length} ${label} do not open with this APP_SECRET`);
  else ok(`${sealed.length} ${label} open with this APP_SECRET`);
}

/** An unencrypted pixel_library value with no pixel (what the pre-tenancy boot writes when there is no page). */
function emptyLibrary(raw: unknown): boolean {
  try {
    const v = JSON.parse(String(raw)) as { pixels?: unknown };
    return Array.isArray(v?.pixels) && v.pixels.length === 0;
  } catch {
    return false;
  }
}

async function preTenancyChecks(conn: Connection, report: TenancyCheckReport, opts: TenancyCheckOptions): Promise<void> {
  const { decrypt } = await import("@/lib/security/crypto");
  const { handleFromName } = await import("@/lib/tenancy/handles");
  // tenancy: platform upgrade dry run: the legacy row count over every tenant table, before 0004 (read-only)
  const legacy = await count(
    conn,
    `SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM pages) + (SELECT COUNT(*) FROM page_versions) + (SELECT COUNT(*) FROM assets)
          + (SELECT COUNT(*) FROM media_files) + (SELECT COUNT(*) FROM orders) + (SELECT COUNT(*) FROM leads) + (SELECT COUNT(*) FROM blocklist)
          + (SELECT COUNT(*) FROM exports) + (SELECT COUNT(*) FROM stats_daily) + (SELECT COUNT(*) FROM audit_log WHERE action NOT LIKE 'auth.%' AND user_id IS NOT NULL) AS n`,
  );
  if (!legacy) {
    report.info.push("empty install: 0004 makes no store #1; the conversion writes the empty-install marker");
    // the pre-tenancy build's first boot writes an empty pixel_library row even here (R1.0 finale F4); the conversion
    // removes exactly that row, and the tenancy gate would report any other store-level key left without a store
    // tenancy: platform upgrade dry run: legacy store-level keys on an install without store #1 (read-only)
    const left = await rows(conn, "SELECT `key`, value, encrypted FROM settings WHERE `key` IN (?) ORDER BY `key`", [MOVED_KEYS]);
    for (const r of left) {
      if (String(r.key) === "pixel_library" && !Number(r.encrypted) && emptyLibrary(r.value)) report.info.push("the pre-tenancy boot's empty pixel_library row: the conversion removes it");
      else report.problems.push(`the legacy "${String(r.key)}" setting exists on an install with no store #1: nothing would own it`);
    }
    return;
  }
  const owners = await count(conn, "SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND disabled = 0");
  if (!owners) report.problems.push("no active owner user: store #1 would have no active owner and no super_admin");
  report.info.push(`store #1 will hold ${legacy} legacy row(s); ${owners} owner(s) become its owners and super_admin`);

  const settingRows = await rows(conn, "SELECT `key`, value, encrypted FROM settings ORDER BY `key`");
  const json = (key: string): { value: unknown } | null => {
    const row = settingRows.find((r) => r.key === key && !Number(r.encrypted));
    if (!row) return null;
    try {
      return { value: JSON.parse(String(row.value)) };
    } catch {
      report.problems.push(`the legacy "${key}" setting is not valid JSON`);
      return null;
    }
  };
  const store = json("store")?.value as { storeName?: unknown } | null | undefined;
  const name = typeof store?.storeName === "string" ? store.storeName : "";
  report.info.push(`store #1 handle: "${(name && handleFromName(name)) || "store-1"}" (from the store name; the conversion re-checks the live lists)`);
  const unknown = settingRows.map((r) => String(r.key)).filter((k) => !LEGACY_KEYS.has(k));
  if (unknown.length) report.info.push(`settings keys the conversion leaves in place: ${unknown.join(", ")}`);

  const sealed = settingRows.filter((r) => Number(r.encrypted));
  const push = (line: string) => (opts.requireEnvelopes ? report.problems : report.info).push(`${line} (the conversion stops on such a row)`);
  envelopeLine("legacy envelope(s)", sealed, (r) => (e) => decrypt(e, `settings:${String(r.key)}`), push, (line) => report.info.push(line));

  const home = json("home")?.value as { pageId?: unknown } | null | undefined;
  // tenancy: platform upgrade dry run: does the legacy home page exist (pre-tenancy dump, one store, read-only)
  if (typeof home?.pageId === "string" && !(await count(conn, "SELECT COUNT(*) AS n FROM pages WHERE id = ?", [home.pageId]))) {
    report.info.push("the legacy home setting names a page that no longer exists (store #1 gets no home page from it)");
  }
}

async function tenancyChecks(conn: Connection, have: Set<string>, report: TenancyCheckReport, opts: TenancyCheckOptions): Promise<void> {
  const { open } = await import("@/lib/security/crypto");
  const { isHandle } = await import("@/lib/tenancy/handles");

  // NULL store_id where it is required (an interrupted 0004, or a writer that bypassed the seam)
  for (const { table, storeId } of schemaStoreColumns()) {
    if (storeId !== "required" || !have.has(table)) continue;
    // tenancy: platform upgrade dry run: rows without a store, per tenant table read from schema.ts (read-only)
    const n = await count(conn, `SELECT COUNT(*) AS n FROM \`${table}\` WHERE store_id IS NULL`);
    if (n) report.problems.push(`${table}: ${n} row(s) with a NULL store_id`);
  }

  const noOwner = await rows(
    conn,
    `SELECT s.id FROM stores s WHERE s.status NOT IN ('purged', 'rejected')
       AND NOT EXISTS (SELECT 1 FROM store_members m WHERE m.store_id = s.id AND m.role = 'owner' AND m.status = 'active')`,
  );
  if (noOwner.length) report.problems.push(`${noOwner.length} store(s) without an active owner: ${noOwner.slice(0, 10).map((r) => String(r.id)).join(", ")}`);

  // tenancy: platform upgrade dry run: references that cross stores, each join over every store (read-only, 13 queries)
  const crossStore: [string, string][] = [
    ["order → page", "SELECT COUNT(*) AS n FROM orders o JOIN pages p ON p.id = o.page_id WHERE p.store_id <> o.store_id"],
    ["order → version", "SELECT COUNT(*) AS n FROM orders o JOIN page_versions v ON v.id = o.version_id WHERE v.store_id <> o.store_id"],
    ["order → export", "SELECT COUNT(*) AS n FROM orders o JOIN exports e ON e.id = o.export_id WHERE e.store_id <> o.store_id"],
    ["lead → page", "SELECT COUNT(*) AS n FROM leads l JOIN pages p ON p.id = l.page_id WHERE p.store_id <> l.store_id"],
    ["stats → page", "SELECT COUNT(*) AS n FROM stats_daily d JOIN pages p ON p.id = d.page_id WHERE p.store_id <> d.store_id"],
    ["export → page", "SELECT COUNT(*) AS n FROM exports e JOIN pages p ON p.id = e.page_id WHERE p.store_id <> e.store_id"],
    ["export → version", "SELECT COUNT(*) AS n FROM exports e JOIN page_versions v ON v.id = e.version_id WHERE v.store_id <> e.store_id"],
    ["version → page", "SELECT COUNT(*) AS n FROM page_versions v JOIN pages p ON p.id = v.page_id WHERE p.store_id <> v.store_id"],
    ["page → live version", "SELECT COUNT(*) AS n FROM pages p JOIN page_versions v ON v.id = p.published_version_id WHERE v.store_id <> p.store_id"],
    ["store → home page", "SELECT COUNT(*) AS n FROM stores s JOIN pages p ON p.id = s.home_page_id WHERE p.store_id <> s.id"],
    ["asset_refs → asset", "SELECT COUNT(*) AS n FROM asset_refs r JOIN assets a ON a.id = r.asset_id WHERE a.store_id <> r.store_id"],
    ["media_files → asset", "SELECT COUNT(*) AS n FROM media_files f JOIN assets a ON a.id = f.asset_id WHERE a.store_id <> f.store_id"],
    ["store_members → user", "SELECT COUNT(*) AS n FROM store_members m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL"],
  ];
  for (const [label, q] of crossStore) {
    const n = await count(conn, q);
    if (n) report.problems.push(`cross-store reference ${label}: ${n} row(s)`);
  }
  // tenancy: platform upgrade dry run: asset_refs naming a deleted asset, over every store (read-only)
  const missingAsset = await count(conn, "SELECT COUNT(*) AS n FROM asset_refs r LEFT JOIN assets a ON a.id = r.asset_id WHERE a.id IS NULL");
  if (missingAsset) report.info.push(`asset_refs naming a deleted asset: ${missingAsset}`);

  const [markerRow] = await rows(conn, "SELECT value FROM settings WHERE `key` = 'tenancy_v1'");
  let marker: { store1?: unknown } | null = null;
  try {
    marker = markerRow ? JSON.parse(String(markerRow.value)) : null;
  } catch {
    marker = null;
  }
  const store1 = await count(conn, "SELECT COUNT(*) AS n FROM stores WHERE id = ?", [LEGACY_STORE]);
  if (!marker) report.problems.push("the tenancy_v1 marker is missing: the store #1 conversion has not finished (it runs at boot)");
  else if (store1 && marker.store1 !== true) report.problems.push("store #1 exists but the tenancy_v1 marker says the install was empty");
  else report.info.push(`tenancy_v1 marker present (${store1 ? "store #1 converted" : "empty install"})`);
  // before the marker these are the conversion's backlog (info); after it, leftovers (problems)
  const backlog = marker ? report.problems : report.info;
  // tenancy: platform upgrade dry run: v1 envelopes left in any store's settings (a count, read-only)
  const legacyEnc = await count(conn, "SELECT COUNT(*) AS n FROM store_settings WHERE purpose_v = 0 AND encrypted = 1");
  if (legacyEnc) backlog.push(`${legacyEnc} store_settings row(s) still in a v1 envelope (purpose_v = 0)`);
  // tenancy: platform upgrade dry run: plain settings rows still marked v1, any store (a count, read-only)
  const legacyPlain = await count(conn, "SELECT COUNT(*) AS n FROM store_settings WHERE purpose_v = 0 AND encrypted = 0");
  if (legacyPlain) report.info.push(`${legacyPlain} plain store_settings row(s) still marked purpose_v = 0`);
  const leftovers = await count(conn, "SELECT COUNT(*) AS n FROM settings WHERE `key` IN (?)", [MOVED_KEYS]);
  if (leftovers) backlog.push(`${leftovers} legacy store-level row(s) still in settings`);

  // tenancy: platform upgrade dry run: opens every store's sealed settings with that row's own store id (console-only, read-only)
  const sealed = await rows(conn, "SELECT store_id, `key`, value FROM store_settings WHERE encrypted = 1 AND purpose_v = 2");
  const push = (line: string) => (opts.requireEnvelopes ? report.problems : report.info).push(line);
  envelopeLine("sealed store setting(s)", sealed, (r) => (e) => open(e, { store: String(r.store_id) }, `settings:${String(r.key)}`), push, (line) => report.info.push(line));

  const dup = await rows(conn, "SELECT handle FROM stores WHERE handle IS NOT NULL GROUP BY handle HAVING COUNT(*) > 1");
  if (dup.length) report.problems.push(`${dup.length} duplicate handle(s)`);
  const handles = await rows(conn, "SELECT id, handle, status FROM stores");
  const bad = handles.filter((h) => (h.handle === null ? h.status !== "purged" : !isHandle(String(h.handle))));
  if (bad.length) report.problems.push(`${bad.length} store(s) with a missing or malformed handle: ${bad.slice(0, 10).map((r) => String(r.id)).join(", ")}`);
  report.info.push(`${handles.length} store(s)`);
}

/** Run the tenancy dry run over a database (read-only transactions first, like runUpgradeCheck). */
export async function runTenancyCheck(conn: Connection, opts: TenancyCheckOptions = {}): Promise<TenancyCheckReport> {
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  const have = await tableNames(conn);
  const report: TenancyCheckReport = { mode: have.has("stores") ? "tenancy" : "pre-tenancy", problems: [], info: [] };
  report.problems.push(...tenantSetProblems());
  if (report.mode === "pre-tenancy") await preTenancyChecks(conn, report, opts);
  else await tenancyChecks(conn, have, report, opts);
  return report;
}

/** True when the tenancy gate passes. */
export const tenancyCheckOk = (r: TenancyCheckReport): boolean => r.problems.length === 0;

/** Human summary lines (ids and counts only, never values). */
export function tenancyCheckSummary(r: TenancyCheckReport): string[] {
  return [`mode ${r.mode}: ${r.problems.length} problem(s)`, ...r.problems.map((p) => `  ✗ ${p}`), ...r.info.map((i) => `  · ${i}`)];
}
