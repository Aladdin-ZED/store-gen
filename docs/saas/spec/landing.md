# Store Gen SaaS part spec: landing pages (first-class), delivery promise, thank-you, tracking, leads, WhatsApp, links, campaigns, experiments

Status: **part spec, revision 1** (2026-10-24, landing part architect). Not yet reviewed (LAN-§28 is empty). Built on
`docs/STORE-SAAS.md` revision 1 (the core contract, cited as **core §X**) and on the settled decisions of
`docs/saas/RESEARCH.md` §2 (cited as **R-D1 … R-D53**). It covers every landing feature id **LP-01 … LP-17** of RESEARCH
§3.4, the landing items the Fable rethink raised (`docs/saas/research/rethink-features.md` §3, cited **rf §x**) and seven
operator-grade additions **LP-18 … LP-24**, each with scope, release and acceptance criteria. Section ids carry the prefix
**LAN-§** so cross-references to the core (`core §E.2`) and to the sibling part specs (`ai.md AI-§D.2`, `design.md DES-§8`,
`platform.md PLA-§3.6`, `operations.md`, `storefront.md`) stay unambiguous.

This document may refine only the tables core §D.9 assigns to the landing part (`delivery_zones`, `experiments`,
`experiment_arms`, `short_links`, the `leads` columns of 0005) and the schemas of the store settings core §D.10 gives it
(`policies`, `checkout` R1 part). Everything else it needs (new tables, a column on a core table, a frozen-file hook, a
permission key, a budget key, a route, file ownership, a cross-track API) is listed in **LAN-§27 Requests to the core**
with the exact change. Nothing here edits the core.

Inputs: `docs/STORE-GEN-BRIEF.md` items 1, 7, 8, 9, 14, 16 · `docs/HANDOFF.md` §2 (owner rules), §4, §5 · core (mostly §A.2,
§A.3, §C.4, §C.6, §C.8, §C.9, §D.2, §D.5, §D.6, §D.10, §E, §H.1-§H.3, §J, §K) · RESEARCH §2-§4 · `docs/saas/TENANCY-MAP.md`
(§5.5-§5.10, §8.2, §8.3, §9.2; item ids PUB-xx, LND-xx, ORD-xx, EXP-xx) · `docs/saas/research/storefront.md` (cited **sf §x**),
`cod-ops.md`, `rethink-features.md`, `rethink-ai.md` · sibling specs `ai.md`, `design.md`, `platform.md` revision 1 · the
format model `docs/OFFERS.md`. Code facts are `path:line` at commit `68c3793`. Next.js is 16.4: store routes are real route
files under `src/app/s/[store]/**` reached through the `src/proxy.ts` rewrite (core §C.3); this part adds route files only
under paths the core already routes (`/s/<h>/…`, `/api/public/*`) plus one platform path (`/kit/<token>`, LAN-§27 Q12).

Reading order for a build agent: LAN-§0 (decisions) → LAN-§1 (your feature rows) → the track you own (LAN-§26) → the
sections your files touch → LAN-§5 (runtime add-ons and budgets, if you touch shopper pages) → LAN-§25 (tests you must keep
green) → LAN-§27 (what the maintainer still has to give you).

### Owner summary (plain English)

1. Landing pages stay a full product: everything they do today (27 sections, packs and options, pixels, exports,
   thank-you upsell, builder, versions) keeps working, now inside each shop, with nothing removed.
2. The engine of today's pages is frozen on purpose (it is at its size limit). Every new thing a shopper sees ships as a
   small separate script that loads only when that feature is on, so pages stay fast on Moroccan phones.
3. **Delivery promise:** you type your delivery zones once (city groups, days, fee). When a shopper picks her city, the
   form shows "Livraison entre mer. 29 et jeu. 30 oct." with real dates, skipping Sundays and holidays. Nothing shows
   until you type it: we never invent a delay or a fee. Cities you don't serve get a WhatsApp button instead of the order
   button.
4. **Thank-you page:** a "Confirm on WhatsApp" button with the order number already written, the number that will call
   (so the shopper picks up), and a link to follow the order.
5. **Order tracking page:** the shopper sees where her order is (received, confirmed, shipped, delivered) and can ask to
   change the address or cancel before shipping. She never sees anyone's address or full phone.
6. **Abandoned forms:** people who typed their phone but didn't order appear in a "Leads" inbox with what they chose. An
   agent sends a ready WhatsApp message in one tap. When that phone orders later, the lead is marked recovered.
7. **Order on WhatsApp:** shoppers who won't fill a form tap "Order on WhatsApp"; the message carries the pack, the real
   price and a reference. The agent turns it into an order in one tap.
8. **Short links and Campaign Kit:** one screen per campaign with the page, a short link per channel (Meta, TikTok,
   WhatsApp) with tracking tags, the WhatsApp text and call script, and an ad brief, all built from your page.
9. **Test orders:** a test link lets you place an order that never reaches Sheets, Meta or your numbers.
10. **Honesty is enforced:** example reviews, chats and numbers can't be published; countdowns use real dates only and
    can't be pushed back after they were shown; prices in tests never change.
11. **Full stores (R2):** a landing page can be attached to a catalog product: it borrows the product's price, options and
    stock, and any special pack price you set is shown as an "override".
12. **R3:** honest A/B tests (you may look every day without fooling yourself), an upsell then downsell after the order,
    scheduled campaigns (Ramadan, Black Friday), video heroes, per-page results down to delivered orders, and delivery fees
    per city charged on landing pages.

---

## LAN-§0 Decisions at a glance

R-D1 … R-D53 are adopted as settled. Rows marked **deviates** or **refines** change or sharpen a settled decision or a
core rule and say why.

| # | Decision | Why |
|---|---|---|
| LD1 | **Frozen means frozen.** PageDoc v2 (`src/lib/page/schema.ts`), runtime config v2 (`src/landing/runtime/config.ts:105-145`), payload v2 (`src/lib/orders/contract.ts:84-98`), the PHP export and the `landing` (24,200 B) and `thanks` (6,650 B) chunks are not changed by this part. Every new shopper behaviour ships in an **add-on chunk** (LAN-§5) that reads its own JSON data block, the DOM, the `lp:order` event (`src/landing/runtime/form.ts:19,324-331`) and the `lp-order` hand-off (`src/landing/runtime/order-store.ts:9`). | R-D43; the landing chunk is within 30 B of its budget (HANDOFF §6); open tabs and exports depend on the contracts. |
| LD2 | **Two R1 add-on chunks, not one per feature:** `assist` on landing pages (delivery line, WhatsApp order, idem capture) and `assist-ty` on thank-you pages (confirm on WhatsApp, expectation block, tracking link); `track` on the tracking page. **Deviates** core §K.2's single `entry-delivery.ts`. | The three landing features are small (≈ 2.4 KB gz together) and usually on together; one script tag means one CSP hash and one budget line instead of three; thank-you code never ships to the landing page. |
| LD3 | Page-level add-on settings the frozen doc can't hold live in the store settings `landing` and `checkout` in R1-R2; from R3 a versioned `pages.addons` / `page_versions.addons` JSON (LAN-§27 Q4) holds what must be charged from the version (upsell chain prices) or tested (experiment arms). | The doc schema is frozen; a price charged after an order must come from the version the shopper saw (OFFERS D8, `src/lib/orders/upsell.ts:3-4`). |
| LD4 | **Delivery zones are owner-typed and empty by default.** In R1-R2 a landing page shows the zone's **ETA** and **the page's own fee** (`offers.shippingFee`, offer `free`), never the zone fee. Zone fees are charged only by store checkout (R2, storefront.md) and by landing pages from LP-16 (R3). | R-D22; the landing pricing is frozen with the runtime and the PHP export (`src/lib/page/pricing.ts:329-349`). |
| LD5 | **ETA as dates ships in R1** (raised from R3 ST-17 by rf §1.6): one pure module `src/lib/delivery/eta.ts` computes the window in the store time zone with working days, a cut-off hour and a holiday list; the `assist` chunk bundles the same module; every date carries the word "estimated". | Baymard: dates, not speeds; one implementation for server texts and the page avoids two promises. |
| LD6 | **A not-served city blocks the form in the browser** (submit hidden, WhatsApp shown) **but the server never refuses an order for a zone**: it accepts and adds the flag `zone_not_served`. | Orders are never blocked by configuration on the server (core §A.4 spirit); old tabs, exports and a mis-set zone must not lose orders. |
| LD7 | **Thank-you add-ons are computed in the browser** from `lp-order` (order id, first name, offer, total) and the `assist-ty` data block (store numbers, hours, templates). The confirm text never contains more than those four values. | The thank-you HTML is static per version; `lp-order` is the only per-order data on the page (`order-store.ts:28-40`). |
| LD8 | **Tracking access = three proofs:** a server-signed link (`?o=&s=`, for messages agents send), the thank-you proof link (`?o=` + the order's idempotency key in the URL **fragment**), or a manual lookup (order number + last 4 phone digits). All failures answer the same. The page never shows a full phone, an address or another order. | LP-05 scope; the idem is a 122-bit secret only the shopper's browser and the server hold (`form.ts:135`, `orders.idem`); a fragment never reaches logs or Referer. |
| LD9 | **Shopper requests never change an order by themselves.** "Change address" / "Cancel" writes an `order_events` row (actor `customer`) and a notification; the agent decides. | A tracking link can be forwarded; a cancel must stay a human decision (call-center flow, operations.md). |
| LD10 | **Leads keep a structured selection** (`leads.sel`) so an agent converts a lead in one tap; WhatsApp-order intents are leads of kind `whatsapp` with a reference code and no phone yet (LAN-§27 Q2: `leads.phone` NULL-able). Recovery is **agent-sent click-to-chat only**, never automated. | One inbox for every warm, ad-paid visitor; EU and Law 09-08 consent rules forbid unsolicited automated messages. |
| LD11 | **Lead capture follows the market:** on for MA and INTL, off for EU markets until the EU pack (ST-21) adds consent. Off = the render omits `endpoints.lead` from the runtime config (already optional, `src/lib/render/config.ts:282`). | GDPR: capturing a typed phone before submit needs a basis; no runtime change needed. |
| LD12 | **Attribution:** an order whose idem equals a lead's → lead `converted`; an order from the same phone within 7 days → `recovered` if the lead had a contact attempt, else `converted`. Computed by the landing order hook. | Credits agents for real recoveries, not for orders that would have come anyway. |
| LD13 | **"Order on WhatsApp" (LP-11) ships in R1** (raised by rf §3.2): the click creates a **server-priced** lead from the published version (tolerant parse of the named form controls, `contract.ts:137-143`), then opens `wa.me` with the offer, the server's total, the page's real delivery fee and a reference `WA-XXXXXX`. Options the server could not resolve are listed "to confirm". | Table stakes in Morocco (rf §1.11); the price in the chat is the server's, never the browser's. |
| LD14 | **Short links (LP-12) ship in R1** on the store host only: `/go/<code>` answers **302** (target can change), adds the preset UTM only when the incoming query has no `utm_` key, appends the incoming raw query byte for byte, counts clicks in memory (flushed every 30 s), paused → 410. | Needed by the Campaign Kit (rf §3.2); 308 would be cached by browsers forever. |
| LD15 | **Campaign Kit (LP-18 = rf SF-01) ships in R1, P3 wave 2**: a kit compiles **only from the page doc and the store settings** (templates, links, pixel plan, ad brief template); the cloud brief rides behind the Cloud AI flag (ai part). The R1 exit does not depend on it. | The switch reason of rf §0; built from existing pieces; honest by construction. |
| LD16 | **Test-order links (LP-19 = rf SF-05) ship in R1:** a signed `?utm_source=sg-test&utm_content=<token>` link; the store route renders the published version **on request without pixels** (and the thank-you link the same way); the order and lead get `is_test = 1` and are excluded from Sheets, CAPI, KPIs and learning. **Refines** platform.md (UX-05 test link in R2): the mechanism lands in R1, the address-card button stays wherever platform.md puts it. | Owner test orders poison stats and ads today (HANDOFF §5); no runtime change: the runtime already carries `utm_content` in every payload (`src/landing/runtime/tracking.ts:10-20`). |
| LD17 | **Proof sections can't publish sample content on SaaS stores** (LP-02): `reviews`, `socialProof`, `stats`, `beforeAfter` with `sample: true` visible = publish **error**; switching `sample` off asks an explicit "these are real" attestation, audited. `aggregateRating` JSON-LD is not emitted on SaaS stores until verified reviews exist (ST-13, R3). Other sample sections (faq, specs, showcase, story, video) stay warnings. | R-D46, EU Omnibus Annex I 23b; the checklist only warns today (`src/lib/editor/checklist.ts:142-152`). |
| LD18 | **Countdowns from real dates only, and they never move back** (LP-21): an end that already passed or already ran on the live page can't be moved later on the same page (error); moving a still-running end later is a warning + audit; ends > 30 days ahead warn; generators and AI never write `countdownEnd` or `stockLeft`. | EU UCPD and owner rule 4; "never resets" is already the model (`src/landing/runtime/countdown.ts:5`), this closes the manual reset. |
| LD19 | **Slug history** (LP-20): a renamed page's old slug answers 308 to the new path for 12 months, per store; another page of the store may take the old slug (the history row is dropped). | Ads and WhatsApp messages keep old links; today the old slug 404s (`src/lib/editor/pages.server.ts:418-441`). |
| LD20 | **A product change republishes attached landings as a new version** (kind `sync`), it is **not** an in-place re-render. **Deviates core §H.3 / D50 for render reason `product`.** | Prices and options live in the version doc the server prices from (`src/lib/orders/upsell.ts:52`, OFFERS D8); rewriting only the HTML would show one price and charge another. |
| LD21 | **Attached pricing (R2):** an attached landing's items mirror the product (price, compare-at, options, SKU, stock) read-only; its offers are its own (pack prices free) and every price that differs from `units × product price` shows an **override** chip with the product price; compare-at comes only from real product data. | R-D49 and sf §8: one price truth, campaign freedom, no invented savings. |
| LD22 | **Experiments (R3) refine R-D47 with rf §1.8:** Fair test = always-valid sequential inference (mSPRT, peeking allowed); in-page arms (headline, hero, one non-form section) are all in the HTML and chosen by a ≤ 450 B head script before first paint; offer-display and whole-version arms are **URL splits** (no cookies exist on store hosts, core §C.9); prices and offer terms never vary (pricing fingerprint equality). | Honest statistics with real seller behaviour; cacheable HTML; no flicker; no cookie assignment possible. |
| LD23 | Auto-optimize weights change **at most once a day** and are baked into the HTML by a re-render (`render_jobs` reason `experiment`, core §D.5). | HTML stays static and cacheable; the frozen runtime needs no fetch. |
| LD24 | **Upsell chain (R3):** ≤ 2 more steps after today's one-click upsell (accept → add-on, decline → downsell), per-step signed tokens, every window anchored to the order time, accepted lines in `orders.items.chain`. Today's single upsell is untouched. | rf/sf L6; the agent must see every added line before the call. |
| LD25 | **Per-city fees on landing pages (LP-16, R3) need runtime_v 3** (a `landing-v3` chunk, config v3, a PHP template v3), a core contract step; until then landing pages charge their flat page fee. | R-D22, R-D43: the v2 runtime computes the shown total `st` with the flat fee. |
| LD26 | Shopper strings ship in ar (Darija-friendly) / fr / en in R1; owners override texts through message templates. Landing admin screens are `en` in R1 except the **Leads inbox and every template agents send** (ar/fr/en), because agents use them (core D36). | Owner rule 4; agents are Moroccan. |
| LD27 | **No tenant code:** chunks, data blocks and experiment arms are generated by the platform; owner text is inserted with `textContent` only; templates are plain text with `{var}` placeholders. | PUB-25, core §C.9 (shared origin until S mode). |
| LD28 | **Exports keep what needs no server:** the delivery line and the thank-you blocks ship in every export; the tracking link only in connected exports (absolute URL to the store's tracking page); WhatsApp order, test links and experiments are live-only. | Static and PHP exports have no platform API; connected exports already post to it (`src/lib/export/server.ts:104-111`). |
| LD29 | **`policies` is the single source of every promise** (legal pages, thank-you steps, FAQ defaults, AI prompt and guard, call script, tracking "your rights" line). Morocco's 7-day withdrawal right (Law 31-08) is shown as a note **[needs legal review]**, never as an invented store policy. | GEN-08; ai.md AI-§D.2 rule 3 consumes it; core D39. |
| LD30 | **Releases:** R1 (P3) wave 1 = LP-01…LP-06, LP-20…LP-22; wave 2 = LP-11, LP-12, LP-18, LP-19. R2 (S1) = LP-07, LP-08, LP-23. R3 (D3) = LP-09…LP-16, LP-24. LP-17 later. **Deviates** core §L.2 for LP-11 and LP-12 (R3 → R1). | rf §3.2 raises; each raise is S; the R1 exit criteria (core §K.2) do not depend on wave 2. |

Glossary: **add-on chunk** = a runtime script outside the frozen landing/thanks chunks (LAN-§5). **zone** = an owner-typed
group of cities with an ETA range, an optional fee and a "not served" flag. **lead** = a partial order captured before
submit (kind `form`) or a WhatsApp-order intent (kind `whatsapp`). **kit** = the Campaign Kit of one page. **arm** = one
variant of an experiment. **attached landing** = a landing page whose `pages.product_id` points at a catalog product (R2).

---

## LAN-§1 Feature map: scope, release, track, acceptance

Release and track per core §L.2 unless LD30 says otherwise. "Wave" splits the P3 track in R1 (wave 2 starts once wave 1
is merged). Acceptance here is the summary; the section holds the full list.

### LAN-§1.1 RESEARCH ids (LP-01 … LP-17)

| ID | Feature | Rel. | Track | Scope | Acceptance (summary) | Spec |
|---|---|---|---|---|---|---|
| LP-01 | Keep every landing feature, store-scoped | R1.0 + R1 | T3, T4 (R1.0), P3 | The TENANCY-MAP §8.3 inventory, each item's tenancy behaviour; frozen contracts | Every row of LAN-§3 has its test green; `test:money`, `test:offers`, `test:php`, render-check budgets unchanged; two-store attack suite covers pages, versions, leads, exports, media refs | LAN-§3 |
| LP-02 | Block publishing sample reviews, stats and social proof | R1 | P3 | Proof sections with `sample: true` → publish error on SaaS stores; attestation on clearing; no `aggregateRating` JSON-LD | Publish of a doc with a visible sample proof section answers `checklist_blocked` listing it; clearing `sample` writes `page.proof_attested`; render of any SaaS page has no `aggregateRating` | LAN-§6.1 |
| LP-03 | Delivery promise line by city | R1 | P3 | `delivery_zones` editor, store calendar, ETA as dates (raised), line in the form, not-served handling, server texts | Empty zones → no line anywhere (render-check); ETA selftest green on cut-off, weekend, holiday, Ramadan time-zone cases; the line's fee equals the page's charged fee on 100 % of fixtures | LAN-§7 |
| LP-04 | Thank-you: confirm on WhatsApp + expectation block + tracking link | R1 | P3 | `assist-ty` chunk, store confirmation numbers and hours, templates, policy-driven steps | The prefilled text contains the order id; the expectation block shows the store's real number or nothing; the tracking link opens the order's status without a lookup | LAN-§8 |
| LP-05 | Order tracking page | R1 | P3 | `/track` with three proofs, status timeline, change/cancel requests before shipping, `noindex`, rate limits | Identical answers for unknown order / wrong digits (status, body, timing class); no full phone or address in any response; a request writes one `order_events` row and one notification | LAN-§9 |
| LP-06 | Abandoned-lead recovery inbox | R1 | P3 | Leads per store with selection, statuses, assignment, one-tap WhatsApp, attribution, consent per market, retention | A lead is listed ≤ 2 s after the beacon; recovered/converted attribution matches LD12 on the fixture set; EU store pages carry no `endpoints.lead`; leads > 30 days are purged | LAN-§10 |
| LP-07 | Attach a landing to a catalog product | R2 | S1 | `pages.product_id`; mirrored items; own offers with override chips; `noindex` + canonical to the PDP by default; republish on product change | A product price change republishes every live attached landing as a `sync` version in ≤ 1 cron tick; no attached landing can publish a compare-at that is not real | LAN-§17 |
| LP-08 | Campaign vs inherit theme mode | R2 | S1 (+ S2) | `pages.theme_mode` (`store` / `campaign`), brand-radius warning (design.md DS15) | An inherit page re-renders in place on a brand change; a campaign page keeps its genes | LAN-§17.6 |
| LP-09 | Experiments (Fair test + Auto-optimize) | R3 | D3 | One engine for landing and store pages; mSPRT; Thompson; in-page and URL-split arms; guardrails | 10,000 simulated A/A tests give ≤ 5 % false "decided" under daily peeking; a price difference between arms is refused; no flicker (arm chosen before first paint) | LAN-§18 |
| LP-10 | Upsell → downsell chain + cross-store upsell | R3 | D3 | ≤ 2 steps after the upsell, per-step tokens, real windows, catalog products in "both" mode | Each step's price equals the version's; an expired window refuses; chain lines appear in the order text and the Sheet row | LAN-§19 |
| LP-11 | Live "Order on WhatsApp" option | **R1** (raised) | P3 wave 2 | Server-priced WhatsApp intent → `wa.me`; agent conversion | The total in the message equals the server's `orderTotals` for the same selection on 100 % of fixtures; conversion re-prices on the server | LAN-§11 |
| LP-12 | Short links with UTM presets | **R1** (raised) | P3 wave 2 | `/go/<code>` on the store host, presets, click counts, pause | The query string reaches the target byte for byte (V7 rule); paused → 410; a code from store A never resolves on store B | LAN-§12 |
| LP-13 | Scheduled campaigns | R3 | D3 | Scheduled publish of a version, unpublish, promo end driving the countdown | A schedule fires within one cron tick of its time; the countdown end equals the schedule end; a missed tick catches up once | LAN-§20.1 |
| LP-14 | Video-first hero, PDP video, UGC strip | R3 | D3 (+ D4 sections) | Poster as LCP, deferred 9:16 clip, one video at a time | LCP element is the poster on 100 % of fixtures; no video bytes before first interaction or idle; reduced motion = poster only | LAN-§20.2 |
| LP-15 | Per-page analytics with delivered rate | R3 | D3 | Views, form starts, orders, confirmed, delivered, refusal by offer, UTM, variant, city | Every rate shows its n and hides below n = 20; numbers equal the SQL fixtures; no customer data on the screen | LAN-§20.3 |
| LP-16 | Per-city fees charged on landing pages | R3 | D3 (+ core contract step) | runtime_v 3 chunk, config v3, PHP template v3 | Runtime, server and PHP totals equal on every zone fixture; v2 pages unchanged | LAN-§20.4 |
| LP-17 | Two-step form, quizzes, advertorial kind, build-your-box / multiple bumps, honest exit popup, section visibility by UTM or device, opt-in real "orders today" counter | later | — | Each validated with Experiments first; fake viewers, fake purchase toasts, resetting countdowns and invented stock are rejected outright | Own acceptance when scheduled | LAN-§21 |

### LAN-§1.2 Operator-grade additions (LP-18 … LP-24)

| ID | Feature | Rel. | Track | Scope | Acceptance (summary) | Spec |
|---|---|---|---|---|---|---|
| LP-18 | Campaign Kit (= rf SF-01) | R1 | P3 wave 2 (+ P7 cloud brief) | `campaigns` table, kit screen, WhatsApp/script/brief templates, short link per channel, pixel plan, read-only share link | A kit compiles with Cloud AI off; 0 invented numbers in every brief of the 60 eval fixtures; "page changed since" shows after a republish; revoking the share link → 404 | LAN-§13 |
| LP-19 | Test-order links (= rf SF-05) | R1 | P3 wave 2 (+ T3 CCR, operations) | Signed test link, pixel-free on-request render, `is_test` on orders and leads, exclusions | A test order never reaches Sheets, CAPI, KPIs, `stats_*` or learning tables; the rendered test page and its thank-you contain no pixel script; an unsigned `sg-test` link behaves as a normal visit | LAN-§14 |
| LP-20 | Slug history redirects | R1 | P3 (+ T3 route) | `page_slug_history`; 308 from old slugs for 12 months; reuse rules | An old slug answers 308 to the new path with the raw query; a reused slug serves the new page; history never crosses stores | LAN-§15.1 |
| LP-21 | Honest time and stock guards | R1 | P3 | Countdown move rules (LD18), > 30 days warning, stock staleness warning, generator/AI write ban | Each rule has a checklist fixture; the generator fixtures never set `countdownEnd`/`stockLeft` | LAN-§6.2 |
| LP-22 | Page vitals in the pages list | R1 | P3 | 7-day views, orders, conversion and confirmation rate per page from existing stats | Numbers equal the SQL fixture; rates hidden below n = 20 with "needs more visits" | LAN-§15.2 |
| LP-23 | Copy a page to another store I belong to | R2 | S1 | Duplicate a page into a second store with media re-ingested under the target store's ids | The copy references only the target store's assets; requires `pages.write` in both stores; audit rows in both | LAN-§17.7 |
| LP-24 | Saved sections and house blocks | R3 | D3 | Save a configured section; reuse across the store's pages; shared footer/guarantee blocks | A saved block inserted in two pages renders identically; editing the block offers "update everywhere", which republishes exactly the listed pages as `sync` versions | LAN-§21.2 |

---

## LAN-§2 Data: refined tables, new tables, settings keys

Conventions are core §D.1 (`id26`, `ts`, `cents`, `storeRef`, guarded hand-written SQL, every tenant index starts with
`store_id` except queue claim indexes, which follow the `render_jobs` precedent). The maintainer writes the SQL; the
column lists below are the contract. Requests: LAN-§27.

### LAN-§2.1 Tables this part refines (core §D.9)

**`delivery_zones` (0005, core §D.5)**, final column list:

```ts
export const deliveryZones = mysqlTable("delivery_zones", {
  id: id26().primaryKey(), storeId: storeRef(),
  name: varchar("name", { length: 80 }).notNull(),                     // owner label: "Casablanca", "Grandes villes", "Reste du Maroc"
  cities: jsonText<string[]>("cities").notNull(),                      // city keys = City.value of src/lib/markets/cities-ma.ts ("Casablanca", "Fès", "Autre"), or ["*"]
  feeCents: cents("fee_cents"), freeFromCents: cents("free_from_cents"),   // NULL = not typed (never invented); charged only from R2 (LD4)
  etaMinDays: tinyint("eta_min_days"), etaMaxDays: tinyint("eta_max_days"),   // working days; both NULL or both set
  notServed: boolean("not_served").notNull().default(false),
  note: varchar("note", { length: 120 }),                              // agents only (drawer, script); never rendered on a page
  position: int("position").notNull().default(0),
  updatedBy: id26("updated_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("dz_store_idx").on(t.storeId, t.position)]);
```

Invariants (enforced by `saveZones()` under `storeLock(storeId, "zones")`, core §E.7; JSON can't be indexed): at most 40
zones per store; a city key belongs to at most one zone; at most one `["*"]` zone (every city not in another zone,
"Autre" included unless listed); `0 ≤ etaMin ≤ etaMax ≤ 30`; fees `0 … 100,000,000` cents; a `notServed` zone has no fee
and no ETA; city keys must exist in the market's city list (`MA_CITIES`, `src/lib/markets/cities-ma.ts:176`). **R1
markets:** zones exist for markets with a city list (MA). Other markets get one implicit "everywhere" zone (ETA only,
from `policies.delivery.typicalDays`); the editor says "City zones arrive with your market's city list" (EU field model,
R-D45, storefront.md).

**`leads` (0004 + 0005)**: the 0005 columns of core §D.2 plus this part's refinements:

| Column | Type | Note |
|---|---|---|
| `status` | `enum('new','contacted','recovered','lost','converted') NOT NULL DEFAULT 'new'` | core; meaning in LAN-§10.4 |
| `kind` | `enum('form','whatsapp') NOT NULL DEFAULT 'form'` | **new**: `whatsapp` = an "Order on WhatsApp" intent (LAN-§11) |
| `phone` | `varchar(24)` **NULL-able** | **type change** (request Q2): a WhatsApp intent has no phone until the chat starts |
| `ref` | `char(9) NULL` | **new**: `WA-` + 6 Crockford chars, written in the WhatsApp text; unique per store |
| `sel` | `longtext NULL` | **new**: `LeadSelection` JSON (below), ≤ 8 KB; the structured choice for one-tap conversion |
| `total_cents` | `bigint NULL` | **new**: server total of the resolved selection at capture (display only; conversion re-prices) |
| `version_id` | `varchar(26) NULL` | **new**: the version the visitor saw (payload `ver`) |
| `assignee_id`, `contacted_at`, `attempts`, `note` | core | `attempts` = WhatsApp or call attempts logged from the inbox |
| `next_at` | `datetime(3) NULL` | **new**: next follow-up due (from `landing.leads.followUpHours`) |
| `lost_reason` | `varchar(32) NULL` | **new**: `no_answer`, `not_interested`, `wrong_number`, `already_ordered`, `price`, `other` |
| `converted_via` | `enum('idem','phone','agent') NULL` | **new**: how `converted_order_id` was set (LD12) |
| `is_test` | `boolean NOT NULL DEFAULT false` | **new**: captured during a test session (LAN-§14) |
| `updated_at` | `datetime(3) NOT NULL DEFAULT now(3)` | **new** |

Indexes: core `leads_store_status_idx (store_id, status, created_at)`; new `leads_store_phone_idx (store_id, phone,
created_at)` (attribution), `leads_store_assignee_idx (store_id, assignee_id, status)`, `leads_store_ref_uq (store_id,
ref)` (several NULLs allowed), `leads_store_next_idx (store_id, next_at)`. `leads_idem_uq` stays global (core D28; a
WhatsApp intent gets a server-generated uuid v4).

```ts
// src/lib/leads/types.ts (isomorphic)
export interface LeadSelection { v: 2; ver?: string; bundleId?: string; bump?: boolean; units: UnitIn[]; extras: Record<string, string>; b?: UnitIn }
// UnitIn = src/lib/orders/contract.ts:72-82 (unchanged); built with the tolerant parse of leadSelection() (contract.ts:270-282)
```

**`short_links` (core §D.6, 0007 → moved to 0005, request Q6)**:

```ts
export const shortLinks = mysqlTable("short_links", {
  id: id26().primaryKey(), storeId: storeRef(),
  code: varchar("code", { length: 16 }).notNull(),                     // generated: 6 Crockford chars; owner-chosen: 3-16 of [a-z0-9-]
  target: varchar("target", { length: 300 }).notNull(),                // store-relative path: "/" | "/<slug>" | R2: "/p/<slug>", "/c/<slug>"
  pageId: id26("page_id"), campaignId: id26("campaign_id"),
  utm: jsonText<ShortLinkUtm>("utm"),                                  // presets { source, medium, campaign, content, term } within contract maxima (contract.ts:15-27)
  channel: mysqlEnum("channel", ["meta", "tiktok", "snap", "google", "whatsapp", "instagram", "organic", "print", "other"]),
  status: mysqlEnum("status", ["active", "paused"]).notNull().default("active"),
  clicks: int("clicks").notNull().default(0), lastClickAt: ts("last_click_at"),
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("sl_store_code_uq").on(t.storeId, t.code), index("sl_store_page_idx").on(t.storeId, t.pageId), index("sl_store_campaign_idx").on(t.storeId, t.campaignId)]);
```

**`experiments`, `experiment_arms` (0007, core §D.6)**, refined:

```ts
export const experiments = mysqlTable("experiments", {
  id: id26().primaryKey(), storeId: storeRef(), pageId: id26("page_id").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  surface: mysqlEnum("surface", ["landing", "store_page"]).notNull().default("landing"),   // one engine (R-D47)
  mode: mysqlEnum("mode", ["fair", "auto"]).notNull().default("fair"),
  split: mysqlEnum("split", ["in_page", "url"]).notNull(),
  metric: mysqlEnum("metric", ["confirmed_per_unique", "orders_per_unique", "delivered_per_unique"]).notNull().default("confirmed_per_unique"),
  status: mysqlEnum("status", ["draft", "running", "decided", "stopped", "ended"]).notNull().default("draft"),
  horizon: tinyint("horizon").notNull().default(28),                   // days; auto-end
  minSample: int("min_sample").notNull().default(100),                 // uniques per arm before any decision
  baseVersionId: id26("base_version_id"),                              // published version the arms were cut from
  startedAt: ts("started_at"), endedAt: ts("ended_at"), winnerArm: varchar("winner_arm", { length: 8 }),
  decision: jsonText<ExperimentDecision>("decision"), weightsAt: ts("weights_at"),
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("ex_store_page_idx").on(t.storeId, t.pageId, t.status), index("ex_due_idx").on(t.status, t.weightsAt)]);
export const experimentArms = mysqlTable("experiment_arms", {
  id: id26().primaryKey(), storeId: storeRef(), experimentId: id26("experiment_id").notNull(),
  key: varchar("key", { length: 8 }).notNull(),                        // "a" = control, "b", "c" (≤ 3 arms)
  kind: mysqlEnum("kind", ["headline", "hero", "offer_display", "version", "section"]).notNull(),   // "section" appended
  payload: jsonText<ArmPayload>("payload").notNull(),                  // LAN-§18.3
  versionId: id26("version_id"),                                       // url-split arms: the arm's published version row
  weightBp: int("weight_bp").notNull().default(5000),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ea_exp_key_uq").on(t.experimentId, t.key), index("ea_store_idx").on(t.storeId, t.experimentId)]);
```

### LAN-§2.2 New tables and columns (requests Q1, Q2, Q4, Q7, Q8, Q21, Q24, Q32)

```ts
// 0005 · Campaign Kit (LP-18)
export const campaigns = mysqlTable("campaigns", {
  id: id26().primaryKey(), storeId: storeRef(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 40 }).notNull(),                     // utm_campaign value, [a-z0-9-]
  pageId: id26("page_id").notNull(), pageVersionId: id26("page_version_id"),   // version the kit was compiled from
  productRef: jsonText<{ kind: "landing_items" | "product"; id: string }>("product_ref").notNull(),
  channels: jsonText<CampaignChannel[]>("channels").notNull(),
  kit: jsonText<CampaignKit>("kit").notNull(),                         // LAN-§13.2, ≤ 64 KB
  kitSource: mysqlEnum("kit_source", ["library", "cloud"]).notNull().default("library"),
  offersHash: char("offers_hash", { length: 16 }).notNull(),           // pricing fingerprint at compile (LAN-§18.4) → "page changed since"
  shareTokenHash: char("share_token_hash", { length: 64 }),            // sha256 of the read-only share token; NULL = not shared
  status: mysqlEnum("status", ["draft", "live", "paused", "ended"]).notNull().default("draft"),
  startsAt: ts("starts_at"), endsAt: ts("ends_at"),
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cp_store_slug_uq").on(t.storeId, t.slug), index("cp_store_page_idx").on(t.storeId, t.pageId), uniqueIndex("cp_share_uq").on(t.shareTokenHash)]);

// 0005 · slug history (LP-20)
export const pageSlugHistory = mysqlTable("page_slug_history", {
  storeId: storeRef(), slug: varchar("slug", { length: 80 }).notNull(),
  pageId: id26("page_id").notNull(), until: ts("until").notNull(),
  hits: int("hits").notNull().default(0), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.slug] }), index("psh_page_idx").on(t.storeId, t.pageId)]);

// 0007 · experiment exposures (LP-09)
export const experimentExposures = mysqlTable("experiment_exposures", {
  storeId: storeRef(), experimentId: id26("experiment_id").notNull(),
  vidHash: char("vid_hash", { length: 32 }).notNull(),                 // hmac(vid, "exp-vid:<storeId>")[:32]; never the raw visitor id
  armKey: varchar("arm_key", { length: 8 }).notNull(),
  firstAt: ts("first_at").notNull(), idem: char("idem", { length: 36 }),    // last order attempt of this visitor (lp:order)
}, (t) => [primaryKey({ columns: [t.storeId, t.experimentId, t.vidHash] }), index("xe_arm_idx").on(t.storeId, t.experimentId, t.armKey), index("xe_idem_idx").on(t.storeId, t.idem)]);

// 0007 · scheduled campaigns (LP-13)
export const pageSchedules = mysqlTable("page_schedules", {
  id: id26().primaryKey(), storeId: storeRef(), pageId: id26("page_id").notNull(),
  kind: mysqlEnum("kind", ["publish_version", "unpublish", "end_promo"]).notNull(),
  versionId: id26("version_id"), campaignId: id26("campaign_id"),
  runAt: ts("run_at").notNull(), note: varchar("note", { length: 140 }),
  state: mysqlEnum("state", ["pending", "running", "done", "failed", "cancelled"]).notNull().default("pending"),
  attempts: tinyint("attempts").notNull().default(0), error: varchar("error", { length: 200 }),
  createdBy: id26("created_by"), createdAt: createdAt(), doneAt: ts("done_at"),
}, (t) => [index("ps_store_page_idx").on(t.storeId, t.pageId, t.runAt), index("ps_due_idx").on(t.state, t.runAt)]);

// 0007 · saved sections and house blocks (LP-24)
export const savedBlocks = mysqlTable("saved_blocks", {
  id: id26().primaryKey(), storeId: storeRef(),
  name: varchar("name", { length: 80 }).notNull(), type: varchar("type", { length: 32 }).notNull(), variant: varchar("variant", { length: 32 }),
  data: jsonText<unknown>("data").notNull(),                           // section data, sanitized; asset refs of this store only (assertOwned)
  shared: boolean("shared").notNull().default(false),                  // house block: "update everywhere"
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index("sb_store_type_idx").on(t.storeId, t.type)]);
export const savedBlockUses = mysqlTable("saved_block_uses", {
  storeId: storeRef(), blockId: id26("block_id").notNull(), pageId: id26("page_id").notNull(), sectionId: varchar("section_id", { length: 40 }).notNull(),
}, (t) => [primaryKey({ columns: [t.storeId, t.blockId, t.pageId, t.sectionId] }), index("sbu_page_idx").on(t.storeId, t.pageId)]);
```

Columns on tables other parts own (requests through the core):

| Table | Migration | Change | Why |
|---|---|---|---|
| `orders` | 0005 | + `is_test boolean NOT NULL DEFAULT false`, index `orders_store_test_idx (store_id, is_test, created_at)` | LAN-§14; operations owns the 0005 order columns |
| `orders` | 0007 | index `orders_store_variant_idx (store_id, variant_key, created_at)` (`variant_key` is 0006, AI-12) | experiment results (LAN-§18.6) |
| `orders.items` JSON | 0007 | optional `chain: UpsellRecord[]` (additive; readers that don't know it ignore it, like `upsell.unit`, `src/lib/orders/upsell.ts:82-86`) | LAN-§19 |
| `page_versions` | 0006 | `kind` enum append `'sync'` | LD20 attached republish |
| `pages`, `page_versions` | 0007 | + `addons longtext NULL` (`PageAddons`, LAN-§19.2); the version copy is written at publish | LD3 |
| `render_jobs` | 0005 | `reason` enum append `'store_info'` | thank-you, legal and tracking documents bake store contacts (LAN-§8.5) |

### LAN-§2.3 Store settings keys owned or extended here (core §D.10)

Each schema is an extension file `src/lib/settings/keys/<key>.ts` (core §K.3). None of these values is secret.

```ts
// src/lib/settings/keys/policies.ts (landing, R1): the single source of promises (LD29); ai.md reads it as StorePolicyFacts
const LocText = z.object({ ar: z.string().trim().max(140).optional(), fr: z.string().trim().max(140).optional(), en: z.string().trim().max(140).optional() });
export const Hours = z.object({ days: z.array(z.number().int().min(1).max(7)).min(1).max(7), from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) });
export const PoliciesSetting = z.object({
  v: z.literal(1).default(1),
  inspection: z.enum(["allowed", "not_allowed", "unset"]).default("unset"),           // open and check the parcel before paying
  delivery: z.object({
    coverage: z.enum(["national", "listed_zones", "unset"]).default("unset"),
    typicalDays: z.tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)]).nullable().default(null),   // used when zones are off
    freeFromCents: z.number().int().min(0).max(100_000_000).nullable().default(null), // a statement only; landing pricing unchanged (LD4)
  }).default({}),
  returns: z.object({ accepted: z.boolean().nullable().default(null), windowDays: z.number().int().min(1).max(90).nullable().default(null), whoPays: z.enum(["store", "customer", "unset"]).default("unset"), condition: LocText.optional() }).default({}),
  exchange: z.object({ accepted: z.boolean().nullable().default(null), windowDays: z.number().int().min(1).max(90).nullable().default(null) }).default({}),
  refund: z.object({ method: z.enum(["cash", "transfer", "store_credit", "unset"]).default("unset"), withinDays: z.number().int().min(1).max(60).nullable().default(null) }).default({}),
  warranty: z.object({ months: z.number().int().min(1).max(120).nullable().default(null), text: LocText.optional() }).default({}),
  contact: z.object({ channels: z.array(z.enum(["phone", "whatsapp", "email"])).max(3).default([]), hours: Hours.nullable().default(null) }).default({}),
  extras: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,24}$/), text: LocText })).max(6).default([]),
  reviewedAt: z.string().datetime().nullable().default(null),
});
export type StorePolicyFacts = z.output<typeof PoliciesSetting>;

// src/lib/settings/keys/checkout.ts (landing R1 part; storefront.md adds cart rules and the buy model in R2)
export const CheckoutSetting = z.object({
  zonesEnabled: z.boolean().default(false),
  lineOnLanding: z.boolean().default(true),                            // show the delivery line on landing pages when zones are on
  calendar: z.object({
    workdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5, 6]),   // ISO weekdays; MA default Mon-Sat
    cutoffHour: z.number().int().min(0).max(23).nullable().default(null),            // store-local; later orders start the next working day
    holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).default([]),  // store-local dates
    holidaysReviewedYear: z.number().int().min(2026).max(2100).nullable().default(null),
  }).default({}),
  notServed: z.object({ whatsapp: z.boolean().default(true) }).default({}),           // show "message us" in place of the submit
  confirmationCall: z.boolean().default(true),                         // core: the confirmation-call promise (thank-you, FAQ, guard)
  newPageForm: z.object({ city: z.enum(["select", "text", "hidden"]).optional(), address: z.enum(["required", "optional", "hidden"]).optional(), note: z.enum(["optional", "hidden"]).optional() }).default({}),   // R-D45 defaults for new pages; a page keeps its own FormConfig
});

// src/lib/settings/keys/landing.ts (landing, R1; NEW key, request Q9)
export const LandingSetting = z.object({
  v: z.literal(1).default(1),
  inStoreMode: z.boolean().default(false),                             // R2 store mode: "also use landing pages" (core §A.2 modeAllows opts)
  thankYou: z.object({ confirmWhatsapp: z.boolean().default(true), expectation: z.boolean().default(true), trackLink: z.boolean().default(true) }).default({}),
  leads: z.object({ capture: z.enum(["market_default", "on", "off"]).default("market_default"), followUpHours: z.array(z.number().int().min(1).max(168)).max(3).default([2, 24]) }).default({}),
  waOrder: z.object({ enabled: z.boolean().default(false) }).default({}),
  tracking: z.object({ requests: z.boolean().default(true) }).default({}),
  attach: z.object({ noindexDefault: z.boolean().default(true), shopLink: z.boolean().default(true) }).default({}),   // R2
});
```

The core-owned `store` key carries the fields LP-04 needs (core §D.10 names them); the exact shape this part reads
(request Q10 confirms it):

```ts
confirmation: z.object({
  callerPhone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),     // E.164: the number agents call from (shown in full: it is the store's own)
  whatsapp: z.string().regex(/^[1-9]\d{7,14}$/).optional(),          // wa.me digits for "Confirm on WhatsApp" (defaults to store.whatsapp)
  hours: Hours.optional(),                                           // calling hours, store-local
  withinHours: z.number().int().min(1).max(48).optional(),           // "we call within N hours" (omitted = no promise)
}).default({})
```

Message template kinds this part defines in `message_templates` (operations' table, core §D.5; defaults in
`src/lib/landing/templates.ts`, ar/fr/en, LAN-§24.2): `customer_confirm` (thank-you prefill), `wa_order` (WhatsApp order
text), `lead_recovery` (agent → lead), `track_link` (agent → customer, carries the signed tracking link). The kit
(LAN-§13) also reads operations' order-confirmation kind (IN-05) and call script (OP-05).

### LAN-§2.4 Migrations by release

| Migration | This part's content |
|---|---|
| 0004 (R1.0) | nothing of its own: `pages.store_id`, `pages.kind`, `pages.product_id`, `leads.store_id`, `stores.home_page_id` are core |
| 0005 (R1) | `delivery_zones`; the `leads` columns of LAN-§2.1 and `phone` NULL-able; `short_links` (moved from 0007); `campaigns`; `page_slug_history`; `orders.is_test`; `render_jobs.reason` + `store_info` |
| 0006 (R2) | `pages.theme_mode` (core); `page_versions.kind` + `sync` |
| 0007 (R3) | `experiments`, `experiment_arms` (refined), `experiment_exposures`, `page_schedules`, `saved_blocks`, `saved_block_uses`, `pages.addons`, `page_versions.addons`, `orders_store_variant_idx` |

---

## LAN-§3 Today's landing features under tenancy (LP-01)

Every feature of TENANCY-MAP §8.3 stays, with no regression and no behaviour removed. Most of the tenancy work lands in
R1.0 (tracks T3 EDGE and T4 SCOPE, core §K.1); this section is the landing part's checklist that each one works per store.
"Test" names the gate that proves it (core §J); a row without its test green blocks the R1 exit.

### LAN-§3.1 Inventory and how each item works per store

| Area | Kept as is | Per store (what changes) | Ids · where | Test |
|---|---|---|---|---|
| Sections | 27 types, 91 variants (incl. header `none`), zones, seeded dividers, 6 background tones, spacing, hidden, error isolation | The render context carries the store: `StoreContext` from the store row + `store` + `brand` settings (core §A.1 inv. 4); every in-page link from `storeBase()` / `storePath()` (core D48) | PUB-06, PUB-10, PUB-16, LND-02 · T3 | render-check P and S fixtures (links, canonical, media URLs) |
| Offers v2 | 1-8 items, fixed/choice lines, free lines, rules, perks, gifts, visuals, badges, preselected, soldOut, genuine compare-at, display axes, extras, bump, shipping fee and free-shipping offers, real countdown and stock | Unchanged code (`src/lib/page/pricing.ts`, integer cents); currency from `stores.currency` (ORD-07); the doc stays per page | ORD-07 · T3 | `test:money`, `test:offers` unchanged |
| Options | choice / matrix / fields, warehouse codes, per-unit vs shared groups | Unchanged | — | `test:offers` |
| Order form | 4 variants, city select/text/hidden, address/note/email modes, phone validation, WhatsApp alternative, reassurance, honeypot, Turnstile, idempotency, stale flow (72 h), payload v2 with `ver` + `st` | The public order API finds the store through the pageKey (`resolvePublicTarget`, ORD-01) and refuses non-servable states (core §A.5.3); store buckets (ORD-02, ORD-21); blocklist, per-phone limit, duplicates and risk history per store (ORD-03…05); Turnstile = platform widget unless the store overrides (PUB-08, IN-06); `checkOrigin` = `storeHosts(target.store)` (PUB-20, V6) | ORD-01…07, PUB-08, PUB-20 · T3 | `test:public-api`, `test:tenancy` (pageKey of a suspended store refused) |
| Abandoned-lead capture | debounced keepalive beacon after a valid phone (`src/landing/runtime/lead.ts`), one row per idem, `selection` text | `upsertLead` writes `store_id` from the target; bucket `s:<sid>:lead:ip`; the "own page" update rule (`src/lib/orders/leads.ts:61-62`) also requires `store_id`; structured `sel` saved (LAN-§10.2) | ORD-18 · T3 (scope), P3 (LAN-§10) | `test:tenancy` (lead of A can't be updated with B's pageKey) |
| Thank-you + upsell | timeline, recap from `lp-order`, WhatsApp help, legal links, Purchase pixel once per order, one-click upsell with a window anchored to the order time | Thank-you path `storePath(store, "/<slug>/merci")` (PUB-10, PUB-17); the upsell handler selects the order by id **and** store (ORD-17); the token scheme is unchanged (`src/lib/orders/upsell.ts`, `create.ts:79-80`) | PUB-17, ORD-17 · T3; additions LAN-§8 (P3) | `test:public-api` (upsell token of A on B's host refused) |
| Pixels | per-page answer (Meta ×3, TikTok ×3, Snap, GA4 or "No pixel"), library, test codes and windows, health, browser funnel, advanced matching, CAPI/Events with the risk gate, first-party beacons, UTM and click ids | Library, tokens, health per store (PIX-01…08); `event_source_url` from `storeUrl` (PIX-02); web-storage keys prefixed per store in P mode (`lp:<h>:px-u`, LND-13, core §C.9) | PIX-*, LND-12…14 · T3, T4 | `test:pixels-publish` |
| Theme | 11 archetypes, 9 harmonies, OKLCH, contrast and no-orange guards, 5 font slots incl. Arabic, radius/shadow/texture/surfaces/motion, dividers, RTL, 8 locales, 9 markets | Tenant-agnostic engine (TENANCY-MAP §8.1); brand locks from the `brand` setting (design.md DES-§12); generation upgrades are design.md's | GEN-* · P6 | `test:theme`, orange checks |
| Head / SEO | title, description, og image, noindex, canonical, OG/Twitter, JSON-LD Product, favicon, theme-color | Absolute URLs from `storeUrl` (PUB-11, D48); JSON-LD `aggregateRating` off on SaaS stores (LD17, request Q14); robots and sitemap per store (core §C.8) | PUB-11, PUB-27 · T3 | render-check (no `aggregateRating`), robots fixtures |
| Legal pages | themed privacy, terms, shipping, contact, visible gaps instead of invented ids | Store route `/policies/<kind>` + `returns` (core §C.4.1); facts from `store` + `policies` (LND-32, LAN-§3.3); templates flagged `needs_legal_review` (core D39) | PUB-03, LND-32 · T3, P3 | render-check legal fixtures per market |
| Security / performance | hash CSP per document, style attributes = custom properties only, `inlineJson`, `sanitizeDeep`, `safeHref`, `frame-ancestors 'none'`, per-variant CSS chunks, runtime chunk budgets, caps (400 KB gz HTML, 24 KB config, 48 option photos), packet guard | CSP origins per host class (core §C.9); add-on chunks join the hash CSP (LAN-§5); no tenant JS/HTML (LD27) | PUB-14, PUB-25 · T3 | `qa:headers`, render-check budgets |
| Builder | iframe preview (mobile/tablet/desktop, zoom, interactive), inline edit, outlines, drag reorder, section library, inspector, 100-step undo, autosave + serial queue + conflict dialog + local recovery, versions (autosave/save/publish/restore/import/generation, star, rename, preview, restore with/without pixels, duplicate as page), remix, checklist, slug move with auto-republish and revert, unpublish, full preview | Every action through `storeAction` (LND-23); `pageRow(scope, id)` (LND-17…22); preview at `/app/<h>/preview/<id>` in a sandboxed iframe (LND-25, LND-26, SE-05); local recovery key `bld:unsaved:<userId>:<storeId>:<pageId>` (LND-29); slug rules per store with `STORE_RESERVED_SLUGS` (core §C.4.1); fix links through `appHref` (LND-07); publish under `publish` entitlement + `s:<sid>:publish` 60/h; slug history added (LAN-§15.1) | LND-17…30 · T4 | `test:tenancy`, `qa:action-replay` |
| Versions | immutable versions, autosave pruning, restore | `versions_kept_per_page` entitlement (30) prunes the oldest non-starred non-published versions | DB-03 · T4 | `test:tenancy-unit` |
| Generator | photo palette, SigLIP classification, VLM copy with the library fallback, background removal, three directions, other styles, honesty guard, focal/crop editing, pixel gate on Directions | Store-free inputs (GEN-02), drafts `sg:gen:<storeId>:v2` (GEN-03), AI per ai.md, design per design.md | GEN-01…14 · T4, P6, P7 | `test:generator`, AI eval gate |
| Media | sniff, sharp pipeline, video scrub, picker, focus/framing | Per-store asset ids (core D21); `assertOwned` on save, publish and export (LND-05, core §E.3 rule 5) | MED-*, LND-05 · T4, P8 | `test:storage`, `test:tenancy` |
| Exports | website ZIP, connected (allow-listed origins), PHP `order.php` parity, WhatsApp bridge, revoke | LAN-§16 | EXP-01…07 · T4 | `test:php`, `test:tenancy` |
| Home page | one global home | `stores.home_page_id`; never a fallback to another store's page (PUB-05) | PUB-05, DB-02 · T3 | render-check store home |
| Stats | `stats_daily` views, uniques, form starts, orders, revenue | `store_id` column, store timezone for "day" (STAT-01…04) | STAT-* · T3 | `test:tenancy-unit` |

### LAN-§3.2 Builder checklist changes (P3, `src/lib/editor/checklist.ts`)

`buildChecklist` gains a fifth optional parameter (callers keep compiling; the editor passes it, request Q15):

```ts
export interface LandingCheckContext {
  saas: true;                                   // always true in Store Gen; keeps the function usable by fixtures
  zones: { enabled: boolean; count: number; hasMarketList: boolean };
  policiesReviewed: boolean;                    // policies.reviewedAt set
  confirmation: { callerPhone: boolean; whatsapp: boolean };
  waOrder: boolean;                             // landing.waOrder.enabled
  published: { countdownEnd?: string; stockLeft?: number; stockChangedAt?: string } | null;   // the live version's values
  appHref: (path: `/${string}`) => string;      // fix links (replaces the "/admin/settings/store" literal, checklist.ts:29)
}
export function buildChecklist(doc: PageDoc, store: StoreHealth, now?: number, pixels?: PixelCheckContext, landing?: LandingCheckContext): Checklist;
```

| Id | Level | Condition | Fix target |
|---|---|---|---|
| `sample:<sectionId>` | **error** (proof types) / warning (others) | LD17: `reviews`, `socialProof`, `stats`, `beforeAfter` visible with `sample: true` | the section |
| `rating:unattested` | warning | `product.rating` set; the builder asks the attestation when the value is typed (LAN-§6.1) | Product tab |
| `urgency:reset` | **error** | the live version's `countdownEnd` already passed and the doc's end is later (LD18) | Offers tab |
| `urgency:extended` | warning | the live end is still running and the doc's end is later | Offers tab |
| `urgency:far` | warning | `countdownEnd` more than 30 days ahead | Offers tab |
| `urgency:stock-stale` | warning | `stockLeft` unchanged for > 14 days on the live page | Offers tab |
| `delivery:zones-empty` | warning | zones off or empty in a market with a city list ("Shoppers see no delivery date") | `appHref("/settings/delivery")` |
| `policies:unreviewed` | warning | `policies.reviewedAt` is null ("The thank-you page and the AI only promise what your policies say") | `appHref("/settings/policies")` |
| `thanks:no-caller` | warning | thank-you expectation on and no `confirmation.callerPhone` | `appHref("/settings/general")` |
| `wa:no-number` | error | `landing.waOrder.enabled` and neither `form.whatsapp.number` nor `store.whatsapp` | `appHref("/settings/general")` |
| `store:contact`, `store:legal` | warning | unchanged rules, fix links through `appHref` | — |

The **server** enforces the errors marked LD17/LD18 at publish (a checklist in the browser is not a guard): the publish
path calls the gates registered by tracks (request Q13); this part registers `src/lib/render/gates/landing.ts`:

```ts
export interface PublishGateInput { scope: StoreScope; doc: PageDoc; prev: PageDoc | null /* live version's doc */; now: Date; store: StoreRow }
export interface PublishGateIssue { code: "honesty.sample_proof" | "honesty.countdown_reset"; sectionId?: string; message: string }
export const landingPublishGate: (input: PublishGateInput) => Promise<PublishGateIssue[]>;
// publish answers { ok: false, error: "honesty_blocked", issues } (the builder shows them as checklist errors)
```

### LAN-§3.3 Policies editor and legal pages (P3)

Screen `/app/<h>/settings/policies` (`settings.write`). One column of cards, each a plain question with honest answers
and "Not set" as a real state (never a default promise):

| Card | Question (en; fr/ar in R2/R3 with the dashboard) | Writes | Used by |
|---|---|---|---|
| Inspection | "Can customers open the parcel before paying?" Yes / No / Not set | `inspection` | thank-you step 4, FAQ defaults, AI guard, call script |
| Delivery | "Where do you deliver?" Whole country / Only my zones / Not set · typical days when zones are off · free-delivery threshold statement | `delivery.*` | legal shipping page, AI prompt, tracking line |
| Returns and exchange | accepted?, window, who pays, condition text | `returns`, `exchange` | legal returns page, FAQ, AI guard |
| Refund | method, within days | `refund` | legal returns page |
| Warranty | months, text | `warranty` | FAQ, AI guard |
| Contact | channels, hours | `contact` | legal contact page, tracking help |
| Your own lines | ≤ 6 lines ar/fr/en, ≤ 140 chars each | `extras` | AI prompt (ai.md AI-§F.2 row "Store policies"), FAQ |

- A Morocco note sits under Returns: "Moroccan law 31-08 gives buyers of distance sales a withdrawal period (7 days in
  general). Your legal pages show it. Needs legal review." The returns legal page shows the law's line from the legal
  template (core D39), not from the store's answer.
- Saving sets `reviewedAt` and enqueues `render_jobs` reason `store_info` for live pages whose thank-you or legal pages
  change (LAN-§8.5). The legal pages render on request (they read the facts at serve time, PUB-03), so they change at once.
- `policyLines(facts, locale): string[]` (≤ 6 lines, ≤ 300 tokens; consumed by ai.md AI-§F.2) and
  `policyAllows(facts, claim)` with `claim ∈ "delivery_time" | "free_delivery" | "return_window" | "exchange" | "inspection" | "warranty" | "refund"`
  (consumed by `src/lib/ai/guard-policies.ts`, ai.md AI-§D.2 rule 3) live in `src/lib/policies/index.ts` (pure, P3).
- Legal content: `src/landing/legal/content.ts` gains a `returns` kind and reads `StorePolicyFacts` (request Q16 moves
  `src/landing/legal/**` to P3 for R1 product; T3 delivers the route and the store facts in R1.0).

Acceptance: an unset answer never produces a sentence on any page or in any AI output (fixture: every card unset → the
legal pages show the visible-gap lines, the thank-you shows no inspection step, the guard rejects "livraison gratuite");
each answer appears in the legal page of each locale; saving re-renders affected live pages within one cron tick.

---

## LAN-§4 Landing pages in each store mode (core §A.2)

| Topic | `landing` (R1) | `store` (R2) | `both` (R2) |
|---|---|---|---|
| Nav group "Landing pages" (Pages, Generate) | shown | shown only when `landing.inStoreMode` | shown |
| Store home `/` | `stores.home_page_id` (a landing page) or the store's branded "no page yet" page (core §A.2) | storefront home | storefront home |
| Landing URL | `<base>/<slug>` (core §C.4.1) | same, when shown | same; attached landings default to `noindex` + canonical to the PDP (core §C.8, R-D49) |
| Offers | the page's own items and offers | — | own, or attached to a product (LAN-§17) |
| Thank-you | LAN-§8 | — | + "Discover the shop" link (`landing.attach.shopLink`) and cross-store upsell (R3, LAN-§19) |
| Orders | `orders.source = 'live'` with `page_id` | storefront sources | both, one queue (operations.md) |
| Leads, tracking, short links, kits, tests | yes | yes (store pages use the same tracking page and short links) | yes |

- **Set as home** (Pages list row menu, `pages.publish`): writes `stores.home_page_id`; only a published landing page
  can be home; unpublishing the home page asks to pick another or confirm the "no page yet" page. Hidden in `store`/`both`
  modes (the storefront owns `/`).
- **Mode switch safeguard** (refines core §A.2 "hidden capability answers the store's 404"; request Q34): switching to `store` while
  live landing pages exist opens a sheet listing them with their 7-day views ("These pages receive visits: keep them on?")
  and sets `landing.inStoreMode = true` unless the owner unticks it. A switch never unpublishes a page; it only hides.
- Generation in `both` mode: Create → "Landing page" offers "From a product" (R2, LAN-§17.2) or "From photos" (today's
  wizard).

Acceptance: in `store` mode with `inStoreMode` false, `/<slug>` of a live landing answers the store's 404 and the page
row keeps `status = 'published'`; switching back serves it again with the same HTML (no re-render); the switch sheet
lists exactly the live landing pages with their views.

---

## LAN-§5 Runtime add-ons and budgets

### LAN-§5.1 Contract

Add-on chunks are standalone IIFEs (the model is `src/landing/runtime/entry-whatsapp.ts:30-48`): they read
`#lp-config` (runtime config v2, read-only), their own `<script type="application/json" id="lp-…">` block, the DOM
(markup contract, OFFERS §F.6, and the slots this part adds), the `lp:order` CustomEvent and `lp-order` in
sessionStorage. They never call into the core (its state is module-private, `src/landing/runtime/units.ts:132`), never
change the payload, never price, and never throw: each entry body is wrapped in `try { … } catch (e) { console.warn("[lp+]", e) }`.
The core runs the same whether an add-on loaded or not.

```ts
// src/landing/addons/types.ts (P3; isomorphic types)
export type AddonChunk = "assist" | "assist-ty" | "track" | "exp-head" | "exp" | "chain" | "landing-v3";
export type AddonDataId = "lp-assist" | "lp-assist-ty" | "lp-track" | "lp-exp" | "lp-chain";
export interface RenderAddons {
  head: AddonChunk[];                                   // inline in <head> before any section (exp-head only)
  body: AddonChunk[];                                   // inline after the core chunk
  data: Partial<Record<AddonDataId, unknown>>;          // serialised with inlineJson (core render escaping)
  css: string[];                                        // extra CSS chunk names (assist line, thank-you blocks, arms)
}
// src/landing/addons/plan.ts (P3; pure): what a document embeds
export interface AddonInput {
  page: "landing" | "thanks" | "track";
  mode: "live" | "preview" | "export-static" | "export-connected" | "export-php" | "export-whatsapp" | "test";
  doc: PageDoc; store: { handle: string; timezone: string; market: string; currency: string; locale: string };
  settings: { checkout: CheckoutValue; landing: LandingValue; policies: StorePolicyFacts; confirmation: ConfirmationValue; whatsapp?: string };
  zones: readonly DeliveryZoneRow[]; templates: TemplateTexts; experiments?: RunningArmsForPage;   // R3
  links: { trackBase: string; waOrderEndpoint: string; expEndpoint?: string };
}
export function addonsFor(input: AddonInput): RenderAddons;
```

The renderer gets `RenderAddons` from the publish/render path (request Q3: an `addons` field in the render context and
`runtimeScripts` / the Shell honouring it, added by T3 in R1.0 as a generic hook). Inline add-on scripts join the
document's hash CSP like every runtime chunk. Data blocks are `type="application/json"` (not executed, no hash).

### LAN-§5.2 Chunks, budgets, loading rules

| Chunk | Entry (P3) | Loaded on | When | Budget gz (request Q5) | Release |
|---|---|---|---|---|---|
| `assist` | `src/landing/runtime/addons/assist.ts` | landing | zones line on (`checkout.zonesEnabled && lineOnLanding` and ≥ 1 zone with an ETA or `notServed`), or WhatsApp order on, or the thank-you tracking link on (idem capture) | 2,600 B | R1 |
| `assist-ty` | `…/addons/assist-ty.ts` | thanks | any `landing.thankYou` block on and its data present | 1,500 B | R1 |
| `track` | `…/addons/track.ts` | tracking page | always on `/track` | 2,400 B | R1 |
| `exp-head` | `…/addons/exp-head.ts` | landing, store pages | a running in-page experiment | 450 B (inline head) | R3 |
| `exp` | `…/addons/exp.ts` | landing, store pages | any running experiment | 1,200 B | R3 |
| `chain` | `…/addons/chain.ts` | thanks | `addons.upsellChain` on | 2,000 B | R3 |
| `landing-v3` | `src/landing/runtime/entry-v3.ts` (fork of `entry.ts`) | landing (runtime_v 3 only) | LP-16 pages | 24,700 B (replaces `landing`) | R3 |

Page caps (`budgets.json` key `page`, render-check +5 % rule, `scripts/qa/render-check.ts:119-131`): the heaviest product
page today measures 31,931 B of scripts (OFFERS §F.9). With `assist` it becomes ≈ 34,500 B: request Q5 raises `page` to
**34,800 B** and adds a `thanks-page` cap of **12,600 B** (thanks 6,650 + pixels 3,900 + assist-ty 1,500 + margin; R3:
14,600 B with `chain`). A chunk over budget fails `npm test` (render-check), as today.

Shared pure modules the chunks import (bundled by `scripts/build-landing-assets.mjs`, request Q30): `src/lib/delivery/eta.ts`,
`src/lib/delivery/line.ts`, `src/landing/runtime/addons/select.ts` (form-control serialiser, LAN-§11.3),
`src/landing/runtime/addons/storage.ts` (store-prefixed keys, core §C.9 rule: prefix `lp:<h>:` derived from
`location.pathname` `/^\/s\/([a-z0-9-]{3,30})\//`, empty outside `/s/`), `src/lib/experiments/assign.ts` (R3).

### LAN-§5.3 Modes, preview and exports

| Mode | assist | assist-ty | Notes |
|---|---|---|---|
| live | yes | yes | — |
| test (LAN-§14) | yes | yes | pixel chunk absent; WhatsApp order hidden |
| preview (builder full preview, `/app/<h>/preview/<id>`) | yes, offline: the line works with a sample city picker; the WhatsApp order button shows a "works on the live page" note | yes, with a sample order id `CMD-PREVIEW` | no network calls (`cfg.mode === "preview"`) |
| export-static / export-php / export-whatsapp | delivery line only | confirm + expectation (no tracking link) | LD28 |
| export-connected | delivery line only | confirm + expectation + tracking link (absolute `storeUrl(store, "/track")`) | LD28 |

The in-builder interactive preview (`src/components/preview/**`, React) does not run add-ons in R1; the slots render
their server fallback (LAN-§7.6) so the layout matches. Acceptance: a page with every add-on off has byte-identical HTML
to the same page rendered without this part (render-check golden).

---

## LAN-§6 Honesty rules for landing pages (LP-02, LP-21)

### LAN-§6.1 Proof content (LP-02)

- **Proof sections** = `reviews`, `socialProof`, `stats`, `beforeAfter` (their schemas carry `sample`, e.g.
  `src/landing/sections/reviews/model.ts:52`, `socialProof/schema.ts:52`, `stats/model.ts`, `beforeAfter/model.ts:53`).
  On Store Gen stores a visible proof section with `sample: true` can't publish (checklist error + server gate
  `honesty.sample_proof`). Hidden sections are ignored. Other sections with a `sample` flag (faq, specs, showcase, story,
  video) keep today's warning, because they carry product words, not claims of other people.
- **Clearing `sample`** on a proof section (the toggle in the inspector) opens a confirm sheet: "These are real
  [reviews | chats | numbers | photos] from my customers. Publishing invented proof breaks the platform rules and can close
  the store." Confirm writes audit `page.proof_attested` (meta `{ pageId, sectionId, type }`), cancel keeps `sample` on.
  The same sheet appears when `product.rating` is typed or changed (meta `{ field: "rating", value, count }`). P3 ships
  the sheet; the builder (P6 in R1 product) mounts it (request Q31).
- **Ratings in JSON-LD:** no `aggregateRating` on any Store Gen page (`src/landing/document.tsx:289-290` today emits it
  from `product.rating`); verified ratings arrive with ST-13 (R3, storefront.md). The visible rating keeps its count
  ("4,7 · 38 avis").
- The generator and AI never produce proof content marked real: defaults stay `sample: true` (today's section defaults),
  and ai.md's guard forbids ratings and counts (AI-§D.2 rule 5).

Acceptance: publish of a fixture with a visible `reviews` section `sample: true` answers `honesty_blocked` with
`honesty.sample_proof` and that section id; hiding the section or attesting clears it; render-check finds no
`aggregateRating` in any fixture; the audit row exists for each attestation.

### LAN-§6.2 Time and stock (LP-21)

| Rule | Level | Gate |
|---|---|---|
| A countdown needs a real end (`offers.urgency.countdownEnd`, or from R3 a schedule end, LAN-§20.1); without one the urgency section falls back as today (`src/landing/sections/urgency/index.tsx:101-102`) | — | renderer (unchanged) |
| The live version's end passed and the doc's end is later | error | `honesty.countdown_reset` |
| The live end still runs and the doc's end is later | warning + audit `page.countdown_extended` on publish | — |
| End more than 30 days ahead | warning | — |
| `stockLeft` unchanged for > 14 days while live (`published.stockChangedAt` from the version history) | warning | — |
| Generators, presets and AI tasks never write `countdownEnd` or `stockLeft` | test | `test:generator` fixture assertion |
| The upsell window stays anchored to the order time (`src/lib/orders/upsell.ts:56-57`); chain steps too (LAN-§19) | — | server |

A seller who runs a new campaign with a new deadline uses a new page, a duplicated page, or (R3) a scheduled campaign:
the copy in the error says so ("A countdown that ended can't restart on the same page. Duplicate the page for a new
campaign, or remove the countdown.").

### LAN-§6.3 Promises

Every promise a landing page, thank-you page, tracking page or message makes comes from `policies`, `checkout`, the zones
or the `store` contacts (LD29): the thank-you timeline step 2 ("We call to confirm") only when `checkout.confirmationCall`;
step 4 "Check, then pay in cash" only when `policies.inspection = "allowed"`, else "Pay in cash on delivery" (today the
hint is hard-coded, `src/landing/thankyou/ThankYou.tsx:47-60`); a delivery date only from a zone; a free-delivery line only
from the page's real fee (`offers.shippingFee`, offer `free`). Acceptance: the four combinations of
`confirmationCall × inspection` render the four expected timelines in ar/fr/en (render-check fixtures).

---

## LAN-§7 Delivery promise: zones, calendar, ETA as dates (LP-03, R1)

### LAN-§7.1 Server API (`src/lib/delivery/**`, P3)

```ts
// src/lib/delivery/types.ts (isomorphic)
export interface DeliveryZoneRow { id: string; name: string; cities: string[]; feeCents: number | null; freeFromCents: number | null; etaMinDays: number | null; etaMaxDays: number | null; notServed: boolean; note: string | null; position: number }
export interface StoreCalendar { tz: string; workdays: readonly number[]; cutoffHour: number | null; holidays: readonly string[] }
export interface EtaWindow { from: string /* YYYY-MM-DD store-local */; to: string; minDays: number; maxDays: number }
export interface ZoneLine { zoneId: string; zoneName: string; notServed: boolean; eta: EtaWindow | null; etaText: Record<"ar" | "fr" | "en", string> | null; feeCents: number | null }

// src/lib/delivery/zones.server.ts
export function listZones(scope: StoreScope): Promise<DeliveryZoneRow[]>;                 // cached scopedCache("zones") 30 s, invalidated on save
export function saveZones(ctx: StoreCtx, zones: ZoneInput[]): Promise<{ zones: DeliveryZoneRow[]; problems: ZoneProblem[] }>;
//   permission checkout.write; replace-all in one transaction under storeLock(id, "zones"); audit store.delivery.updated
//   (counts only); enqueueRenders(scope, "all-live", "store_info", 6) so the fallback line text follows (LAN-§7.4)
export function zoneLineFor(scope: StoreScope, cityKey: string, at?: Date): Promise<ZoneLine | null>;   // the P0 stub name of core §K.2
// used by: tracking page ETA (LAN-§9), agent drawer and call script (operations.md), WhatsApp templates {eta_text} (IN-05),
// the Campaign Kit delivery text (LAN-§13), storefront PDP/checkout (R2), LP-16 (R3)

// src/lib/delivery/match.ts (pure)
export function zoneForCity(zones: readonly DeliveryZoneRow[], cityKey: string): DeliveryZoneRow | null;   // exact key, else the "*" zone, else null
export type ZoneProblem = { code: "city_twice" | "star_twice" | "eta_order" | "eta_half" | "not_served_values" | "unknown_city" | "too_many"; zone?: string; city?: string };
```

City keys: the `value` of `MA_CITIES` (French spelling, `src/lib/markets/cities-ma.ts:166-176`), which is what the city
`<select>` posts (`src/landing/sections/orderForm/parts.tsx:188`) and what `orders.city` stores. For text-mode city
fields, the server side maps free text with operations' address normaliser (OP-13) before `zoneForCity`; the page itself
shows only the general line for text-mode cities (no fuzzy match in the browser).

### LAN-§7.2 ETA algorithm (`src/lib/delivery/eta.ts`, pure, isomorphic, bundled into `assist`)

```ts
export function localParts(now: Date, tz: string): { ymd: string; hour: number; isoWeekday: number } | null;   // Intl.DateTimeFormat(…, { timeZone: tz }); null if unsupported
export function addWorkingDays(ymd: string, n: number, cal: StoreCalendar): string;
export function etaWindow(cal: StoreCalendar, zone: { etaMinDays: number; etaMaxDays: number }, now: Date): EtaWindow | null;
export function etaText(w: EtaWindow | null, zone: { etaMinDays: number; etaMaxDays: number }, locale: "ar" | "fr" | "en", dateLocale: string, now: Date): string;
```

1. `p = localParts(now, cal.tz)`; `null` → the window is `null` and the text is the day range ("en 1 à 3 jours ouvrés").
2. **Start day** = `p.ymd` when it is a working day (`cal.workdays` has its ISO weekday, it is not in `cal.holidays`)
   and (`cutoffHour` is null or `p.hour < cutoffHour`); otherwise the next working day.
3. `from = addWorkingDays(start, etaMinDays)`, `to = addWorkingDays(start, etaMaxDays)`; `addWorkingDays` skips
   non-working weekdays and holidays; `n = 0` returns `start`.
4. Text: `from === to` → one date ("Livraison le mer. 29 oct."); `to` more than 21 calendar days away → the day range;
   otherwise "entre {from} et {to}". Dates format with `Intl.DateTimeFormat(dateLocale, { weekday: "short", day:
   "numeric", month: "short", timeZone: "UTC" })` on `ymd` at 12:00 UTC (no shift), where `dateLocale` is the page's
   money locale (`cfg.money.locale`, which already encodes the page's digit choice, e.g. `ar-MA` with Latin digits).
   No dashes in the text (DG-07 rule): words carry the range.
5. Every rendered date carries the muted marker "(estimation)" / "(تقريبي)" / "(estimated)".
6. The time zone comes from `stores.timezone` (default `Africa/Casablanca`); Morocco's Ramadan offset change is handled
   by the browser's and Node's tz data, never by our code.

Holiday seed (`src/lib/delivery/holidays-ma.ts`): fixed dates offered as one-tap additions for the next 12 months, each
**[verify yearly with an official calendar]**: 01-01, 01-11, 01-14 (Yennayer), 05-01, 07-30, 08-14, 08-20, 08-21, 11-06,
11-18; 10-31 (Unity Day) **[unverified]**. Movable religious holidays (Eid al-Fitr, Eid al-Adha, 1 Muharram, Mawlid) are
**never pre-filled**: the editor shows empty date slots for each with the note "Dates depend on the moon sighting: add
them when announced". A daily job raises the store notification `delivery.holidays_review` in January and whenever
`holidaysReviewedYear < current year` (once per 30 days), and the store health flag of platform.md reads the same fact.

### LAN-§7.3 Editor (`/app/<h>/settings/delivery`, `checkout.write`; read with `settings.read`)

- **Top:** master switch "Show delivery dates to shoppers" (`checkout.zonesEnabled`), sub-switch "On landing pages"
  (`lineOnLanding`), and a live card "What a shopper in [city ▾] sees right now", rendered by the same `etaText` + line
  module as the page (never a mock).
- **Zones (left, 360 px):** cards in `position` order; each shows name, city count, "1 to 2 working days" or "Days not
  set", "25 DH" or "Fee not set", a "Not served" pill. Drag to reorder (keyboard: Alt+↑/↓). "Start with 3 zones" creates
  three named zones with **no days and no fee**, the ~30 major cities pre-assigned to "Grandes villes", the rest to "Reste
  du Maroc" (`*`), and a banner "Fill in the days and the fees: shoppers see nothing until you do".
- **Cities (right):** search over the 147 cities in ar and fr (folded matching, the city list labels), rows with their
  zone pill, multi-select with Shift, "Move to zone ▾"; filter chips All · Unassigned · per zone. Moving a city removes it
  from its old zone (no conflict state possible in the UI; the server still validates).
- **Calendar card:** working days (7 toggles, Mon-Sat default), cut-off hour (none / 10:00 … 20:00), holidays list with
  "Add the fixed holidays of <year>", the empty movable slots, and "I reviewed the holidays for <year>".
- **Fee note** under the fee field: "Landing pages still charge the delivery fee set on each page. Zone fees are used by
  store checkout and, later, by landing pages."
- States: loading skeleton mirroring the two columns; empty ("No delivery zones yet. Add them to show shoppers a delivery
  date."); saving (optimistic, undo toast 6 s); server problems inline on the zone card; markets without a city list
  show the typical-days field of `policies.delivery` instead of zones.
- Phone (< 768 px): one column, zones as cards, cities in a full-height sheet with sticky search.

### LAN-§7.4 The line on landing pages

Slots rendered by the order form (P3, `src/landing/sections/orderForm/**`): `<p class="lp-dz" data-lp-dz="offer"
aria-live="polite">` under the offers fieldset (`index.tsx:154`) and `<p class="lp-dz" data-lp-dz="city">` under the city
field. Server fallback text (no JS, exports, the builder's interactive preview): the general range when ≥ 1 served zone has
days ("Livraison en 1 à 3 jours ouvrés selon la ville"), else empty and `hidden`.

`assist` behaviour (data block `lp-assist.dz`: zones as `{ n, d?: [min, max], ns?: 1 }[]`, `city: Record<cityKey,
zoneIndex>`, `star?: zoneIndex`, the calendar, localized strings; ≈ 2-3 KB JSON for 147 cities):

| State | Line |
|---|---|
| No city yet | "Livraison en {min} à {max} jours ouvrés selon la ville · {fee}" (min/max over served zones) |
| City in a zone with days | "Livraison à {city} : entre {from} et {to} · {fee} (estimation)" |
| City in a zone without days | "Livraison à {city} · {fee}" |
| City in a not-served zone | "Nous ne livrons pas encore à {city}." + "Écrivez-nous sur WhatsApp" button; the form gets `data-lp-dz-state="ns"` and CSS hides the submit row; a capture-phase `submit` listener on `document` blocks Enter-key submits |
| City outside every zone and no `*` zone | no line (no promise) |
| Text-mode city field | the general line only |

`{fee}` is the page's real fee for the checked offer: `input[name="bundle"]:checked` → `cfg.bundles[i].free` or
`cfg.shippingFee === 0` → "livraison gratuite", else `fmtCents(cfg.shippingFee, cfg.money)` (`src/landing/runtime/config.ts:72-90,134`);
it updates on every offer change. The not-served WhatsApp button opens `wa.me/<store whatsapp>` with "Bonjour, livrez-vous
à {city} ?" (the page's locale); without a store WhatsApp number the submit stays visible and the line only informs
(`checkout.notServed.whatsapp` decides the button). Motion: height and opacity ≤ 180 ms, none under reduced motion.

**Server side:** orders are never refused for a zone (LD6). The landing order hook (`src/lib/orders/hooks/landing.ts`)
adds `zone_not_served` to `orders.flags` when the order's city maps to a not-served zone, so the agent sees it.

### LAN-§7.5 Acceptance and tests

- `test:delivery` (new, `src/lib/delivery/selftest.ts`, in `npm test`): cut-off before/after; Saturday order with
  Mon-Sat; Sunday start; holiday skip including two consecutive holidays; `min = 0`; month and year crossings; a date
  inside Ramadan in `Africa/Casablanca` (offset from tz data); `Intl` without `timeZone` support → day range; ar/fr/en
  texts with Latin digits for `ar-MA`; > 21 days → day range; every `ZoneProblem` code.
- render-check: zones empty → no `lp-assist` data, the slots empty and hidden; zones on → fallback text and the chunk
  present; the line's fee equals the charged fee for every offer of the `duo` and `tshirt` fixtures (free offers
  included).
- Playwright (msedge, `qa/e2e` step `delivery`): choose a city → dated line; switch offer → fee updates; a not-served
  city → submit hidden, WhatsApp link `https://wa.me/<digits>?text=…`; reduced motion → no transition.
- `test:tenancy`: zones of store A never appear in store B's data block, editor or `zoneLineFor`.

---

## LAN-§8 Thank-you additions (LP-04, R1)

### LAN-§8.1 Blocks (rendered by `src/landing/thankyou/ThankYou.tsx`, filled by `assist-ty`)

| Block | Where | Content | Server fallback |
|---|---|---|---|
| Confirm on WhatsApp | in the hero, beside the order-number chip (`ThankYou.tsx:351`) | a pill button with the WhatsApp glyph: "Confirmer sur WhatsApp" / "أكّد الطلب فواتساب" / "Confirm on WhatsApp" | hidden (needs the order id) |
| Expectation | first step of the "what happens next" timeline (the call step) | "Nous vous appelons du 06 61 23 45 67 pour confirmer, {when}." + "Enregistrez ce numéro pour reconnaître notre appel." | the sentence without `{when}` when a caller phone exists; else today's step text |
| Track my order | footer of the summary card | link "Suivre ma commande" | hidden |

The one-click upsell keeps its place and behaviour (it is time-bound and the money moment); the confirm pill is compact so
it never competes with it. Timeline step texts follow LAN-§6.3 (policy-driven).

### LAN-§8.2 Data block `lp-assist-ty`

```ts
interface AssistTyData {
  v: 1; h: string /* handle, storage prefix */; tz: string;
  confirm?: { wa: string /* digits */; tpl: string /* customer_confirm template, page locale; vars {order_id} {offer} {total} {name} */ };
  expect?: { phone: string /* display format, LTR isolate */; hours?: { days: number[]; from: string; to: string }; within?: number;
             s: { within: string; laterToday: string; tomorrow: string; nextDay: string } };
  track?: { base: string /* storePath(store, "/track") or the absolute URL in connected exports */ };
}
```

### LAN-§8.3 `assist-ty` behaviour

1. Read `lp-order` with the same checks as `src/landing/runtime/order-store.ts:9-40` (`ORDER_ID_RE`, bounded fields) and the
   `?o=` query; a record that does not match `?o=` is ignored (as `thankyou.ts:163-169`).
2. **Confirm:** `href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(fill(tpl, { order_id, offer: rec.items ||
   rec.bundleLabel, total: formatMoney(rec.total, cfg.money), name: firstWord(rec.name) }))`, text ≤ 600 chars (cut at a
   word). Click: open in a new tab; when the idem is known (step 4) send `POST /api/public/track { op: "intent", o, k,
   kind: "confirm_whatsapp" }` with `keepalive` (LAN-§9.3), which writes the order event `customer_confirm_intent` so the
   agent sees "Shopper confirmed on WhatsApp" in the queue (operations.md).
3. **Expectation `{when}`** from the store-local time (`localParts`, LAN-§7.2) and `hours`: inside the calling hours →
   "dans les {within} heures" (only when `within` is set, else "aujourd'hui"); before opening → "aujourd'hui à partir de
   {from}"; after closing or on a non-calling day → "demain à partir de {from}" or "{weekday} à partir de {from}".
4. **Track:** the idem comes from sessionStorage `lp:<h>:idem:<pageKey>`, written by `assist` on the landing page when the
   form dispatches `lp:order` (detail `{ idem }`, `form.ts:324-331`); link = `track.base + "?o=" + id + "#k=" + idem`.
   Without the idem (another device, storage blocked): `track.base + "?o=" + id` (the lookup form asks the 4 digits).
5. Preview mode: sample id `CMD-PREVIEW`, no beacon.

### LAN-§8.4 Settings screen ("After the order" card on `/app/<h>/settings/checkout`)

Three switches (`landing.thankYou.*`), the caller phone, the confirmation WhatsApp number, calling hours, "We call within
N hours" (all `store.confirmation`, core-owned key, written through `setStoreSetting`), and the `customer_confirm`
template editor per locale with variable chips (`{order_id}` `{offer}` `{total}` `{name}`) and a live phone preview of the
thank-you hero. Without a caller phone the expectation switch explains "Add the number you call from".

### LAN-§8.5 Re-render

Thank-you HTML is static per version and bakes these numbers and templates. Saving the card, the zones fallback text, the
policies (timeline steps) or the store contacts enqueues `render_jobs` reason `store_info` (request Q8) for the store's
live pages; the job rewrites only the rendered columns in place (core D50: no prices change).

### LAN-§8.6 Acceptance

- The confirm link's decoded text contains the order id of `?o=` and nothing beyond the four variables (fixture with a
  name, a multi-item offer and a gift).
- No caller phone → no phone number anywhere on the page; a caller phone → it appears in full, in an LTR isolate.
- The intent beacon writes exactly one `customer_confirm_intent` event per order even when clicked 5 times.
- `thanks-page` cap (LAN-§5.2) holds with pixels on; thank-you HTML with all blocks off is byte-identical to today's.

---

## LAN-§9 Order tracking page (LP-05, R1)

### LAN-§9.1 Routes

| Route | File (P3) | Behaviour |
|---|---|---|
| `GET <base>/track` | `src/app/s/[store]/track/route.ts` | document with the order page's theme; `noindex`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`; `?o=&s=` valid → server-rendered status (works without JS); `?o=` alone → lookup form with the id filled; nothing → lookup form |
| `POST /api/public/track` | `src/app/api/public/track/route.ts` | JSON ops (LAN-§9.3); the store comes from the order id and must own the effective host (below) |

Store resolution for the API: the body carries `o` (order id, global unique, core D28) and the request's effective host
class (core §C.2); the handler loads `orders WHERE id = ?` through the public resolver
`resolveOrderForTracking(orderId)` (request Q11, in `src/lib/tenancy/public.ts`, annotated `// tenancy: public-key
orderId`), checks the store is servable (`pending/active/restricted`, core §A.5.3) and that the effective host is one of
`storeHosts(store)` (an order of store A looked up from store B's host answers `not_found`), then uses the returned scope
for every later query.

Signed link: `s = <exp base36>.<sig>`, `sig = base64url(hmac(orderId + "|" + exp, "track-link:" + storeId))[:22]`, `exp =
issue + 90 days`, built by `trackUrl(scope, order): string` (`src/lib/tracking/links.ts`) for the `{track_url}` variable of
operations' templates and for the `track_link` template.

### LAN-§9.2 What the shopper sees (`TrackView`)

```ts
// src/lib/tracking/contract.ts (isomorphic, P3)
export type TrackStepId = "placed" | "confirmed" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | "returned";
export interface TrackView {
  orderId: string; placedAt: string; firstName: string | null; maskedPhone: string;           // "•• •• 12 34"
  summary: { offer: string; units: string; total: string };                                     // customer-facing order text (src/lib/orders/text.ts), no address
  steps: { id: TrackStepId; at: string | null; done: boolean }[]; current: TrackStepId;
  eta: { text: string } | null;                                                                 // zoneLineFor(order city) from the confirmation date
  carrier: { name: string; url?: string } | null;                                               // R2 shipments
  canRequest: { changeAddress: boolean; cancel: boolean; other: boolean }; pending: ("change_address" | "change_phone" | "cancel" | "other")[];
  help: { whatsapp?: string; phone?: string; hours?: string }; rightsLine: string | null;      // from policies (returns window) + the legal note
}
```

Step mapping (`trackSteps(order, events)`, P3) from operations' axes (core §D.2 0005): `placed` always; `confirmed` when
`confirm_state = confirmed`; `shipped` for `ship_state ∈ {shipped, in_transit}`; `out_for_delivery`; `delivered`;
`cancelled` for `confirm_state ∈ {cancelled, fake, duplicate}` (one neutral word for the shopper); `returned` for
`ship_state ∈ {refused, returned, lost}`. Dates from the first `order_events` row of each transition; legacy orders without
axes map from `orders.status` (`contract.ts:304-314`).

Never in a response: the full phone, the address, the note, the e-mail, other orders, agent names, internal notes, risk.

### LAN-§9.3 API

```ts
export const TrackRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("lookup"), o: OrderId, last4: z.string().regex(/^\d{4}$/) }),
  z.object({ op: z.literal("proof"), o: OrderId, k: Idem }),                    // thank-you link: k = the order's idem (URL fragment)
  z.object({ op: z.literal("signed"), o: OrderId, s: SignedS }),
  z.object({ op: z.literal("request"), o: OrderId, auth: TrackAuth, kind: z.enum(["change_address", "change_phone", "cancel", "other"]), text: z.string().trim().max(300).optional() }),
  z.object({ op: z.literal("intent"), o: OrderId, k: Idem, kind: z.literal("confirm_whatsapp") }),
]);
export type TrackAuth = { k: string } | { s: string } | { last4: string };
export type TrackResponse = { ok: true; view?: TrackView } | { ok: false; error: "not_found" | "rate_limited" | "invalid" | "closed" };
```

- Buckets (core §E.8): `p:track:ip:<h>` 30/10 min, `s:<sid>:track:ip:<h>` 10/10 min, plus `s:<sid>:track:o:<hash(o)>`
  10 failed lookups per day (then only the signed and proof links work for that order).
- Unknown order, wrong digits, wrong proof, another store's order, an order of a non-servable store: the same
  `{ ok: false, error: "not_found" }`, same status (404), every answer padded to ≥ 150 ms.
- `last4` compares the last 4 digits of the E.164 phone in constant time. `k` compares `orders.idem` in constant time.
- **Requests** (when `landing.tracking.requests`): allowed while `confirm_state ∉ {cancelled, fake, duplicate}` and
  `ship_state ∈ {none, to_pack}`; one pending request per kind; writes `appendOrderEvent(scope, orderId, { actorKind:
  "customer", type: "customer_request", meta: { kind, text } })` (operations API frozen at P0, request Q17) and notifies
  roles owner/admin/manager plus the assigned agent (kind `order.customer_request`). The order itself never changes (LD9).
  After shipping → `closed`.
- **Intent** (thank-you confirm): writes `customer_confirm_intent` once per order (dedupe on the event type).

### LAN-§9.4 Screen

One column (max 560 px), store logo and name, the order card (id chip in an LTR isolate, placed date, offer, total), a
vertical timeline (done steps in the accent, the current one with its date, future ones muted), the ETA line, the carrier
link (R2), then actions: "Changer mon adresse", "Annuler ma commande", "Autre demande" (each opens a sheet with an optional
text and a clear "La boutique vous contactera"), "Écrire à la boutique sur WhatsApp" (prefilled "Bonjour, ma commande
{order_id} : …"), the rights line and the legal links. States: lookup form, skeleton, view, request sent, closed (no
actions), not found, rate limited, noscript (signed links still render; the lookup asks for JS and shows the WhatsApp
link). Theme: the ThemeSpec of the order's version (the shopper sees the look she ordered from); the lookup form uses the
store's home page theme, else the brand defaults (design.md, transactional register). RTL complete; numbers and ids in LTR
isolates; 360 px clean.

### LAN-§9.5 Acceptance and tests

- `test:tracking` (new, DB-backed, `scripts/qa/tracking-check.ts`): the five failure classes give byte-identical bodies
  and statuses; the 11th wrong lookup of one order in a day is refused while the signed link still works; a request on a
  shipped order answers `closed`; a request writes one event and one notification; `TrackView` of every fixture has no
  phone digits beyond the last 4 and no address.
- `test:tenancy`: store B's host can't read store A's order by any proof; the signed link of A's order with B's handle
  answers 404.
- `qa:headers`: `/track` carries `noindex`, `private, no-store`, `no-referrer`.

---

## LAN-§10 Abandoned-lead recovery (LP-06, R1)

### LAN-§10.1 Capture and consent

The runtime beacon is unchanged (`src/landing/runtime/lead.ts:1-40`). Capture is decided at render (LD11):
`leadCapture(store.market, landing.leads.capture)` → `on` for MA and INTL by default, **off** for the EU markets (FR, BE,
ES, DE, IT, NL, PT) with no override until the EU pack (ST-21) adds consent; off = `endpoints.lead` omitted from the runtime
config (`src/lib/render/config.ts:282`). The Leads screen says so in those markets.

### LAN-§10.2 Server (`src/lib/orders/leads.ts`, P3)

`upsertLead(payload, ctx)` keeps today's rules (valid phone, one row per idem, never after an order with that idem, the
"own page" update guard) and adds: `store_id` from the target; `sel` (the tolerant `leadSelection()` of
`contract.ts:270-282` plus `bundleId` and `ver`); `version_id`; `total_cents` = `orderTotals` of the resolved selection on
the version seen, or NULL when the selection does not resolve; `is_test` when the session is a test session (LAN-§14);
`kind = 'form'`. The `selection` text (`lead-text.ts`) stays the warehouse text shown in lists.

### LAN-§10.3 The inbox (`/app/<h>/leads`, `leads.read`; ar/fr/en in R1, LD26)

- **Header** (last 30 days = the retention window): Leads · Contacted · Recovered (n and % of contacted) · Converted
  without contact. Real counts only; a % is hidden below n = 20 ("needs more leads").
- **Views:** New · Follow-up due · Contacted · Recovered · Lost · All, plus filters page, city, assignee, kind
  (form / WhatsApp), period; saved views through operations' `saved_views` (surface `leads`).
- **Row:** status pill, kind icon (WhatsApp intents show the `WA-` ref), masked phone (`06 •• •• 12 34`), name, city,
  page, selection text, server total, "12 min" since capture, attempts, assignee avatar. Agents see the leads assigned to
  them plus "Take next" (the oldest unassigned `new` lead, claimed by `UPDATE … WHERE assignee_id IS NULL`).
- **Actions:** WhatsApp (opens `wa.me` with the `lead_recovery` template in the lead's page locale, logs an attempt,
  reveals the phone: audit `lead.phone_revealed`, the OP-07 rule), Call (`tel:`, same logging), **Convert to order**
  (operations' manual-order sheet, OP-08, prefilled with `sel`, name, phone, city; the server re-prices on the published
  version or the lead's version within 72 h, OFFERS D8), Mark lost (reason), Assign (managers), Next follow-up.
- **Bulk:** assign, mark lost, export CSV (`orders.export`, sensitive, audited).
- Empty: "No abandoned forms in the last 30 days." EU: "Abandoned-form capture is off in your market until consent tools
  arrive." Skeleton rows mirror the table; phone width: cards with the two main actions.

### LAN-§10.4 Statuses and attribution

`new` → `contacted` (first attempt) → `recovered` (an order after a contact attempt, or an agent conversion) | `lost`
(agent, with a reason) | `converted` (an order without any attempt). The landing order hook on order creation:
1. `UPDATE leads SET status='converted', converted_order_id=?, converted_via='idem' WHERE store_id=? AND idem=? AND converted_order_id IS NULL`;
2. else the newest unconverted lead of the same store and phone in the last 7 days: `recovered` if `attempts > 0`, else
   `converted`, `converted_via='phone'`; a test order matches only a test lead and vice versa;
3. notification `lead.recovered` to the assignee when it became `recovered`.

Follow-ups: after an attempt, `next_at = contacted_at + followUpHours[attempts - 1]` (defaults 2 h, 24 h); job
`leads.followups` (hourly) sends assignees one in-app digest "5 leads to follow up". No message to the shopper is ever sent
by the platform (LD10).

### LAN-§10.5 Server actions (`src/app/app/[store]/leads/actions.ts`, every body `return storeAction(…)`)

```ts
listLeads(q: LeadQuery): Promise<{ rows: LeadRow[]; next?: string; counts: LeadCounts }>                    // leads.read (agents: own + unassigned new)
logLeadAttempt(leadId: string, channel: "whatsapp" | "call"): Promise<{ href: string }>                     // leads.write + orders.reveal_phone
assignLeads(ids: string[], userId: string | null): Promise<void>                                            // orders.assign
takeNextLead(): Promise<LeadRow | null>                                                                       // leads.write
markLeadLost(leadId: string, reason: LostReason): Promise<void>                                             // leads.write
setLeadFollowUp(leadId: string, at: string | null): Promise<void>                                           // leads.write
convertLead(leadId: string, input: ManualOrderInput): Promise<{ orderId: string }>                          // orders.create; calls operations' createManualOrder (request Q17)
// CSV: GET /api/app/<h>/leads/export (storeGuard, orders.export)
```

### LAN-§10.6 Acceptance

- A lead appears in the inbox ≤ 2 s after its beacon (one pulse at most when the screen is open, core D46).
- The LD12 fixture set (idem match, phone match with and without attempts, outside 7 days, test vs normal) gives the
  expected status on 100 % of cases.
- An EU-market page has no `endpoints.lead`; an MA page has it.
- An agent can't list, reveal or convert another agent's lead (`test:tenancy` role matrix, `qa:action-replay`).
- Leads older than 30 days are purged by the housekeeping job (core §H.2) per store.

---

## LAN-§11 Order on WhatsApp (LP-11, raised to R1, P3 wave 2)

### LAN-§11.1 Where it lives

The order form already offers a WhatsApp alternative (`form.whatsapp`, an `<a class="lp-of__wa">` that opens `wa.me` with
the product name, `src/landing/sections/orderForm/parts.tsx:407-416`). On live pages of a store with
`landing.waOrder.enabled`, that link gets `data-lp-wa-order` and `assist` upgrades it to a priced order intent. Without
JS, in exports, or with the setting off, today's link stays exactly as it is.

### LAN-§11.2 Flow

1. Click → `assist` prevents the default, serialises the current choice (LAN-§11.3) and posts `POST /api/public/wa`
   (4 s timeout, one intent per page view per 30 s).
2. `{ ok: true, ref, number, text }` → open `https://wa.me/<number>?text=<text>` (new tab; same-tab navigation inside
   in-app browsers, the rule of `entry-whatsapp.ts`), and show under the link "Votre message est prêt dans WhatsApp ·
   Réf. WA-7K3Q9X" / "الرسالة واجدة فواتساب · المرجع WA-7K3Q9X" / "Your message is ready in WhatsApp · Ref. WA-7K3Q9X".
3. Any error or timeout → open today's plain link (the shopper is never stuck).

### LAN-§11.3 Selection serialiser (`src/landing/runtime/addons/select.ts`, pure over a form element)

Reads the checked `input[name="bundle"]` and every named control matching `CONTROL_NAME_RE` (`contract.ts:137-143`):
`u.<k>.@item` → `units[k].item`; `u.<k>.<gid>` → `units[k].o[gid]`; linked matrix dims `u.<k>.<gid>.<dim>` → joined as
`"dim=value|dim=value"`; shared groups `s.<item>.<gid>` → copied into every unit of that item (from `cfg.bundles[i].units`);
`x.<gid>` → `extras`; `b.<gid>[.<dim>]` → `b`; typed fields into `f`. Unknown or malformed names are dropped. Output is
bounded like `UnitIn` (≤ 20 units, ≤ 8 options, ≤ 4 fields). It never reads the name, phone or address fields.

### LAN-§11.4 Server (`src/app/api/public/wa/route.ts` + `src/lib/wa-order/**`, P3; route request Q12)

```ts
// src/lib/wa-order/contract.ts (isomorphic)
export const WaOrderRequest = z.object({
  pageKey: PageKey, ver: z.string().regex(VERSION_RE).optional().catch(undefined),
  bundleId: BundleId.optional(), bump: z.boolean().optional(),
  units: z.array(z.unknown()).max(20).optional().catch(undefined), extras: z.record(z.string(), z.unknown()).optional().catch(undefined),
  b: z.unknown().optional(), utm: Utm.default({}), locale: z.string().max(5).optional(),
});
export type WaOrderResponse = { ok: true; ref: string; number: string; text: string } | { ok: false; error: "unavailable" | "rate_limited" | "invalid" };
```

1. `burstLimit` + buckets `p:wa:ip:<h>` 30/10 min and `s:<sid>:wa:ip:<h>` 10/10 min; `resolvePublicTarget(pageKey)`;
   `take_orders` false (pending, restricted…) → `unavailable`.
2. Version: `orderVersion(target, { ver })` (the 72 h rule of OFFERS D8).
3. Price with `priceWaSelection(doc, sel)` (`src/lib/wa-order/price.ts`): `resolveSelection` + `orderTotals`
   (`src/lib/orders/validate.ts`, `src/lib/page/pricing.ts`) on the tolerant selection; when it doesn't resolve, the
   offer's default selection is priced (its real "from" total) and the unresolved groups are named "to confirm". The
   delivery line is the page's real fee for that offer (LD4). No price ever comes from the request.
4. Insert a `leads` row: `kind='whatsapp'`, `phone` NULL, `ref` (`WA-` + 6 Crockford chars, unique per store, 3 retries),
   server uuid `idem`, `sel`, `total_cents`, `version_id`, `utm`, `is_test` (test session, LAN-§14), `status='new'`.
5. Text: the `wa_order` template when the owner customised it (vars `{offer}` `{units}` `{total}` `{delivery}` `{ref}`
   `{options_to_confirm}` `{product}`), else `composeWaMessage` (`src/lib/export/whatsapp.ts:344`, the composer exports
   use) without the customer block; ≤ 1,000 chars; number = `doc.form.whatsapp.number`, else `store.whatsapp`.

### LAN-§11.5 In the admin

Intents appear in the Leads inbox (kind WhatsApp, the ref in the row, phone empty). ⌘K resolves a typed `WA-…` ref to the
lead (search provider, request Q18). **Convert** opens the manual-order sheet (OP-08) prefilled with the selection; the
agent pastes name, phone, city and address from the chat; the order has `source = 'whatsapp'` (core D42) and re-prices on
the server. The inbox header counts intents and their conversion rate (n ≥ 20). No browser Lead/Purchase pixel fires for
an intent (the frozen pixel chunk doesn't see it); the server Purchase follows the store's trigger on conversion
(operations' `conversions` setting).

### LAN-§11.6 Acceptance

- The total in the text equals `orderTotals` for the same resolved selection on the `duo`, `tshirt` and `colors`
  fixtures (100 %); an incomplete selection names each unresolved group and prices the offer's real "from" total.
- The request schema has no price field; a tampered body can't change the text's total.
- The fallback link opens when the API fails or exceeds 4 s; `wa.me` URLs stay ≤ 2,000 chars.
- 50 parallel intents in one store yield 50 distinct refs; a ref of store A is not found from store B's ⌘K.

---

## LAN-§12 Short links with UTM presets (LP-12, raised to R1, P3 wave 2)

### LAN-§12.1 Route `GET <base>/go/<code>` (`src/app/s/[store]/go/[code]/route.ts`, P3; request Q6)

- Lookup `short_links WHERE store_id = ? AND code = ?` (scopedCache `links`, 60 s, invalidated on edit).
- `active` → **302** to `storePath(store, target)` with the query below, `Cache-Control: private, no-store` (a 308 would
  be cached forever by browsers and break retargeting). `paused` → **410** with the store's neutral "This link is no
  longer active" page and a link to the store home. Unknown → the store's 404. The target must be a live page of the
  store (else the store's 404).
- **Query rule:** `incoming` = the raw query string as received; if it contains any key starting with `utm_` (ASCII
  case-insensitive), the result is `incoming` unchanged; otherwise `presets` (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`, only set ones, percent-encoded) followed by `&` + `incoming` when present.
  Click ids (`fbclid`, `ttclid`, `gclid`, `ScCid`) pass byte for byte (the core V7 rule).
- Clicks: an in-memory per-store counter flushed every 30 s and at the end of each tick (`links.flush` job) with
  `UPDATE short_links SET clicks = clicks + ?, last_click_at = ? WHERE store_id = ? AND id = ?`; the counter Map is
  registered in `scripts/qa/tenancy-allow.json` (lint L4, request Q23). Counts are labelled "clicks" (not visitors).

### LAN-§12.2 Screen `/app/<h>/links` (`pages.read`; edit `pages.write`)

Table: code, target page, channel, UTM, clicks, last click, status; row actions copy, QR (`qrcode`, already installed,
`package.json:65`; SVG, ink ≥ 7:1, design.md DES-§16.12 styling), pause/resume, edit target. Create sheet: target page,
channel preset (fills `utm_source`/`utm_medium`, e.g. Meta → `facebook` / `paid_social`), campaign (`utm_campaign`),
content (`utm_content`, e.g. the kit angle), code (6 random chars or a custom 3-16 `[a-z0-9-]`). Limit 500 links per store.
The Campaign Kit creates its links through the same service (`src/lib/links/**`).

### LAN-§12.3 Acceptance

`/go/x?fbclid=AbC%2F1&x=1` reaches `/<slug>?utm_source=…&fbclid=AbC%2F1&x=1` with the incoming part byte-identical;
`/go/x?utm_source=mine` keeps only `utm_source=mine`; paused → 410; A's code on B's host → 404; 10,000 hits → clicks within
1 % after the flush; no `Set-Cookie`, no caching headers other than `private, no-store`.

---

## LAN-§13 Campaign Kit (LP-18 = rf SF-01, R1, P3 wave 2)

### LAN-§13.1 Entry and lifecycle

Create → "Campaign" (from a page), the page row menu "Make a campaign", or the end of onboarding. Inputs: the page, the
channels (Meta, TikTok, Snap, WhatsApp broadcast, Instagram organic, print), a name (→ `slug`, the `utm_campaign` value).
Status `draft → live → paused → ended`; `live` requires the page to be published; pausing pauses the kit's short links
(410); ending keeps the record for results.

### LAN-§13.2 Content (`CampaignKit`, stored in `campaigns.kit`)

```ts
type Loc = "ar" | "fr" | "en";
export interface CampaignKit {
  v: 1; compiledAt: string; locales: Loc[];
  facts: { product: string; offers: { label: string; price: string }[]; fee: string | null; eta: Record<Loc, string> | null };   // display copies of real page data
  links: { channel: CampaignChannel; shortLinkId: string; url: string; utm: ShortLinkUtm }[];
  whatsappConfirm: Record<Loc, string>;              // operations' order-confirmation template (IN-05), variables kept as {placeholders}
  script: { steps: { id: string; text: Record<Loc, string> }[] };   // OP-05 template: greet, product/pack/total as stored, address + landmark, ETA day, upsell line, close
  brief: AdBrief;
  pixelPlan: { pixels: string[]; trigger: "order" | "confirmed" | "delivered"; events: { name: string; where: string }[]; testHint: boolean };
}
export interface AdBrief {
  angles: { id: string; tag: string /* DG-07 structure tag */; name: string; hook: Record<Loc, string>; primary: Record<Loc, string>; headline: Record<Loc, string>; visual: string; ugc15: string[] }[];
  doNotSay: string[]; compliance: string[]; source: "library" | "cloud"; promptVersion?: string;
}
```

### LAN-§13.3 Compile (`src/lib/campaigns/compile.ts`, pure over its inputs, < 300 ms)

Inputs: the page doc (name, benefits and their structure tags from the copy library, DG-07, design.md DES-§9; offers;
upsell; guarantee), `policies`, the zones (general range text), the pixel library and the store's Purchase trigger
(operations' `conversions` setting), operations' templates. Rules:
- **Facts only:** every number in the kit is a price, an offer, the page fee or an ETA range from these inputs; the
  brief passes the same `allowedNumbers` guard as AI output (ai.md AI-§D.2 rule 5).
- **Three angles with three different structure tags** present on the page; hooks ≤ 12 words from the copy-library
  family lines; `visual` from the page's image-treatment gene (design.md genome) as a sentence; a 6-beat 15 s UGC sheet.
- **`doNotSay`** lists every claim the store did not make: medical claims always; "free delivery" unless the page fee is 0;
  ratings or review counts; a deadline unless the page has a real countdown end; returns or inspection unless `policies`
  allow; any number not in `facts`.
- **Cloud brief** (Cloud AI on, `ai.use`): task `ad.brief` streams over the template per field and falls back per field
  (request Q20 asks ai.md to register the task in R1 behind the flag; otherwise it stays template-only until AI-20, R3).
- `offersHash` = the pricing fingerprint (LAN-§18.4) of the compiled version; a later publish with another fingerprint
  shows "The page changed since this kit was made" with "Recompile".

### LAN-§13.4 Screens

`/app/<h>/campaigns` (list: name, page, status, links clicks, orders 28 days) and `/app/<h>/campaigns/<id>`: header (name,
status, page thumbnail, the "changed since" banner), then copyable cards in this order: Links (per channel: URL, copy, QR),
WhatsApp confirmation (locale tabs), Call script, Ad brief (one card per angle, ar/fr tabs, "copy all"), Pixel plan (what
fires where, the trigger, a test-code reminder when a pixel has a test window), Delivery text. A results strip shows per
link and per `utm_content` angle: clicks, orders, confirmed, delivered over 28 days (orders filtered by `utm.campaign =
slug`; rates hidden below n = 20; test orders excluded). "Share read-only" creates a token and shows the link once.

### LAN-§13.5 Share page `GET /kit/<token>` (platform host; request Q12)

`resolveKitShare(token)` (public-key resolver, request Q11) → the kit read-only with the store name and the page
thumbnail; no customer data exists in a kit; `noindex`, `private, no-store`, `Referrer-Policy: no-referrer`; revoked or
unknown → neutral 404; bucket `p:kit:ip:<h>` 60/10 min.

### LAN-§13.6 Acceptance

A kit compiles with Cloud AI off; over the 60 AI eval fixtures (ai.md AI-07) every brief has 0 invented numbers, 0 banned
words and 3 distinct structure tags (`test:kit`, `scripts/qa/kit-check.ts`, in `npm test`); a republish with new prices
shows the banner; revoking the share → 404; pausing → the kit's links answer 410.

---

## LAN-§14 Test-order links (LP-19 = rf SF-05, R1, P3 wave 2)

### LAN-§14.1 Mint

`testOrderUrl(ctx, pageId): Promise<string>` (`pages.publish`; `src/lib/testing/links.ts`): token `t1.<exp base36>.<sig>`,
`sig = base64url(hmac(pageId + "|" + exp, "test-order:" + storeId))[:22]`, `exp = now + 24 h`; URL
`storeUrl(store, "/<slug>") + "?utm_source=sg-test&utm_medium=test&utm_content=" + token` (≤ 200 chars, the
`utm_content` maximum, `contract.ts:20`). Audit `page.test_link_created`. Shown in the publish dialog's success state and
offered to platform.md's address card.

### LAN-§14.2 Serving (store landing and thank-you routes, T3 files, request Q21)

When `utm_source=sg-test` and the token verifies for this page: `renderTestDocument(scope, page, token)`
(`src/lib/testing/render.server.ts`, P3) renders the **published** version on request with no pixels (`cfg.pixels = {}`,
so no pixel chunk), `thankYouUrl = <thank-you path>?utm_source=sg-test&utm_content=<token>` (the runtime appends
`&o=<id>`, `form.ts:304-306`), `noindex`, `Cache-Control: private, no-store`, and the add-on banner "Commande test : non
comptée" (`RenderAddons.banner = "test"`, request Q3). The thank-you route does the same. Bucket `s:<sid>:test-render`
60/h; an invalid, expired or over-limit token gets the normal cached page (and a normal order).

### LAN-§14.3 Marking and exclusions

The order create path calls `isTestSession(scope, payload.utm, pageId)` (P3, pure + HMAC; request Q21 for the call in
`src/lib/orders/create.ts`): true → `orders.is_test = 1`, flag `test`, no CAPI enqueue, `sheet_status = 'disabled'`, no
`bumpOrderStats`. Leads and WhatsApp intents of the session get `is_test`. Every reader that aggregates orders skips
`is_test` (request Q21 names them: Sheets push and CAPI (P5), Telegram sends with a "[TEST]" prefix (P5), stats and
`stats_version_daily` (T3, ai), agent KPIs and customer counters (P4), finance (R2), learning tables (ai),
`store_daily_rollup` (platform)). The queue shows a TEST chip (operations.md).

### LAN-§14.4 Acceptance

A test order never reaches Sheets, CAPI, `stats_daily`, `stats_version_daily`, `agent_stats_daily`, `customers` counters or
`ai_feedback`; the test page and its thank-you contain no pixel script (render assertion); an unsigned `utm_source=sg-test`
visit is a normal visit; the dashboard revenue stays 0 after a test order (the rf §4 demo check 5).

---

## LAN-§15 Page addressing and vitals

### LAN-§15.1 Slug history (LP-20, R1)

- When a page that was ever published changes slug, `recordSlugMove(scope, pageId, oldSlug)` (P3,
  `src/lib/landing/slugs.ts`; called from the slug-move action, request Q22) upserts `page_slug_history (store_id,
  old slug, page_id, until = now + 12 months)`.
- The store slug route, before answering 404 for `<slug>` or `<slug>/merci`, looks up the history: a row whose page is
  still published → **308** to `storePath(store, "/<new slug>[/merci]")` with the raw query; otherwise the 404. Hits are
  counted like link clicks.
- Taking an old slug for another page asks "This old address of «X» will open this page from now on" and deletes the row.
  Rows expire at `until` (housekeeping). History never crosses stores (the primary key starts with `store_id`).

Acceptance: an old slug 308s with a byte-identical query; a reused slug serves the new page; store B's identical slug never
redirects to store A.

### LAN-§15.2 Page vitals in the pages list (LP-22, R1)

Each row of `/app/<h>/pages` shows, for the last 7 store days: a views sparkline (≥ 7 points, else none), views, orders,
conversion (orders / uniques) and confirmation rate (confirmed / orders, operations' `confirm_state`). One grouped query per
metric over `stats_daily (store_id, page_id, day)` and `orders (store_id, page_id, created_at)` (core indexes),
`getPageVitals(scope, pageIds, days)` in `src/lib/landing/vitals.ts`, cached 60 s per store; test orders excluded; rates
hidden below n = 20 ("needs more visits"). Sort by orders or conversion. Acceptance: numbers equal the SQL fixture; a
store's vitals never include another store's rows.

---

## LAN-§16 Exports per store (website ZIP, connected, PHP, WhatsApp)

The export code moves to store scope in R1.0 (T4: EXP-01…07); this section is the landing contract for it.

| Mode | Gate | What the export holds | Orders go to | Add-ons (LD28) |
|---|---|---|---|---|
| Website ZIP (static) | `export.create`, `exports_month` (0 while pending, core §A.5.2) | the chosen version of a page of this store, its assets (`assertOwned`), the store identity (name, contacts, legal facts), README with the platform brand (EXP-07) | nowhere (display only) | delivery line, thank-you confirm + expectation |
| Connected | as above + an https platform origin | as above; `exports.public_key` (global, core D28) resolves the store (EXP-06); allowed origins per export, never `*.<root>` (core §C.9) | the platform's `/api/public/order` for this store only | + tracking link (absolute `storeUrl(store, "/track")`) |
| PHP | as above + `php_export` feature | `order.php` (frozen) + `config.php` with this store's sheet id and, optionally, the store's own `export_key` (EXP-03; the platform key is never embedded); Telegram fields left **empty** for the owner to type (no secret leaves the platform without the owner typing it) | the owner's server | delivery line, thank-you confirm + expectation |
| WhatsApp | `export.create` | the static bridge (`entry-whatsapp.ts`) with the number typed in the dialog or the store's | `wa.me` | delivery line, thank-you confirm + expectation |

- Buckets `s:<sid>:export:*` (EXP-05); export rows carry `store_id` (EXP-04); revoke by id is scoped.
- Exports never charge zone fees (LD4, LD25); the PHP export stays at its current contract until LP-16's template v3.
- Acceptance: `test:php` unchanged; an export of store A's page by a member of B answers `not_found`; an A export ZIP holds
  only A's asset ids; a connected export posting another store's export key is refused; the static ZIP has no tracking link,
  the connected one has the absolute link.

---

## LAN-§17 Attached landings, theme mode, copy to another store (R2, track S1)

### LAN-§17.1 Model (LP-07)

`pages.product_id` (core §D.2, 0004, NULL until R2) points at a `products` row of the same store (`assertOwned`). The
page stays a **valid PageDoc v2** (frozen): at attach time and at every publish the product's `{ items }` (Offers v2
shapes, `products.doc`, core §D.6) are **materialised** into the doc by `materializeAttached(doc, product): PageDoc`
(`src/lib/landing/attach.ts`, pure). Mirrored, read-only on an attached page: each item's id, name, short, price,
compare-at, SKU, option groups and their deltas and codes, and sold-out states from `inventory_levels` (`on_hand - held
<= 0`). The page's own: the story (`doc.product`: copy, photos; may also inherit the product's), sections, theme, SEO,
pixels answer and **offers** (built only from the product's items in R2; packs across several products are LP-17 later).

### LAN-§17.2 Flows

- **Create from a product** (Create → Landing page → From a product, or the product page's "Landing pages" tab): the
  wizard skips Photos and Details (the product is known), opens Offers prefilled from the product's offers or presets
  (`src/lib/page/offer-presets.ts`), then Directions (design.md) with theme mode `store` preselected.
- **Attach an existing page:** page settings → "Attach to a product": the sheet maps each page item to a product item or
  replaces the items with the product's; offers whose lines lose their item are listed and dropped only after confirmation.
- **Detach:** the current mirrored values become the page's own; `product_id` cleared; audit `page.detached`.

### LAN-§17.3 Prices and overrides (LD21)

| Case | Rule | UI |
|---|---|---|
| Item price | always the product's | locked field + chip "From product «Crème jour» · Edit product" |
| Offer price = Σ units × product price | normal | no chip |
| Offer price ≠ that reference | allowed (a campaign pack price) | chip **"Override"**: "Product price 2 × 249 = 498 DH · this pack 449 DH (−49 DH)" |
| 1-unit offer below the product price | allowed with a warning | "Shoppers who also see the product page see two prices for one unit" |
| Offer compare-at | only the computed reference, or the product compare-at × units | any other value → checklist error `attach.compare_not_real` |
| Savings and "per unit" display | from the reference (real) | unchanged display axes |

EU markets (ST-21): the 30-day lowest price uses the product's price history (storefront.md).

### LAN-§17.4 Product changes republish (LD20; request Q24)

The storefront's product save (S1) calls `onProductChanged(scope, productId, change)` with `change ∈ { prices, options,
stock_transition, content }` (stock only on in/out-of-stock transitions, never on every decrement). For each live attached
page it enqueues `render_jobs` reason `product` whose handler is `republishAttached(scope, pageId)`
(`src/lib/landing/attach.server.ts`): materialise the new mirror into a copy of the **published** version's doc, validate,
render, commit a new `page_versions` row kind `sync` ("Synced with product «X»") and make it live; the draft gets the same
mirror (mirrored fields are read-only, so no edit conflicts). Open tabs keep the price they show for 72 h (OFFERS D8). A
sync that fails validation (an offer references an item that left the product) keeps the old version live, marks the page
"Out of sync" and notifies (`landing.sync_failed`). `sync` versions count toward `versions_kept_per_page` and are pruned
first. `content` changes (product name, photos) re-render in place only for inherit-story pages (D50, no prices).

### LAN-§17.5 SEO, pixels, stock

- Attached pages default to `doc.seo.noindex = true` and canonical = the PDP URL (`storeUrl(store, "/p/<slug>")`, core §C.8,
  R-D49); per page the owner can make the landing indexable (`landing.attach.noindexDefault` sets the default). A
  `noindex` attached page emits no Product JSON-LD (no duplicate product in search).
- Pixel content ids of attached pages use the catalog ids so landing, PDP and cart events match one ad catalog (LND-11;
  request Q25 with storefront.md: the render config's `product.contentId` / item content ids come from the product).
- Sold-out options show exactly as on the PDP (mirror); the order path checks stock through storefront's soft holds
  (ST-15, R3).

### LAN-§17.6 Theme mode (LP-08)

`pages.theme_mode` (0006): `store` = inherit the store's Brand Genome and theme (design.md DS15, DES-§11); `campaign` =
own page genes within the brand radius (d_brand ≤ 0.35, warning above). Defaults: attached pages `store`; other landing
pages in `both` mode `campaign`; landing-mode stores keep `NULL` (today's per-page theme with brand locks). A brand or theme
change re-renders `store` pages in place (render reasons `brand` / `theme`, core D50: no price changes). Acceptance: an
inherit page's CSS tokens equal the store theme's after a brand change and one cron tick; a campaign page is untouched.

### LAN-§17.7 Copy a page to another store (LP-23)

`copyPageToStore(ctx, pageId, targetHandle)` (`pages.write` in **both** stores, checked through two `requireStoreMember`
calls; `src/lib/landing/copy.server.ts`): loads the source draft in scope A; re-ingests every referenced asset into store B
(bytes copied, new per-store ids, core D21; `media_bytes` charged in B, refused with the limit sheet when over); rewrites
the refs; resets store-specific parts (pixels answer → "No pixel" in B, `product_id` → NULL, experiments none, slug made
unique in B); creates a draft in B; audits `page.copied_out` in A and `page.copied_in` in B. Large media sets continue in a
job (`pages.copy`, ≤ 10 s per tick). Acceptance: the copy references only B's asset ids (`assertOwned` passes in B, fails in
A); a user with `pages.write` in only one store gets `not_found`.

---

## LAN-§18 Experiments engine, shared by landing and store pages (LP-09, R3, track D3)

### LAN-§18.1 Scope and gates

Entitlement `experiments` (core §A.4; `beta` false, `pro` true); permission `experiments.manage` (request Q29; owner,
admin, editor); results readable with `pages.read`. One running experiment per page; ≤ 3 arms including the control `a`.
Store pages (`surface = 'store_page'`) use the same engine; storefront.md lists which page kinds and sections may host
arms and renders them through its on-request renderer with the same wrapper, CSS and head script (cache key + weights
version).

### LAN-§18.2 Arm kinds

| Kind | Split | What differs | How it stays cacheable |
|---|---|---|---|
| `headline` | in-page | the hero headline and subline text | every arm in the HTML |
| `hero` | in-page | the hero section's variant, media or data (never the form) | every arm in the HTML |
| `section` | in-page | one non-form section's variant or data | every arm in the HTML |
| `offer_display` | URL | `offers.display` axes only (picker, fill, selection) | one published version per arm at `?xv=<arm>` |
| `version` | URL | any doc difference except pricing | one published version per arm at `?xv=<arm>` |

Guards (all server-side, at start and at every publish of an arm): `pricingFingerprint(arm) === pricingFingerprint(control)`
(else `exp.price_differs`); every arm passes the checklist errors, the design gates (design.md DES-§8) and the honesty gates
(LAN-§6); a publish of the page while running **stops** the experiment (results kept, "stopped by a publish") so the
conditions stay fixed; unpublishing ends it.

### LAN-§18.3 Arm payload

```ts
// src/lib/experiments/types.ts
export type ArmPayload =
  | { kind: "headline"; sectionId: string; text: { headline: string; sub?: string } }         // text through the AI guard when AI-suggested
  | { kind: "hero" | "section"; sectionId: string; variant?: string; data?: unknown }          // validated by the section's schema
  | { kind: "offer_display"; display: OfferDisplay }                                          // src/lib/page/schema.ts OfferDisplay
  | { kind: "version"; note?: string };
```

### LAN-§18.4 Pricing fingerprint (`src/lib/experiments/fingerprint.ts`, pure; also the kit's `offersHash`)

`sha256(canonicalJson({ currency, items: [id, price, compareAt, sku, groups (option ids, deltas, soldOut)], bundles: [id,
price, lines (qty, item / choices, free), freeShipping, soldOut], shippingFee, extras (option deltas), orderBump (price,
item), upsell (price, item, windowMinutes) }))[:16]`. Display axes, copy, media and theme are outside it.

### LAN-§18.5 Assignment, rendering, exposure

- **In-page arms** (renderer support, request Q38): the renderer wraps each arm's section in `<div class="lp-xa"
  data-xa="<e>.<arm>">` (`e` = a 6-char experiment code); element ids inside non-control arms get the suffix `-x<arm>`. Generated CSS (registered with the
  blend guard rule, no colour): `.lp-xa{display:none}`, `html:not([data-x-<e>]) .lp-xa[data-xa="<e>.a"]{display:contents}`,
  `html[data-x-<e>="<arm>"] .lp-xa[data-xa="<e>.<arm>"]{display:contents}`. Without JS the control shows.
- **`exp-head`** (inline in `<head>`, ≤ 450 B, hashed by the document CSP): reads `lp:<h>:x:<e>` from localStorage; if
  absent picks an arm with `crypto.getRandomValues` against the weights written into the script at render, stores it, and
  sets `data-x-<e>` on `<html>` before the body is parsed (no flicker). It also creates the visitor id with the core's key
  and format when missing (`lp-vid` / `lp:<h>:vid`, `randomId(22)`, `src/landing/runtime/tracking.ts:81-87`) so exposures
  and the core's beacons share one id. Storage blocked → control.
- **URL arms:** each arm is a published version row (`experiment_arms.version_id`, not the page's live version); the store
  route serves `/<slug>?xv=<arm>` with that arm's HTML while the experiment runs (Cloudflare and the render cache key on the
  full URL), canonical = the control URL; traffic is split by ads (the kit makes one short link per arm). Organic visitors
  see the control.
- **`exp`** (end of body, ≤ 1,200 B): one exposure per visitor and experiment (`POST /api/public/exp { pageKey, e, a, vid }`,
  sendBeacon), and on `lp:order` `{ pageKey, e, a, vid, idem }`.
- **Server** `/api/public/exp` (request Q12; buckets `p:exp:ip` 120/10 min, `s:<sid>:exp:ip` 60/10 min): checks the running
  experiment of that page and arm key; `INSERT IGNORE` the exposure (`vid` HMAC-hashed per store); with `idem`, stores it and
  runs `UPDATE orders SET variant_key = '<experimentId>:<arm>' WHERE store_id = ? AND idem = ? AND variant_key IS NULL`; the
  landing order hook does the reverse lookup at order creation, so either arrival order works. Uniques per arm also reach
  `stats_version_daily` through ai's `bumpVersionStats` with a variant key (request Q26).

### LAN-§18.6 Statistics (`src/lib/experiments/stats.ts`, pure; rf §1.8 refines R-D47)

- `n` = exposures per arm; conversions per the metric: orders, confirmed orders or delivered orders with that
  `variant_key` (test orders excluded); `delivered_per_unique` is re-scored as carrier statuses arrive.
- **Fair test:** mSPRT, `Λ = sqrt(V/(V+τ²)) · exp(τ²(p̂_B − p̂_A)² / (2V(V+τ²)))`, `V = p̄(1−p̄)(1/n_A + 1/n_B)`, `τ = 0.1`
  **[to tune on the DG-09 traffic corpus]**, always-valid `p = min(1, 1/Λ)`; **decided** when `p < 0.05` (Bonferroni α/2 with
  3 arms, each arm vs control) and every arm has ≥ `minSample` (100) uniques. Shown: "Chance B beats A" (Beta(1+x, 1+n−x),
  20,000 draws seeded by the experiment id), the always-valid p, uniques, conversions, and "about N more visitors per version
  at today's rate" until decided. No "winner" badge before the stop rule.
- **Auto-optimize:** job `experiments.weights` (daily 04:00 store time): Thompson weights from the posteriors (10,000
  draws), floor 10 % per arm, at most ±25 points per day; writes `weight_bp`, `weights_at`, and enqueues `render_jobs`
  reason `experiment` for the page (LD23). Auto mode never declares a winner ("currently favouring B"); it applies only to
  in-page arms.
- Auto-end at `horizon` (28 days): status `ended`, decision frozen. **Apply a version:** the owner turns an arm into a
  draft (in-page: patch the section; URL: copy the arm version) and publishes it himself.
- Priors never pool across stores (rf §1.8).

### LAN-§18.7 Screens

`/app/<h>/experiments` (list: page, kind, mode, status, days left, leader) and `/app/<h>/pages/<id>/experiments/<eid>`:
setup sheet (kind, arms edited with the builder's inspector for the chosen section, metric, mode, horizon, weights), a
status card (a "live" dot only when an exposure arrived in the last 24 h), a results table per arm (uniques, orders,
confirmed, delivered, rates with intervals), a cumulative conversion line per arm (design.md data-viz rules: neutral series,
the accent for the leader, no orange), the decision banner, "Stop" and "Apply this version".

### LAN-§18.8 Acceptance and tests

`test:experiments` (pure, in `npm test`): 10,000 simulated A/A tests peeked daily for 28 days give ≤ 5 % false "decided"; a
true 20 % lift is decided near the expected sample; the Thompson floor holds; the same visitor keeps its arm across reloads
and weight changes; an arm with another price is refused. render-check: arms present, the control visible with JS off, the
head script before the first section, the CSS hash covers it. `test:tenancy`: exposures, arms and weights of A are invisible
to B; an exposure posted with A's pageKey from B's host is refused.

---

## LAN-§19 Upsell → downsell chain and cross-store upsell (LP-10, R3, track D3)

### LAN-§19.1 Configuration (`pages.addons.upsellChain`, snapshot in `page_versions.addons` at publish, request Q4)

```ts
// src/lib/landing/addons.ts
export interface PageAddons { v: 1; upsellChain?: UpsellChain }
export interface UpsellChain { v: 1; onAccept?: ChainOffer; onDecline?: ChainOffer }      // step 2 after today's step 1 (offers.upsell)
export interface ChainOffer {
  kind: "item" | "product";                // product = a catalog product of the same store ("both" mode, cross-store upsell)
  item?: string; productId?: string;
  title: string; description?: string; price: number; compareAt?: number; image?: AssetRef;
  windowMinutes: number;                   // ≤ 120, counted from the order time like step 1
}
```

Rules: only when `offers.upsell.enabled`; at most one more step (no step 3); a downsell's price is lower than step 1's;
compare-at real (the item's or product's real price); a `product` offer's price is snapshotted at publish (a product
change republishes through LAN-§17.4).

### LAN-§19.2 Server and runtime

- The frozen thanks chunk keeps running step 1. The `chain` add-on watches the step-1 box's `data-state` (`added` /
  `declined`, `src/landing/runtime/thankyou.ts:96-126`) and the `lp-order.upsell` field, then shows step 2 inside the same
  region with its own countdown anchored to the order time.
- `POST /api/public/upsell-chain { orderId, token, step: 2, decision: "accept" }` (request Q12): the token is the order's
  upsell token, which the server can re-derive (`upsellTokenFor(orderId, idem)`, `src/lib/orders/create.ts:79`), so step 2
  needs no new stored secret; idempotency through `orders.items.chainState`; price from `page_versions.addons` of the
  order's version; window check from `orders.created_at`; closed orders refused (as step 1, `upsell.ts:31,49`); accepted
  lines appended to `orders.items.chain[]`, Sheets row back to `pending`, stats revenue bumped (test orders excluded).
- The order text and the Sheet row show "+ [UPSELL 2] 1 × Sérum (options à confirmer)" (request Q27 to operations for
  `src/lib/orders/text.ts`); the agent sees every added line before the call.

### LAN-§19.3 Acceptance

Each step's price equals the version's addons; an expired window answers `expired`; a second accept is a no-op; the chain
lines appear in the drawer, the Sheet row and the CSV; a catalog product upsell uses the product price snapshotted at the
version.

---

## LAN-§20 Other R3 landing features (track D3)

### LAN-§20.1 Scheduled campaigns (LP-13)

`page_schedules` rows: `publish_version` (a prepared version goes live at `run_at`, e.g. the Ramadan page), `unpublish`,
`end_promo` (publish the "after" version at `run_at`). Creating an `end_promo` sets the live promo version's
`offers.urgency.countdownEnd = run_at` (a real date by construction, LD18). Job `landing.schedules` (every tick, lease
claim like the outbox, core §H.1) calls `publishPage(scope, pageId, versionId)` as a system actor, audits
`page.scheduled_publish`, notifies the store. A tick missed by downtime runs once at the next tick; more than 24 h late →
`failed` + notification (never a silent late price change). Screen: a timeline on the page (`/app/<h>/pages/<id>/schedule`)
and the kit's start and end. Acceptance: fires within one tick (≤ 5 min) of `run_at`; the countdown end equals `run_at`;
cancel works until the row is `running`.

### LAN-§20.2 Video-first hero, PDP video, UGC strip (LP-14)

A hero variant `video` (section files with design's D4 track): the poster `<picture>` is the LCP element
(`fetchpriority="high"`), the 9:16 or 16:9 clip is a `<video muted playsinline loop preload="none">` without `src`; a
`video-hero` add-on (≤ 700 B) attaches the source after the first interaction or 2 s of idle, then plays while ≥ 25 %
visible and pauses every other playing video (the frozen `video.ts` binds only at init, `src/landing/runtime/video.ts:8-40`,
so deferred heroes play through the add-on). Captions burned in or as text, sound off by default; reduced motion or Data
Saver → poster only. The UGC strip is a `socialProof` variant fed only with real customer videos (proof rules, LAN-§6.1).
Acceptance: the poster is the LCP element on every fixture; no video bytes before interaction or idle (Playwright network
log); CLS 0 (intrinsic sizes); reduced motion = poster.

### LAN-§20.3 Per-page analytics with the delivered rate (LP-15)

`/app/<h>/pages/<id>/analytics` (`reports.read`): funnel views → uniques → form starts → orders → confirmed → delivered (and
refused, returned) per version and variant (`stats_version_daily`, ai.md AI-§G.4), per offer chosen, per UTM source,
campaign and content, per city, per device class (orders' user agent; views have none, so device covers orders only).
Refusal rate = refused / (delivered + refused). Every rate shows its n and hides below n = 20; store timezone; CSV of the
aggregates; test orders excluded; no customer data. Acceptance: every number equals the SQL fixture; the screen of store A
never reads B's rows.

### LAN-§20.4 Per-city fees charged on landing pages (LP-16; core contract step, request Q28)

- A page opts in ("Charge delivery by city"); its versions publish with `runtime_v = 3`: the `landing-v3` chunk (a fork of
  the landing entry whose totals add the zone fee of the chosen city) and runtime config v3 (`v: 3` + `zones: { [cityKey]:
  { fee: number | null; freeFrom: number | null } }`); the shown total `st` includes the zone fee.
- The payload keeps the v2 shape (`v: 2`, `city` present); the server prices `shipping` from the zone when the version's
  `runtime_v = 3` (else the page fee), with today's stale and compare rules.
- A PHP template v3 mirrors the zone table; v2 pages and exports stay unchanged.
- Acceptance: runtime, server and PHP totals are equal on every zone fixture (`test:money` and `test:php` v3 cases); v2
  pages render byte-identical; a city without a zone fee falls back to the page fee in all three.

---

## LAN-§21 Later (LP-17) and saved blocks (LP-24)

### LAN-§21.1 LP-17, each gated on Experiments data first

| Item | Shape when scheduled | Honesty rule |
|---|---|---|
| Two-step form | step 1 offer and options, step 2 contact (the `fill-steps-box` chunk exists) | tested against the one-step form before it can become a default |
| Quizzes / product finder | 3-5 questions → recommended pack, rule-based from the owner's answers (AI drafts the rules) | recommends only real offers |
| Advertorial page kind | a long-form `pages.kind` value linking to the landing | a visible "Publicité" label **[proposal, legal review]** |
| Build-your-box, multiple bumps | Offers v3 (a new doc version, not a v2 change) | prices from the pricing engine |
| Honest exit popup | WhatsApp help only, once per session, never on the mobile back gesture | no fake discount |
| Section visibility by UTM or device | per-source HTML variants baked at publish, served by URL like experiment URL arms | no cloaking of prices |
| Real "orders today" counter | computed from orders, shown only at ≥ 10 orders today, store opt-in | real counts only |

Rejected outright (owner rule 4, EU UCPD): fake viewers, fake purchase toasts, resetting countdowns, invented stock.

### LAN-§21.2 Saved sections and house blocks (LP-24, R3)

"Save to library" in the builder's section menu stores `saved_blocks` (type, variant, sanitised data, this store's assets
only). The section library gets a "Saved" tab; inserting copies the data (a plain section). A **house block** (`shared`)
records its uses (`saved_block_uses`); editing it offers "Update N pages", which patches each draft and republishes the live
ones as `sync` versions after one confirmation. Order-form and offer sections can't be shared (prices never live in
blocks). Acceptance: one block inserted in two pages renders identically; "update everywhere" republishes exactly the pages
listed; a block can't reference another store's assets.

---

## LAN-§22 Public routes and APIs (summary)

Every route file exports only the methods it serves and answers the neutral 404 for the others (core C5); response
headers come from the producer classes of core §F.6.

| Route | Host class | Method | File | Rel. | Proof / guard | Headers |
|---|---|---|---|---|---|---|
| `<base>/track` | store (P on platform) | GET | `src/app/s/[store]/track/route.ts` | R1 | none (form) or signed `s` | store document, `noindex`, `private, no-store`, `no-referrer` |
| `/api/public/track` | every host the store owns | POST | `src/app/api/public/track/route.ts` | R1 | `last4` / `k` / `s`; buckets | public JSON |
| `/api/public/wa` | every host the store owns | POST | `src/app/api/public/wa/route.ts` | R1 w2 | pageKey + buckets + `take_orders` | public JSON |
| `<base>/go/<code>` | store | GET | `src/app/s/[store]/go/[code]/route.ts` | R1 w2 | — | 302 `private, no-store`; 410 neutral store page |
| `/kit/<token>` | platform only | GET | `src/app/(public)/kit/[token]/route.ts` | R1 w2 | share token (sha256 at rest) | `noindex`, `private, no-store`, `no-referrer` |
| `<base>/<slug>?utm_source=sg-test…` | store | GET | existing slug route (T3) + `renderTestDocument` | R1 w2 | test token | `private, no-store`, `noindex` |
| `<base>/<old-slug>[/merci]` | store | GET | existing slug route (T3) + history lookup | R1 | — | 308 `public, max-age=300` (core redirect class) |
| `/api/public/exp` | every host the store owns | POST | `src/app/api/public/exp/route.ts` | R3 | pageKey + running experiment + buckets | public JSON (sendBeacon text/plain accepted) |
| `/api/public/upsell-chain` | every host the store owns | POST | `src/app/api/public/upsell-chain/route.ts` | R3 | re-derived upsell token + window | public JSON |
| `<base>/<slug>?xv=<arm>` | store | GET | existing slug route + arm version | R3 | running URL experiment | store document (cacheable by full URL) |

Store-host requests reach these files only through the proxy rewrite (core §C.3); cookies never reach them; the public
APIs use `effectiveHost()` and `storeHosts(store)` themselves (core D18, §C.9).

---

## LAN-§23 Permissions, entitlements, limits, jobs, hooks, notifications, audit

### LAN-§23.1 Permissions used (core §A.3.1)

| Key | Used for |
|---|---|
| `pages.read` | pages list vitals, links list, campaigns list and kit view, experiment results |
| `pages.write` | links create/edit/pause, campaigns create/compile/share, saved blocks, copy a page (in both stores) |
| `pages.publish` | publish (gates), set as home, test-order links |
| `settings.read` / `settings.write` | read settings; write `policies`, `landing`, the thank-you card (`store.confirmation`) |
| `checkout.write` | zones, calendar, not-served behaviour, new-page form defaults |
| `leads.read` / `leads.write` | the inbox, attempts, follow-ups, lost |
| `orders.reveal_phone` | revealing a lead's phone (audit `lead.phone_revealed`) |
| `orders.assign` | assigning leads |
| `orders.create` | converting a lead or a WhatsApp intent |
| `orders.export` | leads CSV |
| `reports.read` | per-page analytics (R3) |
| `ai.use` | the cloud ad brief |
| `experiments.manage` | **new** (request Q29), R3: create, start, stop, apply experiments |

### LAN-§23.2 Entitlements and hard limits

No new entitlement key. Read: `publish`, `take_orders` (a WhatsApp intent answers `unavailable` when false), `exports_month`,
`php_export`, `cloud_ai`, `experiments`. Hard limits in code: 40 zones, 500 short links, 200 campaigns, 200 saved blocks per
store; ≤ 3 experiment arms; one running experiment per page; templates ≤ 1,000 chars.

### LAN-§23.3 Rate buckets (additions to core §E.8, request Q37)

| Bucket | Limit |
|---|---|
| `p:wa:ip:<h>` · `s:<sid>:wa:ip:<h>` | 30 / 10 min · 10 / 10 min |
| `s:<sid>:track:o:<hash(orderId)>` (failed lookups) | 10 / day |
| `s:<sid>:test-render` | 60 / h |
| `p:kit:ip:<h>` | 60 / 10 min |
| `p:exp:ip:<h>` · `s:<sid>:exp:ip:<h>` (R3) | 120 / 10 min · 60 / 10 min |
| `s:<sid>:upsell-chain:ip:<h>` (R3) | 20 / 10 min |

### LAN-§23.4 Jobs (`src/lib/jobs/tracks/landing.ts`, core §H.2 extension point)

| Job | Every | Budget | Does |
|---|---|---|---|
| `links.flush` | tick (+ `after()`) | 1 s | flush short-link and slug-history hit counters |
| `leads.followups` | hourly | 2 s | one in-app digest per assignee with due follow-ups |
| `delivery.holidays_review` | daily 08:00 (store tz) | 2 s | the holiday reminder (LAN-§7.2) |
| `pages.copy` (R2) | tick | 10 s | continue large page copies (LAN-§17.7) |
| `experiments.weights` (R3) | daily 04:00 (store tz) | 5 s | Thompson weights + render jobs |
| `experiments.autoend` (R3) | tick | 1 s | end at the horizon, stop on unpublish |
| `landing.schedules` (R3) | tick | 5 s | due page schedules |

Render handler: reason `product` → `republishAttached` (R2, request Q24).

### LAN-§23.5 Order hooks (`src/lib/orders/hooks/landing.ts`, core §K.3 extension point)

On order created: lead attribution (LAN-§10.4); flag `zone_not_served` (LAN-§7.4); experiment `variant_key` from the
exposure with the same idem (LAN-§18.5); test orders handled first (they only match test leads). No transition hook in R1.

### LAN-§23.6 Notifications (platform catalog, request Q35) and audit actions

Notifications: `lead.recovered`, `leads.followups_due`, `order.customer_request`, `order.confirm_intent` (queue badge only),
`delivery.holidays_review`, `landing.sync_failed` (R2), `landing.schedule_failed` (R3), `experiment.decided` (R3).
Audit: `store.delivery.updated`, `store.policies.updated`, `store.landing_settings.updated`, `page.proof_attested`,
`page.countdown_extended`, `page.test_link_created`, `page.slug_moved`, `page.attached`, `page.detached`, `page.copied_out`,
`page.copied_in`, `page.scheduled_publish`, `lead.phone_revealed`, `lead.converted`, `campaign.created`, `campaign.shared`,
`campaign.share_revoked`, `link.created`, `link.paused`, `experiment.started`, `experiment.stopped`, `experiment.applied`.

---

## LAN-§24 Screens index and copy keys

### LAN-§24.1 Admin screens (tenant dashboard, core §I.1; nav group "Landing pages" and Settings)

| Route | Permission | Rel. | Track | Spec | Locales |
|---|---|---|---|---|---|
| `/app/<h>/pages` (vitals, set as home, links and kit entry points) | `pages.read` | R1 | P3 (request Q19) | LAN-§15.2, LAN-§4 | en |
| `/app/<h>/leads` | `leads.read` | R1 | P3 | LAN-§10.3 | ar, fr, en |
| `/app/<h>/settings/delivery` | `settings.read` / `checkout.write` | R1 | P3 | LAN-§7.3 | en |
| `/app/<h>/settings/checkout` ("After the order" card) | `settings.read` / `settings.write` | R1 | P3 | LAN-§8.4 | en |
| `/app/<h>/settings/policies` | `settings.read` / `settings.write` | R1 | P3 | LAN-§3.3 | en |
| `/app/<h>/links` | `pages.read` | R1 w2 | P3 | LAN-§12.2 | en |
| `/app/<h>/campaigns`, `/campaigns/<id>` | `pages.read` | R1 w2 | P3 | LAN-§13.4 | en (kit content ar/fr/en) |
| builder: attach sheet, override chips | `pages.write` | R2 | S1 | LAN-§17 | en, fr |
| `/app/<h>/experiments`, `/pages/<id>/experiments/<eid>` | `pages.read` / `experiments.manage` | R3 | D3 | LAN-§18.7 | en, fr, ar |
| `/app/<h>/pages/<id>/schedule`, `/analytics` | `pages.read` / `pages.publish`, `reports.read` | R3 | D3 | LAN-§20 | en, fr, ar |

Admin messages live under the prefix `landing.*` in `src/lib/i18n/admin/<locale>/landing.ts` (core §I.5). Every screen
follows the design system of core §I.6 and design.md DES-§16 (tokens, density, ≤ 240 ms ease-out motion, no bounce, real
data only, no orange): skeletons mirror the content, empty states say what to do and never show sample numbers, every
destructive action has an undo toast or a confirm sheet, ids and phones sit in LTR isolates.

### LAN-§24.2 Shopper copy (defaults in `src/lib/landing/copy.ts`; owners override templates)

Arabic is Moroccan-friendly (Darija vocabulary, Arabic script); no dashes in any default (DG-07); `{vars}` are filled with
`textContent`; plurals through `Intl.PluralRules` (the `other` form shown).

| Key | ar | fr | en |
|---|---|---|---|
| `dz.general` | التوصيل من {min} حتى {max} أيام ديال الخدمة على حسب المدينة | Livraison en {min} à {max} jours ouvrés selon la ville | Delivery in {min} to {max} working days, depending on the city |
| `dz.city` | التوصيل لـ{city}: {dates} | Livraison à {city} : {dates} | Delivery to {city}: {dates} |
| `dz.between` | ما بين {from} و{to} | entre {from} et {to} | between {from} and {to} |
| `dz.on` | نهار {date} | le {date} | on {date} |
| `dz.estimated` | (تقريبي) | (estimation) | (estimated) |
| `dz.free` | التوصيل بالمجان | livraison gratuite | free delivery |
| `dz.notServed` | مازال ما كنوصلوش لـ{city}. | Nous ne livrons pas encore à {city}. | We don't deliver to {city} yet. |
| `dz.notServedCta` | كتب لينا فواتساب | Écrivez-nous sur WhatsApp | Message us on WhatsApp |
| `dz.notServedText` | السلام عليكم، واش كتوصلو لـ{city}؟ | Bonjour, livrez-vous à {city} ? | Hello, do you deliver to {city}? |
| `ty.confirm` | أكّد الطلب فواتساب | Confirmer sur WhatsApp | Confirm on WhatsApp |
| `customer_confirm` (template) | السلام عليكم، كنأكد الطلب ديالي {order_id}: {offer}، المجموع {total}. | Bonjour, je confirme ma commande {order_id} : {offer}, total {total}. | Hello, I confirm my order {order_id}: {offer}, total {total}. |
| `ty.expect` | غادي نعيطو ليك من {phone} باش نأكدو الطلب، {when}. | Nous vous appelons du {phone} pour confirmer, {when}. | We'll call you from {phone} to confirm, {when}. |
| `ty.whenWithin` | فـ{n} ساعات الجايين | dans les {n} heures | within {n} hours |
| `ty.whenToday` | اليوم من {time} | aujourd'hui à partir de {time} | today from {time} |
| `ty.whenTomorrow` | غدا من {time} | demain à partir de {time} | tomorrow from {time} |
| `ty.whenDay` | نهار {day} من {time} | {day} à partir de {time} | {day} from {time} |
| `ty.expectSave` | سجّل هاد الرقم باش تعرف بلي حنا اللي كنعيطو. | Enregistrez ce numéro pour reconnaître notre appel. | Save this number so you recognise our call. |
| `ty.track` | تتبّع الطلب ديالي | Suivre ma commande | Track my order |
| `wa.button` | دير الطلب فواتساب | Commander sur WhatsApp | Order on WhatsApp |
| `wa.ready` | الرسالة واجدة فواتساب · المرجع {ref} | Votre message est prêt dans WhatsApp · Réf. {ref} | Your message is ready in WhatsApp · Ref. {ref} |
| `wa_order` (template) | السلام عليكم، بغيت نطلب {offer} بـ{total} ({delivery}). المرجع {ref} | Bonjour, je souhaite commander {offer} à {total} ({delivery}). Réf. {ref} | Hello, I'd like to order {offer} for {total} ({delivery}). Ref. {ref} |
| `wa.toConfirm` | باقي خاصنا نعرفو: {list} | À préciser : {list} | To confirm: {list} |
| `trk.title` | تتبّع الطلب | Suivi de commande | Order tracking |
| `trk.orderNo` · `trk.last4` | رقم الطلب · آخر 4 أرقام ديال التيليفون ديالك | Numéro de commande · 4 derniers chiffres de votre téléphone | Order number · Last 4 digits of your phone |
| `trk.find` | شوف الطلب ديالي | Voir ma commande | Show my order |
| `trk.step.placed` · `confirmed` · `shipped` | توصلنا بالطلب · تأكد الطلب · خرج مع شركة التوصيل | Commande reçue · Confirmée · Expédiée | Order received · Confirmed · Shipped |
| `trk.step.out_for_delivery` · `delivered` | الموزع فالطريق ليك · توصلتي بالطلب | En cours de livraison · Livrée | Out for delivery · Delivered |
| `trk.step.cancelled` · `returned` | تلغى الطلب · رجع للمتجر | Annulée · Retournée à la boutique | Cancelled · Returned to the store |
| `trk.changeAddress` · `trk.cancel` · `trk.other` | بدّل العنوان ديالي · لغي الطلب ديالي · طلب آخر | Changer mon adresse · Annuler ma commande · Autre demande | Change my address · Cancel my order · Other request |
| `trk.sent` | الطلب ديالك وصل. المتجر غادي يتواصل معاك. | Demande envoyée. La boutique vous contacte. | Request sent. The store will contact you. |
| `trk.notFound` | ما لقيناش هاد الطلب. تأكد من الرقم ومن الأرقام الأربعة. | Nous ne trouvons pas cette commande. Vérifiez le numéro et les 4 chiffres. | We can't find this order. Check the number and the 4 digits. |
| `trk.rateLimited` | بزاف ديال المحاولات. عاود من بعد شي دقايق. | Trop d'essais. Réessayez dans quelques minutes. | Too many tries. Try again in a few minutes. |
| `trk.closed` | هاد الطلب خرج ديجا: كتب للمتجر إلا بغيتي شي حاجة. | Cette commande est déjà expédiée : écrivez à la boutique pour toute demande. | This order has already shipped: message the store for any request. |
| `lead_recovery` (template) | السلام عليكم {name}، معاك {store}. بديتي طلب ديال {offer} فالصفحة ديالنا. بغيتي نكملوه مع بعض؟ | Bonjour {name}, ici {store}. Vous avez commencé une commande de {offer} sur notre page. Voulez-vous qu'on la termine ensemble ? | Hello {name}, this is {store}. You started an order for {offer} on our page. Shall we finish it together? |
| `track_link` (template) | السلام عليكم {name}، تقدر تتبّع الطلب ديالك {order_id} من هنا: {track_url} | Bonjour {name}, suivez votre commande {order_id} ici : {track_url} | Hello {name}, follow your order {order_id} here: {track_url} |
| `test.banner` | طلب تجريبي: ما كيتحسبش | Commande test : non comptée | Test order: not counted |
| `link.inactive` | هاد الرابط ما بقاش خدام. | Ce lien n'est plus actif. | This link is no longer active. |

---

## LAN-§25 Tests

### LAN-§25.1 `npm test` (offline)

| Script | File | Checks |
|---|---|---|
| `test:delivery` | `src/lib/delivery/selftest.ts` | LAN-§7.5 ETA and zone-problem cases |
| `test:landing-addons` | `src/landing/addons/selftest.ts` | `addonsFor` matrix (page × mode × settings), data block shapes and sizes, the selection serialiser over the DOM fixtures, "every add-on off → no add-on bytes" |
| `test:policies` | `src/lib/policies/selftest.ts` | `policyAllows` per claim and locale, `policyLines` ≤ 6 lines, unset → no sentence |
| `test:links` | `src/lib/links/selftest.ts` | the LAN-§12.1 query rule (byte-identical incoming part, `utm_` detection, encodings) |
| `test:wa-price` | `src/lib/wa-order/selftest.ts` | `priceWaSelection` vs `orderTotals` on the `duo`, `tshirt`, `colors` fixtures, partial selections |
| `test:kit` | `scripts/qa/kit-check.ts` | LAN-§13.6 over the 60 AI fixtures (template path) |
| `test:experiments` (R3) | `src/lib/experiments/selftest.ts` | LAN-§18.8 simulations, fingerprint stability |
| checklist fixtures | `src/lib/editor/selftest-checklist.ts` (new) | every LAN-§3.2 item fires and clears |
| render-check (extended) | `scripts/qa/render-check.ts` (T3; fixtures added through Q3) | new chunk budgets and page caps, delivery fallback text, thank-you timelines × policies, no `aggregateRating`, test render without pixels, byte identity when add-ons are off |

### LAN-§25.2 DB-backed (`npm run test:db`, throwaway `cod_test_*` databases)

| Script | Checks |
|---|---|
| `test:tracking` (`scripts/qa/tracking-check.ts`) | LAN-§9.5 |
| `test:leads` (`scripts/qa/leads-check.ts`) | capture with `sel`, the LD12 attribution fixtures, WhatsApp intents (refs, NULL phone), conversion through the manual-order stub, retention purge |
| `test:tenancy` additions (`scripts/qa/tenancy-check.ts`, T4's file, cases listed for T4/P3) | zones, leads, intents, short links, campaigns and share tokens, slug history, test tokens, experiments and exposures of A unreachable from B (actions, public APIs, ⌘K) |
| `test:public-api` additions | the new buckets; `wa`, `track`, `exp` refused for non-servable stores and for foreign hosts |

### LAN-§25.3 HTTP and e2e

`qa:headers` (track, go 302/410, kit share, test render); Playwright msedge steps `delivery`, `wa-order`, `thank-you`,
`tracking`, `test-order` in `qa/e2e`, which together run the landing half of the rf §4 three-minute demo (checks 1, 2, 4, 5)
on a 390 px viewport with 4G throttling.

---

## LAN-§26 File ownership

### LAN-§26.1 R1 product, track P3 LANDING (core §K.2)

Owned (create, modify, delete): core-listed `src/lib/editor/checklist.ts`, `src/lib/delivery/**`, `src/lib/tracking/**`,
`src/lib/orders/leads.ts`, `src/landing/thankyou/**`, `src/landing/sections/orderForm/**`, `src/app/s/[store]/track/**`,
`src/app/api/public/track/**`, `src/app/app/[store]/{leads/**, settings/{checkout,delivery,policies}/**}`,
`src/components/admin/leads/**`, `src/components/admin/shell/nav/landing.ts`, `src/lib/i18n/admin/<locale>/landing.ts`,
`src/lib/jobs/tracks/landing.ts`; plus, by request (Q3, Q12, Q16, Q19, Q21, Q30): `src/landing/addons/**`,
`src/landing/runtime/addons/**` (instead of the single `entry-delivery.ts`, LD2), `src/lib/policies/**`,
`src/lib/leads/**`, `src/lib/wa-order/**`, `src/lib/links/**`, `src/lib/campaigns/**`, `src/lib/testing/**`,
`src/lib/landing/**` (copy, templates, slugs, vitals), `src/lib/render/gates/landing.ts`,
`src/lib/orders/hooks/landing.ts`, `src/lib/settings/keys/{policies,checkout,landing}.ts`, `src/landing/legal/**`,
`src/components/admin/pages/**`, `src/components/admin/{delivery,policies,links,campaigns,landing}/**`,
`src/app/app/[store]/{links/**, campaigns/**}`, `src/app/api/app/[store]/leads/**`, `src/app/api/public/wa/**`,
`src/app/s/[store]/go/**`, `src/app/(public)/kit/**`, `scripts/qa/{tracking-check.ts, leads-check.ts, kit-check.ts}`.

Read-only for P3 (changes through a CCR): `src/landing/document.tsx`, `src/lib/render/**` (except the gate file),
`src/landing/runtime/**` (except `addons/**`), `src/lib/page/**`, `src/lib/orders/{contract,create,validate,text,upsell,resolve}.ts`,
`src/lib/editor/**` (except `checklist.ts`), `src/components/builder/**`, `src/components/preview/**`, every other
`src/landing/sections/**` (design's P6), `scripts/build-landing-assets.mjs`, `src/landing/runtime/budgets.json`.

Wave 1 (merge order slot P3 in core §K.2): LP-01 checks, LP-02, LP-03 (+ ETA dates), LP-04, LP-05, LP-06, LP-20, LP-21,
LP-22. Wave 2 (after wave 1 is merged, before integration): LP-11, LP-12, LP-18, LP-19.

### LAN-§26.2 R2, track S1 (landing parts)

`src/lib/landing/{attach.ts, attach.server.ts, copy.server.ts}`, `src/components/builder/attach/**` (new, request with the
S-track contract step), the product page's "Landing pages" tab (inside storefront's own files), the `product` render
handler. Shared with S2: the theme-mode switch.

### LAN-§26.3 R3, track D3 GROWTH (landing parts)

`src/lib/experiments/**`, `src/landing/runtime/addons/{exp-head,exp,chain,video-hero}.ts`,
`src/app/api/public/{exp,upsell-chain}/**`, `src/app/app/[store]/experiments/**`,
`src/app/app/[store]/pages/[id]/{experiments,schedule,analytics}/**`, `src/components/admin/{experiments,schedules,analytics}/**`,
`src/lib/landing/{addons.ts, schedules.server.ts, saved-blocks.server.ts}`, the `landing-v3` entry and the PHP template v3
with the maintainer (core contract step, Q28); section files for LP-14 with design's D4.

---

## LAN-§27 Requests to the core

Each request names the exact change; the core integrates them in revision 2 (core header). "Owner" = who applies it.

| # | Change | Where | Owner | Why |
|---|---|---|---|---|
| Q1 | Add table `campaigns` (LAN-§2.2) to 0005, registry row `T · landing` in §D.3 | `schema.ts`, `drizzle/0005_r1.sql`, core §D.3/§D.9 | maintainer | LP-18 |
| Q2 | `leads.phone` → NULL-able in 0005; add the `leads` columns and indexes of LAN-§2.1 (`kind`, `ref`, `sel`, `total_cents`, `version_id`, `next_at`, `lost_reason`, `converted_via`, `is_test`, `updated_at`) | `schema.ts`, 0005, core §D.2 row `leads` 0005 | maintainer | LD10; core §D.8 says 0005 has no type change: this adds one, guarded like the 0006 `orders.page_id` change |
| Q3 | **R1.0 render add-on hook** (T3): the render context gets `addons?: RenderAddons` (LAN-§5.1); the Shell renders `head` scripts first in `<head>`, `body` scripts after the core chunk, the JSON data blocks with `inlineJson`, extra CSS chunk names, and `banner: "test"`; every add-on script joins the hash CSP; `RuntimeChunkName` gains the add-on names; the publish/render path calls `addonsFor()` | `src/landing/document.tsx:299-334`, `src/lib/render/{core,csp,publish.server,render.server}.ts`, `src/landing/types.ts` | T3 (R1.0) | LD1, LD2: new behaviour without touching the frozen chunks |
| Q4 | `pages.addons` and `page_versions.addons` (`longtext NULL`, `PageAddons`) in 0007; the publish path copies `pages.addons` into the version row | `schema.ts`, 0007, publish path | maintainer + D3 | LD3, LAN-§19 (prices charged from the version) |
| Q5 | `budgets.json`: `assist` 2600, `assist-ty` 1500, `track` 2400, `page` 32000 → **34800**, new `thanks-page` 12600; R3: `exp-head` 450, `exp` 1200, `chain` 2000, `video-hero` 700, `landing-v3` 24700, `thanks-page` → 14600; render-check measures the add-on chunks and both page caps | `src/landing/runtime/budgets.json`, `scripts/qa/render-check.ts:119-131` | maintainer | LAN-§5.2 (heaviest page measured 31,931 B, OFFERS §F.9) |
| Q6 | Move `short_links` from 0007 to **0005** with the LAN-§2.1 columns; core §C.4.1 row `/go/<code>` → **R1** | `schema.ts`, 0005, core §C.4.1, §D.3 | maintainer | LD14 (rf §3.2 raise) |
| Q7 | Add table `page_slug_history` (LAN-§2.2) to 0005 | `schema.ts`, 0005 | maintainer | LP-20 |
| Q8 | `render_jobs.reason` append `'store_info'` (0005); the `renders` job treats it like `brand` (in-place, D50) | `schema.ts`, 0005, core §H.3 | maintainer, P8 | LAN-§8.5: store contacts, policies and zone fallback text baked in live HTML |
| Q9 | New store setting key **`landing`** (LAN-§2.3) in the store registry, owner landing, R1 | `src/lib/settings/store-registry.ts`, core §D.10 | maintainer | thank-you, leads capture, WhatsApp order, tracking requests, store-mode toggle |
| Q10 | Confirm the `store` key shape `confirmation: { callerPhone, whatsapp, hours, withinHours }` (LAN-§2.3) | `src/lib/settings/keys/store.ts`, core §D.10 row `store` | maintainer | LP-04 |
| Q11 | Public resolvers `resolveOrderForTracking(orderId)` and `resolveKitShare(token)` (annotated `// tenancy: public-key …`), returning a `publicScope` | `src/lib/tenancy/public.ts` (core-owned), core §E.3 rule 6 | maintainer | LAN-§9.1, LAN-§13.5 |
| Q12 | Routes: `POST /api/public/wa` (R1), `GET /kit/<token>` as a **platform-only** public area (store hosts 404; proxy area like `auth`, headers `noindex`, `private, no-store`, `no-referrer`), R3 `POST /api/public/exp`, `POST /api/public/upsell-chain`; add them to the core §C.4 table and to `headers-check.ts` / `tenancy-check.ts` (core §J.5 rule) | `src/lib/edge/areas.ts`, core §C.3, §C.4 | maintainer, T3 | LAN-§11, §13, §18, §19 |
| Q13 | **Publish gate registry:** `src/lib/render/gates/<track>.ts` files registered by a core index; the publish path awaits `gates.flatMap(g => g({ scope, doc, prev, now, store }))` before rendering; any issue → `{ ok: false, error: "<track>_blocked", issues }` (design uses `design_blocked`, landing `honesty_blocked`) | `src/lib/render/publish.server.ts`, new `src/lib/render/gates/index.ts` | T3 (R1.0 hook), maintainer | LAN-§3.2: the checklist runs only in the browser today |
| Q14 | No `aggregateRating` in JSON-LD on Store Gen pages until verified reviews (ST-13) | `src/landing/document.tsx:289-290` | T3 | LD17, R-D46 |
| Q15 | The editor passes `LandingCheckContext` (LAN-§3.2) to `buildChecklist` (server preload + builder store) | `src/lib/editor/{pages.server.ts, types.ts}`, builder checklist panel | T4 (R1.0) or a CCR in R1 | LP-02, LP-21, delivery and policy checks |
| Q16 | Move `src/landing/legal/**` to P3 for R1 product (returns kind, `StorePolicyFacts`); T3 keeps the `/policies/<kind>` route | core §K.1 T3 row, §K.2 P3 row | maintainer | LAN-§3.3 |
| Q17 | Freeze at P0 these operations APIs as typed stubs: `appendOrderEvent(scope, orderId, { actorKind, type, meta })`, `createManualOrder(ctx, input & { source?: "manual" or "whatsapp"; fromLead?: { leadId: string } })`; event types `customer_request`, `customer_confirm_intent`; hooks may append to `orders.flags` (`zone_not_served`, `test`); the queue shows chips for `test`, `zone_not_served`, confirm intent | core §K.2 P0 list, operations.md | maintainer, P4 | LAN-§9.3, §10.5, §11.5, §7.4 |
| Q18 | ⌘K search provider extension point (`src/lib/admin-data/search/<track>.ts`) so P3 contributes `WA-` refs and leads | `src/lib/admin-data/search.ts` (P2) | P2 | LAN-§11.5 |
| Q19 | P3 owns `src/components/admin/pages/**` in R1 product (vitals, set as home, links and kit entry points) | core §K.2 read-only list | maintainer | LAN-§15.2, LAN-§4 |
| Q20 | ai.md registers the task `ad.brief` in R1 behind the Cloud AI flag (template fallback per field, the AI-§D guard); AI-20's LLM version stays R3 | ai.md task registry, core §L.2 AI rows | P7 | LP-18 (rf §3.2 raise of AI-20's template) |
| Q21 | **Test-order plumbing:** `orders.is_test` (+ index) in 0005; `src/lib/orders/create.ts` calls `isTestSession()` and then skips CAPI enqueue, `bumpOrderStats` and sets `sheet_status = 'disabled'`; the store slug and thank-you routes call `renderTestDocument()` for a valid test token; every aggregate reader skips `is_test` (Sheets push P5, CAPI P5, Telegram "[TEST]" P5, `stats_*` T3/ai, agent KPIs and customer counters P4, finance S3, learning ai, `store_daily_rollup` platform) | `schema.ts`, 0005, `create.ts`, `src/app/s/[store]/**`, the listed readers | maintainer, T3, P4, P5, P7 | LP-19, the rf §4 demo check 5 |
| Q22 | The slug-move action calls `recordSlugMove(scope, pageId, oldSlug)`; the store slug route consults `page_slug_history` before its 404 | `src/lib/editor/pages.server.ts:418-441`, `src/app/s/[store]/[slug]/**` | T4, T3 | LP-20 |
| Q23 | `scripts/qa/tenancy-allow.json` entries for the short-link and slug-history hit counters (per-store Maps flushed by `links.flush`) | lint L4 allow file | maintainer | LAN-§12.1 |
| Q24 | **Deviation from core §H.3 / D50 for reason `product`:** its handler is `republishAttached` (a new published version kind `sync`, LD20), not the in-place rewrite; `page_versions.kind` append `'sync'` in 0006; `sync` versions pruned first under `versions_kept_per_page` | core §H.3, D50, `schema.ts`, 0006 | maintainer, S1 | prices live in the version doc the server prices from |
| Q25 | Attached landings use catalog content ids in the runtime config and pixels (with storefront.md's id scheme) | `src/lib/render/config.ts`, `src/lib/page/catalog.ts:120-122` (frozen: a parameter, not a schema change) | S1 contract step | LND-11, LAN-§17.5 |
| Q26 | `bumpVersionStats(scope, pageId, versionId, day, delta, variantKey = "")` | ai.md AI-§G.4 (`src/lib/stats/version.ts`) | P7 / S7 | LAN-§18.5 |
| Q27 | The order text, the Sheet row and the CSV render `orders.items.chain[]` lines ("+ [UPSELL 2] …") | `src/lib/orders/text.ts`, Sheets row builder, CSV | operations, maintainer (R3) | LAN-§19.2 |
| Q28 | **R3 contract step for LP-16:** runtime config v3 type, `landing-v3` entry, server shipping by zone for `runtime_v = 3` versions, PHP template v3 with parity tests | `src/landing/runtime/config.ts`, `src/lib/orders/validate.ts`, `src/lib/page/pricing.ts`, `src/lib/export/templates/` | maintainer + D3 | LD25 |
| Q29 | Permission key `experiments.manage` (w, R3; owner, admin, editor) | `src/lib/auth/permissions.ts`, core §A.3.1-§A.3.2 | maintainer | LAN-§18.1 (core lists `/experiments` without a key) |
| Q30 | `scripts/build-landing-assets.mjs` bundles `src/landing/runtime/addons/*.ts` entries (each importing pure modules such as `src/lib/delivery/eta.ts`) into `addonChunks` in `src/landing/generated/assets.ts` | build script, generated assets | maintainer | LAN-§5.2 |
| Q31 | The builder mounts P3's `ProofAttestSheet` (`src/components/admin/landing/proof-attest.tsx`) at the `sample` toggle of proof sections and at the rating field, and calls `attestProofAction` | `src/components/builder/**` (P6 in R1 product) | P6 | LAN-§6.1 |
| Q32 | 0007: the refined `experiments` / `experiment_arms` (kind + `'section'`), `experiment_exposures`, `page_schedules`, `saved_blocks`, `saved_block_uses`, `orders_store_variant_idx`, the additive `orders.items.chain` JSON field | `schema.ts`, `drizzle/0007_r3.sql`, core §D.6 | maintainer | LP-09, LP-10, LP-13, LP-24 |
| Q33 | Core §L.2 and §K.2: LP-11 and LP-12 → **R1** (P3 wave 2); LP-18, LP-19, LP-20, LP-21, LP-22 → R1 (P3); LP-23 → R2 (S1); LP-24 → R3 (D3) | core §L.2, §K.2 P3 row | maintainer | LD30 |
| Q34 | Mode switch safeguard: the `store.mode` action asks `landingModeSwitchPlan(scope)` (live landing pages + 7-day views) and sets `landing.inStoreMode`; `modeAllows(mode, "landing", { landingInStoreMode })` reads `landing.inStoreMode` | core §A.2, P2's settings/general action | P2, maintainer | LAN-§4: ad traffic must not hit a 404 after a mode change |
| Q35 | Notification kinds and audit actions of LAN-§23.6 in the platform catalogs | platform.md catalogs, `src/lib/audit.ts` action union | P1, T1 | LAN-§23.6 |
| Q36 | Retention (core §H.11): WhatsApp intents with leads (30 days); `experiment_exposures` 60 days after the experiment ends; `page_slug_history` at `until`; campaign share tokens revoked when a campaign ends + 90 days | core §H.11, housekeeping job | P8 | data minimisation |
| Q37 | The rate buckets of LAN-§23.3 in core §E.8 | core §E.8 | maintainer | consistency of the bucket registry |
| Q38 | R3 renderer support for experiments: wrap in-page arms (`.lp-xa`, id suffixes), the arms CSS, `exp-head` in `<head>`, and serving `?xv=<arm>` versions while a URL experiment runs (canonical to the control) | `src/lib/render/**`, `src/app/s/[store]/[slug]/**` | maintainer / D3 contract step | LAN-§18.5 |

---

## LAN-§28 Review decisions

(Empty in revision 1. Filled after the reviews: each row = reviewer, point, decision, section changed.)
