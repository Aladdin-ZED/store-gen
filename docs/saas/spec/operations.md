# Store Gen SaaS part spec: orders, call center, agents, accounting, integrations

Status: **part spec, revision 2 (elevated)** (2026-10-24, operations part architect). Built on `docs/STORE-SAAS.md`
**revision 2** (cited as **core §X**, its decisions as **core D1 … D64**; every revision 1 request of this part was
decided in **core §Q.4**, all 25 accepted as written, and integrated into the core's body: §D.2, §D.5, §A.3, §H.2,
§E.8, §F.5, §F.9, §I.4, §K.1, §K.2) and on the settled research decisions **R-D1 … R-D53** (`docs/saas/RESEARCH.md`
§2). Not yet reviewed (OPE-§R is empty). This document is the contract for the R1 product tracks **P4 CALL CENTER**
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
→ OPE-§O (tests you must keep green) → OPE-§Q (how the core decided this part's requests; the stubs it freezes in
step P0 are in core §K.2) → OPE-§E (what changed in this revision and why).

Section map: §0 decisions · §1 feature map · §2 data · §3 order state machine · §4 timeline and notes · §5 claim
queue, presence, assignment · §6 outcomes, retry ladder, callbacks · §7 call script · §8 phone masking and reveal ·
§9 customers, duplicates, blocklist · §10 address normalisation, risk explanation · §11 manual orders, editing, lead
conversion · §12 orders list, saved views, bulk, export, print, drawer · §13 agent console UX (a day in the queue) ·
§14 manager board, agents, KPIs · §15 commissions and payouts · §16 accounting · §17 carriers and shipments · §18 CSV
importers · §19 Google Sheets · §20 ad events (CAPI / Events API) · §21 Telegram and ops notifications · §22 WhatsApp
· §23 signed webhooks · §24 anti-spam settings and Turnstile · §25 later integrations · §26 test orders · §27 data for
the platform, health, pulse, exports, insights · **§28 integration health, deliveries log and replay (new)** · §J jobs
and time budgets · §L limits · §M server actions, routes, permissions · §N copy keys · §O tests · §P file ownership ·
§Q requests to the core (decided) · **§E elevation changes (rev 2, new)** · §R review decisions.

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
    disputed, written off) and the statement it was paid on; the file carries a header with the period, the row
    count and a checksum, and once you close a month nothing in it changes behind your back.

---

## OPE-§0. Decisions at a glance

R-D1 … R-D53 and core D1 … D64 are settled; the 25 requests of revision 1 are accepted (core §Q.4), so no row below
still depends on a pending request. Rows below are this part's own decisions; **deviates** / **refines** name the
settled decision that changes and why. OD36 … OD46 are new in revision 2 (sources in OPE-§E).

| # | Decision | Why |
|---|---|---|
| OD1 | **One spec, six tracks.** R1: P4 builds OPE-§3-§14, §16.2 (Profit lite), §26, §27 (reads), §28 (the store side of deliveries); P5 builds §19-§22 (R1 parts), §24, §28 (health rows and handlers). R2: S3 builds §15, §16.3-§16.9; S4 builds §17 (R2 parts), §18 (carrier mappings), the OP-06 merge (§9.4), OP-18/OP-19; S5 builds §23 and the IN-09 parts of §19. R3: D2 builds the R3 parts of §17, §20, §22, §25 and AC-08…AC-11. Core merge order puts P5 before P4 (core §K.2: P8 → P2 → P1 → P5 → P4 → P3 …): P4 imports P5's finished `src/lib/integrations/templates.ts` and `scheduleSheetPush`; P5 builds against P4's frozen P0 stubs (`applyExternalStatus`, `projectStatus`, `appendOrderEvent`). File lists are the core's §K.2 P4 / P5 rows verbatim (OPE-§P). | Core §K.2/§K.4/§K.5 split; the dependency arrows then point one way inside each release. |
| OD2 | **The app is the source of truth for order state; the sheet is a two-way mirror.** Status writes never wait for Google; a sheet edit enters as an external event through the state machine with a conflict rule (OPE-§19.6). **Deviates from today's behaviour** (`src/lib/sheets/sync.ts:16-17`, `src/lib/orders/admin.ts:166-171`: "the sheet is the source of truth for statuses once connected", sheet written first). | Agent actions must answer in ≤ 500 ms (RF §2.1); one platform service account is one shared Google quota (R-D24); one timeline needs one writer. |
| OD3 | **Three axes per R-D17** with the exact transition tables of OPE-§3.2. `orders.status` is written only by `transitionOrder()` and by the creation insert, always as `projectStatus(states)`. Legacy labels are appended, never renamed; `lost` ("Perdue") is appended next to the core's four (accepted: core §D.2 lists the five labels, core §Q.4 Q.2). | Sheets, CSV and the PHP export read the 9 legacy ids (`src/lib/orders/contract.ts:304-314`); a lost parcel is not a return. |
| OD4 | **Optimistic concurrency on `orders.rev`** (compare-and-set, `rev = rev + 1` in every state or line write). A stale write answers `conflict` with the fresh state; no last-writer-wins for people. | Two agents, a sheet pull and a carrier import can touch one order within seconds. |
| OD5 | **External sources move through `applyExternalStatus()` with implied transitions**: a "Expédiée" from the sheet confirms an unconfirmed order first (events marked `implied`); moves out of a terminal confirmation state (cancelled, fake, duplicate, unreachable) are refused from external sources, written as `external_rejected` and the sheet cell is rewritten with the app's label. | Sheets and carriers skip steps; a cell edit must not resurrect a fake order. |
| OD6 | **Order hooks run in two phases**: `inTx` (outbox enqueue, customer counters, commission ledger) inside the transition transaction, `afterCommit` (Sheets push scheduling, in-app notifications, lease bookkeeping) after it (the shape is frozen in `src/lib/orders/hooks.ts` at core §K.1 C0; accepted Q.7). | CAPI, Telegram and webhook deliveries are exactly as durable as the state they describe (R-D25); slow work never holds the order row lock. |
| OD7 | **Claim queue per R-D19**: one atomic `UPDATE … ORDER BY … LIMIT 1` with a claim token, lease 10 minutes renewed by every action on the order, **one active claim per agent**, callbacks stay with their agent until `due_at + 15 min`. Assignment modes: `pull` (default), `round_robin` (smooth weighted, daily caps, under a store named lock, falls back to pull), `manual`. | MariaDB 10.4 has no `SKIP LOCKED` (core §D.1); the pull model needs no worker; a callback the customer asked of Samira should reach Samira. |
| OD8 | **The queue is computed on read.** No job moves order states; ladder exhaustion happens inside the outcome that exhausts it; leases expire by comparison with now. The only call-center job marks stale presence offline (OPE-§J). | No workers, a 5-minute cron (core §H.2). |
| OD9 | **Calling window per store** (store timezone, up to 3 ranges per weekday, closed dates, a 2-hour "Open calls now" override, audited). Next outside the window answers `outside_window` with the next opening time. Default ranges are reasoned starting values **[to tune]**: every day 09:30-13:00 and 14:30-21:00, Friday 09:30-12:15 and 14:30-21:00. | CO §2.1 guidance is vendor advice without data; the store's own numbers replace it (AI-23, R3). |
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
| OD34 | **Languages**: queue, drawer actions, outcomes, reasons, scripts, WhatsApp templates and Telegram texts ship in ar, fr and en in R1; the other operations screens in en (R1), fr (R2), ar (R3). | Core D36; agents read Darija and French. |
| OD35 | **Money**: `orders` money columns stay `decimal(12,2)`; operations code converts once at the boundary with `toCents(decimal: string \| number): number` (half-up; `src/lib/finance/lite/cents.ts`, P4, taken over by S3 with the rest of `src/lib/finance/**`; `src/lib/markets/money.ts` stays read-only: it formats, `money.ts:69`, and never converts); every new table stores cents (core D41). | One integer engine (Offers D9). |
| OD36 | **The agent hot path is four route handlers, not server actions**: `POST /api/app/<h>/ops/next`, `POST /ops/outcome`, `POST /ops/reveal`, `POST /ops/presence` (core §I.1 lists `/ops/**` for "queue claim, outcomes, presence"), each with `storeGuard`, a client-generated **`Idempotency-Key`** (UUID, replay-safe for 10 minutes per store and user), a JSON body ≤ 2 KB and a response ≤ 6 KB gz. Server p75 budgets: next ≤ 300 ms, outcome + next ≤ 500 ms, reveal ≤ 200 ms; end to end on 4G ≤ 1.2 s for next, ≤ 1.5 s for outcome + next (OPE-§13.2). Everything else in operations stays a `storeAction`. | A route handler skips the RSC tree and the action manifest, returns a bounded JSON card, and gives the idempotency key a natural home; the §I.8 rule 1 budget (writes < 500 ms, idempotent) is not reachable on 4G through a page re-render. |
| OD37 | **A dropped network never loses a result**: the console keeps a one-entry **outbox in memory** (and `sessionStorage` as a convenience, key `sg:ops:pending:<storeId>:<userId>`, holding only `{ orderId, rev, outcome, idem, at }`, never a phone or a name) and retries for 30 s with the same `Idempotency-Key`; the lease (10 min) outlives the retry window. The UI shows "Saving…", then "Saved" or "Could not save, tap to retry"; it never guesses an outcome. | RF §2.1 rule 1 (optimistic with rollback) on a 4G phone in a call center; owner rule "never invent". |
| OD38 | **Honest triad everywhere, by lint**: "placed", "confirmed" and "delivered" are three words that never share a tile, a tooltip or a Telegram line; every rate shows its `n`; below the minimum n the UI shows the count and "needs 20 / 30". `scripts/qa/ops-check.ts` fails when a catalog key under `ops.tile.*`, `fin.tile.*` or `int.tg.*` contains two of the three words in one string (fr: passées / confirmées / livrées; ar: الطلبات / المؤكدة / توصلو). | Core §I.6, §I.8 rule 3; RF §2.1 rule 3; the brief's "honest placed/confirmed/delivered everywhere". |
| OD39 | **Risk is explained twice**: by its flags (template sentences, 100% flag coverage, OPE-§10.2) and by the **store's own calibration**: for each band (50-69, ≥ 70) the share of decided orders of the last 90 days that ended `fake`, `cancelled` or `unreachable`, with n (hidden below n = 30), computed by `riskBandOutcomes(scope)` (hourly cache). No model, no cross-store number; AI-23's per-store model (R3, flag `ai_risk_v2`) may add a third line, never replace these two. A score never blocks an order (`src/lib/orders/risk.ts:2-4`). | RA §4.7 (explanations from flags, pseudonymised features, the store's own rates); the brief's "per-store risk with explainable scores". |
| OD40 | **Every asynchronous integration shows its deliveries and offers Replay in the store**: `/app/<h>/integrations` lists per kind (CAPI, Telegram; R2 webhooks, carrier; R3 WhatsApp) the health row, the backlog, the oldest pending item and the last 100 outbox rows of the store (topic, target, state, attempts, next try, last error in plain words, masked payload summary), with **Replay** on `dead` rows calling the core's `replay(ctx, id)` (core §H.1) under `integrations.manage` (sensitive), bucket `s:<sid>:replay:<uid>` 30 / h, audit `integrations.outbox.replayed` (second-round request, OPE-§Q.26). Sheets is not an outbox kind: its run report plays the same role (OPE-§19.8). | Core D24 / §H.1 ("visible in the store's integration health and the console, with replay"); the brief's "integrations through the outbox with replay". |
| OD41 | **Accountant-grade exports (R2)**: every CSV carries a 4-line header comment (store handle, period, generated at in the store timezone, row count, `sha256` of the body), a column dictionary in ar/fr/en, ISO dates **and** store-local dates, a `reconciliation_state` per line (`unremitted`, `remitted`, `disputed`, `written_off`) with the statement reference, and the identity Σ delivered COD − Σ remitted − Σ disputed − Σ written off = cash held as a footer check. `accounting.closedThrough` (a date, owner only) **locks a period**: cost rows with `effective_from` inside it, late statement lines and ad-spend edits for its days are recorded as `late` adjustments in the current period and never rewrite the closed month. | The brief's "accountant-grade exports with reconciliation states"; CO §5.1 (an accountant must be able to tie the file to the carrier's statement). |
| OD42 | **Carriers are CSV-first with saved mappings** (core D38): a saved `import_mappings` row is auto-picked by its header signature, every unmapped carrier status is listed until the store maps it, every run is idempotent by `(kind, file_sha256)` and by `statement_ref`, ≤ 20 saved mappings per kind and store, and no preset ships until a real anonymised file exists in `scripts/qa/fixtures/imports/`. API adapters (R3) implement the same `CarrierAdapter` and pass the same fixture suite before registration. | Core D38, R-D21; the brief's "carriers CSV-first with saved column mappings". |
| OD43 | **Every aggregate operations exposes (health, console, pulse, Today brief, AI insights) is a deterministic decomposition with its n**: cells with fewer than 5 orders are suppressed, every rate carries its denominator, windows are store-local days, test and honeypot orders are excluded, and no customer field ever leaves the repository layer (`src/lib/orders/profile.ts`, `src/lib/callcenter/kpis.ts`, `src/lib/callcenter/aggregates.ts`). A model (AI-17, R3) may narrate these numbers and nothing else. | RA §4.2 ("a deterministic decomposition first"), §9.15; core §F.11; SF-11 (Growth Autopilot data). |
| OD44 | **Best hours to call, in R1, at $0**: a deterministic contact-rate table per hour of the store day (contact = any outcome except `no_answer`, `busy`, `switched_off`; trailing 90 days; a cell shows only with n ≥ 30 attempts) on the manager board and in the ladder editor. The Beta-posterior learner that rewrites ladder hours (AI-23, RF §1.5 step 4) stays R3 and advisory, never earlier than the step's minimum gap, never outside the window. | RF §1.5 ("Rules (ladder, learner) at $0"); the brief's "best-time learner"; owner rule 4 (a number only with its n). |
| OD45 | **Every tenant-facing operations notification ships in ar/fr/en** (`ops.*`, `int.*`, `fin.*` kinds in `src/lib/notify/kinds/{ops,integrations}.ts`), its `vars` carry ids, counts and codes only, and batched kinds collapse on `dedupe_key` ("12 new orders since 14:02"). | Core §I.4 (`test:i18n-coverage` covers tenant kinds); agents and owners are Moroccan (core D36). |
| OD46 | **Lease expiry is attributed, not silent**: when a claim takes an order whose previous `claim_token` is set and whose lease has expired, the claim writes `released` (`why: "lease_expired"`, `actor_id` = the previous holder) before `claimed`, so "orders opened and abandoned" is a visible agent KPI and the timeline never shows two `claimed` in a row. | Attempt logging the brief asks for; OD8 (the queue is computed on read: no job watches leases). |

Glossary: **axis** = one of confirm / ship / money. **projection** = the legacy `orders.status` value derived from
the three axes. **claim** = an agent's lease on one order. **outcome** = what an agent records after a call or a
WhatsApp exchange. **open order** = confirm ∈ {new, attempting, callback} or (confirmed and ship ∈ {none, to_pack,
packed}). **decided** = confirm reached confirmed, cancelled, unreachable, fake or duplicate. **final** = ship reached
delivered, refused, returned or lost. **window minutes** = minutes inside the store's calling window.

---

## OPE-§1. Feature map (every id of this area)

Release per RESEARCH §4 unless a decision moves it (OD13, OD25, OD32). Track per core §K.2/§K.4/§K.5. "AC" = the
acceptance criteria in one line; the detailed criteria sit in the section.

### OPE-§1.1 Orders, call center and agents (OP-*)

| ID | Feature | R | Track | Section | AC (summary) |
|---|---|---|---|---|---|
| OP-01 | 3-axis status + state machine + legacy projection | R1 | P4 | §3 | Every move goes through `transitionOrder`; illegal moves answer `illegal`; forced moves need `orders.force_status` + reason and write `forced`; `projectStatus` golden table green; no other writer of `orders.status` (static test). |
| OP-02 | `order_events` timeline + internal notes | R1 | P4 | §4 | Every state change, attempt, edit, reveal, assignment and note writes one event; the drawer timeline renders them newest first with masked phones; notes ≤ 500 chars, editable 5 min by their author. |
| OP-03 | Agent claim queue | R1 | P4 | §5, §13 | "Next" claims one order in ≤ 300 ms p75; 200 concurrent claims on 50 orders give 50 distinct claims; leases expire after 10 min; outside the window → `outside_window`; round-robin respects caps and presence. |
| OP-04 | Retry ladder, callbacks, outcomes, cancel reasons | R1 | P4 | §6 | Each outcome writes `call_attempt` + the transition; the next `due_at` follows the ladder inside the window; callbacks reach their agent first; reasons are coded. |
| OP-05 | Call script panel (template) | R1 | P4 | §7 | ar/fr/en steps compiled from the order and the page doc; zero invented numbers (fixture test); manager edits per page; AI drafts (R3) need approval. |
| OP-06 | Store-wide duplicates, customer profiles (merge R2) | R1 (merge R2) | P4 (S4) | §9 | **Trimmed** (RF §3.3, core §L.2): same phone with an open order in N days → flag on both, link, "Mark as duplicate" / "Keep both"; drawer shows "3 delivered, 1 refused"; merge (R2, S4) re-prices and writes one Sheets row. |
| OP-07 | Phone masking + reveal audit | R1 | P4 | §8 | No full phone in any list payload; every reveal writes `phone_revealed`; agents: no export, no sheet link. |
| OP-08 | Manual / phone / DM orders + post-creation editing | R1 | P4 | §11 | Priced only through `validate.ts`; edits before shipping re-price, write `field_edited` with before/after, mark the sheet row dirty; adjustment ≤ 0 by manager+ with reason. |
| OP-09 | Bulk actions + saved views | R1 | P4 | §12 | Built-in and saved views; bulk assign / move / export / print on ≤ 200 orders in one call with per-order results; status undo within 10 s. |
| OP-10 | Agent KPIs | R1 | P4 | §14.3 | Definitions of OD17; nightly `agent_stats_daily` rollup equals a recompute from events (test); today's figures live (60 s cache). |
| OP-11 | Manager board basics | R1 | P4 | §14.1 | Queue depth by state, oldest due callback, agents online with their current order, 15 s polling. |
| OP-12 | Per-store blocklist + "block and cancel open orders" | R1 | P4 (T3/T4 scoping in R1.0) | §9.5 | One action blocks the phone and moves every open pre-ship order of it to `cancelled` (reason `blocked`) or `fake`, with events; never touches another store. |
| OP-13 | Address normalisation (rules) | R1 | P4 | §10.1 | `cityKey` exact/alias match at creation; fuzzy suggestions never auto-apply; per-store aliases. |
| OP-14 | Risk explanation (template) | R1 | P4 | §10.2 | Top 3 reasons from `risk.ts` flags in ar/fr/en, 100% flag coverage, no PII. |
| OP-15 | Commission rules + earnings ledger + agent statement + payouts | R2 | S3 | §15 | Pay on delivered with clawback (R-D20); ledger re-derivable from events; statement live; payouts approved by `payouts.approve`. |
| OP-16 | Shipments + manual CSV carrier adapter | R2 | S4 | §17 | `CarrierAdapter`; manifest CSV per saved mapping; tracking and status imports move `ship_state`; picking list and manifest print views. |
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
| AC-03 | Ad spend + expenses | R2 (R1 manual ad spend) | S3 | §16.5 | Manual grid + CSV import with saved mapping; expenses with categories, recurring rules and receipts. |
| AC-04 | Profit dashboard | R2 | S3 | §16.6 | CPD, true ROAS, contribution margin, profit per delivered order per product/day/page/campaign/city/carrier from `finance_daily`; placed / delivered labels never mixed. |
| AC-05 | Break-even CPA calculator | R2 (R1 lite) | S3 (P4) | §16.2, §16.6 | Per product/page at the store's own confirmation × delivery rates, n ≥ 30, interval shown. |
| AC-06 | Remittance reconciliation | R2 | S3 | §16.7 | CSV import, match by tracking, flags `amount_diff` / `fee_diff` / `unknown` / `missing`, cash-held ageing per carrier, idempotent re-import. |
| AC-07 | Accountant exports | R2 | S3 | §16.8 | Sales register, remittance report, expenses, payouts, P&L summary as CSV; no customer phone. |
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
| IN-09 | Sheets upgrades | R2 | S5 | §19.9 | Pull note, tracking, carrier and fee columns; tab per page; store-owned service account; label mapping. |
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
projection; the list below is byte-for-byte the rev 2 core §D.2 row for 0005):

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
isTest: boolean("is_test").notNull().default(false),                   // [Q.12] SF-05
capiCtx: text("capi_ctx"),                                             // [Q.1] envelope v2 "capi-ctx" (OD21), ≤ 8 KB
// 0006 (core): catalog_version, cost_snapshot (OPE-§16.3 shape), variant_key
```

Indexes added **[Q.1]** (accepted, core §D.2): `orders_confirmer_idx (store_id, confirmed_by, confirmed_at)` (agent
KPIs and agent visibility), `orders_money_idx (store_id, money_state, delivered_at)` (cash held), `orders_dirty_idx
(store_id, sheet_dirty)` (Sheets push), `orders_store_test_idx (store_id, is_test, created_at)` (core, the test-order
views and "Delete test orders"). The core indexes `orders_queue_idx (store_id, confirm_state, due_at)`,
`orders_assignee_idx (store_id, assignee_id, confirm_state)`, `orders_customer_idx` and `orders_ship_idx` serve the
queue, "my orders", the customer page and the logistics lists. The one **cross-store** index `orders_created_idx
(created_at)` (core §D.2, PLA Q.10) exists for the console order lookup only: operations code never queries it
without `store_id` (lint L2); `src/lib/orders/profile.ts` reads through `platformScope` and still filters by store.
0007 adds `orders_updated_idx (store_id, updated_at)` (REST polling, OPE-§25.1) and `orders_store_variant_idx` (landing).

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
| `state_changed` | `transitionOrder` | `from_state`, `to_state`, `reason_code` | `{ axis: "confirm" \| "ship" \| "money", source, implied?: true, forced?: true, dueAt?, duplicateOf? }` |
| `call_attempt` | outcome handler | `reason_code` = outcome | `{ channel: "call" \| "whatsapp", outcome, attemptNo, nextDueAt? }` |
| `whatsapp_sent` | WhatsApp button | — | `{ template: "<id>" \| "builtin:<kind>:<locale>", locale }` |
| `assigned` / `unassigned` | assignment | — | `{ to?, by: "rr" \| "manual" \| "rule" \| "claim", ruleId? }` |
| `claimed` | Next | — | `{ leaseUntil }` |
| `released` | skip, break, manager, the next claim (OD46) | `reason_code` | `{ why: "skip" \| "break" \| "manager" \| "outcome" \| "lease_expired" \| "store_state" }` (`lease_expired`: `actor_id` = the previous holder, written by the claim that took the order over; `store_state`: `releaseAllLeases` on a lifecycle transition, actor `system`) |
| `lead_attributed`, `track_opened`, `zone_not_served`, `kit_shared` | landing (P3) through `appendOrderEvent` | — | `{ leadId? }`, `{ via: "wa" \| "link" }`, `{ cityKey }`, `{ campaignId }` (no customer data) |
| `field_edited` | edit (OPE-§11.3) | — | `{ fields: { f, before, after }[] }` (phone values stored E.164, always rendered masked) |
| `note` | note action | `note` | `{ edited?: true, of?: number }` |
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
the agent. The rename `commission_rule_id` → `commission_rule_ids` is **in 0005** as add + copy + drop, each guarded
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
| `product_costs` | `id`, `store_id`, `product_id NULL`, `page_id NULL`, `item_id varchar(40) NULL`, `variant_key varchar(120) NOT NULL DEFAULT ''` ('' = every variant), `cost_cents bigint NOT NULL`, `packaging_cents bigint NULL` (NULL = store default), `effective_from datetime(3) NOT NULL`, `note varchar(200)`, `created_by`, `created_at` | `pc_prod_idx (store_id, product_id, item_id, variant_key, effective_from)`, `pc_page_idx (store_id, page_id, item_id, variant_key, effective_from)`; code check: exactly one of `product_id`, `page_id` |
| `carrier_accounts` | `id`, `store_id`, `adapter varchar(32)` (`manual`; `sendit` R3; …), `label varchar(60)`, `status enum(active,disabled)`, `hook_key_hash char(64) NULL`, `settings longtext` (`{ statusMap: Record<string, ShipState \| "ignore">, manifestMappingId?, trackingMappingId?, statusMappingId?, remittanceMappingId?, trackingUrl?: "https://…{tracking}" }`), `created_by`, `created_at`, `updated_at` | `UNIQUE ca_label_uq (store_id, adapter, label)`, `UNIQUE ca_hook_uq (hook_key_hash)` |
| `carrier_rates` | `id`, `store_id`, `carrier_account_id varchar(26) NOT NULL DEFAULT ''` ('' = "my carrier", the R1 lite rows), `city_key varchar(40) NOT NULL` (`*` = every other city), `delivery_fee_cents`, `return_fee_cents`, `cod_fee_bp int NOT NULL DEFAULT 0`, `cod_fee_min_cents bigint NULL`, `eta_days tinyint NULL`, `active bool`, `updated_by`, `updated_at` | `UNIQUE cr_uq (store_id, carrier_account_id, city_key)` |
| `shipments` | `id`, `store_id`, `order_id varchar(20)`, `carrier_account_id`, `tracking varchar(64) NULL`, `state` (ShipState values), `fee_cents NULL`, `cod_cents`, `return_fee_cents NULL`, `label_ref varchar(120) NULL`, `parent_id NULL` (re-shipment, R3), `created_by`, `created_at`, `shipped_at`, `delivered_at`, `returned_at`, `remittance_id NULL`, `updated_at` | `UNIQUE sh_track_uq (store_id, carrier_account_id, tracking)`, `sh_order_idx (store_id, order_id)`, `sh_state_idx (store_id, state, created_at)`, `sh_unremitted_idx (store_id, remittance_id, delivered_at)` |
| `shipment_events` | `id bigint`, `store_id`, `shipment_id`, `at`, `carrier_status varchar(80)`, `mapped_state varchar(24) NULL`, `source enum(csv,webhook,poll,manual)`, `raw longtext NULL` (nulled after 30 days) | `se_ship_idx (store_id, shipment_id, at)` |
| `remittances` | `id`, `store_id`, `carrier_account_id`, `statement_ref varchar(80)`, `period_from date NULL`, `period_to date NULL`, `paid_at datetime(3) NULL`, `gross_cents`, `fees_cents`, `net_cents`, `lines int`, `matched int`, `state enum(imported,matched,disputed,closed)`, `import_run_id`, `created_by`, `created_at` | `UNIQUE rm_ref_uq (store_id, carrier_account_id, statement_ref)` |
| `remittance_lines` | `id bigint`, `store_id`, `remittance_id`, `row_no int`, `tracking varchar(64) NULL`, `order_id varchar(20) NULL`, `shipment_id NULL`, `cod_cents`, `fee_cents NULL`, `return_fee_cents NULL`, `net_cents NULL`, `match enum(matched,amount_diff,fee_diff,unknown,duplicate)`, `diff_cents bigint NULL`, `note varchar(200)` | `rl_rem_idx (store_id, remittance_id)`, `rl_track_idx (store_id, tracking)`, `rl_order_idx (store_id, order_id)` |
| `import_mappings` | `id`, `store_id`, `kind enum(remittance,tracking,status,ad_spend,products,reviews,manifest,expenses)` (**`manifest`, `expenses` appended [Q.10]**), `name varchar(60)`, `columns longtext` (`MappingSpec`, OPE-§18.3), `carrier_account_id NULL`, `created_by`, `updated_at` | `UNIQUE im_name_uq (store_id, kind, name)` |
| `import_runs` | `id`, `store_id`, `kind`, `mapping_id`, `file_ref varchar(200)` (under `DATA_DIR/imports/<storeId>/`), `file_sha256 char(64)`, `rows int`, `ok int`, `failed int`, `skipped int`, `state enum(previewed,committed,failed)`, `report longtext` (≤ 200 row errors), `created_by`, `created_at`, `committed_at` | `ir_kind_idx (store_id, kind, created_at)`, `ir_sha_idx (store_id, kind, file_sha256)` |
| `ad_spend_daily` | `store_id`, `platform enum(meta,tiktok,snap,google,other)`, `account_id varchar(40) NOT NULL DEFAULT ''`, `campaign_id varchar(64) NOT NULL DEFAULT ''`, `day date`, `campaign_name varchar(160)`, `spend_cents`, `currency char(3)`, `source enum(manual,csv,api)`, `import_run_id NULL`, `updated_by`, `updated_at` | PK `(store_id, platform, account_id, campaign_id, day)` |
| `expenses` | `id`, `store_id`, `day date`, `category varchar(40)`, `amount_cents`, `note varchar(200)`, `recurring_rule longtext NULL` (template rows only: `{ every: "month" \| "week", day: 1-31 \| 0-6, until?: date }`), `parent_id NULL` (occurrence → template), `occurrence date NULL`, `attachment_ref varchar(200) NULL` (under `DATA_DIR/receipts/<storeId>/` [Q.14]), `created_by`, `created_at` | `ex_day_idx (store_id, day)`, `UNIQUE ex_occ_uq (store_id, parent_id, occurrence)` |
| `finance_daily` | `store_id`, `day date` (placed day, store tz), `dim_key varchar(160)`, `placed int`, `confirmed int`, `cancelled int`, `fake int`, `shipped int`, `delivered int`, `refused int`, `returned int`, `lost int`, `placed_cents`, `delivered_cents`, `cogs_cents`, `packaging_cents`, `shipping_cost_cents`, `return_cost_cents`, `cod_fee_cents`, `commission_cents`, `ad_spend_cents`, `expense_cents` (only on `dim_key = 'total'`), `net_cents`, `expected_net_cents` (open orders at the store's rates), `missing_costs int` (orders without a cost), `computed_at` | PK `(store_id, day, dim_key)` |
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
export const OpsSetting = z.object({
  callingWindow: z.object({
    days: z.array(z.array(z.object({ from: HHMM, to: HHMM })).max(3)).length(7),   // index 0 = Sunday, store tz
    closedDates: z.array(ISODate).max(60).default([]),
  }).default(DEFAULT_WINDOW),                                                       // OD9
  openOverrideUntil: z.string().datetime().nullable().default(null),                // "Open calls now" (≤ 2 h)
  ladder: z.array(LadderStep).min(1).max(10).default(DEFAULT_LADDER),              // OPE-§6.2
  busyRetryMinutes: z.number().int().min(5).max(120).default(20),
  unreachable: z.enum(["close", "keep_open"]).default("close"),
  keepOpenDays: z.number().int().min(1).max(14).default(7),
  leaseMinutes: z.number().int().min(5).max(30).default(10),
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

// accounting (S3 R2; the R1 lite subset by P4: packagingCents, adsAllocation, cashHeldAlertDays = core §D.10 "R1 lite")
export const AccountingSetting = z.object({
  packagingCents: z.number().int().min(0).nullable().default(null),        // per order; NULL = not set (never invented)
  adsAllocation: z.enum(["spread", "unattributed"]).default("spread"),     // OPE-§16.6
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
comment "reasoned starting value, not researched" (OD9, OD10).

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
export const SHIP_STATES = ["none", "to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "delivered", "refused", "returned", "lost"] as const;
export const MONEY_STATES = ["unpaid", "collected", "remitted", "disputed", "written_off"] as const;
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
| `shipped` | `in_transit`, `out_for_delivery`, `delivered`, `refused`, `returned`, `lost` (L) |
| `in_transit` | `out_for_delivery`, `delivered`, `refused`, `returned`, `lost` (L) |
| `out_for_delivery` | `in_transit`, `delivered`, `refused`, `returned` (L) |
| `refused` | `returned` (L: the parcel is back at the warehouse) |
| `delivered` | `returned` (A †: customer return after delivery; R3 returns flow, OP-22) |
| `returned` | `to_pack` (A †: re-shipment) |
| `lost` | `delivered` (A †: found and delivered), `returned` (A †) |

**Money axis**:

| from | legal targets (class) |
|---|---|
| `unpaid` | `collected` (S on `delivered`; M) |
| `collected` | `remitted` (M; S on a matched statement line), `disputed` (M), `written_off` (M †), `unpaid` (S when `delivered` is reverted) |
| `disputed` | `remitted` (M), `written_off` (M †), `collected` (M) |
| `remitted` | `disputed` (M †: statement error) |
| `written_off` | `collected` (M †) |

Automatic side moves (planned by `planTransition` in the same write, recorded as their own `state_changed` events
with `source: "system"`):
- confirm → `confirmed` ⇒ ship `none` → `to_pack`; sets `confirmed_by` (user actors only), `confirmed_at`.
- confirm → `cancelled` / `fake` / `duplicate` / `unreachable` while ship ∈ {`to_pack`, `packed`} ⇒ ship → `none`.
  While a shipment row exists (R2) the move answers `locked_ship` until the shipment is cancelled.
- ship → `shipped` sets `shipped_at` (if NULL); → `delivered` sets `delivered_at`, `final_at` and money `unpaid` →
  `collected`; → `refused` / `returned` / `lost` sets `final_at`.
- `delivered` → `returned` (forced or A) ⇒ money `collected` → `unpaid` only when the money is not yet `remitted`.
- every terminal confirmation state clears `lease_until`, `claim_token`, `due_at`.

### OPE-§3.3 Projection (`projectStatus`) and legacy labels

```ts
export function projectStatus(s: Pick<OrderStates, "confirm" | "ship">): OrderStatus {
  switch (s.ship) {
    case "delivered": return "delivered";   case "refused": return "refused";
    case "returned": return "returned";     case "lost": return "lost";
    case "in_transit": case "out_for_delivery": return "in_transit";
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
| `shipped`, `in_transit`, `delivered`, `refused`, `returned`, `lost` | ship = that state (`in_transit` → `in_transit`) | implied confirmation when needed |
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
  attempt?: { channel: "call" | "whatsapp"; outcome: AttemptOutcome };   // written as call_attempt in the same transaction
  extra?: Partial<Pick<OrderRow, "dueAt" | "attempts" | "assigneeId" | "leaseUntil" | "claimToken" | "firstTouchAt" | "priority" | "cancelReason">>;
  ref?: string;                          // external reference for the event meta
}
export type TransitionError = "not_found" | "illegal" | "conflict" | "reason_required" | "forbidden" | "locked_ship" | "bad_due" | "bad_duplicate";
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
2. Visibility: a user actor without `orders.read_all` must be the order's `assignee_id` or `confirmed_by` (OD12);
   else `not_found` (identical answer to a missing id, core §E.3 rule 3).
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
| `ops.counters` (`hooks/ops.ts`, P4) | inTx | transition | customer counters (§9.1) |
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
- Actor names come from the store's members (display name); `sheet` shows "Google Sheet", `carrier` the carrier
  account label, `system` "Store Gen" (the platform brand setting), `platform` "Support" (impersonation is read-only,
  so it never writes).
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
1. Presence must be `online` (else `on_break` / `offline`); `touchAgent()` (≤ 1 write per 60 s).
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
   AND confirm_state IN ('new', 'attempting', 'callback')
   AND (due_at IS NULL OR due_at <= UTC_TIMESTAMP(3))
   AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3) OR assignee_id = :uid)
   [AND assignee_id = :uid]                                   -- assignment mode "manual" only
 ORDER BY (assignee_id <=> :uid) DESC, priority DESC, COALESCE(due_at, created_at) ASC, id ASC
 LIMIT 1;
-- affectedRows = 1 → SELECT … FROM orders WHERE store_id = :sid AND claim_token = :tok  (then the QueueOrder view)
-- affectedRows = 0 → "empty" with nextDueAt = MIN(due_at) of the store's open orders (60 s cache)
```

The statement runs on the `orders_queue_idx (store_id, confirm_state, due_at)` range; the open set of a store is
bounded (open orders only), so the filesort is over hundreds of rows, not the table. No `SKIP LOCKED` (MariaDB 10.4):
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
  eta: { text: string | null; cityKey: string | null };               // zoneLineFor() (P3); null = no promise, the card shows nothing
  leaseUntil: string | null; mine: boolean;
  ui: { bestHoursHint: MessageRef | null };                           // OD44: "Your customers pick up most 18h-20h (n = 212)" when the store has ≥ 30 attempts in that cell; else null
}
```

No full phone, no IP hash, no UA, no other store's data, no e-mail. `phoneMasked` = `maskPhone(e164)` (OPE-§8.1). The
serialised card is **≤ 6 KB gzipped** (`test:ops` measures the 40 fixtures; the script's step texts dominate, so a
script over 12 steps or an objection list over 6 fails the schema before it reaches the card).

### OPE-§5.4 Priority

`priority` is an `int` recomputed by `priorityOf()` at creation and on every transition or edit:

```
priorityOf(o) = base[o.confirm]                        new 500 · callback 600 · attempting 300
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

// src/lib/callcenter/window.ts (pure; time zone math with Intl.DateTimeFormat, no dependency)
export function isCallable(now: Date, w: OpsSetting["callingWindow"], tz: string, overrideUntil: Date | null): { open: true } | { open: false; opensAt: Date | null };
export function nextCallableAt(t: Date, w, tz): Date;                       // t itself when open
export function windowMinutesBetween(a: Date, b: Date, w, tz): number;      // first-touch KPI (OD17)
export function snapIntoWindow(t: Date, w, tz): Date;                       // ladder results, callbacks warn only
```

- `online` = presence `online` and a heartbeat within 3 minutes (`isLive`); the job `ops.presence` turns profiles
  silent for 15 minutes to `offline` (OPE-§J).
- "Open calls now" (manager, `callcenter.configure`) sets `openOverrideUntil = now + 2 h`, audited
  (`store.settings.updated`), shown to agents as a banner with the end time.
- Closed dates: the window is closed all day; the ladder skips them.

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

---

## OPE-§6. Outcomes, retry ladder and callbacks (OP-04)

### OPE-§6.1 `recordOutcome` (`src/lib/callcenter/outcomes.ts`)

```ts
export type AttemptOutcome = "confirmed" | "no_answer" | "busy" | "switched_off" | "wrong_number" | "callback" | "cancelled" | "fake" | "duplicate";
export interface OutcomeInput {
  orderId: string; expectRev: number; channel: "call" | "whatsapp"; outcome: AttemptOutcome;
  idem: string;                // Idempotency-Key (OD36); a replay returns the first result
  dueAt?: string;              // callback (ISO, store-local picker converted on the client)
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
| `confirmed` | → `confirmed` | — | NULL | `confirmed_by`, `confirmed_at`; ship → `to_pack` |
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
back is confirmed by any agent from the customer's page or ⌘K (class W, OPE-§3.2).

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
  "confirm_hours", "upsell_title", "upsell_price", "tracking_link", "order_count_today"] as const;
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
| `confirm_number`, `confirm_hours` | store setting `store.confirmation` (LAN Q10, core §D.10): `callerPhone` (E.164, rendered national) or, when absent, `whatsapp` digits; `hours` rendered in the template locale; `withinHours` is **not** a template variable (a promise the store may not have made) | not set |
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
```

Masked = national format with the first two national digits and the last four visible (libphonenumber-js, already a
dependency, `src/lib/markets/phone.ts`). Every list, queue card, timeline, customer page, ⌘K result, notification,
board and Telegram message (default) uses it. Search by phone still works (digits matched server-side, results
masked).

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
  claim or are the assignee (callbacks). Owner, admin, manager: any order of the store, no reason prompt (OD11).
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
| Orders CSV export | `orders.export` (owner, admin) | `audit("orders.exported", { count, filters })` |
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
  (OPE-§11), Block (and cancel open orders), Unblock. Agents reach a customer page only from an order they can see,
  and see counts only.
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
export type CityKey = string & { readonly __city: true };   // "casablanca", "fes", "ksar-el-kebir"
export function cityKey(value: string): CityKey | null;      // slug of the stored French value of src/lib/markets/cities-ma.ts; "Autre" → null
export function normalizeCity(input: string, market: string, aliases?: Record<string, CityKey>):
  { key: CityKey | null; value: string | null; confidence: "exact" | "alias" | "fuzzy" | "none"; suggestions: { key: CityKey; label: string }[] };
```

- Folding: Latin = NFKD, diacritics removed, lowercase, punctuation and repeated spaces removed; Arabic = tashkeel
  and tatweel removed, أ إ آ → ا, ة → ه, ى → ي, a leading "ال" ignored for matching only.
- Exact = the folded input equals the folded fr, en or ar label of a city; alias = the store's `ops.cityAliases` plus
  a short built-in list (only the English and French spellings already in `cities-ma.ts` and "casa" → casablanca);
  fuzzy (suggestions only) = Levenshtein ≤ 1 for 4-6 letters, ≤ 2 for 7+ letters, Latin script only.
- Applied at creation: exact or alias → `city_key`; fuzzy → nothing written, the drawer shows "Did you mean
  Kénitra?" and one tap edits the order (`field_edited`). Nothing is ever changed without a person.
- Markets other than MA: `city_key` NULL in R1 (no list).
- `zoneLineFor(scope, cityKey)` (landing.md) and `carrier_rates.city_key` use the same keys.

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
5. Insert with the public path's id generator (`newOrderId`, exported from `create.ts` [Q.9]): `source`,
   `created_by = ctx.user.id`, `risk_score = 0`, `flags = ["manual"]`, `version_id`, `currency = stores.currency`,
   `locale` = the store default, `sheet_status = "pending"`, `is_test = false`; then `runOrderHooks("created")`
   (customer, duplicates, Telegram, Sheets) and, when `confirmed`, `transitionOrder(want confirm confirmed, source
   "ui")` with the creator as `confirmed_by`.
6. No ad event (OD16) unless `conversions.manualOrders` is on (then trigger rules apply, without browser ids).
7. Rate: `s:<sid>:manual:<uid>` 60 per hour.

### OPE-§11.2 New-order sheet (UI, `src/components/admin/orders/manual/**`)

Opened from ⌘K "Create → Manual order", the Orders page, a customer page ("New order for this customer", phone
pre-filled) and the leads inbox ("Convert", P3). One sheet, three blocks on one scroll (no "Step 1/2/3" labels,
RF §2.1 rule 8):
1. **Product**: live pages as compact rows (thumbnail, name), then the page's offers as cards with the payable price
   from `src/lib/page/pricing.ts` (the same numbers the page shows) and the option pickers (choice, matrix, fields)
   built on `src/lib/page/options.ts` availability rules; unavailable choices disabled with the page's own label.
2. **Customer**: phone (country from the store market, as-you-type format, `dir="ltr"`), name, city combobox over the
   store's city list with folded matching (OPE-§10.1), address, landmark, customer note.
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

- Permission `orders.edit` (agents on orders they hold or own); allowed while ship ∈ {none, to_pack, packed} and
  confirm ∉ {cancelled, fake, duplicate}; else `locked`.
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
carries `{ leadId }` and P3's hook appends `lead_attributed` (OPE-§4.1).

---

## OPE-§12. Orders list, saved views, bulk actions, export, print, drawer (OP-09)

### OPE-§12.1 Built-in views (code constants in `src/lib/callcenter/views.ts`)

| View | Predicate | Default for |
|---|---|---|
| To call now | callable now (§5.1, window ignored for viewing) | managers |
| Callbacks due | confirm `callback` ∧ `due_at ≤ now + 15 min` | managers, agents ("My callbacks") |
| New | confirm `new` | — |
| No answer | confirm `attempting` | — |
| To pack | confirm `confirmed` ∧ ship ∈ {to_pack, packed} | owners |
| On the way | ship ∈ {shipped, in_transit, out_for_delivery} | — |
| Delivered | ship `delivered` | — |
| Refused & returned | ship ∈ {refused, returned, lost} | — |
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
| Agent (avatar + name) · Attempts / due | ✓ | ✓ | — | |
| Risk chip | ✓ | ✓ | ✓ | |
| Sheet chip · Source · UTM campaign | ✓ | ✓ (sheet only) | — | |

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
| Delivery | city (with "Did you mean…"), address, landmark, ETA line from zones (P3), tracking (R2) | all |
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
  note, landmark), print CSS (A4 2-up or 80 mm thermal, chosen in the page), no full phone. Browser "Print / Save as
  PDF" (OD28).
- **CSV**: `ordersCsv` (`src/lib/orders/admin.ts:377`) scoped by store, header unchanged and **appended** with:
  `Confirmation`, `Shipping state`, `Money`, `Agent`, `Attempts`, `Cancel reason`, `Landmark`, `Adjustment`,
  `Confirmed at`, `Delivered at`, `Test`. Route `/api/app/<h>/orders/export` (`orders.export`, sensitive),
  `audit("orders.exported", { count, filters })`. Agents never get the button or the route.

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
  ≥ 44 px (RF §2.1 rule 6).
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
5. `conflict` (409) → the card refreshes with "Updated by Karim just now" and the grid again; a lost lease (away > 10
   min) → "This order went back to the queue" + Next (the next claim may hand the same order back when it is still the
   best one, with `resumed: false`).
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
| Start | opens `/app/<h>/queue` (an agent's landing path, core §B.4), taps **Online** | `setPresence(online)`, heartbeat every 60 s while the tab is visible; the pulse's shared poller starts; "Calls open at 09:30" if early |
| Loop (×200) | `N` → reads the card → `C` → talks → taps an outcome | one claim, one reveal, one outcome + claim; lease renewed by each action; `first_touch_at` set on the first attempt; the ladder sets `due_at` |
| Callback | taps "Call back…" → picks "This evening 18:30" | `confirm_state = callback`, `due_at`, `lease_until = due_at + grace`, owner = this agent; at 18:30 the order reaches this agent first (claim `ORDER BY`) and the pulse's `dueCallbacks` ticks up |
| Break | taps **Break** | the active claim is released (`released`, why `break`); Next answers `on_break` |
| Network drop | taps an outcome in a stairwell | the outbox of OD37 holds the outcome and retries with the same `Idempotency-Key` for 30 s; "Saving…" then "Saved"; the lease (10 min) covers the gap |
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
  today** (claims released by `lease_expired`, OD46; with the agent names on hover). Placed, confirmed and delivered
  never share a tile (OD38). The tile values come from `queueCounts(scope)` (OPE-§27.1), one query per tile group.
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
  (R2), KPIs over 7 and 28 days with n.
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
| a forced revert of any of the above | the symmetric entry (re-accrual or clawback), never an update of a paid row |
| test order, honeypot, manual order without `confirmed_by` | nothing |

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
  `effective_from = now` (history kept).
- **Ad spend**: a 14-day grid (day × Meta / TikTok / Snap / Google / Other) of editable amounts, saved per cell
  (`ad_spend_daily`, source `manual`); totals per day.
- **Break-even** per page (or for the store when several pages share the spend), trailing 28 days:

```
c = confirmed / (confirmed + cancelled + unreachable)          n_c = that denominator        (needs n_c ≥ 30)
d = delivered / (delivered + refused + returned + lost)        n_d = that denominator        (needs n_d ≥ 30, OD17)
margin_delivered = avg(total of delivered orders) − avg(COGS of their lines) − packaging − delivery_fee(city) − cod_fee
loss_failed      = delivery_fee(city) + return_fee(city) + packaging
E_placed         = c·d·margin_delivered − c·(1−d)·loss_failed          expected contribution per placed order, before ads
BE_CPA_placed    = E_placed            BE_CPA_delivered = E_placed / (c·d)
CPA_placed       = ad_spend_28d / placed_28d                   (store-level in R1: spend is not split per page)
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
  suggestion "mark the city as not served or raise its fee" linking to the delivery zones). Hysteresis: an alert
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
  carrier: { accountId: string /* '' = my carrier */; cityKey: string | null; deliveryFeeCents: number | null; returnFeeCents: number | null; codFeeBp: number; codFeeCents: number | null };
}
```

Cost lookup = the most specific `product_costs` row (variant → item → product default) with `effective_from ≤ at`.
Later cost edits never change a snapshot; an explicit "Recompute cost" on a shipped, not-yet-final order
(`finance.write`, audited, event `field_edited` with `f: "cost_snapshot"`) is the only rewrite.

### OPE-§16.4 Carrier rates (AC-02, R2)

Per carrier account × city (`*` default): delivery, return, COD fee (bp with an optional minimum). The snapshot takes
the estimate; the matched statement line gives the actual; finance uses the actual when present, and the carrier
page shows "estimated 25.00 · charged 28.00 · +3.00 on 41 parcels".

### OPE-§16.5 Ad spend and expenses (AC-03, R2)

- Ad spend: the R1 grid plus CSV import (mapping kind `ad_spend`, OPE-§18); rows whose currency differs from the
  store's are refused with "currency differs" (multi-currency is AC-12).
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
| delivered | total − COGS − packaging − delivery fee (actual, else estimate) − COD fee − commissions |
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
contribution ÷ delivered; refusal cost; cash position = collected-not-remitted + remitted − expenses; the COD funnel
(orders → confirmed → shipped → delivered → cash remitted) as horizontal stepped bars with counts and step rates
(RF §2.5); a table per dimension; banners for missing costs ("12 delivered orders have no cost") and for estimates.

### OPE-§16.7 Remittance reconciliation (AC-06, R2)

Import a carrier statement through OPE-§18 (kind `remittance`, mapping per carrier account). Per line:
1. Match: tracking → `shipments` (store, carrier account) → order; else the mapped order-id column → order; else
   `unknown`.
2. Flags: `matched`; `amount_diff` (line COD ≠ order total, `diff_cents`); `fee_diff` (line fee ≠ the snapshot
   estimate by more than 1 currency unit); `duplicate` (shipment already on another statement); `unknown`.
3. Effects on commit: matched and amount-ok lines set `shipments.remittance_id` and money → `remitted` through
   `applyExternalStatus(…, { money: "remitted" }, { kind: "import", ref: runId })`; `amount_diff` lines move money →
   `disputed` with the difference in the event.
4. **Missing**: delivered shipments of that carrier with `delivered_at` before the statement period end (or more than
   14 days before the import when there is no period) and no remittance, listed as "Not on any statement" with age.
5. **Cash held by carrier** per account, by `delivered_at` age of collected-not-remitted orders: 0-7, 8-14, 15-30,
   > 30 days, with totals; above `accounting.cashHeldAlertDays` (default 15) → Telegram line (IN-04) and
   `fin.cash_held` notification; > 30 days → `cash_held` profit alert.

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

`/app/<h>/finance/exports` (`finance.read`), CSV (UTF-8 BOM, formula-safe like `csvField`, `admin.ts:370-374`),
**accountant-grade (OD41)**: every file starts with a 4-line `#` header (store handle · period `from..to` in the store
timezone · generated at, ISO and store-local · `rows=<n> sha256=<hex of the body after the header>`), every date column
exists twice (`*_iso` in UTC, `*_local` in the store timezone), every amount is in cents **and** in a formatted
`decimal` column, and the last line is a `# check` footer with the control identity of the file. A column dictionary
(`dictionary.csv`: column, type, meaning in `accounting.exportLocale`) is downloaded with every export (one ZIP when
the owner picks several files).

| Export | Keyed by | Columns (beyond the header and dictionary) |
|---|---|---|
| Sales register | delivered date | order id, product / offer, qty, total, shipping charged, adjustment, currency, carrier, **`reconciliation_state`** (`unremitted` \| `remitted` \| `disputed` \| `written_off`), statement ref, statement line, remitted date, `late` flag (+ HT / TVA / TTC when the tax profile is `vat`, R3) |
| Cash journal (new) | remittance paid date | statement ref, carrier, order id, COD, fee, return fee, net, match state, dispute note; footer: Σ net = statement net |
| Remittance report | statement | statement ref, carrier, paid date, gross, fees, net, lines, matched, disputed, unknown, missing count at import |
| Cash held (new) | carrier × ageing bucket | carrier, bucket (0-7, 8-14, 15-30, > 30), orders, COD held, oldest delivered date; footer: Σ = delivered − remitted − disputed − written off |
| Expenses | day | category, amount, note, receipt (yes/no), recurring (yes/no), `late` flag |
| Payouts | agent × period | agent (display name, never a phone), period, total, state, paid date, method, ref, entries |
| P&L summary | month | delivered revenue, COGS, packaging, delivery and return fees, COD fees, commissions, ad spend, expenses, late adjustments, net; one row per month, closed months flagged |

No customer phone, address or note in any accountant export (accountant role, core §A.3.2); the sales register names
the customer's city only. Closing a period (`accounting.closedThrough`, owner, `finance.write` + step-up when the user
has TOTP, audit `finance.period_closed`, second-round request OPE-§Q.26) freezes every row dated inside it: a later
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
export interface CarrierCapabilities { createParcel: boolean; cancelParcel: boolean; label: boolean; pickupRequest: boolean; trackPull: boolean; trackWebhook: boolean; zonesSync: boolean; remittancePull: boolean }
export interface CarrierCtx { scope: StoreScope; account: CarrierAccountRow; credentials: Record<string, string> | null; signal: AbortSignal; deadline: number }
export interface ParcelInput { orderId: string; name: string; phone: string; city: string; cityKey: string | null; address: string; landmark: string | null; codCents: number; currency: string; content: string; qty: number; note: string | null }
export interface CarrierEvent { tracking: string; carrierStatus: string; at: Date; raw?: unknown }
export interface CarrierAdapter {
  id: string;                                   // "manual", "sendit" (R3)
  label: string; capabilities: CarrierCapabilities;
  credentialsSchema: z.ZodType<Record<string, string>> | null;   // stored in store setting carrier_credentials (secret)
  defaultStatusMap: Record<string, ShipState | "ignore">;
  createParcels?(ctx: CarrierCtx, parcels: ParcelInput[]): Promise<{ orderId: string; ok: boolean; tracking?: string; labelRef?: string; error?: string }[]>;   // idempotent on orderId
  cancelParcel?(ctx: CarrierCtx, tracking: string): Promise<{ ok: boolean; error?: string }>;
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
an "Unmapped statuses" list until the store maps it to a ship state or `ignore`.

### OPE-§17.3 Carrier accounts (`/app/<h>/shipping/carriers`, `integrations.manage`)

Add an account (adapter, label), its mappings, its tracking URL template (`https://…{tracking}`, https only), its rates
(OPE-§16.4); disable. Credentials (API adapters, R3) are typed into a write-only field and stored in
`carrier_credentials`; the page shows "set / not set" only.

### OPE-§17.4 Shipping flow (`/app/<h>/shipping`, `shipments.write`)

1. **To pack** list (confirmed, ship `to_pack`): bulk "Create shipments" with a carrier account → `shipments` rows
   (state `to_pack`), event `shipment_created`; ship → `packed` once the manifest is exported or a label exists.
2. **Picking list** (print view): items grouped by item and option codes with totals for the selection.
3. **Manifest** (print view and CSV through the account's manifest mapping): full name, phone, city, address,
   landmark, COD amount, content, qty, note; full phones are the reason this needs `shipments.write`; each order gets
   `manifest_exported` (meta `why: "manifest"` counts as a reveal for the alarm).
4. **Tracking import** (or typing): tracking set on the shipment; ship → `shipped` (`shipped_at`).
5. **Status import**: tracking → carrier status → mapped state → `applyExternalStatus(…, { ship }, { kind: "import" })`;
   `shipment_events` rows (`raw` kept 30 days).
6. Delivered → money `collected` (automatic); remittance (OPE-§16.7) → `remitted`.

### OPE-§17.5 Shipment rules

One order → one active shipment; a re-shipment after a refusal is a new row with `parent_id` (R3, OP-22).
Cancelling a pre-pickup shipment (manual: a button; API: `cancelParcel`) puts ship back to `to_pack` and allows the
order to be cancelled. `shipments.state` mirrors `orders.ship_state` for that shipment; `orders.ship_state` stays the
truth for the order.

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
| `remittance` | **statement_ref** (column or constant), paid_at, **tracking** or **order_id**, **cod_amount**, fee, return_fee, net |
| `tracking` | **order_id**, **tracking**, carrier_status |
| `status` | **tracking** or **order_id**, **carrier_status**, at |
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
(added to `extraColumnsOf`). Test orders are never appended: the public path already stores them with `sheet_status =
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
5. **One `values:batchUpdate`** for the dirty orders found in the read: bit 1 → C; bit 2 → D, E, F, G (+ "Repère");
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

### OPE-§19.7 Quota, fairness and the breaker

- Google limits: 300 requests per minute per project and 60 per minute per user per project; the platform service
  account is one user (https://developers.google.com/sheets/api/limits).
- Platform bucket `p:sheets:sa` = 50 calls per 60 s (every Google call takes a token first; none left → the run stops
  and the store keeps its work for the next run).
- Per store per tick: at most one read, one append, one batchUpdate (OD22, accepted in core §H.2 slot 1); the
  `after()` fast path uses at most 2 calls (append, or read + batchUpdate).
- Round-robin over stores with work (`forEachStore(… where: "pending_sheets")`, core §E.2; the predicate is the core's:
  bound + enabled and (`sheet_status` pending / failed past backoff, or `sheet_dirty > 0`, or a pull due)), cursor in
  `cron_cursors`; `sheets.push` has **18 s** and `sheets.pull` **12 s** per tick (core §H.2 as re-cut by PLA Q.18).
- A 429 from Google opens a platform breaker for 90 s (`cron_cursors.state` of `sheets.push` + an in-memory copy);
  every run checks it.
- Capacity **[estimate]**: about 25-45 calls per 5-minute tick plus the request-time pushes, enough for ~100
  actively selling stores at one call per tick each; beyond that, IN-09's store-owned service account takes those
  stores off the shared quota.

### OPE-§19.8 Screen `/app/<h>/integrations/sheets` (P5)

| State | Content |
|---|---|
| Not connected | value line ("Every order lands in your own Google Sheet within a minute, and your agents' status changes come back"), link field, Connect |
| Proof pending | the two steps with the service-account e-mail (Copy), the code (Copy, large mono), Verify, expiry |
| Connected | status card (pattern of `dashboard/sheet-health.tsx`): last push, last pull, backlog, oldest waiting order, last error in plain words; the sheet link (owner, admin, manager); Sync now; Pause / Resume; "Bring status changes back from the sheet" switch; Repair sheet (re-applies header formats and the status dropdown); Disconnect; **Last runs**: the last 20 `SheetsRunReport`s of the store (when, appended / updated / pulled counts, calls used, error) kept in `cron_cursors.state` of `sheets.push` per store (≤ 20 entries, ≤ 4 KB) so Sheets has the same "what happened" surface as the outbox kinds (OPE-§28) without being one |
| Paused | warn state (the yellow `--warn` token, hue ≥ 90): "Paused: new orders wait here" with the backlog |
| Failing | the `explain()` text, Retry, "What to check" |
| Pending store | locked card "Available after approval" (core §A.5.2) |

The export key card (`export_key`, optional store-owned Google key for PHP exports, EXP-03) sits below, write-only.

### OPE-§19.9 Upgrades (IN-09, R2, S5)

- More pulled columns by optional headers: "Note agent" → a `note` event (actor `sheet`), "Tracking" → the
  shipment's tracking, "Transporteur" → carrier account by label, "Frais livraison" → actual fee.
- Tab routing per page (`sheets.routes: { [pageId]: tabTitle }`): one append per tab, counted in the store budget.
- Store-owned service account (`sheets_sa`, secret): that store's calls use its token and skip the platform bucket.
- Label mapping (`sheets.labelMap`: the agents' own words → a legacy status).

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
| Cash held (R2) | daily, > `cashHeldAlertDays` | Amana détient 3 240,00 MAD depuis plus de 15 jours (12 colis). |

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
The same page shows the store's confirmation number and hours (from the `store` setting, LP-04) and, in R3, the
Cloud API connection (`integrations.manage`).

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
export function queueCounts(scope: StoreScope): Promise<{ toCallNow: number; callbacksDue: number; waitingRetry: number; firstTouchBreaches: number; abandonedToday: number; liveAgents: number; oldestCallbackOverdueMin: number | null }>;   // board tiles, Today brief
export function listOrdersForConsole(scope: StoreScope, q: { state?: ConfirmState | ShipState; from?: string; to?: string; after?: string; limit?: number /* ≤ 50 */ }): Promise<{ items: ConsoleOrderRow[]; next: string | null }>;   // ConsoleOrderRow: id, created, states, status, total, city, firstName + initial, phoneMasked, risk, isTest; never address, note or e-mail
export function getOrderForConsole(scope: StoreScope, orderId: string): Promise<ConsoleOrderDetail | null>;     // + items text, timeline (masked), integration states; still masked
export function recordPlatformReveal(ctx: PlatformCtx, scope: StoreScope, orderId: string, reason: string): Promise<{ e164: string } | null>;   // pii.reveal ↑ (core §A.3.3): writes `phone_revealed` with actor_kind "platform" and audit `platform.pii.revealed`; the only way platform code sees a phone
export function orderRiskMix(scope: StoreScope, days: 28): Promise<{ low: number; check: number; high: number; honeypot: number; n: number }>;   // signup-risk and store-risk signals (platform.md), bands only
export function searchOrders(scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }, limit: 8): Promise<SearchHit[]>;   // ⌘K provider body (OPE-§27.7): id prefix or ≥ 4 phone digits; agents: their queue only; results masked
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
| `ops:cash_held` (R2) | operations | 3 | collected-not-remitted older than 30 days | link `/finance/statements` |
| `fin:costs_missing` (rev 2, flag `finance_lite`) | operations | 1 | ≥ 1 live page with orders in 28 d and no `product_costs` row | link `/finance?tab=costs` |

| Rule id (`src/lib/health/rules/integrations.ts`, P5) | Group | Sev. | Rule | Fix |
|---|---|---|---|---|
| `int:sheets_backlog` | integrations | 3 | oldest pending order > 15 min while connected | link `/integrations/sheets` |
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
export function riskBandOutcomes(scope: StoreScope): Promise<Record<"check" | "high", RiskBandOutcome | null>>;   // OD39, OPE-§10.2
```

Rules: agent keys are the member's display name as a label and the user id as the key (pseudonymous enough for the
store's own owner, never shown cross-store); no phone, name, address or note appears in any cell; `campaign` and
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
| Row actions | **Replay** on `dead` (and on `cancelled` CAPI items younger than 7 d − 1 h) → the core's `replay(ctx, id)` (dead → pending, audited `integrations.outbox.replayed` with `{ kind, topic, outboxId }`, second-round request OPE-§Q.26); bucket `s:<sid>:replay:<uid>` 30 / h; "Replay all dead of this kind" ≤ 50 rows per call | core `replay` |
| What to check | per failing kind the three most likely causes in the owner's words (token revoked, sheet not shared, chat not found, endpoint 410) with the fix link | `lastErrorCode` → `int.cause.<code>` keys |

Rules: a replay never re-sends an item whose dedupe key is already `done` (the core's `INSERT IGNORE` and state machine
make it a no-op), a replayed CAPI item still passes the 7-day guard at send time (OPE-§20.4), a replayed Telegram
`new_order` batch re-sends as one message marked "(renvoi)", and a replay of a test order's item is impossible because
none was enqueued. The page polls the pulse's `syncFailed` and refreshes the deliveries list on change (one poller per
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
`src/lib/jobs/handlers/<kind>.ts`. Budgets are the core's **rev 2 slot table** (core §H.2, re-cut by PLA Q.18 and AI R8:
slots 18 / 12 / 13 / 12 / 11 / 8 / 5 / 4 s + 3 s platform = 95 s guaranteed inside the 100 s tick); this table repeats
them so no job here claims more than its slot. `test:jobs` (core §J.1) fails when the registered budgets exceed 95 s.

| Job | Track | Every | Budget (core slot) | Per-store fairness | Does |
|---|---|---|---|---|---|
| `sheets.push` | P5 | tick | **18 s** (slot 1) | round-robin over the `pending_sheets` predicate, ≤ 3 calls per store, platform bucket `p:sheets:sa` 50 / 60 s | OPE-§19.5 |
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

Every job checks `ctx.deadline` between stores; a store whose step throws is skipped for the rest of the tick and
logged (`recordError`, core §H.5); each run writes its `job_runs` rows. No operations job moves an order state on a
timer (OD8): leases expire by comparison, ladders are computed at the outcome, the queue is computed on read.

---

## OPE-§L. Limits

| Limit | Value | Where enforced |
|---|---|---|
| Claim lease | `ops.leaseMinutes` (10; 5-30) | `nextOrder`, `renewLease` |
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
| `/api/app/<h>/orders/export` | GET | `orders.export` (s); audit | P4 | R1 |
| `/api/app/<h>/orders/print?ids=` (HTML, print CSS) | GET | `orders.read` + `shipments.write` | P4 | R1 |
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
| `saveOpsSettingsAction`, `openCallsNowAction` (`team/callcenter/actions.ts`) | `callcenter.configure` | — | `ops` setting; audit |
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

R2 adds `closePeriodAction` / `reopenPeriodAction` (`finance/actions.ts`, `finance.write`, owner only, step-up when the
user has TOTP, audit `finance.period_closed` / `finance.period_reopened`, OD41) and `exportAccountingAction`
(`finance.read`; the sha256 header of OPE-§16.8). R2 and R3 actions otherwise follow the same pattern: commission rules (`commissions.manage`), payouts (`payouts.approve`, s),
expenses / costs / imports / disputes / snapshot recompute (`finance.write`), carrier accounts (`integrations.manage`),
shipments, imports of tracking and status, prints (`shipments.write`), merge (`orders.edit` + `orders.assign`),
assignment rules (`callcenter.configure`), lifting a reveal pause (`orders.assign`), webhook endpoints
(`integrations.manage`, feature `webhooks`), API keys (`integrations.manage`, feature `api_keys`), WhatsApp Cloud API
(`integrations.manage`, s).

### OPE-§M.4 Query plans (every list has an index)

| Query | Index |
|---|---|
| Claim, "To call now", queue counts | `orders_queue_idx (store_id, confirm_state, due_at)` |
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
en in R1 (OD34); the rest is en in R1 (fr R2, ar R3). Sentence case, no exclamation marks except greetings, no em
dash in UI copy (RF §2.1 rule 8), numbers formatted at render. The R1 trilingual set:

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
| `ops.board.bestHours` (rev 2, managers; en in R1) | Best hours to call (your data) | — | — |
| `ops.board.needs30` (rev 2) | needs 30 | — | — |
| `int.deliveries.replay` (rev 2, owners; en in R1) | Replay | — | — |
| `int.deliveries.state.dead` (rev 2) | Failed, will not retry | — | — |
| `ops.me.pending` (R2) | {amount} pending, paid when delivered | {amount} en attente, payé à la livraison | {amount} ف الانتظار، كيتخلص ملي يتوصل |
| `ops.reveal.paused` (R2) | Too many numbers opened. Ask your manager. | Trop de numéros ouverts. Demandez à votre responsable. | حليتي بزاف ديال الأرقام. سول المسؤول ديالك. |

Timeline texts (`ops.tl.<type>`), reasons (`ops.reason.<code>`, OPE-§6.4), risk texts (`ops.risk.<flag>`, OPE-§10.2),
WhatsApp built-ins (`int.wa.<kind>`, OPE-§22.2), Telegram texts (`int.tg.<message>`, OPE-§21.2), the script
built-ins and objection answers (`ops.script.<step>`, `ops.script.obj.<id>.say`, OPE-§7.3) and every tenant-facing
notification title and body (`notify.ops.*`, `notify.int.*`, `notify.fin.*`, OD45) ship in the three languages too and
are covered by `test:i18n-coverage` (core §I.5). English-only R1 keys cover the board, orders list, customers, agents,
call-center settings, integrations, deliveries and Profit lite screens (fr R2, ar R3). Tile keys (`ops.tile.*`,
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
| `test:state` | `src/lib/orders/state.selftest.ts` (P4) | every cell of the three transition tables (legal and illegal per class), implied paths, terminal protection, `projectStatus` over all 80 confirm × ship pairs (golden table), `legacyToWanted` for every label |
| `test:ops` | `scripts/qa/ops-check.ts` (P4; imports `src/lib/callcenter/selftest.ts`) | **static:** only `transition.ts` and the creation insert write `status` / `confirm_state` / `ship_state` / `money_state`; no `phone`, `email`, `address` or `note` field in the `QueueOrder`, `OrderListRow`, `TimelineItem`, `ConsoleOrderRow`, `AggCell` types (TypeScript API); every exported function of `kpis.ts` returns `Kpi` (OD38); the honest-triad catalog lint (OD38); the queue key map and the shell chords are disjoint (§13.3); every new status colour passes the orange check. **Pure:** ladder with the window, closed dates and the `Africa/Casablanca` offset changes; `windowMinutesBetween`; `priorityOf`; `maskPhone` / `maskPhonesIn`; `explainRisk` covers every flag read from `risk.ts`'s source; `cityKey` / `normalizeCity` (fr, ar, alias, fuzzy) fixtures; KPI formulas with the minimum-n rule; the 40-fixture `QueueOrder` cards each ≤ 6 KB gz; the idempotency cache replays `nextOrder` / `recordOutcome` results and expires at 10 min (fake clock) |
| `test:profit` | `scripts/qa/profit-check.ts` (P4) | SF-04 golden fixtures for `E_placed`, break-even CPA and the Wilson intervals; no rate below n = 30; alerts fire once and clear (hysteresis, fake clock); cents parity with `src/lib/page/pricing.ts`; zero costs typed → prompts, no numbers; the by-angle table suppresses cells under 5 orders |
| `test:conversions` | `scripts/qa/conversions-check.ts` (P5, extended) | **conversions:** the trigger matrix of §20.2, event ids, custom events Meta-only, risk gate only for `order`, the 7-day guard boundary (7 d − 1 h), test and manual orders never sent, `capi_ctx` round trip. **templates** (`src/lib/integrations/templates.selftest.ts`): parse / render, optional blocks, unknown variable and unbalanced errors, braces; every built-in (script steps, objection answers, WhatsApp kinds) renders against the 40 order fixtures with **zero numbers not present in the order or settings** (`allowedNumbers` of `src/lib/ai/guard.ts:52`); an empty `eta_text` removes every timing sentence; `confirm_number` falls back to the WhatsApp digits and is empty when `store.confirmation` is unset. **sheets** (`src/lib/sheets/selftest.ts`): the pure run planner (`planSheetRun`): ≤ 1 read + 1 append + 1 batchUpdate, bits → cells, new labels and the "Repère" header, the conflict rule table of §19.6, the row-deleted case, `is_test = 0` in every work predicate. **telegram:** batch merge ≤ 10 orders, "[TEST]" prefix only with `testOrders`, the honest-triad rule on `int.tg.*` |
| `test:render` | `scripts/qa/render-check.ts` (core / T3 fixture, accepted OPE Q.6) | trigger ≠ `order` → thank-you without the pixel chunk, landing with it; every runtime budget unchanged |
| `test:i18n-coverage` (core, P2) | `scripts/qa/i18n-coverage.ts` | the ar/fr/en completeness of OPE-§N's trilingual set, the notification kinds of §21.4 and the gate titles; no em dash or "Step n" in any `ops.` / `int.` / `fin.` key |
| `test:imports` (R2) | `src/lib/imports/selftest.ts` (S3) | RFC 4180 cases, encodings, delimiters, decimals, dates, header detection and signature matching, mapping validation, the ≤ 20 mappings cap |
| `test:webhooks` (R2) | `src/lib/webhooks/selftest.ts` (S5) | Standard Webhooks signature vectors, rotation with two signatures, SSRF guard address table (IPv4, IPv6, mapped) |

### OPE-§O.2 DB-backed (`npm run test:db`, throwaway `cod_test_*` databases)

| Script | File | Checks |
|---|---|---|
| `test:queue` | `scripts/qa/queue-check.ts` (P4) | **200 parallel claims on 50 orders → 50 distinct winners, 150 `empty`**; lease expiry makes an order claimable **and** the next claim writes `released` (`lease_expired`) attributed to the previous holder (OD46); one active claim per agent; a callback reaches its owner first and the pool after the grace; manual mode; round-robin shares over 1,000 orders with weights 1 / 2 / 3 within ±5%; outside window; daily cap; lock-wait or deadlock retried once; the same `Idempotency-Key` sent twice claims once; `releaseAllLeases` releases every claim of the store and none of another |
| `test:ops-db` | `scripts/qa/ops-db-check.ts` (P4) | CAS conflict; external pull refused from a terminal state and the label rewritten; customer counters equal the nightly reconcile; store-wide duplicates (and test orders only match test orders); block-and-cancel; manual order total = the public path's total for the same selection (parity fixtures of `test:offers`) and a replayed `idem` returns the first order; edit re-price; `agent_stats_daily` rollup (incl. `abandoned`) = full recompute; **test-order exclusions everywhere** (the table of OPE-§3.6); `riskBandOutcomes` null below 30 decided and exact above; `attemptStats` and `opsAggregates` on a 50,000-order seeded store ≤ 400 ms, cells under 5 suppressed, no customer field in any cell (canary strings) |
| `test:integrations-db` | `scripts/qa/integrations-db-check.ts` (P5) | Sheets push / pull against a fake `gapi` counting calls (≤ 3 per store per tick), the platform bucket, the 429 breaker, ownership proof (code found / not found / bound elsewhere → generic answer), the last-20-runs history ≤ 4 KB; CAPI enqueue at each trigger and the handler with a mocked `fetch`; Telegram batch merge and 429 `retry_after`; `integration_status` written ≤ 1 / min per row under 1,000 results; a dead item replayed is sent once and a second replay is a no-op (OPE-§28.3) |
| `test:tenancy` (core; cases in `scripts/qa/tenancy-cases/{ops,integrations}.ts`, core §F.1) | `scripts/qa/tenancy-check.ts` | store B's agent: Next never returns A's orders; reveal, outcome, edit, note, assign with A's order ids → `not_found`; A's `Idempotency-Key` replayed by B → a fresh (empty) result, never A's card; B's sheet listing A's order ids is ignored by the pull; binding A's spreadsheet from B → generic refusal; saved view with A's page id → no rows; template values never read A's data; `convertLead` with A's lead → `not_found`; Profit lite costs for A's page → `not_found`; `ops/state`, the pulse contributors, `queueCounts`, `opsAggregates` and the deliveries log never count or list A's rows; `replay` of A's outbox id from B → `not_found` |
| `test:money` (R2) | `scripts/qa/money-check.ts` (S3) | ledger replay from events; payouts exclude pending and void; remittance golden statements (duplicates, partial payments, fee differences, unknown lines), idempotent re-import, ageing across month ends; `finance_daily` golden store |
| `test:carriers` (R2) | `scripts/qa/carrier-check.ts` (S4) | manual adapter manifest / tracking / status round trip; status map coverage; R3 adapters against recorded fixtures |

### OPE-§O.3 HTTP / e2e (`npm run test:e2e`, production build on port 3451+)

- **`qa:wow-demo` steps contributed by P4** (core §J.3, rows 2:15-2:50 of RF §4): the owner session opens `/queue`,
  presses `N` → claim ≤ 300 ms, phone masked, TEST chip visible; a second agent session pressing `N` at the same
  moment does not get the same order; `C` (or `W`) → `phone_revealed` written, each action ≤ 500 ms, optimistic; `1`
  → `confirm_state = confirmed`, the timeline shows attempt → confirmed; the test order never reaches the fake Sheets
  endpoint, the mocked CAPI or the learning tables; the dashboard revenue stays 0; the Telegram mock receives
  "[TEST] …" only when the switch is on.
- The queue at 390 px and 1440 px in ar, fr and en (Playwright `msedge`, HANDOFF §3): the outcome grid's top edge ≥
  590 px at 390 × 844 and every cell ≥ 44 × 44 px (§13.1 geometry), RTL mirroring with `<bdi>` isolates (phones, ids,
  times never reverse), the keyboard map on desktop (`event.code`), no shortcut firing inside the note field or with a
  sheet open, `axe` 0 serious violations, the end-of-day line after Offline.
- **Offline simulation**: Playwright `context.setOffline(true)` between tapping `1` and the response → "Saving…", the
  retry fires on `setOffline(false)` within 30 s with the same `Idempotency-Key`, one `call_attempt` row, "Saved"; a
  reload during the window resumes the pending entry from `sessionStorage`; the entry never contains a phone.
- `qa/admin-visual/shoot.mjs --scan-only` over every new screen (no orange), `scripts/qa/admin-tokens-check.ts`,
  `test:admin-motion` and `test:admin-rtl` (core §J.1) on the operations components.
- Latency budgets (p75 on the local production build with 200 open orders and 10 online agents, the table of
  §13.2): Next ≤ 300 ms server / ≤ 1.2 s on 4G, outcome + next ≤ 500 ms / ≤ 1.5 s, reveal ≤ 200 ms / ≤ 0.8 s, drawer
  open ≤ 400 ms, orders list first page ≤ 400 ms, board payload ≤ 300 ms, `/integrations` ≤ 400 ms; a run above a
  budget fails.

---

## OPE-§P. File ownership (consistent with core §K)

The P4 and P5 rows are **core §K.2's lists verbatim** (every [Q.9] and [Q.17] path of revision 1 is now in them; the
extension files of core §K.3 are named per track). New files of this revision are marked **rev 2** and all fall inside
a folder the core already assigns.

| Track | Owns (create / modify / delete) |
|---|---|
| **P4 CALL CENTER** (R1) | `src/lib/orders/{state.ts, events.ts, queue.ts, customers.ts, duplicates.ts, manual.ts, address.ts, risk-explain.ts, admin.ts, transition.ts, edit.ts, masking.ts, profile.ts, export-zip.ts, state.selftest.ts}`, `src/lib/orders/hooks/ops.ts`, `src/lib/callcenter/**` (rev 2 adds `aggregates.ts` for OPE-§27.6 and `idem.ts` for OD36), `src/lib/finance/lite/**` (rev 2 adds `cents.ts`, OD35), `src/lib/admin-data/orders.ts`, `src/app/app/[store]/{orders,queue,customers,finance}/**`, `src/app/app/[store]/team/{agents,callcenter}/**`, `src/app/api/app/[store]/{orders,ops}/**` (rev 2: `ops/{next,outcome,reveal,presence,state}/route.ts`, `orders/{export,print}/route.ts`), `src/components/admin/{orders,queue,customers,agents,callcenter,finance}/**`, `src/lib/settings/keys/{ops,accounting}.ts`, `src/lib/health/rules/ops.ts`, `src/lib/pulse/contributors/ops.ts`, `src/lib/notify/kinds/ops.ts`, `src/lib/flags/defs/ops.ts` (`finance_lite`), `src/lib/admin-data/search/ops.ts`, `src/components/admin/shell/commands/ops.ts`, `src/components/admin/shell/nav/ops.ts`, `src/lib/i18n/admin/<locale>/ops.ts` (+ the R1 lite `finance.ts` keys), `src/lib/jobs/tracks/ops.ts`, `scripts/qa/{ops-check,queue-check,ops-db-check,profit-check}.ts`, `scripts/qa/tenancy-cases/ops.ts` (rev 2, core §F.1); appends to `src/lib/orders/contract.ts` status labels go through the maintainer (core §Q.4 Q.9a) |
| **P5 INTEGRATIONS** (R1) | `src/lib/sheets/**`, `src/lib/pixels/**`, `src/lib/orders/{conversions.ts, conversions-core.ts}`, `src/lib/orders/hooks/integrations.ts`, `src/lib/integrations/**` (templates, telegram, whatsapp builtins; rev 2 adds `deliveries.ts` for OPE-§28), `src/lib/jobs/handlers/{capi,telegram}.ts`, `src/app/app/[store]/integrations/**` (incl. the rev 2 health strip and deliveries page), `src/app/app/[store]/settings/anti-spam/**`, `src/app/api/app/[store]/sheets/**`, `src/components/admin/{pixels,integrations}/**`, `src/components/admin/settings/sheets-wizard.tsx`, `src/lib/settings/keys/{sheets,conversions,notifications,telegram,export_key,pixel_library,pixel_health,tracking_secrets}.ts`, `src/lib/health/rules/integrations.ts`, `src/lib/pulse/contributors/integrations.ts`, `src/lib/notify/kinds/integrations.ts`, `src/components/admin/shell/commands/integrations.ts`, `src/components/admin/shell/nav/integrations.ts`, `src/lib/i18n/admin/<locale>/integrations.ts`, `src/lib/jobs/tracks/integrations.ts`, `scripts/qa/{conversions-check,integrations-db-check}.ts`, `scripts/qa/tenancy-cases/integrations.ts` (rev 2) |
| **S3 MONEY** (R2) | `src/lib/finance/**` (takes over the lite files), `src/lib/imports/**`, `src/lib/orders/hooks/money.ts`, `src/lib/jobs/tracks/money.ts`, `src/app/app/[store]/finance/**`, `src/components/admin/finance/**`, `src/app/api/app/[store]/{imports,finance}/**`, `src/lib/settings/keys/accounting.ts`, `scripts/qa/money-check.ts` |
| **S4 LOGISTICS** (R2) | `src/lib/carriers/**`, `src/lib/shipping/**`, `src/lib/orders/merge.ts`, `src/lib/callcenter/{rules.ts, reveal-alarm.ts}`, `src/lib/jobs/tracks/logistics.ts`, `src/app/app/[store]/shipping/**`, `src/components/admin/shipping/**`, `src/app/api/app/[store]/shipping/**`, `src/lib/settings/keys/carrier_credentials.ts`, `scripts/qa/carrier-check.ts` |
| **S5 INTEGRATIONS 2** (R2) | `src/lib/webhooks/**`, `src/lib/security/ssrf.ts`, `src/lib/jobs/handlers/webhook.ts`, `src/lib/orders/hooks/webhooks.ts`, `src/app/app/[store]/integrations/webhooks/**`, `src/lib/sheets/**` (IN-09 changes), `src/lib/settings/keys/sheets_sa.ts` |
| **D2 CARRIERS & MESSAGING** (R3) | `src/lib/carriers/adapters/**`, `src/lib/whatsapp-cloud/**`, `src/lib/jobs/handlers/{whatsapp,carrier}.ts`, `src/lib/jobs/tracks/messaging.ts`, `src/app/api/hooks/{carrier,whatsapp}/**`, `src/app/api/v1/**`, `src/lib/api/**`, `src/app/s/[store]/feeds/**`, `src/lib/imports/xlsx.ts`, the R3 slices of `src/lib/finance/**` (AC-08 … AC-11), `src/app/app/[store]/integrations/api/**` |

Read-only for every operations track (CCR through the maintainer): `src/lib/orders/{contract.ts, validate.ts,
create.ts, text.ts, risk.ts, upsell.ts, versions.ts, hooks.ts}`, `src/lib/page/**`, `src/landing/**`, `src/lib/render/**`,
`src/lib/markets/**`, `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, the registries of core §K.3 (`pulse`,
`notify`, `flags`, `health`, `commands`, `nav`, `i18n/admin/index.ts`, `jobs/registry.ts`).

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

---

## OPE-§R. Review decisions

(Empty in revision 1. Filled after the reviews: each row = reviewer, point, decision, section changed.)
