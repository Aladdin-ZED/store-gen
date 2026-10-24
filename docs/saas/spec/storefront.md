# Store Gen SaaS part spec: storefront (store mode, catalog, page kinds, cart and COD checkout, payload v3, SEO, speed, accessibility, "both" mode)

Status: **part spec, revision 1** (2026-10-24, storefront part architect). Not yet reviewed (STO-§30 is empty). Built on
`docs/STORE-SAAS.md` revision 1 (the core contract, cited **core §X**) and on the settled research decisions of
`docs/saas/RESEARCH.md` §2 (cited **R-D1 … R-D53**). It covers every storefront feature id **ST-01 … ST-22**, the "both"
mode ids **LP-07** (attach a landing to a product) and **LP-08** (campaign vs inherit, storefront side), the store
registers of **DG-11** where they are storefront-specific, and the TENANCY-MAP items the core hands to this part
(LND-01, LND-03, LND-04, LND-06, LND-09, LND-10, LND-11, LND-15, LND-30, LND-31, LND-33, LND-34, ORD-19, ORD-20,
PUB-23). Section ids carry the prefix **STO-§** so references to the core (`core §E.2`) and to sibling parts
(`design.md DES-§11`, `ai.md AI-11`, `landing.md`, `operations.md`, `platform.md`) stay unambiguous.

This document refines only what core §D.9 gives the storefront part: the tables `products`, `collections`,
`collection_products`, `inventory_levels`, `reviews`, `review_requests`, `coupons`, `coupon_redemptions`, `stock_holds`;
the values of `pages.kind`; and the schemas of the store settings `storefront`, the R2 block of `checkout`, and
`reviews` (core §D.10). Everything else it needs (a new table, a shared-file change, a resolver, a budget key, a route
class, a permission) is listed in **STO-§29 Requests to the core** with the exact change. Nothing here edits the core.

Inputs: `docs/STORE-GEN-BRIEF.md` items 1, 5, 7, 8, 9, 14, 15, 16 · `docs/HANDOFF.md` §2 (owner rules), §4 (Hostinger) ·
core (mostly §A.2, §A.3, §A.4, §C.4.1, §C.6, §C.8, §C.9, §D.2, §D.6, §D.9, §D.10, §E, §F.6, §H.3, §K.4, §K.5) ·
RESEARCH §2-§4 · `docs/saas/research/storefront.md` (the area study, cited **sf §x**) · `docs/saas/research/cod-ops.md`,
`design-gen.md`, `rethink-features.md` (cited **rf §x**) · `docs/saas/TENANCY-MAP.md` · `docs/saas/spec/design.md`
revision 1 (DES-§11 registers, DS13 no dashes, DS15/DS16 store theme) · `docs/saas/spec/ai.md` revision 1 (AI-09,
AI-10, AI-11) · `docs/OFFERS.md` (items, offers, options, pricing, payload v2: cited **OFFERS §X**). Code facts are
`path:line` at commit `68c3793`. Next.js is 16.4: store pages are **route handlers** that return HTML (the pattern of
`src/app/[slug]/route.ts:11-40`: `await connection()`, then a `Response`), not React Server Components; the request
hook is `src/proxy.ts` (core §C.3), untouched by this part; `after()` is used from route handlers
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).

Reading order for a build agent: STO-§0 (decisions) → STO-§1 (your feature rows) → STO-§27 (the files you own) → the
sections your files touch → STO-§26 (tests you must keep green) → STO-§29 (what the maintainer still has to give you).

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

---

## STO-§0 Decisions at a glance

R-D22, R-D41, R-D42, R-D43, R-D44, R-D45, R-D46, R-D48 and R-D49 are the storefront decisions this spec builds on,
adopted as settled. Rows marked **refines** or **deviates** say why.

| # | Decision | Why |
|---|---|---|
| STO-D1 | **Store pages are template pages in `pages`.** `pages.kind ∈ {home, product, collection, page, search, cart, checkout, not_found}` holds a new **`StorePageDoc` v1** (sections only, no product, no offers) in `pages.draft` and `page_versions.doc`. One `home`, `product`, `collection`, `search`, `cart`, `checkout`, `not_found` per store (the **template set**); `page` = any number of custom content pages at `/<slug>`. `policy` stays **reserved** (policy pages are `LegalBody` + store chrome, no doc). `landing` pages keep the frozen PageDoc v2. | core §D.2 already adds `pages.kind`; reusing `pages` gives versions, history, restore, preview links and `asset_refs` for free; PageDoc v2 is frozen and cannot express a home page (`items.min(1)`, `offers.bundles.min(1)`, `src/lib/page/schema.ts:827-828`; LND-04). |
| STO-D2 | **Publishing a store template = choosing its live version.** Non-landing versions keep `html`, `thank_you_html`, `csp` NULL; every store page renders on request (STO-D6). The six utility templates (product, collection, search, cart, checkout, not_found) are created and **auto-published** from defaults when the store first enters `store`/`both` mode; `home` and custom pages publish only on the owner's click. | Catalog pages embed live prices (R-D42); utility templates are structural, so the catalog works at once; the home is the brand's first impression and needs a review. |
| STO-D3 | **A catalog product = an Offers v2 document plus presentation.** `products.doc = { product, items, offers }` (OFFERS §B-§D shapes) validated by building a full PageDoc around it and running `PageDocObject` (every Offers v2 rule reused); `products.content = { v: 1, sections }` holds the product's own content sections (benefits, specs, FAQ…); `products.rev` (ULID) changes on every priced or availability change; `products.public_key` (random, global) is the product's public key. | One pricing engine for server, runtime and PHP (OFFERS D9; `src/lib/page/pricing.ts` unchanged, ST-01). Product-specific content cannot live in a template shared by every product (STO-D4). |
| STO-D4 | **The PDP template is a layout, the content is the product's.** The `product` template holds `productDetail` (the buy region, required), a **`productContent` slot** that renders `products.content.sections` with the product's context, and shared sections (related grid, trust strip, store FAQ). Landing section types are reused through an **eligibility table** (`src/storefront/sections/eligibility.ts`), never by editing their definitions. | Resolves LND-01 and LND-03 without touching `SectionDefinition` (`src/landing/types.ts:240-255`) or any landing section file; one template serves 2,000 products. |
| STO-D5 | **Inventory = manual flags + optional counts, per stock key.** Each item tracks stock on one **axis**: the item, its matrix combinations, or one choice group's options. Availability = the doc's own sold-out flags **or** `on_hand − held ≤ 0` when counted. R2: counts decrement when the order's `ship_state` becomes `shipped` (idempotent through `inventory_moves`), never at placement. R3: a soft hold at creation, released on cancel/fake/unreachable/refused (R-D48). A count is shown to shoppers only when the owner turns on "show low stock" and the real count is ≤ the owner's threshold. | R-D48 (many COD orders never ship: holding hard at placement shows false "sold out"); owner rule 4 (never invented stock). |
| STO-D6 | **On-request rendering with one store-wide version.** Cache key = core §E.6 `${storeId}:${path}:${locale}:${catalogVersion}:${addressVersion}` plus a time-window id `:w<n>` (n = announcement boundaries already passed; request STO-R7); `stores.catalog_version` is bumped by any change that can alter a store page (product, collection, inventory crossing, menu, template publish, theme, zones, storefront settings). ETag = `"s1-" + sha256(cacheKey + BUILD_ID)[:20]` answers 304 **before** rendering; `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`; concurrent misses on one key share one render (single flight). | R-D42; one Node process, no queue workers; a store-wide counter makes invalidation trivially correct at our scale (≤ 2,000 products per store, `products_max`). |
| STO-D7 | **New runtime chunks, the landing chunk untouched** (R-D43): `pdp` = a new **entry** over the existing landing runtime modules (bundles, units, gallery, tabs, accordion, video, sticky, analytics) + a selection **bridge**; `store` (chrome), `cart`, `checkout`, `store-pixels`, `store-thanks`; `search` in R3. Store pages other than the PDP load no landing module; their motion is CSS-only. The generated landing chunk stays **byte-identical** (sha256 asserted by `qa:storefront-render`). | LND-15, LND-16: the landing chunk sits within 30 B of its 24,200 B budget; source-level reuse keeps the pickers, units and option rules exactly as on landing pages. |
| STO-D8 | **Both buy models on payload v3, as settled (R-D44).** `inline` = the checkout block rendered under the buy box on the PDP (one line, `surface: "pdp"`); `cart` = "Ajouter au panier" + "Commander maintenant" (buy now = `/checkout` with that line only). Default when a store first enters store/both mode: `inline` when it has ≤ 3 active products, else `cart`; a suggestion chip after that, never an automatic switch. | An ad click → order needs zero page loads (sf §4.4); bigger catalogues need a cart. One server path for both. |
| STO-D9 | **Payload v3 carries per-line proof**: each line sends the product's public key, the `rev` it was priced with and the line subtotal shown; the server re-prices every line with `resolveSelection` + `orderTotals` (unchanged) and answers **per-line verdicts** (`ok`, `changed` with the new amount, `unavailable`, `removed`). A changed line refuses the order (`stale`) and the checkout updates the line in place and asks to confirm: **no page reload**. Order bumps and thank-you upsells are not part of store products in R2 (stripped at save with a note). | ORD-19, ORD-20, LND-33; reloading would loop behind a 60 s edge cache; v3 knows exactly which line moved. |
| STO-D10 | **Delivery fee in store mode** (refines R-D22 for store checkout): `free_offer` when every line's offer has free delivery → else the shopper's **zone** (`delivery_zones`, landing.md): `not_served` refuses, `free_from_cents ≤ subtotal` → 0, `fee_cents` → that fee → else the store's **fallback fee** (`checkout.store.fallbackFeeCents`). No zone and no fallback = the checkout template cannot be published (checklist error). The checkout and the inline PDP block show the same number the server charges. Landing pages keep their flat page fee until LP-16 (R-D22). | Owner rule 4 (never invent a fee); the zone fee is the trust lever (sf §1.4); R-D22. |
| STO-D11 | **Attached landing = mirror + live re-pricing** (LP-07): `pages.product_id` set; the landing doc's `items` are a mirror of the product's items (ids, prices, compare-at, groups, sold-out, SKUs; names and photos may stay the landing's own); its offers stay its own and may reference only the product's items. Orders on an attached landing price against **the live product items + the version's offers** and always run the v2 **fallback** comparison (any total ≠ `st` → `stale`). A product change enqueues `render_jobs` reason `product` for each attached live page (≤ 5 also rendered at once in `after()`), and serving self-heals when `page_versions.product_rev` ≠ `products.rev`. Default `noindex` + canonical to the PDP (R-D49), owner toggle. | One price and stock truth (sf §8); core D50 forbids rewriting the version doc on re-render, so the live overlay happens at order time and at render time. |
| STO-D12 | **No review display before verified reviews exist** (R-D46): in R2 store pages render no stars, no rating badge and no `aggregateRating`; `products.doc.product.rating` is dropped on every write; landing review sections are not eligible on store kinds. R3 (ST-13) shows verified reviews only; imported reviews are labelled and excluded from aggregates. | EU Omnibus Annex I 23b, owner rule 4 (sf §4.9). |
| STO-D13 | **Facts-only commerce rendering**: every badge and number on a store page comes from data the server can prove (STO-§12.6 table): "Livraison offerte", savings, compare-at, "Dès", bestseller, low stock, ETA, returns window, "vérifiez avant de payer", "un conseiller vous appelle". Generators write copy, never facts. | Owner rule 4; Morocco law 31-08 (seller identity and total price up front, sf §2). |
| STO-D14 | **Registers per page kind** (DG-11, DES-§11): home and custom pages = `marketing`; product, collection, search, cart, checkout, not_found = `commerce`; thank-you and track = `transactional`. Commerce kinds: no glass surface, no motion longer than 250 ms, accent fill ≤ 8 % of the viewport area, store sections only CSS motion. | One brand across registers (R-D41); commerce pages must read as precise tools, not posters. |
| STO-D15 | **Chrome is store-level, not per page**: header (`navHeader`), announcement bar, footer and WhatsApp float are configured once in the store setting `storefront` and rendered around every store kind; the landing `header` section stays nav-free (`src/landing/sections/header/index.tsx:1-4`). | LND-31; one menu edit updates every page; the landing header is nav-free on purpose. |
| STO-D16 | **Store thank-you lives at `/checkout/merci?o=<orderId>`**, renders the landing.md LP-04 blocks (confirm on WhatsApp, expectation block, tracking link) inside the store chrome, and is filled client-side from `sessionStorage` written by the checkout: the HTML holds no order data; `Cache-Control: private, no-store` (core §F.6). | Uses the `/checkout` route the core already lists (core §C.4.1); no new top-level path. |
| STO-D17 | **ETA as dates (ST-17) ships with store pages in R2.** **Deviates** RESEARCH §3.3 (R3): store surfaces call landing.md's `etaWindow()` (`src/lib/delivery/eta.ts`); if landing.md did not ship it in R1 (rf §3.2 raises it to R1), S1 writes it there under the same signature. | Baymard's delivery-date finding (sf §2); the engine is small (S) and zones exist from R1. |
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
| ST-04 | PDP anatomy | R2 | S1 | `productDetail` (gallery with option image swap, title, price block with genuine compare-at and per-unit, Offers v2 pickers, options and fields, buy box, delivery line by city, trust row from facts, sticky buy bar), `productContent` slot, related grid, ProductGroup JSON-LD | The first 360 × 740 screen shows image, name, price, the COD promise and the primary action; a choice whose matrix cell has a photo swaps the gallery; the trust row shows "vérifiez avant de payer" only when the store policy fact `inspection` is true; the sticky bar never covers the checkout block | STO-§12 |
| ST-05 | Cart + one-page COD checkout + payload v3 | R2 | S1 | `cart` and `checkout` chunks, cart drawer and page, checkout page and inline block, `contract-v3.ts`, `/api/public/store/{order,lead,cart}`, per-line server re-pricing and verdicts, zone fee, store thank-you, abandoned-checkout leads, WhatsApp alternative | 20 lines × `n` = 10 checkout succeeds with the server total equal to the shown total; a price changed between add and submit answers `stale` with the new line amount and the order succeeds after the shopper confirms; two stores' product keys in one cart answer `invalid` and create nothing; an idempotent replay answers `ok` with `duplicate: true` and the same order id | STO-§14, §15, §16 |
| ST-06 | Checkout field model + phone and city UX | R2 | S1 | Market field model (R-D45), autocomplete tokens, `dir=ltr` phone in RTL, as-you-type grouping, Arabic-digit-safe phone, city combobox over the 147 cities with folded matching and "Autre ville" | MA form = exactly 4 required inputs + optional note; typing "٠٦١٢٣٤٥٦٧٨" shows "06 12 34 56 78" and the server stores `+212612345678`; "tanja", "طنجة" and "Tanger" all select Tanger; EU markets show street, postal code and city with the correct `autocomplete` tokens | STO-§15.5-§15.7 |
| ST-07 | On-request render cache | R2 | S1 | Cache key, ETag before render, single flight, `catalog_version` bumps, compressed representations, attached-landing dependency (with STO-D11), load test | A second GET of a PDP is served from memory in ≤ 5 ms p95; a price save makes the next GET of that PDP, its collections and the home show the new price; 200 concurrent cold requests for one PDP render it once; HEAD with a matching ETag answers 304 without a render | STO-§7 |
| ST-08 | Store SEO | R2 | S1 | Organization, WebSite + SearchAction, Product / ProductGroup with `hasVariant`/`variesBy`, ItemList on collections, OG per kind, clean URLs and 308s, canonical rules, per-store sitemap entries for products and collections, `noindex` kinds, title template without dashes | Google's structured-data validator (manual, R2 exit) passes on 3 fixtures; no document contains `priceValidUntil` unless a real end date exists and is in the future; no `aggregateRating` in R2; `sitemap.xml` lists active products and collections only, at the canonical origin | STO-§20 |
| ST-09 | Home grammar, 4 archetypes | R2 | S1 (+ S2 generator fill) | Slot lists for hero product, category bento, editorial lookbook, catalogue-dense; invariants; default selection by catalogue shape; `applyStoreBlueprint` for AI-11 | 4 archetypes × 3 catalogue fixtures produce valid docs satisfying every invariant of STO-§11.3; two stores with identical inputs get home docs whose genome distance passes design's novelty check (DES-§7) | STO-§11 |
| ST-10 | Accessibility AA pass | R2 | S1 (+ every track for its own sections) | Landmarks, skip link, dialogs (drawer, sheets) with focus trap and Escape, live regions for cart changes, labelled steppers and swatches, announced errors, 44 px targets, reduced motion, contrast through the theme engine, RTL; automated static check + keyboard scripts | `qa:storefront-a11y` reports 0 errors on every kind fixture; the keyboard-only script completes browse → add → checkout → thank-you; VoiceOver/TalkBack manual pass recorded at R2 exit | STO-§22 |
| ST-11 | Filters, quick add, instant search | R3 | D3 | Instant search chunk over a per-store index (≤ 500 products), bottom-sheet filters (price, option values, availability), quick add for products with one offer and ≤ 1 choice group | Index JSON ≤ 12 KB gz for 500 products; filters update the count without a page load and the URL keeps the state (`?f=`); quick add is never offered for products with matrix groups, fields or several offers | STO-§13.4-§13.6 |
| ST-12 | Multi-locale siblings + hreflang + locale chip | R3 | D3 | `products.i18n` text overlay per locale, `/<locale>/…` prefixes, `hreflang` + `x-default`, a client chip from `Accept-Language`, no redirect | Every sibling page links all siblings and `x-default`; prices and ids are identical across siblings; no response varies on `Accept-Language` | STO-§19.7, §20.6 |
| ST-13 | Verified review collection | R3 | D3 | Signed post-delivery links, review page, photos through the media pipeline, hide-only moderation with audit, "Achat vérifié" badge, automatic disclosure, "imported" label, aggregates and JSON-LD from verified only | A review can be written once per order line and only after `delivered`; editing text or stars is impossible in the admin; imported reviews never enter `aggregateRating`; the disclosure line renders wherever ratings render | STO-§18 |
| ST-14 | Coupons | R3 | D3 | Server-validated codes (percent, fixed, free delivery), scope, caps, per-phone limit, real dates, checkout field, discount row, allocation for pixels and accounting | An expired or capped code answers `coupon: invalid` without revealing which rule failed; a percent coupon never makes a line negative; redemptions are unique per order | STO-§19.1 |
| ST-15 | Stock soft hold + decrement at shipping | R3 | D3 | `stock_holds` at order creation (TTL 7 days), release on cancel/fake/unreachable/refused/duplicate, decrement at shipped consumes the hold | Two concurrent orders for the last counted unit: the first holds it, the second answers `unavailable` for that line; a cancelled order frees the unit within the same request | STO-§5.6 |
| ST-16 | Size guide | R3 | D3 | Per-product chart (rows × columns, units cm/in by market), bottom sheet from the size option, empty skeleton proposed for garments (never invented measurements) | The skeleton has headers only; the sheet opens from the size group label and traps focus | STO-§19.3 |
| ST-17 | ETA as dates | **R2** (raised, STO-D17) | S1 (engine: landing.md or S1) | `etaWindow` with cut-off hour, working days, holiday table; dates on PDP, checkout, cart | Cut-off and weekend crossings, holidays skipped, ar and fr date rendering match the selftest; a zone without ETA shows no date | STO-§15.8 |
| ST-18 | Speculation Rules + bfcache hygiene | R3 | D3 | `moderate` prefetch from grids to PDPs, no `unload`, no `no-store` on public kinds | Chrome DevTools bfcache test passes on home, collection and PDP; prefetch fires only on hover/touch-start | STO-§21.6 |
| ST-19 | Home archetypes 5-8 | R3 | D3 | Drop, routine, gift guide, local maker (modern visuals only) | Same invariants as ST-09; the drop archetype is unavailable without a real launch date | STO-§11.2 |
| ST-20 | Breadcrumbs | R3 | D3 | Visible breadcrumbs on PDP and collection + BreadcrumbList JSON-LD from `primary_collection_id` | The JSON-LD trail equals the visible trail; RTL order mirrored visually only | STO-§19.4 |
| ST-21 | EU legal pack | at the first EU store | D3 or the R-at-hand track | 30-day lowest price next to compare-at, consent banner with Consent Mode v2, review disclosure, EU address fields, AA gate | An EU store cannot activate checkout until each item is green in the EU gate | STO-§19.8 |
| ST-22 | PWA per store, "my orders" with OTP, recently viewed, co-purchase cross-sell | later | — | Each gated on owner demand and a messaging provider | Own acceptance when scheduled | STO-§19.9 |

### STO-§1.2 "Both" mode and registers

| ID | Feature | Rel. | Track | Scope (storefront side) | Acceptance | Spec |
|---|---|---|---|---|---|---|
| LP-07 | Attach a landing to a catalog product | R2 | S1 (+ landing.md for the landing editor panel) | `pages.product_id`, item mirror, offers restricted to the product's items, live re-pricing at order, `product_rev` self-heal, render fan-out, `noindex` + canonical to the PDP by default, "Create a campaign page" from the product | Changing the product price re-renders every attached live landing within the same request (≤ 5) or the next tick; an order placed from the old HTML answers `stale`; an attached landing's offer referencing a removed item becomes unavailable and the builder shows an error | STO-§17 |
| LP-08 | Campaign vs inherit theme mode | R2 | S2 (design) + S1 | Storefront side only: the attach flow keeps the page's current `theme_mode`; a landing created from a product starts as `campaign` with the brand locks; store chrome links ("Voir la boutique") on attached landings' footer and thank-you | A landing created from a product renders with the store logo and locked brand colours; switching to `store` re-renders it in the store look (DES-§11) | STO-§17.6 |
| DG-11 | Store theme across registers (storefront consumer side) | R2 | S2 (owner) + S1 | Kind → register map, commerce-register limits enforced by store sections, `getStoreTheme(scope, register)` consumed by the store document | A commerce page has no glass token in its CSS and no transition longer than 250 ms (render matrix); a brand change bumps `catalog_version` so store pages show it on the next request | STO-§8.4 |

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
| Core additions this part relies on | core §C.4.1 (`/p`, `/c`, `/cart`, `/checkout`, `/search`), §C.6 URL builders, §D.2 `pages.kind` / `pages.product_id` / `orders.catalog_version` / nullable `orders.page_id`, §D.6 catalog tables, §E.6 render cache key, §H.3 render jobs | Everything below |

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
  (the landing rule, extended by request STO-R3 for the boot task).

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
| `checkout` (block `store`) | R2 | `src/lib/settings/keys/checkout-store.ts` (request STO-R16: the registry merges it into `checkout`) | `buyModel`, `fallbackFeeCents`, `cartEnabled`, `whatsappAlternative`, `maxLines`, `maxQty` (STO-§15.1); the R1 fields of `checkout` (zones on/off, market field model, confirmation-call promise) stay landing.md's |
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
/** @write */ export function createProduct(ctx: StoreCtx, input: ProductInput): Promise<ProductRow>;
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

`saveProduct` order: `checkProductDoc` → content and SEO schemas → `assertOwned` → `deriveProduct` → one transaction
(`UPDATE products … WHERE id = ? AND store_id = ? AND rev = ?` compare-and-set; 0 rows → `conflict`; slug change →
`catalog_redirects` upsert; collection membership; `catalog_version` bump) → `syncAssetRefs(scope, "product", id, ids,
{ live: status === "active" })` (core §G.5) → audit → `invalidateStore` → `after()`: attached-landing fan-out when `rev`
changed (STO-§17.3).

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
  `catalog_version` is bumped and attached landings are re-rendered (STO-§17.3). Decrements that stay above 0 change only
  the count (no `rev`, no re-render).
- Returns: an owner action "Remettre en stock" on a returned order (operations' returns flow, OP-22 in R3; in R2 a
  button in the order drawer through operations.md) writes `returned_restock` moves with `+qty`.
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

### STO-§5.6 Soft holds (R3, ST-15, R-D48)

- At order creation (v3, and v2 orders of attached landings), inside the order transaction, per counted stock key:
  `UPDATE inventory_levels SET held = held + ? WHERE store_id = ? AND product_id = ? AND stock_key = ? AND (on_hand IS
  NULL OR on_hand - held >= ?)`; affected rows 0 → that line is `unavailable` and the order is refused with the line
  verdict (no partial order). Then `INSERT stock_holds (state 'held', expires_at = now + 7 days [proposal])` and a `hold`
  move. Atomic without `SKIP LOCKED` (conditional update, the pattern of core §D.7).
- Release (`held -= qty`, state `released`, `release` move) on `confirm_state → cancelled | fake | duplicate |
  unreachable` and on `ship_state → refused | returned` before shipping consumed the hold, and by the job
  `stock.holds_expire` (every tick, per store, ≤ 500 rows) for holds past `expires_at` whose order is not shipped.
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
export function ensureTemplateSet(ctx: StoreCtx | SystemCtx & { scope: StoreScope }): Promise<{ created: StorePageKind[]; published: StorePageKind[] }>;
export function defaultTemplate(kind: StorePageKind, shape: CatalogShape, store: StoreRow): StorePageDoc;   // pure; home uses STO-§11
export function getLiveTemplate(scope: StoreScope, kind: StorePageKind): Promise<{ pageId: string; versionId: string; publicKey: string; doc: StorePageDoc } | null>;
/** @write */ export function saveStorePage(ctx: StoreCtx, pageId: string, doc: unknown, expectedVersionId: string | null): Promise<SavePageResult>;
/** @write */ export function publishStorePage(ctx: StoreCtx, pageId: string): Promise<PublishStorePageResult>;   // checklist gate, then version kind "publish"
```
- Runs under `withNamedLock(storeLock(storeId, "templates"), 5, …)` (core §E.7).
- Called (a) after a mode change to `store` or `both` (request STO-R17: the mode-change action calls it), (b) lazily on
  the first open of `/app/<h>/storefront`, (c) by the store blueprint apply (STO-§11.5).
- Auto-publish of utility kinds is refused in states without `publish` (pending, restricted…; core §A.5.2): the rows
  stay drafts and publish themselves on approval (the approval transition calls `ensureTemplateSet`, request STO-R17).
- Template versions use `page_versions` (`save`, `autosave`, `publish`, `restore`); history, restore and starred
  versions work like landing pages (the history screen shows the kind label). `versions_kept_per_page` applies.
- Publish = new `publish` version + `pages.published_version_id` + `pages.status = 'published'` + `catalog_version`
  bump, in one transaction. Unpublishing a utility template is impossible (it would break the store); the editor shows
  "Restore the default" instead.
- `publishStorePage` gate: `storefront.write`, entitlement `publish` (state cap), kill switch `publishing_enabled`,
  `s:<sid>:publish` 60/h (core §E.8), the store-page checklist (STO-§23.6) with no error, design's static gates on the
  doc (DES-§8; dependency STO-§29.2).

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
contact policy page adds the store's WhatsApp, phone, e-mail and hours from the `store` setting, each shown only when
set. No map, no form.

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
export interface StoreRoute { kind: StorePageKind | "thanks" | "policy" | "track"; slug?: string; query: { page?: number; sort?: SortKey; q?: string }; status?: 200 | 404 }
export function serveStorePage(req: Request, handle: string, route: StoreRoute): Promise<Response>;
```
1. `await connection()`; `store = resolveStoreByHandle(handle)` (core §E.5); missing → neutral 404.
2. Canonical check (core §C.8): non-canonical host, renamed handle or uppercase slug → 308 with the raw query.
3. State gate (STO-D28) and mode gate (`modeAllows(store.mode, "storefront")`); failing → neutral 404 (or 410 after a
   purge, core §A.5.3).
4. `scope = publicScope(store)`; `cacheKey = storeCacheKey(store, route, storeWindowId(settings, now))` (STO-§7.4,
   the `storefront` setting comes from the settings cache); `etag = storeEtag(cacheKey)`.
5. `If-None-Match` matches → **304** with the document headers, no render, no DB beyond the cached store row.
6. Cache hit → `storeDocumentResponse` (compressed representation per `Accept-Encoding`, created once and kept).
7. Miss → `singleFlight(cacheKey, () => renderStorePage(scope, store, route))`, cache set, respond.
8. A render that throws → the neutral "temporarily unavailable" 503 (`unavailableResponse`,
   `src/lib/render/serve.server.ts:231`) + `recordError("storefront", err, { storeId, route })`; nothing cached.

### STO-§7.3 Render pipeline

```ts
// src/lib/storefront/render.server.ts
export interface RenderedStorePage { html: string; csp: string; etag: string; status: 200 | 404; bytes: number; noindex: boolean }
export function renderStorePage(scope: StoreScope, store: StoreRow, route: StoreRoute, opts?: { mode?: "live" | "preview"; draft?: StorePageDoc; productDraft?: ProductRow }): Promise<RenderedStorePage>;
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
8. Size check: document > 160 KB gzip → still served, `recordError("storefront", "page_cap")`; the template publish
   gate (STO-§23.6) renders the template with the store's heaviest product and refuses publish above the cap.
9. Budget: p95 ≤ 120 ms server time for a cold PDP render on the Hostinger plan [proposal, measured in the R2 load
   test]; a warm hit ≤ 5 ms.

### STO-§7.4 Cache key, ETag, single flight

```ts
// src/lib/storefront/cache.server.ts
/** core §E.6 key + window id; `path` = kind + slug + whitelisted query in a fixed order ("p:argan-oil", "c:soins?page=2&sort=price_asc", "s:<folded q>") */
export function storeCacheKey(store: StoreRow, route: StoreRoute, windowId: number): string;   // `${id}:${path}:${locale}:${catalogVersion}:${addressVersion}:w${windowId}`
/** number of announcement start/end instants (storefront setting, cached) at or before `now`: changes exactly when the rendered chrome must change */
export function storeWindowId(settings: StorefrontSettings, now: Date): number;
export function storeEtag(cacheKey: string): string;                         // `"s1-" + sha256(cacheKey + BUILD_ID).slice(0, 20) + '"'`
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T>;   // map in scopedCache("store-render-inflight", 2,000 entries, 30 s)
```
- Entries live in the core's byte-bounded `scopedCache("render")` (32 MB shared with landing pages); a value =
  `{ html, csp, etag, status, br?, gz? }`, size = Σ byte lengths.
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
| inventory crossing (available ⇄ out) | S1 | yes (count-only changes: no) |
| collection save, membership, archive | S1 | yes |
| store template publish or restore-and-publish | S1 | yes |
| `storefront` or `checkout` setting write | S1 / landing.md | yes |
| delivery zone write | landing.md | yes (request STO-R19) |
| store theme / brand change | design S2 | yes (request STO-R19) |
| `store` setting (name, contacts, legal facts) and `policies` facts | core / landing.md | yes (request STO-R19) |
| verified review published or hidden (R3) | D3 | yes |
| handle, mode, domain change | core | `address_version` instead (core §C.6) |

### STO-§7.6 Public store APIs (`src/app/api/public/store/**`, request STO-R10)

| Route | Method | Body limit | What | Buckets | Answer |
|---|---|---|---|---|---|
| `order/route.ts` | POST | 48 KB | payload v3 (STO-§16) | `p:api:order:<ipHash>` 60/10 min, `s:<sid>:order:ip:<ipHash>` 8/10 min, `s:<sid>:orders` 600/10 min (core §E.8) | `OrderResponseV3` |
| `lead/route.ts` | POST | 16 KB | abandoned-checkout lead (STO-§15.11) | `s:<sid>:lead:ip:<ipHash>` 30/10 min | `{ ok: true }` always (no oracle) |
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
}
export interface StoreFacts {                       // from the `policies` and `store` settings; absent = not stated by the owner
  cod: true;                                        // store mode is COD-only in R2/R3
  inspection?: boolean;                             // "vérifiez avant de payer"
  returnsDays?: number;                             // returns window
  exchangeDays?: number;
  callPromise?: boolean;                            // the store makes confirmation calls (checkout setting)
  whatsapp?: string; phone?: string; email?: string; hours?: string;
  legalName?: string; city?: string; ice?: string; rc?: string;
}
export interface DeliverySummary {                  // from delivery_zones + fallback fee (STO-D10); null fields = not set
  enabled: boolean; minFeeCents: number | null; maxFeeCents: number | null; freeFromCents: number | null;
  etaMinDays: number | null; etaMaxDays: number | null;     // over served zones
}
export interface StoreRenderContext {
  mode: "live" | "preview"; kind: StoreDocKind; register: Register;
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

| Kind | Register | Storefront-enforced rules (design owns the tokens and gates, DES-§11) |
|---|---|---|
| home, page | marketing | the page may use every gene of the store's Brand Genome; one hero signature (DESIGN v3 budgets) |
| product, collection, search, cart, checkout, not_found, policy | commerce | store sections use no glass or blur surface; CSS transitions ≤ 180 ms (store sections) and the document sets `data-register="commerce"` so landing content sections are clamped to ≤ 250 ms by design's CSS; accent fill limited to actions, selection and badges (≤ 8 % of the viewport in the render-matrix measurement); no ornament layer |
| thanks, track | transactional | header without menu (logo + WhatsApp), no grid, no promotion before the order summary |

- `getStoreTheme(scope, register)` (design S2, frozen as a stub in the R2 contract step, request STO-R19) returns the
  compiled `BuiltTheme` of the store's active `store_themes` row for that register. Until S2 lands, the stub returns
  the theme of the store's most recently published landing page (or the archetype default) so S1 can build.
- Colour mixes created by store CSS (sold-out veil, selected card tint, header hairline) are registered with the blend
  guard `src/lib/theme/blend.ts` (owner rule 1) through a CCR to design; the render matrix runs the orange check
  (`qa/verify/orange-check.mjs` logic) on every store fixture.

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
| `storeHero` | home, page | `product-stage`, `editorial-split`, `type-led`, `bento-lead` (bento), `media-full` | `{ eyebrow?: str ≤ 40, heading: str 1-90, sub?: str ≤ 200, cta: { label: str 1-30, link: LinkRef }, cta2?: same, media: AssetRef[] ≤ 3, productId?: Ulid, tiles: { collectionId: Ulid, label?: str ≤ 30, image?: AssetRef }[] ≤ 2, align: "start" \| "center" = "start" }` | `product-stage` requires `productId` (an active product): its cutout, its name and its real "Dès" price; `bento-lead` requires 2 tiles; `media-full` uses a scrim token, never glass on text |
| `collectionTiles` | home, page | `bento` (bento), `row`, `stack`, `index-list` | `{ heading?: str ≤ 60, items: { collectionId: Ulid, label?: str ≤ 30, image?: AssetRef }[] 2-8, showCount: bool = false }` | count = real `productCount`; a tile of an archived collection is skipped |
| `productGrid` | home, page, product, collection, search, cart, not_found | `grid`, `carousel`, `editorial`, `dense` | `{ heading?: str ≤ 60, source: { kind: "collection", collectionId } \| { kind: "manual", productIds: Ulid[] 1-24 } \| { kind: "bestsellers" } \| { kind: "newest" } \| { kind: "related" }, limit: int 2-24 = 8, card: "auto" \| "minimal" \| "framed" \| "overlay" \| "editorial" = "auto", link?: { label: str ≤ 30, link: LinkRef } }` | `related` only on product (same primary collection, then shared tags, then newest; the current product excluded); `bestsellers` hidden unless STO-D22 allows; < 2 products → section not rendered; carousel: scroll-snap, no autoplay, arrow buttons on pointer devices |
| `productDetail` | product (required, first) | `split`, `stacked`, `rail`, `immersive` | `{ gallery: "swipe" \| "grid" = "swipe", zoom: bool = true, showSku: bool = false, showPerUnit: bool = true, trust: ("cod" \| "delivery" \| "inspection" \| "returns" \| "whatsapp")[] ≤ 4 = ["cod","delivery","returns","whatsapp"], stickyBar: bool = true, description: "below_buy" \| "content" = "below_buy" }` | STO-§12; each trust item renders only with its fact |
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
  home: z.object({ archetype: z.enum(HOME_ARCHETYPES).default("hero-product") }).default({}),
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
  each only when set), the seller identity line when `identity` is on ("Vendu par {legalName}, {city}", ICE and RC when
  provided; the admin shows missing facts, the page never invents them), socials from the `store` setting, the payment
  mention "Paiement à la livraison" (store mode is COD-only), the platform badge unless `remove_platform_badge` (core
  §A.4).
- **WhatsApp float**: `bubble` or `tab` (the landing `whatsappFloat` look, re-implemented as chrome), prefilled text
  "{prefill or default} · {page name}"; hidden on `checkout` and transactional kinds, and while the cart or menu sheet is
  open; 44 × 44 px minimum, inset from the safe-area edge.

---

## STO-§11 Home grammar (ST-09, ST-19)

### STO-§11.1 Model

```ts
// src/storefront/home/grammar.ts (pure)
export const HOME_ARCHETYPES = ["hero-product", "category-bento", "editorial", "catalogue-dense", /* R3 */ "drop", "routine", "gift-guide", "local-maker"] as const;
export interface CatalogShape { activeProducts: number; collections: number; bestsellers: boolean; cutouts: number; categories: ProductCategory[]; heroProductId?: string; launchAt?: string /* drop */ }
export interface HomeSlot { id: string; options: { type: string; variants: readonly string[]; bind?: "hero" | "any" }[]; required: boolean; when?: (s: CatalogShape) => boolean }
export interface HomeArchetype { id: HomeArchetypeId; release: "R2" | "R3"; fits(s: CatalogShape): boolean; slots: readonly HomeSlot[] }
export function expandHome(a: HomeArchetype, shape: CatalogShape, seed: () => number, hints?: GeneHints): StoreSectionInstance[];   // seeded alternates, then invariants
export function checkHomeDoc(doc: StorePageDoc, shape: CatalogShape): HomeIssue[];   // STO-§11.3
export function defaultArchetype(shape: CatalogShape): HomeArchetypeId;
```
The seed is `seededRandom(hash32(stores.brand_seed + ":home"), attempt)` (`src/landing/context.ts:38,65`); design's
genome G2 (composition grammar, DES-§5) may choose among the archetypes whose `fits` is true and passes `GeneHints`
for variant weights; the novelty check (DES-§7) runs on the compiled page genome before the owner sees it.

### STO-§11.2 Archetypes and slots

| Archetype | Fits | Slots in order (alternates) |
|---|---|---|
| `hero-product` (R2) | 1-3 active products, or an ad-driven store | 1 storeHero (`product-stage` \| `editorial-split`, bound to the hero product) · 2 trustStrip (`inline` \| `rail`) · 3 benefits \| showcase (bound) · 4 productGrid (`manual`, other products, `carousel` \| `grid`) when ≥ 2 products · 5 steps \| story (optional) · 6 faq (optional) · 7 whatsappCta (`banner`) |
| `category-bento` (R2) | ≥ 5 products and ≥ 3 collections | 1 storeHero (`type-led` \| `bento-lead`) · 2 collectionTiles (`bento` unless the hero used `bento-lead`, then `row`) · 3 productGrid (`bestsellers` \| `newest`, `grid`) · 4 trustStrip (`cards`) · 5 mediaText (`split` \| `overlap`) · 6 productGrid (one collection, `carousel`, optional) · 7 whatsappCta (`card`, optional) |
| `editorial` (R2) | categories ∩ {fashion, jewelry, accessories, beauty} and ≥ 4 products with photos | 1 storeHero (`editorial-split` \| `media-full`) · 2 mediaText (`full-bleed`) · 3 productGrid (`editorial`) · 4 collectionTiles (`stack` \| `index-list`) when ≥ 2 collections · 5 trustStrip (`inline`) · 6 story (optional) |
| `catalogue-dense` (R2) | ≥ 50 products | 1 storeHero (`type-led`, short, search-first) · 2 collectionTiles (`row`) · 3 productGrid (`newest`, `dense`) · 4 productGrid (`bestsellers`, `dense`) when allowed · 5 trustStrip (`rail`) · 6 whatsappCta (`card`) |
| `drop` (R3) | a real launch date set by the owner | storeHero (`media-full`) with the real countdown · product reveal (mediaText bound) · whatsappCta ("Être prévenu(e)") · trustStrip |
| `routine` (R3) | beauty / care, ≥ 3 products | storeHero · steps (bound per step) · productGrid (`manual`, the routine) · trustStrip · faq |
| `gift-guide` (R3) | ≥ 6 products, owner-typed budgets | storeHero (`type-led`) · collectionTiles (`row`, budget collections) · productGrid × 2 · trustStrip |
| `local-maker` (R3) | owner opts in | storeHero (`editorial-split`) · story · mediaText (`full-bleed`, workshop photos) · productGrid · trustStrip (modern visuals only, no craft motifs, DESIGN §1.1) |

### STO-§11.3 Invariants (`checkHomeDoc`, also run by the store checklist)

| # | Rule |
|---|---|
| H1 | The first section is a `storeHero`. |
| H2 | The first section links to a product or a collection. |
| H3 | At least one `productGrid`, or a `product-stage` hero bound to an active product. |
| H4 | At most one bento variant on the page (DESIGN v3 budget). |
| H5 | No two adjacent sections with the same `bg`. |
| H6 | At most 2 centre-aligned sections in a row. |
| H7 | A `trustStrip` within the first 3 sections whenever the store has ≥ 1 trust fact. |
| H8 | 4 to 9 sections. |
| H9 | `bestsellers` sources only when STO-D22 allows them. |
| H10 | Every bound product is active; every referenced collection is active. |

### STO-§11.4 Generation contract

- R2 without Cloud AI: `defaultTemplate("home")` = `expandHome(defaultArchetype(shape), …)` with copy from the copy
  library (design's cliché detector and the honesty guard apply, DES-§9, ai.md AI-§D). With Cloud AI on, the store
  blueprint (AI-11) supplies the archetype choice, collection drafts and copy (STO-§11.5).
- Every generated home passes `checkHomeDoc` and design's gates, else the generator re-rolls (≤ 3 attempts) and then
  falls back to the plainest valid alternate of each slot.
- Owner edits are never blocked by H2-H8; they show as checklist warnings with a one-click fix (H1, H3 and H10 are
  errors at publish).

### STO-§11.5 Applying a store blueprint (AI-11 consumer)

```ts
// src/lib/catalog/blueprint.server.ts
export interface StoreBlueprint {                      // produced by ai.md AI-11 (shape frozen by ai.md; storefront consumes)
  archetype: HomeArchetypeId;
  collections: { name: string; description?: string; productIds: string[] }[];   // owner's own products only
  home: { slots: { type: string; variant: string; data: Record<string, unknown>; bind?: string }[] };
  pages?: { title: string; slug: string; sections: { type: string; variant: string; data: Record<string, unknown> }[] }[];   // about, FAQ drafts
}
/** @write */ export function applyStoreBlueprint(ctx: StoreCtx, bp: StoreBlueprint): Promise<{ collections: string[]; homeDraftVersionId: string; pages: string[]; dropped: string[] }>;
```
Creates draft collections (ids checked with `assertOwned(scope, "product", …)`), the `@home` draft (validated by
`StorePageDoc` + `checkHomeDoc`; invalid slots are dropped and listed), draft custom pages; never publishes; one audit
row `store.storefront.blueprint_applied`.

---

## STO-§12 Product page (ST-04, R-D44)

### STO-§12.1 Anatomy on a 360 px phone (top to bottom)

The first screen (360 × 740) shows the first image, the name, the price, the COD line and the primary action (sf §4.4).

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

### STO-§12.3 Delivery line by city (R-D22, ST-17)

- Data: the zone table for the checkout (`zonesForCheckout(scope)`, landing.md, request STO-R19) embedded in
  `#sg-config` (STO-§14.4): city key → zone index, per zone `{ fee, freeFrom, etaMin, etaMax, notServed }`, plus the store
  calendar `{ tz, cutoffHour, workdays, holidays (next 60 days) }`.
- Server HTML (no JS fallback): the store range "Livraison {etaMin}-{etaMax} jours ouvrés · {minFee} à {maxFee}" built
  from `DeliverySummary`, each part only when set; nothing at all when zones are off and no fallback fee exists.
- With JS: the city chip ("Votre ville : Tanger · changer") remembers the city in `sg:<handle>:city`
  (`localStorage`); the line becomes "Livraison à Tanger : mer. 29 ou jeu. 30 oct. · 25 DH" through `etaWindow()`
  (landing.md `src/lib/delivery/eta.ts`, isomorphic, STO-D17) and `storeDeliveryFee()` (STO-§15.9); "offerte" when the
  rule says free; a `notServed` city shows "Nous ne livrons pas encore à {city}" with the WhatsApp button and the buy
  actions disabled for that city.
- The fee shown is always the fee the checkout and the server compute for that city and that subtotal.

### STO-§12.4 Gallery and media

- Images: the product's `images` (≤ 30) then each item's own photos (Offers v2 photo wells), de-duplicated by asset id;
  first image = LCP (preloaded, `fetchpriority="high"`, AVIF ≤ 120 KB at 1× mobile width, STO-§21.2); others lazy.
- Group photos and crops (`AssetRef.box`) render through `Picture` exactly as on landing pages.
- Alt text: `AssetRef.alt`, else "{product name} · photo {n}"; AI-09 fills empty alts in R2 (ai.md).

### STO-§12.5 Sticky buy bar

The landing `sticky` module contract (`src/landing/runtime/sticky.ts:1-14`): the bar appears once the buy box has
scrolled out of view, hides while the buy box or the checkout block is visible, is `aria-hidden` + `inert` when hidden.
Content: thumbnail, the selected offer's short name and live price, one button ("Commander" scrolls to `#order` in the
inline model; "Ajouter au panier" in the cart model). Height 64 px + safe-area inset; never above an open sheet; never
glass on commerce kinds (solid surface + hairline).

### STO-§12.6 Facts-only badges and lines (STO-D13)

| Shown | Only when | Source |
|---|---|---|
| "Paiement à la livraison" | always (store mode is COD-only) | — |
| Delivery range / city line | zones on or a fallback fee set; ETA only when the zone has ETA days | `delivery_zones`, `checkout.store.fallbackFeeCents` |
| "Livraison offerte" (card, offer) | the offer has `freeShipping` (card: every offer), or the store charges 0 everywhere | product doc, zones |
| "Livraison offerte dès {amount}" | a zone with `free_from_cents`; on the city line only for that city | zones |
| Struck price | `displayReference > from` (OFFERS §C.3) | product doc |
| Savings chip | `showSavings ≠ "none"` and `savings ≥ 1` | `offersMath` |
| "Vérifiez votre colis avant de payer" | `policies.inspection === true` | `policies` setting |
| "Retour sous {n} jours" | `policies.returnsDays` set | `policies` setting |
| "Un conseiller vous appelle pour confirmer" | `checkout.callPromise === true` | `checkout` setting |
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
| `pdp` | `src/storefront/runtime/entry-pdp.ts` | `product` kind | landing modules (source imports): `analytics` (once), `gallery`, `tabs`, `accordion`, `video`, `bundles`, `units`, `sticky`, `countdown`; store modules: `chrome`, `bridge`, `buy`, `cityChip` | **23,500** [proposal: fixed by a spike as OFFERS D11 did; may move once by ≤ 10 %, then frozen] |
| `store` | `entry-store.ts` | home, collection, page, search, not_found, cart, policy, track (store chrome) | `chrome` (compact header, drawer, cart badge, sort disclosure helpers), announcement rotation, `captureUtm` (source reuse of `src/landing/runtime/tracking.ts`), view beacon | 2,500 |
| `cart` | `entry-cart.ts` | `cart` kind; PDP in the `cart` model | cart storage, cart sheet, cart page lines, steppers, re-price call, buy-now handoff | 6,000 |
| `checkout` | `entry-checkout.ts` | `checkout` kind; PDP in the `inline` model | fields, phone formatting, city combobox, zones + fee + ETA dates, totals, v3 submit with retry and verdicts, lead beacon, Turnstile loader, WhatsApp alternative | 8,000 |
| `store-pixels` | `entry-store-pixels.ts` | every store kind whose pixel answer is not `none` | vendor loaders (source reuse of the landing `pixels.ts` loaders), store event map (STO-D18) | 4,200 |
| `store-thanks` | `entry-store-thanks.ts` | `/checkout/merci` | summary from `sessionStorage`, WhatsApp confirm, Purchase dispatch | 3,000 |
| `search` (R3) | `entry-search.ts` | every store kind when the store has ≤ 500 products | instant search combobox | 5,000 |
| `units-matrix`, `units-fields`, `fill-steps-box` | existing | PDP, when `runtimeFeatures` lists them | unchanged | existing budgets |
| page cap `store-page` | — | every store document | Σ inline scripts of one document (heaviest: PDP inline model with matrix, fields, steps-box and pixels) | **41,000** |

Per kind (typical, without option feature chunks): PDP inline ≈ 23.5 + 8 + 4.2 = 35.7 KB; PDP cart ≈ 33.7 KB; home or
collection ≈ 2.5 + 4.2 = 6.7 KB; cart page ≈ 12.7 KB; checkout ≈ 12.2 KB; thank-you ≈ 7.2 KB.

Rules: no store chunk imports `src/landing/runtime/entry.ts`; the generated landing chunk's sha256 is recorded and
`qa:storefront-render` fails if a store change alters it (STO-D7); any export a store entry needs from a landing runtime
module is added through a CCR that leaves the landing bundle byte-identical (an unused export is tree-shaken).

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
    cities?: { v: string; l: string; k: string /* folded search keys, fr|ar|en */; m?: 1 }[];   // MA: 147 entries
    zones: { c: Record<string, number>; z: { fee: number | null; free: number | null; eta: [number, number] | null; ns?: 1 }[]; star?: number } | null;
    calendar: { cutoffHour: number | null; workdays: number[]; holidays: string[] /* next 60 days, YYYY-MM-DD */ } | null;
    fallbackFee: number | null; callPromise: boolean; whatsapp?: string; turnstileSiteKey?: string;
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
| `sg:<h>:city` | local | chosen city key | 180 days |
| `sg:<h>:buynow` | session | one `CartLine` handed from the PDP to `/checkout` | until the order or the tab closes |
| `sg:<h>:co` | session | checkout field values kept across a stale answer or a back navigation (never in `localStorage`) | cleared on success |
| `sg:<h>:idem` | session | idempotency key + event id of the current attempt | cleared on success |
| `sg:<h>:lead:<idem>` | session | lead already sent | session |
| `sg:<h>:order` | session | thank-you record `{ orderId, name, total, currency, lines, delivery, track, wa, ts }` | session |
| `sg:<h>:px:<orderId>` | session | Purchase fired | session |
| landing module keys on the PDP | as core §C.9 (`lp:<h>:utm`, `lp-b:<productKey>`) | unchanged landing behaviour | unchanged |

Names, phones and addresses never go to `localStorage`. Every access is wrapped (`sget`/`sset` pattern,
`src/landing/runtime/core.ts:160-200`): blocked storage degrades to a working page without a remembered cart.

### STO-§14.6 Build and checks

- `scripts/build-store-assets.mjs` (S1) bundles the store entries with the same toolchain and options as
  `scripts/build-landing-assets.mjs` (IIFE, es2019, minified) into `src/storefront/generated/` (committed, like
  `src/landing/generated/`), runs in `prebuild` / `predev` after the landing build (request STO-R13), and prints the
  gzip size of each chunk.
- Budget keys `pdp`, `store`, `cart`, `checkout`, `store-pixels`, `store-thanks`, `search`, `store-page` join
  `src/landing/runtime/budgets.json` (request STO-R13); `qa:storefront-render` fails above budget + 5 % (the
  render-check rule).

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
});
```
Writes: `checkout.write` (owner, admin), audit `store.settings.updated` (key `checkout`), `catalog_version` bump. The R1
fields of `checkout` (zones on/off, market field model, `callPromise`) are landing.md's and read here as given.

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
| Under the submit | COD statement, `callPromise` line when true, WhatsApp alternative when on, privacy line | same |
| Header | minimal (logo, COD pill, WhatsApp) | the store header |
| `surface` | `cart` or `buy_now` | `pdp` |

Submit label "Confirmer ma commande"; while sending "Envoi en cours…" with `aria-busy` on the form and the button width
kept (no layout shift).

### STO-§15.5 Field model per market (R-D45)

| Market | Fields (order) | `autocomplete` | Required |
|---|---|---|---|
| MA | name · phone · city (combobox) · address (one line, "Quartier, rue, repère") · note (hidden unless the store turns it on) | `name` · `tel` · `address-level2` · `address-line1` · `off` | name, phone, city, address |
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
  the canonical `City.value`.
- "Autre ville" reveals a text input "Votre ville" (required); the delivery line then uses the `*` zone or the fallback
  fee.
- Choosing a city updates the delivery row, the ETA and the total at once (no request).

### STO-§15.8 ETA as dates (ST-17, raised to R2)

`etaWindow(zone: { etaMinDays, etaMaxDays }, now: Date, cal: { tz, cutoffHour, workdays, holidays }, locale): { from:
Date; to: Date; text: string } | null` (landing.md `src/lib/delivery/eta.ts`, isomorphic; written by S1 with this exact
signature if absent, STO-D17): start = the next working day when the store-local time is past `cutoffHour`, else today
when it is a working day; `from` / `to` = start + `etaMinDays` / `etaMaxDays` working days skipping `holidays`; text via
`Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: tz })`:
"Livraison entre mer. 29 et jeu. 30 oct." · "التوصيل بين الأربعاء 29 والخميس 30 أكتوبر" · "Delivery between Wed 29 and
Thu 30 Oct". A zone without ETA days, or a store without a calendar, shows the day range ("2 à 4 jours ouvrés") or
nothing. The lines say "estimée" in the summary ("Livraison estimée …").

### STO-§15.9 Delivery fee rule (STO-D10)

```ts
// src/lib/catalog/delivery.ts (isomorphic, pure; used by the server, the checkout chunk and the cart summary)
export type DeliveryRule = "free_offer" | "free_threshold" | "zone" | "fallback";
export interface ZoneLine { zoneId: string; name: string; feeCents: number | null; freeFromCents: number | null; etaMinDays: number | null; etaMaxDays: number | null; notServed: boolean }
export type DeliveryResult = { ok: true; cents: number; rule: DeliveryRule; zone: ZoneLine | null } | { ok: false; reason: "not_served" | "not_set" };
export function storeDeliveryFee(i: { zone: ZoneLine | null; fallbackFeeCents: number | null; subtotalCents: number; allLinesFree: boolean }): DeliveryResult;
```
1. `allLinesFree` (every line's offer has `freeShipping`) → `{ cents: 0, rule: "free_offer" }`.
2. `zone?.notServed` → `{ ok: false, reason: "not_served" }`.
3. `zone?.freeFromCents != null && subtotalCents >= zone.freeFromCents` → 0, `free_threshold`.
4. `zone?.feeCents != null` → that fee, `zone`.
5. `fallbackFeeCents != null` → that fee, `fallback`.
6. else `{ ok: false, reason: "not_set" }` (the checkout template cannot be published in this state, STO-§23.6; if it
   happens anyway, the server answers `unavailable`).

`zone` comes from `zoneLineFor(scope, cityKey)` (landing.md, frozen in core §K.2 P0) on the server and from the
config's zone table in the browser; both resolve "Autre ville" and unknown cities to the `*` zone when one exists.

### STO-§15.10 Submit flow and states

1. First interaction: `idem` (uuid v4) and `eventId` created and kept in `sg:<h>:idem`; `form_start` beacon; event
   `sg:checkout-start`.
2. Client validation with the server's rules; on submit, an error summary at the top (`role="alert"`, links to each
   field) and focus on the first error; each field error is linked with `aria-describedby`.
3. Turnstile token when `turnstileSiteKey` is set (wait ≤ 12 s, the landing value).
4. `sg:order` event, then POST v3 (timeout 15 s, one retry on a network error with the same `idem`).
5. Answers:
   - `ok` → write `sg:<h>:order`, clear the cart (`cart` surface) or `sg:<h>:buynow`, `location.assign(thanks + "?o=" +
     orderId)`.
   - `ok` with `duplicate` (same `idem` already stored) → same as `ok` (a retried request never creates a second order).
   - `stale` → apply each line verdict (new `sub`, removed lines), recompute the delivery and the total, banner "Les prix
     ont été mis à jour. Vérifiez votre total puis confirmez.", submit label "Confirmer avec le nouveau total"; the next
     submit sends the new `ls`, `rev`, `dl` and `st`.
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
  v: z.literal(3), ctx: Key, idem: z.string().regex(/^[a-f0-9-]{36}$/),
  phone: S(24), name: S(80).optional(), city: S(80).optional(),
  lines: z.array(z.unknown()).max(20).optional(),     // tolerant: each parsed with LineIn.omit({ ls }).safeParse, bad entries dropped
  utm: Utm.default({}),
});
```
Stored through `upsertLead` with `page_id` NULL (request STO-R9) and `selection = { v: 3, lines: [{ productId, bundleId,
units, n }] }`; always answers `{ ok: true }` (no oracle). An order with the same `idem` marks the lead `converted`
(landing.md's rule).

### STO-§15.12 Store thank-you (`/checkout/merci`, STO-D16)

- Server HTML: store minimal header, the landing.md LP-04 blocks (markup from `src/landing/thankyou/**`, filled by
  data attributes), an empty summary skeleton, "Voir la boutique" link; no order data in the HTML.
- `store-thanks` reads `sg:<h>:order` (its `orderId` must equal `?o=`; otherwise the page shows the generic "Merci,
  commande reçue" with the order number from the URL and no amounts), fills the lines, total and delivery, sets the
  WhatsApp confirm link from the server-formatted `wa` text (`wa.me/<store digits>?text=`), the tracking link from
  `track` (signed path, landing.md LP-05), and dispatches `sg:purchase` once (`sg:<h>:px:<orderId>`).
- No upsell in R2 (STO-D9); R3 may add the landing.md LP-10 cross-store upsell here.

### STO-§15.13 WhatsApp alternative

"Commander sur WhatsApp" (shown when `whatsappAlternative` and a store number exist): sends the v3 lead first (so the
agent sees the selection), then opens `https://wa.me/<digits>?text=` with a message composed from the cart's own lines
and totals (customer text of each line, delivery, total; the client never prices on its own), capped at 3,800
URL-encoded characters by dropping lines from the end with " … (+{n} articles)" (OFFERS §G.5 rule).

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
});
export type OrderPayloadV3 = z.infer<typeof OrderPayloadV3>;

/** `l.<i>` line-level codes; nested keys reuse the v2 unit keys under the line prefix. */
export type LineFieldKey = `l.${number}` | `l.${number}.n` | `l.${number}.bundleId` | `l.${number}.u.${string}` | `l.${number}.s.${string}` | `l.${number}.x.${string}`;
export type OrderFieldErrorsV3 = Partial<Record<"name" | "phone" | "city" | "address" | "postal" | "email" | "coupon", string>> & { [k: LineFieldKey]: string | undefined };
export function parseOrderPayloadV3(raw: unknown): { ok: true; data: OrderPayloadV3 } | { ok: false; fields: OrderFieldErrorsV3 };

export interface LineVerdict { i: number; state: "ok" | "changed" | "unavailable" | "removed"; sub?: number; rev?: string; label?: string; text?: string }
export type OrderResponseV3 =
  | { ok: true; orderId: string; total: number /* money, as stored */; currency: string; delivery: number /* cents */; lines: { i: number; sub: number }[]; track?: string; wa?: string; duplicate?: true }
  | { ok: false; error: "invalid" | "stale" | "not_served" | "rate_limited" | "blocked" | "unavailable" | "server"; fields?: OrderFieldErrorsV3; lines?: LineVerdict[]; delivery?: number };
```
Field error values: `required`, `invalid`, `unavailable`, `too_long`, `duplicate` (v2 vocabulary) and, for `l.<i>`,
`changed` / `removed`. Unknown keys in the body are stripped (forward compatibility, like v2).

### STO-§16.2 The order endpoint, step by step (`src/app/api/public/store/order/route.ts` → `src/lib/catalog/order-v3.server.ts`)

| # | Step | Failure answer |
|---|---|---|
| 1 | POST only; body ≤ 48 KB; JSON; `parseOrderPayloadV3` | 400 `invalid` with fields |
| 2 | `burstLimit` + `p:api:order:<ipHash>` (core §E.8) | 429 `rate_limited` |
| 3 | Resolve every `pk` with `resolveProductKey` and `ctx` with the page-key resolver (request STO-R1); all must belong to one store | 400 `invalid` (generic, nothing written) |
| 4 | Store state (`take_orders`), mode (`storefront` for `pdp`, `cart` for `cart`/`buy_now`), entitlement | 409 `unavailable` |
| 5 | `checkOrigin(storeHosts(store))`, `Sec-Fetch-Site: cross-site` refused (core §C.9) | 403 `blocked` |
| 6 | `s:<sid>:order:ip:<ipHash>`, `s:<sid>:orders` flood breaker | 429 `rate_limited` |
| 7 | Honeypot (`website` non-empty → decoy success like v2 `decoyResponse`, nothing stored); `t` < 1,500 ms → risk flag | — |
| 8 | Turnstile when the storefront embeds a site key (decided from settings, not from stored HTML; the landing check `versionEmbedsSiteKey` does not apply) | 400 `invalid` field `cf` |
| 9 | Idempotency: an order of this store with this `idem` exists → `ok` with its id and `duplicate: true` | — |
| 10 | Delivery fields per market (STO-§15.5) | 400 `invalid` with fields |
| 11 | Per line (STO-§16.3) | collected verdicts |
| 12 | Any verdict ≠ `ok` → 409 `stale` with every verdict and the current delivery; fresh-line field errors → 400 `invalid` | as stated |
| 13 | `subtotal = Σ lineCents`; R3 coupon (STO-§19.1); `storeDeliveryFee` with `zoneLineFor(scope, cityKey)` | `not_served` → 400 with `city`; `not_set` → 409 `unavailable` |
| 14 | `total = subtotal − discount + delivery`; `st ≠ total`: when `cv ≠ store.catalogVersion` or `dl ≠ delivery` → 409 `stale` (all lines `ok`, the new delivery); else log `[orders] v3 parity mismatch` and the server total wins | — |
| 15 | R3: stock holds (STO-§5.6); a failed hold → 409 `stale` with that line `unavailable` | as stated |
| 16 | Blocklist, per-phone limit, risk score (`src/lib/orders/risk.ts`, store-scoped), then `createOrderRow(draft, ctx)` (request STO-R12): the order row, `order_events` "created", order hooks (Sheets, CAPI per IN-02, Telegram) through the outbox drained in `after()` | blocked → 403 `blocked` |
| 17 | `bumpOrderStats` for each line's product id and for the `ctx` page (request STO-R11) | — |
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
6. `fallback = line.rev !== product.rev`; `fallback && (errors || lineCents ≠ ls)` → `changed` (with the new `sub`, `rev`,
   label and text) or `unavailable`; `!fallback && lineCents ≠ ls` → parity log, server wins, state `ok`.
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

---

## STO-§17 "Both" mode: product ↔ landing attachment (LP-07, LP-08)

### STO-§17.1 Model

- `pages.product_id` (core §D.2) on a `landing` row = attached. One product may have **≤ 10** attached landing pages
  (the 11th attach answers "Un produit peut avoir 10 pages de vente au plus.").
- `pages.attach_opts longtext NULL` (request STO-R6): `{ indexable: boolean = false, keepNames: boolean = true,
  keepPhotos: boolean = true }`.
- `page_versions.product_rev char(26) NULL` (request STO-R6): the `products.rev` a published version (or its last
  re-render) was rendered with.

### STO-§17.2 The mirror

```ts
// src/lib/catalog/attach.ts (isomorphic, pure)
export interface MirrorReport { appended: string[]; dropped: string[]; offersOff: string[] }   // item ids, item ids, offer ids
export function attachMirror(landing: PageDoc, product: ProductDocJson, stock: { levels: readonly InventoryLevelRow[]; config: StockConfig }, opts: AttachOpts): { doc: PageDoc; report: MirrorReport };
```
- For every product item: the landing item with the same id takes the product's `price`, `compareAt`, `groups`,
  `soldOut` (after `applyStock`) and `sku`; `name`, `short`, `images`, `cutout` stay the landing's when `keepNames` /
  `keepPhotos`, else the product's. Product items absent from the landing are appended (usable by new offers).
- Landing items unknown to the product are dropped; every landing offer with a line on a dropped item is left out of
  the rendered doc and refused at order time (`bundleId: unavailable`); the builder shows the error "Cette offre utilise
  un article qui n'est plus dans le produit".
- The landing's own offers, display, extras, bump, upsell, form, theme, sections, SEO and its flat `shippingFee` stay as
  they are (the landing runtime and PHP export are frozen, R-D22).
- The result passes `PageDocObject`; when no offer remains, the order form renders its unavailable state with the
  WhatsApp alternative.

### STO-§17.3 Where the mirror applies

| Moment | What happens |
|---|---|
| Attach (builder "Relier à un produit du catalogue", or the product editor's "Pages de vente" tab) | item mapping dialog: landing items paired with product items (same id, else suggestions by SKU then by name); the draft is rewritten with the product item ids (offers follow the new ids); `pages.product_id` set; audit `store.landing.attached` |
| Builder open / save | the draft is re-mirrored; price, compare-at, options and stock fields of the items are read-only with the banner "Prix, options et stock viennent du produit {name} · Modifier le produit" (request STO-R18 for the landing editor) |
| Publish | the published version doc = the mirrored draft; `product_rev` = `products.rev` |
| Product `rev` change | `enqueueRenders(scope, attachedLivePageIds, "product", 2)` (core §H.3); in `after()` the first 5 are rendered at once through the same code path (their job rows then finish `skipped`) |
| Re-render (render job) | renders `attachMirror(versionDoc, liveProduct)`; rewrites `html`, `csp`, `etag` **and** `product_rev` of the published version row (core D50 extended, request STO-R6); the version doc never changes |
| Serve | when `page_versions.product_rev ≠ products.rev` (product rev read from `scopedCache("product-rev")`, 15 s), the route renders now (single flight), writes back with compare-and-set, and serves the fresh HTML |
| Order (payload v2) | `attachedDocFor(target)` overlays the live product items and stock on the version doc, and the comparison runs in **fallback** mode: any `st ≠ total` or a selection error answers `stale` (request STO-R12) |

Bound on staleness: a shopper may hold old HTML for at most the edge TTL (60 s) plus the time the tab stays open; the
order is then refused with `stale` and the reload shows the new price (the landing runtime's stale flow,
`src/landing/runtime/form.ts:309-322`). A shopper is never charged a price they did not see.

### STO-§17.4 Detach

"Détacher du produit": the last mirrored items become the landing's own copy, `product_id` and `attach_opts` are cleared,
the page keeps its offers; a re-publish is needed for the published version to drop the overlay (until then orders
still use the overlay of the version's `product_rev`: the detach dialog offers "Détacher et publier").

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

### STO-§19.6 Home archetypes 5-8 (ST-19)

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
| `onlineStoreJsonLd` | home | `@type: "OnlineStore"` (a schema.org `Organization` subtype): `name`, `url`, `logo` (absolute, ≥ 112 px), `contactPoint` (telephone when set, `contactType: "customer service"`, `availableLanguage`), `sameAs` (socials), `hasMerchantReturnPolicy` only when `policies.returnsDays` exists (`MerchantReturnPolicy`, `applicableCountry` = market country, `returnPolicyCategory: MerchantReturnFiniteReturnWindow`, `merchantReturnDays`) |
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
| Lab "cheap Android on 3G" (Playwright msedge, 360 × 740, DPR 2, CPU 4× slower, 1.6 Mbps down / 750 kbps up / 150 ms RTT **[proposal]**) | PDP and home LCP ≤ 3.0 s, TBT ≤ 200 ms, CLS ≤ 0.05; checkout keypress-to-paint ≤ 50 ms p95 | `qa:storefront-perf` on fixtures (STO-§26.3) |
| Server | cache hit ≤ 5 ms p95; miss ≤ 120 ms p95; 304 without a DB query; ≤ 4 queries per miss | `qa:storefront-perf` server timings + R2 load test (core §K.4) |

### STO-§21.2 Byte budgets (gzip)

| Item | Budget |
|---|---|
| Document (HTML + inline CSS + inline JS + configs): home, collection, page | ≤ 60 KB |
| Document: PDP | ≤ 90 KB (≈ 36 KB of it is JavaScript, STO-§14.1) |
| Document: cart, checkout | ≤ 45 KB |
| Hard cap, every store document | 160 KB (STO-§7.3) |
| LCP image | ≤ 120 KB AVIF at 1× mobile width (WebP fallback), preloaded with `imagesrcset`, `fetchpriority="high"` |
| Fonts | ≤ 2 preloaded files; the Arabic subset only on `ar` documents; `font-display: swap` with metric overrides (`src/lib/theme/fonts.ts`) |
| Third parties | pixels (after the `load` event and idle, ≤ 2 s) and Turnstile (only after the first checkout interaction); nothing else (core §C.9: no tenant JS) |

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
- Manual pass at R2 exit: TalkBack (Android Chrome) and VoiceOver (iOS Safari) through PDP → checkout → thank-you,
  recorded in the R2 checklist.

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
  cards) · **Collections** (multi-select, primary collection) · **Pages de vente** (attached landings with status;
  "Créer une page de vente"; "Relier une page existante"; "Détacher") · R3: **Guide des tailles**, **Traductions**.
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

Cards, in order: **Adresse de la boutique** (live URL, copy, QR and WhatsApp share from UX-05) · **Pages de la boutique**
(Accueil, Page produit, Collection, Recherche, Panier, Paiement, Page introuvable, then the custom pages; each with "En
ligne" / "Modifications non publiées" / "Brouillon", Modifier, Aperçu) · **Mode d'achat** (inline or cart, with the
recommendation from STO-D8 explained in one line) · **Livraison** (zones summary or the fallback fee, link to the
delivery settings; an error card when neither exists) · **Pixels de la boutique** (the library picker, Offers D6 rule) ·
**En-tête et menus** · **Pied de page et annonce** · **Générer le design de ma boutique** (AI-11 blueprint applied as
drafts, STO-§11.5) · the checklist ring (STO-§23.6), which feeds the store health score (rf SF-03, platform.md).

### STO-§23.6 Store page editor and checklist

- The editor composes the builder shell's parts (section list, preview iframe, inspector) in
  `src/components/admin/storefront/page-editor/**` with its own state store `src/lib/editor/store-page.ts` (the landing
  editor store is untouched, LND-30): kind-aware tabs (Sections; SEO for home and custom pages), the "Ajouter une section"
  library filtered by `KIND_RULES` and `ELIGIBILITY`, variant picker, `bg` / spacing / divider, the data inspector
  (`FieldSpec`), a product binder for landing sections on home and custom pages, drag and keyboard reorder (Alt + ↑ ↓),
  undo/redo, versions, and the publish dialog.
- `storePageChecklist(doc, ctx)` (`src/lib/editor/store-page.ts`, pure over preloaded data):

| Level | Item |
|---|---|
| error | a required section is missing (KIND_RULES) |
| error | `checkout` template while `storeDeliveryFee` would answer `not_set` for some city (no zone covers it and no fallback fee) |
| error | home H1, H3, H10 (STO-§11.3) |
| error | a bound product or a hand-picked grid whose every product is inactive |
| error | design hard gates on the doc (DES-§8, dependency STO-§29.2) |
| error | the template rendered with the store's heaviest product exceeds the 160 KB document cap |
| error | the storefront has no pixel answer ("Choisissez les pixels de la boutique ou « Aucun pixel »") |
| warning | home H2, H4-H8; dead menu links; images without alt; missing SEO description; sold-out products in a hand-picked grid; an empty collection in a tile section; missing returns or contact facts; an announcement claim ("Livraison offerte") the delivery data does not support |

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
  sandboxed (core §I.2).

---

## STO-§26 Tests

### STO-§26.1 Offline (`npm test`)

| Script | File | Checks |
|---|---|---|
| `test:catalog` | `src/lib/catalog/selftest.ts` (+ `facts.selftest.ts`, `delivery.selftest.ts`, `eta.selftest.ts` when S1 writes the engine) | `checkProductDoc` round-trips every Offers v2 fixture (`src/lib/page/fixtures.ts`); store rules strip rating, bump, upsell, `stockLeft`; `productAsPageDoc` valid for every fixture; `applyStock` on item, matrix and choice axes; stock-key hashing above 64 chars; `deriveProduct` ranges; `storeDeliveryFee` every branch; `etaWindow` cut-off, weekend, holiday, ar and fr text; `parseOrderPayloadV3` error keys; `priceLine` parity: for every fixture offer and selection, `n × orderTotals().subtotal` equals the runtime money module's value; `orderTextV3` examples and the 1,000-character cap; `contentsOfV3`; `attachMirror` (appended, dropped, offers off); `foldText` / `tokens` / `arabiziToLatin`; search ranking fixtures; JSON-LD builders (no `priceValidUntil`, no `aggregateRating` in R2, `variesBy` mapping, `ItemList`); canonical rules table; `storeDocIssues` per kind; `checkHomeDoc` over 4 archetypes × 3 shapes × 50 seeds; the facts table (each fact absent → its line absent) |
| `test:store-runtime` | `src/storefront/runtime/selftest.ts` | cart store (merge, caps, expiry, cross-tab), storage keys per handle, phone formatting and digit folding, city combobox matching, v3 payload builder ↔ parser round trip, bridge contract on the runtime's fixture DOM (the approach of `src/landing/runtime/selftest*.ts`) |
| `qa:storefront-render` | `scripts/qa/storefront-render-check.ts` | every kind fixture rendered in P and S bases, ar and fr: chunk budgets and the page cap (budget + 5 %); the landing chunk's sha256 unchanged; no `/admin` link; absolute canonical, og and JSON-LD URLs; CSP hashes match the inline scripts; orange check on the inlined CSS; commerce register (no glass token, no transition > 250 ms); every image with width/height or aspect ratio; no `unload` in store chunks |

### STO-§26.2 Database (`test:storefront-db`, `scripts/qa/storefront-db-check.ts`, throwaway `cod_test_*` databases, core §J.2 guard)

Product create/save/status with the quota and the conflict path · slug change → 308 and `catalog_redirects` · collection
membership and counts · every write of STO-§7.5 bumps `catalog_version` · the `shipped` hook replayed twice decrements
once · a crossing changes `rev` · v3 orders: 2 lines × `n` happy path, price change → `stale` → confirm → success,
option sold out → `unavailable`, archived product → `removed`, `not_served` city, fallback fee, free threshold, free
offer, duplicate `idem` → same order id, honeypot decoy, two stores' keys → `invalid` with no row written, restricted
store → `unavailable`, landing-mode store → `unavailable` · v3 lead stored with `page_id` NULL · attached landing:
mirror at publish, product change → re-render writes `product_rev`, an order from old HTML → `stale` · tenancy: a member
of store B cannot list, read, save or delete A's products, collections, inventory or templates through any action
(identical not-found answers, A's rows byte-identical); B's product key inside A's checkout refused; A's product slug
under B's handle → 404; render-cache keys distinct for one slug in two stores · R3: two parallel orders for the last
counted unit (one `unavailable`), 20 parallel redemptions of a 10-use coupon (exactly 10 succeed), a review token used
twice (second refused).

### STO-§26.3 Browser and live

| Script | Checks |
|---|---|
| `qa:storefront-e2e` (Playwright msedge, production build on port 3451+, core §J.3) | cart model: home → collection → PDP → add → cart → checkout → thank-you; inline model: PDP → order; buy now; price changed in the admin mid-checkout → stale → confirm; city combobox with "طنجة", "tanja", "Tanger"; ar RTL screenshots at 360 px for every kind; keyboard-only path; pixels fired in order (ViewContent, AddToCart, InitiateCheckout, Lead, Purchase) against a stub |
| `qa:storefront-perf` | the throttled profile of STO-§21.1 per kind fixture; server timings for hit, miss and 304 |
| `qa:storefront-a11y` | STO-§22.3 |
| Live (after the R2 deploy, core §H.10) | a `both` test store: product, collection, attached landing, one cart order and one inline order, the Sheets row, thank-you, tracking link; Rich Results Test on 3 URLs; a WhatsApp link preview |

---

## STO-§27 File ownership and build order (core §K.4, §K.5)

### STO-§27.1 R2 contract step (maintainer)

Writes from this spec: the §STO-3 tables and columns into `src/lib/db/schema.ts` and `drizzle/0006_r2.sql`;
`src/lib/orders/contract-v3.ts` (STO-§16.1, §16.4, §15.11); `src/storefront/types.ts`, `src/storefront/schema.ts`
and `src/storefront/kinds.ts` as frozen contracts; the budget keys; the package scripts; the resolver additions; the
typed stubs of request STO-R19; the settings keys `storefront` and `checkout.store` with their first schemas.

### STO-§27.2 Track S1 STOREFRONT (R2) owns

| Area | Paths |
|---|---|
| Catalog logic | `src/lib/catalog/**` |
| Store rendering and serving | `src/lib/storefront/**`, `src/storefront/**` (except the three frozen contract files above, maintainer) |
| Store routes | `src/app/s/[store]/{p,products,c,collections,cart,checkout,search}/**`, `src/app/s/[store]/[slug]/[...rest]/route.ts`; the store branches of `src/app/s/[store]/route.ts`, `[slug]/route.ts`, `policies/**` and the chrome wrapper of `track/**` (request STO-R18) |
| Public store APIs | `src/app/api/public/store/{order,lead,cart,event}/**` |
| Admin | `src/app/app/[store]/{catalog,storefront}/**`, `src/components/admin/{catalog,storefront}/**`, `src/lib/editor/store-page.ts` |
| Extension files | `src/lib/orders/hooks/storefront.ts`, `src/lib/jobs/tracks/storefront.ts` (jobs `catalog.bestsellers` nightly 03:40, `catalog.stock_reconcile` nightly), `src/components/admin/shell/nav/storefront.ts`, `src/lib/i18n/admin/{en,fr,ar}/storefront.ts`, `src/lib/settings/keys/{storefront,checkout-store}.ts` |
| Build and QA | `scripts/build-store-assets.mjs`, `scripts/qa/storefront-{render-check,db-check,e2e,perf,a11y}.ts` |

Read-only for S1 (changes through CCRs, core §K.3): `src/landing/**` (runtime modules, sections, document), `src/lib/page/**`,
`src/lib/orders/{contract,validate,create,resolve,text}.ts`, `src/lib/render/**`, `src/lib/delivery/**` (landing.md; S1
writes `eta.ts` only if absent, STO-D17), `src/lib/theme/**` (design). Expected CCRs: exports from landing runtime
modules and `orderForm` internals with no landing byte change; `orderText` dispatch (STO-R8); `createOrderRow`,
`attachedDocFor`, attached content ids (STO-R12); read-only mirrored item fields in the landing editor (STO-R18); blend
registrations for store colour mixes (design).

### STO-§27.3 Track D3 GROWTH (R3) owns the R3 additions

`src/lib/catalog/{coupons,reviews,holds,facets}.server.ts`, `src/storefront/runtime/entry-search.ts`,
`src/storefront/sections/reviewsVerified/**`, `src/landing/sections/reviewsVerified/**` (new landing section, R3 file map),
`src/app/s/[store]/reviews/**`, `src/app/api/public/store/{review,review-media,search-index}/**`,
`src/app/app/[store]/{reviews,catalog/coupons}/**`, `src/lib/settings/keys/reviews.ts`, and edits to S1's files for
ST-11 … ST-20 (S1 is finished by then).

### STO-§27.4 Order inside R2

Contract step → S1, S2 (design: `getStoreTheme`, store themes), S3/S4 (operations: hooks, Sheets v3 mapping, drawer
lines) and S7 (ai: AI-09, AI-10, AI-11) in parallel; S1 merges before S7's blueprint UI (it calls
`applyStoreBlueprint`). R2 exit (core §K.4): a `both` store with catalog, cart and attached landings live, the gate green,
the load test of on-request store pages through the edge cache.

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
| Document gzip cap | 160 KB | render (STO-§7.3) |
| Chunk budgets | STO-§14.1 | `budgets.json` |
| Coupons (R3): percent range | 1 %-90 % | coupon schema |
| Review (R3): text · photos · token lifetime | 2,000 chars · 4 · 60 days | review endpoint |

---

## STO-§29 Requests to the core and dependencies

### STO-§29.1 Requests to the core (exact changes; the core integrates them in revision 2)

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
| design.md | `getStoreTheme(scope, register)` and register CSS (`[data-register="commerce"]` motion clamp, no glass); static gates that accept a `StorePageDoc`; blend registrations for store colour mixes; the home page genome novelty check; the Brand Genome fan-out bumping `catalog_version` |
| landing.md | `delivery_zones`, `zoneLineFor`, `zonesForCheckout`, `etaWindow`, the `checkout` R1 fields (field model, `callPromise`), LP-04 thank-you blocks reusable inside the store document, LP-05 tracking and its signed links, the LP-06 leads inbox showing v3 selections, read-only mirrored items in the landing editor |
| operations.md | Sheets mapping and drawer display of v3 orders, the returns "restock" action, the WhatsApp channel for review requests, server ad events built with `contentsOfV3`, accounting attribution of attached-landing orders to products |
| ai.md | AI-09 (SEO and alt), AI-10 (translations), AI-11 (`StoreBlueprint` shape), the honesty guard on generated store copy |
| platform.md | the console store profile "Catalog & pages" tab (read through `platformScope`), the health ring fed by the store checklist |

---

## STO-§30 Review decisions

(Empty in revision 1. Filled after the reviews: each row = reviewer, point, decision, section changed.)
