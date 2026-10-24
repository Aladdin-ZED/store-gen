# Store Gen SaaS part spec: platform console and the tenant SaaS layer

Status: **part spec, revision 1** (2026-10-24, platform part architect). Built on `docs/STORE-SAAS.md` revision 1
(cited as **core §X**, its decisions as **core D1 … D50**) and on the settled research decisions **R-D1 … R-D53**
(`docs/saas/RESEARCH.md` §2). Not yet reviewed (PLA-§R is empty). This document is the contract for two R1 product
tracks of core §K.2, **P1 CONSOLE** (the platform console on the main domain) and **P2 SHELL** (the tenant-side SaaS
UX), plus the R3 track **D5 PLATFORM** for the later platform features. It refines only the tables core §D.9 gives
to platform.md, adds product behaviour, and never renames a table, changes a `store_id` rule, changes a seam signature
or moves a file between tracks: every such need is listed in **PLA-§Q "Requests to the core"** with the exact change.
Where this document and an older doc disagree, the core wins, then this document.

Inputs: `docs/STORE-GEN-BRIEF.md` (owner items 1-16), `docs/HANDOFF.md` (owner rules §2, Hostinger §4),
`docs/saas/TENANCY-MAP.md` (item ids AUTH-xx, ADM-xx), `docs/saas/RESEARCH.md` (feature ids PL-, TN-, UX-, SE-, OS-),
`docs/saas/research/platform-admin.md` (cited as **PA §n**), `docs/saas/research/ai.md` §10, `domains.md` §4.8.
Format model: `docs/OFFERS.md`. Code facts are `path:line` at commit `15c9cef`. Next.js 16.4 facts cite
`node_modules/next/dist/docs/…`.

Reading order for a build agent: PLA-§0 (decisions) → PLA-§1 (feature map, find your ids) → PLA-§P (file
ownership: which files are yours) → the sections your files touch → PLA-§N (copy keys) → PLA-§O (tests you must
keep green) → PLA-§Q (what the core still owes you; build against the stubs it freezes in step P0).

Section map: §0 decisions · §1 feature map · §2 data · §3 signup + approval + `scoreSignup` · §4 console shell ·
§5 overview · §6 stores list + health snapshot · §7 store profile · §8 lifecycle actions · §9 plans + entitlements ·
§10 impersonation UX · §11 people + orders lookup · §12 flags + kill switches · §13 platform settings + legal ·
§14 staff + 2FA + security centre · §15 system health · §16 Domains view · §17 backups UI · §18 notifications ·
§19 announcements + in-app messages · §20 support · §21 platform analytics · §22 tenant SaaS UX (auth pages,
onboarding, picker + switcher, team + invites, notification centre, ⌘K, banners, limit sheet, plan page, danger zone,
account) · §23 mobile admin + PWA · §24 later platform features (R3 and P2) · §L limits · §M server actions and
routes · §N copy keys · §O tests · §P file ownership · §Q requests to the core · §R review decisions.

### Owner summary (plain English)

1. Your control room lives at `/admin` behind your secret link, with two-step codes always on. It has its own look
   (deep ink with a cool teal accent and a permanent "Platform" badge) so you never confuse it with a shop's dashboard.
2. The first screen is the **platform pulse**: active shops, sign-ups waiting (and how long the oldest has waited),
   orders and sales of the last 24 hours (per currency), errors, database use, and a "needs attention" list.
3. **Approvals:** every new shop arrives with a 0-100 risk score and plain reasons ("throwaway e-mail address",
   "the shop name contains a bank's name", "same phone as a banned account"). You approve, ask a question, reject or
   snooze with one key. Low-risk shops can be approved in bulk. Nothing is ever rejected automatically.
4. **Shop profile:** one page per shop with every number (visitors, orders, confirmation and delivery rates, sales
   placed / confirmed / delivered), its orders (customer phones hidden until you give a reason and your code), pages,
   team, full activity log, a milestone timeline, usage against its plan, integrations health, AI use, addresses,
   risk signals and your private notes.
5. You can restrict, suspend, restore, close or delete a shop. Dangerous steps ask for your code again; deleting a shop
   immediately needs a second staff member or waits 24 hours.
6. **View as shop:** read-only, 15 to 60 minutes, with a reason. The shop is told. Nothing can be changed while viewing.
7. Plans exist without prices ("Beta" for everyone, "Pro" and "Internal" ready). You edit limits in the console and
   see which shops a change would affect before saving. Orders are never blocked.
8. Kill switches stop sign-ups, publishing, AI, Sheets, ad events or uploads in one click, or put the whole platform in
   read-only mode while orders keep flowing.
9. Health: the 5-minute job, queues, database and disk size, errors, the Cloudflare edge, and backups you can download.
10. For sellers: a two-step sign-up, then a "wow" first minute: drop product photos, type the price while the AI looks,
    and see a designed landing page with two alternatives. Then a dashboard with an "In review" card that says what is
    locked until you approve them.
11. Sellers switch between their shops, invite teammates with a one-time link (copy or WhatsApp), see a notification
    centre, use ⌘K, and get the dashboard as an app icon on their phone. Push notifications come in R3.
12. Everything a seller or agent reads in R1 exists in Arabic (Darija-friendly), French and English. Your console is in
    English first.

---

## PLA-§0. Decisions at a glance

R-D1 … R-D53 and core D1 … D50 are settled. Rows below are this part's own decisions; **deviates** / **refines** say
which settled decision changes and why.

| # | Decision | Why |
|---|---|---|
| PD1 | **One spec, two R1 tracks.** P1 builds PLA-§2-§21 (console, `src/lib/platform/**`); P2 builds PLA-§22-§23 (tenant UX). Shared UI primitives used by both (step-up sheet, typed-confirm dialog, usage meter, masked value, reason picker) live in P2's `src/components/admin/common/**` with the props frozen here (PLA-§22.12). | Core §K.2 splits the work that way; P2 merges before P1 (core merge order P8 → P2 → P1), so P1 imports finished primitives. |
| PD2 | **The console reads one store only through `src/lib/platform/profile/**` read functions** that take the `platformScope(ctx, storeId)` scope and return **masked projections**. Raw customer phone, name, address and note never leave those functions; the only unmasked path is `revealOrderPii` (`pii.reveal` ↑, reason). | One choke point for R-D16 / core §F.11; the type (`StoreScope`) satisfies lint L1, and L6 keeps platform scopes away from write repositories. |
| PD3 | **`scoreSignup()`** = 0-100 with explainable flags (PLA-§3.4). Bands: `fast` ≤ 24, `review` 25-59, `hold` ≥ 60, `reject_candidate` ≥ 85 **or** linked to a banned user. Nothing is auto-rejected (R-D12). Mode `open` auto-approves only `fast` + Turnstile `ok` + no hold-class flag. Weights and thresholds are platform settings, starting values **[to tune]**. | PA §5.3 signals and points; the bands give the queue its triage order. |
| PD4 | **Signup stays one two-step form and one transaction (core §B.2 unchanged); the wow flow happens right after, at `/app/<h>/welcome`** (photos → analysis while the price is typed → reveal with 2 alternates → contact defaults). **Refines UX-01**, which put photos before name and handle. | The core transaction needs name, handle and mode; uploads need a store scope (media ids are per store, core D21); the pending sandbox allows building at once (R-D12). The reveal still lands within ~90 s of the first click. |
| PD5 | **The approval queue carries every staff decision about a store:** signups, appeals (`reopen`), restore requests (`go_live`), plan changes (`plan_change`), limit raises (`limit_raise`), store-mode interest (`mode_change`), custom domains (`domain`, R3). `signup_reviews.kind` is appended (core §D.9 lets this part refine the enum). | One inbox and one SLA for the owner (PA §5.4: "the same queue later carries…"). |
| PD6 | **Store health score + dormant tag ship in R1** as a 5-minute snapshot table `store_health` (request PLA-§Q.1). **Deviates PL-18** (R3). Re-engagement messages for dormant stores stay R3. | PL-06 "needs attention" (R1) needs exactly these flags; a stored snapshot keeps the stores list a single indexed query; the score is the same flags summed. |
| PD7 | **Four-eyes purge and the 24 h single-super-admin delay are `platform_requests` rows** (new table, PLA-§Q.2). The `platform.requests` job executes due requests. | Core §A.5.1 demands "two different staff, or one super_admin + 24 h", which needs a durable pending state that survives deploys and restarts. |
| PD8 | **Assigning a plan to a store needs `entitlements.override` (admin+); editing plan definitions needs `plans.manage` (super_admin).** `take_orders` is locked to `true` in every plan editor row. | Plan moves are daily ops; plan definitions change every store on them; orders are never blocked (R-D15, core D8). |
| PD9 | **Console copy is English in R1** (fr R2, ar R3, core D36). **Every tenant-facing string this part adds in R1 ships in ar, fr and en:** auth pages, onboarding, store picker and switcher, review card, lifecycle banners, limit sheet, plan page, team and invites, notification texts, impersonation notices, help sheet. | Staff read English; sellers and agents read Darija, Arabic and French (core D36). |
| PD10 | **Mobile in R1** = every PLA tenant screen and the console queue work at 360 px, plus an **installable dashboard manifest** scoped to `/app/` with **no service worker**. **R3** = a push-only service worker (no offline caching) and Web Push with hand-written VAPID + aes128gcm on `node:crypto`. **Deviates UX-07** (R3) for the manifest only. | Installability needs only a valid manifest and HTTPS (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:592-595`). Offline caches of dashboards risk stale customer data; `npm` installs are slow here (HANDOFF §3). |
| PD11 | **Notifications = one `notify(target, kind, vars, opts)` API with a typed kind catalog**; titles are rendered at read time in the reader's locale; staff free text only in `notifications.text`; `dedupeKey` batches noisy kinds. Broadcasts fan out lazily at read time (R3). | One catalog → one translation set; no per-user row explosion (PA §10.4). |
| PD12 | **A random device marker cookie `__Host-sgd`** (128-bit, HttpOnly, Secure, SameSite=Lax, 400 days, platform host only) feeds the `identity_links.kind = 'device'` signal (request PLA-§Q.3). | Core §D.4 has the `device` kind but nothing produces it; a random marker is not fingerprinting (PA §2 "device labels without fingerprinting"). |
| PD13 | **Staff are added by a staff invite link** that creates (or binds) a user with **no store**; the platform role activates only once TOTP is enrolled (request PLA-§Q.4). | Signup always creates a store (core §B.2); staff should not own a sandbox store; core §B.7 makes 2FA mandatory for staff. |
| PD14 | **Cross-store phone lookup in the console is admin+ only** (new key `orders.lookup`, PLA-§Q.5), results masked, audited with the phone's HMAC. Order-id lookup is open to every console role. | "Which stores did this phone order from" is legitimate for abuse and support, and is still sensitive. |
| PD15 | **k-anonymity applies to the analyst role everywhere**, overview totals included: any aggregate over fewer than `k` stores (setting, default 5, minimum 5) is suppressed for analysts. | R-D16, PA §13; with 3 stores a "platform total" is one seller's numbers. |
| PD16 | **Console previews of tenant pages are sandboxed iframes on a signed `/preview/<token>` URL** minted for the staff member (10 minutes), never inline HTML (request PLA-§Q.6 for the minting API). | Core SE-05 / §I.2; a console XSS would expose every store. |
| PD17 | **Legal:** platform ToS, Privacy, AUP and DPA templates live in code (`src/lib/platform/data/legal/**`), are seeded as drafts flagged `needs_legal_review`; publishing an unreviewed version needs an explicit owner acknowledgement; signup asks only for published kinds; a new version can require re-acceptance (a blocking sheet in the dashboard, never on public pages). | Core D39, owner rule 4 (no invented claims); signup must not break while no document is published. |
| PD18 | **Every score explains itself.** Health score weights, attention rules and signup points are starting values **[to tune]**; the UI always lists the components next to the number. | Owner rule 4 spirit: no unexplained numbers; easy tuning after the first 200 signups. |
| PD19 | **"View as store" can start from the store profile, the queue split view, ⌘K and (R3) a ticket**; the start sheet always shows the exact text the store will see. Default 30 minutes. | R-D14; the staff member knows what the seller will read. |
| PD20 | **Platform brand = a wordmark** set in Instrument Sans from `platform.brand.name`; no uploaded platform logo in R1. | Assets are per store (core D21); the R2 logo designer can make a platform mark inside internal store #1. |
| PD21 | **Platform "today" figures are rolling 24 h windows** (or each store's local day where the source is `stats_daily`), and **money is always grouped per currency**, never summed across currencies. | Stores have their own timezone and currency (core SET-08); a MAD + EUR sum is meaningless. |
| PD22 | **Support in R1 = a Help sheet that opens WhatsApp** to `platform.brand.supportWhatsapp` with a prefilled context line (store handle, screen path, build id; never customer data). The tickets inbox is R3 (PL-16). | No e-mail in R1 (R-D51); Moroccan sellers read WhatsApp (PA §11). |
| PD23 | **Onboarding never invents:** the price is typed by the owner before the reveal; the AI's product name and category are suggestions that need a tap; compare-at price is optional with an honesty hint; nothing about stock, ratings or reviews is shown. | Owner rule 4; R-D30 (suggested facts count only after the owner ticks them). |
| PD24 | **Tenant requests (plan change, limit raise, mode interest) are owner-only (`billing.manage`)**, one open request per kind per store, `s:<sid>:request` 5/day. Other members see "Ask your store owner". | Avoids queue spam; the owner speaks for the store. |
| PD25 | **Console identity:** deep-ink surfaces, teal-cyan accent OKLCH hue 205, compact density by default; impersonation ribbon violet hue 295; R3 break-glass write ribbon crimson hue 17. All checked by `test:admin-tokens`. | UX-03, core §I.6; every hue sits outside the banned 25-75° band. |
| PD26 | **Console lists use keyset paging** (no `OFFSET`) and every list query has a written index plan (PLA-§M.4). Panels cache 5-60 s in a `scopedCache` under the platform key `"p"`. | One shared Node process and MariaDB 10.4 (core §H); lint L4 requires `scopedCache`. |
| PD27 | **Store export downloads from the console go through a console route** `/api/admin/stores/<id>/exports/<jobId>/<part>` whose signature is bound to the staff user. | Staff are not store members, so the tenant route (session with `store.export`, core §F.9) refuses them. |
| PD28 | **Onboarding progress lives in a new store setting `onboarding`** (PLA-§Q.7); reveal timing is recorded there, never sent to third-party analytics. | Resume after a closed tab; measure the "≤ 90 s to reveal" target honestly. |
| PD29 | **Kill-switch toggles preview the exact tenant banner and the number of affected stores before confirming**; `platform_read_only` can always be turned off (core §H.8 exempts `kill.manage`). | An incident tool must be impossible to misread. |
| PD30 | **R1 mode cards show "Full store" and "Both" as "Coming soon"** with an optional "Tell me when it's ready" that files a `mode_change` interest request. | Core §A.2 (only `landing` selectable in R1); honest UI that also measures demand for R2. |
| PD31 | **Trusted creators:** in `approval` mode, a new store (`/app/new`) of a user who owns an `active` store older than 30 days with no restriction in the last 90 days is auto-approved when its band is `fast` (setting `signup.trustedCreatorAutoApprove`, default on). | Keeps the queue for unknown sellers; flags still apply. |
| PD32 | **The store profile ships 13 tabs in R1** (Overview, Orders, Pages, Team, Activity, Timeline, Usage & plan, Integrations, AI, Domains, Risk, Media, Notes); Ops is R2 (S6), Support is R3 (PL-16). A tab whose data arrives later shows an honest "Fills in with R2" state, never placeholder numbers. **Deviates** from the rethink cut (rethink-features §3.3) and follows RESEARCH PL-07. | The owner asked for every stat, log, order, teammate, usage, integration, AI use, domain, risk flag, note and timeline (brief items 13-14); every R1 tab reads data that already exists in R1. |
| PD33 | **No page or media takedown from the console in R1.** Abuse is handled at store level (restrict / suspend, PLA-§8); page and media takedowns arrive with PL-20 (R3) through a platform write scope. | Lint L6 forbids platform scopes on write repositories; restrict already stops orders and suspend hides every page. |
| PD34 | **Staff never edit tenant data in R1** (pages, settings, memberships, orders). Console writes are platform rows (reviews, notes, entitlements, flags, settings) and user-level actions (ban, 2FA reset, reset link, sign-out) of core §B.7, §B.9. | R-D14 read-only support; one less class of cross-tenant write to secure. |
| PD35 | **Seller contact data** (`users.email`, `users.phone`) is shown in full to admin+ and masked to support and analyst; **customer PII** (orders, leads, customers) is masked for every role and revealed per order only (`pii.reveal` ↑, reason). | Admins need to reach sellers on WhatsApp; customers never agreed to staff reading them (R-D16, core §F.11). |
| PD36 | **Console navigation lives in `src/components/console/nav.ts`** (P1), not in the tenant nav registry: its items carry a `PlatformPermission`, not a store handle. The core's "nav `console.ts`" extension file stays unused. | `NavItem.href(handle)` and `navFor(StoreCtx)` (core §I.3) are store-shaped. |
| PD37 | **Cross-store "last 24 h" figures use a new single-column index `orders_created_idx (created_at)`** (PLA-§Q.10) instead of per-store loops. | Core 0004 replaced every global orders index with store-prefixed ones; a platform count by time would scan the table. |
| PD38 | **Every poll (tenant pulse, console pulse, ⌘K search) is a GET route handler with an ETag**, never a server action. | Server actions are dispatched one at a time per client (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:26-32`): a poll would delay the seller's next save. |
| PD39 | **Console and shell mutations finish with `refresh()`** (`next/cache`) after the write; no `revalidateTag` is used. | Console data lives in MariaDB and `scopedCache`, not in Next's data cache; `refresh()` re-renders the current route in the same round trip (`server-actions.md:141-150`, `04-functions/refresh.md`). |
| PD40 | **Store milestones are recorded from R1** (first draft, first publish, first order, 10th order, first teammate; first delivered order from R2) in `store_health.milestones` and as `store.milestone.reached` audit rows. | The store timeline needs them now and the R3 activation funnel (PL-19) needs history from day one. |
| PD41 | **R2 mail transport = `nodemailer`** (the one dependency core §B.10 lets this part choose), pinned to an exact version at install; it has no runtime dependencies **[verify at install]**. | The reference SMTP client for Node; avoids a hand-written SMTP/STARTTLS stack; Hostinger SMTP limits stay unverified (R-D51). |
| PD42 | **The console health score uses platform signals only** (integrations, quota, order risk mix, activity, setup, renders). Design-quality and honesty rules of the tenant-facing health ring (rethink SF-03) are not part of this score; SF-03, if adopted, may read the same snapshot. | Keeps PL-18 within this part's data and avoids two scores that disagree. |
| PD43 | **Kill switches are never toggled from ⌘K, a bulk bar or a keyboard shortcut**: ⌘K only opens the switch's sheet. | An incident tool needs one deliberate path (PD29). |
| PD44 | **No bulk lifecycle actions in R1.** Bulk on the stores list = message (≤ 50 stores) and a CSV of the list without PII. | One mistaken selection must never suspend 50 sellers. |
| PD45 | **Impersonation is refused** for a store the staff member is a member of ("open it directly"), and for `scheduled_deletion` / `purged` stores; one active impersonation per staff session (starting another ends the first). | Avoids mixed identities in the audit; nothing to support on a store about to be deleted. |
| PD46 | **The dashboard manifest is a route handler at `/app/manifest.webmanifest`**, linked from the `/app` layout metadata. | The metadata manifest file convention lives only in the app root (`03-file-conventions/01-metadata/manifest.md:6`), and `/manifest.webmanifest` is a store-reserved slug on store hosts (core §C.4.1). |
| PD47 | **QR codes use the installed `qrcode` package** (`package.json:65`), rendered to SVG in the browser: invite links in R1 (TN-06), the address card in R2 (UX-05). | No new dependency; nothing secret leaves the page. |
| PD48 | **Onboarding composes other tracks' engines**: P2 owns the flow, state, routes and copy; the photo analysis is P7's `useAiTask("analyze", …)` (ai.md AI-§A.7) and the reveal composition is P6's (design.md DES-§14.3). | One engine per concern; the wizard stays the same code path as Generate. |
| PD49 | **Legal template content is code in `src/lib/platform/data/legal/**`** and is seeded by the core boot task through a versioned marker (PLA-§Q.13). | Templates are reviewed in git; the R1.0 seed must not need P1's files to exist. |
| PD50 | **Notification kinds are a typed registry with per-track extension files** (PLA-§Q.15); this part owns the platform, lifecycle, team, plan, security and staff kinds. | Every kind needs ar/fr/en texts and a link builder; tracks must not edit one shared file. |

Glossary: **staff** = a user with `platform_role ≠ none`. **store profile** = `/admin/stores/<id>`. **band** = the
signup triage class of PD3. **request** = a `signup_reviews` row whose kind is not `signup`. **snapshot** = the
`store_health` row of a store. **step-up** = TOTP again within 5 minutes (core §B.7), marked **↑**.

---

## PLA-§1. Feature map (every id of this area)

Release per RESEARCH §4 unless a decision moves it (PD6, PD10). "Track" per core §K.2/§K.5. AC = acceptance
criteria in one line; the detailed criteria sit in the section.

### PLA-§1.1 Platform (PL-*)

| ID | Feature | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| PL-01 | Signup modes | R1 (core R1.0 for the form) | T2, P1 | §3.1, §3.2, §13.2 | Mode setting editable; `null` = derived (core D9); invite codes and waitlist manageable; each mode behaves per §3.1 in an e2e run. |
| PL-02 | Pending-store sandbox | R1 | T1, T2, P1, P2 | §3.6, §22.7 | A pending store builds, uploads ≤ pending cap and previews; publish/orders/integrations show the locked state with copy; approval unlocks without reload (next pulse). |
| PL-03 | Signup risk score | R1 | P1 | §3.4 | Golden fixtures produce the exact score/flags; MX timeout ≤ 2 s fails open; no raw e-mail/phone/IP in `signals`. |
| PL-04 | Approval queue | R1 | P1 | §3.5 | Keyboard triage A/I/R/S/J/K; split view with explanation, draft preview, cluster; bulk fast lane (≤ 50); SLA tile; one appeal. |
| PL-05 | Platform pulse overview | R1 | P1 | §5 | KPI row, needs-attention, activity feed render from real data only; each panel fails independently. |
| PL-06 | Stores list | R1 | P1 | §6 | Filters status/mode/plan/market/band/flag/dormant; health chips; sort by health; ≤ 300 ms p95 on 2,000 stores. |
| PL-07 | Store profile | R1 (Ops tab R2) | P1 (S6) | §7 | 13 tabs per §7; PII masked; reveal ↑ with reason; every tab has empty/loading/error states. |
| PL-08 | Lifecycle actions | R1 | T1, P1 | §8 | Every core §A.5.1 edge available with reason codes, step-up where marked, notification and audit. |
| PL-09 | Store export ZIP (UI) | R1 | P8 (engine), P1, P2 | §7.14, §22.11 | Owner requests and downloads from Danger zone; super_admin from the profile with reason; both audited. |
| PL-10 | Read-only "View as store" | R1 | T2, P1, P2 | §10 | Start sheet, ribbon with countdown, write refusals toast, store notification, end returns to the profile. |
| PL-11 | Plans, entitlements, usage meters | R1 | T1, P1, P2 | §9, §22.10 | Plan editor with impact preview; overrides/boosts with expiry and reason; tenant meters; limit sheet. |
| PL-12 | Kill switches | R1 | T1, P1 | §12 | 7 switches with step-up, banner preview, affected count; tenant banners within 45 s (30 s flag cache + one 15 s pulse). |
| PL-13 | Notification centre | R1 | P1 (`notify`), P2 (UI) | §18, §22.6 | Bell + page; kind catalog in ar/fr/en; unread count via pulse; staff feed in the console. |
| PL-14 | Platform settings + legal templates | R1 | P1 | §13 | Brand, signup, defaults, reserved handles, protected brands, legal versions with acceptance counts. |
| PL-15 | Support grants + break-glass write | R3 | D5 | §24.1 | Owner grant 24/72 h scoped; break-glass write ↑ with crimson ribbon and instant notice. |
| PL-16 | Tickets inbox | R3 | D5 | §20.2 | Auto-context, macros ar/fr/en, assignment, SLA, appeals, view-as from a ticket. |
| PL-17 | Broadcasts and changelog | R3 | D5 | §19.2 | Targeted announcements, maintenance banners, "What's new" drawer, seen/click counts without per-user tracking beyond read state. |
| PL-18 | Store health score + dormancy | **R1** (PD6; re-engagement R3) | P1 | §6.3 | Score + components per store, refreshed ≤ 5 min after a platform action (dirty mark) and ≤ 60 min otherwise; dormant tag at 60 days. |
| PL-19 | Global analytics | R3 | D5 | §21 | Activation funnel, placed/confirmed/delivered GMV labelled, mode mix; k ≥ 5 suppression. |
| PL-20 | Abuse reports + takedowns | R3 | D5 | §24.2 | Public report link, queue, page/media takedown through a platform write scope. |
| PL-21 | Ownership transfer | R3 | D5 | §24.3 | Two-sided confirmation, audited, old owner becomes admin or leaves. |
| PL-22 | UTS #39 skeletons + mixed-script check | R3 | D5 (D1) | §3.4.4 | Vendored `confusables.txt`; skeleton match flags homographs; mixed Latin+Cyrillic handle names flagged. |
| PL-23 | Manual billing, then a payment provider | later | — | §24.4 | `payments_manual` sketch; no prices until the owner decides. |
| PL-24 | Web Risk URL checks, VPN/ASN signal | later | — | §24.5 | Optional Google key; ASN dataset only if a reliable free one exists. |
| PL-25 | Help centre + CSAT | later | — | §24.6 | In-app articles, one-tap rating after a ticket. |

### PLA-§1.2 Tenancy, product side (TN-*)

The tenancy mechanics are the core's (core §A-§F). This part owns how they look and feel.

| ID | Product-side scope here | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| TN-01 | Console views of the store row (status, mode, plan, market, currency, timezone, category, brand seed hidden) | R1 | P1 | §6, §7 | Every `stores` field a staff member needs is visible; none is editable outside a defined action. |
| TN-02 | The seam's error codes become premium states (`not_found`, `forbidden`, `read_only`, `impersonation_read_only`, `quota`, `feature_off`, `step_up`) | R1 | P2, P1 | §22.8, §22.9 | Each code maps to one component (toast, sheet or page) with ar/fr/en copy; no raw error text. |
| TN-03 | Store #1 shows as `internal`, owner = the converted super_admin; the console never offers "delete" without a purge request | R1 | P1 | §7.1 | Store #1 renders like any store with an "Internal" chip. |
| TN-04 | Platform settings screens (PLA-§13) and store settings pages owned by P2 (general, market, plan, address, security, danger) | R1 | P1, P2 | §13, §22.10-§22.11 | Settings saved through the core registries; secrets only "set / not set". |
| TN-05 | Public auth UI: `/login`, `/login/verify`, `/signup` (two steps), `/reset/<token>` | R1.0 functional (T2), R1 polish (P2) | T2, P2 | §22.1 | ar/fr/en, RTL, 360 px, Turnstile challenge state, generic answers (no enumeration). |
| TN-06 | Invite creation, share (copy, WhatsApp, QR) and acceptance screens | R1 | T2, P2 | §22.4, §22.1.4 | Link shown once; e-mail-bound states; masked e-mails; seats meter. |
| TN-07 | Store picker `/app` and the sidebar store switcher | R1 | P2 | §22.3 | Logo/monogram, mode badge, status pill, role; keyboard; client state cleared on switch (core §B.4). |
| TN-08 | Role picker and plain-language role explainer | R1 | P2 | §22.4.4 | Only `invitableRoles()` offered; rank rule enforced in UI and server. |
| TN-09 | Store mode cards in onboarding and Settings → General; hide-never-delete explanation | R1 (landing only), R2 (store/both) | P2 | §22.2, §22.10.1 | Disabled modes show "Coming soon" + interest request (PD30). |
| TN-10 | Console cases added to the attack suite and the action replay | R1 | P1, P2 | §O.3 | PLA attack cases green (analyst notes, support reveal, tenant → console actions, masked JSON canaries). |
| TN-11 | Every PLA cache is a `scopedCache`; every PLA bucket is a `Bucket` | R1 | P1, P2 | §M.5 | Lint L4/L5 green with no new allow-list entry. |
| TN-12 | Accountant role (R2) and viewer role (R1) in the role picker and explainer | R1 viewer / R2 accountant | P2 (S3) | §22.4.4 | Roles appear only when `ACTIVE_STORE_ROLES` includes them. |
| TN-13 | "Require 2FA for members" toggle (Settings → Security) | R1 (core D12) | P2 | §22.10.3 | Only an owner with TOTP can switch it on; lists members without 2FA; they are sent to enrolment next request. |
| TN-14 | External confirmation team | later | — | §24.7 | Scope note only. |

### PLA-§1.3 Admin UX (UX-*)

| ID | Feature | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| UX-01 | Onboarding wow flow | R1 | P2 (+ P6/P7 pieces) | §22.2 | Reveal ≤ 90 s from the signup click on a mid laptop with 3 photos (≤ 15 s with the library fallback); never a price the owner didn't type; 360 px; ar RTL perfect. |
| UX-02 | Store-scoped ⌘K (tenant) + console ⌘K | R1 | P2 (tenant), P1 (console) | §22.13, §4.4 | Tenant search scoped (ADM-02 fixed); console jumps to store/user/order, approve next, start view-as. |
| UX-03 | Console identity | R1 | P1 (+ P2 tokens) | §4.2 | Teal-cyan hue 205 accent, "Platform" badge, violet ribbon; admin-tokens check green. |
| UX-04 | Admin upgrade | R2 | S6 (design.md owns depth) | §24.8 | Platform screens adopt density modes, real-data KPI tiles, split views, undo toasts. |
| UX-05 | Live address card (QR, WhatsApp share, test-order link) | R2 | S6 | §22.10.2 | R1 ships the address card text + copy; R2 adds QR, share and the test-order link. |
| UX-06 | Realtime dashboards | R2 | S6 | §22.6.4 | Animated arrivals on the 15 s pulse, honest "live · 12 s ago" dot. |
| UX-07 | PWA + Web Push | **R1 manifest** (PD10), R3 push | P2, D5 | §23 | R1: installable `/app/` manifest; R3: push for new orders/callbacks with no PII in payloads. |
| UX-08 | French + Arabic RTL dashboard | R2 fr / R3 ar | S6, D5 | §N.1 | Catalog coverage report 100 % for the release's surfaces. |

### PLA-§1.4 Other ids this part delivers screens for

| ID | Scope here | R | Track | Section |
|---|---|---|---|---|
| SE-01 | Staff roles UI, staff invites, mandatory 2FA, step-up sheet | R1 | P1, P2 | §14, §22.12 |
| SE-04 | Platform audit view, break-glass log (reveals, impersonations, purges, kill changes) | R1 | P1 | §14.3 |
| SE-09 | Passkeys | later | — | §24.9 |
| OS-06 | Console Domains view and domain-move checklist | R1 | P1 | §16 |
| OS-09 | Health UI over `getHealth()` (data by P8) | R1 | P1 | §15 |
| OS-10 | Backups list, retention, download ↑ | R1 | P1 | §17 |
| IN-08 | Mail transport dependency choice (`nodemailer`, PD41) and the mail settings screen `platform_mail` | R2 | S5 | §13.5 |
| OS-12, OS-13 | Console tiles for the Worker edge cache (purge status) and Worker alerts | R2 | S6 | §16.4 |
| OS-14 … OS-18 | Console custom-domain approvals (queue kind `domain`) and the Domains view rows for `store_domains` | R3 | D1 | §16.5 |

---

## PLA-§2. Data: refined tables, new tables, settings keys

Rules (core §D.1): tenant rows use `storeRef()`, platform rows `storeRefOpt()`; JSON is `jsonText`; enums only append;
portable SQL only. Refinements of **0004** tables below are additive (NULL-able or defaulted columns, appended enum
values, new indexes): the maintainer writes them into `0004_tenancy.sql` if step C0 has not been cut yet, otherwise
into `0005_r1.sql`. R3 tables are refined for `0007_r3.sql`. Tables marked **(new)** need the core (PLA-§Q).

### PLA-§2.1 R1 tables this part refines (core §D.9)

```ts
// src/lib/db/schema.ts (maintainer), columns owned by platform.md

// waitlist (0004) — core columns + :
source: varchar("source", { length: 40 }),                             // "utm:<source>" | "ref:<host>" | null, owner-typed labels only
market: varchar("market", { length: 8 }),
modeInterest: mysqlEnum("mode_interest", ["landing", "store", "both"]),
status: mysqlEnum("status", ["waiting", "invited", "dropped"]).notNull().default("waiting"),
invitedAt: ts("invited_at"), invitedBy: id26("invited_by"),
// + index("wl_status_idx").on(t.status, t.createdAt)

// signup_reviews (0004) — the approval queue row (PD5). Core columns + :
kind: mysqlEnum("kind", ["signup", "reopen", "go_live", "plan_change", "limit_raise", "mode_change", "domain"]).notNull().default("signup"),
status: mysqlEnum("status", ["pending", "needs_info", "approved", "rejected", "snoozed", "withdrawn"]).notNull().default("pending"),
band: mysqlEnum("band", ["fast", "review", "hold", "reject_candidate"]).notNull().default("review"),
request: jsonText<ReviewRequest>("request"),                           // kinds other than signup/reopen (PLA-§3.7)
submittedAt: ts("submitted_at"),                                       // "Submit for review" pressed (signup kind)
staffQuestion: varchar("staff_question", { length: 500 }), answeredAt: ts("answered_at"),
blocked: boolean("blocked").notNull().default(false),                  // reject + block (the user was banned)
// + index("sr_kind_queue_idx").on(t.kind, t.status, t.createdAt), index("sr_store_kind_idx").on(t.storeId, t.kind, t.status)

// identity_links (0004) — core columns + :
source: mysqlEnum("source", ["signup", "login", "invite", "staff"]).notNull().default("signup"),

// protected_brands (0004) — core columns + :
active: boolean("active").notNull().default(true),                     // seeded rows are disabled, never deleted (the boot seed is INSERT IGNORE)
note: varchar("note", { length: 200 }),

// legal_documents (0004) — core columns + :
summary: varchar("summary", { length: 500 }),                          // "What changed", shown in the re-acceptance sheet
effectiveAt: ts("effective_at"), requiresReacceptance: boolean("requires_reacceptance").notNull().default(false),
reviewedAt: ts("reviewed_at"), reviewedBy: id26("reviewed_by"),        // the owner marks "reviewed by a lawyer" (clears the flag)
ackUnreviewedBy: id26("ack_unreviewed_by"), ackUnreviewedAt: ts("ack_unreviewed_at"),   // PD17 acknowledgement
updatedAt: updatedAt(),
// + index("ld_kind_status_idx").on(t.kind, t.locale, t.status)

// legal_acceptances (0004) — core columns + :
context: mysqlEnum("context", ["signup", "reaccept", "invite", "staff"]).notNull().default("signup"),

// notifications (0004) — core columns + :
platformMinRole: mysqlEnum("platform_min_role", ["super_admin", "admin", "support", "analyst"]),   // audience platform_staff; NULL = every staff role
// + index("nt_aud_idx").on(t.audience, t.id) (staff feed)
// notification_reads (0004) — unchanged

// flags (0004) — core columns + :
ownerTrack: varchar("owner_track", { length: 16 }), archived: boolean("archived").notNull().default(false),
// flag_overrides (0004) — core columns + :
note: varchar("note", { length: 200 }), expiresAt: ts("expires_at"),

// platform_notes (0005) — core columns + :
kind: mysqlEnum("kind", ["note", "decision", "warning"]).notNull().default("note"),
mentions: jsonText<string[]>("mentions"),                               // staff user ids parsed from "@name"
editedAt: ts("edited_at"), deletedAt: ts("deleted_at"),                 // soft delete (kept for the audit trail)
```

```ts
// src/lib/platform/types.ts (P1; isomorphic, no runtime deps)
export type SignupBand = "fast" | "review" | "hold" | "reject_candidate";
export interface SignupSignals {
  v: 1;
  flags: SignupFlag[];                       // PLA-§3.4
  band: SignupBand;
  inputs: {                                  // never a raw e-mail, phone, IP or UA string
    emailDomain: string;                     // "gmail.com"
    phoneCountry: string | null;             // "MA"
    market: string; mode: "landing" | "store" | "both"; modeInterest?: "store" | "both";
    locale: "ar" | "fr" | "en"; uaLabel: string;          // describeUserAgent (src/lib/admin-data/security.ts:28)
    turnstile: "ok" | "missing" | "unverified" | "off";
    formMs: number | null; via: "signup" | "app_new" | "invite_code" | "waitlist_invite";
  };
  cluster: { users: number; banned: number; kinds: ("email_norm" | "phone" | "net" | "device")[] };
  partial: boolean;                          // a lookup (MX) timed out
  ms: number;                                // scoring time
  appeal?: true;                             // copied onto a `reopen` row
}
export type ReviewRequest =
  | { kind: "plan_change"; planId: string; message: string | null }
  | { kind: "limit_raise"; key: EntitlementKey; used: number; limit: number | null; asked: number | null; message: string | null }
  | { kind: "mode_change"; mode: "store" | "both"; message: string | null }
  | { kind: "go_live"; message: string | null }
  | { kind: "domain"; host: string };        // R3
```

### PLA-§2.2 New R1 tables (requests PLA-§Q.1, §Q.2)

```ts
// 0005 — P* (one row per store, written only by the platform.health job; read by the console)
export const storeHealth = mysqlTable("store_health", {
  storeId: varchar("store_id", { length: 26 }).primaryKey().references(() => stores.id, { onDelete: "restrict" }),
  score: tinyint("score").notNull(),                                   // 0-100 (PLA-§6.3)
  attention: tinyint("attention").notNull().default(0),               // max flag severity: 0 none, 1 info, 2 warn, 3 danger
  flags: jsonText<HealthFlag[]>("flags").notNull(),
  components: jsonText<Record<HealthComponent, number>>("components").notNull(),   // penalty per component
  metrics: jsonText<HealthMetrics>("metrics").notNull(),               // PLA-§6.3: orders7d, risky7d, lastActiveAt, lastOrderAt, publishedPages, mediaPct
  milestones: jsonText<Partial<Record<Milestone, string>>>("milestones"),   // ISO date each milestone was first reached (PD40)
  dormant: boolean("dormant").notNull().default(false),
  computedAt: ts("computed_at").notNull(), dirtyAt: ts("dirty_at"),   // dirtyAt: set by markHealthDirty() for priority recompute
}, (t) => [index("sh_attention_idx").on(t.attention, t.score), index("sh_due_idx").on(t.dirtyAt, t.computedAt)]);

// 0005 — P (opt. store): dangerous actions that need a second person or a delay (PD7)
export const platformRequests = mysqlTable("platform_requests", {
  id: id26().primaryKey(), storeId: storeRefOpt(),
  kind: mysqlEnum("kind", ["store_purge", "staff_super_admin"]).notNull(),
  mode: mysqlEnum("mode", ["four_eyes", "delayed"]).notNull(),
  payload: jsonText<Record<string, string>>("payload").notNull(),      // { targetUserId } for staff_super_admin
  reasonCode: varchar("reason_code", { length: 40 }).notNull(), reasonNote: varchar("reason_note", { length: 500 }),
  status: mysqlEnum("status", ["pending", "confirmed", "executed", "cancelled", "expired"]).notNull().default("pending"),
  requestedBy: id26("requested_by").notNull(), requestedAt: ts("requested_at").notNull().default(now3),
  executeAfter: ts("execute_after"),                                   // delayed: requested_at + 24 h; four_eyes: set at confirmation
  confirmedBy: id26("confirmed_by"), confirmedAt: ts("confirmed_at"),
  cancelledBy: id26("cancelled_by"), cancelledAt: ts("cancelled_at"),
  executedAt: ts("executed_at"), error: varchar("error", { length: 200 }),
}, (t) => [index("preq_due_idx").on(t.status, t.executeAfter), index("preq_store_idx").on(t.storeId, t.status)]);
```

```ts
// src/lib/platform/types.ts
export type HealthComponent = "integrations" | "quota" | "orders_risk" | "activity" | "setup" | "renders";
export type HealthFlagCode =
  | "sheets_backlog" | "sheets_error" | "outbox_dead" | "capi_failing" | "telegram_failing"
  | "quota_high" | "quota_full" | "risky_orders" | "inactive_14d" | "dormant_60d"
  | "setup_incomplete" | "render_failed" | "review_waiting" | "restricted" | "suspended";
export interface HealthFlag { code: HealthFlagCode; severity: 1 | 2 | 3; since: string /* ISO */; value?: number; detail?: string /* key, metric or kind */ }
```

Rules: a `platform_requests` row of kind `store_purge` is valid only while the store is `closed` or
`scheduled_deletion`; a second pending request for the same store and kind is refused (`already_requested`). A
request expires after 7 days without confirmation (`expired`, by the `platform.requests` job). The requester can never
confirm their own four-eyes request (checked in SQL: `confirmed_by <> requested_by`).

### PLA-§2.3 R3 tables this part refines (0007) and later tables

| Table | Columns (final for its migration) | Keys |
|---|---|---|
| `support_grants` (0007) | core + `granted_to enum('support','any_staff') NOT NULL DEFAULT 'support'`, `scope longtext` (areas from `SUPPORT_GRANT_AREAS` = `pages`, `media`, `settings_basic`, `catalog`; never `members`, `security`, `integrations`, `billing`, `payouts`, `export`), `note varchar(300)`, `created_at`, `last_used_at` | `(store_id, expires_at)` |
| `tickets` (0007) | `id`, `store_id NULL`, `user_id`, `subject varchar(160)`, `kind enum('question','bug','billing','appeal','abuse_report','domain','other')`, `status enum('open','pending','solved','closed')`, `priority enum('low','normal','high','urgent')`, `assignee_id NULL`, `sla_due_at`, `context longtext` (store handle, path, build id, UA label, last 5 client error codes; never customer data), `last_message_at`, `csat tinyint NULL`, `created_at`, `updated_at` | `(status, sla_due_at)`, `(store_id, created_at)`, `(assignee_id, status)` |
| `ticket_messages` (0007) | `id bigint`, `ticket_id`, `author_kind enum('user','staff','system')`, `author_id`, `body text` (≤ 4,000 chars, plain text), `attachments longtext` (asset ids of the ticket's store, `asset_refs.owner_kind='ticket'`), `internal bool`, `created_at` | `(ticket_id, id)` |
| `broadcasts` (0007) | `id`, `kind enum('announcement','changelog','maintenance','message')`, `placement enum('bell','banner','drawer')`, `audience longtext` (`BroadcastAudience`, §19.2), `title longtext` / `body longtext` / `cta longtext` (`{ ar, fr, en }`, markdown-lite §13.6), `starts_at`, `ends_at`, `dismissible bool`, `status enum('draft','scheduled','live','ended')`, `created_by`, `published_at` | `(status, starts_at)` |
| `broadcast_reads` (0007) | core (`broadcast_id`, `user_id`, `seen_at`, `clicked_at`, `dismissed_at`) | PK `(broadcast_id, user_id)` |
| `abuse_reports` (0007) | `id`, `store_id`, `page_url varchar(500)`, `reason enum('phishing','scam','counterfeit','prohibited','impersonation','other')`, `details text` (≤ 2,000), `reporter_contact_enc text NULL` (envelope v2, scope platform, purpose `abuse:contact`), `status enum('new','triaged','actioned','dismissed')`, `action_taken varchar(40)`, `ip_hash`, `handled_by`, `handled_at`, `created_at` | `(status, created_at)`, `(store_id, created_at)` |
| `store_daily_rollup` (0007) | core + `views`, `uniques`, `form_starts`, `confirmed`, `delivered`, `returned`, `fake`, `leads`, `leads_recovered`, `ai_credits`, `members_active`, `currency char(3)` | PK `(store_id, day)` |
| `support_macros` (0007, new, PLA-§Q.20) | `id`, `title varchar(80)`, `body_ar text`, `body_fr text`, `body_en text`, `tags longtext`, `created_by`, `updated_at` | — |
| `push_subscriptions` (0007, new, PLA-§Q.21) | `id`, `user_id`, `store_id NULL`, `endpoint_hash char(64)`, `endpoint_enc text`, `keys_enc text` (p256dh + auth, envelope v2 scope platform, purpose `push:sub`), `ua_label`, `created_at`, `last_ok_at`, `failures tinyint`, `disabled_at` | `UNIQUE(endpoint_hash)`, `(user_id)` |
| `notification_prefs` (0006, new, PLA-§Q.22) | `user_id`, `store_id varchar(26) NOT NULL DEFAULT ''` ('' = every store), `group varchar(16)`, `channels longtext` (`{ inapp: true, push: bool, email: bool }`), `updated_at` | PK `(user_id, store_id, group)` |

### PLA-§2.4 Settings keys owned by this part

`platform` (core §D.10, level P, extension file `src/lib/settings/keys/platform.ts`, P1):

```ts
const E164 = /^\+[1-9]\d{6,14}$/;
export const PlatformSettingSchema = z.object({
  v: z.literal(1).default(1),
  brand: z.object({
    name: z.string().trim().min(2).max(40).default("Store Gen"),       // TOTP issuer, titles, manifest, mails (R2)
    supportWhatsapp: z.string().regex(E164).nullable().default(null),   // Help sheet, rejected/suspended pages
    supportHours: z.string().trim().max(80).nullable().default(null),   // owner-typed, shown as typed
    mailFromName: z.string().trim().max(60).nullable().default(null),   // R2
  }).default({}),
  signup: z.object({
    mode: z.enum(["closed", "invite", "approval", "waitlist", "open"]).nullable().default(null),   // null = derived (core D9)
    thresholds: z.object({
      fastLaneMax: z.number().int().min(0).max(100).default(24),
      holdMin: z.number().int().min(1).max(100).default(60),
      rejectCandidateMin: z.number().int().min(1).max(100).default(85),
    }).refine((t) => t.fastLaneMax < t.holdMin && t.holdMin < t.rejectCandidateMin, "thresholds_order").default({}),
    weights: z.record(z.string(), z.number().int().min(-50).max(100)).default({}),   // per SignupFlagCode overrides of PLA-§3.4
    pendingMediaMiB: z.number().int().min(10).max(1024).default(100),   // read by applyStateCap (PLA-§Q.8)
    pendingMembersMax: z.number().int().min(1).max(10).default(2),
    allowedMarkets: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).default(["MA"]),
    trustedCreatorAutoApprove: z.boolean().default(true),               // PD31
    slaHours: z.number().int().min(1).max(168).nullable().default(null),   // the review target shown to sellers only when set
  }).default({}),
  newStore: z.object({
    market: z.string().default("MA"), currency: z.string().length(3).default("MAD"),
    timezone: z.string().default("Africa/Casablanca"),
    defaultLocale: z.enum(["ar", "fr", "en"]).default("ar"), locales: z.array(z.enum(["ar", "fr", "en"])).min(1).default(["ar", "fr"]),
  }).default({}),
  allowSellerBrandOrange: z.boolean().default(false),                   // core D37; changing it needs a typed confirmation (PLA-§13.1)
  reservedHandles: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(500).default([]),   // extra to RESERVED_HANDLES
  analytics: z.object({ k: z.number().int().min(5).max(50).default(5) }).default({}),
  legal: z.object({ requireAcceptance: z.boolean().default(true) }).default({}),
  domainMove: z.object({                                                // PLA-§16.3 checklist state (booleans and dates, never values)
    steps: z.record(z.string(), z.object({ doneAt: z.iso.datetime(), by: z.string().length(26) })).default({}),
    checks: z.record(z.string(), z.object({ passedAt: z.iso.datetime(), by: z.string().length(26), note: z.string().max(200).default("") })).default({}),
  }).default({}),
  backup: z.object({ lastDownloadAt: z.iso.datetime().nullable().default(null), remindAfterDays: z.number().int().min(1).max(60).default(7) }).default({}),
});
export type PlatformSetting = z.output<typeof PlatformSettingSchema>;
```

`onboarding` (new store key, level S, no secret, extension file `src/lib/settings/keys/onboarding.ts`, P2; PLA-§Q.7):

```ts
export const OnboardingSchema = z.object({
  v: z.literal(1).default(1),
  step: z.enum(["photos", "details", "reveal", "contact", "done", "skipped"]).default("photos"),
  startedAt: z.iso.datetime().nullable().default(null),
  revealedAt: z.iso.datetime().nullable().default(null),     // first reveal painted (client-reported, clamped to server time)
  revealMs: z.number().int().min(0).max(3_600_000).nullable().default(null),   // signup click → reveal
  pageId: z.string().length(26).nullable().default(null),    // the draft created from the chosen direction
  completedAt: z.iso.datetime().nullable().default(null),
  dismissedChecklist: z.boolean().default(false),
  draft: z.object({                                          // PLA-§22.2: resume on the same step with the same inputs
    category: z.string().max(40).nullable().default(null),
    productName: z.string().trim().max(120).nullable().default(null),
    priceMinor: z.number().int().min(0).max(100_000_000).nullable().default(null),       // typed by the owner, never suggested
    compareAtMinor: z.number().int().min(0).max(100_000_000).nullable().default(null),
    fact: z.string().trim().max(160).nullable().default(null),
    assetIds: z.array(z.string().max(64)).max(5).default([]),
  }).default({}),
});
```

---

## PLA-§3. Signup, approval and the risk score (PL-01 … PL-04)

### PLA-§3.1 Signup modes (behaviour; the form is core §B.2, built by T2)

| Mode | `/signup` shows | Store starts | Notes |
|---|---|---|---|
| `closed` | "Sign-ups are closed for now" + the support WhatsApp button when set | — | staff invites still work (`/invite/staff/<token>`, PD13) |
| `invite` (default while S mode is off, core D9) | the two-step form with an "Invite code" field first | `pending`, or `active` when the code has `auto_approve` | codes `SG-` + 12 Crockford chars (core §B.6) |
| `approval` (default once S mode is on) | the two-step form | `pending` | Turnstile when configured |
| `waitlist` | e-mail + phone (+ optional "What do you sell?") | — | a `waitlist` row; staff promote rows to single-use codes (§3.3) |
| `open` | the two-step form, Turnstile **required** | `active` when PD3 auto-approval passes, else `pending` | — |

`signups_enabled = false` overrides every mode: the form, `/app/new` and invite acceptance answer "closed for now"
(core §H.8). A mode change is audited (`platform.settings.updated`, meta `{ key: "signup.mode", from, to }`).

### PLA-§3.2 Signup settings in the console (`/admin/settings/signup`, tab **Mode & thresholds**)

Layout: a 5-option segmented control (Closed · Invite · Approval · Waitlist · Open) with one sentence under each; the
derived default is marked "Automatic — currently Invite, because your real domain isn't connected yet". Below: the
thresholds card (three linked numeric inputs drawn on one 0-100 bar showing the four bands in emerald, neutral,
yellow and crimson), the pending sandbox caps (MiB, members), allowed markets (chips), trusted creators toggle, the
review target (hours, optional) and the weights table (each `SignupFlagCode`, its default points, an override input,
"Reset"). Saving runs `savePlatformSettingsAction({ section: "signup", patch })` (`platform.settings`). Choosing `open`
shows the inline warning `console.signup.open_warning` and needs the typed confirmation `open`.

### PLA-§3.3 Platform invites and the waitlist (core §B.6)

Tab **Invite codes**: table (label, uses `3 / 10`, expires, auto-approve, created by, state chip Active / Used up /
Expired / Revoked). "New code" dialog: label (required, e.g. "Beta sellers Casablanca"), uses (1-500, default 1),
expiry (7 / 30 / 90 days / never), auto-approve (off by default; when on, the yellow note "Stores created with this
code skip the queue"). The code is shown **once** in a result sheet with Copy and WhatsApp share
(`https://wa.me/?text=` + `console.invite.share_text`); only its hash is stored. Revoke sets `revoked_at`. Permission
`signups.decide` (admin+), because codes are daily ops (decision recorded in §M.1).

Tab **Waitlist**: table (masked e-mail, phone country, market, mode interest, source, waiting since, status), filters,
multi-select → "Invite selected" creates one single-use code per row (`label = "Waitlist <date>"`, 30 days) and shows
a result list with Copy / WhatsApp per row (the staff member taps send; the console never sends anything itself in
R1). Rows become `invited`; "Drop" marks `dropped`.

### PLA-§3.4 `scoreSignup()` (PL-03)

```ts
// src/lib/platform/signup-risk.ts (P1; server-only). Replaces the core stub; contract widened (PLA-§Q.9).
export type SignupFlagCode =
  | "disposable_email" | "no_mx" | "null_mx" | "mx_unknown"
  | "brand_exact" | "brand_near" | "offensive_term"
  | "dup_email_norm" | "dup_phone" | "dup_network" | "dup_device" | "linked_banned"
  | "velocity_network" | "turnstile_missing" | "turnstile_unverified"
  | "too_fast" | "fast" | "bot_ua" | "no_ua"
  | "phone_market_mismatch" | "market_not_allowed"
  | "invite_code" | "trusted_creator"                        // negative points
  | "mixed_script";                                          // R3 (PL-22)
export interface SignupFlag { code: SignupFlagCode; points: number; evidence?: Record<string, string | number> }
export type SignupMode = "closed" | "invite" | "approval" | "waitlist" | "open";
export interface SignupRiskInput {
  email: string; phoneE164: string | null; name: string; storeName: string; handle: string;
  ip: string | null; ua: string | null; deviceId: string | null;
  turnstile: "ok" | "missing" | "unverified" | "off"; formMs: number | null;
  market: string; mode: "landing" | "store" | "both"; modeInterest?: "store" | "both"; locale: "ar" | "fr" | "en";
  via: SignupSignals["inputs"]["via"]; inviteLabel?: string; existingUserId?: string;   // /app/new: the creator
}
export interface SignupScore { score: number; flags: SignupFlag[]; band: SignupBand; signals: SignupSignals }
export function scoreSignup(input: SignupRiskInput, deps?: Partial<SignupRiskDeps>): Promise<SignupScore>;
export function bandFor(score: number, flags: readonly SignupFlag[], t: SignupThresholds): SignupBand;
export function autoApprove(mode: SignupMode, s: SignupScore, ctx: { trustedCreator: boolean; setting: PlatformSetting["signup"] }): boolean;
export function explainFlag(flag: SignupFlag): MessageKey;     // console.risk.<code>, rendered with flag.evidence
export const HOLD_CLASS: ReadonlySet<SignupFlagCode>;
export interface SignupRiskDeps {                              // injectable for the selftest (no network, no DB)
  now(): number;
  resolveMx(domain: string): Promise<"ok" | "none" | "null" | "timeout">;
  identityMatches(links: readonly { kind: IdentityKind; valueHash: string }[]): Promise<{ kind: IdentityKind; users: number; banned: number; recentUsers24h: number }[]>;
  velocity(netHash: string): Promise<boolean>;                 // p:signup:net:<hash> over 3/day
  protectedTerms(): Promise<readonly { term: string; kind: string; match: "exact" | "substring" | "skeleton" }[]>;   // active rows, cached 5 min
  trustedCreator(userId: string): Promise<boolean>;
}
```

#### PLA-§3.4.1 Signals and points (starting values **[to tune]**, overridable by `signup.weights`)

| Code | Rule | Points | Evidence stored (safe) |
|---|---|---|---|
| `disposable_email` | the domain or a parent domain is in `src/lib/platform/data/disposable-domains.json` (CC0 list, vendored, core §F.8) | +35 | `{ domain }` |
| `null_mx` | the MX answer is one record with exchange `""` or `"."` | +25 | `{ domain }` |
| `no_mx` | no MX record (NXDOMAIN or empty) | +20 | `{ domain }` |
| `mx_unknown` | the lookup timed out (2 s) or failed | 0 (`partial = true`) | — |
| `brand_exact` | a normalised token of the store name, handle or e-mail local part equals an active `protected_brands` term | +40 | `{ term, field }` |
| `brand_near` | an active `substring` term (≥ 4 chars) appears inside a normalised field | +25 | `{ term, field }` |
| `offensive_term` | a `kind = offensive` term matches | +30 | `{ field }` (never the term) |
| `dup_email_norm` | another user has the same normalised e-mail (Gmail dots, `+tags`) | +25 | `{ users }` |
| `dup_phone` | other users share the E.164 phone | +20, +10 per extra user, max +40 | `{ users }` |
| `dup_network` | ≥ 2 other users linked to the same network hash in the last 24 h | +15 | `{ users }` |
| `dup_device` | another user shares the device marker (PD12) | +30 | `{ users }` |
| `linked_banned` | any identity link is shared with a banned user (`users.disabled`) | +50, band `reject_candidate` | `{ banned }` |
| `velocity_network` | `p:signup:net:<hash>` over 3 / day (core §E.8) | +20 | — |
| `turnstile_missing` / `turnstile_unverified` | the widget is configured but no token / the token failed | +20 / +10 | — |
| `too_fast` / `fast` | `formMs` < 4,000 / < 10,000 (typing time over both steps) | +30 / +10 | `{ ms }` |
| `bot_ua` / `no_ua` | the `BOT_UA` pattern of `src/lib/orders/risk.ts:38` / no User-Agent | +40 / +20 | `{ uaLabel }` |
| `phone_market_mismatch` | phone country ≠ chosen market | +5 | `{ phoneCountry, market }` |
| `market_not_allowed` | market not in `signup.allowedMarkets` (the form lists only allowed ones, so this is a forged post) | +40 | `{ market }` |
| `invite_code` | a valid platform invite code was used | −20 | `{ label }` |
| `trusted_creator` | `/app/new` by a trusted creator (PD31) | −30 | — |

Score = clamp(0, 100, Σ points). `bandFor()`: `linked_banned` → `reject_candidate`; else score ≥
`rejectCandidateMin` → `reject_candidate`; ≥ `holdMin` → `hold`; ≤ `fastLaneMax` → `fast`; else `review`.
**Hold-class flags** (`HOLD_CLASS`, block auto-approval in every mode and keep the row out of the bulk fast lane):
`linked_banned`, `brand_exact`, `offensive_term`, `bot_ua`, `market_not_allowed`, `dup_device`.

`autoApprove(mode, s, ctx)` is true only when: (`mode = "open"` or (`mode = "approval"` and `ctx.trustedCreator`
and `setting.trustedCreatorAutoApprove`)) and `s.band = "fast"` and no flag is in `HOLD_CLASS` and
`s.signals.inputs.turnstile ∈ {"ok", "off"}` (with `"off"` refused in `open`). An invite code with `auto_approve` is
handled by core §B.2 step 6 before scoring decides anything; the review row is still written (`status = approved`,
`decided_by = NULL`, `reason_code = "auto_invite"`) so the queue history is complete.

#### PLA-§3.4.2 Normalisation helpers (pure, `src/lib/platform/normalize.ts`)

- `normalizeEmailForIdentity(email)`: lower-case; `googlemail.com` → `gmail.com`; Gmail: remove dots in the local
  part; every domain: drop `+tag`. Used only for the `email_norm` link and `dup_email_norm` (login keeps exact
  e-mails, core §B.3).
- `brandTokens(s)`: NFKC, lower-case, strip combining marks (`\p{M}`), map `0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`, split
  on `[^a-z0-9؀-ۿ]+`; plus the joined string without separators (so `face-b00k` matches `facebook`).
  Arabic terms are compared after NFKC, tatweel and diacritic removal only.
- `maskEmail`, `maskPhone`, `maskName`, `maskAddress` live in `src/lib/platform/mask.ts` (§7.2).
- `skeleton()` is **R3** (PL-22, §3.4.4).

#### PLA-§3.4.3 Lookups, budgets, privacy

- MX: `new dns.promises.Resolver({ timeout: 2000, tries: 1 })`; skipped for an allow-list of large providers
  (`gmail.com`, `outlook.com`, `hotmail.com`, `live.com`, `yahoo.com`, `yahoo.fr`, `icloud.com`, `proton.me`,
  `protonmail.com`, `menara.ma`); cached 24 h per domain in `scopedCache("mx")` (platform key `"p"`, 2,000 entries,
  negatives included). The whole `scoreSignup` has a 2 s budget (core §B.2 step 5); unfinished lookups count as
  `mx_unknown` and set `partial = true`.
- Identity links written by the signup transaction (core §B.2 step 6): `email_norm`, `phone` (when set), `net`
  (`hashIp(ip)`, `src/lib/security/crypto.ts:64`), `device` (PD12), each `value_hash = hmac(value,
  "identity:<kind>")` (`src/lib/security/crypto.ts:44`). Logins add `net` and `device` links (`source = 'login'`,
  `INSERT IGNORE`, at most 20 links per user and kind; beyond that nothing is added).
- `signals` hold domains, countries, labels and counts only, never raw e-mails, phones, IPs or UA strings; the queue
  reads the applicant's own fields from `users` at render time and masks them per role (§3.5). On purge, `signals`
  and `business_context` are nulled (core §F.9).

#### PLA-§3.4.4 R3 upgrade (PL-22)

`src/lib/platform/data/confusables.ts` is generated by `scripts/platform/build-confusables.mjs` from Unicode
`confusables.txt` (size **[unverified]**; the script prints the byte count; ship only if ≤ 150 KB gz in the server
bundle). `skeleton(s)` follows UTS #39; `protected_brands.match = 'skeleton'` rows match by skeleton equality or
edit distance ≤ 1. `mixed_script` (+15) flags Latin + Cyrillic/Greek mixes in the store **name** (handles are ASCII
by rule; Arabic + Latin in a name is normal in Morocco and never flagged).

### PLA-§3.5 The approval queue (`/admin/queue`, PL-04)

**Layout (≥ 1280 px):** a 2-pane split (`react-resizable-panels`, already installed): list 44 %, detail 56 %, each
scrolling under a sticky queue header. **768-1279:** list only; selecting opens the detail in a full-height sheet.
**360:** list as cards; the detail is a full screen with a bottom action bar (Approve, Ask, Reject, ⋯).

Queue header: tabs with counts — **Review** (kinds `signup`, `reopen` in `pending`, plus `needs_info` rows the
seller has answered; default tab), **Fast lane** (`band = fast`, no hold-class flag), **Hold** (`hold` +
`reject_candidate`), **Needs info** (waiting on the seller), **Requests** (kinds `go_live`, `plan_change`,
`limit_raise`, `mode_change`, `domain`), **Snoozed**, **Decided** (last 30 days, read-only). Right side: the **SLA
tile** (median time to decision over 7 days, oldest waiting "3 h 12 min", count past `slaHours` in yellow) and the
search field (store name, handle, exact e-mail).

List row (40 px comfortable / 32 px compact): score ring (24 px, stroke tinted by band: emerald / neutral / yellow /
crimson; number inside, tabular), store name + `@handle` (protected substrings underlined with a dotted crimson
hairline), applicant first name + masked e-mail `s•••@gmail.com`, phone country flag, up to 3 flag chips + "+n",
readiness chip (No page yet / Draft ready / Submitted), market, waiting time (relative, tabular), cluster badge
("3 linked" when `cluster.users > 0`). Focus ring 2 px accent; the active row has a 3 px accent rail on the
inline-start edge (mirrors in RTL).

Detail pane, top to bottom:
1. **Header:** store name, handle, mode, market; applicant name, e-mail (full for admin+, masked for support and
   analyst), phone masked (`+212 6•• ••• •34`), signup age; buttons Open profile (E) and View as store (V).
2. **Score card:** a 56 px ring + band label + "Why" list: one row per flag with the `explainFlag()` sentence, the
   points (`+35`, tabular, crimson for positive, emerald for negative) and evidence chips. `partial` adds "Some checks
   timed out, so the score may be low."
3. **Business context** (when submitted): what they sell, social link (plain text with a Copy button, never an
   auto-link), WhatsApp number (masked), the staff question and the seller's answer.
4. **Draft preview:** a 9:16 sandboxed iframe (`sandbox="allow-scripts"`, never `allow-same-origin`) of the newest
   draft page through a 10-minute preview token (PD16), with a phone/desktop toggle; "No page yet" empty state
   otherwise.
5. **Linked accounts:** other users sharing identity links (kind chips, masked e-mail, their stores with status
   pills, banned badge), each linking to the user profile.
6. **Notes** for this store (pinned first) with an inline composer (§7.12).
7. **Decision bar** (sticky bottom): Approve (A), Ask for info (I), Reject (R), Snooze (S); a bulk bar replaces it
   when several rows are selected.

Keyboard (ignored while focus is in a text field): `J`/`K` or `↓`/`↑` move, `Enter` or `E` open the profile, `V` view
as store, `A` approve, `I` ask, `R` reject, `S` snooze, `X` select, `Shift+A` approve the selected rows (fast lane
only), `/` search, `?` shortcut sheet. After a decision the next row gets focus and its detail is prefetched.

Decisions (server actions in `src/app/admin/(console)/queue/actions.ts`, logic in `src/lib/platform/queue.ts`):

| Action | Input | Effect | Permission |
|---|---|---|---|
| `approveReviewAction` | `{ reviewId, note? }`; `note` **required** when the band is `hold` or `reject_candidate` | review `approved` (compare-and-set on `pending`/`needs_info`/`snoozed`) → `transitionStore(ctx, storeId, "active", { reason: "approved", note })` (which sends `signup.approved`, PLA-§Q.27) → audit `platform.signup.approved` `{ reviewId, score, band }` → `markHealthDirty` | `signups.decide` |
| `approveBulkAction` | `{ reviewIds }` (≤ 50) | the same per row; only rows still `pending` in the fast lane; returns `{ approved, skipped }`; audit `platform.signup.bulk_approved` `{ count }` plus one row per store | `signups.decide` |
| `askInfoAction` | `{ reviewId, question }` (≤ 500 chars; templates `console.ask.*`) | `needs_info` + `staff_question`; notify `signup.info_requested` (text = the question) → audit `platform.signup.info_requested` | `signups.decide` |
| `rejectReviewAction` | `{ reviewId, reason: RejectReason, note?, block? }` | review `rejected` → `transitionStore(…, "rejected", { reason })` (sends `signup.rejected` with the category sentence only, PLA-§Q.27) → audit; `block = true` also bans the user (checked: `users.manage` ↑) and sets `blocked` | `signups.decide` (+ `users.manage` ↑ for block) |
| `snoozeReviewAction` | `{ reviewId, until }` (1 h / 4 h / tomorrow 09:00 platform time / 3 days) | `snoozed` + `snooze_until`; it re-enters Review when the time passes (query-time, no job) → audit `platform.signup.snoozed` | `signups.decide` |
| `reopenReviewAction` | `{ reviewId }` (an appeal row) | `transitionStore(…, "pending")` from `rejected` (core §A.5.1) and the row becomes a normal review | `signups.decide` |
| `resolveRequestAction` | `{ reviewId, outcome: "grant" \| "decline", grant?: GrantSpec, note? }` | grant applies the plan / override / boost of §9 (or records the interest for `mode_change`); decline needs a note; notify `request.answered` → audit `platform.request.resolved` | `entitlements.override` (plan, limit), `signups.decide` (others) |

`RejectReason` = `brand_impersonation | prohibited_goods | suspected_scam | fake_identity | duplicate_account |
incomplete | market_not_served | other` (copy `console.reject.*`; the seller reads `shell.rejected.<reason>`, never the
risk flags). `GrantSpec` = `{ kind: "plan"; planId } | { kind: "override" | "boost"; key: EntitlementKey; value: number | boolean | null; expiresAt?: string }`.

Appeals: the rejected store's page (§22.8) offers one appeal (`signup_reviews.appeals < 1`): a 500-char message →
`submitAppealAction` (store owner; `store.read`; it writes only platform rows) → a new row `kind = 'reopen'`, `status =
'pending'`, signals copied with `appeal: true`, `appeals` incremented on the original → staff notification
`staff.appeal`.

Staff notifications: `staff.signup_new` (dedupe `signup_new:<YYYY-MM-DDTHH>`, vars `{ count }`, at most one per
hour), `staff.signup_hold` (each `hold` / `reject_candidate`), `staff.info_answered`, `staff.appeal`, `staff.request`.

Acceptance (PL-04): a staff member triages 20 fast-lane and 5 review rows with the keyboard only; each decision writes
exactly one audit row and one store notification; two staff deciding the same row at once → one wins and the other
sees "Already decided by <name>"; the split view never renders tenant HTML outside the sandboxed iframe; masked
fields carry no full phone or e-mail in the HTML or RSC payload for support/analyst (canary test, §O.3).

### PLA-§3.6 The pending sandbox from the seller's side (PL-02)

State caps are core §A.5.2 (publish, orders and integrations off; media ≤ `signup.pendingMediaMiB`; members ≤
`signup.pendingMembersMax`, PLA-§Q.8). What the seller sees is §22.7 (review card) and §22.8 (banners and locked
controls). Every locked control stays visible with a lock glyph and the line "Unlocks after approval"
(`shell.locked.after_approval`); pressing it opens the review card, never an error.

Acceptance (PL-02): in a pending store, generate → edit → preview → upload within the cap all work; publish, Sheets,
pixel CAPI tokens, Telegram, PHP export and handle rename show the locked state; approving the store unlocks them on
the next pulse (≤ 15 s) without a reload; nothing pending is reachable on a public URL except `/preview/<token>`.

### PLA-§3.7 Requests (kinds other than `signup` / `reopen`)

Created by the store owner from the limit sheet (§22.9), the plan page (§22.10.4), the mode cards (PD30) or, for a
restricted store, the restricted banner ("Ask for a review", kind `go_live`). One open request per kind per store
(`sr_store_kind_idx`), else `already_requested`; bucket `s:<sid>:request` 5/day. `createStoreRequestAction`
(`src/app/app/[store]/settings/plan/actions.ts`, P2) calls `createStoreRequest(ctx: StoreCtx, req: ReviewRequest)`
in `src/lib/platform/requests.ts` (P1). It is the one tenant-callable function in `src/lib/platform/**`
(permission `billing.manage`); it writes `signup_reviews` with `store_id` from `ctx`, `score = 0`, `band = review`,
`signals = { v: 1, flags: [], band: "review", inputs: <store facts>, cluster: { users: 0, banned: 0, kinds: [] },
partial: false, ms: 0 }`. `withdrawStoreRequestAction` sets `withdrawn`.

---

## PLA-§4. The console shell (P1; UX-03, UX-02 console)

### PLA-§4.1 Route tree and layouts

Every console page lives under `src/app/admin/(console)/**` (core §I.2). `src/app/admin/(console)/layout.tsx` calls
`requirePlatform({ throwOnFail: false })` (core §E.2: no session, no platform role, no TOTP or no gate → the neutral
404 of `src/lib/auth/unknown-page.ts`) and renders `<ConsoleShell>`. Every page re-checks its own permission with
`requirePlatform({ permission })` and every action goes through `platformAction` (lint L9). `src/app/admin/page.tsx`
(T2's R1.0 placeholder) is **deleted** when `(console)/page.tsx` lands, because both resolve to `/admin` (route
groups add no URL segment, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`).

| Path | File (under `src/app/admin/(console)/`) | Read permission | Write permissions | R |
|---|---|---|---|---|
| `/admin` | `page.tsx` | `console.read` | — | R1 |
| `/admin/queue` | `queue/page.tsx` (+ `?r=<reviewId>` selected row, `?tab=`) | `console.read` | `signups.decide`, `entitlements.override` | R1 |
| `/admin/stores` | `stores/page.tsx` | `console.read` | `notify.stores` (bulk message) | R1 |
| `/admin/stores/new` | `stores/new/page.tsx` | `stores.create` (PLA-§Q.5) | same | R1 |
| `/admin/stores/<id>/<tab>` | `stores/[id]/layout.tsx` (header) + `stores/[id]/[[...tab]]/page.tsx` | `console.read` | per action, PLA-§M.1 | R1 |
| `/admin/users`, `/admin/users/<id>/<tab>` | `users/page.tsx`, `users/[id]/[[...tab]]/page.tsx` | `console.read` | `users.manage` ↑ | R1 |
| `/admin/orders` | `orders/page.tsx` | `console.read` (id lookup); `orders.lookup` (phone) | `pii.reveal` ↑ | R1 |
| `/admin/plans`, `/admin/plans/<id>` | `plans/page.tsx`, `plans/[id]/page.tsx` | `console.read` | `plans.manage` | R1 |
| `/admin/flags` | `flags/page.tsx` (`?tab=kill\|release\|ops`) | `console.read` | `flags.manage`, `kill.manage` ↑ | R1 |
| `/admin/health` | `health/page.tsx` | `health.read` | `stores.lifecycle` (outbox replay) | R1 |
| `/admin/domains` | `domains/page.tsx` | `domains.manage` | `domains.manage` | R1 |
| `/admin/notifications` | `notifications/page.tsx` | `console.read` | — | R1 |
| `/admin/settings/{general,signup,legal,brands,backups}` | `settings/<tab>/page.tsx` | `platform.settings` (signup codes and waitlist tabs: `signups.decide`; legal: `legal.manage`; backups: `backups.manage`) | same | R1 |
| `/admin/security/{staff,audit,break-glass}` | `security/<tab>/page.tsx` | `staff.manage` / `audit.platform` | `staff.manage` ↑ | R1 |
| `/admin/ai/**` | owned by P7 (ai.md) | `ai.platform` | | R1 |
| `/admin/inbox`, `/admin/broadcasts`, `/admin/analytics`, `/admin/abuse` | D5 (R3) | `tickets.handle`, `notify.stores`, `analytics.read`, `abuse.handle` | | R3 |

Each page exports `metadata = { title: "<Screen> · Platform" }` (no store names or PII in titles) and is dynamic (it
reads the session).

### PLA-§4.2 Identity (UX-03)

- `<ConsoleShell>` (`src/components/console/shell/console-shell.tsx`) sets `data-surface="console"` on its root: the
  teal-cyan accent (OKLCH hue 205), a deep-ink sidebar in both themes, content that follows the viewer's light/dark
  theme. Token values come from P2's generator (`scripts/build-admin-css.mjs`) with the depth owned by design.md
  DES-§16.11. Default density is `compact` (32 px rows, 13 px base), switchable per viewer.
- Topbar, start to end: the **Platform** badge (a pill with the accent ring, text `console.badge`, visible on every
  console route, also at 360 px), the breadcrumb, the address-mode chip ("Temporary domain · path mode" or
  "`<root>` · subdomains"), the pulse freshness dot (§4.6), the ⌘K button, the staff bell, the step-up chip
  ("Verified · 4:12" while `step_up_at` is fresh, PLA-§Q.32), the staff menu (my account → `/app/account`, my stores →
  `/app`, density, theme, sign out).
- Sidebar footer: the platform wordmark (`platform.brand.name` in Instrument Sans, PD20), build id (8 chars), Node
  version.
- When the viewer is staff, the tenant shell only adds a "Platform console" entry to the store switcher (core §B.4);
  console screens never render inside the tenant shell.
- `test:admin-tokens` covers the console block; every console hue sits outside 25-75°.

### PLA-§4.3 Navigation (`src/components/console/nav.ts`, PD36)

```ts
export interface ConsoleNavItem {
  id: string; label: MessageKey; href: `/admin${string}`; icon: IconName;
  permission: PlatformPermission; release: "R1" | "R2" | "R3"; badge?: "queue" | "unread" | "alarms" | "kill" | "requests";
}
export interface ConsoleNavGroup { id: "pulse" | "stores" | "platform" | "settings" | "security"; label: MessageKey; items: ConsoleNavItem[] }
export function consoleNavFor(ctx: Pick<PlatformCtx, "can">, release: "R1" | "R2" | "R3"): ConsoleNavGroup[];
```

| Group | Items (R1) | Later |
|---|---|---|
| Pulse | Overview, Approvals (badge: Review + Hold), Notifications (badge: unread) | Inbox (R3) |
| Stores | Stores, People, Order lookup | Abuse (R3) |
| Platform | Plans, Flags & kill switches (badge: active kill switches), Domains, AI (P7), Health (badge: red alarms), Backups | Broadcasts, Analytics (R3) |
| Settings | General, Sign-up, Legal, Protected brands | Mail (R2) |
| Security | Staff, Audit log, Break-glass (badge: platform requests waiting) | |

Chords (never inside editable fields or open overlays, the builder's `isEditable` / `overlayOpen` rules,
`src/components/builder/shortcuts.ts:16-25`): `G O` overview, `G A` approvals, `G S` stores, `G U` people, `G R` order
lookup, `G P` plans, `G F` flags, `G H` health, `G D` domains, `G N` notifications; `?` shortcut sheet; `/` page search.

### PLA-§4.4 Console ⌘K (UX-02, console side)

`src/components/console/command/console-palette.tsx` (cmdk, installed, `package.json:50`; code-split like
`src/components/admin/shell/command-palette.tsx`). Sources, in order:
1. **Typed patterns** act at once: `@<handle>` → the store profile; an order id matching `^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$`
   (the `ORDER_ID` rule, `src/components/admin/orders/orders-view.tsx:42`) → the order lookup result; a 26-char ULID →
   store or user by id; an e-mail → people search (exact match).
2. **Server search** `GET /api/admin/search?q=` (≥ 2 chars, debounce 120 ms, skeleton rows after 150 ms kept ≥ 300 ms):
   stores by name or handle prefix (10), users by exact e-mail or name prefix (name prefix for admin+ only), the open
   review of a matching store. Bucket `p:console:search:<userId>` 60/min; fields masked per role (PD35);
   `Cache-Control: private, no-store`.
3. **Actions** filtered by `ctx.can()`: Approve next (opens the queue on the first Review row), Start view as… (pick a
   store, then the start sheet of §10.1), New invite code, Invite staff, Open kill switches (PD43: opens the page,
   never toggles), Go to … (every nav item), Toggle density, Toggle theme.

Acceptance: every result is reachable with the keyboard only; an analyst's search never returns a full e-mail; the
palette opens ≤ 50 ms after the key when warm (design.md UX-02 row).

### PLA-§4.5 Shared console patterns

- **Lists**: keyset paging (PD26). Cursor = base64url JSON `{ k: [sortValue, id] }` plus `hmac(json,
  "console-cursor")[:16]`; a tampered cursor answers page 1 (`src/lib/platform/cursor.ts`: `encodeCursor(values)`,
  `decodeCursor(token): unknown[] | null`). Page size 50 (25 below 768 px). Filters and the cursor live in the URL
  (the `useQueryState` pattern of `orders-view.tsx:56`), so every view is linkable from ⌘K and notes.
- **States** of every panel: *loading* = a skeleton that mirrors the final rows, shown after 150 ms, kept ≥ 300 ms;
  *empty* = the quiet `EmptyState` variant (one sentence, one action; design.md DES-§16); *error* = `<PanelBoundary>`
  (P2 primitive, PLA-§22.12) with "This panel couldn't load", Retry and the error reference (the `error_events` dedupe
  prefix, 8 chars), other panels unaffected; *stale* = the pulse dot turns neutral with "Updated 2 min ago".
- **Numbers**: tabular numerals; counts ≥ 10,000 as `12.4k` with the exact value in `title`; money per currency
  (`src/lib/markets/money.ts`), never summed across currencies (PD21); every rate shows `n` ("38 % · n = 214").
- **Time**: relative ("3 h 12 min") with the absolute time on hover; platform time = `APP_TIMEZONE` or
  `Africa/Casablanca`; per-store figures use the store timezone and the tile hint says so.
- **Dangerous actions**: a dialog with a `ReasonPicker` (reason codes of PLA-§8.2), an optional note, a
  `TypedConfirmDialog` where marked, then step-up when the permission is in `STEP_UP_PERMISSIONS`: the action answers
  `{ ok: false, error: "step_up" }`, the `StepUpSheet` (PLA-§22.12) collects the code, calls `stepUpAction(code)` (T2,
  core §B.7) and re-sends the original action with the **same** operation id (`opId`, a ULID created when the dialog
  opened; console actions de-duplicate on `p:op:<userId>:<opId>` for 10 minutes and answer the first result again).
- **Mutations** end with `refresh()` (PD39) and a toast; reversible ones (snooze, pin a note, a flag override) offer
  Undo for 10 s (`sonner`, installed).

### PLA-§4.6 Console pulse

`GET /api/admin/pulse` (`src/app/api/admin/pulse/route.ts`, `platformGuard(req, "console.read")`): polled every 15 s
while the tab is visible, one poller per browser (`BroadcastChannel("sg-console-pulse")`), `ETag` = sha256 of the
body → `304` when unchanged (PD38). Platform part cached 5 s (key `"p"`), unread count per user.

```ts
export interface ConsolePulse {
  v: 1; at: string;
  queue: { review: number; hold: number; requests: number; needsInfoAnswered: number; oldestMinutes: number | null; overSla: number };
  unread: number;                       // staff notifications of this user
  alarms: { red: number; yellow: number };
  kill: string[];                       // kill-switch keys currently stopping something
  pendingPlatformRequests: number;      // PLA-§2.2 rows waiting for a second person or for their delay
  auditHead: number;                    // newest audit id, drives the Activity feed
  build: string;                        // a change shows "New version available · Reload"
}
```

---

## PLA-§5. Overview: the platform pulse (`/admin`, PL-05)

### PLA-§5.1 Layout

≥ 1280 px: a row of six KPI tiles; below, a 12-column grid with **Needs attention** (8 columns) and **Activity**
(4 columns); below that **Queue snapshot** and **System** (6 + 6). 768-1279 px: tiles 3 × 2, lists stacked. 360 px: a
2-column tile grid, lists full width, Activity collapsed to 10 rows with "Show more". Each block is its own async
server component in its own `<Suspense>` + `<PanelBoundary>`, so each fails alone.

### PLA-§5.2 KPI tiles (exact definitions, real data only)

| Tile | Value | Sub-line | Source and index | Analyst |
|---|---|---|---|---|
| Active stores | `COUNT(*) stores WHERE status = 'active'` | "+ 3 restricted · 12 in review" | `stores_status_idx` | ✓ |
| Waiting for review | rows of the Review tab (§3.5) | "oldest 3 h 12 min"; yellow when past `slaHours` | `sr_kind_queue_idx` | ✓ |
| Orders, last 24 h | `COUNT(*) orders WHERE created_at >= now − 24 h` | delta vs the previous 24 h; "from n stores" | `orders_created_idx` (PD37) | k-suppressed (PD15) |
| Placed sales, last 24 h | `SUM(total)` of the same rows **per currency** | chips "MAD 48,210 · EUR 120"; hint "placed, not delivered" | same rows joined to `stores.currency` | k-suppressed |
| Errors, last 24 h | `SUM(count) error_events WHERE bucket >= <24 h ago>` | the top code and its area | `ee_bucket_idx` | ✓ |
| Database | `getDbUsage()` used / quota (`src/lib/db/usage.ts:44`) | yellow ≥ 70 %, crimson ≥ 85 % (`DB_WARN_RATIO`, `DB_BLOCK_RATIO`, `usage.ts:19-20`) | `information_schema` (its own cache) | ✓ |

Confirmed and delivered sales are not on the overview in R1 (they need P4/R2 states across stores; PL-19 in R3). A
tile with no data reads "No orders in the last 24 h", never `0` with a trend arrow. Sparklines only with ≥ 7 hourly
points (core §I.6). Tile cache 60 s (key `"p"`).

### PLA-§5.3 Needs attention

At most 20 rows, most severe first (+ "See all in Stores" → `/admin/stores?attention=1`):
1. Platform alarms from `getHealth()` (core §H.5, PLA-§15.2): last tick > 10 min, outbox `dead` > 0, DB ≥ 70 %, disk free
   < 2 GiB, inodes > 300,000, an error spike, and the "heartbeat of commerce": no order platform-wide for 3 h between
   09:00 and 23:00 platform time, once ≥ 10 stores are active.
2. Queue rows in `hold` / `reject_candidate` waiting > 2 h; requests waiting > 24 h.
3. `store_health` rows with `attention ≥ 2`, ordered `attention DESC, score ASC` (`sh_attention_idx`).
4. Platform requests (purges, super_admin promotions) waiting for a second person.

Row anatomy: a severity icon with its text label (Danger / Warning / Info; never a bare coloured dot), the sentence
(`console.attention.<code>` with vars), the store chip when relevant, "since 2 h", one action (Open profile / Open queue
/ Open health / Review request). Empty: "Nothing needs you right now" plus the time of the last check.

### PLA-§5.4 Activity feed

The last 50 audit rows whose action is in `FEED_ACTIONS` (`store.created`, `store.milestone.reached`,
`platform.signup.approved`, `platform.signup.rejected`, `platform.store.restricted`, `platform.store.suspended`,
`platform.store.restored`, `store.closed`, `store.reopened`, `store.mode_changed`, `platform.kill.changed`,
`platform.impersonation.started`), read `ORDER BY id DESC` within the newest 20,000 ids (a bounded scan of the primary
key). Row: icon, sentence (`console.feed.<action>`), store chip, actor (staff name, "System" or "Store owner"), relative
time. New rows slide in (6 px rise + fade, 180 ms, at most 12 animated; reduced motion: opacity only) when
`pulse.auditHead` moves. Analysts see the feed without staff names.

### PLA-§5.5 Queue snapshot and System

Queue snapshot: the tab counts, the SLA tile of §3.5 and the five oldest Review rows (score ring, store, waiting) with
"Open approvals". System: last tick (green < 6 min, yellow < 10 min, red), outbox pending / dead, render queue depth,
media backend (`fs`, or `db` fallback in red), build id; "Open health".

Acceptance (PL-05): ≤ 800 ms p95 server time on a seeded DB of 2,000 stores and 1,000,000 orders, every query on the
index named above (`EXPLAIN` asserted in `platform-check.ts`); a failing panel query shows that panel's error state
while the others render; with 3 active stores an analyst sees "Hidden: fewer than 5 stores contribute" on both order
tiles.

---

## PLA-§6. Stores list (`/admin/stores`, PL-06) and the health snapshot (PL-18)

### PLA-§6.1 Filters, columns, sorting

Query parameters (optional, combinable): `status` (multi), `mode`, `plan`, `market`, `band` (band of the store's latest
`signup` review), `flag` (a `HealthFlagCode`), `attention=1` (`attention ≥ 2`), `dormant=1`, `q` (name prefix, handle
prefix, or an exact owner e-mail), `sort` (`created` desc by default · `health` asc · `name` · `activity`), `cursor`.
Saved chips above the table: Needs attention · In review · Restricted · Suspended · Dormant · Quota ≥ 80 % · Sync
errors · Internal.

| Column | Content |
|---|---|
| Store | `Monogram` or logo (32 px), name, `@handle` (JetBrains Mono in a `dir="ltr"` isolate), "Internal" chip when the plan is `internal` or the id is store #1 (TN-03) |
| Status | `StatusPill`: In review, Active, Restricted, Suspended, Closed, Scheduled for deletion, Not approved |
| Mode · Plan | mode badge, plan chip |
| Market | flag + currency |
| Owner | first name + e-mail per PD35 |
| Health | 24 px ring with the score (≥ 80 emerald, 50-79 neutral, 30-49 yellow, < 30 crimson); the tooltip lists components |
| Flags | up to 3 health flag chips + "+n" |
| Orders 7 d | `store_health.metrics.orders7d`, "—" for pending stores |
| Last activity | `metrics.lastActiveAt`, relative |
| Created | relative |

Row click or Enter → the profile; `X` selects; the bulk bar offers **Message** (≤ 50 stores, `notify.stores`,
PLA-§19.1) and **Export list (CSV)** (`GET /api/admin/stores.csv` with the same filters, admin+, columns id, handle,
name, status, mode, plan, market, created, score, flags; no e-mail, no phone; ≤ 10,000 rows; audit
`platform.stores.exported`). No bulk lifecycle action (PD44).

Query: `listStores(ctx, filter, cursor)` in `src/lib/platform/stores-list.ts` (annotated `// tenancy: platform stores
list`): `stores s LEFT JOIN store_health h ON h.store_id = s.id`, optional semi-joins (`plans`; the latest review band
through `sr_store_kind_idx`), `ORDER BY <sort>, s.id LIMIT 51`. Owners come from a second query over `store_members`
(`role = 'owner'`, `sm_store_role_idx`) + `users` for the 50 ids.

States: no match → "No stores match these filters" + Clear filters; no stores at all → "No stores yet. Create an invite
code to bring in your first sellers." + New invite code.

Acceptance (PL-06): ≤ 300 ms p95 for any filter combination on 2,000 seeded stores; sorting by health lists the lowest
score first, ties broken by id; the CSV contains no `@` outside its header.

### PLA-§6.2 Store creation from the console (`/admin/stores/new`)

For internal and partner stores (core §A.5.1 "console create internal store"): name; handle (availability check;
protected terms allowed with a note, because staff may override them); mode (`landing`, `store` or `both`: internal
stores may preview R2 modes); market, currency, timezone (platform defaults); plan (default `internal`); owner (an
existing user by exact e-mail, default the staff member). It creates the `stores` row (status `active`,
`approved_by` = staff), the owner membership and an approved `signup_reviews` row (`reason_code = "console_created"`),
then audits `store.created` `{ via: "console" }`. Permission `stores.create` (PLA-§Q.5).

### PLA-§6.3 The health snapshot (PL-18, PD6, PD18, PD42)

**Pure scorer** `src/lib/platform/health-score.ts` (isomorphic, no I/O, selftested):

```ts
export interface HealthInput {
  status: StoreStatus; createdAt: Date; now: Date; slaHours: number | null;
  sheets: { connected: boolean; oldestPendingMin: number | null; lastRunFailedAt: Date | null };
  outbox: { deadByKind: Partial<Record<OutboxKind, number>> };            // last 24 h
  capiErrorAt: Date | null;                                                // the store's pixel_health setting
  usage: readonly { metric: string; period: string; used: number; limit: number | null }[];
  orders7d: { n: number; risky: number };                                  // risk_score ≥ 70
  lastActiveAt: Date | null; lastOrderAt: Date | null; lastLoginAt: Date | null;
  publishedPages: number; draftPages: number; members: number; renderFailed: number; ordersTotal: number;
  review: { submittedAt: Date | null; status: string } | null;
}
export type Milestone = "first_draft" | "first_publish" | "first_order" | "tenth_order" | "first_member" | "first_delivered";
export interface HealthResult {
  score: number; attention: 0 | 1 | 2 | 3; flags: HealthFlag[]; components: Record<HealthComponent, number>;
  dormant: boolean; reached: Milestone[];                                  // milestones true for this input
}
export function computeHealth(input: HealthInput, weights?: Partial<Record<HealthFlagCode, number>>): HealthResult;
export const HEALTH_CAPS: Record<HealthComponent, number>;   // integrations 30 · quota 20 · orders_risk 15 · activity 20 · setup 10 · renders 10
```

| Flag | Rule (starting values **[to tune]**) | Severity | Penalty | Component |
|---|---|---|---|---|
| `sheets_backlog` | connected, oldest pending order > 15 min | 2 | 15 | integrations |
| `sheets_error` | a failed `sheets.push` / `sheets.pull` run for the store in the last hour | 2 | 10 | integrations |
| `outbox_dead` | any `dead` outbox row of kind `webhook`, `whatsapp` or `carrier` in 24 h | 2 | 10 | integrations |
| `capi_failing` | `pixel_health` shows an error in 24 h, or `dead` `capi` rows | 1 | 5 | integrations |
| `telegram_failing` | `dead` `telegram` rows in 24 h | 1 | 5 | integrations |
| `quota_high` | any gauge or monthly counter ≥ 80 % of its limit | 1 | 5 | quota |
| `quota_full` | any ≥ 100 % | 2 | 15 | quota |
| `risky_orders` | `orders7d.n ≥ 20` and `risky / n ≥ 0.30` | 2 | 15 | orders_risk |
| `inactive_14d` | active store, no member activity for 14 days | 1 | 10 | activity |
| `dormant_60d` | no member login and no order for 60 days → `dormant = true` | 1 | 20 | activity |
| `setup_incomplete` | active for ≥ 7 days with no published page | 1 | 10 | setup |
| `render_failed` | ≥ 1 `failed` render job | 2 | 10 | renders |
| `review_waiting` | pending, submitted, waiting longer than `slaHours` (24 h when unset) | 1 | 0 | — |
| `restricted` / `suspended` | the status itself | 2 / 3 | 0 | — |

Score = `100 − Σ_component min(cap, Σ penalties)`, clamped 0-100; `attention` = the highest flag severity. Monotonic:
removing a flag never lowers the score (selftest). The UI always lists the components next to the number (PD18).

**Job** `platform.health` (`src/lib/jobs/tracks/platform.ts`, every tick, budget per PLA-§Q.18) takes up to 200 stores
per tick: rows with `dirty_at IS NOT NULL` first (by `dirty_at`), then the oldest `computed_at` (`sh_due_idx`), then
stores without a snapshot. For each it reads the inputs through `systemScope(ctx, storeId)` and the scoped read
functions of PLA-§Q.11, computes, and upserts `store_health` (`dirty_at = NULL`). It also:
- fills `store_health.milestones` and writes one `store.milestone.reached` audit row (`actor_kind = 'system'`, meta
  `{ milestone }`) the first time a milestone appears (PD40);
- emits `quota.80` / `quota.100` store notifications once per metric and period (`dedupeKey =
  quota<80|100>:<storeId>:<metric>:<period>`) to owners and admins;
- never writes a tenant table.

`markHealthDirty(storeId)` (`src/lib/platform/health-snapshot.ts`, `UPDATE store_health SET dirty_at = now`) is called
by every console action on a store. Bound: recomputed ≤ 5 min after a platform action, ≤ 60 min otherwise (2,000
stores / 200 per tick × 5 min = 50 min).

`store_health` columns are those of PLA-§2.2 (PLA-§Q.1), with `HealthMetrics = { orders7d: number; risky7d: number;
lastActiveAt: string | null; lastOrderAt: string | null; publishedPages: number; mediaPct: number | null }` and
`milestones` holding the ISO date each milestone was first reached.

Acceptance (PL-18): a fixture store with a 20-minute Sheets backlog shows `sheets_backlog` and a score of 85 after one
run; a suspended store enters Needs attention with severity 3; dormant flips after 60 days on a fake clock; no
snapshot column contains customer data (canary test, §O.3).

---

## PLA-§7. Store profile (`/admin/stores/<id>/<tab>`, PL-07)

### PLA-§7.1 Header (always visible, `stores/[id]/layout.tsx`)

Left: logo or `Monogram` (48 px), name, `@handle` with Copy, `StatusPill` (opens the lifecycle menu, §8), mode badge,
plan chip, market · currency · timezone, "Created 14 Oct · 10 days", owner (first name, e-mail per PD35, link to the
user profile), "Internal" chip for plan `internal` or store #1 (TN-03; store #1 shows its converted super_admin owner
like any store). Right: the 40 px health ring (hover: components and flags), open requests badge ("2 requests"),
buttons **View as store** (`V`), **Open live store** (new tab to `storeUrl(store)`, disabled with a reason when the
store is not live), **Message** (§19.1), **⋯** (Restrict, Suspend, Restore, Close, Schedule deletion, Cancel deletion,
Request purge, Export data, Copy store id; each item hidden without its permission, disabled with a reason when the
edge is not allowed from the current status). Banners under the header: an active impersonation by another staff
member ("Karim is viewing this store until 14:32"), a pending purge request, a closed store's reopen deadline.

`getStoreHeader(ctx, storeId)` (`src/lib/platform/profile/header.ts`) reads the store row **fresh** (not the 15 s
cache), owners, plan name, `store_health`, open requests and active `impersonation_sessions`. An unknown id → the
console's own not-found state "No store with this id" (staff may know ids; no oracle concern inside the console).

Tabs (`[[...tab]]`, default `overview`); keyboard `1`…`9` jump to the first nine tabs; the tab bar scrolls
horizontally at 360 px with the active tab kept in view.

### PLA-§7.2 Masking (`src/lib/platform/mask.ts`, pure, shared by every console projection)

```ts
declare const MASKED: unique symbol;
export type Masked = string & { readonly [MASKED]: true };      // components accept Masked where PII could appear
export function maskPhone(e164: string): Masked;     // "+212612345634" → "+212 6•• ••• •34" (country code, first national digit, last 2)
export function maskEmail(email: string): Masked;    // "salma.b@gmail.com" → "s•••@gmail.com"
export function maskName(name: string): Masked;      // "Salma Benali" → "Salma B."; one word → first letter + "•••"
export function maskAddress(city: string | null): Masked;   // "Casablanca · address hidden"; null → "Address hidden"
export function maskIp(ip: string | null): Masked;   // IPv4 "196.200.•.•", IPv6 first 3 groups + "::•"
export function sellerContact(role: PlatformRole, v: { email: string; phone: string | null }): { email: string | Masked; phone: string | Masked | null };   // PD35
```

Rules: customer name, phone, address, note and free-text fields leave `src/lib/platform/profile/**` only as `Masked`
values (PD2); order notes and customer notes are replaced by "Note hidden"; the only unmasked path is
`revealOrderPii` (§7.4). Seller contact follows PD35. Masking runs on the server before the RSC payload is built, so
neither the HTML nor the flight data contains the raw value (canary test §O.3).

### PLA-§7.3 Overview tab

Range switch 7 / 30 / 90 days (store timezone). Tiles (each shows `n` where it is a rate):
visitors (unique, `stats_daily`) · orders placed · confirmation rate (confirmed / (placed − still open), from P4's
`confirm_state`) · delivery rate (from R2 ship states; R1 shows "Fills in with delivery tracking (R2)") · placed sales ·
confirmed sales · delivered sales (R2) · average order (placed) · refusal / return rate (R2). Chart: daily orders placed
vs confirmed (two series, neutral and jade; ≥ 7 points or a table). Milestones strip: first draft, first publish,
first order, 10th order, first teammate, first delivered (R2) with dates from `store_health.milestones`. Health
components table (component, penalty, flags). Data: `getStoreOverview(ctx, storeId, range)` combining
`orderKpis(scope, range)` (P4) and `pageStats(scope, range)` (T3 stats), PLA-§Q.11.

### PLA-§7.4 Orders tab (masked)

The store's orders through P4's `listOrdersForConsole(scope, query)` (PLA-§Q.11) as a read-only table: id, created
(store time), status / `confirm_state`, total, masked customer (`maskName`, `maskPhone`, `maskAddress`), page, risk
score chip (≥ 70 crimson), source. Filters: status, risk ≥ 70, date range, page. Status counts above the table; a risk
distribution bar (0-29 / 30-69 / ≥ 70 with `n`). Row → a read-only drawer (lines, timeline from `order_events`,
attempts) with every PII field masked.

**Reveal one order**: "Reveal customer details" in the drawer → dialog with a reason (`ticket`, `fraud_review`,
`legal_request`, `delivery_dispute`, `other` + note) → `revealOrderPiiAction({ storeId, orderId, reason, note })`
(`pii.reveal` ↑) → returns `{ name, phone, address, city, note }` for display only (never cached, never logged), shown
for 60 s then masked again; writes `platform.pii.revealed` (store_id = the store, meta `{ orderId, reason }`) and an
`order_events` row through P4's `recordPlatformReveal(scope, orderId, staff)`; the store's Activity shows it with the
staff name. Bucket `p:pii:reveal:<userId>` 20/day. **No CSV export** of orders exists in the console (core §F.11).

### PLA-§7.5 Pages tab

`listPagesForConsole(scope)` (T4's `src/lib/admin-data/pages.ts`, PLA-§Q.11): name, slug, status, last publish, views
30 d, orders 30 d, versions kept / bytes, the live URL (`storeUrl`), a **Preview** button that opens a 10-minute
`/preview/<token>` URL in a sandboxed iframe sheet (PD16, `sandbox="allow-scripts"`, never `allow-same-origin`).
Products and collections appear here from R2 (catalog read API of storefront.md). No unpublish in R1 (PD33).

### PLA-§7.6 Team tab

Members: name, e-mail (PD35), role, membership status, 2FA on/off, last active, joined, invited by. Pending invites:
masked e-mail, role, inviter, expiry, state. Agent profiles (presence, daily cap) from R1 P4 data when present. Each
member links to `/admin/users/<id>`, where the user-level actions live (ban, 2FA reset, reset link, sign out; PD34).
"Require 2FA for members" state and the count of members without 2FA. Data: `getStoreTeam(ctx, storeId)`
(`store_members`, `store_invites`, `users`, `agent_profiles` through the T2/P4 read functions).

### PLA-§7.7 Activity tab

`listPlatformAudit(ctx, { storeId, beforeId })` (core §F.5) merged with this store's `impersonation_sessions`. Filters:
actor kind (Member · Platform · Support view · System · API), area (auth, pages, orders, team, settings, integrations,
platform), staff member, date. Row: time, actor (member name, staff name + role, "System"), action sentence
(`console.audit.<action>`, falling back to the raw action name in mono), target, meta summary (redacted by
`src/lib/audit.ts`), IP hash short for super_admin only. Keyset by id, 50 per page.

### PLA-§7.8 Timeline tab

One merged stream, newest first, 50 per page: lifecycle transitions (`platform.store.*`, `store.closed`,
`store.reopened`, `store.deletion_scheduled`), review decisions and requests (`signup_reviews`), plan changes and
boosts (`platform.plan.changed`, `platform.entitlement.set`), milestones (`store.milestone.reached`), impersonations
(start/end), staff notes of kind `decision` / `warning`, exports (`store.export_*`), handle renames. Source:
`listStoreTimeline(ctx, storeId, cursor)` = four bounded queries (audit by `audit_store_idx` with an action allow-list,
`sr_store_idx`, `imp_store_idx`, `pn_store_idx`) merged in memory by time; cursor = `{ at, source, id }`. Each event:
icon, sentence, actor, time; decisions show their note.

### PLA-§7.9 Usage & plan tab

- Plan card: plan name, since (`store_subscriptions`), **Change plan** (`entitlements.override`, §9.3).
- Entitlements table (one row per registry key live in the current release): key label, plan value, override / boost
  (value, expiry, set by, reason), state cap (e.g. "Pending: 100 MiB"), kill switch effect, **effective value**,
  actions Add override / Add boost / Remove. Keys of later releases are listed collapsed under "Later".
- Usage meters: media bytes, pages, members, agents (gauges), exports, AI credits, orders (this month in the store
  timezone), each `UsageMeter` with used / limit / % and the last reconcile time (`usage.reconcile` job).
- History: subscriptions and entitlement audit rows.
- `orders_month_soft`: when set and exceeded, the yellow line "Above the soft order limit (banner only, orders are never
  blocked)".
Data: `getStoreUsage(ctx, storeId)` = `entitlements(platformScope)` (core §A.4) + `store_entitlements` + `store_usage`.

### PLA-§7.10 Integrations tab

`integrationHealth(scope)` (P5, PLA-§Q.11) rendered as tiles in the `sheet-health.tsx` pattern: **Sheets** (connected,
spreadsheet title only, binding verified at, backlog count and oldest, last push / pull and result, last error code),
**Pixels** (library count, per pixel: platform, label, CAPI token "set / not set", last OK, last error code; never the
token), **Telegram** (configured y/n, last delivery result), **WhatsApp templates** (count), **Turnstile** (store
override "set / not set"), **Outbox** (pending / dead per kind for this store with "Replay" on dead rows,
`stores.lifecycle`, P8's `replay(ctx, id)`), **Webhooks / carriers** (R2). Every tile: OK / Warning / Error with the
last error summary; secrets only ever "set / not set" (core §F.10).

### PLA-§7.11 AI tab

`aiUsageForStore(scope, month)` (P7, PLA-§Q.11): credits used / limit this month, cloud cost this month (USD micros →
"$1.84"), runs by task (count, provider mix server / local / library, p50 / p95 ms, guard rejections), cache hit rate,
store AI mode (`store_ai.mode`), learning on/off, the last 20 runs as metadata (task, provider, model, ms, credits,
outcome); never prompt or output text (ai.md AI-§E.5). Boost AI credits → §9.4.

### PLA-§7.12 Notes tab (and the note composer used in the queue)

Composer: markdown-lite body (≤ 4,000 chars, PLA-§13.6), kind `note` / `decision` / `warning`, pin toggle, `@name`
mentions of staff (autocomplete over staff names; a mention sends `staff.mention`). List: pinned first, then newest;
each note shows author, role, time, edited marker; the author may edit within 24 h; the author or a super_admin may
delete (soft, `deleted_at`; the audit keeps the event). Analysts never see notes (`stores.notes`). A store never sees
notes. `src/lib/platform/notes.ts`: `listNotes(ctx, { storeId? , userId? })`, `addNote(ctx, input)`,
`editNote(ctx, id, body)`, `deleteNote(ctx, id)`, `pinNote(ctx, id, pinned)`.

### PLA-§7.13 Domains, Risk and Media tabs

- **Domains**: address mode and canonical URL (`addressMode`, `storeUrl`), the P-mode URL, the subdomain once S mode is
  on, handle history (`store_handle_history`: old handle, reason, redirect until), this store's `render_jobs` with
  reason `address` (pending / done / failed, Retry failed → P8 `enqueueRenders(systemScope, ids, "address")`,
  `domains.manage`); custom domains (`store_domains`) from R3.
- **Risk**: the signup review snapshot (score ring, band, every flag with `explainFlag()` and its evidence, `partial`),
  linked accounts (users sharing identity links, their stores and ban state), the order risk mix of the last 30 days
  (share ≥ 70 with `n`, top flags from `src/lib/orders/risk.ts` codes), blocklist size, restriction history, abuse
  reports (R3).
- **Media**: asset grid (thumbnail, kind, bytes, used-in count from `asset_refs`, created) through
  `GET /api/admin/stores/<id>/media/<key>` (`src/app/api/admin/stores/[id]/media/[key]/route.ts`, `platformGuard`
  `console.read`, streams through P8's storage driver with the media route's sandbox CSP, nosniff and
  `Cache-Control: private, no-store`), so thumbnails also work while the public media route 404s for a suspended
  store. Totals per kind. No delete or takedown in R1 (PD33).

### PLA-§7.14 Export from the profile (PL-09, PD27)

⋯ → Export data (super_admin with `stores.close` ↑ and a reason, core §F.9): `requestPlatformExportAction({ storeId,
reason, note })` → P8's `requestStoreExport(platformScope, { requestedAs: "platform", requestedBy })`
(PLA-§Q.25) → audit `store.export_requested` (`actor_kind = 'platform'`) → store notification `store.export_by_platform`
(owners) → the profile shows the job state (pending / running with the part count / ready / failed). Download links
`GET /api/admin/stores/<id>/exports/<jobId>/<part>?t=<sig>`, `sig = hmac(jobId|part|exp|staffUserId,
"export-dl-staff:<storeId>")`, valid 24 h, checked with `platformGuard(req, "stores.close")` and step-up fresh; each
download audits `store.export_downloaded` (`actor_kind = 'platform'`).

### PLA-§7.15 Ops (R2) and Support (R3) tabs

Ops (S6, R2): confirmation and delivery rates by agent and city, agent KPIs, carrier / Sheets / webhook health,
remittance ageing, aggregates only, no customer rows. Support (D5, R3): the store's tickets, support grants, messages
sent, impersonation sessions.

Acceptance (PL-07): each of the 13 R1 tabs renders loading, empty and error states (screenshot test at 1280 and 360);
for support and analyst sessions the HTML and RSC payload of every tab contain none of the seeded customer canaries
(phone, name, address, note) nor the seller's full e-mail; a reveal writes exactly one audit row and one order event and
is visible in the store's own Activity; the Media tab shows thumbnails for a suspended store.

---

## PLA-§8. Lifecycle actions (PL-08)

### PLA-§8.1 Actions

All call `transitionStore(ctx, storeId, to, { reason, note })` (core §A.5.1, T1), which validates the edge, writes the
audit row and the store notification (kinds of §18.2, PLA-§Q.27), invalidates caches and releases agent leases. The
console action adds `markHealthDirty`, the optional "show this note to the store" text and `refresh()`.

| Console action | Edge | Permission | ↑ | Reason codes | Typed confirm | Store sees |
|---|---|---|---|---|---|---|
| `restrictStoreAction` | active → restricted | `stores.lifecycle` | | `RESTRICT_REASONS` | — | restricted banner with the reason sentence |
| `suspendStoreAction` (+ `suspendNotice: boolean`) | active / restricted → suspended | `stores.lifecycle` | ↑ | `SUSPEND_REASONS` | handle | read-only dashboard + banner; public pages 404 (or the neutral 503 when `suspendNotice`, D32) |
| `restoreStoreAction` (`to: "active" \| "restricted"`) | restricted → active; suspended → active / restricted | `stores.lifecycle` | | `RESTORE_REASONS` | — | "Your store is active again" |
| `closeStoreAction` | active / restricted / suspended / pending → closed | `stores.close` | ↑ | `CLOSE_REASONS` | handle | closed banner with the reopen deadline |
| `reopenStoreAction` | closed → previous state (≤ 30 days) | `stores.close` | | `RESTORE_REASONS` | — | "Your store was reopened" |
| `scheduleDeletionAction` | closed → scheduled_deletion | `stores.close` | ↑ | `DELETION_REASONS` | handle | "Scheduled for deletion on <date>" page |
| `cancelDeletionAction` | scheduled_deletion → closed | super_admin (`stores.purge`) | ↑ | `RESTORE_REASONS` | — | "Deletion cancelled" |
| `requestPurgeAction` (`mode: "four_eyes" \| "delayed"`) | any → purged via `platform_requests` (PD7) | `stores.purge` | ↑ | `PURGE_REASONS` | handle + "purge" | nothing until executed |
| `confirmPurgeAction` / `cancelPurgeAction` | `platform_requests` pending → confirmed / cancelled | `stores.purge` (a different staff member to confirm) | ↑ | — | handle | — |

Rules: a note is required for every `other` reason; a staff note reaches the store only when the "Show this note to
the store" toggle is on (default off; the store otherwise reads the reason sentence only). Closing a pending store
also withdraws its open review. Purge: `four_eyes` = a second staff member with `stores.purge` confirms, then the
`platform.requests` job executes on its next tick; `delayed` = executes 24 h after the request unless cancelled; both
only while the store is `closed` or `scheduled_deletion` (§2.2), both notify every other super_admin
(`staff.purge_requested`), execution moves the store to `scheduled_deletion` with `purge_after = now` and the purge job
(core §H.9) takes over. Self-confirmation is refused in SQL (`confirmed_by <> requested_by`).

### PLA-§8.2 Reason codes (`src/lib/platform/reasons.ts`)

```ts
export const RESTRICT_REASONS = ["fake_orders", "customer_complaints", "policy_review", "brand_complaint", "other"] as const;
export const SUSPEND_REASONS  = ["scam_suspected", "phishing", "prohibited_goods", "counterfeit", "legal_request", "security_incident", "owner_banned", "other"] as const;
export const RESTORE_REASONS  = ["issue_resolved", "appeal_accepted", "mistake", "other"] as const;
export const CLOSE_REASONS    = ["owner_request", "abandoned", "terms_violation", "other"] as const;
export const DELETION_REASONS = ["owner_request", "retention", "terms_violation", "other"] as const;
export const PURGE_REASONS    = ["legal_request", "owner_request_urgent", "abuse", "other"] as const;
export type StoreStatusReason =
  | (typeof RESTRICT_REASONS)[number] | (typeof SUSPEND_REASONS)[number] | (typeof RESTORE_REASONS)[number]
  | (typeof CLOSE_REASONS)[number] | (typeof DELETION_REASONS)[number] | (typeof PURGE_REASONS)[number]
  | "approved" | "rejected" | "appeal" | "console_created" | "owner_closed" | "expired";
```

Copy: `console.reason.<code>` (staff label, en) and `shell.status_reason.<code>` (store sentence, ar/fr/en). The
`stores.status_reason` column (varchar 40) stores the code.

Acceptance (PL-08): every edge of core §A.5.1 that a staff member can take is reachable from the profile menu with the
listed permission, step-up and confirmation; an illegal edge is disabled with its reason; two staff restricting the
same store at once → one succeeds, the other sees "The store's status changed; reload" (compare-and-set); a
four-eyes purge requested by A cannot be confirmed by A (DB test).

---

## PLA-§9. Plans, entitlements and boosts (PL-11)

### PLA-§9.1 Plans list (`/admin/plans`)

Table: plan name, id (mono), status (active / hidden / retired), stores on it (count), sort order, last change. "New
plan" (`plans.manage`): id `^[a-z][a-z0-9_]{1,31}$`, name, "copy limits from" (an existing plan). Hidden = assignable
by staff, not offered to sellers; retired = stores keep it, nobody can be moved onto it. Beta is marked "Default for
new stores" (the default is the `stores.plan_id` column default `beta`; changing the default plan is out of scope in
R1).

### PLA-§9.2 Plan editor (`/admin/plans/<id>`)

Rows grouped **Limits**, **Features**, **Later releases** (keys whose `release` is not live yet: shown disabled with
the release chip). Each row: label + one-line description (`console.entitlement.<key>`), registry default, the plan's
value (number input with unit and an "Unlimited" toggle; switch for features; "Use default" option), and the effective
example ("Stores on this plan get 1 GiB"). `take_orders` is locked to **On** with the note
`console.plans.take_orders_locked` ("Orders are never blocked by a plan", PD8). Saving opens the **impact preview**:

```ts
// src/lib/platform/plans.ts
export interface PlanImpact {
  stores: number;                                    // stores on the plan without an override for the key
  lowered: { key: EntitlementKey; from: number | null; to: number | null; storesAbove: number }[];   // already above the new limit
  featuresOff: { key: EntitlementKey; stores: number }[];
}
export function previewPlanChange(ctx: PlatformCtx, planId: string, patch: PlanPatch): Promise<PlanImpact>;
export function savePlan(ctx: PlatformCtx, planId: string, patch: PlanPatch, opId: string): Promise<void>;   // audit platform.plan.updated { diff }
```

Sentence form: "Lowers media storage for 12 stores; 3 are already above 500 MiB: they keep their files, new uploads
are refused." Confirm → save → `invalidateEntitlements(id)` for every store on the plan (≤ 2,000 in-process deletes) →
`refresh()`. Validation: limits are integers ≥ 0 or `null`; feature values boolean; unknown keys refused.

### PLA-§9.3 Assign a plan to a store

From the Usage & plan tab or a resolved `plan_change` request: plan picker (active + hidden plans), effective date
(now), note → `assignPlanAction({ storeId, planId, note })` (`entitlements.override`): `stores.plan_id`, ends the
current `store_subscriptions` row and inserts one (`provider = 'manual'`, `period_start = now`, `created_by`, `note`),
audit `platform.plan.changed` `{ from, to }`, store notification `plan.changed`, `invalidateEntitlements`,
`markHealthDirty`.

### PLA-§9.4 Overrides and boosts

Dialog: key (registry picker, current effective value shown), source **Override** (expiry optional) or **Boost**
(expiry required, ≤ 90 days), value, expiry presets (7 / 30 / 90 days or a date), reason (required, ≤ 200 chars) →
`setEntitlementAction({ storeId, key, source, value, expiresAt, reason })` (`entitlements.override`): upsert
`store_entitlements`, audit `platform.entitlement.set`, store notification `plan.boost_granted` for boosts,
`invalidateEntitlements`. Remove → `clearEntitlementAction`. `take_orders` cannot be overridden to `false` (refused
`take_orders_locked`). Job `platform.entitlements` (hourly): sends `plan.boost_ending` 3 days before a boost expires
(dedupe per row), deletes rows expired for more than 30 days (audit summary in `job_runs`).

Acceptance (PL-11): lowering `media_bytes` on Beta from 1 GiB to 500 MiB shows the exact count of affected stores
seeded above 500 MiB; a boost with an expiry in the past is ignored by `entitlement()` (T1) and removed by the job
after 30 days; `take_orders` can be turned off neither in a plan nor by an override (both refused server-side).

---

## PLA-§10. Impersonation UX ("View as store", PL-10)

### PLA-§10.1 Start sheet

Entry points: profile `V` / button, the queue detail `V`, ⌘K "Start view as…", (R3) a ticket. Sheet content: store name
and handle; reason (`ImpersonationReason`: Onboarding help · Ticket · Abuse review · Bug reproduction · Other); note
(required for Other, ≤ 300); ticket reference (required for the support role, ≤ 60 chars, free text in R1, e.g. the
WhatsApp conversation date, since tickets are R3); duration 15 / 30 / 60 min (default 30); a preview box with the
**exact** notification the store will read, rendered in the store's default locale ("Store Gen support viewed your
store · Onboarding help · 14:02-14:32"). Primary button "Start read-only view".

`startImpersonationAction(input)` (`stores.impersonate`) → core `startImpersonation(ctx, input)` (T2, frozen in
`src/lib/platform/impersonation.ts`) → redirect to the returned `/app/<h>` URL. Refusals (PD45): the staff member is a
member of the store → "You're a member of this store. Open it from your stores." with a link; status
`scheduled_deletion` or `purged` → disabled; another active impersonation in this session → it is ended first
(`ended`) and the new one starts. Bucket `p:impersonate:<userId>` 20/day.

### PLA-§10.2 While viewing (tenant shell, P2 component `ImpersonationRibbon`)

A full-width violet ribbon (hue 295, 36 px, above the topbar, never dismissible): "Viewing **<store>** as Store Gen
support · read-only · 24:13 left" + "Why" popover (reason, note, ticket ref) + **End**. The countdown is computed from
`ctx.impersonation.expiresAt` (server time offset corrected once); at 0 the client calls `endImpersonationAction` and
navigates to the profile. Every write control stays visible; pressing it gives the toast
`shell.impersonation.write_refused` ("Read-only while support is viewing"), never a modal; the server refuses anyway
(`impersonation_read_only`, audited by the seam). Sensitive surfaces (secrets, phone reveal, exports, account pages of
the seller) show the lock state `shell.impersonation.hidden`. The ribbon text has ≥ 4.5:1 contrast (design.md UX-03
row).

### PLA-§10.3 End and afterwards

`endImpersonationAction()` → core `endImpersonation(ctx, "ended")` → redirect `/admin/stores/<id>/activity`. The store
receives `store.impersonation_started` at start (owners and admins) and `store.impersonation_ended` with the actual
window at the end or expiry; both appear in the store's Activity with the staff display name (core §F.5).

Acceptance (PL-10): start → the store's notification exists with the reason and window; every exported store action
called during the session answers `impersonation_read_only` and writes `platform.impersonation.write_refused` (attack
suite); the ribbon counts down and the session ends itself at expiry (fake clock); a support user without a ticket
reference cannot start; End returns to the profile's Activity tab where the session is listed.

---

## PLA-§11. People and the order lookup

### PLA-§11.1 People list (`/admin/users`)

Search: exact e-mail (every role; results masked per PD35), name prefix (admin+), exact phone in E.164 (admin+, via
`users.phone`). Filters: platform role, banned, 2FA on/off, created range, "no store". Columns: name, e-mail (PD35),
phone country, stores (count of memberships; "owner of 2"), platform role chip, 2FA, last sign-in
(`users.last_login_at`), created, Banned badge with the reason on hover. `src/lib/platform/people.ts`
(`listPeople(ctx, filter, cursor)`, annotated `// tenancy: platform people`).

### PLA-§11.2 User profile (`/admin/users/<id>/<tab>`)

Header: name, e-mail, phone (PD35), UI locale, created, last sign-in, platform role, 2FA status, ban state (reason,
date, by whom). Tabs:
- **Stores**: memberships (store, role, membership status, store status, joined, last active); links to profiles.
- **Sessions**: device label (`describeUserAgent`, `src/lib/admin-data/security.ts:28`), created, last seen
  (`sessions.last_seen_at`), IP masked (`maskIp`), impersonation marker for staff sessions.
- **Sign-up**: the user's `signup_reviews` (store, score, band, decision).
- **Linked**: users sharing identity links (kinds, their stores, ban state).
- **Activity**: audit rows with `user_id` = this user, platform and store rows.
- **Notes**: `platform_notes` with `user_id` (§7.12).

Actions (all `users.manage` ↑ with a reason, `p:users:manage:<staffId>` 30/h; none can target oneself; a target with a
platform role can be changed only by a super_admin, and only through §14):

| Action | Effect (T2 functions, PLA-§Q.19) | Audit | User / store sees |
|---|---|---|---|
| Ban | `banUser(ctx, userId, { reason, note })`: `disabled = 1`, `disabled_reason`, `disabled_at`, every session revoked; option "Also suspend stores where this person is the only owner" → `transitionStore(…, "suspended", { reason: "owner_banned" })` per store (`stores.lifecycle` ↑ checked too) | `platform.user.banned` | signed out; the sign-in page answers generically |
| Unban | `unbanUser(ctx, userId, note)` | `platform.user.unbanned` | — |
| Reset 2FA | `resetUserTwoFactor(ctx, userId, reason)` (core §B.7) | `platform.user.2fa_reset` | notification `user.2fa_reset` |
| Create reset link | `createPasswordResetLink(ctx, userId, reason)` → `{ url, expiresAt }` shown **once** with Copy and "Send on WhatsApp" (`https://wa.me/<user phone digits>?text=<console.reset.wa_text>` when the phone is known) | `platform.user.reset_link` | notification `user.password_reset` after use |
| Sign out everywhere | `revokeUserSessions(userId)` | `platform.user.signed_out` | signed out |

### PLA-§11.3 Order lookup (`/admin/orders`, PD14)

- **By order id** (every console role): the exact id → one card: store (link), created (store time), status /
  `confirm_state`, total + currency, masked customer, items summary, page; "Open in the store profile" →
  `/admin/stores/<id>/orders?o=<orderId>` (the drawer opens; reveal from there, §7.4). Lookup on the global primary
  key (core D28). Unknown id → "No order with this id".
- **By phone** (`orders.lookup`, admin+, PLA-§Q.5): an E.164 number (`libphonenumber-js`, default region MA) → one
  row per store where it ordered: store, orders count, last order date, delivered / refused counts when known, the
  store's blocklist state for that phone; masked phone in the result header. Query on `customers.phone`
  (`cu_phone_idx`, PLA-§Q.10). Audit `platform.order.lookup` with meta `{ phoneHash: hmac(phone, "console-lookup"),
  stores: n }` (never the raw phone). Bucket `p:orders:lookup:<userId>` 30/h.

Acceptance: an analyst can open the page but the phone field is absent; a phone lookup writes one audit row without the
phone; results never show a customer name beyond `maskName`.

---

## PLA-§12. Feature flags and kill switches (`/admin/flags`, PL-12)

### PLA-§12.1 Kill switches (tab `kill`)

One card per seeded key (core §D.4, §H.8): `signups_enabled`, `publishing_enabled`, `ai_generation_enabled`,
`sheets_sync_enabled`, `capi_enabled`, `uploads_enabled`, `platform_read_only`. Card: name, one sentence of effect
(`console.kill.<key>.effect`), state shown as **Normal** or **Stopped** (for `platform_read_only`: **Off** or
**Read-only on**), last change (who, when, reason), history (last 20).

Toggle → sheet (PD29): what stops and what keeps working (e.g. read-only: "Dashboards become read-only for every store.
Orders, leads and Sheets keep flowing."), the **tenant banner preview** in ar / fr / en tabs (the exact
`shell.kill.<key>` texts), the **affected stores** count (`signups`: —; `publishing`, `uploads`, `ai`,
`platform_read_only`: stores in `pending`, `active`, `restricted`; `sheets`: stores with a `sheet_bindings` row;
`capi`: stores with a pixel library entry), reason (required, ≤ 200), typed confirmation for `platform_read_only`
(type `read-only`) and `signups_enabled` (type `stop sign-ups`), then step-up. →
`setKillSwitchAction({ key, value, reason, opId })` (`kill.manage` ↑): updates `flags.default_value`, audit
`platform.kill.changed` `{ key, from, to, reason }`, staff notification `staff.kill_changed`, `invalidateFlags()`
(PLA-§Q.16). Tenants see the banner within 45 s (flag cache 30 s + one pulse). `platform_read_only` can always be
switched off, even while on (core §H.8 exempts `kill.manage`).

### PLA-§12.2 Release and ops flags (tabs `release`, `ops`; `experiment` from R3)

Flags are declared in code and seeded at boot (`INSERT IGNORE` description, kind, default; console edits to
`default_value` and `rules` are never overwritten; flags removed from code are marked `archived`, never deleted):

```ts
// src/lib/platform/flags.ts (server-only); declarations: src/lib/flags/defs/<track>.ts (PLA-§Q.16)
export interface FlagDef<T extends FlagValue = FlagValue> { key: string; kind: "release" | "ops" | "experiment"; type: "boolean" | "number" | "string" | "json"; description: string; default: T; ownerTrack: string }
export type FlagValue = boolean | number | string | Record<string, unknown>;
export interface FlagRule { when: { plans?: string[]; modes?: StoreMode[]; markets?: string[]; storeStatus?: StoreStatus[]; platformRoles?: PlatformRole[] }; value: FlagValue; rollout?: number /* 0-100 */ }
export interface FlagContext { storeId?: string; userId?: string; planId?: string; mode?: StoreMode; market?: string; storeStatus?: StoreStatus; platformRole?: PlatformRole | "none" }
export function flagValue<T extends FlagValue>(key: string, ctx: FlagContext): Promise<T>;
// order: override user > store > plan > market (not expired) → first matching rule (rollout bucket =
// parseInt(sha256(key + ":" + (storeId ?? userId ?? ""))[0..7], 16) % 100 < rollout) → default_value → FlagDef.default
export function flagsFor(ctx: FlagContext, keys: readonly string[]): Promise<Record<string, FlagValue>>;   // one cached read
```

Table: key (mono), kind, description, type, default, rules (summary "Pro plan → on · 20 % of stores → on"),
overrides count, owner track, updated by / at, archived. Editor (`flags.manage`): default value (typed input, JSON
validated for `json`), rules (ordered list, drag to reorder, each with conditions and a value, optional rollout), and
overrides (scope store / user / plan / market, id picker, value, note ≤ 200, optional expiry) →
`saveFlagAction`, `setFlagOverrideAction`, `clearFlagOverrideAction`; audit `platform.flag.changed` with the diff.
Kill-switch rows never appear in these tabs.

Acceptance (PL-12): toggling `publishing_enabled` off shows the banner in a seeded store within 45 s and publish answers
`feature_off` with reason `kill`; orders keep being accepted with `platform_read_only` on (e2e); a 20 % rollout puts the
same store in the same bucket on every evaluation; an expired override is ignored.

---

## PLA-§13. Platform settings and legal (PL-14, TN-04)

All settings go through `getPlatformSetting` / `setPlatformSetting` (core §D.10) with the `platform` schema of §2.4;
each save is `savePlatformSettingsAction({ section, patch, opId })` (`platform.settings`; signup codes and waitlist
`signups.decide`), validated per section, audited `platform.settings.updated` with `{ key, section, changed: [paths] }`
(values only for non-secret scalar fields).

### PLA-§13.1 General (`/admin/settings/general`)

- **Brand**: platform name (used by the TOTP issuer, titles, the manifest; changing it never touches the HKDF salt or
  purpose strings, core §F.3), support WhatsApp (E.164, with a "Test" link that opens `wa.me`), support hours (free
  text, shown as typed).
- **New store defaults**: market, currency, timezone, default locale, locales.
- **Reserved handles**: chips (`^[a-z0-9-]{1,30}$`, ≤ 500), added to `RESERVED_HANDLES` by `handleProblem`
  (PLA-§Q.30); adding a handle that a store already uses shows "Kept for @x; new stores can't take it".
- **Analytics privacy**: `k` (5-50, minimum 5).
- **Seller brand colours**: `allowSellerBrandOrange` (default off, D37). Switching it on needs the typed confirmation
  `allow orange` and shows the owner rule text; the console accent and every admin token stay outside the band
  regardless (the setting affects generated store palettes and the seller colour picker only).

### PLA-§13.2 Sign-up (`/admin/settings/signup`)

Tabs **Mode & thresholds** (§3.2), **Invite codes** and **Waitlist** (§3.3), **Turnstile** (the `platform_turnstile`
widget: site key, secret "set / not set" with Replace, hostnames note "the apex hostname covers every store subdomain",
"Test" button that verifies a token from an embedded test widget; secrets are never displayed).

### PLA-§13.3 Protected brands (`/admin/settings/brands`)

Table: term, kind (brand, bank, carrier, gov, platform, offensive: offensive terms show as "••••" until "Show"), match
(exact, substring; skeleton from R3), active, note, added by. Add / edit / disable; seeded rows can be disabled, never
deleted (PLA-§2.1); staff-added rows can be deleted. A **"Check a name"** box runs `brandTokens()` + the active terms
on any typed name, handle or e-mail and lists the matches with their points, so staff can test a rule before relying
on it. Cache invalidation: the 5-minute `protectedTerms()` cache is cleared on save.

### PLA-§13.4 Legal documents (`/admin/settings/legal`, `legal.manage`)

List grouped by kind (`tos`, `privacy`, `aup`, `dpa` (R2, rethink cut), `store_privacy`, `store_terms`,
`store_shipping`, `store_returns`, `store_contact`) × locale (ar, fr, en): version, status (draft / published /
retired), the yellow chip **Needs legal review** while `needs_legal_review`, effective date, published at, acceptances
count (platform kinds). Editor: title, body (markdown-lite, §13.6), "What changed" summary (≤ 500), effective date,
"Ask people to accept again" (`requiresReacceptance`), a line diff against the previous version. Actions
(`src/lib/platform/legal.ts`):
- **Save draft** → a new version row when the current one is published (versions are immutable once published).
- **Mark reviewed by a lawyer** (typed `reviewed`): sets `reviewed_at`, `reviewed_by`, clears `needs_legal_review`.
- **Publish**: when still `needs_legal_review`, an acknowledgement checkbox ("I publish a template that no lawyer has
  reviewed") and the typed text `publish unreviewed` record `ack_unreviewed_by/at` (PD17); the previous published
  version of that kind and locale becomes `retired`.
- **Retire** (only when another published version exists for that kind and locale).
Audit `platform.legal.saved|reviewed|published|retired`.

Store templates (`store_*`) are the starting texts tenants adapt on their policy pages (P3, landing.md LP-*); they may
contain `{{field}}` placeholders filled from the store's `policies` facts by P3's renderer; the editor shows them as
chips and refuses unknown field names (list exported by P3). Seed content: `src/lib/platform/data/legal/*.md`
(PD49, PLA-§Q.13), each flagged `needs_legal_review`; no invented company numbers, addresses or claims (owner rule 4).

Signup and staff invites ask for the published `tos`, `privacy` and `aup` versions in the user's locale, falling back
in the order locale → fr → en → ar; when none is published for a kind, that kind is not asked (signup never breaks,
PD17) and the console shows the red line "Sign-up runs without published <kind>".

### PLA-§13.5 Mail (R2, IN-08, S5)

`/admin/settings/mail`: SMTP host, port, user, password ("set / not set"), sender name and address, caps per minute /
hour (defaults 4 / 150, core §H.1), a "Send test e-mail to me" button, and the last 50 outbox `mail` rows (template,
state, attempts, last error; never bodies). Transport `nodemailer` (PD41) in `src/lib/mail/smtp.ts`.

### PLA-§13.6 Markdown-lite (`src/lib/platform/markdown-lite.ts`, pure)

Used by legal documents, notes and (R3) broadcasts. Allowed: paragraphs, `#`/`##`/`###` headings, `-` and `1.` lists,
`**bold**`, `*italic*`, inline code, links `[text](https://…)` (https only; rendered with `rel="noopener noreferrer
nofollow"` and `target="_blank"`), `{{field}}` placeholders (store templates only). Everything else is text: no raw
HTML, no images, no autolinks. `renderMarkdownLite(src, opts): ReactNode` returns React elements (no
`dangerouslySetInnerHTML`); `toPlainText(src)` for previews. Selftest: script and HTML payloads render as text.

Acceptance (PL-14): saving brand name "Store Gen" → "Souk Studio" changes the TOTP issuer for new enrolments only and
existing TOTP codes keep verifying (purpose strings frozen); publishing an unreviewed ToS requires both confirmations
and records the acknowledgement; a signup while no ToS is published succeeds and records acceptances only for the
published kinds.

---

## PLA-§14. Staff, 2FA and the security centre (SE-01, SE-04)

### PLA-§14.1 Staff (`/admin/security/staff`, `staff.manage` ↑)

Table: name, e-mail, role (super_admin, admin, support, analyst), 2FA (always on once active), last sign-in, added by
/ at, state (Active · Invited · Waiting for 2FA). Actions:
- **Invite staff**: e-mail, role (`admin`, `support`, `analyst`; `super_admin` only through a platform request, below),
  note → `inviteStaffAction` → `staff_invites` row (PLA-§Q.4: token 32 bytes, sha256 at rest, 72 h, single use, bound
  to the e-mail) → the link `https://<platform>/invite/staff/<token>` shown once with Copy and WhatsApp share; audit
  `platform.staff.invited`.
- **Change role** → `setStaffRoleAction({ userId, role, reason })`: any role change revokes the user's sessions (they
  sign in again, core §B.7 gate applies). Promotion **to super_admin** creates a `platform_requests` row of kind
  `staff_super_admin` (PD7): confirmed by a second super_admin, or executed after 24 h by the `platform.requests` job
  when only one super_admin exists; every super_admin is notified.
- **Remove** → role `none`, sessions revoked at once (`revokeUserSessions`); the user keeps their own stores.
- Invariant: at least one active super_admin with TOTP; the last one cannot be demoted or removed (refused
  `last_super_admin`).
Audit `platform.staff.changed` `{ userId, from, to, reason }`.

Acceptance flow for a staff invite (`/invite/staff/<token>`, console styling, P1): signed in with the bound e-mail →
"Join the Store Gen team as Support" → sets `platform_role`; no account → name + password form with the e-mail locked
(policy + scrypt semaphore), no store is created (PD13); wrong account → "This invitation is for s•••@gmail.com". Then
`/app/account/two-factor?for=console`: the console stays closed until TOTP is enrolled (core §B.7), so the role is
effectively inactive until then (state "Waiting for 2FA").

### PLA-§14.2 Step-up

`StepUpSheet` (P2 primitive): title "Confirm it's you", a single 6-digit input (`inputmode="numeric"`,
`autocomplete="one-time-code"`, paste-friendly), "Use a recovery code" link (switches to a 10-char input), errors
"That code didn't work" / "Too many tries, wait 15 minutes" (`p:mfa:stepup:<userId>` 5 / 15 min, core §B.7). On
success the topbar chip shows "Verified · 4:59" counting down (PLA-§Q.32) and the original action re-runs (§4.5).

### PLA-§14.3 Audit and break-glass (`/admin/security/audit`, `/admin/security/break-glass`, `audit.platform`)

- **Audit log**: `listPlatformAudit(ctx, filter)` with filters store, staff member, actor kind, action prefix
  (`platform.`, `store.`, `auth.`), date range; row: time, actor (name + platform role), action (human sentence, raw
  name in mono below), target (store or user link), meta (redacted), IP hash (8 chars). Export CSV
  (`/api/admin/audit.csv`, super_admin, ≤ 50,000 rows, redacted meta only; audit `platform.audit.exported`).
- **Break-glass log** (SE-04): the same view pre-filtered to `platform.pii.revealed`, `platform.impersonation.*`,
  `platform.store.purge_*`, `platform.kill.changed`, `platform.backup.downloaded`, `platform.user.2fa_reset`,
  `platform.user.reset_link`, `platform.order.lookup`, `store.export_*` with `actor_kind = 'platform'`, and
  `platform.staff.changed`. Weekly review: "Mark this week reviewed" writes `platform.breakglass.reviewed` `{ week }`;
  unreviewed weeks older than 14 days add a yellow Needs-attention row. Pending `platform_requests` (purge, super_admin)
  are listed on top with **Confirm** (a different staff member, ↑) and **Cancel** (requester or any super_admin).
- **Security settings** (read-only facts): console gate on, IP allowlist configured (yes / no, count), `ADMIN_HOST` set,
  staff with TOTP (all), sessions of staff in the last 24 h; action **Sign out all staff except me** (`staff.manage` ↑,
  audit `platform.staff.signed_out_all`).

Acceptance (SE-01, SE-04): a new staff member cannot open any `/admin` route before enrolling TOTP; the last
super_admin cannot be demoted; a super_admin promotion with two super_admins needs the other's confirmation; every row
of the break-glass view links to its target and its actor.

---

## PLA-§15. System health (`/admin/health`, OS-09; data by P8)

### PLA-§15.1 Panels

Data from `getHealth(ctx)` (`src/lib/platform/health.ts`, P8, core §H.5) plus the fields of PLA-§Q.25. Each panel
refreshes every 30 s while visible and fails on its own.

| Panel | Content | Red when |
|---|---|---|
| Cron | last tick (time, duration, ok), a 50-tick strip (ok / failed / missing gaps), per job: last run, ms vs budget, processed, error code | no `job_runs` row for 10 min |
| Queues | outbox by kind × state with the oldest pending per kind; dead items (store, kind, topic, attempts, last error) with **Replay** (`stores.lifecycle`, P8 `replay(ctx, id)`); render queue depth, failed renders; export jobs; purge jobs; backups running | any `dead` > 0 (yellow), dead older than 24 h (red) |
| Sheets | backlog per store (top 10 by oldest pending), last push / pull per store, the service-account token health | a store backlog > 15 min |
| Storage | DB used vs quota with 70 / 85 % marks, the top 15 tables by size, the top 15 stores by `store_usage` media + page bytes, `DATA_DIR` bytes / free / files vs the 300,000-inode warning, media backend (`fs` / `db`), reclaimable `media_chunks` bytes with the hPanel `OPTIMIZE TABLE` guidance (core §G.3), a trend "85 % reached in ~41 days" when ≥ 7 daily points exist | DB ≥ 85 %, free disk < 2 GiB, backend `db` while `DATA_DIR` is set |
| Errors | last 24 h by `area / code / route` with count, stores affected, first / last seen; a code row expands to its redacted samples | > 50 of one code in an hour |
| Runtime | build id, build time, Node version, memory (rss, heap used / total), uptime, boot warnings (config, data dir, env aliases) | a boot warning of level error |
| Edge | S mode on / off, Worker version last seen (`x-sg-worker`), last edge-verified request, requests still using `EDGE_KEY_PREV` in 24 h, foreign-host count | prev-key use 24 h after a rotation |
| Commerce heartbeat | the last order platform-wide and orders per hour for 24 h (`orders_created_idx`) | §5.3 rule |

### PLA-§15.2 Alarms

Job `platform.alarms` (every tick, ≤ 1 s): evaluates `getHealth()`'s cheap subset and the rules above; a newly red
alarm sends `staff.alarm` (`vars: { alarm, value }`, dedupe `alarm:<code>:<YYYY-MM-DDTHH>`) to `platform_staff` with
`minRole: "admin"` and appears in Needs attention; a recovered alarm sends nothing (the panel shows "Recovered 14:20").

Acceptance (OS-09): stopping the cron for 11 minutes (fake clock in `platform-check.ts`) turns the Cron panel red and
produces exactly one staff notification per hour; replaying a dead outbox row moves it to `pending` and writes an
audit row; the page renders without `getHealth()`'s storage snapshot (shows "Snapshot not taken yet").

---

## PLA-§16. Domains view (`/admin/domains`, OS-06, core §C.10)

### PLA-§16.1 Status card

Address mode (P only / S on), `PLATFORM_URL` host, `STORE_ROOT_DOMAIN`, `LEGACY_PLATFORM_HOSTS`, `BEHIND_CLOUDFLARE`,
`TRUSTED_PROXY_HOPS` (non-secret values shown), `EDGE_KEY` and `EDGE_KEY_PREV` (set / not set only), the current
signup-mode default this implies (D9), the Worker version last seen.

### PLA-§16.2 Re-render progress

`render_jobs` with reason `address`: pending / running / done / failed totals and per store (the 20 with the most
failures), an ETA from the last hour's throughput, **Retry failed** and **Re-render all live pages** (`domains.manage`
↑; P8 `enqueueRenders` per store through a fan-out job so the request returns at once; audit
`platform.domains.rerender`).

### PLA-§16.3 Domain-move checklist (state in `platform.domainMove`)

Owner steps from RESEARCH §5.2 and app steps from core §C.10, each with "Mark done" (records date and staff):
buy the domain · Cloudflare zone · apex A record checked in hPanel · proxied `*` record · nameservers switched ·
Hostinger CDN off · TLS route (Full strict) · www Redirect Rule · `/media/*` Cache Rule · Worker deployed with its
secret and the `*.<domain>/*` route · env full replace + rebuild (core §H.7, 19 keys) · re-render all live pages ·
legacy 308s on · cron URL updated · Meta / TikTok domains · Turnstile hostnames · Sheets links.
Verification V1 … V11 (RESEARCH §5.3), each with a note and "Passed": the server-runnable ones have a **Run** button
that calls `runDomainCheck(id)` (`src/lib/platform/domain-move.ts`): V3 (`HEAD https://probe.<root>/` expects the
neutral 404 with `x-sg-mode: subdomain`), V7 (a 308 with the byte-identical query from the legacy host), V8 (the
certificate subject covers `*.<root>`, via `tls.connect` with SNI), V10 (Turnstile verify on a subdomain, needs a token
from the test widget); the others are manual (V1 `npm run test:hosts`, V2, V4, V5, V6, V9, V11 scripts) and take a
note. When every V check has passed, a banner offers "Switch sign-up to approval" (the D9 default flips by itself once
both env vars are set; this button only clears an explicit override).

### PLA-§16.4 R2 (OS-12, OS-13, S6)

Edge cache tile (purge requests sent / failed in 24 h, the last purge error), Worker alerts (5xx rate from the Worker
analytics the owner pastes or the alert e-mails, **[unverified]** which Cloudflare data is reachable without an API
token).

### PLA-§16.5 R3 (OS-14 … OS-18, D1)

Custom domains table (`store_domains`: host, store, status, primary, verified, last check, DNS lost since) with
approvals arriving as queue requests of kind `domain`, plus the Cloudflare custom-hostname state per row.

Acceptance (OS-06): the checklist state survives a restart and a deploy; "Run" for V3 on the temporary domain answers
"S mode is off" without a network call; no secret value ever appears in the page.

---

## PLA-§17. Backups (`/admin/settings/backups`, OS-10, core §H.6)

- Table of `backup_runs` (P8): day, kind (daily / weekly), state, size, tables, duration, error. Retention (the
  `platform_backup` setting): daily 3-30 (default 7), weekly 1-12 (default 4).
- **Download** (`backups.manage` ↑, reason): `GET /api/admin/backups/<day>` streams a ZIP (fflate, installed,
  `package.json:55`, stored not deflated: the parts are already gzip + sealed) of the day's encrypted parts and
  `manifest.json` plus a `README.txt` explaining that APP_SECRET is needed to read it; through P8's
  `backupFiles(day)` (PLA-§Q.25); audit `platform.backup.downloaded`; updates `platform.backup.lastDownloadAt`.
- Reminder: when the last download is older than `remindAfterDays` (default 7), a yellow Needs-attention row
  "Download an off-site copy of your backups".
- Restore: a link to the documented manual procedure (HANDOFF, R1); the restore drill page is R3 (OS-18).

Acceptance (OS-10): the downloaded ZIP's manifest checksums match the files; a download without a fresh step-up
answers `step_up`; the list shows a failed run with its error code.

---

## PLA-§18. Notifications (PL-13; API by P1, tenant UI by P2 in §22.6)

### PLA-§18.1 API (`src/lib/platform/notify.ts`, server-only; replaces T2's minimal R1.0 insert, PLA-§Q.15)

```ts
export type NotifyTarget =
  | { audience: "user"; userId: string; storeId?: string | null }          // one person (in one store, or platform-wide)
  | { audience: "store"; storeId: string }                                  // every active member of the store
  | { audience: "store_role"; storeId: string; roles: readonly StoreRole[] }
  | { audience: "platform_staff"; minRole?: PlatformRole };                 // staff feed (rank super_admin > admin > support > analyst)
export interface NotifyOpts { link?: string; severity?: "info" | "success" | "warn" | "danger"; dedupeKey?: string; text?: string /* staff free text only, ≤ 600 */; expiresInDays?: number; batch?: { windowMin: number } }
export function notify<K extends NotificationKind>(target: NotifyTarget, kind: K, vars: NotificationVars<K>, opts?: NotifyOpts): Promise<{ id: number } | { deduped: true }>;   // never throws (logs to error_events)
export interface Reader { userId: string; storeId: string | null; role: StoreRole | null; platformRole: PlatformRole | "none" }
export function listNotifications(reader: Reader, opts: { beforeId?: number; limit?: number; group?: NotificationGroup; unreadOnly?: boolean }): Promise<NotificationItem[]>;
export function unreadCount(reader: Reader): Promise<number>;     // cached 5 s per (user, store)
export function markRead(reader: Reader, ids: readonly number[] | "all"): Promise<void>;
export interface NotificationItem { id: number; kind: NotificationKind; group: NotificationGroup; severity: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean }   // title/body rendered in the reader's locale
```

- **Kind registry** (`src/lib/platform/notify-kinds.ts` + extension files `src/lib/notify/kinds/<track>.ts`,
  PLA-§Q.15): `{ kind, group, defaultSeverity, audienceHint, vars: z.ZodType, link?: (vars, ctx) => string,
  tenant: boolean }`. Titles and bodies are message keys `notify.<kind>.title` / `.body` with `{var}` placeholders;
  tenant-facing kinds must exist in ar, fr and en (`test:i18n-coverage`), staff kinds in en.
- **Rendering at read time** in the reader's locale (`users.locale`, PD11); `vars` hold ids, counts, codes and short
  labels only, never customer data; `text` is staff free text and is shown as plain text.
- **Batching**: kinds with `batch` (e.g. P4's `order.new_batch`) use `dedupeKey = <kind>:<storeId>:<window start>` and
  `INSERT … ON DUPLICATE KEY UPDATE vars = JSON_SET(vars, '$.count', JSON_EXTRACT(vars, '$.count') + 1)` so one row
  reads "12 new orders since 14:02".
- **Reads**: a member reads rows with (`store_id = ?` and audience `store`, or `store_role` whose `roles` contains the
  member's role, filtered in code after an over-fetch of 2 × limit) plus (`audience = 'user'` and `user_id = ?` and
  `store_id` NULL or this store); staff read `platform_staff` rows whose `minRole` rank ≤ theirs (`nt_aud_idx`).
  `notification_reads` marks reads; "Mark all read" inserts one read row per unread id shown (≤ 200).
- Retention 90 days (core §H.11); expired rows (`expires_at`) are hidden at read time.

### PLA-§18.2 Kinds owned by this part

| Kind | Group | Audience | Vars | Link |
|---|---|---|---|---|
| `signup.received` | store | store_role owner | — | `/app/<h>` |
| `signup.info_requested` | store | store_role owner | text = the staff question | `/app/<h>` |
| `signup.approved` | store | store | — | `/app/<h>/pages` |
| `signup.rejected` | store | store_role owner | `{ reason }` | `/app/<h>` |
| `store.restricted` · `store.suspended` · `store.restored` · `store.closed` · `store.reopened` · `store.deletion_scheduled` · `store.deletion_cancelled` | store | store_role owner, admin | `{ reason, date? }` (+ text when the staff note is shown) | `/app/<h>` |
| `store.impersonation_started` · `store.impersonation_ended` | security | store_role owner, admin | `{ reason, from, to }` | `/app/<h>/settings/audit` |
| `store.export_by_platform` | security | store_role owner | `{ reason }` | `/app/<h>/settings/danger` |
| `request.answered` | plan | store_role owner | `{ requestKind, outcome }` | `/app/<h>/settings/plan` |
| `plan.changed` · `plan.boost_granted` · `plan.boost_ending` | plan | store_role owner, admin | `{ plan? , key?, until? }` | `/app/<h>/settings/plan` |
| `quota.80` · `quota.100` | plan | store_role owner, admin | `{ metric, used, limit }` | `/app/<h>/settings/plan` |
| `member.joined` | team | store_role owner, admin | `{ name, role }` | `/app/<h>/team` |
| `invite.accepted` | team | user (the inviter) | `{ name, role }` | `/app/<h>/team` |
| `member.role_changed` · `member.suspended` | team | user (the member) | `{ role }` | `/app/<h>` |
| `security.2fa_required` | security | store | — | `/app/account/two-factor` |
| `user.2fa_reset` · `user.password_reset` | security | user (platform-wide) | — | `/app/account/security` |
| `legal.updated` | platform | user (platform-wide, lazily per acceptance check) | `{ kind, version }` | the document |
| `staff.message` | support | store_role owner, admin (or one user) | text | optional link |
| `staff.signup_new` (batched hourly) · `staff.signup_hold` · `staff.info_answered` · `staff.appeal` · `staff.request` | staff | platform_staff admin | `{ count? , store }` | `/admin/queue?r=…` |
| `staff.purge_requested` · `staff.purge_confirmed` · `staff.super_admin_requested` | staff | platform_staff super_admin | `{ store? , by }` | `/admin/security/break-glass` |
| `staff.alarm` · `staff.kill_changed` | staff | platform_staff admin | `{ alarm }` / `{ key, to }` | `/admin/health`, `/admin/flags` |
| `staff.mention` | staff | user (the mentioned staff) | `{ store, by }` | the note |

Kinds of other tracks (P4 orders and callbacks, P5 Sheets / CAPI / Telegram failures, P7 AI cap and auth, P8 export
ready and backups) live in their own extension files.

Acceptance (PL-13): a kind without an ar, fr or en title fails `npm test`; an agent never sees a `store_role` row
addressed to owners; a batched kind creates one row per window with the right count under 50 parallel inserts (DB
test); reading 50 notifications costs two queries.

---

## PLA-§19. Announcements and in-app messages

### PLA-§19.1 R1: messages to stores

"Message" on the store profile (one store, `notify.stores`; support may message only one store at a time) and on the
stores list bulk bar (admin+, ≤ 50 stores): plain text ≤ 600 chars, optional link (an `/app/<h>/…` path or an https URL
shown as text), audience owners only / owners + admins, severity info or warn, preview as the store will see it. Sends
`staff.message` with `text`; audit `platform.store.messaged` `{ count }` (one row per store). A staff message is never
an e-mail in R1. Maintenance notices in R1 are the kill-switch banners (§12.1).

### PLA-§19.2 R3: broadcasts and the changelog (PL-17, D5)

`/admin/broadcasts`: list (title, kind, placement, audience summary, window, status, seen / clicked / dismissed counts).
Composer: kind (`announcement`, `changelog`, `maintenance`, `message`), placement (`bell`, `banner`, `drawer`), title,
body and CTA **in ar, fr and en** (all three required for tenant placements; markdown-lite §13.6), audience, window,
dismissible, preview as a chosen store (the banner and bell components with that store's locale and mode).

```ts
export interface BroadcastAudience { plans?: string[]; modes?: StoreMode[]; markets?: string[]; statuses?: StoreStatus[]; storeIds?: string[]; roles?: StoreRole[] }
export function activeBroadcasts(reader: Reader, store: StoreRow | null): Promise<BroadcastItem[]>;   // live rows cached 60 s, audience filtered in code (lazy fan-out)
```

Stats count `broadcast_reads` rows only (no per-user tracking beyond read state). The `platform.broadcasts` job moves
`scheduled` → `live` → `ended` each tick. The "What's new" drawer lists `changelog` items with an optional image that
is an asset of internal store #1, served by the console media route.

---

## PLA-§20. Support

### PLA-§20.1 R1: the Help sheet (PD22, P2)

Tenant topbar **Help** (and ⌘K "Help") opens a sheet: a short list of in-product tips per screen (copy keys, no
external docs yet), **Message Store Gen on WhatsApp** (`https://wa.me/<supportWhatsapp digits>?text=` +
`shell.help.wa_prefill` = "Hello Store Gen support, store @{handle}, screen {path}, version {build}."), the support
hours as typed, and **Copy diagnostic info** (handle, path, build id, `describeUserAgent` label, the last 5 client
error codes from the in-memory ring `src/components/admin/shell/client-errors.ts`; never customer data, never tokens).
When `supportWhatsapp` is unset the button is replaced by "Support contact isn't set up yet".

### PLA-§20.2 R3: tickets inbox (PL-16, D5)

Tenant "Contact support" form (subject, kind, message ≤ 4,000, up to 3 screenshots ≤ 5 MB in total stored as assets of
the store with `asset_refs.owner_kind = 'ticket'`), auto-context (the §20.1 diagnostic block). Console `/admin/inbox`:
views Mine · Unassigned · Waiting > 24 h · Appeals · Abuse; ticket detail with the thread, internal notes, macros
(`support_macros`, ar/fr/en), assignee, status, priority, SLA due (urgent 2 h, high 8 h, normal 24 h, low 72 h
**[to tune]**), the context panel, "View as store" pre-filled with the ticket as reason and reference. Seller replies
arrive as notifications (`support.reply`). CSAT is PL-25 (later).

---

## PLA-§21. Platform analytics (PL-19, R3; privacy rules from R1)

R1 ships only the overview figures (§5) and records milestones (PD40). R3 `/admin/analytics` (`analytics.read`),
reading `store_daily_rollup` (nightly, 0007) and `store_health.milestones`:
- **Growth**: sign-ups per day, approval rate, median time to decision, activation funnel (sign-up → first draft →
  first publish → first order → first delivered → 10th order) by weekly cohort, weekly active stores, closed and
  dormant stores.
- **Commerce**: orders placed, **placed**, **confirmed** and **delivered** sales as three separate series, each labelled
  ("placed is not revenue"), confirmation and delivery rates with `n`, average order, share of high-risk orders, by
  market and city region.
- **Product**: mode mix, Sheets and pixels connected, AI generations and accept vs regenerate (from P7 data).
Privacy: any cell, bar or series computed from fewer than `k` stores (platform setting, ≥ 5) is suppressed for every
role except super_admin, and for analysts everywhere (PD15); no store names appear in analytics; customer data never
enters rollups (counts and sums only). Charts follow the dataviz rules of design.md (neutral series, jade "ours",
crimson loss, no dual axes, tables under 5 points).

---

## PLA-§22. Tenant-side SaaS UX (P2; UX-01, UX-02 tenant, TN-05 … TN-13, PL-02, PL-09 … PL-13 tenant side)

Everything in this section is tenant-facing and ships in **ar, fr and en in R1** (PD9) with `dir="rtl"` for ar,
logical CSS properties only, phones and ids in `<bdi dir="ltr">`, Latin digits, and the 360 px layout. Copy keys are
listed in PLA-§N. Visual depth (tokens, motion, type scale, empty-state art) is design.md's (DES-§14, DES-§16); this
section fixes structure, states, data and actions.

### PLA-§22.1 Public auth pages (TN-05; functional in R1.0 by T2, polished in R1 by P2, PLA-§Q.12)

Shared layout `src/app/(public)/_components/auth-shell.tsx`: ≥ 1024 px a two-column split (form column 440 px, the
start side in RTL-aware order; a quiet brand panel with the platform wordmark and three value lines, no fake numbers,
no stock imagery, no gradient wash); below 1024 px one column with the wordmark on top. A language switcher (ar · fr ·
en) top-end writes the cookie `sg-locale` (1 year, `SameSite=Lax`, not HttpOnly: a display preference) and, after
sign-in, `users.locale`. Every form: label above the input, no placeholder-as-label, errors under the field and in an
`aria-live` region, the submit button keeps its width while busy (spinner inside), Enter submits.

- **`/login`**: e-mail, password (Show toggle), Sign in. States: *challenge* (the server answered `{ challenge: true }`:
  the Turnstile widget appears above the button with `auth.login.challenge`); *generic failure* `auth.login.failed`
  ("E-mail or password is incorrect"); *rate limited* `auth.login.too_many` (this network only, core §B.3); *busy*
  `auth.busy` (503 from the scrypt semaphore: "The server is busy. Try again in a few seconds."); *banned* = the same
  generic failure. Links: "Create an account" (hidden when the mode is `closed`), "Forgot password?" → R1 a sheet
  `auth.forgot.r1` ("Ask your store owner or Store Gen support for a reset link") with the support WhatsApp button;
  R2 the self-service form (IN-08).
- **`/login/verify`**: one 6-digit input (`autocomplete="one-time-code"`), "Use a recovery code", "Back to sign in".
  Errors `auth.verify.failed`, `auth.verify.too_many`.
- **`/signup`** (mode behaviour §3.1), two steps on one page with a two-segment progress bar (no "Step 1/2" label):
  1. *Account*: name; e-mail; password with live policy checks (`checkPasswordPolicy` rules as ticks); phone (country
     select defaulting to the allowed market, national input formatted as typed by `libphonenumber-js`
     `AsYouType`, stored E.164); invite code first when the mode is `invite` (checked only on submit, never live: no
     oracle).
  2. *Your store*: store name; handle (suggested from the name, `slugify` + `isHandle`, live availability via
     `/api/auth/handle?h=` debounced 250 ms, core §C.7, showing "Available" or "Not available" only; under it the
     address preview `<platform host>/s/<handle>` in P mode or `<handle>.<root>` in S mode); mode cards (PD30:
     **Landing pages** selectable and preselected; **Full store** and **Both** marked "Coming soon" with the checkbox
     "Tell me when it's ready" that sets `modeInterest`); market (a fixed chip "Morocco · MAD" while only MA is
     allowed, a select otherwise); the legal checkbox with links that open the published documents in a sheet
     (§13.4); Turnstile when configured; **Create my store**.
  The client measures `formMs` (time with focus inside the form across both steps) and posts it in a hidden field;
  the server clamps it to 0 … 30 min. Waitlist mode: e-mail, phone, "What do you sell?" (optional) → "You're on the
  list" state. Closed: `auth.signup.closed` + the support WhatsApp button when set. Duplicate e-mail or handle: the
  generic sentence of core §B.2 step 6.
- **`/reset/<token>`**: new password + confirm with the policy ticks → "Password changed. Sign in again." Invalid,
  used or expired token: `auth.reset.invalid` (one generic state).

#### PLA-§22.1.4 Store invite acceptance (`/invite/<token>`, TN-06)

A centred card: store logo or `Monogram`, store name, "<Inviter first name> invited you to join as **Agent**" with the
role's one-line explainer (§22.4.4), the masked e-mail the invitation is bound to. States (from `previewInvite`, core
§B.5):
| Situation | UI | Action |
|---|---|---|
| signed in, e-mail matches | "Join <store>" | `acceptInviteAction({ token })` → `/app/<h>` + toast `team.joined` |
| signed in, other e-mail | "This invitation is for s•••@gmail.com" | Sign out and continue |
| no session, no account | sign-up form with the e-mail locked (name, password, phone optional) + legal checkbox | `acceptInviteAction({ token, account })` |
| no session, account exists | "Sign in to accept" (e-mail prefilled) → back here | — |
| expired, used, revoked, unknown | `team.invite.invalid` ("This invitation link is no longer valid. Ask for a new one.") | — |
| members limit reached at acceptance | `team.invite.full` | — |

`Referrer-Policy: no-referrer`, `noindex` (core §B.1). Buckets `p:invite:accept:ip` (core §E.8).

### PLA-§22.2 Onboarding wow flow (UX-01, PD4, PD23, PD48)

Route `/app/<h>/welcome` (`src/app/app/[store]/welcome/**`, PLA-§Q.12), full screen (no sidebar), owner only (others
are redirected to the dashboard). `/app/<h>` redirects here while `onboarding.step ∉ {done, skipped}` and the viewer is
an owner. `/app/new` (another store) is the store step of `/signup` on its own, then the same route.

| Step | Screen | Data and calls | Budget |
|---|---|---|---|
| `photos` | A large drop zone "Drop 1 to 5 product photos" (click to pick, camera capture on phones), thumbnails appear as each upload finishes, "Start without photos" link | uploads through `POST /api/app/<h>/media` (pending cap 100 MiB); palette extracted in the browser; background cutout queued by the existing pipeline | 3 × 600 KB ≤ 8 s on 4G |
| `details` (shown while analysis runs) | category chips with the suggested one highlighted (a tap is required, PD23), product name with "Use suggestion" (never auto-filled), **price** (required, numeric keypad, currency suffix), compare-at price (optional, hint `onboarding.compare_hint` "Only a price you really sold at before"), one optional fact | P7 `useAiTask("analyze", …)` (AI-04: ≤ 2 downsized images to the server when cloud AI is on, else local or library); suggested facts are unticked chips | analysis never blocks typing |
| `reveal` | Full-bleed preview of the generated page with 3 directions (arrow keys, swipe, dots with labels), each with its DNA card; "Use this design", "Show 3 more" | P6's reveal component and generator (design.md DES-§14.3); the preview is a sandboxed iframe of the draft render | ≤ 2.5 s after analysis ends (design.md UX-01) |
| `contact` | "Where should customers reach you?": WhatsApp number (toggle "Use my phone +212 6•• ••• •34"), delivery fee left empty with `onboarding.fee_note` ("Add delivery fees in Checkout & delivery when you know them") | `updateStoreSetting(scope, "store", { whatsapp })` | — |
| `done` | the dashboard with the In-review card (§22.7) and the checklist | — | — |

Server actions (`src/app/app/[store]/welcome/actions.ts`, all `storeAction`):

| Action | Permission | Effect |
|---|---|---|
| `saveOnboardingDetailsAction({ category, productName, priceMinor, compareAtMinor?, fact?, assetIds })` | `pages.write` | writes `onboarding.draft` (schema below), `stores.category` |
| `useDirectionAction({ directionKey })` | `pages.write` + `ai.use` | calls the existing create-from-directions path (GEN-02, `CreateFromDirectionsInput`, store-free input) with the typed price; `onboarding.pageId`, step `contact` |
| `reportRevealAction({ paintedAt })` | `store.read` | sets `revealedAt` (clamped to server now) and `revealMs = revealedAt − stores.created_at` once |
| `saveOnboardingContactAction({ whatsapp \| useSignupPhone })` | `settings.write` | store contacts; step `done`, `completedAt` |
| `skipOnboardingAction()` | `store.read` | step `skipped` (the checklist keeps "Finish your first page") |

The `onboarding` store setting (PLA-§2.4, PLA-§Q.7) keeps `step` and `draft`, so a closed tab resumes on the same step
with the same photos and the typed price.

Honesty (PD23, owner rule 4): the page is generated only after a price is typed; compare-at appears only when typed and
higher than the price; no stock, rating, review, "sold" counter or countdown is ever generated here; AI suggestions
need a tap. The reveal ends with "Your page is saved as a draft. Publishing unlocks after approval." and the actions
"Submit for review" (§22.7) and "Open in the builder".

Acceptance (UX-01): with 3 photos on a mid laptop (4× CPU throttle, Cloud AI off, empty model cache) the reveal paints
≤ 90 s after the signup click (Playwright, `revealMs` asserted) and ≤ 15 s after "Start without photos"; no price
appears that the owner did not type (state test); 360 px and ar RTL screenshots pass the design checklist; reloading
on any step resumes there; the flow works for a pending store and never calls publish.

### PLA-§22.3 Store picker and switcher (TN-07)

- **`/app`** (`src/app/app/page.tsx`): with 2+ usable memberships a grid of store cards (logo or `Monogram`, name,
  `@handle`, mode badge, `StatusPill`, the viewer's role), sorted by last used (`sessions.last_store_id` first, then
  `store_members.last_active_at`), a "Create a store" card (hidden when `p:store:create:<userId>` is exhausted, with
  `shell.picker.create_limit`), and "Platform console" for staff. Keyboard: arrows move, Enter opens, `/` filters when
  there are more than 6 stores. 0 usable → `/app/new`; 1 → `/app/<h>` (core `landingPathFor`).
- **Switcher** (sidebar header, replaces the brand block, `src/components/admin/shell/app-sidebar.tsx:118-129`): the
  current store (logo, name, mode badge, status pill) opens a popover with the same items, a search field above 5
  stores, "Create a store", "Platform console" (staff). Choosing a store navigates to `/app/<h>` and
  `setLastStoreAction(storeId)` (`userAction`) writes `sessions.last_store_id`. ⌘K "Switch to …" and `G W` open it.
- **Client state on switch and sign-out** (core §B.4): `clearStoreClientState(prevStoreId, userId)` in
  `src/components/admin/shell/client-state.ts` removes `bld:unsaved:<userId>:<storeId>:*`, `sg:gen:<storeId>:v2`, the
  focal cache and the shared pollers, and cancels running AI jobs (P7's cancel hook).
- **Monogram**: two initials of the store name on a tinted disc; the hue is the brand accent when set, else derived
  from `stores.brand_seed` and folded out of 25-75° by `foldAllowedHue()` (`src/lib/admin-theme/monogram.ts`); the tint
  mix is registered with the blend guard (`src/lib/theme/blend.ts`).

### PLA-§22.4 Team and invites (`/app/<h>/team`, TN-06, TN-08, TN-12)

Tabs **Members**, **Invites**, **Agents** (the Agents tab renders P4's agent-profile component).

- **Members** table: initials avatar, name, e-mail, role (an inline select when `canManageMember(viewer, target)`),
  status, 2FA chip, last active, joined, "You" badge. Row menu: Change role, Suspend / Reactivate, Remove (typed
  confirmation of the member's name). The last owner's row has no destructive item (tooltip `team.last_owner`). Seats
  meter `members_max` (and `agents_max` on the Agents tab) via `UsageMeter`.
- **Invite** dialog: e-mail, role (only `invitableRoles(viewer.role)`, each with its explainer), note (≤ 200).
  `createInviteAction` → the **result sheet**: the link (shown once) with Copy, **Share on WhatsApp**
  (`https://wa.me/?text=` + `team.invite.wa_text`), a QR code (PD47), "Expires on <date>", and the line "Anyone with
  this link can join only with s•••@gmail.com". Pending store: at most 2 members (state cap) with
  `team.pending_cap`; at the limit the limit sheet opens (§22.9).
- **Invites** tab: masked e-mail, role, invited by, expires, state (Pending · Accepted · Expired · Revoked), Revoke.

Actions (`src/app/app/[store]/team/actions.ts`; functions of core §B.5 and PLA-§Q.19):

| Action | Permission | Rate |
|---|---|---|
| `createInviteAction({ email, role, note? })` | `members.invite` (+ `invites` feature) | `s:<sid>:invite` 20/day |
| `revokeInviteAction({ inviteId })` | `members.invite` | — |
| `changeMemberRoleAction({ userId, role })` | `members.manage` (rank rule) | — |
| `setMemberStatusAction({ userId, status })` | `members.manage` | — |
| `removeMemberAction({ userId })` | `members.manage` | — |
| `leaveStoreAction()` | `store.read` (refused for the last owner) | — |

#### PLA-§22.4.4 Role explainer (TN-08)

`roleSummary(role): { line: MessageKey; can: MessageKey[]; cannot: MessageKey[] }` (`src/components/admin/common/role-explainer.tsx`,
derived from `STORE_PERMISSIONS` groups so it never drifts from the matrix): one line per role (owner "Everything,
including plan, closing the store and security"; admin "Runs the store except plan, closing and security"; manager
"Leads the call center: assigns orders, sees every agent"; editor "Builds pages and media"; agent "Confirms the orders
in their own queue"; viewer "Sees pages and media, no customer data"; logistics and accountant in R2) and up to 4 "Can"
/ 3 "Can't" bullets. Roles appear only when in `ACTIVE_STORE_ROLES` (TN-12).

### PLA-§22.5 Account pages (`/app/account/**`, PLA-§Q.12)

- **Profile**: name, e-mail (read-only in R1), phone, interface language (ar / fr / en; the dashboard is complete in en
  in R1 and the language applies to the surfaces of PD9) → `updateProfileAction` (`userAction`).
- **Security**: password change (current + new, policy ticks, scrypt semaphore), devices (`describeUserAgent`, created,
  last seen, "This device"), Revoke, Sign out other devices → `changePasswordAction`, `revokeSessionAction`,
  `signOutOthersAction` (`userAction`). `/app/account/sessions` redirects here.
- **Two-factor**: the existing enrolment, QR, recovery codes and disable flows moved from `src/app/admin/(auth)/two-factor`;
  with `?for=console` a teal banner "Store Gen staff must use two-step codes before opening the console".
- **My stores**: memberships with role and status, "Leave" (not for the last owner).

### PLA-§22.6 Notification centre (PL-13 tenant side)

- **Bell** in the topbar with the unread count (`9+` above nine), from the pulse. The panel (380 px popover, a full
  sheet below 768 px): rows grouped by day, each with the group icon, title, body (one line, ellipsis), relative time,
  a 3 px accent bar at the inline start while unread (functional, not decorative), click → link + mark read; "Mark all
  read"; "All notifications" → `/app/<h>/notifications` (filters by group: Orders · Team · Store · Plan · Integrations
  · Security · Platform; keyset paging). Empty: `shell.notifications.empty` ("Nothing new. Orders, team changes and
  review updates appear here.").
- **Pulse** `GET /api/app/<h>/pulse` (`src/app/api/app/[store]/pulse/route.ts`, `storeGuard(req, h, "store.read")`,
  PLA-§Q.14), every 15 s while visible, one poller per browser and store (`BroadcastChannel("sg-pulse:<storeId>")`),
  `ETag` → `304` (PD38), cached 5 s per store with the per-user parts computed fresh, bucket `s:<sid>:pulse:<userId>`
  12/min (core §E.8):

```ts
export interface StorePulse {
  v: 1; at: string; build: string;
  unread: number;
  store: { status: StoreStatus; statusReason: string | null; review: "none" | "pending" | "submitted" | "needs_info" | "approved" | "rejected" };
  kill: KillKey[];                          // active kill switches that affect tenants
  impersonation: { endsAt: string } | null; // the viewer's own impersonation of this store
  reaccept: boolean;                        // legal re-acceptance pending for the viewer
  counts: Record<string, number>;           // contributed by tracks (P4: newOrders, dueCallbacks; P5: syncFailed)
}
```

A change of `store.status` or `review` triggers `router.refresh()` so locked controls unlock without a reload
(PL-02 acceptance); a change of `build` shows "New version available · Reload".

#### PLA-§22.6.4 Realtime (UX-06, R2, S6)

Arrivals slide in once, numbers roll once, the "live" dot shows "live · 12 s ago" only while the last poll succeeded
less than 30 s ago (design.md UX-06 row).

### PLA-§22.7 Pending state: the In-review card (PL-02)

On the dashboard of a `pending` store (and in a compact form on Pages and Generate):
- **Before submitting**: title `shell.review.title` ("Your store is in review"), "Works now": build pages, preview,
  upload up to 100 MB, invite one teammate; "Unlocks after approval": publishing, orders, Sheets, pixels, Telegram, PHP
  export, address change. Primary **Submit for review** → a sheet with optional business context (what you sell ≤ 200;
  a social or shop link ≤ 200, kept as plain text; a WhatsApp number prefilled from the signup phone) →
  `submitForReviewAction` (owner; `store.read`; writes only `signup_reviews.business_context` and `submitted_at`) →
  staff notification `staff.signup_new`. Secondary **Share a private preview** → a 72 h `/preview/<token>` link
  (PLA-§Q.6) with Copy and WhatsApp share.
- **Submitted**: "Submitted. We'll tell you here when it's done." plus "Usually within {hours} hours" only when
  `signup.slaHours` is set (no invented promise).
- **Needs info**: the staff question as a quote, an answer box (≤ 500) → `answerReviewQuestionAction` (owner) →
  `answered_at`, status back to `pending`, `staff.info_answered`.
- **Approved**: the card turns into "You're approved" with a quiet 240 ms ease-out reveal (no confetti) and **Publish
  your page**; dismissible; the pulse already unlocked the controls.
- **Rejected**: the full-page state of §22.8.

### PLA-§22.8 Lifecycle banners, locked controls and state pages (TN-02)

`<StoreBanner>` (`src/components/admin/shell/store-banner.tsx`) shows **one** banner at a time (a "1 more" chevron
reveals the next) in this priority: suspended > closed > restricted > pending > platform read-only > another kill
switch > require-2FA > quota ≥ 80 % (legal re-acceptance is a blocking sheet, §22.15; impersonation is the ribbon,
§10.2). Informational banners are dismissible for 24 h (localStorage, per viewer); state banners are not.

| State / cause | Banner or page | Copy key |
|---|---|---|
| `pending` | info banner + the review card | `shell.banner.pending` |
| `restricted` | warning: "Orders are paused: <reason>. Your pages stay online." + "Ask for a review" (`go_live` request) | `shell.banner.restricted` |
| `suspended` | danger: "Your store is suspended: <reason>. You can read and export your data." + support WhatsApp | `shell.banner.suspended` |
| `closed` (owner/admin) | read-only + "Closed on <date>. You can reopen it until <date>." + Reopen | `shell.banner.closed` |
| `closed` (others) | page "This store is closed" | `shell.page.closed` |
| `scheduled_deletion` | page "Scheduled for deletion on <date>" + support WhatsApp | `shell.page.deletion` |
| `rejected` | page "Your application wasn't approved" + the reason sentence + one appeal form (≤ 500 chars) → `submitAppealAction` (§3.5), then "Your appeal was sent" | `shell.page.rejected`, `shell.rejected.<reason>` |
| kill switch | info: "<What> is paused for maintenance. Orders keep working." | `shell.kill.<key>` |
| `platform_read_only` | warning: "Store Gen is in maintenance: dashboards are read-only. Orders keep coming in." | `shell.kill.platform_read_only` |
| `require_member_2fa` | the enrolment redirect (core §B.7); a banner for owners listing members without 2FA | `shell.banner.require_2fa` |
| quota ≥ 80 % | info: "Media storage is 84 % full" + See plan | `shell.banner.quota` |

**Error codes → UI** (one component each, never raw text):

| Code | UI |
|---|---|
| `not_found` | pages: the store's neutral 404 inside the shell ("This page doesn't exist or was removed"); actions: toast `shell.err.not_found` |
| `forbidden` | toast `shell.err.forbidden` ("Your role can't do this. Ask an owner or admin.") |
| `read_only` | toast with the state's sentence (`shell.err.read_only.<status>` or the read-only kill switch) |
| `impersonation_read_only` | toast `shell.impersonation.write_refused` |
| `quota` | the limit sheet (§22.9), quota variant |
| `feature_off` | the limit sheet, feature variant with the reason (plan · state · release · kill) |
| `step_up` | the step-up sheet (tenants with TOTP, for `store.close` and `store.export`) |
| `rate_limited` | toast `shell.err.rate_limited` ("Too many tries. Wait a minute.") |
| `busy` | toast `auth.busy` |
| anything else | toast `shell.err.generic` with the error reference |

`<LockedControl reason>` wraps a button or link: same look plus a lock glyph; pressing it opens the review card
(pending), the limit sheet (plan / quota) or a small sheet with the state sentence; it never fires the action.

### PLA-§22.9 Limit sheet (PL-11 tenant side, core §I.4)

```ts
export type LimitSheetProps =
  | { kind: "quota"; metric: UsageMetric["metric"]; used: number; limit: number }
  | { kind: "feature"; key: FeatureKey; reason: "plan" | "state" | "release" | "kill" };
```

Content: an icon, the title (`shell.limit.<metric|key>.title`, e.g. "Media storage is full"), a `UsageMeter` (quota),
one sentence per reason (plan: "Your plan doesn't include this yet"; state: "Unlocks after approval" / "Paused while
your store is restricted"; release: "Coming with full stores"; kill: "Paused by Store Gen for maintenance"), and the
actions: owner → **Ask for more** (`createStoreRequestAction({ kind: "limit_raise", key, used, limit, asked?,
message? })`, PLA-§3.7) or **Request a plan change**, and **See plan & usage**; other members → "Ask your store owner"
(copies a short sentence to the clipboard); kill or release → no request. Never shows the platform database
percentage (MED-13). An open request of the same kind shows "Request sent on <date>" instead of the button.

### PLA-§22.10 Store settings pages owned by P2

#### PLA-§22.10.1 General (`settings/general`, TN-09)

Store name (≤ 120), category (the platform niche list), default language and languages, timezone (changes "today"
everywhere; confirm sheet), store id (Copy), created. **Mode** (owner, `store.mode`): the three cards of §22.1 with
the same R1 rule (PD30); from R2 a switch shows the "hide, never delete" sheet listing what is hidden and what appears
(`modeAllows`, core §A.2) → `setStoreModeAction`. Actions `saveGeneralAction` (`settings.write`).

#### PLA-§22.10.2 Address (`settings/address`, UX-05 R1 part)

The address card: the canonical URL (`storeUrl`), Copy, Open, live state ("Live" / "Not live yet: publish a page" /
"Hidden while in review"); in P mode the line "Your address becomes <handle>.<your Store Gen domain> when Store Gen
moves to its own domain" (only when `STORE_ROOT_DOMAIN` is unset; no domain name invented). **Rename handle**
(`domains.manage`, active stores): input with live availability, the warning "Old links keep working for 12 months",
once per 30 days → `renameHandleAction` (core `renameHandle`, P2 owns the rename in R1). R2 (S6) adds the QR code,
WhatsApp share and the test-order link (UX-05, design.md DES-§16.12).

#### PLA-§22.10.3 Security (`settings/security`, TN-13)

"Require two-step codes for every member" (owner with TOTP only; otherwise disabled with "Turn on two-step codes for
your own account first"): the list of members without 2FA and a confirm sheet → `setRequireMember2faAction`
(`security.write`, audit `store.2fa_required_changed`, notification `security.2fa_required`). R3 adds support grants
(PL-15).

#### PLA-§22.10.4 Plan & usage (`settings/plan`, PL-11)

Plan name and its one-line description (no prices: "Beta: free while Store Gen is in beta"), the usage meters (media,
pages, members, agents, exports this month, AI credits this month; versions kept per page as information), the
feature list (on / off with the lock reason), active boosts with their end date, and **Requests** (owner,
`billing.manage`): Request a plan change (active, non-hidden plans), Ask for more of a metric, the open requests with
status and Withdraw (`withdrawStoreRequestAction`), answered requests with the outcome. Subscription history
(`store_subscriptions`). Members without `billing.manage` see the page read-only (`billing.read`).

#### PLA-§22.10.5 Market (`settings/market`)

Market and currency (fixed in R1 for MA / MAD with a note), number and date formats preview in the store locale, the
store timezone link to General.

### PLA-§22.11 Danger zone (`settings/danger`, PL-09, PL-08 owner side)

- **Export your data** (`store.export`, ↑ when the user has TOTP): what is inside (core §F.9 list in plain words),
  "Request export" → P8's job → progress (parts done / total) → the parts list with download links (24 h signed, parts
  deleted after 72 h) and past exports. Allowed in read-only states.
- **Close the store** (owner, `store.close`, ↑ when TOTP): what happens (pages go offline, orders stop, 30 days to
  reopen, then deletion is scheduled), typed handle → `closeOwnStoreAction`. **Reopen** while closed ≤ 30 days.
- **Leave this store** (any member but the last owner) → `leaveStoreAction`.
- **Transfer ownership**: disabled "Coming later" (PL-21, R3).

### PLA-§22.12 Shared primitives (`src/components/admin/common/**`, P2, props frozen here, PD1)

```ts
export function StepUpSheet(p: { open: boolean; onVerified(): void; onClose(): void; surface: "console" | "tenant" }): JSX.Element;
export function TypedConfirmDialog(p: { open: boolean; title: string; body: ReactNode; expected: string; confirmLabel: string; tone: "danger" | "warn"; onConfirm(): Promise<void>; onClose(): void }): JSX.Element;
export function ReasonPicker<R extends string>(p: { reasons: readonly R[]; labelKey: (r: R) => MessageKey; value: R | null; note: string; noteRequiredFor?: readonly R[]; onChange(v: { reason: R | null; note: string }): void }): JSX.Element;
export function UsageMeter(p: { label: string; used: number; limit: number | null; unit?: "bytes" | "count" | "credits"; warnAt?: number /* 0.8 */ }): JSX.Element;
export function MaskedValue(p: { value: Masked | string; reveal?: { onReveal(): Promise<string>; label: string } }): JSX.Element;
export function StatusPill(p: { status: StoreStatus; size?: "sm" | "md" }): JSX.Element;
export function ModeBadge(p: { mode: StoreMode }): JSX.Element;
export function Monogram(p: { name: string; seed: string; accentHue?: number | null; size: 24 | 32 | 48 }): JSX.Element;
export function LockedControl(p: { reason: LockReason; children: ReactElement }): JSX.Element;
export function PanelBoundary(p: { title: string; children: ReactNode }): JSX.Element;   // Suspense + error boundary with Retry and the reference
export function KeysetPager(p: { next: string | null; prev: string | null; param?: string }): JSX.Element;
export function WhatsAppShareButton(p: { text: string; phone?: string | null; label?: string }): JSX.Element;   // wa.me link, noopener
export function QrCode(p: { value: string; size: number; label: string }): JSX.Element;   // qrcode → SVG, PD47
export type LockReason = { kind: "pending" } | { kind: "state"; status: StoreStatus } | { kind: "plan"; key: FeatureKey } | { kind: "kill"; key: KillKey } | { kind: "role" } | { kind: "release"; release: "R2" | "R3" };
```

Every primitive: keyboard reachable, visible focus ring (2 px accent), RTL mirrored, ≥ 44 px targets below 768 px,
reduced-motion safe, and a story fixture in `src/app/dev/fixture/**` (dev only) for the screenshot tests.

### PLA-§22.13 Tenant ⌘K (UX-02 tenant; fixes ADM-02)

Rework of `src/components/admin/shell/command-palette*.tsx`:
- **Scope**: the store in the URL; every server query goes through `GET /api/app/<h>/search?q=`
  (`src/app/api/app/[store]/search/route.ts`, `storeGuard(req, h, "store.read")`, PLA-§Q.12) with
  `src/lib/admin-data/search.ts` scoped: orders by exact id (`orders.read`; agents only their own queue, through P4's
  scoped search), by phone (`orders.read_all`, results masked), pages by name (`pages.read`), customers by name prefix
  (`customers.read`, masked phone). Bucket `s:<sid>:search:<userId>` 60/min. The old cross-database search and the
  hard-coded "Export all orders (CSV)" action are removed.
- **Local index** (≤ 300 entries, shipped with the layout): nav items from `navFor(ctx)`, settings sections, team member
  names (members.read), recent pages.
- **Actions** from the command registry: shell actions (Create page, Invite, Switch store, Notifications, Help, Toggle
  theme / density, Language) plus track contributions in `src/components/admin/shell/commands/<track>.ts`
  (PLA-§Q.17), each `{ id, label: MessageKey, permission?: StorePermission, mode?: ModeFeature, shortcut?: string, href?: (h) => string, action?: () => Promise<void> }`,
  filtered by `ctx.can`, mode and release.
- **Patterns and chords**: an order id opens the order drawer, `>` filters actions, `?` the shortcut sheet; chords
  `G H` overview, `G O` orders, `G Q` queue, `G L` leads, `G C` customers, `G P` pages, `G M` media, `G T` team, `G S`
  settings, `G N` notifications, `G W` switch store; `C` opens Create.

Acceptance (UX-02 tenant): a member of store B searching store A's order id or a customer phone gets no result (attack
suite); an agent's phone search is refused; results render masked phones only.

### PLA-§22.14 Help sheet

§20.1 (P2 component `src/components/admin/shell/help-sheet.tsx`).

### PLA-§22.15 Legal re-acceptance sheet (PD17)

When a published platform document with `requiresReacceptance` is effective and the viewer has not accepted that
version (checked at layout render, cached 5 min per session, and through `pulse.reaccept`), a blocking sheet (focus
trapped, no close button) shows the document title, the "What changed" summary, a link to the full text, **I accept**
→ `acceptLegalAction({ documentIds })` (`userAction`, `legal_acceptances.context = 'reaccept'`, IP hash and UA label)
and **Sign out**. Never on public pages, never during an impersonation (the staff member's own acceptance is handled in
the console shell the same way).

---

## PLA-§23. Mobile admin and the PWA (UX-07, PD10, PD46)

### PLA-§23.1 R1: phone-ready screens and the installable dashboard

- **360 px rules** for every PLA tenant screen and the console queue: one column; tables become two-line rows (primary
  line + meta line); drawers and dialogs become full-height sheets with a sticky action bar; ≥ 44 px targets; the
  sidebar becomes a sheet (existing shell behaviour); the topbar keeps the store switcher, bell and ⌘K button; the
  console queue detail is a full screen with a bottom bar (Approve, Ask, Reject, ⋯). Every swipe has a tap
  alternative.
- **Manifest** `GET /app/manifest.webmanifest` (`src/app/app/manifest.webmanifest/route.ts`, PLA-§Q.12), linked by the
  `/app` layout through `metadata.manifest` (`03-functions/generate-metadata.md` "manifest"); `Content-Type:
  application/manifest+json`, `Cache-Control: public, max-age=3600`; the CSP already allows `manifest-src 'self'`
  (`src/lib/security/headers.ts`, `adminCsp`).

```ts
{
  id: "/app/", name: platform.brand.name, short_name: platform.brand.name.slice(0, 12),
  start_url: "/app?source=pwa", scope: "/app/", display: "standalone", orientation: "portrait",
  background_color: "<--background light token as hex>", theme_color: "<--background light token as hex>",
  icons: [ { src: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
           { src: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
           { src: "/icons/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" } ],
  lang: "<viewer locale>", dir: "<rtl for ar>"
}
```

  Icons: generated at build time by `scripts/build-app-icons.mjs` (sharp, installed, `package.json:73`) from the
  platform wordmark monogram into `public/icons/`, maskable content inside the inner 80 % circle (design.md UX-07 row);
  no orange (the icon colours come from the console/tenant neutral tokens). Installability needs only a valid manifest
  and HTTPS (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:592-595`); **no service worker in
  R1** (PD10).
- **Install hint**: after the 3rd visit (a per-viewer counter in localStorage, wrapped in try/catch), the account menu
  shows "Install the app"; Chromium uses the native prompt when available; iOS shows a sheet "Tap Share, then Add to
  Home Screen". Never on the first visit, never as a modal.

### PLA-§23.2 R3: Web Push (D5)

- A push-only service worker at `/app/sw.js` (scope `/app/`; route handler with `Service-Worker-Allowed: /app/`), no
  fetch handler and no cache (no offline copy of customer data).
- VAPID keys in the encrypted platform setting `platform_push` (PLA-§Q.21), generated by a console button
  (super_admin ↑); JWT ES256 and the `aes128gcm` payload encryption written on `node:crypto` in
  `src/lib/platform/push/**` (no new dependency).
- Subscriptions in `push_subscriptions` (PLA-§2.3); the subscribe button sits in the notification centre and in the
  agent queue header, asked only after a tap (iOS requires a Home Screen app and a user gesture **[as researched,
  PA §10.5]**).
- Delivery through the outbox (kind `push`, PLA-§Q.21) from `notify()` for kinds flagged `push: true` (new orders,
  callbacks due, approval result); payload `{ kind, handle, count }` only, title rendered generic ("New orders in
  @handle"), never a customer name or phone; 404/410 answers disable the subscription.
- Per-user channel preferences (`notification_prefs`, PLA-§Q.22): in-app always on; push and (R2) e-mail per group.

Acceptance (UX-07): R1 Lighthouse "installable" passes on `/app` over HTTPS with the manifest above, no service worker
registered (asserted in e2e); R3 a push for a new order arrives on Android Chrome with a payload that contains no
digit sequence longer than 4 (PII canary).

---

## PLA-§24. Later platform features (R3 track D5 unless stated; P2 = later)

### PLA-§24.1 Support grants and break-glass write (PL-15, R3)

Store side (`settings/security`, owner, `support.grant` ↑ when TOTP): "Allow Store Gen support to edit for 24 h /
72 h", scope chips from `SUPPORT_GRANT_AREAS` (pages, media, basic settings, catalog; never team, security,
integrations, billing, payouts, export), optional note; active grants with Revoke; every use listed in Activity.
Console side: an impersonation started while a valid grant covers the store offers "Start with edit access (granted
by the owner until <date>)"; writes then pass the seam only for the granted areas (core §B.8 note, `support_grants`).
**Break-glass write** without a grant: super_admin only, ↑, reason `legal_request | security_incident |
data_corruption`, crimson ribbon (hue 17) "Emergency edit access", an immediate store notification, 15 minutes
maximum, listed in the break-glass log. Acceptance: a write outside the granted areas is refused and audited.

### PLA-§24.2 Abuse reports and takedowns (PL-20, R3)

A "Report this store" link in store footers → `/report/<handle>` on the platform host (reason, details ≤ 2,000,
optional contact, Turnstile; `abuse_reports`, contact sealed with the platform envelope). Console `/admin/abuse`
(`abuse.handle`, PLA-§Q.5): queue by status, report detail with the reported page (sandboxed preview), actions
Dismiss, Unpublish page, Hide media, Restrict / Suspend store; page and media takedowns go through a dedicated platform
write scope (`platformWriteScope(ctx, storeId, "takedown")`, a core addition at the R3 contract step) and notify the
store with the reason.

### PLA-§24.3 Ownership transfer (PL-21, R3)

Owner → "Transfer ownership" to an existing admin member: the target confirms within 72 h from a notification; on
confirmation the target becomes `owner`, the old owner becomes `admin` or leaves (their choice at start); both
confirmations and the result are audited (`store.ownership_transferred`); staff can cancel a suspicious transfer.

### PLA-§24.4 Manual billing, then a payment provider (PL-23, later)

`payments_manual` (sketch: `id`, `store_id`, `subscription_id`, `amount_cents`, `currency`, `method enum(cash,
transfer, other)`, `ref`, `paid_at`, `recorded_by`, `note`) and invoice PDFs; prices stay out until the owner decides
(RESEARCH §6.3 Q3); a provider later on `store_subscriptions.provider` (Moroccan providers **[unverified]**).

### PLA-§24.5 Web Risk URL checks, VPN/ASN signal (PL-24, later)

Optional Google Web Risk key (platform secret) checks links in business context and store names (+40 when listed);
an ASN signal only if a reliable free dataset exists (**[unverified]**).

### PLA-§24.6 Help centre and CSAT (PL-25, later)

In-app articles in ar/fr/en searchable from the Help sheet and ⌘K; one-tap CSAT after a solved ticket.

### PLA-§24.7 External confirmation team (TN-14, later)

Scope note only: an outsourced call center invited as a team with its own manager across several stores; owned by
operations.md.

### PLA-§24.8 Admin upgrade on platform screens (UX-04, R2, S6)

Console and SaaS screens adopt the R2 design-system checklist (design.md DES-§16.17): density modes everywhere, split
views for queue-like lists (stores, people), undo toasts for reversible console actions, real-data KPI tiles with
deltas.

### PLA-§24.9 Passkeys (SE-09, later)

WebAuthn as a second factor and later passwordless for staff first; needs a library choice (none installed); TOTP
stays the required factor until then.

---

## PLA-§L. Limits

| What | Limit | Where enforced |
|---|---|---|
| Bulk approve (fast lane) | ≤ 50 rows per call | `approveBulkAction` (Zod) |
| Bulk message | ≤ 50 stores; text ≤ 600 chars | `messageStoresAction` |
| Staff question / seller answer / appeal | ≤ 500 chars each; one appeal per rejection | queue actions, `signup_reviews.appeals` |
| Business context fields | what you sell ≤ 200, link ≤ 200, WhatsApp E.164 | `submitForReviewAction` |
| Notes | ≤ 4,000 chars, ≤ 20 mentions; edit window 24 h | `addNoteAction`, `editNoteAction` |
| Reason notes | ≤ 500 chars (lifecycle), ≤ 300 (impersonation), ≤ 200 (entitlements, kill switches, flag overrides) | dialogs + Zod |
| Invite codes | uses 1-500; label ≤ 120; expiry 7 / 30 / 90 days / never | `createInviteCodeAction` |
| Waitlist invite batch | ≤ 100 rows per call | `inviteWaitlistAction` |
| Store invites | 20 pending per store, `s:<sid>:invite` 20/day, 7-day links (core §B.5) | T2 |
| Staff invites | 72 h, single use; ≤ 10 pending | `inviteStaffAction` |
| Impersonation | 15 / 30 / 60 min; `p:impersonate:<userId>` 20/day | `startImpersonationAction` |
| PII reveal | 60 s display; `p:pii:reveal:<userId>` 20/day | `revealOrderPiiAction` |
| Phone lookup | `p:orders:lookup:<userId>` 30/h | `lookupPhoneAction` |
| User actions | `p:users:manage:<staffId>` 30/h | users actions |
| Console search | ≥ 2 chars; `p:console:search:<userId>` 60/min; 10 results per group | `/api/admin/search` |
| Tenant search | `s:<sid>:search:<userId>` 60/min | `/api/app/<h>/search` |
| Pulses | 15 s visible polling; `s:<sid>:pulse:<userId>` 12/min (core); console unbounded but cached 5 s | pulse routes |
| Store requests | one open per kind per store; `s:<sid>:request` 5/day | `createStoreRequest` |
| Boosts | expiry required, ≤ 90 days | `setEntitlementAction` |
| Platform requests | expire after 7 days unconfirmed; one pending per (store, kind) | `platform.requests` job |
| Lists | page size 50 (25 below 768 px); CSV ≤ 10,000 rows (stores), ≤ 50,000 (audit) | list functions |
| Health job | ≤ 200 stores per tick | `platform.health` |
| Preview tokens | 10 min (console), 72 h (seller "private preview") | PLA-§Q.6 |
| Step-up freshness | 5 min (core §B.7); `p:mfa:stepup:<userId>` 5 / 15 min | T2 |
| Operation de-duplication | `p:op:<userId>:<opId>` 10 min | console actions |
| Legal document body | ≤ 200,000 chars; summary ≤ 500 | legal actions |
| Protected brands | term 2-60 chars | brands actions |
| Reserved handles (extra) | ≤ 500 | `platform` setting schema |

---

## PLA-§M. Server actions, routes, audit actions and query plans

### PLA-§M.1 Server actions and their permissions

Every exported action body is `return platformAction(permission, fn, { stepUp? })` (console) or
`return storeAction(permission, fn, opts)` / `userAction(fn)` / `publicAction(...)` (tenant), lint L9. Inputs are Zod
schemas without `storeId` for tenant actions (core §E.3 rule 4); console actions take `storeId` explicitly (staff act
across stores) and load the store through `getStoreById`.

**Console (P1)**

| File (`src/app/admin/(console)/…`) | Action | Permission | ↑ | Audit |
|---|---|---|---|---|
| `queue/actions.ts` | `approveReviewAction`, `approveBulkAction`, `askInfoAction`, `snoozeReviewAction`, `reopenReviewAction` | `signups.decide` | | `platform.signup.approved` · `.bulk_approved` · `.info_requested` · `.snoozed` · `.reopened` |
| | `rejectReviewAction` | `signups.decide` (+ `users.manage` ↑ when `block`) | (block) | `platform.signup.rejected` (+ `platform.user.banned`) |
| | `resolveRequestAction` | `entitlements.override` (plan, limit) · `signups.decide` (go_live, mode_change, domain) | | `platform.request.resolved` |
| `stores/actions.ts` | `messageStoresAction` | `notify.stores` (support: one store) | | `platform.store.messaged` |
| `stores/new/actions.ts` | `createStoreAction` | `stores.create` | | `store.created` |
| `stores/[id]/actions.ts` | lifecycle actions of PLA-§8.1, `setSuspendNoticeAction` | `stores.lifecycle` / `stores.close` / `stores.purge` | per §8.1 | `platform.store.*` |
| | `revealOrderPiiAction` | `pii.reveal` | ↑ | `platform.pii.revealed` |
| | `assignPlanAction` | `entitlements.override` | | `platform.plan.changed` |
| | `setEntitlementAction`, `clearEntitlementAction` | `entitlements.override` | | `platform.entitlement.set` |
| | `requestPlatformExportAction` | `stores.close` (super_admin) | ↑ | `store.export_requested` |
| | `startImpersonationAction`, `endImpersonationAction` | `stores.impersonate` | | core `platform.impersonation.*` |
| | `addNoteAction`, `editNoteAction`, `deleteNoteAction`, `pinNoteAction` | `stores.notes` | | `platform.note.added` · `.edited` · `.deleted` · `.pinned` |
| | `replayOutboxAction` | `stores.lifecycle` | | `platform.outbox.replayed` |
| | `retryRendersAction` | `domains.manage` | | `platform.domains.rerender` |
| `users/actions.ts` | `banUserAction`, `unbanUserAction`, `resetUser2faAction`, `createResetLinkAction`, `signOutUserAction` | `users.manage` | ↑ | `platform.user.*` |
| `orders/actions.ts` | `lookupPhoneAction` | `orders.lookup` | | `platform.order.lookup` |
| `plans/actions.ts` | `previewPlanChangeAction` (read), `savePlanAction`, `createPlanAction`, `setPlanStatusAction` | `plans.manage` | | `platform.plan.updated` · `.created` |
| `flags/actions.ts` | `setKillSwitchAction` | `kill.manage` | ↑ | `platform.kill.changed` |
| | `saveFlagAction`, `setFlagOverrideAction`, `clearFlagOverrideAction` | `flags.manage` | | `platform.flag.changed` |
| `settings/actions.ts` | `savePlatformSettingsAction` | `platform.settings` (section `signup.mode` to `open`: typed confirm) | | `platform.settings.updated` |
| | `saveTurnstileAction` (secret) | `platform.settings` | ↑ | `platform.settings.updated` (`{ key: "platform_turnstile", secretChanged: true }`) |
| | `createInviteCodeAction`, `revokeInviteCodeAction`, `inviteWaitlistAction`, `dropWaitlistAction` | `signups.decide` | | `platform.invite.created` · `.revoked` · `platform.waitlist.invited` · `.dropped` |
| | `saveProtectedBrandAction`, `deleteProtectedBrandAction`, `checkBrandNameAction` (read) | `platform.settings` | | `platform.brand_term.saved` · `.deleted` |
| | `saveLegalDraftAction`, `markLegalReviewedAction`, `publishLegalAction`, `retireLegalAction` | `legal.manage` | | `platform.legal.*` |
| | `saveBackupRetentionAction` | `backups.manage` | ↑ | `platform.settings.updated` |
| `security/actions.ts` | `inviteStaffAction`, `revokeStaffInviteAction`, `setStaffRoleAction`, `removeStaffAction`, `signOutAllStaffAction` | `staff.manage` | ↑ | `platform.staff.*` |
| | `confirmPlatformRequestAction`, `cancelPlatformRequestAction` | `stores.purge` (purge) · `staff.manage` (super_admin promotion) | ↑ | `platform.store.purge_confirmed` · `platform.request.cancelled` · `platform.staff.changed` |
| | `markBreakGlassReviewedAction` | `audit.platform` | | `platform.breakglass.reviewed` |
| `domains/actions.ts` | `markDomainStepAction`, `runDomainCheckAction` | `domains.manage` | | `platform.domains.step` |
| | `rerenderAllAction` | `domains.manage` | ↑ | `platform.domains.rerender` |
| `notifications/actions.ts` | `markStaffNotificationsReadAction` | `console.read` | | — |

Decision recorded (§3.3): invite codes are `signups.decide` (daily ops) although they live under Settings.

**Tenant (P2)**

| File | Action | Wrapper and permission | Audit |
|---|---|---|---|
| `src/app/app/actions.ts` | `setLastStoreAction`, `acceptLegalAction` | `userAction` | — / `auth.legal.accepted` |
| `src/app/app/[store]/review-actions.ts` | `submitForReviewAction`, `answerReviewQuestionAction`, `submitAppealAction` | `storeAction("store.read")` + owner check | `store.review.submitted` · `.answered` · `store.appeal.submitted` |
| | `mintPreviewLinkAction({ pageId })` | `storeAction("pages.read")` | `store.preview_link.created` |
| `src/app/app/[store]/welcome/actions.ts` | PLA-§22.2 table | per row | `store.onboarding.completed` · `.skipped` |
| `src/app/app/[store]/team/actions.ts` | PLA-§22.4 table | per row | core `store.member.*` |
| `src/app/app/[store]/notifications/actions.ts` | `markNotificationsReadAction` | `storeAction("store.read")` | — |
| `settings/general/actions.ts` | `saveGeneralAction` · `setStoreModeAction` | `settings.write` · `store.mode` | `store.settings.updated` · `store.mode_changed` |
| `settings/address/actions.ts` | `renameHandleAction` | `domains.manage` | `store.handle_renamed` |
| `settings/security/actions.ts` | `setRequireMember2faAction` | `security.write` | `store.2fa_required_changed` |
| `settings/plan/actions.ts` | `createStoreRequestAction`, `withdrawStoreRequestAction` | `billing.manage` (rate `s:<sid>:request` 5/day) | `store.request.created` · `.withdrawn` |
| `settings/danger/actions.ts` | `requestStoreExportAction` · `closeOwnStoreAction` · `reopenOwnStoreAction` · `leaveStoreAction` | `store.export` ↑ · `store.close` ↑ · `store.close` · `store.read` | core `store.export_requested` · `store.closed` · `store.reopened` · `store.member.removed` |
| `src/app/app/account/**/actions.ts` | `updateProfileAction`, `changePasswordAction`, `revokeSessionAction`, `signOutOthersAction` (+ the moved 2FA actions) | `userAction` | `auth.*` |

### PLA-§M.2 Route handlers

| Route | File | Guard | Cache |
|---|---|---|---|
| `GET /api/admin/pulse` | `src/app/api/admin/pulse/route.ts` | `platformGuard(req, "console.read")` | ETag, `private, no-store` |
| `GET /api/admin/search?q=` | `src/app/api/admin/search/route.ts` | `console.read` | `private, no-store` |
| `GET /api/admin/stores.csv` | `src/app/api/admin/stores.csv/route.ts` | `console.read` + admin rank | `private, no-store`, `Content-Disposition: attachment` |
| `GET /api/admin/audit.csv` | `src/app/api/admin/audit.csv/route.ts` | `audit.platform` | same |
| `GET /api/admin/stores/<id>/media/<key>` | `src/app/api/admin/stores/[id]/media/[key]/route.ts` | `console.read` | `private, no-store`, sandbox CSP |
| `GET /api/admin/stores/<id>/exports/<jobId>/<part>` | `src/app/api/admin/stores/[id]/exports/[jobId]/[part]/route.ts` | `stores.close` + signature + fresh step-up | `private, no-store` |
| `GET /api/admin/backups/<day>` | `src/app/api/admin/backups/[day]/route.ts` | `backups.manage` + fresh step-up | `private, no-store` |
| `GET /api/app/<h>/pulse` | `src/app/api/app/[store]/pulse/route.ts` (P2) | `storeGuard(req, h, "store.read")` | ETag, `private, no-store` |
| `GET /api/app/<h>/search?q=` | `src/app/api/app/[store]/search/route.ts` (P2) | `storeGuard(req, h, "store.read")` | `private, no-store` |
| `GET /app/manifest.webmanifest` | `src/app/app/manifest.webmanifest/route.ts` (P2) | none (public) | `public, max-age=3600` |
| `GET /invite/staff/<token>` (page) | `src/app/(public)/invite/staff/[token]/page.tsx` (P1) | token | `private, no-store`, `no-referrer`, `noindex` |

Every handler sets its own security headers (core D31) through `apiHeaders` or the media headers.

### PLA-§M.3 Audit actions added by this part

`platform.signup.snoozed`, `platform.signup.bulk_approved`, `platform.request.resolved`, `platform.request.cancelled`,
`platform.store.messaged`, `platform.stores.exported`, `platform.note.added|edited|deleted|pinned`,
`platform.outbox.replayed`, `platform.domains.rerender`, `platform.domains.step`, `platform.order.lookup`,
`platform.plan.updated`, `platform.plan.created`, `platform.invite.created|revoked`, `platform.waitlist.invited|dropped`,
`platform.brand_term.saved|deleted`, `platform.legal.saved|reviewed|published|retired`, `platform.settings.updated`,
`platform.staff.invited|signed_out_all`, `platform.audit.exported`, `platform.breakglass.reviewed`,
`store.milestone.reached`, `store.review.submitted|answered`, `store.appeal.submitted`, `store.request.created|withdrawn`,
`store.preview_link.created`, `store.onboarding.completed|skipped`, `auth.legal.accepted`. Core actions reused as
listed in core §F.5. `AuditAction` keeps its `(string & {})` escape hatch (`src/lib/audit.ts:14-38`); the names are
appended to the union for autocomplete (PLA-§Q.23).

### PLA-§M.4 Query plans (every console list, MariaDB 10.4)

| Query | Index used | Notes |
|---|---|---|
| Queue tabs | `sr_kind_queue_idx (kind, status, created_at)` | Review = `kind IN ('signup','reopen') AND status IN ('pending','needs_info')`; snoozed rows past `snooze_until` read with the Review tab (`status = 'snoozed' AND snooze_until <= now`) |
| Queue per store, open requests | `sr_store_kind_idx (store_id, kind, status)` | one open per kind check |
| Stores list | `stores_status_idx (status, created_at)`, `stores_plan_idx`, PK join `store_health` | ≤ 2,000 rows: filesort on `score` acceptable (≤ 300 ms) |
| Needs attention | `sh_attention_idx (attention, score)` | `attention >= 2 ORDER BY attention DESC, score ASC LIMIT 20` |
| Health job due | `sh_due_idx (dirty_at, computed_at)` | dirty first |
| Owners of 50 stores | `sm_store_role_idx (store_id, role, status)` | `IN (…50 ids)` |
| Activity feed | PK `audit_log.id` | `id > maxId − 20000 AND action IN (…)` |
| Store activity | `audit_store_idx (store_id, id)` | keyset by id |
| Store timeline | `audit_store_idx`, `sr_store_idx`, `imp_store_idx`, `pn_store_idx` | 4 × LIMIT 50, merged |
| Orders 24 h | `orders_created_idx (created_at)` (PLA-§Q.10) | range scan |
| Phone lookup | `cu_phone_idx (phone)` (PLA-§Q.10) | exact match |
| People search | `users_email_uq` (exact), a `users_name_idx (name)` prefix index (PLA-§Q.10) | name prefix admin+ only |
| Staff list | `users_prole_idx (platform_role)` | |
| Notifications (member) | `nt_store_idx (store_id, id)`, `nt_user_idx (user_id, id)` | over-fetch 2 × limit, filter roles in code |
| Notifications (staff) | `nt_aud_idx (audience, id)` | |
| Platform requests due | `preq_due_idx (status, execute_after)` | |
| Waitlist | `wl_status_idx (status, created_at)` | |
| Legal list | `ld_kind_status_idx (kind, locale, status)` | |

`platform-check.ts` runs `EXPLAIN` on each and fails when the plan shows `type = ALL` on a table over 10,000 seeded
rows.


### PLA-§M.5 Caches and buckets (TN-11)

Every process cache of this part is created with `scopedCache()` (core §E.6; lint L4) and every rate bucket with
`platformBucket()` / `storeBucket()` (core §E.8; lint L5). No new allow-list entry.

| Cache (`scopedCache` name) | Key (store id or `"p"`) | TTL / size | Invalidated by |
|---|---|---|---|
| `console-kpi` | `"p"` : tile id | 60 s / 32 | — (time) |
| `console-pulse` | `"p"` : `"queue"` | 5 s / 1 | queue decisions |
| `console-unread` | `"p"` : staff user id | 5 s / 512 | `markStaffNotificationsReadAction` |
| `mx` | `"p"` : domain | 24 h / 2,000 (negatives included) | — |
| `protected-terms` | `"p"` : `"all"` | 5 min / 1 | brand saves |
| `notify-unread` | store id : user id | 5 s / 4,000 | `markRead` |
| `store-pulse` | store id : `"base"` | 5 s / 2,000 | `transitionStore`, review actions |
| `legal-reaccept` | `"p"` : user id | 5 min / 4,000 | `acceptLegalAction`, legal publish |
| `broadcasts` (R3) | `"p"` : `"live"` | 60 s / 1 | broadcast saves |

Buckets: `p:console:search:<userId>`, `p:pii:reveal:<userId>`, `p:orders:lookup:<userId>`, `p:users:manage:<staffId>`,
`p:impersonate:<userId>`, `p:op:<userId>:<opId>`, `s:<sid>:request`, `s:<sid>:search:<userId>` (and the core's
`s:<sid>:pulse:<userId>`, `s:<sid>:invite`, `p:invite:accept:ip:<h>`, `p:mfa:stepup:<userId>`). Keys are ids or
hashes, never raw e-mails, phones or IPs.

---

## PLA-§N. Copy keys

### PLA-§N.1 Catalogs, owners, rules

| File (`src/lib/i18n/admin/<locale>/…`) | Owner | Locales in R1 | Prefixes |
|---|---|---|---|
| `console.ts` | P1 | en (fr R2, ar R3) | `console.*` |
| `notify.ts` | P1 | en, fr, ar for tenant kinds; en for `staff.*` | `notify.<kind>.title`, `notify.<kind>.body` |
| `auth.ts` | P2 | en, fr, ar | `auth.*` |
| `onboarding.ts` | P2 | en, fr, ar | `onboarding.*` |
| `team.ts` | P2 | en, fr, ar | `team.*` |
| `shell.ts` | P2 | en, fr, ar | `shell.*` |

Rules: ICU-lite `{var}` placeholders identical in every locale (checked); counts use `Intl.PluralRules` keys
(`.one`, `.other` for en/fr; `.zero`, `.one`, `.two`, `.few`, `.many`, `.other` for ar); Latin digits; no em-dash and no
"Step 1/2/3" in UI copy (rethink-features §2.1 rule 8); no uppercase transforms on Arabic; sentences end with a full
stop, labels do not. Arabic is clear Modern Standard Arabic with everyday Moroccan words where they read naturally
(الطلبات، التوصيل، الزبناء، واتساب، الثمن), never a word-by-word translation; verbs addressed to the seller use the
neutral form common in Moroccan apps, and a native Darija speaker reviews every R1 tenant string before release
(checklist item of the R1 exit, §O.4). `test:i18n-coverage` (§O.1) fails on a missing key or placeholder mismatch.

### PLA-§N.2 Key inventory (names; texts below for the tenant-facing core)

- `auth.*`: `login.title`, `login.email`, `login.password`, `login.show`, `login.submit`, `login.failed`,
  `login.too_many`, `login.challenge`, `login.create`, `login.forgot`, `forgot.r1`, `verify.title`, `verify.recovery`,
  `verify.failed`, `verify.too_many`, `signup.account`, `signup.store`, `signup.name`, `signup.email`,
  `signup.password_rule.<rule>`, `signup.phone`, `signup.invite_code`, `signup.store_name`, `signup.handle`,
  `signup.handle_available`, `signup.handle_taken`, `signup.address_preview`, `signup.mode.<mode>.title`,
  `signup.mode.<mode>.desc`, `signup.mode.soon`, `signup.mode.notify`, `signup.market_fixed`, `signup.legal`,
  `signup.submit`, `signup.closed`, `signup.waitlist.*`, `signup.generic_fail`, `reset.title`, `reset.done`,
  `reset.invalid`, `busy`, `locale.<code>`.
- `onboarding.*`: `photos.title`, `photos.hint`, `photos.skip`, `photos.uploading`, `photos.failed`, `analyzing`,
  `category.title`, `category.suggested`, `product_name`, `use_suggestion`, `price`, `price_required`, `compare_at`,
  `compare_hint`, `compare_invalid`, `fact`, `reveal.title`, `reveal.direction`, `reveal.use`, `reveal.more`,
  `reveal.saved`, `reveal.submit`, `reveal.builder`, `contact.title`, `contact.whatsapp`, `contact.use_phone`,
  `fee_note`, `skip`, `done`.
- `team.*`: `tab.<members|invites|agents>`, `invite.title`, `invite.email`, `invite.role`, `invite.note`,
  `invite.create`, `invite.link_once`, `invite.wa_text`, `invite.bound_to`, `invite.expires`, `invite.invalid`,
  `invite.full`, `invite.join`, `invite.other_account`, `invite.sign_in`, `joined`, `role.<role>.name`,
  `role.<role>.line`, `role.can.<group>`, `role.cannot.<group>`, `last_owner`, `pending_cap`, `remove.confirm`,
  `leave`, `you`, `seats`.
- `shell.*`: `picker.*`, `switcher.*`, `status.<status>`, `mode.<mode>`, `review.*`, `locked.*`, `banner.*`,
  `page.<closed|deletion|rejected>`, `rejected.<reason>`, `appeal.*`, `status_reason.<code>`, `kill.<key>`,
  `impersonation.*`, `limit.<metric|key>.title`, `limit.reason.*`, `limit.ask_more`, `limit.ask_owner`,
  `limit.request_sent`, `err.*`, `notifications.*`, `help.*`, `legal.*`, `plan.*`, `address.*`, `security.*`,
  `danger.*`, `general.*`, `market.*`, `account.*`, `install.*`, `cmdk.*`.
- `notify.*`: the kinds of §18.2 (`.title`, `.body`).
- `console.*`: `badge`, `nav.<item>`, `queue.*`, `risk.<SignupFlagCode>`, `reject.<RejectReason>`, `ask.<template>`,
  `reason.<code>`, `attention.<code>`, `feed.<action>`, `audit.<action>`, `entitlement.<key>`,
  `plans.take_orders_locked`, `signup.open_warning`, `invite.share_text`, `reset.wa_text`, `kill.<key>.effect`,
  `health.*`, `domains.*`, `legal.*`, `staff.*`, `people.*`, `profile.tab.<tab>`, `empty.*`, `err.*`.

### PLA-§N.3 Reference texts (tenant-facing, R1)

| Key | en | fr | ar |
|---|---|---|---|
| `auth.login.title` | Sign in to Store Gen | Connexion à Store Gen | تسجيل الدخول إلى Store Gen |
| `auth.login.failed` | E-mail or password is incorrect. | E-mail ou mot de passe incorrect. | البريد الإلكتروني أو كلمة المرور غير صحيحة. |
| `auth.login.too_many` | Too many attempts. Wait a few minutes and try again. | Trop de tentatives. Patientez quelques minutes puis réessayez. | محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة. |
| `auth.login.challenge` | Confirm you're not a robot to continue. | Confirmez que vous n'êtes pas un robot pour continuer. | أكّد أنك لست روبوتًا للمتابعة. |
| `auth.busy` | The server is busy. Try again in a few seconds. | Le serveur est occupé. Réessayez dans quelques secondes. | الخادم مشغول حاليًا. أعد المحاولة بعد ثوانٍ. |
| `auth.forgot.r1` | Ask your store owner or Store Gen support for a reset link. | Demandez un lien de réinitialisation au propriétaire de la boutique ou au support Store Gen. | اطلب رابط إعادة تعيين كلمة المرور من صاحب المتجر أو من دعم Store Gen. |
| `auth.verify.title` | Enter your 6-digit code | Saisissez votre code à 6 chiffres | أدخل الرمز المكوّن من 6 أرقام |
| `auth.signup.account` | Your account | Votre compte | حسابك |
| `auth.signup.store` | Your store | Votre boutique | متجرك |
| `auth.signup.handle_available` | Available | Disponible | متاح |
| `auth.signup.handle_taken` | Not available | Indisponible | غير متاح |
| `auth.signup.address_preview` | Your address: {address} | Votre adresse : {address} | عنوان متجرك: {address} |
| `auth.signup.mode.landing.title` | Landing pages | Pages de vente | صفحات البيع |
| `auth.signup.mode.landing.desc` | One page per product, built for cash-on-delivery orders. | Une page par produit, pensée pour les commandes payées à la livraison. | صفحة لكل منتج، مصمّمة لطلبات الدفع عند الاستلام. |
| `auth.signup.mode.store.title` | Full store | Boutique complète | متجر كامل |
| `auth.signup.mode.both.title` | Both | Les deux | الاثنان معًا |
| `auth.signup.mode.soon` | Coming soon | Bientôt | قريبًا |
| `auth.signup.mode.notify` | Tell me when it's ready | Prévenez-moi quand c'est prêt | أخبرني عندما يصبح جاهزًا |
| `auth.signup.legal` | I accept the {terms}, the {privacy} and the {aup}. | J'accepte les {terms}, la {privacy} et la {aup}. | أوافق على {terms} و{privacy} و{aup}. |
| `auth.signup.submit` | Create my store | Créer ma boutique | أنشئ متجري |
| `auth.signup.closed` | Sign-ups are closed for now. | Les inscriptions sont fermées pour le moment. | التسجيل مغلق حاليًا. |
| `auth.signup.generic_fail` | These details can't be used to create an account. If you already have one, sign in. | Ces informations ne permettent pas de créer un compte. Si vous en avez déjà un, connectez-vous. | لا يمكن استعمال هذه المعلومات لإنشاء حساب. إذا كان لديك حساب، سجّل الدخول. |
| `auth.reset.invalid` | This link is no longer valid. Ask for a new one. | Ce lien n'est plus valide. Demandez-en un nouveau. | هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا. |
| `onboarding.photos.title` | Drop 1 to 5 product photos | Déposez 1 à 5 photos du produit | أضف من صورة واحدة إلى 5 صور للمنتج |
| `onboarding.photos.skip` | Start without photos | Commencer sans photos | ابدأ بدون صور |
| `onboarding.analyzing` | Looking at your photos… | Analyse de vos photos… | نحلّل صورك… |
| `onboarding.use_suggestion` | Use suggestion | Utiliser la suggestion | استعمل الاقتراح |
| `onboarding.price` | Price | Prix | الثمن |
| `onboarding.compare_hint` | Only a price you really sold at before. | Uniquement un prix auquel vous avez vraiment vendu. | فقط ثمن بعتَ به فعلًا من قبل. |
| `onboarding.reveal.title` | Here is your page | Voici votre page | هذه صفحتك |
| `onboarding.reveal.use` | Use this design | Choisir ce design | اختر هذا التصميم |
| `onboarding.reveal.more` | Show 3 more | Voir 3 autres | اعرض 3 تصاميم أخرى |
| `onboarding.reveal.saved` | Your page is saved as a draft. Publishing unlocks after approval. | Votre page est enregistrée en brouillon. La publication s'ouvre après validation. | تم حفظ صفحتك كمسودة. يصبح النشر متاحًا بعد الموافقة. |
| `onboarding.contact.title` | Where should customers reach you? | Où vos clients peuvent-ils vous joindre ? | أين يتواصل معك الزبناء؟ |
| `onboarding.contact.use_phone` | Use my number {phone} for WhatsApp orders | Utiliser mon numéro {phone} pour les commandes WhatsApp | استعمل رقمي {phone} لطلبات واتساب |
| `onboarding.fee_note` | Add delivery fees in Checkout & delivery when you know them. | Ajoutez vos frais de livraison dans Commande et livraison quand vous les connaissez. | أضف ثمن التوصيل في «الطلب والتوصيل» عندما تعرفه. |
| `team.invite.wa_text` | You're invited to join {store} on Store Gen: {url} | Vous êtes invité à rejoindre {store} sur Store Gen : {url} | أنت مدعو للانضمام إلى {store} على Store Gen: {url} |
| `team.invite.bound_to` | Only {email} can use this link. | Seul {email} peut utiliser ce lien. | هذا الرابط صالح فقط لـ {email}. |
| `team.invite.invalid` | This invitation link is no longer valid. Ask for a new one. | Ce lien d'invitation n'est plus valide. Demandez-en un nouveau. | رابط الدعوة هذا لم يعد صالحًا. اطلب رابطًا جديدًا. |
| `team.joined` | Welcome to {store}. | Bienvenue dans {store}. | مرحبًا بك في {store}. |
| `team.last_owner` | A store always needs at least one owner. | Une boutique doit toujours avoir au moins un propriétaire. | يجب أن يكون للمتجر مالك واحد على الأقل. |
| `team.pending_cap` | While your store is in review you can add one teammate. | Pendant la vérification, vous pouvez ajouter un seul coéquipier. | أثناء مراجعة متجرك يمكنك إضافة عضو واحد فقط إلى الفريق. |
| `team.role.manager.line` | Leads the call center: assigns orders and follows every agent. | Dirige le centre d'appels : attribue les commandes et suit chaque agent. | يدير مركز الاتصال: يوزّع الطلبات ويتابع كل الوكلاء. |
| `team.role.agent.line` | Confirms the orders in their own queue. | Confirme les commandes de sa propre file. | يؤكّد الطلبات الموجودة في قائمته فقط. |
| `team.role.viewer.line` | Sees pages and media, no customer data. | Voit les pages et les médias, sans données clients. | يطّلع على الصفحات والوسائط دون بيانات الزبناء. |
| `shell.status.pending` | In review | En vérification | قيد المراجعة |
| `shell.status.restricted` | Restricted | Restreinte | مقيّد |
| `shell.status.suspended` | Suspended | Suspendue | موقوف |
| `shell.review.title` | Your store is in review | Votre boutique est en cours de vérification | متجرك قيد المراجعة |
| `shell.review.works_now` | Works now: build pages, preview them, upload photos (up to 100 MB) and invite one teammate. | Déjà possible : créer et prévisualiser vos pages, importer des photos (jusqu'à 100 Mo) et inviter un coéquipier. | متاح الآن: إنشاء الصفحات ومعاينتها، رفع الصور (حتى 100 ميغابايت) ودعوة عضو واحد. |
| `shell.review.after` | Unlocks after approval: publishing, orders, Google Sheets, pixels, Telegram and PHP export. | Après validation : publication, commandes, Google Sheets, pixels, Telegram et export PHP. | بعد الموافقة: النشر، الطلبات، Google Sheets، البيكسلات، تيليغرام وتصدير PHP. |
| `shell.review.submit` | Submit for review | Envoyer pour vérification | أرسل للمراجعة |
| `shell.review.submitted` | Submitted. We'll tell you here when it's done. | Envoyé. Nous vous préviendrons ici dès que c'est fait. | تم الإرسال. سنخبرك هنا فور الانتهاء. |
| `shell.review.sla.other` | Usually within {hours} hours. | Généralement sous {hours} heures. | عادةً خلال {hours} ساعة. |
| `shell.review.approved` | You're approved. Your store can now publish and take orders. | Votre boutique est validée. Vous pouvez publier et recevoir des commandes. | تمت الموافقة على متجرك. يمكنك الآن النشر واستقبال الطلبات. |
| `shell.review.needs_info` | Store Gen has a question for you | Store Gen a une question pour vous | لدى Store Gen سؤال لك |
| `shell.locked.after_approval` | Unlocks after approval | Disponible après validation | متاح بعد الموافقة |
| `shell.banner.restricted` | Orders are paused: {reason}. Your pages stay online. | Les commandes sont en pause : {reason}. Vos pages restent en ligne. | الطلبات متوقفة مؤقتًا: {reason}. صفحاتك تبقى منشورة. |
| `shell.banner.suspended` | Your store is suspended: {reason}. You can still read and export your data. | Votre boutique est suspendue : {reason}. Vous pouvez toujours consulter et exporter vos données. | تم إيقاف متجرك: {reason}. لا يزال بإمكانك الاطلاع على بياناتك وتصديرها. |
| `shell.banner.closed` | Closed on {date}. You can reopen it until {until}. | Fermée le {date}. Vous pouvez la rouvrir jusqu'au {until}. | أُغلق المتجر يوم {date}. يمكنك إعادة فتحه حتى {until}. |
| `shell.page.rejected` | Your application wasn't approved | Votre demande n'a pas été acceptée | لم تتم الموافقة على طلبك |
| `shell.rejected.brand_impersonation` | The store name or address uses a brand that isn't yours. | Le nom ou l'adresse de la boutique utilise une marque qui ne vous appartient pas. | اسم المتجر أو عنوانه يستعمل علامة تجارية ليست لك. |
| `shell.rejected.prohibited_goods` | These products aren't allowed on Store Gen. | Ces produits ne sont pas autorisés sur Store Gen. | هذه المنتجات غير مسموح بها على Store Gen. |
| `shell.rejected.incomplete` | We need more information about your business. | Il nous faut plus d'informations sur votre activité. | نحتاج إلى معلومات أكثر عن نشاطك التجاري. |
| `shell.appeal.send` | Send an appeal | Faire appel | أرسل طلب إعادة النظر |
| `shell.kill.publishing_enabled` | Publishing is paused for maintenance. Orders keep working. | La publication est en pause pour maintenance. Les commandes continuent. | النشر متوقف مؤقتًا للصيانة. الطلبات تستمر بشكل عادي. |
| `shell.kill.platform_read_only` | Store Gen is in maintenance: the dashboard is read-only. Orders keep coming in. | Store Gen est en maintenance : le tableau de bord est en lecture seule. Les commandes continuent d'arriver. | Store Gen في وضع الصيانة: لوحة التحكم للقراءة فقط. الطلبات تستمر في الوصول. |
| `shell.impersonation.write_refused` | Read-only while Store Gen support is viewing. | Lecture seule pendant la consultation du support Store Gen. | للقراءة فقط أثناء اطّلاع دعم Store Gen. |
| `shell.limit.media_bytes.title` | Media storage is full | L'espace médias est plein | مساحة الوسائط ممتلئة |
| `shell.limit.ask_more` | Ask for more | Demander plus | اطلب المزيد |
| `shell.limit.ask_owner` | Ask your store owner | Demandez au propriétaire de la boutique | اطلب ذلك من صاحب المتجر |
| `shell.limit.reason.plan` | Your plan doesn't include this yet. | Votre formule ne l'inclut pas encore. | باقتك لا تتضمن هذا بعد. |
| `shell.limit.reason.kill` | Paused by Store Gen for maintenance. | Mis en pause par Store Gen pour maintenance. | أوقفه Store Gen مؤقتًا للصيانة. |
| `shell.err.forbidden` | Your role can't do this. Ask an owner or an admin. | Votre rôle ne permet pas cette action. Demandez à un propriétaire ou à un administrateur. | دورك لا يسمح بهذا الإجراء. اطلبه من المالك أو المسؤول. |
| `shell.err.not_found` | This item no longer exists. | Cet élément n'existe plus. | هذا العنصر لم يعد موجودًا. |
| `shell.err.rate_limited` | Too many tries. Wait a minute. | Trop d'essais. Patientez une minute. | محاولات كثيرة. انتظر دقيقة. |
| `shell.err.generic` | Something went wrong. Reference {ref}. | Une erreur est survenue. Référence {ref}. | حدث خطأ ما. المرجع {ref}. |
| `shell.notifications.empty` | Nothing new. Orders, team changes and review updates appear here. | Rien de nouveau. Les commandes, l'équipe et la vérification apparaissent ici. | لا جديد. تظهر هنا الطلبات وتغييرات الفريق ومستجدات المراجعة. |
| `shell.help.wa_prefill` | Hello Store Gen support, store @{handle}, screen {path}, version {build}. | Bonjour le support Store Gen, boutique @{handle}, écran {path}, version {build}. | مرحبًا دعم Store Gen، المتجر @{handle}، الصفحة {path}، الإصدار {build}. |
| `shell.picker.title` | Choose a store | Choisissez une boutique | اختر متجرًا |
| `shell.picker.create` | Create a store | Créer une boutique | أنشئ متجرًا |
| `shell.legal.reaccept_title` | We updated the {document} | Nous avons mis à jour {document} | قمنا بتحديث {document} |
| `shell.legal.accept` | I accept | J'accepte | أوافق |
| `shell.install.cta` | Install the app | Installer l'application | ثبّت التطبيق |
| `notify.signup.approved.title` | Your store is approved | Votre boutique est validée | تمت الموافقة على متجرك |
| `notify.signup.info_requested.title` | Store Gen has a question about your store | Store Gen a une question sur votre boutique | لدى Store Gen سؤال حول متجرك |
| `notify.store.impersonation_started.title` | Store Gen support viewed your store | Le support Store Gen a consulté votre boutique | اطّلع دعم Store Gen على متجرك |
| `notify.store.impersonation_started.body` | Reason: {reason}. From {from} to {to}. Read-only. | Motif : {reason}. De {from} à {to}. En lecture seule. | السبب: {reason}. من {from} إلى {to}. للقراءة فقط. |
| `notify.quota.80.title` | {metric} is {percent} % full | {metric} est rempli à {percent} % | {metric} ممتلئ بنسبة {percent}% |
| `notify.invite.accepted.title` | {name} joined your team as {role} | {name} a rejoint votre équipe ({role}) | انضمّ {name} إلى فريقك ({role}) |
| `notify.request.answered.title` | Your request was answered | Votre demande a reçu une réponse | تم الرد على طلبك |

### PLA-§N.4 Console reference texts (en, R1)

| Key | Text |
|---|---|
| `console.badge` | Platform |
| `console.risk.disposable_email` | The e-mail domain {domain} gives out throwaway addresses. |
| `console.risk.no_mx` / `null_mx` | The e-mail domain {domain} can't receive mail. / The e-mail domain {domain} says it accepts no mail. |
| `console.risk.mx_unknown` | The mail check for {domain} timed out. |
| `console.risk.brand_exact` | The {field} matches the protected name "{term}". |
| `console.risk.brand_near` | The {field} contains the protected name "{term}". |
| `console.risk.offensive_term` | The {field} contains a blocked word. |
| `console.risk.dup_email_norm` | The same e-mail, written differently, belongs to {users} other account(s). |
| `console.risk.dup_phone` | This phone is used by {users} other account(s). |
| `console.risk.dup_network` | {users} other sign-ups came from the same network today. |
| `console.risk.dup_device` | This browser was used by {users} other account(s). |
| `console.risk.linked_banned` | Linked to {banned} banned account(s). |
| `console.risk.velocity_network` | More than 3 sign-ups from this network today. |
| `console.risk.turnstile_missing` / `turnstile_unverified` | No human check was completed. / The human check failed. |
| `console.risk.too_fast` / `fast` | Both steps were filled in {ms} ms. |
| `console.risk.bot_ua` / `no_ua` | The browser looks automated ({uaLabel}). / No browser information was sent. |
| `console.risk.phone_market_mismatch` | Phone from {phoneCountry}, store market {market}. |
| `console.risk.market_not_allowed` | Market {market} isn't open; the form was bypassed. |
| `console.risk.invite_code` / `trusted_creator` | Used the invite code "{label}". / Created by a trusted seller. |
| `console.plans.take_orders_locked` | Orders are never blocked by a plan. |
| `console.signup.open_warning` | Open mode approves low-risk stores without a person looking. Keep it off until the score has been checked on real sign-ups. |
| `console.invite.share_text` | Your Store Gen invite code: {code}. Sign up at {url} |
| `console.reset.wa_text` | Your Store Gen password reset link (valid 60 minutes): {url} |
| `console.attention.sheets_backlog` | Sheets is {minutes} min behind |
| `console.attention.no_tick` | The 5-minute job hasn't run for {minutes} min |
| `console.kill.platform_read_only.effect` | Every dashboard becomes read-only. Orders, leads and Sheets keep flowing. |

---

## PLA-§O. Tests

### PLA-§O.1 `npm test` (offline, no DB)

| Script | File | Owner | Checks |
|---|---|---|---|
| `test:platform` | `src/lib/platform/selftest.ts` | P1 | **scoreSignup golden fixtures** (≥ 30, injected `SignupRiskDeps`, no network): clean Gmail sign-up → 0 / `fast`; disposable domain → 35; null MX → 25; MX timeout → `partial`, 0 points; `face-b00k-shop` handle → `brand_exact` (`brandTokens`); "Banque Populaire Store" → `brand_exact` kind bank; Arabic name with tatweel matching an Arabic term; Gmail dot / plus variant → `dup_email_norm`; phone shared by 3 users → +40 cap; banned link → `reject_candidate` whatever the score; 3 s form → `too_fast`; bot UA; market not allowed; invite code −20; trusted creator −30 and clamp at 0; weights override from settings; thresholds order refusal. `bandFor` table; `autoApprove` truth table per mode (incl. `turnstile: "off"` refused in `open`); `HOLD_CLASS` members. `normalizeEmailForIdentity`, every `mask*` function (incl. short names, IPv6), `computeHealth` fixtures per flag + the monotonic property (random removal of flags never lowers the score, 1,000 cases with a seeded RNG), milestones, `flagValue` order and rollout stability, `renderMarkdownLite` escaping (`<script>`, `javascript:` links, nested emphasis), cursor tamper → `null`, every reason code has `console.reason.*` and `shell.status_reason.*` keys, every tenant notification kind has ar/fr/en keys with the same placeholders, `roleSummary` agrees with `can()` for every role, `PlatformSettingSchema` / `OnboardingSchema` defaults parse `{}` |
| `test:i18n-coverage` | `scripts/qa/i18n-coverage.ts` | P2 | ar, fr and en complete for `auth.`, `onboarding.`, `team.`, `shell.` and the tenant `notify.` kinds; placeholder sets identical; Arabic plural categories present for count keys; no em-dash, no "Step n" in UI strings; prints the coverage per prefix (UX-08 report) |
| `test:admin-tokens` | `scripts/qa/admin-tokens-check.ts` | P2 | the console block, the violet ribbon, the crimson break-glass ribbon (R3) and the monogram tint outside 25-75° (chroma > 0.06) |
| `test:permissions` (core) | `src/lib/auth/selftest-permissions.ts` | maintainer | gains `orders.lookup`, `stores.create`, `abuse.handle` (PLA-§Q.5) in the platform matrix |

### PLA-§O.2 DB-backed (`npm run test:db`, `cod_test_*` only)

`scripts/qa/platform-check.ts` (P1): seeds 3 stores (+ a 2,000-store / 1,000,000-order performance fixture behind
`--perf`), staff of each role, and runs:
1. Queue: two parallel approvals of one row → exactly one `approved`, the other `already_decided`; bulk approve skips
   rows outside the fast lane; `needs_info` → answer → back in Review; one appeal only; snooze re-entry by time.
2. Requests: one open request per kind and store; `s:<sid>:request` limit; resolve grant applies the plan / boost.
3. Platform requests: a four-eyes purge can't be confirmed by its requester (SQL refusal); delayed purge executes
   after 24 h on a fake clock; expiry after 7 days; a purge request on an `active` store is refused.
4. Plans: `previewPlanChange` counts on seeded usage; saving invalidates entitlements of every store on the plan;
   `take_orders` false refused in plans and overrides; boost expiry ignored and cleaned up after 30 days.
5. Health: the job computes the expected flags for fixture stores; dirty stores first; milestones written once;
   `quota.80` notification deduplicated per period.
6. Notifications: an agent can't read `store_role` owner rows; staff `minRole` filtering; 50 parallel batched inserts
   → one row with count 50; mark-all-read.
7. Staff: an invited staff member can't pass `requirePlatform` before TOTP; the last super_admin can't be demoted;
   a promotion to super_admin with two super_admins needs the other's confirmation.
8. Legal: publishing an unreviewed version needs the acknowledgement; signup with no published ToS records only the
   published kinds; re-acceptance flag computed per user.
9. Impersonation from the console: start refused for a member staff and for `scheduled_deletion`; second start ends
   the first.
10. Query plans: `EXPLAIN` of every §M.4 query (no `type = ALL` on tables > 10,000 rows); `--perf`: stores list
    ≤ 300 ms p95, overview ≤ 800 ms p95.

### PLA-§O.3 Attack cases added to `scripts/qa/tenancy-check.ts` (TN-10)

Canaries seeded in store A: customer phone `+212600000777`, name `Canaryname Zzz`, address `Rue Canary 77`, order
note `canary-note-77`, seller e-mail `canary.seller@example.test`. Cases:
1. For a support and an analyst session, the HTML **and** the RSC payload of every console route that shows store A
   (overview, queue, stores list, every profile tab, people, order lookup, search JSON) contain none of the customer
   canaries, and the seller e-mail only masked.
2. Analyst: notes tab and note actions → `forbidden`; `revealOrderPiiAction` → `forbidden`; phone lookup →
   `forbidden`; aggregates under `k` suppressed.
3. Support: `startImpersonationAction` without `ticketRef` → refused; lifecycle actions → `forbidden`.
4. A tenant owner session calling every exported console action → `not_found` / `forbidden`, no row changed.
5. `createStoreRequestAction`, `submitForReviewAction`, `answerReviewQuestionAction`, `submitAppealAction` as a member
   of store B posted to store A's path → `not_found`; an appeal for a store that is not `rejected` → refused.
6. `GET /api/app/<A>/pulse` and `/search` with B's session → the neutral 404; A's order id searched from B → no result.
7. Console media proxy and export download with a tampered signature, another staff member's signature or no step-up
   → 404 / `step_up`.
8. `store_health`, `notifications.vars`, `signup_reviews.signals` and `job_runs.summary` written by this part contain
   no canary (scan after a full job run).

### PLA-§O.4 HTTP / e2e (`npm run test:e2e`, production build on 3451+, Playwright `channel: "msedge"`)

1. **Approval flow**: invite-mode signup on a 390 px viewport → pending store → console keyboard triage (`J`, `A`) →
   the seller's dashboard unlocks within one pulse (≤ 15 s) without a reload.
2. **Onboarding timing** (UX-01 AC): 3 photos, 4× CPU throttle, Cloud AI off, empty model cache → `revealMs ≤ 90,000`;
   "Start without photos" → ≤ 15 s; the typed price is the only price on the generated draft.
3. **Impersonation**: start (30 min) → the ribbon and countdown render → a save attempt toasts and the server refuses →
   End → the profile Activity lists the session; the store's notification exists.
4. **Kill switches**: `publishing_enabled` off → the tenant banner within 45 s and publish → limit sheet (kill);
   `platform_read_only` on → dashboard writes refused, a public order still accepted and pushed to the Sheets queue.
5. **Invites**: every state of §22.1.4 (match, other account, new account, expired); the QR encodes the link.
6. **Screenshots**: every PLA tenant screen at 1280 and 360 px in en and ar (RTL), and the console queue, overview and
   profile at 1280 / 360, through `qa/admin-visual/shoot.mjs`; `--scan-only` no-orange scan green.
7. **PWA**: `/app/manifest.webmanifest` valid JSON with `scope "/app/"`, icons reachable, `navigator.serviceWorker`
   has no registration (R1).
8. **Headers**: `scripts/qa/headers-check.ts` cases for `/api/admin/*`, `/api/app/<h>/pulse`, `/api/app/<h>/search`, the
   manifest and `/invite/staff/<token>` (`no-referrer`, `noindex`).
9. **Release check (manual, R1 exit)**: a native Darija/Arabic speaker and a French speaker review every R1 tenant
   string in the screenshots of step 6; findings fixed before the R1 deploy.

### PLA-§O.5 The wow demo (rethink-features §4) parts owned here

Clock 0:00-0:50 (signup, mode cards, photos, handle and address preview, reveal) and 1:25 (the console row with score,
flags and draft thumbnail, approval with `A`, the in-app notice within one pulse) must pass with this part's code; the
rest belongs to P3-P6.

---

## PLA-§P. File ownership (consistent with core §K.2, §K.3)

### PLA-§P.1 P1 CONSOLE (R1)

- `src/app/admin/(console)/**` (every page, layout and `actions.ts` of PLA-§4.1 and PLA-§M.1); `src/app/admin/page.tsx`
  (deleted); not `src/app/admin/(auth)/setup/**` (T2 / maintainer) and not `src/app/admin/ai/**` (P7).
- `src/app/api/admin/**` (PLA-§M.2).
- `src/app/(public)/invite/staff/**` (PLA-§Q.12).
- `src/lib/platform/**` except `seam.ts`, `impersonation.ts` (maintainer) and `health.ts` (P8): `types.ts`,
  `signup-risk.ts`, `normalize.ts`, `mask.ts`, `queue.ts`, `requests.ts`, `platform-requests.ts`, `stores-list.ts`,
  `profile/**`, `people.ts`, `order-lookup.ts`, `plans.ts`, `flags.ts`, `notify.ts`, `notify-kinds.ts`,
  `health-score.ts`, `health-snapshot.ts`, `alarms.ts`, `notes.ts`, `legal.ts`, `staff.ts`, `reasons.ts`, `cursor.ts`,
  `markdown-lite.ts`, `domain-move.ts`, `selftest.ts`, `data/**` (`disposable-domains.json`, `protected-brands.ts`
  after R1.0, `legal/**`).
- `src/components/console/**`.
- Extension files: `src/lib/settings/keys/platform.ts`, `src/lib/jobs/tracks/platform.ts`,
  `src/lib/i18n/admin/<locale>/{console,notify}.ts`, `src/lib/notify/kinds/platform.ts` (PLA-§Q.15),
  `src/lib/flags/defs/platform.ts` (PLA-§Q.16).
- `scripts/qa/platform-check.ts`, `scripts/platform/refresh-disposable.mjs` (manual refresh of the CC0 list, prints the
  diff; never run at runtime).

### PLA-§P.2 P2 SHELL (R1)

- Core §K.2 list: `src/components/admin/{shell,common,dashboard}/**` (except other tracks' nav and command files),
  `src/app/app/new/**`, `src/app/app/[store]/{layout.tsx, page.tsx, notifications/**,
  settings/{general,market,plan,address,security,danger}/**}`, `src/app/globals.css`, `scripts/build-admin-css.mjs`,
  `src/lib/admin-theme/**`, `src/lib/i18n/**` (base files + `shell.ts`), `scripts/qa/admin-tokens-check.ts`,
  `src/lib/tenancy/handles.ts` (rename), `src/lib/admin-data/{dashboard.ts, search.ts}`.
- Added by PLA-§Q.12: `src/app/(public)/**` (except `invite/staff/**`), `src/app/app/{page.tsx, actions.ts,
  account/**, manifest.webmanifest/**}`, the metadata of `src/app/app/layout.tsx`, `src/app/app/[store]/{welcome/**,
  team/**, review-actions.ts}`, `src/app/api/app/[store]/{pulse,search}/**`,
  `src/components/admin/settings/{team-panel,security-panel}.tsx`.
- New in this part: `src/lib/i18n/admin/<locale>/{auth,onboarding,team}.ts`, `src/lib/settings/keys/onboarding.ts`,
  `scripts/qa/i18n-coverage.ts`, `scripts/build-app-icons.mjs`, `public/icons/**`,
  `src/components/admin/shell/commands/shell.ts` (PLA-§Q.17).

### PLA-§P.3 D5 PLATFORM (R3)

`src/lib/platform/{grants,abuse,transfer,support,broadcasts,analytics,push}/**`,
`src/app/admin/(console)/{inbox,broadcasts,analytics,abuse}/**`, the R3 additions to P2's
`settings/{security,danger}` pages (taken over at the R3 contract step), `/report/<handle>` and `/app/sw.js` routes
(through the core's R3 contract step), `support_macros` / `push_subscriptions` code.

### PLA-§P.4 Read-only dependencies (called, never edited)

Core seam and registries (`src/lib/tenancy/{types,seam,public}.ts`, `src/lib/platform/{seam,impersonation}.ts`,
`src/lib/auth/permissions.ts`), T1 (`entitlements.ts`, `usage.ts`, `lifecycle.ts`, `audit.ts`, `settings/index.ts`),
T2 auth functions (PLA-§Q.19), P4 order read APIs, P5 `integrationHealth`, P6 reveal and generator, P7 AI hooks and
`aiUsageForStore`, P8 (`getHealth`, outbox `replay`, `enqueueRenders`, exports, backups, storage driver), T4
`admin-data/pages.ts`.

---

## PLA-§Q. Requests to the core

Each request names the exact change; nothing here is edited by this part. Migration placement: R1 items go into
`0005_r1.sql` unless step C0 has not been cut yet (then `0004_tenancy.sql`); R2 into `0006`, R3 into `0007`.

| # | Request | Exact change | Why | R |
|---|---|---|---|---|
| Q.1 | New table `store_health` (P*, owner platform) | `store_id varchar(26) PK FK→stores RESTRICT`, `score tinyint NOT NULL`, `attention tinyint NOT NULL DEFAULT 0`, `flags longtext NOT NULL`, `components longtext NOT NULL`, `metrics longtext NOT NULL`, `milestones longtext NULL`, `dormant bool NOT NULL DEFAULT 0`, `computed_at datetime(3) NOT NULL`, `dirty_at datetime(3) NULL`; indexes `sh_attention_idx (attention, score)`, `sh_due_idx (dirty_at, computed_at)`; registry row "0005 · store_health · P* · platform · health snapshot"; purge order: deleted with the store (§F.9 list) | PD6, PLA-§6.3 | R1 |
| Q.2 | New table `platform_requests` (P opt. store, owner platform) | exactly the PLA-§2.2 definition (`kind enum('store_purge','staff_super_admin')`, `mode enum('four_eyes','delayed')`, status, requester / confirmer / canceller columns, `execute_after`, indexes `preq_due_idx`, `preq_store_idx`); kept after purge for 400 days like audit | PD7: core §A.5.1 needs a durable "second person or 24 h" state | R1 |
| Q.3 | Device marker for the `device` identity link | T2: set `__Host-sgd` (128-bit random, base64url, HttpOnly, Secure, SameSite=Lax, Path=/, 400 days, platform host only) on `/login`, `/signup`, `/invite/*` responses when absent; pass it as `SignupRiskInput.deviceId`; write `identity_links` `device` and `net` rows on signup (`source='signup'`) and on each login (`source='login'`, `INSERT IGNORE`, ≤ 20 per user and kind) | PD12; core §D.4 defines the kind but nothing produces it | R1 |
| Q.4 | Staff invites | New table `staff_invites` (P): `id`, `email_norm varchar(191)`, `role enum('admin','support','analyst')`, `token_hash char(64) UNIQUE`, `invited_by`, `note varchar(200)`, `expires_at`, `accepted_at`, `accepted_by`, `revoked_at`, `created_at`; route `src/app/(public)/invite/staff/[token]/page.tsx` owned by P1; `src/lib/edge/areas.ts` classifies `/invite/staff/*` as area `auth` (nonce CSP, `Referrer-Policy: no-referrer`, `noindex`) | PD13: signup always creates a store; staff must not own a sandbox store | R1 |
| Q.5 | Platform permission keys | Add to `PLATFORM_PERMISSIONS`: `orders.lookup` (super_admin, admin; no ↑), `stores.create` (super_admin; no ↑), `abuse.handle` (super_admin, admin, support; R3). Update the core §A.3.3 table and `test:permissions` | PD14, PLA-§6.2, PLA-§24.2 | R1 / R3 |
| Q.6 | Preview token minting | `src/lib/render/preview-token.ts` (maintainer or T3 successor): `mintPreviewToken(scope: StoreScope, input: { pageId: string; ttlSec: number /* ≤ 259200 */; audience: "staff" \| "seller"; staffUserId?: string }): Promise<{ url: string; expiresAt: Date }>`; the token is sealed with the platform envelope (purpose `preview:v1`) so it reveals no ids; `/preview/<token>` verifies expiry and audience and renders the latest draft (or the published version), `noindex`, `private, no-store`, the stored hash CSP; accepted scopes: member and platform | PD16, PLA-§22.7; core D20 has the route but no minting API | R1 |
| Q.7 | Store setting key `onboarding` | Register `onboarding` (level S, no secret) in `src/lib/settings/store-registry.ts` with the extension file `src/lib/settings/keys/onboarding.ts` owned by P2 (schema PLA-§2.4) | PD28 | R1 |
| Q.8 | Pending caps from the platform setting | `applyStateCap` reads `platform.signup.pendingMediaMiB` (× MiB) and `platform.signup.pendingMembersMax` (cached platform setting) instead of the constants 100 MiB and 2 in core §A.5.2; defaults equal today's constants | PLA-§2.4; the owner tunes the sandbox without a deploy | R1 |
| Q.9 | `scoreSignup` contract and auto-approval | Widen the frozen stub to `scoreSignup(input: SignupRiskInput, deps?: Partial<SignupRiskDeps>): Promise<SignupScore>` (PLA-§3.4; the R1.0 stub returns `{ score: 0, flags: [], band: "review", signals: { v: 1, flags: [], band: "review", inputs, cluster: { users: 0, banned: 0, kinds: [] }, partial: false, ms: 0 } }`); `signupAction` and the `/app/new` action pass the full input (incl. `formMs`, `deviceId`, Turnstile state, `via`, invite label) and store `score`, `band`, `signals`; the store starts `active` only when `autoApprove(mode, score, { trustedCreator, setting })` is true or the invite has `auto_approve`; auto paths write the review row `approved` with `reason_code` `auto_invite` / `auto_open` / `auto_trusted`. Core §B.2's `open` line ("a score < fastLaneMax auto-approves") becomes "per `autoApprove()`" | PD3, PD31, PLA-§3.4.1 | R1 |
| Q.10 | Indexes for cross-store console reads | `orders_created_idx (created_at)` on `orders`; `cu_phone_idx (phone)` on `customers` (index only; the table stays operations-owned); `users_name_idx (name)` on `users` | PD37, PLA-§11, PLA-§M.4 | R1 |
| Q.11 | Read APIs the console and the health job call, frozen as typed stubs at P0 | **P4**: `orderKpis(scope, range: { from: Date; to: Date }): Promise<OrderKpis>` (placed, confirmed, cancelled, fake, open counts; placed and confirmed minor units; daily series; delivered from R2), `listOrdersForConsole(scope, q: { cursor?: string; status?: string[]; riskMin?: number; from?: Date; to?: Date; pageId?: string; limit: number }): Promise<{ rows: ConsoleOrderRow[]; next: string \| null }>`, `getOrderForConsole(scope, orderId)`, `recordPlatformReveal(scope, orderId, staff: { userId: string; reason: string })` (writes `order_events` `phone_revealed`, `actor_kind 'platform'`), `orderRiskMix(scope, days)`, `searchOrders(scope, q, viewer: { userId; role })` (tenant ⌘K, agent-scoped), `queueCounts(scope)` (pulse). **P5**: `integrationHealth(scope): Promise<IntegrationHealth>` and `sheetsBacklog(scope): Promise<{ pending: number; oldestMin: number \| null; lastRunFailedAt: Date \| null }>`. **P7**: `aiUsageForStore(scope, month: string): Promise<AiUsageSummary>` (metadata only). **T2**: `listMembersByScope(scope)`, `listInvitesByScope(scope)` (masked e-mails). **T4 / maintainer**: `listPagesForConsole(scope)` in `src/lib/admin-data/pages.ts`. **T3**: `getPageStats(scope, range)` as already listed in core §K.1 | PLA-§7, PLA-§6.3; the console reads one store only through the normal repositories (core §E.3 rule 6) | R1 |
| Q.12 | File ownership in the R1 product phase | To **P2**: `src/app/(public)/**` except `invite/staff/**`; `src/app/app/{page.tsx, actions.ts, account/**, manifest.webmanifest/**}`; the `metadata` export of `src/app/app/layout.tsx`; `src/app/app/[store]/{welcome/**, team/**, review-actions.ts}`; `src/app/api/app/[store]/{pulse,search}/**`; `src/components/admin/settings/{team-panel,security-panel}.tsx`. To **P1**: `src/app/(public)/invite/staff/**`; P1 deletes `src/app/admin/page.tsx`. Update core §K.2 rows P1 and P2 | PLA-§22, PD46; these R1.0 T2/T4 files have no R1 owner today | R1 |
| Q.13 | Legal seed reads platform-owned content | The boot task (core §H.4 step 5) reads `LEGAL_SEED_VERSION: number` and `LEGAL_SEED: { kind; locale; title; body; summary }[]` from `src/lib/platform/data/legal/index.ts`; inserts each as version 1 draft (`INSERT IGNORE` on `ld_kind_loc_ver_uq`, `needs_legal_review = 1`); marker `legal_seed_v<LEGAL_SEED_VERSION>`; R1.0 ships the file with `LEGAL_SEED_VERSION = 0` and `[]`; the file belongs to P1 from R1 | PD49 | R1 |
| Q.14 | Tenant pulse contract | Freeze `StorePulse` (PLA-§22.6) at P0; GET-only route with ETag / 304; contributors extension point `src/lib/pulse/contributors/<track>.ts` exporting `contribute(scope: StoreScope, viewer: { userId: string; role: StoreRole }): Promise<Record<string, number>>` (50 ms budget each, a failure omits its keys), imported by `src/lib/pulse/registry.ts` (maintainer). Core D46 references it | PD38, PL-02 unlock without reload | R1 |
| Q.15 | Notifications | (a) Freeze `notify()` and the read API of PLA-§18.1 at P0 (T2's R1.0 call sites keep compiling: same name, the R1.0 body becomes P1's); (b) kind registry extension point `src/lib/notify/kinds/<track>.ts` exporting `kinds: NotificationKindDef[]`, imported by `src/lib/notify/registry.ts` (maintainer); (c) the column `notifications.platform_min_role` (PLA-§2.1 refinement) noted in core §D.4 | PD11, PD50 | R1 |
| Q.16 | Flags | (a) Extension point `src/lib/flags/defs/<track>.ts` exporting `flags: FlagDef[]`, imported by `src/lib/flags/registry.ts` (maintainer), seeded at boot (`INSERT IGNORE`; flags missing from code marked `archived`); (b) T1 exports `invalidateFlags(): void` beside the kill-switch reader; (c) core §D.4's `FlagRule` type = PLA-§12.2's | PLA-§12.2; other tracks declare flags (e.g. ai.md `ai_director_brief`) | R1 |
| Q.17 | Tenant ⌘K commands | Extension point `src/components/admin/shell/commands/<track>.ts` exporting `commands: CommandDef[]` (type in `commands/types.ts`, registry `commands/index.ts`, both maintainer), the same pattern as nav files | PLA-§22.13; tracks add Sync Sheets, Export orders, Publish | R1 |
| Q.18 | Tick budget for platform jobs | Add slot 9 "`platform.*` (P1)" to core §H.2: `platform.health` + `platform.alarms` + `platform.requests` every tick with a guaranteed 3 s and up to 6 s of leftover; `platform.entitlements` hourly inside the same slot; trim `housekeeping` to 4 s if the 100 s sum requires it | PLA-§6.3, §8.1, §15.2 | R1 |
| Q.19 | T2 functions the console and the shell call | `banUser(ctx: PlatformCtx, userId, i: { reason: string; note?: string }): Promise<void>`, `unbanUser(ctx, userId, note?: string)`, `resetUserTwoFactor(ctx, userId, reason: string)`, `createPasswordResetLink(ctx, userId, reason: string): Promise<{ url: string; expiresAt: Date }>`, `revokeUserSessions(userId, opts?: { exceptSessionId?: string })`, `createAccount(i: { email; name; password; phone?: string; locale }): Promise<{ userId: string }>` (policy + scrypt semaphore; reused by staff invites), `leaveStore(ctx: StoreCtx): Promise<void>` (own membership; last owner refused; audit `store.member.removed` with `self: true`) | PLA-§11.2, §14.1, §22.4 | R1 |
| Q.20 | `support_macros` (0007, P) | the PLA-§2.3 row | PL-16 | R3 |
| Q.21 | Web Push | `push_subscriptions` (0007, PLA-§2.3); append `'push'` to `outbox.kind` (0007); register the encrypted platform setting `platform_push` (`{ vapidPublic, vapidPrivateEnc }`, scope platform, purpose `settings:platform_push`); `/app/sw.js` route with `Service-Worker-Allowed: /app/` | PLA-§23.2 | R3 |
| Q.22 | `notification_prefs` (0006, P) | the PLA-§2.3 row | PLA-§23.2, R2 e-mail channel | R2 |
| Q.23 | Audit action names | Append the PLA-§M.3 names to the `AuditAction` union in `src/lib/audit.ts` (autocomplete; the `(string & {})` fallback stays) and to core §F.5's list | consistency | R1 |
| Q.24 | Apply this part's refinements | Write the PLA-§2.1 column, enum and index refinements (incl. `signup_reviews.kind/status/band/request/submitted_at/staff_question/answered_at/blocked`, `sr_kind_queue_idx`, `sr_store_kind_idx`, `notifications.platform_min_role`, `nt_aud_idx`) into the migration per the placement rule above | core §D.9 lets platform.md refine these tables; the maintainer owns `schema.ts` and `drizzle/**` | R1 |
| Q.25 | P8 APIs used by the console | `getHealth()` gains `edge: { sMode; workerVersion: string \| null; lastEdgeAt: string \| null; prevKeyRequests24h: number; foreignHosts24h: number }`, `commerce: { lastOrderAt: string \| null; ordersPerHour24: number[] }`, `sheetsTop: { storeId; oldestMin }[]`; plus `requestStoreExport(scope, { requestedAs: "member" \| "platform"; requestedBy: string }): Promise<{ jobId: string }>`, `listExportJobs(scope)`, `exportPartStream(scope, jobId, part): Promise<ReadableStream \| null>`, `listBackupRuns(): Promise<BackupRunSummary[]>`, `backupFiles(day: string): Promise<{ name: string; path: string; bytes: number }[]>`, `outboxSummary(scope)`, `renderSummary(scope)` | PLA-§7.10, §7.13, §7.14, §15, §17 | R1 |
| Q.26 | Manifest headers through the proxy | `src/proxy.ts` treats `GET /app/manifest.webmanifest` as a non-HTML path of area `app`: no nonce headers, the handler's `Content-Type` and `Cache-Control` kept | PD46 | R1 |
| Q.27 | Lifecycle notifications | `transitionStore(ctx, storeId, to, { reason, note, notify })` sends the PLA-§18.2 kinds through `notify()` to owners and admins (`pending→active` `signup.approved`, `pending→rejected` `signup.rejected`, `→restricted` `store.restricted`, `→suspended` `store.suspended`, `restricted/suspended→active/restricted` `store.restored`, `→closed` `store.closed`, `closed→previous` `store.reopened`, `closed→scheduled_deletion` `store.deletion_scheduled`, `scheduled_deletion→closed` `store.deletion_cancelled`) with `vars: { reason }` and `text` = the staff note only when `notify.showNote` is true; callers never send a second notification | one notification per transition; core §A.5.1 says "writes … a notification" without naming kinds | R1 |
| Q.28 | R1.0 `platform` setting schema paths | The C0 minimal schema of the `platform` key uses exactly the PLA-§2.4 paths for the fields T1/T2 read in R1.0 (`brand.name`, `signup.mode`, `signup.allowedMarkets`, `newStore.*`, `allowSellerBrandOrange`, `reservedHandles`, `analytics.k`), so P1 widens the schema without renames or a data migration | PLA-§2.4 | R1.0 |
| Q.29 | Console route list | Core §I.2 adds `/admin/stores/new`, `/admin/notifications`, `/admin/settings/mail` (R2) and `/invite/staff/<token>` (core §B.1 surfaces table) | PLA-§4.1 | R1 |
| Q.30 | Extra reserved handles | `handleProblem()` (core §C.7) also refuses handles in `platform.reservedHandles` (cached 30 s) and `checkHandleAvailable()` answers `unavailable` for them; core §C.7 text updated | PLA-§13.1 | R1 |
| Q.31 | Impersonation rules in `startImpersonation` | `src/lib/platform/impersonation.ts` refuses a store the staff member is an active member of (`impersonation_member`), refuses `scheduled_deletion` / `purged` (`impersonation_state`), ends an active impersonation of the same session (`ended`) before starting, and enforces `ticketRef` for support (≤ 60 chars) | PD45, PLA-§10.1 | R1 |
| Q.32 | Step-up expiry in the context | `PlatformCtx` gains `stepUpUntil: Date \| null` (`step_up_at + 5 min`); `stepUpAction` returns `{ ok: true, until: string }` | the console "Verified · 4:12" chip (PLA-§4.2, §14.2) | R1 |

---

## PLA-§R. Review decisions

(Empty in revision 1. Filled after the reviews: each row = reviewer, point, decision, section changed.)
