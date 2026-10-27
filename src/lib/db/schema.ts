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
  check,
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
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { STORE_ROLES, type PlatformRole, type StoreRole } from "@/lib/auth/permissions";
import type { HealthFlag, HealthGroup, HealthIssue, HealthMetrics, Milestone } from "@/lib/health/types";
import type { AssetFocus } from "@/lib/media/focus";
import type { UnitIn } from "@/lib/orders/contract";
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
/** integer cents (D41); the R1 product tables (0005) keep every new amount in cents */
const cents = (name: string) => bigint(name, { mode: "number" });

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
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_prole_idx").on(t.platformRole),
    // 0005 (PLA Q.10): the console people list; platform code only
    index("users_name_idx").on(t.name),
  ],
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
    // 0005 (§D.2; rethink-ai §5.6, §9.16): provenance of the published doc, written by the publish path from the
    // draft's `generation` block; NULL for pre-R1 rows. ai owns the values (§D.9).
    generationSource: mysqlEnum("generation_source", ["manual", "instant", "director", "deep"]),
    /** ≤ 2 KB, never page text */
    criticPicks: jsonText<CriticPicks>("critic_picks"),
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
    /** 0005 (D42) appended manual, api, storefront, whatsapp */
    source: mysqlEnum("source", ["live", "export", "php", "manual", "api", "storefront", "whatsapp"]).notNull().default("live"),
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
    /*
     * 0005 (§D.2; operations.md OPE-§2.1 is the column list, §D.9): the three state axes (R-D17), the claim queue,
     * the call-center and carrier-loop columns. `status` stays and becomes the projection the state machine writes.
     * Every column is NULL-able or defaulted; maintained by transitionOrder and the queue functions, never by callers.
     */
    confirmState: mysqlEnum("confirm_state", ["new", "attempting", "callback", "confirmed", "cancelled", "fake", "duplicate", "unreachable"]).notNull().default("new"),
    /** attempt_failed and postponed are the rev 3 delivery-rescue lane (OPE Q.27a, OPS-2), at the end of the enum */
    shipState: mysqlEnum("ship_state", ["none", "to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "delivered", "refused", "returned", "lost", "attempt_failed", "postponed"])
      .notNull()
      .default("none"),
    moneyState: mysqlEnum("money_state", ["unpaid", "collected", "remitted", "disputed", "written_off"]).notNull().default("unpaid"),
    /** the agent who owns the order now (claimed, assigned, callback owner) or last worked it; NULL = pool */
    assigneeId: id26("assignee_id"),
    leaseUntil: ts("lease_until"),
    /** the token of the claim that set the lease (a claim reads its own row back by it) */
    claimToken: char("claim_token", { length: 26 }),
    /** when the order becomes callable again; NULL = now */
    dueAt: ts("due_at"),
    /** call and WhatsApp attempts with a no-contact outcome; never reset */
    attempts: tinyint("attempts").notNull().default(0),
    priority: int("priority").notNull().default(0),
    cancelReason: varchar("cancel_reason", { length: 32 }),
    customerId: id26("customer_id"),
    /** R1: the order this one duplicates (OD13); R2: the order its lines were merged into */
    mergedInto: varchar("merged_into", { length: 20 }),
    /** a CityKey slug (D68): cityKey(city) on an exact or alias match, else NULL */
    cityKey: varchar("city_key", { length: 40 }),
    createdBy: id26("created_by"),
    // rev 2 (OPE Q.1, Q.12; LAN Q21; PLA Q.10)
    /** optimistic concurrency (OD4): bumped by state, line, contact, adjustment and assignment writes */
    rev: int("rev").notNull().default(0),
    confirmedBy: id26("confirmed_by"),
    confirmedAt: ts("confirmed_at"),
    firstTouchAt: ts("first_touch_at"),
    shippedAt: ts("shipped_at"),
    deliveredAt: ts("delivered_at"),
    /** ship reached delivered / refused / returned / lost */
    finalAt: ts("final_at"),
    /** "repère / quartier" typed by the agent */
    landmark: varchar("landmark", { length: 160 }),
    /** manager adjustment, ≤ 0 (OD15); total = subtotal + shipping + adjust */
    adjustCents: cents("adjust_cents").notNull().default(0),
    /** status id last known to be in the sheet's column C */
    sheetLabel: varchar("sheet_label", { length: 20 }),
    /** bit 1 status, 2 contact cells, 4 line cells */
    sheetDirty: tinyint("sheet_dirty").notNull().default(0),
    /** envelope v2 "capi-ctx" (OD21), ≤ 8 KB, purged after 8-9 days */
    capiCtx: text("capi_ctx"),
    // rev 3 (OPE Q.27a; D74, OPS-2, OPS-3, OPS-4, OPS-8)
    /** carrier tracking number (OD55): R1 from the Sheet or the drawer; R2 mirrors shipments.tracking */
    trackingRef: varchar("tracking_ref", { length: 64 }),
    /** the Sheet's "Transporteur" text (OD55) */
    carrierLabel: varchar("carrier_label", { length: 60 }),
    /** the hold (OD49): ship only from this instant; NULL or past = shippable */
    shipAfter: ts("ship_after"),
    /** carrier attempts that entered attempt_failed (OD48), never reset */
    deliveryAttempts: tinyint("delivery_attempts").notNull().default(0),
    /** RETURN_REASONS code of the refused / returned / lost move (OD50) */
    returnReason: varchar("return_reason", { length: 32 }),
    /** the Sheet's "Agent" cell when no member is mapped (OD54); confirmed_by wins */
    confirmedByLabel: varchar("confirmed_by_label", { length: 60 }),
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
    // 0005 (§D.2, OPE-§2.1)
    index("orders_queue_idx").on(t.storeId, t.confirmState, t.dueAt),
    index("orders_assignee_idx").on(t.storeId, t.assigneeId, t.confirmState),
    index("orders_customer_idx").on(t.storeId, t.customerId, t.createdAt),
    index("orders_ship_idx").on(t.storeId, t.shipState, t.updatedAt),
    index("orders_confirmer_idx").on(t.storeId, t.confirmedBy, t.confirmedAt),
    index("orders_money_idx").on(t.storeId, t.moneyState, t.deliveredAt),
    index("orders_dirty_idx").on(t.storeId, t.sheetDirty),
    index("orders_tracking_idx").on(t.storeId, t.trackingRef),
    // the one cross-store index (PLA Q.10): the console order lookup, platform code only
    index("orders_created_idx").on(t.createdAt),
    storeFk("orders", t.storeId),
  ],
);

/** orders.source: today's live / export / php, and from 0005 (D42) manual, api, storefront, whatsapp */
export type OrderSource = (typeof orders.$inferSelect)["source"];

export const leads = mysqlTable(
  "leads",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    storeId: legacyStoreRef(),
    pageId: varchar("page_id", { length: 26 }).notNull(),
    idem: char("idem", { length: 36 }).notNull(),
    /** E.164; NULL-able from 0005 (LAN Q2, the one guarded type change of 0005): a WhatsApp intent has no phone yet */
    phone: varchar("phone", { length: 24 }),
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
    /*
     * 0005 (§D.2; landing.md LAN-§2.1 is the column list, §D.9): the lead inbox (LP-06) and the WhatsApp intent
     * (LAN-§11). NULL-able or defaulted.
     */
    status: mysqlEnum("status", ["new", "contacted", "recovered", "lost", "converted"]).notNull().default("new"),
    assigneeId: id26("assignee_id"),
    contactedAt: ts("contacted_at"),
    /** WhatsApp or call attempts logged from the inbox */
    attempts: tinyint("attempts").notNull().default(0),
    note: varchar("note", { length: 300 }),
    /** whatsapp = an "Order on WhatsApp" intent */
    kind: mysqlEnum("kind", ["form", "whatsapp"]).notNull().default("form"),
    /** `WA-` + 6 Crockford chars, written in the WhatsApp text; unique per store */
    ref: char("ref", { length: 9 }),
    /** the structured choice for one-tap conversion, ≤ 8 KB */
    sel: jsonText<LeadSelection>("sel"),
    /** server total of the resolved selection at capture (display only; conversion re-prices) */
    totalCents: cents("total_cents"),
    /** the version the visitor saw (payload `ver`) */
    versionId: id26("version_id"),
    /** next follow-up due (landing.leads.followUpHours) */
    nextAt: ts("next_at"),
    /** no_answer | not_interested | wrong_number | already_ordered | price | other */
    lostReason: varchar("lost_reason", { length: 32 }),
    /** how converted_order_id was set (LD12) */
    convertedVia: mysqlEnum("converted_via", ["idem", "phone", "agent"]),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("leads_idem_uq").on(t.idem),
    index("leads_page_idx").on(t.pageId, t.createdAt),
    index("leads_store_created_idx").on(t.storeId, t.createdAt),
    // 0005 (§D.2, LAN-§2.1)
    index("leads_store_status_idx").on(t.storeId, t.status, t.createdAt),
    index("leads_store_phone_idx").on(t.storeId, t.phone, t.createdAt),
    index("leads_store_assignee_idx").on(t.storeId, t.assigneeId, t.status),
    // several NULLs allowed
    uniqueIndex("leads_store_ref_uq").on(t.storeId, t.ref),
    index("leads_store_next_idx").on(t.storeId, t.nextAt),
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

/* ------------------------------------------------------------------ */
/* JSON shapes of the R1 product tables (0005)                         */
/* ------------------------------------------------------------------ */
/*
 * Frozen at P0 with the columns that store them. Each owning track's types file re-exports the shapes it owns
 * (like src/lib/platform/types.ts re-exports the signup shapes above); a shape the spec leaves open is the loosest
 * type its prose allows, and the owner narrows it through the maintainer.
 */

/** The one city key of the platform (D68, OPE-§10.1): a slug of the market list ("casablanca", "fes"). P4's
 *  src/lib/orders/address.ts declares the same brand, so the two are interchangeable. */
export type CityKey = string & { readonly __city: true };
/** delivery_zones.cities: CityKey slugs, or "*" = every city not in another zone (LAN-§2.1) */
export type ZoneCityKey = CityKey | "*";

/** leads.sel (LAN-§2.1; src/lib/leads/types.ts re-exports): the v2 landing selection, units as the order contract. */
export interface LeadSelectionV2 {
  v: 2;
  ver?: string;
  bundleId?: string;
  bump?: boolean;
  units: UnitIn[];
  extras: Record<string, string>;
  b?: UnitIn;
}
/** One line of a store intent (R2, OPS-15): storefront's LineIn (STO-§16.1) without the shown subtotal `ls`. */
export interface LeadLineV3 {
  /** products.public_key */
  pk: string;
  /** the product revision the line was priced with */
  rev: string;
  bundleId: string;
  units: UnitIn[];
  extras: Record<string, string>;
  n: number;
}
/** R2 (STO-§15.11, §15.13): a store intent or an abandoned checkout */
export interface LeadSelectionV3 {
  v: 3;
  lines: LeadLineV3[];
  ctxPageId?: string;
}
/** readers dispatch on `v` */
export type LeadSelection = LeadSelectionV2 | LeadSelectionV3;

/** short_links.channel and the Campaign Kit channels (LAN-§2.1, §13.1) */
export const SHORT_LINK_CHANNELS = ["meta", "tiktok", "snap", "google", "whatsapp", "instagram", "organic", "print", "other"] as const;
export type CampaignChannel = (typeof SHORT_LINK_CHANNELS)[number];
/** short_links.utm: presets within the order contract's maxima (src/lib/orders/contract.ts Utm) */
export type ShortLinkUtm = Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>>;

type KitLocale = "ar" | "fr" | "en";
/** campaigns.kit (LAN-§13.2, ≤ 64 KB): display copies of real page data only, never an invented figure */
export interface CampaignKit {
  v: 1;
  compiledAt: string;
  locales: KitLocale[];
  facts: { product: string; offers: { label: string; price: string }[]; fee: string | null; eta: Record<KitLocale, string> | null };
  /** url = storeUrl(store, "/go/" + code), built by the links service at compile (SEC-6) */
  links: { channel: CampaignChannel; shortLinkId: string; url: string; utm: ShortLinkUtm }[];
  whatsappConfirm: Record<KitLocale, string>;
  script: { steps: { id: string; text: Record<KitLocale, string> }[] };
  brief: AdBrief;
  pixelPlan: { pixels: string[]; trigger: "order" | "confirmed" | "delivered"; events: { name: string; where: string }[]; testHint: boolean };
  /** set by the landing publish listener when the page's pricing fingerprint moved since the compile (LAN-§13.3) */
  stale?: boolean;
}
export interface AdBrief {
  angles: {
    id: string;
    /** DG-07 structure tag */
    tag: string;
    name: string;
    hook: Record<KitLocale, string>;
    primary: Record<KitLocale, string>;
    headline: Record<KitLocale, string>;
    visual: string;
    ugc15: string[];
  }[];
  doNotSay: string[];
  compliance: string[];
  source: "library" | "cloud";
  promptVersion?: string;
}

/** ai_runs.flags (AI-§A.3) */
export type AiFlag =
  | "cache_hit"
  | "pii_redacted"
  | "injection_suspected"
  | "fallback_model"
  | "fast"
  | "director_fallback"
  | "guard_partial"
  | "stale_prompt"
  | "critic_contradiction"
  | "repair_rejected"
  | "picks_adjusted"
  | "canary_leak"
  | "canary_version"
  | "job_degraded_to_batch"
  | "stage_resumed"
  | "orange_regions"
  | "pin_dropped"
  | "novelty_reasked"
  | "novelty_replaced";

/** page_versions.critic_picks and ai_jobs.result.critique (AI-§M.1): ≤ 2 KB, never page text */
export interface CriticPicks {
  v: 1;
  source: "director" | "deep";
  promptVersions: Record<"plan" | "critique" | "verify" | "hero", string | null>;
  rubricVersion: "v3";
  slot: "best_fit" | "contrast" | "explore";
  round: 1 | 2;
  /** candidate ids */
  picks: string[];
  chosen: string;
  /** the chosen candidate's score per rubric dimension (AI-§A.8.3) */
  scores: Record<string, number>;
  /** op = design's RepairOp["op"] (DES-§8.6) */
  repairs: { op: string; section?: number; applied: boolean }[];
  distinctness: number[];
  critiqueRunId: string;
}

/** ai_eval_runs.scores: the scorer metrics of AI-§F.4 by name (schemaValid, refusalRate, inventedNumbers, …) */
export type EvalScores = Record<string, number>;
/** ai_eval_runs.pairwise: the judge's tally per property (AI-§F.5) */
export type PairwiseScores = Record<string, { wins: number; losses: number; ties: number; bothBad: number; lowerBound: number; agreement: number }>;

/** design_genomes.genome (DES-§4.1): the compact genome, ≤ 1,200 B */
export type GenomeCompact = { v: 1; s: number; b: Record<string, unknown>; p: Record<string, unknown>; x: [string, string, string?, string?][] };
/** design gate ids (DES-§8) */
export type GateId = `V${string}` | `S${string}` | `C${string}` | `N${string}` | `T${string}` | `K${string}` | `I${string}` | `R${string}` | `RTL${string}` | `D${string}`;
/** who wrote a text field (DES-§9.8, core §M.1 rule 2) */
export type OriginClass = "owner" | "library" | "engine" | "local" | "cloud";
/** design_genomes.report (DES-§2.1): gate ids and counts, never page text; `chosen` rows also carry `gen` (rev 4) */
export interface GateSummary {
  v: 1;
  hard: GateId[];
  soft: GateId[];
  /** the slop detector ids of DES-§8 */
  slop: string[];
  copy: { cliche: number; spec: number };
  /** field path → { h: hash16, o: OriginClass } (≤ 600 B), read by the core's originFrom */
  gen?: Record<string, { h: string; o: OriginClass }>;
}
export type NoveltyBand = "ok" | "close" | "too_close";
/** design_genomes.novelty (DES-§2.1): the verdict bands shown to the owner (DS27) */
export interface NoveltyBands {
  v: 1;
  platform: NoveltyBand;
  niche: NoveltyBand;
  own: NoveltyBand | "first";
  at: string;
  /** published on the verified exhaustion path (DES-§7.9 step 4) */
  fallback?: true;
}

/** backup_runs.manifest (§H.6): row counts and the sha256 of every part */
export interface BackupManifest {
  v: 1;
  tables: { name: string; rows: number; parts: { name: string; bytes: number; sha256: string }[] }[];
}

/* ------------------------------------------------------------------ */
/* R1 product tables (0005, §D.5; the cited part sections are the     */
/* column lists, §D.9)                                                  */
/* ------------------------------------------------------------------ */

// platform (platform.md PLA-§2.2 is the final list)

/** P*: one health snapshot per store, written only by the platform.health job, read by both audiences (D53). */
export const storeHealth = mysqlTable(
  "store_health",
  {
    storeId: varchar("store_id", { length: 26 }).primaryKey(),
    /** 0-100, one number for both audiences (PLA-§6.3) */
    score: tinyint("score").notNull(),
    /** max console flag severity: 0 none, 1 info, 2 warn, 3 danger */
    attention: tinyint("attention").notNull().default(0),
    /** console flags (PLA-§6.3 codes), never shown to tenants */
    flags: jsonText<HealthFlag[]>("flags").notNull(),
    /** tenant issues with evidence + fix (§I.7; ≤ 20 stored, 5 shown) */
    issues: jsonText<HealthIssue[]>("issues").notNull(),
    /** penalty per group */
    components: jsonText<Record<HealthGroup, number>>("components").notNull(),
    metrics: jsonText<HealthMetrics>("metrics").notNull(),
    /** ISO date each milestone was first reached (PD40) */
    milestones: jsonText<Partial<Record<Milestone, string>>>("milestones"),
    /** issue id → ISO until (health.snooze, audited; PD67) */
    snoozed: jsonText<Record<string, string>>("snoozed"),
    dormant: boolean("dormant").notNull().default(false),
    computedAt: ts("computed_at").notNull(),
    /** set by markHealthDirty() for a priority recompute */
    dirtyAt: ts("dirty_at"),
  },
  (t) => [index("sh_attention_idx").on(t.attention, t.score), index("sh_due_idx").on(t.dirtyAt, t.computedAt), storeFk("store_health", t.storeId)],
);

/**
 * P (opt. store): dangerous actions that need a second person or a delay (PD7, §A.5.1). store_purge only while the
 * store is closed / scheduled_deletion; one pending per (store, kind); expires after 7 days. The requester never
 * confirms their own four-eyes request: enforced in SQL by preq_four_eyes_ck. Kept 400 days after a purge (§F.9).
 */
export const platformRequests = mysqlTable(
  "platform_requests",
  {
    id: id26().primaryKey(),
    storeId: storeRefOpt(),
    kind: mysqlEnum("kind", ["store_purge", "staff_super_admin"]).notNull(),
    mode: mysqlEnum("mode", ["four_eyes", "delayed"]).notNull(),
    /** { targetUserId } for staff_super_admin */
    payload: jsonText<Record<string, string>>("payload").notNull(),
    reasonCode: varchar("reason_code", { length: 40 }).notNull(),
    reasonNote: varchar("reason_note", { length: 500 }),
    status: mysqlEnum("status", ["pending", "confirmed", "executed", "cancelled", "expired"]).notNull().default("pending"),
    requestedBy: id26("requested_by").notNull(),
    requestedAt: ts("requested_at").notNull().default(now3),
    /** delayed: requested_at + 24 h; four_eyes: set at confirmation */
    executeAfter: ts("execute_after"),
    confirmedBy: id26("confirmed_by"),
    confirmedAt: ts("confirmed_at"),
    cancelledBy: id26("cancelled_by"),
    cancelledAt: ts("cancelled_at"),
    executedAt: ts("executed_at"),
    error: varchar("error", { length: 200 }),
  },
  (t) => [
    index("preq_due_idx").on(t.status, t.executeAfter),
    index("preq_store_idx").on(t.storeId, t.status),
    check("preq_four_eyes_ck", sql`confirmed_by <> requested_by`),
    storeFk("platform_requests", t.storeId),
  ],
);

/** P: staff invite tokens (PD13): 72 h, single use, bound to the e-mail, ≤ 10 pending. */
export const staffInvites = mysqlTable(
  "staff_invites",
  {
    id: id26().primaryKey(),
    emailNorm: varchar("email_norm", { length: 191 }).notNull(),
    role: mysqlEnum("role", ["admin", "support", "analyst"]).notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    invitedBy: id26("invited_by").notNull(),
    note: varchar("note", { length: 200 }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    acceptedBy: id26("accepted_by"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sti_token_uq").on(t.tokenHash), index("sti_email_idx").on(t.emailNorm)],
);

/**
 * P* (D76, PD70): public "Report this store" rows, insert-only in R1 (recordAbuseReport, P1); the R3 triage fills
 * handled_by / handled_at / action_taken. Purged with the store, kept 400 days like audit (§F.9).
 */
export const abuseReports = mysqlTable(
  "abuse_reports",
  {
    id: id26().primaryKey(),
    /** the reported store (resolved from the handle at insert) */
    storeId: storeRef(),
    /** the path the reporter was on, same host only, query stripped */
    pageUrl: varchar("page_url", { length: 500 }),
    reason: mysqlEnum("reason", ["phishing", "scam", "counterfeit", "prohibited", "impersonation", "other"]).notNull(),
    /** ≤ 2,000 chars, plain text */
    details: text("details"),
    /** envelope v2, scope platform, purpose "abuse:contact"; optional */
    reporterContactEnc: text("reporter_contact_enc"),
    status: mysqlEnum("status", ["new", "triaged", "actioned", "dismissed"]).notNull().default("new"),
    actionTaken: varchar("action_taken", { length: 40 }),
    ipHash: char("ip_hash", { length: 64 }).notNull(),
    handledBy: id26("handled_by"),
    handledAt: ts("handled_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ar_status_idx").on(t.status, t.createdAt),
    index("ar_store_idx").on(t.storeId, t.createdAt),
    index("ar_ip_idx").on(t.ipHash, t.createdAt),
    storeFk("abuse_reports", t.storeId),
  ],
);

/** P (opt. store): staff notes (§D.5 + the PLA-§2.1 refinements of §D.4). */
export const platformNotes = mysqlTable(
  "platform_notes",
  {
    id: id26().primaryKey(),
    storeId: storeRefOpt(),
    userId: id26("user_id"),
    authorId: id26("author_id").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // PLA-§2.1
    kind: mysqlEnum("kind", ["note", "decision", "warning"]).notNull().default("note"),
    /** staff user ids parsed from "@name" */
    mentions: jsonText<string[]>("mentions"),
    editedAt: ts("edited_at"),
    /** soft delete (kept for the audit trail) */
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("pn_store_idx").on(t.storeId, t.createdAt), index("pn_user_idx").on(t.userId, t.createdAt), storeFk("platform_notes", t.storeId)],
);

// landing (landing.md LAN-§2.2 and LAN-§2.1 are the final lists)

/** Campaign Kit (SF-01, LP-18, LAN-§13). A live or paused kit counts in the campaigns gauge. */
export const campaigns = mysqlTable(
  "campaigns",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    name: varchar("name", { length: 120 }).notNull(),
    /** utm_campaign value, [a-z0-9-] */
    slug: varchar("slug", { length: 40 }).notNull(),
    pageId: id26("page_id").notNull(),
    /** the version the kit was compiled from */
    pageVersionId: id26("page_version_id"),
    productRef: jsonText<{ kind: "landing_items" | "product"; id: string }>("product_ref").notNull(),
    channels: jsonText<CampaignChannel[]>("channels").notNull(),
    /** LAN-§13.2, ≤ 64 KB */
    kit: jsonText<CampaignKit>("kit").notNull(),
    kitSource: mysqlEnum("kit_source", ["library", "cloud"]).notNull().default("library"),
    /** pricing fingerprint at compile (LAN-§18.4) → "page changed since" */
    offersHash: char("offers_hash", { length: 16 }).notNull(),
    /** sha256 of the read-only share token; NULL = not shared */
    shareTokenHash: char("share_token_hash", { length: 64 }),
    status: mysqlEnum("status", ["draft", "live", "paused", "ended"]).notNull().default("draft"),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cp_store_slug_uq").on(t.storeId, t.slug),
    index("cp_store_page_idx").on(t.storeId, t.pageId),
    uniqueIndex("cp_share_uq").on(t.shareTokenHash),
    storeFk("campaigns", t.storeId),
  ],
);

/**
 * `/go/<code>` (LP-12, moved from 0007, LAN Q6). rev 3 (SEC-6, LAN-§12.1): the destination is a typed reference
 * resolved inside the store's scope at redirect time, never a stored URL, so an open redirect is impossible.
 */
export const shortLinks = mysqlTable(
  "short_links",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    /** generated: 6 Crockford chars; owner-chosen: 3-16 of [a-z0-9-] */
    code: varchar("code", { length: 16 }).notNull(),
    /** product / collection from R2 */
    targetKind: mysqlEnum("target_kind", ["page", "home", "policy", "product", "collection"]).notNull().default("page"),
    /** NOT NULL when target_kind = 'page' (createShortLink enforces: a published page of this store) */
    pageId: id26("page_id"),
    /** 'policy': the policy kind; R2 'product' / 'collection': the row id of this store */
    targetRef: varchar("target_ref", { length: 26 }),
    campaignId: id26("campaign_id"),
    utm: jsonText<ShortLinkUtm>("utm"),
    channel: mysqlEnum("channel", SHORT_LINK_CHANNELS),
    status: mysqlEnum("status", ["active", "paused"]).notNull().default("active"),
    clicks: int("clicks").notNull().default(0),
    lastClickAt: ts("last_click_at"),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sl_store_code_uq").on(t.storeId, t.code),
    index("sl_store_page_idx").on(t.storeId, t.pageId),
    index("sl_store_campaign_idx").on(t.storeId, t.campaignId),
    storeFk("short_links", t.storeId),
  ],
);

/**
 * City groups, fee, ETA (R-D22, LAN-§7). Invariants live in saveZones() under storeLock(storeId, "zones"): ≤ 40
 * zones, a city key in at most one zone, at most one ["*"] zone, 0 ≤ etaMin ≤ etaMax ≤ 30.
 */
export const deliveryZones = mysqlTable(
  "delivery_zones",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    /** owner label: "Casablanca", "Grandes villes", "Reste du Maroc" */
    name: varchar("name", { length: 80 }).notNull(),
    /** rev 3 (D68, OPS-1): CityKey slugs, or ["*"]; never "Autre" (it is the "*" zone) */
    cities: jsonText<ZoneCityKey[]>("cities").notNull(),
    /** NULL = not typed by the owner (never invented); charged only from R2 (LD4) */
    feeCents: cents("fee_cents"),
    freeFromCents: cents("free_from_cents"),
    /** working days; both NULL or both set */
    etaMinDays: tinyint("eta_min_days"),
    etaMaxDays: tinyint("eta_max_days"),
    notServed: boolean("not_served").notNull().default(false),
    /** agents only (drawer, script); never rendered on a page */
    note: varchar("note", { length: 120 }),
    position: int("position").notNull().default(0),
    updatedBy: id26("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dz_store_idx").on(t.storeId, t.position), storeFk("delivery_zones", t.storeId)],
);

// operations (operations.md OPE-§2.2 … OPE-§2.7 are the final lists)

/** The order timeline (R-D18, OPE-§2.2): `type` from the OrderEventType catalog, `meta` zod-checked, ≤ 2 KB. */
export const orderEvents = mysqlTable(
  "order_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    storeId: storeRef(),
    orderId: varchar("order_id", { length: 20 }).notNull(),
    at: ts("at").notNull().default(now3),
    actorKind: mysqlEnum("actor_kind", ["user", "system", "customer", "sheet", "carrier", "api", "platform", "bot"]).notNull(),
    actorId: varchar("actor_id", { length: 26 }),
    type: varchar("type", { length: 32 }).notNull(),
    fromState: varchar("from_state", { length: 24 }),
    toState: varchar("to_state", { length: 24 }),
    reasonCode: varchar("reason_code", { length: 32 }),
    note: varchar("note", { length: 500 }),
    meta: jsonText<Record<string, unknown>>("meta"),
    /** the order's rev after this event (undo checks); NULL for events that do not change the order */
    rev: int("rev"),
  },
  (t) => [
    index("oe_order_idx").on(t.storeId, t.orderId, t.at),
    index("oe_actor_idx").on(t.storeId, t.actorId, t.at),
    index("oe_type_idx").on(t.storeId, t.type, t.at),
    storeFk("order_events", t.storeId),
  ],
);

/** Per-store customer profiles (OP-06, OPE-§2.3): counters are deltas of the inTx hook; test orders count in test_count only. */
export const customers = mysqlTable(
  "customers",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    /** E.164 */
    phone: varchar("phone", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }),
    city: varchar("city", { length: 120 }),
    cityKey: varchar("city_key", { length: 40 }),
    locale: varchar("locale", { length: 5 }),
    ordersCount: int("orders_count").notNull().default(0),
    confirmedCount: int("confirmed_count").notNull().default(0),
    deliveredCount: int("delivered_count").notNull().default(0),
    refusedCount: int("refused_count").notNull().default(0),
    returnedCount: int("returned_count").notNull().default(0),
    cancelledCount: int("cancelled_count").notNull().default(0),
    fakeCount: int("fake_count").notNull().default(0),
    testCount: int("test_count").notNull().default(0),
    firstOrderAt: ts("first_order_at"),
    lastOrderAt: ts("last_order_at"),
    lastOrderId: varchar("last_order_id", { length: 20 }),
    note: varchar("note", { length: 300 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cu_store_phone_uq").on(t.storeId, t.phone),
    index("cu_store_last_idx").on(t.storeId, t.lastOrderAt),
    // cross-store console order lookup (PLA Q.10): src/lib/platform/** only, with `// tenancy: platform order-lookup`
    index("cu_phone_idx").on(t.phone),
    storeFk("customers", t.storeId),
  ],
);

/** Agent presence, caps and round-robin state (OPE-§2.4); a row is created lazily. */
export const agentProfiles = mysqlTable(
  "agent_profiles",
  {
    storeId: storeRef(),
    userId: id26("user_id").notNull(),
    presence: mysqlEnum("presence", ["offline", "online", "break"]).notNull().default("offline"),
    presenceAt: ts("presence_at"),
    /** heartbeat (≤ 1 write per 60 s) */
    lastSeenAt: ts("last_seen_at"),
    /** NULL = no cap; decided orders per store-local day */
    dailyCap: int("daily_cap"),
    /** 1-5, round-robin share */
    weight: tinyint("weight").notNull().default(1),
    /** smooth weighted round-robin state */
    rrCredit: int("rr_credit").notNull().default(0),
    languages: jsonText<("ar" | "fr" | "en")[]>("languages"),
    skills: jsonText<string[]>("skills"),
    /** rev 3 (ENGC-17): born as the JSON array (OPE Q.25), no rename later */
    commissionRuleIds: jsonText<string[]>("commission_rule_ids"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.userId] }), index("ap_presence_idx").on(t.storeId, t.presence), storeFk("agent_profiles", t.storeId)],
);

/** Agent KPIs per store-local day (OPE-§2.4); upsells / upsell_cents / online_ms are filled from R2. */
export const agentStatsDaily = mysqlTable(
  "agent_stats_daily",
  {
    storeId: storeRef(),
    userId: id26("user_id").notNull(),
    /** store timezone */
    day: date("day", { mode: "string" }).notNull(),
    worked: int("worked").notNull().default(0),
    confirmed: int("confirmed").notNull().default(0),
    cancelled: int("cancelled").notNull().default(0),
    fake: int("fake").notNull().default(0),
    duplicates: int("duplicates").notNull().default(0),
    attempts: int("attempts").notNull().default(0),
    reveals: int("reveals").notNull().default(0),
    firstTouchMsSum: bigint("first_touch_ms_sum", { mode: "number" }).notNull().default(0),
    firstTouchN: int("first_touch_n").notNull().default(0),
    handlingMsSum: bigint("handling_ms_sum", { mode: "number" }).notNull().default(0),
    shipped: int("shipped").notNull().default(0),
    delivered: int("delivered").notNull().default(0),
    refused: int("refused").notNull().default(0),
    returned: int("returned").notNull().default(0),
    // OPE-§2.4 refinements
    decided: int("decided").notNull().default(0),
    unreachable: int("unreachable").notNull().default(0),
    callbacks: int("callbacks").notNull().default(0),
    lost: int("lost").notNull().default(0),
    /** claims released by lease_expired (OD46) */
    abandoned: int("abandoned").notNull().default(0),
    upsells: int("upsells").notNull().default(0),
    upsellCents: cents("upsell_cents").notNull().default(0),
    /** from presence spans */
    onlineMs: bigint("online_ms", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.userId, t.day] }), index("asd_store_day_idx").on(t.storeId, t.day), storeFk("agent_stats_daily", t.storeId)],
);

/** Saved filters (OPE-§2.5): query = OrderQuery | LeadQuery | CustomerQuery JSON, validated on write. */
export const savedViews = mysqlTable(
  "saved_views",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    /** NULL = shared with the team */
    userId: id26("user_id"),
    surface: mysqlEnum("surface", ["orders", "leads", "customers"]).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    query: jsonText<Record<string, unknown>>("query").notNull(),
    position: int("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sv_store_idx").on(t.storeId, t.surface, t.userId), storeFk("saved_views", t.storeId)],
);

/** WhatsApp / Telegram templates and call scripts (OPE-§2.5); a row overrides the builtin of the same channel, kind, locale and page. */
export const messageTemplates = mysqlTable(
  "message_templates",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    channel: mysqlEnum("channel", ["whatsapp", "telegram", "sms", "email", "call_script"]).notNull(),
    /** OPE-§22.2 kinds; "script" for call_script */
    kind: varchar("kind", { length: 40 }).notNull(),
    /** "ar" | "fr" | "en" */
    locale: varchar("locale", { length: 5 }).notNull(),
    /** NULL = every page */
    pageId: id26("page_id"),
    name: varchar("name", { length: 80 }).notNull(),
    /** template text; call_script: ScriptDoc JSON (OPE-§7.2) */
    body: text("body").notNull(),
    /** AI-15 drafts */
    status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("active"),
    source: mysqlEnum("source", ["user", "ai"]).notNull().default("user"),
    /** AI-15 provenance */
    promptVersion: varchar("prompt_version", { length: 32 }),
    position: int("position").notNull().default(0),
    updatedBy: id26("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [index("mt_store_idx").on(t.storeId, t.channel, t.kind, t.locale), storeFk("message_templates", t.storeId)],
);

/** Spreadsheet ownership (IN-01): one store per spreadsheet across the platform (TENANCY-MAP §7.7). */
export const sheetBindings = mysqlTable(
  "sheet_bindings",
  {
    spreadsheetId: varchar("spreadsheet_id", { length: 100 }).primaryKey(),
    storeId: storeRef(),
    /** legacy = store #1, grandfathered */
    method: mysqlEnum("method", ["code", "legacy"]).notNull().default("code"),
    verifiedAt: ts("verified_at").notNull(),
    verifiedBy: id26("verified_by"),
    createdAt: createdAt(),
  },
  (t) => [index("sb_store_idx").on(t.storeId), storeFk("sheet_bindings", t.storeId)],
);

/** One health row per integration target (OPE-§2.6): written by P5 (S4/S5 later) at most once per minute per row. */
export const integrationStatus = mysqlTable(
  "integration_status",
  {
    storeId: storeRef(),
    kind: mysqlEnum("kind", ["sheets", "capi", "telegram", "whatsapp", "webhook", "carrier"]).notNull(),
    /** "" | "meta:<pixel>" | endpoint id | account id */
    targetId: varchar("target_id", { length: 64 }).notNull().default(""),
    state: mysqlEnum("state", ["ok", "warn", "failing", "off"]).notNull(),
    lastOkAt: ts("last_ok_at"),
    lastErrorAt: ts("last_error_at"),
    lastErrorCode: varchar("last_error_code", { length: 48 }),
    /** consecutive failures */
    failures: int("failures").notNull().default(0),
    /** e.g. orders waiting for the sheet */
    backlog: int("backlog").notNull().default(0),
    oldestPendingAt: ts("oldest_pending_at"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.kind, t.targetId] }), index("is_state_idx").on(t.state, t.kind), storeFk("integration_status", t.storeId)],
);

/** Profit lite alert hysteresis (SF-04, OPE-§2.6). */
export const profitAlerts = mysqlTable(
  "profit_alerts",
  {
    storeId: storeRef(),
    /** "cpa_over_breakeven" | "refusal_spike" | "city_refusal" | "cash_held" (R2) */
    kind: varchar("kind", { length: 32 }).notNull(),
    /** page id, city key, carrier account id */
    key: varchar("key", { length: 80 }).notNull().default(""),
    firedAt: ts("fired_at").notNull(),
    clearedAt: ts("cleared_at"),
    /** the numbers the alert text quotes, with n */
    evidence: jsonText<Record<string, number>>("evidence").notNull(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.kind, t.key, t.firedAt] }), index("pa_open_idx").on(t.storeId, t.clearedAt), storeFk("profit_alerts", t.storeId)],
);

/**
 * Profit lite inputs (OPE-§2.7, moved from 0006). R1 rows: page_id + item_id; rev 3 (OPS-24) a store-level cost by
 * warehouse code (sku). Code check: exactly one of product_id, page_id, sku. Lookup: variant → item@page → sku →
 * product default (OPE-§16.3).
 */
export const productCosts = mysqlTable(
  "product_costs",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    /** R2 (products) */
    productId: id26("product_id"),
    pageId: id26("page_id"),
    itemId: varchar("item_id", { length: 40 }),
    /** the Offers v2 item `code` */
    sku: varchar("sku", { length: 64 }),
    /** "" = every variant */
    variantKey: varchar("variant_key", { length: 120 }).notNull().default(""),
    costCents: cents("cost_cents").notNull(),
    /** NULL = the store default (accounting.packagingCents) */
    packagingCents: cents("packaging_cents"),
    effectiveFrom: ts("effective_from").notNull(),
    note: varchar("note", { length: 200 }),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("pc_prod_idx").on(t.storeId, t.productId, t.itemId, t.variantKey, t.effectiveFrom),
    index("pc_page_idx").on(t.storeId, t.pageId, t.itemId, t.variantKey, t.effectiveFrom),
    index("pc_sku_idx").on(t.storeId, t.sku, t.variantKey, t.effectiveFrom),
    storeFk("product_costs", t.storeId),
  ],
);

/**
 * Carrier rates (OPE-§2.7, moved from 0006). carrier_account_id '' = "my carrier" (the R1 lite rows); city_key a
 * CityKey slug or '*' (D68). COD fee = max(cod_fee_min_cents ?? 0, round(collected × cod_fee_bp / 10000)) + flat (OPS-25).
 */
export const carrierRates = mysqlTable(
  "carrier_rates",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    carrierAccountId: varchar("carrier_account_id", { length: 26 }).notNull().default(""),
    cityKey: varchar("city_key", { length: 40 }).notNull(),
    /** NULL = not typed by the owner (never invented) */
    deliveryFeeCents: cents("delivery_fee_cents"),
    returnFeeCents: cents("return_fee_cents"),
    codFeeBp: int("cod_fee_bp").notNull().default(0),
    codFeeMinCents: cents("cod_fee_min_cents"),
    codFeeFlatCents: cents("cod_fee_flat_cents").notNull().default(0),
    etaDays: tinyint("eta_days"),
    active: boolean("active").notNull().default(true),
    updatedBy: id26("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("cr_uq").on(t.storeId, t.carrierAccountId, t.cityKey), storeFk("carrier_rates", t.storeId)],
);

/** Ad spend per day (OPE-§2.7, moved from 0006): R1 rows are source = 'manual', campaign_id = ''. */
export const adSpendDaily = mysqlTable(
  "ad_spend_daily",
  {
    storeId: storeRef(),
    platform: mysqlEnum("platform", ["meta", "tiktok", "snap", "google", "other"]).notNull(),
    accountId: varchar("account_id", { length: 40 }).notNull().default(""),
    campaignId: varchar("campaign_id", { length: 64 }).notNull().default(""),
    day: date("day", { mode: "string" }).notNull(),
    campaignName: varchar("campaign_name", { length: 160 }),
    /** in the ad account's currency (accounting.adAccounts); converted with the owner's dated rate (OD56) */
    spendCents: cents("spend_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    source: mysqlEnum("source", ["manual", "csv", "api"]).notNull().default("manual"),
    importRunId: id26("import_run_id"),
    updatedBy: id26("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.platform, t.accountId, t.campaignId, t.day] }), storeFk("ad_spend_daily", t.storeId)],
);

// ai (ai.md AI-§M.1 and AI-§M.2 are the final lists)

/**
 * Detached AI jobs under the 120 s cap (D56, §H.12, AI-§B.13). aj_active_uq is on (store_id, input_hash, active),
 * not on status (rev 3, ENGP-3): `active` = '1' while queued / running and NULL in every terminal status (set in the
 * same statement), so finished rows never collide; a resubmission reuses the active row.
 */
export const aiJobs = mysqlTable(
  "ai_jobs",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    kind: mysqlEnum("kind", ["director_deep", "store_blueprint", "logo_system", "health_report"]).notNull(),
    /** the AiTaskId of the first stage */
    task: varchar("task", { length: 32 }).notNull(),
    status: mysqlEnum("status", ["queued", "running", "done", "failed", "cancelled"]).notNull().default("queued"),
    active: char("active", { length: 1 }),
    /** holds "batch:<stage>" for stage ids ≤ 18 chars */
    stage: varchar("stage", { length: 24 }),
    inputHash: char("input_hash", { length: 64 }).notNull(),
    /** the stage plan and per-stage state (stage-resumable jobs) */
    progress: jsonText<{ done: number; total: number; stages: Record<string, "done" | "running" | "failed">; plan: string[] }>("progress"),
    /** re-claims of the current stage (1 allowed); reset when a stage finishes */
    stageAttempts: tinyint("stage_attempts").notNull().default(0),
    /** which driver last advanced the job */
    driver: mysqlEnum("driver", ["after", "poll", "cron", "batch"]),
    leaseUntil: ts("lease_until"),
    heartbeatAt: ts("heartbeat_at"),
    attempts: tinyint("attempts").notNull().default(0),
    /** the class that served it (fallback = interactive) */
    class: mysqlEnum("class", ["director_deep", "director_interactive"]).notNull().default("director_deep"),
    model: varchar("model", { length: 64 }),
    effort: varchar("effort", { length: 8 }),
    /** pattern B or its C degradation */
    transport: mysqlEnum("transport", ["job", "batch"]).notNull().default("job"),
    /** ≤ 64 KB; the instant result is kept on failure */
    result: jsonText<{ runIds: string[]; outputRef?: string; instant?: unknown; critique?: CriticPicks }>("result"),
    error: varchar("error", { length: 200 }),
    costMicros: bigint("cost_micros", { mode: "number" }),
    reservedCredits: int("reserved_credits"),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    doneAt: ts("done_at"),
  },
  (t) => [
    index("aj_store_idx").on(t.storeId, t.status, t.createdAt),
    index("aj_orphan_idx").on(t.status, t.heartbeatAt),
    uniqueIndex("aj_active_uq").on(t.storeId, t.inputHash, t.active),
    storeFk("ai_jobs", t.storeId),
  ],
);

/** One row per AI call (AI-§M.1); `output` ≤ 64 KB, nulled after 90 days (§H.11). */
export const aiRuns = mysqlTable(
  "ai_runs",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    userId: id26("user_id"),
    task: varchar("task", { length: 32 }).notNull(),
    /** AiSurface */
    surface: varchar("surface", { length: 16 }).notNull().default("system"),
    provider: mysqlEnum("provider", ["server", "local", "library"]).notNull(),
    via: mysqlEnum("via", ["interactive", "stream", "batch", "cache", "report", "job"]).notNull(),
    /** core D55 */
    class: mysqlEnum("class", ["director_interactive", "director_deep", "worker", "fast"]),
    /** plan | critique | verify | copy | judge | blueprint | logo | report */
    stage: varchar("stage", { length: 16 }),
    /** ai_jobs.id for pattern B runs */
    jobId: id26("job_id"),
    requestedModel: varchar("requested_model", { length: 64 }),
    /** the serving model (response.model) */
    model: varchar("model", { length: 64 }),
    effort: varchar("effort", { length: 8 }),
    speed: mysqlEnum("speed", ["standard", "fast"]),
    promptVersion: varchar("prompt_version", { length: 32 }),
    rubricVersion: varchar("rubric_version", { length: 16 }),
    inputHash: char("input_hash", { length: 64 }).notNull(),
    locale: varchar("locale", { length: 5 }),
    status: mysqlEnum("status", ["running", "ok", "refused", "invalid_output", "max_tokens", "timeout", "error", "cancelled", "quota", "blocked"]).notNull(),
    errorCode: varchar("error_code", { length: 40 }),
    output: jsonText<unknown>("output"),
    rejectedFields: jsonText<string[]>("rejected_fields"),
    /** "end_turn" | "refusal:<category>" | … */
    stopReason: varchar("stop_reason", { length: 48 }),
    flags: jsonText<AiFlag[]>("flags"),
    ms: int("ms").notNull(),
    ttftMs: int("ttft_ms"),
    inTok: int("in_tok"),
    outTok: int("out_tok"),
    cacheReadTok: int("cache_read_tok"),
    cacheWriteTok: int("cache_write_tok"),
    costMicros: bigint("cost_micros", { mode: "number" }),
    credits: int("credits"),
    reservedCredits: int("reserved_credits"),
    reconciledAt: ts("reconciled_at"),
    batchItemId: id26("batch_item_id"),
    parentRunId: id26("parent_run_id"),
    /** e.g. "page" + pageId once the wizard's page exists (linkAiRuns) */
    refKind: varchar("ref_kind", { length: 24 }),
    refId: varchar("ref_id", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("air_store_idx").on(t.storeId, t.createdAt),
    index("air_task_idx").on(t.task, t.promptVersion, t.createdAt),
    index("air_store_task_idx").on(t.storeId, t.task, t.createdAt),
    index("air_open_idx").on(t.status, t.createdAt),
    index("air_ref_idx").on(t.storeId, t.refKind, t.refId),
    index("air_job_idx").on(t.storeId, t.jobId),
    storeFk("ai_runs", t.storeId),
  ],
);

export const aiCache = mysqlTable(
  "ai_cache",
  {
    storeId: storeRef(),
    task: varchar("task", { length: 32 }).notNull(),
    inputHash: char("input_hash", { length: 64 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    output: jsonText<unknown>("output").notNull(),
    bytes: int("bytes").notNull(),
    hits: int("hits").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.task, t.inputHash, t.promptVersion, t.model] }),
    index("aic_exp_idx").on(t.expiresAt),
    storeFk("ai_cache", t.storeId),
  ],
);

/** Brand memory (AI-§M.1). */
export const aiMemory = mysqlTable(
  "ai_memory",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    kind: mysqlEnum("kind", ["voice", "fact", "avoid", "prefer", "policy"]).notNull(),
    text: varchar("text", { length: 500 }).notNull(),
    /** NULL = every locale */
    locale: varchar("locale", { length: 5 }),
    evidence: jsonText<{ edits?: number; examples?: string[]; deleted?: true }>("evidence"),
    source: mysqlEnum("source", ["explicit", "learned"]).notNull().default("explicit"),
    active: boolean("active").notNull().default(true),
    pinned: boolean("pinned").notNull().default(false),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("aim_store_idx").on(t.storeId, t.active, t.source), storeFk("ai_memory", t.storeId)],
);

/** P: prompt versions and eval scores (AI-§M.1); `task` holds the family id; synced at boot (syncPromptVersions). */
export const promptVersions = mysqlTable(
  "prompt_versions",
  {
    task: varchar("task", { length: 32 }).notNull(),
    version: varchar("version", { length: 32 }).notNull(),
    provider: mysqlEnum("provider", ["server", "local"]).notNull(),
    templateHash: char("template_hash", { length: 64 }).notNull(),
    /** Director families only */
    rubricVersion: varchar("rubric_version", { length: 16 }),
    status: mysqlEnum("status", ["draft", "canary", "active", "retired"]).notNull().default("draft"),
    evalScore: jsonText<Record<string, number>>("eval_score"),
    /** the eval report is the run row */
    evalRunId: id26("eval_run_id"),
    /** the frozen baseline it was gated against (AI-D27) */
    baselineVersion: varchar("baseline_version", { length: 32 }),
    /** the computed canary slice (5,000 / 2,000 / 500 bp by the family's 7-day volume), rewritten hourly by ai.rollups */
    canaryBp: smallint("canary_bp").notNull().default(0),
    canaryStartedAt: ts("canary_started_at"),
    /** generations served by the canary so far */
    canaryRuns: int("canary_runs").notNull().default(0),
    rolledBackAt: ts("rolled_back_at"),
    rollbackReason: varchar("rollback_reason", { length: 120 }),
    notes: varchar("notes", { length: 300 }),
    activatedAt: ts("activated_at"),
    activatedBy: id26("activated_by"),
    createdBy: id26("created_by"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.task, t.version] }), index("pv_status_idx").on(t.status, t.canaryStartedAt)],
);

/** P: the Message Batches collector (AI-§M.2, moved from 0006). */
export const aiBatches = mysqlTable(
  "ai_batches",
  {
    id: id26().primaryKey(),
    providerBatchId: varchar("provider_batch_id", { length: 64 }),
    kind: mysqlEnum("kind", ["eval", "seo", "alt", "translate", "describe", "distill", "insights", "health", "exemplars", "screen", "deep", "mixed"]).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["building", "submitted", "in_progress", "canceling", "ended", "failed", "expired"]).notNull().default("building"),
    items: int("items").notNull().default(0),
    succeeded: int("succeeded").notNull().default(0),
    errored: int("errored").notNull().default(0),
    expired: int("expired").notNull().default(0),
    canceled: int("canceled").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    ingestedItems: int("ingested_items").notNull().default(0),
    submittedAt: ts("submitted_at"),
    endedAt: ts("ended_at"),
    ingestedAt: ts("ingested_at"),
    error: varchar("error", { length: 200 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ab_provider_uq").on(t.providerBatchId), index("ab_status_idx").on(t.status, t.createdAt)],
);

/** P (opt. store): the batch item queue (AI-§M.2); NULL store = a platform eval item. */
export const aiBatchItems = mysqlTable(
  "ai_batch_items",
  {
    id: id26().primaryKey(),
    storeId: storeRefOpt(),
    batchId: id26("batch_id"),
    task: varchar("task", { length: 32 }).notNull(),
    refKind: varchar("ref_kind", { length: 24 }).notNull(),
    refId: varchar("ref_id", { length: 64 }).notNull(),
    /** NULL once ingested or dropped */
    dedupe: char("dedupe", { length: 64 }),
    /** the task input (classes a/b only, AI-§E.1) */
    payload: longtext("payload").notNull(),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    state: mysqlEnum("state", ["queued", "submitted", "succeeded", "errored", "refused", "expired", "canceled", "ingested", "dropped"]).notNull().default("queued"),
    attempts: tinyint("attempts").notNull().default(0),
    reservedCredits: int("reserved_credits").notNull().default(0),
    runId: id26("run_id"),
    evalRunId: id26("eval_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("abi_dedupe_uq").on(t.dedupe),
    index("abi_state_idx").on(t.state, t.createdAt),
    index("abi_batch_idx").on(t.batchId),
    index("abi_store_idx").on(t.storeId, t.state),
    storeFk("ai_batch_items", t.storeId),
  ],
);

/** P: eval gate runs (AI-§M.2, AI-§F). */
export const aiEvalRuns = mysqlTable(
  "ai_eval_runs",
  {
    id: id26().primaryKey(),
    /** smoke = the 20-case interactive live run (ENGP-30); preference = the paired blind Director test */
    kind: mysqlEnum("kind", ["offline", "smoke", "live", "calibration", "preference"]).notNull(),
    /** the family */
    task: varchar("task", { length: 32 }).notNull(),
    model: varchar("model", { length: 64 }),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    rubricVersion: varchar("rubric_version", { length: 16 }),
    fixturesHash: char("fixtures_hash", { length: 64 }).notNull(),
    baselineVersion: varchar("baseline_version", { length: 32 }),
    baselineRunId: id26("baseline_run_id"),
    /** never the model under test (AI-§F.5) */
    judgeModel: varchar("judge_model", { length: 64 }),
    judgeVersion: varchar("judge_version", { length: 32 }),
    judgeCostMicros: bigint("judge_cost_micros", { mode: "number" }).notNull().default(0),
    status: mysqlEnum("status", ["pending", "oracle", "running", "scoring", "done", "failed", "canceled"]).notNull().default("pending"),
    scores: jsonText<EvalScores>("scores"),
    pairwise: jsonText<PairwiseScores>("pairwise"),
    gate: jsonText<{ pass: boolean; verdict: "regression" | "no_change" | "improvement"; hard: string[]; soft: string[]; floor: number }>("gate"),
    passed: boolean("passed"),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    /** ≤ 256 KB: per-fixture raw + guarded outputs, judge reasons; nulled after 180 days */
    report: longtext("report"),
    /** infra failures (the errors.jsonl sidecar count), never scored as 0 */
    errors: int("errors").notNull().default(0),
    startedBy: id26("started_by"),
    createdAt: createdAt(),
    doneAt: ts("done_at"),
  },
  (t) => [index("aer_task_idx").on(t.task, t.promptVersion, t.createdAt)],
);

/** T: AI usage rolled up hourly (AI-§M.2); read cross-store only by src/lib/ai/platform/** (D64). */
export const aiUsageDaily = mysqlTable(
  "ai_usage_daily",
  {
    storeId: storeRef(),
    /** store timezone */
    day: date("day", { mode: "string" }).notNull(),
    task: varchar("task", { length: 32 }).notNull(),
    provider: mysqlEnum("provider", ["server", "local", "library"]).notNull(),
    model: varchar("model", { length: 64 }).notNull().default(""),
    runs: int("runs").notNull().default(0),
    ok: int("ok").notNull().default(0),
    refused: int("refused").notNull().default(0),
    fallbacks: int("fallbacks").notNull().default(0),
    invalid: int("invalid").notNull().default(0),
    errors: int("errors").notNull().default(0),
    cacheHits: int("cache_hits").notNull().default(0),
    rejectedFields: int("rejected_fields").notNull().default(0),
    inTok: bigint("in_tok", { mode: "number" }).notNull().default(0),
    outTok: bigint("out_tok", { mode: "number" }).notNull().default(0),
    cacheReadTok: bigint("cache_read_tok", { mode: "number" }).notNull().default(0),
    cacheWriteTok: bigint("cache_write_tok", { mode: "number" }).notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    credits: int("credits").notNull().default(0),
    msSum: bigint("ms_sum", { mode: "number" }).notNull().default(0),
    /** 12 log buckets, for p50 / p95 */
    msHist: jsonText<number[]>("ms_hist"),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.day, t.task, t.provider, t.model] }),
    // cross-store rollup reads of src/lib/ai/platform/** (D64)
    index("aud_day_idx").on(t.day),
    storeFk("ai_usage_daily", t.storeId),
  ],
);

// design (design.md DES-§2.1 and DES-§2.2 are the final lists)

/**
 * Genomes and the distance service (DG-05, DES-§2.1). `first_published_at` copies pages.first_published_at on the
 * `published` row (a cache: the page column wins). Retention by design.retention; ≤ 600 rows per store.
 */
export const designGenomes = mysqlTable(
  "design_genomes",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    pageId: id26("page_id"),
    versionId: id26("version_id"),
    kind: mysqlEnum("kind", ["brand", "page"]).notNull(),
    source: mysqlEnum("source", ["generated", "chosen", "published", "derived", "theme"]).notNull(),
    /** nicheKey(), DES-§7.3 */
    niche: varchar("niche", { length: 64 }).notNull(),
    /** "niche|grammar|colorStrategy" pre-filter (R-D36) */
    bucket: varchar("bucket", { length: 96 }).notNull(),
    /** DesignGenome schema version */
    genomeV: tinyint("genome_v").notNull().default(1),
    /** packed DistanceView, DES-§7.1 (≤ 400 B) */
    vec: jsonText<number[]>("vec").notNull(),
    genome: jsonText<GenomeCompact>("genome").notNull(),
    /** sampling seed (restore, DG-12) */
    seed: int("seed").notNull(),
    /** priors snapshot id the sample used (QUAL-26) */
    priorsV: varchar("priors_v", { length: 24 }).notNull().default("p1"),
    firstPublishedAt: ts("first_published_at"),
    /** gate summary at the time of the row */
    q: tinyint("q"),
    slop: tinyint("slop"),
    report: jsonText<GateSummary>("report"),
    novelty: jsonText<NoveltyBands>("novelty"),
    live: boolean("live").notNull().default(false),
    /** live OR reserved_until > now (DES-§7.5) */
    pool: boolean("pool").notNull().default(false),
    reservedUntil: ts("reserved_until"),
    createdAt: createdAt(),
    /** the pool cache watermark */
    updatedAt: updatedAt(),
  },
  (t) => [
    index("dg_bucket_idx").on(t.bucket, t.live),
    index("dg_store_idx").on(t.storeId, t.pageId),
    index("dg_niche_idx").on(t.niche, t.live),
    index("dg_pool_idx").on(t.pool, t.updatedAt),
    index("dg_store_kind_idx").on(t.storeId, t.kind, t.createdAt),
    index("dg_version_idx").on(t.storeId, t.versionId),
    storeFk("design_genomes", t.storeId),
  ],
);

/**
 * P, cross-tenant MinHash with no store id (R-D37, D35, DES-§2.2): per (niche_key, owner_tag) the bottom 256 hashes of
 * the store's live titles and leads; owner_tag = hmac(storeId, "shingle-owner")[:16], never returned by any API.
 */
export const headlineShingles = mysqlTable(
  "headline_shingles",
  {
    nicheKey: varchar("niche_key", { length: 64 }).notNull(),
    hash: char("hash", { length: 16 }).notNull(),
    ownerTag: char("owner_tag", { length: 16 }).notNull(),
    createdAt: createdAt(),
    /** titles and leads are sketched together, weighed apart (DES-§9.6) */
    kind: mysqlEnum("kind", ["title", "lead"]).notNull().default("title"),
  },
  (t) => [
    primaryKey({ columns: [t.nicheKey, t.hash, t.ownerTag] }),
    index("hs_owner_idx").on(t.ownerTag),
    index("hs_niche_owner_idx").on(t.nicheKey, t.ownerTag),
  ],
);

// platform / ops (core, §H)

/** One row per job run (§H.2); deleted after 14 days. */
export const jobRuns = mysqlTable(
  "job_runs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    job: varchar("job", { length: 48 }).notNull(),
    storeId: storeRefOpt(),
    tickId: char("tick_id", { length: 26 }),
    startedAt: ts("started_at").notNull(),
    ms: int("ms").notNull(),
    ok: boolean("ok").notNull(),
    processed: int("processed").notNull().default(0),
    summary: jsonText<Record<string, unknown>>("summary"),
    errorCode: varchar("error_code", { length: 64 }),
  },
  (t) => [
    index("jr_job_idx").on(t.job, t.startedAt),
    index("jr_started_idx").on(t.startedAt),
    index("jr_store_idx").on(t.storeId, t.startedAt),
    storeFk("job_runs", t.storeId),
  ],
);

/**
 * Round-robin cursors of the per-store jobs (§H.2). rev 5 (CRIT2-18): the row job = 'tick', seeded by 0005 with
 * INSERT IGNORE, is the tick lease: cursor = the running tickId or '', updated_at = the lease time.
 */
export const cronCursors = mysqlTable("cron_cursors", {
  job: varchar("job", { length: 48 }).primaryKey(),
  cursor: varchar("cursor", { length: 64 }).notNull().default(""),
  state: jsonText<Record<string, unknown>>("state"),
  updatedAt: updatedAt(),
});

/** The error ring (§H.5): recordError buffers and flushes upserts on the dedupe key. */
export const errorEvents = mysqlTable(
  "error_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    /** sha256(bucket|area|code|route|storeId) */
    dedupe: char("dedupe", { length: 64 }).notNull(),
    /** "YYYY-MM-DDTHH" (UTC) */
    bucket: char("bucket", { length: 13 }).notNull(),
    area: varchar("area", { length: 32 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    route: varchar("route", { length: 120 }),
    storeId: storeRefOpt(),
    count: int("count").notNull().default(1),
    firstAt: ts("first_at").notNull(),
    lastAt: ts("last_at").notNull(),
    /** redacted: errorSummary only */
    sample: jsonText<Record<string, unknown>>("sample"),
  },
  (t) => [
    uniqueIndex("ee_dedupe_uq").on(t.dedupe),
    index("ee_bucket_idx").on(t.bucket),
    index("ee_store_idx").on(t.storeId, t.lastAt),
    storeFk("error_events", t.storeId),
  ],
);

/** Async deliveries (§H.1, R-D25): claimed by lease (no SKIP LOCKED on 10.4); `push` is appended in 0007. */
export const outbox = mysqlTable(
  "outbox",
  {
    id: id26().primaryKey(),
    storeId: storeRefOpt(),
    kind: mysqlEnum("kind", ["webhook", "capi", "telegram", "whatsapp", "mail", "carrier"]).notNull(),
    /** "order.created", "Purchase", "ConfirmedOrder", "new_order"… */
    topic: varchar("topic", { length: 48 }).notNull(),
    /** endpoint id, "meta:<pixelId>", adapter id, chat id hash */
    targetId: varchar("target_id", { length: 64 }),
    /** e.g. "capi:meta:<pixel>:<orderId>:Purchase"; unique across every state (a deliberate resend appends :r<n>) */
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    payload: longtext("payload").notNull(),
    /** envelope v2 when it carries PII */
    encrypted: boolean("encrypted").notNull().default(false),
    state: mysqlEnum("state", ["pending", "running", "done", "dead", "cancelled"]).notNull().default("pending"),
    attempts: tinyint("attempts").notNull().default(0),
    nextAt: ts("next_at").notNull().default(now3),
    leaseUntil: ts("lease_until"),
    claim: char("claim", { length: 26 }),
    lastStatus: int("last_status"),
    lastError: varchar("last_error", { length: 300 }),
    lastMs: int("last_ms"),
    createdAt: createdAt(),
    doneAt: ts("done_at"),
  },
  (t) => [
    uniqueIndex("ob_dedupe_uq").on(t.dedupeKey),
    index("ob_due_idx").on(t.state, t.nextAt),
    index("ob_store_idx").on(t.storeId, t.state, t.nextAt),
    index("ob_claim_idx").on(t.claim),
    storeFk("outbox", t.storeId),
  ],
);

/**
 * The render queue (§H.3, D25). `dedupe` = page_id while PENDING only: the claim UPDATE sets it NULL, so one pending
 * job may queue behind a running one (rev 3, ENGC-4); one pending job per page across every reason (CRIT2-17).
 */
export const renderJobs = mysqlTable(
  "render_jobs",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    pageId: id26("page_id").notNull(),
    /** the §H.3 reasons; `reviews` is appended in 0007; `cutout` = UX-39 / DES-R22 */
    reason: mysqlEnum("reason", ["address", "theme", "brand", "product", "republish", "runtime", "experiment", "store_info", "conversions", "cutout"]).notNull(),
    priority: tinyint("priority").notNull().default(5),
    dedupe: varchar("dedupe", { length: 40 }),
    state: mysqlEnum("state", ["pending", "running", "done", "failed", "skipped"]).notNull().default("pending"),
    attempts: tinyint("attempts").notNull().default(0),
    notBefore: ts("not_before").notNull().default(now3),
    leaseUntil: ts("lease_until"),
    claim: char("claim", { length: 26 }),
    error: varchar("error", { length: 200 }),
    createdAt: createdAt(),
    doneAt: ts("done_at"),
  },
  (t) => [
    uniqueIndex("rj_dedupe_uq").on(t.dedupe),
    index("rj_due_idx").on(t.state, t.priority, t.notBefore),
    index("rj_store_idx").on(t.storeId, t.state),
    storeFk("render_jobs", t.storeId),
  ],
);

/** The store export ZIP (§F.9). */
export const exportJobs = mysqlTable(
  "export_jobs",
  {
    id: id26().primaryKey(),
    storeId: storeRef(),
    kind: mysqlEnum("kind", ["store_export"]).notNull().default("store_export"),
    requestedBy: id26("requested_by").notNull(),
    requestedAs: mysqlEnum("requested_as", ["member", "platform"]).notNull(),
    state: mysqlEnum("state", ["pending", "running", "ready", "failed", "expired"]).notNull().default("pending"),
    cursor: jsonText<Record<string, unknown>>("cursor"),
    parts: jsonText<{ name: string; bytes: number; sha256: string }[]>("parts"),
    bytes: bigint("bytes", { mode: "number" }),
    expiresAt: ts("expires_at"),
    error: varchar("error", { length: 200 }),
    createdAt: createdAt(),
    doneAt: ts("done_at"),
  },
  (t) => [index("ej_store_idx").on(t.storeId, t.createdAt), index("ej_state_idx").on(t.state, t.createdAt), storeFk("export_jobs", t.storeId)],
);

/** P: logical backups (§H.6): 7 daily + 4 weekly. */
export const backupRuns = mysqlTable(
  "backup_runs",
  {
    id: id26().primaryKey(),
    kind: mysqlEnum("kind", ["daily", "weekly"]).notNull(),
    day: date("day", { mode: "string" }).notNull(),
    state: mysqlEnum("state", ["running", "done", "failed", "pruned"]).notNull(),
    /** table + last primary key */
    cursor: jsonText<Record<string, unknown>>("cursor"),
    manifest: jsonText<BackupManifest>("manifest"),
    bytes: bigint("bytes", { mode: "number" }),
    startedAt: ts("started_at").notNull(),
    doneAt: ts("done_at"),
    error: varchar("error", { length: 200 }),
  },
  (t) => [uniqueIndex("br_kind_day_uq").on(t.kind, t.day)],
);
