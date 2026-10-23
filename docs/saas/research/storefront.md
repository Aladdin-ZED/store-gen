# Research: storefront and landing-page product (customer-facing)

Input for the architect of `docs/STORE-SAAS.md`. Area: everything a shopper sees and touches: store home,
collections, search, product page (PDP), cart, COD checkout, thank-you, order tracking, reviews, policies, landing
pages, and how a store and its landing pages share one catalog, brand and order book.

Written 2026-10-23. Method: read `docs/STORE-GEN-BRIEF.md`, `docs/HANDOFF.md` §2/§4, `docs/saas/TENANCY-MAP.md`
(§5.5-5.7, §8, §9), `docs/DESIGN.md`, and the landing code in `src/landing/**`, `src/lib/markets/**`,
`src/lib/editor/checklist.ts`, `src/lib/generator/plan.ts`; then web research (sources in §12).

Legend: **P0** = needed at SaaS launch, **P1** = next release, **P2** = later. Effort **S** (≤ 2 days), **M** (≤ 1-2
weeks), **L** (multi-week, touches several subsystems). `[unverified]` = could not confirm with a primary source;
`[proposal]` = a number or rule chosen here, not measured.

---

## 1. Headline conclusions

1. **COD is the product, not a payment option.** Morocco's regulator survey reports cash on delivery as the
   preferred online payment method for about 84% of buyers (a multi-answer preference figure, §12 [S1][S2]). Every
   store page must be designed around the three COD failure points: *the shopper does not trust the seller*, *the
   form is too long*, *the order is refused at the door*. The third is where the money is lost: vendor sources put
   Moroccan COD return/refusal rates at 20-40% of dispatched orders [S3] `[unverified, vendor data]`. So the
   storefront's job does not end at "order placed": the thank-you, confirmation, tracking and review flows are part
   of the storefront.
2. **Reuse the landing renderer; do not build a second front end.** The landing pipeline (static HTML, hash CSP,
   per-variant CSS chunks, a 24.2 KB gz runtime, `src/landing/runtime/budgets.json:3`) is already a strong store
   front end. Store pages = new page kinds + new sections + new *separate* runtime chunks (cart, checkout, search,
   collection). Nothing may join the landing chunk (TENANCY-MAP LND-16).
3. **Default store checkout = 4 fields** (name, phone, city, short address) for Morocco, market-driven for Europe.
   Baymard finds the average checkout has 11.3 fields and that most sites need about 8 [S4]; a Moroccan COD order
   needs fewer. Field count matters more than step count [S4].
4. **City-aware delivery promise is the biggest missing trust lever.** Today the MA city list exists (147 rows,
   `src/lib/markets/cities-ma.ts:176`) but has no fees or ETAs (TENANCY-MAP §9.2). Showing "Livraison à Tanger :
   24-48 h · 25 DH" as soon as the city is chosen, on the PDP and in the form, follows Baymard's "delivery date, not
   shipping speed" finding (41% of benchmarked sites fail it) [S5]. P0, M.
5. **Reviews only from real, delivered orders.** Today reviews are merchant-typed with a `sample` flag, and publishing
   with samples is only a *warning* (`src/lib/editor/checklist.ts:142-152`). For a multi-tenant platform this is a
   legal and trust liability (EU Omnibus: claiming reviews are from real buyers without reasonable verification
   steps is banned, Annex I 23b [S6]). Recommendation: platform-owned review collection after delivery (signed
   WhatsApp/SMS link per delivered order), "verified buyer" badge, automatic disclosure text, and **sample review
   content can never be published** on a SaaS store (error, not warning). P0 for the block, P1 for collection.
6. **Render strategy for catalog pages: on-request render with a store catalog version in the cache key**, not
   publish-time static files. Grids, PDPs and search all embed prices; a store-wide `catalog_version` counter (bumped
   on any product/price/theme change) makes ETag + LRU invalidation trivial on one Node process, with no render
   queue. Landing pages keep publish-time static HTML (today's pipeline); a landing page attached to a product is
   re-rendered when that product's price/options change (small dependency index). See §10 decision D2.
7. **"Both" mode has one source of truth: the catalog product.** A landing page that references `product_id` borrows
   price, items, options and stock from it; it may add campaign-only offers built from those items, never new
   prices from thin air. Orders carry `source` (pdp / cart / landing:<pageId> / whatsapp) + UTM so the owner sees
   which surface sells (§8).
8. **Anti-"AI vibe" for stores = composition grammar + seeded variety + a platform uniqueness guard.** Today
   generation picks from 3 storylines (`src/lib/generator/plan.ts:89-97`) and 91 section variants. Stores need a
   home-composition grammar (≥ 8 home archetypes), store-level seeds, and a fingerprint check that rejects a
   generated layout too close to another store on the platform (§9). P1, M.
9. **Performance is a conversion feature on Moroccan phones.** Android is roughly 68-78% of mobile OS usage in
   Morocco (StatCounter 2026 monthly snapshots [S7]). Mobile networks improved a lot (Ookla average 124 Mbps in
   2025, after the 5G launch [S8]) but averages hide rural 3G and cheap CPUs: the binding constraint is now CPU and
   main-thread time (INP), not only bytes. Keep Core Web Vitals "good" at p75: LCP ≤ 2.5 s, INP ≤ 200 ms,
   CLS ≤ 0.1 [S9].
10. **Europe adds law to the storefront:** EU 30-day lowest-price rule for any announced discount [S10], review
    verification disclosure [S6], European Accessibility Act for e-commerce since 28 June 2025 (EN 301 549 /
    WCAG 2.1 AA; microenterprise exemption is contested) [S11], and consent before ad pixels (Google Consent Mode v2
    for EEA since March 2024) [S12]. Morocco: law 31-08 gives a 7-day withdrawal right for distance sales (30 days
    without written confirmation) and requires seller identity and total price up front [S13]. These are P0 for the
    market where they apply.

---

## 2. Context that shapes every decision

| Fact | Evidence | Consequence for the storefront |
|---|---|---|
| COD dominates Moroccan e-commerce: ~84% of online buyers prefer it (multi-answer); 24.9% of Moroccans bought online in 2024 (15.1% in 2019) | ANRT ICT survey 2024-2025 via North Africa Post / Hespress [S1][S2]. The 84.1% figure is quoted secondhand; the original ANRT PDF was not opened `[unverified exact %]` | No card step at launch; COD copy and badges everywhere; the order is a *promise to accept a parcel* |
| 20-40% of COD parcels are not delivered/refused (vendor estimates) | eGrow, YouCan blogs [S3] `[unverified]` | Storefront must reduce refusals: real delivery promise, confirm-on-WhatsApp, honest pictures, tracking link, risk scoring (exists) |
| Android 68-78% of Moroccan mobile traffic | StatCounter [S7] | Test on low/mid Android Chrome; Chrome-only APIs (Speculation Rules, install prompt) reach most shoppers |
| Mobile speed improved sharply (avg 124 Mbps, rank 39 in 2025) | Hespress / MWN on Ookla [S8] (averages, not medians) | Bytes still matter for rural and data-capped users, but JS execution time matters more |
| CWV "good" = LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75 | web.dev [S9] | Performance budgets in §6.4 |
| Average checkout: 11.3 fields, 5.1 steps; ~8 fields enough | Baymard 2024 [S4] | 4-field COD form (MA), 6-8 for EU |
| Delivery date beats shipping speed; 41% of sites miss it | Baymard [S5] | Delivery ETA by city on PDP + form |
| Reviews: products with 5 reviews ~270% more likely to sell than with none; near-perfect ratings trusted less | Spiegel Research Center via secondary write-ups [S14] `[secondhand]` | Getting the *first 5 real reviews* per product is worth a dedicated flow |
| EU: discount must show the lowest price of the prior ≥ 30 days | Directive 2019/2161 summaries [S10] | Price history per product; EU stores show "lowest 30-day price" next to compareAt |
| EU: fake-review claims banned; disclosure of how reviews are verified | Annex I 23b; German UWG §5b(3) example [S6] | Verified-review system + auto disclosure line |
| EAA applies to e-commerce from 28 Jun 2025 | Law-firm briefings [S11] | WCAG 2.1 AA is a hard requirement for EU stores |
| Morocco law 31-08: 7-day withdrawal (30 if no written confirmation), refund ≤ 15 days, seller identity and total price shown | Consonews, La Vie Éco, CMS [S13] | Policy hub generated from store facts (exists for MA/EU/INTL: `src/landing/legal/content.ts`), "your rights" line near the buy button |
| Google merchant listings: `shippingDetails`, `hasMerchantReturnPolicy`, `priceValidUntil` recommended; a past `priceValidUntil` can hide the listing; global shipping/return policy belongs under `Organization` | Google Search Central [S15] | Organization-level JSON-LD per store; never emit a stale `priceValidUntil` |
| Variants: `ProductGroup` + `hasVariant` + `variesBy`; markup does not need to change when the shopper picks a variant | Google Search Central [S16] | PDP JSON-LD from the options matrix |

---

## 3. What exists today (grounding)

The full landing inventory is TENANCY-MAP §8.3 (27 section types, 91 variants, Offers v2, options, pixels, builder,
generator, exports). The storefront-relevant pieces, verified in code:

- **Document shell:** `src/landing/document.tsx` renders landing / thank-you / legal documents with one inlined
  `<style>`, `#lp-config`, JSON-LD Product with Offer/AggregateOffer (`document.tsx:257-290`), brand omitted for a
  placeholder store name (`:287`), `aggregateRating` only when the doc has a real rating (`:290`). No `hreflang`
  (grep: none). Kinds are landing/thanks/legal only (LND-10).
- **Images:** `<picture>` with AVIF + WebP srcsets, intrinsic sizes, `fetchpriority=high` for the LCP image,
  lazy elsewhere (`src/landing/primitives/Picture.tsx:36,76,130-140`). Fonts use `font-display:swap` with metric
  overrides (`src/lib/theme/fonts.ts:6,142`). Strong base for store pages.
- **Order form:** fields name/phone/city/address/email/note with contract maxima (`src/landing/runtime/fields.ts:13-17`);
  4 variants; WhatsApp alternative (`sections/orderForm/index.tsx:194`); idempotency, one retry, stale-version flow
  (`runtime/form.ts:1-20`).
- **Phone:** server truth via libphonenumber-js "max"; accepts Eastern-Arabic/Persian digits, `00212`, `+212 0…`,
  bidi marks; Morocco limited to mobile + fixed (no VoIP/premium) (`src/lib/markets/phone.ts:10-53`). Excellent;
  reuse as is.
- **Cities:** 147 Moroccan cities with fr/ar/en labels, ~30 majors first, "Autre ville" last
  (`src/lib/markets/cities-ma.ts:10,166,176`; `info.ts:87-100`). No fee, ETA or zone data.
- **Markets:** MA, FR, BE, ES, DE, IT, NL, PT, INTL with currency and locale order (`src/lib/markets/specs.ts:28-112`).
  UI strings complete for ar/fr/en (`src/landing/i18n.ts:335`).
- **Abandoned leads:** once the phone is valid, after ~1.2 s idle or on page hide, one keepalive POST per
  idempotency key with the selection so far (`src/landing/runtime/lead.ts:1-40`). Recovery tooling on top is missing.
- **Sticky buy bar:** appears only after the hero CTA has scrolled past, hides while a CTA or the form is visible,
  `aria-hidden` + `inert` when hidden (`src/landing/runtime/sticky.ts:1-14`). Reuse for the PDP.
- **Urgency:** countdown from the admin's real end date ("never resets") and admin-typed stock
  (`sections/urgency/index.tsx:3-4,108,117`). Correct honesty model; for stores, stock should come from inventory.
- **Thank-you:** fills the order from sessionStorage, Purchase pixel once per order, one-click upsell with a real
  window anchored to the order time (`src/landing/runtime/thankyou.ts:1-12`).
- **WhatsApp:** a static-export bridge formats the order with the runtime's own totals and opens wa.me
  (`runtime/entry-whatsapp.ts:1-15`); `whatsappFloat` section (bubble, tab).
- **Reviews:** 4 variants (wall, carousel, summary, notes); defaults are product-aware *samples* flagged
  `sample: true` (`sections/reviews/index.tsx:9,117-119`); the publish checklist only warns
  (`src/lib/editor/checklist.ts:142-152`).
- **Generation variety:** 3 storylines (`src/lib/generator/plan.ts:89-97`) × archetype preferences × variant
  reservations. Enough for landings today; not enough for many stores on one platform (§9).
- **Legal:** themed privacy/terms/shipping/contact pages with MA/EU/INTL content and visible gaps instead of
  invented ids (TENANCY-MAP §8.1 Legal module).

Missing for stores (from TENANCY-MAP §9.1, confirmed): page kinds home/collection/product/cart/checkout/search/404,
navHeader, productGrid/productCard, collection filter/sort, cart, payload v3, per-store sitemap/robots, store
JSON-LD types, hreflang, size guide (grep: no component), delivery zones, tracking page, review collection.

---

## 4. Store pages: anatomy and brainstorm

Every item: what, why it matters for a COD seller, priority, effort.

### 4.1 Global store chrome

| Feature | Detail | Why (COD) | P | E |
|---|---|---|---|---|
| `navHeader` section (bar, centered, drawer; mega later) | Logo from brand kit, ≤ 6 menu items, search icon, cart badge, language switch; RTL mirrored; sticky with a compact state on scroll; never covers the LCP image | A store needs navigation; the landing header stays nav-free on purpose (`sections/header/index.tsx:1-4`) | P0 | M |
| Announcement bar (reuse `announcement`) | Store-level, scheduled by real dates; rotating messages only from facts (delivery fee, COD, real promo end) | Puts "Paiement à la livraison" above the fold everywhere | P0 | S |
| Footer (reuse `footer` big) | Policies hub, contact (phone, WhatsApp, hours), seller identity (legal name, city, registration ids when provided; gaps visible in admin, never invented), language | Law 31-08 seller identity [S13]; trust | P0 | S |
| WhatsApp float (reuse) | Store number, prefilled text includes the page/product name; hours shown; hidden on checkout to protect the form | Most Moroccan shoppers ask before ordering | P0 | S |
| Store 404 / empty states | Branded, with search + bestsellers; neutral 404 outside a store (PUB-23) | Ads often point at deleted products | P0 | S |
| Menus editor | Header + footer menus, links to collections/products/pages/policies | Owner control | P0 | S |
| Cookie/consent banner (EU markets only) | Off for MA by default; EU: blocks ad pixels until consent, passes Consent Mode v2 signals [S12]; privacy-first default (decline non-essential equally prominent) | Legal in EU; pixels are central to COD ads | P1 (P0 for the first EU store) | M |

### 4.2 Home page compositions

Home pages are where generated stores look the same fastest. Proposal: a **home grammar** of composition
archetypes, each a slot list the generator fills with section variants, with seeded alternates per slot.

| Home archetype | Slots (top → bottom) | Fits |
|---|---|---|
| Hero product ("one-product brand") | full-bleed hero with the hero product + inline offer chip → proof strip → benefits → offer/packs → reviews → FAQ | 1-3 SKU stores, ad-driven (most COD sellers) |
| Category bento | brand statement → bento of 3-5 collection tiles of varied size → bestsellers grid → trust row → UGC | 5-50 SKUs across categories |
| Editorial lookbook | big type + lookbook gallery → shoppable images (hotspots exist in `showcase`) → new arrivals | fashion, abaya, jewelry |
| Drop / launch | real-date countdown (only with a real launch date) → product reveal → notify-me (WhatsApp opt-in) | limited drops |
| Catalogue-dense | search-first header → category chips → dense 2-col grid with quick-add | 50+ SKUs, home & kitchen |
| Ritual / routine | step-by-step routine (reuse `steps`) → products per step → bundle "the full routine" | beauty, care |
| Gift guide | budget/recipient chips → curated grids → gift wrap extra | seasonal (Ramadan, Eid, Mother's Day) |
| Local maker | story (reuse `story`) → workshop gallery → products → guarantee | artisan brands (modern visuals only, no craft motifs, DESIGN §1.1) |

Rules: one focal point per section, a section that crosses a boundary, product-tinted light (DESIGN §1.2); bestseller
grids sorted by *real* order counts (from `orders`), never labelled "bestseller" without data. P0 = 4 archetypes
(hero product, category bento, editorial, catalogue-dense); P1 = the rest. Effort M (grammar) + M (sections).

### 4.3 Collections, grids, filters, search

| Feature | Detail | P | E |
|---|---|---|---|
| `productCard` primitive | Image (4:5 or 1:1 per archetype, second image on hover/long-press desktop only), name (2 lines max), price with tabular numerals, genuine compareAt, "Livraison gratuite" only if real, real rating only, sold-out state; card variants: minimal, framed, overlay, editorial | P0 | M |
| `productGrid` section (grid 2-col mobile, carousel, bento, editorial) | Sources: collection, manual pick, bestsellers (real counts), newest | P0 | M |
| Collection page | Header (title, intro, hero image optional), grid, sort (featured, newest, price ↑↓, bestselling), pagination as "load more" with real URLs (`?page=2`) for SEO | P0 | M |
| Filters | Price range, option values (size, color swatches from the options model), availability; bottom-sheet on mobile with live result count; client-side over the collection JSON for ≤ 500 products, server query beyond | P1 | M |
| Quick add / quick view | Bottom sheet with options + "Commander" (COD) or "Ajouter au panier"; never for products with typed fields (open the PDP instead) | P1 | M |
| Search | Header search with instant results from a per-store JSON index (name, collection, tags); **Arabic normalization** (strip diacritics/tatweel, unify alef forms أ إ آ → ا, ة/ه, ى/ي), Latin and Arabizi spellings ("Casa", "3abaya" `[proposal]`), French accent folding; "no result" shows bestsellers + WhatsApp ask | P1 | M |
| Recently viewed | localStorage, store-keyed (LND-12/14 lesson) | P2 | S |
| Breadcrumbs | Visible + BreadcrumbList JSON-LD | P1 | S |

### 4.4 Product page (PDP) anatomy, mobile-first

Order on a 360-px phone, from the top (the first screen must show image, name, price, COD promise and the buy
action within ~1.3 screens):

1. **Gallery:** swipeable, 4:5, dots + count, pinch/tap zoom, video slot (poster as LCP, video loaded on tap), option
   change swaps to the option's image (matrix cell images exist in Options v2).
2. **Title, price block:** price, genuine compareAt (EU: plus "lowest price in the last 30 days" [S10]), per-unit price
   for packs (`showPerUnit` exists), real rating summary linking to reviews.
3. **Offer / pack picker:** reuse Offers v2 pickers (stack, tiers, ticket, pills, visual) for quantity breaks
   ("1 pièce / 2 pièces -15% / 3 pièces + cadeau"). Savings are computed by the shared pricing code, never typed.
4. **Options:** swatches / text / image / select; size guide link next to size; out-of-stock values struck through
   (from inventory).
5. **Primary action:** two models, chosen per store (decision D3):
   - **Inline COD form** (default for "one-product" and ad-driven stores): the existing orderForm block below the
     offer, so an ad click → order needs zero page loads.
   - **Add to cart + "Commander maintenant"** (catalog stores): buy-now opens the one-page checkout with only this
     line.
6. **Delivery promise line:** "Livraison à {city} : {ETA} · {fee}" with a city chip the shopper can change (remembers
   the city from a previous visit, store-keyed). Default text before a city is chosen: the store's range ("24-72 h
   selon la ville"). P0, M (needs delivery zones, §4.6).
7. **Trust row (facts only):** pay on delivery; "vérifiez avant de payer" **only if the store policy says the parcel
   can be opened** (a store fact, not a default `[proposal]`); returns window from the policy (MA law 31-08: 7 days
   [S13]); WhatsApp button.
8. **Content:** benefits, description (RichText), specs (reuse `specs` tabs/accordion), size guide, before/after,
   FAQ; reuse landing sections with `kinds` allowing `product` (LND-03).
9. **Reviews:** verified only (§4.9), with photos; distribution bars from real data.
10. **Cross-sell:** "complete the look"/"souvent achetés ensemble" from manual links first, then co-purchase counts
    from real orders (P2).
11. **Sticky buy bar:** reuse `sticky.ts` behaviour: price + selected pack + button; appears after the primary CTA
    scrolls past; never over the form; glass with opaque fallback. Vendor A/B tests show sticky bars raise
    add-to-cart but effects on revenue vary [S17] `[vendor data]`: so make it a variant the A/B system can test (§5).

Priority: P0 = 1-7, 8 (reused sections), 11; P1 = 9 with collection flow, size guide; P2 = 10 (data-driven).
Effort L overall (productDetail section + kind-specific required sections + JSON-LD ProductGroup).

### 4.5 Cart drawer and one-page COD checkout

| Feature | Detail | P | E |
|---|---|---|---|
| Cart chunk (separate runtime chunk, budget ≤ 6 KB gz `[proposal]`) | Store-keyed localStorage, badge, drawer, integer-cent math from the shared pricing code, stale-price detection against `catalog_version` | P0 (store mode) | L |
| Cart drawer | Slide-in from the inline-end side (RTL aware), line edit, one cross-sell/bump row (the order-bump item exists in Offers v2), free-shipping progress **only if the store has a real threshold** | P0 | M |
| One-page checkout | Order summary (collapsed on mobile with total visible), 4 fields (MA), delivery line by city, total incl. delivery, COD statement, submit "Confirmer la commande" + reassurance ("Un conseiller vous appelle pour confirmer" only if the store does confirmation calls) | P0 | M |
| Payload v3 + server re-pricing per line | `{storeKey, lines[], catalogVersion, shownTotal}`; per-line stale answers like today's v2 flow (ORD-19/20) | P0 | L |
| Field model per market | MA: name, phone, city (select/combobox), address (1 line, "quartier, rue, repère"), note optional. FR/BE/ES…: name, phone, street, postal code, city (postal → city autofill from a static list `[proposal]`), email optional | P0 MA / P1 EU | M |
| Autofill hygiene | Correct `autocomplete` tokens (`name`, `tel`, `address-line1`, `postal-code`, `address-level2`), `inputmode="tel"`, `dir="ltr"` on the phone field inside RTL pages, `enterkeyhint` | P0 | S |
| Phone UX | Format as typed (06 12 34 56 78), accept Arabic digits (exists server-side), inline "numéro valide" tick, "this is my WhatsApp" checkbox default on | P0 | S |
| City combobox | Search-as-you-type over the 147 cities in fr/ar/en, top cities as chips, accent/Arabic-folded matching, "Autre ville" → free text; ≤ 4 KB data `[proposal]` | P0 | S |
| Coupons | Server-validated codes (percent, fixed, free delivery; per-product; usage caps; real end dates); influencer codes are common in COD marketing `[unverified]` | P1 | M |
| Callback window (optional field) | "Quand pouvons-nous vous appeler ?" (matin / après-midi / soir) for the agents' queue | P2 | S |
| Order notes to the delivery man | Free text, max 300 (exists) | P0 | S |

### 4.6 Delivery promise (zones, fees, ETA)

- **Store delivery zones:** groups of cities (e.g. "Casablanca", "grandes villes", "reste du Maroc") each with fee,
  free-from threshold, ETA range in working days, and "not served" flag. Seeds: the city list exists; zone defaults
  must be empty, typed by the owner (never invent fees). P0, M.
- **ETA as dates:** "Livré entre mercredi 29 et jeudi 30 oct." computed from store time zone, cut-off hour, working
  days and holidays (Moroccan public holidays need a maintained table `[proposal]`). Baymard: dates, not speeds [S5].
  P1, S once zones exist.
- **Carrier-aware later:** when a delivery-company integration exists (integrations area), pull its real ETA/fees.
  P2.

### 4.7 Thank-you and post-purchase

Exists: order recap, timeline, WhatsApp help, Purchase pixel, one-click upsell with a real window (§3). Add:

| Feature | Detail | Why | P | E |
|---|---|---|---|---|
| "Confirmer sur WhatsApp" button | wa.me link with prefilled order id + summary (text from server-formatted order, ≤ 140 chars for short links per [S18]); marks `confirm_intent` when clicked (first-party beacon) | Pre-dispatch confirmation is the main refusal lever [S3] `[vendor data]`; lets agents skip calls | P0 | S |
| Expectation block | "Vous recevrez un appel du 06 xx xx xx xx dans les prochaines heures" (store's real confirmation number and hours) | Unknown numbers get ignored → refusals | P0 | S |
| Tracking link | Signed link to the order tracking page (§4.8) | Fewer "where is my order" chats | P0 | S |
| Upsell → downsell chain | Accept/decline of offer 1 can lead to offer 2 (smaller), max 2 steps, each with a real window; the agent sees the added lines before confirmation | AOV with no new ad cost | P1 | M |
| Cross-store-product upsell ("both" mode) | Landing thank-you can offer a store product | Uses the catalog | P1 | S |
| Share / referral | "Partager avec un ami" WhatsApp share of the product URL with UTM `ref=order` (no fake rewards) | Organic reach | P2 | S |

### 4.8 Order tracking page

`/s/<h>/suivi` (and on a custom domain `/suivi`): lookup by order number + phone (last 4 digits) or the signed link;
shows status timeline (placed → confirmed → shipped → out for delivery → delivered / returned) from admin statuses
or carrier sync, the delivery ETA, carrier tracking link when present, WhatsApp help, and a "changer l'adresse /
annuler" request button before shipping. Never shows full address or other orders; rate-limited per IP + per store.
`noindex`. P0 (status from admin) S-M; carrier live status P1/P2 with integrations.

### 4.9 Reviews: only real customers

Flow:
1. Order marked **delivered** (manually or by carrier sync) → after N days (store setting, default 3 `[proposal]`)
   the agent/automation sends a review request (WhatsApp template or SMS; the sending channel belongs to the
   integrations area) with a **signed, single-use link** bound to `order_id` + product lines.
2. Review page (mobile, 3 taps): stars per product, optional text, optional photos/video (through the media
   pipeline, sniffed, stripped of EXIF location), first name + city initial display ("Salma, Rabat"), consent
   checkbox for publishing.
3. Moderation queue in the store admin: approve/hide, **cannot edit text or stars** (only hide, with a reason kept in
   the audit log). Negative reviews are publishable like positives; hiding rate shown in the platform console as a
   fraud signal.
4. Display: "Achat vérifié" badge, date, option bought (e.g. "Pack Duo · Noir"), photos in a UGC strip; rating and
   distribution computed from approved verified reviews only; JSON-LD `aggregateRating`/`review` only from them
   (Google expects real, visible reviews; undisclosed incentivized reviews can draw a manual action [S19]
   `[secondhand]`).
5. Disclosure line auto-generated from the system: "Les avis proviennent de clients ayant reçu leur commande ; nous
   vérifions chaque avis par son numéro de commande." (EU requirement [S6]; good practice in MA).
6. Import: CSV/screenshot import of pre-existing reviews allowed only as **"imported"** (badge "avis importé", not
   "vérifié"), with an attestation by the owner; excluded from `aggregateRating` `[proposal, conservative]`.
7. Incentives: if the store offers a coupon for a review, the badge text must say so ("avis récompensé").

Priority: block publishing `sample: true` reviews/socialProof/stats on SaaS stores: **P0, S** (turn the checklist
warning into an error at `checklist.ts:146-151` for those section types). Collection flow + moderation + display:
**P1, L**. UGC video reviews: P2, M.

### 4.10 UGC and video

- Video primitives exist (`video` section framed/phone/fullbleed; video scrub in the media pipeline). For stores:
  a **product video slot** in the PDP gallery and a **UGC strip** (vertical 9:16 clips, poster images, tap to play,
  muted autoplay only when in view and `prefers-reduced-motion` is off, and never more than one playing). P1, M.
- Video budget `[proposal]`: ≤ 1.5 MB for the first clip at 540-720p, poster ≤ 60 KB AVIF, `preload="none"`.
- Only the owner's or customers' own clips (consent recorded); no "influencer" labels without proof.

### 4.11 Size guide and fit

- Size chart per product (table per size: chest, length, etc.) authored in the product editor; shown as a bottom
  sheet; units cm/in per market. `garment.ts` already detects garments (`sections/garment.ts:1-15`), so the
  generator can propose an empty chart skeleton for garments (never invented measurements). P1, S.
- "Ma taille" helper: height/weight → suggested size from the owner's own chart rules. P2, M.
- Modest-fashion specifics (abaya length by height) as a rule template. P2, S.

### 4.12 Policies

Reuse `LegalBody` + `legal/content.ts` as store policy pages (privacy, terms, shipping, returns, contact) with
store-level facts (TENANCY-MAP §8.1, LND-32). Add: a **returns policy page** separate from shipping (needed for
`hasMerchantReturnPolicy` [S15]); a short "Vos droits" line near the buy button in MA (7-day withdrawal [S13]); the
EU price-reduction and review disclosures (§4.9). P0, S-M.

### 4.13 Multi-language, RTL, locale switching

- Store locales: one default + optional siblings (ar/fr/en complete today; `i18n.ts:335`). Each product carries
  per-locale name/description/alt (machine-drafted, owner-confirmed). P1, M (P0 = one locale per store).
- RTL: logical properties only (DESIGN §10); phone, prices and order ids in `dir="ltr"` isolates; mirrored drawer and
  carousels; Arabic numerals choice per store (Latin digits default in Morocco `[proposal]`).
- Switching: no automatic redirect (it breaks shared caching and SEO); a one-time suggestion chip from
  `Accept-Language` ("Voir en العربية ؟") rendered client-side from a tiny script. `hreflang` alternates between
  siblings (none today). P1, S-M.

### 4.14 SEO

| Item | Detail | P | E |
|---|---|---|---|
| Per-store `sitemap.xml` + `robots.txt` | Products, collections, pages, policies; landing pages per their index setting (PUB-27) | P0 | S |
| JSON-LD | Organization (logo, contact, `hasMerchantReturnPolicy`, shipping policy at org level [S15]), WebSite + SearchAction, BreadcrumbList, ItemList on collections, Product/ProductGroup with `hasVariant`/`variesBy` [S16], Offer with availability from inventory; never a past `priceValidUntil` [S15] | P0 (Product/Org), P1 (rest) | M |
| Canonicals | PDP canonical; landing pages attached to a product: default `noindex` + canonical to the PDP (ad-only pages, avoids duplicates) with an owner toggle `[proposal]` | P0 | S |
| Clean URLs | `/s/<h>/p/<product-slug>`, `/s/<h>/c/<collection>`; on custom domains `/p/…`, `/c/…`; slug change keeps a redirect | P0 | S |
| OG per kind | Product image + price for social previews (WhatsApp shares are the main social channel) | P0 | S |
| Temporary domain caveat | All stores on one host under paths is weak for SEO and brand; real SEO starts with subdomains/custom domains (routing area) | note | — |

### 4.15 Performance budgets (store pages) `[proposal]`

| Budget | Value | Basis |
|---|---|---|
| CWV at p75 (field) | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 | [S9] |
| HTML + inlined CSS, first view | ≤ 60 KB gz home/collection, ≤ 80 KB gz PDP (hard cap stays 400 KB gz) | today's per-variant CSS chunks make this reachable |
| JS on a PDP | core 24.2 KB + cart ≤ 6 KB + pixels 3.9 KB + Turnstile 1.3 KB ≤ 36 KB gz; checkout ≤ 8 KB and search ≤ 5 KB loaded only where used | `runtime/budgets.json` |
| LCP image | ≤ 120 KB AVIF at 1× mobile width, preloaded, `fetchpriority=high` (exists) | Picture.tsx |
| Fonts | ≤ 2 preloaded files; Arabic subset only on ar pages | fonts.ts |
| Third parties | none except pixels/Turnstile; no tenant JS while stores share one origin (PUB-25) | CSP |
| Navigation speed | Speculation Rules `prefetch` with `moderate` eagerness for grid → PDP links (Chrome ≥ 121/122; most Moroccan traffic is Android [S7][S20]); keep pages bfcache-eligible: no `Cache-Control: no-store` on public pages, `pagehide`/`visibilitychange` instead of `unload` [S21] | P1, S |

Add a CI render-check per page kind (the existing render-check with budgets extends naturally).

### 4.16 Accessibility

WCAG 2.1 AA as the floor (EAA conformity via EN 301 549 for EU stores [S11]); targets ≥ 44 px (DESIGN §10); focus
visible; form errors linked with `aria-describedby` and announced; drawers/bottom sheets as dialogs with focus trap
and Escape; carousels pausable; `prefers-reduced-motion` honoured by every signature motion; contrast solved by the
theme engine (exists). Add an automated axe-style pass to the render matrix `[proposal]`. P0, M.

### 4.17 PWA / add to home screen

Per-store manifest (name, icons from the brand kit, `start_url` and `scope` = the store base path) and a minimal
service worker (offline page + static asset cache, never caching order/API responses). Chrome's install prompt
needs HTTPS, a manifest with name, 192/512 icons and start URL, plus user engagement (tap + 30 s) [S22]. Low direct
COD impact (shoppers rarely return to install), real value for repeat-purchase stores. P2, M. On the temporary domain
all stores share one origin: service-worker scope per path works, but storage is shared, so keys stay store-prefixed.

### 4.18 Customer accounts

No login for COD at launch (friction, no value). P2: "Mes commandes" by phone + one-time code once a messaging
provider exists (cost per message unknown here `[unverified]`).

---

## 5. Landing pages

### 5.1 Keep everything (TENANCY-MAP §8.3)

27 section types / 91 variants, Offers v2 (tiers, gifts, bumps, extras, shipping offers, real countdown/stock), Options
(choice, matrix, fields), the 4 order-form variants with WhatsApp alternative, honeypot, Turnstile, abandoned leads,
idempotency, stale flow, server re-pricing, risk, pixels (Meta/TikTok/Snap/GA4 + CAPI/Events API), theme engine,
SEO head, legal pages, thank-you + one-click upsell, builder, versions, generator, exports (ZIP, connected, PHP,
WhatsApp bridge). Nothing here is removed or regressed; each landing page becomes store-scoped (TENANCY-MAP §5.5-5.6).

### 5.2 New landing features, ranked by COD conversion impact

| # | Feature | How it works here | Why for COD | P | E |
|---|---|---|---|---|---|
| L1 | **Delivery promise by city** | Same zones as the store (§4.6); line under the offer and in the form after city pick | Trust + fewer refusals | P0 | M (shared with §4.6) |
| L2 | **Confirm on WhatsApp + expectation block** on thank-you | §4.7 | Refusal reduction | P0 | S |
| L3 | **Attach to catalog product** ("both" mode) | §8 | One price/stock truth, store link after order | P0 | M |
| L4 | **Abandoned-lead recovery** | Leads exist (`runtime/lead.ts`). Add: leads inbox per store with the selection, one-tap WhatsApp message to the lead with prefilled text (agent-sent, not automated in EU without consent), status (contacted / converted / lost), auto-purge by retention, conversion attribution when the same phone orders | 10-30% of form starters never submit `[unverified]`; these are warm, ad-paid visitors | P0 | M |
| L5 | **A/B variants with real stats** | Two or three published versions of one page. Assignment: first-party cookie set on first view, page served with `Cache-Control: private` *only while a test runs* (avoid `Vary: Cookie` on shared caches, TENANCY-MAP §9.2), or URL-split variants (`?v=b`, canonical to A) for ad-level splits. Stats from existing beacons (view, form_start) + orders, by `ver`. Fixed-horizon test with a minimum sample and a pre-set duration; no "winner" badge before it; warn that peeking inflates false positives [S23]. Optional auto-promote at the end | Lets sellers stop guessing headlines/offers | P1 | L |
| L6 | **Upsell → downsell chain** | §4.7 | AOV | P1 | M |
| L7 | **WhatsApp order option (live, not only export)** | Button "Commander sur WhatsApp": creates a server *lead* with the selection (priced by the server), then opens wa.me with the order text; agent converts it to an order in admin | Part of shoppers will not fill forms | P1 | S |
| L8 | **Video-first hero** | `hero` variant whose LCP is the poster image; the 9:16 clip loads after first interaction or idle; captions burned in or as text (sound off by default) | TikTok/Reels traffic expects motion | P1 | M |
| L9 | **Scheduled publish / price change / promo end** | Cron (5 min) applies a scheduled version; countdown uses the same real end date | Ramadan/Eid/Black Friday campaigns without night work | P1 | S |
| L10 | **Per-page analytics** | Views, form starts, orders, conversion by offer, UTM, variant, device, city; refusal rate per page from delivery outcomes | The real KPI in COD is *delivered* orders per ad dirham | P1 | M |
| L11 | **Two-step form** | Step 1 offer + options, step 2 contact (the `fill-steps-box` chunk exists for offers); measure with A/B before defaulting | May help on long option sets; unproven for 4-field forms | P2 | M |
| L12 | **Quizzes / product finder** | 3-5 questions → recommended product/pack (rule-based from the owner's answers; the AI drafts the rules) | Beauty/care/supplement niches | P2 | M |
| L13 | **Advertorial / pre-sell page kind** | Long-form article layout → links to the landing; required honest "publicité" label `[proposal]` | Common in EU direct response; cold traffic | P2 | M |
| L14 | **Comparison table upgrade** | `comparison` exists; add "us vs. other options" with only owner-provided facts | Already covered; small gain | P2 | S |
| L15 | **Geo/language auto-suggest** | `Accept-Language` chip to the sibling locale page; no IP geolocation (no service on Hostinger, and caching) | Diaspora / bilingual shoppers | P1 | S |
| L16 | **Multiple bumps + build-your-box** | Extend Offers v2 bump to N items; box builder layout (pick 3 of 8) | AOV for cosmetics, snacks | P2 | M |
| L17 | **Exit/scroll lead popup (honest copy only)** | Offer WhatsApp help, never fake discounts; once per session; disabled on mobile back-gesture traps | Small gain, risk of annoyance | P2 | S |
| L18 | **Section visibility by UTM/device** | Baked at publish (no runtime cost): e.g. TikTok visitors see the video hero | Message match with the ad | P2 | M |
| L19 | **Short links with UTM presets** | `/<h>/go/<code>` → landing with utm_*; per ad set | Clean ad links, attribution | P1 | S |
| L20 | **Countdowns from real dates only** | Exists; extend to "offer ends with the campaign" from L9 schedule | Honest urgency | P0 (keep) | — |

Rejected on purpose: fake "X people are viewing", fake recent-purchase toasts, evergreen resetting countdowns,
invented stock. They break owner rule §2.4 and EU UCPD rules; real-data versions (e.g. "12 commandes aujourd'hui"
computed from orders, shown only above a threshold) are P2 and must be opt-in.

---

## 6. Cross-cutting storefront rules for the spec

1. **Facts-only rendering:** every number on a public page (price, savings, delivery fee, ETA, stock, rating, order
   counts, countdown) comes from data the server can prove; generators may write *copy*, never facts.
2. **Store-keyed client storage:** `lp-utm`, `lp-vid`, `lp-px-u`, `lp-order`, cart, city memory all prefixed by a
   store key (TENANCY-MAP LND-12-14), because stores share one origin on the temporary domain.
3. **One pricing engine:** cart, PDP, landing, thank-you and PHP export all use `page/pricing.ts` integer cents.
4. **No tenant JS/HTML** on shared origins (PUB-25); custom code injection only on verified custom domains, much later.
5. **Every new section declares** `kinds`, `requires` and a budget, and ships ar/fr/en copy families.

---

## 7. Dynamic, non-repetitive storefront generation (storefront side)

The design-generation area owns the generator; storefront-specific needs:

- **Home grammar** (§4.2) + per-slot seeded alternates + archetype `preferredVariants` for the new sections.
- **Store seed:** one seed per store drives variant choices, divider kinds, card style, grid rhythm, so pages *within*
  a store are consistent and *between* stores differ.
- **Uniqueness guard:** fingerprint = (archetype, font pair, accent hue bucket, home slot sequence + variants, card
  variant). Reject or re-roll a generated store whose fingerprint distance to any of the last N platform stores
  is below a threshold `[proposal]`. P1, M.
- **Copy anti-patterns:** the banned-phrase list (DESIGN §1.1) enforced on store copy too; copy families per vertical
  exist for landings (garment, style, etc.) and must be extended to collection intros, product cards, empty states.
- **Learning loop (ties to the AI area):** per-store conversion of section variants and offer pickers feeds priors
  for that store's next generation; cross-store aggregates only as anonymized, opt-in statistics by vertical (never
  another tenant's content). P2, L.

---

## 8. "Both" mode: one catalog, one brand, one order book

| Concern | Rule |
|---|---|
| Product truth | `products` row owns `{product, items, offers, options, inventory}`. A landing page with `product_id` reads them at render; edits to price/options re-render the PDP (catalog_version) and the attached landing pages (dependency index) |
| Campaign offers | A landing may define extra offers (packs, gifts, bumps) built only from the product's items and the store's other products; prices still computed by the shared engine; compareAt must be a real former price (EU: 30-day rule [S10]) |
| Stock | Shared counters; a landing shows sold-out options exactly like the PDP; reservation on order creation, release on cancel/refusal (commerce area) |
| Brand | Store brand kit (logo, palette, fonts, voice) is the default theme; a landing chooses `themeMode: inherit` (store look) or `own` (art-directed per campaign, today's behaviour, still using the brand logo and locked brand colors when the owner locks them) |
| Chrome | Landing keeps its focused header (no nav) by default; optional "store link" in footer and on thank-you ("Découvrir la boutique") |
| Orders | One `orders` table per store with `source` (pdp, cart, landing:<pageId>, whatsapp, agent) + UTM + variant `ver`; agents see one queue regardless of source |
| Customers / risk | Phone history, blocklist and risk scoring scoped per store, shared by storefront and landings (ORD-03-05) |
| Pixels | Store pixel library; per-page pixel answer stays for landings; content ids = product SKU / option SKU so landing, PDP and cart events match one Meta/TikTok catalog (LND-11) |
| Reviews | Collected per product; shown on the PDP and on every landing attached to that product |
| URLs | Landing at `/<h>/<slug>` vs PDP at `/<h>/p/<slug>` (the routing area fixes the exact scheme); landing canonical → PDP by default when attached (§4.14) |
| Mode switch | Hides, never deletes (TENANCY-MAP §8.2) |

---

## 9. Features table (summary of priorities)

| Feature | P | E | One-line why |
|---|---|---|---|
| Store page kinds + `StoreRenderContext` + navHeader, footer, menus, 404 | P0 | L | A store needs pages and navigation |
| productCard + productGrid + collection page (sort, load-more) | P0 | M | Browse the catalog |
| PDP anatomy (gallery, price, packs, options, inline COD or cart, sticky bar) | P0 | L | Where the order happens |
| Delivery zones + city ETA/fee line (store + landing) | P0 | M | Trust, fewer refusals |
| Cart chunk + drawer + one-page COD checkout + payload v3 | P0 | L | Multi-product orders |
| Market-driven field model + phone/city UX | P0 | M | Short form, valid numbers |
| Thank-you: confirm on WhatsApp, expectation block, tracking link | P0 | S | Refusal reduction |
| Order tracking page | P0 | S-M | Fewer support chats |
| Block publishing sample reviews/stats on SaaS stores | P0 | S | Honesty, legal |
| Policies hub incl. returns page, seller identity, "vos droits" | P0 | S-M | MA law 31-08, Google merchant data |
| SEO base: sitemap/robots, Product + Organization JSON-LD, canonicals, OG | P0 | M | Organic + WhatsApp previews |
| Accessibility AA pass on new sections | P0 | M | EAA, quality |
| Landing: attach to catalog product | P0 | M | "Both" mode |
| Landing: abandoned-lead recovery inbox | P0 | M | Warm leads are paid traffic |
| Verified review collection, moderation, display, disclosure | P1 | L | Real proof drives conversion |
| Filters, quick add, search with Arabic/Arabizi normalization | P1 | M | Catalog stores |
| Multi-locale siblings + hreflang + locale suggestion chip | P1 | M | ar/fr bilingual market |
| EU pack: 30-day lowest price, consent banner, EU address fields | P1 (P0 for EU launch) | M | Legal in Europe |
| Coupons | P1 | M | Influencer marketing |
| Upsell → downsell chain; cross-store upsell | P1 | M | AOV |
| A/B tests with honest stats | P1 | L | Data instead of guesses |
| WhatsApp live order option; short links; scheduled campaigns | P1 | S each | Channels and campaigns |
| Video-first hero; PDP video; UGC strip | P1 | M | TikTok/Reels traffic |
| Size guide | P1 | S | Fashion returns |
| Per-page analytics incl. delivered rate | P1 | M | True COD KPI |
| Speculation Rules + bfcache hygiene | P1 | S | Instant navigation |
| Home grammar archetypes 5-8 + uniqueness guard | P1 | M | No repetitive stores |
| ETA as dates with holidays | P1 | S | Baymard delivery-date finding |
| PWA per store | P2 | M | Repeat buyers |
| Customer "my orders" with OTP | P2 | M | Repeat buyers |
| Quizzes, advertorial kind, build-your-box, multiple bumps, two-step form | P2 | M each | Niche lifts |
| Size helper, recently viewed, co-purchase cross-sell, real "orders today" counter | P2 | S-M | Polish |
| Generation learning loop from conversion data | P2 | L | Quality improves over time |

---

## 10. Recommended decisions for the architect

- **D1. Separate runtime chunks per store capability** (cart, checkout, search, collection), each with its own
  budget in `budgets.json`; the landing chunk stays frozen at 24.2 KB. High confidence (LND-16).
- **D2. Catalog pages render on request**, cached by `(storeId, path, locale, catalog_version)` with ETag and a
  byte-bounded LRU (PUB-13); landing pages stay static at publish; a product → landing dependency index triggers
  re-render of attached landings on product change. Medium-high confidence: simplest correct option on one Node
  process with no queue workers; revisit if a store exceeds a few thousand products.
- **D3. Two PDP buy models chosen per store** (inline COD form vs cart + buy-now), defaulting from mode and SKU count
  (≤ 3 products → inline form). Medium confidence; validate with A/B data once L5 exists.
- **D4. Moroccan default form = name, phone, city, one-line address**; email hidden; note optional. High confidence.
- **D5. Delivery zones are store data typed by the owner, empty by default.** No invented fees/ETAs. High.
- **D6. Reviews: verified-from-delivered-orders only for badges and JSON-LD; imports allowed but labelled; samples
  never publishable on SaaS stores.** High.
- **D7. Landing pages attached to a product default to `noindex` + canonical to the PDP.** Medium (owner may prefer
  indexable landings; keep a toggle).
- **D8. No auto-redirect by language or geo; suggestion chip + hreflang.** High (caching + SEO).
- **D9. A/B testing via private-cache assignment only on pages under test**, fixed-horizon stats with minimum sample.
  Medium (the cache behaviour on Hostinger's CDN, if enabled, must be tested `[unverified]`).
- **D10. EU legal pack is a market switch** (price history, consent, disclosures, address fields), not per-page
  settings. High.

---

## 11. Risks

- Store pages on one shared origin (temporary domain) share cookies/storage: a store-key prefix everywhere is
  mandatory, and any XSS on one store reaches all; keep "no tenant JS" strictly.
- On-request rendering CPU on Hostinger Business under ad spikes (one Node process): needs the LRU, `s-maxage`, and
  a load test per page kind `[unverified capacity]`.
- Cart + payload v3 is the largest new surface for pricing bugs: must reuse `page/pricing.ts` and the parity tests
  (runtime/server/PHP).
- Delivery ETAs that are wrong do more harm than none: require the owner to confirm zones; show ranges, not promises,
  until carrier data exists.
- Review collection needs an outbound messaging channel (WhatsApp/SMS/email): none exists today (TENANCY-MAP §9.1
  notes no outbound email); until then, the agent sends the signed link manually from the order drawer.
- Generated sameness across hundreds of stores on one platform is a brand risk for the SaaS itself; the uniqueness
  guard must run before showing directions.
- EU features (consent, 30-day price) are easy to forget for a Morocco-first team; gate EU market activation on them.
- Speculation Rules prefetch wastes data on capped plans if eagerness is too high: `moderate` only.

---

## 12. Sources

- [S1] North Africa Post, "Online Shopping Surges 65% as Quarter of Moroccans Embrace E-Commerce" (ANRT ICT survey 2024-2025: COD preferred 84.1%, buyers 24.9%): https://northafricapost.com/91996-online-shopping-surges-65-as-quarter-of-moroccans-embrace-e-commerce.html
- [S2] Hespress FR, "Le e-commerce marocain franchit un nouveau palier" (COD used by more than 8 in 10 buyers): https://fr.hespress.com/448253-le-e-commerce-marocain-franchit-un-nouveau-palier.html
- [S3] eGrow, COD return rates Morocco (vendor): https://www.egrow.com/en/blog/reduce-cod-return-rate-below-15-morocco-2026 ; https://www.egrow.com/en/blog/cod-ecommerce-morocco-complete-guide-2026 ; YouCan Confirm (vendor): https://youcan.shop/en/help/blog/confirm
- [S4] Baymard Institute, "Checkout Flow Average Form Fields" (2024: 11.3 fields, 5.1 steps, ~8 needed): https://baymard.com/blog/checkout-flow-average-form-fields
- [S5] Baymard Institute, "Use 'Delivery Date' Not 'Shipping Speed'": https://baymard.com/blog/shipping-speed-vs-delivery-date
- [S6] Omnibus review rules: https://www.makeinfluence.com/en/academy/fake-and-manipulated-reviews-what-the-eu-omnibus-directive-bans ; German UWG §5b(3) note: https://www.xictron.com/en/blog/customer-reviews-authenticity-notice-uwg-shop/ ; https://mondaq.com/dodd-frank-consumer-protection-act/1189542/the-omnibus-directive-consumer-reviews
- [S7] StatCounter, mobile OS market share Morocco: https://gs.statcounter.com/os-market-share/mobile/morocco
- [S8] Hespress EN, Morocco 39th in 2025 Speedtest index (avg 124.32 Mbps): https://en.hespress.com/132317-132317.html ; Morocco World News on the 5G jump: https://www.moroccoworldnews.com/2026/02/277963/morocco-jumps-22-places-in-global-mobile-internet-rankings-after-5g-launch/
- [S9] web.dev, "How the Core Web Vitals metrics thresholds were defined": https://web.dev/articles/defining-core-web-vitals-thresholds
- [S10] 30-day lowest price rule (Directive 2019/2161, Art. 6a PID): https://letslaw.es/en/omnibus-directive-and-discounts-on-prices/ ; https://cms.law/en/int/publication/spotlight-on-sustainability-ii-december-2021-consumer-products-newsletter/new-requirements-for-advertising-with-price-reductions
- [S11] European Accessibility Act: https://www.reedsmith.com/our-insights/blogs/viewpoints/102kxnd/the-eu-accessibility-act-is-now-in-force/ ; https://www.traverssmith.com/knowledge/knowledge-container/a-new-milestone-for-accessibility-the-european-accessibility-act-applies-tomorrow/ ; https://accessible.org/eaa-ecommerce-services-requirements/
- [S12] Google Consent Mode v2 (EEA, March 2024): https://support.google.com/tagmanager/answer/14754100 ; https://www.searchenginejournal.com/consent-mode-v2-google-shares-shares-key-details-for-advertisers/
- [S13] Morocco law 31-08: https://consonews.ma/dossiers/moroccan-consumer-day-2025/commerce-en-ligne-entre-cadre-legal-et-realite-algorithmique-quelle-protection-pour-le-consommateur ; https://www.lavieeco.com/affaires/e-commerce-ce-qui-changera-en-2013-24727/ ; https://cms.law/en/mar/legal-updates/flash-info-maroc-the-new-legal-framework-with-respect-to-consumer-protection
- [S14] Spiegel Research Center findings via secondary sources: https://lipscore.com/blog/product-reviews-increase-your-online-sales-by-270/ ; https://marketingsherpa.com/article/chart/university-study-online-reviews-affect-sales
- [S15] Google Search Central, merchant listing structured data (fetched 2026-10-23): https://developers.google.com/search/docs/appearance/structured-data/merchant-listing ; return policy: https://developers.google.com/search/docs/appearance/structured-data/return-policy
- [S16] Google Search Central, product variants: https://developers.google.com/search/blog/2024/02/product-variants ; https://developers.google.com/search/docs/appearance/structured-data/product-variants
- [S17] Vendor sticky add-to-cart tests (mixed results): https://cleancommit.io/ab-tests/sticky-mobile-add-to-cart-button/ ; https://cleancommit.io/ab-tests/mobile-bottom-sticky-add-to-cart-button/
- [S18] WhatsApp click-to-chat format and short-link 140-char note (third-party, quoting Meta): https://bird.com/explained/whatsapp/what-is-a-whatsapp-click-to-chat-link
- [S19] Google review snippets: self-serving rule (2019): https://developers.google.cn/search/blog/2019/09/making-review-rich-results-more-helpful ; incentivized reviews report: https://ppc.land/google-bans-undisclosed-incentivized-reviews-sites-face-manual-action/
- [S20] Chrome Speculation Rules: https://developer.chrome.com/blog/prerender-pages ; https://developer.chrome.com/blog/speculation-rules-improvements
- [S21] bfcache testing and blockers: https://developer.chrome.com/docs/devtools/application/back-forward-cache ; https://calendar.perfplanet.com/2025/chasing-bfcache-navigations/
- [S22] web.dev install criteria: https://web.dev/articles/install-criteria ; https://web.dev/learn/pwa/installation-prompt
- [S23] Evan Miller, "How Not To Run an A/B Test": https://www.evanmiller.org/how-not-to-run-an-ab-test.html
