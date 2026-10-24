# Store Gen SaaS part spec: storefront (store mode, catalog, page kinds, cart and COD checkout, payload v3, SEO, speed, accessibility, "both" mode)

Status: **part spec, revision 6 (wording tidy)** (revision 6 fixes the confirming critic's wording minors that name this file, one line per item in **STO-§30.4**; revision 5 integrated critic r2) (2026-10-24, storefront part architect). Revision 5 applies
the final critic's issues that name this file (CRIT2-9, CRIT2-17, CRIT2-20; **STO-§30.3**) against core revision 5;
revision 4 integrated review round 2. Revision 2 was
the elevated spec; revision 3 resolved every round-1 review finding that names this file or its cross-file side;
**revision 4** re-reads every one of those findings against the core's rev 3 decisions (**core §P**, **§Q.8**, D65-D76)
and resolves the critic's round-2 findings (CRIT1, CRIT3, CRIT13, CRIT15, CRIT17): **STO-§30.1** keeps the round-1
decisions, **STO-§30.2** lists one line per round-2 finding id, and **STO-§29.5** records the contradictions found
between this file and the core (paragraphs marked **rev 3** are round-1 changes, **rev 4** round-2 changes). Built on
`docs/STORE-SAAS.md` **revision 3** (the core contract, cited **core §X**; its appendix **§Q.2** decided every request of
revision 1, all 24 accepted, and **§Q.8** decided the third-round requests STO-R28 … R42, all accepted, R32 and R39 with a
change that this revision adopts), on the settled
research decisions of `docs/saas/RESEARCH.md` §2 (cited **R-D1 … R-D53**), on the measured design baseline
(`docs/saas/research/design-baseline.md`, cited **DB §x** and by target id N*/C*/T*/K*/I*/R*/D*/RTL*/F*), on the two
rethinks (`rethink-features.md`, cited **rf §x** and **SF-01 … SF-12**; `rethink-ai.md`, cited **ra §x**) and on
`qa/ref/anti-slop-frontend-rubric.md` (cited **rubric §x**, adopted where it does not conflict with the owner rules: its
orange-family palette suggestions are void and Arabic keeps its own type rules). It covers every storefront feature id
**ST-01 … ST-22**, the "both" mode ids **LP-07** (attach a landing to a product) and **LP-08** (campaign vs inherit,
storefront side), the store registers of **DG-11** where they are storefront-specific, the TENANCY-MAP items the core
hands to this part (LND-01, LND-03, LND-04, LND-06, LND-09, LND-10, LND-11, LND-15, LND-30, LND-31, LND-33, LND-34,
ORD-19, ORD-20, PUB-23), and the **store side of the signature features** the core assigns to this track (core §K.2,
§L.2): SF-02 Design DNA visible on store pages, SF-03 Store Health inputs, SF-05 Test-order mode on store pages, SF-08
Delivery Promise with ETA as dates, SF-10 Experiments (consumer of landing's engine), SF-12 Catalog from photos, plus
WhatsApp-first ordering on the store (rf §1.11). Section ids carry the prefix **STO-§** so references to the core
(`core §E.2`) and to sibling parts (`design.md DES-§11`, `ai.md AI-11`, `landing.md LAN-§17`, `operations.md OPE-§26`,
`platform.md`) stay unambiguous. The section **STO-§31 Elevation changes (rev 2)** lists what changed and why, with
the source of each change.

This document refines only what core §D.9 gives the storefront part: the tables `products`, `collections`,
`collection_products`, `inventory_levels`, `reviews`, `review_requests`, `coupons`, `coupon_redemptions`, `stock_holds`;
the values of `pages.kind`; and the schemas of the store settings `storefront`, the R2 block of `checkout`, and
`reviews` (core §D.10). Everything else it needs (a new table, a shared-file change, a resolver, a budget key, a route
class, a permission) is listed in **STO-§29 Requests to the core** with the exact change. Nothing here edits the core.

Inputs: `docs/STORE-GEN-BRIEF.md` items 1, 5, 7, 8, 9, 14, 15, 16 (item 16 = this elevation pass) · `docs/HANDOFF.md`
§2 (owner rules), §4 (Hostinger) · core rev 3 (mostly §0 D50-D76, §A.2, §A.3, §A.4, §C.4.1, §C.6, §C.8, §C.9, §D.2,
§D.6, §D.9, §D.10, §E, §F.6, §H.3, §H.12, §H.13, §I.4, §I.7, §I.8, §J, §K.4, §K.5, §M, §P, §Q.2, §Q.8) · RESEARCH §2-§4 ·
`docs/saas/research/storefront.md` (the area study, cited **sf §x**) · `docs/saas/research/cod-ops.md`,
`design-gen.md` · `docs/saas/research/design-baseline.md` (DB; §4 root causes, §5 targets, §6 keep-list) ·
`docs/saas/research/rethink-features.md` (rf; §1.6 Delivery Promise, §1.10 Catalog from photos, §1.11 WhatsApp-first,
§1.2 Design DNA, §1.3 Store Health, §1.8 Experiments, §3.1 SF-05, §4 the wow demo) · `docs/saas/research/rethink-ai.md`
(ra; §1 Director loop, §1.5 the job model, §4.9 store blueprint, §9 changes) · `docs/saas/TENANCY-MAP.md` ·
`docs/saas/spec/design.md` revision 1 (DES-§4 genome and `GRAMMARS`, DES-§5 choreography incl. §5.6 store page kinds
and §5.3 height model, DES-§8 gates, DES-§11 registers, DES-§14.4 store generation, DES-§15.4 DNA card, DES-§16.17
screen checklist) · `docs/saas/spec/landing.md` revision 1 (LAN-§5 add-ons, LAN-§7 delivery API and `etaWindow`,
LAN-§11 WhatsApp order, LAN-§14 test links, LAN-§17 attached landings incl. LD21 overrides, LAN-§18 experiments) ·
`docs/saas/spec/ai.md` revision 1 (AI-04, AI-09, AI-10, AI-11) · `docs/saas/spec/operations.md` revision 1 (OPE-§3.6
hooks, OPE-§12.7 drawer, OPE-§19.4 Sheets row, OPE-§26 test orders) · `docs/OFFERS.md` (items, offers, options,
pricing, payload v2: cited **OFFERS §X**) · `docs/DESIGN.md` (v2 today; v3 = DG-01 at step C0). Code facts are
`path:line` at commit `a0ffec1` (`src/**`, `scripts/**` and `package.json` are byte-identical to `68c3793`, where
revision 1 verified them: `git diff --stat 68c3793 a0ffec1 -- src scripts package.json` is empty). Next.js is 16.4:
store pages are **route handlers** that return HTML (the pattern of `src/app/[slug]/route.ts:11-40`: `await
connection()`, then a `Response`), not React Server Components; the request hook is `src/proxy.ts` (core §C.3),
untouched by this part; `after()` is used from route handlers
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).

Reading order for a build agent: STO-§0 (decisions) → STO-§1 (your feature rows) → STO-§27 (the files you own) → the
sections your files touch → STO-§26 (tests you must keep green) → STO-§29 (what the core decided, the second- and
third-round requests and the rev 4 contradictions of STO-§29.5) → STO-§30 (the review decisions of rounds 1 and 2) →
STO-§31 (what changed in revision 2, and the rev 3 / rev 4 pointer rows).

Frozen for the whole of R2, unchanged by this revision (core header): landing **PageDoc v2**, **runtime config v2**,
**order payload v2**, the **PHP export** and the landing runtime chunk at its recorded budget (**24,200 B gz** at
`a0ffec1`, `src/landing/runtime/budgets.json:3`). **rev 3 (ENGP-26):** T3 edits four runtime modules in R1.0 for the
per-store storage-key prefix (core §C.9, §K.1), so "frozen" means **frozen after R1.0**: T3 re-measures the chunk,
records its gzip size in `budgets.json` and its sha256 in `src/landing/runtime/landing.sha256` (the R2 contract step
copies that hash into the storefront fixtures), and every storefront assertion on the landing chunk (STO-D7, STO-§14.1,
`qa:storefront-render`) is against **that** build, never against the pre-R1.0 bytes. **rev 4 (core header freeze rule,
ENGC-10):** the gate on the number is **tolerance 0** against the recorded budget and `landing.sha256` (rev 3 said
"render-check's +5 %"; the core keeps +5 % for every other chunk only); should T3's prefix bytes push the chunk past
24,200 B, the re-freeze is the owner's decision recorded in core §P, and the storefront fixtures copy whatever value is
recorded. Every store behaviour ships in **new chunks** with their own budgets (core D62, §H.13; STO-§14).

### Owner summary (plain English)

1. A seller who picks **"full store"** or **"both"** gets a real shop: a home page, collections, product pages, search,
   a cart, a one-page cash-on-delivery checkout, a thank-you page, order tracking, policies, contact and their own
   extra pages. Landing pages keep every feature they have; in "both" mode a landing page can be **attached** to a
   catalog product so price, options and stock come from one place.
2. Products use the same **items, packs and options** as landing pages today (Offers v2): "2 pieces −15 %", colour ×
   size, a name to print, gifts. The price you see in the shop, in the cart, on the landing page and on the order is
   computed by the same code, in whole cents.
3. Two ways to buy, chosen per shop: the **order form right on the product page** (best for 1-3 products and ad
   traffic: an ad click becomes an order with no extra page), or a **cart** with "Order now" for bigger catalogues.
   Both send the order through the same checked path, and the server always re-computes the price.
4. The checkout asks only what a COD order needs: name, phone, city, a one-line address (Morocco). The city list
   searches in Arabic, French and English, accepts "Casa" or Arabic letters, and shows **"Delivery to Tanger: Wed 29
   or Thu 30 · 25 DH"** from the zones you type. We never invent a fee or a delay: no zone, no line.
5. If a price changed while the shopper was on the page, the checkout shows the new price and asks them to confirm. A
   shopper is never charged a price they did not see.
6. Stock: you can mark things sold out, or type counts. Counts go down when an order **ships** (not when it is
   placed, because many COD orders never ship). We never show "only 3 left" unless you typed a real count and turned
   that on.
7. Reviews and star ratings appear only from **real customers who received their order** (R3). Until then the shop
   shows none. Typed or sample reviews can never be published.
8. Store pages are built on request and kept in memory, so a price change shows everywhere at once, without
   re-publishing hundreds of pages. Pages stay fast on cheap Android phones on weak 3G: small pages, one big image
   first, very little JavaScript.
9. The header, menus, footer, announcement bar and WhatsApp button are set once for the whole shop. Your logo comes
   from the brand kit. Arabic pages are perfectly right-to-left.
10. Google and WhatsApp see clean links (`/p/argan-oil`, `/c/skin-care`), correct product data (price, availability,
    variants), a sitemap per shop and no duplicate pages: a landing page attached to a product points Google to the
    product page by default.
11. Every shop looks like itself: the home page has four layouts in R2 (one hero product, category tiles, editorial,
    dense catalogue) and four more in R3, filled by the design engine so two shops don't repeat each other.
12. Release plan: **R2** = the whole store (catalog, pages, cart, checkout, payload v3, SEO, accessibility, attached
    landings, delivery dates). **R3** = filters and instant search, verified reviews, coupons, stock holds, size
    guide, breadcrumbs, more languages per shop, faster navigation, four more home layouts. The EU legal pack comes
    with the first EU shop.
13. What you need to do: nothing for R2 beyond typing your delivery zones (or one delivery fee) before the checkout can
    go live, and choosing your buy model (the app suggests one).
14. **New in revision 2.** Your shop is **art-directed, not templated**: the home page and the product page each have
    six to eight structurally different layouts ("hero grammars") chosen from your store's design DNA, and no single
    layout may dominate a niche. Every product page keeps the photo, the name, the price, the cash-on-delivery line and
    the buy button on the first phone screen, whatever the layout. The server refuses to publish a home page that is
    too long, too heavy or that shows a proof section without real material, and tells you what to fix.
15. **Test orders without side effects.** "Open a test order" from your address card walks home → product → checkout
    → thank-you → the agent's queue on a phone; the order is marked TEST, never reaches Sheets, pixels, your numbers
    or the learning tables, and you can delete it afterwards.
16. **Delivery dates by city** on the product page, in the cart and at checkout ("Livraison estimée entre mer. 29 et
    jeu. 30 oct. · 25 DH"), from the zones and the calendar you typed; a city you don't serve shows a WhatsApp button
    instead of a buy button.
17. **Order on WhatsApp from the shop**: the shopper's exact selection is priced by the server, saved as a lead your
    agent can convert in one tap, then opened in WhatsApp with the real total.
18. **Landing pages attached to a product show their prices honestly**: item prices come from the product and are
    locked; a campaign pack price that differs from "units × product price" is marked as an **override** with the
    product price next to it, both in your editor and in your product's "Sales pages" tab; a product price change
    re-publishes every attached page.
19. **Your Store Health ring** now includes shop checks (a checkout that cannot charge a fee, a dead menu link, an
    active product out of stock for a week, a product page without photos), each with one tap to the fix. "Catalog
    from photos" builds product drafts from a batch of photos: items, options and descriptions proposed, prices
    always yours, facts ticked by you.
20. **New in revision 3 (after the first review).** One city key everywhere, so "Fès" picked in a form always finds its
    zone and its delivery dates. Your agents can take a **phone or WhatsApp order for catalog products** and add a line
    to a cart order, priced by the same server code as the shop. The shop's "we call you today from 09:30" promise and
    the agents' calling hours are **one setting**. Stock is **reserved when a human confirms** the order, not when a
    maybe-fake order arrives (you can switch to "reserve at order"). A product that sells out no longer creates a new
    version of every attached sales page; the pages are refreshed in place. A low-stock count or a "best seller" label
    can never be stale on a cached page. The server never silently charges a total the shopper did not see: any
    difference asks for a confirmation. The first-screen promise on product pages is measured at 390 × 844 with the
    model's calibrated error band, and every product-page layout was re-stacked for phones so that name, price and the
    buy button fit with a 3-line Arabic name.
21. **New in revision 4 (after the second review).** The shop's checkout reads the **same delivery table** as your
    landing pages (one shape, built by the server from your zones), so the browser never has to work out city codes
    itself. "We call you today from 09:30" is computed on the shopper's phone at the moment they look, from your one
    calling-hours setting, so a cached page never shows yesterday's promise. Every shop page carries a quiet "Report this
    store" link. When you choose "full store" at sign-up, your first result is your **product page** (three designs to
    pick from), never a hidden sales page. A "both" shop shows one fee warning per page (the landing pages' one), not
    two. The checkout keeps no floating "Confirm" bar: the form fits in about one phone screen, like your landing
    pages' form. Each feature in this document now names the exact test that proves it.

---

## STO-§0 Decisions at a glance

R-D22, R-D41, R-D42, R-D43, R-D44, R-D45, R-D46, R-D48 and R-D49 are the storefront decisions this spec builds on,
adopted as settled, together with core rev 2's D50 (refined for reason `product`), D51-D52 (publish gates and page
budgets), D54 (test-order mode), D57 (pulse), D58 (mSPRT), D62 (add-on chunks) and D64 (verdict bands). Rows marked
**refines** or **deviates** say why; rows marked **rev 2** are new or changed in this revision (details in STO-§31).

| # | Decision | Why |
|---|---|---|
| STO-D1 | **Store pages are template pages in `pages`.** `pages.kind ∈ {home, product, collection, page, search, cart, checkout, not_found}` holds a new **`StorePageDoc` v1** (sections only, no product, no offers) in `pages.draft` and `page_versions.doc`. One `home`, `product`, `collection`, `search`, `cart`, `checkout`, `not_found` per store (the **template set**); `page` = any number of custom content pages at `/<slug>`. `policy` stays **reserved** (policy pages are `LegalBody` + store chrome, no doc). `landing` pages keep the frozen PageDoc v2. | core §D.2 already adds `pages.kind`; reusing `pages` gives versions, history, restore, preview links and `asset_refs` for free; PageDoc v2 is frozen and cannot express a home page (`items.min(1)`, `offers.bundles.min(1)`, `src/lib/page/schema.ts:827-828`; LND-04). |
| STO-D2 | **Publishing a store template = choosing its live version.** Non-landing versions keep `html`, `thank_you_html`, `csp` NULL; every store page renders on request (STO-D6). The six utility templates (product, collection, search, cart, checkout, not_found) are created and **auto-published** from defaults when the store first enters `store`/`both` mode; `home` and custom pages publish only on the owner's click. | Catalog pages embed live prices (R-D42); utility templates are structural, so the catalog works at once; the home is the brand's first impression and needs a review. |
| STO-D3 | **A catalog product = an Offers v2 document plus presentation.** `products.doc = { product, items, offers }` (OFFERS §B-§D shapes) validated by building a full PageDoc around it and running `PageDocObject` (every Offers v2 rule reused); `products.content = { v: 1, sections }` holds the product's own content sections (benefits, specs, FAQ…); `products.rev` (ULID) changes on every priced or availability change; `products.public_key` (random, global) is the product's public key. | One pricing engine for server, runtime and PHP (OFFERS D9; `src/lib/page/pricing.ts` unchanged, ST-01). Product-specific content cannot live in a template shared by every product (STO-D4). |
| STO-D4 | **The PDP template is a layout, the content is the product's.** The `product` template holds `productDetail` (the buy region, required), a **`productContent` slot** that renders `products.content.sections` with the product's context, and shared sections (related grid, trust strip, store FAQ). Landing section types are reused through an **eligibility table** (`src/storefront/sections/eligibility.ts`), never by editing their definitions. | Resolves LND-01 and LND-03 without touching `SectionDefinition` (`src/landing/types.ts:240-255`) or any landing section file; one template serves 2,000 products. |
| STO-D5 | **Inventory = manual flags + optional counts, per stock key.** Each item tracks stock on one **axis**: the item, its matrix combinations, or one choice group's options. Availability = the doc's own sold-out flags **or** `on_hand − held ≤ 0` when counted. R2: counts decrement when the order's `ship_state` becomes `shipped` (idempotent through `inventory_moves`), never at placement. R3: a soft hold **taken when a human confirms the order** (`confirm_state → confirmed`) by default, with the store option `checkout.store.reserveAt = "order"` for stores with very high confirmation rates; released on cancel/fake/duplicate/unreachable/refused (R-D48). The creation-time availability check (`isOut`) stays, so an out-of-stock variant is refused at order time whatever the hold moment. A count is shown to shoppers only when the owner turns on "show low stock" and the real count is ≤ the owner's threshold. **rev 3 (OPS-30):** rev 2 held at creation; with 40-60 % of COD orders ending fake, cancelled or unreachable, half the held units would belong to orders that never ship and a real buyer would read "Épuisé" for up to 7 days. | R-D48 (many COD orders never ship: holding hard at placement shows false "sold out"); owner rule 4 (never invented stock); OPS-30. |
| STO-D6 | **On-request rendering with one store-wide version.** Cache key = core §E.6 `${storeId}:${path}:${locale}:${catalogVersion}:${addressVersion}:w${windowId}` (the window id = announcement boundaries already passed; accepted as STO-R7, core §E.6; **rev 4:** combined with the store-local day number so the day-dependent "today's hours" footer line never goes stale, STO-§7.4); `stores.catalog_version` is bumped by any change that can alter a store page (product, collection, inventory crossing, menu, template publish, theme, zones, storefront settings, **and, rev 3 (ENGP-4), any inventory write that changes a displayed low-stock number and the nightly bestseller recomputation when a label or ordering changed**: the rule is "every write that changes server HTML bumps", STO-§7.5). ETag: `storeEtag(cacheKey) = "s1-" + sha256(cacheKey + BUILD_ID)[:20]` is the **identity sha** of the document; the header carries `representationTag(storeEtag, coding)` (`"s1-…"` identity, `W/"s1-…-br"` / `W/"s1-…-gz"` per coding, `src/lib/render/serve.server.ts:142-147`) and answers 304 **before** rendering; `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`; concurrent misses on one key share one render through the core's `ScopedCache.getOrLoad` single flight (STO-R24 accepted, core §E.6). **rev 3 (ENGP-22):** the render cache keeps `{ html, csp, etag, status, noindex }` only; compressed bytes come from the existing content-addressed `encodeCached(etag, html, coding)` (`src/lib/render/compress.ts`, 24 MB / 512 entries), never a second copy. **rev 2:** a request carrying a valid test token (STO-D33) or an experiment arm (`?xv=`, R3) bypasses the shared entry (test: never cached; arm: its own key). | R-D42; one Node process, no queue workers; a store-wide counter makes invalidation trivially correct at our scale (≤ 2,000 products per store, `products_max`); ENGP-4, ENGP-22. |
| STO-D7 | **New runtime chunks, the landing chunk untouched** (R-D43): `pdp` = a new **entry** over the existing landing runtime modules (bundles, units, gallery, tabs, accordion, video, sticky, analytics) + a selection **bridge**; `store` (chrome), `cart`, `checkout`, `store-pixels`, `store-thanks`; `search` in R3. Store pages other than the PDP load no landing module; their motion is CSS-only. The generated landing chunk stays **byte-identical to the post-R1.0 build** (its sha256, recorded by T3 after the storage-prefix change and copied at the R2 contract step, is asserted by `qa:storefront-render`; **rev 3, ENGP-26**: the number in `budgets.json` is T3's re-measured value, not a fixed 24,200; **rev 4**: checked with tolerance 0 against that value and `landing.sha256`, core §H.13, ENGC-10). | LND-15, LND-16: the landing chunk sits within 30 B of its budget; source-level reuse keeps the pickers, units and option rules exactly as on landing pages. |
| STO-D8 | **Both buy models on payload v3, as settled (R-D44).** `inline` = the checkout block rendered under the buy box on the PDP (one line, `surface: "pdp"`); `cart` = "Ajouter au panier" + "Commander maintenant" (buy now = `/checkout` with that line only). Default when a store first enters store/both mode: `inline` when it has ≤ 3 active products, else `cart`; a suggestion chip after that, never an automatic switch. | An ad click → order needs zero page loads (sf §4.4); bigger catalogues need a cart. One server path for both. |
| STO-D9 | **Payload v3 carries per-line proof**: each line sends the product's public key, the `rev` it was priced with and the line subtotal shown; the server re-prices every line with `resolveSelection` + `orderTotals` (unchanged) and answers **per-line verdicts** (`ok`, `changed` with the new amount, `unavailable`, `removed`). A changed line refuses the order (`stale`) and the checkout updates the line in place and asks to confirm: **no page reload**. **rev 3 (ENGP-15):** `stale` is answered **whenever any shown amount differs from the server's** (`lineCents ≠ ls` on any line, or `st ≠ total`, or `dl ≠ delivery`), whatever `rev` and `cv` say; rev 2's "same rev, server wins" branch is withdrawn (a bridge bug or a tampered `ls` must never end with a shopper charged a total they did not see, owner summary 5); the parity mismatch is still logged as an `error_events` signal. **rev 3 (ENGP-27):** every amount in a v3 response is an integer in **cents** (`totalCents`, `deliveryCents`, `subCents`, `lineCents`); the decimal `orders.total` is written once at storage (`cents / 100`, STO-§16.4). Order bumps and thank-you upsells are not part of store products in R2 (stripped at save with a note). | ORD-19, ORD-20, LND-33; reloading would loop behind a 60 s edge cache; v3 knows exactly which line moved; ENGP-15, ENGP-27. |
| STO-D10 | **Delivery fee in store mode** (refines R-D22 for store checkout): `free_offer` when every line's offer has free delivery → else the shopper's **zone** (`delivery_zones`, landing.md LAN-§7.1 `DeliveryZoneRow` through `zoneForCity`): `not_served` refuses, `free_from_cents ≤ subtotal` → 0, `fee_cents` → that fee → else the store's **fallback fee** (`checkout.store.fallbackFeeCents`). No zone and no fallback = the checkout template cannot be published (publish gate `storefront:checkout_fee_unset`, STO-§23.6). The checkout and the inline PDP block show the same number the server charges. **rev 3 (OPS-1): the stored zone key is operations' slug `CityKey`** (`cityKey(value)`, OPE-§10.1: "casablanca", "fes", "ksar-el-kebir"; "Autre" and unknown text → `null` → the `*` zone); the form still posts `City.value` (what `orders.city` stores). **rev 4 (CRIT1, core §K.2 P0 `zonesForCheckout`, LAN LD4a):** the conversion happens **on the server only**: the server runs `cityKey(payload.city)` before `zoneForCity`, and the browser looks the posted value up in landing's `ZoneTable` (`zonesForCheckout(scope)`, `city: Record<City.value, zoneIndex>` built on the server from the slugs, absent value → `star`), so no store chunk bundles `cityKey()` (STO-§12.3, §15.7, §15.9). Landing pages keep their flat page fee until LP-16; **rev 3 (OPS-13):** this part asks the core to pull LP-16's contract step into **R2** (STO-R31) so a `both` store never quotes two fees for one city, and until a landing runs on `runtime_v = 3` the mismatch is surfaced, never hidden: Store Health rule `sf:landing_fee_mismatch` and a chip on the product's "Pages de vente" tab (STO-§17.7, §23.8; **rev 4:** LP-16 accepted for R2, core D75, and the health issue is landing's one rule `landing:fee_mismatch`, core §I.7, the storefront rule withdrawn). **rev 2, deviates landing.md LD6 for store checkout only:** a v3 order whose city maps to a not-served zone answers `not_served` (the browser already hid the submit and offered WhatsApp; the lead was captured first, STO-§15.11), because a zone-charged checkout has no honest total for a city the store does not serve; landing pages keep LD6 (accept + flag) since they charge their own flat fee. | Owner rule 4 (never invent a fee); the zone fee is the trust lever (sf §1.4; rf §1.6); R-D22. |
| STO-D11 | **Attached landing = materialised mirror + `sync` republish + live re-pricing, with overrides shown as overrides** (LP-07; **rev 2**, aligned with landing.md LD20/LD21 and core D50 refined, §H.3, Q24). `pages.product_id` set; the landing doc's `items` are **materialised** from the product by landing's `materializeAttached(doc, product)` (`src/lib/landing/attach.ts`, an S1 "landing part", LAN-§26.2): ids, prices, compare-at, groups and deltas, SKUs, sold-out states after `applyStock`; names and photos stay the landing's when `attach_opts.keepNames` / `keepPhotos`. Its **offers stay its own** and reference only the product's items; every offer price that differs from `units × product price` is an **override** (LAN-§17.3): the builder shows the chip "Override · product price 2 × 249 = 498 DH · this pack 449 DH (−49 DH)", the product editor's "Sales pages" tab lists every override per page (STO-§17.3), and the PDP never shows a landing's pack price. A product change calls `onProductChanged` → `render_jobs` reason `product` → `republishAttached`: **`prices` and `options` publish a `sync` version** (new row, checksum, gates, `product_rev`); **`content` and, rev 3 (ENGP-10), `stock_transition` re-render in place** under core D50 (rendered columns and `product_rev` rewritten, no new version row: stock changes availability, never a priced total, and the order path prices availability live through `attachedDocFor` anyway; a product crossing in/out of stock daily with 10 attached pages would otherwise write ≈ 9 MB of version rows a day against the 3 GB quota). **rev 3 (ENGP-16):** every attached live page (≤ 10, the STO-§17.1 cap) is republished in `after()` of the product save; the job is the fallback for failures only, so the window in which an old page answers `stale` twice is the edge TTL at most. Orders on an attached landing price against **the live product items + the version's offers** (`attachedDocFor(target)`, STO-R12 accepted, core §K.4) and always run the v2 **fallback** comparison (any total ≠ `st` → `stale`). Default `noindex` + canonical to the PDP (R-D49), owner toggle (`landing.attach.noindexDefault`). | One price and stock truth (sf §8); the server prices orders from the version doc (OFFERS D8), so a price change must be a publish, not an HTML rewrite (LAN LD20, core Q24); a campaign pack price is legitimate only when the shopper can see what it overrides (owner rule 4); ENGP-10, ENGP-16. |
| STO-D12 | **No review display before verified reviews exist** (R-D46): in R2 store pages render no stars, no rating badge and no `aggregateRating`; `products.doc.product.rating` is dropped on every write; landing review sections are not eligible on store kinds. R3 (ST-13) shows verified reviews only; imported reviews are labelled and excluded from aggregates. | EU Omnibus Annex I 23b, owner rule 4 (sf §4.9). |
| STO-D13 | **Facts-only commerce rendering**: every badge and number on a store page comes from data the server can prove (STO-§12.6 table): "Livraison offerte", savings, compare-at, "Dès", bestseller, low stock, ETA, returns window, "vérifiez avant de payer", "un conseiller vous appelle". Generators write copy, never facts. | Owner rule 4; Morocco law 31-08 (seller identity and total price up front, sf §2). |
| STO-D14 | **Registers per page kind, with marketing islands** (DG-11, DES-§11.1; **rev 2** refines): home and custom pages = `marketing`; product, collection, search, cart, checkout, not_found = `commerce`; thank-you and track = `transactional`. Inside a commerce document exactly two slots are **marketing islands** that may use the full gene set: `collectionHeader:banner` and the PDP's gallery + `productContent` sections; the info column (price, options, buy box, delivery line), grids, cart and checkout are pure commerce: G16 = 0 (no glass), motion ≤ 250 ms with one reveal kind, accent area ≤ 8 % of the viewport, `G22 = start`, no decor (ghost word, ring, chips over photos, aurora). The islands inherit the motion and glass clamps of the document (`[data-register="commerce"]`). **rev 3 (UX-21):** the commerce register is **brand genes + clamps**, nothing more: it does **not** restrict G2. The PDP **family** is drawn from the store's G2 through the STO-§12.8 pool over all nine grammars (an `immersive` PDP is a commerce document with a cinematic gallery island); rev 2's sentence "`G2 ∈ {catalogue, split-tension}` for the info column and grids" is withdrawn here and requested out of DES-§11.1 (STO-R33). The collection grid is a grid by construction and needs no grammar clause. | One brand across registers (R-D41); commerce pages must read as precise tools, not posters (DES-§11.1 names the PDP info column and the collection grid as commerce and the banner as marketing); UX-21. |
| STO-D15 | **Chrome is store-level, not per page**: header (`navHeader`), announcement bar, footer and WhatsApp float are configured once in the store setting `storefront` and rendered around every store kind; the landing `header` section stays nav-free (`src/landing/sections/header/index.tsx:1-4`). | LND-31; one menu edit updates every page; the landing header is nav-free on purpose. |
| STO-D16 | **Store thank-you lives at `/checkout/merci?o=<orderId>`**, renders the landing.md LP-04 blocks (confirm on WhatsApp, expectation block, tracking link) inside the store chrome, and is filled client-side from `sessionStorage` written by the checkout: the HTML holds no order data; `Cache-Control: private, no-store` (core §F.6). | Uses the `/checkout` route the core already lists (core §C.4.1); no new top-level path. |
| STO-D17 | **ETA as dates (ST-17) ships with store pages in R2** (the landing side ships in R1: core §L.2, rf §3.2). Store surfaces call landing.md's engine with its exact signatures (LAN-§7.2): `etaWindow(cal, zone, now): EtaWindow \| null`, `etaText(w, zone, locale, dateLocale, now)`, `zoneForCity(zones, cityKey)`, `zoneLineFor(scope, cityKey, at?)`; every rendered date carries the marker "(estimation)" / "(تقريبي)" / "(estimated)"; no dash inside a range (words carry it). **rev 2:** the rev 1 signature `etaWindow(zone, now, cal, locale)` is withdrawn; S1 writes nothing in `src/lib/delivery/**` (P3 ships it in R1). **rev 3 (OPS-1):** `cityKey` in these signatures is operations' slug `CityKey` (or `null` for "Autre" / unknown, mapped to the `*` zone by `zoneForCity`), the one key `delivery_zones.cities`, `carrier_rates.city_key` and `orders.city_key` store (STO-R28, core D68); **rev 4 (CRIT1):** the browser tables (`#sg-config` and `lp-assist.dz`) are one object, landing's `ZoneTable`, keyed by the **posted `City.value`** and built on the server from those slugs (core §K.2 P0); `test:catalog` reads the parity fixture `scripts/qa/fixtures/city-key.json` (P4's, core D68) shared with `test:delivery` and `test:ops` ("Fès picked in the form → `ZoneTable.city["Fès"]` = the zone stored as `"fes"` → dated line shown"), so P3, P4 and S1 fail together if the key or the table shape drifts. | Baymard's delivery-date finding (sf §2, rf §1.6); one implementation for the landing line, the store PDP, cart and checkout avoids two promises (LAN LD5); OPS-1. |
| STO-D18 | **Store pixels = one storefront-level pixel answer** (library pixels or "No pixel", Offers D6 extended to the store), fired by the `store-pixels` chunk on every store kind: PageView, ViewContent (PDP), AddToCart (add or buy now), InitiateCheckout (first checkout interaction), Lead (valid phone), Purchase (thank-you, event id = order id). **Content ids** = item SKU, else `<productKey>.<itemId>` (`<productKey>` for item `main`) on the PDP, in the cart, in server events and on attached landings (LND-11). | Landing, PDP and cart events must match one ad catalog; the landing `pixels` chunk is a landing-runtime module and cannot boot without it. |
| STO-D19 | **Cart persistence** = `localStorage` key `sg:<handle>:cart` (≤ 20 lines, `n` ≤ 10 per line, 30-day expiry, identical lines merge), re-priced through `POST /api/public/store/cart` when the shown catalog version differs or a line is older than 10 minutes. No server-side cart, no cookie. | No customer accounts for COD (sf §4.18); store hosts never carry cookies (core §C.9); shared origin in P mode needs the handle prefix (core §C.9). |
| STO-D20 | **Search in R2 is server-side** (`/search?q=`, normalised Arabic / Arabizi / French-accent folding, ranking by name match then real sales), `noindex`. R3 (ST-11) adds the instant client index (≤ 500 products) and filters. | The `search` kind is part of ST-02 (R2); instant search is a separate chunk and a P1 feature. |
| STO-D21 | **Slugs and redirects**: products at `/p/<slug>`, collections at `/c/<slug>` (core D20); a slug change writes `catalog_redirects` (308 forever, until another product takes the slug); `/products/<s>` and `/collections/<s>` 308 to the short form (core §C.8). | Ads and WhatsApp messages keep old links (R-D3 spirit). |
| STO-D22 | **Bestsellers only from real orders**: `products.sold_30d` = units in orders confirmed in the last 30 days (store timezone), recomputed nightly; the "Meilleures ventes" sort, source and label appear only when at least one product has `sold_30d ≥ 3`. | sf §4.2 ("never labelled bestseller without data"). |
| STO-D23 | **Product stats** reuse `stats_daily` with `page_id` = the product id (ULIDs never collide with page ids); template pages count under their own page id. | No new table; per-product views, checkout starts and orders for the owner and AI-12. |
| STO-D24 | **`products_max` counts draft + active products**; archived products keep their orders and history and free the slot. | Sellers must be able to keep history without hitting the plan limit. |
| STO-D25 | **The PDP buy box reuses the landing offer picker and units markup** (OFFERS §E, §F.6 contract) inside `form[data-lp-form]`, configured by a runtime config v2 built from the product (`productAsPageDoc`). In that synthetic doc `offers.shippingFee` = the lowest fee the store can charge (min over served zones and the fallback), so the picker's "Livraison offerte" marks stay true; the buy box shows the line price, the checkout block shows delivery and total. | The landing runtime reads `form[data-lp-form]` (`src/landing/runtime/core.ts:156-158`, `units.ts:174`); a 0 fee would mark every offer "free delivery" falsely (`src/lib/page/pricing.ts:329-332`). |
| STO-D26 | **One currency and, in R2, one locale per store** (`stores.currency`, `stores.default_locale`). R3 (ST-12) adds sibling locales as path prefixes `/<locale>/…` for non-default locales, `hreflang`, and an `Accept-Language` chip; never an automatic redirect (R-D49). | Shared caching and SEO; locale codes are reserved as page slugs now (request STO-R14). |
| STO-D27 | **No customer accounts** in R2/R3; "my orders" with a one-time code stays P2 (ST-22). Tracking uses the signed link or order number + last 4 phone digits (landing.md LP-05). | COD has no payment step to remember; friction costs orders (sf §4.18). |
| STO-D28 | **Store states** follow core §A.5.3: `active` and `restricted` serve store pages; in `restricted` the checkout answers `unavailable` and the checkout block switches to its "temporarily unavailable · WhatsApp" state; every other state answers the neutral 404 (or 410 after purge). Store kinds are served only when `modeAllows(mode, "storefront")` (core §A.2). | No oracle for suspended stores; a seller under review keeps pages visible. |
| STO-D29 | **Pagination and sorting are plain links** in R2 (`?page=n`, `?sort=`): no JavaScript, real URLs, canonical rules of STO-§20.2. | SEO-friendly, zero bytes; infinite scroll would need a fragment API the CSP does not allow (`connect-src` is narrowed to `/api/public/`, `src/lib/render/csp.ts:20-29`). |
| STO-D30 | **Product-level limits follow PageDoc**: ≤ 8 items, ≤ 30 product photos, ≤ 8 offers, ≤ 4 option groups per item (OFFERS §J.1), ≤ 20 content sections per product. A catalogue item that needs more is several products in one collection. | Reuses every Offers v2 cap, parity test and editor. |
| STO-D31 | **rev 2 · Hero grammars per page kind, driven by the Brand Genome, never by the archetype alone.** The store home has **8 hero families** (`storeHero` variants, STO-§9.3) and the PDP **6 families** (`productDetail` variants, STO-§12.8); each family maps to one or two of design's composition grammars (`GRAMMARS`, DES-§4.1) and is drawn from the store's G2 with the archetype as a prior (DS1). Over any 100 live stores of one niche no hero family may exceed **30 %** (DB C1), and the same seed with a different catalogue must never give the same (family, pairing, section order) (DB N6). | DB §4.2 root causes 1, 2, 9 (archetype locks the hero; stage on 23 of 39 pages); owner rule "generation dynamic and never repetitive". |
| STO-D32 | **rev 2 · Fold contract per kind.** PDP (every family, ar and fr, 390 × 844): the first image, the product name, the price, the COD line and the primary action are inside the first 844 px; the checkout block (`inline`) or the cart buttons start before 1,688 px. Home (every family): the hero image or colour moment, one primary CTA and the store identity inside 844 px; a product-bound hero also shows the real "Dès" price. Collection: header + the first card row inside 1,266 px. Declared by each hero variant (`fold: FoldLayout`) and verified by the height model (DES-§5.3, per-variant `features.h`) at publish and by Playwright in `qa:storefront-e2e`. Hard publish gate (`budget:C2` for store kinds). **rev 3 (ENGP-23, ENGP-6, UX-22):** the **server gate is 390 × 844 only** (the frozen `HeightReport.viewport = 390`, `FoldReport.limit = 844`); 360 × 740 is a **Playwright-only soft check** in `qa:storefront-e2e` (reported per family, fails no publish). The server refuses only outside the model's calibrated error band: an item is "below the fold" when its estimated top × 0.9 > 844; **rev 4 (core §M.2 three zones, `FOLD_BAND = 0.9`, DES V25):** the model reports each `mustShow` item's estimated **top** (`FoldReport.items`, DES-§5.3) and the gate reads three zones: **≤ 760 px = target**, **760-938 px = a soft note** with `vars.estimated = 1` and the word "estimated" in the message, **> 938 px = refused** (rev 3 wrote "844 < top ≤ 937"; the core's zones replace it); Playwright is the calibration, never the publish decision (core §M.2, STO-R34 accepted). Every PDP family was re-stacked for phones so that `FoldLayout.bottoms.cta` ≤ 844 holds for a 3-line name in ar and fr with one offer (STO-§12.8 table; the CTA's **top** = its bottom − 56 px, so every family sits at ≤ 790 px, inside the target or the note zone, never the refusal zone). | DB C2 (price and CTA below the fold on 23 heroes), F1; core D52; ENGP-6, ENGP-23, UX-22. |
| STO-D33 | **rev 2 · Test-order mode on store pages** (SF-05, core D54): the address card's "Open a test order" for a `store` / `both` shop mints `storeUrl(store, "/") + "?sg-test=<token>"` (`hmac(exp, "test-order:<storeId>")`, 2 h). A store route that sees a valid token renders **on request** with no pixel chunk, the "test" banner (`RenderAddons.banner = "test"`, core §H.13), `noindex`, `private, no-store`, never cached; the `store` chunk stores the token in `sessionStorage sg:<h>:test` so it survives home → PDP → cart → checkout; the `checkout` chunk sends it as payload v3 `test`; the server verifies it with `resolveTestToken(store, token)` (core §E.2, lint L12) and sets `orders.is_test` / `leads.is_test`. Everything downstream follows core D54 and OPE-§26 (TEST chip, no Sheets, no CAPI, no stats, no learning, "[TEST]" Telegram, "Delete test orders"). | rf §3.1 SF-05, §4 demo step 1:55; today's owner test orders poison stats (HANDOFF §5). |
| STO-D34 | **rev 2 · WhatsApp-first ordering on the store** (rf §1.11, LP-11 store side): "Commander sur WhatsApp" posts the cart or PDP selection to `POST /api/public/store/lead` with `kind: "whatsapp"`; the server **re-prices every line** (`priceLine`), inserts a `leads` row of kind `whatsapp` (`phone` NULL, `ref WA-XXXXXX`, `sel` v3, `total_cents`), and answers the composed text with the server's total, the real delivery line for the chosen city (or "livraison selon la ville") and the reference; the browser then opens `wa.me/<store digits>?text=`. The client never prices the message (rev 1's client-side composition is withdrawn). No new route: the lead endpoint gains a `kind` (core §C.4 route list unchanged). | LAN LD13 ("the price in the chat is the server's"); core §D.2 `leads.kind = 'whatsapp'`; agents convert the lead in one tap (OPE-§11.4). |
| STO-D35 | **rev 2 · Store templates publish through the core gate registry** (core D51, §M): `publishStorePage` renders the template with the store's gate sample product (PDP; **rev 3, ENGP-17**: one deterministic proxy, STO-§6.3) or its real data (home, collection), then awaits `runPrePublishChecks(ctx)` with `doc: StorePageDoc`; refusals are typed (`budget_blocked` / `honesty_blocked` / `design_blocked`) with `GateItem[]`, never a generic error. Storefront contributes `src/lib/render/prepublish/storefront.ts` (STO-§23.6: fee unset, hero without product, announcement claim unsupported, bound product inactive, dead menu link as a note). The rev 1 "checklist as the gate" is now the builder's live mirror of the same items (core §M.5). **rev 3 (ENGP-1): the registry has a defined `StorePageDoc` branch.** Every gate implementation reads a `GateInput` built by design's kind-aware adapter **`gateInputFor(doc: PageDoc \| StorePageDoc, ctx)`** (theme from `getStoreTheme`, sections through the store registry's `features`, no product / offers / form; STO-R29): `GateInput.doc`, `genomeOf` and `estimateHeights` accept the union at the R2 contract step. **Utility kinds** (`product`, `collection`, `search`, `cart`, `checkout`, `not_found`) run the structural, owner-rule, register, budget and honesty gates only (**rev 4:** the per-kind list is design's `KIND_GATES` table in `src/lib/design/gate-input.ts`, DES-§8.13, core §M.1 rule 2; this file never restates it); they are **never pooled or novelty-checked** (no `design_genomes` row, no N1 / N2 / N8), so the byte-identical `defaultTemplate()` docs of two stores never collide as clones; only `home` and `page` enter the pool. `checkFold` is a thin call into `estimateHeights().fold` with the kind's `FoldLayout` (DS33, one data source); `landingGateItems` on a `StorePageDoc` checks the eligible landing sections only, with facts from the bound product (LAN side, STO-R29). `test:prepublish` gains one fixture per store kind (`src/lib/render/prepublish/storefront.fixtures.ts`). | DB §4 (the checklist ran only in the browser); core §M.1 rule 6 (the dialog is never the first time an item appears); ENGP-1, ENGP-17. |
| STO-D36 | **rev 2 · Page budgets per kind as hard gates** (core D52 adapted): HTML ≤ 90 KB gz soft / **140 KB hard** for every store document (rev 1's 160 KB cap is withdrawn); PDP ≤ 14 in-flow sections incl. product content / **16 hard**, estimated height ≤ 12,000 px / **15,000 hard**; home 5-10 in-flow / **12 hard**, ≤ 9,000 px / **12,000 hard**; collection ≤ 24 cards per page + ≤ 3 template sections; cart and checkout single column, ≤ 45 KB. CTA budget: PDP ≤ 3 primary CTAs (sticky bar counts as 1) and ≤ 2 visible at once; home ≤ 6; glass: commerce 0, marketing kinds ≤ 2; reveals: commerce 0, home ≤ 40 nodes; images: one photo ≤ 3 appearances per document (the PDP gallery counts once), ≥ 3 distinct crops on the home. **rev 3 (ENGP-6):** the height-based hard rows (C3 height, C2 fold) refuse only outside the model's accepted error (ratio 0.8-1.25, DES-§5.3): C3 refuses when `estimate × 0.8 > 15,000` (i.e. > 18,750 px estimated) and notes between 15,000 and 18,750 with `vars.estimated = 1`; section counts, bytes, CTAs, glass, reveals and photo reuse are exact counts and stay hard at their value. | DB C3, F5, R1, R4, R5, I1, I2; core §M.2; ENGP-6. |
| STO-D37 | **rev 2 · Facts-only proof on store pages is a server gate, not a convention**: a store document that would render a number, rating, review, "bestseller" or countdown without its merchant source answers `honesty_blocked` at publish (`honesty:*` items from landing's gate on eligible landing sections, `storefront:*` items of STO-§23.6 for store sections) and renders nothing at request time (the renderer drops the element and logs `fact_missing`). The facts table STO-§12.6 is the single list of sources. | DB I4, D1, D2; core §M.3; owner rule 4. |
| STO-D38 | **rev 2 · Store blueprint and catalog-from-photos are detached jobs** (core D56, §H.12 pattern B): `store_blueprint` (deep Director, Fable 5.1 `high`, 2-6 min) and `catalog_from_photos` (> 6 photos) insert `ai_jobs`, answer `job_queued`, heartbeat every 10 s and are polled every 2 s visibility-aware; the UI never blocks and Cloud AI off falls to the rules path in < 2 s (`defaultTemplate("home")`, matrix proposal from detected variants). Results are **drafts** (collections, `@home`, product drafts), never published by the job. | ra §1.5, §4.9, §9.6; AI-11, AI-04; rf §1.10; Hostinger's 120 s cap. |
| STO-D39 | **rev 2 · Design DNA is visible on store pages**: the store page editor's Theme panel shows P6's DNA card (chips, "why this design" line, novelty **words** per DS27, lock toggles); the storefront overview shows the store's brand DNA card and "Generate my store design"; the home and every template carry `page_versions.generation_source` / `critic_picks` provenance like landing pages (core §D.2). Numbers of distance are never shown (DS7). | SF-02 (rf §1.2), DES-§15.4, core §L.2 SF-02. |
| STO-D40 | **rev 2 · Store Health inputs** (SF-03): `src/lib/health/rules/storefront.ts` contributes R2 rules (STO-§23.8: checkout fee unset, home not published, dead menu link, active product out of stock > 7 days, product without photo or description, store pixels unanswered, SEO missing on ≥ 30 % of active products, compare-at not higher, slug redirects still hit after 6 months); each rule is store-data-only, silent below `minN`, with one `HealthFix`. The storefront overview checklist ring of rev 1 is replaced by the one Store Health ring (core D53, §I.7). | rf §1.3, core D53 ("one computation, two audiences"). |
| STO-D41 | **rev 2 · Experiments on store pages consume landing's engine** (SF-10, core D58, LAN-§18): `experiments.surface = 'store_page'`; in-page arms (`headline`, `hero`, `section`) on `home` and `page` kinds and on PDP template sections outside the buy box; URL arms (`?xv=<arm>`) for `home`, `collection` and `product` templates (cache key + canonical to the control); the buy box, prices, delivery and the checkout are never arms (the pricing fingerprint of a store template is empty by construction, so the guard is "no `productDetail` data in any arm"). Storefront renders the `.lp-xa` wrapper, the `exp-head` script and the `exp` chunk exactly as landing specifies; statistics, screens and the tables are landing's (D3). | One engine, honest statistics (rf §1.8); no second A/B system. |
| STO-D42 | **rev 2 · 3G performance budgets are per chunk and per kind, in bytes and milliseconds** (STO-§21.4-§21.5): critical bytes ≤ 300 KB gz for a PDP (HTML ≤ 90 KB incl. ≤ 36 KB JS, LCP image ≤ 120 KB, fonts ≤ 2 files ≤ 80 KB), ≤ 220 KB for home and collection; boot ≤ 45 ms (`pdp`) / ≤ 30 ms (other chunks) at 4× CPU slowdown; LCP ≤ 3.0 s lab on the 1.6 Mbps / 150 ms RTT profile; INP ≤ 200 ms; CLS ≤ 0.05; pixels after `load` + idle, Turnstile after the first checkout interaction. Measured by `qa:storefront-perf` per kind fixture; a budget over its value fails the R2 exit. | Brief item 16 (power of the features on cheap phones); DB F5 (170 KB gz today). |
| STO-D43 | **rev 3 · One city key (OPS-1); rev 4 · one browser table (CRIT1).** The canonical **stored** key of a city for every zone, rate and aggregate lookup is operations' slug `CityKey` (`cityKey(value): CityKey \| null`, OPE-§10.1, core D68); `null` ("Autre", unknown free text) resolves to the `*` zone. Forms post and `orders.city` stores the French `City.value` as today. **rev 4:** the conversion happens **on the server only** (`cityKey(payload.city)` before `zoneForCity` / `zoneLineFor`, and inside `zonesForCheckout` when it builds the table); the browser never slugs: `#sg-config.checkout.zones` **is** landing's `ZoneTable` (LAN-§7.1, the same object as `lp-assist.dz`), whose `city` map is keyed by the posted `City.value` and built from the slugs, an absent value meaning `star`. No store chunk bundles `cityKey()` (rev 3 bundled it into `checkout` / `pdp` and added a slug `s` per city entry: both withdrawn, ≈ 400 B gz saved). One table shape for P3's `assist` and S1's checkout makes the shared parity fixture (`scripts/qa/fixtures/city-key.json`, P4) writable. | Three tracks (P3, P4, S1) would otherwise each build to a different key and no city would ever match a zone (OPS-1 blocker); one P0 function cannot serve two table shapes (CRIT1). |
| STO-D44 | **rev 3 · Catalog orders by agents (OPS-15).** Phone and WhatsApp orders for catalog products and line edits on cart orders go through **`createManualOrderV3`** and **`editOrderV3`** (`src/lib/catalog/order-v3.server.ts`, S1), built on `priceLine` + `createOrderRow`; operations' manual-order sheet routes by store mode (products picker in `store` / `both`, pages picker in `landing`) and keeps `createManualOrder` / `editOrder` for payload v2 (STO-§16.9; STO-R30). `test:storefront-db` proves "manual v3 total = public v3 total" on every fixture. | A store-mode call centre could otherwise take no phone order and add no line to a cart order in R2. |
| STO-D45 | **rev 3 · One calling window (OPS-11); rev 4 · operations' type, computed at view time (CRIT3).** The confirmation-call promise shown under the checkout submit ("Un conseiller vous appelle {when}"), the thank-you `{when}`, the footer and contact-page hours and `confirm_hours` all derive from **`ops.callingWindow`** through the P0 stub **`callingWindowFor(scope): Promise<EffectiveWindow>`** (P4, `src/lib/callcenter/window.server.ts`; never `null`) and the pure, isomorphic helpers of `src/lib/callcenter/window.ts`: `nextCallableAt(t, w)`, `rangesForDay(ymd, w)`, `hoursText(w, locale, dateLocale, now)` (core D73). **rev 4:** `EffectiveWindow` is **operations' type, imported and never restated here** (rev 3 restated `days` as "index 0 = Monday" while landing wrote `Record<1..7, …>`; OPE rev 4 fixed it as `Record<IsoWeekday, Range[]>`, JSON-safe, with `configured` and `shopperPromiseAllowed(w)`, OD57 / OD63; whatever operations freezes, this part passes the object through), and the promise is the setting **`checkout.confirmationCall`** (landing's R1 field; rev 3 called it `callPromise`). The `{when}` depends on the clock, so it is **computed in the browser** at view time by the `checkout` chunk (bundling `nextCallableAt` by source import, like `assist-ty`) and carried to the thank-you page in the session record; server HTML carries the bare promise only. Day-dependent server text (the footer's today's hours) is covered by the cache window id changing at each store-local midnight (STO-§7.4). The two old keys `store.confirmation.hours` and `policies.contact.hours` are **removed** by core D73 (not mirrored); this part never reads them. | An owner edited one of three hours settings and the thank-you page promised a 09:30 call the ladder only makes at 14:30; a cached "aujourd'hui dès 09:30" would be wrong after 21:00. |
| STO-D46 | **rev 3 · Fee honesty across surfaces (OPS-13).** The store side supports LP-16 (zone fees on landing pages, `runtime_v = 3`) as soon as the core ships its contract step, which this part asks to move into **R2** (STO-R31); attached landings created from a product in `both` mode start on v3 when it exists. Until a landing runs on v3 its flat fee is compared with the zone fee of the store's top-5 cities by orders and the `*` zone: a difference is Store Health `sf:landing_fee_mismatch` (sev. 2) and a chip on the "Pages de vente" tab, never hidden. **rev 4 (core D75, §I.7):** LP-16 is in the R2 contract step (accepted); the health issue is **landing's one rule `landing:fee_mismatch`** (core §I.7, over P1's input `zones.feeMismatchTop5`, the five main cities or the store's five most-ordered keys once n ≥ 20, LAN-§3.2), so `sf:landing_fee_mismatch` is **withdrawn** (two rules would score one page twice, D53 "one computation"); the storefront keeps the chip on the "Pages de vente" tab, computed from the same input. | A `both` store quoting 30 MAD on the campaign page and 45 MAD on the PDP for one city breaks owner rule 4 in spirit; "Casa 20 / autres villes 35-45" is the Moroccan norm (OPS-13). |
| STO-D47 | **rev 3 · Cutout-later heroes (UX-39).** `stage`, `specimen-sheet` (home) and `specimen` (PDP) accept `PhotoFacts.hasCutout = "estimated"` (design's model-free alpha estimate for uniform backgrounds, DES-§4.11 rev 3) with the `plinth` / `contact` stage preset (core §M.4 row I3: an `estimated` cutout counts as alpha); **rev 4:** when the BiRefNet mask lands, P8's handler of the render reason `cutout` (core §H.3, §D.5) bumps `stores.catalog_version` for every store whose active product references the asset (`asset_refs`, kind `product`) as well as re-rendering landing pages, and the on-request renderer then uses the real alpha with no republish (rev 3 said "the product save bumps", but a mask arrival is not a product save; STO-§7.5 row). `qa:storefront-demo` asserts that at least one of the three instant home candidates is `stage` / `specimen-sheet` for the argan and parfum fixtures. | At 0:55 of the demo no mask exists yet; without this the three directions would all be framed light pages, the least distinctive subset of the genome. |

---

## STO-§1 Feature map: scope, release, track, acceptance

Release and track per core §K.4 (R2 track **S1 STOREFRONT**) and §K.5 (R3 track **D3 GROWTH**). "Acceptance" is what
the verification agent checks; each row points to the section with the detail and to the tests of STO-§26.

### STO-§1.1 Storefront ids (ST-01 … ST-22)

| ID | Feature | Rel. | Track | Scope | Acceptance | Spec |
|---|---|---|---|---|---|---|
| ST-01 | Catalog | R2 | S1 | `products` (Offers v2 doc, content sections, SEO, rev, public key), `collections` (manual; rules in R3), `collection_products`, `inventory_levels` + `inventory_moves`, stock axis, decrement at shipped, `catalog_redirects`, product and collection editors, inventory screen, limits and audit | A product saved with any valid Offers v2 shape round-trips byte-identically through `ProductDoc`; `orderTotals` of every fixture equals the landing result for the same items and offers; `products_max` refuses the 201st draft/active product on `beta` with the limit sheet; a slug change answers 308 from the old slug; a `shipped` transition decrements each counted stock key exactly once even when the hook runs twice | STO-§3, §4, §5, §23 |
| ST-02 | Store page kinds + chrome | R2 | S1 | `StorePageDoc` v1, the 8 kinds + reserved `policy`, template set creation and auto-publish, `StoreRenderContext`, store document shell, `navHeader` (bar, centered, drawer), announcement bar, footer, menus editor, WhatsApp float, branded 404 | Every kind renders at 360/768/1440 in ar (RTL) and fr with no horizontal overflow; a store in `landing` mode answers 404 on `/p/x`, `/c/x`, `/cart`; the branded 404 returns status 404 with the store chrome and `noindex`; a menu link to a deleted product disappears from the header and shows a warning in the menus editor | STO-§6, §7, §8, §10 |
| ST-03 | productCard + productGrid + collection page | R2 | S1 | Card variants (minimal, framed, overlay, editorial), grid variants (grid, carousel, editorial, dense), sources (collection, manual, bestsellers, newest, related), collection page with sort and `?page=n` links, bestsellers from real orders | Sort `price_asc` orders by `price_min_cents` ascending across pages; "Meilleures ventes" absent from sort and labels when no product has `sold_30d ≥ 3`; a sold-out product card shows the sold-out state and still links to its PDP; page 2 has its own canonical | STO-§9.4, §13 |
| ST-04 | PDP anatomy, 6 hero families | R2 | S1 (+ P6/S2 pools) | `productDetail` in six families (`split`, `stacked`, `rail`, `immersive`, `specimen`, `quiet`; STO-§12.8) each with a declared fold layout; gallery with option image swap, title, price block with genuine compare-at and per-unit, Offers v2 pickers, options and fields, buy box, delivery line by city with dates, trust row from facts, sticky buy bar; `productContent` slot, related grid, ProductGroup JSON-LD | **Fold contract (STO-D32, rev 3):** for every family, in ar and fr, with a 2-line and a 3-line name, the first image, name, price, COD line and primary action are inside the first screen at 390 × 844 (server gate on the height model with the error band; Playwright asserts the real rects as calibration) and reported at 360 × 740 (Playwright soft check, no refusal); a choice whose matrix cell has a photo swaps the gallery; the trust row shows "vérifiez avant de payer" only when `policies.inspection = "allowed"`; the sticky bar never covers the checkout block and hides while any in-flow primary CTA is ≥ 50 % visible (DB R7); no family exceeds 30 % of PDP templates in a niche over 100 stores (DB C1) | STO-§12 |
| ST-05 | Cart + one-page COD checkout + payload v3 | R2 | S1 | `cart` and `checkout` chunks, cart drawer and page, checkout page and inline block, `contract-v3.ts`, `/api/public/store/{order,lead,cart}`, per-line server re-pricing and verdicts, zone fee, store thank-you, abandoned-checkout leads, **server-priced WhatsApp order** (STO-D34), **test-order token** (STO-D33) | 20 lines × `n` = 10 checkout succeeds with the server total equal to the shown total (every v3 amount in integer cents, STO-D9); a price changed between add and submit answers `stale` with the new line amount and the order succeeds after the shopper confirms; **rev 3:** a same-`rev` body whose `ls` or `st` differs from the server's answers `stale` (never a silent server total); a phone order for two catalog products through `createManualOrderV3` totals exactly what the public v3 path totals for the same lines (STO-§16.9); two stores' product keys in one cart answer `invalid` and create nothing; an idempotent replay answers `ok` with `duplicate: true` and the same order id; a WhatsApp order's text total equals `orderTotals` for the same lines (100 % on the fixtures) and its lead has `kind = 'whatsapp'` and no phone; an order carrying a valid test token is `is_test` and never reaches Sheets, CAPI, `stats_daily` or the learning tables; store A's test token on store B's checkout is an ordinary order | STO-§14, §15, §16 |
| ST-06 | Checkout field model + phone and city UX | R2 | S1 | Market field model (R-D45), autocomplete tokens, `dir=ltr` phone in RTL, as-you-type grouping, Arabic-digit-safe phone, city combobox over the 147 cities with folded matching and "Autre ville" | MA form = exactly 4 required inputs + optional note; typing "٠٦١٢٣٤٥٦٧٨" shows "06 12 34 56 78" and the server stores `+212612345678`; "tanja", "طنجة" and "Tanger" all select Tanger; EU markets show street, postal code and city with the correct `autocomplete` tokens | STO-§15.5-§15.7 |
| ST-07 | On-request render cache | R2 | S1 | Cache key, ETag before render, single flight, `catalog_version` bumps, compressed representations, attached-landing dependency (with STO-D11), load test | A second GET of a PDP is served from memory in ≤ 5 ms p95; a price save makes the next GET of that PDP, its collections and the home show the new price; 200 concurrent cold requests for one PDP render it once; HEAD with a matching ETag answers 304 without a render | STO-§7 |
| ST-08 | Store SEO | R2 | S1 | `OnlineStore` (an Organization subtype), WebSite **without** `SearchAction` (rev 4: rev 3's scope cell contradicted STO-§20.4), Product / ProductGroup with `hasVariant`/`variesBy`, ItemList on collections, OG per kind, clean URLs and 308s, canonical rules, per-store sitemap entries for products and collections, `noindex` kinds, title template without dashes | Google's structured-data validator (manual, R2 exit) passes on 3 fixtures; no document contains `priceValidUntil` unless a real end date exists and is in the future; no `aggregateRating` in R2; `sitemap.xml` lists active products and collections only, at the canonical origin | STO-§20 |
| ST-09 | Home grammar: 8 hero families × 4 storylines (R2) | R2 | S1 (+ P6/S2 pools and priors) | Storylines (hero product, category bento, editorial lookbook, catalogue-dense) as slot lists; **hero families drawn from the Brand Genome G2** (`stage`, `editorial-split`, `poster-type`, `bento-lead`, `cinematic-bleed`, `quiet-luxe`, `catalogue-index`, `specimen-sheet`; STO-§9.3) with the archetype as a prior; invariants H1-H12; default selection by catalogue shape; `applyStoreBlueprint` for AI-11 as a detached job (STO-D38) | 4 storylines × 3 catalogue shapes × ar/fr × 50 seeds (1,200 homes, `test:slow`; the `npm test` subset is 8 seeds = 192 homes, STO-§11.4; rev 4: rev 3's "× 8 families" contradicted STO-§11.4, the family is drawn, not iterated) produce valid docs satisfying every invariant of STO-§11.3 and the fold contract; over 100 generated homes of one niche no family exceeds 30 % and ≥ 60 distinct in-flow sequences appear (DB C1, N3); two stores with identical inputs get home docs whose genome verdict is `ok` (DES-§7, bands only); the same seed with two catalogues never shares (family, pairing, order) (DB N6) | STO-§11 |
| ST-10 | Accessibility AA pass (WCAG 2.1 AA + the 2.2 criteria of STO-§22.1) | R2 | S1 (+ every track for its own sections) | Landmarks, skip link, dialogs (drawer, sheets) with focus trap and Escape, live regions for cart changes and price updates, labelled steppers and swatches, announced errors, 44 px targets, focus never obscured by the sticky bar (2.4.11), drag alternatives (2.5.7), no redundant entry (3.3.7: remembered city), reduced motion, contrast through the theme engine, RTL1-RTL8; automated static check + keyboard scripts + contrast sampling | `qa:storefront-a11y` reports 0 errors on every kind fixture in ar and fr; the keyboard-only script completes browse → add → checkout → thank-you with the focused element visible at every step; the stale banner, the price update after a city change and the cart count are each announced once; VoiceOver/TalkBack manual pass recorded at R2 exit | STO-§22 |
| ST-11 | Filters, quick add, instant search | R3 | D3 | Instant search chunk over a per-store index (≤ 500 products), bottom-sheet filters (price, option values, availability), quick add for products with one offer and ≤ 1 choice group | Index JSON ≤ 12 KB gz for 500 products; filters update the count without a page load and the URL keeps the state (`?f=`); quick add is never offered for products with matrix groups, fields or several offers | STO-§13.4-§13.6 |
| ST-12 | Multi-locale siblings + hreflang + locale chip | R3 | D3 | `products.i18n` text overlay per locale, `/<locale>/…` prefixes, `hreflang` + `x-default`, a client chip from `Accept-Language`, no redirect | Every sibling page links all siblings and `x-default`; prices and ids are identical across siblings; no response varies on `Accept-Language` | STO-§19.7, §20.6 |
| ST-13 | Verified review collection | R3 | D3 | Signed post-delivery links, review page, photos through the media pipeline, hide-only moderation with audit, "Achat vérifié" badge, automatic disclosure, "imported" label, aggregates and JSON-LD from verified only | A review can be written once per order line and only after `delivered`; editing text or stars is impossible in the admin; imported reviews never enter `aggregateRating`; the disclosure line renders wherever ratings render | STO-§18 |
| ST-14 | Coupons | R3 | D3 | Server-validated codes (percent, fixed, free delivery), scope, caps, per-phone limit, real dates, checkout field, discount row, allocation for pixels and accounting | An expired or capped code answers `coupon: invalid` without revealing which rule failed; a percent coupon never makes a line negative; redemptions are unique per order | STO-§19.1 |
| ST-15 | Stock soft hold + decrement at shipping | R3 | D3 | `stock_holds` taken at `confirm_state → confirmed` by default (`checkout.store.reserveAt = "confirmed" \| "order"`, rev 3 OPS-30; TTL 7 days from the hold), release on cancel/fake/unreachable/refused/duplicate, decrement at shipped consumes the hold; the creation-time `isOut` refusal stays in both modes | Two concurrent confirmations for the last counted unit: the first holds it, the second's confirmation answers `stock_short` for that line and the agent sees it; in `reserveAt = "order"` mode two concurrent orders: the first holds, the second answers `unavailable`; a cancelled order frees the unit within the same request; 100 fake orders hold nothing | STO-§5.6 |
| ST-16 | Size guide | R3 | D3 | Per-product chart (rows × columns, units cm/in by market), bottom sheet from the size option, empty skeleton proposed for garments (never invented measurements) | The skeleton has headers only; the sheet opens from the size group label and traps focus | STO-§19.3 |
| ST-17 | ETA as dates (store side; SF-08) | R1 landing (P3) / **R2 store** (STO-D17) | S1 consumes landing's `src/lib/delivery/eta.ts` | `etaWindow` / `etaText` / `zoneLineFor` with cut-off hour, working days, holiday table; dated lines on PDP, cart, checkout and thank-you; "(estimation)" marker | PDP, cart and checkout show byte-identical ETA text for the same city and instant as landing's `etaText`; cut-off and weekend crossings, holidays, ar and fr rendering match `test:delivery`; a zone without ETA shows the day range or nothing; a not-served city disables the buy actions and shows WhatsApp; **rev 3 (OPS-1):** "Fès" picked in the form resolves to `cityKey = "fes"`, finds its zone and shows the dated line (parity fixture shared with `test:delivery`); "Autre ville" and an unknown typed city resolve to the `*` zone; **rev 4 (CRIT1):** the browser finds it through `ZoneTable.city["Fès"]` (posted value, built from the slugs on the server) and the server through `cityKey("Fès")`, both on `scripts/qa/fixtures/city-key.json` | STO-§15.8 |
| ST-18 | Speculation Rules + bfcache hygiene | R3 | D3 | `moderate` prefetch from grids to PDPs, no `unload`, no `no-store` on public kinds | Chrome DevTools bfcache test passes on home, collection and PDP; prefetch fires only on hover/touch-start | STO-§21.6 |
| ST-19 | Home storylines 5-8 | R3 | D3 | Drop, routine, gift guide, local maker (modern visuals only), each drawing its hero family from the G2 pool like the R2 storylines | Same invariants as ST-09 incl. H11-H13; the drop storyline is unavailable without a real launch date | STO-§11.2 |
| ST-20 | Breadcrumbs | R3 | D3 | Visible breadcrumbs on PDP and collection + BreadcrumbList JSON-LD from `primary_collection_id` | The JSON-LD trail equals the visible trail; RTL order mirrored visually only | STO-§19.4 |
| ST-21 | EU legal pack | at the first EU store | D3 or the R-at-hand track | 30-day lowest price next to compare-at, consent banner with Consent Mode v2, review disclosure, EU address fields, AA gate | An EU store cannot activate checkout until each item is green in the EU gate | STO-§19.8 |
| ST-22 | PWA per store, "my orders" with OTP, recently viewed, co-purchase cross-sell | later | — | Each gated on owner demand and a messaging provider | Own acceptance when scheduled | STO-§19.9 |

### STO-§1.2 "Both" mode and registers

| ID | Feature | Rel. | Track | Scope (storefront side) | Acceptance | Spec |
|---|---|---|---|---|---|---|
| LP-07 | Attach a landing to a catalog product | R2 | S1 (+ landing.md for the landing editor panel) | `pages.product_id`, item mirror, offers restricted to the product's items, live re-pricing at order, `product_rev` self-heal, render fan-out, `noindex` + canonical to the PDP by default, "Create a campaign page" from the product | Changing the product price republishes every attached live landing (≤ 10) within the same request's `after()`, the job being the fallback only (rev 3, ENGP-16); a stock crossing re-renders them in place with no new version row (rev 3, ENGP-10); an order placed from the old HTML answers `stale`; an attached landing's offer referencing a removed item becomes unavailable and the builder shows an error; a flat page fee that differs from the zone fee of a top-5 city is a Store Health issue and a chip, never silent (rev 3, OPS-13) | STO-§17 |
| LP-08 | Campaign vs inherit theme mode | R2 | S2 (design) + S1 | Storefront side only: the attach flow keeps the page's current `theme_mode`; a landing created from a product starts as `campaign` with the brand locks; store chrome links ("Voir la boutique") on attached landings' footer and thank-you | A landing created from a product renders with the store logo and locked brand colours; switching to `store` re-renders it in the store look (DES-§11) | STO-§17.6 |
| DG-11 | Store theme across registers (storefront consumer side) | R2 | S2 (owner) + S1 | Kind → register map, commerce-register limits enforced by store sections, `getStoreTheme(scope, register)` consumed by the store document | A commerce page has no glass token in its CSS and no transition longer than 250 ms (render matrix); a brand change bumps `catalog_version` so store pages show it on the next request | STO-§8.4 |
| LP-16 (store side; rev 4) | Per-city fees on attached landings | R2 (core D75) | S1 with the maintainer's R2 contract step (`landing-v3`, config v3) | the attach flow's "Facturer la livraison par ville" toggle, `both`-mode default on for landings created from a product, the "Pages de vente" fee chip, one fee rule (`storeDeliveryFee`) for the PDP and v3 landings | For every zone fixture the PDP and an attached v3 landing quote the same fee for the same city and subtotal (`test:catalog` parity, 100 %); a landing created from a product in `both` mode is `runtime_v = 3` with "charge by city" on; a v2 attached landing whose flat fee differs for a top-5 city shows the chip and raises landing's `landing:fee_mismatch` once (never a second storefront issue) | STO-§17.7 |
| LP-23 (rev 4) | Copy a page to another store I belong to | R2 | S1 (`src/lib/landing/copy.server.ts`, LAN-§26.2) | `copyPageToStore(ctx, pageId, targetHandle)` with media re-ingested under the target ids (core D21), landing.md LAN-§17.7 owns the behaviour | The copy references only the target store's assets (`assertOwned` on every id, tenancy case); `pages.write` required in both stores; audit rows in both; an attached page copies detached (`product_id` cleared: the target has no such product) | LAN-§17.7, STO-§27.2 |
| AI-19 (consumer; rev 4) | "Director review" button on store pages | R2 (cloud-only, on request; core §L.2) | S7 (task `critique.doc`) + S1 (mount) | the store page editor mounts S7's button for `home` and `page` kinds only (utility kinds are never critiqued, like they are never novelty-checked); ops applied through `src/lib/editor/store-page.ts` under ai's one acceptance rule (no new hard item, slop does not rise, bands stay `ok`; Q reported, AI-§A.8.2 stage 5) | With Cloud AI off the button is absent; on a `home` fixture an applied op passes `storePageChecklist` with no new hard item; a `product` template shows no button | STO-§23.6 |

### STO-§1.3 TENANCY-MAP items resolved here

| Item | Resolution | Spec |
|---|---|---|
| LND-01 | `StoreRenderContext` for store kinds; the landing `RenderContext` stays unchanged and is built per product for PDP sections | STO-§8.1 |
| LND-03 | `kinds` / `requires` live in `src/storefront/sections/eligibility.ts`, not in `SectionDefinition` | STO-§9.1 |
| LND-04 | `StorePageDoc` v1 + store theme (design); PageDoc v2 frozen | STO-§6.2 |
| LND-06, LND-07 | Required sections per kind (`KIND_RULES`); per-kind checklist in `src/lib/editor/store-page.ts` | STO-§6.1, §23.6 |
| LND-09, LND-10 | Store document shell with kind-specific head (JSON-LD, og:type) and runtime configs | STO-§8.3, §20 |
| LND-11 | Content ids from SKU / product key on PDP, cart, server events and attached landings | STO-D18, §16.8 |
| LND-15 | Cart, checkout and search are separate chunks; the PDP keeps one `form[data-lp-form]` | STO-§14 |
| LND-30 | Store page editor tabs per kind (new editor store, the landing editor untouched) | STO-§23.6 |
| LND-31 | `navHeader` chrome; landing `header` unchanged | STO-§10 |
| LND-33, ORD-19, ORD-20 | Payload v3, `OrderItemsV3`, store field model and delivery rule applied once per order | STO-§15, §16 |
| LND-34 | Store microcopy `src/storefront/i18n.ts` (ar/fr/en written; es/de/it/nl/pt flagged for review before an EU store) | STO-§24 |
| PUB-23 | Branded `not_found` kind under the store base; neutral 404 everywhere else | STO-§6.1, §7.4 |

### STO-§1.4 Signature features, store side (rev 2; rf §1, §3; core §K.2 ownership paragraph)

| ID | Feature (store side) | Rel. | Track | Scope here | Acceptance | Spec |
|---|---|---|---|---|---|---|
| SF-02 | Design DNA visible | R2 | S1 (UI mounts P6's components) | DNA card in the store page editor's Theme panel, brand DNA card on the storefront overview, "why this design" line per generated home, novelty words (bands), provenance columns on template versions | A generated home shows its DNA chips and a one-sentence why line in the admin locale; no numeric distance appears anywhere (grep on the rendered admin HTML); two stores from the same photos get `ok` bands and different chips | STO-§11.6, §23.5 |
| SF-03 | Store Health inputs | R2 | S1 (`src/lib/health/rules/storefront.ts`) | 11 rules (STO-§23.8; rev 4: rev 2 wrote 9, and the rev 3 fee-mismatch row is withdrawn in favour of landing's `landing:fee_mismatch`), each with evidence `n`, a fix link and `minN`; `markHealthDirty` on every catalog, template and storefront-settings write | `test:health` fixtures per rule with and without `minN`; a rule never reads another store (two-store fixture); fixing an issue never lowers the score | STO-§23.8 |
| SF-05 | Test-order mode on store pages | R2 | S1 (+ T3's `resolveTestToken`, P4/P5/P7 exclusions) | token carried through the store session, on-request test render of every kind, `test` in payload v3 and the WhatsApp lead | STO-D33 acceptance; the R2 store demo (STO-§26.4) places one test order end to end with revenue at 0 | STO-§7.2, §14.5, §16.2 |
| SF-08 | Delivery Promise on the store | R2 | S1 (engine: P3) | dated ETA + zone fee on PDP, cart, checkout, thank-you; not-served handling; calendar from `checkout`; **rev 3:** the call promise `{when}` from `ops.callingWindow` (STO-D45); the landing-fee mismatch chip (STO-D46; rev 4: the health issue is landing's `landing:fee_mismatch`) | ST-17 acceptance plus: the fee shown on the PDP for a city equals the fee charged for that city and subtotal in 100 % of `test:catalog` zone fixtures; the "{when}" under the submit equals the thank-you page's and the queue's next callable instant for the same `now` (`test:catalog` against P4's `isCallable` fixtures) | STO-§12.3, §15.8, §15.9 |
| SF-10 | Experiments on store pages (consumer) | R3 | D3 (engine) + S1 files | arm wrapper, head script and `exp` chunk on store kinds; URL arms on templates; the "no `productDetail` data in an arm" guard | `test:experiments` runs its render fixtures on a store home and a PDP template; an arm that touches the buy box is refused (`exp.buy_box`) | STO-§19.10 |
| SF-12 | Catalog from photos | R2 | S1 (+ S2 brand, S7 AI) | `createProductsFromPhotos` (drafts only, prices never proposed, facts ticked), the "À partir de photos" entry, the detached job for > 6 photos, the blueprint hand-off | 12 fixture photos → 8 ± 1 product drafts; no price field in any proposal; a suggested fact absent from copy until ticked; Cloud AI off → the same drafts from SigLIP + rules in < 2 s | STO-§4.7 |
| LP-11 (store) | WhatsApp-first ordering | R2 | S1 | server-priced WhatsApp order from the PDP, cart and checkout; lead kind `whatsapp`; agent conversion | STO-D34 acceptance; 50 parallel intents in one store yield 50 distinct refs | STO-§15.13 |

### STO-§1.5 Proven by (rev 4, CRIT17: every acceptance cell names its test command and fixture)

The "Acceptance" cells of STO-§1.1-§1.4 are the checkable statements (the "Scope" cells are deliverable lists by design
and are not what a verifier checks); this table names, per feature id, the command and the fixture or harness step that
proves each statement, and the test tables of STO-§26 cite the same ids back ("Proves" column), so the mapping is
mechanical in both directions. `npm test` = offline, `test:db` = throwaway `cod_test_*` databases, `test:e2e` = a
production build on port 3451+ (core §J), `test:slow` = the full sweeps before each merge (core §J.1).

| ID | Proven by (command · fixture or step) |
|---|---|
| ST-01 | `test:catalog` · `checkProductDoc` round trip over every `src/lib/page/fixtures.ts` doc and the `orderTotals` parity corpus · `test:storefront-db` · "quota: 201st draft on `beta` → `quota`", "slug change → 308 + `catalog_redirects`", "`shipped` hook replayed twice decrements once" |
| ST-02 | `qa:storefront-render` · every kind fixture × P / S base × ar / fr (status, chrome, `noindex` on the 404) · `qa:storefront-e2e` · "no horizontal overflow at 360 / 768 / 1440" screenshot step · `test:storefront-db` · "landing-mode store → 404 on `/p/x`, `/c/x`, `/cart`" · `test:catalog` · `storefront:menu_dead` fixture |
| ST-03 | `test:storefront-db` · "sort `price_asc` across pages", "bestsellers hidden below `sold_30d ≥ 3`" · `qa:storefront-render` · sold-out card fixture, page-2 canonical |
| ST-04 | `test:catalog` · fold subset (6 families × 3 shapes × ar / fr × 2- / 3-line names; the STO-§12.8 bottoms within ± 5 %) · `qa:storefront-e2e` · "fold contract" step (390 × 844 calibration, 360 × 740 soft report), "sticky bar hidden while the buy box is ≥ 50 % visible" · `qa:storefront-render` · `data-hero-cta` markers, inspection trust fixture · `test:slow` · PDP family share ≤ 30 % per niche |
| ST-05 | `test:storefront-db` · the v3 cases of STO-§26.2 (20 × 10 lines, `stale` → confirm, same-`rev` `ls` off by 1 → `stale`, two stores' keys → `invalid` with no row, `idem` replay, WhatsApp intent, test token) · `test:catalog` · STO-§16.8 parity (public = cart = WhatsApp = manual = edited) · `qa:storefront-e2e` · "price changed in the admin mid-checkout" |
| ST-06 | `test:store-runtime` · phone grouping and digit folding ("٠٦١٢٣٤٥٦٧٨"), combobox matching ("tanja", "طنجة", "Tanger") · `test:storefront-db` · E.164 storage `+212612345678` · `qa:storefront-render` · EU fixtures' `autocomplete` tokens |
| ST-07 | `qa:storefront-perf` · hit ≤ 5 ms p95, 304 without a DB query, "200 concurrent cold PDP requests render once" · `test:storefront-db` · "every write of STO-§7.5 bumps `catalog_version`" |
| ST-08 | `test:catalog` · JSON-LD builders (no `priceValidUntil`, no `aggregateRating` in R2, `variesBy`, `ItemList`), the canonical table · `qa:storefront-render` · absolute canonical / og / JSON-LD URLs · live (R2 exit) · Rich Results Test on 3 URLs |
| ST-09 | `test:catalog` · the 192-home subset (0 hard items, fold 100 %, N6) · `test:slow` / `qa:design-corpus` · the 1,200-home sweep (C1 ≤ 30 %, ≥ 60 sequences per 100, the 4-gram cap) · `qa:storefront-demo` · "same photos, two stores → `ok` bands, different families or pairings" |
| ST-10 | `qa:storefront-a11y` · static rules + keyboard script + contrast sampling on every kind fixture in ar / fr, the rev 2 WCAG 2.2 checks · manual (R2 exit) · TalkBack and VoiceOver paths of STO-§22.3 |
| ST-11 (R3) | `test:catalog` · index ≤ 12 KB gz for the 500-product fixture, quick-add eligibility table · `qa:storefront-e2e` · filters keep `?f=` with no page load |
| ST-12 (R3) | `qa:storefront-render` · sibling fixtures (`hreflang` + `x-default`, identical prices and ids, no `Vary: Accept-Language`) |
| ST-13 (R3) | `test:storefront-db` · "review token used twice → second refused", "imported review excluded from `aggregateRating`" · `qa:storefront-render` · disclosure wherever a rating renders |
| ST-14 (R3) | `test:storefront-db` · "20 parallel redemptions of a 10-use coupon → exactly 10", expired / capped → one generic `invalid` · `test:catalog` · percent never makes a line negative |
| ST-15 (R3) | `test:storefront-db` · "two parallel confirmations in `confirmed` mode → `stock_short`", "two parallel orders in `order` mode → `unavailable`", "100 fake orders hold 0" |
| ST-16 (R3) | `test:catalog` · the garment skeleton has headers only · `qa:storefront-a11y` · the sheet traps focus |
| ST-17 | `test:catalog` · ETA text byte-identical to `test:delivery`'s expectations on `scripts/qa/fixtures/city-key.json` (the "Fès" case, `null` → `*`) · `qa:storefront-e2e` · "dated line changes with the city and matches the thank-you text" |
| ST-18 (R3) | `qa:storefront-render` · no `unload` in store chunks, `speculationrules` hashed into the CSP · manual · DevTools bfcache test on home, collection, PDP |
| ST-19 (R3) | `test:catalog` · storylines 5-8 in the corpus subset; the `drop` storyline absent without a launch date |
| ST-20 (R3) | `test:catalog` · `BreadcrumbList` items equal the visible trail |
| ST-21 | the EU gate fixture in `test:catalog` at the first EU store (each item red → checkout publish refused) |
| ST-22 | own acceptance when scheduled |
| LP-07 | `test:storefront-db` · "price change → one `sync` row per attached page, all ≤ 10 inside the saving request", "crossing → `html` + `product_rev` rewritten, no row", "order from old HTML → `stale`" · `qa:storefront-e2e` · "price changed mid-checkout on page 7 of 10" |
| LP-08 | `qa:storefront-render` · a landing created from a product renders the store logo and locked brand colours; `store` theme mode re-renders after a brand change (one tick, fixture) |
| DG-11 | `qa:storefront-render` · commerce register fixtures (no glass token, no transition > 250 ms, accent ≤ 8 % by the height model) · `test:storefront-db` · brand change bumps `catalog_version` |
| LP-16 (store side) | `test:catalog` · "PDP fee = attached v3 landing fee for every zone fixture" · `test:storefront-db` · "landing created from a product in `both` mode is `runtime_v = 3`" |
| LP-23 | `test:storefront-db` · `copyPageToStore` tenancy case (only B's asset ids; one-store `pages.write` → `not_found`; audit rows in both) |
| AI-19 (consumer) | `qa:storefront-e2e` · button absent with Cloud AI off, absent on utility kinds · `test:catalog` · an applied op on the `home` fixture leaves `storePageChecklist` with no new hard item |
| SF-02 | `qa:storefront-e2e` · admin HTML of the overview and the editor: DNA chips and why line present, no decimal in a novelty context (regex) · `qa:storefront-demo` · two stores from the same photos show different chips |
| SF-03 | `test:health` · the STO-§23.8 rows with and without `minN`, the two-store fixture |
| SF-05 | `test:storefront-db` · the test-session cases · `qa:storefront-render` · test render without pixel script, banner, `noindex` · `qa:storefront-demo` · the 1:20-2:30 steps |
| SF-08 | `test:catalog` · PDP fee = charged fee on 100 % of the zone fixtures; `{when}` = P4's `nextCallableAt` on the shared window fixture (STO-§26.1) |
| SF-10 (R3) | `test:experiments` · store home and PDP template fixtures · `test:storefront-db` · arm touching `productDetail` → `exp.buy_box` |
| SF-12 | `test:catalog` · the 12-photo fixture (8 ± 1, no `price` key, digits only from ticked facts) · `qa:storefront-e2e` · 30 photos → `job_queued`, heartbeats ≤ 10 s · `qa:storefront-demo` · step 0:00 |
| LP-11 (store) | `test:storefront-db` · "50 parallel intents → 50 refs", a ref of A not found from B · `test:catalog` · text total = `orderTotals` on `duo`, `tshirt`, `colors` |
| v3 manual-order pricing (core §K.4, OPS-15) | `test:catalog` + `test:storefront-db` · "manual v3 total = public v3 total" on every fixture cart; `editOrderV3` adding a sold-out variant changes nothing |

---

## STO-§2 Today (read before changing)

| What exists | Where | How this part uses it |
|---|---|---|
| Offers v2 model: items (1-8), line-based offers, choice / matrix / field groups, display axes | `src/lib/page/schema.ts:120-467`; OFFERS §B-§E | The product document is exactly `{ product, items, offers }` (STO-§4.1) |
| Integer-cent pricing shared by server, renderer, runtime and PHP | `src/lib/page/pricing.ts:21-357`, `src/landing/runtime/money.ts` | Line prices on PDP, cart, checkout and server (STO-§16.4); no new pricing code |
| Selection resolution and validation | `src/lib/orders/validate.ts:171` (`resolveSelection`), `:320` (`validateOrder`) | Called per v3 line with the product's synthetic PageDoc (STO-§16.4) |
| Order payload v2, response, field error keys | `src/lib/orders/contract.ts:36-235` | v3 reuses `UnitIn`, the delivery fields and the error vocabulary (STO-§16.1) |
| Landing runtime modules, chunk registry, typed bus | `src/landing/runtime/{init,core,bundles,units,gallery,tabs,accordion,video,sticky,analytics}.ts` | Imported by the new `pdp` entry (STO-§14.2); the landing entry (`entry.ts`) and its chunk stay byte-identical |
| Runtime config v2 builder | `src/lib/render/config.ts:231` (`buildRuntimeConfig`) | Builds the PDP's `#lp-config` from `productAsPageDoc` (STO-§12.2) |
| Hash CSP builder | `src/lib/render/csp.ts` (`buildLandingCsp`, connect-src narrowed to `/api/public/`) | Store documents use it unchanged; every store API lives under `/api/public/store/` (STO-§7.6) |
| Document serving (ETag, br/gzip, neutral 404, 503) | `src/lib/render/serve.server.ts:142-238` | `storeDocumentResponse` wraps `documentResponse` for on-request HTML (STO-§7.3) |
| Theme engine, fonts, picture primitive | `src/lib/theme/**`, `src/lib/theme/fonts.ts`, `src/landing/primitives/Picture.tsx:36-140` | Store document CSS, LCP image preload, AVIF/WebP srcsets (STO-§21) |
| Markets: phone (libphonenumber "max", Arabic digits), 147 MA cities with fr/ar/en labels, money format | `src/lib/markets/{phone,cities-ma,info,money,specs}.ts` | Checkout fields, city combobox, money display (STO-§15.5-§15.7) |
| Legal pages from store facts | `src/landing/legal/**` (`LegalBody`, `content.ts`) | Policy pages inside the store chrome (STO-§6.5) |
| Product JSON-LD (Offer / AggregateOffer, brand omitted for placeholder names) | `src/landing/document.tsx:247-293` | Replaced on store kinds by ProductGroup / Organization / ItemList builders (STO-§20.4); landing JSON-LD unchanged |
| Order text grammar v2 (warehouse / customer) | `src/lib/orders/text.ts:188-288`; OFFERS §G.4 | Each v3 line prints its v2 text; lines joined by the v3 grammar (STO-§16.7) |
| Stats per page per day | `src/lib/stats/index.ts`, `stats_daily (page_id, day)` | Product views and checkout starts keyed by product id (STO-D23) |
| Landing hero variants today: `stage`, `editorial`, `poster`, `scrapbook`, `spec`, `split` (`src/landing/sections/hero/index.tsx:108-140`); `stage` renders on 23 of 39 baseline pages (DB §3.1) | `src/landing/sections/hero/**` | The store hero families of STO-§9.3 and §12.8 are store sections with their own CSS; they borrow the stage/spec/editorial craft (DB §6 keep-list 7) and never `scrapbook` (banned, DESIGN v3) |
| Sticky bar gate (steps in only after the hero CTA, hides while any `[data-hero-cta]` or the order form is on screen, `aria-hidden` + `inert` when hidden; rAF + `getBoundingClientRect`, **not** an IntersectionObserver, and it toggles `data-visible`, never `data-in`) | `src/landing/runtime/sticky.ts:1-40`; `src/landing/primitives/Cta.tsx:95` (`data-hero-cta`); `whatsappFloat.css:379-383` (`html.lp-js:has([data-sticky-cta]:not([data-visible]))`) | Reused by the PDP; **rev 3 (UX-4):** the buy box's primary action and the checkout block's submit carry `data-hero-cta`, so the frozen module already hides the bar near every in-flow primary CTA with zero new bytes; the store WhatsApp float docks with the same `:has([data-sticky-cta][data-visible])` CSS hook (STO-§10.3, §12.5) |
| Runtime budgets today: `landing 24200`, `thanks 6650`, `pixels 3900`, `turnstile 1300`, `units-matrix 2200`, `units-fields 1000`, `fill-steps-box 1750`, `whatsapp 5800`, `page 32000` (**rev 3:** `landing` is re-measured and rewritten by T3 after the R1.0 storage-prefix change, core §C.9; the storefront reads whatever value and sha256 T3 records, ENGP-26) | `src/landing/runtime/budgets.json`; render-check `scripts/qa/render-check.ts:119-131` | The store keys (STO-§14.1) join the same file and the same +5 % rule (core §H.13; **rev 4:** the `landing` chunk itself is checked with tolerance 0, ENGC-10); `store-page` is derived from the heaviest set's budgets and declared in `budgets.json.compositions` (STO-§14.6, core ENGP-12) |
| Design engine contracts this part consumes (R1 deliverables of P6): `GRAMMARS` and the genome types (DES-§4.1), the choreography expander and the height model (DES-§5.3, §5.5), the kind grammars for store pages (DES-§5.6), `runGates` / `GateReport` (DES-§8.1), registers (DES-§11.1), the DNA card (DES-§15.4) | `src/lib/design/**` (P6, R1) | Store sections register `features` (DES-§8.4) and per-kind grammars; the storefront never re-implements a gate |
| Delivery engine this part consumes (R1 deliverable of P3): `DeliveryZoneRow`, `StoreCalendar`, `EtaWindow`, `ZoneLine`, `listZones`, `zoneForCity`, `zoneLineFor`, `etaWindow`, `etaText`, the MA holiday seed | `src/lib/delivery/**` (LAN-§7.1-7.2) | STO-§12.3, §15.8, §15.9 call these; nothing is re-implemented |
| City key (R1 deliverable of P4, P0 frozen stub): `CityKey`, `cityKey(value)`, `normalizeCity(input, market, aliases)` (**rev 3, OPS-1:** the one canonical stored key of STO-D43, core D68) and landing's `ZoneTable` / `zonesForCheckout(scope)` (P3, P0 stub, LAN-§7.1: `city` keyed by the posted `City.value`, built on the server from the slugs); **rev 4 (CRIT1):** the store chunks do **not** bundle `cityKey` (rev 3 asked them to); only server code calls it | `src/lib/orders/address.ts` (OPE-§10.1), `src/lib/delivery/zones.server.ts` (LAN-§7.1), `scripts/qa/fixtures/city-key.json` (P4) | STO-§12.3, §15.7, §15.9, §16.2 step 13: the server converts the posted `City.value` before any zone lookup; the browser reads `ZoneTable.city[value] ?? star` |
| Calling window (R1 deliverable of P4, P0 stub, core D73): `callingWindowFor(scope): Promise<EffectiveWindow>` (never `null`; `window.server.ts`) and the pure, isomorphic `isCallable(now, w)`, `nextCallableAt(t, w)`, `rangesForDay(ymd, w)`, `hoursText(w, locale, dateLocale, now)` (`window.ts`, OPE-§5.5); **rev 4 (CRIT3):** `EffectiveWindow` is consumed as operations' type and never restated (OPE rev 4: JSON-safe, `days: Record<IsoWeekday, Range[]>`, `configured`, `shopperPromiseAllowed(w)`, the shared fixture `src/lib/callcenter/window.fixtures.ts`) | `src/lib/callcenter/**`, `ops.callingWindow` (OPE-§2.9) | STO-D45: the checkout promise line (browser, at view time), the footer and contact hours, the thank-you `{when}` |
| Test-order plumbing (R1.0, T3): `resolveTestToken(store, token)`, the core-owned `orders.is_test` / `leads.is_test` columns and `orders_store_test_idx` (**0004**, core rev 3 ENGC-1), `renderTestDocument()`, `RenderAddons.banner = "test"` | core §E.2, §C.4.1, §D.2, §H.13 | Store routes reuse the token and the banner (STO-D33) |
| Shared order insert (R1.0, T3; **rev 3, ENGC-13**): `createOrderRow(draft: OrderDraft, ctx)` extracted from `src/lib/orders/create.ts:255-300` (id retry on `ER_DUP_ENTRY`, `is_test`, `rev`, `confirm_state` defaults, `upsell_token_hash`, `order_events` "created", `INSERT IGNORE` outbox, hooks) and frozen at P0; the R2 contract step only widens `OrderDraft` for v3 (`items: OrderItems \| OrderItemsV3`, NULL `page_id` / `version_id`, `catalog_version`) | core §K.1 T3, §K.4 (STO-R12 (a) re-dated, STO-R35) | STO-§16.2 step 16 and §16.9 call it; the manual v2 path (OPE-§11.1 step 5) calls the same function, so the insert exists once |
| Core additions this part relies on | core §C.4.1 (`/p`, `/c`, `/cart`, `/checkout`, `/search`, `/<slug>/[...rest]`, locale-prefix and `@` slugs), §C.6 URL builders, §D.2 `pages.kind` / `pages.product_id` / `pages.attach_opts` / `page_versions.product_rev` / `kind 'sync'` / `orders.catalog_version` / nullable `orders.page_id` / nullable `leads.page_id` / `is_test`, §D.6 catalog tables incl. `catalog_redirects` and `inventory_moves`, §E.2 `resolveProductKey` / `resolveContextKey`, §E.6 render cache key with `:w${windowId}` and `getOrLoad`, §H.3 render jobs incl. `republishAttached`, §H.13 store chunk budgets, §M gate registry | Everything below |

What does **not** exist and is built here: store page kinds, `StorePageDoc`, `StoreRenderContext`, store sections and
chrome, catalog tables and editors, inventory, cart, checkout, payload v3, the content of the store SEO files, the store
runtime chunks, product ↔ landing attachment.

---

## STO-§3 Data model

### STO-§3.1 `pages.kind` values and template slugs

| `kind` | Rows per store | `slug` | Doc | Served at | Release |
|---|---|---|---|---|---|
| `landing` | many | owner slug (`SLUG_RE`, `src/lib/render/publish.server.ts:47`) | PageDoc v2 (frozen) | `/<slug>`, `/<slug>/merci` | R1 (exists) |
| `home` | 0-1 | `@home` | StorePageDoc v1 | `/` (when `stores.home_page_id` points to it) | R2 |
| `product` | 0-1 | `@product` | StorePageDoc v1 | `/p/<product-slug>` | R2 |
| `collection` | 0-1 | `@collection` | StorePageDoc v1 | `/c/<collection-slug>` | R2 |
| `page` | many | owner slug (`SLUG_RE`) | StorePageDoc v1 | `/<slug>` | R2 |
| `search` | 0-1 | `@search` | StorePageDoc v1 | `/search` | R2 |
| `cart` | 0-1 | `@cart` | StorePageDoc v1 | `/cart` | R2 |
| `checkout` | 0-1 | `@checkout` | StorePageDoc v1 | `/checkout`, `/checkout/merci` | R2 |
| `not_found` | 0-1 | `@not_found` | StorePageDoc v1 | any unknown path under the store base, status 404 | R2 |
| `policy` | 0 (reserved) | — | — | `/policies/<kind>` renders `LegalBody` in the chrome without a page row | — |

- Template slugs start with `@`, which `SLUG_RE` never accepts: no landing or custom page can take them, `/[slug]`
  lookups never find them, and the existing unique index `pages_store_slug_uq (store_id, slug)` (core §D.2) is the
  **one-template-per-kind** guarantee.
- `pages.public_key` exists for every row; for template rows it is the **context key** that store pages send in
  analytics beacons and checkouts (`ctx`, STO-§16.1).
- `pages.product_id` is set only on `landing` rows attached to a product (STO-§17). `pages.theme_mode` (0006) is read
  only on `landing` rows.
- `pages.name` of a template row = the kind label ("Product page"); of a custom page = the owner's title.
- `page_versions` rows of non-landing kinds keep `html`, `thank_you_html`, `csp`, `thank_you_csp` NULL and `runtime_v =
  2` (the landing runtime contract the PDP buy box embeds); `checksum` = sha256 of the validated `StorePageDoc` JSON
  (the landing rule, extended by request STO-R3, accepted: core §D.8, §H.4 validate `kind ≠ 'landing'` versions against
  `StorePageDoc`).
- **rev 2:** template versions carry the same provenance as landing versions: `generation_source` (`manual` for an
  owner publish, `instant` for `defaultTemplate`, `director` / `deep` when the blueprint job produced the doc) and
  `critic_picks` (≤ 2 KB: grammar slot, hero family, repair ops, prompt versions; never page text) (core §D.2 0005,
  ra §5.6). The DNA card (STO-D39) reads them.
- `pages.attach_opts` (0006, STO-R6 accepted) on attached `landing` rows: `{ v: 1, indexable: boolean = false,
  keepNames: boolean = true, keepPhotos: boolean = true }`; overrides are **computed** at render and in the editor
  (LAN-§17.3), never stored.

### STO-§3.2 Catalog tables (0006, refined from core §D.6)

```ts
// src/lib/db/schema.ts (written by the maintainer from this section; helper names per core §D.1)
export const products = mysqlTable("products", {
  id: id26().primaryKey(),
  storeId: storeRef(),
  slug: varchar("slug", { length: 80 }).notNull(),                       // SLUG_RE; never a STORE_RESERVED_SLUG
  status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("draft"),
  name: varchar("name", { length: 160 }).notNull(),                      // = doc.product.name (lists, search, Sheets)
  publicKey: varchar("public_key", { length: 40 }).notNull(),            // same generator as pages.public_key; global (STO-R1)
  rev: char("rev", { length: 26 }).notNull(),                            // ULID; new on every priced or availability change (STO-§4.3)
  doc: jsonText<ProductDocJson>("doc").notNull(),                        // { product, items, offers } (STO-§4.1)
  content: jsonText<ProductContent>("content").notNull(),                // { v: 1, sections: SectionInstance[] } (STO-§4.2)
  seo: jsonText<ProductSeo>("seo").notNull(),                            // { title?, description?, ogImage?, noindex }
  stock: jsonText<StockConfig>("stock").notNull(),                       // stock axis per item + low-stock display (STO-§5.1)
  primaryCollectionId: id26("primary_collection_id"),                    // "related" source; breadcrumbs (R3)
  tags: jsonText<string[]>("tags"),                                      // ≤ 20 tags × ≤ 32 chars
  searchText: varchar("search_text", { length: 1000 }).notNull().default(""),   // folded text (STO-§13.3)
  priceMinCents: cents("price_min_cents").notNull().default(0),          // min `from` over available offers
  priceMaxCents: cents("price_max_cents").notNull().default(0),          // max `from` over available offers
  available: boolean("available").notNull().default(true),               // ≥ 1 available offer after stock
  sold30d: int("sold_30d").notNull().default(0),                         // STO-D22
  position: int("position").notNull().default(0),                        // "featured" order
  catalogVersion: int("catalog_version").notNull().default(0),           // stores.catalog_version written by the last save
  publishedAt: ts("published_at"),                                       // first activation
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("pr_store_slug_uq").on(t.storeId, t.slug),
  uniqueIndex("pr_key_uq").on(t.publicKey),
  index("pr_store_status_pos_idx").on(t.storeId, t.status, t.position),
  index("pr_store_status_sold_idx").on(t.storeId, t.status, t.sold30d),
  index("pr_store_status_price_idx").on(t.storeId, t.status, t.priceMinCents),
  index("pr_store_updated_idx").on(t.storeId, t.updatedAt),
]);
// 0007 (R3): + size_guide longtext NULL (ST-16), + i18n longtext NULL (ST-12)

export const collections = mysqlTable("collections", {
  id: id26().primaryKey(), storeId: storeRef(),
  slug: varchar("slug", { length: 80 }).notNull(), name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),                                      // RichText ≤ 4,000 chars
  media: jsonText<AssetRef | null>("media"),                             // header image
  rules: jsonText<CollectionRules>("rules").notNull(),                   // { kind: "manual" } (R2) | { kind: "auto", … } (R3, STO-§4.6)
  sort: mysqlEnum("sort", ["manual", "newest", "bestsellers", "price_asc", "price_desc"]).notNull().default("manual"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("draft"),
  seo: jsonText<CollectionSeo>("seo").notNull(),                         // { title?, description?, ogImage?, noindex }
  position: int("position").notNull().default(0),
  productCount: int("product_count").notNull().default(0),               // active members (denormalised)
  createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("co_store_slug_uq").on(t.storeId, t.slug), index("co_store_status_pos_idx").on(t.storeId, t.status, t.position)]);

export const collectionProducts = mysqlTable("collection_products", {
  storeId: storeRef(), collectionId: id26("collection_id").notNull(), productId: id26("product_id").notNull(),
  position: int("position").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.storeId, t.collectionId, t.productId] }),    // refines core §D.6 PK (collection_id, product_id): tenant keys start with store_id (core §D.1)
  index("cp_store_product_idx").on(t.storeId, t.productId),
  index("cp_store_coll_pos_idx").on(t.storeId, t.collectionId, t.position),
]);

export const inventoryLevels = mysqlTable("inventory_levels", {
  storeId: storeRef(), productId: id26("product_id").notNull(),
  stockKey: varchar("stock_key", { length: 64 }).notNull(),              // refines core column `sku`: a stock key is not always a SKU (STO-§5.2)
  onHand: int("on_hand"),                                                // NULL = not counted (flags only)
  held: int("held").notNull().default(0),                                // R3 soft holds (stays 0 in R2)
  lowAt: int("low_at"),                                                  // owner threshold for alerts and the optional shopper line
  updatedBy: id26("updated_by"), updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.productId, t.stockKey] })]);
```

### STO-§3.3 Tables this part asks the core to add (0006)

```ts
// request STO-R4: slug history for products and collections (STO-D21)
export const catalogRedirects = mysqlTable("catalog_redirects", {
  storeId: storeRef(), kind: mysqlEnum("kind", ["product", "collection"]).notNull(),
  fromSlug: varchar("from_slug", { length: 80 }).notNull(), toId: id26("to_id").notNull(), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.kind, t.fromSlug] }), index("crd_store_to_idx").on(t.storeId, t.toId)]);

// request STO-R5: every stock change, and the idempotency of order-driven moves (STO-§5.4)
export const inventoryMoves = mysqlTable("inventory_moves", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  storeId: storeRef(), productId: id26("product_id").notNull(), stockKey: varchar("stock_key", { length: 64 }).notNull(),
  delta: int("delta").notNull(),
  reason: mysqlEnum("reason", ["manual", "shipped", "returned_restock", "import", "hold", "release", "correction"]).notNull(),
  orderId: varchar("order_id", { length: 20 }),                          // NULL for manual / import moves
  note: varchar("note", { length: 200 }), at: ts("at").notNull().default(now3), by: id26("by"),
}, (t) => [
  uniqueIndex("im_order_uq").on(t.storeId, t.orderId, t.productId, t.stockKey, t.reason),   // NULL order ids never collide (MariaDB unique semantics)
  index("im_store_product_idx").on(t.storeId, t.productId, t.at),
]);
```

### STO-§3.4 R3 tables refined (0007, core §D.6)

```ts
export const stockHolds = mysqlTable("stock_holds", {
  id: id26().primaryKey(), storeId: storeRef(), orderId: varchar("order_id", { length: 20 }).notNull(),
  productId: id26("product_id").notNull(), stockKey: varchar("stock_key", { length: 64 }).notNull(),   // refines core `sku`
  qty: int("qty").notNull(), state: mysqlEnum("state", ["held", "released", "decremented"]).notNull().default("held"),
  expiresAt: ts("expires_at").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("sh_order_uq").on(t.storeId, t.orderId, t.productId, t.stockKey),
  index("sh_store_key_state_idx").on(t.storeId, t.productId, t.stockKey, t.state),
  index("sh_store_exp_idx").on(t.storeId, t.state, t.expiresAt),
]);

export const reviews = mysqlTable("reviews", {
  id: id26().primaryKey(), storeId: storeRef(),
  productId: id26("product_id"), pageId: id26("page_id"),               // exactly one: a catalog product, or a non-attached landing page
  orderId: varchar("order_id", { length: 20 }),                          // NULL only for imported reviews
  rating: tinyint("rating").notNull(),                                   // 1..5
  body: text("body"),                                                    // ≤ 2,000 chars, plain text
  authorDisplay: varchar("author_display", { length: 40 }).notNull(),    // "Salma B." (first name + initial, from the order)
  cityDisplay: varchar("city_display", { length: 60 }),
  variantDisplay: varchar("variant_display", { length: 120 }),           // "Pack Duo · Noir/M" (customer text of the line)
  media: jsonText<AssetRef[]>("media"),                                  // ≤ 4 photos; EXIF location stripped by the media pipeline
  verified: boolean("verified").notNull().default(false),                // true only through a signed request of a delivered order
  imported: boolean("imported").notNull().default(false),
  incentivized: boolean("incentivized").notNull().default(false),
  status: mysqlEnum("status", ["pending", "published", "hidden"]).notNull().default("pending"),
  hiddenReason: varchar("hidden_reason", { length: 40 }),                // spam, offensive, personal_data, off_topic, duplicate, other
  locale: varchar("locale", { length: 5 }), consentAt: ts("consent_at"), publishedAt: ts("published_at"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index("rv_store_product_idx").on(t.storeId, t.productId, t.status, t.publishedAt),
  index("rv_store_page_idx").on(t.storeId, t.pageId, t.status, t.publishedAt),
  uniqueIndex("rv_order_target_uq").on(t.storeId, t.orderId, t.productId, t.pageId),
  index("rv_store_status_idx").on(t.storeId, t.status, t.createdAt),
]);

export const reviewRequests = mysqlTable("review_requests", {
  id: id26().primaryKey(), storeId: storeRef(), orderId: varchar("order_id", { length: 20 }).notNull(),
  targets: jsonText<{ productId?: string; pageId?: string; label: string }[]>("targets").notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(), channel: mysqlEnum("channel", ["whatsapp", "sms", "manual"]).notNull(),
  sentAt: ts("sent_at"), usedAt: ts("used_at"), expiresAt: ts("expires_at").notNull(), createdBy: id26("created_by"), createdAt: createdAt(),
}, (t) => [uniqueIndex("rr_token_uq").on(t.tokenHash), uniqueIndex("rr_order_uq").on(t.storeId, t.orderId)]);

export const coupons = mysqlTable("coupons", {
  id: id26().primaryKey(), storeId: storeRef(),
  code: varchar("code", { length: 32 }).notNull(),                       // stored upper-case, [A-Z0-9-]{3,32}
  kind: mysqlEnum("kind", ["percent", "fixed", "free_delivery"]).notNull(),
  percentBp: int("percent_bp"), valueCents: cents("value_cents"),        // percent: 100..9000 bp; fixed: > 0
  scope: jsonText<CouponScope>("scope").notNull(),                       // { kind: "all" } | { kind: "products", ids } | { kind: "collections", ids }
  minSubtotalCents: cents("min_subtotal_cents"), maxUses: int("max_uses"), uses: int("uses").notNull().default(0),
  perPhoneMax: tinyint("per_phone_max"), startsAt: ts("starts_at"), endsAt: ts("ends_at"),
  status: mysqlEnum("status", ["active", "paused", "archived"]).notNull().default("active"),
  note: varchar("note", { length: 200 }), createdBy: id26("created_by"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cpn_store_code_uq").on(t.storeId, t.code), index("cpn_store_status_idx").on(t.storeId, t.status)]);

export const couponRedemptions = mysqlTable("coupon_redemptions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(), storeId: storeRef(),
  couponId: id26("coupon_id").notNull(), orderId: varchar("order_id", { length: 20 }).notNull(),
  phoneHash: char("phone_hash", { length: 64 }).notNull(),               // refines core `phone`: hmac(E.164, "coupon:<storeId>"), no PII copy
  discountCents: cents("discount_cents").notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex("cr_order_uq").on(t.storeId, t.couponId, t.orderId), index("cr_phone_idx").on(t.storeId, t.couponId, t.phoneHash)]);
```

### STO-§3.5 Store settings owned by this part (core §D.10)

| Key | Release | Schema file | Content |
|---|---|---|---|
| `storefront` | R2 | `src/lib/settings/keys/storefront.ts` | header, menus, announcement, footer, WhatsApp float, store-page pixel answer, home archetype, product card style, digits, low-stock display default (STO-§10.1) |
| `checkout` (block `store`) | R2 | `src/lib/settings/keys/checkout-store.ts` (request STO-R16: the registry merges it into `checkout`) | `buyModel`, `fallbackFeeCents`, `cartEnabled`, `whatsappAlternative`, `maxLines`, `maxQty` (STO-§15.1); R3: `reserveAt` (`"confirmed"` default \| `"order"`, STO-D5 rev 3); the R1 fields of `checkout` (`zonesEnabled`, `calendar` incl. `confirmationLeadDays`, market field model, **`addressMode: "required" \| "optional" \| null`** (`null` = the market default; landing's key, core §D.10, UX-31), **`confirmationCall`** (the confirmation-call promise flag; rev 4: rev 3 called it `callPromise`)) stay landing.md's and `checkout-store.ts` never redefines them; the calling **hours** are `ops.callingWindow` (STO-D45), never a checkout field |
| `reviews` | R3 | `src/lib/settings/keys/reviews.ts` | request delay (days after delivery, default 3), channel (`whatsapp` / `manual`), incentive disclosure text, auto-publish verified (default on) (STO-§18) |

---

## STO-§4 Catalog (ST-01)

### STO-§4.1 The product document

```ts
// src/lib/catalog/schema.ts (isomorphic, pure)
import { Item, Offers, Product, LIMITS, PageDocObject, type PageDoc } from "@/lib/page/schema";

/** What `products.doc` stores: the same shapes as a landing page's product, items and offers (OFFERS §B-§D). */
export const ProductDocJson = z.object({
  product: Product,                                    // name, tagline, description, category, images (≤ 30), cutout; `rating` always dropped
  items: z.array(Item).min(1).max(LIMITS.items),
  offers: Offers,
});
export type ProductDocJson = z.infer<typeof ProductDocJson>;

export type ProductDocCheck =
  | { ok: true; doc: ProductDocJson; warnings: OfferWarning[] }
  | { ok: false; issues: { path: string; message: string }[] };

/**
 * Validate by building a full PageDoc around the product, so every Offers v2 refinement and repair runs
 * (upgradeDoc → PageDocObject.superRefine(docIssues)), then keep only { product, items, offers }.
 * The store rules of STO-§4.4 are applied first.
 */
export function checkProductDoc(raw: unknown, store: Pick<StoreRow, "market" | "currency" | "defaultLocale">): ProductDocCheck;

/** The synthetic PageDoc used by the renderer, the runtime config v2 and order validation (STO-§12.2, §16.4). */
export function productAsPageDoc(p: ProductRowLike, s: ProductDocStoreCtx): PageDoc;
export interface ProductDocStoreCtx {
  store: StoreRow; locale: Locale; form: FormConfig;             // store field model (STO-§15.5) as a FormConfig
  minFeeCents: number;                                           // STO-D25
  levels: readonly InventoryLevelRow[];                          // applyStock input (STO-§5.3)
  theme: ThemeSpec;                                              // compiled store theme, commerce register (STO-§8.4)
  tracking: Tracking;                                            // storefront pixel answer (STO-D18)
  /** rev 4 (OPS-14, core §A.2 / §K.4, PLA Q3.8): the onboarding direction of a `store`-mode reveal. When set, `theme`
   *  is compiled from the direction's genome in the commerce register (never the store theme, which does not exist yet)
   *  and the PDP family is the one the direction's G2 draws (STO-§12.8 pool), so the three reveal folds differ in
   *  family, pairing and colour; the priced content (items, offers, stock) is identical across directions. */
  direction?: { key: string; genome: PageGenes /* design's sampled genome for one direction, DES-§14.3; never a raw theme */ };
}
```

`productAsPageDoc` = `{ v: 2, locale, market: store.market, currency: store.currency, product (rating dropped), items:
applyStock(…).items, offers: { …doc.offers, shippingFee: minFeeCents / 100, orderBump: undefined, upsell: undefined,
urgency: { countdownEnd: doc.offers.urgency.countdownEnd } }, form, theme, sections: [], seo: { noindex: false },
tracking, thankYou: { showTimeline: true } }`, then `PageDocObject.parse`. It must succeed for every valid product; a
failure is a bug, logged as `[catalog] synthetic doc invalid <productId>`, and the PDP answers its "temporarily
unavailable" state (STO-§12.7), never a wrong price.

### STO-§4.2 Product content sections

```ts
export const ProductContent = z.object({
  v: z.literal(1),
  /** landing section instances eligible on the product kind (STO-§9.1), rendered by the PDP's productContent slot */
  sections: z.array(SectionInstance).max(20),
});
```
- Each instance is validated by its landing definition (`getSection(type).schema`, `src/landing/registry.ts:66`) and by
  `ELIGIBILITY[type].kinds.includes("product")`; unknown or ineligible types are refused on save (`invalid`).
- Defaults: the product generator (catalog from photos, rf §1.10; generation itself belongs to design.md and ai.md)
  proposes the same content sections it proposes for a landing page; "Create a campaign page" (STO-§17.5) copies them
  into the landing.
- Review-like sections can never be saved here: those types are not eligible (STO-D12).

### STO-§4.3 Identity, revision and derived columns

- `publicKey` is generated once at creation and never changes (it is in carts and in rendered PDP configs).
- `rev` = `newId()` (ULID) on create and whenever **(a)** the canonical JSON of `doc` changes, or **(b)** the product's
  effective availability changes (an inventory crossing, STO-§5.4). Content, SEO, tags, position and collection
  membership never change `rev` (they cannot change a price or an option).
- Derived on every save (pure `deriveProduct(doc, levels, stock)` in `src/lib/catalog/derive.ts`): `name =
  doc.product.name`; `priceMinCents` / `priceMaxCents` = min / max `offersMath(doc)[i].from` over the offers available
  after `applyStock` (all offers when none is available, so sorting stays stable); `available`; `searchText`
  (STO-§13.3).
- `stores.catalog_version` is bumped (`UPDATE stores SET catalog_version = catalog_version + 1 WHERE id = ?`) in the same
  transaction as every write listed in STO-§7.5, then `invalidateStore(storeId)` (core §E.6) drops the cached store row
  so the next request in this process sees the new version.
- **rev 2 · `onProductChanged(scope, productId, change)`** (landing's hook, LAN-§17.4; `change ∈ { "prices", "options",
  "stock_transition", "content" }`) is called in `after()` by every product write that changes `rev` (`prices` /
  `options`), by an inventory crossing (`stock_transition`) and by a content-only save that changed the name or the
  photos (`content`); it enqueues the attached-landing republish (STO-§17.3). A decrement that stays above 0 calls
  nothing. **rev 3 (ENGP-10):** only `prices` and `options` produce a `sync` **version**; `stock_transition` and
  `content` are **in-place re-renders** of the published version's rendered columns (`html`, `csp`, `etag`,
  `product_rev`; core D50), because a stock crossing changes availability, never a priced total, and the order path
  reads availability live through `attachedDocFor`. The handler decides from `change`, so the caller stays one
  function.

### STO-§4.4 Store rules on top of Offers v2

| Rule | Behaviour | Why |
|---|---|---|
| `product.rating` | dropped on every write | STO-D12 |
| `offers.orderBump`, `offers.upsell` | dropped on save with the note "Ajouts et offres après commande : sur les pages de vente" | STO-D9 (payload v3 has no bump; the store thank-you has no upsell in R2) |
| `offers.urgency.stockLeft` | dropped; stock comes from inventory (STO-§5) | owner rule 4 |
| `offers.urgency.countdownEnd` | kept only when in the future; the PDP shows a countdown only for a real end date | OFFERS §C honesty |
| `offers.shippingFee` | stored as given but **ignored** in store mode (STO-D10, D25) | one delivery rule per store |
| Item `compareAt` ≤ `price` | warning (`offerWarnings`), never displayed | genuine compare-at only |
| SKU duplicated across products of the store | warning "SKU déjà utilisé par {product}" (content ids and Sheets would merge) | LND-11 |
| Slug | `SLUG_RE`, not in `STORE_RESERVED_SLUGS` (core §C.4.1), unique per store among products | STO-D21 |
| Photos | every `AssetRef.id` in `doc`, `content` and `seo` passes `assertOwned(scope, "asset", ids)` (core §E.3 rule 5) | MED-18, LND-05 |

### STO-§4.5 Repositories and actions

```ts
// src/lib/catalog/products.server.ts (server-only; every function takes the scope first, core §E.3)
export interface ProductQuery { status?: ProductStatus[]; collectionId?: string; stock?: "out" | "low" | "counted"; q?: string; sort?: "position" | "updated" | "name" | "price"; cursor?: string; limit?: number /* ≤ 100 */ }
export function listProducts(scope: StoreScope, q: ProductQuery): Promise<{ rows: ProductListRow[]; next: string | null; total: number }>;
export function getProduct(scope: StoreScope, id: string): Promise<ProductRow | null>;
export function getProductBySlug(scope: StoreScope, slug: string, opts?: { includeDraft?: boolean }): Promise<ProductRow | null>;
export function getProductsByIds(scope: StoreScope, ids: readonly string[]): Promise<ProductRow[]>;          // ≤ 200 ids
export function activeProductsForGrid(scope: StoreScope, src: GridSource, limit: number): Promise<ProductCardData[]>;   // STO-§9.4
/** @write */ export function createProduct(ctx: StoreCtx, input: ProductInput | { facts: ProductFacts }): Promise<ProductRow>;   // rev 4: the `facts` form is onboarding's (below)
/** @write */ export function saveProduct(ctx: StoreCtx, id: string, input: ProductInput, expectedRev: string): Promise<{ ok: true; row: ProductRow } | { ok: false; conflict: { rev: string; updatedBy: string | null; updatedAt: Date } }>;
/** @write */ export function setProductsStatus(ctx: StoreCtx, ids: readonly string[], status: ProductStatus): Promise<{ changed: number; refused: { id: string; reason: "quota" | "invalid" }[] }>;
/** @write */ export function duplicateProduct(ctx: StoreCtx, id: string): Promise<ProductRow>;                 // new id, key, rev, slug "<slug>-2", status draft
/** @write */ export function deleteProduct(ctx: StoreCtx, id: string): Promise<{ deleted: boolean; archived: boolean }>;  // hard delete only a draft no order or landing references; else archive
export interface ProductInput { doc: unknown; content: unknown; seo: unknown; stock: unknown; slug: string; tags?: string[]; primaryCollectionId?: string | null; collectionIds?: string[] }

// src/lib/catalog/collections.server.ts
export function listCollections(scope: StoreScope, opts?: { status?: CollectionStatus[] }): Promise<CollectionRow[]>;
export function getCollectionBySlug(scope: StoreScope, slug: string): Promise<CollectionRow | null>;
export function collectionPage(scope: StoreScope, c: CollectionRow, opts: { sort: SortKey; page: number; perPage: 12 | 24 | 36 }): Promise<{ cards: ProductCardData[]; total: number; pages: number }>;
/** @write */ export function saveCollection(ctx: StoreCtx, id: string | null, input: CollectionInput): Promise<CollectionRow>;
/** @write */ export function setCollectionProducts(ctx: StoreCtx, id: string, productIds: readonly string[]): Promise<void>;  // ≤ 500; positions = order given
/** @write */ export function archiveCollection(ctx: StoreCtx, id: string): Promise<void>;
```

**rev 4 (D71, ENGC-6): write capability is a type.** Every function marked `@write` in this document takes a `StoreCtx`
whose `scope` the seam narrowed to a **`WriteScope`** (`storeAction` / `storeGuard` for a member; `systemScope` for jobs),
and the repository statements inside take that `WriteScope` as their first parameter, so an impersonation or platform
scope cannot reach them at compile time (lint L6 by type, `test:permissions`); the `/** @write */` tags in the code
blocks of this part are documentation only (D71 removed the tag from lint). Read functions take `StoreScope` (= `ReadScope`).
Scope-taking writers of this part (`ensureTemplateSet`, `republishAttached`, the `src/lib/jobs/tracks/storefront.ts`
jobs, the `shipped` hook) type their parameter `WriteScope` and receive `systemScope(…)` or the action's narrowed scope.

**rev 4 (OPS-14, core §A.2 / §K.4, PLA Q3.8): the store-mode onboarding entry points**, frozen at the R2 contract step
(`src/lib/catalog/products.server.ts`, `src/lib/storefront/onboarding.server.ts`, S1):

```ts
export interface ProductFacts {                         // what onboarding's typed step collected (PLA-§22.2); the price is the owner's, never proposed
  name: string; priceCents: number; compareAtCents?: number; assetIds: string[] /* 1-12, assertOwned */;
  category: ProductCategory; locale: Locale; facts?: { text: string; ticked: true }[]; variants?: OptionGroupProposal[];
}
/** @write */ export function createProduct(ctx: StoreCtx, input: ProductInput | { facts: ProductFacts }): Promise<ProductRow>;   // facts → a one-item, one-offer doc through checkProductDoc; status draft; gauge charged
/** @write */ export function setThemeDraft(ctx: StoreCtx, direction: { key: string; genome: PageGenes }): Promise<{ themeDraftVersion: number; pdpFamily: PdpFamily }>;
```
`createProduct` with `facts` builds `{ product, items: [main], offers: [one bundle at priceCents] }` and runs the normal
save path (`checkProductDoc`, `assertOwned`, `deriveProduct`, the `products` gauge, audit `store.catalog.product_created`
with `{ via: "onboarding" }`); `setThemeDraft` hands the direction's genome to S2's store-theme writer as the store's
**draft** `store_themes` version (design owns the table; S1 calls `src/lib/design/store-theme.server.ts`, never writes
it) and records the drawn PDP family as the `@product` template draft's `productDetail` variant (`ensureTemplateSet`
creates the row first); nothing is published. Platform's `useDirectionAction` calls both and renders the three reveal
folds with `productAsPageDoc(product, { …sctx, direction })` (core §A.2 / §K.4 and PLA Q3.8 name them `createProduct(ctx, { facts })` /
`setThemeDraft(ctx, direction)`, both on the `WriteCtx`: a write needs the `StoreCtx` for the audit actor, STO-§29.5).

`saveProduct` order: `checkProductDoc` → content and SEO schemas → `assertOwned` → `deriveProduct` → one transaction
(`UPDATE products … WHERE id = ? AND store_id = ? AND rev = ?` compare-and-set; 0 rows → `conflict`; slug change →
`catalog_redirects` upsert; collection membership; `catalog_version` bump) → `syncAssetRefs(scope, "product", id, ids,
{ live: status === "active" })` (core §G.5) → audit (`store.catalog.product_updated`, plus `store.catalog.price_changed`
with the before/after `from` per offer when a price moved) → `invalidateStore` → `markHealthDirty(storeId)` (core §I.7)
→ `after()`: `onProductChanged(scope, id, change)` when `rev` or the story changed (STO-§4.3, §17.3), and **every**
attached live page (≤ 10, the STO-§17.1 cap; **rev 3, ENGP-16**: rev 2 did the first 5 and left pages 6-10 to the
job, which could lag a tick plus the edge TTL and leave a shopper with no path to order) republished or re-rendered at
once through the same handler inside `after()` (≤ 10 × ≈ 300 ms, bounded by the cap; their `render_jobs` rows then
finish `skipped`); a page whose immediate republish throws keeps its pending job row (the fallback) and is marked
"Out of sync" until the job succeeds.

Server actions (`src/app/app/[store]/catalog/**/actions.ts`, each body `return storeAction(…)`, core §E.2 and lint L9):

| Action | Permission | Rate bucket | Audit |
|---|---|---|---|
| `createProductAction`, `saveProductAction`, `duplicateProductAction` | `catalog.write` | `s:<sid>:catalog:write` 600/h | `store.catalog.product_created` / `_updated` (+ `store.catalog.price_changed` with before/after `from` per offer when a price moved) |
| `setProductsStatusAction` (bulk ≤ 100) | `catalog.write` | same | `store.catalog.product_status` (ids, status) |
| `deleteProductAction` | `catalog.write` | same | `store.catalog.product_deleted` or `_archived` |
| `saveCollectionAction`, `setCollectionProductsAction`, `archiveCollectionAction` | `catalog.write` | same | `store.catalog.collection_saved` / `_products` / `_archived` |
| `adjustInventoryAction` (≤ 200 rows) | `catalog.write` | `s:<sid>:inventory` 300/h | `store.inventory.adjusted` (row count; `inventory_moves` holds the detail) |

`createProduct` and `setProductsStatus(…, "active" | "draft")` from `archived` charge the `products` gauge first
(`chargeUsage(scope, { metric: "products", period: "total" }, 1)`, core §D.7); archiving and deleting refund it
(STO-D24; reconcile rule in request STO-R20). A refused charge answers `quota` and the shell opens the limit sheet
(core §I.4).

### STO-§4.6 Collections

- R2: **manual** collections (the owner picks and orders products, ≤ 500 members) with a default `sort` the shopper can
  change on the page; `productCount` counts active members and is maintained by `setCollectionProducts` and by product
  status changes.
- R3 (with ST-11): **automatic** collections, `rules = { kind: "auto", match: "all" | "any", conds: ({ f: "tag", op:
  "is", v } | { f: "price", op: "lte" | "gte", cents } | { f: "available", v: true } | { f: "created", op:
  "within_days", n })[] (≤ 6) }`, materialised into `collection_products` by the nightly job `catalog.collections` and
  on every product save (only the changed product is re-evaluated).
- An empty active collection renders its page with the empty state (STO-§13.1) and `noindex`; a draft or archived one
  answers the branded 404.
- Limits: 100 collections per store, 500 members per collection, 8 collections per product.

### STO-§4.7 Catalog from photos (SF-12, rf §1.10; R2, S1 with S7's tasks and S2's brand step)

The entry "À partir de photos" on `/app/<h>/catalog/products/new` turns a batch of photos into **product drafts**. The
owner types every price; the engine never proposes one.

```ts
// src/lib/catalog/from-photos.server.ts (S1)
export interface FromPhotosInput { assetIds: string[] /* 1-40, this store's assets (assertOwned) */; hints?: { category?: ProductCategory; locale?: Locale }; group?: "auto" | "one-per-photo" }
export interface ProductProposal {
  key: string;                                   // local id of the proposal
  photos: { assetId: string; box?: AssetRef["box"]; role: "main" | "detail" | "group" }[];   // crops from group photos through AssetRef.box (OFFERS §B.4)
  name: Record<Locale, string>;                  // drafts from the Worker, library fallback (AI-02 pattern)
  description: Record<Locale, string>;
  items: { id: string; name: string; groups: OptionGroupProposal[] }[];   // variants detected from photo differences; NO prices
  suggestedFacts: { text: string; from: "photo" | "name"; ticked: false }[];   // AI-04 honesty rule
  category: ProductCategory; confidence: "high" | "medium" | "low";
}
export function proposeProductsFromPhotos(ctx: StoreCtx, input: FromPhotosInput): Promise<{ ok: true; proposals: ProductProposal[] } | { ok: false; jobId: string }>;   // ≤ 6 photos: interactive (≤ 20 s); more: ai_jobs kind "catalog_from_photos" (pattern B)
/** @write */ export function createProductsFromProposals(ctx: StoreCtx, accepted: AcceptedProposal[]): Promise<{ drafts: string[]; needsReview: string[] }>;   // AcceptedProposal = proposal + typed prices + ticked facts
```

1. **Grouping**: the wizard's existing crop and group logic (`src/components/admin/items/crop-dialog.tsx`,
   `AssetRef.box`) splits group photos into items; SigLIP (local) or the server `analyze` task (≤ 2 images ≤ 1,024 px,
   AI-04) classifies each group; `group: "one-per-photo"` skips detection.
2. **Proposal**: names and descriptions as drafts (Worker `product.describe`, library when cloud is off), an option
   matrix proposed only from visible differences (colour swatches detected in the photos; sizes never guessed), facts
   as unticked chips. Every text passes the guard; no number survives that is not in a ticked fact.
3. **Review screen**: one card per proposal with the price field empty and required, the fact chips, the item list and
   a "merge with …" action; "Create {n} drafts" writes `products` rows with `status = 'draft'`, charges the `products`
   gauge per draft (refused with the limit sheet when over), audits `store.catalog.products_from_photos` (`{ count }`),
   then offers "Generate my store design" (the blueprint, STO-§11.5) when ≥ 3 drafts exist and no `@home` is published.
4. **SEO and alt** fill through AI-09 in Batches when ≥ 20 items (owner reviews in bulk); never overwriting a typed
   field.

Acceptance (`test:catalog` + `qa:storefront-e2e`): the 12-photo fixture (3 group photos + 9 singles of 8 products)
yields 8 ± 1 proposals; no `price` key exists in `ProductProposal` (type test) and no digit appears in a proposal name or
description unless a ticked fact carries it; with Cloud AI off the same fixture yields proposals in < 2 s from SigLIP +
rules; a batch of 30 photos answers `job_queued` and the job finishes with heartbeats ≤ 10 s apart; drafts of store A
never appear in store B's review screen (tenancy case).

---

## STO-§5 Inventory and stock (ST-01 counters, ST-15 holds, R-D48)

### STO-§5.1 Stock configuration per product

```ts
// src/lib/catalog/stock.ts (isomorphic, pure)
export type StockAxis =
  | { kind: "none" }                                  // not tracked: only the doc's own sold-out flags count
  | { kind: "item" }                                  // one level for the whole item
  | { kind: "matrix"; groupId: string }               // one level per combination of the item's matrix group
  | { kind: "choice"; groupId: string };              // one level per option of one choice group ("Couleur")
export const StockConfig = z.object({
  axes: z.record(ItemIdSchema, StockAxisSchema).default({}),   // item id → axis; missing = { kind: "none" }
  showLow: z.boolean().default(false),                          // shopper line "Plus que {n} en stock"
  lowAt: z.number().int().min(1).max(10).default(3),            // shopper line threshold (alerts use inventory_levels.low_at)
});
```
An item has at most one axis; the editor offers "Suivre le stock : aucun / l'article / chaque combinaison (Couleur ×
Taille) / chaque Couleur". Changing the axis keeps the old rows (reported as "orphan levels" in the inventory screen)
until the owner removes them.

### STO-§5.2 Stock keys

| Axis | Stock key | Example |
|---|---|---|
| `item` | `<itemId>` | `main` |
| `matrix` | `<itemId>~<cellKey(combo)>` with `cellKey` from `src/lib/page/options.ts:30` (canonical `dim=value\|dim=value`) | `main~color=noir\|size=m` |
| `choice` | `<itemId>~<groupId>=<optionId>` | `serum~g-color=rose` |
| any key longer than 64 chars | `<itemId>~#<base32(sha256(fullKey))[:20]>`; the inventory screen shows the labels from the doc | — |

`stockKeysOf(doc, stock)` lists every key the doc can produce (combos marked `none` in the matrix are skipped);
`stockKeyOfUnit(doc, stock, unit: OrderUnit)` maps an ordered unit to its key (or `null` when the item is not tracked).
The SKU stays the warehouse and ad identifier; it is never the stock key (two combinations may share a SKU).

### STO-§5.3 Effective availability

```ts
export interface InventoryLevelRow { stockKey: string; onHand: number | null; held: number }
/** A copy of the doc whose sold-out flags include counted stock: item.soldOut, choice.soldOut, matrix cells state "out". */
export function applyStock(doc: ProductDocJson, levels: readonly InventoryLevelRow[], stock: StockConfig): ProductDocJson;
export const isOut = (l: InventoryLevelRow | undefined): boolean => !!l && l.onHand !== null && l.onHand - l.held <= 0;
```
- Availability = the owner's manual flags **or** `isOut(level)`. A manual "in stock" never overrides a counted 0.
- Matrix: an out combination adds or overrides a cell `{ v: combo, state: "out" }`; a cell already `none` (not made)
  stays `none`.
- `applyStock` runs at render (PDP, cards, grids), in cart re-pricing and in order validation, so all three agree.
- The pure function is the only place availability is computed; `offerAvailable` and `itemAvailable` (OFFERS) then work
  unchanged on its output.

### STO-§5.4 Counts, moves and the shipped decrement (R2)

- Manual adjustments: the inventory screen sets `on_hand` (absolute) or adds a delta; each change writes one
  `inventory_moves` row (`manual` or `correction`) and updates the level in the same transaction.
- **Decrement at shipped**: the order-transition hook `src/lib/orders/hooks/storefront.ts` (core §K.3 extension point)
  handles `ship_state → shipped` for v3 orders and for orders of attached landings (product found through
  `pages.product_id`): units are grouped by stock key; per key `INSERT INTO inventory_moves (…, reason 'shipped',
  order_id)`; only when the insert succeeds (unique `im_order_uq`), `UPDATE inventory_levels SET on_hand = on_hand - ?
  WHERE store_id = ? AND product_id = ? AND stock_key = ? AND on_hand IS NOT NULL`. A replayed hook inserts nothing and
  changes nothing.
- **Crossing**: when an update moves a level from available to out (or back), the product gets a new `rev`,
  `catalog_version` is bumped and attached landings are re-rendered in place (STO-§17.3; rev 3: no `sync` version).
  Decrements that stay above 0 change only the count (no `rev`, no re-render) **unless the count is displayed**:
- **Displayed-count bump (rev 3, ENGP-4)**: for a product with `stock.showLow = true`, any `inventory_levels` write
  that changes the low-stock state a shopper can read bumps `catalog_version` (without a new `rev`): a crossing of
  `lowAt` in either direction, or any change of `on_hand − held` while `0 < available ≤ lowAt` (the number in "Plus
  que {n} en stock" moved). The pure predicate `lowStockDisplayChanged(before, after, stock)`
  (`src/lib/catalog/stock.ts`) is called by the inventory action, the `shipped` hook and the R3 hold / release paths;
  `test:storefront-db` asserts "every write that changes server HTML bumps" with a 3 → 2 → 0 fixture under `showLow`
  and a 30 → 29 fixture that bumps nothing. Products without `showLow` keep rev 2's rule (counts never bump).
- Returns: an owner action "Remettre en stock" on a returned order (operations' returns flow, OP-22 in R3; in R2 a
  button in the order drawer through operations.md) writes `returned_restock` moves with `+qty`.
- **Partial delivery (rev 4; core §K.4 S1 row, OPE OD51):** a `delivered` transition that carries a `line_outcome`
  event (`{ lines: { i, state: "delivered" | "refused" | "pending", qty }[] }`, indexes into `items.lines`) makes the
  same hook restock the **refused** units automatically (the courier brings them back with the parcel) as a
  `returned_restock` move per (order, stock key) whose `delta` is the **sum** of refused units over every `line_outcome`
  of the order (upsert on `im_order_uq`: the level moves by the difference, so a replay or a later child-shipment
  outcome never double-counts); `pending` lines stay decremented until their child shipment's own outcome. A whole-order
  `returned` keeps the owner's "Remettre en stock" action above (a returned parcel may be damaged). `test:storefront-db`:
  a 3-line order delivered with one refused line restocks that line once, twice-replayed.
- Negative counts are allowed (an order shipped from a miscount); the screen shows them in the danger colour with
  "Vérifiez le stock".
- Alerts: when `on_hand - held ≤ low_at` after a move, a `catalog.low_stock` notification (in-app, Telegram per the
  store's notification settings) at most once per key per day; `catalog.out_of_stock` on a crossing to out.

### STO-§5.5 What shoppers see

| Situation | PDP | Card | Cart / checkout |
|---|---|---|---|
| Option out of stock | struck, `aria-disabled`, "Épuisé" in its label | — | the line answers `unavailable` |
| Whole product out | buy box disabled, "Épuisé" + WhatsApp "Être prévenu(e)" (R3: notify-me lead) | sold-out badge, muted image | line `unavailable`, removed with a notice |
| Counted, `showLow` on, `0 < available ≤ lowAt` for the chosen variant | "Plus que {n} en stock" under the buy action (real number) | nothing | nothing |
| Not counted | no stock words at all | — | — |

Never: a stock number when the owner did not type counts, a "selling fast" line, a fake countdown, a number rounded
down to create urgency.

### STO-§5.6 Soft holds (R3, ST-15, R-D48; rev 3 OPS-30: held at confirmation by default)

- **When the hold is taken** = `checkout.store.reserveAt` (STO-§15.1, R3): **`"confirmed"` (default)** = in the
  order-transition hook (`src/lib/orders/hooks/storefront.ts`) when `confirm_state → confirmed`, inside the transition's
  transaction; `"order"` = at order creation (v3, and v2 orders of attached landings) inside the order transaction, for
  stores whose confirmation rate makes an early hold worth it (the setting's help text shows the store's own
  confirmed-rate over 30 days from `opsAggregates` and recommends `"order"` only above 85 %). With typical COD
  confirmation rates (40-60 % of orders end fake, cancelled or unreachable), holding at creation would let fakes hold
  the stock for up to 7 days while a real buyer reads "Épuisé".
- **The creation-time check stays in both modes**: `priceLine` runs `applyStock` with `isOut(level)` on
  `on_hand − held`, so a variant that is already out (or fully held) is refused at order time with the line verdict
  `unavailable` whatever `reserveAt` says. In `"confirmed"` mode a window exists between order and confirmation in which
  two orders may both pass the check; the second **confirmation** then fails the hold (below).
- **Taking the hold**, per counted stock key: `UPDATE inventory_levels SET held = held + ? WHERE store_id = ? AND
  product_id = ? AND stock_key = ? AND (on_hand IS NULL OR on_hand - held >= ?)`; affected rows 0 →
  - `reserveAt = "order"`: that line is `unavailable` and the order is refused with the line verdict (no partial order);
  - `reserveAt = "confirmed"`: the transition still commits (a human just confirmed with the customer), the order gets
    the flag `stock_short` with the short lines in `order_events` (`stock_short`, `{ stockKey, wanted, available }`),
    the agent's outcome sheet shows "Stock insuffisant pour {variant} : {available} disponible(s)" with the actions
    "Proposer une alternative" (edit lines, STO-§16.9) and "Confirmer quand même" (manager+, `orders.force_status`,
    audited); `catalog.out_of_stock` notifies the owner.
  Then `INSERT stock_holds (state 'held', expires_at = now + 7 days [proposal])` and a `hold` move. Atomic without
  `SKIP LOCKED` (conditional update, the pattern of core §D.7).
- Release (`held -= qty`, state `released`, `release` move) on `confirm_state → cancelled | fake | duplicate |
  unreachable` and on `ship_state → refused | returned` before shipping consumed the hold, and by the job
  `stock.holds_expire` (every tick, per store, ≤ 500 rows) for holds past `expires_at` whose order is not shipped. An
  order that never reached `confirmed` in `"confirmed"` mode holds nothing and releases nothing (no-op).
- `shipped` consumes the hold: `on_hand -= qty`, `held -= qty`, state `decremented` (one transaction with the
  `shipped` move).
- Nightly `catalog.stock_reconcile` recomputes `held` from `stock_holds` (state `held`) and logs any drift in
  `job_runs.summary`.

---

## STO-§6 Page kinds and the store page document (ST-02)

### STO-§6.1 Kind rules

`KIND_RULES` (`src/storefront/kinds.ts`, isomorphic) is the single table the schema, the editor, the checklist and the
renderer read.

| Kind | Required (singletons) | Store sections allowed | Landing sections allowed (STO-§9.1) | Register | Robots | Store chunks (STO-§14) |
|---|---|---|---|---|---|---|
| `home` | — (≥ 2 sections) | storeHero, collectionTiles, productGrid, trustStrip, mediaText, richText, whatsappCta | product-free set + bound set (with `bind`) | marketing | index | `store` (+ `store-pixels`) |
| `product` | productDetail, productContent | productGrid (source `related`, `manual`, `bestsellers`), trustStrip, mediaText, richText, whatsappCta | product set (implicit product context) | commerce | index unless the product's `seo.noindex` | `pdp` (+ `cart` or `checkout` by buy model, `store-pixels`, feature chunks) |
| `collection` | collectionHeader, collectionProducts | productGrid, trustStrip, mediaText, richText, whatsappCta | product-free set | commerce | index (empty collection: noindex) | `store` |
| `page` | — (≥ 1 section) | storeHero, collectionTiles, productGrid, trustStrip, mediaText, richText, whatsappCta | product-free set + bound set | marketing | per page `seo.noindex` | `store` |
| `search` | searchResults | productGrid (bestsellers, newest), whatsappCta | — | commerce | noindex | `store` |
| `cart` | cartView | productGrid (bestsellers, newest, manual), trustStrip | — | commerce | noindex | `store`, `cart` |
| `checkout` | checkoutForm | trustStrip | — | commerce | noindex | `checkout` (no `store`: the checkout header is minimal) |
| `not_found` | notFoundBlock | productGrid (bestsellers, newest), whatsappCta | — | commerce | noindex | `store` |

Extra rules (`storeDocIssues`): section ids unique; at most 40 sections (`product`: 12 outside productContent); a
singleton type appears once; `productDetail` is the first section of `product`; `checkoutForm` is the first section of
`checkout`; a `bind.productId` must belong to the store (checked at save and publish with `assertOwned(scope,
"product", ids)`); at most one section with a bento variant per page (design budget DES-§3, R-D38).

**Per-kind budgets (rev 2, STO-D36; DB C3, F5, R1, R4, R5, I1):** soft items lower Q and appear as notes; hard items
refuse publish through the core gate (`budget:*` ids, core §M.2, with the store-kind thresholds below passed by
`src/lib/render/prepublish/storefront.ts` as a `BudgetProfile`; second-round request STO-R25).

| Kind | In-flow sections (soft / hard) | Estimated height at 390 (soft / hard) | Primary CTAs | Glass | Reveal nodes | Same photo | HTML gz |
|---|---|---|---|---|---|---|---|
| `home`, `page` | 5-10 / 12 | ≤ 9,000 / 12,000 px | ≤ 6 (sticky none) | ≤ 2 / 4 | ≤ 40 / 80 | ≤ 3 / 4 | ≤ 60 KB / 140 KB |
| `product` (template + product content, rendered with the store's gate sample product, STO-§6.3 rev 3) | 8-14 / 16 | ≤ 12,000 / 15,000 px | ≤ 3 (sticky bar = 1) / 4, ≤ 2 visible at once | 0 / 0 | 0 / 0 (CSS-only motion) | gallery = 1 appearance, then ≤ 2 / 3 | ≤ 90 KB / 140 KB |
| `collection` | header + grid + ≤ 3 / 4 | 24 cards per page; ≤ 9,000 / 12,000 px with 24 cards | ≤ 2 | 0 | 0 | — | ≤ 60 KB / 140 KB |
| `search`, `not_found` | ≤ 4 | ≤ 6,000 px | ≤ 2 | 0 | 0 | — | ≤ 45 KB |
| `cart`, `checkout` | single column, no choreography | ≤ 4,000 px default state | 1 (+ WhatsApp alternative) | 0 | 0 | — | ≤ 45 KB |

The height comes from the design height model (DES-§5.3) with store sections' `features.h` values (STO-§9.2:
`storeHero` 1.0, `collectionTiles` 0.9, `productGrid` 1.2 per 8 cards, `productDetail` 1.9 (`inline` model) / 1.4
(`cart` model), `productContent` = Σ of its landing sections, `trustStrip` 0.15, `mediaText` 1.0, `richText` 0.6,
`whatsappCta` 0.4, `collectionHeader` 0.5 (`banner` 0.9), `collectionProducts` 1.2 per 8 cards, `searchResults` as the
grid, `cartView` 1.2, `checkoutForm` 1.8, `notFoundBlock` 0.6), calibrated against the R2 render set the same way DG-09
calibrates landing pages (ratio 0.8-1.25 on ≥ 90 % of fixtures).

**rev 3 (ENGP-6): the estimate's error band is part of the gate.** The height and fold columns are **estimates** whose
accepted error is 0.8-1.25 (DES-§5.3) and 0.9-1.1 for the fold (DES-§5.12); a hard refusal driven by an estimate must
therefore refuse only when the estimate is wrong-side **even at the edge of its band**: `budget:C3` refuses when
`total × 0.8 > hard` (15,000 px → refused above 18,750 px estimated, noted between), `budget:C2` refuses when a
`mustShow` item's estimated **top** × 0.9 > 844 (**rev 4, core §M.2 three zones:** top ≤ 760 px = target, 760-938 px =
note, > 938 px = refused; rev 3 wrote "above 937, noted 844-937"). Inside the band the item is a soft note with
`vars.estimated = 1` and a message that says "estimated" ("hauteur estimée 16 200 px à 390 · limite 15 000 · vérifiez
sur un téléphone"). Section counts, bytes, CTAs, glass, reveals and photo reuse are exact and stay hard at
their value. The server decides from the model alone; Playwright (`qa:storefront-e2e`, `qa:publish-gates`) is the
**calibration** that keeps the band honest and fails the R2 exit, never a publish. The band constants live next to the
thresholds in the core's `budget-limits.ts` (`HEIGHT_BAND = 0.8`, `FOLD_BAND = 0.9`, STO-R34 accepted), so one message
set covers landing and store kinds; `test:prepublish` reads its height fixtures from the committed
`src/lib/design/calibration/heights.json` (P6), never from the git-ignored `qa/saas-baseline/index.json`.

### STO-§6.2 `StorePageDoc` v1

```ts
// src/storefront/schema.ts (isomorphic, pure). PageDoc v2 is not touched.
export const STORE_PAGE_KINDS = ["home", "product", "collection", "page", "search", "cart", "checkout", "not_found"] as const;
export type StorePageKind = (typeof STORE_PAGE_KINDS)[number];
const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const StoreSectionInstance = SectionInstance.extend({
  /** product context for a landing section on a product-free kind (home, page): the product it talks about */
  bind: z.object({ productId: Ulid }).strict().optional(),
});
export type StoreSectionInstance = z.infer<typeof StoreSectionInstance>;

export const StorePageSeo = z.object({
  title: z.string().max(70).optional(), description: z.string().max(170).optional(),
  ogImage: AssetRef.optional(), noindex: z.boolean().default(false),
});

const StorePageDocBase = z.object({
  v: z.literal(1),
  kind: z.enum(STORE_PAGE_KINDS),
  locale: Locale,                                   // = stores.default_locale in R2 (siblings in R3, STO-§19.7)
  title: z.string().max(120).default(""),           // custom pages: the H1 and admin name; templates: unused
  sections: z.array(StoreSectionInstance).max(40),
  seo: StorePageSeo.default(() => ({ noindex: false })),   // home and custom pages; product/collection SEO comes from their rows
});
export const StorePageDoc = StorePageDocBase.superRefine(storeDocIssues);
export type StorePageDoc = z.infer<typeof StorePageDocBase>;

/** Discriminated read of `pages.draft` / `page_versions.doc` (request STO-R2). */
export type AnyPageDoc = { kind: "landing"; doc: PageDoc } | { kind: StorePageKind; doc: StorePageDoc };
export function readPageDoc(kind: string, raw: unknown): AnyPageDoc | null;
```
Section `data` is validated by the section's own schema (store registry or landing registry) inside `storeDocIssues`.
The doc carries no theme: store pages use the store theme (STO-§8.4).

### STO-§6.3 Template set lifecycle

```ts
// src/lib/storefront/templates.server.ts
export const TEMPLATE_KINDS = ["home", "product", "collection", "search", "cart", "checkout", "not_found"] as const;
export const UTILITY_KINDS = ["product", "collection", "search", "cart", "checkout", "not_found"] as const;
/** Creates the missing template rows (drafts from defaults) and publishes the missing utility kinds (STO-D2). Idempotent. */
export function ensureTemplateSet(scope: WriteScope, opts?: { actor?: Actor }): Promise<{ created: StorePageKind[]; published: StorePageKind[] }>;   // core §A.2 calls it with systemScope(ctx, storeId) (a WriteScope, kind "system"; rev 4, D71: rev 3 typed it StoreScope); R1 ships a typed no-op stub
export function defaultTemplate(kind: StorePageKind, shape: CatalogShape, store: StoreRow): StorePageDoc;   // pure; home uses STO-§11
export function getLiveTemplate(scope: StoreScope, kind: StorePageKind): Promise<{ pageId: string; versionId: string; publicKey: string; doc: StorePageDoc } | null>;
/** @write */ export function saveStorePage(ctx: StoreCtx, pageId: string, doc: unknown, expectedVersionId: string | null): Promise<SavePageResult>;
/** @write */ export function publishStorePage(ctx: StoreCtx, pageId: string): Promise<PublishStorePageResult>;   // checklist gate, then version kind "publish"
```
- Runs under `withNamedLock(storeLock(storeId, "templates"), 5, …)` (core §E.7).
- Called (a) after a mode change to `store` or `both` and on the `pending → active` transition of such a store
  (STO-R17 accepted: core §A.2, §A.5.1 call `ensureTemplateSet(systemScope(ctx, storeId))`), (b) lazily on the first
  open of `/app/<h>/storefront`, (c) by the store blueprint apply (STO-§11.5).
- Auto-publish of utility kinds is refused in states without `publish` (pending, restricted…; core §A.5.2): the rows
  stay drafts and publish themselves on approval (the approval transition calls `ensureTemplateSet`, request STO-R17).
- Template versions use `page_versions` (`save`, `autosave`, `publish`, `restore`); history, restore and starred
  versions work like landing pages (the history screen shows the kind label). `versions_kept_per_page` applies.
- Publish = new `publish` version + `pages.published_version_id` + `pages.status = 'published'` + `catalog_version`
  bump, in one transaction. Unpublishing a utility template is impossible (it would break the store); the editor shows
  "Restore the default" instead.
- `publishStorePage` gate (rev 2, STO-D35): `storefront.write`, entitlement `publish` (state cap), kill switch
  `publishing_enabled`, `s:<sid>:publish` 60/h (core §E.8); then the template is **rendered** (home and collection
  with the store's real data, `product` with the store's **gate sample product** (below), `checkout` with a 20-line
  cart fixture) and `runPrePublishChecks(ctx)` (core §M.1) runs with `doc: StorePageDoc`: `budget` (STO-§6.1 profile),
  `honesty` (landing's gate on the eligible landing sections, STO-D37), `design` (`runGates` with `register` set,
  DES-§8.1, §11.1) and the storefront check file (STO-§23.6). A refusal returns `{ ok: false, error: "budget_blocked" |
  "honesty_blocked" | "design_blocked", items }` to the publish dialog, one row per item with its fix; the builder's
  checklist panel shows the same items live, so the dialog is never the first time an item appears (core §M.5).
  Listeners after the commit: design (`published` genome row **for `home` and `page` only**, rev 3), storefront
  (`markHealthDirty`, `catalog_version` bump already in the transaction), ai (`recordPublishFeedback`, R2).
- **Gate sample product (rev 3, ENGP-17).** Rev 2 named two proxies ("heaviest product by rendered bytes" here, "the
  longest active product name and the tallest offer picker" in STO-§12.8); rendering every product to find the heaviest
  is seconds to minutes inside a `storeAction`. One deterministic rule, stated here and referenced everywhere:
  `gateSampleProduct(scope)` = the active product that maximises `LENGTH(doc) + LENGTH(content)` (one query over the
  store's ≤ 2,000 rows, ties by `updated_at` desc); the template is rendered **once** with it for every byte, count and
  section gate. The fold estimate (`budget:C2`) needs no render: the height model runs with the store's **longest active
  product name** in its locale (`MAX(CHAR_LENGTH(name))`) and its **tallest offer-picker shape** (`display` kind and
  offer count over active products, STO-§12.8), so a template that passes the gate passes for every product.
- **The `StorePageDoc` branch of the registry (rev 3, ENGP-1).** `src/lib/render/prepublish/storefront.ts` builds the
  design input through design's kind-aware adapter `gateInputFor(doc: PageDoc | StorePageDoc, ctx: PrePublishCtx):
  GateInput` (DES-§8.1 rev 3, requested STO-R29): `theme` = `getStoreTheme(scope, register)`, `genome` =
  `genomeOf(doc)` widened to the union (for `home` / `page` the compiled page genome; for utility kinds the brand's
  house genes with `grammar` from the family), `assets` = the template's and the sample product's photos, `facts` from
  the sample or bound product, `origin` from the doc's section data, `heights` = `estimateHeights(doc, …)` widened to
  the union with the store registry's `features` (STO-§9.2). `landingGateItems` (honesty) on a `StorePageDoc` checks
  the **eligible landing sections only**, with facts from the bound product (landing's side of STO-R29). **Utility
  kinds** (`product`, `collection`, `search`, `cart`, `checkout`, `not_found`) run the structural, owner-rule
  (no orange, contrast, RTL, type), register, budget and honesty gates only; they are **never pooled nor
  novelty-checked** (`runGates` receives `novelty: null` and skips N1 / N2 / N8; no `design_genomes` row; no
  `syncShingles`), so `defaultTemplate()` producing byte-identical `@product` / `@cart` / `@checkout` / `@search` /
  `@not_found` docs for every store is correct, not a clone. Only `home` and `page` enter the pool. **rev 4:** which
  gate runs for which kind is design's table `KIND_GATES` (`src/lib/design/gate-input.ts`, DES-§8.13; core §M.1 rule 2),
  read by `prepublish/storefront.ts` and never copied into it, so a new design gate lands on store kinds without an S1
  edit. `test:prepublish`
  gains one fixture per store kind (`src/lib/render/prepublish/storefront.fixtures.ts`, S1) run in `block` mode.
- Auto-published utility templates (STO-D2) pass the same checks with their defaults; a default that fails a hard gate
  is a bug caught by `test:catalog` (every `defaultTemplate(kind, shape)` × 3 shapes × ar/fr passes `runPrePublishChecks`
  in `block` mode).

### STO-§6.4 Custom pages (`page` kind)

- Created from the Storefront screen ("Nouvelle page": blank, About, FAQ, Contact-style, Size guide hub), slug rules of
  landing pages (`SLUG_RE`, unique per store, not reserved), count toward `pages_max`.
- Served at `/<slug>` by the same route as landing pages: the route reads `pages.kind` and either serves the stored
  landing HTML (today's path) or renders the custom page on request.
- In menus as `{ kind: "page", pageId }`; in the sitemap unless `seo.noindex`.

### STO-§6.5 Policy pages inside the store chrome

`/policies/<kind>` (`privacy`, `terms`, `shipping`, `returns`, `contact`; core §C.4.1) keeps `LegalBody` and the store
policy facts (landing.md `policies` setting, D39 templates flagged `needs_legal_review`). In `store` / `both` mode the
route wraps it in `StoreDocument` (chrome, store theme, commerce register); in `landing` mode it renders as in R1. The
contact policy page adds the store's WhatsApp, phone and e-mail from the `store` setting (the channels listed in
`policies.contact.channels`), each shown only when set, and **the hours from `ops.callingWindow`** (rev 4, core D73:
`policies.contact.hours` no longer exists): the weekly ranges through `rangesForDay` for the seven days of the current
store-local week, today's line through `hoursText(window, locale, dateLocale, now)`; the page is day-dependent, so its
cache key carries the store-local day (STO-§7.4). No map, no form. **rev 4 (CRIT15, LAN-§3.9):** inside
`StoreDocument` the "Signaler cette boutique" link is the store footer's (STO-§10.3); `LegalBody`'s own footer-row link
(landing's legal-page row of LAN-§3.9) is not rendered in the store chrome, so the document carries exactly one.

### STO-§6.6 Branded 404

- `not_found` template rendered with status **404**, `noindex`, `Cache-Control: public, max-age=0, s-maxage=60`, for:
  `/p/<unknown>`, `/c/<unknown>`, an unknown single segment `/<x>`, and deeper unknown paths under `[slug]`
  (`src/app/s/[store]/[slug]/[...rest]/route.ts`), in a servable store whose mode allows the storefront.
- Content: a short line, the search box (STO-§13.3), a real grid (bestsellers when STO-D22 allows, else newest), the
  WhatsApp block when a number is set.
- Everything else keeps the platform's neutral 404 (unknown handle, non-servable state, wrong host), byte-identical
  across producers (core §F.6, PUB-23).

### STO-§6.7 Home resolution

| Mode | `stores.home_page_id` | `/` serves |
|---|---|---|
| `landing` | landing page id | that landing page (R1 behaviour) |
| `landing` | NULL | the store's branded "no page yet" (core §A.2) |
| `store` / `both` | the `@home` page, published | the store home, on request |
| `both` | a landing page id | that landing page (the owner chose a campaign as home) |
| `store` / `both` | NULL or an unpublished `@home` | the branded "no page yet" with the store chrome and a link to `/c/<first collection>` when one exists |

When the owner first publishes `@home` and `home_page_id` is NULL or a landing page, the publish dialog asks "Use the
store home as your home page?" (default yes for `store`, no for `both` with a live landing home).

**rev 3 (OPS-14): the first product in `store` mode.** Onboarding (PLA-§22.2) reveals a landing page for the first
product in every mode, but `store` mode hides landing pages (`landing.inStoreMode = false`) and would serve the
published page as the store's 404. The storefront offers the synchronous surface the reveal needs: the moment a product
draft exists, `/app/<h>/preview/<@product pageId>?product=<id>` renders the PDP from `productAsPageDoc` (no job, no
model, STO-§7.7), and `ensureTemplateSet` has created the `@product` template (STO-§6.3 (a)). So in `store` mode the
reveal shows the **PDP** of the first product (three PDP families as the three directions when the brand genome allows,
else the one family with three home candidates behind it), and the home draft from the blueprint arrives later. If
platform keeps the landing reveal in `store` mode, onboarding must set `landing.inStoreMode = true` for that store and
say so on the `done` step (platform's and landing's side, STO-R36); either way a `store`-mode store never ends with a
saved page it cannot find in the nav.

**rev 4 (core §A.2 rev 3, PLA PD60 rev 3, PLA Q3.8): decided.** Onboarding in `store` mode **creates no landing page**:
`useDirectionAction` (P2) calls this part's `createProduct(ctx, { facts })` and `setThemeDraft(ctx, direction)`
(STO-§4.5, frozen at the R2 contract step) and renders **three PDP folds**, one per direction, synchronously through
`productAsPageDoc(product, { …sctx, direction })` (STO-§4.1) with `renderStorePage(…, { mode: "preview" })`: each fold uses
the PDP family its direction's G2 draws from the STO-§12.8 pool (skipping families outside the fold zones for the
product's name, STO-§12.8) and the direction's commerce-register theme, so the three differ in family, pairing and
colour while the priced buy box is identical. The fold is the real PDP fold at 100 % (P2's reveal layout of UX-20). The
chosen direction becomes the store's draft theme and the `@product` draft's family; `landing.inStoreMode` stays
`false`; `onboarding.firstKind = "product"`. The `inStoreMode = true` write is only the fallback should another path
create a landing page in a `store`-mode shop (core §A.2). Acceptance (UX-01 list, shared with platform): a `store`-mode
onboarding leaves 0 `pages` rows of kind `landing` and 1 draft product; its three reveal folds have three distinct
(`productDetail` family, G4 pairing) pairs on the argan fixture; every reveal fold passes `budget:C2`.

---

## STO-§7 Routes and on-request rendering (ST-07, R-D42)

### STO-§7.1 Route table (`src/app/s/[store]/…`, P mode; S/C hosts reach the same files through the proxy rewrite, core §C.3)

| Path | File | Kind / answer | `Cache-Control` | Robots | Rel. |
|---|---|---|---|---|---|
| `/` | `route.ts` (R1 file; S1 adds the store branch, STO-§6.7) | home | `public, max-age=0, s-maxage=60, stale-while-revalidate=300` | index | R2 |
| `/<slug>` | `[slug]/route.ts` (R1 file; S1 adds `page`) | landing (stored HTML) or `page` | landing: unchanged; page: as home | per page | R2 |
| `/<slug>/<a>/<b>` | `[slug]/[...rest]/route.ts` | branded 404 | as home | noindex | R2 |
| `/p/<slug>` | `p/[slug]/route.ts` | product | as home | index (product `seo.noindex` → noindex) | R2 |
| `/products/<slug>` | `products/[slug]/route.ts` | 308 → `/p/<slug>` (query kept) | `public, max-age=300` | — | R2 |
| `/c/<slug>` | `c/[slug]/route.ts` | collection (`?page=`, `?sort=`) | as home | index; empty: noindex | R2 |
| `/collections/<slug>` | `collections/[slug]/route.ts` | 308 → `/c/<slug>` | `public, max-age=300` | — | R2 |
| `/search` | `search/route.ts` | search (`?q=` ≤ 80 chars) | as home (keyed by the folded query) | noindex | R2 |
| `/cart` | `cart/route.ts` | cart (contents filled client-side) | as home | noindex | R2 |
| `/checkout` | `checkout/route.ts` | checkout (`?b=1` = buy now: the line travels in `sessionStorage`, never in the URL; `b` is not part of the cache key) | as home | noindex | R2 |
| `/checkout/merci` | `checkout/merci/route.ts` | store thank-you (STO-D16) | `private, no-store` | noindex | R2 |
| `/policies/<kind>` | R1 route (S1 adds the chrome, STO-§6.5) | policy | as home | index | R2 |
| `/track` | landing.md route (S1 adds the chrome, request STO-R18) | tracking (LP-05) | `private, no-store` | noindex | R2 |
| `/robots.txt`, `/sitemap.xml` | R1 routes (S1 adds products and collections, STO-§20.5) | files | `public, max-age=0, s-maxage=300` | — | R2 |

Every store route exports `GET` and `HEAD` only (other methods: the `unknownMethod` neutral 404, core §C.4); query
strings other than the whitelisted ones (`page`, `sort`, `q`, R3 `f`, `lang` never) are ignored for rendering and for
the cache key, so `utm_*`, `fbclid` and `ttclid` traffic hits the cache.

### STO-§7.2 Request flow

```ts
// src/lib/storefront/serve.server.ts
export interface StoreRoute {
  kind: StorePageKind | "thanks" | "policy" | "track"; slug?: string;
  query: { page?: number; sort?: SortKey; q?: string; xv?: string /* R3 URL arm, LAN-§18.5 */ };
  test: string | null;                                    // the `sg-test` token when present (STO-D33)
  status?: 200 | 404;
}
export function serveStorePage(req: Request, handle: string, route: StoreRoute): Promise<Response>;
```
1. `await connection()`; `store = resolveStoreByHandle(handle)` (core §E.5); missing → neutral 404.
2. Canonical check (core §C.8): non-canonical host, renamed handle or uppercase slug → 308 with the raw query.
3. State gate (STO-D28) and mode gate (`modeAllows(store.mode, "storefront")`); failing → neutral 404 (or 410 after a
   purge, core §A.5.3).
4. **Test render** (rev 2, STO-D33): `resolveTestToken(store, route.test).test` → `renderStorePage(scope, store, route,
   { mode: "test" })` on request (no pixel chunk, `banner: "test"`, `noindex`, `Cache-Control: private, no-store`),
   bucket `s:<sid>:test-render` 60/h (core §E.8); an invalid, expired or over-limit token is an ordinary visit. Never
   cached, never 304.
5. `scope = publicScope(store)`; `cacheKey = storeCacheKey(store, route, storeWindowId(settings, now, store.timezone))` (STO-§7.4,
   the `storefront` setting comes from the settings cache); `etag = storeEtag(cacheKey)`.
6. `If-None-Match` matches `representationTag(etag, coding)` for the negotiated coding (`negotiateEncoding`,
   `src/lib/render/compress.ts`; **rev 3, ENGP-22**: one tag per representation, `"s1-…"` / `W/"s1-…-br"` /
   `W/"s1-…-gz"`, never one tag for every coding) → **304** with the document headers, no render, no DB beyond the
   cached store row.
7. Cache hit → `storeDocumentResponse` = `documentResponse(req, { html, csp, etag }, { kind, cacheControl, noindex })`
   (`src/lib/render/serve.server.ts:162`): the compressed bytes come from the existing content-addressed
   `encodeCached(etag, html, coding)` (fast tier at once, best tier swapped in by the serial worker), so the render cache
   holds the HTML once and the encoded cache holds each coding once (rev 3).
8. Miss → `renderCache.getOrLoad(storeId, cacheKey, () => renderStorePage(scope, store, route))` (core §E.6 single
   flight; a rejected render is evicted at once), respond.
9. A render that throws → the neutral "temporarily unavailable" 503 (`unavailableResponse`,
   `src/lib/render/serve.server.ts:231`) + `recordError("storefront", err, { storeId, route })`; nothing cached.

### STO-§7.3 Render pipeline

```ts
// src/lib/storefront/render.server.ts
export interface RenderedStorePage { html: string; csp: string; etag: string; status: 200 | 404; bytes: number; noindex: boolean }
export function renderStorePage(scope: StoreScope, store: StoreRow, route: StoreRoute, opts?: { mode?: "live" | "preview" | "test"; draft?: StorePageDoc; productDraft?: ProductRow }): Promise<RenderedStorePage>;
```
1. Template: `getLiveTemplate(scope, kind)` (cached per version id in `scopedCache("store-templates")`, 512 entries,
   15 min) or the draft in preview.
2. Data for the kind (≤ 4 queries on a miss): PDP = product row by slug + its `inventory_levels` + related cards;
   collection = collection row + one page of cards; search = results (STO-§13.3); home/page = the cards of every grid
   section in one `IN (…)` query; cart/checkout = nothing (client-filled).
3. Chrome: `storefront` setting + menus resolved to URLs (`resolveLinks`, cached per `catalog_version`); delivery
   summary from the zones (landing.md `zonesForCheckout(scope)`, request STO-R19); policy facts.
4. Theme: `getStoreTheme(scope, register)` (design S2, request STO-R19) → `BuiltTheme`.
5. `StoreRenderContext` (STO-§8.1); React server render of `StoreDocument` with the dynamic `react-dom/server` import
   pattern of `src/lib/render/core.ts:1-30`.
6. Inline CSS = theme tokens + store base CSS + the CSS chunks of the variants used (landing `variantChunksIn`
   mechanism, `src/landing/document.tsx:113`); inline scripts = the chunks of STO-§14.1 for this kind; configs
   `#sg-config` (and `#lp-config` on the PDP) via `inlineJson` (`src/lib/render/config.ts:333`).
7. CSP: `buildLandingCsp({ mode: "live", scriptHashes, styleHashes, pixels, turnstile })` from `inlineHashes(html)`
   (`src/lib/render/core.ts:135`); per-host CSP narrowing as core §C.9.
8. Size check (rev 2, core D52): a document > 90 KB gzip is served and noted (`recordError("storefront", "page_soft")`,
   once per template version per day); a document > **140 KB** gzip is still served (a live store never breaks on a
   data change) but the template is flagged `over_budget` in Store Health (`sf:page_over_budget`) until the next
   publish, which the gate refuses above the cap (STO-§6.3; the publish gate renders with the gate sample product and
   the fullest grids).
9. Test and preview modes (`opts.mode`): `test` embeds no pixel chunk, sets `addons.banner = "test"` and `noindex`;
   `preview` sends no beacon, loads no pixel and the checkout block says it does not send (STO-§7.7).
10. Budget: p95 ≤ 120 ms server time for a cold PDP render on the Hostinger plan [proposal, measured in the R2 load
    test]; a warm hit ≤ 5 ms; a 304 ≤ 2 ms with no DB query.

### STO-§7.4 Cache key, ETag, single flight

```ts
// src/lib/storefront/cache.server.ts
/** core §E.6 key + window id; `path` = kind + slug + whitelisted query in a fixed order ("p:argan-oil", "c:soins?page=2&sort=price_asc", "s:<folded q>") */
export function storeCacheKey(store: StoreRow, route: StoreRoute, windowId: number): string;   // `${id}:${path}:${locale}:${catalogVersion}:${addressVersion}:w${windowId}`
/** rev 4: `localDayNumber(now, store.timezone) * 16 + boundaries`, where `boundaries` = the number of announcement start/end
 *  instants (storefront setting, cached; ≤ 3 messages × 2 = 6) at or before `now`. It changes exactly when the rendered
 *  chrome must change: at an announcement boundary, and at each store-local midnight, because the footer's and the
 *  contact page's "today" hours line (`hoursText`, STO-D45) is day-dependent server text (rev 3 counted announcement
 *  instants only). The `{when}` of the call promise is never server text (the browser computes it), so the key needs no
 *  finer clock. Cost: one extra miss per cached page per store per day. */
export function storeWindowId(settings: StorefrontSettings, now: Date, timezone: string): number;
export function storeEtag(cacheKey: string): string;                         // `"s1-" + sha256(cacheKey + BUILD_ID).slice(0, 20) + '"'`
// single flight = the core's `ScopedCache.getOrLoad` on `scopedCache("render")` (STO-R24 accepted, core §E.6): no inflight map, no lint entry
```
- Entries live in the core's byte-bounded `scopedCache("render")` (32 MB shared with landing pages); a value =
  `{ html, csp, etag, status, noindex }`, size = `html.length + csp.length`. **rev 3 (ENGP-22):** no `br` / `gz` bytes in
  the render cache (rev 2 duplicated `encodeCached`); the compressed representations live in the existing
  `__codEncodedCache` (`src/lib/render/compress.ts`: content-addressed by the identity sha = `storeEtag`, 24 MB / 512
  entries, two tiers), so the two bounds of this process are **32 MB of HTML + CSP and 24 MB of encoded bytes**,
  shared with landing documents. `storeEtag(cacheKey)` is passed to `documentResponse` as the identity sha, so the
  existing validator scheme (`representationTag`, `etagMatches`, weak comparison) applies unchanged and a cache that
  holds the gzip bytes never gets a 304 for a brotli tag.
- `BUILD_ID` (`.next/BUILD_ID`, read once at boot) is in the ETag so an edge cache or a browser never keeps HTML that
  embeds the previous build's runtime.
- The ETag is computed **before** rendering, from data already in memory (the cached store row), so a revalidating
  shopper or the edge costs one cached lookup.
- `Vary: Accept-Encoding` only. No `Vary: Cookie` (store hosts have no cookies, core §C.9) and no `Vary:
  Accept-Language` (STO-D26).

### STO-§7.5 What bumps `stores.catalog_version`

| Write | Owner | Bump |
|---|---|---|
| product create, save, status change, delete, duplicate | S1 | yes |
| inventory crossing (available ⇄ out) | S1 | yes (count-only changes: no, **except** the next row) |
| inventory write that changes a **displayed** low-stock state (rev 3, ENGP-4): product with `stock.showLow`, `lowAt` crossed in either direction, or `on_hand − held` changed while `0 < available ≤ lowAt` (`lowStockDisplayChanged`, STO-§5.4) | S1 (inventory action, `shipped` hook, R3 holds) | yes (no new `rev`) |
| `catalog.bestsellers` nightly job (rev 3, ENGP-4) | S1 (`src/lib/jobs/tracks/storefront.ts`) | yes, **once per store** when the recomputation changed any product's `sold_30d ≥ 3` label or the `bestsellers` ordering of its active products (compared before / after in the job); no bump when nothing a page shows moved |
| collection save, membership, archive | S1 | yes |
| store template publish or restore-and-publish | S1 | yes |
| `storefront` or `checkout` setting write | S1 / landing.md | yes |
| delivery zone write | landing.md | yes (STO-R19 accepted, core §K.4 contract step) |
| store theme / brand change | design S2 | yes (STO-R19 accepted) |
| `store` setting (name, contacts, legal facts) and `policies` facts | core / landing.md | yes (STO-R19 accepted) |
| `ops` setting write that changes `callingWindow`, `windowOverrides` or closed dates (rev 4, STO-D45: the footer and contact hours and the `#sg-config.checkout.callWindow` block are rendered from it) | operations (P4's `saveOpsSettingsAction`) | yes (requested, STO-§29.5) |
| BiRefNet mask ready for an asset referenced by an active product (rev 4, STO-D47; render reason `cutout`, core §H.3) | P8's `cutout` handler | yes, once per store whose `asset_refs` (kind `product`) contain the asset (requested, STO-§29.5) |
| template publish through the gate, blueprint apply, `sync` republish of an attached landing (rev 2) | S1 | yes (publish) · no (`sync`: a landing version; the PDP never shows a landing's pack price) |
| verified review published or hidden (R3) | D3 | yes |
| handle, mode, domain change | core | `address_version` instead (core §C.6) |

### STO-§7.6 Public store APIs (`src/app/api/public/store/**`, request STO-R10)

| Route | Method | Body limit | What | Buckets | Answer |
|---|---|---|---|---|---|
| `order/route.ts` | POST | 48 KB | payload v3 (STO-§16) | `p:api:order:<ipHash>` 60/10 min, `s:<sid>:order:ip:<ipHash>` 8/10 min, `s:<sid>:orders` 600/10 min (core §E.8) | `OrderResponseV3` |
| `lead/route.ts` | POST | 16 KB | `kind: "form"`: abandoned-checkout lead (STO-§15.11) · **`kind: "whatsapp"`** (rev 2, STO-D34): server-priced WhatsApp order intent (STO-§15.13) | `s:<sid>:lead:ip:<ipHash>` 30/10 min; `whatsapp` kind also `p:wa:ip:<h>` 30/10 min and `s:<sid>:wa:ip:<h>` 10/10 min (core §E.8, the landing buckets) | `form`: `{ ok: true }` always (no oracle) · `whatsapp`: `{ ok: true, wa: { ref, number, text } }` or `{ ok: false, error: "unavailable" \| "rate_limited" \| "invalid" }` |
| `cart/route.ts` | POST | 24 KB | re-price ≤ 20 lines (STO-§15.3) | `p:cart:ip:<ipHash>` 120/10 min, `s:<sid>:cart:ip:<ipHash>` 60/10 min | `CartPriceResponse` |
| `event/route.ts` | POST | 4 KB | analytics beacon, the landing `EventPayload` shape with a template or product key | `p:evt:ip:<net>` (core) | 204 |
| `search-index/route.ts` | GET | — | R3 instant-search index (`?cv=`) | `p:search:ip:<ipHash>` 60/10 min | JSON, `public, max-age=0, s-maxage=300` |

Each handler: `effectiveHost(req.headers)` + `clientIp` (core §C.2, D18); the store is resolved from the keys in the
body only (product public keys, template context key), never from a body store id (core §A.1 invariant 5); every key
of one request must resolve to the same store, else `invalid` and nothing is written; `checkOrigin` with
`storeHosts(store)` (core §C.9); `apiHeaders` (core §F.6); `Cache-Control: no-store` except `search-index`.

### STO-§7.7 Previews

- Admin: `/app/<h>/preview/<pageId>` (core §I.1) renders a store template draft with `mode: "preview"`; for `product`
  and `collection` templates `?product=<id>` / `?collection=<id>` pick the sample (default: the most recently updated
  active one; product drafts preview with their draft data). Preview documents send no beacon, load no pixel, and
  their checkout block shows "Aperçu : la commande n'est pas envoyée."
- Pending stores (core §A.5.3): `/preview/<token>` on the platform host renders the same drafts (request STO-R15).

---

## STO-§8 StoreRenderContext and the store document (LND-01, LND-09, LND-10)

### STO-§8.1 Types

```ts
// src/storefront/types.ts (pure; the landing RenderContext, src/landing/types.ts:121-161, is unchanged)
export type Register = "marketing" | "commerce" | "transactional";
export type StoreDocKind = StorePageKind | "thanks" | "policy" | "track";

export interface StoreLinks {
  home(): string; product(slug: string): string; collection(slug: string, q?: { page?: number; sort?: SortKey }): string;
  page(slug: string): string; policy(kind: StorePolicyKind): string; search(q?: string): string;
  cart(): string; checkout(): string; thanks(): string; track(): string;
  absolute(path: string): string;                  // storeUrl (canonical, og, JSON-LD)
  report(path: string): string;                    // rev 4 (core D76, LAN-§3.9): platformOrigin() + "/report/<h>?p=" + the path without query; the maintainer's helper that also builds landing's ctx.links.report
}
export interface StoreFacts {                       // from the `policies`, `store`, `checkout` and `ops` settings; absent = not stated by the owner
  cod: true;                                        // store mode is COD-only in R2/R3
  inspection?: boolean;                             // "vérifiez avant de payer": true only when `policies.inspection === "allowed"` (rev 4: the setting is an enum, LAN-§2.3)
  returnsDays?: number;                             // `policies.returns.windowDays` when `policies.returns.accepted !== false` (rev 4: rev 3 named a non-existent `returnsDays` key)
  exchangeDays?: number;                            // `policies.exchange.windowDays` when `policies.exchange.accepted !== false`
  callPromise?: boolean;                            // = `checkout.confirmationCall` (landing's R1 flag; rev 4 names the real key)
  /** rev 3 (OPS-11, STO-D45): the ONE calling window, from `ops.callingWindow` through `callingWindowFor(scope)` (P4 stub, core D73).
   *  rev 4 (CRIT3): operations' `EffectiveWindow`, imported from `src/lib/callcenter/window.ts` and never restated here
   *  (its `days` convention is OPE-§2.9's to fix; the storefront passes the object through). `nextCallableAt(t, w)` gives
   *  the "{when}" (computed in the browser at view time, STO-§15.4); `hoursText(w, locale, dateLocale, now)` and
   *  `rangesForDay(ymd, w)` give the footer / contact-page hours. `store.confirmation.hours` / `policies.contact.hours`
   *  are removed (core D73). */
  callingWindow?: EffectiveWindow;                  // set only when `shopperPromiseAllowed(w)` (= `w.configured`, OPE OD63: the owner saved the window); P4's DEFAULT_WINDOW
                                                    // (callingWindowFor never answers null; `configured: false`) is an operations default, not a stated fact, so with it no hours
                                                    // line and no "{when}" render (owner rule 4; the bare promise stays)
  whatsapp?: string; phone?: string; email?: string;
  legalName?: string; city?: string; ice?: string; rc?: string;
}
export interface DeliverySummary {                  // from delivery_zones + fallback fee (STO-D10); null fields = not set
  enabled: boolean; minFeeCents: number | null; maxFeeCents: number | null; freeFromCents: number | null;
  etaMinDays: number | null; etaMaxDays: number | null;     // over served zones
}
export interface StoreRenderContext {
  mode: "live" | "preview" | "test"; kind: StoreDocKind; register: Register;
  addons: RenderAddons;                             // core §H.13 (D62): add-on chunks, data blocks, extra CSS, `banner: "test"` (STO-D33); `exp-head` / `exp` in R3
  genome: { grammar: Grammar; heroFamily: string; why: string[] } | null;   // the compiled page genes the document was built with (DNA card, STO-D39); null for utility kinds (rev 3, ENGP-1: utility kinds carry the brand's house genes only, are never pooled and never novelty-checked; the DNA card for them is read-only brand chips)
  locale: Locale; dir: "rtl" | "ltr";
  store: StoreContext & { id: string; handle: string; market: Market; currency: string; key: string /* storage prefix = handle */ };
  links: StoreLinks; theme: BuiltTheme; catalogVersion: number; contextKey: string /* pages.public_key of the template */;
  money(cents: Cents): string; num(n: number): string;
  t(key: StoreUiKey, vars?: Record<string, string | number>): string;     // STO-§24
  asset: AssetResolver["resolve"]; video: AssetResolver["video"];
  rng(key: string): () => number;                   // seeded by stores.brand_seed + page id (deterministic per store)
  now: string; chrome: ChromeData; facts: StoreFacts; delivery: DeliverySummary;
  product?: ProductView; collection?: CollectionView; search?: SearchView;
  /** landing RenderContext for an eligible landing section: the PDP product, or the section's bound product */
  landingCtx(productId?: string): RenderContext | null;
}
```
`landingCtx` builds the landing context with `createRenderContext(productAsPageDoc(…), …)` (`src/landing/context.ts:483`)
so landing sections render exactly as on a landing page (same props, same `ctx.money`, same `ctx.t`).

### STO-§8.2 Links

`createStoreLinks(store)` (`src/lib/storefront/links.ts`) wraps `storePath` / `storeUrl` (core §C.6): every in-page
link is an absolute path with the store base (`/s/<h>` in P mode, empty in S/C, core D48). Menu entries are `LinkRef`s
resolved at render:

```ts
export type LinkRef =
  | { kind: "home" } | { kind: "search" } | { kind: "cart" } | { kind: "track" }
  | { kind: "collection"; id: string } | { kind: "product"; id: string } | { kind: "page"; id: string }
  | { kind: "landing"; id: string }                       // a published landing page of the store
  | { kind: "policy"; policy: StorePolicyKind }
  | { kind: "url"; url: string };                          // https only, external, rel="noopener" + target="_blank"
export function resolveLinks(scope: StoreScope, refs: readonly LinkRef[]): Promise<(string | null)[]>;   // null = dead (archived, deleted, unpublished)
```
A dead link is dropped from the rendered menu and listed as a warning in the menus editor and the store checklist.

### STO-§8.3 The document shell

`StoreDocument` (`src/storefront/document.tsx`, pure like `src/landing/**`, no hooks):
- `<html lang dir data-register data-kind data-motion>`; `<head>`: charset, viewport, title (STO-§20.3), description,
  canonical, robots, Open Graph and Twitter tags per kind, `hreflang` (R3), JSON-LD scripts (STO-§20.4), icon (store
  logo, else design's monogram favicon), `preload` of the LCP image (PDP: first gallery image; home: hero media;
  collection: header image or first card) with `imagesrcset` + `fetchpriority="high"`, ≤ 2 font preloads, one inline
  `<style>`.
- `<body>`: skip link "Aller au contenu" → `#main`, announcement bar, `navHeader`, `<main id="main" tabindex="-1">` with
  the sections, footer, WhatsApp float (not on `checkout`), dialog hosts (`#sg-drawer` menu, `#sg-cart` cart sheet),
  `#sg-config` (and `#lp-config` on the PDP), then the inline scripts.
- Section rendering: `renderStoreBody(doc, ctx)` renders store sections through `STORE_SECTIONS` and landing sections
  through `getSection(type).render({ id, variant, bg, data, ctx: ctx.landingCtx(bind?.productId), index })`, each landing
  section wrapped in `<div data-sg-landing="<type>">` so store CSS can space it; a landing section whose context is
  `null` (bound product gone) is skipped and reported by the checklist.

### STO-§8.4 Registers and theme (DG-11, storefront side)

| Kind | Register | Storefront-enforced rules (design owns the tokens and gates, DES-§11.1) |
|---|---|---|
| home, page | marketing | the page may use every gene of the store's Brand Genome; one hero signature + ≤ 3 secondary details (DESIGN v3 budgets); glass ≤ 2; reveals ≤ 40 nodes, one easing family (G23); `G22` may be `mixed` but ≤ 2 centred sections in a row |
| product, collection, search, cart, checkout, not_found, policy | commerce | **G16 = 0** (no glass or blur surface anywhere, sticky bar and header included); motion ≤ 250 ms with one reveal kind (`fade-rise`) on the two marketing islands only, CSS transitions ≤ 180 ms on store sections, no scroll-linked motion; accent area ≤ 8 % of the viewport (actions, selection, badges); `G22 = start`; no decor (ghost word, ring badge, chips over photos, aurora, ticker). **rev 3 (UX-21):** no G2 restriction: the register is brand genes + clamps; the PDP family comes from the store's G2 through the STO-§12.8 pool over all nine grammars, and the collection grid is a grid by construction (rev 2's "`G2 ∈ {catalogue, split-tension}` for the info column and grids" is withdrawn; DES-§11.1's sentence requested out, STO-R33). **Marketing islands (rev 2, STO-D14):** `collectionHeader:banner` and the PDP gallery + `productContent` slot may use the store's full gene set (grammar, treatment, type scale) under the document's motion and glass clamps |
| thanks, track | transactional | header without menu (logo + WhatsApp), single column, no motion, no decoration, no grid, no promotion before the order summary; accent only on the one CTA and links |

`compileRegister(brand, register, page?)` (DES-§11.1) gives the store document its tokens; `runGates` runs with the
same `register`, so a commerce template with glass, motion > 250 ms or accent area > 8 % is a **hard** design item at
publish (DG-11 acceptance). The render matrix (`qa:storefront-render`) measures all three on every kind fixture.

- `getStoreTheme(scope, register)` (design S2, frozen as a stub in the R2 contract step, request STO-R19) returns the
  compiled `BuiltTheme` of the store's active `store_themes` row for that register. Until S2 lands, the stub returns
  the theme of the store's most recently published landing page (or the archetype default) so S1 can build.
- Colour mixes created by store CSS (sold-out veil, selected card tint, header hairline) are registered with the blend
  guard `src/lib/theme/blend.ts` (owner rule 1) through a CCR to design; the render matrix runs the orange scan on every
  store fixture. **rev 3 (ENGP-21):** the scan is **`scanOrange(css: string): OrangeHit[]`** in
  `scripts/qa/lib/orange.ts` (S1 creates it in R2 by extracting the culori OKLCH band logic of `scripts/check-theme.ts`
  (hue 25-75°, chroma > 0.06, `color-mix()` evaluation); P6 may later move it into `src/lib/theme/orange.ts` through a
  CCR and both scripts import it). Nothing under `npm test` imports the git-ignored `qa/` folder (`.gitignore:48`,
  ~600 MB); `qa/verify/orange-check.mjs` and `qa/admin-visual/shoot.mjs` stay owner-run local steps.

---

## STO-§9 Store sections (ST-02, ST-03, ST-04)

### STO-§9.1 Landing sections on store kinds (eligibility, LND-03)

`ELIGIBILITY` (`src/storefront/sections/eligibility.ts`) decides where a landing section type may appear; landing
section files are not edited. "Product" = inside `products.content` (the PDP's productContent slot); "bound" = on
`home` / `page` with `bind.productId`; "free" = on `home` / `page` / `collection` without a product.

| Landing type | Product | Bound | Free | Why not, when not |
|---|---|---|---|---|
| benefits, problem, showcase, gallery, beforeAfter, comparison, specs | ✓ | ✓ | | they talk about one product |
| steps, story, video, faq, marquee | ✓ | ✓ | ✓ | free use passes the audit test below |
| guarantee | ✓ | | | its text is the owner's promise about a product |
| cta | ✓ (its target is the buy box `#order`) | | | there is no `#order` elsewhere |
| hero, offer, orderForm, stickyCta | ✗ | ✗ | ✗ | replaced by `productDetail` and the checkout (one `#order`, LND-08) |
| header, footer, announcement, whatsappFloat, trustBar | ✗ | ✗ | ✗ | store chrome and `trustStrip` replace them; the landing trust bar has default claims (`trust.delivery`, `src/landing/i18n.ts`) that are not store facts |
| reviews, socialProof, stats | ✗ | ✗ | ✗ | STO-D12 (samples; R3 `reviewsVerified` only) |
| urgency | ✗ | ✗ | ✗ | stock comes from inventory; a real countdown lives in `productDetail` |

Audit test (`src/storefront/sections/selftest-eligibility.ts`): every "free" type renders with a neutral store context
(product name = store name, one item at price 0, one offer) and its output must contain no money string, no `#order`
link and no `data-bundle-card`; a type failing the test is removed from "free" until fixed.

### STO-§9.2 Store section definitions

```ts
// src/storefront/sections/types.ts (pure)
export interface StoreSectionProps<D> { id: string; variant: string; bg: SectionBg; data: D; ctx: StoreRenderContext; index: number }
export interface StoreSectionDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string; label: string; labelFr: string;
  kinds: readonly StorePageKind[];
  singleton?: boolean;
  requiredIn?: readonly StorePageKind[];
  variants: VariantDef[];                                       // VariantDef of src/landing/types.ts:218-227 (archetypes, bgs)
  bento?: readonly string[];                                    // variant ids that count toward the one-bento budget
  /** rev 2: per-variant features for the slop score and the height model (DES-§8.4 `VariantFeatures`, incl. `h`, `slots`, `glass`, `centered`, `signature`); required for every variant (registry test) */
  features: Record<string, VariantFeatures>;
  /** rev 2: hero families only (storeHero, productDetail, collectionHeader): the design grammars the variant serves and its declared fold layout (STO-§9.5) */
  grammars?: Record<string, readonly Grammar[]>;
  fold?: Record<string, FoldLayout>;
  schema: S;
  defaults(input: StoreDefaultsInput): z.infer<S>;              // { kind, store, shape: CatalogShape, locale, rng }
  fields: FieldSpec[];                                          // inspector (src/landing/types.ts:178-204 vocabulary)
  needs?(data: z.infer<S>, kind: StorePageKind): DataNeed[];    // card sources the renderer loads in one query (STO-§7.3)
  render(props: StoreSectionProps<z.infer<S>>): ReactElement | null;
}
// src/storefront/registry.ts: STORE_SECTIONS (ordered as in the "Add section" library), getStoreSection(type)
```
Store section type names never collide with landing type names (`storeHero`, not `hero`). Every store section: logical
CSS properties only, tokens only (DESIGN v3), per-variant CSS chunk (`src/storefront/sections/<type>/<variant>.css`),
no hook, no browser global (the rules of `src/landing/types.ts:1-14`), ar/fr/en defaults.

### STO-§9.3 The section catalog

`LinkRefSchema` = the zod form of `LinkRef` (STO-§8.2). `Ulid` as in STO-§6.2. Text maxima are code points.

| Type | Kinds | Variants | Props (zod, summarised exactly) | Notes |
|---|---|---|---|---|
| `storeHero` | home, page | **8 hero families (rev 2, STO-D31):** `stage`, `editorial-split`, `poster-type`, `bento-lead` (bento), `cinematic-bleed`, `quiet-luxe`, `catalogue-index`, `specimen-sheet` (rev 1's `product-stage` / `type-led` / `media-full` are renamed `stage` / `poster-type` / `cinematic-bleed`) | `{ eyebrow?: str ≤ 40, heading: str 1-90, sub?: str ≤ 200 (≤ 20 words, rubric §4.7), cta: { label: str 1-30, link: LinkRef }, cta2?: same, media: AssetRef[] ≤ 3, productId?: Ulid, tiles: { collectionId: Ulid, label?: str ≤ 30, image?: AssetRef }[] ≤ 4, align: "start" \| "center" = "start", ghost: false /* fixed: no giant decorative word on store pages, DS12 */ }` | `stage` and `specimen-sheet` require `productId` (an active product with an alpha cutout, DES V13; **rev 3, UX-39:** `hasCutout: true` or `"estimated"`, the latter with the `plinth` / `contact` stage preset until the real mask lands, STO-D47): its cutout, its name and its real "Dès" price; `bento-lead` requires **3-4 tiles with ≥ 2 images, or 1 image + 1 colour-field tile declared by the family's tile sheet**, of unequal sizes set by the sheet (exactly as many cells as tiles, rubric §4.7; **rev 3, UX-34:** rev 2 allowed 2 text-only tiles, a pair of coloured boxes; a store that cannot meet this falls to `editorial-split`); `cinematic-bleed` uses a scrim token, never glass on text, and needs a photo meeting design's H13 bleed rule for its declared slots (DES V11 / H13, slot- and viewport-relative at DPR 2, mobile-only bleed with a framed desktop fallback; rev 5, CRIT2-20: not a fixed 1,600 px); `catalogue-index` needs ≥ 3 active collections; ≤ 4 text elements in any family (rubric §4.7 hero stack); the fold layout per family is STO-§9.5 |
| `collectionTiles` | home, page | `bento` (bento), `row`, `stack`, `index-list` | `{ heading?: str ≤ 60, items: { collectionId: Ulid, label?: str ≤ 30, image?: AssetRef }[] 2-8, showCount: bool = false }` | count = real `productCount`; a tile of an archived collection is skipped |
| `productGrid` | home, page, product, collection, search, cart, not_found | `grid`, `carousel`, `editorial`, `dense` | `{ heading?: str ≤ 60, source: { kind: "collection", collectionId } \| { kind: "manual", productIds: Ulid[] 1-24 } \| { kind: "bestsellers" } \| { kind: "newest" } \| { kind: "related" }, limit: int 2-24 = 8, card: "auto" \| "minimal" \| "framed" \| "overlay" \| "editorial" = "auto", link?: { label: str ≤ 30, link: LinkRef } }` | `related` only on product (same primary collection, then shared tags, then newest; the current product excluded); `bestsellers` hidden unless STO-D22 allows; < 2 products → section not rendered; carousel: scroll-snap, no autoplay, arrow buttons on pointer devices |
| `productDetail` | product (required, first) | **6 PDP families (rev 2, STO-D31):** `split`, `stacked`, `rail`, `immersive`, `specimen`, `quiet` (STO-§12.8) | `{ gallery: "swipe" \| "grid" = "swipe", zoom: bool = true, showSku: bool = false, showPerUnit: bool = true, trust: ("cod" \| "delivery" \| "inspection" \| "returns" \| "whatsapp")[] ≤ 4 = ["cod","delivery","returns","whatsapp"], stickyBar: bool = true, description: "below_buy" \| "content" = "below_buy" }` | STO-§12; each trust item renders only with its fact; every family declares its fold layout (STO-§9.5) and keeps the buy box as the one `#order` (LND-08) |
| `productContent` | product (required) | `flow` | `{ spacing: "normal" \| "airy" = "normal" }` | renders `products.content.sections` with the PDP context |
| `collectionHeader` | collection (required, first) | `minimal`, `banner`, `split` | `{ showDescription: bool = true, showCount: bool = true }` | name, description, image from the collection row |
| `collectionProducts` | collection (required) | `grid`, `grid-large`, `list` | `{ perPage: 12 \| 24 \| 36 = 24, sorts: SortKey[] ≥ 1 = all, card: as productGrid }` | STO-§13.1 |
| `searchResults` | search (required) | `grid`, `list` | `{ perPage: 24 \| 36 = 24 }` | STO-§13.3 |
| `cartView` | cart (required) | `classic`, `summary-first` | `{ emptyLink: LinkRef = { kind: "home" } }` | filled by the `cart` chunk (STO-§15.3); server HTML = skeleton rows sized like real rows (no layout shift) |
| `checkoutForm` | checkout (required, first) | `single`, `split` | `{ summary: "collapsed" \| "open" = "collapsed" (mobile), trust: bool = true }` | fields from the store field model, not from the doc (STO-§15.5) |
| `notFoundBlock` | not_found (required) | `plain`, `split` | `{ heading?: str ≤ 90, body?: str ≤ 240 }` | defaults from STO-§24 |
| `trustStrip` | home, page, product, collection, cart, checkout | `inline`, `cards`, `rail` | `{ facts: ("cod" \| "delivery_range" \| "free_from" \| "inspection" \| "returns" \| "whatsapp" \| "hours")[] 1-4 }` | each fact renders only when it exists (STO-§12.6); no fact → section hidden |
| `mediaText` | home, page, product, collection | `split`, `overlap` (marketing kinds only), `full-bleed` | `{ heading: str 1-90, body?: RichText ≤ 1200, media: AssetRef, link?: { label: str ≤ 30, link: LinkRef }, side: "start" \| "end" = "end" }` | brand statement, lookbook, story |
| `richText` | home, page, product, collection | `prose`, `two-col` | `{ heading?: str ≤ 90, body: RichText ≤ 4000 }` | measure 60-72 ch |
| `whatsappCta` | home, page, product, collection, search, not_found | `banner`, `card` | `{ heading?: str ≤ 60, text?: str ≤ 160, prefill?: str ≤ 120 }` | hidden without a store WhatsApp number; `wa.me/<digits>?text=` |
| `reviewsVerified` (R3) | product, home (bound), page (bound) | `list`, `strip`, `summary` | `{ limit: int 3-12 = 6, photos: bool = true }` | STO-§18; hidden with 0 published verified reviews |

### STO-§9.4 The product card

```ts
// src/storefront/primitives/ProductCard.tsx (pure)
export interface ProductCardData {
  id: string; slug: string; name: string;
  image: ResolvedAsset | null; image2: ResolvedAsset | null;   // second photo: hover on pointer devices only, CSS only
  fromCents: number; variable: boolean;                          // "Dès" when an offer's price can rise with options
  referenceCents: number | null;                                 // displayReference when showReference (genuine compare-at or pack reference)
  savingsPct: number | null;                                     // OfferMath.savingsPct of the default offer when showSavings ≠ "none"
  soldOut: boolean;                                              // no available offer after applyStock
  freeDelivery: boolean;                                         // every offer has `freeShipping: true`
}
export function ProductCard(p: { data: ProductCardData; variant: CardVariant; ctx: StoreRenderContext; ratio: "4:5" | "1:1" | "3:4"; loading: "eager" | "lazy" }): ReactElement;
```
- One link per card wrapping image and name; price outside the link text but inside the card; at most **one badge**
  (sold out > savings > free delivery); name clamped to 2 lines; tabular numerals; the struck reference only when
  `referenceCents > fromCents`.
- Image: `Picture` with `sizes="(min-width: 1200px) 25vw, (min-width: 600px) 33vw, 50vw"`, intrinsic ratio reserved,
  `loading="lazy"` and `decoding="async"` except the first row of the first grid above the fold (`eager`, no preload).
- Sold out: image veil (a registered blend), badge "Épuisé", the card still links to the PDP.
- Variants: `minimal` (no frame, text under), `framed` (surface card, radius tier `--r-card`), `overlay` (text on a
  bottom scrim, marketing kinds only), `editorial` (large type, asymmetric caption).

### STO-§9.5 Hero families, grammars and fold layouts (rev 2; STO-D31, D32; DB C1, C2, N4)

A **hero family** is a structurally different first screen, not a re-skin: the position and size of the image, the
type scale, the alignment and what the shopper can tap differ. Each family names the design grammars it serves
(`GRAMMARS`, DES-§4.1), so the store's G2 (sampled per store with the archetype as a prior, DS1-DS3) picks the family
through the pool table below, exactly as landing heroes are picked by DES-§5.4; the archetype never locks it.

```ts
// src/storefront/fold.ts (pure, isomorphic; frozen in the R2 contract step, STO-§27.1)
export const HERO_FAMILIES = ["stage", "editorial-split", "poster-type", "bento-lead", "cinematic-bleed", "quiet-luxe", "catalogue-index", "specimen-sheet"] as const;   // storeHero variants (home, page)
export const PDP_FAMILIES = ["split", "stacked", "rail", "immersive", "specimen", "quiet"] as const;                                                                   // productDetail variants (STO-§12.8)
export type HeroFamily = (typeof HERO_FAMILIES)[number]; export type PdpFamily = (typeof PDP_FAMILIES)[number];
export const FAMILY_GRAMMARS: Record<HeroFamily | PdpFamily, readonly Grammar[]>;   // the "grammars served" columns below and in STO-§12.8; the pools are the inverse map with weights
export type FoldItem = "image" | "name" | "price" | "cod" | "cta" | "identity" | "collections";
export interface FoldLayout {
  /** elements that must sit inside the first 844 px at 390 in every locale (the SERVER gate, budget:C2, through the height model with its error band);
   *  360 × 740 is a Playwright-only soft check in qa:storefront-e2e (rev 3, ENGP-23: the frozen HeightReport knows one viewport) */
  mustShow: FoldItem[];
  /** estimated px from the top of each mustShow item's bottom edge at 390, for a 2-line name in the store's locale; the family's phone stack decides them (STO-§12.8 table);
   *  `cta` is the primary action's bottom edge (rev 2's single `ctaBottomPx` kept as `bottoms.cta`).
   *  rev 4: layout data only; the gate reads the model's `FoldReport.items` = each item's estimated TOP (DES-§5.3), derived as bottom − the item's own height (CTA 56, price cluster 40, image = its box) */
  bottoms: Partial<Record<FoldItem, number>>;
  /** px added per extra name line (ar: × 1.06) and per extra offer card in a `stack` / `tiers` picker; the estimator applies them for the store's longest name and tallest picker */
  perNameLine: number; perOfferCard: number;
  /** where the hero's single text block sits: start-aligned column, centred statement (≤ 2 per page, DES V08) or overlapping the image */
  text: "column" | "statement" | "overlap";
}
export function foldLayoutFor(kind: StorePageKind, variant: string): FoldLayout | null;   // the registry's `fold` entry; data only
/** rev 3 (ENGP-1, DS33): a THIN call into design's height model, never a second fold computation:
 *  `estimateHeights(doc, { look, locale, features })` with the store registry's `features` and the kind's FoldLayout passed through `features.fold`;
 *  returns the FoldReport items outside the target zone as FoldIssue[] (rev 4, core §M.2 three zones: hard when an item's estimated top × 0.9 > 844,
 *  i.e. > 938 px; soft note with vars.estimated = 1 when 760 < top ≤ 938; nothing at ≤ 760). */
export function checkFold(doc: StorePageDoc, kind: StorePageKind, variant: string, locale: Locale, sample: { nameLines: 2 | 3; offerCards: number; announcement: boolean }): FoldIssue[];
```
`FoldReport.items` (frozen at P0 for landing pages as `{ image, price, cta, cod }`) is **widened at the R2 contract
step** to `Partial<Record<FoldItem, number>>` (additive: landing keeps filling four keys; store kinds add `name`,
`identity`, `collections`; STO-R29). Rev 2's `checkFold(doc | ProductView, …)` with its own height arithmetic in
`src/storefront/fold.ts` is withdrawn: `fold.ts` holds data (`HERO_FAMILIES`, `PDP_FAMILIES`, `FAMILY_GRAMMARS`,
`FoldLayout`, `foldLayoutFor`) and the one wrapper above.

| Family (`storeHero` variant, home) | Grammars served (G2) | First screen at 390 × 844 | `mustShow` | Treatment (G18) it suits |
|---|---|---|---|---|
| `stage` | stage | cutout on a lit stage ground (`cutout-stage`), name, real "Dès" price, one CTA; text column start-aligned; no hotspots unless merchant anchors exist (DB I5) | image, name, price, cta, identity | cutout-stage |
| `editorial-split` | editorial-column, split-tension | 5:7 split: photo block + type column; CTA inside the column; a caption line under the photo (FIG.-style allowed once, DB §6 keep 7) | image, cta, identity | framed, tight-detail |
| `poster-type` | poster | display type ≥ 52 px at 390 (≤ 3 lines, `text-wrap: balance`, T2), one photo below the type edge crossing the section boundary (DB C4), CTA under the type | image, cta, identity | full-bleed-crop |
| `bento-lead` | gallery-led | 3-4 collection tiles of unequal size (exactly as many cells as tiles) with one headline; ≥ 2 tiles carry an image, or 1 image + 1 colour-field tile the sheet declares (rev 3, UX-34: never a pair of text-only coloured boxes); the first tile is the CTA | collections, cta, identity | grid-contact, framed |
| `cinematic-bleed` | cinematic | one full-bleed photo meeting design's H13 for `full-bleed-crop` (DES-§4.4, DS54: ≥ 1.5 × the slot at DPR 2 on every breakpoint the variant declares in `features.slots`, and `sharp`); rev 5, CRIT2-20: the bleed is declared **mobile-only with a framed desktop fallback**, so a ~1,200 px phone photo qualifies; rev 4's fixed "≥ 1,600 px" is withdrawn), a scrim, short type at the bottom start corner, one CTA; no glass | image, cta, identity | full-bleed-crop |
| `quiet-luxe` | quiet-luxe | generous space, one small photo or none, type ≤ 36 px, hairline rule, one CTA; ≤ 35 words (a "quiet" screen, DB C4) | cta, identity (+ image when present) | tonal-duotone, framed |
| `catalogue-index` | catalogue, specimen | a search field as the hero action, an index list of ≥ 3 collections with counts, a small product thumbnail strip | collections, cta (search), identity | grid-contact |
| `specimen-sheet` | specimen | product cutout on a neutral ground with a data column (3-4 real facts from `product.facts`, no invented numbers), price, CTA | image, name, price, cta, identity | cutout-stage, tight-detail |

Pool weights (the home's G2 → `storeHero` variant), the storefront's row of DES-§5.4: `stage`: stage .7, specimen-sheet
.3 · `editorial-column`: editorial-split .6, quiet-luxe .4 · `poster`: poster-type .7, bento-lead .3 · `gallery-led`:
bento-lead .6, editorial-split .4 · `specimen`: specimen-sheet .6, catalogue-index .4 · `catalogue`: catalogue-index .7,
bento-lead .3 · `split-tension`: editorial-split .7, stage .3 · `cinematic`: cinematic-bleed .8, poster-type .2 ·
`quiet-luxe`: quiet-luxe .7, editorial-split .3. A family whose data requirement is not met (no cutout **nor an
estimated one** (rev 3, STO-D47), < 3 collections or < 2 tile images for `bento-lead` (rev 3, UX-34), no photo meeting
design's H13 bleed rule for `cinematic-bleed`'s declared slots, rev 5 CRIT2-20) is skipped and the next weight wins; so is a family whose fold estimate for the store's longest name lands
outside the band (STO-§6.1 rev 3), so the gate never refuses what the draw produced (**rev 4, three zones:** a family
with any `mustShow` top > 938 px is never drawn; one in the 760-938 note zone is drawn only when no family of the pool
row sits in the ≤ 760 target zone, so a generated page carries a fold note only when the catalogue forces it); `scrapbook`-like collages and
rotating ring badges do not exist on store pages (DESIGN v3 banned list, DS12).

Share caps (measured by the DG-09-style store corpus, STO-§26.1, and in production by `gene_stats` on the `heroFamily`
value): any one family ≤ 30 % of live homes in a niche over 100 stores (DB C1); the distinct (family × G4 pairing × G9
strategy) count over 100 generated homes of one niche ≥ 40 (DB N4); the pairing and strategy come from the Brand Genome,
so the storefront only has to keep the family draw seeded by `deriveSeed(brand_seed, inputHash, "home")` (DS5).

Every family keeps the rubric's hero discipline where it does not conflict with the owner rules: ≤ 4 text elements
(eyebrow or none, headline ≤ 2 lines at 1440 and ≤ 3 at 390, subtext ≤ 20 words, CTAs 1 + ≤ 1), no trust strip or logo
wall inside the hero (the `trustStrip` section follows it), no version label, no scroll cue, no decorative text strip
(rubric §4.7, §9.F); Arabic type keeps T2-T3 (whole-line reveals, ≥ 1.25 display leading) and never uppercase or
tracking (RTL7).

---

## STO-§10 Header, navigation, footer and chrome (ST-02, LND-31)

### STO-§10.1 The `storefront` setting

```ts
// src/lib/settings/keys/storefront.ts
const MenuLeaf = z.object({ id: Id, label: z.string().min(1).max(30), link: LinkRefSchema });
const MenuItem = MenuLeaf.extend({ children: z.array(MenuLeaf).max(8).default([]) });   // ≤ 2 levels
export const StorefrontSettings = z.object({
  header: z.object({
    variant: z.enum(["bar", "centered", "drawer"]).default("bar"),
    sticky: z.enum(["compact", "always", "off"]).default("compact"),
    search: z.boolean().default(true),
    logoHeight: z.number().int().min(24).max(56).default(32),        // px on desktop; mobile = min(value, 32)
  }).default({}),
  menus: z.object({
    main: z.array(MenuItem).max(8).default([]),                       // ≤ 40 links in total (refine)
    footer: z.array(z.object({ id: Id, title: z.string().min(1).max(30), links: z.array(MenuLeaf).max(8) })).max(4).default([]),
  }).default({}),
  announcement: z.object({
    enabled: z.boolean().default(false),
    variant: z.enum(["static", "rotate"]).default("static"),          // rotate: 6 s, paused on hover/focus, static under reduced motion
    messages: z.array(z.object({
      text: z.string().min(1).max(90), link: LinkRefSchema.optional(),
      startsAt: z.string().datetime({ offset: true }).optional(), endsAt: z.string().datetime({ offset: true }).optional(),
    })).max(3).default([]),
  }).default({}),
  footer: z.object({
    variant: z.enum(["columns", "compact", "statement"]).default("columns"),
    statement: z.string().max(160).optional(),
    identity: z.boolean().default(true),                              // seller identity line (law 31-08): only facts that exist
  }).default({}),
  whatsapp: z.object({ float: z.enum(["bubble", "tab", "off"]).default("bubble"), prefill: z.string().max(120).optional() }).default({}),
  pixels: Tracking.default({}),                                       // library ids or { none: true } (STO-D18)
  home: z.object({
    storyline: z.enum(HOME_STORYLINES).default("hero-product"),      // rev 2: the slot list (STO-§11.1); rev 1's `archetype` field renamed
    heroFamily: z.enum(HERO_FAMILIES).optional(),                     // owner override of the G2 pool draw (STO-§9.5); unset = drawn from the Brand Genome
  }).default({}),
  pdpFamily: z.enum(PDP_FAMILIES).optional(),                         // owner override of the PDP family (STO-§12.8); unset = drawn
  productCard: z.enum(["minimal", "framed", "overlay", "editorial"]).default("minimal"),
  imageRatio: z.enum(["4:5", "1:1", "3:4"]).default("4:5"),
  digits: z.enum(["latin", "arabic"]).default("latin"),               // Arabic-Indic digits on ar pages only when "arabic"
  showLowStock: z.boolean().default(false),                           // default of StockConfig.showLow for new products
});
```
Writes need `storefront.write` (core §A.3.1), audit `store.storefront.settings_updated`, bump `catalog_version`.

### STO-§10.2 `navHeader` (chrome)

| Element | Rule |
|---|---|
| Layout | `bar`: logo at inline-start, menu inline (≥ 900 px), icons at inline-end · `centered`: logo centred, menu row below · `drawer`: menu button, centred logo, icons; the menu always in the drawer |
| Mobile (< 900 px) | every variant: menu button, logo, search and cart icons; 56 px tall, 48 px when compact |
| Drawer | from inline-start (mirrored in RTL), width `min(86vw, 360px)`, `role="dialog"` + `aria-modal`, focus trapped, Escape and the scrim close it, background `inert`, page scroll locked, focus returns to the menu button; second level = disclosure buttons (`aria-expanded`) |
| Sticky `compact` | solid background, hairline under, height 56 → 48 after 64 px of scroll (CSS scroll-driven animation where supported, else one passive scroll listener with rAF in the `store` chunk); never transparent over content on commerce kinds |
| Logo | brand kit logo (SVG or the largest stored raster), `height = logoHeight`, `alt = store name`; without a logo: the store name set in the brand display face |
| Cart icon | link to `/cart` (works without JS); count badge filled from storage by the chunk, label "Panier, {n} articles" (`aria-live="polite"` on change); on pages with the `cart` chunk it opens the cart sheet instead |
| Search | link to `/search` (works without JS); R3: opens the instant search combobox |
| Never | a mega menu (P2), autoplaying content, a header that covers the LCP image, more than 8 top items |

`checkout` and the transactional kinds use the minimal header: logo (link home), "Paiement à la livraison" pill, the
WhatsApp icon when a number is set. No menu, no search, no cart icon.

### STO-§10.3 Announcement bar, footer, WhatsApp float

- **Announcement**: height reserved (36 px) so nothing shifts; messages filtered by `startsAt`/`endsAt` at render (the
  window id of request STO-R7 keeps the cache correct across those boundaries); a message with a number must match a
  fact the owner set (the editor warns when "Livraison offerte" is typed while delivery is not free everywhere). The
  generator may propose messages only from facts (COD, the real free-from threshold, a real promotion end).
- **Footer**: menu columns, policy links (only policies whose facts exist), contact (WhatsApp, phone, e-mail, hours,
  each only when set; **rev 3, STO-D45:** the hours line is `hoursText(facts.callingWindow, locale, dateLocale, now)` (P4's signature, rev 4) from `ops.callingWindow`,
  the same window the agents work and the thank-you page promises), the seller identity line when `identity` is on
  ("Vendu par {legalName}, {city}", ICE and RC when provided; the admin shows missing facts, the page never invents
  them), socials from the `store` setting, the payment mention "Paiement à la livraison" (store mode is COD-only), the
  platform badge unless `remove_platform_badge` (core §A.4), and **rev 3 (SEC-18)** the quiet "Signaler cette boutique"
  link (`footer.report`). **rev 4 (core D76, §B.1, §C.4; CRIT15):** the report page exists from R1 (`/report/<handle>`,
  P1, insert-only `abuse_reports` in 0005), so the link is **always** rendered, on **every** store document (the
  transactional kind `thanks` and the `checkout` kind carry it in their one-line minimal footer), exactly **once** per
  document, with landing's rule of LAN-§3.9 so the two surfaces match: href = `links.report()` = `platformOrigin() +
  "/report/" + handle + "?p=" + encodeURIComponent(path)` where `path` is the served path **without** query or fragment
  (never `?o=`, `?q=`, `sg-test` or an idem), built by the maintainer's same helper as landing's `ctx.links.report` (no
  section concatenates the platform origin); absolute because store hosts answer 404 for `/report/*` (like `/kit/*`);
  `rel="nofollow"`, same tab, no `target`; text `footer.report` (STO-§24) in muted ink at ≥ 4.5:1, never the accent, not
  a CTA (no `data-hero-cta`, counted in no `budget:R1` total); `live`, `test` and `preview` documents carry it. For the
  `track` kind the wrapped tracking document already carries landing's own link (LAN-§3.9 tracking row), so
  `wrapInStoreChrome(scope, html, "track")` renders the store footer **without** `footer.report` (one link per
  document). Rev 3's "only when the endpoint is configured" condition is withdrawn. The hours
  line (rev 4) renders only when the owner saved a calling window (`StoreFacts.callingWindow`, STO-§8.1): today's ranges
  through `hoursText`, the line keyed to the store-local day by the cache window id (STO-§7.4).
- **WhatsApp float**: `bubble` or `tab` (the landing `whatsappFloat` look, re-implemented as chrome), prefilled text
  "{prefill or default} · {page name}"; hidden on `checkout` and transactional kinds, and while the cart or menu sheet is
  open; 44 × 44 px minimum, inset from the safe-area edge. **rev 3 (UX-4):** on the PDP the float **docks** when the
  sticky buy bar is visible through the CSS hook the landing float already uses, zero runtime bytes:
  `html.lp-js:has([data-sticky-cta][data-visible]) .sg-wa-float { translate: … }` (the mirror of
  `whatsappFloat.css:379-383`); no IntersectionObserver, no `data-in` (the reveal runtime's one-shot flag, which never
  un-sets), no `assist` logic.

---

## STO-§11 Home grammar (ST-09, ST-19)

### STO-§11.1 Model

```ts
// src/storefront/home/grammar.ts (pure)
export const HOME_STORYLINES = ["hero-product", "category-bento", "editorial", "catalogue-dense", /* R3 */ "drop", "routine", "gift-guide", "local-maker"] as const;   // rev 1 called them "archetypes"; renamed: a storyline is a slot list, never a look
export interface CatalogShape { activeProducts: number; collections: number; bestsellers: boolean; cutouts: number; wideImages: number /* rev 5 (CRIT2-20): photos meeting design's H13 `full-bleed-crop` rule (DES-§4.4) for the slots the bleed family declares; rev 4's "≥ 1,600 px" withdrawn */; categories: ProductCategory[]; heroProductId?: string; launchAt?: string /* drop */ }
export interface HomeSlot { id: string; options: { type: string; variants: readonly string[]; bind?: "hero" | "any" }[]; required: boolean; when?: (s: CatalogShape) => boolean; density: "airy" | "balanced" | "dense" }
export interface HomeStoryline { id: HomeStorylineId; release: "R2" | "R3"; fits(s: CatalogShape): boolean; slots: readonly HomeSlot[] }
export interface HomeGenes { grammar: Grammar; treatment: Treatment; density: PageGenes["G20"]; align: PageGenes["G22"]; hints?: GeneHints }   // from the Brand Genome's house genes (DES-§11.2) + the page draw
export function expandHome(s: HomeStoryline, genes: HomeGenes, shape: CatalogShape, rng: () => number): { sections: StoreSectionInstance[]; record: PageGenes["G24"]; heroFamily: string } | null;   // hero family from the STO-§9.5 pool for genes.grammar; alternates seeded; invariants checked; null after 50 failed draws
export function checkHomeDoc(doc: StorePageDoc, shape: CatalogShape, locale: Locale): HomeIssue[];   // STO-§11.3 (H1-H13)
export function defaultStoryline(shape: CatalogShape): HomeStorylineId;
export function homeSeed(store: Pick<StoreRow, "brandSeed">, shape: CatalogShape, attempt: number): number;   // deriveSeed(brandSeed, inputHash(shape), "home", attempt) (DS5; DB N6)
```
**rev 2:** the storyline (slot list) and the look are separated. The storyline comes from the catalogue shape; the
**hero family, the variant pools, the treatment and the density come from the store's Brand Genome** (G2, G18, G20,
G22 of the `house` genes, DES-§11.2; the archetype G1 is only a prior, DS1). The seed mixes the brand seed **and the
catalogue shape** (`homeSeed`), so two stores with the same photos, or one store with two catalogues, never share
(family, pairing, order) (DB N6; rev 1's `seededRandom(hash32(brand_seed + ":home"))` ignored the product). Design's
`GeneHints` (DES-§4.6, from the blueprint's Director brief when Cloud AI is on) weight the draws; the solver, the gates
and the novelty check still decide. The novelty check (DES-§7.4, verdict bands only) runs on the compiled page genome
before the owner sees a draft; `close` or `too_close` resamples one bold gene (≤ 8 tries) and never blocks generation.

### STO-§11.2 Storylines and slots (rev 2: "archetypes" renamed; the look comes from the genome, STO-§11.1)

| Storyline | Fits | Slots in order (alternates; the `storeHero` family comes from the G2 pool of STO-§9.5, constrained to the families listed) |
|---|---|---|
| `hero-product` (R2) | 1-3 active products, or an ad-driven store | 1 storeHero (families `stage` \| `editorial-split` \| `specimen-sheet` \| `quiet-luxe`, bound to the hero product) · 2 trustStrip (`inline` \| `rail`) · 3 benefits \| showcase (bound) · 4 productGrid (`manual`, other products, `carousel` \| `grid`) when ≥ 2 products · 5 steps \| story (optional) · 6 faq (optional) · 7 whatsappCta (`banner`) |
| `category-bento` (R2) | ≥ 5 products and ≥ 3 collections | 1 storeHero (`poster-type` \| `bento-lead` \| `cinematic-bleed`) · 2 collectionTiles (`bento` unless the hero used `bento-lead`, then `row`) · 3 productGrid (`bestsellers` \| `newest`, `grid`) · 4 trustStrip (`cards`) · 5 mediaText (`split` \| `overlap`) · 6 productGrid (one collection, `carousel`, optional) · 7 whatsappCta (`card`, optional) |
| `editorial` (R2) | categories ∩ {fashion, jewelry, accessories, beauty} and ≥ 4 products with photos | 1 storeHero (`editorial-split` \| `cinematic-bleed` \| `quiet-luxe`) · 2 mediaText (`full-bleed`) · 3 productGrid (`editorial`) · 4 collectionTiles (`stack` \| `index-list`) when ≥ 2 collections · 5 trustStrip (`inline`) · 6 story (optional) |
| `catalogue-dense` (R2) | ≥ 50 products | 1 storeHero (`catalogue-index` \| `poster-type`, search-first) · 2 collectionTiles (`row`) · 3 productGrid (`newest`, `dense`) · 4 productGrid (`bestsellers`, `dense`) when allowed · 5 trustStrip (`rail`) · 6 whatsappCta (`card`) |
| `drop` (R3) | a real launch date set by the owner | storeHero (`cinematic-bleed` \| `poster-type`) with the real countdown · product reveal (mediaText bound) · whatsappCta ("Être prévenu(e)") · trustStrip |
| `routine` (R3) | beauty / care, ≥ 3 products | storeHero (`quiet-luxe` \| `editorial-split`) · steps (bound per step) · productGrid (`manual`, the routine) · trustStrip · faq |
| `gift-guide` (R3) | ≥ 6 products, owner-typed budgets | storeHero (`poster-type` \| `bento-lead`) · collectionTiles (`row`, budget collections) · productGrid × 2 · trustStrip |
| `local-maker` (R3) | owner opts in | storeHero (`editorial-split` \| `quiet-luxe`) · story · mediaText (`full-bleed`, workshop photos) · productGrid · trustStrip (modern visuals only, no craft motifs, DESIGN §1.1) |

Composition devices per home (DB C4, soft): ≥ 1 full-bleed image or colour moment, ≥ 1 boundary-crossing element
(the hero photo or a tile crossing a section edge; `record.cross`), ≥ 1 quiet screen (≤ 35 words, one image or none).
Density follows the brand's `G20.p` pattern (ABAC / AAB / ABAB) over the slots' `density` values; no three consecutive
sections with the same density (DES V08). Section openers: ≤ 30 % of sections carry an eyebrow; ≥ 3 opener structures
per home (bare headline, caption column, number-led, image-first; DB C5).

### STO-§11.3 Invariants (`checkHomeDoc`, also run by the store checklist)

| # | Rule |
|---|---|
| H1 | The first section is a `storeHero`. |
| H2 | The first section links to a product or a collection. |
| H3 | At least one `productGrid`, or a `stage` / `specimen-sheet` hero bound to an active product. |
| H4 | At most one bento variant on the page (DESIGN v3 budget). |
| H5 | No two adjacent sections with the same `bg`. |
| H6 | At most 2 centre-aligned sections in a row. |
| H7 | A `trustStrip` within the first 3 sections whenever the store has ≥ 1 trust fact. |
| H8 | 4 to 9 sections. |
| H9 | `bestsellers` sources only when STO-D22 allows them. |
| H10 | Every bound product is active; every referenced collection is active. |
| H11 (rev 2, rev 3) | The fold contract of the hero family holds at **390 × 844** in the store's locale (`checkFold`, STO-§9.5, through the height model with its error band): hero image or colour moment, one primary CTA and the store identity inside the first screen; the price too when the hero is product-bound. Hard (gate `budget:C2`) outside the band, a note inside it (**rev 4:** the core's three zones on each item's estimated top: ≤ 760 target, 760-938 note, > 938 hard). **360 × 740** is reported by Playwright in `qa:storefront-e2e` as a soft check (rev 3, ENGP-23). |
| H12 (rev 2, rev 3) | The hero family is in the G2 pool of the page's grammar (STO-§9.5) and its data requirements are met (a real **or estimated** cutout for `stage` / `specimen-sheet` (STO-D47), ≥ 3 collections for `catalogue-index`, a photo meeting design's H13 bleed rule for `cinematic-bleed`'s declared slots (rev 5, CRIT2-20: slot- and viewport-relative at DPR 2, mobile-only bleed with a framed desktop fallback; not a fixed 1,600 px), 3-4 tiles with ≥ 2 images for `bento-lead` (UX-34)). Hard. **Rev 5 (CRIT2-20) fixtures (`test:catalog`):** a store whose sharpest photo is a 1,200 px phone photo may draw `cinematic-bleed` (mobile-only bleed, framed desktop fallback) and passes H12; a 700 px photo makes the family skipped, never refused at publish. |
| H13 (rev 2) | Per-kind budgets of STO-§6.1 (sections, height, CTAs, glass 0-2, reveals, photo reuse); ≤ 30 % of sections with an eyebrow; ≤ 2 centred sections in a row. Soft; hard at the hard column. |

### STO-§11.4 Generation contract

- R2 without Cloud AI (the **instant path**, always available, < 2 s): `defaultTemplate("home", shape, store)` =
  `expandHome(defaultStoryline(shape), houseGenes(brand), shape, rngFor(homeSeed(store, shape, attempt)))` with copy from
  the copy library (design's cliché detector and the honesty guard apply, DES-§9, ai.md AI-§D); three candidates are
  built (slots `best-fit` / `contrast` / `explore`, ra §0.6) and the owner picks one on the storefront overview, each
  with its DNA card (STO-D39). **rev 3 (QUAL-1), corrected in rev 4 (CRIT13, core §M.4 and §Q.8 STO-R39 A\*, DS50):**
  `design:N8` (headline 3-gram shingle share > 25 % in the niche) is **hard on generated lines** (origin `cloud`,
  `local` or `engine`, the last being design's compositional generator `copy-gen.ts` over the library skeletons,
  DES-§9.12, which repairs a line with `rewriteLine` before the owner sees the draft) and **soft on owner-typed lines**
  (§M.1 rule 2: the soft N05 note with the line focused) **and on plain copy-library fallback lines** (core §M.4: their
  shared wording is by construction and the library sweep keeps each skeleton ≤ 10 %). Rev 3 wrote "hard for
  owner-typed lines"; the core did not adopt that clause and this file follows the core. The instant path takes its
  headlines and leads from the compositional generator (DG-07, R1; ≥ 24 skeletons and ≥ 40 distinct hero titles per
  family × locale), so its lines are `engine` lines under the hard rule, and the corpus test "30 simulated engine-only
  stores in one niche publish with 0 `design:N8` refusals" (`test:slow`, core §M.4; the storefront's store-home variant,
  30 homes over one simulated niche, is cheap and stays in `test:catalog`, STO-§26.1) pins that the generator, not a
  softened gate, keeps them distinct. Store
  section copy that the generator does not cover (store-specific `storeHero` sub-lines, `trustStrip` labels) is built from
  facts, never from a shared headline, so N8 has nothing to compare there. **rev 3
  (UX-20):** the three candidates are shown with P6's reveal component in its rev 3 layout, never as one big frame and
  two small cards: on a phone, candidate 1 is the **real home fold edge to edge at 100 %**, the three folds sit in a
  horizontal snap carousel with an 8 % peek of the next, the DNA chips live in a bottom sheet and "Utiliser ce design"
  is sticky; on a desktop the **three real folds stand side by side at equal width (≤ 440 px each)**, hover or focus
  expands one to a full scrollable preview, and the DNA card sits under each (420 ms quint entrance, crossfade under
  reduced motion). **rev 3 (STO-D47):** `stage` / `specimen-sheet` candidates are eligible with an estimated cutout, so
  at least one of the three directions is a stage or specimen page for a product whose photo has a uniform background
  (`qa:storefront-demo` asserts it on the argan and parfum fixtures).
- With Cloud AI on, the **store blueprint** (AI-11, deep Director, STO-D38) runs as a detached job: stage 1 brand brief
  → `GeneHints` for the brand genes (S2's `sampleBrand`), stage 2 collections from the owner's own products + the home
  storyline and slot plan, stage 3 about and policy drafts from `policies` facts only (`needsReview`). The job's result
  is applied as drafts by `applyStoreBlueprint` (STO-§11.5); the instant candidates stay available and the owner can
  toggle back (ra §1.2 "the Director pass is an upgrade").
- Every generated home passes `checkHomeDoc` (H1-H13), `runGates` (`register: "marketing"`) and the novelty check,
  else the generator re-rolls (≤ 8 draws, resampling one bold gene when the novelty band is `close` / `too_close`) and
  then falls back to the plainest valid alternate of each slot with `why += "fallback-order"`.
- Owner edits are never blocked by H2, H4-H9, H13 (soft); they show as checklist warnings with a one-click fix (H1,
  H3, H10, H11, H12 are hard at publish through the core gate, STO-D35).
- Acceptance (the store corpus of STO-§26.1): 4 storylines × 3 shapes × ar/fr × 50 seeds = 1,200 homes with 0 hard
  items; ≥ 60 distinct in-flow sequences per 100 homes of one niche and no 4-section subsequence in > 50 % of them (DB
  N3); no family > 30 % per niche (C1); fold contract 100 % (C2); same seed, two shapes → never the same (family,
  pairing, order) (N6); ar and fr of one genome differ in type scale and hero arrangement (N7). **rev 3 (ENGP-24):**
  `npm test` runs a **seeded subset** of this corpus (4 × 3 × 2 × **8** seeds = 192 homes, plus the 6 PDP families × 3
  shapes × ar/fr, ≤ 40 s on the owner's PC inside the core's `npm test` ceiling, STO-R40; rev 5, CRIT2-9: the storefront
  row of core §J.1's budget table, with the ceiling raised explicitly to 240 s at the R2 contract step); the full 1,200-home
  sweep with the share and sequence caps runs in `test:slow` (before each merge) and in `qa:design-corpus`. **rev 3
  (QUAL-20):** the 4-gram ("no 4-section subsequence in > 50 %") and share caps are **sweep assertions** over the
  simulated corpus, not runtime mechanisms: the generator's runtime novelty input is design's verdict bands only (DS7),
  and nothing in `expandHome` reads niche 4-gram shares. **rev 4 (design QUAL-20 resolved, DES-§7.4, §5.1):** design
  gave the rule a data path, `nicheShares(niche).seq4` (top 20 4-gram shares of the niche's live pooled pages, k ≥ 10,
  rounded to 10 %), so `expandHome` now uses it the way design's Act2 order does: after the slot draw, it re-draws the
  optional slots' order (≤ 10 times, seeded) while the home repeats a 4-section subsequence used by ≥ 50 % of the store's
  own pages or of the niche's `seq4` table; below k = 10 the table is empty and only the sweep applies. Store section
  type names never collide with landing type names (STO-§9.2), so a store home's 4-grams only ever match store homes'
  (the request that design computes `seq4` per page-kind family so landing 4-grams cannot crowd store homes out of the
  top 20 is in STO-§29.5). The sweep assertion stays the acceptance.

### STO-§11.5 Applying a store blueprint (AI-11 consumer)

```ts
// src/lib/catalog/blueprint.server.ts
export interface StoreBlueprint {                      // produced by ai.md AI-11 (shape frozen by ai.md; storefront consumes); every value from closed vocabularies
  storyline: HomeStorylineId;
  hints: GeneHints;                                     // brand and page gene weights (DES-§4.6), applied by S2's sampleBrand and expandHome; never a raw genome
  collections: { name: Record<Locale, string>; description?: Record<Locale, string>; productIds: string[] }[];   // owner's own products only (assertOwned)
  home: { slots: { type: string; variant: string; data: Record<string, unknown>; bind?: string }[] };
  pages?: { title: Record<Locale, string>; slug: string; sections: { type: string; variant: string; data: Record<string, unknown> }[]; needsReview: true }[];   // about, FAQ, policy drafts from `policies` facts only
  provenance: { source: "director" | "deep" | "instant"; runIds: string[]; promptVersions: Record<string, string> };   // written into page_versions.generation_source / critic_picks on publish
}
/** Interactive entry: returns at once with the instant candidates and, when Cloud AI and `store_ai.deepPass` are on, the job id of the deep blueprint (ai_jobs kind "store_blueprint", pattern B, core §H.12). */
export function startStoreDesign(ctx: StoreCtx): Promise<{ instant: { candidates: StoreBlueprint[] /* 3 */ }; job: { jobId: string } | null }>;
/** @write */ export function applyStoreBlueprint(ctx: StoreCtx, bp: StoreBlueprint): Promise<{ collections: string[]; homeDraftVersionId: string; pages: string[]; dropped: string[] }>;
```
`startStoreDesign` builds the three instant candidates in the request (< 2 s), then, when the deep pass is allowed
(`store_ai.deepPass`, `deepPassesPerStorePerDay`, `s:<sid>:ai:jobs` 10/h), inserts the `ai_jobs` row through P7's
`enqueueAiJob` and answers `job_queued` semantics inside the result; the storefront overview polls
`GET /api/app/<h>/ai/jobs/<id>` every 2 s visibility-aware (core §H.12), shows the stage line ("Reading your products →
Briefing the brand → Planning the home → Drafting the pages"), and offers "Apply" when done, with the instant
candidates still applicable and an undo (the previous `@home` draft version). A failed or orphaned job keeps the instant
result (core §H.12 orphan rule); the pulse's `jobs.done` wakes a closed tab's next visit.

`applyStoreBlueprint` creates draft collections (ids checked with `assertOwned(scope, "product", …)`), the `@home` draft
(validated by `StorePageDoc` + `checkHomeDoc`; invalid slots are dropped and listed), draft custom pages flagged
`needsReview`; never publishes; one audit row `store.storefront.blueprint_applied` (`{ source, dropped }`); the
provenance is stored on the draft and copied to the version at publish. Acceptance (with AI-11): 0 hard gate items on
the compiled home; brand distance verdict `ok` for every live store in the niche or one bold gene resampled; no fact,
number or policy appears that the owner did not give (guard with the `policies` facts as the only allowed source); the
whole flow passes with Cloud AI off (instant candidates only).

### STO-§11.6 Design DNA on store pages (SF-02, STO-D39)

- **DNA card** (P6's component, DES-§15.4, mounted by S1): in the store page editor's Theme panel for `home` and
  `page` kinds and read-only for utility kinds: the bold-gene chips ("Editorial column · Fraunces/Readex · ink + one ·
  tight-detail crops"), the hero family, the one-sentence **why** line (`genome.why` → DES-§4.8 keys in the admin
  locale), the novelty **words** per band (DS27: "Distinct across the platform · Distinct in your niche · Distinct from
  your other pages"), and lock toggles ("Lock for my brand", `brand.write`). No number of distance ever renders (DS7).
- **Brand DNA card** on the storefront overview (STO-§23.5): the Brand Genome's chips, the active `store_themes`
  version and "Generate my store design" / "Design studio" (S2).
- **Provenance**: the template version's `generation_source` and `critic_picks` (STO-§3.1) feed the card's footer
  ("Designed by the instant engine" / "Designed with the deep pass on 24 Oct") so "which AI wrote this" is always
  answerable (ra §5.6).
- Acceptance: the rendered admin HTML of the storefront overview and the store page editor contains no decimal in a
  novelty context (regex over the DNA card markup); two stores generated from the same photos show different chips and
  `ok` bands; a store created before the genome shipped shows "Generated before design DNA; remix to upgrade".

---

## STO-§12 Product page (ST-04, R-D44)

### STO-§12.1 Anatomy on a 360 px phone (top to bottom)

The first screen shows the first image, the name, the price, the COD line and the primary action in **every** PDP
family and locale (STO-D32; **390 × 844** is the server contract through the height model and its error band, 360 × 740
the Playwright soft check, rev 3 ENGP-23; sf §4.4, DB C2): this is the fold contract each `productDetail` variant
declares (`fold`, STO-§9.5) and the publish gate verifies; the families themselves are STO-§12.8, with their re-stacked
phone layouts and measured bottoms (rev 3, UX-22). The order below is the `split` family on a phone **after the rev 3
re-stack (name and price above a 1:1 gallery)**; the other families move the gallery and the info column but keep the
same elements in the same reading order.

1. **Gallery**: swipeable 4:5 (store `imageRatio`), dots + "1/6" counter, tap opens a zoom dialog (focus trapped,
   pinch on touch, Escape closes); video slot from R3 (LP-14). Choosing an option whose choice, matrix value or cell has
   a photo swaps to it (the landing `gallery` module contract).
2. **Title and price block**: name (H1), tagline, price = the default offer's `from` ("Dès" when `variable`), the struck
   `displayReference` when `showReference`, per-unit for packs when `showPerUnit` and `perUnit` exists, savings per
   `offers.showSavings`. EU markets (ST-21): the 30-day lowest price next to any reference.
3. **Offer picker and options**: the Offers v2 picker of `offers.display` (stack, tiers, ticket, pills, visual) and the
   units (fill inline, rows, steps, box), exactly as on landing pages (OFFERS §E, §F).
4. **Buy action**: `inline` model = the checkout block directly under the buy box (STO-§15.4); `cart` model = "Ajouter
   au panier" (primary) + "Commander maintenant" (secondary, goes to `/checkout` with this line only).
5. **Delivery line**: "Livraison à {city} : {eta} · {fee}" (STO-§12.3).
6. **Trust row**: facts only (STO-§12.6), ≤ 4 items.
7. **Low-stock line** (optional, STO-§5.5) and the real countdown when `offers.urgency.countdownEnd` is in the future.
8. **Description** (`description: "below_buy"`), then the **productContent** sections, then the template's shared
   sections (related grid, trust strip, store FAQ).
9. **Sticky buy bar** (STO-§12.5).

### STO-§12.2 Buy box mechanics (STO-D25)

- `doc = productAsPageDoc(product, …)`; `cfg = buildRuntimeConfig(doc, landingCtx, { pageKey: product.publicKey, ver:
  product.rev, endpoints: { order: "", event: "/api/public/store/event" }, thankYouUrl: "", … })`
  (`src/lib/render/config.ts:231`), embedded as `#lp-config`. `order: ""` because the `pdp` entry has no landing `form`
  module (STO-§14.2).
- Markup: `<form data-lp-form data-sg-buy id="order" novalidate>` with the landing picker and units markup (the
  `orderForm` internals rendered through exported sub-components; a missing export is a CCR to the owner of
  `src/landing/sections/orderForm/**` that changes no landing HTML byte, proven by `render-check`), followed by the buy
  actions; the inline checkout block is a **sibling** `<form data-sg-checkout>` (forms never nest).
- The landing summary rows (subtotal / delivery / total) are not rendered in the buy box; the buy box shows the live
  line price from the bridge (STO-§14.3); delivery and total appear only in the checkout block or at checkout.
- Feature chunks (`units-matrix`, `units-fields`, `fill-steps-box`) are embedded exactly when `runtimeFeatures(doc,
  fill)` (`src/lib/render/config.ts:211`) says so.
- **rev 4 (OPS-14, PLA Q3.8):** the onboarding reveal calls the same builder with `sctx.direction` (STO-§4.1): the
  theme and the `productDetail` family come from the direction's genome, the buy box, its config and every price stay
  byte-identical across the three directions (the reveal fold is a `preview` render, STO-§6.7, §7.7).

### STO-§12.3 Delivery line by city (R-D22, ST-17)

- Data: **rev 4 (CRIT1, core §K.2 P0, LAN-§7.1): the browser table is landing's `ZoneTable`, verbatim.**
  `zonesForCheckout(scope): Promise<ZoneTable>` (P3's P0 stub) is embedded unchanged as `#sg-config.checkout.zones`
  (STO-§14.4): `{ v: 1, zones: { n, fee, freeFrom, d: [min, max] | null, ns }[], city: Record<City.value, zoneIndex>,
  star: zoneIndex | null, cal: StoreCalendar & { holidays: next 60 days } }` with `cal.leadDays` from
  `checkout.calendar.confirmationLeadDays` (OPS-12). The `city` map is **keyed by the posted `City.value`** ("Fès") and
  built on the server as `city[c.value] = zoneIndexOf(zoneForCity(zones, cityKey(c.value)))` for every city of
  `MA_CITIES` except "Autre", so the browser looks up `zones.city[value] ?? zones.star` and **never slugs**; "Autre
  ville" and any typed text are absent from the map and resolve to `star` (or the fallback fee). It is the **same
  object** the `lp-assist.dz` block carries (one P0 function, one shape, one parity fixture), ≈ 2-3 KB gz for 147
  cities. Rev 3's slug-keyed `zones.c`, the per-city slug `s` and the bundling of `cityKey()` into `checkout` / `pdp`
  are withdrawn (`cityKey` is server-only on the storefront side).
- Server HTML (no JS fallback): the store range "Livraison en {min} à {max} jours ouvrés selon la ville · {minFee} à
  {maxFee}" built from `DeliverySummary`, each part only when set; nothing at all when zones are off and no fallback
  fee exists (the same text rule as LAN-§7.4's no-city state).
- With JS: the city chip ("Votre ville : Tanger · changer") remembers the city in `sg:<handle>:city`
  (`localStorage`, the chosen `City.value`); the line becomes "Livraison à Tanger : entre mer. 29 et jeu. 30 oct. · 25 DH
  (estimation)" (with landing's "après confirmation par téléphone" clause when `checkout.confirmationCall` and a lead day
  apply, LAN-§7.4, so the text is byte-identical to `assist`'s) through landing's `etaWindow(zones.cal, zone, now)` and
  `etaText(w, zone, locale, cfg.money.locale, now)` (`src/lib/delivery/eta.ts`, bundled into the `checkout` and `pdp`
  chunks like `assist` bundles it, LAN-§5.2) and `storeDeliveryFee()`
  (STO-§15.9); "offerte" when the rule says free; a `notServed` city shows "Nous ne livrons pas encore à {city}" with the
  WhatsApp button and the buy actions disabled for that city (`data-sg-dz-state="ns"`); a zone without days shows
  "Livraison à Tanger · 25 DH"; a city outside every zone with no `*` zone and no fallback shows no line (no promise).
- Every date carries the muted "(estimation)" / "(تقريبي)" / "(estimated)" marker and no dash inside the range
  (LAN-§7.2 steps 4-5); the ETA text is byte-identical to what the landing `assist` chunk and the tracking page render
  for the same city and instant (`test:catalog` asserts it against `test:delivery` fixtures).
- The fee shown is always the fee the checkout and the server compute for that city and that subtotal.

### STO-§12.4 Gallery and media

- Images: the product's `images` (≤ 30) then each item's own photos (Offers v2 photo wells), de-duplicated by asset id;
  first image = LCP (preloaded, `fetchpriority="high"`, AVIF ≤ 120 KB at 1× mobile width, STO-§21.2); others lazy.
- Group photos and crops (`AssetRef.box`) render through `Picture` exactly as on landing pages.
- Alt text: `AssetRef.alt`, else "{product name} · photo {n}"; AI-09 fills empty alts in R2 (ai.md).

### STO-§12.5 Sticky buy bar

The landing `sticky` module contract (`src/landing/runtime/sticky.ts:1-40`): the bar appears once the buy box has
scrolled out of view, hides while the buy box or the checkout block is visible, is `aria-hidden` + `inert` when hidden.
Content: thumbnail, the selected offer's short name and live price, one button ("Commander" scrolls to `#order` in the
inline model; "Ajouter au panier" in the cart model). Height 64 px + safe-area inset; never above an open sheet; never
glass on commerce kinds (solid surface + hairline). **rev 3 (UX-4): how the hide rule is wired, with the frozen
module.** `sticky.ts` watches `[data-hero-cta]` elements and the order form with rAF + `getBoundingClientRect` (its
header comment rejects an IntersectionObserver) and toggles `data-visible` / `inert` / `aria-hidden` on
`[data-sticky-cta]`. The PDP therefore gives the buy box's primary action **and** the checkout block's submit the
`hero` prop of `Cta` (`src/landing/primitives/Cta.tsx:95` → `data-hero-cta`), so "the bar hides while any in-flow
primary CTA is ≥ 50 % visible" (DB R7) is the module's existing behaviour with zero new bytes and no `assist` logic;
the WhatsApp float docks through the `:has([data-sticky-cta][data-visible])` CSS hook (STO-§10.3). `data-in` (the
reveal runtime's one-shot flag) is never used for this. `qa:storefront-e2e` asserts the behaviour; the design gate V27
checks the markers (`[data-sticky-cta]`, `[data-hero-cta]` present) only (design's side).

### STO-§12.6 Facts-only badges and lines (STO-D13)

| Shown | Only when | Source |
|---|---|---|
| "Paiement à la livraison" | always (store mode is COD-only) | — |
| Delivery range / city line | zones on or a fallback fee set; ETA only when the zone has ETA days | `delivery_zones`, `checkout.store.fallbackFeeCents` |
| "Livraison offerte" (card, offer) | the offer has `freeShipping` (card: every offer), or the store charges 0 everywhere | product doc, zones |
| "Livraison offerte dès {amount}" | a zone with `free_from_cents`; on the city line only for that city | zones |
| Struck price | `displayReference > from` (OFFERS §C.3) | product doc |
| Savings chip | `showSavings ≠ "none"` and `savings ≥ 1` | `offersMath` |
| "Vérifiez votre colis avant de payer" | `policies.inspection === "allowed"` (rev 4: an enum, LAN-§2.3; rev 3 wrote `=== true`) | `policies` setting |
| "Retour sous {n} jours" | `policies.returns.windowDays` set and `policies.returns.accepted !== false` (rev 4: the real key) | `policies` setting |
| "Un conseiller vous appelle pour confirmer" (+ "{when}": "aujourd'hui dès 09:30" / "demain dès 09:30" / "lundi dès 09:30") | `checkout.confirmationCall === true` (rev 4: the real key, rev 3 wrote `callPromise`); the `{when}` only where the `checkout` chunk runs (checkout page, PDP inline block) and on the thank-you page, only when the owner saved a calling window with ≥ 1 range in the next 7 days, **computed in the browser at view time** (rev 4: never server text, so a cached page never shows a stale "aujourd'hui"); the PDP trust row and every no-JS fallback show the bare promise | `checkout` setting flag + `ops.callingWindow` through `nextCallableAt(now, w)` (P4's one function, also behind `confirm_hours` and the queue) |
| "Meilleures ventes" | STO-D22 | `sold_30d` |
| "Plus que {n} en stock" | STO-§5.5 | `inventory_levels` |
| Countdown | `countdownEnd` in the future | product doc |
| Stars, rating, review count | R3 verified reviews only | `reviews` |
| WhatsApp button | a store WhatsApp number | `store` setting |

`src/lib/catalog/facts.selftest.ts` renders fixtures with each fact absent and asserts the line is absent.

### STO-§12.7 States

| State | Answer |
|---|---|
| Product `active`, available | 200, full page |
| Active, every offer unavailable | 200; buy box disabled with "Épuisé"; WhatsApp "Être prévenu(e)" (R3: a notify-me lead); `availability: OutOfStock` in JSON-LD |
| `draft` | branded 404 (preview through the admin only) |
| `archived` | branded 404 with "Ce produit n'est plus disponible." and a related grid from its primary collection; `noindex` |
| Old slug | 308 to the current slug (`catalog_redirects`) |
| Store `restricted` | 200; buy box and checkout replaced by "Commande temporairement indisponible" + WhatsApp (STO-D28) |
| Synthetic doc invalid (bug) | 200; buy box replaced by the WhatsApp ask; error logged (STO-§4.1) |
| Preview | as live; checkout says it does not send |
| Test token (STO-D33) | as live, rendered on request: no pixel chunk, "Commande test : non comptée" banner, `noindex`, `private, no-store`; the token travels in `sessionStorage` to the checkout |

### STO-§12.8 PDP hero families (rev 2; STO-D31, DB C1, C2)

The PDP template's `productDetail` variant is a **family**: the arrangement of gallery, info column, buy box and
content. One template serves every product of the store, so the family is a brand-level choice (drawn from the Brand
Genome's G2 with the archetype as a prior, like the home hero; pools below); the owner may override it in the template
editor. The buy box and the checkout block are byte-identical across families (one `form[data-lp-form]`, one
`#order`, LND-08, STO-§12.2).

| Family | Grammars served (G2) | ≥ 1,024 px | 390 px phone stack (rev 3, UX-22: re-stacked so `mustShow` image, name, price, cod, cta sit inside 844 px with a 3-line name) | Suits |
|---|---|---|---|---|
| `split` | split-tension, editorial-column | gallery column 7/12 at inline-start, sticky info column 5/12 | **name and price above** a 1:1 gallery (390 px; rev 2 had a 4:5 gallery first, ≈ 780 px before the CTA), then picker, buy action, COD line | most catalogues |
| `stacked` | poster, catalogue | gallery as a 2-column grid of photos, info below centred-start | gallery swipe 1:1 (390 px), then name, price, picker, buy action | few photos, long names (the guaranteed-fit fallback) |
| `rail` | catalogue, specimen | vertical thumbnail rail + large image, info column | **name and price above** a 1:1 image (390 px) with a horizontal thumbnail rail under it (56 px), then picker, buy action | 6-30 photos, variants with photos |
| `immersive` | cinematic | full-bleed gallery (`full-bleed-crop`), info panel overlapping the image's lower edge (the one boundary crossing, DB C4) | 4:5 bleed image at ≤ 420 px wide (488 px at 390) with the info panel overlapping by **64 px** (rev 2: 3:4 at 520 px, 48 px overlap) | photo-led brands whose photos meet design's H13 bleed rule for the slots `immersive` declares (DES V11 / H13; rev 5, CRIT2-20: rev 2's fixed "≥ 1,600 px" withdrawn) |
| `specimen` | specimen | cutout on a neutral stage at inline-start, info as a data column (name, price, 3-4 real facts, options, buy) | cutout 1:1 on the stage (358 px inside 16 px insets), data column (name, price, 3 facts), picker, buy action | tech, tools, products with a real or estimated alpha cutout (DES V13, STO-D47) |
| `quiet` | quiet-luxe | one large image with generous margins (inline 64 px), small type, hairline rules, info column narrow | image 4:5 with a **24 px** inset (342 × 428 px; rev 2: 64 px inset), name ≤ 28 px, price, picker, buy action | perfume, jewellery, premium (calm mood) |

**Measured bottoms at 390 px (rev 3, the `FoldLayout.bottoms.cta` the gate reads; UX-22).** Composition every family
shares: compact header 56 px (+ announcement bar 36 px when enabled, added by the estimator), 16 px insets, name at the
family's display size (2 lines ≈ 66 px, each extra line +33 px, ar × 1.06), price cluster 40 px, one offer row 72 px
(`stack` / `tiers`: +64 px per extra offer card; `pills` / `ticket` / `visual`: one row), primary action 56 px; the COD
line sits inside the price cluster's second row (12 px), so `cod` ≤ `price`. Values are the primary action's bottom
edge for a **single-offer** picker; the estimator adds the store's extra offer cards and its name lines:

| Family | fr, 2-line name | fr, 3-line | ar, 2-line | ar, 3-line | Margin to 844 (worst) |
|---|---|---|---|---|---|
| `stacked` | 696 | 729 | 735 | 770 | 74 px (fits with 1 extra offer card) |
| `split` | 712 | 745 | 750 | 785 | 59 px |
| `immersive` | 730 | 763 | 770 | 805 | 39 px |
| `specimen` | 746 | 779 | 790 | 825 | 19 px |
| `quiet` | 764 | 796 | 810 | 845 | −1 px (ar 3-line: inside the band → a note, not a refusal) |
| `rail` | 768 | 801 | 810 | 845 | −1 px (same) |

The gate (`budget:C2`, STO-§6.1) reads each item's estimated **top** in the core's three zones (**rev 4**: ≤ 760 px
target, 760-938 px note, > 938 px refused; rev 3 wrote "refuses above 937, notes 844-937" on the bottoms): the CTA's
top is its bottom − 56 px, so the worst cell above (`quiet` / `rail`, ar, 3-line, 845) puts the CTA top at 789 px, in
the note zone, and every family passes for a 3-line Arabic name with one offer; a store with a 3-offer `stack` on long Arabic names
sees `quiet`, `rail` and `specimen` **skipped in the draw** (STO-§9.5 rule) and lands on `split` / `stacked`, which fit
with margin. Playwright (`qa:storefront-e2e`) measures the real rects per family × locale × name length at 390 × 844
(calibration of the numbers above) and at 360 × 740 (soft report).

Pool weights (the store's G2 → PDP family): `split-tension` split .7, immersive .3 · `editorial-column` split .6, quiet
.4 · `poster` stacked .6, immersive .4 · `gallery-led` rail .6, immersive .4 · `stage` specimen .5, split .5 ·
`specimen` specimen .7, rail .3 · `catalogue` rail .5, stacked .5 · `cinematic` immersive .7, split .3 · `quiet-luxe`
quiet .8, split .2. A family whose data requirement fails for the store's products (no real or estimated cutouts for
`specimen`, no photos meeting design's H13 bleed rule for `immersive`'s declared slots, rev 5 CRIT2-20) or whose fold estimate for the store's longest name and tallest
picker lands outside the band falls to the next weight; the fold estimate uses the store's **longest active product
name** in its locale and the tallest offer picker the store uses (`gateSampleProduct` + the name / picker maxima,
STO-§6.3 rev 3: one rule, stated once), so a template that passes the gate passes for every product. Share cap: ≤ 30 %
of PDP templates per family in a niche over 100 stores (DB C1), measured like the home. The commerce register does not
restrict which grammar a family may serve (rev 3, UX-21, STO-D14).

Art direction rules every family keeps (DB §6 keep-list 3, 5, 7; rubric §4.1-4.7 where the owner rules allow): the
price cluster is one inline-flex unit with tabular lining numerals and the discount chip adjacent (T1, RTL4); the
struck reference only when real (OFFERS §C.3); the display name ≤ 3 lines at 390 with `text-wrap: balance` and whole-
line reveals in Arabic (T2); no eyebrow above the name; no glass anywhere (commerce register); one CTA label per intent
("Commander" everywhere in the inline model, "Ajouter au panier" + "Commander maintenant" in the cart model, rubric
§4.5); the sticky bar hides while the buy box or the checkout block is ≥ 50 % visible (R7); hotspots never (I5); the
gallery counter "1/6" as text, no overlay pills on photos (rubric §9.F).

### STO-§12.9 PDP budgets and gates (rev 2; STO-D36, D37)

| Measure | Soft (note, lowers Q) | Hard (publish refused) | Gate id |
|---|---|---|---|
| In-flow sections (template + product content, gate sample product) | > 14 | > 16 | `budget:C3` |
| Estimated height at 390 (rev 3, ENGP-6: estimate with its 0.8-1.25 band) | > 12,000 px; and 15,000-18,750 px as a note "estimated" | estimate × 0.8 > 15,000 (> 18,750 px) | `budget:C3` |
| Fold contract (family's `mustShow` inside 844 px, ar and fr, longest name, tallest picker; rev 3, rev 4 three zones) | an item's estimated top in 760-938 px ("estimated", `vars.estimated = 1`) | an item's estimated top × 0.9 > 844 (> 938 px) | `budget:C2` |
| Novelty (N1 clone block, N2, N8) | — | **never on the `product` template** (utility kind, rev 3 ENGP-1): not pooled, not novelty-checked | — |
| Primary CTAs (sticky bar = 1) | > 3 | > 4; or > 2 visible at once at 390 | `budget:R1` |
| Glass surfaces | — | > 0 (commerce register) | `design:V06` |
| Reveal nodes on store sections | — | > 0 (CSS-only motion) | `design:V23` |
| Same photo appearances (gallery = 1) | > 2 | > 3 | `budget:I1` |
| HTML gz (rendered with the gate sample product, STO-§6.3) | > 90 KB | > 140 KB | `budget:F5` |
| Proof without source (rating, review, bestseller label, countdown, stock line, trust fact) | — | any | `honesty:*`, `storefront:fact_missing` |
| Checkout block fee rule `not_set` for any served city | — | yes (`inline` model) | `storefront:checkout_fee_unset` |
| Buy box without an offer, or offers that cannot be rendered by the landing picker | — | yes | `storefront:buy_box_invalid` |

Items on owner-typed fields are notes except honesty items (core §M.1 rule 2). The dialog names the measured value and
the limit ("hauteur estimée 15 400 px à 390 · limite 15 000") and offers one fix (open the section, remove the
duplicate, set a fee).

---

## STO-§13 Collections, grids and search (ST-03, ST-11)

### STO-§13.1 Collection page

- `collectionHeader` (name, description, image, real count) → sort control → `collectionProducts` grid → pagination →
  optional template sections.
- **Sort control without JS**: a `<details>` disclosure "Trier : {current}" listing the allowed sorts as links
  (`?sort=newest`); the current one `aria-current="true"`.
- **Pagination**: numbered links (at most 7 visible with ellipses) + "Voir plus" (link to the next page); `rel` links
  are not used (Google ignores them); each page is its own canonical (STO-§20.2).
- **Empty**: "Aucun produit ici pour le moment." + a link home + the WhatsApp block; `noindex`.

### STO-§13.2 Sort keys

| `SortKey` | Order (`available` products first in every sort) | Index used |
|---|---|---|
| `featured` (default for manual collections: `collection_products.position`; elsewhere `products.position`) | position asc, id | `cp_store_coll_pos_idx`, `pr_store_status_pos_idx` |
| `newest` | `published_at` desc, id | `pr_store_status_pos_idx` + sort (≤ 2,000 rows per store) |
| `price_asc` / `price_desc` | `price_min_cents` asc / desc, id | `pr_store_status_price_idx` |
| `bestsellers` (only when STO-D22 allows) | `sold_30d` desc, position, id | `pr_store_status_sold_idx` |

### STO-§13.3 Search (R2, server-side)

```ts
// src/lib/catalog/fold.ts (isomorphic, pure; operations.md may import it for OP-13)
export function foldText(s: string): string;                 // the rules below
export function tokens(s: string): string[];                 // folded, split on non-letters/digits, ≤ 32 tokens
export function arabiziToLatin(s: string): string;           // "3abaya" → "abaya" (3→a, 7→h, 9→k, 2→a, 5→kh, 8→gh) for Latin queries only
// src/lib/catalog/search.server.ts
export function searchProducts(scope: StoreScope, q: string, opts: { page: number; perPage: 24 | 36 }): Promise<{ cards: ProductCardData[]; total: number; folded: string }>;
```
- **Folding**: NFKC → lower case → Latin: NFD, strip combining marks (é → e, ç → c), œ → oe, æ → ae, ß → ss → Arabic:
  strip tashkeel (U+064B-U+0652, U+0670) and tatweel (U+0640), أ إ آ ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي → digits:
  Eastern Arabic (U+0660-0669) and Persian (U+06F0-06F9) → 0-9.
- **Index**: `products.search_text` = folded name + item names and shorts + option and value labels + tags + the
  names of the product's collections (≤ 1,000 chars), written on save. An in-memory index per store
  (`scopedCache("search-index")`, key `${storeId}:${catalogVersion}`, ≤ 2,000 products) is built from one query on the
  first search after a catalogue change.
- **Ranking**: exact folded name 100 · name starts with the query 60 · every query token prefixes a name token 40 · tag
  match 25 · item or option label 15 · collection name 10 · then `+ 2 × ln(1 + sold_30d)`; available products first;
  ties by position. Latin queries also run through `arabiziToLatin`. Owners add spellings as tags ("عباية", "abaya",
  "3baya") for reliable matches; R3 adds edit distance 1 for tokens of ≥ 5 letters.
- **Limits**: `q` ≤ 80 code points (longer is cut), ≤ 8 tokens; results paginated 24/36; the cache key uses the folded
  query; `noindex`.
- **No result**: "Aucun résultat pour « {q} »." + a real grid (bestsellers or newest) + "Demandez-nous sur WhatsApp".

### STO-§13.4 Instant search (R3, ST-11)

- `GET /api/public/store/search-index?cv=<catalogVersion>` → `{ v: 1, cv, p: [id, slug, name, foldedTokens, fromCents,
  thumbUrl, available][] }` for ≤ 500 active products, `s-maxage=300`; a store with more products keeps the server
  search only.
- The `search` chunk (≤ 5,000 B gzip) turns the header search into a combobox (`role="combobox"`, `aria-expanded`,
  listbox of ≤ 8 results, arrow keys, Enter opens, Escape closes), ranking as STO-§13.3 on the client; the full results
  page stays the server page.

### STO-§13.5 Filters (R3, ST-11)

- Facets per collection: price range (from real `from` prices, steps of the currency), availability, and option facets
  the owner maps once per collection (`rules.facets: { id, label, groupNames: string[] }[]`, e.g. "Couleur" ←
  ["Couleur", "Color", "اللون"]).
- Collections of ≤ 500 products embed `#sg-facets` JSON (`[id, fromCents, available, valueIds[]]` per product) in the
  cacheable HTML; the bottom sheet (`role="dialog"`) filters client-side with a live count ("Voir 23 produits"), state
  in `?f=` via `history.replaceState`; bigger collections filter on the server (`?f=` in the whitelist, keyed).

### STO-§13.6 Quick add (R3, ST-11)

Offered on cards only for products with exactly one available offer, at most one choice group, no matrix and no field:
a bottom sheet with the option chips and "Ajouter au panier" (the `cart` chunk; the card carries a ≤ 300-byte
`data-sg-qa` JSON with the offer id, the group and the option labels, deltas and sold-out flags). Every other product
shows "Choisir" (link to the PDP).

---

## STO-§14 Runtime chunks and budgets (R-D43, LND-15, LND-16)

### STO-§14.1 Chunks

| Chunk | Entry | Loaded on | Contains | Budget (gzip -9 B) |
|---|---|---|---|---|
| `pdp` | `src/storefront/runtime/entry-pdp.ts` | `product` kind | landing modules (source imports): `analytics` (once), `gallery`, `tabs`, `accordion`, `video`, `bundles`, `units`, `sticky`, `countdown`; store modules: `chrome`, `bridge`, `buy`, `cityChip` | **23,500** [proposal: fixed by a spike as OFFERS D11 did **before `store-page` is frozen** (rev 3, ENGP-31); may move once by ≤ 10 %, and `store-page` moves with it in the same CCR] |
| `store` | `entry-store.ts` | home, collection, page, search, not_found, cart, policy, track (store chrome) | `chrome` (compact header, drawer, cart badge, sort disclosure helpers), announcement rotation, `captureUtm` (source reuse of `src/landing/runtime/tracking.ts`), view beacon, **test-session capture** (rev 2: `?sg-test=<token>` → `sessionStorage sg:<h>:test`; every in-page link of a test session keeps the query so a reload stays a test render, STO-D33) | 2,500 |
| `cart` | `entry-cart.ts` | `cart` kind; PDP in the `cart` model | cart storage, cart sheet, cart page lines, steppers, re-price call, buy-now handoff | 6,000 |
| `checkout` | `entry-checkout.ts` | `checkout` kind; PDP in the `inline` model | fields, phone formatting, city combobox, zones + fee + ETA dates (over landing's `ZoneTable`, no `cityKey`: rev 4, CRIT1), totals, v3 submit with retry and verdicts, lead beacon, Turnstile loader, WhatsApp alternative, the call promise `{when}` through P4's pure `nextCallableAt` (source import from `src/lib/callcenter/window.ts`, ≈ 400 B gz, rev 4 STO-D45) | 8,000 |
| `store-pixels` | `entry-store-pixels.ts` | every store kind whose pixel answer is not `none` | vendor loaders (source reuse of the landing `pixels.ts` loaders), store event map (STO-D18) | 4,200 |
| `store-thanks` | `entry-store-thanks.ts` | `/checkout/merci` | summary from `sessionStorage`, WhatsApp confirm, Purchase dispatch | 3,000 |
| `search` (R3) | `entry-search.ts` | every store kind when the store has ≤ 500 products | instant search combobox | 5,000 |
| `units-matrix`, `units-fields`, `fill-steps-box` | existing | PDP, when `runtimeFeatures` lists them | unchanged | existing budgets |
| page cap `store-page` | — | every store document | Σ inline scripts of one document (heaviest: PDP inline model with matrix, fields, steps-box and pixels) | **41,000** = **derived** (rev 3, ENGP-31): Σ of the heaviest set's budgets (`pdp` 23,500 + `checkout` 8,000 + `store-pixels` 4,200 + `units-matrix` 2,200 + `units-fields` 1,000 + `fill-steps-box` 1,750 = 40,650) rounded up to the next 500; `scripts/build-store-assets.mjs` **fails** when `store-page` < that sum, so one chunk budget cannot move without the cap (R3 adds `exp-head` 450 + `exp` 1,200 → 42,300 → **42,500**, replacing STO-R26's hand-set 43,000) |

Per kind (typical, without option feature chunks): PDP inline ≈ 23.5 + 8 + 4.2 = 35.7 KB; PDP cart ≈ 33.7 KB; home or
collection ≈ 2.5 + 4.2 = 6.7 KB; cart page ≈ 12.7 KB; checkout ≈ 12.2 KB; thank-you ≈ 7.2 KB.

Rules: no store chunk imports `src/landing/runtime/entry.ts`; the generated landing chunk's sha256 is recorded and
`qa:storefront-render` fails if a store change alters it (STO-D7; rev 4: tolerance 0 on its size too, core §H.13); any
export a store entry needs from a landing runtime module is added through a CCR that leaves the landing bundle
byte-identical (an unused export is tree-shaken). **rev 4:** store chunks may import only **pure, isomorphic** modules
outside `src/storefront/**` and `src/landing/runtime/**`: `src/lib/delivery/eta.ts` (P3), `src/lib/callcenter/window.ts`
(P4, D73) and the money / units modules already listed; `src/lib/orders/address.ts` (`cityKey`) is not imported by any
store chunk (CRIT1).

### STO-§14.2 The `pdp` entry

```ts
// src/storefront/runtime/entry-pdp.ts — IIFE (es2019), inlined at the end of <body> after the feature chunks
import { boot } from "../../landing/runtime/init";
import { analytics } from "../../landing/runtime/analytics";
import { gallery } from "../../landing/runtime/gallery";
import { tabs } from "../../landing/runtime/tabs";
import { accordion } from "../../landing/runtime/accordion";
import { video } from "../../landing/runtime/video";
import { bundles } from "../../landing/runtime/bundles";
import { units } from "../../landing/runtime/units";
import { sticky } from "../../landing/runtime/sticky";
import { countdown } from "../../landing/runtime/countdown";
import { chrome } from "./chrome";      // header, drawer, cart badge
import { bridge } from "./bridge";      // window.__sgBuy (STO-§14.3)
import { buy } from "./buy";            // cart-model buttons, sticky-bar action, city chip + delivery line
// Order matters: bundles → units → bridge → buy (the bridge reads the selection the units module maintains).
boot({ once: [analytics], bind: [gallery, tabs, accordion, video, bundles, units, sticky, countdown, chrome, bridge, buy] });
```
No `form`, `lead`, `marquee`, `parallax`, `compare` or `reveal` module: the checkout chunk owns the form, store pages use
no scroll reveal (commerce register), and the bytes go to the bridge and the buy module.

### STO-§14.3 The selection bridge and store events

```ts
// src/storefront/runtime/bridge.ts — a landing runtime Module (receives Ctx, src/landing/runtime/core.ts:84-104)
export interface SgLine { pk: string; rev: string; bundleId: string; units: UnitIn[]; extras: Record<string, string> }
export interface SgPriced {
  sub: number;                 // cents: price + deltas of one pack (Totals.subtotal with bump false, src/landing/runtime/money.ts)
  units: number;               // physical units of one pack
  label: string;               // offer label ("Duo")
  text: string;                // customer units text (src/landing/runtime/units-text.ts)
  free: boolean;               // the offer has free delivery
  contents: Content[];         // allocate() per content id (pixels)
}
export interface SgBuy {
  v: 1;
  product: { pk: string; rev: string; slug: string; name: string; thumb?: string };
  line(): SgLine;
  priced(): SgPriced | null;   // null while a required choice is missing
  check(reveal: boolean): boolean;   // validateForm on the buy box (unit controls only; delivery fields are not in it)
  on(fn: () => void): () => void;    // selection changed (bus "units" and "bundle")
}
declare global { interface Window { __sgBuy?: SgBuy } }
```
Store chunks talk through DOM `CustomEvent`s on `document` (never through globals other than `__sgBuy`):

| Event | Detail | Sent by | Heard by |
|---|---|---|---|
| `sg:view` | `{ kind, pk?, sub?, contents? }` | `pdp` (PDP), `store` (other kinds) | `store-pixels` |
| `sg:add` | `CartLine` (STO-§15.2) | `buy` | `cart` (adds, opens the sheet), `store-pixels` (AddToCart) |
| `sg:buy-now` | `CartLine` | `buy` | `cart` (hand-off to `/checkout`), `store-pixels` (AddToCart) |
| `sg:checkout-start` | `{ surface, value }` | `checkout` | `store-pixels` (InitiateCheckout) |
| `sg:lead` | `{ value }` | `checkout` | `store-pixels` (Lead) |
| `sg:order` | `{ idem, total, lines }` | `checkout` (just before the request) | WhatsApp alternative, `store-pixels` (nothing) |
| `sg:purchase` | `{ orderId, value, currency, contents, eventId }` | `store-thanks` | `store-pixels` (Purchase, once per order id) |

### STO-§14.4 `StoreRuntimeConfig` (`<script type="application/json" id="sg-config">`)

```ts
// src/storefront/runtime/config.ts (types only; built by src/lib/storefront/config.ts)
export interface StoreRuntimeConfig {
  v: 1;
  kind: StoreDocKind; mode: "live" | "preview";
  store: { key: string /* handle: storage prefix */; name: string; currency: string; locale: string; dir: "rtl" | "ltr"; market: string; tz: string };
  cv: number; ctx: string;                                   // catalog_version rendered; template page public key
  links: { home: string; cart: string; checkout: string; thanks: string; search: string; track: string };
  endpoints: { order: string; lead: string; cart: string; event: string };   // "/api/public/store/…" ("" in preview)
  money: { locale: string; symbol: string; position: "before" | "after"; decimals: number; minor: 100 };
  checkout?: {
    model: "inline" | "cart"; fields: FieldModel; phone: { country: string; prefix: string; national: string; groups: number[] };
    cities?: { v: string /* City.value, what the combobox posts and the ZoneTable key */; l: string; k: string /* folded search keys, fr|ar|en */; m?: 1 }[];   // MA: 147 entries (rev 4: rev 3's slug `s` withdrawn, CRIT1)
    /** rev 4 (CRIT1): landing's `ZoneTable` (LAN-§7.1) exactly as `zonesForCheckout(scope)` returns it, the same object as `lp-assist.dz`:
     *  `city` keyed by the posted City.value and built from the CityKey slugs on the server; absent value → `star`; `cal` carries the calendar
     *  (workdays ISO 1-7, cutoffHour, leadDays, holidays for the next 60 days), so rev 3's separate `calendar` field is withdrawn. */
    zones: ZoneTable | null;
    fallbackFee: number | null; confirmationCall: boolean /* checkout.confirmationCall; rev 3 named it callPromise */; whatsapp?: string; turnstileSiteKey?: string;
    /** rev 4 (CRIT3): operations' `EffectiveWindow` embedded as is (OPE rev 4 made it JSON-safe: `days: Record<IsoWeekday, Range[]>`,
     *  `openOverrideUntil` an ISO string, `configured`), with `closedDates` and `overrides` cut to the next 60 days; the storefront never
     *  restates its shape. Present only when `shopperPromiseAllowed(w)` (= `w.configured`, OPE OD63, STO-§8.1).
     *  The chunk computes "{when}" at view time with the bundled `nextCallableAt(now, callWindow)`. */
    callWindow?: EffectiveWindow;
    addressMode: "required" | "optional";                    // rev 3 (UX-31): landing's checkout.addressMode resolved (null → the market default), applied to the store checkout too
    limits: { lines: 20; n: 10 };
  };
  pixels: { meta?: string[]; tiktok?: string[]; snap?: string[]; ga4?: string[] };
  strings: Partial<Record<StoreStringKey, string>>;          // only the keys the page's chunks use
}
```
Config bytes count toward the document cap; the MA city list is ≈ 3.5 KB gzip in the checkout config [proposal,
measured by `qa:storefront-render`].

### STO-§14.5 Browser storage keys (prefix `sg:<handle>:` in every addressing mode)

| Key | Storage | Content | Lifetime |
|---|---|---|---|
| `sg:<h>:cart` | local | `CartV1` (STO-§15.2) | 30 days since the last change; cleared after a cart order |
| `sg:<h>:city` | local | the chosen `City.value` (rev 4: the posted value, never a slug; a typed "Autre ville" text is not stored) | 180 days |
| `sg:<h>:buynow` | session | one `CartLine` handed from the PDP to `/checkout` | until the order or the tab closes |
| `sg:<h>:co` | session | checkout field values kept across a stale answer or a back navigation (never in `localStorage`) | cleared on success |
| `sg:<h>:idem` | session | idempotency key + event id of the current attempt | cleared on success |
| `sg:<h>:lead:<idem>` | session | lead already sent | session |
| `sg:<h>:order` | session | thank-you record `{ orderId, name, totalCents, currency, lines, deliveryCents, track, wa, when?, ts }` (rev 4: amounts in cents, STO-§16.1; `when` = the ISO instant the checkout promised, STO-D45) | session |
| `sg:<h>:px:<orderId>` | session | Purchase fired | session |
| `sg:<h>:test` (rev 2) | session | the test-order token of the current session (STO-D33); read by `checkout` (payload `test`) and by `store` (query carried on in-page links) | until the tab closes or the token expires (2 h) |
| `sg:<h>:x:<e>` (R3) | local | experiment arm per visitor (landing's key, LAN-§18.5) | 60 days |
| landing module keys on the PDP | as core §C.9 (`lp:<h>:utm`, `lp-b:<productKey>`) | unchanged landing behaviour | unchanged |

Names, phones and addresses never go to `localStorage`. Every access is wrapped (`sget`/`sset` pattern,
`src/landing/runtime/core.ts:160-200`): blocked storage degrades to a working page without a remembered cart.

### STO-§14.6 Build and checks

- `scripts/build-store-assets.mjs` (S1) bundles the store entries with the same toolchain and options as
  `scripts/build-landing-assets.mjs` (IIFE, es2019, minified) into `src/storefront/generated/` (committed, like
  `src/landing/generated/`), runs in `prebuild` / `predev` after the landing build (request STO-R13), and prints the
  gzip size of each chunk.
- Budget keys `pdp 23500`, `store 2500`, `cart 6000`, `checkout 8000`, `store-pixels 4200`, `store-thanks 3000`,
  `search 5000`, `store-page 41000` join `src/landing/runtime/budgets.json` (STO-R13 accepted, core §H.13);
  `qa:storefront-render` fails above budget + 5 % (the render-check rule). **rev 4 (core ENGP-12, §H.13, §J.1):** the
  chunk budgets and the `store-page` cap are **measured by the maintainer's `render-check` harness** from
  `budgets.json.compositions["store-page"] = ["pdp", "checkout", "store-pixels", "units-matrix", "units-fields",
  "fill-steps-box"]` (R3 + `exp-head`, `exp`) with S1's fixtures in `scripts/qa/render-cases/storefront.ts`; S1 never
  edits the harness, and `qa:storefront-render` keeps only the store-document assertions of STO-§26.1. **rev 3 (ENGP-31): `store-page` is a derived
  cap.** `scripts/build-store-assets.mjs` asserts `budgets["store-page"] ≥ ceil500(Σ budgets of the heaviest set)`
  (`pdp`, `checkout`, `store-pixels`, `units-matrix`, `units-fields`, `fill-steps-box`; R3 + `exp-head`, `exp`) and fails
  the build otherwise, so the `pdp` spike (≤ 10 % once, before `store-page` is frozen) and any later chunk move rewrite
  the cap in the same CCR; rev 2's 350 B headroom against a budget still marked [proposal] is gone. R3: `exp-head` (450)
  and `exp` (1,200) on store pages raise the heaviest set to 42,300 B: STO-R26 becomes "`store-page` = the derived
  **42,500** B when the experiment chunks land" (not a hand-set 43,000).

### STO-§14.7 3G budgets per chunk (rev 2, STO-D42)

Profile: Playwright msedge, 360 × 740 and 390 × 844, DPR 2, CPU 4× slower, 1.6 Mbps down / 750 kbps up / 150 ms RTT
(the "cheap Android on 3G" profile of STO-§21.1). Every number is a budget `qa:storefront-perf` asserts per kind
fixture; the measured value is printed next to it.

| Chunk | gz bytes | Parse + boot at 4× CPU | Main-thread tasks | Loads | Must not |
|---|---|---|---|---|---|
| `store` | ≤ 2,500 | ≤ 20 ms | none > 16 ms | inline, end of body | touch the DOM before `DOMContentLoaded`; register `unload` |
| `pdp` | ≤ 23,500 | ≤ 45 ms (modules boot in order: analytics once, gallery, tabs, accordion, video, bundles, units, sticky, countdown, chrome, bridge, buy) | none > 50 ms; first `__sgBuy.priced()` ≤ 10 ms after boot | inline, end of body | reflow in a loop (reads batched in one rAF, `src/landing/runtime/sticky.ts` pattern) |
| `cart` | ≤ 6,000 | ≤ 25 ms | re-price request only when `cv` differs or a line is > 10 min old | inline on `/cart` and PDP (`cart` model) | block the add animation on the network |
| `checkout` | ≤ 8,000 | ≤ 30 ms; city combobox filter ≤ 8 ms per keystroke over 147 cities; `etaWindow` + `storeDeliveryFee` ≤ 2 ms per city change | keypress-to-paint ≤ 50 ms p95 | inline on `/checkout` and PDP (`inline` model) | load Turnstile before the first interaction with a field |
| `store-pixels` | ≤ 4,200 | ≤ 10 ms of our code; vendor loaders after `load` + `requestIdleCallback` (≤ 2 s cap) | vendor scripts are off the critical path | inline, deferred execution | fire before consent on EU stores (ST-21) |
| `store-thanks` | ≤ 3,000 | ≤ 15 ms | fills the summary from `sessionStorage` in one frame | inline on `/checkout/merci` | fetch anything |
| `search` (R3) | ≤ 5,000 | ≤ 20 ms; index fetch ≤ 12 KB gz, after idle | ranking ≤ 8 ms per keystroke for 500 products | after idle, when the store has ≤ 500 products | block the header |
| page cap `store-page` | ≤ 41,000 (R3: the derived 42,500; rev 4 corrects rev 2's 43,000, ENGP-31) | Σ boot ≤ 90 ms on the worst PDP | — | — | — |

Critical bytes per kind (HTML gz + LCP image + fonts, the bytes before LCP): PDP ≤ 300 KB (HTML ≤ 90 KB incl. ≤ 36 KB
JS, LCP image ≤ 120 KB AVIF, ≤ 2 font files ≤ 80 KB), home ≤ 220 KB, collection ≤ 220 KB (first card row eager, the
rest lazy), cart and checkout ≤ 130 KB (no LCP image beyond thumbnails). On the profile, 300 KB transfer ≈ 1.5 s plus
three round trips (HTML, image, font) ≈ 0.45 s, so LCP ≤ 3.0 s lab leaves ≈ 1 s for server time, parse and paint; the
server budget is 120 ms cold / 5 ms warm (STO-§7.3). INP ≤ 200 ms (no handler > 16 ms, no boot task > 50 ms); CLS ≤
0.05 (every box reserved, STO-§21.3).

---

## STO-§15 Cart and one-page COD checkout (ST-05, ST-06, R-D45)

### STO-§15.1 The `checkout.store` block

```ts
// src/lib/settings/keys/checkout-store.ts (merged into the `checkout` key by the registry, request STO-R16)
export const CheckoutStore = z.object({
  buyModel: z.enum(["inline", "cart"]).optional(),           // unset until the store first enters store/both mode (STO-D8 sets it)
  inlineAlsoCart: z.boolean().default(false),                // inline model: a quiet "Ajouter au panier" link for multi-product baskets
  fallbackFeeCents: z.number().int().min(0).max(1_000_000).nullable().default(null),   // NULL = not set (never invented)
  whatsappAlternative: z.boolean().default(true),            // "Commander sur WhatsApp" under the submit (needs the store number)
  reserveAt: z.enum(["confirmed", "order"]).default("confirmed"),   // R3 (0007 schema bump): when the soft hold is taken (STO-§5.6, rev 3 OPS-30)
});
```
Writes: `checkout.write` (owner, admin), audit `store.settings.updated` (key `checkout`), `catalog_version` bump. The R1
fields of `checkout` (`zonesEnabled`, `calendar` incl. `confirmationLeadDays`, market field model, **`confirmationCall`**
(rev 4: the real name; rev 3 wrote `callPromise`), **`addressMode: "required" | "optional" | null`** (rev 3, UX-31;
landing's key in core §D.10, `null` = the market default, `required` for MA, EU and INTL; `optional` renders the address
behind "Ajouter une adresse" on both the landing form OF2 and the store checkout)) are landing.md's and read here as
given; `checkout-store.ts` never redefines them (core §K.4 S1 row). The calling **hours** are
not a checkout field: they are `ops.callingWindow` (STO-D45).

### STO-§15.2 The cart

```ts
// src/storefront/runtime/cart-store.ts
export interface CartLine {
  id: string;                         // 8 hex, local
  pk: string; rev: string; slug: string; name: string; thumb?: string;
  bundleId: string; units: UnitIn[]; extras: Record<string, string>;
  n: number;                          // 1..10
  sub: number;                        // cents per pack, as priced by the PDP bridge (or the last re-price)
  free: boolean; label: string; text: string; contents: Content[];
  at: number;                         // added / last priced (epoch ms)
}
export interface CartV1 { v: 1; cv: number; at: number; lines: CartLine[] }
export function addLine(cart: CartV1, line: Omit<CartLine, "id" | "at">): { cart: CartV1; merged: boolean } | { full: true };
export function setQty(cart: CartV1, id: string, n: number): CartV1;      // clamps 1..10
export function removeLine(cart: CartV1, id: string): CartV1;
export function cartSubtotal(cart: CartV1): number;                         // Σ n × sub (cents)
```
- **Merge**: same `pk`, `bundleId`, and canonical JSON of `units` and `extras` → `n += 1` (capped at 10).
- **Limits**: 20 lines; at 20 the add answers `full` and the sheet says "Votre panier est plein (20 articles max)."
- **Cross-tab**: the `storage` event refreshes the badge and an open cart page.
- **Never trusted**: the server re-prices every line at checkout (STO-§16).

### STO-§15.3 Cart sheet and cart page

- **Sheet** (PDP, `cart` model, after "Ajouter au panier"): bottom sheet on < 900 px (max-height 85 vh, drag handle
  is decorative only), side sheet from inline-end on ≥ 900 px (400 px); `role="dialog"`, `aria-modal`, labelled by its
  heading "Ajouté au panier"; shows the added line (thumb, name, label and options text, price), the cart subtotal and
  two actions: "Commander" (→ `/checkout`) and "Continuer mes achats" (close); Escape and the scrim close; focus returns
  to the button that opened it. Opening animation: 180 ms translate + opacity, none under reduced motion.
- **Cart page** (`/cart`): server HTML = the template with `cartView` skeleton rows (same heights as real rows); the
  `cart` chunk fills the lines: thumb 64 px, name (link to the PDP), options text, per-pack price, stepper (− n +, buttons
  labelled "Diminuer la quantité de {name}" / "Augmenter…", min 1, max 10), line total, "Retirer"; summary: subtotal,
  delivery ("calculée à l'étape suivante", or the store range when zones are on), "Passer la commande"; empty state
  "Votre panier est vide." + "Voir les produits".
- **Re-price** when the page's `cv` ≠ `cart.cv` or a line is older than 10 minutes: `POST /api/public/store/cart`

```ts
// request
{ v: 1, lines: { pk: string; rev: string; bundleId: string; units: UnitIn[]; extras: Record<string, string>; n: number }[] }   // 1..20
// response
type CartPriceResponse =
  | { ok: true; cv: number; lines: { i: number; state: "ok" | "changed" | "unavailable" | "removed"; sub?: number; rev?: string; name?: string; slug?: string; thumb?: string; label?: string; text?: string; free?: boolean }[] }
  | { ok: false; error: "invalid" | "rate_limited" | "unavailable" };
```
  `changed` → the line takes the new `sub` and `rev` and shows "Le prix de {name} a changé : {old} → {new}."; `unavailable`
  (option or offer out of stock, selection no longer valid) and `removed` (product not active) → the line leaves the
  cart with "{name} n'est plus disponible et a été retiré."; notices go to one `aria-live="polite"` region. The endpoint
  never writes anything.

### STO-§15.4 Checkout page and the inline block

| Element | Checkout page (`/checkout`) | Inline block (PDP, `inline` model) |
|---|---|---|
| Lines | the cart, or the buy-now line (`?b=1` reads `sg:<h>:buynow`; the cart is untouched) | the PDP line, live from `__sgBuy` |
| Summary | mobile: a collapsed bar "Afficher le récapitulatif · {total}" (disclosure); ≥ 900 px `split`: sticky summary column | none (the buy box is right above) |
| Title | "Finaliser la commande" | "Commander maintenant" |
| Fields | the store field model (STO-§15.5) | same |
| Delivery row | "Livraison ({city})" amount or "Offerte"; before a city: the store range | same |
| Totals | subtotal, delivery, (R3: coupon row), "Total à payer à la livraison" | same |
| Under the submit | COD statement, the call-promise line when `confirmationCall` (**rev 3, STO-D45; rev 4 CRIT3:** "Un conseiller vous appelle {when}" with `{when}` = `nextCallableAt(now, cfg.checkout.callWindow)` computed by the chunk **at view time** and on every focus of the page after 5 min idle, rendered as "aujourd'hui dès 09:30" / "demain dès 09:30" / "{weekday} dès 09:30" in the store timezone; the server HTML and a page without `callWindow` carry the bare promise; the instant is written into the thank-you record so the thank-you repeats the same `{when}`), WhatsApp alternative when on, privacy line | same |
| Header | minimal (logo, COD pill, WhatsApp) | the store header |
| `surface` | `cart` or `buy_now` | `pdp` |

Submit label "Confirmer ma commande"; while sending "Envoi en cours…" with `aria-busy` on the form and the button width
kept (no layout shift).

**Phone ergonomics (rev 3, UX-37; the same numbers landing's OF4 adopts, STO-R37):** every input and the city combobox
are **52-56 px tall** with **16 px** text (Safari zooms on focus below 16 px and breaks the fold), 12 px gap between
fields, the label 13 px / 500 above the control (never a placeholder as label); on a submit error the summary
(`role="alert"`) is scrolled into view **above the first invalid field** (`scrollIntoView({ block: "center" })`) and
receives focus; `enterkeyhint` per STO-§15.5. **rev 4 (UX-37 round 2; LAN OF13, LAN R21 accepted per core §Q.8): no
sticky submit row.** Rev 3 made the submit row sticky while the form was ≥ 50 % in view with the keyboard closed;
landing rejected the same rule with a reason that holds here too: the default checkout state fits in about one phone
screen (minimal header 56 px, the summary collapsed to one 48 px bar, the title 40 px, 4 MA fields with their labels
≈ 350 px (56 px controls, 22 px label rows, 12 px gaps), the WhatsApp checkbox 32 px, the delivery and total rows ≈ 80 px,
the 56 px submit and the insets: the submit's bottom ≈ 720 px, inside the 844 px screen), so the button is reachable without a
second fixed layer (DB R7) and without a `visualViewport` script the checkout must not depend on. The inline block on
the PDP follows the same rules; the sticky buy bar already scrolls to `#order`. `qa:storefront-e2e` asserts the
default checkout state's submit bottom ≤ 844 px at 390 × 844 for an MA fixture with the summary collapsed, in ar and fr.

### STO-§15.5 Field model per market (R-D45)

| Market | Fields (order) | `autocomplete` | Required |
|---|---|---|---|
| MA | name · phone · city (combobox) · address (one line, "Quartier, rue, repère") · note (hidden unless the store turns it on) | `name` · `tel` · `address-level2` · `address-line1` · `off` | name, phone, city, address when `checkout.addressMode = "required"` (default; **rev 3, UX-31:** `optional` hides the one-line address behind "Ajouter une adresse" exactly like the landing form's OF2, so a `both` seller collects the same data on both surfaces and the confirmation call never has to ask for the quartier on one of them) |
| FR, BE, ES, DE, IT, NL, PT | name · phone · street · postal code · city (text) · e-mail (optional) · note (optional) | `name` · `tel` · `address-line1` · `postal-code` · `address-level2` · `email` · `off` | name, phone, street, postal code, city |
| INTL | name · phone (international) · address · city · postal code (optional) · e-mail (optional) | as above | name, phone, address, city |

- Phone: `type="tel"`, `inputmode="tel"`, `dir="ltr"` (also inside RTL pages), `enterkeyhint="next"`; the last field
  `enterkeyhint="send"`.
- Postal codes: FR, ES, DE, IT `^\d{5}$`; BE `^\d{4}$`; PT `^\d{4}-\d{3}$`; NL `^\d{4} ?[A-Za-z]{2}$` (standard
  formats; reviewed again by the EU pack, ST-21). `inputmode="numeric"` except NL.
- Storage on the order (no new column): EU `city` = "{postal} {city}", `address` = street; v3 also keeps `postal` in
  `items.contact.postal`.
- Server validation reuses `cleanInput`, `validName` (`src/lib/orders/validate.ts:63-71`), `normalizePhone(raw,
  store phone country)` (`src/lib/markets/phone.ts:29`) and `findCity` (`src/lib/markets/info.ts:138`); messages reuse
  the landing keys (`form.errName`, `form.errPhone`, `form.errCity`, `form.errRequired`).

### STO-§15.6 Phone input

- Formatting as typed from `PhoneSpec` groups (MA and FR `06 12 34 56 78`: groups [2, 2, 2, 2, 2]; others: no
  grouping), caret kept in place; Eastern Arabic and Persian digits folded to ASCII as typed; `+212` and `00212`
  accepted (the server normalises to E.164).
- Inline state: a quiet check mark + "Numéro valide" (screen-reader text) once the national pattern passes; the error
  only after blur or submit.
- "Ce numéro est sur WhatsApp" checkbox, checked by default in MA (`wa` in the payload; agents see it).

### STO-§15.7 City combobox (MA)

- No-JS fallback: a native `<select>` of the 147 cities (majors first, "Autre ville" last), server-rendered.
- With JS: an input with `role="combobox"`, `aria-autocomplete="list"`, a listbox of ≤ 8 matches; on focus (mobile) the
  8 largest cities appear as chips; matching = folded prefix on the fr, ar and en labels (`foldText`, STO-§13.3) +
  `arabiziToLatin` for Latin input ("tanja", "طنجة", "Tanger" → Tanger); arrows, Enter, Escape; the chosen value posts
  the canonical `City.value` (what `orders.city` stores). **rev 3 (OPS-1, STO-D43), rewritten in rev 4 (CRIT1):** the
  zone lookup in the browser is `zones.city[v] ?? zones.star` over landing's `ZoneTable` (keyed by the posted value,
  built from the slugs on the server); the server runs `cityKey(payload.city)` before `zoneForCity`, so "Fès" picked in
  the form finds the zone stored as `"fes"` on both sides without the browser ever computing a slug.
- "Autre ville" reveals a text input "Votre ville" (required); the value is absent from `zones.city` in the browser
  and its server key is `null` (`cityKey("Autre")`), so the delivery
  line uses the `*` zone or the fallback fee; on the server `normalizeCity(text, market, aliases)` (OPE-§10.1) may still
  map the typed text to a real key for `orders.city_key` and the zone (exact or alias only, never fuzzy), in which case
  the server's fee may differ from the shown `*` fee and the order answers `stale` with the real delivery (STO-§16.2).
- Choosing a city updates the delivery row, the ETA and the total at once (no request).

### STO-§15.8 ETA as dates (ST-17, raised to R2)

The store consumes landing's engine (`src/lib/delivery/eta.ts`, P3, R1; LAN-§7.2) with its exact signatures (rev 2,
STO-D17):

```ts
export function localParts(now: Date, tz: string): { ymd: string; hour: number; isoWeekday: number } | null;
export function addWorkingDays(ymd: string, n: number, cal: StoreCalendar): string;
export function etaWindow(cal: StoreCalendar, zone: { etaMinDays: number; etaMaxDays: number }, now: Date): EtaWindow | null;
export function etaText(w: EtaWindow | null, zone: { etaMinDays: number; etaMaxDays: number }, locale: "ar" | "fr" | "en", dateLocale: string, now: Date): string;
// StoreCalendar = { tz, workdays, cutoffHour, holidays } from the `checkout` setting (LAN-§2.3); EtaWindow = { from: "YYYY-MM-DD", to, minDays, maxDays }
```

Start day = today when it is a working day and before `cutoffHour`, else the next working day; `from` / `to` = start +
`etaMinDays` / `etaMaxDays` working days skipping holidays; text: one date when `from === to`, the day range when `to`
is more than 21 days away, otherwise "entre {from} et {to}" formatted with `Intl.DateTimeFormat(dateLocale, { weekday:
"short", day: "numeric", month: "short", timeZone: "UTC" })` on the `ymd` at 12:00 UTC; `dateLocale` = `cfg.money.locale`
(carries the digit choice, e.g. `ar-MA` with Latin digits); no dash inside the range; every date carries "(estimation)"
/ "(تقريبي)" / "(estimated)": "Livraison estimée entre mer. 29 et jeu. 30 oct. (estimation)" · "التوصيل المتوقع بين
الأربعاء 29 والخميس 30 أكتوبر (تقريبي)" · "Estimated delivery between Wed 29 and Thu 30 Oct (estimated)". A zone without
ETA days, or a store without a calendar, shows the day range ("en 2 à 4 jours ouvrés") or nothing. The server uses
`zoneLineFor(scope, cityKey: CityKey | null, at?, opts?: { stage })` (`ZoneLine.etaText` per locale; rev 4: landing's
P0 signature, `stage: "before_call"` (default, applies `cal.leadDays`) for the order confirmation text and the thank-you
expectation block, `"after_call"` with `at = confirmed_at` for the tracking page, OPS-12) so the shopper reads one
promise everywhere (`test:catalog` asserts PDP, cart, checkout and `zoneLineFor` texts are identical for one city and
instant at the `before_call` stage).

### STO-§15.9 Delivery fee rule (STO-D10)

```ts
// src/lib/catalog/delivery.ts (isomorphic, pure; used by the server, the checkout chunk and the cart summary)
import type { DeliveryZoneRow } from "@/lib/delivery/types";   // landing's row shape (LAN-§7.1): id, name, cities, feeCents, freeFromCents, etaMinDays, etaMaxDays, notServed, note, position
export type DeliveryRule = "free_offer" | "free_threshold" | "zone" | "fallback" | /* R3 */ "coupon";
/** rev 4 (CRIT1): the three fields the fee rule reads, so the server (a DeliveryZoneRow) and the browser (a ZoneTable entry) feed one function */
export type ZoneFee = Pick<DeliveryZoneRow, "feeCents" | "freeFromCents" | "notServed"> & { zoneId?: string; zoneName?: string };
export function zoneFeeOfRow(z: DeliveryZoneRow): ZoneFee;                                        // server
export function zoneFeeOfTable(t: ZoneTable, value: string): ZoneFee | null;                       // browser: t.zones[t.city[value] ?? t.star] mapped ({ fee, freeFrom, ns } → cents fields), null when neither exists
export type DeliveryResult = { ok: true; cents: number; rule: DeliveryRule; zone: ZoneFee | null } | { ok: false; reason: "not_served" | "not_set" };
export function storeDeliveryFee(i: { zone: ZoneFee | null; fallbackFeeCents: number | null; subtotalCents: number; allLinesFree: boolean }): DeliveryResult;
// rev 2: the rev 1 `ZoneLine` shape of this file is withdrawn; `ZoneLine` is landing's display type (zoneId, zoneName, notServed, eta, etaText, feeCents)
```
1. `allLinesFree` (every line's offer has `freeShipping`) → `{ cents: 0, rule: "free_offer" }`.
2. `zone?.notServed` → `{ ok: false, reason: "not_served" }`.
3. `zone?.freeFromCents != null && subtotalCents >= zone.freeFromCents` → 0, `free_threshold`.
4. `zone?.feeCents != null` → that fee, `zone`.
5. `fallbackFeeCents != null` → that fee, `fallback`.
6. else `{ ok: false, reason: "not_set" }` (the checkout template cannot be published in this state, STO-§23.6; if it
   happens anyway, the server answers `unavailable`).

`zone` comes from `zoneFeeOfRow(zoneForCity(await listZones(scope), key))` with **`key = cityKey(payload.city)`**
(operations' slug, `CityKey | null`; rev 3, STO-D43) (landing's pure matcher over the cached rows, LAN-§7.1, whose
`cities` hold the same slugs; the STO-R19 stubs `zonesForCheckout` / `zoneLineFor` are the same module) on the server,
and from **`zoneFeeOfTable(cfg.checkout.zones, value)`** in the browser (rev 4, CRIT1: landing's `ZoneTable`, keyed by
the posted value; rev 3's `zones.c[entry.s]` is withdrawn); both resolve "Autre ville" (`null` / absent) and unknown
cities to the `*` zone when one exists, and `test:catalog` asserts `zoneFeeOfTable(zonesForCheckout(fixture), v)` =
`zoneFeeOfRow(zoneForCity(rows, cityKey(v)))` for every `City.value` of `scripts/qa/fixtures/city-key.json`. The browser and the server run the same `storeDeliveryFee` on the same inputs, so the delivery row the
shopper saw (`dl`) equals the server's except after a zone edit, which bumps `catalog_version` and is answered `stale`
(STO-§16.2 step 14), or after the server's `normalizeCity` mapped an "Autre ville" text to a real key (also `stale`,
with the real delivery).

### STO-§15.10 Submit flow and states

1. First interaction: `idem` (uuid v4) and `eventId` created and kept in `sg:<h>:idem`; `form_start` beacon; event
   `sg:checkout-start`; the test token of the session, when any (`sg:<h>:test`, STO-D33), is attached to every v3 body
   as `test` and the form shows the "Commande test : non comptée" banner.
2. Client validation with the server's rules; on submit, an error summary at the top (`role="alert"`, links to each
   field) and focus on the first error; each field error is linked with `aria-describedby`.
3. Turnstile token when `turnstileSiteKey` is set (wait ≤ 12 s, the landing value).
4. `sg:order` event, then POST v3 (timeout 15 s, one retry on a network error with the same `idem`).
5. Answers:
   - `ok` → write `sg:<h>:order`, clear the cart (`cart` surface) or `sg:<h>:buynow`, `location.assign(thanks + "?o=" +
     orderId)`.
   - `ok` with `duplicate` (same `idem` already stored) → same as `ok` (a retried request never creates a second order).
   - `stale` → apply each line verdict (new `subCents`, removed lines) and the answered `deliveryCents`, recompute the
     total, banner "Les prix ont été mis à jour. Vérifiez votre total puis confirmez.", submit label "Confirmer avec le
     nouveau total"; the next submit sends the new `ls`, `rev`, `dl` and `st`. **rev 3 (ENGP-15):** `stale` also comes
     back when only `st` or `dl` differed with every line `ok` (a bridge bug, a tampered body, a zone edit, an "Autre
     ville" text the server mapped to a real city): the checkout shows the server's delivery and total and asks to
     confirm; it never learns of a silently corrected total because there is none.
   - `invalid` → field and line errors; `not_served` → the city field error "Nous ne livrons pas encore à {city}." +
     the WhatsApp alternative.
   - `rate_limited`, `blocked`, `unavailable`, `server`, network failure after the retry → "Une erreur est survenue.
     Réessayez, ou commandez sur WhatsApp." with the WhatsApp alternative.
6. Preview mode validates and shows "Aperçu : la commande n'est pas envoyée." without sending.

### STO-§15.11 Abandoned-checkout leads (LP-06 inbox, landing.md)

Once the phone is valid and after 1.2 s idle, or on `pagehide`, one keepalive POST to `/api/public/store/lead` per
`idem`:

```ts
export const LeadPayloadV3 = z.object({
  v: z.literal(3), kind: z.enum(["form", "whatsapp"]).default("form"),   // rev 2: "whatsapp" = a server-priced order intent (STO-§15.13)
  ctx: Key, idem: z.string().regex(/^[a-f0-9-]{36}$/),
  phone: S(24).optional(),                             // required for kind "form"; absent for "whatsapp" (leads.phone is NULL-able, core §D.2)
  name: S(80).optional(), city: S(80).optional(),
  lines: z.array(z.unknown()).max(20).optional(),     // tolerant: each parsed with LineIn.omit({ ls }).safeParse, bad entries dropped
  utm: Utm.default({}), locale: z.string().max(5).optional(),
  test: z.string().max(80).optional(),                 // the session's test token (STO-D33) → leads.is_test
});
```
Stored through `upsertLead` with `page_id` NULL (STO-R9 accepted, core §D.2 0006) and `sel = { v: 3, lines: [{ productId,
bundleId, units, n }] }` (`leads.sel`, core §D.2 0005); `kind = 'form'` always answers `{ ok: true }` (no oracle); the
`resolveTestToken` call sets `is_test` (lint L12). An order with the same `idem` marks the lead `converted`, an order
from the same phone within 7 days `recovered` or `converted` (landing's attribution rule LD12, run by landing's order
hook; v3 orders reach it through the shared `createOrderRow`).

### STO-§15.12 Store thank-you (`/checkout/merci`, STO-D16)

- Server HTML: store minimal header, the landing.md LP-04 blocks (markup from `src/landing/thankyou/**`, filled by
  data attributes), an empty summary skeleton, "Voir la boutique" link; no order data in the HTML. **rev 3 (UX-38):** the
  store thank-you renders the LP-04 blocks **without** `.lp-ty__aurora` (mesh / aurora + grain is the generated-UI
  signature the owner banned, rubric §0.D, §9.A): its one colour moment is a flat accent slab, or a single radial tinted
  from the first line's product photo at ≤ 10 % alpha, under the transactional register of STO-§8.4 ("no decoration");
  **rev 4:** that element is landing's `.lp-ty__tint` (LAN LD38, the same class the LP-04 blocks carry, core D60 rev 3),
  so render-check's "0 `.lp-ty__aurora` / `adm-aurora` / `adm-grain`" assertion covers the store thank-you unchanged.
  The `{when}` of the expectation block is the instant the checkout computed with `nextCallableAt(now, w)` and wrote
  into `sg:<h>:order.when` (STO-D45, rev 4: `store-thanks` bundles no window code and repeats exactly what the checkout
  promised; absent `when` → the bare promise).
- `store-thanks` reads `sg:<h>:order` (its `orderId` must equal `?o=`; otherwise the page shows the generic "Merci,
  commande reçue" with the order number from the URL and no amounts), fills the lines, total and delivery, sets the
  WhatsApp confirm link from the server-formatted `wa` text (`wa.me/<store digits>?text=`), the tracking link from
  `track` (signed path, landing.md LP-05), and dispatches `sg:purchase` once (`sg:<h>:px:<orderId>`).
- No upsell in R2 (STO-D9); R3 may add the landing.md LP-10 cross-store upsell here.

### STO-§15.13 WhatsApp alternative

**rev 2 (STO-D34, rf §1.11, LAN LD13): the message is priced by the server, never composed in the browser.**
"Commander sur WhatsApp" (shown when `whatsappAlternative` and a store number exist; on the PDP in both buy models, in
the cart sheet and page, and under the checkout submit):

1. The `checkout` (or `cart`) chunk posts `POST /api/public/store/lead` with `kind: "whatsapp"`, the lines (`LineIn`
   without `ls`), `city` when chosen, `utm`, `locale` and the test token (4 s timeout, one intent per page view per 30 s;
   buckets `p:wa:ip` 30/10 min, `s:<sid>:wa:ip` 10/10 min, core §E.8).
2. The server resolves every key to one store (else `invalid`), checks `take_orders` (else `unavailable`), **re-prices
   every line** with `priceLine` (STO-§16.3) and computes the delivery row with `storeDeliveryFee` for the chosen city
   (or "livraison selon la ville" when none), inserts a `leads` row (`kind = 'whatsapp'`, `phone` NULL, `ref` =
   `WA-` + 6 Crockford chars unique per store with 3 retries, server uuid `idem`, `sel` v3, `total_cents`, `utm`,
   `is_test`, `status = 'new'`; `page_id` NULL, `version_id` NULL for store intents), and answers `{ ok: true, wa: {
   ref, number, text } }`. Lines that no longer resolve are listed "à confirmer" in the text and priced at the offer's
   real "from" (LAN-§11.4 rule); unavailable lines are named, never priced.
3. The text = the store's `wa_order` template when customised (vars `{lines}` `{total}` `{delivery}` `{ref}`
   `{options_to_confirm}` `{store}`; landing's `message_templates` kind, LAN-§2.3), else the store composer
   (`composeStoreWaMessage`, `src/lib/catalog/wa-text.ts`, pure): one line per cart line (customer text of each pack,
   `n ×`), the delivery row, the total, the reference; ≤ 1,000 characters, whole lines dropped from the end with
   " … (+{n} articles)" (OFFERS §G.5 rule); `number` = `store.whatsapp` digits.
4. The browser opens `https://wa.me/<number>?text=<text>` (new tab; same-tab inside in-app browsers, the
   `entry-whatsapp.ts` rule) and shows "Votre message est prêt dans WhatsApp · Réf. WA-7K3Q9X". Any error or timeout
   opens the plain `wa.me` link with the product names only (never a price).
5. In the admin the intent appears in the Leads inbox (kind WhatsApp, ref, phone empty); ⌘K resolves a typed `WA-…`;
   **Convert** opens the manual-order sheet in its **catalog mode** prefilled from `sel` (v3 lines) and creates through
   **`createManualOrderV3(ctx, { lines, customer, confirmed, fromLead: { leadId }, idem })`** (STO-§16.9, rev 3
   OPS-15; rev 2 pointed at the v2-only `createManualOrder`, which accepts a `pageId` and a payload v2 selection and
   could not take a v3 cart); the order has `source = 'whatsapp'` (core D42) and re-prices on the server with
   `priceLine`.

Acceptance: the text total equals `orderTotals` for the same lines on the `duo`, `tshirt` and `colors` fixtures
(100 %); the request schema has no price field (type test), so a tampered body cannot change the total; 50 parallel
intents in one store yield 50 distinct refs; a ref of store A is not found from store B; a test session's intent has
`is_test = 1`; the fallback link opens when the API fails or exceeds 4 s.

---

## STO-§16 Order payload v3 and server re-pricing (ST-05, ORD-19, ORD-20, LND-33)

### STO-§16.1 Contract

```ts
// src/lib/orders/contract-v3.ts — written by the maintainer in the R2 contract step from this section (core §K.4);
// src/lib/orders/contract.ts (v1/v2) is not touched.
import { UnitIn, Utm } from "./contract";
const Key = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
const Id = z.string().regex(/^[A-Za-z0-9_-]{2,40}$/);
const Ver = z.string().regex(/^[A-Za-z0-9]{26}$/);
const S = (n: number) => z.string().trim().max(n);

export const LineIn = z.object({
  pk: Key,                                                    // products.public_key
  rev: Ver,                                                   // products.rev the line was priced with
  bundleId: Id,
  units: z.array(UnitIn).max(20).default([]),
  extras: z.record(Id, z.string().max(240)).default({}).refine((x) => Object.keys(x).length <= 4),
  n: z.number().int().min(1).max(10).default(1),
  ls: z.number().int().min(0).max(1_000_000_000),            // line subtotal shown: n × (price + deltas), cents
});
export const OrderPayloadV3 = z.object({
  v: z.literal(3),
  surface: z.enum(["pdp", "cart", "buy_now"]),
  ctx: Key,                                                   // pages.public_key of the template the checkout ran on
  idem: z.string().regex(/^[a-f0-9-]{36}$/),
  eventId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  lines: z.array(LineIn).min(1).max(20),
  cv: z.number().int().min(0),                                // stores.catalog_version the page was rendered with
  dl: z.number().int().min(0).max(100_000_000),               // delivery shown, cents
  st: z.number().int().min(0).max(1_000_000_000),             // total shown, cents
  name: S(80).pipe(z.string().min(2)), phone: S(24).pipe(z.string().min(6)),
  city: S(80).optional(), address: S(240).optional(), postal: S(12).optional(), note: S(300).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  wa: z.boolean().default(true),
  website: z.string().max(0).optional().or(z.literal("")),   // honeypot
  t: z.number().int().min(0).max(86_400_000),
  utm: Utm.default({}), fbp: S(200).optional(), fbc: S(500).optional(), ttp: S(200).optional(),
  ref: S(500).optional(), locale: z.string().max(5).optional(), cf: z.string().max(2048).optional(),
  coupon: z.string().regex(/^[A-Za-z0-9-]{3,32}$/).optional(),   // R3 (ST-14); ignored before
  test: z.string().max(80).optional(),                           // rev 2: the session's test token (STO-D33); verified with resolveTestToken, never trusted as a flag
});
export type OrderPayloadV3 = z.infer<typeof OrderPayloadV3>;

/** `l.<i>` line-level codes; nested keys reuse the v2 unit keys under the line prefix. */
export type LineFieldKey = `l.${number}` | `l.${number}.n` | `l.${number}.bundleId` | `l.${number}.u.${string}` | `l.${number}.s.${string}` | `l.${number}.x.${string}`;
export type OrderFieldErrorsV3 = Partial<Record<"name" | "phone" | "city" | "address" | "postal" | "email" | "coupon", string>> & { [k: LineFieldKey]: string | undefined };
export function parseOrderPayloadV3(raw: unknown): { ok: true; data: OrderPayloadV3 } | { ok: false; fields: OrderFieldErrorsV3 };

/** rev 3 (ENGP-27): every amount in a v3 response is an INTEGER IN CENTS, named with the `Cents` suffix; no decimal money anywhere in v3 JSON (v2 mixed units). */
export interface LineVerdict { i: number; state: "ok" | "changed" | "unavailable" | "removed"; subCents?: number; lineCents?: number; rev?: string; label?: string; text?: string }
export type OrderResponseV3 =
  | { ok: true; orderId: string; totalCents: number; deliveryCents: number; currency: string; lines: { i: number; subCents: number; lineCents: number }[]; track?: string; wa?: string; duplicate?: true }
  | { ok: false; error: "invalid" | "stale" | "not_served" | "rate_limited" | "blocked" | "unavailable" | "server"; fields?: OrderFieldErrorsV3; lines?: LineVerdict[]; deliveryCents?: number; totalCents?: number };
```
Field error values: `required`, `invalid`, `unavailable`, `too_long`, `duplicate` (v2 vocabulary) and, for `l.<i>`,
`changed` / `removed`. Unknown keys in the body are stripped (forward compatibility, like v2). **Units (rev 3):** the
request already carries cents (`ls`, `dl`, `st`); the response now does too. The conversion to the decimal
`orders.total` / `subtotal` / `shipping` columns happens **once**, at storage (STO-§16.4: `cents / 100`), and the
thank-you record `sg:<h>:order` stores cents (`store-thanks` formats with `money.minor = 100`). `CartPriceResponse.sub`
(STO-§15.3) is already cents and keeps its name for the shipped `cart` chunk.

### STO-§16.2 The order endpoint, step by step (`src/app/api/public/store/order/route.ts` → `src/lib/catalog/order-v3.server.ts`)

| # | Step | Failure answer |
|---|---|---|
| 1 | POST only; body ≤ 48 KB; JSON; `parseOrderPayloadV3` | 400 `invalid` with fields |
| 2 | `burstLimit` + `p:api:order:<ipHash>` (core §E.8) | 429 `rate_limited` |
| 3 | Resolve every `pk` with `resolveProductKey` and `ctx` with the page-key resolver (request STO-R1); all must belong to one store | 400 `invalid` (generic, nothing written) |
| 4 | Store state (`take_orders`), mode (`storefront` for `pdp`, `cart` for `cart`/`buy_now`), entitlement | 409 `unavailable` |
| 4b | **Test session** (rev 2): `test = resolveTestToken(store, payload.test).test` (core §E.2, pure, store-bound; lint L12). True → the order is created with `is_test = 1`, flag `test`, `sheet_status = 'disabled'`, no CAPI / Telegram items (except "[TEST]" when the store asks), no `bumpOrderStats`, no customer counters beyond `test_count`, and risk scoring still runs (the demo needs the queue, rf §4). Store A's token on store B is `false` | — |
| 5 | `checkOrigin(storeHosts(store))`, `Sec-Fetch-Site: cross-site` refused (core §C.9) | 403 `blocked` |
| 6 | `s:<sid>:order:ip:<ipHash>`, `s:<sid>:orders` flood breaker | 429 `rate_limited` |
| 7 | Honeypot (`website` non-empty → decoy success like v2 `decoyResponse`, nothing stored); `t` < 1,500 ms → risk flag | — |
| 8 | Turnstile when the storefront embeds a site key (decided from settings, not from stored HTML; the landing check `versionEmbedsSiteKey` does not apply) | 400 `invalid` field `cf` |
| 9 | Idempotency: an order of this store with this `idem` exists → `ok` with its id and `duplicate: true` | — |
| 10 | Delivery fields per market (STO-§15.5) | 400 `invalid` with fields |
| 11 | Per line (STO-§16.3) | collected verdicts |
| 12 | Any verdict ≠ `ok` → 409 `stale` with every verdict and the current delivery; fresh-line field errors → 400 `invalid` | as stated |
| 13 | `subtotal = Σ lineCents`; R3 coupon (STO-§19.1); `key = cityKey(payload.city)` (operations' slug or `null`; for an "Autre ville" text, `normalizeCity` exact / alias may give a real key, rev 3 STO-D43), `zone = zoneForCity(await listZones(scope), key)`, `storeDeliveryFee(...)`; `zoneLineFor(scope, key)` for the confirmation texts | `not_served` → 400 with `city`; `not_set` → 409 `unavailable` |
| 14 | `total = subtotal − discount + delivery`; **rev 3 (ENGP-15):** `dl ≠ delivery` **or** `st ≠ total` → 409 `stale` with every line verdict (`ok` lines included, with their `subCents`), the server's `deliveryCents` and `totalCents`, **whatever `cv` and `rev` say**; the mismatch is logged as an `error_events` row (area `orders`, `v3_parity`) so a bridge bug is seen, but the server never charges a total the shopper did not confirm (rev 2's "same `cv`, server wins" branch is withdrawn) | 409 `stale` |
| 15 | R3: stock holds (STO-§5.6); a failed hold → 409 `stale` with that line `unavailable` | as stated |
| 16 | Blocklist, per-phone limit, risk score (`src/lib/orders/risk.ts`, store-scoped), then `createOrderRow(draft, ctx)` (**rev 3, ENGC-13:** extracted by T3 in R1.0 and frozen at P0, shared by the public v2 path, the manual v2 path (OPE-§11.1 step 5), this v3 path and `createManualOrderV3` (STO-§16.9); the R2 contract step only widens `OrderDraft`, STO-R35): the order row, `order_events` "created", order hooks (Sheets, CAPI per IN-02, Telegram) through the outbox drained in `after()` | blocked → 403 `blocked` |
| 17 | `bumpOrderStats({ kind: "product", id })` for each line's product and `{ kind: "page", id: ctxPageId }` (STO-R11 accepted, core §D.2 `stats_daily`); skipped for a test order (core D54) | — |
| 18 | 200 `ok` with `track = signedTrackPath(store, orderId)` (landing.md) and `wa = waConfirmText(store, order, locale)` (LP-04 text, server-formatted) | — |

### STO-§16.3 Per-line validation and re-pricing

```ts
// src/lib/catalog/order-v3.server.ts
export function priceLine(scope: StoreScope, product: ProductRow, levels: readonly InventoryLevelRow[], line: LineIn, sctx: ProductDocStoreCtx): LinePriced;
export type LinePriced =
  | { state: "ok" | "changed"; doc: PageDoc; selection: ResolvedSelection; sub: Cents; lineCents: Cents; pack: OrderItems; errors?: undefined }
  | { state: "unavailable" | "removed"; errors?: OrderFieldErrorsV3 };
```
1. Product not `active` → `removed`.
2. `doc = productAsPageDoc(product, { …sctx, levels })` (stock applied).
3. Offer `bundleId` missing → `removed` when the product changed since `rev`, else `invalid` on `l.<i>.bundleId`;
   `!offerAvailable` → `unavailable`.
4. `resolveSelection(doc, offer, { offerId: bundleId, units, extras, bump: false })` (`src/lib/orders/validate.ts:171`,
   unchanged); its keys are prefixed `l.<i>.`; an `unavailable` code → line `unavailable`.
5. `totals = orderTotals(doc, selection)` (`src/lib/page/pricing.ts:341`); `sub = totals.subtotal` (bump 0); `lineCents
   = n × sub`.
6. `lineCents ≠ ls` → **`changed`** (with the new `subCents`, `lineCents`, `rev`, label and text), **whatever `line.rev`
   says** (rev 3, ENGP-15: rev 2 let the server win silently on a same-`rev` mismatch; v3 has per-line proof precisely
   so the checkout can show the new line in place, STO-D9); `errors` → `unavailable`. When `line.rev === product.rev`
   the mismatch is additionally logged (`error_events`, area `orders`, `v3_parity`, with the two amounts and the chunk
   build id) because it means a bridge bug or a tampered body, not a price change.
7. `pack` = the v2 `OrderItems` of one pack built by the code that builds landing order items today (`create.ts` / `text.ts`
   helpers: `orderUnitOf`, `offerSheetLabel`), without bump and upsell.

Parity: the PDP bridge computes `sub` with the landing runtime money module, which already has parity tests with
`pricing.ts` (`npm test` runtime parity, OFFERS §I.5); `test:catalog` adds a v3 corpus (STO-§26.1).

### STO-§16.4 Storage: `OrderItemsV3` in `orders.items`

```ts
// src/lib/orders/contract-v3.ts (with the payload)
export interface OrderLineV3 {
  productId: string; productKey: string; slug: string; productName: string; rev: string;
  n: number;
  pack: OrderItems;            // the v2 shape for ONE pack (bundleId, bundleLabel, qty, unitPrice, variants, units, extras, price, deltas, reasons)
  subCents: number;            // price + deltas of one pack
  lineCents: number;           // n × subCents
}
export interface OrderItemsV3 {
  v: 3; surface: "pdp" | "cart" | "buy_now"; ctxPageId: string;
  lines: OrderLineV3[];
  delivery: { cents: number; rule: DeliveryRule; zoneId?: string; zoneName?: string };
  discount?: { code: string; couponId: string; cents: number };   // R3
  contact: { whatsapp: boolean; postal?: string };
}
```
Order columns for a v3 order: `source = 'storefront'` (core D42), `page_id` NULL and `version_id` NULL (0006),
`catalog_version` = the version priced, `product_name` = first line's name + " + {n − 1}" when several (≤ 160), `qty` =
Σ n × pack.qty (physical units, free included), `subtotal` = (Σ lineCents − discount) / 100, `shipping` = delivery / 100,
`total`, `currency` = store currency. `orders.items` is typed `OrderItems | OrderItemsV3` (request STO-R8);
`orderUnitsV3(items)` flattens every line's units (each tagged with the product) for the drawer, CSV and Sheets SKU
column.

### STO-§16.5 Order text v3 (warehouse and customer modes)

```
textV3   := lineText (" ++ " lineText)*
lineText := [n " × "] productShort [" (" packLabel ")"] [" : " packText]
```
- `productShort` = the item short name of a single-item product, else the product name (`sanitizeLabel`,
  `src/lib/orders/text.ts:50`), ≤ 40 characters.
- `packLabel` = `offerSheetLabel` of the pack when the product has 2+ offers; omitted otherwise.
- `packText` = `unitsText` of the pack (OFFERS §G.4, extras of the line included); omitted when empty.
- Cap 1,000 characters: whole lines are dropped from the end and replaced by ` … (+{n}, voir {orderId})`.
- Examples: `Huile d'argan (Duo) : 50 ml + 50 ml ++ 2 × Savon noir` · `T-shirt Sahara : 1 × Noir/M + 1 × Blanc/L ++ Casquette : Sable`.
- `orderText(items)` dispatches `items.v === 3` to `orderTextV3` (request STO-R8); Sheets "Produit" = `product_name`,
  "Variante" = warehouse `textV3`, "Qté" = `qty`; optional columns: "SKU" over every line's units, "Articles", "Livraison"
  = delivery, "Prix pack" = subtotal (operations.md maps it).
- **rev 3 (OPS-9, storefront side):** the R1 carrier loop operations adds for landing sellers (the optional
  `Tracking` / `Transporteur` Sheets columns, `orders.tracking_ref` + `carrier_label`, the "Carrier CSV" export with a
  fixed column list) needs nothing new here: v3 orders are `orders` rows like any other, so `tracking_ref` and
  `carrier_label` apply to them unchanged, and the Carrier CSV reads v3 lines through `orderUnitsV3` / `orderTextV3`
  exactly as the legacy `ordersCsv` does; `test:storefront-db` adds "a v3 order appears in the Carrier CSV with one row
  per order and its warehouse text" once the export exists.

### STO-§16.6 Ad events for v3 orders (with STO-D18)

`contentsOfV3(items, store)` (`src/lib/catalog/contents.ts`, pure, used by P5 server events and by `store-thanks`):
per unit content id = `contentIdOf(item, productKey)` (SKU, else `<productKey>.<itemId>`, `<productKey>` for `main`),
quantity summed per id across lines × `n`, `item_price` from `allocate()` per pack (free units 0); `value` = order total;
`num_items` = Σ quantities; `content_name` = the product name for one line, else "{n} produits". Server events use the
storefront pixel answer (`storefront.pixels`) and `event_source_url = storeUrl(store, "/checkout")`.

### STO-§16.7 Limits

| Limit | Value |
|---|---|
| Lines per order | 20 |
| `n` per line | 1-10 |
| Units per pack | 20 (OFFERS) |
| Body | 48 KB (order), 24 KB (cart re-price), 16 KB (lead), 4 KB (event) |
| `st`, `ls` | ≤ 1,000,000,000 cents |
| Products resolved per request | ≤ 20 distinct keys, one store |

### STO-§16.8 Parity: one price on every path (rev 3)

Every path that prices catalog lines ends in `priceLine` + `orderTotals` and every insert ends in `createOrderRow`, so
the following equalities are **tests**, not conventions (`test:catalog` offline on the fixture carts, `test:storefront-db`
through the real handlers): public v3 total (`/api/public/store/order`) = cart re-price total (`/api/public/store/cart`)
= WhatsApp intent text total (`/api/public/store/lead` `kind: "whatsapp"`) = manual v3 total (`createManualOrderV3`) =
edited v3 total (`editOrderV3`) for the same lines, city and instant; the PDP bridge's `sub` = the server's `subCents` for
every fixture selection (the landing runtime money parity, OFFERS §I.5); the delivery row shown (`dl`) = the server's
`deliveryCents` for every (city, subtotal) fixture through the same `storeDeliveryFee` and the same `cityKey`. Any
difference the server detects answers `stale` and is logged (`error_events`, `v3_parity`), never absorbed (ENGP-15).

### STO-§16.9 Catalog orders by agents: `createManualOrderV3`, `editOrderV3` (rev 3, OPS-15; STO-D44)

Operations' `createManualOrder` (OPE-§11.1) takes a `pageId` and a payload v2 `selection` and validates with
`validateOrder(payload, doc)` against a landing version; `editOrder.selection` (OPE-§11.3) is the v2 shape re-validated
against `orders.version_id`. A v3 order has `page_id NULL` and `version_id NULL` and up to 20 lines, so a store-mode
call centre had **no** path to take a phone order for catalog products, convert a WhatsApp intent, or add a line to a
cart order. This part builds the pricing and insert functions (they sit on `priceLine` and `createOrderRow`, which are
S1's and the core's); operations owns the sheet and routes it by store mode.

```ts
// src/lib/catalog/order-v3.server.ts (S1; R2 contract step freezes the signatures as P0-style stubs for S4's sheet, STO-R30 accepted, core §K.4)
export interface ManualOrderInputV3 {
  lines: Omit<LineIn, "ls" | "rev">[];                     // 1..20 catalog lines (pk, bundleId, units, extras, n); no shown amounts: the agent sees the server quote
  customer: { name: string; phone: string; city: string; address?: string; landmark?: string; note?: string; email?: string };
  source?: "manual" | "whatsapp";                           // default "manual"; "whatsapp" from a WhatsApp intent (STO-§15.13 step 5)
  confirmed: boolean;                                       // "The customer already confirmed" (default true for phone orders)
  adjustCents?: number; adjustReason?: string;              // manager+ only, ≤ 0, OPE-§11.1 step 4 rules
  fromLead?: { leadId: string };                            // set by operations' convertLeadToOrder when leads.sel.v === 3
  allowDuplicate?: boolean;
  idem: string;                                             // the sheet's draft id, written to orders.idem (OD36 replay)
}
export interface ManualQuoteV3 { lines: (LinePriced & { i: number })[]; subtotalCents: number; deliveryCents: number; deliveryRule: DeliveryRule | "not_set"; adjustCents: number; totalCents: number; currency: string; warnings: ("duplicate" | "blocked" | "city_unknown" | "fee_unset")[]; duplicates: { id: string; createdAt: string }[] }
export function quoteManualOrderV3(ctx: StoreCtx, input: ManualOrderInputV3): Promise<ActionResult<ManualQuoteV3>>;   // orders.create, no write; the sheet debounces it 250 ms
/** @write */ export function createManualOrderV3(ctx: StoreCtx, input: ManualOrderInputV3): Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>>;
export interface OrderPatchV3 { contact?: Omit<ManualOrderInputV3["customer"], "phone"> & { phone?: string }; lines?: Omit<LineIn, "ls" | "rev">[]; adjust?: { cents: number; reason: string } }
/** @write */ export function editOrderV3(ctx: StoreCtx, orderId: string, patch: OrderPatchV3, expectRev: number): Promise<ActionResult<{ rev: number; totalCents: number; lines: LineVerdict[] }>>;
```

1. **Pricing = the public path's.** Each line goes through `priceLine(scope, product, levels, line, sctx)` (STO-§16.3)
   with `ls` absent (no proof to compare: the quote **is** the shown amount), `applyStock` included; an `unavailable` or
   `removed` line is returned in the quote with its verdict and the sheet disables "Create order" until the agent fixes
   it. Delivery = `storeDeliveryFee` with `cityKey(customer.city)` (STO-§15.9) or `normalizeCity` for free text
   (`city_unknown` warning when neither matches); `not_set` → warning `fee_unset` and a 0 delivery the agent must
   override with `adjustCents` or the owner must fix (never an invented fee).
2. **Insert = `createOrderRow(draft, ctx)`** with `source`, `created_by = ctx.user.id`, `risk_score = 0`, `flags =
   ["manual"]`, `items: OrderItemsV3` (`surface: "manual"` is **not** added: `surface` stays the shopper vocabulary;
   the order's `source` carries the channel), `page_id` / `version_id` NULL, `catalog_version = store.catalogVersion`,
   `currency = stores.currency`, `is_test = false`, then `runOrderHooks("created")` and, when `confirmed`,
   `transitionOrder(want confirm confirmed, source "ui")` (the R3 hold is taken there, STO-§5.6).
3. **Blocklist, duplicates, adjustment, replay, rate**: OPE-§11.1 steps 3, 4 and 7 apply verbatim (`s:<sid>:manual:<uid>`
   60 / h; an existing `orders.idem` of this store → `replayed: true`).
4. **`editOrderV3`**: permission `orders.edit` with OPE-§11.3's lock rules (ship ∈ {none, to_pack, packed}, confirm ∉
   {cancelled, fake, duplicate}); `lines` replaces the order's lines after re-pricing every line against the **live
   product** (never a landing doc), `items`, `qty`, `subtotal`, `shipping`, `total` and `product_name` are rewritten
   from the result; a line now `unavailable` answers `{ ok: false, error: "unavailable", lines }` and changes nothing;
   `contact` follows OPE-§11.3 (phone re-normalised, customer link moved, duplicate check re-run); one `field_edited`
   event with before / after; `rev + 1`; `sheet_dirty |= 4` for lines; the R3 hold is re-taken for added units and
   released for removed ones in the same transaction; `stock_short` as STO-§5.6 when a hold fails.
5. **Who builds what**: S1 ships the four functions and their `test:catalog` parity fixtures, plus the **products
   picker** component `src/components/admin/catalog/product-picker.tsx` (the Offers v2 pickers built from
   `productAsPageDoc`, read-only over the store's active products); **S4 LOGISTICS** (rev 4, core §K.4: S4 takes
   `src/components/admin/orders/manual/**` over from P4 in R2; rev 3 wrote "S3") routes the manual-order sheet by store
   mode (`store` / `both`: S1's products picker calling the v3 functions; `landing`: the pages picker of OPE-§11.2
   calling `createManualOrder`); `convertLeadToOrder` (P4's P0 stub) dispatches on `leads.sel.v` (STO-R30). Operations'
   proposed `src/lib/orders/{manual-v3,edit-v3}.ts` do not exist (core §Q.8 OPE Q.27h: one pricing owner).
   The sheet's "Add a line" on an existing **v3** order calls `editOrderV3`; on a **v2** order it keeps OPE-§11.3 (one
   offer per v2 order by contract).
6. **Acceptance** (`test:catalog`, `test:storefront-db`): for every fixture cart, `createManualOrderV3(lines).total` =
   the public v3 path's total for the same lines and city ("manual v3 total = public v3 total", 100 %); a WhatsApp
   intent converted through `fromLead` marks the lead `converted` with `converted_via = 'agent'`; `editOrderV3` adding a
   sold-out variant changes nothing; a member of store B cannot quote or create against A's product keys (tenancy case).

---

## STO-§17 "Both" mode: product ↔ landing attachment (LP-07, LP-08)

### STO-§17.1 Model

- `pages.product_id` (core §D.2) on a `landing` row = attached. One product may have **≤ 10** attached landing pages
  (the 11th attach answers "Un produit peut avoir 10 pages de vente au plus."). **rev 3 (ENGP-16):** the cap is what
  makes the synchronous fan-out bounded: every attached live page is republished or re-rendered in `after()` of the
  product save (STO-§4.5), the `render_jobs` rows being the fallback for a failure only.
- `pages.attach_opts longtext NULL` (STO-R6 accepted, core §D.2 0006): `{ v: 1, indexable: boolean = false, keepNames:
  boolean = true, keepPhotos: boolean = true }`; the default of `indexable` is the store setting
  `landing.attach.noindexDefault` (LAN-§2.3).
- `page_versions.product_rev char(26) NULL` (STO-R6 accepted): the `products.rev` a published or `sync` version was
  materialised against; an in-place re-render for another reason (`brand`, `address`, `store_info`) rewrites it too
  (core §H.3).
- `page_versions.kind` gains `'sync'` (core §D.2 0006, LAN Q24): the version a product change publishes.
- **rev 2:** the attachment is **one implementation shared with landing.md** (LAN-§17; both files are S1's in R2,
  LAN-§26.2): `materializeAttached` and `republishAttached` live in `src/lib/landing/attach.ts` /
  `attach.server.ts`; this part owns the catalog side (`onProductChanged`, the product editor's "Pages de vente" tab,
  the content ids) and `attachedDocFor` for the order path. Rev 1's `attachMirror` in `src/lib/catalog/attach.ts` is
  withdrawn.

### STO-§17.2 The mirror (`materializeAttached`, landing.md LAN-§17.1; S1)

```ts
// src/lib/landing/attach.ts (isomorphic, pure; landing.md owns the name, this part the stock input)
export interface MirrorReport { appended: string[]; dropped: string[]; offersOff: string[]; overrides: OfferOverride[] }   // item ids, item ids, offer ids, computed overrides
export interface OfferOverride { offerId: string; referenceCents: number /* Σ units × product price */; priceCents: number; deltaCents: number /* price − reference, may be negative */; perUnit: boolean }
export interface AttachStock { levels: readonly InventoryLevelRow[]; config: StockConfig }
export function materializeAttached(landing: PageDoc, product: ProductDocJson, stock: AttachStock, opts: AttachOpts): { doc: PageDoc; report: MirrorReport };
export function offerOverrides(doc: PageDoc, product: ProductDocJson): OfferOverride[];   // pure; the chip data (LAN-§17.3)
```
- For every product item: the landing item with the same id takes the product's `price`, `compareAt`, `groups` (option
  ids, deltas, codes), `soldOut` (after `applyStock`) and `sku`; `name`, `short`, `images`, `cutout` stay the landing's
  when `keepNames` / `keepPhotos`, else the product's. Product items absent from the landing are appended (usable by
  new offers).
- Landing items unknown to the product are dropped; every landing offer with a line on a dropped item is left out of
  the rendered doc and refused at order time (`bundleId: unavailable`); the builder shows the error "Cette offre utilise
  un article qui n'est plus dans le produit".
- The landing's own **offers** (pack prices), display, extras, bump, upsell, form, theme, sections, SEO and its flat
  `shippingFee` stay as they are (the landing runtime and PHP export are frozen, R-D22).
- **Overrides shown as overrides (LAN-§17.3, LD21):** an offer whose price equals Σ units × product price has no chip;
  an offer whose price differs is allowed (a campaign pack price) and carries the chip **"Override"** everywhere the
  offer is edited or listed: "Prix produit 2 × 249 = 498 DH · ce pack 449 DH (−49 DH)"; a 1-unit offer below the product
  price is allowed with the warning "Les clients qui voient aussi la page produit voient deux prix pour une unité"; an
  offer `compareAt` may only be the computed reference or the product's compare-at × units (anything else is the
  checklist and gate error `attach.compare_not_real`); savings and "per unit" display derive from the reference, so they
  are real by construction. The PDP shows product prices only; a landing's pack price never appears on a store page.
- The result passes `PageDocObject`; when no offer remains, the order form renders its unavailable state with the
  WhatsApp alternative.

### STO-§17.3 Where the mirror applies (rev 2, aligned with LAN-§17.4 and core D50 refined)

| Moment | What happens |
|---|---|
| Attach (builder "Relier à un produit du catalogue" (`src/components/builder/attach/**`, S1), or the product editor's "Pages de vente" tab → "Relier une page existante") | item mapping sheet: landing items paired with product items (same id, else suggestions by SKU then by name); offers whose lines lose their item are listed and dropped only after confirmation; the draft is rewritten with the product item ids; `pages.product_id` set; audit `page.attached` (`{ productId }`, landing's name; the core's `store.landing.attached` stays unused) |
| Builder open / save | the draft is re-materialised; price, compare-at, options and stock fields of the items are read-only with the banner "Prix, options et stock viennent du produit {name} · Modifier le produit" (STO-R18 accepted, core §K.4 S1); the Offers panel shows the override chips |
| Publish | the published version doc = the materialised draft; `product_rev` = `products.rev`; the publish gate runs (`attach.compare_not_real` is hard) |
| Product change: `prices`, `options` | `onProductChanged(scope, productId, change)` (LAN-§17.4) → one `render_jobs` row per live attached page, reason `product`, priority 2 (dedupe per page, core D25); the handler is **`republishAttached(scope, pageId)`**: materialise the new mirror into a copy of the **published** version's doc, validate, render, run the gates, commit a **`sync`** version ("Synced with product «X»") and make it live; the draft gets the same mirror; `product_rev` = the new rev. **rev 3 (ENGP-16):** in `after()` of the product save **every** attached live page (≤ 10) is republished at once (their job rows finish `skipped`; rev 2 did 5 and let pages 6-10 wait a tick plus the edge TTL, a deterministic gap in which a shopper on page 7 could not order); when edge caching exists the handler purges the republished paths (OS-12), so the residual window is the 60 s `s-maxage` only where no purge exists. A sync that fails validation keeps the old version live, marks the page "Out of sync" and notifies `landing.sync_failed` (landing's kind) |
| Product change: `stock_transition` (rev 3, ENGP-10) | **in-place re-render** of the published version's rendered columns (`html`, `thank_you_html`, `csp`, `etag`, `product_rev`) under core D50 with the live stock applied through `materializeAttached`'s `AttachStock`, reason `product`, **no new version row**: a stock crossing changes availability, never a priced total, and the order path reads availability live (`attachedDocFor`). Rev 2 published a `sync` version per crossing: a product crossing daily with 10 attached pages would write ≈ 9 MB of 600-900 KB version rows a day and churn `versions_kept_per_page` (30) through `sync` rows. Fan-out and purge as the row above (all ≤ 10 pages in `after()`) |
| Product change: `content` (name, photos) | in-place re-render for inherit-story pages only (`keepNames` / `keepPhotos` false), reason `product`, no new version (core D50: no price changes) |
| **Which branch runs (rev 5, CRIT2-17; core §H.3)** | the three rows above describe the outcomes; the **handler decides by diff, never by the `change` kind or the job's reason**: `render_jobs` has no change column and keeps one pending job per page across every reason, so a pending `stock_transition`, `content`, `address` or `store_info` job can absorb a later price change. Every render job of a page with `pages.product_id` set runs `republishAttached(scope, pageId)`, which materialises the mirror from the product at run time and compares each item's price and compare-at, the option / variant set and every offer's `orderTotals` total with the published version doc: a difference → the `sync` version of the `prices` / `options` row; none → the in-place re-render of the `stock_transition` / `content` rows. `onProductChanged`'s `change` argument only decides the fan-out timing (the `after()` republish of the `prices` / `options` row). `test:storefront-db`: stock transition, then a price change while that job is pending → exactly one `sync` version with the new price |
| Serve | the published (or `sync`) HTML is served from the version row like any landing page; when `page_versions.product_rev ≠ products.rev` and no `render_jobs` row is pending for the page (a failed or lagging sync), the route enqueues the republish again in `after()` (idempotent through the dedupe key) and serves the current HTML; the order path (next row) protects the price meanwhile. Rev 1's render-on-serve with an in-place HTML write is withdrawn (a price change is a publish, LAN LD20). **rev 3 (ENGP-16):** the frozen landing runtime reloads once on `stale` and refuses a second reload inside `STALE_GUARD_MS` (60 s, `src/landing/runtime/form.ts:60, 309-322`); with the full fan-out above the second `stale` only happens when an edge still serves the old HTML inside its 60 s TTL, and the form then shows the stale banner with the WhatsApp alternative. A "Recharger" button on that banner is a landing-runtime change the chunk freeze forbids; this part asks landing to add it to the `assist` add-on chunk's stale handling (STO-R41) and adds the e2e case "price changed mid-checkout on page 7 of 10" to `qa:storefront-e2e`. **rev 4:** landing accepted it (LAN-§17.4 rev 4, the R2 `assist` stale banner's `lp.reload` "Recharger la page" button after `STALE_GUARD_MS`), so the residual case has a path to order |
| Order (payload v2) | `orderVersion(target)` applies `attachedDocFor(target)` (`src/lib/catalog/attach.server.ts`: the live product items and stock overlaid on the version doc, the version's offers kept) and forces **fallback** mode: any `st ≠ total` or a selection error answers `stale` (STO-R12 accepted, core §K.4) |

Bound on staleness: a shopper may hold old HTML for at most the edge TTL (60 s) plus the time the tab stays open; open
tabs keep the price they show for 72 h (OFFERS D8: the version they loaded stays orderable) **unless** the product
price moved, in which case the live overlay answers `stale` and the reload shows the new price (the landing runtime's
stale flow, `src/landing/runtime/form.ts:309-322`). A shopper is never charged a price they did not see.

### STO-§17.4 Detach

"Détacher du produit": the last materialised items become the landing's own copy, `product_id` and `attach_opts` are
cleared, the page keeps its offers (the override chips disappear, since there is no reference any more); a re-publish
is needed for the published version to drop the overlay (until then orders still use the overlay of the version's
`product_rev`: the detach dialog offers "Détacher et publier"). Audit `page.detached`.

### STO-§17.5 Create a campaign page from a product

The product editor's "Créer une page de vente" opens the generate wizard (core §I.1 `/app/<h>/generate`) preloaded with
the product: items, photos (and crops), offers (copied as the landing's starting offers), the product's content sections
(copied as landing sections where the landing kind allows them), facts and policies. The new landing is attached
(`product_id`), `theme_mode = "campaign"` with the brand locks (DES-§11), `attach_opts.indexable = false`. The wizard
steps and generation stay design.md / ai.md behaviour.

### STO-§17.6 SEO, links, theme (R-D49, LP-08)

- Attached landing: `<meta name="robots" content="noindex">` and `<link rel="canonical" href="<PDP absolute URL>">` by
  default; `indexable: true` → `index` + self-canonical. The store sitemap lists only indexable landings.
- In `both` mode attached landings get "Voir la boutique" in their footer and on their thank-you page (landing.md LP-04
  block option), pointing to the store home; non-attached landings get it only when the owner turns it on.
- Theme mode (LP-08, design-owned behaviour, DES-§11): attach keeps the page's `theme_mode`; "Créer une page de vente"
  starts in `campaign`; `store` mode re-renders on brand changes (reason `brand`, design's fan-out).

### STO-§17.7 Orders, stock, customers and ads of attached landings

- Orders stay payload v2 (`source = 'live'`, `page_id` = the landing); reports, accounting (operations.md) and
  bestsellers (STO-D22) attribute them to the product through `pages.product_id`.
- **Delivery fee (rev 3, OPS-13; STO-D46).** An attached landing charges its own flat `offers.shippingFee` as long as it
  runs on `runtime_v = 2` (LAN LD4 / LD25), while the PDP charges the zone fee: a `both` store can quote two fees for
  one city. This part (a) asks the core to pull **LP-16** (`landing-v3` entry = a fork of `entry.ts` adding one zone
  lookup, config v3 with `zones`, server shipping by zone for `runtime_v = 3`; the PHP template v3 may lag one release
  with the export refusing "charge by city" pages until it ships) into the **R2 contract step** (STO-R31); (b) when it
  exists, "Créer une page de vente" from a product in `both` mode starts the landing with "charge by city" on (its
  `sync` republishes then run on v3 and charge the zone fee, so attached landings inherit the zone fee first), and the
  attach flow offers "Facturer la livraison par ville" with the fee comparison; (c) until a given landing runs on v3, the
  mismatch is **shown, never hidden**: the Store Health rule `sf:landing_fee_mismatch` (STO-§23.8, sev. 2: a live
  attached landing whose flat fee differs from the zone fee for any of the store's top-5 cities by orders in 30 days or
  for the `*` zone) and a chip "Frais de livraison différents de vos zones ({page fee} vs {zone fee} pour {city})" next
  to the override chips on the "Pages de vente" tab, with the one-tap fix "Facturer par ville" (v3) or "Modifier les
  frais de la page". The landing-side checklist warning `delivery:fee_mismatch` is landing's (STO-R31).
  **rev 4 (core D75 accepted; §I.7):** (a) is decided: LP-16 ships in the R2 contract step (`landing-v3`, config v3 with
  `zones: ZoneTable`, server shipping through `storeDeliveryFee` for `runtime_v = 3`, `export:runtime_v3_unsupported`
  until PHP template v3 in R3), and S1 wires the store side (LP-16 row, STO-§1.2). (c) is reduced to **one** Store
  Health issue: the core named landing's `landing:fee_mismatch` (P3, over P1's `zones.feeMismatchTop5`, the five main
  cities `casablanca`, `rabat`, `fes`, `marrakech`, `tanger` or the store's five most-ordered keys once n ≥ 20, LAN-§3.2),
  which already covers attached landings, so `sf:landing_fee_mismatch` is **withdrawn** (STO-§23.8) and the "Pages de
  vente" chip reads the same `zones.feeMismatchTop5` input (same cities, same numbers as the landing checklist line).
- Stock: the shipped decrement and R3 holds cover them (STO-§5.4, §5.6).
- One customer and one blocklist per store, shared by store and landing orders (core §D.5).
- Pixel content ids of an attached landing = the product's (`contentIdOf(item, productKey)`), so landing, PDP and cart
  events feed one ad catalogue (STO-D18; the change lives in the landing render config for attached pages only,
  request STO-R12).

---

## STO-§18 Reviews (ST-13, R-D46)

### STO-§18.1 R2: nothing to show, nothing invented

- Store kinds render no stars, no rating badge, no review count and no `aggregateRating` (STO-D12).
- `products.doc.product.rating` is dropped on write; review-like landing sections are not eligible on store kinds
  (STO-§9.1); landing.md's LP-02 publish error for sample reviews, social proof and stats keeps applying to landing
  pages in every mode.
- The product editor shows one quiet line: "Avis clients vérifiés : bientôt, collectés après chaque livraison."

### STO-§18.2 R3: collection

| Step | Rule |
|---|---|
| Trigger | order hook `ship_state → delivered` (storefront hook file): one `review_requests` row per order (targets = the order's products, or its non-attached landing page), due after `reviews.delayDays` (default 3) |
| Channel | `manual` (default): the order drawer shows "Demander un avis" → copies a WhatsApp message with the link (operations.md drawer slot); `whatsapp` through the outbox `whatsapp` kind when operations' WhatsApp API (OP-23) is configured |
| Link | `https://<store origin><base>/reviews/<token>` (`reviews` is already a store-reserved slug, core §C.4.1); token = 32 random bytes, sha256 at rest, valid 60 days, one submission per target |
| Page | transactional register; per product: a 5-star radio group (labels "1 étoile" … "5 étoiles"), optional text (≤ 2,000), optional photos (≤ 4, uploaded through `POST /api/public/store/review-media` with the token as authorisation; sniffed, EXIF stripped, store media quota charged), the display name preview "Salma B., Rabat", a required consent checkbox; 3 taps for a stars-only review |
| Submit | `POST /api/public/store/review` (`s:<sid>:review:ip:<ipHash>` 10/h); `verified = true` (delivered order), `status = published` when `reviews.autoPublish` (default) else `pending` |
| Moderation | `/app/<h>/reviews` (`reviews.moderate`, core §A.3.1): publish, hide with a reason code, unhide; **never edit text or stars**; each action audited (`store.review.published` / `hidden` / `unhidden`); the hide rate is visible in the console store profile (platform.md) |
| Imports | the CSV importer (`import_mappings.kind = 'reviews'`, core §D.6) creates `imported = true`, `verified = false` rows after an owner attestation; displayed with "Avis importé", excluded from averages, counts and JSON-LD |
| Incentives | when the store offers something for a review, `incentivized = true` and every rating display adds "Certains clients ont reçu {incentive} pour leur avis." |

### STO-§18.3 R3: display

- `reviewsVerified` section (STO-§9.3), the PDP summary next to the price ("4,6 · 38 avis vérifiés", link to the
  section), stars on cards; all computed from `verified = true AND status = 'published'` rows only; distribution bars;
  "Achat vérifié" badge, date, the variant bought, the photo strip.
- Disclosure under every rating display: "Les avis proviennent de clients ayant reçu leur commande ; nous vérifions chaque
  avis par son numéro de commande." (EU Omnibus, good practice in Morocco).
- JSON-LD: `aggregateRating` (`ratingValue` with one decimal, `reviewCount`, `bestRating: 5`) and up to 5 `review` items,
  only with ≥ 1 verified published review; never on the home page (self-serving organisation reviews).
- Landing pages (any mode): a new landing section `reviewsVerified` (R3, added to `src/landing/sections/` through the R3
  file map) renders the verified reviews of the attached product or of the page at publish and re-render; a change in a
  page's published review set re-renders it once a day at most (render reason `reviews`, request STO-R6).
- Publishing or hiding a review bumps `catalog_version` (store pages) and schedules the landing re-render.

---

## STO-§19 R3 growth items and later

### STO-§19.1 Coupons (ST-14)

- Admin `/app/<h>/catalog/coupons` (permission `coupons.manage`, request STO-R21): code, kind, value, scope, minimum
  subtotal, total uses, uses per phone, real start and end dates, status; codes are stored upper-case and unique per
  store.
- Checkout: a collapsed "Vous avez un code ?" link opens the field; the code is checked on blur through the cart
  re-price endpoint (`coupon` added to its request; answer `{ coupon: { ok: true, discount, label } | { ok: false } }`)
  and again at order time (STO-§16.2 step 13).
- Discount: eligible subtotal = Σ `lineCents` of the lines in scope; `percent` = floor(eligible × bp / 10,000);
  `fixed` = min(value, eligible); `free_delivery` = the delivery becomes 0 (rule `coupon` appended to `DeliveryRule`);
  `minSubtotalCents` compares with the eligible subtotal; dates in the store timezone; never below 0 per line.
- Concurrency: `UPDATE coupons SET uses = uses + 1 WHERE id = ? AND store_id = ? AND status = 'active' AND (max_uses
  IS NULL OR uses < max_uses)` inside the order transaction; per phone: `COUNT(*)` of redemptions with the phone hash `<
  per_phone_max`; then the `coupon_redemptions` row. A failed check answers `coupon: invalid` (one generic message, no
  hint of which rule failed).
- Allocation: largest remainder over the eligible lines (accounting, pixel contents); shown as "Code {CODE} · −{amount}".
- Landing pages get coupons only if landing.md's LP-16 runtime adds them.

### STO-§19.2 Stock holds (ST-15)

STO-§5.6.

### STO-§19.3 Size guide (ST-16)

`products.size_guide` (0007): `{ groupId: string; unit: "cm" | "in"; columns: string[] ≤ 8; rows: { size: string;
values: string[] }[] ≤ 20; note?: string ≤ 200 }`. A "Guide des tailles" link next to the size group's label opens a
bottom-sheet dialog with the table (`<table>` with `<th scope>`, horizontally scrollable). For garments
(`src/landing/sections/garment.ts`) the editor proposes an empty skeleton (column headers such as "Tour de poitrine",
"Longueur"), never measurements. Units follow the market (cm everywhere in R3; `in` only when the owner picks it).

### STO-§19.4 Breadcrumbs (ST-20)

PDP: "Accueil › {primary collection} › {product}"; collection: "Accueil › {collection}"; `<nav aria-label="Fil
d'Ariane"><ol>…</ol></nav>`, the current item `aria-current="page"`, separators drawn in CSS (mirrored in RTL);
`BreadcrumbList` JSON-LD with the same items and absolute URLs; no breadcrumb when the product has no primary
collection.

### STO-§19.5 Speculation Rules and bfcache (ST-18)

- Home, collection and search documents carry `<script type="speculationrules">{"prefetch":[{"source":"document",
  "where":{"href_matches":"<base>/p/*"},"eagerness":"moderate"}]}</script>`; its hash must be in `script-src`
  (request STO-R13 for the CSP builder to hash `type="speculationrules"` scripts).
- No store chunk registers `unload` (a grep in `qa:storefront-render`); public kinds never send `no-store` (only
  `/checkout/merci` and `/track`, by design).

### STO-§19.6 Home storylines 5-8 (ST-19)

STO-§11.2.

### STO-§19.7 Sibling locales (ST-12)

- `stores.locales` (core §D.4) lists the enabled locales; the default locale is unprefixed, every other one is a path
  prefix: `/fr/p/<slug>`, `/fr/c/<slug>`, `/fr` (home). Locale codes are reserved page slugs from R2 (request STO-R14);
  the `[slug]` and `[slug]/[...rest]` routes dispatch a first segment that is an enabled locale.
- Text overlays: `products.i18n` and `collections.i18n` (0007) = per locale `{ product: { name?, tagline?, description? },
  items: { [itemId]: { name?, short? } }, groups: { [itemId]: { [groupId]: { name?, options: { [optionId]: string } } } },
  offers: { [offerId]: { title?, short? } } }`; prices, ids and stock are shared; missing text falls back to the default
  locale; AI-10 drafts translations the owner approves (ai.md).
- Template siblings: `@home.<locale>` … rows (`pages.locale`), menus with `labels: Record<locale, string>`.
- `hreflang` alternates on every page (+ `x-default` = the default locale URL); a dismissible client chip "Voir en
  العربية ؟" from `navigator.languages` (`store` chunk, remembered in `sessionStorage`); never a redirect, never `Vary:
  Accept-Language`.

### STO-§19.8 EU legal pack (ST-21, at the first EU store)

Activation gate for a store whose market is in the EU; the checkout template cannot be published until every item is
green:
1. Price history: a daily lowest `from` per offer (table requested when scheduled) and "Prix le plus bas des 30 derniers
   jours : {amount}" next to any struck price or savings chip.
2. Consent banner with Google Consent Mode v2 defaults denied (`ad_storage`, `analytics_storage`, `ad_user_data`,
   `ad_personalization`); pixels load only after consent; "Refuser" as prominent as "Accepter"; choice stored per store
   key.
3. Review disclosure (STO-§18.3) present wherever ratings render.
4. EU address fields (STO-§15.5) and the 14-day withdrawal information in the returns policy facts.
5. `qa:storefront-a11y` at 0 errors on the store's templates (EAA, EN 301 549).
6. Legal templates reviewed (core D39 flag cleared by the platform).

### STO-§19.9 Later (ST-22, P2)

PWA per store (manifest with `start_url` and `scope` = the store base, icons from the logo engine, a service worker
that caches only the offline page and static assets, never an API answer); "Mes commandes" with a one-time code (needs a
messaging provider); recently viewed (`sg:<h>:seen`, ≤ 12 ids); co-purchase cross-sell from the store's own order lines
(minimum support 5 orders). Each gets its own acceptance when scheduled.

### STO-§19.10 Experiments on store pages (SF-10 consumer side; R3, D3 engine, S1 render files; STO-D41)

**Who owns what.** The Experiments engine is landing.md's (LAN-§18: tables `experiments`, `experiment_arms`,
`experiment_exposures`; `src/lib/experiments/**`; mSPRT statistics with `τ = 0.1`, ≥ 100 uniques per arm, auto-end at 28
days, core D58; the screens `/app/<h>/experiments`; the `exp-head` and `exp` chunks; `/api/public/exp`). The storefront
**consumes** it: it says which store kinds and sections may host arms, renders the arm wrapper, the head script and the
chunk through its on-request renderer, and keys its cache per arm.

| Surface (`experiments.surface = 'store_page'`) | In-page arms (`headline`, `hero`, `section`; all arms in the HTML, `.lp-xa` wrapper, `exp-head` picks before first paint) | URL arms (`version`; `?xv=<arm>`, one published template version per arm) |
|---|---|---|
| `home`, `page` | `storeHero` heading / sub / family (`hero` arm = variant within the G2 pool and its fold contract), any one non-grid section (`section` arm) | yes: the whole `@home` doc |
| `product` template | `trustStrip`, `mediaText`, `richText`, `whatsappCta`, `productGrid` placement (`section` arm); the `productDetail` family may be a `hero` arm **only** with identical buy box markup (the family changes gallery and column arrangement, never the form) | yes: the whole template; every PDP of the store splits the same way |
| `collection` template | `collectionHeader` variant and copy | yes |
| `cart`, `checkout`, `search`, `not_found`, thank-you, track | **never** (commerce and transactional utility kinds; the checkout is a conversion instrument, not an arm) | never |

Guards (server-side, at start and at every publish of an arm; landing's `exp.*` codes plus the storefront's): no arm
may touch `productDetail` data, the buy box, offers, prices, the delivery line or the checkout block (`exp.buy_box`);
the pricing fingerprint of a store template is empty by construction (templates hold no prices), so the storefront
guard is structural; every arm passes the store publish gate (STO-§6.3) with its own fold contract; a publish of the
template while running stops the experiment (LAN-§18.2).

Rendering: the cache key appends `:xv<arm>` for URL arms (canonical = the control URL); in-page arms are part of the one
cached document; `exp-head` (≤ 450 B, hashed into the CSP) and `exp` (≤ 1,200 B) join the document's add-ons (core
§H.13) and count toward `store-page` (second-round request STO-R26). Exposures post `POST /api/public/exp` with the
template's context key as `pageKey`; conversions = v3 orders whose `variant_key` was set by the `exp` chunk's `idem`
hand-off (LAN-§18.5), re-scored to confirmed and delivered as statuses arrive; test orders excluded. Store Health gets
no experiment rule (results live on the experiments screen).

Acceptance (`test:experiments` fixtures on a store home and a PDP template; `qa:storefront-render`): the control shows
with JS off; the head script precedes the first section; an arm that touches `productDetail` data is refused
`exp.buy_box`; the same visitor keeps the arm across home → PDP; exposures and weights of store A are invisible to B.

---

## STO-§20 SEO (ST-08, R-D49, ST-12, ST-20)

### STO-§20.1 URLs

| Page | URL (relative to the canonical store origin + base) |
|---|---|
| Home | `/` (R3 siblings `/fr`) |
| Product | `/p/<slug>` (`/products/<slug>` → 308; old slugs → 308 via `catalog_redirects`) |
| Collection | `/c/<slug>`, `/c/<slug>?page=n`, `?sort=` |
| Custom page, landing page | `/<slug>` |
| Policy | `/policies/<kind>` |
| Search, cart, checkout, thank-you, tracking, reviews | `/search`, `/cart`, `/checkout`, `/checkout/merci`, `/track`, `/reviews/<token>` (all `noindex`) |

Slugs: lower case (uppercase requests 308), `SLUG_RE`, generated from the name with Arabic transliterated by the slug
helper (owner-editable), unique per store per kind.

### STO-§20.2 Canonical rules

| Page | `<link rel="canonical">` |
|---|---|
| PDP | `storeUrl(store, "/p/<slug>")`, no query |
| Collection page 1, any sort | `/c/<slug>` |
| Collection page n ≥ 2 | `/c/<slug>?page=n` (self; the sort parameter is dropped) |
| Custom page, policy, home | self |
| Attached landing | the PDP (STO-§17.6) unless `indexable` |
| Search, cart, checkout, thank-you, track, 404 | none (`noindex`) |
| R3 locale siblings | self + `hreflang` set |

Every canonical is absolute at the store's canonical origin (C > S > P, core §C.1); while the store is not `active` or
has nothing published, its pages are `noindex` and its robots file disallows everything (core §C.8).

### STO-§20.3 Titles and descriptions

| Kind | `<title>` (≤ 70 characters; the store name is dropped first when too long) | Description (≤ 160) |
|---|---|---|
| Product | `{seo.title \|\| product name} · {store}` | `seo.description` → tagline → first 160 characters of the plain description |
| Collection | `{seo.title \|\| name} · {store}` | `seo.description` → plain description |
| Home | `{seo.title \|\| store name}` | `seo.description` of `@home` |
| Custom page | `{seo.title \|\| title} · {store}` | `seo.description` |
| Search | `Recherche « {q} » · {store}` | — |
| 404 | `Page introuvable · {store}` | — |

The separator is " · " (no em or en dash, DES DS13). AI-09 fills empty SEO fields in R2 (ai.md), never overwriting the
owner's.

### STO-§20.4 Structured data (`src/lib/catalog/seo.ts`, pure)

| Builder | Where | Content |
|---|---|---|
| `onlineStoreJsonLd` | home | `@type: "OnlineStore"` (a schema.org `Organization` subtype): `name`, `url`, `logo` (absolute, ≥ 112 px), `contactPoint` (telephone when set, `contactType: "customer service"`, `availableLanguage`), `sameAs` (socials), `hasMerchantReturnPolicy` only when `policies.returns.windowDays` exists and `policies.returns.accepted !== false` (rev 4: the real keys) (`MerchantReturnPolicy`, `applicableCountry` = market country, `returnPolicyCategory: MerchantReturnFiniteReturnWindow`, `merchantReturnDays`) |
| `webSiteJsonLd` | home | `@type: "WebSite"`, `name`, `url`; **no** `SearchAction` (Google retired the sitelinks search box in 2024 **[unverified as still ignored, check at R2 exit]**) |
| `productJsonLd` | PDP | one item without option groups → `Product` + `Offer`; one item with choice or matrix groups → `ProductGroup` (`productGroupID` = product key, `variesBy` from group names: couleur / color / لون → `https://schema.org/color`, taille / size / مقاس → `https://schema.org/size`, others listed as variants without `variesBy`), `hasVariant` ≤ 50 `Product` (name "{name} · Noir / M", `sku` = cell SKU ?? item SKU, image of the cell or option, `offers` = `Offer` with the unit price + option delta, `availability` from `applyStock`); 2-8 items → `Product` + `AggregateOffer` (low/high over available offers' `from`, `offerCount`), the landing builder's rule (`src/landing/document.tsx:247-293`) |
| Offer fields | PDP | `price` (2 decimals), `priceCurrency`, `availability` (`InStock` / `OutOfStock`), `itemCondition: NewCondition`, `url` = canonical; **never** `priceValidUntil`; `shippingDetails` only when the store's delivery data is complete (fallback or zone fees + ETA) **[field names validated with Google's Rich Results Test at R2 exit]** |
| `brand` | PDP | the store name unless it is a placeholder (`isRealStoreName`, `src/landing/context.ts:445`) |
| `itemListJsonLd` | collection | `ItemList` of the current page's products (`ListItem { position, url }`, ≤ 36) |
| `breadcrumbJsonLd` | PDP, collection (R3) | STO-§19.4 |
| `aggregateRating`, `review` | PDP (R3) | STO-§18.3 |

JSON-LD is serialised with `inlineJson` (`<` escaped) and hashed into the CSP like other inline scripts.

### STO-§20.5 Sitemaps and robots per store

- `/sitemap.xml` (core §C.8 route; S1 adds entries): home, active products (`lastmod` = `updated_at`), active non-empty
  collections, published custom pages without `noindex`, indexable landing pages, policy pages whose facts exist; at the
  canonical origin only. One file (≤ 50,000 URLs; the plans cap products at 2,000); a store above 45,000 entries would
  switch to an index file (not reachable under the plans). Cached per `catalog_version`, `s-maxage=300`.
- `/robots.txt` (core rules) + `Disallow:` `<base>/cart`, `<base>/checkout`, `<base>/search`, `<base>/track`,
  `<base>/reviews/`.

### STO-§20.6 Open Graph and social previews

PDP: `og:type=product`, `og:title`, `og:description`, `og:image` (the 1200 px rendition of the first image, absolute via
`mediaUrl`, width/height/alt), `product:price:amount` and `product:price:currency` (the default offer's `from`); other
kinds `og:type=website` with their hero or header image. WhatsApp previews (the main social channel) read these tags:
title ≤ 65 and description ≤ 155 characters, image ≥ 300 × 300.

### STO-§20.7 Temporary domain

In P mode every store shares the platform host under `/s/<h>`: canonical URLs, sitemaps and JSON-LD are correct, but
organic reach waits for S mode (subdomains) and R3 custom domains (core §C.10).

---

## STO-§21 Performance on cheap Android phones and 3G

### STO-§21.1 Targets

| Measure | Target | How it is checked |
|---|---|---|
| Field p75 (Core Web Vitals "good") | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 | R3: optional LCP/INP/CLS fields on the view beacon (PerformanceObserver, ≤ 600 B in the `store` chunk) |
| Lab "cheap Android on 3G" (Playwright msedge, 360 × 740 and 390 × 844, DPR 2, CPU 4× slower, 1.6 Mbps down / 750 kbps up / 150 ms RTT **[proposal, fixed at the R2 perf baseline]**) | per kind: PDP LCP ≤ 3.0 s, home ≤ 2.6 s, collection ≤ 2.6 s, cart ≤ 2.0 s, checkout ≤ 2.0 s, thank-you ≤ 1.8 s; TBT ≤ 200 ms everywhere; CLS ≤ 0.05; checkout keypress-to-paint ≤ 50 ms p95; city pick → new total ≤ 100 ms | `qa:storefront-perf` on fixtures (STO-§26.3), one run per kind × locale × buy model |
| Lab 4G (the wow-demo profile, rf §4: 9 Mbps / 170 ms RTT) | PDP LCP ≤ 2.5 s (the demo's step 1:55 condition), checkout submit → thank-you ≤ 1.5 s incl. the server | `qa:storefront-demo` (STO-§26.4) |
| Server | cache hit ≤ 5 ms p95; miss ≤ 120 ms p95; 304 ≤ 2 ms without a DB query; ≤ 4 queries per miss; `publishStorePage` incl. the gate render ≤ 1.5 s p95 | `qa:storefront-perf` server timings + R2 load test (core §K.4: 200 concurrent cold PDP requests render once, p95 ≤ 400 ms end to end on XAMPP) |

### STO-§21.2 Byte budgets (gzip; rev 2 aligned with core D52)

| Item | Soft | Hard |
|---|---|---|
| Document (HTML + inline CSS + inline JS + configs): home, collection, page | ≤ 60 KB | 140 KB (`budget:F5`, publish refused; a live render above it is served and flagged, STO-§7.3) |
| Document: PDP (gate sample product, inline model) | ≤ 90 KB (≤ 36 KB of it JavaScript, STO-§14.1; ≤ 4 KB city table; ≤ 24 KB CSS incl. the `css` key margin, DES-R5) | 140 KB |
| Document: cart, checkout, search, not_found | ≤ 45 KB | 140 KB |
| `<picture>` elements per document | ≤ 16 on home and PDP (gallery thumbnails count once as a group); collection: 24 cards + header | 32 |
| LCP image | ≤ 120 KB AVIF at 1× mobile width (WebP fallback), preloaded with `imagesrcset`, `fetchpriority="high"`; ≥ 1.5 × the slot width at DPR 2 (DES V11) | — |
| Fonts | ≤ 2 preloaded files ≤ 80 KB together; ≤ 2 families / ≤ 4 files per document (DB F5); the Arabic subset only on `ar` documents; `font-display: swap` with metric overrides (`src/lib/theme/fonts.ts`) | > 4 files |
| Critical bytes before LCP (HTML + LCP image + fonts) | PDP ≤ 300 KB; home, collection ≤ 220 KB; cart, checkout ≤ 130 KB | — |
| Third parties | pixels (after the `load` event and idle, ≤ 2 s) and Turnstile (only after the first checkout interaction); nothing else (core §C.9: no tenant JS) | any other origin in the CSP |

### STO-§21.3 Rendering rules

- Every image and card reserves its box (intrinsic `width`/`height` or `aspect-ratio`); the header, the announcement bar
  and the sticky bar have fixed heights; skeletons match real row heights: CLS stays near 0.
- Below-the-fold sections use `content-visibility: auto` with `contain-intrinsic-size` (CSS only).
- Grid images: `loading="lazy"`, `decoding="async"`, exact `sizes`; renditions from the media pipeline's existing widths;
  the dominant colour (`ResolvedAsset.dominant`) as placeholder background.
- Main thread: each chunk boots in ≤ 30 ms (`pdp` ≤ 45 ms) at 4× CPU slowdown; no task of our code over 50 ms; input
  handlers ≤ 16 ms; passive scroll and touch listeners; reads and writes of layout batched in rAF.
- No `unload`; public kinds are bfcache-eligible (STO-§19.5).
- Motion: CSS only on store sections, ≤ 180 ms, `transform`/`opacity` only; none under `prefers-reduced-motion`.

### STO-§21.4 The 3G waterfall per kind (rev 2, STO-D42)

What a cold visit downloads before the first screen is usable, on the lab profile (1.6 Mbps ≈ 200 KB/s, 150 ms RTT).
Each row is a budget `qa:storefront-perf` asserts; the "then" column is deferred work that must not move LCP.

| Kind | Round trip 1: HTML (gz) | Round trip 2 (parallel): LCP image · fonts | Then (after `load` / idle) | LCP budget |
|---|---|---|---|---|
| PDP, inline model | ≤ 90 KB (≈ 0.45 s + RTT) incl. `pdp` + `checkout` + `store-pixels` + feature chunks (≤ 36 KB) and the city table (≤ 4 KB) | first gallery image ≤ 120 KB AVIF (preloaded) · ≤ 2 fonts ≤ 80 KB | other gallery images (lazy), pixel vendors (idle), Turnstile (first field interaction) | ≤ 3.0 s |
| PDP, cart model | ≤ 85 KB (`pdp` + `cart` + `store-pixels`) | same | same | ≤ 3.0 s |
| Home | ≤ 60 KB (`store` + `store-pixels` ≈ 6.7 KB JS) | hero image ≤ 120 KB or a colour moment (0 bytes) · fonts | grid images lazy, first row eager | ≤ 2.6 s |
| Collection | ≤ 60 KB | header image ≤ 80 KB or the first card ≤ 60 KB · fonts | rows 2+ lazy | ≤ 2.6 s |
| Cart | ≤ 45 KB (`store` + `cart` + `store-pixels` ≈ 12.7 KB JS); lines from `localStorage` | thumbnails 64 px ≤ 8 KB each · fonts | re-price request only when stale | ≤ 2.0 s |
| Checkout | ≤ 45 KB (`checkout` + `store-pixels` ≈ 12.2 KB JS + city table) | fonts only | Turnstile on first interaction | ≤ 2.0 s |
| Thank-you | ≤ 30 KB (`store-thanks` + `store-pixels` ≈ 7.2 KB) | fonts | Purchase pixel once | ≤ 1.8 s |

Rules that keep the waterfall flat: exactly one HTML round trip (no client fetch before LCP on any kind); the LCP image
is the first `<link rel="preload" as="image">` in `<head>` with `imagesrcset` and `fetchpriority="high"`; fonts are
preloaded only for the two faces the first screen uses; `content-visibility: auto` below the fold; no `@import`, no
external CSS; the `#sg-config` block is ≤ 6 KB gz on the checkout (the MA city list ≈ 3.5 KB, STO-§14.4) and ≤ 1 KB
elsewhere.

### STO-§21.5 Boot and interaction budgets

| Interaction | Budget (4× CPU) | How |
|---|---|---|
| Chunk boot (`store` / `cart` / `checkout` / `store-pixels` / `store-thanks`) | ≤ 20 / 25 / 30 / 10 / 15 ms | one pass over the DOM, listeners delegated on `document` |
| `pdp` boot | ≤ 45 ms, no task > 50 ms | module order of STO-§14.2; `gallery` defers off-screen slides |
| Offer or option change → price shown | ≤ 16 ms | the bridge reads the units module's selection; no layout read in the handler |
| City pick → delivery row + total | ≤ 100 ms end to end (≤ 2 ms compute) | `storeDeliveryFee` + `etaWindow` are pure over the config |
| Add to cart → sheet open | ≤ 180 ms animation, ≤ 16 ms of script | `localStorage` write, one `CustomEvent` |
| Checkout keypress → paint | ≤ 50 ms p95 | phone formatting without reflow; combobox filter ≤ 8 ms |
| Submit → thank-you (4G) | ≤ 1.5 s incl. the server (≤ 400 ms p95 for the order endpoint) | one POST, `location.assign` |

---

## STO-§22 Accessibility (ST-10) and right-to-left

### STO-§22.1 Standard and component rules

WCAG 2.1 AA everywhere (EN 301 549 for EU stores, ST-21).

| Component | Rules |
|---|---|
| Document | `lang` and `dir` on `<html>`; skip link first; landmarks `header` / `nav aria-label="Menu principal"` / `main` / `footer`; one `h1` per page (PDP: product name; collection: name; home: hero heading; custom page: title) |
| Focus | visible 2 px ring with offset in a token colour at ≥ 3:1 against its surroundings; never removed |
| Dialogs (menu drawer, cart sheet, zoom, filters, size guide) | `role="dialog"`, `aria-modal="true"`, labelled, focus trapped, Escape closes, background `inert`, focus returns to the opener |
| Carousels | no autoplay; previous/next buttons with names; a list structure; scroll-snap; every slide reachable by keyboard |
| Options | radio groups named by the group ("Couleur"); swatches carry a text name (visually hidden is fine) and a selected state that is not colour-only (border + check); sold-out options `aria-disabled` + "épuisé" in the name |
| Steppers | buttons named with the product ("Augmenter la quantité de {name}"); the new value announced politely |
| Forms | visible labels (never placeholder-only); `aria-invalid`; errors linked by `aria-describedby`; an error summary on submit; `autocomplete` tokens (STO-§15.5) |
| Live regions | cart changes, price updates, the new total after a city change, the stale banner: one polite region per page |
| Targets | ≥ 44 × 44 px for every control |
| Contrast | the theme engine's guarantees (text 4.5:1, large text 3:1, UI components 3:1); store CSS adds no colour outside tokens |
| Motion | `prefers-reduced-motion` = no movement, opacity only |
| Zoom and reflow | usable at 200 % zoom and at 320 px width without horizontal scrolling |
| **WCAG 2.2 additions (rev 2)** | 2.4.11 Focus not obscured: the sticky buy bar and the announcement bar never cover the focused element (`scroll-padding-block` = fixed heights; the sticky bar hides while the buy box or the checkout has focus) · 2.5.7 Dragging movements: every carousel and the gallery have previous/next buttons; the cart stepper has buttons; no drag-only control · 2.5.8 Target size: ≥ 24 × 24 CSS px minimum, 44 × 44 on touch (above) · 3.3.7 Redundant entry: the chosen city is remembered (`sg:<h>:city`) and prefilled at checkout; the buy-now hand-off keeps the selection · 3.3.8 Accessible authentication: not applicable (no accounts) |
| Announcements (one polite region per page) | cart count change ("Panier, 3 articles"), price update after an option change (the buy box's live price, `aria-live` on the price node only), the new total after a city change, the stale banner (`role="status"`), the error summary on submit (`role="alert"`, focus moved to it); never two announcements for one action |
| Images | the gallery's slides have `alt` = `AssetRef.alt` or "{product} · photo {n}"; decorative stage grounds are `aria-hidden`; the sold-out veil carries no text (the badge does) |

### STO-§22.2 Right-to-left

- Logical CSS properties only (`margin-inline-start`, `inset-inline-end`…); the menu drawer opens from inline-start and
  the cart sheet from inline-end, mirrored automatically.
- Directional icons (arrows, chevrons, breadcrumb separators) mirror; non-directional icons (cart, search, WhatsApp) do
  not.
- Prices, phone numbers, order ids, SKUs, codes and dates with digits sit in LTR isolates (`<bdi dir="ltr">`, or
  U+2066…U+2069 in plain-text strings, the `src/landing/i18n.ts` rule); product names in another script are wrapped in
  `<bdi>`.
- Latin digits by default; Arabic-Indic digits on `ar` pages only when the store setting `digits` is `arabic` (formatting
  through `Intl.NumberFormat` with the numbering system).
- Arabic text uses design's Arabic faces with body line-height ≥ 1.6; truncation never cuts a joined word mid-glyph
  (line clamp, not character slicing).

### STO-§22.3 Checks

- `qa:storefront-a11y` (`scripts/qa/storefront-a11y.ts`, no new dependency): static rules over every rendered kind
  fixture in ar and fr (alt on every image, a label on every control, unique ids, named buttons and links, heading
  order and one `h1`, landmarks, `lang`/`dir`, ARIA attributes from an allowlist, labelled dialogs, minimum target-size
  tokens); keyboard scripts in Playwright msedge (tab order header → main → buy box → checkout; Escape closes each
  dialog; focus returns); computed-colour contrast sampling of text on its background at 360 px.
- **rev 2 additions:** the focused element's rect never intersects the sticky bar's or the announcement bar's rect at
  every Tab stop of the keyboard script (2.4.11); every `[draggable]` or scroll-snap control has a keyboard and a tap
  alternative (2.5.7); target sizes measured from the rendered boxes (≥ 44 px on touch fixtures, ≥ 24 px everywhere);
  the live-region script asserts exactly one announcement per action (cart add, option change, city pick, stale,
  submit error); RTL1-RTL8 checks run on the ar fixtures (ranges in `<bdi dir="ltr">`, price cluster adjacency in the
  screenshot, no rotated Arabic, no clipped Arabic glyph box, the skip link invisible on plain scroll).
- Manual pass at R2 exit: TalkBack (Android Chrome) and VoiceOver (iOS Safari) through home → PDP → add → cart →
  checkout → thank-you (cart model) and PDP → inline checkout → thank-you (inline model), recorded in the R2 checklist.

---

## STO-§23 Admin screens (owner side)

### STO-§23.1 Routes and permissions (core §I.1, §I.3)

| Route | Screen | View | Write |
|---|---|---|---|
| `/app/<h>/catalog/products` | product list | `catalog.read` | `catalog.write` |
| `/app/<h>/catalog/products/new` | create: "À partir de photos" (generate wizard, catalog target, rf §1.10) or "Vide" | `catalog.write` | — |
| `/app/<h>/catalog/products/<id>` | product editor | `catalog.read` (read-only form) | `catalog.write` |
| `/app/<h>/catalog/collections`, `/<id>` | collections | `catalog.read` | `catalog.write` |
| `/app/<h>/catalog/inventory` | stock table | `catalog.read` | `catalog.write` |
| `/app/<h>/catalog/coupons` (R3) | coupons | `coupons.manage` | `coupons.manage` |
| `/app/<h>/storefront` | storefront overview | `pages.read` | — |
| `/app/<h>/storefront/pages/<id>/edit` (full-screen `(editor)` layout) | store page editor | `pages.read` | `storefront.write` |
| `/app/<h>/storefront/menus`, `/storefront/chrome` | menus; header, announcement, footer, WhatsApp | `pages.read` | `storefront.write` |
| `/app/<h>/settings/checkout` (landing.md screen; S1 adds the "Boutique" block) | buy model, fallback fee, WhatsApp alternative | `settings.read` | `checkout.write` |
| `/app/<h>/reviews` (R3) | moderation | `reviews.moderate` | `reviews.moderate` |

Nav (`src/components/admin/shell/nav/storefront.ts`, group "Catalog", modes `store` and `both`): Produits, Collections,
Stock, Boutique (storefront), Codes promo (R3), Avis (R3). Every screen follows the shell foundation (core §I.6: tokens,
density, motion ≤ 240 ms with no bounce, real-data KPIs) and design's admin system (DES-§16).

### STO-§23.2 Product list

- Header "Produits" with the plan meter ("38 / 200", core §A.4), primary "Nouveau produit" (menu: À partir de photos ·
  Vide).
- Toolbar: search (server, 250 ms debounce), status chips (Tous, Actifs, Brouillons, Archivés), collection filter, stock
  filter (Épuisé, Stock bas, Suivi).
- Rows: thumbnail 40 px, name (+ slug muted), status pill, "Dès 199 DH" (tabular), stock chip (En stock · Bas (3) ·
  Épuisé · Non suivi), collections count, updated (relative, store timezone). Row click opens the editor.
- Multi-select → bulk bar: Activer, Brouillon, Archiver, Ajouter à une collection…, Retirer d'une collection (≤ 100).
- Keyboard: ↑ ↓ move, Enter open, X select, ⌘K "Nouveau produit".
- States: skeleton rows while loading; empty state = a preview of what a product page will look like + "Ajoutez votre
  premier produit à partir de photos"; error with "Réessayer"; the limit sheet on `quota`.

### STO-§23.3 Product editor

- Layout ≥ 1,200 px: the form (7/12) and a live preview (5/12) of the PDP in a sandboxed iframe (core §I.2 rule),
  refreshed 400 ms after the last change through `previewProductAction(draft)` (server render, `mode: "preview"`);
  < 1,200 px: a "Aperçu" toggle.
- Header: back, name, status segmented control (Brouillon · Actif · Archivé), "Voir sur la boutique" (canonical URL;
  "Aperçu" for drafts), a sticky save bar with the unsaved indicator, "Enregistrer" (⌘S) and "Annuler les
  modifications". Unsaved drafts survive a reload in `localStorage` (`sg-admin:<userId>:<storeId>:product:<id>`,
  cleared on store switch, core §B.4).
- Sections (anchored tabs): **Produit** (name, tagline, description, category, photos: picker, order, focus, alt) ·
  **Articles et options** (the Offers v2 item and option editors, `src/components/admin/{items,variants}`) · **Offres**
  (the Offers v2 offers panel with the display axes, `src/components/admin/offers`) · **Contenu de la page** (content
  sections: list, add from the eligible library, inspector driven by `FieldSpec`, "Générer" through ai.md tasks) ·
  **Stock** (axis per item, counts table, low thresholds, "Afficher le stock bas aux clients") · **Référencement**
  (slug with the live URL, title and description with counters, OG image, `noindex`, Google and WhatsApp preview
  cards) · **Collections** (multi-select, primary collection) · **Pages de vente** (rev 2: one row per attached
  landing with its status (En ligne / Synced with the product / Out of sync / Brouillon), the sync time, and its
  **override chips** computed by `offerOverrides` ("Pack Duo 449 DH · prix produit 2 × 249 = 498 DH · −49 DH"; a 1-unit
  offer below the product price carries the two-prices warning); "Créer une page de vente"; "Relier une page existante";
  "Détacher"; "Resynchroniser" when out of sync) · R3: **Guide des tailles**, **Traductions**.
- Validation: `checkProductDoc` issues and `offerWarnings` listed at the top with jump links; errors block save,
  warnings do not.
- Conflict (another member saved): a sheet "Ce produit a été modifié par {name} à {time}" with "Recharger" (keeps a copy
  of the local edits) or "Écraser" (owner and admin only, audited).

### STO-§23.4 Collections and inventory

- **Collections list**: drag to reorder (positions), status, product count; **editor**: name, slug, description, image,
  status, default sort, products (search + add, drag order, ≤ 500), SEO.
- **Inventory**: grouped by product, one row per stock key: variant label ("Noir / M"), SKU, on hand (inline number
  input, Enter saves, Escape cancels), held (R3), available, low threshold, status chip; filters (Épuisé, Bas, Non suivi,
  Orphelins); a history drawer per key from `inventory_moves` (date, delta, reason, order link, member); counts import
  through the CSV importer (`import_mappings`, kind `products`, operations.md).

### STO-§23.5 Storefront overview (`/app/<h>/storefront`)

Cards, in order: **Adresse de la boutique** (P2's live address card, core §I.4: canonical URL with copy, QR, "Share on
WhatsApp", **"Open a test order"** minting the STO-D33 store token, "Create a campaign") · **Design de la boutique**
(rev 2, STO-D39: the brand DNA card with chips and the why line, the active theme version, "Generate my store design"
(`startStoreDesign`: three instant candidates at once, the deep pass as a job with its stage line when Cloud AI is on,
STO-§11.5; **rev 3, UX-20:** the three candidates are shown as **three real home folds at equal width** (≤ 440 px each
on a desktop, hover / focus expands one to a full scrollable preview, the DNA card under each; on a phone candidate 1 is
the live fold edge to edge, the three folds in a snap carousel with an 8 % peek, DNA chips in a bottom sheet, "Utiliser
ce design" sticky), never one large frame with two small cards, so the distinctiveness the engine worked for is seen at a
glance and the layout does not bias the choice), "Design studio" (S2)) · **Pages de la boutique** (Accueil, Page produit, Collection, Recherche, Panier,
Paiement, Page introuvable, then the custom pages; each with "En ligne" / "Modifications non publiées" / "Brouillon" /
"Hors budget" (STO-§7.3), Modifier, Aperçu) · **Mode d'achat** (inline or cart, with the recommendation from STO-D8
explained in one line) · **Livraison** (zones summary with the dated example line for a sample city, or the fallback
fee; link to the delivery settings; an error card when neither exists) · **Pixels de la boutique** (the library picker,
Offers D6 rule) · **En-tête et menus** · **Pied de page et annonce**. The rev 1 checklist ring is **replaced** by the
one Store Health ring (core D53, §I.7): the store's issues from every track appear on the dashboard and here with the
storefront rules of STO-§23.8; no second score exists.

### STO-§23.6 Store page editor and checklist

- The editor composes the builder shell's parts (section list, preview iframe, inspector) in
  `src/components/admin/storefront/page-editor/**` with its own state store `src/lib/editor/store-page.ts` (the landing
  editor store is untouched, LND-30): kind-aware tabs (Sections; SEO for home and custom pages), the "Ajouter une section"
  library filtered by `KIND_RULES` and `ELIGIBILITY`, variant picker, `bg` / spacing / divider, the data inspector
  (`FieldSpec`), a product binder for landing sections on home and custom pages, drag and keyboard reorder (Alt + ↑ ↓),
  undo/redo, versions, and the publish dialog.
- The editor mounts P6's **Design check panel** and **DNA card** (DES-§15.1, §15.4; STO-D39) for `home` and `page`
  kinds; the Design check runs `runGates` with the kind's register on every change (≤ 8 ms) and offers the same
  one-click fixes as the landing builder.
- **rev 4 (AI-19 consumer, core §K.4 S1 row, §L.2):** for `home` and `page` kinds only, the editor also mounts S7's
  **"Director review"** button (`critique.doc`, R2, Cloud AI on, on request; `src/components/builder/ai/**` is P7 / S7's,
  S1 imports it): digest + tiles of the current `StorePageDoc` → ≤ 3 ops from design's closed `AI_REPAIR_OPS`, applied
  one click at a time through `src/lib/editor/store-page.ts` under ai's **one acceptance rule** (AI-§A.8.2 stage 5,
  QUAL-9: an op is kept when no new hard item appears, the slop score does not rise and every novelty band stays `ok`;
  Q is reported, "no gain" shown when Q did not move). Utility kinds get no button (never critiqued, never pooled).
  With Cloud AI off the button is absent, never disabled-with-a-teaser.
- `storePageChecklist(doc, ctx)` (`src/lib/editor/store-page.ts`, pure over preloaded data) is the **builder mirror** of
  the server gate: it produces the same `GateItem` ids the publish gate produces (core §M.5), so the publish dialog is
  never the first time an item appears. The server side is `src/lib/render/prepublish/storefront.ts` (STO-D35), one
  check function registered with `registerPrePublishCheck("storefront", …)`:

| Level (gate code) | Id | Item | Fix |
|---|---|---|---|
| hard (`budget_blocked`) | `storefront:required_missing` | a required section is missing (KIND_RULES) | add the section |
| hard (`budget_blocked`) | `budget:C2`, `budget:C3`, `budget:F5`, `budget:R1`, `budget:I1` | the per-kind budgets of STO-§6.1 (fold contract, sections, height, HTML gz, CTAs, photo reuse), measured on the template rendered with the gate sample product / fullest grids; height and fold items refuse only outside the model's error band and say "estimated" inside it (rev 3, ENGP-6) | open the section named; remove the duplicate |
| hard (`honesty_blocked`) | `storefront:checkout_fee_unset` | `checkout` template (or a PDP in the `inline` model) while `storeDeliveryFee` would answer `not_set` for some served city (no zone covers it and no fallback fee) | open delivery settings |
| hard (`honesty_blocked`) | `storefront:hero_price_without_product` | a `stage` / `specimen-sheet` hero without an active product with a cutout | pick a product or another family |
| hard (`honesty_blocked`) | `storefront:announcement_claim` | an announcement message claiming free delivery, a delay or a discount the delivery data or the catalogue does not support (regex over the message against the facts of STO-§12.6) | edit the message |
| hard (`honesty_blocked`) | `storefront:fact_missing` | a trust fact, bestseller label, countdown, stock line or rating that would render without its source (STO-D37; normally impossible by construction, this catches a hand-edited doc) | remove it |
| hard (`honesty_blocked`) | `attach.compare_not_real` | an attached landing's offer compare-at that is neither the computed reference nor the product compare-at × units (LAN-§17.3) | reset the compare-at |
| hard (`honesty_blocked`) | `storefront:pixel_unanswered` | the storefront has no pixel answer ("Choisissez les pixels de la boutique ou « Aucun pixel »") | open the pixels card |
| hard (`design_blocked`) | `design:*` hard rows | `runGates` on the `GateInput` built by design's `gateInputFor(doc, ctx)` (rev 3, ENGP-1) with the kind's register (DES-§8.2; commerce: glass, motion, accent area, decor are hard); the clone block N01 / N02 / N08 **on `home` and `page` only** (utility kinds are never pooled or novelty-checked) | the gate's `fix` ops |
| hard (`design_blocked`) | `storefront:home_invariant` | home H1, H3, H10, H11 (390 × 844 through the band), H12 (STO-§11.3) | the invariant's fix |
| hard | `storefront:bound_inactive` | a bound product or a hand-picked grid whose every product is inactive | rebind |
| hard (`honesty_blocked`) | `storefront:brand_protected` (rev 3, SEC-18) | a store page heading, announcement message, menu label, footer statement or custom page title that contains an **exact** protected brand term (**rev 4:** through P1's `checkBrandTerms(kind, value): Promise<"ok" \| "near" \| "exact">`, core D76 / §K.2 P0, the one implementation over `brandTokens()` and the active `protected_brands`, called at every `saveStorePage` / `saveStorefrontSettings` / product and collection name write; `"near"` writes a console flag instead of refusing); staff accounts are exempt | edit the text (the limit sheet names the term) |
| hard (`honesty_blocked`) | `storefront:form_field_foreign` (rev 3, SEC-18) | any `<input>`, `<select>` or `<textarea>` in the rendered document outside `form[data-sg-checkout]`, `form[data-lp-form]`, the header search and the city combobox, and any `type="password"`, card-number pattern or `otp` field anywhere (never legitimate on a COD page; impossible by construction since store pages have no custom HTML, this catches a regression in a section); **rev 4:** the store mirror of landing's `honesty:password_field` (core D76, §M.3), sharing its pattern list (`src/lib/render/prepublish/landing.ts` exports it, a CCR to P3 if not) so both refuse the same fields | remove the section |
| note | `storefront:home_soft` | home H2, H4-H9, H13; eyebrow share > 30 %; > 2 centred sections in a row | one-click fix each |
| note | `storefront:menu_dead` | dead menu links (dropped at render) | open the menus editor |
| note | `storefront:alt_missing`, `storefront:seo_missing` | images without alt; missing SEO description | fill (AI-09 offer) |
| note | `storefront:grid_soldout`, `storefront:tile_empty` | sold-out products in a hand-picked grid; an empty collection in a tile section | edit the source |
| note | `storefront:facts_missing` | missing returns or contact facts (the trust strip renders fewer items) | open policies |

Every id has a title in ar/fr/en (`test:i18n-coverage` covers gate titles, core §I.5), names the measured value and the
limit, and offers one fix (core §M.5). Re-renders run the same checks in `warn` mode and surface the notes in Store
Health (core §M.1 rule 5).

### STO-§23.7 Admin copy keys (`src/lib/i18n/admin/<locale>/storefront.ts`; en and fr in R2, ar in R3, core D36)

| Key | en |
|---|---|
| `catalog.products.title` | Products |
| `catalog.products.new` | New product |
| `catalog.products.fromPhotos` | From photos |
| `catalog.products.blank` | Blank |
| `catalog.products.empty` | Add your first product from photos. We prepare the page, you check the facts and set the prices. |
| `catalog.status.draft` / `.active` / `.archived` | Draft / Active / Archived |
| `catalog.stock.in` / `.low` / `.out` / `.untracked` | In stock / Low ({n}) / Sold out / Not tracked |
| `catalog.editor.unsaved` | Unsaved changes |
| `catalog.editor.conflict` | {name} changed this product at {time}. |
| `catalog.editor.priceFromProduct` | Price, options and stock come from the product {name}. |
| `catalog.stock.axis` | Track stock by |
| `catalog.stock.showLow` | Show low stock to shoppers |
| `catalog.landings.create` | Create a sales page |
| `catalog.landings.attach` | Link an existing page |
| `catalog.landings.detach` | Unlink from the product |
| `catalog.limit.products` | Your plan allows {limit} products. Archive products you no longer sell, or ask for more. |
| `storefront.title` | Storefront |
| `storefront.pages` | Store pages |
| `storefront.status.live` / `.changes` / `.draft` | Live / Unpublished changes / Draft |
| `storefront.buyModel.inline` | Order form on the product page |
| `storefront.buyModel.cart` | Cart and checkout |
| `storefront.buyModel.hint` | Recommended for {n} products: {model}. |
| `storefront.delivery.missing` | Set your delivery zones or one delivery fee before the checkout can go live. |
| `storefront.pixels.missing` | Choose the pixels of your store, or "No pixel". |
| `storefront.generate` | Generate my store design |
| `storefront.checklist.title` | Before you publish |
| `storefront.publish.home` | Use the store home as your home page? |
| `storefront.menu.dead` | This link points to something that is no longer published. |
| `storefront.design.generate` (rev 2) | Generate my store design |
| `storefront.design.deepRunning` | Deep design pass running · {stage} |
| `storefront.design.apply` / `.undo` | Apply this design / Back to the previous home |
| `storefront.design.why` | Why this design |
| `storefront.test.open` | Open a test order |
| `storefront.test.banner` | Test order: not counted |
| `catalog.fromPhotos.review` | Check the facts, type the prices, then create {n} drafts. |
| `catalog.fromPhotos.noPrice` | Price (required, never guessed) |
| `catalog.landings.override` | Override: product price {reference} · this pack {price} ({delta}) |
| `catalog.landings.singleBelow` | Shoppers who also see the product page see two prices for one unit. |
| `catalog.landings.synced` / `.outOfSync` | Synced with the product / Out of sync: the last update could not be published |
| `catalog.landings.feeDiffers` (rev 3) | Delivery fee differs from your zones: {pageFee} on this page, {zoneFee} for {city}. |
| `catalog.landings.chargeByCity` (rev 3) | Charge delivery by city on this page |
| `catalog.manual.catalogMode` (rev 3) | Catalog products |
| `catalog.manual.feeUnset` (rev 3) | No delivery fee is set for this city. Fix your zones or adjust the total. |
| `catalog.stock.short` (rev 3) | Not enough stock for {variant}: {available} available. |
| `catalog.stock.reserveAt` / `.reserveAtConfirmed` / `.reserveAtOrder` (rev 3, R3) | Reserve stock / When a confirmed order is placed (recommended) / As soon as an order arrives |
| `storefront.brand.protected` (rev 3) | This text contains a protected brand name ({term}). Change it before publishing. |
| `health.sf.checkoutFee` … (STO-§23.8 texts) | see STO-§23.8 |

### STO-§23.8 Store Health rules (SF-03 inputs; `src/lib/health/rules/storefront.ts`, R2; core §I.7, STO-D40)

Each rule is `HealthRule` (core §I.7): store data only, ≤ 40 ms, silent below `minN`, one `HealthFix`, `release: "R2"`,
`mode: "storefront"` or `"catalog"`. Points follow the core's severity ladder (1 → 3, 2 → 6, 3 → 10) inside the group
caps (setup 20, trust 15, design 15, conversion 15, operations 15, integrations 15, quota 5).

| Id | Group | Sev. | Rule (evidence `{ metric, value, window, n }`) | Fix |
|---|---|---|---|---|
| `sf:checkout_fee_unset` | setup | 3 | store mode `store` / `both`, checkout published or inline model, and `storeDeliveryFee` answers `not_set` for ≥ 1 served city (`metric: "cities_without_fee"`) | `/settings/delivery` |
| `sf:home_unpublished` | setup | 2 | `store` / `both` with ≥ 1 active product and no published `@home` for > 24 h | `/storefront` |
| `sf:pixel_unanswered` | conversion | 2 | `storefront.pixels` unanswered while a store page is live | `/storefront` pixels card |
| `sf:menu_dead` | conversion | 1 | ≥ 1 dead `main` menu link dropped at render (`metric: "dead_links"`) | `/storefront/menus` |
| `sf:product_no_photo` | conversion | 2 | active products without a photo (`n ≥ 1`) | `/catalog/products?filter=no_photo` |
| `sf:product_no_description` | conversion | 1 | ≥ 30 % of active products without a description (`minN` 5 products) | `/catalog/products?filter=no_description` |
| `sf:seo_missing` | conversion | 1 | ≥ 30 % of active products without `seo.description` (`minN` 5) | "Fill SEO for {n} products" (AI-09 action) |
| `sf:out_of_stock_live` | operations | 2 | an active product with every offer unavailable for > 7 days (`metric: "days_out"`) | `/catalog/inventory?filter=out` |
| `sf:compare_not_higher` | trust | 2 | an active product with `compareAt ≤ price` on any item | the product editor |
| `sf:page_over_budget` | design | 2 | a live template rendered > 140 KB gz or above the hard section/height budget since its last publish (STO-§7.3) | the template editor |
| `sf:redirect_hits` | conversion | 1 | a `catalog_redirects` row still receiving ≥ 20 hits/week after 6 months (an ad still points at an old slug) | the campaign links |
| ~~`sf:landing_fee_mismatch`~~ (rev 3, OPS-13; **withdrawn in rev 4**: the one rule is landing's `landing:fee_mismatch`, core §I.7 / D75, over P1's `zones.feeMismatchTop5`; two rules would score one page twice; the "Pages de vente" chip stays and reads the same input; the rev 3 text is kept below for the record) | trust | 2 | a live attached landing on `runtime_v = 2` whose flat `offers.shippingFee` differs from `storeDeliveryFee` for any of the store's top-5 cities by orders (30 days, `orders.city_key`) or for the `*` zone, while the store's zones carry fees (`metric: "pages_fee_mismatch"`, `n` = pages; `minN` 1; silent in `landing` mode where no PDP quotes a zone fee) | the product's "Pages de vente" tab ("Facturer par ville" when LP-16 exists, else the page's offers) |

`markHealthDirty(storeId)` is called by every catalog write, template publish, storefront-settings write and inventory
crossing (core §I.7). Design-quality issues of store templates (`q < 70`, slop) come from P6's `designHealth(scope)`,
not from this file. Acceptance: `test:health` fixtures for each rule with and without `minN`; the two-store fixture
proves no cross-store evidence; fixing an issue never lowers the score.

### STO-§23.9 Admin UX ceiling compliance (core §I.8 rules on the storefront screens)

Every screen of STO-§23 ships against DES-§16.17 and the eight rules of core §I.8:

1. **Instant**: product and collection lists hydrate from a cached first page; saves are optimistic with rollback
   (`saveProduct` conflict → the sheet, never a silent overwrite); every write carries the idempotency of the
   compare-and-set `rev`; skeleton rows mirror the final rows (40 px thumbnail, name, status pill, price) and appear
   after 150-300 ms.
2. **Keyboard**: chords `G K` → products (Katalog), `G B` → storefront (Boutique) registered in
   `src/components/admin/shell/commands/storefront.ts`; `C` → "New product" in store/both mode; `E` edit, `Enter` open,
   `X` select, `J/K` move in the product list; `⌘S` save in the editors; `?` lists them.
3. **Honest data**: the product list's "Dès 199 DH" is the computed `price_min_cents`; stock chips show the real count;
   the storefront overview shows no rate below `n ≥ 20` (page vitals come from P3's component with its `n ≥ 20` rule).
4. **One accent, one glass, no bounce**: tokens only; the live preview iframe is sandboxed; no spring in any storefront
   component (`test:admin-motion`).
5. **Dense but breathing**: compact density for the inventory table (32 px rows), comfortable elsewhere; tabular
   numerals in every price and count column.
6. **Phone-first**: the product editor collapses to a single column with a sticky save bar; the inventory table becomes
   two-line rows; 44 px targets.
7. **RTL by construction**: logical properties only (`test:admin-rtl`); SKUs, prices and slugs in `<bdi dir="ltr">`.
8. **No AI tells**: labels above inputs, no placeholder-as-label, no decorative dots on status pills (the pill text
   carries the state), no em or en dash in any copy key, no "Step 1/2/3" (the "À partir de photos" flow uses verb
   labels: "Déposer", "Vérifier", "Créer").

---

## STO-§24 Shopper microcopy (`src/storefront/i18n.ts`, LND-34)

Store keys fall back to the landing keys (`src/landing/i18n.ts`) where the meaning is the same (`form.*`, `thanks.*`).
Arabic is clear MSA with light, natural Darija in calls to action (the landing rule); no em or en dash as a separator;
numbers that must stay left-to-right are wrapped with the `ltr()` isolate. es, de, it, nl, pt start from `en` and carry
`needsReview` until an EU store launches (ST-21).

| Key | fr | ar | en |
|---|---|---|---|
| `cart.add` | Ajouter au panier | زيد للسلة | Add to cart |
| `cart.buyNow` | Commander maintenant | اطلب دابا | Order now |
| `cart.added` | Ajouté au panier | تزاد للسلة | Added to your cart |
| `cart.view` | Voir le panier | شوف السلة | View cart |
| `cart.continue` | Continuer mes achats | كمّل التسوق | Keep shopping |
| `cart.title` | Votre panier | السلة ديالك | Your cart |
| `cart.empty` | Votre panier est vide. | السلة ديالك خاوية. | Your cart is empty. |
| `cart.emptyCta` | Voir les produits | شوف المنتجات | Browse products |
| `cart.remove` | Retirer | حيّد | Remove |
| `cart.qtyDown` / `cart.qtyUp` | Diminuer la quantité de {name} / Augmenter la quantité de {name} | نقّص الكمية ديال {name} / زيد الكمية ديال {name} | Decrease quantity of {name} / Increase quantity of {name} |
| `cart.full` | Votre panier est plein (20 articles max). | السلة عامرة (20 منتج على الأكثر). | Your cart is full (20 items max). |
| `cart.priceChanged` | Le prix de {name} a changé : {old} → {new}. | ثمن {name} تبدّل: كان {old}، ودابا {new}. | The price of {name} changed: {old} → {new}. |
| `cart.removed` | {name} n'est plus disponible et a été retiré. | {name} ما بقاش متوفر وتحيّد من السلة. | {name} is no longer available and was removed. |
| `cart.checkout` | Passer la commande | كمّل الطلب | Checkout |
| `cart.deliveryNext` | Livraison calculée à l'étape suivante | التوصيل كيتحسب فالمرحلة الجاية | Delivery is calculated at the next step |
| `nav.menu` / `nav.close` | Menu / Fermer | القائمة / سدّ | Menu / Close |
| `nav.cart` | Panier, {n} articles | السلة، {n} منتجات | Cart, {n} items |
| `nav.search` | Rechercher | قلّب | Search |
| `nav.skip` | Aller au contenu | سير للمحتوى | Skip to content |
| `checkout.title` | Finaliser la commande | كمّل الطلب ديالك | Complete your order |
| `checkout.inlineTitle` | Commander maintenant | اطلب دابا | Order now |
| `checkout.showSummary` | Afficher le récapitulatif · {total} | شوف ملخص الطلب · {total} | Show order summary · {total} |
| `checkout.cod` | Paiement à la livraison : vous payez en recevant votre colis. | الدفع عند الاستلام: كتخلص ملي توصلك السلعة. | Cash on delivery: you pay when your parcel arrives. |
| `checkout.callPromise` | Un conseiller vous appelle pour confirmer. | غادي يعيط ليك واحد من الفريق ديالنا باش يأكّد معاك. | Someone from our team will call you to confirm. |
| `checkout.callWhenToday` (rev 3) | Un conseiller vous appelle aujourd'hui dès {time}. | غادي يعيط ليك واحد من الفريق ديالنا اليوم من {time}. | Someone from our team will call you today from {time}. |
| `checkout.callWhenTomorrow` (rev 3) | Un conseiller vous appelle demain dès {time}. | غادي يعيط ليك واحد من الفريق ديالنا غدا من {time}. | Someone from our team will call you tomorrow from {time}. |
| `checkout.callWhenDay` (rev 3) | Un conseiller vous appelle {day} dès {time}. | غادي يعيط ليك واحد من الفريق ديالنا نهار {day} من {time}. | Someone from our team will call you on {day} from {time}. |
| `checkout.addAddress` (rev 3) | Ajouter une adresse | زيد العنوان | Add an address |
| `footer.report` (rev 3) | Signaler cette boutique | بلّغ على هاد المتجر | Report this store |
| `checkout.whatsappNumber` | Ce numéro est sur WhatsApp | هاد الرقم فيه واتساب | This number is on WhatsApp |
| `checkout.otherCity` | Votre ville | المدينة ديالك | Your city |
| `checkout.street` / `checkout.postal` | Adresse (rue et numéro) / Code postal | العنوان (الزنقة والرقم) / الرمز البريدي | Street and number / Postal code |
| `checkout.priceUpdated` | Les prix ont été mis à jour. Vérifiez votre total puis confirmez. | تبدّلو الأثمنة. راجع المجموع وأكّد. | Prices were updated. Check your total, then confirm. |
| `checkout.confirmNew` | Confirmer avec le nouveau total | أكّد بالمجموع الجديد | Confirm with the new total |
| `checkout.error` | Une erreur est survenue. Réessayez, ou commandez sur WhatsApp. | وقع مشكل. عاود المحاولة ولا اطلب عبر واتساب. | Something went wrong. Try again, or order on WhatsApp. |
| `checkout.preview` | Aperçu : la commande n'est pas envoyée. | معاينة: الطلب ما كيتصيفطش. | Preview: the order is not sent. |
| `checkout.unavailable` | Commande temporairement indisponible. Écrivez-nous sur WhatsApp. | الطلب ما متوفرش دابا. كتب لينا فواتساب. | Ordering is paused for now. Message us on WhatsApp. |
| `delivery.to` | Livraison à {city} : {eta} · {fee} | التوصيل لـ{city}: {eta} · {fee} | Delivery to {city}: {eta} · {fee} |
| `delivery.range` | Livraison {min}-{max} jours ouvrés | التوصيل فـ {min}-{max} أيام ديال الخدمة | Delivery in {min}-{max} working days |
| `delivery.between` | Livraison estimée entre {from} et {to} | التوصيل المتوقع بين {from} و{to} | Estimated delivery between {from} and {to} |
| `delivery.free` | offerte | مجاني | free |
| `delivery.freeFrom` | Livraison offerte dès {amount} | التوصيل مجاني من {amount} | Free delivery from {amount} |
| `delivery.notServed` | Nous ne livrons pas encore à {city}. | مازال ما كنوصلوش لـ{city}. | We don't deliver to {city} yet. |
| `delivery.chooseCity` | Choisissez votre ville pour voir le délai et les frais | اختار مدينتك باش تشوف المدة وثمن التوصيل | Choose your city to see timing and fees |
| `delivery.yourCity` | Votre ville : {city} · changer | المدينة ديالك: {city} · بدّل | Your city: {city} · change |
| `trust.inspect` | Vérifiez votre colis avant de payer | شوف السلعة قبل ما تخلص | Check your parcel before you pay |
| `trust.returnsDays` | Retour sous {days} jours | الإرجاع خلال {days} أيام | Returns within {days} days |
| `trust.whatsapp` | Une question ? WhatsApp | عندك سؤال؟ واتساب | Questions? WhatsApp us |
| `pdp.from` | Dès {price} | من {price} | From {price} |
| `pdp.soldOut` | Épuisé | نفد من المخزون | Sold out |
| `pdp.notify` | Être prévenu(e) | علمني ملي يرجع | Notify me |
| `pdp.lowStock` | Plus que {n} en stock | بقاو غير {n} فالمخزون | Only {n} left in stock |
| `pdp.unavailable` | Ce produit n'est plus disponible. Voici des produits proches. | هاد المنتج ما بقاش متوفر. ها منتجات قريبة منو. | This product is no longer available. Here are similar ones. |
| `sort.label` | Trier : {current} | رتّب: {current} | Sort: {current} |
| `sort.featured` / `.newest` / `.price_asc` / `.price_desc` / `.bestsellers` | Sélection / Nouveautés / Prix croissant / Prix décroissant / Meilleures ventes | مختارات / الجديد / الثمن من الرخيص / الثمن من الغالي / الأكثر مبيعا | Featured / Newest / Price: low to high / Price: high to low / Best sellers |
| `collection.count` | {n, plural, one {# produit} other {# produits}} | {n, plural, one {منتج واحد} two {جوج منتجات} few {# منتجات} other {# منتج}} | {n, plural, one {# product} other {# products}} |
| `collection.more` | Voir plus | شوف المزيد | Show more |
| `collection.empty` | Aucun produit ici pour le moment. | مازال ما كاين حتى منتج هنا. | No products here yet. |
| `search.placeholder` | Rechercher un produit | قلّب على منتج | Search products |
| `search.none` | Aucun résultat pour « {q} ». | ما لقينا والو على «{q}». | No results for "{q}". |
| `search.ask` | Demandez-nous sur WhatsApp | سولنا فواتساب | Ask us on WhatsApp |
| `notFound.title` | Cette page n'existe pas, ou plus. | هاد الصفحة ما كايناش، ولا تحيّدات. | This page doesn't exist, or not anymore. |
| `notFound.cta` | Retour à la boutique | رجع للمتجر | Back to the shop |
| `footer.soldBy` | Vendu par {legalName}, {city} | البائع: {legalName}، {city} | Sold by {legalName}, {city} |
| `footer.cod` | Paiement à la livraison | الدفع عند الاستلام | Cash on delivery |
| `thanks.storeLink` | Voir la boutique | شوف المتجر | Visit the shop |
| `reviews.verified` (R3) | Achat vérifié | شراء مؤكَّد | Verified purchase |
| `reviews.disclosure` (R3) | Les avis proviennent de clients ayant reçu leur commande ; nous vérifions chaque avis par son numéro de commande. | التقييمات كتجي من زبناء توصلو بالطلب ديالهم، وكنتأكدو من كل تقييم برقم الطلب. | Reviews come from customers who received their order; we check each one against its order number. |
| `reviews.imported` (R3) | Avis importé | تقييم مستورد | Imported review |
| `delivery.estimated` (rev 2) | (estimation) | (تقريبي) | (estimated) |
| `delivery.estimatedBetween` | Livraison estimée entre {from} et {to} (estimation) | التوصيل المتوقع بين {from} و{to} (تقريبي) | Estimated delivery between {from} and {to} (estimated) |
| `delivery.estimatedOn` | Livraison estimée le {date} (estimation) | التوصيل المتوقع نهار {date} (تقريبي) | Estimated delivery on {date} (estimated) |
| `delivery.byCity` | Livraison selon la ville | التوصيل على حساب المدينة | Delivery depends on your city |
| `wa.order` | Commander sur WhatsApp | اطلب عبر واتساب | Order on WhatsApp |
| `wa.ready` | Votre message est prêt dans WhatsApp · Réf. {ref} | الرسالة واجدة فواتساب · المرجع {ref} | Your message is ready in WhatsApp · Ref. {ref} |
| `wa.toConfirm` | À confirmer : {options} | باقي نأكدو: {options} | To confirm: {options} |
| `test.banner` | Commande test : non comptée | طلب تجريبي: ما كيتحسبش | Test order: not counted |
| `test.thanks` | Commande test reçue. Rien n'a été envoyé à vos outils. | توصلنا بالطلب التجريبي. ما تصيفط والو للأدوات ديالك. | Test order received. Nothing was sent to your tools. |
| `pdp.gallery.counter` | {i}/{n} | {i}/{n} | {i}/{n} |
| `pdp.chooseOptions` | Choisissez vos options | اختار الخيارات ديالك | Choose your options |
| `hero.shopCollection` | Voir la collection | شوف المجموعة | Shop the collection |
| `hero.searchPlaceholder` | Que cherchez-vous ? | شنو كتقلب عليه؟ | What are you looking for? |

Every key is checked by `test:i18n-coverage` (core §I.5) for ar/fr/en completeness and for the absence of em and en
dashes and "Step n" labels; Arabic strings use Latin digits by default (RTL7) and wrap ranges in isolates (RTL1).

---

## STO-§25 Security and tenancy (store-specific)

- **Scoping**: every catalog, inventory, template, review and coupon function takes `StoreScope` first; every new
  table uses `storeRef()`, so lint rules L1-L3 and L10 cover it the day it is added (core §F.1); public lookups by key
  live only in the core's public resolver (request STO-R1).
- **One store per request**: a v3 order, cart re-price or lead whose keys resolve to two stores answers `invalid` and
  writes nothing; the attack suite proves it (STO-§26.2).
- **No tenant code**: owner text renders through React escaping; rich text through the landing `RichText` subset;
  `LinkRef.url` accepts `https://` only (no `javascript:`, no `data:`), rendered with `rel="noopener noreferrer"`; no
  custom HTML, script or style field exists on any store page (core §C.9).
- **Storage on the shared origin**: every key carries `sg:<handle>:` (STO-§14.5); names, phones and addresses never reach
  `localStorage`.
- **Enumeration**: unknown product, collection or page slugs answer the same branded 404 as drafts and archived items;
  coupon checks answer one generic `invalid` (`s:<sid>:coupon:ip:<ipHash>` 20/10 min); review tokens are hashed, single
  use, 60 days; the cart re-price endpoint never says why a key is unknown (`removed`).
- **Abuse**: buckets of STO-§7.6; the store order flood breaker; risk scoring and the blocklist shared with landing
  orders; Turnstile on the checkout when configured.
- **PII**: v3 orders and leads carry the same PII as v2 and follow core §F.11 (masked in the console, never in logs:
  `errorSummary` only); pixel advanced matching follows the landing rules (hashed in the browser, store-keyed,
  `sg:<h>:pxu` in `sessionStorage`).
- **Admin**: every action through `storeAction` (lint L9); impersonation is read-only (core §B.8); preview iframes are
  sandboxed (core §I.2). **rev 3 (SEC-5):** the storefront's repositories hold no customer PII (products, collections,
  inventory, templates, settings), and its screens show none: the inventory history drawer shows the order **id** and the
  member, never the customer; the "Pages de vente" tab, the storefront overview and the editors show no order. Where a
  storefront screen embeds an operations component that shows customers (the Convert sheet, STO-§16.9), that component
  reads through operations' repositories, which mask at the boundary when `scope.kind = "impersonation"` (operations'
  and the core's side, STO-R42). The attack suite's impersonation canary case (PLA-§O.3 canaries) covers every
  storefront route (`/app/<h>/catalog/**`, `/app/<h>/storefront/**`): the HTML and RSC payload contain none of them.
- **Brand terms (rev 3, SEC-18)**: `saveStorePage`, `saveStorefrontSettings` and the product / collection name fields
  run `brandTokens()` against the active `protected_brands` at every write (the core's signup-time signal re-used,
  STO-R38): `brand_exact` refuses for non-staff (`brand_protected`, the limit-sheet variant), `brand_near` writes a
  console flag; the publish gate repeats it (`storefront:brand_protected`, STO-§23.6) so a page approved as "Boutique
  Nour" cannot be published as "CIH Bank · Vérification"; `storefront:form_field_foreign` refuses any password, card or
  OTP field. The footer carries "Signaler cette boutique" once the core's insert-only `abuse_reports` endpoint exists.
  **rev 4 (core D76 accepted):** every check above calls P1's one function `checkBrandTerms(kind, value)` (P0 stub,
  `src/lib/platform/brand-check.ts`) and maps `"exact"` → `brand_protected` (error code in core §E.2), `"near"` → the
  console flag; S1 never calls `brandTokens()` directly. The report page **exists from R1** (`/report/<handle>` on the
  platform host, `recordAbuseReport`, no oracle on the handle), so the footer link is always present and absolute
  (STO-§10.3); store hosts answer 404 for `/report/*`. The nightly `platform:brand_term_live` health rule (P1) also
  scans live store page titles and headlines (`@home` / custom page `seo.title`, `storeHero` headings, active product
  names), read through `platformScope` and this part's read functions (`getLiveTemplate`, `listProducts`), so it needs
  no new storefront API.
- **Impersonation masking (rev 4, core D70):** operations' and the platform's read functions call
  `maskIfImpersonation(scope, row)` (`src/lib/platform/mask.ts`, P1's P0 stub) at the repository boundary; S1's own
  repositories return no customer field, so they call nothing; the one S1 component that renders customers (none in R2;
  the Convert sheet is S4's) would import operations' masked readers, never `orders` rows directly; the attack suite's
  masked-canary case (core §F.1, D70) over every `/app/<h>/{catalog,storefront}/**` route is the check.
- **Test tokens (rev 2)**: `hmac(exp, "test-order:<storeId>")` is store-bound and 2 h (core D54); a token minted for
  store A is an ordinary visit on store B; a test render is never cached and never indexed; `is_test` is set only by
  `resolveTestToken`, never from a body flag (lint L12 covers the store order and lead handlers).
- **WhatsApp intents (rev 2)**: the lead endpoint's `whatsapp` kind prices from the catalogue only (no price field in
  the schema), writes no phone, and its reference is unique per store; a ref of store A resolves nowhere from store B.
- **Experiments (R3)**: exposures carry an HMAC-hashed visitor id per store (`experiment_exposures.vid_hash`, core
  §D.6); an exposure posted with store A's context key from store B's host is refused (`storeHosts`).
- **Attack cases** this part adds to the suite (`scripts/qa/tenancy-cases/storefront.ts`, core §F.1): B's product key
  inside A's checkout and cart re-price; A's test token on B; A's product slug under B's handle; A's `WA-` ref from B's
  ⌘K; B's member calling every catalog, inventory, template and storefront action with A's ids; render-cache keys of one
  slug in two stores; a `sync` republish of A's attached page never reads B's product.

---

## STO-§26 Tests

### STO-§26.1 Offline (`npm test`)

| Script | File | Checks |
|---|---|---|
| `test:catalog` | `src/lib/catalog/selftest.ts` (+ `facts.selftest.ts`, `delivery.selftest.ts`, `fold.selftest.ts`, `from-photos.selftest.ts`) | **Proves (rev 4, STO-§1.5):** ST-01, ST-02 (menu item), ST-04, ST-05, ST-08, ST-09 (subset), ST-11, ST-14, ST-16, ST-17, ST-19, ST-20, ST-21, LP-16, AI-19, SF-08, SF-12, LP-11, the v3 manual pricing. `checkProductDoc` round-trips every Offers v2 fixture (`src/lib/page/fixtures.ts`); store rules strip rating, bump, upsell, `stockLeft`; `productAsPageDoc` valid for every fixture; `applyStock` on item, matrix and choice axes; stock-key hashing above 64 chars; `deriveProduct` ranges; `storeDeliveryFee` every branch over landing's `DeliveryZoneRow` fixtures; the ETA text of PDP, cart, checkout and `zoneLineFor` byte-identical for one city and instant against `test:delivery`'s expectations; `parseOrderPayloadV3` error keys incl. `test`; `priceLine` parity: for every fixture offer and selection, `n × orderTotals().subtotal` equals the runtime money module's value; `orderTextV3` examples and the 1,000-character cap; `contentsOfV3`; `composeStoreWaMessage` totals equal `orderTotals` and the schema has no price field; `materializeAttached` (appended, dropped, offers off) and `offerOverrides` (reference, delta, the single-unit warning, `attach.compare_not_real`); `foldText` / `tokens` / `arabiziToLatin`; search ranking fixtures; JSON-LD builders (no `priceValidUntil`, no `aggregateRating` in R2, `variesBy` mapping, `ItemList`); canonical rules table; `storeDocIssues` per kind incl. the per-kind budgets; **the store corpus, `npm test` subset (rev 3, ENGP-24)**: `checkHomeDoc` and `checkFold` over 4 storylines × 3 shapes × ar/fr × **8 seeds (192 homes)** and the 6 PDP families × 3 shapes × ar/fr with the 2-line and 3-line longest-name fixtures and a 1- and 3-offer `stack` picker: 0 hard items, fold contract 100 % at 390 × 844 through the band, the STO-§12.8 bottoms table within ± 5 %, same seed two shapes never the same (family, pairing, order); ≤ 40 s on the owner's PC (the full 1,200-home sweep with the 30 % share cap, the ≥ 60 distinct sequences per 100 and the 4-gram cap runs in `test:slow` and `qa:design-corpus`); `defaultTemplate(kind, shape)` × 3 shapes × ar/fr passes `runPrePublishChecks` in `block` mode and **two stores' identical utility templates are not clones** (no novelty item, no pool row; rev 3, ENGP-1); `proposeProductsFromPhotos` on the 12-photo fixture (8 ± 1, no price key, facts unticked); the facts table (each fact absent → its line absent); `storefront:*` gate items each fire on their fixture and nowhere else (incl. `brand_protected` and `form_field_foreign`); **rev 3 parity (STO-§16.8)**: public v3 = cart re-price = WhatsApp text = `createManualOrderV3` = `editOrderV3` totals on every fixture cart; a same-`rev` line with `ls` off by 1 cent → `changed` / `stale`; **city key (OPS-1)**: `cityKey("Fès") = "fes"` finds the zone stored as `"fes"`, "Autre" → `null` → `*`, the fixture shared with `test:delivery`; **rev 4 (CRIT1):** over `scripts/qa/fixtures/city-key.json` (P4), `zoneFeeOfTable(zonesForCheckout(fixture), v)` = `zoneFeeOfRow(zoneForCity(rows, cityKey(v)))` for every `City.value`, the `#sg-config.checkout.zones` object deep-equals the `lp-assist.dz` object built for the same store, and no store chunk's bundle contains `cityKey` (a bundle-text grep); `nextCallableAt` against P4's `isCallable` fixtures (STO-D45); **rev 4 (CRIT3):** the checkout chunk's `{when}` for a grid of instants equals `nextCallableAt(t, w)` on **P4's shared window fixture** `src/lib/callcenter/window.fixtures.ts` (the one `test:ops` and `test:delivery` read; Friday = key 5, a Ramadan override, a midnight-crossing range, a closed date) after a `JSON.stringify` / `JSON.parse` round trip of the embedded window, and the fixture's `configured: false` store renders no `{when}` and no hours line; `storeWindowId` changes at the store-local midnight and at each announcement boundary and nowhere else (fake clock); `lowStockDisplayChanged` truth table (ENGP-4); the `gateSampleProduct` query picks the max `LENGTH(doc) + LENGTH(content)` row (ENGP-17); 30 simulated engine-only homes in one niche publish with 0 `design:N8` refusals (QUAL-1) |
| `test:store-runtime` | `src/storefront/runtime/selftest.ts` | **Proves:** ST-05 (client side), ST-06, SF-05 (token carry), LP-11 (request shape). Cart store (merge, caps, expiry, cross-tab), storage keys per handle incl. `sg:<h>:test`, the test token carried from the `store` chunk to the v3 body, phone formatting and digit folding, city combobox matching, v3 payload builder ↔ parser round trip, bridge contract on the runtime's fixture DOM (the approach of `src/landing/runtime/selftest*.ts`), the WhatsApp intent request shape and the fallback link |
| `qa:storefront-render` | `scripts/qa/storefront-render-check.ts` (+ S1's fixtures `scripts/qa/render-cases/storefront.ts` for the maintainer's `render-check` harness, rev 4, core ENGP-12) | **Proves:** ST-02, ST-03, ST-04 (markers), ST-06 (tokens), ST-08 (URLs), ST-12, ST-13, ST-18, LP-08, DG-11, SF-05 (test render). Every kind fixture rendered in P and S bases, ar and fr, both buy models, every hero family: chunk budgets and the page cap (budget + 5 %; `store-page` ≥ Σ heaviest-set budgets, rev 3 ENGP-31; **rev 4:** both measured by `render-check` from `budgets.json.compositions["store-page"]` over S1's render cases, never by a second budget table); the landing chunk's sha256 equal to the value T3 recorded after R1.0 (`src/landing/runtime/landing.sha256`, rev 3 ENGP-26; **rev 4:** and its size at tolerance 0); **rev 4 (CRIT15, LAN-§3.9 rule):** every kind fixture, `checkout`, `thanks` and the chrome-wrapped `track` included, carries exactly one `a[href^="<platformOrigin>/report/<h>?p="][rel="nofollow"]` and no relative `/report` link, and no report href contains `?o=`, `q=`, `sg-test` or `#`; no `/admin` link; absolute canonical, og and JSON-LD URLs; CSP hashes match the inline scripts; orange scan on the inlined CSS through `scanOrange` from `scripts/qa/lib/orange.ts` (rev 3, ENGP-21: nothing under `npm test` imports the git-ignored `qa/`); `data-hero-cta` present on the buy action and the checkout submit, no `data-in` use for the sticky rule (UX-4); the store thank-you fixture contains no `lp-ty__aurora` and no `adm-aurora` / `adm-grain` class (UX-38; rev 4: and its colour moment is `.lp-ty__tint`); no server-rendered "{when}" text in any document (rev 4, STO-D45: the promise is computed in the browser); commerce register (no glass token, no transition > 250 ms, accent area ≤ 8 % by the height model); every image with width/height or aspect ratio; no `unload` in store chunks; the test render has no pixel script, the banner, `noindex`; the per-kind HTML gz and `<picture>` counts within STO-§21.2; the critical-byte sum per kind; no em or en dash in any rendered string; RTL1-RTL8 regexes on the ar fixtures |
| `test:health` (storefront rows) | `src/lib/health/rules/storefront.ts` fixtures inside P1's `test:health` | **Proves:** SF-03. STO-§23.8 rules with and without `minN`; no cross-store evidence; **rev 4:** a `both` store with a mismatched attached landing raises exactly one issue (landing's `landing:fee_mismatch`), never an `sf:*` one |

### STO-§26.2 Database (`test:storefront-db`, `scripts/qa/storefront-db-check.ts`, throwaway `cod_test_*` databases, core §J.2 guard)

**Proves (rev 4, STO-§1.5):** ST-01, ST-02 (mode 404), ST-03, ST-05, ST-06 (E.164), ST-07 (bumps), ST-13, ST-14, ST-15,
LP-07, LP-16, LP-23, DG-11 (brand bump), SF-05, SF-10, LP-11, the v3 manual pricing. **rev 4 cases:** a `store`-mode
onboarding through `createProduct(ctx, { facts })` + `setThemeDraft` leaves 0 `landing` pages and 1 draft product, and
`landing.inStoreMode` stays `false` (OPS-14, shared with platform's UX-01 list); `copyPageToStore` into store B
references only B's asset ids and a one-store `pages.write` member gets `not_found` (LP-23); an `ops.callingWindow`
write bumps `catalog_version` and the next GET of a page with the hours line renders the new hours (STO-§7.5); a
`cutout` render job for an asset referenced by an active product bumps that store's `catalog_version` once and no
other store's (STO-D47).

Product create/save/status with the quota and the conflict path · slug change → 308 and `catalog_redirects` · collection
membership and counts · every write of STO-§7.5 bumps `catalog_version`, **incl. (rev 3, ENGP-4)** a 3 → 2 count under
`showLow` (bumps), a 30 → 29 count (no bump), a nightly `catalog.bestsellers` run that changes one label (one bump per
store) and one that changes nothing (no bump): "every write that changes server HTML bumps" · the `shipped` hook
replayed twice decrements once · a crossing changes `rev` · **rev 3 (ENGP-10)**: a crossing on a product with an
attached landing rewrites its `html` and `product_rev` and creates **no** `page_versions` row; a price change creates
exactly one `sync` row per attached page, all ≤ 10 within the saving request (ENGP-16) · **rev 3 (OPS-15, STO-§16.9)**:
`createManualOrderV3` for 2 catalog lines totals exactly the public path's total for the same lines and city; `editOrderV3`
adding a sold-out variant changes nothing; a WhatsApp intent converted through `fromLead` is `converted` ·
**rev 3 (ENGP-15)**: a same-`rev` body with `ls` off by one cent answers `stale`, never an order · v3 orders: 2 lines ×
`n` happy path, price change → `stale` → confirm → success,
option sold out → `unavailable`, archived product → `removed`, `not_served` city, fallback fee, free threshold, free
offer, duplicate `idem` → same order id, honeypot decoy, two stores' keys → `invalid` with no row written, restricted
store → `unavailable`, landing-mode store → `unavailable` · **test session** (rev 2): a v3 order with a valid token is
`is_test = 1`, `sheet_status = 'disabled'`, no outbox item, no `stats_daily` row, `customers.test_count` only; the same
token on another store is an ordinary order; "Delete test orders" removes it after 1 h · v3 lead stored with `page_id`
NULL · **WhatsApp intent** (rev 2): a `whatsapp` lead with `phone` NULL, a unique `ref`, `total_cents` = the server's
total; 50 parallel intents → 50 refs · attached landing (rev 2): materialise at publish, a price change → a `sync`
version with the new `product_rev` and the old version kept, a content change → in-place re-render with no new row, an
order from old HTML → `stale`, a failed sync keeps the old version live and notifies, an override chip computed from
the fixture (449 vs 2 × 249) · template publish through `runPrePublishChecks`: a 17-section home is refused
`budget_blocked`, a checkout with no fee is refused `honesty_blocked` with `storefront:checkout_fee_unset`, a commerce
template with a glass variant is refused `design_blocked`; `warn` mode publishes and audits · tenancy
(`scripts/qa/tenancy-cases/storefront.ts`): a member of store B cannot list, read, save or delete A's products,
collections, inventory or templates through any action (identical not-found answers, A's rows byte-identical); B's
product key inside A's checkout refused; A's product slug under B's handle → 404; render-cache keys distinct for one
slug in two stores; A's test token on B; A's `WA-` ref from B · R3: two parallel **confirmations** for the last counted
unit in `reserveAt = "confirmed"` (the second gets `stock_short`, both orders exist) and two parallel orders in
`reserveAt = "order"` (the second line `unavailable`) (rev 3, OPS-30), 100 fake orders hold 0 units, 20 parallel
redemptions of a 10-use coupon (exactly 10 succeed), a review token used twice (second refused), an experiment arm
touching `productDetail` refused `exp.buy_box`.

### STO-§26.3 Browser and live

| Script | Checks |
|---|---|
| `qa:storefront-e2e` (Playwright msedge, production build on port 3451+, core §J.3) | **Proves (rev 4):** ST-02 (overflow), ST-04, ST-05, ST-11, ST-17, LP-07, AI-19, SF-02, SF-12. **rev 4 cases:** the MA checkout's default state has its submit bottom ≤ 844 px at 390 × 844 with the summary collapsed, ar and fr (no sticky submit, UX-37); the promise under the submit reads "aujourd'hui dès …" before the window's first range and "demain dès …" after its last, with the page served from the edge cache in both cases (CRIT3); the Director review button is absent with Cloud AI off and on utility kinds (AI-19). Cart model: home → collection → PDP → add → cart → checkout → thank-you; inline model: PDP → order; buy now; price changed in the admin mid-checkout → stale → confirm; city combobox with "طنجة", "tanja", "Tanger"; the dated delivery line changes with the city and matches the thank-you expectation text; **fold contract** (rev 2, rev 3): for every hero and PDP family × ar/fr × 2-line and 3-line name at **390 × 844** the `mustShow` elements' rects are inside the viewport before any scroll (the calibration of the server's `budget:C2` estimate: a family whose real rect exceeds 844 while the model said ≤ 844 fails the R2 exit and re-fits the coefficients, never a publish), and at **360 × 740** as a soft report per family (ENGP-23); **price changed mid-checkout on page 7 of 10** attached landings → the reload shows the new price and the order succeeds (ENGP-16); with an edge stub still serving the old HTML, the second `stale` shows landing's "Recharger la page" button (`lp.reload`, LAN-§17.4 rev 4) and pressing it after the TTL loads the new price; the sticky bar is hidden while the buy box or the checkout submit is ≥ 50 % visible and the WhatsApp float is docked while the bar is visible (UX-4); ar RTL screenshots at 360 and 1440 px for every kind (segmented ≤ 8,000 px, DB §1.4); keyboard-only path; pixels fired in order (ViewContent, AddToCart, InitiateCheckout, Lead, Purchase) against a stub and **not at all** in a test session; WhatsApp order opens `wa.me` with the server's total |
| `qa:storefront-perf` | **Proves:** ST-07, and the STO-§21 / STO-D42 budgets. The throttled profiles of STO-§21.1 per kind × locale × buy model: LCP, TBT, CLS, keypress-to-paint, city-pick latency; chunk boot times at 4× CPU (STO-§14.7); critical bytes per kind (STO-§21.4); server timings for hit, miss, 304 and the publish gate; 200 concurrent cold PDP requests render once |
| `qa:storefront-a11y` | **Proves:** ST-10, ST-16 (sheet focus). STO-§22.3 incl. the rev 2 additions |
| `qa:storefront-demo` (rev 2) | **Proves:** ST-09 (two stores), SF-02, SF-05, SF-12. The R2 store acceptance scenario of STO-§26.4, asserted end to end |
| Live (after the R2 deploy, core §H.10) | **Proves:** ST-08 (Rich Results), LP-07, SF-05 live. A `both` test store: product, collection, attached landing with an override chip, one cart order and one inline order placed through a **test session** (nothing in Sheets, nothing in CAPI, revenue 0), then one real order, the Sheets row, thank-you, tracking link; Rich Results Test on 3 URLs; a WhatsApp link preview; the home's DNA card and bands |

### STO-§26.4 The R2 store demo (three minutes from a photo batch to a confirmed test order; rf §4 adapted to the store)

Two screens like the R1 wow demo (core §K.2 criterion 12): persona 1 (the seller) on a mid-range Android phone on 4G,
persona 2 (the owner or an agent) on a laptop. Cloud AI **off** (the instant path must pass); the local model cache
empty. Test data: 12 photos of 8 products (3 group photos), a never-used phone number.

| Clock | Seller (phone) | Agent (laptop) | Budget (p75) | Pass condition |
|---|---|---|---|---|
| 0:00 | Opens `/app/<h>/catalog/products/new` → "À partir de photos", drops 12 photos | | upload ≤ 12 s on 4G; proposals ≤ 2 s after the last photo (rules path) | 8 ± 1 proposals, every price field empty, facts unticked |
| 0:30 | Types 8 prices, ticks 2 facts, "Créer 8 brouillons", activates them | | ≤ 1 s per save | 8 active products, `products` gauge 8 |
| 0:55 | Storefront overview → "Generate my store design" | | 3 instant candidates ≤ 2 s; the preview of each ≤ 1 s server | three homes with distinct hero families and `ok` bands, shown as three real folds side by side (UX-20); **at least one is `stage` / `specimen-sheet`** thanks to the estimated cutout of the argan photo (rev 3, STO-D47; the BiRefNet mask has not run yet); DNA cards show chips and a why line; no number of distance |
| 1:10 | Picks one, taps Publish | | render + gate ≤ 1.5 s | published; the dialog shows no refusal (fixtures pass the budgets); utility templates auto-published earlier |
| 1:20 | Address card → "Open a test order" | | — | `/?sg-test=<token>` on the store host; the banner shows; no pixel script |
| 1:30 | Home → PDP of product 3 → picks an option → inline checkout: name, phone, city "tanja" → Tanger, address → Confirmer | | PDP LCP ≤ 2.5 s on 4G; city pick → dated line ≤ 100 ms; submit → thank-you ≤ 1.5 s | the line reads "Livraison estimée entre … (estimation)" with the zone fee (Tanger found through `ZoneTable.city["Tanger"]` in the browser and stored as `orders.city_key = "tanger"` by the server, STO-D43 rev 4); the promise under the submit reads "Un conseiller vous appelle aujourd'hui dès {time}" computed in the browser from the `ops.callingWindow` the demo seed saves (core §Q.8 OPE Q.27n) and the thank-you repeats the same `{when}` from the session record (STO-D45); the order is `is_test`, risk < 70, `sheet_status = 'disabled'`, no outbox item; the thank-you shows the test notice and "Confirm on WhatsApp" |
| 2:10 | | Queue → `N` → the TEST order claimed → `1` confirmed | claim ≤ 300 ms; outcome ≤ 500 ms | `confirm_state = confirmed`; the drawer shows the TEST chip, the v3 lines with the option text and the delivery rule `zone` |
| 2:30 | Dashboard | | pulse ≤ 15 s | revenue KPIs at 0; the Store Health ring shows no `sf:*` issue except `sf:seo_missing` (a suggestion); "Delete test orders" available |
| 2:50 | PDP of product 3 → "Commander sur WhatsApp" | | lead ≤ 400 ms | `wa.me` opens with the server's total and a `WA-` ref; the lead appears in the inbox with kind WhatsApp and no phone |
| 3:00 | Done | Done | | total wall time ≤ 3:30 with human typing modelled at 150 ms per character |

Acceptance checks (automated in `qa:storefront-demo`): every pass condition; the run passes with Cloud AI off; the run
twice in two stores with the same photos yields homes whose novelty verdict is `ok` and whose hero families or pairings
differ; every page passes the no-orange scan; the test order never reaches Sheets, CAPI, `stats_daily`,
`stats_version_daily`, `agent_stats_daily` beyond the TEST-excluded columns, `customers` counters beyond `test_count`
or `ai_feedback`; a second agent pressing `N` does not get the same order; the tenancy gate is green on the same build.

---

## STO-§27 File ownership and build order (core §K.4, §K.5)

### STO-§27.1 R2 contract step (maintainer)

Writes from this spec (every item accepted in core §Q.2 and listed in core §K.4's contract step): the §STO-3 tables and
columns into `src/lib/db/schema.ts` and `drizzle/0006_r2.sql` (incl. `catalog_redirects`, `inventory_moves`,
`pages.attach_opts`, `page_versions.product_rev`, `page_versions.kind` + `'sync'`, `leads.page_id` NULL-able);
`src/lib/orders/contract-v3.ts` (STO-§16.1 incl. `test`, §16.4, §15.11 incl. `kind`); `src/storefront/types.ts`,
`src/storefront/schema.ts`, `src/storefront/kinds.ts` and `src/storefront/fold.ts` (`FoldLayout`, STO-§9.5) as frozen
contracts; the budget keys (core §H.13); the package scripts (core §J); `resolveProductKey` / `resolveContextKey`;
`attachedDocFor` applied by `orderVersion`, `contentIdOf` (STO-R12 (b), (c)); the **widening of `OrderDraft`** for v3
(`createOrderRow` itself is T3's R1.0 extraction, rev 3 ENGC-13, STO-R35); `ensureTemplateSet` (STO-R17); the STO-R19
stubs (`getStoreTheme`, `zonesForCheckout` = `listZones`, `zoneLineFor`, `etaWindow` / `etaText`, `signedTrackPath`,
`waConfirmText`) and the `catalog_version` bumps on zone, theme, brand, `store` and `policies` writes;
`republishAttached` as the `product` render handler and `onProductChanged` (LAN Q24); lint L11; the typed
`orders.items` / `pages.draft` unions (STO-R2, R8); the settings keys `storefront` and `checkout.store` with their
first schemas; the import line of `src/lib/render/prepublish/storefront.ts` in `prepublish.ts` and the per-kind
`BudgetProfile` hook (second-round request STO-R25). **rev 3 additions to the contract step (third-round requests,
STO-§29.4):** the `PageDoc | StorePageDoc` union on `GateInput.doc`, `genomeOf` and `estimateHeights`, design's
`gateInputFor` adapter and the additive widening of `FoldReport.items` to `Partial<Record<FoldItem, number>>` (STO-R29);
`callingWindowFor(scope)` / `nextCallableAt` as P4 stubs if not already in R1 (STO-R32); the `createManualOrderV3` /
`quoteManualOrderV3` / `editOrderV3` signatures frozen for S3's sheet (STO-R30); the derived `store-page` rule in
`scripts/build-store-assets.mjs` (ENGP-31); the R2 LP-16 contract items if accepted (STO-R31). **rev 4 (core §K.4 rev 3,
as decided):** every rev 3 item above was accepted (core §Q.8), the v3 manual functions are frozen for **S4**'s sheet
(not S3's), LP-16 is in (D75: `landing-v3` entry, config v3 with `zones: ZoneTable`, `storeDeliveryFee` shipping for
`runtime_v = 3`, the `landing-v3` budget key = the re-measured `landing` + 500 B, `export:runtime_v3_unsupported`), and
the step adds the onboarding entry points `createProduct(ctx, { facts })`, `setThemeDraft(ctx, direction)` and the
direction-aware `productAsPageDoc(product, { …sctx, direction })` (STO-§4.1, §4.5; PLA Q3.8), the
`budgets.json.compositions["store-page"]` entry (core ENGP-12) and the pre-registered `scripts/qa/render-cases/storefront.ts`.
P4's `cityKey` stays P0 (R1) and server-only on this side; P4's JSON-safe `EffectiveWindow` with `configured` and
`shopperPromiseAllowed` (OPE rev 4, OD63) is embedded in the store config as is, so no serialiser is needed.

### STO-§27.2 Track S1 STOREFRONT (R2) owns

| Area | Paths |
|---|---|
| Catalog logic | `src/lib/catalog/**` |
| Store rendering and serving | `src/lib/storefront/**`, `src/storefront/**` (except the **four** frozen contract files above (`types`, `schema`, `kinds`, `fold`), maintainer; rev 3, ENGP-27 corrected "three") |
| Store routes | `src/app/s/[store]/{p,products,c,collections,cart,checkout,search}/**`, `src/app/s/[store]/[slug]/[...rest]/route.ts`; **rev 3 (ENGC-8, "two tracks never own one file"):** in R2 S1 owns the **whole files** `src/app/s/[store]/route.ts`, `src/app/s/[store]/[slug]/route.ts` and `src/app/s/[store]/policies/**` (P3 is finished when R2 starts; D3's R3 edits go through S1's finished files), not "the store branches of" them; the `track/**` route stays landing's / D3's and gets the store chrome through **one import** of `wrapInStoreChrome(scope, html, kind)` from `src/lib/storefront/chrome.server.ts` (S1), the import line written by the maintainer at the R2 contract step (request STO-R18 restated, STO-R36) |
| Public store APIs | `src/app/api/public/store/{order,lead,cart,event}/**` |
| Admin | `src/app/app/[store]/{catalog,storefront}/**`, `src/components/admin/{catalog,storefront}/**` (rev 4: incl. `catalog/product-picker.tsx`, imported read-only by S4's manual-order sheet, core §K.4), `src/lib/editor/store-page.ts` |
| Onboarding entry points (rev 4, OPS-14) | `src/lib/storefront/onboarding.server.ts` (`setThemeDraft`; inside `src/lib/storefront/**`) and the `facts` form of `createProduct` in `src/lib/catalog/products.server.ts`; P2's `useDirectionAction` calls them and owns the flow |
| Extension files (core §K.3 extension points; rev 2 adds the rows marked +) | `src/lib/orders/hooks/storefront.ts` (stock decrement at `shipped`, hold release R3), `src/lib/jobs/tracks/storefront.ts` (jobs `catalog.bestsellers` nightly 03:40, `catalog.stock_reconcile` nightly, R3 `stock.holds_expire` per tick, `catalog.collections` nightly), `src/components/admin/shell/nav/storefront.ts`, `src/lib/i18n/admin/{en,fr,ar}/storefront.ts`, `src/lib/settings/keys/{storefront,checkout-store}.ts`, + `src/lib/render/prepublish/storefront.ts` (STO-D35), + `src/lib/health/rules/storefront.ts` (STO-§23.8), + `src/lib/pulse/contributors/storefront.ts` (`lowStock`, `outOfStock`, `templateDrafts`), + `src/lib/notify/kinds/storefront.ts` (`catalog.low_stock`, `catalog.out_of_stock`, `storefront.checkout_blocked`; core §I.4), + `src/lib/flags/defs/storefront.ts` (`store_experiments_arms` R3), + `src/components/admin/shell/commands/storefront.ts` (`G K`, `G B`, "New product", "Publish home", "Open a test order (store)"), + `src/lib/admin-data/search/storefront.ts` (products by name / SKU / slug, collections), + `scripts/qa/tenancy-cases/storefront.ts` |
| Landing parts owned by S1 in R2 (LAN-§26.2) | `src/lib/landing/{attach.ts, attach.server.ts, copy.server.ts}` (`materializeAttached`, `offerOverrides`, `republishAttached`, `copyPageToStore`), `src/components/builder/attach/**`, the product editor's "Pages de vente" tab (inside this part's admin files), the `product` render handler registration |
| Build and QA | `scripts/build-store-assets.mjs`, `scripts/qa/storefront-{render-check,db-check,e2e,perf,a11y,demo}.ts`, **rev 4:** `scripts/qa/render-cases/storefront.ts` (S1's fixtures for the maintainer's `render-check` harness, pre-registered at P0, core ENGP-12), `scripts/qa/lib/orange.ts` (STO-§8.4) |
| `landing-v3` runtime entry (rev 4, core D75) | written **with the maintainer** in the R2 contract step (the fork of `entry.ts` plus one zone lookup over `ZoneTable`); S1 wires the attach flow and the `both`-mode default, never edits `src/landing/runtime/entry.ts` |

Read-only for S1 (changes through CCRs, core §K.3): `src/landing/**` (runtime modules, sections, document),
`src/lib/page/**`, `src/lib/orders/{contract,validate,create,resolve,text,manual,edit,address}.ts`, `src/lib/render/**`
except `prepublish/storefront.ts` and `prepublish/storefront.fixtures.ts`, `src/lib/delivery/**` (P3 ships it in R1;
rev 1's "S1 writes `eta.ts` if absent" is withdrawn), `src/lib/callcenter/**` (P4; `callingWindowFor` is consumed, not
written), `src/lib/design/**` and `src/lib/theme/**` (P6/S2), `src/lib/experiments/**` (D3), `scripts/check-theme.ts`
(P6; `scripts/qa/lib/orange.ts` is S1's extraction, STO-§8.4). **rev 3 (ENGC-8):** every row of this table is written
as globs; the core's P0 script `scripts/qa/ownership-check.ts` (requested STO-R36) parses every track's rows in every
part spec and fails on an intersection, so the reviewers' check is mechanical. S1 rows intersect nothing: the
`src/lib/landing/{attach,attach.server,copy.server}.ts` files are P3's in R1 and S1's in R2 (different phases,
LAN-§26.2), `src/lib/settings/keys/checkout-store.ts` is distinct from landing's `checkout.ts`, and the manual-order
sheet (`src/components/admin/orders/manual/**`) stays operations' while S1 ships only the functions of STO-§16.9.
**rev 4:** the script exists as `test:ownership` (core §J.1, accepted); the sheet is **S4**'s in R2 (core §K.4), which
imports S1's `catalog/product-picker.tsx` without owning it; `src/components/builder/ai/**` (the Director review
button) is P7 / S7's and S1 only mounts it; `src/lib/callcenter/window.ts` and `src/lib/delivery/eta.ts` are imported
by store chunks as pure modules and stay P4's / P3's. Expected CCRs: exports
from landing runtime modules and `orderForm` internals with no landing byte change; blend registrations for store
colour mixes (design); the DES-§5.4-style pool rows for store sections in design's registry if P6 keeps the pools
centrally (else they live in `src/storefront/registry.ts`).

### STO-§27.3 Track D3 GROWTH (R3) owns the R3 additions

`src/lib/catalog/{coupons,reviews,holds,facets}.server.ts`, `src/storefront/runtime/entry-search.ts`,
`src/storefront/sections/reviewsVerified/**`, `src/landing/sections/reviewsVerified/**` (new landing section, R3 file map),
`src/app/s/[store]/reviews/**`, `src/app/api/public/store/{review,review-media,search-index}/**`,
`src/app/app/[store]/{reviews,catalog/coupons}/**`, `src/lib/settings/keys/reviews.ts`, and edits to S1's files for
ST-11 … ST-20 (S1 is finished by then).

### STO-§27.4 Order inside R2

Contract step → S1, S2 (design: `getStoreTheme`, `sampleBrand`, store themes, the store hero and PDP family CSS pools
with S1), S3/S4 (operations: hooks, Sheets v3 mapping, drawer lines, the returns restock action) and S7 (ai: AI-09,
AI-10, AI-11 as the `store_blueprint` job, `product.describe` for catalog-from-photos) in parallel; S1 merges before
S7's blueprint UI (it calls `applyStoreBlueprint` and `startStoreDesign`). R2 exit (core §K.4, extended by this
revision): a `both` store with catalog, cart and attached landings live with an override chip; the gate green;
`qa:storefront-demo` passing on XAMPP and live (STO-§26.4); the store corpus of STO-§26.1 at 0 hard items with every
share cap met; `qa:storefront-perf` within every STO-§21 budget; the load test of on-request store pages through the
edge cache.

---

## STO-§28 Limits (appendix)

| Limit | Value | Where enforced |
|---|---|---|
| Products per store | entitlement `products_max` (beta 200, pro 2,000), draft + active | `chargeUsage` (STO-§4.5) |
| Items per product · photos per product · offers · groups per item | 8 · 30 · 8 · 4 | PageDoc (OFFERS §J.1) |
| Content sections per product | 20 | `ProductContent` |
| Sections per store page | 40 (product: 12 outside productContent) | `storeDocIssues` |
| Collections per store · products per collection · collections per product | 100 · 500 · 8 | repositories |
| Attached landing pages per product | 10 | attach |
| Menu: top items · children · links in total · footer columns × links | 8 · 8 · 40 · 4 × 8 | `StorefrontSettings` |
| Announcement messages | 3 | `StorefrontSettings` |
| Cart lines · `n` per line · cart lifetime | 20 · 10 · 30 days | cart store + v3 |
| Search query · tokens · page size | 80 code points · 8 · 24/36 | search |
| Instant search index (R3) | 500 products | `search-index` |
| Tags per product | 20 × 32 chars | product input |
| Document gzip | 90 KB soft · **140 KB hard** (core D52) | publish gate `budget:F5`; render flags a live overrun (STO-§7.3) |
| Per-kind sections · height · CTAs · glass · reveals · photo reuse | STO-§6.1 table | `storeDocIssues` (soft) + publish gate (hard) |
| Hero families · share per niche | 8 home + 6 PDP · ≤ 30 % over 100 stores | pool draw + `gene_stats`; store corpus (STO-§26.1) |
| Critical bytes before LCP | PDP 300 KB · home / collection 220 KB · cart / checkout 130 KB | `qa:storefront-perf` |
| Chunk boot at 4× CPU | `pdp` 45 ms · others ≤ 30 ms · Σ worst PDP 90 ms | `qa:storefront-perf` |
| Catalog from photos | 40 photos per batch · interactive ≤ 6 photos, job above | `proposeProductsFromPhotos` |
| Test token | 2 h · 60 test renders per store per hour | `resolveTestToken`, `s:<sid>:test-render` |
| WhatsApp intents | 1 per page view per 30 s · 10 per IP per 10 min per store | `checkout` chunk, `s:<sid>:wa:ip` |
| Chunk budgets | STO-§14.1 (`store-page` 41,000 = derived from the heaviest set, rev 3 ENGP-31; R3 42,500 when `exp-head` + `exp` land, STO-R26 restated) | `budgets.json` + the `≥ Σ` assertion in `scripts/build-store-assets.mjs` |
| Stock hold moment (R3) | `reserveAt = "confirmed"` default · `"order"` optional; TTL 7 days from the hold | `checkout.store`, order-transition hook (STO-§5.6) |
| Attached pages republished in the saving request | all ≤ 10 (the attach cap) | `after()` of `saveProduct` (STO-§4.5) |
| Fold gate zones (rev 4, core §M.2) | each `mustShow` item's estimated **top**: ≤ 760 px target · 760-938 px note (`estimated`) · > 938 px refused (× 0.9 > 844) | `budget-limits.ts` (`FOLD_BAND = 0.9`, core, STO-R34 accepted) |
| Render-cache window id (rev 4) | changes at each announcement boundary and at each store-local midnight; ≤ 1 extra miss per cached page per day | `storeWindowId` (STO-§7.4) |
| Coupons (R3): percent range | 1 %-90 % | coupon schema |
| Review (R3): text · photos · token lifetime | 2,000 chars · 4 · 60 days | review endpoint |

---

## STO-§29 Requests to the core and dependencies

### STO-§29.1 Requests to the core (revision 1; **decided in core rev 2 §Q.2: all 24 accepted**)

Core §Q.2 accepted every row below as written (none with changes, none rejected) and names where each landed:
STO-R1 → core §E.2, D28 · R2 → §D.2, §F.1 L11 · R3 → §D.8, §H.4 · R4, R5 → §D.3, §D.6, §C.4.1 · R6 → §D.2, §H.3 · R7 →
§E.6 · R8 → §D.2, §K.4 · R9 → §D.2 · R10 → §C.4, §C.4.1, §F.6 · R11 → §D.2 · R12 → §K.4 · R13 → §H.13, §J, §K.4 · R14 →
§C.4.1 · R15 → §C.4 · R16 → §D.10 · R17 → §A.2, §A.5.1 · R18 → §K.4 S1 · R19 → §K.4 · R20 → §A.4, §D.7 · R21 → §A.3,
§A.4, §F.5, §I.4 · R22 → §F.9 · R23 → covered by OPE-§3.6's hook event (`before` / `after` snapshots) · R24 → §E.6
`getOrLoad`. This revision's text follows those placements (STO-§31 lists each alignment). The table is kept for the
record.

| # | Change | Why |
|---|---|---|
| STO-R1 | `src/lib/tenancy/public.ts`: add `resolveProductKey(key): Promise<{ store: StoreRow; scope: StoreScope; product: ProductRow } \| null>` (active products of servable stores, cached 15 s like page keys, `// tenancy: public-key product`) and `resolveContextKey(key): Promise<{ store: StoreRow; scope: StoreScope; page: { id: string; kind: StorePageKind } } \| null>` (non-landing page keys). D28: add `products.public_key` to the global random keys. | v3 checkout, cart re-price, leads and events resolve the store from keys only (core §A.1 invariant 5) |
| STO-R2 | `pages.draft` and `page_versions.doc` typed `jsonText<PageDoc \| StorePageDoc>`; every landing reader filters `pages.kind = 'landing'` (publish, render jobs, exports, generator, admin page lists, history restore, stats lists, PHP and WhatsApp exports); lint rule **L11**: a read of `pages.draft` / `page_versions.doc` outside `src/lib/storefront/**` and the landing repositories filters `kind` or goes through `readPageDoc` | STO-D1: two doc types share the table |
| STO-R3 | `src/lib/db/boot-tasks.ts` (published checksums) and `scripts/qa/upgrade-dry-run.ts` validate `kind ≠ 'landing'` versions with `StorePageDoc` | otherwise every store template would fail the boot check |
| STO-R4 | New tenant table `catalog_redirects` (0006), schema in STO-§3.3 | STO-D21 |
| STO-R5 | New tenant table `inventory_moves` (0006), schema in STO-§3.3 | idempotent stock moves (STO-§5.4) |
| STO-R6 | `pages.attach_opts longtext NULL` and `page_versions.product_rev char(26) NULL` (0006); D50 extended: a re-render also writes `product_rev`; `render_jobs.reason` appended `'reviews'` (0007) | STO-§17, STO-§18.3 |
| STO-R7 | Core §E.6 render cache key for store pages: `${storeId}:${path}:${locale}:${catalogVersion}:${addressVersion}:w${windowId}` | announcement start/end must invalidate cached HTML and ETags (STO-§7.4) |
| STO-R8 | `orders.items` typed `OrderItems \| OrderItemsV3` in `schema.ts`; `src/lib/orders/text.ts` `orderText()` dispatches `items.v === 3` to `orderTextV3` (`src/lib/catalog/order-text-v3.ts`); readers of order units (Sheets SKU column, CSV, drawer) use `orderUnitsV3` for v3 rows | ORD-19 |
| STO-R9 | `leads.page_id` NULL-able (0006); `upsertLead` accepts a v3 selection with `target = { store, ctxPageId }` | abandoned-checkout leads have no landing page |
| STO-R10 | Core §C.4 / §C.4.1: routes `src/app/api/public/store/{order,lead,cart,event}/route.ts` (R2), `{review,review-media,search-index}/route.ts` (R3) in the public-api area (header class "Public JSON APIs", §F.6), with cases in `scripts/qa/headers-check.ts` and `scripts/qa/tenancy-check.ts`; store routes `src/app/s/[store]/{p,products,c,collections,cart,checkout,search,reviews}/**` and `[slug]/[...rest]/route.ts` | new public surfaces must be in the header and attack suites (core §J.5) |
| STO-R11 | `recordEvent` / `bumpOrderStats` accept `{ kind: "page" \| "product"; id: string }`; `stats_daily.page_id` documented as a page id or a product id | STO-D23 |
| STO-R12 | (a) `src/lib/orders/create.ts`: extract `createOrderRow(draft: OrderDraft, ctx)` (idempotency insert, blocklist, per-phone limit, risk, insert, `order_events`, hooks, outbox) shared by v2 and v3; (b) `src/lib/orders/resolve.ts` `orderVersion`: for pages with `product_id`, apply `attachedDocFor(target)` (`src/lib/catalog/attach.server.ts`) and force `fallback: true`; (c) `src/lib/render/config.ts`: content ids of attached landings use `contentIdOf(item, productKey)` | one order pipeline; live product pricing on attached landings; one ad catalogue (LND-11) |
| STO-R13 | `package.json`: `prebuild`/`predev` run `scripts/build-store-assets.mjs` after the landing build; scripts `test:catalog`, `test:store-runtime`, `qa:storefront-render` (in `npm test`), `test:storefront-db` (in `test:db`), `qa:storefront-e2e`, `qa:storefront-perf`, `qa:storefront-a11y` (in `test:e2e`); `src/landing/runtime/budgets.json` keys `pdp 23500`, `store 2500`, `cart 6000`, `checkout 8000`, `store-pixels 4200`, `store-thanks 3000`, `search 5000`, `store-page 41000`; R3: `inlineHashes` / `buildLandingCsp` hash `<script type="speculationrules">` | R-D43 budgets and the build of the new chunks |
| STO-R14 | `STORE_RESERVED_SLUGS` (`src/lib/tenancy/handles.ts`) += `ar, fr, en, es, de, it, nl, pt`; document `@`-prefixed slugs as internal template slugs | R3 locale prefixes; template rows |
| STO-R15 | `/preview/<token>` (core D20) renders store template drafts and product drafts | previews for pending stores |
| STO-R16 | Settings registry: `checkout` = landing.md's R1 schema merged with `checkout.store` from `src/lib/settings/keys/checkout-store.ts` (S1-owned); `storefront` (S1, R2); `reviews` (D3, R3) | core §D.10 lists `checkout` as "landing R1 / storefront R2" without a file split |
| STO-R17 | The mode-change action (to `store` / `both`) and the `pending → active` transition call `ensureTemplateSet` with a system scope | STO-D2 |
| STO-R18 | R2 file map: S1 owns the store branches of `src/app/s/[store]/route.ts`, `[slug]/route.ts`, `policies/**` and the chrome wrapper of `track/**`; the landing editor shows mirrored item fields read-only on attached pages | store/both mode on existing routes |
| STO-R19 | Cross-track stubs frozen in the R2 contract step: `getStoreTheme(scope, register)` (S2), `zonesForCheckout(scope)` and `zoneLineFor(scope, cityKey)` (landing), `etaWindow(...)` (landing, or S1 when absent), `signedTrackPath(store, orderId)` and `waConfirmText(store, order, locale)` (landing LP-04/LP-05); and a `stores.catalog_version` bump on delivery-zone writes (landing), store-theme and brand changes (S2), `store` and `policies` setting writes (core / landing) | store pages cache on `catalog_version` (STO-§7.5) |
| STO-R20 | `usage.reconcile` (core §D.7): the `products` gauge = COUNT of products with status `draft` or `active` | STO-D24 |
| STO-R21 | Permission `coupons.manage` (R3, write; owner, admin) in §A.3.1 and §A.3.2; entitlement features `coupons` and `reviews` (R3, default true) in §A.4; audit actions `store.catalog.*`, `store.inventory.adjusted`, `store.storefront.*`, `store.landing.attached` / `detached`, `store.review.*`, `store.coupon.*` in §F.5; notification kinds `catalog.low_stock`, `catalog.out_of_stock`, `storefront.checkout_blocked` | missing keys are CCRs (core §K.3) |
| STO-R22 | Backups (§H.6) and the store export ZIP (§F.9) include `products`, `collections`, `collection_products`, `inventory_levels`, `inventory_moves` (90 days in backups), `catalog_redirects`, R3 `reviews` and `coupons`; the export adds `products/<slug>.json`, `collections.json`, `inventory.csv` and the store template docs | the catalogue is the seller's data |
| STO-R23 | The order hook registry (`src/lib/orders/hooks.ts`) delivers `confirm_state` and `ship_state` transitions with `{ storeId, orderId, from, to, items, pageId }` | stock decrement, hold release, review requests |
| STO-R24 | `scopedCache()` accepts Promise values and an optional per-entry TTL (single flight, `validUntil`-style entries) | STO-§7.4 without a lint allowlist entry |

### STO-§29.2 Dependencies on sibling parts (informational, not core requests)

| Part | What this spec needs from it |
|---|---|
| design.md | `getStoreTheme(scope, register)` and register CSS (`[data-register="commerce"]` motion clamp, no glass); **the `StorePageDoc` branch of the gates (rev 3, ENGP-1, formal request STO-R29):** `gateInputFor(doc: PageDoc \| StorePageDoc, ctx)`, the union on `GateInput.doc` / `genomeOf` / `estimateHeights`, `FoldReport.items` widened to `FoldItem` keys, utility kinds exempt from pooling and novelty; blend registrations for store colour mixes; the home page genome novelty check (`home` / `page` only); the Brand Genome fan-out bumping `catalog_version`; `PhotoFacts.hasCutout = "estimated"` (UX-39); the rev 3 reveal layout component (UX-20) |
| landing.md | `delivery_zones`, `zoneLineFor`, `zonesForCheckout` (**rev 4:** its `ZoneTable` is embedded verbatim, CRIT1), `etaWindow`, the `checkout` R1 fields (field model, `confirmationCall`, `addressMode`), LP-04 thank-you blocks reusable inside the store document, LP-05 tracking and its signed links, the LP-06 leads inbox showing v3 selections, read-only mirrored items in the landing editor |
| operations.md | Sheets mapping and drawer display of v3 orders, the returns "restock" action, the WhatsApp channel for review requests, server ad events built with `contentsOfV3`, accounting attribution of attached-landing orders to products |
| ai.md | AI-09 (SEO and alt), AI-10 (translations), AI-11 (`StoreBlueprint` shape), the honesty guard on generated store copy |
| platform.md | the console store profile "Catalog & pages" tab (R2, read through `platformScope`, PLA-§7.5), the Store Health engine that imports `src/lib/health/rules/storefront.ts` (core §I.7), the live address card hosting "Open a test order" for store mode (core §I.4) |

### STO-§29.3 Second-round requests to the core (revision 2; only what this revision could not resolve inside its own files)

| # | Change | Why |
|---|---|---|
| STO-R25 | `src/lib/render/prepublish/budget.ts` (core) exports `registerBudgetProfile(kind: StorePageKind, profile: BudgetProfile)` so the STO-§6.1 per-kind thresholds (sections, height, CTAs, glass, reveals, photo reuse, HTML gz) replace the landing constants when `ctx.doc` is a `StorePageDoc`; and `prepublish.ts` imports `src/lib/render/prepublish/storefront.ts` like the other track files | core §M.2 fixes one landing profile; store kinds need theirs without a second registry |
| STO-R26 | `src/landing/runtime/budgets.json` key `store-page` in the R3 contract step, when `exp-head` (450) and `exp` (1,200) join store documents: **rev 3 (ENGP-31) restated as the derived value** `ceil500(Σ heaviest-set budgets)` = **42,500** B (not a hand-set 43,000); `scripts/build-store-assets.mjs` asserts `store-page ≥ Σ` in every release | the worst PDP (inline + matrix + fields + steps-box + pixels) already measures ≈ 40,650 B; the experiment chunks push it over (STO-§14.6); a cap derived from the budgets cannot be broken silently by one chunk moving |
| STO-R27 | Core §F.5: note that the attach flow writes landing's `page.attached` / `page.detached` and that `store.landing.attached` / `detached` stay unused (or drop them at the next revision) | one audit name per event (STO-§17.3) |

Everything else this revision needed existed in core rev 2 (extension points for health rules, pulse contributors,
notification kinds, flags, commands, search providers and tenancy cases; the test-token resolver; `getOrLoad`; the
`lead` route's `kind` needs no new route).

### STO-§29.4 Third-round requests (revision 3; the cross-file side of the round-1 findings)

Each row names the finding it resolves, the file(s) that must change and the exact change; the storefront side of every
row is already written into this revision's body.

| # | Finding | File(s) | Change |
|---|---|---|---|
| STO-R28 | OPS-1 (blocker) | core §K.2 P0 stubs, §D.5 `delivery_zones`; landing LAN-§2.1, §7.1, §7.4 (`lp-assist.dz`); operations OPE-§10.1 | **One canonical city key = operations' slug `CityKey`.** `delivery_zones.cities` stores slugs (the zones editor converts the picked `City.value` with `cityKey()` at save; a one-off migration slugs existing rows); `zoneForCity(zones, key: CityKey \| null)` maps `null` ("Autre", unknown) to the `*` zone; the `lp-assist.dz` block and `zonesForCheckout().city` are keyed by slug; the order form's `<select>` keeps posting `City.value` and the server / `assist` convert with the **same** pure `cityKey()` (P4 keeps it pure and DOM-free so `assist`, `checkout` and `pdp` bundle it by source import); `test:delivery` gains the fixture "Fès picked → zone found → ETA shown" shared with `test:catalog` |
| STO-R29 | ENGP-1 (blocker) | design DES-§8.1, §4.7, §5.3, §8.8, §7.4; landing LAN-§6.1-6.4; core §M.1, §K.4 | **The `StorePageDoc` branch of the gate registry.** Design adds `gateInputFor(doc: PageDoc \| StorePageDoc, ctx: PrePublishCtx): GateInput` (theme from `getStoreTheme`, sections through the store registry `features`, no product / offers / form), widens `GateInput.doc`, `genomeOf(doc)` and `estimateHeights(doc, …)` to the union at the R2 contract step, widens `FoldReport.items` additively to `Partial<Record<FoldItem, number>>` (`FoldItem` += `name`, `identity`, `collections`), and defines that utility kinds (`product`, `collection`, `search`, `cart`, `checkout`, `not_found`) run structural / owner-rule / register gates only and are **never pooled or novelty-checked** (only `home` and `page` enter `design_genomes`); landing defines `landingGateItems` on a `StorePageDoc` as "eligible landing sections only, facts from the bound product"; `test:prepublish` gains one fixture per store kind (S1's `prepublish/storefront.fixtures.ts`) |
| STO-R30 | OPS-15 (major) | core §K.4 contract step, §K.2 P0 (`createManualOrder`); operations OPE-§11.1-11.4, OPE-§P | `createManualOrderV3` / `quoteManualOrderV3` / `editOrderV3` (S1, STO-§16.9) frozen in the R2 contract step for S3's sheet; operations routes the manual-order sheet by store mode (products picker in `store` / `both`, pages picker in `landing`), dispatches `convertLeadToOrder` on `leads.sel.v`, and keeps `createManualOrder` / `editOrder` for v2; OPE-§11.1 step 5 calls `createOrderRow` (ENGC-13) instead of its own insert; `test:ops-db` adds "manual v3 total = public v3 total" |
| STO-R31 | OPS-13 (major) | core §K.4 (from §K.5), §K.5; landing LD4, LD25, LAN-§20.4, LAN-§7.3, LAN-§3.2 checklist | **Pull LP-16 into the R2 contract step**: `landing-v3` entry (fork of `entry.ts` + one zone lookup), runtime config v3 with `zones`, server shipping by zone for `runtime_v = 3`; the PHP template v3 may lag one release with the export refusing "charge by city" pages until it ships; landing adds the checklist warning `delivery:fee_mismatch` (zones carry fees and the page fee differs for the top-5 cities) and the "Facturer la livraison par ville" toggle the attach flow uses; attached landings created from a product in `both` mode start on v3 |
| STO-R32 | OPS-11 (major) | core §K.2 P0 stubs, §D.10; operations OPE-§2.9, §5.5, §7.1; landing LAN-§2.3, §8.3 | **`ops.callingWindow` is the one source of calling hours**: `ops.callingWindow.days` switches to ISO weekdays 1-7 (aligned with `checkout.calendar.workdays`); P4 exposes the P0 stubs `callingWindowFor(scope)` and the pure `nextCallableAt(window, now, tz)` / `hoursText(window, locale)`; `confirm_hours`, the thank-you `{when}` (LAN-§8.3) and the tracking help hours derive from them; `store.confirmation.hours` and `policies.contact.hours` become read-only mirrors or are dropped; the thank-you card edits the same window with the same component as `/team/callcenter` |
| STO-R33 | UX-21 (major) | design DES-§11.1 | Drop "`G2 ∈ {catalogue, split-tension}`" from the commerce register row (or move it to the collection grid only): the register = brand genes + clamps (G16 = 0, motion ≤ 250 ms, accent ≤ 8 %, G22 = start, no decor), the PDP family drawn from the store's G2 through STO-§12.8's pool, the STO-§8.4 marketing islands explicitly allowed; DG-11's acceptance stays as written |
| STO-R34 | ENGP-6 (major), ENGP-23 (minor) | core §M.2 rows C2, C3, F1; design DES-§5.3, §5.12, §17.3 | **Apply the calibrated error band to the estimate-driven hard thresholds**: refuse C3 / F1 only when `estimate × 0.8 > limit`, C2 only when `item top × 0.9 > 844`; a soft note inside the band with `vars.estimated = 1` and "estimated" in the message; state that the server decides from the model only and Playwright is the calibration; commit `src/lib/design/calibration/heights.json` so `test:design` does not depend on the git-ignored `qa/saas-baseline/index.json`; C2's server gate is 390 × 844 only (the frozen report's viewport), 360 × 740 Playwright-only soft |
| STO-R35 | ENGC-13 (major) | core §K.1 T3, §K.4 STO-R12 (a) | **Extract `createOrderRow(draft, ctx)` in R1.0 (T3)**: a refactor of `create.ts:255-300` plus the hooks call, frozen at P0; P4's manual v2 path (OPE-§11.1 step 5) and the R2 v3 paths call it; §K.4 STO-R12 (a) becomes "already extracted in R1.0; the R2 step widens `OrderDraft`" |
| STO-R36 | ENGC-8 (major), OPS-14 (major) | core §K.2 P2 / P3 / P4 rows, §K.3, §K.4 S1 row; platform PLA-§22.2, PLA-§P.2; landing LAN-§26.1 | P2 row: "`src/app/(public)/**` except `invite/staff/**` and `kit/**`"; "`src/app/app/[store]/team/**` except `team/{agents,callcenter}/**`"; add `settings/audit/**` to P2, `src/lib/settings/keys/platform.ts` to P1, `src/lib/security/selftest.ts` to T3; a P0 script `scripts/qa/ownership-check.ts` parses every row's globs across the part specs and fails on an intersection; in R2 S1 owns `src/app/s/[store]/{route.ts, [slug]/route.ts, policies/**}` whole and `track/**` imports `wrapInStoreChrome` (one maintainer line). **OPS-14:** in `store` mode onboarding reveals the first product's **PDP preview** (synchronous, STO-§6.7 rev 3) or, if the landing reveal stays, sets `landing.inStoreMode = true` and says so on the `done` step; add the case to the UX-01 acceptance list |
| STO-R37 | UX-31 (minor), UX-37 (minor) | landing LAN-§2.3 `checkout` R1 key, LAN-§3.5 OF2 / OF4 | Add `checkout.addressMode: "required" \| "optional"` (default per market: MA `required`) and apply it to the landing form OF2 and the store checkout alike (the one-line address row ≈ 56 px budgeted inside OF2's 1,100 px); adopt the phone ergonomics of STO-§15.4 rev 3 (inputs 52-56 px, 16 px text, 12 px gap, label 13/500 above, sticky submit only while the form is ≥ 50 % in view and the keyboard is closed, error summary above the first field) in OF4 |
| STO-R38 | SEC-18 (minor), SEC-5 (major, storefront side none) | core §C.7, §F.8, §F.11; platform PLA-§3.4, PLA-§22.10.1 | Run `brandTokens()` + active `protected_brands` on the store name, legal name and WhatsApp display name at every write (`brand_exact` refuses for non-staff, `brand_near` flags); health rule `platform:brand_term_live` (P1, nightly over live titles / headlines / policy text); the publish gate `honesty:password_field` (landing's side; the storefront's `storefront:form_field_foreign` is its mirror); an insert-only `abuse_reports` endpoint in R1 (triage UI R3) that the store footer links; the impersonation scope masks customer fields at the repository boundary (SEC-5: `StoreCtx.scope.kind = "impersonation"`, `Masked` values from operations' read functions) |
| STO-R39 | QUAL-1 (blocker) | design DES-§7.8, §9.5, §9.8; core §M.4 | N8 (3-gram shingle share > 25 %) is **hard for cloud / local-AI and owner-typed lines, soft for copy-library lines**, said so in core §M.4; the library grows into a generative template layer (≥ 24 headline / lead skeletons per family × locale from structure × device × fact slots) with the N8 share measured on the sweep (≤ 10 % per skeleton); corpus test: 30 engine-only stores in one niche publish with 0 `design:N8` refusals (the storefront's instant home path depends on it) |
| STO-R40 | ENGP-24 (minor) | core §J.1; design DES-§25.1; landing LAN-§25.1 | `npm test` ≤ **3 minutes** stated in core §J.1; in-`npm test` sweeps reduced to seeded subsets (storefront: 192 homes, STO-§26.1; design: 20 seeds per archetype; experiments: 2,000 A/A sims) and the full sweeps moved to `test:slow` / `qa:design-corpus` before each merge |
| STO-R41 | ENGP-16 (minor), ENGP-26 (minor), ENGP-10 (major, wording) | landing LAN-§5.4 (`assist`), LAN LD1, LAN-§17.4; core §K.1 T3, §H.3, §H.13 | The `assist` add-on chunk's stale handling offers a "Recharger" button after `STALE_GUARD_MS` (the frozen `form.ts` cannot); T3 derives the storage prefix once in `core.ts` from `cfg.pageKey` / pathname and passes it to the four modules, re-measures the landing chunk after R1.0 and records its size in `budgets.json` and its sha256 in `src/landing/runtime/landing.sha256` (the storefront asserts that value; render-check's +5 % stays the gate); LAN-§17.4 and core §H.3's "one exception" paragraph say that reason `product` publishes a `sync` version for `prices` / `options` **only** and re-renders in place for `stock_transition` / `content` (STO-§17.3 rev 3) |
| STO-R42 | OPS-9 (major), ENGP-3 (major), ENGC-1 (blocker), OPS-20 (minor) — storefront side none | operations OPE-§12.8, §17-19; core §D.5 `ai_jobs`, §D.2 / §D.3 / §K.1; landing LAN-§14.3 | For the record, with the storefront's confirmation that nothing here changes: (OPS-9) option (a), the Sheets `Tracking` / `Transporteur` columns, `orders.tracking_ref` + `carrier_label` on 0005 and a "Carrier CSV" export in R1 read v3 rows unchanged (STO-§16.5); (ENGP-3) `aj_active_uq` → `active char(1) NULL` set while queued / running, NULL on terminal states, so re-running a `store_blueprint` with the same input (STO-§11.5 "Apply … with an undo") never hits a unique-key error; (ENGC-1) `orders.is_test`, `leads.is_test`, `orders_store_test_idx` and `page_slug_history` move to 0004 so T3's R1.0 code typechecks (the storefront reads `is_test` as a core column whatever the migration number); (OPS-20) LAN-§14.3 says `settings.write` for "Delete test orders" like OPE-§26 (STO-D33 and STO-§26.2 cite OPE-§26) |

**Decided (core rev 3 §Q.8, recorded in rev 4).** All fifteen accepted. **A\*** with a change this revision adopts:
STO-R32 (the two old hours keys are **removed**, not mirrored, D73) and STO-R39 (N8 hard on generated lines only;
**soft on owner-typed lines** and on copy-library fallback lines: this part's "owner-typed hard" clause was not adopted,
and STO-§11.4 now says so, CRIT13). STO-R28's details are accepted (D68) except one clause the core's own P0 stub and
landing's LD4a decided otherwise: the browser tables are keyed by the **posted `City.value`**, not by the slug, and the
store chunks do not bundle `cityKey()` (CRIT1; STO-D43 rev 4). STO-R30 lands with **S4** (not S3) owning the sheet.
STO-R41: accepted for the core's part with **tolerance 0** for the landing chunk (not the "+5 %" its row still quotes,
ENGC-10; landing's N8 note), and its "Recharger" button, routed to landing, was accepted in landing rev 4 (LAN-§17.4,
STO-§29.5 C7). The core
closed the third round; rev 4 therefore files **no new core request**: STO-§29.5 lists only the contradictions found.

### STO-§29.5 Contradictions found in rev 4 (between this file and core §P / §Q.8, or between two siblings)

Per core §Q.8 ("the parts' next revision records only contradictions they find"). Each row: what contradicts what, the
storefront's resolution in its own text, and the change the other file should make (also in the crossFileNotes of
this round).

| # | Contradiction | Storefront resolution (this file) | Other file's change |
|---|---|---|---|
| C1 | Core D68 says the `lp-assist` / `#sg-config` zone tables "store slugs" and "the `assist`, `checkout` and `pdp` chunks convert with the same function"; core §K.2 P0 says `zonesForCheckout(): ZoneTable` is "keyed by the posted `City.value`, built on the server from the slugs"; §K.4 S1 row says the cart/checkout chunks bundle `cityKey`; LAN LD4a / §7.1 follow §K.2 (CRIT1) | STO-D43 rev 4, §12.3, §14.4, §15.7, §15.9: `#sg-config.checkout.zones` = landing's `ZoneTable` verbatim, keyed by the posted value; no store chunk bundles `cityKey` | core D68 and §K.4 S1 row: say "the browser tables are keyed by the posted `City.value` and built on the server from the slugs; only server code calls `cityKey`"; OPE OD47 is **already aligned in operations rev 4** ("the browser never computes a slug"), as are LAN LD4a / §7.1; only the core's two sentences remain |
| C2 | `EffectiveWindow.days` was a 7-slot array "index 0 = Monday" in OPE-§2.9 / OD57 (rev 3) while LAN-§2.3 typed `CallingWindow.days: Record<1..7, …>` and core D73 says "ISO weekdays 1-7"; LAN typed the stub `CallingWindow \| null` while core §K.2 / §Q.8 LAN R3 froze `Promise<EffectiveWindow>` (CRIT3) | STO-D45 rev 4, §8.1, §14.4: `EffectiveWindow` imported from operations, never restated, embedded in the config as is; `{when}` computed in the browser | **already resolved by the siblings' rev 4** (read while writing this revision): OPE OD57 / OD63 fixed `days: Record<IsoWeekday, Range[]>`, made the type JSON-safe with `configured` and `shopperPromiseAllowed(w)`, and ships the shared fixture `src/lib/callcenter/window.fixtures.ts`; LAN-§2.3 re-exports `EffectiveWindow` and dropped `\| null`. Remaining: core D73 / §K.2 P0 should name `configured` and the fixture file so the three tracks build to them |
| C3 | Core §M.4 makes copy-library fallback lines **soft** under N8; design's rev 3 `design:N8` row (DES-§8.2) counted "library, generator or model text" as generated, i.e. **hard** | STO-§11.4 rev 4 follows the core (the contract): `cloud` / `local` / `engine` hard, owner-typed and plain library fallback soft | **already resolved by design rev 4** (DS9, DS50 rev 4 origin classes, the N8 row: `library` lines soft, core §M.4); none left |
| C4 | Core §I.7 names landing's `landing:fee_mismatch` health rule (P3) while this file's rev 3 added `sf:landing_fee_mismatch`: two issues for one page | STO-§23.8: `sf:landing_fee_mismatch` withdrawn; the "Pages de vente" chip reads the same `zones.feeMismatchTop5` | none (landing's rule already covers attached landings); P1's `zones.feeMismatchTop5` input must include attached pages (it reads every live page) |
| C5 | Core §A.2 / §K.4 and PLA Q3.8 name `createProduct(scope, facts)` and `setThemeDraft(scope, direction)`; a write needs the `StoreCtx` (audit actor) and, by D71, a `WriteScope` | STO-§4.5 rev 4: `createProduct(ctx, input \| { facts })`, `setThemeDraft(ctx, direction)` | core §A.2 / §K.4 and platform PLA-§22.2 write `ctx`; core §E.1 states that `storeAction` / `storeGuard` hand a `StoreCtx` whose `scope` is a `WriteScope` (today `StoreCtx.scope: StoreScope`, so a ctx-taking write function needs the narrowing from the seam, never a cast) |
| C6 | The footer and contact page now show today's hours from `ops.callingWindow`, and a BiRefNet mask arriving for a product photo changes a store page, but neither write is in the core's `catalog_version` bump list (core §K.4 contract step lists zones, theme, brand, `store`, `policies`) | STO-§7.5 rows added; STO-§7.4 window id carries the store-local day | core §K.4: add "`ops` writes that change `callingWindow` / `windowOverrides` / closed dates (P4) and the `cutout` render handler for assets referenced by active products (P8)" to the `stores.catalog_version` bump list |
| C7 | STO-R41's "Recharger" button on the stale banner was routed by core §Q.8 to landing (S), and landing's rev 3 had no text on it | STO-§17.3 keeps the full fan-out and the e2e "page 7 of 10" case | **already resolved by landing rev 4** (LAN-§17.4: the R2 `assist` stale banner gains the `lp.reload` "Recharger la page" button after `STALE_GUARD_MS`); STO-§26.3's e2e case now also asserts the button on page 7 when the edge still serves the old HTML |
| C8 | LAN R21 asked this part to drop the sticky checkout submit "for the same reasoning as OF13", and core §Q.8 records it as "storefront accepted", while this file's rev 3 still had it | STO-§15.4 rev 4: no sticky submit; the default checkout state's submit ≤ 844 px is an e2e assertion | none |
| C9 | Design's `nicheShares(niche).seq4` (QUAL-20) gives the top 20 4-grams of the niche's live pooled pages, landing and store homes together; landing 4-grams can crowd store homes out of the top 20 | STO-§11.4 rev 4: `expandHome` reads `seq4`; store type names never collide with landing ones | design DES-§7.4: compute `seq4` per page-kind family (`landing` vs `home` / `page`), or return the top 20 per family |
| C10 | Core §D.10 `checkout` row names the R1 flag `confirmationCall`; this file's rev 3 called it `callPromise` and read `policies.returnsDays` / `policies.inspection === true`, which do not exist in LAN-§2.3 | STO-§3.5, §8.1, §12.6, §14.4, §15.1, §20.4 rev 4 use `confirmationCall`, `policies.returns.windowDays`, `policies.inspection === "allowed"` | none |
| C11 | The storefront needs to know whether `callingWindowFor` returned the owner's window or P4's `DEFAULT_WINDOW` (owner rule 4: no invented hours) | STO-§8.1, §10.3, §14.4: hours and `{when}` only when `shopperPromiseAllowed(w)` | **already resolved by OPE rev 4** (OD63 `configured`, `shopperPromiseAllowed`, `hoursText` answers "" when not configured); none left |
| C12 | Core §K.4's S1 row says `src/lib/orders/hooks/storefront.ts` "reads the `line_outcome` event of a partial delivery" (OPE OD51), which this file's rev 3 never specified | STO-§5.4 rev 4: refused lines restocked automatically as one upserted `returned_restock` move per (order, stock key), pending lines stay decremented | none |

---

## STO-§30 Review decisions

### STO-§30.1 Round 1 (revision 3)

One row per finding id that names this file or its cross-file side. "Resolved" = the body of this revision changed
(section named); "cross" = the storefront side is written here and the other file's change is a third-round request
(STO-§29.4); "rejected" carries the reason. Nothing was rejected outright; two recommendations were adapted (UX-22,
ENGP-16) with the reason in the row.

| Finding | Severity | Decision | Where |
|---|---|---|---|
| OPS-1 | blocker, cross | **Resolved (storefront side) + cross STO-R28.** Operations' slug `CityKey` is the one key; forms post `City.value`, one pure `cityKey()` converts on the server and in the `checkout` / `pdp` chunks; `zones.c` and the city list (`s`) carry slugs; `null` → `*` zone; parity fixture shared with `test:delivery` | STO-D10, D17, **D43**; STO-§2 (city-key row), §12.3, §14.4, §15.7, §15.9, §16.2 step 13, §26.1 |
| OPS-9 | major, cross | **Resolved as "no storefront change needed" + recorded in STO-R42.** v3 orders are `orders` rows: `tracking_ref` / `carrier_label` and the Carrier CSV read them through `orderUnitsV3` / `orderTextV3` unchanged; a DB case added once the export exists. Option (a) is operations' and the core's | STO-§16.5 |
| OPS-11 | major, cross | **Resolved (storefront side) + cross STO-R32.** `StoreFacts.callingWindow` from `ops.callingWindow` through `callingWindowFor(scope)`; the checkout promise line, the thank-you `{when}`, the footer and contact hours all use `nextCallableAt` / `hoursText`; `store.confirmation.hours` and `policies.contact.hours` never read here; ISO weekdays | STO-**D45**; STO-§2 (calling-window row), §3.5, §8.1, §10.3, §12.6, §14.4 (`callWindow`), §15.1, §15.4, §15.12, §24 keys, §26.4 |
| OPS-13 | major, cross | **Resolved (storefront side) + cross STO-R31.** Asks for LP-16 in the R2 contract step; attached landings created in `both` mode start on v3 when it exists; until then `sf:landing_fee_mismatch` (sev. 2) and a chip on the "Pages de vente" tab with a one-tap fix; nothing hidden | STO-D10, **D46**; STO-§17.7, §23.7 keys, §23.8, §1.2 LP-07 |
| OPS-14 | major, cross | **Resolved (storefront side) + cross STO-R36.** The PDP preview (`productAsPageDoc`, synchronous) is the store-mode reveal surface; if the landing reveal stays, onboarding sets `landing.inStoreMode = true` and says so | STO-§6.7 |
| OPS-15 | major, cross | **Resolved + cross STO-R30.** New STO-§16.9: `quoteManualOrderV3`, `createManualOrderV3`, `editOrderV3` on `priceLine` + `createOrderRow` (S1); operations routes the sheet by store mode; `convertLeadToOrder` dispatches on `leads.sel.v`; parity "manual v3 total = public v3 total" | STO-**D44**; STO-§15.13 step 5, §16.8, **§16.9**, §26.1, §26.2, §27.2 |
| OPS-20 | minor, cross | **Resolved (storefront cites OPE-§26's `settings.write`) + recorded in STO-R42.** The storefront never named a permission for "Delete test orders"; STO-D33 and §26.2 point at OPE-§26 | STO-D33 (unchanged wording, OPE-§26 is the source), STO-R42 |
| OPS-30 | minor, storefront | **Resolved.** Hold at `confirm_state → confirmed` by default; `checkout.store.reserveAt = "order"` optional; the creation-time `isOut` check stays; `stock_short` flow when a confirmation finds no stock | STO-D5; STO-§1.1 ST-15, §3.5, §5.6, §15.1, §23.7 keys, §26.2, §28 |
| ENGC-1 | blocker, cross | **Storefront side: none to change; recorded in STO-R42.** The storefront reads `orders.is_test` / `leads.is_test` as core-owned columns whatever migration carries them (0004 preferred so T3 typechecks) | STO-§2 (test-order plumbing row) |
| ENGC-8 | major, cross | **Resolved (storefront side) + cross STO-R36.** S1 owns the route files whole in R2; `track/**` gets the chrome through one `wrapInStoreChrome` import; `scripts/qa/ownership-check.ts` requested; S1's rows verified to intersect nothing | STO-§27.2 |
| ENGC-13 | major, cross | **Resolved (storefront side) + cross STO-R35.** `createOrderRow` is T3's R1.0 extraction; the R2 contract step only widens `OrderDraft`; every v3 path and the manual v2 path call it | STO-§2 (shared-insert row), §16.2 step 16, §27.1 |
| ENGP-1 | blocker, cross | **Resolved (storefront side) + cross STO-R29.** `gateInputFor` adapter consumed by `prepublish/storefront.ts`; union types; utility kinds never pooled or novelty-checked (the byte-identical defaults are not clones); `checkFold` a thin wrapper over `estimateHeights().fold`; `FoldReport.items` widened additively; `test:prepublish` fixtures per kind | STO-D35; STO-§6.3, §8.1 (`genome` comment), §9.5 (`FoldLayout`, `checkFold`), §12.9, §23.6, §26.1, §27.1, §29.2 |
| ENGP-3 | major, cross | **Storefront side: none; recorded in STO-R42.** STO-§11.5's "Apply … with an undo" re-runs the blueprint with the same input, which the `active` NULL-on-terminal pattern makes safe | STO-R42 |
| ENGP-4 | major, storefront | **Resolved.** `lowStockDisplayChanged` bumps `catalog_version` on any displayed low-stock change for `showLow` products; `catalog.bestsellers` bumps once per store when a label or ordering changed; "every write that changes server HTML bumps" tested | STO-D6; STO-§5.4, §7.5, §26.1, §26.2 |
| ENGP-6 | major, cross | **Resolved (storefront side) + cross STO-R34.** C3 refuses when `estimate × 0.8 > 15,000`, C2 when `top × 0.9 > 844`; notes inside the band with `vars.estimated = 1` and "estimated"; server decides from the model, Playwright calibrates | STO-D32, D36; STO-§6.1, §12.9, §26.3, §28 |
| ENGP-10 | major, storefront | **Resolved.** `stock_transition` re-renders attached pages in place (no version row); `sync` versions for `prices` and `options` only; DB case "a crossing rewrites HTML and `product_rev`, creates no row" | STO-D11; STO-§4.3, §17.3, §1.2 LP-07, §26.2; cross: LAN-§17.4 and core §H.3 state the same split (`sync` for `prices` / `options`, in place for `stock_transition` / `content`), added to STO-R41 |
| ENGP-15 | minor, storefront | **Resolved.** `stale` whenever `lineCents ≠ ls`, `dl ≠ delivery` or `st ≠ total`, whatever `rev` / `cv`; parity mismatch logged to `error_events` | STO-D9; STO-§15.10, §16.2 step 14, §16.3 step 6, §16.8, §26.1, §26.2 |
| ENGP-16 | minor, storefront | **Resolved, adapted.** All ≤ 10 attached pages republished in `after()` (job = fallback), edge purge when edge caching exists, e2e case "page 7 of 10"; the stale banner's "Recharger" button is a landing-runtime change the chunk freeze forbids, so it is requested in the `assist` add-on (STO-R41) instead of asserted here | STO-D11; STO-§4.5, §17.1, §17.3, §26.3 |
| ENGP-17 | minor, storefront | **Resolved.** One rule: `gateSampleProduct` = max `LENGTH(doc) + LENGTH(content)` (one query) for every byte / count gate; the fold estimate uses the longest name and tallest picker without a render; STO-§12.8 references STO-§6.3 | STO-D35; STO-§6.3, §12.8, §12.9, §26.1 |
| ENGP-21 | minor, storefront | **Resolved.** `scanOrange` in `scripts/qa/lib/orange.ts` (culori band logic extracted from `scripts/check-theme.ts`); nothing under `npm test` imports `qa/`; owner-run scripts stay local | STO-§8.4, §26.1, §27.2 |
| ENGP-22 | minor, storefront | **Resolved.** Render cache holds `{ html, csp, etag, status, noindex }`; bytes through `encodeCached(etag, html, coding)`; `storeEtag` is the identity sha passed to `documentResponse`, so `representationTag` applies; 32 MB + 24 MB bounds stated together | STO-D6; STO-§7.2 steps 6-7, §7.4 |
| ENGP-23 | minor, storefront | **Resolved.** Server gate 390 × 844 only; 360 × 740 a Playwright soft check | STO-D32; STO-§1.1 ST-04, §9.5, §11.3 H11, §12.1, §26.3 |
| ENGP-24 | minor, cross | **Resolved (storefront side) + cross STO-R40.** `npm test` runs a 192-home seeded subset (≤ 40 s); the 1,200-home sweep in `test:slow` / `qa:design-corpus` | STO-§11.4, §26.1 |
| ENGP-26 | minor, cross | **Resolved (storefront side) + cross STO-R41.** The landing chunk is frozen **after R1.0**: T3 re-measures and records size + sha256; the storefront asserts the recorded hash | header, STO-D7, STO-§2 (budgets row), §26.1 |
| ENGP-27 | minor, storefront | **Resolved.** "Four" frozen contract files in STO-§27.2; every v3 response amount in integer cents (`totalCents`, `deliveryCents`, `subCents`, `lineCents`); the conversion to decimal columns stated once (STO-§16.4) | STO-D9; STO-§15.10, §16.1, §27.2 |
| ENGP-31 | minor, storefront | **Resolved.** `store-page` is derived (`ceil500(Σ heaviest-set budgets)`), asserted by `scripts/build-store-assets.mjs`; the `pdp` spike happens before the freeze; STO-R26 restated as 42,500 | STO-§14.1, §14.6, §28, §29.3 R26 |
| UX-4 | major, cross | **Resolved (storefront side).** The buy action and the checkout submit carry `data-hero-cta` (the frozen `sticky.ts` contract); the WhatsApp float docks through the existing `:has([data-sticky-cta][data-visible])` CSS hook; no `data-in`, no IO, no `assist` logic; V27 as a marker check is design's (noted) | STO-§2 (sticky row), §10.3, §12.5, §26.1, §26.3 |
| UX-20 | major, cross | **Resolved (storefront side).** The three instant home candidates use the rev 3 reveal layout (three real folds side by side on desktop; edge-to-edge fold + snap carousel + DNA bottom sheet on a phone); the component is P6's | STO-§11.4, §23.5, §26.4 |
| UX-21 | major, cross | **Resolved (storefront side) + cross STO-R33.** The G2 restriction sentence withdrawn from STO-§8.4; the commerce register = brand genes + clamps; the PDP family from the store's G2 through STO-§12.8's pool; islands allowed | STO-D14; STO-§8.4, §12.8 |
| UX-22 | major, storefront | **Resolved, adapted.** The contract is 390 × 844 hard through the band (not 360 × 740 hard); the phone stacks were redesigned (`split` / `rail`: name + price above a 1:1 gallery; `immersive`: 4:5 at ≤ 420 px, 64 px overlap; `quiet`: 24 px inset); the bottoms table for fr / ar × 2- / 3-line names published; families outside the band for a store's longest name and tallest picker are skipped in the draw | STO-D32; STO-§9.5 (`FoldLayout.bottoms`), §12.1, §12.8 |
| UX-31 | minor, cross | **Resolved (storefront side) + cross STO-R37.** The store checkout applies `checkout.addressMode` (MA default `required`; `optional` = the address behind "Ajouter une adresse" like OF2) | STO-§3.5, §14.4, §15.1, §15.5, §24 key |
| UX-34 | minor, storefront | **Resolved.** `bento-lead` needs 3-4 tiles with ≥ 2 images (or 1 image + 1 declared colour-field tile), unequal sizes from the sheet; else `editorial-split` | STO-§9.3, §9.5, §11.3 H12 |
| UX-37 | minor, cross | **Resolved (storefront side) + cross STO-R37.** Inputs 52-56 px, 16 px text, 12 px gap, label 13/500 above, sticky submit only while the form is ≥ 50 % in view and the keyboard is closed (`visualViewport`), error summary above the first field | STO-§15.4 |
| UX-38 | minor, cross | **Resolved (storefront side).** The store thank-you renders no `.lp-ty__aurora` (flat accent slab or a product-tinted single radial ≤ 10 % alpha); storefront screens carry no `adm-aurora` / `adm-grain` (render-check asserts) | STO-§15.12, §26.1 |
| UX-39 | major, cross | **Resolved (storefront side).** `hasCutout: "estimated"` satisfies the data requirement of `stage` / `specimen-sheet` / `specimen` with the `plinth` / `contact` preset; the real mask upgrades on request through the `catalog_version` bump (no job needed for on-request pages); demo assertion added | STO-**D47**; STO-§9.3, §9.5, §11.3 H12, §11.4, §12.8, §26.4 |
| SEC-1 | blocker, cross | **Not applicable to the storefront.** Signup, Turnstile scoring and the pending sandbox ceilings are the core's and platform's; the storefront's only pending-state behaviour (auto-publish refused in states without `publish`, STO-§6.3) already holds | — |
| SEC-5 | major, cross | **Resolved (storefront side) + cross STO-R38 / R42.** Storefront repositories and screens hold no customer PII; embedded operations components mask at the repository boundary under an impersonation scope; the canary case covers every storefront route | STO-§25 |
| SEC-18 | minor, cross | **Resolved (storefront side) + cross STO-R38.** Brand-term check at every store page / storefront-settings / name write (`brand_protected`), the publish gate `storefront:brand_protected`, `storefront:form_field_foreign` (no password / card / OTP field on any store page), the footer "Signaler cette boutique" link when the endpoint exists | STO-§10.3, §23.6, §23.7, §24, §25 |
| QUAL-1 | blocker, cross | **Resolved (storefront side) + cross STO-R39.** Library lines are soft under N8 for the instant home path; the generative skeleton layer is consumed when it ships; corpus case "30 engine-only stores, 0 `design:N8`" in `test:catalog` | STO-§11.4, §26.1 |
| QUAL-9 | major, cross | **Not applicable to the storefront** (Director repair acceptance; design and ai). The storefront consumes `StoreBlueprint` and `GeneHints` without reading Q | — |
| QUAL-10 | major, cross | **Not applicable to the storefront** (hint caps; design and ai). `expandHome` applies whatever `GeneHints` design defines, pins included | — |
| QUAL-20 | major, cross | **Resolved (storefront side).** The 4-gram and share caps in STO-§11.4 are stated as sweep assertions; `expandHome` reads verdict bands only | STO-§11.4 |
| QUAL-21 | major, cross | **Not applicable to the storefront** (rubric v3 typography text; ai and design) | — |
| QUAL-25 | minor, cross | **Not applicable to the storefront** (ai ↔ design contract drift). This file names design's task vocabulary only through `GeneHints` and the "Director brief"; no `design.direct` / `design.plan` name appears here | — |

### STO-§30.2 Review decisions (round 2, revision 4)

One line per finding id handed to this file in round 2. Round 2 re-sent every round-1 finding together with the
critic's five (CRIT1, CRIT3, CRIT13, CRIT15, CRIT17); for each, rev 4 re-read the rev 3 resolution against the core's
rev 3 decision (§P, §Q.8) and either confirmed it, aligned it, or fixed a leftover. **Rejected: none.** One reversal:
UX-37's sticky submit, adopted in rev 3, is dropped because landing rejected it with a reason this part accepts (core
§Q.8 LAN R21).

| Finding | Severity | Round-2 decision | Where (rev 4) |
|---|---|---|---|
| OPS-1 | blocker, cross | **Resolved, aligned with core D68 + §K.2 P0.** Stored key = the `CityKey` slug (unchanged); the browser table is now landing's `ZoneTable` verbatim, keyed by the posted `City.value` and built from the slugs on the server; no store chunk bundles `cityKey` | STO-D10, D17, **D43**; §1.1 ST-17, §2, §12.3, §14.4, §14.5, §15.7, §15.9, §26.1, §26.4; §29.5 C1 |
| OPS-9 | major, cross | **Confirmed (core D74, option a).** No storefront change: v3 rows feed the Sheets `Tracking` / `Transporteur` columns and the Carrier CSV (`shipments.write`) through `orderUnitsV3` / `orderTextV3` | §16.5 |
| OPS-11 | major, cross | **Resolved, aligned with core D73 (keys removed, not mirrored).** `callingWindowFor(scope): Promise<EffectiveWindow>` consumed as operations' type; the real flag `checkout.confirmationCall`; `{when}` computed in the browser at view time and carried to the thank-you; the cache window id changes at store-local midnight for today's hours; hours only from an owner-saved window | STO-D45, D6; §2, §6.5, §7.2, §7.4, §7.5, §8.1, §10.3, §12.6, §14.1, §14.4, §15.4, §15.12, §26.1; §29.5 C2, C6, C11 |
| OPS-13 | major, cross | **Resolved, aligned with core D75 and §I.7.** LP-16 store side is a feature row; the duplicate health rule `sf:landing_fee_mismatch` is withdrawn in favour of landing's `landing:fee_mismatch`; the "Pages de vente" chip reads the same input | STO-D46; §1.2 (LP-16 row), §17.7, §23.8, §26.1 `test:health`; §29.5 C4 |
| OPS-14 | major, cross | **Resolved, aligned with core §A.2 rev 3.** Store mode creates no landing page; `createProduct(ctx, { facts })`, `setThemeDraft(ctx, direction)` and the direction-aware `productAsPageDoc` are specified and frozen at the R2 step; three PDP folds are the reveal | §4.1, §4.5, **§6.7**, §26.2, §27.1, §27.2; §29.5 C5 |
| OPS-15 | major, cross | **Resolved, aligned with core §K.4 (A\*).** Functions stay S1's; the sheet is **S4**'s (rev 3 said S3); S1 ships the products picker component S4 imports | §16.9 (header comment, step 5), §27.1, §27.2 |
| OPS-20 | minor, cross | **Confirmed.** Landing fixed LAN-§14.3 to `settings.write`; core §H.11 names it; this file cites OPE-§26 | STO-D33 (unchanged) |
| OPS-30 | minor, storefront | **Confirmed** (rev 3: hold at `confirmed` by default, `reserveAt = "order"` optional, creation-time `isOut` kept) | §5.6 (unchanged) |
| ENGC-1 | blocker, cross | **Confirmed, aligned.** `is_test` and `orders_store_test_idx` are in **0004** (core rev 3); the "whichever migration" hedge is removed | §2 (test-order row) |
| ENGC-8 | major, cross | **Resolved, aligned.** `test:ownership` exists (core §J.1); the S1 rows add `scripts/qa/render-cases/storefront.ts`, `catalog/product-picker.tsx`, `onboarding.server.ts`, the `landing-v3` entry with the maintainer; the sheet is S4's; the Director review button is P7 / S7's | §27.2 |
| ENGC-13 | major, cross | **Confirmed (core D72).** `createOrderRow` by T3 in R1.0; the R2 step widens `OrderDraft` only | §2, §16.2 step 16 (unchanged) |
| ENGP-1 | blocker, cross | **Resolved, aligned.** The per-kind gate list is design's `KIND_GATES` (DES-§8.13), read, never copied | STO-D35, §6.3 |
| ENGP-3 | major, cross | **Confirmed (core §D.5: `aj_active_uq` on `active`).** No storefront change | — |
| ENGP-4 | major, storefront | **Confirmed**, and extended under the same rule ("every write that changes server HTML bumps") to `ops.callingWindow` writes and mask arrivals | §7.5 |
| ENGP-6 | major, cross | **Resolved, aligned with core §M.2 three zones.** Each `mustShow` item's estimated **top**: ≤ 760 target, 760-938 note, > 938 refused (rev 3 wrote 844-937 on bottoms); `heights.json` named | STO-D32; §6.1, §9.5, §11.3 H11, §12.8, §12.9, §28 |
| ENGP-10 | major, storefront | **Confirmed.** Core §H.3 now states the same split (`sync` for `prices` / `options` only) | §4.3, §17.3 (unchanged) |
| ENGP-15 | minor, storefront | **Confirmed** | §16.2 step 14, §16.3 step 6 (unchanged) |
| ENGP-16 | minor, storefront | **Confirmed**; the "Recharger" button, routed to landing by core §Q.8, is in landing rev 4 (LAN-§17.4 `lp.reload`), and the e2e "page 7 of 10" case now asserts it | §17.3, §26.3; §29.5 C7 |
| ENGP-17 | minor, storefront | **Confirmed** | §6.3 (unchanged) |
| ENGP-21 | minor, storefront | **Confirmed**; `scripts/qa/lib/orange.ts` added to the S1 Build and QA row | §8.4, §27.2 |
| ENGP-22 | minor, storefront | **Confirmed** | §7.2, §7.4 (unchanged) |
| ENGP-23 | minor, storefront | **Confirmed** (core §M.2: 390 × 844 the only server viewport) | §9.5, §11.3 (unchanged) |
| ENGP-24 | minor, cross | **Confirmed (core §J.1: ≤ 3 min, storefront ≤ 40 s, 192 homes).** The 30-home store variant of the N8 corpus test stays in `test:catalog` (cheap) | §11.4, §26.1 |
| ENGP-26 | minor, cross | **Resolved, aligned with core ENGC-10.** The landing chunk is checked with **tolerance 0** (rev 3 said +5 %) | header, STO-D7, §2, §14.1, §26.1 |
| ENGP-27 | minor, storefront | **Confirmed**, plus a leftover fixed: the thank-you session record now stores cents (`totalCents`, `deliveryCents`) | §14.5 |
| ENGP-31 | minor, storefront | **Confirmed**, aligned with core ENGP-12: the cap is declared in `budgets.json.compositions` and measured by the maintainer's `render-check`; §14.7's stale "R3: 43,000" corrected to the derived 42,500 | §14.6, §14.7, §26.1 |
| UX-4 | major, cross | **Confirmed** (design accepted the CSS hooks, DES-§28) | §10.3, §12.5 (unchanged) |
| UX-20 | major, cross | **Confirmed**, and the store-mode onboarding reveal of three PDP folds uses the same layout | §11.4, §23.5, §6.7 |
| UX-21 | major, cross | **Confirmed** (design accepted, DES-§28) | §8.4, §12.8 (unchanged) |
| UX-22 | major, storefront | **Confirmed**, restated on tops under the three zones: the worst cell (CTA bottom 845) is a CTA top of 789, in the note zone, never refused | §12.8, STO-D32 |
| UX-31 | minor, cross | **Resolved, aligned.** `checkout.addressMode: "required" \| "optional" \| null` (landing's key, `null` = market default) read, never redefined | §3.5, §14.4, §15.1 |
| UX-34 | minor, storefront | **Confirmed** | §9.3, §9.5 (unchanged) |
| UX-37 | minor, cross | **Reversed in part.** Control heights, 16 px text, labels and the error summary stay; the **sticky submit is dropped** (landing's OF13 reasoning: the default checkout fits ≈ one screen, a second fixed layer under R7, a `visualViewport` dependency); an e2e assertion pins the submit ≤ 844 px | §15.4, §26.3; §29.5 C8 |
| UX-38 | minor, cross | **Resolved, aligned with core D60 rev 3 and LAN LD38.** The store thank-you's colour moment is landing's `.lp-ty__tint` | §15.12, §26.1 |
| UX-39 | major, cross | **Resolved, aligned with core §M.4 (I3) and §H.3 (`cutout`).** P8's `cutout` handler bumps `catalog_version` for stores whose active products use the asset (rev 3 said "the product save bumps") | STO-D47, §7.5, §26.2; §29.5 C6 |
| SEC-1 | blocker, cross | **Not applicable** (core D69) | — |
| SEC-5 | major, cross | **Resolved, aligned with core D70.** `maskIfImpersonation` at operations' and the platform's repository boundary; S1's repositories return no customer field; the masked-canary case covers S1's routes | §25 |
| SEC-18 | minor, cross | **Resolved, aligned with core D76.** P1's `checkBrandTerms` is the one call; the report page exists from R1, so the footer link is always present, absolute, on every store kind | §10.3, §23.6, §25, §26.1 |
| QUAL-1 | blocker, cross | **Corrected (core §M.4, §Q.8 STO-R39 A\*).** N8 hard on `cloud` / `local` / `engine` lines, soft on owner-typed and plain library fallback lines (rev 3's "owner-typed hard" withdrawn; design rev 4 DS50 states the same origin classes); the instant path uses the compositional generator | §11.4, §29.4 note; §29.5 C3 |
| QUAL-9 | major, cross | **Not applicable to Q**; the AI-19 consumer mount applies ai's one acceptance rule | §23.6 |
| QUAL-10 | major, cross | **Not applicable.** `expandHome` takes design's `GeneHints`, pins included, as given | — |
| QUAL-20 | major, cross | **Resolved, aligned with design.** `nicheShares(niche).seq4` now exists; `expandHome` re-draws against it like design's Act2 order; the sweep stays the acceptance | §11.4; §29.5 C9 |
| QUAL-21 | major, cross | **Not applicable** (ai and design) | — |
| QUAL-25 | minor, cross | **Not applicable**; the Director review mount uses design's exported `AI_REPAIR_OPS` only | §23.6 |
| CRIT1 | major, cross | **Resolved.** One table shape for both consumers: `#sg-config.checkout.zones` = landing's `ZoneTable` (`zonesForCheckout`, keyed by the posted value, built from the slugs); `zoneFeeOfTable` / `zoneFeeOfRow` feed one `storeDeliveryFee`; the parity fixture `scripts/qa/fixtures/city-key.json` asserts both sides and the deep equality with `lp-assist.dz` | STO-D43; §12.3, §14.4, §15.7, §15.9, §26.1; §29.5 C1 |
| CRIT3 | major, cross | **Resolved (storefront side).** `EffectiveWindow` imported, never restated; the config carries P4's serialised form; `Promise<EffectiveWindow>` (never `null`); the `Record<1..7, Range[]>` shape, `configured` / `shopperPromiseAllowed` and the shared fixture `src/lib/callcenter/window.fixtures.ts` landed in OPE rev 4 and this file reads them (hours and `{when}` only for a configured window) | STO-D45; §2, §8.1, §14.4, §26.1; §29.5 C2, C11 |
| CRIT13 | minor, storefront | **Resolved.** STO-§11.4 and the §29.4 R39 note say "hard on generated lines, soft on owner-typed lines (and library fallback lines)" per core §M.4 / DS50 | §11.4, §29.4 |
| CRIT15 | minor, cross | **Resolved (storefront side).** The link renders on every store document (incl. `checkout`, `thanks`, `track`), absolute to the platform origin, asserted by `qa:storefront-render`; the landing-page renderer is landing's / design's (crossFileNote) | §10.3, §25, §26.1 |
| CRIT17 | minor, cross | **Resolved.** New STO-§1.5 "Proven by" (one row per feature id: command + fixture or step) and a "Proves" cell in every STO-§26 test row; three acceptance cells corrected (ST-08 `SearchAction`, ST-09 corpus count, SF-03 rule count); rows added for LP-16 (store side), LP-23 and AI-19 (consumer), the S1 ids of core §K.4 this file lacked | §1.1, §1.2, **§1.5**, §26.1-§26.3 |

---

### STO-§30.3 Critic round 2 (revision 5)

The final critic's issues that name this file, applied against core revision 5 (core §P.3 holds the same lines). One
line per id: what changed, where.

- **CRIT2-9** (minor): the storefront's 40 s is the storefront row of core §J.1's budget table, with the ceiling raised
  explicitly to 240 s at the R2 contract step. Where: STO-§11.4.
- **CRIT2-17** (minor): `republishAttached` decides `sync` vs in-place by diff of the materialised mirror (prices,
  compare-at, options, offer totals) against the published version doc, for every render job of an attached page
  whatever its reason (one pending job per page, no change column); `test:storefront-db` case "stock, then price while
  pending, gives one `sync`". Where: STO-§17.3 (new "Which branch runs" row).
- **CRIT2-20** (minor): the fixed "1,600 px or more" photo rule replaced by design's H13 (slot- and viewport-relative at
  DPR 2, mobile-only bleed with a framed desktop fallback) for `cinematic-bleed` and `immersive`;
  `CatalogShape.wideImages` redefined; `checkHomeDoc` fixtures (a 1,200 px phone photo passes, a 700 px one skips the
  family). Where: STO-§9.3, §9.5, §11.1, §11.3 H12, §12.8.

### STO-§30.4 Wording tidy (revision 6)

The confirming critic's wording minors that name this file (drift only, no decision changed; core §P.4 holds the same
items as W1 … W10). One line per item: what changed, where.

- **W1**: the onboarding paragraph no longer quotes `createProduct(scope, facts)` / `setThemeDraft(scope, direction)` as
  core §A.2's names; it states the `WriteCtx` forms `createProduct(ctx, { facts })` / `setThemeDraft(ctx, direction)` of
  core §A.2 / §K.4 and PLA Q3.8. Where: STO-§4.5 (after the signatures).

## STO-§31 Elevation changes (rev 2)

Every change of this revision, what it does and where it came from. Codes: **D** = core rev 2 decision, **Q** = core
§Q.2 decision on a rev 1 request, **DB** = design-baseline target, **rf** / **ra** = rethink section, **LAN** / **DES** /
**OPE** / **AI** = sibling part section, **rubric** = `qa/ref/anti-slop-frontend-rubric.md`.

| # | Change | Why | Source |
|---|---|---|---|
| 1 | Status → revision 2; inputs widened to core rev 2 (§Q.2), the baseline, both rethinks and the rubric; code facts restated at `a0ffec1` (`src/**` byte-identical to `68c3793`); the frozen set restated | brief item 16; every citation re-verified | header |
| 2 | Owner summary items 14-19 (art-directed layouts and the fold promise, test orders, delivery dates, WhatsApp order, overrides, Store Health inputs and catalog from photos) | the owner reads this first | rf §1.2, §1.6, §1.10, §1.11, §3.1; LAN LD21 |
| 3 | STO-D6 cache: `getOrLoad` single flight, test and arm bypass | STO-R24 accepted; D54; LAN-§18.5 | Q R24, D57, LAN Q38 |
| 4 | STO-D10: `not_served` refusal kept for store checkout as an explicit, scoped deviation from LAN LD6 (leads captured first) | a zone-charged checkout has no honest total for an unserved city | LAN LD6, owner rule 4 |
| 5 | STO-D11 and the whole of STO-§17: attached landings = `materializeAttached` (landing's) + `sync` republish + `attachedDocFor` live re-pricing + **override chips**; rev 1's `attachMirror`, render-on-serve and in-place HTML rewrite withdrawn | the server prices from the version doc, so a price change is a publish; overrides must be visible | D50 refined, Q R6/R12, LAN LD20/LD21, LAN Q24, brief ("price overrides shown as overrides") |
| 6 | STO-D14 and §8.4: registers per DES-§11.1 with two marketing islands in commerce documents; `compileRegister` and the hard commerce rows | design's register table names the PDP info column and the collection grid as commerce and the banner as marketing | DES-§11.1 |
| 7 | STO-D17, §12.3, §15.8, §15.9: landing's `etaWindow` / `etaText` / `zoneForCity` / `zoneLineFor` / `DeliveryZoneRow` signatures adopted verbatim; "(estimation)" marker; identical texts across PDP, cart, checkout, tracking; rev 1's `ZoneLine` and `etaWindow` signatures withdrawn; S1 writes nothing in `src/lib/delivery/**` | ST-17 ships on landing pages in R1 (P3); one engine, one promise | D62 §H.13, LAN-§7.1-7.2, LAN LD5, core §L.2 ST-17, rf §1.6 |
| 8 | STO-D31, §9.5, §11.1-11.2, §12.8: **hero grammars per kind** (8 home families, 6 PDP families) mapped to design's `GRAMMARS`, drawn from the Brand Genome's G2 with the archetype as a prior, seeded by brand seed + catalogue shape; pool tables; share caps ≤ 30 % per niche; rev 1 "archetypes" renamed storylines | the baseline's root cause: the archetype locks the hero (stage on 23 of 39 pages) | DB §4.2 (1, 2, 9), C1, N4, N6; DES-§4.1, §5.4, §5.6, DS1-DS5 |
| 9 | STO-D32, §9.5 `FoldLayout` / `checkFold`, §12.1, H11: **fold contract per kind** verified by the height model at publish and Playwright in e2e | price and CTA below the fold on 23 heroes today | DB C2, F1; D52; DES-§5.3 |
| 10 | STO-D33, §7.2 step 4, §14.1, §14.5, §15.10, §16.1, §16.2 step 4b, §25: **test-order mode on store pages** (token in the session, test render, `test` in payload v3 and the lead, exclusions) | SF-05 assigned to this track's store side; the demo needs it | D54, rf §3.1 SF-05, §4; LAN-§14; OPE-§26; core §C.4.1, §E.2 |
| 11 | STO-D34, §15.11, §15.13, §7.6: **server-priced WhatsApp order** through `POST /api/public/store/lead` `kind: "whatsapp"`; rev 1's client-side composition withdrawn; no new route | the price in the chat is the server's | rf §1.11, LAN LD13, LAN-§11.4, core §D.2 `leads.kind` |
| 12 | STO-D35, §6.3, §23.6: store templates publish through `runPrePublishChecks`; `src/lib/render/prepublish/storefront.ts` with typed `GateItem` ids; the checklist becomes the builder mirror | the server must refuse what the owner rules forbid; one registry | D51, §M.1-M.5, DES-R3, LAN Q13 |
| 13 | STO-D36, §6.1 per-kind budgets table, §12.9, §21.2, §28: page budgets as hard gates (90 / **140 KB**, sections, height, CTAs, glass, reveals, photo reuse); rev 1's 160 KB cap withdrawn | measured baseline 170 KB, 27 sections; the core fixed 140 KB | D52, DB C3, F5, R1, R4, R5, I1 |
| 14 | STO-D37, §12.6, §12.9, §23.6: facts-only proof as a server gate (`storefront:fact_missing`, `honesty:*`) and a render-time drop | invented proof on every baseline page | DB I4, D1, D2; §M.3 |
| 15 | STO-D38, §4.7, §11.4-11.5: catalog from photos and the store blueprint as **detached jobs** (`ai_jobs`, heartbeat, 2 s polling, instant fallback); `startStoreDesign`; the `StoreBlueprint` shape gains `hints`, `provenance`, locale maps, `needsReview` | Fable 5.1 runs for minutes; nothing may block the seller | D56, §H.12, ra §1.5, §4.9, §9.6; AI-04, AI-11; rf §1.10 |
| 16 | STO-D39, §11.6, §23.5, §23.6, §3.1: Design DNA visible (DNA card, brand DNA card, why line, novelty words, provenance columns on template versions) | SF-02 made visible on store pages | rf §1.2, DES-§15.4, DS27, ra §5.6, core §D.2 |
| 17 | STO-D40, §23.8: Store Health rules file with 11 rules; the rev 1 checklist ring replaced by the one health ring | one computation, two audiences | D53, §I.7, rf §1.3, OPE-§27.2 pattern |
| 18 | STO-D41, §19.10: experiments on store pages as a consumer of landing's engine (which kinds and sections, URL arms, the buy-box guard, cache keys) | one engine with honest statistics; the brief asked who owns it | D58, LAN-§18, rf §1.8 |
| 19 | STO-D42, §14.7, §21.1, §21.4, §21.5: 3G budgets per chunk and per kind in bytes and milliseconds (critical bytes, boot times, waterfall, interaction budgets) | "power of the features" on cheap phones must be measurable | brief item 16; DB F5; rf §4 |
| 20 | STO-§1: feature rows ST-04, ST-05, ST-09, ST-10, ST-17 raised; new STO-§1.4 signature-feature table (SF-02, SF-03, SF-05, SF-08, SF-10, SF-12, LP-11 store) | every assigned id has an acceptance row | core §K.2 ownership paragraph, §L.2 |
| 21 | STO-§2: today's hero variants, sticky-bar gate, budgets, design and delivery contracts, test plumbing listed as consumed facts | build agents read what exists first | code at `a0ffec1`; LAN-§7, DES-§5, §8 |
| 22 | STO-§3.1: provenance columns on template versions; `attach_opts` shape; overrides computed, never stored | provenance and honesty | core §D.2, LAN-§17.3 |
| 23 | STO-§4.3, §4.5: `onProductChanged`, `markHealthDirty`, the price-change audit in the save path | the attach republish and the health ring need the signal | LAN-§17.4, core §I.7, §F.5 |
| 24 | STO-§6.3: `ensureTemplateSet(scope)` signature per core §A.2; defaults must pass the gate (test) | the core calls it with a system scope | Q R17, core §A.2 |
| 25 | STO-§7.3: soft 90 KB note, hard 140 KB flag, `test` / `preview` modes; §7.4 single flight through `getOrLoad` | core D52, STO-R24 | D52, Q R24 |
| 26 | STO-§8.1: `addons` and `genome` on the render context | add-on hook and DNA card | D62, §H.13 |
| 27 | STO-§9.2-9.3: `features`, `grammars`, `fold` on store section definitions; `storeHero` and `productDetail` rows rewritten; `ghost: false`; hero stack discipline | the slop score and the height model need registry data; rubric hero rules where the owner allows | DES-§8.4, rubric §4.7, §9.F, DS12 |
| 28 | STO-§11.3 H11-H13; §11.4 instant path with three candidates and the deep pass as an upgrade; acceptance numbers (1,200-home corpus) | measurable novelty and fold | DB N3, N6, N7, C1, C2; ra §1.2 |
| 29 | STO-§13 unchanged except the sort control; STO-§14.6 `store-page` R3 note | budgets | LAN Q5 pattern |
| 30 | STO-§16.2 step 17: `bumpOrderStats` by kind, skipped for test orders | STO-R11 accepted; D54 | Q R11, core §D.2 |
| 31 | STO-§22.1, §22.3: WCAG 2.2 criteria (2.4.11, 2.5.7, 2.5.8, 3.3.7), one announcement per action, RTL1-RTL8 checks | accessibility raised as the brief asks | WCAG 2.2; DB RTL1-RTL8 |
| 32 | STO-§23.5, §23.7, §23.9: storefront overview with the address card's test order and the design card; new copy keys; admin UX ceiling compliance with chords `G K`, `G B` | core §I.8 rules on this track's screens | core §I.4, §I.8, DES-§16.17, rf §2 |
| 33 | STO-§24: shopper keys for estimated dates, WhatsApp order, test banner, gallery counter, hero CTAs; i18n coverage note | ar/fr/en completeness, no dashes | core §I.5, DES DS13, rubric §9.G |
| 34 | STO-§25: test token, WhatsApp intent, experiments and attack cases | new public surfaces in the suites | core §F.1, §J.5 |
| 35 | STO-§26: `test:catalog` corpus and gate fixtures, `qa:storefront-render` fold / budget / test-render assertions, DB cases for test, WhatsApp, sync, overrides and gates, `qa:storefront-demo` and **STO-§26.4 the R2 store demo** | every new contract has a test; the demo is the R2 acceptance | rf §4; core §J, §K.2 criterion 12 |
| 36 | STO-§27: contract-step list aligned with core §K.4; extension files (prepublish, health, pulse, notify, flags, commands, search, tenancy cases); landing parts owned by S1; `src/lib/delivery/**` and `src/lib/design/**` read-only; R2 exit extended | file ownership consistent with the core | core §K.3, §K.4, LAN-§26.2 |
| 37 | STO-§28 limits rows; STO-§29.1 decisions recorded; STO-§29.3 three second-round requests (R25-R27); STO-§31 this table | traceability | core §Q.2 |
| 38 (rev 3) | Every change of **revision 3** is recorded per finding in **STO-§30.1** (decision + sections) and, for the cross-file side, in **STO-§29.4** (STO-R28 … R42); paragraphs and rows marked **rev 3** in the body are the edits. Decisions added: STO-D43 (one city key), D44 (catalog orders by agents), D45 (one calling window), D46 (fee honesty across surfaces), D47 (cutout-later heroes); sections added: STO-§16.8 (parity), STO-§16.9 (`createManualOrderV3` / `editOrderV3`), STO-§29.4, STO-§30.1 | round-1 review | the findings OPS-*, ENGC-*, ENGP-*, UX-*, SEC-*, QUAL-* listed in STO-§30.1 |
| 39 (rev 4) | Every change of **revision 4** is recorded per finding in **STO-§30.2** and, where it touches another file, in **STO-§29.5** (C1-C12, contradictions only: the core closed the third round). Main changes: one browser zone table (landing's `ZoneTable`, keyed by the posted value; no `cityKey` in store chunks); operations' `EffectiveWindow` consumed unchanged, `{when}` computed in the browser, the render-cache window id per store-local day; the core's three fold zones on estimated tops; N8 hardness by origin per core §M.4; the always-present absolute report link; one fee-mismatch health rule (landing's); the store-mode onboarding entry points; the partial-delivery restock of `line_outcome`; no sticky checkout submit; real setting keys (`confirmationCall`, `policies.returns.windowDays`, `inspection = "allowed"`); STO-§1.5 "Proven by" and "Proves" cells; feature rows LP-16 (store side), LP-23, AI-19 (consumer) | round-2 review + critic | core rev 3 §P, §Q.8, D68-D76; CRIT1, CRIT3, CRIT13, CRIT15, CRIT17 |
