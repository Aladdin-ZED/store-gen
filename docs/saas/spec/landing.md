# Store Gen SaaS part spec: landing pages (first-class), delivery promise, thank-you, tracking, leads, WhatsApp, links, campaigns, experiments

Status: **part spec, revision 2 (elevated)** (2026-10-24, landing part architect). Not yet reviewed (LAN-§29 is empty).
Built on `docs/STORE-SAAS.md` **revision 2** (the core contract, cited as **core §X**; its appendix **core §Q.3** decides
every request of revision 1, all 38 accepted, Q12 and Q13 with the changes recorded in LAN-§27) and on the settled
decisions of `docs/saas/RESEARCH.md` §2 (cited as **R-D1 … R-D53**). It covers every landing feature id **LP-01 … LP-17**
of RESEARCH §3.4, the landing items the Fable rethink raised (`docs/saas/research/rethink-features.md` §3, cited **rf §x**),
seven operator-grade additions **LP-18 … LP-24**, and the signature features the core assigned to this track (**SF-01**
Campaign Kit, **SF-05** test-order mode, **SF-08** Delivery Promise landing side, **SF-10** Experiments; contributor
duties for **SF-03** Store Health and **SF-06** pulse), each with scope, release and acceptance criteria. Revision 2 adds
the **landing page quality contract** (LAN-§3.4 … §3.8): the measured baseline of today's output
(`docs/saas/research/design-baseline.md`, score 4.3/10, distinctiveness 2/10; its §5 targets cited as **DB N*/C*/T*/K*/I*/
R*/D*/RTL*/F***) applies to landing pages first, the server refuses what the owner rules forbid (core §M), and the honesty
gate this part owns turns "sample proof", invented numbers and promises without a source into **publish errors**, never
warnings. Section ids carry the prefix **LAN-§** so cross-references to the core (`core §E.2`) and to the sibling part
specs (`ai.md AI-§D.2`, `design.md DES-§8`, `platform.md PLA-§22.2`, `operations.md OPE-§26`, `storefront.md STO-§15`)
stay unambiguous.

This document may refine only the tables core §D.9 assigns to the landing part (`delivery_zones`, `campaigns`,
`short_links`, `page_slug_history`, `experiments`, `experiment_arms`, `experiment_exposures`, `page_schedules`,
`saved_blocks`, `saved_block_uses`, the `leads` columns of 0005 except `is_test`) and the schemas of the store settings
core §D.10 gives it (`policies`, `checkout` R1 part, `landing`). Everything else it needed was requested in revision 1
and is now part of the core (LAN-§27 lists each request with its core decision). Where this document and core revision 2
disagree, the core wins; revision 2 of this document was aligned line by line with core §A.2, §A.3, §A.4, §C.4, §D.2,
§D.5, §D.6, §D.9, §D.10, §E.2, §E.8, §H.2, §H.3, §H.13, §I.1, §I.3, §I.4, §I.7, §J, §K.2, §L.2, §M and §Q.3.

Inputs: `docs/STORE-GEN-BRIEF.md` items 1, 7, 8, 9, 14, 15, 16 · `docs/HANDOFF.md` §2 (owner rules), §4, §5 · core
revision 2 · RESEARCH §2-§4 · `docs/saas/TENANCY-MAP.md` (§5.5-§5.10, §8.2, §8.3, §9.2; item ids PUB-xx, LND-xx, ORD-xx,
EXP-xx) · `docs/saas/research/design-baseline.md` (§3 evidence, §4 root causes, §5 targets, §6 keep-list) ·
`docs/saas/research/rethink-ai.md` (cited **ra §x**: the Director loop §1, rubric v3 §1.3 incl. R9 COD invariants, the
kicker budget §9.9, scripts never per customer §9.14) · `docs/saas/research/rethink-features.md` (§1.1 SF-01, §1.6
Delivery Promise, §1.8 honest experiments, §1.11 WhatsApp-first, §3 catalog delta, §4 the three-minute demo) ·
`qa/ref/anti-slop-frontend-rubric.md` (adopted where it does not conflict with the owner rules: its orange-family palette
suggestions are void, Arabic has its own type rules; cited **rubric §x**) · `docs/saas/research/storefront.md` (cited
**sf §x**), `cod-ops.md` · sibling specs `ai.md`, `design.md`, `platform.md`, `operations.md`, `storefront.md` revision 1
· the format model `docs/OFFERS.md`. Code facts are `path:line` at commit `a0ffec1` (no file under `src/` or `scripts/`
changed between `68c3793`, the revision 1 baseline, and `a0ffec1`; every revision 1 fact was re-checked and holds).
Next.js is 16.4: store routes are real route files under `src/app/s/[store]/**` reached through the `src/proxy.ts`
rewrite (core §C.3); this part adds route files only under paths the core already routes (`/s/<h>/…`, `/api/public/*`)
plus one platform path (`/kit/<token>`, proxy area `kit`, core §C.3).

Reading order for a build agent: LAN-§0 (decisions) → LAN-§1 (your feature rows) → LAN-§3.4 … §3.8 (the quality contract
every landing page meets) → the track you own (LAN-§26) → the sections your files touch → LAN-§5 (runtime add-ons and
budgets, if you touch shopper pages) → LAN-§25 (tests you must keep green) → LAN-§27 (how each request was decided) →
LAN-§28 (what changed in this revision and why).

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
13. **New in revision 2: the page you publish is checked by the server, not only by a panel.** A landing page that is
    too long (more than 16 sections or 15,000 px on a phone), too heavy (more than 140 KB), hides the price or the
    order button below the first screen, repeats a design already live in your niche, shows a number nobody typed, or
    shows reviews, chats, before/after photos or a video without the real material is refused with a named reason and
    one fix per item. Nothing advisory: a refused page does not go live.
14. **Phone-first by contract.** On a 390 px phone the product, the price, the order button and the "pay on delivery"
    line sit in the first screen; the order form starts by the fourth screen and fits in about one; one sticky bar and
    one WhatsApp bubble at most, never both over a button; the form has visible boxes, never underlines only.
15. **Honest by construction.** Example reviews can't publish; a countdown can't move back; "free delivery" appears only
    when the fee is really 0; a delivery date appears only from your zones; every number on the page traces to
    something you typed, and the same fact never shows two values on one page.
16. **The test order is a real walk-through.** From the address card, one link opens your live page in test mode: no
    pixel fires, the order carries a TEST chip, nothing reaches Sheets, Meta or your numbers, and your agent can confirm
    it from the queue. This is how the owner's three-minute demo ends.
17. **The Campaign Kit ships in R1.** From one page: the WhatsApp confirmation text, the call script, an ad brief with
    three angles, one short link per channel with tracking tags, a pixel plan, a read-only link for your media buyer,
    and results per angle down to delivered orders. Everything in it is built from your page and your settings, never
    from free text.

---

## LAN-§0 Decisions at a glance

R-D1 … R-D53 are adopted as settled. Rows marked **deviates** or **refines** change or sharpen a settled decision or a
core rule and say why.

| # | Decision | Why |
|---|---|---|
| LD1 | **Frozen means frozen.** PageDoc v2 (`src/lib/page/schema.ts`; the one additive, optional, default-free change of R1 is design's `ThemeSpec.look`, core header), runtime config v2 (`src/landing/runtime/config.ts:105-145`), payload v2 (`src/lib/orders/contract.ts:84-98`), the PHP export and the `landing` (24,200 B, `src/landing/runtime/budgets.json:3`) and `thanks` (6,650 B) chunks are not changed by this part. Every new shopper behaviour ships in an **add-on chunk** (LAN-§5, core D62 / §H.13) that reads its own JSON data block, the DOM, the `lp:order` event (`src/landing/runtime/form.ts:19,324-331`) and the `lp-order` hand-off (`src/landing/runtime/order-store.ts:9`). | R-D43; the landing chunk is within 30 B of its budget (HANDOFF §6); open tabs and exports depend on the contracts. |
| LD2 | **Two R1 add-on chunks, not one per feature:** `assist` on landing pages (delivery line, WhatsApp order, idem capture) and `assist-ty` on thank-you pages (confirm on WhatsApp, expectation block, tracking link); `track` on the tracking page. Accepted by the core (§K.2 P3 row names `addons/**` "replaces the single `entry-delivery.ts` of rev 1"). | The three landing features are small (≈ 2.4 KB gz together) and usually on together; one script tag means one CSP hash and one budget line instead of three; thank-you code never ships to the landing page. |
| LD3 | Page-level add-on settings the frozen doc can't hold live in the store settings `landing` and `checkout` in R1-R2; from R3 a versioned `pages.addons` / `page_versions.addons` JSON (core §D.2 0007, Q4 accepted) holds what must be charged from the version (upsell chain prices) or tested (experiment arms). | The doc schema is frozen; a price charged after an order must come from the version the shopper saw (OFFERS D8, `src/lib/orders/upsell.ts:3-4`). |
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
| LD14 | **Short links (LP-12) ship in R1** on the store host only: `/go/<code>` answers **308 with `Cache-Control: private, no-store`** (core §C.4.1; revision 1 said 302 and is superseded: an explicit `no-store` makes a 308 non-cacheable, so the target may still change, and the redirect class stays the core's one), adds the preset UTM only when the incoming query has no `utm_` key, appends the incoming raw query byte for byte, counts clicks in memory (flushed by `links.flush`), paused → 410. | Needed by the Campaign Kit (rf §3.2); the V7 rule (query byte for byte); one redirect class in the header suite (core §F.6). |
| LD15 | **Campaign Kit (LP-18 = rf SF-01) ships in R1, P3 wave 2**: a kit compiles **only from the page doc and the store settings** (templates, links, pixel plan, ad brief template); the cloud brief rides behind the Cloud AI flag (ai part). The R1 exit does not depend on it. | The switch reason of rf §0; built from existing pieces; honest by construction. |
| LD16 | **Test-order links (LP-19 = rf SF-05) ship in R1 on the core's D54 contract:** the link is `storeUrl(store, "/<slug>") + "?sg-test=<token>"` with `token = <exp base36>.<base64url(hmac(exp, "test-order:" + storeId))[:22]>`, valid **2 h**, store-bound; the store route renders the published version **on request without pixels** (`renderTestDocument()`, T3) and bakes `?sg-test=<token>` into the runtime config's `endpoints.order` / `endpoints.lead` / `endpoints.upsell` and into `thankYouUrl` (runtime config v2 unchanged in shape: endpoint strings are opaque to the frozen chunk, `src/landing/runtime/form.ts:376`, `lead.ts:15`, `thankyou.ts:87`; the thank-you URL already accepts a query, `form.ts:304-306`), omits `endpoints.event` (test traffic never reaches `stats_daily`, core §D.2), and the public handlers call `resolveTestToken(store, url.searchParams.get("sg-test"))` (core §E.2, lint L12). The order and lead get `is_test = 1` (core-owned columns) and are excluded everywhere (OPE-§26). **Refines** platform.md UX-05 (R2 test link): the mechanism lands in R1 (core D54, §I.4 address card). Revision 1's `utm_source=sg-test&utm_content=<token>` carrier and 24 h validity are superseded. | Owner test orders poison stats and ads today (HANDOFF §5); the rf §4 demo check 5 needs it; the token must bind the store, not the page, so one address-card link opens any page of the store in test mode. |
| LD17 | **Proof sections can't publish sample content on SaaS stores** (LP-02): `reviews`, `socialProof`, `stats`, `beforeAfter` with `sample: true` visible = publish **error** (`honesty_blocked`, core §M.3); switching `sample` off asks an explicit "these are real" attestation, audited. `aggregateRating` JSON-LD is removed by T3 in R1.0 (core §C.8) until verified reviews exist (ST-13, R3). Other sample sections (faq, specs, showcase, story, video) stay warnings. **Rev 2 widens the family (DB I4, D2):** a proof section also needs its **material**: `beforeAfter` two distinct merchant images, `video` a real file or URL, `gallery` / `ugc` / `lookbook` ≥ 3 distinct assets, photo credits only from merchant-typed names, hotspots only on merchant-placed anchors (DB I5); and no stat, counter, rating or review may render from a copy library (`src/landing/sections/stats/copy.ts:57-69` ships "94 %" with a "questionnaire" source today). | R-D46, EU Omnibus Annex I 23b; the checklist only warns today (`src/lib/editor/checklist.ts:142-152`); the baseline found fabricated before/after sliders, still "videos" and library percentages on every page (design-baseline §3.4, §3.7). |
| LD18 | **Countdowns from real dates only, and they never move back** (LP-21): an end that already passed or already ran on the live page can't be moved later on the same page (error); moving a still-running end later is a warning + audit; ends > 30 days ahead warn; generators and AI never write `countdownEnd` or `stockLeft`. | EU UCPD and owner rule 4; "never resets" is already the model (`src/landing/runtime/countdown.ts:5`), this closes the manual reset. |
| LD19 | **Slug history** (LP-20): a renamed page's old slug answers 308 to the new path for 12 months, per store; another page of the store may take the old slug (the history row is dropped). | Ads and WhatsApp messages keep old links; today the old slug 404s (`src/lib/editor/pages.server.ts:418-441`). |
| LD20 | **A product change republishes attached landings as a new version** (kind `sync`), it is **not** an in-place re-render. **Refines core D50 for render reason `product`**, accepted in core Q24 (D50 now names `republishAttached` as the one exception, core §H.3). | Prices and options live in the version doc the server prices from (`src/lib/orders/upsell.ts:52`, OFFERS D8); rewriting only the HTML would show one price and charge another. |
| LD21 | **Attached pricing (R2):** an attached landing's items mirror the product (price, compare-at, options, SKU, stock) read-only; its offers are its own (pack prices free) and every price that differs from `units × product price` shows an **override** chip with the product price; compare-at comes only from real product data. | R-D49 and sf §8: one price truth, campaign freedom, no invented savings. |
| LD22 | **Experiments (R3) refine R-D47 with rf §1.8:** Fair test = always-valid sequential inference (mSPRT, peeking allowed); in-page arms (headline, hero, one non-form section) are all in the HTML and chosen by a ≤ 450 B head script before first paint; offer-display and whole-version arms are **URL splits** (no cookies exist on store hosts, core §C.9); prices and offer terms never vary (pricing fingerprint equality). | Honest statistics with real seller behaviour; cacheable HTML; no flicker; no cookie assignment possible. |
| LD23 | Auto-optimize weights change **at most once a day** and are baked into the HTML by a re-render (`render_jobs` reason `experiment`, core §D.5). | HTML stays static and cacheable; the frozen runtime needs no fetch. |
| LD24 | **Upsell chain (R3):** ≤ 2 more steps after today's one-click upsell (accept → add-on, decline → downsell), per-step signed tokens, every window anchored to the order time, accepted lines in `orders.items.chain`. Today's single upsell is untouched. | rf/sf L6; the agent must see every added line before the call. |
| LD25 | **Per-city fees on landing pages (LP-16, R3) need runtime_v 3** (a `landing-v3` chunk, config v3, a PHP template v3), a core contract step; until then landing pages charge their flat page fee. | R-D22, R-D43: the v2 runtime computes the shown total `st` with the flat fee. |
| LD26 | Shopper strings ship in ar (Darija-friendly) / fr / en in R1; owners override texts through message templates. Landing admin screens are `en` in R1 except the **Leads inbox and every template agents send** (ar/fr/en), because agents use them (core D36). | Owner rule 4; agents are Moroccan. |
| LD27 | **No tenant code:** chunks, data blocks and experiment arms are generated by the platform; owner text is inserted with `textContent` only; templates are plain text with `{var}` placeholders. | PUB-25, core §C.9 (shared origin until S mode). |
| LD28 | **Exports keep what needs no server:** the delivery line and the thank-you blocks ship in every export; the tracking link only in connected exports (absolute URL to the store's tracking page); WhatsApp order, test links and experiments are live-only. | Static and PHP exports have no platform API; connected exports already post to it (`src/lib/export/server.ts:104-111`). |
| LD29 | **`policies` is the single source of every promise** (legal pages, thank-you steps, FAQ defaults, AI prompt and guard, call script, tracking "your rights" line). Morocco's 7-day withdrawal right (Law 31-08) is shown as a note **[needs legal review]**, never as an invented store policy. | GEN-08; ai.md AI-§D.2 rule 3 consumes it; core D39. |
| LD30 | **Releases:** R1 (P3) wave 1 = LP-01…LP-06, LP-20…LP-22; wave 2 = LP-11, LP-12, LP-18, LP-19. R2 (S1) = LP-07, LP-08, LP-23. R3 (D3) = LP-09…LP-16, LP-24. LP-17 later. Accepted by the core (§L.2 rows LP-11, LP-12, LP-18 … LP-24; §K.2 P3 waves; merge order P3 wave 2 after P6). | rf §3.2 raises; each raise is S; the R1 exit criteria (core §K.2) do not depend on wave 2 except the wow demo (core exit criterion 12), which needs the test link and the address card. |
| LD31 | **The quality contract is enforced by three gates in one registry, and this part owns the honesty gate.** `src/lib/render/prepublish.ts` (core §M.1) runs `budget` (core, DB C2, C3, F1, F5, R1, R4, R5, K2, I1), `design` (P6, DB N1, N2, N8 and the hard rows of C, T, K, I, R, RTL) and `landing` (P3, `src/lib/render/prepublish/landing.ts`: DB D1, D2, I4, I5, LP-21, sample proof, promises). A failing check answers `{ ok: false, error: "budget_blocked" \| "design_blocked" \| "honesty_blocked", items: GateItem[] }`; honesty has **no warn mode**. LAN-§3.4 maps every baseline target to its gate, owner and test. | design-baseline §4: the checklist runs only in the browser today (`src/lib/editor/checklist.ts:69-227`); nothing server-side refused a 27-section, 170 KB page with invented stats. Core D51, D52. |
| LD32 | **The order form is the part of the page this track owns, and it carries the fold and form targets:** order form within the first 3,000 px at 390 (DB F1; DES-§5.2 I2 = 3.0 screens), default-state height ≤ 1,100 px (offer → name → phone → city → submit; address and note collapsed or after the call), per-piece options only when the product declares variants and single-value pickers hidden (DB F2), visible input boundaries at ≥ 3:1 on every variant (DB F3), the post-purchase upsell only on the thank-you page (DB F4; the Offers v2 **order bump** stays a frozen pre-submit feature, generator default off, one compact row ≤ 56 px), no kicker on the form heading, ≤ 4 reveal nodes, no frosted glass inside the form, exactly one primary button. | design-baseline §3.9, §5.9: the form sat on screen 14-17 and was 2,840 px tall; the `minimal` variant had underline-only inputs; "Trente secondes, on s'occupe du reste" was contradicted by a 2,800 px form. |
| LD33 | **Every number on a landing page traces to one merchant field, and the same fact never shows two values** (DB D1, D2): `auditNumbers(doc, facts)` (LAN-§6.4) classifies every numeral in visible text and in numeric section data against `allowedNumbers` (`src/lib/ai/guard.ts:52`: facts, price, compare-at, units, fee, delivery days, policy windows, countdown end, stock typed by the owner); anything else is `honesty:D1`; two values for one fact class is `honesty:D1` too. Stats, counters, ratings and review counts never render from a library (`honesty:D2`). | design-baseline §3.7: "30 s" vs "40 s" vs "30 s et c'est prêt" on one blender page; "+9 400 pièces" vs "1 000 colis"; "4,7 (312)" on every hero. Owner rule 4. |
| LD34 | **Kicker-free COD surfaces.** The order form, the thank-you page, the tracking page and every add-on UI render no eyebrow label (`PageCopy.form.kicker`, `src/lib/ai/copy-schema.ts:148`, is kept optional and ignored by the renderer); their headings are the title alone. This frees the page kicker budget (≤ ⌈sections/3⌉, ra §9.9, DES-§3.2, rubric §4.7) for the sections that need one. | ra §1.3 finding: a required kicker in 15 sections is the "eyebrow above every section" tell (design-baseline §3.5: ~22 label pills per page). |
| LD35 | **Floating layers obey one rule the sticky bar keeps:** ≤ 1 fixed bar + ≤ 1 float, fixed UI ≤ 88 px of 844, the sticky bar hidden while any in-flow primary CTA is ≥ 50 % visible, the WhatsApp float collapsing into the bar while the bar shows (DB R7, keep-list item 3). The bar's hide/show is decided by the frozen chunk's existing `IntersectionObserver` on the hero CTA (unchanged) plus a CSS-only rule on `[data-lp-cta-visible]` set by the `assist` chunk (LAN-§5.4), never a second script in the frozen chunk. | design-baseline §3.6: sticky bar + WhatsApp bubble + in-section CTA on every mid-scroll crop, ≈ 130 px of 844 eaten. |
| LD36 | **Countdowns, stock and urgency: one source, one place, real dates.** A countdown renders at most once per page (announcement bar or urgency block, never both: DB R3 is design's gate, this part supplies the `urgency` data rule), only from `offers.urgency.countdownEnd` or (R3) a `page_schedules.end_promo`, never moves back (LD18), and the runtime hides it when it expired (`src/landing/runtime/countdown.ts:5`, unchanged). Stock figures only from the owner's `stockLeft`, stale after 14 days (warning), 0 is a Store Health trust issue. Generators, presets and AI never write either. | LP-21; EU UCPD; design-baseline §3.5 (countdown in three places), §3.7. |
| LD37 | **The Director upgrades the draft; the engine and these gates keep the guarantees.** The landing part contributes the **COD invariants** the Director's rubric scores as hard (ra §1.3 R9): hero CTA → `#order` within 3 screens, offers before the final CTA, the delivery line present when zones are on, WhatsApp only when a number exists, no fake urgency, the fold contract. They are the same checks LAN-§3.4 lists, so an instant engine draft and a Director-refined page meet one standard. | ra §1.2 (the instant path stays the product when cloud AI is off); brief item 16. |
| LD38 | **Thank-you and tracking pages have their own design budgets** (they are this part's HTML, not a section plan): ≤ 1 aurora field (the hero's, `src/landing/thankyou/ThankYou.tsx:347`), 0 glass surfaces, ≤ 8 reveal nodes, one primary action (the confirm pill or the upsell "add"), no decorative dots, no numbered steps ("1 / 2 / 3" labels are banned; the timeline shows verbs), tabular lining numerals on every id, price and phone, `<bdi dir="ltr">` isolates. | DB R4, R5, R8, T1, RTL1, RTL5; rubric §9.F (no "Step 1/2/3", no decorative dots); core §I.8 rule 8. |
| LD39 | **The three-minute demo is this part's acceptance for wave 2** (rf §4; core §K.2 exit criterion 12): publish ≤ 3 s, the address card with the test link, LCP ≤ 2.5 s on 4G at 390 px, submit ≤ 1 s, thank-you "Confirm on WhatsApp", a TEST chip in the queue, revenue 0. LAN-§3.8 lists the steps P3 contributes to `scripts/qa/wow-demo.ts`. | rf §4 checks 1, 2, 4, 5; nothing on the landing path may wait for a model. |
| LD40 | **Campaign Kit and short links are edited under `campaigns.write`** (core §A.3.1, granted with `pages.write` to owner, admin, editor), minted against the gauges `campaigns` (`campaigns_max` 20 live or paused) and `short_links` (`short_links_max` 200) through `chargeUsage` (core §A.4, §D.7); revision 1's "`pages.write`" and "500 links / 200 campaigns in code" are superseded. | One permission per intent; quotas are entitlements the owner edits in the console, not constants. |

Glossary: **add-on chunk** = a runtime script outside the frozen landing/thanks chunks (LAN-§5). **zone** = an owner-typed
group of cities with an ETA range, an optional fee and a "not served" flag. **lead** = a partial order captured before
submit (kind `form`) or a WhatsApp-order intent (kind `whatsapp`). **kit** = the Campaign Kit of one page. **arm** = one
variant of an experiment. **attached landing** = a landing page whose `pages.product_id` points at a catalog product (R2).
**gate item** = one `GateItem` of core §M.1 (`{ id, level, title, detail?, vars?, field?, sectionId?, fix? }`); ids of this
part start with `honesty:`. **fold** = the first 844 px at 390 px wide (DB C2). **test session** = a visit whose URL carried
a valid `sg-test` token (LD16).

---

## LAN-§1 Feature map: scope, release, track, acceptance

Release and track per core §L.2 unless LD30 says otherwise. "Wave" splits the P3 track in R1 (wave 2 starts once wave 1
is merged). Acceptance here is the summary; the section holds the full list.

### LAN-§1.1 RESEARCH ids (LP-01 … LP-17)

| ID | Feature | Rel. | Track | Scope | Acceptance (summary) | Spec |
|---|---|---|---|---|---|---|
| LP-01 | Keep every landing feature, store-scoped, **and meet the quality contract** | R1.0 + R1 | T3, T4 (R1.0), P3 (+ P6 for section-plan targets) | The TENANCY-MAP §8.3 inventory, each item's tenancy behaviour; frozen contracts; the DB §5 targets mapped in LAN-§3.4, the order-form contract LAN-§3.5, the COD invariants LAN-§3.7 | Every row of LAN-§3.1 has its test green; `test:money`, `test:offers`, `test:php`, render-check budgets unchanged; the two-store attack suite covers pages, versions, leads, exports, media refs; `qa:publish-gates` refuses the design-baseline worst page (`budget_blocked`) and a sample-review page (`honesty_blocked`) and passes the §6 keep-list pages; the 41-page render set passes F1-F4 on every form variant | LAN-§3 |
| LP-02 | Block publishing sample and material-less proof, library figures and contradictory numbers | R1 | P3 | Proof sections with `sample: true` → publish error; proof material (two images, a video, ≥ 3 assets, merchant credits, anchored hotspots) required; `auditNumbers` (D1, D2); attestation on clearing; no `aggregateRating` JSON-LD (T3) | Publish of a doc with a visible sample proof section answers `{ ok: false, error: "honesty_blocked", items: [{ id: "honesty:sample", sectionId }] }`; the blender fixture ("30 s" / "40 s") answers `honesty:D1` naming both fields; a `beforeAfter` with one image answers `honesty:I4`; clearing `sample` writes `page.proof_attested`; render of any Store Gen page has no `aggregateRating` | LAN-§6 |
| LP-03 | Delivery promise line by city | R1 | P3 | `delivery_zones` editor, store calendar, ETA as dates (raised), line in the form, not-served handling, server texts | Empty zones → no line anywhere (render-check); ETA selftest green on cut-off, weekend, holiday, Ramadan time-zone cases; the line's fee equals the page's charged fee on 100 % of fixtures | LAN-§7 |
| LP-04 | Thank-you: confirm on WhatsApp + expectation block + tracking link | R1 | P3 | `assist-ty` chunk, store confirmation numbers and hours, templates, policy-driven steps | The prefilled text contains the order id; the expectation block shows the store's real number or nothing; the tracking link opens the order's status without a lookup | LAN-§8 |
| LP-05 | Order tracking page | R1 | P3 | `/track` with three proofs, status timeline, change/cancel requests before shipping, `noindex`, rate limits | Identical answers for unknown order / wrong digits (status, body, timing class); no full phone or address in any response; a request writes one `order_events` row and one notification | LAN-§9 |
| LP-06 | Abandoned-lead recovery inbox | R1 | P3 | Leads per store with selection, statuses, assignment, one-tap WhatsApp, attribution, consent per market, retention | A lead is listed ≤ 2 s after the beacon; recovered/converted attribution matches LD12 on the fixture set; EU store pages carry no `endpoints.lead`; leads > 30 days are purged | LAN-§10 |
| LP-07 | Attach a landing to a catalog product | R2 | S1 | `pages.product_id`; mirrored items; own offers with override chips; `noindex` + canonical to the PDP by default; republish on product change | A product price change republishes every live attached landing as a `sync` version in ≤ 1 cron tick; no attached landing can publish a compare-at that is not real | LAN-§17 |
| LP-08 | Campaign vs inherit theme mode | R2 | S1 (+ S2) | `pages.theme_mode` (`store` / `campaign`), brand-radius warning (design.md DS15) | An inherit page re-renders in place on a brand change; a campaign page keeps its genes | LAN-§17.6 |
| LP-09 | Experiments (Fair test + Auto-optimize) | R3 | D3 | One engine for landing and store pages; mSPRT; Thompson; in-page and URL-split arms; guardrails | 10,000 simulated A/A tests give ≤ 5 % false "decided" under daily peeking; a price difference between arms is refused; no flicker (arm chosen before first paint) | LAN-§18 |
| LP-10 | Upsell → downsell chain + cross-store upsell | R3 | D3 | ≤ 2 steps after the upsell, per-step tokens, real windows, catalog products in "both" mode | Each step's price equals the version's; an expired window refuses; chain lines appear in the order text and the Sheet row | LAN-§19 |
| LP-11 | Live "Order on WhatsApp" option | **R1** (raised; core §L.2, §C.4 `POST /api/public/wa`) | P3 wave 2 | Server-priced WhatsApp intent → `wa.me` with the real total, the page fee, the zone ETA when a city was picked and a `WA-` reference; "to confirm" list; agent conversion with `source = 'whatsapp'`; intent ↔ form-order dedupe | The total in the message equals the server's `orderTotals` for the same selection on 100 % of fixtures; a tampered body cannot change the total; conversion re-prices on the server; an intent whose phone orders through the form within 72 h is marked `converted` | LAN-§11 |
| LP-12 | Short links with UTM presets | **R1** (raised; core §C.4.1 `/go/<code>` R1, `short_links` 0005) | P3 wave 2 | `/go/<code>` on the store host: 308 + `private, no-store`, presets, click counts, pause, `short_links_max` | The query string reaches the target byte for byte (V7 rule); `utm_` present → untouched; paused → 410; a code from store A never resolves on store B; the 201st link of a `beta` store opens the limit sheet | LAN-§12 |
| LP-13 | Scheduled campaigns | R3 | D3 | Scheduled publish of a version, unpublish, promo end driving the countdown | A schedule fires within one cron tick of its time; the countdown end equals the schedule end; a missed tick catches up once | LAN-§20.1 |
| LP-14 | Video-first hero, PDP video, UGC strip | R3 | D3 (+ D4 sections) | Poster as LCP, deferred 9:16 clip, one video at a time | LCP element is the poster on 100 % of fixtures; no video bytes before first interaction or idle; reduced motion = poster only | LAN-§20.2 |
| LP-15 | Per-page analytics with delivered rate | R3 | D3 | Views, form starts, orders, confirmed, delivered, refusal by offer, UTM, variant, city | Every rate shows its n and hides below n = 20; numbers equal the SQL fixtures; no customer data on the screen | LAN-§20.3 |
| LP-16 | Per-city fees charged on landing pages | R3 | D3 (+ core contract step) | runtime_v 3 chunk, config v3, PHP template v3 | Runtime, server and PHP totals equal on every zone fixture; v2 pages unchanged | LAN-§20.4 |
| LP-17 | Two-step form, quizzes, advertorial kind, build-your-box / multiple bumps, honest exit popup, section visibility by UTM or device, opt-in real "orders today" counter | later | — | Each validated with Experiments first; fake viewers, fake purchase toasts, resetting countdowns and invented stock are rejected outright | Own acceptance when scheduled | LAN-§21 |

### LAN-§1.2 Operator-grade additions (LP-18 … LP-24)

| ID | Feature | Rel. | Track | Scope | Acceptance (summary) | Spec |
|---|---|---|---|---|---|---|
| LP-18 | Campaign Kit (= rf SF-01) | R1 (core D63) | P3 wave 2 (+ P7 `ad.brief` and `callcenter.script` behind the Cloud AI flag, P5 the confirmation template kind, P2 the address-card entry) | `campaigns` (0005), kit screen, WhatsApp / script / brief templates, one short link per channel, pixel plan, read-only share page `/kit/<token>`, results per angle, `campaigns_max`, `offers_hash` staleness | A kit compiles with Cloud AI off in < 300 ms; 0 invented numbers and 0 banned words in every brief of the 60 eval fixtures, 3 distinct structure tags per brief (`test:kit`); "page changed since" shows after a republish with another pricing fingerprint; revoking the share → neutral 404; pausing → the kit's links answer 410 | LAN-§13 |
| LP-19 | Test-order links (= rf SF-05) | R1.0 plumbing (T3) / R1 | P3 wave 2 (mint, entries, lead marking) + T3 (public path, test render) + P4, P5, P7 (exclusions) | `mintTestLink`, `?sg-test=<token>` (core D54), pixel-free on-request render with the "test" banner, `is_test` on orders and leads, exclusions everywhere, "Delete test orders" (P4) | A test order never reaches Sheets, CAPI, Telegram (except "[TEST]"), `stats_daily`, `stats_version_daily`, `agent_stats_daily`, customer counters (except `test_count`), finance or learning tables; the test page and its thank-you contain no pixel script and carry the banner; an unsigned, expired or foreign-store token is an ordinary visit; `test:test-orders` and the two-store case "A's token on B" are green | LAN-§14 |
| LP-20 | Slug history redirects | R1 | P3 (+ T3 route, T4 `recordSlugMove`) | `page_slug_history` (0005); 308 from old slugs for 12 months; reuse rules; hits flushed by `links.flush` | An old slug answers 308 to the new path with the raw query; a reused slug serves the new page; history never crosses stores | LAN-§15.1 |
| LP-21 | Honest time and stock guards | R1 | P3 | Countdown move rules (LD18) as a hard gate, countdown once per page (data rule), > 30 days warning, stock staleness warning and 0-stock health issue, generator/AI write ban | Each rule has a checklist fixture and a `test:prepublish` fixture (`honesty:countdown_reset` refuses, `countdown_extended` audits); the generator fixtures never set `countdownEnd` / `stockLeft` | LAN-§6.2 |
| LP-22 | Page vitals in the pages list | R1 | P3 | 7-day views, orders, conversion and confirmation rate per page from existing stats | Numbers equal the SQL fixture; rates hidden below n = 20 with "needs more visits" | LAN-§15.2 |
| LP-23 | Copy a page to another store I belong to | R2 | S1 | Duplicate a page into a second store with media re-ingested under the target store's ids | The copy references only the target store's assets; requires `pages.write` in both stores; audit rows in both | LAN-§17.7 |
| LP-24 | Saved sections and house blocks | R3 | D3 | Save a configured section; reuse across the store's pages; shared footer/guarantee blocks | A saved block inserted in two pages renders identically; editing the block offers "update everywhere", which republishes exactly the listed pages as `sync` versions | LAN-§21.2 |

### LAN-§1.3 Signature features assigned to this track (core §K.2 ownership paragraph, §L.2 SF rows)

| ID | Feature | What this track owns | Others | Acceptance (summary) | Spec |
|---|---|---|---|---|---|
| **SF-01** Campaign Kit | = LP-18 | everything in LAN-§13; `compileKit(input)` (P0 stub); `/kit/<token>` page; `campaigns`, `short_links` | P7 `ad.brief`, `callcenter.script` (template fallback); P5 the IN-05 template kind; P2 the address-card entry "Create a campaign" | LP-18 row + the kit is reachable from Create, the page row menu and the end of onboarding | LAN-§13 |
| **SF-05** Test-order mode | = LP-19 | `mintTestLink`, `src/lib/testing/**`, `renderTestDocument()` contract, lead and intent marking, the address-card entry "Open a test order", `test:test-orders` | T3 public path + test render (R1.0), P4 TEST chip / KPI exclusions / "Delete test orders", P5 Sheets / CAPI / Telegram exclusions, P7 learning exclusions | LP-19 row + rf §4 check 5 (dashboard revenue stays 0 after a test order) | LAN-§14 |
| **SF-08** Delivery Promise (landing side) | = LP-03 + ST-17 | zones, calendar, `etaWindow`, the `assist` line, `zoneLineFor`, `zonesForCheckout` (consumed by storefront in R2) | S1 the store checkout side (R2, STO-§12.3, §15.8) | LP-03 row + a shopper picking a served city sees a dated window within 180 ms, never a fee other than the page's | LAN-§7 |
| **SF-10** Experiments with honest statistics | = LP-09 | the engine (`src/lib/experiments/**`), mSPRT, Thompson, exposures, arms, screens; storefront reuses it for store pages | S1 / D3 storefront surface; P7 `bumpVersionStats` | LP-09 row + 10,000 simulated A/A tests peeked daily ≤ 5 % false "decided" | LAN-§18 |
| **SF-03** Store Health (rules) | PL-18 raised | `src/lib/health/rules/landing.ts`: setup, trust and conversion rules of LAN-§23.7 | P1 engine and job, P2 ring | every rule has a fixture with and without `minN`; no rule reads another store | LAN-§23.7 |
| **SF-06** Pulse (contributor) | — | `src/lib/pulse/contributors/landing.ts`: `leadsDue`, `leadsNew`, `waIntentsNew` | P2 route, poller, registry | the contributor answers in ≤ 50 ms and a failure omits its keys | LAN-§23.8 |

---

## LAN-§2 Data: refined tables, new tables, settings keys

Conventions are core §D.1 (`id26`, `ts`, `cents`, `storeRef`, guarded hand-written SQL, every tenant index starts with
`store_id` except queue claim indexes, which follow the `render_jobs` precedent). The maintainer writes the SQL from the
column lists below, which core §D.5 names as the final lists for `campaigns`, `short_links`, `page_slug_history` and
`delivery_zones` ("LAN-§2.2 and LAN-§2.1 are the final lists") and core §D.6 for the 0007 tables ("refined LAN-§2.1").
`orders.is_test` and `leads.is_test` are **core-owned** columns (core D54, §D.9): this part reads them and never refines
them. Revision 2 changes no column of revision 1; it records each table's core decision.

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

**`short_links` (core §D.5, 0005; moved from 0007 by request Q6, accepted, core D63)**:

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

Columns on tables other parts own, as decided by core revision 2 (requests Q2, Q4, Q8, Q21, Q24, Q27, Q32 all accepted):

| Table | Migration | Change | Core decision |
|---|---|---|---|
| `orders` | 0005 | `is_test boolean NOT NULL DEFAULT false`, index `orders_store_test_idx (store_id, is_test, created_at)` | **core-owned** (D54, §D.2 0005, §D.9 "including `orders.is_test`"); set only by the public path from the test token |
| `orders` | 0007 | index `orders_store_variant_idx (store_id, variant_key, created_at)` (`variant_key` is 0006, AI-12) | accepted (core §D.2 0007; experiment results, LAN-§18.6) |
| `orders.items` JSON | 0007 | optional `chain: UpsellRecord[]` (additive; readers that don't know it ignore it, like `upsell.unit`, `src/lib/orders/upsell.ts:82-86`) | accepted (core §D.2 0007, §K.5: the order text, the Sheet row and the CSV render it) |
| `leads` | 0005 | `phone` NULL-able (guarded `MODIFY`), `kind`, `ref`, `sel`, `total_cents`, `version_id`, `next_at`, `lost_reason`, `converted_via`, `updated_at`, the four indexes | accepted (core §D.2 0005, §D.8 "three guarded type changes"); `leads.is_test` core-owned |
| `page_versions` | 0006 | `kind` enum append `'sync'` | accepted (core §D.2 0006; `sync` versions pruned first) |
| `pages`, `page_versions` | 0007 | `addons longtext NULL` (`PageAddons`, LAN-§19.2); the version copy is written at publish | accepted (core §D.2 0007, §K.5) |
| `render_jobs` | 0005 | `reason` enum append `'store_info'` | accepted (core §H.3: treated like `brand`, in place, D50) |
| `page_versions` | 0005 | `generation_source`, `critic_picks` (ai's provenance columns) | not this part's; the publish listener of ai writes them (core §D.2 0005); the landing listener never touches them |

### LAN-§2.3 Store settings keys owned or extended here (core §D.10)

Each schema is an extension file `src/lib/settings/keys/<key>.ts` (core §K.3). None of these values is secret. Core
§D.10 records the three keys as this part's: `policies` (landing / R1), `checkout` (landing R1 part in
`src/lib/settings/keys/checkout.ts`; storefront adds `src/lib/settings/keys/checkout-store.ts` in R2 and the registry
merges both into the one `checkout` key, STO-R16), `landing` (landing / R1, request Q9 accepted). The core creates each
key in the registry at C0 with the fields below as its first schema (never `passthrough()`), so P3 widens the schema
without renames.

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

The core-owned `store` key carries the fields LP-04 needs (core §D.10 row `store`: "the LP-04 block `confirmation:
{ callerPhone?, whatsapp?, hours?, withinHours? }`; `withinHours` omitted = no promise, never invented"); the exact shape
this part reads (request Q10 accepted):

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

## LAN-§3 Today's landing features under tenancy, and the quality contract every landing page meets (LP-01)

Every feature of TENANCY-MAP §8.3 stays, with no regression and no behaviour removed. Most of the tenancy work lands in
R1.0 (tracks T3 EDGE and T4 SCOPE, core §K.1); LAN-§3.1 is the landing part's checklist that each one works per store.
"Test" names the gate that proves it (core §J); a row without its test green blocks the R1 exit. LAN-§3.4 … §3.8 (new in
revision 2) are the **quality contract**: the measured baseline targets as they apply to a landing page, who enforces each
one, what this track builds for them (the order form, the thank-you and tracking pages, the honesty gate), the COD
invariants the Director's rubric shares with the gates, and the three-minute demo as acceptance.

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

The checklist item ids below equal the gate item ids of LAN-§3.2.1, so the publish dialog is never the first time an
item appears (core §M.5). `LandingCheckContext.facts` (added in rev 2) carries the merchant facts, prices and policy
numbers `auditNumbers` needs in the browser: `facts: { allowed: string[]; byClass: Record<NumberClass, string | null> }`
built by the editor's server preload from the same `allowedNumbersFor(doc, store)` the gate uses.

| Id | Level | Condition | Fix target |
|---|---|---|---|
| `honesty:sample` (per section) | **error** (proof types) / warning (others) | LD17: `reviews`, `socialProof`, `stats`, `beforeAfter` visible with `sample: true` | the section |
| `honesty:I4` (per section) | **error** | a visible proof section without its material: `beforeAfter` with < 2 distinct asset ids, `video` without `src` or `url`, `gallery` / `socialProof:ugc` / `lookbook` with < 3 distinct assets, a photo credit whose name is not in `doc.product.credits` (merchant-typed) | the section |
| `honesty:I5` (per section) | **error** | `showcase:hotspots` (or any variant with callouts) whose anchors were not placed by the owner (`data.hotspots[].anchor.by !== "owner"`) | the section |
| `honesty:D1` (per field) | **error** | a numeral in visible text or numeric section data outside `allowedNumbers`, or two different values for one number class (LAN-§6.4) | the field |
| `honesty:D2` (per section) | **error** | `stats`, `socialProof:counter`, `reviews:summary` or `product.rating` rendering a library default or an unattested value | the section / Product tab |
| `honesty:rating_unattested` | warning | `product.rating` set; the builder asks the attestation when the value is typed (LAN-§6.1) | Product tab |
| `honesty:countdown_reset` | **error** | the live version's `countdownEnd` already passed and the doc's end is later (LD18) | Offers tab |
| `honesty:countdown_twice` | **error** | the countdown is rendered by two sections (`announcement` + `urgency`, or `cta` + `urgency`) | Offers tab |
| `urgency:extended` | warning (audit `page.countdown_extended` on publish) | the live end is still running and the doc's end is later | Offers tab |
| `urgency:far` | warning | `countdownEnd` more than 30 days ahead | Offers tab |
| `urgency:stock-stale` | warning | `stockLeft` unchanged for > 14 days on the live page | Offers tab |
| `honesty:promise` (per field) | **error** | a delivery time, fee, "free delivery", return, exchange, inspection, warranty or "we call within N h" claim not backed by `delivery_zones`, `offers.shippingFee` / `freeShipping`, `policies` or `store.confirmation` (`policyAllows`, LAN-§3.3) | the field + `appHref("/settings/policies")` |
| `delivery:zones-empty` | warning | zones off or empty in a market with a city list ("Shoppers see no delivery date") | `appHref("/settings/delivery")` |
| `policies:unreviewed` | warning | `policies.reviewedAt` is null ("The thank-you page and the AI only promise what your policies say") | `appHref("/settings/policies")` |
| `thanks:no-caller` | warning | thank-you expectation on and no `confirmation.callerPhone` | `appHref("/settings/general")` |
| `wa:no-number` | error | `landing.waOrder.enabled` and neither `form.whatsapp.number` nor `store.whatsapp` | `appHref("/settings/general")` |
| `form:F1` … `form:F4` | **error** (F1, F3) / warning (F2 single-value picker) | the order-form contract of LAN-§3.5, computed from the doc and the height model (`src/lib/design/heights.ts`, DES-§5.3) | Form tab |
| `store:contact`, `store:legal` | warning | unchanged rules, fix links through `appHref` | — |

Revision 1's ids `sample:<sectionId>`, `rating:unattested`, `urgency:reset` are renamed to the `honesty:` ids above
(one id in the panel and in the dialog).

#### LAN-§3.2.1 The honesty gate (`src/lib/render/prepublish/landing.ts`, P3; core §M.1, §M.3, D51)

The **server** enforces every `error` row at publish (a checklist in the browser is not a guard). Revision 1 asked for a
gate registry (Q13); the core merged it with design's into **one** registry, `src/lib/render/prepublish.ts`, with the
item type `GateItem` and the codes `budget_blocked` / `design_blocked` / `honesty_blocked` (core §M.1). This part
registers one check and one listener:

```ts
// src/lib/render/prepublish/landing.ts (P3)
import { registerPrePublishCheck, registerPublishListener, type PrePublishCtx, type GateItem } from "@/lib/render/prepublish";

export type HonestyGateId =
  | "honesty:sample" | "honesty:I4" | "honesty:I5" | "honesty:D1" | "honesty:D2"
  | "honesty:countdown_reset" | "honesty:countdown_twice" | "honesty:promise" | "honesty:stock_untyped"
  | "form:F1" | "form:F3";                                   // form rows live here because P3 owns the form section
export interface LandingGateInputs { zones: DeliveryZoneRow[]; policies: StorePolicyFacts; confirmation: ConfirmationValue; checkout: CheckoutValue; landing: LandingValue; attested: ReadonlySet<string> /* "<sectionId>" | "rating" from audit page.proof_attested */ }
export function landingGateItems(ctx: PrePublishCtx, inputs: LandingGateInputs): GateItem[];   // pure over its inputs, ≤ 40 ms
registerPrePublishCheck("landing", async (ctx) => {
  const items = landingGateItems(ctx, await loadLandingGateInputs(ctx.scope));
  return items.some((i) => i.level === "hard") ? { ok: false, code: "honesty_blocked", items } : { ok: true, notes: items };
});
registerPublishListener("landing", async (ctx) => { /* kit staleness (offers_hash) + markHealthDirty(ctx.scope.storeId) + attribution cache reset; never throws */ });
```

- Every `honesty:*` item is `level: "hard"` (honesty has **no warn mode**, core §M.1 rule 3); `urgency:*`, `delivery:*`,
  `policies:*`, `thanks:*` and `form:F2` are notes (`level: "soft"`), listed by the dialog and stored as notes on
  re-renders (core §H.3).
- `GateItem.title` / `detail` are message keys (`landing.gate.<id>`, LAN-§6.5, ar/fr/en, `test:i18n-coverage`); `vars`
  carry the measured value and the limit ("3 photos needed, 1 given"); `fix` deep-links the builder tab or section.
- The check runs in `block` mode for publish and every export (an export is a publish to someone else's server, core
  §M.1 rule 5) and in `warn` mode on re-renders (notes only, never a refusal of a live page).
- `prev` (the live version's doc) comes from `ctx.prev`; `attested` is read from the audit log
  (`page.proof_attested` rows of this page, cached 60 s per store).
- `test:prepublish` (core, `src/lib/render/selftest-prepublish.ts`) imports this part's fixtures
  (`src/lib/render/prepublish/landing.fixtures.ts`): a sample-review page, a one-image before/after, a still "video",
  the blender "30 s / 40 s" page, "4,7 (312)" from the library, a moved-back countdown, a countdown in two sections,
  "livraison gratuite" on a page with a 29 DH fee, a form with underline-only inputs; each answers `honesty_blocked` with
  exactly the expected ids; the keep-list pages (design-baseline §6) answer `{ ok: true }` with 0 hard items.

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

### LAN-§3.4 The quality contract: every design-baseline target as it applies to a landing page (rev 2)

The baseline measured 39 landing pages at 4.3/10: one section order, one hero grammar on 23 pages, 2-3 photos in 40-64
slots, invented proof on every page, a 32-38-screen scroll with the form on screen 14-17, 58-68 buttons, 80-96 glass
rules, 343-397 reveal nodes (design-baseline §2-§3). Revision 2 of the core turns the hard targets into publish gates
(core §M, D52) and leaves the soft ones to the quality score. This table is the landing view of **every** §5 target:
who enforces it, where this track contributes, and the test that proves it on landing pages. "Gate" = the core §M check
(`budget` core, `design` P6, `honesty` P3); "Q" = soft, lowers the design quality score and shows in Store Health;
"engine" = guaranteed by construction in design's generator (P6) and verified by `test:design`.

| Target (DB) | Rule on a landing page | Gate / owner | What this track builds | Proven by |
|---|---|---|---|---|
| N1, N2, N8 novelty | genome `d ≥ 0.40` in the niche, `≥ 0.25` platform-wide, `d_page ≥ 0.30` vs the store's last 10 pages; headline shingle share ≤ 25 % | `design` hard (core §M.4), P6 | nothing; the kit's `ad.brief` angles reuse the structure tags P6 produces | `test:design`, `test:design-db`, `qa:wow-demo` (two stores from the same photos `d ≥ 0.25`) |
| N3 … N7 variety | ≥ 60 distinct orders per 100 pages, no 4-section subsequence > 50 %, hero family ≤ 30 % per niche, product and locale enter the RNG | engine, P6 (DES-§5 grammar replaces `TEMPLATES`, `src/lib/generator/plan.ts:90-97`) | the order form keeps its 4 variants and never forces a position: I2 (form ≤ 3.0 screens) is a grammar invariant, not a fixed slot | `qa:design-corpus` (140 plans) |
| C1 hero families | ≥ 6 families, one ≤ 30 % per niche | engine, P6 (`quiet`, `cinema`, `index` added to `src/landing/sections/hero/index.tsx:108-145`) | — | `qa:design-corpus` |
| **C2 fold contract** | product image, price, one primary CTA and the COD line inside the first 844 px at 390 for every hero family and locale | `budget:C2` hard, core + the hero family's declared fold layout (P6) | the **COD line** is this part's string (`form.reassurance` / "خلّص ملي توصلك" / "Vous ne payez qu'à la réception") and must be rendered by the hero price block, not only in the form; the sticky bar never counts as the fold CTA | `qa:publish-gates` (Playwright 390 × 844, ar and fr, every hero family) |
| **C3 length** | 8-14 in-flow sections, ≤ 12,000 px at 390 soft; > 16 sections or > 15,000 px hard; form starts ≤ 3,000 px | `budget:C3`, `budget:F1` hard, core; the height model DES-§5.3 | the form's height entry in the model (1.6 screens default, 1.3 when `fill = inline` and ≤ 2 offers); the thank-you page ≤ 3 screens | `test:prepublish` (a 27-section fixture refused), `qa:publish-gates` |
| C4 composition devices | ≥ 1 full-bleed moment, ≥ 1 boundary crossing, ≥ 1 quiet screen | Q, P6 | the order form may be the boundary-crossing element (`split` variant: the product photo crossing the panel edge, DESIGN.md §1.2) | `qa:design-corpus` |
| C5 opener grammar, kickers | ≥ 5 opener structures; eyebrow on ≤ 30 % of sections; kicker budget ⌈n/3⌉ | Q, P6 + P7 (`PageCopy` kickers optional, `src/lib/ai/copy-schema.ts:113-151`) | LD34: no kicker on the form, thank-you, tracking, add-ons | `test:copylib`, render-check (form heading has no `.lp-kicker`) |
| C6, C7 alignment, density | ≤ 2 centred sections; A-B-A-C density | Q, P6 | the form is start-aligned on mobile (labels above inputs, DB F3, rubric §4.6) | render-check |
| T1 numerals | `tabular-nums lining-nums` on every price, counter, phone, quantity | `design` hard (CSS lint), P6 | the form's price chips, summary, phone field, the thank-you order id and total, the tracking page ids: all `[data-num]` | render-check CSS lint on `.lp-of__*`, `.lp-ty__*`, `.lp-trk__*` |
| T2, T3, T4 Arabic display | ≥ 2 words per line, no stranded particles, `text-wrap: balance`, leading ≥ 1.25, no Reem Kufi display | `design` hard (T2, T3) / Q (T4), P6 | the form title, thank-you title and tracking title use the same `.lp-display` rules; no per-word reveal spans anywhere in this part's HTML | render-check ar fixtures at 390 |
| T5, T6 pairings and size | ≥ 8 pairings per archetype; hero ≥ 44 px at 390 | engine / Q, P6 | — | `theme:check` |
| T7, T8 bidi, watermark | `<bdi>` around Latin names in `[lang=ar]`; ghost word = the product chip token | `design` hard, P6 | every order id, phone, URL, `WA-` ref and price in this part's HTML sits in `<bdi dir="ltr">`; no ghost word on the form, thank-you or tracking page | render-check RTL fixtures |
| K1 … K8 colour | strategy gene, ≤ 2 full-bleed moments, pop derivation, one card tier, orange guard, dark-page contrast | `design` hard (K4, K5, K6 band, K7 AA) / `budget:K2` / Q, P6 | the form panel is the page's one card tier when `variant = card`; no nested card inside the form (`lp-bump` is a row, not a card); the thank-you hero slab counts as one moment | `test:theme`, `scripts/check-theme.ts`, render-check |
| **I1 reuse** | same photo ≤ 3 appearances (sticky bar and form thumbnail excluded); > 4 hard | `budget:I1`, core | the form thumbnail and sticky bar are the excluded slots; the kit reuses no page image | `test:prepublish` |
| I2, I3, I6 crops, cutouts, resolution | ≥ 3 crops, focal in the inner 80 %, cutout needs alpha, `pxWidth ≥ 1.5 × slot` | `design` hard, P6 | the form's product thumbnail declares its slot (`features.slots`: 72 px, 1:1) | `test:design` |
| **I4 proof material** | `beforeAfter` two distinct merchant images; `video` a file or URL; `gallery` / `ugc` / `lookbook` ≥ 3 assets; credits merchant-typed | **`honesty:I4` hard, P3** | LAN-§6.1 | `test:prepublish` fixtures |
| **I5 hotspots** | callouts only on merchant-placed anchors | **`honesty:I5` hard, P3** (anchor editor P6) | LAN-§6.1 | `test:prepublish` |
| I7 marquee clipping | word-safe duplication; no clipped glyph box (ar or Latin) | `design` hard (RTL6), P6 | the `wa.ready` line and the delivery line never truncate: `text-wrap: pretty`, no `text-overflow` | render-check clip gate |
| **R1 CTA count** | ≤ 6 primary CTAs (sticky = 1), ≤ 2 visible at once; > 8 hard | `budget:R1`, core | the form has exactly one `button[type=submit]`; the WhatsApp alternative is a text link, not a `.lp-btn`; the thank-you has one primary action | `test:prepublish` (DOM count) |
| **R2 offer duplication** | the pack picker renders once; it lives in the form | `design` hard, P6 (`offer` section ε when the picker is `tiers` / `visual`, DES-§5.1) | the form's picker **is** the offer section when `offer` is absent; the `cta` section never repeats packs | render-check: one `[data-lp-bundles]` per page |
| **R3 trust and urgency duplication** | trust strip once; countdown once with a merchant end; urgency as a chip in the form, not a section | `design` hard, P6 + **`honesty:countdown_twice`, P3** | the form's `CodChip` is the one urgency chip; the trust 3-up inside the form is removed (the `trustBar` strip is the one trust surface) | render-check: ≤ 1 `[data-countdown]`, ≤ 1 `.lp-trust` |
| **R4 glass** | ≤ 2 glass surfaces outside nav/sticky; > 4 hard | `budget:R4`, core | 0 `backdrop-filter` in the form, thank-you, tracking and add-on CSS; the sticky bar keeps its glass (excluded) with an opaque fallback | render-check CSS count |
| **R5 reveals** | ≤ 60 reveal nodes; > 120 hard; reveals on hero and section heads only | `budget:R5`, core | the form: ≤ 4 `[data-reveal]` (today 15 sites, `src/landing/sections/orderForm/index.tsx:76-285`); the thank-you: ≤ 8; add-ons animate height/opacity ≤ 180 ms, never a reveal | render-check DOM count |
| R6 radius ladder | 4 tiers chip < control ≤ card < media | `design` hard, P6 | the form's inputs use `--lp-radius-control`, the panel `--lp-radius-card`, chips `--lp-radius-chip`; the bump row has no radius of its own | `test:design` |
| **R7 floating layers** | ≤ 1 fixed bar + ≤ 1 float; fixed UI ≤ 88 px; bar hidden while an in-flow primary CTA is ≥ 50 % visible | `design` hard, P6 (`stickyCta`, `whatsappFloat`) + **P3 (`assist` sets `[data-lp-cta-visible]`, LAN-§5.4)** | LD35 | Playwright `delivery` step: scroll to the form → the bar hides; the float collapses while the bar shows |
| R8 tells | ≤ 1 device from the tell list per page; rotating stamp and scrapbook removed | `design` (slop ≥ 6 hard), P6 | no tell device in this part's HTML: no ghost word, chat-mock, stamp, marquee, big-number stat, phone-mock review, countdown outside the one place | `test:design` fixtures |
| R9 equal-card grids | ≤ 3 card grids, no two adjacent, ≤ 1 triplet | Q, P6 | the pack picker is a radio group, never a 3-card triplet with icon + title + text | — |
| **D1 numbers consistency** | one merchant field per numeric claim, one value everywhere | **`honesty:D1` hard, P3** | LAN-§6.4 `auditNumbers` | `test:honesty`, `test:prepublish` |
| **D2 no library figures** | stats, counters, ratings, reviews only from merchant data | **`honesty:D2` hard, P3** (library data stays `sample: true`, P6) | LAN-§6.1 | `test:prepublish` |
| D3 register lock (ar) | one register per page, FAQ Q and A alike | Q (hard when FAQ registers differ), P6 + P7 | this part's shopper copy (LAN-§24.2) ships in one register per locale: Darija-leaning ar with Arabic script, `vous` fr | `test:copylib` |
| D4 French slotting | `{product}` with gender / article metadata | `design` hard (grammar lint), P6 | the kit, the WhatsApp texts and the tracking summary use `offerName()` / `itemShort()` with the article from the doc, never "Ce que change Sérum" | `test:kit` |
| D5 specificity | ≥ 50 % of hero and benefit sentences carry a fact, a number, a sensory verb or a COD fact | Q, P6 | the delivery line and the COD line are COD facts the detector counts (DES-§9.6) | `test:design` |
| D6 lexicon | hype guard; ≤ 1 "!" per page | `design` hard on the list, P6 + P7 | this part's copy has 0 "!" and 0 em/en dashes (LAN-§24.2) | `test:copylib` grep |
| RTL1 … RTL8 | ranges, timers, phones in `<bdi dir="ltr">`; dual/plural forms; no rotated Arabic; price cluster one unit; addresses LTR; clip gate; logical properties; ar + fr at 390 and 1440 in CI | `design` hard (RTL1-7), P6 + **P3 for its HTML** | the countdown day label already uses `Intl.PluralRules` forms (`src/landing/runtime/countdown.ts:8-11`); the WhatsApp tab (`whatsappFloat:tab`) is removed from the pools by P6 (RTL3); the tracking page, thank-you and the delivery line pass RTL1, RTL4, RTL5 by construction | render-check ar fixtures; `qa:headers`; Playwright ar steps |
| **F1 form position and size** | top ≤ 3,000 px at 390; height ≤ 1,100 px default state | `budget:F1` hard (position), core; **`form:F1` hard (height), P3** | LAN-§3.5 | height model + Playwright `form` step |
| **F2 options** | per-piece options only with declared variants; one-value pickers hidden; per-piece rows collapsed behind a summary | **P3** (hard in the renderer: a one-value group is never rendered) | LAN-§3.5 | render-check `duo`, `tshirt`, `colors` fixtures |
| **F3 inputs** | visible boundaries ≥ 3:1 on every variant | **`form:F3` hard, P3** | LAN-§3.5 (`minimal` loses underline-only fields) | render-check contrast on `.lp-of__f input` per variant |
| **F4 upsell** | post-purchase upsell on the thank-you page only | **P3** (the thank-you owns it; the frozen bump is pre-submit by definition, LD32) | LAN-§3.5, LAN-§8 | render-check: no `.lp-upsell` in the form |
| **F5 weight** | ≤ 90 KB gz HTML soft, 140 hard; ≤ 16 `<picture>`; ≤ 2 font families / 4 files; lazy-load below the form | `budget:F5`, core | add-on bytes count toward the `page` and `thanks-page` caps (LAN-§5.2); the `lp-assist` data block ≤ 3 KB; the delivery line adds no `<picture>` | render-check budgets |

Soft items of this table that fail on a live page become Store Health **design** issues (P6's rules) or **trust**
issues (P3's rules, LAN-§23.7); hard items never reach a live page. The scorecard target after R1 is consensus ≥ 7.5
overall, no dimension < 6, distinctiveness ≥ 8 (design-baseline §5.10), re-run by the three critics on the same 11
dimensions; the landing part's share of that score is the COD conversion craft row (baseline 6 → target ≥ 8) and the
"freedom from AI tells" row for the form, thank-you and tracking surfaces.

### LAN-§3.5 The order form contract (P3, `src/landing/sections/orderForm/**`; DB F1-F4, C2, R1-R7 as they touch the form)

The order form is the one section this track renders, so its targets are built here, not gated from outside:

| # | Rule | How | Hard / soft |
|---|---|---|---|
| OF1 | **Position.** The form starts ≤ 3,000 px at 390 (screen ≤ 4); the grammar invariant I2 (DES-§5.2) places it; the hero CTA targets `#order` (I1) | the choreography expander retries until I2 holds; `budget:F1` refuses otherwise | hard (core) |
| OF2 | **Height.** Default state ≤ 1,100 px at 390: `offer → name → phone → city → submit`; the per-piece option rows collapse behind one summary row ("2 pièces · Noir / M · Modifier"); `address` renders after `city` only when `form.address = "required"`, else behind "Ajouter une adresse" (`<details>`, no JS); `note` and `email` behind the same disclosure; the order bump is one row ≤ 56 px; the summary `<dl>` ≤ 4 rows | the height model entry `orderForm` = 1.6 screens (1.3 with `fill = inline` and ≤ 2 offers; +0.25 per visible option group); `form:F1` measures the estimate; Playwright measures the rendered height on the 41-page set | hard |
| OF3 | **Options honesty (F2).** An option group with one value is never rendered (the value is written into the payload as the only choice); per-piece (`u.<k>.*`) groups appear only when the item declares `options` (docs/OFFERS.md D4); the invented "Pièce 1 · Usage" rows of the baseline cannot occur because the renderer reads `doc.items[].options`, never a preset | renderer rule + render-check fixtures | hard (renderer) / soft item `form:F2` when a doc still carries a one-value group |
| OF4 | **Visible boundaries (F3).** Every variant (`card`, `split`, `minimal`, `bold`) renders inputs with a 1 px border **or** a filled ground at ≥ 3:1 against the panel; `minimal` keeps its airy spacing but loses underline-only fields; focus ring ≥ 3:1, 2 px, offset 2 px | `form:F3` computed from the variant's tokens (`--lp-line-strong` vs `--sec-card`) | hard |
| OF5 | **One primary action (R1).** Exactly one `button[type=submit][data-lp-submit]`; the WhatsApp alternative is a text link with an icon (`.lp-of__alt`, `src/landing/sections/orderForm/parts.tsx:406-418`), never `.lp-btn`; no "Modifier" buttons per piece (one summary row with one link) | DOM count in render-check | hard |
| OF6 | **Upsell placement (F4).** No post-purchase upsell inside the form; the Offers v2 order bump stays available (frozen; `bump` in payload v2) as a compact row, **off by default** in every generator preset (`src/lib/page/offer-presets.ts` sets `orderBump.enabled = false`), rendered between the summary and the submit, never as a card with a picture | render-check: no `.lp-upsell` inside `#order-form`; `.lp-bump` height ≤ 56 px | hard |
| OF7 | **COD line in the fold (C2).** The reassurance string (`form.reassurance`, default "خلّص ملي توصلك" / "Vous ne payez qu'à la réception" / "Pay when it arrives") is exported as `ctx.codLine` for the hero price block (P6 renders it under the hero price) and repeated once under the submit button; nowhere else | `budget:C2` reads the hero's declared fold layout; render-check asserts the string appears exactly twice | hard |
| OF8 | **No kicker, ≤ 4 reveals, 0 glass (C5, R4, R5).** The form heading is the title alone (the `form.kicker` copy field is ignored); `data-reveal` only on the panel (`rise`) and the submit row; no `backdrop-filter` in `orderForm/*.css`; the pack cards use the `selection` display axis (soft / solid / outline, OFFERS D5), never glass | render-check counts; CSS lint | hard |
| OF9 | **Price cluster (RTL4, T1).** Price, old price and discount chip are one `inline-flex` unit with logical gaps and `tabular-nums lining-nums`; `⁦−25%⁩` isolates kept (keep-list 5); the summary rows right-align numbers with `font-variant-numeric` | render-check ar fixture: chip adjacent to the price at 390 | hard |
| OF10 | **Delivery and urgency inside the form (R3).** The delivery line slots (`[data-lp-dz]`, LAN-§7.4) and the one urgency chip (`CodChip` with the real stock or end when the owner typed them) live here; the `trust` 3-up inside the form is removed (one trust surface per page: the `trustBar` strip) | render-check: `.lp-trust` count ≤ 1 per page | hard |
| OF11 | **Phone and city (keep-list 4).** `dir="ltr"` tel input with a leading +212, `inputmode="tel"`, `autocomplete="tel"`; the city `<select>` with the market's list (`src/lib/markets/cities-ma.ts:166-176`) and `autocomplete="address-level2"`; labels above inputs, errors inline with `aria-describedby`, the error summary `role="alert"` | unchanged plumbing; axe in `qa/e2e` | hard |
| OF12 | **Motion.** Selection morphs ≤ 180 ms on `--lp-ease-out`; height changes animated with the grid-rows trick; nothing under `prefers-reduced-motion`; no spring in the form | `test:design` V23 (one easing family) | hard |

Acceptance: on the 41-page render set and the `duo`, `tshirt`, `colors` fixtures in ar and fr, every form variant
measures ≤ 1,100 px in its default state at 390, starts ≤ 3,000 px, renders one submit button, zero glass, ≤ 4 reveals,
visible boundaries ≥ 3:1, no one-value picker, the COD line twice per page; the 2,840 px baseline form
(`argan-default-ar`) is refused by `form:F1` in `test:prepublish`.

### LAN-§3.6 Thank-you and tracking pages: design contract (P3; LD38)

These documents are this part's HTML (no section plan), so their budgets are set here and checked by render-check:

| Surface | Budget | Notes |
|---|---|---|
| Thank-you page | ≤ 3 screens at 390; ≤ 1 aurora (`.lp-ty__aurora`, kept as the page's one colour moment); 0 glass; ≤ 8 reveal nodes (today 5, `src/landing/thankyou/ThankYou.tsx`); one primary action (the upsell "add" while its window runs, else the confirm pill); the timeline shows verbs, never "1 / 2 / 3" labels; order id, total and phone in `<bdi dir="ltr">` with `tabular-nums`; the recap is a `<dl>`; the legal links a hairline-separated row | the add-on blocks (LAN-§8) add ≤ 2 elements inside existing regions, never a new section; HTML with all blocks off is byte-identical to today's |
| Tracking page | one column ≤ 560 px; the timeline uses the accent for done steps and a muted hairline for future ones (no decorative dots: the step marker is a 10 px filled circle only for the current step); 0 glass, 0 aurora, ≤ 4 reveals (none under reduced motion); actions as a vertical list of three text buttons with one primary; ids LTR | the theme is the order's version theme (the shopper sees the look she ordered from), transactional register (DES-§11.1) |
| Delivery line, WhatsApp order line, not-served state | one `<p>` each, `aria-live="polite"`, height/opacity ≤ 180 ms; the not-served WhatsApp button is a `.lp-btn--soft`, the page's one soft button | no icon triplets, no chips over photos, no middle dots beyond one per line (DES-§3.2) |
| Test banner | a 36 px top band in `--lp-warn` ink on `--lp-soft` with the text `test.banner` (LAN-§24.2); not fixed (scrolls away), never covers the hero CTA | rendered by the Shell from `RenderAddons.banner = "test"` (core §H.13) |

### LAN-§3.7 COD invariants the gates and the Director share (ra §1.3 R9; DES-§5.2 I1-I6)

The Director pass (ra §1.2) upgrades the instant engine draft when Cloud AI is on; it never relaxes a guarantee. The
rubric's R9 row ("COD invariants, hard, deterministic") is evaluated from the render digest with these exact checks,
which are the same ones the gates and this part's tests apply, so an instant draft and a Director-refined page meet one
standard:

| Invariant | Source of truth | Checked by |
|---|---|---|
| Every hero CTA targets `#order` and the form starts within 3.0 screens | DES-§5.2 I1, I2; OF1 | `budget:F1`, V21, V22 |
| `offer` (when present) precedes the final `cta`; the pack picker renders once | DES-§5.2 I3; R2 | V22, render-check |
| The delivery line slots exist in the form whenever `checkout.zonesEnabled && lineOnLanding`, and show nothing when zones are empty | LAN-§7.4 | render-check zones fixtures |
| WhatsApp (form alternative, float, order option) appears only when a number exists | GEN-09 guard rule, `wa:no-number` | AI-§D.2 rule 2, checklist |
| No urgency without a merchant end date or stock; countdown once | LD36 | `honesty:countdown_*`, V22 |
| Product image, price, primary CTA and the COD line in the first 844 px | DB C2 | `budget:C2` |
| No proof without material, no number without a field | LAN-§6 | `honesty:*` |

`RenderDigest.cod` (the digest P6 computes for the critic, ra §1.2) carries `{ formScreen: number; ctaTargetsForm:
boolean; offerBeforeCta: boolean; deliveryLine: "present" | "absent" | "n/a"; whatsappConfigured: boolean; urgencyReal:
boolean; foldOk: boolean }` built by `codInvariants(doc, inputs)` from `src/lib/landing/cod-invariants.ts` (P3, pure,
isomorphic), the one implementation the digest, the checklist and the honesty gate import.

### LAN-§3.8 The three-minute demo: the landing checks (rf §4; core §K.2 exit criterion 12, §J.3 `qa:wow-demo`)

`scripts/qa/wow-demo.ts` (maintainer) imports step modules; P3 contributes `qa/e2e/steps/landing-publish.mjs`,
`landing-test-order.mjs` and `landing-thankyou.mjs`:

| Clock (rf §4) | Landing step | Pass condition asserted |
|---|---|---|
| 1:05 | Details: price typed, delivery fee left empty | the published page has **no** fee line and no "livraison gratuite"; `delivery:zones-empty` appears as a Store Health issue, never as a gate item |
| 1:25 → 1:40 | Publish | the prepublish registry answers `{ ok: true }` within 400 ms of checks; `publishPage` ≤ 3 s end to end; the version row has `generation_source` set by ai's listener; the address card shows the canonical link, the QR, "Share on WhatsApp", **"Open a test order"** (`mintTestLink`) and "Create a campaign" |
| 1:55 | Test order on the phone (390 px, 4G) | the test render answers 200 with `X-Robots-Tag: noindex`, no pixel script, the banner; LCP ≤ 2.5 s; the fold holds image, price, CTA, COD line; the form starts ≤ 3,000 px; submit ≤ 1 s; the order has `is_test = 1`, `sheet_status = 'disabled'`, no `outbox` row of kind `capi` |
| 2:15 | Thank-you | "Confirm on WhatsApp" opens `wa.me/<store digits>?text=` with the order id; the expectation line shows the caller phone or nothing; the tracking link opens the status without a lookup |
| 2:50 | Dashboard | revenue KPIs unchanged by the test order; `leadsDue` 0; the health ring lists the zones issue with its one-tap fix |

The run passes with Cloud AI **off** and the model cache empty: nothing in this part's path calls a model.

---

## LAN-§4 Landing pages in each store mode (core §A.2)

| Topic | `landing` (R1) | `store` (R2) | `both` (R2) |
|---|---|---|---|
| Nav group "Landing pages" (Pages, Generate, **Campaigns**, **Links**; core §I.3) | shown | shown only when `landing.inStoreMode` | shown |
| Store home `/` | `stores.home_page_id` (a landing page) or the store's branded "no page yet" page (core §A.2) | storefront home | storefront home |
| Landing URL | `<base>/<slug>` (core §C.4.1) | same, when shown | same; attached landings default to `noindex` + canonical to the PDP (core §C.8, R-D49) |
| Offers | the page's own items and offers | — | own, or attached to a product (LAN-§17) |
| Thank-you | LAN-§8 | — | + "Discover the shop" link (`landing.attach.shopLink`) and cross-store upsell (R3, LAN-§19) |
| Orders | `orders.source = 'live'` with `page_id` | storefront sources | both, one queue (operations.md) |
| Leads, tracking, short links, kits, tests | yes | yes (store pages use the same tracking page and short links) | yes |

- **Set as home** (Pages list row menu, `pages.publish`): writes `stores.home_page_id`; only a published landing page
  can be home; unpublishing the home page asks to pick another or confirm the "no page yet" page. Hidden in `store`/`both`
  modes (the storefront owns `/`).
- **Mode switch safeguard** (core §A.2 "Mode-switch safeguards (rev 2; LAN Q34)", accepted): P2's `store.mode` action
  first calls `landingModeSwitchPlan(scope): Promise<{ livePages: number; views7d: number; suggestInStoreMode: boolean }>`
  (P3, `src/lib/landing/mode-plan.ts`, a P0 stub) and shows the plan: switching to `store` while live landing pages exist
  opens a sheet listing them with their 7-day views ("These pages receive visits: keep them on?") and sets
  `landing.inStoreMode = true` unless the owner unticks it; the seam passes `landing.inStoreMode` to
  `modeAllows(mode, "landing", { landingInStoreMode })`. A switch never unpublishes a page; it only hides.
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
// src/landing/addons/types.ts (P3; isomorphic types; the shape core §H.13 / D62 froze at C0)
export type AddonChunk = "assist" | "assist-ty" | "track" | "exp-head" | "exp" | "chain" | "video-hero" | "landing-v3";
export type AddonDataId = "lp-assist" | "lp-assist-ty" | "lp-track" | "lp-exp" | "lp-chain" | "lp-video";
export interface RenderAddons {
  head: AddonChunk[];                                   // inline in <head> before any section (exp-head only)
  body: AddonChunk[];                                   // inline after the core chunk
  data: Partial<Record<AddonDataId, unknown>>;          // serialised with inlineJson (core render escaping)
  css: string[];                                        // extra CSS chunk names (assist line, thank-you blocks, arms)
  banner?: "test";                                      // the Shell renders the test band (core D54, §H.13)
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

The renderer gets `RenderAddons` from the publish/render path: core D62 / §H.13 (request Q3 accepted) adds `addons?:
RenderAddons` to the render context, the Shell (`src/landing/document.tsx:299-334` today renders only the core chunks)
renders `head` scripts first, `body` scripts after the core chunk, the data blocks with `inlineJson`, the extra CSS and the
`banner`, every add-on script joins the hash CSP (`inlineHashes` / `buildLandingCsp`), `RuntimeChunkName` gains the
add-on names, and publish/render call `addonsFor(input)` (P3, pure; T3 wires it with an empty default in R1.0). Data
blocks are `type="application/json"` (not executed, no hash). The build (`scripts/build-landing-assets.mjs`, request Q30
accepted) bundles `src/landing/runtime/addons/*.ts` into `addonChunks` of `src/landing/generated/assets.ts`.

### LAN-§5.2 Chunks, budgets, loading rules

| Chunk | Entry (P3) | Loaded on | When | Budget gz (request Q5) | Release |
|---|---|---|---|---|---|
| `assist` | `src/landing/runtime/addons/assist.ts` | landing | zones line on (`checkout.zonesEnabled && lineOnLanding` and ≥ 1 zone with an ETA or `notServed`), or WhatsApp order on, or the thank-you tracking link on (idem capture) | 2,600 B | R1 |
| `assist-ty` | `…/addons/assist-ty.ts` | thanks | any `landing.thankYou` block on and its data present | 1,500 B | R1 |
| `track` | `…/addons/track.ts` | tracking page | always on `/track` | 2,400 B | R1 |
| `exp-head` | `…/addons/exp-head.ts` | landing, store pages | a running in-page experiment | 450 B (inline head) | R3 |
| `exp` | `…/addons/exp.ts` | landing, store pages | any running experiment | 1,200 B | R3 |
| `chain` | `…/addons/chain.ts` | thanks | `addons.upsellChain` on | 2,000 B | R3 |
| `video-hero` | `…/addons/video-hero.ts` | landing | a `hero:video` section (LP-14) | 700 B | R3 |
| `landing-v3` | `src/landing/runtime/entry-v3.ts` (fork of `entry.ts`) | landing (runtime_v 3 only) | LP-16 pages | 24,700 B (replaces `landing`) | R3 |

Page caps (`budgets.json` key `page`, render-check +5 % rule, `scripts/qa/render-check.ts:119-131`): the heaviest product
page today measures 31,931 B of scripts (OFFERS §F.9). With `assist` it becomes ≈ 34,500 B: request Q5 (accepted, core
§H.13) raises `page` to **34,800 B** and adds a `thanks-page` cap of **12,600 B** (thanks 6,650 + pixels 3,900 + assist-ty
1,500 + margin; R3: 14,600 B with `chain`); the R3 keys `exp-head` 450, `exp` 1,200, `chain` 2,000, `video-hero` 700 and
`landing-v3` 24,700 are reserved in the same file. A chunk over budget fails `npm test` (render-check), as today. Add-on
bytes count toward DB F5 (≤ 90 KB gz soft, 140 hard per page): the `lp-assist` data block is ≤ 3 KB for 147 cities
(zone indexes, not names), `lp-assist-ty` ≤ 600 B, `lp-track` ≤ 400 B.

Shared pure modules the chunks import (bundled by `scripts/build-landing-assets.mjs`, request Q30): `src/lib/delivery/eta.ts`,
`src/lib/delivery/line.ts`, `src/landing/runtime/addons/select.ts` (form-control serialiser, LAN-§11.3),
`src/landing/runtime/addons/storage.ts` (store-prefixed keys, core §C.9 rule: prefix `lp:<h>:` derived from
`location.pathname` `/^\/s\/([a-z0-9-]{3,30})\//`, empty outside `/s/`), `src/lib/experiments/assign.ts` (R3).

### LAN-§5.3 Modes, preview and exports

| Mode | assist | assist-ty | Notes |
|---|---|---|---|
| live | yes | yes | the thank-you omits the `pixels` chunk when the store's Purchase trigger is not `order` (`purchaseInBrowser = false`, core §H.3, OPE Q.6): zero runtime bytes, config v2 unchanged |
| test (LAN-§14) | yes | yes | `cfg.pixels = {}` so the pixel chunk is absent (`src/landing/document.tsx:328` adds it only when a pixel id exists); `endpoints.event` omitted; `endpoints.order` / `lead` / `upsell` and `thankYouUrl` carry `?sg-test=<token>`; WhatsApp order hidden; `banner: "test"` |
| preview (builder full preview, `/app/<h>/preview/<id>`) | yes, offline: the line works with a sample city picker; the WhatsApp order button shows a "works on the live page" note | yes, with a sample order id `CMD-PREVIEW` | no network calls (`cfg.mode === "preview"`) |
| export-static / export-php / export-whatsapp | delivery line only | confirm + expectation (no tracking link) | LD28 |
| export-connected | delivery line only | confirm + expectation + tracking link (absolute `storeUrl(store, "/track")`) | LD28 |

The in-builder interactive preview (`src/components/preview/**`, React) does not run add-ons in R1; the slots render
their server fallback (LAN-§7.4) so the layout matches. Acceptance: a page with every add-on off has byte-identical HTML
to the same page rendered without this part (render-check golden).

### LAN-§5.4 The `assist` chunk's duties beyond its features (LD35; DB R7, keep-list 3)

Besides the delivery line, the WhatsApp order and the idem capture, `assist` sets one attribute the sticky bar and the
WhatsApp float (P6's sections) read with CSS only: `html[data-lp-cta-visible]` while any in-flow primary CTA
(`.lp-btn--primary` inside a section, the form's submit included) is ≥ 50 % visible (one `IntersectionObserver`,
threshold 0.5, ≤ 120 B of logic). P6's CSS: `html[data-lp-cta-visible] .lp-sticky { transform: translateY(100%) }` and
`html[data-lp-cta-visible] .lp-wa-float { opacity: 0; pointer-events: none }` (180 ms, none under reduced motion); while
the sticky bar shows, the float collapses into the bar's trailing slot (`.lp-sticky__wa`). The frozen chunk's own
hero-CTA observer keeps deciding when the bar first appears; `assist` only hides it over in-flow CTAs. Without `assist`
(a page with every add-on off) the bar behaves as today. Acceptance: Playwright scrolls the 41-page set at 390: the bar
is hidden whenever the form's submit is ≥ 50 % in view; fixed UI never exceeds 88 px of 844; no screenshot shows a
sticky bar, a float and an in-flow CTA at once.

---

## LAN-§6 Honesty rules for landing pages (LP-02, LP-21)

### LAN-§6.1 Proof content (LP-02)

- **Proof sections** = `reviews`, `socialProof`, `stats`, `beforeAfter` (their schemas carry `sample`, e.g.
  `src/landing/sections/reviews/model.ts:52`, `socialProof/schema.ts:52`, `stats/model.ts`, `beforeAfter/model.ts:53`).
  On Store Gen stores a visible proof section with `sample: true` can't publish (checklist error + gate item
  `honesty:sample`). Hidden sections are ignored. Other sections with a `sample` flag (faq, specs, showcase, story,
  video) keep today's warning, because they carry product words, not claims of other people.
- **Proof material (DB I4, I5; rev 2).** A visible proof section also needs what it claims to show, else `honesty:I4`:
  `beforeAfter` ≥ 2 **distinct** asset ids (the baseline desaturated one photo and captioned it "SANS / AVEC",
  design-baseline §3.4); `video` a real `src` asset of kind video or a `url` (a poster with an "en action" chip is not a
  video); `gallery`, `socialProof:ugc`, `lookbook` ≥ 3 distinct assets; a photo credit (`caption.credit`) only when the
  name is in `doc.product.credits`, a list the owner types in the Product tab (the generator and AI never fill it);
  `showcase:hotspots` callouts only on anchors the owner placed in the focal editor (`anchor.by = "owner"`), else
  `honesty:I5` and the variant falls back to the hotspot-free one in the generator (P6's pool rule). The generator never
  produces a proof section with material it does not have: the choreography's `Proof` and `Visual` productions read
  `has.ownerProof`, `has.video`, `has.photos` (DES-§5.5).
- **Library figures (DB D2).** `stats`, `socialProof:counter`, `reviews:summary` and `product.rating` render only
  owner-typed, attested values. The copy library's stats (`src/landing/sections/stats/copy.ts:57-69`, "94 %",
  "Questionnaire auprès de nos clientes") stay `sample: true` defaults (P6) and the gate refuses them (`honesty:D2`); a
  visible `stats` section whose items are not `sample` but carry no attestation is `honesty:D2` too.
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

Acceptance: publish of a fixture with a visible `reviews` section `sample: true` answers `honesty_blocked` with item
`honesty:sample` and that `sectionId`; a one-image `beforeAfter`, a still `video` and a 2-asset `gallery` answer
`honesty:I4` each; the library `stats` fixture answers `honesty:D2`; hiding the section or attesting clears it;
render-check finds no `aggregateRating` in any fixture; the audit row exists for each attestation.

### LAN-§6.2 Time and stock (LP-21)

| Rule | Level | Gate |
|---|---|---|
| A countdown needs a real end (`offers.urgency.countdownEnd`, or from R3 a schedule end, LAN-§20.1); without one the urgency section falls back as today (`src/landing/sections/urgency/index.tsx:101-102`) | — | renderer (unchanged) |
| The countdown renders in one place per page: `urgency:countdown`, or the `announcement` ticker, or a `cta` card, never two (DB R3) | error | `honesty:countdown_twice` |
| A stock figure the owner did not type (`stockLeft` written by a generator, preset or AI; the registry test asserts no default) | error | `honesty:stock_untyped` |
| The live version's end passed and the doc's end is later | error | `honesty:countdown_reset` |
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
from the page's real fee (`offers.shippingFee`, offer `free`). **Rev 2 makes it a gate (`honesty:promise`, core §M.3):**
every visible text field is scanned with `policyAllows(facts, claim)` patterns (LAN-§3.3) for `delivery_time`,
`free_delivery`, `return_window`, `exchange`, `inspection`, `warranty`, `refund` and `confirmation_call`; a claim whose
source is unset is a hard item naming the field, with the fix "Set it in Policies" or "Remove the sentence". The fee line
is **absent**, never invented, when zones are empty (core §M.3). Acceptance: the four combinations of
`confirmationCall × inspection` render the four expected timelines in ar/fr/en (render-check fixtures); "livraison
gratuite" in a benefit on a page with `shippingFee = 2900` and no `freeShipping` offer answers `honesty:promise`.

### LAN-§6.4 Numbers audit (DB D1, D2; `src/lib/landing/honesty/numbers.ts`, P3, pure, isomorphic)

```ts
export type NumberClass = "price" | "compare_at" | "unit_price" | "savings" | "fee" | "units" | "qty" | "delivery_days" | "return_days" | "warranty_months" | "within_hours" | "stock" | "countdown" | "weight_volume" | "fact" | "phone" | "order_id" | "year" | "other";
export interface AllowedNumbers { byClass: Partial<Record<NumberClass, string[]>>; all: Set<string> }   // digits normalised: Latin, no spaces, "," → "."
export function allowedNumbersFor(doc: PageDoc, store: { policies: StorePolicyFacts; zones: DeliveryZoneRow[]; confirmation: ConfirmationValue; facts: string[] }): AllowedNumbers;
export interface NumberFinding { path: string /* doc path */; text: string; value: string; cls: NumberClass | null; why: "unknown" | "conflict"; conflictsWith?: string }
export function auditNumbers(doc: PageDoc, allowed: AllowedNumbers, locale: Locale): NumberFinding[];
```

Rules: (1) numerals are read from every visible text field (`sanitizeDeep` paths of the sections, `product.*`, `offers.*`
labels, `seo.*`) in Latin and Arabic-Indic digits, with the locale's thousands and decimal separators; (2) a numeral is
**allowed** when it equals a value in `allowed.all` (prices, compare-at, per-unit and savings computed by
`src/lib/page/pricing.ts` for every offer, units and quantities of the offers, the page fee, zone ETA days and policy
windows, `withinHours`, `stockLeft`, the countdown end's date parts, years ≥ 1990 and the merchant `facts` numbers
already accepted by the guard, `src/lib/ai/guard.ts:52-66`); phone numbers and order ids in `<bdi>` isolates are
skipped; (3) a numeral outside the set is `why: "unknown"` → `honesty:D1` on its field ("94 %", "+9 400 pièces",
"3 200 percussions", "il y a 2 jours" counts); (4) two allowed numerals of the **same class** with different values on
one page (`delivery_days` 1-3 in the form and "48 h" in a benefit; a `fact` "30 s" and "40 s") are `why: "conflict"` on
the later field → `honesty:D1` with `vars { a, b }`; (5) the gate reuses the guard's number rule rather than
re-implementing it: `allowedNumbersFor` wraps `allowedNumbers(ctx)` and adds the pricing, zone, policy and countdown
classes. Acceptance (`test:honesty`, `src/lib/landing/honesty/selftest.ts`): the baseline contradictions
(blender 30/40 s, tshirt 9,400/1,000, "4,7 (312)") each produce exactly the expected findings; the keep-list fixtures
(design-baseline §6) produce 0; ar pages with Arabic-Indic digits and `ar-MA` Latin digits give identical findings;
`⁦−25%⁩` isolates and prices in `tabular-nums` chips are never flagged.

### LAN-§6.5 Gate item messages (ar / fr / en; `landing.gate.*` in `src/lib/i18n/admin/<locale>/landing.ts`)

Every title exists in the three catalogs (core `test:i18n-coverage` requires it for every `GateItem.title`); no em or en
dash, no "Step n" (core §I.5).

| Id | en title · detail with `{vars}` |
|---|---|
| `honesty:sample` | This {section} still shows example content. · Replace the examples with your customers' real reviews, chats or numbers, then confirm they are real. |
| `honesty:I4` | This {section} needs real material before it can publish. · {needed} {kind} needed, {given} given. |
| `honesty:I5` | The callouts point at nothing yet. · Place each callout on the photo in the editor, or switch to a layout without callouts. |
| `honesty:D1` | "{value}" is a number nobody typed. · Numbers on the page must come from your product facts, prices, delivery zones or policies. · (conflict) "{a}" and "{b}" describe the same thing. Keep one. |
| `honesty:D2` | Statistics and ratings need your real data. · Type your own figures and confirm they are real, or hide the section. |
| `honesty:countdown_reset` | A countdown that ended can't restart on the same page. · Duplicate the page for a new campaign, or remove the countdown. |
| `honesty:countdown_twice` | The countdown appears twice. · Keep it in one place. |
| `honesty:stock_untyped` | The stock figure was not typed by you. · Type the real stock or remove it. |
| `honesty:promise` | "{claim}" is not in your policies. · Set it in Policies, or remove the sentence. |
| `form:F1` | The order form is too long ({px} px). · Keep offer, name, phone, city and the button; move address and note behind "Add an address". |
| `form:F3` | Form fields need visible borders. · Pick a form style with boxed fields. |

Arabic and French titles follow the shopper copy register of LAN-§24.2 (ar Darija-leaning in Arabic script, fr `vous`);
the full table lives in the catalog files and is covered by `test:i18n-coverage`.

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
// used by: tracking page ETA (LAN-§9), agent drawer and call script (operations.md), WhatsApp templates {eta_text} (IN-05, OPE-§7.1),
// the Campaign Kit delivery text (LAN-§13), the WhatsApp order text (LAN-§11), storefront PDP/checkout (R2), LP-16 (R3)
export interface ZoneTable { v: 1; zones: { n: string; fee: number | null; freeFrom: number | null; d: [number, number] | null; ns: boolean }[]; city: Record<string, number>; star: number | null; cal: StoreCalendar & { holidays: string[] /* next 60 days */ } }
export function zonesForCheckout(scope: StoreScope): Promise<ZoneTable>;   // P0 stub (core §K.2); embedded by storefront in `#sg-config` (STO-§12.3) and by LP-16; the same object feeds the `lp-assist` data block
export function deliverySummary(zones: readonly DeliveryZoneRow[], locale: Locale): { etaText: string | null; feeText: string | null };   // the server fallback line ("en 1 à 3 jours ouvrés", "25 à 35 DH"), each part only when set

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
/** storefront's shape (STO-§15.8, STO-D17): one call = window + text; `from`/`to` are Dates at 12:00 UTC of the store-local day */
export function etaWindowText(zone: { etaMinDays: number; etaMaxDays: number }, now: Date, cal: StoreCalendar, locale: "ar" | "fr" | "en", dateLocale?: string): { from: Date; to: Date; text: string } | null;
```

`etaWindowText` exists so S1 never writes a second ETA implementation ("written by S1 with this exact signature if
absent", STO-§15.8): landing ships it in R1 with the primitives above, and both specs name one module.

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
- `test:tenancy` (`scripts/qa/tenancy-cases/landing.ts`): zones of store A never appear in store B's data block, editor,
  `zoneLineFor` or `zonesForCheckout`.
- Store Health (LAN-§23.7): `landing:zones_empty` (setup, severity 2) when zones are off or empty in a market with a city
  list while a live page shows a flat fee; `landing:holidays_unreviewed` (setup, severity 1) when
  `holidaysReviewedYear < current year` in January or during a month with movable holidays.

---

## LAN-§8 Thank-you additions (LP-04, R1)

### LAN-§8.1 Blocks (rendered by `src/landing/thankyou/ThankYou.tsx`, filled by `assist-ty`)

| Block | Where | Content | Server fallback |
|---|---|---|---|
| Confirm on WhatsApp | in the hero, beside the order-number chip (`ThankYou.tsx:351`) | a pill button with the WhatsApp glyph: "Confirmer sur WhatsApp" / "أكّد الطلب فواتساب" / "Confirm on WhatsApp" | hidden (needs the order id) |
| Expectation | first step of the "what happens next" timeline (the call step) | "Nous vous appelons du 06 61 23 45 67 pour confirmer, {when}." + "Enregistrez ce numéro pour reconnaître notre appel." | the sentence without `{when}` when a caller phone exists; else today's step text |
| Track my order | footer of the summary card | link "Suivre ma commande" | hidden |

The one-click upsell keeps its place and behaviour (it is time-bound and the money moment; DB F4 places every post-purchase
offer here and nowhere else); the confirm pill is compact so it never competes with it. Timeline step texts follow
LAN-§6.3 (policy-driven). The page's design budgets are LAN-§3.6. When the store's Purchase trigger is `confirmed` or
`delivered`, the document omits the `pixels` chunk (`purchaseInBrowser = false`, core §H.3; the server sends the Purchase
later through operations' outbox), so no browser Purchase fires on a confirmation-call store.

Server twin of the confirm text (P0 stub, core §K.2): `waConfirmText(store: StoreRow & { confirmation }, order: OrderRow,
locale: Locale): string` (`src/lib/landing/templates.ts`) fills the same `customer_confirm` template from the stored order
(id, offer label through `orderText()`, total, first name), used by the agent's "Send confirmation link" quick reply,
the kit preview and the parity test (the browser's `assist-ty` output equals it for the same order).

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
class (core §C.2); the handler loads the order through the public resolver `resolveOrderForTracking(orderId, sig: string
| null)` (request Q11 accepted, core §E.2: in `src/lib/tenancy/public.ts`, annotated `// tenancy: public-key orderId`,
cached 15 s, servable stores only, "signed-link check inside": with a non-null `sig` the resolver verifies it and answers
`null` on a bad signature, so a forged `s` and an unknown order are indistinguishable), checks that the effective host is
one of `storeHosts(store)` (an order of store A looked up from store B's host answers `not_found`), then uses the returned
scope for every later query. In store mode (R2) S1 wraps the document in the store chrome (STO-R18); the route file stays
this part's.

Signed link: `s = <exp base36>.<sig>`, `sig = base64url(hmac(orderId + "|" + exp, "track-link:" + storeId))[:22]`, `exp =
issue + 90 days`, built by `signedTrackPath(store: StoreAddress & { id }, orderId: string): string` (the P0 stub name of
core §K.2; `src/lib/tracking/links.ts`; returns `storePath(store, "/track") + "?o=…&s=…"`) and `trackUrl(store, orderId)`
(absolute, through `storeUrl`) for the `{tracking_link}` variable of operations' templates (OPE-§7.1) and for the
`track_link` template.

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
the version seen, or NULL when the selection does not resolve; `is_test` from `resolveTestToken(store, sgTest)` (the
`?sg-test=` query of the lead endpoint, LAN-§14; lint L12); `kind = 'form'`. The `selection` text (`lead-text.ts`) stays
the warehouse text shown in lists. **Rev 2 additions:** `city` is kept when the beacon carried it (the recovery message
can then say the real delivery window, `{eta_text}` through `zoneLineFor`), and the row's `risk` hints are computed at
list time, never stored: `customers` history of the phone (`ordersCount`, `refusedCount`, `fakeCount`, P4's table) and
the blocklist, shown as chips "3 delivered · 1 refused" so an agent calls the leads that pay first.

Cross-track functions (P0 stubs, core §K.2): `markLeadConverted(scope, leadId, orderId, via: "agent")` (called by
operations' `convertLeadToOrder`, OPE-§11.4; idempotent: a converted lead answers the existing order id) and, in R2,
the `onLeadCreated(scope, lead)` hook (OPE Q.18) for webhooks `lead.created`.

### LAN-§10.3 The inbox (`/app/<h>/leads`, `leads.read`; ar/fr/en in R1, LD26)

- **Header** (last 30 days = the retention window): Leads · Contacted · Recovered (n and % of contacted) · Converted
  without contact · **First contact p50** (minutes from capture to the first attempt, n ≥ 20; the recovery SLA the
  store sets in `landing.leads.firstContactTargetMin`, default 30, feeds the health rule `landing:leads_slow`). Real
  counts only; a % is hidden below n = 20 ("needs more leads"). Placed, confirmed and delivered are never blended: the
  "Recovered" count shows confirmed-and-delivered on hover with their own n (core §I.8 rule 3).
- **Views:** New · Follow-up due · Contacted · Recovered · Lost · All, plus filters page, city, assignee, kind
  (form / WhatsApp), period; saved views through operations' `saved_views` (surface `leads`).
- **Row:** status pill, kind icon (WhatsApp intents show the `WA-` ref), masked phone (`06 •• •• 12 34`), name, city,
  page, selection text, server total, "12 min" since capture, attempts, assignee avatar. Agents see the leads assigned to
  them plus "Take next" (the oldest unassigned `new` lead, claimed by `UPDATE … WHERE assignee_id IS NULL`).
- **Actions:** WhatsApp (opens `wa.me` with the `lead_recovery` template in the lead's page locale, variables `{name}`
  `{store}` `{offer}` `{total}` and `{eta_text}` when the lead's city maps to a zone with days; logs an attempt; reveals
  the phone: audit `lead.phone_revealed`, the OP-07 rule), Call (`tel:`, same logging), **Convert to order** (operations'
  manual-order sheet, OP-08, prefilled with `sel`, name, phone, city; the server re-prices on the published version or
  the lead's version within 72 h, OFFERS D8; `convertLeadToOrder` then `markLeadConverted`), **Set phone** on a WhatsApp
  intent (the agent types the number the chat revealed: the intent gains `phone`, and a `form` lead of the same phone
  within 24 h is linked as `merged_into` the intent, so one person is one row), Mark lost (reason), Assign (managers),
  Next follow-up. Keyboard: `J/K` move, `W` WhatsApp, `C` call, `V` convert, `L` lost (core §I.3 chord rules).
- **Bulk:** assign, mark lost, export CSV (`orders.export`, sensitive, audited).
- Empty: "No abandoned forms in the last 30 days." EU: "Abandoned-form capture is off in your market until consent tools
  arrive." Skeleton rows mirror the table; phone width: cards with the two main actions.

### LAN-§10.4 Statuses and attribution

`new` → `contacted` (first attempt) → `recovered` (an order after a contact attempt, or an agent conversion) | `lost`
(agent, with a reason) | `converted` (an order without any attempt). The landing order hook (`landing.created`,
`src/lib/orders/hooks/landing.ts`, phase `afterCommit`, on `created`, the `OrderHook` shape of OPE-§3.6) on order creation:
1. `UPDATE leads SET status='converted', converted_order_id=?, converted_via='idem' WHERE store_id=? AND idem=? AND converted_order_id IS NULL`;
2. else the newest unconverted lead of the same store and phone in the last 7 days (WhatsApp intents included once they
   carry a phone; an intent without a phone is matched by its `ref` when the order's `note` or the agent's conversion
   carries it): `recovered` if `attempts > 0`, else `converted`, `converted_via='phone'`; a test order matches only a test
   lead and vice versa (`is_test` equality in the predicate);
3. notification `lead.recovered` to the assignee when it became `recovered`; the pulse counter `leadsDue` drops by one.

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

1. `burstLimit` + buckets `p:wa:ip:<h>` 30/10 min and `s:<sid>:wa:ip:<h>` 10/10 min (core §E.8, accepted);
   `resolvePublicTarget(pageKey)`; `take_orders` false (pending, restricted…) → `unavailable`; `effectiveHost()` ∈
   `storeHosts(store)` (core D18).
2. Version: `orderVersion(target, { ver })` (the 72 h rule of OFFERS D8).
3. Price with `priceWaSelection(doc, sel)` (`src/lib/wa-order/price.ts`): `resolveSelection` + `orderTotals`
   (`src/lib/orders/validate.ts`, `src/lib/page/pricing.ts`) on the tolerant selection; when it doesn't resolve, the
   offer's default selection is priced (its real "from" total) and the unresolved groups are named "to confirm". The
   delivery line is the page's real fee for that offer (LD4). No price ever comes from the request.
4. Insert a `leads` row: `kind='whatsapp'`, `phone` NULL, `ref` (`WA-` + 6 Crockford chars, unique per store, 3 retries),
   server uuid `idem`, `sel`, `total_cents`, `version_id`, `utm`, `city` when the form had one, `is_test` from
   `resolveTestToken(store, url.searchParams.get("sg-test"))` (LAN-§14), `status='new'`.
5. Text: the `wa_order` template when the owner customised it (vars `{offer}` `{units}` `{total}` `{delivery}` `{ref}`
   `{options_to_confirm}` `{product}` and, new in rev 2, `{eta_text}`: the zone window for the city the shopper picked
   in the form, empty when no city or no zone, never a promise without a zone), else `composeWaMessage`
   (`src/lib/export/whatsapp.ts:344`, the composer exports use) without the customer block; ≤ 1,000 chars; number =
   `doc.form.whatsapp.number`, else `store.whatsapp`. `wa.me` URLs ≤ 2,000 chars.

### LAN-§11.5 In the admin

Intents appear in the Leads inbox (kind WhatsApp, the ref in the row, phone empty). ⌘K resolves a typed `WA-…` ref to the
lead (search provider `src/lib/admin-data/search/landing.ts`, request Q18 accepted, core §I.3). **Convert** opens the
manual-order sheet (OP-08) prefilled with the selection; the agent pastes name, phone, city and address from the chat; the
order has `source = 'whatsapp'` (core D42) and re-prices on the server (`createManualOrder(ctx, { source: "whatsapp",
fromLead })`, OPE-§11.1). The inbox header counts intents and their conversion rate (n ≥ 20). No browser Lead/Purchase
pixel fires for an intent (the frozen pixel chunk doesn't see it); the server Purchase follows the store's trigger on
conversion (operations' `conversions` setting). **Dedupe (rev 2):** when a form order arrives with a phone the agent
typed on an intent, or whose `note` carries the intent's `WA-` ref, the intent is marked `converted` by the landing hook
(LAN-§10.4 step 2), so the inbox never shows a "waiting" intent for an order already placed. Agents get the quick reply
`wa_order_reply` (operations' template kind, ar/fr/en: "Received your request {ref}: {offer} at {total}. Your name,
city and address, please, and we confirm.") beside the row.

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
- `active` → **308** to `storePath(store, target)` with the query below and `Cache-Control: private, no-store` (core
  §C.4.1; the explicit `no-store` keeps the 308 out of browser caches so the target may change, LD14). `paused` → **410**
  with the store's neutral "This link is no longer active" page and a link to the store home. Unknown → the store's 404.
  The target must be a live page of the store (else the store's 404). While the store is `pending` the route answers the
  neutral 404 like every public route (core §A.5.2), although kits compile and links mint in the sandbox.
- **Query rule:** `incoming` = the raw query string as received; if it contains any key starting with `utm_` (ASCII
  case-insensitive), the result is `incoming` unchanged; otherwise `presets` (`utm_source`, `utm_medium`,
  `utm_campaign`, `utm_content`, `utm_term`, only set ones, percent-encoded) followed by `&` + `incoming` when present.
  Click ids (`fbclid`, `ttclid`, `gclid`, `ScCid`) pass byte for byte (the core V7 rule).
- Clicks: an in-memory per-store counter flushed every 30 s and at the end of each tick (`links.flush` job) with
  `UPDATE short_links SET clicks = clicks + ?, last_click_at = ? WHERE store_id = ? AND id = ?`; the counter Map is
  registered in `scripts/qa/tenancy-allow.json` (lint L4, request Q23). Counts are labelled "clicks" (not visitors).

### LAN-§12.2 Screen `/app/<h>/links` (`pages.read`; edit `campaigns.write`, core §I.1)

Table: code, target page, channel, UTM, clicks, last click, status; row actions copy, QR (`qrcode`, already installed,
`package.json:65`; SVG, ink ≥ 7:1, design.md DES-§16.12 styling), pause/resume, edit target. Create sheet: target page,
channel preset (fills `utm_source`/`utm_medium`, e.g. Meta → `facebook` / `paid_social`), campaign (`utm_campaign`),
content (`utm_content`, e.g. the kit angle), code (6 random chars or a custom 3-16 `[a-z0-9-]`). Creating a link charges
the `short_links` gauge against `short_links_max` (200 on `beta`, core §A.4; the limit sheet on `QuotaError`); deleting
refunds it; `usage.reconcile` recounts nightly (core §D.7). The Campaign Kit creates its links through the same service
(`src/lib/links/**`, `createShortLink(ctx, input)` / `pauseShortLink` / `resumeShortLink`; audit `link.created`,
`link.paused`).

### LAN-§12.3 Acceptance

`/go/x?fbclid=AbC%2F1&x=1` reaches `/<slug>?utm_source=…&fbclid=AbC%2F1&x=1` with the incoming part byte-identical;
`/go/x?utm_source=mine` keeps only `utm_source=mine`; the response is a 308 with `Cache-Control: private, no-store` and the
core redirect headers (`qa:headers`); paused → 410; A's code on B's host → 404; 10,000 hits → clicks within 1 % after the
flush; no `Set-Cookie`; the 201st link of a `beta` store answers `quota` (`test:links`, `src/lib/links/selftest.ts`).

---

## LAN-§13 Campaign Kit (LP-18 = rf SF-01, R1, P3 wave 2)

### LAN-§13.1 Entry and lifecycle

Create → "Campaign" (from a page; the `C` quick action lists it in landing and both modes, core §I.3), the page row
menu "Make a campaign", the address card's "Create a campaign" (P2's card, P3's entry, core §I.4) or the end of
onboarding. Inputs: the page, the channels (Meta, TikTok, Snap, WhatsApp broadcast, Instagram organic, print), a name
(→ `slug`, the `utm_campaign` value). Status `draft → live → paused → ended`; `live` requires the page to be published;
pausing pauses the kit's short links (410); ending keeps the record for results. Permission `campaigns.write` (owner,
admin, editor; core §A.3.2); a live or paused kit counts in the `campaigns` gauge against `campaigns_max` (20 on `beta`);
`ended` kits do not. A pending store compiles kits and mints links in its sandbox; `/go/<code>` serves them only once the
store is `active` (core §A.5.2).

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

```ts
// the P0 stub name of core §K.2
export interface CompileKitInput { doc: PageDoc; version: { id: string; publishedAt: string }; store: StoreRow; locales: Loc[]; policies: StorePolicyFacts; zones: DeliveryZoneRow[]; pixels: PixelLibraryView; trigger: "order" | "confirmed" | "delivered"; templates: { confirm: Record<Loc, string>; script: ScriptDoc }; channels: CampaignChannel[]; slug: string; links: { channel: CampaignChannel; url: string; utm: ShortLinkUtm; shortLinkId: string }[]; cloud?: { brief: AdBrief | null } }
export function compileKit(input: CompileKitInput): { kit: CampaignKit; offersHash: string; problems: { code: "no_structure_tags" | "no_locale" | "pixel_missing"; detail?: string }[] };
```

Inputs: the page doc (name, benefits and their structure tags from the copy library, DG-07, design.md DES-§9.5 `Line.s`;
offers; upsell; guarantee), `policies`, the zones (general range text through `deliverySummary`), the pixel library and
the store's Purchase trigger (operations' `conversions` setting), operations' templates (OPE-§7.1 variables). Rules:
- **Facts only:** every number in the kit is a price, an offer, the page fee or an ETA range from these inputs; the
  brief passes the same `allowedNumbers` guard as AI output (ai.md AI-§D.2 rule 5).
- **Three angles with three different structure tags** present on the page; hooks ≤ 12 words from the copy-library
  family lines; `visual` from the page's image-treatment gene (design.md genome) as a sentence; a 6-beat 15 s UGC sheet.
- **`doNotSay`** lists every claim the store did not make: medical claims always; "free delivery" unless the page fee is 0;
  ratings or review counts; a deadline unless the page has a real countdown end; returns or inspection unless `policies`
  allow; any number not in `facts`.
- **Cloud brief** (Cloud AI on, `ai.use`): task `ad.brief` (ai.md AI-§A.2 row, `main · medium`, 60 s, template fallback
  per field; request Q20 accepted: core §L.2 AI-20 "template version raised to R1 inside SF-01 … the `ad.brief` task runs
  behind the Cloud AI flag with template fallback") and `callcenter.script` for the script's objection answers (core §K.2
  P7 row) run as pattern A calls (core §H.12) and never block the kit: the template kit shows first, the cloud fields
  cross-fade in (`<AiProviderChip>`, AI-§K.3); a refusal or timeout keeps the template with the quiet "library" chip.
  The brief's inputs are product facts, structure tags, policies, the best-delivering variant (R3) and **never** a
  customer datum (ra §9.14).
- `offersHash` = the pricing fingerprint (LAN-§18.4) of the compiled version; the landing publish listener (LAN-§3.2.1)
  compares the new version's fingerprint with every live kit of the page and sets `campaigns.kit.stale = true`, so the
  screen shows "The page changed since this kit was made" with "Recompile" within the publish itself (no job).

### LAN-§13.4 Screens

`/app/<h>/campaigns` (list: name, page, status, links clicks, orders 28 days) and `/app/<h>/campaigns/<id>`: header (name,
status, page thumbnail, the "changed since" banner), then copyable cards in this order: Links (per channel: URL, copy, QR),
WhatsApp confirmation (locale tabs), Call script, Ad brief (one card per angle, ar/fr tabs, "copy all"), Pixel plan (what
fires where, the trigger, a test-code reminder when a pixel has a test window), Delivery text. A results strip shows per
link and per `utm_content` angle: clicks, orders, confirmed, delivered over 28 days (orders filtered by `utm.campaign =
slug`; rates hidden below n = 20; test orders excluded). "Share read-only" creates a token and shows the link once.

### LAN-§13.5 Share page `GET /kit/<token>` (platform host only; proxy area `kit`, core §C.3, §B.1; request Q12 accepted)

File `src/app/(public)/kit/[token]/page.tsx` (core §C.4; store hosts answer 404 through the proxy). `resolveKitShare(token)`
(public-key resolver, core §E.2: `sha256(token) = campaigns.share_token_hash`, servable stores only) → the kit read-only
with the store name and the page thumbnail; no customer data exists in a kit; headers of the `auth` class (nonce CSP,
`noindex`, `private, no-store`, `Referrer-Policy: no-referrer`, core §F.6); revoked or unknown → neutral 404; bucket
`p:kit:ip:<h>` 60/10 min. The token is `newToken(32)`, shown once; revoking sets `share_token_hash = NULL` (audit
`campaign.share_revoked`); tokens are revoked automatically when a campaign ends + 90 days (core §H.11).

### LAN-§13.6 Acceptance

A kit compiles with Cloud AI off; over the 60 AI eval fixtures (ai.md AI-07) every brief has 0 invented numbers, 0 banned
words and 3 distinct structure tags (`test:kit`, `scripts/qa/kit-check.ts`, in `npm test`); a republish with new prices
shows the banner; revoking the share → 404; pausing → the kit's links answer 410.

---

## LAN-§14 Test-order links (LP-19 = rf SF-05, R1, P3 wave 2)

### LAN-§14.1 Mint (core D54; the P0 stub `mintTestLink`)

```ts
// src/lib/testing/links.ts (P3)
export function mintTestLink(scope: StoreScope, pageId: string): Promise<{ url: string; expiresAt: Date }>;   // pages.publish
// token = `${exp.toString(36)}.${base64url(hmac(String(exp), "test-order:" + storeId)).slice(0, 22)}`, exp = now + 2 h
// url   = storeUrl(store, `/${slug}`) + "?sg-test=" + token           (the page must be published; else `not_found`)
```

The token binds the **store** (one address-card link opens any page of the store in test mode), not the page; it lives
2 h (core D54; revision 1's 24 h and `utm_content` carrier are superseded). Audit `page.test_link_created`. Shown in the
publish dialog's success state, on the address card ("Open a test order", P2's card with P3's entry, core §I.4) and in
⌘K ("Open a test order", `src/components/admin/shell/commands/landing.ts`).

### LAN-§14.2 Serving (store landing and thank-you routes, T3 files; core §C.4.1, §K.1)

When the request carries a valid `?sg-test=<token>` (`resolveTestToken(store, token).test`, pure, constant-time compare,
core §E.2): `renderTestDocument(scope, page, token)` (`src/lib/testing/render.server.ts`, P3; called by T3's routes)
renders the **published** version on request with: `cfg.pixels = {}` (no pixel chunk, `src/landing/document.tsx:328`),
`endpoints.order = "/api/public/order?sg-test=" + token`, the same for `endpoints.lead` and `endpoints.upsell`,
`endpoints.event` **omitted** (test traffic never reaches `stats_daily`, core §D.2), `thankYouUrl = <thank-you path> +
"?sg-test=" + token` (the runtime appends `&o=<id>`, `form.ts:304-306`), `RenderAddons.banner = "test"`, the WhatsApp
order upgrade disabled (the plain link stays), headers `X-Robots-Tag: noindex`, `Cache-Control: private, no-store`, and a
CSP computed from the rendered add-on set with no pixel hashes (core §F.6). The thank-you route does the same for its
document. Bucket `s:<sid>:test-render` 60/h; an invalid, expired, foreign-store or over-limit token gets the normal
cached page and a normal order. The frozen chunk is untouched: endpoint strings are opaque to it (`form.ts:376`,
`lead.ts:15`, `thankyou.ts:87`) and the CSP's `connect-src 'self'` covers a same-origin path with a query.

### LAN-§14.3 Marking and exclusions (core D54, OPE-§26)

`/api/public/order`, `/api/public/lead` and `/api/public/wa` call `resolveTestToken(target.store, new URL(req.url)
.searchParams.get("sg-test"))` (lint L12); `true` → `orders.is_test = 1` / `leads.is_test = 1`, flag `test`, no CAPI
enqueue, `sheet_status = 'disabled'`, no `bumpOrderStats`, no Telegram except the store's opt-in "[TEST]" messages
(core §H.1). The upsell handler reads `orders.is_test` and skips stats and Sheets the same way. Every aggregate reader
skips `is_test`: Sheets push and CAPI (P5), Telegram (P5), `stats_daily` / `stats_version_daily` (T3, ai), agent KPIs,
the board's rates and `customers` counters except `test_count` (P4), finance and the profit alerts (P4), learning tables
(P7), `store_daily_rollup` (platform), `getPageVitals` and the kit results strip (P3). The queue shows a TEST chip and
the order is claimable and confirmable like any other (OPE-§26); "Delete test orders" (P4, `orders.edit`) removes them
after 1 h; `housekeeping` after 30 days (core §H.11).

### LAN-§14.4 Acceptance

`test:test-orders` (`src/lib/testing/selftest.ts`, in `npm test`, core §J.1): mint/verify round trip; an expired token
(2 h + 1 s) and store A's token on store B are refused; `renderTestDocument` output has no pixel script, carries the
banner, the `?sg-test=` endpoints and no `endpoints.event`; `is_test` propagates to the order, the lead and the intent.
`test:public-api` (core §J.2): a test-token order is `is_test`, skips CAPI / Sheets / stats and still goes through risk and
the queue. `qa:wow-demo`: the dashboard revenue stays 0 after the test order (rf §4 check 5). An unsigned
`?sg-test=anything` visit is a normal visit (render-check).

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
- **Every export runs the prepublish registry in `block` mode** (core §M.1 rule 5: "an export is a publish to someone
  else's server"): a document that would be refused for publish (`budget_blocked`, `design_blocked`, `honesty_blocked`) is
  refused for export with the same items; the export dialog lists them like the publish dialog.
- Acceptance: `test:php` unchanged; an export of store A's page by a member of B answers `not_found`; an A export ZIP holds
  only A's asset ids; a connected export posting another store's export key is refused; the static ZIP has no tracking link,
  the connected one has the absolute link.

---

## LAN-§17 Attached landings, theme mode, copy to another store (R2, track S1)

### LAN-§17.1 Model (LP-07)

`pages.product_id` (core §D.2, 0004, NULL until R2) points at a `products` row of the same store (`assertOwned`);
`pages.attach_opts` (0006, STO-R6: `{ indexable = false, keepNames = true, … }`) and `page_versions.product_rev` (the
product revision a version was rendered against) complete the model. The page stays a **valid PageDoc v2** (frozen): at
attach time and at every publish the product's `{ items }` (Offers v2 shapes, `products.doc`, core §D.6) are
**materialised** into the doc by `materializeAttached(doc, product): PageDoc` (`src/lib/landing/attach.ts`, pure; storefront
calls the same function `attachMirror`, STO-§17: one implementation, exported under both names). At order time the server
prices through `attachedDocFor(target)` applied by `orderVersion` for pages with `product_id` and forces the `fallback`
comparison mode (STO-R12, core §K.4), so a price that moved between the shopper's view and the order answers `stale`. Mirrored, read-only on an attached page: each item's id, name, short, price,
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
| Item price | always the product's | locked field + chip "From product «Crème jour» · Edit product" (the landing editor shows mirrored item fields read-only with the banner of STO-§17, request STO-R18) |
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

Entitlement `experiments` (core §A.4; `beta` false, `pro` true); permission `experiments.manage` (request Q29 accepted,
core §A.3.1: w, R3; owner, admin, editor); results readable with `pages.read`. One running experiment per page; ≤ 3 arms
including the control `a`. Store pages (`surface = 'store_page'`) use the same engine (**this part owns the engine**,
SF-10; core D58); storefront.md lists which page kinds and sections may host arms and renders them through its on-request
renderer with the same wrapper, CSS and head script (cache key + weights version). The renderer support (`.lp-xa`
wrappers, the arms CSS, `exp-head` in `<head>`, `?xv=<arm>` serving with canonical to the control) is the R3 contract step
of core §K.5 (request Q38 accepted).

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
- **Fair test** (core D58, rf §1.8, Johari et al. 2015): mSPRT, `Λ_n = sqrt(V/(V+τ²)) · exp(τ²(p̂_B − p̂_A)² / (2V(V+τ²)))`,
  `V = p̄(1−p̄)(1/n_A + 1/n_B)`, `τ = 0.1` **[to tune on the DG-09 traffic corpus]**, always-valid `p_n = min(1, 1/Λ_n)`
  (monotone non-increasing by construction: the stored `decision.pMin` keeps the running minimum, so peeking never
  raises it); **decided** when `p_n < 0.05` (Bonferroni α/2 with 3 arms, each arm vs control) and every arm has ≥
  `minSample` (100) uniques; auto-end at `horizon` (28 days). Shown: "Chance B beats A" (Beta(1+x, 1+n−x), 20,000 draws
  seeded by the experiment id), the always-valid p, uniques, conversions with Wilson 95 % intervals, and "about N more
  visitors per version at today's rate" (N from the current `p̄`, the observed lift and τ) until decided. No "winner"
  badge before the stop rule; the status card says "not decided yet" in words, never a progress bar with a filled track
  (rubric §9.F). Decided experiments re-score to `delivered_per_unique` at 7 and 14 days after the decision and show both
  numbers with their n; a reversal ("confirmed said B, delivered says A, n = 61") is displayed, never hidden.
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
campaign and content (= the kit's angles, so the brief is rewritten from what delivered, rf §1.1 step 5), per city with
the **refusal rate** beside the delivery zone's fee (the same number Profit lite's `city_refusal` alert reads,
OPE-§16.2, with the one-tap "mark as not served or raise the fee" link into LAN-§7.3), per device class (orders' user
agent; views have none, so device covers orders only). Refusal rate = refused / (delivered + refused). Every rate shows
its n and hides below n = 20 ("needs 20 orders"); placed, confirmed and delivered never share a tile; the COD funnel is the
signature chart (horizontal stepped bars, delivered in the accent, core §I.6); store timezone; CSV of the aggregates;
test orders excluded; no customer data. R1 ships the lite version as page vitals (LAN-§15.2) and the kit results strip
(LAN-§13.4). Acceptance: every number equals the SQL fixture; the screen of store A never reads B's rows; a page with 19
orders shows no rate.

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
| `<base>/go/<code>` | store | GET | `src/app/s/[store]/go/[code]/route.ts` | R1 w2 | — | 308 `private, no-store` (core §C.4.1, §F.6 redirect class); 410 neutral store page |
| `/kit/<token>` | platform only (proxy area `kit`) | GET | `src/app/(public)/kit/[token]/page.tsx` | R1 w2 | share token (sha256 at rest) | `auth` class: nonce CSP, `noindex`, `private, no-store`, `no-referrer` |
| `<base>/<slug>?sg-test=<token>` (+ `/merci`) | store | GET | existing slug and thank-you routes (T3) + `renderTestDocument` | R1.0 plumbing / R1 w2 mint | test token (core D54) | store document, `private, no-store`, `noindex`, CSP without pixel hashes |
| `/api/public/{order,lead,wa}?sg-test=<token>` | every host the store owns | POST | existing handlers (T3) + `wa` (P3) | R1 | `resolveTestToken` (lint L12) | public JSON |
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
| `pages.write` | saved blocks, copy a page (in both stores), page drafts |
| `campaigns.write` | **new in core rev 2** (`w`, R1, mode landing; owner, admin, editor; "granted with `pages.write`"): links create/edit/pause, campaigns create/compile/pause/share, kit share revocation |
| `pages.publish` | publish (gates), set as home, test-order links (`mintTestLink`) |
| `settings.read` / `settings.write` | read settings; write `policies`, `landing`, the thank-you card (`store.confirmation`) |
| `checkout.write` | zones, calendar, not-served behaviour, new-page form defaults |
| `leads.read` / `leads.write` | the inbox, attempts, follow-ups, lost |
| `orders.reveal_phone` | revealing a lead's phone (audit `lead.phone_revealed`) |
| `orders.assign` | assigning leads |
| `orders.create` | converting a lead or a WhatsApp intent |
| `orders.export` | leads CSV |
| `reports.read` | per-page analytics (R3) |
| `ai.use` | the cloud ad brief |
| `experiments.manage` | request Q29 accepted (core §A.3.1, R3; owner, admin, editor): create, start, stop, apply experiments |
| `health.snooze` | not this part's screen (P2's ring), but the trust and setup issues of LAN-§23.7 are snoozable through it |

### LAN-§23.2 Entitlements, gauges and hard limits (core §A.4, §D.7)

Entitlement keys read: `publish`, `take_orders` (a WhatsApp intent answers `unavailable` when false), `exports_month`,
`php_export`, `cloud_ai` (the cloud brief), `experiments` (R3), and the two keys the core added for this part:
**`campaigns_max`** (limit, default 20 = live or paused kits, gauge `campaigns`) and **`short_links_max`** (limit,
default 200, gauge `short_links`). Both gauges are charged with `chargeUsage(scope, { metric, period: "total" }, 1)` before
the insert and refunded on delete, pause → ended (campaigns) or failure; `usage.reconcile` recounts them nightly (core
§D.7); a `QuotaError` opens the limit sheet (core §I.4). Pending stores keep the plan values (core §A.5.2). Hard limits
in code (`src/lib/landing/limits.ts`, isomorphic constants): 40 zones, 200 saved blocks per store, ≤ 3 experiment arms,
one running experiment per page, templates ≤ 1,000 chars, kits ≤ 64 KB, `wa.me` texts ≤ 1,000 chars, `doc.product.credits`
≤ 12 names. Revision 1's "500 short links, 200 campaigns" constants are superseded by the entitlements.

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

| Job | Every | Core slot (§H.2) | Budget | Does |
|---|---|---|---|---|
| `links.flush` | tick (+ `after()`) | 7 | 1 s | flush short-link and slug-history hit counters (per-store `Map`s listed in `scripts/qa/tenancy-allow.json`, request Q23 accepted) |
| `leads.followups` | hourly | 6 | 2 s | one in-app digest per assignee with due follow-ups (`leads.followups_due`) |
| `delivery.holidays_review` | daily 08:00 (store tz) | 6 | 2 s | the holiday reminder (LAN-§7.2) |
| `pages.copy` (R2) | tick | 7 | ≤ 3 s per tick, resumable cursor (slot 7 is 5 s shared; the job yields when the slot is spent) | continue large page copies (LAN-§17.7) |
| `experiments.weights` (R3) | daily 04:00 (store tz) | 6 | 5 s | Thompson weights + render jobs |
| `experiments.autoend` (R3) | tick | 7 | 1 s | end at the horizon, stop on unpublish |
| `landing.schedules` (R3) | tick | 7 | ≤ 5 s, yields | due page schedules |

The guaranteed budgets registered here sum to ≤ 8 s in any tick and respect the slot sums the core's `test:jobs` asserts
(95 s total). Render handler: reason `product` → `republishAttached` (R2, request Q24 accepted, core §H.3).

### LAN-§23.5 Order hooks (`src/lib/orders/hooks/landing.ts`, core §K.3 extension point; OPE-§3.6 `OrderHook` shape)

```ts
export const hooks: OrderHook[] = [
  { name: "landing.created", phase: "afterCommit", on: ["created"], run: landingCreated },   // never throws into the caller (recordError)
];
```

`landingCreated(scope, e)`: lead attribution (LAN-§10.4; test orders only match test leads); `zone_not_served` appended to
`orders.flags` by a scoped `UPDATE` when the order's `city_key` maps to a not-served zone (LAN-§7.4; request Q17 accepted:
hooks may append `zone_not_served`, the create path itself sets `test`); R3: experiment `variant_key` from the exposure
with the same idem (LAN-§18.5). No `transition` or `edited` hook in R1; R2 adds `onLeadCreated` for webhooks (OPE Q.18).

### LAN-§23.6 Notifications (`src/lib/notify/kinds/landing.ts`, request Q35 accepted, core §I.4) and audit actions

Notification kinds (`NotificationKindDef`, tenant-facing, ar/fr/en titles and bodies in the catalog): `lead.recovered`
(audience `user`: the assignee), `leads.followups_due` (batched, window 60 min), `order.customer_request` (`store_role`
owner/admin/manager + the assignee), `order.confirm_intent` (queue badge only, no row), `delivery.holidays_review`
(`store_role` owner/admin, once per 30 days), `landing.sync_failed` (R2), `landing.schedule_failed` (R3),
`experiment.decided` (R3). `vars` carry ids, counts and short labels, never customer data.
Audit actions (appended to the `AuditAction` union by the core, §F.5 "landing (LAN Q35, LAN-§23.6)"):
`store.delivery.updated`, `store.policies.updated`, `store.landing_settings.updated`, `page.proof_attested`,
`page.countdown_extended`, `page.test_link_created`, `page.slug_moved`, `page.attached`, `page.detached`, `page.copied_out`,
`page.copied_in`, `page.scheduled_publish`, `lead.phone_revealed`, `lead.converted`, `campaign.created`, `campaign.shared`,
`campaign.share_revoked`, `link.created`, `link.paused`, `experiment.started`, `experiment.stopped`, `experiment.applied`.

### LAN-§23.7 Store Health rules (`src/lib/health/rules/landing.ts`; core §I.7, SF-03; groups and points per `HealthRule`)

| Id | Group | Sev. / points | Rule (store data only; silent below `minN`) | Fix |
|---|---|---|---|---|
| `landing:no_live_page` | setup | 3 / 10 | no published landing page while the store is `active` and mode allows landing | link `/pages` |
| `landing:zones_empty` | setup | 2 / 6 | zones off or empty in a market with a city list while a live page shows a fee | link `/settings/delivery` |
| `landing:holidays_unreviewed` | setup | 1 / 3 | `holidaysReviewedYear < year` (January, or Ramadan / Eid months) | link `/settings/delivery` |
| `landing:policies_unreviewed` | setup | 1 / 3 | `policies.reviewedAt` null with ≥ 1 live page | link `/settings/policies` |
| `landing:no_caller` | setup | 1 / 3 | thank-you expectation on, no `confirmation.callerPhone` | link `/settings/checkout` |
| `landing:countdown_ended` | trust | 3 / 10 | a live page's `countdownEnd` passed (the runtime hides it; the page still carries dead urgency) | action `remove_countdown` (opens the Offers tab) |
| `landing:compare_not_higher` | trust | 2 / 6 | a live item with `compareAt ≤ price` | link to the page's Product tab |
| `landing:stock_zero` | trust | 2 / 6 | a live page with `stockLeft = 0` | Offers tab |
| `landing:stock_stale` | trust | 1 / 3 | `stockLeft` unchanged > 14 days on a live page | Offers tab |
| `landing:proof_unattested` | trust | 2 / 6 | a live page with a visible proof section whose `sample` was cleared before the attestation sheet existed (pre-R1 docs) | the section |
| `landing:no_seo` | conversion | 1 / 3 | a live page without `seo.title` or `seo.description` | SEO tab |
| `landing:no_alt` | conversion | 1 / 3 | ≥ 1 hero or gallery image without `alt` on a live page | Media |
| `landing:no_pixel` | conversion | 2 / 6 | a live page with `tracking.none !== true` and no pixel id (the per-page answer, OFFERS D6) | Pixels tab |
| `landing:form_hidden` | conversion | 3 / 10 | a live page whose order form is `hidden` | Form tab |
| `landing:leads_slow` | conversion | 1 / 3 | first-contact p50 (28 d) > `landing.leads.firstContactTargetMin`, n ≥ 20 leads | link `/leads` |
| `landing:wa_intents_waiting` | conversion | 1 / 3 | WhatsApp intents `new` for > 2 h inside the calling window, n ≥ 3 | link `/leads?kind=whatsapp` |

Each rule runs ≤ 40 ms through the scope, reads no other store, and is covered by a fixture with and without `minN`
(`test:health`, P1's harness imports this file's fixtures). The hard publish items of LAN-§3.2 never appear here: a page
with a hard item is not live.

### LAN-§23.8 Pulse contributor (`src/lib/pulse/contributors/landing.ts`; core §I.4 `StorePulse.counts`, SF-06)

`contribute(scope, viewer)` answers `{ leadsDue, leadsNew, waIntentsNew }` in ≤ 50 ms from one indexed query each
(`leads_store_next_idx`, `leads_store_status_idx`); agents get only their own `leadsDue`; a failure omits the keys. The
inbox badge in the nav and the Today brief's "N leads to follow up" read them; `test:pulse` covers the shape.

### LAN-§23.9 ⌘K commands and search (`src/components/admin/shell/commands/landing.ts`, `src/lib/admin-data/search/landing.ts`; core §I.3)

Commands (`CommandDef`, filtered by `can()`, mode and release): "Publish this page" (`pages.publish`, inside the builder),
"Open a test order" (`pages.publish`, `mintTestLink` of the current or home page), "Create a campaign"
(`campaigns.write`), "New short link" (`campaigns.write`), "Delivery zones" / "Policies" (jump). Search provider
(`kinds: ["lead", "wa-ref", "page", "campaign", "link"]`, ≤ 120 ms): a typed `WA-XXXXXX` ref opens the intent; a page by
slug or title; a campaign by name or slug; a short-link code. Agents' results are limited to their own leads.

### LAN-§23.10 Flags

None declared in R1 (`src/lib/flags/defs/landing.ts` is not created); the WhatsApp order, tracking requests and lead
capture are store settings, and the kit's cloud brief follows the ai flags.

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
| `/app/<h>/links` | `pages.read` (edit `campaigns.write`) | R1 w2 | P3 | LAN-§12.2 | en |
| `/app/<h>/campaigns`, `/campaigns/<id>` | `pages.read` (edit `campaigns.write`) | R1 w2 | P3 | LAN-§13.4 | en (kit content ar/fr/en) |
| publish dialog and builder checklist items of this part (`landing.gate.*`) | `pages.publish` | R1 | P3 (strings), P6 (dialog mount) | LAN-§3.2, LAN-§6.5 | ar, fr, en (`test:i18n-coverage`) |
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
| `test:kit` | `scripts/qa/kit-check.ts` | LAN-§13.6 over the 60 AI fixtures (template path); the kit compiles with Cloud AI off; `/go/<code>` query parity; 410 when paused; 404 after share revocation (core §J.1 row `test:kit`, `test:links`) |
| `test:test-orders` | `src/lib/testing/selftest.ts` | LAN-§14.4: token mint/verify (2 h, store-bound, A's token refused on B), `renderTestDocument` without pixels and with the banner and `?sg-test=` endpoints, `is_test` propagation (core §J.1) |
| `test:honesty` | `src/lib/landing/honesty/selftest.ts` | LAN-§6.4 `auditNumbers`: the baseline contradictions produce the expected findings, the keep-list pages 0, digit systems equal, isolates never flagged; `policyAllows` claim scan |
| `test:prepublish` fixtures | `src/lib/render/prepublish/landing.fixtures.ts` (imported by the core's `selftest-prepublish.ts`) | LAN-§3.2.1: every `honesty:*` and `form:*` id refuses on its fixture with the right `sectionId` / `field`; the keep-list pages pass with 0 hard items; `warn` mode never silences an honesty item |
| `test:cod-invariants` | `src/lib/landing/cod-invariants.selftest.ts` | LAN-§3.7: `codInvariants()` on the 41-page baseline set (23 stage pages fail `foldOk`, the form on screen 14-17 fails `formScreen ≤ 3`) and on the keep-list pages (all true) |
| `test:experiments` (R3) | `src/lib/experiments/selftest.ts` | LAN-§18.8 simulations, fingerprint stability, `pMin` monotone under daily peeking |
| checklist fixtures | `src/lib/editor/selftest-checklist.ts` (new) | every LAN-§3.2 item fires and clears; each id equals its gate id |
| render-check (extended) | `scripts/qa/render-check.ts` (T3; fixtures added through Q3) | new chunk budgets and page caps, delivery fallback text, thank-you timelines × policies, no `aggregateRating`, test render without pixels, byte identity when add-ons are off; **rev 2:** order-form contract per variant (≤ 1,100 px estimate, one submit, 0 glass, ≤ 4 reveals, no kicker, visible boundaries ≥ 3:1, no one-value picker), COD line exactly twice, ≤ 1 `[data-countdown]`, ≤ 1 `.lp-trust`, thank-you ≤ 8 reveals / ≤ 1 aurora / 0 glass, every id and price in `<bdi dir="ltr">` with `tabular-nums` |

### LAN-§25.2 DB-backed (`npm run test:db`, throwaway `cod_test_*` databases)

| Script | Checks |
|---|---|
| `test:tracking` (`scripts/qa/tracking-check.ts`) | LAN-§9.5 |
| `test:leads` (`scripts/qa/leads-check.ts`) | capture with `sel`, the LD12 attribution fixtures, WhatsApp intents (refs, NULL phone), conversion through the manual-order stub, retention purge |
| `test:tenancy` additions (`scripts/qa/tenancy-check.ts`, T4's file, cases listed for T4/P3) | zones, leads, intents, short links, campaigns and share tokens, slug history, test tokens, experiments and exposures of A unreachable from B (actions, public APIs, ⌘K) |
| `test:public-api` additions | the new buckets; `wa`, `track`, `exp` refused for non-servable stores and for foreign hosts |

### LAN-§25.3 HTTP and e2e

`qa:headers` (track, go 308/410, kit share, test render); `qa:publish-gates` (core, maintainer): the sample-review page
refused with `honesty_blocked` naming the section, the design-baseline worst page refused with `budget_blocked`, the
publish dialog lists the fixes; Playwright msedge steps `delivery`, `wa-order`, `thank-you`, `tracking`, `test-order`,
`form` (the LAN-§3.5 measurements on the 41-page set), `floating` (LAN-§5.4) in `qa/e2e`; the P3 step modules of
`qa:wow-demo` (LAN-§3.8), which together run the landing half of the rf §4 three-minute demo (checks 1, 2, 4, 5) on a
390 px viewport with 4G throttling, Cloud AI off.

---

## LAN-§26 File ownership

### LAN-§26.1 R1 product, track P3 LANDING (core §K.2 P3 row, verbatim in rev 2)

Owned (create, modify, delete): `src/lib/editor/checklist.ts`, `src/lib/delivery/**`, `src/lib/tracking/**`,
`src/lib/orders/leads.ts`, `src/landing/thankyou/**`, `src/landing/sections/orderForm/**`, `src/landing/addons/**`,
`src/landing/runtime/addons/**` (the add-on chunks `assist`, `assist-ty`, `track`; replaces the single
`entry-delivery.ts` of rev 1), `src/landing/legal/**` (from R1 product, Q16), `src/lib/{policies,leads,wa-order,links,
campaigns,testing,landing}/**` (`landing/**` = copy, templates, slugs, vitals, mode-plan, cod-invariants, honesty,
limits), `src/lib/render/prepublish/landing.ts` (the honesty gate; **not** `gates/landing.ts`, Q13 as decided) and its
`landing.fixtures.ts`, `src/lib/orders/hooks/landing.ts`, `src/lib/settings/keys/{policies,checkout,landing}.ts`,
`src/lib/health/rules/landing.ts`, `src/lib/pulse/contributors/landing.ts`, `src/lib/notify/kinds/landing.ts`,
`src/lib/admin-data/search/landing.ts`, `src/components/admin/shell/commands/landing.ts`, `src/app/s/[store]/{track,go}/**`,
`src/app/api/public/{track,wa}/**`, `src/app/(public)/kit/**`, `src/app/app/[store]/{leads/**, links/**, campaigns/**,
settings/{checkout,delivery,policies}/**}`, `src/app/api/app/[store]/leads/**`,
`src/components/admin/{leads,pages,delivery,policies,links,campaigns,landing}/**` (`pages/**` moved to P3, Q19),
`src/components/admin/shell/nav/landing.ts`, `src/lib/i18n/admin/<locale>/landing.ts`, `src/lib/jobs/tracks/landing.ts`,
`scripts/qa/{tracking-check,leads-check,kit-check}.ts`, `src/lib/testing/selftest.ts`, `src/lib/links/selftest.ts`,
`src/lib/landing/honesty/selftest.ts`, `src/lib/landing/cod-invariants.selftest.ts`, `scripts/qa/tenancy-cases/landing.ts`,
the P3 step modules of `qa/e2e`.

Delivered for P3 by other tracks (so P3 never edits their files): T3 in R1.0 the render add-on hook, `purchaseInBrowser`,
`renderTestDocument()` wiring in the slug and thank-you routes, `resolveTestToken()` in `create.ts` / `leads.ts`, the
`aggregateRating` removal, the slug-history 308 (core §K.1); T4 in R1.0 `buildChecklist(doc, ctx: LandingCheckContext)`
and `recordSlugMove` (core §K.1); the maintainer at P0 the P0 stubs this part implements (`zoneLineFor`,
`zonesForCheckout`, `etaWindow`, `signedTrackPath`, `waConfirmText`, `markLeadConverted`, `landingModeSwitchPlan`,
`mintTestLink`, `compileKit`), the `landing` / `policies` / `checkout` key schemas, `budgets.json` keys and the
registrations of every extension file above (core §K.2 P0, §K.3); P6 the `ProofAttestSheet` mount (Q31) and the
`features.slots` entry of the form thumbnail; P7 the `ad.brief` and `callcenter.script` tasks (Q20); P5 the IN-05
template kind and the `wa_order_reply` kind; P2 the address-card entries and the `C` quick action; P4 the TEST chip,
`convertLeadToOrder` and "Delete test orders".

Read-only for P3 (changes through a CCR, core §K.3): `src/landing/document.tsx`, `src/lib/render/**` (except
`prepublish/landing.ts` and its fixtures), `src/landing/runtime/**` (except `addons/**`), `src/lib/page/**`,
`src/lib/orders/{contract,create,validate,text,upsell,resolve}.ts`, `src/lib/editor/**` (except `checklist.ts`),
`src/components/builder/**`, `src/components/preview/**`, every other `src/landing/sections/**` (design's P6, incl.
`stickyCta` and `whatsappFloat`), `scripts/build-landing-assets.mjs`, `src/landing/runtime/budgets.json`,
`src/lib/render/prepublish.ts` (the registry).

Wave 1 (merge order slot P3 in core §K.2, after P4 and before P7): LP-01 checks incl. the order-form contract and the
honesty gate, LP-02, LP-03 (+ ETA dates), LP-04, LP-05, LP-06, LP-20, LP-21, LP-22, the health rules and the pulse
contributor. Wave 2 (after P6, before integration; it needs P7's `ad.brief` and P6's structure tags): LP-11, LP-12, LP-18,
LP-19 and the `qa:wow-demo` steps.

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

### LAN-§27.1 Revision 1 requests and how core revision 2 decided them (core §Q.3)

Every request below was decided in core §Q.3: **all 38 accepted**, two with changes this revision has applied in its
text: **Q12** (`/kit/*` is its own proxy area `kit` with `auth`-class headers, core §C.3; the share page is
`src/app/(public)/kit/[token]/page.tsx`, core §C.4) and **Q13** (one registry `src/lib/render/prepublish.ts` merged with
design's DES-R3; this part's file is `src/lib/render/prepublish/landing.ts`, the codes are `honesty_blocked` /
`design_blocked` / `budget_blocked` with `items: GateItem[]`, honesty has no warn mode; LAN-§3.2.1). Q2 was accepted as
a guarded type change (core §D.8); Q21 with `is_test` core-owned (D54); Q24 as a refinement of D50. The table keeps the
revision 1 wording so a reviewer can compare it with the core's "Where integrated" column; the body of this document
is already aligned with the decisions. Each request names the exact change; "Owner" = who applies it.

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

### LAN-§27.2 Second-round requests (revision 2)

None are unavoidable: every contradiction found between revision 1 and core revision 2 was resolved inside this document
(LD14 308 + `no-store`; LD16 the D54 token; LD40 `campaigns.write` and the two entitlements; the `/kit` page file; the
registry file name). Three notes for the maintainer's §P, not requests:

| # | Note | Where |
|---|---|---|
| N1 | Core §M.1 rule 4 lists `recordPublishFeedback` under both the landing and the ai listeners; this part's listener does **not** call it (ai's does, AI R22). A one-word fix in §M.1 keeps one caller. | core §M.1 |
| N2 | Storefront STO-§15.8 expects `etaWindow(zone, now, cal, locale)`; this part ships that shape as `etaWindowText` beside its primitives (LAN-§7.2), so S1 writes no second implementation. No core change; the R2 contract step may name `etaWindowText` in the STO-R19 stub list. | core §K.4 |
| N3 | Core §C.4.1 and §F.6 give `/go/<code>` a 308; LAN-§12.1 adds `Cache-Control: private, no-store` on that response so a short link's target may change. `qa:headers` should assert the header on the `go` row. | core §F.6, §J.3 |

---

## LAN-§28 Elevation changes (rev 2)

Every change of this revision, what it does and where it came from. Codes: **DB** = design-baseline §5 target id, **RA** =
rethink-ai section, **RF** = rethink-features section, **Q** = this part's request id as decided in core §Q.3, **D** =
core decision, **DES / OPE / STO / AI / PLA** = a sibling part spec section.

| # | Change | Why | Source |
|---|---|---|---|
| 1 | Status → revision 2; inputs widened (baseline, both rethinks, the rubric); code facts re-verified at `a0ffec1` (no `src/` change since `68c3793`); owner summary items 13-17 | brief item 16; the elevation pass must state what is enforced, not advised | header; brief item 16 |
| 2 | LD1 … LD3, LD14, LD16, LD17, LD20, LD30 rewritten to the core's decisions (D62 add-on hook, 308 + `no-store`, D54 token, `GateItem` codes, D50 refined, release moves accepted) | the core wins where the texts disagreed | Q3, Q5, Q6, Q13, Q21, Q24, Q33; D50, D54, D62 |
| 3 | New decisions LD31 … LD40: one gate registry with the honesty gate here; the order-form contract; the numbers audit; kicker-free COD surfaces; the floating-layer rule; countdown once; the Director's R9 invariants; thank-you / tracking budgets; the wow demo as acceptance; `campaigns.write` and the two entitlements | the measured baseline named the root causes; each decision closes one | DB F1-F5, D1, D2, R3, R7, C5; RA §1.3, §9.9; RF §4; D51, D52; core §A.3.1, §A.4 |
| 4 | LAN-§1 rows updated (acceptance now names the typed refusal and the fixtures); LAN-§1.3 signature features SF-01, SF-05, SF-08, SF-10 and the SF-03 / SF-06 contributor duties | core §K.2 assigned them to P3 | core §K.2 ownership paragraph, §L.2 SF rows; RF §3.1 |
| 5 | LAN-§2 records each table's core decision; `is_test` core-owned; `page_versions` provenance columns noted as ai's; the three settings keys as decided | the maintainer cuts 0005 from these lists | core §D.5, §D.9, §D.10; Q1, Q2, Q7, Q9, Q10 |
| 6 | LAN-§3 retitled; §3.2 checklist ids renamed to the gate ids and widened (`honesty:I4`, `I5`, `D1`, `D2`, `countdown_twice`, `stock_untyped`, `promise`, `form:F1`, `form:F3`); §3.2.1 the honesty gate on the core registry with its fixtures | the panel and the dialog must show one id; the server must refuse | D51; core §M.1, §M.3, §M.5; Q13; DB I4, I5, D1, D2 |
| 7 | **LAN-§3.4** the quality contract: every DB §5 target mapped to its gate, owner, this track's contribution and test | "every target applies to landing pages first" (brief) | DB §5 all rows, §6 keep-list; core §M.2-M.4, §L.3 |
| 8 | **LAN-§3.5** the order-form contract OF1 … OF12 (position, ≤ 1,100 px, options honesty, visible boundaries, one submit, upsell placement with the bump as a budgeted frozen feature, the COD line in the fold, no kicker / ≤ 4 reveals / 0 glass, price cluster, one trust surface, phone and city plumbing, motion) | the form was the weakest conversion surface (screen 14-17, 2,840 px, invented per-piece options, underline fields) | DB F1-F4, C2, R1-R7, T1, RTL4; design-baseline §3.9; keep-list 3-5 |
| 9 | **LAN-§3.6** thank-you and tracking design budgets; **LAN-§3.7** COD invariants shared with the Director's R9 and `codInvariants()`; **LAN-§3.8** the three-minute demo steps P3 contributes | this part's HTML needs its own budgets; one standard for instant and Director pages; the demo is exit criterion 12 | DB R4, R5, R8; RA §1.2, §1.3 R9; RF §4; core §K.2 (12), §J.3 |
| 10 | LAN-§4 `landingModeSwitchPlan` stub and nav items Campaigns / Links | accepted safeguard | Q34; core §A.2, §I.3 |
| 11 | LAN-§5 aligned with D62 (`banner`, `video-hero`, build, reserved R3 keys, data-block byte caps); §5.3 test and `purchaseInBrowser` rows; **§5.4** the `assist` chunk's `[data-lp-cta-visible]` duty | new behaviour without touching the frozen chunk; the floating-layer rule needs one observer | D62; core §H.13, §H.3; OPE Q.6; DB R7 |
| 12 | LAN-§6.1 proof material and library-figure rules; §6.2 countdown-once and stock-untyped gates; §6.3 `honesty:promise`; **§6.4** `auditNumbers`; **§6.5** gate messages ar/fr/en | invented proof and contradictory numbers on every baseline page | DB I4, I5, D1, D2; core §M.3; AI-§D.2 rule 5; core §I.5 coverage |
| 13 | LAN-§7 `zonesForCheckout`, `deliverySummary`, `etaWindowText` (storefront's shape); health rules for zones and holidays; tenancy case | one ETA implementation for landing and store; P0 stub names | core §K.2 P0; STO-§12.3, §15.8; RF §1.6 |
| 14 | LAN-§8 `purchaseInBrowser`, `waConfirmText` (P0 stub), F4 placement | the thank-you must not fire a browser Purchase on confirmation-call stores | OPE Q.6; core §H.3, §K.2 |
| 15 | LAN-§9 `resolveOrderForTracking(orderId, sig)`, `signedTrackPath` (P0 stub), S1's chrome wrapper | the core's resolver signature | Q11; core §E.2; STO-R18 |
| 16 | LAN-§10 raised: city kept for `{eta_text}`, risk hints from customer history, first-contact p50 and `firstContactTargetMin`, "Set phone" merge of intents, keyboard, `markLeadConverted` / `onLeadCreated` stubs, pulse `leadsDue` | abandoned-lead recovery as an operator tool, not a list | brief "raise: abandoned-lead recovery"; OPE-§11.4, Q.18; core §I.8 rule 3 |
| 17 | LAN-§11 raised: `{eta_text}` in the WhatsApp text when a city was picked, `effectiveHost` check, test token, intent ↔ order dedupe, `wa_order_reply` quick reply, ⌘K search provider | WhatsApp-first ordering done better than every Moroccan tool | RF §1.11; Q12, Q18; D18 |
| 18 | LAN-§12 308 + `no-store`, `campaigns.write`, `short_links_max`, pending-store rule | the core's redirect class and quotas | core §C.4.1, §A.3.1, §A.4, §A.5.2 |
| 19 | LAN-§13 `compileKit` signature (P0 stub), `campaigns_max`, `campaigns.write`, the cloud brief as pattern A with `ad.brief` + `callcenter.script`, the publish-listener staleness, `/kit/[token]/page.tsx` with `auth` headers, token revocation retention | SF-01 as the R1 unit of work | RF §1.1; Q12, Q20; core §H.12, §K.2 P7, §M.1 rule 4, §H.11 |
| 20 | LAN-§14 rewritten to D54: `mintTestLink`, store-bound 2 h token, `?sg-test=` on the page URL **and** on the baked API endpoints, `endpoints.event` omitted, `resolveTestToken` in the public handlers (L12), exclusions per OPE-§26, `test:test-orders` | one mechanism for the demo and for QA; the frozen chunk untouched | D54; core §C.4.1, §E.2, §F.1 L12, §J.1; OPE-§26; RF §3.1 SF-05 |
| 21 | LAN-§16 exports run the registry in `block` mode | an export is a publish | core §M.1 rule 5 |
| 22 | LAN-§17 aligned with `attach_opts`, `product_rev`, `attachedDocFor` + `fallback`, read-only mirrored fields | one order pipeline and one price truth on attached landings | STO-R6, R12, R18; Q24, Q25 |
| 23 | LAN-§18 SF-10: engine ownership restated, `pMin` monotone, Wilson intervals, re-scoring to delivered at 7/14 days with visible reversals, no progress-bar tells, `experiments.manage` as decided | honest statistics sellers can peek at | D58; RF §1.8; Q29, Q38; rubric §9.F |
| 24 | LAN-§20.3 per-page analytics raised: per-angle results feed the brief, per-city refusal beside the zone fee with the Profit lite link, min n = 20, the COD funnel | the page, the fee and the profit line are one object | brief "raise: per-page analytics"; OPE-§16.2; RF §1.1 step 5; core §I.6 |
| 25 | LAN-§22 routes: `go` 308, `kit` page and area, `sg-test` rows | the core route table | core §C.3, §C.4, §C.4.1 |
| 26 | LAN-§23 permissions (`campaigns.write`), entitlements and gauges, jobs with core slots and yield rules, the `OrderHook` shape, notification kind defs; **§23.7** 16 health rules, **§23.8** pulse contributor, **§23.9** ⌘K commands and search, **§23.10** flags none | extension points the core registered for this track | core §A.3, §A.4, §D.7, §H.2, §I.3, §I.4, §I.7, §K.3; OPE-§3.6; Q17, Q18, Q23, Q35 |
| 27 | LAN-§24 screens with `campaigns.write`; gate titles in ar/fr/en | coverage test | core §I.5 |
| 28 | LAN-§25 tests: `test:test-orders`, `test:honesty`, `test:cod-invariants`, prepublish fixtures, render-check contract rows, `qa:publish-gates`, the `form` and `floating` steps, the wow-demo modules | every new rule has a test that fails when it breaks | core §J.1-J.3 |
| 29 | LAN-§26 ownership = core §K.2 P3 row verbatim, with what other tracks deliver for P3 and the wave order (wave 2 after P6) | tracks build only against frozen seams | core §K.1, §K.2, §K.3; Q16, Q19, Q31 |
| 30 | LAN-§27.1 decisions recorded, **§27.2** no second-round requests, three notes for §P; **§28** this table; §29 review decisions | brief item 16 asked that nothing be lost between research and build | core §Q.3, §P |

---

## LAN-§29 Review decisions

(Empty in revision 2. Filled after the reviews: each row = reviewer, point, decision, section changed.)
