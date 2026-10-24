/**
 * Database schema (MariaDB 10.4+ / MySQL 8 compatible).
 * - JSON is stored as LONGTEXT via `jsonText` (MariaDB JSON = LONGTEXT alias; parsed on read).
 * - Binary media is chunked (≤ 512 KB per row) because shared hosts often cap max_allowed_packet.
 * - Multi-tenant from 0004 (docs/STORE-SAAS.md §D): every tenant table carries `store_id` (NOT NULL, FK RESTRICT
 *   `fk_<table>_store`) and every one of its indexes starts with it. Owned by the core maintainer (§K.3); the part
 *   specs refine only the tables §D.9 gives them, through the maintainer.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  customType,
  date,
  datetime,
  decimal,
  foreignKey,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  tinyint,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { STORE_ROLES, type PlatformRole, type StoreRole } from "@/lib/auth/permissions";
import type { AssetFocus } from "@/lib/media/focus";
import type { PageDoc } from "@/lib/page/schema";
import type { EntitlementKey } from "@/lib/tenancy/entitlement-keys";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";

/* ------------------------------------------------------------------ */
/* custom column types                                                 */
/* ------------------------------------------------------------------ */

export const jsonText = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType() {
      return "longtext";
    },
    toDriver(value: T): string {
      return JSON.stringify(value);
    },
    fromDriver(value: string | unknown): T {
      if (typeof value === "string") return JSON.parse(value) as T;
      if (Buffer.isBuffer(value)) return JSON.parse(value.toString("utf8")) as T;
      return value as T;
    },
  })(name);

export const mediumBlob = (name: string) =>
  customType<{ data: Buffer; driverData: Buffer }>({
    dataType() {
      return "mediumblob";
    },
  })(name);

const now3 = sql`CURRENT_TIMESTAMP(3)`;
const createdAt = () => datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(now3);
const money = (name: string) => decimal(name, { precision: 12, scale: 2, mode: "number" });

/* ------------------------------------------------------------------ */
/* tenancy conventions (§D.1)                                          */
/* ------------------------------------------------------------------ */

/** ULID (src/lib/db/ids.ts newId) */
const id26 = (name = "id") => varchar(name, { length: 26 });
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const updatedAt = () => ts("updated_at").notNull().default(now3);

/** Tenant tables: NOT NULL, no default; the FK is `storeFk` in the table's extras (named `fk_<table>_store`, §D.1). */
const storeRef = () => varchar("store_id", { length: 26 }).notNull();
/** Platform tables with an optional store dimension (NULL = platform-level row). */
const storeRefOpt = () => varchar("store_id", { length: 26 });

function missingStoreId(): string {
  throw new Error("store_id is required: tenant rows are written through a StoreScope (docs/STORE-SAAS.md §E.3)");
}

/**
 * `store_id` of the nine tables that exist since 0000 (pages, page_versions, assets, media_files, orders, leads,
 * blocklist, exports, stats_daily). R1.0 transitional: the insert type keeps today's single-tenant writers
 * compiling until T3/T4 move them to a StoreScope, and an insert that still omits it throws before reaching the
 * database (never a guessed store). The maintainer drops the `$defaultFn` at the R1.0 integration, after which
 * the compiler requires `storeId` on every insert like on the 0004 tables.
 */
const legacyStoreRef = () => storeRef().$defaultFn(missingStoreId);

/** FK RESTRICT from `<table>.store_id` to `stores.id`; InnoDB serves it with the table's first `store_id` index. */
const storeFk = <T extends string>(table: T, column: AnyMySqlColumn<{ tableName: T }>) =>
  foreignKey({ name: `fk_${table}_store`, columns: [column], foreignColumns: [stores.id] }).onDelete("restrict").onUpdate("restrict");

/* ------------------------------------------------------------------ */
/* auth                                                                */
/* ------------------------------------------------------------------ */

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    email: varchar("email", { length: 191 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    /** legacy single-tenant role: read only by the store #1 conversion (§D.8), dropped in 0006; store roles live in store_members */
    role: mysqlEnum("role", ["owner", "editor", "agent"]).notNull().default("editor"),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    /** sha256 hashes of unused one-time recovery codes */
    recoveryCodes: jsonText<string[]>("recovery_codes"),
    /** unused from 0004 (rate buckets, §B.3); dropped in 0006 */
    failedLogins: int("failed_logins").notNull().default(0),
    /** unused from 0004; dropped in 0006 */
    lockedUntil: datetime("locked_until", { mode: "date", fsp: 3 }),
    /** platform ban only (AUTH-12); a store suspends a member through store_members.status */
    disabled: boolean("disabled").notNull().default(false),
    createdAt: createdAt(),
    lastLoginAt: datetime("last_login_at", { mode: "date", fsp: 3 }),
    /** staff role of the console (§A.3.3); "none" for every seller */
    platformRole: mysqlEnum("platform_role", ["none", "super_admin", "admin", "support", "analyst"]).notNull().default("none"),
    /** admin UI locale (ADM-40); NULL = the browser's */
    locale: varchar("locale", { length: 5 }),
    /** signup phone, E.164 */
    phone: varchar("phone", { length: 24 }),
    disabledReason: varchar("disabled_reason", { length: 200 }),
    disabledAt: ts("disabled_at"),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_prole_idx").on(t.platformRole)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    /** sha256(token) hex — the raw token only lives in the cookie */
    id: char("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 26 }).notNull(),
    /** false until TOTP verified (when 2FA enabled) */
    mfaPassed: boolean("mfa_passed").notNull().default(false),
    createdAt: createdAt(),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    lastSeenAt: datetime("last_seen_at", { mode: "date", fsp: 3 }).notNull().default(now3),
    ip: varchar("ip", { length: 64 }),
    ua: varchar("ua", { length: 300 }),
    /** the store last opened (a hint for the store picker, D1; never an authorisation) */
    lastStoreId: id26("last_store_id"),
    /** set while this session views a store as staff (impersonation_sessions.id, §B.8) */
    impersonationId: id26("impersonation_id"),
    /** last step-up (TOTP or password) of this session; fresh for 5 minutes (§B.7) */
    stepUpAt: ts("step_up_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_exp_idx").on(t.expiresAt)],
);

/* ------------------------------------------------------------------ */
/* pages & versions                                                    */
/* ------------------------------------------------------------------ */

export const pages = mysqlTable(
  "pages",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    storeId: legacyStoreRef(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).notNull().default("draft"),
    locale: varchar("locale", { length: 5 }).notNull().default("ar"),
    /** public key used by the order API (pageKey); unique across stores */
    publicKey: varchar("public_key", { length: 40 }).notNull(),
    draft: jsonText<PageDoc>("draft").notNull(),
    publishedVersionId: varchar("published_version_id", { length: 26 }),
    createdBy: varchar("created_by", { length: 26 }),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(now3),
    /** only `landing` until R2 (storefront page kinds); `is_home` moved to stores.home_page_id (DB-02) */
    kind: mysqlEnum("kind", ["landing", "home", "product", "collection", "page", "policy", "search", "cart", "checkout", "not_found"])
      .notNull()
      .default("landing"),
    /** R2 (LP-07): the product a landing page sells, a products row of the same store */
    productId: id26("product_id"),
    /**
     * rev 5 (CRIT2-5): the first publish instant, set once by publishPage in the version-row transaction
     * (COALESCE; never reset by unpublish, republish, restore or a re-render); design's first-come key
     */
    firstPublishedAt: ts("first_published_at"),
  },
  (t) => [
    uniqueIndex("pages_store_slug_uq").on(t.storeId, t.slug),
    uniqueIndex("pages_key_uq").on(t.publicKey),
    index("pages_store_status_idx").on(t.storeId, t.status, t.updatedAt),
    storeFk("pages", t.storeId),
  ],
);

export const pageVersions = mysqlTable(
  "page_versions",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    /** denormalised from pages (DB-03) */
    storeId: legacyStoreRef(),
    pageId: varchar("page_id", { length: 26 }).notNull(),
    kind: mysqlEnum("kind", ["generation", "save", "publish", "restore", "import", "autosave"]).notNull(),
    label: varchar("label", { length: 160 }),
    doc: jsonText<PageDoc>("doc").notNull(),
    /** rendered landing HTML (publish versions) */
    html: longtext("html"),
    thankYouHtml: longtext("thank_you_html"),
    csp: text("csp"),
    thankYouCsp: text("thank_you_csp"),
    etag: varchar("etag", { length: 64 }),
    thumbnailAssetId: varchar("thumbnail_asset_id", { length: 64 }),
    starred: boolean("starred").notNull().default(false),
    checksum: char("checksum", { length: 64 }).notNull(),
    /** runtime contract embedded in the published HTML (1: v1 config + payloads; 2: Offers v2). Rows before 0003 = 1. */
    runtimeV: tinyint("runtime_v").notNull().default(1),
    createdBy: varchar("created_by", { length: 26 }),
    createdAt: createdAt(),
  },
  (t) => [index("pv_page_idx").on(t.pageId, t.createdAt), index("pv_store_idx").on(t.storeId, t.createdAt), storeFk("page_versions", t.storeId)],
);

/* ------------------------------------------------------------------ */
/* media                                                               */
/* ------------------------------------------------------------------ */

export interface AssetVariant {
  key: string; // storage key e.g. "a1b2…-960.webp"
  w: number;
  h: number;
  fmt: "webp" | "avif" | "png" | "jpeg";
  bytes: number;
}

export const assets = mysqlTable(
  "assets",
  {
    /** sha256 (hex, first 32) of the processed master; new ids are per store (D21: HMAC(master, "media-id:<storeId>")[:32]) */
    id: varchar("id", { length: 64 }).primaryKey(),
    storeId: legacyStoreRef(),
    kind: mysqlEnum("kind", ["image", "video"]).notNull().default("image"),
    mime: varchar("mime", { length: 40 }).notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    bytes: int("bytes").notNull(),
    alpha: boolean("alpha").notNull().default(false),
    dominant: char("dominant", { length: 7 }).notNull().default("#cccccc"),
    palette: jsonText<unknown>("palette"),
    variants: jsonText<AssetVariant[]>("variants").notNull(),
    originalName: varchar("original_name", { length: 200 }),
    /** produced by background removal from another asset */
    sourceAssetId: varchar("source_asset_id", { length: 64 }),
    tags: jsonText<string[]>("tags"),
    /** subject analysis (src/lib/media/focus.ts): focal point, subject box, heads/hands to keep in frame */
    focus: jsonText<AssetFocus>("focus"),
    /** FOCUS_VERSION the focus was computed with; null = not analysed (scripts/media-backfill.ts recomputes) */
    focusVersion: int("focus_version"),
    createdBy: varchar("created_by", { length: 26 }),
    createdAt: createdAt(),
    /** master + every variant (MED-03): the media_bytes gauge sums it */
    storedBytes: bigint("stored_bytes", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    index("assets_store_created_idx").on(t.storeId, t.createdAt, t.id),
    index("assets_store_kind_idx").on(t.storeId, t.kind, t.alpha),
    index("assets_store_source_idx").on(t.storeId, t.sourceAssetId),
    storeFk("assets", t.storeId),
  ],
);

export const mediaFiles = mysqlTable(
  "media_files",
  {
    /** global key (D28) */
    key: varchar("key", { length: 120 }).primaryKey(),
    storeId: legacyStoreRef(),
    assetId: varchar("asset_id", { length: 64 }).notNull(),
    mime: varchar("mime", { length: 40 }).notNull(),
    bytes: int("bytes").notNull(),
    chunks: int("chunks").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    createdAt: createdAt(),
    /** where the bytes live: media_chunks rows (db) or DATA_DIR (fs, §G.2) */
    storage: mysqlEnum("storage", ["db", "fs"]).notNull().default("db"),
  },
  (t) => [index("mf_asset_idx").on(t.assetId), index("mf_store_idx").on(t.storeId), storeFk("media_files", t.storeId)],
);

export const mediaChunks = mysqlTable(
  "media_chunks",
  {
    key: varchar("key", { length: 120 }).notNull(),
    idx: int("idx").notNull(),
    data: mediumBlob("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.idx] })],
);

/* ------------------------------------------------------------------ */
/* commerce                                                            */
/* ------------------------------------------------------------------ */

/**
 * One physical piece of an order (docs/OFFERS.md §G.3). Snapshot at order time: names, labels and
 * codes as the page showed them. `value` / `code` / field names are printable text (owner labels
 * sanitized, a numeric value prefixed by its group name: "Pointure 42"); matrix = one entry,
 * dims in order ("Noir/M").
 */
export interface OrderUnit {
  /** item id at order time */
  item: string;
  /** item name snapshot ("" on single-item pages) */
  label: string;
  /** item short name (warehouse name) */
  short?: string;
  sku?: string;
  free?: true;
  options: { name: string; value: string; code?: string; delta?: number }[];
  fields?: { name: string; value: string; delta?: number }[];
}

/** orders.items JSON. v1 rows have no `v` (read them through orderUnits() in src/lib/orders/text.ts). */
export interface OrderItems {
  /** absent = v1 row */
  v?: 2;
  bundleId: string;
  /** offerSheetLabel (v1 format for v1-shaped offers) */
  bundleLabel: string;
  /** units incl. free (bump not included) */
  qty: number;
  /** fromCents(round((price + deltas) / qty)): v1 meaning kept */
  unitPrice: number;
  /** v1 compat: per unit { groupName: value, …, fieldName: value } (+ "Article": label on multi-item pages) */
  variants: Record<string, string>[];
  units?: OrderUnit[];
  /** order extras; `typed` = a typed value (printed in « »), `code` = warehouse code of a choice */
  extras?: { name: string; value: string; code?: string; typed?: true; delta?: number }[];
  /** offer.gift snapshot (non-catalog) */
  gift?: { label: string };
  /** offer base price, Σ surcharges */
  price?: number;
  deltas?: number;
  reasons?: { label: string; count: number; amount: number }[];
  bump?: { title: string; price: number; unit?: OrderUnit };
  upsell?: { title: string; price: number; item?: string; confirmOptions?: true };
}

export const orders = mysqlTable(
  "orders",
  {
    /** human friendly, e.g. "CMD-7K3Q9X"; global (D28) */
    id: varchar("id", { length: 20 }).primaryKey(),
    storeId: legacyStoreRef(),
    pageId: varchar("page_id", { length: 26 }).notNull(),
    versionId: varchar("version_id", { length: 26 }),
    exportId: varchar("export_id", { length: 26 }),
    source: mysqlEnum("source", ["live", "export", "php"]).notNull().default("live"),
    status: varchar("status", { length: 20 }).notNull().default("new"),
    name: varchar("name", { length: 120 }).notNull(),
    /** E.164 */
    phone: varchar("phone", { length: 24 }).notNull(),
    phoneRaw: varchar("phone_raw", { length: 40 }),
    city: varchar("city", { length: 120 }),
    address: varchar("address", { length: 300 }),
    note: varchar("note", { length: 400 }),
    email: varchar("email", { length: 160 }),
    productName: varchar("product_name", { length: 160 }).notNull(),
    items: jsonText<OrderItems>("items").notNull(),
    qty: int("qty").notNull(),
    subtotal: money("subtotal").notNull(),
    shipping: money("shipping").notNull(),
    total: money("total").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    locale: varchar("locale", { length: 5 }),
    utm: jsonText<Record<string, string>>("utm"),
    ref: varchar("ref", { length: 500 }),
    ipHash: char("ip_hash", { length: 64 }),
    ua: varchar("ua", { length: 300 }),
    eventId: varchar("event_id", { length: 64 }),
    idem: char("idem", { length: 36 }).notNull(),
    riskScore: int("risk_score").notNull().default(0),
    flags: jsonText<string[]>("flags"),
    upsellTokenHash: char("upsell_token_hash", { length: 64 }),
    sheetStatus: mysqlEnum("sheet_status", ["pending", "synced", "failed", "disabled"]).notNull().default("pending"),
    sheetAttempts: int("sheet_attempts").notNull().default(0),
    sheetError: varchar("sheet_error", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(now3),
    /**
     * D54: placed from a store-signed test link (`resolveTestToken()`, set only by the public path); every aggregate
     * reader skips it (Sheets, CAPI, Telegram "[TEST]", stats, KPIs, finance, learning, rollups)
     */
    isTest: boolean("is_test").notNull().default(false),
  },
  (t) => [
    uniqueIndex("orders_idem_uq").on(t.idem),
    index("orders_store_created_idx").on(t.storeId, t.createdAt),
    index("orders_store_status_idx").on(t.storeId, t.status),
    index("orders_store_sheet_idx").on(t.storeId, t.sheetStatus),
    index("orders_store_phone_idx").on(t.storeId, t.phone, t.createdAt),
    index("orders_store_ip_idx").on(t.storeId, t.ipHash, t.createdAt),
    index("orders_store_page_idx").on(t.storeId, t.pageId, t.createdAt),
    index("orders_store_test_idx").on(t.storeId, t.isTest, t.createdAt),
    storeFk("orders", t.storeId),
  ],
);

export const leads = mysqlTable(
  "leads",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    storeId: legacyStoreRef(),
    pageId: varchar("page_id", { length: 26 }).notNull(),
    idem: char("idem", { length: 36 }).notNull(),
    phone: varchar("phone", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }),
    city: varchar("city", { length: 120 }),
    bundleId: varchar("bundle_id", { length: 40 }),
    /** warehouse units text of the resolvable part of the lead's selection (src/lib/orders/text.ts) */
    selection: varchar("selection", { length: 400 }),
    utm: jsonText<Record<string, string>>("utm"),
    convertedOrderId: varchar("converted_order_id", { length: 20 }),
    createdAt: createdAt(),
    /** D54, as orders.is_test */
    isTest: boolean("is_test").notNull().default(false),
  },
  (t) => [
    uniqueIndex("leads_idem_uq").on(t.idem),
    index("leads_page_idx").on(t.pageId, t.createdAt),
    index("leads_store_created_idx").on(t.storeId, t.createdAt),
    storeFk("leads", t.storeId),
  ],
);

export const blocklist = mysqlTable(
  "blocklist",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    storeId: legacyStoreRef(),
    kind: mysqlEnum("kind", ["phone", "ip"]).notNull(),
    /** phone E.164, or sha256(ip) */
    value: varchar("value", { length: 64 }).notNull(),
    reason: varchar("reason", { length: 200 }),
    createdBy: varchar("created_by", { length: 26 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("block_store_uq").on(t.storeId, t.kind, t.value), storeFk("blocklist", t.storeId)],
);

export const exportsTable = mysqlTable(
  "exports",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    storeId: legacyStoreRef(),
    pageId: varchar("page_id", { length: 26 }).notNull(),
    versionId: varchar("version_id", { length: 26 }).notNull(),
    mode: mysqlEnum("mode", ["connected", "php", "whatsapp"]).notNull(),
    /** pageKey baked into the exported page */
    publicKey: varchar("public_key", { length: 40 }).notNull(),
    allowedOrigins: jsonText<string[]>("allowed_origins").notNull(),
    fileName: varchar("file_name", { length: 160 }),
    bytes: int("bytes"),
    createdBy: varchar("created_by", { length: 26 }),
    createdAt: createdAt(),
    revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 }),
  },
  (t) => [
    uniqueIndex("exports_key_uq").on(t.publicKey),
    index("exports_page_idx").on(t.pageId),
    index("exports_store_idx").on(t.storeId, t.createdAt),
    storeFk("exports", t.storeId),
  ],
);

/* ------------------------------------------------------------------ */
/* platform                                                            */
/* ------------------------------------------------------------------ */

/** Platform settings only from 0004 (src/lib/settings/platform-registry.ts); a store's live in store_settings. */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonText<unknown>("value").notNull(),
  /** value is an AES-GCM envelope string (see security/crypto) */
  encrypted: boolean("encrypted").notNull().default(false),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(now3),
});

export const rateLimits = mysqlTable("rate_limits", {
  bucket: varchar("bucket", { length: 191 }).primaryKey(),
  count: int("count").notNull(),
  resetAt: datetime("reset_at", { mode: "date", fsp: 3 }).notNull(),
});

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    userId: varchar("user_id", { length: 26 }),
    action: varchar("action", { length: 64 }).notNull(),
    target: varchar("target", { length: 191 }),
    meta: jsonText<Record<string, unknown>>("meta"),
    ip: varchar("ip", { length: 64 }),
    createdAt: createdAt(),
    /** NULL = a platform or auth event (§F.5) */
    storeId: storeRefOpt(),
    actorKind: mysqlEnum("actor_kind", ["user", "platform", "impersonation", "system", "api"]).notNull().default("user"),
    /** the staff member behind an `impersonation` row (§B.8) */
    impersonatorId: id26("impersonator_id"),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_store_idx").on(t.storeId, t.id), storeFk("audit_log", t.storeId)],
);

export const statsDaily = mysqlTable(
  "stats_daily",
  {
    /** a page id (R1), or a product id from R2 (STO-R11); both are global ULIDs, so the PK stays */
    pageId: varchar("page_id", { length: 26 }).notNull(),
    day: date("day", { mode: "string" }).notNull(),
    views: int("views").notNull().default(0),
    uniques: int("uniques").notNull().default(0),
    formStarts: int("form_starts").notNull().default(0),
    orders: int("orders").notNull().default(0),
    revenue: money("revenue").notNull().default(0),
    storeId: legacyStoreRef(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.day] }), index("sd_store_day_idx").on(t.storeId, t.day), storeFk("stats_daily", t.storeId)],
);

/** short-lived unique-visitor markers (purged after 2 days) */
export const statsVisitors = mysqlTable(
  "stats_visitors",
  {
    pageId: varchar("page_id", { length: 26 }).notNull(),
    day: date("day", { mode: "string" }).notNull(),
    vidHash: char("vid_hash", { length: 32 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.day, t.vidHash] })],
);

/* ------------------------------------------------------------------ */
/* JSON shapes of the tenancy tables                                   */
/* ------------------------------------------------------------------ */

/** Signup risk (platform.md PLA-§3.4, PLA-§2.1); src/lib/platform/types.ts re-exports these shapes. */
export type SignupBand = "fast" | "review" | "hold" | "reject_candidate";
export type SignupFlagCode =
  | "disposable_email"
  | "no_mx"
  | "null_mx"
  | "mx_unknown"
  | "brand_exact"
  | "brand_near"
  | "offensive_term"
  | "dup_email_norm"
  | "dup_phone"
  | "dup_network"
  | "dup_device"
  | "linked_banned"
  | "velocity_network"
  | "turnstile_missing"
  | "turnstile_unverified"
  | "too_fast"
  | "fast"
  | "bot_ua"
  | "no_ua"
  | "phone_market_mismatch"
  | "market_not_allowed"
  | "invite_code" // negative points
  | "trusted_creator" // negative points
  | "mixed_script"; // R3 (PL-22)
export interface SignupFlag {
  code: SignupFlagCode;
  points: number;
  evidence?: Record<string, string | number>;
}
/** signup_reviews.signals: never a raw e-mail, phone, IP or UA string. */
export interface SignupSignals {
  v: 1;
  flags: SignupFlag[];
  band: SignupBand;
  inputs: {
    emailDomain: string;
    phoneCountry: string | null;
    market: string;
    mode: "landing" | "store" | "both";
    modeInterest?: "store" | "both";
    locale: "ar" | "fr" | "en";
    uaLabel: string;
    turnstile: "ok" | "missing" | "unverified" | "off";
    formMs: number | null;
    via: "signup" | "app_new" | "invite_code" | "waitlist_invite";
  };
  cluster: { users: number; banned: number; kinds: ("email_norm" | "phone" | "net" | "device")[] };
  /** a lookup (MX) timed out */
  partial: boolean;
  /** scoring time */
  ms: number;
  /** copied onto a `reopen` row */
  appeal?: true;
}
/** signup_reviews.request: the kinds other than signup / reopen (PLA-§3.7). */
export type ReviewRequest =
  | { kind: "plan_change"; planId: string; message: string | null }
  | { kind: "limit_raise"; key: EntitlementKey; used: number; limit: number | null; asked: number | null; message: string | null }
  | { kind: "mode_change"; mode: "store" | "both"; message: string | null }
  | { kind: "go_live"; message: string | null }
  | { kind: "domain"; host: string }; // R3

/** Flags (platform.md PLA-§12.2, §D.4); src/lib/flags/registry.ts re-exports these shapes. */
export type FlagValue = boolean | number | string | Record<string, unknown>;
export interface FlagRule {
  when: { plans?: string[]; modes?: StoreMode[]; markets?: string[]; storeStatus?: StoreStatus[]; platformRoles?: PlatformRole[] };
  value: FlagValue;
  /** 0-100: parseInt(sha256(key + ":" + (storeId ?? userId ?? ""))[0..7], 16) % 100 < rollout */
  rollout?: number;
}

/* ------------------------------------------------------------------ */
/* tenancy (0004, §D.4; with the platform.md refinements, PLA-§2.1)    */
/* ------------------------------------------------------------------ */

/** Plan definitions, seeded beta / pro / internal by 0004 (§A.4); the keys of limits / features are EntitlementKeys. */
export const plans = mysqlTable("plans", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 60 }).notNull(),
  status: mysqlEnum("status", ["active", "hidden", "retired"]).notNull().default("active"),
  sort: int("sort").notNull().default(0),
  limits: jsonText<Record<string, number | null>>("limits").notNull(),
  features: jsonText<Record<string, boolean>>("features").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The tenant (§A.1). Read through the 15 s store cache (§E.5), never per query. */
export const stores = mysqlTable(
  "stores",
  {
    id: id26().primaryKey(),
    /** NULL only when status = 'purged' (§A.5.1) */
    handle: varchar("handle", { length: 30 }),
    /** authoritative store name; every write runs the live brand check (D76) */
    name: varchar("name", { length: 120 }).notNull(),
    mode: mysqlEnum("mode", ["landing", "store", "both"]).notNull().default("landing"),
    status: mysqlEnum("status", ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"])
      .notNull()
      .default("pending"),
    statusReason: varchar("status_reason", { length: 40 }),
    statusNote: varchar("status_note", { length: 500 }),
    statusChangedAt: ts("status_changed_at"),
    statusChangedBy: id26("status_changed_by"),
    /** neutral 503 instead of 404 while suspended (D32) */
    suspendNotice: boolean("suspend_notice").notNull().default(false),
    closedAt: ts("closed_at"),
    purgeAfter: ts("purge_after"),
    planId: varchar("plan_id", { length: 32 }).notNull().default("beta"),
    market: varchar("market", { length: 8 }).notNull().default("MA"),
    currency: char("currency", { length: 3 }).notNull().default("MAD"),
    timezone: varchar("timezone", { length: 40 }).notNull().default("Africa/Casablanca"),
    defaultLocale: varchar("default_locale", { length: 5 }).notNull().default("ar"),
    locales: jsonText<string[]>("locales"),
    /** platform niche (k ≥ 5 analytics, design niche) */
    category: varchar("category", { length: 40 }),
    homePageId: id26("home_page_id"),
    /** random hex at creation (GEN-12, R-D36) */
    brandSeed: char("brand_seed", { length: 16 }).notNull(),
    /** bumped on any catalog / theme change (R-D42) */
    catalogVersion: int("catalog_version").notNull().default(0),
    /** bumped on a handle / mode / domain change (§C.6) */
    addressVersion: int("address_version").notNull().default(0),
    requireMember2fa: boolean("require_member_2fa").notNull().default(false),
    createdBy: id26("created_by"),
    approvedAt: ts("approved_at"),
    approvedBy: id26("approved_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stores_handle_uq").on(t.handle),
    index("stores_status_idx").on(t.status, t.createdAt),
    index("stores_plan_idx").on(t.planId),
    foreignKey({ name: "fk_stores_plan", columns: [t.planId], foreignColumns: [plans.id] }).onDelete("restrict").onUpdate("restrict"),
  ],
);

/** user × store × role (§A.3); the one user reference with a FK (§D.1). */
export const storeMembers = mysqlTable(
  "store_members",
  {
    storeId: storeRef(),
    userId: id26("user_id").notNull(),
    role: mysqlEnum("role", STORE_ROLES).notNull(),
    status: mysqlEnum("status", ["active", "suspended"]).notNull().default("active"),
    title: varchar("title", { length: 60 }),
    invitedBy: id26("invited_by"),
    joinedAt: ts("joined_at").notNull().default(now3),
    lastActiveAt: ts("last_active_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.userId] }),
    index("sm_user_idx").on(t.userId),
    index("sm_store_role_idx").on(t.storeId, t.role, t.status),
    storeFk("store_members", t.storeId),
    foreignKey({ name: "fk_store_members_user", columns: [t.userId], foreignColumns: [users.id] }).onDelete("restrict").onUpdate("restrict"),
  ],
);

/** Store invite tokens (§B.5), consumed by compare-and-set (SEC-24). */
export const storeInvites = mysqlTable(
  "store_invites",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    emailNorm: varchar("email_norm", { length: 191 }).notNull(),
    role: mysqlEnum("role", STORE_ROLES).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    note: varchar("note", { length: 200 }),
    invitedBy: id26("invited_by").notNull(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    acceptedBy: id26("accepted_by"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("si_token_uq").on(t.tokenHash),
    index("si_store_idx").on(t.storeId, t.createdAt),
    index("si_store_email_idx").on(t.storeId, t.emailNorm),
    storeFk("store_invites", t.storeId),
  ],
);

/** Per-store settings (src/lib/settings/store-registry.ts, §D.10). */
export const storeSettings = mysqlTable(
  "store_settings",
  {
    storeId: storeRef(),
    key: varchar("key", { length: 64 }).notNull(),
    value: jsonText<unknown>("value").notNull(),
    encrypted: boolean("encrypted").notNull().default(false),
    /** 0 = legacy v1 envelope under "settings:<key>" awaiting the conversion task; 2 = envelope v2 bound to the store */
    purposeV: tinyint("purpose_v").notNull().default(2),
    updatedBy: id26("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.key] }), storeFk("store_settings", t.storeId)],
);

/** Renamed / deleted handles: redirects and reservations (§C.7). */
export const storeHandleHistory = mysqlTable(
  "store_handle_history",
  {
    /** upserted when an expired row is reused */
    handle: varchar("handle", { length: 30 }).primaryKey(),
    storeId: storeRef(),
    reason: mysqlEnum("reason", ["renamed", "deleted"]).notNull(),
    redirectUntil: ts("redirect_until"),
    reservedUntil: ts("reserved_until").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("shh_store_idx").on(t.storeId), storeFk("store_handle_history", t.storeId)],
);

/** Per-store overrides and boosts of an EntitlementKey (§A.4). */
export const storeEntitlements = mysqlTable(
  "store_entitlements",
  {
    storeId: storeRef(),
    key: varchar("key", { length: 48 }).notNull(),
    source: mysqlEnum("source", ["override", "boost"]).notNull(),
    value: jsonText<number | boolean | null>("value").notNull(),
    expiresAt: ts("expires_at"),
    setBy: id26("set_by").notNull(),
    reason: varchar("reason", { length: 200 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.key, t.source] }), storeFk("store_entitlements", t.storeId)],
);

/** Gauges and counters (§D.7), charged atomically. */
export const storeUsage = mysqlTable(
  "store_usage",
  {
    storeId: storeRef(),
    metric: varchar("metric", { length: 32 }).notNull(),
    /** "total" | "YYYY-MM" | "YYYY-MM-DD" (rev 3, ENGC-17: created wide, never MODIFYed) */
    period: varchar("period", { length: 10 }).notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.metric, t.period] }), storeFk("store_usage", t.storeId)],
);

/** Platform counters (§D.7; D69): "YYYY-MM", "YYYY-MM-DD", the hour "YYYY-MM-DDTHH" or "total". */
export const platformUsage = mysqlTable(
  "platform_usage",
  {
    metric: varchar("metric", { length: 32 }).notNull(),
    /** rev 3 (D69; CCR r1.0-t1-1): created wide for the hourly mail counter, never MODIFYed (like store_usage, ENGC-17) */
    period: varchar("period", { length: 13 }).notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.metric, t.period] })],
);

/** Manual subscriptions (billing-ready, §A.4). */
export const storeSubscriptions = mysqlTable(
  "store_subscriptions",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    planId: varchar("plan_id", { length: 32 }).notNull(),
    status: mysqlEnum("status", ["active", "scheduled", "ended"]).notNull(),
    provider: mysqlEnum("provider", ["manual"]).notNull().default("manual"),
    providerRef: varchar("provider_ref", { length: 120 }),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end"),
    createdBy: id26("created_by").notNull(),
    note: varchar("note", { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("ssub_store_idx").on(t.storeId, t.status),
    // serves fk_store_subscriptions_plan, so InnoDB never adds an index of its own that the schema does not list
    index("ssub_plan_idx").on(t.planId),
    storeFk("store_subscriptions", t.storeId),
    foreignKey({ name: "fk_store_subscriptions_plan", columns: [t.planId], foreignColumns: [plans.id] }).onDelete("restrict").onUpdate("restrict"),
  ],
);

/** rev 3 (ENGC-1): old slugs → 308 for 12 months (LP-20); cut in 0004 because T3's slug route reads it in R1.0 (§C.4.1). */
export const pageSlugHistory = mysqlTable(
  "page_slug_history",
  {
    storeId: storeRef(),
    slug: varchar("slug", { length: 80 }).notNull(),
    pageId: id26("page_id").notNull(),
    until: ts("until").notNull(),
    hits: int("hits").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.slug] }), index("psh_page_idx").on(t.storeId, t.pageId), storeFk("page_slug_history", t.storeId)],
);

/** rev 3 (SEC-7): every minted /preview/<token> link has a row, so it is store-bound, revocable and countable. */
export const previewTokens = mysqlTable(
  "preview_tokens",
  {
    /** = the token's `jti` */
    id: id26().primaryKey(),
    storeId: storeRef(),
    pageId: id26("page_id").notNull(),
    audience: mysqlEnum("audience", ["staff", "seller"]).notNull(),
    staffUserId: id26("staff_user_id"),
    createdBy: id26("created_by"),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    opened: int("opened").notNull().default(0),
    lastOpenedAt: ts("last_opened_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("pt_store_page_idx").on(t.storeId, t.pageId, t.expiresAt),
    index("pt_exp_idx").on(t.expiresAt),
    storeFk("preview_tokens", t.storeId),
  ],
);

/** Signup invite codes (§B.6): `SG-` + 12 Crockford chars, stored as a hash. */
export const platformInvites = mysqlTable(
  "platform_invites",
  {
    id: id26().primaryKey(),
    codeHash: char("code_hash", { length: 64 }).notNull(),
    label: varchar("label", { length: 120 }),
    usesMax: int("uses_max").notNull().default(1),
    uses: int("uses").notNull().default(0),
    autoApprove: boolean("auto_approve").notNull().default(false),
    expiresAt: ts("expires_at"),
    createdBy: id26("created_by").notNull(),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pi_code_uq").on(t.codeHash)],
);

export const waitlist = mysqlTable(
  "waitlist",
  {
    id: id26().primaryKey(),
    emailNorm: varchar("email_norm", { length: 191 }).notNull(),
    phone: varchar("phone", { length: 24 }),
    note: varchar("note", { length: 300 }),
    locale: varchar("locale", { length: 5 }),
    ipHash: char("ip_hash", { length: 64 }),
    inviteId: id26("invite_id"),
    createdAt: createdAt(),
    // PLA-§2.1
    /** "utm:<source>" | "ref:<host>" | null, owner-typed labels only */
    source: varchar("source", { length: 40 }),
    market: varchar("market", { length: 8 }),
    modeInterest: mysqlEnum("mode_interest", ["landing", "store", "both"]),
    status: mysqlEnum("status", ["waiting", "invited", "dropped"]).notNull().default("waiting"),
    invitedAt: ts("invited_at"),
    invitedBy: id26("invited_by"),
  },
  (t) => [uniqueIndex("wl_email_uq").on(t.emailNorm), index("wl_status_idx").on(t.status, t.createdAt)],
);

export const passwordResets = mysqlTable(
  "password_resets",
  {
    id: id26().primaryKey(),
    userId: id26("user_id").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    createdBy: id26("created_by"),
    reason: varchar("reason", { length: 200 }),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pr_token_uq").on(t.tokenHash), index("pr_user_idx").on(t.userId, t.createdAt)],
);

/** "View as store" sessions (§B.8; read-only, D70). */
export const impersonationSessions = mysqlTable(
  "impersonation_sessions",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    staffUserId: id26("staff_user_id").notNull(),
    sessionId: char("session_id", { length: 64 }).notNull(),
    mode: mysqlEnum("mode", ["read"]).notNull().default("read"),
    reason: mysqlEnum("reason", ["ticket", "onboarding", "abuse_review", "bug", "other"]).notNull(),
    note: varchar("note", { length: 300 }),
    ticketRef: varchar("ticket_ref", { length: 60 }),
    startedAt: ts("started_at").notNull().default(now3),
    expiresAt: ts("expires_at").notNull(),
    endedAt: ts("ended_at"),
    endedReason: mysqlEnum("ended_reason", ["ended", "expired", "revoked"]),
  },
  (t) => [
    index("imp_store_idx").on(t.storeId, t.startedAt),
    index("imp_staff_idx").on(t.staffUserId, t.startedAt),
    storeFk("impersonation_sessions", t.storeId),
  ],
);

/** The approval queue (PD5). */
export const signupReviews = mysqlTable(
  "signup_reviews",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    userId: id26("user_id").notNull(),
    kind: mysqlEnum("kind", ["signup", "reopen", "go_live", "plan_change", "limit_raise", "mode_change", "domain"]).notNull().default("signup"),
    score: tinyint("score").notNull(),
    signals: jsonText<SignupSignals>("signals").notNull(),
    status: mysqlEnum("status", ["pending", "needs_info", "approved", "rejected", "snoozed", "withdrawn"]).notNull().default("pending"),
    snoozeUntil: ts("snooze_until"),
    businessContext: jsonText<Record<string, string>>("business_context"),
    decidedBy: id26("decided_by"),
    decidedAt: ts("decided_at"),
    reasonCode: varchar("reason_code", { length: 40 }),
    reasonNote: varchar("reason_note", { length: 500 }),
    appeals: tinyint("appeals").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // PLA-§2.1
    band: mysqlEnum("band", ["fast", "review", "hold", "reject_candidate"]).notNull().default("review"),
    /** kinds other than signup / reopen (PLA-§3.7) */
    request: jsonText<ReviewRequest>("request"),
    /** "Submit for review" pressed (signup kind) */
    submittedAt: ts("submitted_at"),
    staffQuestion: varchar("staff_question", { length: 500 }),
    answeredAt: ts("answered_at"),
    /** reject + block (the user was banned) */
    blocked: boolean("blocked").notNull().default(false),
  },
  (t) => [
    index("sr_store_idx").on(t.storeId, t.createdAt),
    index("sr_queue_idx").on(t.status, t.score, t.createdAt),
    index("sr_kind_queue_idx").on(t.kind, t.status, t.createdAt),
    index("sr_store_kind_idx").on(t.storeId, t.kind, t.status),
    storeFk("signup_reviews", t.storeId),
  ],
);

/** Hashed duplicate / ban signals (PLA-§3.4), never a raw value. */
export const identityLinks = mysqlTable(
  "identity_links",
  {
    userId: id26("user_id").notNull(),
    kind: mysqlEnum("kind", ["email_norm", "phone", "net", "device"]).notNull(),
    /** hmac(value, "identity:<kind>"), never the raw value */
    valueHash: char("value_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
    // PLA-§2.1
    source: mysqlEnum("source", ["signup", "login", "invite", "staff"]).notNull().default("signup"),
  },
  (t) => [primaryKey({ columns: [t.kind, t.valueHash, t.userId] }), index("il_user_idx").on(t.userId)],
);

/** Brand deny list, seeded by a boot task from src/lib/platform/data/protected-brands.ts (not by SQL). */
export const protectedBrands = mysqlTable(
  "protected_brands",
  {
    id: id26().primaryKey(),
    term: varchar("term", { length: 60 }).notNull(),
    kind: mysqlEnum("kind", ["brand", "bank", "carrier", "gov", "platform", "offensive"]).notNull(),
    match: mysqlEnum("match", ["exact", "substring", "skeleton"]).notNull().default("substring"),
    addedBy: id26("added_by"),
    createdAt: createdAt(),
    // PLA-§2.1
    /** seeded rows are disabled, never deleted (the boot seed is INSERT IGNORE) */
    active: boolean("active").notNull().default(true),
    note: varchar("note", { length: 200 }),
  },
  (t) => [uniqueIndex("pb_term_uq").on(t.term)],
);

/** ToS / Privacy / AUP / DPA and the store legal templates. */
export const legalDocuments = mysqlTable(
  "legal_documents",
  {
    id: id26().primaryKey(),
    kind: mysqlEnum("kind", ["tos", "privacy", "aup", "dpa", "store_privacy", "store_terms", "store_shipping", "store_returns", "store_contact"]).notNull(),
    locale: varchar("locale", { length: 5 }).notNull(),
    version: int("version").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: longtext("body").notNull(),
    status: mysqlEnum("status", ["draft", "published", "retired"]).notNull().default("draft"),
    /** D39 */
    needsLegalReview: boolean("needs_legal_review").notNull().default(true),
    publishedAt: ts("published_at"),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
    // PLA-§2.1
    /** "What changed", shown in the re-acceptance sheet */
    summary: varchar("summary", { length: 500 }),
    effectiveAt: ts("effective_at"),
    requiresReacceptance: boolean("requires_reacceptance").notNull().default(false),
    /** the owner marks "reviewed by a lawyer" (clears the flag) */
    reviewedAt: ts("reviewed_at"),
    reviewedBy: id26("reviewed_by"),
    /** PD17 acknowledgement */
    ackUnreviewedBy: id26("ack_unreviewed_by"),
    ackUnreviewedAt: ts("ack_unreviewed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("ld_kind_loc_ver_uq").on(t.kind, t.locale, t.version), index("ld_kind_status_idx").on(t.kind, t.locale, t.status)],
);

export const legalAcceptances = mysqlTable(
  "legal_acceptances",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    userId: id26("user_id").notNull(),
    storeId: storeRefOpt(),
    documentId: id26("document_id").notNull(),
    acceptedAt: ts("accepted_at").notNull().default(now3),
    ipHash: char("ip_hash", { length: 64 }),
    ua: varchar("ua", { length: 300 }),
    // PLA-§2.1
    context: mysqlEnum("context", ["signup", "reaccept", "invite", "staff"]).notNull().default("signup"),
  },
  (t) => [
    index("la_user_idx").on(t.userId, t.acceptedAt),
    index("la_doc_idx").on(t.documentId),
    // serves fk_legal_acceptances_store: no other index of this table starts with store_id
    index("la_store_idx").on(t.storeId),
    storeFk("legal_acceptances", t.storeId),
  ],
);

/** The notification centre (§I.4, PLA-§22.6). */
export const notifications = mysqlTable(
  "notifications",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    storeId: storeRefOpt(),
    userId: id26("user_id"),
    audience: mysqlEnum("audience", ["user", "store", "store_role", "platform_staff"]).notNull(),
    /** audience = store_role */
    roles: jsonText<StoreRole[]>("roles"),
    /** catalog key, e.g. "order.new_batch", "signup.approved" */
    kind: varchar("kind", { length: 40 }).notNull(),
    severity: mysqlEnum("severity", ["info", "success", "warn", "danger"]).notNull().default("info"),
    /** rendered by the admin catalog in the reader's locale */
    vars: jsonText<Record<string, string | number>>("vars"),
    /** free text (staff messages) only */
    text: varchar("text", { length: 600 }),
    link: varchar("link", { length: 300 }),
    dedupeKey: varchar("dedupe_key", { length: 120 }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at"),
    // PLA-§2.1
    /** audience platform_staff; NULL = every staff role */
    platformMinRole: mysqlEnum("platform_min_role", ["super_admin", "admin", "support", "analyst"]),
  },
  (t) => [
    index("nt_store_idx").on(t.storeId, t.id),
    index("nt_user_idx").on(t.userId, t.id),
    uniqueIndex("nt_dedupe_uq").on(t.dedupeKey),
    index("nt_aud_idx").on(t.audience, t.id),
    storeFk("notifications", t.storeId),
  ],
);

export const notificationReads = mysqlTable(
  "notification_reads",
  {
    notificationId: bigint("notification_id", { mode: "number" }).notNull(),
    userId: id26("user_id").notNull(),
    readAt: ts("read_at").notNull().default(now3),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

/**
 * Release / ops / kill / experiment flags (§D.4, §H.8). 0004 seeds the kill switches; release and ops flags are
 * declared in code (src/lib/flags/defs/<track>.ts) and seeded at boot.
 */
export const flags = mysqlTable("flags", {
  key: varchar("key", { length: 64 }).primaryKey(),
  kind: mysqlEnum("kind", ["release", "ops", "kill", "experiment"]).notNull(),
  description: varchar("description", { length: 300 }),
  defaultValue: jsonText<unknown>("default_value").notNull(),
  rules: jsonText<FlagRule[]>("rules"),
  updatedBy: id26("updated_by"),
  updatedAt: updatedAt(),
  // PLA-§2.1, §D.4
  ownerTrack: varchar("owner_track", { length: 16 }),
  /** still in the table but no longer declared in code (never deleted) */
  archived: boolean("archived").notNull().default(false),
  type: mysqlEnum("type", ["boolean", "number", "string", "json"]).notNull().default("boolean"),
});

export const flagOverrides = mysqlTable(
  "flag_overrides",
  {
    flagKey: varchar("flag_key", { length: 64 }).notNull(),
    scope: mysqlEnum("scope", ["store", "user", "plan", "market"]).notNull(),
    scopeId: varchar("scope_id", { length: 40 }).notNull(),
    value: jsonText<unknown>("value").notNull(),
    updatedBy: id26("updated_by"),
    updatedAt: updatedAt(),
    // PLA-§2.1
    note: varchar("note", { length: 200 }),
    expiresAt: ts("expires_at"),
  },
  (t) => [primaryKey({ columns: [t.flagKey, t.scope, t.scopeId] })],
);

/** Asset usage index (§G.5): which owner uses which asset, live or draft only. */
export const assetRefs = mysqlTable(
  "asset_refs",
  {
    storeId: storeRef(),
    assetId: varchar("asset_id", { length: 64 }).notNull(),
    ownerKind: mysqlEnum("owner_kind", ["page", "page_version", "product", "collection", "store_theme", "brand", "settings", "review", "ticket"]).notNull(),
    ownerId: varchar("owner_id", { length: 64 }).notNull(),
    live: boolean("live").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.assetId, t.ownerKind, t.ownerId] }),
    index("ar_owner_idx").on(t.storeId, t.ownerKind, t.ownerId),
    storeFk("asset_refs", t.storeId),
  ],
);
