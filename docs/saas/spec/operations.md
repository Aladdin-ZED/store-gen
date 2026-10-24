# Store Gen SaaS part spec: orders, call center, agents, accounting, integrations

Status: **part spec, revision 4 (round 2 review integrated)** (2026-10-24, operations part architect). Built on
`docs/STORE-SAAS.md` **revision 3** (cited as **core §X**, its decisions as **core D1 … D76**, its review decisions as
**core §P** and its third-round request decisions as **core §Q.8**; every revision 1 request of this part was decided
in **core §Q.4**, all 25 accepted as written; every revision 3 request (OPE-§Q.27a … o) was decided in core §Q.8, 13
accepted as written and two accepted with a change, Q.27h and Q.27k, which this revision now follows) and on the
settled research decisions **R-D1 … R-D53** (`docs/saas/RESEARCH.md` §2). **Reviewed twice**: OPE-§R records every
round-1 finding (OPS-1 … OPS-29 and the cross findings that name this file) with the decision and the section it
changed, and **OPE-§R2** records round 2 (the same findings re-checked against core rev 3, plus the critic's CRIT1,
CRIT2, CRIT3, CRIT4, CRIT14, CRIT15, CRIT17); the round-1 decisions are **OD47 … OD62**, round 2 adds **OD63 … OD65**
(OPE-§0) and changes OD47, OD57, OD61 and OD62 in place where the core decided differently (each change carries a
**rev 4:** marker). Round 2 raised **no new request to the core**: every core-side alignment it needs is a contradiction
between core rev 3's own sentences, listed for the maintainer in OPE-§R2's notes (core §Q.8 closing rule).
This document is the contract for the R1 product tracks **P4 CALL CENTER**
and **P5 INTEGRATIONS** (core §K.2), the R2 tracks **S3 MONEY**, **S4 LOGISTICS** and **S5 INTEGRATIONS 2** (core §K.4)
and the R3 track **D2 CARRIERS & MESSAGING** (core §K.5). It refines only the tables core §D.9 gives to operations.md,
adds product behaviour, and never renames a table, changes a `store_id` rule, changes a seam signature or moves a
file between tracks. **OPE-§Q** now records how each revision 1 request was decided and where the core carries it;
its last subsection lists the two second-round requests this revision could not avoid. Where this document and an
older doc disagree, the core wins, then this document. The section **OPE-§E "Elevation changes (rev 2)"** lists every
change of this revision with its source.

Inputs: `docs/STORE-GEN-BRIEF.md` (owner items 1-16; item 16 = this elevation pass), `docs/HANDOFF.md` (owner rules
§2, Hostinger §4), `docs/saas/TENANCY-MAP.md` (items ORD-xx, SHT-xx, PIX-xx, EXP-xx), `docs/saas/RESEARCH.md` (feature
ids OP-, AC-, IN-), `docs/saas/research/cod-ops.md` (cited as **CO §n**), `docs/saas/research/rethink-features.md`
(cited as **RF §n**: SF-04 Profit Guardian, SF-05 test orders, SF-06 pulse, SF-07 Call Center Autopilot, SF-09 Carrier
Reconciliation, SF-03 health inputs, SF-11 Growth Autopilot data, the admin UX ceiling §2.1 and the 3-minute wow demo
§4), `docs/saas/research/rethink-ai.md` (cited as **RA §n**: §4.5 Darija scripts per product, never per customer; §4.7
risk explanations from flags and the store's own numbers; §4.2 insights from a deterministic decomposition; §9.14,
§9.15), `docs/saas/research/design-baseline.md` (its §5 targets T1, T7, RTL1, RTL5, RTL7 bind the agent console: cited
as **DB T1** etc.), `qa/ref/anti-slop-frontend-rubric.md` (§4.5, §4.6, §9.D adopted for the operations screens; the
owner rules win where they conflict), `docs/saas/spec/ai.md` (AI-15, AI-23), `docs/saas/spec/platform.md`
(notifications, console), `docs/saas/spec/landing.md` (leads, zones, tracking, kit). Format model: `docs/OFFERS.md`.
Code facts are `path:line` at commit `ae4e6c0` (`src/**` and `scripts/**` are byte-identical to `68c3793`, the revision 1
commit, checked with `git diff --stat`; every cited line was re-read for this revision).

Reading order for a build agent: OPE-§0 (decisions) → OPE-§1 (feature map: find your ids and your track) →
OPE-§P (file ownership) → the sections your files touch → OPE-§M (actions, routes, permissions) → OPE-§N (copy keys)
→ OPE-§O (tests you must keep green; §O.4 tells you which test proves your feature ids) → OPE-§Q (how the core decided
this part's requests; the stubs it freezes in step P0 are in core §K.2) → OPE-§E, OPE-§R and OPE-§R2 (what changed in
each revision and why).

Section map: §0 decisions · §1 feature map · §2 data · §3 order state machine (rev 3: delivery-attempt states,
holds, return reasons, collected amount, settlement, refunds) · §4 timeline and notes · §5 claim queue, presence,
assignment (**§5.7 inbound calls, new**) · §6 outcomes, retry ladder, callbacks (delivery lane) · §7 call script ·
§8 phone masking and reveal · §9 customers, duplicates, blocklist · §10 address normalisation (one city key), risk
explanation · §11 manual orders, editing, lead conversion (**§11.5 catalog orders, new**) · §12 orders list, saved
views, bulk, export (Carrier CSV), print, drawer · §13 agent console UX (a day in the queue) · §14 manager board,
agents, KPIs · §15 commissions and payouts · §16 accounting · §17 carriers and shipments · §18 CSV importers ·
§19 Google Sheets (the R1 carrier and attribution loop) · §20 ad events (CAPI / Events API) · §21 Telegram and ops
notifications · §22 WhatsApp · §23 signed webhooks · §24 anti-spam settings and Turnstile · §25 later integrations ·
§26 test orders · §27 data for the platform, health, pulse, exports, insights · §28 integration health, deliveries log
and replay · §J jobs and time budgets · §L limits · §M server actions, routes, permissions · §N copy keys · §O tests ·
§P file ownership · §Q requests to the core (decided; §Q.27 third round, decided in core §Q.8) · §E elevation
changes (rev 2) · §R review decisions (round 1) · **§R2 review decisions (round 2, new)**. **§O.4 "Proven by"** (new in
rev 4) maps every feature id of §1 to the test command and fixture or harness step that proves it.

### Owner summary (plain English)

1. Every order now has three separate states: **confirmation** (new, being called, call back later, confirmed,
   cancelled, fake, duplicate, unreachable), **delivery** (to pack, shipped, on the way, delivered, refused at the
   door, returned, lost) and **money** (not paid, cash collected by the carrier, paid to you, disputed, written off).
   Your Google Sheet still shows one status in column C, with a few new words added at the end of the list.
2. Every order has a **timeline**: who called, when, what the customer said, every edit, every status change, every
   time someone looked at the phone number. Internal notes live there too.
3. Agents work in a **call-center screen** on their phone or laptop: press **Next**, the best order to call appears,
   call or open WhatsApp, tap the result. No-answer orders come back automatically later (a 6-step retry plan you can
   change), callbacks come back at the exact time the customer asked, outside your calling hours nothing is handed
   out.
4. Phone numbers are **hidden** (06 •• •• 12 34) until someone taps Call or WhatsApp, and every reveal is recorded.
   Agents see only their own orders, cannot export, and never see your sheet link.
5. A **call script** in Darija, French or English is built from the order itself (product, pack, total, city), and a
   WhatsApp message template is ready in one tap. Nothing in them is invented: they only say what is on the order or
   in your settings.
6. **Customers** get a profile per shop ("3 delivered, 1 refused"), possible double orders are flagged, and you can
   block a number and cancel its open orders in one step.
7. Agents can create orders taken by phone or WhatsApp, and edit an order before it ships. Prices always come from
   the page, never typed by an agent.
8. The manager sees the **live board** (orders waiting, oldest callback, who is online and on which order) and each
   agent's **confirmation rate and delivery rate**, so you know who confirms orders that really arrive.
9. In R1 you also get **Profit lite**: type your product cost, packaging, delivery and return fees and your daily ad
   spend, and the app tells you the most you can pay per order at *your own* confirmation and delivery rates, and
   warns you when a campaign goes under water. Full accounting comes in R2: cost frozen on each shipped order,
   expenses, carrier payment statements matched line by line, cash still held by each carrier, accountant exports.
10. In R2 agents are paid **per delivered order** (counted as pending when they confirm, earned when it is delivered,
    cancelled if the parcel comes back), with a live statement for each agent and payouts you approve.
11. Delivery companies: in R2 you export a manifest file for your carrier and import its tracking, status and payment
    files (CSV). Carrier APIs come in R3, built only from the documents a carrier gives us.
12. Integrations in R1: your **own Google Sheet per shop** (you prove it is yours by pasting a code into it),
    **ad events** sent when the order is placed, confirmed or delivered (your choice), **Telegram** alerts (new
    orders, daily summary, sync problems) and **WhatsApp** templates. Signed webhooks for Zapier, Make or n8n come in
    R2; an API, catalog feeds and product imports in R3.
13. Test orders made from your shop's test link show a TEST chip and never count in your numbers, your sheet or your
    ad accounts.
14. **New in revision 2.** The call-center screen is built to be used **all day on a phone**: Next, Call, the result
    and the next order arrive in one round trip; a double tap or a dropped connection never records the same call
    twice or loses a result (the result waits and retries for 30 seconds); at the end of the day the agent sees
    "Today: 23 decided · 15 confirmed · 2 callbacks for tomorrow". The manager sees the hours of the day when your own
    customers pick up (your data, with the count behind it).
15. Every risk chip explains itself with your own numbers: "To check: same phone had 2 orders that did not arrive;
    in your shop, orders like this one turned out fake 38% of the time (52 orders)". A score never blocks an order.
16. Every integration has one page: what is connected, what is late, what failed and why, and a **Replay** button
    for a failed delivery (ad event, Telegram, webhook). Nothing is retried silently forever.
17. Accountant-grade exports (R2): every line carries its reconciliation state (not yet paid, paid by the carrier,
    disputed, written off, refunded) and the statement it was paid on; the file carries a header with the period, the
    row count and a checksum, and once you close a month nothing in it changes behind your back.
18. **New in revision 3 (after the first review).** A parcel the courier could not deliver ("client injoignable",
    "reporté") comes back to your agents as a **delivery problem** to rescue by phone, with its own result buttons
    (customer informed, deliver on another date, cancel and recall the parcel); a customer who says "deliver after
    the 5th" is confirmed with a **deliver-from date** and the warehouse does not ship before it; every refusal or
    return carries **a coded reason** (absent, price, damaged…), so you see *why* a city refuses, not only how much.
19. If you **deliver yourself**, cash is yours the moment the parcel is delivered (no "held by carrier" ageing); if a
    carrier pays you later, you keep the statement matching. A partial delivery (one item refused) records the amount
    actually collected; a cash refund after delivery is its own money state, so delivered revenue is never overstated.
20. Teams that work **in the Google Sheet** are first-class: the sheet's "Agent", "Note agent", "Tracking" and
    "Transporteur" columns come back into the app in R1, agents named in the sheet get their numbers (and, in R2, their
    commissions once you map the name to a person), and a **Carrier CSV** export with your own column names replaces
    the hand-built upload file. A customer who calls you back is handled by whichever agent picks up, by phone number.
21. Every operations screen you read every day (orders, board, customers, settings, integrations, Profit lite) ships in
    **French and English** in R1; the agent screen also in Darija Arabic. Ad spend typed in **USD or EUR** is converted
    with a rate you type and date (shown as your estimate), never a hidden one. Your calling hours live in one place
    and drive the thank-you page's "we call you today from 09:30" as well as the agents' queue.
22. **New in revision 4 (after the second review).** The thank-you page and your message templates promise a calling
    hour **only once you have saved your hours** (before that the queue still works with sensible starting hours, but
    no customer is told a time you never chose). Exporting orders or the carrier file asks you to confirm it is you
    (your 2FA code or your password) once every 5 minutes, because those files carry full phone numbers. Every
    feature in this document now names the test that proves it (OPE-§O.4).

---

## OPE-§0. Decisions at a glance

R-D1 … R-D53 and core D1 … D76 are settled; the 25 requests of revision 1 (core §Q.4) and the 15 of revision 3 (core
§Q.8) are decided, so no row below still depends on a pending request. Rows below are this part's own decisions;
**deviates** / **refines** name the settled decision that changes and why. OD36 … OD46 are new in revision 2 (sources
in OPE-§E); OD47 … OD62 are new in revision 3 (each names the round-1 finding it answers, OPE-§R); **OD63 … OD65 are
new in revision 4** (OPE-§R2). Where a later decision changes an earlier row, the earlier row carries a "**rev 3:**" or
"**rev 4:**" note rather than a silent rewrite, so the history stays readable; in OD47, OD57, OD61 and OD62 the
superseded clause itself was corrected (a builder must not read a contract the core declined) and the note says what
changed.

| # | Decision | Why |
|---|---|---|
| OD1 | **One spec, six tracks.** R1: P4 builds OPE-§3-§14, §16.2 (Profit lite), §26, §27 (reads), §28 (the store side of deliveries); P5 builds §19-§22 (R1 parts), §24, §28 (health rows and handlers). R2: S3 builds §15, §16.3-§16.9 (rev 3: incl. the XLSX writer of §18.6 and the refund / probable-match actions); S4 builds §17 (R2 parts), §18 (carrier mappings), the OP-06 merge (§9.4), OP-18/OP-19 and, rev 3, the store-mode branch of the manual-order sheet (§11.5; rev 4: it calls S1's v3 order functions, it does not write them); S5 builds §23 and the IN-09 parts of §19 (rev 3: four of its columns moved to P5 in R1, §19.4). R3: D2 builds the R3 parts of §17, §20, §22, §25 and AC-08…AC-11. Core merge order puts P5 before P4 (core §K.2: P8 → P2 → P1 → P5 → P4 → P3 …): P4 imports P5's finished `src/lib/integrations/templates.ts` and `scheduleSheetPush`; P5 builds against P4's frozen P0 stubs (`applyExternalStatus`, `projectStatus`, `appendOrderEvent`). File lists are the core's §K.2 P4 / P5 rows verbatim (OPE-§P). | Core §K.2/§K.4/§K.5 split; the dependency arrows then point one way inside each release. |
| OD2 | **The app is the source of truth for order state; the sheet is a two-way mirror.** Status writes never wait for Google; a sheet edit enters as an external event through the state machine with a conflict rule (OPE-§19.6). **Deviates from today's behaviour** (`src/lib/sheets/sync.ts:16-17`, `src/lib/orders/admin.ts:166-171`: "the sheet is the source of truth for statuses once connected", sheet written first). | Agent actions must answer in ≤ 500 ms (RF §2.1); one platform service account is one shared Google quota (R-D24); one timeline needs one writer. |
| OD3 | **Three axes per R-D17** with the exact transition tables of OPE-§3.2. `orders.status` is written only by `transitionOrder()` and by the creation insert, always as `projectStatus(states)`. Legacy labels are appended, never renamed; `lost` ("Perdue") is appended next to the core's four (accepted: core §D.2 lists the five labels, core §Q.4 Q.2). | Sheets, CSV and the PHP export read the 9 legacy ids (`src/lib/orders/contract.ts:304-314`); a lost parcel is not a return. |
| OD4 | **Optimistic concurrency on `orders.rev`** (compare-and-set, `rev = rev + 1` in every state or line write). A stale write answers `conflict` with the fresh state; no last-writer-wins for people. | Two agents, a sheet pull and a carrier import can touch one order within seconds. |
| OD5 | **External sources move through `applyExternalStatus()` with implied transitions**: a "Expédiée" from the sheet confirms an unconfirmed order first (events marked `implied`); moves out of a terminal confirmation state (cancelled, fake, duplicate, unreachable) are refused from external sources, written as `external_rejected` and the sheet cell is rewritten with the app's label. | Sheets and carriers skip steps; a cell edit must not resurrect a fake order. |
| OD6 | **Order hooks run in two phases**: `inTx` (outbox enqueue, customer counters, commission ledger) inside the transition transaction, `afterCommit` (Sheets push scheduling, in-app notifications, lease bookkeeping) after it (the shape is frozen in `src/lib/orders/hooks.ts` at core §K.1 C0; accepted Q.7). | CAPI, Telegram and webhook deliveries are exactly as durable as the state they describe (R-D25); slow work never holds the order row lock. |
| OD7 | **Claim queue per R-D19**: one atomic `UPDATE … ORDER BY … LIMIT 1` with a claim token, lease 10 minutes renewed by every action on the order, **one active claim per agent**, callbacks stay with their agent until `due_at + 15 min`. Assignment modes: `pull` (default), `round_robin` (smooth weighted, daily caps, under a store named lock, falls back to pull), `manual`. **rev 3 (OD60):** the lease default is **15 minutes** and the presence heartbeat renews it while the agent holds a claim, so a long call never hands the order to a colleague. | MariaDB 10.4 has no `SKIP LOCKED` (core §D.1); the pull model needs no worker; a callback the customer asked of Samira should reach Samira. |
| OD8 | **The queue is computed on read.** No job moves order states; ladder exhaustion happens inside the outcome that exhausts it; leases expire by comparison with now. The only call-center job marks stale presence offline (OPE-§J). | No workers, a 5-minute cron (core §H.2). |
| OD9 | **Calling window per store** (store timezone, up to 3 ranges per weekday, closed dates, a 2-hour "Open calls now" override, audited). Next outside the window answers `outside_window` with the next opening time. Default ranges are reasoned starting values **[to tune]**: every day 09:30-13:00 and 14:30-21:00, Friday 09:30-12:15 and 14:30-21:00. **rev 3 (OD57):** weekdays are **ISO 1-7** (Monday first, like `checkout.calendar.workdays`), up to **4 date-ranged overrides** (Ramadan hours, dates typed by the owner, never pre-filled) are evaluated before the weekly table, and this window is the **one source** of every "hours" promise the store makes (thank-you `{when}`, `confirm_hours`, tracking help). | CO §2.1 guidance is vendor advice without data; the store's own numbers replace it (AI-23, R3). |
| OD10 | **Retry ladder**: 6 steps by default (immediately, +1 h, +3 h or next window, next day 11:00, next day 18:30, day +2 at 11:00), busy / switched off retried once after 20 min, then the ladder; after the last step `unreachable` (policy `close`) or one try per day for 7 days (`keep_open`). Steps are editable (1-10). The best-time learner (AI-23, `docs/saas/spec/ai.md`) only suggests an hour inside the window, from R3. | CO §2.4 defaults, explicitly "not researched optima"; R-D27 learning is advisory. |
| OD11 | **Phones are masked for every role** in lists, queue, timeline, customers, ⌘K, notifications and Telegram (default). The full number comes only from `revealPhone()` (writes `phone_revealed`) and from exports by `orders.export` holders. Owners, admins and managers reveal without a reason prompt; agents reveal by tapping Call or WhatsApp. | OP-07, R-D16 spirit; one code path for every role keeps the audit complete. |
| OD12 | **Agents see only their orders**: `assignee_id = me OR confirmed_by = me`, created within 30 days. No CSV, no sheet link, no customer list outside those orders. | Core §A.3.2 `agent*`; CO §3.3 exfiltration risk. |
| OD13 | **Duplicates in R1** = store-wide flag + link + "Mark as duplicate" / "Keep both" (`orders.merged_into` holds the kept order id). **Merge** (combined lines, one parcel, one fee) moves to R2 (S4). **Refines OP-06** per RF §3.3. | Merge touches pricing parity, Sheets rows and the PHP export; the flag already stops the double parcel. |
| OD14 | **Customers per (store, E.164 phone)**, counters kept by hooks and reconciled nightly; nothing crosses stores (ORD-05). The opt-in cross-store refusal network (OP-28) is not built until a Law 09-08 / CNDP review. | CO §2.6; the store's own history is the best fake-order signal. |
| OD15 | **Manual orders and edits are priced only by `validate.ts` + `pricing.ts`** against the order's version doc (else the current published version). Agents never type a price; a manager or above may add one "adjustment" in cents (≤ 0, reason required, audited). | Owner rule 4 (never invent prices); one cents engine (Offers D8, D9). |
| OD16 | **Manual orders send no ad events by default** (setting `conversions.manualOrders`), skip the risk score except the blocklist, and carry source `manual` or `whatsapp` (core D42). | No click to attribute; agents are not bots. |
| OD17 | **KPI definitions are fixed** (OPE-§14.3): confirmation rate = confirmed ÷ (confirmed + cancelled + unreachable); agent delivery rate = delivered ÷ (delivered + refused + returned + lost) of the orders the agent confirmed; first touch measured in calling-window minutes. Rates show only with n ≥ 20 (agent) or n ≥ 30 (store), always with n. **Refines CO §3.4** ("delivered ÷ shipped", raw minutes). | In-flight parcels distort "÷ shipped"; a night order is not a slow agent; owner rule 4 spirit (no unexplained numbers). |
| OD18 | **Purchase trigger per store, with per-page overrides**: `order` (default, today), `confirmed`, `delivered` (R-D23). When it is not `order`, the thank-you document is rendered **without the pixel chunk**, so no browser Purchase exists, and the server sends Purchase with `event_id = orderId` at the trigger. Meta custom events `ConfirmedOrder` (id `<orderId>.c`) and `DeliveredOrder` (id `<orderId>.d`) are sent when `customEvents` is on. | A browser Purchase at order time would count every order and dedupe away the server event; runtime config v2 and the 24.2 KB landing chunk stay frozen (zero runtime bytes; accepted: core §H.3 `purchaseInBrowser`, reason `conversions`). |
| OD19 | **A human or carrier verification lifts the risk ≥ 70 gate** for `confirmed` and `delivered` triggers (`CONVERSION_MAX_RISK`, `src/lib/orders/conversions-core.ts:45`). Test orders, honeypot rows and manual orders never send. | The gate keeps bots out of ad optimisation; an order an agent confirmed is verified. |
| OD20 | **7-day guard**: an event whose `event_time` is older than 7 days minus 1 hour at send time is dropped (timeline event `capi_stale`), never sent; each event stays one request per pixel (today's pattern, `conversions-core.ts:533`). Offline datasets are R3+ **[verify]**. | One stale event fails the whole Meta request (CO §6.4). |
| OD21 | **The CAPI context is sealed on the order** (`orders.capi_ctx`, envelope v2, purpose `capi-ctx`) only when a later trigger may need it, and nulled after 8 days or once every trigger event is sent. | The client IP is otherwise not stored (only its hash, `src/lib/db/schema.ts:291`); minimal retention. |
| OD22 | **Sheets per store** (core `sheets` key): ownership proved by a code the owner pastes into the sheet, `sheet_bindings` unique across stores, one generic refusal; per store per tick at most **one read, one append, one batchUpdate**; a platform bucket of 50 Google calls per 60 s and a 90 s breaker on 429. Accepted by the core (§H.2 slot 1 now reads "≤ 3 Sheets calls per store per tick"; `pending_sheets` predicate and `p:sheets:sa` in §E.2 / §E.8; core §Q.4 Q.11). | R-D24, SHT-01…SHT-11; the read that finds row numbers is the same read that pulls statuses. |
| OD23 | **Telegram per store** (owner's own bot and chat): new orders batched over 45 s, masked phone and no address by default (owner may switch to full), daily summary at the store's hour, sync and integration failures, all through the outbox kind `telegram`. | IN-04; Telegram group limits; privacy-preserving default for a chat that often includes agents. |
| OD24 | **WhatsApp click-to-chat templates** are `message_templates` rows with channel `whatsapp`, edited with `callcenter.configure` (managers keep quick replies current). Built-in templates are code constants (no seeding writes); a closed variable list with optional blocks; a template can only say what is on the order or in the store's settings. WhatsApp Cloud API templates (R3) need `integrations.manage`. Accepted: core §A.3.1 now reads "Click-to-chat templates and quick replies sit under `callcenter.configure`" (core §Q.4 Q.3e). | Quick replies change daily on the floor; Cloud API credentials are the sensitive part. |
| OD25 | **Profit lite ships in R1** (SF-04, RF §1.4): item costs, packaging, a default and per-city carrier fee and return fee, manual daily ad spend, break-even CPA with intervals, three alerts; behind the release flag `finance_lite` (declared in `src/lib/flags/defs/ops.ts`, default `true`, core §D.4). Full AC-01…AC-07 stay R2. **Deviates RESEARCH AC-01/AC-03/AC-05 timing** for a lite slice; accepted as core **D63** (`product_costs`, `carrier_rates`, `ad_spend_daily`, `profit_alerts` in 0005; `finance.read` / `finance.write` R1 for owner and admin). Nothing else in R1 depends on it, so the maintainer can defer it by flipping the flag. | Brief item 10; "how much can I pay per order" is the question before every budget increase. |
| OD26 | **Profit is computed per placed-day cohort** (ads and orders of the same day), cash per remittance date; integer cents; one currency per store; the nightly rollup recomputes the last 45 days. | Ad spend is daily; COD outcomes arrive days later; idempotent recompute beats incremental drift. |
| OD27 | **Commission ledger per R-D20** with explicit clawback entries (a paid row is never changed), tier bonuses at period close, payouts draft → approved → paid. Commissions post to finance as `commission_cents` per order, never as `expenses` rows. | Auditability; no double count. |
| OD28 | **Carriers per R-D21**: `CarrierAdapter` + the `manual` CSV adapter in R2; API adapters only from carrier-provided documents (Sendit first, R3). Manifests, picking lists and slips are print-optimised HTML (browser "Save as PDF"); no PDF dependency. | npm installs are slow here (HANDOFF §3); no headless browser on Hostinger. |
| OD29 | **One generic CSV importer** (core D38): in-house RFC 4180 parser with delimiter, BOM and encoding detection (UTF-8, UTF-16LE, Windows-1252), saved column mappings per store, a dry-run preview before commit, idempotent re-imports. XLSX (AC-10, R3) through an in-house minimal reader (zip + XML, `node:zlib`), no dependency. | Carrier, ads and product files vary; presets come only from real files (core D38, RESEARCH §6.3 Q5). |
| OD30 | **Signed webhooks in R2** per Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`), SSRF guard (SE-07), masked phone by default per endpoint, at most `webhooks_max` endpoints. | R-D25, IN-07; off-the-shelf verification in Zapier, Make and n8n. |
| OD31 | **Test orders (SF-05)** are consumed everywhere in operations: TEST chip in the queue, excluded from KPIs, finance, Sheets, ad events, commissions and learning, Telegram says "[TEST]". The flag is **core-owned** (`orders.is_test`, `leads.is_test`, core D54): the public path sets it from the store-signed token, sets `sheet_status = 'disabled'` and skips the CAPI enqueue and `bumpOrderStats` (core §K.1 T3); operations never sets or clears it. | RF §3.1: sellers and QA walk the full flow without poisoning stats or ads. |
| OD32 | **Agent-first entry**: an agent's store landing is `/app/<h>/queue` (core §B.4 `landingPathFor`); the queue is phone-first (a 2 × 3 outcome grid, 44 px targets) and keyboard-first on a laptop (`N`, `C`, `W`, `1`-`6`, core §I.3). **OP-17 raised from R2 to R1** (RF §3.2, core §L.2). | The call center is the R1 product (RF §2.10). |
| OD33 | **Realtime = the core pulse plus one board endpoint.** The queue header reads its counters from the shared pulse (`StorePulse.counts.queueNow`, `.dueCallbacks`, `.newOrders`, `.syncFailed`, contributed by `src/lib/pulse/contributors/ops.ts` and `integrations.ts`, ≤ 50 ms each, core D57 / §I.4: one poller per browser, `304` when unchanged); only the manager board polls `/api/app/<h>/ops/state?view=board` every 15 s while visible (ETag, 5 s per-store cache). The presence heartbeat is its own `POST /api/app/<h>/ops/presence` every 60 s while online and visible (a write never rides on the pulse). **Refines revision 1's OD33** (two pollers per agent tab). | R-D50, core D46, D57; one Node process must stay cheap at 15 s polling. |
| OD34 | **Languages**: queue, drawer actions, outcomes, reasons, scripts, WhatsApp templates and Telegram texts ship in ar, fr and en in R1; the other operations screens in en (R1), fr (R2), ar (R3). **rev 3 (OD58, OPS-17): every other operations screen ships in fr and en in R1** (the board, orders list, customers, agents, call-center settings, integrations, deliveries, Profit lite); ar for those screens stays R3 with the RTL dashboard. | Core D36; agents read Darija and French; owners and call-center managers read French, and their sheets are French ("Confirmée", "Injoignable"): an English board is an adoption wall for the people who decide. |
| OD35 | **Money**: `orders` money columns stay `decimal(12,2)`; operations code converts once at the boundary with `toCents(decimal: string \| number): number` (half-up; `src/lib/finance/lite/cents.ts`, P4, taken over by S3 with the rest of `src/lib/finance/**`; `src/lib/markets/money.ts` stays read-only: it formats, `money.ts:69`, and never converts); every new table stores cents (core D41). | One integer engine (Offers D9). |
| OD36 | **The agent hot path is four route handlers, not server actions**: `POST /api/app/<h>/ops/next`, `POST /ops/outcome`, `POST /ops/reveal`, `POST /ops/presence` (core §I.1 lists `/ops/**` for "queue claim, outcomes, presence"), each with `storeGuard`, a client-generated **`Idempotency-Key`** (UUID, replay-safe for 10 minutes per store and user), a JSON body ≤ 2 KB and a response ≤ 6 KB gz. Server p75 budgets: next ≤ 300 ms, outcome + next ≤ 500 ms, reveal ≤ 200 ms; end to end on 4G ≤ 1.2 s for next, ≤ 1.5 s for outcome + next (OPE-§13.2). Everything else in operations stays a `storeAction`. | A route handler skips the RSC tree and the action manifest, returns a bounded JSON card, and gives the idempotency key a natural home; the §I.8 rule 1 budget (writes < 500 ms, idempotent) is not reachable on 4G through a page re-render. |
| OD37 | **A dropped network never loses a result**: the console keeps a one-entry **outbox in memory** (and `sessionStorage` as a convenience, key `sg:ops:pending:<storeId>:<userId>`, holding only `{ orderId, rev, outcome, idem, at }`, never a phone or a name) and retries for 30 s with the same `Idempotency-Key`; the lease (15 min, OD60) outlives the retry window. The UI shows "Saving…", then "Saved" or "Could not save, tap to retry"; it never guesses an outcome. | RF §2.1 rule 1 (optimistic with rollback) on a 4G phone in a call center; owner rule "never invent". |
| OD38 | **Honest triad everywhere, by lint**: "placed", "confirmed" and "delivered" are three words that never share a tile, a tooltip or a Telegram line; every rate shows its `n`; below the minimum n the UI shows the count and "needs 20 / 30". `scripts/qa/ops-check.ts` fails when a catalog key under `ops.tile.*`, `fin.tile.*` or `int.tg.*` contains two of the three words in one string (fr: passées / confirmées / livrées; ar: الطلبات / المؤكدة / توصلو). | Core §I.6, §I.8 rule 3; RF §2.1 rule 3; the brief's "honest placed/confirmed/delivered everywhere". |
| OD39 | **Risk is explained twice**: by its flags (template sentences, 100% flag coverage, OPE-§10.2) and by the **store's own calibration**: for each band (50-69, ≥ 70) the share of decided orders of the last 90 days that ended `fake`, `cancelled` or `unreachable`, with n (hidden below n = 30), computed by `riskBandOutcomes(scope)` (hourly cache). No model, no cross-store number; AI-23's per-store model (R3, flag `ai_risk_v2`) may add a third line, never replace these two. A score never blocks an order (`src/lib/orders/risk.ts:2-4`). | RA §4.7 (explanations from flags, pseudonymised features, the store's own rates); the brief's "per-store risk with explainable scores". |
| OD40 | **Every asynchronous integration shows its deliveries and offers Replay in the store**: `/app/<h>/integrations` lists per kind (CAPI, Telegram; R2 webhooks, carrier; R3 WhatsApp) the health row, the backlog, the oldest pending item and the last 100 outbox rows of the store (topic, target, state, attempts, next try, last error in plain words, masked payload summary), with **Replay** on `dead` rows calling the core's `replay(ctx, id)` (core §H.1) under `integrations.manage` (sensitive), bucket `s:<sid>:replay:<uid>` 30 / h, audit `integrations.outbox.replayed` (second-round request, OPE-§Q.26). Sheets is not an outbox kind: its run report plays the same role (OPE-§19.8). | Core D24 / §H.1 ("visible in the store's integration health and the console, with replay"); the brief's "integrations through the outbox with replay". |
| OD41 | **Accountant-grade exports (R2)**: every CSV carries a 4-line header comment (store handle, period, generated at in the store timezone, row count, `sha256` of the body), a column dictionary in ar/fr/en, ISO dates **and** store-local dates, a `reconciliation_state` per line (`unremitted`, `remitted`, `disputed`, `written_off`) with the statement reference, and the identity Σ delivered COD − Σ remitted − Σ disputed − Σ written off = cash held as a footer check. `accounting.closedThrough` (a date, owner only) **locks a period**: cost rows with `effective_from` inside it, late statement lines and ad-spend edits for its days are recorded as `late` adjustments in the current period and never rewrite the closed month. | The brief's "accountant-grade exports with reconciliation states"; CO §5.1 (an accountant must be able to tie the file to the carrier's statement). |
| OD42 | **Carriers are CSV-first with saved mappings** (core D38): a saved `import_mappings` row is auto-picked by its header signature, every unmapped carrier status is listed until the store maps it, every run is idempotent by `(kind, file_sha256)` and by `statement_ref`, ≤ 20 saved mappings per kind and store, and no preset ships until a real anonymised file exists in `scripts/qa/fixtures/imports/`. API adapters (R3) implement the same `CarrierAdapter` and pass the same fixture suite before registration. | Core D38, R-D21; the brief's "carriers CSV-first with saved column mappings". |
| OD43 | **Every aggregate operations exposes (health, console, pulse, Today brief, AI insights) is a deterministic decomposition with its n**: cells with fewer than 5 orders are suppressed, every rate carries its denominator, windows are store-local days, test and honeypot orders are excluded, and no customer field ever leaves the repository layer (`src/lib/orders/profile.ts`, `src/lib/callcenter/kpis.ts`, `src/lib/callcenter/aggregates.ts`). A model (AI-17, R3) may narrate these numbers and nothing else. | RA §4.2 ("a deterministic decomposition first"), §9.15; core §F.11; SF-11 (Growth Autopilot data). |
| OD44 | **Best hours to call, in R1, at $0**: a deterministic contact-rate table per hour of the store day (contact = any outcome except `no_answer`, `busy`, `switched_off`; trailing 90 days; a cell shows only with n ≥ 30 attempts) on the manager board and in the ladder editor. The Beta-posterior learner that rewrites ladder hours (AI-23, RF §1.5 step 4) stays R3 and advisory, never earlier than the step's minimum gap, never outside the window. | RF §1.5 ("Rules (ladder, learner) at $0"); the brief's "best-time learner"; owner rule 4 (a number only with its n). |
| OD45 | **Every tenant-facing operations notification ships in ar/fr/en** (`ops.*`, `int.*`, `fin.*` kinds in `src/lib/notify/kinds/{ops,integrations}.ts`), its `vars` carry ids, counts and codes only, and batched kinds collapse on `dedupe_key` ("12 new orders since 14:02"). | Core §I.4 (`test:i18n-coverage` covers tenant kinds); agents and owners are Moroccan (core D36). |
| OD46 | **Lease expiry is attributed, not silent**: when a claim takes an order whose previous `claim_token` is set and whose lease has expired, the claim writes `released` (`why: "lease_expired"`, `actor_id` = the previous holder) before `claimed`, so "orders opened and abandoned" is a visible agent KPI and the timeline never shows two `claimed` in a row. | Attempt logging the brief asks for; OD8 (the queue is computed on read: no job watches leases). |
| OD47 | **One city key everywhere: the slug `CityKey`** (`cityKey("Fès") = "fes"`, `cityKey("Autre") = null`, OPE-§10.1). Every **stored** key and every **server API** carries slugs: `delivery_zones.cities`, `orders.city_key`, `carrier_rates.city_key`, `opsAggregates(dims: ["city"])`, `city_refusal`, `zoneLineFor(scope, key)` and `zoneForCity(zones, key \| null)` (`null`, "Autre" and unknown cities → the `*` zone). **rev 4 (CRIT1): the browser never computes a slug.** The order form's `<select>` and the store checkout keep posting `City.value` ("Fès"); the only zone table a browser receives (landing's `ZoneTable` from `zonesForCheckout(scope)`, embedded as the `lp-assist` data block and in the storefront's `#sg-config`) is **keyed by the posted `City.value`**, built on the server as `city[c.value] = zoneIndex(zoneForCity(zones, cityKey(c.value)))`, with an absent key meaning the `*` zone (the core §K.2 P0 shape and LAN-§7.1); the server converts once. `cityKey` stays pure and isomorphic (any chunk *may* bundle it), but no R1 or R2 chunk is required to, so the frozen landing chunk and the add-on chunks carry no slug code. The parity fixture `scripts/qa/fixtures/city-key.json` (P4) asserts both shapes (the slug of every `City.value`, and the `ZoneTable.city` key shape) and is read by `test:ops`, landing's `test:delivery` and the storefront's `test:catalog`, so P3, P4 and S1 fail together if either drifts (OPS-1, CRIT1). | Revision 2 had two keys (landing stored `City.value`, operations the slug): the queue card, templates, tracking and checkout would never have matched a zone. The slug already folds ar/fr/en and feeds three operations tables. Revision 3 then said both "the chunks slug" and "the table is keyed by the posted value"; one shape per layer (slugs stored, values in the browser) removes the second implementation from every chunk. |
| OD48 | **A failed or postponed delivery attempt is a ship state and a second queue lane.** `SHIP_STATES` gains `attempt_failed` and `postponed`; the move to `attempt_failed` increments `orders.delivery_attempts` and puts the order in the **delivery lane** (callable by agents with base priority 650, outcomes `customer_informed`, `reschedule`, `no_answer`, `busy`, `cancel_recall`, OPE-§6.1a); the built-in view **Delivery problems**, the board tile and `queueCounts.deliveryRescue` make them visible; carrier labels map to `{ state: "attempt_failed", reason? }` in `statusMap` (OPS-2). | Moroccan carriers report "Tentative échouée / Client injoignable / Reporté" several times per parcel; rescuing those customers is 20-30 % of a call center's day and revision 2 forced the signal into `in_transit` or `ignore`. |
| OD49 | **"Confirmed, ship after a date" is a hold on the order**: `orders.ship_after` (set by the outcome `confirmed` with "Deliver from…", by the delivery-lane outcome `reschedule`, or in the drawer); To-pack views, picking lists, "Create shipments" and the Carrier CSV exclude rows whose hold has not passed; the drawer, slips and the Sheet ("Livrer à partir du") show it; `ops:hold_passed` raises a hold that passed without shipment (OPS-3). | Customers routinely confirm with "livrez après le 5" (payday, travel, Eid); leaving the order in `callback` re-calls them for nothing and counts them as undecided. |
| OD50 | **Refusals and returns carry a coded reason** (`RETURN_REASONS`, `orders.return_reason`): set by the L-class move (manual picker, Sheets label mapping "Refusé: prix" in R2, carrier `statusMap` entries `{ state, reason }`), stored in the `state_changed` event, decomposed by `returnReasonMix()`, shown in the Refused & returned view, the `city_refusal` alert evidence, the R3 quality review and the sales register (OPS-4). | A 28 % refusal rate with no cause is a number the owner cannot act on; `CANCEL_REASONS` belongs to the confirm axis. |
| OD51 | **Delivered revenue is the amount collected, line by line when needed.** `orders.collected_cents` (R2, 0006; default = `total` at `delivered`, else typed by the agent or set by the statement line) is what finance books as delivered revenue; a partial delivery writes a `line_outcome` event (`delivered` / `refused` / `pending` per line) in the same transaction so S1's stock hook restocks refused lines and a `partial` child shipment ships the pending ones; a statement `amount_diff` within `accounting.remittanceToleranceCents` adjusts `collected_cents` instead of disputing the line (OPS-5). | A 3-item cart delivered with one item refused is common in R2; revision 2 could only overstate revenue (`delivered`) or lose it (`refused`) and parked every such statement line in `disputed`. |
| OD52 | **Who collects the cash is a property of the carrier account**: `settlement: "statement" \| "at_delivery"`. For `at_delivery` (the R1 "my carrier" default through `accounting.myCarrier.settlement`, the R2 `self` adapter) the `delivered` move writes money `collected` **and** `remitted` in one transaction (event meta `settlement: "at_delivery"`); such orders never age in "Cash held by carrier", never fire `fin.cash_held`, and count as cash in hand in the cash position. "Mark cash received" (`finance.write`, bulk) serves mixed setups (OPS-6). | A seller who delivers Casablanca himself has the cash at the door and no statement will ever arrive; revision 2 would have aged every such order and sent a nonsense Telegram line. |
| OD53 | **Inbound calls have an explicit path** (OPE-§5.7): an agent looks a caller up by **≥ 8 phone digits, exact match**, gets the caller's open orders masked, takes a callable one ("Take this order") or records an inbound outcome (`confirmed`, `cancelled`, `callback`, a contact edit) on an open non-callable one; the action is attributed to that agent with event meta `inbound: true`, bounded by `s:<sid>:inbound:<uid>` 60 / h, and never crosses stores (`test:tenancy` case) (OPS-7). | A customer who calls "to confirm / change my address" lands on whoever picks up; the OD12 visibility rule alone would route every such call to a manager. |
| OD54 | **Teams working in the Google Sheet get attribution in R1**: the optional sheet header **"Agent"** lands in `orders.confirmed_by_label` on the confirmation the pull applies and **"Note agent"** becomes a `note` event (actor `sheet`, `meta.agentLabel`); the board shows sheet agents by label; a manager maps a label to a member (`ops.agentLabels`, `/team/agents`) and from then on the pull writes `confirmed_by` directly (one backfill of the last 90 days), so KPIs and, in R2, commissions accrue for mapped labels (OPS-8). | Owner goal 10 (agent performance and commissions) must not depend on adopting the queue on day one; outsourced teams work in the owner's sheet today. |
| OD55 | **The Sheet is the explicit R1 carrier loop, plus a Carrier CSV**: the optional headers **"Tracking"** and **"Transporteur"** are pulled in R1 into `orders.tracking_ref` and `orders.carrier_label` (shown in the drawer, slips and timeline; a tracking value implies ship ≥ `packed`), and **Export → Carrier CSV** (`shipments.write`, full phones, audited, per-order `manifest_exported`) builds the carrier's upload file from a fixed field list with the owner's own header names and delimiter (`ops.carrierCsv`, no presets, D38). R2 shipments supersede both without a rework: `shipments.tracking` is copied into `orders.tracking_ref` (OPS-9). | A landing seller ships every day in R1; revision 2 gave her no place for the tracking number and no file for the carrier's portal until R2. |
| OD56 | **Ad spend in the account's currency, converted by a rate the owner types and dates**: `accounting.adAccounts[platform].currency` and `accounting.adRates[]` (`{ currency, fromDay, rateMilli }`, ≤ 120, labelled "your rate, estimate"); `ad_spend_daily.spend_cents` keeps the account currency and every Profit lite / `finance_daily` figure uses `spendStoreCents = round(spend_cents × rate / 1000)` with the latest rate dated ≤ the day; a row without a rate is listed "needs a rate", never converted silently; the rate is printed under the break-even card (OPS-10). | Most Moroccan Meta and TikTok ad accounts are billed in USD or EUR; comparing a MAD break-even with a USD spend invents a number. The setting (not a table) keeps 0005 unchanged. |
| OD57 | **`ops.callingWindow` is the single source of hours** (≤ 4 dated overrides): `confirm_hours`, the thank-you `{when}` (`nextCallableAt`), the tracking help hours and the FAQ promise are derived from it through the P0 stub `callingWindowFor(scope): Promise<EffectiveWindow>` (never null; pure helpers isomorphic in `src/lib/callcenter/window.ts`); one component, `CallingWindowEditor`, edits it from `/team/callcenter` and from P3's thank-you card (OPS-11, OPS-28). **rev 4 (CRIT2, CRIT3; core D73):** `store.confirmation.hours` and `policies.contact.hours` are **removed** from their schemas by the core (no mirror is written: one key, one editor); the weekday shape is literally ISO, `days: Record<1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7, Range[]>` (1 = Monday … 7 = Sunday, the numbers of `checkout.calendar.workdays`), in `callingWindow`, in every `windowOverrides[].days` and in `EffectiveWindow`; landing's `CallingWindow` is the same type re-exported (`export type CallingWindow = EffectiveWindow` in `window.ts`). | Three independent hours settings with two weekday conventions let the thank-you page promise a 09:30 call on a day the ladder calls from 14:30; a 0-indexed array called "ISO" was a third convention waiting to happen. |
| OD58 | **French ships with English in R1 for every operations screen** (`ops.`, `int.`, `fin.` prefixes; `test:i18n-coverage` requires `fr` for them in R1); Arabic for the manager screens stays R3 with the RTL dashboard; the agent console is trilingual in R1 as before (OPS-17). **Refines core D36** for this part's screens. | Owner rule "natural ar/fr/en"; the keys are a few hundred and the trilingual set already exists for the queue. |
| OD59 | **A cash refund after delivery is a money state**: `MONEY_STATES` gains `refunded` (`collected → refunded`, `remitted → refunded`, class M with a reason and a method), `orders.refund_cents` / `refunded_at` (R2, 0006), `finance_daily.refund_cents` (net = delivered − refunds), the drawer action "Refund" (`finance.write`), the sales register state `refunded`; designed now so 0006 needs no rework when OP-22 (R3) adds the returns flow (OPS-18). | `policies.refund.method` advertises refunds; revision 2 had no ledger for them, so a returned-after-remittance order overstated delivered revenue. |
| OD60 | **One tap less, one lease more**: the first `N` of a session sets presence `online` implicitly (an explicit `break` is respected), the presence heartbeat renews the lease of the order the agent holds (one `UPDATE` folded into `touchAgent`), `leaseMinutes` defaults to 15, and a reveal is allowed on an order the agent held in the last 30 minutes (follow-up WhatsApp after the call). `qa:wow-demo` seeds the demo store with `openOverrideUntil = now + 2 h` and presses `N` from the store owner's own session (OPS-16, OPS-19). | The three-minute demo must pass at 13:30 and on a Friday; a 12-minute call must not hand the customer to a second agent. |
| OD61 | **Impersonation masks customers at the repository boundary**: when `scope.kind === "impersonation"` every order, lead and customer read function of this part returns its customer fields through **`maskIfImpersonation(scope, row)`** (the P0 frozen stub of `src/lib/platform/mask.ts`, P1; identity for every other scope kind; PLA-§7.2: name → "Salma B.", address → "<city> · address hidden", landmark and note → hidden), the same `Masked` type as the console; the tenant UI renders them without per-component work; the attack suite asserts no customer canary in any tenant route under an impersonating session (SEC-5). **rev 4 (CRIT14):** this part defines no masking helper of its own beyond the phone (`maskPhone` / `maskPhonesIn`, OD11): the revision 3 two-argument `maskCustomerFields(row, scope)` and the local `maskName` / `maskAddress` / `Masked` declarations are withdrawn; the read functions pass `{ name, phone: null, address, city, landmark, note }` (phones are already masked for every role) and rebuild their row from the result. | "View as store" is sold as safe; revision 2 masked only the phone. |
| OD62 | **One order-insert pipeline and catalog orders by phone**: `createOrderRow(draft, ctx)` is extracted by T3 in R1.0 (frozen at P0) and is the only insert for public v2, manual v2, public v3 and manual v3 orders; R2 adds `quoteManualOrderV3` / `createManualOrderV3` / `editOrderV3` on `priceLine` + `createOrderRow`, and the manual-order sheet routes by store mode (ENGC-13, OPS-15). **rev 4 (CRIT4; core §K.4, §Q.8 Q.27h A\*):** the three v3 functions are **S1's**, in `src/lib/catalog/order-v3.server.ts` (STO-§16.9 is their signature source, frozen at the R2 contract step), so the public and manual v3 prices have one owner; **S4** owns the sheet's store-mode branch (`src/components/admin/orders/manual/**`, taken over from P4) and the Carrier CSV route's `format=xlsx`, and calls S1's functions without editing them; the revision 3 files `src/lib/orders/{manual-v3,edit-v3}.ts` do not exist. | Two inserts means every R1 change (is_test, rev, hooks, the ER_DUP_ENTRY retry) is made twice; a store-mode call center must take a phone order for a product in R2. |
| OD63 | **A calling-hours promise to a shopper needs hours the owner chose** (rev 4, CRIT3 / OPS-11 follow-through): `EffectiveWindow.configured` is true once the owner saved the window at least once (`ops.callingWindow.savedAt`, written by `CallingWindowEditor` from `/team/callcenter` or P3's thank-you card); while it is false the **queue** still runs on `DEFAULT_WINDOW` (a reasoned starting value, OD9) but every **shopper-facing** reader renders nothing: the thank-you `{when}`, the tracking help hours, the honesty gate's "we call …" fact and the `confirm_hours` template variable (empty, so its optional block drops). `callingWindowFor` therefore never answers `null` (one type for every consumer) and still never lets a default become a promise. Confirming costs one tap: `CallingWindowEditor` shows the default hours with **"Use these hours"** (a save, `savedAt` set) both on `/team/callcenter` and in P3's "After the order" card, next to the caller phone; landing's "no hours" test becomes `windowIsEmpty(w, now) \|\| !w.configured` (OPE-§R2 notes). | Landing typed the stub `CallingWindow \| null` so an unset window promised nothing; the core froze `Promise<EffectiveWindow>` (never null). A flag on the one type keeps both truths: the agents' hours always exist, a customer promise exists only when a person made it (owner rule "never invent"). |
| OD64 | **Full-phone files need a fresh step-up** (rev 4; core §B.7 tenant ladder, SEC-17): the orders CSV is under `orders.export`, which core §B.7 already lists, so its route answers `{ ok: false, error: "step_up" }` unless `sessions.step_up_at` is within 5 minutes (TOTP when enrolled, else the password re-entry) and the UI opens the step-up sheet; the **Carrier CSV** carries the same full phones under `shipments.write` (D74), which §B.7 does not list, so this part requires the **same check on that route** and records the gap for the maintainer (the seam owns the check; OPE-§R2 notes: core §B.7's stated guarantee "a stolen cookie can no longer pull every customer" does not hold while D74's file needs no step-up). The same ladder covers `closePeriodAction` / `reopenPeriodAction` (R2; revision 3 said "when the user has TOTP", which the ladder replaced). Order slips (masked phones) and the queue's reveal (one number, audited per order) need none. | Both files carry every customer's full phone; a stolen 30-day cookie alone must not be able to pull them (the core's reason for the ladder). Revision 3 still said "step-up when the user has TOTP", which the ladder replaced. |
| OD65 | **Every feature id has a named proof, and R2 cases live with their R2 owner** (rev 4, CRIT17): OPE-§O.4 maps each id of OPE-§1 to the script (or e2e step) and the fixture that proves it, phrased as a checkable statement; P4's and P5's scripts carry R1 cases only once R1 is merged, and each R2 / R3 case is written into the owning track's own script (`money-check.ts` S3, `carrier-check.ts` S4, `test:storefront-db` S1, D2's adapter suite), because P4's files are read-only to R2 tracks (core §K.2). | A track must be able to tell which suite covers which id; an R2 case written into an R1 track's file would be a second owner of one file. |

Glossary: **axis** = one of confirm / ship / money. **projection** = the legacy `orders.status` value derived from
the three axes. **claim** = an agent's lease on one order. **outcome** = what an agent records after a call or a
WhatsApp exchange. **open order** = confirm ∈ {new, attempting, callback} or (confirmed and ship ∈ {none, to_pack,
packed}). **decided** = confirm reached confirmed, cancelled, unreachable, fake or duplicate. **final** = ship reached
delivered, refused, returned or lost. **window minutes** = minutes inside the store's calling window. **rev 3:**
**confirm lane** = the queue of orders to confirm (confirm ∈ {new, attempting, callback}); **delivery lane** = the
queue of shipped orders whose last carrier attempt failed (ship = `attempt_failed` with `due_at` set, OD48; rev 4:
`postponed` orders are shown with them but never handed out); **hold** = a confirmed order with `ship_after` in the future (OD49); **collected** = the cash the courier
actually took at the door (`collected_cents`, OD51); **settlement** = how a carrier account hands that cash to the
store (`statement` or `at_delivery`, OD52); **inbound** = an action on an order the customer called about (OD53).

---

## OPE-§1. Feature map (every id of this area)

Release per RESEARCH §4 unless a decision moves it (OD13, OD25, OD32). Track per core §K.2/§K.4/§K.5. "AC" = the
acceptance criteria in one line; the detailed criteria sit in the section. **Proven by (rev 4, CRIT17, OD65):** every id
below has one row in **OPE-§O.4** naming the script or e2e step, the fixture and the checkable statement that proves
it; a cell here that reads like a deliverable list is the scope, OPE-§O.4 is the test.

### OPE-§1.1 Orders, call center and agents (OP-*)

| ID | Feature | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| OP-01 | 3-axis status + state machine + legacy projection | R1 | P4 | §3 | Every move goes through `transitionOrder`; illegal moves answer `illegal`; forced moves need `orders.force_status` + reason and write `forced`; `projectStatus` golden table green; no other writer of `orders.status` (static test). |
| OP-02 | `order_events` timeline + internal notes | R1 | P4 | §4 | Every state change, attempt, edit, reveal, assignment and note writes one event; the drawer timeline renders them newest first with masked phones; notes ≤ 500 chars, editable 5 min by their author. |
| OP-03 | Agent claim queue (two lanes, rev 3) | R1 | P4 | §5, §13 | "Next" claims one order in ≤ 300 ms p75; 200 concurrent claims on 50 orders give 50 distinct claims; leases expire after 15 min and are renewed by the heartbeat (OD60); outside the window → `outside_window`; the first `N` sets presence online; round-robin respects caps and presence; the delivery lane (OD48) is served by the same statement with base priority 650; inbound lookups (OD53) are exact-phone, bounded and store-scoped. |
| OP-04 | Retry ladder, callbacks, outcomes, cancel reasons; delivery-lane outcomes and holds (rev 3) | R1 | P4 | §6 | Each outcome writes `call_attempt` + the transition; the next `due_at` follows the ladder inside the window; callbacks reach their agent first; reasons are coded; `confirmed` may carry a deliver-from date (`ship_after`, OD49); the delivery lane has its own outcome set (OD48). |
| OP-05 | Call script panel (template) | R1 | P4 | §7 | ar/fr/en steps compiled from the order and the page doc; zero invented numbers (fixture test); manager edits per page; AI drafts (R3) need approval. |
| OP-06 | Store-wide duplicates, customer profiles (merge R2) | R1 (merge R2) | P4 (S4) | §9 | **Trimmed** (RF §3.3, core §L.2): same phone with an open order in N days → flag on both, link, "Mark as duplicate" / "Keep both"; drawer shows "3 delivered, 1 refused"; merge (R2, S4) re-prices and writes one Sheets row. |
| OP-07 | Phone masking + reveal audit | R1 | P4 | §8 | No full phone in any list payload; every reveal writes `phone_revealed`; agents: no export, no sheet link. |
| OP-08 | Manual / phone / DM orders + post-creation editing (R2: catalog orders, §11.5) | R1 (v3 R2) | P4 (S4 + S1 for v3) | §11 | Priced only through `validate.ts` (v2) or `priceLine` (v3); every insert goes through `createOrderRow` (OD62); edits before shipping re-price, write `field_edited` with before/after, mark the sheet row dirty; contact fields stay editable in transit with `inTransit: true` (OPS-21); adjustment ≤ 0 by manager+ with reason; `test:ops-db` parity "manual total = public total" for v2 and v3. |
| OP-09 | Bulk actions + saved views | R1 | P4 | §12 | Built-in and saved views; bulk assign / move / export / print on ≤ 200 orders in one call with per-order results; status undo within 10 s. |
| OP-10 | Agent KPIs | R1 | P4 | §14.3 | Definitions of OD17; nightly `agent_stats_daily` rollup equals a recompute from events (test); today's figures live (60 s cache). |
| OP-11 | Manager board basics | R1 | P4 | §14.1 | Queue depth by state, oldest due callback, agents online with their current order, 15 s polling. |
| OP-12 | Per-store blocklist + "block and cancel open orders" | R1 | P4 (T3/T4 scoping in R1.0) | §9.5 | One action blocks the phone and moves every open pre-ship order of it to `cancelled` (reason `blocked`) or `fake`, with events; never touches another store. |
| OP-13 | Address normalisation (rules) | R1 | P4 | §10.1 | `cityKey` exact/alias match at creation; fuzzy suggestions never auto-apply; per-store aliases. |
| OP-14 | Risk explanation (template) | R1 | P4 | §10.2 | Top 3 reasons from `risk.ts` flags in ar/fr/en, 100% flag coverage, no PII. |
| OP-15 | Commission rules + earnings ledger + agent statement + payouts | R2 | S3 | §15 | Pay on delivered with clawback (R-D20); ledger re-derivable from events; statement live; payouts approved by `payouts.approve`. |
| OP-16 | Shipments + manual CSV carrier adapter (R1: the Sheets loop and the Carrier CSV, OD55) | R2 (R1 loop) | S4 (P4, P5 for the R1 loop) | §17, §12.8, §19.4 | R1: "Tracking" / "Transporteur" pulled from the Sheet, typed in the drawer, shown on slips; Carrier CSV with the owner's columns. R2: `CarrierAdapter` with `settlement`; manifest CSV / XLSX per saved mapping; tracking and status imports move `ship_state` with coded return reasons (`{ state, reason }`); partial child shipments; picking list and manifest print views. |
| OP-17 | Keyboard-first agent console | **R1** (raised, RF §3.2, core §L.2) | P4 | §13.3 | `N`, `C`, `W`, `1`-`6`, `E`, `S`, `T`, `Esc` work on desktop; never inside inputs or open overlays; a `?` sheet lists them; the e2e queue run (OPE-§O.3) presses each key inside the note field and asserts nothing fires. |
| OP-18 | Assignment rules | R2 | S4 | §5.6 | Rules by page, city, language, risk, value route orders to agent groups before the pool; first match wins; tested order. |
| OP-19 | Reveal-rate alarm | R2 | S4 | §8.4 | More than N reveals per hour per agent → manager notification + board badge; hard cap blocks further reveals for 15 min. |
| OP-20 | Sendit API adapter | R3 | D2 | §17.8 | Built only from Sendit-provided docs; parcels, labels, status webhooks behind the same adapter tests as `manual`. |
| OP-21 | Carrier webhooks + tracking polling | R3 | D2 | §17.7 | `/api/hooks/carrier/<adapter>/<hookKey>` constant-time key check; polling ≤ K shipments per store per tick. |
| OP-22 | Returns and exchanges | R3 | D2 | §17.9 | Received / restock / damaged on a returned shipment; re-shipment as a linked shipment; money and finance consistent. |
| OP-23 | WhatsApp Cloud API confirmation bot | R3 | D2 | §22.4 | Store's own WABA; utility template with Confirm / Cancel / Change; inbound webhook moves `confirm_state` (actor `bot`); fallback to the queue. |
| OP-24 | High-risk confirmation (OTP / "reply 1") | R3 | D2 | §22.5 | Only for risk ≥ threshold; never blocks the call path. |
| OP-25 | Leaderboard, full board, payout batches, quality review | R3 | D2 | §14.5 | Opt-in leaderboard per store; quality sampling of refused orders with the agent's notes. |
| OP-26 | Carrier routing rules | R3 | D2 | §17.10 | City → preferred carrier with fallback, suggested at shipment creation. |
| OP-27 | More carrier adapters | R3+ | D2 | §17.8 | On owner demand, only from carrier-provided docs. |
| OP-28 | Opt-in cross-store refusal network | later | — | §25.6 | Not built; legal review (Law 09-08 / CNDP) first. |
| OP-29 | VoIP click-to-call, number masking, recordings | later | — | §25.6 | A telephony provider writing `call_attempt` events; not built in R1-R3. |
| TN-14 | External confirmation-team membership | later | — | §25.6 | An outsourced call center as a team with its own manager; reuses roles and queues. |

### OPE-§1.2 Accounting (AC-*)

| ID | Feature | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| SF-04 | Profit Guardian lite: item costs, packaging, carrier fee per city, manual ad spend, break-even CPA with intervals, three alerts | **R1** (adopted, OD25; core D63, flag `finance_lite`) | P4 | §16.2 | Works with zero costs typed (prompts, no numbers); golden fixtures for E_placed / BE_CPA / intervals (`test:profit`); no rate below n = 30; alerts fire once and clear; cents parity with `src/lib/page/pricing.ts`. |
| AC-01 | Product costs + packaging + cost snapshot at shipping | R2 (R1 lite rows) | S3 | §16.3 | Cost history per item / product / variant; snapshot frozen at `shipped`; later cost edits never change past profit. |
| AC-02 | Carrier rates (cost side) | R2 (R1 lite rows) | S3 | §16.4 | Per carrier × city: delivery, return, COD fee; estimate vs statement actual shown side by side. |
| AC-03 | Ad spend + expenses | R2 (R1 manual ad spend) | S3 | §16.5 | Manual grid in the account's currency with owner-typed dated rates (OD56) + CSV import with saved mapping (foreign-currency rows accepted when a rate exists for the day, else "needs a rate"); expenses with categories, recurring rules and receipts. |
| AC-04 | Profit dashboard | R2 | S3 | §16.6 | CPD, true ROAS, contribution margin, profit per delivered order per product/day/page/campaign/city/carrier from `finance_daily`; placed / delivered labels never mixed. |
| AC-05 | Break-even CPA calculator | R2 (R1 lite) | S3 (P4) | §16.2, §16.6 | Per product/page at the store's own confirmation × delivery rates, n ≥ 30, interval shown. |
| AC-06 | Remittance reconciliation | R2 | S3 | §16.7 | CSV / XLSX import, match by tracking or order id, `probable` matches by phone + amount confirmed by hand (OPS-26), flags `amount_diff` (within tolerance → `collected_cents`, OD51) / `fee_diff` / `unknown` / `missing`, cash-held ageing per `statement` carrier only (OD52), idempotent re-import. |
| AC-07 | Accountant exports | R2 | S3 | §16.8 | Sales register (with `collected`, `return_reason`, `refunded`), remittance report, cash journal, cash held, expenses, payouts, P&L summary as CSV or XLSX (in-house writer, OPS-27); no customer phone. |
| AC-08 | Campaign-level ad allocation | R3 | D2 | §16.6 | Spend matched by `utm_campaign` / `utm_id` to campaign ids or names; unmatched stays day-level. |
| AC-09 | Tax profile + reserve estimate, journal CSV, P&L print | R3 | D2 | §16.9 | Rates typed by the owner, every figure labelled "estimate, ask your accountant". |
| AC-10 | XLSX statement import | R3 | D2 | §18.6 | First sheet of an `.xlsx` through the in-house reader feeds the same mapping flow. |
| AC-11 | Stock purchase log / inventory value | R3 | D2 | §16.9 | Purchased qty × unit cost per product; store mode. |
| AC-12 | Ad spend API import, multi-currency, FEC export | later | — | §25.6 | Needs OAuth app reviews; not built. |

### OPE-§1.3 Integrations (IN-*)

| ID | Feature | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| IN-01 | Per-store Google Sheets + quota scheduler | R1 | P5 (T4 scoping in R1.0) | §19 | Ownership proof; store-scoped push and pull; ≤ 1 read + 1 append + 1 batchUpdate per store per tick; platform bucket; one slow store never starves another. |
| IN-02 | Purchase trigger setting + 7-day guard | R1 | P5 | §20 | Order / confirmed / delivered per store and per page; no browser Purchase when not `order`; stale events dropped and logged. |
| IN-03 | Per-store pixel secrets | R1 (R1.0 T4) | T4, P5 | §20.6 | Tokens keyed (store, pixel); P5 adds trigger, outbox delivery and health. |
| IN-04 | Telegram notifications | R1 | P5 | §21 | Bot + chat per store; new orders batched; daily summary; sync errors; R2: cash held > 15 days. |
| IN-05 | WhatsApp click-to-chat templates | R1 | P5 (P4 uses them) | §22 | Per-locale templates with variables, quick replies, attempt logging, URL length cap. |
| IN-06 | Turnstile | R1 | T3, P5 | §24 | Platform widget covers every store; the store anti-spam page shows status and optional own keys (R3 custom domains). |
| IN-07 | Signed outbound webhooks | R2 | S5 | §23 | Standard Webhooks signatures, outbox with backoff and replay, SSRF guard, delivery log. |
| IN-08 | Transactional e-mail | R2 | S5 (platform.md) | §25.4 | Operations uses the Mailer only for the daily digest opt-in and payout notices. |
| IN-09 | Sheets upgrades (R1 part: "Agent", "Note agent", "Tracking", "Transporteur" pulled, OD54 / OD55) | R2 (four columns R1) | S5 (P5 for the R1 columns) | §19.4, §19.9 | R1: the four optional headers are pulled and pushed inside the one read / one batchUpdate budget; R2: "Frais livraison", tab per page, store-owned service account, label mapping (incl. "Refusé: <raison>" → `return_reason`). |
| IN-10 | Store API keys + REST + inbound "create order" | R3 | D2 | §25.1 | Scoped hashed keys; list/get/update orders; create order through the same validation. |
| IN-11 | Catalog feeds (Meta, TikTok, Google) | R3 | D2 | §25.2 | Tokenised per-store URLs; field lists confirmed against each platform first. |
| IN-12 | Product CSV import (Shopify first) | R3 | D2 | §25.3 | Handle-grouped variants → products + Offers v2 items; SSRF-safe images; sanitised HTML. |
| IN-13 | TikTok offline events | R3 | D2 | §20.8 | Only after `event_source` values and windows are verified in TikTok's docs. |
| IN-14 | SMS, Snap/GA4 server events, Apps Script push, Google OAuth picker, Zapier/Make apps, returns as negative events | later | — | §25.6 | After the base; each gated on owner demand. |

### OPE-§1.4 Other ids this part touches

| ID | What operations delivers | Section |
|---|---|---|
| **SF-07** Call Center Autopilot (RF §1.5; core §L.2: "OP-03 … OP-15 + AI-23 as one product, R1 without AI-23") | the whole of §5-§8, §13-§14 as **one product**: Next → masked phone → Call / WhatsApp → outcome keys → ladder → callbacks → KPIs; R2 commissions (§15); R3 the best-time learner (§6.2) and the WABA bot (§22.4). The acceptance of SF-07 in R1 is the wow-demo row "2:15-2:50" (RF §4): claim ≤ 300 ms, two agents never share an order, `C` writes `phone_revealed`, `1` confirms with the timeline showing attempt → confirmed | §5-§8, §13, §14, §26 |
| **SF-05** Test-order mode (core D54) | consumption only: TEST chip, exclusions, "[TEST]" Telegram prefix, "Delete test orders" | §26 |
| **SF-06** Pulse ETag + shared poller (core D57) | the `counts` contributors `newOrders`, `dueCallbacks`, `queueNow` (`src/lib/pulse/contributors/ops.ts`, P4) and `syncFailed` (`contributors/integrations.ts`, P5), each ≤ 50 ms | §27.3 |
| **SF-03** Store Health (core D53, §I.7) | the rules files `src/lib/health/rules/ops.ts` (P4) and `rules/integrations.ts` (P5) with the `HealthRule` shape; the `HealthInputs` readers `orderKpis`, `integrationHealth`, `sheetsBacklog` | §27.2 |
| **SF-09** Carrier Reconciliation and cash held (RF §1.7; R2, S3 + S4) | statement import by saved mapping, match states, ageing buckets, the money axis on the order, the `cash_held` alert and the accountant exports | §16.7, §16.8, §17, §18 |
| **SF-11** Growth Autopilot data (RF §1.9; R1 brief line, R3 digest) | the Today-brief inputs (`opsPulse`, `queueCounts`) and the R3 deterministic decomposition `opsAggregates` / `attemptStats` / `riskBandOutcomes` that AI-17 and AI-23 narrate and never compute (OD43) | §27.3, §27.6 |
| **SF-01** Campaign Kit (landing.md, P3) | the WhatsApp template kind `confirm` and the built-in call script the kit copies into `campaigns.kit` (`renderTemplate`, `compileScript` with the kit's page as scope); the `utm_content` angle id lands on the order and in the Profit lite per-page cohort | §7, §22.2, §16.2 |
| LP-04, LP-06, LP-11 (landing.md) | `renderTemplate()` for the thank-you WhatsApp text (`waConfirmText` wraps the built-in `thank_you_confirm`) and lead messages; `convertLeadToOrder()`; `appendOrderEvent()` for lead and tracking events on an order | §11.4, §22.2, §4.1 |
| PL-07 Ops tab, PL-18 health (platform.md) | masked console reads (`orderKpis`, `listOrdersForConsole`, `getOrderForConsole`, `recordPlatformReveal`, `orderRiskMix`, `searchOrders`, `queueCounts`) and the health rules | §27.1, §27.2 |
| AI-15, AI-23 (ai.md) | `message_templates` drafts for scripts (per product, never per customer, RA §4.5); attempt and outcome aggregates for the learners | §7.4, §6.6, §27.6 |
| PL-09 store export (core §F.9) | the operations CSVs inside the ZIP | §27.4 |
| UX-02 ⌘K (core §I.3) | the search provider `src/lib/admin-data/search/ops.ts` (orders by id or phone digits, customers; masked) and the commands `commands/ops.ts` (Next order, Open a test order, Export orders) and `commands/integrations.ts` (Sync Sheets, Send test event) | §27.7 |

---

## OPE-§2. Data: refined tables, new tables, settings keys

Conventions are core §D.1 (`id26`, `ts`, `cents`, `storeRef`, `jsonText`, append-only enums, every tenant index
starting with `store_id`). Columns marked **[Q.n]** were requests of revision 1; **every one is now in the core's
column lists** (core §D.2 for `orders`, §D.5 / §D.6 for the tables; core §Q.4), so the markers are kept only as the
trace from this text to the request. The maintainer cuts `drizzle/0005_r1.sql` from the lists below (core §D.5: "where a
part spec section is cited, that section's column list is the one cut into `schema.ts`"; OPE-§2.6 and OPE-§2.7 are
cited). Everything else in this section is a refinement core §D.9 allows (operations.md tables and the `orders` columns
of 0005/0006, **except `orders.is_test`, which is core-owned**).

### OPE-§2.1 `orders` (core §D.2 columns of 0005/0006 plus additions)

Final operations column set on `orders` (existing columns unchanged; `status` stays `varchar(20)` and becomes the
projection; the list below matches the **rev 3** core §D.2 rows for 0004 (`is_test`), 0005 and 0006 column for column,
checked for revision 4):

```ts
// 0005 (core §D.2): confirm_state, ship_state, money_state, assignee_id, lease_until, claim_token, due_at, attempts,
// priority, cancel_reason, customer_id, merged_into, city_key, created_by. Additions:
rev: int("rev").notNull().default(0),                                  // [Q.1] optimistic concurrency (OD4)
confirmedBy: id26("confirmed_by"), confirmedAt: ts("confirmed_at"),    // [Q.1] KPI attribution (OD17)
firstTouchAt: ts("first_touch_at"),                                    // [Q.1] first call/WhatsApp attempt
shippedAt: ts("shipped_at"), deliveredAt: ts("delivered_at"),          // [Q.1] ship milestones (R1: status moves and Sheets)
finalAt: ts("final_at"),                                               // [Q.1] ship reached delivered/refused/returned/lost
landmark: varchar("landmark", { length: 160 }),                        // [Q.1] "repère / quartier" typed by the agent
adjustCents: bigint("adjust_cents", { mode: "number" }).notNull().default(0), // [Q.1] manager adjustment, ≤ 0 (OD15)
sheetLabel: varchar("sheet_label", { length: 20 }),                    // [Q.1] status id last known to be in column C
sheetDirty: tinyint("sheet_dirty").notNull().default(0),               // [Q.1] bit 1 status, 2 contact cells, 4 line cells
isTest: boolean("is_test").notNull().default(false),                   // [Q.12] SF-05; core-owned; rev 3: cut in **0004** with orders_store_test_idx (ENGC-1: R1.0 code writes it)
capiCtx: text("capi_ctx"),                                             // [Q.1] envelope v2 "capi-ctx" (OD21), ≤ 8 KB
// rev 3 additions (0005; third-round request OPE-§Q.27 for the core §D.2 row):
shipAfter: ts("ship_after"),                                           // OD49 hold: ship only from this instant (NULL = no hold)
deliveryAttempts: tinyint("delivery_attempts").notNull().default(0),   // OD48: carrier attempts reported as attempt_failed
returnReason: varchar("return_reason", { length: 32 }),                // OD50: RETURN_REASONS code of the refused / returned / lost move
confirmedByLabel: varchar("confirmed_by_label", { length: 60 }),       // OD54: the sheet's "Agent" cell when no member is mapped
trackingRef: varchar("tracking_ref", { length: 64 }),                  // OD55: carrier tracking number (R1 from the Sheet or the drawer; R2 mirrors shipments.tracking)
carrierLabel: varchar("carrier_label", { length: 60 }),                // OD55: the Sheet's "Transporteur" text (R2: matched to a carrier account by label)
// 0006 (core): catalog_version, cost_snapshot (OPE-§16.3 shape), variant_key; rev 3 (OPE-§Q.27):
collectedCents: bigint("collected_cents", { mode: "number" }),         // OD51: cash the courier collected; NULL until delivered; default = total
refundCents: bigint("refund_cents", { mode: "number" }), refundedAt: ts("refunded_at"),   // OD59
```

The enums `ship_state` and `money_state` are **appended** (core §D.1 append-only enums; OPE-§Q.27): `ship_state` gains
`attempt_failed`, `postponed` in **0005** (the state machine ships complete in R1; manual "Move to…" and the R1 Sheets
loop can express them), `money_state` gains `refunded` in **0006** with the refund columns. **rev 4:** the database
enum order is the core's (the two values at the **end** of the 0005 list, core §D.2); the `SHIP_STATES` constant of
OPE-§3.2 is a display order and is never used to generate the column (`test:state` asserts the two sets are equal, not
their order).

Indexes added **[Q.1]** (accepted, core §D.2): `orders_confirmer_idx (store_id, confirmed_by, confirmed_at)` (agent
KPIs and agent visibility), `orders_money_idx (store_id, money_state, delivered_at)` (cash held), `orders_dirty_idx
(store_id, sheet_dirty)` (Sheets push), `orders_store_test_idx (store_id, is_test, created_at)` (core, **cut in 0004**
with the column, ENGC-1; the test-order views and "Delete test orders"). The core indexes `orders_queue_idx (store_id, confirm_state, due_at)`,
`orders_assignee_idx (store_id, assignee_id, confirm_state)`, `orders_customer_idx` and `orders_ship_idx` serve the
queue, "my orders", the customer page and the logistics lists. The one **cross-store** index `orders_created_idx
(created_at)` (core §D.2, PLA Q.10) exists for the console order lookup only: operations code never queries it
without `store_id` (lint L2); `src/lib/orders/profile.ts` reads through `platformScope` and still filters by store.
0007 adds `orders_updated_idx (store_id, updated_at)` (REST polling, OPE-§25.1) and `orders_store_variant_idx` (landing).
**Rev 3 (0005):** `orders_tracking_idx (store_id, tracking_ref)` (drawer search and the Sheets pull by tracking, OD55).
The hold filter (`ship_after`) and the delivery lane ride on `orders_ship_idx` and `orders_queue_idx` respectively (the
lane is `confirm_state = 'confirmed' AND due_at <= now`, a range on the existing queue index); no other index is added.

`rev` semantics (OD4): bumped by every write that changes a state, a line, a contact field, the adjustment or the
assignment; **not** bumped by lease renewals, reveals, notes, `sheet_label` / `sheet_dirty` bookkeeping or `capi_ctx`
nulling, so an agent's own actions never make the card they hold stale (OPE-§5.2). A UI write sends the `rev` it
rendered; the server answers `conflict` with the fresh `{ rev, states, status }` when it moved.

Column semantics (maintained by `transitionOrder` and the queue functions, never by callers):
- `assignee_id` = the agent who owns the order now (claimed, round-robin assigned, callback owner) or who last worked
  it; NULL = pool. `lease_until` = until when nobody else may claim it. `claim_token` = the token of the claim that
  set the lease (a claim reads back its own row by it).
- `due_at` = when the order becomes callable again (NULL = now). `priority` = OPE-§5.4.
- `attempts` = call and WhatsApp attempts with a no-contact outcome; never reset.
- `merged_into` = R1: the order this one duplicates (OD13); R2: the order its lines were merged into.
- `city_key` = `cityKey(city)` when the city matched exactly or by alias (OPE-§10.1), else NULL.
- `total` (decimal) = subtotal + shipping + `adjustCents / 100`; the Sheets "Total", the CSV, the CAPI value and
  finance all read it.
- **rev 3:** `ship_after` = the hold (OD49); NULL or past = shippable. `delivery_attempts` = carrier attempts that
  entered `attempt_failed` (OD48), never reset. `return_reason` = the `RETURN_REASONS` code written with the move to
  `refused` / `returned` / `lost` (OD50; NULL when the source gave none, shown as "no reason"). `confirmed_by_label`
  = the Sheet's "Agent" text at the confirmation the pull applied when the label is not mapped to a member (OD54);
  `confirmed_by` wins when both exist. `tracking_ref` / `carrier_label` = the R1 carrier loop (OD55); in R2 the
  shipment is the truth and `transitionOrder` copies `shipments.tracking` into `tracking_ref` on `shipment_created`
  and tracking imports. `collected_cents` (R2) = what the courier collected; NULL until `delivered`; then `total` in
  cents unless the agent, the statement line or a partial delivery says otherwise (OD51); finance never reads `total`
  for delivered revenue once this column is set. `refund_cents` / `refunded_at` (R2, OD59).

### OPE-§2.2 `order_events` (refined)

Core columns (§D.5) plus one:

```ts
rev: int("rev"),   // the order's rev after this event (undo checks, OPE-§12.5); NULL for events that do not change the order
```

`type` catalog (`src/lib/orders/events.ts`, `OrderEventType`; ≤ 32 chars, append-only list) and the `meta` shape of
each (zod-validated on write, ≤ 2 KB serialised):

| `type` | Written by | Columns used | `meta` |
|---|---|---|---|
| `created` | creation hook (OPE-§3.6) | — | `{ source, pageId, versionId?, totalCents, risk, flags[], test? }` |
| `state_changed` | `transitionOrder` | `from_state`, `to_state`, `reason_code` (cancel reason, or the **return reason** for ship moves, OD50) | `{ axis: "confirm" \| "ship" \| "money", source, implied?: true, forced?: true, dueAt?, duplicateOf?, settlement?: "at_delivery" (OD52), collectedCents? (OD51), shipAfter? (OD49), inbound?: true (OD53), agentLabel? (OD54, sheet confirmations) }` |
| `call_attempt` | outcome handler | `reason_code` = outcome | `{ channel: "call" \| "whatsapp", outcome, attemptNo, nextDueAt?, lane?: "delivery" (OD48), inbound?: true (OD53) }` |
| `delivery_rescue` (rev 3) | delivery-lane outcome (OPE-§6.1a) | `reason_code` = outcome | `{ outcome: "customer_informed" \| "reschedule" \| "cancel_recall" \| "rescue_exhausted", shipAfter?, attemptNo }` |
| `recall_requested` (rev 3) | agent / manager (OPE-§11.3, OPS-21) | `reason_code` | `{ reason: CancelReason, carrierNotified?: boolean }`; shown on the shipping views; R3 API adapters call `cancelParcel` |
| `hold_set` (rev 3) | outcome `confirmed` with a date, `reschedule`, drawer | — | `{ shipAfter: string \| null }` (null = hold removed) |
| `tracking_set` (rev 3) | Sheets pull, drawer, R2 imports | — | `{ trackingRef: string \| null, carrierLabel?: string \| null }` (a tracking number is not customer data) |
| `line_outcome` (R2, OD51) | partial delivery (`shipments.write`) | — | `{ lines: { i: number; state: "delivered" \| "refused" \| "pending"; qty: number }[], collectedCents }` (indexes into `items.lines`, never product text) |
| `refunded` (R2, OD59) | `refundOrderAction` | `reason_code` | `{ cents, method: "cash" \| "transfer" \| "store_credit" }` |
| `whatsapp_sent` | WhatsApp button | — | `{ template: "<id>" \| "builtin:<kind>:<locale>", locale }` |
| `assigned` / `unassigned` | assignment | — | `{ to?, by: "rr" \| "manual" \| "rule" \| "claim", ruleId? }` |
| `claimed` | Next | — | `{ leaseUntil }` |
| `released` | skip, break, manager, the next claim (OD46) | `reason_code` | `{ why: "skip" \| "break" \| "manager" \| "outcome" \| "lease_expired" \| "store_state" }` (`lease_expired`: `actor_id` = the previous holder, written by the claim that took the order over; `store_state`: `releaseAllLeases` on a lifecycle transition, actor `system`) |
| `lead_attributed`, `track_opened`, `zone_not_served`, `kit_shared` | landing (P3) through `appendOrderEvent` | — | `{ leadId? }`, `{ via: "wa" \| "link" }`, `{ cityKey }`, `{ campaignId }` (no customer data) |
| `field_edited` | edit (OPE-§11.3) | — | `{ fields: { f, before, after }[], inTransit?: true (OPS-21: an address / landmark / note edit while shipped, shown with a "Tell the carrier" chip), inbound?: true }` (phone values stored E.164, always rendered masked) |
| `note` | note action; **rev 3:** the Sheet's "Note agent" cell (actor `sheet`) | `note` | `{ edited?: true, of?: number, agentLabel?: string, cellHash?: string /* sheet notes: sha256 prefix of the cell, so a pull never re-adds the same text */ }` |
| `note_hidden` | manager | — | `{ of: number }` (the text stays stored, hidden from agents) |
| `phone_revealed` | `revealPhone` | — | `{ why: "call" \| "whatsapp" \| "view" \| "export" \| "manifest" }` |
| `duplicate_suspected` / `duplicate_dismissed` | duplicate hook / action | — | `{ of: string[] }` |
| `blocked` | block action | — | `{ kind: "phone" \| "ip" }` |
| `priority_pinned` | manager | — | `{ pinned: boolean }` |
| `external_rejected` | `applyExternalStatus` | `to_state` = wanted | `{ source, wanted, why }` |
| `capi_sent` / `capi_stale` / `capi_failed` | outbox handler | — | `{ platform, pixel: last 4 chars, event, ageH? }` |
| `undo` | undo action | — | `{ of: number[] }` |
| `shipment_created`, `carrier_status`, `remitted`, `merged`, `manifest_exported` | R2 (S4, S3) | per OPE-§17, §16.7 | per section |

Never in `meta`: tokens, IP addresses, user agents, notes of other orders. Retention: kept (core §H.11); rolled into
daily tables after 400 days (R3).

### OPE-§2.3 `customers` (refined)

```ts
export const customers = mysqlTable("customers", {
  id: id26().primaryKey(), storeId: storeRef(),
  phone: varchar("phone", { length: 24 }).notNull(),                   // E.164
  name: varchar("name", { length: 120 }), city: varchar("city", { length: 120 }),
  cityKey: varchar("city_key", { length: 40 }), locale: varchar("locale", { length: 5 }),          // refined
  ordersCount: int("orders_count").notNull().default(0), confirmedCount: int("confirmed_count").notNull().default(0),
  deliveredCount: int("delivered_count").notNull().default(0), refusedCount: int("refused_count").notNull().default(0),
  returnedCount: int("returned_count").notNull().default(0), cancelledCount: int("cancelled_count").notNull().default(0),
  fakeCount: int("fake_count").notNull().default(0), testCount: int("test_count").notNull().default(0),           // refined
  firstOrderAt: ts("first_order_at"), lastOrderAt: ts("last_order_at"),
  lastOrderId: varchar("last_order_id", { length: 20 }),                                                         // refined
  note: varchar("note", { length: 300 }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cu_store_phone_uq").on(t.storeId, t.phone), index("cu_store_last_idx").on(t.storeId, t.lastOrderAt),
           index("cu_phone_idx").on(t.phone)]);   // core §D.5: cross-store, console order lookup only (`// tenancy: platform order-lookup`, src/lib/platform/**); never used by operations code
```

Test orders count only in `test_count`. Counters are deltas applied by the `inTx` hook (OPE-§9.1) and recomputed by
`ops.customers_reconcile` (OPE-§J). `city_key`, `locale` and `last_order_id` are this part's refinements (core §D.9);
the counters and `test_count` are the core's columns.

### OPE-§2.4 `agent_profiles`, `agent_stats_daily` (refined)

```ts
export const agentProfiles = mysqlTable("agent_profiles", {
  storeId: storeRef(), userId: id26("user_id").notNull(),
  presence: mysqlEnum("presence", ["offline", "online", "break"]).notNull().default("offline"), presenceAt: ts("presence_at"),
  lastSeenAt: ts("last_seen_at"),                                       // refined: heartbeat (≤ 1 write per 60 s)
  dailyCap: int("daily_cap"),                                           // NULL = no cap; decided orders per store-local day
  weight: tinyint("weight").notNull().default(1),                       // 1-5, round-robin share
  rrCredit: int("rr_credit").notNull().default(0),                      // refined: smooth weighted round-robin state
  languages: jsonText<("ar" | "fr" | "en")[]>("languages"), skills: jsonText<string[]>("skills"),   // R2 rules (OP-18)
  commissionRuleIds: jsonText<string[]>("commission_rule_ids"),         // refined (was commission_rule_id), R2
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.userId] }), index("ap_presence_idx").on(t.storeId, t.presence)]);
```

A profile row is created lazily the first time a member with `agents.self` opens the queue, or when a manager edits
the agent. **The `agents` gauge (core §A.4 `agents_max`) counts members whose role is `agent`** — charged when an
agent invite is accepted or a member's role becomes `agent`, refunded when the role changes away or the member is
removed — and nothing else: an owner, admin or manager who takes calls gets a profile row but never counts (OPS-23;
the predicate is this part's, the gauge mechanics the core's, OPE-§Q.27). The rename `commission_rule_id` →
`commission_rule_ids` is **in 0005** as add + copy + drop, each guarded
(core §D.8, OPE Q.25 accepted); readers never see the old column. `agent_stats_daily` keeps the core columns and adds
`decided int`, `unreachable int`, `callbacks int`, `lost int`, `abandoned int` (claims released by `lease_expired`, OD46),
`upsells int` (R2), `upsell_cents bigint` (R2), `online_ms bigint` (R2, from presence spans). Day = the store-local day
of the event (core §I.5).

### OPE-§2.5 `saved_views`, `message_templates`, `sheet_bindings` (refined)

```ts
// saved_views: core columns; query = OrderQuery | LeadQuery | CustomerQuery JSON (OPE-§12.2), validated on write.

export const messageTemplates = mysqlTable("message_templates", {
  id: id26().primaryKey(), storeId: storeRef(),
  channel: mysqlEnum("channel", ["whatsapp", "telegram", "sms", "email", "call_script"]).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),                    // OPE-§22.2 kinds; "script" for call_script
  locale: varchar("locale", { length: 5 }).notNull(),                 // "ar" | "fr" | "en"
  pageId: id26("page_id"),                                            // refined: NULL = every page
  name: varchar("name", { length: 80 }).notNull(),
  body: text("body").notNull(),                                       // template text; call_script: ScriptDoc JSON (OPE-§7.2)
  status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("active"),   // refined (AI-15 drafts)
  source: mysqlEnum("source", ["user", "ai"]).notNull().default("user"),                       // refined
  promptVersion: varchar("prompt_version", { length: 32 }),           // refined: AI-15 provenance
  position: int("position").notNull().default(0), updatedBy: id26("updated_by"), updatedAt: updatedAt(),
}, (t) => [index("mt_store_idx").on(t.storeId, t.channel, t.kind, t.locale)]);

export const sheetBindings = mysqlTable("sheet_bindings", {
  spreadsheetId: varchar("spreadsheet_id", { length: 100 }).primaryKey(),   // unique across stores (TENANCY-MAP §7.7)
  storeId: storeRef(),
  method: mysqlEnum("method", ["code", "legacy"]).notNull().default("code"), // refined: legacy = store #1, grandfathered
  verifiedAt: ts("verified_at").notNull(), verifiedBy: id26("verified_by"), createdAt: createdAt(),
}, (t) => [index("sb_store_idx").on(t.storeId)]);
```

Built-in templates and scripts are code constants (`src/lib/integrations/whatsapp/builtins.ts`,
`src/lib/callcenter/script-builtins.ts`) addressed as `builtin:<kind>:<locale>`; a store row of the same channel,
kind, locale and page overrides them. No row is written until someone edits (OD24). Limits: 30 personal saved views
per user per surface, 30 shared per store per surface, 100 templates per store.

### OPE-§2.6 New R1 tables (0005)

Both tables below are accepted and carried in core §D.5 with these exact shapes (core §Q.4 Q.4, Q.5); this section
stays the final column list the maintainer cuts.

```ts
// [Q.4] integration health: one row per (store, kind, target); written by P5 (and S4/S5 later) at most once per minute per row
export const integrationStatus = mysqlTable("integration_status", {
  storeId: storeRef(),
  kind: mysqlEnum("kind", ["sheets", "capi", "telegram", "whatsapp", "webhook", "carrier"]).notNull(),
  targetId: varchar("target_id", { length: 64 }).notNull().default(""),     // "" | "meta:<pixel>" | endpoint id | account id
  state: mysqlEnum("state", ["ok", "warn", "failing", "off"]).notNull(),
  lastOkAt: ts("last_ok_at"), lastErrorAt: ts("last_error_at"), lastErrorCode: varchar("last_error_code", { length: 48 }),
  failures: int("failures").notNull().default(0),                         // consecutive failures
  backlog: int("backlog").notNull().default(0),                            // e.g. orders waiting for the sheet
  oldestPendingAt: ts("oldest_pending_at"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.kind, t.targetId] }), index("is_state_idx").on(t.state, t.kind)]);

// [Q.5] Profit lite (OD25): product_costs, carrier_rates and ad_spend_daily move from 0006 to 0005 with the
// OPE-§2.7 shapes (R1 rows: product_costs.page_id + item_id; carrier_rates.carrier_account_id = '' ("my carrier");
// ad_spend_daily.source = 'manual', campaign_id = ''), plus:
export const profitAlerts = mysqlTable("profit_alerts", {
  storeId: storeRef(),
  kind: varchar("kind", { length: 32 }).notNull(),     // "cpa_over_breakeven" | "refusal_spike" | "city_refusal" | "cash_held" (R2)
  key: varchar("key", { length: 80 }).notNull().default(""),               // page id, city key, carrier account id
  firedAt: ts("fired_at").notNull(), clearedAt: ts("cleared_at"),
  evidence: jsonText<Record<string, number>>("evidence").notNull(),        // the numbers the alert text quotes, with n
}, (t) => [primaryKey({ columns: [t.storeId, t.kind, t.key, t.firedAt] }), index("pa_open_idx").on(t.storeId, t.clearedAt)]);
```

### OPE-§2.7 R2 tables (0006): final columns

Shapes refine core §D.6. Every table: `store_id` = `storeRef()`, money = `cents`, user references without FK.

| Table | Columns (final) | Keys / indexes |
|---|---|---|
| `product_costs` | `id`, `store_id`, `product_id NULL`, `page_id NULL`, `item_id varchar(40) NULL`, **`sku varchar(64) NULL`** (rev 3, OPS-24: a store-level cost by warehouse code, the Offers v2 item `code`), `variant_key varchar(120) NOT NULL DEFAULT ''` ('' = every variant), `cost_cents bigint NOT NULL`, `packaging_cents bigint NULL` (NULL = store default), `effective_from datetime(3) NOT NULL`, `note varchar(200)`, `created_by`, `created_at` | `pc_prod_idx (store_id, product_id, item_id, variant_key, effective_from)`, `pc_page_idx (store_id, page_id, item_id, variant_key, effective_from)`, **`pc_sku_idx (store_id, sku, variant_key, effective_from)`**; code check: exactly one of `product_id`, `page_id`, `sku`. Lookup order (OPE-§16.3): variant → item@page → **sku** → product default |
| `carrier_accounts` | `id`, `store_id`, `adapter varchar(32)` (`manual`; **`self`** (rev 3, OD52: own couriers, pickup, Glovo-style runners; capabilities all false); `sendit` R3; …), `label varchar(60)`, `status enum(active,disabled)`, **`settlement enum(statement,at_delivery) NOT NULL DEFAULT 'statement'`** (rev 3, OD52; `self` accounts default to `at_delivery`), `hook_key_hash char(64) NULL`, `settings longtext` (`{ statusMap: Record<string, StatusMapEntry>, manifestMappingId?, trackingMappingId?, statusMappingId?, remittanceMappingId?, trackingUrl?: "https://…{tracking}" }` where **`StatusMapEntry = ShipState \| "ignore" \| { state: ShipState; reason?: ReturnReason }`** (rev 3, OD48, OD50)), `created_by`, `created_at`, `updated_at` | `UNIQUE ca_label_uq (store_id, adapter, label)`, `UNIQUE ca_hook_uq (hook_key_hash)` |
| `carrier_rates` | `id`, `store_id`, `carrier_account_id varchar(26) NOT NULL DEFAULT ''` ('' = "my carrier", the R1 lite rows), `city_key varchar(40) NOT NULL` (`*` = every other city; **slug keys, OD47**), `delivery_fee_cents`, `return_fee_cents`, `cod_fee_bp int NOT NULL DEFAULT 0`, `cod_fee_min_cents bigint NULL`, **`cod_fee_flat_cents bigint NOT NULL DEFAULT 0`** (rev 3, OPS-25: flat-fee carriers; **rev 4:** this section is the cut list core §D.5 cites, so `NOT NULL DEFAULT 0` and `cod_fee_bp int NOT NULL DEFAULT 0` are the definitions — the formula below adds the flat fee unconditionally — and core §D.6's "`cod_fee_flat_cents bigint NULL`" / "`cod_fee_bp int DEFAULT 0`" wording is listed for the maintainer in OPE-§R2's notes), `eta_days tinyint NULL`, `active bool`, `updated_by`, `updated_at` | `UNIQUE cr_uq (store_id, carrier_account_id, city_key)`. COD fee base (OPS-25, OPE-§16.3): `codFeeCents = max(cod_fee_min_cents ?? 0, round(collected_cents × cod_fee_bp / 10000)) + cod_fee_flat_cents`, `collected_cents` = the amount the courier collected (the order total by default, OD51) |
| `shipments` | `id`, `store_id`, `order_id varchar(20)`, `carrier_account_id`, `tracking varchar(64) NULL`, `state` (ShipState values), **`kind enum(full,partial,reship) NOT NULL DEFAULT 'full'`** (rev 3, OD51: `partial` = the pending lines of a partial delivery, R2; `reship` = OP-22, R3), `fee_cents NULL`, `cod_cents`, `return_fee_cents NULL`, `label_ref varchar(120) NULL`, `parent_id NULL` (the shipment this one continues: `partial` in R2, `reship` in R3), `created_by`, `created_at`, `shipped_at`, `delivered_at`, `returned_at`, `remittance_id NULL`, `updated_at` | `UNIQUE sh_track_uq (store_id, carrier_account_id, tracking)`, `sh_order_idx (store_id, order_id)`, `sh_state_idx (store_id, state, created_at)`, `sh_unremitted_idx (store_id, remittance_id, delivered_at)` |
| `shipment_events` | `id bigint`, `store_id`, `shipment_id`, `at`, `carrier_status varchar(80)`, `mapped_state varchar(24) NULL`, `source enum(csv,webhook,poll,manual)`, `raw longtext NULL` (nulled after 30 days) | `se_ship_idx (store_id, shipment_id, at)` |
| `remittances` | `id`, `store_id`, `carrier_account_id`, `statement_ref varchar(80)`, `period_from date NULL`, `period_to date NULL`, `paid_at datetime(3) NULL`, `gross_cents`, `fees_cents`, `net_cents`, `lines int`, `matched int`, `state enum(imported,matched,disputed,closed)`, `import_run_id`, `created_by`, `created_at` | `UNIQUE rm_ref_uq (store_id, carrier_account_id, statement_ref)` |
| `remittance_lines` | `id bigint`, `store_id`, `remittance_id`, `row_no int`, `tracking varchar(64) NULL`, `order_id varchar(20) NULL`, `shipment_id NULL`, **`phone_digits varchar(16) NULL`** (rev 3, OPS-26: the statement's phone column, national digits, for the probable match; never shown), `cod_cents`, `fee_cents NULL`, `return_fee_cents NULL`, `net_cents NULL`, `match enum(matched,amount_diff,fee_diff,unknown,duplicate,**probable**)` (rev 3: `probable` exists only between preview and commit; the owner confirms it into `matched` or leaves it `unknown`), `diff_cents bigint NULL`, `note varchar(200)` | `rl_rem_idx (store_id, remittance_id)`, `rl_track_idx (store_id, tracking)`, `rl_order_idx (store_id, order_id)` |
| `import_mappings` | `id`, `store_id`, `kind enum(remittance,tracking,status,ad_spend,products,reviews,manifest,expenses)` (**`manifest`, `expenses` appended [Q.10]**), `name varchar(60)`, `columns longtext` (`MappingSpec`, OPE-§18.3; rev 3: `remittance` gains the optional `phone` field, `status` values may map to `{ state, reason }`), `carrier_account_id NULL`, `created_by`, `updated_at` | `UNIQUE im_name_uq (store_id, kind, name)` |
| `import_runs` | `id`, `store_id`, `kind`, `mapping_id`, `file_ref varchar(200)` (under `DATA_DIR/imports/<storeId>/`), `file_sha256 char(64)`, `rows int`, `ok int`, `failed int`, `skipped int`, `state enum(previewed,committed,failed)`, `report longtext` (≤ 200 row errors), `created_by`, `created_at`, `committed_at` | `ir_kind_idx (store_id, kind, created_at)`, `ir_sha_idx (store_id, kind, file_sha256)` |
| `ad_spend_daily` | `store_id`, `platform enum(meta,tiktok,snap,google,other)`, `account_id varchar(40) NOT NULL DEFAULT ''`, `campaign_id varchar(64) NOT NULL DEFAULT ''`, `day date`, `campaign_name varchar(160)`, `spend_cents`, `currency char(3)`, `source enum(manual,csv,api)`, `import_run_id NULL`, `updated_by`, `updated_at` | PK `(store_id, platform, account_id, campaign_id, day)` |
| `expenses` | `id`, `store_id`, `day date`, `category varchar(40)`, `amount_cents`, `note varchar(200)`, `recurring_rule longtext NULL` (template rows only: `{ every: "month" \| "week", day: 1-31 \| 0-6, until?: date }`), `parent_id NULL` (occurrence → template), `occurrence date NULL`, `attachment_ref varchar(200) NULL` (under `DATA_DIR/receipts/<storeId>/` [Q.14]), `created_by`, `created_at` | `ex_day_idx (store_id, day)`, `UNIQUE ex_occ_uq (store_id, parent_id, occurrence)` |
| `finance_daily` | `store_id`, `day date` (placed day, store tz), `dim_key varchar(160)`, `placed int`, `confirmed int`, `cancelled int`, `fake int`, `shipped int`, `delivered int`, `refused int`, `returned int`, `lost int`, `placed_cents`, `delivered_cents` (**rev 3: Σ `collected_cents` of delivered orders, OD51**, equal to Σ totals when nothing was partial), **`refund_cents`** (rev 3, OD59), `cogs_cents`, `packaging_cents`, `shipping_cost_cents`, `return_cost_cents`, `cod_fee_cents`, `commission_cents`, `ad_spend_cents` (**store cents after the owner's rate, OD56**), `expense_cents` (only on `dim_key = 'total'`), `net_cents` (= delivered − refunds − costs), `expected_net_cents` (open orders at the store's rates), `missing_costs int` (orders without a cost), **`missing_rates int`** (rev 3: ad rows without a rate that day), `computed_at` | PK `(store_id, day, dim_key)` |
| `commission_rules` | `id`, `store_id`, `name varchar(60)`, `kind enum(per_delivered,per_confirmed,percent_upsell,tier_bonus,fixed)`, `amount_cents NULL`, `percent_bp NULL`, `params longtext` (OPE-§15.2), `active bool`, `created_by`, `updated_at` | `cr_active_idx (store_id, active)` |
| `agent_earnings` | `id`, `store_id`, `user_id`, `ref varchar(40)` (order id, or `period:<YYYY-MM>` for bonuses and fixed lines), `order_id varchar(20) NULL`, `rule_id`, `entry enum(accrual,clawback,bonus,fixed)`, `amount_cents` (clawback < 0), `state enum(pending,earned,void,paid)`, `period char(7)` (month it was earned, store tz), `payout_id NULL`, `created_at`, `updated_at` | `UNIQUE ae_uq (store_id, ref, rule_id, user_id, entry)` (replaces the core's `(store_id, order_id, rule_id, user_id)`), `ae_user_idx (store_id, user_id, state, period)` |
| `payouts` | `id`, `store_id`, `user_id`, `period_from date`, `period_to date`, `total_cents`, `entries int`, `state enum(draft,approved,paid,cancelled)`, `approved_by`, `approved_at`, `paid_at`, `method enum(cash,transfer,other) NULL`, `ref varchar(80) NULL`, `note varchar(200)`, `created_by`, `created_at` | `po_user_idx (store_id, user_id, period_from)` |
| `webhook_endpoints` | `id`, `store_id`, `url varchar(500)`, `events longtext` (`WebhookEvent[]`), `secret_enc text`, `secret_prev_enc text NULL`, `secret_prev_until datetime(3) NULL`, `include_phone bool NOT NULL DEFAULT false`, `status enum(active,paused,disabled)`, `failing_since NULL`, `created_by`, `created_at`, `updated_at` | `we_store_idx (store_id)` |

### OPE-§2.8 R3 tables (0007)

| Table | Columns | Keys |
|---|---|---|
| `api_keys` (core) | `id`, `store_id`, `label varchar(60)`, `prefix char(8)`, `key_hash char(64)`, `scopes longtext` (`ApiScope[]`, OPE-§25.1), `last_used_at`, `created_by`, `created_at`, `revoked_at` | `UNIQUE ak_hash_uq (key_hash)`, `ak_store_idx (store_id)` |
| `wa_messages` **[Q.15]** | `id`, `store_id`, `wamid varchar(128)` (Meta message id), `order_id NULL`, `direction enum(out,in)`, `kind varchar(32)`, `status varchar(16)`, `at`, `payload_enc text NULL` (sealed, nulled after 30 days) | `UNIQUE wm_wamid_uq (store_id, wamid)`, `wm_order_idx (store_id, order_id, at)` |
| `stock_purchases` **[Q.15]** | `id`, `store_id`, `product_id`, `sku varchar(64) NOT NULL DEFAULT ''`, `qty int`, `unit_cost_cents`, `supplier varchar(80) NULL`, `day date`, `note`, `created_by`, `created_at` | `sp_prod_idx (store_id, product_id, day)` |

### OPE-§2.9 Settings keys owned by operations (core §D.10)

Each schema lives in `src/lib/settings/keys/<key>.ts` (extension files, core §K.3). Secret keys are sealed whole
(core §F.3) and never sent to the browser (`redactSetting`).

```ts
// ops (P4, R1)
const Range = z.object({ from: HHMM, to: HHMM });
const DayRanges = z.array(Range).max(3);
/** rev 4 (CRIT3, OD57): keyed by the ISO weekday NUMBER, 1 = Monday … 7 = Sunday — the same numbers as
 *  checkout.calendar.workdays (an array of 1-7). JSON keys are "1".."7"; the TS type is Record<IsoWeekday, Range[]>.
 *  isoWeekday(date, tz) = (Intl weekday index + 6) % 7 + 1. No 0-based index exists anywhere in this part. */
import type { IsoWeekday, Range as WindowRange } from "@/lib/callcenter/window";      // one definition (OPE-§5.5); the zod Range below matches WindowRange
const WeekRanges = z.object({ 1: DayRanges, 2: DayRanges, 3: DayRanges, 4: DayRanges, 5: DayRanges, 6: DayRanges, 7: DayRanges });
export const OpsSetting = z.object({
  callingWindow: z.object({
    days: WeekRanges,                                                               // store tz
    closedDates: z.array(ISODate).max(60).default([]),
    /** rev 4 (OD63): set by CallingWindowEditor on the owner's first save; null = DEFAULT_WINDOW never confirmed by a
     *  person → the queue uses it, no shopper-facing reader promises an hour from it */
    savedAt: z.string().datetime().nullable().default(null),
  }).default(DEFAULT_WINDOW),                                                       // OD9 (DEFAULT_WINDOW.savedAt = null)
  /** rev 3 (OD57, OPS-28): date-ranged schedules evaluated before `callingWindow.days`; the "Ramadan hours" preset
   *  fills the ranges, never the dates (like the movable holidays of LAN-§7.2); ≤ 4, non-overlapping */
  windowOverrides: z.array(z.object({ label: z.string().max(40), from: ISODate, to: ISODate, days: WeekRanges })).max(4).default([]),
  openOverrideUntil: z.string().datetime().nullable().default(null),                // "Open calls now" (≤ 2 h)
  ladder: z.array(LadderStep).min(1).max(10).default(DEFAULT_LADDER),              // OPE-§6.2
  busyRetryMinutes: z.number().int().min(5).max(120).default(20),
  unreachable: z.enum(["close", "keep_open"]).default("close"),
  keepOpenDays: z.number().int().min(1).max(14).default(7),
  leaseMinutes: z.number().int().min(5).max(30).default(15),                       // rev 3 (OD60): was 10; renewed by the heartbeat
  /** rev 3 (OD48): the delivery lane; maxCalls = rescue calls per order before it leaves the lane; retryMinutes = the
   *  one retry after a no-answer (snapped into the window), then next open day 11:00 */
  rescue: z.object({ maxCalls: z.number().int().min(0).max(5).default(3), retryMinutes: z.number().int().min(15).max(240).default(60) }).default({}),
  /** rev 3 (OD54): the Sheet's "Agent" labels → members (≤ 50); set from /team/agents, audited */
  agentLabels: z.record(z.string().max(60), Id26).default({}),
  /** rev 3 (OD55): the Carrier CSV column list (fixed sources of OPE-§18.3 `manifest`, the owner's header names); null = never configured */
  carrierCsv: z.object({ columns: z.array(z.object({ header: z.string().min(1).max(40), source: ManifestSource, value: z.string().max(80).optional() })).min(1).max(20),
    delimiter: z.enum([",", ";"]).default(";"), markPacked: z.boolean().default(true) }).nullable().default(null),
  callbackGraceMinutes: z.number().int().min(0).max(60).default(15),
  assignment: z.enum(["pull", "round_robin", "manual"]).default("pull"),
  rebalanceMinutes: z.number().int().min(5).max(240).default(20),
  duplicateWindowDays: z.number().int().min(0).max(14).default(3),
  firstTouchTargetMin: z.number().int().min(5).max(240).default(15),
  agentHistoryDays: z.number().int().min(1).max(30).default(30),                   // OD12
  cityAliases: z.record(z.string().max(40), CityKey).default({}),                  // ≤ 200 entries
  revealAlarmPerHour: z.number().int().min(10).max(500).default(60),               // R2 (OP-19)
  leaderboard: z.enum(["off", "managers", "everyone"]).default("off"),             // R3 (OP-25)
  assignmentRules: z.array(AssignmentRule).max(20).default([]),                    // R2 (OP-18)
  carrierRouting: z.array(z.object({ cityKey: CityKey, accountId: Id26, fallbackId: Id26.nullable() })).max(200).default([]),   // R3 (OP-26)
  whatsappBot: z.object({ on: z.boolean(), templateName: z.string().max(64), language: z.string().max(10),
    timeoutMinutes: z.number().int().min(10).max(1440) }).nullable().default(null),                                        // R3 (OP-23)
  otpRiskMin: z.number().int().min(50).max(100).default(70),                                                              // R3 (OP-24)
});

// conversions (P5, R1), OPE-§20
export const ConversionsSetting = z.object({
  purchaseTrigger: z.enum(["order", "confirmed", "delivered"]).default("order"),
  pageOverrides: z.record(Id26, z.enum(["order", "confirmed", "delivered"])).default({}),   // ≤ 200
  customEvents: z.boolean().default(true),        // Meta ConfirmedOrder / DeliveredOrder
  manualOrders: z.boolean().default(false),       // OD16
});

// notifications (P5, R1), OPE-§21
export const NotificationsSetting = z.object({
  telegram: z.object({
    newOrders: z.boolean().default(true), batchSeconds: z.number().int().min(0).max(300).default(45),
    dailySummary: z.boolean().default(true), dailySummaryHour: z.number().int().min(0).max(23).default(21),
    integrationErrors: z.boolean().default(true), profitAlerts: z.boolean().default(true), cashHeld: z.boolean().default(true),
  }).default({}),
  inApp: z.object({ newOrders: z.enum(["each", "batch", "off"]).default("batch"), callbacksDue: z.boolean().default(true) }).default({}),
  /** rev 2: Telegram messages for test orders (core §H.1: "the one exception", prefixed "[TEST]"); default off */
  testOrders: z.boolean().default(false),
});

// telegram (P5, R1, secret), OPE-§21.1
export const TelegramSetting = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().regex(/^[0-9]{5,15}:[A-Za-z0-9_-]{20,80}$/).nullable().default(null),   // the PHP export's rule (order.php:2639)
  chatId: z.string().regex(/^-?[0-9]{3,20}$|^@[A-Za-z0-9_]{4,64}$/).nullable().default(null),
  pii: z.enum(["masked", "full"]).default("masked"),
});

// sheets (P5, R1; core key), OPE-§19.2
export const SheetsSetting = z.object({
  spreadsheetId: z.string().max(100).optional(), sheetId: z.number().int().optional(), sheetTitle: z.string().max(100).optional(),
  url: z.string().url().optional(), connectedAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().default(false), pull: z.boolean().default(true),
  pending: z.object({ spreadsheetId: z.string().max(100), sheetId: z.number().int().nullable(), codeHash: z.string().length(64),
    expiresAt: z.string().datetime() }).nullable().default(null),
});

// accounting (S3 R2; the R1 lite subset by P4: packagingCents, adsAllocation, cashHeldAlertDays = core §D.10 "R1 lite";
// rev 3 adds to the R1 lite subset: myCarrier, adAccounts, adRates — accepted by the core, §Q.8 Q.27k, §D.10)
const Platform = z.enum(["meta", "tiktok", "snap", "google", "other"]);
export const AccountingSetting = z.object({
  packagingCents: z.number().int().min(0).nullable().default(null),        // per order; NULL = not set (never invented)
  adsAllocation: z.enum(["spread", "unattributed"]).default("spread"),     // OPE-§16.6
  /** rev 3 (OD52): who holds the cash of "my carrier" ('' rates rows, R1) — at the door (self-delivery) or on a statement */
  myCarrier: z.object({ settlement: z.enum(["at_delivery", "statement"]).default("at_delivery"), confirmedAt: z.string().datetime().nullable().default(null) }).default({}),
  /** rev 3 (OD51): a statement COD within ± this many cents of the order's collected amount adjusts collected_cents instead of disputing */
  remittanceToleranceCents: z.number().int().min(0).max(10_000).default(0),                                                  // R2
  /** rev 3 (OD56): the billing currency of each ad platform account and the owner's dated rates to the store currency */
  adAccounts: z.record(Platform, z.object({ currency: z.string().length(3).toUpperCase() })).default({}),                   // absent = store currency
  adRates: z.array(z.object({ currency: z.string().length(3).toUpperCase(), fromDay: ISODate, rateMilli: z.number().int().min(1).max(100_000_000) })).max(120).default([]),   // 1 unit of currency = rateMilli / 1000 store units; "your rate, estimate"
  /** rev 3 (OPS-27, R2): export file format for the manifest and the accountant files */
  exportFormat: z.object({ csvDelimiter: z.enum([",", ";"]).default(";"), encoding: z.enum(["utf8", "cp1252"]).default("utf8"), xlsx: z.boolean().default(true) }).default({}),
  closedThrough: ISODate.nullable().default(null),                         // R2 (OD41): the last day of the last closed month; owner only; audited `finance.period_closed`
  exportLocale: z.enum(["ar", "fr", "en"]).default("fr"),                  // R2: the language of the column dictionary in accountant exports (OPE-§16.8)
  taxProfile: z.discriminatedUnion("kind", [                               // R3 (AC-09)
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("turnover"), rateBp: z.number().int().min(0).max(10000) }),
    z.object({ kind: z.literal("vat"), rateBp: z.number().int().min(0).max(10000), pricesIncludeVat: z.literal(true) }),
  ]).default({ kind: "none" }),
  cashHeldAlertDays: z.number().int().min(3).max(90).default(15),
});

// export_key (core key, P5): unchanged meaning, an optional store-owned Google key embedded only in this store's PHP exports
// carrier_credentials (core key, S4 R2, secret): { [carrierAccountId]: Record<string, string> } checked by the adapter's credentialsSchema
// sheets_sa (new [Q.3], S5 R2, secret): { json: string }, a store-owned service account (IN-09)
// whatsapp_cloud (new [Q.3], D2 R3, secret): { wabaId, phoneNumberId, accessToken, appSecret, verifyToken }
// feeds (new [Q.3], D2 R3, secret): { key: string /* 32 random bytes, base64url */, platforms: ("meta" | "tiktok" | "google")[] }
```

`DEFAULT_WINDOW`, `DEFAULT_LADDER` and every other default live in `src/lib/callcenter/defaults.ts`, each with the
comment "reasoned starting value, not researched" (OD9, OD10). **rev 4 (CRIT3):** `ops` is a new key of 0005 / R1, so
no stored window exists in the revision 2 shape and nothing is migrated; `DEFAULT_WINDOW.days` has keys 1-4, 6 and 7
= `[09:30-13:00, 14:30-21:00]` and key **5** (Friday) = `[09:30-12:15, 14:30-21:00]`, `savedAt: null`. `ManifestSource` is the `source` enum of the `manifest`
mapping kind (OPE-§18.3), exported from `src/lib/callcenter/carrier-csv.ts` (P4) in R1 and re-exported by
`src/lib/imports/**` in R2 so the two lists never diverge. The settings schema validates `windowOverrides` as
non-overlapping and `adRates` as unique per `(currency, fromDay)`.

### OPE-§2.10 Storage budget (one 3 GB MariaDB for every store)

| Table | Bytes per order **[estimate]** | 100k orders | Mitigation |
|---|---|---|---|
| `order_events` | 8 rows × ~300 B ≈ 2.4 KB | ≈ 240 MB | meta ≤ 2 KB; rollup after 400 days (R3) |
| `orders` additions | ≈ 120 B (+ `capi_ctx` ≤ 8 KB for ≤ 8 days) | ≈ 12 MB | `capi_ctx` purge (OPE-§J) |
| `customers` | ≈ 250 B per customer | ≈ 20 MB | — |
| `agent_stats_daily` | ≈ 150 B per agent per day | negligible | — |
| `shipment_events` (R2) | 4 rows × ~400 B, `raw` kept 30 days | ≈ 60 MB live | `raw` nulled after 30 days |
| `finance_daily` (R2) | ≤ 60 dims per store per day × 200 B | ≈ 4 MB per store per year | dims capped (OPE-§16.6) |

None of these tables is quota-charged (orders are never blocked, R-D15); the console shows bytes per store from
`information_schema` estimates and counts (core §H.5).

---

## OPE-§3. Order state machine (OP-01, R-D17)

### OPE-§3.1 Today (read before changing)

- One `orders.status varchar(20)` with 9 ids and French labels (`src/lib/orders/contract.ts:304-314`); any status can
  move to any status; `updateOrderStatus` writes the sheet first, then the row, then one generic audit row
  (`src/lib/orders/admin.ts:172-196`).
- The Sheets pull overwrites `orders.status` for every synced order whose sheet label differs
  (`src/lib/sheets/sync.ts:308-341`), across every store (SHT-05).
- Risk history counts `fake / returned / cancelled / delivered` by status (`src/lib/orders/create.ts:230-234`);
  statistics treat `cancelled / fake / returned` as lost revenue (`admin.ts:245`). Both keep working because the
  projection keeps those ids.

### OPE-§3.2 Axes and legal moves (`src/lib/orders/state.ts`, pure, isomorphic)

```ts
export const CONFIRM_STATES = ["new", "attempting", "callback", "confirmed", "cancelled", "fake", "duplicate", "unreachable"] as const;
export const SHIP_STATES = ["none", "to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed", "delivered", "refused", "returned", "lost"] as const;   // rev 3: attempt_failed, postponed (OD48); rev 4: display order only, the DB enum appends them last (core §D.2, OPE-§2.1)
export const MONEY_STATES = ["unpaid", "collected", "remitted", "disputed", "written_off", "refunded"] as const;   // rev 3: refunded (OD59, R2)
/** rev 3 (OD50): coded reasons of the ship moves to refused / returned / lost; the confirm axis keeps CANCEL_REASONS */
export const RETURN_REASONS = ["customer_absent", "refused_price", "changed_mind", "wrong_item", "damaged", "unreachable", "no_cash", "address_wrong", "not_ordered", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export type ConfirmState = (typeof CONFIRM_STATES)[number];
export type ShipState = (typeof SHIP_STATES)[number];
export type MoneyState = (typeof MONEY_STATES)[number];
export type Axis = "confirm" | "ship" | "money";
export interface OrderStates { confirm: ConfirmState; ship: ShipState; money: MoneyState }

export const CANCEL_REASONS = ["changed_mind", "price", "mistake", "bought_elsewhere", "not_ordered", "wrong_number",
  "out_of_zone", "delay", "see_first", "customer_request", "blocked", "attempts_exhausted", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export type TransitionSource = "ui" | "bulk" | "outcome" | "sheet" | "carrier" | "import" | "api" | "bot" | "customer" | "system";
/** move classes: who may make a legal move (checked against StoreCtx.can, core §A.3) */
export type MoveClass = "W" /* orders.write */ | "A" /* orders.assign */ | "L" /* shipments.write [Q.3] */ | "M" /* finance.write */ | "S" /* system only */;
```

**Confirmation axis** (row = from, cell = class of the move; blank = illegal; † = reason required):

| from \ to | attempting | callback | confirmed | cancelled | fake | duplicate | unreachable |
|---|---|---|---|---|---|---|---|
| `new` | W | W | W | W † | W | W (`duplicateOf`) | S, A |
| `attempting` | W | W | W | W † | W | W | S, A |
| `callback` | W | W | W | W † | W | W | S, A |
| `confirmed` | A † (needs another call) | | | W † (only while ship ∈ none, to_pack, packed) | A | A | |
| `cancelled` | A † (reopen) | | A † | | | | |
| `fake` | A † (reopen) | | | | | | |
| `duplicate` | A † (not a duplicate) | | | | | | |
| `unreachable` | W (customer called back) | W | W | W † | W | W | |

**Shipping axis** (every move off `none` requires `confirm = confirmed`, or is preceded by an implied confirmation,
§3.4):

| from | legal targets (class) |
|---|---|
| `none` | `to_pack` (S, on confirmation) |
| `to_pack` | `packed` (L), `shipped` (L), `none` (S, on cancellation) |
| `packed` | `shipped` (L), `to_pack` (L), `none` (S, on cancellation) |
| `shipped` | `in_transit`, `out_for_delivery`, `attempt_failed`, `delivered`, `refused`, `returned`, `lost` (L) |
| `in_transit` | `out_for_delivery`, `attempt_failed`, `delivered`, `refused`, `returned`, `lost` (L) |
| `out_for_delivery` | `in_transit`, `attempt_failed`, `delivered`, `refused`, `returned` (L) |
| `attempt_failed` (rev 3) | `out_for_delivery`, `in_transit`, `delivered`, `refused`, `returned`, `lost` (L); `postponed` (L, or S on the delivery-lane outcome `reschedule`); `attempt_failed` again (L: the next failed attempt, counted) |
| `postponed` (rev 3) | `out_for_delivery`, `in_transit`, `attempt_failed`, `delivered`, `refused`, `returned`, `lost` (L) |
| `refused` | `returned` (L: the parcel is back at the warehouse) |
| `delivered` | `returned` (A †: customer return after delivery; R3 returns flow, OP-22) |
| `returned` | `to_pack` (A †: re-shipment) |
| `lost` | `delivered` (A †: found and delivered), `returned` (A †) |

Moves to `refused`, `returned` and `lost` **may carry a `ReturnReason`** (`TransitionInput.returnReason`; the manual
picker offers it, carrier `statusMap` entries `{ state, reason }` and the R2 Sheets label mapping supply it, OD50); the
reason is written to `orders.return_reason` and to the event's `reason_code`. It is never required (a carrier file
often has none), so `return_reason IS NULL` is shown as "no reason", never guessed.

**Money axis**:

| from | legal targets (class) |
|---|---|
| `unpaid` | `collected` (S on `delivered`; M) |
| `collected` | `remitted` (M; S on a matched statement line; **S in the same transaction as `collected` when the carrier account's settlement is `at_delivery`, OD52**), `disputed` (M), `written_off` (M †), `unpaid` (S when `delivered` is reverted), `refunded` (M †, R2: cash handed back before remittance, OD59) |
| `disputed` | `remitted` (M), `written_off` (M †), `collected` (M) |
| `remitted` | `disputed` (M †: statement error), `refunded` (M †, R2: cash handed back after remittance, OD59) |
| `written_off` | `collected` (M †) |
| `refunded` (R2) | `collected` (M †: refund recorded by mistake) |

`refunded` (OD59) needs `finance.write`, a `CancelReason`-style reason (`RETURN_REASONS`), a method (`cash`,
`transfer`, `store_credit`, the `policies.refund.method` vocabulary) and an amount `0 < refund_cents ≤ collected_cents`;
it writes `orders.refund_cents`, `refunded_at`, the event `refunded` and, for `remitted → refunded`, keeps the statement
link (the cash journal shows the statement line and the refund). A refund never changes the ship axis: `delivered →
returned` (customer return) and a refund are two facts recorded separately, and finance books both.

Automatic side moves (planned by `planTransition` in the same write, recorded as their own `state_changed` events
with `source: "system"`):
- confirm → `confirmed` ⇒ ship `none` → `to_pack`; sets `confirmed_by` (user actors only), `confirmed_at`.
- confirm → `cancelled` / `fake` / `duplicate` / `unreachable` while ship ∈ {`to_pack`, `packed`} ⇒ ship → `none`.
  While a shipment row exists (R2) the move answers `locked_ship` until the shipment is cancelled.
- ship → `shipped` sets `shipped_at` (if NULL); → `delivered` sets `delivered_at`, `final_at`, **`collected_cents`
  (R2: `input.collectedCents` when given, else the order total in cents, OD51)** and money `unpaid` → `collected`;
  **when the order's carrier account settles `at_delivery` (R1: `accounting.myCarrier.settlement`; R2: the active
  shipment's `carrier_accounts.settlement`) the same transaction adds `collected` → `remitted` with event meta
  `settlement: "at_delivery"` (OD52)**; → `refused` / `returned` / `lost` sets `final_at` and `return_reason` (OD50) and
  clears `due_at` (the order leaves the delivery lane).
- **rev 3 (OD48):** ship → `attempt_failed` increments `delivery_attempts`, and, while the order's rescue calls so far
  (`delivery_rescue` events) are fewer than `ops.rescue.maxCalls`, sets `due_at = now` and `priority` (base 650,
  OPE-§5.4) so the order enters the **delivery lane**; otherwise it records the attempt and stays out of the queue
  (event meta `rescue_exhausted`). ship → `postponed` sets `ship_after` (from the outcome's date, or the carrier's
  "reporté au" when the file carries one) and clears `due_at`; ship → `out_for_delivery` / `in_transit` from
  `attempt_failed` clears `due_at` (the carrier is trying again; a rescue call in progress finishes normally and its
  outcome is recorded on an order that already left the lane: `recordOutcome` answers `ok` with `changed: false` for
  the lane effects and still writes the attempt).
- **rev 3 (OD49):** confirm → `confirmed` with `input.shipAfter` writes `ship_after` (> now, ≤ now + 60 days) and the
  event `hold_set`; the hold does not change the ship axis (`to_pack` as always), it filters the shipping views.
- `delivered` → `returned` (forced or A) ⇒ money `collected` → `unpaid` only when the money is not yet `remitted`
  (a `remitted` or `refunded` order keeps its money state; the refund is recorded separately, OD59); `line_outcome`
  (R2, OD51) is written in the same transaction as the `delivered` move when `input.lines` is present.
- every terminal confirmation state clears `lease_until`, `claim_token`, `due_at` (the delivery lane re-sets `due_at`
  later on `attempt_failed`, which is the only writer of `due_at` on a confirmed order).

### OPE-§3.3 Projection (`projectStatus`) and legacy labels

```ts
export function projectStatus(s: Pick<OrderStates, "confirm" | "ship">): OrderStatus {
  switch (s.ship) {
    case "delivered": return "delivered";   case "refused": return "refused";
    case "returned": return "returned";     case "lost": return "lost";
    case "in_transit": case "out_for_delivery": return "in_transit";
    case "attempt_failed": case "postponed": return "in_transit";   // rev 3: the sheet keeps "En livraison"; the finer state lives on the axis chip, the drawer and the optional "Statut livraison" header (OPE-§19.4)
    case "shipped": return "shipped";
  }
  switch (s.confirm) {                      // ship ∈ none, to_pack, packed
    case "confirmed": return "confirmed";   case "cancelled": return "cancelled";   case "fake": return "fake";
    case "duplicate": return "duplicate";   case "unreachable": return "unreachable";
    case "callback": return "callback";     case "attempting": return "no_answer";  case "new": return "new";
  }
}
```

Labels appended to `ORDER_STATUSES` (`src/lib/orders/contract.ts`, maintainer CCR; the first 9 rows never move):

| id | `fr` (sheet column C) | background | Note |
|---|---|---|---|
| `refused` | Refusée | `#F8D7DD` | refused at the door |
| `duplicate` | Doublon | `#ECEFF1` | |
| `unreachable` | Injoignable clôturée | `#EDE7F6` | `no_answer` keeps "Injoignable" (existing sheets) |
| `in_transit` | En livraison | `#E0F7FA` | in transit or out for delivery |
| `lost` | Perdue | `#E8EAED` | **[Q.2]** |

Sheet text colours (`STATUS_TEXT`, `src/lib/sheets/orders-sheet.ts:49-59`): refused `#9B1C3A`, duplicate `#5F6368`,
unreachable `#5B3A8C`, in_transit `#00695C`, lost `#3C4043`. Every new colour is checked by
`qa/verify/orange-check.mjs` (OKLCH hue 25-75° with chroma > 0.06 is a failure).

### OPE-§3.4 Implied moves and external sources

```ts
/** maps a legacy label (sheet column C, a CSV status column, the "Move to…" menu) to wanted axis states */
export function legacyToWanted(label: OrderStatus, cur: OrderStates): Partial<OrderStates> | "noop" | "reject";
```

| Legacy label | Wanted | Notes |
|---|---|---|
| `new` | `"noop"` (the app's label is written back) | nobody "un-calls" an order from a sheet |
| `confirmed` | confirm `confirmed` | |
| `no_answer` | confirm `attempting` + one attempt (outcome `no_answer`, channel `call`) | the ladder sets `due_at` |
| `callback` | confirm `callback`, `due_at` = the next ladder time | the sheet has no time |
| `shipped`, `in_transit`, `delivered`, `refused`, `returned`, `lost` | ship = that state (`in_transit` → `in_transit`) | implied confirmation when needed; **rev 3:** `"noop"` when `projectStatus(cur)` already equals the label, so a coarse label never coarsens a finer state (`attempt_failed`, `postponed`, `out_for_delivery` stay as they are under "En livraison") |
| `refused: <reason>` / `returned: <reason>` (R2, IN-09 label mapping) | ship = that state with `returnReason` from the store's `sheets.labelMap` | "Refusé : prix" → `refused_price` (OD50); unknown suffixes keep the state and drop the reason |
| `cancelled` | confirm `cancelled` (reason `other`, note "sheet") while ship ∈ none/to_pack/packed, else `"reject"` | |
| `fake` | confirm `fake` while pre-ship, else `"reject"` | |
| `duplicate` | confirm `duplicate` (no link) | |
| `unreachable` | confirm `unreachable` | |

Implied moves (people with the class of the final move, and every external source):
- A ship target with confirm ∈ {`new`, `attempting`, `callback`, `unreachable`} first moves confirm → `confirmed`
  (event `implied: true`, `confirmed_by` NULL).
- A ship target beyond the next step walks the path (`none` → `to_pack` → `shipped` → target), recorded as one
  `state_changed` per step with `implied: true`.
- From confirm ∈ {`cancelled`, `fake`, `duplicate`}: people get `illegal` with the hint "Reopen first" (class A);
  external sources get `external_rejected` and `sheet_dirty |= 1` so the app's label returns to the sheet.

External sources never force and are not role-checked (the store trusts its own sheet and carrier files), but they
obey legality, implication and terminal protection. Every external write carries `src.ref` (sheet row number, import
run id, webhook delivery id) in the event meta.

### OPE-§3.5 `transitionOrder` and `applyExternalStatus` (`src/lib/orders/transition.ts`, server-only)

```ts
export interface OrderActor { kind: "user" | "system" | "api" | "bot" | "customer" | "sheet" | "carrier"; userId: string | null; can?: (p: StorePermission) => boolean; role?: StoreRole }
export function actorFrom(ctx: StoreCtx | SystemCtx, kind?: OrderActor["kind"]): OrderActor;

export interface TransitionInput {
  orderId: string;
  want: Partial<OrderStates>;
  source: TransitionSource;
  expectRev?: number;                    // UI passes the rev it rendered; external sources omit it (internal retry ×3)
  reason?: CancelReason | string;        // coded; † moves refuse without it (≥ 3 chars for free text)
  note?: string;                         // ≤ 500
  dueAt?: Date;                          // callback: > now, ≤ now + 30 days
  duplicateOf?: string;                  // must be an order of the same store and phone
  force?: boolean;                       // orders.force_status + reason; any from → to on one axis
  attempt?: { channel: "call" | "whatsapp"; outcome: AttemptOutcome | DeliveryOutcome; lane?: "confirm" | "delivery" };   // written as call_attempt in the same transaction
  extra?: Partial<Pick<OrderRow, "dueAt" | "attempts" | "assigneeId" | "leaseUntil" | "claimToken" | "firstTouchAt" | "priority" | "cancelReason">>;
  ref?: string;                          // external reference for the event meta
  // rev 3 (additive; the P0 stub signature is unchanged):
  returnReason?: ReturnReason;           // ship → refused / returned / lost (OD50)
  shipAfter?: Date | null;               // confirm → confirmed with a hold, ship → postponed (OD49); null removes a hold
  collectedCents?: number;               // ship → delivered (R2, OD51); default = total; 0 ≤ x ≤ total cents
  lines?: { i: number; state: "delivered" | "refused" | "pending"; qty: number }[];   // R2 partial delivery (OD51), written as line_outcome
  inbound?: boolean;                     // OD53: the customer called; relaxes the OD12 visibility rule for a looked-up order
}
export type TransitionError = "not_found" | "illegal" | "conflict" | "reason_required" | "forbidden" | "locked_ship" | "bad_due" | "bad_duplicate" | "bad_hold" | "bad_amount";
export type TransitionResult =
  | { ok: true; rev: number; states: OrderStates; status: OrderStatus; eventIds: number[]; changed: boolean }
  | { ok: false; error: TransitionError; current?: { rev: number; states: OrderStates; status: OrderStatus } };

export function transitionOrder(actor: OrderActor, scope: StoreScope, input: TransitionInput): Promise<TransitionResult>;
export function applyExternalStatus(scope: StoreScope, orderId: string,
  ext: { legacy?: OrderStatus; ship?: ShipState; money?: MoneyState; at?: Date },
  src: { kind: "sheet" | "carrier" | "import" | "api"; ref?: string }): Promise<TransitionResult | { ok: true; changed: false; noop: true }>;
```

Algorithm (one transaction, `byId(orders, scope, id)` everywhere):
1. Read the row (`rev`, the three states, assignment columns, `is_test`, `customer_id`, `total`). Missing → `not_found`.
2. Visibility: a user actor without `orders.read_all` must be the order's `assignee_id` or `confirmed_by` (OD12), **or
   the order id must be in the actor's inbound set** (`scopedCache("ops-inbound")`, the ids an exact-phone lookup of
   the last 10 minutes returned to this agent, OPE-§5.7; `input.inbound` must then be true and the event carries
   `inbound: true`, OD53); else `not_found` (identical answer to a missing id, core §E.3 rule 3).
3. `planTransition(cur, input, perms)` (pure) → the list of moves (requested + implied + automatic), the new
   projection and the column sets, or an error. Force: `can("orders.force_status")` and a reason; one axis only.
4. `UPDATE orders SET … , status = :projection, rev = rev + 1, sheet_dirty = sheet_dirty | :bit, updated_at = now
   WHERE store_id = ? AND id = ? AND rev = :cur` (`:bit` = 1 when the projection changed). 0 rows → `conflict`
   (UI callers) or re-read and retry up to 3 times (external and system callers).
5. `INSERT order_events` (one per move, plus the attempt), `rev` = the new rev.
6. `runOrderHooks("transition", "inTx", …)` with the transaction handle (OPE-§3.6).
7. Commit, then `runOrderHooks("transition", "afterCommit", …)` inside `after()` when in a request, inline in jobs.

A no-op request (wanted = current) answers `{ ok: true, changed: false }` and writes nothing. Forced moves also
write `audit("orders.status_forced", { from, to, axis, reason })` (core §F.5) and their event has `forced: true`.

### OPE-§3.6 Order hooks (registered through `src/lib/orders/hooks/<track>.ts`)

```ts
// the frozen shape of the core registry src/lib/orders/hooks.ts (core §K.1 C0; accepted Q.7; the file is the maintainer's)
export type OrderHookEvent =
  | { on: "created"; order: OrderRow; conversion: PurchaseConversion | null; target: { pageId: string; versionId: string | null; source: OrderRow["source"] } }
  | { on: "transition"; before: OrderSnapshot; after: OrderSnapshot; moves: Move[]; actor: OrderActor; source: TransitionSource }
  | { on: "edited"; before: OrderSnapshot; after: OrderSnapshot; fields: string[]; actor: OrderActor };
export interface OrderHook { name: string; phase: "inTx" | "afterCommit"; on: OrderHookEvent["on"][]; run(scope: StoreScope, e: OrderHookEvent, tx?: Tx): Promise<void> }
```

| Hook (file) | Phase | On | Does |
|---|---|---|---|
| `ops.created` (`hooks/ops.ts`, P4) | afterCommit | created | `created` event; `customer_id` upsert + counters; `city_key` exact/alias; `priority`; store-wide duplicate check (§9.3); round-robin or rule assignment (§5.6); in-app "new orders" notification batch |
| `ops.counters` (`hooks/ops.ts`, P4) | inTx | transition | customer counters (§9.1); **rev 3:** on ship → `attempt_failed` the lane bookkeeping of §3.2 (`due_at`, `priority`) is part of `planTransition`, not a hook, so it is in the same `UPDATE` |
| `storefront.stock` (`hooks/storefront.ts`, S1, R2; STO-R23) | inTx | transition | **rev 3 (OD51):** reads `after.lineOutcomes` (the `line_outcome` of a partial delivery) and restocks refused lines; pending lines stay decremented until their `partial` shipment is final |
| `int.capi` (`hooks/integrations.ts`, P5) | inTx | created, transition | outbox `capi` items for the trigger and custom events (§20) |
| `int.telegram` (`hooks/integrations.ts`, P5) | inTx | created, transition | outbox `telegram` items (§21) |
| `int.sheets` (`hooks/integrations.ts`, P5) | afterCommit | transition, edited | `scheduleSheetPush(scope)` (debounced, §19.5) |
| `money.commissions` (`hooks/money.ts`, S3, R2) | inTx | transition | ledger entries (§15.3) |
| `int.webhooks` (`hooks/webhooks.ts`, S5, R2) | inTx | created, transition, edited | outbox `webhook` items (§23) |

The creation insert stays in `src/lib/orders/create.ts` (T3, unchanged contract); it calls
`runOrderHooks("created", "afterCommit", …)` inside `after()` with the built `PurchaseConversion` or `null`, in place
of today's side effects that move into hooks (accepted: core §K.1 C0 freezes `src/lib/orders/hooks.ts` with exactly
these shapes, core §Q.4 Q.7; the file is the maintainer's, OPE-§P). Hooks never throw into the caller: failures go to
`recordError("orders:hook:<name>", …)`; an `inTx` failure rolls the transition back and answers `server` (outbox
inserts are `INSERT IGNORE` on their dedupe keys, so a retried transition never duplicates a delivery).

Test orders (core D54) inside the hooks: `ops.created` still upserts the customer (`test_count` only), runs the
duplicate check **among test orders only** (`is_test = :isTest` in the predicate, OPE-§9.3) and assigns like any order
(the demo needs the queue to hand it out); `int.capi` returns at once when `order.is_test`; `int.telegram` enqueues
only when the store asked for test messages (`notifications.telegram.testOrders`, default `false`) and prefixes
"[TEST]" (core §H.1); `int.sheets` never schedules a push for a test order (`sheet_status` is already `disabled`);
`money.commissions` writes nothing. One table-driven test (`test:ops-db`, "test-order exclusions everywhere") asserts
each of these.

### OPE-§3.7 Rules the build must keep

- Only `src/lib/orders/transition.ts` and the creation insert write `orders.status`, `confirm_state`, `ship_state`,
  `money_state`. A static test (`scripts/qa/ops-check.ts`, OPE-§O) greps `src/**` for writes of those columns
  elsewhere and fails.
- `updateOrderStatus` (`admin.ts:172`) is deleted; the status menu calls `moveToLegacy(ctx, id, label)` =
  `transitionOrder` with `legacyToWanted` (OPE-§12.6).
- `projectStatus` is the only mapping from axes to labels (Sheets push, CSV, PHP-facing text, risk history).

---

## OPE-§4. Order timeline and internal notes (OP-02, R-D18)

### OPE-§4.1 API (`src/lib/orders/events.ts`, server-only)

```ts
export function appendEvents(tx: Tx | Db, scope: StoreScope, events: readonly NewOrderEvent[]): Promise<number[]>;
/** P0 frozen stub (core §K.2, LAN Q17): other tracks append one event outside a transition (lead attribution,
 *  tracking-link opened, kit share, zone_not_served). `type` must be in OrderEventType; `meta` is zod-validated
 *  (≤ 2 KB) and scanned for E.164 / national phone patterns, which are refused (`bad_meta`). Never changes `rev`. */
export function appendOrderEvent(scope: StoreScope, orderId: string, e: { actorKind: OrderActor["kind"]; actorId?: string | null; type: OrderEventType; reasonCode?: string; note?: string; meta?: Record<string, unknown> }):
  Promise<{ ok: true; id: number } | { ok: false; error: "not_found" | "bad_type" | "bad_meta" }>;
export interface TimelineItem { id: number; at: string; type: OrderEventType; actor: { kind: OrderActor["kind"]; name: string | null }; text: MessageRef; detail?: MessageRef[]; masked: true }
export function orderTimeline(scope: StoreScope, viewer: StoreCtx, orderId: string, opts?: { beforeId?: number; limit?: number /* ≤ 100 */; filter?: "all" | "calls" | "changes" | "notes" }): Promise<{ items: TimelineItem[]; more: boolean }>;
export function addNote(ctx: StoreCtx, orderId: string, text: string): Promise<{ ok: true; id: number } | { ok: false; error: "not_found" | "too_long" | "empty" }>;
export function editNote(ctx: StoreCtx, orderId: string, eventId: number, text: string): Promise<…>;   // author only, ≤ 5 min after
```

- `TimelineItem.text` is a message key + variables (`ops.tl.*`, OPE-§N), rendered in the reader's locale. Phones in
  `field_edited` meta and in notes are masked at render (`maskPhonesIn(text)` replaces E.164 and national formats);
  the reveal button of the drawer is the only way to see a number.
- Actor names come from the store's members (display name); `sheet` shows "Google Sheet" (**rev 3:** "Google Sheet ·
  Samira" when the event's `meta.agentLabel` is set, OD54), `carrier` the carrier account label, `system` "Store Gen"
  (the platform brand setting), `platform` "Support" (impersonation is read-only, so it never writes).
- A note edit appends a new `note` event with `{ edited: true, of: <id> }`; the timeline shows the latest text with
  "edited". Notes are never deleted (append-only); a manager can hide a note (event `note_hidden`, the text stays in
  the database for the audit, hidden from agents).
- Agents read the timeline of orders they can see (OD12); events of the customer's other orders are summarised as
  counts only (OPE-§9.2).

### OPE-§4.2 Drawer timeline (UI)

- Section "Timeline" in the order drawer (OPE-§12.7), newest first, grouped by store-local day ("Today", "Yesterday",
  "Mon 27 Oct"); filter chips All / Calls / Changes / Notes; 30 items, then "Show more" (keyset on id).
- Item anatomy: 16 px icon in a 28 px circle (neutral surface; state colours only on state changes: success for
  confirmed / delivered, destructive for refused / fake / lost, warn for attempts, info [Q.16] for callbacks and
  in-transit), one line of text, actor + relative time in `muted-foreground`, detail lines for edits
  ("Address: Hay Salam 12 → Hay Salam 12, near the mosque"). Forced moves carry a "Forced" chip with the reason.
- Note composer pinned under the list: textarea (≤ 500 chars, counter after 400), `Ctrl+Enter` sends, optimistic
  insert with a pending state; failure keeps the text and shows a retry.
- States: skeleton (5 rows) while loading; empty = "No activity yet" (never happens after creation: `created` exists);
  error = inline retry; read-only (suspended store, impersonation) hides the composer.

---

## OPE-§5. Claim queue, presence and assignment (OP-03, OP-18, R-D19)

### OPE-§5.1 Who is callable

An order is **callable** for agent `u` at `now` when, in its store:
`confirm_state ∈ {new, attempting, callback}` ∧ `(due_at IS NULL ∨ due_at ≤ now)` ∧
`(lease_until IS NULL ∨ lease_until < now ∨ assignee_id = u)` ∧ (mode `manual` ⇒ `assignee_id = u`) ∧ the store's
calling window is open (or the override is active). Test orders are callable like any other (TEST chip, OD31).

**rev 3 (OD48): the delivery lane.** An order is also callable, in the **delivery lane**, when
`confirm_state = confirmed` ∧ `ship_state = attempt_failed` ∧ `due_at IS NOT NULL` ∧ `due_at ≤ now` ∧ the same lease and
mode clauses ∧ the window is open (**rev 4:** `postponed` is listed in the "Delivery problems" view but is never callable:
the move to `postponed` clears `due_at`, §3.2, because the customer already agreed the new date). `due_at` on a confirmed order is written only by the moves of §3.2
(`attempt_failed` sets it, every other ship move clears it) and by the delivery-lane outcomes (OPE-§6.1a), so the lane
is exactly "parcels the courier could not deliver that nobody has rescued yet". Both lanes are served by **one** claim
statement (§5.2): a rescue (base priority 650) ranks above a callback (600) because the parcel is already paid for and
the courier is waiting; the card says which lane it belongs to (`QueueOrder.lane`) and shows the matching outcome grid.

### OPE-§5.2 Claim (`src/lib/orders/queue.ts`)

```ts
export type NextResult =
  | { ok: true; order: QueueOrder; leaseUntil: string; resumed: boolean; replayed?: true }
  | { ok: false; reason: "outside_window"; opensAt: string | null }
  | { ok: false; reason: "empty"; nextDueAt: string | null }
  | { ok: false; reason: "on_break" | "offline" | "cap_reached" };
export function nextOrder(ctx: StoreCtx, opts: { idem: string }): Promise<NextResult>;   // agents.self; `idem` = the Idempotency-Key (OD36)
export function releaseOrder(ctx: StoreCtx, orderId: string, why: "skip" | "break"): Promise<ActionResult<void>>;
export function renewLease(scope: StoreScope, orderId: string, userId: string): Promise<void>;   // called inside every claimed-order action
export function releaseAllLeases(scope: StoreScope): Promise<{ released: number }>;             // P0 stub; core A.5.1 transitionStore (restricted, suspended, closed); writes `released` why "store_state"
```

**Idempotency** (OD36): `scopedCache("ops-idem")` keyed `${storeId}:${userId}:${idem}` keeps the serialised result of
`nextOrder` / `recordOutcome` / `revealPhone` for 10 minutes; a replay with the same key returns the stored result with
`replayed: true` and writes nothing (a double tap, a retried request after a dropped response). Memory is enough: a
lost cache entry only means the second request runs the real statement, which the claim's own `WHERE` and the outcome's
`expectRev` make safe anyway. The key is required on the hot-path routes (missing → 400 `idem_required`) and optional
on the server actions.

`nextOrder` steps:
1. Presence: `offline` → **set `online` implicitly** (the same write as the Online tap, `presence_at = now`, OD60: the
   first `N` of the day is the agent's "I'm here"); `break` → `on_break` (an explicit break is respected until the
   agent taps Online); then `touchAgent()` (≤ 1 write per 60 s). `offline` is therefore only answered when the store
   is read-only or the member lost `agents.self` between two taps.
2. Resume: an active claim of `u` (`assignee_id = u ∧ claim_token IS NOT NULL ∧ lease_until > now ∧ confirm open`) →
   return it with `resumed: true` (one active claim per agent, OD7).
3. Window closed and no override → `outside_window` with `nextCallableAt(now)`.
4. Daily cap: decided orders of `u` today (store-local day, from `order_events`, 60 s cache) ≥ `daily_cap` →
   `cap_reached`.
5. Claim:

```sql
UPDATE orders
   SET assignee_id = :uid, claim_token = :tok, lease_until = UTC_TIMESTAMP(3) + INTERVAL :leaseMin MINUTE, rev = rev + 1
 WHERE store_id = :sid
   AND (   (confirm_state IN ('new', 'attempting', 'callback') AND (due_at IS NULL OR due_at <= UTC_TIMESTAMP(3)))
        OR (confirm_state = 'confirmed' AND due_at IS NOT NULL AND due_at <= UTC_TIMESTAMP(3)) )   -- rev 3: the delivery lane (OD48); due_at on a confirmed order exists only for attempt_failed (rev 4: postponed clears it)
   AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3) OR assignee_id = :uid)
   [AND assignee_id = :uid]                                   -- assignment mode "manual" only
 ORDER BY (assignee_id <=> :uid) DESC, priority DESC, COALESCE(due_at, created_at) ASC, id ASC
 LIMIT 1;
-- affectedRows = 1 → SELECT … FROM orders WHERE store_id = :sid AND claim_token = :tok  (then the QueueOrder view)
-- affectedRows = 0 → "empty" with nextDueAt = MIN(due_at) of the store's open orders (60 s cache)
```

The statement runs on the `orders_queue_idx (store_id, confirm_state, due_at)` range (two index ranges joined by the
`OR`: the three open confirm states, and `confirmed` with `due_at` between the smallest non-NULL value and now; MariaDB's
index-merge or a `UNION` rewrite inside the query builder keeps both on the index, `test:queue` asserts the plan); the
open set of a store is bounded (open orders plus the few parcels in the delivery lane), so the filesort is over
hundreds of rows, not the table. No `SKIP LOCKED` (MariaDB 10.4):
the statement runs alone in autocommit; an `UPDATE` is a locking read of the latest committed row version, so two
concurrent claims wait on the same first row and the second one, once the first commits, finds it leased and moves to
the next row. Each claim therefore gets a distinct order; a lock-wait timeout or deadlock (errno 1205 / 1213) is
retried once, then answers `empty`. This is proven by the concurrency test (OPE-§O.2: 200 parallel claims, 50 orders,
50 distinct winners, 150 `empty`), not assumed.

6. Write `claimed` (+ `assigned` with `by: "claim"` when the assignee changed) events; `rev` from the row.
   **Abandoned-lease attribution (OD46):** before writing `claimed`, read the order's last `claimed` event
   (`SELECT id, actor_id FROM order_events WHERE store_id = ? AND order_id = ? AND type = 'claimed' ORDER BY id DESC
   LIMIT 1`, one range read on `oe_order_idx`) and check that no `released`, `call_attempt` or `state_changed` row has a
   greater id for that order; when both hold and `actor_id` is not the new claimer, the previous holder let the lease
   expire: write `released` with `why: "lease_expired"`, `actor_id` = that holder, `at` = the old `lease_until`
   (available from the row before the claim's `UPDATE`, which the claim reads in the same statement batch), then
   `claimed`. No schema change; a resumed claim (step 2) never triggers it.
7. Budget: steps 1-6 run in ≤ 300 ms p75 on the local production build with 200 open orders (OPE-§O.3); the
   `QueueOrder` view is assembled from the single row read plus the customer row, the compiled script (pure) and the
   duplicate predicate (one indexed query): **at most 4 statements** after the claim.

Lease bookkeeping:
- Every action of the claim holder on the order (reveal, WhatsApp, edit, note, outcome) renews the lease to
  `now + leaseMinutes` inside its own `UPDATE`. Lease renewals, reveals and notes do not bump `rev` (they change no
  state or line), so the card the agent holds never goes stale because of their own actions.
- **rev 3 (OD60, OPS-19):** the presence heartbeat (`POST /ops/presence { heartbeat: true }`, every 60 s while the tab
  is visible) also renews the lease of the order the agent holds: `touchAgent` folds `UPDATE orders SET lease_until =
  UTC_TIMESTAMP(3) + INTERVAL :leaseMin MINUTE WHERE store_id = ? AND assignee_id = ? AND claim_token IS NOT NULL AND
  lease_until > UTC_TIMESTAMP(3)` into its ≤ 1-per-60-s write (0 or 1 row; never resurrects an expired lease). A
  12-minute call with no action therefore keeps the order; the default `leaseMinutes` is 15, so a closed tab or a dead
  phone still frees the order within 15 minutes of the last heartbeat (`qa:wow-demo` and `test:queue` assert both).
- An outcome ends the claim: `claim_token = NULL`; terminal outcomes clear `lease_until`; `attempting` clears it
  (anyone may make the next attempt, the last agent first through the `ORDER BY`); `callback` sets
  `lease_until = due_at + callbackGraceMinutes` and keeps `assignee_id` (the agent who promised the call).
- "Skip" (`releaseOrder`, reason `skip`) clears `claim_token` and `lease_until`, writes `released`; a skipped order
  is not handed back to the same agent for 10 minutes: the claim `WHERE` adds `AND id NOT IN (:skipped)` from a
  per-agent skip list (≤ 20 ids, 10-minute entries) in `scopedCache("ops-skips")`. Memory is enough here because a skip
  only shapes ordering; losing the list on a restart is harmless.
- Going on break or offline releases the active claim (`released`, why `break`).
- Lease expiry needs no job: an expired lease is simply claimable again.

### OPE-§5.3 Queue order view

```ts
export interface QueueOrder {
  id: string; rev: number; createdAt: string; ageMinutes: number; isTest: boolean;
  states: OrderStates; status: OrderStatus; attempts: number; dueAt: string | null;
  product: string; offerLabel: string; unitsText: string;            // the warehouse text (src/lib/orders/text.ts), unchanged contract
  totalCents: number; shippingCents: number; currency: string; locale: string | null;
  customer: { firstName: string; phoneMasked: string; city: string | null; cityKey: string | null; address: string | null; landmark: string | null; note: string | null;
              history: { orders: number; delivered: number; refused: number; returned: number; cancelled: number; fake: number } | null };
  risk: { score: number; level: "low" | "check" | "high"; reasons: RiskReason[]; positive: MessageRef | null;
          calibration: { badShareBp: number; n: number } | null };   // OPE-§10.2; calibration = the store's own outcome share for this band (OD39), null below n = 30
  duplicates: { id: string; createdAt: string; status: OrderStatus }[];   // OPE-§9.3
  script: CompiledScript;                                             // OPE-§7 (steps + objection chips)
  templates: { id: string; kind: string; name: string }[];            // WhatsApp, OPE-§22
  eta: { text: string | null; cityKey: CityKey | null };              // zoneLineFor(scope, order.city_key) (P3): the slug key or null (OD47); null city_key → the "*" zone on the landing side; null text = no promise, the card shows nothing
  leaseUntil: string | null; mine: boolean;
  ui: { bestHoursHint: MessageRef | null };                           // OD44: "Your customers pick up most 18h-20h (n = 212)" when the store has ≥ 30 attempts in that cell; else null
  // rev 3
  lane: "confirm" | "delivery";                                       // OD48: which outcome grid the card shows
  delivery: { attempts: number; lastCarrierStatus: string | null; carrierLabel: string | null; trackingRef: string | null; shipAfter: string | null; rescueCallsLeft: number } | null;   // delivery lane only (lastCarrierStatus = the carrier's own label from shipment_events, R2; null in R1)
  shipAfter: string | null;                                           // OD49: a hold on a confirmed order (confirm lane: shown when the agent re-opens a confirmed order inbound)
  inbound?: true;                                                     // OD53: the card was opened from an inbound lookup, not a claim
}
```

No full phone, no IP hash, no UA, no other store's data, no e-mail. `phoneMasked` = `maskPhone(e164)` (OPE-§8.1). The
serialised card is **≤ 6 KB gzipped** (`test:ops` measures the 40 fixtures; the script's step texts dominate, so a
script over 12 steps or an objection list over 6 fails the schema before it reaches the card).

### OPE-§5.4 Priority

`priority` is an `int` recomputed by `priorityOf()` at creation and on every transition or edit:

```
priorityOf(o) = base[o.lane]                           delivery lane (attempt_failed / postponed, rev 3) 650 · callback 600 · new 500 · attempting 300
              + min(100, 5 × floor(o.totalCents / 10_000))   +5 per 100 of currency, at most +100
              − (o.risk ≥ 70 ? 150 : o.risk ≥ 50 ? 50 : 0)   likely-fake orders after real ones
              − min(200, 40 × o.attempts)                     tried often → later
              + (pinned ? 1000 : 0)                           manager "Pin to top" (pinned ⇔ stored priority ≥ 1000)
```

Weights are starting values **[to tune]**; age is not in the number (the `ORDER BY` uses `due_at` / `created_at`
next), so a fresh order is never starved by an old one with the same priority.

### OPE-§5.5 Presence and the calling window

```ts
// src/lib/callcenter/presence.ts
export function setPresence(ctx: StoreCtx, p: "online" | "break" | "offline"): Promise<ActionResult<void>>;   // agents.self
export function touchAgent(scope: StoreScope, userId: string): Promise<void>;   // last_seen_at, at most once per 60 s
export const isLive = (a: AgentProfileRow, now: Date) => a.presence === "online" && !!a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() <= 180_000;

// src/lib/callcenter/window.ts (pure, isomorphic; time zone math with Intl.DateTimeFormat, no dependency)
/** rev 4 (CRIT3, OD57, OD63): the ONE window type, JSON-safe so assist-ty / the store checkout can receive it as data.
 *  days keyed by ISO weekday number (1 = Monday … 7 = Sunday), exactly OpsSetting.callingWindow.days. */
export type Range = { from: string /* HH:MM, store tz */; to: string /* HH:MM; to < from = crosses midnight, belongs to the start day */ };
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;              // defined here once; src/lib/settings/keys/ops.ts imports it
export interface EffectiveWindow {
  tz: string;                                                  // stores.timezone
  days: Record<IsoWeekday, Range[]>;                           // { 1: [{ from: "09:30", to: "13:00" }, …], …, 7: […] }
  closedDates: readonly string[];                              // ISO dates, store tz
  overrides: readonly { label: string; from: string; to: string; days: Record<IsoWeekday, Range[]> }[];   // ops.windowOverrides (≤ 4)
  openOverrideUntil: string | null;                            // ISO instant ("Open calls now"), parsed by the helpers
  configured: boolean;                                         // OD63: true once the owner saved the window (callingWindow.savedAt ≠ null)
}
export type CallingWindow = EffectiveWindow;                   // rev 4: the name landing.md re-exports (LAN-§2.3); one type, two names, never two shapes
export function isoWeekday(d: Date, tz: string): IsoWeekday;
export function isCallable(now: Date, w: EffectiveWindow): { open: true } | { open: false; opensAt: Date | null };
export function nextCallableAt(t: Date, w: EffectiveWindow): Date;          // t itself when open
export function windowMinutesBetween(a: Date, b: Date, w: EffectiveWindow): number;   // first-touch KPI (OD17)
export function snapIntoWindow(t: Date, w: EffectiveWindow): Date;          // ladder results, callbacks warn only
export function rangesForDay(ymd: string, w: EffectiveWindow): Range[];     // rev 3: the override whose [from, to] contains the day wins over the weekly table; a closed date answers []
export function hoursText(w: EffectiveWindow, locale: Locale, dateLocale: string, now: Date): string;   // rev 3: "09:30-13:00, 14:30-21:00" for today's ranges (the `confirm_hours` variable and the tracking help); rev 4: always renders (staff screens show it), every shopper-facing caller checks shopperPromiseAllowed first (OD63)
export function shopperPromiseAllowed(w: EffectiveWindow): boolean;          // rev 4 (OD63): = w.configured; every shopper-facing reader checks it before rendering an hour

// src/lib/callcenter/window.server.ts — P0 frozen stub (rev 3, OD57; core D73, §K.2 P0): the one reader every promise uses
export function callingWindowFor(scope: StoreScope): Promise<EffectiveWindow>;   // ops setting + stores.timezone; scopedCache("settings") 30 s; never null (the P0 stub answers DEFAULT_WINDOW in the store tz with configured: false)

// src/lib/callcenter/window.fixtures.ts — rev 4 (CRIT3): the shared window fixture (data only, P4's file inside its own
// src/lib/callcenter/**, so no ownership row changes; P3 merges after P4 and S1 is R2, so both read the finished file):
// stores × instants × expected { open, opensAt, hoursText(fr|ar|en), nextCallableAt } incl.
// Friday = key 5, a Ramadan override, a midnight-crossing range, a closed date, configured: false; read by test:ops (P4),
// landing's test:delivery (P3, the thank-you {when}) and the storefront's test:catalog (S1), so the three fail together
// if the weekday convention drifts
```

**rev 3 (OD57, OPS-11): one source of hours.** `callingWindowFor(scope)` is a P0 frozen stub P4 implements; the
thank-you `{when}` (LAN-§8.3, through `nextCallableAt`), the `confirm_hours` template variable (OPE-§7.1), the
tracking-page help hours (LAN-§9) and the FAQ / honesty-gate fact `policyAllows("we call …")` read it.
**rev 4 (CRIT2; core D73, §D.10):** `store.confirmation.hours` and landing's `policies.contact.hours` **no longer exist**
(the core removed both from their schemas; nothing writes or mirrors them), so the `honesty:promise` gate and every
older reader read `callingWindowFor` too; the only hours editor is `CallingWindowEditor`
(`src/components/admin/callcenter/calling-window.tsx`, P4; P3's thank-you card imports it, merge order P4 → P3), whose
save writes `ops.callingWindow` (+ `savedAt`, OD63) through `saveOpsSettingsAction` and nothing else. **rev 4 (CRIT3):**
the weekday key is the ISO number (`DEFAULT_WINDOW.days[5]` is Friday); `test:ops` asserts it on `window.fixtures.ts`.
**rev 4 (OD63):** a shopper-facing reader renders an hour only when `shopperPromiseAllowed(w)`; the queue's
`outside_window` / `opensAt` use the window whether or not it is configured.

- `online` = presence `online` and a heartbeat within 3 minutes (`isLive`); the job `ops.presence` turns profiles
  silent for 15 minutes to `offline` (OPE-§J).
- "Open calls now" (manager, `callcenter.configure`) sets `openOverrideUntil = now + 2 h`, audited
  (`store.settings.updated`), shown to agents as a banner with the end time.
- Closed dates: the window is closed all day; the ladder skips them.
- **Overrides (rev 3, OPS-28):** `ops.windowOverrides` (≤ 4, non-overlapping date ranges) replace the weekly table
  inside their dates; the editor offers the preset "Ramadan hours" (ranges 10:00-16:00 and 21:30-00:30 as a starting
  suggestion the owner edits; **the dates are never pre-filled**, the owner types them, like the movable holidays of
  LAN-§7.2); ladders computed before an override starts are re-snapped lazily: `nextOrder` treats a `due_at` outside
  the effective window as due at `nextCallableAt(due_at)` (no job, OD8). A range crossing midnight (`21:30-00:30`)
  belongs to the day it starts.

### OPE-§5.6 Assignment modes and rules

| Mode | At creation | Next |
|---|---|---|
| `pull` (default) | nothing | any callable order |
| `round_robin` | `assignOnCreate()`: among live agents not at their cap, smooth weighted round-robin (`rr_credit += weight`; pick the highest; `rr_credit −= Σ weights`), under `withNamedLock(storeLock(sid, "rr"), 1 s)`; sets `assignee_id`, `lease_until = now + rebalanceMinutes`, event `assigned` (`by: "rr"`). Lock not acquired or nobody live → stays in the pool. | own assigned first, then the pool once leases expire (rebalancing) |
| `manual` | nothing | only orders assigned to the agent (`assignOrders` by a manager) |

`assignOrders(ctx, ids, userId | null)` (`orders.assign`, ≤ 200): sets the assignee and, for live agents, a lease of
`rebalanceMinutes`; `null` returns orders to the pool; events `assigned` / `unassigned`.

**Rules (OP-18, R2, S4)**: `ops.assignmentRules` (≤ 20, first match wins), evaluated by `assignOnCreate` before the
mode:

```ts
export const AssignmentRule = z.object({
  id: z.string().length(8), name: z.string().max(40), enabled: z.boolean(),
  when: z.object({ pageIds: z.array(Id26).max(50).optional(), cityKeys: z.array(CityKey).max(100).optional(),
    locales: z.array(z.enum(["ar", "fr", "en"])).optional(), minRisk: z.number().int().min(0).max(100).optional(),
    minTotalCents: z.number().int().min(0).optional() }),
  to: z.object({ userIds: z.array(Id26).min(1).max(30) }),     // round-robin among these live agents
  fallback: z.enum(["pool", "wait"]).default("pool"),           // wait = assign to the list's first agent with a long lease (2 h)
});
```

Acceptance (OP-18): a rule matching page P and city C sends P's orders from C to its agents only while one of them is
live; disabled rules are ignored; the evaluation order is the list order; rule edits are audited.

### OPE-§5.7 Inbound calls (rev 3, OD53, OPS-7)

A customer who calls the store ("I want to confirm", "change my address", "cancel", "where is my parcel?") lands on
whichever agent picks up. The path below lets that agent act without `orders.read_all`, keeps OD12's protection
(agents never browse orders they do not hold) and never crosses stores.

```ts
// src/lib/callcenter/inbound.ts (P4)
export function inboundLookup(ctx: StoreCtx, phoneInput: string): Promise<ActionResult<{
  customer: { firstName: string; phoneMasked: string; history: QueueOrder["customer"]["history"] } | null;
  orders: { id: string; createdAt: string; status: OrderStatus; states: OrderStates; product: string; totalCents: number;
            callable: boolean; held: { by: string /* display name */; until: string } | null; lane: "confirm" | "delivery" | null }[];   // open orders only, newest first, ≤ 10
  otherOrders: number;                                                                                                        // closed ones, count only
}>>;   // agents.self; bucket s:<sid>:inbound:<uid> 60 / h
```

1. **Lookup**: the input is normalised with the store market (`normalizePhone`); fewer than 8 digits → `too_short`
   (no prefix search for agents; owners and managers keep the ≥ 4-digit search of OPE-§12.2). Exact E.164 match on
   `customers.phone` (`cu_store_phone_uq`) → the customer's **open** orders (confirm open, or confirmed and not final)
   with masked fields; closed orders are a count. No match → `{ customer: null, orders: [], otherOrders: 0 }`, the same
   shape and timing as a match in another store (core §E.3 rule 3; the attack suite asserts store B's agent gets this
   for A's phone). The returned order ids are put in `scopedCache("ops-inbound")` under `${storeId}:${userId}` for
   10 minutes: that set is the agent's **inbound visibility** (OPE-§3.5 step 2).
2. **Take this order** (`takeOrderAction`): a `callable` order is claimed with the §5.2 `WHERE` on that id, ignoring
   `due_at` and the lane; a callback owned by another agent is takeable when its owner holds no active claim on it
   (the customer is on the line now); the previous owner's `assignee_id` moves to the taker and an `assigned` event
   with `by: "inbound"` is written. The card arrives as a normal `QueueOrder` with `inbound: true`.
3. **Inbound outcome** on an open order that is **not** callable (confirmed pre-ship, in transit, a future-due
   attempt): `recordOutcome(ctx, { …, inbound: true })` accepts `confirmed` (from any open confirm state, including
   `unreachable`: the class-W "customer called back" move of §3.2), `cancelled` (pre-ship, reason required), `callback`
   and, in the delivery lane, the OPE-§6.1a outcomes; `editOrder` of the contact fields (city, address, landmark,
   note) is allowed on the same set; `revealPhone` is **not** needed (the customer is on the line) and stays refused
   unless the agent holds the order. Attribution: `confirmed_by = ctx.user.id`, `first_touch_at` set if NULL, every
   event with `inbound: true`; KPIs count the decision for this agent (OPE-§14.3).
4. **Screen**: the queue's top bar gains a phone field ("Customer calling? Type the number", `I` on desktop); results
   as a compact list with one action per row (Take / Confirm / Edit address / Cancel…); the drawer blocks apply.
   Managers and owners get the same list from ⌘K with their wider search.
5. OPE-§6.3 (exhaustion) and OPE-§9.2 (customer page for agents) cite this path: an unreachable customer who calls back
   is confirmed here by any agent; an agent reaches a customer page from an inbound lookup as well as from a held
   order, and still sees counts only.

Acceptance: (a) `test:tenancy`: store B's agent looking up A's customer phone gets the empty shape; A's order ids
replayed by B with `inbound: true` → `not_found`; (b) `test:ops-db`: an inbound `confirmed` on an `unreachable` order
writes `confirmed_by` and `inbound: true`, counts as decided for that agent, and a second agent's `recordOutcome`
without a lookup answers `not_found`; (c) the bucket refuses the 61st lookup in an hour with `rate_limited` and the
refusal is visible on the board ("lookups: 61 this hour") so a scraping pattern is never silent.

---

## OPE-§6. Outcomes, retry ladder and callbacks (OP-04)

### OPE-§6.1 `recordOutcome` (`src/lib/callcenter/outcomes.ts`)

```ts
export type AttemptOutcome = "confirmed" | "no_answer" | "busy" | "switched_off" | "wrong_number" | "callback" | "cancelled" | "fake" | "duplicate";
export type DeliveryOutcome = "customer_informed" | "reschedule" | "no_answer" | "busy" | "cancel_recall";   // rev 3 (OD48), OPE-§6.1a
export interface OutcomeInput {
  orderId: string; expectRev: number; channel: "call" | "whatsapp"; outcome: AttemptOutcome | DeliveryOutcome;
  idem: string;                // Idempotency-Key (OD36); a replay returns the first result
  dueAt?: string;              // callback (ISO, store-local picker converted on the client)
  shipAfter?: string;          // rev 3 (OD49): confirmed with "Deliver from…" (ISO date, store-local; > today, ≤ +60 days); reschedule (delivery lane)
  inbound?: boolean;           // rev 3 (OD53): the customer called; the order must be in the agent's inbound set (OPE-§5.7)
  reason?: CancelReason;       // cancelled (required); fake (optional)
  duplicateOf?: string;        // duplicate (required)
  note?: string;               // optional, ≤ 500, written as a note event
  blockPhone?: boolean;        // fake only, needs blocklist.write
  andNext?: boolean;           // "Save and next" (default true on the queue): runs nextOrder in the same request
  objectionId?: string;        // the objection chip the agent tapped before the outcome (OPE-§7.2), for the R3 script learner; no text
}
export function recordOutcome(ctx: StoreCtx, input: OutcomeInput): Promise<ActionResult<TransitionResult & { next?: NextResult }>>;   // orders.write
```

The hot-path route `POST /api/app/<h>/ops/outcome` (OD36) is a thin shell: `storeGuard(req, h, "orders.write")`,
`Idempotency-Key` → `input.idem`, body parsed with `OutcomeInput` (≤ 2 KB), `recordOutcome`, JSON out. `expectRev` is
mandatory here (the card carries it); a `conflict` answers 409 with the fresh card so the agent sees "Updated by Karim
just now" and the grid again. Budget: outcome + next ≤ 500 ms p75 server time, which the transaction (one `UPDATE`,
≤ 3 event inserts, the `inTx` hooks' `INSERT IGNORE`s) plus one claim allows; the `afterCommit` hooks (Sheets
scheduling, notifications) run in `after()` and never count.

| Outcome | Confirmation move | `attempts` | `due_at` | Other effects |
|---|---|---|---|---|
| `confirmed` | → `confirmed` | — | NULL | `confirmed_by`, `confirmed_at`; ship → `to_pack`; **rev 3:** with `shipAfter` → `ship_after` + event `hold_set` (OD49); the card offers "Deliver from…" as a secondary control under Confirmed (date picker, store tz, quick chips "Next Monday", "1st of next month") |
| `no_answer` | → `attempting` | +1 | `ladderNext()` | exhausted → §6.3 |
| `busy`, `switched_off` | → `attempting` | +1 | first time in a row: now + `busyRetryMinutes`; else `ladderNext()` | exhausted → §6.3 |
| `wrong_number` | → `cancelled` (reason `wrong_number`) | +1 | — | suggest "Block this number" to managers |
| `callback` | → `callback` | — | `dueAt` (> now + 5 min, ≤ 30 days) | `lease_until = dueAt + grace`, `assignee_id = u`; outside the window → a warning, never a refusal |
| `cancelled` | → `cancelled` | — | — | `cancel_reason` |
| `fake` | → `fake` | — | — | `blockPhone` → blocklist + other open orders of the phone listed for review |
| `duplicate` | → `duplicate` | — | — | `merged_into = duplicateOf` (same store, same phone, not itself a duplicate) |

Every outcome writes `call_attempt` (`reason_code` = outcome, meta `{ channel, attemptNo, nextDueAt }`), sets
`first_touch_at` if NULL, ends the claim (§5.2), and, when the agent pressed "Save and next", runs `nextOrder` in the
same action so the next order arrives in the same round trip (OPE-§13.2).

### OPE-§6.1a Delivery-lane outcomes (rev 3, OD48, OPS-2)

When the claimed order is in the delivery lane (`QueueOrder.lane = "delivery"`), the grid shows these outcomes instead
of the confirm set; `recordOutcome` refuses a confirm outcome on a delivery-lane order with `illegal` (and vice versa),
so a stale grid can never confirm a shipped order:

| Outcome | Ship move | `due_at` | Other effects |
|---|---|---|---|
| `customer_informed` | none (stays `attempt_failed`; the carrier will try again) | NULL (leaves the lane) | event `delivery_rescue { outcome }`; the shipping view and the carrier chip show "Customer informed · will be available"; a note is optional |
| `reschedule` (`shipAfter` required) | `attempt_failed` → `postponed` (S, implied by the outcome) | NULL | `ship_after` = the date, event `hold_set` + `delivery_rescue`; the warehouse view "Postponed" lists it with the date; R2: the manual adapter exports it in the next manifest with the date column, R3 API adapters call `rescheduleParcel` when the carrier has one, else the store calls the carrier (the view says so) |
| `no_answer`, `busy` | none | first time: `now + rescue.retryMinutes` snapped into the window; second time: next open day 11:00; after `rescue.maxCalls` calls → NULL + event meta `rescue_exhausted` | `call_attempt` with `lane: "delivery"`; the order's `attempts` is **not** incremented (that counter is the confirm ladder's) |
| `cancel_recall` (reason required, `CANCEL_REASONS`) | none on the ship axis (the parcel is out; the carrier's return closes it as `returned`) | NULL | event `recall_requested { reason, carrierNotified: false }`; the shipping view shows "Recall requested" with a "Carrier notified" tick the warehouse sets (`shipments.write`); when the parcel comes back the L move `returned` carries `returnReason: "customer_request"` by default; R3 API adapters call `cancelParcel` (OPE-§17.8) |

Rules: a delivery-lane outcome never touches the confirm axis; it renews nothing after the claim ends (same as §5.2);
the agent sees the carrier's last status and the attempt count on the card; the phone-grid order is Customer informed
· Reschedule… · No answer · Busy · Cancel & recall… · Skip (keys `1`-`6` map in that order, OPE-§13.3); the whole set
ships in ar / fr / en (`ops.rescue.*`, OPE-§N). KPIs: **Rescue rate** (OPE-§14.3) = rescued parcels (a
`customer_informed` or `reschedule` followed by `delivered`) ÷ rescue calls with a contact, attributed to the agent of
the rescue call, n ≥ 20.

### OPE-§6.2 The ladder (`src/lib/callcenter/ladder.ts`, pure)

```ts
export type LadderStep =
  | { kind: "after"; minutes: number }                 // 5-2880
  | { kind: "at"; time: HHMM; minGapMinutes?: number } // next HH:MM at least minGap (default 60) after now
  | { kind: "next_day_at"; time: HHMM };               // HH:MM on the next open day
export const DEFAULT_LADDER: LadderStep[] = [          // delays after attempt 1…5; attempt 6 is the last (OD10)
  { kind: "after", minutes: 60 }, { kind: "after", minutes: 180 }, { kind: "next_day_at", time: "11:00" },
  { kind: "at", time: "18:30" }, { kind: "next_day_at", time: "11:00" },
];
export function ladderNext(attemptsAfterThis: number, now: Date, ops: OpsSetting, tz: string): Date | "exhausted";
```

Every result goes through `snapIntoWindow` and skips closed dates. AI-23 (R3, `docs/saas/spec/ai.md`) may supply
`suggestHour(scope, order)`; when it answers with ≥ 200 store attempts behind it, the ladder replaces the step's hour
with the suggested hour inside the window, never earlier than the step's own minimum gap, and the queue shows why
("17h-18h: 62% of your calls answered, n = 84").

### OPE-§6.3 Exhaustion

After attempt `ladder.length + 1` with a no-contact outcome: policy `close` → confirm → `unreachable` with reason
`attempts_exhausted` (source `system`, in the same transaction); policy `keep_open` → one attempt per day at the
last step's time until `keepOpenDays` after the first attempt, then `unreachable`. An unreachable customer who calls
back is confirmed by any agent through the **inbound path** (OPE-§5.7: exact-phone lookup, then `recordOutcome(…,
inbound: true)` with `confirmed`; class W, OPE-§3.2); managers and owners may also do it from the customer's page or
⌘K (they hold `orders.read_all`).

### OPE-§6.4 Cancel reasons (one tap, coded)

| Code | en | fr | ar |
|---|---|---|---|
| `changed_mind` | Changed their mind | A changé d'avis | بدّل رأيو |
| `price` | Price | Prix | الثمن |
| `mistake` | Ordered by mistake | Commande par erreur | طلب بالغلط |
| `bought_elsewhere` | Bought elsewhere | Acheté ailleurs | شرا من بلاصة أخرى |
| `not_ordered` | Says they didn't order | Dit ne pas avoir commandé | كيقول ما طلبش |
| `wrong_number` | Wrong number | Mauvais numéro | رقم غالط |
| `out_of_zone` | Outside delivery area | Hors zone de livraison | خارج منطقة التوصيل |
| `delay` | Delivery too slow | Délai trop long | التوصيل طويل بزاف |
| `see_first` | Wants to see the product first | Veut voir le produit avant | بغا يشوف المنتوج قبل |
| `customer_request` | Asked to cancel | A demandé l'annulation | طلب الإلغاء |
| `other` | Other | Autre | سبب آخر |

`blocked` and `attempts_exhausted` are system codes (not in the picker). Reason codes feed the KPIs, the profit lite
alerts and AI-23's cancel-reason insights.

### OPE-§6.5 Callbacks

- The picker offers "In 1 hour", "This evening 18:30", "Tomorrow 11:00", "Tomorrow 18:30" and a custom date/time,
  all computed in the store timezone; chips outside the window are marked "outside calling hours".
- A due callback reaches its owner first (claim `ORDER BY (assignee_id <=> :uid) DESC`); after the grace any agent
  may take it. The board lists overdue callbacks with their owner.
- `callback_due` in-app notification to the owner at `due_at` (computed by the pulse, not a job: the pulse counts
  `dueCallbacks` for the viewer, OPE-§27.3).

### OPE-§6.6 Data the learners read

AI-23 (`docs/saas/spec/ai.md`, R3) reads `call_attempt` events (outcome, channel, `at` in the store timezone, city
bucket of the order) and final outcomes (`state_changed` on ship), aggregated inside the store; no table is added
here. Operations guarantees: every attempt is one event; outcomes are coded; test orders carry `meta.test` on
`created` and are skipped by every learner.

---

## OPE-§7. Call script panel (OP-05; AI-15 hook)

### OPE-§7.1 Template language (shared with WhatsApp and Telegram texts, `src/lib/integrations/templates.ts`, P5)

```ts
/** "{var}" inserts a variable; "[[ … ]]" is an optional block dropped when any variable inside it is empty;
 *  "{{" and "}}" are literal braces. No other syntax, no expressions. Unknown variables fail validation at save. */
export const TEMPLATE_VARS = ["customer_first_name", "order_id", "product", "offer_label", "units_text", "qty", "total",
  "shipping_text", "city", "address", "landmark", "eta_text", "store_name", "agent_first_name", "confirm_number",
  "confirm_hours", "upsell_title", "upsell_price", "tracking_link", "order_count_today",
  "carrier_label", "carrier_tracking", "ship_after_date"] as const;   // rev 3 (OD55, OD49): appended, additive for P3's kit
export type TemplateVar = (typeof TEMPLATE_VARS)[number];
export function parseTemplate(src: string): { ok: true; parts: TemplatePart[]; vars: TemplateVar[] } | { ok: false; error: "unknown_var" | "unbalanced" | "too_long"; at: number };
export function renderTemplate(src: string, values: Partial<Record<TemplateVar, string>>): string;   // pure, isomorphic
export function orderTemplateValues(scope: StoreScope, order: OrderRow, viewer: { firstName: string | null; locale: Locale }): Promise<Partial<Record<TemplateVar, string>>>;
```

Every value comes from a stored fact (OD24, owner rule 4):

| Variable | Source | Empty when |
|---|---|---|
| `customer_first_name` | first word of `orders.name` | never (name required) |
| `order_id`, `product`, `offer_label`, `units_text`, `qty` | the order (`units_text` = `src/lib/orders/text.ts` warehouse text) | — |
| `total` | `orders.total` formatted by `src/lib/markets/money.ts` in the store currency and the template locale | — |
| `shipping_text` | `orders.shipping`: > 0 → "livraison {amount}" / "التوصيل {amount}" / "delivery {amount}"; = 0 → "livraison gratuite" / "التوصيل فابور" / "free delivery" | — |
| `city`, `address`, `landmark` | the order | when NULL |
| `eta_text` | `zoneLineFor(scope, cityKey)` (P3, landing.md) ETA text for the order's city | no zone, no ETA, unknown city |
| `store_name` | `stores.name` | — |
| `agent_first_name` | the viewer's member display name, first word | no display name |
| `confirm_number` | store setting `store.confirmation` (LAN Q10, core §D.10): `callerPhone` (E.164, rendered national) or, when absent, `whatsapp` digits; `withinHours` is **not** a template variable (a promise the store may not have made) | not set |
| `confirm_hours` | **rev 3 (OD57):** `shopperPromiseAllowed(w) ? hoursText(w, …) : ""` with `w = await callingWindowFor(scope)` (rev 4, OD63): today's effective calling ranges (overrides and closed dates applied), the same source as the thank-you `{when}` (**rev 4:** `store.confirmation.hours` no longer exists, core D73) | the window has no range today, **or the owner never saved the window (rev 4, OD63: `configured: false`)** |
| `carrier_label`, `carrier_tracking` (rev 3) | `orders.carrier_label`, `orders.tracking_ref` (OD55; R2: the active shipment's account label and tracking) | not set |
| `ship_after_date` (rev 3) | `orders.ship_after` formatted in the template locale ("5 nov.", "٥ نونبر") | no hold |
| `upsell_title`, `upsell_price` | the order's version doc `offers.upsell` when enabled and not already taken | no upsell, or taken |
| `tracking_link` | signed `/track` link (P3, LP-05) | tracking off |
| `order_count_today` | Telegram only | — |

### OPE-§7.2 Script document and compilation (`src/lib/callcenter/script.ts`, P4)

```ts
export const ScriptDoc = z.object({ v: z.literal(1), steps: z.array(z.object({
  id: z.string().regex(/^[a-z0-9_]{1,20}$/), title: z.string().min(1).max(40),
  say: z.string().max(400),                                   // template
  checks: z.array(z.string().max(60)).max(4).default([]),     // tick boxes, e.g. "Landmark noted"
  when: z.enum(["always", "upsell"]).default("always"),       // "upsell": only when upsell_* are non-empty
  action: z.enum(["none", "add_upsell", "edit_address"]).default("none"),
})).min(1).max(12),
  /** rev 2 (RA §4.5): objection answers shown as chips under the script; additive, optional, ≤ 6 */
  objections: z.array(z.object({
    id: z.enum(["price", "trust", "delivery_time", "think", "cheaper_elsewhere", "wrong_size"]),
    say: z.string().max(300),                                 // template; may use eta_text, total, confirm_number, store_name; never a claim the store did not state
  })).max(6).default([]),
});
export interface CompiledScript { locale: Locale; source: "builtin" | "store" | "ai"; templateId: string;
  steps: { id: string; title: string; text: string; checks: string[]; action: string }[];
  objections: { id: string; label: MessageRef; text: string }[] }
export function compileScript(scope: StoreScope, order: OrderRow, viewer: StoreCtx): Promise<CompiledScript>;
```

Selection: the active `call_script` row for (store, page of the order, locale), else for (store, every page,
locale), else the built-in. Locale = `orders.locale` when it is one of the store's locales, else the store default;
the agent can switch the language in the panel (ar / fr / en tabs). A step or objection whose text renders empty is
dropped. **Personalisation is template-only**: the compiled text is built on the server from the order's stored
values; no customer field ever enters a model prompt (RA §4.5, §9.14, core §F.11), so an AI-drafted script (OPE-§7.4)
is written once per product and page, never per order or per customer.

### OPE-§7.3 Built-in script (`src/lib/callcenter/script-builtins.ts`)

| Step | fr | ar (Darija-friendly) | en |
|---|---|---|---|
| Accueil / Greeting | Bonjour {customer_first_name}, ici[[ {agent_first_name} de]] {store_name}. Vous avez commandé {offer_label} chez nous. Vous avez une minute pour confirmer ? | السلام {customer_first_name}، معاك[[ {agent_first_name} من]] {store_name}. درتي عندنا طلب ديال {offer_label}. عندك دقيقة باش نأكدو؟ | Hello {customer_first_name}, this is[[ {agent_first_name} from]] {store_name}. You ordered {offer_label} from us. Do you have a minute to confirm? |
| Récapitulatif / Check | Je récapitule : {units_text}, total {total}[[, {shipping_text}]]. | غادي نعاود ليك الطلب: {units_text}، المجموع {total}[[، {shipping_text}]]. | Let me read it back: {units_text}, total {total}[[, {shipping_text}]]. |
| Adresse / Address (checks: city, address + landmark) | Vous êtes bien à {city} ? Pouvez-vous me donner l'adresse exacte et un repère proche ? | واش انت ف {city}؟ عطيني العنوان بالضبط وشي علامة قريبة. | You're in {city}, right? Could you give me the exact address and a landmark nearby? |
| Disponibilité / Availability | [[La livraison est prévue {eta_text}. ]]Vous serez joignable à ce numéro pour le livreur ? | [[التوصيل متوقع {eta_text}. ]]واش غادي تكون متوفر ف هاد الرقم للموزع؟ | [[Delivery is planned {eta_text}. ]]Will you be reachable on this number for the courier? |
| Proposition / Offer (`when: upsell`, action `add_upsell`) | Nous proposons aussi {upsell_title} à {upsell_price}. Voulez-vous l'ajouter à la commande ? | عندنا حتى {upsell_title} ب {upsell_price}. بغيتي نزيدوه ليك ف الطلب؟ | We also offer {upsell_title} for {upsell_price}. Would you like to add it? |
| Clôture / Close | Merci {customer_first_name}, votre commande est confirmée.[[ Livraison prévue {eta_text}.]] Bonne journée ! | شكرا {customer_first_name}، الطلب ديالك تأكد.[[ التوصيل متوقع {eta_text}.]] نهارك مبروك! | Thank you {customer_first_name}, your order is confirmed.[[ Delivery is planned {eta_text}.]] Have a good day! |

The texts carry no claim the store has not stated: no "most customers add…", no delivery promise without a zone ETA,
no courier behaviour. Policy lines (inspection on delivery, exchange window) are added by the manager in their own
script only from `policies` facts (landing.md); the editor offers them as insertable snippets only when the fact is
set.

Built-in **objection answers** (chips under the script, `ops.script.obj.<id>`; each only restates stored facts, so an
answer whose fact is missing is dropped):

| Objection | fr | ar (Darija-friendly) | en |
|---|---|---|---|
| `price` | Le prix de {offer_label} est {total}[[, {shipping_text}]]. Vous payez à la réception, rien avant. | ثمن {offer_label} هو {total}[[، {shipping_text}]]. كتخلص غير ملي يوصلك، والو قبل. | {offer_label} is {total}[[, {shipping_text}]]. You pay on delivery, nothing before. |
| `trust` | Vous payez le livreur en main propre après avoir vu le colis.[[ Pour toute question : {confirm_number}.]] | كتخلص الموزع يد بيد من بعد ما تشوف الكولي.[[ لأي سؤال: {confirm_number}.]] | You pay the courier in person after seeing the parcel.[[ Any question: {confirm_number}.]] |
| `delivery_time` | [[La livraison est prévue {eta_text}. ]]Nous vous prévenons le jour de la livraison. | [[التوصيل متوقع {eta_text}. ]]غادي نخبروك نهار التوصيل. | [[Delivery is planned {eta_text}. ]]We let you know on the delivery day. |
| `think` | Pas de souci. Je peux vous rappeler à quelle heure ? | ماشي مشكل. إمتى نقدر نعاود نعيط ليك؟ | No problem. When may I call you back? |
| `cheaper_elsewhere` | Je comprends. Ce que vous payez ici : {total}, à la réception, avec {store_name} comme interlocuteur. | فهمتك. اللي كتخلص هنا: {total}، ملي يوصلك، و{store_name} هي اللي مسؤولة. | I understand. What you pay here is {total}, on delivery, with {store_name} answering for it. |
| `wrong_size` | Dites-moi la taille ou la couleur que vous voulez, je corrige la commande maintenant. | قول لي القياس ولا اللون اللي بغيتي، نصحح الطلب دابا. | Tell me the size or colour you want and I correct the order now. |

The `cheaper_elsewhere` and `trust` answers deliberately make no comparative or quality claim (no "original", no
"best price"): the manager may add such a line only as a `policies` fact (warranty, exchange window) through the
snippet picker. Tapping a chip logs nothing but the chip id on the next outcome (`objectionId`, OPE-§6.1), which the
R3 learner reads as "which objection preceded which outcome" without any text.

### OPE-§7.4 Editing and AI drafts

- Editor at `/app/<h>/team/callcenter` → **Scripts** (`callcenter.configure`): per locale tabs, scope picker
  ("Every page" or one page), steps list (drag to reorder, add, remove), variable chips that insert `{var}`, live
  preview against the most recent order of that page (masked; "No order yet" uses a sample built from the page's
  lead item and price, labelled "Preview sample"), "Reset to built-in".
- AI-15 (R3, `docs/saas/spec/ai.md`; the task `callcenter.script` exists in R1 for SF-01's kit, core §K.2 P7):
  `callcenter.script` writes rows with `status = 'draft'`, `source = 'ai'`, `prompt_version`, **one per (page, locale)**
  from product facts, pack list, prices, policies and the store's Darija ratio (RA §4.5: generated per product, cached,
  invalidated when the facts change; the prompt is asserted to contain no phone, name or address pattern); the editor
  shows them in a "Suggested" lane with Approve (→ `active`, previous active row → `archived`) or Discard. Agents only
  ever see `active` rows (AI-15 acceptance 3). A draft's `objections` block is also a draft: the manager approves the
  whole document, never a chip alone.
- Acceptance: compiling the built-in script against the 40 order fixtures of `scripts/qa/ops-check.ts` yields zero
  numbers that are not in the order or the settings (the number scanner of `src/lib/ai/guard.ts` `allowedNumbers`,
  reused); an empty `eta_text` removes every sentence that mentions delivery timing.

---

## OPE-§8. Phone masking and reveal audit (OP-07, OP-19)

### OPE-§8.1 Masking (`src/lib/orders/masking.ts`, server-only; the browser receives masked strings only)

```ts
export function maskPhone(e164: string): string;    // "+212612345678" → "06 •• •• 56 78"; other countries: "+33 6 •• •• 56 78"
export function maskPhonesIn(text: string, country: string): string;   // notes, edit details, imported cells
export function phoneLast4(e164: string): string;
// rev 4 (CRIT14, OD61): no other masking helper is declared here. Under impersonation every operations read function
// calls the P0 frozen platform stub, imported, never redefined:
//   import { maskIfImpersonation, type Masked } from "@/lib/platform/mask";   // P1; PLA-§7.2; core §K.2 P0
//   maskIfImpersonation<T extends CustomerFieldsIn>(scope: StoreScope, row: T)   // identity for every scope kind but "impersonation"
// with the row shape CustomerFieldsIn = { name, phone, address, city, landmark, note }: this part always passes phone: null
// (the tenant phone is already maskPhone()d for every role, OD11) and rebuilds its own row (QueueOrder.customer,
// OrderListRow, TimelineItem detail, …) from the masked result.
```

Masked = national format with the first two national digits and the last four visible (libphonenumber-js, already a
dependency, `src/lib/markets/phone.ts`). Every list, queue card, timeline, customer page, ⌘K result, notification,
board and Telegram message (default) uses it. Search by phone still works (digits matched server-side, results
masked).

**Impersonation (rev 3, OD61; rev 4 CRIT14).** When `scope.kind === "impersonation"` (set by the seam for a "View as
store" session, core D70, §B.8), `maskIfImpersonation(scope, row)` is applied **at the repository boundary** by every
read function of this part that returns a customer field — `listOrders`, `OrderListRow`, the drawer loader, `QueueOrder` (never claimable
anyway: writes are refused), `orderTimeline` (`field_edited` details and notes → "Note hidden"), the customers list
and page, `searchOrders`, `inboundLookup`, the deliveries log summary, print views (refused: `shipments.write` is a
write) — so the tenant UI renders masked values with no per-component work. The phone stays masked as for every
role; `revealPhone`, exports and the Carrier CSV are refused (sensitive, core §B.8). The console's per-order reveal
(`recordPlatformReveal`, `pii.reveal` ↑) remains the only unmasking path. `scripts/qa/tenancy-cases/ops.ts` adds the
attack-suite case: the HTML and RSC payload of `/orders`, `/orders?order=<id>`, `/queue`, `/customers`,
`/customers/<id>` and `/integrations` under an impersonating session contain none of the customer canaries (name,
address, landmark, note; the PLA-§O.3 canary set), and `test:ops` asserts that every exported read function of
`src/lib/orders/{profile,admin,events,queue,customers}.ts` and `src/lib/callcenter/inbound.ts` calls
`maskIfImpersonation` (static check, like the `status` writer lint of §3.7) and that no file of this part declares a
function named `maskName`, `maskAddress` or `maskCustomerFields` (the platform's names stay single-sourced).

### OPE-§8.2 Reveal

```ts
export type RevealWhy = "call" | "whatsapp" | "view";
export function revealPhone(ctx: StoreCtx, orderId: string, why: RevealWhy, opts?: { templateId?: string; idem?: string }):
  Promise<ActionResult<{ e164: string; national: string; tel: string; wa: string /* https://wa.me/<digits>[?text=…] */ }>>;
```

The hot-path route `POST /api/app/<h>/ops/reveal` (OD36; `storeGuard(req, h, "orders.reveal_phone")`,
`Idempotency-Key`) answers in ≤ 200 ms p75: one row read by id, one `order_events` insert, one bucket increment, the
template render (pure). A replayed key answers the same `tel` / `wa` without a second `phone_revealed` row.

- Permission `orders.reveal_phone` (sensitive: refused to impersonation). Agents: only orders where they hold the
  claim or are the assignee (callbacks), **or that they held in the last 30 minutes** (rev 3, OPS-19: the last
  `claimed` event of the order has `actor_id = u` and `at ≥ now − 30 min`, one range read on `oe_order_idx`; the
  follow-up WhatsApp after a call that overran the lease). Owner, admin, manager: any order of the store, no reason
  prompt (OD11).
- Writes `phone_revealed` (meta `why`), renews the claim lease, increments the agent's reveal counter
  (`s:<sid>:reveal:<uid>` bucket, OPE-§L) and `agent_stats_daily.reveals` (rollup).
- `why: "whatsapp"` with a template also writes `whatsapp_sent` and returns `wa` with the rendered, URL-encoded text
  (OPE-§22.3).
- The revealed number lives only in the component state of the open drawer or card; it is never cached, stored in
  web storage, or put in a URL of the app (core §F.10 rule; `tel:` and `wa.me` links are opened, not navigated to
  inside the app).

### OPE-§8.3 Where full numbers exist

| Place | Who | Audit |
|---|---|---|
| Reveal response | as §8.2 | `phone_revealed` |
| Orders CSV export | `orders.export` (owner, admin and, rev 4 per core §A.3.2 / OPS-22, manager); fresh step-up (OD64) | `audit("orders.exported", { count, filters })` |
| Carrier CSV (R1, OD55) | `shipments.write` (owner, admin, manager); fresh step-up (OD64) | `manifest_exported` per order + `audit("orders.carrier_exported", { count })` |
| Carrier manifest export (R2) | `shipments.write` | `manifest_exported` per order |
| Google Sheet column E | whoever the owner shares the sheet with | outside the app; agents never get the link (OD12) |
| Telegram `pii: "full"` | the owner's chat | setting change audited |
| Webhooks with `include_phone` (R2) | the endpoint | endpoint change audited |

### OPE-§8.4 Reveal-rate alarm (OP-19, R2, S4)

- Rolling hour count per agent from the reveal bucket. Above `ops.revealAlarmPerHour` → notification
  `ops.reveal_alarm` to managers and owners (dedupe per agent per hour) and a badge on the board row.
- Above twice the threshold → further reveals by that agent answer `reveal_paused` for 15 minutes (the agent sees
  "Too many numbers opened. Ask your manager."); a manager can lift the pause from the board (audited).
- Acceptance: 61 reveals in an hour with the default 60 notify once; 121 pause; the pause lifts after 15 minutes or by
  a manager.

---

## OPE-§9. Customers, duplicates and the blocklist (OP-06, OP-12)

### OPE-§9.1 Customer upsert and counters (`src/lib/orders/customers.ts`)

- Creation hook: `INSERT … ON DUPLICATE KEY UPDATE` on `(store_id, phone)`: `orders_count + 1` (or `test_count + 1`
  for test orders), `last_order_at`, `last_order_id`, `name` / `city` / `city_key` / `locale` refreshed from the newest
  order; `first_order_at` on insert; then `orders.customer_id` set (same transaction as the `created` event).
- Transition hook (`inTx`): for each move, decrement the counter of the state left and increment the counter of the
  state entered (`confirmed_count`, `cancelled_count` for cancelled and unreachable, `fake_count`,
  `delivered_count`, `refused_count`, `returned_count` incl. lost); test orders touch nothing but `test_count`.
- An edit that changes the phone moves the order to the other customer row (counters moved, both `updated_at`).
- `ops.customers_reconcile` (nightly, cursor over stores, ≤ 5,000 customers per store per night) recomputes counters
  from `orders` and logs the drift in `job_runs.summary`.

### OPE-§9.2 Customer page and drawer history

- Drawer and queue card: one line "3 delivered · 1 refused · 2 cancelled" (`history`) for every role, because counts
  carry no other order's details; owners, admins and managers also see the list of the customer's other orders (id,
  date, product, status, total) with links. Agents never see that list (OD12).
- `/app/<h>/customers` (`customers.read`): search by name or phone digits (results masked), filters "Has refused or
  returned", "Blocked", "Repeat buyers" (delivered ≥ 2), sort by last order; keyset paging (50). Columns: name, masked
  phone, city, orders, delivered, refused + returned, last order, blocked chip.
- `/app/<h>/customers/<id>`: header (name, masked phone + reveal, city, first and last order, delivered rate with n),
  orders list, internal note (≤ 300 chars, `customers.read` + `orders.write`), actions: New order for this customer
  (OPE-§11), Block (and cancel open orders), Unblock. Agents reach a customer page only from an order they can see or
  from an inbound lookup (OPE-§5.7, rev 3), and see counts only.
- Accountants (R2) see customers without phones (core §A.3.2): name, city, counts.

### OPE-§9.3 Store-wide duplicate detection (R1)

In the `ops.created` hook:

```sql
SELECT id, created_at, confirm_state, ship_state FROM orders
 WHERE store_id = :sid AND phone = :phone AND id <> :id AND is_test = :isTest
   AND created_at >= UTC_TIMESTAMP(3) - INTERVAL :days DAY
   AND (confirm_state IN ('new', 'attempting', 'callback') OR (confirm_state = 'confirmed' AND ship_state IN ('none', 'to_pack', 'packed')))
 ORDER BY created_at DESC LIMIT 5;      -- orders_store_phone_idx (store_id, phone, created_at)
```

- Matches → `duplicate_suspected` on the new order (`of` = the matches) and on each match (`of` = [new id]). The
  queue card and the drawer show "Possible duplicate of CMD-7K3Q9X (2 h ago)" with **Mark as duplicate** (outcome
  `duplicate`, `duplicateOf` = the older open order by default) and **Keep both** (`duplicate_dismissed`, the pair is
  not shown again).
- The duplicates of a view are computed at read time with the same predicate (no flag column), so dismissing or
  cancelling one order updates every view at once.
- The public path's own rule (same phone, same page, 12 h: refused for the same network, flagged otherwise,
  `src/lib/orders/create.ts:172-191`) is unchanged and complementary.

### OPE-§9.4 Merge (R2, S4)

`mergeOrders(ctx, keepId, dupId)` (`orders.edit` + `orders.assign`), both orders pre-ship and of the same phone:
the kept order becomes an OrderItems v3 order (core §K.4 payload v3, `{ v: 3, lines }`) whose lines are both orders'
priced lines (each priced by its own version, unchanged cents), one shipping fee (the kept order's), the adjustments
summed; `qty`, `subtotal`, `total` recomputed; the duplicate → confirm `duplicate`, `merged_into = keepId`; events
`merged` on both; Sheets: kept row cells rewritten (bit 4), duplicate row label "Doublon". Acceptance: the merged
total equals the sum of the two line totals plus one fee; a merge of orders from two phones or after shipping is
refused; the PHP export contract is untouched (live orders only).

### OPE-§9.5 Blocklist (OP-12; scoping landed in R1.0 by T3/T4)

```ts
export function blockPhoneAndCancel(ctx: StoreCtx, input: { phone?: string; orderId?: string; reason?: string; openOrders: "fake" | "cancel" | "keep" }):
  Promise<ActionResult<{ blocked: true; moved: { id: string; ok: boolean; error?: TransitionError }[]; untouched: string[] /* already shipped */ }>>;
```

- Permission `blocklist.write`; moving the open orders also needs `orders.write` (managers have both). The dialog
  previews "This number has 2 open orders and 1 shipped order" before confirming.
- Open pre-ship orders move to `fake` (default) or `cancelled` with reason `blocked`; shipped orders are listed and
  never touched. Events `blocked` + the transitions; `audit("blocklist.added")` with the store id.
- The list (`/app/<h>/customers?tab=blocked`) shows phone (masked) or IP (hash prefix), reason, who, when; unblock
  (`blocklist.write`, audited). Phone input is normalised with the store market's country (`normalizePhone`,
  `src/lib/markets/phone.ts`), fixing ORD-16's global `phoneCountry`.

---

## OPE-§10. Address normalisation and risk explanation (OP-13, OP-14)

### OPE-§10.1 City keys and suggestions (`src/lib/orders/address.ts`, P4; P0 frozen stub for P3, core §K.2, accepted Q.8)

```ts
// src/lib/orders/address.ts — cityKey() and CityKey are PURE and ISOMORPHIC (no server import, ≤ 400 B minified), so a
// chunk MAY bundle them; rev 4 (CRIT1): none is required to — browser zone tables are keyed by the posted City.value and
// built on the server (zonesForCheckout, LAN-§7.1). normalizeCity stays server-side.
export type CityKey = string & { readonly __city: true };   // "casablanca", "fes", "ksar-el-kebir": the ONE city key of the platform (OD47)
export const CITY_KEYS: readonly CityKey[];                  // every key of MA_CITIES except "Autre", derived at build from src/lib/markets/cities-ma.ts
export function cityKey(value: string): CityKey | null;      // slug of the stored French value of src/lib/markets/cities-ma.ts (NFKD, diacritics removed, lowercase, spaces and apostrophes → "-"); "Autre", unknown → null
export function cityLabel(key: CityKey, locale: "ar" | "fr" | "en"): string;   // the display label (fr = City.value)
export function normalizeCity(input: string, market: string, aliases?: Record<string, CityKey>):
  { key: CityKey | null; value: string | null; confidence: "exact" | "alias" | "fuzzy" | "none"; suggestions: { key: CityKey; label: string }[] };
```

**One key everywhere (rev 3, OD47, OPS-1; rev 4, CRIT1).** Revision 2 left two definitions in the platform: landing
stored `City.value` ("Fès") in `delivery_zones.cities` and matched `zoneForCity` exactly, while this part keyed
`orders.city_key`, `carrier_rates.city_key`, `opsAggregates(dims: ["city"])` and `city_refusal` on the slug. The slug
is now canonical for every **stored** key and every **server** API, and the browser sees only posted values:
- `delivery_zones.cities` holds slugs (`["casablanca", "mohammedia"]` or `["*"]`); `saveZones` validates against
  `CITY_KEYS`; the order form's `<select>` and the store checkout **keep posting `City.value`** ("Fès", the frozen payload
  v2 contract and what `orders.city` stores), and the server (`create.ts` through the `ops.created` hook, the manual
  path, the v3 path, `zonesForCheckout`) converts **once** with `cityKey()`.
- **rev 4 (CRIT1): browser zone tables are keyed by the posted value.** The `lp-assist` data block and the storefront's
  `#sg-config` both embed landing's `ZoneTable` from `zonesForCheckout(scope)` (core §K.2 P0, LAN-§7.1): `city:
  Record<City.value, zoneIndex>` built on the server from the slug-keyed zones, `star` for any absent value ("Autre", a
  typed city). No browser chunk computes a slug, so no chunk has to bundle `cityKey` (it stays pure and isomorphic, so
  bundling remains *possible*, never *required*); revision 3's "`assist` bundles `cityKey`" and "`#sg-config` carries
  slugs" are withdrawn here, and the storefront's per-city `s` slug field becomes unnecessary (OPE-§R2 notes).
- `zoneForCity(zones, key: CityKey | null)` (landing) answers the exact-key zone, else the `*` zone, else null; `null`
  (the shopper picked "Autre", a free-text city that did not normalise, or a market without a list) therefore reaches
  the `*` zone when one exists, so "Autre" is served by the "Reste du Maroc" zone the owner typed.
- `zoneLineFor(scope, key: CityKey | null, at?)` (the P0 stub, core §K.2) takes the same argument; this part passes
  `orders.city_key` (which is `cityKey(orders.city)` or an alias match, never a re-derivation at read time).
- Parity fixture `scripts/qa/fixtures/city-key.json` (P4) shared by `test:ops` (P4), `test:delivery` (P3) and
  `test:catalog` (S1), with three sections: **`slugs`** (every `City.value` of `cities-ma.ts` and its ar / fr / en
  spellings → one `CityKey`; "Autre" → `null`), **`zoneTable`** (rev 4, CRIT1: a slug-keyed zone set → the expected
  `ZoneTable.city` keyed by `City.value`, "Fès" → the `fes` zone's index, "Autre" absent → `star`; any slug appearing
  as a `city` key fails) and **`flows`** ("Fès picked in the form → `city = "Fès"`, `city_key = "fes"`, zone found, ETA
  shown on the card, in `{eta_text}`, on the tracking page and at the store checkout"). If any side changes either
  key shape, the three suites fail together.
- The landing-side changes (zone table contents, `zoneForCity` signature) are landing.md's (LAN-§2.1, §7.1) and the
  storefront's (STO-§12.3, §15.9); the core §K.2 stub lines are already widened to `CityKey | null` (core §Q.8
  Q.27e / f). Existing `delivery_zones` rows are empty today (TENANCY-MAP), so no data migration exists.

- Folding: Latin = NFKD, diacritics removed, lowercase, punctuation and repeated spaces removed; Arabic = tashkeel
  and tatweel removed, أ إ آ → ا, ة → ه, ى → ي, a leading "ال" ignored for matching only.
- Exact = the folded input equals the folded fr, en or ar label of a city; alias = the store's `ops.cityAliases` plus
  a short built-in list (only the English and French spellings already in `cities-ma.ts` and "casa" → casablanca);
  fuzzy (suggestions only) = Levenshtein ≤ 1 for 4-6 letters, ≤ 2 for 7+ letters, Latin script only.
- Applied at creation: exact or alias → `city_key`; fuzzy → nothing written, the drawer shows "Did you mean
  Kénitra?" and one tap edits the order (`field_edited`). Nothing is ever changed without a person.
- Markets other than MA: `city_key` NULL in R1 (no list); `zoneForCity(zones, null)` then answers the implicit
  "everywhere" zone of LAN-§2.1.
- `zoneLineFor(scope, cityKey)` (landing.md), `delivery_zones.cities`, `carrier_rates.city_key`, `ops.cityAliases`
  values, `AssignmentRule.when.cityKeys`, `ops.carrierRouting[].cityKey`, `finance_daily` `city:<key>` dims and the
  `city_refusal` alert key all use the same slug keys (OD47).

### OPE-§10.2 Risk explanation (`src/lib/orders/risk-explain.ts`, pure, isomorphic)

```ts
export interface RiskReason { flag: RiskFlag; points: number; text: MessageRef }
export function explainRisk(score: number, flags: readonly string[], history: CustomerHistory | null): { level: "low" | "check" | "high"; reasons: RiskReason[]; positive: MessageRef | null };
```

Levels: < 50 low (no chip), 50-69 "To check", ≥ 70 "High risk" (`src/lib/orders/risk.ts:2-4`: advisory, never
blocks). Top three reasons by points; texts from the closed flag list of `risk.ts:42-67`:

| Flag | en | fr | ar |
|---|---|---|---|
| `too_fast` | Form filled in under 3 seconds | Formulaire rempli en moins de 3 secondes | تعمّرات الاستمارة ف أقل من 3 ثواني |
| `fast` | Form filled very quickly | Formulaire rempli très vite | تعمّرات الاستمارة بزربة بزاف |
| `no_ua`, `bot_ua` | Sent by an automated tool | Envoyée par un outil automatique | تصيفطات من أداة أوتوماتيكية |
| `captcha_missing` | Anti-spam check missing | Vérification anti-spam absente | التحقق ضد السبام ناقص |
| `captcha_unverified` | Anti-spam check not confirmed | Vérification anti-spam non confirmée | التحقق ضد السبام ما تأكدش |
| `no_origin` | Not sent from a web page | Pas envoyée depuis une page web | ما تصيفطاتش من صفحة ويب |
| `ip_repeat` | Several orders from the same network today | Plusieurs commandes du même réseau aujourd'hui | بزاف ديال الطلبات من نفس الشبكة اليوم |
| `history_bad` | This number had {n} orders that did not arrive | Ce numéro a eu {n} commandes non abouties | هاد الرقم عندو {n} طلبات ما وصلوش |
| `page_burst` | Unusual burst of orders on this page | Afflux inhabituel de commandes sur cette page | طلبات بزاف ف وقت قصير على هاد الصفحة |
| `duplicate` | Same number ordered this page in the last 12 hours | Même numéro sur cette page dans les 12 dernières heures | نفس الرقم طلب من هاد الصفحة ف 12 ساعة اللخرة |
| `returning_customer` (positive) | Returning customer: {n} delivered | Client fidèle : {n} livrées | كليان قديم: {n} توصلو |

`{n}` comes from the store's customer row (`fake + returned + cancelled`, `delivered`), never from another store.
Honeypot orders never reach a person: the creation hook moves them to `fake` with reason `honeypot` (source `system`)
and they are excluded from every KPI. AI-23 (R3) may add `risk.explain` text built from features only.

**Store calibration (OD39, `riskBandOutcomes`, `src/lib/callcenter/aggregates.ts`, P4):**

```ts
export interface RiskBandOutcome { band: "check" | "high"; decided: number; bad: number /* fake + cancelled + unreachable */; badShareBp: number }
export function riskBandOutcomes(scope: StoreScope): Promise<Record<"check" | "high", RiskBandOutcome | null>>;   // trailing 90 days, decided orders only, test and honeypot excluded, null below decided = 30; scopedCache("ops-risk-cal") 1 h
```

The drawer and the queue card add one line under the reasons when the band has ≥ 30 decided orders: "In your store,
orders like this one ended fake, cancelled or unreachable 38% of the time (52 orders)" (`ops.risk.calibration`, ar/fr/en).
The sentence names the store's own history and nothing else: no platform rate, no model (`ai_risk_v2` is a third,
clearly labelled line in R3). Coverage test: every flag of `scoreRisk` (`risk.ts:49-64`, incl. `honeypot`, `fast`,
`captcha_unverified`, `returning_customer`) has a text in the three languages (`test:ops` iterates the `flags` array
by reading the source constants, so a new flag fails the test until it has a sentence).

---

## OPE-§11. Manual orders, post-creation editing, lead conversion (OP-08)

### OPE-§11.1 `createManualOrder` (`src/lib/orders/manual.ts`, P4)

```ts
export interface ManualOrderInput {
  pageId: string;                                   // a live page of the store (published version)
  selection: { offerId: string; units: UnitIn[]; extras: Record<string, string>; bump: boolean };   // the payload v2 selection shape
  customer: { name: string; phone: string; city: string; address?: string; landmark?: string; note?: string; email?: string };
  source?: "manual" | "whatsapp";                   // default "manual"; "whatsapp" when converted from a WhatsApp intent (LP-11)
  confirmed: boolean;                               // "The customer already confirmed" (default true for phone orders)
  adjustCents?: number;                             // manager+ only, ≤ 0, with adjustReason
  adjustReason?: string;
  fromLead?: { leadId: string };                    // set by convertLeadToOrder (core §K.2 P0 signature)
  allowDuplicate?: boolean;                         // second submit after the duplicate warning
  idem: string;                                     // the sheet's draft id (UUID), written to orders.idem: a double submit returns the first order (OD36)
}
export function quoteManualOrder(ctx: StoreCtx, input: ManualOrderInput): Promise<ActionResult<ManualQuote>>;    // orders.create, no write
export function createManualOrder(ctx: StoreCtx, input: ManualOrderInput): Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>>;   // P0 frozen stub (core §K.2)
export interface ManualQuote { lines: QuoteLine[]; subtotalCents: number; shippingCents: number; adjustCents: number; totalCents: number; currency: string; warnings: ("duplicate" | "blocked" | "city_unknown")[]; duplicates: { id: string; createdAt: string }[] }
```

Steps:
1. Page by `byId(pages, scope, pageId)` with status published; doc = its published version (`page_versions`), never
   a draft. A page outside the store → `not_found`.
2. Build an `OrderPayloadV2` in memory (`pageKey` of the page, `idem` = `input.idem` (an existing `orders.idem` of this
   store → answer that order with `replayed: true`, `orders_idem_uq` is global, the lookup is still scoped), `v: 2`,
   `ver` = the version id, `st` = the quoted total, `t` = 60,000) and run **`validateOrder(payload, doc)`**
   (`src/lib/orders/validate.ts:320`):
   the same field rules, option rules, stock of choices and integer-cent pricing as the public form. Field errors
   come back to the form exactly as the runtime gets them.
3. Store blocklist: a blocked phone answers `blocked` with the visible text "This number is blocked in your store"
   (staff only; the public path keeps its generic answer). Duplicates (§9.3 predicate) answer `duplicate` with the ids
   unless `allowDuplicate`.
4. Adjustment: needs `orders.force_status` (manager+), `-subtotal ≤ adjustCents ≤ 0`, reason ≥ 3 chars.
5. **Insert through `createOrderRow(draft, ctx)`** (rev 3, OD62, ENGC-13): T3 extracts it in R1.0 from
   `src/lib/orders/create.ts:255-300` (the id generator and its `ER_DUP_ENTRY` retry loop, the default axis states and
   `rev = 0`, `is_test` from `ctx.test`, `upsell_token_hash`, the `created` event, the `INSERT IGNORE` outbox items and
   the `runOrderHooks("created")` call) and the maintainer freezes its signature at P0; it is the **only** insert of an
   order row in the codebase (`scripts/qa/ops-check.ts` greps for a second `insert(orders)`; the revision 2 request to
   export `newOrderId` (Q.9c) is withdrawn, the function stays private to `create.ts`). The manual draft carries
   `source`, `created_by = ctx.user.id`, `risk_score = 0`, `flags = ["manual"]`, `version_id`, `currency =
   stores.currency`, `locale` = the store default, `sheet_status = "pending"`, `is_test = false`; after the insert, when
   `confirmed`, `transitionOrder(want confirm confirmed, source "ui", shipAfter?)` with the creator as `confirmed_by`.
6. No ad event (OD16) unless `conversions.manualOrders` is on (then trigger rules apply, without browser ids).
7. Rate: `s:<sid>:manual:<uid>` 60 per hour.

### OPE-§11.2 New-order sheet (UI, `src/components/admin/orders/manual/**`)

Opened from ⌘K "Create → Manual order", the Orders page, a customer page ("New order for this customer", phone
pre-filled) and the leads inbox ("Convert", P3). One sheet, three blocks on one scroll (no "Step 1/2/3" labels,
RF §2.1 rule 8):
1. **Product**: live pages as compact rows (thumbnail, name), then the page's offers as cards with the payable price
   from `src/lib/page/pricing.ts` (the same numbers the page shows) and the option pickers (choice, matrix, fields)
   built on `src/lib/page/options.ts` availability rules; unavailable choices disabled with the page's own label.
   **rev 3 (OD62, R2):** the block is routed by store mode — `landing`: pages (this block); `store`: S1's product
   picker (`src/components/admin/catalog/product-picker.tsx`, search by name or SKU, offer and option pickers from
   `productAsPageDoc`, ≤ 20 lines) feeding S1's `quoteManualOrderV3` (STO-§16.9; OPE-§11.5); `both`: a segmented
   "Page / Product" switch, pages first when the store has live landing pages (`manualSheetMode`, OPE-§11.5 step 1).
2. **Customer**: phone (country from the store market, as-you-type format, `dir="ltr"`), name, city combobox over the
   store's city list with folded matching (OPE-§10.1), address, landmark, customer note. **rev 3 (UX-31):** the
   address field is required or optional exactly as the store's `checkout.addressMode` says (the one setting the
   landing form and the store checkout read; landing.md / storefront.md), so an agent is never asked for less than
   the courier needs.
3. **Summary**: lines, delivery, adjustment (managers), total; the total shown is the server quote (`quoteManualOrder`,
   debounced 250 ms, skeleton while quoting); "Customer already confirmed" switch; **Create order**.

States: quoting, stale quote (the page was republished: "Prices changed, check the summary"), duplicate warning
(list + "Create anyway"), blocked (create disabled), field errors inline, success toast with "Open order".

### OPE-§11.3 `editOrder` (`src/lib/orders/edit.ts`, P4)

```ts
export interface OrderPatch {
  name?: string; phone?: string; city?: string; address?: string | null; landmark?: string | null; note?: string | null;
  selection?: { offerId: string; units: UnitIn[]; extras: Record<string, string>; bump: boolean; upsell?: boolean };
  adjust?: { cents: number; reason: string };
}
export function editOrder(ctx: StoreCtx, orderId: string, patch: OrderPatch, expectRev: number): Promise<ActionResult<{ rev: number; totalCents: number }>>;
```

- Permission `orders.edit` (agents on orders they hold or own, or looked up inbound, OPE-§5.7); allowed while ship ∈
  {none, to_pack, packed} and confirm ∉ {cancelled, fake, duplicate}; else `locked` — **except the contact fields
  `address`, `landmark` and `note` (rev 3, OPS-21), which stay editable while ship ∈ {shipped, in_transit,
  out_for_delivery, attempt_failed, postponed}**: the `field_edited` event carries `inTransit: true`, the drawer shows a
  "Tell the carrier" chip on the shipment (R2: the manual adapter lists the order in "Changes to pass on" until the
  warehouse ticks it; R3: API adapters with `updateParcel` push it), and the Sheet row is marked dirty (bit 2) so the
  sheet shows the new landmark. Lines, phone, city and the adjustment stay locked once shipped. A customer who cancels
  during delivery is recorded with `recall_requested` (OPE-§6.1a `cancel_recall`, also available in the drawer under
  "More…" for any `orders.write` holder), never with a confirm move.
- `selection` re-validates against the order's `version_id` doc when that version still exists, else the page's
  current published version (the summary says which); `upsell: true` adds the version's thank-you upsell through
  `upsellRecord()` (`src/lib/orders/upsell.ts:91`) at its configured price. `items`, `qty`, `subtotal`, `shipping`,
  `total` are rewritten from the result; nothing is typed.
- `adjust` = manager+ (`orders.force_status`), as §11.1 step 4.
- Phone change: re-normalised (store market), customer link moved (§9.1), duplicate check re-run.
- One `field_edited` event lists every changed field with before / after; `rev + 1`; `sheet_dirty |= 2` (contact) or
  `|= 4` (lines); `runOrderHooks("edited")`.
- An edit after a sent Purchase (trigger `order`) sends nothing new; later triggers use the current total.

### OPE-§11.4 Lead conversion (LP-06, LP-11; leads are landing.md's)

```ts
export function convertLeadToOrder(ctx: StoreCtx, leadId: string, input: Omit<ManualOrderInput, "fromLead" | "pageId" | "source">): Promise<ActionResult<{ orderId: string }>>;   // P0 frozen stub (core §K.2)
```

Pre-fills from the lead (page, phone, name, city, offer, units, extras; a `whatsapp` lead's `sel` is the server-priced
`LeadSelection` of LAN Q2, re-priced here anyway), creates through §11.1 with `fromLead`, source `whatsapp` when
`leads.kind = 'whatsapp'` (LP-11) else `manual`, then calls `markLeadConverted(scope, leadId, orderId)` (P3's
`src/lib/orders/leads.ts`, frozen P0 stub) which sets `converted_via = 'agent'`. A lead already converted answers
`already_converted` with the order id; a lead of another store answers `not_found`. The order's `created` event meta
carries `{ leadId }` and P3's hook appends `lead_attributed` (OPE-§4.1). **rev 3:** a `whatsapp` lead whose `sel` is a
v3 selection (a store intent, STO-§15.13) converts through S1's `createManualOrderV3` (STO-§16.9, with `fromLead`;
OPE-§11.5) and a v2 selection through §11.1; `convertLeadToOrder` dispatches on `sel.v` (core §K.2 P0).

### OPE-§11.5 Catalog orders by phone and WhatsApp: payload v3 (rev 3, OD62, OPS-15; R2)

A store-mode call center takes phone orders for products and adds a line to a cart order; revision 2 had no function
for it (`createManualOrder` validates a v2 selection against a landing version and v3 orders have `page_id NULL`).

**rev 4 (CRIT4; core §K.4, §Q.8 Q.27h A\*): the v3 functions are S1's, not this part's.** `quoteManualOrderV3`,
`createManualOrderV3` and `editOrderV3` live in **`src/lib/catalog/order-v3.server.ts` (S1)**, built on `priceLine`
(STO-§16.3) and the shared `createOrderRow` (OD62), with **STO-§16.9 as their signature source** (frozen at the R2
contract step); one pricing owner makes "manual v3 total = public v3 total" true by construction. The revision 3 files
`src/lib/orders/{manual-v3,edit-v3}.ts` and the `ManualOrderV3Input` / `ctxPageId` shape declared here are withdrawn;
this section only states what the manual-order sheet consumes and requires.

```ts
// consumed, never redefined (names as STO-§16.9 declares them; STO-§16.9 wins on any drift):
import { quoteManualOrderV3, createManualOrderV3, editOrderV3,
         type ManualOrderInputV3 /* lines 1..20 without ls / rev, customer, source?, confirmed, adjust*, fromLead?, allowDuplicate?, idem */,
         type ManualQuoteV3      /* per-line verdicts, subtotalCents, deliveryCents, deliveryRule | "not_set", warnings incl. "fee_unset" */,
         type OrderPatchV3       /* contact?, lines?, adjust? */ } from "@/lib/catalog/order-v3.server";
```

What the sheet does with them (S4 builds it in R2; the behaviour is this part's):
1. **Routing by store mode** (`manualSheetMode(storeMode, hasLivePages): "pages" | "products" | "switch"`, a pure
   function in `src/components/admin/orders/manual/mode.ts`, S4's folder): `landing` → the pages picker and
   `createManualOrder` (§11.1); `store` → S1's product picker (`src/components/admin/catalog/product-picker.tsx`) and
   the v3 functions; `both` → a "Page / Product" switch, pages first when the store has live landing pages.
2. **Quote first**: the summary shows `quoteManualOrderV3` (debounced 250 ms); a `changed` line reads "price changed,
   now {x}" and is accepted on re-submit; `unavailable` / `removed` lines are disabled with their verdict.
3. **No invented delivery fee**: on `fee_unset` (no zone covers the city) **Create order stays disabled** with
   "Delivery fee not set for {city}" and, for owners, a link to Delivery. An adjustment cannot cover it: adjustments
   are ≤ 0 by rule (OD15, §11.1 step 4), so STO-§16.9 step 1's "override with `adjustCents`" is impossible and is
   listed for storefront in OPE-§R2's notes.
4. **Hold** ("Deliver from…", OD49): `ManualOrderInputV3` has no `shipAfter`; when the agent picks a date the sheet
   calls `createManualOrderV3({ confirmed: true, … })` and then `setShipAfterAction(orderId, date)` (§M.3) in the same
   submit; both writes are idempotent on the sheet's `idem` (the second is a no-op when replayed), and the To-pack views
   exclude the order from the moment `ship_after` is written (the gap is one request).
5. **Edits**: "Add a line" / line changes on a **v3** order call `editOrderV3` (locked once `ship_state ∉ {none,
   to_pack, packed}`); **contact-only** edits on any order, v2 or v3, call operations' `editOrder` with contact fields
   only (§11.3), which is payload-agnostic and keeps the in-transit exception of OPS-21 (`address`, `landmark`,
   `note` with `inTransit: true`) in one place.
6. **Ownership**: S4 owns `src/components/admin/orders/manual/**` (the whole sheet from R2, taken over from P4) and the
   Carrier CSV route's `format=xlsx`; S4 never writes under `src/lib/catalog/**`; S1 exposes the three functions,
   `priceLine`, `storeDeliveryFee`, `productAsPageDoc` and the product picker.

Acceptance: the parity "manual v3 total = public v3 total", the `fromLead` conversion (`converted_via = 'agent'`,
`source = 'whatsapp'`, `page_id NULL`), the 20-line `editOrderV3` and the cross-store refusal are **S1's assertions**
(`test:catalog`, `test:storefront-db`, STO-§16.9 step 6); S4 adds `manualSheetMode`'s table, the `fee_unset`
disabled state and the hold two-step to its own `scripts/qa/carrier-check.ts` (`test:carriers`), per OD65.

---

## OPE-§12. Orders list, saved views, bulk actions, export, print, drawer (OP-09)

### OPE-§12.1 Built-in views (code constants in `src/lib/callcenter/views.ts`)

| View | Predicate | Default for |
|---|---|---|
| To call now | callable now (§5.1, window ignored for viewing) | managers |
| Callbacks due | confirm `callback` ∧ `due_at ≤ now + 15 min` | managers, agents ("My callbacks") |
| New | confirm `new` | — |
| No answer | confirm `attempting` | — |
| To pack | confirm `confirmed` ∧ ship ∈ {to_pack, packed} ∧ (`ship_after IS NULL` ∨ `ship_after ≤ now`) (rev 3, OD49: holds excluded) | owners |
| On hold (rev 3) | confirm `confirmed` ∧ ship ∈ {to_pack, packed} ∧ `ship_after > now`; columns add "Ship from" | — |
| On the way | ship ∈ {shipped, in_transit, out_for_delivery, postponed} | — |
| Delivery problems (rev 3, OD48) | ship ∈ {attempt_failed, postponed}; columns add attempts, last carrier status (R2), tracking, "Rescue" (lane state: waiting / informed / rescheduled / exhausted) | managers, owners (when ≥ 1) |
| Delivered | ship `delivered`; **rev 3 (R2):** a "Partial" chip when `collected_cents < total` | — |
| Refused & returned | ship ∈ {refused, returned, lost}; **rev 3:** a reason column (`return_reason`, OD50) and a filter by reason | — |
| Cancelled & fake | confirm ∈ {cancelled, fake, duplicate, unreachable} | — |
| High risk | open ∧ `risk_score ≥ 50` | — |
| Possible duplicates | open ∧ an open sibling of the same phone (§9.3) not dismissed | — |
| Sheet sync failed | `sheet_status = 'failed'` | owners (when Sheets is connected) |
| Test orders | `is_test = 1` | — |
| My orders (agents) | `assignee_id = me ∨ confirmed_by = me`, last `agentHistoryDays` | agents |

### OPE-§12.2 Query model and saved views

```ts
export const OrderQuery = z.object({
  q: z.string().max(80).optional(),                                   // id, phone digits (≥ 4), name
  confirm: z.array(z.enum(CONFIRM_STATES)).optional(), ship: z.array(z.enum(SHIP_STATES)).optional(),
  money: z.array(z.enum(MONEY_STATES)).optional(), status: z.array(OrderStatusId).optional(),   // legacy labels
  assignee: z.union([Id26, z.literal("none"), z.literal("me")]).optional(), confirmedBy: Id26.optional(),
  pageId: Id26.optional(), cityKey: CityKey.optional(), source: z.array(OrderSource).optional(),
  minRisk: z.number().int().min(0).max(100).optional(), from: ISODate.optional(), to: ISODate.optional(),
  dueBefore: z.string().datetime().optional(), sheet: z.enum(["pending", "failed", "synced"]).optional(),
  test: z.boolean().optional(), view: z.string().max(32).optional(),
  // rev 3
  hold: z.enum(["active", "none"]).optional(), returnReason: z.array(z.enum(RETURN_REASONS)).optional(),
  tracking: z.string().max(64).optional() /* exact tracking_ref, orders_tracking_idx */, carrierLabel: z.string().max(60).optional(),
  agentLabel: z.string().max(60).optional() /* confirmed_by_label, OD54 */, partial: z.boolean().optional() /* R2: collected_cents < total */,
  sort: z.enum(["created_desc", "due_asc", "priority_desc", "total_desc"]).default("created_desc"),
});
export function listOrders(ctx: StoreCtx, query: OrderQuery, page: { after?: string; limit?: number /* ≤ 100 */ }): Promise<{ items: OrderListRow[]; next: string | null; total?: number }>;
```

- Filters live in the URL (`useQueryState`, `src/components/admin/orders/orders-view.tsx:56`), so a view is a
  shareable link. Keyset paging on the sort key + id; `total` is computed only for the first page of views with fewer
  than 10,000 matches (else "10,000+").
- Agents: the agent predicate (OD12) is added server-side whatever the query says.
- Saved views (`saved_views`, surface `orders`): personal (any member) or shared (`orders.assign` holders); name ≤ 60;
  reorder by drag; shown as tabs after the built-ins.

### OPE-§12.3 Columns by role

| Column | owner / admin | manager | agent | viewer |
|---|---|---|---|---|
| Order (mono id, TEST chip) · Created (relative, exact on hover, store tz) | ✓ | ✓ | ✓ | — (no orders.read) |
| Customer (first name, masked phone, city) | ✓ | ✓ | ✓ | |
| Product · offer · total (tabular) | ✓ | ✓ | ✓ | |
| Confirmation chip · Shipping chip | ✓ | ✓ | ✓ | |
| Money chip | ✓ | — | — | |
| Agent (avatar + name; **rev 3:** a sheet label as a plain-text chip "Samira (sheet)" when `confirmed_by` is NULL and `confirmed_by_label` is set, OD54) · Attempts / due | ✓ | ✓ | — | |
| Risk chip | ✓ | ✓ | ✓ | |
| Sheet chip · Source · UTM campaign | ✓ | ✓ (sheet only) | — | |
| Ship from (hold, OD49) · Tracking / carrier (OD55) · Return reason (OD50) (rev 3; shown in the views that filter on them) | ✓ | ✓ | ✓ (hold and tracking only) | |

Comfortable rows 40 px, compact 32 px for agents and managers by default (core §I.6 density); two lines max per cell.

### OPE-§12.4 Bulk actions

```ts
export function bulkAssign(ctx: StoreCtx, ids: string[], userId: string | null): Promise<ActionResult<BulkResult>>;      // orders.assign
export function bulkMove(ctx: StoreCtx, ids: string[], target: { legacy: OrderStatus } | { want: Partial<OrderStates>; reason?: string }): Promise<ActionResult<BulkResult & { undo: string }>>;
export function bulkPin(ctx: StoreCtx, ids: string[], pinned: boolean): Promise<ActionResult<BulkResult>>;               // orders.assign
export interface BulkResult { ok: string[]; failed: { id: string; error: TransitionError | "not_found" }[] }
```

- ≤ 200 ids per call (the selection bar says "Select up to 200"); each id goes through `transitionOrder` with
  `source: "bulk"`; partial success is normal and reported ("38 moved · 2 skipped: already shipped"); the call is
  optimistic in the list (rows re-chip at once) and rolls back the failed ids with the reason in a toast (core §I.8
  rule 1).
- Bucket `s:<sid>:bulk:<uid>` 30 per 10 minutes (core §E.8). Each bulk call carries the client's `idem`; a replay within
  10 minutes returns the stored `BulkResult` (OD36's cache).
- Selection bar (bottom, sticky, slides in 180 ms): Assign to…, Move to…, Pin, Export selection (`orders.export`),
  Print slips; "Clear".

### OPE-§12.5 Undo (status moves within 10 seconds)

`bulkMove` and single "Move to…" return an undo token (`scopedCache("ops-undo")`, 15 s): `{ orderId, revAfter,
before: OrderStates }[]`. `undoMove(ctx, token)` reverses only the orders whose `rev` still equals `revAfter`
(nothing happened since), as a compensating write attributed to the same actor: `state_changed` events with
`meta.undo = true` and one `undo` event; it never needs `orders.force_status` because it only restores the exact
previous states inside the window. The toast shows "Undo" for 10 s.

### OPE-§12.6 "Move to…" (legacy-compatible menu)

The existing status menu (`src/components/admin/orders/status-menu.tsx`) becomes "Move to…": the legacy labels
people know from the sheet (plus the new ones), each mapped by `legacyToWanted` (§3.4) to axis moves, filtered by
`legalMoves(cur, perms)`; impossible ones are hidden, forceable ones (managers with `orders.force_status`) appear
under "Force…" with a reason field. `moveToLegacy(ctx, id, label, expectRev)`.

### OPE-§12.7 Order drawer (redesign of `src/components/admin/orders/order-drawer.tsx`)

Full-height sheet on phones, 520 px side drawer from 1024 px; deep link `?order=<id>` kept (`orders-view.tsx:57-68`).

| Block | Content | Who |
|---|---|---|
| Header | id (mono), created (store tz), source, TEST chip, three axis chips, "Move to…" | all with `orders.read` |
| Actions | claim holder: Call, WhatsApp (template menu), outcome grid; others: "Take this order" (claims it when callable), Assign (managers), Pin | per permission |
| Customer | first name + masked phone + **Show number**, history line, blocked badge, possible duplicates with Mark / Keep both | all; reveal per §8 |
| Order | `OrderContents` (existing), Edit (opens the manual-order sheet in edit mode), adjustment line | edit per §11.3 |
| Delivery | city (with "Did you mean…"), address, landmark, ETA line from zones (P3), **rev 3:** tracking + carrier (R1: `tracking_ref` / `carrier_label`, typed or from the Sheet, `shipments.write` to edit; R2: the shipment with its events), the hold ("Ship from 05 Nov" with Change / Remove, `orders.write`), delivery attempts and the last carrier status (OD48), "Recall requested" (OPS-21), the "Tell the carrier" chip after an in-transit edit; R2: "Partial delivery…" (`shipments.write`: per-line delivered / refused / pending + the amount collected, OD51) | all; edits per permission |
| Money (rev 3, R1) | the money chip with its settlement ("Cash in hand" for `at_delivery`, "Held by carrier since 12 d" for `statement`, OD52); "Mark cash received" (`finance.write`); R2: `collected_cents` vs total, the statement line, **Refund…** (`finance.write`: amount ≤ collected, method, reason → money `refunded`, OD59) | owner, admin (R2 accountant) |
| Risk | level chip + top 3 reasons + positive line | all |
| Script | the compiled script (collapsible), language tabs | claim holder, managers |
| Google Sheets | sync chip, last error (`explain()`), Resend (kept from `order-drawer.tsx:205-216`) | owner, admin, manager |
| Ad events | per pixel: "Purchase sent ✓", "waiting for confirmation", "skipped: test order", "skipped: risk 74", "dropped: older than 7 days", "failed: token refused" | owner, admin |
| Money (R2) | cost snapshot, carrier fee estimate vs statement, commission entries | owner, admin, accountant |
| Timeline + notes | OPE-§4.2 | all with `orders.read` |

States: skeleton mirroring the blocks; `not_found` ("This order isn't available", same copy for other stores' ids);
conflict refresh ("Updated by Karim just now"); read-only store or impersonation: actions hidden, a one-line reason.

### OPE-§12.8 Print and export

- **Order slips (R1)**: `/app/<h>/orders/print?ids=…` (≤ 200, `orders.read` + `shipments.write` [Q.3]): one block per
  order (id, date, items to pack with options and codes from the warehouse text, qty, city, masked phone, customer
  note, landmark, **rev 3:** "Ship from {date}" when held (OD49), tracking and carrier when set (OD55)), print CSS (A4
  2-up or 80 mm thermal, chosen in the page), no full phone. Browser "Print / Save as PDF" (OD28). Held orders are
  listed last with a divider, so a warehouse printing "To pack" does not pack them by mistake.
- **CSV**: `ordersCsv` (`src/lib/orders/admin.ts:377`) scoped by store, header unchanged and **appended** with:
  `Confirmation`, `Shipping state`, `Money`, `Agent`, `Attempts`, `Cancel reason`, `Landmark`, `Adjustment`,
  `Confirmed at`, `Delivered at`, `Test`, **rev 3:** `Ship after`, `Return reason`, `Tracking`, `Carrier`, `Agent
  (sheet)`, `Delivery attempts`; R2: `Collected`, `Refund`. Route `/api/app/<h>/orders/export` (`orders.export`,
  sensitive; owner, admin and manager, core §A.3.2 rev 3), **fresh step-up** (rev 4, OD64: `step_up` → the step-up sheet,
  TOTP or password, then the download), `audit("orders.exported", { count, filters })`. Agents never get the button or
  the route.
- **Carrier CSV (rev 3, R1, OD55, OPS-9)**: Export selection → **Carrier file** (`shipments.write`, sensitive: full
  phones; refused to impersonation; **fresh step-up, rev 4 OD64**, the same check as the orders CSV). First use opens
  the column picker: the fixed source list of the `manifest`
  mapping kind (OPE-§18.3: `order_id`, `name`, `phone`, `city`, `address`, `landmark`, `cod_amount`, `content`, `qty`,
  `note`, `constant`), each with the header name the owner's carrier portal expects, in the owner's order, plus the
  delimiter (`;` default: Excel in French locale opens it in columns) and "Mark exported orders as packed" (default on:
  an L move `to_pack → packed`, source `bulk`, per order). The list is saved in `ops.carrierCsv` (no presets ship: core
  D38; the picker is the whole mapping UI, there is nothing to auto-detect because the store writes the file). Route
  `GET /api/app/<h>/orders/carrier-csv?ids=…` (≤ 200; UTF-8 BOM; `cod_amount` in the store currency with the locale's
  decimal separator; phones national digits without spaces; held orders (`ship_after > now`) are refused with their ids
  listed, OD49): per order `manifest_exported` (meta `why: "manifest"`, counted by the reveal alarm in R2) and one
  `audit("orders.carrier_exported", { count })`. In R2 the same route accepts `format=xlsx` (OPS-27) and the saved
  column list is offered as the first `manifest` mapping of the first carrier account, so nothing is typed twice.

---

## OPE-§13. Agent console (`/app/<h>/queue`; OP-03, OP-04, OP-05, OP-07, OP-17; SF-07)

The console is one product (SF-07): a call-center agent opens it on a phone at 09:30 and closes it at 21:00 having
pressed Next a few hundred times. Every rule below serves that day: nothing waits for a page render, nothing is typed
twice, nothing is lost when the network drops in a stairwell, and nothing on the screen is a number the agent cannot
trust. It is built screen 4 of the R1 order (core §I.8) and is the acceptance path of the wow demo (RF §4, 2:15-2:50).

### OPE-§13.1 Layout

- **Phone (360-767 px)**: one card per order, full height. Top bar: presence switch (Online / Break / Offline as a
  segmented control with text, never a lone dot), today's counters (confirmed, attempts), "My callbacks (3)". Card:
  product and offer (16 px semibold), total (24 px tabular), units text, city + address + landmark, customer first
  name + masked phone, history line, risk chip, duplicate chip, TEST chip. Then **Call** and **WhatsApp** as two
  large buttons (48 px), the script accordion, and the **outcome grid 2 × 3** pinned to the bottom within the thumb
  zone: Confirmed · No answer · Busy / off · Call back… · Cancel… · More… (fake, wrong number, duplicate). Targets
  ≥ 44 px (RF §2.1 rule 6). **rev 3 (OD48):** a delivery-lane card shows a "Delivery problem · attempt 2 · Amana:
  client injoignable" strip under the total and the grid Customer informed · Reschedule… · No answer · Busy · Cancel &
  recall… · Skip (OPE-§6.1a); the two grids share the geometry, colours and keys, so an agent switches lanes without
  learning a second screen. **rev 3 (OD53):** the top bar gains the inbound phone field (OPE-§5.7).
- **Desktop (≥ 1024 px)**: three columns: left (my callbacks due, queue counts, presence), centre (order card, script
  open by default, outcome row with key hints), right (customer history, timeline, note composer).
- **Tablet (768-1023 px)**: centre + right columns; the left column becomes a top strip.
- **Thumb geometry (phone, 390 × 844 reference)**: the outcome grid occupies the bottom 30 % of the viewport (its top
  edge ≥ 590 px from the top), six cells of ≥ 44 × 44 px with 8 px gaps, Confirmed and No answer in the bottom row
  (the two most frequent taps, nearest the thumb); Call and WhatsApp sit directly above the grid (48 px high, full
  width split 50/50); the script accordion scrolls inside the card, never the page; the top bar is 48 px and never
  frosted (one glass surface per screen is the shell's, core §I.6). The e2e run measures these boxes (OPE-§O.3).
- **One card, one order**: the console never shows a list of claimable orders to an agent (no cherry-picking; OD7);
  "My callbacks" lists only the agent's own callbacks, each with "Call now" (a claim of that id).

### OPE-§13.2 Flow and latency

1. **Next** (`N`) → `POST /ops/next` (OD36) → card. Server ≤ 300 ms p75; skeleton after 150 ms, kept ≥ 300 ms (RF
   §2.1 rule 1).
2. **Call** (`C`) → `POST /ops/reveal` (`why "call"`) → opens `tel:`; **WhatsApp** (`W`) → `POST /ops/reveal`
   (`why "whatsapp"`, template `confirm`) → opens `wa.me` in a new tab. The revealed number lives in component state
   only (OPE-§8.2).
3. Returning to the tab (`visibilitychange`, or the `pageshow` event after the dialer) focuses the outcome grid and
   announces "How did the call go?" (`aria-live="polite"`); the elapsed time since the reveal shows under the line
   ("Call started 2 min ago") so the agent never wonders whether the tap registered.
4. An outcome → `POST /ops/outcome` with `andNext: true` (default on the queue): the next card comes back in the same
   response; the pressed cell shows a pending state at once (≤ 500 ms budget), the card slides out and the next slides
   in (240 ms ease-out, core §I.6); on failure the grid comes back with the reason.
5. `conflict` (409) → the card refreshes with "Updated by Karim just now" and the grid again; a lost lease (no heartbeat
   and no action for `leaseMinutes`, 15 min by default, OD60) → "This order went back to the queue" + Next (the next
   claim may hand the same order back when it is still the best one, with `resumed: false`).
6. **Skip** (`X` on desktop, a small text button under the grid on phones) releases the order for 10 minutes to the agent
   (OPE-§5.2); skips count on the board ("3 skipped today") so a pattern is visible, never hidden.

**Latency budgets** (p75; server = handler time on the local production build with 200 open orders and 10 online
agents; end to end = Playwright on a 390 px viewport with 4G throttling, RF §4 setting):

| Action | Server | End to end (4G) | Payload down (gz) | Statements |
|---|---|---|---|---|
| Next | ≤ 300 ms | ≤ 1.2 s | ≤ 6 KB | 1 claim `UPDATE` + ≤ 4 reads + ≤ 2 event inserts |
| Outcome + next | ≤ 500 ms | ≤ 1.5 s | ≤ 6 KB | 1 transaction (1 `UPDATE`, ≤ 3 events, `inTx` hooks) + the claim |
| Reveal | ≤ 200 ms | ≤ 0.8 s | ≤ 1 KB | 1 read, 1 event insert, 1 bucket |
| Presence / heartbeat | ≤ 100 ms | ≤ 0.6 s | ≤ 0.3 KB | ≤ 1 write per 60 s |
| Note | ≤ 200 ms | ≤ 0.8 s | ≤ 0.5 KB | 1 insert |
| Queue header counters | — | one pulse (≤ 15 s) | 304 when unchanged | pulse contributors ≤ 50 ms each |

The budgets are asserted in `qa:wow-demo` (claim ≤ 300 ms, each agent action ≤ 500 ms, core §J.3) and in OPE-§O.3; a
regression above a budget fails the e2e run, not a review.

### OPE-§13.2a A day in the queue (the rhythm the screen supports)

| Moment | What the agent does | What the system does |
|---|---|---|
| Start | opens `/app/<h>/queue` (an agent's landing path, core §B.4), presses **N** (or taps Online first) | the first `N` sets presence `online` (OD60), heartbeat every 60 s while the tab is visible (it also renews the lease of a held order); the pulse's shared poller starts; "Calls open at 09:30" if early |
| Inbound (rev 3) | the phone rings; types the last 8+ digits in the top field | `inboundLookup` → the caller's open orders; Take / Confirm / Edit address / Cancel… on the row; the action is attributed to this agent with `inbound: true` (OPE-§5.7) |
| Rescue (rev 3) | `N` hands out a delivery problem | the card says "Delivery problem · attempt 2"; the agent calls, taps Customer informed or Reschedule… (date) or Cancel & recall…; the warehouse view updates (OPE-§6.1a) |
| Loop (×200) | `N` → reads the card → `C` → talks → taps an outcome | one claim, one reveal, one outcome + claim; lease renewed by each action; `first_touch_at` set on the first attempt; the ladder sets `due_at` |
| Callback | taps "Call back…" → picks "This evening 18:30" | `confirm_state = callback`, `due_at`, `lease_until = due_at + grace`, owner = this agent; at 18:30 the order reaches this agent first (claim `ORDER BY`) and the pulse's `dueCallbacks` ticks up |
| Break | taps **Break** | the active claim is released (`released`, why `break`); Next answers `on_break` |
| Network drop | taps an outcome in a stairwell | the outbox of OD37 holds the outcome and retries with the same `Idempotency-Key` for 30 s; "Saving…" then "Saved"; the lease (15 min, renewed by the heartbeat, OD60) covers the gap |
| Manager intervenes | — | an `assignOrders` or `releaseOrder` by a manager makes the agent's card answer `conflict` on the next action, with the manager's name |
| Cap | reaches `daily_cap` | Next answers `cap_reached`; the screen shows the day's counters and the manager's cap |
| End | taps **Offline** (or is silent 15 min) | `released` if a claim is open; the end-of-day line "Today: 23 decided · 15 confirmed · 2 callbacks for tomorrow" from `agent_stats_daily` live figures (`ops.me.endOfDay`) |

### OPE-§13.2b Offline resilience and idempotency (OD36, OD37)

- Every hot-path request carries `Idempotency-Key` = a UUID minted when the control is rendered (not when tapped), so a
  double tap sends the same key twice and the second answer is the stored first one.
- A request that fails with a network error (no response) is retried from the one-entry outbox at 0.5 s, 1 s, 2 s, 4 s,
  8 s, 15 s (≤ 30 s total); a 4xx/5xx with a response is **not** retried (the server answered); the pending entry is
  mirrored in `sessionStorage` (`sg:ops:pending:<storeId>:<userId>`, cleared on store switch and sign-out, core §B.4)
  so a tab reload during the retry window resumes it; the entry holds `{ orderId, rev, outcome, idem, at }` and never a
  phone, a name or a note text (notes wait for connectivity and are typed again if lost, with the draft kept in the
  textarea).
- While a retry is pending the grid is disabled with "Saving…"; after 30 s it re-enables with "Could not save, tap to
  retry" and the same key, so an agent who walks back into coverage finishes the call with one tap.
- The console never records an outcome the agent did not tap (no "assume no answer after N minutes"): an abandoned
  card simply expires and the next claimer's claim attributes it (OD46).

### OPE-§13.2c Accessibility (phone and desktop)

Focus order: presence → card → Call → WhatsApp → script → grid; the grid is a `role="group"` with the six buttons
`aria-keyshortcuts="1".."6"`; the "How did the call go?" line is `aria-live="polite"`; the TEST, risk and duplicate
chips carry text, never colour alone (core §I.8 rule 8: no decorative status dots); contrast AA on every button
(rubric §4.5 button contrast check); `prefers-reduced-motion` keeps opacity only; the whole console works with a
screen reader in ar and fr (the e2e run passes `axe` with 0 serious violations on the queue at 390 and 1440).

### OPE-§13.3 Keyboard (desktop; OP-17 raised to R1)

| Key | Action | Key | Action |
|---|---|---|---|
| `N` | Next / resume my order | `4` | Call back… (time picker) |
| `C` | Call (reveal + `tel:`) | `5` | Cancel… (reason picker, `1`-`9` inside) |
| `W` | WhatsApp with the confirmation template | `6` | More… (fake, wrong number, duplicate) |
| `1` | Confirmed | `E` | Edit order |
| `2` | No answer | `S` | Show / hide script |
| `3` | Busy / switched off | `T` | Add a note |
| `Esc` | Close the open sheet | `?` | Shortcut sheet |
| `X` | Skip (release for 10 min) | `G Q` / `G O` | shell chords: queue, orders (core §I.3) |
| `I` (rev 3) | Inbound: focus the phone field (OPE-§5.7) | `D` (rev 3) | Deliver from… (the hold date picker, before `1`) |

In the delivery lane (rev 3) `1`-`6` map to Customer informed · Reschedule… · No answer · Busy · Cancel & recall… ·
Skip in that order (OPE-§6.1a); the `?` sheet shows the map of the lane on screen.

Shortcuts never fire inside editable fields or while an overlay is open (`isEditable` / `overlayOpen` rules of
`src/components/builder/shortcuts.ts:16-25`, reused); the queue's single-key map is registered through the shell's
command registry (`src/components/admin/shell/commands/ops.ts`, core §I.3) so `?` lists it next to the chords and no
two keys collide (`test:ops` asserts the queue map and the shell chords are disjoint). Keys are letters and digits only;
on an Arabic keyboard layout the physical key is matched by `event.code` (`KeyN`, `Digit1` …), not by the character.

### OPE-§13.4 States

| State | Screen |
|---|---|
| Offline / on break | large presence switch, "You're on a break" / "You're offline", today's counters |
| Outside the calling window | "Calls open at 14:30" with a countdown, "My callbacks today" list, managers see "Open calls now" |
| Empty | quiet surface with a skeleton of the card and "Nothing to call right now. New orders appear here the second they arrive." + next due time |
| Daily cap reached | "You reached today's limit of 80 orders" (the cap set by the manager) |
| Claim lost | the order went back to the queue; Next |
| Store read-only / impersonation | banner with the reason; outcome buttons hidden |
| Saving (rev 2, OD37) | the pressed cell pending, grid disabled, "Saving…"; after 30 s offline: "Could not save, tap to retry" with the same key |
| Conflict (rev 2) | the fresh card with "Updated by {name} just now" and the grid again; the agent's own pending outcome is discarded, never applied blindly |
| Store restricted | "Store restricted: no new orders arrive" over the card; the open order can still be finished |
| Error | inline retry, the card stays; nothing is lost |
| Delivery problem (rev 3) | the card with the delivery strip and the rescue grid; "Rescue calls left: 2" |
| Inbound (rev 3) | the top field open with the caller's orders as rows; "No order for this number" when none (same timing as a match) |
| Lookups paused (rev 3) | "Too many lookups this hour. Ask your manager." after the 60th inbound lookup (OPE-§5.7) |

### OPE-§13.5 Languages and RTL

The whole console ships in ar, fr and en (OD34) from the agent's account locale; `dir="rtl"` for ar with logical
properties only (`test:admin-rtl`, core §I.5); phone numbers, ids, amounts, times and ranges in `<bdi dir="ltr">`
(DB RTL1, RTL5: "18:30-19:00" never reverses, addresses typed in Latin stay an ltr inline block); the outcome grid
mirrors; Latin digits by default with the per-user toggle; `font-variant-numeric: tabular-nums lining-nums` on every
count, price and phone (DB T1); Latin product names inside Arabic text wrapped in `<bdi>` with `unicode-bidi: isolate`
on chips (DB T7); no uppercase, letter-spacing or italic in `[lang=ar]`, Arabic UI text 6-10 % larger than the Latin
size at the same slot (DB RTL7); IBM Plex Sans Arabic as the Arabic face (core §I.6). Message keys are ICU-lite with
`Intl.PluralRules`, so "3 commandes" / "3 طلبات" / "طلبان" pluralise correctly (DB RTL2 applies to counters here too).

### OPE-§13.6 Design rules

One accent (jade), no orange anywhere (tokens checked by `scripts/qa/admin-tokens-check.ts`), outcome colours from the
semantic tokens (success for Confirmed, destructive outline for Cancel and Fake, neutral for the rest, info [Q.16] for
Call back), motion ease-out 120 / 180 / 240 ms, rows rising 6 px with fade on load, no bounce, no pulsing dots
(`prefers-reduced-motion`: opacity only). Empty and error states follow RF §2.4 (a skeleton of the real UI, one
sentence, one action).

---

## OPE-§14. Manager board, agent management and KPIs (OP-10, OP-11, OP-25)

### OPE-§14.1 Board (`/app/<h>/queue/board`; `orders.read_all` + `orders.assign`)

- Tiles (real data only, each with its definition on hover): **To call now** (callable new + attempting due),
  **Callbacks due** (count, oldest overdue in minutes, owner), **Waiting for retry** (attempting with a future
  `due_at`, next due time), **First touch** (orders older than `firstTouchTargetMin` window-minutes without an
  attempt; count, red above 0), **Confirmed today**, **Decided today** with the confirmation rate and n, **Abandoned
  today** (claims released by `lease_expired`, OD46; with the agent names on hover), **rev 3:** **Delivery problems**
  (orders in the delivery lane now, oldest attempt age; OD48), **To ship** (confirmed in `to_pack` / `packed`, holds
  excluded, with "oldest 3 d" in days of window time; OPS-29) and **On hold** (count, next hold date; OD49); the
  **Lookups** figure of the hour (inbound lookups by agent, OPE-§5.7) sits in the agents table. Placed, confirmed and
  delivered never share a tile (OD38). The tile values come from `queueCounts(scope)` (OPE-§27.1), one query per tile
  group.
- **Sheet agents (rev 3, OD54):** when the store has orders with `confirmed_by_label` and no mapped member in the last
  28 days, a second table "Agents named in your sheet" lists the labels with decided / confirmed counts and the
  confirmation rate (n ≥ 20) computed live from `orders` (`orders_confirmer_idx` is unusable here, so the query is the
  28-day `orders_store_created_idx` range grouped by label, cached 60 s), each row with **Map to a member…** (writes
  `ops.agentLabels`, audited `callcenter.label_mapped` with `{ label, count }` (core §F.5, rev 4 name), then the
  backfill of OPE-§19.6 runs in `after()` and
  `ops.rollup` recomputes the 14 days). Mapped labels disappear from this table and appear in the agents table.
- **Best hours to call (your data)** (OD44): a 24-cell strip of the store day (window hours only) coloured by contact
  rate (jade scale, graphite below n), each cell "18h: 62 % · n = 84"; a cell with fewer than 30 attempts in the
  trailing 90 days is shown grey with "needs 30"; the strip reads `attemptStats(scope)` (OPE-§27.6). No cell, no
  recommendation; the strip is advisory and the ladder never moves on it before AI-23 (R3).
- Agents table: name, presence (text + icon), current order (id, since), today decided / confirmed / attempts /
  reveals / abandoned / skipped, first-touch p50 today (window minutes), daily cap use; row actions Assign orders,
  Release current order, Lift reveal pause (R2). Rates in the table follow the minimum-n rule (OD17).
- Refresh: `/api/app/<h>/ops/state?view=board` every 15 s while visible (OD33), ETag; "Updated 12 s ago" label,
  honest when stale; the board also listens to the shared pulse for `counts.*` between its own polls.
- R3 (OP-25): full board (per-agent live timeline), quality review list ("orders this agent confirmed that came back
  refused, last 28 days" with the agent's notes), payout batches entry point.

### OPE-§14.2 Agents (`/app/<h>/team/agents`; `members.read`, edits `callcenter.configure`)

- List of members holding `agents.self`: name, role, presence, daily cap, weight, languages (R2), commission rules
  (R2), KPIs over 7 and 28 days with n; **rev 3:** the sheet labels mapped to each member (OD54, editable chips) and
  the header line "Agents: 2 of 10" counting members with role `agent` only (the `agents` gauge, OPE-§2.4, OPS-23;
  owners and managers who take calls are listed with the role chip and never count).
- Profile sheet: daily cap (empty = none), weight (1-5), languages and skills (R2), commission rules (R2).
- Agent page `/app/<h>/team/agents/<userId>`: daily KPI trend (≥ 7 points or a table), outcome mix, cancel-reason
  mix, first-touch distribution, recent orders (masked), R2 earnings statement. An agent opens only their own page
  (`/app/<h>/queue/me`, `agents.self`).
- An accepted agent invite lands on `/app/<h>/queue` (OD32, request [Q.13]).

### OPE-§14.3 KPI definitions (`src/lib/callcenter/kpis.ts`)

Windows: today (store-local day), 7 days, 28 days. Test and honeypot orders are excluded everywhere.

| KPI | Formula | Attribution | Minimum n |
|---|---|---|---|
| Decided | count of confirm moves to {confirmed, cancelled, unreachable, fake, duplicate} | the actor of the move | — |
| Confirmation rate | confirmed ÷ (confirmed + cancelled + unreachable) | actor of the decisive move | 20 per agent, 30 per store |
| Delivery rate (agent) | delivered ÷ (delivered + refused + returned + lost), orders with `confirmed_by = agent`, final in the window | `confirmed_by` | 20 |
| Net delivered rate (store) | delivered ÷ placed, by placed-day cohort, cohorts ≥ 14 days old only | store | 30 |
| First-touch time | median and p90 of window minutes between `created_at` and `first_touch_at` | the agent of the first attempt | 20 |
| Attempts per confirmation | attempts ÷ confirmed | actor | 20 confirmed |
| Handling time | median of (outcome event − claim event) per claim | claim holder | 20 |
| Cancel-reason mix | share per reason code | actor | 20 cancellations |
| Upsell rate (R2) | confirmed orders with an in-call upsell line ÷ confirmed; extra revenue Σ | actor | 20 |
| Calls per online hour (R2) | attempts ÷ online hours (`online_ms`) | agent | 2 hours online |
| Abandoned claims (rev 2, OD46) | `released` with `why = lease_expired` ÷ `claimed` | the previous holder | 20 claims |
| Skips (rev 2) | `released` with `why = skip` ÷ `claimed` | claim holder | 20 claims |
| Contact rate by hour (rev 2, OD44; store, not agent) | attempts with an outcome ∉ {no_answer, busy, switched_off} ÷ attempts, per store-day hour, trailing 90 days | store | 30 attempts per hour cell |
| Rescue rate (rev 3, OD48) | delivery-lane orders with a `customer_informed` or `reschedule` outcome that ended `delivered` ÷ such orders that are final | the agent of the rescue call | 20 |
| Inbound share (rev 3, OD53) | decisions with `inbound: true` ÷ decisions | actor | 20 |
| Return reason mix (rev 3, OD50; store and agent) | share per `return_reason` over orders final in the window (agent: `confirmed_by`) | `confirmed_by` | 20 finals |

**Attribution through the Sheet (rev 3, OD54):** a decision applied by the pull with a mapped "Agent" label counts
for the mapped member exactly like a queue decision (`confirmed_by` is written); an unmapped label is counted under
the label in the board's "Agents named in your sheet" table and nowhere else (never in `agent_stats_daily`, whose
`user_id` is a member id). The Sheets screen states which figures need the queue: first touch, handling time,
attempts per confirmation, abandoned claims, skips and the contact-rate strip (they are built from queue events a
sheet cannot produce); confirmation rate, delivery rate and the cancel / return reason mixes work from the sheet once
labels are mapped.

Below the minimum the UI shows the count and "needs 20" instead of a rate (OD17). Rates use integer arithmetic for
counts and one decimal for display. Every KPI function in `src/lib/callcenter/kpis.ts` returns `{ value, n, min } |
{ n, min, insufficient: true }`, never a bare number, so a screen cannot render a rate without its `n` (`test:ops`
checks the return type of every exported KPI function through the TypeScript API).

### OPE-§14.4 Rollup (`ops.rollup`, nightly) and live figures

- For each store (cursor, `rollups` slot of core §H.2): recompute `agent_stats_daily` for the last 14 store-local days
  (late delivered and refused outcomes land on the confirming agent's row of the day they happen; recompute keeps
  the table equal to a recompute from events) with one grouped query over `order_events` (`oe_actor_idx`,
  `oe_type_idx`) and one over `orders` (`orders_confirmer_idx`), upsert per (store, user, day).
- Today's figures are computed live from `order_events` (60 s `scopedCache("ops-kpis")` per store).
- Acceptance: on the fixture store, the nightly rows equal a full recompute; deleting a day's rows and rerunning
  restores them byte for byte.

### OPE-§14.5 Leaderboard (OP-25, R3)

`ops.leaderboard`: `off` (default), `managers`, `everyone`. Board ranks agents by delivered orders (not confirmed),
then delivery rate with n; earnings are never shown to other agents. Quality review samples refused orders per agent
for the manager.

---

## OPE-§15. Commissions, earnings ledger and payouts (OP-15, R2, S3; R-D20)

### OPE-§15.1 Principle

Default = an amount **per delivered order**, accrued as `pending` when the agent confirms, `earned` when the parcel
is delivered, `void` when it is refused, returned, lost or cancelled. A paid entry is never changed: reversals after
payment are new negative `clawback` entries (OD27). The ledger is re-derivable from `order_events` (test).

### OPE-§15.2 Rules (`commission_rules`, `src/lib/finance/commissions.ts`)

| `kind` | Amount | `params` | Effect |
|---|---|---|---|
| `per_delivered` | `amount_cents` | `{ default?: boolean }` | accrual `pending` at confirmation → `earned` at delivered → `void` on a failed final or a cancellation |
| `per_confirmed` | `amount_cents` | `{ clawbackOn: ("fake" \| "cancelled" \| "refused" \| "returned")[] = ["fake"], default?: boolean }` | accrual `earned` at confirmation; `clawback` when the order later ends in a listed state |
| `percent_upsell` | `percent_bp` | `{}` | `earned` at delivered on the upsell line value the agent added in-call |
| `tier_bonus` | `amount_cents` per delivered or fixed | `{ metric: "delivery_rate" \| "delivered", threshold: number /* bp or count */, minFinal: number /* default 30 */, mode: "per_delivered" \| "fixed" }` | computed at period close on the agent's month |
| `fixed` | `amount_cents` per month | `{}` | one `fixed` entry per active month |

An agent's rules = `agent_profiles.commission_rule_ids`, else every active rule with `params.default`. Rule edits apply
to future accruals only (existing entries keep their amounts). Permission `commissions.manage`; entitlement
`commissions`.

### OPE-§15.3 Ledger transitions (hook `money.commissions`, `inTx`)

| Order event | Entries |
|---|---|
| confirm → `confirmed` with `confirmed_by = A` (user) | `per_delivered`: insert `(ref = orderId, entry = accrual, state = pending)`; `per_confirmed`: insert `(accrual, earned, period = this month)` |
| ship → `delivered` | `per_delivered` pending → `earned` (period = delivery month); `percent_upsell` → insert `earned` |
| ship → `refused` / `returned` / `lost`, or confirm → `cancelled` / `fake` / `duplicate` after confirmation | `per_delivered` pending → `void`; `per_confirmed` → `clawback` (−amount, `earned`) when the state is in `clawbackOn` |
| `delivered` → `returned` (later return) | `per_delivered` earned or paid → `clawback` (−amount, earned, current period) |
| money → `refunded` (rev 3, OD59) with no return recorded | `per_delivered` earned or paid → `clawback` once per order (the customer got the cash back, the sale did not hold); a later `delivered → returned` on the same order writes no second clawback (`ae_uq`) |
| a forced revert of any of the above | the symmetric entry (re-accrual or clawback), never an update of a paid row |
| confirmation applied by the Sheets pull with a **mapped** "Agent" label (rev 3, OD54) | exactly as `confirmed_by = A` (the pull writes `confirmed_by` from `ops.agentLabels`); an unmapped label accrues nothing until mapped, then the backfill of OPE-§19.6 re-runs the hook for the backfilled orders (`INSERT IGNORE` keeps it idempotent) |
| test order, honeypot, manual order without `confirmed_by`, unmapped sheet label | nothing |

Uniqueness `ae_uq (store_id, ref, rule_id, user_id, entry)` makes every insert idempotent (`INSERT IGNORE`); state
moves are `UPDATE … WHERE state = <expected>`.

### OPE-§15.4 Period close and payouts

- Job `money.close_period` (daily check, runs for a store on its first local day of the month): `tier_bonus` and
  `fixed` entries for the closed month (`ref = period:<YYYY-MM>`), idempotent.
- `createPayoutDrafts(ctx, { periodTo })` (`payouts.approve`): one `draft` per agent with every `earned` unpaid entry up
  to `periodTo`; a negative total is not drafted (carried forward, shown as "balance −120 MAD").
- `approvePayout(ctx, id)` (`payouts.approve`, sensitive, audited) → `approved`; `markPayoutPaid(ctx, id, { method,
  ref, paidAt })` → `paid`, entries `paid`, `payout_id` set; `cancelPayout` releases the entries.
- Commissions reach finance per order (`finance_daily.commission_cents` = Σ non-void entries of the order) and as
  `fixed` / bonus entries on the period's `total` row, never as `expenses` rows (OD27).

### OPE-§15.5 Agent statement (`/app/<h>/queue/me`, `agents.self`)

Live: "Today: 23 confirmed · 140 MAD pending · 310 MAD earned this week" (amounts in the store currency), this
period's earned / pending / void / paid / balance, the per-order list with states, and the line "Pending becomes
earned when the parcel is delivered." Agents see only their own lines; managers see every agent's statement
(`commissions.manage`).

Acceptance (OP-15): (1) a confirmed then delivered order yields exactly one earned entry; refused yields void; a
return after payment yields one clawback; (2) replaying every `order_events` row of a fixture store rebuilds the
ledger identically; (3) payouts never include pending or void entries; (4) amounts are integer cents end to end.

---

## OPE-§16. Accounting (AC-01 … AC-12; R-D26)

### OPE-§16.1 Principles

Integer cents; one currency per store (`stores.currency`); profit by **placed-day cohort**, cash by remittance date
(OD26); every figure that needs a missing input shows "Add your cost to see profit" (never a guess); estimates and
actuals are shown side by side; test and honeypot orders never count; "placed", "confirmed" and "delivered" are
different words and never share a tile (RF §2.1 rule 3).

### OPE-§16.2 Profit lite (R1, P4, flag `finance_lite`; SF-04, OD25)

Screen `/app/<h>/finance` (R1: tabs **Break-even**, **Costs**, **Ad spend**; `finance.read` / `finance.write` for
owner and admin [Q.3]):

- **Costs**: per live page, the page's items (from the published doc) with a unit cost field and optional
  per-option-code costs (`variant_key` = the option codes joined by "|"); the store packaging cost per order
  (`accounting.packagingCents`); "My carrier": a default delivery fee and return fee (`carrier_rates`, city `*`) and
  optional per-city rows. Every change inserts a `product_costs` / updates `carrier_rates` row with
  `effective_from = now` (history kept). **rev 3 (OPS-24):** a **Costs by SKU** list (`product_costs.sku` = the Offers
  v2 item `code`) sits first; an item whose code has a SKU cost is pre-filled from it ("from SKU ARG-250, 38.00") and
  a new page's items inherit matching SKU costs at publish, so one physical product sold on three campaign pages is
  typed once; `fin:costs_missing` fires per SKU without a cost, not per page. **rev 3 (OD52):** the "My carrier" block
  starts with the question **"Who holds the cash after delivery?"** — *I deliver myself / my courier hands me the cash*
  (`at_delivery`, default) or *A carrier pays me later on a statement* (`statement`) — written to
  `accounting.myCarrier` with `confirmedAt`; until confirmed the Store Health note `fin:settlement_check` (sev 1)
  shows after 20 delivered orders. **rev 3 (OPS-13):** the per-city rows show two columns side by side, **fee charged**
  (median `orders.shipping` of the city's delivered orders, 28 d) and **fee paid** (the rate row), so a landing page
  charging 30 for a city that costs 45 is visible; `fin:fee_gap` (OPE-§27.2) raises it. **rev 4 (core D75):** LP-16
  (per-city fees on landing pages) is now in the **R2 contract step**, not R3, and the two signals are split so a
  store never gets two alerts for one cause: landing's checklist warning `delivery:fee_mismatch` and the health rule
  `landing:fee_mismatch` (P3, core §I.7) compare **zone fee vs page fee** (what the shopper is told on two surfaces),
  while `fin:fee_gap` compares **fee charged vs fee paid** (the carrier rate: the margin leak) and never reads the zone
  fee; the `zones.feeMismatchTop5` input of the landing rule reads `opsAggregates(dims: ["city"])`, whose city keys are
  `CityKey` slugs (OPE-§27.6).
- **Ad spend**: a 14-day grid (day × Meta / TikTok / Snap / Google / Other) of editable amounts, saved per cell
  (`ad_spend_daily`, source `manual`); totals per day. **rev 3 (OD56, OPS-10):** each platform column carries its
  **account currency** (`accounting.adAccounts[platform].currency`, default the store currency, changed from the column
  header: "Billed in USD"); amounts are typed and stored in that currency (`ad_spend_daily.currency`); a foreign
  currency needs at least one **rate** (`accounting.adRates`: "1 USD = 9.85 MAD from 1 Oct", typed by the owner, dated,
  labelled "your rate, estimate"); the grid shows the converted total per day in small type under the typed amount and
  marks cells without a rate for their day "needs a rate" (excluded from CPA with a visible count "3 days not counted").
  The break-even card prints "Spend converted at your rate 1 USD = 9.85 MAD (from 1 Oct)" under the CPA. No rate is
  ever fetched or invented.
- **Break-even** per page (or for the store when several pages share the spend), trailing 28 days:

```
c = confirmed / (confirmed + cancelled + unreachable)          n_c = that denominator        (needs n_c ≥ 30)
d = delivered / (delivered + refused + returned + lost)        n_d = that denominator        (needs n_d ≥ 30, OD17)
margin_delivered = avg(total of delivered orders) − avg(COGS of their lines) − packaging − delivery_fee(city) − cod_fee
loss_failed      = delivery_fee(city) + return_fee(city) + packaging
E_placed         = c·d·margin_delivered − c·(1−d)·loss_failed          expected contribution per placed order, before ads
BE_CPA_placed    = E_placed            BE_CPA_delivered = E_placed / (c·d)
CPA_placed       = ad_spend_28d / placed_28d                   (store-level in R1: spend is not split per page; spend = Σ spendStoreCents over days with a rate, OD56)
interval         = E_placed at (c_low, d_low) and (c_high, d_high), Wilson 95% bounds of c and d
```

  The card reads "You can pay up to **42 MAD** per order placed (68 MAD per delivered order). Last 28 days you paid
  **35 MAD** per order placed." with the interval and the n behind each rate; with a missing input it lists what to
  add. Delivery outcomes come from status moves and the Sheets pull in R1 (label "as of last sync 14:05"). Under the
  card, **by angle** (SF-01): the orders, confirmation and delivery rates per `utm_content` angle id of the page's
  Campaign Kit from `opsAggregates(dims: ["angle"])` (counts and rates with n, cells under 5 orders suppressed; spend
  is not split per angle in R1, so no CPA per angle is shown: an honest table, not an estimate).
- **Alerts** (job `fin.alerts`, daily, P4): `cpa_over_breakeven` (CPA_placed > 1.1 × BE_CPA_placed on 2 consecutive
  days, ≥ 20 placed orders in those days), `refusal_spike` (7-day refusal rate > 28-day rate + 10 points, n ≥ 20
  finals in 7 days), `city_refusal` (a city's 28-day refusal rate > store rate + 15 points, n ≥ 20, with the
  suggestion "mark the city as not served or raise its fee" linking to the delivery zones; **rev 3 (OD50):** the
  evidence carries the city's `return_reason` mix, so the text can say "8 of 11 refusals: customer absent" when the
  reasons are coded and nothing when they are not). Hysteresis: an alert
  clears after 2 days without the condition; one notification per firing (`fin.profit_alert`), Telegram when
  `notifications.telegram.profitAlerts`.
- Acceptance: works with zero costs typed (prompts, no numbers); golden fixtures for E_placed, BE_CPA and the
  interval; an alert fires once and clears; cents parity with `src/lib/page/pricing.ts` for totals and fees.

### OPE-§16.3 Cost snapshot (AC-01, R2)

At ship → `shipped`, `orders.cost_snapshot` is written once (in the transition `inTx` hook `money.snapshot`):

```ts
export interface CostSnapshot { v: 1; at: string; currency: string;
  lines: { itemId: string; productId?: string; variantKey: string; qty: number; unitCostCents: number | null }[];
  packagingCents: number | null;
  carrier: { accountId: string /* '' = my carrier */; cityKey: CityKey | null; deliveryFeeCents: number | null; returnFeeCents: number | null; codFeeBp: number; codFeeMinCents: number | null; codFeeFlatCents: number; codFeeCents: number | null; settlement: "statement" | "at_delivery" };
}
```

Cost lookup = the most specific `product_costs` row (variant → item → **sku** → product default, rev 3 OPS-24) with
`effective_from ≤ at`. **COD fee base (rev 3, OPS-25):** `codFeeCents = max(codFeeMinCents ?? 0, round(collected ×
codFeeBp / 10000)) + codFeeFlatCents`, where `collected` is the order total in cents at snapshot time and is
**recomputed at `delivered`** from `collected_cents` (OD51) when it differs (the snapshot keeps the estimate; the
`delivered` move writes `codFeeCents` into the event meta and finance uses the delivered value). The carrier rates
editor shows the base in words: "{bp/100} % of the amount collected, minimum {min}, plus {flat} per parcel".
Later cost edits never change a snapshot; an explicit "Recompute cost" on a shipped, not-yet-final order
(`finance.write`, audited, event `field_edited` with `f: "cost_snapshot"`) is the only rewrite.

### OPE-§16.4 Carrier rates (AC-02, R2)

Per carrier account × city (`*` default): delivery, return, COD fee (bp with an optional minimum). The snapshot takes
the estimate; the matched statement line gives the actual; finance uses the actual when present, and the carrier
page shows "estimated 25.00 · charged 28.00 · +3.00 on 41 parcels".

### OPE-§16.5 Ad spend and expenses (AC-03, R2)

- Ad spend: the R1 grid plus CSV import (mapping kind `ad_spend`, OPE-§18); **rev 3 (OD56):** a row in a currency
  other than the store's is accepted when `accounting.adRates` has a rate dated ≤ the row's day for that currency, and
  stored with its own currency; otherwise the preview lists it under "needs a rate" with a one-field form that adds the
  rate and re-validates (never a refusal, never a silent conversion). AC-12 ("multi-currency") remains the different
  problem of a second **store** currency.
- Expenses `/app/<h>/finance/expenses` (`finance.write`): day, category (`stock`, `packaging`, `salaries`, `rent`,
  `tools`, `phone`, `transport`, `fees`, `ads_other`, `other` + custom ≤ 20), amount, note, receipt (PDF, JPEG, PNG ≤
  5 MB, sniffed, stored under `DATA_DIR/receipts/<storeId>/` [Q.14], served only to `finance.read` holders through
  `/api/app/<h>/finance/receipts/<id>`); recurring templates (monthly / weekly) materialised by `fin.recurring`
  (daily, idempotent on `(parent_id, occurrence)`).

### OPE-§16.6 Profit dashboard (AC-04, R2) and ad allocation (AC-08, R3)

Rollup `fin.rollup` (nightly, `rollups` slot, cursor over stores with `accounting` on; ≤ 3 s per store) recomputes the
last 45 placed days of `finance_daily`:

| Order outcome | `net_cents` contribution |
|---|---|
| delivered | **`collected_cents`** (rev 3, OD51; = total unless partial or adjusted by the statement) − COGS of the **delivered** lines (refused lines of a partial delivery go back to stock, S1 hook) − packaging − delivery fee (actual, else estimate) − COD fee (on the collected amount, OPS-25) − commissions |
| delivered then refunded (rev 3, OD59) | the delivered row minus `refund_cents` (booked on the refund day as `refund_cents`; `net = delivered − refunds − …`) |
| refused / returned / lost | −(delivery fee + return fee + packaging + non-void commissions) |
| cancelled / fake / duplicate / unreachable before shipping | −(non-void commissions) |
| open (not final) | adds to `expected_net_cents` at the store's trailing c and d instead |

Ads: `adsAllocation = "spread"` spreads a (day, platform) spend over that day's orders whose `utm.source` maps to the
platform (`facebook`, `fb`, `ig`, `instagram`, `meta` → meta; `tiktok`; `snapchat`, `snap`; `google`, `gads`,
`adwords` → google; case-insensitive), equally per order; unmatched spend stays on `total` as unattributed;
`"unattributed"` puts every spend on `total` only. AC-08 (R3) matches `ad_spend_daily.campaign_id` or
`campaign_name` to `utm.id` / `utm.campaign` and fills `campaign:<key>` dims.

Dims: `total`, `page:<id>`, `product:<id>` (catalog, R2), `city:<key>` (top 30 by orders, rest `city:other`),
`carrier:<accountId>`, `campaign:<key>` (R3, top 30 + other).

Headline KPIs (`/app/<h>/finance`, R2): delivered revenue; **cost per delivered order** = ad spend ÷ delivered;
**true ROAS** = delivered revenue ÷ ad spend; contribution margin = Σ net; profit per delivered order =
contribution ÷ delivered; refusal cost (**rev 3:** decomposed by `return_reason`, OD50); cash position = cash in hand
(`at_delivery` orders, remitted the same instant, OD52) + collected-not-remitted (statement carriers) + remitted −
refunds − expenses, each part labelled; the COD funnel
(orders → confirmed → shipped → delivered → cash remitted) as horizontal stepped bars with counts and step rates
(RF §2.5); a table per dimension; banners for missing costs ("12 delivered orders have no cost") and for estimates.

### OPE-§16.7 Remittance reconciliation (AC-06, R2)

Import a carrier statement through OPE-§18 (kind `remittance`, mapping per carrier account; only accounts with
`settlement = "statement"` offer the import, OD52). Per line:
1. Match: tracking → `shipments` (store, carrier account) → order; else the mapped order-id column → order; else
   **(rev 3, OPS-26)** when the mapping has a `phone` field: `probable` = the delivered, not-yet-remitted order of this
   store whose phone digits equal the line's (`customers.phone` through `orders.customer_id`), delivered inside the
   statement period (or within 45 days of the import when there is none) and whose collected amount is within
   `remittanceToleranceCents + 1 currency unit` of the line's COD; two candidates → `unknown` (never a guess); else
   `unknown`. `probable` lines are listed in the preview with the masked phone, the order id and "Confirm" per line (or
   "Confirm all 12 probable"); **a probable match is never committed without the owner's tick** (it becomes `matched`
   with `note = "matched by phone"`).
2. Flags: `matched`; `amount_diff` (line COD ≠ the order's collected amount, `diff_cents`); `fee_diff` (line fee ≠ the
   snapshot estimate by more than 1 currency unit); `duplicate` (shipment already on another statement); `unknown`.
3. Effects on commit: matched and amount-ok lines set `shipments.remittance_id` and money → `remitted` through
   `applyExternalStatus(…, { money: "remitted" }, { kind: "import", ref: runId })`; **(rev 3, OD51)** an `amount_diff`
   within ± `accounting.remittanceToleranceCents` (default 0: the owner opts in, e.g. 500 = 5 MAD for rounding and
   negotiated discounts) sets `collected_cents` = the line's COD (event `state_changed` meta `collectedCents`, the
   drawer says "collected 329.00 instead of 349.00 · statement AMX-41") and moves money → `remitted`; above the
   tolerance the line moves money → `disputed` with the difference in the event, as before.
4. **Missing**: delivered shipments of that carrier with `delivered_at` before the statement period end (or more than
   14 days before the import when there is no period) and no remittance, listed as "Not on any statement" with age.
5. **Cash held by carrier** per **statement** account (rev 3, OD52: `at_delivery` accounts and "my carrier" set to
   `at_delivery` never appear here; their orders are `remitted` at delivery), by `delivered_at` age of
   collected-not-remitted orders: 0-7, 8-14, 15-30, > 30 days, with totals; above `accounting.cashHeldAlertDays`
   (default 15) → Telegram line (IN-04) and `fin.cash_held` notification; > 30 days → `cash_held` profit alert.
   **Mark cash received** (`finance.write`, drawer or bulk ≤ 200, R1): money `collected → remitted` by a person
   (class M) for mixed setups (a courier who hands over cash for some orders, a statement for the rest), event meta
   `settlement: "manual"`.

Re-import: `UNIQUE (store, carrier account, statement_ref)` and the file hash answer "This statement is already
imported (14 Oct, 212 lines)". Acceptance: golden statements with duplicates, partial payments, fee differences and
unknown lines; ageing across month ends; idempotent re-import.

**Reconciliation states on the order and the shipment (SF-09, OD41).** The money axis is the state (`unpaid` → `collected`
on delivery → `remitted` on a matched line; `disputed` on `amount_diff`; `written_off` by a person); every statement
effect is an `applyExternalStatus` call with `{ kind: "import", ref: runId }`, so the order timeline shows "Remitted ·
statement AMX-2026-41 · line 118" and a `remitted` event carries `{ remittanceId, lineNo, codCents, feeCents }`. A line
whose order's delivered day falls inside a **closed period** (`accounting.closedThrough`) still moves the money axis
(cash is cash) but the finance effect is booked as a `late` adjustment on the import day (`finance_daily` row of the
import day, `dim_key = 'late:<YYYY-MM>'`), never into the closed month's rows; the import preview says "3 lines concern
September, which is closed: booked as late adjustments in October". Cash held = Σ COD of `collected` orders of the
account, which equals Σ delivered COD − Σ remitted − Σ disputed − Σ written off (the footer identity of OPE-§16.8).

### OPE-§16.8 Accountant exports (AC-07, R2)

`/app/<h>/finance/exports` (`finance.read`), CSV (UTF-8 BOM, formula-safe like `csvField`, `admin.ts:370-374`;
**rev 3 (OPS-27):** delimiter and encoding from `accounting.exportFormat` (`;` default, Windows-1252 for legacy
portals) and every file also as **`.xlsx`** through the in-house writer `src/lib/imports/xlsx-write.ts` (S3: a zip of
`[Content_Types].xml`, `workbook.xml`, one `sheet1.xml` with inline strings and numbers, `styles.xml` with a date and a
currency format; no dependency, the mirror of OPE-§18.6; the `#` header lines become the first rows and the sha256 is
computed over the CSV body so both formats carry the same checksum)),
**accountant-grade (OD41)**: every file starts with a 4-line `#` header (store handle · period `from..to` in the store
timezone · generated at, ISO and store-local · `rows=<n> sha256=<hex of the body after the header>`), every date column
exists twice (`*_iso` in UTC, `*_local` in the store timezone), every amount is in cents **and** in a formatted
`decimal` column, and the last line is a `# check` footer with the control identity of the file. A column dictionary
(`dictionary.csv`: column, type, meaning in `accounting.exportLocale`) is downloaded with every export (one ZIP when
the owner picks several files).

| Export | Keyed by | Columns (beyond the header and dictionary) |
|---|---|---|
| Sales register | delivered date | order id, product / offer, qty, total, **collected** (rev 3, OD51), shipping charged, adjustment, currency, carrier, settlement (`at_delivery` \| `statement`, OD52), **`reconciliation_state`** (`unremitted` \| `remitted` \| `disputed` \| `written_off` \| **`refunded`**), **refund** and refund date (OD59), statement ref, statement line, remitted date, **return reason** (OD50, on the returned-after-delivery rows), `late` flag (+ HT / TVA / TTC when the tax profile is `vat`, R3) |
| Cash journal (new) | remittance paid date | statement ref, carrier, order id, COD, fee, return fee, net, match state, dispute note; footer: Σ net = statement net |
| Remittance report | statement | statement ref, carrier, paid date, gross, fees, net, lines, matched, disputed, unknown, missing count at import |
| Cash held (new) | carrier × ageing bucket | carrier, bucket (0-7, 8-14, 15-30, > 30), orders, COD held, oldest delivered date; footer: Σ = delivered − remitted − disputed − written off |
| Expenses | day | category, amount, note, receipt (yes/no), recurring (yes/no), `late` flag |
| Payouts | agent × period | agent (display name, never a phone), period, total, state, paid date, method, ref, entries |
| P&L summary | month | delivered revenue, COGS, packaging, delivery and return fees, COD fees, commissions, ad spend, expenses, late adjustments, net; one row per month, closed months flagged |

No customer phone, address or note in any accountant export (accountant role, core §A.3.2); the sales register names
the customer's city only. Closing a period (`accounting.closedThrough`, owner, `finance.write` + a fresh step-up on the
core §B.7 tenant ladder, TOTP or password, rev 4 OD64; audit `finance.period_closed`, second-round request OPE-§Q.26)
freezes every row dated inside it: a later
cost edit, statement line or ad-spend cell for those days books a `late` adjustment in the current period and the
export of the closed month is byte-identical to the one taken at closing (`test:money` re-exports a closed fixture
month after a late import and compares the sha256).

### OPE-§16.9 Later (R3 and later)

- **AC-09 tax profile** (R3): `accounting.taxProfile` (none / turnover rate / VAT rate, prices tax-included), typed by
  the owner; every derived figure is labelled "Estimate, ask your accountant"; no rate is hard-coded (owner rule 4);
  journal CSV (date, journal, account, label, debit, credit, piece ref) and a printable P&L page.
- **AC-10 XLSX** (R3): OPE-§18.6.
- **AC-11 stock purchases** (R3, store mode): `stock_purchases` log, inventory value = Σ qty × unit cost per product
  minus delivered units at average cost.
- **AC-12** (later): ad-spend APIs (Meta, TikTok OAuth app reviews), multi-currency, FEC export.

---

## OPE-§17. Carriers and shipments (OP-16, OP-20 … OP-22, OP-26, OP-27; R-D21)

### OPE-§17.1 Adapter interface (`src/lib/carriers/types.ts`, S4)

```ts
export interface CarrierCapabilities { createParcel: boolean; cancelParcel: boolean; label: boolean; pickupRequest: boolean; trackPull: boolean; trackWebhook: boolean; zonesSync: boolean; remittancePull: boolean; rescheduleParcel: boolean; updateParcel: boolean }   // rev 3: reschedule (OD48) and address update in transit (OPS-21), R3 adapters only when the carrier documents them
export type StatusMapEntry = ShipState | "ignore" | { state: ShipState; reason?: ReturnReason };   // rev 3 (OD48, OD50)
export interface CarrierCtx { scope: StoreScope; account: CarrierAccountRow; credentials: Record<string, string> | null; signal: AbortSignal; deadline: number }
export interface ParcelInput { orderId: string; name: string; phone: string; city: string; cityKey: string | null; address: string; landmark: string | null; codCents: number; currency: string; content: string; qty: number; note: string | null }
export interface CarrierEvent { tracking: string; carrierStatus: string; at: Date; raw?: unknown }
export interface CarrierAdapter {
  id: string;                                   // "manual", "sendit" (R3)
  label: string; capabilities: CarrierCapabilities;
  credentialsSchema: z.ZodType<Record<string, string>> | null;   // stored in store setting carrier_credentials (secret)
  defaultStatusMap: Record<string, StatusMapEntry>;
  defaultSettlement: "statement" | "at_delivery";   // rev 3 (OD52): `self` → at_delivery, every CSV / API carrier → statement
  createParcels?(ctx: CarrierCtx, parcels: ParcelInput[]): Promise<{ orderId: string; ok: boolean; tracking?: string; labelRef?: string; error?: string }[]>;   // idempotent on orderId
  cancelParcel?(ctx: CarrierCtx, tracking: string): Promise<{ ok: boolean; error?: string }>;
  rescheduleParcel?(ctx: CarrierCtx, tracking: string, date: string): Promise<{ ok: boolean; error?: string }>;   // rev 3 (OD48)
  updateParcel?(ctx: CarrierCtx, tracking: string, patch: Partial<Pick<ParcelInput, "address" | "landmark" | "note">>): Promise<{ ok: boolean; error?: string }>;   // rev 3 (OPS-21)
  labels?(ctx: CarrierCtx, trackings: string[]): Promise<Uint8Array>;
  track?(ctx: CarrierCtx, trackings: string[]): Promise<CarrierEvent[]>;
  parseWebhook?(ctx: CarrierCtx, req: Request): Promise<CarrierEvent[]>;
  syncZones?(ctx: CarrierCtx): Promise<{ cityKey: string | null; label: string; deliveryFeeCents?: number; returnFeeCents?: number }[]>;
}
export function registerCarrier(a: CarrierAdapter): void;      // src/lib/carriers/registry.ts
```

Every outbound adapter call goes through the outbox kind `carrier` (core §H.1) or a cron job with the SSRF guard
(SE-07), never inside a user request longer than 8 s.

### OPE-§17.2 The `manual` adapter (R2)

Capabilities all false; it is the CSV path: manifest export (mapping kind `manifest`), tracking import (`tracking`),
status import (`status`), remittance import (`remittance`), plus typed tracking numbers. `statusMap` per account
(`carrier_accounts.settings.statusMap`), edited by the store: every carrier label seen in an import appears once in
an "Unmapped statuses" list until the store maps it to a ship state or `ignore`; **rev 3 (OD48, OD50):** the picker
offers the twelve ship states (incl. **Attempt failed** and **Postponed**) and, for `refused` / `returned` / `lost`, an
optional **reason** (`RETURN_REASONS`), stored as `{ state, reason }`. `defaultStatusMap` ships **empty** for `manual`
(core D38: no preset until a real anonymised file exists in `scripts/qa/fixtures/imports/`; the finding's "common
carrier labels" are added there, one file per carrier, when the owner's files arrive). A status file line mapped to
`attempt_failed` enters the delivery lane exactly like a manual move (§3.2), so the rescue call happens the same tick
the file is imported; a line mapped to `postponed` with a mapped `at` / "reporté au" column sets `ship_after`.

**The `self` adapter (rev 3, OD52)**: own couriers, store pickup, runner apps without an API. Capabilities all false,
`defaultSettlement: "at_delivery"`, no imports; the warehouse moves parcels by hand (bulk "Move to…" on the shipping
views, or the Sheet). It exists so a store with a real carrier **and** its own couriers has two accounts with two
settlements, and so `shipments` rows exist for every parcel in R2 (partial deliveries, picking lists, labels print).

### OPE-§17.3 Carrier accounts (`/app/<h>/shipping/carriers`, `integrations.manage`)

Add an account (adapter, label), its mappings, its tracking URL template (`https://…{tracking}`, https only), its rates
(OPE-§16.4); disable. Credentials (API adapters, R3) are typed into a write-only field and stored in
`carrier_credentials`; the page shows "set / not set" only.

### OPE-§17.4 Shipping flow (`/app/<h>/shipping`, `shipments.write`)

1. **To pack** list (confirmed, ship `to_pack`, **holds excluded**: `ship_after IS NULL OR ship_after ≤ now`, OD49; a
   separate "On hold" tab lists them with the date and "Release hold"): bulk "Create shipments" with a carrier account
   → `shipments` rows (state `to_pack`, `kind: full`), event `shipment_created`, `orders.tracking_ref` / `carrier_label`
   mirrored from the shipment (OD55); ship → `packed` once the manifest is exported or a label exists. The account
   pre-selected is the R1 `carrier_label` match when one exists, else the routing rule (R3), else the last used.
2. **Picking list** (print view): items grouped by item and option codes with totals for the selection.
3. **Manifest** (print view and CSV through the account's manifest mapping): full name, phone, city, address,
   landmark, COD amount, content, qty, note; full phones are the reason this needs `shipments.write`; each order gets
   `manifest_exported` (meta `why: "manifest"` counts as a reveal for the alarm).
4. **Tracking import** (or typing): tracking set on the shipment; ship → `shipped` (`shipped_at`).
5. **Status import**: tracking → carrier status → mapped entry (`{ state, reason? }`) → `applyExternalStatus(…, { ship,
   returnReason }, { kind: "import" })`; `shipment_events` rows (`raw` kept 30 days); `attempt_failed` lines feed the
   delivery lane (OD48).
6. Delivered → money `collected` (automatic; `collected_cents` = total, OD51) and, for an `at_delivery` account,
   `remitted` in the same transaction (OD52); for `statement` accounts the remittance (OPE-§16.7) → `remitted`.
7. **Partial delivery (rev 3, OD51)**: on a shipment "out", **Partial delivery…** (`shipments.write`) lists the
   order's lines with Delivered / Refused / Pending per line and the amount collected (pre-filled with the sum of the
   delivered lines plus the delivery fee; editable, ≤ total): one `transitionOrder(want ship delivered, collectedCents,
   lines, returnReason?)` → `delivered` with `collected_cents`, the `line_outcome` event, the refused lines restocked by
   S1's hook, and, when a line is `pending`, a child shipment (`kind: partial`, `parent_id`) created in `to_pack` with
   those lines as its content; the order's ship axis stays `delivered` (the parent) and the child's progress shows in
   the drawer as "Second parcel: packed". Refused-only outcomes stay a plain `refused` move.
8. **Changes to pass on (rev 3, OPS-21)**: in-transit address / landmark edits and `recall_requested` events of
   shipments of this account, each with "Done" (writes `carrierNotified: true` on the event's order through
   `appendOrderEvent`), so the warehouse phones the carrier from one list.

### OPE-§17.5 Shipment rules

One order → one active shipment, **plus at most one active `partial` child** for the pending lines of a partial
delivery (rev 3, OD51); a re-shipment after a refusal is a new `reship` row with `parent_id` (R3, OP-22). Cancelling a
pre-pickup shipment (manual: a button; API: `cancelParcel`) puts ship back to `to_pack` and allows the order to be
cancelled. `shipments.state` mirrors `orders.ship_state` for the **primary** shipment; a `partial` child has its own
state and never writes the order's axis (the order is `delivered`; finance reads the child's outcome through the
child's own `line_outcome` on the parent order when it is final: delivered → `collected_cents` increased by the child's
collected amount, refused → its lines restocked). `orders.ship_state` stays the truth for the order; `orders.tracking_ref`
mirrors the primary shipment's tracking (OD55).

### OPE-§17.6 Print views (OD28)

`/app/<h>/shipping/print/{picking,manifest,labels}?batch=<id>`: server-rendered HTML with print CSS (A4; labels 100 ×
150 mm), carrier logos never embedded (no third-party assets), the platform brand nowhere; "Print / Save as PDF" via
the browser.

### OPE-§17.7 Carrier webhooks and tracking polling (OP-21, R3, D2)

- Ingress `POST /api/hooks/carrier/<adapter>/<hookKey>` (public-api area; core §C.3 `/api/hooks/**`): the account is
  found by `sha256(hookKey)` (`ca_hook_uq`), compared in constant time; 256-bit random key shown once; body ≤ 64 KB;
  `parseWebhook` → events → status updates as §17.4 step 5; answers 200 fast (work in `after()`), 404 for an unknown
  key (no oracle).
- Polling job `carrier.poll`: ≤ 50 shipments per store per tick (not final, last event older than 2 h), round-robin,
  inside the `outbox` slot budget.

### OPE-§17.8 API adapters (OP-20, OP-27, R3+)

Sendit first (its endpoint names are visible through its official plugin, CO §4.1), built **only** from field-level
documentation Sendit provides; then Ameex, Coliix, Ozon Express or others on owner demand, each from carrier-provided
docs. Each adapter passes the shared adapter test-suite (`scripts/qa/carrier-check.ts`: idempotent create, status map
coverage, webhook signature, timeout and retry behaviour) against recorded fixtures before it is registered.

### OPE-§17.9 Returns and exchanges (OP-22, R3)

On a returned shipment: "Received" with condition `restock` / `damaged` (inventory R3, AC-11) and an optional
re-shipment (new shipment, `parent_id`); finance books the return fee from the statement or the rate.

### OPE-§17.10 Carrier routing (OP-26, R3)

`ops.carrierRouting`: city → preferred account, fallback account; pre-selects the account in "Create shipments"; a
city with a refusal rate above the store's + 15 points (n ≥ 20) shows the hint from the profit alerts.

---

## OPE-§18. CSV importers and saved mappings (core D38)

### OPE-§18.1 Flow (`src/lib/imports/**`, S3 owns the framework in R2, S4 and D2 add kinds)

1. **Upload** (`POST /api/app/<h>/imports`, `storeGuard` with the kind's permission): ≤ 5 MB, ≤ 50,000 rows,
   `text/csv` or sniffed text; stored at `DATA_DIR/imports/<storeId>/<runId>.csv` (0600, kept 30 days, core §G.7);
   `import_runs` row (`previewed`). Same `file_sha256` for the same kind within 30 days → "already imported" with a
   link (re-run allowed with a confirmation).
2. **Detect**: encoding (UTF-8 with or without BOM, UTF-16LE with BOM, else Windows-1252 via `TextDecoder`),
   delimiter (`,` `;` tab, the one with a consistent count over the first 20 lines), header row (the first row whose
   non-empty cells are mostly non-numeric), decimal separator (majority of numeric-looking cells).
3. **Map**: pick a saved mapping (`import_mappings` for the kind, **auto-picked** when the file's folded header
   signature equals a saved `headerSignature`; a near match, same columns in another order, is offered with "looks like
   <name>") or map columns in a two-column screen (file headers ↔ fields, sample values shown, required fields first);
   "Save mapping as…" (≤ 20 mappings per kind and store, OD42; saving over an existing name asks). A carrier account
   remembers its last mapping per kind (`carrier_accounts.settings.*MappingId`), so the second statement is one click.
4. **Preview**: the first 50 mapped rows with per-row validation (errors in plain words: "Row 18: amount '12,5O' is
   not a number"), totals, and what will happen ("212 lines: 198 matched, 9 amount differences, 5 unknown").
5. **Commit**: ≤ 2,000 rows inside the request; larger files are committed by the job `imports.commit` (slices of
   2,000 rows, progress shown); `import_runs.state = committed`, report kept (≤ 200 row errors).

### OPE-§18.2 Parser (`src/lib/imports/csv.ts`, pure, no dependency)

RFC 4180 (quotes, escaped quotes, CRLF / LF / CR, embedded newlines), trailing empty rows ignored, cells trimmed,
numbers parsed with the detected or mapped decimal separator ("1 234,50", "1,234.50", "1234.5"), dates with the
mapping's format (`dd/mm/yyyy`, `yyyy-mm-dd`, `dd-mm-yyyy`, `mm/dd/yyyy`, Excel serials) in the store timezone,
money to integer cents with half-up rounding (`src/lib/markets/money.ts`).

### OPE-§18.3 Mapping spec

```ts
export const MappingSpec = z.object({
  v: z.literal(1), headerRow: z.number().int().min(0).max(50), skipRows: z.number().int().min(0).max(50).default(0),
  decimal: z.enum([",", "."]).optional(), dateFormat: z.enum(["dd/mm/yyyy", "yyyy-mm-dd", "dd-mm-yyyy", "mm/dd/yyyy", "excel"]).optional(),
  columns: z.record(ImportField, z.object({ col: z.union([z.string().max(80), z.number().int().min(0)]), transform: z.enum(["trim", "upper", "digits", "money", "date"]).optional() })),
  constants: z.record(ImportField, z.string().max(80)).default({}),   // e.g. platform = "meta", statement_ref from the file name
  headerSignature: z.string().length(16),                             // hash of the folded header cells, for auto-pick
});
```

| Kind | Fields (required in bold) |
|---|---|
| `remittance` | **statement_ref** (column or constant), paid_at, **tracking** or **order_id** (or, rev 3, **phone** for the probable match, OPS-26), **cod_amount**, fee, return_fee, net, customer_name (display in the preview only) |
| `tracking` | **order_id**, **tracking**, carrier_status |
| `status` | **tracking** or **order_id**, **carrier_status** (mapped through `statusMap` to `StatusMapEntry`, rev 3), at, postponed_to (rev 3: the carrier's "reporté au" date → `ship_after` on a `postponed` line) |
| `ad_spend` | **day**, **platform** (column or constant), account_id, campaign_id, campaign_name, **spend**, currency |
| `expenses` | **day**, **category**, **amount**, note |
| `manifest` (export) | ordered output columns `{ header, source: "order_id" \| "name" \| "phone" \| "city" \| "address" \| "landmark" \| "cod_amount" \| "content" \| "qty" \| "note" \| "constant", value? }[]` |
| `products` (R3, IN-12) | OPE-§25.3 |

### OPE-§18.4 Presets

No preset ships until a real sample file exists (core D38, RESEARCH §6.3 Q5). A preset = a `MappingSpec` in
`src/lib/imports/presets/<carrier-or-platform>.ts` plus its anonymised sample in `scripts/qa/fixtures/imports/` and a
golden test; the mapping screen offers matching presets by header signature.

### OPE-§18.5 Safety

Imports never create orders (except IN-12 products); every effect goes through `applyExternalStatus` or the finance
repositories with the store scope; file paths come from `dataPath("imports", storeId, runId)` (core §G.7); files are
never served back except to the uploader's store members with the kind's permission; formula-like cells are stored as
text (they are never re-exported without `csvField`). A committed run is **idempotent twice over**: by `(store, kind,
file_sha256)` (the same file answers "already imported" with the run link) and by its rows' own keys (`statement_ref` +
line, tracking + carrier status + `at`), so a partially committed run resumed by `imports.commit` never double-books.
Every `import_runs.report` lists per row: `row_no`, result (`ok` / `skipped:<why>` / `failed:<why>`), the matched order
id when any, and the `late` flag (OPE-§16.7); the preview and the committed report are the same shape, so what the
owner saw is what happened (`test:money` diffs them). An import never moves an order **backwards** on the ship axis
(a status file listing "picked up" after "delivered" is `external_rejected`, OPE-§3.4) and never touches the confirm
axis except through the implied confirmation of a ship state.

### OPE-§18.6 XLSX (AC-10, R3)

`src/lib/imports/xlsx.ts`: unzip with `node:zlib` `inflateRawSync` over the central directory, read
`xl/workbook.xml`, the first sheet, `xl/sharedStrings.xml`, inline strings and numbers, date serials; ≤ 5 MB
compressed, ≤ 50 MB inflated, ≤ 50,000 rows; then the same detect → map → preview → commit flow. No dependency
(OD29). Acceptance: golden files from LibreOffice and Excel exports parse identically to their CSV twins.

**Writer (rev 3, OPS-27, R2, S3)**: `src/lib/imports/xlsx-write.ts` — `writeXlsx(sheets: { name: string; rows: Cell[][] }[]): Uint8Array`
with `Cell = string | number | { date: Date } | { money: number /* cents */; currency: string }`, inline strings
(`t="inlineStr"`), two number formats (date, currency with two decimals), `deflateRawSync` per part, ≤ 50,000 rows ×
40 columns; used by the manifest export (S4), the accountant exports (S3) and the R1 Carrier CSV route's `format=xlsx`
(R2, P4's route taken over by S4). Acceptance: LibreOffice and Excel open the files without repair; the reader of this
section round-trips every writer fixture cell for cell.

---

## OPE-§19. Google Sheets per store (IN-01, IN-09; R-D24)

### OPE-§19.1 Today (read before changing)

- One connected sheet in the global `sheets` setting (`src/lib/sheets/config.ts:18-66`); one platform service account
  (`GOOGLE_SA_JSON_B64`, `src/lib/sheets/client.ts:43-60`); a 13-column contract `A-M` that never moves
  (`src/lib/sheets/orders-sheet.ts:13-27`) plus optional header-detected columns "SKU", "Articles", "Livraison",
  "Prix pack" (`src/lib/sheets/row.ts:1-16`, `extraColumnsOf`).
- Push: `syncPendingOrders` claims pending rows, reads column A only when a batch may already be in the sheet, appends
  in one request, rewrites upsell cells (`sync.ts:175-242`); a process-global coalescing state (`sync.ts:244-292`) and
  a global `GET_LOCK('cod:sheets-sync')` (`sync.ts:47`).
- Pull: column C labels of `A2:C` → `orders.status` for synced orders, every ≥ 290 s, platform-wide (`sync.ts:308-341`).
- Status edits in the admin write the sheet cell first (`admin.ts:172-196`).

R1.0 (T4) scopes all of this per store (SHT-01 … SHT-11). P5 then builds the design below.

### OPE-§19.2 Configuration and binding

- Store setting `sheets` (schema OPE-§2.9): spreadsheet, tab, `enabled`, `pull`, the pending proof.
- `sheet_bindings`: `spreadsheet_id` is the primary key, so one spreadsheet belongs to at most one store
  (TENANCY-MAP §7.7). Every push and pull first checks that the store's configured spreadsheet is bound to the store;
  an unbound config is treated as "not connected".
- Store #1 (legacy): the one-shot job `sheets.bind_legacy` inserts a `legacy` binding for store #1's existing sheet
  when none exists (idempotent; marker = the binding row itself).

### OPE-§19.3 Connect with an ownership proof (`src/lib/sheets/connect.ts`, P5)

```ts
export function startSheetConnect(ctx: StoreCtx, url: string): Promise<ActionResult<{ code: string; serviceAccountEmail: string; expiresAt: string } | { alreadyBound: true }>>;
export function verifySheetConnect(ctx: StoreCtx): Promise<ActionResult<{ connected: true; tab: string; created: boolean }>>;
export function disconnectSheet(ctx: StoreCtx): Promise<ActionResult<void>>;
// all: integrations.manage (sensitive), feature "sheets", kill switch sheets_sync_enabled, bucket s:<sid>:sheets:connect:<uid>
```

1. The owner pastes the sheet link; `parseSheetUrl` (`src/lib/sheets/format.ts`) gives the spreadsheet id and tab.
2. Already bound to this store → no proof needed (reconnect). Bound to another store → the generic answer "This sheet
   can't be connected. Create a new Google Sheet for this store." (no hint that another store uses it).
3. Otherwise a code `SG-` + 10 Crockford base32 characters is generated, its sha256 stored in `sheets.pending`
   (24 hours), and the screen shows two steps: share the sheet with `<service account e-mail>` as Editor; type the code
   into any cell of the first row.
4. **Verify** reads `A1:AZ3` of the tab (one call), looks for the code (case-insensitive, trimmed); found → `INSERT`
   into `sheet_bindings` (a duplicate-key race with another store answers the generic refusal), then today's
   `connectSheet` (create or reuse the "Commandes" tab, header, formats, data validation with every label of
   OPE-§3.3), save the config (`enabled: true`, `pull: true`), clear `pending`,
   `audit("integrations.sheets.connected")`. The screen then says "You can delete the code from the sheet."
5. Google errors go through `explain()` (`orders-sheet.ts:409`): "Share the sheet with … as Editor", "The link is not a
   Google Sheet", "Too many requests, try again in a minute".
6. Disconnect: delete the binding, `sheets = { enabled: false }`, audit; orders keep their `sheet_status`.

### OPE-§19.4 Row content

The 13 contract columns are unchanged (`row.ts`, PHP export parity); the Date column uses the store timezone
(SHT-08); column C = `statusLabel(projectStatus(…))`; a new optional header **"Repère"** carries `orders.landmark`
(added to `extraColumnsOf`). **rev 3 (OD54, OD55, OD49): six more optional headers**, detected like "SKU" / "Repère",
each pushed by the app and (except the last two) pulled back:

| Header (first row, trimmed, case-insensitive) | Column | Push (bit) | Pull → |
|---|---|---|---|
| "Agent" | `orders.confirmed_by_label`, or the mapped member's display name when `confirmed_by` is set | 1 (with the status) | the label on the confirmation the pull applies; a mapped label (`ops.agentLabels`) writes `confirmed_by` (OPE-§19.6) |
| "Note agent" | the last `note` event of actor `sheet` | — (the app never writes this cell) | a `note` event (actor `sheet`, `meta.agentLabel` = the row's Agent cell, `meta.cellHash`); re-pulled only when the cell hash changes |
| "Tracking" | `orders.tracking_ref` | 2 | `tracking_ref` + event `tracking_set`; a non-empty value on ship ∈ {none, to_pack} implies ship → `packed` (a label exists, §17.4; implied confirmation first) |
| "Transporteur" | `orders.carrier_label` (R2: the shipment's account label) | 2 | `carrier_label` (R2: matched to a carrier account by folded label; unmatched text kept as is) |
| "Statut livraison" | the exact ship state label (`ops.ship.<state>` in the sheet's locale: "Tentative échouée", "Reportée"…) | 1 | — (read-only mirror; the status cell C stays the one the team edits) |
| "Livrer à partir du" | `orders.ship_after` as a date in the store timezone | 2 | — (read-only mirror; the hold is set in the app) |

Pulling the new cells widens the one read of §19.5 step 3 from `A2:C` to `A2:<last optional column>` (still one call).
A pulled text cell is applied when it differs from the order's column (these columns have no `sheet_label`-style
memory: the drawer is their only other writer and it marks bit 2, so the next push rewrites the cell and the two
agree); the Sheets screen says in plain words which features need the queue (OPE-§14.3). Test orders are never
appended: the public path already stores them with `sheet_status =
'disabled'` (core D54, §K.1 T3), and the push's `WHERE` adds `is_test = 0` as a belt (a test order can therefore never
reach a sheet even through "Send again"). Manual orders appear like any order with Source "Manuel" / "WhatsApp". R2:
store orders (`items.v === 3`, STO-R8) fill "Variante", "SKU" and "Articles" through `orderUnitsV3` (core §D.2, 0006);
R3: an upsell chain (`items.chain[]`, LAN Q27) is appended to the "Produit" cell and counted in "Articles" (core §K.5).

### OPE-§19.5 Push (`src/lib/sheets/push.ts`, P5)

```ts
export function scheduleSheetPush(scope: StoreScope): void;     // debounced 2 s per store, then after(() => pushStore(scope, { maxCalls: 2 }))
export function pushStore(scope: StoreScope, opts: { maxCalls: 1 | 2 | 3; pull?: boolean }): Promise<SheetsRunReport>;
```

One run for one store:
1. Preconditions: bound, `enabled`, kill switch on, breaker closed (§19.7), at least one platform token.
2. Work: **appends** = `sheet_status IN ('pending', 'failed' past backoff) AND is_test = 0` (≤ 100, oldest first);
   **updates** = `sheet_status = 'synced' AND sheet_dirty > 0` (≤ 200).
3. **One read** (`A2:C`, `readOrderRows` + `readStatuses` merged into one call) when updates exist, when an append may
   already be in the sheet (retry, upsell), or when a pull is due. It yields `id → { row, label }`.
4. **One append** of the new rows (today's `appendWide`).
5. **One `values:batchUpdate`** for the dirty orders found in the read: bit 1 → C (+ "Agent", "Statut livraison" when
   present, rev 3); bit 2 → D, E, F, G (+ "Repère", "Tracking", "Transporteur", "Livrer à partir du" when present);
   bit 4 → H, I, J, K (+ SKU, Articles, Prix pack, Livraison when present).
6. Mark: appended → `synced`, `sheet_label` = the label written; updated → `sheet_dirty = 0`, `sheet_label` = the
   label written, both with `WHERE rev = <rev read>` (an order changed meanwhile stays dirty for the next run).
7. A dirty order whose id is missing from column A (a row deleted in the sheet) gets `sheet_error = "Row not found in
   the sheet"` and `sheet_dirty = 0`, shown in the drawer with "Send again" (requeue); no automatic re-append (no
   fight with a person deleting rows).
8. `integration_status (sheets)`: state, backlog (pending count), `oldest_pending_at`, last ok / error.

### OPE-§19.6 Pull and the conflict rule (OD2)

For each `(id, label)` of the read whose order belongs to this store (other ids are ignored, SHT-05):
- Blank or unknown label → skip.
- `label = orders.sheet_label` → the sheet holds what the app last wrote or read → nothing to do.
- Otherwise a person changed the cell → `applyExternalStatus(scope, id, { legacy: label }, { kind: "sheet", ref:
  "row:<n>" })`:
  - changed and the new projection equals the label → `sheet_label = label`;
  - changed but the projection differs (an implied path), `noop` or `reject` → `sheet_label = label` and
    `sheet_dirty |= 1`, so the next push writes the app's label back (OD5).
- An edit made in the sheet between the read and the batchUpdate of the same cell is overwritten by the app's label;
  the window is a few seconds and both values stay visible in the timeline.

Pull runs inside the push's read when due (`s:<sid>:sheets:pull` 1 per 290 s, core §E.8) and only when
`sheets.pull` is on; the `sheets.pull` job reads stores whose pull is due but had no push work.

**rev 3: the optional pulled cells (OPE-§19.4).** For each row of the read whose order belongs to this store:
- "Agent": when the row's status cell applies a confirmation (explicit or implied) and the Agent cell is non-empty →
  `ops.agentLabels[label]` set → `confirmed_by = that member` (the `state_changed` event carries `agentLabel` too);
  unmapped → `confirmed_by_label = label` (OD54). An Agent cell edited later on an already confirmed order updates
  `confirmed_by_label` only while `confirmed_by IS NULL` (nobody re-attributes a queue confirmation from a cell).
- "Note agent": a non-empty cell whose `sha256` prefix differs from the last sheet note's `cellHash` of that order →
  `note` event (actor `sheet`, `agentLabel`, `cellHash`), masked phones at render as every note.
- "Tracking": non-empty and ≠ `tracking_ref` → `tracking_ref`, event `tracking_set`, and `applyExternalStatus(…, {
  ship: "packed" })` when the order is pre-ship (a later status cell "Expédiée" moves it on). A cleared cell never
  clears the column (a person deletes a tracking by mistake more often than on purpose; the drawer can).
- "Transporteur": non-empty and ≠ `carrier_label` → `carrier_label`.
- **Label mapping backfill (OD54)**: when a manager maps a label, `after()` runs one `UPDATE orders SET confirmed_by =
  :uid WHERE store_id = ? AND confirmed_by IS NULL AND confirmed_by_label = :label AND created_at ≥ now − 90 d`
  (≤ 5,000 rows, `orders_store_created_idx`), appends one `assigned` event per touched order (`by: "label_map"`), runs
  the `money.commissions` hook (R2) for them and marks the 14-day rollup dirty; the audit row carries the count.
These cells never move the confirm axis out of a terminal state (the OD5 rule), and a test order is never read.

### OPE-§19.7 Quota, fairness and the breaker

- Google limits: 300 requests per minute per project and 60 per minute per user per project; the platform service
  account is one user (https://developers.google.com/sheets/api/limits).
- Platform bucket `p:sheets:sa` = 50 calls per 60 s (every Google call takes a token first; none left → the run stops
  and the store keeps its work for the next run).
- Per store per tick: at most one read, one append, one batchUpdate (OD22, accepted in core §H.2 slot 1); the
  `after()` fast path uses at most 2 calls (append, or read + batchUpdate).
- Stores with work (`forEachStore(… where: "pending_sheets")`, core §E.2; the predicate is the core's: bound + enabled
  and (`sheet_status` pending / failed past backoff, or `sheet_dirty > 0`, or a pull due)) are served **oldest pending
  order first** (rev 4, aligned with core §H.2 slot 1 rev 3, ENGC-33: not plain round-robin, so the store waiting longest
  is never behind a store that just got an order); `sheets.push` has **18 s** and `sheets.pull` **12 s** per tick (core
  §H.2), and the run awaits `ctx.yield()` between stores (core §H.2 rev 3).
- A 429 from Google opens a platform breaker for 90 s (`cron_cursors.state` of `sheets.push` + an in-memory copy);
  every run checks it.
- Capacity (rev 4, the core's figure, core §H.2 slot 1): the platform bucket allows `floor(50 / 3)` ≈ **16 stores per
  tick** when every store needs its three calls, i.e. a store is served every `ceil(active / 16)` ticks (5 minutes each)
  plus the request-time `after()` pushes (≤ 2 calls) that most new orders get anyway; the `int:sheets_backlog` rule and
  the core's backlog alarm scale with that figure (core §H.5), and past ~40 active Sheets stores the remedy is IN-09's
  store-owned service account (`sheets_sa`, R2), which takes a store off the shared quota. Revision 3's "~100 stores"
  estimate assumed one call per store per tick and is withdrawn.

### OPE-§19.8 Screen `/app/<h>/integrations/sheets` (P5)

| State | Content |
|---|---|
| Not connected | value line ("Every order lands in your own Google Sheet within a minute, and your agents' status changes come back"), link field, Connect |
| Proof pending | the two steps with the service-account e-mail (Copy), the code (Copy, large mono), Verify, expiry |
| Connected | status card (pattern of `dashboard/sheet-health.tsx`): last push, last pull, backlog, oldest waiting order, last error in plain words; the sheet link (owner, admin, manager); Sync now; Pause / Resume; "Bring status changes back from the sheet" switch; Repair sheet (re-applies header formats and the status dropdown; **rev 3:** offers to add the six optional headers of OPE-§19.4 with one tick each); Disconnect; **Last runs**: the last 20 `SheetsRunReport`s of the store (when, appended / updated / pulled counts, calls used, error) kept in `cron_cursors.state` of `sheets.push` per store (≤ 20 entries, ≤ 4 KB) so Sheets has the same "what happened" surface as the outbox kinds (OPE-§28) without being one; **rev 3 (OD54): "Working in the sheet"** card: which columns are read back (Agent, Note agent, Tracking, Transporteur), the labels seen in the last 28 days with "Map to a member" (the OPE-§14.1 table), and the plain list of what needs the queue (first touch, handling time, attempts per confirmation, abandoned claims, skips, best hours) versus what works from the sheet (confirmation and delivery rates, reason mixes, commissions once labels are mapped) |
| Paused | warn state (the yellow `--warn` token, hue ≥ 90): "Paused: new orders wait here" with the backlog |
| Failing | the `explain()` text, Retry, "What to check" |
| Pending store | locked card "Available after approval" (core §A.5.2) |

The export key card (`export_key`, optional store-owned Google key for PHP exports, EXP-03) sits below, write-only.

### OPE-§19.9 Upgrades (IN-09, R2, S5)

- More pulled columns by optional headers: **rev 3:** "Agent", "Note agent", "Tracking" and "Transporteur" moved to
  **R1** (OPE-§19.4, OD54 / OD55); R2 adds "Frais livraison" → the shipment's actual fee and, for "Tracking" /
  "Transporteur", the binding to `shipments` rows and carrier accounts.
- Tab routing per page (`sheets.routes: { [pageId]: tabTitle }`): one append per tab, counted in the store budget.
- Store-owned service account (`sheets_sa`, secret): that store's calls use its token and skip the platform bucket.
- Label mapping (`sheets.labelMap`: the agents' own words → a legacy status; **rev 3:** a label may carry a return
  reason suffix, "Refusé : prix" → `refused` + `refused_price`, OD50).

---

## OPE-§20. Ad events: Conversions API and Events API (IN-02, IN-03, IN-13; R-D23)

### OPE-§20.1 Today

The server Purchase is built inside `createOrder` (`purchaseConversion`, `src/lib/orders/conversions-core.ts:161`),
skipped at risk ≥ 70 (`:45`), sent after the response (`sendConversionsAfterResponse`, `conversions.ts:90`), one
request per pixel with its own token (`dispatchPurchase`, `:533`); the browser Purchase fires on the thank-you page
with `event_id = orderId` (`src/landing/runtime/thankyou.ts:54-80`, `pixels.ts:282`).

### OPE-§20.2 Trigger

`triggerFor(scope, order) = conversions.pageOverrides[order.pageId] ?? conversions.purchaseTrigger` (OD18).

| Trigger | Browser (thank-you) | Server Purchase | Custom events (Meta, `customEvents`) |
|---|---|---|---|
| `order` | Purchase (today) | at creation, risk < 70 | ConfirmedOrder at confirmation, DeliveredOrder at delivery |
| `confirmed` | **none** (thank-you rendered without the pixel chunk) | at confirmation (any risk, OD19) | DeliveredOrder at delivery |
| `delivered` | **none** | at delivery | ConfirmedOrder at confirmation |

Never sent: test orders, honeypot rows, manual orders (unless `manualOrders`), orders from pages without a pixel that
has its own server token.

### OPE-§20.3 The browser side (zero runtime bytes)

The thank-you document is rendered without the `pixels` chunk when the page's trigger is not `order` (accepted, core
§H.3 and §K.1 T3: the store render context carries `purchaseInBrowser = triggerFor(page) === "order"`, the thank-you
document omits the chunk when it is false, zero runtime bytes, runtime config v2 unchanged; the render-check fixture
for both cases is core §J.1). The landing document keeps every funnel event (PageView, ViewContent, AddToCart,
InitiateCheckout, Lead). Changing the trigger or an override calls `enqueueRenders(scope, pageIds, "conversions", 4)`
(reason `conversions` appended to `render_jobs.reason`, core §H.3); the Pixels page shows "Updating 4 pages…" from
`renderSummary(scope)` (core §H.5).
Connected exports built before the change and PHP exports keep firing the browser Purchase at order: the page lists
them with "Re-export to apply" (the PHP export contract is frozen).

### OPE-§20.4 Server side (`src/lib/orders/conversions.ts`, `src/lib/jobs/handlers/capi.ts`, P5)

1. **At creation** (`sendConversionsAfterResponse(conversion)` keeps its signature for `create.ts`):
   trigger `order` and risk < 70 → `enqueue("capi", Purchase per pixel)` + `drainOutbox({ storeId, kinds: ["capi"],
   budgetMs: 8000 })` in `after()`; trigger `confirmed` / `delivered` (or custom events on) → seal the conversion into
   `orders.capi_ctx` (envelope v2, scope store, purpose `capi-ctx`; it holds the client IP, UA, fbp, fbc, ttclid, ttp,
   source URL, contents and a hash of `items`).
2. **On transitions** (hook `int.capi`, `inTx`): confirm → `confirmed` and ship → `delivered` enqueue the events of
   §20.2 rebuilt from `capi_ctx` with `time` = `confirmed_at` / `delivered_at` and `value` = the current total; when
   the items hash changed since creation, `contents` collapses to one line (lead content id, qty) so no stale line
   price is sent.
3. Outbox item: `kind "capi"`, `topic` = event name, `targetId = "<platform>:<pixelId>"`, `dedupeKey =
   "capi:<platform>:<pixelId>:<orderId>:<event>"`, `pii: true`, payload `{ platform, pixelId, event, eventId,
   eventTime, conversion }`.
4. **Handler** (`maxPerTick 60`, `perStorePerTick 20`, `timeoutMs 8000`): loads the store's `tracking_secrets` and
   pixel library at send time (a token removed meanwhile → `done` with "no token"); **7-day guard** (OD20):
   `eventTime < now − 7 d + 1 h` → `cancelled`, order event `capi_stale`; builds the body (`metaPurchaseBody` with the
   event name swapped for custom events; `tiktokPurchaseBody` for Purchase only); test code only inside the page's
   active test window (today's rule); result → `done` / retry / `dead` (core backoff), `recordPixelHealth`,
   `integration_status (capi, "<platform>:<pixel>")`, order events `capi_sent` / `capi_failed`.
5. `capi_ctx` is nulled when every event the trigger and the custom-event setting can still produce is enqueued, or 8
   days after creation (job `ops.capi_ctx_purge`).

### OPE-§20.5 Event fields

- Purchase `event_id` = the order id (dedupes against the browser Purchase of old exports); ConfirmedOrder
  `<orderId>.c`; DeliveredOrder `<orderId>.d` (OD18). `action_source = "website"`, `event_source_url` from the
  context (`storeUrl`-based fallback, PIX-02).
- Meta custom events carry `currency` and `value` (the current total) and the same `user_data`; TikTok receives only
  the Purchase at the trigger in R1 (custom-event support **[verify]** before adding them).
- `CONVERSION_MAX_RISK` keeps gating trigger `order` only (OD19).

### OPE-§20.6 Secrets and health (IN-03)

Tokens and test codes keyed by (store, pixel) landed in R1.0 (T4, PIX-01); P5 adds the per-pixel
`integration_status` rows and the drawer's "Ad events" block (OPE-§12.7).

### OPE-§20.7 Screen (Pixels → **Server events** card, P5)

Trigger choice as three cards with consequences in plain words ("Ads learn from confirmed orders. The thank-you page
stops sending Purchase from the browser; your server sends it when an agent confirms."), the custom-events switch,
the manual-orders switch, per-page overrides (table: page, trigger), last result per pixel (sent / refused with the
platform's code / stale count this week), "Send test event" (existing `sendTestEvent`). Permission
`integrations.manage`; pending stores see the locked card.

### OPE-§20.8 TikTok offline events (IN-13, R3, D2)

Only after TikTok's `event_source` values, windows and processing delays are verified in TikTok's own docs (CO §6.4
cites third parties); then delivered events older than the web window may go to an offline event set. Meta offline
datasets (`physical_store`, ≤ 62 days) likewise R3+ **[verify]**.

### OPE-§20.9 Acceptance (IN-02)

(1) With trigger `confirmed`, a published thank-you page contains no pixel chunk and the landing page still does
(render-check fixture); (2) confirming the order enqueues exactly one Purchase per pixel with `event_id = orderId`;
(3) an event older than 7 days − 1 h is never sent and the timeline says why; (4) the risk gate applies only to
trigger `order`; (5) a test order sends nothing; (6) switching the trigger re-renders every live page of the store.

---

## OPE-§21. Telegram and operations notifications (IN-04)

### OPE-§21.1 Setup (`/app/<h>/integrations/telegram`, `integrations.manage`, feature `telegram`)

1. "Create a bot with @BotFather and paste its token here" (write-only field; validated with `getMe`).
2. **Find my chat**: the owner sends a message to the bot (or adds it to a group) and presses Find; the server calls
   `getUpdates` once (`limit 20`, `timeout 0`) and lists the chats seen (title, type); the owner picks one.
3. **Send test message**; success → `enabled: true`. Details level: masked (default: name, city, masked phone) or full
   (adds the full phone and the address; confirm dialog "Everyone in this chat will see customers' numbers").
4. The token is never shown again ("set / not set"), never logged, never in an outbox payload (read at send time).

### OPE-§21.2 Messages (store default locale; plain text, no emoji; amounts with `money.ts`)

| Message | When | fr example (masked level) |
|---|---|---|
| New order | each order, batched over `batchSeconds` | Nouvelle commande CMD-7K3Q9X · Pack Duo, 2 × Noir · 349,00 MAD · Samira · 06 •• •• 56 78 · Casablanca |
| New orders (batch) | ≥ 2 orders in the window | 5 nouvelles commandes (14:02-14:07) · 1 620,00 MAD, then one line per order (≤ 10) |
| Daily summary | `dailySummaryHour`, store tz | Résumé du 24 oct. : 42 commandes · 31 confirmées (78 %, n = 40) · 18 livrées · 2 refusées · 6 rappels en attente · Google Sheets : OK |
| Integration problem | Sheets failing > 15 min, CAPI token refused, outbox `dead` > 0 (once per incident per hour) | Google Sheets : les commandes n'arrivent plus dans votre feuille depuis 15 min. Ouvrez Store Gen pour voir pourquoi. |
| Profit alert (R1 lite) | `fin.alerts` | Coût par commande au-dessus de votre seuil depuis 2 jours : 48 MAD pour un seuil de 42 MAD. |
| Cash held (R2) | daily, > `cashHeldAlertDays`; **rev 3 (OD52): `statement` accounts only**, never "my carrier" set to `at_delivery` nor a `self` account | Amana détient 3 240,00 MAD depuis plus de 15 jours (12 colis). |
| Delivery problems (rev 3, OD48) | with the daily summary when ≥ 1 | 4 colis en tentative échouée (2 rappels faits, 1 reporté au 05/11). |

Test orders are prefixed "[TEST]". Rates follow the minimum-n rule (OD17); a missing figure is left out, never
estimated. ar and en texts in `src/lib/i18n/admin/<locale>/integrations.ts` (OPE-§N).

### OPE-§21.3 Delivery (`src/lib/jobs/handlers/telegram.ts`, P5)

Outbox kind `telegram`: `new_order` items carry `notBefore = now + batchSeconds`; the handler merges the claimed
`new_order` items of one store into one message (≤ 10 orders); `sendMessage` (`chat_id`, `text` ≤ 3,500 chars,
`disable_web_page_preview`) with the token read at send time; at most 1 message per second per chat and 20 per minute
per group (Telegram Bots FAQ, https://core.telegram.org/bots/faq, **[verify current limits at build]**); `429` with
`retry_after` → retry then; `401` / `403` / "chat not found" → `dead`, `integration_status (telegram)` failing, in-app
notification `int.telegram_failing` to owners and admins. `perStorePerTick 10`, `timeoutMs 6000` (the PHP export's
6 s, `order.php:2655`).

### OPE-§21.4 In-app notification kinds added by operations (core §I.4 `notify`, accepted OPE Q.13)

Declared as `kinds: NotificationKindDef[]` in `src/lib/notify/kinds/ops.ts` (P4) and `src/lib/notify/kinds/integrations.ts`
(P5), imported by the core registry (`{ kind, group, defaultSeverity, audienceHint, vars: z.ZodType, link?, tenant: true,
batch?: { windowMin } }`); titles and bodies are message keys `notify.<kind>.title` / `.body` in ar/fr/en (OD45,
`test:i18n-coverage`); `vars` carry ids, counts and codes only.

| Kind | Audience | Batch | `vars` | Link |
|---|---|---|---|---|
| `ops.new_orders` | store_role owner, admin, manager | 5 min | `{ count, sinceTime }` | `/orders?view=to-call` |
| `ops.callback_due` | the owning agent (user) | — | `{ orderId, dueTime }` | `/queue` |
| `ops.first_touch_breach` | managers | 30 min | `{ count, minutes }` | `/queue/board` |
| `ops.abandoned_claims` (rev 2) | managers | 60 min | `{ count }` | `/queue/board` |
| `int.sheets_failing`, `int.capi_failing`, `int.telegram_failing` | owners, admins | per incident per hour | `{ code, sinceMinutes, backlog? }` | `/integrations` |
| `int.delivery_dead` (rev 2) | owners, admins | 60 min | `{ kind, count }` | `/integrations#deliveries` |
| `fin.profit_alert` | owners, admins | — | `{ alertKind, key?, value, threshold, n }` | `/finance` |
| `fin.cash_held` (R2) | owners, admins, accountant | daily | `{ carrier, amountCents, days, parcels }` | `/finance/statements` |
| `ops.reveal_alarm` (R2) | managers, owners | per agent per hour | `{ agentId, count }` | `/queue/board` |
| `ops.import_done` (R2) | the uploader (user) | — | `{ runId, kind, ok, failed }` | `/shipping/imports/<runId>` |
| `ops.payout_ready` (R2) | the agent (user) | — | `{ payoutId, amountCents, period }` | `/queue/me` |
| `fin.period_closed` (R2) | owners, admins, accountant | — | `{ period }` | `/finance/exports` |

---

## OPE-§22. WhatsApp (IN-05, OP-23, OP-24)

### OPE-§22.1 Click-to-chat (R1, P5 builds, P4 uses)

Today the drawer has a bare `wa.me` link (`src/components/admin/orders/order-drawer.tsx:179`). R1: every WhatsApp
button opens `wa.me/<digits>?text=<rendered template>` through `revealPhone(why "whatsapp", templateId)` (OPE-§8.2),
which writes `whatsapp_sent` + `phone_revealed` and renews the claim. The agent records the outcome afterwards
(channel `whatsapp`).

### OPE-§22.2 Template kinds and built-ins (`src/lib/integrations/whatsapp/builtins.ts`)

| Kind | Used by | fr | ar (Darija-friendly) | en |
|---|---|---|---|---|
| `confirm` | agents (`W`) | Bonjour {customer_first_name}, ici {store_name}. Nous avons bien reçu votre commande {order_id} : {offer_label}, total {total}.[[ Livraison prévue {eta_text}.]] Répondez OK pour confirmer, ou dites-nous ce qu'il faut changer. | السلام {customer_first_name}، معاك {store_name}. توصلنا بالطلب ديالك {order_id}: {offer_label}، المجموع {total}.[[ التوصيل متوقع {eta_text}.]] جاوبنا ب OK باش نأكدو، ولا قول لينا شنو نبدلو. | Hello {customer_first_name}, this is {store_name}. We received your order {order_id}: {offer_label}, total {total}.[[ Delivery is planned {eta_text}.]] Reply OK to confirm, or tell us what to change. |
| `missed_call` | agents | Bonjour {customer_first_name}, nous avons essayé de vous appeler pour votre commande {order_id}. Quand pouvons-nous vous rappeler ? | السلام {customer_first_name}، عيطنا ليك على قبل الطلب ديالك {order_id}. إمتى نقدرو نعاودو نعيطو ليك؟ | Hello {customer_first_name}, we tried to call you about your order {order_id}. When can we call you back? |
| `address` | agents | Pour livrer votre commande {order_id}, pouvez-vous nous envoyer votre adresse exacte à {city} et un repère proche ? | باش نوصلو ليك الطلب {order_id}، صيفط لينا العنوان بالضبط ف {city} وشي علامة قريبة. | To deliver your order {order_id}, could you send us your exact address in {city} and a landmark nearby? |
| `delivery_day` | agents | Votre commande {order_id} est en route[[ et arrive {eta_text}]]. Merci de rester joignable. | الطلب ديالك {order_id} خرج[[ وغادي يوصل {eta_text}]]. خليك متوفر ف التيليفون عافاك. | Your order {order_id} is on its way[[ and arrives {eta_text}]]. Please stay reachable. |
| `shipped` (R2) | logistics | Votre commande {order_id} a été expédiée.[[ Suivi : {tracking_link}]] | الطلب ديالك {order_id} تصيفط.[[ التتبع: {tracking_link}]] | Your order {order_id} has shipped.[[ Tracking: {tracking_link}]] |
| `lead_recovery` | leads inbox (LP-06, P3) | Bonjour {customer_first_name}, vous avez commencé une commande de {offer_label} chez {store_name}. Voulez-vous que nous la finalisions ensemble ? | السلام {customer_first_name}، بديتي طلب ديال {offer_label} عند {store_name}. بغيتي نكملوه مع بعض؟ | Hello {customer_first_name}, you started an order for {offer_label} at {store_name}. Shall we finish it together? |
| `thank_you_confirm` | thank-you page (LP-04, P3; the shopper writes to the store) | Bonjour, je confirme ma commande {order_id}. | السلام، كنأكد الطلب ديالي {order_id}. | Hello, I confirm my order {order_id}. |
| `custom` | anyone with `callcenter.configure` | — | — | — |

Editing at `/app/<h>/integrations/whatsapp` → **Templates** (`callcenter.configure`, OD24): per kind and locale, the
same editor as scripts (variable chips, live preview on a recent order, reset to built-in), ≤ 1,000 characters.
The same page shows the store's confirmation number (from the `store` setting's `confirmation` block, LP-04) and the
calling hours (**rev 4:** from `callingWindowFor(scope)` with a link to `/team/callcenter`, the one editor, core D73;
"Hours not set yet" while `configured` is false, OD63) and, in R3, the Cloud API connection (`integrations.manage`).

### OPE-§22.3 Rendering rules

`renderTemplate` with `orderTemplateValues` (OPE-§7.1); locale = the order locale when the store has it, else the
store default; the URL is `https://wa.me/<E.164 digits>?text=<encodeURIComponent(text)>`; when the URL would exceed
2,000 characters the optional blocks are dropped first, then `units_text` is shortened with "…" (the order id always
stays) **[verify client limits]**. Text is plain (no markup), right-to-left safe (no bidi control characters added).

### OPE-§22.4 WhatsApp Cloud API confirmation bot (OP-23, R3, D2)

- The store connects its **own** WhatsApp Business Account (`whatsapp_cloud` secret: WABA id, phone number id,
  access token, app secret, verify token; `integrations.manage`); onboarding requirements (Embedded Signup, business
  verification, Tech Provider status) are **[unverified]** and must be checked in Meta's docs before the build.
- On creation (trigger setting `whatsappBot.on`), the outbox kind `whatsapp` sends an approved **utility template**
  with quick-reply buttons Confirm / Cancel / Change (template name and language configured by the store); `wa_messages`
  records message ids.
- Inbound webhook `/api/hooks/whatsapp/<hookKey>`: `GET` verification (`hub.verify_token`), `POST` signature
  `X-Hub-Signature-256` = HMAC-SHA256 with the app secret (constant-time), idempotent on `wamid`. Button replies move
  the order through `transitionOrder` with actor `bot`: Confirm → `confirmed` (no `confirmed_by`, no commission),
  Cancel → `cancelled` reason `customer_request`, Change → a callback for the queue (due now) with the note "Customer
  wants a change". Free text replies become `note` events (masked in the timeline) and stay in the call queue.
- The order never leaves the call queue: sending the template sets `due_at = now + whatsappBot.timeoutMinutes`
  (default 60, inside the window rules), so agents call only customers who did not answer; a reply before then moves
  the order at once, and a failed send clears `due_at` immediately.
- Pricing is Meta's per delivered template (Morocco has its own rate line since 2026-10-01, amounts
  **[unverified]**, CO §2.7); the integration page shows "Messages are billed by Meta to your WhatsApp account."

### OPE-§22.5 High-risk confirmation (OP-24, R3, D2)

Only with OP-23 connected and for orders with `risk_score ≥ ops.otpRiskMin` (default 70): the bot's template asks the
customer to reply "1" to confirm; a "1" moves the order to `confirmed` (actor `customer`, event meta `otp: true`).
It never blocks or delays the call path.

---

## OPE-§23. Signed outbound webhooks (IN-07, R2, S5; R-D25, SE-07)

### OPE-§23.1 Events

`order.created`, `order.updated` (edits), `order.confirmed`, `order.cancelled` (cancelled, fake, duplicate,
unreachable; with the reason), `order.shipped`, `order.delivered`, `order.returned` (refused, returned, lost; with the
state), `remittance.imported` (S3), `ping` (test). `lead.created` joins through the `onLeadCreated` hook of the R2
contract step (core §K.4, accepted Q.18).

### OPE-§23.2 Payload v1

```ts
export interface WebhookEnvelopeV1 { id: string /* "evt_" + outbox id */; type: WebhookEvent; created_at: string; store: { handle: string }; data: { order?: OrderWebhookV1; remittance?: RemittanceWebhookV1 } }
export interface OrderWebhookV1 {
  id: string; created_at: string; status: OrderStatus; states: OrderStates; source: string; is_test: boolean;
  customer: { name: string; phone: string /* E.164 when include_phone, else masked */; city: string | null; address: string | null /* only with include_phone */; locale: string | null };
  items: { product: string; offer_label: string; units_text: string; qty: number };
  totals: { currency: string; subtotal_cents: number; shipping_cents: number; adjust_cents: number; total_cents: number; total: string /* "349.00" */ };
  utm: Record<string, string> | null; page: { id: string; slug: string } | null; cancel_reason: string | null;
  tracking?: { carrier: string; number: string; url?: string };   // R2 shipments
}
```

Stable field names; additions only; a breaking change means `v2` with a per-endpoint version choice.

### OPE-§23.3 Signing (Standard Webhooks)

Headers `webhook-id` (the outbox item id, stable across retries: the receiver's dedupe key), `webhook-timestamp` (unix
seconds), `webhook-signature: v1,<base64(HMAC-SHA256(secret, "<id>.<timestamp>.<body>"))>`; during a rotation (24 h,
`secret_prev_until`) two space-separated signatures. Secret = `whsec_` + base64 of 24 random bytes, shown once,
sealed in `webhook_endpoints.secret_enc` (envelope v2, purpose `webhook-secret`).

### OPE-§23.4 Delivery (`src/lib/jobs/handlers/webhook.ts`)

Outbox kind `webhook` (one item per endpoint per event, `dedupeKey = "wh:<endpointId>:<event>:<orderId>:<rev>"`),
`maxPerTick 100`, `perStorePerTick 20`, `timeoutMs 10000`. The SSRF guard (`src/lib/security/ssrf.ts`, SE-07): https
only, port 443, DNS resolved and every address refused if private, loopback, link-local, CGNAT, multicast,
unspecified or IPv4-mapped private (IPv4 and IPv6), the connection pinned to the checked address, no redirects,
response body read ≤ 4 KB. 2xx → `done`; 410 → endpoint `disabled`; other failures → core backoff, `dead` after the
ladder; `failing_since` set; paused automatically after 3 days failing (notification to owners).

### OPE-§23.5 Screen (`/app/<h>/integrations/webhooks`, `integrations.manage`, feature `webhooks`)

List (URL host, events, status, last delivery), Add (https URL, events, "Include phone and address"), the secret shown
once with Copy, Send test (`ping`), delivery log (the endpoint's view of the store deliveries log of OPE-§28: event,
status code, latency, attempts, next try; Replay for `dead` through the core's `replay(ctx, id)`), Rotate secret,
Pause, Delete. ≤ `webhooks_max` endpoints (core §A.4).

---

## OPE-§24. Anti-spam settings and Turnstile (IN-06)

- The platform Turnstile widget on the apex hostname covers every store subdomain (core §D.10 `platform_turnstile`);
  the public order path uses it (T3).
- `/app/<h>/settings/anti-spam` (P5 [Q.17], `settings.read`; edits `settings.write`): "Bot protection: on (platform)"
  with the share of orders verified in the last 24 h; optional store keys (`turnstile` store override, needed for
  custom domains in R3; secret write-only); the honeypot and "orders from exports without the check are marked To
  check" explanations (`UNPROTECTED_MIN_SCORE`, `src/lib/orders/risk.ts:18`); links to the blocklist and the risk
  explanation.
- Health: a Turnstile failure share above 20% of orders in a day (n ≥ 20) adds a Store Health issue (OPE-§27.2).

---

## OPE-§25. Later integrations (IN-08, IN-10 … IN-14; OP-28, OP-29, TN-14, AC-12)

### OPE-§25.1 Store API keys and REST (IN-10, R3, D2)

- Key format `sgk_<prefix 8>_<32 random bytes base64url>`, shown once; `api_keys.key_hash = sha256(key)`, prefix kept
  for display; scopes `orders.read`, `orders.write_status`, `orders.create`, `products.read` (store mode); created and
  revoked by `integrations.manage` (entitlement `api_keys`), audited.
- Endpoints on the platform host only (area `api-v1`, core §C.3 and the Worker 404 list §C.5; accepted Q.19),
  `Authorization: Bearer <key>`, no cookies, JSON:
  `GET /api/v1/orders?updated_since&state&limit≤100&cursor`, `GET /api/v1/orders/<id>`,
  `POST /api/v1/orders/<id>/status` (`{ legacy }` or `{ ship }`, through `applyExternalStatus`, source `api`),
  `POST /api/v1/orders` (the manual-order input with a page key; source `api`; full validation and pricing),
  `POST /api/v1/orders/<id>/tracking` (R2 shipments). Responses use `OrderWebhookV1` (masked phone unless the key has
  `orders.read` + "include phone").
- Limits: 600 requests per 10 minutes per key (`s:<sid>:api:<keyPrefix>`); `last_used_at` written ≤ 1 per minute.
  Zapier / Make polling triggers use `updated_since` (index `orders_updated_idx (store_id, updated_at)` [Q.19]).

### OPE-§25.2 Catalog feeds (IN-11, R3, D2; store mode)

`/s/<h>/feeds/<key>/<platform>.<ext>` (core §C.4.1) with `meta.csv`, `tiktok.csv`, `google.xml`; the key is the
`feeds` secret setting (rotatable; a rotated key answers 404). Fields **[confirm against each platform's current
documentation before building]**: id, item_group_id (variants), title, description (plain text), availability (`in
stock` for an active product without stock tracking or with stock, `out of stock` when tracked at 0), condition
`new`, price (the lead offer price from `src/lib/page/pricing.ts`, store currency), sale price only with a genuine
compare-at, link (`storeUrl`), image_link (`mediaUrl`), brand (the product's brand field, else the store name).
Cached 1 hour per store (render cache key with `catalog_version`); `noindex`.

### OPE-§25.3 Product CSV import (IN-12, R3, D2; store mode)

Importer kind `products` (OPE-§18): Shopify CSV first (rows grouped by `Handle`; `Title`, `Body (HTML)` sanitised to
the store's rich-text subset, `Option1..3 Name/Value` → Offers v2 option groups, `Variant Price` → item price,
`Variant Compare At Price` only when higher, `Variant SKU`, `Image Src` fetched through the SSRF guard (https, ≤ 10 MB,
sniffed image types) into the media pipeline with per-store ids and quota, `Status` → draft unless active).
WooCommerce and YouCan formats only from real sample files. Reviews, ratings and sales counts are never imported.

### OPE-§25.4 E-mail (IN-08, R2, S5 with platform.md)

Operations uses the core Mailer (core §B.10) for two opt-in messages only: the daily summary by e-mail (same content
as Telegram) and "payout ready" to agents. Template ids `digest` and a new `payout_ready` [Q.13].

### OPE-§25.5 IN-14 bundle (later)

SMS gateway adapter, Snap CAPI and GA4 Measurement Protocol server events, Apps Script near-real-time sheet push
(`/api/hooks/sheets/<storeKey>`), Google OAuth sheet picker, native Zapier / Make apps, returns as negative events.
Each waits for the base to be used and for the owner's demand.

### OPE-§25.6 Not built (later, each gated)

| Id | Gate |
|---|---|
| OP-28 opt-in cross-store refusal network | Law 09-08 / CNDP legal review; explicit opt-in; aggregate hashed counts only (CO §2.6) |
| OP-29 VoIP click-to-call, number masking, recordings | a telephony provider chosen by the owner; calls would write `call_attempt` with duration |
| TN-14 external confirmation team | an outsourced call center invited as a team with its own manager; reuses roles, queues, rules |
| AC-12 ad-spend APIs, multi-currency, FEC | OAuth app reviews per platform; a second currency per store |

---

## OPE-§26. Test orders (SF-05)

- Set by the public order path when the request carries the store's signed test token (`?sg-test=<token>`,
  `hmac(exp, "test-order:<storeId>")`, 2 h; the address card's "Open a test order" link, landing.md / T3; core D54,
  accepted OPE Q.12). The public path also sets `sheet_status = 'disabled'`, skips the CAPI enqueue and
  `bumpOrderStats`, and renders the test page without pixel scripts and with a "test" banner (`renderTestDocument`,
  core §C.4.1). Operations never sets or clears the flag.
- Consumed everywhere in operations (OD31): TEST chip in queue, lists and drawer (text, not colour alone); claimable
  and confirmable like any order (the demo path, RF §4 rows 2:15-2:50); the risk score runs (the demo asserts risk < 70
  for a never-used phone) and the queue priority applies; excluded from KPIs, the board's rates and tiles, finance,
  commissions, the profit alerts, `riskBandOutcomes`, `attemptStats`, the learners and every dashboard total; customer
  `test_count` only; never appended to Sheets; no ad event; Telegram messages only with `notifications.telegram.testOrders`
  and prefixed "[TEST]"; webhooks (R2) carry `is_test: true` so a receiver can filter.
- "Delete test orders" (owner, admin; `settings.write`, one permission everywhere in this document): deletes the
  store's orders with `is_test = 1` older than 1 hour and their `order_events` (`orders_store_test_idx`), recomputes
  `test_count`, `audit("orders.test_deleted", { count })`. `housekeeping` deletes test orders older than 30 days
  (core §H.11). No other order can be deleted.
- Acceptance (the operations half of `test:test-orders` and `qa:wow-demo`): a test order claimed by `N` shows the chip;
  `C` writes `phone_revealed`; `1` confirms; `agent_stats_daily`, `finance_daily` (R2), Profit lite and the board's
  rates read exactly the same before and after; the Sheets fake endpoint and the mocked CAPI receive nothing; the
  Telegram mock receives "[TEST] …" only when the switch is on.

---

## OPE-§27. Data for the platform, Store Health, pulse, exports, lifecycle and insights

Everything in this section is a **read API over the store's own rows**, deterministic, with its `n`, cells under 5
orders suppressed, test and honeypot orders excluded, no customer field in any return value (OD43). Console readers
take the console's `platformScope` (lint L6, read-only); health, pulse and insight readers take the `systemScope` or
the viewer's scope. Every function below is a **P0 frozen stub** (core §K.2 "operations (P4)" and "integrations (P5)")
so P1, P2, P3 and P7 build against it before P4 merges.

### OPE-§27.1 Console reads (PL-07 Orders tab, PL-10, PL-05; `src/lib/orders/profile.ts`, P4)

```ts
export type Kpi = { value: number; n: number; min: number } | { n: number; min: number; insufficient: true };   // a rate never travels without its n (OD38)
export interface OrderKpis { window: "today" | "7d" | "28d"; placed: number; confirmed: number; delivered: number; decided: number;
  confirmationRate: Kpi; deliveryRate: Kpi; firstTouchP50Min: Kpi; unreachableRate: Kpi; riskyShare: Kpi /* risk ≥ 50 ÷ placed */;
  lastOrderAt: string | null; computedAt: string }
export function orderKpis(scope: StoreScope, window: OrderKpis["window"]): Promise<OrderKpis>;                 // health inputs, console Overview, dashboard tiles; scopedCache("ops-kpis") 60 s
export function queueCounts(scope: StoreScope): Promise<{ toCallNow: number; callbacksDue: number; waitingRetry: number; firstTouchBreaches: number; abandonedToday: number; liveAgents: number; oldestCallbackOverdueMin: number | null;
  deliveryRescue: number; oldestRescueMin: number | null; toShip: number; oldestToShipDays: number | null; holds: number; nextHoldDay: string | null; inboundLookupsHour: number }>;   // board tiles, Today brief; rev 3 fields: OD48, OPS-29, OD49, OD53
export function listOrdersForConsole(scope: StoreScope, q: { state?: ConfirmState | ShipState; from?: string; to?: string; after?: string; limit?: number /* ≤ 50 */ }): Promise<{ items: ConsoleOrderRow[]; next: string | null }>;   // ConsoleOrderRow: id, created, states, status, total, city, firstName + initial, phoneMasked, risk, isTest; never address, note or e-mail
export function getOrderForConsole(scope: StoreScope, orderId: string): Promise<ConsoleOrderDetail | null>;     // + items text, timeline (masked), integration states; still masked
export function recordPlatformReveal(ctx: PlatformCtx, scope: StoreScope, orderId: string, reason: string): Promise<{ e164: string } | null>;   // pii.reveal ↑ (core §A.3.3): writes `phone_revealed` with actor_kind "platform" and audit `platform.pii.revealed`; the only way platform code sees a phone
export function orderRiskMix(scope: StoreScope, days: 28): Promise<{ low: number; check: number; high: number; honeypot: number; n: number }>;   // signup-risk and store-risk signals (platform.md), bands only
export function searchOrders(scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }, limit: 8): Promise<SearchHit[]>;   // ⌘K provider body (OPE-§27.7): id prefix or ≥ 4 phone digits or an exact tracking_ref (rev 3); agents: their queue only, plus the exact-phone inbound lookup of OPE-§5.7 when q has ≥ 8 digits (rev 3, OD53); results masked
```

Agents' aggregates for the console (`agents: { count, liveNow }`), `integration_status` rows, outbox depth and dead
items per kind (`outboxSummary(scope)`, core §H.5, P8) complete the console's Overview; R2 adds cash held per carrier
bucket and remittance ageing. No name beyond first name + initial, no phone, address or note (core §F.11).

### OPE-§27.2 Store Health rules (SF-03, PL-18; core D53, §I.7)

Operations contributes two rules files to the health engine, each exporting `rules: HealthRule[]` in the core's shape
(`{ id, group, minN?, release, collect(scope, inputs) }`, `collect` ≤ 40 ms, read-only, scoped; `HealthInputs` carries
`orderKpis` for 28 d, `queueCounts`, `integrationHealth`, `sheetsBacklog` and the attempt aggregates). Each rule
returns a `HealthIssue` with `evidence { metric, value, baseline?, window, n }`, a `fix` (a link into the owning screen
or an `actionId`) and a `text` message key in ar/fr/en, or `null` when silent.

| Rule id (`src/lib/health/rules/ops.ts`, P4) | Group | Sev. | Rule (store data only; silent below its minimum n) | Fix |
|---|---|---|---|---|
| `ops:first_touch` | operations | 2 | first-touch p50 (28 d) > `firstTouchTargetMin` window minutes, n ≥ 30 | link `/team/callcenter` (window, ladder) |
| `ops:untouched` | operations | 3 | orders older than 2 h of window time without an attempt (now), ≥ 1 | link `/queue/board` |
| `ops:no_agent` | operations | 3 | callable orders for > 30 window minutes with no live agent | link `/team/agents` |
| `ops:unreachable_rise` | operations | 2 | unreachable rate 7 d > 28 d + 10 points, n ≥ 30 | link `/team/callcenter` (ladder) |
| `ops:abandoned` (rev 2) | operations | 1 | abandoned claims (7 d) > 15 % of claims, n ≥ 20 | link `/queue/board` |
| `ops:callbacks_overdue` (rev 2) | operations | 2 | ≥ 3 callbacks overdue by > 60 min now | link `/queue/board` |
| `ops:reveals` (R2) | operations | 2 | reveal alarm fired in the last 7 days | link `/queue/board` |
| `ops:cash_held` (R2) | operations | 3 | collected-not-remitted older than 30 days (**`statement` accounts only**, OD52) | link `/finance/statements` |
| `fin:costs_missing` (rev 2, flag `finance_lite`) | operations | 1 | ≥ 1 live page with orders in 28 d and no `product_costs` row (**rev 3:** per SKU; an item whose SKU has a cost is covered) | link `/finance?tab=costs` |
| `ops:to_pack_aging` (rev 3, OPS-29) | operations | 2 | ≥ 3 confirmed orders with ship ∈ {to_pack, packed}, no hold, older than 48 h of window time | link `/orders?view=to-pack` |
| `ops:hold_passed` (rev 3, OD49) | operations | 2 | ≥ 1 held order whose `ship_after` passed more than 48 h ago and is still to_pack / packed | link `/orders?view=to-pack` |
| `ops:delivery_rescue` (rev 3, OD48) | operations | 2 | ≥ 3 orders in the delivery lane for > 4 window hours without a rescue call | link `/queue/board` |
| `ops:sheet_agents_unmapped` (rev 3, OD54) | operations | 1 | ≥ 1 sheet label with ≥ 20 confirmations in 28 d and no mapped member (a suggestion) | link `/integrations/sheets#agents` |
| `fin:settlement_check` (rev 3, OD52, flag `finance_lite`) | operations | 1 | ≥ 20 delivered orders and `accounting.myCarrier.confirmedAt` is null | link `/finance?tab=costs#carrier` |
| `fin:fee_gap` (rev 3, OPS-13, flag `finance_lite`; rev 4 narrowed) | operations | 1 | among the top-5 cities by delivered orders (28 d, n ≥ 10 each), the median `orders.shipping` charged is below the city's **carrier rate** (`carrier_rates`, "my carrier" or the most used account) by ≥ 10 currency units: the margin leak. **rev 4:** the zone-fee vs page-fee comparison belongs to landing's `landing:fee_mismatch` (core §I.7, D75) and is not repeated here, so one cause never raises two issues | link `/finance?tab=costs#carrier` |
| `fin:ad_rate_missing` (rev 3, OD56, flag `finance_lite`) | operations | 1 | ≥ 1 ad-spend day in a foreign currency without a rate in the last 14 days | link `/finance?tab=ads` |

| Rule id (`src/lib/health/rules/integrations.ts`, P5) | Group | Sev. | Rule | Fix |
|---|---|---|---|---|
| `int:sheets_backlog` | integrations | 3 | oldest pending order older than `max(15, 5 × ceil(activeSheetsStores / 16))` minutes while connected (rev 4: the core §H.5 scaled threshold, ENGC-33, instead of a flat 15 min that would fire permanently past 16 active stores) | link `/integrations/sheets` |
| `int:capi_failing` | integrations | 2 | a pixel with failures in 24 h and no success | link `/integrations/pixels` |
| `int:telegram_failing` | integrations | 2 | Telegram `failing` | link `/integrations/telegram` |
| `int:delivery_dead` (rev 2) | integrations | 2 | ≥ 1 `dead` outbox item of the store | link `/integrations#deliveries` (Replay) |
| `int:turnstile` | integrations | 1 | verification failures > 20 % of a day's orders, n ≥ 20 | link `/settings/anti-spam` |
| `conv:trigger_hint` | conversion | 1 | trigger `order` while ≥ 50 % of orders are confirmed by calls (n ≥ 30): a suggestion, never an error | link `/integrations/pixels#server-events` |

The engine (P1) owns caps, snoozes and the score; these rules never read another store and never return a customer
field (`test:health` runs them on a two-store fixture). `markHealthDirty(storeId)` is called by operations after a
calling-window change, a Sheets connect / disconnect, a trigger change and a `dead` outbox item.

### OPE-§27.3 Pulse contributors and the board endpoint (OD33; core D57, §I.4)

- `src/lib/pulse/contributors/ops.ts` (P4): `contribute(scope, viewer): Promise<{ newOrders: number /* since the
  viewer's last pulse cursor */; dueCallbacks: number /* agents: theirs; managers: all */; queueNow: number }>` and
  `src/lib/pulse/contributors/integrations.ts` (P5): `{ syncFailed: number /* sheet_status = failed + dead outbox items */ }`;
  each ≤ 50 ms, store parts cached 5 s per store, the per-user part (`dueCallbacks` for agents) fresh; a failure omits
  the keys (core §I.4). `opsPulse(scope, ctx)` (the P0 stub name of core §K.2) is the function both contributors call.
- `GET /api/app/<h>/ops/state?view=board` (`storeGuard`, `orders.read_all`): the board payload (tiles from
  `queueCounts`, agents table, best-hours strip); ETag = hash of the payload, `304` when unchanged, 5 s per-store
  cache. `view=queue` is kept for the "My callbacks" list and the end-of-day line (`agents.self`); the presence
  heartbeat is `POST /ops/presence` (OD33), never a side effect of a GET.

### OPE-§27.4 Store export ZIP (core §F.9) and purge

Operations provides the CSV writers (`src/lib/orders/export-zip.ts`, P4; R2 additions by S3/S4) for: `orders.csv`
(every column incl. the new ones, phones full), `customers.csv`, `order_events.csv` (meta as JSON),
`agent_stats_daily.csv`, `message_templates.csv`; R2: `shipments.csv`, `remittances.csv`, `remittance_lines.csv`,
`ad_spend.csv`, `expenses.csv` (+ `receipts/`), `product_costs.csv`, `agent_earnings.csv`, `payouts.csv`,
`finance_daily.csv`. Never: the Telegram token, carrier credentials, webhook secrets, `capi_ctx` [Q.20]. The purge
walks the table registry (core §F.9) and also deletes `DATA_DIR/{imports,receipts}/<storeId>/` [Q.14].

### OPE-§27.5 Store lifecycle effects (core §A.5.3)

- `restricted`: the call center, Sheets push / pull, CAPI and Telegram keep working for existing orders; the public
  order API answers `unavailable`, so the queue drains and the board says "Store restricted: no new orders arrive".
- `suspended` / `closed`: the dashboard is read-only, so outcomes, edits and assignments are refused by the seam; the
  outbox handlers skip the store except the core's final Sheets push.
- `transitionStore` releases agent leases on `restricted`, `suspended` and `closed` (core §A.5.1) by calling
  `releaseAllLeases(scope)` (P4, P0 stub): `UPDATE orders SET claim_token = NULL, lease_until = NULL WHERE store_id = ?
  AND claim_token IS NOT NULL`, one `released` event (`why: "store_state"`, actor `system`) per released order; agents
  on a restricted store re-claim on their next `N`.

### OPE-§27.6 Aggregates for insights and learners (SF-11, AI-17, AI-23; `src/lib/callcenter/aggregates.ts`, P4)

The R1 Today brief is a template line from `opsPulse` and `queueCounts` (core §I.4, no model). The R3 digest (AI-17)
and the best-time learner (AI-23) read **only** these deterministic decompositions (RA §4.2, §9.15; OD43); the R3
contract step (core §K.5, AI R23) freezes their signatures from this section:

```ts
export type AggDim = "page" | "city" | "source" | "agent" | "offer" | "campaign" /* utm_campaign */ | "angle" /* utm_content */ | "carrier" /* R2 */ | "hour" | "weekday";
export interface AggCell { key: string; placed: number; confirmed: number; delivered: number; refused: number; cancelled: number; unreachable: number; fake: number; n: number;
  confirmationRate: Kpi; deliveryRate: Kpi; delta?: { prevPlaced: number; prevDeliveryRate: Kpi } }
export function opsAggregates(scope: StoreScope, q: { from: ISODate; to: ISODate; dims: AggDim[]; compareWith?: "previous" }): Promise<{ cells: Record<AggDim, AggCell[]>; suppressed: number /* cells under 5 orders */; computedAt: string }>;
export function attemptStats(scope: StoreScope, q?: { days?: 90 }): Promise<{ weekday: number; hour: number; attempts: number; contacted: number }[]>;   // OD44; contacted = outcome ∉ {no_answer, busy, switched_off}; raw counts (the R3 learner needs them); every UI applies the n ≥ 30 rule before showing a rate
export function cancelReasonMix(scope: StoreScope, days: 28): Promise<{ reason: CancelReason; count: number; share: Kpi }[]>;
export function returnReasonMix(scope: StoreScope, days: 28, by?: { dim: "city" | "carrier" | "agent"; key: string }): Promise<{ reason: ReturnReason | null /* null = no reason given */; count: number; share: Kpi }[]>;   // rev 3 (OD50): refused + returned + lost of the window; the city_refusal alert, the R3 quality review and the refusal-cost table read it
export function riskBandOutcomes(scope: StoreScope): Promise<Record<"check" | "high", RiskBandOutcome | null>>;   // OD39, OPE-§10.2
```

Rules: **city keys are `CityKey` slugs** (`orders.city_key`; an order whose `city_key` is NULL, "Autre" or an
unmatched free text, aggregates under `"*"`, the same key as the catch-all zone, rev 4 for D68 / D75 consumers such as
landing's `zones.feeMismatchTop5`); agent keys are the member's display name as a label and the user id as the key
(pseudonymous enough for the store's own owner, never shown cross-store); no phone, name, address or note appears in any cell; `campaign` and
`angle` keys are the UTM values the order carries (`orders.utm`, `src/lib/db/schema.ts:286`), so the Campaign Kit's
per-angle results (RF §1.1 step 5) and the Profit lite cohort read the same cells; windows are store-local days; the
functions are cached 5 min per (store, query hash) and run ≤ 400 ms on a store with 50,000 orders (one grouped query
per dim over `orders_store_created_idx` / `oe_type_idx`; `test:ops-db` measures it on a seeded store).

### OPE-§27.7 ⌘K search provider and commands (UX-02; core §I.3)

- `src/lib/admin-data/search/ops.ts` (P4) exports `provider: SearchProvider` with `kinds: ["order", "customer"]`:
  an order id prefix (`^[A-Z0-9]{2,8}-`) or ≥ 4 phone digits or a name fragment (≥ 3 chars) → `searchOrders` and a
  customers lookup; agents get their own queue only; results carry masked phones; ≤ 120 ms budget (the core's).
- `src/components/admin/shell/commands/ops.ts` (P4): `Next order` (`N`, agents), `Open a test order` (owners; mints
  the P3 test link), `Export orders` (`orders.export`), `New manual order` (`C` → Create menu), `Open calls now`
  (`callcenter.configure`); `commands/integrations.ts` (P5): `Sync Sheets now`, `Send test event`, `Replay failed
  deliveries` (opens OPE-§28 filtered on `dead`). Every command declares its permission and release and runs through
  the same action the screen uses.

---

## OPE-§28. Integration health, deliveries log and replay (OD40; core D24, §H.1, §H.5)

### OPE-§28.1 One page per store: `/app/<h>/integrations` (`integrations.manage`, or `callcenter.configure` read-only)

| Block | Content | Source |
|---|---|---|
| Health strip | one tile per connected target (Sheets, each pixel's server events, Telegram; R2 each webhook endpoint and carrier account; R3 WhatsApp Cloud): state `ok` / `warn` / `failing` / `off` as text + token colour (success / warn / destructive, never a lone dot), backlog, oldest pending age, last ok, last error in plain words | `integration_status` through `integrationHealth(scope)` (P5 P0 stub, core §K.2): `Promise<IntegrationHealthRow[]>` = the rows with `lastErrorCode` mapped to a message key |
| Sheets backlog | pending appends, dirty updates, failed rows, last 20 runs (OPE-§19.8) | `sheetsBacklog(scope)` (P5 P0 stub): `Promise<{ pending: number; dirty: number; failed: number; oldestPendingAt: string \| null; lastRunAt: string \| null }>` |
| **Deliveries** (`#deliveries`) | the last 100 outbox rows of the store (kinds `capi`, `telegram`; R2 `webhook`, `carrier`; R3 `whatsapp`; `mail` never shown to tenants), filters by kind and state, columns: when, kind, topic, target (pixel last 4, chat label, endpoint host, carrier label), state, attempts, next try, last status / error in plain words, a **payload summary** (order id, event name, amount; never the sealed payload, never a phone) | `outboxSummary(scope)` (core §H.5, P8) + a scoped list `listDeliveries(scope, q)` (P5, `src/lib/integrations/deliveries.ts`: `SELECT … FROM outbox WHERE store_id = ? …`, `ob_store_idx`) |
| Row actions | **Replay** on `dead` rows of every kind → the core's `replay(ctx, id)` (dead → pending, audited `integrations.outbox.replayed` with `{ kind, topic, outboxId }`, second-round request OPE-§Q.26); **rev 4 (core §H.1 re-send rule, ENGC-29):** **Send again** on `done` rows of `telegram` and (R2) `webhook` only, through the same `replay` (the core accepts `done` for those two kinds, never for `capi` or `mail`); revision 3's "Replay on `cancelled` CAPI items" is withdrawn (a CAPI item is cancelled by the 7-day guard, so a replay would be cancelled again); bucket `s:<sid>:replay:<uid>` 30 / h; "Replay all dead of this kind" ≤ 50 rows per call | core `replay` |
| What to check | per failing kind the three most likely causes in the owner's words (token revoked, sheet not shared, chat not found, endpoint 410) with the fix link | `lastErrorCode` → `int.cause.<code>` keys |

Rules: a `dead` replay of a `capi` item still passes the 7-day guard at send time (OPE-§20.4); a `done` CAPI or mail
row is never re-sent (the core refuses it: an ad platform would count it twice); "Send again" on a `done` Telegram or
webhook row is the core's deliberate re-send (rev 4, core §H.1), audited like a replay, and a re-sent Telegram
`new_order` batch is one message marked "(renvoi)"; a replay of a test order's item is impossible because none was
enqueued; a second click on the same row while it is `pending` is a no-op. The page polls the pulse's `syncFailed` and refreshes the deliveries list on change (one poller per
browser, core D57). Agents never see this page (OD12); `callcenter.configure` holders see the health strip and the log
without Replay.

### OPE-§28.2 Health rows: who writes what, when

| Kind | Writer | `state` rule | `backlog` / `oldestPendingAt` | Throttle |
|---|---|---|---|---|
| `sheets` (`target_id = ''`) | `pushStore` (P5) | `ok` after a run with no error; `warn` when the oldest pending > 5 min; `failing` when 3 consecutive runs failed or the breaker opened for this store; `off` when disabled | pending + failed appends; oldest `created_at` among them | ≤ 1 write per minute per row (core §J.2 `test:integrations-db`) |
| `capi` (`target_id = "<platform>:<pixel>"`) | the `capi` handler | `ok` on a 2xx; `warn` on retryable failures; `failing` when `failures ≥ 3` and no success in 24 h | pending items of the target; oldest `next_at` | same |
| `telegram` | the `telegram` handler | `failing` on 401 / 403 / chat not found; `warn` on 429 | pending items | same |
| `webhook` (R2, `target_id` = endpoint id) | the `webhook` handler | `failing` when `failing_since` is set; `off` when paused | pending items | same |
| `carrier` (R2 / R3) | imports, `carrier.poll`, the `carrier` handler | `failing` when the last import or poll errored | shipments without an event for > 48 h | same |
| `whatsapp` (R3) | the `whatsapp` handler | per Meta error class | pending items | same |

Every state change to `failing` notifies once per incident per hour (`int.*_failing`, OPE-§21.4), marks health dirty
(`int:*` rules, OPE-§27.2) and appears in the console store profile (OPE-§27.1). `integrationHealth(scope)` is the one
read every surface uses (the strip, the dashboard tile pattern of `sheet-health.tsx`, the console, the health rules).

### OPE-§28.3 Acceptance

(1) A dead CAPI item replayed from the page is sent once and ends `done`; replaying it again is a no-op with the same
audit row count. (2) A revoked Telegram token turns the row `failing` within one tick, notifies once, and the page names
the cause and the fix. (3) The deliveries list of store B never shows store A's rows (`test:tenancy` case). (4) No row
of the list contains a phone, a name or a sealed payload (canary test). (5) `integration_status` is written at most
once per minute per row under a flood of 1,000 outbox results (`test:integrations-db`).

---

## OPE-§J. Jobs and time budgets (core §H.2 runner)

Jobs live in the track files `src/lib/jobs/tracks/{ops,integrations,money,logistics,messaging}.ts`; outbox handlers in
`src/lib/jobs/handlers/<kind>.ts`. Budgets are the core's **rev 3 slot table** (core §H.2: the operations slots are
unchanged from rev 2 — `sheets.push` 18 s, `sheets.pull` 12 s, outbox 13 s, slot 5 11 s, slot 6 8 s, slot 7 5 s,
housekeeping 4 s — inside the 95 s guaranteed of the 100 s tick, with the rev 3 tick lock, `ctx.yield()` and lag
sampling); this table repeats them so no job here claims more than its slot. `test:jobs` (core §J.1) fails when the
registered budgets exceed 95 s or a job runs 2 s of CPU without a `yield()`.

| Job | Track | Every | Budget (core slot) | Per-store fairness | Does |
|---|---|---|---|---|---|
| `sheets.push` | P5 | tick | **18 s** (slot 1) | **oldest pending order first** over the `pending_sheets` predicate (rev 4, core §H.2 rev 3), ≤ 3 calls per store, platform bucket `p:sheets:sa` 50 / 60 s (≈ 16 stores per tick) | OPE-§19.5 |
| `sheets.pull` | P5 | tick | **12 s** (slot 2) | `s:<sid>:sheets:pull` 1 / 290 s, round-robin; stores served by slot 1's read are skipped | reads for stores with a due pull and no push work |
| `sheets.bind_legacy` | P5 | tick | ≤ 50 ms (slot 7, 5 s shared) | — | OPE-§19.2, a no-op once done |
| outbox `capi`, `telegram` | P5 | tick (+ `after()`) | slot 3 (**13 s** shared with every handler) | `perStorePerTick` 20 / 10, `timeoutMs` 8,000 / 6,000 | OPE-§20.4, §21.3; health rows OPE-§28.2 |
| `ops.presence` | P4 | tick | 1 s (slot 7) | one statement (`// tenancy: platform presence sweep`) | silent > 15 min → offline, releases the claim (`released`, why `break`) |
| `ops.rollup` | P4 | daily 02:40 | slot 6 (**8 s** shared; daily jobs spread over the 03:00-04:30 ticks, ≤ 2 per tick) | cursor, ≤ 1 s per store | OPE-§14.4 (incl. `abandoned`) |
| `ops.customers_reconcile` | P4 | daily 03:10 | slot 6 | cursor, ≤ 5,000 customers per store per night | OPE-§9.1 |
| `ops.capi_ctx_purge` | P5 | daily 03:20 | slot 8 (`housekeeping`, **4 s**) | per store, `orders_store_created_idx` range 8-9 days old | OPE-§20.4 step 5 |
| `int.telegram_daily` | P5 | hourly | ≤ 2 s (slot 7) | stores whose local hour = `dailySummaryHour` | enqueue the summary (dedupe per day) |
| `fin.alerts` | P4 (R1 lite) | daily 04:00 | slot 6 | cursor, stores with `finance_lite` | OPE-§16.2 |
| `fin.rollup` | S3 (R2) | daily 03:40 | slot 6 | cursor, ≤ 3 s per store | OPE-§16.6 (incl. `late:*` dims) |
| `fin.recurring`, `money.close_period` | S3 (R2) | daily | slot 6 | cursor | OPE-§16.5, §15.4 |
| `imports.commit` | S3 (R2) | tick | slot 5 (**11 s** shared) | one run at a time, slices of 2,000 rows | OPE-§18.1 |
| `imports.cleanup`, `ship.raw_purge` | S3, S4 (R2) | daily | slot 8 | — | files > 30 days; `shipment_events.raw` > 30 days |
| outbox `webhook` | S5 (R2) | tick | slot 3 | `perStorePerTick` 20, `timeoutMs` 10,000 | OPE-§23.4 |
| `carrier.poll`, outbox `carrier`, `whatsapp` | D2 (R3) | tick | slot 3 | ≤ 50 shipments per store per tick | OPE-§17.7, §22.4 |

Every job checks `ctx.deadline` and awaits `ctx.yield()` between stores (core §H.2 rev 3); a store whose step throws is
skipped for the rest of the tick and logged (`recordError`, core §H.5); each run writes its `job_runs` rows. No operations job moves an order state on a
timer (OD8): leases expire by comparison, ladders are computed at the outcome, the queue is computed on read.

---

## OPE-§L. Limits

| Limit | Value | Where enforced |
|---|---|---|
| Claim lease | `ops.leaseMinutes` (15; 5-30; rev 3 OD60: renewed by the heartbeat while held) | `nextOrder`, `renewLease`, `touchAgent` |
| Active claims per agent | 1 | `nextOrder` |
| Callback horizon | > now + 5 min, ≤ 30 days | `recordOutcome` |
| Ladder | 1-10 steps; keep-open ≤ 14 days | settings schema |
| Bulk actions | ≤ 200 ids; `s:<sid>:bulk:<uid>` 30 / 10 min | bulk actions |
| Reveals | `s:<sid>:reveal:<uid>` 300 / h hard cap (alarm R2 at `revealAlarmPerHour`) | `revealPhone` |
| Next | `s:<sid>:claim:<uid>` 120 / min | `nextOrder` |
| Manual orders | `s:<sid>:manual:<uid>` 60 / h | `createManualOrder` |
| Order notes | ≤ 500 chars; edit ≤ 5 min by the author | `addNote` |
| Event meta | ≤ 2 KB | `appendEvents` |
| Saved views | 30 personal per user per surface, 30 shared per store per surface | `saved_views` |
| Templates | ≤ 100 per store; body ≤ 1,000 chars; script ≤ 12 steps, ≤ 400 chars per line | template repository |
| City aliases | ≤ 200 per store | `ops` schema |
| Assignment rules (R2) | ≤ 20 | `ops` schema |
| Sheets | ≤ 100 appends and ≤ 200 updates per store per run; ≤ 3 calls per store per tick; 50 calls / 60 s platform | `pushStore` |
| CAPI | 1 event per request per pixel; 7-day guard | handler |
| Telegram | ≤ 3,500 chars, ≤ 10 orders per batch, 1 msg / s per chat | handler |
| WhatsApp link | text ≤ 1,000 chars, URL ≤ 2,000 chars | `waLink` |
| Imports (R2) | ≤ 5 MB, ≤ 50,000 rows, ≤ 2,000 rows committed in a request; `s:<sid>:import:<uid>` 20 / day | importer |
| Receipts (R2) | ≤ 5 MB, PDF / JPEG / PNG | expenses |
| Webhooks (R2) | ≤ `webhooks_max` endpoints; payload ≤ 64 KB; 2,000 deliveries per store per hour | handler |
| API (R3) | 600 requests / 10 min per key | `/api/v1` |
| Telegram `getUpdates` | `s:<sid>:tg:find` 10 / h | setup |
| Idempotency (rev 2) | `Idempotency-Key` UUID; stored result 10 min per (store, user, key); ≤ 2,000 entries per store in `scopedCache("ops-idem")` | hot-path routes, bulk, manual orders |
| Queue card (rev 2) | ≤ 6 KB gz; body of a hot-path request ≤ 2 KB | `test:ops` fixtures; route handlers (413 above) |
| Offline retry (rev 2) | one pending outcome per agent; retries at 0.5 / 1 / 2 / 4 / 8 / 15 s, ≤ 30 s total; `sessionStorage` entry ≤ 512 B, no PII | the console (OD37) |
| Replay (rev 2) | `s:<sid>:replay:<uid>` 30 / h; "Replay all dead" ≤ 50 rows per call | OPE-§28 |
| Inbound lookups (rev 3) | `s:<sid>:inbound:<uid>` 60 / h; ≥ 8 digits, exact match; result set kept 10 min, ≤ 10 orders | `inboundLookup` (OPE-§5.7) |
| Delivery lane (rev 3) | `ops.rescue.maxCalls` (3; 0-5) rescue calls per order; hold `ship_after` ≤ now + 60 days | `transitionOrder`, `recordOutcome` |
| Calling window (rev 3) | ≤ 3 ranges per weekday; ≤ 60 closed dates; ≤ 4 dated overrides, non-overlapping | `ops` schema |
| Sheet labels (rev 3) | ≤ 50 mapped labels; label ≤ 60 chars; backfill ≤ 5,000 orders / 90 days | `ops.agentLabels`, OPE-§19.6 |
| Carrier CSV (rev 3) | ≤ 200 orders per file; ≤ 20 columns; held orders refused | `/orders/carrier-csv` |
| Ad rates (rev 3) | ≤ 120 dated rates; ≤ 5 platform accounts | `accounting` schema |
| Partial delivery (R2) | ≤ 20 lines; one active `partial` child per order; `collected_cents` ≤ total | `transitionOrder` |
| Refund (R2) | `0 < refund_cents ≤ collected_cents`; one `refunded` move per order (a correction is `refunded → collected` then again) | `refundOrderAction` |
| Deliveries log (rev 2) | last 100 rows of the store per page, ≤ 10 pages back | `listDeliveries` |
| Saved mappings (R2) | ≤ 20 per kind and store; `MappingSpec` ≤ 8 KB | `import_mappings` |
| Sheets run history (rev 2) | last 20 runs per store, ≤ 4 KB in `cron_cursors.state` | `pushStore` |
| Aggregates (rev 2) | `opsAggregates` ≤ 6 dims per call, ≤ 400 ms, cache 5 min; cells under 5 orders suppressed | `src/lib/callcenter/aggregates.ts` |
| Period close (R2) | `closedThrough` ≤ the last day of the previous month; a reopen needs owner + step-up and audits | `accounting` schema, `closePeriod` |

---

## OPE-§M. Server actions, routes and permissions

Every exported action body is `return storeAction(<permission>, fn, opts)` (core §E.2, lint L9); every route handler
starts with `storeGuard` (or a public resolver for hooks); `not_found` is identical for another store's ids (core
§E.3). "s" = sensitive (refused to impersonation, audited). Rate buckets are `storeBucket(scope, name, userId)`.

### OPE-§M.1 Pages

| Path | Permission (feature) | Track | Release |
|---|---|---|---|
| `/app/<h>/orders` (+ `?order=<id>` drawer) | `orders.read` | P4 | R1 |
| `/app/<h>/orders/print?ids=` | `orders.read` + `shipments.write` [Q.3] | P4 | R1 |
| `/app/<h>/queue` | `agents.self` | P4 | R1 |
| `/app/<h>/queue/me` | `agents.self` | P4 (S3 adds earnings) | R1 own KPIs with n (today / 7 d / 28 d), end-of-day line; **R2** the earnings statement (core §I.1 "R2 agent statement") |
| `/app/<h>/queue/board` | `orders.read_all` + `orders.assign` | P4 | R1 |
| `/app/<h>/integrations` (health strip, deliveries log, replay; OPE-§28) | `integrations.manage` (replay); `callcenter.configure` read-only | P5 | R1 |
| `/app/<h>/customers`, `/customers/<id>` | `customers.read` | P4 | R1 |
| `/app/<h>/team/agents`, `/team/agents/<userId>` | `members.read` (edits `callcenter.configure`) | P4 [Q.9] | R1 |
| `/app/<h>/team/callcenter` | `callcenter.configure` | P4 [Q.9] | R1 |
| `/app/<h>/finance` (Break-even, Costs, Ad spend) | `finance.read` [Q.3] (flag `finance_lite`) | P4 | R1 lite |
| `/app/<h>/integrations/{sheets,pixels,telegram}` | `integrations.manage` (pixels: `pixels.manage` for the library) | P5 | R1 |
| `/app/<h>/integrations/whatsapp` | `callcenter.configure` (templates) · `integrations.manage` (Cloud API, R3) | P5 | R1 |
| `/app/<h>/settings/anti-spam` | `settings.read` | P5 [Q.17] | R1 |
| `/app/<h>/finance/**` (dashboard, expenses, exports, statements, payouts) | `finance.read` (`accounting`); payouts `payouts.approve` | S3 | R2 |
| `/app/<h>/shipping/**` (to pack, shipments, print, imports) | `shipments.write` | S4 | R2 |
| `/app/<h>/shipping/carriers` | `integrations.manage` | S4 | R2 |
| `/app/<h>/integrations/webhooks` | `integrations.manage` (`webhooks`) | S5 | R2 |
| `/app/<h>/integrations/api` | `integrations.manage` (`api_keys`) | D2 | R3 |

### OPE-§M.2 Route handlers

| Route | Method | Guard | Track | R |
|---|---|---|---|---|
| `/api/app/<h>/ops/next` (OD36) | POST | `agents.self`; `Idempotency-Key` required; `s:<sid>:claim:<uid>` 120 / min; body `{}` | P4 | R1 |
| `/api/app/<h>/ops/outcome` (OD36) | POST | `orders.write`; `Idempotency-Key`; body `OutcomeInput` ≤ 2 KB; 409 + fresh card on `conflict` | P4 | R1 |
| `/api/app/<h>/ops/reveal` (OD36) | POST | `orders.reveal_phone` (s); `Idempotency-Key`; `s:<sid>:reveal:<uid>` 300 / h; body `{ orderId, why, templateId? }` | P4 | R1 |
| `/api/app/<h>/ops/presence` (OD33) | POST | `agents.self`; body `{ presence }` or `{ heartbeat: true }`; ≤ 1 write / 60 s | P4 | R1 |
| `/api/app/<h>/ops/state?view=queue\|board` | GET | `agents.self` or `orders.read_all`; ETag / 304 | P4 | R1 |
| `/api/app/<h>/orders/export` | GET | `orders.export` (s; owner, admin, manager); fresh step-up (core §B.7, OD64); audit | P4 | R1 |
| `/api/app/<h>/orders/print?ids=` (HTML, print CSS) | GET | `orders.read` + `shipments.write` | P4 | R1 |
| `/api/app/<h>/orders/carrier-csv?ids=&format=csv\|xlsx` (rev 3, OD55) | GET | `shipments.write` (s: full phones); **fresh step-up (rev 4, OD64; the core's §B.7 list gains the route, OPE-§R2 notes)**; `ops.carrierCsv` must exist; ≤ 200 ids; held orders refused; audit `orders.carrier_exported`; `manifest_exported` per order | P4 (`xlsx` R2, S4) | R1 |
| `/api/app/<h>/sheets/**` (moved in R1.0) | GET/POST | `integrations.manage` | P5 | R1 |
| `/api/app/<h>/imports` | POST (multipart) | the kind's permission | S3 | R2 |
| `/api/app/<h>/finance/receipts/<id>` | GET | `finance.read` | S3 | R2 |
| `/api/app/<h>/shipping/manifest/<batchId>.csv` | GET | `shipments.write`; `manifest_exported` events | S4 | R2 |
| `/api/hooks/carrier/<adapter>/<hookKey>` | POST | hook key (constant time); 404 otherwise | D2 | R3 |
| `/api/hooks/whatsapp/<hookKey>` | GET, POST | verify token / `X-Hub-Signature-256` | D2 | R3 |
| `/api/v1/**` | GET, POST | API key + scope [Q.19] | D2 | R3 |
| `/s/<h>/feeds/<key>/<platform>.<ext>` | GET | feed key | D2 | R3 |

### OPE-§M.3 Server actions (R1)

| Action (file) | Permission | Feature / rate | Calls |
|---|---|---|---|
| `nextOrderAction` (`queue/actions.ts`; the queue page itself uses `POST /ops/next`, OD36; the action serves the drawer's "Take this order" and ⌘K) | `agents.self` | `claim` 120/min | `nextOrder` |
| `releaseOrderAction`, `setPresenceAction` | `agents.self` | — | §5.2, §5.5 |
| `recordOutcomeAction` (drawer outcomes outside the queue; the queue uses `POST /ops/outcome`) | `orders.write` | — | `recordOutcome` (+ `nextOrder` when `andNext`) |
| `revealPhoneAction` (drawer "Show number"; the queue uses `POST /ops/reveal`) | `orders.reveal_phone` (s) | `reveal` 300/h | `revealPhone` |
| `addNoteAction`, `editNoteAction` | `orders.write` | — | §4.1 |
| `takeOrderAction` (drawer "Take this order") | `agents.self` | `claim` | claim one id with the §5.2 `WHERE` |
| `moveOrderAction` (`orders/actions.ts`) | `orders.write` (ship moves also `shipments.write`, money `finance.write`, checked per move) | — | `moveToLegacy` / `transitionOrder` |
| `forceMoveAction` | `orders.force_status` | reason | `transitionOrder({ force })` |
| `bulkAssignAction`, `bulkPinAction`, `assignOrderAction` | `orders.assign` | `bulk` 30/10 min | §12.4, §5.6 |
| `bulkMoveAction`, `undoMoveAction` | `orders.write` | `bulk` | §12.4, §12.5 |
| `editOrderAction` | `orders.edit` | — | `editOrder` |
| `quoteManualOrderAction`, `createManualOrderAction` | `orders.create` | `manual` 60/h | §11.1 |
| `convertLeadAction` | `orders.create` + `leads.write` | `manual` | §11.4 |
| `dismissDuplicateAction` | `orders.write` | — | §9.3 |
| `deleteTestOrdersAction` | `settings.write` (owner, admin) | — | §26 |
| `blockPhoneAndCancelAction`, `unblockAction` (`customers/actions.ts`) | `blocklist.write` (+ `orders.write` for the moves) | — | §9.5 |
| `saveCustomerNoteAction` | `customers.read` + `orders.write` | — | §9.2 |
| `updateAgentProfileAction` (`team/agents/actions.ts`) | `callcenter.configure` | — | §14.2 |
| `saveOpsSettingsAction`, `openCallsNowAction` (`team/callcenter/actions.ts`) | `callcenter.configure` | — | `ops` setting only (rev 4, CRIT2: the calling window and its `savedAt`, OD63; **no** `store` / `policies` write: the hours keys there no longer exist, core D73); `markHealthDirty`; audit `callcenter.settings.updated` |
| `saveScriptAction`, `resetScriptAction`, `approveScriptDraftAction` | `callcenter.configure` | — | §7.4 |
| `saveItemCostAction`, `saveCarrierRateAction`, `saveAdSpendCellAction`, `savePackagingAction` (`finance/actions.ts`) | `finance.write` [Q.3] | flag `finance_lite` | §16.2 |
| `startSheetConnectAction`, `verifySheetConnectAction`, `disconnectSheetAction` (`integrations/sheets/actions.ts`) | `integrations.manage` (s) | `sheets`; `sheets:connect` 10/h | §19.3 |
| `setSheetsEnabledAction`, `setSheetsPullAction`, `syncSheetNowAction`, `repairSheetAction` | `integrations.manage` (s) | `sheets`; `sheets:sync` (core) | §19.5, §19.8 |
| `saveExportKeyAction` | `integrations.manage` (s) | `php_export` | `export_key` |
| `saveConversionsAction` (`integrations/pixels/actions.ts`) | `integrations.manage` (s) | `pixels_capi` | §20.2; enqueues renders |
| `saveTelegramTokenAction`, `findTelegramChatsAction`, `selectTelegramChatAction`, `sendTelegramTestAction`, `setTelegramPiiAction`, `disableTelegramAction` | `integrations.manage` (s) | `telegram`; `tg:find` 10/h | §21.1 |
| `saveNotificationsAction` | `integrations.manage` | — | `notifications` setting |
| `saveTemplateAction`, `resetTemplateAction` (`integrations/whatsapp/actions.ts`) | `callcenter.configure` | — | §22.2 |
| `saveTurnstileOverrideAction` (`settings/anti-spam/actions.ts`) | `settings.write` + `integrations.manage` (s) | — | §24 |
| `replayDeliveryAction`, `replayDeadOfKindAction` (`integrations/actions.ts`, rev 2) | `integrations.manage` (s) | `replay` 30/h | core `replay(ctx, id)`; audit `integrations.outbox.replayed` (OPE-§Q.26) |
| `listDeliveriesAction` (`integrations/actions.ts`) | `integrations.manage` or `callcenter.configure` | — | `listDeliveries` (§28.1), masked |
| `inboundLookupAction` (`queue/actions.ts`, rev 3) | `agents.self` | `inbound` 60/h | `inboundLookup` (§5.7); `takeOrderAction` and `recordOutcomeAction` accept `inbound: true` on the looked-up ids |
| `setShipAfterAction` (`orders/actions.ts`, rev 3) | `orders.write` (agents on orders they hold, own or looked up) | — | `transitionOrder({ want: {}, shipAfter })` → `hold_set` (§3.2, OD49); null removes the hold |
| `setTrackingAction` (`orders/actions.ts`, rev 3) | `shipments.write` | — | `tracking_ref` / `carrier_label` + `tracking_set`; implies `packed` when pre-ship (OD55) |
| `requestRecallAction` (`orders/actions.ts`, rev 3) | `orders.write` | — | event `recall_requested` (§6.1a, OPS-21); `markCarrierNotifiedAction` (`shipments.write`) ticks it |
| `markCashReceivedAction` (`finance/actions.ts`, rev 3) | `finance.write` | `bulk` | money `collected → remitted` (class M, meta `settlement: "manual"`), ≤ 200 ids (OD52) |
| `saveSettlementAction`, `saveAdAccountAction`, `saveAdRateAction` (`finance/actions.ts`, rev 3) | `finance.write` | flag `finance_lite` | `accounting.myCarrier`, `.adAccounts`, `.adRates` (OD52, OD56); audit `finance.settings.updated` (core §F.5, accepted Q.27m) |
| `saveSkuCostAction` (`finance/actions.ts`, rev 3) | `finance.write` | flag `finance_lite` | `product_costs` row with `sku` (OPS-24) |
| `mapAgentLabelAction`, `unmapAgentLabelAction` (`team/agents/actions.ts`, rev 3) | `callcenter.configure` | — | `ops.agentLabels` + the backfill of §19.6 in `after()` (OD54); audit `callcenter.label_mapped` `{ label, count }` (core §F.5) |
| `saveCarrierCsvColumnsAction` (`orders/actions.ts`, rev 3) | `shipments.write` | — | `ops.carrierCsv` (OD55) |
| `saveWindowOverridesAction` (`team/callcenter/actions.ts`, rev 3) | `callcenter.configure` | — | `ops.windowOverrides` (OPS-28; days keyed by ISO weekday 1-7, OD57) and nothing else (rev 4, CRIT2: no mirror is written); audit `callcenter.settings.updated` |

R2 adds `closePeriodAction` / `reopenPeriodAction` (`finance/actions.ts`, `finance.write`, owner only, a fresh step-up
on the core §B.7 tenant ladder, TOTP or password, rev 4 OD64; audit `finance.period_closed` / `finance.period_reopened`,
OD41) and `exportAccountingAction` (`finance.read`; the sha256 header of OPE-§16.8), and **(rev 3)** `refundOrderAction`
(`finance.write`, reason + method + amount → money `refunded`, audit `orders.refunded` `{ cents, method }`, OD59),
`partialDeliveryAction` (`shipments.write`, lines + collected amount → `delivered` with `line_outcome`, OD51),
`confirmProbableMatchesAction` (`finance.write`, OPS-26), the sheet's `quoteManualOrderV3Action` /
`createManualOrderV3Action` / `editOrderV3Action` (`orders.create` / `orders.edit`; **rev 4:** thin `storeAction`
wrappers in S4's `src/lib/shipping/manual-actions.ts` (inside S4's `src/lib/shipping/**`; server actions live under
`src/lib/**` or `src/app/app/**`, core §E.2) around **S1's** functions of STO-§16.9, OPE-§11.5), and
`saveExportFormatAction` (`finance.write`, OPS-27). R2 and R3 actions otherwise follow the same pattern: commission rules (`commissions.manage`), payouts (`payouts.approve`, s),
expenses / costs / imports / disputes / snapshot recompute (`finance.write`), carrier accounts (`integrations.manage`),
shipments, imports of tracking and status, prints (`shipments.write`), merge (`orders.edit` + `orders.assign`),
assignment rules (`callcenter.configure`), lifting a reveal pause (`orders.assign`), webhook endpoints
(`integrations.manage`, feature `webhooks`), API keys (`integrations.manage`, feature `api_keys`), WhatsApp Cloud API
(`integrations.manage`, s).

### OPE-§M.4 Query plans (every list has an index)

| Query | Index |
|---|---|
| Claim, "To call now", queue counts; **rev 3:** the delivery lane (`confirm_state = 'confirmed' AND due_at <= now`) | `orders_queue_idx (store_id, confirm_state, due_at)` |
| Tracking lookup, Sheets "Tracking" pull (rev 3) | `orders_tracking_idx (store_id, tracking_ref)` |
| Holds / To pack excluding holds (rev 3) | `orders_ship_idx (store_id, ship_state, updated_at)` + a `ship_after` filter on the bounded to_pack set |
| Sheet agents table (rev 3) | `orders_store_created_idx (store_id, created_at)` 28-day range grouped by `confirmed_by_label` |
| My orders / assignee views | `orders_assignee_idx (store_id, assignee_id, confirm_state)`, `orders_confirmer_idx` |
| Orders list by date | `orders_store_created_idx (store_id, created_at)` |
| Shipping views | `orders_ship_idx (store_id, ship_state, updated_at)` |
| Cash held | `orders_money_idx (store_id, money_state, delivered_at)` |
| Duplicates, customer orders | `orders_store_phone_idx (store_id, phone, created_at)`, `orders_customer_idx` |
| Sheets work | `orders_store_sheet_idx (store_id, sheet_status)`, `orders_dirty_idx (store_id, sheet_dirty)` |
| Timeline | `oe_order_idx (store_id, order_id, at)` |
| KPIs today, daily caps | `oe_actor_idx (store_id, actor_id, at)`, `oe_type_idx (store_id, type, at)` |

---

## OPE-§N. Copy keys

Keys live in `src/lib/i18n/admin/<locale>/ops.ts` (P4), `integrations.ts` (P5), `finance.ts` (S3; R1 lite keys by
P4) with the prefixes `ops.`, `int.`, `fin.` (core §I.5). Agent-facing and shopper-facing strings ship in ar, fr and
en in R1 (OD34); **every other key of the three prefixes ships in fr and en in R1 (rev 3, OD58, OPS-17)**, ar in R3.
Sentence case, no exclamation marks except greetings, no em dash in UI copy (RF §2.1 rule 8), numbers formatted at
render. The R1 trilingual set:

| Key | en | fr | ar |
|---|---|---|---|
| `ops.queue.next` | Next order | Commande suivante | الطلب الموالي |
| `ops.queue.resume` | Back to my order | Reprendre ma commande | رجع للطلب ديالي |
| `ops.queue.call` | Call | Appeler | اتصل |
| `ops.queue.whatsapp` | WhatsApp | WhatsApp | واتساب |
| `ops.queue.showNumber` | Show number | Afficher le numéro | بيّن الرقم |
| `ops.queue.howDidItGo` | How did the call go? | Comment s'est passé l'appel ? | كيفاش دازت المكالمة؟ |
| `ops.outcome.confirmed` | Confirmed | Confirmée | مؤكد |
| `ops.outcome.no_answer` | No answer | Pas de réponse | ما جاوبش |
| `ops.outcome.busy` | Busy or switched off | Occupé ou éteint | مشغول ولا مطفي |
| `ops.outcome.callback` | Call back… | Rappeler… | عاود عيّط… |
| `ops.outcome.cancelled` | Cancel… | Annuler… | إلغاء… |
| `ops.outcome.more` | More… | Plus… | المزيد… |
| `ops.outcome.fake` | Fake order | Fausse commande | طلب وهمي |
| `ops.outcome.wrong_number` | Wrong number | Mauvais numéro | رقم غالط |
| `ops.outcome.duplicate` | Duplicate | Doublon | طلب مكرر |
| `ops.saveAndNext` | Save and next | Enregistrer et suivante | سجّل ودوز للموالي |
| `ops.skip` | Skip | Passer | دوز |
| `ops.presence.online` | Online | En ligne | متصل |
| `ops.presence.break` | On a break | En pause | ف الاستراحة |
| `ops.presence.offline` | Offline | Hors ligne | غير متصل |
| `ops.state.outsideWindow` | Calls open at {time} | Les appels reprennent à {time} | المكالمات كتبدا مع {time} |
| `ops.state.empty` | Nothing to call right now. New orders appear here the second they arrive. | Rien à appeler pour l'instant. Les nouvelles commandes arrivent ici dès qu'elles tombent. | ما كاين حتى طلب دابا. الطلبات الجديدة كتبان هنا غير توصل. |
| `ops.state.cap` | You reached today's limit of {n} orders | Vous avez atteint la limite du jour : {n} commandes | وصلتي للحد ديال اليوم: {n} طلب |
| `ops.state.leaseLost` | This order went back to the queue | Cette commande est revenue dans la file | هاد الطلب رجع للقائمة |
| `ops.state.conflict` | Updated by {name} just now | Modifiée par {name} à l'instant | {name} بدّلها دابا |
| `ops.callback.inOneHour` | In 1 hour | Dans 1 heure | من دابا ساعة |
| `ops.callback.thisEvening` | This evening {time} | Ce soir {time} | هاد العشية {time} |
| `ops.callback.tomorrow` | Tomorrow {time} | Demain {time} | غدا {time} |
| `ops.callback.outsideHours` | Outside calling hours | Hors des heures d'appel | خارج أوقات المكالمات |
| `ops.history.line` | {delivered} delivered · {refused} refused · {cancelled} cancelled | {delivered} livrées · {refused} refusées · {cancelled} annulées | {delivered} توصلو · {refused} ترفضو · {cancelled} تلغاو |
| `ops.dup.possible` | Possible duplicate of {id} ({ago}) | Doublon possible de {id} ({ago}) | ممكن يكون مكرر مع {id} ({ago}) |
| `ops.dup.mark` | Mark as duplicate | Marquer comme doublon | علّم كمكرر |
| `ops.dup.keep` | Keep both | Garder les deux | خلي بجوج |
| `ops.risk.check` | To check | À vérifier | خاصو تحقق |
| `ops.risk.high` | High risk | Risque élevé | خطر مرتفع |
| `ops.script.title` | Call script | Script d'appel | سكريبت المكالمة |
| `ops.note.placeholder` | Add a note for the team | Ajouter une note pour l'équipe | زيد ملاحظة للفريق |
| `ops.test.chip` | TEST | TEST | تجربة |
| `ops.me.today` | Today: {confirmed} confirmed | Aujourd'hui : {confirmed} confirmées | اليوم: {confirmed} مؤكدين |
| `ops.me.endOfDay` (rev 2) | Today: {decided} decided · {confirmed} confirmed · {callbacks} callbacks for tomorrow | Aujourd'hui : {decided} traitées · {confirmed} confirmées · {callbacks} rappels pour demain | اليوم: {decided} تعالجو · {confirmed} تأكدو · {callbacks} عاود عيّط غدا |
| `ops.saving` (rev 2) | Saving… | Enregistrement… | كيتسجل… |
| `ops.saved` (rev 2) | Saved | Enregistré | تسجّل |
| `ops.couldNotSave` (rev 2) | Could not save, tap to retry | Pas enregistré, touchez pour réessayer | ما تسجلش، ضغط باش تعاود |
| `ops.callStarted` (rev 2) | Call started {ago} | Appel lancé {ago} | المكالمة بدات {ago} |
| `ops.skipped` (rev 2) | Skipped for 10 minutes | Passée pour 10 minutes | تدوزات ل 10 دقايق |
| `ops.risk.calibration` (rev 2) | In your store, orders like this one ended fake, cancelled or unreachable {share} of the time ({n} orders) | Dans votre boutique, les commandes comme celle-ci ont fini fausses, annulées ou injoignables dans {share} des cas ({n} commandes) | ف المتجر ديالك، الطلبات بحال هادي خرجو وهميين ولا تلغاو ولا ما تجاوبوش ف {share} ديال الحالات ({n} طلب) |
| `ops.script.obj.price` … `ops.script.obj.wrong_size` (rev 2) | the six objection chip labels: Price · Trust · Delivery time · Wants to think · Cheaper elsewhere · Wrong size | Prix · Confiance · Délai · Veut réfléchir · Moins cher ailleurs · Mauvaise taille | الثمن · الثقة · مدة التوصيل · بغا يفكر · أرخص ف بلاصة أخرى · القياس غالط |
| `ops.board.bestHours` (rev 2, managers; rev 3: fr in R1, ar R3) | Best hours to call (your data) | Meilleures heures pour appeler (vos données) | (R3) |
| `ops.board.needs30` (rev 2) | needs 30 | il en faut 30 | (R3) |
| `int.deliveries.replay` (rev 2, owners; rev 3: fr in R1) | Replay | Renvoyer | (R3) |
| `int.deliveries.state.dead` (rev 2) | Failed, will not retry | Échec, ne sera pas réessayé | (R3) |
| `ops.lane.delivery` (rev 3) | Delivery problem · attempt {n} | Problème de livraison · tentative {n} | مشكل ف التوصيل · المحاولة {n} |
| `ops.rescue.customer_informed` (rev 3) | Customer informed | Client prévenu | الكليان تخبّر |
| `ops.rescue.reschedule` (rev 3) | Deliver on another date… | Livrer à une autre date… | التوصيل ف تاريخ آخر… |
| `ops.rescue.cancel_recall` (rev 3) | Cancel and recall the parcel… | Annuler et rappeler le colis… | إلغاء ورجّع الكولي… |
| `ops.rescue.callsLeft` (rev 3) | Rescue calls left: {n} | Rappels restants : {n} | المكالمات الباقية: {n} |
| `ops.rescue.informedChip` (rev 3) | Customer informed · will be available | Client prévenu · sera disponible | الكليان تخبّر · غادي يكون موجود |
| `ops.hold.deliverFrom` (rev 3) | Deliver from… | Livrer à partir du… | التوصيل من… |
| `ops.hold.shipFrom` (rev 3) | Ship from {date} | Expédier à partir du {date} | يتصيفط من {date} |
| `ops.hold.release` (rev 3) | Release hold | Lever la mise en attente | حيّد التأجيل |
| `ops.inbound.placeholder` (rev 3) | Customer calling? Type the number | Un client appelle ? Saisissez le numéro | كليان كيعيّط؟ كتب الرقم |
| `ops.inbound.none` (rev 3) | No order for this number | Aucune commande pour ce numéro | ما كاين حتى طلب بهاد الرقم |
| `ops.inbound.take` (rev 3) | Take this order | Prendre cette commande | خود هاد الطلب |
| `ops.inbound.paused` (rev 3) | Too many lookups this hour. Ask your manager. | Trop de recherches cette heure. Demandez à votre responsable. | بحثتي بزاف هاد الساعة. سول المسؤول ديالك. |
| `ops.ship.attempt_failed` (rev 3) | Attempt failed | Tentative échouée | المحاولة ما نجحاتش |
| `ops.ship.postponed` (rev 3) | Postponed | Reportée | مأجّلة |
| `ops.reason.return.customer_absent` … `other` (rev 3, OD50) | Customer absent · Refused the price · Changed their mind · Wrong item · Damaged · Unreachable · No cash · Wrong address · Says they didn't order · Other | Client absent · Prix refusé · A changé d'avis · Mauvais article · Endommagé · Injoignable · Pas d'argent · Mauvaise adresse · Dit ne pas avoir commandé · Autre | الكليان ما كانش · رفض الثمن · بدّل رأيو · سلعة غالطة · مخسّر · ما كيجاوبش · ما عندو فلوس · العنوان غالط · كيقول ما طلبش · سبب آخر |
| `ops.reason.return.none` (rev 3) | No reason given | Sans motif | بلا سبب |
| `fin.money.cashInHand` (rev 3, OD52; fr in R1) | Cash in hand | Encaissé en main | (R3) |
| `fin.money.heldSince` (rev 3) | Held by carrier since {days} d | Détenu par le transporteur depuis {days} j | (R3) |
| `fin.ads.needsRate` (rev 3, OD56) | needs a rate | taux manquant | (R3) |
| `fin.ads.rateLine` (rev 3) | Spend converted at your rate 1 {cur} = {rate} {store} (from {date}) | Dépenses converties à votre taux 1 {cur} = {rate} {store} (depuis le {date}) | (R3) |
| `fin.settlement.question` (rev 3) | Who holds the cash after delivery? | Qui détient l'argent après la livraison ? | (R3) |
| `ops.sheet.agentChip` (rev 3, OD54) | {label} (sheet) | {label} (feuille) | (R3) |
| `ops.export.carrierFile` (rev 3, OD55) | Carrier file | Fichier transporteur | (R3) |
| `ops.me.pending` (R2) | {amount} pending, paid when delivered | {amount} en attente, payé à la livraison | {amount} ف الانتظار، كيتخلص ملي يتوصل |
| `ops.reveal.paused` (R2) | Too many numbers opened. Ask your manager. | Trop de numéros ouverts. Demandez à votre responsable. | حليتي بزاف ديال الأرقام. سول المسؤول ديالك. |

Timeline texts (`ops.tl.<type>`), reasons (`ops.reason.<code>`, OPE-§6.4), risk texts (`ops.risk.<flag>`, OPE-§10.2),
WhatsApp built-ins (`int.wa.<kind>`, OPE-§22.2), Telegram texts (`int.tg.<message>`, OPE-§21.2), the script
built-ins and objection answers (`ops.script.<step>`, `ops.script.obj.<id>.say`, OPE-§7.3) and every tenant-facing
notification title and body (`notify.ops.*`, `notify.int.*`, `notify.fin.*`, OD45) ship in the three languages too and
are covered by `test:i18n-coverage` (core §I.5). **rev 3 (OD58):** the board, orders list, customers, agents,
call-center settings, integrations, deliveries and Profit lite screens ship in **fr and en in R1** (`test:i18n-coverage`
requires `fr` for every `ops.`, `int.` and `fin.` key from the P4 / P5 merge; `ar` for these screens arrives in R3 with
the RTL dashboard, UX-08). The `ops.ship.*` state labels also feed the Sheet's optional "Statut livraison" header in
the sheet's locale (OPE-§19.4). Tile keys (`ops.tile.*`,
`fin.tile.*`) name exactly one of placed / confirmed / delivered (OD38 lint). No em dash, no "Step 1/2/3", no
exclamation mark outside greetings, sentence case (core §I.8 rule 8; rubric §9.G).

---

## OPE-§O. Tests

### OPE-§O.1 `npm test` (offline; must stay green on every merge)

Script names are the core's (core §J.1: `test:state`, `test:ops`, `test:queue`, `test:profit`, `test:conversions`
extended; §J.2: `test:ops-db`, `test:integrations-db`); `package.json` is the maintainer's, so P5's offline checks are
sections of the existing `conversions-check.ts` rather than new scripts.

| Script | File | Checks |
|---|---|---|
| `test:state` | `src/lib/orders/state.selftest.ts` (P4) | every cell of the three transition tables (legal and illegal per class), implied paths, terminal protection, `projectStatus` over all **96** confirm × ship pairs (golden table; rev 3: 12 ship states), `legacyToWanted` for every label incl. the rev 3 `"noop"` rule (a coarse label never coarsens `attempt_failed` / `postponed` / `out_for_delivery`); **rev 3:** `attempt_failed` bookkeeping (`delivery_attempts + 1`, `due_at` set while rescue calls < `maxCalls`, cleared by every other ship move), `postponed` + `ship_after`, `shipAfter` on `confirmed` (`bad_hold` outside (now, +60 d]), `returnReason` written only on refused / returned / lost, the `at_delivery` settlement writing `collected` + `remitted` in one plan, `refunded` legality (R2 cells) and `bad_amount`; **rev 4:** the set of `SHIP_STATES` / `MONEY_STATES` equals the core §D.2 enum set (order not compared, OPE-§2.1), and only `attempt_failed` ever sets `due_at` on a confirmed order (`postponed` clears it) |
| `test:ops` | `scripts/qa/ops-check.ts` (P4; imports `src/lib/callcenter/selftest.ts`) | **static:** only `transition.ts` and the creation insert write `status` / `confirm_state` / `ship_state` / `money_state`; no `phone`, `email`, `address` or `note` field in the `QueueOrder`, `OrderListRow`, `TimelineItem`, `ConsoleOrderRow`, `AggCell` types (TypeScript API); every exported function of `kpis.ts` returns `Kpi` (OD38); the honest-triad catalog lint (OD38); the queue key map and the shell chords are disjoint (§13.3); every new status colour passes the orange check; **rev 3:** a single `insert(orders)` call site in `src/**` (`createOrderRow`, OD62); every exported read function of `src/lib/orders/{profile,admin,events,queue,customers}.ts` and `src/lib/callcenter/inbound.ts` calls **`maskIfImpersonation`** (OD61, rev 4 CRIT14) and no file of this part declares `maskName`, `maskAddress` or `maskCustomerFields`; `cityKey` imports nothing server-side (isomorphic, OD47); `ManifestSource` of `carrier-csv.ts` equals the `manifest` mapping's source enum; **rev 4:** no file of this part reads or writes a `store.confirmation.hours` or `policies.contact.hours` key (CRIT2); `EffectiveWindow`, `OpsSetting.callingWindow.days` and `windowOverrides[].days` have exactly the keys `1`-`7` (CRIT3, a type-level check). **Pure:** ladder with the window, closed dates and the `Africa/Casablanca` offset changes; `windowMinutesBetween`; `priorityOf` (rev 3: delivery lane 650 > callback 600); `maskPhone` / `maskPhonesIn`; `explainRisk` covers every flag read from `risk.ts`'s source; `cityKey` / `normalizeCity` (fr, ar, alias, fuzzy) fixtures **and the shared parity fixture `scripts/qa/fixtures/city-key.json` (OD47; read by P3's `test:delivery` and S1's `test:catalog` too): its `slugs`, `zoneTable` (rev 4, CRIT1: `ZoneTable.city` keyed by `City.value`, no slug as a key, "Autre" → `star`) and `flows` sections**; the ISO window over **`src/lib/callcenter/window.fixtures.ts`** (rev 4, CRIT3: `DEFAULT_WINDOW.days[5]` is Friday, `isoWeekday` across the Casablanca offset changes, `rangesForDay` with an override and a midnight-crossing range, `hoursText`, `nextCallableAt`; `shopperPromiseAllowed` false and the `confirm_hours` value empty while `configured: false`, OD63; the same file feeds P3's `test:delivery` and S1's `test:catalog`); KPI formulas with the minimum-n rule (incl. rescue rate and inbound share); the 40-fixture `QueueOrder` cards each ≤ 6 KB gz (incl. 8 delivery-lane cards); the idempotency cache replays `nextOrder` / `recordOutcome` results and expires at 10 min (fake clock); the Carrier CSV writer (columns in the saved order, `;` delimiter, BOM, national digits, held orders refused) |
| `test:profit` | `scripts/qa/profit-check.ts` (P4) | SF-04 golden fixtures for `E_placed`, break-even CPA and the Wilson intervals; no rate below n = 30; alerts fire once and clear (hysteresis, fake clock); cents parity with `src/lib/page/pricing.ts`; zero costs typed → prompts, no numbers; the by-angle table suppresses cells under 5 orders; **rev 3:** `spendStoreCents` with dated rates (the latest rate ≤ the day; a day without a rate is excluded and counted in `missing_rates`, never converted at 1:1); the cost lookup order variant → item → sku → product; the COD fee base `max(min, round(collected × bp / 10000)) + flat` on the golden carriers; `fee charged` vs `fee paid` per city; `city_refusal` evidence carries the reason mix only when reasons exist |
| `test:conversions` | `scripts/qa/conversions-check.ts` (P5, extended) | **conversions:** the trigger matrix of §20.2, event ids, custom events Meta-only, risk gate only for `order`, the 7-day guard boundary (7 d − 1 h), test and manual orders never sent, `capi_ctx` round trip. **templates** (`src/lib/integrations/templates.selftest.ts`): parse / render, optional blocks, unknown variable and unbalanced errors, braces; every built-in (script steps, objection answers, WhatsApp kinds) renders against the 40 order fixtures with **zero numbers not present in the order or settings** (`allowedNumbers` of `src/lib/ai/guard.ts:52`); an empty `eta_text` removes every timing sentence; `confirm_number` falls back to the WhatsApp digits and is empty when `store.confirmation` is unset; **rev 4 (OD63):** `confirm_hours` is empty (its optional block dropped) while the window is not `configured`, and filled from `window.fixtures.ts` once it is. **sheets** (`src/lib/sheets/selftest.ts`): the pure run planner (`planSheetRun`): ≤ 1 read + 1 append + 1 batchUpdate, bits → cells, new labels and the "Repère" header, the conflict rule table of §19.6, the row-deleted case, `is_test = 0` in every work predicate; **rev 3:** the six optional headers (detection, bit → cell, the widened read range stays one call), "Note agent" `cellHash` dedupe, "Tracking" implies `packed` only pre-ship and never clears, "Agent" writes `confirmed_by` for a mapped label and `confirmed_by_label` otherwise, "Statut livraison" renders `ops.ship.*` in the sheet's locale. **telegram:** batch merge ≤ 10 orders, "[TEST]" prefix only with `testOrders`, the honest-triad rule on `int.tg.*`, the cash-held line skipped for `at_delivery` accounts |
| `test:render` | `scripts/qa/render-check.ts` (core / T3 fixture, accepted OPE Q.6) | trigger ≠ `order` → thank-you without the pixel chunk, landing with it; every runtime budget unchanged |
| `test:i18n-coverage` (core, P2) | `scripts/qa/i18n-coverage.ts` | the ar/fr/en completeness of OPE-§N's trilingual set, the notification kinds of §21.4 and the gate titles; **rev 3 (OD58):** `fr` present for every `ops.` / `int.` / `fin.` key in R1; no em dash or "Step n" in any `ops.` / `int.` / `fin.` key |
| `test:imports` (R2) | `src/lib/imports/selftest.ts` (S3) | RFC 4180 cases, encodings, delimiters, decimals, dates, header detection and signature matching, mapping validation, the ≤ 20 mappings cap |
| `test:webhooks` (R2) | `src/lib/webhooks/selftest.ts` (S5) | Standard Webhooks signature vectors, rotation with two signatures, SSRF guard address table (IPv4, IPv6, mapped) |

**Wall time (rev 3, ENGP-24):** the operations scripts of `npm test` run on fixtures, never on corpora: `test:state`,
`test:ops` and `test:profit` together stay **≤ 25 s** on the owner's PC (HANDOFF §3; the 40 order fixtures, the 96-cell
golden table and the ladder's fake-clock sweeps are the whole input); the concurrency and seeded-store checks are
DB-backed (`test:queue`, `test:ops-db`) and the e2e budgets live in `qa:wow-demo`. `scripts/qa/ops-check.ts` prints
its own wall time and fails above 25 s so the ceiling the core sets for `npm test` (≤ 3 min, core §J.1) is never spent
here.

### OPE-§O.2 DB-backed (`npm run test:db`, throwaway `cod_test_*` databases)

**rev 4 (OD65):** P4's and P5's scripts carry R1 cases; every R2 / R3 case sits in the script of the track that builds
the behaviour (S3 `money-check.ts`, S4 `carrier-check.ts`, S1 `test:storefront-db`, D2's adapter suite), because P4's and
P5's files are read-only to the R2 tracks (core §K.2). The R2 rows of revision 3's `test:ops-db` moved accordingly.

| Script | File | Checks |
|---|---|---|
| `test:queue` | `scripts/qa/queue-check.ts` (P4) | **200 parallel claims on 50 orders → 50 distinct winners, 150 `empty`**; lease expiry makes an order claimable **and** the next claim writes `released` (`lease_expired`) attributed to the previous holder (OD46); one active claim per agent; a callback reaches its owner first and the pool after the grace; manual mode; round-robin shares over 1,000 orders with weights 1 / 2 / 3 within ±5%; outside window; daily cap; lock-wait or deadlock retried once; the same `Idempotency-Key` sent twice claims once; `releaseAllLeases` releases every claim of the store and none of another; **rev 3:** the first `N` of an `offline` agent sets `online` and claims, a `break` agent gets `on_break` (OD60); the heartbeat renews a held lease and never an expired one; a 15-minute lease expires 15 min after the last heartbeat (fake clock); an `attempt_failed` order is claimed before a callback and after a pinned order (OD48), only by the lane statement, and `recordOutcome` refuses a confirm outcome on it; `EXPLAIN` of the claim statement uses `orders_queue_idx` for both lane ranges (no full scan); the inbound take of a callback owned by an idle agent (OD53) |
| `test:ops-db` | `scripts/qa/ops-db-check.ts` (P4) | CAS conflict; external pull refused from a terminal state and the label rewritten; customer counters equal the nightly reconcile; store-wide duplicates (and test orders only match test orders); block-and-cancel; manual order total = the public path's total for the same selection (parity fixtures of `test:offers`) and a replayed `idem` returns the first order; edit re-price; `agent_stats_daily` rollup (incl. `abandoned`) = full recompute; **test-order exclusions everywhere** (the table of OPE-§3.6); `riskBandOutcomes` null below 30 decided and exact above; `attemptStats` and `opsAggregates` on a 50,000-order seeded store ≤ 400 ms, cells under 5 suppressed, no customer field in any cell (canary strings); **rev 3:** inbound (OPE-§5.7 acceptance b: a `confirmed` on an `unreachable` order with `inbound: true`, attribution, `not_found` without a lookup, the 61st lookup refused); a held order is absent from To pack and the Carrier CSV and present in On hold, `ops:hold_passed` fires 48 h after the hold (fake clock); an `at_delivery` store's `delivered` writes `collected` **and** `remitted` in one `rev` bump and the order never appears in cash held, a `statement` store's stays `collected`; "Mark cash received" bulk on 200 ids; a mapped sheet label backfills `confirmed_by` for 90 days and the rollup equals a recompute; the Carrier CSV moves exported orders to `packed` once (a second export is a no-op on the axis); `returnReasonMix` equals a recompute; `maskIfImpersonation` under an impersonation scope masks every read function's output and is the identity under a member scope (canaries; rev 4 CRIT14); **rev 4:** saving the calling window writes `ops` only (no `store` / `policies` row changes, CRIT2) and sets `savedAt` (OD63); **the OPE-§O.4 rows this script proves** (rev 4, CRIT17): one event per move / attempt / edit / reveal / assignment / note and the newest-first masked timeline, a note edit after 5 min refused (OP-02); bulk on 200 ids with per-order results, 201 refused, undo only while `rev` is unchanged within 10 s (OP-09); `queueCounts` equal to a recompute on the seeded store (OP-11); the export-ZIP writers (`orders.csv` with full phones, no Telegram token, carrier credential, webhook secret or `capi_ctx`; PL-09); the ⌘K provider ≤ 120 ms with masked results and the agent restriction (UX-02); a shipped order accepting only `address` / `landmark` / `note` with `inTransit: true` (OP-08). **R2 cases (moved, OD65):** manual v3 total = public v3 total → S1 `test:storefront-db` (STO-§16.9); partial delivery, `partial` child and refused-line restock → S4 `test:carriers` (+ S1's stock hook test); `refunded`, `probable`, the `collected_cents` tolerance → S3 `test:money` |
| `test:integrations-db` | `scripts/qa/integrations-db-check.ts` (P5) | Sheets push / pull against a fake `gapi` counting calls (≤ 3 per store per tick), the platform bucket, the 429 breaker, ownership proof (code found / not found / bound elsewhere → generic answer), the last-20-runs history ≤ 4 KB; CAPI enqueue at each trigger and the handler with a mocked `fetch`; Telegram batch merge and 429 `retry_after`; `integration_status` written ≤ 1 / min per row under 1,000 results; a dead item replayed is sent once and a second replay is a no-op (OPE-§28.3) |
| `test:tenancy` (core; cases in `scripts/qa/tenancy-cases/{ops,integrations}.ts`, core §F.1) | `scripts/qa/tenancy-check.ts` | store B's agent: Next never returns A's orders; reveal, outcome, edit, note, assign with A's order ids → `not_found`; A's `Idempotency-Key` replayed by B → a fresh (empty) result, never A's card; B's sheet listing A's order ids is ignored by the pull; binding A's spreadsheet from B → generic refusal; saved view with A's page id → no rows; template values never read A's data; `convertLead` with A's lead → `not_found`; Profit lite costs for A's page → `not_found`; `ops/state`, the pulse contributors, `queueCounts`, `opsAggregates` and the deliveries log never count or list A's rows; `replay` of A's outbox id from B → `not_found`; **rev 3:** B's agent looking up A's customer phone gets the empty inbound shape in the same time (OD53); A's order ids with `inbound: true` from B → `not_found`; the Carrier CSV with A's ids from B lists them as refused, never exported; mapping a label in B never touches A's `confirmed_by`; an impersonating staff session on A sees no customer canary in A's tenant routes and nothing of B (OD61) |
| `test:money` (R2) | `scripts/qa/money-check.ts` (S3) | ledger replay from events; payouts exclude pending and void; remittance golden statements (duplicates, partial payments, fee differences, unknown lines), idempotent re-import, ageing across month ends; `finance_daily` golden store; **rev 3:** delivered revenue = Σ `collected_cents` on a store with partials; `refund_cents` on the refund day and `net` = delivered − refunds − costs; the footer identity with `refunded` as its own term; the XLSX writer round-trips through the §18.6 reader cell for cell and carries the same sha256 as the CSV; `probable` lines by phone with two candidates → `unknown`; the sales register of a closed month is byte-identical after a late refund (booked `late`); **rev 4 (moved from `test:ops-db`, OD65):** `refunded` after `remitted` keeps the statement link and claws back the commission once; a `probable` match is never committed without the owner's tick; an `amount_diff` within `remittanceToleranceCents` adjusts `collected_cents`, above it the line is `disputed` |
| `test:carriers` (R2) | `scripts/qa/carrier-check.ts` (S4) | manual adapter manifest / tracking / status round trip; status map coverage incl. `{ state, reason }` entries and `attempt_failed` → the delivery lane; `self` adapter settlement; a `postponed_to` column sets `ship_after`; the `partial` child shipment in the manifest; R3 adapters against recorded fixtures (incl. `rescheduleParcel` / `updateParcel` when documented); **rev 4 (moved from `test:ops-db`, OD65):** a partial delivery writes `line_outcome`, restocks the refused lines through S1's hook and spawns exactly one `partial` child in `to_pack`; **(OPE-§11.5)** `manualSheetMode`'s table (`landing` → pages, `store` → products, `both` → switch), Create disabled on `fee_unset`, the hold two-step leaving `ship_after` set and replay-safe on `idem` |

### OPE-§O.3 HTTP / e2e (`npm run test:e2e`, production build on port 3451+)

- **`qa:wow-demo` steps contributed by P4** (`scripts/qa/wow-demo/steps/ops.ts`; core §J.3, rows 2:15-2:50 of RF §4):
  **the demo store's owner session** (the store owner invited at 0:00, or an invited agent; never the platform owner,
  who is not a member and whose impersonation is read-only, OPS-16) opens `/queue` and presses `N` → presence turns
  `online` implicitly (OD60), claim ≤ 300 ms, phone masked, TEST chip visible; a second agent session pressing `N` at
  the same moment does not get the same order; `C` (or `W`) → `phone_revealed` written, each action ≤ 500 ms,
  optimistic; `1` → `confirm_state = confirmed`, the timeline shows attempt → confirmed; the test order never reaches
  the fake Sheets endpoint, the mocked CAPI or the learning tables; the dashboard revenue stays 0; the Telegram mock
  receives "[TEST] …" only when the switch is on. **Window honesty (rev 3, OPS-16):** the seed step
  (`scripts/qa/wow-demo/steps/ops.ts` `seed`) writes `ops.openOverrideUntil = now + 2 h` on the demo store (the same
  write as "Open calls now", audited), and the run asserts both that `N` answers a card at any wall-clock time and
  that, with the override removed in a second pass at a closed hour, `N` answers `outside_window` with `opensAt` — the
  demo never depends on the hour it runs at and never hides the window rule.
- The queue at 390 px and 1440 px in ar, fr and en (Playwright `msedge`, HANDOFF §3): the outcome grid's top edge ≥
  590 px at 390 × 844 and every cell ≥ 44 × 44 px (§13.1 geometry), RTL mirroring with `<bdi>` isolates (phones, ids,
  times never reverse), the keyboard map on desktop (`event.code`), no shortcut firing inside the note field or with a
  sheet open, `axe` 0 serious violations, the end-of-day line after Offline.
- **Offline simulation**: Playwright `context.setOffline(true)` between tapping `1` and the response → "Saving…", the
  retry fires on `setOffline(false)` within 30 s with the same `Idempotency-Key`, one `call_attempt` row, "Saved"; a
  reload during the window resumes the pending entry from `sessionStorage`; the entry never contains a phone.
- `qa/admin-visual/shoot.mjs --scan-only` over every new screen (no orange), `scripts/qa/admin-tokens-check.ts`,
  `test:admin-motion` and `test:admin-rtl` (core §J.1) on the operations components; **rev 3:** every operations
  screen shot in `fr` as well as `en` (OD58: no untranslated key visible, the shell's missing-key marker is asserted
  absent), and the queue, delivery lane and inbound field at 390 px in `ar`.
- **Step-up on full-phone files (rev 4, OD64):** a manager session older than 5 minutes since its last step-up asks
  for `/orders/export` and `/orders/carrier-csv` → `step_up` (no file, no `orders.exported` / `orders.carrier_exported`
  audit row); after the password re-entry (no TOTP enrolled) or a TOTP code, the same request downloads and the audit row
  names the method (`meta.stepUp`); order slips stay one click.
- **Impersonation canaries (rev 3, OD61):** a staff session impersonating the fixture store loads `/orders`,
  `/orders?order=<id>`, `/queue`, `/customers`, `/customers/<id>`, `/integrations`; the HTML and every RSC payload
  contain no customer name, address, landmark or note canary (PLA-§O.3 set); "Show number", Export, Carrier file and
  print are absent; the ribbon says "customers masked".
- Latency budgets (p75 on the local production build with 200 open orders and 10 online agents, the table of
  §13.2): Next ≤ 300 ms server / ≤ 1.2 s on 4G, outcome + next ≤ 500 ms / ≤ 1.5 s, reveal ≤ 200 ms / ≤ 0.8 s, drawer
  open ≤ 400 ms, orders list first page ≤ 400 ms, board payload ≤ 300 ms, `/integrations` ≤ 400 ms; a run above a
  budget fails.

### OPE-§O.4 Proven by: feature id → test (rev 4, CRIT17, OD65)

One row per id of OPE-§1. **Proven by** names the script (or e2e step) and the fixture; **Asserts** is the checkable
statement that fails when the feature breaks. A test script cites the ids it proves in its header comment (`// proves:
OP-03, SF-07`), and `scripts/qa/ops-check.ts` fails when an id of this table is cited by no script of its track
(R2 / R3 ids are checked once their track's script exists, OD65). Ids marked *later* are not built; their proof is the
gate of OPE-§25.6.

| ID | Proven by | Asserts |
|---|---|---|
| OP-01 | `test:state` (96-cell golden table, every transition cell) · `test:ops` (writer lint) | every legal / illegal cell answers per §3.2 and its class; `projectStatus` = golden table; only `transition.ts` and `createOrderRow` write the four state columns |
| OP-02 | `test:ops-db` (timeline fixture order) | each move, attempt, edit, reveal, assignment and note writes exactly one event; the timeline is newest first with masked phones; a note edit after 5 min or by another member is refused |
| OP-03 | `test:queue` (200 claims / 50 orders, fake clock) · `qa:wow-demo` `ops` step | 50 distinct winners, 150 `empty`; claim ≤ 300 ms p75; first `N` sets `online`; the heartbeat keeps a 15-min lease; `attempt_failed` before callbacks; outside the window → `outside_window` |
| OP-04 | `test:ops` (ladder, fake clock) · `test:state` (`bad_hold`) · `test:queue` (callback owner first) | every outcome writes `call_attempt` + its move; `due_at` = `ladderNext` snapped into the window; a callback reaches its agent before the grace; `shipAfter` outside (now, +60 d] → `bad_hold`; the delivery-lane grid refuses confirm outcomes |
| OP-05 | `test:conversions` templates section (40 order fixtures) · `test:ops` (schema caps) | 0 numbers not present in the order or settings; an empty `eta_text` removes every timing sentence; a 13-step script or a 7th objection fails the schema |
| OP-06 | `test:ops-db` (duplicate predicate) · R2 merge: `test:carriers` (S4) | same phone with an open order inside the window flags both; Keep both hides the pair; test orders match test orders only; R2: merged total = Σ line totals + one fee, refused across phones or after shipping |
| OP-07 | `test:ops` (no phone field in list / card / timeline types) · `test:tenancy` · e2e queue | no full phone in any list payload; every reveal writes `phone_revealed`; agents get neither the export button nor the route |
| OP-08 | `test:ops-db` (manual v2 parity with `test:offers` fixtures, `idem` replay, edit re-price, in-transit contact edit) · `test:ops` (single `insert(orders)`) · R2: `test:storefront-db` (S1) | manual v2 total = public total; a replayed `idem` returns the first order; a shipped order accepts only `address` / `landmark` / `note` with `inTransit: true`; R2: manual v3 total = public v3 total |
| OP-09 | `test:ops-db` (bulk on 200 ids) · e2e orders list | per-order results with reasons; 201 ids refused; undo restores the exact states only while `rev` is unchanged and within 10 s |
| OP-10 | `test:ops` (KPI formulas, minimum n) · `test:ops-db` (rollup) | every KPI returns `Kpi` with its `n`; below the minimum no rate; the nightly rows equal a full recompute byte for byte |
| OP-11 | `test:ops-db` (`queueCounts` on the seeded store) · e2e board | tiles equal the recomputed counts; the board polls every 15 s and gets `304` when unchanged |
| OP-12 | `test:ops-db` (block-and-cancel) · `test:tenancy` | open pre-ship orders move to `fake` / `cancelled` (`blocked`) with events, shipped ones listed untouched, no other store's order changes |
| OP-13 | `test:ops` (`cityKey` / `normalizeCity` fixtures, `city-key.json`) | exact and alias set `city_key`; fuzzy only suggests (no write); "Autre" → `null` |
| OP-14 | `test:ops` (flags read from `risk.ts` source) · `test:i18n-coverage` | every flag has a sentence in ar / fr / en; top 3 by points; calibration hidden below 30 decided |
| OP-15 | `test:money` (S3, ledger replay) | confirmed then delivered → one earned entry; refused → void; return after payment → one clawback; payouts exclude pending and void; integer cents |
| OP-16 | R1: `test:conversions` sheets section · `test:ops` (Carrier CSV writer) · `test:ops-db` (Carrier CSV) · R2: `test:carriers` (S4) | R1: "Tracking" pulled → `tracking_ref` and pre-ship → `packed`; the Carrier CSV has the saved columns, `;`, BOM, national digits, refuses held orders, moves to `packed` once; R2: manifest / tracking / status round trip with `{ state, reason }` |
| OP-17 | e2e queue run · `test:ops` (key map ∩ chords = ∅) | each key works on desktop; none fires inside the note field or with a sheet open; `event.code` matches on an Arabic layout |
| OP-18 | `test:carriers` (S4, assignment rules table) | first match wins in list order; disabled rules ignored; a rule routes only while one of its agents is live |
| OP-19 | `test:carriers` (S4, fake clock) | 61 reveals in an hour notify once; 121 pause for 15 min; a manager lifts the pause (audited) |
| OP-20, OP-27 | D2's adapter suite (recorded carrier fixtures; core §K.5 names the script) | idempotent create, status-map coverage, webhook signature, timeout and retry before registration |
| OP-21 | D2's adapter suite | unknown hook key → 404 in constant time; ≤ 50 shipments polled per store per tick |
| OP-22 | D2's R3 finance cases | a reship is a linked shipment; restock / damaged recorded; finance books the return fee once |
| OP-23, OP-24 | D2's messaging suite | `X-Hub-Signature-256` vectors; idempotent on `wamid`; Confirm → `confirmed` with actor `bot`; the OTP path only at `risk ≥ otpRiskMin` and never delays the call path |
| OP-25, OP-26 | D2's R3 cases | leaderboard `off` by default, earnings never shown to other agents; routing pre-selects the city's account with its fallback |
| OP-28, OP-29, TN-14 | *later* (§25.6) | not built; no proof until its gate opens (the cross-store refusal network stays excluded by `test:tenancy` like any cross-store read) |
| SF-04 | `test:profit` (golden fixtures) | `E_placed`, BE_CPA and the Wilson interval match the goldens; no rate below n = 30; zero costs → prompts, no numbers; alerts fire once and clear |
| AC-01 | `test:money` (S3) | the snapshot is frozen at `shipped`; a later cost edit leaves past profit unchanged; lookup variant → item → sku → product |
| AC-02 | `test:money` (S3) | estimate vs statement actual per carrier × city; finance uses the actual when present; the COD fee base formula |
| AC-03 | R1: `test:profit` (`spendStoreCents`) · R2: `test:imports`, `test:money` (S3) | a day without a rate is excluded and counted, never converted 1:1; foreign CSV rows need a rate; recurring expenses idempotent per occurrence |
| AC-04 | `test:money` (S3, `finance_daily` golden store) | delivered revenue = Σ `collected_cents`; net = delivered − refunds − costs; placed and delivered never share a tile (OD38 lint) |
| AC-05 | R1: `test:profit` · R2: `test:money` | break-even at the store's own c × d with n ≥ 30 and the interval |
| AC-06 | `test:money` (S3, golden statements) | duplicates, partial payments, fee differences, unknown and probable lines; idempotent re-import; ageing per `statement` account only |
| AC-07 | `test:money` (S3) | a closed month re-exports byte-identical (sha256) after a late line; XLSX = CSV cell for cell; no phone, address or note canary in any file |
| AC-08 … AC-11 | D2's R3 finance cases | campaign matching leaves unmatched spend day-level; every tax figure labelled "estimate"; XLSX reader = CSV twin; inventory value = Σ qty × unit cost − delivered at average cost |
| AC-12 | *later* (§25.6) | not built |
| IN-01 | `test:integrations-db` (fake `gapi`) · `test:conversions` sheets section · `test:tenancy` | ≤ 1 read + 1 append + 1 batchUpdate per store per tick; ownership proof; 429 breaker; oldest-pending order of service; B's sheet never moves A's orders |
| IN-02 | `test:conversions` (trigger matrix) · `test:render` | trigger ≠ `order` → thank-you without the pixel chunk; one Purchase per pixel at the trigger with `event_id = orderId`; 7 d − 1 h guard |
| IN-03 | `test:tenancy` (T4, tokens keyed by store and pixel) · `test:integrations-db` | a token of store A never signs store B's event; health row per pixel ≤ 1 write / min |
| IN-04 | `test:conversions` telegram section · `test:integrations-db` | batch ≤ 10 orders; "[TEST]" only with the switch; `429` waits `retry_after`; no cash-held line for `at_delivery` |
| IN-05 | `test:conversions` templates section | URL ≤ 2,000 chars with optional blocks dropped first; the order id always stays |
| IN-06 | `test:health` (`int:turnstile` fixture) · e2e anti-spam page | the issue fires above 20 % failures with n ≥ 20 and is silent below |
| IN-07 | `test:webhooks` (S5) | Standard Webhooks vectors; two signatures during rotation; the SSRF address table (IPv4, IPv6, mapped) |
| IN-08 | the Mailer's own tests (platform.md, S5) | only the digest and `payout_ready` templates are sent by operations |
| IN-09 | R1: `test:conversions` sheets section (four headers) · R2: S5's extension of `src/lib/sheets/selftest.ts` | R1: "Agent", "Note agent", "Tracking", "Transporteur" pulled inside the one read; R2: "Refusé : prix" → `refused_price`, a `sheets_sa` store skips the platform bucket |
| IN-10 … IN-13 | D2's R3 suites | hashed scoped keys; feeds tokenised and 404 after rotation; Shopify CSV grouped by handle with SSRF-safe images; TikTok offline events only after the documented values |
| IN-14 | *later* (§25.6) | not built |
| SF-07 | `qa:wow-demo` `ops` step (RF §4 rows 2:15-2:50) | owner session presses `N` (override seeded) → masked card ≤ 300 ms, a second agent never gets the same order, `C` writes `phone_revealed`, `1` confirms with attempt → confirmed on the timeline; without the override at a closed hour → `outside_window` |
| SF-05 | `test:ops-db` (exclusions table of §3.6) · `test:test-orders` (P3) · `qa:wow-demo` | the board, KPIs, Profit lite and `finance_daily` read the same before and after a test order; Sheets and CAPI mocks receive nothing |
| SF-06 | `test:pulse` (P2) with the ops / integrations contributors | each contributor ≤ 50 ms; a failure omits its keys; per-user parts never cached across users |
| SF-03 | `test:health` (P1, two-store fixture) | each ops / integrations rule fires on its fixture, is silent below `minN`, and never reads another store |
| SF-09 | `test:money` (S3) · `test:carriers` (S4) | match states on order and shipment; the cash-held footer identity; `at_delivery` orders never age |
| SF-11 | `test:ops-db` (`opsAggregates` on 50,000 orders) | ≤ 400 ms; cells under 5 suppressed; no customer canary in any cell; city keys are slugs, NULL → `"*"` |
| SF-01 | `test:kit` (P3) · `test:ops-db` (`angle` dim) | the by-angle table shows counts and rates with n and no CPA per angle |
| LP-04, LP-06, LP-11 | `test:conversions` (`thank_you_confirm`) · `test:leads` (P3) | the thank-you WhatsApp text renders from stored facts only; `convertLeadToOrder` dispatches on `sel.v`, answers `already_converted` the second time and `not_found` across stores |
| PL-07, PL-18 | `test:platform` (P1) · PLA-§O.3 canaries · `test:ops` (console row types) | console rows carry first name + initial and a masked phone only; `recordPlatformReveal` is the only unmasking read |
| AI-15, AI-23 | `test:ai-eval` (P7) · `test:conversions` | drafts are one per (page, locale) and carry no phone / name / address pattern; agents never see a `draft` row |
| PL-09 | `test:ops-db` (export-zip writers) | `orders.csv` carries full phones; no Telegram token, carrier credential, webhook secret or `capi_ctx` in any file |
| UX-02 | `test:ops-db` (search provider) · `test:tenancy` | ≤ 120 ms; agents get their own queue plus the exact-phone inbound lookup only; results masked; B never finds A's orders |

---

## OPE-§P. File ownership (consistent with core §K)

The P4 and P5 rows are **core §K.2's lists verbatim** (every [Q.9] and [Q.17] path of revision 1 is now in them; the
extension files of core §K.3 are named per track). New files of this revision are marked **rev 2** and all fall inside
a folder the core already assigns.

| Track | Owns (create / modify / delete) |
|---|---|
| **P4 CALL CENTER** (R1) | `src/lib/orders/{state.ts, events.ts, queue.ts, customers.ts, duplicates.ts, manual.ts, address.ts, risk-explain.ts, admin.ts, transition.ts, edit.ts, masking.ts, profile.ts, export-zip.ts, state.selftest.ts}`, `src/lib/orders/hooks/ops.ts`, `src/lib/callcenter/**` (rev 2 adds `aggregates.ts` for OPE-§27.6 and `idem.ts` for OD36; **rev 3 adds `inbound.ts` (OD53), `carrier-csv.ts` (OD55), `window.server.ts` (the `callingWindowFor` stub, OD57)**; **rev 4: `window.ts` exports `EffectiveWindow` / `CallingWindow` keyed by ISO weekday and `window.fixtures.ts` is the shared window fixture P3 and S1 read, CRIT3**), `src/lib/finance/lite/**` (rev 2 adds `cents.ts`, OD35; rev 3 adds `ad-rates.ts`, OD56), `src/lib/admin-data/orders.ts`, `src/app/app/[store]/{orders,queue,customers,finance}/**`, `src/app/app/[store]/team/{agents,callcenter}/**`, `src/app/api/app/[store]/{orders,ops}/**` (rev 2: `ops/{next,outcome,reveal,presence,state}/route.ts`, `orders/{export,print}/route.ts`; **rev 3: `orders/carrier-csv/route.ts`**), `src/components/admin/{orders,queue,customers,agents,callcenter,finance}/**` (**rev 3: `callcenter/calling-window.tsx` is the one hours editor, imported by P3's thank-you card after the P4 merge, OD57**), `src/lib/settings/keys/{ops,accounting}.ts`, `src/lib/health/rules/ops.ts`, `src/lib/pulse/contributors/ops.ts`, `src/lib/notify/kinds/ops.ts`, `src/lib/flags/defs/ops.ts` (`finance_lite`), `src/lib/admin-data/search/ops.ts`, `src/components/admin/shell/commands/ops.ts`, `src/components/admin/shell/nav/ops.ts`, `src/lib/i18n/admin/<locale>/ops.ts` (+ the R1 lite `finance.ts` keys; **rev 3: `fr` files complete in R1, OD58**), `src/lib/jobs/tracks/ops.ts`, `scripts/qa/{ops-check,queue-check,ops-db-check,profit-check}.ts`, `scripts/qa/tenancy-cases/ops.ts` (rev 2, core §F.1), `scripts/qa/wow-demo/steps/ops.ts` (core §K.2 rev 2.1; rev 3 adds the `seed` step of OPE-§O.3), **`scripts/qa/fixtures/city-key.json`** (rev 3, OD47: the parity fixture P3 and S1 read, owned here because `cityKey` is this part's); appends to `src/lib/orders/contract.ts` status labels go through the maintainer (core §Q.4 Q.9a) |
| **P5 INTEGRATIONS** (R1) | `src/lib/sheets/**`, `src/lib/pixels/**`, `src/lib/orders/{conversions.ts, conversions-core.ts}`, `src/lib/orders/hooks/integrations.ts`, `src/lib/integrations/**` (templates, telegram, whatsapp builtins; rev 2 adds `deliveries.ts` for OPE-§28), `src/lib/jobs/handlers/{capi,telegram}.ts`, `src/app/app/[store]/integrations/**` (incl. the rev 2 health strip and deliveries page), `src/app/app/[store]/settings/anti-spam/**`, `src/app/api/app/[store]/sheets/**`, `src/components/admin/{pixels,integrations}/**`, `src/components/admin/settings/sheets-wizard.tsx`, `src/lib/settings/keys/{sheets,conversions,notifications,telegram,export_key,pixel_library,pixel_health,tracking_secrets}.ts`, `src/lib/health/rules/integrations.ts`, `src/lib/pulse/contributors/integrations.ts`, `src/lib/notify/kinds/integrations.ts`, `src/components/admin/shell/commands/integrations.ts`, `src/components/admin/shell/nav/integrations.ts`, `src/lib/i18n/admin/<locale>/integrations.ts`, `src/lib/jobs/tracks/integrations.ts`, `scripts/qa/{conversions-check,integrations-db-check}.ts`, `scripts/qa/tenancy-cases/integrations.ts` (rev 2) |
| **S3 MONEY** (R2) | `src/lib/finance/**` (takes over the lite files), `src/lib/imports/**` (**rev 3: incl. `xlsx-write.ts`, the writer S4 and the Carrier CSV route import, OPS-27**), `src/lib/orders/hooks/money.ts`, `src/lib/jobs/tracks/money.ts`, `src/app/app/[store]/finance/**`, `src/components/admin/finance/**`, `src/app/api/app/[store]/{imports,finance}/**`, `src/lib/settings/keys/accounting.ts`, `scripts/qa/money-check.ts`; **rev 3:** the drawer's Money block actions `refundOrderAction`, `confirmProbableMatchesAction` (`src/app/app/[store]/finance/actions.ts`) |
| **S4 LOGISTICS** (R2) | `src/lib/carriers/**` (**rev 3: incl. `adapters/self.ts`, OD52**), `src/lib/shipping/**` (**rev 4: incl. `manual-actions.ts`, the sheet's thin v3 `storeAction` wrappers, OPE-§11.5**), `src/lib/orders/merge.ts`, `src/lib/callcenter/{rules.ts, reveal-alarm.ts}`, `src/lib/jobs/tracks/logistics.ts`, `src/app/app/[store]/shipping/**`, `src/components/admin/shipping/**`, **`src/components/admin/orders/manual/**` (incl. rev 4 `mode.ts`, `manualSheetMode`) and `src/app/api/app/[store]/orders/carrier-csv/route.ts` (taken over from P4 in R2: the store-mode branch of the manual-order sheet and `format=xlsx`)**, `src/app/api/app/[store]/shipping/**`, `src/lib/settings/keys/carrier_credentials.ts`, `scripts/qa/carrier-check.ts`. **rev 4 (CRIT4; core §K.4):** the v3 order functions `quoteManualOrderV3` / `createManualOrderV3` / `editOrderV3` are **S1's** (`src/lib/catalog/order-v3.server.ts`, STO-§16.9); revision 3's `src/lib/orders/{manual-v3,edit-v3}.ts` do not exist. **S1 STOREFRONT** (storefront.md) exposes those three functions, `priceLine`, `storeDeliveryFee`, `productAsPageDoc` and `src/components/admin/catalog/product-picker.tsx` for the sheet; S4 never writes under `src/lib/catalog/**` |
| **S5 INTEGRATIONS 2** (R2) | `src/lib/webhooks/**`, `src/lib/security/ssrf.ts`, `src/lib/jobs/handlers/webhook.ts`, `src/lib/orders/hooks/webhooks.ts`, `src/app/app/[store]/integrations/webhooks/**`, `src/lib/sheets/**` (IN-09 changes), `src/lib/settings/keys/sheets_sa.ts` |
| **D2 CARRIERS & MESSAGING** (R3) | `src/lib/carriers/adapters/**`, `src/lib/whatsapp-cloud/**`, `src/lib/jobs/handlers/{whatsapp,carrier}.ts`, `src/lib/jobs/tracks/messaging.ts`, `src/app/api/hooks/{carrier,whatsapp}/**`, `src/app/api/v1/**`, `src/lib/api/**`, `src/app/s/[store]/feeds/**`, `src/lib/imports/xlsx.ts`, the R3 slices of `src/lib/finance/**` (AC-08 … AC-11), `src/app/app/[store]/integrations/api/**` |

Read-only for every operations track (CCR through the maintainer): `src/lib/orders/{contract.ts, validate.ts,
create.ts, text.ts, risk.ts, upsell.ts, versions.ts, hooks.ts}`, `src/lib/page/**`, `src/landing/**`, `src/lib/render/**`,
`src/lib/markets/**`, `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, the registries of core §K.3 (`pulse`,
`notify`, `flags`, `health`, `commands`, `nav`, `i18n/admin/index.ts`, `jobs/registry.ts`). **rev 3:** `createOrderRow`
lives in `src/lib/orders/create.ts` (T3, R1.0) and is called, never edited, by P4 and S4 (OD62).

**Overlap check (rev 3, ENGC-8; rev 4 re-checked against core rev 3).** Core §K.2's P2 row now reads
"`src/app/app/[store]/team/**` except `team/{agents,callcenter}/**`" (P4's), core §K.4's S4 row carries the sheet and
the Carrier CSV route and names the v3 functions S1's, and `scripts/qa/ownership-check.ts` (`test:ownership`, core
§J.1) is the mechanical check; this table matches those rows. No file in this table is listed by another part spec;
the cross-track imports (P3's thank-you card → `CallingWindowEditor`; P3 and S1 → `window.fixtures.ts` and
`city-key.json` as read-only test data; S4 → S1's product picker, `priceLine` and the v3 functions) are imports of
finished modules in merge order, not shared ownership. R2 / R3 test cases are written into the R2 / R3 owner's script,
never into P4's or P5's files (OD65).

---

## OPE-§Q. Requests to the core (revision 1, all decided in core rev 2 §Q.4)

Each request named the core section it changed and the exact change. **Core revision 2 accepted all 25 as written**
(core §Q.4, "A" on every row) and integrated them: Q.1, Q.2, Q.12 → core §D.2; Q.3 → §A.3.1, §A.3.2, §D.10; Q.4, Q.5 →
§D.3, §D.5, D63 and the `finance_lite` flag in §D.4; Q.6 → §H.3, §J.1, §K.1 T3; Q.7 → §K.1 (`src/lib/orders/hooks.ts`);
Q.8 → §K.2 P0 stubs (widened by LAN Q17 and PLA Q.11 with `appendOrderEvent` and the console reads, OPE-§27.1); Q.9 →
§K.2 P4 / P5 rows and §K.1 T3 (`newOrderId`); Q.10 → §D.6; Q.11 → §H.2, §E.2, §E.8; Q.13 → §I.4, §B.4, §B.10; Q.14 →
§G.7, §F.9; Q.15 → §D.3, §D.6; Q.16 → §I.6; Q.17 → §I.1, §K.2 P5; Q.18 → §K.4; Q.19 → §C.3, §C.4, §C.5, §D.2, §K.5;
Q.20 → §F.9; Q.21 → §E.8; Q.22 → §H.2; Q.23 → §F.5; Q.24 → §H.1; Q.25 → §D.6, §D.8. The table is kept as the record of
what was asked; the body of this document now cites the core sections, not the requests.

| # | Core section | Exact change | Why |
|---|---|---|---|
| Q.1 | §D.2 `orders` (0005) | Add `rev int NOT NULL DEFAULT 0`, `confirmed_by varchar(26) NULL`, `confirmed_at datetime(3) NULL`, `first_touch_at datetime(3) NULL`, `shipped_at datetime(3) NULL`, `delivered_at datetime(3) NULL`, `final_at datetime(3) NULL`, `landmark varchar(160) NULL`, `adjust_cents bigint NOT NULL DEFAULT 0`, `sheet_label varchar(20) NULL`, `sheet_dirty tinyint NOT NULL DEFAULT 0`, `capi_ctx text NULL`; indexes `orders_confirmer_idx (store_id, confirmed_by, confirmed_at)`, `orders_money_idx (store_id, money_state, delivered_at)`, `orders_dirty_idx (store_id, sheet_dirty)`. Document that `merged_into` holds "duplicate of" in R1. | OD4, OD17, OD21, OD22, OD15; KPIs, queue, cash held and Sheets need them as columns, not event scans. |
| Q.2 | §D.2 `orders` 0005 note, `src/lib/orders/contract.ts` | Append `lost` (fr "Perdue", `#E8EAED`) after the core's `refused`, `duplicate`, `unreachable`, `in_transit`, with the fr labels and colours of OPE-§3.3 ("Refusée", "Doublon", "Injoignable clôturée", "En livraison"); `STATUS_TEXT` colours likewise. | OD3; a lost parcel is not a return; `unreachable` must not reuse "Injoignable" (taken by `no_answer` in existing sheets). |
| Q.3 | §A.3.1, §A.3.2, §D.10 | (a) `shipments.write` release **R1** for owner, admin, manager (logistics stays R2); (b) `finance.read`, `finance.write` release **R1** for owner and admin (accountant stays R2); (c) store key `accounting` exists in R1 with the lite fields of OPE-§2.9; (d) new store keys `sheets_sa` (S, secret, R2, operations), `whatsapp_cloud` (S, secret, R3, operations), `feeds` (S, secret, R3, operations); (e) §A.3.1 text: "WhatsApp templates" under `integrations.manage` becomes "WhatsApp Cloud API connection"; click-to-chat templates and quick replies sit under `callcenter.configure` (OD24). | Ship moves and order slips exist in R1 (Sheets statuses, manual moves); Profit lite (OD25); IN-09, OP-23, IN-11 secrets. |
| Q.4 | §D.3, §D.5 (0005) | New tenant table `integration_status` (OPE-§2.6), owner operations. | One health row per integration target; settings are the wrong place for counters (every write would audit and invalidate caches). |
| Q.5 | §D.3, §D.5, §D.6 | Move `product_costs`, `carrier_rates` and `ad_spend_daily` from 0006 to **0005** with the OPE-§2.7 shapes (`carrier_rates.carrier_account_id varchar(26) NOT NULL DEFAULT ''`); new 0005 table `profit_alerts` (OPE-§2.6); seed the release flag `finance_lite` (kind `release`, default `true`). | Profit lite in R1 (OD25); the flag lets the maintainer defer it without a schema change. |
| Q.6 | §H.3, §D.5 `render_jobs`, render context (T3 files `src/lib/render/**`, `src/landing/document.tsx`) | (a) the store render context gains `purchaseInBrowser: boolean` per page (= `triggerFor(page) === "order"`), and the thank-you document omits the `pixels` chunk when it is false; (b) append `conversions` to `render_jobs.reason`; (c) operations calls `enqueueRenders(scope, pageIds, "conversions", 4)` when the trigger or an override changes; (d) a render-check fixture for both cases. | OD18: no browser Purchase when the trigger is not `order`, with zero runtime bytes and runtime config v2 unchanged. |
| Q.7 | §K.1 C0 `src/lib/orders/hooks.ts` | Freeze the registry with the `OrderHook` / `OrderHookEvent` shapes of OPE-§3.6 (phases `inTx` with a transaction handle and `afterCommit`; events `created`, `transition`, `edited`), `runOrderHooks(on, phase, scope, event, tx?)`; T3's `create.ts` calls `runOrderHooks("created", "afterCommit", …)` after the insert (inside `after()`), passing the built `PurchaseConversion` (or null). | OD6; CAPI, Telegram, webhooks and commissions must be as durable as the state change. |
| Q.8 | §K.2 step P0 frozen stubs | Add: `cityKey`, `normalizeCity` (`src/lib/orders/address.ts`), `maskPhone`, `maskPhonesIn` (`src/lib/orders/masking.ts`), `transitionOrder`, `applyExternalStatus` (`src/lib/orders/transition.ts`), `projectStatus`, `legacyToWanted` (`src/lib/orders/state.ts`), `opsPulse`, `releaseAllLeases` (`src/lib/orders/queue.ts`), `convertLeadToOrder` (`src/lib/orders/manual.ts`), `renderTemplate`, `orderTemplateValues` (`src/lib/integrations/templates.ts`, P5), `scheduleSheetPush` (`src/lib/sheets/push.ts`, P5), `markLeadConverted` (`src/lib/orders/leads.ts`, P3). | P3 and P5 merge before / after P4 and need these signatures; the console and lifecycle call the read and lease functions. |
| Q.9 | §K.2 ownership; T3 file `src/lib/orders/create.ts` | (a) Add to P4: `src/lib/orders/{transition.ts, edit.ts, masking.ts, profile.ts, export-zip.ts, state.selftest.ts}`, `src/lib/orders/hooks/ops.ts`, `src/lib/callcenter/**`, `src/lib/finance/lite/**`, `src/app/app/[store]/team/{agents,callcenter}/**`, `src/app/app/[store]/finance/**` (R1), `src/components/admin/{agents,callcenter,finance}/**`, `src/app/api/app/[store]/{orders,ops}/**`, `src/lib/settings/keys/{ops,accounting}.ts`, `scripts/qa/{ops-check,queue-check,ops-db-check,profit-check}.ts`; (b) add to P5: `src/lib/orders/hooks/integrations.ts`, `src/lib/settings/keys/{sheets,conversions,notifications,telegram,export_key,pixel_library,pixel_health,tracking_secrets}.ts`, `scripts/qa/{conversions-check,integrations-db-check}.ts`; (c) export `newOrderId` from `create.ts` (or move it to `src/lib/orders/ids.ts`). | Files the operations spec needs that no core list names; manual orders must use the public path's id generator. |
| Q.10 | §D.6 `import_mappings` | Append `manifest` and `expenses` to `kind`. | The manifest is an export mapping; expenses CSV import (AC-03). |
| Q.11 | §H.2 slot 1, §E.2 `forEachStore` | Replace "≤ 2 Sheets calls per store per tick" with "≤ 3 (one read, one append, one batchUpdate); the read also serves the pull"; define the `pending_sheets` predicate = bound and enabled and (`sheet_status` pending / failed past backoff, or `sheet_dirty > 0`, or a pull due); add the platform bucket `p:sheets:sa` 50 / 60 s. | OD22; status and cell updates need fresh row numbers. |
| Q.12 | §D.2 `orders` (0005), T3's public order path, landing.md | Add `is_test boolean NOT NULL DEFAULT false`; the public path sets it when the request carries the store's signed test token (landing.md defines the link; the token = `hmac(exp, "test-order:<storeId>")`, 2 h); `bumpOrderStats` and the core dashboards skip test orders. | SF-05 / OD31. |
| Q.13 | platform.md notification catalog, core §D46 pulse, §B.4 landing path, §B.10 mail templates | (a) Notification kinds of OPE-§21.4; (b) the pulse payload includes `opsPulse` fields (`new_orders`, `due_callbacks`, `queue_now`, `sync_failed`); (c) a member whose role is `agent` lands on `/app/<h>/queue` (after an invite and from `/app/<h>`); (d) Mailer template `payout_ready` (R2). | OD32, OD33; one catalog for every notification. |
| Q.14 | §G.7 `DATA_DIR` areas, §F.9 purge | Add the area `receipts` (`DATA_DIR/receipts/<storeId>/`, R2); the purge deletes `DATA_DIR/{imports,receipts}/<storeId>/`. | Expense receipts (AC-03) are not media; purge completeness. |
| Q.15 | §D.6 (0007) | New tenant tables `wa_messages` and `stock_purchases` (OPE-§2.8), owner operations. | OP-23 idempotency on `wamid`; AC-11. |
| Q.16 | §I.6 tokens (P2 `globals.css`, `admin-tokens-check.ts`) | Add `--info` / `--info-ink` around OKLCH hue 250 (light and dark), used for callbacks and in-transit chips. | No existing token for a calm "scheduled / on the way" state; violet is reserved for impersonation. |
| Q.17 | §K.2 ownership | Assign `src/app/app/[store]/settings/anti-spam/**` to P5 (no track lists it). | IN-06 store screen. |
| Q.18 | landing.md / core hooks (R2) | A lead hook (`onLeadCreated`) so S5 can emit `lead.created` webhooks. | IN-07 event list. |
| Q.19 | §C.3 areas, Worker contract §C.5, §D.2 (0007) | (R3) Area `api-v1` for `/api/v1/**`: platform host only, 404 on store hosts and in the Worker; no cookies read; index `orders_updated_idx (store_id, updated_at)`. | IN-10 REST and polling triggers. |
| Q.20 | §F.9 export ZIP | Add `agent_stats_daily.csv`, `message_templates.csv` (R1) and the R2 files of OPE-§27.4 (`shipments`, `remittances`, `remittance_lines`, `ad_spend`, `expenses` + `receipts/`, `product_costs`, `agent_earnings`, `payouts`, `finance_daily`); state that `capi_ctx`, the Telegram token, carrier credentials and webhook secrets are never exported. | PL-09 completeness without secrets. |
| Q.21 | §E.8 buckets | Add `s:<sid>:claim:<uid>` 120/min, `s:<sid>:reveal:<uid>` 300/h, `s:<sid>:bulk:<uid>` 30/10 min, `s:<sid>:manual:<uid>` 60/h, `s:<sid>:sheets:connect:<uid>` 10/h, `s:<sid>:tg:find` 10/h, `s:<sid>:import:<uid>` 20/day (R2), `s:<sid>:api:<prefix>` 600/10 min (R3), `p:sheets:sa` 50/60 s. | OPE-§L. |
| Q.22 | §H.2 job table | Register the jobs of OPE-§J in their slots (names, budgets, every). | One runner, explicit budgets. |
| Q.23 | §F.5 audit actions | Add `orders.status_forced`, `orders.exported`, `orders.test_deleted`, `integrations.sheets.connected`, `integrations.sheets.disconnected`, `integrations.telegram.changed`, `integrations.conversions.changed`, `callcenter.settings.updated`, `callcenter.calls_opened`; R2 `commissions.rule_changed`, `payouts.approved`, `payouts.paid`, `webhooks.endpoint_changed`, `carriers.account_changed`; R3 `api_keys.created`, `api_keys.revoked`. Store-scoped `blocklist.added` / `blocklist.removed` keep their names with `store_id`. | Audit completeness (SE-04). |
| Q.24 | §H.1 outbox `capi` note | Replace "drops Meta events older than 7 days" with "drops any ad event whose `event_time` is older than 7 days minus 1 hour at send time, and records `capi_stale` on the order". | OD20: a safety margin for clock skew and queue time. |
| Q.25 | §D.5 `agent_profiles`, §D.6 `agent_earnings` (refinements, listed for transparency) | `commission_rule_id` becomes `commission_rule_ids` (JSON array); `agent_earnings` gains `ref` and `entry` and its unique key becomes `(store_id, ref, rule_id, user_id, entry)`. | Several rules per agent; clawbacks and period bonuses need their own rows (OD27). |

### OPE-§Q.26 Second-round requests (revision 2; unavoidable, one row)

Everything else this revision adds lives in track-owned extension files (notification kinds, health rules, pulse
contributors, flags, commands, i18n, tests) or in tables this part may refine, so no other core change is needed.

| # | Core section | Exact change | Why |
|---|---|---|---|
| Q.26 | §F.5 `AuditAction` union (autocomplete; the `(string & {})` fallback already accepts the names), §E.8 buckets | (a) Append the operations audit actions `integrations.outbox.replayed` (R1, `{ kind, topic, outboxId }`), `finance.period_closed` and `finance.period_reopened` (R2, `{ period }`); (b) add the bucket `s:<sid>:replay:<uid>` 30 / h. | OD40 (store-side replay of dead deliveries) and OD41 (period lock) need an audited action and a bucket; the names should exist in the union so `auditFrom()` autocompletes them like the Q.23 set. |

### OPE-§Q.27 Third-round requests (revision 3; from the round-1 review, each names its finding)

Every row changes a core-owned list this part may not edit (the `orders` columns and enums of §D.2, the P0 stub list,
a gauge predicate, a scope kind, the i18n release rule, an ownership glob). Everything else revision 3 adds lives in
tables this part refines or in track-owned files. **Decided in core §Q.8 (revision 3):** Q.27a, b, c, d, e, f, g, i, j,
l, m, n, o **accepted as written**; **Q.27h accepted with a change** (the three v3 functions are S1's, in
`src/lib/catalog/order-v3.server.ts`; S4 keeps the sheet and the `xlsx` route) and **Q.27k accepted with a change**
(`store.confirmation.hours` and `policies.contact.hours` are **removed**, not mirrored; the `accounting` and `ops`
additions accepted). Q.27e's parenthesis "bundled by landing's `assist` and the storefront checkout chunk" was
overtaken by LAN R1 (core §Q.8: `ZoneTable.city` keyed by the posted value): no chunk needs to bundle `cityKey`
(OD47 rev 4). The rows below keep the text as asked; the body of this revision follows the decisions.

| # | Core section | Exact change | Why / finding |
|---|---|---|---|
| Q.27a | §D.2 `orders` 0005 row | Append the enum values `attempt_failed`, `postponed` to `ship_state`; add `ship_after datetime(3) NULL`, `delivery_attempts tinyint NOT NULL DEFAULT 0`, `return_reason varchar(32) NULL`, `confirmed_by_label varchar(60) NULL`, `tracking_ref varchar(64) NULL`, `carrier_label varchar(60) NULL`; index `orders_tracking_idx (store_id, tracking_ref)`. | OD48, OD49, OD50, OD54, OD55 (OPS-2, OPS-3, OPS-4, OPS-8, OPS-9). |
| Q.27b | §D.2 `orders` 0006 row | Append `refunded` to `money_state`; add `collected_cents bigint NULL`, `refund_cents bigint NULL`, `refunded_at datetime(3) NULL`. | OD51, OD59 (OPS-5, OPS-18). |
| Q.27c | §D.2, §D.3, §D.5, §K.1 T3 | Record that `orders.is_test`, `leads.is_test`, `orders_store_test_idx` and `page_slug_history` are cut in **0004** (this part's §2.1 already says so). | ENGC-1 (R1.0 code writes them). |
| Q.27d | §K.1 T3, §K.2 P0, §K.4 STO-R12 | `createOrderRow(draft, ctx)` is extracted from `create.ts:255-300` by **T3 in R1.0** and frozen at P0 (the only insert; P4's manual path and the R2 v3 path call it); §K.4 reads "already extracted in R1.0"; the Q.9c `newOrderId` export is withdrawn. | OD62 (ENGC-13). |
| Q.27e | §K.2 P0 stubs (operations) | Add `callingWindowFor(scope): Promise<EffectiveWindow>` (`src/lib/callcenter/window.server.ts`, P4; the window helpers of `window.ts` are pure and isomorphic); state that `cityKey` / `CityKey` are pure and isomorphic (bundled by landing's `assist` and the storefront checkout chunk). | OD57 (OPS-11), OD47 (OPS-1). |
| Q.27f | §K.2 P0 stubs (landing) | Widen `zoneLineFor(scope, cityKey: CityKey \| null, at?)` and `zoneForCity(zones, key: CityKey \| null)`; `delivery_zones.cities` holds slug keys. | OD47 (OPS-1, blocker). |
| Q.27g | §K.2 P2 row | "`src/app/app/[store]/team/**` except `team/{agents,callcenter}/**`" (P4's); add the P0 glob-intersection script. | ENGC-8. |
| Q.27h | §K.4 contract step, S1 / S4 rows | Freeze `createManualOrderV3`, `quoteManualOrderV3`, `editOrderV3` (OPE-§11.5) at the R2 contract step; S4 owns `src/lib/orders/{manual-v3,edit-v3}.ts` and the store-mode branch of the manual-order sheet; S1 exposes `priceLine`, `storeDeliveryFee`, `productAsPageDoc` and the product picker. | OD62 (OPS-15). |
| Q.27i | §A.4 `agents` gauge | Define the gauge predicate: members with role `agent`; charged at invite acceptance / role change to `agent`, refunded on the reverse; profile rows of other roles never count. | OPS-23. |
| Q.27j | §E.1 `StoreScope` | Add `kind: "user" \| "system" \| "platform" \| "impersonation"` (or the equivalent marker) so repositories can mask under impersonation; `requireStoreMember` sets it with the synthetic membership (§B.8). | OD61 (SEC-5). |
| Q.27k | §D.10 rows `store`, `accounting`, `ops`, `policies` | `store.confirmation.hours` becomes a read-only mirror of `ops.callingWindow` (written by `saveOpsSettingsAction`); the `accounting` R1 lite list adds `myCarrier`, `adAccounts`, `adRates`; the `ops` row adds `windowOverrides`, `rescue`, `agentLabels`, `carrierCsv`; landing's `policies.contact.hours` likewise a mirror. | OD57, OD52, OD56, OD48, OD54, OD55. |
| Q.27l | §I.5 / D36 | For the `ops.`, `int.`, `fin.` prefixes: **fr with en in R1**, ar R3 (`test:i18n-coverage` rule). | OD58 (OPS-17). |
| Q.27m | §F.5 `AuditAction`, §E.8 buckets | Append `orders.carrier_exported` (R1, `{ count }`), `callcenter.label_mapped` (R1, `{ label, count }`), `finance.settings.updated` (R1), `orders.refunded` (R2, `{ cents, method }`); add `s:<sid>:inbound:<uid>` 60 / h. | OD55, OD54, OD52 / OD56, OD59, OD53. |
| Q.27n | §J.3 / §K.2 exit criterion 12, RF §4 row 2:15 | The demo presses `N` from the **demo store owner's** session (not the platform owner's) and the seed sets `ops.openOverrideUntil = now + 2 h`; assert both. | OD60 (OPS-16). |
| Q.27o | §D.5 `product_costs`, §D.6 `carrier_accounts`, `carrier_rates`, `shipments`, `remittance_lines`, `finance_daily` | Record this part's refinements: `product_costs.sku`; `carrier_accounts.settlement` + adapter `self`; `carrier_rates.cod_fee_flat_cents`; `shipments.kind`; `remittance_lines.phone_digits` + `probable`; `finance_daily.refund_cents`, `missing_rates`. | OPS-24, OD52, OPS-25, OD51, OPS-26, OD59, OD56 (refinements §D.9 allows; listed for the registry). |

Notes to the other parts as written in revision 3 (not core requests; carried in `crossFileNotes` of the review
record; **rev 4:** three of them are superseded, marked †, and OPE-§R2's notes give the current text):
- **landing.md**: LAN-§2.1 / §7.1 slug keys and the `null` → `*` rule, † `assist` bundles `cityKey` (OPS-1; rev 4: no chunk
  slugs, the `ZoneTable` is keyed by the posted value, which LAN-§7.1 already says); LAN-§8.3 `{when}` and LAN-§8.4
  hours from `callingWindowFor`, † `Hours` becomes a mirror (rev 4: removed, core D73), the card imports
  `CallingWindowEditor` (OPS-11); LAN-§14.3 "Delete test orders" → `settings.write` (OPS-20, done by landing); LP-16
  pulled to R2 and the `delivery:fee_mismatch` checklist warning (OPS-13, done: core D75); `checkout.addressMode` as the
  one address setting (UX-31, done).
- **storefront.md**: † STO-§12.3 / §15.9 slug keys in `#sg-config` (OPS-1; rev 4: `#sg-config` embeds the `ZoneTable`
  keyed by the posted value); STO-§15.13 step 5 cites `createManualOrderV3` (OPS-15, now S1's own function);
  STO-§15.5 reads `checkout.addressMode` (UX-31); STO-R23 stock hook reads `line_outcome` (OD51).
- **platform.md**: PLA-§7.2 `Masked` type and `maskIfImpersonation` (rev 4 name; the two-argument `maskCustomerFields`
  of revision 3 is withdrawn, CRIT14); PLA-§10.1 preview text "support sees masked customers" (SEC-5); PLA-§22.2
  store-mode onboarding reveal (OPS-14, no operations side; core §A.2 decided it).

---

## OPE-§E. Elevation changes (rev 2)

Every change of this revision, what it does and where it came from. Codes: **OD** = a decision of OPE-§0, **core** =
`docs/STORE-SAAS.md` rev 2, **RF** = rethink-features section, **RA** = rethink-ai section, **DB** = design-baseline
target, **Q** = a revision 1 request as decided in core §Q.4.

| # | Change | Why | Source |
|---|---|---|---|
| 1 | Status → revision 2; inputs widened to core rev 2, both rethinks, the design baseline's type and RTL targets and the anti-slop rubric; code facts re-verified at `ae4e6c0` (`src/**` unchanged since `68c3793`); section map gains §28 and §E | brief item 16; a part spec must be read against the core that decided its requests | header |
| 2 | Owner summary items 14-17 (a phone-only agent day, risk explained with the store's numbers, one integrations page with Replay, accountant-grade exports) | the owner reads this first | header |
| 3 | OD1, OD22, OD24, OD25, OD31, OD32 rewritten from "request" to the core's accepted decision; file lists per core §K.2 | all 25 requests accepted | core §Q.4, D54, D63 |
| 4 | OD33 rewritten: the queue reads the shared pulse's `counts.*` (camelCase keys of core §I.4), only the board polls `/ops/state`, presence is its own POST | two pollers per agent tab were waste; the core froze `StorePulse` | core D57, §I.4; RF §2.2 |
| 5 | **OD36** hot path = four route handlers with `Idempotency-Key`, server and 4G budgets, payload caps | writes < 500 ms and idempotent (core §I.8 rule 1) are not reachable through a page re-render on 4G | core §I.1 (`/ops/**`), §I.8; RF §2.1 rule 1 |
| 6 | **OD37** offline outbox in the console (30 s retry, same key, no PII in `sessionStorage`) | a call center works in stairwells; a result must never be lost or guessed | RF §2.1 rule 1; owner rule "never invent" |
| 7 | **OD38** honest triad by lint; every KPI function returns `Kpi` with its `n` | "placed / confirmed / delivered never share a tile" must be mechanical | core §I.6, §I.8 rule 3; RF §2.1 rule 3 |
| 8 | **OD39** risk calibration from the store's own outcomes per band (`riskBandOutcomes`), coverage test reads `risk.ts` | explainable scores without a model or a cross-store number | RA §4.7; brief "per-store risk with explainable scores" |
| 9 | **OD40** / new **§28**: one integrations page with health strip, deliveries log, Replay, causes and fixes; `integrationHealth`, `sheetsBacklog`, `listDeliveries` | "integrations through the outbox with replay" needs a store-side surface, not only the console | core D24, §H.1, §H.5; brief |
| 10 | **OD41** accountant-grade exports: sha256 header, dictionary, dual dates, `reconciliation_state`, cash journal, cash-held export, `closedThrough` period lock with `late` adjustments | an accountant must tie the file to the carrier's statement and trust that a closed month does not move | brief "accountant-grade exports with reconciliation states"; CO §5.1; SF-09 |
| 11 | **OD42** carriers CSV-first sharpened: header-signature auto-pick, per-account remembered mappings, ≤ 20 mappings, double idempotency, never backwards on the ship axis, preview = report | core D38 made concrete and testable | core D38; brief |
| 12 | **OD43** / new **§27.6**: deterministic aggregates (`opsAggregates`, `attemptStats`, `cancelReasonMix`) with n and suppression under 5 as the only input of the Today brief, AI-17 and AI-23 | insights narrate, never compute | RA §4.2, §9.15; SF-11; core §K.5 (AI R23) |
| 13 | **OD44** best hours to call in R1 at $0 (board strip, card hint, `attemptStats`), learner stays R3 advisory | the rethink's "rules at $0" and the brief's best-time learner | RF §1.5 |
| 14 | **OD45** trilingual tenant notification kinds declared in `notify/kinds/{ops,integrations}.ts` with the core's `NotificationKindDef`; `§21.4` table | core §I.4 contract and `test:i18n-coverage` | core §I.4, D36 |
| 15 | **OD46** abandoned-lease attribution (`released` why `lease_expired`), `abandoned` KPI and stats column, `ops:abandoned` health rule | attempt logging must show what was opened and dropped | brief "attempt logging"; OD8 |
| 16 | §1.4 feature map gains SF-07, SF-05, SF-06, SF-03, SF-09, SF-11, SF-01 contributions and UX-02 rows | every SF-* id the core assigned to this track is traceable | core §K.2 ownership paragraph, §L.2 |
| 17 | §2 notes: every [Q.n] marker now points at its core section; `is_test` core-owned; `orders_created_idx` and `cu_phone_idx` platform-only; `rev` semantics; the 0005 rename mechanics; `agent_stats_daily.abandoned`; `accounting.closedThrough`, `exportLocale`; `notifications.telegram.testOrders` | consistency with core §D.2 / §D.5 / §D.8 / §D.10 | core §Q.4 Q.1, Q.5, Q.12, Q.25; PLA Q.10 |
| 18 | §3.6: hooks accepted (core §K.1); the test-order behaviour of every hook in one table | D54 must be mechanical in every hook | core D54, §H.1, §K.1 |
| 19 | §4.1 `appendOrderEvent` P0 stub (refuses phone patterns in `meta`); event types `lease_expired`, `store_state`, landing's `lead_attributed` / `track_opened` / `zone_not_served` / `kit_shared` | other tracks append events without a transition | core §K.2 P0 (LAN Q17) |
| 20 | §5.2 idempotency cache, ≤ 4 statements after the claim, abandoned attribution step; §5.3 card adds `calibration`, `eta`, `objections`, `bestHoursHint`, ≤ 6 KB gz | the card is the agent's whole screen; it must be complete and small | OD36, OD39, OD44 |
| 21 | §6.1 `OutcomeInput.idem`, `andNext`, `objectionId`; the `/ops/outcome` route shell and 409 behaviour | one round trip per call | OD36 |
| 22 | §7: `confirm_number` / `confirm_hours` read `store.confirmation` (LAN Q10), `withinHours` never a variable; `ScriptDoc.objections` (≤ 6) with built-in honest answers in ar/fr/en; AI drafts per (page, locale), never per customer | Darija scripts per product; nothing invented | RA §4.5, §9.14; core §D.10, §F.11 |
| 23 | §8.2 reveal route ≤ 200 ms and replay-safe | the most frequent tap after Next | OD36 |
| 24 | §10.2 calibration line and the flag-coverage test driven by the source constants | a new flag can never ship without a sentence | OD39; RA §4.7 |
| 25 | §11.1 `createManualOrder` / `convertLeadToOrder` take the core's P0 signatures (`fromLead`, optional `source`), `idem` → `orders.idem` replay | the core froze the signatures; a double submit must not create two orders | core §K.2 P0; OD36 |
| 26 | §12.4 bulk optimistic with rollback and `idem` | core §I.8 rule 1 | core §I.8 |
| 27 | §13 rewritten as "a day in the queue": thumb geometry, one card, flow with budgets table, §13.2a rhythm, §13.2b offline and idempotency, §13.2c accessibility; `X` skip key, `event.code` matching, map registered in the shell's command registry | the brief's "Next order flow an agent on a phone can run all day" | RF §2.1 rules 1, 2, 6; §4; core §I.3, §I.8 |
| 28 | §13.5 binds DB T1, T7, RTL1, RTL2, RTL5, RTL7 and IBM Plex Sans Arabic to the console | RTL-perfect by construction | DB §5; core §I.5, §I.6 |
| 29 | §14.1 board: Abandoned tile, best-hours strip, skips, `queueCounts`; §14.3 three new KPIs and the `Kpi` return type | honest, complete manager view | OD38, OD44, OD46 |
| 30 | §16.2 by-angle table (counts, no CPA per angle) | the kit's results land where the owner decides budgets | SF-01 (RF §1.1 step 5) |
| 31 | §16.7 reconciliation states on order and shipment, `late` adjustments; §16.8 rewritten (OD41) with two new exports | SF-09 and the brief | RF §1.7; OD41 |
| 32 | §18.1, §18.5 CSV-first sharpening (OD42) | core D38 | core D38 |
| 33 | §19.4 test orders disabled at creation (core), `is_test = 0` belt, v3 units, R3 chain; §19.7 budgets 18 / 12 s; §19.8 last-20-runs history | alignment with core D54, §H.2 (PLA Q.18), §D.2 0006 / 0007 | core |
| 34 | §20.3 accepted wording (`purchaseInBrowser`, reason `conversions`, `enqueueRenders(…, 4)`) | core §H.3 carries it | core §Q.4 Q.6 |
| 35 | §21.4 kinds table incl. `ops.abandoned_claims`, `int.delivery_dead`, `fin.period_closed` | OD45 | core §I.4 |
| 36 | §23.5 replay through the core's `replay`; the endpoint log is a view of §28 | one deliveries surface | core §H.1 |
| 37 | §26 test orders: core D54 mechanics restated, `settings.write` as the one delete permission, housekeeping 30 d, the P4 acceptance of `test:test-orders` / `qa:wow-demo` | SF-05 consumption complete and consistent (revision 1 named two permissions) | core D54, §H.11, §J.3 |
| 38 | §27 rewritten: §27.1 console reads with the core's P0 names, §27.2 `HealthRule` files per track with severities and fixes (+ 4 new rules), §27.3 pulse contributors, §27.5 leases on restricted, §27.6 aggregates, §27.7 ⌘K provider and commands | the core froze these extension points and stub names | core §K.2 P0, §I.7, §I.3, §I.4, D57 |
| 39 | §J slot budgets re-cut to the core's rev 2 table (18 / 12 / 13 / 12 / 11 / 8 / 5 / 4 s) | the tick must sum to 95 s | core §H.2 (PLA Q.18, AI R8) |
| 40 | §L eleven new limits (idempotency, card, offline retry, replay, deliveries, mappings, run history, aggregates, period close) | every new behaviour has a bound | OD36-OD44 |
| 41 | §M hot-path routes, print route, `/integrations` page, replay and period actions; `deleteTestOrdersAction` on `settings.write` | routes and permissions complete | OD36, OD40, OD41 |
| 42 | §N new trilingual keys (end of day, saving states, calibration, objection labels) and the tile-key rule | agent-facing strings ship in three languages | OD38, OD45; core §I.5 |
| 43 | §O scripts renamed to the core's (`test:state`, `test:ops`, `test:queue`, `test:profit`, `test:conversions` extended, `test:ops-db`, `test:integrations-db`), P5's offline checks as sections of `conversions-check.ts`, new assertions (idempotency, attribution, 6 KB, triad lint, `Kpi` type, chord disjointness, aggregates ≤ 400 ms, replay no-op, offline simulation, thumb geometry, axe), the wow-demo steps P4 contributes, tenancy cases in `tenancy-cases/{ops,integrations}.ts` | every new contract has a test that fails when it breaks; `package.json` is the maintainer's | core §J.1-§J.3, §F.1 |
| 44 | §P ownership = core §K.2 verbatim with the rev 2 files placed inside owned folders; read-only list gains `hooks.ts`, `src/lib/markets/**`, `package.json`, the registries | no track edits a shared file | core §K.2, §K.3 |
| 45 | §Q marked decided with the core sections per request; §Q.26 the one second-round request (two audit names, one bucket) | the core asked parts to record only contradictions or unavoidable needs | core §Q (closing paragraph) |

Revision 3 (the round-1 review) is recorded **per finding** in OPE-§R below, with the decision OD47 … OD62 each change
rests on; the requests it could not avoid are OPE-§Q.27. Revision 4 (the round-2 review, against core rev 3) is
recorded per finding in **OPE-§R2**, with OD63 … OD65 and the in-place corrections of OD47, OD57, OD61 and OD62; it
adds no request to the core.

---

## OPE-§R. Review decisions (round 1)

One row per finding that named this file or was marked `cross`. **Resolved** = changed in the body (section named);
**cross** = this file's side is done here and the other part's side is listed in OPE-§Q.27's notes; **n/a** = the
finding has no operations side (no change in this file; the owning part answers it). Nothing in this table is only a
note: every resolved row points at a section whose text changed.

| Id | Sev. | Decision | Where in this document |
|---|---|---|---|
| OPS-1 | blocker, cross | **Resolved (OD47)**: the slug `CityKey` is the one key; `cityKey` pure and isomorphic; `zoneLineFor` / `zoneForCity` take `CityKey \| null` (null → `*`); the shared parity fixture `scripts/qa/fixtures/city-key.json`; landing / storefront / core changes requested. *(rev 4: the "chunks bundle `cityKey`" detail is superseded — browser tables are keyed by the posted value; CRIT1, OPE-§R2)* | §0 OD47, §10.1, §5.3 (`eta`), §2.7 `carrier_rates`, §O.1 `test:ops`, §P, §Q.27e / Q.27f |
| OPS-2 | major | **Resolved (OD48)**: `attempt_failed` + `postponed` ship states, `orders.delivery_attempts`, the delivery lane (claim statement, base 650, `ops.rescue`), outcomes `customer_informed` / `reschedule` / `no_answer` / `busy` / `cancel_recall`, view "Delivery problems", board tile, `queueCounts.deliveryRescue`, `statusMap` `{ state, reason }`, `defaultStatusMap` stays empty until real files (D38) | §2.1, §2.2, §2.7, §2.9, §3.2, §3.3, §5.1, §5.2, §5.3, §5.4, §6.1a, §12.1, §13.1, §13.3, §14.1, §14.3, §17.1, §17.2, §21.2, §27.1, §27.2, §N |
| OPS-3 | major | **Resolved (OD49)**: `orders.ship_after`, "Deliver from…" on `confirmed`, holds excluded from To pack / picking / Create shipments / Carrier CSV, "On hold" view, drawer + slips + Sheet header "Livrer à partir du", `ops:hold_passed` | §2.1, §2.2 (`hold_set`), §3.2, §6.1, §12.1, §12.7, §12.8, §17.4, §19.4, §27.2, §M.3 |
| OPS-4 | major | **Resolved (OD50)**: `RETURN_REASONS`, `orders.return_reason`, set by L moves / `statusMap` / R2 label mapping, stored in `state_changed`, `returnReasonMix`, reason column in Refused & returned and the sales register, `city_refusal` evidence, KPI "Return reason mix" | §3.2, §3.4, §2.1, §2.2, §12.1, §14.3, §16.2, §16.6, §16.8, §17.2, §19.9, §27.6, §N |
| OPS-5 | major | **Resolved (OD51)**: `orders.collected_cents` (R2), `line_outcome` event, partial delivery action, `partial` child shipment (`shipments.kind`, `parent_id` in R2), S1 stock hook restocks refused lines, statement `amount_diff` within `accounting.remittanceToleranceCents` adjusts `collected_cents`; `finance_daily.delivered_cents` = Σ collected. The `OrderItemsV3` contract is **not** modified (the per-line state lives in the event, not in the storefront's frozen JSON) | §2.1, §2.2, §2.7 `shipments` / `finance_daily`, §2.9, §3.2, §3.5, §3.6, §12.1, §12.7, §16.6, §16.7, §16.8, §17.4 step 7, §17.5, §L |
| OPS-6 | major | **Resolved (OD52)**: `carrier_accounts.settlement`, the `self` adapter, `accounting.myCarrier.settlement` (R1 default `at_delivery`, confirmed in the Costs tab, `fin:settlement_check`), `delivered` writes `collected` + `remitted` in one transaction, excluded from ageing / `fin.cash_held` / the Telegram line, cash position shows cash in hand, "Mark cash received" bulk | §2.7, §2.9, §3.2, §12.7, §16.2, §16.6, §16.7, §17.1, §17.2, §21.2, §27.2, §M.3 |
| OPS-7 | major | **Resolved (OD53)**: new §5.7 inbound path (`inboundLookup` ≥ 8 digits exact, bucket 60 / h, 10-minute inbound set, Take / inbound outcome / contact edit, attribution with `inbound: true`), §3.5 step 2 and §6.3 fixed, `searchOrders` and the drawer updated, `test:tenancy` and `test:ops-db` cases | §5.7, §3.5, §6.1, §6.3, §9.2, §11.3, §13.1-13.4, §14.3, §27.1, §L, §M.3, §O.2 |
| OPS-8 | major | **Resolved (OD54)**: Sheet header "Agent" → `orders.confirmed_by_label` (mapped label → `confirmed_by`), "Note agent" in R1, `ops.agentLabels` mapping from `/team/agents` with a 90-day backfill, board table "Agents named in your sheet", commissions for mapped labels, the Sheets screen states what needs the queue | §2.1, §2.2, §2.9, §4.1, §12.3, §14.1, §14.2, §14.3, §15.3, §19.4, §19.6, §19.8, §19.9, §27.2, §M.3 |
| OPS-9 | major, cross | **Resolved (OD55), option (a)**: "Tracking" / "Transporteur" pulled in R1 into `orders.tracking_ref` / `carrier_label` (drawer, slips, timeline, `{carrier_tracking}`), tracking implies `packed`, **Carrier CSV** export with the owner's columns (`ops.carrierCsv`, `shipments.write`, audited, `manifest_exported`), R2 shipments mirror the columns; IN-09's two rows moved to R1 | §1.1 OP-16, §1.3 IN-09, §2.1, §2.2 (`tracking_set`), §2.9, §7.1, §12.7, §12.8, §17.4, §19.4, §19.6, §19.9, §M.2, §M.3, §P |
| OPS-10 | major | **Resolved (OD56)**: `accounting.adAccounts[platform].currency` + `accounting.adRates` (owner-typed, dated, "your rate, estimate"), `spendStoreCents`, "needs a rate" rows never converted, the rate printed under the card, `finance_daily.missing_rates`, `fin:ad_rate_missing`. The finding's `ad_rates` **table** is replaced by a setting (same behaviour, no 0005 change) | §0 OD56, §1.2 AC-03, §2.7 `finance_daily`, §2.9, §16.2, §16.5, §27.2, §M.3, §O.1 |
| OPS-11 | major, cross | **Resolved (OD57)**: `ops.callingWindow` is the one source; ISO weekdays (index 0 = Monday); `callingWindowFor(scope)` P0 stub; `hoursText`; `confirm_hours` reads it; `store.confirmation.hours` and `policies.contact.hours` become mirrors written by `saveOpsSettingsAction`; one `CallingWindowEditor` component. *(rev 4: superseded twice — the core removed the two keys instead of mirroring them, and the weekday key is the ISO number 1-7, not an index; CRIT2, CRIT3, OPE-§R2)* | §0 OD9 / OD57, §2.9, §5.5, §7.1, §M.3, §P, §Q.27e / Q.27k |
| OPS-13 | major, cross | **Operations side resolved**: Profit lite shows fee charged vs fee paid per city and `fin:fee_gap` raises the gap; the landing-side pull of LP-16 into R2 and the `delivery:fee_mismatch` checklist warning are landing.md / core items (notes in §Q.27) | §16.2, §27.2, §Q.27 notes |
| OPS-14 | major, cross | **n/a for operations**: store-mode onboarding reveal is platform.md / landing.md (PLA-§22.2, LAN-§4); no operations surface. Recorded in §Q.27's notes to platform | §Q.27 notes |
| OPS-15 | major, cross | **Resolved (OD62)**: new §11.5 `createManualOrderV3` / `quoteManualOrderV3` / `editOrderV3` on `priceLine` + `createOrderRow`, the sheet routed by store mode (S1 product picker), S4 owns the files, R2 contract step freezes the signatures, `test:ops-db` parity "manual v3 total = public v3 total"; `convertLeadToOrder` dispatches on `sel.v`. *(rev 4: superseded — the functions and the parity test are S1's, S4 owns only the sheet; CRIT4, OPE-§R2)* | §0 OD62, §1.1 OP-08, §11.2, §11.4, §11.5, §M.3, §P, §Q.27h |
| OPS-16 | major | **Resolved (OD60)**: the first `N` sets `online` implicitly, `outside_window` stays honest, `qa:wow-demo` seeds `openOverrideUntil = now + 2 h` and presses `N` from the demo store owner's session; the core / RF §4 row asked to say so | §5.2 step 1, §13.2a, §O.2 `test:queue`, §O.3, §Q.27n |
| OPS-17 | major | **Resolved (OD58)**: fr with en in R1 for every `ops.` / `int.` / `fin.` key, ar R3; `test:i18n-coverage` requires fr; the English-only rows of §N translated; the core's D36 exception requested | §0 OD34 / OD58, §N, §O.1, §O.3, §P, §Q.27l |
| OPS-18 | major | **Resolved (OD59)**: `refunded` money state (`collected → refunded`, `remitted → refunded`, M †), `orders.refund_cents` / `refunded_at`, `finance_daily.refund_cents`, drawer "Refund…" (`finance.write`, R2), sales register / cash journal state `refunded`, commission clawback once; designed in 0006 so OP-22 needs no rework | §2.1, §2.2, §2.7, §3.2, §12.7, §15.3, §16.6, §16.8, §L, §M.3, §O.2, §Q.27b |
| OPS-19 | minor | **Resolved (OD60)**: heartbeat renews the held lease inside `touchAgent`, `leaseMinutes` default 15, reveal allowed on an order held in the last 30 minutes | §2.9, §5.2 lease bookkeeping, §8.2, §L |
| OPS-20 | minor, cross | **Operations side unchanged (already `settings.write`)**: §26 and §M.3 are the source; landing.md LAN-§14.3 must say `settings.write` (note in §Q.27) | §26, §M.3, §Q.27 notes |
| OPS-21 | minor | **Resolved**: `address` / `landmark` / `note` editable while shipped (`field_edited.inTransit`, "Tell the carrier" chip, "Changes to pass on" list), `recall_requested` event (`cancel_recall` outcome and the drawer's "More…"), R3 `updateParcel` / `cancelParcel` | §2.2, §6.1a, §11.3, §17.1, §17.4 step 8 |
| OPS-23 | minor | **Resolved**: the `agents` gauge counts members with role `agent` only; stated in §2.4 and §14.2; core §A.4 asked to carry the predicate | §2.4, §14.2, §Q.27i |
| OPS-24 | minor | **Resolved**: `product_costs.sku` third key, lookup variant → item → sku → product, "Costs by SKU" list, SKU prefill, `fin:costs_missing` per SKU | §2.7, §16.2, §16.3, §27.2, §M.3, §O.1 |
| OPS-25 | minor | **Resolved**: COD fee base `max(min, round(collected × bp / 10000)) + flat`, `cod_fee_flat_cents`, the base in words in the rates editor, recomputed at `delivered` from `collected_cents` | §2.7 `carrier_rates`, §16.3, §O.1 `test:profit` |
| OPS-26 | minor | **Resolved**: `remittance` mapping `phone` field, `probable` match (phone + window + amount tolerance, two candidates → `unknown`), confirmed by hand in the preview, never auto-committed; `remittance_lines.phone_digits` | §2.7 `remittance_lines`, §16.7 step 1, §18.3, §O.2 |
| OPS-27 | minor | **Resolved (R2)**: in-house XLSX writer `src/lib/imports/xlsx-write.ts` (S3) for the manifest, the accountant exports and the Carrier CSV `format=xlsx`; `accounting.exportFormat` (`;` default, Windows-1252 option); R1's Carrier CSV already ships `;` + BOM | §2.9, §12.8, §16.8, §18.6, §M.2, §P |
| OPS-28 | minor | **Resolved (OD57)**: `ops.windowOverrides` (≤ 4 dated schedules, "Ramadan hours" preset without dates), evaluated before the weekly table, lazy re-snap of ladders | §2.9, §5.5, §L, §M.3 |
| OPS-29 | minor | **Resolved**: `ops:to_pack_aging` (sev 2) and the board tile "To ship · oldest N d"; `queueCounts.toShip` / `oldestToShipDays` | §14.1, §27.1, §27.2 |
| ENGC-1 | blocker, cross | **Operations side resolved**: §2.1 states `is_test` and `orders_store_test_idx` are cut in 0004 (core-owned); the core's §D.2 / §D.3 / §K.1 wording is requested | §2.1, §Q.27c |
| ENGC-8 | major, cross | **Operations side resolved**: §P keeps P4's `team/{agents,callcenter}/**` and asks the core's P2 row for the exclusion plus the P0 glob-intersection script | §P (overlap check), §Q.27g |
| ENGC-13 | major, cross | **Resolved (OD62)**: `createOrderRow` extracted by T3 in R1.0 and frozen at P0, the only insert (static lint), P4's manual path calls it, `newOrderId` export withdrawn | §0 OD62, §11.1 step 5, §11.5, §O.1, §P, §Q.27d |
| ENGP-24 | minor, cross | **Operations side resolved**: a 25 s wall-time ceiling for the operations scripts of `npm test`, fixtures not corpora, `ops-check.ts` fails above it | §O.1 (wall time) |
| SEC-5 | major, cross | **Resolved (OD61)**: `maskName` / `maskAddress` / `maskCustomerFields` at the repository boundary when `scope.kind === "impersonation"`, static check that every read function calls it, attack-suite canaries on the tenant routes; `StoreScope.kind` requested from the core. *(rev 4: the local helpers are withdrawn; the read functions call the platform's frozen `maskIfImpersonation(scope, row)`; CRIT14, OPE-§R2)* | §0 OD61, §8.1, §O.1, §O.2 `test:tenancy`, §O.3, §Q.27j |
| UX-31 | minor, cross | **Operations side resolved**: the manual-order sheet's address field follows `checkout.addressMode`; the setting itself is landing.md's / storefront.md's | §11.2 |
| ENGP-1, ENGP-3, ENGP-6, ENGP-26 | cross | **n/a for operations** (publish-gate registry, `ai_jobs` unique index, height-estimate thresholds, the landing chunk hash): design.md / ai.md / core / storefront items; no operations surface | — |
| UX-4, UX-20, UX-21, UX-37, UX-38, UX-39 | cross | **n/a for operations** (CTA plan markup, phone reveal layout, commerce register, checkout ergonomics, aurora, cutout path): design.md / landing.md / storefront.md / platform.md items | — |
| SEC-1, SEC-18 | cross | **n/a for operations** (signup sandbox ceilings, brand-impersonation checks): core / platform.md items. SEC-18's "Report this store" link and `abuse_reports` insert are platform's; operations adds nothing | — |
| QUAL-1, QUAL-9, QUAL-10, QUAL-20, QUAL-21, QUAL-25 | cross | **n/a for operations** (copy library and Director mechanics): design.md / ai.md items | — |

**Rejected: none.** Two recommendations were implemented in a different shape, both stated in the body: OPS-10's
`ad_rates` table became the `accounting.adRates` setting (same behaviour, no new 0005 table), and OPS-5's
`OrderItemsV3.lines[].state` became the `line_outcome` event (the storefront's frozen items JSON is not touched).

---

## OPE-§R2. Review decisions (round 2)

Revision 4. One row per finding id of the round-2 review that names this file or is marked `cross` (the round-1 ids
re-checked against core **revision 3**, plus the critic's CRIT ids). **Resolved** = the body changed in this revision
(sections named); **verified** = the round-1 resolution was re-read against core rev 3 and still holds (the sections
that carry it are named, with any rev 4 adjustment); **cross** = this file's side is done and the other side is listed
in the notes below; **n/a** = no operations surface (the owning part or the core answers it). Every "resolved" row
points at a section whose text changed; nothing here is only a note.

| Id | Sev. | Decision (round 2) | Where in this document |
|---|---|---|---|
| OPS-1 | blocker, cross | **Verified + re-aligned (CRIT1)**: slugs for every stored key and server API; the browser's only zone table is landing's `ZoneTable` keyed by the posted `City.value` (core §K.2 P0 `zonesForCheckout`, LAN-§7.1); `cityKey` may be bundled, never required; `city-key.json` gains the `zoneTable` section so P3, P4 and S1 fail together on either shape | §0 OD47, §10.1, §O.1, §O.4 |
| OPS-2 | major | **Verified (OD48)**, tightened: the lane is `ship_state = attempt_failed` only; `postponed` is listed in "Delivery problems" but never handed out (its move clears `due_at`); `test:state` asserts the `due_at` invariant | §0 glossary, §5.1, §5.2, §O.1 |
| OPS-3 | major | **Verified (OD49)**; the store-mode sheet's hold is the two-step of §11.5 step 4 (S1's v3 input has no `shipAfter`) | §2.1, §3.2, §6.1, §11.5, §12.1, §12.8, §17.4, §19.4, §27.2 |
| OPS-4 | major | **Verified (OD50)**; no change | §3.2, §2.1, §12.1, §16.8, §27.6 |
| OPS-5 | major | **Verified (OD51)**; its R2 test cases moved to S4's `test:carriers` and S3's `test:money` (OD65) | §2.1, §3.2, §17.4 step 7, §O.2 |
| OPS-6 | major | **Verified (OD52)**; no change | §2.7, §2.9, §3.2, §16.2, §16.7, §17.2, §21.2 |
| OPS-7 | major | **Verified (OD53)**; the bucket is in core §E.8 (Q.27m) | §5.7, §3.5, §6.3, §9.2, §M.3 |
| OPS-8 | major | **Verified (OD54)**; the mapping audit is now the core's `callcenter.label_mapped` | §14.1, §19.6, §M.3 |
| OPS-9 | major, cross | **Verified (OD55, core D74)**; rev 4 adds the fresh step-up on the Carrier CSV (OD64) and lists the core §B.7 gap | §0 OD64, §8.3, §12.8, §M.2, §O.3 |
| OPS-10 | major | **Verified (OD56)**; the `accounting` additions are in core §D.10 | §2.9, §16.2, §16.5 |
| OPS-11 | major, cross | **Resolved per core D73 (A\*)**: no mirror anywhere (CRIT2), ISO weekday-number keys (CRIT3), never-null `EffectiveWindow` with `configured` so a default never becomes a shopper promise (OD63) | §0 OD57, OD63, §2.9, §5.5, §7.1, §22.2, §M.3, §O.1, §O.2 |
| OPS-13 | major, cross | **Operations side re-aligned to core D75** (LP-16 in R2): `fin:fee_gap` narrowed to fee charged vs carrier rate; zone fee vs page fee is landing's `landing:fee_mismatch` only; aggregate city keys are slugs, NULL → `"*"` | §16.2, §27.2, §27.6 |
| OPS-14 | major, cross | **n/a for operations**: core §A.2 decided (store-mode onboarding creates no landing page; PLA PD60 rev 3) | §Q.27 notes |
| OPS-15 | major, cross | **Resolved per core §K.4 / Q.27h A\* (CRIT4)**: §11.5 rewritten around S1's `src/lib/catalog/order-v3.server.ts` (STO-§16.9 the signature source); the sheet's routing (`manualSheetMode`), `fee_unset` keeps Create disabled, the hold two-step, contact-only edits through `editOrder` | §0 OD1, OD62, §11.2, §11.4, §11.5, §M.3, §P, §O.2 |
| OPS-16 | major | **Verified (OD60; core Q.27n, §J.3)**; no change | §5.2, §13.2a, §O.3 |
| OPS-17 | major | **Verified (OD58; core §I.5)**; no change | §0 OD34, §N, §O.1 |
| OPS-18 | major | **Verified (OD59)**; audit `orders.refunded` named; R2 tests in S3's `test:money` | §3.2, §M.3, §O.2 |
| OPS-19 | minor | **Verified (OD60)**; no change | §2.9, §5.2, §8.2 |
| OPS-20 | minor, cross | **Verified**: landing fixed LAN-§14.3 to `settings.write` (core §H.11); §26 stays the source | §26, §M.3 |
| OPS-21 | minor | **Verified**; rev 4 routes contact-only edits of v3 orders through `editOrder` so the in-transit exception exists once | §11.3, §11.5 step 5, §6.1a, §17.4 step 8 |
| OPS-23 | minor | **Verified (core §A.4, Q.27i)**; no change | §2.4, §14.2 |
| OPS-24 | minor | **Verified (core Q.27o)**; no change | §2.7, §16.2, §16.3 |
| OPS-25 | minor | **Verified**; rev 4 records that this section is the cut list (`cod_fee_flat_cents` / `cod_fee_bp` `NOT NULL DEFAULT 0`) and lists core §D.6's nullable wording for the maintainer | §2.7 |
| OPS-26 | minor | **Verified**; R2 tests in S3's `test:money` | §2.7, §16.7, §18.3, §O.2 |
| OPS-27 | minor | **Verified (core §K.4 S4 `format=xlsx`)**; no change | §2.9, §16.8, §18.6 |
| OPS-28 | minor | **Verified**; `windowOverrides[].days` uses the ISO weekday-number shape (CRIT3) | §2.9, §5.5 |
| OPS-29 | minor | **Verified**; no change | §14.1, §27.1, §27.2 |
| ENGC-1 | blocker, cross | **Verified**: core rev 3 cut `is_test`, `orders_store_test_idx` and `page_slug_history` in 0004; §2.1 says so | §2.1 |
| ENGC-8 | major, cross | **Resolved**: core rev 3 carries the P2 carve-outs and `test:ownership`; §P's stale sentence ("the current core text lists the whole `team/**`") deleted, S4 row aligned with core §K.4 | §P |
| ENGC-13 | major, cross | **Verified (core D72)**: `createOrderRow` by T3 in R1.0 is the only insert; S1's v3 functions call it too | §11.1 step 5, §11.5, §O.1 |
| ENGP-1 | blocker, cross | **n/a for operations** (core §M.1 `gateInputFor`, DES-§8.13) | — |
| ENGP-3 | major, cross | **n/a for operations** (core §D.5 `aj_active_uq` on `active`) | — |
| ENGP-6 | major, cross | **n/a for operations** (core §M.2 calibrated bands) | — |
| ENGP-24 | minor, cross | **Verified**: this part's ≤ 25 s equals core §J.1's operations share; R2 cases live in R2 scripts (OD65) | §O.1, §O.2 |
| ENGP-26 | minor, cross | **n/a for operations**: no operations runtime bytes (OD18); rev 4 removes the last reason a chunk would bundle operations code (CRIT1) | §10.1 |
| UX-4 | major, cross | **n/a for operations** (CTA plan markup and sticky hooks: design / landing) | — |
| UX-20 | major, cross | **n/a for operations** (phone reveal composition: platform / design) | — |
| UX-21 | major, cross | **n/a for operations** (commerce register: design / storefront) | — |
| UX-31 | minor, cross | **Verified**: the sheet's address follows `checkout.addressMode` (core §D.10) | §11.2 |
| UX-37 | minor, cross | **n/a for operations** (shopper forms); the admin sheet and the console keep the core §I.8 ≥ 44 px targets | §13.1 |
| UX-38 | minor, cross | **n/a for operations**: no aurora or grain in any operations screen (core D60 rev 3; §13.6 design rules) | §13.6 |
| UX-39 | major, cross | **n/a for operations** (cutout-later path: design / platform / ai) | — |
| SEC-1 | blocker, cross | **n/a for operations** (core D69 sandbox ceilings) | — |
| SEC-5 | major, cross | **Resolved per core D70 + CRIT14**: every read function calls the frozen `maskIfImpersonation(scope, row)`; the local helpers are withdrawn and a static check forbids redefining them | §0 OD61, §8.1, §O.1, §O.2, §O.3 |
| SEC-18 | minor, cross | **n/a for operations** (core D76; this part writes no store, legal or WhatsApp display name, and renders no public page; the report link is CRIT15's) | — |
| QUAL-1 | blocker, cross | **n/a for operations** (copy library, N8) | — |
| QUAL-9 | major, cross | **n/a for operations** (Director acceptance rule) | — |
| QUAL-10 | major, cross | **n/a for operations** (gene pins) | — |
| QUAL-20 | major, cross | **n/a for operations** (`nicheShares` data path) | — |
| QUAL-21 | major, cross | **n/a for operations** (rubric typography text) | — |
| QUAL-25 | minor, cross | **n/a for operations** (design / ai seams) | — |
| CRIT1 | major, cross | **Resolved (operations side)**: one shape per layer — slugs in storage and server APIs, the posted `City.value` in every browser table (built by `zonesForCheckout`); the parity fixture asserts both; the core's D68, §K.2 P0 and §K.4 S1 sentences and the storefront's STO-D43 / §14.4 / §15.7 / §16.2 step 13 are listed below to align with the §K.2 P0 / LAN-§7.1 shape the core already accepted (§Q.8 LAN R1) | §0 OD47, §10.1, §O.1, §O.4, notes |
| CRIT2 | major | **Resolved**: every mirror sentence deleted (OD57, §5.5, §7.1, §22.2, §M.3 `saveOpsSettingsAction` and `saveWindowOverridesAction`); `test:ops` forbids reading or writing the removed keys; Q.27k carries the core's decision and the round-1 OPS-11 row is annotated as superseded (kept as history, not contract) | §0 OD57, §5.5, §7.1, §22.2, §M.3, §O.1, §O.2, §Q.27, §R |
| CRIT3 | major, cross | **Resolved**: `days: Record<1 \| … \| 7, Range[]>` (1 = Monday) in `ops.callingWindow`, `windowOverrides[].days` and `EffectiveWindow`; `export type CallingWindow = EffectiveWindow`; never `null` (the stub answers `DEFAULT_WINDOW` with `configured: false`, OD63); `DEFAULT_WINDOW.days[5]` is Friday; the shared fixture `src/lib/callcenter/window.fixtures.ts` read by `test:ops`, `test:delivery` and `test:catalog`; landing's `CallingWindow` interface and `\| null` listed below | §0 OD57, OD63, §2.9, §5.5, §O.1, §P |
| CRIT4 | major | **Resolved**: the v3 functions are S1's in `src/lib/catalog/order-v3.server.ts` (OD62, §11.5, §M.3, §P S4 row); S4 keeps the sheet (`src/components/admin/orders/manual/**`, `mode.ts`) and the `xlsx` route, its action wrappers in `src/lib/shipping/manual-actions.ts`; the stale `team/**` sentence of §P deleted; Q.27h carries the decision; round-1 OPS-15 annotated | §0 OD1, OD62, §11.4, §11.5, §M.3, §P, §Q.27, §R |
| CRIT14 | minor | **Resolved**: §8.1 imports `maskIfImpersonation(scope, row)` from `src/lib/platform/mask.ts` (P1, frozen P0); the two-argument `maskCustomerFields(row, scope)` and the local `maskName` / `maskAddress` / `Masked` are withdrawn; phones pass as `null` (already masked) | §0 OD61, §8.1, §O.1, §O.2 |
| CRIT15 | minor, cross | **n/a for operations**: the landing pages' "Report this store" link belongs to the landing footer (design's footer section via the document context; landing / design name the renderer); operations renders no public page | notes |
| CRIT17 | minor, cross | **Resolved for operations**: new **OPE-§O.4** maps every id of OPE-§1 to its script / e2e step, fixture and checkable statement; scripts cite `// proves:` ids and `ops-check.ts` fails on an uncited id (OD65); the §1 intro points at it | §0 OD65, §1, §O.2, §O.4 |

**Consistency fixes found while re-checking against core rev 3** (no finding id; each aligns this text with a decided
core sentence): `orders.export` now held by managers too (core §A.3.2, OPS-22) in §8.3, §12.8, §M.2; the tenant step-up
ladder (core §B.7, SEC-17) on the orders CSV, the Carrier CSV and the period close (OD64, §12.8, §16.8, §M.2, §M.3,
§O.3); Sheets served oldest-pending-first with the ≈ 16 stores per tick capacity and the scaled backlog threshold (core
§H.2 slot 1, §H.5, ENGC-33) in §19.7, §J, §27.2; the outbox re-send rule (core §H.1, ENGC-29) in §28.1; `ctx.yield()`
between stores (core §H.2, ENGC-11) in §19.7 and §J; the accepted audit names `callcenter.label_mapped`,
`finance.settings.updated`, `orders.refunded` (core §F.5) in §14.1 and §M.3; the DB enum order of `ship_state` (core
§D.2) in §2.1 and §3.2.

**Notes for the maintainer (contradictions inside core rev 3, recorded per the §Q.8 closing rule; no new request):**
- D68's sentence "the server, `assist`, `checkout` and `pdp` chunks convert with the same function", §K.2 P0's
  "so landing's `assist` and the storefront's `checkout` / `pdp` chunks bundle it by source import" and §K.4's S1 row
  "(bundling P4's pure `cityKey`, D68)" contradict §K.2 P0's own `zonesForCheckout` ("keyed by the posted `City.value`,
  built on the server from the slugs") and §Q.8 LAN R1; this part follows the latter (CRIT1): `cityKey` *may* be
  bundled, no chunk *has to*.
- §B.7's step-up list names `orders.export` but not the D74 Carrier CSV, which carries the same full phones under
  `shipments.write`; this part requires the check on `/orders/carrier-csv` (OD64) and asks that the sentence list it.
- §D.6 `carrier_rates`: "`cod_fee_flat_cents bigint NULL`" and "`cod_fee_bp int DEFAULT 0`" vs OPE-§2.7 (the cited cut
  list) `NOT NULL DEFAULT 0` for both.
- §K.4's contract-step sentence "so S3/S4 build the manual-order sheet's store-mode branch" vs its own S4 row (S4 only).
- §D.10 `ops` row and §K.2 P0: `callingWindow.savedAt` and `EffectiveWindow.configured` (OD63) are this part's
  refinements of its own key and stub type; the P0 stub answers `DEFAULT_WINDOW` with `configured: false`.

**Notes to the other parts (current text; supersede the † items of OPE-§Q.27's notes):**
- **landing.md**: the "no hours" rule of LAN-§2.3 becomes `windowIsEmpty(w, now) || !w.configured` (OD63: the default
  window runs the queue but is not a promise a person made; LAN-§2.3's "the thank-you may promise from it" sentence
  changes accordingly), and the "After the order" card mounts `CallingWindowEditor`, whose "Use these hours" sets
  `configured`; `Range` and `EffectiveWindow` are exported by `window.ts` as LAN-§2.3 already imports them; the
  `honesty:promise` `confirmation_call` claim checks `configured` too; `test:delivery` reads
  `src/lib/callcenter/window.fixtures.ts` next to `city-key.json`; CRIT15's footer link is landing's / design's to place.
- **storefront.md**: STO-§16.9 step 1's "a 0 delivery the agent must override with `adjustCents`" cannot happen
  (adjustments are ≤ 0, OD15): the quote keeps `fee_unset` and the operations sheet keeps Create disabled (OPE-§11.5
  step 3), so the function should refuse a create with `fee_unset` as well; STO-§16.9 step 5 and STO-R30 say "S3" for
  the sheet's R2 owner where core §K.4 says **S4**; `ManualOrderInputV3` needs no `shipAfter` (the sheet does the hold
  in a second idempotent write, OPE-§11.5 step 4); `test:catalog` may read `window.fixtures.ts` for STO-D45.
- **platform.md**: PLA-§7.2's `maskIfImpersonation` receives `phone: null` from every operations read function (the
  tenant phone is already `maskPhone`d for every role, with the tenant format "06 •• •• 56 78"; the console format
  stays the platform's).

**Rejected: none.** Two recommendations were implemented in a different shape, both stated in the body: CRIT17's
"Proven by column in the feature map" became the OPE-§O.4 table (one row per id; the §1 tables stay readable on a
phone and the proof sits next to the tests it names), and CRIT3's shared window fixture lives in
`src/lib/callcenter/window.fixtures.ts` (inside P4's own folder, so no ownership row changes) rather than under
`scripts/qa/fixtures/`.
