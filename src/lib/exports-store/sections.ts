import "server-only";
/**
 * The store export's files, one writer per file (docs/STORE-SAAS.md §F.9 "Export ZIP", PL-09; R1 P8 step 8).
 *
 * The job (./job.ts) runs the sections in order, one slice at a time, and saves its cursor after each slice. A slice
 * reads at most `rowsPerSlice` rows (pages and media: a few files) after the section's keyset position, so a large
 * store spreads over many ticks and a dead tick costs one slice:
 *   - table sections (CSV / JSON) append to a stage file `stage/<id>.tmp`, whose saved length is truncated back on
 *     resume; the last slice deflates the stage into the archive as one entry;
 *   - file sections (pages, drafts, media) add their entries straight to the archive;
 *   - single sections (settings.json, health.json, README.txt) build one buffer.
 *
 * Every read is scoped: `whereStore` / `byId` with the job's StoreScope, never an id from elsewhere. Columns come from
 * the Drizzle tables through ./columns.ts (deny list, secret-looking names, columns the database lacks).
 */
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { asc, desc, eq, gt, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { RowDataPacket } from "mysql2/promise";
import { AUDIT_SECRET_KEY_RE, tenantAuditEntry, type AuditEntry } from "@/lib/audit";
import { db, pool } from "@/lib/db/client";
import { agentStatsDaily, aiMemory, assets, auditLog, campaigns, customers, deliveryZones, leads, mediaFiles, messageTemplates, orderEvents, orders, pages, pageVersions, shortLinks, storeMembers, users } from "@/lib/db/schema";
import { storageFor, StoredFileError, type StoredFile } from "@/lib/media/storage";
import { getStoreHealth } from "@/lib/platform/health-snapshot";
import { getStoreSettings } from "@/lib/settings";
import { releaseOn } from "@/lib/auth/permissions";
import { redactStoreSetting, STORE_SETTING_KEYS, STORE_SETTING_RELEASE, STORE_SETTINGS, type StoreSettingKey } from "@/lib/settings/store-registry";
import { byId, inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { EXPORT_TABLES, mediaExt, pickColumns, slugName, stripRunIds, stripSecretKeys, type ExportTable, type PickedColumns } from "./columns";
import { CSV_BOM, csvHeader, csvLine, csvValue } from "./csv";
import { buildReadme } from "./readme";
import type { ZipParts } from "./zip";

export interface SliceCtx {
  scope: StoreScope;
  store: StoreRow;
  /** the job's folder: DATA_DIR/exports/<storeId>/<jobId>/ */
  dir: string;
  zip: ZipParts;
  /** keyset position inside the section (null: its start) */
  after: unknown;
  /** bytes of the section's stage file written so far */
  stage: number;
  /** rows in the stage so far */
  rows: number;
  /** README notes (shared, deduplicated, bounded) */
  notes: string[];
  /** top-level names written so far (README) */
  written: string[];
  rowsPerSlice: number;
  deadline: number;
  yield(): Promise<void>;
  /** when the export was requested (entry times, README) */
  createdAt: Date;
}

export interface SliceResult {
  done: boolean;
  after: unknown;
  stage: number;
  rows: number;
  /** archive entries this slice added */
  entries: number;
}

export interface Section {
  id: string;
  slice(c: SliceCtx): Promise<SliceResult>;
}

type Row = Record<string, unknown>;
type Fields = Record<string, AnyMySqlColumn>;

const MAX_NOTES = 60;
/** pages and media read per slice */
const PAGES_PER_SLICE = 10;
const MEDIA_PER_SLICE = 10;

function note(c: SliceCtx, text: string): void {
  if (c.notes.includes(text)) return;
  if (c.notes.length < MAX_NOTES) c.notes.push(text);
  else if (c.notes.length === MAX_NOTES) c.notes.push("…");
}

function wrote(c: SliceCtx, name: string): void {
  if (!c.written.includes(name)) c.written.push(name);
}

const doneAt = (entries: number): SliceResult => ({ done: true, after: null, stage: 0, rows: 0, entries });

/** The columns of `table` in this database, or null when the table does not exist (a migration still to run). */
async function presentColumns(table: string): Promise<Set<string> | null> {
  const [rows] = await pool().query<RowDataPacket[]>("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?", [table]);
  return rows.length ? new Set(rows.map((r) => String(r.c))) : null;
}

export const stagePath = (dir: string, id: string): string => join(dir, "stage", `${id}.tmp`);

/**
 * Appends `text` to the stage file at `stage` bytes (0: a new file), first cutting off whatever a dead tick wrote
 * after the saved length. Answers the new length.
 */
async function appendStage(path: string, stage: number, text: string): Promise<number> {
  const data = Buffer.from(text, "utf8");
  if (stage === 0) await mkdir(/* turbopackIgnore: true */ join(path, ".."), { recursive: true, mode: 0o700 });
  const fh = await open(/* turbopackIgnore: true */ path, stage === 0 ? "w" : "r+", 0o600);
  try {
    if (stage > 0) {
      const size = (await fh.stat()).size;
      if (size < stage) throw new Error("export: the stage file is shorter than the cursor");
      if (size > stage) await fh.truncate(stage);
    }
    for (let off = 0; off < data.length; ) {
      const { bytesWritten } = await fh.write(data, off, data.length - off, stage + off);
      off += bytesWritten;
    }
  } finally {
    await fh.close().catch(() => undefined);
  }
  return stage + data.length;
}

function jsonValue(v: unknown): unknown {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v === "bigint") return v.toString();
  return v ?? null;
}

/* ------------------------------------------------------------------ */
/* Table sections                                                      */
/* ------------------------------------------------------------------ */

interface TableSpec {
  id: string;
  file: string;
  format: "csv" | "json";
  table: ExportTable | "store_members";
  /** a fixed column set (members.csv joins users), instead of the table's generic columns */
  fixed?: PickedColumns;
  /** one page of rows after `after`, in keyset order, every one of the scope's store */
  read(scope: StoreScope, after: unknown, limit: number, fields: Fields): Promise<Row[]>;
  /** the keyset value of a row (the last one read becomes `after`) */
  key(row: Row): unknown;
  /** the row as written (the tenant view of audit rows, evidence without run ids) */
  transform?(row: Row): Row;
}

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

function tableSection(spec: TableSpec): Section {
  return {
    id: spec.id,
    async slice(c) {
      let pick = spec.fixed;
      if (!pick) {
        const present = await presentColumns(spec.table);
        if (!present) {
          note(c, `table ${spec.table}: not in this database, ${spec.file} skipped`);
          return doneAt(0);
        }
        pick = pickColumns(spec.table, EXPORT_TABLES[spec.table as ExportTable], present);
        if (c.stage === 0 && pick.missing.length) note(c, `${spec.table}: columns not in this database: ${pick.missing.join(", ")}`);
      }
      const rows = await spec.read(c.scope, c.after, c.rowsPerSlice, pick.fields);
      const csv = spec.format === "csv";
      let text = c.stage === 0 ? (csv ? CSV_BOM + csvHeader(pick.names) : "[\n") : "";
      let n = c.rows;
      for (const raw of rows) {
        const row = spec.transform ? spec.transform(raw) : raw;
        if (csv) text += csvLine(pick.names.map((name) => csvValue(row[name], pick.fields[name] as unknown as { columnType?: string; scale?: number })));
        else text += `${n > 0 ? ",\n" : ""}${JSON.stringify(Object.fromEntries(pick.names.map((name) => [name, jsonValue(row[name])])))}`;
        n++;
      }
      const after = rows.length ? spec.key(rows[rows.length - 1]!) : c.after;
      const done = rows.length < c.rowsPerSlice;
      if (done && !csv) text += "\n]\n";
      const path = stagePath(c.dir, spec.id);
      const stage = text ? await appendStage(path, c.stage, text) : c.stage;
      if (!done) return { done: false, after, stage, rows: n, entries: 0 };
      await c.zip.add(spec.file, { path }, "deflate", { size: stage, mtime: c.createdAt, yieldFn: c.yield });
      wrote(c, spec.file);
      return doneAt(1);
    },
  };
}

/** audit.csv: the store's own listing rule (`tenantAuditEntry`, §F.5): staff rows without ids, IP hash or hidden notes. */
function tenantAuditRow(row: Row): Row {
  const entry: AuditEntry = {
    id: Number(row.id),
    userId: (row.user_id as string | null | undefined) ?? null,
    action: String(row.action ?? ""),
    target: (row.target as string | null | undefined) ?? null,
    meta: (row.meta as Record<string, unknown> | null | undefined) ?? null,
    ipHash: (row.ip as string | null | undefined) ?? null,
    createdAt: row.created_at as Date,
    storeId: (row.store_id as string | null | undefined) ?? null,
    actorKind: row.actor_kind as AuditEntry["actorKind"],
    impersonatorId: (row.impersonator_id as string | null | undefined) ?? null,
    actorName: null,
    impersonatorName: null,
  };
  const t = tenantAuditEntry(entry);
  const out: Row = { ...row };
  if ("user_id" in row) out.user_id = t.userId;
  if ("ip" in row) out.ip = t.ipHash;
  if ("impersonator_id" in row) out.impersonator_id = t.impersonatorId;
  if ("meta" in row) out.meta = t.meta;
  return out;
}

const NEVER = /$^/;

const TABLE_SECTIONS: Section[] = [
  tableSection({
    id: "orders",
    file: "orders.csv",
    format: "csv",
    table: "orders",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(orders).where(whereStore(orders, scope, str(after) ? gt(orders.id, after) : undefined)).orderBy(asc(orders.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "leads",
    file: "leads.csv",
    format: "csv",
    table: "leads",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(leads).where(whereStore(leads, scope, str(after) ? gt(leads.id, after) : undefined)).orderBy(asc(leads.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "customers",
    file: "customers.csv",
    format: "csv",
    table: "customers",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(customers).where(whereStore(customers, scope, str(after) ? gt(customers.id, after) : undefined)).orderBy(asc(customers.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "order_events",
    file: "order_events.csv",
    format: "csv",
    table: "order_events",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(orderEvents).where(whereStore(orderEvents, scope, num(after) ? gt(orderEvents.id, after) : undefined)).orderBy(asc(orderEvents.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "members",
    file: "members.csv",
    format: "csv",
    table: "store_members",
    // §F.9: name, e-mail, role, status (never a password hash, a TOTP secret or a session)
    fixed: { fields: { name: users.name, email: users.email, role: storeMembers.role, status: storeMembers.status }, names: ["name", "email", "role", "status"], missing: [] },
    read: (scope, after, limit) =>
      db
        .select({ user_id: storeMembers.userId, name: users.name, email: users.email, role: storeMembers.role, status: storeMembers.status })
        .from(storeMembers)
        .innerJoin(users, eq(users.id, storeMembers.userId))
        .where(whereStore(storeMembers, scope, str(after) ? gt(storeMembers.userId, after) : undefined))
        .orderBy(asc(storeMembers.userId))
        .limit(limit) as Promise<Row[]>,
    key: (r) => r.user_id,
  }),
  tableSection({
    id: "audit",
    file: "audit.csv",
    format: "csv",
    table: "audit_log",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(auditLog).where(whereStore(auditLog, scope, num(after) ? gt(auditLog.id, after) : undefined)).orderBy(asc(auditLog.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
    transform: tenantAuditRow,
  }),
  tableSection({
    id: "agent_stats_daily",
    file: "agent_stats_daily.csv",
    format: "csv",
    table: "agent_stats_daily",
    read: (scope, after, limit, fields) =>
      db
        .select(fields)
        .from(agentStatsDaily)
        .where(
          whereStore(
            agentStatsDaily,
            scope,
            Array.isArray(after) && str(after[0]) && str(after[1]) ? sql`(${agentStatsDaily.day}, ${agentStatsDaily.userId}) > (${after[0]}, ${after[1]})` : undefined,
          ),
        )
        .orderBy(asc(agentStatsDaily.day), asc(agentStatsDaily.userId))
        .limit(limit) as Promise<Row[]>,
    key: (r) => [r.day, r.user_id],
  }),
  tableSection({
    id: "message_templates",
    file: "message_templates.csv",
    format: "csv",
    table: "message_templates",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(messageTemplates).where(whereStore(messageTemplates, scope, str(after) ? gt(messageTemplates.id, after) : undefined)).orderBy(asc(messageTemplates.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "short_links",
    file: "short_links.csv",
    format: "csv",
    table: "short_links",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(shortLinks).where(whereStore(shortLinks, scope, str(after) ? gt(shortLinks.id, after) : undefined)).orderBy(asc(shortLinks.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "campaigns",
    file: "campaigns.json",
    format: "json",
    table: "campaigns",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(campaigns).where(whereStore(campaigns, scope, str(after) ? gt(campaigns.id, after) : undefined)).orderBy(asc(campaigns.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
    // kits without share tokens: the hash column is denied, and no key naming a token survives inside the JSON
    transform: (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, stripSecretKeys(v, NEVER)])),
  }),
  tableSection({
    id: "delivery_zones",
    file: "delivery_zones.json",
    format: "json",
    table: "delivery_zones",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(deliveryZones).where(whereStore(deliveryZones, scope, str(after) ? gt(deliveryZones.id, after) : undefined)).orderBy(asc(deliveryZones.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
  }),
  tableSection({
    id: "ai_memory",
    file: "ai_memory.json",
    format: "json",
    table: "ai_memory",
    read: (scope, after, limit, fields) =>
      db.select(fields).from(aiMemory).where(whereStore(aiMemory, scope, str(after) ? gt(aiMemory.id, after) : undefined)).orderBy(asc(aiMemory.id)).limit(limit) as Promise<Row[]>,
    key: (r) => r.id,
    // active and inactive, explicit and learned items; no evidence run ids (AI R17)
    transform: (r) => ("evidence" in r ? { ...r, evidence: stripRunIds(r.evidence) } : r),
  }),
];

/* ------------------------------------------------------------------ */
/* Single files                                                        */
/* ------------------------------------------------------------------ */

const json = (v: unknown) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`, "utf8");

const settingsSection: Section = {
  id: "settings",
  async slice(c) {
    // every secret key omitted whole (tracking_secrets, turnstile, telegram, export_key, …); the others redacted like
    // the browser gets them, then any key naming a secret dropped at any depth
    // a key of a later release (R2's `storefront`) is listed only once its release is on (C2-E)
    const keys = STORE_SETTING_KEYS.filter((k) => !STORE_SETTINGS[k].secret && releaseOn(STORE_SETTING_RELEASE[k] ?? "R1"));
    const values = await getStoreSettings(c.scope, keys);
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = stripSecretKeys(redactStoreSetting(k as StoreSettingKey, values[k] as never), AUDIT_SECRET_KEY_RE);
    await c.zip.add("settings.json", json(out), "deflate", { mtime: c.createdAt });
    wrote(c, "settings.json");
    return doneAt(1);
  },
};

const healthSection: Section = {
  id: "health",
  async slice(c) {
    const view = await getStoreHealth(c.scope);
    if (!view) return doneAt(0); // not computed yet: omitted (§F.9)
    // the console flags never reach a tenant, whatever the view carries
    const { flags: _flags, ...rest } = view as unknown as Record<string, unknown>;
    void _flags;
    await c.zip.add("health.json", json(rest), "deflate", { mtime: c.createdAt });
    wrote(c, "health.json");
    return doneAt(1);
  },
};

/* ------------------------------------------------------------------ */
/* Pages, drafts and media                                             */
/* ------------------------------------------------------------------ */

const pagesSection: Section = {
  id: "pages",
  async slice(c) {
    const rows = await db
      .select({ id: pages.id, slug: pages.slug, status: pages.status, draft: pages.draft, versionId: pages.publishedVersionId, updatedAt: pages.updatedAt })
      .from(pages)
      .where(whereStore(pages, c.scope, str(c.after) ? gt(pages.id, c.after) : undefined))
      .orderBy(asc(pages.id))
      .limit(PAGES_PER_SLICE);
    let entries = 0;
    for (const p of rows) {
      const name = slugName(p.slug, p.id);
      await c.zip.add(`drafts/${name}.json`, json(p.draft), "deflate", { mtime: p.updatedAt });
      wrote(c, "drafts/");
      entries++;
      if (p.status !== "published" || !p.versionId) continue;
      const [v] = await db
        .select({ doc: pageVersions.doc, html: pageVersions.html, thankYouHtml: pageVersions.thankYouHtml, createdAt: pageVersions.createdAt })
        .from(pageVersions)
        .where(byId(pageVersions, c.scope, p.versionId))
        .limit(1);
      if (!v) {
        note(c, `page ${name}: its published version is missing`);
        continue;
      }
      await c.zip.add(`pages/${name}/doc.json`, json(v.doc), "deflate", { mtime: v.createdAt });
      entries++;
      if (v.html) {
        await c.zip.add(`pages/${name}/index.html`, Buffer.from(v.html, "utf8"), "deflate", { mtime: v.createdAt });
        entries++;
      }
      if (v.thankYouHtml) {
        await c.zip.add(`pages/${name}/merci.html`, Buffer.from(v.thankYouHtml, "utf8"), "deflate", { mtime: v.createdAt });
        entries++;
      }
      wrote(c, "pages/");
    }
    const after = rows.length ? rows[rows.length - 1]!.id : c.after;
    return rows.length < PAGES_PER_SLICE ? doneAt(entries) : { done: false, after, stage: 0, rows: 0, entries };
  },
};

/** A web stream as chunks; cancelled if the consumer stops early (the file handle closes). */
async function* webChunks(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        return;
      }
      if (value) yield value;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

const mediaSection: Section = {
  id: "media",
  async slice(c) {
    const list = await db
      .select({ id: assets.id, createdAt: assets.createdAt })
      .from(assets)
      .where(whereStore(assets, c.scope, str(c.after) ? gt(assets.id, c.after) : undefined))
      .orderBy(asc(assets.id))
      .limit(MEDIA_PER_SLICE);
    let entries = 0;
    let after = c.after;
    for (const a of list) {
      // the largest stored variant of the asset (the master when it is kept), read from wherever its row says
      const [f] = await db
        .select({ key: mediaFiles.key, assetId: mediaFiles.assetId, mime: mediaFiles.mime, bytes: mediaFiles.bytes, sha256: mediaFiles.sha256, storage: mediaFiles.storage })
        .from(mediaFiles)
        .where(whereStore(mediaFiles, c.scope, eq(mediaFiles.assetId, a.id)))
        .orderBy(desc(mediaFiles.bytes), asc(mediaFiles.key))
        .limit(1);
      after = a.id;
      if (!f || f.bytes <= 0) {
        note(c, `media ${a.id}: no stored file`);
        continue;
      }
      const meta: StoredFile = { ...f, storeId: c.scope.storeId };
      let stream: ReadableStream<Uint8Array>;
      try {
        stream = await storageFor(meta).readRange(meta, 0, f.bytes - 1);
      } catch (err) {
        if (!(err instanceof StoredFileError)) throw err;
        note(c, `media ${a.id}: the stored file is ${err.code}`);
        continue;
      }
      await c.zip.add(`media/${a.id}.${mediaExt(f.mime)}`, { stream: () => webChunks(stream) }, "store", { size: f.bytes, mtime: a.createdAt, yieldFn: c.yield });
      wrote(c, "media/");
      entries++;
      if (Date.now() >= c.deadline) return { done: false, after, stage: 0, rows: 0, entries };
    }
    return list.length < MEDIA_PER_SLICE ? doneAt(entries) : { done: false, after, stage: 0, rows: 0, entries };
  },
};

const readmeSection: Section = {
  id: "readme",
  async slice(c) {
    const build = (parts: number) =>
      Buffer.from(buildReadme({ storeName: c.store.name, handle: c.store.handle, createdAt: c.createdAt.toISOString(), parts, files: [...c.written], notes: c.notes }), "utf8");
    // the count includes the part README.txt itself lands in (a full part rolls over first)
    let text = build(c.zip.part);
    const parts = c.zip.partsWith("README.txt", text.length + 16, "deflate");
    if (parts !== c.zip.part) text = build(parts);
    await c.zip.add("README.txt", text, "deflate", { mtime: c.createdAt, size: text.length + 16 });
    return doneAt(1);
  },
};

/** The sections in archive order; README.txt last (it lists what the others wrote). */
export const SECTIONS: readonly Section[] = Object.freeze([...TABLE_SECTIONS, settingsSection, healthSection, pagesSection, mediaSection, readmeSection]);

/* ------------------------------------------------------------------ */
/* The estimate                                                        */
/* ------------------------------------------------------------------ */

/** A row's typical bytes in the archive's staging (before compression), per table. */
const ROW_BYTES: Readonly<Record<string, number>> = Object.freeze({ orders: 1_500, leads: 600, customers: 300, order_events: 400, audit_log: 500 });

/**
 * The export's bytes before compression, roughly: the largest stored file of each asset, the published versions and
 * drafts, and the big tables' row counts times a typical row. Read before the job starts (§F.9 'no_space').
 */
export async function estimateExportBytes(scope: StoreScope): Promise<number> {
  const largest = await db.select({ b: sql<number>`MAX(${mediaFiles.bytes})` }).from(mediaFiles).where(whereStore(mediaFiles, scope)).groupBy(mediaFiles.assetId);
  let total = largest.reduce((n, r) => n + Number(r.b ?? 0), 0);
  const [docs] = await db
    .select({ b: sql<number>`COALESCE(SUM(LENGTH(${pageVersions.doc}) + COALESCE(LENGTH(${pageVersions.html}), 0) + COALESCE(LENGTH(${pageVersions.thankYouHtml}), 0)), 0)` })
    .from(pageVersions)
    .innerJoin(pages, eq(pages.publishedVersionId, pageVersions.id))
    .where(whereStore(pageVersions, scope, inStore(pages, scope)));
  const [drafts] = await db.select({ b: sql<number>`COALESCE(SUM(LENGTH(${pages.draft})), 0)` }).from(pages).where(whereStore(pages, scope));
  total += Number(docs?.b ?? 0) + Number(drafts?.b ?? 0);
  const counts = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(orders).where(whereStore(orders, scope)),
    db.select({ n: sql<number>`COUNT(*)` }).from(leads).where(whereStore(leads, scope)),
    db.select({ n: sql<number>`COUNT(*)` }).from(customers).where(whereStore(customers, scope)),
    db.select({ n: sql<number>`COUNT(*)` }).from(orderEvents).where(whereStore(orderEvents, scope)),
    db.select({ n: sql<number>`COUNT(*)` }).from(auditLog).where(whereStore(auditLog, scope)),
  ]);
  const per = [ROW_BYTES.orders!, ROW_BYTES.leads!, ROW_BYTES.customers!, ROW_BYTES.order_events!, ROW_BYTES.audit_log!];
  counts.forEach(([r], i) => (total += Number(r?.n ?? 0) * per[i]!));
  return total;
}
