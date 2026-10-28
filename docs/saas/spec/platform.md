# Store Gen SaaS part spec: platform console and the tenant SaaS layer

Status: **part spec, revision 6 (wording tidy)** (revision 6 fixes the confirming critic's wording minors that name this file, one line per item in **PLA-§R "Wording tidy (revision 6)"**; revision 5 integrated critic r2) (2026-10-24, platform part architect; revision 5 applies the
final critic's issues that name this file, CRIT2-6, CRIT2-13, CRIT2-14, CRIT2-18, CRIT2-19, listed in **PLA-§R "Critic
round 2 (revision 5)"**, against core revision 5; revision 4 integrated the round-2 review; revision 3
integrated the round-1 review, revision 2 was the elevated spec of the same day). Built on `docs/STORE-SAAS.md`
**revision 3** (cited as **core §X**, its decisions as **core D1 … D76**; core §P decides the round-1 findings and
core §Q.8 the third-round requests of PLA-§Q.3, all accepted, PLA Q3.4 with a change; **revision 4 aligns every
platform text with core revision 3** (the alignments are listed one by one in PLA-§R "Alignment with core revision 3")
and decides the round-2 findings one by one in **PLA-§R "Review decisions (round 2)"**, with the cross-file needs they
still raise in **PLA-§Q.4**; appendix core §Q.1 decides every request of revision 1: all 32 accepted, three with
changes, Q.1, Q.14 and Q.18, integrated below; the round-1 review findings that touch this part are decided one by
one in **PLA-§R** and the cross-file needs they raised are listed in **PLA-§Q.3**), on the settled research
decisions **R-D1 … R-D53** (`docs/saas/RESEARCH.md` §2) and on the elevation inputs of owner brief item 16:
`docs/saas/research/rethink-features.md` (cited as **RF §n**: the eight admin UX rules §2.1, the IA and interaction
model §2.2, empty states §2.4, data-viz §2.5, motion §2.6, the keep/rework/redesign table §2.9, the 13-screen build
order §2.10, Store Health §1.3, the catalog delta §3, the three-minute demo §4), `docs/saas/research/rethink-ai.md`
(**RA §n**: the job model under the 120 s cap §1.5, the store health report §4.8, the 17 changes §9),
`docs/saas/research/design-baseline.md` (**DB** target ids, used here for the admin's RTL and honesty rules:
RTL1-RTL8, D1, D2) and `qa/ref/anti-slop-frontend-rubric.md` (adopted for product UI where the owner rules do not
override it: §4.5-4.7 states, forms and layout discipline, §9 AI tells, §9.G the em-dash ban; its orange-family
palette suggestions are void and Arabic keeps its own type rules). Reviewed twice: the round-1 findings (OPS-*, ENGC-*,
ENGP-*, UX-*, SEC-*, QUAL-*) and the round-2 findings (the same ids re-checked against core revision 3, plus the
critic's CRIT-*) that name this file or are marked "cross" are each decided in PLA-§R with the section that changed;
every blocker and major with a platform side is resolved in the body, not only in a note. This document
is the contract for two R1 product tracks of core §K.2, **P1 CONSOLE** (the platform console on the main domain,
plus the Store Health engine and job of core §I.7) and **P2 SHELL** (the tenant-side SaaS UX, the pulse, the
dashboard and the tenant Store Health ring), plus the R3 track **D5 PLATFORM** for the later platform features. It
refines only the tables core §D.9 gives to platform.md, adds product behaviour, and never renames a table, changes a
`store_id` rule, changes a seam signature or moves a file between tracks. Where this document and an older doc
disagree, the core wins, then this document; where revision 1 of this document and core §Q.1 disagreed, core §Q.1
wins and **PLA-§S "Elevation changes (rev 2)"** records every alignment with its source.

Inputs: `docs/STORE-GEN-BRIEF.md` (owner items 1-16; item 16 = this elevation pass), `docs/HANDOFF.md` (owner rules
§2, Hostinger §4), `docs/saas/TENANCY-MAP.md` (item ids AUTH-xx, ADM-xx), `docs/saas/RESEARCH.md` (feature ids PL-,
TN-, UX-, SE-, OS-; signature features SF-01 … SF-12 from RF §1 and §3.1), `docs/saas/research/platform-admin.md`
(cited as **PA §n**), `docs/saas/research/ai.md` §10, `domains.md` §4.8. Format model: `docs/OFFERS.md`. Code facts
are `path:line` at commit `a0ffec1` (the revision 1 facts at `15c9cef` were re-verified on 2026-10-24 and still hold;
`HEAD` `ae4e6c0` changes only docs). Next.js 16.4 facts cite `node_modules/next/dist/docs/…`.

Reading order for a build agent: PLA-§0 (decisions) → PLA-§1 (feature map, find your ids incl. the SF-* rows) →
PLA-§P (file ownership: which files are yours) → the sections your files touch → PLA-§N (copy keys) → PLA-§O (tests
you must keep green) → PLA-§S (what revision 2 changed and why) → PLA-§Q (the status of every request; build against
the stubs core §K.2 P0 freezes).

Section map: §0 decisions · §1 feature map · §2 data · §3 signup + approval + `scoreSignup` + explainable risk ·
§4 console shell + the console UX ceiling · §5 overview · §6 stores list + the Store Health engine (shared with the
tenant ring) · §7 store profile (R1: Overview as the "every detail" view, Orders, Team, Activity, Usage & plan,
Notes) · §8 lifecycle actions + lifecycle safety · §9 plans + entitlements · §10 impersonation UX · §11 people +
orders lookup · §12 flags + kill switches · §13 platform settings + legal · §14 staff + 2FA + security centre ·
§15 system health incl. the Worker, the render queue and the health engine · §16 Domains view · §17 backups UI ·
§18 notifications · §19 announcements + in-app messages · §20 support · §21 platform analytics · §22 tenant SaaS UX
(auth pages, onboarding with the no-download critical path, picker + switcher, team + invites, notification centre +
the shared pulse, banners, limit sheet, plan page, danger zone, account, the Store Health ring, the dashboard, the
admin UX ceiling per screen) · §23 mobile admin + PWA · §24 later platform features (R3 and P2) · §L limits · §M
server actions and routes · §N copy keys · §O tests · §P file ownership · §Q requests to the core (status after core
rev 2; §Q.3 the requests raised by the round-1 review, all decided in core §Q.8; §Q.4 the requests raised by the
round-2 review) · §R review decisions (round 1 and round 2, one line per finding, plus the alignment with core
revision 3) · §S elevation changes (rev 2; §S.1 revision 3; §S.2 revision 4).

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
10. For sellers: a two-step sign-up, then a "wow" first minute: drop product photos, type the price while the designs
    are ranked from the photos and the category, and see three designed pages, each unlike the others. Then a
    dashboard with an "In review" card that says what is locked until you approve them.
11. Sellers switch between their shops, invite teammates with a one-time link (copy or WhatsApp), see a notification
    centre, use ⌘K, and get the dashboard as an app icon on their phone. Push notifications come in R3.
12. Everything a seller or agent reads in R1 exists in Arabic (Darija-friendly), French and English. Your console is in
    English first.
13. **New in revision 2.** Every shop and every seller sees the same **Store Health** number: one ring, five reasons
    in plain words with the number behind each ("Sheets is 22 minutes behind, n = 14 orders"), and one tap to fix
    each. It replaces the old setup checklist. You see the same ring in your stores list, with the flags that matter
    to you (quota, sync errors, risky orders, dormant). Fixing something never lowers the score and the score never
    blocks anything.
14. **Approvals explain themselves twice:** the risk reasons and what would change the verdict ("without the
    throwaway e-mail this would be low risk"), plus what the seller actually built (a page or not, its design check,
    anything invented). One key approves; the seller's dashboard unlocks within fifteen seconds without a reload.
15. **Dangerous buttons show their consequences first:** before you restrict, suspend or close a shop you read the
    exact sentence the seller will see, in their language, and how many live pages, open orders and agents are
    affected; the write happens only after a five-second cancel window.
16. **The shop profile's first tab shows every detail at once** (address, health, pages, orders, team, connections,
    AI use, usage, risk, timeline) with customer data masked; the deeper tabs for catalog, connections, domains, risk
    and media fill in with R2 so R1 ships on time.
17. **Health shows the machinery too:** the Cloudflare Worker, the page re-render queue, the AI provider and the
    health engine itself each have a panel and an alarm.
18. The seller's first result arrives without any AI download: the three designs are ranked from the category they
    tapped and the colours of their photos; the heavier models refine afterwards. The whole path from invite link to
    a confirmed test order is the three-minute demo you watch before R1 ships; this part owns the first fifty seconds
    and your one-key approval.
19. **New in revision 3 (after the first review).** Sign-ups cannot flood the machine: when anyone may sign up, the
    human check is required (not just scored), at most 50 sandboxes are created per day (the rest join the waitlist
    for that day), a sandbox gets 20 MB of photos until it is submitted for review and 100 MB after, all sandboxes
    together share one disk budget and one slice of the AI budget, so a thousand robots cannot fill the disk or spend
    the month's AI money.
20. **"View as shop" hides customers.** While you or support look at a shop, every customer name, address and note is
    masked the same way as in your console; the only way to read one customer is the per-order reveal with a reason
    and your code.
21. **Impersonating a bank is caught at every step, not only at sign-up.** Renaming a shop to a protected name is
    refused; a live page that carries a protected name raises an alarm; a "Report this store" link exists on every
    public page from day one (you triage reports in your console from R3, but the reports are stored from R1).
22. **The first design reveal shows three real pages side by side** (not one page inside a phone inside a phone), and
    a seller who chose "Full store" sees a product page and a store home, never a hidden landing page. The mode choice
    explains itself in one line and three bullets, and can be changed later without losing anything.
23. **New in revision 4 (after the second review).** The health score tells the truth about how fresh it is: the
    5-minute job checks about ten shops per run, a shop you or the seller just changed is checked first (within five
    minutes), and the others as often as the machine allows; the screens say "checked at 14:20", never "within an
    hour" when that would not hold. One problem gives one reason in the score, never two copies of the same thing.
24. **Sellers confirm dangerous steps too.** Exporting customer data, closing the shop, changing someone to admin or
    owner and pasting integration secrets ask the seller for their two-step code, or their password when they have no
    code. A seller who owns no shop can delete their account from Account settings; you can delete a person's account
    from their profile in the console (with your code and a reason).
25. **Every feature of this part names the test that proves it** in the feature list, so a builder can see which check
    must stay green; the "Report this store" link is the same absolute link on every landing page, legal page and
    shop page, and a shop's own address never serves the report form.

---

## PLA-§0. Decisions at a glance

R-D1 … R-D53 and core D1 … D76 are settled. Rows below are this part's own decisions; **deviates** / **refines** say
which settled decision changes and why. Rows changed or added in revision 2 carry **(rev 2)**, in revision 3 **(rev 3)**
and in revision 4 **(rev 4)**; PLA-§S, §S.1 and §S.2 list them with their sources.

| # | Decision | Why |
|---|---|---|
| PD1 | **One spec, two R1 tracks.** P1 builds PLA-§2-§21 (console, `src/lib/platform/**`); P2 builds PLA-§22-§23 (tenant UX). Shared UI primitives used by both (step-up sheet, typed-confirm dialog, usage meter, masked value, reason picker) live in P2's `src/components/admin/common/**` with the props frozen here (PLA-§22.12). | Core §K.2 splits the work that way; P2 merges before P1 (core merge order P8 → P2 → P1), so P1 imports finished primitives. |
| PD2 | **The console reads one store only through `src/lib/platform/profile/**` read functions** that take the `platformScope(ctx, storeId)` scope and return **masked projections**. Raw customer phone, name, address and note never leave those functions; the only unmasked path is `revealOrderPii` (`pii.reveal` ↑, reason). **(rev 4, core D71)** `platformScope()` returns `StoreScope & { kind: "platform" }`, which is a `ReadScope` and **not assignable to `WriteScope`**: no write repository compiles with it, so "staff never edit tenant data" (PD34) is a type fact, and the platform rows this part writes (reviews, notes, entitlements, flags, settings, `abuse_reports`) are platform tables outside the tenant set. | One choke point for R-D16 / core §F.11; the type (`StoreScope`) satisfies lint L1, and L6 (by type since core rev 3) keeps platform scopes away from write repositories. |
| PD3 | **`scoreSignup()`** = 0-100 with explainable flags (PLA-§3.4). Bands: `fast` ≤ 24, `review` 25-59, `hold` ≥ 60, `reject_candidate` ≥ 85 **or** linked to a banned user. Nothing is auto-rejected (R-D12). Mode `open` auto-approves only `fast` + Turnstile `ok` + no hold-class flag. Weights and thresholds are platform settings, starting values **[to tune]**. | PA §5.3 signals and points; the bands give the queue its triage order. |
| PD4 | **Signup stays one two-step form and one transaction (core §B.2 unchanged); the wow flow happens right after, at `/app/<h>/welcome`** (photos → details while the directions are ranked → reveal with 3 directions → contact → address card). **Refines UX-01**, which put photos before name and handle. **(rev 2)** The reveal budget is the demo clock (RF §4: reveal at 0:50 from the invite link, generation ≤ 1.5 s client-side, preview render ≤ 1 s), and nothing on that path waits for a model download (PD59, core D59). | The core transaction needs name, handle and mode; uploads need a store scope (media ids are per store, core D21); the pending sandbox allows building at once (R-D12). |
| PD5 | **The approval queue carries every staff decision about a store:** signups, appeals (`reopen`), restore requests (`go_live`), plan changes (`plan_change`), limit raises (`limit_raise`), store-mode interest (`mode_change`), custom domains (`domain`, R3). `signup_reviews.kind` is appended (core §D.9 lets this part refine the enum; applied in core §D.4). | One inbox and one SLA for the owner (PA §5.4: "the same queue later carries…"). |
| PD6 | **(rev 2) Store Health is one engine for two audiences (core D53, §I.7, SF-03):** one `store_health` row per store written only by the `platform.health` job (slot 9), read by the console ring and flags (PL-18) and by the tenant ring with reasoned fixes (P2, PLA-§22.16). P1 owns `src/lib/health/**` (engine, registry imports, job, console ring, the platform rules file); every track contributes rules in `src/lib/health/rules/<track>.ts`. **Deviates PL-18** (R3 console-only). Re-engagement messages for dormant stores stay R3. | PL-06 "needs attention" (R1) needs the flags; the seller needs the same number with fixes (RF §1.3); one computation means the two audiences never disagree (core D53). |
| PD7 | **Four-eyes purge and the 24 h single-super-admin delay are `platform_requests` rows** (core table of 0005, core §D.5; Q.2 accepted). The `platform.requests` job executes due requests. | Core §A.5.1 demands "two different staff, or one super_admin + 24 h", which needs a durable pending state that survives deploys and restarts. |
| PD8 | **Assigning a plan to a store needs `entitlements.override` (admin+); editing plan definitions needs `plans.manage` (super_admin).** `take_orders` is locked to `true` in every plan editor row. | Plan moves are daily ops; plan definitions change every store on them; orders are never blocked (R-D15, core D8). |
| PD9 | **Console copy is English in R1** (fr R2, ar R3, core D36). **Every tenant-facing string this part adds in R1 ships in ar, fr and en:** auth pages, onboarding, store picker and switcher, review card, lifecycle banners, limit sheet, plan page, team and invites, notification texts, impersonation notices, help sheet. | Staff read English; sellers and agents read Darija, Arabic and French (core D36). |
| PD10 | **Mobile in R1** = every PLA tenant screen and the console queue work at 360 px, plus an **installable dashboard manifest** scoped to `/app/` with **no service worker**. **R3** = a push-only service worker (no offline caching) and Web Push with hand-written VAPID + aes128gcm on `node:crypto`. **Deviates UX-07** (R3) for the manifest only. | Installability needs only a valid manifest and HTTPS (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:592-595`). Offline caches of dashboards risk stale customer data; `npm` installs are slow here (HANDOFF §3). |
| PD11 | **Notifications = one `notify(target, kind, vars, opts)` API with a typed kind catalog**; titles are rendered at read time in the reader's locale; staff free text only in `notifications.text`; `dedupeKey` batches noisy kinds. Broadcasts fan out lazily at read time (R3). | One catalog → one translation set; no per-user row explosion (PA §10.4). |
| PD12 | **A random device marker cookie `__Host-sgd`** (128-bit, HttpOnly, Secure, SameSite=Lax, 400 days, platform host only) feeds the `identity_links.kind = 'device'` signal (core §B.1 "Device marker", Q.3 accepted). **(rev 4, core §B.1 rev 3 / SEC-12)** The cookie is **set by T3's proxy** on every area-`auth` GET without it (a page response cannot set a cookie), `publicAction` sets it as a fallback, T2 only reads it and writes the `identity_links` rows; `scoreSignup` receives it as `deviceId`. | Core §D.4 has the `device` kind and the core now names its producer; a random marker is not fingerprinting (PA §2 "device labels without fingerprinting"). |
| PD13 | **Staff are added by a staff invite link** that creates (or binds) a user with **no store**; the platform role activates only once TOTP is enrolled (core §B.1 `/invite/staff/<token>`, §D.5 `staff_invites`; Q.4 accepted). | Signup always creates a store (core §B.2); staff should not own a sandbox store; core §B.7 makes 2FA mandatory for staff. |
| PD14 | **Cross-store phone lookup in the console is admin+ only** (key `orders.lookup`, core §A.3.3; Q.5 accepted), results masked, audited with the phone's HMAC. Order-id lookup is open to every console role. | "Which stores did this phone order from" is legitimate for abuse and support, and is still sensitive. |
| PD15 | **k-anonymity applies to the analyst role everywhere**, overview totals included: any aggregate over fewer than `k` stores (setting, default 5, minimum 5) is suppressed for analysts. | R-D16, PA §13; with 3 stores a "platform total" is one seller's numbers. |
| PD16 | **Console previews of tenant pages are sandboxed iframes on a signed `/preview/<token>` URL** minted for the staff member (10 minutes) through `mintPreviewToken(scope, { audience: "staff" })` (core §E.2, T3; Q.6 accepted), never inline HTML. | Core SE-05 / §I.2; a console XSS would expose every store. |
| PD17 | **Legal:** platform ToS, Privacy and AUP templates and the store templates live in code (`src/lib/platform/data/legal/**`), are seeded as drafts flagged `needs_legal_review`; publishing an unreviewed version needs an explicit owner acknowledgement; signup asks only for published kinds; a new version can require re-acceptance (a blocking sheet in the dashboard, never on public pages). **(rev 2)** The platform **DPA moves to R2** (RF §3.3, core §I.2, core §L.2 PL-14): the `dpa` kind stays in the enum, no R1 seed text. | Core D39, owner rule 4 (no invented claims); signup must not break while no document is published; a DPA needs a lawyer either way. |
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
| PD28 | **Onboarding progress lives in the store setting `onboarding`** (core §D.10; Q.7 accepted); reveal timing is recorded there, never sent to third-party analytics. | Resume after a closed tab; measure the "≤ 90 s to reveal" target honestly. |
| PD29 | **Kill-switch toggles preview the exact tenant banner and the number of affected stores before confirming**; `platform_read_only` can always be turned off (core §H.8 exempts `kill.manage`). | An incident tool must be impossible to misread. |
| PD30 | **R1 mode cards show "Full store" and "Both" as "Coming soon"** with an optional "Tell me when it's ready" that files a `mode_change` interest request. **(rev 2)** The cards are first-class in onboarding and in Settings → General; the R2 path for `store` / `both` is fixed now (PD60) so the screens need no redesign when the modes open. | Core §A.2 (only `landing` selectable in R1); honest UI that also measures demand for R2. |
| PD31 | **Trusted creators:** in `approval` mode, a new store (`/app/new`) of a user who owns an `active` store older than 30 days with no restriction in the last 90 days is auto-approved when its band is `fast` (setting `signup.trustedCreatorAutoApprove`, default on). | Keeps the queue for unknown sellers; flags still apply. |
| PD32 | **(rev 2) The store profile ships 6 tabs in R1** (Overview, Orders (masked), Team, Activity (with a Timeline view), Usage & plan, Notes) and the **Overview tab is the owner's "every detail" view**: ten detail strips (identity & address, health, pages, orders, team, integrations, AI, usage, risk, timeline), each a `<PanelBoundary>` over one P0 read API, each linking to its full tab when that tab exists. The full tabs **Catalog & pages, Integrations health, Domains, Risk, Media** arrive in R2 (S6), Ops in R2 (S6), Support in R3 (PL-16); until then the strip shows the R1 data and the line "Full view arrives with R2", never placeholder numbers. **Follows** the rethink cut (RF §3.3, core §I.2, core §L.2 PL-07) and replaces revision 1's 13-tab plan (PLA-§S). | The owner asked for every stat, log, order, teammate, usage, integration, AI use, domain, risk flag, note and timeline (brief items 13-14): the strips give all of it on one screen with masked PII; the deep tabs need R2 data anyway and their cut pays for SF-03 (RF §3.3). |
| PD33 | **No page or media takedown from the console in R1.** Abuse is handled at store level (restrict / suspend, PLA-§8); page and media takedowns arrive with PL-20 (R3) through a platform write scope. | Lint L6 forbids platform scopes on write repositories; restrict already stops orders and suspend hides every page. |
| PD34 | **Staff never edit tenant data in R1** (pages, settings, memberships, orders). Console writes are platform rows (reviews, notes, entitlements, flags, settings) and user-level actions (ban, 2FA reset, reset link, sign-out) of core §B.7, §B.9. | R-D14 read-only support; one less class of cross-tenant write to secure. |
| PD35 | **Seller contact data** (`users.email`, `users.phone`) is shown in full to admin+ and masked to support and analyst; **customer PII** (orders, leads, customers) is masked for every role and revealed per order only (`pii.reveal` ↑, reason). | Admins need to reach sellers on WhatsApp; customers never agreed to staff reading them (R-D16, core §F.11). |
| PD36 | **Console navigation lives in `src/components/console/nav.ts`** (P1), not in the tenant nav registry: its items carry a `PlatformPermission`, not a store handle. **(rev 2)** The core's extension file `src/components/admin/shell/nav/console.ts` (P1, core §K.2) exports exactly one tenant-shell item, "Platform console" (`permission` none, shown only when `user.platformRole ≠ "none"`, `href: () => consoleHref("/")`), which the store switcher renders (core §B.4); nothing else of the console lives in the tenant nav. | `NavItem.href(handle)` and `navFor(StoreCtx)` (core §I.3) are store-shaped; the one staff entry in the tenant shell still belongs to this part. |
| PD37 | **Cross-store "last 24 h" figures use a new single-column index `orders_created_idx (created_at)`** (PLA-§Q.10) instead of per-store loops. | Core 0004 replaced every global orders index with store-prefixed ones; a platform count by time would scan the table. |
| PD38 | **Every poll (tenant pulse, console pulse, ⌘K search) is a GET route handler with an ETag**, never a server action. | Server actions are dispatched one at a time per client (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:26-32`): a poll would delay the seller's next save. |
| PD39 | **Console and shell mutations finish with `refresh()`** (`next/cache`) after the write; no `revalidateTag` is used. | Console data lives in MariaDB and `scopedCache`, not in Next's data cache; `refresh()` re-renders the current route in the same round trip (`server-actions.md:141-150`, `04-functions/refresh.md`). |
| PD40 | **Store milestones are recorded from R1** (first draft, first publish, first order, 10th order, first teammate; first delivered order from R2) in `store_health.milestones` and as `store.milestone.reached` audit rows. | The store timeline needs them now and the R3 activation funnel (PL-19) needs history from day one. |
| PD41 | **R2 mail transport = `nodemailer`** (the one dependency core §B.10 lets this part choose), pinned to an exact version at install; it has no runtime dependencies **[verify at install]**. | The reference SMTP client for Node; avoids a hand-written SMTP/STARTTLS stack; Hostinger SMTP limits stay unverified (R-D51). |
| PD42 | **(rev 2) One score, seven groups (core §I.7):** `setup 20 · trust 15 · design 15 · conversion 15 · operations 15 · integrations 15 · quota 5` (Σ = 100); issues carry `severity 1 \| 2 \| 3 → points 3 \| 6 \| 10` and an evidence object with `n`; the console flags of PLA-§6.3 (`sheets_*`, `outbox_dead`, `capi_failing`, `telegram_failing`, `quota_*`, `risky_orders`, `setup_incomplete`, `render_failed`) are **produced by `src/lib/health/rules/platform.ts` (P1) as issues mapped onto the groups**, and the status flags (`inactive_14d`, `dormant_60d`, `review_waiting`, `restricted`, `suspended`) stay 0-point console flags that only drive `attention`. Design and honesty rules come from P6 and P3's rules files. **Replaces** revision 1's six platform-only components (30/20/15/20/10/10). **(rev 4, core §I.7 rev 3: one condition, one issue, PD79)** where another track's rules file already emits the issue for a condition (P5's `int:sheets_backlog`, `int:capi_failing`, `int:telegram_failing`, `int:delivery_dead`; P3's `landing:no_live_page`), `rules/platform.ts` emits **no second issue**: the console flag (`sheets_backlog`, `capi_failing`, `telegram_failing`, `outbox_dead`, `setup_incomplete`) is **derived from that issue** by `platformFlags()` with the same evidence, so the score never counts one problem twice; P1's own issues are only `platform:render_failed` (setup), `platform:quota_high` / `platform:quota_full` (quota) and `platform:risky_orders` (operations). | Core D53 adopted the one-table, one-computation model; a score the seller reads must include what the seller can fix (RF §1.3); two rules on one condition would double the penalty and show the seller the same reason twice. |
| PD43 | **Kill switches are never toggled from ⌘K, a bulk bar or a keyboard shortcut**: ⌘K only opens the switch's sheet. | An incident tool needs one deliberate path (PD29). |
| PD44 | **No bulk lifecycle actions in R1.** Bulk on the stores list = message (≤ 50 stores) and a CSV of the list without PII. | One mistaken selection must never suspend 50 sellers. |
| PD45 | **Impersonation is refused** for a store the staff member is a member of ("open it directly"), and for `scheduled_deletion` / `purged` stores; one active impersonation per staff session (starting another ends the first). | Avoids mixed identities in the audit; nothing to support on a store about to be deleted. |
| PD46 | **The dashboard manifest is a route handler at `/app/manifest.webmanifest`**, linked from the `/app` layout metadata. | The metadata manifest file convention lives only in the app root (`03-file-conventions/01-metadata/manifest.md:6`), and `/manifest.webmanifest` is a store-reserved slug on store hosts (core §C.4.1). |
| PD47 | **QR codes use the installed `qrcode` package** (`package.json:65`), rendered to SVG in the browser: invite links (TN-06) **and the live address card, both R1** (UX-05 raised, RF §3.2, core §I.4, PD61). | No new dependency; nothing secret leaves the page. |
| PD48 | **Onboarding composes other tracks' engines**: P2 owns the flow, state, routes and copy; the photo analysis is P7's `useAiTask("analyze", …)` (ai.md AI-§A.7) and the reveal composition is P6's (design.md DES-§14.3). | One engine per concern; the wizard stays the same code path as Generate. |
| PD49 | **Legal template content is code in `src/lib/platform/data/legal/**`** and is seeded by the core boot task through a versioned marker (PLA-§Q.13). | Templates are reviewed in git; the R1.0 seed must not need P1's files to exist. |
| PD50 | **Notification kinds are a typed registry with per-track extension files** (PLA-§Q.15); this part owns the platform, lifecycle, team, plan, security, staff and health kinds. | Every kind needs ar/fr/en texts and a link builder; tracks must not edit one shared file. |
| PD51 | **(rev 2) The console passes the admin UX ceiling with its own budgets** (core §I.8 applied to staff screens, PLA-§4.7): shell navigation < 150 ms (route chunks prefetched on hover and focus, the first page of every list served from a 60 s `scopedCache`), keyboard decisions ≤ 500 ms with optimistic UI and an `opId`, skeletons that mirror the final rows after 150-300 ms and for ≥ 300 ms, status always as text + icon (never a bare coloured dot), compact density by default, the §I.6 motion tokens and no bounce. Measured by `platform-check.ts --perf` and the Playwright budgets of PLA-§O.4. | The owner lives in the console every day; "futuristic" is latency discipline, keyboard and honest data (RF §0.4, §2.1). |
| PD52 | **(rev 2) Explainable risk has three layers on every review:** (a) the flag list with points and evidence (PD3); (b) a **counterfactual line** from `explainBand(score)`: which single flag, removed, would change the band ("Without `disposable_email` this would be `fast`") and which single flag puts it in the hold class; (c) the **draft evidence**: readiness, the Design check summary of the newest draft (P6 `designHealth(scope)`), the count of honesty items (`buildChecklist`) and whether any sample proof is still marked `sample`. Staff decide about the store, not only about the signup; nothing is auto-rejected (R-D12). | Brief item 16: "approvals queue with explainable risk"; a score with no counterfactual is a number, not an explanation (PD18). |
| PD53 | **(rev 2) P1 owns the Store Health engine, P2 the tenant surface, every track its rules** (core §I.7, §K.2): `src/lib/health/{types,registry}.ts` are the maintainer's skeletons; P1 writes `src/lib/health/{engine,inputs,platform-flags}.ts`, `src/lib/health/rules/platform.ts`, `src/lib/health/selftest.ts`, `src/lib/platform/health-snapshot.ts` (`getStoreHealth`, `markHealthDirty`, `snoozeHealthIssue`), the job in `src/lib/jobs/tracks/platform.ts` and the console ring; P2 writes the ring, the issue list, "Recompute now" and the snooze UI (PLA-§22.16) plus `src/lib/health/rules/shell.ts` (setup rules about contacts, legal identity and 2FA). The score never gates anything (publish gates are core §M). **(rev 4, core D67 / §I.5)** Rule sentences live in the emitting track's own i18n file: P1's tenant sentences `health.platform.<rule>.*` in P1's `notify.ts` (ar / fr / en), P2's `health.shell.<rule>.*` in P2's `shell.ts`; P2's `health.ts` carries the ring, groups, issue-list and snooze chrome only. | One owner per layer; the setup checklist (`src/lib/admin-data/dashboard.ts:173-180`, six static items) is deleted, not duplicated (RF §1.3, core §I.4). |
| PD54 | **(rev 2) Lifecycle safety = preview, arm, cooldown.** Every lifecycle action (PLA-§8) opens a sheet that shows the **exact store-facing sentence** in the store's default locale, the **consequences count** from `lifecyclePreview(ctx, storeId, to)` (live pages, open orders, agents holding a lease, integrations that pause, the reopen deadline) and the audit row it will write; the primary button arms a **5-second cancel window** on the client before the single `transitionStore` write; a second lifecycle change on the same store within 10 minutes needs the typed handle even where the edge normally does not; no bulk lifecycle action exists (PD44). | Brief item 16: "lifecycle safety"; `transitionStore` sends exactly one notification per edge (core §A.5.1), so an undo after the write would notify twice; preventing the write is cheaper than undoing it. |
| PD55 | **(rev 2) The store profile Overview is the "every detail" screen** (PD32): identity & address (mode, canonical URL, address mode, handle history count, next re-render), health (ring, groups, top 5 issues incl. snoozes), pages (count, last publish, live URL, preview), orders (7/30 d counts, confirmation rate with `n`, risk mix, masked latest 5), team (members, invites, 2FA coverage), integrations (`integrationHealth`: Sheets, pixels, Telegram, outbox dead), AI (`aiStoreSummary`: credits, cost, last run), usage (`store_usage` meters), risk (latest review band and flags, linked accounts count), timeline (last 8 events). Each strip reads one P0 read API and fails alone. | The owner asked for every detail on one page (brief items 13-14) and the rethink cut the deep tabs (RF §3.3): the strips deliver the first without the cost of the second. |
| PD56 | **(rev 2) Impersonation is visible on both sides and survives navigation:** the start sheet previews the exact store-facing notice (PD19); the console topbar shows a "Viewing @handle · mm:ss" chip (from `ConsolePulse.impersonation`) while this session impersonates, linking back to `/app/<h>`; the tenant ribbon's countdown reads `StorePulse.impersonation.endsAt` (core D57) so it never drifts after a client navigation; every refused write is one toast and one `platform.impersonation.write_refused` audit row (core §B.8); "Note while viewing" writes a `platform_notes` row of kind `note` from the ribbon's menu (staff only). | Brief item 16: "impersonation UX"; R-D14 read-only support must feel safe to the seller and efficient to staff. |
| PD57 | **(rev 2) System health shows the machinery:** Edge / Worker (S mode, Worker version last seen, last edge-verified request, prev-key use, foreign hosts), **Render queue** (depth by reason, oldest pending, failed by store, last-hour throughput and ETA), **Health engine** (stale snapshots, dirty rows, last job run), **AI** (`aiHealth()`: provider ok/paused, open batches, orphaned jobs, cap used %, refusal rate 24 h), **Design tables** (bytes, 300 MB alarm) and the cron, queues, Sheets, storage, errors and runtime panels of revision 1; every panel names the alarm it drives (PLA-§15.2). Data: core §H.5 rev 2 (`edge`, `commerce`, `sheetsTop`, `ai`, `design`, `health`, `renderSummary`, `outboxSummary`). | Brief item 16: "system health incl. the Worker and render queue"; a queue nobody can see fails silently. |
| PD58 | **(rev 2) The plans editor explains every row three ways and previews impact per store:** registry default, plan value, effective sentence ("Stores on this plan get 1 GiB"); the impact preview lists, per lowered key, the count and the handles (≤ 20, sorted by usage) of stores already above the new limit and what they keep; a diff is shown before save; `take_orders` is locked (PD8); the rev 2 keys `campaigns_max`, `short_links_max`, `coupons`, `reviews` appear with their release chip (core §A.4). | Brief item 16: "plans editor"; a limit change is a change to someone's business (PD18). |
| PD59 | **(rev 2) Onboarding ranks directions with no model on the critical path** (core D59): category tap + photo palette (browser) + keywords through `rankDirections()` (`src/lib/generator/directions.ts:375`); SigLIP and the VLM refine **after** the reveal (a quiet "refining" chip, never a blocker) or run on the server when Cloud AI is on; the "Download local AI" consent card (AI-03) never shows on mobile data; the copy is the hand-written library when Cloud AI is off. **Refines UX-01 / AI-03** as written in RESEARCH. | 99.5 + 111 MB at q8 on 4G is 1-3 minutes (RF §4); the demo reveal is at 0:50. |
| PD60 | **(rev 2) Mode-aware onboarding, fixed now for R2:** choosing `both` (R2) lands on the **same immediate landing reveal** for the first product, while the store blueprint runs as a detached job (core §H.12 pattern B, `ai_jobs.kind = "store_blueprint"`, S1/S7); the `pulse.jobs.done` list surfaces "Your store home is ready" when it finishes, and the `done` step shows the address card with the store home URL. **(rev 3, OPS-14)** In `store` mode the reveal is the **product page**, not a landing page: `useDirectionAction` creates the first product (S1's `createProduct`) and renders the three directions through `productAsPageDoc(product, …)` (storefront.md STO-§12.2, synchronous, no job), the chosen direction becomes the store's theme draft and the PDP family seed, `onboarding.firstKind = "product"` and `onboarding.productId` are written, no landing page is created and `landing.inStoreMode` stays `false`; the store home arrives from the blueprint job as before. **(rev 4, core §A.2 rev 3 / LAN R5 A\*)** Should any onboarding path create a landing page for a `store`-mode shop (a resumed revision-3 draft, a future entry), the same transaction sets `landing.inStoreMode = true` (audit `store.landing_settings.updated`, reason `onboarding`) and the `done` step reads `onboarding.reveal.saved_sales_page` ("Your first page is a sales page; your store home is being built"), so a saved draft is never hidden behind the store's 404. The owner never waits on a model for the first result in any mode. P2 owns the flow; the blueprint is S1/S7's. | Brief item 16: "the tenant onboarding that chooses store / landing / both and lands on a generated first result within the demo budget"; the first result must exist in every mode without a long request; a `store`-mode seller must never be shown a page the mode then hides (core §A.2: landing pages hidden by default in `store` mode). |
| PD61 | **(rev 2) The live address card ships in R1** (UX-05 raised, RF §3.2, core §I.4): canonical link + Copy, QR (PD47), "Share on WhatsApp", **"Open a test order"** (P3's `mintTestLink(scope, pageId)`, SF-05), **"Create a campaign"** (P3 entry, SF-01), the live state line; placed on the pages list, on the dashboard after the first publish and at the onboarding end. P2 owns `src/components/admin/common/address-card.tsx` with two named slots (`testOrder`, `campaign`) that P3 fills. | The wow moment ends with sharing (RF §2.3, §4 1:40). |
| PD62 | **(rev 2) The dashboard is screen 2 of RF §2.10 (P2):** a **Today brief** template line from real counts (SF-11 R1 slice: orders to call now from `opsPulse`, the worst open health issue, one opportunity or "no orders yet"), COD KPI tiles where **placed, confirmed and delivered never share a tile** (sparklines only with ≥ 7 points, every rate with its `n`), the **COD funnel** (orders → confirmed → shipped → delivered → cash collected as horizontal stepped bars, delivered in jade, R1 shows the steps whose data exists and labels the rest "with delivery tracking (R2)"), work lists and the Store Health ring. "Revenue · 7 days" (`src/components/admin/dashboard/dashboard-view.tsx:99`) becomes "Placed · 7 days" with the hint "placed, not delivered"; the setup checklist (`setup-checklist.tsx`) is replaced by the ring. | RF §0.5 names the dashboard's placed-as-revenue habit as an owner-rule break; §2.5 fixes the chart language. |
| PD63 | **(rev 2) The pulse is the core's `StorePulse` (D57, SF-06):** GET-only route with `ETag` → `304`, **one poller per browser and store** through `BroadcastChannel("sg-pulse:<storeId>")` with independent pollers as the fallback, store-level parts cached 5 s per store and per-user parts fresh, contributors from `src/lib/pulse/contributors/<track>.ts` (50 ms budget each, a failure omits its keys). P2 owns the route, the `usePulse()` hook, the poller election and `contributors/shell.ts`; the `health` and `jobs` fields drive the ring freshness dot and the background-job chip. | 15 s polling must stay cheap on one Node process (RF §2.2, §3.4). |
| PD64 | **(rev 2) Every tenant surface this part ships passes the eight rules of core §I.8 as acceptance** (PLA-§22.18): measured by `test:admin-tokens`, `test:admin-motion`, `test:admin-rtl` and `test:i18n-coverage` (P2 owns the four scripts) and by the Playwright budgets of PLA-§O.4. P2's rework removes the two bounce sites (`src/components/admin/shell/app-sidebar.tsx:96` spring, `:146` overshoot rotate; core D60), **removes aurora + grain from the admin entirely (rev 3, UX-38)**: `src/components/admin/dashboard/kpi-card.tsx:58` and `src/components/admin/common/empty-state.tsx:28` lose them, the `adm-aurora` / `adm-grain` classes are deleted from `scripts/build-admin-css.mjs` and `src/app/globals.css`, and the *celebration* `EmptyState` variant becomes a **typographic moment** (one large tabular number, one accent hairline, a 240 ms rise; PLA-§22.16 item 4) instead of the revision-2 "one aurora per screen" budget; raises the sparkline floor to 7 points (`kpi-card.tsx:92` draws from 2) and replaces the Tailwind `emerald`/`rose` delta classes (`kpi-card.tsx:75`) with the semantic tokens. `test:admin-tokens` greps `src/components/**`, `src/app/**` and the generated CSS for the two class names and fails on any hit. | Owner rule "maximally modern, never generic"; the admin had the tells (RF §0.5, §2.6, §2.9); mesh / aurora gradients with grain are the 2024-26 generated-UI signature (rubric §0.D, §9.A), so no "once per screen" exception survives. |
| PD65 | **(rev 2) Approval latency is a demo pass condition** (RF §4 at 1:25, core §K.2 exit criterion 12): a submitted store appears in the Review tab within one console pulse (≤ 15 s); `A` commits in ≤ 1 s server time (one compare-and-set review update, one `transitionStore`, one notification, one audit row, `markHealthDirty`); the seller's dashboard unlocks on its next pulse (≤ 15 s) without a reload. Measured by `qa:wow-demo` persona 2. | The owner's one-key approval is part of the acceptance scenario. |
| PD66 | **(rev 2) Health fixes run through the ⌘K command registry:** `HealthFix.kind = "action"` carries a `CommandDef.id` (core §I.3), so a one-tap fix runs the same registered, permission-filtered command the palette runs (Sync Sheets, Recompute health, Open a test order, Publish); `kind = "link"` fixes build their `href` with `appHref`. The console renders the same issue read-only with "Open in store (view as)". | One action registry; a fix that bypassed permissions would be a second write path. |
| PD67 | **(rev 2) Health notifications and snoozes are owner/admin actions:** a **new** severity-3 issue notifies owners and admins once per issue id per ISO week (`health.issue_new`, dedupe `health:<storeId>:<issueId>:<YYYY-Www>`); a snooze (`health.snooze`, 7 days) is stored in `store_health.snoozed`, audited `store.health.snoozed` and shown to staff as "snoozed by <role> until <date>"; "Recompute now" (`s:<sid>:health:recompute` 6/h) only marks the row dirty (the job computes within ≤ 5 min). | Nagging kills a health score (RF §1.3 risks); staff must see what the seller chose to ignore. |
| PD68 | **(rev 3, SEC-1) The pending sandbox has platform-wide ceilings and the human check is a gate, not a score, wherever anyone may sign up.** In `approval` and `open` modes a configured Turnstile widget **refuses** the signup when the token is missing or invalid (the +20 / +10 points stay only for `invite` mode, where the code already gates); `signup.pendingStoresPerDay` (default 50) caps the sandboxes created per platform day through `chargePlatformUsage("pending_stores", <YYYY-MM-DD>, 1)` and the 51st applicant lands on the **waitlist** for that day (never a 500, never a silent sandbox); `signup.pendingMediaTotalMiB` (default 5,000) is one disk budget shared by every `pending` store, charged through `chargePlatformUsage("pending_media_bytes", "total", bytes)` beside the store's own `media_bytes` charge, so an exhausted budget answers `quota` at upload; the per-store pending media cap is **two-tier**: `signup.pendingMediaMiBBeforeSubmit` (default 20) until "Submit for review" is pressed, `signup.pendingMediaMiB` (default 100) after; pending stores draw Cloud AI from a separate slice `platform_ai.caps.pendingSharePct` (default 10 % of `monthlyUsd`, ai.md) so sandboxes can never exhaust the cap approved stores pay for. **(rev 4, aligned with core D69 / §B.2 / §A.5.2 rev 3)** The daily charge is core §B.2 **step 6, before** the step-7 transaction, and applies **whenever the store would start `pending`** (an invite code without `auto_approve` included; auto-approved paths skip it); a step-7 rollback (duplicate e-mail or handle) gives the slot back with `refundPlatformUsage("pending_stores", <day>, 1)`; the shared media budget is refunded through `refundPlatformUsage("pending_media_bytes", …)` on any transition out of `pending`; the pending AI slice's daily floor is **10 credits** and its exhaustion answers **`quota_platform_pending`** (pending stores only); the alarms are `pending_media_budget` (80 % yellow, 95 % red) and `signup_capped` (core §H.5 names). PLA-§3.1, §3.2, §3.4.1, §3.6, §O.2 case 13, §O.3 cases 13-14. | 1,000 bot signups at 200 IPs/hour were 100 GB of disk, ~900k inodes (core §G.2: 600,000 plan-wide) and $500/day of AI before the monthly cap tripped; a full disk breaks backups (core §H.6), exports (core §F.9) and every store's uploads; nothing is auto-rejected (R-D12), so the queue alone cannot stop a flood. |
| PD69 | **(rev 3, SEC-5) Impersonation masks customers at the repository boundary.** When `ctx.impersonation` is set the seam gives `StoreCtx.scope.kind = "impersonation"` and every order, lead and customer read function (operations.md) applies `maskName` / `maskPhone` / `maskAddress` and replaces notes by "Note hidden" from `src/lib/platform/mask.ts` before returning rows, so the tenant UI renders masked values with no per-component work; the only unmasking path stays the console's per-order reveal (`pii.reveal` ↑, PLA-§7.4), reachable from the ribbon's "Open profile". The start sheet says so to staff and the store's notification says so to the seller. PLA-§7.2, §10.1-10.3, §O.3 case 15. | PD35 promised "customer PII masked for every role and revealed per order only"; the revision-2 synthetic membership (`orders.read_all`, `customers.read`, `leads.read` with `write = false`) rendered names, addresses and notes in clear while only the phone was masked (OP-07), contradicting the owner summary's "read-only is safe". |
| PD70 | **(rev 3, SEC-18) Brand protection runs at every write, on every live page and from day one for reporters:** (1) `checkBrandTerms(fields)` (`src/lib/platform/brand-check.ts`, P1, the second tenant-callable function of `src/lib/platform/**` after `createStoreRequest`) runs `brandTokens()` + the active `protected_brands` rows on the store name, legal name and WhatsApp display name at every write (`saveGeneralAction`, `/admin/stores/new`, onboarding); `brand_exact` **refuses** for non-staff with the action error `brand_protected` (limit-sheet variant `shell.limit.brand_protected`), `brand_near` writes the console flag `brand_near_live`; (2) the health engine's platform rule `platform:brand_term_live` scans the store name, legal name, every live page's name and SEO title and the `policies` texts on each run and raises the console flag `brand_term_live` (`attention = 2`, `staff.alarm brand_term_live`, platform-visible only, never a tenant issue); (3) the public **"Report this store"** link (`/report/<handle>`, platform host, P1) and the insert-only `abuse_reports` table ship in **R1** (the table moves from 0007 to 0005, PLA-§Q.3); the triage UI stays R3 (PL-20); new reports count in Needs attention and in the profile's Risk strip; (4) the publish gate `honesty:password_field` (a landing or store page with `<input type="password">`, a card-number pattern or an `otp` field is refused) is P3's in `src/lib/render/prepublish/landing.ts` (PLA-§Q.3). **(rev 4, aligned with core D76 / §C.7 / §B.1 / §K.2 P0 rev 3)** The tenant-callable function has the core's frozen P0 signature `checkBrandTerms(kind: BrandField, value: string): Promise<"ok" \| "near" \| "exact">` (P2's `saveGeneralAction` and onboarding, P3's policies contact block and P6's brand kit call it once per field); the console's "Check a name" box and the health rule use P1's internal `brandMatches(kind, value)` that also returns the matched term, never exposed to tenants; the rule runs on **every health computation** of the store, which is at least as often as the core's "nightly" (PLA-§Q.4 asks the core to say "at least nightly"); the footer link is the absolute `reportUrl(handle, path)` = `platformOrigin() + "/report/<handle>?p=<path>"` and **store hosts answer the neutral 404 for `/report/*`** (like `/kit/*`, core §C.4; not a 308); the form posts with `Referrer-Policy: same-origin` and the buckets are `p:report:ip:<h>` 5/h and `p:report:store:<h>` 20/day (core §B.1, §E.8). PLA-§6.3.3, §13.3, §22.10.1, §24.2. | `brand_exact` / `brand_near` were signup-time signals only; after approval a store approved as "Boutique Nour" could become "CIH Bank · Vérification" with a password-shaped form in minutes on `<handle>.<root>`, with no abuse report before R3 and no Web Risk before PL-24. |
| PD71 | **(rev 3, SEC-13) Every platform cookie carries the `__Host-` prefix.** The locale cookie becomes `__Host-sgl` (Secure, Path=/, no Domain, SameSite=Lax, not HttpOnly, 1 year); its value is validated with `z.enum(["ar", "fr", "en"])` on every read and before any write to `users.locale`; when several cookies of the same name arrive only the host-only one is taken; `qa:edge-sim` asserts that the platform host never emits a `Set-Cookie` without `__Host-` (T3, PLA-§Q.3). PLA-§22.1. | In S mode every store subdomain is same-site with the apex (R-D7); a vendor script on `<store>.<root>` could set `sg-locale=…; Domain=.<root>` and toss an attacker-controlled value into `users.locale` (`varchar(5)`), later used to pick catalogs and `dir="rtl"`. |
| PD72 | **(rev 3, OPS-31) The store / landing / both choice explains itself** with `modeSummary(mode): { line: MessageKey; get: MessageKey[]; later: MessageKey }` (`src/components/admin/common/mode-explainer.tsx`, P2, derived from `modeAllows()` so it never drifts from core §A.2): one line and three "you get" bullets per card and the sentence "You can change this later; nothing is deleted", reused by `/signup` step 2, `/app/new`, onboarding and the mode-switch sheet of Settings → General. PLA-§22.1.5, §22.10.1. | Owner item 7 makes the choice first-class; three card titles with two "Coming soon" badges did not tell a seller that landing = one product per page with the COD form and both = a catalog plus campaign pages borrowing product prices. |
| PD73 | **(rev 3, UX-20) The reveal shows three real folds, never a page inside a phone inside a phone.** Mobile (390 px): direction 1 renders as the real page edge-to-edge (the live fold at 100 %), the three folds sit in a horizontal snap carousel with an 8 % peek of the next, the DNA chips live in a bottom sheet, "Use this design" is sticky at the bottom; desktop: three real folds side by side at equal width (≤ 440 px each), hover or focus expands one to a full scrollable preview, the DNA card under each. The 420 ms quint entrance and the reduced-motion crossfade stay. P6 owns the component (design.md DES-§14.3 must follow, PLA-§Q.3); P2 owns the step and its acceptance. PLA-§22.2. | A scaled screenshot in a device bezel at 390 px is unreadable type with no sense of the real fold; the wow moment is three clearly different folds seen together, and one large frame plus two small cards biases the choice (UX-20). |
| PD74 | **(rev 3, UX-39) Cutout-later path for the reveal:** the photos step runs P6's model-free alpha estimate in the browser for uniform backgrounds (edge flood-fill with tolerance on the 32 × 32 facts pass, then at 1024 px, < 150 ms) and passes `hasCutout: "estimated"` to the generator so stage / specimen / dark-base directions are eligible at 0:50 with a `plinth` / `contact` preset; when the BiRefNet mask (AI-21) lands later, a `render_jobs` row with reason `cutout` upgrades the hero in place for the chosen page; `qa:wow-demo` asserts that at least one of the three directions at 0:50 is stage, specimen or dark for the argan and parfum fixtures. PLA-§22.2, §O.5. | Core D59 forbids any model download before the reveal, so `PhotoFacts.hasCutout` was always false at 0:50 and H13 / H27 excluded the most distinctive subset of the genome at the moment the owner judges "special"; the chosen page was never re-sampled when the cutout arrived. |
| PD75 | **(rev 3, ENGC-8) The tenant audit page `settings/audit` is P2's** (core §I.1 lists the route; no R1 track owned it): the store's own activity log over `listStoreAudit(scope, filter)` (T1's audit v2 read API, store rows only), the deep-link target of `store.impersonation_*` notifications (PLA-§18.2 already points there), filters by actor kind and area, keyset by id, every impersonation session and platform reveal listed with the staff display name (core §F.5). PLA-§22.10.6. | A route in the core's tree with no owner is a file two tracks would both create; the notification kinds of this part already link to it. |
| PD76 | **(rev 3, OPS-13) The health inputs carry the per-city fee mismatch** so P3's rule `landing:fee_mismatch` (severity 1, conversion group) can tell a seller that a live page charges a flat fee while the zone table carries a different fee for one of the five most-ordered cities; the rule's condition and text are P3's (landing.md), the input `zones.feeMismatchTop5` is P1's (`inputs.ts`, from `zonesForCheckout` and `opsAggregates(dims: city)`). PLA-§6.3.1, §6.3.2. **(rev 4)** Core D75 moved LP-16 ("Charge delivery by city") into the R2 contract step and core §I.7 names `landing:fee_mismatch` as a P3 health rule; the input stays and is computed only for pages **not** on "Charge delivery by city" (a page that charges the zone fee cannot mismatch); the input's keys are the canonical `CityKey` slug of core D68 (`null` = the `*` zone, never an input row). LAN-§23.7 does not list the rule yet (PLA-§Q.4). | Until landing pages charge per-city fees (LP-16), a `both` store quotes two fees for one city; the seller must at least see it as a reasoned issue with a fix link. |
| PD77 | **(rev 4, CRIT17) Every feature row names its proof.** Each row of the PLA-§1 feature maps carries a **Proven by** cell naming the script (and the case or step) that fails when the row's acceptance breaks; `src/lib/platform/selftest.ts` exports `FEATURE_PROOFS: Record<FeatureId, string[]>` (the same list, machine-readable) and `test:platform` asserts that every R1 id of PLA-§1 has at least one entry and every entry names a script of PLA-§O; deliverable-list cells (PL-04, the critic's example, and PL-10, PL-11, PL-13) are rewritten as checkable statements. | The criterion "every acceptance criterion names a test command or harness" must be checked mechanically, not by a reviewer reading two sections side by side. |
| PD78 | **(rev 4, core §I.7 rev 3 / ENGC-25) Health freshness is measured, not promised.** The `platform.health` job is budget-driven (≈ 10 stores per tick at 100-800 ms each), dirty rows first: ≤ 5 min after any `markHealthDirty`, otherwise one full cycle = `ceil(activeStores / storesPerTickP50) × 5 min` (≤ 60 min up to ≈ 120 active stores, longer beyond, recorded in `job_runs.summary`). The stale alarm and the console panel compare each snapshot with **the measured cycle**, not a fixed hour (`stale` = older than `max(staleAlarmMinutes, 1.5 × cycleMin)`), and every tenant sentence shows the check time ("Checked at 14:20") instead of promising "within an hour". | "≤ 200 stores per tick" was unreachable in 3 s; a fixed 60-minute stale alarm would fire permanently past ≈ 120 stores and the copy would lie. |
| PD79 | **(rev 4, core §I.7 / D67) One condition, one issue; rule ids as their owners write them.** The PLA-§6.3.2 table is a summary of the R1 rule set whose source is each owner's table (P3 LAN-§23.7, P4 / P5 OPE-§27.2, P6 DES-§2.10 / DS46, P2 here, P1 here); a condition appears in exactly one rules file, console flags that mirror another track's issue are derived from it (PD42 rev 4), and `test:health` fails when two registered rules share an evidence `metric` in the same group. | Revision 3 listed `platform:sheets_backlog` beside P5's `int:sheets_backlog`, `shell:no_published_page` beside P3's `landing:no_live_page` and stale ids for P4 / P6 rules: the score would have counted one backlog twice. |
| PD80 | **(rev 4, core §B.7 rev 3 / SEC-17) The tenant step-up ladder is P2's UI.** `StepUpSheet` gains `method: "totp" \| "password"` (TOTP when the user has it, else a password re-entry through T2's `stepUpWithPasswordAction`, bucket `p:password:<userId>`); P2 opens it for every store-side action the core lists: `store.export` and `orders.export` (Danger zone, P4's export menu uses the same sheet), `store.close`, secret writes under `integrations.manage` (P5's screens mount the same sheet), and role changes **to `admin` or `owner`** (Team); the audit row names the method (`meta.stepUp`). Revision 3's "↑ when the user has TOTP" is withdrawn. | A stolen 30-day session cookie alone could pull every customer of a store; the ladder needs one sheet the seller recognises everywhere. |
| PD81 | **(rev 4, core §F.9 rev 3 / SEC-20) Account deletion has two doors.** Staff: **Delete account** on the console user profile (`users.manage` ↑, reason, refused while the user owns a store that is not `purged`, PLA-§11.2) calls T2's `deleteUserAccount(ctx)`; seller: `/app/account/danger` **Delete my account** (P2, R1; offered only when the user owns no store, else the page lists the stores to close or transfer first) behind the password / TOTP step-up and a typed `delete`. Both anonymise `users`, revoke sessions and audit (`platform.user.deleted` / `auth.account.deleted`). | The core gave the staff path to P1 and the self-service page to P2 (core §K.2 P1 row "the account-deletion staff path"); a right to deletion needs a door. |
| PD82 | **(rev 4, core D44 rev 3 / SEC-2) The console leaves the shared origin at the domain move.** The PLA-§16.3 checklist carries `ADMIN_HOST=console.<domain>` in the env step (restart, not rebuild, core §C.10), "verify the console allowlist still admits you (`CF-Connecting-IP`)" before the nameserver switch, and a V-check that `/admin` on the apex answers the neutral 404 once `ADMIN_HOST` is set; every console link this part builds goes through `consoleHref()`, which the core makes absolute (`https://<ADMIN_HOST>/admin…`) when `ADMIN_HOST` is set (PLA-§Q.4), so the tenant shell's "Platform console" item and staff notification links keep working. | A vendor pixel script on a tenant page runs with the viewer's cookies on a shared origin; the console must leave it before public sign-ups. |
| PD83 | **(rev 4, CRIT15) One report link contract for every public page.** `reportUrl(store, pagePath?)` (core §C.6 builder, PLA-§Q.4) = `platformOrigin() + "/report/" + handle + "?p=" + encodeURIComponent(pagePath)` (path only: no host, no query, ≤ 300 chars); the wording is `shell.report.link` (ar / fr / en, PLA-§N.3; the shell and the `/report` page use that key), and each shopper-facing renderer keeps the same three texts under its own key (D67: P3 / P6 `landing.footer.report`, S1 `footer.report` which STO-§24 already has), so the surfaces read identically without sharing a catalog file; the renderers are named: **P6's landing footer section** and **P3's legal / policy pages** receive it as `ctx.reportHref` from the landing renderer's store context (`{ base, origin, mediaOrigin, reportHref }`, core §C.6 / T3), **S1's store chrome** in R2 (`footer.report`, STO-§24), the thank-you and tracking pages through the same context; `qa:headers` / render-check assert the link on one fixture per page kind. Re-render reason `address` refreshes it at the domain move. | The core promised the link on every public page; landing.md and design.md (owner of the footer section) never rendered it, so the R1 product (landing pages) had no owner for the slice (CRIT15). |

Glossary: **staff** = a user with `platform_role ≠ none`. **store profile** = `/admin/stores/<id>`. **band** = the
signup triage class of PD3. **request** = a `signup_reviews` row whose kind is not `signup`. **snapshot** = the
`store_health` row of a store. **issue** = a `HealthIssue` (core §I.7) with a group, severity, evidence and a fix;
**flag** = a console `HealthFlag` (PLA-§6.3). **strip** = one detail panel of the store profile Overview (PD55).
**step-up** = TOTP again within 5 minutes (core §B.7), marked **↑**. **arm window** = the 5-second client-side cancel
window before a lifecycle write (PD54).

---

## PLA-§1. Feature map (every id of this area)

Release per RESEARCH §4 unless a decision moves it (PD6, PD10). "Track" per core §K.2/§K.5. AC = acceptance
criteria in one line; the detailed criteria sit in the section. **Proven by (rev 4, PD77, CRIT17)** names the
script and the case or step of PLA-§O that fails when the row's acceptance breaks (`test:db` = `scripts/qa/platform-check.ts`,
attack case = `scripts/qa/tenancy-cases/platform.ts`, e2e step = PLA-§O.4); the same mapping is the `FEATURE_PROOFS`
constant of `src/lib/platform/selftest.ts`, and `test:platform` fails when an R1 id has no entry or an entry names a
script PLA-§O does not define.

### PLA-§1.1 Platform (PL-*)

| ID | Feature | R | Track | Section | AC (summary) | Proven by |
|---|---|---|---|---|---|---|
| PL-01 | Signup modes | R1 (core R1.0 for the form) | T2, P1 | §3.1, §3.2, §13.2 | Mode setting editable; `null` = derived (core D9); invite codes and waitlist manageable; each mode behaves per §3.1 in an e2e run. | `test:platform` (`autoApprove` truth table per mode, `turnstile: "off"` refused in `open`) · `test:db` case 13 (Turnstile gate, daily cap) · e2e step 1 (invite-mode signup) |
| PL-02 | Pending-store sandbox | R1 | T1, T2, P1, P2 | §3.6, §22.7 | A pending store builds, uploads ≤ pending cap and previews; publish/orders/integrations show the locked state with copy; approval unlocks without reload (next pulse). **(rev 3, PD68)** The sandbox is bounded platform-wide: 50 sandboxes per day (then waitlist), 20 MiB before submit / 100 MiB after per store, one shared 5,000 MiB disk budget, a 10 % AI slice; the human check is required in `approval` / `open`. | `test:db` case 13 · attack cases 13-14 · e2e steps 1 and 17 |
| PL-03 | Signup risk score | R1 | P1 | §3.4 | Golden fixtures produce the exact score/flags; MX timeout ≤ 2 s fails open; no raw e-mail/phone/IP in `signals`. | `test:platform` (≥ 30 golden fixtures with injected deps, the MX-timeout fixture) · attack case 8 (no raw e-mail / phone / IP in `signals`) |
| PL-04 | Approval queue | R1 | P1 | §3.5 | Each of `A` / `I` / `R` / `S` decides the focused row with one key and writes exactly one audit row and one store notification; two concurrent decisions on one row → one wins, the other answers `already_decided`; `Shift+A` approves only fast-lane rows without a hold-class flag (≤ 50 per call); the counterfactual line equals `bandFor()` re-scored without the pivot flag; tenant HTML renders only in the sandboxed iframe; a second appeal on one rejection is refused. | `test:platform` (`explainBand` vs `bandFor` on every fixture) · `test:db` case 1 · attack case 1 · e2e step 1 · `qa:wow-demo` persona 2 (1:25) |
| PL-05 | Platform pulse overview | R1 | P1 | §5 | KPI row, needs-attention, activity feed render from real data only; each panel fails independently. | `test:db` case 10 (`EXPLAIN` + `--perf` overview ≤ 800 ms p95, one throwing panel) · attack case 2 (k-suppression) |
| PL-06 | Stores list | R1 | P1 | §6 | Filters status/mode/plan/market/band/flag/dormant; health chips; sort by health; ≤ 300 ms p95 on 2,000 stores. | `test:db` case 10 (stores list ≤ 300 ms p95 on 2,000 stores; the CSV has no `@` outside its header) |
| PL-07 | Store profile | R1 (6 tabs); Catalog & pages, Integrations health, Domains, Risk, Media, Ops R2; Support R3 | P1 (S6, D5) | §7 | R1: Overview with ten detail strips (PD55), Orders (masked), Team, Activity (+ Timeline view), Usage & plan, Notes; PII masked; reveal ↑ with reason; every strip and tab has loading / empty / error states; deferred tabs are honest lines, never placeholder numbers. | attack case 1 (canaries absent per tab and strip) · `test:db` case 10 (Overview ≤ 900 ms with one strip throwing) · e2e step 6 (states at 1280 / 360) |
| PL-08 | Lifecycle actions | R1 | T1, P1 | §8 | Every core §A.5.1 edge available with reason codes, step-up where marked, notification and audit. | `test:platform` (`lifecyclePreview` pure parts) · `test:db` cases 3 and 11 · e2e step 12 |
| PL-09 | Store export ZIP (UI) | R1 | P8 (engine), P1, P2 | §7.14, §22.11 | Owner requests and downloads from Danger zone; super_admin from the profile with reason; both audited. | attack case 7 (tampered / foreign signature, no step-up) · e2e step 19 (step-up ladder on the export) |
| PL-10 | Read-only "View as store" | R1 | T2, P1, P2 | §10 | Start writes one `store.impersonation_started` notification with reason and window; every store action during the session answers `impersonation_read_only` and audits `platform.impersonation.write_refused`; the ribbon's countdown differs by < 1 s across two tabs; the session ends itself at expiry (fake clock); End lands on the profile's Activity tab with the session listed; no customer canary appears in any tenant route's HTML or RSC payload. | `test:db` cases 9, 12 and 14 · attack case 15 · e2e step 3 |
| PL-11 | Plans, entitlements, usage meters | R1 | T1, P1, P2 | §9, §22.10 | Lowering a limit previews the exact count and up to 20 handles of stores already above it before save; `take_orders` cannot be set false by a plan or an override (server refusal); a boost past its expiry is ignored by `entitlement()` and deleted after 30 days; a quota refusal opens the limit sheet with the meter, never a toast. | `test:platform` (`PlanImpact.examples` order and cap) · `test:db` cases 2 and 4 |
| PL-12 | Kill switches | R1 | T1, P1 | §12 | 7 switches with step-up, banner preview, affected count; tenant banners within 45 s (30 s flag cache + one 15 s pulse). | `test:platform` (`flagValue` order, rollout stability) · e2e step 4 |
| PL-13 | Notification centre | R1 | P1 (`notify`), P2 (UI) | §18, §22.6 | A kind without ar, fr or en texts fails `npm test`; an agent never reads a `store_role` row addressed to owners; 50 parallel batched inserts give one row with count 50; reading 50 notifications costs two queries; the unread count arrives through the pulse. | `test:platform` (kind `vars` schemas free of PII keys) · `test:i18n-coverage` · `test:db` case 6 |
| PL-14 | Platform settings + legal templates | R1 (platform DPA R2, RF §3.3) | P1 (S6 for the DPA) | §13 | Brand, signup, defaults, reserved handles, protected brands, legal versions with acceptance counts; R1 legal kinds = ToS, Privacy, AUP and the store templates; the design gate field group (`platform_design`, P6's component) mounted on General. | `test:platform` (`renderMarkdownLite` escaping, schema defaults) · `test:db` case 8 |
| PL-15 | Support grants + break-glass write | R3 | D5 | §24.1 | Owner grant 24/72 h scoped; break-glass write ↑ with crimson ribbon and instant notice. | R3 contract step (D5): its own attack cases |
| PL-16 | Tickets inbox | R3 | D5 | §20.2 | Auto-context, macros ar/fr/en, assignment, SLA, appeals, view-as from a ticket. | R3 contract step (D5) |
| PL-17 | Broadcasts and changelog | R3 | D5 | §19.2 | Targeted announcements, maintenance banners, "What's new" drawer, seen/click counts without per-user tracking beyond read state. | R3 contract step (D5) |
| PL-18 | Store health score + dormancy (= **SF-03** Store Health, raised and tenant-facing; core D53) | **R1** (PD6; re-engagement R3) | P1 (engine, job, console ring, platform rules), P2 (tenant ring and issue list), rules per track | §6.3, §22.16 | One `store_health` row per store; score = 100 − Σ group penalties (caps 20/15/15/15/15/15/5); refreshed ≤ 5 min after a platform action, a publish or a zone / integration change (dirty mark) and otherwise once per measured cycle (≤ 60 min up to ≈ 120 active stores, rev 4 PD78; the cycle is shown, never promised); ≤ 20 issues stored, 5 shown with evidence `n` and one fix each; snooze 7 days audited; dormant tag at 60 days; the two-store fixture proves no cross-store evidence. | `test:health` · `test:health-db` · e2e step 13 · `qa:wow-demo` 2:50 |
| PL-19 | Global analytics | R3 | D5 | §21 | Activation funnel, placed/confirmed/delivered GMV labelled, mode mix; k ≥ 5 suppression. | R3 contract step (D5): k-suppression fixture |
| PL-20 | Abuse reports + takedowns | R3 (**report link and insert-only store R1**, rev 3, PD70) | P1 (R1 slice), D5 | §24.2 | R1: "Report this store" on every public page, `/report/<handle>` writes `abuse_reports`, new reports count in Needs attention and the Risk strip; R3: queue, page/media takedown through a platform write scope. | R1 slice: `test:db` case 15 · attack case 17 · e2e step 16; R3: D5 |
| PL-21 | Ownership transfer | R3 | D5 | §24.3 | Two-sided confirmation, audited, old owner becomes admin or leaves. | R3 contract step (D5) |
| PL-22 | UTS #39 skeletons + mixed-script check | R3 | D5 (D1) | §3.4.4 | Vendored `confusables.txt`; skeleton match flags homographs; mixed Latin+Cyrillic handle names flagged. | R3 (`test:platform` skeleton fixtures added with the vendored table) |
| PL-23 | Manual billing, then a payment provider | later | — | §24.4 | `payments_manual` sketch; no prices until the owner decides. | — (later) |
| PL-24 | Web Risk URL checks, VPN/ASN signal | later | — | §24.5 | Optional Google key; ASN dataset only if a reliable free one exists. | — (later) |
| PL-25 | Help centre + CSAT | later | — | §24.6 | In-app articles, one-tap rating after a ticket. | — (later) |

### PLA-§1.2 Tenancy, product side (TN-*)

The tenancy mechanics are the core's (core §A-§F). This part owns how they look and feel.

| ID | Product-side scope here | R | Track | Section | AC (summary) | Proven by |
|---|---|---|---|---|---|---|
| TN-01 | Console views of the store row (status, mode, plan, market, currency, timezone, category, brand seed hidden) | R1 | P1 | §6, §7 | Every `stores` field a staff member needs is visible; none is editable outside a defined action. | attack case 1 · e2e step 6 |
| TN-02 | The seam's error codes become premium states (`not_found`, `forbidden`, `read_only`, `impersonation_read_only`, `quota`, `feature_off`, `step_up`) | R1 | P2, P1 | §22.8, §22.9 | Each code maps to one component (toast, sheet or page) with ar/fr/en copy; no raw error text. | `test:i18n-coverage` (every code's copy) · e2e steps 4 and 17 (limit sheet, banners) |
| TN-03 | Store #1 shows as `internal`, owner = the converted super_admin; the console never offers "delete" without a purge request | R1 | P1 | §7.1 | Store #1 renders like any store with an "Internal" chip. | e2e step 6 (store #1 renders with the Internal chip) · `test:db` case 3 (no purge without a request) |
| TN-04 | Platform settings screens (PLA-§13) and store settings pages owned by P2 (general, market, plan, address, security, danger) | R1 | P1, P2 | §13, §22.10-§22.11 | Settings saved through the core registries; secrets only "set / not set". | `test:platform` (`PlatformSettingSchema` / `OnboardingSchema` parse `{}`) · `test:db` case 8 |
| TN-05 | Public auth UI: `/login`, `/login/verify`, `/signup` (two steps), `/reset/<token>` | R1.0 functional (T2), R1 polish (P2) | T2, P2 | §22.1 | ar/fr/en, RTL, 360 px, Turnstile challenge state, generic answers (no enumeration). | e2e steps 1, 5, 6 and 18 · `test:i18n-coverage` |
| TN-06 | Invite creation, share (copy, WhatsApp, QR) and acceptance screens | R1 | T2, P2 | §22.4, §22.1.4 | Link shown once; e-mail-bound states; masked e-mails; seats meter. | e2e step 5 · `test:db` case 20 (compare-and-set acceptance) |
| TN-07 | Store picker `/app` and the sidebar store switcher | R1 | P2 | §22.3 | Logo/monogram, mode badge, status pill, role; keyboard; client state cleared on switch (core §B.4). | e2e step 6 · attack case 6 (no cross-store result after a switch) |
| TN-08 | Role picker and plain-language role explainer | R1 | P2 | §22.4.4 | Only `invitableRoles()` offered; rank rule enforced in UI and server. | `test:platform` (`roleSummary` agrees with `can()`) · `test:permissions` |
| TN-09 | Store mode cards in onboarding and Settings → General; hide-never-delete explanation | R1 (landing only), R2 (store/both) | P2 | §22.2, §22.10.1 | Disabled modes show "Coming soon" + interest request (PD30). | `test:platform` (`modeSummary` bullets vs `modeAllows`) · e2e step 6 |
| TN-10 | Console cases added to the attack suite and the action replay | R1 | P1, P2 | §O.3 | PLA attack cases green (analyst notes, support reveal, tenant → console actions, masked JSON canaries). | `scripts/qa/tenancy-cases/platform.ts` cases 1-20 |
| TN-11 | Every PLA cache is a `scopedCache`; every PLA bucket is a `Bucket` | R1 | P1, P2 | §M.5 | Lint L4/L5 green with no new allow-list entry. | `test:tenancy-lint` (core L4 / L5, no new allow-list entry) |
| TN-12 | Accountant role (R2) and viewer role (R1) in the role picker and explainer | R1 viewer / R2 accountant | P2 (S3) | §22.4.4 | Roles appear only when `ACTIVE_STORE_ROLES` includes them. | `test:platform` (`roleSummary` per `ACTIVE_STORE_ROLES`) |
| TN-13 | "Require 2FA for members" toggle (Settings → Security) | R1 (core D12) | P2 | §22.10.3 | Only an owner with TOTP can switch it on; lists members without 2FA; they are sent to enrolment next request. | `test:db` case 17 (only an owner with TOTP can switch it on) |
| TN-14 | External confirmation team | later | — | §24.7 | Scope note only. | — (later) |

### PLA-§1.3 Admin UX (UX-*)

| ID | Feature | R | Track | Section | AC (summary) | Proven by |
|---|---|---|---|---|---|---|
| UX-01 | Onboarding wow flow (no model download on the critical path, core D59) | R1 | P2 (+ P6/P7 pieces) | §22.2 | On a 390 px viewport with 4G throttling and Cloud AI off: reveal at ≤ 0:50 from the invite link in `qa:wow-demo` (generation ≤ 1.5 s, preview ≤ 1 s), ≤ 90 s with 3 photos on a 4×-throttled laptop, ≤ 15 s after "Start without photos"; never a price the owner didn't type; 360 px; ar RTL perfect; the local model cache stays empty for the whole run. | e2e steps 2 and 15 · `qa:wow-demo` persona 1 (0:00-0:50) |
| UX-02 | Store-scoped ⌘K (tenant) + console ⌘K | R1 | P2 (tenant), P1 (console) | §22.13, §4.4 | Tenant search scoped (ADM-02 fixed) through the core `SearchProvider` and `CommandDef` registries (core §I.3); console jumps to store/user/order, approve next, start view-as; palette open ≤ 50 ms when warm. | attack case 6 · e2e step 10 (`qa:admin-perf`: palette ≤ 50 ms) |
| UX-03 | Console identity | R1 | P1 (+ P2 tokens) | §4.2, §4.7 | Teal-cyan hue 205 accent, "Platform" badge, violet ribbon; admin-tokens, admin-motion and admin-rtl checks green on every console screen. | `test:admin-tokens` · `test:admin-motion` · `test:admin-rtl` |
| UX-04 | Admin upgrade | R2 | S6 (design.md owns depth) | §24.8 | Platform screens adopt the full DES-§16.17 checklist; the R1 foundation is core §I.6 / §I.8 applied by P2 (§22.18). | R2 (S6): design.md DES-§16.17 checklist |
| UX-05 | Live address card (copy, QR, WhatsApp share, test-order link, campaign entry) | **R1** (raised, RF §3.2, core §I.4; PD61) | P2 (card), P3 (test-link and kit entries) | §22.10.2 | The card appears on the pages list, the dashboard after the first publish and the onboarding end; QR encodes the canonical URL; "Open a test order" mints a D54 token; the state line is honest (Live / Not live yet / Hidden while in review). | attack case 12 · e2e step 6 (one snapshot in three places) · `qa:wow-demo` 1:40 |
| UX-06 | Realtime dashboards | R2 | S6 | §22.6.4 | Animated arrivals on the 15 s pulse, honest "live · 12 s ago" dot. | R2 (S6) |
| UX-07 | PWA + Web Push | **R1 manifest** (PD10), R3 push | P2, D5 | §23 | R1: installable `/app/` manifest served by the route handler with the core §B.1 / §C.3 header rule (no nonce headers); R3: push for new orders/callbacks with no PII in payloads. | e2e step 7 (manifest valid, no service worker) |
| UX-08 | French + Arabic RTL dashboard | R2 fr / R3 ar | S6, D5 | §N.1, §22.18 | Catalog coverage report 100 % for the release's surfaces; the R1 RTL lint (`test:admin-rtl`) keeps the R3 cost at translation only. | `test:i18n-coverage` (coverage per prefix) · `test:admin-rtl` |

### PLA-§1.4 Other ids this part delivers screens for

| ID | Scope here | R | Track | Section | Proven by |
|---|---|---|---|---|---|
| SE-01 | Staff roles UI, staff invites, mandatory 2FA, step-up sheet | R1 | P1, P2 | §14, §22.12 | `test:db` case 7 · e2e step 6 (staff screens) |
| SE-04 | Platform audit view, break-glass log (reveals, impersonations, purges, kill changes) | R1 | P1 | §14.3 | `test:db` case 19 (break-glass rows link to actor and target) |
| SE-09 | Passkeys | later | — | §24.9 | — (later) |
| OS-06 | Console Domains view and domain-move checklist | R1 | P1 | §16 | `test:db` case 19 (checklist survives a restart; V3 on the temporary domain answers "S mode is off" without a network call) |
| OS-09 | Health UI over `getHealth()` (data by P8) incl. the Edge / Worker, render queue, health engine, AI and design-tables panels (PD57, core §H.5 rev 2) | R1 | P1 | §15 | `test:db` case 19 (cron stopped 11 min on a fake clock → one alarm per hour; render job pending 61 min → `render_stuck` once) |
| OS-10 | Backups list, retention, download ↑ | R1 | P1 | §17 | `test:db` case 19 (manifest checksums; download without fresh step-up → `step_up`) |
| IN-08 | Mail transport dependency choice (`nodemailer`, PD41) and the mail settings screen `platform_mail` | R2 | S5 | §13.5 | R2 (S5) |
| OS-12, OS-13 | Console tiles for the Worker edge cache (purge status) and Worker alerts | R2 | S6 | §16.4 | R2 (S6) |
| OS-14 … OS-18 | Console custom-domain approvals (queue kind `domain`) and the Domains view rows for `store_domains` | R3 | D1 | §16.5 | R3 (D1) |

### PLA-§1.5 Signature features assigned to this part (RF §1, §3.1; core §K.2 ownership paragraph) (rev 2)

| ID | Feature | What this part owns | R | Track | Section | AC (summary) | Proven by |
|---|---|---|---|---|---|---|---|
| SF-03 | Store Health with reasoned fixes (= PL-18 raised) | the engine, registry imports, `platform.health` job, console ring and flags, the platform rules file (P1); the tenant ring, issue list, snooze and "Recompute now" (P2); `health.issue_new` kind | R1 | P1, P2 | §6.3, §22.16 | `test:health` and `test:health-db` green; the ring and the console flags come from one row; fixing an issue never lowers the score; a two-store fixture shows no cross-store evidence; the setup checklist is gone. | `test:health` · `test:health-db` · e2e step 13 · `qa:wow-demo` 2:50 |
| SF-06 | Pulse ETag + shared poller | the GET route, `ETag` / `304`, the `BroadcastChannel` election, the `usePulse()` hook, `contributors/shell.ts`, `test:pulse`, `qa:pulse-e2e` | R1 | P2 | §22.6 | Two tabs of one browser produce one poller; unchanged polls answer 304; a status or review change unlocks controls within one pulse without a reload. | `test:pulse` · e2e step 11 (`qa:pulse-e2e`) |
| SF-11 | Growth Autopilot, R1 slice = the Today brief line | the template sentence on the dashboard from `opsPulse` + `store_health`, never a model text in R1 | R1 (line) / R3 | P2 (D4) | §22.17 | The line renders from zero data ("No orders yet. Publish a page to start."); every number in it comes from the store's own counts. | `test:platform` (`TodayBrief` from zero data renders `brief.empty`) · `qa:wow-demo` 2:50 |
| SF-05 | Test-order mode, address-card slot | the "Open a test order" slot on the address card (P3 fills it with `mintTestLink`), the TEST chip in the tenant shell's banner priority (none: the chip belongs to P4's queue) | R1 | P2 (slot), P3 (button) | §22.10.2 | The slot renders P3's button on the pages list, the dashboard and the onboarding end; nothing of this part mints or reads test tokens. | attack case 12 · `qa:wow-demo` 1:40 |
| SF-01 | Campaign Kit, address-card slot and ⌘K entry | the "Create a campaign" slot (P3 fills it) and the Create menu entry `campaign` (landing/both) in the shell | R1 | P2 (slots), P3 | §22.10.2, §22.13 | The entry is hidden without `campaigns.write` and in `store` mode without "also use landing pages". | `test:platform` (command and slot filtered by `campaigns.write` and mode) |

---

## PLA-§2. Data: refined tables, new tables, settings keys

Rules (core §D.1): tenant rows use `storeRef()`, platform rows `storeRefOpt()`; JSON is `jsonText`; enums only append;
portable SQL only. Refinements of **0004** tables below are additive (NULL-able or defaulted columns, appended enum
values, new indexes): the maintainer writes them into `0004_tenancy.sql` if step C0 has not been cut yet, otherwise
into `0005_r1.sql`. R3 tables are refined for `0007_r3.sql`. **(rev 4)** Core revision 3 decided the round-1 placement
questions: `orders.is_test`, `leads.is_test`, `orders_store_test_idx` and `page_slug_history` are cut in **0004**
(core §D.2 / §D.3 / §D.4, PLA Q3.7 accepted), so this part's Orders tile, heartbeat and Identity strip read them from
R1.0 on and the "no-op when absent" hedge below only covers stale test fixtures; `abuse_reports` is in **0005** (core
§D.3 row, D76). **(rev 2)** Every refinement of PLA-§2.1 was accepted
(core §Q.1 Q.24) and is now listed in core §D.4 "Part refinements applied to the 0004 tables in rev 2"; the tables
marked **(new)** in revision 1 (`store_health`, `platform_requests`, `staff_invites`) are core tables of 0005 (core
§D.3, §D.5) with this part as the column owner (core §D.9). Nothing below asks the core for anything, with two
rev 3 exceptions recorded in PLA-§Q.3: **(ENGC-1)** the console's Orders tile (PLA-§5.2) and the commerce heartbeat
(PLA-§15.1) filter `orders.is_test = 0`, and the Identity strip (PLA-§7.3) counts `page_slug_history`; this part
builds against those columns wherever the core places them (the review asks the core to move `orders.is_test`,
`leads.is_test`, `orders_store_test_idx` and `page_slug_history` into 0004 because R1.0 code writes them), and the
tile's filter is a no-op when the column is absent in a test fixture, never a failing query. **(SEC-18, PD70)**
`abuse_reports` moves from 0007 to **0005** with the insert-only columns of PLA-§2.2 (the triage columns stay as
listed in PLA-§2.3 and are filled from R3).

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

### PLA-§2.2 R1 tables of this part in 0005 (accepted: core §Q.1 Q.1, Q.2, Q.4; final lists)

```ts
// 0005 — P* (one row per store, written only by the platform.health job; read by the console AND the tenant
// through getStoreHealth(scope); core D53, §D.5). Rev 2 adds `issues`, `snoozed` and types `components` by HealthGroup.
export const storeHealth = mysqlTable("store_health", {
  storeId: varchar("store_id", { length: 26 }).primaryKey().references(() => stores.id, { onDelete: "restrict" }),
  score: tinyint("score").notNull(),                                   // 0-100, one number for both audiences (PLA-§6.3)
  attention: tinyint("attention").notNull().default(0),               // max console flag severity: 0 none, 1 info, 2 warn, 3 danger
  flags: jsonText<HealthFlag[]>("flags").notNull(),                   // console flags (PLA-§6.3 codes), never shown to tenants
  issues: jsonText<HealthIssue[]>("issues").notNull(),                // tenant issues with evidence + fix (core §I.7; ≤ 20 stored, 5 shown)
  components: jsonText<Record<HealthGroup, number>>("components").notNull(),   // penalty per group (setup, trust, design, conversion, operations, integrations, quota)
  metrics: jsonText<HealthMetrics>("metrics").notNull(),               // PLA-§6.3: orders7d, risky7d, lastActiveAt, lastOrderAt, publishedPages, mediaPct
  milestones: jsonText<Partial<Record<Milestone, string>>>("milestones"),   // ISO date each milestone was first reached (PD40)
  snoozed: jsonText<Record<string, string>>("snoozed"),                 // issue id → ISO until (health.snooze, audited; PD67)
  dormant: boolean("dormant").notNull().default(false),
  computedAt: ts("computed_at").notNull(), dirtyAt: ts("dirty_at"),   // dirtyAt: set by markHealthDirty() for priority recompute
}, (t) => [index("sh_attention_idx").on(t.attention, t.score), index("sh_due_idx").on(t.dirtyAt, t.computedAt)]);
// Size bound: issues ≤ 20 × ≤ 600 B, flags ≤ 15 × ≤ 120 B, so a row stays under 16 KB; `issues[].evidence` holds numbers,
// metric names and windows only, never a customer field (canary test PLA-§O.3 case 8).

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

// 0005 — P: staff invite tokens (PD13; core §B.1 `/invite/staff/<token>`, §D.5 verbatim)
export const staffInvites = mysqlTable("staff_invites", {
  id: id26().primaryKey(), emailNorm: varchar("email_norm", { length: 191 }).notNull(),
  role: mysqlEnum("role", ["admin", "support", "analyst"]).notNull(), tokenHash: char("token_hash", { length: 64 }).notNull(),
  invitedBy: id26("invited_by").notNull(), note: varchar("note", { length: 200 }), expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"), acceptedBy: id26("accepted_by"), revokedAt: ts("revoked_at"), createdAt: createdAt(),
}, (t) => [uniqueIndex("sti_token_uq").on(t.tokenHash), index("sti_email_idx").on(t.emailNorm)]);

// 0005 — P* (rev 3, PD70, SEC-18): public abuse reports, insert-only in R1 (the R3 triage fills handled_by / handled_at /
// action_taken, PLA-§2.3). Moved from 0007; the registry row becomes "0005 · abuse_reports · P* · platform · public reports".
export const abuseReports = mysqlTable("abuse_reports", {
  id: id26().primaryKey(), storeId: storeRef(),                            // the reported store (resolved from the handle at insert)
  pageUrl: varchar("page_url", { length: 500 }),                           // the path the reporter was on, same host only, query stripped
  reason: mysqlEnum("reason", ["phishing", "scam", "counterfeit", "prohibited", "impersonation", "other"]).notNull(),
  details: text("details"),                                                // ≤ 2,000 chars, plain text
  reporterContactEnc: text("reporter_contact_enc"),                        // envelope v2, scope platform, purpose "abuse:contact"; optional
  status: mysqlEnum("status", ["new", "triaged", "actioned", "dismissed"]).notNull().default("new"),
  actionTaken: varchar("action_taken", { length: 40 }), ipHash: char("ip_hash", { length: 64 }).notNull(),
  handledBy: id26("handled_by"), handledAt: ts("handled_at"), createdAt: createdAt(),
}, (t) => [index("ar_status_idx").on(t.status, t.createdAt), index("ar_store_idx").on(t.storeId, t.createdAt), index("ar_ip_idx").on(t.ipHash, t.createdAt)]);
// Writer in R1: `recordAbuseReport()` (src/lib/platform/abuse-report.ts, P1) from the public page `/report/<handle>` only;
// readers in R1: the console counts (Needs attention, Risk strip, Overview strip 9). Purged with the store (core §F.9 list, kept 400 days like audit).
```

```ts
// src/lib/health/types.ts (maintainer skeleton, core §I.7; copied here so this part's code compiles against it)
export type HealthGroup = "setup" | "trust" | "design" | "conversion" | "operations" | "integrations" | "quota";
export const HEALTH_CAPS: Record<HealthGroup, number> = { setup: 20, trust: 15, design: 15, conversion: 15, operations: 15, integrations: 15, quota: 5 };   // Σ = 100
export interface HealthEvidence { metric: string; value: number; baseline?: number; window: string; n: number }
export type HealthFix = { kind: "link"; href: (handle: string) => string; label: MessageKey } | { kind: "action"; actionId: string /* a CommandDef.id, PD66 */; label: MessageKey };
export interface HealthIssue { id: string /* "<track>:<rule>" */; group: HealthGroup; severity: 1 | 2 | 3; points: 3 | 6 | 10; evidence: HealthEvidence; fix: HealthFix; text: MessageKey; snoozedUntil?: string }
export interface HealthRule { id: string; group: HealthGroup; minN?: number; release: "R1" | "R2" | "R3"; mode?: ModeFeature; collect(scope: StoreScope, inputs: HealthInputs): Promise<HealthIssue | null> }

// src/lib/platform/types.ts (P1): the console-only flags and metrics kept from revision 1
export type HealthFlagCode =
  | "sheets_backlog" | "sheets_error" | "outbox_dead" | "capi_failing" | "telegram_failing"
  | "quota_high" | "quota_full" | "risky_orders" | "inactive_14d" | "dormant_60d"
  | "setup_incomplete" | "render_failed" | "review_waiting" | "restricted" | "suspended";
export interface HealthFlag { code: HealthFlagCode; severity: 1 | 2 | 3; since: string /* ISO */; value?: number; detail?: string /* key, metric or kind */ }
export interface HealthMetrics { orders7d: number; risky7d: number; lastActiveAt: string | null; lastOrderAt: string | null; publishedPages: number; mediaPct: number | null }
export type Milestone = "first_draft" | "first_publish" | "first_order" | "tenth_order" | "first_member" | "first_delivered";
/** the row as both audiences read it (tenant: flags omitted; console: everything) */
export interface StoreHealthView { score: number; attention: 0 | 1 | 2 | 3; components: Record<HealthGroup, number>; issues: HealthIssue[]; snoozed: Record<string, string>; metrics: HealthMetrics; milestones: Partial<Record<Milestone, string>>; dormant: boolean; computedAt: string; dirty: boolean; flags?: HealthFlag[];
  staleAfterMin: number /* rev 4, PD78: max(platform.health.staleAlarmMinutes, 1.5 × the job's measured cycleMin), from the last platform.health job_runs.summary, cached with the view */ }
```

Rules: a `platform_requests` row of kind `store_purge` is valid only while the store is `closed` or
`scheduled_deletion`; a second pending request for the same store and kind is refused (`already_requested`). A
request expires after 7 days without confirmation (`expired`, by the `platform.requests` job). The requester can never
confirm their own four-eyes request (checked in SQL: `confirmed_by <> requested_by`). Rows are kept 400 days after a
purge, like audit (core §F.9). `staff_invites`: 72 h, single use, bound to the e-mail, ≤ 10 pending, expired rows
deleted 30 days after expiry by `lifecycle` (core §H.2 slot 7, §H.11).

### PLA-§2.3 R3 tables this part refines (0007) and later tables

| Table | Columns (final for its migration) | Keys |
|---|---|---|
| `support_grants` (0007) | core + `granted_to enum('support','any_staff') NOT NULL DEFAULT 'support'`, `scope longtext` (areas from `SUPPORT_GRANT_AREAS` = `pages`, `media`, `settings_basic`, `catalog`; never `members`, `security`, `integrations`, `billing`, `payouts`, `export`), `note varchar(300)`, `created_at`, `last_used_at` | `(store_id, expires_at)` |
| `tickets` (0007) | `id`, `store_id NULL`, `user_id`, `subject varchar(160)`, `kind enum('question','bug','billing','appeal','abuse_report','domain','other')`, `status enum('open','pending','solved','closed')`, `priority enum('low','normal','high','urgent')`, `assignee_id NULL`, `sla_due_at`, `context longtext` (store handle, path, build id, UA label, last 5 client error codes; never customer data), `last_message_at`, `csat tinyint NULL`, `created_at`, `updated_at` | `(status, sla_due_at)`, `(store_id, created_at)`, `(assignee_id, status)` |
| `ticket_messages` (0007) | `id bigint`, `ticket_id`, `author_kind enum('user','staff','system')`, `author_id`, `body text` (≤ 4,000 chars, plain text), `attachments longtext` (asset ids of the ticket's store, `asset_refs.owner_kind='ticket'`), `internal bool`, `created_at` | `(ticket_id, id)` |
| `broadcasts` (0007) | `id`, `kind enum('announcement','changelog','maintenance','message')`, `placement enum('bell','banner','drawer')`, `audience longtext` (`BroadcastAudience`, §19.2), `title longtext` / `body longtext` / `cta longtext` (`{ ar, fr, en }`, markdown-lite §13.6), `starts_at`, `ends_at`, `dismissible bool`, `status enum('draft','scheduled','live','ended')`, `created_by`, `published_at` | `(status, starts_at)` |
| `broadcast_reads` (0007) | core (`broadcast_id`, `user_id`, `seen_at`, `clicked_at`, `dismissed_at`) | PK `(broadcast_id, user_id)` |
| `abuse_reports` (**moved to 0005 in rev 3**, PD70; the full definition is in PLA-§2.2) | `id`, `store_id`, `page_url varchar(500)`, `reason enum('phishing','scam','counterfeit','prohibited','impersonation','other')`, `details text` (≤ 2,000), `reporter_contact_enc text NULL` (envelope v2, scope platform, purpose `abuse:contact`), `status enum('new','triaged','actioned','dismissed')`, `action_taken varchar(40)`, `ip_hash`, `handled_by`, `handled_at`, `created_at`; R1 writes only `new` rows, R3 (D5) fills the triage columns | `(status, created_at)`, `(store_id, created_at)`, `(ip_hash, created_at)` |
| `store_daily_rollup` (0007) | core + `views`, `uniques`, `form_starts`, `confirmed`, `delivered`, `returned`, `fake`, `leads`, `leads_recovered`, `ai_credits`, `members_active`, `currency char(3)` | PK `(store_id, day)` |
| `support_macros` (0007, core §D.3; Q.20 accepted) | `id`, `title varchar(80)`, `body_ar text`, `body_fr text`, `body_en text`, `tags longtext`, `created_by`, `updated_at` | — |
| `push_subscriptions` (0007, core §D.3; Q.21 accepted) | `id`, `user_id`, `store_id NULL`, `endpoint_hash char(64)`, `endpoint_enc text`, `keys_enc text` (p256dh + auth, envelope v2 scope platform, purpose `push:sub`), `ua_label`, `created_at`, `last_ok_at`, `failures tinyint`, `disabled_at` | `UNIQUE(endpoint_hash)`, `(user_id)` |
| `notification_prefs` (0006, core §D.3; Q.22 accepted) | `user_id`, `store_id varchar(26) NOT NULL DEFAULT ''` ('' = every store), `group varchar(16)`, `channels longtext` (`{ inapp: true, push: bool, email: bool }`), `updated_at` | PK `(user_id, store_id, group)` |

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
    pendingMediaMiB: z.number().int().min(10).max(1024).default(100),   // read by applyStateCap (PLA-§Q.8): the cap AFTER "Submit for review"
    pendingMediaMiBBeforeSubmit: z.number().int().min(5).max(200).default(20),   // rev 3 (PD68): the cap until the review row has submitted_at
    pendingMediaTotalMiB: z.number().int().min(500).max(50_000).default(5_000),   // rev 3 (PD68): one disk budget shared by every pending store (platform_usage "pending_media_bytes")
    pendingStoresPerDay: z.number().int().min(1).max(1_000).default(50),          // rev 3 (PD68): sandboxes created per platform day; the next applicant joins the waitlist for that day
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
  health: z.object({                                                    // rev 2 (PD67): tunables of the shared engine the owner may change without a deploy
    issueNotifyMinSeverity: z.union([z.literal(2), z.literal(3)]).default(3),   // `health.issue_new` fires at this severity or above
    snoozeDays: z.literal(7).default(7),                                // fixed in R1 (core §I.7 "snooze 7 days"); a literal so the UI copy never drifts
    staleAlarmMinutes: z.number().int().min(15).max(240).default(60),   // `staff.alarm` when the oldest snapshot is older than this
    showScoreToTenantsBelowN: z.number().int().min(0).max(100).default(0),   // 0 = always; > 0 hides the number (not the issues) until the store has that many orders
  }).default({}),
  lifecycle: z.object({                                                 // rev 2 (PD54)
    armSeconds: z.number().int().min(3).max(15).default(5),             // client-side cancel window before a lifecycle write
    cooldownMinutes: z.number().int().min(0).max(120).default(10),      // a second change on the same store inside this window needs the typed handle
  }).default({}),
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
  pageId: z.string().length(26).nullable().default(null),    // the draft created from the chosen direction (landing / both)
  firstKind: z.enum(["landing", "product"]).default("landing"),   // rev 3 (PD60, OPS-14): what the reveal produced; "product" in store mode (R2)
  productId: z.string().length(26).nullable().default(null), // rev 3: the first product created by useDirectionAction in store mode (R2)
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
| `invite` (default while S mode is off, **and while `platform_turnstile` is unset even in S mode**, core D9 rev 5, CRIT2-13) | the two-step form with an "Invite code" field first | `pending`, or `active` when the code has `auto_approve` | codes `SG-` + 12 Crockford chars (core §B.6) |
| `approval` (default once S mode is on **and the domain check V13 has passed**, i.e. a configured `platform_turnstile`, the new hostnames and a verified test token, core D9 / §B.2 / §C.10, one rule since rev 6) | the two-step form | `pending` | Turnstile **required** (rev 3, PD68: a missing or invalid token is refused with `auth.signup.challenge`, never scored; **rev 5, CRIT2-13: the mode itself needs a configured widget**, `savePlatformSettingsAction` refuses `approval` / `open` without one with `turnstile_required`, and a stored mode whose widget was removed falls back to `invite` with the alarm `signup_unguarded`, core §B.2, §H.5) |
| `waitlist` | e-mail + phone (+ optional "What do you sell?") | — | a `waitlist` row; staff promote rows to single-use codes (§3.3) |
| `open` | the two-step form, Turnstile **required** (a configured widget is a precondition of the mode, rev 5 CRIT2-13) | `active` when PD3 auto-approval passes, else `pending` | — |

`signups_enabled = false` overrides every mode: the form, `/app/new` and invite acceptance answer "closed for now"
(core §H.8). A mode change is audited (`platform.settings.updated`, meta `{ key: "signup.mode", from, to }`).

**Daily ceiling (rev 3, PD68, SEC-1; rev 4 aligned with core §B.2 step 6).** Whenever the new store would start
`pending` (`approval` and `open` modes, and `invite` mode with a code that has no `auto_approve`), `signupAction` and
the `/app/new` action call `chargePlatformUsage("pending_stores", <platform day YYYY-MM-DD>, 1, { limit:
signup.pendingStoresPerDay })` as core §B.2 **step 6, before** the step-7 transaction; a `QuotaError` makes the form
fall to the **waitlist behaviour for the rest of that day**: the applicant's e-mail, phone and mode interest are
written to `waitlist` with `source = "cap:<day>"`, the page shows `auth.signup.capped` ("A lot of sellers are joining
today. You're on the list and we'll send you an invite.") and no store, user or review row exists. When step 7 then
rolls back (duplicate e-mail or handle), the action calls `refundPlatformUsage("pending_stores", <day>, 1)` in its
`finally`, so a refused applicant never burns a slot. Paths that start the store `active` (an invite code with
`auto_approve`, `open`-mode auto-approval, a trusted creator's `/app/new` under PD31) skip the ceiling, as core §B.2
says. Revision 3's "invite mode is not counted" is withdrawn: a staff-made code without auto-approval still creates a
sandbox, and when the owner's own invites hit the cap the fix is to raise `pendingStoresPerDay` or to tick
`auto_approve` on the code (the Sign-up tab says so next to the counter). The console
shows "Today: 12 / 50 sandboxes" on the Sign-up settings tab and the overview's Queue snapshot; reaching the cap raises
the Needs-attention row and alarm `signup_capped` (info; core §H.5 name, rev 4: revision 3 called it
`signup_cap_reached`) so the owner can raise the number or invite the waitlist. The
counter is a `platform_usage` row (core §D.7), so a restart or a second process never loses it; `housekeeping` deletes
rows older than 7 days.

### PLA-§3.2 Signup settings in the console (`/admin/settings/signup`, tab **Mode & thresholds**)

Layout: a 5-option segmented control (Closed · Invite · Approval · Waitlist · Open) with one sentence under each; the
derived default is marked "Automatic — currently Invite, because your real domain isn't connected yet". Below: the
thresholds card (three linked numeric inputs drawn on one 0-100 bar showing the four bands in emerald, neutral,
yellow and crimson), the **sandbox ceilings card (rev 3, PD68)**: per-store media before submit (MiB) and after submit
(MiB), members, the shared pending media budget (MiB) with its live meter ("1,240 of 5,000 MiB used by 31 pending
stores", from `platform_usage.pending_media_bytes`), sandboxes per day with today's count ("12 / 50") and the AI slice
read-only ("10 % of the monthly AI cap, set in AI settings"), allowed markets (chips), trusted creators toggle, the
review target (hours, optional) and the weights table (each `SignupFlagCode`, its default points, an override input,
"Reset"). Saving runs `savePlatformSettingsAction({ section: "signup", patch })` (`platform.settings`). Choosing `open`
shows the inline warning `console.signup.open_warning` and needs the typed confirmation `open`. The Turnstile line
under the mode control is honest about the gate: "Human check: required in Approval and Open (configured)" or
"Human check: not configured. Approval and Open accept sign-ups without it" in yellow (PD68).

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
/** rev 2 (PD52): the counterfactual. Pure over the stored flags and the current thresholds; recomputed at read time. */
export interface BandExplanation {
  band: SignupBand;
  /** the single flag whose removal would lower the band the most, with the band it would give (null when none changes it) */
  pivot: { code: SignupFlagCode; bandWithout: SignupBand } | null;
  /** hold-class flags present (each alone keeps the row out of auto-approval and the fast lane) */
  holds: SignupFlagCode[];
  /** points to the next lower band boundary (0 for fast) */
  marginToLower: number;
}
export function explainBand(s: Pick<SignupScore, "score" | "flags">, t: SignupThresholds): BandExplanation;
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
| `turnstile_missing` / `turnstile_unverified` | the widget is configured but no token / the token failed. **Scored in `invite` mode only (rev 3, PD68)**: in `approval` and `open` the core §B.2 step 2 refuses the request before scoring, so these flags never appear on a store created in those modes (asserted in `test:platform`) | +20 / +10 | — |
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
   points (`+35`, tabular, crimson for positive, emerald for negative) and evidence chips, sorted by points. `partial`
   adds "Some checks timed out, so the score may be low." **(rev 2, PD52)** Under the list, the **counterfactual line**
   from `explainBand()`: "Without *disposable e-mail* this would be **Low risk**" (`console.queue.pivot`), or "Low risk
   needs 11 points fewer" (`console.queue.margin`), and, when hold-class flags exist, "Kept out of the fast lane by
   *linked to a banned account*" (`console.queue.hold`). The thresholds in force are shown as a small 0-100 bar with
   the score marked, so a staff member sees how close the call is.
3. **Business context** (when submitted): what they sell, social link (plain text with a Copy button, never an
   auto-link), WhatsApp number (masked), the staff question and the seller's answer.
4. **Draft evidence (rev 2, PD52)** above the preview: readiness (No page yet / Draft ready / Submitted), the newest
   draft's **Design check** summary from P6's `designHealth(scope)` (quality score, slop score, hard gates failing,
   as chips: "Q 78 · slop 1 · gates green"), the honesty item count from `buildChecklist(doc, ctx)` with the first
   item's title ("2 honesty items: a review section marked sample"), and the genome distance band to the nearest live
   store in the niche (`ok` / `close` / `too_close`, verdict bands only, core D64). Every chip links to the Pages
   strip of the profile. Nothing here is a model text. **(rev 4, ai.md R38, SEC-26)** One more chip reads the sandbox's
   AI use this month from `aiUsageForStore(scope, month)`: "AI 34 / 100 credits · $0.42", tinted yellow when the store
   has used ≥ 50 % of its pending credits **before** pressing "Submit for review" (a sandbox that burns credits without
   asking for review is a review signal, not a score flag: the score was computed at signup and stays explainable).
   For a `store`-mode store (R2) the readiness and Design-check chips read the first product page draft, and "No page
   yet" means no product draft either.
   **Draft preview:** a 9:16 sandboxed iframe (`sandbox="allow-scripts"`, never `allow-same-origin`) of the newest
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
fields carry no full phone or e-mail in the HTML or RSC payload for support/analyst (canary test, §O.3). **(rev 2,
PD52, PD65)** The counterfactual line agrees with `bandFor()` on every golden fixture (removing the pivot flag and
re-scoring gives exactly `bandWithout`); a submitted store appears in the Review tab within one console pulse
(≤ 15 s); `A` on the demo store commits in ≤ 1 s server time measured in `qa:wow-demo` (persona 2, RF §4 at 1:25)
and the seller's locked controls unlock on the next tenant pulse (≤ 15 s) without a reload; the draft-evidence chips
render "No page yet" for a store without a draft and never a number for an absent Design check.

### PLA-§3.6 The pending sandbox from the seller's side (PL-02)

State caps are core §A.5.2 (publish, orders and integrations off; media ≤ `signup.pendingMediaMiB`; members ≤
`signup.pendingMembersMax`, PLA-§Q.8). What the seller sees is §22.7 (review card) and §22.8 (banners and locked
controls). Every locked control stays visible with a lock glyph and the line "Unlocks after approval"
(`shell.locked.after_approval`); pressing it opens the review card, never an error.

**Ceilings (rev 3, PD68, SEC-1).** Four bounds hold the sandbox, each visible to the seller as a quota, never as an
error page:
1. **Two-tier media cap per store.** `applyStateCap("pending", { submitted })` returns `media_bytes = min(plan,
   signup.pendingMediaMiBBeforeSubmit MiB)` until the store's `signup` review row has `submitted_at`, then `min(plan,
   signup.pendingMediaMiB MiB)`; `submitted` comes from the cached review row (`sr_store_kind_idx`, invalidated by
   `submitForReviewAction`). The review card's "Works now" line names the current figure ("upload photos (up to 20 MB
   until you submit, 100 MB after)", `shell.review.works_now` with `{mediaMb}`); pressing "Submit for review" is the
   seller's own way to unlock the larger cap, so a drive-by sandbox never holds 100 MiB of disk.
2. **One shared disk budget.** Every upload of a `pending` store charges `chargePlatformUsage("pending_media_bytes",
   "total", bytes, { limit: signup.pendingMediaTotalMiB × MiB })` **before** the store's own `chargeUsage(media_bytes)`
   (core §G.4 step 4) and refunds it in the same `finally`; a `QuotaError` on the platform counter answers 413
   `{ error: "quota" }` with the limit-sheet reason `platform_budget` ("Store Gen is onboarding many sellers right now;
   uploads for stores in review are paused until some are approved", `shell.limit.reason.platform_budget`), never a
   500. `transitionStore(pending → active | rejected | closed)` refunds the store's `media_bytes` gauge from the shared
   counter through `refundPlatformUsage("pending_media_bytes", "total", bytes)` (T1, core §A.4 rev 3), and
   `usage.reconcile` recomputes it nightly as `SUM(store_usage.media_bytes) WHERE stores.status = 'pending'`; a failed
   upload after the charge refunds both counters in the upload route's `finally` (core §G.4 step 6).
3. **Sandboxes per day** (PLA-§3.1 daily ceiling): `signup.pendingStoresPerDay`.
4. **An AI slice.** Pending stores draw Cloud AI credits from `platform_ai.caps.pendingSharePct` (default 10 % of
   `monthlyUsd`, ai.md; PLA-§Q.3): the per-store `ai_credits_month = min(plan, 100)` of core §A.5.2 still applies, and
   on top the platform counter `platform_usage.ai_cost_micros_pending` is charged for every pending store's call;
   exhaustion answers **`quota_platform_pending`** (rev 4: the core §A.5.2 / ai.md code; revision 3 wrote
   `quota_platform`) to **pending** stores only, so approved stores keep their cap; the pending daily floor is **10
   credits** (core §A.5.2 rev 3, AI R30). The tenant shell maps the code to the limit sheet with the sandbox sentence
   (PLA-§22.8); the console AI panel (PLA-§15.1) shows the slice's use.

Acceptance (PL-02): in a pending store, generate → edit → preview → upload within the cap all work; publish, Sheets,
pixel CAPI tokens, Telegram, PHP export and handle rename show the locked state; approving the store unlocks them on
the next pulse (≤ 15 s) without a reload; nothing pending is reachable on a public URL except `/preview/<token>`.
**(rev 3)** An upload that would cross 20 MiB before submit answers `quota` and the same file succeeds after "Submit
for review"; with the shared budget seeded at its limit, an upload answers 413 `quota` with reason `platform_budget`
and the error log gains no 500; 60 signups in an hour from rotating /64 networks in `approval` mode produce at most
`pendingStoresPerDay` stores and the rest as `waitlist` rows with `source = "cap:<day>"`; a signup without a Turnstile
token in `approval` mode with the widget configured creates nothing (`test:db` case 13, attack cases 13-14).

### PLA-§3.7 Requests (kinds other than `signup` / `reopen`)

Created by the store owner from the limit sheet (§22.9), the plan page (§22.10.4), the mode cards (PD30) or, for a
restricted store, the restricted banner ("Ask for a review", kind `go_live`). One open request per kind per store
(`sr_store_kind_idx`), else `already_requested`; bucket `s:<sid>:request` 5/day. `createStoreRequestAction`
(`src/app/app/[store]/settings/plan/actions.ts`, P2) calls `createStoreRequest(ctx: StoreCtx, req: ReviewRequest)`
in `src/lib/platform/requests.ts` (P1). It is one of the tenant-callable functions in `src/lib/platform/**`. **Rev 6
P0b (CCR P1-12; the "two" of revision 3 undercounted them):** the tenant-callable functions are `createStoreRequest`,
`withdrawStoreRequest`, `listStoreRequests`, `getReviewCard`, `submitForReview`, `answerReviewQuestion` and
`submitAppeal` (`requests.ts`; they read or write the `signup_reviews` rows **of the caller's own store only**, the
store taken from `ctx` / the scope, never from input); `pendingReacceptance` and `recordReacceptance` (`legal.ts`; the
caller's own rows); and `checkBrandTerms()` (`brand-check.ts`, PLA-§13.3, rev 3, PD70; no store scope, it reads
platform rows only). **P0b review F-9 (the list was incomplete):** also the notification reads P2's centre and pulse
call, `listNotifications(reader, opts)`, `unreadCount(reader)` and `markRead(reader, ids)` (`notify.ts`; a `Reader` is
the caller's own user and membership, PLA-§18.1), and the store side of the health snapshot, `getStoreHealth(scope)`,
`snoozeHealthIssue(ctx, issueId, 7)`, `unsnoozeHealthIssue(ctx, issueId)` and `requestHealthRecompute(ctx)`
(`health-snapshot.ts`; the caller's own store's row only); `markHealthDirty(storeId)` is called by the other tracks'
write paths, never with input from a request. `createStoreRequest` needs permission `billing.manage`; it writes `signup_reviews` with `store_id` from `ctx`, `score = 0`, `band = review`,
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
| `/admin/ai/**` | `ai/**` (i.e. `src/app/admin/(console)/ai/**`), owned by P7 (ai.md; excluded from P1's glob, PLA-§P.1, CRIT6) | `ai.platform` | | R1 |
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
while the tab is visible, one poller per browser (`BroadcastChannel("sg-console-pulse")`, independent pollers where
the channel is missing), `ETag` = sha256 of the body → `304` when unchanged (PD38). Platform part cached 5 s (key
`"p"`), unread count and impersonation per user computed fresh.

```ts
export interface ConsolePulse {
  v: 1; at: string;
  queue: { review: number; hold: number; requests: number; needsInfoAnswered: number; oldestMinutes: number | null; overSla: number };
  unread: number;                       // staff notifications of this user
  alarms: { red: number; yellow: number };
  kill: string[];                       // kill-switch keys currently stopping something
  pendingPlatformRequests: number;      // PLA-§2.2 rows waiting for a second person or for their delay
  auditHead: number;                    // newest audit id, drives the Activity feed
  impersonation: { storeId: string; handle: string; endsAt: string } | null;   // rev 2 (PD56): this session's active view-as, drives the topbar chip
  health: { staleSnapshots: number; dirtyRows: number; lastRunAt: string | null };   // rev 2 (PD57): the engine's own pulse
  renders: { pending: number; failed: number; oldestMin: number | null };          // rev 2 (PD57): from P8 renderSummary() platform-wide
  build: string;                        // a change shows "New version available · Reload"
}
```

### PLA-§4.7 The console UX ceiling (core §I.8 applied to staff screens; rev 2, PD51)

Every console screen passes these rules; they are acceptance criteria in PLA-§O.2 (`--perf`) and PLA-§O.4, not
advice. Where a rule names a number, the number is the test.

| # | Rule (core §I.8) | Console budget | How it is met | Measured by |
|---|---|---|---|---|
| 1 | Instant | shell navigation < 150 ms perceived; the first page of every list ≤ 60 s old from `scopedCache` (key `"p"`); a queue decision ≤ 500 ms with optimistic UI, rollback and the `opId` (PLA-§4.5); skeletons mirror the final rows, appear after 150-300 ms and stay ≥ 300 ms | `next/link` prefetch on hover and focus for every nav item and list row; server components streamed per panel (`<Suspense>` + `<PanelBoundary>`); `refresh()` after writes, never a full reload | Playwright timings in PLA-§O.4 step 10 (p75 over 20 navigations); `platform-check.ts --perf` |
| 2 | Keyboard everywhere | every list row, tab and action reachable with the keyboard; chords of PLA-§4.3; `?` lists every shortcut of the screen; `/` focuses the page search | one `useChords()` hook (P2's `src/components/admin/shell/chords.ts`, shared) with the builder's `isEditable` / `overlayOpen` rules (`src/components/builder/shortcuts.ts:16-25`) | an axe + keyboard crawl in PLA-§O.4 step 6 (no unreachable control) |
| 3 | Honest data | placed, confirmed and delivered never share a tile (PLA-§5.2, §7.3); every rate shows `n`; sparklines ≥ 7 points; below a minimum sample the tile says "needs n" | `KpiTile` refuses `spark` arrays shorter than 7 and `rate` without `n` at the type level | `test:platform` (component props selftest) |
| 4 | One accent, one glass, no bounce | teal-cyan accent only (hue 205); the topbar is the one frosted surface; no aurora or grain anywhere in the console (and, rev 3 / UX-38, nowhere in the admin: PD64, PLA-§22.18 rule 4); motion tokens `--dur-1..3`, `--ease-out`, no spring | console components import only the semantic tokens; the `adm-aurora` / `adm-grain` classes no longer exist in the codebase | `test:admin-tokens` (the grep over `src/components/**`, `src/app/**` and the generated admin CSS for the two class names and for ≥ 3-layer `radial-gradient(` stacks), `test:admin-motion`; `test:platform` keeps its own grep over `src/components/console/**` as a second net |
| 5 | Dense but breathing | compact by default (32 px rows, 13 px base), comfortable on demand; tabular numerals in every number column; ≤ 2 lines per cell with a `title` | `[data-density]` on `<ConsoleShell>`; `font-variant-numeric: tabular-nums` on `.num` | screenshot test at 1280 / 360 |
| 6 | Phone-first | the approval queue detail at 360 px is a full screen with a bottom action bar (Approve, Ask, Reject, ⋯) and 44 px targets; every other console screen is readable at 360 px (one column, two-line rows) | PLA-§3.5 layout rules; `KeysetPager` at the bottom | screenshots at 360 px in PLA-§O.4 step 6 |
| 7 | RTL-perfect by construction | logical properties only, mirrored icon allow-list, `<bdi dir="ltr">` on handles, ids, phones and e-mails even in the English console, store time zone on per-store figures | the same `test:admin-rtl` lint covers `src/components/console/**` | `test:admin-rtl` |
| 8 | No AI tells | status as text + icon (never a bare coloured dot: `StatusPill`, severity labels in Needs attention), label above input, no placeholder-as-label, no em-dash or en-dash separator in any `console.*` string, no "Step 1/2/3", one CTA label per intent, skeletons over spinners, empty states as a quiet surface with a real-UI skeleton and one sentence | `console.ts` catalog lint; `EmptyState` quiet variant only | `test:i18n-coverage` (console catalog rules), screenshot review |

Two console-specific additions: **stale is visible** (every panel shows "Updated 2 min ago" in neutral when its data
is older than two pulses; a failed poll turns the pulse dot neutral with the time of the last success, never red
without a reason), and **destructive is slow on purpose** (PD54: lifecycle writes arm for 5 s; kill switches need a
typed phrase and step-up; purges need two people or 24 h). Speed is for reading and deciding, not for destroying.

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
| Orders, last 24 h | `COUNT(*) orders WHERE created_at >= now − 24 h AND is_test = 0` | delta vs the previous 24 h; "from n stores"; **(rev 2)** "n confirmed" from `confirm_state = 'confirmed'` over the same rows (P4's 0005 column) and "n risky" (`risk_score ≥ 70`) | `orders_created_idx` (PD37); test orders excluded (core D54) | k-suppressed (PD15) |
| Placed sales, last 24 h | `SUM(total)` of the same rows **per currency** | chips "MAD 48,210 · EUR 120"; hint "placed, not delivered" (confirmed and delivered sales are separate tiles from R2, never blended) | same rows joined to `stores.currency` | k-suppressed |
| Errors, last 24 h | `SUM(count) error_events WHERE bucket >= <24 h ago>` | the top code and its area | `ee_bucket_idx` | ✓ |
| Database | `getDbUsage()` used / quota (`src/lib/db/usage.ts:44`) | yellow ≥ 70 %, crimson ≥ 85 % (`DB_WARN_RATIO`, `DB_BLOCK_RATIO`, `usage.ts:19-20`) | `information_schema` (its own cache) | ✓ |

Confirmed and delivered sales are not on the overview in R1 (they need P4/R2 states across stores; PL-19 in R3). A
tile with no data reads "No orders in the last 24 h", never `0` with a trend arrow. Sparklines only with ≥ 7 hourly
points (core §I.6). Tile cache 60 s (key `"p"`).

### PLA-§5.3 Needs attention

At most 20 rows, most severe first (+ "See all in Stores" → `/admin/stores?attention=1`):
1. Platform alarms from `getHealth()` (core §H.5, PLA-§15.2): last tick > 10 min, outbox `dead` > 0, DB ≥ 70 %,
   `DATA_DIR` ≥ 70 % of `DATA_DIR_BUDGET_BYTES` (rev 4: core §H.5 rev 3 replaced "disk free < 2 GiB", which `statfs`
   cannot measure on Hostinger), inodes > 300,000, an error spike, the rev 3 machinery alarms (`edge_bad_key`,
   `gate_mismatch`, `pool_wait`, `tick_lag`), and the "heartbeat of commerce": no order platform-wide for 3 h between
   09:00 and 23:00 platform time, once ≥ 10 stores are active.
2. Queue rows in `hold` / `reject_candidate` waiting > 2 h; requests waiting > 24 h.
3. `store_health` rows with `attention ≥ 2`, ordered `attention DESC, score ASC` (`sh_attention_idx`); **(rev 3,
   PD70)** a store flagged `brand_term_live` is listed here as Danger with the matched term and field ("@souk-nour's
   page title contains the protected name "CIH"") and one action "Open profile · Risk".
4. Platform requests (purges, super_admin promotions) waiting for a second person.
5. **(rev 3)** Sandbox ceilings (PD68): `signup_capped` (info, "50 sandboxes created today; new sellers join the
   waitlist", action "Open waitlist"; rev 4 renamed from `signup_cap_reached` to the core §H.5 code),
   `pending_media_budget` (warning at ≥ 80 % of `pendingMediaTotalMiB`, danger at ≥ 95 %, rev 4: the core §H.5
   thresholds; action "Open sign-up settings"); abuse (PD70): `abuse_reports_new` (warning, "n new reports on m stores
   in 24 h", action "Open profile" of the most reported store; the triage inbox is R3).

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
"Open approvals". System: last tick (green < 6 min, yellow < 10 min, red), outbox pending / dead, **render queue**
(pending / failed / oldest, PD57), **Worker** (S mode on/off, version last seen), **AI** (provider ok / paused, cap
used %), **health engine** (stale snapshots), media backend (`fs`, or `db` fallback in red), build id; "Open health".
Each item is text + icon with its last-updated time, never a bare dot (PLA-§4.7 rule 8).

Acceptance (PL-05): ≤ 800 ms p95 server time on a seeded DB of 2,000 stores and 1,000,000 orders, every query on the
index named above (`EXPLAIN` asserted in `platform-check.ts`); a failing panel query shows that panel's error state
while the others render; with 3 active stores an analyst sees "Hidden: fewer than 5 stores contribute" on both order
tiles.

---

## PLA-§6. Stores list (`/admin/stores`, PL-06) and the Store Health engine (PL-18 = SF-03)

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

### PLA-§6.3 The Store Health engine (PL-18 = SF-03; PD6, PD18, PD42, PD53, PD66, PD67; core D53, §I.7) (rev 2)

One computation, two audiences. The maintainer's skeletons `src/lib/health/{types,registry}.ts` hold the types of
PLA-§2.2 and import every track's `src/lib/health/rules/<track>.ts`; P1 writes the engine, the job, the console ring
and the platform rules; P2 the tenant surface (PLA-§22.16). Nothing in the engine reads another store.

#### PLA-§6.3.1 Engine (`src/lib/health/engine.ts`, P1; pure over its inputs, selftested)

**Rev 6 P0b (frozen exports; P0b review F-9, so a track finds them in its part):** the one fixture shape of every rules file (CCR P5-8, P6-13; PD79): `HealthRuleFile`, `HEALTH_RULE_PREFIXES`
(each file's id prefixes, e.g. `int:` / `conv:` for `rules/integrations.ts`) and `HealthRuleFixture` in
`src/lib/health/types.ts`; every `rules/*.ts` exports `fixtures: HealthRuleFixture[]` and `src/lib/health/registry.ts`
collects them as `HEALTH_RULE_FIXTURES` for `test:health` (asserted in `src/lib/contracts/r1-p0b-platform.ts`).

```ts
// src/lib/health/inputs.ts (P1): one read pass per store through systemScope(ctx, storeId) and the P0 read APIs (core §K.2)
export interface HealthInputs {
  store: StoreRow; now: Date; slaHours: number | null;
  pages: { published: number; drafts: number; lastPublishAt: Date | null; renderFailed: number; live: Pick<ConsolePageRow, "id" | "slug" | "updatedAt" | "name" | "seoTitle">[] };   // listPagesForConsole (T4), renderSummary (P8); rev 3 (PD70): `name` and `seoTitle` feed platform:brand_term_live (PLA-§Q.3 asks T4 for the two fields)
  brand: { storeName: string; legalName: string | null; whatsappName: string | null; policyTexts: string[] };            // rev 3 (PD70): the strings the live brand rule scans (from the store row and the `store` / `policies` settings already loaded)
  abuseReports: { new24h: number; total: number };                                                                          // rev 3 (PD70): abuse_reports counts for the store (ar_store_idx)
  orders: OrderKpis & { risky7d: number; firstTouchP50Ms: number | null; unattempted2h: number; unreachable7d: number; unreachable28d: number };   // orderKpis, queueCounts, orderRiskMix (P4)
  integrations: IntegrationHealth; sheets: { pending: number; oldestMin: number | null; lastRunFailedAt: Date | null };   // integrationHealth, sheetsBacklog (P5)
  ai: AiUsageSummary | null;                                                                                           // aiUsageForStore (P7)
  design: DesignHealth;                                                                                                 // designHealth(scope) (P6): q, slop, distances per live page, verdict bands only
  usage: readonly { metric: UsageMetric["metric"]; period: string; used: number; limit: number | null }[];           // entitlements + store_usage (T1)
  settings: { store: StoreSettingValue<"store">; policies: StoreSettingValue<"policies">; checkout: StoreSettingValue<"checkout">; conversions: StoreSettingValue<"conversions"> };
  members: { total: number; withoutTotpWithOrdersReadAll: number; lastActiveAt: Date | null; lastLoginAt: Date | null };   // listMembersByScope (T2)
  review: { submittedAt: Date | null; status: string } | null;
  zones: { count: number; pageShowsFlatFee: boolean; feeMismatchTop5: { cityKey: string; pageFeeCents: number; zoneFeeCents: number }[] };   // zonesForCheckout (P3); rev 3 (PD76, OPS-13): for the five most-ordered cities (opsAggregates dims: city, P4; keys are the canonical `CityKey` slug of OPE-§10.1) whose zone fee differs from the live page's flat fee
}
export function collectHealthInputs(scope: StoreScope, store: StoreRow, now: Date): Promise<HealthInputs>;   // ≤ 250 ms per store; a failing source leaves its field null and the rules that need it stay silent

// src/lib/health/engine.ts (P1)
export interface HealthComputation { score: number; attention: 0 | 1 | 2 | 3; components: Record<HealthGroup, number>; issues: HealthIssue[]; flags: HealthFlag[]; dormant: boolean; reached: Milestone[] }
export function runRules(rules: readonly HealthRule[], scope: StoreScope, inputs: HealthInputs, opts: { release: "R1" | "R2" | "R3"; mode: StoreMode }): Promise<HealthIssue[]>;   // filters by release and mode; each rule ≤ 40 ms, a throwing rule is skipped and recorded (error_events area "health")
export function computeHealth(issues: HealthIssue[], flags: HealthFlag[], snoozed: Record<string, string>, now: Date): Pick<HealthComputation, "score" | "components" | "attention">;   // core §I.7 signature
export function platformFlags(inputs: HealthInputs, issues?: readonly HealthIssue[]): HealthFlag[];        // src/lib/health/platform-flags.ts: the console codes of the table below; rev 6 P0b (CCR P1-12, PD79): with `issues`, the mirrored flags (sheets_backlog, outbox_dead, capi_failing, telegram_failing, setup_incomplete) are derived from the P5 / P3 issues, never emitted on their own
export function milestonesOf(inputs: HealthInputs): Milestone[];
```

`score = 100 − Σ_group min(HEALTH_CAPS[group], Σ points of unsnoozed issues in the group)`, clamped 0-100; the
points of an issue are `3 | 6 | 10` for severity `1 | 2 | 3`; `attention` = the highest **console flag** severity
(so a suspended store is 3 and a store with a design issue is not). Issues are sorted by `points DESC, group,
id`; at most 20 are stored and the tenant sees the first 5 unsnoozed (PLA-§22.16). **Monotonic:** removing or
snoozing an issue never lowers the score (selftest over 1,000 random removals). **Advisory:** nothing reads the
score to allow or refuse anything; publish gates are core §M.

#### PLA-§6.3.2 Rules by track (R1 set; each rule stays silent below its `minN` and reads one store)

**(rev 4, PD79, core §I.7 rev 3)** This table is a **summary**; the source of each rule is its owner's table (P3
LAN-§23.7, P4 / P5 OPE-§27.2, P6 DES-§2.10 / DS46, P2 and P1 here) and the ids below are written exactly as the
owners write them. **One condition, one issue:** a condition lives in one rules file only; the console flags that
mirror another track's issue are derived from it (PLA-§6.3.3), so the score never counts one problem twice, and
`test:health` fails when two registered rules emit the same evidence `metric` in the same group. P1's
`rules/platform.ts` emits only `platform:render_failed`, `platform:quota_high`, `platform:quota_full` and
`platform:risky_orders` as tenant issues, plus the staff-only `platform:brand_term_live` flag rule (0 points).

| Group (cap) | Rule id | Owner file | Condition (store's own data, trailing windows) | Sev | `minN` | Fix (`HealthFix`) |
|---|---|---|---|---|---|---|
| setup (20) | `shell:contact` | `rules/shell.ts` (P2) | no `store.phone` and no `store.whatsapp` | 3 | — | link `settings/general` |
| | `shell:legal_identity` | P2 | `store.legalName` empty | 1 | — | link `settings/general` |
| | `shell:2fa_orders` | P2 | a member with `orders.read_all` has no TOTP | 2 | — | link `settings/security` |
| | `landing:no_live_page` (rev 4: the one "no live page" rule; revision 3's P2 duplicate `shell:no_published_page` is withdrawn) | `rules/landing.ts` (P3, LAN-§23.7) | no published landing page while the store is `active` and the mode allows landing (store mode's equivalent is storefront's, R2) | 3 | — | link `pages` |
| | `landing:zones_empty` (rev 4 id; revision 3 wrote `landing:zones_empty_flat_fee`) | P3 | zones off or empty in a market with a city list while a live page shows a fee | 2 | — | link `settings/delivery` |
| | `landing:holidays_unreviewed` · `landing:policies_unreviewed` · `landing:no_caller` | P3 | per LAN-§23.7 | 1 | — | links `settings/delivery` · `settings/policies` · `settings/checkout` |
| | `platform:render_failed` (rev 4: group setup, core §I.7's mapping; revision 3 put it under integrations) | `rules/platform.ts` (P1) | ≥ 1 `failed` render job for the store (surfaces the §M notes recorded by re-renders) | 2 | — | action `pages.republish_failed` |
| trust (15) | `landing:countdown_ended` · `landing:compare_not_higher` · `landing:stock_zero` · `landing:stock_stale` · `landing:proof_unattested` (rev 4 ids; revision 3 wrote `landing:sample_proof`) | P3 (from `checklist.ts` honesty rules) | per LAN-§23.7 | 3 / 2 / 2 / 1 / 2 | — | the builder section or tab |
| design (15) | `design:q_low` · `design:slop` · `design:pages_close` · `design:no_dna` (rev 4 ids; revision 3 wrote `design:low_q` and `design:own_pages_close`) | `rules/design.ts` (P6, DS46) | a live page with `q < 70`; `slop ≥ 3`; two live landings closer than `d_page 0.30`; a live page generated before design DNA | 2 / 2 / 1 / 1 | — | action `design.open_check` |
| conversion (15) | `landing:no_seo` · `landing:no_alt` · `landing:no_pixel` · `landing:form_hidden` · `landing:leads_slow` · `landing:wa_intents_waiting` | P3 | per LAN-§23.7 | 1 / 1 / 2 / 3 / 1 / 1 | 20 leads (`leads_slow`), 3 intents (`wa_intents_waiting`) | SEO / media / pixels / form tabs, `leads` |
| | `conv:trigger_hint` (rev 4 id; revision 3 wrote `integrations:purchase_trigger_order`) | `rules/integrations.ts` (P5, OPE-§27.2) | Purchase trigger `order` while ≥ 50 % of orders are confirmed by calls: a suggestion, never an error | 1 | 30 orders | link `integrations/pixels#server-events` |
| | `landing:fee_mismatch` (rev 3, PD76, OPS-13; core §I.7) | `rules/landing.ts` (P3; the condition and text are landing.md's, LAN-§23.7 must list it, PLA-§Q.4) | `inputs.zones.feeMismatchTop5` non-empty: a live page **not** on "Charge delivery by city" charges a flat fee that differs from the zone fee of one of the five most-ordered cities (evidence `{ metric: "fee_mismatch_cities", value: n, n: orders in the window }`) | 1 | 20 orders / 28 d | link `settings/delivery` |
| operations (15) | `ops:first_touch` · `ops:untouched` · `ops:no_agent` · `ops:unreachable_rise` · `ops:abandoned` · `ops:callbacks_overdue` · `ops:to_pack_aging` · `ops:hold_passed` · `ops:delivery_rescue` · `ops:sheet_agents_unmapped` · `fin:costs_missing` · `fin:settlement_check` · `fin:fee_gap` · `fin:ad_rate_missing` (the last four behind `finance_lite`) (rev 4 ids; revision 3 wrote `ops:first_touch_slow`, `ops:unattempted_2h`, `ops:unreachable_up`) | `rules/ops.ts` (P4, OPE-§27.2) | per OPE-§27.2 | per row (1-3) | 30 orders / 28 d where OPE-§27.2 states it | links into `/queue/board`, `/team/callcenter`, `/team/agents`, `/orders`, `/finance` |
| | `platform:risky_orders` | `rules/platform.ts` (P1) | `orders7d.n ≥ 20` and `risky / n ≥ 0.30` (the order risk check's `risk_score ≥ 70`) | 2 | 20 orders / 7 d | action `ops.open_queue` (risk ≥ 70 view) |
| integrations (15) | `int:sheets_backlog` · `int:capi_failing` · `int:telegram_failing` · `int:delivery_dead` · `int:turnstile` (rev 4: these are **P5's**, core §I.7; revision 3's P1 copies `platform:sheets_backlog`, `platform:sheets_error`, `platform:outbox_dead`, `platform:capi_failing`, `platform:telegram_failing` are withdrawn and their console flags derived, PD42 rev 4) | `rules/integrations.ts` (P5, OPE-§27.2) | Sheets oldest pending beyond the scaled threshold of core §H.5 (`max(15, 5 × ceil(activeSheetsStores / 16))` min) while connected; a pixel failing 24 h with no success; Telegram failing; ≥ 1 `dead` outbox item; Turnstile failures > 20 % of a day's orders | 3 / 2 / 2 / 2 / 1 | 20 orders (`int:turnstile`) | links `integrations/sheets` (or action `integrations.sync_sheets`), `/pixels`, `/telegram`, `#deliveries` (Replay), `settings/anti-spam` |
| quota (5) | `platform:quota_high` / `platform:quota_full` | `rules/platform.ts` (P1) | any gauge or monthly counter ≥ 80 % / ≥ 100 % of its limit | 1 / 2 | — | link `settings/plan` |

R2 adds the ship and money rules of OPE-§27.2 (`ops:reveals`, `ops:cash_held`) and refusal by city; platform medians
appear only in R3 and only labelled "platform median" (RF §1.3). Every `text` is a message key with the evidence as
variables (`health.<track>.<rule>.text` in the emitting track's own i18n file, D67: P1's in `notify.ts`, P2's in
`shell.ts`; ar/fr/en for tenant-visible rules, `test:i18n-coverage`); every rule has a fixture with and without
`minN` in its track's part of `test:health`.

Revision 3 table (kept as the record of what changed; superseded by the table above):

| Group (cap) | Rule id | Owner file | Condition (store's own data, trailing windows) | Sev | `minN` | Fix (`HealthFix`) |
|---|---|---|---|---|---|---|
| setup (20) | `shell:contact` | `rules/shell.ts` (P2) | no `store.phone` and no `store.whatsapp` | 3 | — | link `settings/general` |
| | `shell:legal_identity` | P2 | `store.legalName` empty | 1 | — | link `settings/general` |
| | `shell:no_published_page` | P2 | `pages.published = 0` and the store is `active` for ≥ 7 days | 2 | — | link `pages` |
| | `shell:2fa_orders` | P2 | a member with `orders.read_all` has no TOTP | 2 | — | link `settings/security` |
| | `landing:zones_empty_flat_fee` | `rules/landing.ts` (P3) | zones empty while a live page shows a flat fee | 2 | — | link `settings/delivery` |
| trust (15) | `landing:countdown_ended`, `landing:compare_not_higher`, `landing:stock_zero`, `landing:sample_proof` | P3 (from `checklist.ts` honesty rules) | per LAN spec | 3 / 2 / 2 / 3 | — | link to the builder section |
| design (15) | `design:low_q`, `design:slop`, `design:own_pages_close` | `rules/design.ts` (P6) | a live page with `q < 70`; `slop ≥ 3`; two live landings closer than `d_page 0.30` | 2 / 2 / 1 | — | action `design.open_check` |
| conversion (15) | `landing:seo_missing`, `landing:alt_missing`, `integrations:no_pixel_live`, `integrations:purchase_trigger_order`, `landing:form_hidden` | P3 / P5 | per LAN / OPE specs; the Purchase-trigger rule is a suggestion (severity 1) | 1-2 | — | links to SEO / media / pixels / conversions |
| | `landing:fee_mismatch` (rev 3, PD76, OPS-13) | `rules/landing.ts` (P3; the condition and text are landing.md's) | `inputs.zones.feeMismatchTop5` non-empty: a live page charges a flat fee that differs from the zone fee of one of the five most-ordered cities (evidence `{ metric: "fee_mismatch_cities", value: n, n: orders in the window }`) | 1 | 20 orders / 28 d | link `settings/delivery` |
| operations (15) | `ops:first_touch_slow`, `ops:unattempted_2h`, `ops:unreachable_up` | `rules/ops.ts` (P4) | first-touch p50 above the store's target; orders without an attempt > 2 h inside the window; unreachable 7 d > 28 d + 10 points | 2 / 3 / 2 | 30 orders / 28 d | action `ops.open_queue` |
| integrations (15) | `platform:sheets_backlog` | `rules/platform.ts` (P1) | Sheets connected and `oldestMin > 15` | 2 | — | action `integrations.sync_sheets` |
| | `platform:sheets_error` | P1 | a failed `sheets.push` / `sheets.pull` run for the store in the last hour | 2 | — | link `integrations/sheets` |
| | `platform:outbox_dead` | P1 | any `dead` outbox row of kind `webhook`, `whatsapp` or `carrier` in 24 h | 2 | — | link `integrations` |
| | `platform:capi_failing` | P1 | `integration_status.kind = 'capi'` state `failing` in 24 h | 1 | — | link `integrations/pixels` |
| | `platform:telegram_failing` | P1 | `integration_status.kind = 'telegram'` state `failing` | 1 | — | link `integrations/telegram` |
| | `platform:render_failed` | P1 | ≥ 1 `failed` render job for the store (surfaces §M notes recorded by re-renders) | 2 | — | action `pages.republish_failed` |
| quota (5) | `platform:quota_high` / `platform:quota_full` | P1 | any gauge or monthly counter ≥ 80 % / ≥ 100 % of its limit | 1 / 2 | — | link `settings/plan` |

R2 adds `ops:refusal_city`, `ops:cash_held_30d` (ship and money states); platform medians appear only in R3 and only
labelled "platform median" (RF §1.3). Every `text` is a message key with the evidence as variables
(`health.<track>.<rule>.text`, ar/fr/en for tenant-visible rules, `test:i18n-coverage`); every rule has a fixture
with and without `minN` in its track's part of `test:health`.


#### PLA-§6.3.3 Console flags (`platform-flags.ts`, P1; the owner's view, never shown to tenants)

| Flag | Rule (starting values **[to tune]**) | Severity | Maps onto |
|---|---|---|---|
| `sheets_backlog`, `sheets_error`, `outbox_dead`, `capi_failing`, `telegram_failing` | **(rev 4, PD79)** derived by `platformFlags()` from P5's issues: `int:sheets_backlog` → `sheets_backlog`, `int:delivery_dead` → `outbox_dead`, `int:capi_failing` → `capi_failing`, `int:telegram_failing` → `telegram_failing` (same evidence object, the flag's severity = the issue's); `sheets_error` from `sheetsBacklog(scope).lastRunFailedAt` within the last hour (no tenant issue of its own: a failing run shows to the seller as the backlog it causes) | 2 / 2 / 2 / 1 / 1 | the P5 integrations issues (0 extra points; revision 3 gave them their own `platform:*` issues) |
| `quota_high` / `quota_full` | ≥ 80 % / ≥ 100 % | 1 / 2 | the quota issues |
| `risky_orders` | `orders7d.n ≥ 20` and `risky / n ≥ 0.30` | 2 | operations (6 points, rule `platform:risky_orders`, tenant text "3 of 10 orders this week looked risky to the risk check") |
| `setup_incomplete` | active ≥ 7 days with no published page (rev 4: derived from P3's `landing:no_live_page` issue and its age) | 1 | `landing:no_live_page` (0 extra points; revision 3 mapped it onto the withdrawn `shell:no_published_page`) |
| `render_failed` | ≥ 1 failed render job | 2 | `platform:render_failed` |
| `inactive_14d` | active store, no member activity for 14 days | 1 | 0 points, flag only |
| `dormant_60d` | no member login and no order for 60 days → `dormant = true` | 1 | 0 points, flag only (re-engagement R3) |
| `review_waiting` | pending, submitted, waiting longer than `slaHours` (24 h when unset) | 1 | 0 points, flag only |
| `restricted` / `suspended` | the status itself | 2 / 3 | 0 points, flag only (drives `attention`) |
| `brand_term_live` (rev 3, PD70, SEC-18) | rule `platform:brand_term_live` (`rules/platform.ts`): `brandTokens()` of the store name, legal name, WhatsApp display name, every live page's `name` and `seoTitle` and the `policies` texts (`inputs.brand`) matches an active `protected_brands` term with `match = exact` (or `substring` for terms ≥ 6 chars); evidence `{ term, field, pageId? }` in `detail` (the matched term is a protected name, never customer data) | 2 | 0 points, flag only (drives `attention = 2`, Needs attention row, `staff.alarm brand_term_live` once per store and term per week); staff-only, never a tenant issue, because a legitimate reseller must not be nagged by the score and an impersonator must not be warned |
| `brand_near_live` (rev 3, PD70) | `checkBrandTerms()` found a `brand_near` match at the last write of a brand field (recorded in `store_health.flags` through `markHealthDirty` + the same scan) | 1 | 0 points, flag only |
| `abuse_reports_new` (rev 3, PD70) | `inputs.abuseReports.new24h ≥ 1` (value = the count; ≥ 3 in 24 h raises severity to 2) | 1 / 2 | 0 points, flag only (drives `attention`, Needs attention) |

#### PLA-§6.3.4 Job, snapshot API, bounds

**Job** `platform.health` (`src/lib/jobs/tracks/platform.ts`, every tick, slot 9: 3 s guaranteed + up to 6 s of
leftover, core §H.2 / §Q.1 Q.18) is **budget-driven (rev 4, PD78, core §I.7 rev 3 / ENGC-25)**: it takes stores until
`ctx.deadline` (no fixed count; revision 3's "up to 200 stores per tick" was unreachable at 100-800 ms per store and
is withdrawn), in this order: rows with `dirty_at IS NOT NULL` first (by `dirty_at`), then stores without a snapshot
(`stores LEFT JOIN store_health … WHERE h.store_id IS NULL`, states `pending`, `active`, `restricted`; a new store also
gets a dirty stub from its first settings write, so it is never last), then the oldest `computed_at` (`sh_due_idx`).
It calls `ctx.yield()` between stores and records `{ stores, perStoreP50Ms, perStoreP95Ms, rulesSlowest[3],
cycleMin }` in `job_runs.summary`, where `cycleMin = ceil(activeStores / max(1, storesPerTickP50 over the last 12
ticks)) × 5`. For each store it calls
`collectHealthInputs` through `systemScope`, `runRules` over the registry, `platformFlags`, `milestonesOf`,
`computeHealth`, and upserts `store_health` (`dirty_at = NULL`, `issues` truncated to 20, expired snoozes dropped).
It also:
- fills `store_health.milestones` and writes one `store.milestone.reached` audit row (`actor_kind = 'system'`, meta
  `{ milestone }`) the first time a milestone appears (PD40);
- emits `quota.80` / `quota.100` store notifications once per metric and period (`dedupeKey =
  quota<80|100>:<storeId>:<metric>:<period>`) to owners and admins;
- emits `health.issue_new` once per new issue id of severity ≥ `platform.health.issueNotifyMinSeverity` per ISO week
  (PD67; "new" = absent from the previous snapshot's `issues`);
- never writes a tenant table; its one cross-store statement is the `store_health` upsert (core §E.3 rule 6, pinned
  count 1 for `src/lib/health/**`).

```ts
// src/lib/platform/health-snapshot.ts (P1; frozen at P0, core §K.2)
export function getStoreHealth(scope: StoreScope): Promise<StoreHealthView | null>;   // the store's own row, cached 5 min ("health" scopedCache, core §E.6); null = not computed yet; flags only for platform scopes
export function markHealthDirty(storeId: string): Promise<void>;                     // UPDATE store_health SET dirty_at = now; INSERT a dirty stub when no row exists
export function snoozeHealthIssue(ctx: StoreCtx, issueId: string, days: 7): Promise<void>;   // health.snooze; writes `snoozed[issueId]`, audit store.health.snoozed, invalidates the cache
export function requestHealthRecompute(ctx: StoreCtx): Promise<{ queuedAt: string }>;    // s:<sid>:health:recompute 6/h → markHealthDirty (the job computes within ≤ 5 min)
```

`markHealthDirty(storeId)` is called by every console action on a store, by `transitionStore` (core §A.5.1), by the
publish listener (core §M.1 step 4), by zone, policy, `store` and integration setting writes (through the settings
layer's `onWrite` hooks, T1) and by `requestHealthRecompute`. **Bounds (rev 4, PD78):** recomputed ≤ 5 min after any
of these while the dirty queue fits one tick (≈ 10 stores; a longer dirty queue drains at ≈ 10 per tick, oldest
first, and the "Recomputing" line shows its position); otherwise once per measured cycle: ≤ 60 min up to ≈ 120
active stores, ≈ 2 h at 240, degrading linearly (revision 3's "2,000 / 200 × 5 = 50 min" is withdrawn; the remedy
past ≈ 120 is the second guaranteed slice the core decides in R2). The `platform.alarms` job raises `staff.alarm`
`health_stale` when an `active` store's `computed_at` is older than **`max(staleAlarmMinutes, 1.5 × cycleMin)`** (the
fixed hour would fire permanently past ≈ 120 stores and train the owner to ignore it) and `health_job_slow` when the
job's `perStoreP50Ms` exceeds 800 ms for three ticks in a row (a rule or a read API regressed). The `brand_term_live`
rule therefore runs once per cycle at least, which is more often than the core's "nightly" up to ≈ 2,800 active stores.

#### PLA-§6.3.5 Acceptance (PL-18 / SF-03)

A fixture store with a 20-minute Sheets backlog (one Sheets store, so the scaled threshold is 15 min) shows P5's
`int:sheets_backlog` (severity 3, 10 points) **once** and the derived console flag `sheets_backlog`, score 90 after one
run (rev 4: revision 3's `platform:sheets_backlog` at 6 points and score 94 is withdrawn with the duplicate rule); no
two registered rules emit the same evidence `metric` in one group (registry scan in `test:health`); a suspended store enters Needs attention with `attention = 3` and no point
change; dormant flips after 60 days on a fake clock; an `ops:*` rule stays silent at 29 orders and fires at 30;
snoozing an issue removes its points and keeps it in `issues` with `snoozedUntil`; the snooze expires on a fake clock;
fixing one issue never lowers the score (1,000 random cases); every tenant-visible rule renders in ar/fr/en with every
variable; a two-store fixture (`test:health-db`) shows no cross-store evidence and no customer data in any snapshot
column (canary, §O.3 case 8); `health.issue_new` fires once per issue id per week under three consecutive runs; the
console ring and the tenant ring render the same `score` for the same row (one query each, asserted in `qa:wow-demo`
at 2:50); **(rev 4, PD78)** with stubbed read APIs at 300 ms per store the job processes as many stores as fit its
budget (≈ 10), records `perStoreP50Ms` and `cycleMin` in `job_runs.summary`, and on a 300-store fixture
`health_stale` stays silent at `1.4 × cycleMin` and fires once at `1.6 × cycleMin` (fake clock).

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

Tabs (`[[...tab]]`, default `overview`). **R1 (rev 2, PD32):** `overview` · `orders` · `team` · `activity` (with the
`?view=timeline` preset) · `usage` · `notes`; keyboard `1`…`6` jump to them; the tab bar scrolls horizontally at
360 px with the active tab kept in view. **R2 (S6):** `pages` (Catalog & pages), `integrations`, `domains`, `risk`,
`media`, `ops`; **R3 (D5):** `support`. A deferred tab's path answers the console's own "Arrives with R2" page (a
sentence and a link to the Overview strip that already shows its R1 data), never a 404 and never placeholder numbers.

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

**Shared with the tenant repositories for impersonation (rev 3, PD69, SEC-5).** `mask.ts` is pure and isomorphic and
additionally exports the row-level helper the operations read functions call when `scope.kind === "impersonation"`:

```ts
export interface CustomerFieldsIn { name: string | null; phone: string | null; address: string | null; city: string | null; landmark: string | null; note: string | null }
export type CustomerFieldsMasked = { name: Masked | null; phone: Masked | null; address: Masked | null; city: string | null /* city stays: it is not identifying alone */; landmark: Masked | null; note: Masked | null };
export function maskCustomerFields(f: CustomerFieldsIn): CustomerFieldsMasked;   // maskName / maskPhone / maskAddress; landmark and note → "Hidden" (Masked)
export function maskIfImpersonation<T extends CustomerFieldsIn>(scope: StoreScope, row: T): T | (Omit<T, keyof CustomerFieldsIn> & CustomerFieldsMasked);   // identity for member and system scopes
```

The rule it serves: with `StoreCtx.scope.kind = "impersonation"` (core §E.1, set by the seam when `ctx.impersonation`
is present; PLA-§Q.3), `listOrders`, `getOrder`, `listLeads`, `getLead`, `listCustomers`, `getCustomer`, `searchOrders`
and the order drawer's event feed (operations.md) return rows through `maskIfImpersonation` **inside the repository**,
so the tenant UI, the ⌘K provider, the queue card and the CSV export (refused anyway, sensitive) all render masked values
with no per-component work and no way to forget one. The console's per-order reveal (`pii.reveal` ↑, §7.4) is the only
unmasking path and is not reachable from the tenant shell. `test:platform` asserts `maskIfImpersonation` is the identity
for `member` and `system` scopes and masks every field for `impersonation`; attack case §O.3 15 asserts the HTML and RSC
payload of every tenant route under an impersonating session contain none of the customer canaries.

### PLA-§7.3 Overview tab: the "every detail" view (rev 2, PD32, PD55)

Range switch 7 / 30 / 90 days (store timezone) for the KPI row; everything else is "now". Layout ≥ 1280 px: the KPI
row, then a 12-column grid of **ten strips** (each a `<PanelBoundary>` over one async server component and one P0
read API, so each fails alone and the page streams); 768-1279 px two columns; 360 px one column with the strips
collapsed to their header line and count, expanding on tap. Every strip has a header (name, last-updated time), ≤ 6
lines of content, and one end link: the full tab when it exists in this release, otherwise the honest line
`console.profile.arrives_r2` ("Full view arrives with R2") in neutral text, never a disabled button.

**KPI row** (each rate shows `n`; placed, confirmed and delivered never share a tile): visitors (unique,
`stats_daily`) · orders placed · confirmation rate (confirmed / (placed − still open), from P4's `confirm_state`) ·
delivery rate (from R2 ship states; R1 shows "Fills in with delivery tracking (R2)") · placed sales · confirmed sales ·
delivered sales (R2) · average order (placed) · refusal / return rate (R2). Chart: daily orders placed vs confirmed
(two series, neutral and jade; ≥ 7 points or a table). Test orders (`is_test`) are excluded everywhere (core D54).

| # | Strip | Content (R1) | Source (P0 read API, core §K.2) | End link |
|---|---|---|---|---|
| 1 | Identity & address | mode badge, address mode chip (P / S / C), canonical URL with Copy and Open, handle history count ("renamed once, redirect until …"), re-render state for reason `address` (pending / failed), `brand_seed` hidden, store id with Copy | store row (fresh), `store_handle_history`, P8 `renderSummary(scope)` | Domains tab (R2) |
| 2 | Health | the 40 px ring with the score, the seven group penalties as a compact bar, the top 5 unsnoozed issues (text with evidence, severity label, "snoozed by owner until …" where applicable), console flags as chips, "Mark dirty" (recompute within 5 min) | `getStoreHealth(platformScope)` (same row as the tenant ring) | the stores list filtered by this store's flags |
| 3 | Pages | published / draft counts, last publish (relative), the live URL, the newest draft's Design check chips (Q, slop, gates) and honesty item count, **Preview** (10-minute `/preview/<token>` in a sandboxed iframe sheet, PD16) | T4 `listPagesForConsole(scope)`, P6 `designHealth(scope)` | Catalog & pages tab (R2) |
| 4 | Orders | placed 7 d / 30 d, confirmation rate with `n`, risk mix bar (0-29 / 30-69 / ≥ 70 with `n`), the latest 5 orders masked (id, created, state, total, `maskName`, `maskPhone`) | P4 `orderKpis`, `orderRiskMix`, `listOrdersForConsole(…, { limit: 5 })` | Orders tab (R1) |
| 5 | Team | members by role, pending invites, 2FA coverage ("3 of 4 with 2FA"), `require_member_2fa` state, agents online now | T2 `listMembersByScope`, `listInvitesByScope`; P4 `opsPulse(scope).agentsOnline` | Team tab (R1) |
| 6 | Integrations | one line per kind from `integration_status` (Sheets: connected, backlog and oldest, last push / pull result; Pixels: library count, CAPI tokens "set / not set" per pixel; Telegram: configured, last delivery; Turnstile override "set / not set"), outbox pending / dead for this store with **Replay** on dead rows (`stores.lifecycle`, P8 `replay`) | P5 `integrationHealth(scope)`, P8 `outboxSummary(scope)` | Integrations health tab (R2) |
| 7 | AI | credits used / limit this month, cloud cost this month (USD micros → "$1.84"), store AI mode and Director mode, runs 7 d by provider mix, last run (task, provider, ms, outcome), open `ai_jobs` for the store (kind, stage, heartbeat age); never prompt or output text | P7 `aiStoreSummary(ctx, storeId)` (console-shaped, masked) | the console AI pages (P7, `/admin/ai/stores/<id>` when P7 ships it; otherwise none) |
| 8 | Usage & plan | plan chip and since, the gauges media / pages / members / agents / campaigns / short links and the monthly counters exports / AI credits / orders as `UsageMeter`s, active boosts with expiry, state caps in force ("Pending: 100 MiB") | T1 `entitlements(platformScope)`, `store_entitlements`, `store_usage` | Usage & plan tab (R1) |
| 9 | Risk | the latest `signup` review: score ring, band, the top 3 flags with `explainFlag()`, the counterfactual line (PD52), `partial`; linked accounts count with a banned badge when any; blocklist size; restriction history count; **(rev 3, PD70)** the live brand state (`brand_term_live` / `brand_near_live` flags with the matched term and field, or "No protected term on live pages") and the abuse reports count ("3 reports, 2 in 24 h: phishing ×2, other ×1" with the newest report's reason and page path; details and reporter contact are R3 triage, never shown in R1) | `signup_reviews` (`sr_store_kind_idx`), `identity_links` through `src/lib/platform/profile/risk.ts` (`// tenancy: platform risk strip`), `blocklist` count, `store_health.flags`, `abuse_reports` (`ar_store_idx`) | Risk tab (R2) |
| 10 | Timeline | the last 8 events of the merged stream (PLA-§7.8): lifecycle, decisions, plan changes, milestones, impersonations, notes of kind `decision` / `warning`, exports, renames | `listStoreTimeline(ctx, storeId, { limit: 8 })` | Activity tab, `?view=timeline` (R1) |

Milestones appear inside the Timeline strip as pinned markers (first draft, first publish, first order, 10th order,
first teammate, first delivered (R2)) with dates from `store_health.milestones`. Data for the KPI row:
`getStoreOverview(ctx, storeId, range)` combining `orderKpis(scope, range)` (P4) and `pageStats(scope, range)` (T3
stats). Masking: every customer field passes `src/lib/platform/mask.ts` before the RSC payload is built (PD2);
seller contact follows PD35. Budget: the whole Overview ≤ 900 ms p95 server time on the `--perf` fixture (ten
parallel reads), each strip ≤ 300 ms; a strip that misses its budget still renders when it finishes (streaming), and
a strip whose source throws shows its own error state with the reference.

### PLA-§7.4 Orders tab (masked)

The store's orders through P4's `listOrdersForConsole(scope, query)` (PLA-§Q.11) as a read-only table: id, created
(store time), status / `confirm_state`, total, masked customer (`maskName`, `maskPhone`, `maskAddress`), page, risk
score chip (≥ 70 crimson), source. Filters: status, risk ≥ 70, date range, page. Status counts above the table; a risk
distribution bar (0-29 / 30-69 / ≥ 70 with `n`). Row → a read-only drawer (lines, timeline from `order_events`,
attempts) with every PII field masked; **(rev 3, OPS-9)** the drawer also shows the carrier label and tracking
reference when present (`orders.carrier_label`, `orders.tracking_ref`, operations.md R1 carrier loop through Sheets;
neither is customer data, both render in `<bdi dir="ltr">`), so support can answer "where is my parcel" tickets from
the console without a reveal. **(rev 4)** The drawer also shows "Sent to the carrier file on <date>" from
`orders.carrier_exported` (core D74). **Cart orders (R2, OPS-15):** payload v3 orders have `page_id NULL` and
`version_id NULL` (STO-§16.4) and a `lines` list; the Orders tab's page column reads "Store checkout" for them, the
drawer lists the lines (product title, option labels, quantity, line total) from `getOrderForConsole`, and manual
phone / WhatsApp orders created through S1's `createManualOrderV3` (core §K.4) show their `source` chip like any
other; no console code assumes a page.

**Reveal one order**: "Reveal customer details" in the drawer → dialog with a reason (`ticket`, `fraud_review`,
`legal_request`, `delivery_dispute`, `other` + note) → `revealOrderPiiAction({ storeId, orderId, reason, note })`
(`pii.reveal` ↑) → calls P4's `recordPlatformReveal(ctx, scope, orderId, reason)` (`src/lib/orders/profile.ts`) and
returns its fields for display only (never cached, never logged), shown for 60 s then masked again; the store's
Activity shows the reveal with the staff name. Bucket `p:pii:reveal:<userId>` 20/day. **Rev 6 P0b (CCR P1-9, the shape
both parts build against; OPE-§27.1):** `recordPlatformReveal(ctx, scope, orderId, reason): Promise<{ e164, name,
address, city, note } | null>` (`e164: string; name: string; address, city, note: string | null`; `null` = no such
order in that store) is the **single writer** of both the `platform.pii.revealed` audit row (store_id = the store,
meta `{ orderId, reason }`) and the order's `phone_revealed` event (`actor_kind` `platform`), through
`platformRevealScope(ctx, scope)` (`src/lib/platform/seam.ts`, maintainer: it requires `pii.reveal` and a fresh
step-up and upgrades the `platformScope(ctx, storeId)` that `revealOrderPiiAction` passes to `recordPlatformReveal`,
never a bare store id (P0b review F-3); lint L6 allows the call only in `src/lib/orders/profile.ts`, refuses the
function as a value anywhere, and refuses its WriteScope leaving that file); **`revealOrderPiiAction` writes no audit row of
its own**, so PL-07's "exactly one audit row and one order event per reveal" holds. **No CSV export** of orders exists in the console (core §F.11).

### PLA-§7.5 Catalog & pages tab (R2, S6; the R1 data lives in Overview strip 3)

`listPagesForConsole(scope)` (T4's `src/lib/admin-data/pages.ts`, core §K.1): name, slug, status, last publish, views
30 d, orders 30 d, versions kept / bytes, the live URL (`storeUrl`), the Design check chips per live page (P6), a
**Preview** button that opens a 10-minute `/preview/<token>` URL in a sandboxed iframe sheet (PD16,
`sandbox="allow-scripts"`, never `allow-same-origin`). Products and collections appear here from R2 (catalog read API
of storefront.md). No unpublish or takedown before PL-20 (PD33). In R1 the tab path answers the "Arrives with R2"
page and strip 3 carries the counts, the live URL and the preview.

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

### PLA-§7.8 Timeline view of the Activity tab (`activity?view=timeline`; rev 2: a view, not a tab)

One merged stream, newest first, 50 per page: lifecycle transitions (`platform.store.*`, `store.closed`,
`store.reopened`, `store.deletion_scheduled`), review decisions and requests (`signup_reviews`), plan changes and
boosts (`platform.plan.changed`, `platform.entitlement.set`), milestones (`store.milestone.reached`), impersonations
(start/end), staff notes of kind `decision` / `warning`, exports (`store.export_*`), handle renames, health snoozes
(`store.health.snoozed`). Source: `listStoreTimeline(ctx, storeId, { cursor?, limit })` = four bounded queries (audit
by `audit_store_idx` with an action allow-list, `sr_store_idx`, `imp_store_idx`, `pn_store_idx`) merged in memory by
time; cursor = `{ at, source, id }`. Each event: icon, sentence, actor, time; decisions show their note. The Activity
tab's segmented control switches **Audit** (PLA-§7.7, every row) and **Timeline** (this stream); the URL keeps the
view so ⌘K and notes can link to either.

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

### PLA-§7.10 Integrations health tab (R2, S6; the R1 data lives in Overview strip 6)

`integrationHealth(scope)` (P5, core §K.2 P0) rendered as tiles in the `sheet-health.tsx` pattern: **Sheets** (connected,
spreadsheet title only, binding verified at, backlog count and oldest, last push / pull and result, last error code),
**Pixels** (library count, per pixel: platform, label, CAPI token "set / not set", last OK, last error code; never the
token), **Telegram** (configured y/n, last delivery result), **WhatsApp templates** (count), **Turnstile** (store
override "set / not set"), **Outbox** (pending / dead per kind for this store with "Replay" on dead rows,
`stores.lifecycle`, P8's `replay(ctx, id)`), **Webhooks / carriers** (R2). Every tile: OK / Warning / Error with the
last error summary; secrets only ever "set / not set" (core §F.10).

### PLA-§7.11 AI tab (R2, S6 with P7; the R1 data lives in Overview strip 7)

`aiUsageForStore(scope, month)` and `aiStoreSummary(ctx, storeId)` (P7, core §K.2 P0): credits used / limit this
month, cloud cost this month (USD micros → "$1.84"), runs by task and **class** (`director_interactive`,
`director_deep`, `worker`, `fast`; count, provider mix server / local / library, p50 / p95 ms, guard rejections),
cache hit rate, store AI mode and Director mode (`store_ai.mode`, `store_ai.director`), learning on/off, open and
recent `ai_jobs` (kind, stage, heartbeat age, outcome; core §H.12), the last 20 runs as metadata (task, class, model,
ms, credits, outcome); never prompt or output text (ai.md AI-§E.5). Boost AI credits → §9.4. In R1 strip 7 shows the
summary; the per-store AI console pages are P7's under `/admin/ai/**`.

### PLA-§7.12 Notes tab (and the note composer used in the queue)

Composer: markdown-lite body (≤ 4,000 chars, PLA-§13.6), kind `note` / `decision` / `warning`, pin toggle, `@name`
mentions of staff (autocomplete over staff names; a mention sends `staff.mention`). List: pinned first, then newest;
each note shows author, role, time, edited marker; the author may edit within 24 h; the author or a super_admin may
delete (soft, `deleted_at`; the audit keeps the event). Analysts never see notes (`stores.notes`). A store never sees
notes. `src/lib/platform/notes.ts`: `listNotes(ctx, { storeId? , userId? })`, `addNote(ctx, input)`,
`editNote(ctx, id, body)`, `deleteNote(ctx, id)`, `pinNote(ctx, id, pinned)`.

### PLA-§7.13 Domains, Risk and Media tabs (R2, S6; R1 data in Overview strips 1 and 9, media in strip 8's meter)

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
remittance ageing, aggregates only, no customer rows; **(rev 3, OPS-1)** the city dimension is keyed by the canonical
`CityKey` slug of operations.md OPE-§10.1 (`"casablanca"`, `"fes"`, `null` → the "other" bucket), the same key
`carrier_rates.city_key`, `delivery_zones.cities` and `opsAggregates(dims: city)` use, and the console renders the
display name through the shared `cityLabel(key, locale)`; no console code compares a city by its display spelling.
Support (D5, R3): the store's tickets, support grants, messages sent, impersonation sessions.

Acceptance (PL-07, rev 2): each of the 6 R1 tabs and each of the ten Overview strips renders loading, empty and error
states (screenshot test at 1280 and 360); a deferred tab path renders the "Arrives with R2" page with a working link
to its strip; for support and analyst sessions the HTML and RSC payload of every tab and strip contain none of the
seeded customer canaries (phone, name, address, note) nor the seller's full e-mail; a reveal writes exactly one audit
row and one order event and is visible in the store's own Activity; the Overview answers ≤ 900 ms p95 on the `--perf`
fixture with one strip's source made to throw (the other nine render); the console media proxy
(`/api/admin/stores/<id>/media/<key>`, kept from revision 1 for strip 3's draft preview thumbnails) still streams for a
suspended store.

---

## PLA-§8. Lifecycle actions (PL-08) and lifecycle safety (PD54, rev 2)

### PLA-§8.0 The safety model: preview, arm, cooldown

Every lifecycle action of PLA-§8.1 goes through one `LifecycleSheet` (P1, `src/components/console/lifecycle/sheet.tsx`)
in three steps, none of which writes anything until the last:

1. **Preview.** The sheet opens with `lifecyclePreview(ctx, storeId, to)` (read-only, `src/lib/platform/lifecycle-preview.ts`):

   ```ts
   export interface LifecyclePreview {
     from: StoreStatus; to: StoreStatus; allowed: boolean; blockedBy: "edge" | "cooldown" | "pending_request" | null;
     storeSees: { locale: "ar" | "fr" | "en"; title: string; body: string; banner: string | null; publicPages: "live" | "neutral_404" | "neutral_503" | "unchanged"; publicOrders: "open" | "unavailable" | "refused" };   // rendered from shell.* keys in the store's default locale, with the reason sentence
     affects: { livePages: number; openOrders: number; dueCallbacks: number; agentsWithLease: number; agentsOnline: number; integrationsPaused: ("sheets" | "capi" | "telegram" | "webhooks")[]; renderJobsPending: number; openReview: boolean; reopenUntil: string | null; purgeAfter: string | null };
     willWrite: { audit: AuditAction; notification: NotificationKind | null; leasesReleased: boolean; templatesEnsured: boolean };   // what transitionStore does (core §A.5.1)
     cooldown: { lastChangeAt: string | null; typedHandleRequired: boolean };   // PD54: a change inside platform.lifecycle.cooldownMinutes needs the handle
   }
   export function lifecyclePreview(ctx: PlatformCtx, storeId: string, to: StoreStatus): Promise<LifecyclePreview>;
   ```

   Sources: `listPagesForConsole` (live pages), P4 `queueCounts` / `opsPulse` (open orders, due callbacks, leases,
   agents online), P5 `integrationHealth` (what pauses, from core §A.5.3), P8 `renderSummary` (pending renders),
   `signup_reviews` (open review), the store row (`closed_at`, `purge_after`). The sheet shows the store-facing text
   as the seller will read it (title, body, banner), the consequences as a short list with numbers ("3 agents hold a
   lease: it is released", "Sheets pauses for new orders; existing orders keep syncing"), and the edge's requirements
   (reason, note, typed confirmation, step-up) exactly as in the table below. Nothing is written.
2. **Arm.** After reason, note and the typed confirmation (where marked), the primary button shows a countdown of
   `platform.lifecycle.armSeconds` (default 5 s) with **Cancel** in the same spot a mis-click would land; `Esc`
   cancels; the write is sent only when the countdown reaches 0 and the sheet is still open and focused. The countdown
   is client-side and cheap; the step-up challenge (↑) comes **before** arming, so an expired step-up never interrupts
   the countdown.
3. **Cooldown.** When `cooldown.typedHandleRequired` is true (a lifecycle change on this store inside the last
   `cooldownMinutes`, read from `stores.status_changed_at`), the typed handle is required even for edges that do not
   normally need it (`restore`, `reopen`), and the sheet says why ("Changed 4 minutes ago by Karim: restricted").

Rules: the write is one `transitionStore` call with the compare-and-set of core §A.5.1; a stale `from` (someone else
changed the store meanwhile) answers `status_changed` and the sheet reloads the preview; no lifecycle action exists
in ⌘K, in the bulk bar or on a keyboard chord (they only open the sheet, like PD43 for kill switches); no bulk
lifecycle action (PD44); the preview itself is audited only when the action follows (no noise). The `restrict`
edge keeps its light requirements (no step-up, no typed confirmation) because it is the owner's instrument against
fake orders and must stay fast: the arm window is its safety.

### PLA-§8.1 Actions

All call `transitionStore(ctx, storeId, to, { reason, note, notify: { showNote } })` (core §A.5.1, T1), which
validates the edge, writes the audit row and **exactly one** store notification (kinds of §18.2, core §Q.1 Q.27),
invalidates caches, marks health dirty, releases agent leases and ensures the template set for `store` / `both`
stores. The console action adds the optional "show this note to the store" toggle (`notify.showNote`) and
`refresh()`.

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

Acceptance (PL-08, rev 2): every edge of core §A.5.1 that a staff member can take is reachable from the profile menu
with the listed permission, step-up and confirmation; an illegal edge is disabled with its reason; two staff
restricting the same store at once → one succeeds, the other sees "The store's status changed; reload"
(compare-and-set); a four-eyes purge requested by A cannot be confirmed by A (DB test); **the preview matches the
effect** (for every edge on the three seeded stores, `lifecyclePreview().storeSees` equals the banner / page the
store renders after the write, and `affects.agentsWithLease` equals the number of `releaseAllLeases` rows); cancelling
during the arm window writes nothing (no audit row, no notification, status unchanged); a second change inside the
cooldown without the typed handle is refused server-side (`cooldown_handle_required`), not only in the UI; the store
receives exactly one notification per transition.

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
the release chip; in R1 that is `products_max`, `webhooks_max`, `custom_domains_max`, `webhooks`, `accounting`,
`commissions`, `api_keys`, `custom_domain`, `experiments`, `coupons`, `reviews`; the rev 2 R1 keys `campaigns_max`
and `short_links_max` sit under Limits, core §A.4). Each row explains itself three ways (PD58): label + one-line
description (`console.entitlement.<key>`), the **registry default**, the **plan's value** (number input with unit and
an "Unlimited" toggle; switch for features; "Use default" option), and the **effective sentence** ("Stores on this
plan get 1 GiB"; for a limit under a state cap: "Pending stores get 100 MiB until approval"). `take_orders` is locked
to **On** with the note `console.plans.take_orders_locked` ("Orders are never blocked by a plan", PD8). Saving opens
the **diff** (old → new per changed key) and the **impact preview**:

```ts
// src/lib/platform/plans.ts
export interface PlanImpact {
  stores: number;                                    // stores on the plan without an override for the key
  lowered: { key: EntitlementKey; from: number | null; to: number | null; storesAbove: number;
             examples: { handle: string; used: number }[] }[];   // rev 2 (PD58): ≤ 20 stores already above the new limit, highest usage first (handles are public)
  featuresOff: { key: EntitlementKey; stores: number; examples: { handle: string }[] }[];   // stores that use the feature today (e.g. a Sheets binding) and lose it
  unaffected: number;                                // stores on the plan whose effective values do not change (overrides, boosts or usage below)
}
export function previewPlanChange(ctx: PlatformCtx, planId: string, patch: PlanPatch): Promise<PlanImpact>;
export function savePlan(ctx: PlatformCtx, planId: string, patch: PlanPatch, opId: string): Promise<void>;   // audit platform.plan.updated { diff }
```

Sentence form: "Lowers media storage for 12 stores; 3 are already above 500 MiB (@argan-souk 1.9 GiB, @maison-nour
812 MiB, @…): they keep their files, new uploads are refused until they are below the limit." Features that turn off
list what stops ("Sheets sync pauses for 4 stores that are connected"). Confirm → save → `invalidateEntitlements(id)`
for every store on the plan (≤ 2,000 in-process deletes) → `refresh()`. Validation: limits are integers ≥ 0 or
`null`; feature values boolean; unknown keys refused; a limit below a state cap's default is allowed but the sentence
says the cap wins while pending. The preview reads `store_usage` gauges and the feature's own marker (`sheet_bindings`,
pixel library count, `campaigns` count) through one platform query per key (`// tenancy: platform plan-impact`).

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
store · Onboarding help · 14:02-14:32 · customer details hidden"); **(rev 3, PD69)** under it the staff-facing line
`console.impersonation.masked` ("You will see customer names, phones, addresses and notes masked. To read one
customer, use the per-order reveal from the store profile."). Primary button "Start read-only view".

`startImpersonationAction(input)` (`stores.impersonate`) → core `startImpersonation(ctx, input)` (T2, frozen in
`src/lib/platform/impersonation.ts`) → redirect to the returned `/app/<h>` URL. Refusals (PD45): the staff member is a
member of the store → "You're a member of this store. Open it from your stores." with a link; status
`scheduled_deletion` or `purged` → disabled; another active impersonation in this session → it is ended first
(`ended`) and the new one starts. Bucket `p:impersonate:<userId>` 20/day.

### PLA-§10.2 While viewing (tenant shell, P2 component `ImpersonationRibbon`)

A full-width violet ribbon (hue 295, 36 px, above the topbar, never dismissible): "Viewing **<store>** as Store Gen
support · read-only · 24:13 left" + "Why" popover (reason, note, ticket ref) + **Note** (rev 2, PD56: a one-line
`platform_notes` composer of kind `note` for this store, staff-only, `stores.notes`; it never writes a tenant row) +
**Open profile** (the console store profile in a new tab) + **End**. The countdown reads `StorePulse.impersonation.endsAt`
(core D57) first and `ctx.impersonation.expiresAt` on the first paint (server time offset corrected once), so a client
navigation or a second tab never shows a stale remaining time; at 0 the client calls `endImpersonationAction` and
navigates to the profile. Every write control stays visible; pressing it gives the toast
`shell.impersonation.write_refused` ("Read-only while support is viewing"), never a modal; the server refuses anyway
(`impersonation_read_only`, audited by the seam, one row per refused call). Sensitive surfaces (secrets, phone reveal,
exports, account pages of the seller) show the lock state `shell.impersonation.hidden`. **Customers are masked (rev 3,
PD69, SEC-5):** every order, lead and customer row the tenant UI renders during the view comes through
`maskIfImpersonation` at the repository boundary (PLA-§7.2), so names read "Salma B.", phones "+212 6•• ••• •34",
addresses "Casablanca · address hidden", landmarks and notes "Hidden"; the order drawer, the queue card, the customers
list, the leads list, ⌘K results and the CSV / export buttons (refused as sensitive anyway) all show the same masked
values, and `MaskedValue` renders them with no reveal affordance (the `reveal` prop is never passed under
impersonation). The ribbon's "Why" popover carries the line `shell.impersonation.masked` ("Customer details are hidden
from support") so the seller reading over support's shoulder sees it too. The ribbon text has ≥ 4.5:1
contrast (design.md UX-03 row). The pulse keeps polling during impersonation (the staff member sees the same unread
and counts the seller sees, read-only), and the Store Health ring renders with its fixes shown but disabled
(`LockedControl` reason `{ kind: "impersonation" }`), so support can point at the fix without running it.

**On the console side (PD56):** while `ConsolePulse.impersonation` is set, the console topbar shows the chip
"Viewing @handle · 24:13" linking to `/app/<h>`, and the store profile header shows "You are viewing this store"
with End; starting a second view-as from the console ends the first (core §B.8, Q.31). The profile's Activity tab
lists the session the moment it starts (audit `platform.impersonation.started`), so a colleague sees it live.

### PLA-§10.3 End and afterwards

`endImpersonationAction()` → core `endImpersonation(ctx, "ended")` → redirect `/admin/stores/<id>/activity`. The store
receives `store.impersonation_started` at start (owners and admins) and `store.impersonation_ended` with the actual
window at the end or expiry; both appear in the store's Activity with the staff display name (core §F.5). **(rev 3,
PD69)** The `store.impersonation_started` body ends with "Customer details were hidden." (`notify.store.impersonation_started.body`
gains the sentence in ar/fr/en), so the seller's record of the visit states what support could not see.

Acceptance (PL-10): start → the store's notification exists with the reason and window; every exported store action
called during the session answers `impersonation_read_only` and writes `platform.impersonation.write_refused` (attack
suite); the ribbon counts down and the session ends itself at expiry (fake clock); a support user without a ticket
reference cannot start; End returns to the profile's Activity tab where the session is listed; **(rev 3, PD69)** under
an impersonating session the HTML and RSC payload of every tenant route (dashboard, orders list and drawer, queue,
customers, leads, ⌘K search JSON, notifications) contain none of the seeded customer canaries (attack case §O.3 15),
`maskIfImpersonation` is exercised by the repositories and not by the components (a spy on `mask.ts` sees calls from
`src/lib/orders/**` only), and a forced `revealOrderPii` from the tenant shell answers `forbidden`; **(rev 2)** the
countdown in two tabs of the same browser differs by < 1 s after one of them navigates (pulse-driven); the console
chip appears within one console pulse of the start and disappears within one of the end; a note written from the
ribbon lands in `platform_notes` with `store_id` = the target and `author_id` = the staff member and never in a
tenant table (attack suite case); the health ring's fixes are rendered disabled and a forced call answers
`impersonation_read_only`.

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
| **Delete account** (rev 4, PD81, core §F.9 SEC-20) | `deleteUserAccount(ctx)` (T2, frozen at C0) through `deleteUserAction({ userId, reason, note })` (`users.manage` ↑, typed confirmation of the user's e-mail): refused with `owns_store` while the user is an owner of any store that is not `purged` (the dialog lists those stores with links to their profiles: close and schedule deletion first, or transfer ownership in R3) and for a staff member (remove the platform role first, §14.1); anonymises `users` (e-mail → `deleted+<ulid>@invalid`, name, phone, locale nulled, `disabled = 1`), deletes `identity_links`, `sessions`, `password_resets`, `notification_reads`, keeps `legal_acceptances` with `ua` nulled and the audit rows | `platform.user.deleted` `{ reason }` (no e-mail, no name in the meta) | signed out everywhere; the sign-in page answers generically |

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

**R1 declarations the console shows (rev 2; core §D.4, declared in `src/lib/flags/defs/<track>.ts`):** `finance_lite`
(release, `true`, operations: SF-04 Profit lite behind `/finance`), `ai_director_brief` (release, `false`, ai:
AI-19a), `ai_copilot`, `ai_learned_priors`, `ai_risk_v2` (release, `false`, ai, R3), `design_publish_gates` (ops,
`"block"`, design: `"block" | "warn"`, the mirror of `platform_design.gatesAtPublish`; the row shows the count of
`page.publish.design_override` / `page.publish.budget_override` audit rows in 7 days as the cost of `warn`, so the
owner sees what the softer mode let through). `src/lib/flags/defs/platform.ts` (P1) declares `console_perf_panel`
(ops, `false`: shows request timings in the console footer for staff) and `health_tenant_ring` (release, `true`: the
tenant ring and issue list; `false` keeps the console flags and hides the ring from sellers, the one switch that lets
the maintainer defer SF-03's tenant surface without a schema change). Every flag of every track is listed with its
owner track; a flag missing from code shows "archived" and cannot be edited.

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

**Rev 6 P0b (frozen exports; P0b review F-9, so a track finds them in its part):** P6's field group `PlatformDesignFields(p: { value: PlatformDesignSetting; onSave(v: PlatformDesignSetting):
Promise<void> }): ReactElement | null` (`src/components/admin/brand/platform-design-fields.tsx`, CCR P1-5; the P0b
stub renders nothing, P1 mounts it here, P6 fills it at its merge; asserted in `src/lib/contracts/r1-p0b-design.ts`).

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
- **Design gates (rev 2; core §D.10 `platform_design`, DES-R8):** a field group rendered by P6's component
  (`src/components/admin/brand/platform-design-fields.tsx`, mounted here by P1, props `{ value, onSave }`): gate
  thresholds (Q, slop, novelty bands), `gatesAtPublish: "block" | "warn"` (mirrored into the ops flag
  `design_publish_gates`, PLA-§12.2), the novelty pool switch, calibration values. Saving goes through
  `setPlatformSetting("platform_design", …)` with audit `platform.design.changed` (DES-R15); the group shows the
  7-day count of design overrides next to the mode switch. P1 owns the page and the mount, P6 the fields and their
  validation.
- **Health engine (rev 2; `platform.health`, PD67):** `issueNotifyMinSeverity` (2 or 3), `staleAlarmMinutes`
  (15-240), `showScoreToTenantsBelowN` (0-100, default 0), each with its sentence of effect; `snoozeDays` is shown as
  a fixed value (7).
- **Lifecycle safety (rev 2; `platform.lifecycle`, PD54):** `armSeconds` (3-15) and `cooldownMinutes` (0-120), with
  a live preview of the arm button.

### PLA-§13.2 Sign-up (`/admin/settings/signup`)

Tabs **Mode & thresholds** (§3.2, incl. the sandbox ceilings card of PD68), **Invite codes** and **Waitlist** (§3.3;
rev 3: waitlist rows with `source = "cap:<day>"` carry the chip "Daily cap" so the owner can invite them first), **Turnstile**
(the `platform_turnstile` widget: site key, secret "set / not set" with Replace, hostnames note "the apex hostname covers
every store subdomain", "Test" button that verifies a token from an embedded test widget; secrets are never displayed;
**rev 3 (PD68)** the tab states the gate rule in one line: "Required for sign-up in Approval and Open; scored in Invite").

### PLA-§13.3 Protected brands (`/admin/settings/brands`)

Table: term, kind (brand, bank, carrier, gov, platform, offensive: offensive terms show as "••••" until "Show"), match
(exact, substring; skeleton from R3), active, note, added by. Add / edit / disable; seeded rows can be disabled, never
deleted (PLA-§2.1); staff-added rows can be deleted. A **"Check a name"** box runs `brandTokens()` + the active terms
on any typed name, handle or e-mail and lists the matches with their points, so staff can test a rule before relying
on it. Cache invalidation: the 5-minute `protectedTerms()` cache is cleared on save.

**Live brand guard (rev 3, PD70, SEC-18).** The same terms protect a store after approval, at three points:

```ts
// src/lib/platform/brand-check.ts (P1; server-only; the second tenant-callable function of src/lib/platform/**, PLA-§3.7)
export type BrandField = "store_name" | "legal_name" | "whatsapp_name" | "brand_name" | "handle" | "page_name" | "seo_title" | "policy_text";
/** rev 4: the core's frozen P0 signature (core §K.2 P0 platform stubs, §C.7, D76); the R1.0 stub answers "ok".
 *  Callers: P2 saveGeneralAction + onboarding (store name, legal name, WhatsApp display name), P3 the policies contact
 *  block, P6 the brand kit (brand name). One call per field; a caller refuses on "exact" for non-staff. */
export function checkBrandTerms(kind: BrandField, value: string): Promise<"ok" | "near" | "exact">;   // active rows, cached 5 min (`protected-terms`); never throws ("ok" on cache miss + DB error, logged to error_events area "platform")
/** P1-internal (console "Check a name", rules/platform.ts): the same match with the term, never returned to a tenant */
export interface BrandMatch { verdict: "ok" | "near" | "exact"; term?: string; termKind?: string }
export function brandMatches(kind: BrandField, value: string): Promise<BrandMatch>;
```

**Revision 3's multi-field form** `checkBrandTerms(fields[], opts) → BrandCheck` is withdrawn in favour of the core's
frozen one-field signature (a contract drift the round-2 alignment found); the callers loop over their fields, which
keeps the frozen stub one line and the tenant result free of the matched term.

1. **At every write of a brand field.** `saveGeneralAction` (P2, PLA-§22.10.1), `saveOnboardingContactAction` and
   `saveOnboardingDetailsAction` (P2, PLA-§22.2: store name on `/app/new`), `renameHandleAction` (P2; `handleProblem`
   already refuses protected handles, core §C.7) and `createStoreAction` (`/admin/stores/new`) call `checkBrandTerms`
   once per field for the store name, legal name and WhatsApp display name (P3's policies contact block and P6's brand
   kit do the same for their fields, core §C.7). An `exact` match **refuses** the write for a member with
   the action error `brand_protected` (rendered by the limit sheet, variant `brand_protected`: "This name contains a
   protected brand name. Use your own brand, or contact Store Gen support if you are the owner of that brand.",
   `shell.limit.brand_protected`), writes `store.brand_term.refused` `{ field }` (rev 5, CRIT2-14: core §F.5's name; rev 4 wrote the shorter `brand_refused` form) to the store's audit (no term in the meta)
   and `markHealthDirty`; staff may override with a note (`/admin/stores/new`, the same rule as the handle). A `near`
   match lets the write through and raises the console flag `brand_near_live` (PLA-§6.3.3).
2. **On every health run.** Rule `platform:brand_term_live` (`rules/platform.ts`) scans `inputs.brand` and the live
   pages' `name` / `seoTitle` (PLA-§6.3.1); an exact term raises `brand_term_live` (`attention = 2`), a Needs-attention
   Danger row and `staff.alarm` with `{ alarm: "brand_term_live", store, term, field }` once per store, term and ISO
   week (dedupe `alarm:brand_term_live:<storeId>:<termHash>:<YYYY-Www>`). The rule costs string operations over ≤ 50
   pages, so it runs on every computation (≤ 5 min after a publish, which calls `markHealthDirty`), not nightly.
3. **At publish** (P3, landing.md; PLA-§Q.3): the honesty gate `honesty:password_field` refuses a landing or store
   page containing `<input type="password">`, a card-number pattern or an `otp` field, which is never legitimate on a
   COD page; the gate is listed here because the console shows its refusals in the Risk strip (`page.publish.*`
   audit rows with item `honesty:password_field` in 7 days).

The "Check a name" box reuses `brandMatches` (the same matcher `checkBrandTerms` wraps) so the console and the write path cannot disagree. Acceptance: renaming
a seeded active store to "CIH Bank · Vérification" from the tenant General page answers `brand_protected` and writes
`store.brand_term.refused`; publishing a page whose SEO title contains the term and recomputing health raises
`brand_term_live` and exactly one `staff.alarm` in the week; the term never appears in a tenant-visible issue.

### PLA-§13.4 Legal documents (`/admin/settings/legal`, `legal.manage`)

**Rev 6 P0b (frozen exports; P0b review F-9, so a track finds them in its part):** the placeholder fields the legal editor offers come from P3's `POLICY_TEMPLATE_FIELDS: readonly string[]`
(`src/lib/policies/fields.ts`, CCR P1-11: the scalar leaf paths of `PoliciesSetting`, no invented field; P3 appends
names and never renames one; asserted in `src/lib/contracts/r1-p0b-design.ts`).

List grouped by kind (`tos`, `privacy`, `aup`, `dpa` (**R2**: the kind stays in the enum, no R1 seed text and no R1
editor row; RF §3.3, core §L.2 PL-14), `store_privacy`, `store_terms`, `store_shipping`, `store_returns`,
`store_contact`) × locale (ar, fr, en): version, status (draft / published /
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
effectively inactive until then (state "Waiting for 2FA"). **(rev 4, core §B.5 rev 3 / SEC-24, ENGC-16)** Acceptance
consumes the invite with one conditional statement before the role is set, in the same transaction: `UPDATE
staff_invites SET accepted_at = ?, accepted_by = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND
expires_at > ?`, and `affectedRows === 1` is the only success path, so two concurrent accepts give one staff member
(`test:db` case 20); the page answers with `Referrer-Policy: same-origin` (it posts a Server Action before hydration;
`no-referrer` would serialise the form's `Origin` as `null` and Next would answer 500), `noindex`, `private, no-store`.

### PLA-§14.2 Step-up

`StepUpSheet` (P2 primitive): title "Confirm it's you", a single 6-digit input (`inputmode="numeric"`,
`autocomplete="one-time-code"`, paste-friendly), "Use a recovery code" link (switches to a 10-char input), errors
"That code didn't work" / "Too many tries, wait 15 minutes" (`p:mfa:stepup:<userId>` 5 / 15 min, core §B.7). On
success the topbar chip shows "Verified · 4:59" counting down (PLA-§Q.32) and the original action re-runs (§4.5).
**Tenant variant (rev 4, PD80):** in the tenant shell the same sheet asks for the TOTP code when the user has it and
otherwise for the password (`method: "password"`: one password field with Show, `autocomplete="current-password"`,
T2's `stepUpWithPasswordAction(password)` through the scrypt semaphore, bucket `p:password:<userId>`, errors
`shell.stepup.password_failed` / `shell.err.rate_limited`, busy `auth.busy`); the title reads `shell.stepup.title`
("Confirm it's you") and the line under it names the action ("to export your customers' data"). Staff always use TOTP.

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
  audit `platform.staff.signed_out_all`). **(rev 4, D44 rev 3, SEC-14)** The allowlist line names the address source in
  force ("right-most public hop" or "`CF-Connecting-IP` behind Cloudflare") and the address the current request was
  matched with, so the owner can confirm before the nameserver switch that the allowlist will still admit them; while
  S mode is on and `ADMIN_HOST` is unset the line `console.security.admin_host_missing` is red ("The console still
  shares the shops' address. Set ADMIN_HOST before opening sign-ups").

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
| Cron | last tick (time, duration, ok), a 50-tick strip (ok / failed / missing gaps), per job: last run, ms vs budget, processed, error code; **(rev 4, core §H.5 rev 3)** `tick.lagP95Ms` (event-loop lag during ticks), `tick.skipped24h` (ticks skipped by the tick lease; core rev 5, CRIT2-18: a `cron_cursors` lease row replaced `platformLock("tick")`), `db.poolWaitP95Ms` / `db.lockPoolWaitP95Ms` | no `job_runs` row for 10 min · `tick_lag` (lag p95 > 250 ms during a tick, red) · `pool_wait` (query or lock pool wait p95 > 500 ms over 5 min, red) |
| Queues | outbox by kind × state with the oldest pending per kind; dead items (store, kind, topic, attempts, last error) with **Replay** (`stores.lifecycle`, P8 `replay(ctx, id)`); render queue depth, failed renders; export jobs; purge jobs; backups running | any `dead` > 0 (yellow), dead older than 24 h (red) |
| Sheets | backlog per store (top 10 by oldest pending), last push / pull per store, the service-account token health; **(rev 4)** the slot-1 capacity line "≈ 16 stores per tick; threshold now {n} min" | a store backlog > `max(15, 5 × ceil(activeSheetsStores / 16))` min (rev 4, core §H.5 rev 3 / ENGC-33: the fixed 15 min would fire permanently past 16 active Sheets stores) |
| Storage | DB used vs quota with 70 / 85 % marks, the top 15 tables by size, the top 15 stores by `store_usage` media + page bytes, `DATA_DIR` bytes vs `DATA_DIR_BUDGET_BYTES` and files vs the 300,000-inode warning (rev 4: `getHealth().dataDir` from the bounded walk, core §G.2 / §H.5 rev 3; "free disk" is not measurable on Hostinger and is no longer shown), media backend (`fs` / `db`), reclaimable `media_chunks` bytes with the hPanel `OPTIMIZE TABLE` guidance (core §G.3), a trend "85 % reached in ~41 days" when ≥ 7 daily points exist; **(rev 3, PD68)** the **pending media budget** meter (`platform_usage.pending_media_bytes` vs `signup.pendingMediaTotalMiB`, with the count of pending stores and the five largest) and **sandboxes today** (`pending_stores` vs `pendingStoresPerDay`) | DB ≥ 85 %, `DATA_DIR` ≥ 85 % of its budget (yellow at 70 %), backend `db` while `DATA_DIR` is set; pending budget ≥ 80 % yellow, ≥ 95 % red (rev 4: core §H.5 thresholds; at 100 % uploads of pending stores answer `quota` as designed, and the owner should approve or reject) |
| Errors | last 24 h by `area / code / route` with count, stores affected, first / last seen; a code row expands to its redacted samples | > 50 of one code in an hour |
| Runtime | build id, build time, Node version, memory (rss, heap used / total), uptime, boot warnings (config, data dir, env aliases); **(rev 4, core §H.5 rev 3 / SEC-10)** `build.gateSha` and `gateAt` (the offline gate's commit the build was made from) beside the build's own commit | a boot warning of level error · `gate_mismatch` (the gate SHA differs from the build's commit, red) |
| Edge / Worker (rev 2, PD57; `getHealth().edge`) | S mode on / off, Worker version last seen (`x-sg-worker`, `WORKER_VERSION` of `edge/worker.js`), last edge-verified request (relative), requests still using `EDGE_KEY_PREV` in 24 h, foreign-host count 24 h, **(rev 4)** unverifiable `x-sg-edge` requests 24 h (`edge.badKey24h`, core §C.2 step 2: such requests get the neutral 404, never the platform), the rotation state (`EDGE_KEY_PREV` set / not set) with the three rotation steps of core §C.5 as a checklist | prev-key use 24 h after a rotation; no edge-verified request for 15 min while S mode is on and ≥ 1 store is live; `edge_bad_key` (≥ 10 unverifiable keys in a minute, red: the Worker secret and `EDGE_KEY` disagree) |
| Render queue (rev 2, PD57; P8 `renderSummary()` platform-wide + per store) | depth by `reason` (`address`, `brand`, `store_info`, `conversions`, `theme` R2, `product` R2, `reviews` R3, `runtime`) × state, the oldest pending (store, page, age), failed jobs in 24 h grouped by store with the error summary and **Retry** (`domains.manage`, P8 `enqueueRenders`), last-hour throughput (pages / min) and the ETA for the pending set, the §M notes recorded by re-renders (`render_jobs.error` notes) as a count with the top 3 item ids | pending > 500 (yellow) · oldest pending > 60 min (yellow) · any failed job older than 24 h still failed (red) · throughput 0 with pending > 0 over two ticks (red) |
| Health engine (rev 2, PD57; `getHealth().health`) | stale snapshots (rev 4: `active` stores with `computed_at` older than `max(staleAlarmMinutes, 1.5 × cycleMin)`, PD78), dirty rows waiting, last `platform.health` run (ms vs its 3 s budget, stores processed, `perStoreP50Ms` / `p95`), **the measured cycle** ("every store is rechecked about every {cycleMin} min at today's {stores} active stores"), the slowest rule ids of the last run (from `job_runs.summary.rulesSlowest`), the issue mix platform-wide (count per group, k-suppressed for analysts) | stale > 0 (yellow) · stale > 10 % of active stores or last run > 15 min ago (red) · `cycleMin > 120` (yellow: time for the second slice the core decides in R2) |
| AI (rev 2, PD57; P7 `aiHealth()`, core §H.5) | provider ok / paused (and why), per-class served model and fallback use in 24 h, open Message Batches (count, oldest), `ai_jobs` running / orphaned / failed 24 h, monthly cap used % (platform), **the pending slice used % (rev 3, PD68: `ai_cost_micros_pending` vs `caps.pendingSharePct × monthlyUsd`)**, refusal rate 24 h, the detached-job probe result (`qa:detached-job-probe`, recorded in HANDOFF: pass / fail / not run) | cap ≥ 70 % (yellow) / ≥ 85 % (red) · pending slice ≥ 100 % (yellow, `ai_pending_cap`) · provider auth failure · Director unavailable · an orphan recovered or failed · refusal spike (AI-§O) |
| Design tables (rev 2; DES-R12, `getHealth().design`) | `design_genomes` and `headline_shingles` bytes, rows, growth per week | > 300 MB (yellow) |
| Commerce heartbeat | the last order platform-wide and orders per hour for 24 h (`orders_created_idx`, `is_test = 0`) | §5.3 rule |

Every panel header carries its "Updated hh:mm" line; every red or yellow state is a text label with an icon
(PLA-§4.7 rule 8); every panel names the alarm it drives in a tooltip, so a staff member can read why a notification
arrived.

### PLA-§15.2 Alarms

Job `platform.alarms` (every tick, ≤ 1 s): evaluates `getHealth()`'s cheap subset and the rules above; a newly red
alarm sends `staff.alarm` (`vars: { alarm, value }`, dedupe `alarm:<code>:<YYYY-MM-DDTHH>`) to `platform_staff` with
`minRole: "admin"` and appears in Needs attention; a recovered alarm sends nothing (the panel shows "Recovered 14:20").

Alarm codes (rev 2 complete list, extended in rev 3, rev 4 and rev 6; the first eight are revision 1's, the rest core §H.5 rev 2 and PD57):
`no_tick` (10 min) · `outbox_dead` (any kind) · `db_70` / `db_85` · ~~`disk_low` (< 2 GiB)~~ (rev 4: replaced by
`data_dir_70` / `data_dir_85`, below) · `inodes_high` (> 300,000) · `error_spike` (> 50 of one code in an hour) ·
`sheets_backlog` (a store beyond the scaled threshold, below) · `commerce_quiet` (§5.3 rule) ·
`render_stuck` (oldest pending > 60 min or throughput 0 with pending) · `render_failed_old` (a failed job > 24 h) ·
`edge_silent` (S mode on, no edge-verified request for 15 min) · `edge_prev_key` (prev-key use 24 h after rotation) ·
`health_stale` (`staleAlarmMinutes`) · `health_job_slow` (the job exceeded its slot three ticks in a row) · `ai_cap_70`
/ `ai_cap_85` / `ai_cap_reached` · `ai_auth_failed` · `ai_director_unavailable` · `ai_refusal_spike` · `ai_job_orphan`
· `design_tables_large` (300 MB) · `backup_failed` · `backup_not_downloaded` (`remindAfterDays`) · `breakglass_unreviewed`
(a week older than 14 days) · **(rev 3)** `signup_capped` (PD68, info; revision 3 called it `signup_cap_reached`) ·
`pending_media_budget` (PD68, ≥ 80 % yellow, ≥ 95 % red) · `ai_pending_cap` (PD68, relayed from `aiHealth()`) ·
`brand_term_live` (PD70, per store and term, weekly dedupe) · `abuse_reports_spike` (PD70: ≥ 5 new reports
platform-wide in an hour, or ≥ 3 on one store in 24 h) · **(rev 4, core §H.5 rev 3)** `data_dir_70` / `data_dir_85`
(`DATA_DIR` vs `DATA_DIR_BUDGET_BYTES`; they **replace** `disk_low`, which `statfs` cannot measure on Hostinger) ·
`edge_bad_key` (≥ 10 unverifiable `x-sg-edge` in a minute) · `gate_mismatch` (the build was not made from the commit
the offline gate passed) · `pool_wait` (pool wait p95 > 500 ms over 5 min) · `tick_lag` (event-loop lag p95 > 250 ms
during a tick) · `health_stale` and `health_job_slow` with the measured-cycle rules of PLA-§6.3.4 (PD78) ·
`sheets_backlog` with the scaled threshold `max(15, 5 × ceil(activeSheetsStores / 16))` min · **(rev 6, core §H.5 rev 5,
CRIT2-13)** `signup_unguarded` (red: a stored `approval` / `open` signup mode with no configured `platform_turnstile`,
so `signupAction` treats it as `invite`, core §B.2; PLA-§3.1). It pairs with the refusal code `turnstile_required`
(not an alarm: `savePlatformSettingsAction` refuses `approval` / `open` without a configured widget). The AI alarms are raised
by P7's `aiHealth()` flags and only relayed here, so one notification path exists; the machinery alarms (`no_tick`,
`pool_wait`, `tick_lag`, `edge_*`, `gate_mismatch`, `data_dir_*`) are computed from `getHealth()` (P8's data), the
store-level ones from `store_health` and `platform_usage` (P1).

Acceptance (OS-09): stopping the cron for 11 minutes (fake clock in `platform-check.ts`) turns the Cron panel red and
produces exactly one staff notification per hour; replaying a dead outbox row moves it to `pending` and writes an
audit row; the page renders without `getHealth()`'s storage snapshot (shows "Snapshot not taken yet"); **(rev 2)** a
seeded render job left `pending` for 61 minutes on a fake clock turns the Render queue panel yellow and raises
`render_stuck` once; a seeded `active` store without a snapshot for `staleAlarmMinutes + 1` raises `health_stale`;
the Edge panel on the temporary domain reads "S mode off" with no alarm and no network call.

---

## PLA-§16. Domains view (`/admin/domains`, OS-06, core §C.10)

### PLA-§16.1 Status card

Address mode (P only / S on), `PLATFORM_URL` host, `STORE_ROOT_DOMAIN`, `LEGACY_PLATFORM_HOSTS`, `BEHIND_CLOUDFLARE`,
`TRUSTED_PROXY_HOPS`, **`ADMIN_HOST`** (rev 4, D44 rev 3: shown with the line "Console on its own host" or, while S mode
is on without it, the red "Console still on the shops' origin") (non-secret values shown), `EDGE_KEY` and
`EDGE_KEY_PREV` (set / not set only), the current signup-mode default this implies (D9), the Worker version last seen.

### PLA-§16.2 Re-render progress

`render_jobs` with reason `address`: pending / running / done / failed totals and per store (the 20 with the most
failures), an ETA from the last hour's throughput, **Retry failed** and **Re-render all live pages** (`domains.manage`
↑; P8 `enqueueRenders` per store through a fan-out job so the request returns at once; audit
`platform.domains.rerender`).

### PLA-§16.3 Domain-move checklist (state in `platform.domainMove`)

Owner steps from RESEARCH §5.2 and app steps from core §C.10, each with "Mark done" (records date and staff):
buy the domain · Cloudflare zone · apex A record checked in hPanel · proxied `*` record · nameservers switched ·
Hostinger CDN off · TLS route (Full strict) · www Redirect Rule · `/media/*` Cache Rule · Worker deployed with its
secret and the `*.<domain>/*` route · **(rev 4, core §C.10 rev 3)** "verify the console allowlist still admits you"
(the Security settings line of PLA-§14.3 shows the address the allowlist matched, `CF-Connecting-IP` behind
Cloudflare) **before** nameservers switch · env full replace with `PLATFORM_URL`, `PUBLIC_URL`, `STORE_ROOT_DOMAIN`,
`EDGE_KEY`, `BEHIND_CLOUDFLARE=1`, `LEGACY_PLATFORM_HOSTS`, `TRUSTED_PROXY_HOPS` and **`ADMIN_HOST=console.<domain>`**
(core §H.7, 20 keys) + **restart, no rebuild** (every key is a server-side `process.env` read; revision 3 said
"rebuild", ENGC-26) · re-render all live pages · legacy 308s on · cron URL updated · Meta / TikTok domains · Turnstile
hostnames · Sheets links.
Verification V1 … V11 (RESEARCH §5.3), each with a note and "Passed": the server-runnable ones have a **Run** button
that calls `runDomainCheck(id)` (`src/lib/platform/domain-move.ts`): V3 (`HEAD https://probe.<root>/` expects the
neutral 404 with `x-sg-mode: subdomain`), V7 (a 308 with the byte-identical query from the legacy host), V8 (the
certificate subject covers `*.<root>`, via `tls.connect` with SNI), V10 (Turnstile verify on a subdomain, needs a token
from the test widget); the others are manual (V1 `npm run test:hosts`, V2, V4, V5, V6, V9, V11 scripts) and take a
note. **(rev 4, PD82)** One app check is added after V11: **V12** "console on its own host" (`runDomainCheck("V12")`:
passes when the Domains page making the check was itself served on `ADMIN_HOST` (`effectiveHost().cls === "console"`
for that request) **and** a server-side `HEAD https://<root>/admin` without cookies answers the neutral 404, never a
console or store page; both answers are recorded with the check); **(rev 5, CRIT2-13) V13** "human check ready"
(`runDomainCheck("V13")`: `platform_turnstile` is configured, its hostnames include the new root, and a token from the
test widget verifies against `/signup`; until V13 passes the signup default stays `invite`, core §C.10 step 3), and V4 now expects the neutral
404 for a wrong `x-sg-edge` (core §C.10
step 3). When every V check has passed, a banner offers "Switch sign-up to approval" (the D9 default flips by itself
once both env vars are set **and V13 has passed**, core D9 / §B.2 rev 6; this button only clears an explicit override), and the D69 ceilings card of PLA-§3.2 is
linked from the banner because they become the sandbox's only bound once anyone may sign up.

### PLA-§16.4 R2 (OS-12, OS-13, S6)

Edge cache tile (purge requests sent / failed in 24 h, the last purge error), Worker alerts (5xx rate from the Worker
analytics the owner pastes or the alert e-mails, **[unverified]** which Cloudflare data is reachable without an API
token).

### PLA-§16.5 R3 (OS-14 … OS-18, D1)

Custom domains table (`store_domains`: host, store, status, primary, verified, last check, DNS lost since) with
approvals arriving as queue requests of kind `domain`, plus the Cloudflare custom-hostname state per row.

Acceptance (OS-06): the checklist state survives a restart and a deploy; "Run" for V3 on the temporary domain answers
"S mode is off" without a network call; no secret value ever appears in the page; **(rev 4)** "Run" for V12 on the
temporary domain answers "ADMIN_HOST not set (expected before the move)" without a network call, and the env step's
text says "restart", never "rebuild" (`test:db` case 19).

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
  imported by the maintainer's `src/lib/notify/registry.ts`; core §I.4): `NotificationKindDef = { kind, group,
  defaultSeverity, audienceHint, vars: z.ZodType, link?: (vars, ctx) => string, tenant: boolean, batch?: { windowMin:
  number } }`. Titles and bodies are message keys `notify.<kind>.title` / `.body` with `{var}` placeholders;
  tenant-facing kinds must exist in ar, fr and en (`test:i18n-coverage`), staff kinds in en. `vars` carry ids, counts,
  codes and short labels, never customer data (core §I.4); `test:platform` asserts that no registered kind's `vars`
  schema has a key named `phone`, `name`, `address`, `email` or `note`.
- **Rendering at read time** in the reader's locale (`users.locale`, PD11); `vars` hold ids, counts, codes and short
  labels only, never customer data; `text` is staff free text and is shown as plain text.
- **Links (rev 4, core §I.4 rev 3 / SEC-6):** `notify()` validates `opts.link` (and every kind's `link(vars, ctx)`
  result) before the insert: a tenant link must be an in-app path built with `appHref(handle, path)` and match
  `^/app/[a-z0-9-]{3,30}(?:[/?#]|$)`, a staff link a `consoleHref(path)` result (`^/admin(?:[/?#]|$)`, made absolute on
  `ADMIN_HOST` by the core builder, PD82), a user-level link `^/app/account(?:[/?#]|$)`; anything else (an https URL a
  staff member typed in §19.1, a link built by mistake) is stored as `null` and shown as plain text in the body, so a
  notification can never carry an open redirect. The core's pattern as written (`^/app/[a-z0-9-]{3,30}/`) refuses the
  dashboard root `/app/<h>` that seven platform kinds link to; PLA-§Q.4 asks the core to adopt the form above, and
  until it does the kinds link to `/app/<h>/` (trailing slash, redirected by Next to `/app/<h>`).
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
| `health.issue_new` (rev 2, PD67; core §I.4) | store | store_role owner, admin | `{ issueId, group, severity, metric, value, n }` (dedupe `health:<storeId>:<issueId>:<YYYY-Www>`) | `/app/<h>#health` |
| `member.joined` | team | store_role owner, admin | `{ name, role }` | `/app/<h>/team` |
| `invite.accepted` | team | user (the inviter) | `{ name, role }` | `/app/<h>/team` |
| `member.role_changed` · `member.suspended` | team | user (the member) | `{ role }` | `/app/<h>` |
| `security.2fa_required` | security | store | — | `/app/account/two-factor` |
| `user.2fa_reset` · `user.password_reset` | security | user (platform-wide) | — | `/app/account/security` |
| `legal.updated` | platform | user (platform-wide, lazily per acceptance check) | `{ kind, version }` | `/app/account?doc=<kind>` (rev 4: an in-app path that opens the document sheet; revision 3 linked "the document", a public URL the link rule renders as plain text) |
| `staff.message` | support | store_role owner, admin (or one user) | text | optional link |
| `staff.signup_new` (batched hourly) · `staff.signup_hold` · `staff.info_answered` · `staff.appeal` · `staff.request` | staff | platform_staff admin | `{ count? , store }` | `/admin/queue?r=…` |
| `staff.purge_requested` · `staff.purge_confirmed` · `staff.super_admin_requested` | staff | platform_staff super_admin | `{ store? , by }` | `/admin/security/break-glass` |
| `staff.alarm` · `staff.kill_changed` | staff | platform_staff admin | `{ alarm, value? }` / `{ key, to }` | `/admin/health`, `/admin/flags` |
| `staff.mention` | staff | user (the mentioned staff) | `{ store, by }` | the note |
| `staff.impersonation_started` (rev 2) | staff | platform_staff admin (all staff except the actor) | `{ store, by, minutes }` | `/admin/stores/<id>/activity` |
| `staff.abuse_report` (rev 3, PD70) | staff | platform_staff admin | `{ store, reason, count24h }` (dedupe `abuse:<storeId>:<YYYY-MM-DD>`, so one row per store and day reads "3 reports today") | `/admin/stores/<id>` (Risk strip) |
| `staff.signup_capped` (rev 3, PD68) | staff | platform_staff admin | `{ cap, waitlisted }` (dedupe `signup_cap:<YYYY-MM-DD>`) | `/admin/settings/signup?tab=waitlist` |

Kinds of other tracks (P4 orders and callbacks, P5 Sheets / CAPI / Telegram failures, P7 AI cap and auth, P8 export
ready and backups) live in their own extension files. **(rev 3, PD69)** `store.impersonation_started.body` ends with
"Customer details were hidden." in ar / fr / en (PLA-§N.3).

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
en) top-end writes the cookie **`__Host-sgl`** (rev 3, PD71, SEC-13: `Secure; Path=/; SameSite=Lax`, no `Domain`, not
HttpOnly because it is a display preference the switcher reads client-side, 1 year) and, after sign-in, `users.locale`.
Reads parse the value with `z.enum(["ar", "fr", "en"])` and fall back to the `Accept-Language` pick on any other
value; when the request carries several cookies named `__Host-sgl` (impossible for a conforming browser, possible for
a forged header) only the first host-only one is used; `users.locale` is written from the parsed enum only, never from
the raw header. Every cookie the platform host sets carries the `__Host-` prefix (`__Host-cs`, `__Host-csg`,
`__Host-sgd`, `__Host-sgl`; core §C.9), and `qa:edge-sim` (T3, PLA-§Q.3) asserts the platform host never emits a
`Set-Cookie` without it. Every form: label above the input, no placeholder-as-label, errors under the field and in an
`aria-live` region, the submit button keeps its width while busy (spinner inside), Enter submits. **Touch ergonomics
(rev 3, UX-37, every P2 form):** inputs and selects 52-56 px tall below 768 px (48 px above), text **16 px** or larger
so iOS Safari never zooms on focus, 12 px gap between fields, the label 13 px / 500 above, the error summary scrolled
into view above the first invalid field, and the primary button reachable without scrolling past the keyboard on a
390 × 844 viewport (the two-step signup keeps each step ≤ one screen with the keyboard closed).

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
     "Tell me when it's ready" that sets `modeInterest`; **rev 3, PD72:** each card carries its `modeSummary(mode)`
     line and three "you get" bullets, and the group ends with `auth.signup.mode.change_later` "You can change this
     later; nothing is deleted", §22.1.5); market (a fixed chip "Morocco · MAD" while only MA is
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

`Referrer-Policy: same-origin` (rev 4, core §B.1 / §B.5 rev 3, ENGC-16: the page posts a Server Action before
hydration and `no-referrer` would make the browser send `Origin: null`, which Next answers with a 500; the token is a
path segment and `same-origin` sends nothing cross-site; revision 3 wrote `no-referrer`), `noindex` (core §B.1).
Buckets `p:invite:accept:ip` (core §E.8). Acceptance is T2's compare-and-set `UPDATE store_invites … WHERE accepted_at
IS NULL AND revoked_at IS NULL AND expires_at > ?` before the membership insert (core §B.5 rev 3, SEC-24): the
"members limit reached" and "already used" states above come from that statement's outcome, and a double tap on
**Join** shows the joined state once.

#### PLA-§22.1.5 Mode explainer (`modeSummary`, rev 3, PD72, OPS-31)

```ts
// src/components/admin/common/mode-explainer.tsx (P2; isomorphic; derived from modeAllows() so it never drifts from core §A.2)
export function modeSummary(mode: StoreMode): { line: MessageKey; get: [MessageKey, MessageKey, MessageKey]; later: MessageKey; release: "R1" | "R2" };
export function ModeCards(p: { value: StoreMode; onChange(m: StoreMode): void; available: readonly StoreMode[]; interest?: { value: boolean; onChange(v: boolean): void }; compact?: boolean }): JSX.Element;
```

One component renders the three cards wherever the choice appears: `/signup` step 2, `/app/new`, the onboarding
`details` step when the owner came from `/app/new`, and the mode-switch sheet of Settings → General (PLA-§22.10.1).
Each card: the title (`auth.signup.mode.<mode>.title`), the one-line explainer (`.line`), three "you get" bullets
(`.get.1-3`) and, for a mode not in `available`, the "Coming soon" chip with the "Tell me when it's ready" checkbox
(PD30). Under the group: `auth.signup.mode.change_later` ("You can change this later; nothing is deleted.", the
hide-never-delete rule of core §A.2 in the seller's words). Reference texts (en; fr and ar in PLA-§N.3):

| Mode | `.line` | `.get.1` / `.get.2` / `.get.3` |
|---|---|---|
| landing | One page per product, built to take cash-on-delivery orders from ads. | A sales page per product with the order form · Pixels and WhatsApp per page, exports to PHP · Orders, call center and Sheets |
| store | A full shop: catalog, product pages, cart and checkout. | A catalog with collections and search · Product pages with a cart and checkout · The same orders, call center and Sheets |
| both | The shop plus sales pages attached to its products. | Everything in Full store · Campaign pages that borrow product prices and stock · One order list for both |

Rules: no bullet claims a number, a price or a result (owner rule 4); the bullets are derived from
`modeAllows(mode, feature)` and `test:platform` asserts each bullet's feature is allowed in that mode and that the
three modes' bullet sets differ; `test:i18n-coverage` covers the twelve keys in ar / fr / en; the cards are keyboard
radio buttons (arrows move, Space selects) with ≥ 44 px targets at 360 px.

### PLA-§22.2 Onboarding wow flow (UX-01, PD4, PD23, PD48, PD59, PD60, PD61; core D59)

Route `/app/<h>/welcome` (`src/app/app/[store]/welcome/**`, core §K.2 P2), full screen (no sidebar), owner only (others
are redirected to the dashboard). `/app/<h>` redirects here while `onboarding.step ∉ {done, skipped}` and the viewer is
an owner. `/app/new` (another store) is the store step of `/signup` on its own, then the same route.

**The critical path has no model on it (PD59, core D59, RF §4).** The three directions are ranked by
`rankDirections()` (`src/lib/generator/directions.ts:375`) from the owner's category tap, the photo palette
extracted in the browser and the keywords of the typed name and fact; the copy is the hand-written library when
Cloud AI is off. SigLIP classification and the local VLM run **after** the reveal and only refine (a quiet "refining
the suggestions" chip on the details step, never a spinner that blocks); when Cloud AI is on, `analyze` runs on the
server with ≤ 2 downsized images (AI-04) under the pattern A deadline and its result replaces the suggestions in
place. The "Download local AI" consent card (AI-03) never shows on a connection that reports `saveData` or a cellular
`effectiveType`, and never inside onboarding.

| Step | Screen | Data and calls | Budget (RF §4 clock, p75, 390 px, 4G, Cloud AI off) |
|---|---|---|---|
| `photos` | A large drop zone "Drop 1 to 5 product photos" (click to pick, camera capture on phones), thumbnails appear as each upload finishes, "Start without photos" link | uploads through `POST /api/app/<h>/media` (pending cap `signup.pendingMediaMiBBeforeSubmit`, PD68, so 5 × 2 MB phone photos fit); palette extracted in the browser; **(rev 3, PD74, UX-39)** P6's model-free alpha estimate `estimateAlpha(bitmap)` (design.md DES-§4.11, pure, browser: edge flood-fill with tolerance on the 32 × 32 facts pass, confirmed at 1024 px, < 150 ms per photo) runs on each photo and sets `PhotoFacts.hasCutout = "estimated"` when the background is uniform, so stage / specimen / dark-base directions are eligible at the reveal with a `plinth` / `contact` preset; the real background cutout (BiRefNet, AI-21) is queued by the existing pipeline and, when its mask lands, P8's `render_jobs` reason `cutout` (PLA-§Q.3) upgrades the chosen page's hero in place | 3 × ≈ 600 KB ≤ 8 s; palette + alpha estimate ≤ 0.5 s (0:25 → 0:35) |
| `details` (shown while the uploads finish) | category chips with the suggested one highlighted (a tap is required, PD23), product name with "Use suggestion" (never auto-filled), **price** (required, numeric keypad, currency suffix), compare-at price (optional, hint `onboarding.compare_hint` "Only a price you really sold at before"), one optional fact; the store name and handle with the live address preview when the owner came from `/app/new` | `rankDirections()` input assembled client-side; P7 `useAiTask("analyze", …)` runs in the background and updates the suggestions; suggested facts are unticked chips | typing is never blocked; availability check ≤ 300 ms per keystroke (debounced) |
| `reveal` | **Three real folds (rev 3, PD73, UX-20).** Mobile (390 px): direction 1 renders as the real page **edge-to-edge** (the live fold at 100 %, no device bezel, no scaled screenshot); the three folds sit in a horizontal **snap carousel** with an 8 % peek of the next fold so all three are seen to exist; a swipe or the dots (with labels) move between them; the DNA chips, the why line and the novelty words live in a **bottom sheet** pulled up from a 56 px handle; "Use this design" is **sticky** at the bottom with "Show 3 more" beside it. Desktop (≥ 1024 px): the three folds **side by side at equal width** (≤ 440 px each, real page rendering, scrollable inside each frame), hover or focus expands one to a full-height scrollable preview (the other two shrink to 25 %), the DNA card under each; "Use this design" under the focused one. Each direction carries its novelty certificate (verdict bands, SF-02). Motion: the folds enter with the 420 ms quint-out scale 0.96 → 1 and an 80 ms stagger; reduced motion: a 180 ms crossfade. Every swipe has a tap alternative (dots, arrow keys) | P6's reveal component `RevealFolds` (`src/components/generate/reveal/**`, P6) and generator (design.md DES-§14.3 follows this layout, PLA-§Q.3); **rev 5 (CRIT2-6): P2 merges second and mounts the core §K.2 P0 stub of `RevealFolds` (props `directions`, `state`, `dnaSlot`, `actionSlot`, `onUse`, `onRetry`), so this row's measurements are proven at the R1 integration once P6's body exists**; **rev 6 P0b review F-8:** the directions come from P6's `buildRevealDirections(input): Promise<RevealDirections>` (never built by P2), `directions` is `null` while it is pending (`analysing`) and when it rejected (`error`, with Retry), and a direction's `card` may be `null` (no DNA chips, never an invented card; DES-§14.3); each fold is a sandboxed iframe of the draft render at the real viewport width; `reportRevealAction` records `revealMs` | generation ≤ 1.5 s client-side **[measure]**, three preview renders ≤ 1 s server in parallel (reveal at 0:50); pairwise `d ≥ 0.25`, no orange, Design check green; the three folds are visible together at 390 px (screenshot) |
| `contact` | "Where should customers reach you?": WhatsApp number (toggle "Use my phone +212 6•• ••• •34"), delivery fee left empty with `onboarding.fee_note` ("Add delivery fees in Checkout & delivery when you know them") | `updateStoreSetting(scope, "store", { whatsapp })` | — |
| `done` | the dashboard (PLA-§22.17) with the In-review card (§22.7), the **Store Health ring** (PLA-§22.16; the setup group shows what is missing, e.g. "delivery zones empty" as an issue, not a blocker) and the **address card** (PD61) with Copy, QR, WhatsApp share, "Open a test order" and "Create a campaign" (the last two from P3; "Open a test order" is disabled with "after publishing" while no page is live) | `getStoreHealth(scope)`, the address card | first dashboard paint ≤ 1 s after `contact` |

**Mode-aware path (PD60; rev 3, OPS-14).** In R1 the mode cards select `landing` (PD30). From R2 the same steps run
in every mode and what the reveal **produces** follows the mode, so a seller is never shown a page the mode then hides
(core §A.2: landing pages are hidden by default in `store` mode):

| Mode | What the three directions are | `useDirectionAction` creates | `onboarding` | Visible afterwards |
|---|---|---|---|---|
| `landing` (R1) | three landing pages for the product | the landing page draft (GEN-02) | `firstKind = "landing"`, `pageId` | Pages list, builder |
| `both` (R2) | three landing pages for the product (the campaign page is the mode's point) | the landing page draft **and** the first product (S1 `createProduct` from the typed facts, draft status) with the page attached to it (STO-§17) | `firstKind = "landing"`, `pageId`, `productId` | Pages list, Catalog |
| `store` (R2) | three **product pages**: `productAsPageDoc(product, { …sctx, direction })` (storefront.md STO-§12.2, synchronous, no job) rendered through the PDP family the direction's genome selects (STO-§12.8) | the first product (S1 `createProduct`, draft) and the store theme draft from the chosen direction (`setThemeDraft`, S1); **no landing page** is created and `landing.inStoreMode` stays `false` | `firstKind = "product"`, `productId`, `pageId = null` | Catalog (the product), Theme panel (the draft) |

In `store` and `both` the store blueprint is queued in parallel as a detached job (`enqueueAiJob(scope,
"store_blueprint", …)`, core §H.12 pattern B, S1/S7) and the `done` screen shows the job chip "Building your store
home · ready in a few minutes" fed by `pulse.jobs`; when `pulse.jobs.done` names it, the address card gains the store
home URL and the dashboard shows "Your store home is ready" with Preview. The `done` step's saved-line reads per mode:
`onboarding.reveal.saved` (landing / both: "Your page is saved as a draft…") or `onboarding.reveal.saved_product`
(store: "Your first product and its page are saved as drafts; your store home is being built. Publishing unlocks after
approval."). The owner never waits on a model for the first result in any mode, and the budget above holds for every
mode (the PDP render is the same server render as a landing preview, ≤ 1 s for three in parallel). UX-01 acceptance
gains the case: in `store` mode nothing with `kind = 'landing'` exists after onboarding, the Catalog lists the product
and `/s/<h>/<slug>` of no landing is ever served as the store's 404. **(rev 4, core §A.2 rev 3 / LAN R5 A\*)** The
fallback is fixed too: if any path does create a landing page for a `store`-mode shop (a revision-3 draft resumed
after the mode switch opened, a later entry point), `useDirectionAction` sets `landing.inStoreMode = true` in the same
transaction (audit `store.landing_settings.updated`, reason `onboarding`) and the `done` step reads
`onboarding.reveal.saved_sales_page`; UX-01 acceptance carries this second case (seeded through the resume path).
In `store` and `both` the category tap of the `details` step is required before the reveal (it writes
`stores.category` through `saveOnboardingDetailsAction`, and `useDirectionAction` answers `category_required` when it
is still null), because those modes need `stores.category` for the store-level niche key (core §A.2 rev 3,
ENGP-25); in `landing` the tap stays required by PD23 anyway.

Server actions (`src/app/app/[store]/welcome/actions.ts`, all `storeAction`):

| Action | Permission | Effect |
|---|---|---|
| `saveOnboardingDetailsAction({ category, productName, priceMinor, compareAtMinor?, fact?, assetIds })` | `pages.write` | writes `onboarding.draft` (schema below), `stores.category` |
| `useDirectionAction({ directionKey })` | `pages.write` + `ai.use` (store / both: also `catalog.write`) | landing / both: calls the existing create-from-directions path (GEN-02, `CreateFromDirectionsInput`, store-free input) with the typed price → `onboarding.pageId`; both: also S1 `createProduct` + attach → `onboarding.productId`; store (R2): S1 `createProduct(ctx, { facts })` + `setThemeDraft(ctx, direction)` (rev 5, CRIT2-14: the `WriteCtx` signatures of core §A.2 / §K.4) → `onboarding.productId`, `firstKind = "product"`, no page (PD60 rev 3); every path runs `checkBrandTerms` on the store name when the owner typed one on `/app/new` (PD70); step `contact` |
| `reportRevealAction({ paintedAt })` | `store.read` | sets `revealedAt` (clamped to server now) and `revealMs = revealedAt − stores.created_at` once |
| `saveOnboardingContactAction({ whatsapp \| useSignupPhone })` | `settings.write` | store contacts; step `done`, `completedAt` |
| `skipOnboardingAction()` | `store.read` | step `skipped` (the Store Health ring keeps P3's `landing:no_live_page` issue with its fix "Create your first page", PLA-§22.16; rev 4: revision 3 named the withdrawn `shell:no_published_page`) |

The `onboarding` store setting (PLA-§2.4, PLA-§Q.7) keeps `step` and `draft`, so a closed tab resumes on the same step
with the same photos and the typed price.

Honesty (PD23, owner rule 4): the page is generated only after a price is typed; compare-at appears only when typed and
higher than the price; no stock, rating, review, "sold" counter or countdown is ever generated here; AI suggestions
need a tap. The reveal ends with "Your page is saved as a draft. Publishing unlocks after approval." and the actions
"Submit for review" (§22.7) and "Open in the builder".

Acceptance (UX-01, rev 2): on the `qa:wow-demo` run (390 px, 4G throttling, Cloud AI off, **empty local model cache**,
human typing at 150 ms per character) the reveal paints at ≤ 0:50 from the invite link and the three directions have
pairwise `d ≥ 0.25`; with 3 photos on a mid laptop (4× CPU throttle, Cloud AI off, empty model cache) the reveal
paints ≤ 90 s after the signup click (Playwright, `revealMs` asserted) and ≤ 15 s after "Start without photos"; no
network request for a model file happens before the reveal (asserted on the request log); no price appears that the
owner did not type (state test); 360 px and ar RTL screenshots pass the design checklist; reloading on any step
resumes there; the flow works for a pending store and never calls publish; the `done` screen renders the ring with
the setup issues and the address card with "Open a test order" disabled until a page is live. **(rev 3)** At 390 px
the three folds are visible together in the reveal screenshot and direction 1 is rendered at the real viewport width
(no bezel, PD73); with the argan and parfum fixtures at least one of the three directions at 0:50 is stage, specimen
or dark (PD74, asserted in `qa:wow-demo`); no model file is requested before the reveal even with the alpha estimate
on (it is pure browser code); in `store` mode (R2, `test:e2e` only; rev 5, CRIT2-19: rev 4 wrote the non-existent `qa:e2e`) onboarding ends with one draft product, a theme
draft, no landing page and `onboarding.firstKind = "product"` (OPS-14).

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
| `changeMemberRoleAction({ userId, role })` | `members.manage` (rank rule); **↑ when the new role is `admin` or `owner`** (rev 4, PD80, core §B.7 tenant step-up ladder: TOTP, or the password when the actor has no TOTP; `meta.stepUp` names the method) | — |
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
- **Delete my account** (`/app/account/danger`, rev 4, PD81, core §F.9 rev 3 / SEC-20; P2, R1): shown in full only when
  the user owns no store (`store_members.role = 'owner'` on a store that is not `purged`); otherwise the page lists those
  stores with "Close the store first" links to each Danger zone and nothing else. The flow: what is deleted and what is
  kept (in plain words: your name, e-mail, phone and devices are removed; the record that you accepted the terms and the
  shops' activity logs keep an anonymous id), the step-up sheet (TOTP, or the password when the user has none, PD80),
  the typed word `delete` (localised: `supprimer`, `حذف`), then `deleteMyAccountAction()` (`userAction`) → T2's
  `deleteUserAccount(ctx)` → every session revoked and a redirect to `/login?deleted=1` with the generic line
  `auth.account.deleted` ("Your account was deleted."). A staff member (`platform_role ≠ none`) sees "Ask another
  super admin to remove your staff role first". Audit `auth.account.deleted` (core). Retention for legal reasons is
  `[unverified]` (core §F.9) and the page states only what the code does.

### PLA-§22.6 Notification centre (PL-13 tenant side)

- **Bell** in the topbar with the unread count (`9+` above nine), from the pulse. The panel (380 px popover, a full
  sheet below 768 px): rows grouped by day, each with the group icon, title, body (one line, ellipsis), relative time,
  a 3 px accent bar at the inline start while unread (functional, not decorative), click → link + mark read; "Mark all
  read"; "All notifications" → `/app/<h>/notifications` (filters by group: Orders · Team · Store · Plan · Integrations
  · Security · Platform; keyset paging). Empty: `shell.notifications.empty` ("Nothing new. Orders, team changes and
  review updates appear here.").
- **Pulse** `GET /api/app/<h>/pulse` (`src/app/api/app/[store]/pulse/route.ts`, `storeGuard(req, h, "store.read")`;
  core D57 / SF-06, PD63), every 15 s while visible, **one poller per browser and store**
  (`BroadcastChannel("sg-pulse:<storeId>")`: the tab that holds the channel lock polls and posts the body, the others
  listen; a tab that hears nothing for 40 s elects itself; browsers without the channel poll independently), `ETag` =
  sha256 of the body → `304` when unchanged (PD38), store-level parts cached 5 s per store (`pulse` scopedCache, core
  §E.6) with the per-user parts (`unread`, `impersonation`, `reaccept`, `jobs`) computed fresh and never cached across
  users, bucket `s:<sid>:pulse:<userId>` 12/min (core §E.8):

```ts
// src/lib/pulse/types.ts (maintainer, frozen at P0; core §I.4)
export interface StorePulse {
  v: 1; at: string; build: string;
  unread: number;
  store: { status: StoreStatus; statusReason: string | null; review: "none" | "pending" | "submitted" | "needs_info" | "approved" | "rejected" };
  kill: KillKey[];                          // active kill switches that affect tenants
  impersonation: { endsAt: string } | null; // the viewer's own impersonation of this store (drives the ribbon countdown, PD56)
  reaccept: boolean;                        // legal re-acceptance pending for the viewer
  health: { score: number; attention: 0 | 1 | 2 | 3; computedAt: string } | null;   // the ring's freshness dot and number (PLA-§22.16); null = not computed yet
  jobs: { running: number; done: string[] };          // the viewer's ai_jobs finished since the last poll (core §H.12): the job chip (PLA-§22.8)
  counts: Record<string, number>;           // contributed by tracks (P4: newOrders, dueCallbacks, queueNow, syncFailed; P3: leadsDue)
}
// src/lib/pulse/contributors/<track>.ts: contribute(scope, viewer: { userId; role }): Promise<Record<string, number>>, 50 ms budget each; a failure omits its keys
// src/lib/pulse/contributors/shell.ts (P2): { membersPendingInvites, notificationsUnreadStore } — the shell's own counters
```

`usePulse()` (P2, `src/components/admin/shell/use-pulse.ts`) exposes the last body and `ageMs`; a change of
`store.status` or `review` triggers `router.refresh()` so locked controls unlock without a reload (PL-02 acceptance,
PD65); a change of `build` shows "New version available · Reload"; a change of `health.computedAt` turns the ring's
freshness dot back to neutral and refreshes the issue list; `jobs.done` fires the job chip (PLA-§22.8). Polling
pauses while `document.visibilityState !== "visible"` and resumes with an immediate poll on return.

#### PLA-§22.6.4 Realtime (UX-06, R2, S6)

Arrivals slide in once, numbers roll once, the "live" dot shows "live · 12 s ago" only while the last poll succeeded
less than 30 s ago (design.md UX-06 row).

### PLA-§22.7 Pending state: the In-review card (PL-02)

**Rev 6 P0b (frozen exports; P0b review F-9, so a track finds them in its part):** the card reads `getReviewCard(scope): Promise<ReviewCard>` and the plan page `listStoreRequests(scope):
Promise<StoreRequestRow[]>` (`src/lib/platform/requests.ts`, CCR P1-6 / P2-5; real reads through `whereStore`;
`StoreRequestRow = { id, kind, status, createdAt, outcome: "granted" | "declined" | null }`, P0b review F-15; the
writes `createStoreRequest`, `withdrawStoreRequest`, `submitForReview`, `answerReviewQuestion`, `submitAppeal` throw
until P1; asserted in `src/lib/contracts/r1-p0b-platform.ts`).

On the dashboard of a `pending` store (and in a compact form on Pages and Generate):
- **Before submitting**: title `shell.review.title` ("Your store is in review"), "Works now": build pages, preview,
  upload up to **20 MB until you submit, 100 MB after** (rev 4: `shell.review.works_now` with `{mediaMb}` from
  `applyStateCap("pending", { submitted })`, PD68; revision 3's "up to 100 MB" here contradicted PLA-§3.6 and is
  withdrawn), invite one teammate; "Unlocks after approval": publishing, orders, Sheets, pixels, Telegram, PHP
  export, address change. Primary **Submit for review** → a sheet with optional business context (what you sell ≤ 200;
  a social or shop link ≤ 200, kept as plain text; a WhatsApp number prefilled from the signup phone) →
  `submitForReviewAction` (owner; `store.read`; writes only `signup_reviews.business_context` and `submitted_at`) →
  staff notification `staff.signup_new`. Secondary **Share a private preview** → a 72 h `/preview/<token>` link
  (PLA-§Q.6) with Copy and WhatsApp share. **(rev 4, core §E.2 rev 3 / SEC-7)** The link is store-bound and revocable:
  `mintPreviewLinkAction` keeps the returned `tokenId`, the card lists the active links (created, expires) with
  **Revoke** → `revokePreviewLinkAction({ tokenId })` (`storeAction("pages.read")`, T3's `revokePreviewToken(scope,
  tokenId)`, audit `store.preview_link.revoked`); a revoked link answers the neutral 404 at once.
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
| `step_up` | the step-up sheet (rev 4, PD80, core §B.7 ladder: **every** tenant, TOTP when enrolled, else the password; for `store.export`, `orders.export`, `store.close`, secret writes under `integrations.manage` and role changes to `admin` / `owner`); the original action re-runs with the same `opId` after success |
| `quota_platform_pending` (rev 4, D69 / ai.md) | the limit sheet, quota variant, with `shell.limit.reason.pending_ai` ("Store Gen's AI budget for stores in review is used up for now. Your store gets its own budget once it is approved; the hand-written suggestions keep working.") and no "Ask for more" button |
| `rate_limited` | toast `shell.err.rate_limited` ("Too many tries. Wait a minute.") |
| `busy` | toast `shell.err.busy` ("The AI is busy right now. Try again in a few seconds." for AI calls; `auth.busy` for the scrypt semaphore) |
| `design_blocked` · `honesty_blocked` · `budget_blocked` (rev 2; core D51, §M) | **never a toast**: the publish dialog (P3's `src/components/admin/pages/publish-dialog.tsx`) renders `items: GateItem[]` one row per item with its title, the measured value and one fix (a deep link into the builder tab or section, or an action); P2's error mapping only routes the code to the dialog and keeps the dialog open |
| `job_queued` (rev 2; core D56, §H.12) | the **job chip** (`JobChip`, PLA-§22.12) in the topbar: "Working in the background · <kind>" with a quiet progress ring fed by `pulse.jobs`; when `pulse.jobs.done` names the job the chip becomes "Ready · Open" for 60 s and a notification `ai.job_done` (P7's kind) lands in the bell; the originating screen receives the result through the job's `GET /api/app/<h>/ai/jobs/<id>` (P7) |
| `status_changed` (console) · `cooldown_handle_required` (console, PD54) | the lifecycle sheet reloads its preview / asks for the typed handle |
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
everywhere; confirm sheet), store id (Copy), created. **Mode** (owner, `store.mode`): the three `ModeCards` of
§22.1.5 with their `modeSummary` lines and bullets (PD72) and the same R1 rule (PD30); from R2 a switch shows the
"hide, never delete" sheet listing what is hidden and what appears (`modeAllows`, core §A.2; the sheet reuses the same
`modeSummary` bullets as "what appears" and "what is hidden") → `setStoreModeAction`. **(rev 4, core §A.2 rev 3)** The
sheet first calls P3's `landingModeSwitchPlan(scope)` and shows its plan ("3 live sales pages, 1,240 views in 7 days
keep working: 'Also use sales pages' stays on" with the tick the owner may clear, so ad traffic never hits a 404);
switching to `store` or `both` needs `stores.category` (the sheet shows the category chips inline when it is empty and
`setStoreModeAction` answers `category_required` otherwise, ENGP-25); the switch then runs `ensureTemplateSet` through
the core. Actions `saveGeneralAction` (`settings.write`): **(rev 3, PD70; rev 4 signature)** it calls
`checkBrandTerms("store_name", value)`, `checkBrandTerms("legal_name", value)` and `checkBrandTerms("whatsapp_name",
value)` (the core's frozen one-field form, PLA-§13.3) before writing and answers `brand_protected` on an `"exact"`
(the limit sheet explains; nothing is written); a `"near"` saves and flags the store for staff. **No opening
hours live on this page (rev 3, OPS-11):** the one source of every hours promise (the thank-you "we call you today
from {from}", `confirm_hours`, the tracking help, the contact page) is the call-centre window `ops.callingWindow`
edited at `/team/callcenter` (operations.md) and exposed through the P0 stub `callingWindowFor(scope)`; General links
to it ("Calling hours are set in Call center") and P2 builds no hours field here or in Settings → Market.

#### PLA-§22.10.2 Address (`settings/address`) and the live address card (UX-05, **R1**, PD61; core §I.4)

**Rev 6 P0b (frozen exports; P0b review F-9, so a track finds them in its part):** the card's two P3 slots are `TestOrderSlot(p: { pageId: string | null; live: boolean })` and `CampaignSlot()`
(`src/components/admin/landing/address-slots.tsx`, CCR P2-9; both `ReactElement | null`, render nothing until P3's
merge; asserted in `src/lib/contracts/r1-p0b-design.ts`).

**The address card** (`src/components/admin/common/address-card.tsx`, P2; props below) is one component used in
three places: the pages list header (P3 mounts it), the dashboard after the first publish (PLA-§22.17) and the
onboarding `done` step (PLA-§22.2). Content, top to bottom: the canonical URL (`storeUrl`) in a `<bdi dir="ltr">`
with **Copy** and **Open**; the live state line (`shell.address.live` "Live" · `shell.address.not_live` "Not live
yet: publish a page" · `shell.address.hidden` "Hidden while in review"); a **QR** (`QrCode`, PD47, encodes the
canonical URL, 160 px, downloadable as SVG); **Share on WhatsApp** (`WhatsAppShareButton` with
`shell.address.wa_text` = "{store}: {url}"); and two slots filled by P3: `testOrder` ("Open a test order", mints a D54
token through `mintTestLink(scope, pageId)` for the home page or the chosen page; disabled with `shell.address.after_publish`
while nothing is live) and `campaign` ("Create a campaign", hidden without `campaigns.write` or in `store` mode
without "also use landing pages"). In P mode the line "Your address becomes <handle>.<your Store Gen domain> when
Store Gen moves to its own domain" (only when `STORE_ROOT_DOMAIN` is unset; no domain name invented).

```ts
export function AddressCard(p: { store: Pick<StoreRow, "id" | "handle" | "name" | "status">; live: boolean; pageId?: string | null;
  slots?: { testOrder?: ReactNode; campaign?: ReactNode }; compact?: boolean }): JSX.Element;
```

**The settings page** shows the same card plus **Rename handle** (`domains.manage`, active stores): input with live
availability, the warning "Old links keep working for 12 months", once per 30 days → `renameHandleAction` (core
`renameHandle`, P2 owns the rename in R1; **rev 4, core §C.7 rev 3 / ENGC-30:** the store #1 conversion's one-time
`freeRename` grant is honoured outside the 30-day rule and the page says so to store #1 while the grant is unused: "Your first rename is free: your
address was set automatically when Store Gen moved to shops"); after a rename the card shows "Re-rendering n pages" from
`renderSummary(scope)` until the address jobs finish. Acceptance (UX-05): the QR decodes to the canonical URL; the
WhatsApp link opens `wa.me` with the store name and URL only; "Open a test order" is absent (not disabled) for a
viewer without `pages.read`; the card renders identically in its three places (one snapshot).

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
status and Withdraw (`withdrawStoreRequestAction`), answered requests with the outcome. **Rev 6 P0b review F-15:** the
outcome is `listStoreRequests`' `outcome: "granted" | "declined" | null` (`approved` → granted, `rejected` → declined,
the words of `resolveRequestAction`'s `grant` / `decline` and of `request.answered`); the staff's note (`reason_note`,
required for a decline) is **internal and never shown to the seller**, exactly like a signup decision (the seller reads
the category sentence only, PLA-§Q.27), so no read of `src/lib/platform/requests.ts` returns it. A seller-facing
answer text would be a new field P1 defines through a CCR. Subscription history
(`store_subscriptions`). Members without `billing.manage` see the page read-only (`billing.read`).

#### PLA-§22.10.5 Market (`settings/market`)

Market and currency (fixed in R1 for MA / MAD with a note), number and date formats preview in the store locale, the
store timezone link to General.

#### PLA-§22.10.6 Audit (`settings/audit`, rev 3, PD75, ENGC-8; `settings.read`)

The store's own activity log, the route core §I.1 lists and the deep-link target of `store.impersonation_started` /
`store.impersonation_ended` (PLA-§18.2) and of `store.export_by_platform`'s "see who downloaded". Data:
`listStoreAudit(ctx, { beforeId, limit, area, actorKind?, from?, to? })` (T1's audit v2 read API over
`audit_store_idx (store_id, id)`, store rows only; **rev 6 P0b (CCR P2-12, core §F.5):** the signature as built,
`listStoreAudit(ctx: StoreCtx, opts: { beforeId?: number; limit?: number; area?: string; actorKind?: "user" |
"platform" | "impersonation" | "system" | "api"; from?: Date; to?: Date })`, with `actorKind`, `from` and `to`
filtered in SQL (`actor_kind =`, `created_at >= from`, `created_at < to`; an unknown `actorKind` answers `[]`) and the
keyset by `beforeId` unchanged, mirroring `listPlatformAudit`; the `(string & {})`-free projection `StoreAuditRow = { id; at;
actorKind: "user" | "platform" | "impersonation" | "system" | "api"; actorLabel: string /* member name, "Store Gen
support (<first name>)", "System", the API key label */; action; sentence: MessageKey; target: { kind; id; label } |
null; metaSummary: string }`). Rows: time (store timezone), actor with a chip per kind (Member · Store Gen · Support
view · System · API; text + icon, never a bare dot), the sentence (`shell.audit.<action>`, falling back to the raw
action in mono), target link (page, order, member, setting), the redacted meta summary (`src/lib/audit.ts` redaction;
never a customer field, never a secret). Filters: actor kind, area (pages, orders, team, settings, integrations,
security, platform), date range; keyset by id, 50 per page (`KeysetPager`); 360 px as two-line rows. Impersonation
sessions and platform reveals are listed with the staff display name (core §F.5), so the seller can see exactly what
support looked at and when; `platform.impersonation.write_refused` rows appear too ("Support tried to save a page;
refused"). Export: none in R1 (the store export ZIP of PLA-§22.11 carries `audit.csv`). Members without
`settings.read` do not see the page in nav (`navFor`). Acceptance: the two notification kinds above land on this page
with the session row in view (`#imp-<id>` anchor); a member of store B opening store A's audit path gets the neutral
404; no row of another store ever appears (attack case §O.3 16).

### PLA-§22.11 Danger zone (`settings/danger`, PL-09, PL-08 owner side)

- **Export your data** (`store.export`, **↑ always**: rev 4, PD80, core §B.7 tenant step-up ladder, TOTP when the user
  has it, else the password; revision 3's "↑ when the user has TOTP" is withdrawn): what is inside (core §F.9 list in
  plain words), "Request export" → P8's job → progress (parts done / total) → the parts list with download links (24 h
  signed, parts deleted after 72 h) and past exports. Allowed in read-only states (the step-up still applies). The
  download route re-checks the session's `store.export` and a fresh step-up (core §F.9), so a link copied out of the
  page is useless without the second factor.
- **Close the store** (owner, `store.close`, **↑ always**, same ladder): what happens (pages go offline, orders stop,
  30 days to reopen, then deletion is scheduled), typed handle → `closeOwnStoreAction`. **Reopen** while closed ≤ 30
  days (no step-up: reopening restores, it never exposes data).
- **Leave this store** (any member but the last owner) → `leaveStoreAction`.
- **Transfer ownership**: disabled "Coming later" (PL-21, R3).

### PLA-§22.12 Shared primitives (`src/components/admin/common/**`, P2, props frozen here, PD1)

```ts
export function StepUpSheet(p: { open: boolean; onVerified(): void; onClose(): void; surface: "console" | "tenant"; method?: "totp" | "password" /* rev 4, PD80: tenant only; default from the viewer (TOTP when enrolled, else password via T2's stepUpWithPasswordAction); the console is always "totp" */ }): JSX.Element;
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
export type LockReason = { kind: "pending" } | { kind: "state"; status: StoreStatus } | { kind: "plan"; key: FeatureKey } | { kind: "kill"; key: KillKey } | { kind: "role" } | { kind: "release"; release: "R2" | "R3" } | { kind: "impersonation" } /* rev 2, PD56 */;

// rev 2 primitives (PD61, PD62, PD63, PD66, PD67; used by P2's dashboard and by P1's console with `surface: "console"`)
export function HealthRing(p: { score: number | null; attention: 0 | 1 | 2 | 3; size: 40 | 56 | 96; computedAt: string | null; dirty?: boolean; surface: "tenant" | "console"; onRecompute?(): Promise<void> }): JSX.Element;   // the number in tabular numerals, a stroke tinted by score band (≥ 80 jade, 50-79 neutral, 30-49 yellow, < 30 crimson), a neutral "computing" state when score is null; never animates beyond one 240 ms draw on load
export function HealthGroups(p: { components: Record<HealthGroup, number>; caps: Record<HealthGroup, number> }): JSX.Element;   // seven hairline bars, label + penalty / cap, no colour beyond the semantic tokens
export function IssueRow(p: { issue: HealthIssue; locale: "ar" | "fr" | "en"; onFix?(fix: HealthFix): void; onSnooze?(): Promise<void>; disabled?: LockReason | null; staffView?: { snoozedBy: StoreRole | null } }): JSX.Element;   // severity as a text label with an icon, the text with its evidence numbers in <bdi>, the fix as one button, "Snooze 7 days" as a quiet secondary action
export function IssueList(p: { issues: HealthIssue[]; max: 5; snoozed: Record<string, string>; emptyKey: MessageKey; children?: (issue: HealthIssue) => ReactNode }): JSX.Element;
export function TodayBrief(p: { lines: { key: MessageKey; vars: Record<string, string | number>; href?: string }[] }): JSX.Element;   // 1-3 template lines, tabular numbers, no model text (PD62)
export function KpiTile(p: { label: string; value: string; delta?: { value: number; period: string }; hint: string; n?: number; spark?: number[] /* rendered only when length ≥ 7 */; kind: "count" | "money" | "rate" | "duration"; emphasis?: boolean }): JSX.Element;   // the typed successor of dashboard/kpi-card.tsx: no aurora/grain, semantic delta tokens, `rate` requires `n`
export function FunnelChart(p: { steps: { id: "orders" | "confirmed" | "shipped" | "delivered" | "collected"; label: string; value: number | null /* null = not available in this release */; rate?: number }[]; period: string }): JSX.Element;   // horizontal stepped bars, delivered in jade, absent steps rendered as a neutral "with delivery tracking (R2)" line, never 0
export function JobChip(p: { running: number; done: { id: string; label: string; href: string }[]; onDismiss(id: string): void }): JSX.Element;   // the background-job indicator fed by pulse.jobs (PLA-§22.8)
export function FreshnessDot(p: { at: string | null; staleAfterMs: number; label: string }): JSX.Element;   // "Updated 2 min ago"; text + dot, the dot carries real state only (PLA-§4.7 rule 8)
```

Every primitive: keyboard reachable, visible focus ring (2 px accent), RTL mirrored, ≥ 44 px targets below 768 px,
reduced-motion safe, a story fixture in `src/app/dev/fixture/**` (dev only) for the screenshot tests, and **no
em-dash, en-dash separator or "Step n" label in any string it renders** (rubric §9.G, core §I.8 rule 8; asserted by
`test:i18n-coverage` over the catalogs and by a DOM scan in the screenshot run). `KpiTile`, `HealthRing` and
`FunnelChart` are the only places the dashboard draws numbers; each refuses the dishonest input at the type level
(`rate` without `n`, a sparkline under 7 points, a funnel step with `0` where the data does not exist).

### PLA-§22.13 Tenant ⌘K (UX-02 tenant; fixes ADM-02)

Rework of `src/components/admin/shell/command-palette*.tsx` (RF §2.9 "Rework": scope, local index, chords, action
registry; today's palette searches the whole database, `command-palette-body.tsx:84`, and hard-codes "Export all
orders (CSV)", `:149-158`):
- **Scope**: the store in the URL; every server query goes through `GET /api/app/<h>/search?q=`
  (`src/app/api/app/[store]/search/route.ts`, `storeGuard(req, h, "store.read")`, core §K.2 P2), which runs the
  **search providers** of core §I.3 (`src/lib/admin-data/search/<track>.ts` exporting `provider: SearchProvider =
  { id; kinds: string[]; search(scope, q, viewer: { userId; role }): Promise<SearchHit[]> }`, ≤ 120 ms budget each,
  imported by P2's `src/lib/admin-data/search.ts`): P4 orders by exact id (agents only their own queue) and by phone
  (`orders.read_all`, results masked) and customers by name prefix (masked phone); P3 pages by name, `WA-` refs and
  leads; P6 pages by design tags; the shell provider settings sections and team members (`members.read`). A provider
  over budget is dropped from that answer (its group shows "slow, try again"), never awaited. Bucket
  `s:<sid>:search:<userId>` 60/min. The old cross-database search and the hard-coded export action are removed.
- **Local index** (≤ 300 entries, shipped with the layout, refreshed on store switch): nav items from `navFor(ctx)`,
  settings sections, team member names (`members.read`), the 20 most recent pages, saved views (P4).
- **Actions** from the command registry (core §I.3; `CommandDef = { id; label: MessageKey; group: "jump" | "create" |
  "run"; permission?; mode?; release?; shortcut?: string; run: (ctx) => void | Promise<void> }`, types in
  `src/components/admin/shell/commands/types.ts`, registry `commands/index.ts`, both maintainer): the shell's
  `commands/shell.ts` (Create page, Invite, Switch store, Notifications, Help, Toggle theme / density, Language,
  **Recompute health**, **Install the app**) plus the tracks' files (P3 Publish, Open a test order, New campaign; P4
  Export orders, Next order; P5 Sync Sheets), filtered by `ctx.can`, mode and release; a `HealthFix` of kind `action`
  runs the command with the same id (PD66).
- **Patterns and chords**: a typed order id (`^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$`, `orders-view.tsx:42`) opens the order
  drawer directly, `>` filters actions, `/` searches, `?` the shortcut sheet; chords `G H` overview, `G O` orders,
  `G Q` queue, `G L` leads, `G C` customers, `G P` pages, `G M` media, `G T` team, `G S` settings, `G N`
  notifications, `G W` switch store; `C` opens Create (page, campaign, product R2, manual order, invite); `N` and
  `1-6` belong to the queue (P4); `E` edit, `Enter` open, `Esc` close, `J/K` move. Chords never fire inside editable
  fields or open overlays (`src/components/builder/shortcuts.ts:16-25` rules, shared through
  `src/components/admin/shell/chords.ts`).
- **Latency**: the palette opens ≤ 50 ms when warm (code-split, prefetched on the first `⌘`/`Ctrl` keydown);
  server results arrive with a 120 ms debounce and skeleton rows that appear after 150 ms and stay ≥ 300 ms.

Acceptance (UX-02 tenant): a member of store B searching store A's order id or a customer phone gets no result (attack
suite); an agent's phone search is refused; results render masked phones only.

### PLA-§22.14 Help sheet

§20.1 (P2 component `src/components/admin/shell/help-sheet.tsx`).

### PLA-§22.15 Legal re-acceptance sheet (PD17)

**Rev 6 P0b (frozen exports; P0b review F-9, so a track finds them in its part):** `pendingReacceptance(userId): Promise<{ docs: LegalDocSummary[] } | null>` and `recordReacceptance(ctx: UserCtx,
documentIds, meta: { ipHash: string | null; uaLabel: string }): Promise<void>` (`src/lib/platform/legal.ts`, P1's,
CCR P2-6; `LegalDocSummary` is the sheet's row; the stub answers `null` (no publisher before P1) and the write throws;
asserted in `src/lib/contracts/r1-p0b-platform.ts`).

When a published platform document with `requiresReacceptance` is effective and the viewer has not accepted that
version (checked at layout render, cached 5 min per session, and through `pulse.reaccept`), a blocking sheet (focus
trapped, no close button) shows the document title, the "What changed" summary, a link to the full text, **I accept**
→ `acceptLegalAction({ documentIds })` (`userAction`, `legal_acceptances.context = 'reaccept'`, IP hash and UA label)
and **Sign out**. Never on public pages, never during an impersonation (the staff member's own acceptance is handled in
the console shell the same way).

### PLA-§22.16 Store Health ring and issue list, tenant side (SF-03 / PL-18; P2; PD6, PD53, PD66, PD67; core §I.7) (rev 2)

**Where.** The dashboard (PLA-§22.17, the first block after the Today brief), a compact ring in the pages list header
next to the address card, and `/app/<h>#health` as the deep-link target of `health.issue_new`. It **replaces** the
setup checklist (`src/components/admin/dashboard/setup-checklist.tsx` and the six static items of
`src/lib/admin-data/dashboard.ts:173-180` are deleted by P2); the review card (PLA-§22.7) stays separate because it is
a state, not a score.

**What.** `getStoreHealth(scope)` (P1, cached 5 min) renders:
1. **The ring** (`HealthRing`, 96 px on the dashboard): the score in tabular numerals, the stroke tinted by band, the
   freshness dot from `computedAt` (rev 4, PD78: neutral when older than `view.staleAfterMin` = `max(staleAlarmMinutes, 1.5 ×
   cycleMin)` from the last job summary, an additive field of `StoreHealthView` (PLA-§2.2, PLA-§Q.4), never a fixed
   hour; the line always reads "Checked at hh:mm"), and **Recompute now**
   (`recomputeHealthAction`, `s:<sid>:health:recompute` 6/h) which marks the row dirty and shows "Recomputing, ready
   within 5 minutes" (`health.recomputing`), never a spinner that waits. When `score` is null (a new store before the
   first run): the ring is neutral with `health.computing` ("Your first health check runs within 5 minutes") and the
   setup group's issues already render from a synchronous local pass over the setup rules only (P2's `rules/shell.ts`
   run client-side on the store facts the layout already has), so the `done` step of onboarding is never empty.
   `platform.health.showScoreToTenantsBelowN > 0` hides the number (not the issues) until the store has that many
   orders, with the line `health.score_later`.
2. **The groups** (`HealthGroups`): seven hairline bars with the penalty per group over its cap, so a seller sees
   where the points went (PD18).
3. **The five issues** (`IssueList`, the first 5 unsnoozed, by points): each `IssueRow` has a severity label with an
   icon (Fix now / Should fix / Suggestion, never a bare dot), the sentence with its evidence numbers ("Sheets is
   22 min behind · n = 14 orders waiting"), **one fix** (a link built with `appHref`, or a registered command, PD66;
   the fix is hidden, not disabled, when the viewer lacks the command's permission, except during impersonation where
   it renders disabled), and **Snooze 7 days** (`snoozeHealthIssueAction`, `health.snooze`: owner and admin only;
   others see no snooze). A snoozed issue leaves the list and reappears after 7 days or when the job sees it again
   with higher severity; "n snoozed" opens the snoozed list with "Unsnooze".
4. **Empty state**: `health.all_good` (rev 4 text: "Nothing to fix right now. Checked at {time}; it checks again
   after every change you make." The revision-3 promise "within an hour" is withdrawn because it does not hold past
   ≈ 120 active stores, PD78; "after every change" holds because each settings, publish and integration write marks
   the store dirty and dirty stores are checked first) as the quiet `EmptyState` variant; the *celebration* variant is used once, when a store first reaches 90 or more with no
   severity-3 issue (localStorage marker, per viewer). **(rev 3, UX-38, PD64)** The celebration is a **typographic
   moment**, not a colour wash: the score as one large tabular number (56 px on the dashboard), one accent hairline
   (2 px, the tenant accent) drawn under it over 240 ms ease-out, the sentence `health.celebrate` ("Your store is in
   great shape."), and nothing else; no aurora, no grain, no gradient, no confetti. The same variant is the only
   celebration anywhere in the admin (first store, first order on the dashboard brief, first publish on the address
   card) and `EmptyState` exposes it as `variant="celebration"` with the props `{ number: string; label: string }`.

**Honesty.** Every number shown is the store's own and carries its window and `n`; an operations rule below `minN`
is not shown as a green tick either (nothing claims health it cannot measure); no platform median appears before R3.
The ring never shows a trend arrow without ≥ 7 daily points (R3 `store_daily_rollup.score`); in R1 it shows the
score and its freshness only.

**Pending stores** see the ring with the setup and trust groups only (the others say "after approval", `LockedControl`
reason `pending`); `restricted` stores see the restriction banner above the ring and the operations issues stay
visible (they explain the restriction more often than not); `suspended` / `closed` stores see the last snapshot
read-only with no fixes.

Acceptance (SF-03 tenant side): the ring and the console ring render the same score from one row (`qa:wow-demo`
2:50: "health ring shows the zones issue with a one-tap fix" and the console strip shows the same issue); a fix of
kind `action` runs exactly the registered command (spy test); a fix of kind `link` lands on the named screen with the
section in view; snoozing writes `store_health.snoozed[issueId]` and `store.health.snoozed`, removes the issue from
the list and its points from the score within one pulse, and the console strip shows "snoozed by owner until
<date>"; an agent sees the ring and the issues but no snooze and no fixes beyond their permissions; the setup issues
render on the onboarding `done` step before the first job run; the dashboard renders with `getStoreHealth` throwing
(the ring shows its own error state, the rest of the dashboard is unaffected).

### PLA-§22.17 The dashboard (`/app/<h>`, RF §2.10 screen 2; P2; PD62) (rev 2)

`src/components/admin/dashboard/dashboard-view.tsx` is **redesigned** (RF §2.9), `dashboard.ts` is rewritten around the
P0 read APIs. Order on the page (one column at 360 px; a 12-column grid ≥ 1024 px with the ring in a 4-column rail):

1. **Today brief** (`TodayBrief`, SF-11 R1 slice): one to three template lines from real counts, in the viewer's
   locale, never a model text in R1. Line 1 from P4's `opsPulse(scope)` and `orderKpis`: "1 order confirmed today ·
   2 callbacks due" (`brief.orders`); line 2 the worst open health issue's sentence with its fix link (`brief.health`);
   line 3 one opportunity when the data supports it with `n ≥ 30` ("Pack 2 delivered 71 % vs 58 % for pack 1 (n = 43)",
   `brief.opportunity`, R2 when delivered states exist; in R1 the line is "n orders waiting in the queue" or absent).
   Zero data: `brief.empty` ("No orders yet. Publish a page to start."). Each line links to its screen.
2. **In-review card** (PLA-§22.7) while the store is `pending`; the state banners (PLA-§22.8) sit above everything.
3. **Store Health ring + issues** (PLA-§22.16) in the rail; on 360 px it comes right after the brief.
4. **COD KPI tiles** (`KpiTile`; range 7 d / 28 d in the store timezone, test orders excluded): *Orders placed*
   (count, delta), *Confirmed* (count + confirmation rate with `n`; "needs 30 orders" below the sample), *Delivered,
   28 d* (R2; R1 shows the honest "with delivery tracking (R2)" hint and no number), *First touch p50* (P4, minutes,
   "needs 30 orders" below `minN`), *Placed · 7 days* (money, hint "placed, not delivered"; the successor of "Revenue ·
   7 days", `dashboard-view.tsx:99-105`), *Cash to collect* (R2). Placed, confirmed and delivered never share a tile
   (core §I.8 rule 3); sparklines only with ≥ 7 daily points; delta chips use the semantic tokens; no aurora or grain
   on the emphasis tile (D60).
5. **The COD funnel** (`FunnelChart`): orders → confirmed → shipped → delivered → cash collected for the selected
   range as horizontal stepped bars with absolute counts and step rates; in R1 the first two steps have data, the
   rest render as the neutral "with delivery tracking (R2)" line (never a zero bar); delivered in jade when it
   arrives. Below 5 data points the chart is a table (core §I.6).
6. **Work lists** (P4 components mounted here): orders to call now, due callbacks, failed sync, the newest leads
   (P3), each ≤ 5 rows with "See all" into the saved view.
7. **Address card** (PD61) after the first publish, until the viewer dismisses it (localStorage, per viewer; it stays
   on the pages list).
8. **Integration tiles** in the `sheet-health.tsx` pattern (kept, RF §2.9) for Sheets, pixels and Telegram from P5's
   `integrationHealth(scope)`.

Rules: every block is its own `<Suspense>` + `<PanelBoundary>`; the first paint needs only the layout's data (store
row, memberships, pulse) and streams the rest; nothing on the dashboard is a model text in R1; the page passes the
eight rules of PLA-§22.18. Acceptance: the Playwright run at 390 px shows the brief, the ring and the first tile
within 1.5 s on 4G with a warm shell; "Revenue" appears nowhere in `src/components/admin/dashboard/**` (grep in
`test:platform`); the `qa:wow-demo` step at 2:50 reads "1 order confirmed today" with the test order counted in the
queue line and excluded from every money tile.

### PLA-§22.18 The admin UX ceiling as acceptance for every P2 screen (core §I.8; RF §2.1; PD64) (rev 2)

Each P2 screen (auth pages, onboarding, picker and switcher, dashboard, team and invites, account (incl. the rev 4
danger page and the step-up sheet's password variant), notifications,
settings general / market / plan / address / security / danger, the limit sheet, the help sheet, the legal sheet)
ships with this checklist filled in its PR description; the four scripts and the e2e run enforce the measurable rows.

| # | Rule | Measured by | Pass condition |
|---|---|---|---|
| 1 | Instant | `qa:admin-perf` step of PLA-§O.4 (Playwright, warm shell, 20 navigations) | p75 route change < 150 ms perceived (skeleton or content painted); writes optimistic with rollback or Undo, server round trip < 500 ms p75 on the `--perf` DB; skeleton delay 150-300 ms, minimum 300 ms (checked in `src/components/admin/common/skeleton.tsx`) |
| 2 | Keyboard everywhere | keyboard crawl in PLA-§O.4 step 6 | every control reachable; chords of PLA-§22.13; `?` lists them |
| 3 | Honest data | `test:platform` prop selftests on `KpiTile`, `FunnelChart`, `HealthRing` | no rate without `n`; no sparkline < 7 points; no 0 where data does not exist |
| 4 | One accent, one glass, no bounce | `test:admin-tokens`, `test:admin-motion` | tenant jade only; the topbar is the one frosted surface; no `type: "spring"`, no overshoot bezier, no duration > 400 ms outside the builder; **no aurora and no grain anywhere (rev 3, UX-38)**: the `adm-aurora` / `adm-grain` classes and their CSS are deleted, `test:admin-tokens` greps `src/components/**`, `src/app/**` and the generated admin CSS for both names and for `radial-gradient(` stacks of ≥ 3 layers on a `::before` / `::after` and fails on any hit; the celebration variant is typographic (PLA-§22.16 item 4) |
| 5 | Dense but breathing | screenshot review at 1280 / 360 | `[data-density]` honoured; tabular numerals in every number column; ≤ 2 lines per cell |
| 6 | Phone-first | screenshots at 360 px, touch-target scan | ≥ 44 px targets; drawers become sheets; tables become two-line rows; **(rev 3, UX-37)** form inputs 52-56 px tall with 16 px text (no iOS focus zoom), 12 px field gap, error summary scrolled into view, the primary action reachable with the keyboard closed on 390 × 844 |
| 7 | RTL-perfect by construction | `test:admin-rtl`, ar screenshots | logical properties only; mirrored icon allow-list; `<bdi dir="ltr">` on phones, ids, URLs, e-mails; DB RTL1 (no reversed ranges) and RTL5 (addresses and e-mails `dir="ltr"`) on every admin string with a number or an address |
| 8 | No AI tells | `test:i18n-coverage` catalog rules, DOM scan in the screenshot run | no em-dash or en-dash separator, no "Step 1/2/3", label above input, no placeholder-as-label, status as text + icon, one CTA label per intent, skeletons not spinners, empty states quiet with a real-UI skeleton |

Owner rules win over the rubric where they meet (no orange anywhere; Arabic type rules from design.md); the rubric's
hero and marketing rules do not apply to the admin.

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

Store side (`settings/security`, owner, `support.grant` ↑ through the tenant step-up ladder, PD80 rev 4; revision 3 wrote "↑ when TOTP"): "Allow Store Gen support to edit for 24 h /
72 h", scope chips from `SUPPORT_GRANT_AREAS` (pages, media, basic settings, catalog; never team, security,
integrations, billing, payouts, export), optional note; active grants with Revoke; every use listed in Activity.
Console side: an impersonation started while a valid grant covers the store offers "Start with edit access (granted
by the owner until <date>)"; writes then pass the seam only for the granted areas (core §B.8 note, `support_grants`).
**Break-glass write** without a grant: super_admin only, ↑, reason `legal_request | security_incident |
data_corruption`, crimson ribbon (hue 17) "Emergency edit access", an immediate store notification, 15 minutes
maximum, listed in the break-glass log. Acceptance: a write outside the granted areas is refused and audited.

### PLA-§24.2 Abuse reports and takedowns (PL-20; **R1 report slice (rev 3, PD70, SEC-18)**, triage R3)

**R1 (P1):** a "Report this store" link (the wording of `shell.report.link` in ar / fr / en; rendered by P6's landing
footer section and P3's legal / policy pages from the renderer context's `links.report` (`PageLinks.report`, core §C.6 / D76; rev 5, CRIT2-14: rev 4's `reportHref` is withdrawn), and by S1's store chrome in R2,
PD83, PLA-§Q.4) → `/report/<handle>` on the **platform host only**: the link is the absolute `reportUrl(store, path)` =
`platformOrigin() + "/report/<handle>?p=<path>"` (core §B.1 / §C.6) and **store hosts answer the neutral 404 for
`/report/*`** like `/kit/*` (rev 4, core §Q.8 PLA Q3.4 A\*: not a 308; revision 3's "store hosts 308 to it" is
withdrawn), legacy hosts 308 to the platform host (core §C.4 route table); `src/app/(public)/report/[handle]/**`, area
`auth`: nonce CSP, `noindex`, **`Referrer-Policy: same-origin`** (rev 4, core §B.1 rev 3: the form posts a Server
Action before hydration), `private, no-store`. The page: the store name and handle (resolved through
`resolveStoreByHandle`; an unknown or `purged` handle renders the same form and discards the post, so the page is no
handle oracle), reason (`phishing`, `scam`, `counterfeit`, `prohibited`, `impersonation`, `other`), details (≤ 2,000,
plain text), the page path the reporter came from (prefilled from `?p=`, same host only, query stripped), an optional
contact (e-mail or phone, sealed with the platform envelope purpose `abuse:contact`), Turnstile when configured.
`reportStoreAction` (`publicAction` with Turnstile `when-configured`; buckets **`p:report:ip:<h>` 5/h and
`p:report:store:<h>` 20/day** (rev 4: core §B.1 / §E.8 rev 3; revision 3 wrote 5/day and 50/day), the burst limit of
core §E.8) calls `recordAbuseReport(input)` (`src/lib/platform/abuse-report.ts`, P1): `INSERT` into
`abuse_reports` (`status = 'new'`, `ip_hash`), `markHealthDirty(storeId)` (the `abuse_reports_new` flag, PLA-§6.3.3),
`notify(platform_staff admin, "staff.abuse_report", …)` (deduped per store and day) and the alarm `abuse_reports_spike`
when the thresholds of PLA-§15.2 trip. The reporter sees `report.thanks` ("Thank you. Store Gen will review this
store.") whatever happened (no oracle), and nothing is sent to the store in R1 (a report is a signal to staff, not an
accusation to the seller). The console shows the counts (Needs attention, the Risk strip, the Overview strip 9) and
the newest report's reason and page path; details and the reporter contact are read by nobody in R1 (the R3 triage
reads them under `abuse.handle`; a super_admin may read them from the DB in an incident, audited by hand in HANDOFF).

**R3 (D5):** console `/admin/abuse` (`abuse.handle`, PLA-§Q.5): queue by status, report detail with the reported page
(sandboxed preview), actions Dismiss, Unpublish page, Hide media, Restrict / Suspend store; page and media takedowns go
through a dedicated platform write scope (`platformWriteScope(ctx, storeId, "takedown")`, a core addition at the R3
contract step) and notify the store with the reason. Acceptance (R1): a report on a seeded store creates one row, one
staff notification and the flag within one health run; the 6th report from one IP in an hour answers `rate_limited`
without a row (rev 4: core bucket); the 21st report on one store in a day answers `rate_limited`; the form on an
unknown handle renders and the post writes nothing; the store's dashboard shows no trace of the report;
**(rev 4)** `GET https://<h>.<root>/report/<h>` (S mode, edge-simulated) answers the neutral 404 and the link in a
rendered landing footer, legal page and thank-you page fixture is absolute to the platform origin with `?p=` holding
the page path only (render-check fixture per page kind, PD83).

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
| Health job | budget-driven within slot 9 (3 s + up to 6 s leftover), ≈ 10 stores per tick, dirty first; per-store cost and `cycleMin` recorded (rev 4, PD78; revision 3's "≤ 200 stores per tick" withdrawn) | `platform.health` |
| Preview tokens | 10 min (console), 72 h (seller "private preview") | core §E.2 `mintPreviewToken` (Q.6 accepted) |
| Step-up freshness | 5 min (core §B.7); `p:mfa:stepup:<userId>` 5 / 15 min | T2 |
| Operation de-duplication | `p:op:<userId>:<opId>` 10 min | console actions |
| Legal document body | ≤ 200,000 chars; summary ≤ 500 | legal actions |
| Protected brands | term 2-60 chars | brands actions |
| Reserved handles (extra) | ≤ 500 | `platform` setting schema |
| Store Health (rev 2) | ≤ 20 issues stored, 5 shown; snooze exactly 7 days; `s:<sid>:health:recompute` 6/h; rule budget 40 ms, inputs 250 ms per store; row ≤ 16 KB | engine, `requestHealthRecompute` |
| Lifecycle safety (rev 2) | arm window 3-15 s (default 5); cooldown 0-120 min (default 10); preview reads ≤ 400 ms | `lifecyclePreview`, `LifecycleSheet` |
| Plan impact preview (rev 2) | ≤ 20 example handles per key; one query per changed key | `previewPlanChange` |
| Console pulse (rev 2) | 15 s visible polling, 5 s cache, one poller per browser | `/api/admin/pulse` |
| Pulse contributors (rev 2) | 50 ms budget each; search providers 120 ms each | registries (core §I.3, §I.4) |
| Address card (rev 2) | QR 160 px SVG; WhatsApp text ≤ 300 chars | `AddressCard` |
| Today brief (rev 2) | ≤ 3 lines; opportunity line only with `n ≥ 30` | `TodayBrief` |
| Impersonation note (rev 2) | ≤ 300 chars, kind `note`, `stores.notes` | ribbon composer |
| Sandbox ceilings (rev 3, PD68) | per store 20 MiB before submit / 100 MiB after (`signup.pendingMediaMiBBeforeSubmit` 5-200, `signup.pendingMediaMiB` 10-1,024); shared `signup.pendingMediaTotalMiB` 500-50,000 (default 5,000); `signup.pendingStoresPerDay` 1-1,000 (default 50); AI slice `platform_ai.caps.pendingSharePct` (ai.md, default 10) | `applyStateCap`, the media upload route (`chargePlatformUsage`), `signupAction` |
| Abuse reports (rev 3, PD70; rev 4 core buckets) | details ≤ 2,000 chars; contact ≤ 120; `?p=` path ≤ 300 chars; `p:report:ip:<h>` 5/h; `p:report:store:<h>` 20/day | `reportStoreAction` |
| Brand check (rev 3, PD70; rev 4 one-field signature) | one field per call, value ≤ 200 chars (longer policy texts are scanned in 200-char windows by the health rule only); terms cached 5 min | `checkBrandTerms`, `brandMatches` |
| Tenant step-up (rev 4, PD80) | fresh for 5 min (`sessions.step_up_at`); TOTP `p:mfa:stepup:<userId>` 5 / 15 min; password `p:password:<userId>` (core §E.8) | `StepUpSheet`, T2's `stepUpAction` / `stepUpWithPasswordAction` |
| Account deletion (rev 4, PD81) | staff: `users.manage` ↑, reason ≤ 200, typed e-mail, `p:users:manage:<staffId>` 30/h; self: owns no store, step-up, typed word | `deleteUserAction`, `deleteMyAccountAction` |
| Private preview links (rev 4) | 72 h; revocable; at most 10 active per store (older ones listed first for Revoke) | `mintPreviewLinkAction`, `revokePreviewLinkAction` |
| Locale cookie (rev 3, PD71) | `__Host-sgl` ∈ {`ar`, `fr`, `en`}; anything else ignored | `(public)` layout, `updateProfileAction` |
| Store audit page (rev 3, PD75) | 50 rows per page; filters by actor kind, area, date | `listStoreAudit` |

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
| `stores/new/actions.ts` | `createStoreAction` (rev 3: runs `checkBrandTerms`; an exact match needs the staff note, PD70) | `stores.create` | | `store.created` |
| `src/app/(public)/report/[handle]/actions.ts` (rev 3, PD70; P1, public) | `reportStoreAction({ handle, reason, details, pagePath?, contact?, turnstile? })` | `publicAction` (Turnstile when configured; `p:report:ip`, `p:report:store`) | | none (a public report is not an audit event; `staff.abuse_report` notification) |
| `stores/[id]/actions.ts` | lifecycle actions of PLA-§8.1, `setSuspendNoticeAction`; `lifecyclePreviewAction` (read, rev 2, PD54); `markHealthDirtyAction` (rev 2: the Overview strip's "Mark dirty") | `stores.lifecycle` / `stores.close` / `stores.purge`; preview and mark-dirty `console.read` | per §8.1 | `platform.store.*`; preview none |
| | `revealOrderPiiAction` | `pii.reveal` | ↑ | `platform.pii.revealed` |
| | `addImpersonationNoteAction` (rev 2, PD56; callable from the tenant shell ribbon by the impersonating staff member: it is a `platformAction`, so a tenant session is refused) | `stores.notes` | | `platform.note.added` |
| | `assignPlanAction` | `entitlements.override` | | `platform.plan.changed` |
| | `setEntitlementAction`, `clearEntitlementAction` | `entitlements.override` | | `platform.entitlement.set` |
| | `requestPlatformExportAction` | `stores.close` (super_admin) | ↑ | `store.export_requested` |
| | `startImpersonationAction`, `endImpersonationAction` | `stores.impersonate` | | core `platform.impersonation.*` |
| | `addNoteAction`, `editNoteAction`, `deleteNoteAction`, `pinNoteAction` | `stores.notes` | | `platform.note.added` · `.edited` · `.deleted` · `.pinned` |
| | `replayOutboxAction` | `stores.lifecycle` | | `platform.outbox.replayed` |
| | `retryRendersAction` | `domains.manage` | | `platform.domains.rerender` |
| `users/actions.ts` | `banUserAction`, `unbanUserAction`, `resetUser2faAction`, `createResetLinkAction`, `signOutUserAction` | `users.manage` | ↑ | `platform.user.*` |
| | `deleteUserAction` (rev 4, PD81: T2's `deleteUserAccount`; refused `owns_store` / `is_staff`) | `users.manage` | ↑ | `platform.user.deleted` |
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
| | `mintPreviewLinkAction({ pageId })` · `revokePreviewLinkAction({ tokenId })` (rev 4, core §E.2 SEC-7) | `storeAction("pages.read")` | `store.preview_link.created` · `store.preview_link.revoked` |
| `src/app/app/[store]/welcome/actions.ts` | PLA-§22.2 table | per row | `store.onboarding.completed` · `.skipped` |
| `src/app/app/[store]/team/actions.ts` | PLA-§22.4 table | per row | core `store.member.*` |
| `src/app/app/[store]/notifications/actions.ts` | `markNotificationsReadAction` | `storeAction("store.read")` | — |
| `src/app/app/[store]/health-actions.ts` (rev 2, PD67) | `snoozeHealthIssueAction({ issueId })` · `recomputeHealthAction()` | `storeAction("health.snooze")` · `storeAction("store.read", …, { rate: { name: "health:recompute", limit: 6, windowSec: 3600, per: "store" } })` | `store.health.snoozed` · — |
| `src/app/app/[store]/actions.ts` (rev 2, PD61) | `dismissAddressCardAction()` (writes nothing server-side: a client-only localStorage convenience; listed so the lint sees no action) | — | — |
| `settings/general/actions.ts` | `saveGeneralAction` (rev 3: `checkBrandTerms` first; `brand_protected` on an exact match, PD70) · `setStoreModeAction` (shows `landingModeSwitchPlan(scope)` first, core §A.2) | `settings.write` · `store.mode` | `store.settings.updated` (+ `store.brand_term.refused` on refusal) · `store.mode_changed` |
| `settings/audit/page.tsx` (rev 3, PD75; read-only, no actions) | — (`listStoreAudit(scope, filter)` in the server component) | `requireStoreMember({ permission: "settings.read" })` | — |
| `settings/address/actions.ts` | `renameHandleAction` | `domains.manage` | `store.handle_renamed` |
| `settings/security/actions.ts` | `setRequireMember2faAction` | `security.write` | `store.2fa_required_changed` |
| `settings/plan/actions.ts` | `createStoreRequestAction`, `withdrawStoreRequestAction` | `billing.manage` (rate `s:<sid>:request` 5/day) | `store.request.created` · `.withdrawn` |
| `settings/danger/actions.ts` | `requestStoreExportAction` · `closeOwnStoreAction` · `reopenOwnStoreAction` · `leaveStoreAction` | `store.export` ↑ · `store.close` ↑ · `store.close` · `store.read` (rev 4, PD80: ↑ = the tenant ladder, TOTP or password, for every user) | core `store.export_requested` · `store.closed` · `store.reopened` · `store.member.removed` (each with `meta.stepUp`) |
| `src/app/app/account/**/actions.ts` | `updateProfileAction`, `changePasswordAction`, `revokeSessionAction`, `signOutOthersAction` (+ the moved 2FA actions) | `userAction` | `auth.*` |
| `src/app/app/account/danger/actions.ts` (rev 4, PD81) | `deleteMyAccountAction()` (T2's `deleteUserAccount`; refused `owns_store` / `is_staff`) | `userAction` + the step-up ladder | core `auth.account.deleted` |

### PLA-§M.2 Route handlers

| Route | File | Guard | Cache |
|---|---|---|---|
| `GET /api/admin/pulse` | `src/app/api/admin/pulse/route.ts` | `platformGuard(req, "console.read")` | ETag, `private, no-store` |
| `GET /api/admin/search?q=` | `src/app/api/admin/search/route.ts` | `console.read` | `private, no-store` |
| `GET /api/admin/stores.csv` | `src/app/api/admin/stores.csv/route.ts` | `console.read` + admin rank | `private, no-store`, `Content-Disposition: attachment` |
| `GET /api/admin/audit.csv` | `src/app/api/admin/audit.csv/route.ts` | `audit.platform` | same |
| `GET /api/admin/stores/<id>/media/<key>` | `src/app/api/admin/stores/[id]/media/[key]/route.ts` | `console.read` | `private, no-store`, sandbox CSP, nosniff (the handler's own: the proxy passes a gated read without the console CSP and Cache-Control, core §C.3, P0b V-1) and, from the proxy (P0b review F-4), CORP `same-origin`, frame `DENY`, `Referrer-Policy: same-origin`, `X-Robots-Tag: noindex`: the handler never sets CORP `cross-origin` (the store media's value), and the proxy's values win anyway |
| `GET /api/admin/stores/<id>/exports/<jobId>/<part>` | `src/app/api/admin/stores/[id]/exports/[jobId]/[part]/route.ts` | `stores.close` + signature + fresh step-up | `private, no-store` |
| `GET /api/admin/backups/<day>` | `src/app/api/admin/backups/[day]/route.ts` | `backups.manage` + fresh step-up | `private, no-store` |
| `GET /api/app/<h>/pulse` | `src/app/api/app/[store]/pulse/route.ts` (P2) | `storeGuard(req, h, "store.read")` | ETag, `private, no-store` |
| `GET /api/app/<h>/search?q=` | `src/app/api/app/[store]/search/route.ts` (P2) | `storeGuard(req, h, "store.read")` | `private, no-store` |
| `GET /app/manifest.webmanifest` | `src/app/app/manifest.webmanifest/route.ts` (P2) | none (public) | `public, max-age=3600` |
| `GET /invite/staff/<token>` (page) | `src/app/(public)/invite/staff/[token]/page.tsx` (P1) | token | `private, no-store`, **`same-origin`** (rev 4, core §B.1 rev 3 / ENGC-16; revision 3 wrote `no-referrer`), `noindex` |
| `GET /report/<handle>` (page, rev 3, PD70) | `src/app/(public)/report/[handle]/page.tsx` (P1) | none (public; Turnstile on the post) | `private, no-store`, **`same-origin`**, `noindex`; **store hosts answer the neutral 404** and legacy hosts 308 to the platform host (rev 4, core §C.4 route table / §Q.8 PLA Q3.4 A\*; revision 3 wrote "store hosts 308") |

Every handler sets its own security headers (core D31) through `apiHeaders` or the media headers.

### PLA-§M.3 Audit actions added by this part

`platform.signup.snoozed`, `platform.signup.bulk_approved`, `platform.request.resolved`, `platform.request.cancelled`,
`platform.store.messaged`, `platform.stores.exported`, `platform.note.added|edited|deleted|pinned`,
`platform.outbox.replayed`, `platform.domains.rerender`, `platform.domains.step`, `platform.order.lookup`,
`platform.plan.updated`, `platform.plan.created`, `platform.invite.created|revoked`, `platform.waitlist.invited|dropped`,
`platform.brand_term.saved|deleted`, `platform.legal.saved|reviewed|published|retired`, `platform.settings.updated`,
`platform.staff.invited|signed_out_all`, `platform.audit.exported`, `platform.breakglass.reviewed`,
`store.milestone.reached`, `store.review.submitted|answered`, `store.appeal.submitted`, `store.request.created|withdrawn`,
`store.preview_link.created`, `store.onboarding.completed|skipped`, `auth.legal.accepted`, and (rev 2)
`store.health.snoozed` (core §F.5 lists it), `store.milestone.reached` (job), and (rev 3) `store.brand_term.refused`
`{ field }` (PD70; the matched term never enters the meta), and (rev 4) `platform.user.deleted` `{ reason }` (PD81;
the core's §F.9 name, appended by core §F.5). Core actions reused as listed in core §F.5, incl. (rev 4)
`auth.account.deleted`, `store.preview_link.revoked`, `store.landing_settings.updated` (reason `onboarding`) and the
`meta.stepUp: "totp" | "password"` field the tenant ladder adds to `store.export_requested`, `store.closed`,
`store.member.role_changed` and the secret-write audit rows (core §B.7). `AuditAction` keeps its `(string & {})` escape hatch (`src/lib/audit.ts:14-38`); the names were appended to the
union by core §F.5 (Q.23 accepted). No lifecycle "undo" action exists: an arm-window cancel writes nothing (PD54).

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
| Health job: stores without a snapshot (rev 2) | `stores_status_idx (status, created_at)` + PK anti-join on `store_health` | `LEFT JOIN … WHERE h.store_id IS NULL LIMIT 20` after the dirty batch and before the stale one (rev 4: the job is budget-driven, so each batch reads at most 20 ids and the loop stops at the deadline) |
| Plan impact examples (rev 2) | `store_usage` PK `(store_id, metric, period)` over the plan's store ids (`stores_plan_idx`) | `IN (…≤ 2,000 ids)` chunked by 500 |
| Lifecycle preview (rev 2) | `orders_queue_idx (store_id, confirm_state, due_at)`, `orders_assignee_idx`, `rj_store_idx (store_id, state)`, `pages_store_status_idx` | four indexed counts, one store |
| Console orders 24 h confirmed / risky (rev 2) | `orders_created_idx (created_at)` range, filter in memory | ≤ one day of rows |

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
| `health` (core §E.6; rev 2) | store id : `"view"` | 5 min / 2,000 | the `platform.health` upsert, `snoozeHealthIssue`, `markHealthDirty` |
| `console-strips` (rev 2) | `"p"` : `<storeId>:<strip>` | 30 s / 2,000 | console actions on the store (`markHealthDirty` path), `transitionStore` |
| `lifecycle-preview` (rev 2) | `"p"` : `<storeId>:<to>` | 10 s / 500 | `transitionStore` |
| `plan-impact` (rev 2) | `"p"` : `<planId>:<patchHash>` | 60 s / 50 | plan saves |
| `broadcasts` (R3) | `"p"` : `"live"` | 60 s / 1 | broadcast saves |

Buckets: `p:console:search:<userId>`, `p:pii:reveal:<userId>`, `p:orders:lookup:<userId>`, `p:users:manage:<staffId>`,
`p:impersonate:<userId>`, `p:op:<userId>:<opId>`, `s:<sid>:request`, `s:<sid>:search:<userId>`, `s:<sid>:health:recompute`
(rev 2, core §E.8), `p:report:ip:<h>` 5/h, `p:report:store:<h>` 20/day (rev 3, PD70; rev 4 the core's names and
rates) (and the core's `s:<sid>:pulse:<userId>`, `s:<sid>:invite`, `p:invite:accept:ip:<h>`, `p:mfa:stepup:<userId>`,
and rev 4 `p:password:<userId>` for the tenant password step-up). Keys are ids or hashes,
never raw e-mails, phones or IPs. **Platform counters (rev 3, PD68; `platform_usage`, core §D.7, not buckets):**
`pending_stores` per platform day, `pending_media_bytes` (`period = "total"`), and ai.md's `ai_cost_micros_pending`
per month; the console reads them for the ceilings card, the Storage and AI panels and the alarms.

---

## PLA-§N. Copy keys

### PLA-§N.1 Catalogs, owners, rules

| File (`src/lib/i18n/admin/<locale>/…`) | Owner | Locales in R1 | Prefixes |
|---|---|---|---|
| `console.ts` | P1 | en (fr R2, ar R3); **`report.*` en, fr, ar in R1** (rev 6 P0b, §N.2) | `console.*`, `report.*` (the public report page) |
| `notify.ts` | P1 | en, fr, ar for tenant kinds and for `health.platform.*`; en for `staff.*` | `notify.<kind>.title`, `notify.<kind>.body`; **(rev 4, D67 / core §I.5)** P1's tenant health sentences `health.platform.<rule>.*` |
| `auth.ts` | P2 | en, fr, ar | `auth.*` |
| `onboarding.ts` | P2 | en, fr, ar | `onboarding.*` |
| `team.ts` | P2 | en, fr, ar | `team.*` |
| `shell.ts` | P2 | en, fr, ar | `shell.*` (incl. `shell.address.*`, `shell.jobs.*`, `shell.err.busy`, rev 4 `shell.stepup.*`, `shell.account.danger.*`); **(rev 4, D67)** the shell rules' sentences `health.shell.<rule>.*` |
| `health.ts` (rev 2; rev 4 per D67) | P2: the ring, groups, issue-list and snooze **chrome only** (`health.title`, `computing`, `recomputing`, `all_good`, `celebrate`, `severity.*`, `group.*`, `snooze*`, `evidence.*`); every rule sentence lives in the emitting track's file (P1's `health.platform.*` in `notify.ts`, P2's `health.shell.*` in `shell.ts`, P3's in `landing.ts`, P4's in `ops.ts`, P5's in `integrations.ts`, P6's in `design.ts`); revision 3's "P1's tenant sentence in `health.ts`" is withdrawn (two tracks would have owned one file) | en, fr, ar | `health.*` chrome |
| `brief.ts` (rev 2) | P2 | en, fr, ar | `brief.*` (the Today brief templates) |

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
- `notify.*`: the kinds of §18.2 (`.title`, `.body`), incl. `health.issue_new`.
- `health.*` (rev 2): `title`, `computing`, `recomputing`, `recompute`, `updated_at`, `score_later`, `all_good`,
  `celebrate`, `severity.<1|2|3>` (Suggestion / Should fix / Fix now), `group.<group>`, `snooze`, `snoozed_count`,
  `unsnooze`, `snoozed_until`, `after_approval`, `fix.<actionId>` labels, `shell.<rule>.text` and `.fix` for the five
  P2 rules, `platform.<rule>.text` for the nine P1 rules of revision 3 (tenant sentence; four in rev 4, below), `evidence.<metric>` labels. **(rev 4)**
  `health.shell.<rule>.*` now covers **three** P2 rules (`contact`, `legal_identity`, `2fa_orders`; `no_published_page`
  is withdrawn, P3's `landing:no_live_page` replaces it) and lives in `shell.ts`; `health.platform.<rule>.*` covers the
  **four** P1 tenant rules (`render_failed`, `quota_high`, `quota_full`, `risky_orders`; the five integrations copies
  are withdrawn) and lives in `notify.ts`.
- `brief.*` (rev 2): `orders`, `callbacks`, `health`, `opportunity`, `queue`, `empty`.
- `shell.address.*` (rev 2): `title`, `live`, `not_live`, `hidden`, `copy`, `open`, `qr`, `qr_download`, `share`,
  `wa_text`, `test_order`, `after_publish`, `campaign`, `future_domain`, `rerendering`.
- `shell.jobs.*` (rev 2): `working`, `ready`, `open`, `blueprint_building`, `blueprint_ready`.
- **Rev 3 keys:** `auth.signup.mode.<mode>.line`, `auth.signup.mode.<mode>.get.1-3`, `auth.signup.mode.change_later`
  (PD72); `auth.signup.capped` (PD68); `shell.review.works_now` gains `{mediaMb}`; `shell.limit.reason.platform_budget`,
  `shell.limit.brand_protected`, `error.brand_protected` (D65 rule; PD70); `shell.impersonation.masked` (PD69);
  `shell.audit.title`, `shell.audit.actor.<kind>`, `shell.audit.area.<area>`, `shell.audit.<action>` sentences,
  `shell.audit.empty` (PD75); `shell.report.link`, `report.title`, `report.reason.<reason>`, `report.details`,
  `report.contact`, `report.submit`, `report.thanks` (PD70); `onboarding.reveal.saved_product`, `onboarding.reveal.dna`,
  `onboarding.reveal.next` (PD60, PD73); `health.celebrate` text changed (PD64); `notify.staff.abuse_report.*`,
  `notify.staff.signup_capped.*` (en); `console.impersonation.masked`, `console.attention.signup_cap_reached`,
  `console.attention.pending_media_budget`, `console.attention.abuse_reports_new`, `console.attention.brand_term_live`,
  `console.signup.ceilings.*`, `console.turnstile.gate_rule`, `console.brands.live_guard.*`.
- **Rev 4 keys:** `shell.stepup.title`, `shell.stepup.reason.<action>`, `shell.stepup.password`,
  `shell.stepup.password_failed` (PD80); `shell.account.danger.title`, `.what_goes`, `.what_stays`, `.owns_stores`,
  `.is_staff`, `.confirm_word`, `.submit`, `auth.account.deleted` (PD81); `shell.limit.reason.pending_ai` (D69);
  `shell.review.preview_revoke`, `shell.review.preview_revoked`; `onboarding.reveal.saved_sales_page` (PD60 rev 4);
  `health.all_good` text changed, `health.checked_at` (PD78); `error.owns_store`, `error.is_staff`,
  `error.category_required` (D65 rule); `console.users.delete.*`, `console.security.admin_host_missing`,
  `console.domains.v12.*`, `console.attention.signup_capped` (renamed from `signup_cap_reached`),
  `console.attention.data_dir_70` / `data_dir_85` / `edge_bad_key` / `gate_mismatch` / `pool_wait` / `tick_lag`,
  `console.health.cycle`, `console.queue.ai_used`.
- `console.*`: `badge`, `nav.<item>`, `queue.*` (+ rev 2 `queue.pivot`, `queue.margin`, `queue.hold`,
  `queue.evidence.*`), `risk.<SignupFlagCode>`, `reject.<RejectReason>`, `ask.<template>`, `reason.<code>`,
  `attention.<code>` (+ rev 2 `render_stuck`, `render_failed_old`, `edge_silent`, `edge_prev_key`, `health_stale`,
  `health_job_slow`, `design_tables_large`), `feed.<action>`, `audit.<action>`, `entitlement.<key>`,
  `plans.take_orders_locked`, `plans.impact.*`, `signup.open_warning`, `invite.share_text`, `reset.wa_text`,
  `kill.<key>.effect`, `health.*`, `lifecycle.*` (rev 2: `preview.title`, `store_sees`, `affects.<key>`,
  `will_write`, `arm`, `cancel`, `cooldown`), `strip.<id>.title`, `profile.arrives_r2`, `impersonation.chip`,
  `domains.*`, `legal.*`, `staff.*`, `people.*`, `profile.tab.<tab>`, `empty.*`, `err.*`.
- **`report.*` (rev 6 P0b, CCR P1-10):** the public report page's keys (`report.title`, `report.reason.<reason>`,
  `report.details`, `report.contact`, `report.submit`, `report.thanks`, PD70) live in **P1's
  `src/lib/i18n/admin/<locale>/console.ts`**, and unlike the rest of that file they are **complete in ar, fr and en in
  R1** (the page is public and tenant-facing; `shell.report.link` stays P2's). P2's `test:i18n-coverage` lists the
  `report.` prefix among the R1-complete prefixes, so a missing ar or fr report key fails it.

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
| `health.title` (rev 2) | Store health | Santé de la boutique | صحة المتجر |
| `health.computing` | Your first health check runs within 5 minutes. | Votre premier bilan arrive dans les 5 minutes. | أول فحص لصحة متجرك سيجري خلال 5 دقائق. |
| `health.recomputing` | Recomputing. Ready within 5 minutes. | Recalcul en cours. Prêt dans les 5 minutes. | يُعاد الحساب الآن. سيكون جاهزًا خلال 5 دقائق. |
| `health.all_good` (rev 2 text, superseded by the rev 4 row below, PD78) | Nothing to fix right now. The next check runs within an hour. | Rien à corriger pour l'instant. Le prochain bilan a lieu dans l'heure. | لا شيء يحتاج إصلاحًا الآن. الفحص التالي خلال ساعة. |
| `health.severity.3` | Fix now | À corriger maintenant | أصلحه الآن |
| `health.severity.2` | Should fix | À corriger | يُستحسن إصلاحه |
| `health.severity.1` | Suggestion | Suggestion | اقتراح |
| `health.snooze` | Snooze 7 days | Mettre en pause 7 jours | تجاهل لمدة 7 أيام |
| `health.shell.contact.text` | Customers have no way to reach you: add a phone or WhatsApp number. | Vos clients ne peuvent pas vous joindre : ajoutez un téléphone ou un numéro WhatsApp. | لا يستطيع الزبناء التواصل معك: أضف رقم هاتف أو واتساب. |
| `health.shell.no_published_page.text` (withdrawn in rev 4, PD79: P3's `landing:no_live_page` carries the sentence in `landing.ts`) | No page is live yet. | Aucune page n'est encore en ligne. | لا توجد صفحة منشورة بعد. |
| `health.platform.sheets_backlog.text` (withdrawn in rev 4, PD79: P5's `int:sheets_backlog` carries the sentence in `integrations.ts`; the wording is offered to P5) | Google Sheets is {minutes} min behind ({n} orders waiting). | Google Sheets a {minutes} min de retard ({n} commandes en attente). | Google Sheets متأخر بـ {minutes} دقيقة ({n} طلبات في الانتظار). |
| `health.platform.quota_high.text` | {metric} is {percent} % full. | {metric} est rempli à {percent} %. | {metric} ممتلئ بنسبة {percent}%. |
| `brief.orders.other` (rev 2) | {confirmed} orders confirmed today · {callbacks} callbacks due | {confirmed} commandes confirmées aujourd'hui · {callbacks} rappels à faire | {confirmed} طلبات مؤكدة اليوم · {callbacks} مكالمات متابعة مستحقة |
| `brief.empty` | No orders yet. Publish a page to start. | Pas encore de commandes. Publiez une page pour commencer. | لا طلبات بعد. انشر صفحة للبدء. |
| `shell.address.live` (rev 2) | Live | En ligne | منشور |
| `shell.address.not_live` | Not live yet: publish a page. | Pas encore en ligne : publiez une page. | غير منشور بعد: انشر صفحة. |
| `shell.address.test_order` | Open a test order | Ouvrir une commande test | افتح طلبًا تجريبيًا |
| `shell.address.share` | Share on WhatsApp | Partager sur WhatsApp | شارك على واتساب |
| `shell.jobs.working` (rev 2) | Working in the background | Travail en arrière-plan | قيد التنفيذ في الخلفية |
| `shell.jobs.blueprint_ready` | Your store home is ready. | L'accueil de votre boutique est prêt. | الصفحة الرئيسية لمتجرك جاهزة. |
| `shell.err.busy` (rev 2) | The AI is busy right now. Try again in a few seconds. | L'IA est occupée. Réessayez dans quelques secondes. | الذكاء الاصطناعي مشغول حاليًا. أعد المحاولة بعد ثوانٍ. |
| `auth.signup.mode.landing.line` (rev 3) | One page per product, built to take cash-on-delivery orders from ads. | Une page par produit, faite pour prendre des commandes payées à la livraison depuis vos publicités. | صفحة لكل منتج، مصمّمة لاستقبال طلبات الدفع عند الاستلام من إعلاناتك. |
| `auth.signup.mode.landing.get.1` | A sales page per product with the order form | Une page de vente par produit avec le formulaire de commande | صفحة بيع لكل منتج مع استمارة الطلب |
| `auth.signup.mode.landing.get.2` | Pixels and WhatsApp per page, exports to PHP | Pixels et WhatsApp par page, export PHP | بيكسلات وواتساب لكل صفحة، وتصدير PHP |
| `auth.signup.mode.landing.get.3` | Orders, call center and Google Sheets | Commandes, centre d'appels et Google Sheets | الطلبات ومركز الاتصال وGoogle Sheets |
| `auth.signup.mode.store.line` | A full shop: catalog, product pages, cart and checkout. | Une boutique complète : catalogue, fiches produit, panier et commande. | متجر كامل: كتالوج، صفحات منتجات، سلة وإتمام الطلب. |
| `auth.signup.mode.store.get.1` | A catalog with collections and search | Un catalogue avec collections et recherche | كتالوج مع مجموعات وبحث |
| `auth.signup.mode.store.get.2` | Product pages with a cart and checkout | Des fiches produit avec panier et commande | صفحات منتجات مع سلة وإتمام الطلب |
| `auth.signup.mode.store.get.3` | The same orders, call center and Sheets | Les mêmes commandes, centre d'appels et Sheets | نفس الطلبات ومركز الاتصال وSheets |
| `auth.signup.mode.both.line` | The shop plus sales pages attached to its products. | La boutique plus des pages de vente reliées à ses produits. | المتجر مع صفحات بيع مرتبطة بمنتجاته. |
| `auth.signup.mode.both.get.1` | Everything in Full store | Tout ce que contient Boutique complète | كل ما في المتجر الكامل |
| `auth.signup.mode.both.get.2` | Campaign pages that borrow product prices and stock | Des pages de campagne qui reprennent prix et stock des produits | صفحات حملات تأخذ الأثمنة والمخزون من المنتجات |
| `auth.signup.mode.both.get.3` | One order list for both | Une seule liste de commandes pour les deux | قائمة طلبات واحدة للاثنين |
| `auth.signup.mode.change_later` | You can change this later; nothing is deleted. | Vous pourrez changer plus tard ; rien n'est supprimé. | يمكنك تغيير هذا لاحقًا؛ لا يُحذف أي شيء. |
| `auth.signup.capped` (rev 3) | A lot of sellers are joining today. You're on the list and we'll send you an invite. | Beaucoup de vendeurs s'inscrivent aujourd'hui. Vous êtes sur la liste et vous recevrez une invitation. | ينضم كثير من البائعين اليوم. أنت على القائمة وسنرسل لك دعوة. |
| `shell.review.works_now` (rev 3 text) | Works now: build pages, preview them, upload photos (up to {mediaMb} MB) and invite one teammate. | Déjà possible : créer et prévisualiser vos pages, importer des photos (jusqu'à {mediaMb} Mo) et inviter un coéquipier. | متاح الآن: إنشاء الصفحات ومعاينتها، رفع الصور (حتى {mediaMb} ميغابايت) ودعوة عضو واحد. |
| `shell.limit.reason.platform_budget` (rev 3) | Store Gen is onboarding many sellers right now. Uploads for stores in review resume once some are approved. | Store Gen accueille beaucoup de vendeurs en ce moment. Les envois des boutiques en vérification reprendront dès que certaines seront validées. | يستقبل Store Gen كثيرًا من البائعين الآن. تعود عمليات الرفع للمتاجر قيد المراجعة بعد الموافقة على بعضها. |
| `shell.limit.brand_protected` (rev 3) | This name contains a protected brand name. Use your own brand, or contact Store Gen support if you own that brand. | Ce nom contient une marque protégée. Utilisez votre propre marque, ou contactez le support Store Gen si cette marque vous appartient. | يحتوي هذا الاسم على علامة تجارية محمية. استعمل علامتك الخاصة، أو تواصل مع دعم Store Gen إذا كانت العلامة ملكك. |
| `shell.impersonation.masked` (rev 3) | Customer details are hidden from support. | Les données clients sont masquées pour le support. | بيانات الزبناء مخفية عن فريق الدعم. |
| `notify.store.impersonation_started.body` (rev 3 text) | Reason: {reason}. From {from} to {to}. Read-only. Customer details were hidden. | Motif : {reason}. De {from} à {to}. En lecture seule. Les données clients étaient masquées. | السبب: {reason}. من {from} إلى {to}. للقراءة فقط. كانت بيانات الزبناء مخفية. |
| `shell.audit.title` (rev 3) | Activity | Activité | النشاط |
| `shell.audit.actor.impersonation` | Store Gen support (view) | Support Store Gen (consultation) | دعم Store Gen (اطّلاع) |
| `shell.audit.empty` | No activity yet. | Aucune activité pour le moment. | لا نشاط بعد. |
| `shell.report.link` (rev 3) | Report this store | Signaler cette boutique | الإبلاغ عن هذا المتجر |
| `report.title` | Report {store} | Signaler {store} | الإبلاغ عن {store} |
| `report.thanks` | Thank you. Store Gen will review this store. | Merci. Store Gen va examiner cette boutique. | شكرًا لك. سيراجع Store Gen هذا المتجر. |
| `onboarding.reveal.saved_product` (rev 3) | Your first product and its page are saved as drafts; your store home is being built. Publishing unlocks after approval. | Votre premier produit et sa page sont enregistrés en brouillon ; l'accueil de votre boutique est en cours de création. La publication s'ouvre après validation. | تم حفظ منتجك الأول وصفحته كمسودة؛ الصفحة الرئيسية لمتجرك قيد الإنشاء. يصبح النشر متاحًا بعد الموافقة. |
| `onboarding.reveal.dna` (rev 3) | Why this design | Pourquoi ce design | لماذا هذا التصميم |
| `health.celebrate` (rev 3 text) | Your store is in great shape. | Votre boutique est en pleine forme. | متجرك في حالة ممتازة. |
| `health.all_good` (rev 4 text, PD78) | Nothing to fix right now. Checked at {time}; it checks again after every change you make. | Rien à corriger pour l'instant. Vérifié à {time} ; un nouveau bilan suit chaque modification. | لا شيء يحتاج إصلاحًا الآن. آخر فحص على {time}، ويُعاد الفحص بعد كل تغيير تقوم به. |
| `health.checked_at` (rev 4) | Checked at {time} | Vérifié à {time} | آخر فحص: {time} |
| `shell.stepup.title` (rev 4, PD80) | Confirm it's you | Confirmez que c'est bien vous | أكّد أنك أنت |
| `shell.stepup.reason.export` | to export your customers' data | pour exporter les données de vos clients | لتصدير بيانات زبنائك |
| `shell.stepup.password` | Your password | Votre mot de passe | كلمة المرور |
| `shell.stepup.password_failed` | That password didn't work. | Ce mot de passe ne fonctionne pas. | كلمة المرور غير صحيحة. |
| `shell.account.danger.title` (rev 4, PD81) | Delete my account | Supprimer mon compte | حذف حسابي |
| `shell.account.danger.what_goes` | Your name, e-mail, phone and devices are removed. | Vos nom, e-mail, téléphone et appareils sont supprimés. | يُحذف اسمك وبريدك الإلكتروني وهاتفك وأجهزتك. |
| `shell.account.danger.what_stays` | The proof that you accepted the terms and the stores' activity logs keep an anonymous id. | La preuve d'acceptation des conditions et l'historique des boutiques gardent un identifiant anonyme. | يبقى إثبات موافقتك على الشروط وسجلّ نشاط المتاجر بمعرّف مجهول. |
| `shell.account.danger.owns_stores.other` | You own {count} stores. Close them first, then come back here. | Vous êtes propriétaire de {count} boutiques. Fermez-les d'abord, puis revenez ici. | أنت مالك لـ {count} متاجر. أغلقها أولًا ثم ارجع إلى هنا. |
| `auth.account.deleted` | Your account was deleted. | Votre compte a été supprimé. | تم حذف حسابك. |
| `shell.limit.reason.pending_ai` (rev 4, D69) | Store Gen's AI budget for stores in review is used up for now. Your store gets its own budget once it is approved; the hand-written suggestions keep working. | Le budget IA de Store Gen pour les boutiques en vérification est épuisé pour le moment. Votre boutique aura le sien une fois validée ; les suggestions rédigées à la main restent disponibles. | ميزانية الذكاء الاصطناعي للمتاجر قيد المراجعة نفدت حاليًا. سيحصل متجرك على ميزانيته بعد الموافقة، والاقتراحات المكتوبة مسبقًا تبقى متاحة. |
| `shell.review.preview_revoke` (rev 4) | Revoke | Révoquer | ألغِ الرابط |
| `onboarding.reveal.saved_sales_page` (rev 4) | Your first page is a sales page; your store home is being built. Publishing unlocks after approval. | Votre première page est une page de vente ; l'accueil de votre boutique est en cours de création. La publication s'ouvre après validation. | صفحتك الأولى صفحة بيع؛ الصفحة الرئيسية لمتجرك قيد الإنشاء. يصبح النشر متاحًا بعد الموافقة. |
| `error.category_required` (rev 4) | Choose a category first. | Choisissez d'abord une catégorie. | اختر الفئة أولًا. |

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
| `console.attention.render_stuck` (rev 2) | {pending} pages are waiting to re-render; the oldest for {minutes} min |
| `console.attention.health_stale` (rev 2) | {count} active stores have no health check for over {minutes} min |
| `console.attention.edge_silent` (rev 2) | No request came through the Worker for {minutes} min while subdomains are on |
| `console.kill.platform_read_only.effect` | Every dashboard becomes read-only. Orders, leads and Sheets keep flowing. |
| `console.kill.ai_generation_enabled.effect` (rev 2) | Cloud and server AI stop, new Message Batches are not submitted; open batches still finish. Local and library AI keep working. |
| `console.queue.pivot` (rev 2) | Without {flag} this would be {band}. |
| `console.queue.margin` (rev 2) | {band} needs {points} points fewer. |
| `console.queue.hold` (rev 2) | Kept out of the fast lane by {flag}. |
| `console.lifecycle.store_sees` (rev 2) | The store will read this ({locale}): |
| `console.lifecycle.arm` (rev 2) | {action} in {seconds}… Cancel |
| `console.lifecycle.cooldown` (rev 2) | Changed {ago} by {name} ({to}). Type the handle to change it again. |
| `console.profile.arrives_r2` (rev 2) | Full view arrives with R2 |
| `console.impersonation.chip` (rev 2) | Viewing @{handle} · {left} |
| `console.plans.impact.lowered` (rev 2) | Lowers {key} for {stores} stores; {above} are already above {to}: {examples} |
| `console.impersonation.masked` (rev 3) | You will see customer names, phones, addresses and notes masked. To read one customer, use the per-order reveal from the store profile. |
| `console.attention.signup_cap_reached` (rev 3; renamed `console.attention.signup_capped` in rev 4, row below) | {cap} sandboxes were created today; new sellers join the waitlist |
| `console.attention.pending_media_budget` (rev 3) | Stores in review use {percent} % of their shared {total} MiB |
| `console.attention.abuse_reports_new` (rev 3) | {count} new reports on {stores} stores in 24 h |
| `console.attention.brand_term_live` (rev 3) | @{handle}'s {field} contains the protected name "{term}" |
| `console.turnstile.gate_rule` (rev 3) | Required for sign-up in Approval and Open; scored in Invite. |
| `console.signup.ceilings.today` (rev 3) | Today: {count} / {cap} sandboxes |
| `console.attention.signup_capped` (rev 4 name) | {cap} sandboxes were created today; new sellers join the waitlist |
| `console.attention.data_dir_85` (rev 4) | Store files use {percent} % of the {budget} disk budget |
| `console.attention.edge_bad_key` (rev 4) | {count} requests carried an edge key the app could not verify in the last minute |
| `console.attention.gate_mismatch` (rev 4) | This build was not made from the commit the offline gate passed |
| `console.health.cycle` (rev 4) | Every store is rechecked about every {minutes} min at today's {stores} active stores |
| `console.queue.ai_used` (rev 4) | AI {used} / {limit} credits · {cost} |
| `console.users.delete.confirm` (rev 4) | Type {email} to delete this account. The stores they belonged to and the audit history stay; their name, e-mail, phone and devices are removed. |
| `console.security.admin_host_missing` (rev 4) | The console still shares the shops' address. Set ADMIN_HOST before opening sign-ups. |

---

## PLA-§O. Tests

### PLA-§O.1 `npm test` (offline, no DB)

| Script | File | Owner | Checks |
|---|---|---|---|
| `test:platform` | `src/lib/platform/selftest.ts` | P1 | **scoreSignup golden fixtures** (≥ 30, injected `SignupRiskDeps`, no network): clean Gmail sign-up → 0 / `fast`; disposable domain → 35; null MX → 25; MX timeout → `partial`, 0 points; `face-b00k-shop` handle → `brand_exact` (`brandTokens`); "Banque Populaire Store" → `brand_exact` kind bank; Arabic name with tatweel matching an Arabic term; Gmail dot / plus variant → `dup_email_norm`; phone shared by 3 users → +40 cap; banned link → `reject_candidate` whatever the score; 3 s form → `too_fast`; bot UA; market not allowed; invite code −20; trusted creator −30 and clamp at 0; weights override from settings; thresholds order refusal. `bandFor` table; `autoApprove` truth table per mode (incl. `turnstile: "off"` refused in `open`); `HOLD_CLASS` members. `normalizeEmailForIdentity`, every `mask*` function (incl. short names, IPv6), the console `platformFlags` fixtures per flag code (the issue-level fixtures and the monotonic property moved to `test:health`, rev 2), milestones, `flagValue` order and rollout stability, `renderMarkdownLite` escaping (`<script>`, `javascript:` links, nested emphasis), cursor tamper → `null`, every reason code has `console.reason.*` and `shell.status_reason.*` keys, every tenant notification kind has ar/fr/en keys with the same placeholders, `roleSummary` agrees with `can()` for every role, `PlatformSettingSchema` / `OnboardingSchema` defaults parse `{}` |
| `test:platform` (rev 2 additions) | `src/lib/platform/selftest.ts` | P1 | `explainBand` agrees with `bandFor` on every golden fixture (removing the pivot flag re-scores to `bandWithout`; no pivot when no single flag changes the band); `lifecyclePreview` pure parts (`storeSees` text per edge and locale, `cooldown.typedHandleRequired` on a fake clock); `PlanImpact.examples` ordering and the ≤ 20 cap; `ConsolePulse` ETag stability; every `NotificationKindDef.vars` schema free of `phone` / `name` / `address` / `email` / `note`; the alarm code list of PLA-§15.2 has a `console.attention.*` key each; `KpiTile`, `FunnelChart`, `HealthRing` refuse dishonest props (type-level and runtime); a grep over `src/components/console/**` for `adm-aurora` / `adm-grain` and over `src/components/admin/dashboard/**` for "Revenue" returns nothing |
| `test:platform` (rev 4 additions) | `src/lib/platform/selftest.ts` | P1 | **`FEATURE_PROOFS`** (PD77): every R1 id of PLA-§1 has ≥ 1 entry, every entry names a script of PLA-§O and, for `test:db` / attack / e2e entries, a case or step number that exists in this document's lists (the lists are mirrored as constants in the same file); `checkBrandTerms(kind, value)` answers `"ok" \| "near" \| "exact"` and never the term, `brandMatches` returns the term (one-field signature, PD70 rev 4); `reportUrl` fixtures (absolute platform origin, `?p=` path only, query and host stripped, 300-char cap); the notification link rule (`/app/<h>`, `/app/<h>/x`, `/app/<h>?a`, `/admin/x`, `/app/account?doc=tos` pass; `https://evil.example`, `//evil`, `/app/../admin`, `javascript:` stored as `null`); `staleAfterMin` = `max(staleAlarmMinutes, 1.5 × cycleMin)` on fixtures; `platformFlags()` derives `sheets_backlog` / `outbox_dead` / `capi_failing` / `telegram_failing` / `setup_incomplete` from the P5 / P3 issue fixtures and emits no issue of its own for them |
| `test:platform` (rev 3 additions) | `src/lib/platform/selftest.ts` | P1 | `checkBrandTerms` fixtures (exact / near / none; Arabic term; a staff actor gets the same result, the refusal is the caller's); `maskCustomerFields` and `maskIfImpersonation` (identity for `member` / `system`, every field masked for `impersonation`, `city` kept); the `__Host-sgl` parser (`"fr"` ok; `"FR"`, `"ar; Domain=x"`, `""`, a 300-char value → fallback; two cookies → the host-only one); `platform:brand_term_live` fixtures (term in the store name / a page `seoTitle` / a policy text / nowhere; a `substring` term of 5 chars never matches; weekly alarm dedupe key); the two Turnstile flags never appear on a fixture scored with `mode ∈ {approval, open}`; `modeSummary` bullets agree with `modeAllows` and differ across modes; the `PlatformSettingSchema` ceilings parse their defaults (20 / 100 / 5,000 / 50) and refuse `pendingMediaMiBBeforeSubmit > pendingMediaMiB`; `recordAbuseReport` input parsing (reason enum, 2,000-char cap, same-host path rule) |
| `test:health` (rev 2; core §J.1) | `src/lib/health/selftest.ts` | P1 (fixtures per rule from every track's `rules/<track>.ts`) | **(rev 4, PD79)** registry scan: no two registered rules emit the same evidence `metric` in the same group (one condition, one issue), every registered rule id is `<track>:<rule>` with the track matching its file; §6.3: fixtures per rule with and without `minN`; score monotonic (1,000 random removals and snoozes never lower it, seeded RNG); group caps; severity → points; snooze expiry on a fake clock; `platformFlags` ↔ issues consistency (every flag that maps onto a group has its issue); milestones once; `health.issue_new` dedupe per week; i18n templates of every tenant-visible rule render with every variable in ar/fr/en; a two-store fixture proves no cross-store evidence; a throwing rule is skipped and recorded, the others still score |
| `test:shell` (rev 6 P0b, CCR P2-1; core §J.1) | `src/components/admin/shell/selftest.ts` | P2 | the shell's pure selftests, which cannot run inside P1's `test:platform` before P1 merges: `modeSummary` / `roleSummary` agree with `modeAllows` / `can()`, the zero-data brief gives `brief.empty`, the props guards refuse dishonest props, the banner order, error-map exhaustiveness, chords never fire in editable fields or open overlays, the QR size and WhatsApp text cap, the shell rule fixtures (a two-store fixture, no cross-store evidence); in the platform group of `scripts/qa/test-budget.json` |
| `test:pulse` (rev 2; core §J.1) | `src/lib/pulse/selftest.ts` | P2 | `StorePulse` shape; ETag stability for identical payloads and change on any field; contributor budget (a 60 ms contributor is dropped, its keys omitted) and failure isolation; per-user parts never cached across users (two viewers, two bodies); the poller election with a fake `BroadcastChannel` (one leader, re-election after 40 s of silence) |
| `test:admin-motion` (rev 2; core D60, §J.1) | `scripts/qa/admin-motion-check.ts` | P2 | no `type: "spring"`, no overshoot cubic-bezier (y1 or y2 outside 0-1), no duration > 400 ms outside `src/components/builder/**`; `--ui-spring` absent from the tokens; the two revision-1 sites (`app-sidebar.tsx:96`, `:146`) are the regression fixtures |
| `test:admin-rtl` (rev 2; DES-R2, core §I.5) | `scripts/qa/admin-rtl-lint.ts` | P2 | fails on physical-side classes `(^| )(ml|mr|pl|pr|left|right|text-left|text-right)-` in `src/components/admin/**`, `src/components/console/**` and `src/app/app/**`, and on directional icons outside the mirrored allow-list |
| `test:i18n-coverage` | `scripts/qa/i18n-coverage.ts` | P2 | ar, fr and en complete for `auth.`, `onboarding.`, `team.`, `shell.`, `health.`, `brief.` and the tenant `notify.` kinds (incl. `health.issue_new`) and every publish-gate `GateItem.title` (core §I.5); placeholder sets identical; Arabic plural categories present for count keys; no em-dash, no en-dash separator, no "Step n" in any UI string of any catalog incl. `console.ts`; prints the coverage per prefix (UX-08 report) |
| `test:admin-tokens` | `scripts/qa/admin-tokens-check.ts` | P2 | the console block, the violet ribbon, the crimson break-glass ribbon (R3), the `--info` pair (core §I.6) and the monogram tint outside 25-75° (chroma > 0.06); `--ui-spring` absent |
| `test:permissions` (core) | `src/lib/auth/selftest-permissions.ts` | maintainer | gains `orders.lookup`, `stores.create`, `abuse.handle` (accepted, core §A.3.3) in the platform matrix; `health.snooze` granted to owner and admin only |

**Wall time (rev 3, ENGP-24).** The suites this part contributes to `npm test` (`test:platform`, `test:health`,
`test:pulse`, `test:shell` (rev 6 P0b), `test:admin-motion`, `test:admin-rtl`, `test:i18n-coverage`, `test:admin-tokens`)
finish in **≤ 15 s together** (the core §J.1 platform group since the P0 re-cut; P2's suites ≤ 8 s of it) on the owner's PC (HANDOFF §3): the 1,000-removal monotonic property uses a seeded RNG over 40 fixture
issues (pure arithmetic, ≈ 50 ms), the golden signup fixtures are ≥ 30 and ≤ 60, and no suite renders React or reads
the DB. The core's ceiling for the whole of `npm test` is ≤ 3 minutes (PLA-§Q.3 asks core §J.1 to state it and to move
the design corpus, the catalog sweep and the A/A simulations to `test:slow`); `scripts/qa/platform-check.ts` (`test:platform-db`; `--perf` = `qa:platform-perf`, manual)
and `health-db-check.ts` are `test:db`, not `npm test`.

### PLA-§O.2 DB-backed (`npm run test:db`, `cod_test_*` only)

`scripts/qa/platform-check.ts` (P1; rev 6 P0b, CCR P1-1: the script is **`test:platform-db`**, in `test:db` from the P1
merge, while `test:platform` is the offline `src/lib/platform/selftest.ts` of §O.1; the performance run is the manual
**`qa:platform-perf`** = `platform-check.ts --perf`, core §J.2 / §J.3): seeds 3 stores (+ a 2,000-store /
1,000,000-order performance fixture behind `--perf`), staff of each role, and runs:
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
    ≤ 300 ms p95, overview ≤ 800 ms p95, **(rev 2)** store profile Overview ≤ 900 ms p95 with one strip throwing,
    `lifecyclePreview` ≤ 400 ms, `previewPlanChange` ≤ 1 s on a 2,000-store plan, `/api/admin/pulse` ≤ 50 ms when
    cached.
11. **(rev 2) Lifecycle safety:** for every allowed edge on the three seeded stores, `lifecyclePreview().storeSees`
    equals the banner / page the store renders after `transitionStore`, and `affects.agentsWithLease` equals the
    number of leases `releaseAllLeases` released; a second change inside the cooldown without the typed handle is
    refused server-side (`cooldown_handle_required`); the store receives exactly one notification per transition.
12. **(rev 2) Console pulse and impersonation:** `ConsolePulse.impersonation` is set within 5 s of a start and null
    within 5 s of an end; `addImpersonationNoteAction` from a tenant session → `forbidden`, from the impersonating
    staff member → one `platform_notes` row and no tenant table change (row counts before / after).
13. **(rev 3, PD68) Sandbox ceilings:** with `pendingStoresPerDay = 3`, four `approval`-mode signups in one platform
    day create 3 stores and 1 `waitlist` row (`source = "cap:<day>"`), the `pending_stores` counter reads 3 and the
    fourth transaction left no `users` / `stores` / `signup_reviews` row; with `pendingMediaTotalMiB` seeded at its
    limit an upload answers 413 `quota` (reason `platform_budget`) and `error_events` gains no `server` row; a pending
    store's upload crossing 20 MiB before submit answers `quota` and succeeds after `submitForReviewAction`;
    `transitionStore(pending → active)` refunds the store's bytes from `pending_media_bytes`; `usage.reconcile`
    recomputes the shared counter from the pending stores' gauges; a signup without a Turnstile token with the widget
    configured answers the challenge state in `approval` mode and creates nothing.
14. **(rev 3, PD69) Impersonation masking at the repository:** under an impersonating session `listOrders`,
    `getOrder`, `listLeads`, `listCustomers` and `searchOrders` (operations.md stubs seeded with the canaries) return
    `Masked` values for name, phone, address, landmark and note and the real `city`; the same calls under the owner's
    session return the raw values; `revealOrderPii` is unreachable from the tenant route (`forbidden`).
15. **(rev 3, PD70) Brand guard and reports:** renaming an active store to a protected exact term through
    `saveGeneralAction` answers `brand_protected`, writes `store.brand_term.refused` and changes no column; a near term
    saves and sets the `brand_near_live` flag on the next health run; a live page whose `seoTitle` carries an exact
    term raises `brand_term_live` and one `staff.alarm` across three runs in the same week; `recordAbuseReport` ×
    6 from one IP hash in an hour → 5 rows and one `rate_limited` (rev 4: the core's 5/h); two reports on one store in
    a day → one `staff.abuse_report` notification with `count24h = 2`.
16. **(rev 4, PD81) Account deletion:** `deleteUserAction` on a user who owns an `active` store → `owns_store`, nothing
    changed; on a staff member → `is_staff`; on a plain member → `users.email` = `deleted+<ulid>@invalid`, name /
    phone / locale null, `disabled = 1`, no `identity_links` / `sessions` / `password_resets` / `notification_reads`
    row left, `legal_acceptances.ua` null, audit rows kept, one `platform.user.deleted` row without the e-mail;
    `deleteMyAccountAction` without a fresh step-up → `step_up`; with it → the same end state and `auth.account.deleted`.
17. **(rev 4, PD80) Tenant step-up ladder:** for a user **without** TOTP, `requestStoreExportAction`,
    `closeOwnStoreAction` and `changeMemberRoleAction(→ admin)` answer `step_up`; after `stepUpWithPasswordAction`
    with the right password they succeed within 5 minutes and their audit rows carry `meta.stepUp = "password"`; a
    wrong password 5 times hits `p:password:<userId>`; `changeMemberRoleAction(→ editor)` needs no step-up;
    `setRequireMember2faAction` is refused for an owner without TOTP (TN-13).
18. **(rev 4) Sandbox ceilings, refund paths:** a signup that passes step 6 and then fails step 7 on a duplicate
    e-mail leaves `pending_stores` unchanged (`refundPlatformUsage`); an `invite`-mode signup with a code without
    `auto_approve` is counted, one with `auto_approve` is not; a pending store's AI call past the slice answers
    `quota_platform_pending` while an active store's call succeeds.
19. **(rev 4) Machinery screens:** the Domains checklist state survives a process restart; V3 and V12 on the
    temporary domain answer "S mode is off" / "ADMIN_HOST not set" without a network call (OS-06); the cron stopped
    11 minutes on a fake clock turns the Cron panel red and sends exactly one `staff.alarm` per hour, a render job
    pending 61 minutes raises `render_stuck` once, `data_dir_85` fires from a seeded `dataDir` snapshot (OS-09); a
    backup download without a fresh step-up answers `step_up` and the ZIP's manifest checksums match (OS-10); every
    break-glass row links to its actor and target (SE-04).
20. **(rev 4, core §B.5 rev 3 / SEC-24) Invite consumption:** 10 parallel accepts of one store invite from 10 sessions
    → one membership, nine "already used"; 5 parallel accepts of one staff invite → one `platform_role` set; a
    revoked or expired invite accepted in the same instant as its revocation → refused.

`scripts/qa/health-db-check.ts` (P1, rev 2; core §J.2 `test:health-db`): the `platform.health` job over 3 seeded
stores (one clean, one with a 20-minute Sheets backlog and a quota at 85 %, one `suspended`): dirty-first order, snapshot
upsert with `dirty_at = NULL`, milestones written once over two runs, `quota.80` once per metric and period,
`health.issue_new` once per issue id per week, snooze honoured by the next run, no customer data in any snapshot column
(canary scan of `issues`, `flags`, `metrics`), the slot budget respected (rev 4, PD78: with stubbed read APIs at 300 ms
per store the job stops at its deadline, processes ≈ 10 stores, and records `perStoreP50Ms`, `perStoreP95Ms` and
`cycleMin` in `job_runs.summary`; revision 3's "200 stores in ≤ 3 s" is withdrawn as unreachable), the dirty-first
order holding under a 30-row dirty queue (oldest dirty first, three ticks to drain), and the two rings
(`getStoreHealth(systemScope)` vs `getStoreHealth(platformScope)`) reading the same `score`.

### PLA-§O.3 Attack cases added to `scripts/qa/tenancy-check.ts` (TN-10)

**(rev 4, core §K.1 T4 / §K.2 P1 rev 3)** The cases live in **`scripts/qa/tenancy-cases/platform.ts`** (P1), which T4's
`scripts/qa/tenancy-check.ts` imports with every other track's `tenancy-cases/<track>.ts`; P1 writes the shell's cases
too (they are specified here and P1 merges after P2), so no other track edits the file. Canaries seeded in store A: customer phone `+212600000777`, name `Canaryname Zzz`, address `Rue Canary 77`, order
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
8. `store_health` (incl. `issues[].evidence` and `issues[].text` vars), `notifications.vars`, `signup_reviews.signals`
   and `job_runs.summary` written by this part contain no canary (scan after a full job run).
9. **(rev 2)** `snoozeHealthIssueAction` and `recomputeHealthAction` as a member of store B posted to store A's path →
   `not_found`, A's `store_health.snoozed` unchanged; an agent of A calling `snoozeHealthIssueAction` → `forbidden`;
   `recomputeHealthAction` called 7 times in an hour → the 7th answers `rate_limited` and the row is dirty once.
10. **(rev 2)** `GET /api/app/<A>/pulse` with B's session → the neutral 404; a staff member impersonating A reads A's
    pulse with `impersonation` set and `unread` of their own; A's `health` part equals the console strip's score.
11. **(rev 2)** `lifecyclePreviewAction` and every lifecycle action from a tenant owner session → `not_found` /
    `forbidden`; from an analyst → `forbidden`; nothing written.
12. **(rev 2)** The address card for a viewer without `pages.read` renders no "Open a test order" slot; a `pageId` of
    store A passed to store B's card is refused by P3's `mintTestLink` (`not_found`), asserted through the card.
13. **(rev 3, PD68)** 60 `approval`-mode signups in one hour from 60 rotating IPv6 /64 networks with valid Turnstile
    test tokens and the daily cap at 50 → exactly 50 `pending` stores, 10 `waitlist` rows, no 500; the same 60 without
    Turnstile tokens → 0 stores, 0 waitlist rows, 60 challenge answers.
14. **(rev 3, PD68)** With the shared pending budget at its limit, an upload to a pending store answers 413 `quota`
    and the response body contains no store id, path or number other than the limit; an active store's upload is
    unaffected.
15. **(rev 3, PD69)** Under an impersonating staff session the HTML and the RSC payload of every tenant route of store
    A (dashboard, orders list, the order drawer, queue, customers, leads, notifications, `/api/app/<A>/search?q=`
    JSON) contain none of the customer canaries (phone, name, address, note); the owner's session on the same routes
    does contain them (the control that proves the masking is the impersonation's, not a seed error); a tenant call
    to `revealOrderPiiAction` → `forbidden`.
16. **(rev 3, PD75)** `settings/audit` of store A opened with B's session → the neutral 404; A's audit page lists no
    row with `store_id ≠ A`; the impersonation session row names the staff member and never the staff e-mail.
17. **(rev 3, PD70)** `reportStoreAction` on `@<unknown>` and on a `purged` handle → `report.thanks`, no row; a
    report's `details` containing a customer canary stays in `abuse_reports.details` only (no notification, health
    row or audit meta carries it); a member of store A cannot read `abuse_reports` through any tenant route.
18. **(rev 3, PD71)** A request with `Cookie: __Host-sgl=ar; __Host-sgl=zz` renders `dir="rtl"`; a request with
    `sg-locale=fr` (the old name) is ignored; `updateProfileAction` with locale `"zz"` → `invalid`.
19. **(rev 4, core §E.2 SEC-7)** `revokePreviewLinkAction` with a `tokenId` minted by store A, posted to store B's path
    by B's owner → `not_found` and A's link still opens; `mintPreviewLinkAction` with A's `pageId` on B's path →
    `not_found` (T3's `assertOwned`); a revoked link answers the neutral 404 on the next request.
20. **(rev 4, PD81, PD80)** `deleteUserAction` from a tenant owner session → `not_found`; `deleteMyAccountAction` from
    an impersonating staff session → `impersonation_read_only` (account pages are a sensitive surface, PLA-§10.2);
    `stepUpWithPasswordAction` for user X from user Y's session cannot raise X's `step_up_at` (it binds to the
    session); a notification inserted with `link = "https://evil.example/x"` or `"//evil.example"` is stored with
    `link = NULL` (PLA-§18.1 rule).

### PLA-§O.4 HTTP / e2e (`npm run test:e2e`, production build on 3451+, Playwright `channel: "msedge"`)

**Rev 6 P0b (CCR P1-2, P2-1): where the steps live.** P1's steps (1, 3, 4, 6, 12, 13, 16, 17, 20, 21) are
`scripts/qa/e2e/console.ts` (`qa:console-e2e`, P1); P2's (2, 5, 6, 7, 13, 14, 19, 20) are `scripts/qa/e2e/shell.ts`
(`qa:shell-e2e`, P2), beside `scripts/qa/e2e/{pulse,admin-perf}.ts` (#10, #11); all committed (CRIT19: `qa/` is
git-ignored) and chained into `test:e2e` at their track's merge (core §J.3).

1. **Approval flow**: invite-mode signup on a 390 px viewport → pending store → console keyboard triage (`J`, `A`) →
   the seller's dashboard unlocks within one pulse (≤ 15 s) without a reload.
2. **Onboarding timing** (UX-01 AC): 3 photos, 4× CPU throttle, Cloud AI off, empty model cache → `revealMs ≤ 90,000`;
   "Start without photos" → ≤ 15 s; the typed price is the only price on the generated draft. **Rev 5 (CRIT2-6):** runs
   at the R1 integration (after P6's merge); at P2's own merge the step runs against P6's P0 stubs (`RevealFolds`,
   `estimateAlpha`, and the P0b `buildRevealDirections`, whose stub resolves today's generator's three documents with
   `card: null`, DES-§14.3; P0b review F-8) and asserts only the step's flow (`analysing` with `directions: null`, then
   `revealed`; a refused product → `error` with Retry), routing ("Use this design" on a stub direction) and
   `reportRevealAction`.
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
   manifest and `/invite/staff/<token>` (**`same-origin`** since rev 4, core §B.1 / ENGC-16; revision 3 asserted
   `no-referrer`, `noindex`), `/invite/<token>` and `/report/<handle>` (`same-origin`, `noindex`, `private, no-store`).
9. **Release check (manual, R1 exit)**: a native Darija/Arabic speaker and a French speaker review every R1 tenant
   string in the screenshots of step 6; findings fixed before the R1 deploy.
10. **(rev 2) `qa:admin-perf`** (P2, the committed `scripts/qa/e2e/admin-perf.ts`, core §J.3 / CRIT19; rev 5, CRIT2-14: never under the git-ignored `qa/e2e`): with a warm shell on the `--perf` DB, 20 route changes across
    the tenant shell and 20 across the console: p75 perceived navigation (first paint of skeleton or content) < 150 ms;
    a queue approval and a team role change round-trip < 500 ms p75; skeletons never visible for < 300 ms once shown;
    the ⌘K palette opens ≤ 50 ms after the key when warm.
11. **(rev 2) `qa:pulse-e2e`** (P2, the committed `scripts/qa/e2e/pulse.ts`, core §J.3 / CRIT19): two tabs of one browser on the same store produce one `/pulse` request
    stream (network log), the second tab updates its unread count from the first's broadcast; unchanged polls answer
    304; a console approval unlocks the seller's publish button within one pulse without a reload; closing the
    polling tab makes the other tab poll within 40 s.
12. **(rev 2) Lifecycle sheet:** restrict a seeded store, cancel during the arm window → no audit row, status
    unchanged, no notification; restrict again and let the window run out → one audit row, one notification, the
    seller's banner shows the exact `storeSees.banner` text of the preview; a second change within 10 minutes asks for
    the typed handle.
13. **(rev 2) Health ring:** on the seeded backlog store the ring shows the Sheets issue with "Sync Sheets" as the fix;
    pressing it runs the registered command (P5's action is stubbed to record the call); snoozing removes the issue
    within one pulse; the console profile strip shows "snoozed by owner until <date>"; the dashboard still renders
    when `getStoreHealth` is forced to throw.
14. **(rev 2) Dashboard timings:** at 390 px on 4G with a warm shell, the brief, the ring and the first KPI tile paint
    within 1.5 s; "Revenue" appears nowhere on the page; the funnel renders the R2 steps as the neutral line, never a
    zero bar.
15. **(rev 3, PD73; rev 5, CRIT2-6: run at the R1 integration, not at P2's merge, because the component is P6's and P6
    merges after P2) Reveal layout:** at 390 px the reveal screenshot shows direction 1 at the viewport width with no
    bezel and the peek of direction 2; a swipe and the dots both move to direction 2; the DNA sheet opens from its
    handle; "Use this design" stays visible while scrolling; at 1280 px three folds render side by side at equal width
    and focusing one expands it; the reduced-motion run shows no scale animation.
16. **(rev 3, PD70) Brand guard end to end:** the General page refuses "CIH Bank · Vérification" with the limit sheet
    (no toast, nothing saved); the console's "Check a name" box agrees; `/report/<handle>` from a landing page's footer
    link (rev 4: the link is absolute to the platform origin in every mode, and the same path on the store host
    answers the neutral 404 in S mode; revision 3 expected a 308) submits and the console's Needs attention shows the
    row within one pulse.
17. **(rev 3, PD68) Ceilings in the UI:** the Sign-up settings tab shows "Today: 3 / 3 sandboxes" after case 13's
    seed and the waitlist rows carry the "Daily cap" chip; the review card of a pending store reads "up to 20 MB" and,
    after Submit, "up to 100 MB".
18. **(rev 3, PD71) Cookies:** `scripts/qa/headers-check.ts` asserts every `Set-Cookie` of `/login`, `/signup`,
    `/invite/*`, `/app/**` and `/admin/**` starts with `__Host-`.
19. **(rev 4, PD80) Step-up ladder:** a seller without TOTP presses "Request export" → the password sheet opens with
    the line "to export your customers' data", the right password runs the original request once (same `opId`), the
    export job appears; "Close the store" in the next 5 minutes needs no second prompt; a role change to `admin` opens
    the sheet, a change to `editor` does not; with TOTP enrolled the sheet asks for the code instead (PL-09).
20. **(rev 4, PD81) Account deletion:** a member who owns no store deletes their account from `/app/account/danger`
    (step-up, typed word) and lands on `/login?deleted=1`; signing in with the old e-mail answers the generic failure;
    an owner sees only the "close your stores first" list; the console's Delete account on that member's profile is
    disabled with the same reason.
21. **(rev 4, PD83) Report link on every public page:** in the rendered landing page, legal page and thank-you page of a
    seeded live store (and in R2 the store home), the "Report this store" link points to
    `platformOrigin()/report/<h>?p=<path>`; following it lands on the form with the page path prefilled.

### PLA-§O.5 The wow demo (RF §4; `scripts/qa/wow-demo.ts`, maintainer; steps contributed by P2, P3, P4, P1) parts owned here

Persona 1 (seller, 390 px, 4G, Cloud AI off, empty model cache): **0:00-0:50** signup from the invite link, the mode
cards (`landing`), 3 photos with progressive thumbnails, store name and handle with the live address preview (≤ 300 ms
per debounced keystroke), the suggested category tapped, the reveal with three directions at ≤ 0:50 (pairwise `d ≥
0.25`, no orange, Design check green) — P2 with P6's reveal and generator. **1:40** the address card with link, QR,
WhatsApp share and "Open a test order" after publish (P2 card, P3 button). **2:50** the dashboard: the Today brief reads
"1 order confirmed today", the health ring shows the zones issue with a one-tap fix, no money tile counts the test
order (P2). Persona 2 (owner, console): **1:25** the Review row shows the score ring, the flag chips, the counterfactual
line and the draft thumbnail within one console pulse of the submission; **`A`** commits in ≤ 1 s server time; the
seller's in-app notice and the unlocked publish button arrive within one tenant pulse (≤ 15 s) (P1 queue, P2 pulse);
**2:50** the store profile Overview shows the first-order milestone in the Timeline strip and the same health score as
the seller's ring (P1). The rest of the clock belongs to P3 (publish, test order, thank-you), P4 (queue, `N`, `1`),
P5 (Sheets / CAPI exclusions) and P6 (design). Every step above is a named assertion in `scripts/qa/wow-demo.ts`
(`steps/platform.ts`, `steps/shell.ts`, contributed by P1 / P2); the whole run must finish ≤ 3:30 wall time
(core §K.2 exit criterion 12). **Rev 3 steps in `steps/shell.ts`:** at 0:50 the three folds are on screen together
(PD73: direction 1 at the viewport width, the peek of direction 2 visible, screenshot asserted); for the argan and the
parfum fixtures at least one of the three directions is stage, specimen or dark (PD74; the alpha estimate ran, no
model file was requested); the signup used a Turnstile test token (PD68) and the run's single store counted once in
`pending_stores`. **In `steps/platform.ts`:** persona 2's start-sheet preview at 1:25 shows the "customer details
hidden" line before `V` (PD69), and the Risk strip reads "No protected term on live pages" (PD70).

---

## PLA-§P. File ownership (consistent with core §K.2, §K.3)

### PLA-§P.1 P1 CONSOLE (R1)

- **`src/app/admin/**`** (rev 4: the core §K.2 P1 row's glob; every page, layout and `actions.ts` of PLA-§4.1 and
  PLA-§M.1 lives under `src/app/admin/(console)/**`), **except `src/app/admin/(auth)/setup/**`** (T2 / maintainer) **and
  `src/app/admin/(console)/ai/**`** (P7; rev 4, CRIT6: revision 3 excluded the non-existent `src/app/admin/ai/**`, which
  left P7's folder inside P1's glob, core §Q.7 M5); `src/app/admin/page.tsx` is deleted by P1.
- `src/app/api/admin/**` (PLA-§M.2).
- `src/app/(public)/invite/staff/**` (PLA-§Q.12) and **`src/app/(public)/report/**`** (rev 3, PD70: the public abuse
  report page and its action; P2's `src/app/(public)/**` glob excludes it, PLA-§P.2).
- `src/lib/platform/**` except `seam.ts`, `impersonation.ts` (maintainer) and `health.ts` (P8): `types.ts`,
  `signup-risk.ts` (incl. `explainBand`, rev 2), `normalize.ts`, `mask.ts` (rev 3: + `maskCustomerFields`,
  `maskIfImpersonation`, imported by the operations repositories), `brand-check.ts` (rev 3, PD70), `abuse-report.ts`
  (rev 3, PD70), `queue.ts`, `requests.ts`,
  `platform-requests.ts`, `stores-list.ts`, `profile/**` (incl. `overview-strips.ts`, `risk.ts`, rev 2), `people.ts`,
  `order-lookup.ts`, `plans.ts`, `flags.ts`, `notify.ts`, `notify-kinds.ts`, `health-score.ts` (the pure
  `computeHealth` of core §I.7, re-exported by the engine), `health-snapshot.ts`, `lifecycle-preview.ts` (rev 2),
  `alarms.ts`, `notes.ts`, `legal.ts`, `staff.ts`, `reasons.ts`, `cursor.ts`, `markdown-lite.ts`, `domain-move.ts`,
  `selftest.ts`, `data/**` (`disposable-domains.json`, `protected-brands.ts` after R1.0, `legal/**`).
- **`src/lib/health/**` (rev 2, core §K.2 P1):** `engine.ts`, `inputs.ts`, `platform-flags.ts`, `rules/platform.ts`,
  `selftest.ts` (rev 5, CRIT2-14: **not** the registry's import lines: `types.ts` and `registry.ts`, import lines
  included, are the maintainer's and pre-written at P0, core §K.2 P1 row / §I.7; the other `rules/<track>.ts` files
  belong to their tracks).
- `src/components/console/**` (incl. `lifecycle/sheet.tsx`, `health/ring.tsx` wrappers, `profile/strips/*.tsx`, rev 2).
- Extension files: `src/lib/settings/keys/platform.ts` (**rev 3, ENGC-8:** this file is P1's; the core §K.2 P1 row
  omits it and PLA-§Q.3 asks the core to list it, since core §D.10 names platform.md as the `platform` key's owner),
  `src/lib/jobs/tracks/platform.ts` (`platform.health`,
  `platform.alarms`, `platform.requests`, `platform.entitlements`), `src/lib/i18n/admin/<locale>/{console,notify}.ts`
  (rev 4, D67 / core §I.5: the `health.platform.*` tenant sentences live in P1's **`notify.ts`**, ar/fr/en; revision
  3 put them in P2's `health.ts`, which would have given one file two owners), `src/lib/notify/kinds/platform.ts`,
  `src/lib/flags/defs/platform.ts`, `src/components/admin/shell/nav/console.ts` (the one "Platform console" switcher
  item, PD36).
- `scripts/qa/platform-check.ts`, `scripts/qa/health-db-check.ts` (rev 2), **`scripts/qa/tenancy-cases/platform.ts`**
  (rev 4: the attack cases of PLA-§O.3, incl. the shell's; core §K.2 P1 row), `scripts/qa/wow-demo/steps/platform.ts`
  (rev 2, contributed steps), `scripts/platform/refresh-disposable.mjs` (manual refresh of the CC0 list, prints the
  diff; never run at runtime), **`scripts/qa/e2e/console.ts`** (rev 6 P0b, CCR P1-2, core §K.2 P1 row: `qa:console-e2e`,
  committed, not under the git-ignored `qa/e2e`, CRIT19; the §O.4 steps P1 owns).
- Not P1's although this part specifies them (read-only for P1): `src/lib/urls/index.ts` (`reportUrl`, `consoleHref`
  are core builders, PLA-§Q.4), the landing footer section (`src/landing/sections/footer/**`, P6) and the legal pages
  (P3) that render the report link, `src/lib/auth/**` (T2's `deleteUserAccount`, `stepUpWithPasswordAction`).
  `test:ownership` (core §J.1) parses this list and §P.2 at P0 and on every merge, so the globs above are written
  exactly as the core §K.2 rows write them.

### PLA-§P.2 P2 SHELL (R1)

- Core §K.2 list: `src/components/admin/{shell,common,dashboard}/**` (except other tracks' nav and command files),
  `src/app/app/new/**`, `src/app/app/[store]/{layout.tsx, page.tsx, notifications/**,
  settings/{general,market,plan,address,security,danger}/**}`, `src/app/globals.css`, `scripts/build-admin-css.mjs`,
  `src/lib/admin-theme/**`, **`src/lib/i18n/admin/<locale>/{shell,auth,onboarding,team,health,brief}.ts` only** (rev 4,
  CRIT7, core D67 / §I.5: **not** `src/lib/i18n/**`; the base catalogs `src/lib/i18n/admin/{en,fr,ar}.ts`, `index.ts`
  and the `t` / `useT` runtime are the maintainer's, every other track's `<locale>/<track>.ts` is that track's;
  revision 3's "`src/lib/i18n/**` (base files + `shell.ts`)" is withdrawn), `scripts/qa/admin-tokens-check.ts`,
  `src/lib/tenancy/handles.ts` (rename), `src/lib/admin-data/{dashboard.ts, search.ts}`.
- Accepted by core §Q.1 Q.12 (now core §K.2 P2), **globs made disjoint in rev 3 (ENGC-8):** `src/app/(public)/**`
  **except `invite/staff/**` (P1), `report/**` (P1, PD70) and `kit/**` (P3, core §K.2 P3 row, LAN-§26.1)**;
  `src/app/app/{page.tsx, actions.ts, account/**, manifest.webmanifest/**}`, the metadata of `src/app/app/layout.tsx`,
  `src/app/app/[store]/{welcome/**, review-actions.ts}`, **`src/app/app/[store]/team/**` except
  `team/{agents,callcenter}/**` (P4, core §K.2 P4 row, OPE-§P)**, **`src/app/app/[store]/settings/audit/**` (rev 3,
  PD75: the route core §I.1 lists had no R1 owner)**, `src/app/api/app/[store]/{pulse,search}/**`,
  `src/components/admin/settings/{team-panel,security-panel,audit-view}.tsx`. PLA-§Q.3 asked the core to write the same
  three exclusions and the audit folder into the §K.2 P2 row and to run a glob-intersection script at P0; **core
  revision 3 did both** (§K.2 P2 row, `scripts/qa/ownership-check.ts` / `test:ownership`, core §Q.8 PLA Q3.6), so the
  "two tracks never own one file" rule of core §K.3 is checked mechanically rather than by reviewers.
- New in this part: `src/lib/i18n/admin/<locale>/{auth,onboarding,team,health,brief}.ts` (the same six files as the
  first bullet with `shell.ts`; listed once more only because they are new files), `src/lib/settings/keys/onboarding.ts`,
  `scripts/qa/i18n-coverage.ts`, `scripts/build-app-icons.mjs`, `public/icons/**`,
  `src/components/admin/shell/commands/shell.ts`; **rev 4:** `src/app/app/account/danger/**` (PD81, inside the
  `src/app/app/account/**` glob above), the password variant of `src/components/admin/common/step-up-sheet.tsx` (PD80,
  inside `common/**`).
- **Rev 2 (core §K.2 P2):** `src/lib/pulse/contributors/shell.ts`, `src/lib/pulse/selftest.ts`,
  `src/lib/health/rules/shell.ts`, `src/app/app/[store]/health-actions.ts`,
  `src/components/admin/shell/{use-pulse.ts, chords.ts, job-chip.tsx, store-banner.tsx, help-sheet.tsx, client-state.ts}`,
  `src/components/admin/common/{address-card.tsx, health-ring.tsx, health-groups.tsx, issue-row.tsx, issue-list.tsx,
  today-brief.tsx, kpi-tile.tsx, funnel-chart.tsx, freshness-dot.tsx, skeleton.tsx}`, **rev 3:**
  `src/components/admin/common/mode-explainer.tsx` (PD72), `src/components/admin/settings/audit-view.tsx` (PD75), the
  `estimateAlpha` call site in `src/app/app/[store]/welcome/**` (the function itself is P6's, PD74), the redesigned
  `src/components/admin/dashboard/**` (deletes `setup-checklist.tsx`; `kpi-card.tsx` is replaced by `kpi-tile.tsx`),
  `src/lib/admin-data/{dashboard.ts, search.ts}` (rewritten around the P0 read APIs and the search providers),
  `scripts/qa/{admin-motion-check,admin-rtl-lint}.ts`, `scripts/qa/wow-demo/steps/shell.ts` (contributed steps),
  **`scripts/qa/e2e/{pulse,admin-perf}.ts`** (`qa:pulse-e2e`, `qa:admin-perf`; committed, core §K.2 P2 row / §J.3, CRIT19;
  rev 5, CRIT2-14: rev 4's "steps under `qa/e2e`" is withdrawn, `qa/` is git-ignored, `.gitignore:48`).
- **Rev 6 P0b (core §K.2 P2 row, CCR P2-3, X-1):** `src/app/app/[store]/{actions.ts, loading.tsx, error.tsx,
  not-found.tsx, member-ctx.ts}` (`actions.ts` holds the old ⌘K `searchAction` the palette rework removes and PLA-§M.1's
  `dismissAddressCardAction`; `loading.tsx` drops the infinite shimmer, §I.6), `src/app/app/[store]/settings/{layout.tsx,
  loading.tsx, route.ts}` and `src/components/admin/settings/settings-nav.tsx` (the registry-driven settings frame),
  `src/components/admin/styles/**` (`admin.css`: D60 / UX-38 delete `adm-aurora`, `adm-grain` and the shimmer),
  `src/app/globals.compiled.css` (the committed output of `scripts/build-admin-css.mjs`), `src/app/dev/fixture/shell/**`
  (the §22.12 primitives' story fixtures), **`scripts/qa/e2e/shell.ts`** (`qa:shell-e2e`, committed: the §O.4 steps 2, 5,
  6, 7, 13, 14, 19 and 20) and `scripts/qa/tenancy-cases/shell.ts` (the attack cases of P2's own store actions; P1 keeps
  the §O.3 special cases, the shell's included, in `tenancy-cases/platform.ts`).

### PLA-§P.3 D5 PLATFORM (R3)

`src/lib/platform/{grants,abuse,transfer,support,broadcasts,analytics,push}/**` (rev 3: `abuse/**` is the R3 triage;
the R1 insert path `src/lib/platform/abuse-report.ts` and the public page stay P1's, PLA-§P.1),
`src/app/admin/(console)/{inbox,broadcasts,analytics,abuse}/**`, the R3 additions to P2's
`settings/{security,danger}` pages (taken over at the R3 contract step), the `/app/sw.js` route (through the core's R3
contract step), `support_macros` / `push_subscriptions` code. (rev 4: `/report/<handle>` is **P1's from R1**,
PLA-§P.1; D5 adds only the triage under `/admin/(console)/abuse/**` and may take the page over at the R3 contract step.)

### PLA-§P.4 Read-only dependencies (called, never edited)

Core seam and registries (`src/lib/tenancy/{types,seam,public}.ts`, `src/lib/platform/{seam,impersonation}.ts`,
`src/lib/auth/permissions.ts`), T1 (`entitlements.ts`, `usage.ts`, `lifecycle.ts`, `audit.ts`, `settings/index.ts`),
T2 auth functions (PLA-§Q.19), P4 order read APIs, P5 `integrationHealth`, P6 reveal and generator, P7 AI hooks and
`aiUsageForStore`, P8 (`getHealth`, outbox `replay`, `enqueueRenders`, exports, backups, storage driver), T4
`admin-data/pages.ts`.

---

## PLA-§Q. Requests to the core: status after core revision 2

**(rev 2)** Every request below was decided in core §Q.1: **32 accepted**, three with changes that this revision has
integrated: **Q.1** (one `store_health` table for both audiences with `issues`, `components` by `HealthGroup` and
`snoozed`: PLA-§2.2, §6.3), **Q.14** (the pulse gained SF-06's ETag / 304 and shared poller and the `health` and `jobs`
fields: PLA-§22.6) and **Q.18** (slot 9 holds `platform.*` at 3 s guaranteed + up to 6 s of leftover; slots 1-7 were
re-cut and `housekeeping` trimmed to 4 s: PLA-§6.3.4). The table is kept as the record of what was asked; the
"Where integrated" column of core §Q.1 names the core section that now carries each contract, and the sections of
this document cite the core instead of the request. Migration placement as decided: the R1 items are in `0005_r1.sql`
(core §D.5), the 0004 refinements in core §D.4, R2 in `0006`, R3 in `0007`.

### PLA-§Q.1 Second-round requests (rev 2)

None are unavoidable. Two notes for the maintainer, recorded here so a reviewer can decide them in core §P without a
request cycle: (1) this part's action-level error codes (`already_decided`, `already_requested`, `take_orders_locked`,
`last_super_admin`, `impersonation_member`, `impersonation_state`, `status_changed`, `cooldown_handle_required`,
`health_recompute_limited`, and **rev 3** `brand_protected` (PD70), **rev 4** `owns_store`, `is_staff` (PD81) and
`category_required` (core §A.2 rev 3), each with its `error.<code>` key in ar / fr / en per core D65) assume
`ActionErrorCode` (core §E.2) keeps an open `(string & {})` tail like `AuditAction` (`src/lib/audit.ts:14-38`); core D65
(rev 2.1) confirmed the tail and core §Q.8 accepted `brand_protected`, so these thirteen names are autocomplete
entries, not a CCR (`quota_platform_pending` is the core's / ai.md's code, mapped by PLA-§22.8). (2) The console's `addImpersonationNoteAction` is a `platformAction` posted from a tenant route (`/app/<h>`) by the
impersonating staff member; `platformAction` needs no store from `x-sg-path`, so no seam change is needed, and the
attack case PLA-§O.3 item 12 pins the behaviour (core §B.8 rev 2.1 records it).

### PLA-§Q.2 The revision-1 requests (all decided; kept as the record)

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

### PLA-§Q.3 Requests raised by the round-1 review (rev 3)

**Status (rev 4):** every row below was decided in core §Q.8: Q3.1-Q3.7 and Q3.12-Q3.16 **accepted** (D69, D70, D76,
§C.9, the §K.2 rows and `test:ownership`, 0004, D73, D68, D74, §J.1), Q3.4 **accepted with a change** (the footer
link is absolute to the platform origin and store hosts answer 404 for `/report/*`, not 308; integrated in PD70,
PD83 and PLA-§24.2), Q3.8-Q3.11 and Q3.17 **sibling** (storefront, design, landing accepted them). The table is kept
as the record.

The findings of PLA-§R that this part could not close alone. Each row names the file and section that must change and
what this part already assumes; the maintainer decides them in core §P / §Q.7 and the other part architects in their
own review-decision sections. Nothing here blocks P1 / P2 from building: every item has a stub or a default that keeps
this part's code typechecking until the other side lands.

| # | Finding | File and section | Exact change asked | This part's side (done) |
|---|---|---|---|---|
| Q3.1 | SEC-1 (blocker) | core §B.2 step 2, §A.5.2, §F.8; T2 `signupAction` | In `approval` and `open` modes a configured Turnstile with a missing or invalid token **refuses** the signup (keep "+20 scored" for `invite` only); step 6 opens with `chargePlatformUsage("pending_stores", <day>, 1, { limit: signup.pendingStoresPerDay })` and a `QuotaError` falls to the waitlist behaviour with `waitlist.source = "cap:<day>"`; §A.5.2 `media_bytes` for `pending` becomes two-tier through `applyStateCap("pending", { submitted })` (`pendingMediaMiBBeforeSubmit` until `signup_reviews.submitted_at`); the media upload route (core §G.4 step 4) charges `chargePlatformUsage("pending_media_bytes", "total", bytes, { limit })` for pending stores before the store gauge and refunds in the same `finally`; `transitionStore` out of `pending` refunds the store's bytes from the shared counter; `usage.reconcile` recomputes it; `platform_usage` gains the two metrics in its `PlatformUsageMetric` union | PD68; PLA-§2.4 keys, §3.1, §3.2, §3.6, §13.2, §15.1, §O.2 case 13, §O.3 cases 13-14 |
| Q3.2 | SEC-1 (blocker) | ai.md AI-§C.2 / §C.3 (`platform_ai.caps`) | Add `caps.pendingSharePct` (default 10) and the counter `platform_usage.ai_cost_micros_pending`; pending stores' calls charge both the monthly counter and the slice; exhaustion answers `quota_platform` to pending stores only; the daily floor `max(50, …)` applies inside the slice; `aiHealth()` exposes the slice's use for the console panel and the `ai_pending_cap` flag | PD68; PLA-§3.6 item 4, §15.1, §15.2 |
| Q3.3 | SEC-5 (major) | core §E.1 `StoreScope.kind`, §B.8, §A.3.1 impersonation membership; operations.md read functions (`listOrders`, `getOrder`, `listLeads`, `getLead`, `listCustomers`, `getCustomer`, `searchOrders`, the drawer's event feed) | `StoreScope.kind` gains `"impersonation"` (set by the seam when `ctx.impersonation` is present); every read function returns rows through `maskIfImpersonation(scope, row)` from `src/lib/platform/mask.ts` (PLA-§7.2) inside the repository; §B.8 states "names, addresses, landmarks and notes are masked, phones were already"; the §F.1 attack suite gains the canary case for impersonating sessions (PLA-§O.3 15) | PD69; PLA-§7.2 helpers, §10.1-10.3, §18.2 body text, §O.2 case 14 |
| Q3.4 | SEC-18 (minor, raised) | core §D.3 / §D.5 (`abuse_reports` registry row), §F.9, §C.4; T3 proxy; landing.md LAN-§3 footer and legal pages, §M.3 honesty gate; storefront.md S1 store chrome; T4 `listPagesForConsole` | `abuse_reports` moves 0007 → **0005** with the columns of PLA-§2.2 and joins the §F.9 purge list; `/report/<handle>` is served on the platform host and store hosts 308 to it like `/kit/<token>`; the landing footer and legal pages render `shell.report.link` (S1's store chrome in R2); the honesty gate adds `honesty:password_field` (an `<input type="password">`, a card-number pattern or an `otp` field refuses the publish; store pages too through the StorePageDoc branch); `listPagesForConsole` rows gain `name` and `seoTitle` | PD70; PLA-§2.2 table, §6.3.1 inputs, §6.3.3 flags, §13.3 guard, §24.2 R1 slice, §P.1 files |
| Q3.5 | SEC-13 (minor) | core §C.9 cookie row; T3 `qa:edge-sim` and `headers-check.ts` | The cookie row lists `__Host-sgl` beside `__Host-cs`, `__Host-csg`, `__Host-sgd` and states "every platform cookie uses the `__Host-` prefix"; `qa:edge-sim` asserts no `Set-Cookie` without the prefix is ever emitted by the platform host | PD71; PLA-§22.1, §O.3 case 18, §O.4 step 18 |
| Q3.6 | ENGC-8 (major) | core §K.2 rows P1, P2, T3 (§K.1), P0 | P2 row: `src/app/(public)/**` except `invite/staff/**`, `report/**` and `kit/**`; `src/app/app/[store]/team/**` except `team/{agents,callcenter}/**`; add `src/app/app/[store]/settings/audit/**` to P2. P1 row: add `src/lib/settings/keys/platform.ts` and `src/app/(public)/report/**`. §K.1 T3: add `src/lib/security/selftest.ts`. P0: a script that parses every row's globs and fails the build on an intersection | PD75; PLA-§P.1, §P.2, §22.10.6 |
| Q3.7 | ENGC-1 (blocker, core-owned) | core §D.2 / §D.3 / §D.5, §K.1 T3 / T4, landing Q21 / Q22 | Move `orders.is_test`, `leads.is_test`, `orders_store_test_idx` and `page_slug_history` (+ `psh_page_idx`) into 0004 so R1.0 code typechecks and runs; or move the test-render and slug-history logic to P3 wave 1 and adjust R1.0 exit (5) and D54's wording. This part reads `is_test` and `page_slug_history` wherever the core places them | PLA-§2 intro note; §5.2, §7.3 strip 1, §15.1 heartbeat unchanged |
| Q3.8 | OPS-14 (major) | storefront.md STO-§12.2 / S1 | `productAsPageDoc(product, { …sctx, direction })` accepts the onboarding direction (genome) so the three PDP renders differ; S1 exports `createProduct(ctx, { facts })` and `setThemeDraft(ctx, direction)` (R2 contract step; both take the `WriteCtx`, core D71 / §A.2 / §K.4; rev 5, CRIT2-14: rev 3's `scope` parameter is withdrawn) that `useDirectionAction` calls in `store` / `both` modes; the UX-01 acceptance case "store mode creates no landing page" is shared | PD60 rev 3; PLA-§22.2 mode table, §2.4 `onboarding.firstKind` / `productId` |
| Q3.9 | UX-20 (major) | design.md DES-§14.3 | The composition follows PD73 (mobile: direction 1 edge-to-edge at 100 %, snap carousel with an 8 % peek, DNA bottom sheet, sticky primary; desktop: three equal folds ≤ 440 px, hover / focus expands; 420 ms quint entrance kept, reduced-motion crossfade) and drops the device-frame-in-a-phone composition; the acceptance "3 directions pairwise d ≥ 0.35" stays design's | PD73; PLA-§22.2 reveal row, §O.4 step 15, §O.5 |
| Q3.10 | UX-39 (major) | design.md DES-§4.11 / §4.4 (H13, H27); core §H.3 `render_jobs.reason`; ai.md AI-21 | `PhotoFacts.hasCutout: boolean \| "estimated"` with the browser `estimateAlpha(bitmap)` (edge flood-fill, < 150 ms) exported for P2's photos step; H13 / H27 accept `"estimated"` with the `plinth` / `contact` presets; `render_jobs.reason` enum appends `'cutout'` (an in-place hero upgrade when the BiRefNet mask lands; P8 handler); `qa:wow-demo` design step asserts one stage / specimen / dark direction for argan and parfum | PD74; PLA-§22.2 photos row, §O.5 |
| Q3.11 | UX-38 (minor) | design.md DES-§16.2 / §16.8; landing.md LAN-§3.6 | Remove the celebration aurora + grain and the thank-you `.lp-ty__aurora` colour moment (replace with a flat accent slab or a product-tinted single radial at ≤ 10 % alpha); delete the `adm-aurora` / `adm-grain` classes from the token generator; design's table row "celebration: the aurora + grain budget of one per screen" becomes "celebration: typographic (PLA-§22.16 item 4)" | PD64 rev 3; PLA-§22.16, §22.18 rule 4 |
| Q3.12 | OPS-13 (major) | landing.md (rule `landing:fee_mismatch` in `rules/landing.ts`, LP-16 timing); operations.md `opsAggregates(dims: city)`; storefront STO-§17.7 | P3 defines the rule's condition and text over `inputs.zones.feeMismatchTop5`; the review's recommendation (pull LP-16 into the R2 contract step, attached landings inherit the zone fee) is landing's and storefront's to decide | PD76; PLA-§6.3.1, §6.3.2 |
| Q3.13 | OPS-11 (major) | operations.md OPE-§2.9 / §5.5; landing.md LAN-§2.3 / §8.3 | `ops.callingWindow` is the one hours source; `callingWindowFor(scope)` is a P0 stub; `store.confirmation.hours` and `policies.contact.hours` become read-only mirrors or are dropped; ISO weekdays 1-7 everywhere | PLA-§22.10.1: P2 builds no hours field and links to Call center |
| Q3.14 | OPS-1 (blocker) | core §K.2 P0 stubs; landing.md LAN-§2.1 / §7.1; operations.md OPE-§10.1; storefront STO-§15.9 | One canonical `CityKey` slug; `delivery_zones.cities` and the zone tables store slugs; `zoneForCity(zones, key \| null)` maps `null` / "Autre" / unknown to the `*` zone; one shared `cityKey()`; parity tests in `test:delivery` and `test:catalog` | PLA-§7.15 (console city dimension keyed by `CityKey`, display through `cityLabel`) |
| Q3.15 | OPS-9 (major) | operations.md OPE-§12.8 / §19.9; core §D.2 0005 | Option (a): `orders.tracking_ref varchar(64)`, `orders.carrier_label varchar(60)` on 0005, pulled from the Sheets "Tracking" / "Transporteur" columns in R1, a "Carrier CSV" export under `shipments.write` | PLA-§7.4: the console drawer shows the two columns when present |
| Q3.16 | ENGP-24 (minor) | core §J.1 | State `npm test` ≤ 3 minutes; move the full design corpus, the 1,200-home catalog sweep and the 10,000 A/A simulations to `test:slow` / `qa:design-corpus` | PLA-§O.1 wall-time paragraph (this part's suites ≤ 20 s) |
| Q3.17 | OPS-20 (minor) | landing.md LAN-§14.3 | "Delete test orders" is `settings.write` (owner, admin), as OPE-§26 says; the landing wording `orders.edit` is the error | none (no platform text names the permission) |

### PLA-§Q.4 Requests raised by the round-2 review (rev 4)

What revision 4 could not close inside this file: the contradictions it found between core revision 3 and the other
parts while aligning, and the cross-file sides of the round-2 findings. Each row names the file and section, the exact
change and what this part already does meanwhile (nothing here blocks P1 / P2: every item has a default that keeps
this part's code building).

| # | Finding / alignment | File and section | Exact change asked | This part's side (done) |
|---|---|---|---|---|
| Q4.1 | CRIT15 (PD83) | core §C.6 `src/lib/urls/index.ts`; core §C.6 landing renderer context; design.md DES-§4.5.4 (footer section, P6); landing.md LAN-§3 legal / policy pages and the thank-you page (P3); storefront STO-§24 | Add `reportUrl(store: StoreAddress, pagePath?: string): string` = `platformOrigin() + "/report/" + handle + (pagePath ? "?p=" + encodeURIComponent(pathOnly(pagePath).slice(0, 300)) : "")`; add `reportHref` to the renderer's store context `{ base, origin, mediaOrigin, reportHref }`; P6's footer section renders "Report this store" from it on every landing page (no runtime bytes: plain server HTML), P3 on legal / policy pages and the thank-you page, S1 on the store chrome (R2, `footer.report` exists); each keeps the three texts under its own key (`landing.footer.report`); render-check fixtures per page kind assert the absolute link | PD83, PLA-§24.2 R1 slice, §O.4 step 21, §N.3 wording |
| Q4.2 | alignment D44 (PD82) | core §C.6 `consoleHref`; core §C.10 step 3 | `consoleHref(path)` returns `https://<ADMIN_HOST>/admin<path>` when `ADMIN_HOST` is set and the relative `/admin<path>` otherwise, so the tenant shell's "Platform console" item and staff links survive the move; §C.10 step 3 lists the app check V12 "console on its own host" | PLA-§16.3 V12, §14.3 allowlist line, PD36 item uses `consoleHref` |
| Q4.3 | alignment core §I.4 rev 3 (SEC-6) | core §I.4 notifications bullet | Widen the link rule to `^/app/[a-z0-9-]{3,30}(?:[/?#]\|$)` (the written `^/app/[a-z0-9-]{3,30}/` refuses the dashboard root `/app/<h>` that seven platform kinds and P4's order kinds link to), `^/app/account(?:[/?#]\|$)` for user-level kinds and `^/admin(?:[/?#]\|$)` for staff; a refused link is stored `NULL`, never rewritten | PLA-§18.1 link rule; until the core widens it the kinds use `/app/<h>/` |
| Q4.4 | alignment core §I.7 / D76 (PD78) | core §I.7 code block, D76, §C.7 | `getStoreHealth(scope): Promise<StoreHealthView \| null>` (null = not computed yet, as PLA-§6.3.4 has had since revision 1; the ring's "computing" state needs it) and the additive `StoreHealthView.staleAfterMin`; "a **nightly** health rule `platform:brand_term_live`" → "**at least nightly** (it runs on every health computation of the store)" | PLA-§2.2 type, §6.3.4, §13.3, §22.16 |
| Q4.5 | alignment core §I.7 (PD79) | core §I.7 flag-mapping comment and R1 rule list; operations.md OPE-§27.2 `int:sheets_backlog` | The comment "console flags … map onto the groups" becomes "console flags that mirror a track's issue are derived from it and add no points"; the R1 list names "no published page" as P3's `landing:no_live_page` only; P5's `int:sheets_backlog` uses the scaled threshold `max(15, 5 × ceil(activeSheetsStores / 16))` min of core §H.5 instead of a fixed 15 min, so the tenant issue and the staff alarm agree | PLA-§6.3.2 (P1's four issues only), §6.3.3 derived flags, §15.1 / §15.2 scaled threshold |
| Q4.6 | OPS-13 / CRIT1 follow-up (PD76) | landing.md LAN-§23.7 | Add the row `landing:fee_mismatch` (conversion, severity 1 / 3 points, `minN` 20 orders / 28 d, over `inputs.zones.feeMismatchTop5` keyed by `CityKey`, only for pages not on "Charge delivery by city", fix `settings/delivery`) that core §I.7 lists; keep its evidence metric (`fee_mismatch_cities`) distinct from operations' `fin:fee_gap` (`fee_gap_cities`, operations group), which compares the median charged fee with the zone fee or carrier rate | PLA-§6.1 input, §6.3.2 row |
| Q4.7 | alignment SEC-20 (PD81) | core §I.1 route table; core §K.1 T2 `deleteUserAccount` | List `/app/account/danger` (P2, R1) in §I.1; state the staff form of the frozen signature: `deleteUserAccount(ctx: UserCtx \| PlatformCtx, target?: { userId: string; reason: string }): Promise<void>` with the refusals `owns_store` (an owner of a non-purged store) and `is_staff` (a platform role is set), so P1's `deleteUserAction` and P2's `deleteMyAccountAction` call one function | PLA-§11.2 action, §22.5 page, §M.1, §O.2 case 16 |
| Q4.8 | alignment core §B.7 (PD80) | core §B.7, §E.2 | `stepUpWithPasswordAction(password): Promise<ActionResult<{ until: string }>>` (the same result shape as `stepUpAction`), refused under impersonation (`impersonation_read_only`); `StoreCtx` exposes `stepUpUntil` like `PlatformCtx` so the tenant sheet can show "Verified · 4:12" | PLA-§14.2 tenant variant, §22.12 `StepUpSheet.method` |
| Q4.9 | alignment core §H.5 (PD78) | core §H.5 alarm list | Name the codes this part relays: `data_dir_70` / `data_dir_85` (they replace `disk_low`), `health_job_slow`, and restate "`store_health` snapshots stale > 60 min" as "stale beyond `max(staleAlarmMinutes, 1.5 × cycleMin)`" so the alarm does not fire permanently past ≈ 120 active stores | PLA-§15.1, §15.2 |
| Q4.10 | OPS-15 / OPS-9 follow-up | operations.md OPE-§M (P0 read stubs); storefront STO-§16.4 | `ConsoleOrderRow` / `getOrderForConsole` carry `pageId: string \| null`, `lines?: { title; options; qty; totalMinor }[]` for payload v3 (R2 contract step), `carrierLabel`, `trackingRef` and `carrierExportedAt` (D74, R1) | PLA-§7.4 renders them |
| Q4.11 | ai.md R38 (SEC-26) | ai.md AI-§S.3 R38 | Accepted on the platform side; `aiUsageForStore(scope, month)` returns `creditsUsed`, `creditsLimit` (the pending cap while `pending`) and `costMicros`, which the queue chip reads | PLA-§3.5 draft-evidence chip |

---

## PLA-§R. Review decisions

(Empty in revisions 1 and 2.) **Round 2 (rev 4)** is below the round-1 table: one line per round-2 finding id, then
the alignment with core revision 3. **Round 1 (rev 3):** one line per finding id that named this file or was marked "cross".
Decision codes: **resolved** (the body changed; the section is named), **resolved (platform side)** (this part's side
is in the body, the rest is a PLA-§Q.3 request to the named file), **not applicable** (no platform.md text is involved;
the owner of the finding is named; nothing to change here). Severity is the reviewer's.

### Review decisions (round 1)

| Finding | Severity | Decision | How / where |
|---|---|---|---|
| OPS-1 | blocker (cross) | resolved (platform side) | PLA-§7.15: the console's city dimension is keyed by the canonical `CityKey` slug of OPE-§10.1 and rendered through `cityLabel`; no console code compares a city by spelling. The canonical key, `zoneForCity(null → *)`, the shared `cityKey()` and the parity tests are landing / operations / storefront / core (PLA-§Q.3 Q3.14). |
| OPS-9 | major (cross) | resolved (platform side) | PLA-§7.4: the console order drawer shows `orders.carrier_label` and `orders.tracking_ref` when present (option (a) of the finding). The Sheets columns, the 0005 columns and the Carrier CSV export are operations / core (Q3.15). |
| OPS-11 | major (cross) | resolved (platform side) | PLA-§22.10.1: P2 builds no hours field on General or Market; the one source is `ops.callingWindow` through `callingWindowFor(scope)`, and General links to Call center. The stub, the mirrors and the ISO weekday rule are operations / landing / core (Q3.13). |
| OPS-13 | major (cross) | resolved (platform side) | PD76; PLA-§6.3.1 `zones.feeMismatchTop5` input (P1) and the §6.3.2 row for P3's rule `landing:fee_mismatch` (severity 1, conversion). LP-16's timing and the attached-landing fee rule are landing / storefront (Q3.12). |
| OPS-14 | major (cross) | resolved | PD60 (rev 3) and PLA-§22.2 mode table: in `store` mode the reveal is the product page built synchronously by `productAsPageDoc`, `useDirectionAction` creates the product and the theme draft, no landing page exists, `landing.inStoreMode` stays `false`; `onboarding.firstKind` / `productId` (PLA-§2.4); UX-01 acceptance gains the case; `onboarding.reveal.saved_product` text. Storefront's `createProduct` / `setThemeDraft` / direction-aware `productAsPageDoc` are Q3.8. |
| OPS-15 | major (cross) | not applicable | The manual-order sheet, `createManualOrderV3` / `editOrderV3` and the `test:ops-db` parity case are operations / storefront (S1, P4 / S3); the console only reads orders through `listOrdersForConsole`, which is shape-agnostic. |
| OPS-20 | minor (cross) | not applicable | No platform.md text names the "Delete test orders" permission; landing.md LAN-§14.3 must read `settings.write` as OPE-§26 does (recorded as Q3.17 for the landing architect). |
| OPS-31 | minor (platform) | resolved | PD72; new PLA-§22.1.5 `modeSummary(mode)` + `ModeCards` (one line, three "you get" bullets, "You can change this later; nothing is deleted"), used by `/signup`, `/app/new`, onboarding and the mode-switch sheet (PLA-§22.1 step 2, §22.10.1); twelve reference texts in ar / fr / en (PLA-§N.3); `test:platform` asserts the bullets agree with `modeAllows`. |
| ENGC-1 | blocker (cross) | resolved (platform side) | PLA-§2 intro: this part reads `orders.is_test` and `page_slug_history` wherever the core places them and the Orders tile's filter is a no-op when the column is absent; the 0004 move (or the P3-wave-1 alternative) is the core's (Q3.7). |
| ENGC-8 | major (cross) | resolved | PLA-§P.2 globs made disjoint (`(public)/**` except `invite/staff/**`, `report/**`, `kit/**`; `team/**` except `team/{agents,callcenter}/**`; `settings/audit/**` added to P2); PLA-§P.1 states `src/lib/settings/keys/platform.ts` is P1's; PD75 and new PLA-§22.10.6 give `settings/audit` an owner and a spec. The core §K.2 row text, `src/lib/security/selftest.ts` → T3 and the P0 glob-intersection script are Q3.6. |
| ENGC-13 | major (cross) | not applicable | `createOrderRow` extraction in R1.0 (T3) and OPE-§11.1's manual insert are core / operations; the console never inserts orders. |
| ENGP-1 | blocker (cross) | not applicable | The StorePageDoc branch of the publish gates (`gateInputFor`, utility kinds never pooled, `checkFold` over `estimateHeights`) is design / storefront / landing / core; the console's draft-evidence chips (PLA-§3.5) read `designHealth(scope)` and `buildChecklist` for landing docs only and show "No page yet" otherwise. |
| ENGP-3 | major (cross) | not applicable | `aj_active_uq` is core §D.5 / ai.md; the console only displays `ai_jobs` state (PLA-§7.3 strip 7, §15.1). |
| ENGP-6 | major (cross) | not applicable | The calibrated error band on C2 / C3 / F1 and the heights fixture are core §M.2 / design; the console shows gate refusals as counts only (PLA-§12.2). |
| ENGP-24 | minor (cross) | resolved (platform side) | PLA-§O.1 wall-time paragraph: this part's `npm test` suites finish in ≤ 20 s together, the monotonic property runs on 40 fixture issues with a seeded RNG, nothing renders React or reads the DB; the ≤ 3 min ceiling and the `test:slow` move are core §J.1 (Q3.16). |
| ENGP-26 | minor (cross) | not applicable | The landing chunk's re-measured size and hash after T3's storage-key prefix are core §K.1 / storefront STO-§14.1; nothing of this part touches `src/landing/runtime/**`. |
| UX-4 | major (cross) | not applicable | The sticky / header-CTA CSS hooks, `data-hero-cta` and the V27 gate are design / landing. |
| UX-20 | major (cross) | resolved | PD73; PLA-§22.2 reveal row rewritten (mobile: direction 1 edge-to-edge, snap carousel with an 8 % peek, DNA bottom sheet, sticky primary; desktop: three equal folds ≤ 440 px, hover / focus expands; motion kept); acceptance in §22.2, §O.4 step 15 and §O.5. design.md DES-§14.3 must follow (Q3.9). |
| UX-21 | major (cross) | not applicable | The commerce register's G2 clamp vs the PDP family pool is design / storefront. |
| UX-31 | minor (cross) | not applicable | `checkout.addressMode` is landing's `checkout` key and the store checkout is storefront's; the console shows `maskAddress` whatever the mode. |
| UX-37 | minor (cross) | resolved (platform side) | PLA-§22.1 touch ergonomics for every P2 form (inputs 52-56 px, 16 px text, 12 px gap, label 13 / 500, error summary scrolled into view, primary reachable with the keyboard closed) and PLA-§22.18 rule 6; the landing form (OF4) and the store checkout keep their own contracts in landing / storefront. |
| UX-38 | minor (cross) | resolved | PD64 (rev 3): aurora + grain removed from the admin entirely, the celebration becomes a typographic moment (PLA-§22.16 item 4), `adm-aurora` / `adm-grain` deleted and linted everywhere (PLA-§22.18 rule 4, §4.7 rule 4); `health.celebrate` text. The thank-you `.lp-ty__aurora` and design's empty-state row are landing / design (Q3.11). |
| UX-39 | major (cross) | resolved (platform side) | PD74; PLA-§22.2 photos row: P6's browser `estimateAlpha` runs in the photos step, `hasCutout: "estimated"` reaches the generator, the `render_jobs` reason `cutout` upgrades the hero later; `qa:wow-demo` asserts one stage / specimen / dark direction for argan and parfum (PLA-§O.5); UX-01 acceptance gains the no-model-file assertion. The estimate, H13 / H27 and the enum value are design / core / ai (Q3.10). |
| SEC-1 | blocker (cross) | resolved | PD68; PLA-§3.1 (Turnstile required in `approval` / `open`, the daily ceiling and waitlist fallback), §3.2 (ceilings card, honest Turnstile line), §3.4.1 (the two flags scored in `invite` only), §3.6 (two-tier media cap, shared disk budget charged before the store gauge, refund on transition, the AI slice, acceptance), §2.4 (three keys), §5.3 / §15.1 / §15.2 (rows, meters, alarms), §13.2, §18.2 (`staff.signup_capped`), §L, §M.5 counters, §O.2 case 13, §O.3 cases 13-14, §O.4 step 17, §O.5. The core's `signupAction` / `applyStateCap` / upload route changes and ai.md's `pendingSharePct` are Q3.1 / Q3.2. |
| SEC-5 | major (cross) | resolved | PD69; PLA-§7.2 exports `maskCustomerFields` / `maskIfImpersonation` for the repositories; §10.1 start-sheet line, §10.2 masked surfaces and the ribbon line, §10.3 notification sentence and acceptance; §18.2 body text; §N.3 texts; §O.2 case 14, §O.3 case 15, §O.5 persona 2. `StoreScope.kind = "impersonation"` and the repository calls are core / operations (Q3.3). |
| SEC-13 | minor (platform) | resolved | PD71; PLA-§22.1: `__Host-sgl` (Secure, Path=/, no Domain, SameSite=Lax, 1 year), `z.enum` validation on read and before `users.locale`, duplicate cookies → the host-only one, every platform cookie `__Host-`; §L, §O.1 parser fixtures, §O.3 case 18, §O.4 step 18. The core §C.9 row and `qa:edge-sim` assertion are Q3.5. |
| SEC-18 | minor (cross; raised to R1 scope here) | resolved | PD70; PLA-§13.3 live brand guard (`checkBrandTerms` at every write with `brand_protected`, the health rule `platform:brand_term_live` with the weekly `staff.alarm`, the publish gate named), §3.7 (second tenant-callable function), §6.3.1 / §6.3.3 inputs and flags, §5.3 rows, §7.3 strip 9, §22.10.1 `saveGeneralAction`, §24.2 R1 report slice (`/report/<handle>`, `recordAbuseReport`, no oracle, staff notification), §2.2 `abuse_reports` in 0005, §15.2 alarms, §18.2 kinds, §L, §M.1-M.5, §N keys, §O.2 case 15, §O.3 case 17, §O.4 step 16, §P.1 / §P.3 files. The footer link (P3 / S1), the `honesty:password_field` gate (P3), the registry move and the proxy rule are Q3.4. |
| QUAL-1 | blocker (cross) | not applicable | The N8 shingle gate and the copy library are design / ai; the console displays the Design check chips only. |
| QUAL-9 | major (cross) | not applicable | Director repair acceptance (Q) is ai / design. |
| QUAL-10 | major (cross) | not applicable | Gene hint pinning is design / ai. |
| QUAL-20 | major (cross) | not applicable | `nicheShares` seq4 / tells are design. |
| QUAL-21 | major (cross) | not applicable | Rubric v3 typography text is ai / design. |
| QUAL-25 | minor (cross) | not applicable | `GenomeCard` / `RepairOp` / `design.plan` contract drift is ai / design. |

Totals: 31 findings named this file or were cross; **15 resolved** in the body (5 of them wholly inside this part:
OPS-14, OPS-31, UX-20, UX-38, SEC-13; the rest with a platform side here and the remainder requested in PLA-§Q.3),
**16 not applicable** (no platform.md text involved; the owning part is named). Every blocker and major with a
platform side (OPS-1, OPS-9, OPS-11, OPS-13, OPS-14, ENGC-1, ENGC-8, UX-20, UX-39, SEC-1, SEC-5) is resolved in a
section, not only in this table; no finding was rejected on the merits.

### Review decisions (round 2)

Round 2 re-sent the round-1 findings against the revision-3 parts and core revision 3, plus the critic's findings
(CRIT-*). For each id the question was: is the platform side still resolved **and consistent with how core revision
3 decided it** (core §P, §Q.8)? Codes as in round 1; **re-verified** = the revision-3 resolution stands and was checked
against the core's decision; **aligned** = the body changed in revision 4 to match the core. Every blocker and major
with a platform side is resolved in a section named in the row.

| Finding | Severity | Decision (round 2) | How / where (rev 4) |
|---|---|---|---|
| OPS-1 | blocker (cross) | resolved (platform side), re-verified against core D68 | The console's city dimension (PLA-§7.15) and P1's health input `zones.feeMismatchTop5` (PLA-§6.3.1, PD76 rev 4) are keyed by the canonical `CityKey` slug of D68; `null` (Autre / unknown) maps to the `*` zone and never becomes an input row; display goes through `cityLabel`. The browser zone-table shape (CRIT1) and the parity fixture are core / landing / storefront's; no platform code reads a `ZoneTable`. |
| OPS-9 | major (cross) | resolved (platform side), aligned with D74 | PLA-§7.4: the console drawer shows `carrier_label`, `tracking_ref` and (rev 4) "Sent to the carrier file on <date>" from `orders.carrier_exported`; PLA-§Q.4 Q4.10 asks the P0 read stub to carry the three fields. The Sheets columns and the Carrier CSV are operations'. |
| OPS-11 | major (cross) | resolved (platform side), re-verified against D73 | PLA-§22.10.1 builds no hours field and links to Call center; core D73 **removed** `store.confirmation.hours` and `policies.contact.hours`, and no platform text reads either (checked by search over this file); `platform.brand.supportHours` is Store Gen's own support hours on the Help sheet, not a store promise. The window's shape (CRIT3) is operations'. |
| OPS-13 | major (cross) | resolved (platform side), aligned with D75 | PD76 rev 4: the fee-mismatch input is computed only for pages not on "Charge delivery by city" (LP-16 is R2, D75) and keyed by `CityKey`; PLA-§6.3.2 row; PLA-§Q.4 Q4.6 asks LAN-§23.7 to list `landing:fee_mismatch`, which core §I.7 names but landing's table lacks, with an evidence metric distinct from operations' `fin:fee_gap`. |
| OPS-14 | major (cross) | resolved, aligned with core §A.2 rev 3 (LAN R5 A\*) | PD60 rev 4 and PLA-§22.2: store mode creates no landing page (rev 3) **and** the fallback is fixed: any path that creates one sets `landing.inStoreMode = true` in the same transaction with `onboarding.reveal.saved_sales_page`; store / both need `stores.category` before the reveal (`category_required`); the mode-switch sheet calls `landingModeSwitchPlan` first (PLA-§22.10.1); UX-01 acceptance carries both cases. |
| OPS-15 | major (cross) | resolved (platform side) | PLA-§7.4 rev 4: payload v3 orders render with "Store checkout" for the null page, their lines in the drawer and the `source` chip of S1's `createManualOrderV3` orders; PLA-§Q.4 Q4.10. The v3 functions are S1's (core §K.4, §P). |
| OPS-20 | minor (cross) | not applicable | Landing fixed LAN-§14.3 to `settings.write` (core §P); no platform text names the permission. |
| OPS-31 | minor (platform) | resolved (rev 3), re-verified | PD72 and PLA-§22.1.5 stand; rev 4 adds the `landingModeSwitchPlan` preview and the category chips to the same mode-switch sheet that reuses `ModeCards` (PLA-§22.10.1). |
| ENGC-1 | blocker (cross) | resolved, aligned (core rev 3 cut the columns in 0004) | PLA-§2 intro rev 4: `orders.is_test`, `leads.is_test`, `orders_store_test_idx` and `page_slug_history` are in 0004, so the Orders tile, the heartbeat and the Identity strip read them from R1.0; the "no-op when absent" hedge covers stale fixtures only. |
| ENGC-8 | major (cross) | resolved, aligned with the core §K.2 rows | PLA-§P.1 now uses the core P1 glob (`src/app/admin/**` except `(auth)/setup/**` and `(console)/ai/**`) and adds `scripts/qa/tenancy-cases/platform.ts`; PLA-§P.2 claims the six i18n files only; the core's `test:ownership` parses both lists. |
| ENGC-13 | major (cross) | not applicable | Core D72: `createOrderRow` extracted by T3 in R1.0; the console never inserts orders. |
| ENGP-1 | blocker (cross) | not applicable (core / design resolved it); platform note added | PLA-§3.5 rev 4: for a `store`-mode pending store the draft-evidence chips read the first product page draft through `designHealth(scope)`, which accepts store kinds from the R2 contract step (`gateInputFor`, core §M.1). |
| ENGP-3 | major (cross) | not applicable | `aj_active_uq` on `active` is core §D.5 / ai.md; the console only displays `ai_jobs` state. |
| ENGP-6 | major (cross) | not applicable | The calibrated bands are core §M.2 / design; the console shows gate refusals as counts and reuses each `GateItem.title` (which carries the "estimated" wording) verbatim. |
| ENGP-24 | minor (cross) | resolved (platform side), re-verified | PLA-§O.1: this part's suites ≤ 20 s, equal to the platform share core §J.1 rev 3 sets; the new rev 4 selftests (`FEATURE_PROOFS`, link rule, `reportUrl`) are pure and add < 100 ms. |
| ENGP-26 | minor (cross) | not applicable | Nothing of this part touches `src/landing/runtime/**`; the report link (PD83) is server-rendered footer HTML with no runtime bytes. |
| UX-4 | major (cross) | not applicable | The CTA hooks and V27 are design / landing. |
| UX-20 | major (cross) | resolved (rev 3), re-verified (core §P "Parts") | PD73 and the PLA-§22.2 reveal row stand; design.md DES-§14.3 accepted the layout. |
| UX-21 | major (cross) | not applicable | Design / storefront. |
| UX-31 | minor (cross) | not applicable | `checkout.addressMode` is landing's key (core §D.10); the console masks the address whatever the mode. |
| UX-37 | minor (cross) | resolved (platform side), re-verified | PLA-§22.1 touch ergonomics and PLA-§22.18 rule 6 apply to P2's forms; landing rejected the sticky submit for the order form with a reason (core §P) and this part does not impose it on landing. |
| UX-38 | minor (cross) | resolved (rev 3), re-verified (core D60 rev 3 agrees) | PD64 rev 3, PLA-§22.16 item 4, §22.18 rule 4. |
| UX-39 | major (cross) | resolved (platform side), re-verified | PD74 stands; core §K.2 P6 now freezes `estimateAlpha` as P6's stub and core §D.5 / §H.3 append the `render_jobs.reason` `cutout`, exactly as PLA-§22.2's photos row calls them. |
| SEC-1 | blocker (cross) | resolved, aligned with core D69 / §B.2 / §A.5.2 | PD68 rev 4, PLA-§3.1 (charge at step 6 **before** the transaction, counted whenever the store would start `pending` incl. invite codes without `auto_approve`, refunded with `refundPlatformUsage` when step 7 rolls back), §3.6 (`refundPlatformUsage` on the media budget, `quota_platform_pending`, the 10-credit floor), §5.3 / §15.1 / §15.2 (`signup_capped`, 80 / 95 %), §22.8 (the error code's UI), §O.2 case 18. |
| SEC-5 | major (cross) | resolved, aligned with D70 / D71 | PD69 and PLA-§7.2 match core D70 and the `maskIfImpersonation` / `maskCustomerFields` P0 stubs; PD2 rev 4 states `platformScope()` is not a `WriteScope` (D71). |
| SEC-13 | minor (platform) | resolved (rev 3), aligned | PD71 stands (core §C.9 adopted `__Host-sgl` and the prefix rule); PD12 rev 4: `__Host-sgd` is set by T3's proxy, not T2. |
| SEC-18 | minor (cross) | resolved, aligned with D76 / §Q.8 PLA Q3.4 A\* | PD70 rev 4 and PLA-§13.3: the core's one-field `checkBrandTerms(kind, value)` with `brandMatches` internal; PLA-§24.2 / §M.2 / §L / §M.5: the report link is absolute, store hosts answer 404 (not 308), `Referrer-Policy: same-origin`, buckets 5/h and 20/day; PD83 names the renderers (CRIT15). |
| QUAL-1 | blocker (cross) | not applicable | Core §M.4 / design / ai. |
| QUAL-9 | major (cross) | not applicable | Ai / design. |
| QUAL-10 | major (cross) | not applicable | Design / ai. |
| QUAL-20 | major (cross) | not applicable | Design. |
| QUAL-21 | major (cross) | not applicable | Ai / design. |
| QUAL-25 | minor (cross) | not applicable | Design / ai (core §K.2 P0 design stubs). |
| CRIT1 | major (cross) | not applicable | No platform code reads the `lp-assist` / `#sg-config` zone tables or calls `zonesForCheckout` for display; P1's health input only consumes the fee per `CityKey` from it, whatever shape the browser table takes. The shape decision is core D68 / landing / storefront's. |
| CRIT3 | major (cross) | not applicable | No platform code reads `ops.callingWindow` or `callingWindowFor`; the Today brief's call counts come from `opsPulse`; the shape (`Record<1..7, Range[]>` vs a 7-slot array) and `EffectiveWindow` are operations' and landing's. |
| CRIT6 | minor (platform) | resolved | PLA-§P.1: the exclusion reads `src/app/admin/(console)/ai/**` (P7), with P1's glob written as the core §K.2 P1 row writes it. |
| CRIT7 | minor (platform) | resolved | PLA-§P.2: `src/lib/i18n/admin/<locale>/{shell,auth,onboarding,team,health,brief}.ts` only; the base catalogs and `index.ts` stay the maintainer's (D67); PLA-§N.1 moves P1's health sentences to `notify.ts` and P2's to `shell.ts`. |
| CRIT15 | minor (cross) | resolved (platform side) | PD83 (one `reportUrl` contract, renderers named: P6's landing footer, P3's legal / policy and thank-you pages, S1's store chrome), PLA-§24.2, §O.4 step 21; PLA-§Q.4 Q4.1 asks core §C.6, design.md and landing.md for the builder, the context field and the rendering. |
| CRIT17 | minor (cross) | resolved (platform side) | PD77: a **Proven by** column in every PLA-§1 table (61 rows), PL-04, PL-10, PL-11 and PL-13 rewritten as checkable statements, `FEATURE_PROOFS` asserted by `test:platform`; the rows that had no proof gained one (`test:db` cases 16-20 for TN-06, TN-13, OS-06, OS-09, OS-10, SE-04; e2e steps 19-21 for PL-09 and the report link). The other parts' maps are theirs. |

Totals (round 2): 39 findings; **22 resolved** (4 wholly inside this file: OPS-31, SEC-13, CRIT6, CRIT7; 18 with this
part's side in the body and the rest requested in PLA-§Q.4; the body changed in revision 4 for 14 of the 22: OPS-9,
OPS-13, OPS-14, OPS-15, ENGC-1, ENGC-8, SEC-1, SEC-5, SEC-13, SEC-18, CRIT6, CRIT7, CRIT15, CRIT17), **17 not
applicable** (no platform text involved; the owning part is named). No finding rejected. Every blocker and major with
a platform side (OPS-1, OPS-9, OPS-11, OPS-13, OPS-14, OPS-15, ENGC-1, ENGC-8, UX-20, UX-39, SEC-1, SEC-5) is
resolved in a named section.

### Alignment with core revision 3 (rev 4; contradictions found while re-reading the core, not reviewer findings)

| # | Core source | What revision 3 of this part said | Revision 4 (section) |
|---|---|---|---|
| A1 | §I.7 rev 3 (ENGC-25) | `platform.health` "up to 200 stores per tick", "≤ 60 min otherwise", a fixed 60-min stale alarm, "within an hour" in tenant copy | budget-driven, measured `cycleMin`, scaled stale rule, "Checked at" copy (PD78, §6.3.4, §6.3.5, §15.1, §15.2, §22.16, §L, §M.4, §O.2) |
| A2 | §I.7 rule list, OPE-§27.2, LAN-§23.7, DES-§2.10 | P1 duplicates of P5's integrations rules, P2's duplicate of P3's "no live page", stale rule ids | one condition one issue, derived flags, owners' ids (PD42 rev 4, PD79, §6.3.2, §6.3.3, §22.2, §N.2) |
| A3 | D67, §I.5 | P1's tenant health sentences in P2's `health.ts`; P2 claiming `src/lib/i18n/**` | `notify.ts` (P1), `shell.ts` (P2), six P2 files only (PD53 rev 4, §N.1, §P.1, §P.2) |
| A4 | §K.2 P0, §C.7, D76 | `checkBrandTerms(fields[], opts) → BrandCheck` | the frozen `checkBrandTerms(kind, value) → "ok" \| "near" \| "exact"` + internal `brandMatches` (PD70 rev 4, §13.3, §22.10.1, §L) |
| A5 | §B.1, §C.4, §E.8, §Q.8 PLA Q3.4 | `/report` 308 from store hosts, `no-referrer`, 5/day and 50/day | 404 on store hosts, absolute link, `same-origin`, 5/h and 20/day (PD70, PD83, §24.2, §M.2, §M.5, §L, §O.4) |
| A6 | §B.1, §B.5 rev 3 (ENGC-16, SEC-24) | `no-referrer` on `/invite/*` and `/invite/staff/*`; acceptance not stated as compare-and-set | `same-origin`; one conditional `UPDATE` (§14.1, §22.1.4, §M.2, §O.2 case 20, §O.4 step 8) |
| A7 | §B.7 rev 3 (SEC-17) | tenant step-up "when the user has TOTP" | the ladder for every user, password variant, role changes to admin / owner (PD80, §14.2, §22.4, §22.8, §22.11, §22.12, §M.1, §O.2 case 17, §O.4 step 19) |
| A8 | §F.9 rev 3 (SEC-20), §K.2 P1 row | no account deletion | staff and self-service paths (PD81, §11.2, §22.5, §M.1, §M.3, §O.2 case 16, §O.3 case 20, §O.4 step 20) |
| A9 | D44 rev 3, §C.10 (SEC-2, ENGC-26, SEC-14) | "env full replace + rebuild (19 keys)", no `ADMIN_HOST` | `ADMIN_HOST`, restart not rebuild, the allowlist check, V12 (PD82, §14.3, §16.1, §16.3) |
| A10 | §H.5 rev 3 | `disk_low` (< 2 GiB), fixed 15-min Sheets alarm, no pool / tick / gate / bad-key alarms | `data_dir_70/85`, the scaled Sheets threshold, `pool_wait`, `tick_lag`, `gate_mismatch`, `edge_bad_key` (§5.3, §15.1, §15.2) |
| A11 | §I.4 rev 3 (SEC-6) | free `link` strings on notifications | the link rule, `legal.updated` link (§18.1, §18.2, §O.1, §O.3 case 20; Q4.3) |
| A12 | §I.7 code block | `getStoreHealth` returning `StoreHealthView \| null` here, non-null in the core | kept `\| null` with `staleAfterMin` and asked the core (§2.2, Q4.4) |
| A13 | D69, §B.2 step 6, §A.5.2, §A.4 | the charge "inside the transaction", invite mode uncounted, `quota_platform`, floor unstated, 100 % red, `signup_cap_reached` | step 6 before step 7, counted whenever pending, `refundPlatformUsage`, `quota_platform_pending`, 10-credit floor, 95 % red, `signup_capped` (PD68 rev 4, §3.1, §3.6, §5.3, §15.1, §15.2, §22.8) |
| A14 | §B.1 rev 3 (SEC-12) | `__Host-sgd` "written by T2" | set by T3's proxy (PD12) |
| A15 | §A.2 rev 3 (LAN R5 A\*, ENGP-25) | no `inStoreMode` fallback, no category requirement, no `landingModeSwitchPlan` in the switch sheet | all three (PD60, §22.2, §22.10.1) |
| A16 | §Q.8 AI R38 | queue detail without the sandbox's AI use | the AI chip (§3.5) |
| A17 | this file (§3.6 vs §22.7) | review card "upload up to 100 MB" while the cap is 20 MB before submit | `{mediaMb}` text (§22.7) |
| A18 | §K.1 T4, §K.2 P1 row | attack cases "added to `tenancy-check.ts`" (T4's file) | `scripts/qa/tenancy-cases/platform.ts` (P1) (§O.3, §P.1) |
| A19 | §K.2 P1 row | P1 glob `src/app/admin/(console)/**` | `src/app/admin/**` except setup and `(console)/ai/**` (§P.1) |
| A20 | §E.2 rev 3 (SEC-7) | private preview links not revocable | Revoke + `revokePreviewLinkAction` (§22.7, §M.1, §L, §O.3 case 19) |
| A21 | §C.7 rev 3 (ENGC-30) | rename "once per 30 days" only | the one-time `freeRename` grant for store #1 (§22.10.2) |
| A22 | §K.4 (OPS-15), STO-§16.4 | the console assumed every order has a page | v3 rendering (§7.4) |
| A23 | D71 | `platformScope` typed only as `StoreScope` in PD2's wording | not a `WriteScope` (PD2) |

### Critic round 2 (revision 5)

The final critic's issues that name this file, applied against core revision 5 (core §P.3 holds the same lines). One
line per id: what changed, where.

- **CRIT2-6** (major): P2 mounts the core §K.2 P0 stub of `RevealFolds` (P2 merges before P6); the reveal measurements
  and the onboarding timing are proven at the R1 integration, P2's own merge asserts only the step's flow and
  `reportRevealAction`. Where: PLA-§22.2 reveal row, §O.4 items 2 and 15.
- **CRIT2-13** (minor): `approval` / `open` need a configured `platform_turnstile` (the default stays `invite` until then;
  `savePlatformSettingsAction` refuses with `turnstile_required`; a widget removed later falls back to `invite` with
  `signup_unguarded`); the Domains page gains **V13** "human check ready". Where: PLA-§3.1 mode table, §16.3.
- **CRIT2-14** (minor): core §Q.9's platform notes applied: `store.brand_term.refused` (not `store.brand_refused`),
  `links.report` / `PageLinks.report` (not `reportHref`), the committed `scripts/qa/e2e/{pulse,admin-perf}.ts` in P2's
  list (no "steps under `qa/e2e`"), no claim on the health registry's import lines (maintainer, P0), `createProduct(ctx,
  { facts })` / `setThemeDraft(ctx, direction)`. Where: PLA-§13.3, §22.2 `useDirectionAction`, §24.2, §M.1, §M.3, §O.2,
  §O.4 items 10-11, §P.1, §P.2, §Q.3 Q3.8.
- **CRIT2-18** (minor): the console's `tick.skipped24h` counts ticks skipped by the tick lease (core §H.2: a
  `cron_cursors` lease row replaced `platformLock("tick")`). Where: PLA-§15.1 Cron panel.
- **CRIT2-19** (minor): the non-existent `qa:e2e` is `test:e2e`. Where: PLA-§22.2 (store-mode onboarding note).

### Wording tidy (revision 6)

The confirming critic's wording minors that name this file (drift only, no decision changed; core §P.4 holds the same
items as W1 … W10). One line per item: what changed, where.

- **W4**: the alarm catalogue lists `signup_unguarded` (rev 6 entry) and names the refusal code `turnstile_required`
  next to it. Where: PLA-§15.2.
- **W5**: one signup-default rule with core D9 / §B.2 / §C.10: `invite` until V13 passes (a configured
  `platform_turnstile`, the new hostnames, a verified test token), then `approval`. Where: PLA-§3.1 `approval` row,
  PLA-§16.3 banner sentence.

---

## PLA-§S. Elevation changes (rev 2)

Every change of this revision, what it does and where it came from. Codes: **D** = core §0 decision, **Q** = core
§Q.1 decision on a revision-1 request of this part, **RF** = rethink-features section, **RA** = rethink-ai section,
**DB** = design-baseline target, **B16** = owner brief item 16 (this pass). Nothing was removed: every revision-1
section is still present, re-cut where the core decided otherwise.

| # | Change | Why | Source |
|---|---|---|---|
| 1 | Status → revision 2 on core revision 2 (D1 … D64); inputs widened to RF, RA, DB and the anti-slop rubric with the owner rules winning; reading order and section map extended (§4.7, §6.3, §22.16-22.18, §S) | B16 asked to rethink every part; the core's appendix decided the requests, so the spec must cite the core, not the request | header; core §Q.1 |
| 2 | Owner summary items 13-18 (health ring, explainable approvals, lifecycle preview, the "every detail" Overview, machinery in health, no-download first result and the demo) | the owner reads this first | B16; RF §4 |
| 3 | PD4 reveal budget = the demo clock; PD59 no model download on the critical path; §22.2 rewritten with the clock budgets, the background refinement and the mobile-data rule for the consent card | 99.5 + 111 MB on 4G is 1-3 minutes; the reveal is at 0:50 | D59; RF §3.4, §4 |
| 4 | PD6, PD42, PD53, PD66, PD67 and §6.3 rewritten: one Store Health engine for two audiences, seven groups with caps summing to 100, severity → points, issues with evidence `n` and one fix, rules per track with `minN`, console flags produced by `rules/platform.ts`, snoozes audited, `health.issue_new`, the `platform.health` job in slot 9, `getStoreHealth` / `markHealthDirty` / `snoozeHealthIssue` / `requestHealthRecompute` | PL-18 raised to a tenant feature; one computation, one number; the setup checklist removed | D53; Q.1 (A*), Q.18 (A*); RF §1.3, §3.2; core §I.7 |
| 5 | §2.2 `store_health` columns = core §D.5 (`issues`, `components` by `HealthGroup`, `snoozed`); `staff_invites` added as a core table; `HealthComponent` replaced by `HealthGroup`; `StoreHealthView` | the maintainer cuts 0005 from this list | Q.1, Q.4, Q.24; core §D.5 |
| 6 | §2.4 `platform.health.*` and `platform.lifecycle.*` tunables (additive, Q.28 paths kept) | the owner tunes the engine and the arm window without a deploy | PD54, PD67; Q.28 |
| 7 | PD52 explainable risk: `explainBand()` counterfactual, hold-class line, draft evidence (Design check, honesty items, novelty band) in the queue detail; acceptance adds the fixture agreement and the demo budgets | B16: "approvals queue with explainable risk" | B16; RF §4 1:25; D64 (bands only) |
| 8 | PD65 approval latency as a demo pass condition (row ≤ 15 s, `A` ≤ 1 s, unlock ≤ 15 s) | the owner's one-key approval is in the acceptance scenario | RF §4; core §K.2 criterion 12 |
| 9 | PD51 and new §4.7: the admin UX ceiling applied to the console with budgets and tests; §4.5 honest statuses and stale indicators; `ConsolePulse` gains `impersonation`, `health`, `renders` | the console must reach the Linear / Vercel / Stripe bar in testable rules | RF §2.1, §0.4; core §I.8; D60 |
| 10 | §5.2 Orders 24 h tile excludes test orders and shows confirmed / risky; §5.5 System block shows the render queue, the Worker, AI and the health engine | honest tiles; the machinery visible from the overview | D54; PD57 |
| 11 | PD32, PD55 and §7 re-cut: 6 R1 tabs (Overview, Orders, Team, Activity + Timeline view, Usage & plan, Notes); the Overview as the "every detail" view with ten strips over the P0 read APIs; Catalog & pages, Integrations health, Domains, Risk, Media deferred to R2 (S6) with honest "Arrives with R2" pages; Timeline folded into Activity; acceptance updated | the rethink cut the deep tabs to pay for SF-03 and the owner still wanted every detail on one screen | RF §3.3; core §I.2, §L.2 PL-07; B16 "every detail view with masked PII" |
| 12 | PD54 and new §8.0: lifecycle safety = preview (`lifecyclePreview`, the store-facing text in the store's locale, the consequences count, what will be written), a 5 s arm window, a 10 min cooldown with the typed handle; §8.1 names `transitionStore`'s single notification; acceptance adds preview = effect, cancel writes nothing, cooldown server-side | B16: "lifecycle safety"; one notification per edge | core §A.5.1, Q.27; B16 |
| 13 | PD58 and §9.2: plans editor explains every row three ways, impact preview with per-store examples and a diff, the rev 2 keys with release chips | B16: "plans editor"; a limit change is someone's business | core §A.4; B16 |
| 14 | PD56 and §10: impersonation visible on both sides (console chip from the pulse, tenant countdown from `StorePulse.impersonation`), a note from the ribbon, disabled health fixes, acceptance | B16: "impersonation UX" | D57; Q.31; B16 |
| 15 | §12.2: the R1 flag declarations shown (incl. `design_publish_gates` with the override count) and this part's `console_perf_panel`, `health_tenant_ring` | flags are code, the console only edits defaults and rules | D51; core §D.4; Q.16 |
| 16 | PD17 and §13.4: the platform DPA moves to R2; §13.1 mounts P6's `platform_design` field group and the health / lifecycle tunables | the rethink cut; one console home for every platform setting | RF §3.3; DES-R8; core §D.10 |
| 17 | PD57 and §15: Edge / Worker, Render queue, Health engine, AI and Design tables panels; the complete alarm code list; acceptance with the render-stuck and health-stale fixtures | B16: "system health incl. the Worker and render queue" | core §H.5 rev 2, Q.25; DES-R12; AI-§O |
| 18 | §18: `NotificationKindDef` with `batch`, the PII key ban on `vars`, kinds `health.issue_new` and `staff.impersonation_started` | one registry, no customer data in a notification | core §I.4; Q.15; PD67 |
| 19 | PD60 and §22.2: mode-aware onboarding fixed for R2 (`store` / `both` reveal the first landing at once, the blueprint as a detached job surfaced by `pulse.jobs`) | B16: "onboarding that chooses store / landing / both and lands on a generated first result within the demo budget" | D56, §H.12 pattern B; core §A.2 |
| 20 | PD63 and §22.6: the pulse is the core's frozen `StorePulse` (health, jobs) with the shared poller, ETag / 304, contributors and `usePulse()` | SF-06 | D57; Q.14 (A*); RF §2.2, §3.4 |
| 21 | §22.8: the typed publish refusals open the publish dialog (never a toast), `job_queued` becomes the job chip, `busy`, and the console codes `status_changed` / `cooldown_handle_required` | every seam code has one UI | D51, D56; core §E.2, §M |
| 22 | PD61 and §22.10.2: the live address card in R1 with QR, WhatsApp share and P3's `testOrder` / `campaign` slots, one component in three places | UX-05 raised; the wow moment ends with sharing | RF §3.2, §2.3; core §I.4 |
| 23 | §22.12: new primitives `HealthRing`, `HealthGroups`, `IssueRow`, `IssueList`, `TodayBrief`, `KpiTile`, `FunnelChart`, `JobChip`, `FreshnessDot`, `LockReason` `impersonation`; the honesty-by-type rule | the dashboard draws numbers in three places only, each refusing dishonest input | core §I.6, §I.8 rule 3; RF §2.5 |
| 24 | §22.13: ⌘K rebuilt on the core `CommandDef` and `SearchProvider` registries, provider budgets, the full chord set, latency rule; health fixes run registered commands (PD66) | one action registry, one scoped search | core §I.3; Q.17; LAN Q18 |
| 25 | New §22.16: the tenant Store Health ring and issue list (states, pending / restricted / suspended behaviour, celebration once, acceptance) | SF-03's seller side | D53; RF §1.3 |
| 26 | New §22.17: the dashboard redesigned around the Today brief, honest COD KPI tiles, the COD funnel, work lists, the address card and the ring; "Revenue · 7 days" becomes "Placed · 7 days" | RF §0.5 named the placed-as-revenue habit; screen 2 of the build order | RF §2.5, §2.9, §2.10; SF-11 |
| 27 | PD64 and new §22.18: the eight rules as acceptance for every P2 screen, with the two bounce sites, the aurora / grain budget, the sparkline floor and the delta tokens named; `test:admin-motion`, `test:admin-rtl`, `qa:admin-perf` | the admin had the tells | D60; RF §2.1, §2.6, §2.9; DB RTL1, RTL5 |
| 28 | PD36 revised: `nav/console.ts` carries the single "Platform console" switcher item | reconcile with core §K.2's file list without moving the console nav into the tenant registry | core §K.2, §B.4 |
| 29 | PD47 updated (QR for the address card in R1); PD30 extended (cards first-class, R2 path fixed) | UX-05 raised | RF §3.2 |
| 30 | §L limits (health, lifecycle, plan impact, pulses, address card, brief, note); §M.1 new actions (`lifecyclePreviewAction`, `markHealthDirtyAction`, `addImpersonationNoteAction`, `snoozeHealthIssueAction`, `recomputeHealthAction`); §M.3 `store.health.snoozed`; §M.4 four query plans; §M.5 caches `health`, `console-strips`, `lifecycle-preview`, `plan-impact` and the bucket `s:<sid>:health:recompute` | every new behaviour has a limit, an action, a plan and a cache row | core §E.6, §E.8, §F.5 |
| 31 | §N: catalogs `health.ts`, `brief.ts`; key inventories for `health.*`, `brief.*`, `shell.address.*`, `shell.jobs.*`, the console `queue.*`, `lifecycle.*`, `attention.*` additions; 22 tenant reference texts and 13 console texts added | every new string exists in ar/fr/en before the screen does | core §I.5, D36 |
| 32 | §O: `test:health`, `test:health-db`, `test:pulse`, `test:admin-motion`, `test:admin-rtl`, the `test:platform` additions, the DB cases 11-12, the attack cases 9-12, e2e steps 10-14, and §O.5 rewritten as the two-persona demo steps this part owns | every new contract has a test that fails when it breaks | core §J; RF §4 |
| 33 | §P: P1 adds `src/lib/health/**` (engine side), `lifecycle-preview.ts`, `profile/overview-strips.ts`, `health-db-check.ts`, the demo steps, `nav/console.ts`; P2 adds the pulse, health rules, primitives, redesigned dashboard, the motion / RTL lints and the perf steps | ownership consistent with core §K.2 rows P1 and P2 | Q.12; core §K.2, §K.3 |
| 34 | §Q restated as the status of the 32 decided requests; §Q.1 second-round: none unavoidable, two notes | the core answered once; the spec cites the core | core §Q.1 |

Line count: revision 1 was 2,813 lines; revision 2 adds without removing (3,593 lines); **revision 3** adds the
round-1 review integration (PD68-PD76, PLA-§22.1.5, §22.10.6, §24.2 R1 slice, §Q.3, §R) without removing a section;
the count at the end of this file is the measure.

### PLA-§S.1 Revision 3 in one table (round-1 review)

| # | Change | Source |
|---|---|---|
| 35 | Status → revision 3; owner summary items 19-22; section map names §Q.3 and §R | round 1 |
| 36 | PD68 sandbox ceilings (Turnstile as a gate, daily cap → waitlist, two-tier media cap, shared disk budget, AI slice); §2.4 keys; §3.1, §3.2, §3.4.1, §3.6, §5.3, §13.2, §15.1, §15.2, §18.2, §L, §M.5; tests | SEC-1 |
| 37 | PD69 impersonation masking at the repository boundary; §7.2 helpers; §10.1-10.3; §18.2 body; §N.3 texts; tests | SEC-5 |
| 38 | PD70 live brand guard, `platform:brand_term_live`, the R1 abuse-report slice (`/report/<handle>`, `abuse_reports` in 0005); §2.2, §3.7, §5.3, §6.3.1, §6.3.3, §7.3, §13.3, §22.10.1, §24.2, §L, §M, §N, §P; tests | SEC-18 |
| 39 | PD71 `__Host-sgl` and the `__Host-` rule for every platform cookie; §22.1; tests | SEC-13 |
| 40 | PD72 `modeSummary` / `ModeCards`; new §22.1.5; §22.1 step 2; §22.10.1; 14 reference texts | OPS-31 |
| 41 | PD60 (rev 3) store-mode onboarding reveals the product page, creates no landing page; §22.2 mode table and action row; `onboarding.firstKind` / `productId`; UX-01 acceptance | OPS-14 |
| 42 | PD73 three real folds in the reveal; §22.2 reveal row; §O.4 step 15; §O.5 | UX-20 |
| 43 | PD74 cutout-later path (`estimateAlpha`, `hasCutout: "estimated"`, `render_jobs` reason `cutout`); §22.2 photos row; §O.5 | UX-39 |
| 44 | PD64 (rev 3) no aurora / grain anywhere, typographic celebration; §22.16 item 4; §22.18 rule 4; §4.7 grep widened | UX-38 |
| 45 | PD75 `settings/audit` owned by P2; new §22.10.6; §P.2 globs made disjoint; §P.1 names `keys/platform.ts` | ENGC-8 |
| 46 | PD76 `zones.feeMismatchTop5` input and the `landing:fee_mismatch` row | OPS-13 |
| 47 | §7.4 carrier label and tracking reference in the console drawer | OPS-9 |
| 48 | §7.15 city dimension keyed by `CityKey` | OPS-1 |
| 49 | §22.10.1 no hours field in P2's settings; the one source is `ops.callingWindow` | OPS-11 |
| 50 | §22.1 and §22.18 rule 6 touch ergonomics for every P2 form | UX-37 |
| 51 | §2 intro: `is_test` / `page_slug_history` placement follows the core; the tile filter is a no-op without the column | ENGC-1 |
| 52 | §O.1 wall-time budget for this part's suites | ENGP-24 |
| 53 | §Q.1 error code `brand_protected`; new §Q.3 (17 requests); §R filled (31 findings) | round 1 |

### PLA-§S.2 Revision 4 in one table (round-2 review and the alignment with core revision 3)

| # | Change | Source |
|---|---|---|
| 54 | Status → revision 4 on core revision 3 (D1 … D76); owner summary items 23-25; section map names §Q.4, §R round 2, §S.2 | round 2 |
| 55 | PD77 and the **Proven by** column in every PLA-§1 table; PL-04, PL-10, PL-11, PL-13 as checkable statements; `FEATURE_PROOFS` in `test:platform` | CRIT17 |
| 56 | PD78: budget-driven health job, measured `cycleMin`, scaled `health_stale`, `health_job_slow`, `staleAfterMin`, "Checked at" copy; §6.3.4, §6.3.5, §15.1, §15.2, §22.16, §L, §M.4, §O.2 | core §I.7 rev 3 (ENGC-25), A1 |
| 57 | PD42 rev 4 and PD79: one condition, one issue; P1's four tenant issues; flags derived from P5 / P3 issues; the owners' rule ids; the revision-3 table kept as the record; §6.3.2, §6.3.3, §N.2 | core §I.7, OPE-§27.2, LAN-§23.7, DES-§2.10, A2 |
| 58 | PD53 rev 4, §N.1, §P.1, §P.2: health sentences in the emitting track's file; P2's six i18n files only; P1's glob as the core writes it; `tenancy-cases/platform.ts` | D67, CRIT6, CRIT7, ENGC-8, A3, A18, A19 |
| 59 | PD70 rev 4, §13.3, §22.10.1: the frozen one-field `checkBrandTerms(kind, value)`, internal `brandMatches` | core §K.2 P0, D76, SEC-18, A4 |
| 60 | PD83, §24.2, §M.2, §M.5, §L, §O.4 steps 16 and 21: the absolute `reportUrl`, 404 on store hosts, `same-origin`, 5/h and 20/day, renderers named | CRIT15, core §Q.8 PLA Q3.4 A\*, A5 |
| 61 | §14.1, §22.1.4, §M.2, §O.2 case 20, §O.4 step 8: `same-origin` on invite pages; compare-and-set acceptance | core §B.1 / §B.5 rev 3, A6 |
| 62 | PD80, §14.2, §22.4, §22.8, §22.11, §22.12, §M.1, §O.2 case 17, §O.4 step 19: the tenant step-up ladder with the password variant | core §B.7 rev 3 (SEC-17), A7 |
| 63 | PD81, §11.2, §22.5, §M.1, §M.3, §O.2 case 16, §O.3 case 20, §O.4 step 20: account deletion (staff and self-service) | core §F.9 rev 3 (SEC-20), A8 |
| 64 | PD82, §14.3, §16.1, §16.3: `ADMIN_HOST` at the domain move, restart not rebuild, the allowlist check, V12 | D44 rev 3, §C.10, A9 |
| 65 | §5.3, §15.1, §15.2: `data_dir_70/85`, scaled Sheets threshold, `pool_wait`, `tick_lag`, `gate_mismatch`, `edge_bad_key` | core §H.5 rev 3, A10 |
| 66 | §18.1, §18.2: the notification link rule, `legal.updated` link | core §I.4 rev 3 (SEC-6), A11 |
| 67 | PD68 rev 4, §3.1, §3.6, §5.3, §15.1, §15.2, §22.8, §O.2 case 18: the D69 details (step 6, counted whenever pending, refunds, `quota_platform_pending`, 10-credit floor, 80 / 95 %, `signup_capped`) | D69, SEC-1, A13 |
| 68 | PD12: `__Host-sgd` set by T3's proxy | core §B.1 rev 3, A14 |
| 69 | PD60 rev 4, §22.2, §22.10.1: the `inStoreMode` fallback, `category_required`, `landingModeSwitchPlan` in the switch sheet | core §A.2 rev 3, OPS-14, A15 |
| 70 | §3.5: the sandbox AI chip; the store-mode draft evidence | ai.md R38, ENGP-1, A16 |
| 71 | §22.7: the review card's `{mediaMb}` text; Revoke for private preview links | A17, A20 |
| 72 | §7.4: carrier export marker and payload v3 rendering | OPS-9, OPS-15, A22 |
| 73 | §22.10.2: the `freeRename` grant | core §C.7 rev 3, A21 |
| 74 | PD2: `platformScope()` is not a `WriteScope`; PD76 rev 4 | D71, D75, A23 |
| 75 | §N.2 / §N.3 / §N.4: rev 4 keys and reference texts in ar / fr / en (step-up, account deletion, pending AI, health copy, console alarms) | PD78, PD80, PD81, D69 |
| 76 | §Q.1 error codes `owns_store`, `is_staff`, `category_required`; §Q.3 status after core §Q.8; new §Q.4 (11 requests); §R round 2 (39 findings) and the alignment table (A1-A23) | round 2 |

Line count: revision 3 ended at 4,129 lines; revision 4 adds without removing a section (superseded texts are kept
as marked records), and the count at the end of this file is the measure.
