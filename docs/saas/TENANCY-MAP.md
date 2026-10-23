# Store Gen tenancy map

Reference for the architect writing `docs/STORE-SAAS.md` and for every build agent after that. It merges 8 subsystem maps
(data layer, auth/security, public serving, commerce, media, design generation, landing builder, admin shell/QA). The
claims marked as verified below were checked against the code at commit `bbd4b7f` (2026-10-23). Paths are relative to
the repo root, and `path:line` refers to that commit.

Legend. Severity **B** = blocker (a cross-tenant read or write, or it cannot work with two stores). **M** = major (wrong
behaviour, config that must become per-store, or weaker isolation). **m** = minor. Level **P** = platform, **S** = store.
Item IDs (`DB-04`, `ORD-05` …) are stable so later docs can cite them.

The user's added requirement (STORE-GEN-BRIEF §7) runs through the whole document. Each tenant chooses what it runs: a
**full store**, **standalone COD landing pages**, or **both**. Landing pages stay first-class: they keep every feature
listed in §8.3 and gain more (§9.2).

---

## 0. Verification log and corrections

**Database state** (read-only check, 2026-10-23, local MariaDB 10.4.32):
- `cod_storegen`, the database `.env.local` points to, has **0 tables**. `storegen_smoke` also has 0 tables.
- `cod_studio` (COD Studio's database, never touch it) has 17 tables: 1 user, 2 assets, 0 pages, 0 orders.
- Production `u641677794_storegen` has never booted the app (HANDOFF §6: the first deploy is still pending).
- **So no Store Gen database holds data.** The data-layer map's claim that `cod_storegen` holds cloned COD Studio data is
  wrong.
- Consequences:
  - `0004_tenancy` needs no real backfill. It can create `store_id NOT NULL` columns, composite uniques and new PKs at
    zero cost: on empty tables, no rebuild and no 3 GB headroom problem.
  - Keep the migration guarded and idempotent anyway (§2.4), so a later import of a COD Studio dump stays possible.
  - Store #1 is created by the platform bootstrap (§5.3 AUTH-13), not migrated from legacy rows.
  - **No legacy public URLs need preserving.** The root `/<slug>` URLs and baked HTML that the public-serving and commerce
    maps worried about exist only on COD Studio (myrizq.shop), never on Store Gen.

**Corrected line references:**
- `src/lib/admin-data/pages.ts` (347 lines): homePageId 60-65, listPages 67-146, pageOptions 148-155, pageCounts 157-162,
  uniqueSlug 182-192, getPageRow 199-202, createPageFromDoc 216-250, duplicatePage 252, unpublishPage 266-283 (clears the
  home page at 280-282), archivePage 285, restoreArchivedPage 297, deletePage 308-320, setHomePage 323-336. The
  cross-store write is at **329**. The admin-shell map's numbers 109-385 are wrong.
- `src/lib/pixels/migrate.server.ts` is 129 lines: libraryMigrated 54-57, migratePixelLibrary 60-129. The commerce map's
  320-389 is wrong.
- `src/lib/pixels/usage.server.ts` is 168 lines: cache 38-41, pixelUsage 96-100, livePagePixels 132, recentPagesWithPixels
  154. The commerce map's 224-260 is wrong.
- `src/lib/sheets/config.ts` is 66 lines: getSheetsConfig 18, activeSheet 32, saveSheetsConfig 37, setSheetsEnabled 57,
  disconnectSheet 64.
- **There is no `media.read` permission.** Media GET routes check `pages.read` (`src/app/api/admin/media/route.ts:82`,
  `[id]/route.ts:66`); writes check `media.write`.

**Verified verbatim:**
- `setHomePage` runs `UPDATE pages SET is_home=false WHERE is_home=true` over all rows (`admin-data/pages.ts:329`).
- `pullStatuses` updates `orders` by ids read from the sheet, with no owner filter (`sheets/sync.ts:333-337`). Its rate
  bucket `sheets:pull` is a singleton (313), and the lock `cod:sheets-sync` is global (47).
- The per-phone limit (`orders/create.ts:200-212`) and the risk history (224-234) span every order. The blocklist lookup
  is global (156-166).
- Upload dedup: `id = sha256(masterWebp)[:32]`, then `getAsset(id)` returns any existing row (`media/process.ts:309-311`).
- Settings cache `Map<SettingKey,…>` and encryption purpose `settings:<key>` (`settings/index.ts:29-33`).
- Render cache: 64 published / 48 legal entries keyed by bare slug, and `invalidatePublished()` clears everything
  (`render/cache.server.ts:24-59`).
- `PageTarget` has no store (`orders/resolve.ts:20-30`), and `lookup()` uses `public_key` only (104-146).
- `serverCredentials` is keyed by pixel id (`orders/conversions-core.ts:242-257`).
- `loadVersion(versionId)` has no ownership check (`export/server.ts:71-95`). The PHP export embeds the global sheet and the
  optional platform export key (364-392).
- The preview route loads by id (`admin/preview/[id]/route.ts:39-47`).
- `changeGuardingOwners` locks every `users` row `FOR UPDATE` (`auth/users.ts:226-236`).

**Size of the scoping job:**
- About **225 single-line Drizzle query sites** on tenant/auth tables in 41 files (grep `.from/.update/.insert/.delete/
  join(<table>)`). Raw SQL comes on top (stats, usage, boot tasks).
- 6 files under `src/app` query tables directly: `(editor)/pages/[id]/edit/page.tsx`, `generate/actions.ts`,
  `settings/pixels/actions.ts`, `preview/[id]/route.ts`, `api/admin/media/[id]/route.ts`, `api/public/upsell/route.ts`.
- About 130 `'/admin…'` string literals in 45 files, 31 `revalidatePath` calls, and 11 `/api/admin` literals in
  `src/components`.

---

## 1. Executive summary

### 1.1 Single-tenancy today

- **One schema, no tenant column.**
  - 16 tables (`src/lib/db/schema.ts`). No `store_id` and no foreign keys anywhere.
  - Global uniques: `users_email_uq`, `pages_slug_uq`, `pages_key_uq`, `orders_idem_uq`, `leads_idem_uq`,
    `block_uq(kind,value)`, `exports_key_uq`, `settings` PK(`key`).
  - `assets.id` is a content hash, so identical uploads from any two owners collapse into one row.
- **One store identity.** `settings` holds one row per key: `store`, `defaults`, `sheets`, `pixels` (legacy),
  `pixel_library`, `pixel_health`, `tracking_secrets`, `ai`, `turnstile`, `home`, plus the `doc_schema` marker. They are
  cached per process by key only.
- **One hidden admin.**
  - The proxy hides `/admin/**` and `/api/admin/**` behind the secret `ADMIN_GATE` cookie (`src/proxy.ts:82-122`).
  - `requireUser()` re-checks the gate and the single global `users.role` (owner/editor/agent).
  - `adminAction` / `adminGuard` pass only `{user, actor}`. There is no store anywhere in the request context.
- **One public namespace.**
  - `/` = the single home (`src/app/route.ts`).
  - `/<slug>`, `/<slug>/merci` and `/legal/<kind>?p=<slug>` resolve by global slug.
  - Published HTML bakes in `PUBLIC_URL`, root-relative links and the global store identity.
- **One integration set:**
  - one connected Google Sheet;
  - one service account (`GOOGLE_SA_JSON_B64`);
  - one export key (`GOOGLE_EXPORT_SA_JSON_B64`);
  - one Turnstile key;
  - one pixel library and CAPI token map keyed by pixel id;
  - one time zone (`APP_TIMEZONE`);
  - one DB quota (`DB_QUOTA_MB`).
- **One product shape.**
  - Every document is a single-product COD landing `PageDoc` with a required order form
    (`landing/sections/orderForm/index.tsx:300`, `page/validate.ts:342-379`).
  - There is no catalog, collection, storefront, navigation or cart.

### 1.2 The 10 biggest changes

1. **Tenant model.**
   - Add `stores` (handle, name, `mode` store/landing/both, status, timezone, quotas), `store_members` (role per store),
     `store_invites` and `store_settings`.
   - Add `store_id NOT NULL` with no default, plus FK `RESTRICT`, on pages, page_versions, assets, media_files, orders,
     leads, blocklist, exports, stats_daily and audit_log (nullable on audit_log).
   - Swap the global uniques for `(store_id, …)` (§2).
2. **One store-scope seam.**
   - Add `requireStoreMember({store, permission, feature})`, returning `{user, store, membership}`.
   - Add `storeAction` / `storeGuard`, replacing `adminAction` (`admin-data/action.ts:27-49`) and `adminGuard`
     (`orders/http.ts:164-174`).
   - Every data function takes `scope` first. Every by-id read or write adds `AND store_id = ?`, and 0 rows means
     not found.
3. **Settings split.**
   - `store_settings(store_id, key)` for all 10 registry keys. `settings` keeps platform rows only.
   - The cache key becomes `${storeId}:${key}` and the encryption purpose `settings:${storeId}:${key}`.
4. **Auth split.**
   - `ADMIN_GATE` + IP allowlist + `ADMIN_HOST` guard only a **platform console**.
   - Tenants get public `/login`, `/signup` and `/invite/<token>`, with scrypt concurrency limits and Turnstile.
   - Roles move to `store_members`. Password, 2FA and ban become platform-only operations.
   - Invites are hashed, expiring, one-time link tokens, never temporary passwords.
5. **Path addressing.**
   - Public store pages live under a fixed prefix `/s/<handle>/…`. A bare `/<store>/<slug>` collides with
     `/[slug]/merci`.
   - The tenant dashboard gets its own root (recommended: `/app/<handle>/…`).
   - The platform `/` becomes marketing/signup.
   - Every URL builder (publish, links, canonical, CAPI, admin "view live") goes through one `storeUrl(store, path)`.
6. **Public writes carry the store.**
   - `PageTarget.storeId` comes from `pages.store_id` / `exports.store_id` via the random global `pageKey`. Suspended
     stores are refused.
   - Blocklist, per-phone limit, risk history, rate buckets, stats and CAPI are all scoped by that store id, never by a
     client value.
7. **Every process-global cache, lock and rate bucket is store-qualified** (§7.5, §7.6). That covers the settings, render,
   pixel-usage, pixel-health and sheets-sync state, the sheets lock and `sheets:pull`. Otherwise one store's data is served
   to another.
8. **Per-store integrations.**
   - Sheets: prove spreadsheet ownership before connecting (the platform service account is shared with every tenant's
     sheet), and loop over stores in the cron.
   - Pull updates are scoped by store.
   - CAPI/Events tokens keyed `(store, pixel)`.
   - The PHP export never embeds a platform key.
   - Turnstile: platform default plus optional per-store keys.
9. **Media ownership and storage.**
   - Per-store asset rows (recommended: `assets.store_id` plus store-derived HMAC ids, no cross-store dedup).
   - Per-store byte quotas charged atomically.
   - An `asset_refs` index instead of LIKE scans.
   - A durable filesystem backend outside the deploy-wiped folder before onboarding many stores (DB quota is 3 GB).
10. **Store mode, page kinds and catalog, with landing pages kept first-class.**
    - `stores.mode` gates navigation and features.
    - `pages.kind` (landing / home / product / collection / policy / custom).
    - A `products` / `collections` catalog reusing the Offers v2 `Item` / `Offer` schema and the pricing engine
      unchanged.
    - Store pages get a `StoreRenderContext` and new section types.
    - The landing `PageDoc` v2, runtime config v2, order payload v2 and the PHP export contracts are **frozen**. Store
      features add new kinds and an order payload v3.

Cross-cutting: a **tenancy test gate** that fails the build. It has three parts: a static lint for unscoped queries and
caches, a DB-backed two-store attack suite and an e2e replay of server actions (§10).

---

## 2. Table inventory

### 2.1 Existing tables

| Table | Lookup keys today | PK / global unique | Tenancy change | Level |
|---|---|---|---|---|
| `users` (schema.ts:63-82) | id, email | PK id; `users_email_uq(email)` | Keep global (platform identity). `role` becomes legacy and the role moves to `store_members.role`. Add `platform_role enum('admin','user') DEFAULT 'user'` (or a `platform_admins` table). `disabled` = platform ban only. Drop or enforce the unread `failed_logins` / `locked_until` (login.ts:58-63). | P |
| `sessions` (84-99) | id = sha256(token), user_id | PK id; idx user, expires | Keep platform-level. Optional `last_store_id` (redirect hint only). Only if the "store in session" URL option is chosen: `active_store_id` plus a per-request echo check. | P |
| `pages` (105-123) | id, slug, public_key, is_home, status | PK id; **`pages_slug_uq(slug)`**; `pages_key_uq(public_key)` | `store_id NOT NULL`. `UNIQUE(store_id, slug)` replaces `pages_slug_uq`. Keep `pages_key_uq` global (the public resolver). Move home to `stores.home_page_id` and drop `is_home` (or scope it). Add `kind enum('landing','home','product','collection','policy','custom') DEFAULT 'landing'` and nullable `product_id`. Index `(store_id, status, updated_at)`. | S |
| `page_versions` (125-148) | id, (page_id, created_at) | PK id | Add a denormalised `store_id NOT NULL` (free on empty tables) for cheap `id AND store_id` guards and per-store retention. Index `(store_id, created_at)`. Full HTML is stored per publish (600-900 KB raw), so per-store version retention is needed. | S |
| `assets` (162-188) | id (content hash), created_at, source_asset_id, LIKE on name/tags | PK id = sha256(master)[:32] | **Option A (recommended):** `store_id NOT NULL` (a sentinel value for platform stock assets); new ids `HMAC(HKDF(APP_SECRET,'media-id:'+storeId), masterBytes)[:32]`; indexes `(store_id, created_at, id)`, `(store_id, kind, alpha)`, `(store_id, source_asset_id)`; add `stored_bytes`. **Option B (data-layer map):** keep a global blob row plus `store_assets(store_id, asset_id, original_name, tags, created_by, created_at, PK(store_id,asset_id))` with refcounted GC. B keeps cross-store dedup but also keeps the existence/timing oracle, URL correlation and refcount complexity. | S |
| `media_files` (190-202) | key `<assetId>-<w>.<fmt>`, asset_id | PK key | Add denormalised `store_id` (lets the public route refuse suspended stores) and `storage enum('db','fs')`. Index `(store_id)`. Keys stay globally unique by construction. | S |
| `media_chunks` (204-212) | (key, idx) | PK(key, idx) | No change. Drains to empty once the filesystem backend exists. | — |
| `orders` (263-312) | id, idem, phone, page_id, status, sheet_status, ip_hash | PK id `CMD-XXXXXX` (global, about 2^30); `orders_idem_uq(idem)` | `store_id NOT NULL`. `page_id` becomes nullable (cart orders). Add `channel enum('landing','store','export','php')`, or add `'store'` to `source`. Add `lines` (OrderItems v3) for carts. Indexes `(store_id, created_at)`, `(store_id, status)`, `(store_id, sheet_status)`, `(store_id, phone, created_at)`, `(store_id, ip_hash, created_at)`. Recommended: keep `idem` globally unique (a client UUID; replay checks pageId at create.ts:97-99) so the regex at create.ts:298 survives. Optional per-store display prefix. | S |
| `leads` (314-331) | idem, (page_id, created_at), phone | PK id; `leads_idem_uq(idem)` | `store_id NOT NULL`. Index `(store_id, created_at)`. `page_id` nullable for cart abandonment. `idem` as for orders. | S |
| `blocklist` (333-345) | (kind, value) | PK id; **`block_uq(kind,value)`** | `store_id NOT NULL`. `UNIQUE(store_id, kind, value)`. A platform-wide list, if ever wanted, goes in a separate table and is an explicit policy. | S |
| `exports` (347-364) | public_key, page_id, id | PK id; `exports_key_uq(public_key)` | `store_id NOT NULL`. Index `(store_id, created_at)`. The key stays global (resolver). | S |
| `settings` (370-376) | key | PK key | Platform rows only: `doc_schema`, `tenancy_v1` marker, platform defaults. All store keys move to `store_settings`. | P |
| `rate_limits` (378-382) | bucket(191) | PK bucket | No schema change. Naming convention `p:…` (platform) and `s:<storeId>:…` (store), see §7.6. | P |
| `audit_log` (384-396) | id keyset, user_id, action LIKE | PK autoinc; idx created_at | Nullable `store_id` (NULL = platform/auth event). Index `(store_id, id)`. `audit()` takes `{storeId}`. Tenants see only their store's rows. | S/P |
| `stats_daily` (398-410) | (page_id, day) | PK(page_id, day) | `store_id NOT NULL`. Index `(store_id, day)`. Store pages are `pages` rows, so `page_id` already works as a surface id. Day buckets use the store's time zone. | S |
| `stats_visitors` (413-421) | (page_id, day, vid_hash) | PK all three | No change (global ULID page ids, purged after 2 days). | — |
| `__drizzle_migrations` | created_at | — | Unchanged. | P |

### 2.2 New tables (recommended shapes)

| Table | Columns / keys | Notes |
|---|---|---|
| `stores` | `id` ULID PK, `handle varchar(40) UNIQUE`, `name`, `mode enum('store','landing','both') DEFAULT 'landing'`, `status enum('active','suspended','closed')`, `timezone`, `market`, `currency`, `order_prefix`, `home_page_id`, `media_quota_bytes`, `media_used_bytes`, `plan`, `created_by`, `created_at`, `updated_at` | `mode` is the user's choice at onboarding and can change later (§11.2 Q). The handle obeys the reserved list in §6.3. |
| `store_members` | `store_id`, `user_id`, `role enum('owner','admin','editor','agent')`, `status enum('active','suspended')`, `invited_by`, `created_at`; PK(store_id, user_id), KEY(user_id) | Rule: at least one active owner per store. Lock only that store's member rows when changing roles. |
| `store_invites` | `id`, `store_id`, `email_norm`, `role`, `token_hash char(64) UNIQUE`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at`, `created_at`; KEY(store_id) | 256-bit token, stored as sha256, shown once, single use, about 7 days. The role can't exceed the inviter's. |
| `store_settings` | `store_id`, `key varchar(64)`, `value longtext`, `encrypted bool`, `purpose_v tinyint DEFAULT 1`, `updated_at`; PK(store_id, key) | Secrets use purpose `settings:<storeId>:<key>`. `purpose_v` is kept for a possible legacy import. |
| `products` | `id`, `store_id`, `slug`, `status`, `name`, `doc` JSON `{product, items, offers}` (Offers v2 schema from `page/schema.ts`), `seo`, `position`, `created_*`, `updated_*`; UNIQUE(store_id, slug) | One source of truth for price/options. A landing page can reference `product_id` (§11.2 Q). |
| `collections`, `collection_products` | `collections(id, store_id, slug, name, description, media, rules, sort; UNIQUE(store_id, slug))`; `collection_products(collection_id, product_id, position, PK)` | — |
| `asset_refs` | `store_id`, `asset_id`, `owner_kind enum(page, page_version, product, collection, store_theme, brand_kit, settings)`, `owner_id`, `live`; KEY(store_id, asset_id) | Maintained on save and publish. Replaces the LIKE scans (admin-data/assets.ts:78-107). Also drives ownership validation and "Used in". |
| `store_domains` (later) | `host UNIQUE`, `store_id`, `verification_token`, `verified_at`, `is_primary` | Feeds host routing, CSP origins, checkOrigin and canonical URLs (§6.4). |
| `store_assets` (Option B only) | see §2.1 | — |

### 2.3 Integrity rules
- Use `NOT NULL` with **no DEFAULT** on every tenant `store_id`. A forgotten write must fail loudly instead of landing in
  some store.
- Add FKs `store_id → stores(id) ON DELETE RESTRICT` on tenant tables (InnoDB, MariaDB 10.4 is fine). Store deletion is a
  batched purge job, never a cascade.
- Never echo duplicate-key messages: composite keys put the store id and slug into the message.

### 2.4 Migration mechanics
- New `drizzle/0004_tenancy.sql` in the guarded style of 0002/0003: an `information_schema` check, then
  `PREPARE`/`EXECUTE`, portable to MySQL 8. MariaDB DDL commits implicitly, and drizzle's single transaction
  (`node_modules/drizzle-orm/mysql-core/dialect.js:43-56`) does not make it atomic.
- Journal `when` must be greater than `1792162674021`. Generate `meta/0004_snapshot.json` with drizzle-kit, then hand-write
  the SQL, as was done for 0002/0003.
- Migrations run under `GET_LOCK('<db>:migrations')` before serving (`instrumentation.ts:35-47`, `db/migrate.ts:35-82`).
- Boot tasks run under `withBootLock('<db>:cod_boot')`, writing the marker last.
- **Conditional store #1** (only when legacy rows exist; a no-op on today's empty DBs), all statements idempotent:
  1. Insert a store with a fixed ULID constant.
  2. `UPDATE … SET store_id=<const> WHERE store_id IS NULL` on every tenant table, using the constant rather than a join:
     orders, leads and exports outlive deleted pages.
  3. `INSERT IGNORE store_members` from `users`.
  4. `INSERT IGNORE store_settings … purpose_v=0` for the 10 registry keys.
  5. A boot task re-encrypts those rows under the store-bound purpose.
  6. Set `platform_role='admin'` for existing owners.
- The pixel-library boot migration (`pixels/migrate.server.ts:54-129`) must change in the same release. On a fresh DB it
  would write a global `pixel_library` marker. New stores start with an empty default library, so the migration only
  runs for an imported store #1.
- A read-only tenancy gate cloned from `db/upgrade-check.ts:212-249` / `scripts/qa/upgrade-dry-run.ts` counts rows with
  NULL `store_id` and cross-store references (order→page, export→version, asset_refs→asset of another store).

---

## 3. Settings-key inventory

| Key | Secret | Read / written at | Level | Change |
|---|---|---|---|---|
| `store` | no | `render/publish.server.ts:135-152` (storeInfo, baked into every publish and legal render), `:617-620` (direct `updated_at` read), `(panel)/layout.tsx:20-26`, `generate/page.tsx:20`, `admin-data/assets.ts:98,105` (logo usage), `api/admin/media/route.ts:182`, `editor/pages.server.ts:157-160` | S | Per-store row. `stores.name` is seeded from `storeName`. Becomes part of the brand kit (logo variants, wordmark). |
| `defaults` | no | Copied into new pages; `orders/actions.ts:76` (blockPhone), `sheets/connect/route.ts:49` (currency), `settings/pixels/actions.ts:315-329`, generator page | S | Per store. Add `timezone` (or `stores.timezone`, default `Africa/Casablanca`) and the order prefix. |
| `sheets` | no | `sheets/config.ts:18-66`, `sync.ts`, `dashboard.ts:90-115`, `export/server.ts:372` (PHP config) | S | Per store. `spreadsheetId` unique across stores plus an ownership proof at connect. |
| `pixels` | no | Read only by the pixel migration (`migrate.server.ts:77`) | S (legacy) | Drop. No legacy data exists. |
| `pixel_library` | no | `pixels/library.server.ts:71-78`; marker in `migrate.server.ts:54-57` | S | Per store. Its existence stops acting as a migration marker. |
| `pixel_health` | no | Direct writes `pixels/health.server.ts:37-45`, read `:90`; per-worker throttle map `:22` | S | Per store. Throttle key `${storeId}:${platform}:${id}`. |
| `tracking_secrets` | **yes** | `orders/conversions.ts:62-84`, `conversions-core.ts:230-257`, pixel actions | S | Per store, tokens keyed by pixel id within the store. Purpose bound to the store. |
| `ai` | no | `generate/page.tsx:20`, `media/page.tsx:17`, `use-remove-background.ts:20-34` | S or per-user | Store enable flag plus a per-user/device tier ceiling (the models run in the browser). |
| `turnstile` | **yes** | `publish.server.ts:161-164` (site key baked into HTML), `orders/turnstile.ts:49`, `anti-spam/page.tsx:11-14`; defaults from env `schemas.ts:231-234` | P default + S override | Platform key works for path addressing. Per-store keys are needed with custom domains (widgets are bound to hostnames). Tenants never see "from server env". |
| `home` | no | `admin-data/pages.ts:60-65,280-282,332`; `publish.server.ts:584-601`; `dashboard.ts:125,170-171` | S | Becomes `stores.home_page_id` / `{mode:'storefront'/'landing', pageId}`. Never fall back across stores. |
| `doc_schema` | no | Not in the registry; direct writes `db/boot-tasks.ts:22,27,43-46` | P | Stays a platform marker. |
| *(new)* `storefront` | no | — | S | Menus, store header/footer, store theme reference. |
| *(new)* `checkout` | no | — | S | Store-level FormConfig, shipping zones/fees, free threshold, cart rules. |
| *(new)* `brand` | no | — | S | Brand kit: accent/pop/neutral, fonts (manifest ids), voice, logo parameter JSON, locks. |
| *(new)* `policies` | no | — | S | Store policy facts (delivery, inspection, exchange, contact channels). They feed legal pages and the AI copy prompt (replacing `ai/prompts.ts:99-103`). |
| *(new)* `tenancy_v1`, signup mode, plan definitions | — | — | P | Platform settings table. |

API rule:
- `getSetting(scope, key)` / `setSetting(scope, key, …)` for S keys, and `getPlatformSetting(key)` for P keys.
- Use `invalidateSettings(storeId, key?)`. Audit rows carry `store_id`.
- Masking via `redactSetting` (`schemas.ts:263-275`) is unchanged.

---

## 4. Env-var inventory

| Var | Read at | Level | Change |
|---|---|---|---|
| `DATABASE_URL` | `db/url.ts:6`, `db/migrate.ts:37`, `db/boot-lock.ts:23`, `instrumentation.ts:29`, `scripts/media-backfill.ts:24`, `scripts/qa/pixels-publish-check.ts:33` | P | None. Hostinger also writes `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`; the code never reads them. |
| `APP_SECRET` | `security/crypto.ts:7`, `auth/config.ts:79,219` | P | Single root secret, **never changes**. Derive store-bound keys from it: HKDF info `store:<id>:<purpose>` or purpose strings that include the store id. Never rename the HKDF salt `'cod-studio'` (`crypto.ts:19`) or existing purpose strings in a brand sweep. |
| `ADMIN_GATE` | `auth/config.ts:85,225`; proxy | P | Hides the **platform console only**. Tenants never need it. |
| `SETUP_TOKEN` | `auth/config.ts:92,230` | P | Bootstraps the first platform admin only. Self-serve signup gets Turnstile plus rate limits. |
| `PUBLIC_URL` | `auth/config.ts:159,237`; `render/publish.server.ts:70`; `orders/conversions.ts:39`; `orders/origin.ts:102-104`; `render/core.ts:269`; `security/headers.ts:13` | P | Platform origin. Store URL = `PUBLIC_URL + /s/<handle>` now, and the store's primary domain later. |
| `ADMIN_HOST` | `auth/config.ts:180`; `auth/gate.ts:134-137` | P | Unusable on the temporary domain (no subdomains). Later it is the dashboard + console host, and tenant hosts must 404 dashboard paths. |
| `ADMIN_IP_ALLOWLIST` | `auth/config.ts:107`; `gate.ts:99-114` | P | Console only. A per-store allowlist, if wanted, is a store setting. |
| `TRUSTED_PROXY_HOPS` | `security/ip.ts:33` | P | None. Its diagnostics view (`admin-data/security.ts:166-174`) becomes platform-only. |
| `BEHIND_CLOUDFLARE` | `security/ip.ts:222`; `admin-data/security.ts:172` | P | Same as above. |
| `CRON_KEY` | `auth/config.ts:98,234`; `api/cron/tick/route.ts:44` (header `x-cron-key` **or `?key=` query**) | P | One cron for all stores. Consider dropping the query-string form (keys end up in access logs). The tenant checklist item (`dashboard.ts:179`) moves to the console. |
| `GOOGLE_SA_JSON_B64` | `sheets/client.ts:45`; `export/service-account.ts:54`; `settings/sheets/page.tsx:24`; `api/admin/sheets/status/route.ts:17` | P (shared identity) | One service account shared with every tenant's sheet, so connecting needs an ownership proof (§7.7). Tenants see only the SA email, never `envPresent`. Option: per-store service account or OAuth. |
| `GOOGLE_EXPORT_SA_JSON_B64` | `export/service-account.ts:52` | must not stay P | It would become Editor on every tenant's sheet, so one leaked ZIP exposes all of them. Use a per-store uploaded export key (encrypted, store-bound) or disable embedding for tenants. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | `settings/schemas.ts:232-233`; `anti-spam/page.tsx:14` | P default | Per-store override in `store_settings.turnstile`. |
| `APP_TIMEZONE` | `stats/index.ts:17` (`STATS_TZ`); `sheets/sync.ts:46` (`SHEET_TZ`) | becomes S | Per-store `timezone`. The env value becomes the platform default. Pass the store tz into `dayKey`/`dayStart` (`admin-data/time.ts:5,32`), `recordEvent`, `bumpOrderStats` and the sheet Date column. |
| `DB_QUOTA_MB` | `db/usage.ts:38` | P | Keep as the platform guard (warn at 70%, block uploads at 85%). Add per-store quotas in front of it. |
| `NEXT_PUBLIC_OFFERS_FEATURES` | `page/features.ts:36` | build-time P | Per-store runtime entitlements (plan/mode) layered on top. |
| `NODE_ENV`, `NEXT_RUNTIME` | framework, `auth/config.ts:6`, `dev/fixture/render.ts:27` | — | None. |
| QA only: `COD_SCRATCH`, `PHP_BIN`, `THEME_CHECK_ALL`, `E2E_BASE_URL` (qa/e2e) | `scripts/qa/php-parity.ts:40,347`, `scripts/check-theme.ts:70`, `qa/e2e/lib/env.mjs:38` | — | `qa/e2e` defaults to `http://localhost:3400`, which is **COD Studio's** dev server. Change it to 3451+ and assert the server identity. |
| *(new)* `MEDIA_DIR` | — | P | Absolute path outside the build/deploy folder and outside `public_html`. Refuse to boot if it is inside `process.cwd()`, a symlink, not owned by the app's uid or not writable. |
| *(new)* `MEDIA_CACHE_DIR` | — | P | Replaces the hardcoded `os.tmpdir()/cod-studio-media` (`media/store.ts:43`), which COD Studio probably shares (same hosting user `u641677794`). |
| *(new)* `SIGNUP_MODE` | — | P | `open` / `invite` / `closed` at launch. |

---

## 5. Single-tenant assumptions by subsystem

Change shorthand: "scope" = take a `StoreScope` argument and add `store_id = scope.storeId`. "Guard" = by-id lookups become
`id AND store_id`, and 0 rows means not found (identical for "other store" and "missing").

### 5.1 Data layer and migrations

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| DB-01 | `src/lib/db/schema.ts:105-123` | `pages` has no store; `pages_slug_uq(slug)` is global | B | `store_id`, `UNIQUE(store_id, slug)`, `kind`, `product_id` |
| DB-02 | `schema.ts:117` | `is_home` is one global flag | B | `stores.home_page_id` |
| DB-03 | `schema.ts:125-148` | `page_versions` scoped only through `page_id` | M | Denormalised `store_id` |
| DB-04 | `schema.ts:162-188`, `media/process.ts:309,356` | Asset id = global content hash, so identical uploads share one row | B | §2.1 Option A |
| DB-05 | `schema.ts:190-212`, `media/store.ts:213-218`, `media/assets.ts:105-128` | Blobs deleted by asset id, so one owner's delete breaks every page that uses the same bytes | B | Per-store ids (A) or refcounted GC (B) |
| DB-06 | `schema.ts:263-312` | `orders`: no store, `page_id NOT NULL`, `source` live/export/php only, global indexes | B | §2.1 |
| DB-07 | `schema.ts:314-331` | `leads`: no store | B | §2.1 |
| DB-08 | `schema.ts:333-345` | `block_uq(kind,value)`: one blocklist for everyone | B | `UNIQUE(store_id, kind, value)` |
| DB-09 | `schema.ts:347-364` | `exports`: no store | B | `store_id` |
| DB-10 | `schema.ts:370-376` | `settings` PK(key) | B | `store_settings` |
| DB-11 | `schema.ts:384-396` | `audit_log`: no store | B | Nullable `store_id` |
| DB-12 | `schema.ts:398-410` | `stats_daily` has no store dimension | M | `store_id`, index `(store_id, day)` |
| DB-13 | `schema.ts:70` | `users.role` is the only role | B | `store_members.role` + `platform_role` |
| DB-14 | `schema.ts:305`, `orders/create.ts:112-115,298` | `orders_idem_uq` global; `findByIdem` by idem only | m | Keep global; replay already checks pageId (97-99) |
| DB-15 | `schema.ts:330`, `orders/leads.ts:38` | `leads_idem_uq` global | m | Same as DB-14 |
| DB-16 | `db/client.ts:11-47` (limit 6 at :20) | One pool shared by all tenants | m | Fairness through per-store limits |
| DB-17 | `db/usage.ts:17-64` | Only a whole-DB quota; uploads blocked for everyone at 85% | M | Per-store quota first |
| DB-18 | `db/ids.ts:20` | `CMD-` prefix, one global id space (~2^30) | m | Keep global PK (insert retries); optional display prefix |
| DB-19 | `db/boot-tasks.ts:22-48` | `doc_schema` marker shares the store key space | m | Platform settings only |
| DB-20 | `instrumentation.ts:61-80` | Single-store one-off boot tasks | m | Add a tenancy boot task (marker written last) |
| DB-21 | `drizzle/0000_init.sql:39,55,70,128,164-165,192,203,228` | Global unique keys and PKs | M | 0004 swaps them (guarded) |
| DB-22 | `db/upgrade-check.ts`, `scripts/qa/upgrade-dry-run.ts:22-41` | Platform-wide gate with no store column | m | Add a tenancy gate (§2.4) |
| DB-23 | whole schema | No foreign keys | M | FK `RESTRICT` on `store_id` |

### 5.2 Settings and secrets

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| SET-01 | `settings/index.ts:29-32` | `globalThis.__codSettingsCache` keyed by key: would serve store A's decrypted values to store B for 30 s | B | Key `${storeId}:${key}`, bounded size |
| SET-02 | `settings/index.ts:33` | Purpose `settings:<key>`: a ciphertext copied between store rows would still decrypt | M | `settings:<storeId>:<key>` |
| SET-03 | `settings/index.ts:77,101` | `load`/`getSettings` use `WHERE key` only | B | Scope |
| SET-04 | `settings/index.ts:131-141` | Upsert by key; audit target is the key only | B | `(store_id, key)` + audit with store |
| SET-05 | `settings/index.ts:163-166` | `invalidateSettings(key?)` is global | M | `(storeId, key?)` |
| SET-06 | `settings/schemas.ts:211-238` | Registry assumes one value set | B | Store registry + platform registry |
| SET-07 | `schemas.ts:190-197` | `HomeSettings` = one `/` page | M | Per store |
| SET-08 | `schemas.ts:68-76` | No time zone in defaults | M | Add timezone |
| SET-09 | `schemas.ts:231-234` | Turnstile env defaults apply to everyone | M | Platform fallback only |
| SET-10 | `render/publish.server.ts:617-620` | Direct read of `settings WHERE key='store'` | M | Store settings |
| SET-11 | `pixels/health.server.ts:22,37-45,90` | Direct `pixel_health` writes; throttle map keyed `platform:id` | M | Store-scoped |
| SET-12 | `security/crypto.ts:6-23` | Unbounded `keyCache` (grows per `totp:<userId>` and per store); v1 envelope has no key id | M | LRU; envelope v2 with key id (§11.2 Q) |

### 5.3 Auth, roles, gate and team

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| AUTH-01 | `src/proxy.ts:82-107`; `src/app/admin/layout.tsx:19` | Every `/admin/**` and `/api/admin/**` request without the gate cookie gets 404 | B | Gate = console only. New tenant areas `/app/**`, `/api/app/**`, public `/login`, `/signup`, `/invite/<token>` (nonce CSP, no-store, noindex) |
| AUTH-02 | `auth/index.ts:79-97` (gate at :80) | A session is valid only behind the gate | B | Separate session from gate. Gate is an extra requirement for console permissions only |
| AUTH-03 | `auth/index.ts:57-64,114-129` | `SessionUser` carries one global role; `requireUser({permission})` has no store (~53 callers) | B | `requireStoreMember`, `requirePlatform`, `requireUser` (account pages only) |
| AUTH-04 | `auth/permissions.ts:6-38` | Static owner/editor/agent × 10 permissions; no store-mode awareness | M | `can(role, p) && modeAllows(store.mode, p)`. New permissions: catalog.read/write, storefront.write, checkout.write, brand.write, members.invite, members.manage, audit.read, domains.manage, billing.manage |
| AUTH-05 | `permissions.ts:59-61` | `homePathFor(role)` → `/admin` or `/admin/orders` | M | 0 memberships → onboarding; 1 → that store; many → last used / picker |
| AUTH-06 | `auth/users.ts:66-74`; `settings/team/page.tsx:9-10` | `listUsers()` returns every account (would leak every tenant's staff) | B | `listStoreMembers(storeId)` + pending invites |
| AUTH-07 | `users.ts:118-129` (error text :123); `settings/actions.ts:125-133` | Invite = global account with a temporary password the inviter sees; "already exists" enumerates emails | B | `store_invites` link tokens; identical answers |
| AUTH-08 | `users.ts:184-199`; `settings/actions.ts:155-164` | `resetUserPasswordAction(userId)` returns a fresh password for **any** user id: cross-store account takeover | B | Platform-only (or accounts that belong only to that store and never signed in) |
| AUTH-09 | `users.ts:207-215`; `settings/actions.ts:167-175` | `resetUserTwoFactorAction` is unwired in the UI (`team/page.tsx:24`) but callable by action id | B | Delete it or make it platform-only |
| AUTH-10 | `users.ts:226-249` | `changeGuardingOwners` locks all `users` rows `FOR UPDATE`; the "≥ 1 owner" rule is global | B | Lock only the store's member rows; rule per store |
| AUTH-11 | `users.ts:252-275` | Role/disable changes edit `users` and revoke all sessions (sign-out from every store) | B | Edit the membership; the per-request membership check applies immediately |
| AUTH-12 | `schema.ts:77`; `auth/session.ts:141` | `users.disabled` is account-global | M | `store_members.status`; `disabled` = platform ban |
| AUTH-13 | `users.ts:136-156` (COUNT FOR UPDATE :141); `(auth)/setup/page.tsx:13`; `setup/actions.ts:21`; `login/page.tsx:41` | First run = empty `users` table, first owner owns the app | M | Setup creates the first platform admin; signup creates user + store + owner membership in one transaction |
| AUTH-14 | `auth/config.ts:84-88` | `ADMIN_GATE` is the only admin entry | B | Console only |
| AUTH-15 | `config.ts:91-94` | `SETUP_TOKEN` global | M | Platform bootstrap only |
| AUTH-16 | `config.ts:106-111`; `gate.ts:99-114` | IP allowlist applies to all admin access | m | Console only |
| AUTH-17 | `config.ts:158-167`; `proxy.ts:63-73` | One `PUBLIC_URL` defines "the public site" | M | Platform origin; store bases from the DB |
| AUTH-18 | `config.ts:179-212`; `gate.ts:134-137` | `isAdminHost()` is true on every host when `ADMIN_HOST` is unset | M | With custom domains, tenant hosts must 404 dashboard paths and `Next-Action` POSTs |
| AUTH-19 | `gate.ts:150-161` | `adminAreaOf` knows only `/admin` and `/api/admin` | M | Classify dashboard, console, auth and store-API areas |
| AUTH-20 | `config.ts:71`; `render/publish.server.ts:46,54` | Reserved segments and slugs cover today's root routes only | M | §6.3 lists |
| AUTH-21 | `auth/paths.ts:5-32` | `SAFE_PATH_RE` allows only `/admin…` redirects | m | Widen to dashboard paths (targets still guard) |
| AUTH-22 | `auth/login.ts:26,82,92,96,137-138`; `login/actions.ts:35`; `login/verify/actions.ts:49` | Sign-in returns the role and redirects by role | m | Return memberships |
| AUTH-23 | `admin-data/action.ts:27-49`; `orders/http.ts:164-174` | `adminAction`/`adminGuard` carry no store | B | `storeAction`/`storeGuard` (the only entry into store data) |
| AUTH-24 | `security/csrf.ts:27-67` | Allowed hosts = Host/XFH/PUBLIC_URL | m | Never accept tenant custom domains as admin origins |
| AUTH-25 | `auth/attempts.ts:24-32` | `loginAccount` = HMAC(email), 5 per 15 min, cleared only on success: on a public login anyone can lock any known account out of all its stores | M | Per-(email, network) buckets; Turnstile challenge instead of a hard lock |
| AUTH-26 | `auth/password.ts` (scrypt N=2^16, 64 MiB, burned even for unknown emails) | Safe behind the gate; a memory DoS once login is public | M | Per-process scrypt semaphore + Turnstile + global login budget |
| AUTH-27 | `login.ts:58-63` | `failed_logins`/`locked_until` written, never read | m | Enforce or drop |
| AUTH-28 | `auth/config.ts:52`; `auth/mfa.ts:136`; `admin/layout.tsx:12`; `password.ts:128-130` | "COD Studio" in the TOTP issuer, admin title and common-password list | m | Platform brand constant; add the new brand words to the list |
| AUTH-29 | `(auth)/forbidden/page.tsx:12-17`; `(auth)/two-factor/page.tsx:11,31` | Copy assumes one workspace | m | Name the store and owner |
| AUTH-30 | `instrumentation.ts:20-27`; `config.ts:215-246` | Boot warnings talk about one admin | m | Rewrite |
| AUTH-31 | `src/lib/auth/actions.ts:9-10` | Server actions are callable by id from any route; layouts don't guard (`admin/layout.tsx:8-9`, `(panel)/layout.tsx:17`) | B | Every action calls the store guard itself |

### 5.4 Admin shell and admin-data

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| ADM-01 | `(panel)/layout.tsx:20-41` | Global `getSetting('store')`, `navCounts()`, `publicOrigin()` "View store", `role={user.role}` | B | Active store + memberships (switcher), scoped counts, `storeUrl` |
| ADM-02 | `(panel)/actions.ts:11-16`; `admin-data/search.ts:21-50` (hrefs 61,70) | Cmd+K LIKE over **all** pages and orders (names, phones): fastest PII exfiltration path | B | Scope |
| ADM-03 | `admin-data/dashboard.ts:90-115` | Sheet health over all orders + one sheet | B | Scope |
| ADM-04 | `dashboard.ts:117-152` | KPIs, recent orders, pipeline, page counts unscoped | B | Scope |
| ADM-05 | `dashboard.ts:165-171` | weekStats (global `getPageStats`), `is_home` count | B | Scope |
| ADM-06 | `dashboard.ts:127`; `components/admin/common/storage-notice.tsx:9-59` | Whole-DB size shown to tenants | M | Store quota for tenants; DB size in the console |
| ADM-07 | `dashboard.ts:173-180` | Checklist has the platform `cron` item (179) and landing-only items | M | Mode-aware checklist |
| ADM-08 | `dashboard.ts:225-230` | `navCounts` over all orders | B | Scope |
| ADM-09 | `admin-data/pages.ts:60-65` | `homePageId()` global | B | Store home |
| ADM-10 | `pages.ts:67-146` | `listPages` (+ version/stats aggregates 100-114) unscoped | B | Scope |
| ADM-11 | `pages.ts:148-162` | `pageOptions`/`pageCounts` unscoped | B | Scope |
| ADM-12 | `pages.ts:182-192` | `uniqueSlug` LIKE over every slug | B | Scope + store reserved list |
| ADM-13 | `pages.ts:199-202` | `getPageRow(id)` used by duplicate/delete/setHome | B | Guard |
| ADM-14 | `pages.ts:216-250` (+ `generate/actions.ts:88-113`, `editor/pages.server.ts:225,382-396`, `render/publish.server.ts:364`, `export/server.ts:334,395`) | Inserts pages/versions/exports without a store | B | Write `store_id` from the scope |
| ADM-15 | `pages.ts:266-302` | unpublish/archive/restore by id | B | Guard |
| ADM-16 | `pages.ts:279-283` | Clears the global home | B | Store-scoped |
| ADM-17 | `pages.ts:308-320` | deletePage by id | B | Guard first |
| ADM-18 | `pages.ts:323-336` (**:329**) | `setHomePage` clears `is_home` on every page of every store | B | `AND store_id`, or drop `is_home` |
| ADM-19 | `admin-data/history.ts:52-117` | listVersions / versionKindCounts unscoped; `history/page.tsx:28-36` accepts any `page_id` | B | Scope |
| ADM-20 | `history.ts:123-181` | star/restore/duplicate by version id | B | Guard; the duplicate goes into the caller's store |
| ADM-21 | `admin-data/exports.ts:32-90` | listExports / revokeExport by id | B | Scope / guard |
| ADM-22 | `admin-data/orders.ts:92-118,201-242` | statusCounts/tabCounts global; order detail via `getOrder(id)` | B | Scope / guard |
| ADM-23 | `admin-data/orders.ts:58-76`; `admin-data/time.ts:5,32` | Day ranges use the global `STATS_TZ` | M | Store tz |
| ADM-24 | `admin-data/assets.ts:32-40,52-61,78-121` | previewAssetsFor, setAssetAlt (writes shared tags), livePagesUsing (LIKE over all published docs), assetUsage (global store logo), mediaCounts | B | Scope; `asset_refs` |
| ADM-25 | `admin-data/security.ts:105-150` | `auditPage` reads every row; `targetLabels` resolves names across the DB | B | Store filter; labels only for the store's pages and members |
| ADM-26 | `security.ts:166-174`; `settings/security/page.tsx:22` | Owners see the proxy-hop/allowlist network view | M | Platform admins only |
| ADM-27 | `admin-data/paging.ts:11` | Pathnames assume `/admin` | m | Store-prefixed |
| ADM-28 | `components/admin/shell/nav.ts:28-37,59-72` | Fixed `NAV_ITEMS`; `SETTINGS_NAV` mixes user, store and platform concerns | M | `navFor(role, store.mode)` (§8.4) |
| ADM-29 | `shell/app-sidebar.tsx:118-129` (links 178,243,252) | Brand block + single store name | M | StoreSwitcher |
| ADM-30 | `shell/topbar.tsx:38` | Breadcrumb root "Studio" | m | Store name |
| ADM-31 | `shell/command-palette-body.tsx:136-170` | Hardcoded hrefs incl. `/admin/orders/export` (CSV of all orders) | M | Store-aware; add product/store actions |
| ADM-32 | `shell/brand-mark.tsx:101-139` | COD Studio mark | m | Platform brand |
| ADM-33 | `settings/store/page.tsx:12-13`, `market/page.tsx:11`, `ai/page.tsx:11`, `anti-spam/page.tsx:11-14` | Global `getSetting(key)` | B | Scope |
| ADM-34 | `settings/actions.ts:34-73` | save store/defaults/ai/turnstile write global keys and invalidate every store's render cache | B | Scope; per-store invalidation |
| ADM-35 | `settings/sheets/page.tsx:13-29`; `components/admin/settings/sheets-wizard.tsx:252-274,340-370`; `dashboard/sheet-health.tsx:34-35`; `setup-checklist.tsx:169-176` | Tenants are told to set env vars and hPanel cron | M | Tenant sees "share with <SA email>" only |
| ADM-36 | `settings/layout.tsx:12-14`; `settings/route.ts:13-16`; `components/admin/settings/team-panel.tsx:62-67,330` | Single-workspace copy; invites hand over "the private admin link" | M | Members & invites; Security moves to `/app/account` |
| ADM-37 | ~130 `'/admin…'` literals in 45 files, 31 `revalidatePath`, `media/media-client.ts:65,85,110`, `focal/focal-client.ts:18-30`, `lib/sheets-client.ts:20`, `export/use-export.ts:59-185` | Store-less URL shape assumed everywhere | M | Typed `adminHref(store, path)` / `apiHref` helpers (§6.2) |
| ADM-38 | `(editor)/pages/[id]/edit/page.tsx:9`, `generate/actions.ts:17`, `settings/pixels/actions.ts:13`, `preview/[id]/route.ts:12` | Admin files import `db` directly | M | Route through scoped repositories; lint (§10.2) |
| ADM-39 | `components/admin/pages/pages-view.tsx:74,243,285-294`; `page-card.tsx:176`; `history/history-view.tsx:350`; `orders/order-drawer.tsx:302-308` | Live URL = `${origin}/${slug}` / `/${slug}` | B | `storeUrl` |
| ADM-40 | `lib/page/features.ts:10-53`; `components/admin/lib/format.ts:7-11` | Build-time feature flags; admin locale en | m | Entitlements; per-user locale later |

### 5.5 Public serving, render and publish

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| PUB-01 | `src/app/route.ts:9-20` | `/` = the single home (a route handler, so no `page.tsx` can coexist) | B | Platform marketing/signup; store home at `/s/<h>` |
| PUB-02 | `app/[slug]/route.ts:12-30`; `[slug]/merci/route.ts:12-24` | Root slug namespace | B | `src/app/s/[store]/…`; root routes become the neutral 404 (no legacy data) |
| PUB-03 | `app/legal/[doc]/route.ts:17-25`; `publish.server.ts:608-614` | `?p=` resolved globally; falls back to the global home | B | Store policies route; never fall back to another store |
| PUB-04 | `render/publish.server.ts:576-581` | `getPublishedBySlug(slug)` + cache key = bare slug | B | `getPublished(storeId, slug)`, key `${storeId}:${slug}` |
| PUB-05 | `publish.server.ts:539,584-601` (592-597) | `HOME_KEY '/'`; falls back to the latest published page **of the whole DB** | B | Per-store home, no cross-store fallback |
| PUB-06 | `publish.server.ts:135-152` | `storeInfo()` reads the global `store` setting, baked into HTML | B | `storeInfo(storeId)` |
| PUB-07 | `publish.server.ts:155-158` | `liveResolverFor` resolves assets by id with no scope | B | Store-scoped + ownership check |
| PUB-08 | `publish.server.ts:161-164`; `orders/turnstile.ts:49` | One Turnstile key baked into HTML and checked on order | M | Platform default / store override |
| PUB-09 | `publish.server.ts:46,53-55` | `RESERVED_SLUGS` root-only; tied to the gate path | M | Two reserved lists (§6.3) |
| PUB-10 | `publish.server.ts:58-66` | `landingPath=/<slug>`, `thankYouPath=/<slug>/merci` | B | Store base path builder |
| PUB-11 | `publish.server.ts:68-78`; `landing/document.tsx:172-181,221-240,262,276,412,418-424` | Canonical, og:url, og:image, JSON-LD absolute from `PUBLIC_URL`; brand = global store name | M | Per-store origin + base; re-render on change |
| PUB-12 | `publish.server.ts:188-199,301-319` | `publishOnce`/`renderAndCommit` select by id and render with global inputs | B | Store context (base, origin, identity, Turnstile, resolver) + guard |
| PUB-13 | `render/cache.server.ts:24-59` | 64/48 entries sized for one store; bare-slug keys; clear-all invalidation; negative entries flood the LRU (random slugs) | B | Store-qualified, byte-bounded keys; `invalidateStore(storeId)` |
| PUB-14 | `render/serve.server.ts:100-127` | CSP `connect-src`/`form-action` allow only `PUBLIC_URL` (+ www) | M | Add the store's **verified** domains from the DB; never reflect Host (responses carry `s-maxage=60`) |
| PUB-15 | `serve.server.ts:69-83` | Any non-PUBLIC_URL host is logged as a misconfiguration | m | Skip verified store domains |
| PUB-16 | `landing/context.ts:386-395` | `liveLinks(slug)` root-level home + `/legal/<kind>?p=` | B | `liveLinks(storeBase, slug)` |
| PUB-17 | `render/config.ts:88-91,238,275,286-287`; `landing/runtime/form.ts:304-306` | Runtime `thankYouUrl`/`landingUrl` root-relative; WhatsApp fallback from the global store | M | Store context |
| PUB-18 | `next.config.ts:32-33` | Fallback rewrite `/:path+ → /-` (404 uniformity) | m | Keep; store routes must be real files |
| PUB-19 | `proxy.ts:63-73,99-104` | `toPublicSite` redirects to `PUBLIC_URL` | m | Store base |
| PUB-20 | `orders/origin.ts:94-110,122-134` | `selfHosts` = any Host/XFH + PUBLIC_URL; a live page's Origin is never bound to its store; requests without Origin pass (flagged) | M | With domains: accept only the platform origin + the target store's verified domains |
| PUB-21 | `orders/export-origins.ts:30-49`; `api/public/order/route.ts:54` | Preflight CORS = union of every store's export origins | m | Acceptable (the POST re-checks the target export); document it |
| PUB-22 | `app/layout.tsx:40-44` | Root metadata `noindex` | m | Override for marketing pages |
| PUB-23 | `app/not-found.tsx:47-51`; `auth/unknown-page.ts:52-65` | One neutral 404 linking to `/` | m | Store-branded 404 under `/s/<h>/`; neutral elsewhere |
| PUB-24 | `render/compress.ts:34-36`; `orders/resolve.ts:35` | Caches sized for one store (24 MB / 512 entries, 64 docs) | m | Re-budget against plan memory |
| PUB-25 | `render/csp.ts:20-29` | Isolation rule assumes one trusted owner; only 4 vendor loaders allowed | M | Policy: **no tenant-supplied JS/HTML** while all stores share one origin |
| PUB-26 | `render/core.ts:266-269`; `security/headers.ts:13` | HTTPS detection from `PUBLIC_URL` | m | Fine (platform-level) |
| PUB-27 | `/robots.txt`, `/sitemap.xml` | Fall into `[slug]` and return 404 | m | Platform root files + per-store files |
| PUB-28 | `app/dev/fixture/render.ts:21-23,60-61` | Root-level fixture links (dev only, prod-guarded at :27) | m | Add store-page fixtures |

### 5.6 Landing renderer, runtime and builder/editor

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| LND-01 | `landing/types.ts:121-161` | `RenderContext` requires one product/items/offers/form; 25 of 27 section types read it | B (store pages) | Keep it unchanged for landing; add `StoreRenderContext` (site, menus, catalog, link builder) |
| LND-02 | `landing/types.ts:87,104-111`; `landing/context.ts:305-374` | `StoreContext` from the single setting; `PageLinks` = home + 4 legal | M | Filled per store; link builder (product, collection, cart, policy…) |
| LND-03 | `landing/types.ts:229-255` | `DefaultsInput` needs a product; `SectionDefinition` has no page kinds | M | `kinds`, per-kind `required`, `requires: product/catalog/none` |
| LND-04 | `page/schema.ts:820-836` | `PageDocBase` = one product (`items.min(1)`, `offers.bundles.min(1)` :447), own theme | B (store pages) | New StorePageDoc kinds + store ThemeSpec; landing PageDoc frozen |
| LND-05 | `page/schema.ts:72-80` | `AssetRef.id` is only regex-checked | B | Validate store ownership at save, publish and export |
| LND-06 | `page/validate.ts:342-379`; `orderForm/index.tsx:300` | Every doc gets a required orderForm | M | Required sections per kind |
| LND-07 | `editor/checklist.ts:29,118-120,201-207` | `/admin/settings/store` link; a missing order form is always an error | M | Per-kind rules, store URLs |
| LND-08 | `landing/page.tsx:39-40,63-67` | One `#order` anchor | m | Fine for landing/PDP |
| LND-09 | `landing/document.tsx:247-293,413,427` | JSON-LD always Product, og:type product | M | Kind-specific head |
| LND-10 | `document.tsx:341,386-399` | Shell kinds = landing/thanks/legal | M | Store kinds + runtime configs |
| LND-11 | `page/catalog.ts:120-122`; `render/config.ts:299,305` | Pixel content ids derived from pageKey | M | Catalog product ids/SKUs so landing, PDP and cart match |
| LND-12 | `landing/runtime/tracking.ts:22,82-85` | `lp-utm` (session) / `lp-vid` (local) shared by every store on the origin | M | Prefix with a store key |
| LND-13 | `runtime/pixels.ts:76` | `lp-px-u` (hashed phone/email for advanced matching) shared across stores | M | Store-scoped key, cleared on store change |
| LND-14 | `runtime/order-store.ts:9`; `entry-whatsapp.ts:34` | `lp-order`, `lp-wa` single origin slots | m | Store-keyed (`lp-b:<pageKey>`, `lp-stale:<pageKey>`, `lp-px:<orderId>` are already scoped) |
| LND-15 | `runtime/core.ts:156`; `runtime/init.ts:221-251` | One `form[data-lp-form]`, one `#lp-config` | M | Cart/checkout/search as new chunks |
| LND-16 | `runtime/budgets.json` | Landing chunk 24,200 B gz (within 30 B); page 32,000 | M | Nothing can join the landing chunk; new budgets |
| LND-17 | `editor/pages.server.ts:56-59` | `pageRow(id)`, the base of every builder read/write | B | `pageRow(storeId, id)` |
| LND-18 | `pages.server.ts:82-85` | `assetsFor` loads any asset id in the doc | B | Scoped |
| LND-19 | `pages.server.ts:87-124,196`; `editor/actions.ts:135-140` | Version list/row/preview by client pageId with no ownership | B | Ownership first |
| LND-20 | `pages.server.ts:278-293,371-379` | saveDraft, star, rename by id | B | Guard |
| LND-21 | `pages.server.ts:382-396,403-411` | duplicateAsPage + slugProblem global (+ gate path) | B | Store namespace |
| LND-22 | `pages.server.ts:157-160,201,367` | Global storeInfo / `store` / `ai` | B | Scoped |
| LND-23 | `editor/actions.ts:59-92` (`requireUser` :66) | Role-only checks for all 12 builder actions | B | `requireStoreMember` |
| LND-24 | `(editor)/layout.tsx:10`; `(editor)/pages/[id]/edit/page.tsx:20,31` | `generateMetadata` selects the name by id: leaks another tenant's page name in `<title>` | B | Scoped |
| LND-25 | `admin/preview/[id]/route.ts:29,39,43-47,52`; `editor/preview.server.ts:35,40,43-44` | Preview by id, global store, root URLs, fixed pageKey | B | Scoped + store context |
| LND-26 | `components/preview/LandingPreview.tsx:47,148`; `preview/frame.ts:19,22,72,90` | Fixed pageKey/endpoints; `PREVIEW_CSS` ships every section's CSS | m/M | Store info per preview; lazy CSS as sections grow |
| LND-27 | `builder/topbar/TopBar.tsx:60,112,195,223`; `PageIdentity.tsx:145,185,211,229,278`; `PublishDialog.tsx:55,162,174`; `VersionsDrawer.tsx:159,291` | Hardcoded admin paths; live URL `${location.origin}/${slug}` | M | href helpers |
| LND-28 | `builder/media.tsx:107`; `builder/env.tsx:51` | Upload POST without a store | B | Store-aware API |
| LND-29 | `builder/persistence.tsx:42,54` | `localStorage bld:unsaved:<pageId>:<tab>` on a shared device | m | Prefix user+store; purge on sign-out/switch |
| LND-30 | `editor/store.ts:23,100` | Tabs assume a product landing | m | Tabs per kind |
| LND-31 | `landing/sections/header/index.tsx:1-4` | Header is "never a nav bar" by design | M | New `navHeader` section; keep the landing header |
| LND-32 | `landing/legal/content.ts:21-37` | Legal Facts from one page + one store | M | Store policy facts |
| LND-33 | `orders/contract.ts:43-48` | Payload = pageKey + one bundle | M | Payload v3 for carts |
| LND-34 | `landing/i18n.ts:335` | Microcopy is COD/landing only | M | Store microcopy, 8 locales (ar/fr/en written) |

### 5.7 Commerce: orders, leads, blocklist, risk, upsell

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| ORD-01 | `orders/resolve.ts:20-30,104-146` | `PageTarget` has no `storeId`; no store-status check | B | Select `store_id` + `stores.status`; cache it |
| ORD-02 | `orders/create.ts:153` | `order:ip:<ipHash>` (8/10 min) shared by all stores | M | `order:ip:<storeId>:<hash>` + keep coarse `api:order` |
| ORD-03 | `create.ts:156-166` | Global blocklist: one store blocking a shopper blocks them everywhere (DoS) | B | Scope |
| ORD-04 | `create.ts:200-212` | Per-phone limit over all stores: a shopper with 4 orders anywhere is refused on the 5th store | B | Scope (index `store_id, phone, created_at`) |
| ORD-05 | `create.ts:224-234` | Risk history (fake/returned/cancelled/delivered) of the phone across all stores leaks other tenants' outcomes | B | Scope; a shared fraud network only as an explicit opt-in |
| ORD-06 | `create.ts:259-293` | Insert without a store; single `productName` | B | Write `target.storeId` |
| ORD-07 | `create.ts:341-345` | Decoy falls back to MAD | m | Store currency |
| ORD-08 | `orders/http.ts:51-63` | `syncSheetAfterResponse` runs the global sync | B | Per-store sync |
| ORD-09 | `orders/admin.ts:72-94` | `orderWhere` has no store; `OrderFilters` has no storeId | B | Mandatory storeId |
| ORD-10 | `admin.ts:120-159` | `getOrder(id)` IDOR + phone history across stores | B | Guard + scope |
| ORD-11 | `admin.ts:172-222` | updateOrderStatus/requeue by id; `retryFailedSync` requeues every store | B | Guard / scope |
| ORD-12 | `admin.ts:225-250` | Stats by page over all orders; revenue summed across currencies | M | Scope; group by currency |
| ORD-13 | `admin.ts:279-302` | listLeads global; one 30-day retention | B | Scope; per-store/plan retention |
| ORD-14 | `admin.ts:308-347` | Blocklist list/add/blockFromOrder/unblock unscoped (unblock = IDOR) | B | Scope / guard |
| ORD-15 | `admin.ts:377-501`; `(panel)/orders/export/route.ts:16-30` | CSV streams of every row matching unscoped filters | B | Mandatory storeId in the stream WHERE |
| ORD-16 | `(panel)/orders/page.tsx:34-44`; `orders/actions.ts:76` | Global counts/lists; blockPhone validates with global `phoneCountry` | B/M | Scope; store defaults |
| ORD-17 | `orders/upsell.ts:42,45`; `api/public/upsell/route.ts:48-52` | Order by id (HMAC token protects it); global IP bucket | m | Select `store_id` too |
| ORD-18 | `orders/leads.ts:31,38` | `lead:ip` shared; conversion check by idem | m | Store bucket |
| ORD-19 | `schema.ts:238-261,268,271,281` | `orders.items` = one offer; `page_id NOT NULL`; no `store` source | M | Cart: OrderItems v3 `{v:3, lines}`, nullable page_id |
| ORD-20 | `orders/validate.ts:320-393`; `page/pricing.ts:329,341-355` | Delivery fields and shipping come from one page doc | M | Store checkout FormConfig + shipping rule, applied once per cart |
| ORD-21 | `api/public/order/route.ts:57,65`; `security/burst-limit.ts:32-60` | Burst and coarse limits per IP only | m | Add store buckets |

### 5.8 Google Sheets and cron

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| SHT-01 | `sheets/config.ts:18-66` | One connected sheet | B | Per-store config |
| SHT-02 | `sheets/sync.ts:175-195,268` | Pushes every store's pending orders into the one sheet (PII leak) | B | Per-store loop; `(store_id, sheet_status)` index |
| SHT-03 | `sync.ts:47,119-141` | `GET_LOCK('cod:sheets-sync')` global | B | `sg:sheets:<storeId>` (≤ 64 chars) |
| SHT-04 | `sync.ts:244-292` | `__codSheetsSync` holds one running/rerun state | B | Map by storeId |
| SHT-05 | `sync.ts:308-341` (**:333-337**) | Pull updates orders by ids typed into a tenant-controlled sheet; order ids are customer-visible on thank-you pages | B | `AND store_id = <sheet's store>` |
| SHT-06 | `sync.ts:313` | `sheets:pull` 1 per 290 s for the whole platform | B | `s:<storeId>:sheets:pull` |
| SHT-07 | `sync.ts:363-388` | pushOrderStatus to the one sheet; syncHealth global | B/M | Store sheet; scope |
| SHT-08 | `sync.ts:46` | Date column in `APP_TIMEZONE` | M | Store tz |
| SHT-09 | `sheets/client.ts:45,78,98-100,152-170` | One SA with a process-global token; tenant A could paste tenant B's sheet link | B | Ownership proof (§7.7) or per-store credentials |
| SHT-10 | `api/admin/sheets/connect/route.ts:49`; `status/route.ts:15-20`; `sync/route.ts:18-19`; `test/route.ts` | Global currency, env diagnostics, global sync | B/M | Store-scoped |
| SHT-11 | `api/cron/tick/route.ts:58-68` | One sync + pull + purges per tick (`maxDuration` 120 s) | B | Iterate active stores with a round-robin cursor, time budget and per-store failure isolation (`step()` at :31-39); purges stay global |

### 5.9 Pixels and server conversions

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| PIX-01 | `orders/conversions-core.ts:230-257` | Tokens/test codes keyed by pixel id only: store B firing pixel X would use store A's token (dataset poisoning, PII sent to another tenant) | B | Secrets per (store, pixel) |
| PIX-02 | `orders/conversions.ts:38-56,62-84` | Global secrets + library; fallback URL `PUBLIC_URL/<slug>` | B/M | Load by `c.storeId`; store URL |
| PIX-03 | `pixels/library.server.ts:71-84,246-256` | Global library; `enforceLibraryRule` checks the global `users.role` | B | Store library, membership role |
| PIX-04 | `library.server.ts:90-120,263-293` | Page names by id; `liveTracking`/`startPixelTest` accept any pageId | B | Guard |
| PIX-05 | `pixels/usage.server.ts:38-41,96-168` | Scans every page/version/export (cap 1000), global 30 s cache | B | Scope + per-store cache |
| PIX-06 | `pixels/health.server.ts:22,37-45,90` | One health row, per-worker map | B | Store-scoped |
| PIX-07 | `pixels/migrate.server.ts:54-129` | One-time migration of the global `pixels` setting | m | Store #1 import only |
| PIX-08 | `settings/pixels/actions.ts:161,236,268-276,315-329,348` | Page rows by id; global defaults/URL in "send test event"; global pixel summary | B/M | Scope |
| PIX-09 | `conversions-core.ts:601-617` | "Test product (COD Studio)" + COD Studio UA | m | Brand constant |

### 5.10 Exports (connected, PHP, WhatsApp)

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| EXP-01 | `export/server.ts:71-95` | `loadVersion(versionId)` with no ownership: a store A member could export store B's page | B | Guard via page store |
| EXP-02 | `export/server.ts:139-228` | `getExportContext(pageId)` unscoped; global store/sheets settings | B | Scope |
| EXP-03 | `export/server.ts:364-392`; `export/service-account.ts:51-80` | PHP `config.php` embeds the global spreadsheetId and optionally the platform export SA key | B | Per-store export key or no embedding |
| EXP-04 | `export/server.ts:395-406,446-460`; `admin-data/exports.ts:32-90` | Insert without a store; revoke/list by id | B | Store id / guard |
| EXP-05 | `api/admin/export/route.ts:17-32`; `estimate/route.ts`; `[id]/route.ts:16` | Buckets `export:create:<userId>`, `export:estimate:<userId>` | M | `s:<storeId>:…` |
| EXP-06 | `export/server.ts:104-111` | Connected exports post to `PUBLIC_URL` | m | OK (pageKey resolves the store) |
| EXP-07 | `export/readme.ts:30-199`; `export/hostconfig.ts:69`; `export/templates/order.php:3` | "COD Studio" brand in exported files | m | Platform brand; the store name is what shoppers see |

### 5.11 Media

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| MED-01 | `media/process.ts:276-280,309-311,356-358` | Global dedup returns another owner's row (name, alt/focal tags, `created_by`, `source_asset_id`); 200 `deduped` vs 201 plus a faster response = existence/timing oracle | B | Per-store ids; dedup only within the store |
| MED-02 | `process.ts:239-271` (sourceAssetId regex-only :244) | Insert without a store; cutout source not checked for the same owner | M | Store id + ownership |
| MED-03 | `process.ts:340` | `assets.bytes` = master only; variants + AVIF (316-330) are several times larger | M | Quota on `SUM(media_files.bytes)` / `stored_bytes` |
| MED-04 | `process.ts:31-33,60-82` | One sharp gate (2 active + 4 waiting) for all tenants | M | Per-store fairness (≤ 1 active + 1 waiting per store) |
| MED-05 | `media/assets.ts:33-128` | get/getByIds/list/hasDerived/delete all unscoped; `source_asset_id = NULL` reset runs platform-wide (118) | B | Scope / guard; credit quota on delete |
| MED-06 | `media/assets.ts:131-157` | `assetToJson` exposes metadata (leaks under global dedup) | M | Fixed by per-store rows; never serialise `created_by` |
| MED-07 | `media/store.ts:43,343-378` | Disk cache `tmpdir()/cod-studio-media` shared with COD Studio; adopt/trim may delete the other app's files | M | `MEDIA_CACHE_DIR` |
| MED-08 | `store.ts:30,35-36,44,101-117` | 64 MB LRU, 2 read connections + queue 32, 512 MB disk shared; no per-store eviction | M | Env budgets; FS backend; evict-by-store hook |
| MED-09 | `store.ts:193-223,260-284` | Files keyed by asset/key only; meta lookup without store or status | M | `media_files.store_id`, `storage` |
| MED-10 | `app/media/[key]/route.ts:92-146` | Serves any key on any host | M | Keep at the root; refuse suspended stores; host match later |
| MED-11 | `api/admin/media/route.ts:46-48,82,98,175`; `[id]/route.ts:30-33,55-66` | Gate cookie + global role; GET uses `pages.read` | B | Session + membership |
| MED-12 | `api/admin/media/route.ts:87,149-153,182-197` | List/upload/delete without a store; the 409 `in_use` returns other stores' page ids, names and slugs | B | Scope; `asset_refs` |
| MED-13 | `route.ts:106-117` | Blocks every tenant at 85% DB; the 507 message reveals the platform DB percentage | M | Store quota first; generic message |
| MED-14 | `route.ts:119-122`; `upload-slots.ts:9-39`; `[id]/route.ts:92` | Slots 4/process, 2/user; buckets `media:upload:<userId>`, `media:focal:<userId>` | M | Per-store caps and buckets; daily byte budget |
| MED-15 | `[id]/route.ts:103`; `ensure-focus.ts:21-35,77`; `process.ts:209-219` | Focal default / focus updated by id: a cross-tenant write | B | Guard |
| MED-16 | `proxy.ts:133`; `next.config.ts:18` | Only `api/admin/media$` bypasses the proxy (the proxy buffers 1 MB) | M | Exclude the new upload path in the matcher |
| MED-17 | `app/admin/(panel)/media/page.tsx:16-17,24-26,32`; `media/actions.ts:16-29` | Global list/counts/ai/DB usage; `revalidatePath('/admin/media')` | B | Scoped page |
| MED-18 | `render/publish.server.ts:155-158,634`; `export/server.ts:50-59,264-265`; `editor/pages.server.ts:82-85`; `generate/actions.ts:76-79` | Render/export/builder/generator resolve any asset id | B | Ownership validation |
| MED-19 | `selftest-store.ts:53`; `media/selftest.ts:522` | Tests hardcode the cache dir and global slots | m | Update; add cross-tenant cases |

### 5.12 Design generation, theme and AI

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| GEN-01 | `(panel)/generate/page.tsx:18-21,40` | Global ai/defaults/store settings; `can(user.role, …)` | B | Store scope + membership |
| GEN-02 | `generate/actions.ts:62,76-80,88-136` | Asset existence check unscoped; inserts without a store; global `uniqueSlug`; audit without a store | B | Scope; store_id from the server context only (never add `storeId` to `CreateFromDirectionsInput` at :28-39) |
| GEN-03 | `components/generate/state.ts:297-299`; `wizard.tsx:70` | sessionStorage `cod-studio:generate:v2` / `…:copy:v1` restores store A's draft in store B | M | Namespace by store |
| GEN-04 | `wizard.tsx:224`; `settings/pixels/actions.ts:348` | Global pixel summary | M | Scope |
| GEN-05 | `page/schema.ts:531-562,831` | ThemeSpec is per PageDoc; no store theme | M | `store_theme` + `themeMode: 'store'/'page'` |
| GEN-06 | `theme/tokens.ts:419-433` | btn/card/mask/glyph/emphasis/density locked to the archetype | M | Optional ThemeSpec overrides so a store keeps its language |
| GEN-07 | `theme/vibe.ts:549-579`; `generator/theme.ts:231-306,354-409,460-469` | No brand input; calmTheme clamps accent chroma ≤ 0.11; blend repair moves the accent | M | Brand locks: move pop/neutral first, the accent only as a last resort, with a UI note |
| GEN-08 | `ai/prompts.ts:11,18,50,89,99-103` | Prompt hardcodes Morocco COD policies (inspection, confirmation call, WhatsApp exchanges) | M | Store policies + market from store settings |
| GEN-09 | `ai/guard.ts:186-196`; `copy-library/index.ts:419-424` | AI FAQ replaces the library wholesale with no WhatsApp check (honesty bug for stores without WhatsApp) | M | Apply the `hasWhatsapp` filter to AI output |
| GEN-10 | `copy-library/types.ts:154-203`; `index.ts:56-58,288-293` | One fixed policy set; non ar/fr/en locales fall back to English | M | Policy slots; brand voice |
| GEN-11 | `generator/plan.ts:66-67,90-97,151-154` | Only 3 single-product COD storylines | M | Kind-specific planners reusing `chooseVariant`/`assignBackgrounds` |
| GEN-12 | `generator/directions.ts:427`; `generator/rng.ts:123-130` | Designs = f(inputs, seed): look-alike pages across tenants | m | Mix a per-store brand seed |
| GEN-13 | `ai/client.ts:138`; `generate/skeleton.tsx:15` | "cod-studio-ai" worker name, "COD Studio designs…" copy | m | Platform brand |
| GEN-14 | `docs/DESIGN.md` §3 | Still says garage "amber", souk "terracotta/saffron", hearth "tomato"; `theme/archetypes.ts` has no orange | M | Fix the doc before agents read it |

### 5.13 Stats and time zone

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| STAT-01 | `stats/index.ts:17,76,93,98` | `STATS_TZ = APP_TIMEZONE` for buckets and the purge cutoff | M | Store tz from the target |
| STAT-02 | `stats/index.ts:145-171` | `getPageStats()` without pageIds aggregates the whole DB | B | Required storeId |
| STAT-03 | `stats/index.ts:71-89` | `evt:ip:<net>` shared; uniques per pageId | m | Optional store dimension |
| STAT-04 | `stats/index.ts:92-95` | `bumpOrderStats` per page only | M | Store rollups via `stats_daily.store_id` |

### 5.14 QA tooling assumptions

| ID | Where | Assumption | Sev | Change |
|---|---|---|---|---|
| QA-01 | `qa/e2e/lib/env.mjs:38`; `qa/e2e/run.mjs:3`; `qa/admin-visual/shoot.mjs:4` | Default base URL `localhost:3400` = **COD Studio**, while reading Store Gen's `.env.local` | M | Use 3451+; assert server identity |
| QA-02 | `qa/e2e/lib/db.mjs:93-123` | Cleanup deletes by name/slug LIKE across the DB | M | Delete test stores by id |
| QA-03 | `qa/e2e/steps/settings.mjs:16-79`; `generate.mjs:48`; `qa/verify1/flow.mjs:83` | Raw SQL on `settings` by key | M | `store_settings` |
| QA-04 | `qa/e2e/steps/public.mjs:77,94-99,121`; `auth.mjs:7-82` | Root public URLs; gate + single-owner setup is the only way in | M | Store paths; signup/invite steps |
| QA-05 | `scripts/qa/pixels-publish-check.ts:75-238`; `public-api-security.ts:252`; `src/lib/orders/selftest.ts` | Global settings keys, unscoped queries | m | Seed stores |
| QA-06 | `qa/verify/export-media.ts:12` | Fallback `DATABASE_URL …/cod_studio` | m | Require an explicit URL |
| QA-07 | `scripts/build-admin-css.mjs:73` | "COD Studio build" marker checked during deploys (HANDOFF §4) | m | Rename together with the doc |

---

## 6. Request routing

### 6.1 Today

| Path | Handler | Resolution |
|---|---|---|
| Proxy matcher | `src/proxy.ts:126-135` | Every path except `_next/static`, `_next/image`, `favicon.ico`, `fonts/`, `media/` and `api/admin/media$` |
| `/<ADMIN_GATE>` | `proxy.ts:82-95` | GET on the admin host from an allowed IP gets the gate cookie (30 d, sliding) and a 303 to `/admin` |
| `/admin/**`, `/api/admin/**` | `proxy.ts:97-122`; `auth/gate.ts:150-161` | 404 (`unknown-page.ts`) without the gate; nonce CSP; internal headers overwritten |
| `/` | `src/app/route.ts` | `getHomePublished()`: settings.home, then `is_home`, then the latest published page in the DB |
| `/<slug>` | `app/[slug]/route.ts` | Lowercase 308, `isServableSlug`, `getPublishedBySlug` (LRU then DB); stored HTML/CSP/ETag; `documentResponse` |
| `/<slug>/merci` | `app/[slug]/merci/route.ts` | Stored thank-you HTML, no-store |
| `/legal/<kind>?p=<slug>` | `app/legal/[doc]/route.ts` | Rendered on request from the published doc and the **current** store settings |
| `/media/<key>` | `app/media/[key]/route.ts` | Public, content-addressed, ranges, immutable, sandbox CSP, per-IP metering |
| `/api/public/{order,lead,event,upsell}` | `app/api/public/*` | POST; burst limit, pageKey resolve, origin check, DB limits |
| `/api/cron/tick` | `app/api/cron/tick/route.ts` | `CRON_KEY` (header or `?key=`); a hidden 404 otherwise |
| `/admin/preview/<id>` | `app/admin/preview/[id]/route.ts` | Authenticated full preview |
| `/dev/fixture/**` | `app/dev/fixture/**` | Dev only (404 in prod, `render.ts:27`) |
| Anything else | `next.config.ts:32-33` | Fallback rewrite `/:path+ → /-`, a byte-identical neutral 404 |

### 6.2 Recommended scheme (the architect decides)

- **Platform:**
  - `/` serves marketing + signup (convert `src/app/route.ts` to `page.tsx`, or branch on Host).
  - `/login`, `/signup`, `/invite/<token>`, `/reset/<token>` (later, once email exists).
  - `/terms`, `/privacy` (platform legal), `/robots.txt`, `/sitemap.xml`.
- **Tenant dashboard:** `/app/<handle>/…`, with `/app/account` (security, 2FA, devices, no store) and `/app/new`
  (onboarding).
  - Alternatives: `/admin/s/<handle>/…`, or the active store in `sessions.active_store_id` with a per-mutation storeId
    echo check.
  - The store-in-path option costs the ~130 href literals plus 31 `revalidatePath` calls (one helper). It gives
    multi-tab safety, shareable links and an explicit store on every request.
  - Either way tenants cannot stay under `/admin` while the gate hides it.
- **Platform console:** `/admin/**`, behind `ADMIN_GATE` + IP allowlist (and `ADMIN_HOST` once a domain exists), with 2FA
  mandatory.
- **Public store** under the `/s/<handle>` prefix:

  | Path | Serves |
  |---|---|
  | `/s/<h>` | Store home: storefront for store/both, the chosen landing page for landing-only |
  | `/s/<h>/<slug>` | Landing pages and custom pages |
  | `/s/<h>/<slug>/merci` | Thank-you page |
  | `/s/<h>/products/<p>`, `/s/<h>/collections/<c>` | Catalog pages |
  | `/s/<h>/policies/<kind>` | Store legal pages |
  | `/s/<h>/cart`, `/s/<h>/checkout`, `/s/<h>/search` | Phase 2 |
  | `/s/<h>/sitemap.xml`, `/s/<h>/robots.txt` | Per-store SEO files |

- **Stay at the root:** `/api/public/*` (the store comes from the pageKey) and `/media/<key>` (baked into HTML; moving it
  forces a re-render of every live version).
- **URL builders:** `storeBase(store)`, `storeUrl(store, path)` and `adminHref(store, path)`, used by publish, previews,
  admin links, CAPI and sitemaps.
  - Prefer **base-relative** in-page links (`merci`, `policies/privacy`) so one stored HTML works under `/s/<h>/` and
    later at a custom domain root.
  - Canonical, og and JSON-LD stay absolute (primary origin), re-rendered in cron batches when the address changes.

### 6.3 Conflicts and reserved names

- **C1:** a bare `/<store>/<slug>` collides with `app/[slug]/merci` (two segments) and `app/[slug]`, so a prefix is
  required.
- **C2:** a root `route.ts` and `page.tsx` cannot coexist.
- **C3:** the root `/[slug]`, `/[slug]/merci` and `/legal/[doc]` routes have **no data to preserve** on Store Gen (§0).
  Make them answer the neutral 404, or drop them once `/s/` exists. Do not keep a legacy namespace.
- **C4:** platform-reserved top segments extend `RESERVED_SLUGS` (`publish.server.ts:46`) and `RESERVED_SEGMENTS`
  (`auth/config.ts:71`): `admin, api, app, s, media, fonts, _next, dev, login, signup, invite, reset, setup, legal, terms,
  privacy, pricing, merci, robots.txt, sitemap.xml, favicon.ico, administrator`, plus the gate path.
  - **Store handles** use the `SLUG_RE` pattern, avoid that list (handles never sit at the root, but `/s/admin` reads like
    a platform page) and may never equal the gate segment.
  - **Store-reserved page slugs** inside `/s/<h>/`: `products, collections, policies, legal, cart, checkout, search, pages,
    account, merci, sitemap.xml, robots.txt, media, api`.
  - In "both" mode, landing slugs and custom pages share `/s/<h>/<slug>`; products live under `/products/`.
- **C5:** store routes must be real route files that copy the `unknownMethod` + neutral 404 discipline. The fallback
  rewrite stays.
- **C6:** `adminAreaOf` must classify `/app`, `/api/app`, `/login`, `/signup` and `/invite` (nonce CSP, no-store, noindex,
  internal-header stripping). The new upload endpoint must be excluded from the proxy matcher like `api/admin/media$`
  (`proxy.ts:133`).
- **C7:** on the temporary domain (no subdomains) the dashboard, the console and **every tenant's pages share one origin**.
  Isolation rests on the per-document CSP narrowing (`render/csp.ts:20-29`, `serve.server.ts:100-127`). Any store page
  type must use the same `scopeToPublicApi` + distinct COOP.
- **C8:** root layout `noindex` (`app/layout.tsx:40-44`) must be overridden on marketing pages. Store pages get per-page
  robots.

### 6.4 Custom domains later

- Add a `store_domains` table. Validate hosts with `sharedSuffix()` (`orders/origin.ts:48`, which already lists
  `hostingersite.com`), and refuse the `PUBLIC_URL` and `ADMIN_HOST` hosts.
- **Proxy:** a host that is neither the platform nor the admin host rewrites (no DB lookup in the proxy) to an internal
  tree such as `/_d/[host]/[[...path]]`. Its handlers resolve host → store and serve the same renderers.
- Tenant hosts must 404 `/admin`, `/app`, `/api/app` and `Next-Action` POSTs. `__Host-` cookies stay on the platform host.
- `documentOrigins` adds verified domains. `checkOrigin` binds a live page to its store's domains. CSRF never accepts
  tenant domains.
- Canonical follows the primary domain (batched re-render). Turnstile needs hostnames (or per-store keys). Meta domain
  verification is per registrable domain: on the shared temporary domain, attribution is degraded until then.
- Hostinger limits on addon/parked domains and SSL issuance cap tenant domains (§11.2 Q).

---

## 7. Security surfaces for isolation

### 7.1 Public endpoints

| Endpoint | Auth | Tenant resolution today | Isolation change |
|---|---|---|---|
| `GET /`, `/<slug>`, `/<slug>/merci`, `/legal/<kind>` | none | Global slug / home / settings | `/s/<h>/…`; `(storeId, slug)`; store-qualified caches; store-branded 404 |
| `GET /media/<key>` | none | Global key | Keep global (keys unguessable without the bytes; per-store HMAC ids stop correlation); refuse suspended stores; drafts reachable by key, so document it |
| `POST /api/public/order` | pageKey + Turnstile (optional) | `resolvePageKey` → page/export, no store | `target.storeId` drives blocklist, limits, risk, stats, CAPI, sheet; suspended store → refused; never a client storeId |
| `POST /api/public/lead` | pageKey | same | `store_id` on the lead; store bucket |
| `POST /api/public/event` | pageKey | same (15 s cache) | stats `store_id`; optional store bucket |
| `POST /api/public/upsell` | orderId + HMAC token | order by id | Select `store_id`; per-store sync |
| `GET /api/cron/tick` | `CRON_KEY` | global | Platform job iterating stores |
| New: `/signup`, `/login`, `/invite/<token>` | public | — | Burst + DB limits, Turnstile, scrypt semaphore, generic answers (no email enumeration), no-referrer on token pages |

### 7.2 Admin API routes (route handlers)

| Route | Guard / permission today | Store problem |
|---|---|---|
| `GET/POST/DELETE /api/admin/media` | gate check in the route (:46-48), `adminGuard` `pages.read`/`media.write` | Global list, upload, delete; 409 leaks other stores' pages |
| `GET/PATCH /api/admin/media/[id]` | gate + `pages.read`/`media.write` | Focal read/write by id (:55-61, :103) |
| `GET/POST /api/admin/export`, `GET /api/admin/export/estimate`, `DELETE /api/admin/export/[id]` | `export.create` | loadVersion / context / revoke by id |
| `POST/PATCH/DELETE /api/admin/sheets/connect`, `GET status`, `POST sync`, `POST test` | `settings.write` / `settings.read` / `orders.write` | One sheet; env diagnostics; global sync |
| `GET /admin/(panel)/orders/export` | `requireUser(orders.read)` | CSV of every order |
| `GET /admin/preview/[id]` | `requireUser(pages.read)` | Page/version by id |
| `GET /admin/(panel)/pages/new`, `/admin/(panel)/settings` | alias redirects | Role-based targets |

### 7.3 Server actions (callable by id from any route, AUTH-31)

| File | Actions | By-id / unscoped inputs |
|---|---|---|
| `(auth)/login/actions.ts`, `login/verify/actions.ts`, `setup/actions.ts`, `two-factor/actions.ts` | loginAction, verifyAction, setupAction, begin/confirmEnrollment, regenerateCodes, disable | Platform-level; return memberships, bootstrap the platform admin |
| `(panel)/actions.ts` | searchAction | Global search (ADM-02) |
| `(panel)/exports/actions.ts` | revokeExportAction | Export id |
| `(panel)/generate/actions.ts` | createFromDirectionsAction | Asset ids from the browser doc |
| `(panel)/history/actions.ts` | star/restore/duplicateVersionAction | Version id |
| `(panel)/media/actions.ts` | getAssetUsageAction, setAssetAltAction | Asset id |
| `(panel)/orders/actions.ts` | getOrder, updateOrderStatus, resendToSheet, retryFailedSync, blockFromOrder, blockPhone, unblock | Order id / block id / global retry |
| `(panel)/pages/actions.ts` | duplicate, publish, unpublish, setHome, archive, restore, delete | Page id |
| `(panel)/settings/actions.ts` | saveStore, saveDefaults, saveAi, saveTurnstile, changePassword, revokeSession(s), inviteUser, setUserRole, setUserDisabled, **resetUserPassword**, **resetUserTwoFactor**, loadAudit | Global keys; user ids (takeover risk) |
| `(panel)/settings/pixels/actions.ts` | 13 actions (library, usage, replace, page/pages pixels, applyLiveTracking, start/stopPixelTest, sendPixelTest, wizard/store summary) | Page ids, global library/secrets |
| `src/lib/editor/actions.ts` | loadPage, saveDraft, createVersion, listVersions, getVersionPreview, restoreVersion, starVersion, renameVersion, duplicatePage, updatePageMeta, publish, unpublish | Page/version id |

Rule for every action:
1. Resolve the membership for the URL's store.
2. Check permission and mode entitlement.
3. Use `ctx.store.id` in every predicate.
4. Treat a client-sent storeId as an echo check only, never as authority.

### 7.4 Media
- Covered in §5.11. The surfaces are the upload pipeline (dedup oracle), metadata writes by id, the delete 409 contents,
  `sourceAssetId`, document AssetRefs at save/publish/export, quota races (charge with an atomic conditional `UPDATE
  stores SET media_used_bytes = media_used_bytes + ? WHERE id = ? AND media_used_bytes + ? <= media_quota_bytes`), the
  public route headers (`default-src 'none'; sandbox`, nosniff, CORP; keep them) and filesystem files never under
  `public_html`.

### 7.5 Process-global caches and in-memory state (`globalThis.__cod*`)

| Global | File | Key today | Change |
|---|---|---|---|
| `__codSettingsCache` | `settings/index.ts:29` | setting key | `${storeId}:${key}` (**leak**) |
| `__codRenderCache` | `render/cache.server.ts:27` | slug / `/` / `versionId:slug:kind` | `${storeId}:…`; per-store invalidation (**leak**) |
| `__codPixelUsage` | `pixels/usage.server.ts:38` | single index | per store (**leak**) |
| `__codPixelHealth` | `pixels/health.server.ts:22` | `platform:id` | `${storeId}:platform:id` |
| `__codSheetsSync` | `sheets/sync.ts:245` | single state | Map by storeId |
| `__codSheetsHeaders` | `sheets/sync.ts:76` | spreadsheetId:title | OK (per sheet) |
| `__codSheetsToken` | `sheets/client.ts:98` | single SA token | per credential if per-store SAs |
| `__codOrderCache` | `orders/resolve.ts:39` | pageKey / version id (global randoms) | OK; add storeId to cached targets |
| `__codExportOrigins` | `orders/export-origins.ts:27` | union of all exports | OK for preflight (documented); per-store invalidation |
| `__codEncodedCache` | `render/compress.ts:161` | content hash | OK |
| `__codMediaState` | `media/store.ts:102` | media key | OK keys; add evict-by-store |
| `__codFocusFlights` / `__codFocusMisses` | `media/ensure-focus.ts:22-23` | asset id | OK with per-store ids |
| `__codMediaGate`, `__codUploadSlots` | `media/process.ts:64`, `upload-slots.ts:13` | process / user | Add per-store fairness |
| `__codMediaThrottle`, `__codBurst` | `media/throttle.ts:20`, `security/burst-limit.ts:20` | IP / network | Platform guards (keep) |
| `__codDbUsage` | `db/usage.ts:33` | whole DB | Console only; per-store counters |
| `__codForeignHosts` | `render/serve.server.ts:70` | host | Skip verified domains |
| `__codDb` | `db/client.ts:12` | pool | Shared (fine) |
| crypto `keyCache` | `security/crypto.ts:6-23` | purpose | Bounded LRU |
| Client: focal cache | `components/admin/media/focal/focal-client.ts:18-21` | asset id | Reset on store switch |
| Client: AI manager | `lib/ai/client.ts:283-289` | per tab | Cancel jobs on store switch |

### 7.6 Rate-limit buckets

| Bucket | Where | Keep / change |
|---|---|---|
| `auth:login:ip:*`, `auth:login:acct:*`, `auth:mfa:ip/user/manage:*`, `auth:password:*`, `auth:setup:ip:*` | `auth/attempts.ts:24-32` | Platform; rethink `login:acct` lockout (AUTH-25) |
| `api:order:<ipHash>` (60/10 min) | `api/public/order/route.ts:65` | Platform coarse floor |
| `order:ip:<ipHash>` (8/10 min) | `orders/create.ts:153` | `s:<storeId>:order:ip:<hash>` |
| `order:page:<pageId>` | `create.ts:218` | Already store-local |
| `lead:ip:*` (30), `upsell:ip:*` (20) | `orders/leads.ts:31`, `upsell.ts:42` | Add store dimension |
| `evt:ip:<net>`, `evt:uniq:v:/fs:<pageId>:<net>` | `stats/index.ts:74,78` | Optional store dimension; uniques fine |
| `sheets:pull` (1/290 s, **global**) | `sheets/sync.ts:313` | `s:<storeId>:sheets:pull` |
| `sheets:connect:<userId>`, `sheets:sync:<userId>`, `sheets:test:<userId>` | `api/admin/sheets/*` | `s:<storeId>:…:<userId>` |
| `export:create:<userId>`, `export:estimate:<userId>` | `api/admin/export/*` | `s:<storeId>:…` + store aggregate |
| `media:upload:<userId>` (120/10 min), `media:focal:<userId>` | `api/admin/media/*` | `s:<storeId>:media:upload[:<userId>]` + daily bytes |
| `cron:ip:*` | `api/cron/tick/route.ts:48` | Platform |
| In-memory `burstLimit(order/lead/event/upsell/cron, ip)` | `security/burst-limit.ts` | Platform pre-DB floor |
| *(new)* signup, invite, invite-accept, publish, order per store | — | `p:signup:ip`, `s:<storeId>:invite`, `s:<storeId>:publish`, `s:<storeId>:orders` |

Buckets stay ≤ 191 chars (ULIDs fit). Purge already runs in the cron.

### 7.7 Integrations and secrets
- **Sheets ownership proof.** The single service account is shared with every tenant's sheet. Connecting has to prove that
  the store controls the spreadsheet: a per-store random verification value the owner places in a named cell or tab,
  which the platform reads back. `spreadsheetId` is unique across stores, and sheet titles of other stores are never shown.
- **CAPI/Events tokens:** keyed by `(storeId, pixelId)`, store-bound encryption, masked per store.
- **PHP export:** no platform key ever. A per-store export key is encrypted and store-bound.
- **Settings envelopes:** bound to the store. `APP_SECRET` and the HKDF salt never change.
- **`hashIp`** uses one platform key (`crypto.ts:64-66`), so IP hashes correlate across stores. That is acceptable for
  platform abuse signals as long as blocklists and risk stay per store.

### 7.8 Same-origin web storage (temporary domain)
- The keys `lp-utm`, `lp-vid`, `lp-px-u`, `lp-order` and `lp-wa` and the first-party ad cookies (`_fbp`, `_fbc`, `_ttp`)
  are shared by every store on the origin (LND-12..14). Namespace the keys per store now.
- Forbid tenant JS (custom head code, GTM, chat widgets) until stores have their own origins.
- The dashboard never keeps secrets in web storage.
- Namespace or purge the builder and wizard drafts (LND-29, GEN-03).

### 7.9 Audit
- Write `store_id` on every store event.
- `auth.login.*` rows (email targets, IP hashes) stay platform-only.
- Add new events: `store.created`, `store.mode_changed`, `store.member.invited/accepted/role_changed/removed`,
  `store.suspended`, and domain events.
- Platform actions on a store (suspension, support access) are logged with both the actor and the store.
- Keep the meta redaction (`audit.ts:60-84,105-129`).

---

## 8. Reuse plan

### 8.1 Reused as is (tenant-agnostic)
- **Theme engine:** `buildTheme`, 11 archetypes, 9 harmonies, OKLCH palettes, contrast solve (`theme/palette.ts:1209,1233`),
  the no-orange stack (`theme/color.ts:237-338`, `theme/blend.ts`, `generator/theme.ts:231-306`), 27 manifest fonts.
  ThemeSpec works as the store theme format and brand-kit output.
- **Pricing and offers:** `page/pricing.ts` (integer cents, `Pick<PageDoc,'items'|'offers'|'product'>`),
  `orders/validate.ts:resolveSelection`, `orders/versions.ts`, `page/catalog.ts`, options. A catalog product stores
  `{product, items, offers}` and is priced by the same server, runtime and PHP-parity code. Cart total = Σ per-line
  `orderTotals` + one store shipping rule.
- **Render pipeline:** `renderPageBody` (`landing/page.tsx:286`), `Shell`/`documentCss`/`sectionChunks`, `render/core.ts`
  probe + hash CSP + ETag + caps, `documentResponse` (supports on-request documents), compress cache, `canonicalRedirect`,
  the unknown-page 404.
- **Publish/version pipeline:** `renderAndCommit` (row lock, CAS, packet guard, autosave pruning), immutable versions.
- **Runtime core:** `init.ts`, `core.ts` Ctx/bus, the `__lpx` optional-chunk registry, analytics, pixels, turnstile,
  fields/phone, http, money. Cart/checkout/search plug in as new chunks.
- **Security primitives:** scrypt, TOTP + CAS, recovery codes, DB sessions, `rateLimit`/`burstLimit`, AES-GCM/HKDF/hmac,
  CSRF `checkSameOrigin`, nonce admin CSP, `clientIp`, the gate (for the console), audit sanitiser.
- **Media mechanics:** sniff, sharp pipeline, video scrub, upload-body, ByteLru, the public route mechanics, `fileRangeStream`/
  `copyToDisk`/`fileSha` as the base of the filesystem backend, focus/framing, `MediaSource` export abstraction.
- **Commerce:** risk scoring, origin policy, the CAPI bodies (`dispatchPurchase(event, secrets, library)` is already
  parameterised), Sheets client and row builder (13 columns A-M), the upsell token scheme, honeypot/decoy, PII-free logs.
  `OrderItems` v2 is close to what a cart line needs.
- **Admin UI:** shell, shadcn kit (40 components incl. the team-switcher dropdown pattern), common components, form kit,
  team/audit/security panels, the items/offers/variants editors (pure and controlled, so they work as the Product editor),
  dashboard parts, pages library, history, media library and picker.
- **Generator:** the wizard, `generateDirections`, planner primitives (`chooseVariant` + reservations,
  `assignBackgrounds`/`finishPlan`, `directSections`), copy overlay, local AI worker + `generateJson` (new tasks = schema +
  prompt: brand brief, names/taglines, voice, collection intros), honesty guard, `extractPalette` for logos, the favicon
  monogram generator (`document.tsx:189-201`) as the seed of the logo designer, ThemePanel as the base of the brand-kit
  editor.
- **Legal module:** `LegalBody` + `legal/content.ts` (MA/EU/INTL, ar/fr/en, visible gaps instead of invented ids) becomes
  store policy pages with store-level Facts.
- **Thank-you:** `ThankYou.tsx` + `runtime/thankyou.ts` already render multi-item groups, gifts, extras and bump, so they
  can show a cart order.

### 8.2 Store mode matrix (what the user's choice turns on)

| Capability | landing | store | both |
|---|---|---|---|
| Landing pages (Pages, Generate, builder, versions, exports, per-page pixels, thank-you upsell) | yes, first-class | optional (off by default) | yes |
| Catalog (products, collections), storefront (home, nav, theme), policies hub | no | yes | yes |
| Store home `/s/<h>` | chosen landing page | storefront home | storefront home |
| Product page + "landing pages for this product" | — | product page | product page plus N landing pages that reference `product_id` (shared price, options, stock) |
| Checkout | per-page order form | PDP COD buy-now (phase 1), cart v3 (phase 2) | both |
| Orders, Sheets, pixels library, members, audit, brand kit | yes | yes | yes |

The mode lives on `stores.mode`, is checked by `modeAllows()` next to role permissions, and filters navigation, palette and
checklist. Switching modes hides data rather than deleting it (§11.2 Q).

### 8.3 Landing-page features that must be kept (inventory)
- **Sections:** 27 types, 91 variants (counting header `none`):
  - announcement: ticker, static, split
  - header: minimal, centered, none
  - hero: stage, editorial, poster, scrapbook, spec, split
  - trustBar: chips, stamps, ledger, ribbon
  - marquee: tape, outline, double
  - problem: crossed, chat, split, quote
  - benefits: numbered, bento, zigzag, icons, stack
  - showcase: hotspots, exploded, ingredients, dimensions
  - steps: timeline, cards, illustrated, strip
  - story: letter, image-text, manifesto
  - gallery: carousel, masonry, filmstrip, lookbook
  - video: framed, phone, fullbleed
  - beforeAfter: slider, cards, timeline
  - comparison: table, versus, checklist
  - specs: sheet, tabs, accordion, label
  - reviews: wall, carousel, summary, notes
  - socialProof: whatsapp, ugc, counter
  - stats: big-numbers, rings, ticker
  - offer: stacked, tickets, shelf
  - urgency: countdown, stock, banner
  - guarantee: seal, split, letter
  - orderForm: card, split, minimal, bold (singleton, required)
  - cta: banner, stamp, poster
  - faq: accordion, two-col, chat
  - footer: simple, big
  - stickyCta: bar, pill
  - whatsappFloat: bubble, tab
  - Section features: zones, seeded dividers, per-section background (6 tones), divider, spacing, hidden, error isolation.
- **Offers v2:**
  - 1-8 items; fixed/choice lines with distinct and difference surcharges; free lines; per-line rules (lock, allow,
    preset); perks; gifts; auto/custom visuals; badges; preselected; soldOut; genuine compareAt only.
  - Display axes: picker (stack, tiers, ticket, pills, visual), fill (auto, inline, rows, steps, box), selection (soft,
    solid, outline), media, density.
  - Scoped extras; the order bump as a catalog item; the thank-you one-click upsell with a real window.
  - Shipping fee and free-shipping offers; showPerUnit/showSavings; real countdownEnd and stockLeft.
- **Options:**
  - Choice groups (swatch, text, image, select display).
  - Matrix with 2-3 dims (cells in/out/none, delta, sku, image, linked/combined).
  - Typed fields (text/number, required, maxLength, min/max, charset, optional delta).
  - Warehouse codes; per-unit vs shared groups.
- **Order form:**
  - 4 variants; city select/text/hidden; address/note/email modes; phone-country validation; WhatsApp alternative;
    reassurance and submit labels.
  - Honeypot; Turnstile; abandoned-lead capture; idempotency key; the stale-version flow (72 h); `ver` + shown total in
    payload v2.
  - Server re-pricing, risk scoring, blocklist, duplicate/per-phone limits.
- **Pixels:**
  - Per-page answer: Meta ×3, TikTok ×3, Snap, GA4, or "No pixel".
  - Library rule, test codes and windows, health.
  - Browser funnel PageView/ViewContent/AddToCart/InitiateCheckout/Lead, plus Purchase on the thank-you page.
  - Advanced-matching hashes; server events (Meta CAPI, TikTok Events API) with a risk gate.
  - First-party beacons (view, form_start, cta_click, bundle_change); UTM and click-id capture.
- **Theme:** 11 archetypes, 9 harmonies, accent/pop/neutralHue/base, 5 font slots incl. Arabic,
  radius/shadow/texture/surfaces/motion, 7 divider kinds, ornament density; RTL; 8 locales (ar/fr/en complete); 9 markets.
- **Head/SEO and pages:**
  - title/description/ogImage/noindex, canonical, OG/Twitter, JSON-LD Product (Offer/AggregateOffer, real
    AggregateRating only), logo or monogram favicon, theme-color.
  - Themed legal pages (privacy, terms, shipping, contact).
  - Thank-you page with timeline and WhatsApp help.
- **Security/performance:** strict hash CSP per document, style attributes limited to custom properties, `inlineJson`
  escaping, `sanitizeDeep`, `safeHref`, `frame-ancestors 'none'`, per-variant CSS chunks, split runtime chunks with
  budgets, page caps (400 KB gz HTML, 24 KB config, 48 option photos), MariaDB packet guard.
- **Builder:**
  - Iframe live preview (mobile/tablet/desktop, zoom, interactive mode); inline `data-edit` editing; outlines; drag-and-drop
    reorder; section library with thumbnails; FieldSpec inspector.
  - 100-step grouped undo; 1.5 s autosave + serial queue + conflict dialog + local recovery.
  - Versions: autosave/save/publish/restore/import/generation, star, rename, preview, restore with or without pixels,
    duplicate as page.
  - Remix; pre-publish checklist with fix targets and the sample-content honesty warning; slug move with auto-republish
    and revert; unpublish; full preview tab.
- **Generator:**
  - Photo palette (k-means); local SigLIP classification + 11 vibes; Qwen VLM deep look and copy (WebGPU), with a library
    fallback (16 families, ar/fr/en).
  - Background removal (BiRefNet/ISNet); three directions; "Other styles"/"Regenerate"; honesty guard; focal/crop editing.
- **Exports and operations:**
  - Website ZIP; connected export (allow-listed origins); PHP `order.php` parity (Sheets, Telegram); WhatsApp bridge;
    revoke.
  - Orders admin (drawer, statuses, CSV), leads, blocklist, Google Sheets push/pull, dashboard KPIs/funnel.

### 8.4 Admin information architecture fit
- A **StoreSwitcher** replaces the brand block (`app-sidebar.tsx:118-129`): logo, name, mode badge, memberships, "Create a
  store", and "Platform console" for staff.
- **Navigation by mode:** Workspace (Dashboard, Orders) always. Storefront (Products, Collections, Store pages,
  Navigation, Theme/Brand kit) for store/both. Landing pages (Pages, Generate) for landing/both. Library (Media, History,
  Exports). The quick "Generate" becomes "Create" (product / landing page).
- **Settings:** Store profile & legal, Brand kit/logo, Address & domains, Market (+ time zone), Checkout & delivery, Google
  Sheets (tenant part), Pixels, Anti-spam, Members & invites, Audit, Plan & usage.
- **Account area** (`/app/account`): password, 2FA, devices, AI tier.
- **Platform console** (`/admin`): stores (mode, owner, usage, suspend, quotas), users (ban, 2FA reset), health (service
  account, last cron tick, DB/disk usage, proxy network view), platform audit.
- **Onboarding:**
  1. Store name and handle (path preview).
  2. "What will you run?": Full store / Landing pages / Both (changeable).
  3. Market, currency, language, delivery fee, time zone.
  4. Brand: logo upload or designer, colors.
  5. First content: add a product or generate a storefront, or today's generate wizard.

---

## 9. Gaps

### 9.1 For full stores
- **Catalog:** `products`, `collections`, inventory (only `soldOut` booleans exist today), stock decrement/reservation,
  SKUs as pixel content ids, bulk product photo upload (galleries allow 30 images, `page/schema.ts:249`), CSV/URL import
  (SSRF-safe).
- **Document model:**
  - StorePageDoc kinds home/collection/product/page/policy/cart/checkout/search/404/thank-you.
  - Global store sections (announcement/header/footer).
  - Menus.
  - A store ThemeSpec with a `themeMode` inherit/own per page.
  - Kind-specific required sections (no orderForm on home).
- **Render context:** `StoreRenderContext` (site, menus, link builder, catalog snapshot) and section `kinds`/`requires`.
- **New sections and primitives:**
  - navHeader (bar/centered/mega/drawer; logo, menu, search, cart badge)
  - productGrid (grid/carousel/bento/editorial) and a productCard primitive
  - collectionList, collectionHeader with filter/sort/pagination
  - productDetail (gallery, options, quantity, add to cart, COD buy-now)
  - related/cross-sell, recently viewed
  - breadcrumbs, richText/imageWithText/slideshow, logoCloud
  - cartDrawer, cartPage, checkout, searchResults
  - policyBody (LegalBody as a section), emptyState/404
  - Each needs `preferredVariants` in the archetypes and store copy families (ar/fr/en).
- **Checkout for COD:**
  - Phase 1: PDP buy-now reusing orderForm against the product's version.
  - Phase 2: payload v3 `{storeKey, lines[{productId, offerId, units, options}], catalog version, shown total}` with server
    re-pricing per line, per-line stale handling, one store shipping rule (flat, max, per city, free threshold),
    `orders.lines`, nullable `page_id`, cart thank-you/upsell policy, cart abandonment leads.
- **Runtime chunks:** `cart` (store-keyed localStorage, drawer, badge, cents math, stale prices), `checkout`, `search`
  (client JSON index for small catalogs), `collection` (client sort/filter), each with its own budget. The landing chunk
  has no room.
- **Rendering strategy:** grids, collections and PDPs embed prices. Either keep a dependency index (product → pages) with
  a render queue drained by publish and the 5-min cron, or render on request with ETag + LRU (as legal pages do today).
- **SEO:** per-store `sitemap.xml`/`robots.txt`; JSON-LD Organization/WebSite/CollectionPage/ItemList/BreadcrumbList;
  hreflang when multi-locale; OG per kind.
- **Brand kit and logo designer:**
  - Brand input in `ThemeFromProductInput` (`theme/types.ts:236-252`), with locks honoured by calmTheme and blend repair.
  - Curated fonts only.
  - A parametric SVG logo built from the brand font, monogram and archetype glyph, rasterised client-side to PNG/WebP
    (never store user SVG; `media/sniff.ts` accepts raster/video only).
  - Favicon/apple-touch/OG-default derivation.
  - Store voice and policies feeding the copy prompt and library.
- **Media:** filesystem backend (`MEDIA_DIR`, sharded, fsync + rename before the DB commit, orphan sweeper, db→fs migrator
  per cron tick); per-store quotas; `asset_refs`; platform stock assets; video poster frames; per-locale alt text; batched
  store purge; "replace image everywhere".
- **Platform:**
  - Signup/onboarding, store picker, invites, platform console, plans/entitlements.
  - Outbound email (none exists today, so no verification and no self-service reset).
  - A per-store 2FA-required policy.
- **Store analytics:** store rollups, revenue per currency, orders by source (storefront vs which landing page), product
  funnels.

### 9.2 For stronger landing pages (on top of §8.3)
- **Attach to a catalog product.** A landing page can reference `product_id`: shared price, options and stock, plus a
  "shop more" link into the store. Or it stays standalone (today's behaviour).
- **Tests and funnels:**
  - A/B variants (server picks a stored version per visitor without breaking shared caching; avoid `Vary: Cookie`).
  - Funnels (advertorial/pre-sell, landing, upsell/downsell chain, thank-you).
  - Multiple bumps.
  - Scheduled publish/unpublish and scheduled price changes via the cron.
- **Delivery:** zones with a fee and ETA per city (the MA city list exists, without fees), a COD fee, an estimated delivery
  date line.
- **Per-page analytics:** views, form starts, conversion per offer/UTM/variant, lead recovery. The beacons already exist.
- **Reuse and editing:**
  - Saved sections, templates and house styles across pages; global blocks shared with the store.
  - Section-level regenerate/remix (remix scopes are page-wide today, `generator/remix.ts:32`); more storylines (3 today,
    `plan.ts:90-97`); "match my brand".
  - Multi-locale siblings in one run.
  - Directions from a reference screenshot; a visual QA pass (geometry/contrast) before showing directions.
- **Reviews:** real review import (CSV/photos), post-delivery collection over WhatsApp, UGC video, size-guide modal,
  build-your-box layout.
- **Per-page routing:** sheet/tab routing per page, per-page notifications (Telegram/WhatsApp/email), per-page Turnstile
  toggle, editable slug with redirects, a per-landing custom domain or path alias later, short links with UTM presets.
- **Honest helpers:** exit/scroll lead popup (honest copy only); section visibility per device or UTM (baked at publish).

---

## 10. Test infrastructure and cross-tenant attack tests

### 10.1 Today
- **`npm test`** (offline) runs theme:check, test:runtime, test:generator, test:render (CSP hashes, budgets +5%),
  test:money, test:conversions, test:offers, test:orders. **`npm run check`** = typecheck + lint + test.
- **Manual only:**
  - test:pixels, test:turnstile, test:pixels-publish (DB-backed, throwaway-DB guard `cod_px*`/`cod_test*` at
    `scripts/qa/pixels-publish-check.ts:22-41`), test:php.
  - qa:upgrade-dry-run.
  - `scripts/qa/public-api-security.ts`, `scripts/qa/secrets-check.ts`.
  - `src/lib/auth/host-selftest.ts`, `src/lib/security/selftest.ts`, `src/lib/media/selftest*.ts`.
- **Git-ignored `qa/`:**
  - `qa/e2e` (17 Playwright steps against a real dev server + MariaDB, with tagged cleanup).
  - `qa/admin-visual` (orange scan of 18 screens, light/dark).
  - `qa/verify` (orange/pixel/bidi/geometry checks of rendered landings).
  - `qa/final-verify/geom-check.ts`, plus many design harnesses.
- **Nothing tests tenancy.**

### 10.2 Where cross-tenant tests plug in
1. **Static gate (`scripts/qa/tenancy-lint.ts`, added to `npm test`):**
   - Fail on any Drizzle query on a tenant table outside a store-scoped repository. About 225 sites exist today (§0).
     Target `src/lib/{admin-data,orders,editor,export,media,pixels,sheets,stats,render,settings}`.
   - Fail on `getSetting` without a scope for S keys.
   - Fail on any `globalThis.__cod*` cache whose key lacks a storeId (whitelist from §7.5).
   - Fail on `rateLimit("…")` literals without the `p:` or `s:` convention.
   - ESLint `no-restricted-imports` of `@/lib/db/client` and `@/lib/settings` in `src/app/**` and `src/components/**`
     (fixes ADM-38).
2. **DB-backed attack suite (`scripts/qa/tenancy-check.ts`, `npm run test:tenancy`):**
   - Database: a throwaway `cod_test_tenancy*` DB with the guard from pixels-publish-check, `runMigrations`, and a
     `server-only` stub.
   - Seed stores A and B with canaries (`CANARY-A-<rand>`) in page names, order names and phones, asset names and alt
     text, pixel labels, store name, audit meta, sheet ids.
   - Needs a request-context seam (AsyncLocalStorage auth context, or test-only `runAs(user, store)`), because
     `requireUser` reads `cookies()`/`headers()`.
   - As each role of B (owner, editor, agent), call every admin-data function and every exported action in
     `src/app/admin/**/actions.ts` and `src/lib/editor/actions.ts` with A's page, version, asset, user, order, export,
     block and pixel ids.
   - Assert: not-found or forbidden (identical answers); A's rows byte-identical before and after (checksums); no canary in
     any return value.
   - Extra cases:
     - same slug in both stores (both publish and serve);
     - same pixel id in both stores (each uses its own token);
     - a sheet containing A's order ids pulled for B (0 updates);
     - per-phone limit and blocklist isolation;
     - identical image uploaded in both stores (distinct ids, no `deduped`, same timing class);
     - `sourceAssetId` pointing at A's asset;
     - a doc referencing A's asset at save, publish and export;
     - quota race (parallel uploads at the edge);
     - cache test: set A's store name, read B within 30 s;
     - render cache: same slug in two stores;
     - suspended store: its pageKey refuses orders;
     - invite token reuse, expiry, role escalation, enumeration.
3. **E2E (`qa/e2e` "tenancy" step):**
   - Contexts: owner A, owner B, agent A, a user in both stores.
   - Owner B requests `/app/<A>/…`, `/app/<B>/pages/<A id>/edit`, preview, history `?page_id=<A>`, media `<A asset>` and
     CSV export.
   - Replay captured `Next-Action` POSTs with A's ids.
   - Tamper the store segment (or session).
   - Cmd+K for A's canary.
   - POST `/api/public/order` with A's pageKey from B's page path.
   - Crawl every screen and API JSON as each B role and grep for A's canaries.
   - Fix QA-01 (port) and QA-02 (cleanup) first.
4. **Extend existing harnesses:** `host-selftest.ts` (tenant hosts 404 dashboard paths once domains exist),
   `security/selftest.ts:175-215` (documentOrigins with verified domains, never a reflected Host),
   `public-api-security.ts` (store-scoped limits), `render-check.ts` (store-path links, store page budgets),
   `upgrade-dry-run` tenancy gate (§2.4). Promote the manual security selftests into `npm test` where they run offline.

---

## 11. Risks and open questions

### 11.1 Risks
- **One forgotten scope.** A single unscoped query, cache key, lock or bucket is a silent cross-tenant leak. The worst
  are the settings cache (decrypted secrets), search, CSV, the render cache, Sheets pull/push and CAPI tokens. Mitigate
  with the §10 gates, `NOT NULL` with no default, FKs and repository-only access.
- **Account takeover paths:** AUTH-08/09/11 and the unwired `resetUserTwoFactorAction` must ship in the same phase as
  `store_members`.
- **Public login on shared hosting:** scrypt memory DoS and email lockout DoS (AUTH-25/26). There is no SMTP, so no
  self-service recovery: platform-admin resets become an operational and social-engineering burden.
- **Shared origin:**
  - Every tenant page, its vendor pixel scripts and the dashboard share one origin, and web storage is shared too.
  - Protection rests entirely on CSP narrowing. A new store page type that forgets `scopeToPublicApi` becomes a
    cross-tenant session-riding hole.
  - Plan a separate dashboard origin as soon as a real domain exists.
- **Contract parity:** PageDoc v2, runtime config v2, payload v2, `order.php`, Sheets columns A-M, and the
  money/offers/php parity tests are frozen. Cart work touches text grammar and Sheets output, so add v3 rather than
  mutating them.
- **Budgets:** the landing chunk is within 30 B of 24,200 B. Store features need separate chunks, and the admin
  `PREVIEW_CSS` (`preview/frame.ts:22`) grows with every section.
- **Static publish vs store chrome:** a nav, logo, theme or price change fans out re-renders across many pages, on one
  Node process with a 5-minute cron and `maxDuration` 120 s. Batch it and cache built themes by spec hash (blend repair
  can run about 110 builds, `generator/theme.ts:231`).
- **DB quota (3 GB):**
  - Full HTML per publish plus media in MariaDB both count against it.
  - Moving chunks out does not shrink InnoDB without `OPTIMIZE TABLE`, which needs a copy's worth of headroom.
  - Hostinger suspends writes, orders included, at the cap.
  - Migrate media to the filesystem early, while the DB is still empty.
- **Filesystem media:**
  - A misconfigured `MEDIA_DIR` inside the build folder is wiped on deploy; the boot check must refuse it.
  - Hostinger file backups of the home directory are unverified.
  - Inode limits: about 9 files per image.
  - If Hostinger runs several Node processes, per-process gates and caches diverge, and deletes evict locally only.
- **Cron capacity:** N stores' Sheets push/pull per tick, all under one service account's Google quota. One shared
  identity is a throughput bottleneck and a single point of compromise.
- **No-orange vs real brands:** an orange brand accent gets shifted (crimson/gold), and uploaded raster logos are not
  filtered. This needs an owner decision and UX.
- **Fraud behaviour change:** scoping the per-phone limit, duplicates and risk to a store changes what call centres rely
  on. Re-test with `public-api-security.ts`.
- **Brand sweep hazard:** renaming "COD Studio" must skip the HKDF salt (`crypto.ts:19`) and the purpose strings, or every
  envelope, TOTP secret and gate cookie breaks.
- **Generic-look drift:** deterministic generation from inputs + seed, with only 3 storylines, makes look-alike stores
  unless a store brand seed and brand inputs enter the pipeline.
- **Global row locks:** `changeGuardingOwners` serialises role changes platform-wide (AUTH-10).
- **Stale docs:** `docs/DESIGN.md` §3 (GEN-14) could lead agents to reintroduce orange.

### 11.2 Open questions for the architect / owner
1. **Dashboard URL:** `/app/<handle>/…` (recommended), `/admin/s/<handle>/…`, or the store in the session with an echo
   check? Public prefix `/s/<handle>` (recommended) vs `/@<handle>` / `/store/<handle>`? Handle rules and renames (308
   history)?
2. **Platform `/`:** marketing + signup? Are platform `/terms` and `/privacy` at the root?
3. **Signup at launch:** open (Turnstile), invite-only, or waitlist? Outbound email now (Hostinger SMTP) or copy-link
   invites + platform resets?
4. **Memberships and roles:** can one user belong to several stores (recommended: yes, so password/2FA/ban are
   platform-only)? Role set per store: owner/admin/editor/agent? Should a store be able to require 2FA? Is support
   impersonation allowed (audited, time-boxed)?
5. **Store mode:** a free toggle or a plan entitlement? What happens to hidden data after a mode switch (read-only vs
   hidden)? Is store #1 the owner's own store, created at bootstrap with mode "landing"?
6. **Product and landing pages:** is a product page generated from the catalog + a store PDP template, with landing pages
   as per-product overrides? Is the single source of truth for price/options the catalog product, with a landing page
   referencing `product_id` (overrides allowed?) or copying?
7. **Rendering:** store pages (home, collections, PDP) as published static versions or rendered on request with cache?
   PageDoc with kinds or a separate StorePageDoc type?
8. **Cart:** in v1 or not (PDP COD buy-now first)? Multi-product shipping rule? Bump/upsell in the cart?
9. **Theme scope:** do store-owned landing pages inherit the store brand by default (`themeMode: 'store'`) or keep their
   own art direction? One archetype per store or per collection? What happens on a theme change: auto-republish via cron,
   or "needs republish"?
10. **Fraud signals:** strictly per store (recommended), or an opt-in aggregated platform network?
11. **Google Sheets identity:** one platform service account + ownership proof, per-store service accounts, or OAuth? PHP
    exports: a per-store key or never embed?
12. **Turnstile, CAPI secrets, pixel library:** platform-provided or per store (Turnstile per store once domains exist)?
    Pixels per store with per-page overrides, or strictly per page as today?
13. **Media:**
    - Per-store asset ids (Option A, recommended) vs shared blobs + `store_assets` (Option B)?
    - Filesystem path outside `public_html` that survives deploys and is backed up (e.g. `/home/u641677794/storegen-media`)?
    - Disk and inode limits?
    - Is `/tmp` shared with COD Studio (CageFS)?
    - One Node process or several?
    - Platform stock library? Copying media between one owner's stores?
14. **Quotas and plans:** from the first release (media bytes, pages, versions, members, orders), or one internal limit
    per store? Is video allowed on small plans?
15. **Time zone, currency, market:** one per store, or several (pages differ today)? Store #1 time zone =
    `Africa/Casablanca`?
16. **Order ids:** keep the global `CMD-XXXXXX` with an optional per-store display prefix/sequence?
17. **`page_versions.store_id`:** denormalised (recommended; free on an empty DB) or join-only?
18. **Envelopes:** v2 with a key id now, or later?
19. **AI settings:** store-level, per user, or per device? Generate all three locales of a multi-language store in one run?
20. **Custom domains:** how many addon/parked domains does the plan allow, with automatic TLS? Base-relative links in
    published HTML now (recommended) vs baking the address and republishing on change?
