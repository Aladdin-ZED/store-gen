# Store Gen SaaS: core contract (tenancy, identity, routing, data, security, storage, jobs, shell, releases)

Status: **core contract, revision 1** (2026-10-24, lead architect). Not yet reviewed (§P is empty). This document is
the contract every build agent follows for everything cross-cutting: the tenant model, identity, routing and domains,
the full table list, the store-scope seam, security, storage, jobs, the admin shell, tests, releases and file
ownership. Product depth lives in six part specs written on top of it: `docs/saas/spec/platform.md`,
`storefront.md`, `landing.md`, `operations.md`, `ai.md`, `design.md`. A part spec may refine the columns of the tables
this document assigns to it (§D.9) and add product behaviour; it may not rename tables, change `store_id` rules,
change a seam signature (§E) or move a file between tracks (§K). Each part spec ends with a section "Requests to the
core"; the core integrates them in revision 2. Where this document and an older doc disagree, this document wins.

Inputs (all settled): `docs/STORE-GEN-BRIEF.md` (owner items 1-15), `docs/HANDOFF.md` (owner rules §2, Hostinger §4),
`docs/saas/TENANCY-MAP.md` (verified map, item ids such as DB-04, AUTH-13), `docs/saas/RESEARCH.md` (decisions cited
here as **R-D1 … R-D53**, feature ids such as PL-04, OP-03), `docs/saas/research/*.md`. Format model: `docs/OFFERS.md`.
Code facts are `path:line` at commit `ab66ba6`. Next.js is 16.4: the request hook is `src/proxy.ts` (not middleware),
Node runtime only (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:253-255`).

Reading order for a build agent: §0 (decisions) → the track you own (§K) → the sections your track's files touch →
§J (tests you must keep green) → §L (find your feature ids).

### Owner summary (plain English)

1. Store Gen becomes one website that hosts many shops. Each seller has their own space, team and data, fully
   separated from other sellers. A seller picks "full store", "landing pages" or "both" and can change it later.
2. You (the platform owner) have a control room at `/admin`, still hidden behind your secret link, with 2FA always on.
3. Sellers sign in at `/login` and work in their own dashboard at `/app/<shop-name>`. One person can work in several
   shops and switch between them.
4. A seller invites teammates with a one-time link (no passwords shared). Roles: owner, admin, call-center manager,
   editor, agent and viewer. Logistics and accountant roles arrive with full stores (R2).
5. Every new seller starts "in review": they can build and preview at once, but publish and take orders only after you
   approve them. Each request comes with a risk score that explains itself.
6. On the temporary Hostinger address, shops live at `…/s/<shop-name>`, and only people you invite can sign up.
7. When you buy a real domain and put it on free Cloudflare, every shop gets `<shop-name>.<your-domain>` and public
   sign-ups (with your approval) open. Old links keep working forever through permanent redirects.
8. Media files move out of the database into a private folder on the hosting account, so the 3 GB database limit
   stays free for orders. Each shop has its own storage limit.
9. Plans exist without prices: "Beta" for everyone now, "Pro" and "Internal" ready. Orders are never blocked by a
   limit; only uploads, publishing, invites and AI use are.
10. You can suspend, restore, export or close any shop, and "view as shop" (read-only, 30 minutes, with a reason; the
    shop sees that you looked).
11. Every important action is written to an audit log, per shop and for the platform.
12. Automatic tests try to read and change one shop's data from another shop. The build fails if any test finds a leak.
13. The work ships in three releases. R1: the platform, landing-page shops, call center, Sheets, Telegram, AI and design
    upgrades, your control room, then the domain move. R2: full stores, accounting, shipping, logo designer. R3:
    custom domains, carrier APIs, reviews, tests and learning loops.
14. Cloud AI stays off until you give a key and a monthly cap. No orange anywhere, as always, even when a seller asks
    for it: the colour picker moves to the nearest allowed colour (an uploaded logo file is never changed).
15. What you need to do later: buy the domain, create the Cloudflare account, and later send sample carrier and ads
    files and have a lawyer review the legal templates (they are marked "needs legal review" until then).

---

## 0. Decisions at a glance

R-D1 … R-D53 (`docs/saas/RESEARCH.md` §2) are adopted as settled. The rows below are the core's own decisions; a row
marked **deviates R-Dx** or **refines R-Dx** changes or sharpens a settled decision and says why.

| # | Decision | Why |
|---|---|---|
| D1 | **The URL is the store context.** Tenant dashboard at `/app/<handle>/…`; a session only stores a hint (`sessions.last_store_id`) for the next sign-in. | Multi-tab safety, shareable links, one explicit store on every request (TENANCY-MAP §6.2). |
| D2 | **Server actions take no store argument.** `storeAction` reads the store from the proxy-set `x-sg-path` request header (the path the action was posted to, which is the page that rendered it) and checks the session's membership in that store. | Actions are callable by id from any route (AUTH-31). The proxy overwrites `x-sg-path`, so it can't be forged; posting to another store's path only moves the request to a store where the membership check fails. No echo argument to forget. |
| D3 | **Five layers keep every query scoped:** a branded `StoreScope` type every data function takes first; helpers `whereStore` / `byId` / `storeValues`; an AST lint in `npm test`; `store_id NOT NULL` with no default + FK `RESTRICT`; a DB-backed two-store attack suite. | One forgotten predicate is a silent leak (TENANCY-MAP §11.1). Types catch most, the lint catches raw SQL and caches, the DB catches forgotten writes, the suite catches logic. |
| D4 | **Store roles:** `owner, admin, manager, editor, agent, viewer` in R1; `logistics` and `accountant` exist in the enum from 0004 and turn on in R2. **Deviates** from the five roles in the task brief (adds `manager`) and from TN-08/TN-12 timing (viewer moves to R1). | The R1 call center (OP-03, OP-09, OP-11) needs a lead who assigns and sees every agent without being an admin. Viewer costs nothing. One enum, no later ALTER. |
| D5 | **Platform roles:** `super_admin, admin, support, analyst`. **Deviates** from the three named in the brief (adds `admin`). | Someone must approve and suspend without managing staff, kill switches or platform security (platform-admin.md §15). |
| D6 | Platform role is a column `users.platform_role` (default `none`), not a table. | `validateSessionToken` already joins `users` (`src/lib/auth/session.ts:118-134`): zero extra queries. |
| D7 | **Entitlements:** `entitlement(store, key)` = override > boost > plan > platform default, **then a lifecycle state cap** (§A.5). There is no "pending plan". **Refines R-D12, R-D15.** | Approval is one status change, not a plan swap; the plan a store has survives approval and restrictions. |
| D8 | Plans `beta` (default for every store), `pro`, `internal` are seeded with starting limits (§A.4), editable in the console. No prices. Orders are never blocked by a quota. | Lead default; R-D15. |
| D9 | **Signup mode default is derived:** `invite` while S mode is off (temporary domain), `approval` once `STORE_ROOT_DOMAIN` + `EDGE_KEY` are set. The console can override. | R-D5 and the lead default; no manual switch to forget on domain day. |
| D10 | **Invites are bound to the invited e-mail.** 32-byte link token, sha256 at rest, shown once, 7 days, single use, revocable; R1 hands the link over by copy (R-D51). | A forwarded or leaked link can't be redeemed by a different account; the inviter never sees a password (AUTH-07). |
| D11 | **Password reset in R1 = a staff-made one-time link** (`password_resets`, 60 min, hashed), sent by the staff member over WhatsApp. Never a temporary password. R2 self-service e-mail uses the same table. | No e-mail exists yet (R-D51); closes AUTH-08. |
| D12 | **"Require 2FA for members" is enforced in the seam from R1** (column `stores.require_member_2fa`, UI in R1). **Deviates** from RESEARCH placing TN-13 in R3. | The check lives in `requireStoreMember`, which freezes in R1.0; adding it later means reopening the frozen seam. It is ~10 lines. |
| D13 | Login throttling per **(e-mail, network)** bucket plus a Turnstile challenge after 3 failures; never a global account lock. `users.failed_logins` / `locked_until` are retired (written by nothing, dropped in 0006). | AUTH-25 (anyone could lock any account out of every store), AUTH-27. |
| D14 | **scrypt semaphore:** 2 concurrent hashes per process, 16 waiting, 4 s wait, then a generic 503 "busy, retry". | AUTH-26: each hash takes 64 MiB on a 3 GB plan shared with COD Studio. |
| D15 | **Impersonation = the staff member's own session tagged with `sessions.impersonation_id`.** The seam builds a synthetic read-only membership for that one store; every write permission is refused in `storeAction` / `storeGuard`. | R-D14; nobody ever signs in as the seller; one code path enforces read-only. |
| D16 | **Custom-domain rewrite prefix is `/d/<host>`, not `/_d/`. Deviates R-D6 naming.** | Folders starting with `_` are private (non-routable) in the App Router (`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md:257-259`). |
| D17 | **On a store host, `/s/<own-handle>/x` answers 308 → `/x` on the same host;** any other `/s/…` is 404. **Refines R-D7 / V1** ("`/s/` on store hosts → 404"). | P-mode HTML published before S mode embeds `/s/<h>/…` links; they keep working the minute S mode turns on, before the re-render batches finish. No cross-store addressing is possible. |
| D18 | **`effectiveHost(headers)` re-verifies the edge key in every caller.** No code trusts a proxy-set "via" flag. | `/media/*` and the upload endpoints bypass the proxy (matcher, `src/proxy.ts:133`), so client headers are not stripped there. |
| D19 | `LEGACY_PLATFORM_HOSTS` (the temporary domain after the move) answer 308 forever to the new domain; their public POST APIs keep working. | R-D3; ads and WhatsApp messages keep the old links. |
| D20 | Product and collection URLs are `/p/<slug>` and `/c/<slug>` (`/products/…`, `/collections/…` 308 to them); order tracking is `/track`; a private preview link is `/preview/<token>` on the platform host only. | Short links for WhatsApp and ads (ST-08); previews of pending stores never touch a store origin. |
| D21 | **Media ids are per store:** `assetId = HMAC(master bytes, 'media-id:' + storeId)[:32]`; dedup only inside a store; no platform stock assets in R1. | TENANCY-MAP Option A (DB-04, DB-05, MED-01): no existence or timing oracle, no shared blobs to refcount. |
| D22 | **`DATA_DIR`** is the one durable private root for media, exports, backups and the media disk cache, outside `process.cwd()` and outside `public_html`; the DB chunk store stays as the fallback backend. | R-D11; Hostinger wipes the build folder on deploy; MED-07 (shared `tmpdir()` with COD Studio). |
| D23 | **One `store_usage` table** holds every counter and gauge; quotas are charged by one conditional `UPDATE … WHERE value + ? <= limit`. | Atomic under concurrency (TENANCY-MAP §7.4); one mechanism for media, members, AI credits, exports. |
| D24 | **One `outbox` table** (kind column) carries webhooks, CAPI retries, Telegram, WhatsApp API, carrier pushes and mail. **Deviates R-D51** (no separate `mail_queue`, same behaviour and caps). | One drainer, one backoff policy, one dead-letter view. |
| D25 | Renders have their own `render_jobs` queue with a nullable unique `dedupe` key (at most one pending job per page). | Address, theme and product changes fan out to many pages; duplicates must collapse (TENANCY-MAP §11.1). |
| D26 | **Migrations are split by release:** `0004_tenancy` (R1.0), `0005_r1` (R1 product), `0006_r2`, `0007_r3`. Only the core maintainer edits `src/lib/db/schema.ts` and `drizzle/**`. | Parallel tracks can't each generate drizzle snapshots; one owner serialises them. |
| D27 | **Store #1 conversion** = guarded SQL in 0004 (constant id `00000000000000000000000001`, only when legacy rows exist) + a JS boot task (envelopes, home page, pixel library, store name) that writes the marker `tenancy_v1` last. | Works on today's empty DBs and on an imported single-tenant dump; idempotent and resumable (TENANCY-MAP §0, §2.4). |
| D28 | Global keys stay global where they are random public identifiers: `orders.id`, `orders.idem`, `leads.idem`, `pages.public_key`, `exports.public_key`, `media_files.key`. Everything else is unique per store. | The public resolver needs them; their randomness carries no store data (DB-14, DB-15, DB-18). |
| D29 | **No composite cross-table FKs;** the only FK is `store_id → stores.id ON DELETE RESTRICT`. | Orders, leads and exports outlive deleted pages; cross-store references are caught by the dry-run counts and the attack suite instead (§F.1). |
| D30 | **Envelope v2** `v2.<kid>.<iv>.<tag>.<ct>`: AES-256-GCM, key = HKDF(APP_SECRET, salt `cod-studio`, info `store:<id>:<purpose>:<kid>` or `platform:<purpose>:<kid>`), AAD = the same scope string. v1 stays readable forever. The salt and existing purposes never change. | Per-store keys (SET-02), a key id for later rotation, ciphertext copied between rows fails; the brand-sweep hazard (TENANCY-MAP §11.1). |
| D31 | **Security headers are set by each response producer** (`UNKNOWN_PAGE_HEADERS`, `documentResponse`, `apiHeaders`, the media route, the proxy's own answers), checked by an HTTP header test. Not `next.config` `headers()`. | Today's 404s carry none (`src/lib/auth/unknown-page.ts:52-56`). Producer-set headers are explicit and testable; the precedence of config headers over handler headers is not documented for this version. |
| D32 | **Restricted** = pages stay live, order and lead APIs answer `unavailable`, publish is blocked. **Suspended** = neutral 404 by default (no oracle), an optional neutral "temporarily unavailable" 503 per store. Resolves domains.md (503) vs platform-admin.md (404). | Victims of a scam store learn nothing; a legit seller under review keeps their pages visible. |
| D33 | One cron **job runner** with per-job budgets inside a 100 s tick, per-store round-robin cursors and a `job_runs` row per run. The `?key=` cron form is accepted in R1 and removed in R2 (header only). | SHT-11, OS-08; keys in URLs reach access logs. |
| D34 | Logical backups are **encrypted at rest** (AES-GCM, purpose `backup:v1`), NDJSON slices under `DATA_DIR/backups`. | A copied backup file must not leak customers; the owner keeps APP_SECRET offline (R-D52). |
| D35 | `headline_shingles` rows carry an opaque `owner_tag` (truncated HMAC of the store id), never returned by any API. **Refines R-D37** ("no store ids"). | A purged store's shingles must be deletable. |
| D36 | Admin i18n: a message catalog from R1 with `en` complete; `ar`/`fr`/`en` in R1 for the public auth pages, onboarding, the agent console, order tracking and thank-you additions; French dashboard R2; Arabic RTL dashboard R3 (UX-08). | Agents and shoppers are Moroccan; the full dashboard translation is an L effort. |
| D37 | `allowSellerBrandOrange = false` (platform setting): generated palettes and the brand colour picker never produce orange (nearest allowed hue, with a visible note); an uploaded logo file is never recoloured. | Owner rule 1 and the lead default for RESEARCH §6.3 Q4. |
| D38 | Carrier statement, ads and product files are read by **generic CSV importers with a saved column mapping per store** (`import_mappings`); presets are added when real files arrive. | Lead default (Q5); no guessed formats. |
| D39 | Legal pages and platform legal documents are **templates flagged `needs_legal_review`**; no invented claims, ids or numbers. | Lead default (Q6); owner rule 4. |
| D40 | Cloud AI ships **disabled** until the owner sets `ANTHROPIC_API_KEY` and a monthly cap in the console. | R-D28, R-D29, lead default (Q2). |
| D41 | Money in new tables is **integer cents** (`bigint`); existing `decimal(12,2)` columns stay. | Offers D9: one integer engine for server, runtime and PHP. |
| D42 | `orders.source` gains `manual`, `api`, `storefront`, `whatsapp` (appended); no separate `channel` column. | One enum the Sheets/CSV/PHP code already reads; appending values is safe. |
| D43 | Tenant data scoping and the dashboard move to `/app/<handle>` are **one** R1.0 track. | They touch the same ~45 files (TENANCY-MAP §0: ~130 `/admin` literals, ~225 query sites). |
| D44 | The console stays on the apex at `/admin/**` behind the gate in R1 (R-D4); staff use the same `/login`; `ADMIN_HOST` (`console.<domain>`) is P1. | R-D4. |
| D45 | Public `/api/health` answers minimal JSON with `app: "store-gen"`. | Uptime checks and the e2e server-identity assertion (QA-01). |
| D46 | Realtime = visibility-aware 15 s polling of `/api/app/<h>/pulse` (cached 5 s per store). | R-D50. |
| D47 | `typescript` (already installed, 5.9.3) is declared as a devDependency for the AST tenancy lint. | No download; the compiler API is the reliable way to find query sites. |
| D48 | Store pages and landing pages stay **base-path aware at render**: in-page links are absolute paths built from `storeBase()` (`/s/<h>` in P mode, empty in S/C); canonical, og and JSON-LD are absolute; an address change enqueues re-renders. | Domains.md §4.4; document-relative links break under `/s/<h>/slug`. |
| D49 | Agent fields live in `agent_profiles`, not in `store_members`. | The membership row stays the security core; call-center state changes every minute. |
| D50 | **A re-render (address, brand, product change) rewrites only the rendered columns of the current published version row in place** (html, csp, etag); the doc, checksum and `runtime_v` never change and no version row is added. | A re-render is not a publish; a new 600-900 KB version per page per change would eat the 3 GB quota (TENANCY-MAP DB-03). |

---

## A. Tenant model

### A.1 Platform → stores → members

```
platform (one deployment, one DB)            users (global identities: e-mail, password, 2FA, platform_role, ban)
 └─ stores (tenants; handle, mode, status, plan, market, currency, timezone)
     └─ store_members (user × store × role × status)        a user may be a member of any number of stores
         └─ everything else: pages, versions, assets, orders, leads, customers, settings, integrations, AI, …
```

Invariants (enforced in code and tested in §J):
1. Every tenant row carries `store_id varchar(26) NOT NULL` (no default) with FK `→ stores.id ON DELETE RESTRICT`.
   Tenant tables are listed in §D.3; `audit_log`, `notifications`, `error_events`, `job_runs`, `outbox` and the
   other "P (opt. store)" tables of §D.3 are platform tables with a **nullable** `store_id` (NULL = platform event).
2. A store always has **≥ 1 active `owner`** member (except in `rejected`, `scheduled_deletion`, `purged`). Role
   changes lock only that store's `store_members` rows (`SELECT … FOR UPDATE WHERE store_id = ?`), never every user
   (fixes AUTH-10).
3. Password, 2FA, e-mail and ban belong to the **user** and are platform-only operations (AUTH-08, AUTH-09, AUTH-11,
   AUTH-12). A store can only add, suspend or remove its **membership** of a user; a membership change applies on the
   next request because the seam reads the membership row each request (cached ≤ 5 s, §E.6).
4. Store identity used by renders (name, logo, contacts) comes from the store row + store settings, never from a
   global setting (PUB-06, SET-10).
5. A client never sends a `store_id` that the server trusts. The store comes from the URL path (`/app/<handle>`,
   `/s/<handle>`), the host (S/C modes) or a server-side lookup of a random public key (`pageKey`, export key,
   upsell token), never from a body field (TENANCY-MAP §7.3).

### A.2 Store mode

`stores.mode enum('landing','store','both')`, chosen at onboarding, changeable by the owner (`store.mode`
permission) and gated by the entitlements `mode_landing` / `mode_store` / `mode_both` (TN-09). In R1 only `landing` is
selectable (the store product ships in R2); `store` and `both` rows can exist (seeded tests, `internal` stores) and
render the R1 landing feature set.

| Capability | `landing` | `store` (R2) | `both` (R2) |
|---|---|---|---|
| Landing pages (Pages, Generate, builder, versions, exports, per-page pixels, thank-you upsell) | yes | hidden by default (an "also use landing pages" toggle shows them) | yes |
| Catalog, storefront chrome, store page kinds, cart/checkout | no | yes | yes |
| Store home `/s/<h>` (P) or `/` (S/C) | `stores.home_page_id` (a landing page) or the store's branded "no page yet" | storefront home | storefront home |
| Orders, call center, Sheets, pixels library, members, audit, brand kit, AI | yes | yes | yes |

A mode switch **hides, never deletes** (TENANCY-MAP §8.2): navigation, ⌘K and checklists filter by
`modeAllows(mode, feature)`; data stays and reappears when the mode allows it again. Public routes of a hidden
capability answer the store's 404.

```ts
// src/lib/tenancy/mode.ts (pure, isomorphic)
export const STORE_MODES = ["landing", "store", "both"] as const;
export type StoreMode = (typeof STORE_MODES)[number];
export type ModeFeature = "landing" | "catalog" | "storefront" | "cart";
export function modeAllows(mode: StoreMode, feature: ModeFeature, opts?: { landingInStoreMode?: boolean }): boolean;
```

### A.3 Roles and permissions

All in `src/lib/auth/permissions.ts` (pure, isomorphic, owned by the core; client code imports it only to hide
controls, the server always re-checks).

```ts
export const STORE_ROLES = ["owner", "admin", "manager", "editor", "agent", "logistics", "accountant", "viewer"] as const;
export type StoreRole = (typeof STORE_ROLES)[number];
/** roles that can be granted in this release (logistics, accountant: R2) */
export const ACTIVE_STORE_ROLES: readonly StoreRole[];
/** rank for "can't grant or manage a role at or above your own" (owner may grant owner) */
export const ROLE_RANK: Record<StoreRole, number> = { owner: 100, admin: 80, manager: 60, editor: 40, logistics: 40, accountant: 40, agent: 20, viewer: 10 };
export const PLATFORM_ROLES = ["super_admin", "admin", "support", "analyst"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export interface PermissionDef { write: boolean; sensitive?: true; readOnlyOk?: true /* allowed in suspended/closed */; release: "R1" | "R2" | "R3"; mode?: ModeFeature }
export const STORE_PERMISSIONS = { /* every key of §A.3.1 */ } as const satisfies Record<string, PermissionDef>;
export type StorePermission = keyof typeof STORE_PERMISSIONS;                   // a string-literal union, never `string`
export function can(role: StoreRole, p: StorePermission): boolean;               // matrix only
export function invitableRoles(role: StoreRole): readonly StoreRole[];          // §B.5
export function canManageMember(actor: StoreRole, target: StoreRole): boolean;  // rank rule
export const PLATFORM_PERMISSIONS = { /* every key of §A.3.3 */ } as const satisfies Record<string, { stepUp: boolean }>;
export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;
export function canPlatform(role: PlatformRole, p: PlatformPermission): boolean;
export const STEP_UP_PERMISSIONS: ReadonlySet<PlatformPermission>;              // §B.7
```

The seam evaluates `can(role, p) && modeAllows(store.mode, def.mode) && releaseOn(def.release) && stateAllows(store.status, def.write)`
(§E.2). The legacy `Role`/`Permission` exports (`owner/editor/agent` × 10 keys, `src/lib/auth/permissions.ts:6-38`)
are removed in R1.0; `homePathFor` is replaced by `landingPathFor(memberships)` (§B.4).

#### A.3.1 Store permission keys

`w` = write (refused during read-only impersonation and in read-only states, unless marked `ro`); `s` = sensitive
(refused to impersonation even as a read; every use writes an audit row or an `order_events` row); `ro` =
`readOnlyOk` (still allowed while the store is `suspended` or `closed`).

| Key | w | s | Rel. | Mode | Meaning |
|---|---|---|---|---|---|
| `store.read` | | | R1 | | open the dashboard of the store |
| `reports.read` | | | R1 | | KPI dashboards and aggregates (no customer data) |
| `settings.read` | | | R1 | | read store settings (secrets always masked) |
| `settings.write` | w | | R1 | | profile, market, policies, anti-spam, AI settings, notifications |
| `checkout.write` | w | | R1 | | delivery zones, checkout field model |
| `store.mode` | w | | R1 | | change the store mode |
| `store.close` | w, ro | s | R1 | | close the store (owner self-service), reopen within 30 days |
| `store.export` | | s | R1 | | request and download the full data export ZIP (a read: allowed in read-only states) |
| `members.read` | | | R1 | | team list and pending invites |
| `members.invite` | w | | R1 | | create and revoke invites (within `invitableRoles`) |
| `members.manage` | w | | R1 | | change roles, suspend, remove members (rank rule) |
| `security.write` | w | | R1 | | "require 2FA for members", support grants (R3) |
| `audit.read` | | | R1 | | store audit log |
| `billing.read` | | | R1 | | plan, usage meters |
| `billing.manage` | w | | R1 | | request a plan change, see subscription history |
| `domains.manage` | w | | R1 | | store address card (R1), handle rename (R1), custom domains (R3) |
| `pages.read` | | | R1 | | pages list, builder (read), previews, history |
| `pages.write` | w | | R1 | | create, edit, duplicate, archive pages |
| `pages.publish` | w | | R1 | | publish, unpublish, set home page |
| `media.read` | | | R1 | | media library (TENANCY-MAP §0: this key did not exist; reads used `pages.read`) |
| `media.write` | w | | R1 | | upload, edit focus/alt, delete media |
| `export.create` | w | | R1 | landing | website ZIP, connected, PHP, WhatsApp exports |
| `brand.write` | w | | R1 | | brand kit (R1 basic: logo upload, colours, voice), logo designer (R2) |
| `pixels.manage` | w | | R1 | | add pixel ids to the library, labels, test windows (Offers D6: only owners add ids) |
| `integrations.manage` | w | s | R1 | | Sheets, CAPI/Events tokens, Telegram, WhatsApp templates, webhooks (R2), carriers (R2), export key |
| `ai.use` | w | | R1 | | run generators and rewrites (cloud chip when enabled) |
| `ai.manage` | w | | R1 | | store AI mode, brand voice, memory |
| `orders.read` | | | R1 | | orders visible to the member (agents: their queue only) |
| `orders.read_all` | | | R1 | | every order of the store |
| `orders.write` | w | | R1 | | status moves, attempts, notes on visible orders |
| `orders.create` | w | | R1 | | manual / phone / DM orders (OP-08) |
| `orders.edit` | w | | R1 | | edit lines, quantities, address after creation (re-priced, audited) |
| `orders.assign` | w | | R1 | | assign, reassign, release leases |
| `orders.force_status` | w | | R1 | | illegal-transition override with a reason (OP-01) |
| `orders.reveal_phone` | | s | R1 | | unmask a phone (writes `phone_revealed`, OP-07) |
| `orders.export` | | s | R1 | | CSV export of orders and leads |
| `leads.read` | | | R1 | | abandoned-lead inbox |
| `leads.write` | w | | R1 | | lead statuses, contact attempts |
| `customers.read` | | | R1 | | customer profiles and history (phones masked unless `orders.reveal_phone`) |
| `blocklist.write` | w | | R1 | | block / unblock phones and IPs |
| `callcenter.configure` | w | | R1 | | calling window, retry ladder, scripts, quick replies, assignment mode |
| `agents.self` | w | | R1 | | own presence, "Next order", own KPIs and (R2) earnings |
| `catalog.read` | | | R2 | catalog | products, collections, inventory |
| `catalog.write` | w | | R2 | catalog | edit the catalog |
| `storefront.write` | w | | R2 | storefront | store theme, menus, store pages |
| `shipments.write` | w | | R2 | | shipments, manifests, carrier imports |
| `finance.read` | | | R2 | | accounting screens |
| `finance.write` | w | | R2 | | costs, ad spend, expenses, remittance imports |
| `commissions.manage` | w | | R2 | | commission rules |
| `payouts.approve` | w | s | R2 | | approve and mark payouts paid |
| `reviews.moderate` | w | | R3 | | hide/show verified reviews |
| `support.grant` | w | s | R3 | | grant platform support write access (PL-15) |

#### A.3.2 Store role matrix

✓ = granted. `agent*` = only orders in the agent's own queue (assigned to or claimed by them).

| Key | owner | admin | manager | editor | agent | logistics (R2) | accountant (R2) | viewer |
|---|---|---|---|---|---|---|---|---|
| store.read, reports.read | ✓ | ✓ | ✓ | ✓ | ✓ (own KPIs only) | ✓ | ✓ | ✓ |
| settings.read | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | |
| settings.write, checkout.write | ✓ | ✓ | | | | | | |
| store.mode, store.close, billing.manage, security.write, support.grant | ✓ | | | | | | | |
| store.export | ✓ | ✓ | | | | | | |
| members.read | ✓ | ✓ | ✓ | | | | | |
| members.invite | ✓ | ✓ | ✓ (agents only) | | | | | |
| members.manage | ✓ | ✓ (below admin) | | | | | | |
| audit.read, billing.read | ✓ | ✓ | | | | | | |
| domains.manage | ✓ | ✓ | | | | | | |
| pages.read, media.read | ✓ | ✓ | ✓ | ✓ | | | | ✓ |
| pages.write, pages.publish, media.write, export.create, brand.write, ai.use | ✓ | ✓ | | ✓ | | | | |
| pixels.manage, integrations.manage, ai.manage | ✓ | ✓ | | | | | | |
| orders.read | ✓ | ✓ | ✓ | | ✓* | ✓ | ✓ (masked) | |
| orders.read_all | ✓ | ✓ | ✓ | | | ✓ | ✓ | |
| orders.write | ✓ | ✓ | ✓ | | ✓* | ✓ (ship axis) | | |
| orders.create, orders.edit | ✓ | ✓ | ✓ | | ✓* | | | |
| orders.assign, orders.force_status, blocklist.write, callcenter.configure | ✓ | ✓ | ✓ | | | | | |
| orders.reveal_phone | ✓ | ✓ | ✓ | | ✓* | ✓ | | |
| orders.export | ✓ | ✓ | | | | | | |
| leads.read, leads.write | ✓ | ✓ | ✓ | | ✓* | | | |
| customers.read | ✓ | ✓ | ✓ | | ✓* | ✓ | ✓ (no phones) | |
| agents.self | ✓ | ✓ | ✓ | | ✓ | | | |
| catalog.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| catalog.write, storefront.write | ✓ | ✓ | | ✓ | | | | |
| shipments.write | ✓ | ✓ | ✓ | | | ✓ | | |
| finance.read | ✓ | ✓ | | | | | ✓ | |
| finance.write | ✓ | ✓ | | | | | ✓ | |
| commissions.manage, payouts.approve | ✓ | ✓ | | | | | | |
| reviews.moderate | ✓ | ✓ | | ✓ | | | | |

Hard rules no permission can override: nobody below `owner` can change the mode, close the store, grant `owner` or
remove the last owner; a member can't change their own role; `invitableRoles(owner)` = all active roles,
`invitableRoles(admin)` = roles with rank < 80, `invitableRoles(manager)` = `["agent"]`, everyone else `[]`.
The **impersonation** membership (§B.8) has every non-write, non-sensitive key and nothing else.

#### A.3.3 Platform permissions

All console code goes through `platformAction` / `requirePlatform` (§E.2). Every platform session needs
`totpEnabled && mfaPassed` (§B.7). `↑` = step-up (TOTP again within 5 min).

| Key | super_admin | admin | support | analyst | ↑ |
|---|---|---|---|---|---|
| `console.read` (overview, stores list, store profile with masked PII) | ✓ | ✓ | ✓ | ✓ (no notes) | |
| `stores.notes` | ✓ | ✓ | ✓ | | |
| `signups.decide` (approve, reject, request info, snooze) | ✓ | ✓ | | | |
| `stores.lifecycle` (restrict, suspend, restore) | ✓ | ✓ | | | ↑ (suspend) |
| `stores.close` (close, schedule deletion) | ✓ | ✓ | | | ↑ |
| `stores.purge` (immediate purge: four-eyes or 24 h delay) | ✓ | | | | ↑ |
| `stores.impersonate` (read-only view as store) | ✓ | ✓ | ✓ (ticket ref required) | | |
| `pii.reveal` (one order) | ✓ | ✓ | | | ↑ |
| `users.manage` (ban, 2FA reset, reset link, force sign-out) | ✓ | ✓ | | | ↑ |
| `plans.manage` | ✓ | | | | |
| `entitlements.override` (overrides and boosts) | ✓ | ✓ | | | |
| `flags.manage` (release / ops flags) | ✓ | ✓ | | | |
| `kill.manage` (kill switches) | ✓ | | | | ↑ |
| `notify.stores` (message one store; broadcasts R3) | ✓ | ✓ | ✓ (one store) | | |
| `tickets.handle` (R3) | ✓ | ✓ | ✓ | | |
| `analytics.read` (k ≥ 5 aggregates) | ✓ | ✓ | | ✓ | |
| `health.read` | ✓ | ✓ | ✓ | ✓ | |
| `domains.manage` (console Domains view, custom domain approvals R3) | ✓ | ✓ | | | |
| `ai.platform` (model, caps, prompt versions, eval gate) | ✓ | | | | ↑ (cap and key) |
| `backups.manage` (download, retention) | ✓ | | | | ↑ |
| `legal.manage` (platform documents and store templates) | ✓ | | | | |
| `staff.manage`, `platform.settings`, `audit.platform` | ✓ | | | | ↑ (staff) |

### A.4 Plans and entitlements (R-D15, PL-11)

```ts
// src/lib/tenancy/entitlements.ts (server-only; the key registry is isomorphic in entitlement-keys.ts)
export const ENTITLEMENTS = {
  // limits (number | null = unlimited)
  media_bytes:            { kind: "limit", unit: "bytes", default: 1 * GiB },
  pages_max:              { kind: "limit", default: 50 },
  products_max:           { kind: "limit", default: 200, release: "R2" },
  members_max:            { kind: "limit", default: 10 },
  agents_max:             { kind: "limit", default: 10 },
  versions_kept_per_page: { kind: "limit", default: 30 },
  exports_month:          { kind: "limit", default: 50 },
  ai_credits_month:       { kind: "limit", default: 300 },     // 1 credit = $0.01 of provider cost (AI-01)
  webhooks_max:           { kind: "limit", default: 5, release: "R2" },
  custom_domains_max:     { kind: "limit", default: 0, release: "R3" },
  orders_month_soft:      { kind: "limit", default: null },     // banner + console flag only, never a refusal
  // features (boolean)
  publish: { kind: "feature", default: true },  take_orders: { kind: "feature", default: true },
  mode_landing: { kind: "feature", default: true }, mode_store: { kind: "feature", default: true }, mode_both: { kind: "feature", default: true },
  sheets: { kind: "feature", default: true },   pixels_capi: { kind: "feature", default: true },  php_export: { kind: "feature", default: true },
  telegram: { kind: "feature", default: true }, cloud_ai: { kind: "feature", default: true },     invites: { kind: "feature", default: true },
  webhooks: { kind: "feature", default: true, release: "R2" }, accounting: { kind: "feature", default: true, release: "R2" },
  commissions: { kind: "feature", default: true, release: "R2" }, api_keys: { kind: "feature", default: false, release: "R3" },
  custom_domain: { kind: "feature", default: false, release: "R3" }, experiments: { kind: "feature", default: false, release: "R3" },
  remove_platform_badge: { kind: "feature", default: false },
} as const satisfies Record<string, EntitlementDef>;
export type EntitlementKey = keyof typeof ENTITLEMENTS;
export type EntitlementValue<K extends EntitlementKey> = (typeof ENTITLEMENTS)[K]["kind"] extends "limit" ? number | null : boolean;

export function entitlement<K extends EntitlementKey>(scope: StoreScope, key: K): Promise<EntitlementValue<K>>;
export function entitlements(scope: StoreScope): Promise<ResolvedEntitlements>;        // all keys, one query, cached 30 s
export function assertFeature(scope: StoreScope, key: FeatureKey): Promise<void>;      // throws EntitlementError
export function assertWithin(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void>; // throws QuotaError (no charge)
export function chargeUsage(scope: StoreScope, metric: UsageMetric, delta: number): Promise<ChargeResult>; // atomic, §D.7
export function refundUsage(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void>;
export function invalidateEntitlements(storeId: string): void;
export class QuotaError extends Error { readonly metric: UsageMetric; readonly limit: number; readonly used: number }
export class EntitlementError extends Error { readonly key: FeatureKey; readonly reason: "plan" | "state" | "release" | "kill" }
```

Resolution, per key: `override (not expired) > boost (not expired) > plan.limits/features[key] > ENTITLEMENTS[key].default`,
then **`applyStateCap(status, key, value)`** (§A.5.2), then platform kill switches (`publishing_enabled`,
`uploads_enabled`, `ai_generation_enabled`, `sheets_sync_enabled`, `capi_enabled`, `signups_enabled`,
`platform_read_only`) force the matching features to `false` (§H.8). Usage metrics (`UsageMetric`): `media_bytes`,
`pages`, `products`, `members`, `agents`, `webhooks`, `custom_domains` (gauges, period `total`) and the monthly counters `exports`, `ai_credits`, `orders`
(period `YYYY-MM` in the store's timezone); a `UsageMetric` is `{ metric, period }` (§D.7). The UI turns `QuotaError` / `EntitlementError` into the premium "limit reached"
sheet (platform.md), never a generic error. **Orders are never refused for a quota**: `take_orders` is `false` only
through a lifecycle state (§A.5.2); no kill switch touches it, and `platform_read_only` keeps orders flowing (§H.8).

Seeded plans (`0004`, `INSERT IGNORE`; the owner edits them in the console; values are starting points, not
researched):

| Plan | `limits` overrides | `features` overrides |
|---|---|---|
| `beta` (default for new stores) | none (registry defaults) | none |
| `pro` | media_bytes 5 GiB, pages_max 200, products_max 2000, members_max 30, agents_max 30, exports_month 200, ai_credits_month 1500, webhooks_max 10 | api_keys, experiments, custom_domain (R3), remove_platform_badge |
| `internal` (platform-owned stores) | every limit `null` | every feature `true` |

### A.5 Store lifecycle (R-D13, PL-08)

#### A.5.1 States and transitions

`stores.status enum('pending','active','restricted','suspended','closed','scheduled_deletion','purged','rejected')`,
with `status_reason` (code), `status_note`, `status_changed_at`, `status_changed_by`, `purge_after`.

| From → to | Who | Step-up | Store notified | Audit action |
|---|---|---|---|---|
| (signup) → `pending` | system | | — | `store.created` |
| (bootstrap, console "create internal store") → `active` | super_admin | | — | `store.created` |
| `pending` → `active` | `signups.decide` | | yes | `platform.signup.approved` |
| `pending` → `rejected` | `signups.decide` | | yes (+ one appeal) | `platform.signup.rejected` |
| `rejected` → `pending` (appeal accepted) | `signups.decide` | | yes | `platform.signup.reopened` |
| `active` → `restricted` / back | `stores.lifecycle` | | yes, with the reason | `platform.store.restricted` / `.restored` |
| `active`/`restricted` → `suspended` | `stores.lifecycle` | ↑ | yes | `platform.store.suspended` |
| `suspended` → `active` / `restricted` | `stores.lifecycle` | | yes | `platform.store.restored` |
| `active`/`restricted`/`suspended`/`pending` → `closed` | owner (`store.close`, typed handle confirmation) or `stores.close` | ↑ (staff) | yes | `store.closed` / `platform.store.closed` |
| `closed` → previous state (≤ 30 days) | owner (only if it was `active` or `restricted`) or `stores.close` | | yes | `store.reopened` |
| `closed` → `scheduled_deletion` | cron when `purge_after` (closed_at + 30 d) passes, or `stores.close` | ↑ | yes | `store.deletion_scheduled` |
| `scheduled_deletion` → `closed` (cancel) | super_admin, until the purge job starts | ↑ | yes | `platform.store.deletion_cancelled` |
| `scheduled_deletion` → `purged` | purge job (§H.9), 24 h after scheduling | | — | `store.purged` |
| any → `purged` immediately | `stores.purge`: two different staff confirm, or one super_admin + 24 h delay | ↑ | — | `platform.store.purge_requested/confirmed` |
| `rejected` (30 days) → `purged` | cron | | — | `store.purged` |

`src/lib/tenancy/lifecycle.ts`: `transitionStore(ctx: PlatformCtx | StoreCtx | SystemCtx, storeId, to, { reason, note })`
validates the edge against `ALLOWED_TRANSITIONS`, writes the row with a compare-and-set on the old status, writes the
audit row and a notification, calls `invalidateStore(storeId)` (store row cache, render cache, entitlements, settings,
§E.6) and, for `restricted`/`suspended`/`closed`, releases agent leases. A purged store keeps a **tombstone** row:
`status='purged'`, `handle=NULL`, `name='(purged)'`, every other column kept for the audit trail; the handle moves to
`store_handle_history` (quarantine 180 days, R-D53).

#### A.5.2 State caps (applied by `applyStateCap`)

| Key | pending | active | restricted | suspended | closed | scheduled_deletion / purged / rejected |
|---|---|---|---|---|---|---|
| publish, take_orders | false | plan | false | false | false | false |
| sheets, pixels_capi, telegram, webhooks, php_export, custom_domain, api_keys | false | plan | plan (existing orders only) | false | false | false |
| cloud_ai, invites | plan | plan | plan | false | false | false |
| media_bytes | min(plan, 100 MiB) | plan | plan | plan (no uploads: seam is read-only) | plan | — |
| members_max | min(plan, 2) | plan | plan | plan | plan | — |
| exports_month | 0 | plan | plan | plan | plan | — |

#### A.5.3 Behaviour per state

| State | Public store pages | Public APIs (order, lead, event, upsell, track) | Tenant dashboard | Cron work for the store | Media `/media/<key>` |
|---|---|---|---|---|---|
| `pending` | neutral 404; private `/preview/<token>` links work | order/lead: `unavailable`; event: 204 ignored; track: 404 | full building (generate, edit, preview, upload within cap); publish/integrations show "after approval" | AI batches only | served (drafts, previews) |
| `active` | live | open | full | all | served |
| `restricted` | live (published HTML unchanged) | order/lead: `unavailable` (the runtime shows its generic "try again / WhatsApp" state); event, upsell-of-existing, track: open | full, with a banner and the reason; publish blocked | Sheets push+pull, CAPI and Telegram for **existing** orders; renders | served |
| `suspended` | neutral 404 (default) or a neutral 503 "temporarily unavailable" with `Retry-After: 86400` (console toggle `stores.suspend_notice`) | all refused (`unavailable`), track 404 | **read-only** (every write refused by the seam) + export + the support ticket link | one final Sheets push of orders already placed, then nothing | 404 |
| `closed` | 404 | refused | owner/admin: read-only + export + "reopen" (≤ 30 days); others: "store closed" page | none | 404 |
| `scheduled_deletion` | 404 | refused | "scheduled for deletion" page only | purge job only | 404 |
| `purged` | handle quarantined: **410** neutral page | refused | none | none | 404 |
| `rejected` | 404 | refused | "application not approved" page with one appeal | none | 404 |

The status is read through the cached store row (`getStoreById` / `resolveStoreByHandle`, §E.5, 15 s TTL, invalidated on
transition in this process; other processes, if Hostinger ever runs more than one, converge within the TTL:
platform-admin.md §21). Published HTML is never re-rendered for a state change.

---

## B. Identity

### B.1 Surfaces

| Path (platform host only) | What | Guard |
|---|---|---|
| `/login`, `/login/verify` | sign-in, then the TOTP step (today's `src/app/admin/(auth)/login/**` moved and rebranded) | public; buckets §B.3 |
| `/signup` | account + first store (modes §B.2) | public; Turnstile; `signups_enabled` kill switch |
| `/invite/<token>` | accept a store invite (§B.5) | public; token |
| `/reset/<token>` | set a new password from a reset link (§B.9) | public; token |
| `/app/account/**` | profile, password, 2FA, sessions/devices, admin locale, on-device AI tier | `requireUser()` (no store) |
| `/app/new` | create another store (onboarding, UX-01) | `requireUser()`; `p:store:create:<userId>` 3/day |
| `/admin/setup` | first super_admin + first store (§B.11) | gate + `SETUP_TOKEN`, only while no `super_admin` exists |

All of them render with the platform nonce CSP, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and
`Referrer-Policy: no-referrer` on token pages (`/invite/*`, `/reset/*`), set by the proxy (§C.3). Forms are server
actions wrapped in `publicAction` (§E.2): Turnstile check (when configured), burst limit, DB buckets, generic answers.

### B.2 Signup (PL-01, PL-02, PL-03, TN-05)

Signup modes (platform setting `platform.signup.mode`): `closed` (no form; console invites only) · `invite` (a
platform invite code is required, §B.6) · `approval` (anyone; the store starts `pending`) · `waitlist` (e-mail + phone
only, saved to `waitlist`; staff promote entries to invites) · `open` (approval mode, but a score `< fastLaneMax`
auto-approves). Default when no value is stored: `invite` if S mode is off, `approval` if it is on (D9).

Form fields: name, e-mail, password (policy `checkPasswordPolicy`, `src/lib/auth/password.ts`), phone (E.164 via
`libphonenumber-js`, used for identity links and the risk score, never shown to other tenants), store name, handle
(live availability check), mode (R1: landing), market (default MA), invite code (invite mode), acceptance of the
current ToS/Privacy/AUP versions (§D.5 `legal_acceptances`).

Order of checks in `signupAction` (`src/app/(public)/signup/actions.ts`, logic in `src/lib/auth/signup.ts`):
1. `burstLimit("signup", ip)` (in memory) → `rateLimit(p:signup:ip:<ipHash>, 5, 3600)`.
2. Turnstile (platform widget, `platform_turnstile`) when configured; missing/invalid → refused in `open`, scored +20
   otherwise (PL-03).
3. Zod validation; handle rules (§C.7); invite code (invite mode) checked with `SELECT … FOR UPDATE` inside the
   transaction below.
4. scrypt hash through the semaphore (§B.3).
5. `scoreSignup()` (`src/lib/platform/signup-risk.ts`, contract `{ score: 0-100, flags: SignupFlag[] }`, the
   `scoreRisk` pattern of `src/lib/orders/risk.ts:42`) with a 2 s budget (MX lookup fail-open); signals detailed in
   platform.md. A stub returning `{ score: 0, flags: [] }` ships in R1.0 (§K.1).
6. One transaction: insert `users` (platform_role `none`), `stores` (status `pending`, or `active` when the mode is
   `invite` and the invite says `autoApprove`), `store_members` (owner), `signup_reviews` (score + signals),
   `identity_links`, `legal_acceptances`, consume the invite code. A duplicate e-mail or handle rolls back with a generic
   answer: "These details can't be used to create an account. If you already have one, sign in." (no field named).
7. Session created (mfaPassed true: tenants have no mandatory 2FA, §B.7), redirect to `/app/<handle>` onboarding.

A `pending` store is a sandbox (§A.5.2): everything except publish, orders and integrations works at once (R-D12).

### B.3 Login (TN-05; AUTH-22, AUTH-25, AUTH-26, AUTH-27)

- **Buckets** (all `p:`): `p:login:ip:<ipHash>` 10 / 15 min (all outcomes) · `p:login:acctnet:<hmac(email|netHash)>`
  5 / 15 min · `p:login:acct:<hmac(email)>` 20 / 15 min. Past 3 failures in either account bucket, the form requires a
  Turnstile token (the server answers `{ challenge: true }`; the platform widget renders); past the account-network
  limit the answer is the generic "Too many attempts, wait a few minutes", **for that network only**. No hard account
  lock; `failed_logins`/`locked_until` are no longer read or written (dropped in 0006).
- **scrypt semaphore** `withScryptSlot(fn)` in `src/lib/auth/password.ts`: 2 concurrent, 16 waiting, 4 s max wait →
  `AuthBusyError` → HTTP 503 with the generic busy message. Used by login, signup, invite accept, reset, password
  change. Unknown e-mails still burn the dummy hash (`DUMMY_HASH`, `password.ts:24`) inside the semaphore.
- After a correct password: TOTP users get the pending-MFA session (`MFA_PENDING_TTL_MS`, unchanged) and
  `/login/verify`; others get a full session. The answer never says whether the e-mail exists.
- `loginAccount()` returns `{ userId, memberships: MembershipSummary[], platformRole }` instead of a role; the action
  redirects to a safe `next` (`safeAppPath`, widened `SAFE_PATH_RE` for `/app/…` and `/admin/…`, AUTH-21) or to
  `landingPathFor()`.

### B.4 Sessions and store context (TN-07)

`sessions` gains `last_store_id`, `impersonation_id`, `step_up_at` (§D.2). Cookies are unchanged: `__Host-cs`
(session) and `__Host-csg` (console gate), host-only on the platform host, never `Domain=` (R-D7).

```ts
// src/lib/auth/landing.ts
export interface MembershipSummary { storeId: string; handle: string; name: string; role: StoreRole; status: "active" | "suspended"; storeStatus: StoreStatus; mode: StoreMode; logoKey?: string }
export function landingPathFor(m: readonly MembershipSummary[], lastStoreId: string | null, platformRole: PlatformRole | "none"): string;
// 0 usable memberships → "/app/new" (or "/admin" for staff with no store); 1 → "/app/<h>"; many → last_store_id if still usable, else "/app" (picker)
export function listMemberships(userId: string): Promise<MembershipSummary[]>;   // excludes stores in purged/scheduled_deletion
```

- `/app` (no handle) renders the store picker when there are several stores, else redirects per `landingPathFor`.
- The **store switcher** (sidebar, ⌘K "Switch store") lists memberships with logo, name, mode badge, status pill ("In
  review", "Restricted"); choosing one navigates to `/app/<h>` and a `userAction` writes `last_store_id`. "Create a
  store" → `/app/new`; staff also see "Platform console" → `/admin`.
- Switching or signing out clears per-store client state: builder drafts (`bld:unsaved:<userId>:<storeId>:<pageId>`,
  LND-29), wizard drafts (`sg:gen:<storeId>:v2`, GEN-03), the focal cache, and cancels AI jobs (TENANCY-MAP §7.5
  client rows). The dashboard never keeps secrets in web storage.
- A membership suspension or removal takes effect on the next request (no session revoke); a platform ban
  (`users.disabled`) deletes every session of the user (`revokeUserSessions`).

### B.5 Store invites (TN-06; AUTH-06, AUTH-07)

```ts
// src/lib/tenancy/invites.ts
export function createInvite(ctx: StoreCtx, input: { email: string; role: StoreRole; note?: string }): Promise<{ inviteId: string; url: string /* shown once */; expiresAt: Date }>;
export function revokeInvite(ctx: StoreCtx, inviteId: string): Promise<void>;
export function listInvites(ctx: StoreCtx): Promise<InviteSummary[]>;          // masked e-mail, role, inviter, expiry, state
export function previewInvite(token: string): Promise<InvitePreview | null>;     // store name + logo, role, masked e-mail
export function acceptInvite(token: string, as: { userId: string } | NewAccountInput): Promise<{ storeHandle: string }>;
```

- Token = `newToken(32)` (256-bit), stored as `sha256` hex in `store_invites.token_hash` (UNIQUE), URL
  `https://<platform>/invite/<token>`; expiry 7 days; single use (`accepted_at`); revocable (`revoked_at`); at most
  20 pending invites per store and `s:<sid>:invite` 20 / day.
- `role ∈ invitableRoles(inviter.role)` and `members_max` / `agents_max` checked at creation **and** at acceptance
  (`assertWithin`), inside a transaction that locks the store's member rows.
- **Bound to the e-mail** (D10): a signed-in user whose e-mail differs sees "This invitation is for s•••@gmail.com";
  a visitor without an account gets a sign-up form with the e-mail locked; an existing account must sign in first.
- Creating an invite for an e-mail that already has an account, a membership or a pending invite answers exactly the
  same as for a new e-mail (no enumeration); an existing member gets no second membership (accept is idempotent).
- Accepting writes `store_members` (status active), audit `store.member.accepted`, a notification to the inviter.
  Token pages send `Referrer-Policy: no-referrer` and are `noindex`.
- R1 hands the link over with copy / WhatsApp share buttons; R2 also sends it by e-mail through the Mailer (§B.10).

### B.6 Platform invites and waitlist (PL-01)

`platform_invites` (code hash, label, `uses_max`, `uses`, `expires_at`, `auto_approve`, created by staff): the code is
shown once (`SG-` + 12 Crockford chars, ~60 bits; brute force is bounded by `p:signup:ip` and Turnstile). `waitlist`
rows are promoted to single-use invites by staff (copy-link in R1). Both live in console Settings → Signup.

### B.7 Two-factor policy

- **Platform staff: mandatory.** `requirePlatform()` refuses a session unless the user has `platform_role ≠ none`,
  `totpEnabled` and `mfaPassed`, plus the console gate cookie, the IP allowlist and (later) `ADMIN_HOST`. A user given a
  platform role without TOTP is sent to `/app/account/two-factor?for=console` and cannot open the console before
  enrolment.
- **Step-up:** permissions in `STEP_UP_PERMISSIONS` (↑ in §A.3.3) need `sessions.step_up_at` within the last 5
  minutes; `platformAction` answers `{ ok: false, error: "step_up" }` and the UI shows the TOTP sheet, which calls
  `stepUpAction(code)` (bucket `p:mfa:stepup:<userId>` 5 / 15 min). The store-side sensitive actions `store.close`
  and `store.export` also need a step-up when the user has TOTP.
- **Tenants:** TOTP optional (existing enrolment UI moves to `/app/account/two-factor`), with recovery codes as today
  (`src/lib/auth/mfa.ts`). Per store, `stores.require_member_2fa` (D12): when true, `requireStoreMember` sends any
  member without TOTP to the enrolment page (allowed paths: `/app/account/**`, sign-out). Only an owner who has TOTP can
  turn it on.
- **2FA reset** is platform-only (`users.manage` ↑, reason required): disables TOTP, clears recovery codes, revokes
  sessions, audit `platform.user.2fa_reset` + a notification to the user. `resetUserTwoFactorAction` in tenant
  settings is deleted (AUTH-09).
- TOTP issuer = the platform brand setting (`platform.brand.name`, default "Store Gen"); the HKDF salt and the
  purpose `totp:<userId>` never change (AUTH-28).

### B.8 Impersonation ("View as store", R-D14, PL-10)

```ts
// src/lib/platform/impersonation.ts
export function startImpersonation(ctx: PlatformCtx, input: { storeId: string; reason: ImpersonationReason; note?: string; ticketRef?: string; minutes?: 15 | 30 | 60 }): Promise<{ url: string }>;
export function endImpersonation(ctx: PlatformCtx | { sessionId: string }, why: "ended" | "expired" | "revoked"): Promise<void>;
export interface ImpersonationInfo { id: string; storeId: string; staffUserId: string; mode: "read"; reason: ImpersonationReason; expiresAt: Date }
export type ImpersonationReason = "ticket" | "onboarding" | "abuse_review" | "bug" | "other";
```

- Start (`stores.impersonate`; support must give `ticketRef`): inserts `impersonation_sessions`, sets
  `sessions.impersonation_id` on the staff member's **own** session, notifies the store (notification centre + its
  Activity tab; e-mail from R2), audits `platform.impersonation.started` with `store_id`, and redirects to `/app/<h>`.
  Default 30 minutes, maximum 60; no silent extension (a renewal is a new row and a new audit).
- While active and only for that store, `requireStoreMember` returns a synthetic membership `{ role: "viewer",
  synthetic: "impersonation", permissions: every key with write = false and no sensitive flag }` and
  `ctx.impersonation`. `storeAction` / `storeGuard` refuse every write permission with `impersonation_read_only`, and
  the refusal itself is audited. Secrets stay masked, phone reveal and exports are refused (sensitive), account pages
  show the staff member's own account.
- The tenant shell renders a full-width violet ribbon (§I.4) "Viewing <store> as support · read-only · mm:ss left ·
  End". Expiry is checked on every request; an expired row ends itself (`endImpersonation(…, "expired")`).
- Every audit row written during impersonation has `actor_kind='impersonation'`, `user_id = staff`,
  `impersonator_id = staff`, `store_id = target` (both identities, R-D14).
- Write access needs an owner support grant (PL-15, R3, `support_grants`); out of scope for R1.

### B.9 Password reset and change (AUTH-08)

- R1: console user profile → "Create reset link" (`users.manage` ↑, reason) → `password_resets` row (token sha256,
  60 min, single use) → the link is shown once for the staff member to send by WhatsApp. `/reset/<token>`: new
  password (policy + scrypt semaphore) → all sessions of the user revoked → audit `auth.password.reset` with
  `actor_kind='platform'` → notification to the user.
- Tenants can never reset another member's password or 2FA (`resetUserPasswordAction`, `settings/actions.ts:155-164`,
  is deleted). Owners remove or suspend a membership instead.
- `/app/account/security`: password change (existing `changeUserPassword`, `src/lib/auth/users.ts:162`), devices
  (`describeUserAgent`), sign out other sessions.
- R2 (IN-08): a "Forgot password" link on `/login` creates the same `password_resets` row and sends it through the
  Mailer; identical answer whether the e-mail exists.

### B.10 Mailer interface (R-D51, IN-08)

```ts
// src/lib/mail/index.ts
export type MailTemplateId = "invite" | "password_reset" | "signup_received" | "signup_approved" | "signup_rejected" | "impersonation_notice" | "store_status" | "export_ready" | "digest";
export interface MailMessage { to: string; locale: "ar" | "fr" | "en"; template: MailTemplateId; vars: Record<string, string>; storeId?: string | null; dedupeKey: string }
export interface Mailer {
  readonly enabled: boolean;
  enqueue(msg: MailMessage): Promise<{ queued: true; outboxId: string } | { queued: false; reason: "disabled" | "capped" | "duplicate" | "suppressed" }>;
}
export function mailer(): Mailer;   // R1: always { enabled: false }; R2: outbox kind "mail" drained by the cron (§H.1)
```

Callers always have a non-mail path (copy link, in-app notification). R2 implements the transport in
`src/lib/mail/smtp.ts` (Hostinger SMTP, credentials in the encrypted platform setting `platform_mail`; one new
dependency allowed, chosen by platform.md), per-minute and per-hour caps in the outbox drainer, transactional only.

### B.11 Bootstrap (AUTH-13, AUTH-15)

`/admin/setup` (gate + `SETUP_TOKEN`) is available only while no user has `platform_role = 'super_admin'`. Step 1
creates the user with `platform_role='super_admin'` (the "no super_admin yet" check runs under the named lock
`platformLock("setup")`, §E.7, replacing the `COUNT(*) … FOR UPDATE` over `users` at `src/lib/auth/users.ts:141`);
step 2 forces TOTP enrolment; step 3 creates the owner's
first store (name, handle, mode landing, market MA, currency MAD, timezone `Africa/Casablanca`, plan `internal`,
status `active`). On a legacy database (§D.8) the converted owner is already `super_admin` and setup stays closed.

---

## C. Routing and domains

### C.1 Addressing modes (R-D1 … R-D10, R-D53)

| Mode | Public store URL | On when | Canonical rank |
|---|---|---|---|
| **P** (path) | `https://<PLATFORM_HOST>/s/<handle>/<path>` | always (the only mode on the temporary domain; permanent fallback) | 3 |
| **S** (subdomain) | `https://<handle>.<STORE_ROOT_DOMAIN>/<path>` | `STORE_ROOT_DOMAIN` and `EDGE_KEY` are both set (`subdomainMode()`) | 2 |
| **C** (custom) | `https://<host>/<path>` | R3: a `store_domains` row with `status='active'` and `is_primary` | 1 |

Canonical address of a store = the best enabled mode (C > S > P). Every other address of a **live** store answers
**308 on GET/HEAD** to the canonical URL with the path and the **full raw query string** byte for byte (`fbclid`,
`ttclid`, UTM). Public POST APIs (`/api/public/*`) are accepted on every address the store owns (§C.9). In S mode the
platform host no longer serves tenant HTML: `/s/<h>/…` on it 308s to the subdomain (R-D4 shared-origin note).

Config (§H.7): `PLATFORM_URL` (the platform origin; `PUBLIC_URL` stays an alias for one release and wins only when
`PLATFORM_URL` is unset), `STORE_ROOT_DOMAIN` (= the apex at launch, separable later, OS-17), `EDGE_KEY`,
`EDGE_KEY_PREV`, `LEGACY_PLATFORM_HOSTS` (comma list, e.g. the temporary domain after the move), `ADMIN_HOST`
(optional, P1). `PLATFORM_HOST` = `normalizeHost(new URL(PLATFORM_URL).host)`.

### C.2 Effective host and host classes

```ts
// src/lib/edge/host.ts (framework-free, runtime-agnostic: used by src/proxy.ts and by route handlers)
export type HostVia = "edge" | "direct";
export type HostClass = "platform" | "console" | "legacy" | "store" | "custom" | "reserved" | "invalid" | "foreign";
export interface EffectiveHost { host: string; via: HostVia; cls: HostClass; label: string | null /* store handle for "store" */ }
export function effectiveHost(headers: Headers): EffectiveHost;
export function edgeVerified(headers: Headers): boolean;          // constant-time x-sg-edge vs EDGE_KEY | EDGE_KEY_PREV (sha256 digests, like the cron key)
export function edgeClientIp(headers: Headers): string | null;   // x-sg-ip, only when edgeVerified
export function subdomainMode(): boolean;
export function classifyHost(host: string, via: HostVia): Omit<EffectiveHost, "host" | "via">;
```

1. If `edgeVerified(headers)`: `host = normalizeHost(x-sg-host)` (`src/lib/auth/config.ts:134-148`), `via = "edge"`.
2. Else: `host = requestHost(headers)` (`src/lib/auth/gate.ts:122-131`), `via = "direct"`. Any `x-sg-*` header is
   ignored.
3. `classifyHost`:

| Effective host | via | Class |
|---|---|---|
| `PLATFORM_HOST` | either | `platform` |
| `ADMIN_HOST` (P1) | either | `console` |
| in `LEGACY_PLATFORM_HOSTS` | direct | `legacy` |
| `<label>.<STORE_ROOT_DOMAIN>`, `label` passes `isHandle()` and is not reserved | edge | `store` (`label` = handle) |
| `<reserved label>.<STORE_ROOT_DOMAIN>` | edge | `reserved` |
| deeper (`a.b.<root>`), malformed, IP literal | either | `invalid` |
| any other host | edge | `custom` (R3; `foreign` while C mode is off) |
| any other host | direct | `foreign` |

`clientIp(headers)` (`src/lib/security/ip.ts`) uses `edgeClientIp()` first when the edge is verified, otherwise its
current rules (`TRUSTED_PROXY_HOPS`, `BEHIND_CLOUDFLARE`). The proxy deletes every client-sent `x-sg-*` header when
the edge key does not verify, but **route handlers never rely on that** (D18): they call `effectiveHost()` and
`clientIp()` themselves.

### C.3 `src/proxy.ts` design (OS-02)

The proxy parses, classifies and rewrites; it never touches the database or shared module state (R-D6;
`proxy.md:19`). Steps:

1. `eff = effectiveHost(req.headers)`; `area = areaOf(pathname)` (`src/lib/edge/areas.ts`, the successor of
   `adminAreaOf`, `src/lib/auth/gate.ts:150-161`, with the same decoding/case-folding):
   `console` (`/admin/**`), `console-api` (`/api/admin/**`), `app` (`/app/**`), `app-api` (`/api/app/**`),
   `auth` (`/login`, `/signup`, `/invite/*`, `/reset/*`), `marketing` (`/`, `/terms`, `/privacy`, `/aup`,
   `/features`), `store` (`/s/**`), `internal` (`/d/**`), `preview` (`/preview/*`), `public-api` (`/api/public/**`,
   `/api/health`, `/api/hooks/**` R2), `cron` (`/api/cron/**`), `gate` (the `ADMIN_GATE` segment), `other`.
2. Build the forwarded request headers: copy the incoming ones; delete `x-nonce`, `x-cs-pathname`, every `x-sg-*`
   except, when the edge verified, `x-sg-edge`, `x-sg-host`, `x-sg-ip` (kept so handlers can re-verify, D18); then set
   `x-sg-path` (`pathname + search`, ≤ 512 chars, on **every** request; it replaces `ADMIN_PATH_HEADER`
   `x-cs-pathname`, `src/lib/auth/config.ts:17`) and, for HTML areas, the nonce headers (today's pattern,
   `src/proxy.ts:112-116`).
3. Decide by class:

| Class | Rule |
|---|---|
| `platform` / `console` | Today's gate logic for `gate`, `console`, `console-api` (`src/proxy.ts:82-122`, evaluated on the effective host). `internal` → 404. `store` paths → pass (the route decides P serving or a 308 to S/C). Platform UI areas (`console`, `app`, `auth`, `marketing`) get the nonce CSP + `adminSecurityHeaders` (renamed `platformUiHeaders`). Everything else passes. |
| `legacy` | GET/HEAD `/s/<h>/<rest>` passes to the store route, which answers 308 to `storeUrl(store, /<rest>)` (only the route knows the handle's canonical address); `cron` (GET `/api/cron/tick`, until the owner updates the cron line), `/api/health` and POST `/api/public/*` pass; any other GET/HEAD path → 308 `https://<PLATFORM_HOST><path>?<query>`. Everything else → 404. |
| `store` | `Next-Action` header present, method not GET/HEAD/POST/OPTIONS, or area in {`console`, `console-api`, `app`, `app-api`, `auth`, `internal`, `preview`, `cron`, `gate`} → neutral 404. Path `/s/<label>/<rest>` (own handle) → 308 `/<rest>?<query>` on the same host (D17); `/s/<other>/…` → 404. `public-api` passes with the **Cookie header deleted** (`/media/*` never reaches the proxy; the Worker already drops cookies). Anything else → `NextResponse.rewrite('/s/<label>' + pathname + search, { request: { headers } })` with the Cookie header deleted (`MiddlewareResponseInit.request`, `node_modules/next/dist/server/web/spec-extension/response.d.ts:20,37-41`). |
| `custom` (R3) | Same as `store`, but the rewrite target is `/d/<host>` + path; the `/d/[host]/[[...path]]` handler resolves host → store (verified `store_domains` only, LRU 512, 60 s). |
| `reserved`, `invalid` | neutral 404 (`www` never gets here: Cloudflare 301s it at the edge). |
| `foreign` | neutral 404 + the existing once-per-host log (`src/lib/render/serve.server.ts:69-83`). |

4. Every response the proxy itself produces (404, 303 gate, 307/308) carries `baseSecurityHeaders()` and
   `Cache-Control: private, no-store` (D31). A pass-through response keeps the handler's headers.

Matcher (constants only, `proxy.md:136`): `"/((?!_next/static|_next/image|favicon\\.ico|fonts/|media/|api/admin/media$|api/app/[^/]+/media$).*)"`.
The two excluded upload endpoints and `/media/*` call `effectiveHost()` and refuse non-platform classes themselves
(uploads) or serve every class (media). Server Functions are POSTs to the page route, so the store-host `Next-Action`
refusal happens in the proxy **and** in `storeAction` (the action refuses when `effectiveHost().cls` is not
`platform`; `proxy.md:249-251`).

### C.4 Route tree and what each host class serves

| Route (App Router file) | platform | legacy | store / custom | Notes |
|---|---|---|---|---|
| `src/app/(marketing)/page.tsx` `/`, `/features`, `/terms`, `/privacy`, `/aup` | ✓ | 308 → platform | rewritten to `/s/<h>` (the store home) | replaces `src/app/route.ts` (C2: a root route and page can't coexist); indexable (overrides the root `noindex`, C8) |
| `src/app/(public)/login`, `signup`, `invite/[token]`, `reset/[token]` | ✓ | 308 | 404 | §B |
| `src/app/app/**` dashboard, `src/app/api/app/[store]/**` | ✓ | 308 (GET) | 404 | §I.1 |
| `src/app/admin/**`, `src/app/api/admin/**` console | ✓ (gate) | 404 | 404 | §I.2 |
| `src/app/s/[store]/…` store pages (§C.4.1) | P mode: serve; S/C mode: 308 to canonical | 308 to canonical | via rewrite only | real route files with the `unknownMethod` + neutral-404 discipline (C5) |
| `src/app/d/[host]/[[...path]]` (R3) | 404 unless rewritten by the proxy | 404 | via rewrite only | D16 |
| `src/app/preview/[token]/route.ts` | ✓ (signed, `noindex`, `private`) | 404 | 404 | D20 |
| `src/app/api/public/{order,lead,event,upsell,track}` | ✓ | ✓ (POST) | ✓ | store resolved from the pageKey / token, §C.9 |
| `src/app/media/[key]/route.ts` | ✓ | ✓ | ✓ | refuses keys of non-servable stores (§A.5.3) |
| `src/app/api/cron/tick`, `src/app/api/health` | ✓ | ✓ (cron URL during the move) | 404 / health ✓ | |
| `src/app/robots.txt/route.ts`, `src/app/sitemap.xml/route.ts` | platform files | 308 | rewritten to `/s/<h>/robots.txt` / `sitemap.xml` | §C.8 |
| `src/app/[slug]/route.ts` | neutral 404 for every method | same | same | kept only as the target of the `/:path+ → /-` fallback rewrite (`next.config.ts:32-33`); `[slug]/merci` and `legal/[doc]` are deleted (C3: no legacy data) |
| `src/app/dev/fixture/**` | dev only (404 in prod) | | | gains store-page fixtures (PUB-28) |

#### C.4.1 Store page routes under `src/app/s/[store]/`

| Path (relative to the store base) | Serves | Release |
|---|---|---|
| `/` | store home (§A.2) | R1 |
| `/<slug>` , `/<slug>/merci` | landing pages and custom pages, their thank-you page | R1 |
| `/policies/<kind>` (`privacy`, `terms`, `shipping`, `returns`, `contact`) | store legal pages (`LegalBody`, store policy facts) | R1 |
| `/track` (+ `?o=<orderId>&s=<sig>` signed link) | order tracking (LP-05), `noindex` | R1 |
| `/robots.txt`, `/sitemap.xml` | per-store SEO files | R1 |
| `/p/<slug>`, `/c/<slug>` (aliases `/products/<slug>`, `/collections/<slug>` → 308) | product and collection pages | R2 |
| `/cart`, `/checkout`, `/search` | cart, one-page COD checkout, search | R2 / R3 |
| `/go/<code>` | short links with UTM presets (LP-12) | R3 |
| `/feeds/<key>/<platform>.<ext>` | catalog feeds (IN-11) | R3 |

Store-reserved page slugs (a page slug can never be one of them; `src/lib/tenancy/handles.ts` `STORE_RESERVED_SLUGS`):
`p, c, products, collections, policies, legal, cart, checkout, search, track, t, go, feeds, reviews, account, pages,
merci, media, api, preview, d, s, app, admin, sitemap.xml, robots.txt, favicon.ico, manifest.webmanifest, .well-known`.

### C.5 Cloudflare Worker contract (OS-05)

Source: `edge/worker.js` (plain ES module Worker, no build step, ≤ 120 lines, committed; deployed by the owner through
the dashboard editor or `wrangler`). Bindings: secret `EDGE_KEY`; vars `ORIGIN` (`https://<apex>`), `STORE_ROOT`
(`<apex>`), `WORKER_VERSION`. Route: `*.<domain>/*` only (the apex never runs the Worker; V3 confirms the pattern).

```
on fetch(request):
  host = lower(request.headers.host)
  if method not in {GET, HEAD, POST, OPTIONS}                     → 404
  if request.headers has "next-action"                            → 404
  if path matches ^/(admin|app|api/app|api/admin|api/cron)(/|$)   → 404       (defense in depth; the app 404s too)
  headers = copy(request.headers) minus every "x-sg-*" and minus "cookie" (store hosts never use cookies)
  headers["x-sg-host"] = host;  headers["x-sg-edge"] = EDGE_KEY;  headers["x-sg-ip"] = request.headers["cf-connecting-ip"]
  headers["x-sg-proto"] = "https";  headers["x-sg-worker"] = WORKER_VERSION
  res = fetch(ORIGIN + path + rawQuery, { method, headers, body: request.body, redirect: "manual" })
  out = new Response(res.body, res);  out.headers.delete("set-cookie");  out.headers.set("x-sg-mode", "subdomain")
  return out
```

Optional P1 (OS-12): Cache API keyed by host + path for HTML that carries `s-maxage`, purged by an authenticated
`POST /__purge` the app calls after a publish. Rotation of `EDGE_KEY` (zero downtime): (1) Hostinger env:
`EDGE_KEY=<new>`, `EDGE_KEY_PREV=<old>`, rebuild; (2) Cloudflare: update the Worker secret to `<new>`; (3) after 24 h
remove `EDGE_KEY_PREV` and rebuild. The app accepts either key while `EDGE_KEY_PREV` is set and logs, once per hour,
requests still using the previous key (`error_events` area `edge`, code `prev_key`). `EDGE_KEY` = 32+ random bytes
(base64url); it must differ from every other secret.

### C.6 URL builders (OS-03)

```ts
// src/lib/urls/index.ts (server; pure functions over the store row + env; no DB)
export interface StoreAddress { id: string; handle: string; primaryDomain?: string | null }
export type AddressMode = "P" | "S" | "C";
export function addressMode(store: StoreAddress): AddressMode;
export function platformOrigin(): string;                                   // "https://<PLATFORM_HOST>"
export function storeOrigin(store: StoreAddress): string;                   // P: platformOrigin(); S: "https://<h>.<root>"; C: "https://<domain>"
export function storeBase(store: StoreAddress): "" | `/s/${string}`;        // path prefix for in-page links (D48)
export function storePath(store: StoreAddress, path: `/${string}`): string; // storeBase + path (absolute path, no origin)
export function storeUrl(store: StoreAddress, path: `/${string}` = "/"): string; // absolute canonical URL
export function storeHosts(store: StoreAddress): ReadonlySet<string>;       // every host the store owns, §C.9
export function mediaUrl(store: StoreAddress, key: string): string;         // P: "/media/<key>"; S/C: platformOrigin() + "/media/<key>" (R-D11)
export function appHref(handle: string, path: `/${string}` | "" = ""): string;   // "/app/<h><path>"
export function consoleHref(path: `/${string}` = "/"): string;              // "/admin<path>"
export function apiHref(handle: string, path: `/${string}`): string;        // "/api/app/<h><path>"
export function previewUrl(token: string): string;                          // platformOrigin() + "/preview/<token>"
```

Rules: every link in published HTML, canonical/og/JSON-LD (PUB-11), CAPI `event_source_url` (PIX-02), sitemaps,
"view live" admin links (ADM-39, LND-27) and e-mails go through these builders; no `/admin` or `/${slug}` literal stays
in `src/**` (lint rule L8, §F.1). The landing renderer receives `{ base, origin, mediaOrigin }` in its store context
(PUB-10, PUB-16, PUB-17); the runtime config keeps relative `/api/public/*` endpoints (works on every host). When
`addressMode()` or `storeOrigin()` of a store changes (handle rename, S mode on, primary custom domain), the store's
`address_version` is bumped and one `render_jobs` row per live page is enqueued (reason `address`, §H.3).

### C.7 Handles (R-D53, SE-03)

```ts
// src/lib/tenancy/handles.ts
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;     // 3-30 chars; plus: no "--" at positions 3-4
export function isHandle(value: string): boolean;
export const RESERVED_HANDLES: ReadonlySet<string>;   // the infrastructure list of domains.md §4.8 + TENANCY-MAP C4 + "d", "preview", "track"
export function handleProblem(value: string, opts: { allowProtected?: boolean }): null | "format" | "reserved" | "protected" | "unavailable";
export function checkHandleAvailable(value: string): Promise<"available" | "unavailable">;   // never says why (no oracle)
export function renameHandle(ctx: StoreCtx, next: string): Promise<void>;                     // domains.manage, 1 rename / 30 days
```

- Never equal to the `ADMIN_GATE` value (compared case-insensitively). The brand-protection list is the
  `protected_brands` table (seeded from domains.md §4.8 + platform-admin.md §5.3; staff can override per signup).
- **Renames:** the old handle goes to `store_handle_history` with `reason='renamed'`, `redirect_until = now + 12
  months` and `reserved_until = redirect_until`; requests for it 308 to the new canonical URL. **Deletion/purge:**
  `reason='deleted'`, `reserved_until = now + 180 days`, answered with the neutral **410** page. A handle is
  available only if it is not current, not in history with `reserved_until > now`, not reserved and not protected.
- Availability checks (`/api/auth/handle?h=`, onboarding) are bucketed `p:handle:ip:<hash>` 60 / 10 min.

### C.8 Canonical rules, redirects and SEO files (OS-03, OS-04)

- 308 (GET/HEAD) to `storeUrl(store, path)` when the request reached a non-canonical address: `/s/<h>` on the
  platform host in S/C mode, the subdomain when a primary custom domain exists, a renamed handle, a legacy host. The
  `Location` keeps the raw query string. POST/PUT never redirect.
- `/products/<s>` → `/p/<s>`, `/collections/<s>` → `/c/<s>`, uppercase slugs → lowercase (today's rule) — all 308.
- Every store document carries `<link rel="canonical">` = the absolute canonical URL. Landing pages attached to a
  product default to `noindex` + canonical to the PDP (R-D49, R2).
- **robots.txt:** platform host: marketing allowed; `Disallow: /app/`, `/admin/`, `/preview/`, and `/s/` once S mode
  is on; `Sitemap:` lines for every indexable P-mode store while S mode is off. Store host (`/s/<h>/robots.txt`):
  `Sitemap: <canonical origin>/sitemap.xml`; `Disallow: /` while the store is not `active` or has no published page.
- **sitemap.xml:** platform = marketing pages; store = its published, indexable pages at the canonical origin only.

### C.9 Cookies, CSRF, CSP and the order origin per host (R-D7, R-D8, SE-02)

| Topic | Platform / console host | Store / custom host | Legacy host |
|---|---|---|---|
| Session + gate cookies | `__Host-cs`, `__Host-csg`: Secure, Path=/, no Domain, SameSite=Lax (unchanged) | never set, never read: the Worker and the proxy delete `Cookie`; store responses never send `Set-Cookie` (Worker strips it; test §J) | none |
| Mutations (server actions, `/api/app`, `/api/admin`) | `checkSameOrigin` strict: `Sec-Fetch-Site: same-origin` and `Origin` host ∈ {`PLATFORM_HOST`, `ADMIN_HOST`} only (no more reflection of `Host`/`X-Forwarded-Host`, `src/lib/security/csrf.ts:27-47`); never "same-site"; never a store or custom host (AUTH-24) | refused (404) | refused |
| Document CSP | platform UI: nonce CSP (`adminCsp`, `src/lib/security/headers.ts:77-102`); P-mode store pages: the stored hash CSP with `connect-src`/`form-action` = `'self'` | the stored hash CSP plus `https://<effective host>` **only when** `via = edge` and the host is one of `storeHosts(store)`, plus `platformOrigin()` in `img-src`/`media-src` (media URLs, R-D11); never a reflected Host (responses carry `s-maxage=60`, cached per host at Cloudflare) | 308 |
| Order / lead / event / upsell / track APIs | accepted | accepted | accepted (old HTML) |
| `checkOrigin` for those APIs | `selfHosts()` (`src/lib/orders/origin.ts:94-110`) is **replaced** by `storeHosts(target.store)` = {`PLATFORM_HOST`, `<handle>.<root>` when S mode is on, verified custom domains, `LEGACY_PLATFORM_HOSTS`}: store A's page posting store B's pageKey is refused (V6). No Origin → allowed and flagged `noOrigin` (unchanged); `Sec-Fetch-Site: cross-site` → refused. Export CORS (`originAllowed`) unchanged; `STORE_ROOT_DOMAIN` and `PLATFORM_HOST`'s registrable domain join `sharedSuffix()` so no export can allow-list `*.<root>` (R-D8). | | |
| Web storage | P mode: every runtime and dashboard key is prefixed per store (`lp-utm` → `lp:<handle>:utm`, same for `lp-vid`, `lp-px-u`, `lp-order`, `lp-wa`; LND-12..14). The runtime derives `<handle>` from `location.pathname` (`/^\/s\/([a-z0-9-]{3,30})\//`), so the runtime config v2 does not change; outside `/s/` (S/C modes, exports) the prefix is empty and today's names stay | per origin anyway; today's names | — |
| Tenant JS/HTML | **forbidden** on every host while stores share a registrable domain (PUB-25, TENANCY-MAP §7.8); console and builder previews render only in sandboxed iframes (SE-05) | same | — |

The storage-key prefix is the one change to the frozen landing runtime allowed in R1 (a few bytes in `tracking.ts`,
`pixels.ts`, `order-store.ts`, `entry-whatsapp.ts`); it must keep the landing chunk within 24,200 B gz
(`src/landing/runtime/budgets.json:3`, LND-16), proven by `render-check`. The runtime config v2, payload v2 and the
markup contract do not change.

### C.10 Domain move (R1, before public sign-ups; RESEARCH §5)

The owner steps are RESEARCH §5.2 (buy the domain, Cloudflare zone, `*` proxied record, www Redirect Rule, `/media/*`
Cache Rule, Worker + secret + route, Hostinger CDN off, TLS mode Full strict). The app side, in order:
1. Env full replace (HANDOFF §4) adding `PLATFORM_URL=https://<domain>`, `PUBLIC_URL` (same value),
   `STORE_ROOT_DOMAIN=<domain>`, `EDGE_KEY`, `BEHIND_CLOUDFLARE=1`, `LEGACY_PLATFORM_HOSTS=lightgreen-hippopotamus-140853.hostingersite.com`,
   `TRUSTED_PROXY_HOPS` per the Visitor IP check; rebuild.
2. `render_jobs` for every live page of every store (reason `address`), drained by the cron; the console Domains view
   (OS-06) shows progress. P-mode HTML keeps working on subdomains meanwhile (D17).
3. Verification V1 … V11 (RESEARCH §5.3) must pass; then the signup mode default flips to `approval` (D9).
4. The cron URL, Meta/TikTok domains, Turnstile hostnames and Sheets links are updated by the owner (checklist in the
   console).

---

## D. Data model

### D.1 Conventions (`src/lib/db/schema.ts`, owned by the core maintainer)

```ts
const id26 = (name = "id") => varchar(name, { length: 26 });                       // ULID (src/lib/db/ids.ts newId)
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const updatedAt = () => ts("updated_at").notNull().default(now3);
const cents = (name: string) => bigint(name, { mode: "number" });                   // integer cents (D41)
/** tenant tables: NOT NULL, no default, FK RESTRICT (TENANCY-MAP §2.3) */
const storeRef = () => varchar("store_id", { length: 26 }).notNull().references(() => stores.id, { onDelete: "restrict", onUpdate: "restrict" });
/** platform tables with an optional store dimension (NULL = platform-level row) */
const storeRefOpt = () => varchar("store_id", { length: 26 }).references(() => stores.id, { onDelete: "restrict", onUpdate: "restrict" });
```

- Names: indexes `<abbr>_<cols>_idx`, uniques `_uq`, FKs `fk_<table>_store` (all ≤ 64 chars). JSON is `jsonText`
  (LONGTEXT, MariaDB 10.4 has no JSON type). Enums are `mysqlEnum`; new values are only ever **appended**.
- Every tenant index starts with `store_id` (it also serves the FK). No query on a tenant table may filter without it
  (§E.3). Duplicate-key errors are never echoed to clients (they contain the store id and the slug, TENANCY-MAP §2.3).
- User references (`created_by`, `user_id` in tenant tables) have no FK: users can be banned or purged while audit
  history keeps the id. The one exception is `store_members.user_id` (FK RESTRICT).
- Portable SQL only (MySQL 8 runs the same migrations): no `ADD COLUMN IF NOT EXISTS`, no `SKIP LOCKED`, no
  `VECTOR`, no `RETURNING`.

### D.2 Changes to existing tables

| Table | Migration | Change |
|---|---|---|
| `users` | 0004 | + `platform_role enum('none','super_admin','admin','support','analyst') NOT NULL DEFAULT 'none'` (index `users_prole_idx`), + `locale varchar(5) NULL` (admin UI locale, ADM-40), + `phone varchar(24) NULL` (signup phone, E.164), + `disabled_reason varchar(200) NULL`, + `disabled_at datetime(3) NULL`. `disabled` = platform ban only (AUTH-12). `role` becomes **legacy** (read only by the conversion, §D.8). `failed_logins`, `locked_until` unused. |
| `users` | 0006 | drop `role`, `failed_logins`, `locked_until`. |
| `sessions` | 0004 | + `last_store_id varchar(26) NULL` (hint, D1), + `impersonation_id varchar(26) NULL` (§B.8), + `step_up_at datetime(3) NULL` (§B.7). |
| `pages` | 0004 | + `store_id` (storeRef); unique `pages_store_slug_uq (store_id, slug)` **replaces** `pages_slug_uq`; `pages_key_uq (public_key)` stays global; + `kind enum('landing','home','product','collection','page','policy','search','cart','checkout','not_found') NOT NULL DEFAULT 'landing'` (only `landing` until R2); + `product_id varchar(26) NULL` (R2 LP-07); index `pages_store_status_idx (store_id, status, updated_at)`; `is_home` copied to `stores.home_page_id` then **dropped** (DB-02). |
| `pages` | 0006 | + `theme_mode enum('store','campaign') NULL` (R-D41, LP-08). |
| `page_versions` | 0004 | + `store_id` (denormalised, DB-03); index `pv_store_idx (store_id, created_at)`; `pv_page_idx` stays. |
| `assets` | 0004 | + `store_id`; + `stored_bytes bigint NOT NULL DEFAULT 0` (master + every variant, MED-03); indexes `assets_store_created_idx (store_id, created_at, id)`, `assets_store_kind_idx (store_id, kind, alpha)`, `assets_store_source_idx (store_id, source_asset_id)`; drop `assets_created_idx`. New ids per D21 (old ids stay valid). |
| `media_files` | 0004 | + `store_id`; + `storage enum('db','fs') NOT NULL DEFAULT 'db'`; index `mf_store_idx (store_id)`; `key` stays the global PK (D28). |
| `media_chunks` | — | unchanged (drains to empty once the FS backend runs, §G). |
| `orders` | 0004 | + `store_id`; indexes `orders_store_created_idx (store_id, created_at)`, `orders_store_status_idx (store_id, status)`, `orders_store_sheet_idx (store_id, sheet_status)`, `orders_store_phone_idx (store_id, phone, created_at)`, `orders_store_ip_idx (store_id, ip_hash, created_at)`, `orders_store_page_idx (store_id, page_id, created_at)` **replace** `orders_phone_idx`, `orders_page_idx`, `orders_status_idx`, `orders_sheet_idx`, `orders_ip_idx`; `orders_idem_uq` and the `CMD-` PK stay global (D28). |
| `orders` | 0005 | `source` enum appended `'manual','api','storefront','whatsapp'` (D42); + `confirm_state enum('new','attempting','callback','confirmed','cancelled','fake','duplicate','unreachable') NOT NULL DEFAULT 'new'`, + `ship_state enum('none','to_pack','packed','shipped','in_transit','out_for_delivery','delivered','refused','returned','lost') NOT NULL DEFAULT 'none'`, + `money_state enum('unpaid','collected','remitted','disputed','written_off') NOT NULL DEFAULT 'unpaid'` (R-D17); + `assignee_id varchar(26)`, `lease_until datetime(3)`, `claim_token char(26)`, `due_at datetime(3)`, `attempts tinyint NOT NULL DEFAULT 0`, `priority int NOT NULL DEFAULT 0`, `cancel_reason varchar(32)`, `customer_id varchar(26)`, `merged_into varchar(20)`, `city_key varchar(40)`, `created_by varchar(26)` (all NULL-able unless stated); indexes `orders_queue_idx (store_id, confirm_state, due_at)`, `orders_assignee_idx (store_id, assignee_id, confirm_state)`, `orders_customer_idx (store_id, customer_id, created_at)`, `orders_ship_idx (store_id, ship_state, updated_at)`. `status` stays and becomes the **derived projection** written by the state machine (labels appended: `refused`, `duplicate`, `unreachable`, `in_transit`; `src/lib/orders/contract.ts:304-314`). |
| `orders` | 0006 | `page_id` → NULL-able (cart orders, ORD-19); + `catalog_version int NULL`, + `cost_snapshot longtext NULL` (AC-01), + `variant_key varchar(40) NULL` (AI-12). |
| `leads` | 0004 | + `store_id`; index `leads_store_created_idx (store_id, created_at)`; `leads_idem_uq` stays global. |
| `leads` | 0005 | + `status enum('new','contacted','recovered','lost','converted') NOT NULL DEFAULT 'new'`, + `assignee_id varchar(26)`, `contacted_at datetime(3)`, `attempts tinyint NOT NULL DEFAULT 0`, `note varchar(300)`; index `leads_store_status_idx (store_id, status, created_at)` (LP-06). |
| `blocklist` | 0004 | + `store_id`; unique `block_store_uq (store_id, kind, value)` **replaces** `block_uq` (DB-08, ORD-03). |
| `exports` | 0004 | + `store_id`; index `exports_store_idx (store_id, created_at)`; `exports_key_uq` stays global. |
| `settings` | 0004 | platform rows only (§D.10); no column change. |
| `rate_limits` | — | unchanged; bucket names `p:…` / `s:<storeId>:…` (§E.8). |
| `audit_log` | 0004 | + `store_id varchar(26) NULL` (FK RESTRICT; NULL = platform/auth event), + `actor_kind enum('user','platform','impersonation','system','api') NOT NULL DEFAULT 'user'`, + `impersonator_id varchar(26) NULL`; index `audit_store_idx (store_id, id)`. |
| `audit_log` | 0007 | + `prev_hash char(64) NULL`, + `row_hash char(64) NULL` (SE-08). |
| `stats_daily` | 0004 | + `store_id`; index `sd_store_day_idx (store_id, day)`; PK `(page_id, day)` stays. |
| `stats_visitors` | — | unchanged (global ULID page ids, purged after 2 days). |

### D.3 Table registry (every new table)

`T` = tenant (`store_id NOT NULL`, FK RESTRICT, every query scoped). `P` = platform (no store, or a nullable
`store_id` dimension; read and written only by `src/lib/platform/**`, `src/lib/jobs/**`, `src/lib/tenancy/**`,
`src/lib/auth/**`). `P*` = platform table about one store (`store_id NOT NULL`), written only by platform code.
Owner = the part spec allowed to refine its columns (§D.9).

| Migration | Table | Level | Owner | Purpose |
|---|---|---|---|---|
| 0004 | `stores` | P* (root) | core | the tenant |
| 0004 | `store_members` | T | core | user × store × role |
| 0004 | `store_invites` | T | core | invite tokens (§B.5) |
| 0004 | `store_settings` | T | core | per-store settings (§D.10) |
| 0004 | `store_handle_history` | P* | core | renamed / deleted handles (§C.7) |
| 0004 | `plans` | P | core | plan definitions |
| 0004 | `store_entitlements` | P* | core | overrides and boosts |
| 0004 | `store_usage` | T | core | gauges and monthly counters (§D.7) |
| 0004 | `store_subscriptions` | P* | core | manual subscriptions (billing-ready) |
| 0004 | `platform_invites` | P | core | signup invite codes |
| 0004 | `waitlist` | P | platform | waitlist entries |
| 0004 | `password_resets` | P | core | reset links |
| 0004 | `impersonation_sessions` | P* | core | view-as sessions |
| 0004 | `signup_reviews` | P* | platform | approval queue rows |
| 0004 | `identity_links` | P | platform | hashed duplicate/ban signals |
| 0004 | `protected_brands` | P | platform | brand deny list |
| 0004 | `legal_documents`, `legal_acceptances` | P | platform | ToS/Privacy/AUP/DPA + store templates; acceptances |
| 0004 | `notifications`, `notification_reads` | P (opt. store) | platform | notification centre |
| 0004 | `flags`, `flag_overrides` | P | platform | release/ops flags and kill switches |
| 0004 | `asset_refs` | T | core | asset usage index (§G.5) |
| 0005 | `platform_notes` | P (opt. store) | platform | staff notes |
| 0005 | `platform_usage` | P | core | platform counters (AI cost cap, mail caps) |
| 0005 | `job_runs`, `cron_cursors` | P (opt. store) | core | job runner |
| 0005 | `error_events` | P (opt. store) | core | error ring |
| 0005 | `outbox` | P (opt. store) | core | async deliveries (§H.1) |
| 0005 | `render_jobs` | T | core | render queue (§H.3) |
| 0005 | `export_jobs` | T | core | store export ZIP (§F.9) |
| 0005 | `backup_runs` | P | core | logical backups (§H.6) |
| 0005 | `order_events` | T | operations | order timeline (R-D18) |
| 0005 | `customers` | T | operations | per-store customer profiles (OP-06) |
| 0005 | `agent_profiles`, `agent_stats_daily` | T | operations | presence, caps, KPIs |
| 0005 | `saved_views` | T | operations | saved filters |
| 0005 | `message_templates` | T | operations | WhatsApp/Telegram templates, call scripts |
| 0005 | `delivery_zones` | T | landing | city groups, fee, ETA (R-D22) |
| 0005 | `sheet_bindings` | T | operations | spreadsheet ownership (IN-01) |
| 0005 | `ai_runs`, `ai_cache`, `ai_memory` | T | ai | runs, cache, brand memory |
| 0005 | `prompt_versions` | P | ai | prompt versions + eval scores |
| 0005 | `design_genomes` | T | design | genomes + distance service (DG-05) |
| 0005 | `headline_shingles` | P | design | cross-tenant MinHash, no store id (R-D37, D35) |
| 0006 | `products`, `collections`, `collection_products`, `inventory_levels` | T | storefront | catalog |
| 0006 | `store_themes` | T | design | Brand Genome + logo parameters per store |
| 0006 | `product_costs`, `ad_spend_daily`, `expenses`, `finance_daily` | T | operations | accounting |
| 0006 | `carrier_accounts`, `carrier_rates`, `shipments`, `shipment_events` | T | operations | carriers and shipments |
| 0006 | `remittances`, `remittance_lines`, `import_mappings`, `import_runs` | T | operations | COD reconciliation, CSV importers |
| 0006 | `commission_rules`, `agent_earnings`, `payouts` | T | operations | commissions |
| 0006 | `webhook_endpoints` | T | operations | signed webhooks |
| 0006 | `stats_version_daily`, `ai_feedback` | T | ai | outcome plumbing (AI-12) |
| 0006 | `ai_batches` | P | ai | Batches API collector |
| 0007 | `store_domains` | T | core | custom domains |
| 0007 | `support_grants` | T | platform | owner grants |
| 0007 | `tickets`, `ticket_messages` | P (opt. store) | platform | support inbox |
| 0007 | `broadcasts`, `broadcast_reads` | P | platform | announcements |
| 0007 | `abuse_reports` | P* | platform | public reports |
| 0007 | `store_daily_rollup` | T | platform | analytics rollup |
| 0007 | `api_keys` | T | operations | store REST keys |
| 0007 | `reviews`, `review_requests` | T | storefront | verified reviews |
| 0007 | `coupons`, `coupon_redemptions` | T | storefront | coupons |
| 0007 | `stock_holds` | T | storefront | soft stock holds |
| 0007 | `experiments`, `experiment_arms` | T | landing | Experiments engine |
| 0007 | `short_links` | T | landing | `/go/<code>` |
| 0007 | `gene_stats_store`, `gene_stats_platform`, `ai_exemplars`, `design_archive` | T / P / T / P | ai + design | learning loops |

### D.4 Core tenancy tables (0004)

```ts
export const stores = mysqlTable("stores", {
  id: id26().primaryKey(),
  handle: varchar("handle", { length: 30 }),                         // NULL only when status = 'purged' (§A.5.1)
  name: varchar("name", { length: 120 }).notNull(),
  mode: mysqlEnum("mode", ["landing", "store", "both"]).notNull().default("landing"),
  status: mysqlEnum("status", ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"]).notNull().default("pending"),
  statusReason: varchar("status_reason", { length: 40 }), statusNote: varchar("status_note", { length: 500 }),
  statusChangedAt: ts("status_changed_at"), statusChangedBy: id26("status_changed_by"),
  suspendNotice: boolean("suspend_notice").notNull().default(false),  // neutral 503 instead of 404 while suspended (D32)
  closedAt: ts("closed_at"), purgeAfter: ts("purge_after"),
  planId: varchar("plan_id", { length: 32 }).notNull().default("beta").references(() => plans.id),
  market: varchar("market", { length: 8 }).notNull().default("MA"),
  currency: char("currency", { length: 3 }).notNull().default("MAD"),
  timezone: varchar("timezone", { length: 40 }).notNull().default("Africa/Casablanca"),
  defaultLocale: varchar("default_locale", { length: 5 }).notNull().default("ar"),
  locales: jsonText<string[]>("locales"),
  category: varchar("category", { length: 40 }),                       // platform niche (k ≥ 5 analytics, design niche)
  homePageId: id26("home_page_id"),
  brandSeed: char("brand_seed", { length: 16 }).notNull(),             // random hex at creation (GEN-12, R-D36)
  catalogVersion: int("catalog_version").notNull().default(0),          // bumped on any catalog/theme change (R-D42)
  addressVersion: int("address_version").notNull().default(0),          // bumped on handle / mode / domain change (§C.6)
  requireMember2fa: boolean("require_member_2fa").notNull().default(false),
  createdBy: id26("created_by"), approvedAt: ts("approved_at"), approvedBy: id26("approved_by"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("stores_handle_uq").on(t.handle), index("stores_status_idx").on(t.status, t.createdAt), index("stores_plan_idx").on(t.planId)]);

export const storeMembers = mysqlTable("store_members", {
  storeId: storeRef(),
  userId: id26("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: mysqlEnum("role", STORE_ROLES).notNull(),
  status: mysqlEnum("status", ["active", "suspended"]).notNull().default("active"),
  title: varchar("title", { length: 60 }), invitedBy: id26("invited_by"),
  joinedAt: ts("joined_at").notNull().default(now3), lastActiveAt: ts("last_active_at"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.userId] }), index("sm_user_idx").on(t.userId), index("sm_store_role_idx").on(t.storeId, t.role, t.status)]);

export const storeInvites = mysqlTable("store_invites", {
  id: id26().primaryKey(), storeId: storeRef(),
  emailNorm: varchar("email_norm", { length: 191 }).notNull(),
  role: mysqlEnum("role", STORE_ROLES).notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(), note: varchar("note", { length: 200 }),
  invitedBy: id26("invited_by").notNull(), expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"), acceptedBy: id26("accepted_by"), revokedAt: ts("revoked_at"), createdAt: createdAt(),
}, (t) => [uniqueIndex("si_token_uq").on(t.tokenHash), index("si_store_idx").on(t.storeId, t.createdAt), index("si_store_email_idx").on(t.storeId, t.emailNorm)]);

export const storeSettings = mysqlTable("store_settings", {
  storeId: storeRef(), key: varchar("key", { length: 64 }).notNull(),
  value: jsonText<unknown>("value").notNull(), encrypted: boolean("encrypted").notNull().default(false),
  /** 0 = legacy v1 envelope under "settings:<key>" awaiting the conversion task; 2 = envelope v2 bound to the store */
  purposeV: tinyint("purpose_v").notNull().default(2),
  updatedBy: id26("updated_by"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.key] })]);

export const storeHandleHistory = mysqlTable("store_handle_history", {
  handle: varchar("handle", { length: 30 }).primaryKey(),             // upserted when an expired row is reused
  storeId: storeRef(), reason: mysqlEnum("reason", ["renamed", "deleted"]).notNull(),
  redirectUntil: ts("redirect_until"), reservedUntil: ts("reserved_until").notNull(), createdAt: createdAt(),
}, (t) => [index("shh_store_idx").on(t.storeId)]);

export const plans = mysqlTable("plans", {
  id: varchar("id", { length: 32 }).primaryKey(), name: varchar("name", { length: 60 }).notNull(),
  status: mysqlEnum("status", ["active", "hidden", "retired"]).notNull().default("active"), sort: int("sort").notNull().default(0),
  limits: jsonText<Record<string, number | null>>("limits").notNull(), features: jsonText<Record<string, boolean>>("features").notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const storeEntitlements = mysqlTable("store_entitlements", {
  storeId: storeRef(), key: varchar("key", { length: 48 }).notNull(),
  source: mysqlEnum("source", ["override", "boost"]).notNull(),
  value: jsonText<number | boolean | null>("value").notNull(),
  expiresAt: ts("expires_at"), setBy: id26("set_by").notNull(), reason: varchar("reason", { length: 200 }).notNull(), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.key, t.source] })]);

export const storeUsage = mysqlTable("store_usage", {
  storeId: storeRef(), metric: varchar("metric", { length: 32 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(),                  // "total" | "YYYY-MM"
  value: bigint("value", { mode: "number" }).notNull().default(0), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.metric, t.period] })]);

export const storeSubscriptions = mysqlTable("store_subscriptions", {
  id: id26().primaryKey(), storeId: storeRef(), planId: varchar("plan_id", { length: 32 }).notNull().references(() => plans.id),
  status: mysqlEnum("status", ["active", "scheduled", "ended"]).notNull(),
  provider: mysqlEnum("provider", ["manual"]).notNull().default("manual"), providerRef: varchar("provider_ref", { length: 120 }),
  periodStart: ts("period_start").notNull(), periodEnd: ts("period_end"),
  createdBy: id26("created_by").notNull(), note: varchar("note", { length: 300 }), createdAt: createdAt(),
}, (t) => [index("ssub_store_idx").on(t.storeId, t.status)]);

export const platformInvites = mysqlTable("platform_invites", {
  id: id26().primaryKey(), codeHash: char("code_hash", { length: 64 }).notNull(), label: varchar("label", { length: 120 }),
  usesMax: int("uses_max").notNull().default(1), uses: int("uses").notNull().default(0),
  autoApprove: boolean("auto_approve").notNull().default(false),
  expiresAt: ts("expires_at"), createdBy: id26("created_by").notNull(), revokedAt: ts("revoked_at"), createdAt: createdAt(),
}, (t) => [uniqueIndex("pi_code_uq").on(t.codeHash)]);

export const waitlist = mysqlTable("waitlist", {
  id: id26().primaryKey(), emailNorm: varchar("email_norm", { length: 191 }).notNull(), phone: varchar("phone", { length: 24 }),
  note: varchar("note", { length: 300 }), locale: varchar("locale", { length: 5 }), ipHash: char("ip_hash", { length: 64 }),
  inviteId: id26("invite_id"), createdAt: createdAt(),
}, (t) => [uniqueIndex("wl_email_uq").on(t.emailNorm)]);

export const passwordResets = mysqlTable("password_resets", {
  id: id26().primaryKey(), userId: id26("user_id").notNull(), tokenHash: char("token_hash", { length: 64 }).notNull(),
  createdBy: id26("created_by"), reason: varchar("reason", { length: 200 }),
  expiresAt: ts("expires_at").notNull(), usedAt: ts("used_at"), createdAt: createdAt(),
}, (t) => [uniqueIndex("pr_token_uq").on(t.tokenHash), index("pr_user_idx").on(t.userId, t.createdAt)]);

export const impersonationSessions = mysqlTable("impersonation_sessions", {
  id: id26().primaryKey(), storeId: storeRef(), staffUserId: id26("staff_user_id").notNull(),
  sessionId: char("session_id", { length: 64 }).notNull(), mode: mysqlEnum("mode", ["read"]).notNull().default("read"),
  reason: mysqlEnum("reason", ["ticket", "onboarding", "abuse_review", "bug", "other"]).notNull(),
  note: varchar("note", { length: 300 }), ticketRef: varchar("ticket_ref", { length: 60 }),
  startedAt: ts("started_at").notNull().default(now3), expiresAt: ts("expires_at").notNull(),
  endedAt: ts("ended_at"), endedReason: mysqlEnum("ended_reason", ["ended", "expired", "revoked"]),
}, (t) => [index("imp_store_idx").on(t.storeId, t.startedAt), index("imp_staff_idx").on(t.staffUserId, t.startedAt)]);

export const signupReviews = mysqlTable("signup_reviews", {
  id: id26().primaryKey(), storeId: storeRef(), userId: id26("user_id").notNull(),
  kind: mysqlEnum("kind", ["signup", "reopen", "go_live"]).notNull().default("signup"),
  score: tinyint("score").notNull(), signals: jsonText<SignupSignals>("signals").notNull(),
  status: mysqlEnum("status", ["pending", "needs_info", "approved", "rejected", "snoozed"]).notNull().default("pending"),
  snoozeUntil: ts("snooze_until"), businessContext: jsonText<Record<string, string>>("business_context"),
  decidedBy: id26("decided_by"), decidedAt: ts("decided_at"),
  reasonCode: varchar("reason_code", { length: 40 }), reasonNote: varchar("reason_note", { length: 500 }),
  appeals: tinyint("appeals").notNull().default(0), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("sr_store_idx").on(t.storeId, t.createdAt), index("sr_queue_idx").on(t.status, t.score, t.createdAt)]);

export const identityLinks = mysqlTable("identity_links", {
  userId: id26("user_id").notNull(),
  kind: mysqlEnum("kind", ["email_norm", "phone", "net", "device"]).notNull(),
  valueHash: char("value_hash", { length: 64 }).notNull(),             // hmac(value, "identity:<kind>"), never the raw value
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.kind, t.valueHash, t.userId] }), index("il_user_idx").on(t.userId)]);

export const protectedBrands = mysqlTable("protected_brands", {
  id: id26().primaryKey(), term: varchar("term", { length: 60 }).notNull(),
  kind: mysqlEnum("kind", ["brand", "bank", "carrier", "gov", "platform", "offensive"]).notNull(),
  match: mysqlEnum("match", ["exact", "substring", "skeleton"]).notNull().default("substring"),
  addedBy: id26("added_by"), createdAt: createdAt(),
}, (t) => [uniqueIndex("pb_term_uq").on(t.term)]);

export const legalDocuments = mysqlTable("legal_documents", {
  id: id26().primaryKey(),
  kind: mysqlEnum("kind", ["tos", "privacy", "aup", "dpa", "store_privacy", "store_terms", "store_shipping", "store_returns", "store_contact"]).notNull(),
  locale: varchar("locale", { length: 5 }).notNull(), version: int("version").notNull(),
  title: varchar("title", { length: 160 }).notNull(), body: longtext("body").notNull(),
  status: mysqlEnum("status", ["draft", "published", "retired"]).notNull().default("draft"),
  needsLegalReview: boolean("needs_legal_review").notNull().default(true),   // D39
  publishedAt: ts("published_at"), createdBy: id26("created_by"), createdAt: createdAt(),
}, (t) => [uniqueIndex("ld_kind_loc_ver_uq").on(t.kind, t.locale, t.version)]);

export const legalAcceptances = mysqlTable("legal_acceptances", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: id26("user_id").notNull(), storeId: storeRefOpt(), documentId: id26("document_id").notNull(),
  acceptedAt: ts("accepted_at").notNull().default(now3), ipHash: char("ip_hash", { length: 64 }), ua: varchar("ua", { length: 300 }),
}, (t) => [index("la_user_idx").on(t.userId, t.acceptedAt), index("la_doc_idx").on(t.documentId)]);

export const notifications = mysqlTable("notifications", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  storeId: storeRefOpt(), userId: id26("user_id"),
  audience: mysqlEnum("audience", ["user", "store", "store_role", "platform_staff"]).notNull(),
  roles: jsonText<StoreRole[]>("roles"),                               // audience = store_role
  kind: varchar("kind", { length: 40 }).notNull(),                     // catalog key, e.g. "order.new_batch", "signup.approved"
  severity: mysqlEnum("severity", ["info", "success", "warn", "danger"]).notNull().default("info"),
  vars: jsonText<Record<string, string | number>>("vars"),             // rendered by the admin catalog in the reader's locale
  text: varchar("text", { length: 600 }),                              // free text (staff messages) only
  link: varchar("link", { length: 300 }), dedupeKey: varchar("dedupe_key", { length: 120 }),
  createdAt: createdAt(), expiresAt: ts("expires_at"),
}, (t) => [index("nt_store_idx").on(t.storeId, t.id), index("nt_user_idx").on(t.userId, t.id), uniqueIndex("nt_dedupe_uq").on(t.dedupeKey)]);

export const notificationReads = mysqlTable("notification_reads", {
  notificationId: bigint("notification_id", { mode: "number" }).notNull(), userId: id26("user_id").notNull(),
  readAt: ts("read_at").notNull().default(now3),
}, (t) => [primaryKey({ columns: [t.notificationId, t.userId] })]);

export const flags = mysqlTable("flags", {
  key: varchar("key", { length: 64 }).primaryKey(),
  kind: mysqlEnum("kind", ["release", "ops", "kill", "experiment"]).notNull(),
  description: varchar("description", { length: 300 }), defaultValue: jsonText<unknown>("default_value").notNull(),
  rules: jsonText<FlagRule[]>("rules"), updatedBy: id26("updated_by"), updatedAt: updatedAt(),
});
export const flagOverrides = mysqlTable("flag_overrides", {
  flagKey: varchar("flag_key", { length: 64 }).notNull(),
  scope: mysqlEnum("scope", ["store", "user", "plan", "market"]).notNull(), scopeId: varchar("scope_id", { length: 40 }).notNull(),
  value: jsonText<unknown>("value").notNull(), updatedBy: id26("updated_by"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.flagKey, t.scope, t.scopeId] })]);

export const assetRefs = mysqlTable("asset_refs", {
  storeId: storeRef(), assetId: varchar("asset_id", { length: 64 }).notNull(),
  ownerKind: mysqlEnum("owner_kind", ["page", "page_version", "product", "collection", "store_theme", "brand", "settings", "review", "ticket"]).notNull(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(), live: boolean("live").notNull().default(false), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.assetId, t.ownerKind, t.ownerId] }), index("ar_owner_idx").on(t.storeId, t.ownerKind, t.ownerId)]);
```

Seed rows written by 0004 (`INSERT IGNORE`): `plans` `beta`, `pro`, `internal` (§A.4); `flags` kill switches
`signups_enabled`, `publishing_enabled`, `ai_generation_enabled`, `sheets_sync_enabled`, `capi_enabled`,
`uploads_enabled` (default `true`) and `platform_read_only` (default `false`), kind `kill`. `protected_brands` is seeded
by a boot task from `src/lib/platform/data/protected-brands.ts` (a code constant reviewed in git), not by SQL.

### D.5 R1 product tables (0005)

Column sets below are the contract; the owning part spec (§D.9) may add columns or indexes and refine enums before
0005 is written (start of the R1 product phase, §K.2), never remove `store_id` or rename the table.

```ts
// platform / ops (core)
export const platformNotes = mysqlTable("platform_notes", {
  id: id26().primaryKey(), storeId: storeRefOpt(), userId: id26("user_id"), authorId: id26("author_id").notNull(),
  body: text("body").notNull(), pinned: boolean("pinned").notNull().default(false), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("pn_store_idx").on(t.storeId, t.createdAt), index("pn_user_idx").on(t.userId, t.createdAt)]);
export const platformUsage = mysqlTable("platform_usage", {
  metric: varchar("metric", { length: 32 }).notNull(), period: varchar("period", { length: 7 }).notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.metric, t.period] })]);
export const jobRuns = mysqlTable("job_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  job: varchar("job", { length: 48 }).notNull(), storeId: storeRefOpt(), tickId: char("tick_id", { length: 26 }),
  startedAt: ts("started_at").notNull(), ms: int("ms").notNull(), ok: boolean("ok").notNull(),
  processed: int("processed").notNull().default(0), summary: jsonText<Record<string, unknown>>("summary"), errorCode: varchar("error_code", { length: 64 }),
}, (t) => [index("jr_job_idx").on(t.job, t.startedAt), index("jr_started_idx").on(t.startedAt), index("jr_store_idx").on(t.storeId, t.startedAt)]);
export const cronCursors = mysqlTable("cron_cursors", {
  job: varchar("job", { length: 48 }).primaryKey(), cursor: varchar("cursor", { length: 64 }).notNull().default(""),
  state: jsonText<Record<string, unknown>>("state"), updatedAt: updatedAt(),
});
export const errorEvents = mysqlTable("error_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  dedupe: char("dedupe", { length: 64 }).notNull(),                    // sha256(bucket|area|code|route|storeId)
  bucket: char("bucket", { length: 13 }).notNull(),                    // "YYYY-MM-DDTHH" (UTC)
  area: varchar("area", { length: 32 }).notNull(), code: varchar("code", { length: 64 }).notNull(), route: varchar("route", { length: 120 }),
  storeId: storeRefOpt(), count: int("count").notNull().default(1),
  firstAt: ts("first_at").notNull(), lastAt: ts("last_at").notNull(), sample: jsonText<Record<string, unknown>>("sample"), // redacted: errorSummary only
}, (t) => [uniqueIndex("ee_dedupe_uq").on(t.dedupe), index("ee_bucket_idx").on(t.bucket), index("ee_store_idx").on(t.storeId, t.lastAt)]);
export const outbox = mysqlTable("outbox", {
  id: id26().primaryKey(), storeId: storeRefOpt(),
  kind: mysqlEnum("kind", ["webhook", "capi", "telegram", "whatsapp", "mail", "carrier"]).notNull(),
  topic: varchar("topic", { length: 48 }).notNull(),                   // "order.created", "Purchase", "ConfirmedOrder", "new_order"…
  targetId: varchar("target_id", { length: 64 }),                      // endpoint id, "meta:<pixelId>", adapter id, chat id hash
  dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),         // e.g. "capi:meta:<pixel>:<orderId>:Purchase"
  payload: longtext("payload").notNull(), encrypted: boolean("encrypted").notNull().default(false), // envelope v2 when it carries PII
  state: mysqlEnum("state", ["pending", "running", "done", "dead", "cancelled"]).notNull().default("pending"),
  attempts: tinyint("attempts").notNull().default(0), nextAt: ts("next_at").notNull().default(now3),
  leaseUntil: ts("lease_until"), claim: char("claim", { length: 26 }),
  lastStatus: int("last_status"), lastError: varchar("last_error", { length: 300 }), lastMs: int("last_ms"),
  createdAt: createdAt(), doneAt: ts("done_at"),
}, (t) => [uniqueIndex("ob_dedupe_uq").on(t.dedupeKey), index("ob_due_idx").on(t.state, t.nextAt), index("ob_store_idx").on(t.storeId, t.state, t.nextAt), index("ob_claim_idx").on(t.claim)]);
export const renderJobs = mysqlTable("render_jobs", {
  id: id26().primaryKey(), storeId: storeRef(), pageId: id26("page_id").notNull(),
  reason: mysqlEnum("reason", ["address", "theme", "brand", "product", "republish", "runtime", "experiment"]).notNull(),
  priority: tinyint("priority").notNull().default(5),
  dedupe: varchar("dedupe", { length: 40 }),                           // = page_id while pending/running, NULL once finished (D25)
  state: mysqlEnum("state", ["pending", "running", "done", "failed", "skipped"]).notNull().default("pending"),
  attempts: tinyint("attempts").notNull().default(0), notBefore: ts("not_before").notNull().default(now3),
  leaseUntil: ts("lease_until"), claim: char("claim", { length: 26 }), error: varchar("error", { length: 200 }),
  createdAt: createdAt(), doneAt: ts("done_at"),
}, (t) => [uniqueIndex("rj_dedupe_uq").on(t.dedupe), index("rj_due_idx").on(t.state, t.priority, t.notBefore), index("rj_store_idx").on(t.storeId, t.state)]);
export const exportJobs = mysqlTable("export_jobs", {
  id: id26().primaryKey(), storeId: storeRef(), kind: mysqlEnum("kind", ["store_export"]).notNull().default("store_export"),
  requestedBy: id26("requested_by").notNull(), requestedAs: mysqlEnum("requested_as", ["member", "platform"]).notNull(),
  state: mysqlEnum("state", ["pending", "running", "ready", "failed", "expired"]).notNull().default("pending"),
  cursor: jsonText<Record<string, unknown>>("cursor"), parts: jsonText<{ name: string; bytes: number; sha256: string }[]>("parts"),
  bytes: bigint("bytes", { mode: "number" }), expiresAt: ts("expires_at"), error: varchar("error", { length: 200 }),
  createdAt: createdAt(), doneAt: ts("done_at"),
}, (t) => [index("ej_store_idx").on(t.storeId, t.createdAt), index("ej_state_idx").on(t.state, t.createdAt)]);
export const backupRuns = mysqlTable("backup_runs", {
  id: id26().primaryKey(), kind: mysqlEnum("kind", ["daily", "weekly"]).notNull(), day: date("day", { mode: "string" }).notNull(),
  state: mysqlEnum("state", ["running", "done", "failed", "pruned"]).notNull(),
  cursor: jsonText<Record<string, unknown>>("cursor"), manifest: jsonText<BackupManifest>("manifest"),
  bytes: bigint("bytes", { mode: "number" }), startedAt: ts("started_at").notNull(), doneAt: ts("done_at"), error: varchar("error", { length: 200 }),
}, (t) => [uniqueIndex("br_kind_day_uq").on(t.kind, t.day)]);

// operations (operations.md)
export const orderEvents = mysqlTable("order_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(), storeId: storeRef(),
  orderId: varchar("order_id", { length: 20 }).notNull(), at: ts("at").notNull().default(now3),
  actorKind: mysqlEnum("actor_kind", ["user", "system", "customer", "sheet", "carrier", "api", "platform", "bot"]).notNull(),
  actorId: varchar("actor_id", { length: 26 }), type: varchar("type", { length: 32 }).notNull(),
  fromState: varchar("from_state", { length: 24 }), toState: varchar("to_state", { length: 24 }),
  reasonCode: varchar("reason_code", { length: 32 }), note: varchar("note", { length: 500 }), meta: jsonText<Record<string, unknown>>("meta"),
}, (t) => [index("oe_order_idx").on(t.storeId, t.orderId, t.at), index("oe_actor_idx").on(t.storeId, t.actorId, t.at), index("oe_type_idx").on(t.storeId, t.type, t.at)]);
export const customers = mysqlTable("customers", {
  id: id26().primaryKey(), storeId: storeRef(), phone: varchar("phone", { length: 24 }).notNull(),   // E.164
  name: varchar("name", { length: 120 }), city: varchar("city", { length: 120 }),
  ordersCount: int("orders_count").notNull().default(0), confirmedCount: int("confirmed_count").notNull().default(0),
  deliveredCount: int("delivered_count").notNull().default(0), refusedCount: int("refused_count").notNull().default(0),
  returnedCount: int("returned_count").notNull().default(0), cancelledCount: int("cancelled_count").notNull().default(0),
  fakeCount: int("fake_count").notNull().default(0), firstOrderAt: ts("first_order_at"), lastOrderAt: ts("last_order_at"),
  note: varchar("note", { length: 300 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cu_store_phone_uq").on(t.storeId, t.phone), index("cu_store_last_idx").on(t.storeId, t.lastOrderAt)]);
export const agentProfiles = mysqlTable("agent_profiles", {
  storeId: storeRef(), userId: id26("user_id").notNull(),
  presence: mysqlEnum("presence", ["offline", "online", "break"]).notNull().default("offline"), presenceAt: ts("presence_at"),
  dailyCap: int("daily_cap"), weight: tinyint("weight").notNull().default(1),
  languages: jsonText<string[]>("languages"), skills: jsonText<string[]>("skills"), commissionRuleId: id26("commission_rule_id"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.userId] }), index("ap_presence_idx").on(t.storeId, t.presence)]);
export const agentStatsDaily = mysqlTable("agent_stats_daily", {
  storeId: storeRef(), userId: id26("user_id").notNull(), day: date("day", { mode: "string" }).notNull(),   // store timezone
  worked: int("worked").notNull().default(0), confirmed: int("confirmed").notNull().default(0), cancelled: int("cancelled").notNull().default(0),
  fake: int("fake").notNull().default(0), duplicates: int("duplicates").notNull().default(0), attempts: int("attempts").notNull().default(0),
  reveals: int("reveals").notNull().default(0), firstTouchMsSum: bigint("first_touch_ms_sum", { mode: "number" }).notNull().default(0),
  firstTouchN: int("first_touch_n").notNull().default(0), handlingMsSum: bigint("handling_ms_sum", { mode: "number" }).notNull().default(0),
  shipped: int("shipped").notNull().default(0), delivered: int("delivered").notNull().default(0),
  refused: int("refused").notNull().default(0), returned: int("returned").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.storeId, t.userId, t.day] }), index("asd_store_day_idx").on(t.storeId, t.day)]);
export const savedViews = mysqlTable("saved_views", {
  id: id26().primaryKey(), storeId: storeRef(), userId: id26("user_id"),                  // NULL = shared with the team
  surface: mysqlEnum("surface", ["orders", "leads", "customers"]).notNull(), name: varchar("name", { length: 60 }).notNull(),
  query: jsonText<Record<string, unknown>>("query").notNull(), position: int("position").notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("sv_store_idx").on(t.storeId, t.surface, t.userId)]);
export const messageTemplates = mysqlTable("message_templates", {
  id: id26().primaryKey(), storeId: storeRef(),
  channel: mysqlEnum("channel", ["whatsapp", "telegram", "sms", "email", "call_script"]).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(), locale: varchar("locale", { length: 5 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(), body: text("body").notNull(), position: int("position").notNull().default(0),
  updatedBy: id26("updated_by"), updatedAt: updatedAt(),
}, (t) => [index("mt_store_idx").on(t.storeId, t.channel, t.kind)]);
export const sheetBindings = mysqlTable("sheet_bindings", {
  spreadsheetId: varchar("spreadsheet_id", { length: 100 }).primaryKey(),               // unique across stores (TENANCY-MAP §7.7)
  storeId: storeRef(), verifiedAt: ts("verified_at").notNull(), verifiedBy: id26("verified_by"), createdAt: createdAt(),
}, (t) => [index("sb_store_idx").on(t.storeId)]);

// landing (landing.md)
export const deliveryZones = mysqlTable("delivery_zones", {
  id: id26().primaryKey(), storeId: storeRef(), name: varchar("name", { length: 80 }).notNull(),
  cities: jsonText<string[]>("cities").notNull(),                      // city keys of src/lib/markets/cities-ma.ts, or "*"
  feeCents: cents("fee_cents"), freeFromCents: cents("free_from_cents"),   // NULL = not set by the owner (never invented)
  etaMinDays: tinyint("eta_min_days"), etaMaxDays: tinyint("eta_max_days"), notServed: boolean("not_served").notNull().default(false),
  position: int("position").notNull().default(0), updatedAt: updatedAt(),
}, (t) => [index("dz_store_idx").on(t.storeId, t.position)]);

// ai (ai.md)
export const aiRuns = mysqlTable("ai_runs", {
  id: id26().primaryKey(), storeId: storeRef(), userId: id26("user_id"), task: varchar("task", { length: 32 }).notNull(),
  provider: mysqlEnum("provider", ["server", "local", "library"]).notNull(), model: varchar("model", { length: 64 }),
  promptVersion: varchar("prompt_version", { length: 32 }), inputHash: char("input_hash", { length: 64 }).notNull(),
  output: jsonText<unknown>("output"),                                 // ≤ 64 KB, nulled after 90 days (OS-11)
  rejectedFields: jsonText<string[]>("rejected_fields"), stopReason: varchar("stop_reason", { length: 32 }),
  ms: int("ms").notNull(), inTok: int("in_tok"), outTok: int("out_tok"), cacheReadTok: int("cache_read_tok"),
  costMicros: bigint("cost_micros", { mode: "number" }), createdAt: createdAt(),
}, (t) => [index("air_store_idx").on(t.storeId, t.createdAt), index("air_task_idx").on(t.task, t.promptVersion, t.createdAt)]);
export const aiCache = mysqlTable("ai_cache", {
  storeId: storeRef(), task: varchar("task", { length: 32 }).notNull(), inputHash: char("input_hash", { length: 64 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 32 }).notNull(), model: varchar("model", { length: 64 }).notNull(),
  output: jsonText<unknown>("output").notNull(), expiresAt: ts("expires_at").notNull(), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.task, t.inputHash, t.promptVersion, t.model] }), index("aic_exp_idx").on(t.expiresAt)]);
export const aiMemory = mysqlTable("ai_memory", {
  id: id26().primaryKey(), storeId: storeRef(),
  kind: mysqlEnum("kind", ["voice", "fact", "avoid", "prefer", "policy"]).notNull(), text: varchar("text", { length: 500 }).notNull(),
  evidence: jsonText<Record<string, unknown>>("evidence"), source: mysqlEnum("source", ["explicit", "learned"]).notNull().default("explicit"),
  active: boolean("active").notNull().default(true), createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("aim_store_idx").on(t.storeId, t.active)]);
export const promptVersions = mysqlTable("prompt_versions", {
  task: varchar("task", { length: 32 }).notNull(), version: varchar("version", { length: 32 }).notNull(),
  templateHash: char("template_hash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["draft", "canary", "active", "retired"]).notNull().default("draft"),
  evalScore: jsonText<Record<string, number>>("eval_score"), createdBy: id26("created_by"), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.task, t.version] })]);

// design (design.md)
export const designGenomes = mysqlTable("design_genomes", {
  id: id26().primaryKey(), storeId: storeRef(), pageId: id26("page_id"), versionId: id26("version_id"),
  kind: mysqlEnum("kind", ["brand", "page"]).notNull(), niche: varchar("niche", { length: 64 }).notNull(),
  bucket: varchar("bucket", { length: 96 }).notNull(),                 // "niche|grammar|colorStrategy" pre-filter (R-D36)
  vec: jsonText<number[]>("vec").notNull(), genome: jsonText<unknown>("genome").notNull(),
  live: boolean("live").notNull().default(false), reservedUntil: ts("reserved_until"), createdAt: createdAt(),
}, (t) => [index("dg_bucket_idx").on(t.bucket, t.live), index("dg_store_idx").on(t.storeId, t.pageId), index("dg_niche_idx").on(t.niche, t.live)]);
export const headlineShingles = mysqlTable("headline_shingles", {
  nicheKey: varchar("niche_key", { length: 64 }).notNull(), hash: char("hash", { length: 16 }).notNull(),
  ownerTag: char("owner_tag", { length: 16 }).notNull(),               // hmac(storeId, "shingle-owner")[:16], never returned (D35)
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.nicheKey, t.hash, t.ownerTag] }), index("hs_owner_idx").on(t.ownerTag)]);
```

### D.6 R2 and R3 tables (0006, 0007)

Shapes at contract level (types as in §D.1; every `store_id` is `storeRef()`; money is `cents`). The owning part
spec writes the final column list before the release's migration is cut.

| Table | Columns (key ones) | Keys / indexes |
|---|---|---|
| `products` (0006) | `id`, `store_id`, `slug varchar(80)`, `status enum(draft,active,archived)`, `name varchar(160)`, `doc longtext` (`{product, items, offers}` = the Offers v2 shapes of `src/lib/page/schema.ts`, priced by `src/lib/page/pricing.ts` unchanged), `seo longtext`, `position int`, `catalog_version int`, `created_by`, `created_at`, `updated_at` | `UNIQUE(store_id, slug)`; `(store_id, status, position)` |
| `collections` (0006) | `id`, `store_id`, `slug`, `name`, `description text`, `media longtext`, `rules longtext`, `sort enum(manual,newest,bestsellers,price_asc,price_desc)`, `status`, `position` | `UNIQUE(store_id, slug)` |
| `collection_products` (0006) | `store_id`, `collection_id`, `product_id`, `position` | PK `(collection_id, product_id)`; `(store_id, product_id)` |
| `inventory_levels` (0006) | `store_id`, `product_id`, `sku varchar(64)`, `on_hand int`, `held int`, `updated_at` | PK `(store_id, product_id, sku)` |
| `store_themes` (0006) | `store_id`, `version int`, `genome longtext`, `theme_spec longtext`, `locks longtext`, `logo longtext` (logo designer parameters + exported asset ids), `active bool`, `created_by`, `created_at` | PK `(store_id, version)` |
| `product_costs` (0006) | `id`, `store_id`, `product_id NULL`, `page_id NULL`, `item_id varchar(40)`, `variant_key varchar(120) DEFAULT ''`, `cost_cents`, `packaging_cents NULL`, `effective_from`, `created_by` | `(store_id, product_id, item_id, variant_key, effective_from)`, `(store_id, page_id, item_id, effective_from)` |
| `carrier_accounts` (0006) | `id`, `store_id`, `adapter varchar(32)`, `label`, `status enum(active,disabled)`, `hook_key_hash char(64) NULL`, `settings longtext` (non-secret; credentials in store setting `carrier_credentials`) | `UNIQUE(store_id, adapter, label)`, `UNIQUE(hook_key_hash)` |
| `carrier_rates` (0006) | `id`, `store_id`, `carrier_account_id`, `city_key`, `zone`, `delivery_fee_cents`, `return_fee_cents`, `cod_fee_bp int`, `eta_days tinyint`, `active` | `(store_id, carrier_account_id, city_key)` |
| `shipments` (0006) | `id`, `store_id`, `order_id varchar(20)`, `carrier_account_id`, `tracking varchar(64)`, `state` (= `ship_state` values), `fee_cents`, `cod_cents`, `return_fee_cents`, `label_ref`, `created_at`, `shipped_at`, `delivered_at`, `returned_at`, `remittance_id` | `UNIQUE(store_id, carrier_account_id, tracking)`, `(store_id, order_id)`, `(store_id, state, created_at)` |
| `shipment_events` (0006) | `id bigint`, `store_id`, `shipment_id`, `at`, `carrier_status varchar(80)`, `mapped_state varchar(24)`, `raw longtext` (nulled after 30 d) | `(store_id, shipment_id, at)` |
| `remittances` (0006) | `id`, `store_id`, `carrier_account_id`, `statement_ref`, `period_from date`, `period_to date`, `paid_at`, `gross_cents`, `fees_cents`, `net_cents`, `state enum(imported,matched,disputed,closed)`, `import_run_id`, `created_by` | `UNIQUE(store_id, carrier_account_id, statement_ref)` |
| `remittance_lines` (0006) | `id bigint`, `store_id`, `remittance_id`, `tracking`, `order_id NULL`, `cod_cents`, `fee_cents`, `return_fee_cents`, `net_cents`, `match enum(matched,amount_diff,fee_diff,unknown,missing)`, `note` | `(store_id, remittance_id)`, `(store_id, tracking)` |
| `import_mappings` (0006) | `id`, `store_id`, `kind enum(remittance,tracking,status,ad_spend,products,reviews)`, `name`, `columns longtext`, `carrier_account_id NULL`, `created_by`, `updated_at` | `UNIQUE(store_id, kind, name)` (D38) |
| `import_runs` (0006) | `id`, `store_id`, `kind`, `mapping_id`, `file_ref` (path under `DATA_DIR/imports/<storeId>/`), `rows`, `ok`, `failed`, `report longtext`, `created_by`, `created_at` | `(store_id, kind, created_at)` |
| `ad_spend_daily` (0006) | `store_id`, `platform enum(meta,tiktok,snap,google,other)`, `account_id varchar(40)`, `campaign_id varchar(64) DEFAULT ''`, `day date`, `campaign_name`, `spend_cents`, `currency char(3)`, `source enum(manual,csv,api)`, `import_run_id` | PK `(store_id, platform, account_id, campaign_id, day)` |
| `expenses` (0006) | `id`, `store_id`, `day date`, `category varchar(40)`, `amount_cents`, `note`, `recurring_rule longtext NULL`, `attachment_ref NULL`, `created_by` | `(store_id, day)` |
| `finance_daily` (0006) | `store_id`, `day`, `dim_key varchar(160)` (`total`, `product:<id>`, `page:<id>`, `campaign:<k>`, `city:<k>`, `carrier:<id>`), order counts by outcome, `placed_cents`, `delivered_cents`, `cogs_cents`, `shipping_cost_cents`, `return_cost_cents`, `cod_fee_cents`, `commission_cents`, `ad_spend_cents`, `expense_cents`, `net_cents`, `computed_at` | PK `(store_id, day, dim_key)` |
| `commission_rules` (0006) | `id`, `store_id`, `name`, `kind enum(per_delivered,per_confirmed,percent_upsell,tier_bonus,fixed)`, `amount_cents NULL`, `percent_bp NULL`, `params longtext`, `active` | `(store_id, active)` |
| `agent_earnings` (0006) | `id`, `store_id`, `user_id`, `order_id NULL`, `rule_id`, `amount_cents`, `state enum(pending,earned,void,paid)`, `period char(7)`, `payout_id NULL` | `UNIQUE(store_id, order_id, rule_id, user_id)`, `(store_id, user_id, state)` |
| `payouts` (0006) | `id`, `store_id`, `user_id`, `period_from`, `period_to`, `total_cents`, `state enum(draft,approved,paid)`, `approved_by`, `approved_at`, `paid_at`, `method`, `ref` | `(store_id, user_id, period_from)` |
| `webhook_endpoints` (0006) | `id`, `store_id`, `url varchar(500)`, `events longtext`, `secret_enc text` (envelope v2), `secret_prev_enc text NULL`, `status enum(active,paused,disabled)`, `failing_since NULL`, `created_by` | `(store_id)` |
| `stats_version_daily` (0006) | `store_id`, `page_id`, `version_id`, `variant_key varchar(40) DEFAULT ''`, `day`, `views`, `uniques`, `form_starts`, `orders`, `confirmed`, `delivered`, `returned`, `fake` | PK `(store_id, page_id, version_id, variant_key, day)` |
| `ai_feedback` (0006) | `id bigint`, `store_id`, `run_id NULL`, `page_id`, `version_id`, `field varchar(80)`, `kind enum(kept,edited,rejected,regenerated,chosen,not_chosen)`, `before_text varchar(1000)`, `after_text varchar(1000)`, `edit_ratio_bp int` | `(store_id, created_at)` |
| `ai_batches` (0006, P) | `id`, `provider_batch_id`, `kind`, `status`, `items int`, `submitted_at`, `ended_at` | `(status)` |
| `store_domains` (0007) | `id`, `store_id`, `host varchar(253)`, `status enum(pending,verifying,active,dns_lost,released,failed)`, `is_primary bool`, `cf_hostname_id`, `verification_token char(43)`, `verified_at`, `last_checked_at`, `dns_lost_at`, `released_at`, `created_by` | `UNIQUE(host)`, `(store_id, status)` |
| `support_grants` (0007) | `id`, `store_id`, `granted_by`, `scope longtext` (permission keys), `expires_at`, `revoked_at` | `(store_id, expires_at)` |
| `tickets` (0007, P opt.) / `ticket_messages` | `id`, `store_id NULL`, `user_id`, `subject`, `status`, `priority`, `assignee_id`, `kind`, `sla_due_at` / `id bigint`, `ticket_id`, `author_kind`, `author_id`, `body text`, `attachments`, `internal` | `(status, sla_due_at)`, `(store_id, created_at)` / `(ticket_id, id)` |
| `broadcasts` / `broadcast_reads` (0007, P) | `id`, `kind`, `audience longtext`, `title longtext` (ar/fr/en), `body longtext`, `cta longtext`, `starts_at`, `ends_at`, `dismissible` / `broadcast_id`, `user_id`, `seen_at`, `clicked_at`, `dismissed_at` | `(starts_at)` / PK `(broadcast_id, user_id)` |
| `abuse_reports` (0007, P*) | `id`, `store_id`, `page_url`, `reporter_contact`, `reason`, `details`, `status`, `ip_hash`, `handled_by`, `handled_at` | `(status, created_at)`, `(store_id)` |
| `store_daily_rollup` (0007) | `store_id`, `day`, `visitors`, `orders`, `placed_cents`, `confirmed_cents`, `delivered_cents`, `risky_orders`, `ai_generations` | PK `(store_id, day)` |
| `api_keys` (0007) | `id`, `store_id`, `label`, `prefix char(8)`, `key_hash char(64)`, `scopes longtext`, `last_used_at`, `created_by`, `revoked_at` | `UNIQUE(key_hash)`, `(store_id)` |
| `reviews` / `review_requests` (0007) | `id`, `store_id`, `product_id NULL`, `page_id NULL`, `order_id NULL`, `rating tinyint`, `body text`, `author_display`, `media longtext`, `verified`, `imported`, `incentivized`, `status enum(pending,published,hidden)`, `hidden_reason`, `locale` / `id`, `store_id`, `order_id`, `token_hash char(64)`, `sent_at`, `used_at`, `expires_at` | `(store_id, product_id, status)`, `(store_id, page_id, status)` / `UNIQUE(token_hash)` |
| `coupons` / `coupon_redemptions` (0007) | `id`, `store_id`, `code varchar(32)`, `kind`, `value_cents`/`percent_bp`, `scope`, `max_uses`, `uses`, `per_phone_max`, `starts_at`, `ends_at`, `status` / `id bigint`, `store_id`, `coupon_id`, `order_id`, `phone` | `UNIQUE(store_id, code)` / `UNIQUE(store_id, coupon_id, order_id)` |
| `stock_holds` (0007) | `id`, `store_id`, `order_id`, `product_id`, `sku`, `qty`, `state enum(held,released,decremented)`, `expires_at` | `(store_id, product_id, sku, state)` |
| `experiments` / `experiment_arms` (0007) | `id`, `store_id`, `page_id`, `mode enum(fair,auto)`, `status`, `horizon`, `min_sample`, `started_at`, `ended_at`, `winner_arm` / `id`, `store_id`, `experiment_id`, `key`, `kind enum(headline,hero,offer_display,version)`, `payload`, `weight_bp` | `(store_id, page_id)` / `UNIQUE(experiment_id, key)` |
| `short_links` (0007) | `id`, `store_id`, `code varchar(16)`, `target varchar(300)`, `utm longtext`, `clicks int` | `UNIQUE(store_id, code)` |
| `gene_stats_store` (0007, T) / `gene_stats_platform` (0007, P) | `store_id`, `niche_key`, `gene varchar(32)`, `value varchar(48)`, `alpha double`, `beta double`, `n_owner int`, `n_market int` / same without `store_id`, plus `n_stores` (k ≥ 5 before use) | PK `(store_id, niche_key, gene, value)` / PK `(niche_key, gene, value)` |
| `ai_exemplars` (0007) | `id`, `store_id`, `family`, `category`, `locale`, `market`, `field`, `angle`, `text varchar(1000)`, `score`, `uses`, `embedding blob NULL` (int8, R-D34) | `(store_id, field, locale)` |
| `design_archive` (0007, P) | `niche_key`, `cell_key varchar(32)`, `genome_id`, `score` (no store id; the genome id resolves server-side only) | PK `(niche_key, cell_key)` |

### D.7 Counters and atomic quota charging

```sql
-- chargeUsage(scope, { metric, period }, delta) with limit = entitlement value (NULL = unlimited)
INSERT IGNORE INTO store_usage (store_id, metric, period, value, updated_at) VALUES (?, ?, ?, 0, UTC_TIMESTAMP(3));
UPDATE store_usage SET value = value + ?, updated_at = UTC_TIMESTAMP(3)
 WHERE store_id = ? AND metric = ? AND period = ? AND (? IS NULL OR value + ? <= ?);
-- affectedRows = 1 → charged; 0 → QuotaError (nothing written). Refunds: value = GREATEST(0, value - ?).
```

- Charge **before** the side effect (upload bytes before files are written, a member before the insert, AI credits
  before the call as a reservation, reconciled with the real `usage` afterwards, AI-01); refund on failure in a
  `finally`.
- Nightly `usage.reconcile` job (§H.2) recomputes every gauge from its source (`SUM(media_files.bytes)` +
  `assets.stored_bytes`, `COUNT(*)` of pages, members, agents, webhooks) and corrects drift, logging the delta in
  `job_runs.summary`.
- `platform_usage` uses the same statements for platform counters (`ai_cost_micros` per month against the monthly cap,
  `mail_sent` per hour).

### D.8 Migration plan and the store #1 conversion

**Files.** `drizzle/0004_tenancy.sql` (R1.0), `drizzle/0005_r1.sql` (R1 product), `drizzle/0006_r2.sql`,
`drizzle/0007_r3.sql`. Each has a `meta/000N_snapshot.json` generated by drizzle-kit from `schema.ts`, then the SQL is
hand-written in the guarded style of 0002/0003 (`drizzle/0003_offers_v2.sql`): every statement is safe to run twice and
safe to resume after a crash, because MariaDB commits DDL implicitly and drizzle's single transaction is not atomic
(`node_modules/drizzle-orm/mysql-core/dialect.js:43-56`). Journal `when` values strictly increase after
`1792162674021`. Migrations run at boot under `GET_LOCK('<db>:migrations')` (`src/lib/db/migrate.ts:35-82`).

**Statement patterns** (portable to MySQL 8, no `IF NOT EXISTS` on columns or indexes):

```sql
-- new table (portable)
CREATE TABLE IF NOT EXISTS `stores` ( … , CONSTRAINT `fk_x` FOREIGN KEY … ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
-- add a column only when missing
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- backfill (no-op on empty tables)
UPDATE `pages` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
-- tighten to NOT NULL (no DEFAULT) only while still nullable
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `pages` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'store_id' AND is_nullable = 'YES');--> …
-- drop / add an index only when needed: information_schema.statistics (index_name)
-- add a FK only when missing: information_schema.table_constraints (constraint_type = 'FOREIGN KEY', constraint_name)
-- drop a column only when present: information_schema.columns
```

**0004 order** (the backfill steps are no-ops on an empty database):
1. `CREATE TABLE IF NOT EXISTS` for every §D.4 table (`plans` first, then `stores`, then the rest).
2. Seeds: `INSERT IGNORE` plans and kill-switch flags.
3. **Conditional store #1** (statement S1 below): only when legacy rows exist.
4. For each of `pages, page_versions, assets, media_files, orders, leads, blocklist, exports, stats_daily`: add
   `store_id` NULL → backfill with the constant → `MODIFY … NOT NULL` → add FK `fk_<table>_store` (RESTRICT).
   `audit_log.store_id` is added NULL-able and stays NULL-able; legacy rows whose action does not start with `auth.`
   get the constant, `auth.*` rows keep NULL.
5. Other column adds of §D.2 (users, sessions, pages.kind/product_id, assets.stored_bytes backfilled from
   `SUM(media_files.bytes)`, media_files.storage, audit_log.actor_kind/impersonator_id).
6. Home page (statement S2), then drop `pages.is_home` (guarded).
7. Unique and index swaps of §D.2 (create the new composite first, then drop the old global one).
8. Legacy memberships and the first super_admin (S3, TENANCY-MAP §2.4 step 6).
9. Legacy settings rows (S4); `ai`, `home` and `pixels` stay in `settings` for the JS task.

```sql
-- S1: store #1, only when the database already holds single-tenant data
INSERT INTO stores (id, handle, name, mode, status, plan_id, market, currency, timezone, default_locale, brand_seed, created_at, updated_at)
SELECT '00000000000000000000000001', 'store-1',
       COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$.storeName')) FROM settings WHERE `key` = 'store'), 'Store 1'),
       'landing', 'active', 'internal', 'MA', 'MAD', 'Africa/Casablanca', 'ar', LEFT(SHA2(UUID(), 256), 16), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE id = '00000000000000000000000001')
  AND ((SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM pages) + (SELECT COUNT(*) FROM orders) + (SELECT COUNT(*) FROM assets)) > 0;
-- S2: the old global home page becomes store #1's home
UPDATE stores SET home_page_id = (SELECT id FROM pages WHERE is_home = 1 ORDER BY updated_at DESC LIMIT 1)
WHERE id = '00000000000000000000000001' AND home_page_id IS NULL;
-- S3: memberships from users.role, and the legacy owner becomes super_admin
INSERT IGNORE INTO store_members (store_id, user_id, role, status, joined_at, updated_at)
SELECT '00000000000000000000000001', id,
       CASE role WHEN 'owner' THEN 'owner' WHEN 'editor' THEN 'editor' ELSE 'agent' END,
       IF(disabled, 'suspended', 'active'), created_at, UTC_TIMESTAMP(3)
FROM users WHERE EXISTS (SELECT 1 FROM stores WHERE id = '00000000000000000000000001');
UPDATE users SET platform_role = 'super_admin'
WHERE role = 'owner' AND platform_role = 'none' AND EXISTS (SELECT 1 FROM stores WHERE id = '00000000000000000000000001');
-- S4: store-level settings rows, kept in their v1 envelopes (purpose_v = 0) until the JS task re-seals them
INSERT IGNORE INTO store_settings (store_id, `key`, value, encrypted, purpose_v, updated_at)
SELECT '00000000000000000000000001', `key`, value, encrypted, 0, updated_at FROM settings
WHERE `key` IN ('store', 'defaults', 'sheets', 'pixel_library', 'pixel_health', 'tracking_secrets', 'turnstile')
  AND EXISTS (SELECT 1 FROM stores WHERE id = '00000000000000000000000001');
```

**JS conversion task** `convertLegacyStore()` (`src/lib/tenancy/convert.server.ts`), run from
`src/instrumentation.ts` inside `withBootLock` after migrations, marker = platform setting `tenancy_v1`:
1. Marker present → return. No store `0…01` → write the marker (empty install) → return.
2. Re-encrypt every `store_settings` row with `purpose_v = 0` and `encrypted = 1`: decrypt v1 with purpose
   `settings:<key>`, encrypt v2 with scope `store:0…01` (§F.3), set `purpose_v = 2` (compare-and-set on the old
   value).
3. `settings.ai` → `store_settings.store_ai` (`{ mode: "auto", tier, bgRemoval }`); `settings.home.pageId` →
   `stores.home_page_id` when still NULL; `stores.name` / `timezone` / `currency` / `market` from `store` and
   `defaults` (`APP_TIMEZONE` when set); the pixel library migration (`src/lib/pixels/migrate.server.ts:54-129`)
   for store #1 only, reading the legacy `pixels` key (PIX-07); new stores never run it.
4. `asset_refs` for every page draft and published version of store #1 (the same extractor as the save path, §G.5);
   `store_usage` gauges recomputed.
5. Delete the moved keys (`store`, `defaults`, `sheets`, `pixel_library`, `pixel_health`, `tracking_secrets`,
   `turnstile`, `ai`, `home`, `pixels`) from `settings`; write `tenancy_v1 = { v: 1, at, store1: true }` **last**.
Every step is idempotent; an interrupted run starts over at the next boot. The production Store Gen database may hold
the owner's first account and pages if the owner ran today's `/admin/setup` (HANDOFF §6): that is exactly the legacy
path, and the owner ends as `super_admin` and owner of store #1.

**Read-only gates.** `scripts/qa/upgrade-dry-run.ts` gains a `tenancy` section (also run once at boot, logging
`[tenancy-check]`, cloned from `src/lib/db/upgrade-check.ts:212-249`): rows with NULL `store_id` in tenant tables
(must be 0), stores without an active owner, cross-store references (order → page, order → version, export →
version, version → page, `asset_refs` → asset, `media_files` → asset, `store_members` → missing user), `store_settings`
rows with `purpose_v = 0`, duplicate handles, the marker. It runs on XAMPP and on a fresh production dump before every
R1 deploy (§H.10).

**0005-0007** add only new tables, appended enum values, new NULL-able or defaulted columns and new indexes; the one
type change is `orders.page_id` → NULL-able in 0006. None needs a backfill beyond defaults.

### D.9 Who may refine which tables

| Part spec | Tables whose columns it may refine (never `store_id`, never the name) |
|---|---|
| platform.md | `waitlist`, `signup_reviews`, `identity_links`, `protected_brands`, `legal_documents`, `legal_acceptances`, `notifications`, `notification_reads`, `flags`, `flag_overrides`, `platform_notes`, `support_grants`, `tickets`, `ticket_messages`, `broadcasts`, `broadcast_reads`, `abuse_reports`, `store_daily_rollup` |
| operations.md | `order_events`, `customers`, `agent_profiles`, `agent_stats_daily`, `saved_views`, `message_templates`, `sheet_bindings`, every accounting/carrier/commission/webhook table of 0006, `api_keys`; the `orders` columns added in 0005/0006 |
| landing.md | `delivery_zones`, `experiments`, `experiment_arms`, `short_links`; the `leads` columns of 0005 |
| storefront.md | `products`, `collections`, `collection_products`, `inventory_levels`, `reviews`, `review_requests`, `coupons`, `coupon_redemptions`, `stock_holds`; `pages.kind` values |
| ai.md | `ai_runs`, `ai_cache`, `ai_memory`, `prompt_versions`, `stats_version_daily`, `ai_feedback`, `ai_batches`, `ai_exemplars`, `gene_stats_*` (shared with design) |
| design.md | `design_genomes`, `headline_shingles`, `store_themes`, `design_archive`, `gene_stats_*` (shared with ai) |
| core (this doc) | everything else |

### D.10 Settings split (TN-04; SET-01 … SET-12)

Two registries replace `SETTINGS` (`src/lib/settings/schemas.ts:211-238`): `src/lib/settings/platform-registry.ts`
(`PLATFORM_SETTINGS`, rows in `settings`) and `src/lib/settings/store-registry.ts` (`STORE_SETTINGS`, rows in
`store_settings`). Each entry keeps today's `SettingDef` shape (`schema`, `secret`, `defaults`, `sensitive`).
`redactSetting` / `isMaskedSecret` (`schemas.ts:263-275`) are unchanged.

```ts
// src/lib/settings/index.ts
export function getStoreSetting<K extends StoreSettingKey>(scope: StoreScope, key: K, opts?: { fresh?: boolean }): Promise<StoreSettingValue<K>>;
export function getStoreSettings<K extends StoreSettingKey>(scope: StoreScope, keys: readonly K[]): Promise<{ [P in K]: StoreSettingValue<P> }>;
export function setStoreSetting<K extends StoreSettingKey>(scope: StoreScope, key: K, input: StoreSettingInput<K>, actor: SettingsActor): Promise<StoreSettingValue<K>>;
export function updateStoreSetting<K extends StoreSettingKey>(scope: StoreScope, key: K, patch: Partial<StoreSettingInput<K>>, actor: SettingsActor): Promise<StoreSettingValue<K>>;
export function invalidateStoreSettings(storeId: string, key?: StoreSettingKey): void;
export function getPlatformSetting<K extends PlatformSettingKey>(key: K, opts?: { fresh?: boolean }): Promise<PlatformSettingValue<K>>;
export function setPlatformSetting<K extends PlatformSettingKey>(key: K, input: PlatformSettingInput<K>, actor: PlatformActor): Promise<PlatformSettingValue<K>>;
// getSetting / setSetting / updateSetting are deleted; the lint forbids them (L3).
```

Cache: `ScopedCache` named `settings` (§E.6), key `${storeId}:${key}` (platform rows: `p:${key}`), 30 s TTL, ≤ 4,000
entries (SET-01, SET-05). Encryption: envelope v2 with scope `store:<storeId>` and purpose `settings:<key>`
(SET-02); platform secrets use scope `platform`. Audit rows carry `store_id` (SET-04).

| Key | Level | Secret | Today read at (TENANCY-MAP §3) | Target | Owner part / release |
|---|---|---|---|---|---|
| `store` | S | no | `render/publish.server.ts:135-152,617-620`, panel layout, generate, media, editor | contacts and legal facts (WhatsApp, phone, e-mail, address, legal name, optional ICE/RC, confirmation number + hours for LP-04); `stores.name` is authoritative for the name; logo moves to `brand` | core / R1 |
| `defaults` | S | no | new pages, blockPhone, sheets connect, pixels, generator | page defaults (locale order, delivery fee default **empty**, form options); currency/market/timezone move to `stores` columns (SET-08) | core / R1 |
| `sheets` | S | no | `sheets/config.ts:18-66`, sync, dashboard, PHP config | per store; uniqueness and ownership proof in `sheet_bindings` (SHT-01, SHT-09) | operations / R1 |
| `pixels` | — | no | migration only (`migrate.server.ts:77`) | not in any registry; read once by the conversion (PIX-07) | core / R1 |
| `pixel_library` | S | no | `pixels/library.server.ts:71-78` | per store; no longer a migration marker | operations / R1 |
| `pixel_health` | S | no | `pixels/health.server.ts:37-45,90` | per store, written through the scoped API; throttle key `${storeId}:${platform}:${id}` (SET-11) | operations / R1 |
| `tracking_secrets` | S | **yes** | `orders/conversions.ts:62-84`, `conversions-core.ts:230-257` | per store, keyed by pixel id inside the store (PIX-01, IN-03) | operations / R1 |
| `ai` | — | no | generate, media, background removal | **split** into platform `platform_ai` and store `store_ai`; the device tier stays in the browser | ai / R1 |
| `turnstile` | S override | **yes** | `publish.server.ts:161-164`, `orders/turnstile.ts:49`, anti-spam page | store override (needed for custom domains, R3); default = platform `platform_turnstile` (SET-09); tenants never see "from server env" | core / R1 |
| `home` | — | no | `admin-data/pages.ts:60-65,280-282,332`, publish, dashboard | **removed**: `stores.home_page_id` (SET-07, PUB-05) | core / R1 |
| `doc_schema` | P | no | `db/boot-tasks.ts:22-46` | unchanged platform marker (DB-19) | core |
| `tenancy_v1` | P | no | — | conversion marker (§D.8) | core / R1 |
| `platform` | P | no | — | brand (name "Store Gen", support WhatsApp, console accent), signup (mode, thresholds, pending quota, allowed markets), new-store defaults, `allowSellerBrandOrange: false` (D37), extra reserved handles, analytics k (5) | platform / R1 |
| `platform_ai` | P | no | — | provider enabled, model id (default `claude-opus-5-5`), per-route effort and fast mode, price table, monthly cap (USD), prompt version per task, eval thresholds, pattern-library switch | ai / R1 |
| `platform_turnstile` | P | **yes** | env defaults `schemas.ts:231-234` | the platform widget (apex hostname covers every store subdomain, IN-06); env `TURNSTILE_*` are its defaults | core / R1 |
| `platform_mail` | P | **yes** | — | SMTP host/port/user/password, sender, caps | platform / R2 |
| `platform_cloudflare` | P | **yes** | — | API token (custom hostnames), zone id, fallback origin | core / R3 |
| `platform_backup` | P | no | — | retention (7 daily, 4 weekly), tables, last download | core / R1 |
| `store_ai` | S | no | — | `mode` = `auto` / `local` / `server`, local tier ceiling, background removal, learning on/off, share patterns (default off) | ai / R1 |
| `brand` | S | no | — | logo asset id(s), accent/pop/neutral locks, font locks, voice summary; R2: logo designer parameters (`store_themes.logo`) | design / R1 basic, R2 full |
| `policies` | S | no | — | store policy facts (delivery, inspection, exchange, returns, contact channels) feeding legal pages and the AI prompt (GEN-08, LND-32) | landing / R1 |
| `checkout` | S | no | — | `zonesEnabled`, market field model (R-D45), confirmation-call promise on/off; R2: cart rules, buy model (R-D44) | landing R1 / storefront R2 |
| `ops` | S | no | — | calling window, retry ladder, unreachable policy, duplicate window (days), assignment mode, reveal-alarm threshold (R2) | operations / R1 |
| `conversions` | S | no | — | Purchase trigger `order` / `confirmed` / `delivered`, custom events on/off, 7-day guard behaviour (IN-02, R-D23) | operations / R1 |
| `notifications` | S | no | — | which events go to Telegram / in-app, daily summary hour | operations / R1 |
| `telegram` | S | **yes** | `export/templates/order.php:2632-2660` (PHP only) | bot token + chat id (IN-04) | operations / R1 |
| `export_key` | S | **yes** | `export/service-account.ts:51-80` (platform key today) | optional store-owned Google export key for PHP exports; the platform key is never embedded (EXP-03) | operations / R1 |
| `storefront` | S | no | — | menus, header/footer, announcement bar, theme reference | storefront / R2 |
| `carrier_credentials` | S | **yes** | — | `{ [carrierAccountId]: credentials }` | operations / R2 |
| `accounting` | S | no | — | packaging default, tax profile, currency display | operations / R2 |
| `reviews` | S | no | — | request delay, channel, disclosure text | storefront / R3 |

A key's schema is owned by the part named in the table; the core creates every R1 key in the registry during R1.0 with
a minimal schema (`z.object({}).passthrough()` is **not** allowed: each starts with the fields listed above) so tracks
never edit the registry file itself (§K.3, extension files `src/lib/settings/keys/<key>.ts`).

---

## E. The StoreScope seam

### E.1 Types (`src/lib/tenancy/types.ts`, frozen in the R1.0 contract step)

```ts
declare const SCOPE: unique symbol;
/** The only value a data function accepts as "which store". Constructible only by the seam functions below. */
export interface StoreScope {
  readonly storeId: string;
  readonly kind: "member" | "impersonation" | "public" | "system" | "platform";
  readonly [SCOPE]: true;
}
export type StoreStatus = "pending" | "active" | "restricted" | "suspended" | "closed" | "scheduled_deletion" | "purged" | "rejected";
export interface StoreRow {                     // cached view of `stores` (15 s, §E.5)
  id: string; handle: string; name: string; mode: StoreMode; status: StoreStatus; planId: string;
  market: string; currency: string; timezone: string; defaultLocale: string; homePageId: string | null;
  brandSeed: string; catalogVersion: number; addressVersion: number; requireMember2fa: boolean; primaryDomain: string | null;
}
export interface Membership { role: StoreRole; status: "active" | "suspended"; synthetic?: "impersonation" }
export interface Actor { kind: "user" | "platform" | "impersonation" | "system" | "api"; userId: string | null; impersonatorId: string | null; ip: string | null }
export interface StoreCtx {
  user: SessionUser; store: StoreRow; membership: Membership; scope: StoreScope; actor: Actor;
  impersonation: ImpersonationInfo | null;
  can(p: StorePermission): boolean;            // matrix ∧ mode ∧ release ∧ state ∧ impersonation
}
export interface PlatformCtx { user: SessionUser; role: PlatformRole; actor: Actor; can(p: PlatformPermission): boolean; stepUpFresh: boolean }
export interface SystemCtx { job: string; actor: Actor /* kind "system" */ }
export interface PublicTarget { store: StoreRow; scope: StoreScope /* kind "public" */ }
```

`SessionUser` loses `role` and gains `platformRole`, `locale`, `lastStoreId` (`src/lib/auth/index.ts:57-64`).

### E.2 Entry points (every request into store data passes exactly one)

```ts
// src/lib/tenancy/seam.ts (server-only)
export interface RequireStoreOpts {
  handle?: string;                                       // pages and route handlers pass params.store; actions omit it (D2)
  permission?: StorePermission | readonly StorePermission[];   // all required
  feature?: FeatureKey;                                  // entitlement that must be true
  allowStates?: readonly StoreStatus[];                  // default: pending, active, restricted, suspended(read), closed(read, owner/admin)
  throwOnFail?: boolean;                                 // pages: redirect/notFound; actions/routes: AuthError
}
export function requireStoreMember(opts?: RequireStoreOpts): Promise<StoreCtx>;

/** server actions in src/app/app/** and src/lib/**: the body of every exported action is `return storeAction(...)` */
export function storeAction<T>(
  permission: StorePermission | readonly StorePermission[] | null,
  fn: (ctx: StoreCtx) => Promise<T>,
  opts?: { feature?: FeatureKey; rate?: { name: string; limit: number; windowSec: number; per?: "store" | "user" } },
): Promise<ActionResult<T>>;

/** route handlers under src/app/api/app/[store]/** */
export type StoreGuard = { ok: true; ctx: StoreCtx } | { ok: false; response: Response };
export function storeGuard(req: Request, handle: string, permission: StorePermission | readonly StorePermission[], opts?: { feature?: FeatureKey }): Promise<StoreGuard>;

// src/lib/platform/seam.ts
export function requirePlatform(opts?: { permission?: PlatformPermission; throwOnFail?: boolean }): Promise<PlatformCtx>;
export function platformAction<T>(permission: PlatformPermission, fn: (ctx: PlatformCtx) => Promise<T>, opts?: { stepUp?: boolean }): Promise<ActionResult<T>>;
export function platformGuard(req: Request, permission: PlatformPermission): Promise<{ ok: true; ctx: PlatformCtx } | { ok: false; response: Response }>;
/** the only way platform code reads one store's data through the normal repositories (console store profile, impersonation) */
export function platformScope(ctx: PlatformCtx, storeId: string): StoreScope;   // kind "platform", read-only repositories only (lint L6)

// src/lib/auth/index.ts
export function requireUser(opts?: { throwOnFail?: boolean }): Promise<SessionUser>;   // account pages; no store, no permission
export function userAction<T>(fn: (ctx: { user: SessionUser; actor: Actor }) => Promise<T>): Promise<ActionResult<T>>;
export function publicAction<T>(name: string, fn: (ctx: { ip: string; ua: string }) => Promise<T>, opts: { turnstile: "required" | "when-configured" | "challenge"; burst: BurstName }): Promise<ActionResult<T>>;

// src/lib/tenancy/public.ts (public route handlers: order, lead, event, upsell, track, store pages)
export function resolvePublicTarget(pageKey: string): Promise<(PublicTarget & PageTarget) | null>;   // via pages.public_key / exports.public_key
export function resolveStoreByHandle(handle: string): Promise<StoreRow | null>;                     // cached; history lookup on a miss
export function publicScope(store: StoreRow): StoreScope;

// src/lib/jobs/scope.ts (cron, boot tasks, outbox, renders)
export function systemScope(ctx: SystemCtx, storeId: string): StoreScope;                            // kind "system"
export function forEachStore(ctx: SystemCtx, opts: { job: string; states: readonly StoreStatus[]; budgetMs: number; where?: "pending_sheets" | "pending_outbox" | "pending_renders" }, fn: (scope: StoreScope, store: StoreRow) => Promise<void>): Promise<{ visited: number; done: boolean }>;
```

`requireStoreMember` order of checks (identical answers for "not a member" and "no such store": the neutral 404 for
pages, `{ ok: false, error: "not_found" }` for actions, so store existence never leaks):
1. Session (`validateSessionToken`), MFA passed; platform ban → signed out.
2. Store: `handle` from `opts.handle`, else from `x-sg-path` (`/app/<handle>/…`); `resolveStoreByHandle`; host class
   must be `platform` (D2, §C.3).
3. Membership: `store_members` row (`status = 'active'`), or the impersonation membership (§B.8). Staff without a
   membership get 404 like anyone else.
4. `require_member_2fa` → enrolment redirect when the user has no TOTP (D12).
5. State: the store status must be in `allowStates`; `suspended` and `closed` give a read-only ctx (every write
   permission refused except those marked `readOnlyOk`, §A.3.1).
6. Permissions: each `opts.permission` through `ctx.can()`; `opts.feature` through `assertFeature`.
7. Touch `store_members.last_active_at` at most every 10 minutes.

`storeAction` = `requireStoreMember({ permission, feature, throwOnFail: true })` + the read-only guard (impersonation
refuses every write; `suspended`/`closed` refuse writes not marked `readOnlyOk`; `platform_read_only` refuses every
write) + `rate` bucket + the error mapping of today's
`adminAction` (`src/lib/admin-data/action.ts:27-49`: `ActionError`, `AuthInputError`, `ZodError`, never a raw DB
message) + the new codes `not_found`, `forbidden`, `read_only`, `impersonation_read_only`, `quota`, `feature_off`,
`step_up`. `adminAction` and `adminGuard` (`src/lib/orders/http.ts:164-174`) are deleted in R1.0 (AUTH-23).

### E.3 The rule: every query is scoped

1. **Every function that reads or writes a tenant table takes `scope: StoreScope` as its first parameter.** There is
   no exception for "by id": the id is globally unique, the store predicate is still added.
2. **Every predicate includes the store.** Helpers (`src/lib/tenancy/sql.ts`):
   ```ts
   export function inStore<T extends { storeId: AnyMySqlColumn }>(table: T, scope: StoreScope): SQL;              // eq(table.storeId, scope.storeId)
   export function whereStore<T extends { storeId: AnyMySqlColumn }>(table: T, scope: StoreScope, ...conds: (SQL | undefined)[]): SQL;
   export function byId<T extends { storeId: AnyMySqlColumn; id: AnyMySqlColumn }>(table: T, scope: StoreScope, id: string): SQL;
   export function storeValues<V extends object>(scope: StoreScope, values: V): V & { storeId: string };
   export function storeSql(scope: StoreScope): SQL;   // `store_id = ?` fragment for raw SQL (stats, usage, rollups)
   ```
3. **0 rows means "not found"**, identical for "another store's id" and "missing" (status, timing class and body). An
   update/delete by id that affects 0 rows answers `not_found`.
4. **Inserts take `storeId` from the scope only** (`storeValues`), never from input. Input schemas never contain
   `storeId` (GEN-02: `CreateFromDirectionsInput` stays store-free).
5. **References inside a store are validated against the same store** before use: asset ids in a document (LND-05,
   MED-18), `sourceAssetId` (MED-02), page/version ids in history and exports (EXP-01, ADM-19), pixel ids, product
   ids. Helper `assertOwned(scope, kind, ids)` in `src/lib/tenancy/owned.ts`.
6. **Platform cross-store reads** (console lists, store profile aggregates, cron iterators, purge, a user's
   memberships) live only in `src/lib/platform/**`, `src/lib/jobs/**`, `src/lib/tenancy/**`, `src/lib/auth/**` and
   `src/lib/db/**`, each query annotated `// tenancy: platform <reason>`; the console reads one store's detail through
   `platformScope()` and the normal repositories (read functions only). **Public resolvers** that find a row by a
   random global key (pageKey, export key, media key, upsell and tracking tokens, invite tokens) live only in
   `src/lib/tenancy/{public,invites}.ts`, are annotated `// tenancy: public-key <key>`, and return a scope that every
   later query uses.
7. `src/app/**` and `src/components/**` never import `@/lib/db/client` or `@/lib/db/schema` (ADM-38); pages and
   actions call repositories.

Enforcement = types (rule 1), the lint (§F.1 rules L1-L10, failing `npm test`), the schema (§D.1), the attack suite
(§J). The ~225 existing query sites (TENANCY-MAP §0) are converted in R1.0: most by T4, the public write path by
T3, settings and audit by T1 (§K.1).

### E.4 Request-context seam (for tests and jobs)

`src/lib/tenancy/context.ts` wraps `AsyncLocalStorage<RequestIdentity>`:
`runAsIdentity({ sessionToken | userId, path, headers? }, fn)` is honoured **only** when
`process.env.SG_TEST_CONTEXT === "1"` and `NODE_ENV !== "production"` (boot logs an error and ignores it otherwise).
`requireUser` / `requireStoreMember` / `getRequestContext` read the identity from it before falling back to
`cookies()` / `headers()`. The attack suite (§J) uses it to call every exported action as another store's member
without HTTP. Jobs never use it: they get a `SystemCtx`.

### E.5 Store resolution caches

`resolveStoreByHandle`, `getStoreById`: `ScopedCache` `stores` (2,000 entries, 15 s; misses cached 10 s, at most 4,096
negative entries so random handles can't flood memory, PUB-13). `resolvePublicTarget` keeps today's
`__codOrderCache` (pageKey → target, `src/lib/orders/resolve.ts:39`) with `storeId` and `status` added to the cached
target (ORD-01). `transitionStore` and handle renames call `invalidateStore(storeId)`.

### E.6 Process caches keyed by store (TN-11; TENANCY-MAP §7.5)

```ts
// src/lib/tenancy/cache.ts
export class ScopedCache<V> {
  constructor(opts: { name: string; maxEntries: number; maxBytes?: number; ttlMs: number; sizeOf?: (v: V) => number });
  get(storeId: string, key: string): V | undefined;
  set(storeId: string, key: string, value: V): V;
  delete(storeId: string, key?: string): void;          // key omitted = the whole store
}
export function scopedCache<V>(opts: ConstructorParameters<typeof ScopedCache<V>>[0]): ScopedCache<V>;   // registered on globalThis.__sgCaches by name
export function invalidateStore(storeId: string): void;  // every registered cache + entitlements + settings + render
```

| Global today | Key today | Target |
|---|---|---|
| `__codSettingsCache` (`settings/index.ts:29`) | setting key | `scopedCache("settings")`, `${storeId}:${key}` (**leak** fixed, SET-01) |
| `__codRenderCache` (`render/cache.server.ts:27`) | slug, `/`, `versionId:slug:kind` | `scopedCache("render")` byte-bounded (32 MB), key `${storeId}:${path}:${locale}:${catalogVersion}:${addressVersion}`; `invalidateStore` replaces `invalidatePublished()` (PUB-04, PUB-13) |
| `__codPixelUsage` (`pixels/usage.server.ts:38`) | one index | `scopedCache("pixel-usage")` per store (PIX-05) |
| `__codPixelHealth` (`pixels/health.server.ts:22`) | `platform:id` | `${storeId}:${platform}:${id}` (SET-11) |
| `__codSheetsSync` (`sheets/sync.ts:245`) | one state | `Map<storeId, SyncState>` (SHT-04) |
| `__codSheetsHeaders`, `__codSheetsToken` | spreadsheetId:title, SA token | unchanged (per sheet, per credential) |
| `__codOrderCache` (`orders/resolve.ts:39`) | pageKey / version id | unchanged keys; cached targets carry `storeId` + status (ORD-01) |
| `__codExportOrigins` (`orders/export-origins.ts:27`) | union of exports | unchanged for preflight (documented, PUB-21); `invalidateStore` clears it |
| `__codEncodedCache`, `__codMediaState`, `__codFocusFlights`, `__codFocusMisses` | content / key / asset id | unchanged keys (per-store ids, D21); media gains `evictStore(storeId)` |
| `__codMediaGate`, `__codUploadSlots` (`media/process.ts:64`, `upload-slots.ts:13`) | process / user | per-store fairness: ≤ 1 active + 1 waiting job per store inside the global 2 + 4 (MED-04); slots `${storeId}:${userId}` (MED-14) |
| `__codMediaThrottle`, `__codBurst`, `__codForeignHosts`, `__codDb` | IP / host / pool | platform guards, unchanged |
| `__codDbUsage` (`db/usage.ts:33`) | whole DB | console only (ADM-06); tenants see `store_usage` |
| crypto `keyCache` (`security/crypto.ts:14`) | purpose | bounded LRU, 512 keys (SET-12) |
| new: `stores`, `entitlements`, `flags`, `memberships` | — | `scopedCache` 15 s / 30 s / 30 s / 5 s |
| client: focal cache, AI manager, builder/wizard drafts | asset id, tab | reset on store switch and sign-out (§B.4) |

The lint (L4) fails on any `globalThis.__cod*` / `globalThis.__sg*` declaration or `new Map(` at module scope in
`src/lib/**` that is not created through `scopedCache()` or listed in `scripts/qa/tenancy-allow.json` with a reason.

### E.7 Named locks

```ts
// src/lib/db/locks.ts
export function storeLock(storeId: string, name: string): LockName;    // `${db8}:s:${storeId}:${name}` (≤ 64 chars; name ≤ 25)
export function platformLock(name: string): LockName;                  // `${db8}:p:${name}`
export function withNamedLock<T>(lock: LockName, timeoutSec: number, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
// dedicated pool connection held for the whole fn (GET_LOCK is connection-scoped); RELEASE_LOCK in finally
```

`db8` = first 8 hex chars of sha256(database name) (lock names are server-wide). Today's `GET_LOCK('cod:sheets-sync')`
(`sheets/sync.ts:47`, SHT-03) becomes `storeLock(id, "sheets")`; migrations and boot keep their own locks
(`src/lib/db/migrate.ts`, `boot-lock.ts`).

### E.8 Rate-limit buckets (TENANCY-MAP §7.6)

`rateLimit(bucket: Bucket, limit, windowSec)` accepts only the branded `Bucket` type, built by
`platformBucket(name, key?)` → `p:<name>[:<key>]` or `storeBucket(scope, name, key?)` → `s:<storeId>:<name>[:<key>]`
(≤ 191 chars; keys are hashes, never raw e-mails or IPs). The purge job is unchanged.

| Today | Target | Limit |
|---|---|---|
| `auth:login:ip:*`, `auth:login:acct:*` | `p:login:ip:<ipHash>`, `p:login:acctnet:<h>`, `p:login:acct:<h>` | §B.3 |
| `auth:mfa:*`, `auth:password:*`, `auth:setup:ip:*` | `p:mfa:{ip,user,manage,stepup}:*`, `p:password:<userId>`, `p:setup:ip:*` | unchanged values |
| — | `p:signup:ip:<h>` 5/h · `p:signup:net:<h>` 3/day (velocity signal) · `p:invite:accept:ip:<h>` 10/15 min · `p:reset:ip:<h>` 10/15 min · `p:handle:ip:<h>` 60/10 min · `p:store:create:<userId>` 3/day | new |
| `api:order:<ipHash>` (60/10 min) | `p:api:order:<ipHash>` | unchanged (coarse floor) |
| `order:ip:<ipHash>` (8/10 min, `orders/create.ts:153`) | `s:<sid>:order:ip:<ipHash>` (ORD-02) | 8/10 min |
| — | `s:<sid>:orders` store flood breaker | 600 / 10 min (above: 429; protects the shared DB, far above real COD volume) |
| `order:page:<pageId>` | unchanged (already store-local) | |
| `lead:ip:*` (30), `upsell:ip:*` (20) | `s:<sid>:lead:ip:*`, `s:<sid>:upsell:ip:*` (ORD-17, ORD-18) | unchanged |
| `evt:ip:<net>`, `evt:uniq:*` | `p:evt:ip:<net>` (platform floor) + uniques unchanged (STAT-03) | |
| — | `p:track:ip:<h>` 30/10 min + `s:<sid>:track:ip:<h>` 10/10 min (LP-05) | new |
| `sheets:pull` (global 1/290 s) | `s:<sid>:sheets:pull` (SHT-06) | 1 / 290 s |
| `sheets:{connect,sync,test}:<userId>` | `s:<sid>:sheets:<op>:<userId>` | unchanged |
| `export:{create,estimate}:<userId>` | `s:<sid>:export:<op>:<userId>` + `s:<sid>:export:<op>` (20/h store aggregate) (EXP-05) | |
| `media:upload:<userId>` (120/10 min), `media:focal:<userId>` | `s:<sid>:media:upload:<userId>`, `s:<sid>:media:focal:<userId>` + daily bytes `s:<sid>:media:bytes` (1 GiB/day) (MED-14) | |
| — | `s:<sid>:publish` 60/h · `s:<sid>:invite` 20/day · `s:<sid>:ai:<task>` (credits first, then 120/h) · `s:<sid>:pulse:<userId>` 12/min | new |
| `cron:ip:*`, in-memory `burstLimit` | `p:cron:ip:*`; in-memory burst limits unchanged (platform pre-DB floor) | |

---

## F. Security

### F.1 Isolation enforcement (TN-10)

**Static gate** `scripts/qa/tenancy-lint.ts` (`npm run test:tenancy-lint`, part of `npm test`; TypeScript compiler
API, `typescript` 5.9.3, D47). It loads `src/**/*.{ts,tsx}` and fails with `file:line rule message` on:

| Rule | Fails when |
|---|---|
| L1 | a Drizzle call on a **tenant table** (`.from(T)`, `.update(T)`, `.delete(T)`, `.insert(T)`, `innerJoin/leftJoin(T)`) sits in a function without a `StoreScope`-typed parameter, unless the enclosing file is under the platform or public-resolver allowlist (§E.3 rule 6) **and** the statement carries `// tenancy: platform <reason>` or `// tenancy: public-key <key>` |
| L2 | a `select/update/delete` on a tenant table whose `.where(…)` argument contains neither `inStore(` / `whereStore(` / `byId(` / `storeSql(` nor a `.storeId` column reference |
| L3 | an `insert(T).values(…)` on a tenant table whose values are not wrapped in `storeValues(` (or a literal object with `storeId: scope.storeId`); any call to the removed `getSetting`/`setSetting`/`updateSetting` |
| L4 | a module-scope `globalThis.__cod*` / `__sg*` declaration or `new Map(`/`new Set(` in `src/lib/**` not created by `scopedCache()` and not in `scripts/qa/tenancy-allow.json` (each entry: file, symbol, reason) |
| L5 | `rateLimit(` with an argument that is not a `Bucket` (also a type error); a `GET_LOCK` string literal outside `src/lib/db/` |
| L6 | `platformScope(` used outside `src/app/admin/**` and `src/lib/platform/**`, or passed to a repository function marked `/** @write */` |
| L7 | an import of `@/lib/db/client` or `@/lib/db/schema` from `src/app/**` or `src/components/**` (ADM-38) |
| L8 | a string literal or template starting with `/admin` in `src/components/**` or `src/app/app/**`, or `` `/${slug}` ``-style live URLs (use `appHref` / `storeUrl`, ADM-37, ADM-39) |
| L9 | an exported async function in a `"use server"` file whose body does not start with `return storeAction(`, `return platformAction(`, `return userAction(` or `return publicAction(` (AUTH-31) |
| L10 | raw SQL (drizzle `sql` template literals, `db.execute`, `conn.query`) naming a tenant table without `store_id` in the text, unless annotated `// tenancy: platform <reason>` in an allowlisted directory |

Tenant tables for the lint = every table whose Drizzle definition uses `storeRef()` (read from `schema.ts`, so a new
table is covered the day it is added). The lint prints the count of `tenancy: platform` annotations per directory;
the count may only grow with a reviewer's approval (the allow file pins it).

**DB-backed two-store attack suite** `scripts/qa/tenancy-check.ts` (`npm run test:tenancy`, §J.2): stores A and B
seeded with canaries, every exported action and repository called as each role of B with A's ids, asserting
identical not-found answers, byte-identical A rows (checksums before/after) and no canary in any return value; plus
the special cases of TENANCY-MAP §10.2 (same slug, same pixel id, sheet with A's order ids pulled for B, per-phone
limit and blocklist, identical image upload, `sourceAssetId` of A, docs referencing A's assets at save/publish/export,
quota race, settings cache, render cache, suspended pageKey, invite token reuse/expiry/escalation/enumeration) and the
new ones: impersonation write refusal, `x-sg-path` tampering, `platformScope` writes, store-host `Next-Action`.

**Server-action replay** `scripts/qa/action-replay.ts` (`npm run qa:action-replay`, against a running server on
3451+): Playwright (msedge) records the `Next-Action` ids and bodies while owner A works, then replays them with B's
session to A's paths and to B's paths with A's ids; every replay must answer `not_found`/`forbidden` and leave A's rows
unchanged.

### F.2 What isolation covers (checklist the suite proves)

Rows (every tenant table) · files (media keys of a non-servable store 404; `DATA_DIR/<area>/<storeId>/` layout, §G) ·
caches (§E.6) · locks and buckets (§E.7-E.8) · settings and secrets (per-store envelopes, §F.3) · search and ⌘K
(ADM-02) · CSV/ZIP exports (ORD-15, EXP-01) · Sheets push/pull (SHT-02, SHT-05) · CAPI tokens (PIX-01) · web storage
on the shared origin (§C.9) · AI memory, cache and genomes (AI-08) · cross-tenant design checks return scores only
(R-D36) · the console (masked PII, §F.11).

### F.3 Envelopes v2 and per-store keys (SET-02, SET-12)

```ts
// src/lib/security/crypto.ts
export type CryptoScope = { store: string } | "platform";
export function seal(plain: string, scope: CryptoScope, purpose: string): string;
//   "v2.k1.<iv>.<tag>.<ct>"  key = HKDF-SHA256(APP_SECRET, salt "cod-studio", info "<scope>:<purpose>:k1", 32 bytes)
//   scope string = "store:<storeId>" | "platform";  AAD = "<scope>|<purpose>"
export function open(envelope: string, scope: CryptoScope, purpose: string): string;   // v2; v1 → decrypt(envelope, legacyPurpose) only via openLegacy
export function openLegacy(envelope: string, purpose: string): string;                // today's decrypt() (v1), used by the conversion and by TOTP
export function hmacBytes(data: Uint8Array, purpose: string): string;                // media ids (D21)
// encrypt()/decrypt() keep working for v1 purposes that never change: "totp:<userId>", gate/session signing
```

- The HKDF salt `cod-studio` and every existing purpose string are frozen (brand-sweep hazard, TENANCY-MAP §11.1);
  `src/lib/security/selftest-envelope.ts` (in `npm test`) decrypts golden v1 and v2 vectors so a rename breaks the
  build.
- `kid` `k1` = APP_SECRET generation 1. A future rotation adds `APP_SECRET_NEXT` and `k2`; `open` picks the key by
  kid; a boot task re-seals. Not built in R1.
- A ciphertext copied from store A's row to store B's row fails to open (different key and AAD), tested in §J.
- Store secrets: `tracking_secrets`, `turnstile`, `telegram`, `export_key`, `carrier_credentials` (R2), webhook
  secrets (R2), API key hashes (R3). Platform secrets: `platform_turnstile`, `platform_mail`, `platform_cloudflare`,
  plus env (§H.7).

### F.4 Per-store limits and fairness

Buckets: §E.8. Fairness on one shared process: per-store media gate slots (§E.6), per-store Sheets request budget per
tick (IN-01), per-store outbox and render claims per tick (§H.2), per-store AI credits and a per-store daily AI cap
(AI-01), the store order flood breaker. A store over a limit gets a typed error; other stores are unaffected.

### F.5 Audit (SE-04)

```ts
// src/lib/audit.ts
export interface AuditScope { storeId: string | null; actorKind: Actor["kind"]; impersonatorId?: string | null }
export function audit(action: AuditAction, details: AuditDetails & { scope?: AuditScope }): Promise<void>;   // never throws (unchanged)
export function auditFrom(ctx: StoreCtx | PlatformCtx | SystemCtx, action: AuditAction, details?: AuditDetails): Promise<void>;
export function listStoreAudit(ctx: StoreCtx, opts: { beforeId?: number; limit?: number; area?: string }): Promise<AuditEntry[]>;   // store_id = ctx.store.id
export function listPlatformAudit(ctx: PlatformCtx, opts: { storeId?: string; actorKind?: string; beforeId?: number }): Promise<AuditEntry[]>;
```

- New actions (namespaced): `store.created`, `store.mode_changed`, `store.handle_renamed`, `store.closed`,
  `store.reopened`, `store.deletion_scheduled`, `store.purged`, `store.export_requested`, `store.export_downloaded`,
  `store.member.invited|accepted|revoked|role_changed|suspended|removed`, `store.settings.updated`,
  `store.2fa_required_changed`, `platform.signup.approved|rejected|info_requested|reopened`,
  `platform.store.restricted|suspended|restored|closed|deletion_cancelled|purge_requested|purge_confirmed`,
  `platform.impersonation.started|ended|write_refused`, `platform.pii.revealed`, `platform.user.banned|unbanned|2fa_reset|reset_link|signed_out`,
  `platform.plan.changed`, `platform.entitlement.set`, `platform.flag.changed`, `platform.kill.changed`,
  `platform.staff.changed`, `platform.backup.downloaded`, plus today's `auth.*` and the domain events of R3.
- `auth.login.*` rows stay platform-only (`store_id` NULL). Tenants see only rows with their `store_id`, including
  platform actions on their store (with the staff member's display name, never the staff IP hash).
- Redaction (`src/lib/audit.ts:57-84`) unchanged; meta ≤ 4 KB. Retention: 400 days, then rolled up (OS-11).
- R3 (SE-08): `prev_hash`/`row_hash` HMAC chain per row (purpose `audit-chain`), a weekly break-glass review view.

### F.6 Security headers on every response (D31)

Today the neutral 404 (`UNKNOWN_PAGE_HEADERS`, `src/lib/auth/unknown-page.ts:52-56`) carries no security header. Target
sets (`src/lib/security/headers.ts` exports one function per class; `HSTS` = `max-age=63072000` in production, no
`includeSubDomains`):

| Response class | Producer | Headers |
|---|---|---|
| Neutral 404 / 410 / 503 (proxy, route handlers, fallback rewrite, hidden cron) | `UNKNOWN_PAGE_HEADERS`, `unavailablePageHeaders()` | today's set + `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Content-Security-Policy: default-src 'none'; style-src 'sha256-<hash of the inline style>'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, HSTS. **Byte-identical across every producer** (the 404-uniformity rule stays). |
| Platform UI (console, dashboard, auth, marketing) | proxy (`platformUiHeaders(nonce)`, today's `adminSecurityHeaders`) | nonce CSP, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` (marketing: indexable, `Cache-Control: public, max-age=0, s-maxage=300`) |
| Store documents (landing, store pages, legal, track, thank-you) | `documentResponse` (`src/lib/render/serve.server.ts:162`) | the stored hash CSP (per host, §C.9), COOP `same-origin-allow-popups`, base headers; track and thank-you `private, no-store` |
| Public JSON APIs | `apiHeaders` (`src/lib/orders/http.ts:26`) | base headers + `Cache-Control: no-store` + CORS only for allowed exports |
| Media | media route | today's sandbox CSP, nosniff, CORP (unchanged) + HSTS |
| Redirects (303 gate, 307/308) | proxy, store routes | base headers, `Cache-Control: private, no-store` (308 canonical: `public, max-age=300`) |
| `/api/health` | route | base headers, `Cache-Control: no-store` |

Checked by `scripts/qa/headers-check.ts` against a production build (§J.3): every class, every host class, and a
diff of the 404 header sets across producers.

### F.7 CSRF and Origin

§C.9. Server actions additionally rely on Next's built-in Origin vs `x-forwarded-host`/`host` check
(`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:13`); no
`allowedOrigins` entry is added in R1 (the apex never runs behind the Worker, R-D4). A store host posting an action
fails three times: Worker 404, proxy 404, Next origin mismatch (Origin = the store host, Host = the apex).

### F.8 Signup abuse

Turnstile (platform widget) · scrypt semaphore (§B.3) · `p:signup:*` buckets · `scoreSignup()` signals (disposable
list vendored as `src/lib/platform/data/disposable-domains.json` from the CC0 list, MX lookup 2 s fail-open,
`protected_brands` match on name/handle/e-mail local part, identity links, velocity, bot UA, too-fast form) · the
pending sandbox (nothing public, no integrations) · invite mode on the temporary domain (D9) · brand-protected handles
· nothing auto-rejected at launch (R-D12).

### F.9 Data export and deletion per store (PL-09, R-D13)

**Export ZIP** (`store.export` ↑ for owner/admin; in the console only a super_admin with `stores.close` ↑ and a
reason, audited and notified to the store, e.g. for a store being closed): an `export_jobs` row
built by the cron in slices (§H.2) into `DATA_DIR/exports/<storeId>/<jobId>/`, then zipped (stored, not deflated,
for media) into parts of ≤ 500 MB. Content: `orders.csv` (every column, phones full), `leads.csv`, `customers.csv`,
`order_events.csv`, `pages/<slug>/{doc.json, index.html, merci.html}` (published versions), `drafts/<slug>.json`,
`media/<assetId>.<ext>` (largest stored variant), `settings.json` (**every secret key omitted**, other keys through
`redactSetting`), `members.csv` (name, e-mail, role, status), `audit.csv` (store rows), `README.txt` (ar/fr/en).
Download: `/api/app/<h>/exports/<jobId>/<part>?t=<sig>` with a session that still has `store.export`; signature =
`hmac(jobId|part|exp, "export-dl:<storeId>")`, valid 24 h; parts deleted after 72 h. Audit on request and on each
download.

**Deletion**: `scheduled_deletion` → purge job (§H.9) deletes, in slices of ≤ 2,000 rows and ≤ 15 s per tick, in this
order: outbox, render_jobs, export_jobs (and their files), ai_*, design_genomes, headline_shingles (by `owner_tag`),
every R2/R3 tenant table (the job walks the §D.3 registry, so a new tenant table is covered without code changes),
order_events, agent tables, saved_views, message_templates, delivery_zones, sheet_bindings, notifications, job_runs and
error_events rows of the store, leads, orders, customers, stats, page_versions, pages, exports, asset_refs, media files
on disk (`DATA_DIR/media/v1/<xx>/<storeId>/`) then `media_files`/`media_chunks`/`assets`, store_settings,
store_entitlements, store_usage, store_subscriptions, store_invites, store_members, then the tombstone (§A.5.1).
Kept: `audit_log` rows (meta redacted: PII keys removed) and `impersonation_sessions` for 400 days,
`legal_acceptances` (proof of acceptance), `signup_reviews` with `signals` and `business_context` nulled,
`platform_notes`, `store_handle_history`. Retention for legal reasons is **[unverified]** (platform-admin.md §7): until a lawyer
answers, orders are not kept after purge.

### F.10 Secrets handling

- Secrets live only in env (platform, §H.7), in encrypted platform settings or in encrypted store settings. Never in
  code, logs, audit meta (redaction), error events (`errorSummary` only), job summaries, notifications, exports or the
  browser (masked by `redactSetting`).
- The console never shows a store's secrets, not even masked fields beyond "set / not set".
- Agents in this repo never print `.env.local` / `.env.hostinger*` (HANDOFF §2.5); the owner pastes keys into the
  console or hPanel himself.
- PHP exports embed only the store's own optional export key (EXP-03); `GOOGLE_EXPORT_SA_JSON_B64` is removed.
- `scripts/qa/secrets-check.ts` (existing) runs in `npm run gate` (§J) and gains the new key names.

### F.11 Customer PII in the console and in AI (R-D16, R-D31)

Console lists and the store profile show masked phones (`06 •• •• 12 34`), first name + initial, city. A one-order
reveal needs `pii.reveal` ↑ + a reason, writes `platform.pii.revealed` and appears in the store's Activity. No bulk PII
export for support, analysts or admins; the only staff path to a full export is the super_admin store export of §F.9
(step-up, reason, audited, the store notified). Analysts see k ≥ 5 aggregates only. AI: customer names, phones, addresses and notes never reach the
server provider (ai.md); untrusted text goes in delimited data blocks; model text is never rendered as HTML.

---

## G. Storage and media

### G.1 Storage driver interface (OS-07)

```ts
// src/lib/media/storage/types.ts
export interface StoredFile { storeId: string; key: string; assetId: string; mime: string; bytes: number; sha256: string; storage: "db" | "fs" }
export interface MediaStorage {
  readonly kind: "db" | "fs";
  /** durable before it resolves (fs: temp file + fsync + rename + fsync(dir)); never overwrites an existing key */
  put(file: Omit<StoredFile, "storage">, data: Buffer): Promise<void>;
  head(key: string): Promise<StoredFile | null>;
  readAll(meta: StoredFile): Promise<Buffer>;                                    // ≤ 8 MB (MAX_CACHED_FILE)
  readRange(meta: StoredFile, start: number, end: number): Promise<ReadableStream<Uint8Array>>;
  remove(meta: Pick<StoredFile, "storeId" | "key" | "storage">): Promise<void>;  // idempotent
  usage(): Promise<{ bytes: number; files: number; freeBytes: number | null }>;   // health
}
export function mediaBackend(): MediaStorage;   // "fs" when the boot check passed, else "db" (fallback, health red)
export function storageFor(meta: Pick<StoredFile, "storage">): MediaStorage;    // reads follow the row's own backend
```

- `src/lib/media/storage/fs.ts` (new) builds on today's `fileRangeStream` / `copyToDisk` / `fileSha` mechanics in
  `src/lib/media/store.ts`. `src/lib/media/storage/db.ts` wraps today's chunk store (`insertFiles`,
  `getMediaFile`, `streamMediaRange`, `src/lib/media/store.ts:193-554`) unchanged, `CHUNK_SIZE` frozen.
- The in-process LRU (64 MB) and the read pool stay in front of both backends (`src/lib/media/store.ts:30-36`); the
  LRU gains `evictStore(storeId)`.

### G.2 Filesystem backend, `DATA_DIR`, boot check (R-D11, D22)

- Layout: `DATA_DIR/media/v1/<storeId[0..1]>/<storeId>/<key[0..1]>/<key>` (dirs 0700, files 0600). One store = one
  directory, so a purge is a directory walk. Temp files: `DATA_DIR/media/tmp/<random>`.
- `MEDIA_DIR` overrides `DATA_DIR/media`; `MEDIA_CACHE_DIR` (default `DATA_DIR/cache/media`) replaces
  `tmpdir()/cod-studio-media` (`src/lib/media/store.ts:43`), which COD Studio may share on the same hosting user
  (MED-07). Hostinger value: `DATA_DIR=/home/u641677794/storegen-data` (outside `domains/*/public_html` and outside
  the build folder Hostinger wipes).
- **Boot check** (`src/lib/media/storage/check.ts`, run in `instrumentation.ts` before serving): the path is absolute;
  `realpath` is not inside `process.cwd()` nor under any `public_html` segment; it is not a symlink; it is owned by
  `process.getuid()`; a probe file can be written, fsynced, renamed and deleted; `fs.statfs` reports ≥ 1 GiB free.
  Failure → `[boot] ERROR media storage …` + `mediaBackend() = db` + a red health tile; it never stops the app.
- Inodes: ~9 files per image (master + variants + AVIF). Hostinger Business allows 600,000 inodes plan-wide
  (domains.md §1.2), shared with every site on the account: the health page shows the file count and the console
  warns at 300,000.

### G.3 DB fallback, migrator, sweeper

- `media.migrate` job (§H.2): while `mediaBackend()` is `fs` and `media_files` rows with `storage='db'` exist, move ≤ 50
  files or ≤ 10 s per tick: read the chunks → `put` to FS → `UPDATE media_files SET storage='fs' WHERE key=? AND
  storage='db'` → `DELETE FROM media_chunks WHERE key=?`. InnoDB does not return the space without `OPTIMIZE TABLE`,
  which needs a copy's worth of headroom (TENANCY-MAP §11.1): the console shows the reclaimable size; the owner runs
  it in hPanel during a quiet hour.
- `media.sweep` job (daily): files on disk with no `media_files` row and older than 1 hour are deleted; rows whose
  file is missing are reported (`error_events`, area `media`, code `missing_file`), never auto-deleted.

### G.4 Per-store ids, dedup and quotas (D21, MED-01 … MED-19)

Upload (`POST /api/app/<h>/media`, outside the proxy matcher, so it calls `effectiveHost()` and `storeGuard` first):
1. `storeGuard(req, h, "media.write", { feature: … })`, `uploads_enabled` kill switch, `s:<sid>:media:*` buckets,
   per-store media gate slot.
2. Sniff and process (unchanged pipeline, `src/lib/media/process.ts`), giving master + variants in memory.
3. `assetId = hmacBytes(masterWebp, "media-id:" + storeId).slice(0, 32)`. An existing row **in the same store** →
   answer the existing asset (`deduped: true`); another store's identical bytes produce a different id, so there is no
   cross-store oracle (MED-01).
4. `chargeUsage(scope, media_bytes, Σ variant bytes)`; `QuotaError` → 413 `{ error: "quota" }` (the message never
   shows the platform DB percentage, MED-13). The whole-DB guard (`DB_QUOTA_MB`, warn 70 % / block 85 %) stays as a
   platform floor for the DB backend only.
5. Files written through `mediaBackend().put` (durable) **before** the DB transaction that inserts `assets` (with
   `store_id`, `stored_bytes`) and `media_files` (with `store_id`, `storage`).
6. Any failure after step 4 → refund + remove written files.

`sourceAssetId` (cutouts) must be an asset of the same store (MED-02). Every `src/lib/media/assets.ts` function takes a
scope (MED-05); focus/alt writes go through `byId` (MED-15); `assetToJson` never serialises `created_by` (MED-06).
Delete: refused with 409 when `asset_refs` has rows for it **in this store**, listing only this store's page names
(MED-12); otherwise the rows are deleted in one transaction, the files after commit, usage refunded.

### G.5 `asset_refs` (OS-07)

`extractAssetIds(doc | product | theme | settings)` (pure, `src/lib/media/refs.ts`) runs on every save, publish,
restore and settings write; `syncAssetRefs(scope, ownerKind, ownerId, ids, { live })` replaces that owner's rows in one
statement pair. Uses: "Used in" (ADM-24), the delete 409, ownership validation at save/publish/export (`assertOwned`,
§E.3 rule 5), and the logo/brand usage that `admin-data/assets.ts:98,105` computes with LIKE scans today. The LIKE scans
(`admin-data/assets.ts:78-107`) are deleted.

### G.6 Media URLs per addressing mode and the public route

- P mode: `/media/<key>` (root-relative). S/C modes: `https://<PLATFORM_HOST>/media/<key>` (absolute platform origin)
  with a Cloudflare Cache Rule "cache everything" on `/media/*`, so image requests never count against the Worker
  quota (R-D11). `mediaUrl()` (§C.6) decides; the document CSP lists the platform origin in `img-src`/`media-src`.
- `src/app/media/[key]/route.ts` stays at the root on every host (MED-10): `resolveMediaKey(key)` (public resolver in
  `src/lib/tenancy/public.ts`, cached meta incl. `store_id` and `storage`) → store status servable? (`pending`, `active`, `restricted` → yes; others → neutral 404) → serves from the row's backend
  with today's headers (`immutable`, ranges, sandbox CSP, nosniff, CORP). Drafts stay reachable by key (keys are
  unguessable without the bytes; documented, TENANCY-MAP §7.1).

### G.7 Other `DATA_DIR` areas

`DATA_DIR/exports/<storeId>/` (§F.9) · `DATA_DIR/backups/<day>/` (§H.6) · `DATA_DIR/imports/<storeId>/` (R2 CSV
uploads, 30-day retention) · `DATA_DIR/cache/media/` (disk cache, 512 MB budget, today's trim logic). Every path is
built by `dataPath(area, storeId?, …)` (`src/lib/storage/paths.ts`), which refuses `..`, absolute segments and ids not
matching `^[0-9A-HJKMNP-TV-Z]{26}$`.

---

## H. Jobs and ops

### H.1 The outbox (R-D25, D24)

```ts
// src/lib/jobs/outbox.ts
export type OutboxKind = "webhook" | "capi" | "telegram" | "whatsapp" | "mail" | "carrier";
export interface OutboxItem<P = unknown> { kind: OutboxKind; topic: string; targetId?: string; dedupeKey: string; payload: P; pii?: boolean; notBefore?: Date }
export function enqueue(scope: StoreScope | "platform", items: readonly OutboxItem[]): Promise<{ inserted: number; duplicates: number }>;   // INSERT IGNORE on dedupe_key
export interface OutboxHandler<P> { kind: OutboxKind; maxPerTick: number; perStorePerTick: number; timeoutMs: number; send(item: ClaimedItem<P>): Promise<SendResult> }
export type SendResult = { ok: true; status?: number } | { ok: false; retry: boolean; status?: number; error: string };
export function registerOutboxHandler<P>(h: OutboxHandler<P>): void;          // called from src/lib/jobs/handlers/<kind>.ts
export function drainOutbox(opts: { budgetMs: number; storeId?: string; kinds?: OutboxKind[] }): Promise<DrainReport>;
export function replay(ctx: StoreCtx | PlatformCtx, id: string): Promise<void>;   // dead → pending, audited
```

- **Claim** (no `SKIP LOCKED` on 10.4, R-D19 pattern): `UPDATE outbox SET state='running', claim=?, lease_until=UTC_TIMESTAMP(3) + INTERVAL 2 MINUTE
  WHERE ((state='pending' AND next_at <= UTC_TIMESTAMP(3)) OR (state='running' AND lease_until < UTC_TIMESTAMP(3)))
  AND kind IN (…) [AND store_id = ?] ORDER BY next_at LIMIT ?`, then `SELECT … WHERE claim = ?`.
- **Backoff**: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h, then `dead` (visible in the store's integration health and the
  console, with "replay"). `retry: false` results go to `dead` at once (4xx except 408/429).
- **Drained by** `after()` right after the request that enqueued (order creation: `drainOutbox({ storeId, budgetMs:
  8000 })`, the pattern of `src/lib/orders/http.ts:51-63`) and by the cron step `outbox` (§H.2).
- Payloads with customer data (`pii: true`) are sealed with the store's envelope (§F.3). Done rows are kept 14 days
  (the webhook delivery log, IN-07), dead rows 30 days.
- Caps per kind: `mail` ≤ 4/min and ≤ 150/h platform-wide (Hostinger SMTP limits are unverified, R-D51); `capi` drops
  Meta events older than 7 days (R-D23); `webhook` uses the SSRF guard (SE-07, R2) and Standard Webhooks signatures
  (IN-07).

### H.2 Cron tick and the job runner (OS-08; SHT-11)

hPanel cron every 5 minutes: `curl -fsS --max-time 110 -H "X-Cron-Key: <CRON_KEY>" "<PLATFORM_URL>/api/cron/tick" > /dev/null`
(the `?key=` form is still accepted in R1, removed in R2, D33). The route keeps its guard
(`src/app/api/cron/tick/route.ts:42-55`) and becomes a thin call to `runTick()`.

```ts
// src/lib/jobs/runner.ts
export interface Job {
  name: string;                                     // ≤ 48 chars, e.g. "sheets.push"
  every: "tick" | "hourly" | { dailyAt: string /* "03:10" platform timezone */ };
  budgetMs: number;                                 // hard slice inside the tick
  perStore?: { states: readonly StoreStatus[]; maxStoresPerTick: number; where?: "pending_sheets" | "pending_outbox" | "pending_renders" };
  run(ctx: JobCtx): Promise<JobResult>;            // must check ctx.deadline between units of work
}
export interface JobCtx extends SystemCtx { deadline: number; tickId: string; cursor: string; setCursor(c: string): Promise<void> }
export function runTick(opts?: { budgetMs?: number /* default 100_000 */ }): Promise<TickReport>;
// src/lib/jobs/registry.ts imports the track files src/lib/jobs/tracks/<track>.ts (each exports `jobs: Job[]`)
```

Tick budget: 100 s total inside the 120 s route cap (`maxDuration = 120`). Default order and slices (a job that has
nothing to do returns at once and its unused time flows to the next):

| # | Job | Every | Budget | Per-store fairness |
|---|---|---|---|---|
| 1 | `sheets.push` (IN-01) | tick | 20 s | round-robin over stores with pending rows, ≤ 2 Sheets calls per store per tick, a per-tick request budget under 60 req/min for the platform service account (R-D24) |
| 2 | `sheets.pull` | tick | 15 s | `s:<sid>:sheets:pull` ≤ 1 per 290 s per store, round-robin cursor |
| 3 | `outbox` | tick | 15 s | `perStorePerTick` per handler, then the next store |
| 4 | `renders` (§H.3) | tick | 15 s | ≤ 10 pages per store per tick |
| 5 | `exports`, `backup`, `purge` (§F.9, §H.6, §H.9) | tick | 15 s shared | one job row at a time, resumable cursor |
| 6 | `media.migrate`, `usage.reconcile` (nightly), `rollups` (nightly: `agent_stats_daily`, `finance_daily` R2, `store_daily_rollup` R3) | tick / daily | 10 s | cursor over stores |
| 7 | `lifecycle` (closed → scheduled_deletion, rejected purge, impersonation expiry, invite expiry) | tick | 2 s | — |
| 8 | `housekeeping` (rate-limit buckets, visitor markers > 2 days, sessions, leads > 30 days, retention §H.11) | tick | 5 s | global |

Each job run writes one `job_runs` row (store-level jobs: one row per store visited when it did work, else one summary
row); `job_runs` older than 14 days are deleted. The round-robin cursor of each per-store job lives in `cron_cursors`
(next store id after the last one served), so one slow store never starves the others; a store whose step throws is
skipped for the rest of the tick and logged (`step()` isolation, `route.ts:31-39`). **Last-tick alarm**: no
`job_runs` row in 10 minutes → red health tile and a staff notification.

### H.3 Render queue (D25)

- `enqueueRenders(scope, pageIds | "all-live", reason, priority)` inserts `render_jobs` with `dedupe = pageId`
  (`INSERT IGNORE`: one pending job per page).
- Triggers: handle rename, S mode on, primary custom domain (reason `address`); store brand/theme change (`brand`,
  `theme`, R2); product price/options change for attached landings (`product`, R2, R-D42); a runtime fix that needs
  live pages rebuilt (`runtime`, owner action in the console).
- The `renders` job claims jobs (lease pattern of §H.1), renders through `renderAndCommit` with the store context of
  **now** (base, origin, identity, Turnstile, resolver) and the **published version's doc**, and rewrites only the
  rendered columns (`html`, `thank_you_html`, `csp`, `thank_you_csp`, `etag`) of that published version row under the
  same row lock / compare-and-set (D50). The doc, checksum and `runtime_v` never change (the payload contract an open
  tab relies on stays the same; a version with `runtime_v = 1`, which no Store Gen page has, is skipped and listed for
  a manual republish); no new version row is created (a re-render is not a publish, and 600-900 KB per version would
  eat the 3 GB quota). Then
  `invalidateStore(storeId)` for the render cache, and a Worker purge when edge caching exists (OS-12).
- Failures retry 3 times then `failed` (visible per store in the console Domains / Health views).

### H.4 Boot tasks (`src/instrumentation.ts`)

In order, never crashing the process (today's pattern): (1) config warnings (`authConfigWarnings` + new edge, data-dir
and env-alias warnings); (2) migrations; (3) media storage check (§G.2); (4) expired sessions purge; (5) under
`withBootLock`: published checksums (`doc_schema`), `convertLegacyStore()` (`tenancy_v1`, §D.8), seed
`protected_brands` and the legal templates (`INSERT IGNORE`, marker `legal_seed_v1`), the pixel library migration only
inside the conversion; (6) non-blocking read-only checks: `[upgrade-check]` and `[tenancy-check]` (§D.8). The boot lock
name keeps `cod_boot` (frozen; renaming it would let two processes run the tasks during the deploy that renames it).

### H.5 Observability and health (OS-09)

- `recordError(area, err, { storeId?, route? })` (`src/lib/jobs/errors.ts`) buffers in memory and flushes upserts to
  `error_events` at most every 30 s and at the end of each tick; it stores `errorSummary(err)` only (never raw
  messages: they quote bound values, `src/lib/admin-data/action.ts:45`). `logError` (`src/lib/orders/log.ts`) and the
  action wrappers call it.
- `getHealth(ctx: PlatformCtx)` (`src/lib/platform/health.ts`) returns: last tick + the last 50 `job_runs` per job,
  outbox depth by kind/state and the oldest pending per store, render queue depth, Sheets backlog per store, DB size
  total vs quota (`getDbUsage`), per table (`information_schema.tables`) and per store (`store_usage`), `DATA_DIR`
  bytes / free bytes / file count (from a nightly snapshot, not live), `error_events` of the last 24 h, build id
  (`.next/BUILD_ID`), Node version, `process.memoryUsage()`, uptime, boot warnings.
- `GET /api/health` (public, burst-limited): `{ ok: boolean, app: "store-gen", db: "ok" | "down", build: "<8 chars>" }`,
  `Cache-Control: no-store` (D45). The e2e harness asserts `app === "store-gen"` before running (QA-01).
- Alarms (staff notifications, in-app): last tick > 10 min, outbox `dead` > 0 for a kind, DB > 70 % / 85 %, disk free
  < 2 GiB, inode count > 300,000, error spike (> 50 of one code in an hour), a store's Sheets backlog > 15 min.

### H.6 Backups (OS-10, R-D52, D34)

- Job `backup` daily at 03:30 (platform timezone): NDJSON per table slice, gzip (`node:zlib`), sealed with AES-256-GCM
  (key `seal` scope `platform`, purpose `backup:v1`, one envelope per file part ≤ 8 MB), into
  `DATA_DIR/backups/<YYYY-MM-DD>/<table>.<n>.ndjson.gz.sg`, with a `manifest.json` (row counts, sha256 per part).
  Resumable across ticks (`backup_runs.cursor` = table + last primary key).
- Tables: `stores`, `store_members`, `store_settings` (still encrypted), `store_entitlements`, `store_usage`,
  `store_subscriptions`, `plans`, `users`, `pages`, `page_versions` (published versions only), `orders`, `leads`,
  `customers`, `order_events` (last 90 days), `delivery_zones`, `message_templates`, `sheet_bindings`, `assets`,
  `media_files` (rows; the files are already on disk), `audit_log` (last 90 days), `settings`, plus every R2 money
  table once it exists.
- Retention: 7 daily + 4 weekly (the Sunday daily is kept as the weekly). The super_admin downloads a day as a ZIP from
  the console (`backups.manage` ↑). Restore is a documented manual procedure in R1 (decrypt with APP_SECRET, import);
  the restore drill and an off-site copy are R3 (OS-18). The owner keeps `APP_SECRET` offline: without it backups and
  every encrypted setting are unreadable.

### H.7 Environment variables (platform level)

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` (+ Hostinger's 5 `DB_*` keys, unused by code) | yes | unchanged |
| `APP_SECRET` | yes | never changes after launch (HANDOFF §4) |
| `ADMIN_GATE` | yes | console only (AUTH-14) |
| `SETUP_TOKEN` | until bootstrap | first super_admin only (AUTH-15) |
| `PLATFORM_URL` | yes (R1) | platform origin; `PUBLIC_URL` is an alias for one release (set both to the same value); read at build time too → rebuild after a change |
| `PUBLIC_URL` | alias | removed in R2 |
| `STORE_ROOT_DOMAIN`, `EDGE_KEY` | for S mode | both set = S mode on (§C.1) |
| `EDGE_KEY_PREV` | during rotation | §C.5 |
| `LEGACY_PLATFORM_HOSTS` | after the domain move | the temporary domain (D19) |
| `ADMIN_HOST`, `ADMIN_IP_ALLOWLIST` | optional | console only |
| `TRUSTED_PROXY_HOPS`, `BEHIND_CLOUDFLARE` | yes | `BEHIND_CLOUDFLARE=1` after the move |
| `CRON_KEY` | yes | header form |
| `APP_TIMEZONE` | optional | **platform** default timezone for jobs and new stores (stores have their own, SET-08) |
| `DB_QUOTA_MB` | optional | platform DB guard (default 3,072) |
| `DATA_DIR` | yes (R1) | §G.2 |
| `MEDIA_DIR`, `MEDIA_CACHE_DIR` | optional | §G.2 |
| `GOOGLE_SA_JSON_B64` | for Sheets | shared service account; tenants see only its e-mail (ADM-35) |
| `GOOGLE_EXPORT_SA_JSON_B64` | **removed** | EXP-03 |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | optional | defaults of `platform_turnstile` |
| `ANTHROPIC_API_KEY` | optional | unset = cloud AI off (D40); the monthly cap lives in `platform_ai` |
| `NEXT_PUBLIC_OFFERS_FEATURES` | optional | build-time; entitlements layer on top |
| `SG_TEST_CONTEXT` | tests only | never set in production (§E.4) |

Hostinger's `hosting_nodejs_replace-environment-variables` is a **full replace**: the R1.0 deploy sends the 14 current
keys + `PLATFORM_URL` + `DATA_DIR` (16); the domain move adds `STORE_ROOT_DOMAIN`, `EDGE_KEY`,
`LEGACY_PLATFORM_HOSTS` and flips `BEHIND_CLOUDFLARE` (19). Values come from the local git-ignored `.env.hostinger`,
never printed.

### H.8 Kill switches and platform read-only (PL-12)

`flags` rows of kind `kill` (seeded in 0004), read through `scopedCache("flags")` (30 s). Effects: `signups_enabled`
(signup and invite-accept forms show "closed for now"), `publishing_enabled` (publish → `feature_off`),
`ai_generation_enabled` (cloud and server tasks off; local and library keep working), `sheets_sync_enabled` (Sheets
jobs skip; orders keep `pending`), `capi_enabled` (outbox `capi` handler pauses, items wait), `uploads_enabled`,
`platform_read_only` (every `storeAction` / `platformAction` write refused with `read_only`, except
`kill.manage` itself; **public order, lead and event APIs keep working** and orders keep reaching Sheets). Each change
needs `kill.manage` ↑, is audited, and shows a banner in every dashboard it affects.

### H.9 Purge job

`purge` (§H.2 slot 5) takes one store in `scheduled_deletion` whose `purge_after` has passed (or a confirmed immediate
purge), deletes in the order of §F.9 in slices, records progress in `cron_cursors` (`purge:<storeId>`), and finally
writes the tombstone and the handle quarantine. A purge never runs as a cascade or in one request.

### H.10 Upgrade dry-run gate and deploy impact

- Before every R1 deploy: `npm run qa:upgrade-dry-run -- --db <url>` on the XAMPP DB **and** on a fresh dump of
  production imported into XAMPP (OFFERS §I.3 discipline); the tenancy section must report 0 problems.
- **R1.0 deploy** (first tenancy build): env full replace (16 keys, §H.7); create nothing by hand (the boot check
  creates `DATA_DIR` subfolders when the parent is writable); cron line changed to the header form; build; boot runs
  0004 (+ conversion if the owner already used the old setup). Smoke (HANDOFF §4 step 7, updated): `/` 200 marketing ·
  `/admin` 404 · `/<ADMIN_GATE>` 303 · `/login` 200 · `/s/<store-1>/` 200 or the store's neutral page ·
  `POST /api/public/order {}` → `{"ok":false,"error":"invalid"…}` · cron header → `{"ok":true…}` · `/api/health` →
  `app: "store-gen"` · every 404 carries the §F.6 headers.
- **R1 product deploys**: 0005; same smoke plus the console, signup in invite mode, one order through the call-center
  queue.
- **Domain move**: §C.10; V1 … V11.
- A failed Hostinger build keeps the previous version live (HANDOFF §4); migrations are forward-only and additive, so
  the previous build keeps working on the migrated schema **except** where 0004 changed constraints the old build
  writes against (global `pages_slug_uq`, `block_uq`, NOT NULL `store_id`): an R1.0 rollback therefore means
  "fix forward", stated in the deploy checklist.

### H.11 Retention (OS-11)

Leads 30 days (exists, per store) · `ai_runs.output` nulled after 90 days · `shipment_events.raw` 30 days (R2) ·
`outbox` done 14 days / dead 30 days · `job_runs` 14 days · `error_events` 30 days · `notifications` 90 days ·
`order_events` kept (rolled into daily tables after 400 days, R3) · `audit_log` 400 days · `impersonation_sessions`
400 days · `password_resets` / `store_invites` 30 days after expiry · export parts 72 hours · backups §H.6.

---

## I. Admin shell contract

### I.1 Tenant dashboard route tree (`src/app/app/**`)

Layouts: `src/app/app/layout.tsx` (session only: `requireUser`), `src/app/app/[store]/layout.tsx` (calls
`requireStoreMember({ handle })`, renders the shell; layouts never replace the per-page and per-action checks,
AUTH-31), `src/app/app/[store]/(editor)/layout.tsx` (full-screen builder).

| Path | Today | Permission | Release |
|---|---|---|---|
| `/app` | — | session | R1 (picker or redirect, §B.4) |
| `/app/new` | — | session | R1 (onboarding, UX-01) |
| `/app/account`, `/security`, `/two-factor`, `/sessions` | `admin/(auth)/two-factor`, `settings/security` (user part) | session | R1 |
| `/app/<h>` | `/admin` (dashboard) | `store.read` | R1 |
| `/app/<h>/orders` (+ drawer `?o=`) | `/admin/orders` | `orders.read` | R1 |
| `/app/<h>/queue` | — | `agents.self` | R1 (agent console, OP-03) |
| `/app/<h>/leads` | leads panel in orders | `leads.read` | R1 (LP-06) |
| `/app/<h>/customers` | — | `customers.read` | R1 (OP-06) |
| `/app/<h>/pages`, `/pages/new` | `/admin/pages`, `/pages/new` | `pages.read` / `pages.write` | R1 |
| `/app/<h>/pages/<id>/edit` | `/admin/(editor)/pages/[id]/edit` | `pages.read` | R1 |
| `/app/<h>/preview/<id>` (route handler) | `/admin/preview/[id]` | `pages.read` | R1 |
| `/app/<h>/generate` | `/admin/generate` | `pages.write` + `ai.use` | R1 |
| `/app/<h>/media`, `/history`, `/exports` | same under `/admin` | `media.read` / `pages.read` / `export.create` | R1 |
| `/app/<h>/team` (members, invites, agents) | `/admin/settings/team` | `members.read` | R1 |
| `/app/<h>/integrations/{sheets,pixels,telegram,whatsapp}` | `settings/sheets`, `settings/pixels` | `integrations.manage` / `pixels.manage` | R1 |
| `/app/<h>/brand` | `settings/store` (logo) | `brand.write` | R1 basic, R2 logo designer |
| `/app/<h>/settings/{general,market,checkout,delivery,policies,anti-spam,ai,security,address,plan,audit,danger}` | `settings/{store,market,anti-spam,ai,audit}` | `settings.read` (+ write keys) | R1 |
| `/app/<h>/notifications` | — | `store.read` | R1 |
| `/app/<h>/catalog/{products,collections}`, `/storefront`, `/finance`, `/shipping`, `/integrations/{webhooks,carriers}` | — | §A.3.1 | R2 |
| `/app/<h>/reviews`, `/experiments`, `/settings/domains` (custom) | — | §A.3.1 | R3 |
| API `/api/app/<h>/media`, `/media/<id>`, `/export/**`, `/sheets/**`, `/orders/export`, `/exports/<jobId>/<part>`, `/pulse` | `/api/admin/{media,export,sheets}`, `(panel)/orders/export` | `storeGuard` per route | R1 |

`src/app/admin/(panel)/**`, `src/app/admin/(editor)/**`, `src/app/admin/preview/**` and the tenant parts of
`src/app/api/admin/**` are **moved** (not copied) in R1.0; `src/app/admin/(auth)/login/**` becomes `src/app/(public)/login/**`.
`revalidatePath` calls use `appHref(handle, …)` (31 sites, TENANCY-MAP §0).

### I.2 Console route tree (`src/app/admin/**`, gated)

`/admin` overview (PL-05) · `/admin/queue` (PL-04) · `/admin/stores` (PL-06) · `/admin/stores/<id>/[[...tab]]` (PL-07)
· `/admin/users`, `/admin/users/<id>` · `/admin/orders` (masked lookup by id/phone) · `/admin/plans` (PL-11) ·
`/admin/flags` (PL-12) · `/admin/health` (OS-09) · `/admin/domains` (OS-06) · `/admin/ai` (AI-01, AI-07) ·
`/admin/settings/{general,signup,legal,brands,backups}` (PL-14) · `/admin/security/{staff,audit,break-glass}` (SE-01,
SE-04) · `/admin/setup` (§B.11). R3: `/admin/inbox`, `/admin/broadcasts`, `/admin/analytics`, `/admin/abuse`.
`src/app/admin/layout.tsx` only re-checks the gate (today's `assertAdminAccess`), so `/admin/setup`
(`src/app/admin/(auth)/setup/**`) works before any staff account exists; every console page lives under
`src/app/admin/(console)/**`, whose layout calls `requirePlatform()`; every page and action re-checks its permission. The console
previews tenant pages only in sandboxed iframes pointing at `/app/<h>/preview/<id>` under an impersonation session or
at a `/preview/<token>` URL, never inline HTML (SE-05).

### I.3 Navigation per store mode (ADM-28)

```ts
// src/components/admin/shell/nav/types.ts (core)
export interface NavItem { id: string; label: MessageKey; href: (handle: string) => string; icon: IconName; permission?: StorePermission; mode?: ModeFeature; release?: "R1" | "R2" | "R3"; badge?: NavBadge }
export interface NavGroup { id: "workspace" | "sell" | "landing" | "catalog" | "library" | "team" | "connect" | "money" | "settings"; label: MessageKey; items: NavItem[] }
export function navFor(ctx: Pick<StoreCtx, "store" | "membership" | "can">): NavGroup[];   // filters by permission, mode, release
// items are contributed by src/components/admin/shell/nav/<track>.ts files (extension points, §K.3)
```

| Group | Items | Modes |
|---|---|---|
| Workspace | Overview, Notifications | all |
| Sell | Orders, Queue, Leads, Customers | all |
| Landing pages | Pages, Generate | landing, both (store: only with "also use landing pages") |
| Catalog (R2) | Products, Collections, Storefront | store, both |
| Library | Media, History, Exports | all (Exports: landing, both) |
| Team | Members & invites, Agents | all |
| Connect | Sheets, Pixels, Telegram, WhatsApp (R1); Webhooks, Carriers (R2) | all |
| Money (R2) | Finance, Shipping | all |
| Settings | General, Market, Checkout & delivery, Policies, Brand, Anti-spam, AI, Security, Address, Plan & usage, Audit, Danger zone | all |

The quick action "Create" opens: landing page (landing/both), product (store/both, R2), manual order, invite.
Checklists and ⌘K use the same filters (ADM-07, ADM-31).

### I.4 Shell components (UX-02, UX-03)

- **Store switcher** replaces the brand block (`src/components/admin/shell/app-sidebar.tsx:118-129`, ADM-29):
  logo, name, mode badge, status pill, memberships, "Create a store", "Platform console" for staff (§B.4).
- **Topbar** breadcrumb root = the store name (ADM-30); notification bell (polling `/api/app/<h>/pulse` every 15 s
  while visible, D46); help.
- **⌘K** (store-scoped, ADM-02): jump to an order by id/phone (scoped search), page, customer, setting; create;
  run (sync Sheets, export orders, publish); switch store. The console palette: jump to store, user, order, approve
  next, start view-as.
- **Banners**: pending ("In review" + what is locked), restricted (reason), suspended/closed (read-only), quota
  (≥ 80 %), kill switch (platform notice), require-2FA.
- **Ribbons**: console = permanent "Platform" badge + teal accent; impersonation = full-width violet ribbon with
  countdown and End (§B.8).
- **Limit sheet**: every `QuotaError` / `EntitlementError` / `feature_off` opens one premium sheet (what is limited, the
  current use, "ask for more"), never a raw error.

### I.5 Internationalisation (ADM-40, D36)

- Catalogs `src/lib/i18n/admin/{en,fr,ar}.ts` exporting `messages: Record<MessageKey, string>` (ICU-lite `{var}`
  placeholders, plural via `Intl.PluralRules`); `MessageKey` is the key union of `en.ts`; `fr`/`ar` are
  `Partial<…>` falling back to `en`. `t(key, vars)` on the server, `useT()` on the client. Each track owns the keys
  under its own prefix in `src/lib/i18n/admin/<locale>/<track>.ts` (extension files, §K.3).
- Locale: `users.locale` (default: the browser's `Accept-Language` among ar/fr/en at signup); `dir="rtl"` for `ar`.
- R1 complete in ar/fr/en: `/login`, `/signup`, `/invite`, `/reset`, onboarding, the agent console (`/queue`, the
  order drawer actions, call script, WhatsApp templates), and every shopper-facing addition (thank-you blocks, track
  page). The rest of the dashboard: `en` in R1, `fr` in R2, `ar` RTL in R3 (UX-08).
- Formatting: amounts via `src/lib/markets/money.ts` in the store currency; dates and "today" in the **store
  timezone** (`stores.timezone`; ADM-23, STAT-01); numbers tabular; phones and order ids in `dir="ltr"` isolates.

### I.6 Design-system foundation for the admin upgrade (UX-04 builds on it; design.md owns the depth)

- **Tokens** stay the semantic OKLCH set of `src/app/globals.css` (`--background … --brand` jade hue 166, `--success`
  green 150, `--warn` yellow ≥ 90, `--destructive` crimson 17, charts). A 3-input generator (base neutral hue, accent
  hue/chroma, contrast standard|high; the Linear method, design-gen.md §9) produces the light and dark blocks at
  build time in `scripts/build-admin-css.mjs` (no Turbopack loaders, HANDOFF §4).
- **Surfaces**: `[data-surface="tenant"]` (jade accent), `[data-surface="console"]` (teal-cyan accent around OKLCH
  hue 205, deep-ink sidebar), `[data-impersonating]` (violet ribbon, hue ~295). All outside the banned band.
- **No orange**: `scripts/qa/admin-tokens-check.ts` (in `npm test`) parses every OKLCH token and fails on hue 25-75°
  with chroma > 0.06; `qa/admin-visual/shoot.mjs --scan-only` stays the screenshot check; generated-page colour mixes
  are registered with `src/lib/theme/blend.ts` (owner rule 1).
- **Density**: `[data-density="comfortable" | "compact"]` → `--row-h: 40px | 32px`, `--ctl-h: 36px | 30px`, base
  14px | 13px; per viewer (localStorage, a convenience).
- **Motion**: `--dur-1: 120ms`, `--dur-2: 180ms`, `--dur-3: 240ms`, `--ease-out: cubic-bezier(.2,.8,.2,1)`; no bounce;
  `prefers-reduced-motion` keeps opacity only.
- **Shape**: a 4-tier radius ladder `--r-chip 6px`, `--r-control 8px`, `--r-card 12px`, `--r-sheet 16px` (tiers
  differ, R-D38).
- **Type**: Instrument Sans (shipped, `src/app/fonts/`) with tabular numerals; JetBrains Mono for ids; an Arabic UI
  face for `ar` pages chosen by design.md from the OFL fonts already in devDependencies.
- **Data**: KPI tiles show real data only (value, delta, sparkline only with ≥ 7 points); the COD funnel orders →
  confirmed → shipped → delivered → cash; neutral series + jade "ours", crimson loss, yellow warn.
- Banned in the admin as on pages (`docs/DESIGN.md` §1.1 + DESIGN v3, DG-01): glass beyond 2 surfaces, bounce,
  vintage/craft motifs, generic gradients, fake numbers.

---

## J. Tests

### J.1 `npm test` (offline, no DB, no server; must stay green on every merge)

Existing chain (`package.json:22`: theme, runtime, generator, render, money, conversions, offers, orders) plus:

| Script | File | Checks |
|---|---|---|
| `test:tenancy-lint` | `scripts/qa/tenancy-lint.ts` | rules L1-L10 (§F.1); joins `npm test` at the R1.0 merge with **0 violations** |
| `test:hosts` | `src/lib/edge/selftest.ts` (absorbs `src/lib/auth/host-selftest.ts`) | the §C.2 / §C.3 decision tables as pure functions: forged `x-sg-*` without/with a wrong key, `EDGE_KEY_PREV`, own-handle `/s/` 308, other `/s/` 404, `/d/` direct 404, reserved and deep labels, `Next-Action` on store hosts, legacy host 308s with byte-identical queries, area classification with encoded paths (V1, offline part) |
| `test:permissions` | `src/lib/auth/selftest-permissions.ts` | matrix invariants: owner has every R1 key; no role but owner has `store.mode`/`store.close`/`billing.manage`; `invitableRoles` never returns a role ≥ the inviter's (except owner); every write key is refused to the impersonation membership; every key has a release; platform step-up set ⊇ the ↑ column |
| `test:tenancy-unit` | `src/lib/tenancy/selftest.ts` | entitlement resolution order and every state cap; handle rules, reserved/protected/history availability; `ScopedCache` bounds and `invalidateStore`; `Bucket` construction; `storeUrl` / `storeBase` / `mediaUrl` per mode; `landingPathFor` |
| `test:envelope` | `src/lib/security/selftest-envelope.ts` | golden v1 + v2 vectors; AAD binding; a store-A ciphertext fails under store B; HKDF salt frozen |
| `test:security` | `src/lib/security/selftest.ts` (promoted; offline parts) | CSRF strict same-origin with platform/admin hosts only; `documentOrigins` never reflects Host; IP trust with `x-sg-ip` only when the edge verifies |
| `test:jobs` | `src/lib/jobs/selftest.ts` | outbox backoff ladder and dead rules; tick budget allocation; round-robin cursor fairness with a fake clock (one slow store does not starve others) |
| `test:admin-tokens` | `scripts/qa/admin-tokens-check.ts` | no admin token in the orange band (§I.6) |

`render-check` (`scripts/qa/render-check.ts`) gains store-path fixtures (P and S bases, links, canonical, media URLs,
CSP origins) and keeps every runtime budget (`budgets.json`; landing 24,200 B gz, LND-16).

### J.2 DB-backed (`npm run test:db`; local XAMPP MariaDB, throwaway databases only)

Guard (from `scripts/qa/pixels-publish-check.ts:22-41`): the database name must match `cod_test_*` or `cod_px*`;
never `cod_studio`, never `cod_storegen`. Each script creates its DB, runs `runMigrations`, seeds, and drops it.

| Script | File | Checks |
|---|---|---|
| `test:tenancy` | `scripts/qa/tenancy-check.ts` | the two-store attack suite (§F.1) through `runAsIdentity` (§E.4) for every role of B and for an impersonating staff member |
| `test:migrate` | `scripts/qa/migrate-check.ts` | (a) empty DB → 0000…000N → column set equals `schema.ts`; (b) a legacy fixture at 0003 (owner + editor + agent users, pages incl. `is_home`, versions, orders, leads, blocklist, exports, encrypted `tracking_secrets`/`turnstile`, `ai`, `home`, `pixels`) → 0004+ and `convertLegacyStore()` → every `store_id` = store #1, memberships, `super_admin`, home moved, settings readable under v2, marker; (c) run everything twice → no change; (d) interrupt 0004 after statement N for several N, rerun → same end state |
| `test:storage` | `scripts/qa/storage-check.ts` | FS backend on a temp `DATA_DIR`: durable put, crash between files and DB row → sweeper, db → fs migrator, quota race (20 parallel uploads at the limit → exactly the allowed ones succeed), per-store ids for identical bytes, boot-check refusals (inside cwd, symlink, not writable) |
| `test:pixels-publish` | existing, updated | per-store library rule and secrets; same pixel id in two stores uses each store's token |
| `test:public-api` | `scripts/qa/public-api-security.ts` (updated) | store buckets, blocklist and per-phone limits per store, suspended pageKey refused, `storeHosts` origin binding (V6 offline) |
| `test:php` | existing | PHP parity unchanged (PHP export contract frozen) |

### J.3 HTTP / e2e (`npm run test:e2e`; a production build started on port 3451+ against a `cod_test_*` DB)

The harness first asserts `GET /api/health` → `app: "store-gen"` (never COD Studio's 3400, QA-01).

| Script | File | Checks |
|---|---|---|
| `qa:headers` | `scripts/qa/headers-check.ts` | §F.6 header sets per response class and host class; byte-identical 404 headers across producers |
| `qa:edge-sim` | `scripts/qa/edge-sim.ts` | sends Worker-shaped requests (`x-sg-host`, `x-sg-edge`, `x-sg-ip`) to the local server: S-mode rewrites, Cookie never reaching store routes, `Set-Cookie` never sent on store hosts, own-handle 308, `/admin`/`/app`/`Next-Action` 404 on store hosts, CSP with the store host only, order posts from the right and the wrong store host (V1, V4, V5, V6 locally) |
| `qa:action-replay` | `scripts/qa/action-replay.ts` | §F.1 server-action replay with Playwright (`channel: "msedge"`, HANDOFF §3) |
| `qa/e2e` tenancy step | `qa/e2e/steps/tenancy.mjs` (git-ignored harness) | optional crawl as each role of B grepping for A's canaries (TENANCY-MAP §10.2 item 3) |

### J.4 Live (after a deploy)

HANDOFF §4 smoke as updated in §H.10; after the domain move, V1 … V11 (RESEARCH §5.3) recorded in HANDOFF.

### J.5 The tenancy gate

`npm run gate:tenancy` = `test:tenancy-lint` + `test:tenancy-unit` + `test:tenancy` + `test:migrate` + `qa:edge-sim` +
`qa:action-replay`. `npm run gate` = `typecheck` + `lint` + `test` + `test:db` + `build` + `test:e2e` +
`scripts/qa/secrets-check.ts`.

- From the R1.0 merge on, **no track merges into `main` with the tenancy gate red**, and no deploy happens with
  `npm run gate` red (plus the upgrade dry run on a production dump, §H.10).
- A new tenant table, a new server action file or a new cache is covered automatically (L1, L9, L4 read `schema.ts`
  and the file tree); a new public route must add its cases to `tenancy-check.ts` and `headers-check.ts` in the same
  merge.

---

## K. Releases and file ownership

Roles: the **core maintainer** (the lead session) owns this document, the shared files (§K.3) and the merge order;
**track agents** own the files listed for their track and nothing else; reviewers check each merge against the
contract. Build method: OFFERS §I.6 (contract first, parallel tracks with strict ownership, integration, adversarial
verification, fix loop). Network outages kill agents here (HANDOFF §7): every track works from the working tree and
can resume.

### K.1 R1.0 "core tenancy"

**Step C0: contract (one agent, ~2 days, merges first).** Output, all frozen at merge (changes afterwards only through
the maintainer, §K.3):

| File | Content at C0 exit |
|---|---|
| `src/lib/tenancy/types.ts` | §E.1 types |
| `src/lib/auth/permissions.ts` | §A.3 (full matrix incl. R2/R3 keys flagged), `can`, `canPlatform`, `invitableRoles`, `canManageMember`, `STEP_UP_PERMISSIONS` — implemented |
| `src/lib/tenancy/mode.ts`, `src/lib/tenancy/entitlement-keys.ts` | §A.2, §A.4 registry — implemented |
| `src/lib/tenancy/sql.ts`, `src/lib/tenancy/cache.ts`, `src/lib/db/locks.ts`, `Bucket` + `platformBucket`/`storeBucket` in `src/lib/security/rate-limit.ts` | §E.3, §E.6, §E.7, §E.8 — implemented (small, pure or near-pure) |
| `src/lib/edge/host.ts`, `src/lib/edge/areas.ts`, `src/lib/urls/index.ts` | §C.2, §C.3 step 1, §C.6 — implemented (pure) |
| `src/lib/tenancy/seam.ts`, `src/lib/platform/seam.ts`, `src/lib/tenancy/public.ts`, `src/lib/jobs/scope.ts` | §E.2 signatures with stub bodies that throw `NotImplemented` |
| `src/lib/db/schema.ts` | every §D.2 0004 change and every §D.4 table |
| `drizzle/0004_tenancy.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` | §D.8 (SQL complete; the JS conversion is T1's) |
| `src/lib/settings/platform-registry.ts`, `src/lib/settings/store-registry.ts`, `src/lib/settings/keys/*.ts` | §D.10 every R1 key with its first schema |
| extension skeletons | `src/components/admin/shell/nav/{types,index}.ts`, `src/lib/jobs/{registry,runner}.ts` (types), `src/lib/jobs/tracks/*.ts` (empty arrays), `src/lib/i18n/admin/{index,en,fr,ar}.ts`, `src/lib/orders/hooks.ts` (order-transition hook registry) |
| cross-track signatures | the scoped signatures every track calls in another track's files: settings, audit, entitlements/usage/lifecycle (T1); seam, `requireUser`, `userAction`, `publicAction`, `notify` (T2); `resolvePublicTarget`, `publicScope`, `getPageStats`/`recordEvent`/`bumpOrderStats`, `publishPage`/`unpublishPage`/`renderAndCommit` (T3); `scoreSignup` in `src/lib/platform/signup-risk.ts` (returns `{ score: 0, flags: [] }` until P1 implements it) — written as typed stubs |
| `scripts/qa/tenancy-lint.ts` | rules L1-L10 implemented; runs standalone (`npm run test:tenancy-lint`), **not yet** in `npm test` |
| `package.json` | the new scripts (§J), `typescript` in devDependencies |
| `docs/DESIGN.md` | **DG-01 (DESIGN v3)**, written by the design lead during C0 (docs only), so no build agent reads the old bible (GEN-14) |

C0 exit: `tsc` green with the stubs; today's `npm test` green; `drizzle/0004` applies on an empty `cod_test_*` DB.

**Then four parallel tracks** (disjoint files; each may read everything):

| Track | Owns (create/modify/delete) | Delivers | Depends on |
|---|---|---|---|
| **T1 DATA** | `src/lib/db/**` (except `schema.ts`, `locks.ts`), `src/lib/tenancy/{convert.server.ts, entitlements.ts, usage.ts, lifecycle.ts, handles.ts, cache.ts, sql.ts}`, `src/lib/jobs/scope.ts` (`systemScope`, `forEachStore`), `src/lib/settings/index.ts`, `src/lib/security/crypto.ts`, `src/lib/security/selftest-envelope.ts`, `src/lib/audit.ts`, `src/instrumentation.ts`, `src/lib/tenancy/selftest.ts`, `scripts/qa/{upgrade-dry-run.ts, migrate-check.ts}`, `src/lib/platform/data/protected-brands.ts` | envelope v2 (§F.3), settings split + caches (§D.10), entitlements/usage/lifecycle (§A.4-A.5), handles (§C.7), audit v2 (§F.5), conversion task + boot order (§D.8, §H.4), tenancy dry run, `test:migrate`, `test:envelope`, `test:tenancy-unit` | C0 |
| **T2 AUTH** | `src/lib/auth/**` except `permissions.ts`, `unknown-page.ts`, `host-selftest.ts`; `src/lib/tenancy/{seam.ts, context.ts, invites.ts, owned.ts}`; `src/lib/platform/{seam.ts, impersonation.ts, notify.ts}` (`notify` = a minimal insert in R1.0); `src/lib/mail/**`; `src/app/(public)/**`; `src/app/app/{layout.tsx, page.tsx}`, `src/app/app/account/**`, `src/app/app/new/**` (functional skeleton), `src/app/app/[store]/team/**`; `src/app/admin/{layout.tsx, page.tsx}`, `src/app/admin/(auth)/**`; `src/components/admin/settings/{team-panel.tsx, security-panel.tsx}`; `src/lib/auth/selftest-permissions.ts` | §B (login, signup modes incl. invite/approval, invites, sessions, switcher data, 2FA policy, step-up, reset links, impersonation seam, Mailer interface, bootstrap), §E.2 seam implementation, §E.4 context | C0; T1's settings and audit APIs (signatures frozen, stubs until merged) |
| **T3 EDGE** | `src/proxy.ts`, `src/lib/edge/**`, `src/lib/urls/**`, `src/lib/auth/{unknown-page.ts, host-selftest.ts}`, `src/lib/security/{csrf.ts, headers.ts, ip.ts}`, `src/lib/render/**`, `src/lib/stats/**`, `src/lib/orders/{origin.ts, resolve.ts, create.ts, leads.ts, upsell.ts, turnstile.ts, http.ts, export-origins.ts}`, `src/lib/tenancy/public.ts`, `src/landing/{context.ts, document.tsx}`, `src/landing/legal/**`, `src/landing/runtime/{tracking.ts, pixels.ts, order-store.ts, entry-whatsapp.ts}` (storage-key prefix only, §C.9), `src/app/api/public/**`, `src/app/s/**`, `src/app/[slug]/**`, `src/app/legal/**` (deleted), `src/app/route.ts` → `src/app/(marketing)/**`, `src/app/{robots.txt, sitemap.xml, preview, api/health}/**`, `src/app/media/[key]/route.ts` (status check only), `src/app/{layout.tsx, not-found.tsx}`, `edge/worker.js`, `scripts/qa/{render-check.ts, headers-check.ts, edge-sim.ts, public-api-security.ts}`, `src/lib/edge/selftest.ts` | §C (host classes, proxy, store routes in P mode with S/C redirects, URL builders, canonical, robots/sitemap, cookies/CSRF/CSP/order origin, Worker), §F.6 headers, public writes carrying the store (ORD-01…ORD-07, ORD-17, ORD-18, ORD-21), stats per store with the store timezone (STAT-01…04), render context per store (PUB-*) | C0; T2's `resolvePublicTarget` signature (frozen) |
| **T4 SCOPE** | `src/lib/admin-data/**` (except `action.ts`), `src/lib/orders/{admin.ts, conversions.ts, conversions-core.ts, index.ts, selftest.ts}`, `src/lib/editor/**`, `src/lib/export/**`, `src/lib/media/**` (except `store.ts`), `src/lib/pixels/**`, `src/lib/sheets/**`, `src/app/app/[store]/**` (except `team/**`), `src/app/api/app/**`, `src/app/api/cron/tick/route.ts` (per-store loop, minimal), `src/app/admin/(panel)/**`, `src/app/admin/(editor)/**`, `src/app/admin/preview/**`, `src/app/api/admin/{media,export,sheets}/**` (moved away), `src/components/**` (except `admin/settings/{team-panel,security-panel}.tsx`), `scripts/qa/{tenancy-check.ts, action-replay.ts, pixels-publish-check.ts, conversions-check.ts}`, `src/lib/media/selftest*.ts` | §E.3 over the ~225 query sites; the dashboard move to `/app/<handle>` (§I.1) with `appHref`/`apiHref` everywhere; per-store Sheets (SHT-*), pixels and CAPI secrets (PIX-*), exports (EXP-*), media ids and quotas on the DB backend (MED-*), generate (GEN-01…04), builder (LND-17…30), store-keyed client storage; `test:tenancy`, `qa:action-replay` | C0; T2's seam (stubs until merged); T1's settings API |

Rules inside R1.0: a track that needs a change in another track's file writes a note in
`docs/saas/ccr/r1.0-<track>-<n>.md` and the owner applies it. `src/lib/db/schema.ts` and `drizzle/**` stay with the
maintainer (fixes found by T1 go through the maintainer the same day). Files no track lists (for example
`src/lib/orders/{contract,validate,versions,text,risk}.ts`, `src/lib/page/**`, the rest of `src/landing/runtime/**`) are
**read-only** in R1.0. `adminAction` (`src/lib/admin-data/action.ts`) and `adminGuard` (`src/lib/orders/http.ts`)
stay until T4 has moved their last callers; the maintainer deletes them at integration, so `main` typechecks after
every merge.

**Merge order**: C0 → T1 → T2 → T3 → T4 → integration by the maintainer: delete `adminAction`/`adminGuard` and the
last stubs, add `test:tenancy-lint` to `npm test`, run `npm run gate`, fix loop.

**R1.0 exit criteria**: (1) `npm run gate` green, tenancy lint at 0 violations; (2) the two-store attack suite green
for every role, impersonation included; (3) `test:migrate` green on empty and legacy DBs, twice and interrupted;
(4) the landing chunk within its budget (24,200 B gz) and every frozen contract unchanged (PageDoc v2, runtime config
v2, payload v2, PHP export: `test:money`, `test:offers`, `test:php` green); (5) on XAMPP: owner creates store #1,
publishes a landing page at `/s/<h>/<slug>`, takes an order, sees it in `/app/<h>/orders` and Sheets; a second user
signs up with an invite code, gets a pending store, cannot publish, cannot see store #1; (6) upgrade dry run on a
production dump: 0 problems; deployed to the Store Gen site and smoke-tested (§H.10).

### K.2 R1 product phase (up to 8 parallel tracks)

**Step P0 (maintainer, ~1 day):** read the six part specs' "Requests to the core", write `drizzle/0005_r1.sql` and the
§D.5 tables into `schema.ts`, the R1 settings key schemas, register the extension files below, and freeze the
cross-track APIs as typed stubs: `transitionOrder` / `applyExternalStatus` (P4, used by Sheets pull and carriers),
`enqueue` / `registerOutboxHandler` / `enqueueRenders` (P8), `notify` (P1), `zoneLineFor(scope, cityKey)` (P3),
`runAi(scope, task, input, opts)` (P7), `genomeDistance` / `checkNovelty` (P6), `renameHandle` (P2). Then:

| Track | Part spec | Feature ids | Owns |
|---|---|---|---|
| **P1 CONSOLE** | platform.md | PL-01…PL-14, UX-02 (console), UX-03, OS-06, SE-01 (UI), SE-04 (break-glass UI) | `src/app/admin/**` (except `(auth)/setup/**`, `ai/**`), `src/app/api/admin/**`, `src/lib/platform/**` (except `seam.ts`, `impersonation.ts`, `health.ts`; includes `notify.ts`, `signup-risk.ts`), `src/components/console/**`, nav `console.ts`, i18n `console.ts`, jobs `platform.ts` |
| **P2 SHELL** | platform.md + design.md (UX parts) | UX-01, UX-02 (tenant), §I.3-I.6 foundation, notification centre UI (PL-13 tenant side), handle rename + address card | `src/components/admin/{shell,common,dashboard}/**` (except other tracks' nav files), `src/app/app/new/**`, `src/app/app/[store]/{layout.tsx, page.tsx, notifications/**, settings/{general,market,plan,address,security,danger}/**}`, `src/app/globals.css`, `scripts/build-admin-css.mjs`, `src/lib/admin-theme/**`, `src/lib/i18n/**` (base + `shell.ts`), `scripts/qa/admin-tokens-check.ts`, `src/lib/tenancy/handles.ts` (rename), `src/lib/admin-data/{dashboard.ts, search.ts}` |
| **P3 LANDING** | landing.md | LP-01…LP-06 | `src/lib/editor/checklist.ts`, `src/lib/delivery/**` (zones, ETA/fee line model), `src/lib/tracking/**` (signed links, lookup), `src/lib/orders/leads.ts`, `src/landing/thankyou/**`, `src/landing/sections/orderForm/**`, a new runtime feature chunk `src/landing/runtime/entry-delivery.ts` with its own `budgets.json` entry (via the maintainer), `src/app/s/[store]/track/**`, `src/app/api/public/track/**`, `src/app/app/[store]/{leads/**, settings/{checkout,delivery,policies}/**}`, `src/components/admin/leads/**`, nav/i18n/jobs `landing.ts` |
| **P4 CALL CENTER** | operations.md | OP-01…OP-14 | `src/lib/orders/{state.ts, events.ts, queue.ts, customers.ts, duplicates.ts, manual.ts, address.ts, risk-explain.ts, admin.ts}`, `src/lib/admin-data/orders.ts`, `src/app/app/[store]/{orders,queue,customers}/**`, `src/components/admin/{orders,queue,customers}/**`, nav/i18n/jobs `ops.ts`; appends to `src/lib/orders/contract.ts` status labels through the maintainer |
| **P5 INTEGRATIONS** | operations.md | IN-01…IN-06 (IN-03 per-store secrets landed in T4; P5 adds the trigger and health) | `src/lib/sheets/**`, `src/lib/pixels/**`, `src/lib/orders/{conversions.ts, conversions-core.ts}`, `src/lib/integrations/**` (telegram, whatsapp templates), `src/lib/jobs/handlers/{capi,telegram}.ts`, `src/app/app/[store]/integrations/**`, `src/app/api/app/[store]/sheets/**`, `src/components/admin/{pixels,integrations}/**`, `src/components/admin/settings/sheets-wizard.tsx`, nav/i18n/jobs `integrations.ts` |
| **P6 DESIGN** | design.md | DG-02…DG-09 | `src/lib/theme/**`, `src/lib/generator/**`, `src/lib/design/**` (genome, gates, slop score, distance service, cliché detector), `src/lib/ai/copy-library/**`, `src/landing/sections/**` (except `orderForm/**`), `src/landing/styles/**`, `src/components/generate/**`, `src/components/builder/**` (design check panel), `scripts/qa/design-*.ts` |
| **P7 AI** | ai.md | AI-01…AI-08 | `src/lib/ai/**` (except `copy-library/**`), `src/app/api/app/[store]/ai/**`, `src/app/app/[store]/settings/ai/**`, `src/app/admin/ai/**`, `src/components/admin/ai/**`, `scripts/qa/ai-eval.ts`, nav/i18n `ai.ts`; adds `@anthropic-ai/sdk` through the maintainer (one package) |
| **P8 PLATFORM OPS** | this doc §G, §H | OS-07…OS-11, PL-09 (job + ZIP), the runner, outbox core, render queue, health data, backups, retention | `src/lib/jobs/**` (except other tracks' `tracks/*.ts` and `handlers/{capi,telegram}.ts`), `src/lib/media/{store.ts, storage/**}`, `src/lib/storage/**`, `src/lib/backup/**`, `src/lib/exports-store/**`, `src/lib/platform/health.ts`, `src/app/api/cron/tick/route.ts`, `src/app/media/[key]/route.ts`, `src/app/api/app/[store]/{media/**, exports/**}`, `scripts/qa/storage-check.ts`, `src/lib/jobs/selftest.ts` |

Files no R1 product track lists (for example `src/components/admin/{media,history,pages,items,offers,variants}/**`,
`src/landing/document.tsx`, the rest of `src/lib/admin-data/**`) are read-only in this phase; changes go through a CCR.

**Merge order**: P8 → P2 → P1 → P5 → P4 → P3 → P7 → P6 (design last: it changes generated output everywhere, and
the DG-09 calibration corpus runs on the merged build). Each merge: `npm run gate` green. Then **integration**
(~3 days): domain move (§C.10) and V1 … V11, the calibration corpus, the eval gate, a manual COD run (landing page →
order → queue → confirm → Sheets → Telegram → CAPI test event) on XAMPP and live.

**R1 exit criteria** (RESEARCH §4 + core): tenancy gate green; V1 … V11 passed on the real domain; store #1 plus at
least 3 beta sellers live on subdomains; AI eval gate green (cloud AI may stay disabled); no-orange and theme checks
green; backups produced and one restored into a throwaway DB; a store export ZIP downloaded and opened; console
approval → publish → order flow shown to the owner.

### K.3 The shared-file rule and extension points

Owned by the maintainer for the whole of R1 product (and again in R2/R3): `src/lib/db/schema.ts`, `drizzle/**`,
`package.json`, `package-lock.json`, `src/lib/auth/permissions.ts`, `src/lib/tenancy/{types,seam,public}.ts`,
`src/lib/platform/{seam,impersonation}.ts`, `src/lib/orders/hooks.ts`, `src/proxy.ts`, `src/lib/edge/**`, `src/lib/urls/**`,
`src/lib/settings/{index,platform-registry,store-registry}.ts`, `src/lib/jobs/registry.ts`,
`src/components/admin/shell/nav/{types,index}.ts`, `src/lib/i18n/admin/index.ts`, `next.config.ts`,
`src/landing/runtime/budgets.json`, `src/lib/orders/contract.ts`, `src/lib/page/schema.ts` (frozen),
`docs/STORE-SAAS.md`. A track needing a change files `docs/saas/ccr/<release>-<track>-<n>.md` (what, why, exact diff);
the maintainer applies CCRs serially, the same day, and notifies the other tracks.

Extension points (track-owned files that the shared registries import, so tracks never edit a registry):
`src/lib/jobs/tracks/<track>.ts` (jobs), `src/lib/jobs/handlers/<kind>.ts` (outbox handlers),
`src/components/admin/shell/nav/<track>.ts` (nav items), `src/lib/i18n/admin/<locale>/<track>.ts` (messages),
`src/lib/settings/keys/<key>.ts` (a key's schema, owned by the part named in §D.10), `src/lib/orders/hooks/<track>.ts`
(handlers run after an order is created or changes state: CAPI and Telegram by P5, customer counters by P4,
commissions by S3 in R2). Permission keys and entitlement keys are all pre-defined (§A.3, §A.4): a missing key is a
CCR. In R1 product, `src/landing/runtime/**` stays read-only except P3's new `entry-delivery.ts` chunk.

### K.4 R2 (full stores and the money side), coarser grain

Contract step (maintainer): `drizzle/0006_r2.sql`, payload v3 types (`src/lib/orders/contract-v3.ts`, the v2 contract
untouched), `StoreRenderContext` + page-kind section contract (storefront.md), store runtime chunk budgets (cart ≤ 6 KB,
checkout ≤ 8 KB, search ≤ 5 KB gz, R-D43), `logistics`/`accountant` roles switched on.

| Track | Feature ids | Main areas |
|---|---|---|
| S1 STOREFRONT | ST-01…ST-10, LP-07, LP-08 | `src/lib/catalog/**`, store page kinds and sections, `/p` `/c` `/cart` `/checkout` routes, cart/checkout runtime chunks, on-request render cache (R-D42), store SEO |
| S2 BRAND & LOGO | DG-10…DG-14 | `src/lib/logo/**` (HarfBuzz shaping, outlines, exports), `store_themes`, brand kit UI, email token compiler |
| S3 MONEY | AC-01…AC-07, OP-15, TN-12 | `src/lib/finance/**`, CSV importers + `import_mappings` (D38), commissions ledger, finance screens |
| S4 LOGISTICS | OP-16…OP-19 | `src/lib/carriers/**` (`CarrierAdapter`, manual CSV adapter), shipments, picking list / manifest PDF, keyboard console, assignment rules, reveal alarm |
| S5 INTEGRATIONS 2 | IN-07…IN-09, SE-07 | webhooks (Standard Webhooks, outbox), SSRF guard library, SMTP mail transport, Sheets upgrades |
| S6 PLATFORM UX | UX-04…UX-06, OS-12, OS-13, PL-07 Ops tab, French dashboard | admin upgrade on the §I.6 foundation, live address card, realtime dashboards, Worker edge cache + purge, Worker alerts |
| S7 AI DATA | AI-09…AI-12 | SEO/alt/translation tasks with Batches, store blueprint, `stats_version_daily` + `ai_feedback` plumbing |

R2 exit: a "both" store with catalog, cart and attached landings; profit dashboard and remittance matching tested on
the owner's real carrier files; a load test of on-request store pages through the edge cache; gate green.

### K.5 R3 (grow and learn), coarser grain

Contract step: `drizzle/0007_r3.sql`, `store_domains` routing (`/d/<host>`, C mode), experiments contract (weights JSON,
cache rules, R-D47). Tracks: **D1 DOMAINS** (OS-14…OS-18, PL-22 skeletons), **D2 CARRIERS & MESSAGING** (OP-20…OP-27,
IN-10…IN-13, AC-08…AC-11), **D3 GROWTH** (ST-11…ST-20, LP-09…LP-16), **D4 LEARNING** (AI-13…AI-23, DG-15…DG-18),
**D5 PLATFORM** (PL-15…PL-21, UX-07, UX-08 Arabic RTL dashboard, SE-08). ST-21 (EU pack) becomes P0 when the first EU
store is planned. P2 items stay gated on volume, consent, legal review or owner demand (RESEARCH §4).

---

## L. Traceability

Track codes: R1.0 `C0`, `T1` DATA, `T2` AUTH, `T3` EDGE, `T4` SCOPE; R1 `P1` CONSOLE … `P8` PLATFORM OPS (§K.2);
R2 `S1` … `S7` (§K.4); R3 `D1` … `D5` (§K.5). "core" = this document.

### L.1 TENANCY-MAP item → where it is resolved

| Items | Resolved in | Track |
|---|---|---|
| DB-01, DB-03, DB-06 … DB-09, DB-12, DB-21, DB-23 | §D.2 (columns, uniques, indexes), §D.1 (FK rule), §D.8 (guarded 0004) | C0 |
| DB-02 | §D.2, §D.8 step 6 (`stores.home_page_id`) | C0, T1 |
| DB-04, DB-05 | D21, §G.4 | T4 |
| DB-10, DB-19 | §D.10 | T1 |
| DB-11 | §D.2, §F.5 | T1 |
| DB-13 | §A.3, §D.2 (`platform_role`, legacy `role`) | C0, T2 |
| DB-14, DB-15, DB-18 | D28 (stay global) | — |
| DB-16 | §F.4 (per-store fairness) | T3, P8 |
| DB-17 | §A.4, §D.7, §G.4 | T1, T4 |
| DB-20, DB-22 | §D.8 (conversion task, tenancy dry run), §H.4 | T1 |
| SET-01, SET-03 … SET-06 | §D.10, §E.6 | C0, T1 |
| SET-02, SET-12 | §F.3, §E.6 | T1 |
| SET-07, SET-09, SET-10 | §D.10 (`home` removed, Turnstile platform default, `store` per store) | T1, T3 |
| SET-08 | §D.4 `stores.timezone`, §I.5 | C0, T1 |
| SET-11 | §D.10, §E.6 | T4 |
| AUTH-01, AUTH-14, AUTH-16, AUTH-17, AUTH-18, AUTH-19 | §C.1-§C.3 (console-only gate, effective host, areas) | T3 |
| AUTH-02, AUTH-03, AUTH-23, AUTH-31 | D2, §E.2, §F.1 (L9) | T2 (+ maintainer deletes `adminAction`/`adminGuard`) |
| AUTH-04 | §A.3 | C0 |
| AUTH-05, AUTH-21, AUTH-22 | §B.3, §B.4 | T2 |
| AUTH-06, AUTH-07 | §B.5 | T2 |
| AUTH-08, AUTH-09 | §B.7, §B.9 | T2 |
| AUTH-10, AUTH-11, AUTH-12 | §A.1 invariants 2-3, §D.2 | T2 |
| AUTH-13, AUTH-15 | §B.11 | T2 |
| AUTH-20 | §C.4.1, §C.7 | T1, T3 |
| AUTH-24 | §C.9 | T3 |
| AUTH-25, AUTH-26, AUTH-27 | §B.3, D13, D14 | T2 |
| AUTH-28, AUTH-29 | §B.7 (issuer from the platform brand), §B.1 pages | T2 |
| AUTH-30 | §H.4 | T1 |
| ADM-01, ADM-29, ADM-30, ADM-31 | §I.4, §B.4 | T4 (functional), P2 (design) |
| ADM-02 | §I.4, §E.3 | T4 |
| ADM-03, ADM-04, ADM-05, ADM-08 … ADM-18, ADM-21, ADM-22, ADM-33, ADM-34 | §E.3 (scoped repositories) | T4 |
| ADM-06 | §H.5 (DB size console-only), §A.4 meters | T4, P2 |
| ADM-07, ADM-28 | §I.3 | C0 (types), P2 |
| ADM-19, ADM-20, ADM-24 | §E.3 rule 5, §G.5 | T4 |
| ADM-23 | §I.5 (store timezone) | T4 |
| ADM-25 | §F.5 | T1, T4 |
| ADM-26 | §I.2 (console health), §H.5 | P1, P8 |
| ADM-27, ADM-37, ADM-39 | §C.6, §F.1 (L8) | T4 |
| ADM-32 | §D.10 `platform.brand` | P2 |
| ADM-35 | §H.7 (tenants see the SA e-mail only) | T4, P5 |
| ADM-36 | §B.5 | T2 |
| ADM-38 | §E.3 rule 7, §F.1 (L7) | T4 |
| ADM-40 | §A.4 (entitlements), §I.5 (locale) | C0, P2 |
| PUB-01, PUB-02, PUB-03, PUB-18, PUB-22, PUB-23, PUB-28 | §C.4 | T3 |
| PUB-04, PUB-13, PUB-24 | §E.6 (render cache) | T3 |
| PUB-05, PUB-06 | §A.1 invariant 4, §A.2 | T3 |
| PUB-07, PUB-12 | §E.3 rule 5, §H.3 | T3 |
| PUB-08 | §D.10 | T3 |
| PUB-09 | §C.4.1 | T3 |
| PUB-10, PUB-11, PUB-16, PUB-17 | §C.6, §C.8 | T3 |
| PUB-14, PUB-20, PUB-25 | §C.9 | T3 |
| PUB-15, PUB-19 | §C.3 | T3 |
| PUB-21 | §E.6 (documented) | T3 |
| PUB-26 | §H.7 (`PLATFORM_URL`) | T3 |
| PUB-27 | §C.8 | T3 |
| LND-01, LND-03, LND-04, LND-06, LND-09, LND-10, LND-15, LND-30, LND-31, LND-34 | storefront.md (store page kinds, `StoreRenderContext`, chunks); §D.2 `pages.kind` | S1 (R2) |
| LND-02, LND-32 | §C.6, §A.1 invariant 4, §D.10 `policies` | T3, P3 |
| LND-05, LND-17 … LND-25, LND-27, LND-28 | §E.3, §G.4 | T4 |
| LND-07 | §C.6 (links), landing.md (rules) | T4, P3 |
| LND-08 | unchanged (one `#order` per landing/PDP) | — |
| LND-11, LND-33 | storefront.md / operations.md (SKU content ids, payload v3), §K.4 | S1 |
| LND-12, LND-13, LND-14 | §C.9 (path-derived storage prefix) | T3 |
| LND-16 | R-D43, §C.9, §J.1 | T3 (and every track) |
| LND-26 | §I.1 (`/app/<h>/preview/<id>`) | T4 |
| LND-29 | §B.4 | T4 |
| ORD-01 | §E.2 `resolvePublicTarget`, §E.5 | T3 |
| ORD-02, ORD-17, ORD-18, ORD-21 | §E.8 | T3 |
| ORD-03 | §D.2 (`block_store_uq`), §E.3; OP-12 | T3 (create path), T4 (admin) |
| ORD-04, ORD-05, ORD-06 | §E.3 (rules 1, 2, 4) | T3 |
| ORD-07 | §A.2 / `stores.currency` | T3 |
| ORD-08 | §H.1, §H.2 (per-store drains) | T3, T4 |
| ORD-09 … ORD-16 | §E.3 | T4 |
| ORD-19, ORD-20 | §D.2 (0006), storefront.md, §K.4 | S1 |
| SHT-01 … SHT-08, SHT-10 | §D.10 `sheets`, §E.3, §E.6 (`__codSheetsSync`), §E.7 (lock), §E.8 (`sheets:pull`), §I.5 (timezone) | T4 (scoping), P5 (IN-01) |
| SHT-09 | §D.5 `sheet_bindings` (ownership proof) | P5 |
| SHT-11 | §H.2 | T4 (minimal loop), P8 (runner) |
| PIX-01, PIX-03 … PIX-06, PIX-08 | §D.10 `tracking_secrets`, `pixel_library`, `pixel_health`; §E.3; §E.6 | T4 |
| PIX-02 | §C.6 (`event_source_url`) | T4 |
| PIX-07 | §D.8 (conversion task) | T1 |
| PIX-09, EXP-07, GEN-13 | §D.10 `platform.brand` | T4, P7 |
| EXP-01, EXP-02, EXP-04 | §E.3 (rule 5) | T4 |
| EXP-03 | §D.10 `export_key`, §F.10, §H.7 (export SA removed) | T4 |
| EXP-05 | §E.8 | T4 |
| EXP-06 | unchanged (the pageKey resolves the store) | — |
| MED-01, MED-02, MED-05, MED-06, MED-12, MED-13, MED-15 | §G.4 | T4 |
| MED-03 | §D.2 `stored_bytes` | C0, T4 |
| MED-04, MED-14 | §E.6, §E.8 | T4 |
| MED-07, MED-08 | §G.1, §G.2, §G.7 | P8 |
| MED-09 | §D.2 `media_files.store_id`, `storage` | C0 |
| MED-10 | §G.6 | T3 (status), P8 (backends) |
| MED-11, MED-17 | §I.1 (`storeGuard`, moved pages) | T4 |
| MED-16 | §C.3 (matcher) | T3 |
| MED-18 | §E.3 rule 5 | T4 |
| MED-19 | §J.2 `test:storage` | T4, P8 |
| GEN-01, GEN-02, GEN-04 | §E.2, §E.3 rule 4 | T4 |
| GEN-03 | §B.4 | T4 |
| GEN-05 | design.md (`store_themes`, R2) | S2 |
| GEN-06, GEN-07, GEN-10, GEN-11 | design.md (DG-02…DG-04), D37 | P6 |
| GEN-08, GEN-09 | §D.10 `policies`; ai.md (AI-06, guard) | P7 |
| GEN-12 | §D.4 `stores.brand_seed`; design.md (DG-05) | C0, P6 |
| GEN-14 | DG-01 in step C0 | C0 |
| STAT-01 … STAT-04 | §D.2 `stats_daily.store_id`, §I.5 | T3 |
| QA-01 | §H.5 (`/api/health` identity), §J.3 | T3 |
| QA-02, QA-03, QA-05, QA-06 | §J.2 (throwaway DBs, seeded stores) | T4 |
| QA-04 | §J.3 | T4 |
| QA-07 | the `[admin-css]` marker renamed together with HANDOFF §4 | P2 |
| C1, C2, C3, C5, C8 | §C.4 | T3 |
| C4 | §C.4.1, §C.7 | T1, T3 |
| C6 | §C.3 | T3 |
| C7 | §C.9, R-D4, R-D5 | T3 |

### L.2 RESEARCH feature → spec file, release, track

| Features | Spec | Release | Track |
|---|---|---|---|
| PL-01 | core §B.2 + platform.md (console settings) | R1.0 / R1 | T2, P1 |
| PL-02 | core §A.5.2 + platform.md | R1.0 / R1 | T1, T2, P1 |
| PL-03 … PL-06 | platform.md | R1 | P1 |
| PL-07 | platform.md (Ops tab: R2) | R1 (R2) | P1 (S6) |
| PL-08 | core §A.5 + platform.md | R1.0 / R1 | T1, P1 |
| PL-09 | core §F.9, §H.2 + platform.md | R1 | P8, P1 |
| PL-10 | core §B.8 + platform.md | R1.0 / R1 | T2, P1 |
| PL-11 | core §A.4 + platform.md | R1.0 / R1 | T1, P1 |
| PL-12 | core §H.8 + platform.md | R1.0 / R1 | T1, P1 |
| PL-13 | core §D.4 + platform.md | R1.0 / R1 | T2, P1, P2 |
| PL-14 | core §D.10 + platform.md | R1 | P1 |
| PL-15 … PL-21 | platform.md | R3 | D5 |
| PL-22 | platform.md | R3 | D1 |
| PL-23 … PL-25 | platform.md | later | — |
| TN-01 | core §A, §D | R1.0 | C0, T1 |
| TN-02 | core §E | R1.0 | T2, T4 |
| TN-03, TN-04 | core §D.8, §D.10 | R1.0 | T1 |
| TN-05, TN-06 | core §B | R1.0 | T2 |
| TN-07 | core §B.4, §I.4 | R1.0 / R1 | T2, T4, P2 |
| TN-08, TN-09 | core §A.2, §A.3 | R1.0 | C0, T2 |
| TN-10 | core §F.1, §J | R1.0 | C0, T4 |
| TN-11 | core §E.6 … §E.8 | R1.0 | T1, T3, T4 |
| TN-12 | core §A.3 (viewer R1, accountant R2) | R1 / R2 | S3 |
| TN-13 | core §B.7, D12 | R1.0 (seam) / R1 (UI) | T2, P2 |
| TN-14 | operations.md | later | — |
| ST-01 … ST-10 | storefront.md | R2 | S1 |
| ST-11 … ST-20 | storefront.md | R3 | D3 |
| ST-21 | storefront.md | at the first EU store | — |
| ST-22 | storefront.md | later | — |
| LP-01 | core §C, §E (scoped, frozen contracts) + landing.md | R1.0 / R1 | T3, T4, P3 |
| LP-02 … LP-06 | landing.md | R1 | P3 |
| LP-07, LP-08 | landing.md + storefront.md, design.md | R2 | S1, S2 |
| LP-09 … LP-16 | landing.md | R3 | D3 |
| LP-17 | landing.md | later | — |
| OP-01 … OP-11, OP-13, OP-14 | operations.md | R1 | P4 |
| OP-12 | operations.md + core §D.2 | R1.0 / R1 | T3, T4, P4 |
| OP-15 | operations.md | R2 | S3 |
| OP-16 … OP-19 | operations.md | R2 | S4 |
| OP-20 … OP-27 | operations.md | R3 | D2 |
| OP-28, OP-29 | operations.md | later | — |
| AC-01 … AC-07 | operations.md | R2 | S3 |
| AC-08 … AC-11 | operations.md | R3 | D2 |
| AC-12 | operations.md | later | — |
| IN-01, IN-02, IN-04, IN-05 | operations.md | R1 | P5 |
| IN-03 | operations.md + core §D.10 | R1.0 / R1 | T4, P5 |
| IN-06 | core §D.10 `platform_turnstile` + operations.md | R1 | T3, P5 |
| IN-07, IN-09 | operations.md + core §H.1 | R2 | S5 |
| IN-08 | platform.md + core §B.10 | R2 | S5 |
| IN-10 … IN-13 | operations.md | R3 | D2 |
| IN-14 | operations.md | later | — |
| AI-01 … AI-08 | ai.md (+ core §D.10 settings split) | R1 | P7 |
| AI-09, AI-10, AI-12 | ai.md | R2 | S7 |
| AI-11 | ai.md + storefront.md | R2 | S7, S1 |
| AI-13 … AI-23 | ai.md | R3 | D4 |
| AI-24 | ai.md | later | — |
| DG-01 | design.md (docs/DESIGN.md v3) | R1.0 | C0 |
| DG-02 … DG-09 | design.md | R1 | P6 |
| DG-10 … DG-14 | design.md | R2 | S2 |
| DG-15 … DG-18 | design.md | R3 | D4 |
| DG-19 | design.md | later | — |
| UX-01 | platform.md (+ design.md reveal) | R1 | P2 |
| UX-02 | platform.md + core §I.4 | R1 | P1 (console), P2 (tenant) |
| UX-03 | platform.md + core §I.6 | R1 | P1 |
| UX-04 | design.md + core §I.6 | R2 | S6 |
| UX-05, UX-06 | platform.md | R2 | S6 |
| UX-07, UX-08 | platform.md (+ core §I.5) | R3 | D5 |
| SE-01 | core §A.3.3, §B.7 + platform.md (UI) | R1.0 / R1 | T2, P1 |
| SE-02 | core §C.9 | R1.0 | T3 |
| SE-03 | core §C.7 | R1.0 | T1 |
| SE-04 | core §F.5, §F.11 + platform.md | R1.0 / R1 | T1, P1 |
| SE-05 | core §C.9, §I.2 | R1.0 | T3, T4 |
| SE-06 | core §B.7, §B.9 | R1.0 | T2 |
| SE-07 | core §H.1 + operations.md | R2 | S5 |
| SE-08 | core §F.5 | R3 | D5 |
| SE-09 | platform.md | later | — |
| OS-01 … OS-04 | core §C.1, §C.3, §C.6, §C.8 | R1.0 | T3 |
| OS-05 | core §C.5, §C.10 | R1.0 (Worker) / R1 (move) | T3, maintainer |
| OS-06 | platform.md + core §C.10 | R1 | P1 |
| OS-07 … OS-11 | core §G, §H | R1 | P8 (per-store ids: T4) |
| OS-12, OS-13 | core §C.5 + platform.md | R2 | S6 |
| OS-14 … OS-18 | core §C.1 (C mode), §D.6 `store_domains` + platform.md | R3 | D1 |
| OS-19 | core | later | — |

---

## P. Review decisions

(Empty in revision 1. Filled after the reviews: each row = reviewer, point, decision, section changed.)
