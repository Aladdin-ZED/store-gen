# Store Gen SaaS: core contract (tenancy, identity, routing, data, security, storage, jobs, shell, releases)

Status: **core contract, revision 6 (wording tidy)** (2026-10-24, lead architect). **Revision 6** tidies the confirming critic's wording minors (W1 … W10, drift only, no decision changed),
one line per item in **§P.4**. **Revision 5** applies the
final critic's 22 issues against the revision-4 set (CRIT2-1 … CRIT2-22: 7 majors, 15 minors, mostly drift between this
document and parts revised in parallel) here and in every part they name, one line per id in **§P.3**. Reviewed twice. Round
1: the six reviewer passes (OPS, ENGC, ENGP, UX, SEC, QUAL) found 4 blockers, ~45 majors and ~40 minors against
revision 2.1; revision 3 resolved them (§P round 1, §N.2, §Q.8). **Round 2** re-sent every finding that names the core
or is cross-file against revision 3 plus the critic's consistency findings (CRIT1 … CRIT20); **revision 4 re-verifies
every round-1 resolution, resolves the critic's findings in the body and decides the parts' fourth-round notes**
(§P round 2, §N.3, §Q.9). The six parts are at revision 4 (their round-2 decisions in PLA-§R, STO-§30.2, LAN-§30,
OPE-§R2, AI-§V, DES-§30). This document is the contract every build agent follows for everything cross-cutting: the
tenant model, identity, routing and domains, the full table list, the store-scope seam, security, storage, jobs, the
admin shell, tests, releases and file ownership. Product depth lives in six part specs written on top of it:
`docs/saas/spec/platform.md`, `storefront.md`, `landing.md`, `operations.md`, `ai.md`, `design.md` (revision 6, wording tidy,
except `operations.md`, which stays at revision 5, critic r2 integrated).
A part spec may refine the columns of the tables this document assigns to it (§D.9) and add product behaviour; it may
not rename tables, change `store_id` rules, change a seam signature (§E) or move a file between tracks (§K). Each part
spec ends with a section "Requests to the core"; **revision 2 decided every first-round request in appendix §Q.1-Q.6
and revision 2.1 decides the second-round requests and notes in §Q.7**, integrating the accepted ones into the body;
the sections "Elevation changes (rev 2)" (§N) and "Revision 2.1 changes" (§N.1) list what changed, why, and the
source. Revision 2.1 also removes every inconsistency found between the core and the six revision-2 parts (file
ownership overlaps, stub names, audit names, header rows, chunk budgets, i18n file ownership). Where this document and
an older doc (or a part spec's request text) disagree, this document wins.

Inputs (all settled): `docs/STORE-GEN-BRIEF.md` (owner items 1-16; item 16 = this elevation pass), `docs/HANDOFF.md`
(owner rules §2, Hostinger §4), `docs/saas/TENANCY-MAP.md` (verified map, item ids such as DB-04, AUTH-13),
`docs/saas/RESEARCH.md` (decisions cited here as **R-D1 … R-D53**, feature ids such as PL-04, OP-03),
`docs/saas/research/*.md`, and for revision 2: `docs/saas/research/design-baseline.md` (measured baseline 4.3/10,
distinctiveness 2/10; §5 targets cited as N*/C*/T*/K*/I*/R*/D*/RTL*/F*), `docs/saas/research/rethink-ai.md` (Director
loop, model matrix, learning and eval, §9 = 17 changes, cited as **rethink-ai §n**), `docs/saas/research/rethink-features.md`
(signature features **SF-01 … SF-12**, the admin UX ceiling, the catalog delta, the 3-minute wow demo = R1 acceptance,
cited as **rethink-features §n**), `qa/ref/anti-slop-frontend-rubric.md` (adopted where it does not conflict with the
owner rules; its orange-family palette suggestions are void, Arabic has its own type rules). Format model:
`docs/OFFERS.md`. Code facts are `path:line` at commit `a0ffec1` (revision 1 facts at `ab66ba6` were re-verified and
still hold; `src/**` is byte-identical at `ae4e6c0`, the commit revision 2.1 was written against, and the facts
re-cited in §N.1 were checked there: `src/lib/ai/guard.ts:114` `mergeAiCopy`, `src/lib/ai/copy-schema.ts:113-151`
kickers, `src/lib/audit.ts:14-38` the open `AuditAction` union, `src/landing/primitives/` 25 files). Next.js is 16.4:
the request hook is `src/proxy.ts` (not middleware), Node runtime only
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:253-255`).

Reading order for a build agent: §0 (decisions) → the track you own (§K) → the sections your track's files touch →
§J (tests you must keep green) → §L (find your feature ids) → §Q (how your part's requests were decided, §Q.9 for the
fourth round) → §P (what the two reviews changed and why).

Frozen for the whole of R1, unchanged by this revision: landing **PageDoc v2**, **runtime config v2**, **order payload
v2**, the **PHP export**, and the landing runtime chunk at **24,200 B gz** (`src/landing/runtime/budgets.json:3`). Every
new runtime behaviour is a **new chunk** with its own budget (§H.13, LAN-§5); the frozen chunk gains only the storage
prefix bytes of §C.9, **derived once in `core.ts`** (ENGC-10, ENGP-26), and nothing else (rev 4: no zone, city-key or
calling-window code enters it; the browser zone tables are keyed by the posted `City.value`, D68). The R1.0 integration
also accepted T3's behaviour-equivalent byte-saving edits of `flag()`, `disable()` and `tracking.ts` that paid for the
prefix (CCR r1.0-m-7; the runtime selftest pins them against the baseline). **Rev 3 freeze rule:** after T3's prefix edit,
T3 re-measures the chunk; if it still fits 24,200 B the figure stands, otherwise the maintainer records the measured
value in `budgets.json.landing` and in §P as an explicit re-freeze for the owner (expected ≤ +60 B); from the R1.0
integration `render-check` enforces the `landing` chunk with **tolerance 0** against the recorded budget **and** the
recorded sha256 (`src/landing/runtime/landing.sha256`, written by T3, maintainer-owned afterwards), while every other
chunk keeps the +5 % rule (§J.1). The storefront's hash assertion (STO-§14.1) reads the same pin. Runtime config **v3**
(LP-16, per-city fees) is an R2 **addition** for `runtime_v = 3` pages only; v2 stays frozen for every other page
(OPS-13, §K.4).

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
16. **New in revision 2.** A seller gets a **Campaign Kit** with every page (WhatsApp message, call script, ad brief,
    one short link per channel, pixel plan, a share link for the media buyer), a **Store Health** ring with five
    reasoned fixes instead of a checklist, a **Profit** screen that tells them the most an order may cost in ads from
    their own confirmation and delivery rates, and a **test-order link** that walks the whole flow without touching
    stats, Sheets or ad platforms. The dashboard polls cheaply (one poller per browser, nothing downloaded when
    unchanged).
17. The AI thinks in two speeds: an **interactive Director** (Opus 5.5) that briefs, picks and critiques inside one
    request, and a **deep Director** (Fable 5.1) that runs as a background job for store blueprints, logo systems and
    the monthly health report. The engine keeps every guarantee (no orange, contrast, honesty, distinctness); the model
    only directs. Cloud AI still ships off until you give a key and a cap.
18. Every publish passes **server-side gates**: a page that is too long, too heavy, repeats a design already live in
    the niche, invents a number or shows a proof section without real material is refused with a named reason and a
    fix, never a generic error.
19. R1 is accepted when the **three-minute demo** passes: a new seller signs up on a phone, drops photos, gets three
    distinct designs, you approve in one key, they publish, place a test order, and the agent confirms it from the
    queue before the shopper puts the phone down (rethink-features §4, §K.2).
20. **New in revision 3 (after the review).** Sign-ups cannot flood the platform: a human check is required once
    public sign-ups open, only a set number of new shops per day get a sandbox (the rest join the waitlist), and
    sandboxes share one disk and one AI budget. When your support team "views a shop", customer names and addresses
    are masked like phones already were. Every public page carries a "Report this store" link, a shop's name is
    checked against protected brands at every change, and no page may contain a password or card field. Sellers
    get a carrier loop in R1 through their Google Sheet (tracking number and carrier columns, a carrier CSV), one
    calling-hours setting that every promise reads, and one city key everywhere so delivery zones match.
21. **New in revision 4 (second review).** A shopper is told "we call you from 09:30" only after the seller saved
    their calling hours once (until then the team works on starting hours, but no promise is made). The "Report this
    store" link is drawn by the page footer itself, so no landing page can miss it. Pulling the carrier file or every
    customer now asks for a fresh password or 2FA code, and a seller can delete their own account when they own no shop.
22. **New in revision 5 (final consistency check).** Public sign-ups open only once the human check (Turnstile) is set
    up; until then the platform stays invite-only even on the real domain. Generated pages carry no aurora glow fields
    and no film grain at all (one soft product-coloured light at most), and a shopper is never told a calling hour the
    seller has not confirmed, in the AI's texts too.

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
| D9 | **Signup mode default is derived:** `invite` while S mode is off (temporary domain), `approval` once `STORE_ROOT_DOMAIN` + `EDGE_KEY` are set **and the domain check V13 "human check ready" has passed** (§C.10 step 3: `platform_turnstile` configured, the new hostnames among its hostnames and a verified test token on `/signup`; rev 5, CRIT2-13, one rule since rev 6: until V13 passes, the default stays `invite`). The console can override, **but never to `approval` or `open` while `platform_turnstile` is unset** (the setting write is refused with `turnstile_required`). | R-D5 and the lead default; no manual switch to forget on domain day; owner summary item 20 promises a human check once public sign-ups open, and D69's refusal only bites when a widget exists, so without one bots could take the 50 daily sandboxes. |
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
| D30 | **Envelope v2** `v2.<kid>.<iv>.<tag>.<ct>`: AES-256-GCM, key = HKDF(APP_SECRET, salt `cod-studio`, info `"<scope>:<purpose>:<kid>"` with scope = `store:<id>` or `platform`), **AAD = the identical info string** (kid included; rev 3, SEC-25: §F.3 and this row now agree, and `test:envelope` asserts that a v2 envelope whose AAD names another kid fails to open). v1 stays readable forever. The salt and existing purposes never change. | Per-store keys (SET-02), a key id for later rotation, ciphertext copied between rows fails; binding the kid stops a future `k2` ciphertext from opening under `k1` parameters; the brand-sweep hazard (TENANCY-MAP §11.1). |
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
| D44 | The console stays on the apex at `/admin/**` behind the gate on the temporary domain (R-D4); staff use the same `/login`. **Rev 3 (SEC-2):** `ADMIN_HOST = console.<domain>` is set **at the domain move** (§C.10 step 1; the `console` host class and the gate already exist in T3's proxy, so the console leaves the shared origin the day S mode turns on); the tenant dashboard stays on the apex in R1 and the CSP narrowing of §C.9 is its control; `app.<root>` is R2 (S6). | R-D4; on a shared origin a vendor pixel script on a tenant page runs with the viewer's cookies, so the console must leave that origin before public sign-ups. |
| D45 | Public `/api/health` answers minimal JSON with `app: "store-gen"`. | Uptime checks and the e2e server-identity assertion (QA-01). |
| D46 | Realtime = visibility-aware 15 s polling of `/api/app/<h>/pulse` (cached 5 s per store). | R-D50. |
| D47 | `typescript` (already installed, 5.9.3) is declared as a devDependency for the AST tenancy lint. | No download; the compiler API is the reliable way to find query sites. |
| D48 | Store pages and landing pages stay **base-path aware at render**: in-page links are absolute paths built from `storeBase()` (`/s/<h>` in P mode, empty in S/C); canonical, og and JSON-LD are absolute; an address change enqueues re-renders. | Domains.md §4.4; document-relative links break under `/s/<h>/slug`. |
| D49 | Agent fields live in `agent_profiles`, not in `store_members`. | The membership row stays the security core; call-center state changes every minute. |
| D50 | **A re-render (address, brand, product change) rewrites only the rendered columns of the current published version row in place** (html, csp, etag); the doc, checksum and `runtime_v` never change and no version row is added. **Refined in rev 2:** reason `product` (attached landings, R2) is the one exception: it republishes a `sync` version (LAN Q24, §H.3), because the price lives in the version doc the server prices from. | A re-render is not a publish; a new 600-900 KB version per page per change would eat the 3 GB quota (TENANCY-MAP DB-03). |
| D51 | **One publish-time gate registry** `src/lib/render/prepublish.ts` (checks before the version row, listeners after commit), track files `src/lib/render/prepublish/<track>.ts`; a failing check answers a **typed refusal** `{ ok: false, error: "design_blocked" \| "honesty_blocked" \| "budget_blocked", items: GateItem[] }`, never a generic error. Merges DES-R3 and LAN Q13 (§M). | design-baseline §4: today's checklist runs only in the browser; the server must refuse what the owner rules forbid (hard targets C2, C3, F5, I4, D1, D2, N1). |
| D52 | **Page budgets are publish gates, not advice:** HTML ≤ 90 KB gz soft / **140 KB hard**; mobile height ≤ 12,000 px soft / **15,000 px or 16 sections hard**; form top ≤ 3,000 px; first screen holds image, price, CTA and the COD line (§M.2). | design-baseline §5 C2, C3, F1, F5 (baseline: 170 KB gz, 27 sections, 26-32k px, form on screen 14-17). |
| D53 | **One `store_health` table, two audiences** (P*, one row per store, computed by the `platform.health` job): the console ring (PL-18) and the tenant Store Health ring with reasoned fixes (SF-03) read the same row; rules are contributed per track (`src/lib/health/rules/<track>.ts`); snoozes are stored and audited; the score never gates anything. | rethink-features §1.3, §3.2 (PL-18 raised to a tenant feature); PLA-Q.1 asked for the snapshot; one computation, one number. |
| D54 | **Test-order mode is a core flag:** `orders.is_test` and `leads.is_test` (**0004**, rev 3 ENGC-1: T3's R1.0 code writes them, so they are cut with the tenancy migration together with `orders_store_test_idx` and `page_slug_history`), set only by the public path from a store-signed token (`hmac(exp, "test-order:<storeId>")`, 2 h); every aggregate reader skips `is_test` (Sheets, CAPI, Telegram "[TEST]", stats, KPIs, finance, learning, rollups). | SF-05 (rethink-features §3.1); the owner's test orders hit risk ≥ 70 today (HANDOFF §5) and poison stats; the wow demo (§K.2) needs it. |
| D55 | **Per-class model matrix, not one model id:** `platform_ai.classes` = `director_interactive` (`claude-opus-5-5`, `medium`), `director_deep` (`claude-fable-5-1`, `high`), `worker` (`claude-sonnet-5-5`, `low`), `fast` (`claude-haiku-5-5`, `low`), each with `maxTokens`, `timeoutMs`, fallback and batch policy, owner-overridable. **Refines R-D29** (one default id). The degrade ladder removes stages, never swaps a model inside a class. | rethink-ai §0.5, §2.3, §9.13; brief item 16 asks for the strongest model on judgment and a fast one everywhere else. |
| D56 | **Long work is a job, never a long request:** no interactive route holds a request past 90 s; anything slower inserts an `ai_jobs` row, answers `202 { jobId }`, continues in `after()` with a 10 s heartbeat, is polled visibility-aware every 2 s, and is recovered by the cron (`ai.jobs`) when the heartbeat is older than 60 s; Message Batches are the guaranteed fallback (§H.12). **Rev 3 (ENGC-18, AI-§B.13):** jobs are **stage-resumable** (every stage ≤ 90 s) and three drivers advance them (`after()` while it lives, the poll request itself, the cron), so the 2-6 minute promise holds whatever `after()` survives; every page and route that may start a job exports `maxDuration = 360`. **Rev 4 (AI R41, R42):** the release flag `ai_detached_jobs` (set by the live probe) switches **only the `after()` driver**; pattern B runs on the poll and cron drivers either way (§H.12 rule 1); the cron driver never runs a model call inside the tick: it marks orphans and hands a driverless job's next stage to a one-item Message Batch (§H.2 slot 4c). | rethink-ai §1.5, §9.6; Hostinger's 120 s cap (`src/app/api/cron/tick/route.ts:25` sets `maxDuration = 120`); `after()` lives at most the route's `maxDuration` (`after.md`); whether a detached promise survives minutes is **[unverified]** until the R1 probe. |
| D57 | **Pulse gains an ETag and a shared poller** (SF-06): `GET /api/app/<h>/pulse` answers `304` when nothing changed, one tab per browser polls and shares through `BroadcastChannel("sg-pulse:<storeId>")` (fallback: independent pollers), contributors add counters through `src/lib/pulse/contributors/<track>.ts`. **Refines R-D50 / D46.** | rethink-features §2.2, §3.4; PLA-Q.14; 15 s polling must stay cheap on one Node process. |
| D58 | **Fair tests use always-valid sequential inference (mSPRT)** instead of a fixed horizon: peeking allowed, the stop rule shown, ≥ 100 uniques per arm, auto-end at 28 days. **Refines R-D47.** | rethink-features §1.8, §3.4 (Johari et al. 2015); sellers look every day. |
| D59 | **Nothing on the critical path waits for a model download:** onboarding ranks directions from category tap + photo palette + keywords; SigLIP and the VLM refine after the reveal or run on the server when Cloud AI is on; the consent card never shows on mobile data. **Refines UX-01 / AI-03 as written in RESEARCH.** | rethink-features §3.4, §4 (99.5 + 111 MB at q8 on 4G = 1-3 minutes); demo check 2. |
| D60 | **"No bounce" applies to today's admin shell, not only to pages:** the two spring/overshoot sites (`src/components/admin/shell/app-sidebar.tsx:96` spring stiffness 480, `:146` `cubic-bezier(.34,1.36,.64,1)`) change to the §I.6 ease-out; **aurora + grain are removed from the admin and from every generated page (rev 3, UX-38: no "one per screen" budget, no celebration variant; `adm-aurora` / `adm-grain` leave the token generator and join the admin lint; the celebration is a typographic moment, the thank-you colour moment a flat accent slab or one product-tinted radial ≤ 10 % alpha)**; **rev 5 (CRIT2-4), the generated-page side made executable:** the theme emits no `--lp-aurora` / `--lp-aurora-1..3` and no grain (`data-texture` always `none`), the `Aurora` mesh leaves the light-field kit `src/landing/illustrations/**` (now P6's, §K.2), a single product-tinted radial ≤ 10 % alpha (the stage glow) stays allowed on ≤ 2 sections, and design's hard gate V40 plus a render-check case refuse any aurora or grain on a generated page (DES-§3.2, §4.10.1, §8.2); sparklines need ≥ 7 points (`src/components/admin/dashboard/kpi-card.tsx:92` draws from 2). **Refines R-D38 / §I.6.** | rethink-features §2.1 rule 4, §2.5, §3.4; owner rule "maximally modern, never generic"; mesh gradients with grain are the generated-UI signature the owner banned (rubric §0.D, §9.A). |
| D61 | **The learning reward is one hierarchical Beta system:** owner signals form the prior (pseudo-count ≤ 20), market outcomes (delivered per unique, UTM-stratified, ≥ 300 uniques, fakes and `is_test` excluded) the likelihood, 0.97/week decay. **Refines R-D32** (fixed 0.4/0.6 mix). Same `gene_stats_*` tables. | rethink-ai §3.2, §9.7: a fixed mix treats 5 observations like 5,000. |
| D62 | **Runtime add-ons are a render hook, not a change to the frozen chunk:** the render context carries `addons: RenderAddons` (head/body chunk names, JSON data blocks, extra CSS); every add-on script joins the hash CSP; each has its own `budgets.json` key; the `page` cap rises to 34,800 B and a `thanks-page` cap of 12,600 B is added (LAN Q3, Q5). | New behaviour (delivery line, WhatsApp order, tracking) without touching `landing` at 24,200 B; the heaviest page measured 31,931 B (OFFERS §F.9). |
| D63 | **Campaign Kit and Profit lite ship in R1:** `campaigns`, `short_links` (moved from 0007), `product_costs`, `carrier_rates`, `ad_spend_daily`, `profit_alerts` move to **0005** (`page_slug_history` further to **0004** in rev 3, ENGC-1); `/go/<code>` is R1; Profit lite sits behind the release flag `finance_lite` (default `true`). | rethink-features §3.1 (SF-01, SF-04), §3.2 (LP-11, LP-12); LAN Q1, Q6; OPE Q.5; the flag lets the maintainer defer without a schema change. |
| D64 | **Cross-store reads for health, novelty and AI consoles are platform code with pinned annotation counts:** `src/lib/ai/platform/**`, `src/lib/design/novelty.server.ts`, `src/lib/jobs/tracks/design.ts` and `src/lib/health/**` join the §E.3 rule 6 allowlist; design novelty returns **verdict bands only**, never another store's genome or text. | AI R7, DES-R9, DES-R17 (DS7); R-D36/R-D37 isolation. |
| D65 | **(rev 2.1) `ActionErrorCode` is the core union plus an open `(string & {})` tail**, like `AuditAction` (`src/lib/audit.ts:14-38`). A part may answer its own codes from a `storeAction` / `platformAction`; every such code is listed in that part's spec, has a message key `error.<code>` in ar/fr/en (`test:i18n-coverage`) and a UI that renders it; an unknown code falls back to the generic "something went wrong" sheet, never to raw text. The nine platform codes known at rev 2.1 are listed in §E.2. | PLA-§Q.1 note 1; closing the union at P0 would make every part-level code a CCR. |
| D66 | **(rev 2.1) Budget gates take a per-kind profile, never a second registry:** `registerBudgetProfile(kind, profile)` in `src/lib/render/prepublish/budget.ts` lets the storefront contract step (R2) pass the STO-§6.1 thresholds for store page kinds; a profile may **lower** a threshold and may never raise a hard ceiling above D52 (140 KB gz, 16 sections, 15,000 px). The landing profile is the default. | STO-R25; D51 (one registry), D52 (owner-rule ceilings). |
| D67 | **(rev 2.1) One i18n file per track, texts live with their owner:** a track owns only `src/lib/i18n/admin/<locale>/<track>.ts` (plus the extra files §K.2 names for P1 and P2); notification texts `notify.<kind>.*` live in the file of the track that declares the kind, Store Health rule sentences `health.<track>.<rule>.*` in the file of the track whose `rules/<track>.ts` emits the issue; P2's `health.ts` holds the ring and issue-list chrome only. | platform.md and the P2 row both claimed `health.ts`; §K.3's rule that two tracks never own one file. |
| D68 | **(rev 3, OPS-1; rev 4, CRIT1) One canonical city key in storage and on the server, one table shape in the browser.** Every **stored and server-side** key is operations' slug `CityKey` (`cityKey(value): CityKey \| null`, `src/lib/orders/address.ts`, pure and isomorphic, folds ar/fr/en spellings; `"Autre"` and unknown → `null`): `delivery_zones.cities`, `carrier_rates.city_key`, `orders.city_key`, `zoneFeesFor(scope, keys)`, `opsAggregates(dims: city)` and every aggregate dimension; `zoneForCity(zones, key \| null)` and `zoneLineFor(scope, key \| null, …)` map `null` to the `*` zone. **Every browser zone table** (the `lp-assist` data block, `#sg-config.checkout.zones`, the R2 `landing-v3` config) is the one `ZoneTable` that `zonesForCheckout(scope)` builds on the server with the pure `buildZoneTable(zones, cal, cities)` (`src/lib/delivery/table.ts`, P3): `city` is **keyed by the posted `City.value`** (`city["Fès"] = zoneIndex`), a value absent from the map (`"Autre"`, a typed city) resolves to `star`, and the chunk looks up `table.city[value] ?? table.star`. **Only server code calls `cityKey()`**; it stays pure and isomorphic so tests and a future chunk may import it, but no R1/R2 chunk is required to (the frozen landing chunk and the `assist`, `checkout`, `pdp` chunks carry no slug logic). One shared parity fixture (`scripts/qa/fixtures/city-key.json`, P4) asserts both layers (every spelling → one slug; `zoneTableKey: "value"` and the `buildZoneTable` key set = the `City.value` set) and is read by `test:delivery`, `test:catalog` and `test:ops`, so P3, P4 and S1 fail together on either drift. | Rev 2 had two incompatible keys (landing stored `City.value`, operations the slug): no city would ever have matched a zone. Rev 3 then specified the P0 `zonesForCheckout` as value-keyed while this row said the tables carry slugs (CRIT1): one P0 function with two shapes for its two consumers. The value-keyed table is what the `<select>` gives the browser, costs no runtime bytes and keeps the frozen chunk untouched. |
| D69 | **(rev 3, SEC-1) The pending sandbox has platform-wide ceilings:** in `approval` and `open` modes (which require a configured `platform_turnstile`, rev 5 CRIT2-13, D9) a missing or invalid Turnstile token **refuses** the signup (`+20` scoring stays for `invite` only); at most `platform.signup.pendingStoresPerDay` (default 50) sandboxes are created per platform day through `chargePlatformUsage("pending_stores", <day>, 1)` and the next applicant lands in `waitlist` with `source = "cap:<day>"`; every pending store's uploads charge one shared disk budget `pending_media_bytes` (limit `platform.signup.pendingMediaTotalMiB`, default 5,000 MiB) before the store gauge, with a two-tier per-store cap (`pendingMediaMiBBeforeSubmit` 20 MiB until "Submit for review", `pendingMediaMiB` 100 after); pending stores' AI spend is a slice `ai_cost_micros_pending` ≤ `platform_ai.caps.pendingSharePct` (10 %) of the monthly cap with a daily floor of 10 credits. Refunded on the transition out of `pending`, recomputed by `usage.reconcile`. | Without a sum cap, 1,000 bot sign-ups (200 IPs/hour) meant 100 GB of disk, ~900k inodes and the whole AI cap before anything auto-rejects (R-D12). |
| D70 | **(rev 3, SEC-5) Masking is a property of the scope, not of components:** `requireStoreMember` returns `ctx.scope.kind = "impersonation"` with the synthetic membership (§B.8), and every order, lead and customer read repository (operations) returns rows through `maskIfImpersonation(scope, row)` (`src/lib/platform/mask.ts`, P1, frozen at P0: `maskName`, `maskAddress`, note → "Note hidden", the console's `Masked` type), so the tenant UI renders masked names, addresses, landmarks and notes under impersonation with no per-component work; phones were already masked. The console's per-order `pii.reveal` ↑ stays the only unmasking path. | "View as shop" was sold as safe while a support agent with a ticket ref could read every customer's identity and address of any store, unaudited per record (PD35). |
| D71 | **(rev 3, ENGC-6, SEC-8) Write capability is a type:** `WriteScope = StoreScope & { kind: "member" \| "public" \| "system" }`; every repository that inserts, updates or deletes a tenant table types its first parameter `WriteScope`; `platformScope()` and the impersonation seam return scopes whose `kind` is not assignable to it. Lint L6 becomes "a function whose body writes a tenant table must take `WriteScope`; no cast from `StoreScope` to `WriteScope` outside `src/lib/tenancy/seam.ts`". `storeAction`'s runtime refusal stays as the second layer. **Rev 4 (STO C5):** `storeAction` / `storeGuard` called with permissions that are all `WritePermission`s (a key whose def is `write` or `sensitive`, both refused to impersonation) hand `fn` a **`WriteCtx`** (`StoreCtx<WriteScope>`, §E.1), so ctx-taking write functions (`createProduct(ctx, …)`, `createManualOrderV3(ctx, …)`, `saveZones(ctx, …)`) need no cast; the one narrowing lives in `seam.ts`. | Read-only impersonation and platform scopes rested on a JSDoc tag and on permission checks; ~225 call sites make a compile-time guarantee the only reliable one. |
| D72 | **(rev 3, ENGC-13, OPS-15) One order insert:** `createOrderRow(draft, ctx)` is extracted from `src/lib/orders/create.ts:255-300` by **T3 in R1.0** (id retry on `ER_DUP_ENTRY`, `is_test`, `sheet_status`, `rev`, `confirm_state` defaults, `upsell_token_hash`, `order_events` "created", `INSERT IGNORE` outbox, the hooks call) and frozen at P0; the public v2 path, P4's manual v2 path and the R2 v3 paths (`createManualOrderV3` / `editOrderV3`, S1) call it. **Rev 4 (CRIT20, wording):** `newOrderId` lives in `src/lib/db/ids` (T1; `create.ts` imports it at `:25` and calls it at `:256`, `:344`); `create.ts` does not re-export it, and no caller generates an order id outside `createOrderRow` (OPE Q.9c withdrawn). | A second hand-written insert would have had to repeat every R1 change twice; the id-retry loop is easy to get wrong the second time. |
| D73 | **(rev 3, OPS-11; rev 4, CRIT3) One calling window, one shape:** `ops.callingWindow` (overrides and closed dates) is the single source of every calling-hours promise; its weekday container is literally ISO, **`days: Record<IsoWeekday, Range[]>`** (`IsoWeekday = 1 … 7`, 1 = Monday, the numbers of `checkout.calendar.workdays`; never a 0-indexed array), in the setting, in every `windowOverrides[].days` and in **`EffectiveWindow`**, the one exported type (`src/lib/callcenter/window.ts`, P4; JSON-safe, no server import; `export type CallingWindow = EffectiveWindow` is an alias, never a second shape). `callingWindowFor(scope): Promise<EffectiveWindow>` (`window.server.ts`) **never answers `null`**: before the owner saves the window it answers `DEFAULT_WINDOW` (`src/lib/callcenter/defaults.ts`) in the store time zone with **`configured: false`** (`configured` = `ops.callingWindow.savedAt ≠ null`, OPE OD63); the queue runs on it either way, but **every shopper-facing reader** (the thank-you `{when}`, `confirm_hours`, the tracking help, the store checkout, the honesty gate's call claim) renders an hour only when `shopperPromiseAllowed(w)` (= `w.configured`). The pure `isCallable` / `nextCallableAt` / `hoursText` / `shopperPromiseAllowed` feed them (`assist-ty` and the R2 store checkout bundle `nextCallableAt` by source import); one shared fixture `src/lib/callcenter/window.fixtures.ts` (P4) is read by `test:ops`, `test:delivery` and `test:catalog`. `store.confirmation.hours` and `policies.contact.hours` are **removed** from their schemas (no mirrors: one key, one editor, `CallingWindowEditor`, mounted by P3's "After the order" card, whose "Use these hours" sets `savedAt`). | Three independent hours settings with two weekday conventions let the thank-you page promise a call the ladder never makes; rev 3 still had a 7-slot array called "ISO" in operations, a `Record<1..7>` in landing and a nullable stub (CRIT3), and a default window must never become a promise nobody made (owner rule: never invent). |
| D74 | **(rev 3, OPS-9) Sheets is the explicit R1 carrier loop:** `orders.tracking_ref` and `orders.carrier_label` (0005, operations), pulled from the optional "Tracking" / "Transporteur" sheet columns in R1 (the two IN-09 rows move to P5 R1), shown on the drawer, the slips, the timeline and the tracking page; a **Carrier CSV** export under `shipments.write` with a fixed column picker (`ops.carrierCsv`, D38-compliant, `;` + BOM, audited `orders.carrier_exported`). Manifests, status import and `shipments` stay R2. | A landing-only seller ships every day in R1 and had nowhere to store a tracking number or to build the carrier's upload file. |
| D75 | **(rev 3, OPS-13) Per-city delivery fees on landing pages ship in R2, not R3:** LP-16 moves to the R2 contract step (`landing-v3` entry = a fork of `entry.ts` plus one zone lookup, runtime config v3 with `zones: ZoneTable`, server shipping by zone for `runtime_v = 3` versions; the PHP template v3 may lag to R3 with the export refusing "charge by city" pages, `export:runtime_v3_unsupported`); attached landings created from a product in `both` mode start on v3; until a page is on v3 the checklist warns `delivery:fee_mismatch` when zones carry fees that differ from the page fee for the top-5 cities. | A `both` store would otherwise quote two fees for one city; "Casa 20 / autres villes 35-45" is the Moroccan norm a flat fee cannot express. |
| D76 | **(rev 3, SEC-18) Brand protection is live, not only at signup:** `brandTokens()` + active `protected_brands` run on the store name, legal name and WhatsApp display name at every write (`brand_exact` refuses for non-staff with `brand_protected`, `brand_near` writes a console flag); a health rule `platform:brand_term_live` (P1) runs **at least nightly, on every health computation of the store** (rev 4, PLA Q4.4) over live page titles, headlines and policy text; the publish gate `honesty:password_field` (P3; it exports its field-pattern list and the storefront's `storefront:form_field_foreign` imports the same list) refuses any `<input type="password">`, card-number pattern or OTP field; every public page carries "Report this store" → `/report/<handle>` (platform host, insert-only `abuse_reports` in **0005**, triage UI R3). **Rev 4 (CRIT15):** the link is one absolute URL from `reportUrl(store, path)` (§C.6) carried in the render context as `links.report`; it is drawn by **P6's landing footer section** (`legalLinks(ctx)`), by the **Shell fallback** in `document.tsx` when a document has no footer, by **P3** on the thank-you, tracking and legal pages and by **S1** in the store chrome (R2), exactly once per document; it is absent in every export. | A store approved as "Boutique Nour" could become "CIH Bank · Vérification" with a password form in minutes; R1 had no abuse report and no live check. |

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

Mode-switch safeguards (rev 2; LAN Q34, STO-R17):
- `opts.landingInStoreMode` is read from the store setting `landing.inStoreMode` (§D.10); the seam passes it from the
  cached settings so `/s/<h>/<slug>` of a `store`-mode shop keeps answering while the toggle is on.
- The `store.mode` action (P2's `settings/general`) first calls `landingModeSwitchPlan(scope): Promise<{ livePages:
  number; views7d: number; suggestInStoreMode: boolean }>` (P3, `src/lib/landing/mode-plan.ts`) and shows the plan;
  switching to `store` with live landing pages sets `landing.inStoreMode = true` unless the owner unticks it, so ad
  traffic never hits a 404 after a mode change.
- Switching to `store` / `both`, and the `pending → active` transition of such a store, call
  `ensureTemplateSet(systemScope(ctx, storeId))` (S1, `src/lib/storefront/templates.server.ts`, R2; a typed no-op stub in
  R1) so the store page kinds exist before the first request reaches them. Switching to `store` / `both` requires
  `stores.category` (rev 3, ENGP-25: design's store-level niche key falls back to `general` otherwise).
- **Onboarding in `store` mode creates no landing page (rev 3, OPS-14; PLA-§22.2 PD60 rev 3, STO-§6.7):** the reveal
  shows three PDP folds built synchronously by `productAsPageDoc(product, { …sctx, direction })` (S1, R2), the action
  creates the product and the theme draft (`createProduct(ctx, { facts })`, `setThemeDraft(ctx, direction)`: they take
  the `WriteCtx` because they write and audit, rev 4 STO C5; frozen at the R2 contract step), and `landing.inStoreMode`
  stays `false`. Should any path create a landing page for a
  `store`-mode shop, it sets `landing.inStoreMode = true` in the same transaction (audit `store.landing_settings.updated`,
  reason `onboarding`) and the `done` step says so ("Your first page is a sales page; your store home is being built"),
  so a saved draft is never hidden behind a 404. The UX-01 acceptance list carries both cases.

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
| `integrations.manage` | w | s | R1 | | Sheets, CAPI/Events tokens, Telegram, WhatsApp Cloud API connection (R3), webhooks (R2), carriers (R2), export key; **replay** of a store's dead outbox deliveries (`replay(ctx, id)`, §H.1; audit `integrations.outbox.replayed`, bucket `s:<sid>:replay:<uid>`, OPE-§28). Click-to-chat templates and quick replies sit under `callcenter.configure` (OPE Q.3e) |
| `ai.use` | w | | R1 | | run generators and rewrites (cloud chip when enabled); Director passes count against the store's daily pass caps |
| `ai.manage` | w | | R1 | | store AI mode, Director mode (`auto` / `ask` / `off`), deep pass on/off, brand voice, memory |
| `ai.assist` | | | R3 | | copilot read tools, insights, approved call-script drafts (AI R19); never generation |
| `campaigns.write` | w | | R1 | landing | create, compile, pause and share Campaign Kits; create short links (SF-01, LP-12). Granted with `pages.write` |
| `health.snooze` | w | | R1 | | snooze a Store Health issue for 7 days (SF-03); audited |
| `orders.read` | | | R1 | | orders visible to the member (agents: their queue only) |
| `orders.read_all` | | | R1 | | every order of the store |
| `orders.write` | w | | R1 | | status moves, attempts, notes on visible orders |
| `orders.create` | w | | R1 | | manual / phone / DM orders (OP-08) |
| `orders.edit` | w | | R1 | | edit lines, quantities, address after creation (re-priced, audited) |
| `orders.assign` | w | | R1 | | assign, reassign, release leases |
| `orders.force_status` | w | | R1 | | illegal-transition override with a reason (OP-01) |
| `orders.reveal_phone` | | s | R1 | | unmask a phone (writes `phone_revealed`, OP-07) |
| `orders.export` | | s | R1 | | CSV export of orders and leads (rev 3, OPS-22: granted to `manager` too, who prepares the call-center and carrier files; audited, sensitive stays) |
| `leads.read` | | | R1 | | abandoned-lead inbox |
| `leads.write` | w | | R1 | | lead statuses, contact attempts |
| `customers.read` | | | R1 | | customer profiles and history (phones masked unless `orders.reveal_phone`) |
| `blocklist.write` | w | | R1 | | block / unblock phones and IPs |
| `callcenter.configure` | w | | R1 | | calling window, retry ladder, scripts, quick replies, assignment mode |
| `agents.self` | w | | R1 | | own presence, "Next order", own KPIs and (R2) earnings |
| `catalog.read` | | | R2 | catalog | products, collections, inventory |
| `catalog.write` | w | | R2 | catalog | edit the catalog |
| `storefront.write` | w | | R2 | storefront | store theme, menus, store pages |
| `shipments.write` | w | | **R1** | | ship-axis moves and order slips in R1 (Sheets statuses, manual moves; OPE Q.3a), **the Carrier CSV export and the tracking / carrier columns (rev 3, D74; the export needs a fresh step-up, §B.7, rev 4)**; shipments, manifests, carrier imports in R2 |
| `finance.read` | | | **R1** | | Profit lite screen in R1 (SF-04, flag `finance_lite`); full accounting screens R2 (OPE Q.3b) |
| `finance.write` | w | | **R1** | | R1: item costs, packaging, manual carrier fee per zone, manual ad spend; R2: expenses, remittance imports |
| `commissions.manage` | w | | R2 | | commission rules |
| `payouts.approve` | w | s | R2 | | approve and mark payouts paid |
| `reviews.moderate` | w | | R3 | | hide/show verified reviews |
| `coupons.manage` | w | | R3 | storefront | create, pause and delete coupons (STO-R21) |
| `experiments.manage` | w | | R3 | | create, start, stop and apply experiments (LAN Q29) |
| `support.grant` | w | s | R3 | | grant platform support write access (PL-15) |

#### A.3.2 Store role matrix

✓ = granted. `agent*` = only orders in the agent's own queue (assigned to or claimed by them). **R1.0 interim (T4
review, CCR r1.0-m-8):** the queue (assignment, claims, `agent_profiles`) arrives with P4, which adds the `assignee`
predicate to the order and lead repositories for the `OWN_QUEUE_KEYS` (`ownQueueOnly`, `src/lib/auth/permissions.ts`);
until then an agent works the store's whole order and lead list, as the single-tenant `agent` role did, and still holds
none of `orders.read_all`, `orders.export`, `blocklist.write` or any page, settings or integrations key.

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
| pages.write, pages.publish, media.write, export.create, brand.write, ai.use, campaigns.write | ✓ | ✓ | | ✓ | | | | |
| pixels.manage, integrations.manage, ai.manage, health.snooze | ✓ | ✓ | | | | | | |
| ai.assist (R3) | ✓ | ✓ | ✓ | ✓ | | | | |
| orders.read | ✓ | ✓ | ✓ | | ✓* | ✓ | ✓ (masked) | |
| orders.read_all | ✓ | ✓ | ✓ | | | ✓ | ✓ | |
| orders.write | ✓ | ✓ | ✓ | | ✓* | ✓ (ship axis) | | |
| orders.create, orders.edit | ✓ | ✓ | ✓ | | ✓* | | | |
| orders.assign, orders.force_status, blocklist.write, callcenter.configure | ✓ | ✓ | ✓ | | | | | |
| orders.reveal_phone | ✓ | ✓ | ✓ | | ✓* | ✓ | | |
| orders.export (rev 3: + manager, OPS-22) | ✓ | ✓ | ✓ | | | | | |
| leads.read, leads.write | ✓ | ✓ | ✓ | | ✓* | | | |
| customers.read | ✓ | ✓ | ✓ | | ✓* | ✓ | ✓ (no phones) | |
| agents.self | ✓ | ✓ | ✓ | | ✓ | | | |
| catalog.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| catalog.write, storefront.write | ✓ | ✓ | | ✓ | | | | |
| shipments.write (R1 for owner, admin, manager; logistics R2) | ✓ | ✓ | ✓ | | | ✓ | | |
| finance.read (R1 owner, admin; accountant R2) | ✓ | ✓ | | | | | ✓ | |
| finance.write (R1 owner, admin; accountant R2) | ✓ | ✓ | | | | | ✓ | |
| commissions.manage, payouts.approve | ✓ | ✓ | | | | | | |
| reviews.moderate | ✓ | ✓ | | ✓ | | | | |
| coupons.manage (R3) | ✓ | ✓ | | | | | | |
| experiments.manage (R3) | ✓ | ✓ | | ✓ | | | | |

Hard rules no permission can override: nobody below `owner` can change the mode, close the store, grant `owner` or
remove the last owner; a member can't change their own role; `invitableRoles(owner)` = all active roles,
`invitableRoles(admin)` = roles with rank < 80, `invitableRoles(manager)` = `["agent"]`, everyone else `[]`.
The **impersonation** membership (§B.8) has every non-write, non-sensitive key and nothing else, and reads customer
rows **masked** (D70: `scope.kind = "impersonation"` makes every order, lead and customer repository mask name,
address, landmark, note and phone at the boundary).

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
| `stores.create` (create an internal or seeded store from `/admin/stores/new`) | ✓ | | | | |
| `orders.lookup` (masked order lookup by id or phone, `/admin/orders`; writes `platform.order.lookup`) | ✓ | ✓ | | | |
| `pii.reveal` (one order) | ✓ | ✓ | | | ↑ |
| `abuse.handle` (R3: triage and action abuse reports) | ✓ | ✓ | ✓ | | |
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
  coupons: { kind: "feature", default: true, release: "R3" }, reviews: { kind: "feature", default: true, release: "R3" },   // STO-R21
  campaigns_max:          { kind: "limit", default: 20 },                      // live or paused Campaign Kits per store (SF-01)
  short_links_max:        { kind: "limit", default: 200 },                     // LP-12
  remove_platform_badge: { kind: "feature", default: false },
} as const satisfies Record<string, EntitlementDef>;
export type EntitlementKey = keyof typeof ENTITLEMENTS;
export type EntitlementValue<K extends EntitlementKey> = (typeof ENTITLEMENTS)[K]["kind"] extends "limit" ? number | null : boolean;

export function entitlement<K extends EntitlementKey>(scope: StoreScope, key: K): Promise<EntitlementValue<K>>;
export function entitlements(scope: StoreScope): Promise<ResolvedEntitlements>;        // all keys, one query, cached 30 s
export function assertFeature(scope: StoreScope, key: FeatureKey): Promise<void>;      // throws EntitlementError
export function assertWithin(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void>; // throws QuotaError (no charge)
/** atomic (§D.7); `allowOver` drops the limit predicate (reconciling a real cost above its reservation, AI R4) */
export function chargeUsage(scope: StoreScope, metric: UsageMetric, delta: number, opts?: { allowOver?: boolean; limit?: number | null }): Promise<ChargeResult>;
export function refundUsage(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void>;
export type PlatformUsageMetric = "ai_cost_micros" | "ai_batch_items" | "mail_sent" | "push_sent"
  | "ai_cost_micros_pending" /* rev 3, SEC-1 / AI R28: the pending stores' slice of the monthly AI cap, period YYYY-MM */
  | "pending_stores"         /* rev 3, D69: sandboxes created per platform day, period YYYY-MM-DD */
  | "pending_media_bytes";   /* rev 3, D69: one disk budget shared by every pending store, period "total" */
export function chargePlatformUsage(metric: PlatformUsageMetric, period: string, delta: number, opts?: { allowOver?: boolean; limit?: number | null }): Promise<ChargeResult>;   // platform_usage, same statements
export function refundPlatformUsage(metric: PlatformUsageMetric, period: string, delta: number): Promise<void>;        // rev 3: the transition out of `pending` refunds the store's share of pending_media_bytes
export function invalidateEntitlements(storeId: string): void;
export class QuotaError extends Error { readonly metric: UsageMetric; readonly limit: number; readonly used: number }
export class EntitlementError extends Error { readonly key: FeatureKey; readonly reason: "plan" | "state" | "release" | "kill" }
```

Resolution, per key: `override (not expired) > boost (not expired) > plan.limits/features[key] > ENTITLEMENTS[key].default`,
then **`applyStateCap(status, key, value)`** (§A.5.2), then platform kill switches (`publishing_enabled`,
`uploads_enabled`, `ai_generation_enabled`, `sheets_sync_enabled`, `capi_enabled`, `signups_enabled`,
`platform_read_only`) force the matching features to `false` (§H.8). Usage metrics (`UsageMetric`): `media_bytes`,
`pages`, `products`, `members`, `agents`, `webhooks`, `custom_domains`, `campaigns`, `short_links` (gauges, period
`total`), the monthly counters `exports`, `ai_credits`, `orders` and **(rev 3, AI R28)** `ai_credits_director`
(period `YYYY-MM` in the store's timezone; the Director's share of the month, limit `ai_credits_month ×
platform_ai.caps.directorSharePct / 100`, default 60 %, so copy always keeps ≥ 40 %) and the **daily** counter
`ai_credits_day` (period `YYYY-MM-DD` in the store's timezone; `store_usage.period` is **created as `varchar(10)` in
0004**, rev 3 ENGC-17: no later `MODIFY`). The `ai_credits_day` limit is computed by the ai part, not an entitlement key:
`max(floor, ceil(ai_credits_month × platform_ai.caps.storeDailyCapPct / 100))` with `floor` = 50 for approved stores and
`platform_ai.caps.pendingDailyFloor` (default **10**) while `pending` (rev 3, AI R30), passed through `opts.limit`. The
`products` gauge counts products with status `draft` or `active` (STO-R20); the **`agents` gauge counts members whose
role is `agent`** (rev 3, OPS-23: charged at invite acceptance or on a role change to `agent`, refunded on the reverse;
`agent_profiles` rows of other roles never count). A `UsageMetric` is `{ metric, period }` (§D.7). The UI turns `QuotaError` / `EntitlementError` into the premium "limit reached" sheet (platform.md), never a
generic error. **Orders are never refused for a quota**: `take_orders` is `false` only through a lifecycle state
(§A.5.2); no kill switch touches it, and `platform_read_only` keeps orders flowing (§H.8).

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

`src/lib/tenancy/lifecycle.ts`: `transitionStore(ctx: PlatformCtx | StoreCtx | SystemCtx, storeId, to, { reason, note, notify?: { showNote: boolean } })`
validates the edge against `ALLOWED_TRANSITIONS`, writes the row with a compare-and-set on the old status, writes the
audit row, sends **exactly one** notification through `notify()` (§I.4) to the store's owners and admins with the
kind of the edge (PLA Q.27: `pending→active` `signup.approved`, `pending→rejected` `signup.rejected`, `→restricted`
`store.restricted`, `→suspended` `store.suspended`, `restricted/suspended→active/restricted` `store.restored`,
`→closed` `store.closed`, `closed→previous` `store.reopened`, `closed→scheduled_deletion` `store.deletion_scheduled`,
`scheduled_deletion→closed` `store.deletion_cancelled`; `vars: { reason }`, `text` = the staff note only when
`notify.showNote` is true; callers never send a second one), calls `invalidateStore(storeId)` (store row cache, render
cache, entitlements, settings, §E.6), calls `markHealthDirty(storeId)` (§I.7), for `restricted`/`suspended`/`closed`
releases agent leases (`releaseAllLeases`, OPE Q.8), for `pending → active` of a `store`/`both` store calls
`ensureTemplateSet` (§A.2), and for **any transition out of `pending`** refunds the store's `media_bytes` gauge from the
shared `pending_media_bytes` counter (rev 3, D69; `usage.reconcile` recomputes the counter nightly from the gauges of
stores still `pending`). A purged store keeps a **tombstone** row:
`status='purged'`, `handle=NULL`, `name='(purged)'`, every other column kept for the audit trail; the handle moves to
`store_handle_history` (quarantine 180 days, R-D53).

#### A.5.2 State caps (applied by `applyStateCap`)

| Key | pending | active | restricted | suspended | closed | scheduled_deletion / purged / rejected |
|---|---|---|---|---|---|---|
| publish, take_orders | false | plan | false | false | false | false |
| sheets, pixels_capi, telegram, webhooks, php_export, custom_domain, api_keys | false | plan | plan (existing orders only) | false | false | false |
| cloud_ai, invites | plan | plan | plan | false | false | false |
| ai_credits_month | min(plan, 100) (AI R5: the sandbox may use Cloud AI for the onboarding wow); **rev 3 (D69):** every pending store's call also charges the platform slice `ai_cost_micros_pending` (limit `monthlyUsd × caps.pendingSharePct / 100`, default 10 %) and the daily floor is 10 credits, so sandboxes can never exhaust the cap approved stores pay for (exhaustion answers `quota_platform_pending` to pending stores only) | plan | plan | 0 | 0 | — |
| media_bytes | **two-tier (rev 3, D69):** `applyStateCap("pending", { submitted })` = min(plan, `platform.signup.pendingMediaMiBBeforeSubmit` MiB; default 20) until the store's `signup` review row has `submitted_at`, then min(plan, `platform.signup.pendingMediaMiB` MiB; default 100); every upload also charges the shared `pending_media_bytes` budget first (§G.4 step 4) | plan | plan | plan (no uploads: seam is read-only) | plan | — |
| members_max | min(plan, `platform.signup.pendingMembersMax`; default 2) | plan | plan | plan | plan | — |
| exports_month | 0 | plan | plan | plan | plan | — |
| campaigns_max, short_links_max | plan (kits compile and links mint in the sandbox; `/go/<code>` answers the neutral 404 while pending, like every public route) | plan | plan | plan (read-only) | plan | — |

The pending caps read the cached platform setting (PLA Q.8, PLA-§2.4 keys `signup.pendingMediaMiB`,
`signup.pendingMediaMiBBeforeSubmit`, `signup.pendingMediaTotalMiB`, `signup.pendingStoresPerDay`,
`signup.pendingMembersMax`), so the owner tunes the sandbox without a deploy; the revision-1 defaults are unchanged
and the rev 3 ceilings (D69) sit beside them.

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
| `/invite/staff/<token>` | accept a **staff** invite (PLA Q.4: `staff_invites`, role admin/support/analyst; creates the account with `createAccount()` and sets `platform_role`, never a store) | public; token; area `auth` |
| `/reset/<token>` | set a new password from a reset link (§B.9) | public; token |
| `/kit/<token>` | read-only Campaign Kit share page for a media buyer or designer without an account (SF-01, LAN Q12); **platform host only**, store hosts 404 | public; token (`resolveKitShare`, §E.2); `p:kit:ip:<h>` 60/10 min |
| `/report/<handle>` (rev 3, D76, P1) | "Report this store": reason, optional details and contact, one `abuse_reports` insert (`recordAbuseReport`, PLA-§24.2); answers the same thank-you whether the handle exists or not (no oracle); **platform host only** (the footer link is absolute, `platformOrigin() + "/report/<h>"`); store hosts 404 like `/kit` | public; `publicAction` with Turnstile `when-configured`; `p:report:ip:<h>` 5/h, `p:report:store:<h>` 20/day |
| `/app/account/**` | profile, password, 2FA, sessions/devices, admin locale, on-device AI tier, **`/app/account/danger`** (rev 4, PLA Q4.7: delete my account through `deleteUserAccount`, refused with `owns_store` while the user owns a non-purged store) | `requireUser()` (no store) |
| `/app/new` | create another store (onboarding, UX-01) | `requireUser()`; `p:store:create:<userId>` 3/day |
| `/app/manifest.webmanifest` | the installable dashboard's manifest (UX-07, PLA Q.26): a non-HTML path of area `app`, no nonce headers, `Content-Type: application/manifest+json`; **public, no session, `Cache-Control: public, max-age=3600`** (rev 3, ENGC-24, SEC-25: browsers fetch a manifest without credentials, and it carries only `platform.brand.name`) | none |
| `/admin/setup` | first super_admin + first store (§B.11) | gate + `SETUP_TOKEN`, only while no `super_admin` exists |

All of them render with the platform nonce CSP, `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, set by
the proxy (§C.3). **Referrer-Policy (rev 3, ENGC-16):** `same-origin` on `/invite/*`, `/reset/*`, `/report/*` and
every other auth page (they post Server Actions before hydration; under `no-referrer` browsers serialise a same-origin
form POST's `Origin` as `null` and Next's action check answers 500, `src/lib/security/headers.ts:106-109`; the token is
a path segment and `same-origin` sends nothing cross-site); `no-referrer` stays only on `/kit/*`, which has no actions
(its share actions are fetch-based). `qa:headers` asserts both and `qa:action-replay` proves it (rev 5, CRIT2-11: the
rev 3 case "the invite form submitted with a `null` Origin must succeed" was impossible, since §C.9 refuses anything but a
real Origin host and `checkSameOrigin` answers false for `origin === "null"`, `src/lib/security/csrf.ts:56`): the invite
form **posted before hydration under `Referrer-Policy: same-origin` carries the page's real Origin and succeeds**, and a
replay with an explicit **`Origin: null` is refused with a 403, never a 500** (the proxy answers it, §C.3 step 4). Forms are server actions wrapped in `publicAction` (§E.2): Turnstile check (when configured), burst
limit, DB buckets, generic answers.

**Device marker** (PLA Q.3; **set by the proxy, T3** — rev 3, SEC-12: `cookies().set` works only in actions and route
handlers, so a page response cannot set it, and a marker set only after the first submit would miss the signup it
serves): on the platform host, every area-`auth` GET response without `__Host-sgd` gets it from the proxy (the proxy
already issues `__Host-csg`), 128-bit random, base64url, `HttpOnly; Secure; SameSite=Lax; Path=/`, 400 days; `publicAction`
sets it as a fallback when a form arrives without one. T2 only reads it. It is passed as `SignupRiskInput.deviceId`;
signup writes `identity_links` rows of kind `device` and `net` with `source = 'signup'`, every login `INSERT IGNORE`s
the same kinds with `source = 'login'` (≤ 20 rows per user and kind). The marker carries no user data; a cleared cookie
only weakens the duplicate signal. In P mode the marker is also sent on `/s/<h>/**` requests (Path=/) and is never read
there; the proxy's store-class rewrite deletes the Cookie header anyway (§C.3).

### B.2 Signup (PL-01, PL-02, PL-03, TN-05)

Signup modes (platform setting `platform.signup.mode`): `closed` (no form; console invites only) · `invite` (a
platform invite code is required, §B.6) · `approval` (anyone; the store starts `pending`) · `waitlist` (e-mail + phone
only, saved to `waitlist`; staff promote entries to invites) · `open` (approval mode, but the store starts `active`
when `autoApprove(mode, score, { trustedCreator, setting })` says so, PLA Q.9). Default when no value is stored:
`invite` if S mode is off, `approval` if it is on **and the domain check V13 has passed** (§C.10 step 3: a configured
`platform_turnstile`, the new hostnames and a verified test token), else `invite` (D9 rev 5, CRIT2-13; one rule, rev 6). **`approval` and `open` require a configured `platform_turnstile`:** the console's mode write is refused
(`turnstile_required`) without it, and `signupAction` treats a stored `approval` / `open` value with no widget (the
widget deleted later) as `invite` and raises the platform alarm `signup_unguarded`.

Form fields: name, e-mail, password (policy `checkPasswordPolicy`, `src/lib/auth/password.ts`), phone (E.164 via
`libphonenumber-js`, used for identity links and the risk score, never shown to other tenants), store name, handle
(live availability check), mode (R1: landing), market (default MA), invite code (invite mode), acceptance of the
current ToS/Privacy/AUP versions (§D.5 `legal_acceptances`).

Order of checks in `signupAction` (`src/app/(public)/signup/actions.ts`, logic in `src/lib/auth/signup.ts`):
1. `burstLimit("signup", ip)` (in memory) → `rateLimit(p:signup:ip:<ipHash>, 5, 3600)`.
2. Turnstile (platform widget, `platform_turnstile`; **always configured in `approval` and `open`**, rev 5 CRIT2-13): **missing
   or invalid → refused in `approval` and `open`** (rev 3, D69 / SEC-1, SEC-22: anyone may sign up in those modes, so the human check is a gate, not a
   score); scored +20 only in `invite` mode, where the code already gates (PL-03).
3. Zod validation; handle rules (§C.7); invite code (invite mode) checked with `SELECT … FOR UPDATE` inside the
   transaction below.
4. scrypt hash through the semaphore (§B.3).
5. `scoreSignup(input: SignupRiskInput, deps?: Partial<SignupRiskDeps>): Promise<SignupScore>` (`src/lib/platform/signup-risk.ts`,
   contract widened per PLA Q.9: `SignupScore = { score: 0-100, flags: SignupFlag[], band: "fast" | "review" | "hold" |
   "reject_candidate", signals: SignupSignals }`, the `scoreRisk` pattern of `src/lib/orders/risk.ts:42`) with a 2 s
   budget (MX lookup fail-open); signals detailed in PLA-§3.4. `signupAction` and the `/app/new` action pass the full
   input (`formMs`, `deviceId`, Turnstile state, `via`, invite label). The R1.0 stub returns `{ score: 0, flags: [],
   band: "review", signals: { v: 1, flags: [], band: "review", inputs, cluster: { users: 0, banned: 0, kinds: [] },
   partial: false, ms: 0 } }` (§K.1).
6. **Daily sandbox ceiling (rev 3, D69):** when the store would start `pending`, `chargePlatformUsage("pending_stores",
   <platform day YYYY-MM-DD>, 1, { limit: platform.signup.pendingStoresPerDay })`; a `QuotaError` falls to the
   `waitlist` behaviour (the account is **not** created; a `waitlist` row with `source = "cap:<day>"`, the honest
   message "Sign-ups for today are full; we keep your place") and the console counter `staff.signup_capped` fires once
   per day. Auto-approved paths (`active` at creation) skip the ceiling.
7. One transaction, **`INSERT users` first** (rev 3, SEC-22: a duplicate e-mail rolls back before any store row or
   scrypt hash is spent on a store), then `stores` (status `pending`, or `active` when `autoApprove()` is true or the
   invite has `auto_approve`; auto paths write the review row `approved` with `reason_code` `auto_invite` / `auto_open`
   / `auto_trusted`), `store_members` (owner), `signup_reviews` (score, band, signals), `identity_links` (`email_norm`,
   `phone`, `net`, `device`), `legal_acceptances`, consume the invite code (**one conditional `UPDATE platform_invites
   SET uses = uses + 1 WHERE id = ? AND uses < uses_max AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at >
   ?)` with `affectedRows === 1` as the only success path**, rev 3 SEC-24). A duplicate e-mail or handle rolls back with
   a generic answer: "These details can't be used to create an account. If you already have one, sign in." (no field
   named). **Rev 5 (CRIT2-12; PLA PD68):** when step 6 charged `pending_stores` and this transaction rolls back for any
   reason (duplicate e-mail or handle, a consumed invite code, a DB error), `signupAction` calls
   `refundPlatformUsage("pending_stores", <the same platform day>, 1)` after the rollback (T1's function), so a failed
   signup never burns one of the day's sandboxes; a `test:db` case asserts that a duplicate e-mail leaves the day's
   `pending_stores` counter unchanged (`scripts/qa/platform-check.ts`, PLA-§O.2 item 18, from P1's merge; T2's R1.0
   signup carries the refund from its own merge, the case only proves it). **Accepted residual risk (rev 3, SEC-22):** because the handle is checked live, the generic failure on a
   fresh handle reveals that the e-mail exists; it is bounded by `p:signup:ip` 5/h and the Turnstile gate of step 2 and
   recorded here rather than hidden.
8. Session created (mfaPassed true: tenants have no mandatory 2FA, §B.7), redirect to `/app/<handle>` onboarding.

A `pending` store is a sandbox (§A.5.2): everything except publish, orders and integrations works at once (R-D12),
inside the D69 ceilings.

### B.3 Login (TN-05; AUTH-22, AUTH-25, AUTH-26, AUTH-27)

- **Buckets** (all `p:`): `p:login:ip:<ipHash>` 10 / 15 min (all outcomes) · `p:login:acctnet:<hmac(email|netHash)>`
  5 / 15 min · `p:login:acct:<hmac(email)>` 20 / 15 min. Past 3 failures in either account bucket, the form requires a
  Turnstile token (the server answers `{ challenge: true }`; the platform widget renders); past the account-network
  limit the answer is the generic "Too many attempts, wait a few minutes", **for that network only**. **The
  account-wide bucket `p:login:acct` only ever raises the challenge and never refuses** (rev 3, SEC-22: a refusal at 20
  would let five networks lock any account out of every store again, the AUTH-25 problem D13 closes); refusals come
  from `p:login:ip` and `p:login:acctnet` only (`test:security`). No hard account lock; `failed_logins`/`locked_until`
  are no longer read or written (dropped in 0006).
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
// role "agent" → "/app/<h>/queue" instead of "/app/<h>" (after an invite and from a bare "/app/<h>", OPE Q.13c)
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
  (`assertWithin`), inside a transaction that locks the store's member rows. **Consumption is one conditional
  statement (rev 3, SEC-24):** `UPDATE store_invites SET accepted_at = ?, accepted_by = ? WHERE id = ? AND accepted_at IS
  NULL AND revoked_at IS NULL AND expires_at > ?` runs **before** the membership insert in the same transaction and
  `affectedRows === 1` is the only success path, so two concurrent accepts from two accounts yield exactly one
  membership (DB test: 10 parallel accepts → 1 row). The same shape applies to `staff_invites` (`accepted_at`),
  `password_resets` (`used_at`) and `platform_invites` (`uses < uses_max`, §B.2 step 7).
- **Bound to the e-mail** (D10): a signed-in user whose e-mail differs sees "This invitation is for s•••@gmail.com";
  a visitor without an account gets a sign-up form with the e-mail locked; an existing account must sign in first.
- Creating an invite for an e-mail that already has an account, a membership or a pending invite answers exactly the
  same as for a new e-mail (no enumeration); an existing member gets no second membership (accept is idempotent).
- Accepting writes `store_members` (status active), audit `store.member.accepted`, a notification to the inviter.
  Token pages send `Referrer-Policy: same-origin` (rev 3, ENGC-16: they post Server Actions) and are `noindex`.
- R1 hands the link over with copy / WhatsApp share buttons; R2 also sends it by e-mail through the Mailer (§B.10).

### B.6 Platform invites and waitlist (PL-01)

`platform_invites` (code hash, label, `uses_max`, `uses`, `expires_at`, `auto_approve`, created by staff): the code is
shown once (`SG-` + 12 Crockford chars, ~60 bits; brute force is bounded by `p:signup:ip` and Turnstile). `waitlist`
rows are promoted to single-use invites by staff (copy-link in R1). Both live in console Settings → Signup.

### B.7 Two-factor policy

- **Platform staff: mandatory.** `requirePlatform()` refuses a session unless the user has `platform_role ≠ none`,
  `totpEnabled` and `mfaPassed`, plus the console gate cookie, the IP allowlist and (from the domain move) `ADMIN_HOST`
  (D44). A user given a platform role without TOTP is sent to `/app/account/two-factor?for=console` and cannot open the
  console before enrolment. **IP allowlist behind Cloudflare (rev 3, SEC-14):** `allowlistAddress()`
  (`src/lib/auth/gate.ts:99-114`) matches the right-most `X-Forwarded-For` hop today; after the move that hop is a
  Cloudflare edge address and the allowlist would fail closed on domain day. From R1.0 it reads: when
  `BEHIND_CLOUDFLARE=1` **and** the right-most public hop `isCloudflareIp()`, use `CF-Connecting-IP`; otherwise the
  right-most public hop as today; never `x-sg-ip` (the console never runs on store hosts). `test:security` covers both
  branches and §C.10's checklist says "verify the console allowlist still admits you before switching nameservers".
- **Step-up:** permissions in `STEP_UP_PERMISSIONS` (↑ in §A.3.3) need `sessions.step_up_at` within the last 5
  minutes; `platformAction` answers `{ ok: false, error: "step_up" }` and the UI shows the TOTP sheet, which calls
  `stepUpAction(code): Promise<ActionResult<{ until: string }>>` (bucket `p:mfa:stepup:<userId>` 5 / 15 min).
  `PlatformCtx.stepUpUntil: Date | null` (= `step_up_at + 5 min`) feeds the console's "Verified · 4:12" chip (PLA
  Q.32). **Tenant step-up ladder (rev 3, SEC-17):** the store-side sensitive actions need a fresh step-up
  (`sessions.step_up_at` within 5 minutes) **whether or not the user has TOTP**: a TOTP code when enrolled, else a
  password re-entry ("sudo mode", `stepUpWithPasswordAction(password)`, bucket `p:password:<userId>`, through the scrypt
  semaphore). Required for `store.export`, `orders.export`, **the Carrier CSV route `/api/app/<h>/orders/carrier-csv`**
  (rev 4, OPE OD64: D74's file carries the same full phones under `shipments.write`), `store.close`, secret writes under
  `integrations.manage` (Sheets, CAPI tokens, Telegram, export key), `members.manage` role changes to `admin` or `owner`
  and (R2) the accounting period close / reopen (`finance.period_closed|period_reopened`); the audit row names the
  method (`meta.stepUp: "totp" | "password"`). Exports stay allowed in read-only states. A stolen 30-day `__Host-cs`
  cookie alone can therefore no longer pull every customer of a store. **Signature (rev 4, PLA Q4.8):**
  `stepUpWithPasswordAction(password: string): Promise<ActionResult<{ until: string }>>` (T2, `src/lib/auth/**`; the same
  result shape as `stepUpAction`), refused under impersonation with `impersonation_read_only`; `StoreCtx.stepUpUntil:
  Date | null` (§E.1) feeds the tenant sheet's "Verified · 4:12" chip as `PlatformCtx.stepUpUntil` does for staff.
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

- Start (`stores.impersonate`; support must give `ticketRef`, ≤ 60 chars): refuses a store the staff member is an
  active member of (`impersonation_member`), refuses `scheduled_deletion` / `purged` stores (`impersonation_state`),
  ends an active impersonation of the same session (`ended`) first (PLA Q.31); then inserts `impersonation_sessions`,
  sets `sessions.impersonation_id` on the staff member's **own** session, notifies the store
  (`store.impersonation_started`, notification centre + its Activity tab; e-mail from R2), audits
  `platform.impersonation.started` with `store_id`, and redirects to `/app/<h>`. Default 30 minutes, maximum 60; no
  silent extension (a renewal is a new row and a new audit).
- While active and only for that store, `requireStoreMember` returns a synthetic membership `{ role: "viewer",
  synthetic: "impersonation", permissions: every key with write = false and no sensitive flag }`, `ctx.impersonation`
  and **`ctx.scope.kind = "impersonation"`** (rev 3, D70). `storeAction` / `storeGuard` refuse every write permission
  with `impersonation_read_only`, and the refusal itself is audited; the type system refuses the scope to every write
  repository (D71). Secrets stay masked, phone reveal and exports are refused (sensitive), account pages show the staff
  member's own account, and **customer names, addresses, landmarks and notes are masked at the repository boundary**
  (`maskIfImpersonation(scope, row)` from `src/lib/platform/mask.ts`, P1, frozen at P0; identity for every other
  scope kind): the order list, drawer, timeline, leads, customers and search render `Masked` values with no
  per-component work, exactly as the console does (PLA-§7.2, R-D16). The ribbon's "Open profile" leads to the console's
  per-order `pii.reveal` ↑, the only unmasking path. The §F.1 attack suite asserts that the HTML and RSC payload of
  every tenant route under an impersonating session contain none of the customer canaries.
- The tenant shell renders a full-width violet ribbon (§I.4) "Viewing <store> as support · read-only · mm:ss left ·
  End". Expiry is checked on every request; an expired row ends itself (`endImpersonation(…, "expired")`).
- Every audit row written during impersonation has `actor_kind='impersonation'`, `user_id = staff`,
  `impersonator_id = staff`, `store_id = target` (both identities, R-D14).
- **(rev 2.1, PLA-§Q.1 note 2)** The ribbon's "Add a note" (`addImpersonationNoteAction`, P1, PLA-§10) is a
  `platformAction("stores.notes", …)` posted from the tenant route `/app/<h>`: `platformAction` reads no store from
  `x-sg-path`, so no seam change is needed; a tenant session (no platform role) gets `forbidden`, a staff session not
  impersonating that store gets `not_found`; the note is written with `store_id = target` and audited
  `platform.note.added`. Pinned by the §F.1 attack suite (`platform` cases) and PLA-§O.3 item 12.
- Write access needs an owner support grant (PL-15, R3, `support_grants`); out of scope for R1.

### B.9 Password reset and change (AUTH-08)

- R1: console user profile → "Create reset link" (`users.manage` ↑, reason) → `password_resets` row (token sha256,
  60 min, single use) → the link is shown once for the staff member to send by WhatsApp. `/reset/<token>`: new
  password (policy + scrypt semaphore) → the row consumed by one conditional `UPDATE … SET used_at = ? WHERE id = ? AND
  used_at IS NULL AND expires_at > ?` (`affectedRows === 1`, rev 3 SEC-24) → all sessions of the user revoked → audit
  `auth.password.reset` with `actor_kind='platform'` → notification to the user.
- Tenants can never reset another member's password or 2FA (`resetUserPasswordAction`, `settings/actions.ts:155-164`,
  is deleted). Owners remove or suspend a membership instead.
- `/app/account/security`: password change (existing `changeUserPassword`, `src/lib/auth/users.ts:162`), devices
  (`describeUserAgent`), sign out other sessions.
- R2 (IN-08): a "Forgot password" link on `/login` creates the same `password_resets` row and sends it through the
  Mailer; identical answer whether the e-mail exists.

### B.10 Mailer interface (R-D51, IN-08)

```ts
// src/lib/mail/index.ts
export type MailTemplateId = "invite" | "staff_invite" | "password_reset" | "signup_received" | "signup_approved" | "signup_rejected" | "impersonation_notice" | "store_status" | "export_ready" | "digest" | "payout_ready" /* R2, OPE Q.13d */;
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
export interface EffectiveHost { host: string; via: HostVia; cls: HostClass; label: string | null /* store handle for "store" */; workerVersion: string | null /* rev 3, SEC-16: x-sg-worker when the edge verified */ }
export function effectiveHost(headers: Headers): EffectiveHost;
export function edgeVerified(headers: Headers): boolean;          // constant-time x-sg-edge vs EDGE_KEY | EDGE_KEY_PREV (sha256 digests, like the cron key) AND x-sg-ts within 5 min (rev 3, SEC-4)
export function edgeClientIp(headers: Headers): string | null;   // x-sg-ip, only when edgeVerified
export function subdomainMode(): boolean;
export function classifyHost(host: string, via: HostVia): Omit<EffectiveHost, "host" | "via" | "workerVersion">;
```

1. If `edgeVerified(headers)`: `host = normalizeHost(x-sg-host)` (`src/lib/auth/config.ts:134-148`), `via = "edge"`.
2. **Else, if an `x-sg-edge` header is present at all: `cls = "invalid"`** (neutral 404, rev 3 SEC-4: a legitimate
   direct client never sends it, so a present-but-unverifiable key is a rotation mistake or a forgery, never "the
   platform"; it records `error_events` area `edge`, code `bad_key`, counted in `getHealth().edge.badKey24h`, red alarm
   `edge_bad_key` after 10 in a minute). Failing open to `platform` would have served `/login`, `/signup` and the
   marketing pages on every tenant hostname the moment `EDGE_KEY` and the Worker secret disagreed.
3. Else: `host = requestHost(headers)` (`src/lib/auth/gate.ts:122-131`), `via = "direct"`. `x-sg-host` / `x-sg-ip` sent
   without `x-sg-edge` are ignored.
4. `classifyHost`:

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
`clientIp()` themselves. The Worker stamps `x-sg-ts = Date.now()` and `edgeVerified()` refuses a set older than 5
minutes, so a captured valid header set cannot be replayed from a direct client indefinitely (rev 3, SEC-4);
`test:hosts` covers the `EDGE_KEY_PREV` grace, the stale timestamp and the present-but-wrong key.

### C.3 `src/proxy.ts` design (OS-02)

The proxy parses, classifies and rewrites; it never touches the database or shared module state (R-D6;
`proxy.md:19`). Steps:

1. `eff = effectiveHost(req.headers)`; `area = areaOf(pathname)` (`src/lib/edge/areas.ts`, the successor of
   `adminAreaOf`, `src/lib/auth/gate.ts:150-161`, with the same decoding/case-folding):
   `console` (`/admin/**`), `console-api` (`/api/admin/**`), `app` (`/app/**`; `GET /app/manifest.webmanifest` is the
   one non-HTML path of the area: no nonce headers, the handler's `Content-Type` and `Cache-Control` kept, PLA Q.26),
   `app-api` (`/api/app/**`), `auth` (`/login`, `/signup`, `/invite/*` incl. `/invite/staff/*`, `/reset/*`, and **rev 3**
   `/report/*`: the abuse-report form, D76), `kit`
   (`/kit/*`: platform-only public share pages, headers like `auth` but with `Referrer-Policy: no-referrer` since it has
   no actions: nonce CSP, `noindex`, `private, no-store`; LAN Q12), `marketing` (`/`, `/terms`, `/privacy`, `/aup`, `/features`), `store` (`/s/**`), `internal`
   (`/d/**`), `preview` (`/preview/*`), `public-api` (`/api/public/**`, `/api/health`, `/api/hooks/**` R2), `api-v1`
   (`/api/v1/**`, R3, OPE Q.19: platform host only, never reads cookies, bearer `api_keys` only), `cron`
   (`/api/cron/**`), `gate` (the `ADMIN_GATE` segment), `other`.
2. Build the forwarded request headers: copy the incoming ones; delete `x-nonce`, `x-cs-pathname`, every `x-sg-*`
   except, when the edge verified, `x-sg-edge`, `x-sg-host`, `x-sg-ip`, **`x-sg-proto`, `x-sg-worker`, `x-sg-ts`** (kept
   so handlers can re-verify, D18, and so the health recorder can read the Worker version and last-seen time, rev 3
   SEC-16: one `scopedCache("edge")` write per minute, no DB per request); then set `x-sg-path` (`pathname + search`,
   ≤ 512 chars, on **every** request; it replaces `ADMIN_PATH_HEADER` `x-cs-pathname`, `src/lib/auth/config.ts:17`) **and
   its signature `x-sg-path-sig = hmac(x-sg-path + "|" + requestId, "proxy-path")`** (platform purpose, `sign()` of
   `src/lib/security/crypto.ts`; `requestId` = a per-request ULID the proxy also forwards as `x-sg-rid`; rev 3 SEC-3:
   `requireStoreMember` verifies the signature in constant time before reading a handle from the path, and a missing or
   bad signature answers `not_found` and records `error_events` area `edge`, code `path_unsigned`, so a handler outside
   the matcher that trusts a client-chosen `x-sg-path` cannot pick a store), and, for HTML areas, the nonce headers
   (today's pattern, `src/proxy.ts:112-116`). Second rule of the same finding: **only `storeAction` may derive the store
   from `x-sg-path`**; route handlers always pass `params.store` to `storeGuard` (lint L13, §F.1).
3. Decide by class:

| Class | Rule |
|---|---|
| `platform` / `console` | Today's gate logic for `gate`, `console`, `console-api` (`src/proxy.ts:82-122`, evaluated on the effective host). `internal` → 404. `store` paths → pass (the route decides P serving or a 308 to S/C) **with the Cookie header deleted from the forwarded request, as for `preview` and `public-api`** (rev 3, SEC-2: cheap defence in depth on the shared origin; the dashboard never needs a cookie on a tenant page or a public API). Platform UI areas (`console`, `app`, `auth`, `kit`, `marketing`) get the nonce CSP + `adminSecurityHeaders` (renamed `platformUiHeaders`), except the manifest path. `api-v1` passes (R3). Everything else passes. |
| `legacy` | GET/HEAD `/s/<h>/<rest>` passes to the store route, which answers 308 to `storeUrl(store, /<rest>)` (only the route knows the handle's canonical address); `cron` (GET `/api/cron/tick`, until the owner updates the cron line), `/api/health` and POST `/api/public/*` pass; any other GET/HEAD path → 308 `https://<PLATFORM_HOST><path>?<query>`. Everything else → 404. |
| `store` | `Next-Action` header present, method not GET/HEAD/POST/OPTIONS, or area in {`console`, `console-api`, `app`, `app-api`, `auth`, `kit`, `internal`, `preview`, `api-v1`, `cron`, `gate`} → neutral 404. Path `/s/<label>/<rest>` (own handle) → 308 `/<rest>?<query>` on the same host (D17); `/s/<other>/…` → 404. `public-api` passes with the **Cookie header deleted** (`/media/*` never reaches the proxy; the Worker already drops cookies). Anything else → `NextResponse.rewrite('/s/<label>' + (pathname === '/' ? '' : pathname) + search, { request: { headers } })` with the Cookie header deleted (`MiddlewareResponseInit.request`, `node_modules/next/dist/server/web/spec-extension/response.d.ts:20,37-41`). **Never a trailing slash** (rev 3, ENGC-15): Next runs with `trailingSlash: false`, so `/s/<label>/` would miss `src/app/s/[store]/route.ts` and fall to the `/:path+ → /-` fallback rewrite (`next.config.ts:32-33`), answering the neutral 404 for every store home on a subdomain; `qa:edge-sim` asserts `GET https://<h>.<root>/` → 200 and that `/x/` answers exactly what `/x` answers on the platform host. |
| `custom` (R3) | Same as `store`, but the rewrite target is `/d/<host>` + path; the `/d/[host]/[[...path]]` handler resolves host → store (verified `store_domains` only, LRU 512, 60 s). |
| `reserved`, `invalid` | neutral 404 (`www` never gets here: Cloudflare 301s it at the edge). |
| `foreign` | neutral 404 + the existing once-per-host log (`src/lib/render/serve.server.ts:69-83`). |

4. **Rev 5 (CRIT2-11):** on the `platform` / `console` classes a POST carrying `Next-Action` whose `Origin` is the
   literal `null` is answered by the proxy with a **403** (empty body, the 404 header set below) and never reaches
   Next's action check, which would answer 500 (§B.1); a missing `Origin` passes and the wrapper refuses it (§C.9).
   Every response the proxy itself produces is one of two sets (D31; rev 3, ENGC-22): a **404 / 410 / 503** (and the
   rev 5 action **403**) uses
   `UNKNOWN_PAGE_HEADERS` / `unavailablePageHeaders()` **only**, the single exported constant every producer shares
   (as `src/proxy.ts` `unknownUrl()` does today), so the proxy's answer to an un-gated `/admin` is byte-identical to a
   route's answer to an unknown slug (§F.6's uniformity rule); a **redirect** (303 gate, 307/308) carries
   `baseSecurityHeaders()` and `Cache-Control: private, no-store`. A pass-through response keeps the handler's headers.

Matcher (constants only, `proxy.md:136`): `"/((?!_next/static|_next/image|favicon\\.ico|fonts/|media/|api/admin/media$|api/app/[^/]+/media$).*)"`.
The two excluded upload endpoints and `/media/*` call `effectiveHost()` and refuse non-platform classes themselves
(uploads) or serve every class (media). Server Functions are POSTs to the page route, so the store-host `Next-Action`
refusal happens in the proxy **and** in `storeAction` (the action refuses when `effectiveHost().cls` is not
`platform`; `proxy.md:249-251`).

### C.4 Route tree and what each host class serves

| Route (App Router file) | platform | legacy | store / custom | Notes |
|---|---|---|---|---|
| `src/app/(marketing)/page.tsx` `/`, `/features`, `/terms`, `/privacy`, `/aup` | ✓ | 308 → platform | rewritten to `/s/<h>` (the store home) | replaces `src/app/route.ts` (C2: a root route and page can't coexist); indexable (overrides the root `noindex`, C8) |
| `src/app/(public)/login`, `signup`, `invite/[token]`, `invite/staff/[token]`, `reset/[token]` | ✓ | 308 | 404 | §B |
| `src/app/(public)/kit/[token]/page.tsx` (P3) | ✓ (`noindex`, `private`, `no-referrer`) | 308 | 404 | SF-01 share page; `resolveKitShare(token)` |
| `src/app/(public)/report/[handle]/page.tsx` (P1, rev 3, D76) | ✓ (`noindex`, `private`, `same-origin`) | 308 | 404 (the footer link is absolute to the platform origin) | "Report this store"; `recordAbuseReport()`; no oracle on the handle |
| `src/app/app/**` dashboard, `src/app/api/app/[store]/**` | ✓ | 308 (GET) | 404 | §I.1 |
| `src/app/admin/**`, `src/app/api/admin/**` console | ✓ (gate) | 404 | 404 | §I.2 |
| `src/app/s/[store]/…` store pages (§C.4.1) | P mode: serve; S/C mode: 308 to canonical | 308 to canonical | via rewrite only | real route files with the `unknownMethod` + neutral-404 discipline (C5) |
| `src/app/d/[host]/[[...path]]` (R3) | 404 unless rewritten by the proxy | 404 | via rewrite only | D16 |
| `src/app/preview/[token]/route.ts` | ✓ (signed, `noindex`, `private`) | 404 | 404 | D20; renders landing drafts (R1), store template drafts and product drafts (R2, STO-R15); minted by `mintPreviewToken` (§E.2) |
| `src/app/api/public/{order,lead,event,upsell,track}` | ✓ | ✓ (POST) | ✓ | store resolved from the pageKey / token, §C.9; `order` and `lead` honour the test token (D54) |
| `src/app/api/public/wa/route.ts` (R1, P3) | ✓ | ✓ (POST) | ✓ | "Order on WhatsApp" intent → a `leads` row of kind `whatsapp` + the `wa.me` text (LP-11); buckets `p:wa:ip`, `s:<sid>:wa:ip` |
| `src/app/api/public/store/{order,lead,cart,event}/route.ts` (R2, S1) | ✓ | ✓ (POST) | ✓ | payload v3; store resolved from `products.public_key` / context keys (STO-R1, STO-R10); header class "Public JSON APIs" |
| `src/app/api/public/store/{review,review-media,search-index}/route.ts` (R3, D3) | ✓ | ✓ | ✓ | verified reviews, review media upload (asset_refs owner `review`), instant-search index |
| `src/app/api/public/{exp,upsell-chain}/route.ts` (R3, D3) | ✓ | ✓ (POST) | ✓ | experiment exposures (LAN-§18), upsell → downsell chain (LAN-§19) |
| `src/app/api/v1/**` (R3, D2) | ✓ (bearer `api_keys`) | 404 | 404 | REST + polling triggers (IN-10), area `api-v1` |
| `src/app/media/[key]/route.ts` | ✓ | ✓ | ✓ | refuses keys of non-servable stores (§A.5.3) |
| `src/app/api/cron/tick`, `src/app/api/health` | ✓ | ✓ (cron URL during the move) | 404 / health ✓ | |
| `src/app/robots.txt/route.ts`, `src/app/sitemap.xml/route.ts` | platform files | 308 | rewritten to `/s/<h>/robots.txt` / `sitemap.xml` | §C.8 |
| `src/app/[slug]/route.ts` | neutral 404 for every method | same | same | kept only as the target of the `/:path+ → /-` fallback rewrite (`next.config.ts:32-33`); `[slug]/merci` and `legal/[doc]` are deleted (C3: no legacy data) |
| `src/app/dev/fixture/**` | dev only (404 in prod) | | | gains store-page fixtures (PUB-28) |

#### C.4.1 Store page routes under `src/app/s/[store]/`

| Path (relative to the store base) | Serves | Release |
|---|---|---|
| `/` | store home (§A.2) | R1 |
| `/<slug>` , `/<slug>/merci` | landing pages and custom pages, their thank-you page. Before the neutral 404 the route consults `page_slug_history` and answers **308** to the current slug with the raw query (LP-20, LAN Q22; 12 months, never across stores). With a valid test token (`?sg-test=<token>`, D54) the route calls `renderTestDocument()`: an on-request render with no pixel scripts, a "test" banner and `is_test` flowing into the order (`s:<sid>:test-render` 60/h); an unsigned or expired token is an ordinary visit | R1 |
| `/policies/<kind>` (`privacy`, `terms`, `shipping`, `returns`, `contact`) | store legal pages (`LegalBody`, store policy facts); `src/landing/legal/**` content moves to P3 in R1 product (LAN Q16), T3 keeps the route | R1 |
| `/track` (+ `?o=<orderId>&s=<sig>` signed link) | order tracking (LP-05), `noindex`; chrome wrapper by S1 in store mode (STO-R18) | R1 |
| `/go/<code>` | short links with UTM presets (LP-12, **raised to R1**, LAN Q6): **308** to the resolved typed target (`resolveLinkTarget`, LAN-§12.1: `target_kind` + `page_id` / `target_ref` inside the store's scope, never a stored URL; rev 3 SEC-6) + presets (presets added only when the incoming query has no `utm_` key), the incoming query preserved byte for byte (V7 rule), **`Cache-Control: private, no-store`** on the 308 (rev 2.1, LAN-§12.1: the target of a short link may change, so this 308 is never cached; it is the one non-canonical 308 of the redirect class, §F.6); `410` with the store's neutral page while the link or its campaign is paused; hit counters flushed by `links.flush` | **R1** |
| `/robots.txt`, `/sitemap.xml` | per-store SEO files | R1 |
| `/p/<slug>`, `/c/<slug>` (aliases `/products/<slug>`, `/collections/<slug>` → 308) | product and collection pages; `catalog_redirects` consulted before the 404 (STO-R4) | R2 |
| `/cart`, `/checkout`, `/checkout/merci`, `/search`, `/reviews` | cart, one-page COD checkout and its thank-you, search (R2 server-side, R3 instant), reviews (R3) | R2 / R3 |
| `/<slug>/[...rest]` | `src/app/s/[store]/[slug]/[...rest]/route.ts`: neutral 404 for every method (STO-R10; keeps deep paths off the fallback rewrite) | R2 |
| `/feeds/<key>/<platform>.<ext>` | catalog feeds (IN-11) | R3 |

Store-reserved page slugs (a page slug can never be one of them; `src/lib/tenancy/handles.ts` `STORE_RESERVED_SLUGS`):
`p, c, products, collections, policies, legal, cart, checkout, search, track, t, go, feeds, reviews, account, pages,
merci, media, api, preview, d, s, app, admin, kit, sitemap.xml, robots.txt, favicon.ico, manifest.webmanifest, .well-known`,
plus the locale prefixes `ar, fr, en, es, de, it, nl, pt` (R3 sibling locales, STO-R14). Slugs starting with `@` are
**internal template slugs** (store page kinds, STO-§3.1): never typed by an owner, never served as `/<slug>`.

### C.5 Cloudflare Worker contract (OS-05)

Source: `edge/worker.js` (plain ES module Worker, no build step, ≤ 120 lines, committed; deployed by the owner through
the dashboard editor or `wrangler`). Bindings: secret `EDGE_KEY`; vars `ORIGIN` (`https://<apex>`), `STORE_ROOT`
(`<apex>`), `WORKER_VERSION`. Route: `*.<domain>/*` only (the apex never runs the Worker; V3 confirms the pattern).

**The console host is not a store host** (R1.0 integration, CCR r1.0-t3-8). Add a second Cloudflare route
`console.<domain>/*` with Worker **None** (a route exclusion), and serve `console.<domain>` from Hostinger as its own
hostname (the probe V2 decides how: a domain alias on the Node site, or a proxied record whose origin Host is
`console.<domain>`). Through `edge/worker.js` the console would be unusable: the Worker never forwards `/admin/**` and
`/api/admin/**` (the visitor gets the neutral 404), deletes `Cookie` (the `__Host-cs` / `__Host-csg` session and gate cookies) and strips
every `Set-Cookie`, and Next's Server Actions check would compare `Origin: https://console.<domain>` with the apex `Host`
of the subrequest.

```
on fetch(request):
  host = lower(request.headers.host)
  refused = method not in {GET, HEAD, POST, OPTIONS}
         or request.headers has "next-action"
         or path matches ^/(admin|app|api/app|api/admin|api/cron|api/v1|kit)(/|$)   (defense in depth; the app 404s too)
  headers = copy(request.headers) minus every "x-sg-*" and minus "cookie" (store hosts never use cookies)
            (refused: also minus content-* and transfer-encoding, since no body leaves)
  headers["x-sg-host"] = host;  headers["x-sg-edge"] = EDGE_KEY;  headers["x-sg-ip"] = request.headers["cf-connecting-ip"]
  headers["x-sg-proto"] = "https";  headers["x-sg-worker"] = WORKER_VERSION;  headers["x-sg-ts"] = String(Date.now())
  res = refused
    ? fetch(ORIGIN + "/s", { method: GET if method = GET else HEAD, headers, body: null, ... })   // the proxy's neutral 404 (§F.6)
    : fetch(ORIGIN + path + rawQuery, { method, headers, body: request.body, redirect: "manual",
                                        cf: { cacheTtlByStatus: { "100-599": -1 } } })   // ENGC-2: never through Cloudflare's cache
  out = new Response(res.body, res);  out.headers.delete("set-cookie");  out.headers.set("x-sg-mode", "subdomain")
  return out
```

The Worker answers by itself only when it is misconfigured (bindings missing or `EDGE_KEY` under 32 characters: 503;
a route that catches the apex or `www`: 404) or the origin is unreachable (503): no body, `Cache-Control: private,
no-store`, `nosniff`, `Strict-Transport-Security: max-age=63072000`, `Retry-After: 30` on the 503 (R1.0 review of T3,
finding 6). Every other refusal is the app's own neutral 404, byte for byte the answer of an unknown path on that
host (HTML for GET, empty otherwise): `/s` on a store host has no handle, so the proxy's onStore answers it for every
method, and neither the refused path nor its body reaches the origin.

**Edge cache key (rev 3, ENGC-2).** A Worker subrequest to a Cloudflare-proxied origin passes through Cloudflare's
cache keyed by the **subrequest URL**, i.e. `https://<apex>/x` for every store host; the store lives only in a header.
Store documents carry `s-maxage=60`, so with any "Cache Everything" rule on the apex zone store A's HTML and per-host CSP
would become the cached answer for store B's `/x` and for apex visitors of `/x`. Hence the `cf` option above (the Worker
fetch never reads or writes the cache), `CDN-Cache-Control: no-store` on every document served `via = edge` until OS-12
exists (§F.6), and the rule that OS-12's Cache API keys by **effective host + path**, never by URL alone. The option is
a negative TTL for every status, which Cloudflare documents as "do not cache at all" and which works on every
compatibility date. It is never `cacheTtl`: that option *forces* caching (Cache Level "Cache Everything" plus an Edge
TTL) over `cacheEverything: false` and the origin's `CDN-Cache-Control`, and `cacheTtl: 0` means stored, expired at once
and served stale while it revalidates (`cf-cache-status: UPDATING`), store A's page to store B (R1.0 review of T3,
finding 1; rev 3 had `{ cacheTtl: 0, cacheEverything: false }`). The Workers `cache: "no-store"` fetch option would do
the same but needs compatibility date 2024-11-11 or later.
`qa:edge-sim` asserts that two store hosts requesting the same path never share a cached body and that the apex
direct request of that path answers the platform page. (`docs/saas/research/domains.md:260`'s sentence "Cloudflare's
cache key includes the host" is true for the browser-facing request only; corrected there at its next revision.)

Optional P1 (OS-12): Cache API keyed by **effective host** + path for HTML that carries `s-maxage`, purged by an
authenticated `POST /__purge` the app calls after a publish. Rotation of `EDGE_KEY` (zero downtime): (1) Hostinger env:
`EDGE_KEY=<new>`, `EDGE_KEY_PREV=<old>`, restart (env values are read at runtime, §H.7); (2) Cloudflare: update the
Worker secret to `<new>`; (3) after 24 h remove `EDGE_KEY_PREV` and restart. The app accepts either key while
`EDGE_KEY_PREV` is set and logs, once per hour,
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
export function consoleHref(path: `/${string}` = "/"): string;              // rev 4 (PLA Q4.2): "https://<ADMIN_HOST>/admin<path>" when ADMIN_HOST is set (from the domain move, D44), else the relative "/admin<path>"
export function apiHref(handle: string, path: `/${string}`): string;        // "/api/app/<h><path>"
export function previewUrl(token: string): string;                          // platformOrigin() + "/preview/<token>"
/** rev 4 (CRIT15, PLA Q4.1): the one "Report this store" URL every renderer uses (landing footer, Shell fallback, thank-you,
 *  tracking, legal pages, store chrome): platformOrigin() + "/report/<handle>" + (pagePath ? "?p=" + encodeURIComponent(path
 *  without its query, ≤ 300 chars) : ""). Never an order id, a token or a query string; always absolute (store hosts 404 /report/*). */
export function reportUrl(store: StoreAddress, pagePath?: string): string;
```

Rules: every link in published HTML, canonical/og/JSON-LD (PUB-11), CAPI `event_source_url` (PIX-02), sitemaps,
"view live" admin links (ADM-39, LND-27) and e-mails go through these builders; no `/admin` or `/${slug}` literal stays
in `src/**` (lint rule L8, §F.1). The landing renderer receives `{ base, origin, mediaOrigin }` in its store context
(PUB-10, PUB-16, PUB-17) and, **rev 4 (CRIT15)**, `links.report` (`PageLinks.report?: string` in `src/landing/types.ts`,
set by `src/landing/context.ts` from `reportUrl(store, path)` for every platform-served render: live, test render and
`/preview/<token>`, so the three stay byte-comparable; **undefined in every export mode**, ZIP, PHP, connected and
WhatsApp, where the page runs on the seller's own server); the storefront's `StoreLinks.report(path)` (R2) calls the
same builder, and no section ever concatenates the platform origin itself. The runtime config keeps relative
`/api/public/*` endpoints (works on every host). When
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
  `handleProblem()` also answers `reserved` for handles listed in the platform setting `platform.reservedHandles`
  (cached 30 s, PLA Q.30), and `checkHandleAvailable()` answers `unavailable` for them. **Live brand check (rev 3,
  D76):** `checkBrandTerms(kind, value)` (`src/lib/platform/brand-check.ts`, P1, frozen at P0) runs `brandTokens()` +
  the active `protected_brands` on the store name, legal name and WhatsApp display name at **every write**
  (`saveGeneralAction`, the onboarding, `store.policies` contact block, the brand kit): `brand_exact` refuses for
  non-staff with `brand_protected` (D65 code, limit-sheet variant), `brand_near` writes a console flag and lets the
  write through; the health rule `platform:brand_term_live` (P1, at least nightly: on every health computation of the
  store, rev 4; over live page titles, headlines and policy text, platform-visible only; raises `attention = 2` and a `staff.alarm` on an exact term) covers what the builder
  types after approval.
- **Legacy conversion handle (rev 3, ENGC-30):** statement S1 of §D.8 derives store #1's handle from
  `settings.store.storeName` (slugified, checked with `isHandle()`, the reserved and protected lists, and uniqueness in
  SQL) and falls back to `store-1` only when nothing usable results; the conversion also writes a one-time **free
  rename grant** into the `tenancy_v1` marker (`{ freeRename: true }`) that `renameHandle()` honours once outside the
  "1 rename / 30 days" rule, so the owner is never stuck sharing `/s/store-1/…` until P2 merges and a 12-month
  redirect chain.
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
- **No `aggregateRating` in JSON-LD** on any Store Gen page until verified reviews exist (ST-13, R3): the
  `product.rating` branch of `src/landing/document.tsx:289-290` is removed by T3 in R1.0 (LAN Q14, R-D46, honesty
  target D2). Rating fields in a doc are a publish-gate item (§M.3), never structured data.
- **robots.txt:** platform host: marketing allowed; `Disallow: /app/`, `/admin/`, `/preview/`, and `/s/` once S mode
  is on; `Sitemap:` lines for every indexable P-mode store while S mode is off. Store host (`/s/<h>/robots.txt`):
  `Sitemap: <canonical origin>/sitemap.xml`; `Disallow: /` while the store is not `active` or has no published page.
- **sitemap.xml:** platform = marketing pages; store = its published, indexable pages at the canonical origin only.

### C.9 Cookies, CSRF, CSP and the order origin per host (R-D7, R-D8, SE-02)

| Topic | Platform / console host | Store / custom host | Legacy host |
|---|---|---|---|
| Session, gate, device and locale cookies | `__Host-cs`, `__Host-csg`, `__Host-sgd` (§B.1), **`__Host-sgl`** (the admin locale cookie, replaces `sg-locale`; Secure, Path=/, no Domain, SameSite=Lax, 1 year, `z.enum` validated; rev 3, SEC-13 / PLA PD71): **every platform cookie uses the `__Host-` prefix**; `qa:edge-sim` asserts the platform host never emits a `Set-Cookie` without it | never set, never read: the Worker and the proxy delete `Cookie`; store responses never send `Set-Cookie` (Worker strips it; test §J) | none |
| Mutations (server actions, `/api/app`, `/api/admin`) | `checkSameOrigin` strict: `Sec-Fetch-Site: same-origin` **and** an `Origin` whose host ∈ {`PLATFORM_HOST`, `ADMIN_HOST`}; **a missing `Origin` is refused** (rev 3, SEC-11: Next alone lets a request without `Origin` through with a warning, `serverActions.md:13`; the admin's `Referrer-Policy: same-origin` keeps it present); **an explicit `Origin: null` is refused with 403 by the proxy before Next's own check can answer 500** (rev 5, CRIT2-11, §C.3 step 4); no reflection of `Host`/`X-Forwarded-Host` (`src/lib/security/csrf.ts:27-47`); never "same-site"; never a store or custom host (AUTH-24). `storeAction`, `userAction`, `platformAction` call `assertSameOrigin(headers())` first on every invocation; `storeGuard` / `platformGuard` call it for non-safe methods before the session lookup (§E.2) | refused (404) | refused |
| Document CSP | platform UI: nonce CSP (`adminCsp`, `src/lib/security/headers.ts:77-102`); store pages on every host class: the stored hash CSP whose **`connect-src` and `form-action` are narrowed per request to `<serving origin>/api/public/` plus the pixel hosts, never a bare `'self'` or a bare app origin** (rev 3, SEC-2: `scopeToPublicApi`, `src/lib/render/csp.ts:187` / `serve.server.ts:165`, kept and extended to the S/C effective host; through `'strict-dynamic'` the four vendor pixel loaders run with the document's origin, which the dashboard and console share in P mode, so a bare `'self'` would let a compromised vendor script read `/api/app/<h>/*` or `/api/admin/*` with the viewer's cookies). The vendor loader allow-list (`PixelFlags`: meta, tiktok, snap, ga4) is frozen until the dashboard has its own host (R2) | the same, with `https://<effective host>/api/public/` **only when** `via = edge` and the host is one of `storeHosts(store)`, plus `platformOrigin()` in `img-src`/`media-src` (media URLs, R-D11); never a reflected Host; responses carry `s-maxage=60` and, while `via = edge`, `CDN-Cache-Control: no-store` (ENGC-2, §C.5) | 308 |
| Order / lead / event / upsell / track APIs | accepted | accepted | accepted (old HTML) |
| `checkOrigin` for those APIs | `selfHosts()` (`src/lib/orders/origin.ts:94-110`) is **replaced** by `storeHosts(target.store)` = {`PLATFORM_HOST`, `<handle>.<root>` when S mode is on, verified custom domains, `LEGACY_PLATFORM_HOSTS`}: in S/C mode store A's page posting store B's pageKey is refused (V6); **in P mode every store shares the platform origin, so the Origin check cannot tell A's page from B's and host-level isolation begins with S mode** (rev 3, SEC-23: tenant JS is forbidden, so no first-party cross-store post exists; stated, not hidden). No Origin → allowed and flagged `noOrigin` (unchanged); `Sec-Fetch-Site: cross-site` → refused. Export CORS (`originAllowed`): `STORE_ROOT_DOMAIN` and `PLATFORM_HOST`'s registrable domain join `sharedSuffix()` so no export can allow-list `*.<root>` (R-D8), **and an exact entry whose host equals `PLATFORM_HOST`, a `LEGACY_PLATFORM_HOSTS` entry, `ADMIN_HOST` or ends with `.<STORE_ROOT_DOMAIN>` is refused at save (`settings.write` → `invalid`) and at check time** (SEC-23; `test:public-api`). | | |
| Web storage | P mode: every runtime and dashboard key is prefixed per store (`lp-utm` → `lp:<handle>:utm`, same for `lp-vid`, `lp-px-u`, `lp-order`, `lp-wa`; LND-12..14). **The prefix is derived once** in the core chunk's init (`core.ts`) from `location.pathname` with `/^\/s\/([a-z0-9-]{3,30})(?:\/|$)/` (the `(?:\/|$)` covers the store home `/s/<h>` so home and `/s/<h>/<slug>` share one prefix and `lp-utm` / `lp-vid` continuity holds; rev 3, ENGC-10) and passed to `tracking.ts`, `pixels.ts`, `order-store.ts` and `entry-whatsapp.ts`, so the runtime config v2 does not change; outside `/s/` (S/C modes, exports) the prefix is empty and today's names stay | per origin anyway; today's names | — |
| Tenant JS/HTML | **forbidden** on every host while stores share a registrable domain (PUB-25, TENANCY-MAP §7.8); console and builder previews render only in sandboxed iframes (SE-05) | same | — |

The storage-key prefix is the one change to the frozen landing runtime allowed in R1 (one regex in `core.ts`, a
parameter in the four modules; as built, `skey(win, key)` in `core.ts` is the one place the name is derived and the four
modules call it), plus the behaviour-equivalent byte-saving edits recorded in CCR r1.0-m-7 (`flag()`, `disable()`,
`tracking.ts` `PARAMS` / `collect()` / `adIds()`), which `src/landing/runtime/selftest.ts` holds to the pre-R1.0
behaviour; T3 re-measures the chunk afterwards and the header's freeze rule applies (tolerance 0
against the recorded budget and sha256 from the R1.0 integration, `render-check`). The runtime config v2, payload v2 and
the markup contract do not change. `test:security` and `qa:headers` assert that **no served store document** (live,
test render, `/preview/<token>`) carries a bare `'self'` or a bare app origin in `connect-src` or `form-action`.

### C.10 Domain move (R1, before public sign-ups; RESEARCH §5)

The owner steps are RESEARCH §5.2 (buy the domain, Cloudflare zone, `*` proxied record, www Redirect Rule, `/media/*`
Cache Rule, Worker + secret + route, Hostinger CDN off, TLS mode Full strict). The app side, in order:
1. Env full replace (HANDOFF §4) adding `PLATFORM_URL=https://<domain>`, `PUBLIC_URL` (same value),
   `STORE_ROOT_DOMAIN=<domain>`, `EDGE_KEY`, `BEHIND_CLOUDFLARE=1`, `LEGACY_PLATFORM_HOSTS=lightgreen-hippopotamus-140853.hostingersite.com`,
   `TRUSTED_PROXY_HOPS` per the Visitor IP check, and **`ADMIN_HOST=console.<domain>`** (D44 rev 3; reached directly,
   never through the Worker: the route exclusion of §C.5, CCR r1.0-t3-8); **restart, no
   rebuild** (rev 3, ENGC-26: every one of these is a server-side `process.env` read and **none of the domain-move keys
   is a `NEXT_PUBLIC_*` variable**, so none is inlined at build time; rev 5, CRIT2-8: the rev 3 wording "`src/**` has no
   `NEXT_PUBLIC_*` variable" was false, `src/lib/page/features.ts:36` reads `process.env.NEXT_PUBLIC_OFFERS_FEATURES`,
   which Next inlines into client bundles, so a change of **that one flag** still needs a rebuild; HANDOFF §4 now says
   "restart after a domain-key change, rebuild only after a `NEXT_PUBLIC_*` change"). Before switching nameservers: verify the console allowlist still admits you (`allowlistAddress()` on
   `CF-Connecting-IP`, §B.7).
2. `render_jobs` for every live page of every store (reason `address`), drained by the cron; the console Domains view
   (OS-06) shows progress. P-mode HTML keeps working on subdomains meanwhile (D17).
3. Verification V1 … V11 (RESEARCH §5.3) must pass (V4 now expects the neutral 404 for a wrong `x-sg-edge`, §C.2;
   RESEARCH records the change at its next revision), plus the app check **V12 "console on its own host"** (rev 4, PLA
   Q4.2 / PLA-§16.3: the Domains page running the check was served on `ADMIN_HOST` (`effectiveHost().cls ===
   "console"`), a cookie-less `HEAD https://<root>/admin` answers the neutral 404, `consoleHref()` links point at
   `ADMIN_HOST`, and `curl -sI https://console.<domain>/admin` has no `x-sg-mode` header: CCR r1.0-t3-8), V3 extended
   with the cache check of CCR r1.0-t3-9 (RESEARCH §5.3: two store hosts on one path, `CDN-Cache-Control: no-store`,
   `cf-cache-status` absent, `DYNAMIC` or `BYPASS` and nothing else (a `HIT`, `EXPIRED`, `REVALIDATED`, `UPDATING` or
   `STALE` fails), each body its own store's; fallback the Workers `cache: "no-store"` fetch option),
   **and V13 "human check ready"** (rev 5, CRIT2-13: `platform_turnstile` is configured with the new
   domain among its hostnames and a test token verifies on `/signup`; the Domains page shows the check and links the
   Turnstile settings); then the signup mode default flips to `approval` (D9, §B.2: the same one rule), with the D69 ceilings in force.
   Until V13 passes, the default stays `invite`, whatever else is configured.
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
| `users` | 0005 | + index `users_name_idx (name)` (console people list, PLA Q.10). |
| `users` | 0006 | drop `role`, `failed_logins`, `locked_until`. |
| `sessions` | 0004 | + `last_store_id varchar(26) NULL` (hint, D1), + `impersonation_id varchar(26) NULL` (§B.8), + `step_up_at datetime(3) NULL` (§B.7). |
| `pages` | 0004 | + `store_id` (storeRef); unique `pages_store_slug_uq (store_id, slug)` **replaces** `pages_slug_uq`; `pages_key_uq (public_key)` stays global; + `kind enum('landing','home','product','collection','page','policy','search','cart','checkout','not_found') NOT NULL DEFAULT 'landing'` (only `landing` until R2); + `product_id varchar(26) NULL` (R2 LP-07); index `pages_store_status_idx (store_id, status, updated_at)`; `is_home` copied to `stores.home_page_id` then **dropped** (DB-02). **Rev 5 (CRIT2-5): + `first_published_at datetime(3) NULL`**, the page's first publish instant: set **once** by T3's `publishPage` in the version-row transaction (`first_published_at = COALESCE(first_published_at, <publish instant>)`, never reset by unpublish, republish, restore or a re-render), backfilled in 0004 step 5 from the page's oldest `page_versions` row of `kind = 'publish'`; it is the first-come key of design's novelty rule (DES-§2.1, §7.8, QUAL-19) and lives on the core table because version and genome rows are pruned by retention while this key must not be. In **0004**, not 0005, because T3's R1.0 publish path writes it (the ENGC-1 rule for `is_test`). |
| `pages` | 0006 | + `theme_mode enum('store','campaign') NULL` (R-D41, LP-08); + `attach_opts longtext NULL` (attached-landing options, STO-R6). From 0006 `pages.draft` is typed `jsonText<PageDoc \| StorePageDoc>` and every landing reader filters `kind = 'landing'` or goes through `readPageDoc()` (STO-R2, lint L11). |
| `pages` | 0007 | + `addons longtext NULL` (`PageAddons`: upsell chain and other add-on configuration, LAN Q4). |
| `page_versions` | 0004 | + `store_id` (denormalised, DB-03); index `pv_store_idx (store_id, created_at)`; `pv_page_idx` stays. |
| `page_versions` | 0005 | + `generation_source enum('manual','instant','director','deep') NULL` (which AI tier produced the doc that was published; NULL for pre-R1 rows), + `critic_picks longtext NULL` (≤ 2 KB: Director direction slot, critique round, repair ops applied, prompt versions; never page text) — provenance for "which AI wrote this" (rethink-ai §5.6, §9.16; EU AI Act Art. 50). Written by the publish path from the draft's `generation` block; read by `recordPublishFeedback` (AI R22). |
| `page_versions` | 0006 | + `product_rev char(26) NULL` (the product revision an attached landing was rendered against; a re-render also rewrites it, STO-R6); `kind` enum appended `'sync'` (an attached republish, LAN Q24; `sync` versions are pruned first under `versions_kept_per_page`). |
| `page_versions` | 0007 | + `addons longtext NULL` (the `pages.addons` snapshot copied at publish, LAN Q4: prices of an upsell chain are charged from the version). |
| `assets` | 0004 | + `store_id`; + `stored_bytes bigint NOT NULL DEFAULT 0` (master + every variant, MED-03); indexes `assets_store_created_idx (store_id, created_at, id)`, `assets_store_kind_idx (store_id, kind, alpha)`, `assets_store_source_idx (store_id, source_asset_id)`; drop `assets_created_idx`. New ids per D21 (old ids stay valid). |
| `media_files` | 0004 | + `store_id`; + `storage enum('db','fs') NOT NULL DEFAULT 'db'`; index `mf_store_idx (store_id)`; `key` stays the global PK (D28). |
| `media_chunks` | — | unchanged (drains to empty once the FS backend runs, §G). |
| `orders` | 0004 | + `store_id`; indexes `orders_store_created_idx (store_id, created_at)`, `orders_store_status_idx (store_id, status)`, `orders_store_sheet_idx (store_id, sheet_status)`, `orders_store_phone_idx (store_id, phone, created_at)`, `orders_store_ip_idx (store_id, ip_hash, created_at)`, `orders_store_page_idx (store_id, page_id, created_at)` **replace** `orders_phone_idx`, `orders_page_idx`, `orders_status_idx`, `orders_sheet_idx`, `orders_ip_idx`; `orders_idem_uq` and the `CMD-` PK stay global (D28). **Rev 3 (ENGC-1): + `is_test boolean NOT NULL DEFAULT false`** (D54; written by T3's `create.ts` in R1.0) and index `orders_store_test_idx (store_id, is_test, created_at)`. |
| `orders` | 0005 | `source` enum appended `'manual','api','storefront','whatsapp'` (D42); + `confirm_state enum('new','attempting','callback','confirmed','cancelled','fake','duplicate','unreachable') NOT NULL DEFAULT 'new'`, + `ship_state enum('none','to_pack','packed','shipped','in_transit','out_for_delivery','delivered','refused','returned','lost','attempt_failed','postponed') NOT NULL DEFAULT 'none'` (the last two rev 3, OPE Q.27a: the delivery-rescue lane, OPS-2), + `money_state enum('unpaid','collected','remitted','disputed','written_off') NOT NULL DEFAULT 'unpaid'` (R-D17); + `assignee_id varchar(26)`, `lease_until datetime(3)`, `claim_token char(26)`, `due_at datetime(3)`, `attempts tinyint NOT NULL DEFAULT 0`, `priority int NOT NULL DEFAULT 0`, `cancel_reason varchar(32)`, `customer_id varchar(26)`, `merged_into varchar(20)` (R1: "duplicate of"; the merge itself is R2, OPE Q.1), `city_key varchar(40)` (**a `CityKey` slug, D68**), `created_by varchar(26)` (all NULL-able unless stated); **rev 2 additions (OPE Q.1, Q.12; LAN Q21; PLA Q.10):** `rev int NOT NULL DEFAULT 0`, `confirmed_by varchar(26) NULL`, `confirmed_at datetime(3) NULL`, `first_touch_at datetime(3) NULL`, `shipped_at datetime(3) NULL`, `delivered_at datetime(3) NULL`, `final_at datetime(3) NULL`, `landmark varchar(160) NULL`, `adjust_cents bigint NOT NULL DEFAULT 0`, `sheet_label varchar(20) NULL`, `sheet_dirty tinyint NOT NULL DEFAULT 0`, `capi_ctx text NULL` (sealed; purged after 8-9 days); **rev 3 additions (OPE Q.27a; D74, OPS-2, OPS-3, OPS-4, OPS-8):** `tracking_ref varchar(64) NULL`, `carrier_label varchar(60) NULL`, `ship_after datetime(3) NULL`, `delivery_attempts tinyint NOT NULL DEFAULT 0`, `return_reason varchar(32) NULL`, `confirmed_by_label varchar(60) NULL`; indexes `orders_queue_idx (store_id, confirm_state, due_at)`, `orders_assignee_idx (store_id, assignee_id, confirm_state)`, `orders_customer_idx (store_id, customer_id, created_at)`, `orders_ship_idx (store_id, ship_state, updated_at)`, `orders_confirmer_idx (store_id, confirmed_by, confirmed_at)`, `orders_money_idx (store_id, money_state, delivered_at)`, `orders_dirty_idx (store_id, sheet_dirty)`, `orders_tracking_idx (store_id, tracking_ref)` (rev 3), and the one **cross-store** index `orders_created_idx (created_at)` for the console order lookup (platform code only). (`is_test` and `orders_store_test_idx` moved to 0004, rev 3 ENGC-1.) `status` stays and becomes the **derived projection** written by the state machine (labels appended: `refused`, `duplicate`, `unreachable`, `in_transit`, `lost`; fr labels and colours per OPE-§3.3; `src/lib/orders/contract.ts:304-314`). |
| `orders` | 0006 | `page_id` → NULL-able (cart orders, ORD-19); + `catalog_version int NULL`, + `cost_snapshot longtext NULL` (AC-01), + `variant_key varchar(40) NULL` (AI-12); **rev 3 (OPE Q.27b; OPS-5, OPS-18):** `money_state` enum appended `'refunded'`, + `collected_cents bigint NULL`, `refund_cents bigint NULL`, `refunded_at datetime(3) NULL`. `orders.items` is typed `OrderItems \| OrderItemsV3` (`items.v === 3` for store orders, STO-R8); `orderText()` dispatches on `items.v`, the Sheets SKU column, CSV and drawer read units through `orderUnitsV3` for v3 rows. |
| `orders` | 0007 | indexes `orders_store_variant_idx (store_id, variant_key, created_at)` (experiment results, LAN Q32) and `orders_updated_idx (store_id, updated_at)` (REST polling, OPE Q.19); `orders.items` JSON gains the optional additive field `chain: UpsellRecord[]` (LAN Q27; readers that do not know it ignore it, like `upsell.unit`, `src/lib/orders/upsell.ts:82-86`). |
| `leads` | 0004 | + `store_id`; index `leads_store_created_idx (store_id, created_at)`; `leads_idem_uq` stays global. **Rev 3 (ENGC-1): + `is_test boolean NOT NULL DEFAULT false`** (D54; written by T3's `leads.ts` in R1.0). |
| `leads` | 0005 | + `status enum('new','contacted','recovered','lost','converted') NOT NULL DEFAULT 'new'`, + `assignee_id varchar(26)`, `contacted_at datetime(3)`, `attempts tinyint NOT NULL DEFAULT 0`, `note varchar(300)`; index `leads_store_status_idx (store_id, status, created_at)` (LP-06). **Rev 2 (LAN Q2, Q21):** `phone` → **NULL-able** (a WhatsApp intent has no phone until the chat starts; **the one guarded type change of 0005**, rev 3 ENGC-17), + `kind enum('form','whatsapp') NOT NULL DEFAULT 'form'`, `ref char(9) NULL` (`WA-` + 6 Crockford chars), `sel longtext NULL` (`LeadSelection` = `LeadSelectionV2 \| LeadSelectionV3`, ≤ 8 KB; the v3 shape from R2, OPS-15), `total_cents bigint NULL`, `version_id varchar(26) NULL`, `next_at datetime(3) NULL`, `lost_reason varchar(32) NULL`, `converted_via enum('idem','phone','agent') NULL`, `updated_at datetime(3) NOT NULL DEFAULT now(3)`; indexes `leads_store_phone_idx (store_id, phone, created_at)`, `leads_store_assignee_idx (store_id, assignee_id, status)`, `leads_store_ref_uq (store_id, ref)` (NULLs allowed), `leads_store_next_idx (store_id, next_at)`. (`is_test` moved to 0004, rev 3.) |
| `leads` | 0006 | `page_id` → NULL-able (abandoned-checkout leads of store mode have no landing page, STO-R9); `upsertLead` accepts a v3 selection with `target = { store, ctxPageId }`. |
| `store_usage` | — | created with `period varchar(10)` in 0004 (rev 3, ENGC-17: the daily AI counter `ai_credits_day` uses `YYYY-MM-DD`, AI R3; no `MODIFY` of a PK column on a table created in the same release cycle). |
| `blocklist` | 0004 | + `store_id`; unique `block_store_uq (store_id, kind, value)` **replaces** `block_uq` (DB-08, ORD-03). |
| `exports` | 0004 | + `store_id`; index `exports_store_idx (store_id, created_at)`; `exports_key_uq` stays global. |
| `settings` | 0004 | platform rows only (§D.10); no column change. |
| `rate_limits` | — | unchanged; bucket names `p:…` / `s:<storeId>:…` (§E.8). |
| `audit_log` | 0004 | + `store_id varchar(26) NULL` (FK RESTRICT; NULL = platform/auth event), + `actor_kind enum('user','platform','impersonation','system','api') NOT NULL DEFAULT 'user'`, + `impersonator_id varchar(26) NULL`; index `audit_store_idx (store_id, id)`. |
| `audit_log` | 0007 | + `prev_hash char(64) NULL`, + `row_hash char(64) NULL` (SE-08). |
| `stats_daily` | 0004 | + `store_id`; index `sd_store_day_idx (store_id, day)`; PK `(page_id, day)` stays. From R2 `page_id` holds a **page id or a product id** (`recordEvent` / `bumpOrderStats` take `{ kind: "page" \| "product"; id }`, STO-R11); both are global ULIDs so the PK keeps working. Test traffic (D54) is never recorded. |
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
| 0004 | `legal_documents` | P | platform | ToS/Privacy/AUP/DPA + store templates |
| 0004 (CCR r1.0-t1-3) | `legal_acceptances` | P (opt. store) | platform | acceptances; `store_id` is the store whose policy was accepted (PLA-§2.1) |
| 0004 | `notifications` | P (opt. store) | platform | notification centre |
| 0004 (CCR r1.0-t1-3) | `notification_reads` | P | platform | read marks; no `store_id`, the rows hang off the notification |
| 0004 | `flags`, `flag_overrides` | P | platform | release/ops flags and kill switches |
| 0004 | `asset_refs` | T | core | asset usage index (§G.5) |
| **0004** (CCR r1.0-t1-1) | `platform_usage` | P | core | platform counters (AI cost cap, mail caps, D69 sandboxes per day, pending media bytes); moved from 0005 because R1.0 charges it |
| **0004** (rev 3, ENGC-1) | `page_slug_history` | T | landing | old slugs → 308 (LP-20, LAN Q7); cut with 0004 because T3's slug route reads it in R1.0 |
| **0004** (rev 3, SEC-7) | `preview_tokens` | T | core | one row per minted `/preview/<token>` (`jti`, store, page, audience, expiry, `revoked_at`, `opened`), so a 72-hour link is store-bound and revocable |
| 0005 | `store_health` | P* | platform (rules per track, §I.7) | the one health snapshot both audiences read (D53, PLA Q.1, SF-03) |
| 0005 | `platform_requests` | P (opt. store) | platform | four-eyes / 24 h delayed dangerous actions (PLA Q.2); kept 400 days after a purge like audit |
| 0005 | `staff_invites` | P | platform | staff invite tokens (PLA Q.4) |
| 0005 | `campaigns` | T | landing | Campaign Kit (SF-01, LP-18, LAN Q1) |
| 0005 | `short_links` | T | landing | `/go/<code>` (LP-12 raised to R1; moved from 0007, LAN Q6; rev 3 SEC-6: typed targets, no free URL) |
| 0005 (rev 3, D76) | `abuse_reports` | P* | platform | public "Report this store" rows, insert-only in R1 (moved from 0007; PLA-§2.2 is the column list) |
| 0005 | `integration_status` | T | operations | one health row per integration target (OPE Q.4) |
| 0005 | `product_costs`, `carrier_rates`, `ad_spend_daily` | T | operations | Profit lite inputs (SF-04; moved from 0006 with the OPE-§2.7 shapes, OPE Q.5) |
| 0005 | `profit_alerts` | T | operations | alert hysteresis (SF-04, OPE Q.5) |
| 0005 | `ai_jobs` | T | ai | detached AI jobs under the 120 s cap (D56, §H.12) |
| 0005 | `ai_batches` | P | ai | Batches API collector (moved from 0006 and refined, AI R2) |
| 0005 | `ai_batch_items`, `ai_eval_runs` | P (opt. store) / P | ai | batch item queue; eval gate runs (AI R2) |
| 0005 | `ai_usage_daily` | T | ai | AI usage rollups (the console reads it cross-store through `src/lib/ai/platform/**`, D64) |
| 0005 | `platform_notes` | P (opt. store) | platform | staff notes |
| 0005 | `job_runs` | P (opt. store) | core | job runner: one row per job run |
| 0005 | `cron_cursors` | P | core | job runner: the tick lease and the per-job cursors (no `store_id` column, §D.5; P0 split this row, which rev 5 listed with `job_runs` as "P (opt. store)") |
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
| 0006 | `catalog_redirects`, `inventory_moves` | T | storefront | product/collection slug history; idempotent stock moves (STO-R4, STO-R5) |
| 0006 | `store_themes` | T | design | Brand Genome + logo parameters per store |
| 0006 | `expenses`, `finance_daily` | T | operations | accounting (`product_costs`, `ad_spend_daily`, `carrier_rates` moved to 0005) |
| 0006 | `carrier_accounts`, `shipments`, `shipment_events` | T | operations | carriers and shipments |
| 0006 | `notification_prefs` | P | platform | per-user channel preferences (PLA Q.22) |
| 0006 | `remittances`, `remittance_lines`, `import_mappings`, `import_runs` | T | operations | COD reconciliation, CSV importers |
| 0006 | `commission_rules`, `agent_earnings`, `payouts` | T | operations | commissions |
| 0006 | `webhook_endpoints` | T | operations | signed webhooks |
| 0006 | `stats_version_daily`, `ai_feedback` | T | ai | outcome plumbing (AI-12) |
| 0007 | `store_domains` | T | core | custom domains |
| 0007 | `support_grants` | T | platform | owner grants |
| 0007 | `tickets`, `ticket_messages` | P (opt. store) | platform | support inbox |
| 0007 | `broadcasts`, `broadcast_reads` | P | platform | announcements |
| 0007 | `store_daily_rollup` | T | platform | analytics rollup |
| 0007 | `api_keys` | T | operations | store REST keys |
| 0007 | `reviews`, `review_requests` | T | storefront | verified reviews |
| 0007 | `coupons`, `coupon_redemptions` | T | storefront | coupons |
| 0007 | `stock_holds` | T | storefront | soft stock holds |
| 0007 | `experiments`, `experiment_arms`, `experiment_exposures` | T | landing | Experiments engine (mSPRT, D58; exposures by hashed visitor id, LAN Q32) |
| 0007 | `page_schedules` | T | landing | scheduled publish / unpublish / promo end (LP-13) |
| 0007 | `saved_blocks`, `saved_block_uses` | T | landing | saved sections and house blocks (LP-24) |
| 0007 | `wa_messages`, `stock_purchases` | T | operations | WhatsApp Cloud idempotency on `wamid` (OP-23); stock purchases (AC-11) (OPE Q.15) |
| 0007 | `support_macros`, `push_subscriptions` | P | platform | support canned answers (PL-16); Web Push (PLA Q.20, Q.21) |
| 0007 | `ai_models` | T | ai | per-store risk v2 / call-time model rows (AI R2) |
| 0007 | `ai_exemplars_platform` | P | ai | hand-written and owner-approved platform exemplars, no store id (rethink-ai §3.5, §9.16) |
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
  period: varchar("period", { length: 10 }).notNull(),                 // "total" | "YYYY-MM" | "YYYY-MM-DD" (rev 3, ENGC-17: created wide, never MODIFYed)
  value: bigint("value", { mode: "number" }).notNull().default(0), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.metric, t.period] })]);

// CCR r1.0-t1-1: moved from 0005 because R1.0 charges it (D69 sandboxes per day, pending media bytes, the transitionStore refund);
// period born varchar(13) for the hourly mail counter "YYYY-MM-DDTHH" (never MODIFYed, like store_usage, ENGC-17)
export const platformUsage = mysqlTable("platform_usage", {
  metric: varchar("metric", { length: 32 }).notNull(),
  period: varchar("period", { length: 13 }).notNull(),                 // "total" | "YYYY-MM" | "YYYY-MM-DD" | "YYYY-MM-DDTHH"
  value: bigint("value", { mode: "number" }).notNull().default(0), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.metric, t.period] })]);

// rev 3 (ENGC-1): cut in 0004 because T3's slug route consults it in R1.0 (§C.4.1); the columns are landing's to refine (§D.9)
export const pageSlugHistory = mysqlTable("page_slug_history", {
  storeId: storeRef(), slug: varchar("slug", { length: 80 }).notNull(), pageId: id26("page_id").notNull(),
  until: ts("until").notNull(), hits: int("hits").notNull().default(0), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.slug] }), index("psh_page_idx").on(t.storeId, t.pageId)]);

// rev 3 (SEC-7): every minted preview link has a row, so it is store-bound, revocable and countable
export const previewTokens = mysqlTable("preview_tokens", {
  id: id26().primaryKey(),                                             // = the token's `jti`
  storeId: storeRef(), pageId: id26("page_id").notNull(),
  audience: mysqlEnum("audience", ["staff", "seller"]).notNull(), staffUserId: id26("staff_user_id"),
  createdBy: id26("created_by"), expiresAt: ts("expires_at").notNull(), revokedAt: ts("revoked_at"),
  opened: int("opened").notNull().default(0), lastOpenedAt: ts("last_opened_at"), createdAt: createdAt(),
}, (t) => [index("pt_store_page_idx").on(t.storeId, t.pageId, t.expiresAt), index("pt_exp_idx").on(t.expiresAt)]);

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

**Release and ops flags** are declared in code, not seeded by SQL (PLA Q.16, AI R20): each track exports `flags:
FlagDef[]` from `src/lib/flags/defs/<track>.ts`; `src/lib/flags/registry.ts` (maintainer) imports them and the boot
task seeds them (`INSERT IGNORE` of description, kind, type, default, `owner_track`; console edits to `default_value`
and `rules` are never overwritten; a flag missing from code is marked `archived`, never deleted). R1 declarations:
`finance_lite` (release, `true`, operations: SF-04 Profit lite), `ai_director_brief` (release, `false`, ai: AI-19a),
`ai_detached_jobs` (release, `false`, ai: pattern B's `after()` driver, set by the live probe, rev 3 ENGC-18),
`ai_copilot`, `ai_learned_priors`, `ai_risk_v2` (release, `false`, ai, R3), `design_publish_gates` (ops, `"block"`,
design: `"block" | "warn"` mirror of `platform_design.gatesAtPublish`), and (rev 2.1, from the parts' `flags/defs`
files) `console_perf_panel` (ops, `false`, platform: the console latency panel, PLA-§12.2), `health_tenant_ring`
(release, `true`, platform: lets the maintainer hide SF-03's tenant surface without a schema change), R3
`store_experiments_arms` (release, `false`, storefront: URL arms on store pages, STO-§19.10); landing declares no flag
(LAN-§23.10). `FlagRule` (§D.4 `flags.rules`) is PLA-§12.2's
`{ when: { plans?, modes?, markets?, storeStatus?, platformRoles? }, value, rollout? }`; `flagValue(key, ctx)` resolves
override user > store > plan > market → first matching rule (rollout bucket = `parseInt(sha256(key + ":" + (storeId ??
userId))[0..7], 16) % 100 < rollout`) → `default_value` → `FlagDef.default`; T1 exports `invalidateFlags()` beside the
kill-switch reader.

**Part refinements applied to the 0004 tables in rev 2** (PLA Q.24; the Drizzle blocks above keep the core columns,
these are appended in `schema.ts` by the maintainer at P0, placed in 0005 when C0 has already been cut): `waitlist` +
`source varchar(40)`, `market varchar(8)`, `mode_interest enum('landing','store','both')`, `status
enum('waiting','invited','dropped') DEFAULT 'waiting'`, `invited_at`, `invited_by`, index `wl_status_idx (status,
created_at)`; `signup_reviews.kind` enum → `('signup','reopen','go_live','plan_change','limit_raise','mode_change','domain')`,
`status` + `'withdrawn'`, + `band enum('fast','review','hold','reject_candidate') DEFAULT 'review'`, `request longtext`
(`ReviewRequest`), `submitted_at`, `staff_question varchar(500)`, `answered_at`, `blocked bool DEFAULT 0`, indexes
`sr_kind_queue_idx (kind, status, created_at)`, `sr_store_kind_idx (store_id, kind, status)`; `identity_links` +
`source enum('signup','login','invite','staff') DEFAULT 'signup'`; `protected_brands` + `active bool DEFAULT 1`, `note
varchar(200)`; `legal_documents` + `summary varchar(500)`, `effective_at`, `requires_reacceptance bool DEFAULT 0`,
`reviewed_at`, `reviewed_by`, `ack_unreviewed_by`, `ack_unreviewed_at`, `updated_at`, index `ld_kind_status_idx (kind,
locale, status)`; `legal_acceptances` + `context enum('signup','reaccept','invite','staff') DEFAULT 'signup'`;
`notifications` + `platform_min_role enum('super_admin','admin','support','analyst') NULL` (audience
`platform_staff`; NULL = every staff role), index `nt_aud_idx (audience, id)`; `flags` + `owner_track varchar(16)`,
`archived bool DEFAULT 0`, `type enum('boolean','number','string','json') DEFAULT 'boolean'`; `flag_overrides` + `note
varchar(200)`, `expires_at`; `platform_notes` (0005) + `kind enum('note','decision','warning') DEFAULT 'note'`,
`mentions longtext`, `edited_at`, `deleted_at`.

### D.5 R1 product tables (0005)

Column sets below are the contract; the owning part spec (§D.9) may add columns or indexes and refine enums before
0005 is written (start of the R1 product phase, §K.2), never remove `store_id` or rename the table. **Rev 2:** the
part refinements are now accepted (§Q) and the maintainer writes 0005 from the final column lists named here: the
Drizzle blocks below are the core shapes; where a part spec section is cited, that section's column list is the one
cut into `schema.ts`.

```ts
// platform health, dangerous actions, staff invites (platform.md; PLA-§2.2 is the final list)
export const storeHealth = mysqlTable("store_health", {                 // P*: one row per store (D53)
  storeId: varchar("store_id", { length: 26 }).primaryKey().references(() => stores.id, { onDelete: "restrict" }),
  score: tinyint("score").notNull(),                                   // 0-100, one number for both audiences
  attention: tinyint("attention").notNull().default(0),               // max flag severity 0-3 (console)
  flags: jsonText<HealthFlag[]>("flags").notNull(),                   // console flags (PLA-§6.3 codes)
  issues: jsonText<HealthIssue[]>("issues").notNull(),                // tenant issues with evidence + fix (SF-03; ≤ 20 stored, 5 shown)
  components: jsonText<Record<HealthGroup, number>>("components").notNull(),   // penalty per group, §I.7
  metrics: jsonText<HealthMetrics>("metrics").notNull(),              // orders7d, risky7d, lastActiveAt, lastOrderAt, publishedPages, mediaPct
  milestones: jsonText<Partial<Record<Milestone, string>>>("milestones"),
  snoozed: jsonText<Record<string, string>>("snoozed"),                 // issue id → ISO until (health.snooze, audited)
  dormant: boolean("dormant").notNull().default(false),
  computedAt: ts("computed_at").notNull(), dirtyAt: ts("dirty_at"),
}, (t) => [index("sh_attention_idx").on(t.attention, t.score), index("sh_due_idx").on(t.dirtyAt, t.computedAt)]);
export const platformRequests = mysqlTable("platform_requests", {       // P (opt. store): PLA-§2.2 verbatim
  id: id26().primaryKey(), storeId: storeRefOpt(),
  kind: mysqlEnum("kind", ["store_purge", "staff_super_admin"]).notNull(), mode: mysqlEnum("mode", ["four_eyes", "delayed"]).notNull(),
  payload: jsonText<Record<string, string>>("payload").notNull(), reasonCode: varchar("reason_code", { length: 40 }).notNull(), reasonNote: varchar("reason_note", { length: 500 }),
  status: mysqlEnum("status", ["pending", "confirmed", "executed", "cancelled", "expired"]).notNull().default("pending"),
  requestedBy: id26("requested_by").notNull(), requestedAt: ts("requested_at").notNull().default(now3), executeAfter: ts("execute_after"),
  confirmedBy: id26("confirmed_by"), confirmedAt: ts("confirmed_at"), cancelledBy: id26("cancelled_by"), cancelledAt: ts("cancelled_at"),
  executedAt: ts("executed_at"), error: varchar("error", { length: 200 }),
}, (t) => [index("preq_due_idx").on(t.status, t.executeAfter), index("preq_store_idx").on(t.storeId, t.status)]);
// rules: store_purge only while the store is closed/scheduled_deletion; one pending per (store, kind) → `already_requested`;
// expires after 7 days (`platform.requests` job); SQL check confirmed_by <> requested_by. §A.5.1's "two staff or 24 h" state lives here.
export const staffInvites = mysqlTable("staff_invites", {               // P: PLA Q.4
  id: id26().primaryKey(), emailNorm: varchar("email_norm", { length: 191 }).notNull(),
  role: mysqlEnum("role", ["admin", "support", "analyst"]).notNull(), tokenHash: char("token_hash", { length: 64 }).notNull(),
  invitedBy: id26("invited_by").notNull(), note: varchar("note", { length: 200 }), expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"), acceptedBy: id26("accepted_by"), revokedAt: ts("revoked_at"), createdAt: createdAt(),
}, (t) => [uniqueIndex("sti_token_uq").on(t.tokenHash), index("sti_email_idx").on(t.emailNorm)]);

// landing: Campaign Kit, short links, slug history (landing.md; LAN-§2.2 and LAN-§2.1 are the final lists)
export const campaigns = mysqlTable("campaigns", {
  id: id26().primaryKey(), storeId: storeRef(), name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 40 }).notNull(),                     // utm_campaign value
  pageId: id26("page_id").notNull(), pageVersionId: id26("page_version_id"),
  productRef: jsonText<{ kind: "landing_items" | "product"; id: string }>("product_ref").notNull(),
  channels: jsonText<CampaignChannel[]>("channels").notNull(), kit: jsonText<CampaignKit>("kit").notNull(),   // ≤ 64 KB
  kitSource: mysqlEnum("kit_source", ["library", "cloud"]).notNull().default("library"),
  offersHash: char("offers_hash", { length: 16 }).notNull(),           // pricing fingerprint → "page changed since"
  shareTokenHash: char("share_token_hash", { length: 64 }),            // NULL = not shared
  status: mysqlEnum("status", ["draft", "live", "paused", "ended"]).notNull().default("draft"),
  startsAt: ts("starts_at"), endsAt: ts("ends_at"), createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cp_store_slug_uq").on(t.storeId, t.slug), index("cp_store_page_idx").on(t.storeId, t.pageId), uniqueIndex("cp_share_uq").on(t.shareTokenHash)]);
export const shortLinks = mysqlTable("short_links", {                   // moved from 0007 (LAN Q6); rev 3 (SEC-6, LAN-§12.1): typed targets, never a stored URL
  id: id26().primaryKey(), storeId: storeRef(), code: varchar("code", { length: 16 }).notNull(),
  targetKind: mysqlEnum("target_kind", ["page", "home", "policy", "product", "collection"]).notNull().default("page"),   // product / collection from R2
  pageId: id26("page_id"),                                             // NOT NULL when target_kind = 'page' (createShortLink enforces; a published page of this store)
  targetRef: varchar("target_ref", { length: 26 }),                    // 'policy': the policy kind; R2 'product' / 'collection': the row id of this store
  campaignId: id26("campaign_id"),
  utm: jsonText<ShortLinkUtm>("utm"), channel: mysqlEnum("channel", ["meta", "tiktok", "snap", "google", "whatsapp", "instagram", "organic", "print", "other"]),
  status: mysqlEnum("status", ["active", "paused"]).notNull().default("active"),
  clicks: int("clicks").notNull().default(0), lastClickAt: ts("last_click_at"), createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("sl_store_code_uq").on(t.storeId, t.code), index("sl_store_page_idx").on(t.storeId, t.pageId), index("sl_store_campaign_idx").on(t.storeId, t.campaignId)]);
// the /go route resolves the referenced row inside the store's scope and builds Location from storePath() (an open redirect is impossible by construction);
// page_slug_history moved to §D.4 / 0004 (rev 3, ENGC-1)

// operations: integration health, Profit lite (operations.md; OPE-§2.6 and OPE-§2.7 are the final lists)
export const integrationStatus = mysqlTable("integration_status", {
  storeId: storeRef(), kind: mysqlEnum("kind", ["sheets", "capi", "telegram", "whatsapp", "webhook", "carrier"]).notNull(),
  targetId: varchar("target_id", { length: 64 }).notNull().default(""), state: mysqlEnum("state", ["ok", "warn", "failing", "off"]).notNull(),
  lastOkAt: ts("last_ok_at"), lastErrorAt: ts("last_error_at"), lastErrorCode: varchar("last_error_code", { length: 48 }),
  failures: int("failures").notNull().default(0), backlog: int("backlog").notNull().default(0), oldestPendingAt: ts("oldest_pending_at"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.kind, t.targetId] }), index("is_state_idx").on(t.state, t.kind)]);
export const profitAlerts = mysqlTable("profit_alerts", {
  storeId: storeRef(), kind: varchar("kind", { length: 32 }).notNull(), key: varchar("key", { length: 80 }).notNull().default(""),
  firedAt: ts("fired_at").notNull(), clearedAt: ts("cleared_at"), evidence: jsonText<Record<string, number>>("evidence").notNull(),
}, (t) => [primaryKey({ columns: [t.storeId, t.kind, t.key, t.firedAt] }), index("pa_open_idx").on(t.storeId, t.clearedAt)]);
// product_costs, carrier_rates, ad_spend_daily: the OPE-§2.7 shapes, cut into 0005 (R1 rows: product_costs.page_id + item_id;
// carrier_rates.carrier_account_id = '' = "my carrier", city_key = a CityKey slug or '*' (D68); ad_spend_daily.source = 'manual', campaign_id = '').
// rev 3 refinements recorded (OPE Q.27o): product_costs.sku varchar(64) NULL + pc_sku_idx (store_id, sku, effective_from); carrier_rates.cod_fee_flat_cents
// bigint NOT NULL DEFAULT 0 and cod_fee_bp int NOT NULL DEFAULT 0 (rev 4, OPS-25: OPE-§2.7 is the cut list; the COD fee formula adds the flat fee unconditionally).
// abuse_reports (P*, 0005, D76): the PLA-§2.2 block verbatim (reason enum, details, reporter_contact_enc sealed with the platform envelope
// purpose "abuse:contact", status, ip_hash; indexes ar_status_idx, ar_store_idx, ar_ip_idx); written only by recordAbuseReport() (P1).

// ai: detached jobs (rethink-ai §1.5; the ai part refines the rest of its tables in AI-§M.1/M.2)
export const aiJobs = mysqlTable("ai_jobs", {
  id: id26().primaryKey(), storeId: storeRef(), kind: varchar("kind", { length: 32 }).notNull(),   // "director_deep" | "store_blueprint" | "logo_system" | "health_report" | …
  status: mysqlEnum("status", ["queued", "running", "done", "failed", "cancelled"]).notNull().default("queued"),
  active: char("active", { length: 1 }),                                // rev 3 (ENGP-3, ENGC-3): '1' while queued/running, NULL on every terminal status (the render_jobs.dedupe pattern, D25)
  stage: varchar("stage", { length: 24 }), inputHash: char("input_hash", { length: 64 }).notNull(),
  stageAttempts: tinyint("stage_attempts").notNull().default(0),       // rev 3 (AI-§M.1): re-claims of the current stage (1 allowed); reset when a stage finishes
  driver: mysqlEnum("driver", ["after", "poll", "cron", "batch"]),     // rev 3 (AI-§B.13): which driver last advanced the job
  progress: jsonText<{ done: number; total: number; stages: Record<string, "done" | "running" | "failed">; plan: string[] }>("progress"),   // rev 3: the stage plan and per-stage state (stage-resumable jobs)
  leaseUntil: ts("lease_until"), heartbeatAt: ts("heartbeat_at"), attempts: tinyint("attempts").notNull().default(0),
  result: jsonText<{ runIds: string[]; outputRef?: string; instant?: unknown }>("result"),   // ≤ 64 KB; the instant result is kept on failure
  error: varchar("error", { length: 200 }), costMicros: bigint("cost_micros", { mode: "number" }),
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(), doneAt: ts("done_at"),
}, (t) => [index("aj_store_idx").on(t.storeId, t.status, t.createdAt), index("aj_orphan_idx").on(t.status, t.heartbeatAt), uniqueIndex("aj_active_uq").on(t.storeId, t.inputHash, t.active)]);
// aj_active_uq is on (store_id, input_hash, active), NOT on status (rev 3): with status in the key, the second identical job's terminal UPDATE
// collided with the first `done` row and the orphan path's `failed` collided with an earlier failure. The terminal UPDATE sets active = NULL in
// the same statement; a resubmission reuses the active row (§H.12). `test:ai-db` runs "the same input twice to done".
// ai_runs (AI-§M.1) additionally carries `class enum('director_interactive','director_deep','worker','fast') NULL`,
// `stage varchar(16) NULL` (plan | critique | verify | copy | judge) and `job_id varchar(26) NULL` (rethink-ai §9.16);
// prompt_versions (AI-§M.1) additionally carries `rubric_version varchar(16) NULL` (the eval report is `eval_run_id`).
// ai_batches, ai_batch_items, ai_eval_runs, ai_usage_daily: AI-§M.2 verbatim.

// platform / ops (core)
export const platformNotes = mysqlTable("platform_notes", {
  id: id26().primaryKey(), storeId: storeRefOpt(), userId: id26("user_id"), authorId: id26("author_id").notNull(),
  body: text("body").notNull(), pinned: boolean("pinned").notNull().default(false), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("pn_store_idx").on(t.storeId, t.createdAt), index("pn_user_idx").on(t.userId, t.createdAt)]);
// platform_usage moved to 0004 (CCR r1.0-t1-1; §D.4, after store_usage)
export const jobRuns = mysqlTable("job_runs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  job: varchar("job", { length: 48 }).notNull(), storeId: storeRefOpt(), tickId: char("tick_id", { length: 26 }),
  startedAt: ts("started_at").notNull(), ms: int("ms").notNull(), ok: boolean("ok").notNull(),
  processed: int("processed").notNull().default(0), summary: jsonText<Record<string, unknown>>("summary"), errorCode: varchar("error_code", { length: 64 }),
}, (t) => [index("jr_job_idx").on(t.job, t.startedAt), index("jr_started_idx").on(t.startedAt), index("jr_store_idx").on(t.storeId, t.startedAt)]);
export const cronCursors = mysqlTable("cron_cursors", {
  job: varchar("job", { length: 48 }).primaryKey(), cursor: varchar("cursor", { length: 64 }).notNull().default(""),
  state: jsonText<Record<string, unknown>>("state"), updatedAt: updatedAt(),
});   // rev 5 (CRIT2-18): the row job = 'tick' (seeded INSERT IGNORE by 0005) is the tick lease: cursor = the running tickId or '', updated_at = the lease time (§H.2)
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
  reason: mysqlEnum("reason", ["address", "theme", "brand", "product", "republish", "runtime", "experiment",
                               "store_info", "conversions", "cutout"]).notNull(),   // rev 3 (ENGP-28): the §H.3 reasons the handlers register; `reviews` is appended in 0007; `cutout` = UX-39 / DES-R22
  priority: tinyint("priority").notNull().default(5),
  dedupe: varchar("dedupe", { length: 40 }),                           // = page_id while PENDING only (rev 3, ENGC-4): the claim UPDATE sets it NULL, so one pending job may queue behind a running one (D25); rev 5 (CRIT2-17): one pending job per page across all reasons and no change column, so an attached landing's handler decides sync vs in place by diff (§H.3)
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
  fakeCount: int("fake_count").notNull().default(0), testCount: int("test_count").notNull().default(0),   // test orders (D54) count here only
  firstOrderAt: ts("first_order_at"), lastOrderAt: ts("last_order_at"),
  note: varchar("note", { length: 300 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cu_store_phone_uq").on(t.storeId, t.phone), index("cu_store_last_idx").on(t.storeId, t.lastOrderAt),
           index("cu_phone_idx").on(t.phone)]);   // cross-store console lookup (PLA Q.10): used only by src/lib/platform/** with `// tenancy: platform order-lookup`
export const agentProfiles = mysqlTable("agent_profiles", {
  storeId: storeRef(), userId: id26("user_id").notNull(),
  presence: mysqlEnum("presence", ["offline", "online", "break"]).notNull().default("offline"), presenceAt: ts("presence_at"),
  dailyCap: int("daily_cap"), weight: tinyint("weight").notNull().default(1),
  languages: jsonText<string[]>("languages"), skills: jsonText<string[]>("skills"),
  commissionRuleIds: jsonText<string[]>("commission_rule_ids"),         // rev 3 (ENGC-17): created as the JSON array from the start (OPE Q.25), no 0005 rename
  updatedAt: updatedAt(),
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
  cities: jsonText<CityKey[]>("cities").notNull(),                     // rev 3 (D68): CityKey SLUGS ("casablanca", "fes"), or "*"; the editor converts the picked City.value with cityKey() at save
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
// design_genomes: DES-§2.1 is the cut list (design refines its columns, §D.9), incl. `report` (GateSummary ≤ 1 KB, never page text) whose
// `chosen` rows also carry `gen` = field path → { h: hash16, o: OriginClass } (≤ 600 B, rev 4): the generation record originFrom reads (§M.1 rule 2).
export const headlineShingles = mysqlTable("headline_shingles", {
  nicheKey: varchar("niche_key", { length: 64 }).notNull(), hash: char("hash", { length: 16 }).notNull(),
  ownerTag: char("owner_tag", { length: 16 }).notNull(),               // hmac(storeId, "shingle-owner")[:16], never returned (D35)
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.nicheKey, t.hash, t.ownerTag] }), index("hs_owner_idx").on(t.ownerTag)]);
```

### D.6 R2 and R3 tables (0006, 0007)

Shapes at contract level (types as in §D.1; every `store_id` is `storeRef()`; money is `cents`). The owning part
spec writes the final column list before the release's migration is cut. **Rev 2:** `product_costs`, `carrier_rates`
and `ad_spend_daily` moved to 0005 (§D.5); `short_links` moved to 0005; the refinements accepted in §Q are recorded
per row below.

| Table | Columns (key ones) | Keys / indexes |
|---|---|---|
| `catalog_redirects` (0006, new, STO-R4) | `store_id`, `kind enum(product,collection)`, `from_slug varchar(80)`, `to_id`, `created_at` | PK `(store_id, kind, from_slug)`; `(store_id, to_id)` |
| `inventory_moves` (0006, new, STO-R5) | `id bigint`, `store_id`, `product_id`, `stock_key varchar(64)`, `delta int`, `reason enum(manual,shipped,returned_restock,import,hold,release,correction)`, `order_id varchar(20) NULL`, `note`, `at`, `by` | `UNIQUE im_order_uq (store_id, order_id, product_id, stock_key, reason)` (NULL order ids never collide), `(store_id, product_id, at)` |
| `notification_prefs` (0006, new, P, PLA Q.22) | `user_id`, `store_id varchar(26) NOT NULL DEFAULT ''` ('' = every store), `group varchar(16)`, `channels longtext` (`{ inapp: true, push, email }`), `updated_at` | PK `(user_id, store_id, group)` |
| `products` (0006) | `id`, `store_id`, `slug varchar(80)`, `status enum(draft,active,archived)`, `name varchar(160)`, `doc longtext` (`{product, items, offers}` = the Offers v2 shapes of `src/lib/page/schema.ts`, priced by `src/lib/page/pricing.ts` unchanged), `seo longtext`, `position int`, `catalog_version int`, `created_by`, `created_at`, `updated_at` | `UNIQUE(store_id, slug)`; `(store_id, status, position)` |
| `collections` (0006) | `id`, `store_id`, `slug`, `name`, `description text`, `media longtext`, `rules longtext`, `sort enum(manual,newest,bestsellers,price_asc,price_desc)`, `status`, `position` | `UNIQUE(store_id, slug)` |
| `collection_products` (0006) | `store_id`, `collection_id`, `product_id`, `position` | PK `(collection_id, product_id)`; `(store_id, product_id)` |
| `inventory_levels` (0006) | `store_id`, `product_id`, `sku varchar(64)`, `on_hand int`, `held int`, `updated_at` | PK `(store_id, product_id, sku)` |
| `store_themes` (0006) | `store_id`, `version int`, `status enum(draft,active,archived) DEFAULT 'draft'`, `active_key varchar(26) NULL` (= `store_id` while active), `genome longtext`, `theme_spec longtext`, `locks longtext`, `logo longtext` (logo designer parameters + exported asset ids), `note varchar(200)`, `active bool` (kept equal to `status = 'active'`), `created_by`, `created_at` (DES-R10, DES-§2.3) | PK `(store_id, version)`; `UNIQUE st_active_uq (active_key)` (two concurrent activations fail cleanly); `(store_id, status, version)`; ≤ 30 versions per store |
| `product_costs` (**0005**, OPE-§2.7) | `id`, `store_id`, `product_id NULL`, `page_id NULL`, `item_id varchar(40) NULL`, `variant_key varchar(120) NOT NULL DEFAULT ''`, `cost_cents`, `packaging_cents NULL`, `effective_from`, `note`, `created_by`, `created_at`; code check: exactly one of `product_id`, `page_id` | `pc_prod_idx (store_id, product_id, item_id, variant_key, effective_from)`, `pc_page_idx (store_id, page_id, item_id, variant_key, effective_from)` |
| `carrier_accounts` (0006) | `id`, `store_id`, `adapter varchar(32)` (incl. the rev 3 adapter `self` = the seller's own driver, OPE OD52), `label`, `status enum(active,disabled)`, `settlement enum(at_delivery,remittance) DEFAULT 'remittance'` (rev 3, OPE Q.27o), `hook_key_hash char(64) NULL`, `settings longtext` (non-secret: status map, mapping ids, tracking URL template; credentials in store setting `carrier_credentials`), `created_by`, `created_at`, `updated_at` | `UNIQUE(store_id, adapter, label)`, `UNIQUE(hook_key_hash)` |
| `carrier_rates` (**0005**, OPE-§2.7) | `id`, `store_id`, `carrier_account_id varchar(26) NOT NULL DEFAULT ''` ('' = "my carrier", the R1 lite rows), `city_key varchar(40)` (a `CityKey` slug, D68; `*` = every other city), `delivery_fee_cents`, `return_fee_cents`, `cod_fee_bp int NOT NULL DEFAULT 0`, `cod_fee_min_cents NULL`, `cod_fee_flat_cents bigint NOT NULL DEFAULT 0` (rev 3; both `NOT NULL DEFAULT 0` in rev 4 as OPE-§2.7 cuts them, OPS-25), `eta_days tinyint NULL`, `active`, `updated_by`, `updated_at` | `UNIQUE cr_uq (store_id, carrier_account_id, city_key)` |
| `shipments` (0006) | `id`, `store_id`, `order_id varchar(20)`, `carrier_account_id`, `tracking varchar(64)`, `kind enum(full,partial,reship) DEFAULT 'full'`, `parent_id varchar(26) NULL` (rev 3, OPE Q.27o: partial deliveries), `state` (= `ship_state` values), `fee_cents`, `cod_cents`, `return_fee_cents`, `label_ref`, `created_at`, `shipped_at`, `delivered_at`, `returned_at`, `remittance_id` | `UNIQUE(store_id, carrier_account_id, tracking)`, `(store_id, order_id)`, `(store_id, state, created_at)` |
| `shipment_events` (0006) | `id bigint`, `store_id`, `shipment_id`, `at`, `carrier_status varchar(80)`, `mapped_state varchar(24)`, `raw longtext` (nulled after 30 d) | `(store_id, shipment_id, at)` |
| `remittances` (0006) | `id`, `store_id`, `carrier_account_id`, `statement_ref`, `period_from date`, `period_to date`, `paid_at`, `gross_cents`, `fees_cents`, `net_cents`, `state enum(imported,matched,disputed,closed)`, `import_run_id`, `created_by` | `UNIQUE(store_id, carrier_account_id, statement_ref)` |
| `remittance_lines` (0006) | `id bigint`, `store_id`, `remittance_id`, `tracking`, `phone_digits varchar(12) NULL` (rev 3), `order_id NULL`, `cod_cents`, `fee_cents`, `return_fee_cents`, `net_cents`, `match enum(matched,probable,amount_diff,fee_diff,unknown,missing)` (`probable` rev 3: phone + window + amount tolerance, confirmed by hand), `note` | `(store_id, remittance_id)`, `(store_id, tracking)` |
| `import_mappings` (0006) | `id`, `store_id`, `kind enum(remittance,tracking,status,ad_spend,products,reviews,manifest,expenses)` (`manifest`, `expenses` appended, OPE Q.10), `name`, `columns longtext`, `carrier_account_id NULL`, `created_by`, `updated_at` | `UNIQUE(store_id, kind, name)` (D38) |
| `import_runs` (0006) | `id`, `store_id`, `kind`, `mapping_id`, `file_ref` (path under `DATA_DIR/imports/<storeId>/`), `file_sha256`, `rows`, `ok`, `failed`, `skipped`, `state enum(previewed,committed,failed)`, `report longtext`, `created_by`, `created_at`, `committed_at` | `(store_id, kind, created_at)`, `(store_id, kind, file_sha256)` |
| `ad_spend_daily` (**0005**, OPE-§2.7) | `store_id`, `platform enum(meta,tiktok,snap,google,other)`, `account_id varchar(40) NOT NULL DEFAULT ''`, `campaign_id varchar(64) NOT NULL DEFAULT ''`, `day date`, `campaign_name`, `spend_cents`, `currency char(3)`, `source enum(manual,csv,api)`, `import_run_id NULL`, `updated_by`, `updated_at` | PK `(store_id, platform, account_id, campaign_id, day)` |
| `expenses` (0006) | `id`, `store_id`, `day date`, `category varchar(40)`, `amount_cents`, `note`, `recurring_rule longtext NULL`, `parent_id NULL`, `occurrence date NULL`, `attachment_ref NULL` (under `DATA_DIR/receipts/<storeId>/`, §G.7), `created_by` | `(store_id, day)`, `UNIQUE(store_id, parent_id, occurrence)` |
| `finance_daily` (0006) | `store_id`, `day`, `dim_key varchar(160)` (`total`, `product:<id>`, `page:<id>`, `campaign:<k>`, `city:<CityKey>`, `carrier:<id>`), order counts by outcome, `placed_cents`, `delivered_cents`, `cogs_cents`, `shipping_cost_cents`, `return_cost_cents`, `cod_fee_cents`, `commission_cents`, `ad_spend_cents`, `expense_cents`, `net_cents`, `refund_cents`, `missing_rates int DEFAULT 0` (rev 3, OPE Q.27o), `computed_at` | PK `(store_id, day, dim_key)` |
| `commission_rules` (0006) | `id`, `store_id`, `name`, `kind enum(per_delivered,per_confirmed,percent_upsell,tier_bonus,fixed)`, `amount_cents NULL`, `percent_bp NULL`, `params longtext`, `active` | `(store_id, active)` |
| `agent_earnings` (0006) | `id`, `store_id`, `user_id`, `ref varchar(40)` (order id, or `period:<YYYY-MM>`), `order_id NULL`, `rule_id`, `entry enum(accrual,clawback,bonus,fixed)`, `amount_cents` (clawback < 0), `state enum(pending,earned,void,paid)`, `period char(7)`, `payout_id NULL` (OPE Q.25) | `UNIQUE ae_uq (store_id, ref, rule_id, user_id, entry)`, `(store_id, user_id, state, period)`; `agent_profiles.commission_rule_ids` (JSON array) exists from 0005 (rev 3, ENGC-17: no rename) |
| `payouts` (0006) | `id`, `store_id`, `user_id`, `period_from`, `period_to`, `total_cents`, `state enum(draft,approved,paid)`, `approved_by`, `approved_at`, `paid_at`, `method`, `ref` | `(store_id, user_id, period_from)` |
| `webhook_endpoints` (0006) | `id`, `store_id`, `url varchar(500)`, `events longtext`, `secret_enc text` (envelope v2), `secret_prev_enc text NULL`, `status enum(active,paused,disabled)`, `failing_since NULL`, `created_by` | `(store_id)` |
| `stats_version_daily` (0006) | `store_id`, `page_id`, `version_id`, `variant_key varchar(40) DEFAULT ''`, `day`, `views`, `uniques`, `form_starts`, `orders`, `confirmed`, `delivered`, `returned`, `fake`, + `refused int`, `cancelled int` (R-D17 axes, AI-§M.3); test traffic never counted (D54) | PK `(store_id, page_id, version_id, variant_key, day)` |
| `ai_feedback` (0006) | `id bigint`, `store_id`, `run_id NULL`, `page_id`, `version_id`, `field varchar(80)`, `kind enum(kept,edited,rejected,regenerated,chosen,not_chosen,shown,director_requested,repair_applied,repair_reverted,repair_rejected,published,unpublished,exemplar_used,memory_deleted,rewritten,reverted)` (the `AiEvent` kinds of rethink-ai §3.1), `before_text varchar(1000)`, `after_text varchar(1000)`, `edit_ratio_bp int`, + `user_id`, `surface varchar(16)`, `locale varchar(5)`, `genome_id varchar(26) NULL`, `direction_slot enum(best_fit,contrast,explore) NULL`, `prompt_version varchar(32) NULL`, `context longtext NULL` (≤ 1 KB JSON), `created_at` (rethink-ai §9.16, AI-§M.3) | `(store_id, created_at)`, `(store_id, kind, created_at)` |
| `store_domains` (0007) | `id`, `store_id`, `host varchar(253)`, `status enum(pending,verifying,active,dns_lost,released,failed)`, `is_primary bool`, `cf_hostname_id`, `verify_token_hash char(64)` (sha256 of the token bound to `(store_id, host)`), `verified_method enum(txt,cname) NULL`, `verified_at`, `last_checked_at`, `dns_lost_at`, `released_at`, `created_by` (rev 3, SEC-19: §K.5 states the verification and takeover rules) | `UNIQUE(host)` (one store per host, ever: a released row keeps the host 30 days), `(store_id, status)` |
| `support_grants` (0007) | `id`, `store_id`, `granted_by`, `scope longtext` (permission keys), `expires_at`, `revoked_at` | `(store_id, expires_at)` |
| `tickets` (0007, P opt.) / `ticket_messages` | `id`, `store_id NULL`, `user_id`, `subject`, `status`, `priority`, `assignee_id`, `kind`, `sla_due_at` / `id bigint`, `ticket_id`, `author_kind`, `author_id`, `body text`, `attachments`, `internal` | `(status, sla_due_at)`, `(store_id, created_at)` / `(ticket_id, id)` |
| `broadcasts` / `broadcast_reads` (0007, P) | `id`, `kind`, `audience longtext`, `title longtext` (ar/fr/en), `body longtext`, `cta longtext`, `starts_at`, `ends_at`, `dismissible` / `broadcast_id`, `user_id`, `seen_at`, `clicked_at`, `dismissed_at` | `(starts_at)` / PK `(broadcast_id, user_id)` |
| `store_daily_rollup` (0007) | `store_id`, `day`, `visitors`, `orders`, `placed_cents`, `confirmed_cents`, `delivered_cents`, `risky_orders`, `ai_generations` | PK `(store_id, day)` |
| `api_keys` (0007) | `id`, `store_id`, `label`, `prefix char(8)`, `key_hash char(64)`, `scopes longtext`, `last_used_at`, `created_by`, `revoked_at` | `UNIQUE(key_hash)`, `(store_id)` |
| `reviews` / `review_requests` (0007) | `id`, `store_id`, `product_id NULL`, `page_id NULL`, `order_id NULL`, `rating tinyint`, `body text`, `author_display`, `media longtext`, `verified`, `imported`, `incentivized`, `status enum(pending,published,hidden)`, `hidden_reason`, `locale` / `id`, `store_id`, `order_id`, `token_hash char(64)`, `sent_at`, `used_at`, `expires_at` | `(store_id, product_id, status)`, `(store_id, page_id, status)` / `UNIQUE(token_hash)` |
| `coupons` / `coupon_redemptions` (0007) | `id`, `store_id`, `code varchar(32)`, `kind`, `value_cents`/`percent_bp`, `scope`, `max_uses`, `uses`, `per_phone_max`, `starts_at`, `ends_at`, `status` / `id bigint`, `store_id`, `coupon_id`, `order_id`, `phone` | `UNIQUE(store_id, code)` / `UNIQUE(store_id, coupon_id, order_id)` |
| `stock_holds` (0007) | `id`, `store_id`, `order_id`, `product_id`, `sku`, `qty`, `state enum(held,released,decremented)`, `expires_at` | `(store_id, product_id, sku, state)` |
| `experiments` / `experiment_arms` (0007, refined LAN-§2.1) | `id`, `store_id`, `page_id`, `name`, `surface enum(landing,store_page)`, `mode enum(fair,auto)`, `split enum(in_page,url)`, `metric enum(confirmed_per_unique,orders_per_unique,delivered_per_unique)`, `status enum(draft,running,decided,stopped,ended)`, `horizon tinyint DEFAULT 28`, `min_sample int DEFAULT 100`, `base_version_id`, `started_at`, `ended_at`, `winner_arm`, `decision longtext` (mSPRT state: `Λ_n`, always-valid p, uniques per arm, D58), `weights_at` / `id`, `store_id`, `experiment_id`, `key varchar(8)`, `kind enum(headline,hero,offer_display,version,section)`, `payload`, `version_id`, `weight_bp` | `(store_id, page_id, status)`, `(status, weights_at)` / `UNIQUE(experiment_id, key)`, `(store_id, experiment_id)` |
| `experiment_exposures` (0007, LAN Q32) | `store_id`, `experiment_id`, `vid_hash char(32)` (`hmac(vid, "exp-vid:<storeId>")[:32]`, never the raw visitor id), `arm_key`, `first_at`, `idem char(36) NULL` | PK `(store_id, experiment_id, vid_hash)`; `(store_id, experiment_id, arm_key)`; `(store_id, idem)` |
| `page_schedules` (0007, LP-13) | `id`, `store_id`, `page_id`, `kind enum(publish_version,unpublish,end_promo)`, `version_id`, `campaign_id`, `run_at`, `note`, `state enum(pending,running,done,failed,cancelled)`, `attempts`, `error`, `created_by`, `created_at`, `done_at` | `(store_id, page_id, run_at)`, `(state, run_at)` |
| `saved_blocks` / `saved_block_uses` (0007, LP-24) | `id`, `store_id`, `name`, `type varchar(32)`, `variant`, `data longtext` (asset refs of this store only, `assertOwned`), `shared bool`, `created_by`, `created_at`, `updated_at` / `store_id`, `block_id`, `page_id`, `section_id varchar(40)` | `(store_id, type)` / PK `(store_id, block_id, page_id, section_id)`, `(store_id, page_id)` |
| `wa_messages` (0007, OPE Q.15) | `id`, `store_id`, `wamid varchar(128)`, `order_id NULL`, `direction enum(out,in)`, `kind varchar(32)`, `status varchar(16)`, `at`, `payload_enc text NULL` (sealed, nulled after 30 days) | `UNIQUE(store_id, wamid)`, `(store_id, order_id, at)` |
| `stock_purchases` (0007, OPE Q.15) | `id`, `store_id`, `product_id`, `sku varchar(64) DEFAULT ''`, `qty int`, `unit_cost_cents`, `supplier varchar(80) NULL`, `day date`, `note`, `created_by`, `created_at` | `(store_id, product_id, day)` |
| `support_macros` (0007, P, PLA Q.20) | `id`, `title varchar(80)`, `body_ar text`, `body_fr text`, `body_en text`, `tags longtext`, `created_by`, `updated_at` | — |
| `push_subscriptions` (0007, P, PLA Q.21) | `id`, `user_id`, `store_id NULL`, `endpoint_hash char(64)`, `endpoint_enc text`, `keys_enc text` (p256dh + auth, envelope v2 scope platform, purpose `push:sub`), `ua_label`, `created_at`, `last_ok_at`, `failures tinyint`, `disabled_at` | `UNIQUE(endpoint_hash)`, `(user_id)` |
| `gene_stats_store` (0007, T) / `gene_stats_platform` (0007, P) | `store_id`, `niche_key`, `gene varchar(32)`, `value varchar(48)`, `alpha double`, `beta double` (owner prior), `alpha_m double`, `beta_m double` (market posterior), `shown int`, `chosen int`, `n_owner int`, `n_market int`, `updated_at` / same without `store_id`, plus `n_stores` (cells with `n_stores < 5` are never read) (D61, AI-§M.4) | PK `(store_id, niche_key, gene, value)` / PK `(niche_key, gene, value)` |
| `ai_exemplars` (0007) | `id`, `store_id`, `family`, `category`, `locale`, `market`, `field`, `angle`, `text varchar(1000)`, `score`, `score_n int`, `uses`, `source enum(published,curated)`, `version_id`, `active bool`, `last_used_at`, `embedding blob NULL` (int8, R-D34), `created_at` | `(store_id, field, locale, active, score)` |
| `ai_exemplars_platform` (0007, P, rethink-ai §3.5) | `id`, `family`, `category`, `locale`, `market`, `field`, `angle`, `text varchar(1000)`, `structure varchar(32)`, `score`, `uses`, `source enum(library,approved)`, `approved_by`, `active bool`, `created_at` — **no store id**; the hand-written copy library and texts the platform owner approves | `(field, locale, active, score)` |
| `ai_models` (0007, AI R2) | `store_id`, `kind enum(risk,call_time)`, `version int`, `params longtext`, `metrics longtext`, `n int`, `active bool`, `trained_at` | PK `(store_id, kind, version)` |
| `design_archive` (0007, P, refined DES-R10) | `niche_key`, `cell_key varchar(32)`, `seed_id varchar(40) NULL` (an id of the committed designer-seed set, **never a tenant genome**), `filled int DEFAULT 0`, `best_q tinyint NULL`, `updated_at` | PK `(niche_key, cell_key)` |

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
  `assets.stored_bytes`, `COUNT(*)` of pages, members, agents, webhooks, `campaigns` with status `live`/`paused`,
  `short_links`, and `products` with status `draft` or `active`, STO-R20) and corrects drift, logging the delta in
  `job_runs.summary`.
- `platform_usage` uses the same statements for platform counters (`ai_cost_micros` per month against the monthly cap,
  `ai_cost_micros_pending` per month against the pending slice, `mail_sent` per hour, `pending_stores` per platform
  day, `pending_media_bytes` as a `total` gauge; D69) through `chargePlatformUsage` / `refundPlatformUsage`.
- **`allowOver`** (AI R4): reconciling an AI call that cost more than its reservation charges the real amount with no
  limit predicate (`UPDATE … SET value = value + ?` without the `<= ?` clause), so the ledger is always true and the
  next call is the one refused. Only the ai part's reconcile step passes it; a lint-visible grep (`allowOver: true`)
  is reviewed at merge.
- The daily AI counter is `{ metric: "ai_credits_day", period: "YYYY-MM-DD" }` with the limit passed in `opts.limit`
  (§A.4); rows older than 7 days are deleted by `housekeeping`.

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
-- rev 3 (ENGC-34), batched form for a wide row: count the missing columns of one table in ONE information_schema query;
-- when every one is missing, a SINGLE `ALTER TABLE t ADD c1 …, ADD c2 …, …` (one rebuild instead of ~40 on `orders`);
-- otherwise fall back to the per-column statements above. 0005's orders row and every later wide row use it.
SET @missing := (SELECT COUNT(*) FROM (SELECT 'confirm_state' c UNION ALL SELECT 'ship_state' /* … */) w
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = w.c));--> statement-breakpoint
SET @ddl := IF(@missing = <n>, 'ALTER TABLE `orders` ADD `confirm_state` …, ADD `ship_state` …', 'DO 0');--> statement-breakpoint
```

**0004 order** (the backfill steps are no-ops on an empty database):
1. `CREATE TABLE IF NOT EXISTS` for every §D.4 table (`plans` first, then `stores`, then the rest, incl. the rev 3
   additions `page_slug_history` and `preview_tokens`, ENGC-1 / SEC-7).
2. Seeds: `INSERT IGNORE` plans and kill-switch flags.
3. **Conditional store #1** (statement S1 below): only when legacy rows exist.
4. For each of `pages, page_versions, assets, media_files, orders, leads, blocklist, exports, stats_daily`: add
   `store_id` NULL → backfill with the constant → `MODIFY … NOT NULL` → add FK `fk_<table>_store` (RESTRICT).
   `audit_log.store_id` is added NULL-able and stays NULL-able; legacy rows whose action does not start with `auth.`
   get the constant, `auth.*` rows keep NULL.
5. Other column adds of §D.2 (users, sessions, pages.kind/product_id, assets.stored_bytes backfilled from
   `SUM(media_files.bytes)`, media_files.storage, audit_log.actor_kind/impersonator_id, **`orders.is_test` +
   `orders_store_test_idx`, `leads.is_test`** (rev 3, ENGC-1: T3's R1.0 `create.ts` / `leads.ts` write them)), **`pages.first_published_at`**
   (rev 5, CRIT2-5) with its guarded backfill `UPDATE pages p SET first_published_at = (SELECT MIN(v.created_at) FROM
   page_versions v WHERE v.page_id = p.id AND v.kind = 'publish') WHERE p.first_published_at IS NULL` (pages never
   published keep NULL; idempotent).
6. Home page (statement S2), then drop `pages.is_home` (guarded).
7. Unique and index swaps of §D.2 (create the new composite first, then drop the old global one).
8. Legacy memberships and the first super_admin (S3, TENANCY-MAP §2.4 step 6).
9. Legacy settings rows (S4); `ai`, `home` and `pixels` stay in `settings` for the JS task.

```sql
-- S1: store #1, only when the database already holds single-tenant data. rev 3 (ENGC-30): the handle is derived from the
-- store name (lower-cased, non [a-z0-9] runs → '-', trimmed to 30, leading/trailing '-' removed), used only when it matches
-- HANDLE_RE, is not in the reserved / protected lists (checked in SQL against the seeded rows) and is free; else 'store-1'.
INSERT INTO stores (id, handle, name, mode, status, plan_id, market, currency, timezone, default_locale, brand_seed, created_at, updated_at)
SELECT '00000000000000000000000001',
       COALESCE((SELECT h FROM (SELECT <slugify(storeName)> AS h) d WHERE h REGEXP '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
                 AND h NOT IN (<RESERVED_HANDLES literal list>) AND NOT EXISTS (SELECT 1 FROM protected_brands pb WHERE pb.term = h)
                 AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.handle = h)), 'store-1'),
       COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$.storeName')) FROM settings WHERE `key` = 'store'), 'Store 1'),
       'landing', 'active', 'internal', 'MA', 'MAD', 'Africa/Casablanca', 'ar', LEFT(SHA2(UUID(), 256), 16), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE id = '00000000000000000000000001')
  AND ((SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM pages) + (SELECT COUNT(*) FROM orders) + (SELECT COUNT(*) FROM assets)) > 0;
-- (as built, drizzle/0004_tenancy.sql: any row of the nine backfilled tables, or an audit_log row that is not auth.* AND
-- has a user_id; the pre-tenancy boot's own system audit rows never make a store #1, R1.0 finale F4)
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
1. Marker present → return. No store `0…01` → delete the empty `pixel_library` row the pre-tenancy build's first
   boot writes (`{"v":1,"pixels":[]}`, unencrypted), write the marker (empty install) → return (R1.0 finale F4, §P.5).
2. Re-encrypt every `store_settings` row with `purpose_v = 0` and `encrypted = 1`: decrypt v1 with purpose
   `settings:<key>`, encrypt v2 with scope `store:0…01` (§F.3), set `purpose_v = 2` (compare-and-set on the old
   value).
3. `settings.ai` → `store_settings.store_ai` = `{ mode: "auto", localEnabled: legacy.enabled, tier: legacy.tier,
   bgRemoval: legacy.bgRemoval }` (AI R16: today's "local AI off" survives); the `store.logo` field → `brand.logo.primary`
   and is removed from `store` (DES-R16); `settings.home.pageId` → `stores.home_page_id` when still NULL; `stores.name`
   / `timezone` / `currency` / `market` from `store` and `defaults` (`APP_TIMEZONE` when set); the pixel library
   migration (`src/lib/pixels/migrate.server.ts:54-129`) for store #1 only, reading the legacy `pixels` key (PIX-07);
   new stores never run it.
4. `asset_refs` for every page draft and published version of store #1 (the same extractor as the save path, §G.5);
   `store_usage` gauges recomputed.
5. Delete the moved keys (`store`, `defaults`, `sheets`, `pixel_library`, `pixel_health`, `tracking_secrets`,
   `turnstile`, `ai`, `home`, `pixels`) from `settings`; write `tenancy_v1 = { v: 1, at, store1: true, freeRename: true }`
   **last** (`freeRename` is the one-time grant `renameHandle()` consumes, ENGC-30).
Every step is idempotent; an interrupted run starts over at the next boot. The production Store Gen database may hold
the owner's first account and pages if the owner ran today's `/admin/setup` (HANDOFF §6): that is exactly the legacy
path, and the owner ends as `super_admin` and owner of store #1. **Between boot and the end of step 2** the legacy
rows are still readable: `getStoreSetting` opens `purpose_v = 0` rows through `openLegacy(…, "settings:<key>")` (§D.10,
rev 3 ENGC-19), so store #1's Turnstile and CAPI secrets work from the first request after the R1.0 deploy; the task
only re-seals. `test:migrate` asserts that store #1's `turnstile` value is readable **before** `convertLegacyStore()`
runs.

**Read-only gates.** `scripts/qa/upgrade-dry-run.ts` gains a `tenancy` section (also run once at boot, logging
`[tenancy-check]`, cloned from `src/lib/db/upgrade-check.ts:212-249`): rows with NULL `store_id` in tenant tables
(must be 0), stores without an active owner, cross-store references (order → page, order → version, export →
version, version → page, `asset_refs` → asset, `media_files` → asset, `store_members` → missing user), `store_settings`
rows with `purpose_v = 0`, duplicate handles, the marker, and **(rev 3, ENGC-31)** that the set of tenant tables the
purge and the lint enumerate from `schema.ts` (every `mysqlTable` with a `store_id` column) equals the `T` / `P*` /
`P (opt. store)` rows of §D.3, so this document and the code cannot drift. It runs on XAMPP and on a fresh production
dump before every R1 deploy (§H.10).

**0005-0007** add only new tables, appended enum values, new NULL-able or defaulted columns and new indexes, with
**two guarded type changes** (rev 3, ENGC-17) written in the 0004 style (`MODIFY` only while the column still has the
old type), both on columns that exist since 0000: `leads.phone` → NULL-able in 0005 (LAN Q2) and `orders.page_id` →
NULL-able in 0006. Nothing created in 0004 or 0005 is altered or renamed later (`store_usage.period` is born
`varchar(10)`, `platform_usage.period` is born `varchar(13)` in 0004 (CCR r1.0-t1-1), `agent_profiles.commission_rule_ids` is born as the JSON array). None needs a backfill beyond defaults.
`test:migrate` (§J.2) runs 0005 twice and interrupted like 0004.

**Boot checks for store docs (R2, STO-R3):** the published-checksum boot task (`src/lib/db/boot-tasks.ts`) and
`scripts/qa/upgrade-dry-run.ts` validate `page_versions` rows of pages with `kind ≠ 'landing'` against `StorePageDoc`
(storefront.md STO-§6.2), never against `PageDoc`, so store templates do not fail the check.

### D.9 Who may refine which tables

| Part spec | Tables whose columns it may refine (never `store_id`, never the name) |
|---|---|
| platform.md | `waitlist`, `signup_reviews`, `identity_links`, `protected_brands`, `legal_documents`, `legal_acceptances`, `notifications`, `notification_reads`, `notification_prefs`, `flags`, `flag_overrides`, `platform_notes`, `store_health` (columns; the rule set is shared, §I.7), `platform_requests`, `staff_invites`, `support_grants`, `support_macros`, `push_subscriptions`, `tickets`, `ticket_messages`, `broadcasts`, `broadcast_reads`, `abuse_reports`, `store_daily_rollup` |
| operations.md | `order_events`, `customers`, `agent_profiles`, `agent_stats_daily`, `saved_views`, `message_templates`, `sheet_bindings`, `integration_status`, `profit_alerts`, `product_costs`, `carrier_rates`, `ad_spend_daily`, every accounting/carrier/commission/webhook table of 0006, `wa_messages`, `stock_purchases`, `api_keys`; the `orders` columns added in 0005/0006 (except `is_test`, core) |
| landing.md | `delivery_zones`, `campaigns`, `short_links`, `page_slug_history`, `experiments`, `experiment_arms`, `experiment_exposures`, `page_schedules`, `saved_blocks`, `saved_block_uses`; the `leads` columns of 0005 (except `is_test`, core) |
| storefront.md | `products`, `collections`, `collection_products`, `inventory_levels`, `catalog_redirects`, `inventory_moves`, `reviews`, `review_requests`, `coupons`, `coupon_redemptions`, `stock_holds`; `pages.kind` values; `pages.attach_opts`, `page_versions.product_rev` |
| ai.md | `ai_runs`, `ai_cache`, `ai_memory`, `prompt_versions`, `ai_jobs`, `ai_batches`, `ai_batch_items`, `ai_eval_runs`, `ai_usage_daily`, `stats_version_daily`, `ai_feedback`, `ai_exemplars`, `ai_exemplars_platform`, `ai_models`, `gene_stats_*` (shared with design); `page_versions.generation_source` / `critic_picks` (values) |
| design.md | `design_genomes`, `headline_shingles`, `store_themes`, `design_archive`, `gene_stats_*` (shared with ai) |
| core (this doc) | everything else, including `orders.is_test`, `leads.is_test`, `pages.addons`, `page_versions.addons`, `preview_tokens` (rev 3), `pages.first_published_at` (rev 5, CRIT2-5: design reads it, T3 writes it, nobody else) |

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
(SET-02); platform secrets use scope `platform`. **Legacy rows (rev 3, ENGC-19):** `getStoreSetting` opens a row with
`purpose_v = 0` through `openLegacy(value, "settings:<key>")` and a row with `purpose_v = 2` through `open(value, {
store }, "settings:<key>")`, so store #1's secrets are readable from the first request after the R1.0 deploy while the
boot task of §D.8 re-seals them in the background (`test:migrate` asserts it). Audit rows carry `store_id` (SET-04).

| Key | Level | Secret | Today read at (TENANCY-MAP §3) | Target | Owner part / release |
|---|---|---|---|---|---|
| `store` | S | no | `render/publish.server.ts:135-152,617-620`, panel layout, generate, media, editor | contacts and legal facts (WhatsApp, phone, e-mail, address, legal name, optional ICE/RC) and the LP-04 block `confirmation: { callerPhone?: E.164, whatsapp?: wa.me digits, withinHours?: 1-48 }` (LAN Q10; `withinHours` omitted = no promise, never invented; **`hours` removed, rev 3 D73: the calling hours come from `ops.callingWindow` through `callingWindowFor(scope)`**); `stores.name` is authoritative for the name and every name write runs the live brand check (D76); logo moves to `brand.logo.primary` in the R1.0 conversion (DES-R16) | core / R1 |
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
| `legal_seed` | P | no | `db/boot-tasks.ts` (`seedLegalTemplates`) | the last `LEGAL_SEED_VERSION` seeded (§H.4 step 5; 0 = none; CCR r1.0-t1-3) | core / R1 |
| `platform` | P | no | — | brand (name "Store Gen", support WhatsApp, console accent), signup (mode, thresholds, allowed markets, the sandbox ceilings `pendingMediaMiB`, **`pendingMediaMiBBeforeSubmit` 20, `pendingMediaTotalMiB` 5,000, `pendingStoresPerDay` 50** (rev 3, D69), `pendingMembersMax`), new-store defaults, `allowSellerBrandOrange: false` (D37), extra reserved handles, analytics k (5), the health and lifecycle tunables (PLA-§2.4) | platform / R1 |
| `platform_ai` | P | no | — | `enabled` (false until a key and a cap exist, D40); **`classes`** per task class (D55): `director_interactive` (`claude-opus-5-5`, `medium`), `director_deep` (`claude-fable-5-1`, `high`), `worker` (`claude-sonnet-5-5`, `low`), `fast` (`claude-haiku-5-5`, `low`), each `{ model, effort, maxTokens, timeoutMs, fastMode: false, fallbacks, batch }`; `prices` per model id (USD/MTok incl. cache write 5 m / 1 h, cache read, batch); `caps` (`monthlyUsd`, `dailyUsdPerStore`, `storeDailyCapPct`, `directorPassesPerStorePerDay` 30, `deepPassesPerStorePerDay` 5, `concurrentDirector` 4, `concurrentWorker` 8, and **rev 3** `pendingSharePct` 10, `pendingDailyFloor` 10, `directorSharePct` 60; D69, AI R28/R30); `directorAutoDefault: false` (the platform default behind `store_ai.director = null`, settable only with a passing `preference` eval run, AI QUAL-11); `promptVersions` per task; `evalGate` (`judgeModel`, `jury` per class, `minWinRateLowerBound` 0.50, `maxDiversityDrop` 0.02, `maxCostIncrease` 0.20, `canary` slice and promotion thresholds, AI-§M.5); `patternLibrary`; `retentionNotice: "30d"` (Fable 5.1 requires 30-day retention, shown in the store's AI settings, rethink-ai §9.12). The key itself lives in `platform_ai_secret` | ai / R1 |
| `platform_ai_secret` | P | **yes** | — | `{ apiKey?, setAt?, setBy? }`, set only through `platformAction("ai.platform", …, { stepUp: true })`; `redactSetting` shows "set / not set"; env `ANTHROPIC_API_KEY` is the fallback when empty (AI R6) | ai / R1 |
| `platform_design` | P | no | — | gate thresholds (Q, slop, novelty bands), `gatesAtPublish: "block" \| "warn"`, novelty pool switch, calibration values (DES-R8, DES-§2.7); a console field group on `/admin/settings/general`; audit `platform.design.changed` | design / R1 |
| `platform_push` | P | **yes** | — | `{ vapidPublic, vapidPrivateEnc }` for Web Push (PLA Q.21) | platform / R3 |
| `platform_turnstile` | P | **yes** | env defaults `schemas.ts:231-234` | the platform widget (apex hostname covers every store subdomain, IN-06); env `TURNSTILE_*` are its defaults | core / R1 |
| `platform_mail` | P | **yes** | — | SMTP host/port/user/password, sender, caps | platform / R2 |
| `platform_cloudflare` | P | **yes** | — | API token (custom hostnames), zone id, fallback origin | core / R3 |
| `platform_backup` | P | no | — | retention (7 daily, 4 weekly), tables, last download | core / R1 |
| `store_ai` | S | no | — | `mode` = `auto` / `local` / `server`, `director: "auto" \| "ask" \| "off" \| null` (rev 3: `null` = the platform default, `ask` until `platform_ai.directorAutoDefault` flips), `deepPass: boolean`, local tier ceiling, background removal, learning on/off, share patterns (default off), `contributeTraining: false`, `darijaRatio: "none" \| "cta" \| "light"`, `voice` (register, darija, words to use/avoid) (rethink-ai §2.3, AI-06) | ai / R1 |
| `brand` | S | no | — | the DES-§2.6 schema **from R1.0** (DES-R16): `logo: { primary, mark?, wordmark? }` asset ids, accent/pop/neutral locks, font locks, `genes` (a partial record of the locked brand-level bold genes; rev 4 adds G1 and G9, additive, so "Lock for my brand" covers every brand-level bold gene; G4 stays `fonts.locked`, G28 / G31 stay `store_ai.voice`); `voiceSummary` is **derived read-only** from `store_ai.voice` (AI R24: one source of truth; design genes G28/G31 read `store_ai.voice.register` / `.darija`); R2: logo designer parameters live in `store_themes.logo` | design / R1 basic, R2 full |
| `onboarding` | S | no | — | wizard step, timings (`revealMs`), the chosen draft page id, the resumable draft (category, product name, price typed by the owner, fact, asset ids), `dismissedChecklist` (PLA Q.7, PLA-§2.4 schema) | platform (P2) / R1 |
| `landing` | S | no | — | `inStoreMode` (§A.2), thank-you blocks (`confirmWhatsapp`, `expectation`, `trackLink`), leads capture + `followUpHours`, `waOrder.enabled` (LP-11), `tracking.requests`, R2 `attach` defaults (LAN Q9, LAN-§2.3) | landing / R1 |
| `policies` | S | no | — | store policy facts (delivery, inspection, exchange, returns, refund, warranty, contact channels **without `contact.hours` (rev 3, D73)**, extras, `reviewedAt`) feeding legal pages, the delivery line and the AI prompt as `StorePolicyFacts` (GEN-08, LND-32, LAN-§2.3) | landing / R1 |
| `checkout` | S | no | — | R1 (landing, `src/lib/settings/keys/checkout.ts`): `zonesEnabled`, `lineOnLanding`, `calendar` (workdays as ISO 1-7, cut-off hour, holidays, `holidaysReviewedYear`, **`confirmationLeadDays` 0-3 \| null**, rev 3 OPS-12), `notServed.whatsapp`, `confirmationCall`, **`addressMode: "required" \| "optional" \| null`** (rev 3, UX-31: one decision for the landing form and the store checkout; `null` = the market default, `required` for MA), `newPageForm` (R-D45 defaults; `address` left it); R2 (storefront, `src/lib/settings/keys/checkout-store.ts`, S1): the `checkout.store` block (cart rules, buy model R-D44) **merged** into the same key by the registry (STO-R16; it never redefines `addressMode`) | landing R1 / storefront R2 |
| `accounting` | S | no | — | **R1 lite** (SF-04, OPE Q.3c): `packagingCents` (NULL = not set, never invented), `adsAllocation`, `cashHeldAlertDays`, and **rev 3 (OPE Q.27k)** `myCarrier` (settlement `at_delivery` default), `adAccounts[platform].currency`, `adRates` (owner-typed, dated); R2/R3: tax profile, currency display, `exportFormat`, `remittanceToleranceCents` | operations (P4 lite, S3 full) / R1 |
| `ops` | S | no | — | **`callingWindow`** (`days: Record<IsoWeekday, Range[]>`, ISO 1-7 as keys, up to 3 ranges per day, closed dates, and **rev 4 `savedAt`**: NULL until the owner saves once, which is what `EffectiveWindow.configured` reads, OPE OD63; **the one source of hours, D73**; the default is `DEFAULT_WINDOW`), `openOverrideUntil`, **rev 3** `windowOverrides` (≤ 4 dated schedules, e.g. Ramadan hours, with the same `days` container), `rescue` (delivery-rescue lane), `agentLabels` (sheet label → member), `carrierCsv` (the Carrier CSV column picker, D74), retry ladder, unreachable policy, duplicate window (days), assignment mode, lease minutes, callback grace, first-touch target, city aliases, reveal-alarm threshold (R2), leaderboard (R3) (OPE-§2.9) | operations / R1 |
| `conversions` | S | no | — | Purchase trigger `order` / `confirmed` / `delivered`, custom events on/off, 7-day guard behaviour (IN-02, R-D23) | operations / R1 |
| `notifications` | S | no | — | which events go to Telegram / in-app, daily summary hour | operations / R1 |
| `telegram` | S | **yes** | `export/templates/order.php:2632-2660` (PHP only) | bot token + chat id (IN-04) | operations / R1 |
| `export_key` | S | **yes** | `export/service-account.ts:51-80` (platform key today) | optional store-owned Google export key for PHP exports; the platform key is never embedded (EXP-03) | operations / R1 |
| `storefront` | S | no | — | menus, header/footer, announcement bar, theme reference | storefront / R2 |
| `carrier_credentials` | S | **yes** | — | `{ [carrierAccountId]: credentials }` | operations / R2 |
| `sheets_sa` | S | **yes** | — | `{ json }`: a store-owned Google service account (IN-09, OPE Q.3d) | operations / R2 |
| `whatsapp_cloud` | S | **yes** | — | `{ wabaId, phoneNumberId, accessToken, appSecret, verifyToken }` (OP-23) | operations / R3 |
| `feeds` | S | **yes** | — | `{ key (32 random bytes, base64url), platforms[] }` for `/feeds/<key>/…` (IN-11) | operations / R3 |
| `reviews` | S | no | — | request delay, channel, disclosure text | storefront / R3 |

A key's schema is owned by the part named in the table; the core creates every R1 key in the registry during R1.0 with
a minimal schema (`z.object({}).passthrough()` is **not** allowed: each starts with the fields listed above) so tracks
never edit the registry file itself (§K.3, extension files `src/lib/settings/keys/<key>.ts`). The C0 minimal schema of
the `platform` key uses exactly the PLA-§2.4 paths for the fields T1/T2 read in R1.0 (`brand.name`, `signup.mode`,
`signup.allowedMarkets`, `signup.pendingMediaMiB`, `signup.pendingMembersMax`, `newStore.*`,
`allowSellerBrandOrange`, `reservedHandles`, `analytics.k`, and rev 3 `signup.pendingMediaMiBBeforeSubmit`,
`signup.pendingMediaTotalMiB`, `signup.pendingStoresPerDay`), so P1 widens it without renames or a data migration
(PLA Q.28). `src/lib/settings/keys/platform.ts` is P1's file (rev 3, ENGC-8).

---

## E. The StoreScope seam

### E.1 Types (`src/lib/tenancy/types.ts`, frozen in the R1.0 contract step)

```ts
declare const SCOPE: unique symbol;
/** The only value a data function accepts as "which store". Constructible only by the seam functions below. */
export interface StoreScope {
  readonly storeId: string;
  readonly kind: "member" | "impersonation" | "public" | "system" | "platform";   // "impersonation" is set by requireStoreMember with the synthetic membership (D70)
  readonly [SCOPE]: true;
}
/** rev 3 (D71, ENGC-6, SEC-8): write capability is a type. Every repository that inserts, updates or deletes a tenant table
 *  takes `WriteScope`; `platformScope()` and the impersonation seam return scopes whose `kind` is not assignable to it, so
 *  read-only platform access and read-only impersonation are compile-time facts, not JSDoc tags (lint L6 pins the one
 *  allowed cast site, src/lib/tenancy/seam.ts). */
export type WriteScope = StoreScope & { readonly kind: "member" | "public" | "system" };
export type ReadScope = StoreScope;
export type StoreStatus = "pending" | "active" | "restricted" | "suspended" | "closed" | "scheduled_deletion" | "purged" | "rejected";
export interface StoreRow {                     // cached view of `stores` (15 s, §E.5)
  id: string; handle: string; name: string; mode: StoreMode; status: StoreStatus; planId: string;
  market: string; currency: string; timezone: string; defaultLocale: string; homePageId: string | null;
  brandSeed: string; catalogVersion: number; addressVersion: number; requireMember2fa: boolean; primaryDomain: string | null;
}
export interface Membership { role: StoreRole; status: "active" | "suspended"; synthetic?: "impersonation" }
export interface Actor { kind: "user" | "platform" | "impersonation" | "system" | "api"; userId: string | null; impersonatorId: string | null; ip: string | null }
export interface StoreCtx<S extends ReadScope = ReadScope> {
  user: SessionUser; store: StoreRow; membership: Membership; scope: S; actor: Actor;
  impersonation: ImpersonationInfo | null;
  stepUpUntil: Date | null;                    // rev 4 (PLA Q4.8): step_up_at + 5 min, the tenant step-up chip (§B.7)
  can(p: StorePermission): boolean;            // matrix ∧ mode ∧ release ∧ state ∧ impersonation
}
/** rev 4 (D71, STO C5): the keys refused to impersonation (write or sensitive), computed from STORE_PERMISSIONS */
export type WritePermission = { [K in StorePermission]: (typeof STORE_PERMISSIONS)[K] extends { write: true } | { sensitive: true } ? K : never }[StorePermission];
/** the ctx storeAction / storeGuard hand fn when every required key is a WritePermission; the only narrowing site is seam.ts */
export type WriteCtx = StoreCtx<WriteScope>;
export interface UserCtx { user: SessionUser; actor: Actor }   // rev 4 (PLA Q4.7): the ctx of userAction (account pages, no store)
export interface PlatformCtx { user: SessionUser; role: PlatformRole; actor: Actor; can(p: PlatformPermission): boolean; stepUpFresh: boolean; stepUpUntil: Date | null /* step_up_at + 5 min, PLA Q.32 */ }
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
type ActionOpts = { feature?: FeatureKey; rate?: { name: string; limit: number; windowSec: number; per?: "store" | "user" } };
export function storeAction<T>(permission: WritePermission | readonly WritePermission[], fn: (ctx: WriteCtx) => Promise<T>, opts?: ActionOpts): Promise<ActionResult<T>>;   // rev 4 (D71): write keys → WriteCtx
export function storeAction<T>(permission: StorePermission | readonly StorePermission[] | null, fn: (ctx: StoreCtx) => Promise<T>, opts?: ActionOpts): Promise<ActionResult<T>>;

/** route handlers under src/app/api/app/[store]/** (same overload rule: all-write keys → WriteCtx) */
export type StoreGuard<C extends StoreCtx<ReadScope> = StoreCtx> = { ok: true; ctx: C } | { ok: false; response: Response };
export function storeGuard(req: Request, handle: string, permission: WritePermission | readonly WritePermission[], opts?: { feature?: FeatureKey }): Promise<StoreGuard<WriteCtx>>;
export function storeGuard(req: Request, handle: string, permission: StorePermission | readonly StorePermission[], opts?: { feature?: FeatureKey }): Promise<StoreGuard>;

// src/lib/platform/seam.ts
export function requirePlatform(opts?: { permission?: PlatformPermission; throwOnFail?: boolean }): Promise<PlatformCtx>;
export function platformAction<T>(permission: PlatformPermission, fn: (ctx: PlatformCtx) => Promise<T>, opts?: { stepUp?: boolean }): Promise<ActionResult<T>>;
export function platformGuard(req: Request, permission: PlatformPermission): Promise<{ ok: true; ctx: PlatformCtx } | { ok: false; response: Response }>;
/** the only way platform code reads one store's data through the normal repositories (console store profile, impersonation) */
export function platformScope(ctx: PlatformCtx, storeId: string): StoreScope & { kind: "platform" };   // not a WriteScope: no write repository accepts it (D71, lint L6)

// src/lib/auth/index.ts
export function requireUser(opts?: { throwOnFail?: boolean }): Promise<SessionUser>;   // account pages; no store, no permission
export function userAction<T>(fn: (ctx: UserCtx) => Promise<T>): Promise<ActionResult<T>>;
export function stepUpWithPasswordAction(password: string): Promise<ActionResult<{ until: string }>>;   // rev 4 (PLA Q4.8, §B.7): tenant step-up without TOTP; refused under impersonation
export function deleteUserAccount(ctx: UserCtx | PlatformCtx, target?: { userId: string; reason: string }): Promise<void>;   // rev 4 (PLA Q4.7, §F.9): self-service (UserCtx, no target) or staff (PlatformCtx + users.manage ↑ + target); refuses owns_store / is_staff
export function publicAction<T>(name: string, fn: (ctx: { ip: string; ua: string }) => Promise<T>, opts: { turnstile: "required" | "when-configured" | "challenge"; burst: BurstName }): Promise<ActionResult<T>>;

// src/lib/tenancy/public.ts (public route handlers: order, lead, event, upsell, track, store pages)
export function resolvePublicTarget(pageKey: string): Promise<(PublicTarget & PageTarget) | null>;   // via pages.public_key / exports.public_key
export function resolveStoreByHandle(handle: string): Promise<StoreRow | null>;                     // cached; history lookup on a miss
export function publicScope(store: StoreRow): StoreScope;
// rev 2 resolvers (each annotated `// tenancy: public-key <key>`, cached 15 s like page keys, servable stores only)
export function resolveProductKey(key: string): Promise<{ store: StoreRow; scope: StoreScope; product: ProductRow } | null>;        // STO-R1 (R2): active products; D28 adds products.public_key to the global random keys
export function resolveContextKey(key: string): Promise<{ store: StoreRow; scope: StoreScope; page: { id: string; kind: StorePageKind } } | null>;   // STO-R1 (R2): non-landing page keys
export function resolveOrderForTracking(orderId: string, sig: string | null): Promise<(PublicTarget & { orderId: string }) | null>;   // LAN Q11: `/track`, signed-link check inside
export function resolveKitShare(token: string): Promise<(PublicTarget & { campaignId: string }) | null>;                               // LAN Q11: `/kit/<token>` by sha256(token) = campaigns.share_token_hash
export function resolveTestToken(store: StoreRow, token: string | null): { test: boolean };    // D54: hmac(exp, "test-order:<storeId>") within 2 h; pure, no DB

// src/lib/render/preview-token.ts (T3 in R1.0; PLA Q.6; rev 3 SEC-7: store-bound and revocable)
export function mintPreviewToken(scope: StoreScope, input: { pageId: string; ttlSec: number /* ≤ 259200 */; audience: "staff" | "seller"; staffUserId?: string }): Promise<{ url: string; expiresAt: Date; tokenId: string }>;
export function revokePreviewToken(scope: StoreScope, tokenId: string): Promise<void>;   // "Share a private preview" → "Revoke"; audit store.preview_link.revoked
// mint runs assertOwned(scope, "page", [pageId]) first (another store's page id → not_found) and inserts a `preview_tokens` row (§D.4);
// the payload { v: 1, jti, storeId, pageId, audience, staffUserId?, exp } is sealed with the platform envelope (purpose "preview:v1");
// `/preview/<token>` opens it, loads the row by jti (revoked_at IS NULL, exp in the future), re-checks page.store_id === token.storeId and
// the store's servable state, bumps `opened` (a leaked seller link is visible in Activity as a counter, no PII), renders the latest draft
// (or the published version), `noindex`, `private, no-store`, the stored hash CSP; accepted scopes: member and platform;
// writes audit `store.preview_link.created` in the PAGE's store. Attack-suite cases: mintPreviewLinkAction with A's pageId from B →
// not_found; a token forged with A's page id and B's store id → 404; a revoked token → 404.

// src/lib/jobs/scope.ts (cron, boot tasks, outbox, renders)
export function systemScope(ctx: SystemCtx, storeId: string): StoreScope;                            // kind "system"
export function forEachStore(ctx: SystemCtx, opts: { job: string; states: readonly StoreStatus[]; budgetMs: number; where?: "pending_sheets" | "pending_outbox" | "pending_renders" }, fn: (scope: StoreScope, store: StoreRow) => Promise<void>): Promise<{ visited: number; done: boolean }>;
```

`requireStoreMember` order of checks (identical answers for "not a member" and "no such store": the neutral 404 for
pages, `{ ok: false, error: "not_found" }` for actions, so store existence never leaks):
1. Session (`validateSessionToken`), MFA passed; platform ban → signed out.
2. Store: `handle` from `opts.handle`, else (actions only, D2) from `x-sg-path` (`/app/<handle>/…`) **after verifying
   `x-sg-path-sig` in constant time** (rev 3, SEC-3: a missing or bad signature → `not_found` + `error_events` area
   `edge`, code `path_unsigned`); `resolveStoreByHandle`; host class must be `platform` (D2, §C.3).
3. Membership: `store_members` row (`status = 'active'`), or the impersonation membership (§B.8, which makes
   `ctx.scope.kind = "impersonation"`, D70). Staff without a membership get 404 like anyone else.
4. `require_member_2fa` → enrolment redirect when the user has no TOTP (D12).
5. State: the store status must be in `allowStates`; `suspended` and `closed` give a read-only ctx (every write
   permission refused except those marked `readOnlyOk`, §A.3.1).
6. Permissions: each `opts.permission` through `ctx.can()`; `opts.feature` through `assertFeature`.
7. Touch `store_members.last_active_at` at most every 10 minutes.

`storeAction` = **`assertSameOrigin(headers())` first** (rev 3, SEC-11: actions are always POSTs; `userAction` and
`platformAction` do the same, `storeGuard` / `platformGuard` do it for non-safe methods before the session lookup, as
`adminGuard` does today, `src/lib/orders/http.ts:164-174`) + `requireStoreMember({ permission, feature, throwOnFail:
true })` + the read-only guard (impersonation refuses every write; `suspended`/`closed` refuse writes not marked
`readOnlyOk`; `platform_read_only` refuses every write) + `rate` bucket + the error mapping of today's
`adminAction` (`src/lib/admin-data/action.ts:27-49`: `ActionError`, `AuthInputError`, `ZodError`, never a raw DB
message) + the new codes `not_found`, `forbidden`, `read_only`, `impersonation_read_only`, `quota`, `feature_off`,
`step_up`, and the **typed publish refusals** `design_blocked`, `honesty_blocked`, `budget_blocked` whose result carries
`items: GateItem[]` (§M; `GateItem = { id, level: "hard" | "soft", title: MessageKey, detail?, field?, fix?: { tab?,
sectionId?, actionId? } }`), plus `busy` (the AI semaphore wait exceeded 3 s) and `job_queued` (a long task became an
`ai_jobs` row, result `{ jobId }`, §H.12). `ActionResult<T>` is therefore `{ ok: true; data: T } | { ok: false; error:
ActionErrorCode; items?: GateItem[]; message?: MessageKey }`. `adminAction` and `adminGuard` (`src/lib/orders/http.ts:164-174`)
are deleted in R1.0 (AUTH-23). The **`WriteCtx` overloads** (rev 4, D71) narrow types only: the runtime checks are
identical, and an impersonation or platform scope never reaches a `WriteCtx` because every `WritePermission` is refused
to it before `fn` runs; `test:permissions` asserts that `WritePermission` equals the set of keys marked `w` or `s` in
§A.3.1.

**`ActionErrorCode` (rev 2.1, D65)** = `"invalid" | "not_found" | "forbidden" | "read_only" | "impersonation_read_only" |
"quota" | "feature_off" | "step_up" | "busy" | "job_queued" | "design_blocked" | "honesty_blocked" | "budget_blocked" |
"rate_limited" | "conflict" | "server" | (string & {})` in `src/lib/tenancy/types.ts` (frozen at C0 with the tail). The
core codes above are the only ones the shell maps to a dedicated surface (limit sheet, publish dialog, job chip, step-up
sheet, read-only banner); a part-level code renders through the generic sheet with `t("error.<code>")`, so every part
code must exist in ar/fr/en. Known at rev 2.1 (platform, PLA-§M.1, autocomplete only): `already_decided`,
`already_requested`, `take_orders_locked`, `last_super_admin`, `impersonation_member`, `impersonation_state`,
`status_changed`, `cooldown_handle_required`, `health_recompute_limited`; **rev 3:** `brand_protected` (platform, D76;
rendered as the limit-sheet variant), `quota_platform_pending` and `quota_director` (ai, D69 / AI R28),
`unavailable` (storefront, a v3 line no longer available); **rev 4:** `owns_store` and `is_staff` (`deleteUserAccount`,
PLA Q4.7), `category_required` (platform: onboarding and the mode switch need `stores.category`, ENGP-25), `fee_unset`
(storefront: `createManualOrderV3` refuses a create whose quote has no delivery rule, OPE R2 notes); **rev 5:**
`turnstile_required` (platform: the signup mode cannot be set to `approval` / `open` without a configured
`platform_turnstile`, D9, CRIT2-13). A part adds its codes to its own spec; no CCR.

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
   `platformScope()` and the normal repositories (read functions only **by type**: `platformScope()` is not a
   `WriteScope`, D71). **Rev 2 additions to the allowlist (D64):**
   `src/lib/ai/platform/**` (the AI console, the batch collector and the eval gate: read/write of the ai P tables
   `prompt_versions`, `ai_batches`, `ai_batch_items`, `ai_eval_runs`, `gene_stats_platform`, `ai_exemplars_platform`,
   cross-store reads of `ai_usage_daily` / `ai_runs` for the console; AI R7), `src/lib/design/novelty.server.ts`
   (`// tenancy: platform design-novelty`, read-only vectors, returns verdict bands only) and `src/lib/jobs/tracks/design.ts`
   (`// tenancy: platform design-reserve`), pinned at 3 annotations together (DES-R9), and `src/lib/health/**` (the
   health engine iterates stores through `systemScope`; its one cross-store statement is the `store_health` upsert).
   **Public resolvers** that find a row by a random global key (pageKey, export key, media key, product key and
   context key (R2), upsell and tracking tokens, kit share tokens, invite tokens) live only in
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
  set(storeId: string, key: string, value: V, opts?: { ttlMs?: number /* per-entry override, e.g. "valid until the announcement ends" */ }): V;
  /** single flight: concurrent callers share one in-flight Promise; a rejected Promise is evicted at once (STO-R24) */
  getOrLoad(storeId: string, key: string, load: () => Promise<V>, opts?: { ttlMs?: number }): Promise<V>;
  delete(storeId: string, key?: string): void;          // key omitted = the whole store
}
export function scopedCache<V>(opts: ConstructorParameters<typeof ScopedCache<V>>[0]): ScopedCache<V>;   // registered on globalThis.__sgCaches by name
export function invalidateStore(storeId: string): void;  // every registered cache + entitlements + settings + render
```

| Global today | Key today | Target |
|---|---|---|
| `__codSettingsCache` (`settings/index.ts:29`) | setting key | `scopedCache("settings")`, `${storeId}:${key}` (**leak** fixed, SET-01) |
| `__codRenderCache` (`render/cache.server.ts:27`) | slug, `/`, `versionId:slug:kind` | `scopedCache("render")` byte-bounded (32 MB), key `${storeId}:${path}:${locale}:${catalogVersion}:${addressVersion}` for landing pages; store pages (R2) append `:w${windowId}` (the active announcement-bar window id, so a bar's start/end invalidates cached HTML and ETags, STO-R7) and use `getOrLoad` single flight; `invalidateStore` replaces `invalidatePublished()` (PUB-04, PUB-13) |
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
| new: `stores`, `entitlements`, `flags`, `memberships`, `pulse`, `health`, `ai-policy`, `novelty-pool` | — | `scopedCache` 15 s / 30 s / 30 s (`invalidateFlags()`, PLA Q.16b) / 5 s / 5 s (per store; per-user parts fresh, D57) / 5 min (`getStoreHealth`, §I.7) / 15 s per (store, user) (`aiPolicyFor`) / 60 s (design pool vectors, watermark `design_genomes.updated_at`) |
| new (rev 2.1, from the parts' cache tables): `ops-risk-cal` (P4, OPE-§10.2), `console-strips`, `lifecycle-preview`, `plan-impact` (P1, PLA-§M.5) | store id / `p:<storeId>:<strip>` / `p:<storeId>:<to>` / `p:<planId>:<patchHash>` | `scopedCache` 1 h (`riskBandOutcomes`, invalidated by `ops.rollup`) / 30 s, 2,000 entries (console profile strips; cleared by `markHealthDirty` and `transitionStore`) / 10 s, 500 (lifecycle preview; cleared by `transitionStore`) / 60 s, 50 (plan impact preview; cleared on plan save). The three P1 caches are platform-keyed (`"p"` store id) and read only by `src/lib/platform/**` |
| landing: short-link and slug-history hit counters | code / slug | per-store `Map`s flushed by `links.flush` each tick and in `after()`; listed in `scripts/qa/tenancy-allow.json` with the reason "counter, flushed by job" (LAN Q23) |
| client: focal cache, AI manager, builder/wizard drafts, pulse `BroadcastChannel` | asset id, tab, store | reset on store switch and sign-out (§B.4); the pulse channel is named per store |

The lint (L4) fails on any `globalThis.__cod*` / `globalThis.__sg*` declaration or `new Map(` at module scope in
`src/lib/**` that is not created through `scopedCache()` or listed in `scripts/qa/tenancy-allow.json` with a reason.

### E.7 Named locks

```ts
// src/lib/db/locks.ts
export function storeLock(storeId: string, name: string): LockName;    // `${db8}:s:${storeId}:${name}` (≤ 64 chars; name ≤ 25)
export function platformLock(name: string): LockName;                  // `${db8}:p:${name}`
export function withNamedLock<T>(lock: LockName, timeoutSec: number, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }>;
// a connection from the LOCK pool is held for the whole fn (GET_LOCK is connection-scoped); RELEASE_LOCK in finally
// rev 5 (CRIT2-18): waiting for a lock-pool connection is bounded by the same timeoutSec; no free connection in time → { ran: false }
```

`db8` = first 8 hex chars of sha256(database name) (lock names are server-wide). Today's `GET_LOCK('cod:sheets-sync')`
(`sheets/sync.ts:47`, SHT-03) becomes `storeLock(id, "sheets")`; migrations and boot keep their own locks
(`src/lib/db/migrate.ts`, `boot-lock.ts`). **Connection budget (rev 3, ENGC-12):** named locks never borrow from the
6-connection query pool (`src/lib/db/client.ts:20`, DB-16); they use their own tiny pool of **2** connections
(`createPool` like `migrate.ts` / `boot-lock.ts` use `createConnection`), a job may hold **at most one** named lock at a
time, **and the tick itself holds none** (rev 5, CRIT2-18: the tick mutex is a lease row, §H.2, so the sequential
tick uses at most one lock-pool connection and the other stays free for the request-path locks: `saveZones`'s
`storeLock(id, "zones")`, the round-robin `assignOnCreate`'s `storeLock(sid, "rr")` on the public order path,
`ensureTemplateSet`'s `storeLock(storeId, "templates")`); **waiting for a pool connection is bounded by the lock's own
timeout** (1 s for request paths), after which the caller takes its `{ ran: false }` branch, never an unbounded wait;
a `storeLock` body never spans a remote call it can avoid (the Sheets step takes the lock per store for the
read + append + batchUpdate triple and releases it before the next store). §H.7 states the whole budget (6 query + 2
lock + 2 media read = **10** connections) against Hostinger's `max_user_connections`, and `getHealth()` alarms on pool
wait time.

### E.8 Rate-limit buckets (TENANCY-MAP §7.6)

`rateLimit(bucket: Bucket, limit, windowSec)` accepts only the branded `Bucket` type, built by
`platformBucket(name, key?)` → `p:<name>[:<key>]` or `storeBucket(scope, name, key?)` → `s:<storeId>:<name>[:<key>]`
(≤ 191 chars; keys are hashes, never raw e-mails or IPs). The purge job is unchanged. **Migration path (rev 3,
ENGC-28):** C0 adds the two builders and a **deprecated overload** `rateLimit(bucket: string | Bucket, …)` so the ~20
string callers of today keep compiling; each track converts its callers; the maintainer removes the string overload at
the R1.0 integration, at which point lint L5 turns on.

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
| — (AI R11) | `s:<sid>:ai:u:<userId>` 60/10 min (per user across tasks) · `s:<sid>:ai:report:<userId>` 120/h (client-side AI reports) · `s:<sid>:ai:jobs` 10/h (deep passes queued; the daily pass caps live in `platform_ai.caps`) | new |
| — (OPE Q.21, Q.11) | `s:<sid>:claim:<uid>` 120/min · `s:<sid>:reveal:<uid>` 300/h · `s:<sid>:bulk:<uid>` 30/10 min · `s:<sid>:manual:<uid>` 60/h · `s:<sid>:sheets:connect:<uid>` 10/h · `s:<sid>:tg:find` 10/h · `s:<sid>:import:<uid>` 20/day (R2) · `s:<sid>:api:<prefix>` 600/10 min (R3) · `p:sheets:sa` 50/60 s (the shared service account, platform-wide) | new |
| — (LAN Q37) | `p:wa:ip:<h>` 30/10 min · `s:<sid>:wa:ip:<h>` 10/10 min · `s:<sid>:track:o:<hash(orderId)>` 10/day (failed lookups) · `s:<sid>:test-render` 60/h · `p:kit:ip:<h>` 60/10 min · R3: `p:exp:ip:<h>` 120/10 min · `s:<sid>:exp:ip:<h>` 60/10 min · `s:<sid>:upsell-chain:ip:<h>` 20/10 min | new |
| — (SF-03) | `s:<sid>:health:recompute` 6/h (the "Recompute now" button marks dirty; the job does the work) | new |
| — (rev 2.1, OPE Q.26) | `s:<sid>:replay:<uid>` 30/h (store-side replay of dead outbox deliveries, `integrations.manage`, OPE-§28; "Replay all dead of this kind" counts as one call and touches ≤ 50 rows) | new |
| — (rev 3) | `s:<sid>:inbound:<uid>` 60/h (inbound-call lookup, OPE-§5.7, OPE Q.27m) · `p:report:ip:<h>` 5/h and `p:report:store:<h>` 20/day (`/report/<handle>`, D76) · `p:password:<userId>` also covers the tenant password step-up (§B.7) | new |
| `cron:ip:*`, in-memory `burstLimit` | `p:cron:ip:*`; in-memory burst limits unchanged (platform pre-DB floor) | |

---

## F. Security

### F.1 Isolation enforcement (TN-10)

**Static gate** `scripts/qa/tenancy-lint.ts` (`npm run test:tenancy-lint`, part of `npm test`; TypeScript compiler
API, `typescript` 5.9.3, D47). It loads `src/**/*.{ts,tsx}` and fails with `file:line rule message` on:

| Rule | Fails when |
|---|---|
| L1 | a Drizzle call on a **tenant table** (`.from(T)`, `.update(T)`, `.delete(T)`, `.insert(T)`, `innerJoin/leftJoin(T)`) sits in a function without a `StoreScope`-typed parameter, unless the enclosing file is under the platform or public-resolver allowlist (§E.3 rule 6) **and** the statement carries `// tenancy: platform <reason>` or `// tenancy: public-key <key>` |
| L2 | a `select/update/delete` on a tenant table whose `.where(…)` argument does not contain, **at the top level or inside an `and(`**, a call to `inStore(` / `whereStore(` / `byId(` / `storeSql(` **whose scope argument is an identifier bound to a `StoreScope`-typed parameter of the enclosing function** (`checker.getTypeAtLocation`); a store predicate under `or(` / `not(` does not count; a bare `.storeId` reference no longer satisfies the rule, and `eq(T.storeId, <anything but a scope>)` is its own violation `L2b` (rev 3, ENGC-23, SEC-9: `eq(pages.storeId, input.storeId)`, `or(inStore(…), eq(…))` and a `storeSql(otherScope)` fragment all failed to fail before) |
| L3 | an `insert(T).values(…)` on a tenant table whose values are not wrapped in `storeValues(` (or a literal object with `storeId: scope.storeId`); any call to the removed `getSetting`/`setSetting`/`updateSetting`; **L3b (rev 3, ENGC-5):** a `.set({ … })` on a tenant table that names `storeId` |
| L4 | a module-scope `globalThis.__cod*` / `__sg*` declaration or `new Map(`/`new Set(` in `src/lib/**` not created by `scopedCache()` and not in `scripts/qa/tenancy-allow.json` (each entry: file, symbol, reason) |
| L5 | `rateLimit(` with an argument that is not a `Bucket` (also a type error once the deprecated string overload is removed at the R1.0 integration, §E.8); a `GET_LOCK` string literal outside `src/lib/db/` |
| L6 | **(rev 3, D71)** a function whose body contains `.insert(`, `.update(` or `.delete(` on a tenant table and whose scope parameter is not typed `WriteScope`; any cast or assertion from `StoreScope` / `ReadScope` to `WriteScope` outside `src/lib/tenancy/seam.ts`; `platformScope(` used outside `src/app/admin/**` and `src/lib/platform/**`. (The `/** @write */` tag is gone: the type carries the fact.) |
| L7 | an import of `@/lib/db/client` or `@/lib/db/schema` from `src/app/**` or `src/components/**` (ADM-38) |
| L8 | a string literal or template starting with `/admin` in `src/components/**` or `src/app/app/**`, or `` `/${slug}` ``-style live URLs (use `appHref` / `storeUrl`, ADM-37, ADM-39) |
| L9 | an exported async function in a `"use server"` file, **or any function declaration / arrow function whose first statement is the string literal `"use server"`** (an inline action in a server component, rev 3 ENGC-7), whose body does not start with `return storeAction(`, `return platformAction(`, `return userAction(` or `return publicAction(` (AUTH-31) |
| L10 | raw SQL (drizzle `sql` template literals, `db.execute`, `conn.query`) naming a tenant table whose `WHERE` / `SET` text of **the same statement** does not contain `store_id = ` or `storeSql(` (rev 3, SEC-9: a comment containing `store_id` no longer passes), unless annotated `// tenancy: platform <reason>` in an allowlisted directory |
| L11 (R2, STO-R2) | a read of `pages.draft` or `page_versions.doc` outside `src/lib/storefront/**` and the landing repositories that neither filters `pages.kind` nor goes through `readPageDoc()` (two doc types share the table; a landing reader must never parse a `StorePageDoc` as a `PageDoc`) |
| L12 | a `"use server"` file that handles publish without calling `runPrePublishChecks()` (§M.1), or a public order/lead handler without `resolveTestToken()` (D54): the two rev 2 gates every write path must pass |
| L13 (rev 3, ENGC-7, SEC-9) | an exported `GET` / `POST` / `PUT` / `PATCH` / `DELETE` under `src/app/api/app/[store]/**` whose first awaited statement is not `storeGuard(req, params.store, …)`; under `src/app/api/admin/**` not `platformGuard(req, …)`; under `src/app/api/public/**` a tenant-table call before one of the `resolve*` public resolvers; under `src/app/s/[store]/**` a tenant-table call before `resolveStoreByHandle(params.store)`. Route handlers never call `requireStoreMember()` without a handle (§C.3 step 2). |

Tenant tables for the lint (rev 3, ENGC-5) = **every `mysqlTable` whose column list contains `store_id`**, whether
declared with `storeRef()`, `storeRefOpt()` or inline (so `notifications`, `outbox`, `error_events`, `job_runs`,
`platform_notes`, `legal_acceptances`, `platform_requests`, `ai_batch_items` and `store_health` are covered: the tenant
notification centre, `listDeliveries(scope, q)`, `replay(ctx, id)` and `getStoreHealth(scope)` read them from tenant
surfaces); the only exemption is the §E.3 rule 6 directory allowlist with its annotations. A read of a `storeRefOpt()`
table outside the allowlist must carry `whereStore()` / `inStore()` like any tenant read. The set is read from
`schema.ts`, so a new table is covered the day it is added, and `test:migrate` asserts it equals the §D.3 rows (ENGC-31).
The lint prints the count of `tenancy: platform` annotations per directory; the count may only grow with a reviewer's
approval (the allow file pins it). Pinned in rev 2: `src/lib/design/**` 3 (DES-R9), `src/lib/ai/platform/**` as
counted at the P7 merge, `src/lib/health/**` 1; **rev 3:** `src/lib/platform/**` as counted at the P1 merge.

**DB-backed two-store attack suite** `scripts/qa/tenancy-check.ts` (`npm run test:tenancy`, §J.2): stores A and B
seeded with canaries, every exported action and repository called as each role of B with A's ids, asserting
identical not-found answers, byte-identical A rows (checksums before/after) and no canary in any return value; plus
the special cases of TENANCY-MAP §10.2 (same slug, same pixel id, sheet with A's order ids pulled for B, per-phone
limit and blocklist, identical image upload, `sourceAssetId` of A, docs referencing A's assets at save/publish/export,
quota race, settings cache, render cache, suspended pageKey, invite token reuse/expiry/escalation/enumeration) and the
new ones: impersonation write refusal, `x-sg-path` tampering, `platformScope` writes, store-host `Next-Action`, and
(rev 2.1) `addImpersonationNoteAction` posted from a tenant session (`forbidden`) and from a staff session that is not
impersonating that store (`not_found`), a store-side `replay(ctx, id)` on another store's outbox row (`not_found`), and
a `registerBudgetProfile` kind that is not the document's kind (the landing profile applies); **rev 3:** the HTML and
RSC payload of every tenant route under an impersonating session contain no customer canary (D70; the storefront's
routes included), `mintPreviewLinkAction` with A's `pageId` from B → `not_found` and a token forged with A's page id and
B's store id → 404 (SEC-7), a client-sent `x-sg-path` on the matcher-excluded upload route and on a public route is
ignored (SEC-3), 60 signups in an hour from rotating /64s → the 51st lands in the waitlist and a pending store at the
shared disk budget gets `quota` at upload, never a 500 (D69), an export allow-list entry naming the apex or a sibling
subdomain is refused (SEC-23), a `WriteScope` repository called with `platformScope()` does not compile (D71), and 10
parallel accepts of one invite yield one membership (SEC-24). The suite imports every
`scripts/qa/tenancy-cases/<track>.ts` (each exports cases built with the suite's helpers, DES-R13), so a track adds its
attack cases (design novelty, kit share tokens, test tokens signed for store A used on store B, `store_health` rows, AI
prompt assembly with store A's memory present) without editing the T4 file. Files at rev 2.1: `landing.ts` (P3),
`design.ts` (P6), `ops.ts` (P4), `integrations.ts` (P5), `ai.ts` (P7), `platform.ts` (P1); R2 `storefront.ts` (S1).
**Route coverage is derived, not remembered (rev 3, SEC-9):** `tenancy-check.ts` and `action-replay.ts` build the
GET/HEAD route list from the `src/app/api/**/route.ts` and `src/app/s/**` file tree and hit every route with B's session
against A's handle and ids, expecting the neutral 404 and no canary, so a route added today is attacked today.

**Server-action replay** `scripts/qa/action-replay.ts` (`npm run qa:action-replay`, against a running server on
3451+): Playwright (msedge) records the `Next-Action` ids and bodies while owner A works, then replays them with B's
session to A's paths and to B's paths with A's ids; every replay must answer `not_found`/`forbidden` and leave A's rows
unchanged; rev 3 adds the ENGC-16 and SEC-11 cases, **as rewritten in rev 5 (CRIT2-11)**: the invite form posted before
hydration under `Referrer-Policy: same-origin` carries the page's Origin and succeeds; the same POST replayed with an
explicit `Origin: null` is refused with **403, never a 500**; an action posted with no `Origin` header at all is refused
(`forbidden`, SEC-11).

### F.2 What isolation covers (checklist the suite proves)

Rows (every tenant table) · files (media keys of a non-servable store 404; `DATA_DIR/<area>/<storeId>/` layout, §G) ·
caches (§E.6) · locks and buckets (§E.7-E.8) · settings and secrets (per-store envelopes, §F.3) · search and ⌘K
(ADM-02) · CSV/ZIP exports (ORD-15, EXP-01) · Sheets push/pull (SHT-02, SHT-05) · CAPI tokens (PIX-01) · web storage
on the shared origin (§C.9) · AI memory, cache, exemplars, priors and genomes (AI-08; store B's assembled prompt never
contains store A's memory or exemplar text) · cross-tenant design checks return **verdict bands only** (`ok` / `close`
/ `too_close`), never another store's genome, vector or text (R-D36, DS7, DES-R17) · test tokens, kit share tokens and
preview tokens bound to one store (D54, §E.2) · `store_health` rows contain no customer data · the console (masked
PII, §F.11).

### F.3 Envelopes v2 and per-store keys (SET-02, SET-12)

```ts
// src/lib/security/crypto.ts
export type CryptoScope = { store: string } | "platform";
export function seal(plain: string, scope: CryptoScope, purpose: string): string;
//   "v2.k1.<iv>.<tag>.<ct>"  key = HKDF-SHA256(APP_SECRET, salt "cod-studio", info "<scope>:<purpose>:k1", 32 bytes)
//   scope string = "store:<storeId>" | "platform";  AAD = the identical info string "<scope>:<purpose>:k1" (D30; rev 3 SEC-25 unified the two texts)
export function open(envelope: string, scope: CryptoScope, purpose: string): string;   // v2; v1 → decrypt(envelope, legacyPurpose) only via openLegacy
export function openLegacy(envelope: string, purpose: string): string;                // today's decrypt() (v1), used by the conversion and by TOTP
export function hmacBytes(data: Uint8Array, purpose: string): string;                // media ids (D21)
// encrypt()/decrypt() keep working for v1 purposes that never change: "totp:<userId>", gate/session signing
```

- The HKDF salt `cod-studio` and every existing purpose string are frozen (brand-sweep hazard, TENANCY-MAP §11.1);
  `src/lib/security/selftest-envelope.ts` (in `npm test`) decrypts golden v1 and v2 vectors so a rename breaks the
  build, and (rev 3) asserts that a v2 envelope whose AAD names another kid fails to open.
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
- **Appended in rev 2** to the `AuditAction` union in `src/lib/audit.ts` (autocomplete; the `(string & {})` fallback
  stays, `src/lib/audit.ts:14-38`):
  - platform (PLA Q.23, PLA-§M.3): `platform.signup.snoozed|bulk_approved`, `platform.request.resolved|cancelled`,
    `platform.store.messaged`, `platform.stores.exported`, `platform.note.added|edited|deleted|pinned`,
    `platform.outbox.replayed`, `platform.domains.rerender|step`, `platform.order.lookup`, `platform.plan.updated|created`,
    `platform.invite.created|revoked`, `platform.waitlist.invited|dropped`, `platform.brand_term.saved|deleted`,
    `platform.legal.saved|reviewed|published|retired`, `platform.settings.updated`, `platform.staff.invited|signed_out_all`,
    `platform.audit.exported`, `platform.breakglass.reviewed`, `store.milestone.reached`, `store.review.submitted|answered`,
    `store.appeal.submitted`, `store.request.created|withdrawn`, `store.preview_link.created`,
    `store.onboarding.completed|skipped`, `auth.legal.accepted`, `store.health.snoozed`;
  - operations (OPE Q.23): `orders.status_forced`, `orders.exported`, `orders.test_deleted`,
    `integrations.sheets.connected|disconnected`, `integrations.telegram.changed`, `integrations.conversions.changed`,
    `callcenter.settings.updated`, `callcenter.calls_opened`, `finance.costs.updated`, `finance.ad_spend.updated`,
    **(rev 2.1, OPE Q.26)** `integrations.outbox.replayed` (R1, meta `{ kind, topic, outboxId }`; the store-side
    counterpart of `platform.outbox.replayed`);
    R2 `commissions.rule_changed`, `payouts.approved|paid`, `webhooks.endpoint_changed`, `carriers.account_changed`,
    **(rev 2.1)** `finance.period_closed|period_reopened` (meta `{ period }`, the `accounting.closedThrough` lock, OPE-§16.8);
    R3 `api_keys.created|revoked`; `blocklist.added|removed` keep their names with `store_id`;
  - landing (LAN Q35, LAN-§23.6): `store.delivery.updated`, `store.policies.updated`, `store.landing_settings.updated`,
    `page.proof_attested`, `page.countdown_extended`, `page.test_link_created`, `page.slug_moved`, `page.attached|detached`,
    `page.copied_out|copied_in`, `page.scheduled_publish`, `lead.phone_revealed`, `lead.converted`, `campaign.created|shared|share_revoked`,
    `link.created|paused`, `experiment.started|stopped|applied`;
  - storefront (STO-R21, trimmed in rev 2.1 per STO-R27): `store.catalog.*`, `store.inventory.adjusted`,
    `store.storefront.*`, `store.review.*`, `store.coupon.*`. The attach / detach flow writes **landing's**
    `page.attached` / `page.detached` with meta `{ productId }` whichever screen starts it (builder or product editor,
    STO-§17.3); `store.landing.attached|detached` are **dropped** (one audit name per event);
  - ai (AI R10): `store.ai.settings_updated|voice_updated|memory_added|memory_deleted`, `platform.ai.settings_changed|key_set|key_removed|model_changed|model_emergency_switch|prompt_activated|cap_changed|eval_started|batch_canceled|transport_changed`,
    plus `store.ai.proposal_executed` (every executed copilot proposal names its `ai_run_id`, rethink-ai §5.6);
  - design (DES-R15): `store.brand.updated`, `store.theme.activated`, `page.publish.design_override`, `platform.design.changed`;
  - core: `page.publish.budget_override` (a staff-only override of a soft budget gate, §M.2);
  - **rev 3:** operations (OPE Q.27m) `orders.carrier_exported` (R1, `{ count }`), `callcenter.label_mapped` (R1,
    `{ label, count }`), `finance.settings.updated` (R1), `orders.refunded` (R2, `{ cents, method }`); ai (AI R40)
    `platform.ai.director_default_changed`, `platform.ai.prompt_rolled_back`; landing (ENGP-8) `page.fact_attested`
    (`{ field, value }`); core `store.preview_link.revoked` (SEC-7), `auth.step_up` (`{ method: "totp" \| "password" }`,
    SEC-17), `store.brand_term.refused` (D76, meta `{ field }`; rev 4: no term in the meta, PLA PD70, so a tenant-visible
    row never reveals which protected term matched), `platform.abuse.reported` (`{ storeId, reason }`, no reporter data).
  - **rev 4:** `platform.user.deleted` (`{ reason }`, the staff path of `deleteUserAccount`) and `auth.account.deleted`
    (self-service, no meta) (PLA Q4.7, SEC-20); **`meta.stepUp: "totp" | "password"`** is written on `store.export_requested`,
    `store.closed`, `store.member.role_changed` (to `admin` / `owner`), `orders.exported`, `orders.carrier_exported`,
    every secret-write row under `integrations.manage` (`integrations.sheets.connected`, `integrations.telegram.changed`,
    `integrations.conversions.changed`, the export key) and, in R2, `finance.period_closed|period_reopened` (§B.7, PLA
    Q4.8, OPE OD64). Platform's `store.brand_refused` is the same event as `store.brand_term.refused` and takes the
    core's name (rev 5, CRIT2-14: platform.md now writes `store.brand_term.refused` everywhere).
- `auth.login.*` rows stay platform-only (`store_id` NULL). Tenants see only rows with their `store_id`, including
  platform actions on their store (with the staff member's display name, never the staff IP hash).
- Redaction (`src/lib/audit.ts:57-84`) unchanged; meta ≤ 4 KB. Retention: 400 days, then rolled up (OS-11).
- R3 (SE-08): `prev_hash`/`row_hash` HMAC chain per row (purpose `audit-chain`), a weekly break-glass review view.

### F.6 Security headers on every response (D31)

Today the neutral 404 (`UNKNOWN_PAGE_HEADERS`, `src/lib/auth/unknown-page.ts:52-56`) carries no security header. Target
sets (`src/lib/security/headers.ts` exports one function per class; `HSTS` = `max-age=63072000` in production; **rev 3
(SEC-15): host-class aware**: on the platform host once S mode is on, `max-age=63072000; includeSubDomains` (every
`*.<STORE_ROOT_DOMAIN>` is a Store Gen tenant, so a first `http://<handle>.<root>` visit from an ad is protected too;
`preload` once the owner accepts the commitment), no `includeSubDomains` in P mode, on legacy hosts and on R3 custom
domains; `qa:headers` asserts both):

| Response class | Producer | Headers |
|---|---|---|
| Neutral 404 / 410 / 503 (proxy, route handlers, fallback rewrite, hidden cron) | `UNKNOWN_PAGE_HEADERS`, `unavailablePageHeaders()` | today's set + `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Content-Security-Policy: default-src 'none'; style-src 'sha256-<hash of the inline style>'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, HSTS. **Byte-identical across every producer** (the 404-uniformity rule stays). |
| Platform UI (console, dashboard, auth, report, kit share page, marketing) | proxy (`platformUiHeaders(nonce)`, today's `adminSecurityHeaders`) | nonce CSP, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: same-origin` (`no-referrer` only on `/kit/*`, rev 3 ENGC-16) (marketing: indexable, `Cache-Control: public, max-age=0, s-maxage=300`); `/app/manifest.webmanifest`: no nonce headers, `Content-Type: application/manifest+json`, **`Cache-Control: public, max-age=3600`, no session** (rev 3, ENGC-24 / SEC-25) |
| Store documents (landing, store pages, legal, track, thank-you, **test renders**) | `documentResponse` (`src/lib/render/serve.server.ts:162`) | the stored hash CSP (per host, §C.9; `connect-src` / `form-action` narrowed to `<serving origin>/api/public/`, never a bare `'self'`, SEC-2) — for test renders the CSP is computed from the rendered add-on set with no pixel hashes — COOP `same-origin-allow-popups`, base headers; live documents `public, max-age=0, must-revalidate, s-maxage=60` **plus `CDN-Cache-Control: no-store` while `via = edge`** until OS-12's host-keyed cache exists (rev 3, ENGC-2); track, thank-you and test renders `private, no-store`, test renders also `X-Robots-Tag: noindex` |
| Public JSON APIs (`/api/public/**` incl. `wa`, `store/*` R2, `exp`, `upsell-chain` R3; `/api/app/<h>/pulse` adds `ETag` and answers `304`) | `apiHeaders` (`src/lib/orders/http.ts:26`) | base headers + `Cache-Control: no-store` + CORS only for allowed exports |
| Store REST (`/api/v1/**`, R3) | `apiHeaders` | base headers, `no-store`, `WWW-Authenticate: Bearer` on 401, never a cookie read |
| Media | media route | today's sandbox CSP, nosniff, CORP (unchanged) + HSTS |
| Redirects (303 gate, 307/308) | proxy, store routes | base headers, `Cache-Control: private, no-store` (308 canonical: `public, max-age=300`; **the `/go/<code>` 308 is not canonical and stays `private, no-store`**, rev 2.1, LAN-§12.1; `qa:headers` asserts both) |
| `/api/health` | route | base headers, `Cache-Control: no-store` |

Checked by `scripts/qa/headers-check.ts` against a production build (§J.3): every class, every host class, and a
diff of the 404 header sets across producers.

### F.7 CSRF and Origin

§C.9. Server actions additionally rely on Next's built-in Origin vs `x-forwarded-host`/`host` check
(`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:13`); no
`allowedOrigins` entry is added in R1 (the apex never runs behind the Worker, R-D4). A store host posting an action
fails three times: Worker 404, proxy 404, Next origin mismatch (Origin = the store host, Host = the apex).

### F.8 Signup abuse

Turnstile (platform widget; **a gate in `approval` and `open`**, D69) · scrypt semaphore (§B.3) · `p:signup:*` buckets ·
`scoreSignup()` signals (disposable list vendored as `src/lib/platform/data/disposable-domains.json` from the CC0 list,
MX lookup 2 s fail-open, `protected_brands` match on name/handle/e-mail local part, identity links, velocity, bot UA,
too-fast form) · the pending sandbox (nothing public, no integrations) **inside the D69 ceilings** (sandboxes per day,
one shared disk budget, the pending AI slice, the two-tier media cap) · invite mode on the temporary domain (D9) ·
brand-protected handles **and the live brand check on every name write plus the at-least-nightly `platform:brand_term_live`
rule** (D76) · the `honesty:password_field` publish gate · "Report this store" on every public page · nothing
auto-rejected at launch (R-D12).

### F.9 Data export and deletion per store (PL-09, R-D13)

**Export ZIP** (`store.export` ↑ for owner/admin; in the console only a super_admin with `stores.close` ↑ and a
reason, audited and notified to the store, e.g. for a store being closed): an `export_jobs` row
built by the cron in slices (§H.2) into `DATA_DIR/exports/<storeId>/<jobId>/`, then zipped (stored, not deflated,
for media) into parts of ≤ 500 MB. Content: `orders.csv` (every column, phones full), `leads.csv`, `customers.csv`,
`order_events.csv`, `pages/<slug>/{doc.json, index.html, merci.html}` (published versions), `drafts/<slug>.json`,
`media/<assetId>.<ext>` (largest stored variant), `settings.json` (**every secret key omitted**, other keys through
`redactSetting`), `members.csv` (name, e-mail, role, status), `audit.csv` (store rows), `README.txt` (ar/fr/en).
**Rev 2 additions:** `agent_stats_daily.csv`, `message_templates.csv`, `campaigns.json` (kits without share tokens),
`short_links.csv`, `delivery_zones.json`, `ai_memory.json` (active and inactive explicit + learned items, no evidence
run ids, AI R17), `health.json` (the latest snapshot); R2: `products/<slug>.json`, `collections.json`, `inventory.csv`,
`inventory_moves.csv`, the store template docs (STO-R22), `shipments.csv`, `remittances.csv`, `remittance_lines.csv`,
`ad_spend.csv`, `expenses.csv` + `receipts/`, `product_costs.csv`, `agent_earnings.csv`, `payouts.csv`,
`finance_daily.csv` (OPE Q.20); R3: `reviews.csv`, `coupons.csv`. **Never exported:** `capi_ctx`, the Telegram token,
carrier credentials, webhook secrets, API key hashes, share and test tokens, `ai_runs` outputs, the `store_health.flags`
console codes.
Download: `/api/app/<h>/exports/<jobId>/<part>?t=<sig>` with a session that still has `store.export`; signature =
`hmac(jobId|part|exp, "export-dl:<storeId>")`, valid 24 h; parts deleted after 72 h. Audit on request and on each
download.

**Deletion**: `scheduled_deletion` → purge job (§H.9) deletes, in slices of ≤ 2,000 rows and ≤ 15 s per tick. **The
table set is enumerated from `schema.ts`, not from this document (rev 3, ENGC-31):** every `mysqlTable` with a
`store_id` column (the lint's tenant set, §F.1) is deleted `WHERE store_id = ?` in a dependency-free order (only the
store FK exists, D29): the queue and job tables first (outbox, render_jobs, export_jobs and their files, ai_* incl.
`ai_jobs`, `ai_batch_items`, `ai_usage_daily`, `preview_tokens`), then design_genomes and headline_shingles (by
`owner_tag`), campaigns, short_links, page_slug_history, integration_status, profit_alerts, product_costs,
carrier_rates, ad_spend_daily, every R2/R3 tenant table (covered the day it is added), order_events, agent tables,
saved_views, message_templates, delivery_zones, sheet_bindings, notifications, job_runs and error_events rows of the
store, leads, orders, customers, stats, page_versions, pages, exports, asset_refs, then **every per-store area of the
`DATA_AREAS` registry (§G.7)** — `media/v1/<xx>/<storeId>/`, `exports/<storeId>/`, `imports/<storeId>/`,
`receipts/<storeId>/`, **`ai/<storeId>/`** (rev 3, SEC-21: deep-pass blobs were missing from this list) — then
`media_files`/`media_chunks`/`assets`, store_settings, store_entitlements, store_usage, store_subscriptions,
store_invites, store_members, `store_health` (PLA Q.1), then the tombstone (§A.5.1). `test:migrate` asserts the
enumerated set equals the §D.3 rows and `test:storage` asserts that no path under `DATA_DIR/*/<storeId>` survives a
purge. Kept: `audit_log` rows with `redactMetaForPurge` applied (**the PII key list is explicit, rev 3 SEC-20:**
`email`, `phone`, `name`, `address`, `landmark`, `note`, `city`, `ua`, every `*_norm` key, and today's secret regex of
`src/lib/audit.ts:60`), `impersonation_sessions`, `platform_requests` and `abuse_reports` for 400 days,
`legal_acceptances` with `ua` nulled (proof of acceptance), `signup_reviews` with `signals` and `business_context`
nulled, `platform_notes` **soft-deleted** (`deleted_at` set, `body` replaced by "[purged]": staff type names and phone
details into notes), `store_handle_history`. **Backups (rev 3, SEC-20):** the purge appends the store id to the
platform setting `backup.purgeRequests`; the next `backup` run filters every slice `WHERE store_id NOT IN (…)` and
drops the id once the oldest retained snapshot (4 weeks) no longer contains it, so deletion is complete within one
weekly cycle and the privacy template states that window. **Account deletion (rev 3, SEC-20):** `deleteUserAccount(ctx:
UserCtx | PlatformCtx, target?: { userId; reason })` (T2 signature frozen at C0, §E.2; rev 4 PLA Q4.7: the staff path
`users.manage` ↑ with `target` in R1 through P1's user profile, owner self-service from `/app/account/danger` with no
target, P2 R1; it refuses `owns_store` while the user owns a store that is not purged and `is_staff` while a platform
role is set, so a staff account is demoted first) anonymises `users` (e-mail → `deleted+<ulid>@invalid`, name,
phone, locale nulled, `disabled = 1`), deletes `identity_links`, `sessions`, `password_resets` and
`notification_reads`, keeps `legal_acceptances` with `ua` nulled and `audit_log` rows with the user id, and audits
`platform.user.deleted` / `auth.account.deleted`. All of this is `needs_legal_review` for the lawyer pass. Retention for
legal reasons is **[unverified]** (platform-admin.md §7): until a lawyer answers, orders are not kept after purge.

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

Console lists and the store profile show masked phones (`06 •• •• 12 34`), first name + initial, city; **impersonation
shows the same masked values** (D70: the same `Masked` type, applied by the repositories). A one-order
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
  /** durable before it resolves (fs: temp file + fsync + rename + fsync(dir)). rev 3 (ENGC-20): IDEMPOTENT — when the key exists and the
   *  existing file's sha256 equals the incoming one, resolve at once; otherwise replace atomically (temp + rename). A crash between the
   *  file write and the DB insert therefore never blocks the same upload for the sweeper's hour (test:storage case). */
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
- **Boot check** (`src/lib/media/storage/check.ts`, run in `instrumentation.ts` before serving; rev 3, ENGC-14): the
  path is absolute; `realpath` is not inside `process.cwd()` nor under any `public_html` segment; it is not a symlink;
  on POSIX it is owned by `process.getuid()` (**skipped on `win32`**, where `getuid` is undefined and the owner develops);
  a probe file can be written, fsynced, renamed and deleted; **an owner marker** `DATA_DIR/.sg-owner` =
  `{ app: "store-gen", db: <database name> }` is written on first boot and a mismatch refuses the directory (the account
  is shared with COD Studio, MED-07: two apps pointed at one `DATA_DIR` by a copy-paste of env values would sweep each
  other's files). **No `fs.statfs`**: on Hostinger the quota is per account and `statfs` reports the volume, so the
  check and the health tile use a **bounded walk** of `DATA_DIR` against `DATA_DIR_BUDGET_BYTES` (§H.7; default 20 GiB;
  alarms at 70 % / 85 %, the nightly snapshot of §H.5 refreshes it). Failure → `[boot] ERROR media storage …` +
  `mediaBackend() = db` + a red health tile; it never stops the app. Whether `/home/u641677794/storegen-data` survives
  Hostinger's archive deploy is **[unverified]** until the R1.0 smoke (§H.10) shows the probe file persisting across two
  deploys.
- Inodes: ~9 files per image (master + variants + AVIF). Hostinger Business allows 600,000 inodes plan-wide
  (domains.md §1.2), shared with every site on the account: the health page shows the file count from the same walk
  and the console warns at 300,000.

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
4. For a **`pending` store first** `chargePlatformUsage("pending_media_bytes", "total", Σ variant bytes, { limit:
   platform.signup.pendingMediaTotalMiB × MiB })` (rev 3, D69; a `QuotaError` here is also 413 `{ error: "quota" }` with
   the sandbox message), then `chargeUsage(scope, media_bytes, Σ variant bytes)` against the two-tier pending cap or the
   plan; `QuotaError` → 413 `{ error: "quota" }` (the message never shows the platform DB percentage, MED-13). The
   whole-DB guard (`DB_QUOTA_MB`, warn 70 % / block 85 %) stays as a platform floor for the DB backend only.
5. Files written through `mediaBackend().put` (durable, idempotent) **before** the DB transaction that inserts `assets`
   (with `store_id`, `stored_bytes`) and `media_files` (with `store_id`, `storage`).
6. Any failure after step 4 → refund both counters + remove written files, in the same `finally`.

The upload pipeline files `src/lib/media/{process.ts, assets.ts, upload-slots.ts}` are **P8's in R1 product** (rev 3,
ENGC-32: steps 4-6 live there; T4 hands them over at the R1.0 integration), so P8 never needs a CCR on the critical
upload path.

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
uploads, 30-day retention) · `DATA_DIR/receipts/<storeId>/` (R2 expense receipts, OPE Q.14: not media, no variants,
≤ 2 MB each, served only through `/api/app/<h>/finance/receipts/<id>` with `finance.read`) · `DATA_DIR/ai/<storeId>/`
(deep-pass result blobs > 64 KB referenced by `ai_jobs.result.outputRef`, 30-day retention) · `DATA_DIR/cache/media/`
(disk cache, 512 MB budget, today's trim logic). Every path is built by `dataPath(area, storeId?, …)`
(`src/lib/storage/paths.ts`), which refuses `..`, absolute segments and ids not matching `^[0-9A-HJKMNP-TV-Z]{26}$`.
**The areas are a registry (rev 3, SEC-21):** `DATA_AREAS = { media: { perStore: true, root: "media/v1" }, exports: {
perStore: true }, imports: { perStore: true }, receipts: { perStore: true }, ai: { perStore: true }, backups: {
perStore: false }, cache: { perStore: false } }` in `paths.ts`; `dataPath` accepts only a registered area, the purge
iterates every `perStore` area after the table pass (§F.9) and `test:storage` asserts that no path under
`DATA_DIR/<area>/<storeId>` or `DATA_DIR/media/v1/<xx>/<storeId>` survives a purge, so a new area is deleted without
editing §F.9.

---

## H. Jobs and ops

### H.1 The outbox (R-D25, D24)

```ts
// src/lib/jobs/outbox.ts
export type OutboxKind = "webhook" | "capi" | "telegram" | "whatsapp" | "mail" | "carrier" | "push" /* 0007, PLA Q.21 */;
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
  (the webhook delivery log, IN-07), dead rows 30 days. **Deliberate re-sends (rev 3, ENGC-29):** because
  `dedupe_key` is unique across every state, a second delivery with the same key would be `INSERT IGNORE`d against a
  kept `done` row; a caller that means to resend appends `:r<n>` to the key and audits it; `enqueue()`'s `{ duplicates }`
  is surfaced by the order hooks (an `error_events` row area `outbox`, code `duplicate_enqueue`, never swallowed); and
  `replay(ctx, id)` accepts `done` rows too for kinds where a re-send is meaningful (`webhook`, `telegram`), never for
  `capi` or `mail`.
- Caps per kind: `mail` ≤ 4/min and ≤ 150/h platform-wide (Hostinger SMTP limits are unverified, R-D51); `capi` drops
  any ad event whose `event_time` is older than **7 days minus 1 hour at send time** (a margin for clock skew and queue
  time, OPE Q.24) and records `capi_stale` on the order (R-D23); `webhook` uses the SSRF guard (SE-07, R2) and Standard
  Webhooks signatures (IN-07); `push` (R3) sends VAPID Web Push and disables a subscription after 5 consecutive failures.
- Items created for a test order (D54) are never enqueued: the hooks check `order.is_test` first; `telegram` items of a
  store that asks for test messages carry the prefix "[TEST]" and are the one exception.

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
export interface JobCtx extends SystemCtx {
  deadline: number; tickId: string; cursor: string; setCursor(c: string): Promise<void>;
  /** rev 3 (ENGC-11): jobs await it between units of work (setImmediate), so the serving event loop breathes */
  yield(): Promise<void>;
  /** rev 3: the runner's current event-loop lag estimate; renders and backups shorten their own budget when it is > 100 ms */
  lagMs(): number;
}
export function runTick(opts?: { budgetMs?: number /* default 100_000 */ }): Promise<TickReport>;   // rev 5 (CRIT2-18): takes the tick LEASE first (a cron_cursors row, no pooled connection held), not platformLock("tick"): not acquired → 200 { skipped: true } (rev 3, ENGC-11)
// src/lib/jobs/registry.ts imports the track files src/lib/jobs/tracks/<track>.ts (each exports `jobs: Job[]`)
```

Tick budget: 100 s total inside the 120 s route cap (`maxDuration = 120`, `src/app/api/cron/tick/route.ts:25`).
**The tick shares the serving process (rev 3, ENGC-11):** `runTick()` holds the **tick lease** for its whole duration
(rev 5, CRIT2-18: rev 3's `platformLock("tick")` held one of the two lock-pool connections for ~100 s, and with
`sheets.push` holding the other the request-path locks of §E.7 had none left; the lease holds no connection: the
`cron_cursors` row `job = 'tick'`, seeded by 0005, acquired by one compare-and-set ``UPDATE cron_cursors SET `cursor` =
:tickId, updated_at = now(3) WHERE job = 'tick' AND (`cursor` = '' OR updated_at < now(3) - INTERVAL 110 SECOND)`` with
`affectedRows === 1`, renewed at every job boundary by ``UPDATE … SET updated_at = now(3) WHERE job = 'tick' AND `cursor` =
:tickId``, released in `finally` by setting `` `cursor` = '' `` under the same predicate; a crashed tick's lease expires after
110 s, inside the 5-minute cron period; **P0 review G5:** `cursor` (and `profit_alerts.key`) are reserved words in
MariaDB 10.4 and MySQL 8, so raw SQL quotes them with backticks as `src/lib/jobs/scope.ts` does (unquoted, all three
statements fail with ER 1064); P8 may also run ``INSERT IGNORE INTO cron_cursors (job, `cursor`, updated_at) VALUES
('tick', '', UTC_TIMESTAMP(3))`` before the compare-and-set, so a lost seed row cannot turn every tick into
`{ skipped: true }`), so a manual `curl` plus the cron, or a late hPanel firing, never run two ticks
that race `cron_cursors` and the `dailyAt` bookkeeping (the second answers `{ skipped: true }`); every job awaits `ctx.yield()` between units; the runner
samples event-loop lag and, when lag p95 > 100 ms, shortens the budget of the CPU-bound jobs (`renders`, `backup`,
`exports`) for the rest of the tick; renders are capped by a **per-tick CPU budget of 4 s** (measured with
`performance.now()` around SSR + gzip), not by a page count; `job_runs.summary` of the tick row records `lagP95Ms`,
`skipped` and `cpuMs` per job, shown on `/admin/health`. Default order and slices (a job that has nothing to do returns
at once and its unused time flows to the next; the guaranteed slices sum to **95 s**, the remaining 5 s is the leftover
slot 9 may use, PLA Q.18):

| # | Slot | Jobs registered (track file) | Every | Budget | Per-store fairness |
|---|---|---|---|---|---|
| 1 | `sheets.push` (IN-01; `integrations.ts`, P5) | push | tick | 18 s | ordered by **oldest pending order first** (rev 3, ENGC-33; not plain round-robin) over stores matching the **`pending_sheets` predicate** = bound and enabled and (`sheet_status` pending / failed past backoff, or `sheet_dirty > 0`, or a pull due); **≤ 3 Sheets calls per store per tick** (one read, one append, one batchUpdate; the read also serves the pull, OPE Q.11); platform bucket `p:sheets:sa` 50 / 60 s for the shared service account (R-D24). **Capacity (rev 3):** `floor(50 / 3)` ≈ **16 stores per tick** when every one has work, i.e. a store is served every `ceil(active / 16)` ticks; the backlog alarm of §H.5 scales with that figure, and the remedy past ~40 active Sheets stores is the per-store `sheets_sa` (OPE Q.3d, R2) |
| 2 | `sheets.pull` (P5) | pull | tick | 12 s | `s:<sid>:sheets:pull` ≤ 1 per 290 s per store, round-robin cursor; stores served by slot 1's read are skipped |
| 3 | `outbox` (core drainer; handlers `capi`, `telegram` P5; `webhook` S5 R2; `carrier`, `whatsapp` D2 R3; `mail` S5 R2; `push` D5 R3) | drain | tick | 13 s shared | `perStorePerTick` per handler (`capi` 20, `telegram` 10, `webhook` 20, `carrier` ≤ 50 shipments), then the next store |
| 4 | `renders` (§H.3, P8) | render | tick | 12 s | ≤ 10 pages per store per tick **and ≤ 4 s of CPU per tick** (rev 3, ENGC-11); every render job of an attached page (`pages.product_id` set), whatever its reason, handled by `republishAttached` (P3/S1, R2), which picks `sync` vs in place by diff (§H.3, rev 5 CRIT2-17) |
| 4b | `ai.batches` (`ai.ts`, P7; AI R8) | poll / ingest / submit Message Batches | tick | 8 s | items across stores in one batch; ingestion idempotent per item, resumes next tick; **skipped** (not failed) when `ai_generation_enabled` is off for submission (open batches still ingested, §H.8) |
| 4c | `ai.jobs` (`ai.ts`, P7; D56, §H.12) | orphan recovery **and the batch hand-off** of driverless `ai_jobs` stages | tick | **1 s guaranteed + the leftover of slots 1-5, up to 5 s** (rev 4, AI R41: DB writes only) | marks orphans (a `running` job with `heartbeat_at` older than 60 s has its stage re-claimed once, `stage_attempts`, then `failed` with the instant result kept) and expires `queued` rows nobody polled for 30 min; **the cron never runs a model call inside the tick** (rev 4, AI R41 option b: a ≤ 90 s stage cannot fit a slot without starving slots 5-9, and at the tick's tail the 95 s it needs is never left once slot 9 has run): a job with no live lease, no poll and no `after()` for 60 s has its next stage submitted as a **one-item Message Batch** (`batch:<stage>`, collected by slot 4b, milliseconds of tick time), so the cron is still the third driver of a stage-resumable job; the poll request is the primary driver (AI-§B.13) |
| 5 | `exports`, `backup`, `purge` (§F.9, §H.6, §H.9; P8), `imports.commit` (S3, R2) | tick | 11 s shared | one job row at a time, resumable cursor; `imports.commit` in slices of 2,000 rows |
| 6 | nightly / hourly: `media.migrate`, `usage.reconcile` (nightly), `rollups` (`agent_stats_daily` via `ops.rollup` 02:40 P4, `finance_daily` via `fin.rollup` 03:40 S3 R2, `store_daily_rollup` R3), `ops.customers_reconcile` 03:10 (P4), `fin.alerts` 04:00 (P4, SF-04, stores with `finance_lite`), `fin.recurring`, `money.close_period` (S3 R2), `ai.rollups` (hourly, 5 s, P7), `ai.reconcile` (hourly, 2 s, P7), `ai.retention` 03:50 (P7), `design.retention` 03:50, `design.shingles` 04:10, `design.archive` 04:20 R3 (P6/D4), `leads.followups` (hourly, P3), `delivery.holidays_review` 08:00 store tz (P3), `experiments.weights` 04:00 R3 (D3), R3 ai: `ai.distill` 02:40, `ai.genes` 02:55, `ai.genes_platform` Mon 03:10, `ai.risk_train` 03:20, `ai.insights` Mon 06:00; **R2 storefront (S1, `storefront.ts`, rev 2.1 placement):** `catalog.stock_reconcile` 02:20, `catalog.collections` 02:30, `catalog.bestsellers` 03:40 (shares the tick with `fin.rollup`: two daily jobs, the cap) | tick / hourly / daily | 8 s shared | cursor over stores; each job ≤ its own budget (AI-§N, OPE-§J, DES-§24.1, LAN-§23.4, STO-§27.2); daily jobs are spread over the 02:00-04:30 ticks so no single tick carries more than two |
| 7 | `lifecycle` (closed → scheduled_deletion, rejected purge, impersonation expiry, invite expiry, `staff_invites` expiry; core), `ops.presence` (1 s, P4: silent > 15 min → offline, one statement `// tenancy: platform presence sweep`), `sheets.bind_legacy` (≤ 50 ms, P5), `int.telegram_daily` (hourly, ≤ 2 s, P5), `links.flush` (1 s, P3), `design.reserve` (2 s, P6), `design.backfill` (2 s until done, P6), `experiments.autoend` (1 s, R3), `landing.schedules` (5 s, R3), `pages.copy` (R2), `stock.holds_expire` (1 s, R3, S1/D3) | tick | 5 s shared | — (most are no-ops on a quiet tick; `landing.schedules` and `pages.copy` yield to the next tick when the slot is spent) |
| 8 | `housekeeping` (rate-limit buckets incl. `ai_credits_day` rows > 7 days, visitor markers > 2 days, sessions, leads > 30 days, retention §H.11, `ops.capi_ctx_purge` 03:20 P5, `imports.cleanup`, `ship.raw_purge` R2) | tick | 4 s | global (trimmed from 5 s, PLA Q.18) |
| 9 | `platform.*` (`platform.ts`, P1): `platform.health` (§I.7; **budget-driven**: dirty rows first, then the oldest snapshots, until `ctx.deadline`; rev 3, ENGC-25: no fixed store count), `platform.alarms` (PLA-§15.2), `platform.requests` (expire and execute `platform_requests`), `platform.entitlements` (hourly: expired boosts and overrides) | tick / hourly | **3 s guaranteed + up to 6 s of leftover** | health: `sh_due_idx` order; never writes a tenant table; `job_runs.summary` records the per-store median cost so the staleness figure of §I.7 is measured |

Each job run writes one `job_runs` row (store-level jobs: one row per store visited when it did work, else one summary
row); `job_runs` older than 14 days are deleted. The round-robin cursor of each per-store job lives in `cron_cursors`
(next store id after the last one served), so one slow store never starves the others; a store whose step throws is
skipped for the rest of the tick and logged (`step()` isolation, `route.ts:31-39`). **Last-tick alarm**: no
`job_runs` row in 10 minutes → red health tile and a staff notification. A job may only be registered from its
track's `src/lib/jobs/tracks/<track>.ts` file (§K.3); the registry test (`test:jobs`) fails when the guaranteed
budgets of the registered jobs exceed 95 s or a job declares no budget.

### H.3 Render queue (D25)

- `enqueueRenders(scope, pageIds | "all-live", reason, priority)` inserts `render_jobs` with `dedupe = pageId`
  (`INSERT IGNORE`: one **pending** job per page). **The claim `UPDATE` (state → `running`) sets `dedupe = NULL`**
  (rev 3, ENGC-4), so a change that arrives while a render runs enqueues a second, pending job instead of being
  ignored, and the runner processes it on a later tick with the newer context: an address, brand or `store_info` change
  one second after a claim can no longer be lost. `test:jobs`: enqueue during a running render yields a second render
  after completion; two enqueues while pending yield one.
- Triggers and reasons (`render_jobs.reason`, appended in rev 2 and rev 3; the §D.5 enum lists them all): handle rename,
  S mode on, primary custom domain (`address`); a logo, mark or store-name change (`brand`, **R1** per DES-R4 B: one
  brand across live pages without touching docs); store theme activation (`theme`, R2); store contacts, policies, the
  calling window (rev 4, LAN N2: P4's `saveCallingWindowAction` enqueues it, the thank-you bakes the hours) or zone
  fallback text that live pages bake in (`store_info`, 0005, LAN Q8: thank-you, legal and tracking documents); the
  Purchase trigger or a per-page override change (`conversions`, 0005, OPE Q.6: priority 4; the thank-you document omits
  the `pixels` chunk when the store render context's `purchaseInBrowser` is false, i.e. `triggerFor(page) !== "order"`,
  zero runtime bytes, runtime config v2 unchanged); **a BiRefNet mask landing for an asset whose live pages render it
  with an estimated cutout (`cutout`, 0005, rev 3 UX-39 / DES-R22: enqueued by the media pipeline, the re-render swaps
  `framed-stage` → `cutout-stage` in place; P8 handler, DES-§4.11)**; a product change for attached landings
  (`product`, R2, R-D42; any job of an attached page runs through `republishAttached`, by diff, below); verified reviews changed on a page (`reviews`, 0007, STO-R6); a runtime fix that needs live
  pages rebuilt (`runtime`, owner action in the console).
- The `renders` job claims jobs (lease pattern of §H.1), renders through `renderAndCommit` with the store context of
  **now** (base, origin, identity, Turnstile, resolver, `addons`, `purchaseInBrowser`) and the **published version's
  doc**, and rewrites only the rendered columns (`html`, `thank_you_html`, `csp`, `thank_you_csp`, `etag`, and from
  0006 `product_rev`, STO-R6) of that published version row under the same row lock / compare-and-set (D50). The doc,
  checksum and `runtime_v` never change (the payload contract an open tab relies on stays the same; a version with
  `runtime_v = 1`, which no Store Gen page has, is skipped and listed for a manual republish); no new version row is
  created (a re-render is not a publish, and 600-900 KB per version would eat the 3 GB quota). Then
  `invalidateStore(storeId)` for the render cache, and a Worker purge when edge caching exists (OS-12).
- **The one exception (D50 refined, LAN Q24; narrowed in rev 3, STO-R41 / ENGP-10; restated rev 6):** every render job of
  an attached page, **whatever its reason**, is handled by `republishAttached(scope, pageId)` (P3/S1, R2), which
  publishes a version of kind `sync` (a real publish: new row, checksum, gates) **only when the materialised mirror's
  priced fields differ from the published version doc** (the server prices orders from the version doc); when they do
  not (a stock transition or content change alone) the attached page re-renders **in place** like every other page (no
  version row; `product_rev` rewritten). `sync` versions are pruned first under `versions_kept_per_page`.
  **Rev 5 (CRIT2-17): the branch is chosen by diff, never by the job's reason or change kind.** `render_jobs` carries no
  change column and dedupes one pending job per page across **every** reason, so a pending stock, content, address or
  `store_info` job may absorb a later price change. Therefore every render job of a page with `pages.product_id` set
  (whatever its `reason`) runs through `republishAttached`, which materialises the mirror from the product **as it is
  at run time** and compares its priced fields (each item's price and compare-at, the option / variant set, every
  offer's computed total through `orderTotals`) with the **published version doc**: any difference → a `sync` version;
  none → the in-place re-render (availability from the live stock, `product_rev` rewritten). `test:storefront-db`
  (§J.2): a `stock_transition` enqueued, then a price change while that job is still pending → exactly **one** `sync`
  version carrying the new price and no in-place render of the old price; a pending `address` job followed by an
  options change → one `sync` version.
- A re-render runs the **publish-time budget and honesty gates in `warn` mode only** (§M): a re-render never refuses
  (the page is already live); items are recorded in `render_jobs.error` as notes and surface in Store Health.
- Failures retry 3 times then `failed` (visible per store in the console Domains / Health views, and as the
  `render_failed` health flag, §I.7).

### H.4 Boot tasks (`src/instrumentation.ts`)

In order, never crashing the process (today's pattern): (1) config warnings (`authConfigWarnings` + new edge, data-dir
and env-alias warnings); (2) migrations; (3) media storage check (§G.2); (4) expired sessions purge; (5) under
`withBootLock`: published checksums (`doc_schema`; store docs validated as `StorePageDoc` from R2, STO-R3),
`convertLegacyStore()` (`tenancy_v1`, §D.8), seed `protected_brands`, seed the **legal templates from code** (PLA Q.13:
`LEGAL_SEED_VERSION: number` and `LEGAL_SEED: { kind; locale; title; body; summary }[]` in
`src/lib/platform/data/legal/index.ts`; each inserted as version 1 draft with `INSERT IGNORE` on `ld_kind_loc_ver_uq`,
`needs_legal_review = 1`; marker: the platform key `legal_seed` holding the last seeded version, written last (CCR r1.0-t1-3: one key, since the registry cannot declare a key per version); R1.0 ships `LEGAL_SEED_VERSION = 0` and `[]`, P1
owns the file from R1), seed the **release/ops flags** from `src/lib/flags/registry.ts` (§D.4, marker-free `INSERT
IGNORE` + `archived` marking), `syncPromptVersions()` from `src/lib/ai/platform/prompt-versions.ts` (AI R8: idempotent
upsert of the prompt registry into `prompt_versions`, marker-free, so the console and the eval gate always find their
rows), the pixel library migration only inside the conversion; (6) non-blocking read-only checks: `[upgrade-check]`
and `[tenancy-check]` (§D.8). The boot lock name keeps `cod_boot` (frozen; renaming it would let two processes run the
tasks during the deploy that renames it).

### H.5 Observability and health (OS-09)

- `recordError(area, err, { storeId?, route? })` (`src/lib/jobs/errors.ts`) buffers in memory and flushes upserts to
  `error_events` at most every 30 s and at the end of each tick; it stores `errorSummary(err)` only (never raw
  messages: they quote bound values, `src/lib/admin-data/action.ts:45`). `logError` (`src/lib/orders/log.ts`) and the
  action wrappers call it.
- `getHealth(ctx: PlatformCtx)` (`src/lib/platform/health.ts`) returns: last tick + the last 50 `job_runs` per job,
  outbox depth by kind/state and the oldest pending per store, render queue depth, Sheets backlog per store, DB size
  total vs quota (`getDbUsage`), per table (`information_schema.tables`) and per store (`store_usage`), `DATA_DIR`
  bytes / free bytes / file count (from a nightly snapshot, not live), `error_events` of the last 24 h, build id
  (`.next/BUILD_ID`), Node version, `process.memoryUsage()`, uptime, boot warnings. **Rev 2 additions:** `edge: {
  sMode, workerVersion: string | null, lastEdgeAt: string | null, prevKeyRequests24h, badKey24h, foreignHosts24h }`
  (`workerVersion` and `lastEdgeAt` come from the kept `x-sg-worker` / `x-sg-ts` headers through the per-minute
  `scopedCache("edge")` recorder, rev 3 SEC-16), `build: { id, gateSha: string | null, gateAt: string | null }` (rev 3,
  SEC-10: the gate SHA `instrumentation.ts` logs at boot; red alarm `gate_mismatch` when it differs from the build's
  commit), `dataDir: { bytes, budgetBytes, files }` from the bounded walk (ENGC-14), `db: { poolWaitP95Ms,
  lockPoolWaitP95Ms }` (ENGC-12), `tick: { lagP95Ms, skipped24h }` (ENGC-11), `commerce: {
  lastOrderAt: string | null, ordersPerHour24: number[] }`, `sheetsTop: { storeId, oldestMin }[]` (PLA Q.25); `ai:
  AiHealth` from `aiHealth()` (AI R13, R18: provider paused/ok, open batches, orphaned jobs, cap used %, refusal rate
  24 h); `design: { genomesBytes, shinglesBytes }` with an alarm at 300 MB (DES-R12); `health: { staleSnapshots,
  dirtyRows }` for the `platform.health` job. P8 also exports, for the console: `requestStoreExport(scope, {
  requestedAs, requestedBy }): Promise<{ jobId }>`, `listExportJobs(scope)`, `exportPartStream(scope, jobId, part):
  Promise<ReadableStream | null>`, `listBackupRuns(): Promise<BackupRunSummary[]>`, `backupFiles(day): Promise<{ name;
  path; bytes }[]>`, `outboxSummary(scope)`, `renderSummary(scope)` (PLA Q.25).
- `GET /api/health` (public, burst-limited): `{ ok: boolean, app: "store-gen", db: "ok" | "down", build: "<8 chars>" }`,
  `Cache-Control: no-store` (D45). The e2e harness asserts `app === "store-gen"` before running (QA-01).
- Alarms (staff notifications, in-app): last tick > 10 min, outbox `dead` > 0 for a kind, DB > 70 % / 85 %, `DATA_DIR`
  at 70 % / 85 % of `DATA_DIR_BUDGET_BYTES` (codes **`data_dir_70` / `data_dir_85`**, rev 4 PLA Q4.9; they replace the
  old `disk_low` "disk free < 2 GiB"), inode count > 300,000, error spike
  (> 50 of one code in an hour), a store's Sheets backlog > `max(15, 5 × ceil(activeSheetsStores / 16))` minutes (rev
  3, ENGC-33: the threshold scales with the §H.2 slot-1 capacity); rev 2: AI monthly cap at 70 % / 85 % and reached,
  provider auth failure, Director unavailable, refusal spike, an `ai_jobs` orphan recovered or failed (AI-§O), design
  tables > 300 MB, `store_health` snapshots stale beyond **`max(platform.health.staleAlarmMinutes, 1.5 × cycleMin)`**
  (rev 4, PLA Q4.9 / PD78: `cycleMin` = the measured time `platform.health` needs to visit every store, §I.7, so the
  alarm `health_stale` does not fire permanently past ≈ 120 active stores) and **`health_job_slow`** (the job's
  `perStoreP50Ms` above 800 ms for three ticks in a row: a rule or a read API regressed), the detached-job probe failing
  (§H.12); **rev 3:**
  `edge_bad_key` (10 unverifiable `x-sg-edge` requests in a minute, SEC-4), `gate_mismatch` (SEC-10), `pool_wait`
  (query or lock pool wait p95 > 500 ms over 5 min, ENGC-12), `tick_lag` (event-loop lag p95 > 250 ms during a tick,
  ENGC-11), `pending_media_budget` 80 % / 95 % and `signup_capped` (D69), `abuse_reports_spike` (D76),
  `ai_pending_cap` (the pending AI slice reached); **rev 5:** `signup_unguarded` (a stored `approval` / `open` mode
  with no configured `platform_turnstile`; sign-ups fall back to `invite` until it is fixed, D9, CRIT2-13).

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
  every encrypted setting are unreadable. Purged stores leave the backups within one weekly cycle through
  `backup.purgeRequests` (§F.9, rev 3 SEC-20).

### H.7 Environment variables (platform level)

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` (+ Hostinger's 5 `DB_*` keys, unused by code) | yes | unchanged |
| `APP_SECRET` | yes | never changes after launch (HANDOFF §4) |
| `ADMIN_GATE` | yes | console only (AUTH-14) |
| `SETUP_TOKEN` | until bootstrap | first super_admin only (AUTH-15) |
| `PLATFORM_URL` | yes (R1) | platform origin; `PUBLIC_URL` is an alias for one release (set both to the same value); **read at runtime** (rev 3, ENGC-26: `src/**` reads it through `process.env` in server code only and it is not a `NEXT_PUBLIC_*` variable, so a change of it needs a restart, not a rebuild; rev 5, CRIT2-8: the one `NEXT_PUBLIC_*` read in `src/**` is `NEXT_PUBLIC_OFFERS_FEATURES`, `src/lib/page/features.ts:36`, which does need a rebuild; the R1.0 smoke greps the client bundles for the value to keep it that way) |
| `PUBLIC_URL` | alias | removed in R2 |
| `STORE_ROOT_DOMAIN`, `EDGE_KEY` | for S mode | both set = S mode on (§C.1) |
| `EDGE_KEY_PREV` | during rotation | §C.5 |
| `LEGACY_PLATFORM_HOSTS` | after the domain move | the temporary domain (D19) |
| `ADMIN_HOST`, `ADMIN_IP_ALLOWLIST` | `ADMIN_HOST` at the domain move (D44 rev 3); allowlist optional | console only; the allowlist reads `CF-Connecting-IP` behind Cloudflare (§B.7) |
| `DATA_DIR_BUDGET_BYTES` | optional | the account's disk budget for `DATA_DIR` (default 20 GiB); the boot check and the health tile measure against it (§G.2, rev 3) |
| `TRUSTED_PROXY_HOPS`, `BEHIND_CLOUDFLARE` | yes | `BEHIND_CLOUDFLARE=1` after the move |
| `CRON_KEY` | yes | header form |
| `APP_TIMEZONE` | optional | **platform** default timezone for jobs and new stores (stores have their own, SET-08) |
| `DB_QUOTA_MB` | optional | platform DB guard (default 3,072) |
| `DATA_DIR` | yes (R1) | §G.2 |
| `MEDIA_DIR`, `MEDIA_CACHE_DIR` | optional | §G.2 |
| `GOOGLE_SA_JSON_B64` | for Sheets | shared service account; tenants see only its e-mail (ADM-35) |
| `GOOGLE_EXPORT_SA_JSON_B64` | **removed** | EXP-03 |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | optional | defaults of `platform_turnstile` |
| `ANTHROPIC_API_KEY` | optional | the **fallback** when the console secret `platform_ai_secret.apiKey` is empty (AI R6); unset and no console key = cloud AI off (D40); the monthly cap lives in `platform_ai` |
| `NEXT_PUBLIC_OFFERS_FEATURES` | optional | build-time (inlined into client bundles by Next, `src/lib/page/features.ts:36`): a change needs a **rebuild**, the one env key that does (rev 5, CRIT2-8); entitlements layer on top |
| `SMTP_URL`, `MAIL_FROM` | optional | the R1 mail transport (§B.10, `src/lib/mail/index.ts`; CCR r1.0-t2-4): `smtps://<user>:<password>@smtp.hostinger.com:465` (or `smtp://…:587` with STARTTLS) and `"Store Gen <no-reply@your-domain>"`; both unset = mail off (`mailer().enabled === false`, links shown to copy); a pair that does not parse is logged once, never its values, and mail stays off |
| `SG_TEST_CONTEXT` | tests only | never set in production (§E.4) |

Hostinger's `hosting_nodejs_replace-environment-variables` is a **full replace**: the R1.0 deploy sends the 14 current
keys + `PLATFORM_URL` + `DATA_DIR` (16; `DATA_DIR_BUDGET_BYTES` when the default is wrong); the domain move adds
`STORE_ROOT_DOMAIN`, `EDGE_KEY`, `LEGACY_PLATFORM_HOSTS`, `ADMIN_HOST` and flips `BEHIND_CLOUDFLARE` (20). Values come
from the local git-ignored `.env.hostinger`, never printed.

**Database connection budget (rev 3, ENGC-12):** the query pool holds 6 connections (`src/lib/db/client.ts:20`), the
lock pool 2 (§E.7; rev 5, CRIT2-18: shared by the tick's jobs, which hold at most one at a time, and the request-path
locks; the tick mutex itself is a lease row and holds none), the media read pool 2 (`src/lib/media/store.ts:30-36`): **10** per process. Hostinger's
`max_user_connections` for the account is **[unverified]**; the R1.0 smoke reads `SHOW VARIABLES LIKE
'max_user_connections'` and records it in HANDOFF; if it is below 10 + COD Studio's pool, the two apps' pools are
trimmed in `.env.hostinger` (`DB_POOL_SIZE`, default 6) before the deploy. `getHealth().db` shows pool wait p95.

### H.8 Kill switches and platform read-only (PL-12)

`flags` rows of kind `kill` (seeded in 0004), read through `scopedCache("flags")` (30 s). Effects: `signups_enabled`
(signup and invite-accept forms show "closed for now"), `publishing_enabled` (publish → `feature_off`),
`ai_generation_enabled` (cloud and server tasks off, **Message Batch submission and the cache pre-warm stop** while
open batches are still polled and ingested because they are already paid, AI R25; `ai_jobs` in `queued` wait, `running`
ones finish their current stage; local and library keep working), `sheets_sync_enabled` (Sheets
jobs skip; orders keep `pending`), `capi_enabled` (outbox `capi` handler pauses, items wait), `uploads_enabled`,
`platform_read_only` (every `storeAction` / `platformAction` write refused with `read_only`, except
`kill.manage` itself; **public order, lead and event APIs keep working** and orders keep reaching Sheets). Each change
needs `kill.manage` ↑, is audited, and shows a banner in every dashboard it affects.

### H.9 Purge job

`purge` (§H.2 slot 5) takes one store in `scheduled_deletion` whose `purge_after` has passed (or a confirmed immediate
purge), deletes the tables enumerated from `schema.ts` and the `DATA_AREAS` registry in the order of §F.9 in slices,
records progress in `cron_cursors` (`purge:<storeId>`), and finally writes the tombstone and the handle quarantine. A
purge never runs as a cascade or in one request.

### H.10 Upgrade dry-run gate and deploy impact

- Before every R1 deploy: `npm run qa:upgrade-dry-run -- --db <url>` on the XAMPP DB **and** on a fresh dump of
  production imported into XAMPP (OFFERS §I.3 discipline); the tenancy section must report 0 problems.
- **Every deploy is gated by a file the gate writes (rev 3, SEC-10):** `scripts/deploy/archive.mjs` (the HANDOFF §4
  archive method turned into a script; the maintainer writes it in R1.0) refuses to build the archive unless
  `qa/.gate-ok` exists, names the current `git rev-parse HEAD` and is younger than 24 h; only a green `npm run gate`
  (which includes `test:tenancy`, `qa:edge-sim`, `qa:action-replay`) writes that file. `instrumentation.ts` logs the gate
  SHA at boot and `getHealth().build.gateSha` shows it with a red alarm when it differs from the build's commit. HANDOFF
  §4 gains the step at its next revision. Nothing in this project is deployed from a build that never saw the lint,
  the attack suite and the edge simulation.
- **R1.0 deploy** (first tenancy build): env full replace (16 keys, §H.7); create nothing by hand (the boot check
  creates `DATA_DIR` subfolders when the parent is writable); cron line changed to the header form; build; boot runs
  0004 (+ conversion if the owner already used the old setup). Smoke (HANDOFF §4 step 7, updated): `/` 200 marketing ·
  `/admin` 404 · `/<ADMIN_GATE>` 303 · `/login` 200 · `/s/<store-1>` 200 or the store's neutral page ·
  `POST /api/public/order {}` → `{"ok":false,"error":"invalid"…}` · cron header → `{"ok":true…}` · `/api/health` →
  `app: "store-gen"` · every 404 carries the §F.6 headers · **rev 3:** the `DATA_DIR/.sg-owner` marker and a probe
  file persist across **two** archive deploys (ENGC-14; until then the `DATA_DIR` path stays `[unverified]`) ·
  `max_user_connections` recorded (ENGC-12) · no client bundle contains the `PLATFORM_URL` value (ENGC-26).
- **R1 product deploy = the integration deploy** (rev 3, ENGC-21): between P0 and the R1 integration **no production
  deploy happens** (XAMPP smoke only; the stub rule of §K.2 relies on it and, as a second lock, `prepublish/budget.ts`
  throws at module load in a production build while `estimateHeights` reports `stub: true`, so `npm run build` is red
  until P6 merges). The integration deploy runs 0005 and the same smoke plus the console, signup in invite mode, one
  order through the call-center queue. **P0 review G9:** live pages are served from the stored `page_versions.html`, so
  a page published under R1.0 has no "Report this store" row (§K.2 build note item 10) until it is rendered again; after
  0005 and the boot, the integration deploy re-renders every live page of every store with the `runtime` reason (§H.3:
  `forEachStore(systemCtx("deploy.rerender"), { states: ["active", "restricted", "pending"], … }, (scope) =>
  enqueueRenders(scope, "all-live", "runtime", 5))`, drained by the `renders` job over the next ticks) and the smoke
  then checks one R1.0 page of store #1 for exactly one `lp-report` row.
- **Domain move**: §C.10; V1 … V11.
- A failed Hostinger build keeps the previous version live (HANDOFF §4); migrations are forward-only and additive, so
  the previous build keeps working on the migrated schema **except** where 0004 changed constraints the old build
  writes against (global `pages_slug_uq`, `block_uq`, NOT NULL `store_id`): an R1.0 rollback therefore means
  "fix forward", stated in the deploy checklist.

### H.11 Retention (OS-11)

Leads 30 days (exists, per store; WhatsApp intents with them, LAN Q36) · `ai_runs.output` nulled after 90 days,
`ai_runs` rows deleted after 180 days once `ai_usage_daily` holds them, `ai_cache` expired rows daily, `ai_batch_items`
30 days after ingest or drop, `ai_feedback.before_text` / `after_text` nulled after 400 days, `ai_eval_runs.report`
nulled after 180 days (AI R9) · `ai_jobs` done/failed 30 days, their `DATA_DIR/ai/<storeId>/` blobs with them ·
`design_genomes` per DES-§2.1 (generated 14 days, unpublished chosen 90 days, non-live 180 days, cap 600 rows per
store) · `shipment_events.raw` 30 days (R2) · `wa_messages.payload_enc` 30 days (R3) · `outbox` done 14 days / dead 30
days · `job_runs` 14 days · `error_events` 30 days · `notifications` 90 days · `order_events` kept (rolled into daily
tables after 400 days, R3) · `audit_log` 400 days · `impersonation_sessions` and `platform_requests` 400 days ·
`password_resets` / `store_invites` / `staff_invites` 30 days after expiry · `page_slug_history` rows at `until` ·
`experiment_exposures` 60 days after the experiment ends (R3) · campaign share tokens revoked when a campaign ends +
90 days · `orders.capi_ctx` nulled 8-9 days after creation · `store_usage` `ai_credits_day` rows 7 days · test orders
(`is_test`) deleted by the owner's "Delete test orders" (`settings.write`, OPE-§26; ≥ 1 h old) or by `housekeeping`
after 30 days · `preview_tokens` 30 days after expiry · export parts 72 hours · backups §H.6.

### H.12 Long work under the 120 s cap: the job model (D56; rethink-ai §1.5, §9.6)

Hostinger ends a request after about 120 s (`docs/HANDOFF.md` runs the cron with `--max-time 110`;
`src/app/api/cron/tick/route.ts:25` sets `maxDuration = 120`). Fable 5.1 at `effort: high` can run for minutes. The
core therefore fixes three patterns; every track picks one per operation and names it in its spec:

| Pattern | When | Contract |
|---|---|---|
| **A. Interactive** | the user waits; p95 < 80 s | one route handler or `storeAction`, a per-call deadline ≤ **90 s** (SDK `timeout` in ms, the default is 10 min and must never be used), a typed fallback when the deadline hits (`busy`, a quiet "library" chip, the instant engine result). Director interactive passes (Opus 5.5 `medium`, ≤ 20K input, ≤ 10K `max_tokens`) are pattern A. |
| **B. Detached job** | 90 s to ~6 min; one user's result | the route inserts an `ai_jobs` row (`status queued`, `active = '1'`, `input_hash`, `progress.plan` = the stage ids, `lease_until`), answers **`202 { jobId }`** (or `storeAction` → `job_queued`), and the job is **stage-resumable** (rev 3, AI-§B.13): every stage is a model call ≤ 90 s; three drivers advance it, **`after()`** while it lives (the pattern `src/lib/orders/http.ts:51-63` already uses for Sheets), **the poll request itself** (`GET /api/app/<h>/ai/jobs/<id>` claims the next stage when no live lease exists), and **the cron** `ai.jobs` (slot 4c; rev 4: it never calls a model inside the tick, it submits a driverless job's next stage as a one-item Message Batch); a stage is claimed by one conditional `UPDATE` (`claimStage`, `stage_attempts`), heartbeat `heartbeat_at` every **10 s**, result ≤ 64 KB in `result` (larger blobs under `DATA_DIR/ai/<storeId>/`, `outputRef`). The browser polls every **2 s, visibility-aware** (the pulse pattern, D46), `s:<sid>:ai:jobs` and the daily pass caps apply. Orphans: a stage whose heartbeat is older than 60 s is re-claimed once by the next driver (same `active` row), a second orphaning marks the job `failed` with the instant result kept; `aj_active_uq (store_id, input_hash, active)` keeps one active job per input and lets a finished input run again (ENGP-3). **`maxDuration = 360`** is exported by every page and route handler that may start a job (rev 3, ENGC-18: `after()` lives at most the route's `maxDuration`, `after.md`; the Hostinger proxy still cuts the response at 120 s, which is why the poll driver exists). Deep Director passes, store blueprints, logo systems and the monthly health report are pattern B. |
| **C. Message Batch** | nobody waits; hours are fine; 50 % price | `queueAi(scope, task, input, ref)` inserts an `ai_batch_items` row; `ai.batches` (slot 4b) submits, polls and ingests; results arrive through `registerBatchResultHandler`. SEO/alt/translation, memory distillation, exemplar scoring, insights, the eval judge and the health report's narrative are pattern C. Refusals inside a batch fall to library/template on ingestion (`fallbacks` is rejected on Batches). |

Rules: (1) **whether a detached promise survives 3-6 minutes after the response on Hostinger's Node runtime is
unverified**: before the deep pass is enabled, P7 runs `scripts/qa/detached-job-probe.ts` against the live site
(manual, never in `npm test`) **through the real `/api/app/<h>/ai/jobs` route and a real `storeAction` page** (rev 3,
ENGC-18: a 5-minute dummy job that heartbeats, measuring both the proxy cut-off and Next's `after()` lifetime under
`maxDuration = 360`) and records the result in HANDOFF; its result sets the release flag **`ai_detached_jobs`**
(default `false`), **which switches the `after()` driver only** (rev 4, AI R42; D56): with `after()` confirmed the three
drivers all run, without it the poll and cron drivers alone carry the job (slower, still inside the 2-6 min promise for a
seller who keeps the tab open; a closed tab continues through one-item batches, "ready in a few minutes"), and pattern C
stays the fallback for nobody-waits work
(`platform_ai.classes.director_deep.batch = "fallback"`, the UI says "ready in a few minutes"); (2) a job never holds a
DB transaction across a model call; (3) every job writes `ai_runs` rows with `job_id` and reserves credits before the
first call (§D.7 reserve-then-reconcile, `allowOver` on reconcile); (4) `ai_jobs` is a tenant table: `GET
/api/app/<h>/ai/jobs/<id>` resolves the job inside the store scope and answers `not_found` for another store's id; (5)
one deep pass per store at a time (`aj_active_uq` on the `active` column + `deepPassesPerStorePerDay`; a resubmission
reuses the same active row and never inserts a second one); (6) the platform semaphore (4 Director, 8 Worker concurrent
calls) is shared by patterns A and B; waiting > 3 s in pattern A answers `busy`, pattern B waits inside the job.

### H.13 Runtime add-ons: the render hook (D62; LAN Q3, Q5, Q30)

The landing runtime chunk is frozen at 24,200 B gz. New shopper-side behaviour ships as **standalone add-on chunks**
(IIFEs on the model of `src/landing/runtime/entry-whatsapp.ts:30-48`) that read `#lp-config` (runtime config v2,
read-only), their own `<script type="application/json" id="lp-…">` data block, the DOM and the `lp:order` event; they
never call into the core chunk, never price, never change the payload, and wrap their body in `try … catch`.

- **Render context** (T3 in R1.0, generic): `addons?: RenderAddons` = `{ head: AddonChunk[]; body: AddonChunk[]; data:
  Partial<Record<AddonDataId, unknown>>; css: string[] }` (`src/landing/addons/types.ts`, P3 types). The Shell
  (`src/landing/document.tsx:299-334`) renders `head` scripts first in `<head>`, `body` scripts after the core chunk, the
  data blocks with `inlineJson`, the extra CSS chunks, and a `banner: "test"` when the document is a test render (D54);
  every add-on script joins the hash CSP (`inlineHashes` / `buildLandingCsp`); data blocks are `type="application/json"`
  (not executed, no hash). `RuntimeChunkName` gains the add-on names; the publish/render path calls `addonsFor(input)`
  (P3, pure) to decide what a document embeds. **Rev 4 (CRIT15):** the context also carries `links.report` (§C.6), P6's
  footer section appends it in `legalLinks(ctx)`, and when a document renders no footer section the Shell
  (`src/landing/document.tsx`) prints one minimal legal row `<p class="lp-report">` with the same link (server HTML, ≈ 20 B
  gz, no runtime bytes); the UiKey `footer.report` in `src/landing/i18n.ts` carries platform's `shell.report.link`
  wording (one wording for landing, store and shell). These three additive lines (`types.ts`, `context.ts`, `i18n.ts`)
  and the Shell row are a maintainer CCR applied at P0, before P3 and P6 start.
- **Build**: `scripts/build-landing-assets.mjs` bundles `src/landing/runtime/addons/*.ts` entries (each may import pure
  modules such as `src/lib/delivery/eta.ts`) into `addonChunks` in `src/landing/generated/assets.ts`.
- **Budgets** (`src/landing/runtime/budgets.json`, maintainer; render-check measures each add-on and both page caps,
  `scripts/qa/render-check.ts:119-131`): R1 `assist` 2,600 · `assist-ty` 1,500 · `track` 2,400 · `page` 32,000 →
  **34,800** · new `thanks-page` **12,600**; **R2 (rev 3, D75)** `landing-v3` = the re-measured `landing` + 500 B
  (replaces `landing` on `runtime_v = 3` pages only); R3 `exp-head` 450 · `exp` 1,200 · `chain` 2,000 · `video-hero`
  700 · `thanks-page` → 14,600. Store chunks (R2, STO-R13): `pdp` 23,500 · `store` 2,500 · `cart` 6,000 · `checkout`
  8,000 · `store-pixels` 4,200 · `store-thanks` 3,000 · `search` 5,000 · `store-page` = **a derived cap** (rev 3,
  STO-R26 restated / ENGP-31): `ceil500(Σ budgets of the heaviest set pdp + checkout + store-pixels + units-matrix +
  units-fields + fill-steps-box)` = **41,000** in R2, **42,500** when `exp-head` and `exp` join store documents in the
  R3 contract step (not a hand-set 43,000; `scripts/build-store-assets.mjs` fails when `store-page` < Σ, and the `pdp`
  spike of ≤ 10 % happens before `store-page` is frozen and moves the cap in the same CCR); a `css` key = the inlined CSS
  of the heaviest baseline page (gz) + 4,096 B (DES-R5). **Compositions live in the file (rev 3, ENGP-12):**
  `budgets.json` gains a `compositions` object (`page`, `thanks-page`, `store-page` → the chunk names each cap sums),
  so render-check no longer hard-codes the `heaviest` list (`render-check.ts:124`) and a new chunk needs no code
  change. A chunk over budget + 5 % fails `npm test`, as today, **except the frozen `landing` chunk: tolerance 0 against
  the recorded budget and `src/landing/runtime/landing.sha256`** (header freeze rule, ENGC-10). `render-check.ts` is the
  maintainer's harness from R1 product and imports `scripts/qa/render-cases/<track>.ts` (P3 `landing.ts`, P6
  `design.ts`, P7 `ai.ts` (rev 4: the digest fixtures, AI-§R.1), S1 `storefront.ts`, pre-registered at P0) for the
  tracks' fixtures.
- **Loading rules** are the part's (LAN-§5.2): an add-on is embedded only when its feature is on and its data exists,
  so a page without zones, WhatsApp order or tracking link ships exactly today's bytes.

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
| `/app/account`, `/security`, `/two-factor`, `/sessions`, **`/danger`** (rev 4, PLA Q4.7: account deletion, P2) | `admin/(auth)/two-factor`, `settings/security` (user part) | session | R1 |
| `/app/<h>` | `/admin` (dashboard) | `store.read` | R1 (Today brief, COD KPIs, funnel, Store Health ring, §I.8 screen 2) |
| `/app/<h>/welcome` | — | `store.read` + `pages.write` | R1 (onboarding reveal flow, UX-01, PLA-§22.2; P2 shell, P6 generator calls) |
| `/app/<h>/orders` (+ drawer `?o=`) | `/admin/orders` | `orders.read` | R1 |
| `/app/<h>/queue`, `/queue/board` (manager board, `orders.read_all` + `orders.assign`), `/queue/me` (R2 agent statement) | — | `agents.self` | R1 (agent console, OP-03; keyboard-first OP-17 **raised to R1**) |
| `/app/<h>/leads` | leads panel in orders | `leads.read` | R1 (LP-06; shows WhatsApp intents, LP-11) |
| `/app/<h>/customers` | — | `customers.read` | R1 (OP-06: flag + link + "separate order"; **merge** R2) |
| `/app/<h>/pages`, `/pages/new` | `/admin/pages`, `/pages/new` | `pages.read` / `pages.write` | R1 (+ page vitals LP-22, address card UX-05, kit entry) |
| `/app/<h>/links` | — | `pages.read` (edit `campaigns.write`) | **R1** (short links with UTM presets, LP-12, P3 wave 2) |
| `/app/<h>/campaigns`, `/campaigns/<id>` | — | `pages.read` (edit `campaigns.write`) | **R1** (Campaign Kit, SF-01 / LP-18, P3 wave 2) |
| `/app/<h>/finance` | — | `finance.read` (edit `finance.write`) | **R1 lite** (Profit Guardian lite, SF-04, flag `finance_lite`, P4); full accounting R2 |
| `/app/<h>/team/agents`, `/team/callcenter` | — | `members.read` / `callcenter.configure` | R1 (agent profiles, calling window, ladder, scripts; P4) |
| `/app/<h>/pages/<id>/edit` | `/admin/(editor)/pages/[id]/edit` | `pages.read` | R1 |
| `/app/<h>/preview/<id>` (route handler) | `/admin/preview/[id]` | `pages.read` | R1 |
| `/app/<h>/generate` | `/admin/generate` | `pages.write` + `ai.use` | R1 |
| `/app/<h>/media`, `/history`, `/exports` | same under `/admin` | `media.read` / `pages.read` / `export.create` | R1 |
| `/app/<h>/team` (members, invites, agents) | `/admin/settings/team` | `members.read` | R1 |
| `/app/<h>/integrations` (health rows, deliveries log and replay, OPE-§28.1; P5), `/integrations/{sheets,pixels,telegram,whatsapp}` | `settings/sheets`, `settings/pixels` | `integrations.manage` / `pixels.manage` (`callcenter.configure` reads the health page) | R1 |
| `/app/<h>/brand` | `settings/store` (logo) | `brand.write` | R1 basic, R2 logo designer |
| `/app/<h>/settings/{general,market,checkout,delivery,policies,anti-spam,ai,security,address,plan,audit,danger}` | `settings/{store,market,anti-spam,ai,audit}` | `settings.read` (+ write keys) | R1 (`anti-spam` owned by P5, OPE Q.17; `delivery` = zones, ETA calendar, holidays, P3; `audit` = P2, PLA-§22.10.6, rev 3 ENGC-8; `general` has no hours field: Call center is the one hours source, D73) |
| `/app/<h>/notifications` | — | `store.read` | R1 |
| `/app/<h>/catalog/{products,collections,inventory}`, `/storefront/**` (menus, store page editor), `/shipping/**` (S4), `/integrations/{webhooks,carriers}`, `/finance/**` full accounting and `/imports` (S3), `/preview/theme/<id>` (S2) | — | §A.3.1 | R2 |
| `/app/<h>/reviews`, `/experiments`, `/pages/<id>/{experiments,schedule,analytics}` (D3), `/catalog/coupons`, `/integrations/api` (D2), `/settings/domains` (custom) | — | §A.3.1 | R3 |
| API `/api/app/<h>/media`, `/media/<id>`, `/export/**`, `/sheets/**`, `/orders/export`, `/orders/carrier-csv` (rev 3, D74, `shipments.write`, P4), `/orders/print`, `/exports/<jobId>/<part>` | `/api/admin/{media,export,sheets}`, `(panel)/orders/export` | `storeGuard` per route | R1 |
| API `/api/app/<h>/pulse` (GET only, `ETag` / `304`, D57; P2), `/search` (⌘K server search, P2), `/orders/**`, `/ops/**` (queue claim, outcomes, presence, state; P4), `/leads/**` (incl. `/leads/export`; P3), `/ai/**` (P7: `[task]`, `director/{plan,critique,verify}`, `runs/<id>`, `jobs/<id>` (the poll driver, `advance=1` honoured only on a same-origin fetch), `jobs/<id>/cancel`, `warm` (reserved, `410`), `report`; R3 `copilot`) | — | `storeGuard` per route | R1 |
| API (R2) `/api/app/<h>/finance/**` incl. `receipts/<id>`, `/imports/**` (S3), `/shipping/**` incl. `manifest/<batchId>.csv` (S4), `/brand/**` incl. `logo/<name>.svg` (S2) | — | `storeGuard` per route | R2 |

`src/app/admin/(panel)/**`, `src/app/admin/(editor)/**`, `src/app/admin/preview/**` and the tenant parts of
`src/app/api/admin/**` are **moved** (not copied) in R1.0; `src/app/admin/(auth)/login/**` becomes `src/app/(public)/login/**`.
`revalidatePath` calls use `appHref(handle, …)` (31 sites, TENANCY-MAP §0).

### I.2 Console route tree (`src/app/admin/**`, gated)

`/admin` overview (PL-05) · `/admin/queue` (PL-04) · `/admin/stores` (PL-06, health ring from `store_health`, D53) ·
`/admin/stores/new` (`stores.create`, PLA Q.29) · `/admin/stores/<id>/[[...tab]]` (PL-07; **R1 tabs trimmed to**
Overview, Orders (masked), Team, Activity, Usage & plan, plus Notes when it stays S; Catalog & pages, Integrations
health, Domains, Risk, Media, Ops and Support fill in R2/R3, rethink-features §3.3) · `/admin/users`,
`/admin/users/<id>` · `/admin/orders` (masked lookup by id/phone, `orders.lookup`) · `/admin/notifications` (the staff
feed, PLA Q.29) · `/admin/plans` (PL-11) · `/admin/flags` (PL-12) · `/admin/health` (OS-09) · `/admin/domains` (OS-06)
· `/admin/(console)/ai/**` (AI-01, AI-07; P7's console pages live under `(console)` like every other, AI R1) ·
`/admin/settings/{general,signup,legal,brands,backups}` (PL-14; R1 legal templates = ToS, Privacy, AUP and the store
templates reusing `src/landing/legal/content.ts`, the platform **DPA moves to R2**, rethink-features §3.3) ·
`/admin/settings/mail` (R2, IN-08) · `/admin/security/{staff,audit,break-glass}` (SE-01, SE-04; staff invites and
`platform_requests` live here) · `/admin/setup` (§B.11). R3: `/admin/inbox`, `/admin/broadcasts` (PL-17 stays R3, no R1
"What's new" drawer), `/admin/analytics`, `/admin/abuse`. `src/app/admin/layout.tsx` only re-checks the gate (today's
`assertAdminAccess`), so `/admin/setup` (`src/app/admin/(auth)/setup/**`) works before any staff account exists; every
console page lives under `src/app/admin/(console)/**`, whose layout calls `requirePlatform()`; P1 deletes
`src/app/admin/page.tsx` (the overview is `(console)/page.tsx`, PLA Q.12); every page and action re-checks its
permission. The console previews tenant pages only in sandboxed iframes pointing at `/app/<h>/preview/<id>` under an
impersonation session or at a `/preview/<token>` URL (minted with audience `staff`, §E.2), never inline HTML (SE-05).

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
| Landing pages | Pages, Generate, **Campaigns**, **Links** (R1, SF-01, LP-12) | landing, both (store: only with "also use landing pages") |
| Catalog (R2) | Products, Collections, Storefront | store, both |
| Library | Media, History, Exports | all (Exports: landing, both) |
| Team | Members & invites, Agents, Call center | all |
| Connect | Sheets, Pixels, Telegram, WhatsApp (R1); Webhooks, Carriers (R2) | all |
| Money | **Finance (R1 lite, flag `finance_lite`, SF-04)**; Shipping (R2) | all |
| Settings | General, Market, Checkout & delivery, Policies, Brand, Anti-spam, AI, Security, Address, Plan & usage, Audit, Danger zone | all |

The quick action "Create" (`C`) opens: landing page (landing/both), **campaign** (landing/both), product (store/both,
R2), manual order, invite. Checklists and ⌘K use the same filters (ADM-07, ADM-31). Two more extension points keep
tracks out of the shared files (PLA Q.17, LAN Q18): **⌘K commands** `src/components/admin/shell/commands/<track>.ts`
exporting `commands: CommandDef[]` (`CommandDef = { id; label: MessageKey; group: "jump" | "create" | "run"; permission?;
mode?; release?; shortcut?: string; run: (ctx) => void | Promise<void> }`, types in `commands/types.ts`, registry
`commands/index.ts`, both maintainer; tracks add Sync Sheets, Export orders, Publish, Recompute health, Open a test
order), and **search providers** `src/lib/admin-data/search/<track>.ts` exporting `provider: SearchProvider`
(`{ id; kinds: string[]; search(scope, q, viewer: { userId; role }): Promise<SearchHit[]> }`, ≤ 120 ms budget each,
imported by P2's `src/lib/admin-data/search.ts`; P3 contributes `WA-` refs and leads, P4 orders by id/phone and
customers, P6 pages by design tags). Chords (`G O` orders, `G Q` queue, `G L` leads, `G C` customers, `G P` pages,
`G M` media, `G T` team, `G S` settings, `G H` overview, `G N` notifications, `G W` switch store; `N` next order and
`1-6` outcomes in the queue; `E` edit, `Enter` open, `Esc` close, `J/K` move; `?` the shortcut sheet; `/` search; `>`
an action) never fire inside editable fields or open overlays (the builder's `isEditable` / `overlayOpen` rules,
`src/components/builder/shortcuts.ts:16-25`). Typed order ids (`^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$`,
`orders-view.tsx:42`) open the drawer directly.

### I.4 Shell components (UX-02, UX-03)

- **Store switcher** replaces the brand block (`src/components/admin/shell/app-sidebar.tsx:118-129`, ADM-29):
  logo, name, mode badge, status pill, memberships, "Create a store", "Platform console" for staff (§B.4).
- **Topbar** breadcrumb root = the store name (ADM-30); notification bell (unread count from the pulse); "View store"
  opens `storeUrl()`; help.
- **Pulse** (D46 + D57; PLA Q.14, SF-06; route by P2, registry by the maintainer): `GET /api/app/<h>/pulse`
  (`storeGuard(req, h, "store.read")`, `s:<sid>:pulse:<userId>` 12/min) every 15 s while the tab is visible, **one
  poller per browser and store** (`BroadcastChannel("sg-pulse:<storeId>")`, independent pollers where the channel is
  missing), **`ETag` → `304`** when nothing changed (store-level parts cached 5 s per store, per-user parts fresh):

  ```ts
  // src/lib/pulse/types.ts (frozen at P0)
  export interface StorePulse {
    v: 1; at: string; build: string;
    unread: number;
    store: { status: StoreStatus; statusReason: string | null; review: "none" | "pending" | "submitted" | "needs_info" | "approved" | "rejected" };
    kill: KillKey[];                          // active kill switches that affect tenants
    impersonation: { endsAt: string } | null; // the viewer's own impersonation of this store
    reaccept: boolean;                        // legal re-acceptance pending for the viewer
    health: { score: number; attention: 0 | 1 | 2 | 3; computedAt: string } | null;   // §I.7
    jobs: { running: number; done: string[] };          // the viewer's ai_jobs that finished since the last poll (§H.12)
    counts: Record<string, number>;           // contributed by tracks (P4: newOrders, dueCallbacks, queueNow, syncFailed; P3: leadsDue)
  }
  // src/lib/pulse/contributors/<track>.ts (extension point): contribute(scope, viewer: { userId; role }): Promise<Record<string, number>>, 50 ms budget each; a failure omits its keys
  // rev 2.1 (AI R26): the producer of the frozen `jobs` field is ai's P0 stub
  //   aiJobsForPulse(scope: StoreScope, viewer: { userId: string }, since: Date): Promise<{ running: number; done: string[] }>   // src/lib/ai/jobs/pulse.ts (P7)
  // called by P2's pulse route with `since` = the `?since=<iso>` the poller sends (the `at` of its last 200 answer), clamped to
  // [now − 10 min, now]; absent or invalid → now − 30 s. `running` = the viewer's `ai_jobs` in queued/running; `done` = ids that
  // reached done/failed/cancelled after `since`. The stub returns `{ running: 0, done: [] }` until P7 merges; the field is part
  // of the per-user (uncached) half of the payload.
  ```

  A change of `store.status` or `review` triggers `router.refresh()` so locked controls unlock without a reload (PL-02);
  a change of `build` shows "New version available · Reload".
- **Notifications** (PL-13; API by P1 in `src/lib/platform/notify.ts`, frozen at P0, PLA Q.15): `notify(target, kind,
  vars, opts)` with `NotifyTarget = { audience: "user" | "store" | "store_role" | "platform_staff", … }`, kinds declared
  in `src/lib/notify/kinds/<track>.ts` (`kinds: NotificationKindDef[]` = `{ kind, group, defaultSeverity,
  audienceHint, vars: z.ZodType, link?, tenant: boolean, batch?: { windowMin } }`) and imported by
  `src/lib/notify/registry.ts` (maintainer); titles and bodies are message keys `notify.<kind>.title` / `.body`
  rendered in the reader's locale; tenant-facing kinds must exist in ar/fr/en (`test:i18n-coverage`); `vars` carry ids,
  counts, codes and short labels, never customer data; **`link` is validated at `notify()` time against
  `^/app/[a-z0-9-]{3,30}(?:[/?#]|$)` (the store dashboard root `/app/<h>` included, rev 4 PLA Q4.3: seven platform
  kinds and P4's order kinds link to it), `^/app/account(?:[/?#]|$)` (user-level kinds) or `^/admin(?:[/?#]|$)`
  (staff kinds); a refused link is stored as `NULL`, never rewritten** (rev 3, SEC-6 / LAN R23: a notification can
  never carry an open redirect); batched kinds use `INSERT … ON DUPLICATE KEY UPDATE` on `dedupe_key` so one row reads
  "12 new orders since 14:02". R1 kinds by track: platform PLA-§18.2 (incl. rev 3 `staff.signup_capped`,
  `staff.abuse_report`); operations
  `ops.new_orders`, `ops.callback_due`, `ops.first_touch_breach`, `int.sheets_failing`, `int.capi_failing`,
  `int.telegram_failing`, `fin.profit_alert`; landing `lead.recovered`, `leads.followups_due`, `order.customer_request`,
  `order.confirm_intent`, `delivery.holidays_review`; ai `ai.credits_80`, `ai.credits_out`, `ai.batch_done`,
  `ai.job_done`, staff `ai.cap_80`, `ai.cap_reached`, `ai.auth_failed`, `ai.director_unavailable`, `ai.refusal_spike`,
  `ai.batch_failed`, `ai.pending_share_reached` (rev 3, AI R40); storefront (R2/R3) `catalog.low_stock`,
  `catalog.out_of_stock`, `storefront.checkout_blocked`;
  health `health.issue_new` (one per new issue of severity 3, deduped per issue id and week).
- **⌘K** (store-scoped, ADM-02): jump to an order by id/phone (scoped search), page, customer, setting; create;
  run (sync Sheets, export orders, publish, recompute health, open a test order); switch store; commands and search
  providers from the §I.3 extension points. The console palette: jump to store, user, order, approve next, start view-as.
- **Banners**: pending ("In review" + what is locked), restricted (reason), suspended/closed (read-only), quota
  (≥ 80 %), kill switch (platform notice), require-2FA; one at a time, dismissible only when informational.
- **Ribbons**: console = permanent "Platform" badge + teal accent; impersonation = full-width violet ribbon with
  countdown and End (§B.8).
- **Limit sheet**: every `QuotaError` / `EntitlementError` / `feature_off` opens one premium sheet (what is limited, the
  current use, "ask for more"), never a raw error. **Publish refusals** (`design_blocked`, `honesty_blocked`,
  `budget_blocked`, §M) open the publish dialog's issue list with one fix per item, never a toast.
- **Store Health ring** (SF-03, §I.7) on the dashboard and in the console stores list: the score, the five top issues
  with their evidence (`n` always shown) and a one-tap fix each, "Recompute now", snooze 7 days per issue. It
  **replaces** the setup checklist (`src/lib/admin-data/dashboard.ts:173-180`, six static items).
- **Live address card** (UX-05, **raised to R1**, rethink-features §3.2): on the pages list, the dashboard after the
  first publish and the onboarding end: canonical link with copy, QR (`qrcode`, `package.json:65`), "Share on WhatsApp",
  "Open a test order" (mints the D54 token), "Create a campaign". P2 owns the card, P3 the test-link and kit entries.
- **Today brief**: line 1 of the dashboard is a template sentence from today's numbers ("1 order confirmed today ·
  2 callbacks due · zones empty"), never a model text in R1 (AI-17's digest is R3); numbers come from `opsPulse` and
  `store_health`.

### I.5 Internationalisation (ADM-40, D36)

- Catalogs `src/lib/i18n/admin/{en,fr,ar}.ts` exporting `messages: Record<MessageKey, string>` (ICU-lite `{var}`
  placeholders, plural via `Intl.PluralRules`); `MessageKey` is the key union of `en.ts`; `fr`/`ar` are
  `Partial<…>` falling back to `en`. `t(key, vars)` on the server, `useT()` on the client. Each track owns the keys
  under its own prefix in `src/lib/i18n/admin/<locale>/<track>.ts` (extension files, §K.3). **File ownership (rev
  2.1, D67):** the base catalogs `src/lib/i18n/admin/{en,fr,ar}.ts`, `index.ts` and the `t`/`useT` runtime are the
  maintainer's (C0); P2 owns `<locale>/{shell,auth,onboarding,team,health,brief}.ts` (`health.ts` = ring, groups,
  issue-list chrome and snooze texts only); P1 owns `<locale>/{console,notify}.ts` (`notify.ts` carries only the
  platform kinds `notify.<kind>.*` of `src/lib/notify/kinds/platform.ts` and P1's own health sentences
  `health.platform.*`); every other track owns exactly `<locale>/<track>.ts` (P3 `landing.ts`, P4 `ops.ts` +
  `finance.ts` (lite; S3 takes `finance.ts` over in R2), P5 `integrations.ts`, P6 `design.ts`, P7 `ai.ts`, S1
  `storefront.ts`) and puts its notification texts `notify.<kind>.*`, its Store Health sentences
  `health.<track>.<rule>.*`, its gate titles and its error codes `error.<code>` there. The coverage test fails when a
  key appears in two tracks' files.
- Locale: `users.locale` (default: the browser's `Accept-Language` among ar/fr/en at signup); `dir="rtl"` for `ar`.
- R1 complete in ar/fr/en: `/login`, `/signup`, `/invite`, `/reset`, `/report`, onboarding, the agent console
  (`/queue`, the order drawer actions, call script, WhatsApp templates), and every shopper-facing addition (thank-you
  blocks, track page). **The operations surfaces ship `fr` with `en` in R1** (rev 3, OPE Q.27l / D36 refined: every key
  under the `ops.`, `int.` and `fin.` prefixes exists in `fr` from the P4 / P5 merge, since the call-center floor works in
  French; `ar` for them in R3). The rest of the dashboard: `en` in R1, `fr` in R2, `ar` RTL in R3 (UX-08).
- Formatting: amounts via `src/lib/markets/money.ts` in the store currency; dates and "today" in the **store
  timezone** (`stores.timezone`; ADM-23, STAT-01); numbers tabular; phones and order ids in `dir="ltr"` isolates
  (`<bdi dir="ltr">`); Latin digits by default with a per-user toggle; no uppercase or letter-spacing on Arabic labels.
- **Coverage test** `test:i18n-coverage` (`scripts/qa/i18n-coverage.ts`, in `npm test`, P2): every key used by a
  surface that is R1-complete in ar/fr/en (the list above, plus every tenant-facing notification kind and every
  publish-gate `GateItem.title`) exists in all three catalogs; every `ops.` / `int.` / `fin.` key exists in `fr` (rev 3);
  every key in `fr`/`ar` exists in `en`; no catalog value contains an em-dash or a "Step 1/2/3" label (§I.8 rule 8).
- **RTL lint** `test:admin-rtl` (`scripts/qa/admin-rtl-lint.ts`, P2, DES-R2): fails on physical-side classes
  `(^| )(ml|mr|pl|pr|left|right|text-left|text-right)-` in `src/components/admin/**` and `src/app/app/**`, and on
  directional icons outside the mirrored allow-list, so the R3 Arabic dashboard costs nothing extra.

### I.6 Design-system foundation for the admin upgrade (UX-04 builds on it; design.md owns the depth)

- **Tokens** stay the semantic OKLCH set of `src/app/globals.css` (`--background … --brand` jade hue 166, `--success`
  green 150, `--warn` yellow ≥ 90, `--destructive` crimson 17, charts) plus the rev 2 pair **`--info` / `--info-ink`**
  around OKLCH hue 250 in light and dark (callbacks, in-transit and "scheduled" chips; violet stays reserved for
  impersonation; OPE Q.16). A 3-input generator (base neutral hue, accent hue/chroma, contrast standard|high; the
  Linear method, design-gen.md §9) produces the light and dark blocks at build time in `scripts/build-admin-css.mjs`
  (no Turbopack loaders, HANDOFF §4).
- **Surfaces**: `[data-surface="tenant"]` (jade accent), `[data-surface="console"]` (teal-cyan accent around OKLCH
  hue 205, deep-ink sidebar), `[data-impersonating]` (violet ribbon, hue ~295). All outside the banned band. **One
  frosted surface per screen** (the topbar); **aurora + grain are gone** (D60 rev 3, UX-38): the hero KPI tile and
  `EmptyState` (`src/components/admin/common/empty-state.tsx:28`) lose them, the `adm-aurora` / `adm-grain` classes
  leave the token generator and `test:admin-tokens` fails on their presence; the *celebration* (first store, first
  order, first delivery) is a **typographic moment** (one large tabular number, one accent hairline, a 240 ms rise,
  PLA-§22.16 item 4), never a gradient.
- **No orange**: `scripts/qa/admin-tokens-check.ts` (in `npm test`) parses every OKLCH token and fails on hue 25-75°
  with chroma > 0.06; `qa/admin-visual/shoot.mjs --scan-only` stays the screenshot check; generated-page colour mixes
  are registered with `src/lib/theme/blend.ts` (owner rule 1).
- **Density**: `[data-density="comfortable" | "compact"]` → `--row-h: 40px | 32px`, `--ctl-h: 36px | 30px`, base
  14px | 13px; per viewer (localStorage, a convenience); agents and managers default to compact.
- **Motion**: `--dur-1: 120ms`, `--dur-2: 180ms`, `--dur-3: 240ms`, `--ease-out: cubic-bezier(.2,.8,.2,1)`; **no
  bounce, today's shell included** (D60): the sidebar active pill's `type: "spring", stiffness: 480`
  (`src/components/admin/shell/app-sidebar.tsx:96`) becomes a layout animation on `--ease-out`, the generate icon's
  `cubic-bezier(.34,1.36,.64,1)` rotate-on-hover (`:146`) is removed, `--ui-spring` is deleted from the tokens
  (DES-R17). Allowed moves: active pill slides, rows enter with a 6 px rise + fade staggered 20 ms (≤ 12 rows),
  drawers slide 240 ms, numbers roll once on load, toasts rise 180 ms. Forbidden: rotation on hover, pulsing glows,
  parallax, confetti. `prefers-reduced-motion` keeps opacity only. Checked by `test:admin-motion`
  (`scripts/qa/admin-motion-check.ts`, P2: no `type: "spring"`, no overshoot cubic-bezier (y1 or y2 outside 0-1), no
  duration above 400 ms outside the builder canvas).
- **Shape**: a 4-tier radius ladder `--r-chip 6px`, `--r-control 8px`, `--r-card 12px`, `--r-sheet 16px` (tiers
  differ, R-D38); hairlines 1 px with `color-mix` from the foreground; shadows tinted by the surface, only on floating
  layers (drawer, popover, the one glass bar); cards only where elevation means something, lists separated by
  hairlines otherwise.
- **Type**: Instrument Sans (shipped, `src/app/fonts/`) with tabular numerals in every number column
  (`font-variant-numeric: tabular-nums`); JetBrains Mono for ids; **IBM Plex Sans Arabic** as the admin Arabic face
  (DS21, DES-R17; already among the OFL fonts in devDependencies); max two lines per cell, truncation with a title.
- **Data**: KPI tiles show real data only (value, delta vs the previous period, a hint naming the definition, sparkline
  **only with ≥ 7 points**: `src/components/admin/dashboard/kpi-card.tsx:92` draws from 2 today and changes; delta
  chips use the semantic tokens, not Tailwind `emerald`/`rose`); placed, confirmed and delivered are three words that
  never share a tile; every rate shows its `n`; the COD funnel orders → confirmed → shipped → delivered → cash
  collected is the signature chart (horizontal stepped bars, delivered in jade); tables over charts below 5 points; no
  pie beyond a two-segment share; no dual axes; neutral graphite series + jade "ours", crimson loss, yellow warn,
  `--info` scheduled.
- Banned in the admin as on pages (`docs/DESIGN.md` §1.1 + DESIGN v3, DG-01): glass beyond the one surface, bounce,
  vintage/craft motifs, generic gradients, fake numbers, decorative status dots, placeholder-as-label, em-dashes in
  UI copy, "Step 1/2/3" labels (anti-slop rubric §4.5-4.7, §9, adopted where the owner rules do not override it).

### I.7 Store Health engine (SF-03, PL-18 raised; D53)

One computation, two audiences. `src/lib/health/**` (owned by P1; rules per track) with the registry pattern of §K.3:

```ts
// src/lib/health/types.ts (isomorphic)
export type HealthGroup = "setup" | "trust" | "design" | "conversion" | "operations" | "integrations" | "quota";
export const HEALTH_CAPS: Record<HealthGroup, number> = { setup: 20, trust: 15, design: 15, conversion: 15, operations: 15, integrations: 15, quota: 5 };   // Σ = 100
export interface HealthEvidence { metric: string; value: number; baseline?: number; window: string; n: number }
export interface HealthFix = { kind: "link"; href: (handle: string) => string; label: MessageKey } | { kind: "action"; actionId: string; label: MessageKey };
export interface HealthIssue { id: string /* "<track>:<rule>" */; group: HealthGroup; severity: 1 | 2 | 3; points: 3 | 6 | 10; evidence: HealthEvidence; fix: HealthFix; text: MessageKey; snoozedUntil?: string }
export interface HealthRule { id: string; group: HealthGroup; minN?: number; release: "R1" | "R2" | "R3"; mode?: ModeFeature;
  collect(scope: StoreScope, inputs: HealthInputs): Promise<HealthIssue | null> }   // ≤ 40 ms, read-only, scoped
// src/lib/health/rules/<track>.ts exports `rules: HealthRule[]`; src/lib/health/registry.ts (maintainer) imports them
export function computeHealth(issues: HealthIssue[], flags: HealthFlag[], snoozed: Record<string, string>, now: Date): { score: number; components: Record<HealthGroup, number>; attention: 0 | 1 | 2 | 3 };
// score = 100 − Σ_group min(cap, Σ points of unsnoozed issues in the group); rev 4 (PLA Q4.5, PD79): console flags that mirror a
// track's issue (sheets_* / outbox_dead / capi_failing / telegram_failing ← P5's int:* rules, render_failed, …) are DERIVED from that
// issue and add no points of their own (one condition, one issue, one number); quota_* → quota (core rule); inactive_14d, dormant_60d,
// review_waiting, restricted, suspended, abuse_reports_new → 0 points, flag only
// src/lib/platform/health-snapshot.ts (P1)
export function getStoreHealth(scope: StoreScope): Promise<StoreHealthView | null>;   // rev 4 (PLA Q4.4): null = not computed yet (the ring's "computing" state); cached 5 min; tenant dashboard + pulse
// StoreHealthView (PLA-§2.2) gains the additive `staleAfterMin` (= max(platform.health.staleAlarmMinutes, 1.5 × the measured cycleMin), rev 4)
export function markHealthDirty(storeId: string): Promise<void>;                     // every console action on a store, every publish, zone save, integration change
export function snoozeHealthIssue(ctx: StoreCtx, issueId: string, days: 7): Promise<void>;   // health.snooze; audit store.health.snoozed
export function requestHealthRecompute(ctx: StoreCtx): Promise<{ queuedAt: string }>; // rev 2.1 (PLA-§6.3): "Recompute now"; `s:<sid>:health:recompute` 6/h → markHealthDirty; the job computes within ≤ 5 min; P0 stub
```

**File placement (rev 2.1, reconciling platform.md PLA-§P.1 with this section):** `src/lib/health/{types,registry}.ts`
are the maintainer's skeletons; the registry's import lines for every track's `rules/<track>.ts` are **pre-written at
P0** by the maintainer (each file exports `rules: HealthRule[]`, empty until its track merges), so no track edits the
registry; P1 writes `src/lib/health/{engine,inputs,platform-flags}.ts`, `src/lib/health/rules/platform.ts` (the
PLA-§6.3 console flags as rules), `src/lib/health/selftest.ts`; the pure `computeHealth()` above lives in
`src/lib/platform/health-score.ts` (P1) and is re-exported by `src/lib/health/engine.ts`. A rule's `text` key is
`health.<track>.<rule>.*` in the owning track's i18n file (D67).

- **Rules by track (R1):** setup (P2/P3): contact phone or WhatsApp missing, legal identity missing, no published
  page (**P3's `landing:no_live_page` only**, rev 4 PLA Q4.5: P2 emits no copy of it), delivery zones empty while a page
  shows a flat fee, 2FA off for a member with `orders.read_all`; trust (P3,
  from `checklist.ts` honesty rules): countdown ended, compare-at not higher, stock 0, sample proof present; design
  (P6): a live page with `q < 70` or `slop ≥ 3`, two live landings closer than `d_page 0.30`; conversion (P3/P5):
  missing SEO title/description, missing alt, no pixel on a live page, Purchase trigger `order` while the store runs
  confirmation calls (a suggestion, severity 1), form hidden; operations (P4, `minN` 30 orders / 28 days): first-touch
  p50 above the store's own target, orders without an attempt > 2 h inside the window, unreachable rate 7 d > 28 d +
  10 points; integrations (P5): Sheets backlog beyond the scaled threshold of §H.5, CAPI failures 24 h, Telegram
  failing (P5's `int:*` rules are the only tenant issues for these conditions; `int:sheets_backlog` uses §H.5's scaled
  threshold, rev 4 PLA Q4.5); quota (core): any gauge ≥ 80 % / 100 %; **rev 3:** conversion (P3) `landing:fee_mismatch`
  (severity 1, `minN` 20 orders / 28 d: zones carry fees that differ from a live page's flat fee for the top-5 cities,
  over P1's input `zones.feeMismatchTop5`; **rev 4 (CRIT1, LAN N1):** the input is built on the server from P3's
  slug-keyed `zoneFeesFor(scope, keys)` over the top-5 `CityKey`s of `opsAggregates(dims: city)`, never from the
  browser `ZoneTable`; it covers **every live page not on "Charge delivery by city", attached landings included**, and
  `landing:fee_mismatch` is the one rule for them (the storefront withdrew `sf:landing_fee_mismatch`; its "Pages de
  vente" chip reads the same input; evidence metric `fee_mismatch_cities`, distinct from operations' `fin:fee_gap`;
  D75), platform-visible `platform:brand_term_live` (P1, **at least nightly: it runs on every health computation of the
  store**, rev 4: an exact protected term in a live title, headline or policy text; D76) and the console flag
  `abuse_reports_new` (0 points, `attention`). R2 adds refusal rate per city and cash
  held (needs ship states). A rule stays silent below `minN` and never reads another store; platform medians appear only
  in R3 and only labelled "platform median".
- **Job** `platform.health` (slot 9): **budget-driven** (rev 3, ENGC-25: no fixed store count): `dirty_at` rows first,
  then the oldest `computed_at`, then stores without a snapshot, until `ctx.deadline`; for each it builds `HealthInputs`
  through `systemScope` and the Q.11 read APIs (`orderKpis`, `integrationHealth`, `sheetsBacklog`, `aiUsageForStore`,
  `designHealth(scope)` from P6, `listPagesForConsole` with the rev 3 `name` / `seoTitle` columns), runs every registered
  rule and the PLA-§6.3 flag rules, computes, upserts `store_health` (`dirty_at = NULL`), fills milestones once (audit
  `store.milestone.reached`), emits `quota.80` / `quota.100` once per metric and period, and `health.issue_new` for a
  new severity-3 issue. At 100-800 ms per store (≈ 20 rules × ≤ 40 ms plus six reads) the 3 s + leftover slot covers
  **≈ 10 stores per tick**, so the honest bounds are: ≤ 5 min after a platform action or a publish (dirty first), and
  otherwise ≤ 60 min up to ≈ 120 stores, degrading linearly beyond (the per-store median cost in `job_runs.summary`
  makes the figure measured, not assumed; the remedy past that is a second guaranteed slice, decided in R2). It never
  writes a tenant table.
- **Monotonic and advisory:** fixing an issue never lowers the score (selftest), snoozing hides the issue for 7 days
  (stored in `store_health.snoozed`, audited, shown as "snoozed" to staff), the score **never gates anything**; publish
  gates are §M.
- **History:** `store_daily_rollup.score` (R3) keeps one value per day; the weekly digest (AI-17, R3) reads `issues`.

### I.8 Admin UX ceiling (rethink-features §2; testable rules every screen must pass)

1. **Instant.** Shell navigation feels < 150 ms (route chunks prefetched on hover/focus, server components streamed,
   lists hydrate from a cached first page); writes are optimistic with rollback or Undo, complete in < 500 ms and carry
   an idempotency key; skeletons mirror the final content, appear after 150-300 ms and stay ≥ 300 ms.
2. **Keyboard everywhere.** ⌘K for any page or action, the §I.3 chords, `?` shows every shortcut, `/` focuses search;
   the agent console has `N` and `1-6`.
3. **Honest data.** Placed / confirmed / delivered never share a tile; every rate shows `n`; sparklines ≥ 7 points;
   "needs 30 orders" instead of a number below the minimum sample.
4. **One accent, one glass, no bounce.** §I.6 (D60).
5. **Dense but breathing.** §I.6 density and type rules.
6. **Phone-first for agents.** 44 px targets, outcomes as a 2 × 3 grid under the thumb, drawers become full-height
   sheets, tables become two-line rows, every swipe has a tap alternative.
7. **RTL-perfect by construction.** §I.5 lint, mirrored icon allow-list, `<bdi dir="ltr">` isolates, store time zone.
8. **No AI tells in the admin.** Skeletons over spinners, label above input, no placeholder-as-label, no decorative
   status dots, no em-dash in UI copy, no "Step 1/2/3" labels, one CTA label per intent; empty states are a quiet
   surface with a preview of the real UI (a skeleton of the table the data will fill, never fake numbers), one
   sentence, one primary action and, when relevant, one teaching line.

Screen build order for R1 (the acceptance scenario first; each track ships its screens against DES-§16.17's checklist):
1 signup → mode cards → onboarding → reveal → address card (P2 + P6, L) · 2 dashboard with Today brief, COD KPIs,
funnel, health ring (P2, M) · 3 orders list with saved views and bulk bar + order drawer with timeline, masked phone,
outcomes, script (P4, L) · 4 agent queue, phone-first, `N` and `1-6` (P4, M) · 5 pages list + address card + kit
screen (P3, M) · 6 leads inbox (P3, S-M) · 7 customers (P4, M) · 8 team & invites, agent profiles (P2/P4, M) · 9
Connect: Sheets, Pixels, Telegram, WhatsApp templates (P5, M) · 10 settings incl. the new zones screen (P2/P3, M) ·
11 notifications panel (P2, S) · 12 console: approval queue, stores list, trimmed store profile, health, flags, AI
(P1/P7, L) · 13 builder additions: Design check panel, DNA card (P6, S-M). Keep / rework / redesign decisions for
today's admin parts are rethink-features §2.9 (cmdk, sidebar, dashboard, orders view, drawer, empty state and settings
nav are reworked or redesigned; topbar, KPI card, media, builder, export dialog, audit timeline are kept).

---

## J. Tests

### J.1 `npm test` (offline, no DB, no server; must stay green on every merge)

**Wall time ≤ 4 minutes on the owner's PC (rev 3, ENGP-24: 3 minutes; raised at P0, review G7, from a timed run: the existing chain and the core suites alone measure about 135 s).** Every suite below runs a seeded, bounded subset; the
full sweeps (`test:design:full` 11 × 3 × 200 genomes + 10,000 choreography expansions, the storefront 1,200-home
`test:catalog` sweep, landing's 10,000 A/A simulations, the capacity simulation, **`test:ai:slow`** (the 30-store
niche-novelty corpus and the 1,000-run reward simulations, rev 4) **and, rev 5 (CRIT2-9), `test:ai-eval --offline`**
(the 20-case smoke eval, < 60 s)) live in **`npm run test:slow`**, run before each merge and by `npm run gate` (and
`gate:r1`, §J.5), never on every `npm test`. **Rev 5 (CRIT2-9): the budget is a table whose sum is checked, not a list of
shares.** Rev 4's shares alone summed to 185 s before the existing chain, the core suites and `pretest` ran. The groups
and their wall-time budgets on the owner's PC:

| Group | R1 budget | Notes |
|---|---|---|
| `pretest` asset builds + the existing chain (`package.json:22`: theme, runtime, generator, render, money, conversions, offers, orders) | ≤ 90 s | measured 88.5 s at P0 (rev 5 had 30 s, 82.5 s measured at T4); a further cut moves a sweep to `test:slow` through the suite's owning track |
| core suites (`test:tenancy-lint` (TS compiler API over `src/**`), `test:ownership`, `test:settings`, `test:registries`, `test:hosts`, `test:permissions`, `test:tenancy-unit`, `test:envelope`, `test:security`, `test:jobs`, `test:prepublish`) | ≤ 55 s | maintainer; measured 46.1 s at P0 once `test:prepublish`'s ar fixtures and lock child processes moved to `test:prepublish -- --slow` in `test:slow` (63.0 s before); `test:jobs` (P8) not written yet |
| platform (P1 + P2 suites) | ≤ 15 s | PLA-§O.1 (20 s before the P0 re-cut) |
| landing (P3) | ≤ 20 s | LAN-§25.1 |
| operations (P4 + P5) | ≤ 15 s | OPE-§O.1 (25 s before) |
| ai (P7: `test:ai` only) | ≤ 15 s | AI-§Q.1 (20 s before); `test:ai-eval` is in `test:slow` |
| design (P6) | ≤ 25 s | DES-§25.1 (40 s before) |
| **R1 total** | **≤ 235 s** | under the **240 s** ceiling (5 s headroom); P0 re-cut (review G7, CCR r1.0-c0b-3 items 2 and 3): the rev 5 table declared 175 s of 180 s while the two maintainer groups alone measured about 150 s; each group's `measuredSec` is in the table and the static check (`npm run test:budget-static`, in `gate`) refuses a share below it; the maintainer runs the timed `npm run test:budget` at every track merge that adds suites to `npm test` |

**R2 (raised explicitly at the R2 contract step):** the ceiling becomes **300 s** (240 s before the P0 re-cut, which
raised every release by the same 60 s), with storefront (S1, 192 homes) ≤ 40 s, `test:logo` (S2) ≤ 8 s,
`test:imports` (S3) ≤ 4 s, `test:webhooks` (S5) ≤ 3 s added to the table (R2 total ≤ 290 s; the R2 contract step
re-cuts from a timed run); **R3:** `test:experiments` (D3, 2,000 seeded A/A) ≤ 5 s (≤ 295 s of 300 s), and any further R3 script either fits the
remaining headroom or its contract step moves a seeded subset to `test:slow`. The harness (`scripts/qa/test-budget.ts`,
maintainer, rev 4 named) **reads this table** (as a committed `scripts/qa/test-budget.json`), **fails when the sum of
the declared budgets exceeds the ceiling** (a static check, so a part cannot grow its share silently), prints each
script's time, fails a group above its budget, and fails the chain above the ceiling.

Existing chain (`package.json:22`: theme, runtime, generator, render, money, conversions, offers, orders) plus:

| Script | File | Checks |
|---|---|---|
| `test:tenancy-lint` | `scripts/qa/tenancy-lint.ts` | rules L1-L13 (§F.1; L11 arrives with R2); joins `npm test` **and `prebuild`** at the R1.0 merge with **0 violations** (§J.5) |
| `test:ownership` (rev 3, ENGC-8) | `scripts/qa/ownership-check.ts` (maintainer, written at P0) | parses every track row's globs of §K.1, §K.2, §K.4 and the six parts' ownership tables, expands them against the working tree, and fails on any file matched by two tracks of the same phase or by none of the phase's tracks while being new since the phase began; the reviewers' "two tracks never own one file" check is mechanical. **Rev 5 (CRIT2-22): "new since the phase began" is read from a committed manifest, never from git**: `docs/saas/ownership-baseline.json` (`{ phase: "R1.0" \| "R1" \| "R2" \| "R3", startedAt: <commit sha>, files: <every tracked path at the phase start, sorted> }`), written by the maintainer at each phase start with `ownership-check.ts --write-baseline` (from `git ls-files`, the only step that uses git) and committed; the check itself reads only the working tree, the specs and the manifest, so it gives the same answer in a clone, in `npm run gate` and in Hostinger's `git archive` build (no `.git`, HANDOFF §4 step 2); a missing or unparsable manifest **fails** the check (never a silent pass). **Resolution order (C0b, CCR r1.0-c0b-2):** a path's owner is the strongest claim: (1) a track's named path (no `**`, no `*` in the file name); (2) the maintainer's named path; (3) a track's glob; (4) the maintainer's glob. Two tracks at the strongest level is a finding, so a file a track names inside another track's glob (P1's `nav/console.ts` in P2's `shell/**`) is not an overlap, while two globs that intersect are. The §K.3 list applies in every phase at the maintainer's level, so in R1.0 T3's `src/lib/edge/**` and T1's `settings/index.ts` win over it; C0a's rows own nothing in R1.0 (C0a merged at the phase start). Overlaps are looked for on the working tree (honouring `.gitignore` and `.git/info/exclude` when present) and on one witness path per pattern of every phase; the current phase (the manifest's) fails the run, later phases print warnings until their contract step writes their manifest or `--phase <P>` names them. The reading rules (braces, `except` / `outside`, bare names, the `nav` / `i18n` / `jobs` / `commands` shorthands, "`x` is P4's", commentary in parentheses) are listed in the script's header |
| `test:hosts` | `src/lib/edge/selftest.ts` (absorbs `src/lib/auth/host-selftest.ts`) | the §C.2 / §C.3 decision tables as pure functions: forged `x-sg-*` without/with a wrong key (**present-but-wrong key → `invalid`**, rev 3 SEC-4), `EDGE_KEY_PREV` grace, a stale `x-sg-ts`, own-handle `/s/` 308, other `/s/` 404, `/d/` direct 404, reserved and deep labels, `Next-Action` on store hosts, legacy host 308s with byte-identical queries, area classification with encoded paths (V1, offline part), the store-home rewrite target without a trailing slash (ENGC-15), `x-sg-path-sig` verification (SEC-3) |
| `test:permissions` | `src/lib/auth/selftest-permissions.ts` | matrix invariants: owner has every R1 key; no role but owner has `store.mode`/`store.close`/`billing.manage`; `invitableRoles` never returns a role ≥ the inviter's (except owner); every write key is refused to the impersonation membership; every key has a release; platform step-up set ⊇ the ↑ column; `WriteScope` is not assignable from `platformScope()` or an impersonation scope (D71, a type-level test) |
| `test:tenancy-unit` | `src/lib/tenancy/selftest.ts` | entitlement resolution order and every state cap incl. the two-tier pending media cap and the pending AI floor (D69); handle rules, reserved/protected/history availability, the conversion's handle derivation (ENGC-30); `ScopedCache` bounds and `invalidateStore`; `Bucket` construction; `storeUrl` / `storeBase` / `mediaUrl` per mode; `landingPathFor` |
| `test:envelope` | `src/lib/security/selftest-envelope.ts` | golden v1 + v2 vectors; AAD binding incl. a mismatched kid (rev 3, SEC-25); a store-A ciphertext fails under store B; HKDF salt frozen |
| `test:security` | `src/lib/security/selftest.ts` (promoted; offline parts; T3's file in R1.0) | CSRF strict same-origin with platform/admin hosts only and **a missing Origin refused** (SEC-11); `documentOrigins` never reflects Host; IP trust with `x-sg-ip` only when the edge verifies; `allowlistAddress()` behind Cloudflare (SEC-14); `p:login:acct` never refuses (SEC-22); no served document CSP carries a bare `'self'` in `connect-src` / `form-action` (SEC-2); `originAllowed` refuses apex / sibling / admin hosts (SEC-23) |
| `test:jobs` | `src/lib/jobs/selftest.ts` | outbox backoff ladder and dead rules; tick budget allocation (registered guaranteed budgets ≤ 95 s, every job has a budget, §H.2); round-robin cursor fairness with a fake clock (one slow store does not starve others); `ai.jobs` orphan and batch hand-off rules with a fake clock (§H.12; rev 4: the tick never calls a provider, a spy asserts it); **rev 3:** the tick lock (rev 5, CRIT2-18: the `cron_cursors` lease) answers `skipped` on overlap, an expired lease (> 110 s) is taken over, the tick holds no lock-pool connection between jobs (pool spy), a request-path `withNamedLock` with both pool connections busy answers `{ ran: false }` within its 1 s timeout, `render_jobs` dedupe cleared on claim (a second render after an enqueue mid-run, ENGC-4), the render CPU cap, the `yield()` contract (a job without a yield in 2 s of fake CPU fails), the Sheets capacity arithmetic (ENGC-33) |
| `test:delivery` (rev 3, D68; P3 owns the script, P4 the fixtures) | `scripts/qa/delivery-check.ts` over `scripts/qa/fixtures/city-key.json` and `src/lib/callcenter/window.fixtures.ts` | the shared city-key parity fixture: every `City.value` of `cities-ma.ts` and the ar / fr / en spellings resolve to one `CityKey` slug, "Fès picked in the form → zone found → ETA shown", `null` / "Autre" → the `*` zone; **rev 4 (CRIT1):** the key-shape case (`zoneTableKey: "value"`: the key set of `buildZoneTable(…).city` equals the `City.value` set minus "Autre", `city["Fès"]` is the Fès zone index, "Autre" absent and resolved to `star`) and the import-graph case (no add-on chunk reaches `src/lib/orders/address.ts`); **rev 4 (CRIT3):** the thank-you `{when}` over the window fixture (Friday = key 5, a Ramadan override, a midnight-crossing range, `configured: false` → no hour rendered); `test:catalog` (S1) and `test:ops` (P4) read the same two files so three tracks fail together if a key or the weekday convention drifts |
| `test:landing-addons` (rev 4 listed, CRIT16) | `src/landing/addons/selftest.ts` (P3) | `addonsFor` matrix (page × mode × settings), data-block shapes and sizes, the selection serialiser over the DOM fixtures, "every add-on off → no add-on bytes"; the `lp-assist` zone table deep-equals `zonesForCheckout`'s; the window data block is the serialised `EffectiveWindow` unchanged |
| `test:policies` (rev 4 listed) | `src/lib/policies/selftest.ts` (P3) | `policyAllows` per claim and locale, `policyLines` ≤ 6 lines, unset → no sentence; `policyClaims` on the 120-line claim and clean fixtures per locale (≥ 95 % / ≤ 2 %), the contradiction-vs-unset matrix (ENGP-8) |
| `test:wa-price` (rev 4 listed) | `src/lib/wa-order/selftest.ts` (P3) | `priceWaSelection` equals `orderTotals` on the `duo`, `tshirt`, `colors` fixtures and partial selections (no second pricing engine, Offers D9) |
| `test:copylib` (existing, extended; rev 4 listed) | `src/lib/ai/copy-library/selftest.ts` (P6) | 0 em / en dashes; every hero and section title tagged with structure and register; ≥ 3 structures per family × locale; the generative skeleton layer's seeded share subset (≤ 10 % per skeleton, the full sweep in `test:slow`, QUAL-1) |
| `test:admin-tokens` | `scripts/qa/admin-tokens-check.ts` | no admin token in the orange band (§I.6); `--info` present in light and dark; `--ui-spring` absent |
| `test:admin-motion`, `test:admin-rtl` | `scripts/qa/admin-motion-check.ts`, `scripts/qa/admin-rtl-lint.ts` (P2, DES-R2) | §I.6 motion rules (no spring, no overshoot, ≤ 400 ms); §I.5 logical-property lint and the mirrored-icon allow-list |
| `test:i18n-coverage` | `scripts/qa/i18n-coverage.ts` (P2) | §I.5: ar/fr/en completeness of the R1 surfaces, tenant notification kinds and gate titles; no em-dash or "Step n" in catalogs |
| `test:prepublish` | `src/lib/render/selftest-prepublish.ts` (maintainer) | §M: the registry runs every check, a hard item refuses with the right code and items, `warn` mode audits and passes, listeners never fail a publish, the budget gates on the design-baseline fixtures (a 27-section 170 KB page is refused, the keep-list pages pass); **rev 3:** the calibrated band of C2 / C3 / F1 (a page at the nominal limit is a soft `estimated` note, one past the band is refused; ENGP-6), fixtures read from the committed `src/lib/design/calibration/heights.json` (never the git-ignored `qa/saas-baseline/index.json`), one fixture per store page kind through `gateInputFor` (a `defaultTemplate` publish passes with 0 items, two stores' identical `@cart` templates never raise `design:N1`; ENGP-1), `budget:R1/R5/I1/F5` exclude non-control arm wrappers (ENGP-18), and the module throws at load in a production build while `estimateHeights` is a stub (ENGC-21); **rev 4:** the verified exhaustion path (a saturated synthetic niche → a soft `design:N1` with `vars.fallback = 1`; one clearing variant → hard, its fix that variant; a clone → hard whatever the niche; DES N2), `originFrom` over a generation record (an edited field → `owner`, a field without a record → `library`, AI R44), `budget:F1` emits no form-height item (LAN N3), and `gateInputFor(doc, await gateCtxFrom(ctx))` is the only path from a `PrePublishCtx` (a grep case) |
| `test:health` | `src/lib/health/selftest.ts` (P1) | §I.7: fixtures per rule with and without `minN`; score monotonic; group caps; snooze expiry; i18n templates render with every variable; a two-store fixture proves no cross-store evidence |
| `test:pulse` | `src/lib/pulse/selftest.ts` (P2) | §I.4: `StorePulse` shape, ETag stability for identical payloads, contributor budget and failure isolation, per-user parts never cached across users |
| `test:test-orders` | `src/lib/testing/selftest.ts` (P3) | D54: token mint/verify (2 h, store-bound, store A's token rejected on store B), `renderTestDocument` has no pixel script and a banner, `is_test` propagation on orders and leads |
| `test:kit`, `test:links` | `scripts/qa/kit-check.ts`, `src/lib/links/selftest.ts` (P3) | SF-01: 60 eval fixtures → 0 invented numbers in every brief, banned words 0, distinct structure tags per angle, the kit compiles with Cloud AI off; `/go/<code>` preserves the query byte for byte, 410 when paused, share link 404 after revocation |
| `test:profit` | `scripts/qa/profit-check.ts` (P4) | SF-04: golden fixtures for `E_placed`, break-even CPA and intervals; no rates below n = 30; alerts fire once and clear; cents parity with `src/lib/page/pricing.ts`; zero costs typed → prompts, no numbers |
| `test:ops`, `test:queue`, `test:state` | `scripts/qa/{ops-check,queue-check}.ts`, `src/lib/orders/state.selftest.ts` (P4) | state machine legality and projection; claim queue under concurrency with a fake clock (two agents never get the same order); outcome ladder; **rev 4:** `isCallable` / `nextCallableAt` / `hoursText` over `window.fixtures.ts` (ISO keys, never a 0-indexed array), the removed `store.confirmation.hours` / `policies.contact.hours` read or written nowhere, operations' read functions return rows through `maskIfImpersonation` (a static check forbids a local mask helper) |
| `test:tracking`, `test:leads` | `scripts/qa/{tracking-check,leads-check}.ts` (P3) | LP-05 signed links and lookups; LP-06 / LP-11 lead capture, attribution and conversion |
| `test:honesty`, `test:cod-invariants` (rev 2.1) | `src/lib/landing/honesty/selftest.ts`, `src/lib/landing/cod-invariants.selftest.ts` (P3) | LAN-§6: every `honesty:*` gate has a failing and a passing fixture, `auditNumbers` on the baseline numbers set, messages exist in ar/fr/en; LAN-§3.7: `codInvariants()` fails `foldOk` on the 23 stage-hero baseline pages and `formScreen ≤ 3` on the screen-14-17 forms, passes every keep-list page |
| `test:platform` (rev 2.1) | `scripts/qa/platform-check.ts` (P1) | PLA-§O: `scoreSignup` fixtures per band with `explainBand()` counterfactuals, `autoApprove` table, `lifecyclePreview` = effect (fixtures per edge), plan-impact diff, the console UX ceiling rules on the console components (PLA-§4.7) |
| `test:ai`, `test:ai-eval` (rev 5, CRIT2-9: `test:ai-eval` runs in `test:slow`, not in `npm test`) | `src/lib/ai/selftest.ts`, `scripts/qa/ai-eval.ts --offline` (P7, AI R21) | policy and ladder tables, PII gate, injection screen, cost math, class router; the deterministic scorers on the 20-case committed smoke set (invented numbers 0, banned words 0, no-orange, language purity, diversity floor); **rev 5:** the `configured: false` case of `window.fixtures.ts` gives `FinalizeCtx.callingHours.text = null` and every stated call hour is rejected (CRIT2-1, D73); a spy asserts that `recoverOrphans` makes no provider call and only marks orphans or submits a one-item batch (CRIT2-3, §H.2 slot 4c) |
| `test:design`, `test:registry` | `scripts/qa/design-check.ts`, `src/landing/selftest-registry.ts` (P6, DES-R7) | genome sampling, solver invariants, distance metric, gates incl. the design-baseline §5 hard targets as fixtures (N1-N8, C1-C7, T1-T8, K1-K8, I1-I7, R1-R9, D1-D6, RTL1-RTL8, F1-F5); section registry `features` field complete |
| `test:permissions` (extended) | `src/lib/auth/selftest-permissions.ts` | + `orders.lookup`, `stores.create`, `abuse.handle`; `ai.assist` never implies `ai.use`; `campaigns.write` ⊆ `pages.write` holders; R1 release of `shipments.write` / `finance.*` limited to the §A.3.2 roles |
| `test:catalog`, `test:store-runtime`, `qa:storefront-render` (R2, STO-R13) | storefront.md | catalog rules, store chunks within their budgets, store-page renders |
| `test:logo` (R2, DES-R7) | design.md | shaping, outlines, small-size test |

`render-check` (`scripts/qa/render-check.ts`, the maintainer's harness from R1 product; T3's in R1.0) gains store-path
fixtures (P and S bases, links, canonical, media URLs, CSP origins), measures every **add-on chunk** and the page caps
from `budgets.json.compositions` (`page` 34,800 B, `thanks-page` 12,600 B; §H.13), the `css` key (DES-R5), a fixture for
`purchaseInBrowser` true/false (the thank-you document with and without the `pixels` chunk, OPE Q.6d), a test-render
fixture (no pixel script, banner present), and keeps every runtime budget (`budgets.json`): **the `landing` chunk with
tolerance 0 against its recorded budget and `src/landing/runtime/landing.sha256`, every other chunk at +5 %** (rev 3,
ENGC-10 / ENGP-26). It imports the tracks' fixture modules `scripts/qa/render-cases/<track>.ts` (P3 `landing.ts`:
delivery fallback, thank-you timelines, the `.lp-ty__tint` rule, the order-form contract rows; P6 `design.ts`: goldens,
the five hero families, the T1 CSS lint, RTL regexes, no `adm-aurora` / `adm-grain`, **rev 5 (CRIT2-4, D60): no `.lp-aurora`, `--lp-aurora*`, `--lp-grain` or `data-texture="grain"` in any generated page and no `.lp-legal__aurora` / `.lp-ty__aurora` in P3's pages**; S1 `storefront.ts`; rev 3,
ENGP-12) so no track edits the harness. It also asserts **0 changed checksums** on the existing fixture docs after the
`ThemeSpec.look` addition (DES-R1: `look` is optional with no default, so old docs serialise byte-identically; the rev 4
`ThemeLook.em: "none"` and `locks` + `G23` widenings keep it). **Rev 4 (CRIT15):** every page-kind fixture (landing with
and without a footer section, thank-you, tracking, legal; R2 store kinds) asserts **exactly one** "Report this store"
link, absolute to `platformOrigin()`, its `?p=` without a query; every export fixture (ZIP, PHP, connected) asserts
none (cases in `render-cases/design.ts` for the footer, `render-cases/landing.ts` for P3's pages, the harness itself for
the Shell fallback).

### J.2 DB-backed (`npm run test:db`; local XAMPP MariaDB, throwaway databases only)

Guard (from `scripts/qa/pixels-publish-check.ts:22-41`): the database name must match `cod_test_*` or `cod_px*`;
never `cod_studio`, never `cod_storegen`. Each script creates its DB, runs `runMigrations`, seeds, and drops it.

| Script | File | Checks |
|---|---|---|
| `test:tenancy` | `scripts/qa/tenancy-check.ts` | the two-store attack suite (§F.1) through `runAsIdentity` (§E.4) for every role of B and for an impersonating staff member (rev 3: incl. the masked-canary case on every tenant route, the preview-token cases, the sandbox ceilings, the derived route list); runnable from T4's first week against C0a's minimal seam (§K.1) |
| `test:migrate` | `scripts/qa/migrate-check.ts` | (a) empty DB → 0000…000N → column set equals `schema.ts`; (b) a legacy fixture at 0003 (owner + editor + agent users, pages incl. `is_home`, versions, orders, leads, blocklist, exports, encrypted `tracking_secrets`/`turnstile`, `ai`, `home`, `pixels`) → 0004+ and `convertLegacyStore()` → every `store_id` = store #1, memberships, `super_admin`, home moved, **store #1's `turnstile` value readable before the conversion runs** (ENGC-19), the derived handle and the `freeRename` grant (ENGC-30), settings readable under v2, marker; (c) run everything twice → no change; (d) interrupt 0004 after statement N for several N, rerun → same end state; (e) **the lint's and the purge's tenant set from `schema.ts` equals the §D.3 rows** (ENGC-31); (f) 10 parallel accepts of one invite → one membership (SEC-24); **(g) rev 5 (CRIT2-5):** the legacy fixture's pages get `first_published_at` = their oldest `kind = 'publish'` version, a never-published page keeps NULL, a second run changes nothing, and a publish → unpublish → republish through `publishPage` leaves the first value unchanged |
| `test:storage` | `scripts/qa/storage-check.ts` | FS backend on a temp `DATA_DIR`: durable put, **crash between files and DB row → an immediate retry succeeds** (idempotent `put`, ENGC-20) and the sweeper still removes true orphans, db → fs migrator, quota race (20 parallel uploads at the limit → exactly the allowed ones succeed), the shared `pending_media_bytes` budget charged first and refunded on transition (D69), per-store ids for identical bytes, boot-check refusals (inside cwd, symlink, not writable, `.sg-owner` mismatch; ENGC-14), after a purge no path under `DATA_DIR/<area>/<storeId>` exists (SEC-21) |
| `test:pixels-publish` | existing, updated | per-store library rule and secrets; same pixel id in two stores uses each store's token |
| `test:public-api` | `scripts/qa/public-api-security.ts` (updated) | store buckets, blocklist and per-phone limits per store, suspended pageKey refused, `storeHosts` origin binding (V6 offline); a test-token order is `is_test`, skips CAPI/Sheets/stats and still goes through risk and the queue (D54); `/api/public/wa` creates a `whatsapp` lead without a phone |
| `test:php` | existing | PHP parity unchanged (PHP export contract frozen) |
| `test:ops-db`, `test:integrations-db` | `scripts/qa/{ops-db-check,integrations-db-check}.ts` (P4, P5) | claim queue under 20 parallel claims without `SKIP LOCKED`; hooks `inTx` rollback; `INSERT IGNORE` dedupe of outbox items on a retried transition; `integration_status` writes ≤ 1/min per row; **rev 3:** the manual v2 path inserts through `createOrderRow` (one insert pipeline, D72), masked rows under an impersonation scope (D70), and in R2 "manual v3 total = public v3 total" (OPS-15) |
| `test:design-db` | `scripts/qa/design-db-check.ts` (P6, DES-R7) | novelty pool reads return bands only; publish listener writes the `published` genome and flips the previous live row; shingles rewritten on publish/unpublish; purge by `owner_tag`; **rev 5 (CRIT2-5):** first-come by `pages.first_published_at` (A live → B too close refused → A republishes → A not refused) still holds after A's old `page_versions` and genome rows were pruned by retention |
| `test:health-db` | `scripts/qa/health-db-check.ts` (P1) | the `platform.health` job over 3 seeded stores: dirty-first order, snapshot upsert, milestones once, `quota.80` once per period, no customer data in any snapshot column (canary) |
| `test:ai-db` | `scripts/qa/ai-db-check.ts` (P7) | reserve → reconcile with `allowOver`, `ai_credits_day` races (20 parallel calls at the limit → exactly the allowed ones), `ai_jobs` orphan recovery, **the same input run twice to `done` (no unique-key error, ENGP-3)**, two concurrent polls run one stage once, the pending slice `ai_cost_micros_pending` and `ai_credits_director` charged (D69, AI R28), prompt assembly for store B with store A's memory and exemplars present contains none of A's strings (rethink-ai §5.3); (rev 2.1) `aiJobsForPulse` never returns another store's or another viewer's job ids; the ai attack cases live in `scripts/qa/tenancy-cases/ai.ts` |
| `test:storefront-db` (R2, STO-R13) | `scripts/qa/storefront-db-check.ts` | catalog, inventory moves idempotency, `catalog_redirects`, template set lifecycle; **rev 5 (CRIT2-17):** stock transition then price change while the first job is pending → one `sync` version with the new price (§H.3 diff rule) |

### J.3 HTTP / e2e (`npm run test:e2e`; a production build started on port 3451+ against a `cod_test_*` DB)

The harness first asserts `GET /api/health` → `app: "store-gen"` (never COD Studio's 3400, QA-01).

| Script | File | Checks |
|---|---|---|
| `qa:headers` | `scripts/qa/headers-check.ts` | §F.6 header sets per response class and host class; byte-identical 404 headers across producers (the proxy's included, ENGC-22); (rev 2.1) the `/go/<code>` 308 carries `Cache-Control: private, no-store` while a canonical 308 carries `public, max-age=300`; `/track`, `/kit/<token>` and test renders carry `noindex` + `private, no-store`; **rev 3:** `Referrer-Policy: same-origin` on `/invite/*`, `/reset/*`, `/report/*` and `no-referrer` only on `/kit/*` (ENGC-16), the manifest public with `max-age=3600` and no `Set-Cookie` (ENGC-24), HSTS with `includeSubDomains` only on the platform host in S mode (SEC-15), `CDN-Cache-Control: no-store` on edge-served documents (ENGC-2), no bare `'self'` in any served document's `connect-src` / `form-action` (SEC-2) |
| `qa:edge-sim` | `scripts/qa/edge-sim.ts` | sends Worker-shaped requests (`x-sg-host`, `x-sg-edge`, `x-sg-ip`, `x-sg-ts`) to the local server: S-mode rewrites, Cookie never reaching store routes (nor `store` / `preview` / `public-api` areas on the platform host, SEC-2), `Set-Cookie` never sent on store hosts and never without the `__Host-` prefix on the platform host (SEC-13), own-handle 308, `/admin`/`/app`/`Next-Action` 404 on store hosts, CSP with the store host only, order posts from the right and the wrong store host (V1, V4, V5, V6 locally); **rev 3:** a present-but-wrong `x-sg-edge` → the neutral 404 (SEC-4), `GET https://<h>.<root>/` → 200 store home and `/x/` ≡ `/x` (ENGC-15), two store hosts requesting one path never share a cached body and the apex request of it answers the platform page (ENGC-2), a client-sent `x-sg-path` on the upload route and on a matcher-excluded path is ignored (SEC-3) |
| `qa:action-replay` | `scripts/qa/action-replay.ts` | §F.1 server-action replay with Playwright (`channel: "msedge"`, HANDOFF §3) |
| `qa:r1-exit` (R1.0 finale) | `scripts/qa/e2e/r1.0-exit.ts` (maintainer) | §K.1 exit criterion 5 in one browser run on a production build (`next start` on 3452, `cod_test_fin_e2e`, its own random secrets, every non-localhost request aborted): gate → `/admin/setup` with SETUP_TOKEN → TOTP enrolment and a password + TOTP sign-in → store #1 → a page generated from a fixture photo and published (example sections hidden, never confirmed real) → `/s/<h1>/<slug>` with the §F.6 headers → a real order (Moroccan mobile) and a `?sg-test` order, both in `/app/<h1>/orders`, the test one marked → a console invite code → a second user's invite-mode signup → a pending store that builds and previews, cannot publish, gets 404 on `/app/<h1>/**` and store #1's ids answered as missing ones → the console queue lists it; Sheets only with `E2E_SHEETS_SPREADSHEET_ID` + `GOOGLE_SA_JSON_B64` in the shell. Reuses a `.next` build newer than every source file, else runs `npm run build` |
| `qa:wow-demo` | `scripts/qa/wow-demo.ts` (maintainer) + the step modules `scripts/qa/wow-demo/steps/<track>.ts` (extension point, rev 2.1: `shell.ts` P2, `landing.ts` P3, `ops.ts` P4, `platform.ts` P1, rev 3 `design.ts` P6, rev 4 `ai.ts` P7 (the Director control never overlays a fold, AI R47); committed, unlike the optional `qa/e2e` harness; each exports `steps: DemoStep[]` with the clock-table condition it asserts) | **the R1 acceptance scenario** (rethink-features §4, §K.2): the seller path on a 390 px viewport with 4G throttling, human typing modelled at 150 ms per character, every pass condition of the clock table asserted, total wall time ≤ 3:30; runs with Cloud AI **off** and the local model cache empty; runs twice with the same photos in two stores and asserts genome distance `d ≥ 0.25`; every page in the path passes the no-orange scan and the admin token check; the test order never reaches Sheets, CAPI or the learning tables and revenue stays at 0; a second agent pressing `N` does not get the same order (two sessions); the tenancy gate is green on the same build; **rev 3 (OPE Q.27n, UX-39):** the `N` press comes from the **demo store owner's** (or an invited agent's) session, never the platform owner's, and the seed step sets `ops.openOverrideUntil = now + 2 h` (both asserted); at 0:50 at least one of the three directions is a `stage` / `specimen` / dark family for the argan and parfum fixtures (the model-free alpha estimate, no model file downloaded) |
| `qa:publish-gates` | `scripts/qa/publish-gates-e2e.ts` (maintainer) | §M end to end: publishing the design-baseline worst page is refused with `budget_blocked` items naming the section count, height and bytes; a sample-review page is refused with `honesty_blocked` naming the field; the publish dialog lists the fixes; `warn` mode publishes and writes `page.publish.design_override` |
| `qa:pulse-e2e` | `scripts/qa/e2e/pulse.ts` (P2; rev 4, CRIT19: committed, not under the git-ignored `qa/`) | two tabs of one browser produce one poller (`BroadcastChannel`), unchanged polls answer 304, a status change unlocks publish without a reload within one pulse; (rev 2.1) a finished `ai_jobs` row of the viewer appears in `jobs.done` on the next poll and never in another viewer's |
| `qa:admin-perf` (rev 2.1) | `scripts/qa/e2e/admin-perf.ts` (P2, PLA-§22.18; rev 4, CRIT19: committed, so it can back §I.8 rule 1 from a clean clone) | §I.8 rule 1 on the 13 R1 screens at 4× CPU: shell navigation < 150 ms perceived (prefetched chunk present), optimistic writes complete < 500 ms, skeletons appear after 150-300 ms and stay ≥ 300 ms, no layout shift > 0.02 after hydration |
| `qa:wizard-e2e` (rev 5, CRIT2-19) | `scripts/qa/e2e/wizard.ts` (P7; committed, not under the git-ignored `qa/`) | the AI-03 acceptance in the browser: library draft first, the consent card only on desktop tier ≥ lite (never on mobile), fallback chips with "Next" never blocked, one upload through a stub upload route with zero AI render calls; with a stub Director the stage line, Undo and "Use this" cancelling the pass; the 390 px reveal screenshot step (AI-19 (15)) runs at the R1 integration, after P6's merge |
| `qa:storefront-e2e`, `qa:storefront-perf`, `qa:storefront-a11y` (R2, STO-R13) | storefront.md | store pages on cheap Android profiles, LCP and byte budgets, WCAG checks |
| `qa:design-corpus`, `qa:design-report` (local only, P6) | `scripts/qa/design-corpus.ts`, `design-report.ts` | the DG-09 calibration corpus and the §5.10 harness of the design baseline (7 fixtures × ar/fr × 10 seeds; 41-page render set; `gates[]`, `slop`, `Q` in `qa/saas-baseline/index.json`); regression = any hard gate pass→fail or median Q drop > 3 |
| `qa:ai-probe`, `qa:ai-eval-live`, `qa:ai-eval-local`, `qa:ai-stream`, `qa:detached-job-probe` (manual, need a key or the live site; never in `npm test`) | P7 | provider probe (served model asserted, fallback behaviour per class), the live eval gate through Batches, streaming, and the §H.12 detached-promise probe recorded in HANDOFF |
| `qa/e2e` tenancy step | `qa/e2e/steps/tenancy.mjs` (git-ignored harness) | optional crawl as each role of B grepping for A's canaries (TENANCY-MAP §10.2 item 3) |

### J.4 Live (after a deploy)

HANDOFF §4 smoke as updated in §H.10; after the domain move, V1 … V11 (RESEARCH §5.3) recorded in HANDOFF.

### J.5 The tenancy gate

`npm run gate:tenancy` = `test:tenancy-lint` + `test:tenancy-unit` + `test:tenancy` + `test:migrate` + `qa:edge-sim` +
`qa:action-replay`. `npm run gate:offline` (rev 3, SEC-10) = `test:tenancy-lint` + `test:ownership` + `test:hosts` +
`test:permissions` + `test:envelope` + `test:security` (rev 5, CRIT2-22: every one runs without `.git`; `test:ownership`
reads the committed `docs/saas/ownership-baseline.json`, so `prebuild` behaves the same in the archive build). `npm run gate` = `typecheck` + `lint` + `test` + `test:slow` +
`test:db` + `build` + `test:e2e` + `scripts/qa/secrets-check.ts`, and on green it writes **`qa/.gate-ok`** (`{ sha:
<HEAD>, at: <iso> }`). **`npm run gate:r1`** (the R1 exit) = `gate` + `qa:wow-demo` + `qa:publish-gates` +
`qa:design-corpus` (median Q and the hard gates on the merged build) + `test:ai-eval` (offline) and, when a key is
present, `qa:ai-eval-live`.

- **The build enforces the offline layer (rev 3, SEC-10):** from the R1.0 integration, `package.json`'s `prebuild` runs
  `gate:offline` before the asset builds, so `next build` cannot produce an artifact with a lint, host, permission,
  envelope or CSRF violation; the deploy script refuses an archive without a fresh `qa/.gate-ok` for the current HEAD
  (§H.10). A procedural rule ("no deploy with the gate red") is thereby a mechanical one.
- From the R1.0 merge on, **no track merges into `main` with the tenancy gate red**, and no deploy happens with
  `npm run gate` red (plus the upgrade dry run on a production dump, §H.10).
- A new tenant table, a new server action file, a new route handler or a new cache is covered automatically (L1, L9,
  L13, L4 read `schema.ts` and the file tree; `tenancy-check.ts` and `action-replay.ts` derive the route list from the
  tree, §F.1); a new public route still adds its **header** cases to `headers-check.ts` in the same merge.

### J.6 Scripts of later releases (rev 4, CRIT16; named now so the C0b `package.json` plan and `test:slow` are complete)

Each joins `npm test` (offline), `test:db` or `test:e2e` at its release's contract step, inside its group's budget of
§J.1's table (rev 5, CRIT2-9: 240 s from the R2 contract step, the R2 and R3 rows named there); its file is owned by
the track named.

| Release | Script | File (track) | Group |
|---|---|---|---|
| R2 | `test:catalog`, `test:store-runtime`, `qa:storefront-render` | `src/lib/catalog/selftest.ts`, `src/storefront/runtime/selftest.ts`, `scripts/qa/storefront-render-check.ts` (S1) | `npm test` (the 1,200-home sweep in `test:slow`) |
| R2 | `test:storefront-db`, `qa:storefront-e2e`, `qa:storefront-perf`, `qa:storefront-a11y`, `qa:storefront-demo` | `scripts/qa/storefront-{db-check,e2e,perf,a11y,demo}.ts` (S1) | `test:db` / `test:e2e` (the demo is an R2 exit check, STO-§26.4) |
| R2 | the LP-23 copy check (copy a page to another store, B's asset ids only) | `scripts/qa/copy-check.ts` (S1) | part of `test:db` |
| R2 | `test:logo`, `qa:design-visual` | `src/lib/logo/selftest.ts`, `scripts/qa/design-visual.mjs` (S2) | `npm test` / local |
| R2 | `test:ledger`, `test:imports` | `scripts/qa/ledger-check.ts`, `src/lib/imports/selftest.ts` (S3; the importer fixtures under `scripts/qa/fixtures/imports/**`, S3; rev 5, CRIT2-10: S3's DB-backed suite is `test:ledger`, never `test:money`, which stays today's offline money-parity proof `scripts/qa/money-parity.ts`, `package.json:26`) | `test:db` / `npm test` |
| R2 | `test:carriers` | `scripts/qa/carrier-check.ts` (S4) | `test:db` |
| R2 | `test:webhooks` | `src/lib/webhooks/selftest.ts` (S5) | `npm test` |
| R3 | `test:experiments` | `src/lib/experiments/selftest.ts` (D3; 2,000 seeded A/A runs in `npm test`, 10,000 + the τ sweep in `test:slow`) | `npm test` |
| R3 | the LP-10 / LP-13 / LP-15 / LP-24 checks | `scripts/qa/{chain-check,schedules-check,analytics-check,saved-blocks-check}.ts` (D3) | part of `test:db` |
| R3 | the learning simulations (`ai.genes`, risk v2, call time) | inside `test:ai` / `test:ai:slow` (D4) | `npm test` / `test:slow` |

---

## K. Releases and file ownership

Roles: the **core maintainer** (the lead session) owns this document, the shared files (§K.3) and the merge order;
**track agents** own the files listed for their track and nothing else; reviewers check each merge against the
contract. Build method: OFFERS §I.6 (contract first, parallel tracks with strict ownership, integration, adversarial
verification, fix loop). Network outages kill agents here (HANDOFF §7): every track works from the working tree and
can resume.

### K.1 R1.0 "core tenancy"

**Step C0: contract (rev 3, ENGC-9: two sub-steps, 5-7 agent-days in all, not "one agent, ~2 days").** The rev 2.1
table bundled an 11-rule compiler-API lint, a 20-table migration, every settings schema, ~20 skeletons, dozens of stubs,
DESIGN v3 and rows that belonged to T3 / T4 into one two-day step whose seam exited as throwing stubs, so T4 (the largest
track) could not run a single page or `test:tenancy` until T2 merged. Rev 3 splits it:

- **C0a (serial, merges first, ~3 agent-days, one agent):** the types, the permission matrix, `schema.ts` + 0004, the
  pure helpers, the frozen cross-track signatures as typed stubs, **and a minimal working seam** (~150 lines:
  `requireStoreMember` with session + handle + membership + the read-only guard, `storeAction`, `storeGuard`,
  `platformScope`, `publicScope`, `systemScope`; no rate buckets, no 2FA policy, no impersonation) that T2 later
  hardens in place. With C0a merged, every track can run its pages end to end on XAMPP and **T4 runs `test:tenancy`
  from its first week** against the real seam.
- **C0b (in parallel with T1-T4, merges before T4, ~2-4 agent-days, the maintainer or a second agent):** the tenancy
  lint, the extension skeletons, `scripts/qa/ownership-check.ts`, `docs/DESIGN.md` v3 (the design lead), the
  `rateLimit` overload and the budgets/render-check compositions.

The rows a track implements (the render hook, preview tokens, test-order plumbing, `createOrderRow`, the checklist
context) **live in that track's row below**, not in C0: C0a only fixes their signatures. Output, all frozen at merge
(changes afterwards only through the maintainer, §K.3):

| File | Content at C0 exit (a = C0a, b = C0b) |
|---|---|
| `src/lib/tenancy/types.ts` (a) | §E.1 types incl. `WriteScope` / `ReadScope` (D71) |
| `src/lib/auth/permissions.ts` (a) | §A.3 (full matrix incl. R2/R3 keys flagged; `orders.export` for `manager`), `can`, `canPlatform`, `invitableRoles`, `canManageMember`, `STEP_UP_PERMISSIONS` — implemented |
| `src/lib/tenancy/mode.ts`, `src/lib/tenancy/entitlement-keys.ts` (a) | §A.2, §A.4 registry incl. the rev 3 metrics — implemented |
| `src/lib/tenancy/sql.ts`, `src/lib/tenancy/cache.ts`, `src/lib/db/locks.ts` (a; rev 5, CRIT2-21: **T1 takes `sql.ts` and `cache.ts` over at C0a's merge** for the rest of R1.0, as T2 does `seam.ts` and T1 `jobs/scope.ts`; `sql.ts` / `cache.ts` are read-only from P0, changed only through the maintainer; `locks.ts` passes to P8 in R1 product per its §K.2 row); `Bucket` + `platformBucket`/`storeBucket` **and the deprecated `string \| Bucket` overload** in `src/lib/security/rate-limit.ts` (b, ENGC-28) | §E.3, §E.6, §E.7 (with the 2-connection lock pool), §E.8 — implemented (small, pure or near-pure) |
| `src/lib/edge/host.ts`, `src/lib/edge/areas.ts`, `src/lib/urls/index.ts` (a) | §C.2 (fail-closed step 2, `x-sg-ts`, `workerVersion`), §C.3 step 1, §C.6 — implemented (pure) |
| `src/lib/tenancy/seam.ts`, `src/lib/platform/seam.ts`, `src/lib/jobs/scope.ts` (a) | §E.2 signatures with the **minimal working bodies** above (T2 hardens `seam.ts` / `platform/seam.ts`, T1 completes `jobs/scope.ts`) |
| `src/lib/tenancy/public.ts` (a) | §E.2 signatures fixed by C0a; **T3 implements the bodies in R1.0; maintainer-owned from P0** (rev 3, ENGC-27: one owner per phase, and the T3 row no longer depends on T2 for it) |
| `src/lib/db/schema.ts` (a) | every §D.2 0004 change and every §D.4 table (incl. `page_slug_history`, `preview_tokens`, `is_test`, `store_usage.period varchar(10)`, rev 5 `pages.first_published_at`) |
| `drizzle/0004_tenancy.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` (a) | §D.8 (SQL complete; the JS conversion is T1's) |
| `src/lib/settings/platform-registry.ts`, `src/lib/settings/store-registry.ts`, `src/lib/settings/keys/*.ts` (a) | §D.10 every R1 key with its first schema (the `platform` key file is P1's from P0, ENGC-8) |
| extension skeletons | `src/components/admin/shell/nav/{types,index}.ts`, `src/components/admin/shell/commands/{types,index}.ts` (§I.3), `src/lib/jobs/{registry,runner}.ts` (types), `src/lib/jobs/tracks/*.ts` (empty arrays), `src/lib/i18n/admin/{index,en,fr,ar}.ts`, `src/lib/orders/hooks.ts` (the `OrderHook` / `OrderHookEvent` shapes of OPE-§3.6: phases `inTx` with a transaction handle and `afterCommit`, events `created`, `transition`, `edited`; `runOrderHooks(on, phase, scope, event, tx?)`; OPE Q.7), `src/lib/render/prepublish.ts` (§M registry: `registerPrePublishCheck`, `registerPublishListener`, `runPrePublishChecks`; DES-R3 + LAN Q13), `src/lib/pulse/{types,registry}.ts` (§I.4), `src/lib/notify/registry.ts` + the `notify()` signature (PLA Q.15), `src/lib/flags/registry.ts` (§D.4), `src/lib/health/{types,registry}.ts` (§I.7), `src/lib/admin-data/search/` folder with the `SearchProvider` type (LAN Q18) |
| cross-track signatures (a) | the scoped signatures every track calls in another track's files: settings, audit, entitlements/usage/lifecycle, `invalidateFlags`, `chargePlatformUsage` / `refundPlatformUsage` (T1); seam, `requireUser`, `userAction`, `publicAction`, `notify`, `banUser`, `unbanUser`, `resetUserTwoFactor`, `createPasswordResetLink`, `revokeUserSessions`, `createAccount`, `leaveStore`, `listMembersByScope`, `listInvitesByScope`, **`deleteUserAccount`**, **`stepUpWithPasswordAction`** (T2, PLA Q.19, Q.11; rev 3 SEC-20, SEC-17); `resolvePublicTarget`, `publicScope`, `resolveOrderForTracking`, `resolveKitShare`, `resolveTestToken`, `getPageStats`/`recordEvent`/`bumpOrderStats`, `publishPage`/`unpublishPage`/`renderAndCommit`, **`createOrderRow(draft, ctx)`** (D72), `mintPreviewToken` / `revokePreviewToken` (T3); `listPagesForConsole` (rows with `name` and `seoTitle`, rev 3 SEC-18), `buildChecklist(doc, ctx)` (T4); `scoreSignup` in `src/lib/platform/signup-risk.ts` (the widened contract, returning the fixed `review` band until P1 implements it, PLA Q.9); `maskIfImpersonation` / `maskCustomerFields` in `src/lib/platform/mask.ts` and `checkBrandTerms` in `src/lib/platform/brand-check.ts` (identity / `null` until P1, D70, D76) — written as typed stubs |
| `scripts/qa/tenancy-lint.ts` and its allow file `scripts/qa/tenancy-allow.json` (b) | rules L1-L10, L12, L13 implemented (L11 arrives with R2's contract step); runs standalone (`npm run test:tenancy-lint`), **not yet** in `npm test` or `prebuild` |
| `scripts/qa/ownership-check.ts` (b) | `test:ownership` (§J.1): the glob-intersection check over every row of §K.1 / §K.2 / §K.4 and the parts' ownership tables; in `npm test` from C0b; rev 5 (CRIT2-22): with `--write-baseline` and the first committed `docs/saas/ownership-baseline.json` (phase `R1.0`), re-written at P0, the R2 and the R3 contract steps |
| `package.json` (b: `typescript` in devDependencies; the script entries are C0a's, maintainer build note) | the new scripts (§J incl. `test:slow`, `gate:offline`), `typescript` in devDependencies; `prebuild` gains `gate:offline` **at the R1.0 integration**, not at C0 (SEC-10) |
| `src/landing/runtime/budgets.json` (b) | the `compositions` object (ENGP-12) and the add-on keys of §H.13; the `landing` value is re-recorded by T3 after the prefix edit (header freeze rule) |
| `docs/DESIGN.md` (b) | **DG-01 (DESIGN v3)**, written by the design lead during C0 (docs only), so no build agent reads the old bible (GEN-14); its budgets table is the §M.2 source |
| `src/lib/page/schema.ts` (a; frozen contract, one additive change) | the DES-§4.1 constants (`GRAMMARS`, `COLOR_STRATEGIES`, `TREATMENTS`, `LADDERS`, `DEPTHS`, `MASKS`, `EASE_FAMILIES`, `REVEALS`), the `ThemeLook` object and `look: ThemeLook.optional()` in `ThemeSpec` with **no default** (DES-R1), **as DES-§4.5.1 now writes it** (rev 4, DES N6: `ThemeLook.em` includes `"none"` for G26 `none`, `ThemeLook.locks` adds `"G23"`, max 7 entries; DESIGN v3 §2.5 lists `data-emphasis="none"` and P6's `THEME_ATTR_VALUES` follows it, `theme:check` keeps the two equal); render-check and the published-checksum boot task must show 0 changed checksums on existing docs — the one PageDoc v2 change of R1, additive and optional |

**Maintainer build note (2026-10-24).** Three build decisions for C0: (1) the "extension skeletons" row and every R1.0
`package.json` script entry are done in **C0a**, not C0b, so no track touches `package.json` or a shared skeleton (C0b
keeps the tenancy lint, `test:ownership` and its baseline, DESIGN v3, the `Bucket` builders with the deprecated
`rateLimit` overload, and the `budgets.json` compositions); (2) C0a writes every frozen cross-track signature as a
**typed stub that compiles**: it throws `not implemented: <track>` or returns the documented safe default, and where
the stub lives in an existing file that has a working function with another signature, the old function keeps working
for its callers (a deprecated overload or an adapter), so `main` typechecks and behaves as before; (3) the **minimal
working seam** (~150 lines) is real, not a stub, so every track runs its pages end to end on XAMPP from C0a's merge.

C0a exit: `tsc` green (the deprecated `rateLimit` overload keeps today's callers compiling); today's `npm test` green;
`drizzle/0004` applies on an empty `cod_test_*` DB; one page under `/app/<h>` renders through the minimal seam on
XAMPP. C0b exit: `test:tenancy-lint` runs standalone and reports today's violations, `test:ownership` is green.

**Then four parallel tracks** (disjoint files; each may read everything):

| Track | Owns (create/modify/delete) | Delivers | Depends on |
|---|---|---|---|
| **T1 DATA** | `src/lib/db/**` (except `schema.ts`, `locks.ts`), `src/lib/tenancy/{convert.server.ts, entitlements.ts, usage.ts, lifecycle.ts, handles.ts, cache.ts, sql.ts}` (`cache.ts` / `sql.ts` from C0a's merge, rev 5 CRIT2-21), `src/lib/jobs/scope.ts` (`systemScope`, `forEachStore`), `src/lib/settings/index.ts`, `src/lib/security/crypto.ts`, `src/lib/security/selftest-envelope.ts`, `src/lib/audit.ts`, `src/instrumentation.ts`, `src/lib/tenancy/selftest.ts`, `scripts/qa/{upgrade-dry-run.ts, migrate-check.ts}`, `src/lib/platform/data/protected-brands.ts`, `src/lib/platform/data/legal/index.ts` (the R1.0 seed stub of CCR r1.0-t1-3, P1's from R1) | envelope v2 (§F.3), settings split + caches (§D.10), entitlements/usage/lifecycle (§A.4-A.5), handles (§C.7), audit v2 (§F.5), conversion task + boot order (§D.8, §H.4), tenancy dry run, `test:migrate`, `test:envelope`, `test:tenancy-unit` | C0 |
| **T2 AUTH** | `src/lib/auth/**` except `permissions.ts`, `unknown-page.ts`, `host-selftest.ts` (and nothing under `src/lib/security/**`: `selftest.ts` there is T3's, rev 3 ENGC-8); `src/lib/tenancy/{seam.ts, context.ts, invites.ts, owned.ts}`; `src/lib/platform/{seam.ts, impersonation.ts, notify.ts}` (`notify` = a minimal insert in R1.0 behind the frozen signature); `src/lib/mail/**`; `src/app/(public)/**`; `src/app/app/{layout.tsx, page.tsx}`, `src/app/app/account/**`, `src/app/app/new/**` (functional skeleton), `src/app/app/[store]/team/**`; `src/app/admin/{layout.tsx, page.tsx}`, `src/app/admin/(auth)/**`; `src/components/admin/settings/{team-panel.tsx, security-panel.tsx}`; `src/lib/auth/selftest-permissions.ts` | §B (login incl. the challenge-only account bucket, signup modes incl. invite/approval with the Turnstile gate and the daily ceiling (D69), `identity_links` device/net rows (PLA Q.3; the `__Host-sgd` cookie itself is set by T3's proxy, SEC-12), invites with compare-and-set consumption (SEC-24), sessions, switcher data incl. the agent landing path, 2FA policy, step-up with `stepUpUntil` and the tenant password step-up (SEC-17), reset links, impersonation seam with the PLA Q.31 rules and `scope.kind = "impersonation"` (D70), Mailer interface, bootstrap, the PLA Q.19 user functions incl. `deleteUserAccount(ctx: UserCtx | PlatformCtx, target?: { userId; reason })` with the `owns_store` / `is_staff` refusals (SEC-20; rev 4 PLA Q4.7) and `stepUpWithPasswordAction` (§B.7)), §E.2 seam hardening incl. the `WriteCtx` overloads (rev 4, D71) over C0a's minimal bodies (`assertSameOrigin` first, `x-sg-path-sig`, 2FA, buckets), §E.4 context | C0a; T1's settings and audit APIs (signatures frozen, stubs until merged) |
| **T3 EDGE** | `src/proxy.ts`, `src/lib/edge/**`, `src/lib/urls/**`, `src/lib/auth/{unknown-page.ts, host-selftest.ts}`, `src/lib/security/{csrf.ts, headers.ts, ip.ts, selftest.ts}` (`selftest.ts` added rev 3, ENGC-8: T3 changes `csrf.ts` / `ip.ts`, so it owns their test), `src/lib/render/**` (incl. the new `preview-token.ts`; the `prepublish.ts` registry file itself is the maintainer's; rev 5, CRIT2-5: `publish.server.ts` sets `pages.first_published_at` once with `COALESCE` in the version-row transaction, §D.2), `src/lib/stats/**`, `src/lib/orders/{origin.ts, resolve.ts, create.ts, leads.ts, upsell.ts, turnstile.ts, http.ts, export-origins.ts}` (**`create.ts` exports `createOrderRow(draft, ctx)`**, D72: the extracted insert of `create.ts:255-300` with the id retry, `is_test`, `rev`, `confirm_state` defaults, `upsell_token_hash`, `order_events` "created", `INSERT IGNORE` outbox and the `runOrderHooks("created", …)` call inside `after()` with the built `PurchaseConversion` or null, OPE Q.7; `newOrderId` stays in `src/lib/db/ids` (T1) and `create.ts` does not re-export it, rev 4 CRIT20), `src/lib/tenancy/public.ts` (bodies; signatures from C0a, ENGC-27), `src/landing/{context.ts, document.tsx}`, `src/landing/legal/**` (R1.0 only; moves to P3 in R1 product, LAN Q16), `src/landing/runtime/{core.ts, tracking.ts, pixels.ts, order-store.ts, entry-whatsapp.ts}` (the storage-key prefix derived once in `core.ts`, §C.9) and the new `src/landing/runtime/landing.sha256` (the post-R1.0 pin), `src/app/api/public/**`, `src/app/s/**`, `src/app/[slug]/**`, `src/app/legal/**` (deleted), `src/app/route.ts` → `src/app/(marketing)/**`, `src/app/{robots.txt, sitemap.xml, preview, api/health}/**`, `src/app/media/[key]/route.ts` (status check only), `src/app/{layout.tsx, not-found.tsx}`, `edge/worker.js`, `scripts/qa/{render-check.ts, headers-check.ts, edge-sim.ts, public-api-security.ts}` (render-check is the maintainer's from P0), `src/lib/edge/selftest.ts` | §C (host classes incl. the fail-closed edge step and `x-sg-ts` (SEC-4), proxy incl. the `kit` / `report` / manifest rules, the Cookie deletion for store areas on the platform host (SEC-2), `x-sg-path-sig` (SEC-3), the `__Host-sgd` marker (SEC-12), the store rewrite without a trailing slash (ENGC-15), the two proxy header sets (ENGC-22); store routes in P mode with S/C redirects, slug-history 308 (reads `page_slug_history`, 0004), URL builders, canonical, robots/sitemap, cookies/CSRF/CSP/order origin incl. the per-request `connect-src` narrowing on every host class (SEC-2) and the `originAllowed` entry validation (SEC-23), Worker with the `cf` cache option (ENGC-2)), §F.6 headers incl. HSTS per host class, public writes carrying the store (ORD-01…ORD-07, ORD-17, ORD-18, ORD-21), stats per store with the store timezone (STAT-01…04), render context per store (PUB-*), the **render add-on hook** and `purchaseInBrowser` (§H.13; the signatures from C0a), the **test-order plumbing** on the public path (`is_test` from `resolveTestToken()` in `create.ts` / `leads.ts`, skips CAPI enqueue and `bumpOrderStats`, `sheet_status = 'disabled'`) and the test render (`renderTestDocument()` in the slug and thank-you routes, D54), **preview-token minting and the `preview_tokens` rows** (§E.2, SEC-7), `aggregateRating` removal (§C.8), **the landing chunk re-measured and recorded** (header freeze rule; `budgets.json.landing` through the maintainer, `landing.sha256` written) | C0a; T1's settings API (stubs until merged). No dependency on T2 (rev 3, ENGC-27) |
| **T4 SCOPE** | `src/lib/admin-data/**` (except `action.ts`), `src/lib/orders/{admin.ts, conversions.ts, conversions-core.ts, index.ts, selftest.ts}`, `src/lib/editor/**` (incl. `buildChecklist(doc, ctx: LandingCheckContext)`, LAN Q15, with the store facts the LP-02 / LP-21 rules need and the publish dialog rendering `GateItem[]`; `recordSlugMove(scope, pageId, oldSlug)` called by the slug action at `pages.server.ts:418-441`, LAN Q22; the `recordFacts(scope, pageId, facts)` call from the create-from-directions path, ENGP-8), `src/lib/export/**`, `src/lib/media/**` (except `store.ts`; `process.ts`, `assets.ts`, `upload-slots.ts` pass to P8 at the R1.0 integration, ENGC-32), `src/lib/pixels/**`, `src/lib/sheets/**`, `src/app/app/[store]/**` (except `team/**`), `src/app/api/app/**`, `src/app/api/cron/tick/route.ts` (per-store loop, minimal), `src/app/admin/(panel)/**`, `src/app/admin/(editor)/**`, `src/app/admin/preview/**`, `src/app/api/admin/{media,export,sheets}/**` (moved away), `src/components/**` (except `admin/settings/{team-panel,security-panel}.tsx`), `scripts/qa/{tenancy-check.ts, action-replay.ts, pixels-publish-check.ts, conversions-check.ts}` (`tenancy-check.ts` imports `scripts/qa/tenancy-cases/*.ts`, DES-R13, and derives the route list from the file tree, SEC-9), `src/lib/media/selftest*.ts` | §E.3 over the ~225 query sites with `WriteScope` on every write repository (D71); the dashboard move to `/app/<handle>` (§I.1) with `appHref`/`apiHref` everywhere; per-store Sheets (SHT-*), pixels and CAPI secrets (PIX-*), exports (EXP-*), media ids and quotas on the DB backend (MED-*), generate (GEN-01…04), builder (LND-17…30), store-keyed client storage, `listPagesForConsole(scope)` with `name` / `seoTitle` (PLA Q.11, SEC-18); `test:tenancy` (running from week one against C0a's seam), `qa:action-replay` | C0a; T2's hardened seam (C0a's minimal one until merged); T1's settings API |

Rules inside R1.0: a track that needs a change in another track's file writes a note in
`docs/saas/ccr/r1.0-<track>-<n>.md` and the owner applies it. `src/lib/db/schema.ts` and `drizzle/**` stay with the
maintainer (fixes found by T1 go through the maintainer the same day). Files no track lists (for example
`src/lib/orders/{contract,validate,versions,text,risk}.ts`, `src/lib/page/**`, the rest of `src/landing/runtime/**`) are
**read-only** in R1.0. `adminAction` (`src/lib/admin-data/action.ts`) and `adminGuard` (`src/lib/orders/http.ts`)
stay until T4 has moved their last callers; the maintainer deletes them at integration, so `main` typechecks after
every merge.

**Merge order**: C0a → (T1, T2, T3, T4 in parallel; C0b alongside) → merges T1 → T2 → C0b → T3 → T4 → integration by
the maintainer: delete `adminAction`/`adminGuard`, the deprecated `rateLimit` overload and the last stubs, add
`test:tenancy-lint` to `npm test` and `gate:offline` to `prebuild` (SEC-10), hand `src/lib/media/{process,assets,upload-slots}.ts`
to P8, record the re-measured landing chunk, run `npm run gate`, fix loop.

**R1.0 exit criteria**: (1) `npm run gate` green, tenancy lint at 0 violations, `prebuild` running `gate:offline`;
(2) the two-store attack suite green for every role, impersonation included (masked canaries); (3) `test:migrate`
green on empty and legacy DBs, twice and interrupted; (4) the landing chunk at its recorded budget with tolerance 0 and
its sha256 pinned (24,200 B gz, or the re-freeze recorded in §P) and every frozen contract unchanged (PageDoc v2,
runtime config v2, payload v2, PHP export: `test:money`, `test:offers`, `test:php` green); (5) on XAMPP: owner creates
store #1, publishes a landing page at `/s/<h>/<slug>`, takes an order (a test order too, D54), sees it in
`/app/<h>/orders` and Sheets; a second user signs up with an invite code, gets a pending store, cannot publish, cannot
see store #1; (6) upgrade dry run on a production dump: 0 problems; deployed to the Store Gen site through the gated
archive script and smoke-tested (§H.10, incl. the `DATA_DIR` persistence probe across two deploys).

### K.2 R1 product phase (up to 8 parallel tracks)

**Step P0 (maintainer, ~3-4 days; rev 3, ENGC-9 re-estimated: ~40 tables and ~60 typed stubs are not 1.5 days):**
the requests are decided (§Q); write `drizzle/0005_r1.sql` and the §D.5 tables (incl. the rev 2 and rev 3 tables and
column refinements) into `schema.ts`, the R1 settings key schemas (§D.10 incl. `onboarding`, `landing`, `accounting`
lite, `platform_ai_secret`, `platform_design`, the rev 3 fields `checkout.calendar.confirmationLeadDays`,
`checkout.addressMode`, `ops.windowOverrides` / `rescue` / `agentLabels` / `carrierCsv`, `accounting.myCarrier` /
`adAccounts` / `adRates`, and the removal of `store.confirmation.hours` and `policies.contact.hours`; rev 4: the ISO
`days` container and `ops.callingWindow.savedAt`, `brand.genes` with G1 / G9), register the
extension files below (every `src/lib/{health/rules,pulse/contributors,notify/kinds,flags/defs,jobs/tracks,orders/hooks,
render/prepublish,admin-data/search}/<track>.ts`, `src/components/admin/shell/{nav,commands}/<track>.ts`,
`src/lib/i18n/admin/<locale>/<track>.ts`, `scripts/qa/tenancy-cases/<track>.ts`, rev 2.1 `scripts/qa/wow-demo/steps/<track>.ts`
and rev 3 `scripts/qa/render-cases/<track>.ts`, each created empty and imported by its registry so no track ever edits a
registry), run `test:ownership` over the rows below (ENGC-8), and freeze the cross-track APIs as typed stubs:
- operations (P4): `transitionOrder` / `applyExternalStatus` (`src/lib/orders/transition.ts`), `projectStatus` /
  `legacyToWanted` (`state.ts`), **`cityKey(value): CityKey | null` / `normalizeCity` (`address.ts`; pure and
  isomorphic, no server import; rev 4, CRIT1: the server converts once, every browser zone table is P3's value-keyed
  `ZoneTable`, so a chunk *may* bundle `cityKey` and none is required to, D68)**, `maskPhone` / `maskPhonesIn`
  (`masking.ts`), `opsPulse` / `releaseAllLeases` (`queue.ts`),
  `convertLeadToOrder` (`manual.ts`; dispatches on `leads.sel.v` from R2), `appendOrderEvent(scope, orderId, {
  actorKind, type, meta })` (`events.ts`), `createManualOrder(ctx, input & { source?: "manual" | "whatsapp"; fromLead?:
  { leadId } })` (the v2 path; it inserts through `createOrderRow`, D72), **`callingWindowFor(scope): Promise<EffectiveWindow>`
  (`src/lib/callcenter/window.server.ts`; never `null`: the stub answers `DEFAULT_WINDOW` in the store time zone with
  `configured: false`) with the pure, isomorphic, JSON-safe exports of `window.ts`: the types `EffectiveWindow`
  (`days: Record<IsoWeekday, Range[]>`, `configured`), `CallingWindow` (alias), `Range`, `IsoWeekday`, and `isCallable`
  / `nextCallableAt` / `hoursText` / `rangesForDay` / `shopperPromiseAllowed` (D73; `assist-ty` and the R2 store
  checkout bundle `nextCallableAt` by source import); `DEFAULT_WINDOW` in `defaults.ts`; the shared fixture
  `window.fixtures.ts` (rev 4, CRIT3: data, written by P4 and read by P3 and S1 after P4 merges; the P0 stub of the
  file carries the `DEFAULT_WINDOW` cases only)**, the console reads `orderKpis`, `listOrdersForConsole`, `getOrderForConsole`
  (rev 4, PLA Q4.10: `ConsoleOrderRow` carries `pageId: string | null`, `carrierLabel`, `trackingRef`,
  `carrierExportedAt`, and from the R2 contract step `lines?` for payload v3), `recordPlatformReveal`, `orderRiskMix`,
  `searchOrders`, `queueCounts` (OPE Q.8, LAN Q17, PLA Q.11); **rev 2.1 (OPE-§27.6, OD43):** the
  deterministic aggregates the Today brief (P2) and the Campaign Kit by-angle table (P3) read,
  `opsAggregates(scope, q: { from: ISODate; to: ISODate; dims: AggDim[]; compareWith?: "previous" }): Promise<{ cells:
  Record<AggDim, AggCell[]>; suppressed: number; computedAt: string }>` (cells under 5 orders suppressed) and
  `attemptStats(scope, q?: { days?: 90 }): Promise<{ weekday: number; hour: number; attempts: number; contacted: number }[]>`
  (`src/lib/callcenter/aggregates.ts`; stubs answer empty cells);
- integrations (P5): `renderTemplate` / `orderTemplateValues` (`src/lib/integrations/templates.ts`), `scheduleSheetPush`
  (`src/lib/sheets/push.ts`), `integrationHealth(scope)`, `sheetsBacklog(scope)`;
- landing (P3): **`zoneLineFor(scope, cityKey: CityKey | null, at?, opts?: { stage })`** and the pure
  `zoneForCity(zones, key: CityKey | null)` (both map `null` / unknown to the `*` zone, D68; rev 3 OPS-1, OPS-12),
  `zonesForCheckout(scope): Promise<ZoneTable>` (**the one producer of every browser zone table**: `lp-assist.dz`,
  `#sg-config.checkout.zones`, the R2 `landing-v3` config; `city` keyed by the posted `City.value`, built on the server
  from the slugs by the pure `buildZoneTable(zones, cal, cities)` of `src/lib/delivery/table.ts`, which the parity
  fixture calls directly; rev 4, CRIT1), **`zoneFeesFor(scope, keys: readonly CityKey[]): Promise<Record<CityKey, number
  | null>>`** (rev 4: the slug-keyed fees for server joins, P1's `zones.feeMismatchTop5` and the checklist; never the
  browser table), the ETA trio of `src/lib/delivery/eta.ts`
  (pure, bundled into `assist`): `etaWindow(cal, zone, now): EtaWindow | null` (`cal.leadDays` from
  `checkout.calendar.confirmationLeadDays`), `etaText(w, zone, locale, dateLocale,
  now): string` and **(rev 2.1, LAN N2)** `etaWindowText(zone, now, cal, locale, dateLocale?): { from: Date; to: Date;
  text: string } | null` (storefront's STO-§15.8 shape, so S1 writes no second ETA implementation), `signedTrackPath(store,
  orderId)`, `waConfirmText(store, order, locale)`, `markLeadConverted` (`leads.ts`), `landingModeSwitchPlan(scope)`,
  `mintTestLink(scope, pageId)`, `compileKit(input)`, **`recordFacts(scope, pageId, facts: CopyFacts)`**
  (`src/lib/landing/honesty/facts.server.ts`; rev 3 ENGP-8: the create-from-directions path calls it so the wizard's
  merchant facts are the gate's facts), and **(rev 2.1, LAN-§3.7)** `codInvariants(doc: PageDoc, inputs:
  CodInvariantInputs): { formScreen: number; ctaTargetsForm: boolean; offerBeforeCta: boolean; deliveryLine: "present" |
  "absent" | "n/a"; whatsappConfigured: boolean; urgencyReal: boolean; foldOk: boolean }` (`src/lib/landing/cod-invariants.ts`,
  pure, isomorphic: the one implementation the design digest `RenderDigest.cod` (P6), the checklist and the honesty gate
  import);
- platform ops (P8): `enqueue` / `registerOutboxHandler` / `enqueueRenders`, the PLA Q.25 health and export APIs;
- platform (P1): `notify` (the PLA-§18.1 signature; T2's R1.0 body becomes P1's), `markHealthDirty`,
  `getStoreHealth(scope): Promise<StoreHealthView | null>` (rev 4, PLA Q4.4; `staleAfterMin` additive),
  `snoozeHealthIssue`, **(rev 2.1)** `requestHealthRecompute(ctx: StoreCtx): Promise<{ queuedAt: string }>` (§I.7; P2's
  "Recompute now" button calls it), **(rev 3)** `maskCustomerFields(row)` / `maskIfImpersonation(scope, row)` and the
  `Masked` type (`src/lib/platform/mask.ts`, D70: identity for every scope kind but `impersonation`; P4's read
  repositories call it), `checkBrandTerms(kind, value): Promise<"ok" | "near" | "exact">` (`brand-check.ts`, D76; P2's
  `saveGeneralAction`, P3's policies contact block and P6's brand kit call it), `recordAbuseReport(input)`
  (`abuse-report.ts`, used only by P1's own `/report` page);
- shell (P2): `renameHandle` (honouring the `freeRename` grant, ENGC-30), the pulse contributors registry;
- maintainer (rev 4, CRIT15, PLA Q4.1 / Q4.2, DES N1, LAN N4): `reportUrl(store, pagePath?)` and the ADMIN_HOST-aware
  `consoleHref(path)` in `src/lib/urls/index.ts`; `PageLinks.report?: string` (`src/landing/types.ts`), its value from
  `reportUrl` for live, test and preview renders and `undefined` in every export (`src/landing/context.ts`), the UiKey
  `footer.report` with platform's `shell.report.link` strings (`src/landing/i18n.ts`) and the Shell's `<p
  class="lp-report">` fallback row (`src/landing/document.tsx`): additive lines in read-only files, applied once at P0 so
  P3 and P6 build against them;
- ai (P7): `runAi`, `queueAi`, `registerBatchResultHandler`, `aiPolicyFor`, the `AiPolicy` / `AiOutcome` types,
  `aiStoreSummary(ctx: PlatformCtx, storeId)`, `aiHealth()`, `aiUsageForStore(scope, month)` (rev 4, PLA Q4.11 / AI
  R38: returns `{ creditsUsed, creditsLimit, costMicros }`, `creditsLimit` = the pending cap while the store is
  `pending`, read by the console queue chip), `linkAiRuns`,
  `recordPublishFeedback`, `enqueueAiJob` (AI R13, PLA Q.11), **(rev 2.1, AI R26)** `aiJobsForPulse(scope, viewer: {
  userId }, since: Date): Promise<{ running: number; done: string[] }>` (`src/lib/ai/jobs/pulse.ts`; the producer of
  `StorePulse.jobs`, §I.4; stub `{ running: 0, done: [] }`);
- design (P6): `GENE_VOCAB`, `sampleGenome(input, opts: SampleOpts = { hints?, pins?, priors? })` (rev 3, QUAL-10: one
  pinned bold gene per direction, set as the only value when it passes the hard rules, the photo facts and the locks,
  else dropped into `genome.hints.dropped` with `why: "pin"`; **rev 4 (DES N9 over AI R43):** the pin is
  `SampleOpts.pins?: Partial<Record<BoldGene, string>>` (≤ 1 key), a sibling of `hints`, and `GeneHints` carries no pins;
  ai's `DirectionBrief.pin` maps to it), `clicheScore(text, locale)`, `checkHeadlineNovelty(scope, niche, texts)` (rev 4:
  per line `{ verdict, band: "low" | "mid" | "high" | null }` over ≥ 10 owners, never a share number),
  `genomeOf(doc)` (R2), `genomeDistance` / `checkNovelty` (≤ 16 candidates per call; the Director budget is 12 per pass,
  QUAL-25), `designHealth(scope)` (AI R14, §I.7), **the exported Director vocabulary** `GenomeCard` (distance as bands
  only, DS7), `Band`, `RepairOp`, `AI_REPAIR_OPS` and the task names (`design.plan`, `design.critique`) from
  `src/lib/design/index.ts` (rev 3, QUAL-25: ai imports them and `test:ai` asserts the prompt vocabulary equals the
  constants), and **(rev 2.1, DES-R19)** the two measurement modules the core's budget gate calls:
  `estimateHeights(doc: PageDoc, opts: { look: ThemeLook | null; locale: Locale; features: (type: string, variant: string,
  data: unknown) => VariantFeaturesResolved }): HeightReport` (`src/lib/design/heights.ts`; the DES-§5.3 signature wins over
  the shorter `estimateHeights(doc, look, locale)` of DES-§4.9's module table; **honours `features.h = { base, fixed:
  true }`**, rev 3 ENGP-5: a fixed entry skips the density, spacing and G21 multipliers, so the order form is 1.1 screens
  in its default state) and `variantFeatures(type, variant, data):
  VariantFeaturesResolved` (`src/lib/design/features.ts`, re-exported from `src/lib/design/index.ts`), with `HeightReport`
  (`{ v: 1; viewport: 390; sections: { id; type; variant; top; height }[]; total; screens; formTop: number | null;
  formHeight: number | null; fold: FoldReport; inFlow: number }`), `FoldReport` (`{ family; ok; items: Partial<Record<FoldItem,
  number>> /* top px */; limit: 844 }` with `FoldItem = "image" | "price" | "cta" | "cod"` in R1, **widened additively** to
  `| "name" | "identity" | "collections"` at the R2 contract step for store kinds, rev 3 ENGP-1) and `VariantFeaturesResolved`
  (DES-§8.4; rev 4, DES N7: it picks `h` and **requires `family`**, the layout family `orderAct2` / H35 / V38 read;
  `VariantFeatures.h` is `number | { base; fixed: true; per? }`; `HeightReport.stub?: true`) frozen at P0 in
  **`src/lib/design/types.frozen.ts`** (rev 4, CRIT9: a maintainer-owned file of its own, so one file never has two
  owners; P6's `src/lib/design/types.ts` re-exports the three shapes and owns everything else); at the R2 contract step
  the maintainer widens the frozen shapes **and `FoldItem`** in `types.frozen.ts` and, through the contract step's CCR on
  P6's finished files (`src/lib/design/gates/**`, `derive.ts`, `heights.ts`; rev 5, CRIT2-2), `GateInput.doc`,
  `genomeOf(doc)` and `estimateHeights(doc, …)` to `PageDoc | StorePageDoc` (one-line changes, DES-R27), and design's `gateInputFor(doc, ctx)` adapter (DES-§8.13) becomes the one entry for both document types;
  **rev 4 (CRIT10, UX-39):** `estimateAlpha(bitmap): { hasCutout: "estimated"; bbox } | null` (`src/lib/design/photo-facts.ts`,
  browser-only; the stub answers `null`), which P2's onboarding photos step calls before P6 merges.
  **Rev 5 (CRIT2-6): the rest of what the earlier-merging P2 (second) and P7 (seventh) import from P6 (eighth)**, with
  design's signatures: **`RevealFolds`** (`src/components/generate/reveal/RevealFolds.tsx`, client component; props
  `{ directions: readonly [RevealDirection, RevealDirection, RevealDirection]; state: "analysing" | "revealed" | "error";
  dnaSlot?: (directionId: string) => ReactNode /* P7's <DirectorWhy directionId>, inside each DNA card / bottom sheet */;
  actionSlot?: ReactNode /* P7's <DirectorPassControl>, the bottom action row beside "Use this design" */; onUse(directionId:
  string): void; onRetry?(): void }` with `RevealDirection = { id: string; doc: PageDoc; card: GenomeCard; label: string }`;
  the stub renders the three docs' folds statically with both slots, DES-§14.3); **`RenderDigest`** and
  `renderDigest(doc, theme, genome, report, cod?: CodDigestInputs): RenderDigest` (`src/lib/design/digest.ts`, DES-§8.9;
  **P0 review G1:** the digest carries `cod: CodInvariants | null`, P3's `codInvariants` result over the report's heights
  and the store facts of the optional fifth argument (`CodDigestInputs` = `CodInvariantInputs` without `heights`), `null`
  without them; the stub answers a digest with empty counts, `gates: { hard: [], soft: [], slop: 0, q: 0 }` and
  `cod: null`); **`NicheShares`** and
  `nicheShares(niche): NicheShares` (`src/lib/design/novelty.server.ts`, DES-§7.4; the stub answers `n: 0` and empty maps,
  `seq4: []`, `tells: []`, i.e. "k < 10"); **`checkHeadlinesAction`** (the `storeAction` wrapper of
  `checkHeadlineNovelty(scope, niche, texts)`, DES-§9.8: `(niche: string, texts: readonly string[] /* ≤ 60 */) =>
  Promise<ActionResult<{ verdict: "ok" | "close"; band: "low" | "mid" | "high" | null }[]>>`; the stub answers
  `ok` / `null` per line); **`validateHints(raw): { hints: GeneHints; pins: SampleOpts["pins"]; intake: HintIntake }`**
  (`src/lib/design/hints.ts`, DES-§4.6, with the `GeneHints` and `HintIntake` types; the stub accepts nothing and
  drops every entry with `why: "vocab"`). Each stub is P6's file at P0 (P6 replaces the body, never the signature).
  **Stub rule:** until P6 merges, the stubs return a report flagged `stub: true` (`fold.ok = true`, every section 600 px,
  `formTop = null`); `prepublish/budget.ts` turns C2 / C3 / F1 into **notes** while `stub` is true and `test:prepublish`
  enables their hard fixtures at the P6 merge. Two locks keep the D52 hard gates from shipping disabled (rev 3,
  ENGC-21): no production deploy happens between P0 and the R1 integration (§H.10), **and** `prepublish/budget.ts` throws
  at module load when `NODE_ENV === "production"` and the report is a stub, so `npm run build` is red until P6 merges.

**Maintainer build note (P0, 2026-10-27).** What the P0 step built (commits `0042571` lead packages, `df46028` A,
`78559ef` B, `e709178` C, `0abe4da` D, and step E), and the decisions the step took where this section or a part left a
choice open. The tracks build against the result; a change goes through a CCR.
1. **Packages.** `@anthropic-ai/sdk` pinned at 0.133.0 for P7 (AI R1). `npm audit fix` took 12 advisories to 4; the 4
   left are moderate and dev-only (drizzle-kit's `@esbuild-kit/esbuild` chain and the esbuild dev-server advisory, whose
   only npm fix is a breaking drizzle-kit downgrade) and are accepted. No track runs `npm install`.
2. **Scripts.** Every R1 script §J names is in `package.json` from P0 (46 at step C, pointing at the files the owning
   tracks write), so tracks never touch it. A script whose file does not exist yet is in no aggregate: the maintainer
   adds each track's suites to `npm test` / `test:db` / `test:e2e` / `gate` at that track's merge, inside the
   `test-budget.json` shares. P0 added `test:settings`, `test:registries` and `test:prepublish` to `npm test`.
   `gate:r1` = `gate` + `qa:wow-demo` + `qa:publish-gates` + `qa:design-corpus` + `test:ai-eval`, then
   `qa:ai-eval-live` only when `ANTHROPIC_API_KEY` is set; `qa:wow-demo` (and so `gate:r1`) fails by design until the R1
   integration writes its browser runner.
3. **Stubs.** Each typed stub compiles and either answers the documented safe default (`DEFAULT_WINDOW`, empty cells,
   `{ running: 0, done: [] }`, height reports flagged `stub: true`, identity masks outside impersonation, `"ok"` brand
   checks, `null` = health not computed yet, "Cloud AI off") or throws `not implemented: P<n> <name>`; a stub never
   invents data (a measurement, a genome, a distance, a queue id). A stub in an existing file keeps today's callers
   working. Each new stub file names its owning track and spec section in its header. Every frozen signature and shape
   is asserted in **`src/lib/contracts/r1-p0.ts`** (maintainer, types only): a rename, removal or re-type breaks `tsc`.
4. **Extension files.** Created with typed empty contents and imported by their registries (95 at step C, the outbox
   handler files `jobs/handlers/{capi,telegram}.ts` at step D; `test:registries` proves every file on disk is imported);
   only files a row above names were created. P2's `commands/shell.ts` exists (covered by P2's `shell/**` glob; the
   "Recompute health" action needs it); P3 has no flags file (LAN-§23.10). Order hooks run ops → landing →
   integrations (OPE-§3.6). The tenancy harness keeps lazy loading with an explicit `TENANCY_CASE_FILES` list; an empty
   case file is "not applicable".
5. **STUB-BUILD LOCK** (resolves "red until P6 merges" against "each merge: `npm run gate` green", ENGC-21). Build time:
   `prebuild` starts with `scripts/qa/stub-lock.ts`, which exits 1 while design's height model is the stub
   (`heightModelIsStub()` in `src/lib/render/prepublish/budget-limits.ts`: `HEIGHT_MODEL_VERSION === 0`, and every
   report then carries `stub: true`) unless `SG_STUB_BUILD_OK=1`. Run time: `src/lib/render/prepublish/budget.ts` throws
   at module load under `NODE_ENV === "production"` on the same condition. The lead's merge gates before P6 run with
   `SG_STUB_BUILD_OK=1`, so build and e2e keep running. `scripts/qa/gate-ok.ts` writes `"stubBuild": true` into
   `qa/.gate-ok` whenever the model is the stub (it asks the module, never the variable) and `scripts/deploy/archive.mjs`
   refuses it (`scripts/deploy/gate-file.mjs`). A stub build is never archived or deployed, and Hostinger's build is red
   because it never sets the variable: both locks of §H.10 hold. **The whole budget gate is advisory before P6:**
   besides C2 / C3 / F1, the rows F5, R1, R4, R5, K2 and I1 are measured and classified but published as notes
   (`vars.stub = 1`) while the stub is in place, because today's engine output is the baseline they were written
   against (the argan fixture: 171 KB gz, 20 primary order buttons, 315 reveal nodes, 6 colour bands) and the plans that
   bring a page under them are P6's; enforcing them at P0 would refuse every publish and turn every earlier merge gate
   red. Every row is hard from the P6 merge on (`test:prepublish` then enables the calibration fixtures).
6. **Schema (step A, `drizzle/0005_r1.sql`, 38 tables).** Where the core and a part disagree, the part's cut list wins
   (`ai_jobs.kind` an enum of the four job kinds plus `task`, `class`, `model`, `effort`, `transport`,
   `reserved_credits`; the full AI-§M.1 lists of `ai_runs`, `ai_cache`, `ai_memory`, `prompt_versions`; DES-§2.1
   `design_genomes`; `headline_shingles.kind` and `hs_niche_owner_idx`; `delivery_zones.note`, `updated_by`,
   `created_at`; the operations refinements; `pc_sku_idx` on (store, sku, variant_key, effective_from);
   `carrier_rates.city_key` NOT NULL). `agent_stats_daily`'s R2 counters exist from 0005 (default 0). Open defaults:
   `carrier_rates.active` true and fees NULL-able, `ad_spend_daily.source` `'manual'`. The four-eyes rule is the CHECK
   `preq_four_eyes_ck`. Every `store_id`, optional ones included, has an `fk_<table>_store` RESTRICT FK. The JSON
   column shapes are exported from `schema.ts` for the owning tracks to re-export; `HealthMetrics` / `Milestone` live in
   `src/lib/health/types.ts`; open shapes are typed loosely. The batched-ALTER guard counts columns with `column_name IN
   (...)`; `orders.source` changes only while it is exactly the R1.0 enum, `leads.phone` only while NOT NULL. The §D.3
   row `job_runs`, `cron_cursors` was split (`cron_cursors` is P: no `store_id`).
7. **Settings (step B).** A stored `store.confirmation.hours` / `policies.contact.hours` is dropped on read, not moved
   (D73, no build ever wrote them). `platform_ai.prices` defaults to empty (no invented price; P7 adds rows once the
   probe confirms them). Task ids in `routes` / `autoPrefersCloud` are checked by format until P7 narrows them to
   `src/lib/ai/tasks.ts`. Model info keeps the API's field names. `src/lib/settings/selftest.ts` (`test:settings`)
   checks every §D.10 key.
8. **Cross-track stubs, part 1 (step D).** The five R1 statuses (`refused`, `duplicate`, `unreachable`, `in_transit`,
   `lost`) are appended to `src/lib/orders/contract.ts` with the OPE-§3.3 labels and colours. Every write stub takes a
   `WriteScope` (D71, over the parts' older `StoreScope`), order hooks included; `createManualOrder` /
   `convertLeadToOrder` take a `WriteCtx`. Implemented for real where the spec gives the code: `projectStatus`, the
   `cityKey` slug rule, `zoneForCity`, `buildZoneTable`, `etaWindow` and its helpers, the window helpers
   (`nextCallableAt` throws a `RangeError` for a window with no range in 400 days). Left as stubs where the parts
   disagree: `hoursText`, `etaText`, `etaWindowText`, `codInvariants` (P0 proposed `CodInvariantInputs`; only the
   result is frozen), `renderTemplate`, `legacyToWanted`, `signedTrackPath`. Operations' console-read signatures win
   over PLA Q.11; open shapes were filled and frozen in the contract file.
9. **Cross-track stubs, part 2 (step E).** P1: `notify` keeps T2's working body; the PLA-§18.1 read API
   (`listNotifications`, `unreadCount`, `markRead`) works over the R1.0 rows from step G (P0 review G2: P2 merges before
   P1 and its pulse needs `unread` on every poll; step E had frozen throwing stubs), with the PLA-§18.1 read rules, the
   `notify-unread` cache (5 s) and a count that stops at 100; P1 refines the bodies; `getStoreHealth` → `null`, `requestHealthRecompute` marks dirty and answers `queuedAt`,
   `snoozeHealthIssue` throws; `HealthInputs` is frozen with the PLA-§6.3.1 fields, every source field `| null` (a
   failing source leaves it null), and `StoreHealthView` and the rev 3 flag codes (`brand_term_live`,
   `brand_near_live`, `abuse_reports_new`) are in the maintainer's `src/lib/health/types.ts`; `mask.ts` and
   `brand-check.ts` needed nothing; `recordAbuseReport` throws. P2: `renameHandle` (R1.0, honours `freeRename`) and the
   pulse types needed nothing. P7: `src/lib/ai/{tasks,policy,provider/types,router/server,jobs/enqueue,jobs/pulse,
   summary.server,feedback.server}.ts` answer the documented "Cloud AI off" state (`aiPolicyFor`: cloud unavailable with
   `platform_off`, `state` under impersonation, no live task; `runAi` and `enqueueAiJob`: the typed failure
   `disabled`; `aiUsageForStore`: nothing used, `creditsLimit: null`; `linkAiRuns` / `recordPublishFeedback`:
   no-ops), `registerBatchResultHandler` works, `queueAi`, `aiStoreSummary` and `aiHealth` throw (P8's
   `PlatformHealth.ai` is `AiHealth | null`); `TaskIO` types `injection.screen` and leaves the other tasks `unknown`
   until P7's schemas land. P6: `src/lib/design/**` (genome types, `GENE_VOCAB` with the enumerated genes the gene table
   and the frozen look vocabulary fix, P6 completing G4, ranges and structs; `validateHints` drops every entry with
   `why: "vocab"`; `clicheScore` no hit; `checkNovelty` the documented "novelty off" bands; `nicheShares` "k < 10";
   `checkHeadlineNovelty` / `checkHeadlinesAction` `ok` with no band (`pages.write`, 60 / 10 min); `designHealth` empty;
   `renderDigest` flagged `stub: true`; `variantFeatures` the documented defaults with `family: "grid"` and the two
   fixed layers; `estimateAlpha` → `null`; `sampleGenome`, `genomeOf`, `genomeDistance` throw), the Director vocabulary
   (`GenomeCard`, `Band`, `RepairOp`, `AI_REPAIR_OPS`, `DIRECTOR_TASKS`) and the `RevealFolds` stub (the three docs'
   first sections through the admin thumbnail, both slots). `src/lib/design/types.frozen.ts` is the maintainer's.
   `PrePublishCtx.scope` is a `WriteScope` (D71: a publish, a re-render and an export are writes).
10. **Report link (rev 4, CRIT15).** `reportUrl` / `consoleHref` existed since R1.0. `PageLinks.report?: string`;
    `storePageLinks(base, slug, report?)`; the server's `storeReportUrl(rc, path)` sets it for live, test and preview
    renders with each document's own path (the thank-you and legal pages get theirs, P3 draws them); exports never set
    it. The Shell draws `<p class="lp-report">` after the last in-flow section, before the floating layers, whenever
    the footer does not draw the link: P6 flips `FOOTER_RENDERS_REPORT` (`src/landing/sections/footer/report.ts`) in
    the change that makes `legalLinks(ctx)` draw it, and from then on the row appears only without a visible footer, so
    every live document rendered from P0 on carries the link exactly once. Pages published under R1.0 are served from
    their stored HTML and get the link from the integration deploy's `runtime` re-render (§H.10, P0 review G9). UiKey `footer.report` carries platform's `shell.report.link`
    wording (ar الإبلاغ عن هذا المتجر · fr Signaler cette boutique · en Report this store). Proof at P0: every export
    file (connected, PHP and WhatsApp bundles of every fixture in ar / fr / en) is byte-identical to before; live
    landing documents change by the one row; thank-you and legal documents are unchanged; `test:render` asserts one link
    per live landing (footer shown or hidden) and none in exports.
11. **Rows and ownership (step C onward).** §K.3 claims the maintainer files no row named: `src/lib/settings/selftest.ts`,
    `src/lib/admin-data/search/registry.ts`, `scripts/qa/{registries-check,tenancy-check}.ts`, `docs/saas/ccr/README.md`,
    `src/lib/contracts/r1-p0.ts`, `scripts/qa/stub-lock.ts`, `scripts/deploy/gate-file.mjs`, `docs/saas/ccr/p0-report.md`.
    `test:ownership --phase R1` finds no file with two owners and none without one.
12. **Verification (step F, `docs/saas/ccr/p0-report.md`).** The whole P0 tree passed tsc, lint, `npm test`, `test:slow`,
    every `test:db` suite on `cod_test_p0_*` databases, the build and `test:e2e` with `SG_STUB_BUILD_OK=1`, `qa:secrets`,
    and an upgrade dry run of a production-equivalent database (pre-tenancy data → R1.0 deploy → R1.0 writes, then
    0005 with the app's migrator): 0 problems before and after, every R1.0 row unchanged. Two fixes: (a) **track
    action cases.** `test:tenancy` requires an attack case for every store server action, and the cases lived only in
    the maintainer's `ACTION_CASES`, so every track that adds an action would have had to edit the harness (DES-R13
    intends the opposite). A case file may now also export `actions: TrackActionCase[]` (an `ActionCase` without its
    derived `id`; type imports only), merged into `ACTION_CASES` at `setup()` for both `test:tenancy` and
    `qa:action-replay`; P6's stub `checkHeadlinesAction` has its case in `tenancy-cases/design.ts`. (b) the throwaway
    database names of `test:migrate`'s 0004 cases are `cod_test_p0_t1_*` and `qa:r1-exit` accepts `cod_test_p0_*`.
13. **Deferred, with the reason.** Narrowing `MessageKey` and `NotificationKind` to strict unions (C0a's note): the
    R1.0 code calls keys and kinds that no catalog or kinds file declares yet, so narrowing at P0 would break today's
    callers; each track declares its keys and kinds at its merge and the maintainer narrows at the R1 integration.
    `checkBrandTerms("wordmark", …)` (DES-§13, S2): an R2 field, added to `BrandField` at the R2 contract step.
14. **Review fixes (step G, `docs/saas/ccr/p0-report.md` "Review and fixes").** (G1) `RenderDigest.cod` exists as this
    section and LAN-§3.7 say (`cod: CodInvariants | null`, the optional fifth argument of `renderDigest`); the core
    wins over DES-§8.9 / AI R46, which listed the shape without it; R9 of rubric v3 reads `digest.cod` and, while it is
    `null`, only the form position and the fold. (G2) The notification reads work (item 9). **A source that throws
    `not implemented` is "unavailable", never zero:** P2's pulse and Today brief omit the key or the line a throwing
    source would fill (`opsPulse`, `queueCounts`, `aiStoreSummary`, …; a pulse contributor already omits its keys on a
    failure, §I.4), and no track writes a made-up 0 or "no orders yet" in its place. (G3) `aiPolicyFor` takes `mode`
    and the local rung from the store's `store_ai` (the R1.0 on-device AI and background removal keep working before
    P7), the local rung off only under impersonation (AI-§A.4); the cloud stays "off" (`platform_off`). (G4) §M.2's
    measurement paragraph says what item 5 does. (G5) §H.2's lease SQL quotes `cursor`. (G6) `test:migrate` also
    compares table engines and collations, column collations, AUTO_INCREMENT and CHECK expressions, and builds its
    upgrade databases with a `utf8mb4_general_ci` default. (G7) The `npm test` budget table is re-cut from a timed run
    (§J.1, CCR r1.0-c0b-3 items 2 and 3): existing 90 s (88.5 measured), core 55 s (46.1 measured once
    `test:prepublish` runs its ar fixtures and lock child processes only under `--slow`, which `test:slow` adds),
    platform 15, landing 20, operations 15, ai 15, design 25; the R1 ceiling is 240 s (R2 / R3 300 s), each group
    records `measuredSec`, and `test:budget-static` (in `gate`) refuses a share below its measurement. (G8) P1's `nav/console.ts` exports `StaffNavItem[]`, not sidebar
    contributions: the registry hands it out as `STAFF_NAV` / `staffNavFor(platformRole)` for the store switcher
    (PD36) and keeps it out of `NAV_CONTRIBUTIONS`, so no member sees a console item. (G9) The integration deploy
    re-renders every live page (§H.10) so pages published under R1.0 carry the report link.

Then:

| Track | Part spec | Feature ids (rev 2) | Owns |
|---|---|---|---|
| **P1 CONSOLE** | platform.md | PL-01…PL-06, PL-07 (R1 tabs), PL-08…PL-14 (DPA R2), **PL-18 / SF-03 engine and job**, UX-02 (console), UX-03, OS-06, SE-01 (UI), SE-04 (break-glass UI, `platform_requests`), staff invites, **rev 3:** the D69 sandbox ceilings' console side, the D70 masking helpers, the D76 brand guard, `platform:brand_term_live`, the R1 abuse-report slice (PL-20 R1 slice), the account-deletion staff path (SEC-20) | `src/app/admin/**` (except `(auth)/setup/**`, `(console)/ai/**`; deletes `src/app/admin/page.tsx`), `src/app/api/admin/**`, `src/app/(public)/invite/staff/**`, **`src/app/(public)/report/**`** (rev 3, D76), `src/lib/platform/**` (except `seam.ts`, `impersonation.ts`, `health.ts`; includes `notify.ts`, `notify-kinds.ts`, `signup-risk.ts`, `health-score.ts`, `health-snapshot.ts`, `flags.ts`, `data/legal/**`, and rev 3 `mask.ts`, `brand-check.ts`, `abuse-report.ts`), **`src/lib/settings/keys/platform.ts`** (rev 3, ENGC-8: core §D.10 names platform.md as the key's owner), `src/lib/health/{engine,inputs,platform-flags}.ts`, `src/lib/health/rules/platform.ts`, `src/lib/health/selftest.ts` (rev 2.1 precise list; `types.ts` / `registry.ts` stay the maintainer's with the import lines pre-written at P0, §I.7), `src/lib/notify/kinds/platform.ts`, `src/lib/flags/defs/platform.ts`, `src/components/console/**`, nav `console.ts`, i18n `console.ts` + `notify.ts` (platform kinds only, D67), jobs `platform.ts`, `scripts/qa/{platform-check,health-db-check}.ts`, `scripts/qa/tenancy-cases/platform.ts`, `scripts/qa/wow-demo/steps/platform.ts`, `scripts/platform/refresh-disposable.mjs` (manual, never at runtime) |
| **P2 SHELL** | platform.md + design.md (UX parts) | UX-01 (no download on the critical path, D59; the store-mode rule of §A.2), UX-02 (tenant), **UX-05 live address card (R1)**, **SF-06 pulse**, §I.3-I.8 foundation, notification centre UI (PL-13 tenant side), **SF-03 ring and issue list UI**, handle rename, `onboarding` key, the `settings/audit` screen (PLA-§22.10.6), the `/welcome` step that **mounts P6's reveal component** (`src/components/generate/reveal/**` is P6's; P2 owns the step, its timing and the UX-01 acceptance; rev 4, DES N5, UX-20), the account deletion page (`/app/account/danger`, SEC-20) | `src/components/admin/{shell,common,dashboard}/**` (except other tracks' nav/commands files), **`src/app/(public)/**` except `invite/staff/**` (P1), `report/**` (P1) and `kit/**` (P3)** (rev 3, ENGC-8 / ENGP-11), `src/app/app/{page.tsx, actions.ts, account/**, new/**, manifest.webmanifest/**}`, the `metadata` export of `src/app/app/layout.tsx`, `src/app/app/[store]/{layout.tsx, page.tsx, welcome/**, review-actions.ts, health-actions.ts, notifications/**, settings/{general,market,plan,address,security,danger,audit}/**}` (`audit/**` added rev 3, PLA PD75), **`src/app/app/[store]/team/**` except `team/{agents,callcenter}/**` (P4)** (rev 3), `src/app/api/app/[store]/{pulse,search}/**`, `src/lib/pulse/contributors/shell.ts`, `src/components/admin/settings/{team-panel,security-panel,audit-view}.tsx`, `src/app/globals.css`, `scripts/build-admin-css.mjs`, `scripts/build-app-icons.mjs`, `public/icons/**`, `src/lib/admin-theme/**`, `src/lib/i18n/admin/<locale>/{shell,auth,onboarding,team,health,brief}.ts` (rev 2.1, D67: **not** `src/lib/i18n/**`; the base catalogs and `index.ts` are the maintainer's, the other tracks' files are theirs), `scripts/qa/{admin-tokens-check,admin-motion-check,admin-rtl-lint,i18n-coverage}.ts`, `src/lib/tenancy/handles.ts` (rename), `src/lib/admin-data/{dashboard.ts, search.ts}`, `src/lib/settings/keys/onboarding.ts`, `src/lib/health/rules/shell.ts`, `src/lib/pulse/selftest.ts`, `scripts/qa/wow-demo/steps/shell.ts`, **`scripts/qa/e2e/{pulse,admin-perf}.ts`** (`qa:pulse-e2e`, `qa:admin-perf`; rev 4, CRIT19: committed, not under the git-ignored `qa/e2e`; PLA Q.12, PLA-§P.2) |
| **P3 LANDING** | landing.md | wave 1: LP-01…LP-06 (LP-03 incl. **ST-17 ETA as dates on landings**), LP-20, LP-21, LP-22; **wave 2: LP-11, LP-12, LP-18 / SF-01 Campaign Kit, LP-19 / SF-05 test links** (LAN Q33) | `src/lib/editor/{checklist.ts, selftest-checklist.ts}` (`selftest-checklist.ts` rev 4, LAN N6), **`src/app/app/[store]/pages/**` outside `(editor)`** (rev 4, ownership re-check: the pages list and new-page routes follow `src/components/admin/pages/**`, which LAN Q19 moved to P3, so LP-22's vitals and the kit entry need no CCR), `src/lib/delivery/**`, `src/lib/tracking/**`, `src/lib/orders/leads.ts`, `src/landing/thankyou/**`, `src/landing/sections/orderForm/**`, `src/landing/addons/**`, `src/landing/runtime/addons/**` (the add-on chunks `assist`, `assist-ty`, `track`; replaces the single `entry-delivery.ts` of rev 1), `src/landing/legal/**` (from R1 product, LAN Q16), `src/lib/{policies,leads,wa-order,links,campaigns,testing,landing}/**`, `src/lib/render/prepublish/landing.ts` (the honesty gate), `src/lib/orders/hooks/landing.ts`, `src/lib/settings/keys/{policies,checkout,landing}.ts`, `src/lib/health/rules/landing.ts`, `src/lib/pulse/contributors/landing.ts`, `src/lib/notify/kinds/landing.ts`, `src/lib/admin-data/search/landing.ts`, `src/components/admin/shell/commands/landing.ts`, `src/app/s/[store]/{track,go}/**`, `src/app/api/public/{track,wa}/**`, `src/app/(public)/kit/**`, `src/app/app/[store]/{leads/**, links/**, campaigns/**, settings/{checkout,delivery,policies}/**}`, `src/app/api/app/[store]/leads/**`, `src/components/admin/{leads,pages,delivery,policies,links,campaigns,landing}/**` (`pages/**` moves to P3, LAN Q19), nav/i18n/jobs `landing.ts`, `scripts/qa/{tracking-check,leads-check,kit-check}.ts`, `src/lib/testing/selftest.ts`, `src/lib/links/selftest.ts`, `scripts/qa/tenancy-cases/landing.ts`; **rev 2.1 (LAN-§26.1):** `src/lib/render/prepublish/landing.fixtures.ts`, `src/lib/landing/honesty/selftest.ts`, `src/lib/landing/cod-invariants.selftest.ts`, `scripts/qa/wow-demo/steps/landing.ts` (replaces the `qa/e2e/steps/landing-*.mjs` names of LAN-§3.8: demo steps are committed); **rev 3:** `scripts/qa/render-cases/landing.ts` (ENGP-12), `scripts/qa/delivery-check.ts` (`test:delivery`, D68; the fixture file is P4's), and the LAN-§26.1 rev 3 files inside owned folders (`src/lib/links/target.ts`, `src/lib/policies/claims*.ts`, `src/lib/landing/honesty/facts.server.ts`, `src/lib/delivery/lead.server.ts`, `src/components/admin/landing/{proof-attest,fact-attest}.tsx`); **rev 4** files inside owned folders: `src/lib/leads/read.ts` (the lead read repository through `maskIfImpersonation`, D70, LAN N5), `src/lib/landing/hours.ts` (`windowIsEmpty`, `weekHoursText`), `src/lib/delivery/table.ts` (`buildZoneTable`, D68). P3 imports P4's `CallingWindowEditor`, `window.ts` and `cityKey` (server-side only: no add-on imports `address.ts`, D68) and never edits them |
| **P4 CALL CENTER** | operations.md | OP-01…OP-05, OP-06 (flag + link + separate; **merge R2**), OP-07…OP-14, **OP-17 keyboard-first (R1)**, **SF-04 Profit Guardian lite** (flag `finance_lite`), `shipments.write` R1 moves | `src/lib/orders/{state.ts, events.ts, queue.ts, customers.ts, duplicates.ts, manual.ts, address.ts, risk-explain.ts, admin.ts, transition.ts, edit.ts, masking.ts, profile.ts, export-zip.ts, state.selftest.ts}`, `src/lib/orders/hooks/ops.ts`, `src/lib/callcenter/**`, `src/lib/finance/lite/**`, `src/lib/admin-data/orders.ts`, `src/app/app/[store]/{orders,queue,customers,finance}/**`, `src/app/app/[store]/team/{agents,callcenter}/**`, `src/app/api/app/[store]/{orders,ops}/**`, `src/components/admin/{orders,queue,customers,agents,callcenter,finance}/**`, `src/lib/settings/keys/{ops,accounting}.ts`, `src/lib/health/rules/ops.ts`, `src/lib/pulse/contributors/ops.ts`, `src/lib/notify/kinds/ops.ts`, `src/lib/flags/defs/ops.ts`, `src/lib/admin-data/search/ops.ts`, `src/components/admin/shell/commands/ops.ts`, nav/jobs `ops.ts`, i18n `ops.ts` + `finance.ts` (lite keys, **`fr` complete in R1**, OPE Q.27l; S3 takes `finance.ts` over in R2, D67), `scripts/qa/{ops-check,queue-check,ops-db-check,profit-check}.ts`, **rev 2.1 (OPE-§P):** `scripts/qa/tenancy-cases/ops.ts`, `scripts/qa/wow-demo/steps/ops.ts`, `src/lib/callcenter/{aggregates,idem}.ts` and `src/lib/finance/lite/cents.ts` (inside owned folders); **rev 3 (OPE-§P):** `src/lib/callcenter/{inbound,carrier-csv,window.server}.ts`, `src/lib/finance/lite/ad-rates.ts`, `src/app/api/app/[store]/orders/carrier-csv/route.ts`, `src/components/admin/callcenter/calling-window.tsx` (the one hours editor, D73), **`scripts/qa/fixtures/city-key.json`** (the parity fixture P3 and S1 read, D68; owned here because `cityKey` is P4's); **rev 4 (CRIT3):** `src/lib/callcenter/{window.ts, defaults.ts, window.fixtures.ts}` (inside the owned folder: the one window type, `DEFAULT_WINDOW`, the shared window fixture P3 and S1 read); appends to `src/lib/orders/contract.ts` status labels through the maintainer (OPE Q.9a); the manual v2 path inserts through `createOrderRow` and never edits `create.ts` (D72) |
| **P5 INTEGRATIONS** | operations.md | IN-01…IN-06 (IN-03 per-store secrets landed in T4; P5 adds the trigger, `integration_status` and health), the test-order exclusions on Sheets / CAPI / Telegram (D54) | `src/lib/sheets/**`, `src/lib/pixels/**`, `src/lib/orders/{conversions.ts, conversions-core.ts}`, `src/lib/orders/hooks/integrations.ts`, `src/lib/integrations/**` (telegram, whatsapp templates), `src/lib/jobs/handlers/{capi,telegram}.ts`, `src/app/app/[store]/integrations/**`, `src/app/app/[store]/settings/anti-spam/**` (OPE Q.17), `src/app/api/app/[store]/sheets/**`, `src/components/admin/{pixels,integrations}/**`, `src/components/admin/settings/sheets-wizard.tsx`, `src/lib/settings/keys/{sheets,conversions,notifications,telegram,export_key,pixel_library,pixel_health,tracking_secrets}.ts`, `src/lib/health/rules/integrations.ts`, `src/lib/pulse/contributors/integrations.ts`, `src/lib/notify/kinds/integrations.ts`, `src/components/admin/shell/commands/integrations.ts`, nav/i18n/jobs `integrations.ts`, `scripts/qa/{conversions-check,integrations-db-check}.ts` (OPE Q.9b), **rev 2.1:** `scripts/qa/tenancy-cases/integrations.ts`, `src/lib/integrations/deliveries.ts` (`listDeliveries(scope, q)`, OPE-§28, inside the owned folder) |
| **P6 DESIGN** | design.md | DG-02…DG-09 (DG-12 reduced to the `explanation[]` "why this design" line and the DNA card; sliders and seed history R3), BK-1, GN-1, GH-1 (behind `ai_director_brief`), the §M design gate, the design-baseline §5 targets | `src/lib/theme/**`, `src/lib/generator/**`, `src/lib/design/**`, `src/lib/ai/copy-library/**`, `src/landing/sections/**` (except `orderForm/**`), `src/landing/styles/**`, `src/landing/registry.ts` (the `features` field), `src/landing/selftest-registry.ts`, `scripts/check-theme.ts`, `src/components/generate/**` (except `ai/**`), `src/components/builder/**` (except `ai/**`; mounts P3's `ProofAttestSheet` at the `sample` toggle and the rating field, LAN Q31, and P7's AI components, AI R15), `src/app/app/[store]/{generate,brand}/**`, `src/components/admin/brand/**`, `src/lib/logo/{monogram-grid,favicon}.ts`, `src/lib/settings/keys/{brand,platform-design}.ts`, `src/lib/render/prepublish/design.ts`, `src/lib/health/rules/design.ts`, `src/lib/flags/defs/design.ts`, `src/lib/admin-data/search/design.ts`, `src/lib/jobs/tracks/design.ts`, nav `design.ts`, i18n `design.ts`, `scripts/qa/design-*.ts`, `scripts/qa/tenancy-cases/design.ts` (DES-R2); **rev 2.1 (DES-R18 accepted):** `src/landing/primitives/{SectionHeader,RichText,Price,Countdown,Badge,MarqueeTrack,Kicker}.tsx` (seven of the folder's 25 files; the rest of `src/landing/primitives/**` stays read-only, CCR). Rules for the seven: every change is **additive** (new optional props such as `SectionHeader.opener`; a doc without `look` renders byte-identical markup to today, proven by `render-check` goldens), no new runtime bytes (they are server components), and P3's `orderForm/**` and `thankyou/**` keep consuming them through their existing props, so P3 wave 1 builds before P6 merges; **rev 3:** `src/app/dev/fixture/design/**` (the story fixtures of DES-§15.6, excluded from production builds, DES-R25), `scripts/qa/render-cases/design.ts` (ENGP-12), `scripts/qa/wow-demo/steps/design.ts` (the stage / specimen / dark assertion, UX-39), `src/lib/design/{sheets,gate-input,copy-gen,features}.ts` and `src/lib/design/calibration/heights.json` (inside `src/lib/design/**`); the `estimateAlpha(bitmap)` browser estimate (`src/lib/design/photo-facts.ts`) that P2's photos step calls (UX-39); the `cta` section's primary button carries `Cta`'s existing `hero` prop so the frozen `sticky.ts` hides the bar near every in-flow CTA (UX-4); **rev 4:** `src/components/generate/reveal/**` (the three-fold reveal component P2's `/welcome` step mounts, with the slots for P7's `<DirectorPassControl>` and `<DirectorWhy>`, DES N5, AI R47), the "Report this store" link in `src/landing/sections/footer/**` (`legalLinks(ctx)`, CRIT15), the wizard's call site of P7's `useNoveltyGuard` and the generation record it stores (§M.1 rule 2); `src/lib/design/types.frozen.ts` is **not** P6's (maintainer, CRIT9); **rev 5 (CRIT2-4):** `src/landing/illustrations/**` (the light-field kit ~40 section files import, previously in no track's list: P6 removes the `Aurora` mesh and its CSS there and the theme's `--lp-aurora*` / grain emission in `src/lib/theme/**`, D60) |
| **P7 AI** | ai.md | AI-01…AI-08 with the **class router (D55)**, `ai_jobs` + the detached-job pattern and probe (D56), the Director **interactive** pass for landing pages (plan + critique round 1, digest without screenshots), rubric v3 and the kicker budget (`src/lib/ai/copy-schema.ts:113-151` kickers become optional, ≤ ⌈sections/3⌉), eval harness v1 with the pairwise judge and the gate, injection screen, canary; AI-19a Director brief (flag); the `ad.brief` task (R1, behind the Cloud AI flag, template fallback) and `callcenter.script` for SF-01 (LAN Q20) | `src/lib/ai/**` (except `copy-library/**`), `src/app/api/app/[store]/ai/**` (incl. `jobs/[id]`), `src/app/app/[store]/settings/ai/**`, `src/app/admin/(console)/ai/**`, `src/components/admin/ai/**`, `src/components/generate/ai/**`, `src/components/builder/ai/**`, `src/lib/settings/keys/{platform_ai,store_ai,platform_ai_secret}.ts`, `src/lib/notify/kinds/ai.ts`, `src/lib/flags/defs/ai.ts` (`ai_director_brief`, `ai_copilot`, `ai_learned_priors`, `ai_risk_v2`, and rev 3 **`ai_detached_jobs`**, release, `false`, set by the live probe, ENGC-18), `src/lib/health/rules/ai.ts`, `src/lib/i18n/admin/<locale>/ai.ts`, nav `ai.ts`, `src/lib/jobs/tracks/ai.ts`, `scripts/qa/{ai-eval,ai-probe,ai-stream-check,ai-db-check,detached-job-probe}.ts`, **`scripts/qa/e2e/wizard.ts`** (rev 5, CRIT2-19: `qa:wizard-e2e` in `test:e2e`, committed; AI-03 (1), (3), (4) and AI-19 (3), (15); its reveal-screenshot step runs at the R1 integration), `src/lib/ai/selftest.ts`, **rev 2.1:** `scripts/qa/tenancy-cases/ai.ts`, `src/lib/ai/jobs/pulse.ts` (`aiJobsForPulse`, AI R26; inside `src/lib/ai/**`); **rev 3:** `src/lib/ai/jobs/stages.ts` (the stage machine, AI-§B.13), `src/lib/ai/guard-numbers.ts`, `guard-claims.ts`, `prompts/darija-orthography.ts` (inside `src/lib/ai/**`); **rev 4 (AI-§R.1):** `scripts/qa/render-cases/ai.ts` and `scripts/qa/wow-demo/steps/ai.ts` (extension files pre-registered at P0), `src/lib/ai/director/budgets.ts` (`budgetVerdicts` over the core's `HEIGHT_BAND` / `FOLD_BAND`, inside `src/lib/ai/**`); every page and route that may start a pattern-B job exports `maxDuration = 360` (ENGC-18); adds `@anthropic-ai/sdk` (exact pinned version) through the maintainer (one package) (AI R1). **DES-R20 confirmed (rev 2.1):** P7 makes every `kicker` field of the loose and strict `PageCopy` schemas `.optional()` (`src/lib/ai/copy-schema.ts:113-151`, 15 sections today) and `mergeAiCopy(library, ai, ctx)` (`src/lib/ai/guard.ts:114`) gains `ctx.kickers?: ReadonlySet<string>` (section ids allowed a kicker, from design's `CopyDirectives.kickers`, G32): a kicker is dropped, library or model, for a section not in the set; absent set = today's behaviour. P6's wizard (`src/components/generate/wizard.tsx:602`) passes the set |
| **P8 PLATFORM OPS** | this doc §G, §H | OS-07…OS-11, PL-09 (job + ZIP), the runner with the rev 2 slot table **and the rev 3 tick lock, `yield()`, lag sampling and render CPU cap (ENGC-11)**, outbox core incl. the re-send rule (ENGC-29), render queue with the new reasons (incl. `cutout`) and the claim-clears-dedupe rule (ENGC-4), `renders` in-place `store_info` / `conversions` / `brand` (R1), health data incl. the PLA Q.25, AI/design, edge, build-gate, pool and tick sections, backups incl. `purgeRequests`, retention incl. the rev 2 rows, the `DATA_AREAS` registry (SEC-21), the `DATA_DIR` owner marker and budget walk (ENGC-14), the idempotent `put` (ENGC-20), the lock pool (ENGC-12) | `src/lib/jobs/**` (except other tracks' `tracks/*.ts`, `handlers/{capi,telegram}.ts` and `registry.ts`), `src/lib/media/{store.ts, storage/**}` **and, from the R1.0 integration, `src/lib/media/{process.ts, assets.ts, upload-slots.ts}`** (rev 3, ENGC-32: the upload pipeline steps 4-6 of §G.4), `src/lib/storage/**`, `src/lib/backup/**`, `src/lib/exports-store/**`, `src/lib/platform/health.ts`, `src/lib/db/locks.ts` (the lock pool; C0a's pure part frozen), `src/app/api/cron/tick/route.ts`, `src/app/media/[key]/route.ts`, `src/app/api/app/[store]/{media/**, exports/**}`, `scripts/qa/storage-check.ts`, `src/lib/jobs/selftest.ts` |

Files no R1 product track lists (for example `src/components/admin/{media,history,items,offers,variants}/**`,
`src/landing/document.tsx`, `src/lib/render/**` except the gate files, `src/lib/orders/create.ts`, the rest of
`src/lib/admin-data/**`) are read-only in this phase; changes go through a CCR. Every track's health rules, pulse
contributors, notification kinds, flags, commands, search providers and render-check cases live in its own extension
file (§K.3), so SF-01, SF-03, SF-04, SF-05 and SF-06 add no shared-file edits beyond P0. **`test:ownership` (§J.1)
parses the rows above and the parts' ownership tables at P0 and on every merge** (rev 3, ENGC-8): the P2/P3 `kit/**`,
P2/P4 `team/**` overlaps and the three unowned files (`settings/audit/**`, `keys/platform.ts`, `security/selftest.ts`)
rev 3 fixed were the last ones found by hand. **Rev 4 re-check** (every row above against PLA-§P, LAN-§26, OPE-§P,
AI-§R, DES-§26 and STO-§27): no file has two owners in one phase; the prose overlap "reveal composition" (P2) vs the
reveal component (P6) is now one owner per file (P6 the component, P2 the step); the one file with two owners inside it
(`src/lib/design/types.ts`: frozen shapes + P6 exports) is split into `types.frozen.ts` (maintainer) and `types.ts`
(P6, re-exporting); files the parts named in rev 4 got their row (P3 `selftest-checklist.ts` and `pages/**`, P2
`scripts/qa/e2e/{pulse,admin-perf}.ts` (two named files, not the whole `e2e/` directory: P7 owns `e2e/wizard.ts`), P7 `render-cases/ai.ts` / `wow-demo/steps/ai.ts`, the R2 / R3 rows of §K.4 / §K.5). Imports of
another track's finished module in merge order (P3 → P4's `window.ts` and `CallingWindowEditor`; S4 → S1's
`product-picker.tsx` and v3 functions) are reads, never shared ownership. **Rev 5 (CRIT2-6):** imports of a track that
merges **later** are imports of its **P0 stub**, never of a finished module: P2 (merging second) builds against P6's
`estimateAlpha` and `RevealFolds` stubs, P7 (merging seventh) against P6's `RenderDigest`, `NicheShares` /
`nicheShares`, `checkHeadlinesAction`, `validateHints`, `sampleGenome`, `GenomeCard` / `RepairOp` stubs (§K.2 P0
design); each compiles and passes its own merge gate against the stub, and the acceptance that needs P6's real body
(P2's reveal: UX-01, PLA-§O.4 #15, the `reveal` e2e step; P7's Director pass over a real digest) runs **at the R1
integration**, not at that track's merge.

**Signature-feature ownership (rethink-features §1, §3.1):** SF-01 Campaign Kit → **P3** (wave 2; P7 supplies the
`ad.brief` and `callcenter.script` tasks, P5 the WhatsApp confirmation template kind, P2 the address-card entry) ·
SF-03 Store Health → **P1** (engine, job, console ring) with **P2** (tenant ring and issue list) and one rules file per
track · SF-04 Profit Guardian lite → **P4** (`src/lib/finance/lite/**`, `/finance`, `fin.alerts`) · SF-05 Test-order
mode → **P3** (mint, link, address-card button, exclusions on leads) with **T3** (public path, test render, R1.0),
**P4** (TEST chip, KPI exclusions, "Delete test orders"), **P5** (Sheets / CAPI / Telegram exclusions), **P7** (learning
exclusions) · SF-06 Pulse ETag + shared poller → **P2** (route, poller, registry contributors from P3/P4/P5). The
other signature features are existing ids made visible: SF-02 Design DNA (P6: DG-02…07 + the DNA card), SF-07
Call Center Autopilot (P4: OP-03…OP-14 as one product), SF-08 Delivery Promise (P3: LP-03 + ST-17 landing side; S1
the store side in R2), SF-09 Carrier Reconciliation (S3/S4, R2), SF-10 Experiments with honest statistics (D3, R3,
D58), SF-11 Growth Autopilot (D4, R3), SF-12 Catalog from photos (S1/S2/S7, R2). The rethink estimates the R1
additions at **+1 to +2 engineer-weeks** (rethink-features §3.3); they sit inside P3 wave 2, P1's health engine, P4's
lite finance and P2's pulse, with the §3.3 cuts (OP-06 merge, PL-07 tabs, DG-12 sliders, the DPA, PL-17) paying for
them. No ninth track.

**Merge order**: P8 → P2 → P1 → P5 → P4 → P3 (wave 1) → P7 → P6 (design last: it changes generated output everywhere,
and the DG-09 calibration corpus runs on the merged build) → **P3 wave 2** (Campaign Kit, test links, WhatsApp order,
short links: it needs P7's `ad.brief` and P6's structure tags) → integration. Each merge: `npm run gate` green. Then
**integration** (~3 days): domain move (§C.10) and V1 … V11, the calibration corpus, the eval gate, the detached-job
probe on the live site, a manual COD run (landing page → order → queue → confirm → Sheets → Telegram → CAPI test event)
on XAMPP and live, and the **3-minute wow demo** (`qa:wow-demo`) on XAMPP and live.

**R1 exit criteria** (RESEARCH §4 + core + rethink-features §4 as the twelfth): (1) tenancy gate green; (2) V1 … V11
passed on the real domain; (3) store #1 plus at least 3 beta sellers live on subdomains; (4) AI eval gate green
(cloud AI may stay disabled); (5) no-orange and theme checks green; (6) backups produced and one restored into a
throwaway DB; (7) a store export ZIP downloaded and opened; (8) console approval → publish → order flow shown to the
owner; (9) `npm run gate:r1` green, so the publish gates refuse the design-baseline worst page and pass the keep-list;
(10) the design corpus reports median Q ≥ the DG-09 calibration floor with every hard gate green on 140 plans; (11)
the admin passes `test:admin-tokens`, `test:admin-motion`, `test:admin-rtl`, `test:i18n-coverage`; (12) **the
3-minute wow demo passes** (`qa:wow-demo`, rethink-features §4: every clock-table pass condition, ≤ 3:30 wall time,
Cloud AI off, two stores from the same photos give `d ≥ 0.25`, the test order touches no stats, Sheets or ad platform,
two agents never claim the same order, **the `N` press from the demo store owner's session with the seeded
`openOverrideUntil`, and one stage / specimen / dark direction at 0:50 for the argan and parfum fixtures**, rev 3).

### K.3 The shared-file rule and extension points

Owned by the maintainer for the whole of R1 product (and again in R2/R3): `src/lib/db/schema.ts`, `drizzle/**`,
`package.json`, `package-lock.json`, `src/lib/auth/permissions.ts`, `src/lib/tenancy/{types,seam,public}.ts`,
`src/lib/platform/{seam,impersonation}.ts`, `src/lib/orders/hooks.ts`, `src/proxy.ts`, `src/lib/edge/**`, `src/lib/urls/**`,
`src/lib/settings/{index,platform-registry,store-registry}.ts`, **`src/lib/settings/selftest.ts`** (P0, `test:settings`: every §D.10 key's level, secrecy, default and redaction), `src/lib/jobs/registry.ts`,
`src/components/admin/shell/nav/{types,index}.ts`, `src/components/admin/shell/commands/{types,index}.ts`,
`src/lib/admin-data/search/types.ts` (C0a's frozen `SearchProvider` skeleton), **`src/lib/admin-data/search/registry.ts`** (P0: `SEARCH_PROVIDERS`, the import lines of the tracks' providers; P2's `search.ts` reads it),
`src/lib/i18n/admin/{index,en,fr,ar}.ts` (base catalogs and runtime; the per-track files are the tracks', D67),
`src/lib/render/prepublish.ts`, `src/lib/render/prepublish/{budget,budget-limits}.ts` (the core's budget gate and its
`registerBudgetProfile` hook, §M.2; rev 2.1 names them explicitly), `src/lib/render/selftest-prepublish.ts`,
`src/lib/pulse/{types,registry}.ts`, `src/lib/notify/registry.ts`, `src/lib/flags/registry.ts`,
`src/lib/health/{types,registry}.ts`, **`src/lib/design/types.frozen.ts`** (rev 4, CRIT9: the frozen `HeightReport` /
`FoldReport` / `VariantFeaturesResolved` shapes in a file of their own; P6's `src/lib/design/types.ts` re-exports them and
owns everything else, so no file has two owners and `test:ownership` can express it as a glob), `next.config.ts`,
`src/app/fonts/**` (the root layout's self-hosted faces; the Arabic face of CCR r1.0-t2-9 item 3 added at the R1.0
integration), `src/landing/runtime/budgets.json`,
**`src/landing/runtime/landing.sha256`** (written by T3 at the R1.0 integration, frozen afterwards),
`scripts/build-landing-assets.mjs`, `src/lib/orders/contract.ts`, **`src/lib/orders/create.ts`** (`createOrderRow`, D72;
T3's in R1.0, read-only afterwards), `src/lib/page/schema.ts` (frozen; the one DES-R1
additive change is the maintainer's), `src/landing/document.tsx` (read-only in R1 product after T3; DES-R11's
`brandIcon` swap is a CCR applied by the maintainer), `scripts/qa/wow-demo.ts`, `scripts/qa/publish-gates-e2e.ts`,
**`scripts/qa/render-check.ts`** (the harness; tracks add fixtures through `render-cases/<track>.ts`, ENGP-12), **`scripts/qa/tenancy-check.ts`** (the attack-suite harness, maintainer from R1 product; tracks add cases through `tenancy-cases/<track>.ts`, listed in its `TENANCY_CASE_FILES` at P0), **`scripts/qa/registries-check.ts`** (P0, `test:registries`: every extension file on disk is imported by its registry, so a forgotten import fails `npm test`), **`src/lib/contracts/r1-p0.ts`** (P0: the compile-time contract of the cross-track stubs frozen at P0, types only; a track that renames, removes or re-types a frozen export breaks `tsc`, and a change goes through a CCR), `docs/saas/ccr/README.md` (the CCR rules),
**`scripts/qa/ownership-check.ts`** and its manifest **`docs/saas/ownership-baseline.json`** (rev 5, CRIT2-22),
`scripts/qa/tenancy-allow.json` (the lint's allow file; entries through the maintainer, LAN Q23), **`scripts/qa/test-budget.ts`** (the 3-minute harness, §J.1; rev 4 named) and its table **`scripts/qa/test-budget.json`** (rev 5, CRIT2-9),
**`scripts/deploy/archive.mjs`** and its gate-file writer **`scripts/qa/gate-ok.ts`** (SEC-10), **`scripts/deploy/gate-file.mjs`** (P0: the archive's gate-file rule as a pure function, `stubBuild: true` refused) and **`scripts/qa/stub-lock.ts`** (P0: the STUB-BUILD LOCK's prebuild check, see the maintainer build note in §K.2), **`docs/saas/ccr/p0-report.md`** (P0: what the contract step delivers, the stub table, the verification), `docs/saas/ccr/r1.0-finale-report.md` (the integration report), `docs/saas/ccr/r1.0-deploy-checklist.md` (the R1.0 deploy runbook), **`scripts/qa/e2e/r1.0-exit.ts`** (the R1.0 exit scenario of §K.1 criterion 5 as an e2e, `qa:r1-exit` in `test:e2e`), `src/landing/{types,context,i18n}.ts` (read-only in R1 product; the rev 4
report-link lines are the maintainer's P0 CCR, §K.2 P0), `scripts/sync-fonts.mjs` (the Arabic
metrics step and the seven `@fontsource` faces of DES-R21 are a maintainer CCR applied in R1 product; the sample list
`scripts/sync-fonts/ar-sample.json` is P6's), **`scripts/fonts/woff2-sfnt.mjs`** (rev 5, CRIT2-7: the WOFF2 table reader
moved out of `sync-fonts.mjs:71-115` plus the W3C WOFF2 §5.1-5.4 `glyf` / `loca` / `hmtx` reconstruction, written in R1
for the Arabic metrics step because every shipped Arabic WOFF2 stores transformed `glyf` / `loca` and the variable
packages ship no `.woff`; S2's `build-logo-fonts.mjs` imports it in R2; the known-glyph fixture
`scripts/sync-fonts/ar-glyph-fixture.json` is P6's), `docs/STORE-SAAS.md`. A track needing a change files
`docs/saas/ccr/<release>-<track>-<n>.md` (what, why, exact diff); the maintainer applies CCRs serially, the same day, and
notifies the other tracks.

Extension points (track-owned files that the shared registries import, so tracks never edit a registry):
`src/lib/jobs/tracks/<track>.ts` (jobs), `src/lib/jobs/handlers/<kind>.ts` (outbox handlers),
`src/components/admin/shell/nav/<track>.ts` (nav items), `src/components/admin/shell/commands/<track>.ts` (⌘K
commands, §I.3), `src/lib/admin-data/search/<track>.ts` (⌘K search providers, §I.3), `src/lib/i18n/admin/<locale>/<track>.ts`
(messages), `src/lib/settings/keys/<key>.ts` (a key's schema, owned by the part named in §D.10),
`src/lib/orders/hooks/<track>.ts` (handlers run after an order is created or changes state: CAPI and Telegram by P5,
customer counters and assignment by P4, lead attribution and `zone_not_served` by P3, commissions by S3 in R2,
webhooks by S5 in R2, stock moves by S1 in R2), `src/lib/render/prepublish/<track>.ts` (publish checks and listeners,
§M: design by P6, honesty by P3, budgets by the core), `src/lib/pulse/contributors/<track>.ts` (pulse counters, §I.4),
`src/lib/notify/kinds/<track>.ts` (notification kinds), `src/lib/flags/defs/<track>.ts` (release/ops flags, §D.4),
`src/lib/health/rules/<track>.ts` (Store Health rules, §I.7), `scripts/qa/tenancy-cases/<track>.ts` (attack-suite
cases, §F.1; from P0 also `actions: TrackActionCase[]`, the attack cases of the track's own server actions, which the
harness merges into its action catalogue, so a new action never needs a harness edit), `scripts/qa/wow-demo/steps/<track>.ts` (rev 2.1: demo steps, each exporting `steps: DemoStep[]`, imported
by `scripts/qa/wow-demo.ts`; §J.3), **`scripts/qa/render-cases/<track>.ts`** (rev 3, ENGP-12: render-check fixtures,
each exporting `cases: RenderCase[]`, imported by the maintainer's harness), `src/landing/runtime/addons/<chunk>.ts`
(runtime add-on chunks, P3 in R1; each needs its `budgets.json` key through a CCR, §H.13), and
`registerBudgetProfile(kind, profile)` called from a track's `src/lib/render/prepublish/<track>.ts` (per-kind budget
thresholds, D66, §M.2; storefront in R2). Permission keys and entitlement keys are all pre-defined (§A.3, §A.4): a
missing key is a CCR. In R1 product, `src/landing/runtime/**` stays read-only except P3's `addons/**` folder, and
`src/landing/primitives/**` stays read-only except P6's seven files (§K.2). Two tracks never own one file: where a part
spec and this section disagree, this section wins (rev 2.1 fixed the four overlaps it found: `src/lib/i18n/**`,
`health.ts`, the health registry import lines, the demo step folder; rev 3 fixed `(public)/kit/**` (P2/P3),
`team/{agents,callcenter}/**` (P2/P4) and gave `settings/audit/**`, `keys/platform.ts` and `security/selftest.ts` an
owner; rev 4 split `src/lib/design/types.ts` and named the reveal component's owner, §K.2), and from P0
`test:ownership` checks it mechanically.

### K.4 R2 (full stores and the money side), coarser grain

Contract step (maintainer): `drizzle/0006_r2.sql` (incl. `catalog_redirects`, `inventory_moves`, `notification_prefs`,
`pages.attach_opts`, `page_versions.product_rev`, `page_versions.kind` + `'sync'`, `leads.page_id` NULL-able, the
`store_themes` refinements, the `agent_earnings` key), payload v3 types (`src/lib/orders/contract-v3.ts`, the v2 contract
untouched), `orders.items` / `pages.draft` typed unions and lint **L11** (STO-R2, STO-R8), `StoreRenderContext` +
page-kind section contract (storefront.md), store runtime chunk budgets (`pdp` 23,500, `store` 2,500, `cart` 6,000,
`checkout` 8,000, `store-pixels` 4,200, `store-thanks` 3,000, `search` 5,000, `store-page` 41,000 B gz; R-D43,
STO-R13), `prebuild`/`predev` running `scripts/build-store-assets.mjs` after the landing build, `resolveProductKey` /
`resolveContextKey` (STO-R1), **`createOrderRow(draft, ctx)` already extracted in R1.0 (T3, D72): the R2 step only
widens `OrderDraft`** (the `items` union, NULL `page_id` / `version_id`, `catalog_version`; STO-R12 (a) restated, rev 3
ENGC-13), `attachedDocFor(target)` applied by `orderVersion` for pages with `product_id`, `contentIdOf(item, productKey)`
in `src/lib/render/config.ts` (STO-R12, LAN Q25), `ensureTemplateSet` (STO-R17), the STO-R19 stubs (`getStoreTheme(scope,
register)` S2; from P3's R1 modules, named for S1: `zonesForCheckout`, `zoneLineFor`, `zoneForCity`, `etaWindow`,
`etaText`, `etaWindowText` (rev 2.1, LAN N2: the STO-§15.8 shape, so S1 writes nothing in `src/lib/delivery/**`),
`signedTrackPath`, `waConfirmText`; from P4: `cityKey` (server-side), `callingWindowFor`, `nextCallableAt`, `hoursText`,
`shopperPromiseAllowed` (D68, D73; the store chunks import none of the city-key code and embed the `ZoneTable` and the
serialised `EffectiveWindow` as they are)) and the `stores.catalog_version` bump on delivery-zone writes, theme/brand
changes, `store` / `policies` setting writes **and (rev 4, STO C6) every `ops` write that changes `callingWindow`,
`windowOverrides` or closed dates (P4's `saveOpsSettingsAction` / `saveCallingWindowAction`: the store footer, the
contact hours and `#sg-config.checkout.callWindow` are rendered from it) and P8's `cutout` render handler, once per store
whose active products' `asset_refs` contain the asset (STO-D47)**, `republishAttached` as the handler of every render job of an attached page whatever its reason, `sync` vs in place chosen by diff of the mirror's priced fields against the published doc (LAN Q24, STO-R41; §H.3, CRIT2-17),
**(rev 2.1, STO-R25)** the import line of `src/lib/render/prepublish/storefront.ts` in `prepublish.ts` and the
`registerBudgetProfile(kind, profile)` calls for the STO-§6.1 kinds (D66, §M.2; the storefront file also registers
`storefront:*` items under the three codes, STO-§23.6), `src/storefront/{types,schema,kinds,fold}.ts` as frozen
contracts (`STORE_PAGE_KINDS`, `StorePageDoc` v1, `KIND_RULES`, `FoldLayout`; **four** files, STO ENGP-27), **(rev 3,
ENGP-1 / DES-R27; rev 5, CRIT2-2: the file of each widening named)** the additive widening of the frozen shapes and of
`FoldItem` to `| "name" | "identity" | "collections"` in the maintainer's **`src/lib/design/types.frozen.ts`**, and the
one-line widening of `GateInput.doc`, `genomeOf(doc)` and `estimateHeights(doc, …)` to `PageDoc | StorePageDoc` in
**P6's** files (`src/lib/design/gates/**` for `GateInput`, `derive.ts`, `heights.ts`; P6 finished at R1 exit) through the contract step's
CCR, never by a second owner of those files, with design's
`gateInputFor(doc, ctx)` (DES-§8.13, `KIND_GATES`) as the one adapter and `src/storefront/fold.ts checkFold` a thin call
into `estimateHeights` (DS33), **(rev 3, OPS-15 / D72)** the frozen signatures of `quoteManualOrderV3` /
`createManualOrderV3` / `editOrderV3` (`src/lib/catalog/order-v3.server.ts`, S1, STO-§16.9: pricing by `priceLine`,
insert by `createOrderRow`; a create whose quote has no delivery rule is refused `fee_unset`, never a 0 fee, and the
input has no `shipAfter`, the sheet sets the hold in a second idempotent write) so **S4** builds the manual-order
sheet's store-mode branch against them (rev 4, CRIT4: S4 only, as its row says), `createProduct(ctx, { facts })` and
`setThemeDraft(ctx, direction)` (S1, `WriteCtx`, for the store-mode onboarding reveal, §A.2 / OPS-14),
`productAsPageDoc(product, { …sctx, direction })` taking the onboarding direction, **(rev 3, D75)** **LP-16**: the
`landing-v3` runtime entry (a fork of `entry.ts` plus one zone lookup), runtime config **v3** with `zones: ZoneTable`,
server shipping by zone (`storeDeliveryFee`) for `runtime_v = 3` versions, the `budgets.json` key `landing-v3` (the
re-measured `landing` + 500 B), the export refusal `export:runtime_v3_unsupported` until the PHP template v3 (R3), the
checklist warning `delivery:fee_mismatch` and the "Charge delivery by city" toggle the attach flow uses (attached
landings created from a product in `both` mode start on v3), **(rev 3, AI R37)** `order_events.actor_kind` appended
`'integration'`, `'reconciliation'` so `stats_version_daily.delivered_evidence` can tell a carrier-confirmed delivery
from a hand-set one (**rev 4, AI R45:** `'integration'` means a carrier adapter only; the Sheets sync of D74 writes
`'sheet'` and the store's own API `'api'`, both counted as hand-set, so a typed "Livré" in a Sheet is never read as a
carrier-confirmed delivery), `stores.category` required at a mode switch to `store` / `both` (ENGP-25), the `onLeadCreated`
hook (OPE Q.18), `bumpVersionStats` (LAN Q26) and the `recordEvent` call line (AI R22), the packages `harfbuzzjs` and
`clipper-lib` pinned after the S2 spike (DES-R6), `scripts/build-logo-fonts.mjs` in `prebuild`/`predev` and `test:logo`
(DES-R7), `logistics`/`accountant` roles switched on, the `keepPng` media option (DES-R14), the deep Director pass enabled
when the §H.12 probe passed. **S1 owns whole route files in R2** (rev 3, ENGC-8 / STO-R36): `src/app/s/[store]/route.ts`,
`src/app/s/[store]/[slug]/route.ts` and `src/app/s/[store]/policies/**` pass from P3 / T3 to S1 (P3 is finished when R2
starts; D3's R3 edits go through S1's finished files), and `track/**` (landing's) gets the store chrome through **one
import** of `wrapInStoreChrome(scope, html, kind)` from `src/lib/storefront/chrome.server.ts` written by the maintainer
at this step, never "the store branches of" a shared file.

| Track | Feature ids | Main areas |
|---|---|---|
| S1 STOREFRONT | ST-01…ST-10, ST-17 (store side), LP-07, LP-08, LP-16 store side (D75), LP-23, AI-19 consumer (Director review button), SF-12 store side, SF-05 store side, the v3 manual-order pricing (OPS-15) | `src/lib/catalog/**` (incl. `order-v3.server.ts`, STO-§16.9), `src/lib/storefront/**` (incl. `chrome.server.ts`), `src/storefront/**` (except the four frozen contract files above), store page kinds and sections, `/p` `/c` `/cart` `/checkout` `/search` routes and **the whole files** `src/app/s/[store]/route.ts`, `[slug]/route.ts`, `policies/**` (rev 3; `track/**` stays landing's and imports `wrapInStoreChrome`), `src/app/s/[store]/[slug]/[...rest]/route.ts`, `src/app/api/public/store/**`, cart/checkout runtime chunks (rev 4, CRIT1: they look up the embedded value-keyed `ZoneTable`, `table.city[value] ?? table.star`, and bundle no city-key code, D68), on-request render cache with `w${windowId}` (R-D42, STO-R7), store SEO, `src/app/app/[store]/{catalog,storefront}/**`, `src/components/admin/{catalog,storefront}/**` (incl. `catalog/product-picker.tsx` that S4's sheet imports), `src/lib/editor/store-page.ts`, `src/lib/settings/keys/{checkout-store,storefront}.ts` (`checkout-store.ts` never redefines `addressMode`, UX-31), `src/lib/orders/hooks/storefront.ts` (stock decrement, hold release, STO-R23; reads the `line_outcome` event of a partial delivery), **the landing parts S1 takes over in R2 (LAN-§26.2 = STO-§27.2):** `src/lib/landing/{attach.ts, attach.server.ts, copy.server.ts}` (`materializeAttached`, `offerOverrides`, `republishAttached`, `copyPageToStore`), `src/components/builder/attach/**`, the `product` render handler registration, read-only mirrored item fields in the landing editor, the `landing-v3` runtime entry with the maintainer (D75); **extension files (rev 2.1):** `src/lib/render/prepublish/storefront.ts` (+ `storefront.fixtures.ts`, the per-kind `test:prepublish` fixtures), `src/lib/health/rules/storefront.ts`, `src/lib/pulse/contributors/storefront.ts` (`lowStock`, `outOfStock`, `templateDrafts`), `src/lib/notify/kinds/storefront.ts`, `src/lib/flags/defs/storefront.ts`, `src/lib/jobs/tracks/storefront.ts`, `src/components/admin/shell/{nav,commands}/storefront.ts`, `src/lib/admin-data/search/storefront.ts`, `src/lib/i18n/admin/<locale>/storefront.ts`, `scripts/qa/tenancy-cases/storefront.ts`, `scripts/qa/render-cases/storefront.ts`, `scripts/build-store-assets.mjs`, `scripts/qa/storefront-{render-check,db-check,e2e,perf,a11y,demo}.ts`; **rev 4 (STO-§27.2, LAN-§26.2):** `src/lib/storefront/onboarding.server.ts` (`setThemeDraft`) and the `facts` form of `createProduct` in `src/lib/catalog/products.server.ts`, `scripts/qa/copy-check.ts` (LP-23), `scripts/qa/lib/orange.ts` (S1's extraction of the orange scan, STO-§8.4; `scripts/check-theme.ts` stays read-only for S1) |
| S2 BRAND & LOGO | DG-10…DG-14 | `src/lib/logo/**` (HarfBuzz shaping, outlines, exports; takes over the R1 files), `src/lib/design/{brand,registers,effective,email,blueprint,store-theme.server}.ts`, `store_themes` lifecycle, brand kit UI (`src/app/app/[store]/brand/**`, `src/components/admin/brand/**`, `src/app/api/app/[store]/brand/**`), email token compiler, `scripts/build-logo-fonts.mjs`, `scripts/qa/design-visual.mjs` (DES-§26) |
| S3 MONEY | AC-01…AC-07, OP-15, TN-12, SF-09 (with S4) | `src/lib/finance/**` (takes over `lite/**`), `src/lib/imports/**` framework + `import_mappings` (D38; incl. `xlsx-write.ts`, the writer S4's Carrier CSV route imports), commissions ledger (`hooks/money.ts`), `src/lib/jobs/tracks/money.ts`, finance screens (`src/app/app/[store]/finance/**`, `src/components/admin/finance/**`), `src/app/api/app/[store]/{imports,finance}/**`, `src/lib/settings/keys/accounting.ts` (from P4), `DATA_DIR/receipts`, `scripts/qa/ledger-check.ts`, `scripts/qa/fixtures/imports/**` (OPE-§P) |
| S4 LOGISTICS | OP-06 merge (R2), OP-16…OP-19, the store-mode manual-order sheet (OPS-15) | `src/lib/carriers/**` (`CarrierAdapter`, manual CSV adapter, the `self` adapter), `src/lib/shipping/**` (shipments, picking list / manifest PDF; rev 4: incl. `manual-actions.ts`, the sheet's thin v3 `storeAction` wrappers, OPE-§11.5), `src/lib/orders/merge.ts`, `src/lib/callcenter/{rules.ts, reveal-alarm.ts}` (assignment rules, reveal alarm), `src/lib/jobs/tracks/logistics.ts`, `src/app/app/[store]/shipping/**`, `src/components/admin/shipping/**`, `src/app/api/app/[store]/shipping/**`, `src/lib/settings/keys/carrier_credentials.ts`, `scripts/qa/carrier-check.ts`; **takes over from P4 in R2:** `src/components/admin/orders/manual/**` (incl. rev 4 `mode.ts`, `manualSheetMode`; the sheet routed by store mode: the products picker in `store` / `both` calling S1's v3 functions, the pages picker in `landing` calling `createManualOrder`), `src/app/api/app/[store]/orders/carrier-csv/route.ts` (`format=xlsx` through S3's writer). Operations' proposed `src/lib/orders/{manual-v3,edit-v3}.ts` do **not** exist: the v3 functions are S1's (`src/lib/catalog/order-v3.server.ts`), so the public and manual v3 prices share one owner (rev 3, OPS-15; §Q.8) |
| S5 INTEGRATIONS 2 | IN-07…IN-09, SE-07 | webhooks (`src/lib/webhooks/**`: Standard Webhooks, outbox handler `src/lib/jobs/handlers/webhook.ts`, `hooks/webhooks.ts`, `lead.created` via `onLeadCreated`, `src/app/app/[store]/integrations/webhooks/**`), SSRF guard library (`src/lib/security/ssrf.ts`), SMTP mail transport (`payout_ready` template), Sheets upgrades (`src/lib/sheets/**` for IN-09, `src/lib/settings/keys/sheets_sa.ts`) |
| S6 PLATFORM UX | UX-04, UX-06, OS-12, OS-13, PL-07 remaining tabs, French dashboard | admin upgrade on the §I.6/§I.8 foundation, realtime arrivals on the pulse (PLA-§22.6.4), Worker edge cache + purge, Worker alerts; UX-05 already shipped in R1 (P2) |
| S7 AI DATA | AI-09…AI-12, the **deep Director pass** (Fable 5.1) for store blueprints and logo systems, preview rasterization + tiles, verify round 2 (rethink-ai §6) | SEO/alt/translation tasks with Batches, store blueprint, `stats_version_daily` + `ai_feedback` plumbing (`src/lib/stats/version.ts`, `src/lib/orders/hooks/ai.ts`, AI R22), `recordPublishFeedback`, `generation_source` / `critic_picks` readers |

R2 exit: a "both" store with catalog, cart and attached landings; profit dashboard and remittance matching tested on
the owner's real carrier files; a load test of on-request store pages through the edge cache; gate green.

### K.5 R3 (grow and learn), coarser grain

Contract step: `drizzle/0007_r3.sql` (the refined `experiments` / `experiment_arms`, `experiment_exposures`,
`page_schedules`, `saved_blocks`, `saved_block_uses`, `orders_store_variant_idx`, `orders_updated_idx`, `pages.addons`
/ `page_versions.addons`, `wa_messages`, `stock_purchases`, `support_macros`, `push_subscriptions`, `ai_models`,
`ai_exemplars_platform`, `design_archive` column swap, `render_jobs.reason` + `'reviews'`, `outbox.kind` + `'push'`),
`store_domains` routing (`/d/<host>`, C mode) **with the ownership rules of rev 3 (SEC-19):** a host is activated
only after a TXT record `_sg-verify.<host> = sg-domain-verify=<token>` whose token is bound to `(store_id, host)` is
read (`verify_token_hash`, `verified_method`), re-checked every 24 h by a `domains.recheck` job (two misses →
`status = 'dns_lost'`, excluded from `storeHosts()`, `invalidateStore`); `UNIQUE(host)` holds across stores and a purge
or removal sets `status = 'released'` and keeps the row 30 days, so no other store can claim the host without a fresh
token (the dangling-CNAME takeover through the fallback origin is thereby closed); the Cloudflare custom hostname is
created only after verification; `effectiveHost()` treats a `custom` host whose row is not `active` as `invalid` (404),
never `platform`; attack-suite cases: B claims A's host after A's purge → refused for 30 days, an order posted with
`Origin: https://<A's old domain>` to B's pageKey → refused. Then the area `api-v1` and its Worker rule (OPE Q.19), the
experiments contract (weights JSON, cache rules, **mSPRT** stop rule, D58; `?xv=<arm>` serving with canonical to the
control, the in-page arm wrapper `.lp-xa`, `exp-head` in `<head>`, LAN Q38; **the renderer support passes the
non-control wrapper selectors `[data-xa]` to the budget gate so `budget:R1 / R5 / I1 / F5` count the control arm only
and each arm is gated as its own document**, rev 3 ENGP-18), **the PHP template v3** for LP-16 with its parity tests
(LAN Q28; the runtime side moved to R2, D75; until this step the export refuses "charge by city" pages with
`export:runtime_v3_unsupported`), `inlineHashes` / `buildLandingCsp` hashing `<script type="speculationrules">` (ST-18),
the `platform_push` secret and `/app/sw.js` with `Service-Worker-Allowed: /app/` (PLA Q.21), `orders.items.chain[]`
rendered in the order text, the Sheet row and the CSV (LAN Q27), **(rev 2.1 STO-R26, restated rev 3 ENGP-31)**
`budgets.json` `store-page` 41,000 → the derived **42,500** B in the same step that adds `exp-head` and `exp` (§H.13),
and the new landing section `src/landing/sections/reviewsVerified/**` plus `src/storefront/sections/reviewsVerified/**`
owned by D3 (STO-§27.3).
Tracks: **D1 DOMAINS** (OS-14…OS-18, PL-22
skeletons), **D2 CARRIERS & MESSAGING** (OP-20…OP-27, IN-10…IN-13, AC-08…AC-11), **D3 GROWTH** (ST-11…ST-20, LP-09,
LP-10, LP-13…LP-15 (**LP-14's section files are D4's**, inside its `src/landing/sections/**` glob; D3 owns the `video-hero` add-on; rev 5, CRIT2-21), **LP-16 PHP side only (runtime in R2, D75; rev 4, LAN N7 / CRIT11)**, LP-24; SF-10; the R3 check
scripts `scripts/qa/{chain-check,schedules-check,analytics-check,saved-blocks-check}.ts`, LAN-§26.3), **D4 LEARNING** (AI-13…AI-23 incl. the LLM version of AI-20, DG-12 sliders and seed
history, DG-15…DG-18; SF-11), **D5 PLATFORM** (PL-15…PL-21, UX-07 push, UX-08 Arabic RTL dashboard, SE-08). ST-21 (EU
pack) becomes P0 when the first EU store is planned. P2 items stay gated on volume, consent, legal review or owner
demand (RESEARCH §4).

---

## L. Traceability

Track codes: R1.0 `C0`, `T1` DATA, `T2` AUTH, `T3` EDGE, `T4` SCOPE; R1 `P1` CONSOLE … `P8` PLATFORM OPS (§K.2);
R2 `S1` … `S7` (§K.4); R3 `D1` … `D5` (§K.5). "core" = this document.

**Proven by (rev 4, CRIT17).** Every feature id is mapped to the command and the fixture or harness step that proves it
in its part: PLA-§1 (a "Proven by" column, `FEATURE_PROOFS` asserted by `test:platform`), STO-§1.5, LAN-§1.4,
OPE-§O.4 (`ops-check.ts` fails on an uncited id), AI-§Q.5, DES-§1.4; every test file names the ids it proves in a
`// proves: <ids>` header, so `grep "proves:"` maps every id to a suite. An acceptance cell that only lists deliverables
is rewritten as a checkable statement by its part; the core's own rows below point at the §J scripts.

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
| PL-07 | platform.md; R1 tabs Overview, Orders (masked), Team, Activity, Usage & plan (+ Notes if S); Catalog & pages, Integrations health, Domains, Risk, Media, Ops, Support in R2/R3 (rethink-features §3.3, §I.2) | R1 (R2) | P1 (S6) |
| PL-08 | core §A.5 + platform.md | R1.0 / R1 | T1, P1 |
| PL-09 | core §F.9, §H.2 + platform.md | R1 | P8, P1 |
| PL-10 | core §B.8 + platform.md | R1.0 / R1 | T2, P1 |
| PL-11 | core §A.4 + platform.md | R1.0 / R1 | T1, P1 |
| PL-12 | core §H.8 + platform.md | R1.0 / R1 | T1, P1 |
| PL-13 | core §D.4 + platform.md | R1.0 / R1 | T2, P1, P2 |
| PL-14 | core §D.10, §H.4 (legal seed from code) + platform.md; R1 = ToS, Privacy, AUP, store templates; the platform **DPA moves to R2** (rethink-features §3.3) | R1 (DPA R2) | P1 |
| PL-15 … PL-17, PL-19, PL-21 | platform.md (PL-17 stays R3: no R1 "What's new" drawer) | R3 | D5 |
| PL-20 | **R1 slice (rev 3, D76):** "Report this store" on every public page, `/report/<handle>`, insert-only `abuse_reports` in 0005, console counts and the `abuse_reports_new` flag; the triage queue and takedowns stay R3; rev 4 (CRIT15): one `reportUrl()` builder and `links.report` in the render context (§C.6) | R1 (slice) / R3 | P1 (+ P6 landing footer, the maintainer's Shell fallback, P3 thank-you / tracking / legal pages, S1 store chrome) / D5 |
| PL-18 | **raised to R1 and tenant-facing** (SF-03): core §I.7, D53, §D.5 `store_health` + platform.md PLA-§6.3 | R1 | P1 (engine, job, console ring), P2 (tenant ring), rules per track |
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
| ST-11 … ST-16, ST-18 … ST-20 | storefront.md | R3 | D3 |
| ST-17 | **raised** (rethink-features §3.2): ETA as dates on landing pages = landing.md LAN-§7.2 (`etaWindow`, `assist` chunk, §H.13) in R1; the store checkout side (STO-§15.8) in R2 | R1 (landing) / R2 (store) | P3, S1 |
| ST-21 | storefront.md | at the first EU store | — |
| ST-22 | storefront.md | later | — |
| LP-01 | core §C, §E (scoped, frozen contracts) + landing.md | R1.0 / R1 | T3, T4, P3 |
| LP-02 … LP-06 | landing.md | R1 | P3 |
| LP-07, LP-08 | landing.md + storefront.md, design.md (D50 refined for reason `product`, §H.3) | R2 | S1, S2 |
| LP-09, LP-10, LP-13 … LP-15 | landing.md (LP-09 with mSPRT, D58) | R3 | D3 |
| LP-16 | **moved to R2 (rev 3, D75, OPS-13):** the `landing-v3` runtime entry, runtime config v3 and server shipping by zone in the R2 contract step (§K.4); the PHP template v3 and its parity tests stay in the R3 contract step (§K.5) with the export refusing "charge by city" pages until then | R2 (runtime) / R3 (PHP) | maintainer + P3's modules, S1 (attached landings), D3 (PHP v3) |
| LP-11 | **raised to R1** (rethink-features §3.2): landing.md LAN-§11, core §C.4 `POST /api/public/wa`, `leads.kind = 'whatsapp'` (§D.2) | R1 | P3 wave 2 |
| LP-12 | **raised to R1**: landing.md LAN-§12, core §C.4.1 `/go/<code>`, §D.5 `short_links` (moved to 0005, D63) | R1 | P3 wave 2 |
| LP-18 | **new** (= SF-01 Campaign Kit): landing.md LAN-§13, core §D.5 `campaigns`, §B.1 `/kit/<token>`, §E.2 `resolveKitShare`, `campaigns.write` (§A.3.1), D63 | R1 | P3 wave 2 (+ P7 `ad.brief`, `callcenter.script`; P5 template kind; P2 card entry) |
| LP-19 | **new** (= SF-05 test-order links): core D54, §C.4.1 test render, §D.2 `is_test`, §E.2 `resolveTestToken` + landing.md LAN-§14, operations.md OPE-§26 | R1.0 (plumbing) / R1 | T3, P3 wave 2, P4, P5, P7 |
| LP-20 | **new**: slug history, core §C.4.1 308 rule, §D.4 `page_slug_history` (0004 since rev 3, ENGC-1) + landing.md LAN-§15.1 | R1 (the table and the 308 route in R1.0) | P3 (+ T3 route, T4 `recordSlugMove`) |
| LP-21 | **new**: honest time and stock guards, landing.md LAN-§6.2, enforced server-side by the honesty gate (§M.3) | R1 | P3 |
| LP-22 | **new**: page vitals in the pages list, landing.md LAN-§15.2 (`n ≥ 20` rule, §I.8 rule 3) | R1 | P3 |
| LP-23 | **new**: copy a page to another store (media re-ingested under the target ids, D21), landing.md LAN-§17.7 | R2 | S1 |
| LP-24 | **new**: saved sections and house blocks, §D.6 `saved_blocks`, landing.md LAN-§21.2 | R3 | D3 |
| LP-17 | landing.md | later | — |
| OP-01 … OP-05, OP-07 … OP-11, OP-13, OP-14 | operations.md | R1 | P4 |
| OP-06 | **trimmed** (rethink-features §3.3): R1 = store-wide duplicate flag, link and "separate order" (P4, OPE-§9.3); the **merge** (lines combined, one parcel, one fee) moves to R2 (OPE-§9.4) | R1 / R2 | P4, S4 |
| OP-12 | operations.md + core §D.2 | R1.0 / R1 | T3, T4, P4 |
| OP-15 | operations.md | R2 | S3 |
| OP-16, OP-18, OP-19 | operations.md | R2 | S4 |
| OP-17 | **raised to R1** (rethink-features §3.2): keyboard-first agent console, operations.md OPE-§13.3, core §I.3 chords | R1 | P4 |
| OP-20 … OP-27 | operations.md | R3 | D2 |
| OP-28, OP-29 | operations.md | later | — |
| AC-01 … AC-07 | operations.md | R2 | S3 |
| AC-08 … AC-11 | operations.md | R3 | D2 |
| AC-12 | operations.md | later | — |
| IN-01, IN-02, IN-04, IN-05 | operations.md | R1 | P5 |
| IN-03 | operations.md + core §D.10 | R1.0 / R1 | T4, P5 |
| IN-06 | core §D.10 `platform_turnstile` + operations.md | R1 | T3, P5 |
| IN-07, IN-09 | operations.md + core §H.1; **rev 3 (D74):** the two IN-09 rows "Tracking" / "Transporteur" (sheet columns pulled into `orders.tracking_ref` / `carrier_label`) ship in **R1** with P5, the Carrier CSV export with P4 | R2 (R1 for the two columns and the Carrier CSV) | S5 (P5, P4) |
| IN-08 | platform.md + core §B.10 | R2 | S5 |
| IN-10 … IN-13 | operations.md | R3 | D2 |
| IN-14 | operations.md | later | — |
| AI-01 … AI-08 | ai.md (+ core §D.10 settings split, D55 class matrix, D56 `ai_jobs` and §H.12, the interactive Director pass, rubric v3 and the kicker budget, the pairwise eval gate; rethink-ai §6 R1 row) | R1 | P7 |
| AI-03 | ai.md + D59: no model download on the critical path; the consent card never on mobile data | R1 | P7, P2 |
| AI-09, AI-10, AI-12 | ai.md (AI-12 incl. `page_versions.generation_source` / `critic_picks` provenance, `ai_feedback` kinds of rethink-ai §3.1, the hierarchical reward D61) | R2 | S7 |
| AI-11 | ai.md + storefront.md; the **deep Director pass** (Fable 5.1, pattern B of §H.12) for blueprints and logo systems | R2 | S7, S1 |
| AI-13 … AI-18, AI-21 … AI-23 | ai.md (AI-13 priors with Thompson sampling, D61; AI-17 digest reads `store_health.issues`) | R3 | D4 |
| AI-19 | **raised to R2, cloud-only, on request** (rethink-features §3.2): Director critique and repair = the "Director review" button (S7 with S1's builder mount); static gates (DG-06, §M) stay the R1 gate; **AI-19a** Director brief = R1 slice behind `ai_director_brief` (P7, GH-1) | R1 (19a) / R2 | P7, S7 |
| AI-20 | **template version raised to R1** inside SF-01 (angles from structure tags, `doNotSay` from the guard; LAN-§13.2); the `ad.brief` task runs behind the Cloud AI flag with template fallback (LAN Q20); the LLM version with best-delivering variant data stays R3 | R1 (template) / R3 | P3 + P7 / D4 |
| AI-24 | ai.md | later | — |
| DG-01 | design.md (docs/DESIGN.md v3) | R1.0 | C0 |
| DG-02 … DG-09 | design.md (+ core §M design gate, the design-baseline §5 targets as test fixtures, D51, D52) | R1 | P6 |
| DG-10, DG-11, DG-13, DG-14 | design.md | R2 | S2 |
| DG-12 | **trimmed** (rethink-features §3.3): the "why this design" line and the DNA card ship in R1 through DG-02's `explanation[]` (P6); gene sliders and seed history move to R3 (D4) | R1 (line, card) / R3 (studio) | P6 / D4 |
| DG-15 … DG-18 | design.md | R3 | D4 |
| DG-19 | design.md | later | — |
| UX-01 | platform.md (+ design.md reveal) + D59: directions ranked from category tap + photo palette + keywords, SigLIP/VLM refine after the reveal | R1 | P2 (+ P6) |
| UX-02 | platform.md + core §I.3, §I.4 (commands and search extension points) | R1 | P1 (console), P2 (tenant) |
| UX-03 | platform.md + core §I.6 | R1 | P1 |
| UX-04 | design.md + core §I.6, §I.8 | R2 | S6 |
| UX-05 | **raised to R1** (rethink-features §3.2): live address card with copy, QR, WhatsApp share, test order, campaign entry (core §I.4) | R1 | P2 (+ P3 entries) |
| UX-06 | platform.md PLA-§22.6.4 on the D57 pulse | R2 | S6 |
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
| **SF-01** Campaign Kit | = LP-18 (above); core D63, §D.5, §B.1, §E.2, §I.3, §I.4 | R1 | P3 wave 2 |
| **SF-02** Design DNA | DG-02 … DG-07 + D35-D39 made visible (DNA card, novelty certificate, "why this design" line); design.md DES-§4.8, §15.4 | R1 | P6 |
| **SF-03** Store Health | = PL-18 raised; core D53, §I.7, §D.5 `store_health`, `health.snooze` | R1 | P1 + P2, rules per track |
| **SF-04** Profit Guardian lite | core D63, §A.3.1 `finance.*` R1, §D.5 `product_costs` / `carrier_rates` / `ad_spend_daily` / `profit_alerts`, flag `finance_lite`, `/finance`, `fin.alerts`; operations.md OPE-§16.2; full AC-01 … AC-07 R2 | R1 (lite) / R2 | P4 / S3 |
| **SF-05** Test-order mode | = LP-19; core D54 | R1.0 / R1 | T3, P3, P4, P5, P7 |
| **SF-06** Pulse ETag + shared poller | core D57, §I.4 `StorePulse`, contributors registry | R1 | P2 (+ P3, P4, P5 contributors) |
| **SF-07** Call Center Autopilot | OP-03 … OP-15 + AI-23 as one product: operations.md OPE-§5 … §14; R1 without AI-23 | R1 (R3 AI) | P4 (D4) |
| **SF-08** Delivery Promise | D22 + LP-03 + ST-17: landing.md LAN-§7, §H.13 `assist` chunk; store side R2 | R1 / R2 | P3 / S1 |
| **SF-09** Carrier Reconciliation and cash held | AC-06 + the D17 money axis: operations.md OPE-§16.7 | R2 | S3, S4 |
| **SF-10** Experiments with honest statistics | LP-09 with mSPRT (D58): landing.md LAN-§18 | R3 | D3 |
| **SF-11** Growth Autopilot | AI-17 + AI-18 + the Today brief (R1 template line, §I.4) | R1 (brief line) / R3 | P2 / D4 |
| **SF-12** Catalog from photos | AI-04 + `AssetRef.box` + AI-09 … AI-11: storefront.md STO-§4, design.md DES-§14.4 | R2 | S1, S2, S7 |

### L.3 Rethink changes and cross-cutting baseline targets → where they are integrated

| Source | Change | Integrated in | Track |
|---|---|---|---|
| rethink-ai §9.1 | Director tier with two speeds (interactive Opus 5.5 `medium`, deep Fable 5.1 `high` as a job) | D55, D56, §H.12, §D.10 `platform_ai.classes`, §K.2 P7 (interactive) / §K.4 S7 (deep) | P7, S7 |
| rethink-ai §9.2, §9.10 | cache-read economics (0.025×/0.05×/0.1×), vision token formula | `platform_ai.prices` per model incl. cache tiers (§D.10); ai.md owns the math | P7 |
| rethink-ai §9.3, §9.4 | per-class fallback facts and effort levels | `platform_ai.classes[*].fallbacks` / `.effort` (§D.10), D55 | P7 |
| rethink-ai §9.5, §0.6 | diversity from briefs, seeds, rotation and distinctness (no sampling params on 5.5) | `ai_feedback.direction_slot` (§D.6), `GeneHints` stub (§K.2 P0), the wow-demo check `d ≥ 0.25` (§J.3) | P6, P7 |
| rethink-ai §9.6, §1.5 | job model for the 120 s cap: `ai_jobs`, `after()`, heartbeat, orphan recovery, Batches fallback, probe | D56, §D.5 `ai_jobs`, §H.2 slots 4b/4c, §H.12, §E.2 `job_queued`, §J.3 `qa:detached-job-probe` | P7, P8 |
| rethink-ai §9.7, §3.2 | hierarchical Beta reward replaces the fixed 0.4/0.6 mix | D61, §D.6 `gene_stats_*` columns `alpha_m` / `beta_m` | D4 |
| rethink-ai §9.8, §3.6 | pairwise blind judge vs frozen baselines, two-model jury, noise floor, canary with rollback | `platform_ai.evalGate` (§D.10), `ai_eval_runs` (§D.3), `prompt_versions.canary_bp` (AI-§M.1), §J.1 `test:ai-eval`, §J.5 `gate:r1` | P7 |
| rethink-ai §9.9, §0.4 | kicker budget (`copy-schema.ts:113-151` requires a kicker for 15 sections) | §K.2 P7 row; design-baseline C5 as a soft gate (§M.2) | P7, P6 |
| rethink-ai §9.11 | labelled preview tiles + render digest for the cloud critic | S7 scope (§K.4); `critic_picks` on `page_versions` (§D.2) | S7 |
| rethink-ai §9.12 | Fable 5.1 30-day retention disclosed | `platform_ai.retentionNotice` (§D.10) | P7 |
| rethink-ai §9.13 | per-class model setting instead of one id (refines R-D29) | D55 | P7 |
| rethink-ai §9.14, §9.15 | scripts per product never per customer; insights never compute | §F.11 (PII), AI-15 / AI-17 rows (§L.2), `store_health.issues` as the digest input (§I.7) | D4 |
| rethink-ai §9.16 | `ai_jobs`, `ai_exemplars_platform`, `ai_runs` class/effort/stage/job_id, `ai_feedback` fields, `prompt_versions.rubric_version`, `page_versions.generation_source` / `critic_picks` | §D.2, §D.3, §D.5, §D.6 | maintainer (P0), P7, S7 |
| rethink-ai §9.17 | kept: three-provider ladder and chip, guard choke point, PII policy, structured retrieval, k-anonymous library, shingle guard, credits, "learns from your results", P2 status of F-25/F-26 | unchanged (§A.4, §F.11, §D.5 `headline_shingles`, D35) | — |
| rethink-ai §5.3 | tenant isolation of memory, exemplars, priors and cache | §F.2, §J.2 `test:ai-db` prompt-assembly case | P7 |
| rethink-features §3.1 | ADD SF-01, SF-03, SF-04, SF-05, SF-06 | D53, D54, D57, D63; §L.2 SF rows; §K.2 ownership paragraph | P3, P1/P2, P4, P3/T3, P2 |
| rethink-features §3.2 | RAISE ST-17, LP-11, LP-12, UX-05, OP-17, AI-20 (template), AI-19 (R2 on request), PL-18 | §L.2 rows above; §A.3.1 (`campaigns.write`, `finance.*` R1), §C.4.1 `/go` R1, §I.1 routes, §I.4 address card, §I.3 chords | P3, P2, P4, P7, P1 |
| rethink-features §3.3 | CUT/trim OP-06 merge → R2, PL-07 tabs, DG-12 sliders → R3, PL-14 DPA → R2, PL-17 stays R3 | §L.2 rows; §I.2 console routes; §K.4 S4 | — |
| rethink-features §3.4 | D47 mSPRT; UX-01/AI-03 no download on the critical path; D38/§I.6 no-bounce in today's shell + aurora/grain budget; PL-18 tenant-facing; D50 ETag pulse | D58, D59, D60, D53, D57; §I.6, §I.4, §K.5 experiments contract | D3, P2, P1 |
| rethink-features §2.1-2.10 | admin UX ceiling (8 rules), IA, ⌘K model, notification centre, empty states, data-viz, motion, density, i18n/RTL, keep/rework/redesign, 13-screen order | §I.3, §I.4, §I.5, §I.6, §I.8; `test:admin-motion`, `test:admin-rtl`, `test:i18n-coverage` (§J.1) | P2, P1, P4, P3, P6 |
| rethink-features §4 | the 3-minute wow demo as R1 acceptance | §K.2 exit criterion 12, §J.3 `qa:wow-demo`, §J.5 `gate:r1`, owner summary 19 | maintainer + P2, P3, P4, P1 |
| design-baseline §5 C2, C3, F1, F5 | fold contract, section count and height caps, form position, page weight as hard publish gates | D52, §M.2 | core (gate), P6 (fixtures) |
| design-baseline §5 I4, D1, D2 | honest proof sections, numbers consistency, no library figures | §M.3 `honesty_blocked`, §C.8 no `aggregateRating` | P3 (gate), T3 |
| design-baseline §5 N1, N2, N8 | genome distance against the niche and the store's own pages; headline shingle share | §M.4 `design_blocked` (publish-time clone block, DES-§7.8), D64 verdict bands | P6 |
| design-baseline §5 others (N3-N7, C1, C4-C7, T*, K*, I1-I3, I5-I7, R*, D3-D6, RTL*, F2-F4) | design-system targets owned by design.md, measured by the DG-09 harness | §J.1 `test:design` fixtures, §J.3 `qa:design-corpus`, exit criterion 10 | P6 |
| design-baseline §5.10, §6 | harness format and the keep-list | `qa/saas-baseline/index.json` extended (§J.3); keep-list items are regression fixtures in `test:design` | P6 |
| **rev 2.1** DES-§27.2 (DES-R18, R19, R20) | the seven primitives to P6; `estimateHeights` / `variantFeatures` stubs and frozen report types; kicker-optional schemas and `GuardContext.kickers` | §K.2 P6 and P7 rows, §K.2 P0 list, §K.3, §M.2 | P6, P7 |
| **rev 2.1** AI-§S.2 (R26) | `aiJobsForPulse` as the producer of `StorePulse.jobs` | §I.4, §K.2 P0, §J.2 `test:ai-db`, §J.3 `qa:pulse-e2e` | P7, P2 |
| **rev 2.1** STO-§29.3 (R25, R26, R27) | per-kind budget profiles (D66), `store-page` 43,000 at R3 (superseded in rev 3 by the derived 42,500, ENGP-31), one audit name per attach event | D66, §M.2, §K.3, §K.4, §H.13, §K.5, §F.5 | S1, D3 |
| **rev 2.1** OPE-§Q.26 | `integrations.outbox.replayed`, `finance.period_closed` / `finance.period_reopened`, bucket `s:<sid>:replay:<uid>` | §F.5, §E.8, §A.3.1 | P5, S3 |
| **rev 2.1** LAN-§27.2 (N1, N2, N3) | one `recordPublishFeedback` caller; `etaWindowText` named for S1; `/go` 308 `private, no-store` in the header suite | §M.1 rule 4, §K.2 P0, §K.4, §C.4.1, §F.6, §J.3 | P3, S1, T3 |
| **rev 2.1** PLA-§Q.1 (notes 1, 2) | `ActionErrorCode` open tail with the i18n rule (D65); `addImpersonationNoteAction` seam behaviour pinned | D65, §E.2, §B.8, §F.1 | P1, P2 |
| **rev 2.1** core reconciliation | one i18n file per track (D67), the health engine file placement and `computeHealth` location, the committed demo-step folder, the storefront R2 job times, the `platform.ts` / `storefront.ts` / `ai.ts` / `ops.ts` / `integrations.ts` attack-case files | §I.5, §I.7, §H.2, §J.1, §J.3, §K.2, §K.3 | P1, P2, P4, P5, P7, S1 |
| **rev 3** round-1 review (OPS, ENGC, ENGP, UX, SEC, QUAL) | the blockers OPS-1, ENGC-1, ENGC-2, ENGP-1, SEC-1, QUAL-1 and every major and minor that names the core; the parts' third-round requests | D68-D76; §P (one line per finding), §N.2 (one line per change), §Q.8 (the parts' requests) | every track |
| **rev 4** round-2 review (the round-1 ids re-sent, CRIT1 … CRIT20) | the browser zone-table shape, the calling-window shape and the shopper-promise flag, the report-link renderers, the frozen-types file, `estimateAlpha` at P0, the R1 scripts and the later-release script list, the proof maps, the committed e2e steps, the `WriteCtx` overloads, the slot 4c rule, the parts' fourth-round notes | D56, D68, D71-D73, D76; §P round 2, §N.3, §Q.9 | every track |

---

## M. Publish-time quality contract (cross-cutting; D51, D52)

The design baseline measured today's output at 4.3/10 with distinctiveness 2/10 and found the root cause in the
pipeline, not in taste: the checklist runs only in the browser (`src/lib/editor/checklist.ts:69-227`), nothing
server-side refuses a 27-section, 170 KB page with a cloned hero, invented stats and a review slider without material
(design-baseline §4). Revision 2 makes the server the gate. The parts implement the rules (design.md owns the design
gates and the slop score, landing.md the honesty rules); this section fixes the registry, the codes, the budgets and
the behaviour every publish path shares.

### M.1 Registry and flow (`src/lib/render/prepublish.ts`, maintainer; DES-R3 + LAN Q13 merged)

```ts
export interface PrePublishCtx { scope: StoreScope; store: StoreRow; pageId: string; doc: PageDoc | StorePageDoc; prev: PageDoc | StorePageDoc | null; theme: BuiltTheme; assets: ReadonlyMap<string, AssetMeta>; actor: Actor; now: Date; mode: "block" | "warn" }
export interface GateItem { id: string /* "<track>:<rule>" e.g. "design:N1", "honesty:D2", "budget:F5" */; level: "hard" | "soft"; title: MessageKey; detail?: MessageKey; vars?: Record<string, string | number>; field?: string; sectionId?: string; fix?: { tab?: string; sectionId?: string; actionId?: string } }
export type PrePublishResult = { ok: true; notes?: GateItem[] } | { ok: false; code: "design_blocked" | "honesty_blocked" | "budget_blocked"; items: GateItem[] };
export function registerPrePublishCheck(name: string, fn: (ctx: PrePublishCtx) => Promise<PrePublishResult>): void;        // ≤ 400 ms each, pure over ctx
export function registerPublishListener(name: string, fn: (ctx: PrePublishCtx & { versionId: string; event: "published" | "unpublished" }) => Promise<void>): void;
export function runPrePublishChecks(ctx: PrePublishCtx): Promise<{ ok: true; notes: GateItem[] } | { ok: false; code: PrePublishResult extends { code: infer C } ? C : never; items: GateItem[] }>;
// track files: src/lib/render/prepublish/{design,landing,budget}.ts (P6, P3, core); imported by this file; R2 adds prepublish/storefront.ts (S1, STO-R25)
```

1. `publishPage` (T3, `src/lib/render/publish.server.ts`) renders the document first (it needs the HTML for the budget
   gate), then awaits `runPrePublishChecks(ctx)` **before** writing the version row. The first failing check's code
   wins in the order budget → honesty → design (a page that is too heavy is told so before its design is judged);
   every check still runs so the dialog lists everything at once.
2. A failure returns through `storeAction` as `{ ok: false, error: code, items }` (§E.2); the publish dialog renders
   one row per item with its fix (a deep link into the builder tab or section, or an action), never a toast, never a
   generic message. Items on owner-typed fields are listed as notes, never as refusals, **except honesty items of the
   proof classes** (rev 3, ENGP-8 / LAN R14: a stat, counter, rating, review count, stock figure, price, compare-at,
   savings or countdown an owner typed with no merchant source, a numeric conflict between two occurrences, and a claim
   that contradicts a set policy are refusals; an owner-typed numeral of class `fact` / `other` and a claim about an
   **unset** policy are notes with a one-tap attestation that writes `page.fact_attested`, LAN-§6.4). The `origin` map
   both design's `GateInput.origin` and landing's `LandingGateInputs.origin` read is built by **one** shared builder
   (`originFrom(prev, doc)` in `prepublish.ts`) over design's five classes **`OriginClass = "owner" | "library" |
   "engine" | "local" | "cloud"`** (rev 4, QUAL-1 / AI R44 / DES N3): it reads the **generation record** design stores
   on the draft's `chosen` genome row (`design_genomes.report.gen`: field path → `{ h: hash16, o: OriginClass }`, ≤ 600 B,
   DES-§9.8), whose `o` comes from ai's per-field `CopyOrigin` returned by `mergeAiCopy` v2 (AI-§A.3) and from the
   engine / library path for the rest; a field whose current text hash differs from `h` is `owner`, a field without a
   record is `library` (pre-rev-4 drafts); the wizard (P6) owns the call site of P7's `useNoveltyGuard({ check:
   checkHeadlinesAction })` and writes the record; a gate that needs only two classes may collapse `library` / `engine`
   / `local` / `cloud` to "generated" except where §M.4 distinguishes them. The create-from-directions path records the
   wizard's merchant facts through `recordFacts(scope, pageId, facts)` so the gate judges the facts the seller actually
   gave. Document types (rev 4, DES N4 / CRIT18, quoted verbatim from design): **`gateInputFor(doc: PageDoc |
   StorePageDoc, ctx: GateInputCtx): GateInput`** (pure, isomorphic, `src/lib/design/gate-input.ts`) and
   **`gateCtxFrom(ctx: PrePublishCtx): Promise<GateInputCtx>`** (server-only, `src/lib/render/prepublish/design.ts`,
   P6; it resolves the kind, the store theme and look, the origin through `originFrom`, the facts and the proof data);
   which gates run per kind is **"the design gates of `KIND_GATES` (DES-§8.13)"**, beside the core's budget profile for
   the kind and landing's / storefront's own items; utility kinds (`product`, `collection`, `search`, `cart`,
   `checkout`, `not_found`, `policy`) are never pooled or novelty-checked, and only `landing`, `home` and `page` enter
   `design_genomes` (rev 3 ENGP-1).
3. **`mode`**: `platform_design.gatesAtPublish` (design items) and the ops flag `design_publish_gates` default to
   `block`; `warn` turns hard items into notes, publishes, and audits `page.publish.design_override` /
   `page.publish.budget_override` with the items. Honesty items have **no warn mode**.
4. Listeners run after the commit and never fail the publish: a failure is an `error_events` row (area `publish`) and
   the owning job repairs the state (`design.backfill` for genomes and shingles). Registered listeners in R1: design
   (`published` genome row + live flip + `syncShingles`), landing (kit "page changed since" via `offers_hash`,
   `markHealthDirty`), ai (`recordPublishFeedback`, AI R22: **the one caller**; rev 2.1 removes the duplicate mention
   under landing, LAN N1).
5. Re-renders (§H.3) run the checks in `warn` mode and store the notes; exports (ZIP, PHP, connected, WhatsApp) run
   them in `block` mode like a publish (an export is a publish to someone else's server).
6. `preview` never gates; the builder shows the same items live through `buildChecklist(doc, LandingCheckContext)`
   (LAN Q15) so a seller rarely meets the server refusal.

### M.2 Budget gates (`src/lib/render/prepublish/budget.ts`, core; design-baseline §5 C2, C3, F1, F5; D52)

| Gate | Soft (note, lowers Q) | Hard (`budget_blocked`) | Measured by |
|---|---|---|---|
| `budget:F5` page weight | HTML > 90 KB gz; > 16 `<picture>` (control arm only, ENGP-18) ; > 2 font families or > 4 font files | **HTML > 140 KB gz** | gzip of the rendered document (`renderAndCommit` output) |
| `budget:C3` length | > 14 in-flow sections or estimated mobile height > 12,000 px at 390; **estimated height > 15,000 px but ≤ 18,750 px** = a soft `estimated` note (rev 3) | **> 16 sections (exact) or estimated height × 0.8 > 15,000 px** (i.e. > 18,750 px estimated; rev 3, ENGP-6) | the design height model (`src/lib/design/heights.ts`, DES-§5.3; accepted error 0.8-1.25), no browser needed |
| `budget:F1` form position | order form starts below 3,000 px at 390 (screen > 4); **estimated top > 3,000 px but ≤ 3,750 px** = a soft `estimated` note (rev 4, LAN N3: the form's **height** is one item only, P3's `form:F1`, so this row measures the position alone) | **form not present on a landing page with an offer; estimated top × 0.8 > 3,000 px** (rev 3) | height model |
| `budget:C2` fold contract | **the lowest fold item's estimated top in 760-938 px** (the band of the ±10 % fold error) = a soft `estimated` note (rev 3) | **product image, price, primary CTA or the COD line with an estimated top × 0.9 > 844 px at 390 × 844 for the chosen hero family** (i.e. > 938 px; the only server viewport; 360 × 740 is a Playwright-only soft check) | the hero family's declared fold layout through the height model's `FoldReport` (DES-§5.2, §5.12); **the server decides from the model alone, Playwright in `qa:publish-gates` is the calibration check, never the measurer** (rev 3) |
| `budget:R1` CTA count | > 6 primary CTAs (sticky bar counts as 1) | **> 8** | DOM count on the rendered HTML, control arm only (ENGP-18) |
| `budget:R4`, `budget:R5` | > 2 glass surfaces outside nav/sticky; > 60 reveal nodes | **> 4 glass; > 120 reveals** | CSS / DOM count, control arm only for R5 |
| `budget:K2` | > 2 full-bleed accent/pop moments | **> 4** | section variant features (DES-§8.4) |
| `budget:I1` | the same photo > 3 times (sticky and form thumbnail excluded) | **> 4** | asset id count in the doc, control arm only |

Thresholds **and the two band constants (`HEIGHT_BAND = 0.8`, `FOLD_BAND = 0.9`)** are code constants in
`src/lib/render/prepublish/budget-limits.ts` with the baseline value next to each (170 KB, 27 sections, 26.5-31.8k
px, form on screen 14-17), so a future owner can see what they replaced; the design corpus (§J.3) asserts that the
keep-list pages pass and the worst baseline page fails, and `test:prepublish` reads its height fixtures from the
committed `src/lib/design/calibration/heights.json` (P6), never from the git-ignored `qa/saas-baseline/index.json`.
Every note inside a band carries `vars.estimated = 1` and its message says "estimated" (ar/fr/en). Elements inside a
non-control in-page experiment arm (`[data-xa]` whose key is not `.a`, R3) are excluded from the F5 picture count and
from R1 / R5 / I1: each arm is gated as its own document (rev 3, ENGP-18 / LAN R15).

**Measurement (rev 2.1, DES-R19).** The gate measures with design's two frozen P0 stubs and nothing else:
`estimateHeights(ctx.doc, { look: ctx.doc.theme.look ?? null, locale, features: variantFeatures })` returns the
`HeightReport` (`total`, `inFlow`, `formTop`, `formHeight`, `fold: FoldReport`) the rows C3, F1 and C2 read, and
`variantFeatures(type, variant, data)` supplies the CTA, glass, reveal, fixed-layer and photo counts of rows R1, R4, R5,
K2 and I1 (DS33: one data source for the design, budget and health computations). Store sections (R2) enter the same
model through their registry `features.h` (STO-§6.1). While a report carries `stub: true` (before P6 merges, §K.2 P0
stub rule) **every row** (C2, C3, F1 and also F5, R1, R4, R5, K2, I1) is measured and classified but emitted as a note
with `vars.stub = 1` (§K.2 maintainer build note item 5, P0 review G4: today's engine output is the baseline these rows
were written against, and the plans that bring a page under them are P6's); every row is hard from the P6 merge on,
when `test:prepublish` enables the calibration fixtures. If the lead rejects build note item 5, `budgetResult`
(`src/lib/render/prepublish/budget.ts`) softens only C2, C3 and F1 and this paragraph returns to that wording.

**Per-kind profiles (rev 2.1, D66, STO-R25).** One registry, several thresholds:

```ts
// src/lib/render/prepublish/budget.ts (core)
export type PageKind = (typeof pages.kind.enumValues)[number];            // 'landing' | 'home' | 'product' | 'collection' | 'page' | 'policy' | 'search' | 'cart' | 'checkout' | 'not_found' (§D.2, 0004)
export interface BudgetProfile {
  sections: { soft: number; hard: number }; heightPx: { soft: number; hard: number };
  formTopPx: { soft: number; hard: number | null } | null;                // null = the kind has no order form (F1 not evaluated)
  ctas: { soft: number; hard: number }; glass: { soft: number; hard: number }; reveals: { soft: number; hard: number };
  photoReuse: { soft: number; hard: number }; htmlGz: { soft: number; hard: number };
  fold: "hero-family" | "kind-layout" | "none";                           // C2 source: the landing hero family's fold, the store kind's FoldLayout (STO-§9.5), or skipped
}
export function registerBudgetProfile(kind: Exclude<PageKind, "landing">, profile: BudgetProfile): void;   // called from a track's prepublish/<track>.ts; second registration of a kind throws at boot
export const LANDING_PROFILE: BudgetProfile;                               // = the table above, from budget-limits.ts; never re-registered
```

The gate picks the profile from the document's kind (`StorePageDoc.kind`, else `landing`). Every `hard` value is
**clamped to the D52 ceilings** at registration (140 KB gz, 16 sections, 15,000 px, 8 CTAs, 4 glass, 120 reveals, 4
photo repeats): a profile may only tighten; a registration that tries to exceed a ceiling fails `test:prepublish`. R1
registers nothing; the R2 contract step registers the STO-§6.1 table from `src/lib/render/prepublish/storefront.ts`
(`home` / `page` 12 sections, 12,000 px, 140 KB; `product` 16, 15,000, 140 KB, 4 CTAs, 0 glass, 0 reveals; `collection`
4 + grid, 12,000, 140 KB; `search` / `not_found` / `cart` / `checkout` 45 KB, 0 glass, 0 reveals). Items keep their
`budget:*` ids whatever the kind, so one message set covers every document.

### M.3 Honesty gates (`src/lib/render/prepublish/landing.ts`, P3; design-baseline §5 I4, D1, D2; LP-02, LP-21; always hard)

`honesty_blocked` with the field named: a numeric claim that resolves to no merchant field or contradicts another
occurrence (D1 `allowedNumbers`); any stat, counter, rating or review rendered from library data instead of merchant
data (D2; `aggregateRating` never emitted, §C.8); `beforeAfter` without two distinct merchant images, `video` without a
file or URL, `gallery` / `ugc` / `lookbook` with fewer than 3 distinct assets, photo credits not merchant-typed (I4);
hotspots without merchant-placed anchors (I5); a countdown without a merchant-set end date, an ended countdown, a stock
figure the owner did not type (LP-21); sample proof content still marked `sample` without an attestation
(`page.proof_attested`, LAN-§6.1); a delivery fee, ETA or promise not present in `delivery_zones`, `policies`, the
`store.confirmation` block or `ops.callingWindow` (the fee line is **absent**, never invented, when zones are empty; the
calling-hours promise reads the one window, D73, and is a fact only when `shopperPromiseAllowed(w)`; rev 4, OD63: a
call-time claim while the window is not configured is treated like a claim about an unset policy, a note whose one-tap
fix is "Use these hours", and a claim that contradicts a configured window is refused); **`honesty:password_field`** (rev 3, D76 /
SEC-18): any `<input type="password">`, card-number pattern or OTP field on a landing or store page (never legitimate on
a COD page; P3 exports the field-pattern list and the storefront's `storefront:form_field_foreign` imports it, so both
refuse exactly the same fields). Exports
and the PHP template pass the same checks because they publish the same document; store documents pass the landing
honesty items through `landingGateItems` on the eligible landing sections only, with the facts of the bound product
(LAN-§3.2.1).

### M.4 Design gates (`src/lib/render/prepublish/design.ts`, P6; design.md DES-§8; design-baseline §5 N1, N2, N8 and the hard rows of C, T, K, I, R, RTL)

`design_blocked` with items from `runGates({ context: "publish" })`: the owner rules first (no orange: hue 25-75° with
chroma > 0.06 anywhere in the compiled theme or a section's declared colour mix; AA contrast; RTL hard gates RTL1-RTL7;
Arabic type hard rules T1-T3, T7, T8), then the **clone block (rev 3 wording, DES-R24 / QUAL-1, QUAL-3, QUAL-4)**:
genome distance `d < τ_niche(n)` against any live store in the niche (`τ_niche` = 0.40 at ≤ 20 stores falling to 0.30
at ≥ 100, never below the platform threshold + 0.05, DES-§7.9) or `d < 0.25` platform-wide (N1), **except the verified
exhaustion path of DES-§7.9 step 4** (rev 4, DES N2 / UX-24): when only the niche band is `too_close` and ≤ 6
deterministic server-side `differentiate` resamples find no variant clearing `τ_niche(n)`, the niche item is a soft
note (`vars.fallback = 1`); the platform band (`d < 0.25`) and the clone flag (`d < 0.12`) stay hard whatever the niche; `d_page < 0.30` against
the store's last **5 published pages of the same product** (N2; other pages of the store give the soft `pages_close`
note); a headline 3-gram shingle share > 25 % in the niche **on a generated line** (N8: hard when the line's origin is
`cloud`, `local` or `engine` — the compositional generator — and **soft** when it is `owner`-typed, per rule 2 of §M.1,
or a copy-library fallback line, whose shared wording is by construction and whose share the library sweep keeps ≤ 10 %
per skeleton; STO-R39's "owner-typed hard" is not adopted, §P); D3 (FAQ register) likewise hard on generated text only;
then the structural hard rows (C5 one opener > 70 %, K4 pop derivation, K5 nested cards, I2 focal outside the inner
80 %, I3 cutout without alpha (an `estimated` cutout counts as alpha for the sampler's H13 / H27 decisions, UX-39; the
doc renders `framed-stage` until the mask lands, so the publish gate never sees a cut-out without alpha), I6 resolution, R2 offer duplication, R3
trust/urgency duplication, R6 radius ladder, R7 floating layers, slop score ≥ 6). Utility store kinds run none of the
novelty rows (the design gates of `KIND_GATES`, DES-§8.13). The corpus test "30 engine-only stores in one niche publish with 0 `design:N8` refusals"
(`test:slow`) pins the library rule. Soft rows lower Q and appear as notes and as Store Health design issues (§I.7). The
novelty check answers bands only (D64).

### M.5 What the seller sees

Every item has a title in ar/fr/en (`test:i18n-coverage`), says what was found with the measured value ("page height
15,400 px at 390 · limit 15,000"), and offers one fix (open the section, remove the duplicate, add the delivery zones,
attest the proof). The checklist panel in the builder shows the same items with the same ids, so the publish dialog is
never the first time an item appears. Nothing here is advisory: a hard item means the page does not go live.

---

## N. Elevation changes (rev 2)

Every change of this revision, what it does and where it came from. Codes: **D** = §0 decision, **R** = request id of
a part spec (decided in §Q), **RA** = rethink-ai section, **RF** = rethink-features section, **DB** = design-baseline
target.

| # | Change | Why | Source |
|---|---|---|---|
| 1 | Status → revision 2; inputs widened to the baseline, the two rethinks and the anti-slop rubric; frozen contracts restated with the one additive PageDoc change (`ThemeSpec.look`, optional, no default) | brief item 16; the frozen set must be explicit before the gates reference it | header; DES-R1 |
| 2 | D51 one publish-time gate registry (`prepublish.ts`, checks + listeners, typed refusal codes with `items`) and the whole of §M | the server never refused what the owner rules forbid; two parts asked for two registries | DES-R3, LAN Q13, DB §4 |
| 3 | D52 page budgets as hard gates (140 KB gz, 15,000 px / 16 sections, form ≤ 3,000 px, fold contract) | measured baseline: 170 KB, 27 sections, form on screen 14-17 | DB C2, C3, F1, F5 |
| 4 | D53 one `store_health` table for both audiences; §I.7 engine with per-track rules, group caps summing to 100, snoozes, `health.snooze`, `platform.health` job in slot 9; the setup checklist removed | PL-18 raised to a tenant feature; one number, one computation | RF §1.3, §3.2; PLA Q.1, Q.18 |
| 5 | D54 test-order mode as a core flag (`orders.is_test`, `leads.is_test`, token, test render, exclusions everywhere, lint L12) | the owner's test orders hit risk ≥ 70 and poison stats today; the demo needs it | RF §3.1 SF-05; LAN Q21; OPE Q.12 |
| 6 | D55 per-class model matrix in `platform_ai.classes`; `platform_ai_secret`; retention notice; D40 unchanged | one id cannot be both fast and strongest; cache and fallback facts differ per model | RA §0.5, §2.3, §9.2-4, §9.13; AI R6 |
| 7 | D56 the job model under the 120 s cap: `ai_jobs`, `after()` + heartbeat + poll + orphan recovery, Batches fallback, the detached-promise probe; §H.12; slots 4b/4c | Fable 5.1 runs for minutes; a request cannot | RA §1.5, §9.6; AI R2, R8 |
| 8 | D57 pulse ETag + shared poller; `StorePulse` frozen; contributors registry; `pulse` cache row | 15 s polling must stay cheap on one process | RF §2.2, §3.4; PLA Q.14 |
| 9 | D58 mSPRT Fair test; experiments tables refined; `experiment_exposures` | sellers peek every day; the method must allow it | RF §1.8, §3.4; LAN Q32 |
| 10 | D59 no model download on the critical path (onboarding ranks from category + palette + keywords) | 99.5 + 111 MB on 4G is 1-3 minutes | RF §3.4, §4 |
| 11 | D60 no bounce in today's shell (two sites named), aurora/grain budget one per screen, sparkline ≥ 7 points, `--ui-spring` removed, `--info` token added, IBM Plex Sans Arabic, `test:admin-motion` / `test:admin-rtl` | owner rule "maximally modern, never generic"; the admin had the tells | RF §2.1, §2.5, §2.6; OPE Q.16; DES-R2, R17 |
| 12 | D61 hierarchical Beta reward; `gene_stats_*` columns | a fixed mix treats 5 observations like 5,000 | RA §3.2, §9.7 |
| 13 | D62 runtime add-on hook (`addons`, hash CSP, build, budgets 34,800 / 12,600, store chunk keys, `css` key); §H.13 | new shopper behaviour without touching the 24.2 KB chunk | LAN Q3, Q5, Q30; STO-R13; DES-R5 |
| 14 | D63 Campaign Kit and Profit lite in R1: `campaigns`, `short_links`, `page_slug_history`, `product_costs`, `carrier_rates`, `ad_spend_daily`, `profit_alerts` in 0005; `/go` R1; flag `finance_lite`; `campaigns.write`, `finance.*` R1 | the R1 unit of work and the question every COD seller asks | RF §1.1, §1.4, §3.1; LAN Q1, Q6, Q7; OPE Q.3, Q.5 |
| 15 | D64 allowlisted cross-store readers (`ai/platform`, design novelty, health) with pinned counts; verdict bands only | the AI console and the novelty pool are not platform code by directory | AI R7; DES-R9, R17 |
| 16 | Owner summary items 16-19 | the owner reads this first | brief item 16 |
| 17 | §A.2 mode-switch safeguards (`landing.inStoreMode`, `landingModeSwitchPlan`, `ensureTemplateSet`) | ad traffic must not 404 after a mode change | LAN Q34; STO-R17 |
| 18 | §A.3 new keys `ai.assist`, `campaigns.write`, `health.snooze`, `coupons.manage`, `experiments.manage`; `shipments.write` / `finance.*` R1; platform `stores.create`, `orders.lookup`, `abuse.handle`; matrix rows | missing keys are CCRs; better to pre-define | AI R19; STO-R21; LAN Q29; OPE Q.3; PLA Q.5 |
| 19 | §A.4 `coupons`, `reviews`, `campaigns_max`, `short_links_max`; `ai_credits_day` with `period varchar(10)`; `chargeUsage` `allowOver` + `limit`; `chargePlatformUsage`; `products` gauge rule | atomic daily AI cap; honest ledger on reconcile | AI R3, R4; STO-R20, R21 |
| 20 | §A.5 `transitionStore` sends exactly one notification with named kinds, marks health dirty, releases leases, ensures templates; pending caps from the platform setting; `ai_credits_month` pending cap | one notification per transition; the owner tunes the sandbox without a deploy | PLA Q.27, Q.8; AI R5 |
| 21 | §B.1 `/invite/staff/<token>`, `/kit/<token>`, the manifest path, the `__Host-sgd` device marker; §B.2 widened `scoreSignup` and `autoApprove`; §B.4 agent landing path; §B.7 `stepUpUntil`; §B.8 impersonation rules; §B.10 templates | staff must not own a sandbox store; the duplicate signal needs a producer | PLA Q.3, Q.4, Q.9, Q.26, Q.31, Q.32; OPE Q.13 |
| 22 | §C.3 areas `kit`, `api-v1`, manifest rule; Worker 404 list; §C.4 route rows (wa, store APIs, exp, chain, v1); §C.4.1 `/go` R1, slug-history 308, test render, `[...rest]`, locale-prefix slugs, `@` template slugs; §C.7 `platform.reservedHandles`; §C.8 no `aggregateRating` | new public surfaces must be in the header and attack suites | LAN Q12, Q14, Q22; STO-R10, R14; OPE Q.19; PLA Q.30 |
| 23 | §D.2 column additions (orders 0005/0006/0007, leads 0005/0006, page_versions 0005/0006/0007, pages 0006/0007, users, stats_daily, store_usage) incl. provenance columns `generation_source` / `critic_picks` | KPIs, queue, cash held and Sheets need columns, not event scans; provenance for "which AI wrote this" | OPE Q.1, Q.10, Q.12; LAN Q2, Q4, Q21, Q32; STO-R2, R6, R8, R9, R11; AI R3; RA §9.16 |
| 24 | §D.3 registry rows for 15 new or moved tables; §D.4 flag declarations in code + `FlagRule`; the 0004 refinements of platform.md applied | tables need owners and migrations before P0 | PLA Q.1, Q.2, Q.4, Q.16, Q.20-22, Q.24; AI R2, R20; LAN Q1, Q6, Q7, Q32; OPE Q.4, Q.5, Q.15; STO-R4, R5 |
| 25 | §D.5 Drizzle blocks for `store_health`, `platform_requests`, `staff_invites`, `campaigns`, `short_links`, `page_slug_history`, `integration_status`, `profit_alerts`, `ai_jobs`; `customers.test_count`, `cu_phone_idx`; §D.6 rows for every R2/R3 addition and refinement | the maintainer cuts 0005-0007 from these lists | as above; DES-R10; OPE Q.10, Q.25 |
| 26 | §D.7 `allowOver`, daily counter, gauge sources; §D.8 three guarded type changes, the rename, conversion steps for `store_ai` and `brand.logo`, StorePageDoc boot validation; §D.9 owners | migrations stay idempotent and portable | AI R4, R16; DES-R16; STO-R3 |
| 27 | §D.10 keys `onboarding`, `landing`, `accounting` lite, `platform_ai_secret`, `platform_design`, `platform_push`, `sheets_sa`, `whatsapp_cloud`, `feeds`; `platform_ai` rewritten per class; `store`, `brand`, `checkout`, `ops` rows refined; `brand.voiceSummary` derived; `platform` paths frozen | one source of truth per setting | PLA Q.7, Q.28; LAN Q9, Q10; OPE Q.3; AI R6, R24; DES-R8, R16; STO-R16 |
| 28 | §E.1 `stepUpUntil`; §E.2 typed refusal codes, `busy`, `job_queued`, new resolvers, `mintPreviewToken`; §E.3 allowlist; §E.6 render cache window id, `getOrLoad`, new caches; §E.8 ~20 new buckets | the seam is frozen in R1.0, so every signature must exist now | PLA Q.6, Q.32; STO-R1, R7, R24; LAN Q11, Q37; OPE Q.11, Q.21; AI R11 |
| 29 | §F.1 L11, L12, tenancy-cases import, pinned counts; §F.2 verdict bands; §F.5 ~120 audit action names; §F.6 header rows; §F.9 export and purge additions; §G.7 `receipts` and `ai` areas | completeness of isolation, audit and portability | STO-R2, R22; DES-R9, R13, R15, R17; PLA Q.23; OPE Q.14, Q.20, Q.23; AI R10, R17; LAN Q23, Q35 |
| 30 | §H.1 `push` kind, CAPI stale margin, test-order exclusion; §H.2 tick table rewritten with every registered job in slots summing to 95 s + 5 s leftover; §H.3 reasons `store_info`, `conversions`, `brand` R1, `reviews`, the `product` exception, `purchaseInBrowser`; §H.4 boot seeds (legal from code, flags, prompt versions); §H.5 health sections and alarms; §H.7 key fallback; §H.8 batch stop; §H.11 retention rows | one runner, explicit budgets; every async behaviour named | PLA Q.13, Q.16, Q.18, Q.21, Q.25; OPE Q.6, Q.11, Q.22, Q.24; LAN Q8, Q24, Q36; AI R8, R9, R18, R25; DES-R4, R12 |
| 31 | §I.1 routes (welcome, links, campaigns, finance lite, queue board, team agents, API rows); §I.2 console routes and the trimmed PL-07; §I.3 nav groups, commands and search extension points, chords; §I.4 pulse, notifications registry, health ring, address card, Today brief, publish refusals; §I.5 coverage test and RTL lint; §I.8 the admin UX ceiling and the 13-screen order | the admin must reach the Linear/Vercel/Stripe bar in testable rules | RF §2; PLA Q.12, Q.14, Q.15, Q.17, Q.29; LAN Q18, Q19; OPE Q.9, Q.13, Q.17 |
| 32 | §J new offline, DB and e2e scripts incl. `qa:wow-demo`, `qa:publish-gates`, `test:prepublish`, `test:health`, `test:pulse`, `test:test-orders`, `test:kit`, `test:profit`, `test:ai`, `test:design`; render-check add-on and checksum assertions; `gate:r1` | every new contract has a test that fails when it breaks | RF §4; STO-R13; DES-R7; AI R21; §M |
| 33 | §K.1 C0 skeletons (prepublish, pulse, notify, flags, health, commands, search), the render hook, preview tokens, test plumbing, checklist context, the frozen cross-track signatures; T2/T3/T4 rows adjusted | tracks can only build against frozen seams | PLA Q.3, Q.6, Q.11, Q.19; LAN Q3, Q15, Q21, Q22; OPE Q.7, Q.9; DES-R1 |
| 34 | §K.2 P0 stub list per track; eight track rows rewritten with the rev 2 feature ids and files; SF-* ownership paragraph (+1-2 engineer-weeks absorbed, no ninth track); merge order with P3 wave 2 after P6; twelve exit criteria incl. the wow demo | R1 stays shippable with the raises paid by the cuts | RF §3.3, §4; PLA Q.12; LAN Q16, Q19, Q33; OPE Q.9, Q.17; AI R1, R15; DES-R2 |
| 35 | §K.3 shared files and extension points extended; §K.4 R2 contract step and S rows (STO-R12, R18, R19, LAN Q24-Q26, DES-R6, R14, deep pass); §K.5 R3 contract step (experiments, config v3, api-v1, push, chain) | later releases inherit explicit contracts, not open questions | STO-R12, R18, R19; LAN Q24-Q28, Q38; OPE Q.18, Q.19; DES-R6, R14; PLA Q.21 |
| 36 | §L.2 rows for every raised, cut or added id; SF-01 … SF-12 rows; §L.3 traceability of the 17 rethink-ai changes, the rethink-features deltas and the cross-cutting baseline targets | brief item 16 asked that nothing be lost between research and build | RA §9; RF §3; DB §5 |
| 37 | §Q appendix: 161 requests decided (0 rejected outright, 7 accepted with changes, the rest accepted) | the part specs asked; the core answers once | all six part specs |

### N.1 Revision 2.1 changes (second round integrated)

Every change of revision 2.1, made after the six part specs reached revision 2. Codes as above; **R2nd** = a
second-round request or note decided in §Q.7; **core** = an inconsistency this revision found between the body and a
part and fixed in the body.

| # | Change | Why | Source |
|---|---|---|---|
| 2.1-1 | Status → revision 2.1; header names the second round (§Q.7, §N.1) and the re-verified code facts at `ae4e6c0` | the parts are at revision 2 and asked eight unavoidable things; the core answers once more | all six part specs |
| 2.1-2 | D65 `ActionErrorCode` open tail with the `error.<code>` i18n rule; §E.2 lists the core codes and the nine platform codes | PLA-§Q.1 note 1: closing the union at P0 would turn every part-level code into a CCR | R2nd PLA N1 |
| 2.1-3 | D66 per-kind budget profiles: `registerBudgetProfile`, `BudgetProfile`, `LANDING_PROFILE`, clamping to the D52 ceilings; §M.2 measurement paragraph on the two design stubs; the stub rule (C2/C3/F1 as notes while `stub: true`) | one registry for landing and store documents; the budget gates merge before P6 and must compile and run | R2nd STO-R25, DES-R19 |
| 2.1-4 | D67 one i18n file per track; §I.5 ownership paragraph; P1 `console.ts` + `notify.ts` (platform kinds only), P2 six files, every other track one file; `health.<track>.<rule>.*` and `notify.<kind>.*` live with their owner | platform.md and the P2 row both claimed `health.ts`, and P2's `src/lib/i18n/**` glob covered every track's file | core (K.3 rule) |
| 2.1-5 | §A.3.1 `integrations.manage` names replay; §E.8 `s:<sid>:replay:<uid>` 30/h; §F.5 `integrations.outbox.replayed` (R1), `finance.period_closed` / `finance.period_reopened` (R2) | OD40 store-side replay and OD41 period lock need an audited action and a bucket | R2nd OPE Q.26 |
| 2.1-6 | §B.8 `addImpersonationNoteAction` seam behaviour (platformAction from a tenant route: `forbidden` / `not_found`), §F.1 attack cases for it, for cross-store `replay` and for a mismatched budget profile | PLA-§Q.1 note 2 asked that the behaviour be pinned | R2nd PLA N2 |
| 2.1-7 | §C.4.1 `/go/<code>` 308 with `Cache-Control: private, no-store`; §F.6 redirect row; `qa:headers` asserts it and the `/track`, `/kit`, test-render sets | a short link's target may change; the header suite must know the one non-canonical 308 | R2nd LAN N3 |
| 2.1-8 | §F.5 storefront list trimmed: `store.landing.attached` / `store.landing.detached` dropped, landing's `page.attached` / `page.detached` carry `{ productId }` | one audit name per event | R2nd STO-R27 |
| 2.1-9 | §H.13 and §K.5: `store-page` 41,000 (R2) → 43,000 (R3 contract step, with `exp-head` + `exp`); **superseded in rev 3** by the derived cap (42,500, §N.2 3-35) | the worst PDP measures ≈ 40,650 B; the two R3 chunks push it over | R2nd STO-R26 |
| 2.1-10 | §I.4 `StorePulse.jobs` producer `aiJobsForPulse(scope, viewer, since)` with the `?since=` clamp and the stub; §K.2 P0 ai stubs; `test:ai-db` and `qa:pulse-e2e` assertions | the field was frozen with no named producer and P2 merges before P7 | R2nd AI R26 |
| 2.1-11 | §I.7 file placement: `src/lib/health/{engine,inputs,platform-flags}.ts`, `rules/platform.ts`, `selftest.ts` P1; `computeHealth` in `src/lib/platform/health-score.ts`; registry import lines pre-written at P0; `requestHealthRecompute` added to the API and the P0 list | platform.md's PLA-§P.1 and the P1 row disagreed on who writes the registry's import lines | core; PLA-§6.3 |
| 2.1-12 | §K.2 P0: `opsAggregates` / `attemptStats` (P4), `etaText` / `etaWindowText` / `codInvariants` (P3), `requestHealthRecompute` (P1), `aiJobsForPulse` (P7), `estimateHeights` / `variantFeatures` + frozen types (P6); the extension-file list now spelled out incl. `scripts/qa/wow-demo/steps/<track>.ts` | every cross-track call the revision-2 parts added must exist as a stub before the tracks start | R2nd DES-R19, AI R26, LAN N2; OPE-§27.6, LAN-§3.7, PLA-§6.3 |
| 2.1-13 | §K.2 track rows: P1 (health engine files, `platform-check`, `refresh-disposable`, demo steps, `tenancy-cases/platform.ts`), P2 (`health-actions.ts`, app icons, narrowed i18n, demo steps, perf steps), P3 (fixtures, selftests, demo steps), P4 (`tenancy-cases/ops.ts`, `finance.ts` keys, aggregates files), P5 (`tenancy-cases/integrations.ts`, `deliveries.ts`), P6 (the seven primitives, DES-R18), P7 (`tenancy-cases/ai.ts`, `jobs/pulse.ts`, DES-R20 confirmed with `GuardContext.kickers`) | the revision-2 parts named new files inside and outside their folders; each is now in exactly one row | R2nd DES-R18, DES-R20; PLA-§P, LAN-§26.1, OPE-§P, AI-§R.1, DES-§26 |
| 2.1-14 | §K.3: `prepublish/{budget,budget-limits}.ts` and the frozen shapes of `src/lib/design/types.ts` named as shared; `scripts/qa/wow-demo/steps/<track>.ts` and `registerBudgetProfile` as extension points; the four overlaps fixed named | tracks never edit a shared file; the list must be complete | core |
| 2.1-15 | §K.4: contract step adds the storefront prepublish import, the profile registrations, the four frozen `src/storefront/*` files and `etaText` / `etaWindowText` in the STO-R19 list; S1 row gains the landing parts it takes over (LAN-§26.2 = STO-§27.2), its routes, admin folders and every extension file | the R2 ownership was coarse where two parts had already agreed on exact files | R2nd STO-R25, LAN N2; STO-§27, LAN-§26.2 |
| 2.1-16 | §H.2: storefront R2 jobs placed (`catalog.stock_reconcile` 02:20, `catalog.collections` 02:30, `catalog.bestsellers` 03:40; R3 `stock.holds_expire` 1 s in slot 7) | the spread rule (≤ 2 daily jobs per tick) needs times, which the part left open | core; STO-§27.2 |
| 2.1-17 | §J: `test:honesty`, `test:cod-invariants` (P3), `test:platform` (P1), `qa:admin-perf` (P2); the demo-step folder in `qa:wow-demo`; new assertions in `qa:headers`, `test:ai-db`, `qa:pulse-e2e` | every new contract has a test that fails when it breaks | R2nd LAN N3, AI R26; LAN-§25, PLA-§O |
| 2.1-18 | §M.1 rule 4: `recordPublishFeedback` has one caller (ai); the track-file comment names `prepublish/storefront.ts` (R2) | LAN N1 found the duplicate | R2nd LAN N1, STO-R25 |
| 2.1-19 | §L.3 eight rows for the second round and the reconciliation; §Q.7 the appendix of second-round decisions and maintainer notes; §Q's closing paragraph | traceability: nothing asked in the second round is left without a decision and a place | all six part specs |

### N.2 Revision 3 changes (round-1 review integrated)

Every change of revision 3, made after the six reviewer passes (OPS, ENGC, ENGP, UX, SEC, QUAL) and the six parts'
revision 3. Codes as above; the finding ids are the reviewers'; **part** = a third-round request of a part (§Q.8).

| # | Change | Why | Source |
|---|---|---|---|
| 3-1 | Status → revision 3; the freeze rule for the landing chunk (re-measure, tolerance 0, sha256 pin, re-freeze in §P if needed); owner summary item 20; reading order adds §P | the chunk was "frozen" with a +5 % tolerance and four modules each deriving the prefix | ENGC-10, ENGP-26 |
| 3-2 | D68 one canonical `CityKey` slug; `delivery_zones.cities` slugs; `zoneLineFor` / `zoneForCity` take `CityKey \| null`; `cityKey` pure and isomorphic; the shared parity fixture | two incompatible keys: no city would ever have matched a zone | OPS-1 (blocker); part STO-R28, LAN R1, OPE Q.27e/f, PLA Q3.14 |
| 3-3 | D69 sandbox ceilings: Turnstile as a gate in `approval` / `open`, `pendingStoresPerDay` → waitlist, the shared `pending_media_bytes` budget, the two-tier media cap, the pending AI slice and 10-credit floor; `PlatformUsageMetric` + 3, `refundPlatformUsage`; §B.2 steps 2 and 6; §A.5.2; §G.4 step 4; §F.8; alarms | no sum cap on the sandbox: 1,000 bot sign-ups = 100 GB and the AI cap | SEC-1 (blocker), SEC-22; part PLA Q3.1/Q3.2, AI R28/R30 |
| 3-4 | D70 masking as a scope property: `scope.kind = "impersonation"` set by the seam, `maskIfImpersonation` at the repository boundary, the masked-canary attack case; §B.8, §A.3.1, §F.11 | support saw every customer's name and address in clear | SEC-5; part PLA Q3.3, OPE Q.27j, STO-R38 |
| 3-5 | D71 `WriteScope` / `ReadScope`; L6 by type; `platformScope()` not assignable; `test:permissions` type case | read-only rested on a JSDoc tag across ~225 call sites | ENGC-6, SEC-8 |
| 3-6 | D72 `createOrderRow` extracted by T3 in R1.0 and frozen at P0; `newOrderId` not exported; §K.1 T3, §K.4 "already extracted"; `create.ts` read-only afterwards | two insert pipelines in R1 | ENGC-13; part STO-R35, LAN R10, OPE Q.27d |
| 3-7 | D73 one calling window: `callingWindowFor` + pure helpers as P0 stubs (P4), ISO weekdays, `store.confirmation.hours` and `policies.contact.hours` removed, `CallingWindowEditor`; §D.10 rows `store`, `policies`, `ops` | three hours settings, two weekday conventions | OPS-11; part STO-R32, LAN R3, OPE Q.27e/k, PLA Q3.13 |
| 3-8 | D74 Sheets as the R1 carrier loop: `orders.tracking_ref` / `carrier_label` (0005), the IN-09 columns in R1, the Carrier CSV under `shipments.write`, `orders.carrier_exported`; §D.2, §A.3.1, §I.1, §L.2 IN-09 | a landing-only seller had no carrier loop in R1 | OPS-9; part OPE Q.27a, LAN R2, PLA Q3.15 |
| 3-9 | D75 LP-16 in the R2 contract step (`landing-v3`, config v3, zone shipping, `export:runtime_v3_unsupported`, `delivery:fee_mismatch`, `both`-mode default); §K.4, §K.5, §L.2 LP-16, §H.13 `landing-v3` | a `both` store quoted two fees for one city; flat fees cannot express Moroccan pricing | OPS-13; part STO-R31, LAN R4, PLA Q3.12 |
| 3-10 | D76 live brand protection: `checkBrandTerms` at every name write, `brand_protected`, `platform:brand_term_live`, `honesty:password_field`, `/report/<handle>` + `abuse_reports` in 0005; §C.7, §F.8, §M.3, §B.1, §C.3, §C.4, §D.3, §F.9, §L.2 PL-20 | brand checks ran only at signup; no abuse report before R3 | SEC-18; part PLA Q3.4, STO-R38, LAN R24 |
| 3-11 | `orders.is_test`, `leads.is_test`, `orders_store_test_idx`, `page_slug_history` cut in 0004; D54 and §D.2 / §D.3 / §D.4 / §D.5 / §D.8 / §K.1 updated | T3's R1.0 code wrote columns 0005 would create | ENGC-1 (blocker); part PLA Q3.7, LAN R8, OPE Q.27c, STO-R42 |
| 3-12 | Worker fetch with `cf: { cacheTtl: 0, cacheEverything: false }`, `CDN-Cache-Control: no-store` while `via = edge`, OS-12 keyed by effective host, the edge-sim cache case; §C.5, §C.9, §F.6, §J.3 | the subrequest cache key was the apex URL: one store's HTML could serve another | ENGC-2 (blocker) |
| 3-13 | `gateInputFor` and `KIND_GATES` named in §M.1; utility kinds never pooled; the P0 types widened at the R2 contract step; `FoldItem` widened additively; `test:prepublish` fixtures per kind; §M.4 | the gate registry had no `StorePageDoc` branch and identical utility templates would have collided on novelty | ENGP-1 (blocker); part STO-R29, LAN R11, DES-R27, AI R36 |
| 3-14 | §M.4 clone-block wording: `τ_niche(n)`, N2 on the same product's last 5 pages, N8 and D3 hard on generated lines only (soft for owner-typed and library lines), the 30-store corpus test | the library's three headlines per family would have blocked every engine-only store in a crowded niche | QUAL-1 (blocker), QUAL-3, QUAL-4; part DES-R24, STO-R39 (owner-typed part not adopted) |
| 3-15 | `aj_active_uq` on `(store_id, input_hash, active)`; `stage_attempts`, `driver`, `progress`; stage-resumable pattern B with three drivers; `maxDuration = 360`; flag `ai_detached_jobs`; slot 4c leftover budget; §D.5, §H.2, §H.12, D56 | a second identical job could never finish; `after()` is bounded by `maxDuration`; 1 s could advance nothing | ENGC-3 / ENGP-3, ENGC-18; part AI R27, R29 |
| 3-16 | `render_jobs.dedupe` cleared on claim; the enum gains `store_info`, `conversions`, `cutout`; `product` republishes `sync` for `prices` / `options` only; §D.5, §H.3 | a change mid-render was lost; the Drizzle enum lagged the text | ENGC-4, ENGP-28, UX-39; part DES-R22, STO-R41 |
| 3-17 | Lint: the tenant set = every table with a `store_id` column; L2 by provenance; L3b; L6 by type; L9 inline actions; L10 same-statement; L13 route handlers; derived route coverage; pinned count for `src/lib/platform/**`; §F.1, §J.5 | substring checks and `storeRef()`-only coverage left realistic leaks unlinted | ENGC-5, ENGC-7, ENGC-23, SEC-9 |
| 3-18 | Ownership: P2 carve-outs (`kit/**`, `report/**`, `team/{agents,callcenter}/**`), `settings/audit/**` → P2, `keys/platform.ts` → P1, `security/selftest.ts` → T3, `media/{process,assets,upload-slots}.ts` → P8 in R1 product, `public.ts` one owner per phase, `dev/fixture/design/**` → P6, the city-key fixture → P4, S1 owns the store route files whole, S4 owns the sheet's store branch, the v3 functions are S1's; `scripts/qa/ownership-check.ts` + `test:ownership`; §K.1, §K.2, §K.3, §K.4 | two overlaps, three unowned files and a parts' disagreement on who writes the v3 order functions | ENGC-8, ENGP-11, ENGC-27, ENGC-32, OPS-15; part PLA Q3.6, STO-R30/R36, LAN R6/R9, OPE Q.27g/h, DES-R25 |
| 3-19 | C0 split into C0a (minimal working seam) and C0b; T3/T4 rows carry their own deliverables; estimates 5-7 and 3-4 agent-days; `test:tenancy` from T4's week one; merge order; §K.1, §K.2 P0 | one two-day step with a throwing seam blocked the largest track | ENGC-9 |
| 3-20 | `rateLimit` deprecated overload at C0, removed at the R1.0 integration, L5 then; §E.8, §K.1 | the branded signature at C0 broke ~20 callers before any track ran | ENGC-28 |
| 3-21 | Tick: `platformLock("tick")`, `JobCtx.yield()` / `lagMs()`, render CPU cap 4 s, lag p95 and `skipped` in `job_runs`; lock pool of 2, one lock per job, the 10-connection budget in §H.7, `pool_wait` / `tick_lag` alarms; §H.2, §E.7, §H.5 | up to 100 s of CPU in the serving process, ticks could overlap, locks drained the 6-connection pool | ENGC-11, ENGC-12 |
| 3-22 | Sheets capacity ≈ 16 stores per tick stated, oldest-pending ordering, the backlog alarm scales; §H.2, §H.5 | the 15-minute alarm would have fired permanently past 16 active stores | ENGC-33 |
| 3-23 | `platform.health` budget-driven with measured staleness (≈ 10 stores per tick); §I.7, §H.2 | "≤ 200 stores per tick" was unreachable in 3 s | ENGC-25 |
| 3-24 | `DATA_DIR`: bounded walk vs `DATA_DIR_BUDGET_BYTES`, uid check skipped on win32, `.sg-owner` marker, the persistence probe in the R1.0 smoke, `[unverified]` until then; §G.2, §H.7, §H.10 | `statfs` and `getuid` were meaningless on Hostinger and crashed on Windows | ENGC-14 |
| 3-25 | Store rewrite without a trailing slash; two header sets for the proxy (404 vs redirect); `Referrer-Policy: same-origin` on action pages, `no-referrer` only on `/kit`; the manifest public; §C.3, §C.4, §B.1, §F.6 | `/s/<label>/` fell to the fallback 404; the proxy's 404 differed from the routes'; `no-referrer` 500s a pre-hydration form; a guarded manifest never installs | ENGC-15, ENGC-22, ENGC-16, ENGC-24, SEC-25 |
| 3-26 | `store_usage.period varchar(10)` and `commission_rule_ids` born right; two guarded type changes, not three; the batched `ALTER` form; §D.2, §D.4, §D.5, §D.6, §D.8 | avoidable `MODIFY` of a PK column and an in-migration rename; ~40 rebuilds on `orders` | ENGC-17, ENGC-34 |
| 3-27 | `getStoreSetting` opens `purpose_v = 0` rows with `openLegacy`; `test:migrate` asserts it; §D.10, §D.8 | store #1's secrets were unreadable until the background conversion finished | ENGC-19 |
| 3-28 | Idempotent `put`; `DATA_AREAS` registry; `ai/<storeId>` in the purge; purge enumerates from `schema.ts`; `preview_tokens` purged; §G.1, §G.7, §F.9, §H.9 | a crash between file and row blocked re-uploads for an hour; the purge order named a document; `ai` blobs survived a purge | ENGC-20, ENGC-31, SEC-21 |
| 3-29 | The stub rule's second lock (production build throws while `estimateHeights` is a stub); R1 product deploy = the integration deploy; §K.2 P0, §H.10 | intermediate deploys would have shipped the D52 hard gates as notes | ENGC-21 |
| 3-30 | `PLATFORM_URL` read at runtime (restart, not rebuild); `ADMIN_HOST` at the domain move (D44); the allowlist on `CF-Connecting-IP`; §C.10, §H.7, §B.7 | a false build-time claim forced rebuilds; the console shared the tenant origin; the allowlist failed closed behind Cloudflare | ENGC-26, SEC-2, SEC-14 |
| 3-31 | Handle derived from the store name at conversion, the one-time `freeRename` grant; §D.8 S1, §C.7 | the owner would have shared `/s/store-1/…` until P2 | ENGC-30 |
| 3-32 | Outbox re-send rule (`:r<n>`, `duplicates` surfaced, `replay` of `done` rows for webhook / telegram); §H.1 | deliberate re-sends were silently dropped | ENGC-29 |
| 3-33 | §M.2 calibrated bands for C2 / C3 / F1, the three fold zones, `HEIGHT_BAND` / `FOLD_BAND` constants, `heights.json` committed, Playwright as calibration only, arm wrappers excluded | hard refusals on a ±25 % estimate refused correct pages and passed wrong ones | ENGP-6; part DES-R23, STO-R34, LAN R13, R15 (ENGP-18) |
| 3-34 | §M.1 rule 2: honesty refusals only for proof classes, conflicts and contradicted policies; `page.fact_attested`; `recordFacts`; one `origin` builder | an owner-typed "3 couleurs" would have been refused | part LAN R14 (ENGP-8) |
| 3-35 | `render-check` as the maintainer's harness with `render-cases/<track>.ts`; `budgets.json.compositions`; `store-page` derived (41,000 → 42,500); `landing-v3` re-based; §H.13, §J.1, §K.3, §K.5 | three tracks would have serialised on one file; the `heaviest` list was hard-coded; 43,000 was hand-set | ENGP-12, ENGP-31 |
| 3-36 | `npm test` ≤ 3 minutes; `test:slow`; per-track shares; §J.1 | the offline suites summed to several minutes with no ceiling | ENGP-24; part PLA Q3.16, STO-R40, LAN R17, AI R39, DES-R26 |
| 3-37 | Edge classification fails closed on a present-but-wrong `x-sg-edge`; `x-sg-ts` freshness; `x-sg-worker` / `x-sg-proto` kept; `workerVersion` in `EffectiveHost`; §C.2, §C.3, §C.5, §H.5 | a key mismatch served the platform's login pages on every tenant hostname; the health panel could never read the Worker version | SEC-4, SEC-16 |
| 3-38 | `x-sg-path-sig`; only actions derive the store from the path; `__Host-sgd` set by the proxy; `__Host-sgl` and the `__Host-` rule; §C.3, §C.9, §B.1, §E.2 | an unsigned path header was the sole store authority; a page response cannot set a cookie | SEC-3, SEC-12, SEC-13 (part PLA Q3.5) |
| 3-39 | Document CSP never carries a bare `'self'` on any host class; the proxy drops Cookie for store areas on the platform host; the pixel allow-list frozen; the P-mode Origin caveat; `originAllowed` entry validation; §C.9 | a vendor pixel script on the shared origin could read the dashboard's APIs with the viewer's cookies | SEC-2, SEC-23 |
| 3-40 | `assertSameOrigin` first in every wrapper, a missing Origin refused; compare-and-set consumption of invites, resets and codes; `p:login:acct` challenge-only; `INSERT users` first; the enumeration risk recorded; §E.2, §C.9, §B.2, §B.3, §B.5, §B.9 | CSRF rested on Next's lenient check; two concurrent accepts could both succeed; a 20-attempt refusal reopened AUTH-25 | SEC-11, SEC-24, SEC-22 |
| 3-41 | Preview tokens store-bound and revocable (`preview_tokens`, `jti`, `assertOwned`, `revokePreviewToken`); §E.2, §D.3, §D.4 | a 72-hour link could expose another store's draft | SEC-7 |
| 3-42 | Tenant step-up ladder (TOTP or password re-entry) for exports, close, secret writes and admin / owner role changes; HSTS `includeSubDomains` on the platform host in S mode; §B.7, §F.6 | a stolen 30-day cookie pulled every customer; a first `http://` visit to a subdomain was unprotected | SEC-17, SEC-15 |
| 3-43 | `store_domains` verification and takeover rules in the R3 contract step; §D.6, §K.5 | C mode had no ownership proof and a dangling-CNAME path | SEC-19 |
| 3-44 | Purge: `platform_notes` soft-deleted, the audit-meta PII key list, `legal_acceptances.ua` nulled, `backup.purgeRequests`, account deletion (`deleteUserAccount`); §F.9, §H.6, §K.1 | deletion left identifiable data in notes, backups and user rows | SEC-20 |
| 3-45 | D30 / §F.3 AAD unified (info string, kid included) with a test vector | the golden vectors would have frozen whichever text T1 picked | SEC-25 |
| 3-46 | `orders.export` granted to `manager`; the `agents` gauge predicate; `ai_credits_director`; `fr` for `ops.` / `int.` / `fin.` in R1; the OPE Q.27a/b/o columns and Q.27m audit names and bucket; the AI R40 names and kind; the Q.27n demo rule; §A.3, §A.4, §D.2, §D.5, §D.6, §F.5, §E.8, §I.4, §I.5, §J.3 | the parts' third round named them; each is a core-owned list | OPS-22, OPS-23; part OPE Q.27a/b/i/l/m/n/o, AI R28/R40 |
| 3-47 | Store-mode onboarding creates no landing page (PDP reveal) and the `inStoreMode` fallback; `stores.category` at the mode switch; §A.2 | a saved draft was hidden behind the store's 404 | OPS-14 (part PLA Q3.8, LAN R5, STO-R36), ENGP-25 |
| 3-48 | D60 rev 3: aurora + grain removed everywhere, typographic celebration; §I.6 | the banned generated-UI signature survived as a "celebration" | UX-38 |
| 3-49 | `short_links` typed targets (`target_kind`, `page_id`, `target_ref`; no `target`); `notifications.link` validated; §D.5, §I.4 | a stored free URL was an open redirect | part LAN R23 (SEC-6) |
| 3-50 | `checkout.addressMode`, `checkout.calendar.confirmationLeadDays`; the `platform_ai.caps` additions, `store_ai.director = null`, `directorAutoDefault`, `evalGate.jury` / `canary`; the `ops` / `accounting` key additions; §D.10 | the parts' revision 3 fields the core registry must create at P0 | UX-31 (part STO-R37, LAN R20), OPS-12, AI-§S.3, OPE Q.27k |
| 3-51 | §K.2 P0 design stubs: `GenomeCard` / `Band` / `RepairOp` / `AI_REPAIR_OPS` exports, `design.plan`, `sampleGenome(…, { pins })`, 12 candidates per pass, `features.h fixed`; the `estimateAlpha` browser estimate (P6) for P2's photos step | the two parts' Director contracts had drifted; the reveal excluded every stage / dark family | QUAL-25, QUAL-10, UX-39; part AI R31, LAN R12 (ENGP-5) |
| 3-52 | `npm run gate:offline` in `prebuild` from the R1.0 integration; `qa/.gate-ok` + `scripts/deploy/archive.mjs`; `getHealth().build.gateSha` and `gate_mismatch`; §J.5, §H.10, §H.5 | the tenancy gate was a script humans remembered to run | SEC-10 |
| 3-53 | §P filled (one line per finding), §Q.8 (the parts' third-round requests), §L.3 rev 3 row, this table | traceability | all |

### N.3 Revision 4 changes (round-2 review integrated)

Every change of revision 4. Round 2 re-sent the round-1 findings (each re-verified against the body: the rev 3
resolutions hold) and added the critic's CRIT findings; **part** = a fourth-round note of a part, decided in §Q.9.

| # | Change | Why | Source |
|---|---|---|---|
| 4-1 | Status → revision 4; owner summary item 21; reading order names §Q.9; the frozen-chunk sentence says no zone or window code enters it | the parts are at revision 4 | all |
| 4-2 | D68 rewritten: slugs in storage and server APIs, one value-keyed `ZoneTable` from `buildZoneTable` for every browser table, `cityKey` server-side only (may be bundled, never required); `zoneFeesFor(scope, keys)` for server joins; §K.2 P0 operations and landing lines, §K.4 S1 row and STO-R19 list, §I.7 fee-mismatch input, §J.1 `test:delivery` key-shape and import-graph cases | one P0 function had two table shapes for its two consumers | CRIT1; part STO C1, LAN N1, OPE notes |
| 4-3 | D73 rewritten: `days: Record<IsoWeekday, Range[]>`, `EffectiveWindow` the one JSON-safe type (+ `CallingWindow` alias, `Range`, `IsoWeekday`), never `null`, `configured` from `ops.callingWindow.savedAt`, `shopperPromiseAllowed`, `DEFAULT_WINDOW`, the shared `window.fixtures.ts`; §D.10 `ops`, §K.2 P0, §M.3 call-claim rule, §H.3 `store_info` on a window save, §J.1 `test:delivery` / `test:ops` | two documented shapes and a nullable stub for the one window; a default must not become a promise | CRIT3; part LAN N2, OPE notes, STO C2 / C11 |
| 4-4 | D76 + §C.6 `reportUrl()`, `links.report` in the render context (live, test, preview; never exports), P6 footer, Shell fallback, P3 pages, S1 chrome, one UiKey `footer.report` with platform's wording; `consoleHref` ADMIN_HOST-aware; §C.10 V12; §H.13, §K.2 P0 maintainer CCR, §L.2 PL-20, §J.1 render-check cases | nobody rendered the report link on landing pages; the console link would break at the domain move | CRIT15; part PLA Q4.1 / Q4.2, DES N1, LAN N4 |
| 4-5 | `src/lib/design/types.frozen.ts` (maintainer) for the three frozen shapes, P6's `types.ts` re-exports; `VariantFeaturesResolved` picks `h` and requires `family`, `HeightReport.stub?`; §K.2 P0, §K.3 | one file had two owners | CRIT9; part DES N7 |
| 4-6 | `estimateAlpha(bitmap)` in the §K.2 P0 design stubs with design's signature (stub `null`) | P2 merges second and calls a function P6 ships last | CRIT10 |
| 4-7 | §J.1 rows `test:landing-addons`, `test:policies`, `test:wa-price`, `test:copylib`, the harness `scripts/qa/test-budget.ts`, `test:ai:slow` in `test:slow`; new §J.6 later-release scripts | four R1 scripts were outside the 3-minute accounting; R2 / R3 scripts had no list | CRIT16 |
| 4-8 | §L "Proven by" rule (the parts' maps, `// proves:` headers) | acceptance cells named no test | CRIT17; part LAN N9 |
| 4-9 | `scripts/qa/e2e/{pulse,admin-perf}.ts` committed (P2); §J.3 rows, §K.2 P2 row | two deliverables backing §I.8 sat in the git-ignored `qa/` | CRIT19 |
| 4-10 | D72 / §K.1 T3 wording: `newOrderId` lives in `src/lib/db/ids`, not re-exported by `create.ts` | the text implied an internal id generator | CRIT20 |
| 4-11 | D71 + §E.1 / §E.2: `StoreCtx<S>`, `WritePermission`, `WriteCtx`, the `storeAction` / `storeGuard` overloads, `UserCtx`, `StoreCtx.stepUpUntil`; §A.2 / §K.4 `createProduct(ctx, { facts })`, `setThemeDraft(ctx, direction)` | ctx-taking write functions needed a cast outside `seam.ts` | part STO C5, PLA Q4.7 / Q4.8 |
| 4-12 | D56 + §H.2 slot 4c + §H.12: the flag switches the `after()` driver only; the cron never calls a model inside the tick (one-item batch hand-off; leftover cap 5 s) | "on only behind the flag" and a 90 s stage inside a 20 s slot contradicted §H.12 | part AI R41, R42 (ENGP-2, ENGC-18) |
| 4-13 | §B.7 step-up list + the Carrier CSV route and the R2 period close; `stepUpWithPasswordAction` signature; §F.5 `meta.stepUp` rows, `platform.user.deleted`, `auth.account.deleted`, `store.brand_term.refused` without the term | the guarantee "a stolen cookie can no longer pull every customer" did not cover the Carrier CSV | part OPE notes (OD64), PLA Q4.8, PLA-§Q.1 |
| 4-14 | §B.1 / §I.1 `/app/account/danger`; §E.2 `deleteUserAccount(ctx: UserCtx \| PlatformCtx, target?)` with `owns_store` / `is_staff`; §F.9; §K.1 T2 | the staff and self-service paths needed one signature and a route | part PLA Q4.7 (SEC-20) |
| 4-15 | §I.4 notification link rule widened (`/app/<h>` root, `/app/account`, `/admin`; refused → `NULL`) | the rev 3 regex refused the dashboard root seven kinds link to | part PLA Q4.3 |
| 4-16 | §I.7: `getStoreHealth` → `StoreHealthView \| null` + `staleAfterMin`; flags mirroring a track's issue are derived, no points; "no published page" = P3's rule only; `int:*` the only integration issues; `landing:fee_mismatch` the one rule for attached landings too; `brand_term_live` at least nightly; §H.5 `data_dir_70` / `data_dir_85`, `health_stale` scaled, `health_job_slow` | duplicate issues for one condition; an alarm that fired permanently past 120 stores | part PLA Q4.4 / Q4.5 / Q4.9, STO C4 |
| 4-17 | §D.5 / §D.6 `carrier_rates.cod_fee_bp` and `cod_fee_flat_cents` `NOT NULL DEFAULT 0`; `design_genomes.report.gen` noted | the core's cut text disagreed with OPE-§2.7 | part OPE notes (OPS-25), DES N3 |
| 4-18 | §M.1 rule 2: the five `OriginClass` values, the generation record, the wizard's `useNoveltyGuard` call site; `gateInputFor` / `gateCtxFrom` quoted verbatim, `KIND_GATES` cited, `policy` a utility kind; §M.2 F1 position only; §M.4 the verified exhaustion path, I3 wording; §M.3 export of the password-field patterns | the origin map had two classes where §M.4 needs five; two adapter signatures; two form-height items; a dead-end exhaustion path | part AI R44, DES N2 / N3 / N4, LAN N3, STO notes (QUAL-1, CRIT18, UX-24) |
| 4-19 | §K.2 P0 design stub `sampleGenome(input, { hints?, pins?, priors? })` with `SampleOpts.pins` (not `GeneHints.pins`); `checkHeadlineNovelty` answers bands; ai's `aiUsageForStore` return; operations' console read fields | two parts described the pin in two places | part DES N9 (over AI R43), PLA Q4.10 / Q4.11 |
| 4-20 | §K.4: `catalog_version` bumps on calling-window writes and on the `cutout` handler; the S4-only sentence; `fee_unset`, no `shipAfter`; `actor_kind 'integration'` = carrier adapters only; S1 / S3 / S4 / S5 rows at file level; §K.5 D3 "LP-16 PHP side only" + its check scripts | stale store HTML after a window save or a mask; two R2 owners in prose; a Sheet's "Livré" read as carrier evidence | part STO C6, OPE notes, AI R45, LAN N7 / scripts |
| 4-21 | §K.2 rows: P2 mounts P6's reveal (P6 owns `src/components/generate/reveal/**`); P3 `selftest-checklist.ts`, `pages/**`, the rev 4 files; P4 `window.ts` / `defaults.ts` / `window.fixtures.ts`; P6 reveal, footer link, wizard record; P7 `render-cases/ai.ts`, `wow-demo/steps/ai.ts`, `director/budgets.ts`; §K.3 `types.frozen.ts`, `test-budget.ts`; the rev 4 ownership re-check paragraph | `test:ownership` must find one owner per file | part DES N5, LAN N6, AI-§R.1; ENGC-8 re-check |
| 4-22 | C0a `ThemeLook.em` + `"none"`, `locks` + `G23` (max 7); §D.10 `brand.genes` + G1, G9 | the rev 3 genes G26 `none` and G23 could not compile into the frozen `look` | part DES N6, DES-R16 note |
| 4-23 | §I.1 API rows (`/ai/**` detail, `/leads/export`, R2 `/finance/**`, `/imports`, `/shipping/**`, `/brand/**`), dashboard R2 / R3 rows (`/integrations`, `/catalog/inventory`, `/preview/theme/<id>`, `/pages/<id>/{experiments,schedule,analytics}`, `/integrations/api`); §E.2 codes `owns_store`, `is_staff`, `category_required`, `fee_unset` | every route and code a part names exists in the core | rev 4 route / table / permission re-check |
| 4-24 | §P round 2, §Q.9, §L.3 rev 4 row, this table | traceability | all |

---

## P. Review decisions

### P.1 Round 1 (revision 3)

One line per finding id that names the core or is cross-file, as the reviewers wrote them (OPS,
ENGC, ENGP, UX, SEC, QUAL). **Resolved** = the body changed (sections named). **Resolved\*** = accepted with a change,
the change and its reason in the row. **Rejected** = not applied, with the reason. **Parts** = the finding has no core
text; the part that resolved it is named (its review-decision section: PLA-§R, STO-§30, LAN-§29, OPE-§R, AI-§T,
DES-§28). Findings the reviewers addressed to a part only and that changed a core-owned list arrive here through §Q.8
(the parts' third-round requests) and are listed at the end as pointers.

| Finding | Sev. | Decision | How / where |
|---|---|---|---|
| OPS-1 | blocker | **Resolved** | D68; §D.5 `delivery_zones`, §D.6 `carrier_rates`, §K.2 P0 (landing + operations stubs), §K.4, §J.1 `test:delivery`; the parts' sides in STO-§30, LAN-§29, OPE-§R, PLA-§R |
| OPS-9 | major | **Resolved** (option a) | D74; §D.2 orders 0005, §A.3.1 `shipments.write`, §F.5, §I.1, §L.2 IN-09; OPE-§R OD55, LAN-§29, PLA-§R |
| OPS-11 | major | **Resolved\*** | D73; §D.10 `store` / `policies` / `ops`, §K.2 P0, §M.3. Change: the two mirror keys are **removed**, not mirrored (one key, one editor; a read-only mirror is a second place to look); the parts asked "mirror or drop" and accept either |
| OPS-13 | major | **Resolved** | D75; §K.4 (LP-16 runtime), §K.5 (PHP v3), §L.2 LP-16, §H.13 `landing-v3`, §I.7 `landing:fee_mismatch` |
| OPS-14 | major | **Resolved** | §A.2 (store-mode onboarding creates no landing page; the `inStoreMode` fallback; UX-01 case); §K.4 `createProduct` / `setThemeDraft` / `productAsPageDoc(direction)`; PLA-§R PD60 rev 3, STO-§6.7, LAN-§4 |
| OPS-15 | major | **Resolved\*** | §K.4 (the frozen v3 functions, S1; S4 the sheet's store branch), §K.2 P0 (`convertLeadToOrder` dispatch), §J.2. Change: the functions live in **S1's** `src/lib/catalog/order-v3.server.ts` (STO-§16.9), not in operations' proposed `src/lib/orders/{manual-v3,edit-v3}.ts` (S4): one pricing owner makes "manual v3 total = public v3 total" true by construction; S4 keeps the sheet |
| OPS-20 | minor | **Parts** (landing fixed LAN-§14.3 → `settings.write`); the core names the permission in §H.11 | §H.11; OPE-§26 is the source |
| OPS-22 | minor | **Resolved** | §A.3.1 / §A.3.2: `orders.export` granted to `manager` (audited, sensitive stays); no separate `shipments.export` key (the Carrier CSV rides `shipments.write`, D74) |
| ENGC-1 | blocker | **Resolved** | D54; §D.2 orders / leads 0004 rows, §D.3, §D.4 `pageSlugHistory`, §D.5, §D.8 steps 1 and 5, §K.1 T3 |
| ENGC-2 | blocker | **Resolved** | §C.5 (the `cf` fetch option, the cache-key paragraph), §C.9, §F.6 store documents (`CDN-Cache-Control: no-store` while `via = edge`), §J.3 `qa:edge-sim`; `domains.md:260` corrected at its next revision (crossFileNote) |
| ENGC-3 | major | **Resolved** | §D.5 `aiJobs` (`active char(1) NULL`, `aj_active_uq` on it), §H.12 rule 5 and pattern B |
| ENGC-4 | major | **Resolved** | §D.5 `renderJobs.dedupe` comment, §H.3 (claim clears `dedupe`), §J.1 `test:jobs` |
| ENGC-5 | major | **Resolved** | §F.1 (tenant set = every table with `store_id`; `storeRefOpt()` reads scoped; L3b; `src/lib/platform/**` pinned) |
| ENGC-6 | major | **Resolved** | D71; §E.1 `WriteScope` / `ReadScope`, §E.2 `platformScope`, §E.3 rule 6, §F.1 L6, §J.1 `test:permissions` |
| ENGC-7 | major | **Resolved** | §F.1 L9 (inline `"use server"`), L13 (route handlers), §E.2 (`assertSameOrigin` in `storeGuard` before the session lookup) |
| ENGC-8 | major | **Resolved** | §K.2 P2 row (three carve-outs + `settings/audit/**`), P1 (+ `keys/platform.ts`, `report/**`), §K.1 T3 (+ `security/selftest.ts`), `scripts/qa/ownership-check.ts` / `test:ownership` (§J.1, §K.1 C0b, §K.3) |
| ENGC-9 | major | **Resolved** | §K.1 C0a / C0b, the T3 / T4 rows carrying their own deliverables, the estimates, the merge order; §K.2 P0 at 3-4 days |
| ENGC-10 | major | **Resolved\*** | header freeze rule, §C.9 web-storage row (prefix derived once in `core.ts`, regex with `(?:\/|$)`), §H.13, §J.1 render-check. Change: the measurement happens at T3's merge, not before C0 (C0 does not touch the chunk); if the prefix pushes the chunk past 24,200 B the re-freeze goes to §P for the owner, otherwise the figure stands; tolerance 0 either way |
| ENGC-11 | major | **Resolved** | §H.2 (`platformLock("tick")`, `yield()`, `lagMs()`, render CPU cap, `job_runs.summary` fields), §H.5 alarms |
| ENGC-12 | major | **Resolved** | §E.7 (lock pool of 2, one lock per job), §H.7 (the 10-connection budget, `max_user_connections` probed), §H.5 `pool_wait` |
| ENGC-13 | major | **Resolved** | D72; §K.1 T3, §K.2 P0, §K.4 STO-R12 (a), §K.3 (`create.ts` shared) |
| ENGC-14 | major | **Resolved** | §G.2 (bounded walk, win32, `.sg-owner`, `[unverified]`), §H.7 `DATA_DIR_BUDGET_BYTES`, §H.10 probe, §H.5 |
| ENGC-15 | major | **Resolved** | §C.3 store row (no trailing slash), §J.3 `qa:edge-sim`, §J.1 `test:hosts` |
| ENGC-16 | major | **Resolved** | §B.1, §B.5, §C.3 step 1 (`kit` keeps `no-referrer`), §F.6 platform UI row, §J.3 `qa:headers`, `qa:action-replay` |
| ENGC-17 | major | **Resolved** | §D.2 `store_usage` row, §D.4 `storeUsage`, §D.5 `agentProfiles.commissionRuleIds`, §D.6 `agent_earnings`, §D.8 "two guarded type changes", §A.4 |
| ENGC-18 | major | **Resolved\*** | D56, §H.12 (`maxDuration = 360`, the probe through the real route and a `storeAction` page, flag `ai_detached_jobs`), §K.2 P7. Change: pattern B does not degrade to pattern C when `after()` fails; it runs on the poll and cron drivers (ai's stage-resumable design, AI-§B.13), and pattern C stays the fallback for nobody-waits work |
| ENGC-19 | major | **Resolved** | §D.10 (`openLegacy` for `purpose_v = 0`), §D.8 conversion paragraph, §J.2 `test:migrate` |
| ENGC-20 | major | **Resolved** | §G.1 `put` idempotent, §J.2 `test:storage` |
| ENGC-21 | major | **Resolved** (both options) | §K.2 P0 stub rule (production build throws while stub), §H.10 (R1 product deploy = the integration deploy) |
| ENGC-22 | major | **Resolved** | §C.3 step 4 (two header sets), §J.3 `qa:headers` |
| ENGC-23 | major | **Resolved** | §F.1 L2 (scope identifier bound to a `StoreScope` parameter; not under `or(` / `not(`; `L2b`) |
| ENGC-24 | minor | **Resolved** | §B.1 manifest row (public, `max-age=3600`), §F.6, §J.3 `qa:headers` |
| ENGC-25 | minor | **Resolved** | §I.7 job paragraph (budget-driven, measured staleness), §H.2 slot 9 |
| ENGC-26 | minor | **Resolved** (verified: `src/**` reads `PUBLIC_URL` through `process.env` in server code only; rev 5, CRIT2-8: "no `NEXT_PUBLIC_*`" corrected, the one such read is `NEXT_PUBLIC_OFFERS_FEATURES`, `features.ts:36`, not a domain key) | §H.7, §C.10 step 1, §C.5 rotation ("restart"); HANDOFF §4 corrected at its next revision (crossFileNote) |
| ENGC-27 | minor | **Resolved** | §K.1 C0a row for `public.ts` (signatures C0a, bodies T3, maintainer from P0; the T2 dependency removed from T3) |
| ENGC-28 | minor | **Resolved** | §E.8 (deprecated overload), §K.1 C0b, §F.1 L5 |
| ENGC-29 | minor | **Resolved** | §H.1 re-send rule |
| ENGC-30 | minor | **Resolved** | §D.8 S1 (derived handle), conversion step 5 (`freeRename`), §C.7 |
| ENGC-31 | minor | **Resolved** | §F.9 (enumerated from `schema.ts`), §D.8 dry-run, §H.9, §J.2 `test:migrate` (e) |
| ENGC-32 | minor | **Resolved** (file-grant option) | §K.2 P8 row and §G.4: `src/lib/media/{process,assets,upload-slots}.ts` pass to P8 at the R1.0 integration; no `MediaWriter` hook |
| ENGC-33 | minor | **Resolved** | §H.2 slot 1 (capacity, oldest-pending order), §H.5 (scaled alarm) |
| ENGC-34 | minor | **Resolved** | §D.8 batched guarded `ALTER` form |
| ENGP-1 | blocker | **Resolved** | §M.1 rule 2 (`gateInputFor`, `KIND_GATES`), §M.4 (utility kinds never pooled), §K.2 P0 (`FoldItem` widening), §K.4 (types widened at the contract step, `checkFold` thin), §J.1 `test:prepublish`; DES-§8.13 is the implementation |
| ENGP-3 | major | **Resolved** | = ENGC-3; §D.5, §H.12, §J.2 `test:ai-db` |
| ENGP-6 | major | **Resolved** | §M.2 rows C2 / C3 / F1 with the bands, `HEIGHT_BAND` / `FOLD_BAND` in `budget-limits.ts`, `heights.json`, Playwright as calibration; §J.1 `test:prepublish` |
| ENGP-11 | major | **Resolved** | = ENGC-8 (P2 `team/**` except `team/{agents,callcenter}/**`); §K.2, §K.3 |
| ENGP-12 | major | **Resolved** | §H.13, §J.1 (render-check harness + `render-cases/<track>.ts`), §K.1 T3 note, §K.2 P3 / P6 rows, §K.3 extension point, `budgets.json.compositions` |
| ENGP-24 | minor | **Resolved** | §J.1 (≤ 3 min, `test:slow`, per-track shares), §J.5 `gate` runs `test:slow` |
| ENGP-26 | minor | **Resolved** | header freeze rule, §K.1 T3 (re-measure, `landing.sha256`), §H.13, §J.1 (tolerance 0 for `landing`) |
| ENGP-28 | minor | **Resolved** | §D.5 `renderJobs.reason` enum (+ `store_info`, `conversions`, `cutout`; `reviews` noted for 0007) |
| UX-4 | major | **Parts** (design DES-§5.9 / V27, landing LAN-§5.4, storefront); the core only records that P6's `cta` section uses `Cta`'s existing `hero` prop (§K.2 P6) | DES-§28, LAN-§29, STO-§30 |
| UX-20 | major | **Parts** (platform PLA-§22.2 PD73, design DES-§14.3, storefront STO-§11.4); §K.2 P2 names the reveal composition | PLA-§R, DES-§28, STO-§30 |
| UX-21 | major | **Parts** (design DES-§11.1, storefront STO-§8.4 / §12.8); no core text | DES-§28, STO-§30 |
| UX-31 | minor | **Resolved** (registry side) | §D.10 `checkout.addressMode` (landing's key, read by the store checkout; `checkout-store.ts` never redefines it); the surfaces in LAN-§3.5 OF2 and STO-§15.5 |
| UX-37 | minor | **Parts** (landing OF13, storefront STO-§15.4, platform PLA-§22.1); landing rejected the sticky submit with a reason (LAN-§29) and the core takes no side | LAN-§29, STO-§30, PLA-§R |
| UX-38 | minor | **Resolved** | D60 rev 3, §I.6 (no aurora / grain, typographic celebration, lint); the thank-you tint in LAN-§3.6, the design rows in DES-§16 |
| UX-39 | major | **Resolved** (core side) | §H.3 / §D.5 reason `cutout` (P8 handler), §M.4 (an `estimated` cutout counts as alpha), §K.2 P6 (`estimateAlpha`), §J.3 `qa:wow-demo`; the estimate and H13 / H27 in DES-§4.11, the photos step in PLA-§22.2, the media pipeline enqueue in AI-21 |
| SEC-1 | blocker | **Resolved** | D69; §A.4 metrics, §A.5.1 refund, §A.5.2, §B.2 steps 2 and 6, §G.4 step 4, §D.7, §D.10 `platform` / `platform_ai`, §F.1 cases, §F.8, §H.5 alarms, §J.1 / §J.2 |
| SEC-2 | major | **Resolved\*** | §C.9 Document CSP row (never a bare `'self'`; `scopeToPublicApi` on every host class; the pixel allow-list frozen), §C.3 (Cookie dropped for store areas on the platform host), D44 (`ADMIN_HOST` at the domain move), §F.6, §J.1 `test:security`, §J.3 `qa:headers`. Change: the **console** leaves the shared origin at the domain move (the host class exists); the **dashboard** stays on the apex in R1 (`app.<root>` is R2, S6): moving `/app` needs a cookie-domain and login redesign the review did not ask for, and the CSP narrowing is the control on both |
| SEC-3 | major | **Resolved** (both options) | §C.3 step 2 (`x-sg-path-sig`, `x-sg-rid`; only actions derive the store from the path), §E.2 step 2, §F.1 L13, §J.3 `qa:edge-sim` |
| SEC-4 | major | **Resolved** | §C.2 step 2 (fail closed), `x-sg-ts`, §C.5 Worker, §H.5 `edge_bad_key`, §J.1 `test:hosts`; RESEARCH V4 corrected at its next revision (crossFileNote) |
| SEC-5 | major | **Resolved** | D70; §B.8, §A.3.1, §E.1 (`kind` comment), §F.1 canary case, §F.11, §K.2 P0 (`maskIfImpersonation`); OPE-§R OD61, PLA-§R PD69 |
| SEC-7 | major | **Resolved** | §E.2 `mintPreviewToken` / `revokePreviewToken`, §D.3 / §D.4 `preview_tokens`, §F.1 cases, §F.9, §H.11, §F.5 `store.preview_link.revoked` |
| SEC-8 | major | **Resolved** | = ENGC-6 / D71 |
| SEC-9 | major | **Resolved** | §F.1 L13, L2, L10, the derived route list for `tenancy-check.ts` / `action-replay.ts`; §J.5 |
| SEC-10 | major | **Resolved** | §J.5 (`gate:offline` in `prebuild` from the R1.0 integration, `qa/.gate-ok`), §H.10 (`scripts/deploy/archive.mjs`), §H.5 (`gateSha`, `gate_mismatch`); HANDOFF §4 gains the step at its next revision (crossFileNote) |
| SEC-11 | minor | **Resolved** | §E.2 (`assertSameOrigin` first in every wrapper), §C.9 mutations row (missing Origin refused), §J.1 `test:security`, §J.3 `qa:action-replay` |
| SEC-12 | minor | **Resolved** | §B.1 device marker (set by T3's proxy; `publicAction` fallback; the `/s/<h>/**` note), §K.1 T2 / T3 |
| SEC-14 | minor | **Resolved** | §B.7 (`allowlistAddress()` on `CF-Connecting-IP` behind Cloudflare), §C.10 checklist, §H.7, §J.1 `test:security` |
| SEC-15 | minor | **Resolved** | §F.6 HSTS per host class, §J.3 `qa:headers` |
| SEC-16 | minor | **Resolved** | §C.3 step 2 (kept headers), §C.2 `EffectiveHost.workerVersion`, §H.5 |
| SEC-17 | minor | **Resolved** | §B.7 tenant step-up ladder, §F.5 `auth.step_up`, §E.8 `p:password` |
| SEC-18 | minor (raised to R1) | **Resolved** | D76; §C.7, §F.8, §M.3 `honesty:password_field`, §B.1 / §C.3 / §C.4 `/report/<handle>`, §D.3 / §D.5 `abuse_reports` 0005, §F.9, §I.7 `platform:brand_term_live`, §K.1 T4 (`listPagesForConsole` columns), §K.2 P1, §L.2 PL-20 |
| SEC-19 | minor | **Resolved** | §D.6 `store_domains` columns, §K.5 verification and takeover rules + attack cases |
| SEC-20 | minor | **Resolved** | §F.9 (notes soft-deleted, the PII key list, `ua` nulled, `backup.purgeRequests`, account deletion), §H.6, §K.1 T2 `deleteUserAccount`; `needs_legal_review` |
| SEC-21 | minor | **Resolved** | §G.7 `DATA_AREAS`, §F.9 (`ai` listed; areas iterated), §J.2 `test:storage` |
| SEC-22 | minor | **Resolved** | §B.2 steps 2 and 7 (Turnstile gate, `INSERT users` first, the accepted residual risk), §B.3 (`p:login:acct` challenge-only), §J.1 `test:security` |
| SEC-23 | minor | **Resolved** | §C.9 `checkOrigin` row (P-mode caveat; `originAllowed` entry validation), §J.1 / §J.2 |
| SEC-24 | minor | **Resolved** | §B.5 (compare-and-set), §B.2 step 7 (codes), §B.9 (resets), §J.2 `test:migrate` (f), §F.1 |
| SEC-25 | minor | **Resolved** | D30 / §F.3 (one AAD string, the kid vector), §B.1 manifest public |
| QUAL-1 | blocker | **Resolved\*** | §M.4 (N8 hard on generated lines only; soft for owner-typed and library lines; the 30-store corpus test). Change: STO-R39 asked "hard for owner-typed lines too"; not adopted, because §M.1 rule 2 lists owner-typed items as notes and design (the gate's owner, DES-R24 / ENGP-9) chose the same; the generative skeleton layer (DES-§9.12) is design's |
| QUAL-9 | major | **Parts** (ai AI-§A.8.2 stage 5, design DES-§8.9 / DS11: one acceptance rule, Q reported not the key); no core text | AI-§T, DES-§28 |
| QUAL-10 | major | **Parts** (design `sampleGenome(…, { pins })`, ai `DirectionBrief.pin`); the core names the P0 stub shape (§K.2 P0 design) | DES-§28, AI-§T |
| QUAL-20 | major | **Parts** (design `nicheShares` gains `seq4` / `tells`); no core text | DES-§28 |
| QUAL-21 | major | **Parts** (ai removes the serif line from `system[1]`, design owns the typography text); no core text | AI-§T, DES-§28 |
| QUAL-25 | minor | **Resolved** (registry side) | §K.2 P0 design stubs (`GenomeCard` / `Band` / `RepairOp` / `AI_REPAIR_OPS` exported from design, `design.plan`, 12 candidates per pass); the imports and the build-time vocabulary assertion in AI-§A.8.2 / AI-§T |
| *Part-addressed findings that changed a core list (pointers; the decision rows are in §Q.8)* | | | SEC-6 → §D.5 `short_links`, §I.4 `notifications.link` · SEC-13 → §C.9 cookies · SEC-26 → §A.4 / §A.5.2 pending AI floor and slice · ENGP-2 → §H.2 slot 4c, §H.12 · ENGP-5 → §K.2 P0 (`features.h fixed`) · ENGP-8 → §M.1 rule 2, §F.5 `page.fact_attested` · ENGP-18 → §M.2, §K.5 · ENGP-25 → §A.2, §K.4 · ENGP-27 → §K.4 "four" frozen files · ENGP-31 → §H.13, §K.5 · OPS-2/3/4/8 → §D.2 orders 0005 · OPS-5/18 → §D.2 orders 0006, §D.6 · OPS-6/10 → §D.6, §D.10 `accounting` · OPS-7 → §E.8 `s:<sid>:inbound` · OPS-12 → §D.10 `checkout.calendar.confirmationLeadDays`, §K.2 P0 `zoneLineFor(…, { stage })` · OPS-16 → §J.3 `qa:wow-demo`, §K.2 exit 12 · OPS-17 → §I.5 · OPS-23 → §A.4 · OPS-24/25/26 → §D.5 / §D.6 refinements · OPS-27 → §K.4 S4 (`format=xlsx`) · OPS-28 → §D.10 `ops.windowOverrides` · QUAL-11/13/34 → §D.10 `platform_ai` (`directorAutoDefault`, `evalGate.jury` / `canary`, `directorSharePct`), `store_ai.director = null` · QUAL-3/4 → §M.4 · QUAL-5 → §M.2 · QUAL-16 → §K.4 `order_events.actor_kind` · UX-19 → §K.2 P6 `dev/fixture/design/**` |

**Rejected outright: none.** Five findings were accepted with a change (OPS-11, OPS-15, ENGC-10, ENGC-18, SEC-2) and one
part request was partly declined (STO-R39's owner-typed clause under QUAL-1); every reason is in its row. Re-freeze
of the landing chunk: **not needed as of this revision** (T3 measures at its merge; the row is reserved here for the
owner if the prefix bytes exceed 24,200 B).

### P.2 Round 2 (revision 4)

Round 2 re-sent every round-1 finding that names the core or is cross-file against revision 3, plus the critic's
consistency findings. **Holds** = the rev 3 resolution was re-read against the revision-4 parts and stands (the
sections named in §P round 1 carry it); **Holds +** = it stands and revision 4 adds the named alignment; **Resolved** /
**Resolved\*** = new body text in revision 4 (with a change, reason given); **Parts** = no core text; the part that
carries it is named (round-2 sections PLA-§R, STO-§30.2, LAN-§30, OPE-§R2, AI-§V, DES-§30). Fourth-round notes of the
parts are decided in §Q.9.

| Finding | Sev. | Round 2 | How / where (rev 4) |
|---|---|---|---|
| OPS-1 | blocker | **Holds +** | slugs stay the stored key (D68); the browser shape fixed by CRIT1 (D68, §K.2 P0, §K.4 S1, §I.7, §J.1 `test:delivery`) |
| OPS-9 | major | **Holds +** | D74; the Carrier CSV joins the step-up list (§B.7), `meta.stepUp` on `orders.carrier_exported` (§F.5), the console read stub carries `carrierLabel` / `trackingRef` / `carrierExportedAt` (§K.2 P0) |
| OPS-11 | major | **Holds +** | D73 (two keys removed, no mirrors); the one shape, never-null stub and `configured` flag of CRIT3 (D73, §D.10 `ops`, §K.2 P0, §M.3) |
| OPS-13 | major | **Holds +** | D75; the fee-mismatch input from `zoneFeesFor`, attached landings covered, one rule (§I.7) |
| OPS-14 | major | **Holds +** | §A.2; `createProduct(ctx, { facts })` / `setThemeDraft(ctx, direction)` take the `WriteCtx` (§A.2, §K.4) |
| OPS-15 | major | **Holds +** | §K.4 (S1's functions, S4's sheet); the contract-step sentence says S4 only (CRIT4), `fee_unset` refusal, no `shipAfter` |
| OPS-20 | minor | **Holds** | §H.11 `settings.write`; LAN-§14.3 fixed (LAN-§30) |
| OPS-22 | minor | **Holds** | §A.3.1 / §A.3.2 |
| ENGC-1 | blocker | **Holds** | 0004 placement (§D.2, §D.4, §D.8); every part reads it from R1.0 |
| ENGC-2 | blocker | **Holds** | §C.5 `cf` option, §F.6, §J.3 |
| ENGC-3 | major | **Holds** | §D.5 `aj_active_uq` on `active` |
| ENGC-4 | major | **Holds** | §H.3 claim clears `dedupe` |
| ENGC-5 | major | **Holds** | §F.1 tenant set from `schema.ts` |
| ENGC-6 | major | **Holds +** | D71; the `WriteCtx` overloads (§E.1, §E.2) remove the last cast outside `seam.ts` |
| ENGC-7 | major | **Holds** | §F.1 L9, L13; §E.2 `assertSameOrigin` |
| ENGC-8 | major | **Holds +** | the rev 4 re-check (§K.2 closing paragraph): `types.frozen.ts`, one reveal owner, P3 / P2 / P7 / S1 / S3 / S4 / S5 / D3 files placed; no intersection found |
| ENGC-9 | major | **Holds** | §K.1 C0a / C0b |
| ENGC-10 | major | **Holds** | header freeze rule; no zone, city-key or window code enters the frozen chunk (D68 rev 4); re-freeze still not needed (measured at T3's merge) |
| ENGC-11 | major | **Holds +** | §H.2; the only > 20 s unit (an inline 90 s stage) is gone from the tick (slot 4c, AI R41) |
| ENGC-12 | major | **Holds** | §E.7, §H.7 |
| ENGC-13 | major | **Holds +** | D72; CRIT20's wording on `newOrderId` |
| ENGC-14 | major | **Holds +** | §G.2; alarm codes `data_dir_70` / `data_dir_85` (§H.5) |
| ENGC-15 | major | **Holds** | §C.3 store rewrite |
| ENGC-16 | major | **Holds** | §B.1 Referrer-Policy |
| ENGC-17 | major | **Holds** | §D.2, §D.8 |
| ENGC-18 | major | **Holds +** | D56 now says the flag switches the `after()` driver only (AI R42); §H.12 rule 1 |
| ENGC-19 | major | **Holds** | §D.10 `openLegacy` |
| ENGC-20 | major | **Holds** | §G.1 idempotent `put` |
| ENGC-21 | major | **Holds** | §K.2 P0 stub rule, §H.10 |
| ENGC-22 | major | **Holds** | §C.3 step 4 |
| ENGC-23 | major | **Holds** | §F.1 L2 |
| ENGC-24 | minor | **Holds** | §B.1 manifest public |
| ENGC-25 | minor | **Holds +** | §I.7 budget-driven; `getStoreHealth` may answer `null`, `staleAfterMin`, the scaled `health_stale` and `health_job_slow` (§H.5) |
| ENGC-26 | minor | **Holds** | §H.7 runtime read |
| ENGC-27 | minor | **Holds** | §K.1 `public.ts` |
| ENGC-28 | minor | **Holds** | §E.8 overload |
| ENGC-29 | minor | **Holds** | §H.1 re-send rule |
| ENGC-30 | minor | **Holds** | §D.8 S1, §C.7 `freeRename` |
| ENGC-31 | minor | **Holds** | §F.9 enumeration |
| ENGC-32 | minor | **Holds** | §G.4, §K.2 P8 |
| ENGC-33 | minor | **Holds +** | §H.2 slot 1; P5's `int:sheets_backlog` uses the scaled threshold (§I.7) |
| ENGC-34 | minor | **Holds** | §D.8 batched `ALTER` |
| ENGP-1 | blocker | **Holds +** | §M.1 quotes `gateInputFor(doc, ctx: GateInputCtx)` and `gateCtxFrom(ctx: PrePublishCtx)` verbatim, cites `KIND_GATES`, lists `policy` among the utility kinds (CRIT18, DES N4) |
| ENGP-3 | major | **Holds** | §D.5 |
| ENGP-6 | major | **Holds +** | §M.2 bands; `budget:F1` measures the position only, the height is P3's `form:F1` (LAN N3) |
| ENGP-11 | major | **Holds** | §K.2 P2 `team/**` carve-out |
| ENGP-12 | major | **Holds +** | §H.13 / §J.1: P7's `render-cases/ai.ts` pre-registered |
| ENGP-24 | minor | **Holds +** | §J.1: `scripts/qa/test-budget.ts` named, `test:ai:slow` in `test:slow`, the four R1 scripts accounted (CRIT16) |
| ENGP-26 | minor | **Holds** | header rule; the storefront's "+5 %" wording is the part's (LAN N8 → STO) |
| ENGP-28 | minor | **Holds** | §D.5 enum |
| UX-4 | major | **Parts** | DES-§30, LAN-§30 (CSS hooks, `hero` prop; §K.2 P6 row records the `Cta` prop) |
| UX-20 | major | **Holds +** | one owner per file: P6 owns `src/components/generate/reveal/**`, P2's `/welcome` mounts it (§K.2 P2 / P6 rows, DES N5); the Director slots (AI R47) |
| UX-21 | major | **Parts** | DES-§30, STO-§30.2 |
| UX-31 | minor | **Holds** | §D.10 `checkout.addressMode` |
| UX-37 | minor | **Parts** | LAN-§30 (sticky submit rejected with a reason), STO-§30.2 (reversed in part, same reason); no core text |
| UX-38 | minor | **Holds** | D60 rev 3, §I.6 |
| UX-39 | major | **Holds +** | `estimateAlpha` frozen at P0 (CRIT10); §M.4 I3 wording (genome vs doc) |
| SEC-1 | blocker | **Holds** | D69 |
| SEC-2 | major | **Holds** | §C.9 (A\* of round 1 stands) |
| SEC-3 | major | **Holds** | §C.3 `x-sg-path-sig` |
| SEC-4 | major | **Holds** | §C.2 fail closed |
| SEC-5 | major | **Holds +** | D70; the lead read repository is P3's `src/lib/leads/read.ts` (LAN N5 → PLA), operations calls the frozen `maskIfImpersonation` and declares no local mask (CRIT14, OPE-§R2) |
| SEC-7 | major | **Holds** | §E.2 preview tokens |
| SEC-8 | major | **Holds +** | = ENGC-6 (`WriteCtx`) |
| SEC-9 | major | **Holds** | §F.1 L13, derived routes |
| SEC-10 | major | **Holds** | §J.5, §H.10 |
| SEC-11 | minor | **Holds** | §E.2 |
| SEC-12 | minor | **Holds** | §B.1 device marker (platform PD12 aligned) |
| SEC-14 | minor | **Holds** | §B.7 allowlist |
| SEC-15 | minor | **Holds** | §F.6 HSTS |
| SEC-16 | minor | **Holds** | §C.3 kept headers |
| SEC-17 | minor | **Holds +** | §B.7: the Carrier CSV route and the R2 period close join the list, `stepUpWithPasswordAction` signature, `StoreCtx.stepUpUntil`; §F.5 `meta.stepUp` rows |
| SEC-18 | minor | **Holds +** | D76: the renderers of the report link (CRIT15), "at least nightly", the shared password-field pattern list; §F.5 one audit name `store.brand_term.refused` without the term |
| SEC-19 | minor | **Holds** | §D.6, §K.5 |
| SEC-20 | minor | **Holds +** | `deleteUserAccount(ctx: UserCtx \| PlatformCtx, target?)` with `owns_store` / `is_staff` (§E.2, §F.9, §K.1 T2), `/app/account/danger` (§B.1, §I.1), `platform.user.deleted` / `auth.account.deleted` (§F.5) |
| SEC-21 | minor | **Holds** | §G.7 `DATA_AREAS` |
| SEC-22 | minor | **Holds** | §B.2, §B.3 |
| SEC-23 | minor | **Holds** | §C.9 |
| SEC-24 | minor | **Holds** | §B.5 compare-and-set |
| SEC-25 | minor | **Holds** | D30 / §F.3, §B.1 |
| QUAL-1 | blocker | **Holds +** | §M.4 hard on `cloud` / `local` / `engine` only; §M.1 rule 2 now names the five classes and the generation record `originFrom` reads (AI R44, DES N3); the verified exhaustion path (DES N2) |
| QUAL-9 | major | **Parts** | AI-§V, DES-§30 (one acceptance rule) |
| QUAL-10 | major | **Holds +** | §K.2 P0: the pin is `SampleOpts.pins` (DES N9; AI R43's `GeneHints.pins` declined, §Q.9) |
| QUAL-20 | major | **Parts** | DES-§30 (`seq4`, `tells`); the per-family `seq4` is a storefront → design note (§Q.9 STO C9) |
| QUAL-21 | major | **Parts** | AI-§V, DES-§30 |
| QUAL-25 | minor | **Holds +** | §K.2 P0: `checkHeadlineNovelty` answers bands; ai imports design's `RenderDigest`, `NicheShares`, `GeneHints` (AI-§V) |
| CRIT1 | major | **Resolved** | D68 rewritten; §K.2 P0 operations and landing lines (`buildZoneTable`, `zoneFeesFor`); §K.4 S1 row and STO-R19 list; §I.7 input; §J.1 `test:delivery` key-shape and import-graph cases; the fixture asserts `zoneTableKey: "value"` |
| CRIT3 | major | **Resolved** | D73 rewritten (`Record<IsoWeekday, Range[]>`, `EffectiveWindow` one type with the alias, never `null`, `configured` / `shopperPromiseAllowed`, `window.fixtures.ts`); §D.10 `ops` (`savedAt`), §K.2 P0, §M.3, §J.1. The finding's "landing re-exports" and "drop the 0 = Monday wording" are in LAN-§30 / OPE-§R2 |
| CRIT9 | minor | **Resolved** | `src/lib/design/types.frozen.ts` (maintainer), P6's `types.ts` re-exports (§K.2 P0, §K.3) |
| CRIT10 | minor | **Resolved\*** | `estimateAlpha` in the §K.2 P0 design stubs with **design's** signature `(bitmap) → { hasCutout: "estimated"; bbox } \| null` (stub `null`), not the finding's `Promise<boolean \| "estimated">`: the function's owner defines it (DES-§4.9, §4.11) and P2 needs the bbox for the focal default |
| CRIT15 | minor | **Resolved** | D76; §C.6 `reportUrl`, `links.report`; §H.13 Shell fallback; §K.2 P0 maintainer CCR; §L.2 PL-20; §J.1 render-check cases; renderers P6 footer, P3 pages, S1 chrome |
| CRIT16 | minor | **Resolved** | §J.1 four R1 rows and the harness file; §J.6 later releases |
| CRIT17 | minor | **Resolved** | §L "Proven by" rule; the maps are in each part (PLA-§1, STO-§1.5, LAN-§1.4, OPE-§O.4, AI-§Q.5, DES-§1.4) |
| CRIT19 | minor | **Resolved** | `scripts/qa/e2e/{pulse,admin-perf}.ts` committed, P2 (§J.3, §K.2) |
| CRIT20 | minor | **Resolved** | D72 and §K.1 T3 reworded |
| *Critic findings with no core text (pointers)* | | **Parts** | CRIT2 (mirrors removed) → OPE-§R2 · CRIT4 (S4 owns the sheet) → OPE-§R2 (and the §K.4 sentence, 4-20) · CRIT5 (store-mode onboarding) → LAN-§30 · CRIT6 / CRIT7 (P1 glob, P2 i18n files) → PLA-§R · CRIT8 (D4 / D3 sections) → DES-§30 · CRIT11 (LP-16 in D3) → LAN-§30 (and §K.5, 4-20) · CRIT12 (test-render CSP wording) → LAN-§30 · CRIT13 (N8 owner-typed wording) → STO-§30.2 · CRIT14 (one mask helper) → OPE-§R2 · CRIT18 (adapter signature) → DES-§30 (and §M.1, 4-18) |

**Rejected in round 2: none.** One finding was resolved with a change (CRIT10, the owner's signature). One part request
was declined in favour of a sibling's (AI R43 → design's `SampleOpts.pins`, §Q.9). Re-freeze of the landing chunk:
**still not needed** (nothing in revision 4 adds bytes to it).

### P.3 Critic round 2 (revision 5)

The final critic of the revision-4 set left 22 issues (7 majors, 15 minors), most of them drift between this document's
rev 4 decisions and parts revised in parallel. Each was applied in this document **and** in every part it names, so all
files say the same thing; each part lists the same ids in its own review-decision section (LAN-§30.1, AI-§V.1,
DES-§30.1, PLA-§R "Critic round 2 (revision 5)", STO-§30.3, OPE-§R2.1). One line per id: what changed, where.

- **CRIT2-1** (major): every shopper-facing call-hour reader checks `shopperPromiseAllowed(w)`; landing's "no hours" =
  `noShopperHours(w, now)` = `windowIsEmpty(w, now) || !shopperPromiseAllowed(w)`, `lp-assist-ty.expect.win` baked only
  when configured, the "default window may promise" sentence deleted, fixtures point at `src/lib/callcenter/window.fixtures.ts`;
  ai's `FinalizeCtx.callingHours.text = shopperPromiseAllowed(w) ? hoursText(w, locale, dateLocale, now) : null`; the
  `configured: false` case added to `test:delivery` (LAN-§7.5, §8.6) and `test:ai` (§J.1 here, AI-§Q.1). Where: §J.1;
  LAN LD29, glossary, §2.3, §3.2, §3.2.1, §3.3, §6.3, §7.5, §8.2, §8.4, §8.6, §9.2, §13.3, §26.1; AI-§D.1, §D.2 rule 3,
  AI-02 acceptance 11, AI-23, AI-§Q.1, AI-§R.1.
- **CRIT2-2** (major): `src/lib/design/types.frozen.ts` is the maintainer's in every file; P6's row is `src/lib/design/**`
  except it, P6's `types.ts` re-exports `HeightReport` / `FoldReport` / `FoldItem` / `VariantFeaturesResolved`; the R2
  widening is split (frozen shapes and `FoldItem` in `types.frozen.ts`; `GateInput.doc` / `genomeOf` / `estimateHeights`
  in P6's `gates/**`, `derive.ts`, `heights.ts` through the contract-step CCR). Where: §K.2 P0, §K.4, §Q.7 DES-R19; DES-§2.1,
  §4.9, §5.3, §8.4, §8.13, §26, §27.1, §27.3 DES-R27, §27.4 N7.
- **CRIT2-3** (major): slot 4c = 1 s + ≤ 5 s leftover, DB writes only; `recoverOrphans` never calls a provider or
  `advanceJob` (the `"cron"` driver leaves `advanceJob`), a driverless stage goes to a one-item batch; `test:ai` spy.
  Where: §J.1 `test:ai`; AI-§A.8.5, §B.13 (signatures, step 3c, tests), §K.5 deep-stage row, §N intro and `ai.jobs` row,
  §P deep-job row, §S.3 note.
- **CRIT2-4** (major): option (b) of the finding, D60 wins: no aurora mesh and no grain on any generated page (no
  budget); the theme stops emitting `--lp-aurora*` / grain, design's hard **V40** guards it, a single product-tinted
  radial ≤ 10 % alpha stays allowed on ≤ 2 sections (S06), `src/landing/illustrations/**` joins P6, render-check case
  added. Where: D60, §K.2 P6 row, §J.1 render-check; DES DS48, §3.2, §4.10.1, §8.2 (V40), §8.3 S06, §8.4, §8.6, §25.1,
  §26; LAN-§3.6 (legal hero `.lp-legal__aurora` → `.lp-legal__tint`).
- **CRIT2-5** (major): `pages.first_published_at datetime(3) NULL`, set once by T3's `publishPage` with `COALESCE`,
  backfilled from the oldest `kind = 'publish'` version, core-owned. **Decided in 0004, not the finding's 0005**,
  because T3's R1.0 publish path writes it (the ENGC-1 rule). Where: §D.2 `pages` 0004, §D.8 step 5, §D.9, §K.1 C0a and
  T3, §J.2 `test:migrate` (g), `test:design-db`; DES DS6, §2.1, §7.5, §7.8, §25.2.
- **CRIT2-6** (major): the §K.2 P0 design stubs gain `RevealFolds` (props `directions`, `state`, `dnaSlot`,
  `actionSlot`, `onUse`, `onRetry`), `RenderDigest` / `renderDigest`, `NicheShares` / `nicheShares`,
  `checkHeadlinesAction`, `validateHints`; the "finished module in merge order" sentence now says later-merging tracks
  are imported as P0 stubs and P2's reveal acceptance runs at the R1 integration. Where: §K.2 P0 and closing paragraph;
  PLA-§22.2 reveal row, §O.4 items 2 and 15; DES-§4.9, §14.3.
- **CRIT2-7** (major): option (b) of the finding, verified on disk: every shipped Arabic WOFF2 stores transformed
  `glyf` / `loca`, and the `@fontsource-variable/*` packages ship no `.woff`, so the WOFF1 route cannot cover them; the
  W3C WOFF2 §5 reconstruction moves into R1 as the maintainer's shared `scripts/fonts/woff2-sfnt.mjs` (sync-fonts and,
  in R2, `build-logo-fonts.mjs`), cross-checked against the static faces' `.woff`, and `theme:check` compares a known
  glyph with `scripts/sync-fonts/ar-glyph-fixture.json`. Where: §K.3, §Q.8 DES-R21; DES-§10.5 step 1, DG-08 rows,
  §13.3 steps 1-2, §26, §27.3 DES-R21.
- **CRIT2-8** (minor): "no `NEXT_PUBLIC_*` in `src/**`" corrected: none of the domain-move keys is one, but
  `NEXT_PUBLIC_OFFERS_FEATURES` (`src/lib/page/features.ts:36`) is and needs a rebuild. Where: §C.10 step 1, §H.7 rows,
  §P.1 ENGC-26; HANDOFF §4 "Hard-won lessons".
- **CRIT2-9** (minor): `test:ai-eval` moves to `test:slow`; §J.1 is a budget table (pretest + existing chain ≤ 30 s,
  core suites ≤ 20 s, the five R1 groups) summing to ≤ 175 s under the 180 s ceiling, checked statically by the harness
  from `scripts/qa/test-budget.json`; the ceiling is raised explicitly to 240 s at the R2 contract step with the R2 / R3
  rows. Where: §J.1, §J.6, §K.3; AI-§F.3, §F.6 runs, §Q.1; STO-§11.4.
- **CRIT2-10** (minor): S3's DB-backed suite is `test:ledger` (`scripts/qa/ledger-check.ts`); `test:money` stays today's
  money-parity proof. Where: §J.6, §K.4 S3 row; OPE-§16.8, §18.5, §O.2, §O.4, §P, §R2.
- **CRIT2-11** (minor): the impossible "null Origin must succeed" case replaced: the invite form posted before
  hydration under `same-origin` carries its Origin and succeeds; an explicit `Origin: null` gets a proxy 403, never a
  500. Where: §B.1, §C.3 step 4, §C.9 mutations row, §F.1 replay.
- **CRIT2-12** (minor): a step-7 rollback refunds `pending_stores` with `refundPlatformUsage`; the duplicate-e-mail case
  is PLA-§O.2 item 18. Where: §B.2 step 7.
- **CRIT2-13** (minor): `approval` / `open` require a configured `platform_turnstile` (D9 default stays `invite`
  until then; code `turnstile_required`, alarm `signup_unguarded`); the domain move adds **V13** "human check ready".
  Where: D9, D69, §B.2, §C.10 step 3, §E.2 codes, §H.5; PLA-§3.1 mode table, §16.3.
- **CRIT2-14** (minor): platform aligned with §Q.9: `store.brand_term.refused`, `links.report`, the committed
  `scripts/qa/e2e/{pulse,admin-perf}.ts`, no health-registry import-line claim, `createProduct(ctx, { facts })` /
  `setThemeDraft(ctx, direction)`. Where: §F.5 note; PLA-§13.3, §22.2 `useDirectionAction`, §24.2, §M.1, §M.3, §O.2,
  §O.4 items 10-11, §P.1, §P.2, §Q.3 Q3.8.
- **CRIT2-15** (minor): design's footer link follows §C.6: live, test and preview renders carry
  `links.report = reportUrl(store, path)` with `?p=`, exports none. Where: DES-§4.5.4, §25.1, §27.4 N1, §30 CRIT15.
- **CRIT2-16** (minor): ai uses `sampleGenome(input, { hints, pins })` with `DirectionBrief.pin` → `SampleOpts.pins`,
  `isCallable(now, w)` and `hoursText(w, locale, dateLocale, now)`. Where: AI-§A.8.2, AI-19 acceptance, AI-23,
  AI-§D.1, §D.2, AI-§Q.1, §R.1, §S.3 note, §S.4 R43 / R48, §V QUAL-10.
- **CRIT2-17** (minor): `republishAttached` chooses `sync` vs in-place **by diff** of the materialised mirror against
  the published doc, for every render job of an attached page whatever its reason; `test:storefront-db` case. Where:
  §H.3, §D.5 `render_jobs.dedupe`, §J.2; STO-§17.3; LAN-§17.4.
- **CRIT2-18** (minor): option 1 of the finding: the tick mutex is a `cron_cursors` lease row (`job = 'tick'`,
  compare-and-set, 110 s, renewed per job) holding no connection; lock-pool acquisition is bounded by the lock timeout.
  Where: §E.7, §H.2 (`runTick`, paragraph), §D.5 `cron_cursors`, §H.7, §J.1 `test:jobs`; AI-§N; PLA-§15.1.
- **CRIT2-19** (minor): the wizard e2e is the committed `scripts/qa/e2e/wizard.ts` (P7, `qa:wizard-e2e` in
  `test:e2e`); `test:theme` → `theme:check`, `qa:e2e` → `test:e2e`. Where: §J.3, §K.2 P7 row; AI-§Q.3, §Q.5, §R.1;
  LAN-§3.1, §3.4; PLA-§22.2.
- **CRIT2-20** (minor): storefront's fixed "≥ 1,600 px" replaced by design's H13 (slot- and viewport-relative, mobile-only
  bleed allowed) for `cinematic-bleed` and `immersive`, with `checkHomeDoc` fixtures. Where: STO-§9.3, §9.5, §11.1,
  §11.3 H12, §12.8.
- **CRIT2-21** (minor): T1 takes `sql.ts` / `cache.ts` over at C0a's merge; `src/app/app/[store]/pages/**` outside
  `(editor)` listed in LAN-§26.1; LP-14's section files are D4's (D3 owns `video-hero.ts`). Where: §K.1 C0a and T1 rows,
  §K.5 D3; LAN-§20.2, §26.1, §26.3; DES-§26 D4 row.
- **CRIT2-22** (minor): `test:ownership` reads a committed manifest `docs/saas/ownership-baseline.json` (written per
  phase with `--write-baseline`), never git, and fails when it is missing, so `prebuild` in the archive build gives the
  same answer. Where: §J.1, §J.5, §K.1 C0b, §K.3.

**Rejected in this round: none.** Three findings were applied in the alternative the finding offered (CRIT2-4 option b,
CRIT2-7 option b, CRIT2-18 option 1) and one with a change (CRIT2-5: migration 0004, not 0005, with the reason above).
Re-freeze of the landing chunk: **still not needed** (no rev 5 change touches the frozen chunk).

### P.4 Wording tidy (revision 6)

The confirming critic's ten wording minors (drift only; no decision changes). One line per item: what changed, where.

- **W1**: `createProduct(ctx, { facts })` / `setThemeDraft(ctx, direction)` are the only spellings (core unchanged); the
  stale `scope` forms were fixed in LAN-§4 (store-mode onboarding) and STO-§4.5.
- **W2**: the AI Director's `photoQuality` advice uses design's slot-relative H13 rule (DS54), not a fixed ≥ 1,600 px.
  Where: AI-§A.8.4 (images paragraph).
- **W3**: `republishAttached` handles every render job of an attached page whatever its reason and picks `sync` vs in
  place by diff (CRIT2-17); no text ties it to `prices` / `options` only. Where: §H.2 slot 4 row, §H.3 triggers bullet and
  "The one exception", §K.4 S1 contract-step list.
- **W4**: PLA-§15.2's alarm catalogue lists `signup_unguarded` and names the refusal code `turnstile_required`.
- **W5**: one signup-default rule: `invite` until V13 "human check ready" passes (a configured `platform_turnstile`, the
  new hostnames, a verified test token), then `approval`. Where: D9, §B.2, §C.10 step 3; PLA-§3.1 mode table, §16.3.
- **W6**: rev 5 notes on AI-§B.13 step 3 and the ai review rows OPS-11, ENGP-2 (both rounds), QUAL-10 (round 1) and the
  requests R21 / R27, so no rev 4 wording contradicts "`advanceJob` has no cron driver", the configured-window rule or
  `test:ai-eval` in `test:slow`.
- **W7**: the landing glossary's report link is `reportUrl(store, path)` with `?p=`, on live, test and preview renders
  (§C.6). Where: LAN-§0 glossary.
- **W8**: DES DS4: the builder's `texture` override no longer wins; `data-texture` is always `none`; an owner-chosen
  `grain` is ignored with a one-line builder notice. Where: DES-§0 DS4, DES-§4.5.2 precedence bullet, DES-§4.10.1 grain paragraph.
- **W9**: P2's e2e files are `scripts/qa/e2e/{pulse,admin-perf}.ts`, not the `e2e/*.ts` glob (P7 owns `e2e/wizard.ts`).
  Where: §K.2 closing paragraph.
- **W10**: LAN-§27.4 N2 carries a rev 5 note: `calling-window.json` became `src/lib/callcenter/window.fixtures.ts` (P4).

### P.5 R1.0 integration records (maintainer, 2026-10-27)

What the integration step of §K.1 measured and decided; details in `docs/saas/ccr/r1.0-finale-report.md`.

- **Landing chunk (header freeze rule, ENGC-10): no re-freeze.** `render-check` on the integrated tree measures the
  `landing` chunk at **24,196 B gz** against the recorded **24,200 B** (tolerance 0; the figure T3 measured at its
  merge, CCR r1.0-t3-report), sha256 `ab782be329119b2cc824ab9ea08f844c7fe3c9c495233e05ecb930b4312cef78` pinned in
  `src/landing/runtime/landing.sha256`. It fits, so `budgets.json.landing` stays 24,200 and there is nothing for the
  owner to approve. Headroom is 4 B: from here any byte the frozen chunk gains is an explicit re-freeze recorded in this
  section. The other chunks on the same run (budget + 5 % rule): thanks 6,670 / 6,650, pixels 3,966 / 3,900, turnstile
  1,278 / 1,300, units-matrix 2,184 / 2,200, units-fields 994 / 1,000, fill-steps-box 1,725 / 1,750, whatsapp 5,823 /
  5,800; page caps: page 31,974 / 34,800, thanks-page 10,098 / 12,600.
- **Media pipeline handover (ENGC-32).** `src/lib/media/{process,assets,upload-slots}.ts` are P8's from R1 product
  (§K.2 P8 row, §G.4); `test:ownership` already resolves them to T4 in phase R1.0 and to P8 in phase R1, so the
  handover takes effect when P0 re-writes `docs/saas/ownership-baseline.json` for phase R1 (rev 5, CRIT2-22); the
  baseline is not edited at the integration.
- **`prebuild` runs `gate:offline` (SEC-10).** In an archive build there is no `.git`; `test:ownership` then judges the
  rows only and skips the new-file check (the host may add files beside the extracted archive, and the gate already
  judged that commit). `scripts/qa/gate-ok.ts` (the tail of `npm run gate`) refuses to write `qa/.gate-ok` for a dirty
  tree; `scripts/deploy/archive.mjs` packs `qa/.gate-ok` into the archive so the boot log names the gate commit.
- **Exit scenario (step F2, criterion 5) as `qa:r1-exit`** (§J.3, in `test:e2e`). What it needed in the product:
  the console home gains two R1.0 sections behind `signups.decide`, **Invite codes** (`createInviteCodeAction` →
  T2's `createPlatformInvite`, the code shown once) and **Waiting for review** (`listPendingStores`, the `pending`
  stores with their creator, read-only), because `invite` is the default signup mode with S mode off and R1.0 had no way
  to mint a code; P1's Settings → Signup and `/admin/queue` replace both (approve / reject stay P1's). The orders list
  and drawer mark a test order ("Test", D54; the drawer no longer calls it bot-flagged); a pending store's publish
  answers "Your store is in review…" instead of the generic refusal. Recorded, not changed: the builder route renders
  inside `[store]/loading.tsx`, so another store's page id there (like a missing id) gets the store's not-found screen
  over a streamed HTTP 200 with Next's noindex; route handlers (preview, media, export) answer a real 404.
- **Deleted at the integration:** the legacy `/admin` entry check of review r1.0-t2 F2 (`legacyAdminRefusal`, the
  `permission` option of `requireUser`), the legacy single-tenant matrix of `permissions.ts` (`legacyCan`, `ROLES`,
  `PERMISSIONS`, `ROLE_LABELS`, `isRole`, `permissionsFor`; `SessionUser.role`), today's team functions of
  `users.ts` (`createUser` with its legacy-store membership, `setUserRole`, `setUserDisabled`, `resetUserPassword`,
  the owner form of `resetUserTwoFactor`), the legacy `SecurityPanel` / `TeamPanel`, and the "not implemented: T1/T2"
  fallbacks the R1.0 stubs needed before their tracks merged. `adminAction`, `adminGuard` and the deprecated `rateLimit`
  overload were already gone with T4.
- **`test:slow` in R1.0 (step F3, the first full `npm run gate`).** C0a wired `test:slow` with the R1 product sweeps
  (`test:design:full` of P6, `test:ai:slow` and `test:ai-eval -- --offline` of P7) before their files existed, so the
  gate stopped at `ERR_MODULE_NOT_FOUND` (`scripts/qa/design-check.ts`) and could not be green in R1.0. In R1.0
  `test:slow` runs the sweep that exists, `theme:check -- --full`. The three script names stay in `package.json` as C0a
  declared them, and each joins `test:slow` in the merge that writes its file (P6, P7), the way the R1 suites join
  `npm test` (`test:jobs` and `test:prepublish` are declared and not chained either). §J.1's list is the R1 target.
- **Upgrade dry run on a production-equivalent database (step F4, exit criterion 6).** Production booted once on
  3598537 and nobody ran setup. That first boot's pixel library migration writes an empty `pixel_library` row and two
  system audit rows (`settings.updated`, `pixels.library_migrated`, `user_id` NULL). 0004's S1 counted every non-`auth.*`
  audit row as single-tenant data, so the R1.0 deploy would have created an ownerless store #1 (`store-1`, active,
  `internal`): the gate red at every boot and an orphan store beside the owner's setup store. Fixed before 0004 ever ran
  in production: S1 counts an audit row only when it has a `user_id`; on an empty install `convertLegacyStore()` deletes
  that empty library row before the marker; the pre-tenancy dry run uses the same rule and reports any other
  store-level key left without a store. Editing an applied migration is safe here: drizzle runs files by `folderMillis`
  and never re-reads one it recorded. A database that already ran the old 0004 keeps its result. `test:migrate` (i)
  locks the case.

---

## Q. Request decisions (appendix)

Every "Requests to the core" row of the six part specs, decided. **A** = accepted as written; **A\*** = accepted with
the change named; **R** = rejected (none in rev 2: every request was consistent with the owner rules and the frozen
contracts; seven needed reconciliation with another part's request or with the tick budget). "Where" names the section of
this document that now carries the contract. A part spec whose request was changed updates its own text at its next
revision; until then this appendix wins. §Q.1-Q.6 are the first round (revision 2); **§Q.7 is the second round
(revision 2.1)**: 8 requests, 8 notes and 7 maintainer reconciliations, none rejected, four accepted with a change;
**§Q.8 is the third round (revision 3)**: the requests the six revision-3 parts raised while applying the round-1
review, decided together with §P.

### Q.1 platform.md (PLA-§Q)

| # | Decision | Where integrated |
|---|---|---|
| Q.1 `store_health` | A\*: one table for both audiences (D53) with the tenant columns `issues`, `components` by `HealthGroup`, `snoozed` added; written only by `platform.health`; read by the tenant through `getStoreHealth(scope)` | §D.3, §D.5, §I.7, §F.9 |
| Q.2 `platform_requests` | A | §D.3, §D.5 (verbatim), §F.9 (kept 400 days) |
| Q.3 device marker | A | §B.1 |
| Q.4 staff invites | A | §B.1, §C.3 (`auth` area), §C.4, §D.3, §D.5, §K.2 P1 |
| Q.5 platform permissions | A | §A.3.3, §J.1 `test:permissions` |
| Q.6 preview token minting | A: T3 owns `src/lib/render/preview-token.ts` in R1.0 | §E.2, §C.4, §K.1 |
| Q.7 `onboarding` key | A | §D.10, §K.2 P2 |
| Q.8 pending caps from the setting | A | §A.5.2 |
| Q.9 `scoreSignup` contract and auto-approval | A | §B.2 |
| Q.10 cross-store indexes | A: `orders_created_idx`, `cu_phone_idx`, `users_name_idx`, platform code only with annotation | §D.2, §D.5 |
| Q.11 read APIs frozen at P0 | A | §K.2 P0 list |
| Q.12 R1 file ownership | A | §K.2 P1, P2 rows |
| Q.13 legal seed from code | A | §H.4 |
| Q.14 pulse contract | A\*: + SF-06 (ETag/304, `BroadcastChannel`), `health` and `jobs` fields added to `StorePulse` | §I.4, D57 |
| Q.15 notifications | A | §I.4, §D.4 (`platform_min_role`), §K.3 |
| Q.16 flags | A | §D.4, §E.6 (`invalidateFlags`), §K.3 |
| Q.17 ⌘K commands | A | §I.3, §K.1, §K.3 |
| Q.18 tick budget for platform jobs | A\*: slot 9 gets 3 s guaranteed + up to 6 s leftover; to keep the 100 s sum, slots 1-7 are re-cut (18/12/13/12/11/8/5), `ai.batches` 8 s and `ai.jobs` 1 s are added, `housekeeping` trimmed to 4 s; guaranteed total 95 s | §H.2 |
| Q.19 T2 user functions | A | §K.1 cross-track signatures |
| Q.20 `support_macros` | A (R3) | §D.3, §D.6 |
| Q.21 Web Push | A (R3) | §D.3, §D.6, §D.10 `platform_push`, §H.1 `push`, §K.5 |
| Q.22 `notification_prefs` | A (R2) | §D.3, §D.6 |
| Q.23 audit names | A | §F.5 |
| Q.24 0004 refinements | A | §D.4 (applied list) |
| Q.25 P8 APIs | A | §H.5 |
| Q.26 manifest headers | A | §B.1, §C.3, §F.6 |
| Q.27 lifecycle notifications | A | §A.5.1 |
| Q.28 `platform` schema paths | A | §D.10 |
| Q.29 console route list | A | §I.2, §B.1 |
| Q.30 extra reserved handles | A | §C.7 |
| Q.31 impersonation rules | A | §B.8 |
| Q.32 step-up expiry | A | §B.7, §E.1 |

### Q.2 storefront.md (STO-§29.1)

| # | Decision | Where integrated |
|---|---|---|
| STO-R1 product and context key resolvers | A (R2) | §E.2, D28 (`products.public_key` global) |
| STO-R2 typed doc union + lint L11 | A (R2 contract step) | §D.2, §F.1 |
| STO-R3 boot checks validate `StorePageDoc` | A | §D.8, §H.4 |
| STO-R4 `catalog_redirects` | A | §D.3, §D.6, §C.4.1 |
| STO-R5 `inventory_moves` | A | §D.3, §D.6 |
| STO-R6 `attach_opts`, `product_rev`, `reviews` reason | A | §D.2, §H.3 |
| STO-R7 render cache window id | A | §E.6 |
| STO-R8 `OrderItemsV3` typing and dispatch | A | §D.2, §K.4 |
| STO-R9 `leads.page_id` NULL-able | A | §D.2 |
| STO-R10 public store routes in the suites | A | §C.4, §C.4.1, §F.6 |
| STO-R11 `recordEvent` by kind | A | §D.2 `stats_daily` |
| STO-R12 shared order pipeline, attached pricing, content ids | A (R2 contract step) | §K.4 |
| STO-R13 build scripts, test scripts, store budgets | A | §H.13, §J, §K.4 |
| STO-R14 locale-prefix slugs, `@` template slugs | A | §C.4.1 |
| STO-R15 `/preview/<token>` for store drafts | A (R2) | §C.4 |
| STO-R16 `checkout` key split by file | A | §D.10 |
| STO-R17 `ensureTemplateSet` on mode change and approval | A | §A.2, §A.5.1 |
| STO-R18 S1 owns store branches of shared routes | A | §K.4 S1 |
| STO-R19 R2 cross-track stubs + `catalog_version` bumps | A | §K.4 |
| STO-R20 `products` gauge rule | A | §A.4, §D.7 |
| STO-R21 `coupons.manage`, entitlements, audit, notification kinds | A | §A.3, §A.4, §F.5, §I.4 |
| STO-R22 backups and export ZIP | A | §F.9 (export); §H.6 tables list grows with 0006 (already "every R2 money table") |
| STO-R23 hook registry delivers transitions with items | A: covered by the OPE-§3.6 `before` / `after` snapshots (items, pageId inside) | §K.1 `hooks.ts` |
| STO-R24 `scopedCache` Promise values + per-entry TTL | A | §E.6 (`getOrLoad`) |

### Q.3 landing.md (LAN-§27)

| # | Decision | Where integrated |
|---|---|---|
| Q1 `campaigns` 0005 | A | §D.3, §D.5, D63 |
| Q2 `leads` columns, `phone` NULL-able | A (guarded type change) | §D.2, §D.8 |
| Q3 render add-on hook (T3, R1.0) | A | D62, §H.13, §K.1 |
| Q4 `pages.addons` / `page_versions.addons` 0007 | A | §D.2, §K.5 |
| Q5 budgets (34,800; 12,600; add-ons; R3 keys) | A | §H.13 |
| Q6 `short_links` → 0005, `/go` R1 | A | §C.4.1, §D.3, §D.5, D63 |
| Q7 `page_slug_history` 0005 | A (moved to **0004** in rev 3, ENGC-1) | §D.3, §D.4 |
| Q8 `render_jobs.reason` `store_info` | A | §H.3 |
| Q9 `landing` key | A | §D.10 |
| Q10 `store.confirmation` shape | A | §D.10 |
| Q11 `resolveOrderForTracking`, `resolveKitShare` | A | §E.2 |
| Q12 routes `wa`, `/kit`, `exp`, `upsell-chain` | A: `/kit/*` is its own proxy area `kit` with `auth`-class headers | §C.3, §C.4, §B.1, §F.6 |
| Q13 publish gate registry | A\*: merged with DES-R3 into one registry `src/lib/render/prepublish.ts` (checks + listeners); track files `src/lib/render/prepublish/<track>.ts` (landing's is `prepublish/landing.ts`, not `gates/landing.ts`); codes `honesty_blocked` / `design_blocked` / `budget_blocked` with `items: GateItem[]` (not `issues`); honesty has no warn mode | D51, §M, §E.2, §K.2 P3 |
| Q14 no `aggregateRating` | A | §C.8, §K.1 T3 |
| Q15 `LandingCheckContext` to `buildChecklist` | A (T4, R1.0) | §K.1 |
| Q16 `src/landing/legal/**` to P3 | A | §K.1 T3, §K.2 P3 |
| Q17 operations stubs and event types | A | §K.2 P0 list |
| Q18 ⌘K search provider extension point | A | §I.3, §K.3 |
| Q19 P3 owns `src/components/admin/pages/**` | A | §K.2 P3 |
| Q20 `ad.brief` in R1 behind the flag | A | §K.2 P7, §L.2 AI-20 |
| Q21 test-order plumbing | A (D54; `is_test` columns are core-owned) | D54, §D.2, §C.4.1, §K.1, §K.2 |
| Q22 `recordSlugMove`, slug route consults history | A | §C.4.1, §K.1 T4 |
| Q23 lint allow entries for hit counters | A | §E.6 |
| Q24 reason `product` → `republishAttached` (`sync` versions) | A (D50 refined) | D50, §H.3, §D.2 |
| Q25 catalog content ids on attached landings | A (R2 contract step) | §K.4 |
| Q26 `bumpVersionStats` | A (R2) | §K.4 |
| Q27 `items.chain[]` in order text, Sheet row, CSV | A (R3) | §D.2, §K.5 |
| Q28 R3 contract step for LP-16 (runtime config v3) | A (R3; v2 stays frozen for every other page) | §K.5 |
| Q29 `experiments.manage` | A | §A.3.1, §A.3.2 |
| Q30 add-on bundling in the build script | A | §H.13 |
| Q31 P6 mounts `ProofAttestSheet` | A | §K.2 P6 |
| Q32 0007 tables and indexes | A | §D.3, §D.6, §K.5 |
| Q33 release moves (LP-11, LP-12, LP-18 … LP-24) | A | §L.2, §K.2 P3 waves |
| Q34 mode-switch safeguard | A | §A.2 |
| Q35 notification kinds and audit actions | A | §I.4, §F.5 |
| Q36 retention rows | A | §H.11 |
| Q37 rate buckets | A | §E.8 |
| Q38 R3 renderer support for experiments | A (R3 contract step) | §K.5 |

### Q.4 operations.md (OPE-§Q)

| # | Decision | Where integrated |
|---|---|---|
| Q.1 `orders` 0005 columns and indexes | A | §D.2 |
| Q.2 `lost` status label | A | §D.2 |
| Q.3 releases of `shipments.write`, `finance.*`; keys `accounting` R1, `sheets_sa`, `whatsapp_cloud`, `feeds`; permission text | A | §A.3.1, §A.3.2, §D.10 |
| Q.4 `integration_status` | A | §D.3, §D.5 |
| Q.5 Profit lite tables to 0005 + `profit_alerts` + flag `finance_lite` | A | D63, §D.3, §D.5, §D.4 flags |
| Q.6 `purchaseInBrowser`, reason `conversions`, render-check fixture | A | §H.3, §J.1, §K.1 T3 |
| Q.7 order hook registry shapes | A | §K.1 |
| Q.8 P0 frozen stubs | A | §K.2 P0 list |
| Q.9 P4 / P5 ownership, `newOrderId` export | A | §K.2 P4, P5; §K.1 T3 |
| Q.10 `import_mappings.kind` append | A | §D.6 |
| Q.11 Sheets ≤ 3 calls, `pending_sheets` predicate, `p:sheets:sa` | A | §H.2, §E.8 |
| Q.12 `orders.is_test` | A (D54) | §D.2 |
| Q.13 notification kinds, pulse fields, agent landing path, `payout_ready` | A | §I.4, §B.4, §B.10 |
| Q.14 `receipts` area and purge | A | §G.7, §F.9 |
| Q.15 `wa_messages`, `stock_purchases` | A (R3) | §D.3, §D.6 |
| Q.16 `--info` token | A | §I.6 |
| Q.17 `settings/anti-spam` to P5 | A | §I.1, §K.2 P5 |
| Q.18 `onLeadCreated` hook | A (R2) | §K.4 |
| Q.19 area `api-v1`, `orders_updated_idx` | A (R3) | §C.3, §C.4, §C.5, §D.2, §K.5 |
| Q.20 export ZIP files and exclusions | A | §F.9 |
| Q.21 buckets | A | §E.8 |
| Q.22 jobs in slots | A | §H.2 |
| Q.23 audit actions | A | §F.5 |
| Q.24 CAPI stale margin | A | §H.1 |
| Q.25 `commission_rule_ids`, `agent_earnings` key | A | §D.6, §D.8 |

### Q.5 ai.md (AI-§S)

| # | Decision | Where integrated |
|---|---|---|
| R1 P7 files and `(console)/ai` | A | §K.2 P7, P1; §I.2 |
| R2 `ai_batches` → 0005, `ai_batch_items`, `ai_eval_runs`, `ai_usage_daily`, `ai_models` | A | §D.3, §D.5, §D.6 |
| R3 `ai_credits_day`, `period varchar(10)` | A | §A.4, §D.2, §D.7 |
| R4 `chargeUsage` `allowOver` | A | §A.4, §D.7 |
| R5 pending `ai_credits_month` cap | A | §A.5.2 |
| R6 `platform_ai_secret`, env fallback | A | §D.10, §H.7 |
| R7 `src/lib/ai/platform/**` allowlisted | A (D64) | §E.3 rule 6, §F.1 |
| R8 `ai.batches` slot, hourly/daily ai jobs, `syncPromptVersions()` at boot | A\*: `ai.batches` keeps 8 s but `renders` is trimmed to 12 s, `exports` to 11 s and slot 6 to 8 s so the guaranteed sum stays at 95 s | §H.2, §H.4 |
| R9 AI retention | A | §H.11 |
| R10 AI audit actions | A | §F.5 |
| R11 AI buckets | A | §E.8 |
| R12 notification kinds | A (+ `ai.job_done`) | §I.4 |
| R13 P0 stubs (`runAi`, `queueAi`, …, `aiStoreSummary`, `aiHealth`) | A | §K.2 P0 list |
| R14 design APIs P7 calls | A | §K.2 P0 list |
| R15 mount contract (P6, P2, P1 mount P7's components) | A | §K.2 P6, P7 |
| R16 conversion writes `store_ai` with `localEnabled` | A | §D.8 |
| R17 `ai_memory.json` in the export | A | §F.9 |
| R18 `aiHealth()` in `getHealth` | A | §H.5 |
| R19 `ai.assist` | A (R3) | §A.3.1, §A.3.2 |
| R20 release flags | A | §D.4 |
| R21 `@anthropic-ai/sdk`, test scripts | A | §J.1, §J.3, §K.2 P7 |
| R22 S7 files, `bumpVersionStats` call line, `linkAiRuns`, `recordPublishFeedback` | A (R2; `recordPublishFeedback` is also a §M listener) | §K.4, §M.1 |
| R23 operations interfaces for D4 | A (R3; recorded for the D2/D4 contract step) | §K.5 |
| R24 `brand.voiceSummary` derived | A | §D.10 |
| R25 kill switch stops Batch submission | A | §H.8 |

### Q.6 design.md (DES-§27)

| # | Decision | Where integrated |
|---|---|---|
| DES-R1 `ThemeSpec.look` and the DES-§4.1 constants in the frozen schema | A\*: accepted as the **one** additive, optional, default-free change to PageDoc v2 in R1; the maintainer applies it in C0; render-check and the boot checksum task assert 0 changed checksums | header, §K.1, §J.1 |
| DES-R2 P6 / P2 / S2 files and extension registrations | A | §K.2 P6, P2; §K.4 S2; §K.3 |
| DES-R3 `prepublish.ts` registry, `design_blocked`, `page.publish.design_override` | A\*: merged with LAN Q13; one registry carries design, honesty and budget checks; `GateItem` is the shared item type | D51, §M, §E.2, §F.5 |
| DES-R4 A (R2 theme resolution) and B (R1 `brand` re-render) | A | §H.3, §K.4 |
| DES-R5 `css` budget key | A | §H.13 |
| DES-R6 `harfbuzzjs`, `clipper-lib` after the S2 spike | A (R2) | §K.4 |
| DES-R7 scripts, `prebuild`, `.gitignore` | A | §J.1, §J.2, §J.3, §K.4 |
| DES-R8 `platform_design` key | A | §D.10, §M.1 |
| DES-R9 novelty allowlist, pinned 3 | A (D64) | §E.3 rule 6, §F.1 |
| DES-R10 table refinements (`design_genomes`, `headline_shingles`, `store_themes`, `design_archive`) | A | §D.6; `design_genomes` / `headline_shingles` per DES-§2.1-2.2 at P0 |
| DES-R11 `brandIcon` in `document.tsx` | A (a maintainer CCR in R1 product; R2 adds `apple-touch-icon`) | §K.3 |
| DES-R12 design table sizes in `getHealth` + 300 MB alarm | A | §H.5 |
| DES-R13 `tenancy-cases/*.ts` | A | §F.1, §K.1 T4 |
| DES-R14 `keepPng` media option | A (R2) | §K.4 |
| DES-R15 audit actions | A | §F.5 |
| DES-R16 `brand` schema from R1.0; `store.logo` moves | A | §D.10, §D.8 |
| DES-R17 core text updates (IBM Plex Sans Arabic, `--ui-spring` removed, motion/RTL tests, brand re-render note, verdict bands) | A | §I.6, §J.1, §H.3, §F.2 |

### Q.7 Second-round requests and notes (revision 2.1)

The six part specs at revision 2 raised **8 unavoidable requests** and **8 notes**; every one is decided here (**A** =
accepted as written, **A\*** = accepted with the change named, **N** = a note that needed no new contract but whose
body text is now fixed). The maintainer's own reconciliations found while checking the parts against the body are
listed as **M** rows so a reviewer sees every change of revision 2.1 in one place. Where a part's revision-2 text differs
from a row below, this appendix wins until the part's next revision.

| # | Request / note | Decision | Where integrated |
|---|---|---|---|
| DES-R18 `src/landing/primitives/{SectionHeader,RichText,Price,Countdown,Badge,MarqueeTrack,Kicker}.tsx` to P6 | **A** (the file-level grant, not the CCR alternative): the seven files join the P6 row; the other 18 files of the folder stay read-only; every change additive, byte-identical markup for docs without `look`, no runtime bytes; P3's `orderForm/**` and `thankyou/**` consume the primitives through existing props so wave 1 builds before P6 | §K.2 P6, §K.3 |
| DES-R19 `estimateHeights` / `variantFeatures` typed stubs at P0 | **A\***: added to the P6 P0 stubs with `HeightReport` / `FoldReport` / `VariantFeaturesResolved` frozen in `src/lib/design/types.ts` (those three shapes are maintainer-frozen; the rest of the file is P6's; **superseded by rev 4 / rev 5, CRIT9 / CRIT2-2:** the shapes live in the maintainer's `src/lib/design/types.frozen.ts`, P6's `types.ts` re-exports them); the DES-§5.3 signature `estimateHeights(doc, { look, locale, features })` is the one frozen (DES-§4.9's shorter form is superseded); `variantFeatures` lives in `src/lib/design/features.ts` re-exported from `src/lib/design/index.ts`; the **stub rule** (`stub: true` → C2/C3/F1 as notes until P6 merges, hard fixtures enabled at the P6 merge) is the change | §K.2 P0, §M.2, §K.3 |
| DES-R20 kicker-optional schemas and `mergeAiCopy` honouring `CopyDirectives.kickers` | **A** (confirmed as P7's duty): both `PageCopy` schemas `.optional()` on every `kicker` (`copy-schema.ts:113-151`); `mergeAiCopy(library, ai, ctx)` (`guard.ts:114`) gains `ctx.kickers?: ReadonlySet<string>` and drops library and model kickers alike for sections outside the set; P6's wizard passes the set | §K.2 P7 |
| AI R26 `aiJobsForPulse` as the producer of `StorePulse.jobs` | **A\***: added to the P7 P0 stubs in `src/lib/ai/jobs/pulse.ts`; the change is the `since` contract (the poller sends `?since=<iso>` = the `at` of its last 200; the route clamps to [now − 10 min, now], default now − 30 s) and the field's place in the uncached per-user half of the payload | §I.4, §K.2 P0, §J.2, §J.3 |
| STO-R25 `registerBudgetProfile(kind, profile)` + the storefront prepublish import | **A\*** (D66): the hook exists in the core's `budget.ts` from P0 (so the file is written once), keyed by the `pages.kind` enum (not `StorePageKind`, which does not exist until R2); hard values are **clamped to the D52 ceilings** (a profile only tightens); the import of `prepublish/storefront.ts` and the registrations happen in the R2 contract step; the `storefront:*` items of STO-§23.6 ride the same check function | D66, §M.2, §K.3, §K.4, §F.1 |
| STO-R26 `store-page` 41,000 → 43,000 B at the R3 contract step | **A** (restated in rev 3 as the derived 42,500 B, STO ENGP-31; §Q.8) | §H.13, §K.5 |
| STO-R27 one audit name per attach event | **A** (the "drop" option): `store.landing.attached` / `store.landing.detached` removed from §F.5; `page.attached` / `page.detached` with `{ productId }` are the names whichever screen starts the flow | §F.5 |
| OPE Q.26 audit names `integrations.outbox.replayed` (R1), `finance.period_closed` / `finance.period_reopened` (R2); bucket `s:<sid>:replay:<uid>` 30/h | **A**; `integrations.manage` (sensitive) is the permission, named in §A.3.1 | §F.5, §E.8, §A.3.1 |
| LAN N1 `recordPublishFeedback` listed under two listeners | **N**: ai is the one caller; §M.1 rule 4 fixed | §M.1 |
| LAN N2 `etaWindowText` is storefront's STO-§15.8 shape | **N**: named in the P3 P0 stubs and in the STO-R19 list of the R2 contract step; S1 writes nothing in `src/lib/delivery/**` | §K.2 P0, §K.4 |
| LAN N3 `/go/<code>` 308 with `Cache-Control: private, no-store` | **N**: §C.4.1 and the §F.6 redirect row say it; `qa:headers` asserts it | §C.4.1, §F.6, §J.3 |
| PLA N1 `ActionErrorCode` keeps an open tail | **N** → **D65**: the tail stays, with the `error.<code>` i18n rule and the generic fallback; the nine platform codes listed for autocomplete | D65, §E.2 |
| PLA N2 `addImpersonationNoteAction` from a tenant route | **N**: §B.8 states the seam behaviour; §F.1 pins it as an attack case | §B.8, §F.1 |
| M1 i18n file overlap (`health.ts` claimed by P1 and P2; P2's `src/lib/i18n/**` glob) | **D67**: one file per track, texts live with their owner; P2's `health.ts` = ring chrome only; P1's `notify.ts` = platform kinds only | §I.5, §K.2 P1/P2, §K.3 |
| M2 health engine files and `computeHealth` location (PLA-§P.1 vs the P1 row) | registry import lines pre-written by the maintainer at P0; P1 owns `engine.ts`, `inputs.ts`, `platform-flags.ts`, `rules/platform.ts`, `selftest.ts`; `computeHealth` in `src/lib/platform/health-score.ts` re-exported by the engine | §I.7, §K.2 P1 |
| M3 demo steps (`scripts/qa/wow-demo/steps/*.ts` in platform.md vs `qa/e2e/steps/landing-*.mjs` in landing.md) | the committed folder wins: `scripts/qa/wow-demo/steps/<track>.ts` is an extension point; `qa/e2e` stays the optional local harness | §J.3, §K.2, §K.3 |
| M4 storefront R2 job times left open (STO-§27.2 "nightly") | `catalog.stock_reconcile` 02:20, `catalog.collections` 02:30, `catalog.bestsellers` 03:40; `stock.holds_expire` 1 s in slot 7 (R3) | §H.2 |
| M5 stale path in PLA-§P.1 (`src/app/admin/ai/**`) | the core's `src/app/admin/(console)/ai/**` (P7) stands; a part text fix at platform.md's next revision, no core change | §I.2, §K.2 P1/P7 |
| M6 two `estimateHeights` signatures inside design.md (DES-§4.9 module table vs DES-§5.3) | the DES-§5.3 typed signature is frozen (see DES-R19); a part text fix at design.md's next revision | §K.2 P0, §M.2 |
| M7 attack-case files named by the parts (`ops.ts`, `integrations.ts`, `ai.ts`, `platform.ts`, R2 `storefront.ts`) | listed in §F.1 and in each track's row | §F.1, §K.2, §K.4 |

Second-round requests are now closed. A part's next revision records only contradictions it finds between its text and
§Q.1-Q.8; the maintainer decides them in §P with the review, never by reopening a frozen seam.

### Q.8 Third-round requests (revision 3; raised by the parts while applying the round-1 review)

One row per request of PLA-§Q.3, STO-§29.4, LAN-§27.3, OPE-§Q.27, AI-§S.3 and DES-§27.3 that names the core (requests
addressed to a sibling part only are listed as **S** = sibling, with the receiving part named; the core carries no text
for them). Codes: **A** accepted as written, **A\*** accepted with the change named, **R** rejected with the reason.

| # | Request | Decision | Where |
|---|---|---|---|
| PLA Q3.1 | SEC-1 core side (Turnstile gate, `pending_stores`, two-tier media cap, shared disk budget, refund on transition, metrics) | **A** (D69) | §A.4, §A.5.1, §A.5.2, §B.2, §G.4, §D.7, §D.10 |
| PLA Q3.2 | `platform_ai.caps.pendingSharePct`, `ai_cost_micros_pending`, `aiHealth()` slice | **A** | §A.4, §A.5.2, §D.10 `platform_ai`; the ai side in AI-§C.2 / §C.3 |
| PLA Q3.3 | `StoreScope.kind` "impersonation", masking in operations' read functions, the canary case | **A** (D70; `kind` already existed in §E.1, the seam now sets it) | §E.1, §B.8, §F.1, §K.2 P0 |
| PLA Q3.4 | `abuse_reports` → 0005, `/report/<handle>`, footer link, `honesty:password_field`, `listPagesForConsole` columns | **A\*** (D76): the footer link is an **absolute** URL to the platform origin and store hosts answer 404 for `/report/*` like `/kit/*` (not a 308: `/kit` does not 308 either, §C.4) | §B.1, §C.3, §C.4, §D.3, §D.5, §F.9, §M.3, §K.1 T4, §K.2 P1 |
| PLA Q3.5 | `__Host-sgl` in the cookie row, the `__Host-` rule, the edge-sim assertion | **A** | §C.9, §J.3 |
| PLA Q3.6 | P2 / P1 / T3 ownership fixes, the glob-intersection script | **A** (`scripts/qa/ownership-check.ts`, `test:ownership`) | §K.1, §K.2, §K.3, §J.1 |
| PLA Q3.7 | `is_test` / `page_slug_history` placement | **A** (0004) | §D.2, §D.3, §D.4, §D.8, §K.1 |
| PLA Q3.8 | storefront: `productAsPageDoc(direction)`, `createProduct`, `setThemeDraft` | **S** (storefront; the core names the three in the R2 contract step) | §K.4, §A.2 |
| PLA Q3.9 | design DES-§14.3 three-fold reveal | **S** (design accepted, DES-§28 UX-20) | — |
| PLA Q3.10 | design `hasCutout: "estimated"`, `render_jobs.reason` `cutout`, ai AI-21 | **A** for the core's enum (DES-R22); the rest **S** (design, ai accepted) | §D.5, §H.3 |
| PLA Q3.11 | design / landing aurora removal | **S** (both accepted); the core's D60 rev 3 states the admin side | D60, §I.6 |
| PLA Q3.12 | landing rule `landing:fee_mismatch` over `zones.feeMismatchTop5` | **A** (named in §I.7); LP-16 timing decided by D75 | §I.7, §K.4 |
| PLA Q3.13 | OPS-11 one hours source | **A** (D73) | §D.10, §K.2 P0 |
| PLA Q3.14 | OPS-1 one city key | **A** (D68) | §D.5, §K.2 P0, §J.1 |
| PLA Q3.15 | OPS-9 option (a) | **A** (D74) | §D.2, §A.3.1, §I.1 |
| PLA Q3.16 | `npm test` ≤ 3 min, `test:slow` | **A** | §J.1, §J.5 |
| PLA Q3.17 | LAN-§14.3 permission | **S** (landing fixed it) | §H.11 names `settings.write` |
| PLA (note) | `brand_protected` error code | **A** | §E.2 |
| STO-R28 | one canonical `CityKey` (details) | **A** (D68) | §D.5, §K.2 P0, §J.1 |
| STO-R29 | `gateInputFor`, union types at the R2 step, `FoldReport.items` widening, utility kinds never pooled, fixtures per kind | **A** | §M.1, §M.4, §K.2 P0, §K.4, §J.1 |
| STO-R30 | freeze `quoteManualOrderV3` / `createManualOrderV3` / `editOrderV3` for S3's sheet; operations routes the sheet; OPE-§11.1 step 5 calls `createOrderRow` | **A** (the functions are S1's; S4 owns the sheet's store branch per OPE Q.27h) | §K.4, §J.2 |
| STO-R31 | LP-16 into the R2 contract step | **A** (D75) | §K.4, §K.5, §L.2, §H.13 |
| STO-R32 | `ops.callingWindow` one source, ISO weekdays, P0 stubs, mirrors or drop | **A\*** (D73: the two mirror keys are **removed**, no mirrors) | §D.10, §K.2 P0 |
| STO-R33 | design DES-§11.1 commerce register wording | **S** (design accepted, DES-§28 UX-21) | — |
| STO-R34 | calibrated bands on C2 / C3 / F1, `heights.json`, Playwright as calibration, 390 × 844 only | **A** | §M.2, §J.1 |
| STO-R35 | `createOrderRow` extracted by T3 in R1.0 | **A** (D72) | §K.1, §K.4 |
| STO-R36 | ownership carve-outs, `ownership-check.ts`, S1 owns the route files whole, `wrapInStoreChrome`; OPS-14 PDP reveal | **A** | §K.2, §K.3, §K.4, §A.2 |
| STO-R37 | landing `checkout.addressMode`, OF4 ergonomics | **S** (landing accepted `addressMode` and the control heights, rejected the sticky submit with a reason); the core carries the key field | §D.10 `checkout` |
| STO-R38 | brand checks at every write, `platform:brand_term_live`, `honesty:password_field`, `abuse_reports` endpoint; SEC-5 masking | **A** (D76, D70) | §C.7, §F.8, §M.3, §I.7, §B.8 |
| STO-R39 | N8 hard for cloud / local-AI **and owner-typed** lines, soft for library lines; the generative skeleton layer; the 30-store corpus test | **A\***: hard on generated lines (cloud, local, engine), **soft on owner-typed lines** (§M.1 rule 2 and design's DES-R24 / ENGP-9 agree) and soft on library lines; the corpus test adopted | §M.4 |
| STO-R40 | `npm test` ≤ 3 min, seeded subsets, `test:slow` | **A** | §J.1 |
| STO-R41 | the `assist` "Recharger" button (landing); T3 derives the prefix once, re-measures, records size + sha256; `product` publishes `sync` for `prices` / `options` only | **A** for the core's part (prefix once, re-measure, `landing.sha256`, the `sync` split); the "Recharger" button is **S** (landing); render-check's rule for `landing` is **tolerance 0**, not +5 % (ENGC-10) | header, §C.9, §H.3, §H.13, §K.1 T3 |
| STO-R42 | records OPS-9 (a), ENGP-3, ENGC-1, OPS-20 | **A** (all four in the body) | D74, §D.5, §D.2 / §D.4, §H.11 |
| STO ENGP-31 | `store-page` derived (`ceil500(Σ heaviest set)`, 41,000 → 42,500) | **A** (supersedes STO-R26's 43,000) | §H.13, §K.5 |
| STO ENGP-27 | "four" frozen `src/storefront/*` files | **A** | §K.4 |
| LAN R1 | one city key; `zoneLineFor(scope, cityKey: CityKey \| null, at?, opts?)`; `cityKey` pure; `ZoneTable.city` keyed by the posted value | **A** (D68) | §K.2 P0, §D.5 |
| LAN R2 | OPS-9 option (a) columns, Sheets pull in R1, Carrier CSV | **A** (D74) | §D.2, §A.3.1, §L.2 IN-09 |
| LAN R3 | `callingWindowFor` P0 stub, ISO weekdays, `confirm_hours` derived, the core removes `hours` from `store.confirmation` | **A** (D73; `Promise<EffectiveWindow>` per operations, the owner of the type, not `CallingWindow \| null`) | §D.10, §K.2 P0 |
| LAN R4 | LP-16 to the R2 contract step, `export:runtime_v3_unsupported`, `both`-mode default, §L.2 / §K.4 / §K.5 / `budgets.json` | **A** (D75) | §K.4, §K.5, §L.2, §H.13 |
| LAN R5 | store-mode onboarding sets `landing.inStoreMode = true` when it creates a page; UX-01 case | **A\***: the primary rule is platform's PD60 rev 3 (store mode creates **no** landing page); the `inStoreMode = true` write is the fallback should any path create one | §A.2 |
| LAN R6 | `createManualOrderV3` / `editOrderV3` in the R2 step; sheet routed by `sel.v`; S1 pricing, P4 / S3 sheet | **A** (S1's functions, S4's sheet) | §K.4, §K.2 P0 |
| LAN R7 | none (OPS-20) | — | §H.11 |
| LAN R8 | `is_test`, `page_slug_history` to 0004 | **A** | §D.2, §D.3, §D.4, §D.8, §K.1 |
| LAN R9 | ENGC-8 ownership fixes | **A** | §K.1, §K.2 |
| LAN R10 | `createOrderRow` in R1.0 | **A** (D72) | §K.1, §K.4 |
| LAN R11 | ENGP-1 design adapter, `checkFold`, novelty exemption | **A** (design DES-§8.13) | §M.1, §K.4 |
| LAN R12 | `estimateHeights` honours `features.h fixed`; the 1.1-screen form | **S** (design accepted); the core names the behaviour in the P0 stub | §K.2 P0 |
| LAN R13 | §M.2 bands, `heights.json` | **A** | §M.2 |
| LAN R14 | §M.1 rule 2 proof classes, `page.fact_attested`, `recordFacts`, one `origin` builder | **A** | §M.1, §F.5, §K.2 P0 |
| LAN R15 | budget counts exclude non-control arm wrappers | **A** | §M.2, §K.5 |
| LAN R16 | none (ENGP-20) | — | — |
| LAN R17 | `npm test` ≤ 3 min, `test:slow` | **A** | §J.1 |
| LAN R18 | T3 re-measures and records; prefix once; +5 % stays | **A\*** (tolerance 0 for `landing`, ENGC-10) | header, §K.1 T3, §J.1 |
| LAN R19 | design DES-§5.9 / V27 CSS hooks | **S** (design accepted, DES-§28 UX-4) | — |
| LAN R20 | storefront reads `checkout.addressMode` | **S** (storefront accepted) | §D.10 notes it |
| LAN R21 | storefront touch ergonomics | **S** (storefront accepted) | — |
| LAN R22 | design celebration, admin lint | **S** (design and platform accepted); D60 rev 3 | §I.6 |
| LAN R23 | `short_links` typed targets; `notifications.link` validated | **A** | §D.5, §I.4, §C.4.1 |
| LAN R24 | brand-term checks, health rule, abuse report are platform's | **A** (D76) | §C.7, §F.8, §I.7 |
| LAN R25 | no landing side for the listed ids | — | §P |
| OPE Q.27a | orders 0005 columns and enum values | **A** | §D.2 |
| OPE Q.27b | orders 0006 `refunded`, refund columns | **A** | §D.2 |
| OPE Q.27c | `is_test` in 0004 | **A** | §D.2, §D.8 |
| OPE Q.27d | `createOrderRow` by T3, `newOrderId` withdrawn | **A** (D72) | §K.1 T3 |
| OPE Q.27e | `callingWindowFor(scope): Promise<EffectiveWindow>`; `cityKey` pure and isomorphic | **A** | §K.2 P0 |
| OPE Q.27f | `zoneLineFor` / `zoneForCity` widened to `CityKey \| null` | **A** | §K.2 P0 |
| OPE Q.27g | P2 `team/**` exclusion, the intersection script | **A** | §K.2, §J.1 |
| OPE Q.27h | freeze the v3 functions; **S4 owns `src/lib/orders/{manual-v3,edit-v3}.ts`** and the sheet's store branch; S1 exposes `priceLine`, `storeDeliveryFee`, `productAsPageDoc`, the picker | **A\***: S4 owns the sheet's store branch and the `carrier-csv` xlsx route; **the functions are S1's** in `src/lib/catalog/order-v3.server.ts` (STO-§16.9), so `src/lib/orders/{manual-v3,edit-v3}.ts` do not exist; one pricing owner for the public and manual v3 paths | §K.4 |
| OPE Q.27i | `agents` gauge predicate | **A** | §A.4 |
| OPE Q.27j | `StoreScope.kind = "impersonation"` for masking | **A** (D70) | §E.1, §B.8 |
| OPE Q.27k | `store.confirmation.hours` and `policies.contact.hours` as mirrors; `accounting` and `ops` additions | **A\*** (removed, not mirrored, D73; the key additions accepted) | §D.10 |
| OPE Q.27l | `fr` with `en` in R1 for `ops.` / `int.` / `fin.` | **A** (D36 refined) | §I.5 |
| OPE Q.27m | audit names, `s:<sid>:inbound:<uid>` | **A** | §F.5, §E.8 |
| OPE Q.27n | demo presses `N` from the demo store owner's session; seed sets `openOverrideUntil` | **A** | §J.3, §K.2 exit 12 |
| OPE Q.27o | `product_costs.sku`, `carrier_accounts.settlement` + `self`, `cod_fee_flat_cents`, `shipments.kind`, `phone_digits` + `probable`, `finance_daily.refund_cents` / `missing_rates` | **A** (recorded) | §D.5, §D.6 |
| AI R27 | `ai.jobs` slot budget | **A** (option 1: 1 s guaranteed + the leftover of slots 1-5 up to 20 s; a stage advances only on an idle tick); **superseded in rev 4 by §Q.9 AI R41** (no model call inside the tick, leftover ≤ 5 s) | §H.2 slot 4c |
| AI R28 | `ai_cost_micros_pending`, `ai_credits_director` | **A** | §A.4, §D.7 |
| AI R29 | `aj_active_uq` on `active`; `stage_attempts`, `driver`, `progress.plan` | **A** | §D.5, §H.12 |
| AI R30 | pending daily floor 10 | **A** | §A.4, §A.5.2 |
| AI R31-R36 | design-side contracts (`design.plan`, `GenomeCard` exports, pins, 12 candidates, acceptance rule, learned factor, jury, typography text, `gateInputFor` digest) | **S** (design accepted, DES-§28); the core names the exported vocabulary and `pins` in the P0 stubs | §K.2 P0 |
| AI R37 | `order_events.actor_kind` `'integration'` / `'reconciliation'` | **A** (R2 contract step) | §K.4 |
| AI R38 | platform queue card shows pending AI credits | **S** (platform) | — |
| AI R39 | `npm test` ceiling | **A** | §J.1 |
| AI R40 | audit names, `ai.pending_share_reached` | **A** | §F.5, §I.4 |
| AI (P7 row) | `store_ai.director = null`, `caps` additions, `evalGate.jury` / `canary`, `AiFailCode` codes, `AiPolicy` fields, flag `ai_detached_jobs` | **A** | §D.10, §E.2, §K.2 P7, §H.12 |
| DES-R21 | `scripts/sync-fonts.mjs` measures the Arabic subset (`metrics.ar`), seven `@fontsource` devDependencies | **A** (maintainer CCR in R1 product; each face after the licence / modernity / size check; `package.json` and the script are the maintainer's, the sample list P6's; rev 5, CRIT2-7: the step needs the WOFF2 `glyf` / `loca` reconstruction, now the maintainer's shared `scripts/fonts/woff2-sfnt.mjs` in R1) | §K.3 |
| DES-R22 | `render_jobs` reason `cutout` | **A** | §D.5, §H.3 |
| DES-R23 | §M.2 fold zones, bands, `heights.json` | **A** | §M.2 |
| DES-R24 | §M.4 clone-block wording (`τ_niche(n)`, N2 same product, N8 / D3 by origin) | **A** | §M.4 |
| DES-R25 | P6 row `src/app/dev/fixture/design/**` | **A** | §K.2 P6 |
| DES-R26 | `npm test` ≤ 3 min, `test:slow` | **A** | §J.1 |
| DES-R27 | types widened at the R2 contract step; `checkFold` thin | **A** | §K.2 P0, §K.4 |

Third-round requests are now closed with the round-1 review. The parts' next revision records only contradictions they
find between their text and §P / §Q.8.

### Q.9 Fourth-round notes (revision 4; the contradictions the parts recorded in round 2)

One row per note of PLA-§Q.4, STO-§29.5, LAN-§27.4, the OPE-§R2 maintainer notes, AI-§S.4 and DES-§27.4 that names
the core, plus the sibling notes the core had to arbitrate. Codes as in §Q.8 (**A**, **A\***, **R**, **S** = a
sibling's text only, receiving part named; **—** = nothing left to do). Where a part's revision-4 text differs from a
row below, this row wins until the part's next revision.

| # | Note | Decision | Where |
|---|---|---|---|
| PLA Q4.1 | `reportUrl(store, pagePath?)`; `reportHref` in the store context; renderers P6 / P3 / S1 | **A\***: the builder as written; the context field is named **`links.report`** (`PageLinks.report`, the name design and landing use), not `reportHref`; one UiKey `footer.report` carries platform's `shell.report.link` wording | §C.6, §H.13, §K.2 P0, D76 |
| PLA Q4.2 | `consoleHref` ADMIN_HOST-aware; V12 | **A** | §C.6, §C.10 step 3 |
| PLA Q4.3 | notification link rule widened; refused → `NULL` | **A** | §I.4 |
| PLA Q4.4 | `getStoreHealth` → `\| null`, `staleAfterMin`; `brand_term_live` "at least nightly" | **A** | §I.7, §K.2 P0, D76, §C.7, §F.8 |
| PLA Q4.5 | derived flags add no points; "no published page" = P3's rule; `int:sheets_backlog` scaled | **A** (core side); the OPE-§27.2 threshold is **S** (operations) | §I.7 |
| PLA Q4.6 | LAN-§23.7 lists `landing:fee_mismatch` | **S** (landing added it in rev 4, LAN-§23.7) | §I.7 names it |
| PLA Q4.7 | `/app/account/danger`; `deleteUserAccount(ctx: UserCtx \| PlatformCtx, target?)`, `owns_store` / `is_staff` | **A** | §B.1, §I.1, §E.1 `UserCtx`, §E.2, §F.9, §K.1 T2 |
| PLA Q4.8 | `stepUpWithPasswordAction` signature; `StoreCtx.stepUpUntil` | **A** | §B.7, §E.1, §E.2 |
| PLA Q4.9 | alarm codes `data_dir_70` / `data_dir_85`, `health_job_slow`, the scaled stale rule | **A** | §H.5 |
| PLA Q4.10 | console read stubs carry `pageId \| null`, `lines` (R2), `carrierLabel`, `trackingRef`, `carrierExportedAt` | **A** (named in the P0 stub list); the signatures are **S** (operations OPE-§M) | §K.2 P0 |
| PLA Q4.11 | `aiUsageForStore` returns `creditsUsed`, `creditsLimit`, `costMicros` | **A** | §K.2 P0 ai stubs |
| PLA-§Q.1 (rev 4 list) | `platform.user.deleted`, `meta.stepUp`, codes `owns_store` / `is_staff` / `category_required` | **A**; platform's `store.brand_refused` takes the core's name `store.brand_term.refused` with meta `{ field }` (S, platform renames) | §F.5, §E.2 |
| STO C1 | D68 / §K.4 S1 say slugs in the browser | **A** (CRIT1) | D68, §K.4 S1, §K.2 P0 |
| STO C2 | name `configured`, `shopperPromiseAllowed`, `window.fixtures.ts` in D73 / P0 | **A** (CRIT3) | D73, §K.2 P0, §J.1 |
| STO C3 | N8 library lines soft | **—** (design rev 4 aligned) | §M.4 |
| STO C4 | one fee-mismatch rule; the input covers attached pages | **A** | §I.7 |
| STO C5 | `createProduct(ctx, …)`, `setThemeDraft(ctx, …)`; `storeAction` hands a `WriteScope` ctx | **A** (`WriteCtx` overloads) | D71, §A.2, §E.1, §E.2, §K.4 |
| STO C6 | `catalog_version` bump on window writes and on the `cutout` handler | **A** | §K.4 contract step |
| STO C7, C8, C10, C11, C12 | resolved inside storefront or by the siblings' rev 4 | **—** | — |
| STO C9 | `nicheShares.seq4` per page-kind family | **S** (design: compute `seq4` per family, `landing` vs `home` / `page`, or a top 20 per family; the store home re-draw reads its own family) | — |
| STO (note) | one helper builds landing's `links.report` and the storefront's `StoreLinks.report(path)` | **A** (`reportUrl`) | §C.6 |
| STO (note) | `critique.doc` accepts a `StorePageDoc` through `gateInputFor`; utility kinds get no Director button | **S** (ai) | §K.4 S1 (AI-19 consumer) |
| STO (note) | `honesty:password_field` exports its pattern list | **A** (the core states it; the export is P3's) | §M.3, D76 |
| STO (note) | exactly one report link per document (tracking wrapped by the store chrome, policies inside `StoreDocument`) | **A** (D76 "exactly once"); the rendering rule is **S** (landing LAN-§3.9, storefront STO-§10.3) | D76 |
| LAN N1 | D68, §K.2 P0, §I.7 `zoneFeesFor`, §J.1 key-shape case, the fixture's `zoneTableKey` | **A** | D68, §K.2 P0, §I.7, §J.1 |
| LAN N2 | one window container; drop the mirror writes; `store_info` re-render on a window save; export `DEFAULT_WINDOW`; `scripts/qa/fixtures/calling-window.json` | **A\***: all accepted except the fixture's place: the one window fixture is **operations' `src/lib/callcenter/window.fixtures.ts`** (OPE-§R2: inside P4's folder, typed data, no new ownership row), read by `test:ops`, `test:delivery`, `test:landing-addons` and `test:catalog`; landing points its scripts at it (S) | D73, §H.3, §K.2 P0, §J.1 |
| LAN N3 | drop the form-height clause of `budget:F1` | **A** | §M.2 |
| LAN N4 | `links.report` for live, test and preview, undefined in exports; Shell fallback; P6 footer; PLA-§24.2 404 not 308 | **A** (the core keeps landing's "live, test and preview" over design's "live only": a test render and a preview must stay byte-comparable with the live document, and a report link on a private preview harms nothing because `/report/<h>` answers the same thank-you for any handle); the platform wording is **S** (platform) | §C.6, §H.13, §K.2 P0, D76 |
| LAN N5 | the lead read functions are P3's `src/lib/leads/read.ts` | **S** (platform PLA-§7.2, Q3.3); the core names the file in the P3 row | §K.2 P3 |
| LAN N6 | `src/lib/editor/selftest-checklist.ts` to P3 | **A** | §K.2 P3 |
| LAN N7 | §K.5 D3: "LP-16 PHP side only" | **A** | §K.5 |
| LAN N8 | storefront's "+5 %" wording for the landing chunk | **S** (storefront STO-§29.4 R41 / §14.1: tolerance 0 against `budgets.json.landing` and `landing.sha256`) | header freeze rule |
| LAN N9 | "Proven by" maps in every part | **A** (the core rule); the maps are **S** (each part; done in rev 4) | §L |
| LAN (scripts) | S1 `scripts/qa/copy-check.ts`; D3 `scripts/qa/{chain-check,schedules-check,analytics-check,saved-blocks-check}.ts` | **A** | §K.4 S1, §K.5 D3, §J.6 |
| LAN (ownership) | the pages list routes | **A** (maintainer re-check): `src/app/app/[store]/pages/**` outside `(editor)` joins P3 so LP-22 and the kit entry need no CCR; landing lists it at its next revision (S) | §K.2 P3 |
| OPE (note 1) | D68 / §K.2 P0 / §K.4 S1 slug sentences | **A** (CRIT1) | D68, §K.2 P0, §K.4 |
| OPE (note 2) | the Carrier CSV route in the §B.7 step-up list (+ the R2 period close) | **A** | §B.7, §F.5 |
| OPE (note 3) | `carrier_rates.cod_fee_flat_cents` / `cod_fee_bp` `NOT NULL DEFAULT 0` | **A** | §D.5, §D.6 |
| OPE (note 4) | §K.4 "S3/S4" → S4; S4's `manual-actions.ts`, `mode.ts` | **A** | §K.4 contract step, S4 row |
| OPE (note 5) | `callingWindow.savedAt`, `EffectiveWindow.configured`, the alias, `Range` / `IsoWeekday`, the stub's `DEFAULT_WINDOW` with `configured: false`, `test:delivery` reads `window.fixtures.ts` | **A** | D73, §D.10, §K.2 P0, §J.1 |
| OPE (sibling notes) | landing "no hours" = `windowIsEmpty(w, now) \|\| !w.configured`, "Use these hours"; storefront `fee_unset` refusal, S4 owner, no `shipAfter`; platform `phone: null` to `maskIfImpersonation` | **S** (landing, storefront, platform); the core records `fee_unset` and the input without `shipAfter` | §K.4, §E.2 |
| AI R41 | slot 4c: one rule | **A**, option (b): the cron never runs a model call inside the tick; it marks orphans and hands a driverless stage to a one-item batch; the leftover cap drops to 5 s (DB writes only). Option (a) declined: after slot 9 (budget-driven, up to 9 s) the 95 s an inline stage needs is almost never left, so (a) would be dead text, and a stage of nobody-waits work is exactly pattern C's case | §H.2 slot 4c, §H.12, D56 |
| AI R42 | D56's flag sentence | **A** | D56, §H.12 rule 1 |
| AI R43 | `sampleGenome(…, { hints })` with `GeneHints.pins` | **R**: design, the function's owner, moved the pin to **`SampleOpts.pins`** (a sibling of `hints`, DES N9, DES-§4.1 / §4.6), the shape the core's rev 3 stub already had; ai maps `DirectionBrief.pin` to it at its next revision (S) | §K.2 P0 |
| AI R44 | the five origin classes; the generation record; the wizard's call site | **A\***: the record lives in design's `design_genomes.report.gen` on the `chosen` row (field path → `{ h, o: OriginClass }`, DES-§9.8, DES N3), whose `o` takes ai's per-field `CopyOrigin`; `originFrom` returns `owner` on a hash mismatch and `library` without a record | §M.1 rule 2, §D.5 note |
| AI R45 | `actor_kind 'integration'` = carrier adapters only | **A** | §K.4 |
| AI R46 | `RenderDigest` imported as-is; `budgetVerdicts` | **S** (design confirms the shape; ai keeps `budgetVerdicts` in its own `src/lib/ai/director/budgets.ts`, over the core's band constants) | §K.2 P7 |
| AI R47 | two reveal slots for P7's components | **S** (platform PD73, design DES-§14.3); the core records the slots in the P6 row | §K.2 P6 |
| AI R48 | `isCallable` exported beside `nextCallableAt` / `hoursText`; `EffectiveWindow` the one type | **A** | §K.2 P0, D73 |
| AI (note) | `aiHealth()` additions | **S** (platform PLA-§15.1) | — |
| DES N1 | `PageLinks.report`, `liveLinks()`, UiKey `footer.report`, the Shell row; PL-20 wording | **A\***: the link is set for live, test **and preview** renders, not live only (LAN N4's reason); PL-20 reads "P1 (+ P6 landing footer, the Shell fallback, P3 thank-you / tracking / legal pages, S1 store chrome)"; the storefront's Arabic `footer.report` takes platform's wording (S) | §C.6, §H.13, §K.2 P0, §L.2 |
| DES N2 | §M.4 the verified exhaustion path | **A** | §M.4, §J.1 `test:prepublish` |
| DES N3 | `originFrom` reads `report.gen` | **A** | §M.1 rule 2 |
| DES N4 | quote `gateInputFor` / `gateCtxFrom` verbatim; cite `KIND_GATES`; `policy` a utility kind | **A** (core side); STO-D35 / STO-§8 / STO-R29 / LAN R11 wording is **S** | §M.1 rule 2, §M.4 |
| DES N5 | P2 mounts P6's reveal component | **A** | §K.2 P2, P6 |
| DES N6 | `ThemeLook.em` + `"none"`, `locks` + `G23`; `data-emphasis="none"` | **A** | §K.1 C0a `src/lib/page/schema.ts` |
| DES N7 | the frozen shapes as DES-§5.3 / §8.4 now write them | **A** (in `types.frozen.ts`, CRIT9) | §K.2 P0 |
| DES N8 | tolerance 0 | **—** | header |
| DES N9 | `SampleOpts.pins` | **A** (over AI R43) | §K.2 P0 |
| DES N10 | LAN-§3.4 rows (`τ_niche(n)`, the same product's last 5 pages, hero family ≤ 20 %) | **S** (landing) | — |
| DES (note) | `BrandSetting.genes` + G1, G9 | **A** | §D.10 `brand` |
| DES (note) | one wording for "Report this store" (platform's key) | **A** | §H.13, §C.6 |

Fourth-round notes are closed with the round-2 review. A part's next revision records only contradictions it finds
between its text and §P / §Q.8 / §Q.9; the maintainer decides them in §P with the next review.
