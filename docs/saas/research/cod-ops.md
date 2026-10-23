# Research: COD operations, team agents, accounting and integrations

Area **cod-ops**, for the architect of `docs/STORE-SAAS.md`. Written 2026-10-23. Owner goals: brief items 9 and 10
(`docs/STORE-GEN-BRIEF.md`), and 11 for the learning loop. Code facts are given as `path:line`. External facts carry
a URL, and anything without one is marked **[unverified]**. Every idea is ranked **P0** (launch), **P1** (next) or
**P2** (later), with effort **S/M/L**.

> **Evidence warning.** Almost every public page about Moroccan COD operations is vendor marketing, mostly from
> eGrow, a COD software company with an interest in the topic. I use those pages for *what sellers expect a tool to
> do*, never for performance numbers. No Moroccan carrier I checked publishes official developer documentation.
> §4 says exactly what each source shows.

---

## 0. TL;DR: the 12 conclusions that matter

1. **Today the order engine is solid but flat.** One `status` varchar uses 9 ids (`src/lib/orders/contract.ts:304-314`),
   with no status history, call attempts, assignment, notes thread, shipments, costs or remittances. The
   single-tenant Sheets sheet *is* the call center today (French labels that agents set in column C, pulled back
   every 5 min at `src/lib/sheets/sync.ts:308-341`). The SaaS must make the **in-app call center** the main tool and
   keep Sheets as a first-class mirror.
2. **Split the status into three axes**, and keep the single legacy `status` as a *projection* so Sheets and CSV
   compatibility survives: **confirmation** (new → attempts → confirmed/cancelled/fake/duplicate),
   **fulfilment** (to_pack → shipped → out_for_delivery → delivered/refused/returned/lost) and **money**
   (unpaid → collected_by_carrier → remitted / written_off). Profit, agent pay and carrier reconciliation all hang
   on the third axis, which doesn't exist today.
3. **Use an append-only `order_events` timeline**, the single source of truth for KPIs, commissions, audit and AI
   learning. Today a status change only writes a generic `audit_log` row (`src/lib/orders/admin.ts:193-194`).
4. **The agent work queue is "Next order"** (a pull model with a 10-minute lease), with optional auto-assignment
   rules: round-robin, by product, by city or region, by language, by risk. MariaDB 10.4 has **no `SKIP LOCKED`**
   (added in 10.6, https://mariadb.com/docs/release-notes/community-server/10.6/10.6.0.md), so claims must be an
   atomic `UPDATE … WHERE (assignee IS NULL OR lease_until < NOW()) … ORDER BY priority LIMIT 1` with a claim
   token.
5. **Pay agents on delivered, not on confirmed** (the default rule), with a provisional accrual at confirmation and a
   clawback on return or refusal. If agents are paid only for confirmations, they are rewarded for forcing bad
   orders through, which the seller then pays for in return fees.
6. **The accounting core is a per-order profit ledger with snapshots:** COGS, packaging, delivery fee, COD fee,
   return fee, agent commission and allocated ad spend, all frozen on the order when it ships. Add carrier
   **remittance statements** imported from CSV/XLSX and matched line by line. The headline KPIs for a COD seller
   are cost per *delivered* order and "true ROAS" (delivered revenue ÷ ad spend), not the order-time ROAS that the
   ad platforms report.
7. **Carriers: build an adapter interface and a universal CSV fallback first.** The only Moroccan carrier whose API
   shape is publicly visible is **Sendit** (endpoints disclosed by its official WordPress plugin). Ameex, Coliix and
   Ozon Express have APIs that integrators use, but I found no public documentation. Amana, CTM Messagerie,
   Tawssil, Chronopost Maroc, Speedaf, Cathedis and Forcelog showed **no public API documentation**. Yalidine
   (Algeria) exposes `api.yalidine.app/v1/` according to third-party plugins. So P0 = manual/CSV adapter plus
   Sendit; P1 = the next API carriers, after partner agreements.
8. **Purchase timing is the biggest ad-quality lever.** Today the server Purchase fires when the order is created
   (`src/lib/orders/conversions-core.ts:157-170`). COD sellers need **"Purchase on confirmed" or "on delivered"**
   options (or extra custom events). Meta accepts an `event_time` at most 7 days in the past, and one stale event
   fails the whole request
   (https://developers.facebook.com/docs/marketing-api/conversions-api/offline-events). Delivered events that come
   later than that must be dropped or sent as offline events.
9. **Google Sheets has a hard platform-wide quota.** Sheets API limits are 300 requests/min per project and 60/min
   per user per project (https://developers.google.com/sheets/api/limits), and one platform service account is one
   "user". Use a per-store round-robin with batched calls, and later an optional store-owned service account.
   Real-time push from a sheet through Apps Script is possible within quotas: 20,000 UrlFetch calls/day on consumer
   accounts (https://developers.google.com/apps-script/guides/services/quotas).
10. **Notifications and WhatsApp:** click-to-chat with a per-locale prefilled message is P0, and already half-exists
    (`src/components/admin/orders/order-drawer.tsx:174-179`). The WhatsApp Cloud API is P1, opt-in, using the
    store's own WABA. Meta bills per delivered template message, and Morocco got its own rate card line on
    2026-10-01 (https://developers.facebook.com/docs/whatsapp/pricing). Telegram new-order alerts exist only in the
    PHP export (`src/lib/export/templates/order.php:2632`). Bring them to the platform at P0.
11. **Signed outbound webhooks** (the Standard Webhooks scheme: `webhook-id`, `webhook-timestamp`, `webhook-signature`)
    go through a DB **outbox** drained after the response and by the 5-min cron. With no workers on Hostinger, this
    one pattern serves webhooks, carrier pushes, CAPI retries and WhatsApp sends.
12. **"Learning from the data" has a natural label:** every order eventually ends delivered, refused or returned.
    That outcome trains the per-store risk score, the best call time, the city/carrier choice and the call scripts.
    It is cheap, local, explainable and improves with every order (it ties into brief item 11).

---

## 1. What exists today (code facts)

| Capability | Where | State / limits |
|---|---|---|
| Statuses | `src/lib/orders/contract.ts:304-314` | 9 ids with French labels and sheet colours: new, confirmed, no_answer ("Injoignable"), callback ("Reportée"), shipped, delivered, returned, cancelled, fake. Stored as `orders.status varchar(20)` (`src/lib/db/schema.ts:272`). No transition rules: any status can move to any status. |
| Status change | `src/lib/orders/admin.ts:172-196` | Pushes to the sheet first, then updates the row, then writes `audit("orders.status_changed")`. No per-order timeline, reason, attempt count or callback time. |
| Order row | `src/lib/db/schema.ts:263-312` | One offer per order (`items` JSON, OrderItems v2 at `schema.ts:237-261`), money in cents, `utm` JSON, `risk_score` and `flags`, `sheet_status`. **No** assignee, notes thread, tracking number, carrier, costs, or paid/remitted fields. `note` is the *customer's* note. |
| Risk | `src/lib/orders/risk.ts:46-67` | Explainable score 0–100: honeypot, speed, user agent, captcha, origin, IP repeats, phone history (fake/returned/cancelled vs delivered), page burst, duplicate. Hand-tuned weights; no learning. |
| Duplicates | `src/lib/orders/create.ts:172-191` | Same phone **and same page** within 12 h. Same network → refused as a duplicate; another network → stored and flagged. A same phone on another product in the same store is not caught. |
| Leads / abandoned | `src/lib/db/schema.ts:314-331`; `src/lib/orders/admin.ts:279-302` | Partial form captures, with tel and wa.me links in the leads panel (`src/components/admin/orders/leads-panel.tsx:85-90`). Purged after 30 days (cron). |
| Blocklist | `src/lib/db/schema.ts:333-345`; `src/lib/orders/admin.ts:308-347` | Phone or IP hash. Global today (TENANCY-MAP ORD-03). |
| Roles | `src/lib/auth/permissions.ts:6-38` | owner / editor / agent; agent = `orders.read` and `orders.write` only. No per-field restrictions (agents see full phones and every order). |
| Google Sheets | `src/lib/sheets/*` | Zero-dependency client, one platform service account (`GOOGLE_SA_JSON_B64`, `src/lib/sheets/client.ts:43-60`). A 13-column contract (`src/lib/sheets/orders-sheet.ts:13-27`) plus optional SKU, Articles, Livraison and "Prix pack" columns (`src/lib/sheets/row.ts:1-16`). Append after the response (`src/lib/orders/http.ts:51-63`), and a pull of column C every ≥ 290 s (`sync.ts:313`). Single sheet, single tab. |
| CSV exports | `src/lib/orders/admin.ts:377-447` (orders), `:449` (leads) | Streamed, UTF-8 with a BOM, filterable. |
| Pixels | `src/lib/pixels/ids.ts:8-14` | Meta, TikTok, Snap, GA4 in the browser; Meta CAPI and TikTok Events API on the server. The server Purchase fires **at order creation** for low-risk orders (`src/lib/orders/conversions-core.ts:157-170, 529-560`). |
| Shipping fee | `src/lib/page/pricing.ts:329-349` | One flat `offers.shippingFee` per page, plus free-shipping offers. No per-city zones. The city list has no fees (`src/lib/markets/cities-ma.ts`). |
| Static exports | `src/lib/export/whatsapp.ts`; `src/lib/export/templates/order.php` | WhatsApp order mode (wa.me hand-off). The PHP export has **Telegram** new-order alerts (`order.php:2632-2660`), which the live platform lacks. |
| Dashboard | `src/lib/admin-data/dashboard.ts:26-56` | Orders, revenue, AOV, conversion, uniques, 7-day status pipeline. **No** confirmation rate, delivery rate, profit or ad spend. |
| Cron | `src/app/api/cron/tick/route.ts:58-68` | Sheets sync (100), status pull, purges. One global pass (TENANCY-MAP SHT-11). |
| Outbound email | none | Nothing sends email (TENANCY-MAP §9.1). |

**Reading:** the commerce core (validation, pricing in cents, idempotency, risk, conversions, PHP parity) is
production-grade. Everything *after* the order lands is thin: the sheet is the operations tool. That is the gap
brief item 10 asks to close.

---

## 2. Order lifecycle and the call-center confirmation workflow

### 2.1 What COD sellers expect (market evidence)

- COD dominates Moroccan e-commerce. The usual estimate is 70–90 % of online payments; these are vendor and media
  figures, not official statistics (https://www.egiodigital.com/publications/tag/data/ ;
  https://www.egrow.com/en/blog/ozon-express-morocco-cod-2026).
- Confirmation by phone before shipping is a profession of its own in Morocco: the agent checks identity, address,
  product and intent before the parcel leaves (https://www.jobsquare.ma/blog/confirmation-commandes-maroc-salaire-carriere/).
  YouCan sells it as a managed service ("YouCan Confirm", launched 2024): every order is called right away, with
  several retries at different times of day before an order is marked unconfirmed. Activation needs a 100 MAD minimum
  credit, and no per-order price is published (https://youcan.shop/en/help/blog/confirm).
- Typical tooling claims: WhatsApp-first confirmation with Confirm/Cancel buttons, with non-responders routed to a
  "Confirmation Center" for a call (https://www.egrow.com/en/cod-management-tool). Confirmation attempted within
  15–30 minutes of the order. Call windows of 10:00–13:00, 15:00–18:00 and 19:00–21:00, avoiding prayer times and
  Friday midday. Scripts in Darija or French, an upsell during the call, and location sharing for vague addresses
  (https://www.egrow.com/en/blog/how-to-increase-cod-confirmation-rate-morocco-2026). **All of these are vendor
  guidance without data [unverified as benchmarks].** Use them as *configurable defaults*, then let each store's
  own data replace them (§7).
- Unconfirmed orders are claimed at "20–40 % or more" and RTO (return-to-origin) at "25–30 %+" for unoptimised
  sellers. These are vendor claims **[unverified]**. Do not show them as benchmarks in the UI; show each store's own
  rates.

### 2.2 Recommended status model (three axes + a legacy projection)

| Axis | Values | Who moves it |
|---|---|---|
| `confirm_state` | `new` → `attempting` (no_answer n times) / `callback` (due at T) → `confirmed` · `cancelled` (reason) · `fake` · `duplicate` (merged into X) · `unreachable` (attempts exhausted) | Agents, the WhatsApp bot, rules |
| `ship_state` | `none` → `to_pack` → `packed` → `shipped` (carrier, tracking) → `in_transit` / `out_for_delivery` → `delivered` · `refused` (at the door) · `returned` (back at the warehouse) · `lost` | Logistics role, carrier adapter (API/webhook/CSV) |
| `money_state` | `unpaid` → `collected` (carrier says cash in hand) → `remitted` (on a matched statement) · `disputed` · `written_off` | Remittance import, accountant |

The legacy `orders.status` is **derived** (a pure function), so Sheets, CSV, the PHP export and existing filters keep
working: delivered > returned/refused > shipped > confirmed > callback > no_answer > new, with cancelled/fake
terminal. Add `refused`, `duplicate`, `unreachable` and `in_transit` labels to `ORDER_STATUSES`, appended so the
sheet column-C labels stay backwards-compatible. **P0, M.** It matters because "returned vs refused" and
"remitted vs only delivered" are exactly where COD sellers lose money without seeing it.

A **transition guard** (state machine) allows only legal moves, for example no `delivered` before `shipped` unless
an owner or admin forces it. A forced move needs a reason and is audited. **P0, S.**

### 2.3 Per-order timeline: `order_events`

`order_events(id, store_id, order_id, at, actor_kind enum(user,carrier,system,customer,sheet,api), actor_id, type,
from, to, reason_code, note, meta JSON)`, append-only, with index `(store_id, order_id, at)` and
`(store_id, actor_id, at)` for agent KPIs. Types: created, assigned, claimed, released, call_attempt
(outcome: answered / no_answer / busy / switched_off / wrong_number), whatsapp_sent / replied, status_changed,
field_edited (before/after for name/phone/city/address/items), note, phone_revealed, merged, shipment_created,
carrier_status, remitted, exported. **P0, M.** It is the single source for the drawer timeline, KPIs, commissions,
the audit trail and the AI training data.

### 2.4 Retry schedule (no-answer ladder)

Default, configurable per store, all times in the store's time zone and calling window:

| Attempt | When | Note |
|---|---|---|
| 1 | Immediately (target ≤ 15 min after the order) | WhatsApp template first if the store has the API (P1) |
| 2 | +1 h | |
| 3 | +3 h, or the next calling window | |
| 4 | Next day, late morning | |
| 5 | Next day, evening | |
| 6 | Day +2 | Then `unreachable` (auto-cancel, reason "injoignable"), or leave open, per store setting |

Callbacks ("rappelle-moi demain à 18h") set `due_at` exactly. The queue orders by `due_at`, then priority (value,
risk, age). Outside the calling window, due items wait; no worker is needed because the queue is computed on read.
**P0, S.** The numbers are sensible defaults, not researched optima. §7.2 shows how each store learns its own.

### 2.5 Call script, structured fields and reasons

- **Script panel** per product or page, in ar (Darija), fr and en. It is generated from the page doc: product,
  offer, options, delivery promise and the price *as stored on the order*, never invented. Its steps: greet →
  verify product/qty/total → address and landmark → availability on the delivery day → optional upsell offer (from
  Offers v2) → close. **P0 (template), S. P1: AI-tailored per product, M.**
- **Cancel reasons** (a coded list, chosen in one tap): changed mind, price, ordered by mistake, already bought
  elsewhere, didn't order (fake), wrong number, outside the delivery zone, delay too long, wants to see the product
  first, duplicate. Codes feed analytics and the AI. **P0, S.**
- **Address quality:** city picked from the store's carrier zone list (§4.4), a "landmark/quartier" field, and an
  optional pinned location received through WhatsApp (P1). **P0 (city plus landmark), S.**
- **In-call edits** (qty, variant, upsell line, address) re-price on the server with the same cents engine
  (`src/lib/page/pricing.ts`), and each edit writes a `field_edited` event. **P0 for address/qty/variant (M), P1
  for an upsell line during the call (M).**

### 2.6 Duplicate and fake-order defence

| Idea | P | Effort | Why it matters |
|---|---|---|---|
| Store-wide open-order check: same E.164 phone with an open order (any product) in the last N days (default 3) → flag "possible duplicate", one-click **merge** (lines combined, one parcel, one delivery fee) or "separate order" | P0 | M | Double orders from impatient shoppers are common, and two parcels mean two delivery fees and often one refusal |
| Customer profile per store (`customers(store_id, phone_e164, name, orders, delivered, refused, returned, last_at)`, kept up to date from events) shown in the drawer: "3 delivered, 1 refused" | P0 | M | The best fake-order signal is the store's own history; today it's recomputed per order at `create.ts:224-234` |
| Risk score v2: same features plus the store's outcome-trained weights (§7.1), carrier-zone refusal rate and time-of-day | P1 | M | Explainable, improves with use |
| OTP or WhatsApp "reply 1 to confirm" for high-risk orders only | P1 | M | Removes most fake orders without slowing good customers |
| Shared, opt-in, platform-level "refusal network" (hashed phone → counts of refused/fake across stores that opted in) | P2 | L | Very valuable but legally sensitive: Law 09-08 requires declaring the processing to the CNDP, and transfers need authorisation (https://upsilon-consulting.com/declarations-autorisations-cndp-guide-pratique/). Explicit opt-in, aggregate counts only, never the other store's identity. **Needs legal review** |
| Blocklist per store (fixes ORD-03), plus "block and cancel all open orders of this phone" | P0 | S | Already designed in TENANCY-MAP |

### 2.7 WhatsApp confirmation

| Level | What | P | Effort |
|---|---|---|---|
| Click-to-chat | A button opens `wa.me/<E.164>?text=<prefilled message in the order locale>` with the order summary and "reply OK to confirm". It logs a `whatsapp_sent` attempt. Already a bare link in the drawer (`order-drawer.tsx:179`), so add the text and the logging | P0 | S |
| Agent quick replies | Saved templates per store (confirmation, address question, delivery-day notice, "your parcel left") with variables | P0 | S |
| WhatsApp Cloud API (the store's own WABA) | Utility template with quick-reply buttons Confirm / Cancel / Change. The inbound webhook moves `confirm_state` and replies. Unanswered after X min → call queue | P1 | L |
| Delivery notifications | Shipped / out for delivery templates, which lower refusals because the customer expects the courier | P1 | M |

Pricing facts (Meta, https://developers.facebook.com/docs/whatsapp/pricing): per delivered template message by
category and country since 2025-07-01. Messages from users are free. 1,000 free service messages per number per
month (from the 2026-10-01 update). A customer service window of 24 h. Click-to-WhatsApp ad entry points open a
free window "up to 7 days". **Morocco has its own rate line since 2026-10-01**, but the rates are only in Meta's
rate card files, which I did not open **[unverified amounts]**. Whether utility templates inside the window are
still free under the October 2026 rules: the July 2025 rule said yes (https://cloudfon.atlassian.net/wiki/spaces/CX/pages/535232517)
**[re-verify]**. Onboarding a store's own WABA (Embedded Signup, Business verification, Tech Provider status for
the platform) **[unverified: needs a Meta-docs pass before P1]**.

---

## 3. Agent management (call center and logistics team)

### 3.1 Roles (extends TENANCY-MAP §2.2 `store_members.role`)

| Role | Sees | Can |
|---|---|---|
| owner | everything | everything, including billing and deleting the store |
| admin | everything except billing | members, settings, integrations |
| manager (call-center lead) | all orders, all agents' KPIs, assignments | assign/reassign, force transitions, set commission rules (if allowed), approve payouts |
| agent (confirmation) | **their queue only** (assigned or claimed), masked phone until "Call" | call, WhatsApp, attempts, confirm/cancel, edit address/qty, notes |
| logistics | confirmed and shipped orders, carriers | pack, create shipments, print labels/manifests, import carrier CSVs |
| accountant | finance screens, read-only orders | costs, expenses, remittances, exports. No customer phone |
| editor | pages and catalog (as today) | — |
| viewer | dashboards | — |

New permissions (on top of AUTH-04): `orders.assign`, `orders.read_all`, `orders.reveal_phone`, `orders.export`,
`orders.force_status`, `shipments.write`, `finance.read`, `finance.write`, `payouts.approve`, `integrations.manage`.
**P0 for owner/admin/manager/agent/logistics, S–M. Accountant and viewer P1, S.**

### 3.2 Assignment

| Mode | How | P | Effort |
|---|---|---|---|
| **Claim queue ("Next order")** | The agent presses Next and gets the highest-priority due, unassigned (or lease-expired) order matching their skills. Lease 10 min, renewed by activity, released on leave | P0 | M |
| Round-robin auto-assign at creation | Among *online* agents, with weights and a daily cap per agent | P0 | S |
| Rules | By product/page, city/region, language (order locale ar/fr), risk ≥ X → senior agents, value ≥ X → senior | P1 | M |
| Rebalancing | An order untouched for N min after assignment returns to the pool; an agent going offline releases their leases | P0 | S |
| Presence | online / break / offline, set by the agent; auto-away after inactivity | P0 | S |
| Working hours and calling window per store | Stops "Next" from handing out orders when customers shouldn't be called | P0 | S |

**Engineering note (MariaDB 10.4):** no `SKIP LOCKED` (it arrived in 10.6, https://mariadb.com/docs/release-notes/community-server/10.6/10.6.0.md).
Claim with a single atomic statement:
`UPDATE orders SET assignee=?, lease_until=NOW()+INTERVAL 10 MINUTE, claim=? WHERE store_id=? AND confirm_state IN (…) AND (assignee IS NULL OR lease_until<NOW()) AND (due_at IS NULL OR due_at<=NOW()) ORDER BY priority DESC, due_at, created_at LIMIT 1`,
then `SELECT … WHERE claim=?`. Index `(store_id, confirm_state, due_at)`. No worker is needed, and lease expiry
is evaluated when the queue is read.

### 3.3 Privacy: what agents may see

| Control | P | Effort |
|---|---|---|
| Lists show a masked phone (`06 •• •• 12 34`); the full number appears only on Call or WhatsApp (tel: / wa.me), which writes a `phone_revealed` event | P0 | S |
| Agents can't export CSV, can't see orders outside their queue, can't open the sheet link; the sheet stays an owner/manager tool | P0 | S |
| Reveal rate alarm: > N reveals/hour → notify the manager (scraping or reselling customer lists is a known risk with outsourced agents **[unverified as a statistic]**) | P1 | S |
| True number masking (virtual numbers through a telephony provider, calls recorded) | P2 | L |
| Click-to-call through a SIP/VoIP provider with call duration and recording linked to the order | P2 | L |

### 3.4 KPIs (exact definitions the spec should fix)

| KPI | Formula | Note |
|---|---|---|
| Confirmation rate | confirmed ÷ (orders worked − duplicates − fake) | By agent, product, page, city, hour |
| Delivery rate (agent-attributed) | delivered ÷ shipped, for orders the agent confirmed | Lagging (days). The honest measure of agent quality |
| Net delivered rate | delivered ÷ all orders received | The owner's business number |
| First-touch time | first `call_attempt` − `created` | Median and p90 |
| Attempts per confirmation | attempts ÷ confirmed | |
| Handling time | sum of claim → resolution per order | From events |
| Upsell rate and uplift | orders with an in-call upsell line ÷ confirmed; Σ extra revenue | |
| Cancel-reason mix | share per reason code | Feeds the product and offer fixes |
| Calls per hour online | attempts ÷ online hours | Presence-based |

**P0:** confirmation rate, delivery rate, first-touch time and attempts (S–M, from `order_events`). **P1:** the rest.
Roll up daily into `agent_stats_daily(store_id, user_id, day, …)` from the cron, so dashboards stay cheap.

### 3.5 Commissions and payouts

- **Rule engine** per store (or per agent override): fixed amount per confirmed order, per delivered order, % of
  upsell revenue, tier bonuses (for example ≥ 70 % delivery rate in the month → +X per delivered), and an optional
  fixed salary line. **P0 (per-confirmed and per-delivered amounts plus clawback), M. P1 (tiers, % upsell), S.**
- **Recommended default:** an amount *per delivered order*, accrued at confirmation as `pending`, earned on
  `delivered`, voided on refused/returned/cancelled. This stops agents from forcing confirmations.
- **Ledger** `agent_earnings(id, store_id, user_id, order_id, rule_id, amount_cents, state enum(pending,earned,
  void,paid), period, payout_id, created_at)` and `payouts(id, store_id, user_id, period_from, period_to,
  total_cents, state enum(draft,approved,paid), paid_at, method, ref)`. The agent sees their own statement
  (live: "today 23 confirmed, 140 MAD pending, 310 MAD earned this week"). **P0 ledger plus statement, M. P1 payout
  batches, S.**
- Commissions post into accounting as an expense per order (§5).

### 3.6 Live leaderboard and supervision

- Leaderboard (today/week): confirmed, delivery rate, earned. Updated by **polling every 15–30 s**, because
  Hostinger's proxy support for websockets/SSE is **[unverified]**. Opt-in visibility per store (some owners don't
  want agents to see each other's earnings). **P1, S.**
- Manager live board: queue depth by state, oldest due callback, agents online, each agent's current order. **P0
  (queue depth plus agents online), S. P1 (full board), M.**
- Quality review: the manager samples confirmed orders that ended refused and sees that agent's notes. **P1, S.**
- Audit: assignment, reveals, edits and forced moves are all in `order_events`, and member/role changes are in
  `audit_log` with `store_id` (TENANCY-MAP §2.1). **P0.**

### 3.7 Outsourced confirmation (market fact, product idea)

Managed confirmation services exist (YouCan Confirm, see above). Idea: a **"confirmation provider" member type**,
an external call-center company invited as a team with its own manager, paid per rule, and isolated to the stores
that invited it. **P2, M.** It could become a platform marketplace later.

---

## 4. Delivery companies (carriers)

### 4.1 What I could and could not verify

| Carrier | Country | Integration evidence | Public API docs? |
|---|---|---|---|
| **Sendit** | MA | Official WooCommerce plugin (author `yssendit`, v2.2.5, Sept 2026). It discloses `https://app.sendit.ma/api/v1/` endpoints `/login` (Public Key + Secret Key → token), `/districts` (cities and rates), `/deliveries` (create a parcel with name, phone, address, ref, items, amount to collect), `/deliveries/getlabels` (PDF label). Status pushes go to a store webhook URL with a token (https://wordpress.org/plugins/sendit-ma-integration/). Official Shopify app (launched 2026-02-12) with label PDFs and webhook status sync (https://apps.shopify.com/sendit) | **Partly**: endpoint names through the plugin disclosure; field-level docs **[unverified]** |
| **Ameex** | MA | Official Shopify app "AMEEX Delivery" (orders sent automatically or in one click, Moroccan cities, COD) (https://apps.shopify.com/ameex). An integrator lists "create shipments, track, list rates" via the API (https://www.egrow.com/en/blog/ameex-cod-morocco-guide-2026). Mobile app with COD payment tracking and warehousing (https://apps.apple.com/mx/app/ameex-ma/id6504445983) | No public docs found |
| **Coliix** | MA | An integrator's help page: the API key comes from Coliix account Settings > Profile (https://help2.egrow.com/article/how-to-integrate-coliix-with-egrow) | No public docs found |
| **Ozon Express** | MA | An integrator pushes orders "via API" and tracks statuses. Remittance "typically weekly or bi-weekly" (https://www.egrow.com/en/blog/ozon-express-morocco-cod-2026 ; https://www.egrow.com/en/integrations/ozonexpress) | No public docs found |
| **Cathedis** | MA | Raised USD 713k in 2024 (https://dabafinance.com/en/news/l-entreprise-marocaine-cathedis-obtient-713-000-dollars-pour-d-velopper-ses-livraisons-sur-le-dernier-kilom-tre). Grew from 27 to 108 cities in 10 months around 2020 (https://ecoactu.ma/212-founders-cdg-invest-cathedis/). Only a review site mentions "connectors and APIs" (https://trustburn.com/reviews/cathedis) | **[unverified]** |
| **Speedaf** | MA (regional) | Listed by integrators only (https://www.egrow.com/en/blog/best-delivery-companies-morocco-cod-2026) | No public docs found |
| **Amana** (Barid Al-Maghrib) | MA | Express parcel arm of the national post, with fulfilment by Amana Logistics (https://fnh.ma/article/actualite-entreprises/barid-al-maghrib-presente-plusieurs-innovations-pour-son-activite-colis-logistique). Tracking via aggregators (https://www.trackingmore.com/fr/poste-maroc-tracking-api) | No e-commerce API found |
| **CTM Messagerie** ("e-tijar") | MA | Home delivery for e-merchants, Mon–Sat 08:00–20:00 with time slots, COD refunds by cheque or transfer, cash pickup at Damane Cash (https://medias24.com/nativeads/ctm-messagerie-lance-e-tijar-un-service-de-livraison-a-domicile-destine-aux-e-commercants/ ; https://fnh.ma/article/actualites-marocaines/damane-cash) | No public docs found |
| **Tawssil** (Cash Plus) | MA | Merchant web platform, COD remittance within 24 h at Tawssil points (2022 report); old prices of 20 MAD same city and 45 MAD intercity for 1–5 kg (https://medias24.com/2022/09/05/cash-plus-le-service-tawssil-a-permis-de-livrer-200-000-destinataires-depuis-2020/) | No public docs found |
| **Chronopost Maroc** / Chrono Diali | MA | Chrono Diali is a Barid Al-Maghrib / Geopost JV (https://www.fnh.ma/article/actualites-marocaines/livraison-de-colis-a-domicile-chrono-diali-nouveau-moteur-du-developpement-du-e-commerce-au-maroc) | No public docs found |
| **Forcelog** | MA | Pickup, storage, packing, last mile. Claims 240 destinations and "from 18 MAD per delivered order". Web workspace, no app (https://meatechwatch.com/2024/06/07/moroccan-startup-forcelog-enhances-e-commerce-logistics-with-tailored-delivery-solutions/) | No API found; COD **[unverified]** |
| Others named by integrators | MA | Digylog, Oscario (https://www.egrow.com/en/cod-management-tool); Vitex, Mille Colis, Zakrix Express (https://www.egrow.com/en/blog/best-delivery-companies-morocco-cod-2026) | Not researched |
| **Yalidine** | DZ | `https://api.yalidine.app/v1/` with API ID + API token from the dashboard; parcels CRUD, wilayas/communes/centres, fees; 401/403/429 semantics; stop-desk id needed for desk delivery. All third-party sources (https://dzbuild.com/docs/couriers/yalidine ; https://pypi.org/project/yalidine/ ; https://apps.shopify.com/yalidine) | Third-party only |
| Ecotrack, ZR Express | DZ | A unified PHP SDK covers Yalidine, Ecotrack and ZR Express (https://packagist.org/packages/dolivroo/sdk) | Third-party only |
| **YouCan Ship** | MA (aggregator) | Aggregates carriers, orders sync, CSV import, a single payout via YouCan Pay or transfer (https://ship.youcan.shop/en/our-services ; https://youcan.shop/en/help/blog/youcan-ship) | Not public |
| Europe (later) | EU | Sendcloud: one REST API, 100+ carriers including Chronopost, plus a pickup-point picker (https://www.sendcloud.com/fr/chronopost-api/). Boxtal and Packlink **[not researched]** | Aggregator APIs |

**Conclusion:** most of the Moroccan carrier "APIs" are private and issued per merchant account, and the big
integrators reach them through partnerships. So the platform must (a) work fully with **no API at all**, through CSV,
and (b) add API adapters one by one, through each carrier's sales/tech contact, and only from the docs they hand
over. **Never ship an adapter from guessed fields.**

### 4.2 Carrier adapter interface (P0 design, M)

```ts
interface CarrierAdapter {
  id: string;                       // "manual", "sendit", "ameex", …
  capabilities: {
    createParcel: boolean; cancelParcel: boolean; label: boolean; pickupRequest: boolean;
    trackPull: boolean; trackWebhook: boolean; zonesSync: boolean; remittancePull: boolean;
  };
  credentialsSchema: ZodSchema;     // stored encrypted in store_settings (purpose settings:<storeId>:carrier:<id>)
  syncZones?(ctx): Promise<Zone[]>;                         // cities/districts + fees
  createParcels?(ctx, orders[]): Promise<ParcelResult[]>;   // batch, idempotent on order id
  labels?(ctx, trackingIds[]): Promise<Uint8Array>;         // PDF
  track?(ctx, trackingIds[]): Promise<CarrierEvent[]>;
  parseWebhook?(ctx, req): Promise<CarrierEvent[]>;          // token-verified, per-store URL
  statusMap: Record<string, ShipState>;                     // carrier label → canonical
}
```

- **`manual` adapter (P0, M):** a manifest CSV export with **configurable column mapping per carrier template**
  (saved presets), tracking-number import (CSV: order id ↔ tracking), status import (CSV: tracking → carrier
  label, mapped by `statusMap`), and remittance import (§5.4). Plus a printable picking list and a manifest PDF.
- **Sendit adapter (P1, M):** the first API adapter, because its endpoint shape is publicly visible. It still needs
  the field-level docs from Sendit **[verify before building]**.
- **Next adapters (P1–P2, M each):** Ameex, Coliix, Ozon Express, and then by owner demand. Yalidine when Algeria
  opens.
- Webhook ingress: `/api/hooks/carrier/<adapter>/<storeHookKey>` with a per-store random 256-bit key and a
  constant-time compare. Events are written to `shipment_events`. **P1, S.**
- Polling: the cron tracks at most K shipments per store per tick, round-robin across stores within the 110 s budget
  (`src/app/api/cron/tick/route.ts:31-39`'s `step()` pattern). **P1, S.**

### 4.3 Shipment data

`shipments(id, store_id, order_id, carrier_id, tracking, state, fee_cents, cod_cents, return_fee_cents,
label_asset_id, created_at, delivered_at, returned_at, remittance_id)` and
`shipment_events(store_id, shipment_id, at, carrier_status, mapped_state, raw JSON)`. One order → usually one
shipment; re-shipment after a refusal gets a new row. **P0 (table plus manual adapter), M.**

### 4.4 Delivery zones and fees (feeds both checkout and accounting)

- `carrier_zones(store_id, carrier_id, city, zone, delivery_fee_cents, return_fee_cents, cod_fee_bp, eta_days,
  active)`, filled by hand, CSV, or `syncZones` (Sendit's `/districts` returns cities and rates per its plugin).
  **P0 (manual/CSV), S. P1 (sync), S.**
- **Checkout:** per-city shipping fee and ETA line ("Livraison 24–48h à Casablanca") replace the flat page fee
  (`src/lib/page/pricing.ts:347`) when the store enables zones. The page fee stays as the fallback. **P1, M** (it
  touches pricing parity with the PHP export).
- **Carrier routing rules:** city → preferred carrier, weight/price → carrier, fallback. **P1, S.** Later,
  per-city refusal rates choose the carrier automatically (§7). **P2, M.**

---

## 5. Accounting ("comptabilité")

### 5.1 Principles

- Integer cents everywhere (existing `src/lib/markets/money.ts`), one currency per store (multi-currency P2).
- **Snapshot costs onto the order** when it ships (`cost_snapshot` JSON: COGS per line, packaging, carrier fee, COD
  fee, expected return fee). Editing a product cost later never rewrites past profit. **P0, S.**
- Estimates vs actuals: the carrier fee is *expected* from `carrier_zones` and *actual* from the remittance
  statement. The UI shows both and highlights differences.
- Everything is derivable from tables, and a nightly (cron) rollup writes `finance_daily(store_id, day, product_id,
  campaign_key, …)` for fast dashboards.

### 5.2 Cost inputs

| Input | Model | P | Effort |
|---|---|---|---|
| Product cost (COGS) | `product_costs(store_id, product_or_item_id, variant_key, cost_cents, effective_from)` (history), for catalog products *and* landing-page items (Offers v2 items) | P0 | M |
| Packaging per order or per item | Store setting plus a per-product override | P0 | S |
| Delivery, return and COD fees | `carrier_zones` (§4.4); actuals from statements | P0 | S |
| Agent commissions | From `agent_earnings` (§3.5) | P0 | S |
| Ad spend | `ad_spend_daily(store_id, platform, account_id, campaign_id, campaign_name, day, spend_cents, currency, source enum(manual,csv,api))` | P0 manual/CSV · P2 API | S · L |
| Expenses | `expenses(store_id, day, category, amount_cents, recurring rule, note, attachment_asset_id)`: salaries, rent, tools, stock purchases, phone credit, packaging stock | P0 | S |
| Stock purchases (inventory value) | Ties into store inventory (catalog area); for COD sellers a simple "purchased qty × unit cost" log is enough first | P1 | M |
| Platform subscription | Auto-entered expense | P1 | S |

**Ad-spend API (P2, L):** the Meta Marketing API insights and the TikTok Business API reporting need OAuth app
review and per-store tokens **[unverified scope and review requirements; research before P2]**. P0 accepts the CSV
exports from Ads Manager, with column mapping presets **[preset formats unverified; build from real sample files]**.

### 5.3 Profit model (formulas the spec should fix)

Per order once final:

- **Delivered:** `net = collected − COGS − packaging − delivery_fee − cod_fee − agent_commission − allocated_ads`
- **Refused/returned:** `net = − (delivery_fee + return_fee + packaging + agent_commission_if_any + allocated_ads + damaged_stock?)`
- **Cancelled before shipping:** `net = − allocated_ads` (and any provisional commission is voided)

Ad allocation: spend of (day, campaign) is spread over the orders whose `utm_campaign`/`utm_id` match (orders
already store `utm`, `schema.ts:286`). Unmatched spend is spread over the day's orders per platform, or kept as
"unattributed". **P0 (day-level allocation), M. P1 (campaign-level), M.**

Headline KPIs (dashboard, per day/product/page/campaign/city/carrier):

| KPI | Formula |
|---|---|
| Delivered revenue | Σ collected on delivered |
| **Cost per delivered order (CPD)** | ad spend ÷ delivered orders |
| **True ROAS** | delivered revenue ÷ ad spend |
| Contribution margin | Σ net (delivered + failed) |
| Profit per delivered order | contribution ÷ delivered |
| Break-even CPA per product | (price − COGS − packaging − fees − commission) × expected delivery rate |
| Return/refusal cost | Σ failed-order costs |
| Cash position | collected-not-remitted + remitted − expenses (period) |

**P0, M.** This is the screen that turns a COD seller's spreadsheet into the product. A "profit calculator" per
product, which says what the max CPA is at the current confirmation × delivery rates, is a small and
much-loved helper. **P0, S.**

### 5.4 COD remittance reconciliation

- `remittances(id, store_id, carrier_id, statement_ref, period, paid_at, gross_cents, fees_cents, net_cents,
  file_asset_id, state enum(imported,matched,disputed,closed))` and `remittance_lines(remittance_id, tracking,
  order_id NULL, cod_cents, fee_cents, return_fee_cents, net_cents, match enum(matched,amount_diff,unknown,
  missing))`.
- Import CSV/XLSX statements with a column-mapping preset per carrier. Each carrier has its own schedule, fees and
  format: the Ozon remittance is "weekly or bi-weekly" with bulk statements
  (https://www.egrow.com/en/blog/ozon-express-morocco-cod-2026), Tawssil once claimed 24 h (2022 report above), and
  CTM pays by cheque or transfer. **XLSX parsing needs a dependency or a minimal parser: npm is slow on this PC, so
  start with CSV [decision for the architect].**
- Matching: by tracking → shipment → order. Flags: delivered but not on any statement after N days ("money in the
  wild"), amount differs from the order total, fee differs from the zone fee, statement line with no order.
  **P0 (CSV import plus matching plus "unremitted delivered" list), M.**
- Per carrier: an ageing view of "cash held by carrier" (0–7, 8–14, 15–30, > 30 days). **P0, S.** This is often
  the seller's largest invisible asset.

### 5.5 Tax and accountant exports (basics only, not advice)

- Morocco's VAT rates are 20 % standard, 10 % reduced and 0 % zero-rated (https://taxsummaries.pwc.com/morocco/corporate/other-taxes).
  Auto-entrepreneur regime: 0.5 % of turnover for commercial activity up to MAD 500,000, and 1 % for services up to
  MAD 200,000. Secondary sources only (https://www.bladi.net/maroc-mesures-fiscales-auto-entrepreneurs,53984.html ;
  https://beancount.io/fr/blog/2026/09/15/morocco-auto-entrepreneur-revenue-caps-2026-cpu-cnss-crossing-guide)
  **[verify with the DGI]**.
- Product: a store "tax profile" (none / auto-entrepreneur rate / VAT-registered with a rate), showing an
  **estimated tax reserve** line labelled "estimation, consultez votre comptable". Prices are entered TTC (tax
  included); VAT is extracted for VAT-registered stores. **P1, S.**
- Exports: sales register (orders delivered in the period, HT/TVA/TTC if VAT), remittance report, expense list,
  agent payouts, a P&L summary (CSV now, PDF P1), and a generic journal CSV
  (date, journal, account, label, debit, credit, piece ref) for import by an accountant. **P0 (sales + remittance +
  expenses CSV), S. P1 (journal + PDF P&L), M.** For France later, the "Fichier des Écritures Comptables" format
  **[not researched; P2]**.

---

## 6. Integrations ("the linking part")

### 6.1 Google Sheets, two-way (exists; upgrade)

| Upgrade | P | Effort | Note |
|---|---|---|---|
| Per-store sheet config, ownership proof, store-scoped pull (`AND store_id`) | P0 | M | Fixes SHT-01..11 (TENANCY-MAP §5.8). Mandatory for tenancy |
| Quota-aware scheduler: one platform service account = one Sheets "user", with **60 req/min per user per project** and 300/min per project (https://developers.google.com/sheets/api/limits). Batch every store's append and pull into ≤ 2 calls per tick, round-robin with a per-tick request budget, backoff on 429 (exists in the client) | P0 | M | At about 100 active stores, a 5-min tick needs ~200 calls, so a 5-min spread is fine; beyond that, use several SA projects or per-store SAs |
| Optional store-owned service account (the seller pastes their own JSON key) | P1 | S | Removes the shared quota and the "service account email" ownership confusion |
| Routing: tab per page/product/agent, or one sheet per landing page | P1 | M | TENANCY-MAP §9.2 asks for it |
| Pull more columns back: an agent's **note**, **tracking number**, **carrier**, and **delivery fee actually paid**, keyed by the existing optional-header mechanism (`row.ts:9-14`) | P1 | M | Many sellers keep logistics in the sheet; this lets them keep doing it |
| Status label mapping per store (the agents' own words → canonical) | P1 | S | |
| Near-real-time push from the sheet: a copy-paste Apps Script (installable onEdit → signed POST to `/api/hooks/sheets/<storeKey>`). Quotas: 20,000 UrlFetch calls/day (consumer) and 90 min/day trigger runtime (https://developers.google.com/apps-script/guides/services/quotas) | P2 | M | Gets status changes in seconds instead of 5 minutes |
| OAuth "Sign in with Google" sheet picker instead of sharing with an SA email | P2 | L | Google OAuth verification for the Sheets scope **[unverified requirements]** |

### 6.2 Outbound webhooks (P0, M)

- Events: `order.created`, `order.updated`, `order.confirmed`, `order.cancelled`, `shipment.updated`,
  `order.delivered`, `order.returned`, `lead.created`, `remittance.imported`. Payload v1 with the order snapshot
  (masked phone optional per endpoint).
- Signing per Standard Webhooks: headers `webhook-id` (stable across retries, the receiver's dedup key),
  `webhook-timestamp`, and `webhook-signature: v1,<base64 HMAC-SHA256 over "id.timestamp.body">`, plus a
  `whsec_` secret and rotation with two signatures (https://webhookrelay.com/verify-standard-webhooks-signature/ ;
  https://github.com/krofort/std-webhooks-go). Using the standard means Zapier/Make/n8n users can verify with
  off-the-shelf code.
- Delivery: `webhook_outbox(id, store_id, endpoint_id, event, payload, attempts, next_at, state)`, drained by
  `after()` (the existing pattern at `src/lib/orders/http.ts:51-63`) and the cron. Backoff 1 m, 5 m, 30 m, 2 h,
  6 h, 24 h, then dead, with a "replay" button. A 10 s timeout per call.
- **SSRF guard:** https only; resolve DNS and refuse private, loopback and link-local ranges; no redirects; max 10
  endpoints per store. **P0, S.** Mandatory on shared hosting.
- Delivery log per endpoint (last 100, status code, latency). **P0, S.**

### 6.3 Inbound API and no-code tools

- Per-store API keys (scoped: orders.read, orders.write_status, products.read), stored hashed. REST endpoints to
  list orders, get an order, update status and add tracking. This makes Zapier/Make "polling triggers" possible
  without a native app. **P1, M.**
- Native Zapier/Make apps. **P2, L.**
- Inbound "create order" API (orders from Instagram DMs, phone, or a marketplace), going through the same validation
  and pricing, with source `api`. **P1, M** (this also covers manual orders, §8).

### 6.4 Ad pixels and server events (exist; upgrade)

| Upgrade | P | Effort | Note |
|---|---|---|---|
| **Purchase trigger setting** per store or page: at order (today), at confirmed, at delivered. Plus custom events `ConfirmedOrder` / `DeliveredOrder` sent anyway | P0 | M | COD sellers want ads optimised on real buyers. The event id must stay deterministic so a browser Purchase isn't double-counted (the browser Purchase at order time must be turned off when "at confirmed" is chosen) |
| Respect Meta's 7-day `event_time` limit: one event older than 7 days fails the whole request (https://developers.facebook.com/docs/marketing-api/conversions-api/offline-events). Send each event alone or filter stale ones; for delivered > 7 days use an offline dataset (`action_source: physical_store`, upload ≤ 62 days, same page) or drop it | P0 | S | Without this, one late delivery silently kills a batch |
| TikTok offline events: the 28-day window and up to ~24 h processing are reported by third parties (https://docs.amperity.com/user/events_tiktok_ads_manager.html) | P1 | M | **[Verify the event_source values in TikTok's docs]** |
| Snap CAPI and GA4 Measurement Protocol server events | P2 | M | Only Meta/TikTok have server events today (`src/lib/pixels/ids.ts:12`) |
| Send refunds/returns as negative value or exclusion lists | P2 | M | **[Unverified per platform]** |
| Per-store pixel secrets (PIX-01) | P0 | M | Tenancy blocker |

### 6.5 Product catalog feeds (store mode)

- Per-store feed URLs `/<store>/feeds/meta.csv`, `tiktok.csv`, `google.xml`, served from the catalog, cached, with
  an unguessable key. Meta's core fields (id, title, description, availability, condition, price, link,
  image_link, brand; `item_group_id` for variants) per third-party summaries (https://www.pricefy.io/feed-channels/meta)
  **[confirm against Meta Commerce Manager docs]**. Google Merchant support for Morocco and COD-only stores
  **[unverified]**. **P1, M.** It enables dynamic product ads and catalog ads for stores with many products. Not
  needed for single-product landing sellers.

### 6.6 Product import (CSV)

- Shopify CSV: Handle groups variant rows; Title, Body (HTML), Vendor, Option1 Name/Value…, Variant Price, Image
  Src (images are fetched; SSRF-safe) per third-party guides (https://www.wemakewebsites.com/blog/shopify-product-import-csv-how-to-use-it-to-quickly-add-products)
  **[confirm with a real export]**. WooCommerce CSV and YouCan export formats **[not researched; need sample
  files]**. Map to `products` and Offers v2 items/options. **P1, M.** Body HTML must be sanitised to the store's
  rich-text subset.

### 6.7 Notifications

| Channel | What | P | Effort |
|---|---|---|---|
| Telegram bot | New order, daily summary, sync errors, "cash held > 15 days". Port `cod_telegram` from the PHP export (`order.php:2632-2660`) to a store setting (bot token encrypted). Free and very common among Moroccan sellers **[unverified as a statistic]** | P0 | S |
| In-app notifications plus browser push | New order for agents, callback due, assignment | P1 | M |
| Email | Needs the platform's outbound email (none exists); daily digest, payouts | P1 | M |
| SMS | Delivery notices/OTP. Local and international gateways exist (EnvoiSMS.ma claims direct links to Maroc Telecom, Orange and inwi; sms.to; D7); sender-ID rules conflict between sources, ANRT rules and Law 09-08 apply; ~0.10–0.20 MAD/SMS (Jan 2025, vendor) (https://sent.dm/en/resources/sms-compliance/morocco-sms-guide ; https://d7networks.com/sms/morocco/) | P2 | M |
| WhatsApp | §2.7 | P0 links / P1 API | — |

---

## 7. The learning loop (brief item 11, applied to operations)

Every order ends with a label (delivered / refused / returned / cancelled / fake), and every attempt has a time
and an outcome. These are cheap, private, per-store training signals. No GPU or external API is needed.

| Model | Inputs | Output | P | Effort |
|---|---|---|---|---|
| 7.1 **Per-store risk v2** | Today's `RiskInput` features (`risk.ts:20-44`) + customer history + city + hour + page + offer value + time to submit | P(refused or fake), shown as "risque élevé" with the top 3 reasons. Online logistic regression (weights per store, platform prior for new stores), retrained nightly by the cron on the last 90 days | P1 | M |
| 7.2 **Best time to call** | Attempt outcomes by hour × weekday × city | A suggested `due_at` for no-answer retries; replaces the static ladder once there is enough data (≥ 200 attempts) | P1 | S |
| 7.3 **Carrier/city choice** | Delivery outcomes by carrier × city | A suggested carrier per city; warns "Ville X: 45 % de refus avec Y" | P2 | M |
| 7.4 **Cancel-reason insights** | Reason codes + product/offer | "Price" dominant → suggest an offer change on the landing page (links to the generator) | P1 | S |
| 7.5 **Call script tuning** | Script version × confirmation rate × delivery rate | A/B the script variants per product | P2 | M |
| 7.6 **Address normalisation** | Free-text city/address → zone list | Fuzzy match plus Arabic/Latin transliteration, using the existing ar/fr city pairs (`cities-ma.ts`) | P0 (rules) / P1 (learned aliases) | S / M |

Each model must stay **explainable** (reasons shown) and **advisory** (it never cancels an order on its own),
consistent with the current rule at `risk.ts:1-5`.

---

## 8. Complete feature checklist (COD store and COD landing page)

Legend: **E** = exists today, **L** = landing, **S** = store, **B** = both.

### 8.1 Order intake and the shopper side
| Feature | Mode | P | Effort | State |
|---|---|---|---|---|
| COD order form, validation, idempotency, cents pricing, PHP parity | B | — | — | E |
| Offers v2 (bundles, options, bump, thank-you upsell) | B | — | — | E |
| Partial leads (abandoned forms) + recovery list | B | — | — | E |
| Turnstile, honeypot, risk flags, blocklist | B | — | — | E (scope per store P0) |
| Per-city delivery fee and ETA line | B | P1 | M | — |
| Cart and multi-line orders (OrderItems v3) | S | P0 for store mode | L | — (TENANCY-MAP §9.1) |
| Order tracking page for the customer (`/track/<orderId>+token`: status, carrier, tracking link) | B | P1 | S | — |
| Customer "confirm/cancel" link (signed) in WhatsApp/SMS | B | P1 | S | — |
| Manual / phone / DM orders created by agents (source `manual`) | B | P0 | M | — |
| Order editing after creation (lines, price override with reason) | B | P0 | M | — |
| Exchange and re-shipment flow (new shipment, linked order) | B | P1 | M | — |
| Stock decrement and reservation at confirmation (not at order) | S | P1 | M | — |
| Pre-order / out-of-stock waiting list | S | P2 | S | — |

### 8.2 Operations (back office)
| Feature | P | Effort | State |
|---|---|---|---|
| 3-axis status, state machine, legacy projection | P0 | M | — |
| `order_events` timeline in the drawer | P0 | M | — |
| Internal notes thread (separate from the customer note) | P0 | S | — |
| Claim queue, auto-assign, presence, leases | P0 | M | — |
| Retry ladder and callbacks with due times | P0 | S | — |
| Cancel reasons, call outcomes | P0 | S | — |
| Script panel (template) | P0 | S | — |
| WhatsApp click-to-chat with templates | P0 | S | partial (bare link) |
| Store-wide duplicate detection and merge | P0 | M | partial (same page, 12 h) |
| Customer profiles per store | P0 | M | — |
| Phone masking and reveal audit | P0 | S | — |
| Bulk actions (assign, status, export, print labels) | P0 | S | — |
| Saved views and filters (by agent, city, risk, due) | P0 | S | partial (filters exist) |
| Keyboard-first agent console (N = next, C = call, 1–6 outcomes) | P1 | S | — |
| Picking list, packing slips, manifest PDF | P0 | M | — |
| Shipments and the manual carrier adapter (CSV out/in) | P0 | M | — |
| Carrier API adapters (Sendit first) | P1 | M each | — |
| Carrier webhooks and tracking polling | P1 | S | — |
| Return handling (received, restock, damaged) | P1 | S | — |
| WhatsApp Cloud API confirmation bot | P1 | L | — |
| AI suggestions (risk v2, call time, reasons) | P1 | M | — |

### 8.3 Team
| Feature | P | Effort |
|---|---|---|
| Roles: owner/admin/manager/agent/logistics (+ accountant/viewer P1) | P0 | M |
| Invites (TENANCY-MAP `store_invites`) | P0 | M |
| KPIs: confirmation rate, delivery rate, first touch, attempts | P0 | M |
| Commission rules, earnings ledger, agent statement | P0 | M |
| Payout batches, approvals | P1 | S |
| Leaderboard (opt-in), manager live board | P1 | M |
| External confirmation-team membership | P2 | M |
| VoIP click-to-call and recordings | P2 | L |

### 8.4 Finance
| Feature | P | Effort |
|---|---|---|
| Product cost with history, packaging, cost snapshot on the order | P0 | M |
| Carrier zones with delivery/return/COD fees | P0 | S |
| Ad spend (manual + CSV) and expenses | P0 | S |
| Profit dashboard: CPD, true ROAS, margin, per product/day/page/campaign | P0 | M |
| Per-product break-even calculator | P0 | S |
| Remittance CSV import, matching, cash held by carrier ageing | P0 | M |
| Accountant exports (sales, remittances, expenses CSV) | P0 | S |
| Tax profile and reserve estimate; journal CSV; PDF P&L | P1 | M |
| Ad spend API import (Meta/TikTok) | P2 | L |
| Multi-currency stores; FEC export (FR) | P2 | M |

### 8.5 Integrations
| Feature | P | Effort | State |
|---|---|---|---|
| Google Sheets per store, quota scheduler | P0 | M | E (single tenant) |
| Signed outbound webhooks with outbox, SSRF guard, log | P0 | M | — |
| Telegram notifications | P0 | S | PHP export only |
| Purchase trigger setting (order/confirmed/delivered) + 7-day guard | P0 | M | — (fires at order) |
| Store API keys + REST (Zapier/Make polling) | P1 | M | — |
| Sheets: more pulled columns, routing per tab, own SA | P1 | M | — |
| Catalog feeds (Meta/TikTok/Google) | P1 | M | — |
| Product CSV import (Shopify first) | P1 | M | — |
| Email notifications | P1 | M | — (no email at all) |
| SMS gateway adapter | P2 | M | — |
| Snap/GA4 server events | P2 | M | — |
| Apps Script real-time sheet push; Google OAuth picker | P2 | M/L | — |

### 8.6 Platform-admin view of operations (feeds the platform-admin research)
For each store profile: orders by state, confirmation and delivery rates, agents and their activity, carriers
connected and their health (last webhook, failure rate), sheet health (exists as `syncHealth`, needs scoping),
webhook dead letters, outbox depth, remittance ageing (*aggregates only*, no customer PII by default), and an
audited "support view". Platform-wide: the slowest stores in the cron budget, Sheets quota use, carrier error rates.
**P0 (counts and health), M.**

---

## 9. Data model summary (new tables for this area)

`order_events`, `customers`, `order_notes` (or note-type events), `agent_presence` (or columns on
`store_members`), `assignment_rules`, `agent_earnings`, `commission_rules`, `payouts`, `agent_stats_daily`,
`shipments`, `shipment_events`, `carriers_connected` (store × adapter, encrypted creds in `store_settings`),
`carrier_zones`, `remittances`, `remittance_lines`, `product_costs`, `ad_spend_daily`, `expenses`,
`finance_daily`, `webhook_endpoints`, `webhook_outbox`, `api_keys`, `notification_channels`, `message_templates`
(WhatsApp/SMS/Telegram text per locale).

New columns on `orders`: `confirm_state`, `ship_state`, `money_state`, `assignee_id`, `lease_until`, `claim`,
`due_at`, `attempts`, `priority`, `cancel_reason`, `customer_id`, `cost_snapshot` JSON, `carrier_id`, `tracking`,
`merged_into`. Indexes: `(store_id, confirm_state, due_at)`, `(store_id, assignee_id, confirm_state)`,
`(store_id, ship_state, updated_at)`, `(store_id, money_state)`, `(store_id, tracking)`.

Every table has `store_id NOT NULL` with no default (TENANCY-MAP §2.3).

**Storage budget (3 GB MariaDB):** `order_events` is the largest, at about 10–15 rows per order × ~300 B ≈
4 KB/order. 100k orders/year ≈ 400 MB. Keep raw carrier payloads only 30 days (truncate `raw` after that), and roll
older events into the daily tables. **[Estimate, not measured.]**

---

## 10. Risks

1. **Carrier APIs are private.** Building adapters from integrator blogs would break and could leak customer data.
   Only build from the docs the carrier provides, and ship the CSV path first.
2. **Shared Google quota:** one platform service account means one tenant's heavy sheet use can throttle every
   store's sync. Use a per-tick request budget and store-owned SAs.
3. **Agent data exfiltration:** call-center agents have phone numbers by necessity. Masking, reveal audit, no
   export, and alerts are mitigations, not guarantees.
4. **Commission incentives:** paying on confirmation drives fake confirmations. Default to paying on delivered,
   with a clawback.
5. **Purchase-on-delivered vs ad attribution windows:** delivered events often arrive more than 7 days after the
   click, and Meta rejects the whole batch if one event is stale. Guard and test it.
6. **No workers, 5-min cron, 110 s budget:** carrier polling, Sheets, webhooks, WhatsApp and nightly rollups all
   compete in one tick. A per-store round-robin cursor and per-step budgets are needed (TENANCY-MAP SHT-11).
7. **Shared refusal networks and data-protection law** (Law 09-08 / CNDP; GDPR for Europe): opt-in only, legal
   review first.
8. **Status projection drift:** the sheet, CSV and PHP export expect the 9 legacy labels. The derived `status` must
   be the only column they read, and new labels must be appended, never renamed.
9. **XLSX imports:** carrier statements often come as XLSX, and adding a parser package is slow here. Decide
   between CSV-only at P0 and a vetted minimal dependency.
10. **WhatsApp Cloud API onboarding** (store-owned WABA, business verification, template approval) can take days
    per store. Keep click-to-chat as the always-available path.

---

## 11. Unverified items (to check before building)

- Field-level request/response formats of every carrier API, including Sendit's (only endpoint names are known).
- Whether Ameex, Coliix, Ozon Express, Cathedis and Speedaf give API access to a SaaS platform acting for a merchant
  (vs only to the merchant).
- Morocco WhatsApp template rates (rate card CSV/PDF) and whether utility templates inside the service window are
  still free after the 2026-10-01 update. WABA Embedded Signup and Tech Provider requirements.
- TikTok Events API offline `event_source` values and the time limits.
- Meta catalog required fields (only third-party summaries were read). Google Merchant Center availability for
  Morocco-targeted COD stores.
- Formats of the Meta/TikTok Ads Manager CSV exports, the WooCommerce/YouCan product CSVs, and carrier remittance
  statement files (collect real samples from the owner).
- Morocco auto-entrepreneur caps and rates (secondary sources only), and the e-commerce VAT threshold reported by
  the press.
- Whether Hostinger's Node proxy supports SSE/websockets (polling is assumed).
- All market percentages (COD share, confirmation and RTO rates) are vendor claims.
- Storage estimate for `order_events`.
