# Store Gen: product brief (owner's goals, 2026-10-23)

This repo started as a full copy of COD Studio, a COD landing-page generator with a private admin (see
docs/HANDOFF.md). The owner wants to take it "to another level": from single landing pages to a **multi-tenant
SaaS that generates and runs complete stores**, with high quality standards everywhere.

## What the owner asked for (in their words, condensed)

1. **Store generation, not only landing pages:** more features and improvements that fit what a store needs.
2. **Separate accounts for each store:** every store is its own tenant, and the store's people can **create their
   own teammates** (invite, roles, access).
3. **Multi-tenant SaaS:** one platform, many stores, each isolated.
4. **Better design generation and store logo design**, plus other options that make it easier for users.
5. **The best results with high quality standards.** The owner rules in docs/HANDOFF.md §2 still apply (no orange,
   maximally modern and precise design, autonomy, natural ar/fr/en copy, never invented data).
6. **Deployed separately** on Hostinger, **using only the temporary domain**:
   https://lightgreen-hippopotamus-140853.hostingersite.com. It must never be deployed to myrizq.shop.
7. **Store or landing page, the user chooses (added 2026-10-23):** landing pages stay a first-class product,
   not a leftover. Each tenant picks what they run: a full store, standalone COD landing pages, or both (a store
   whose products can also have their own landing pages). Landing pages keep every feature they have today
   (sections, Offers v2, pixels, exports, thank-you upsell…) and get more features on top.

## Starting point (what already exists and can be reused)

- Theme engine (11 archetypes, OKLCH palettes, contrast + no-orange guards) and a landing renderer with 27
  section types (~88 variants). Pages are static HTML at publish.
- Offers v2: items, line-based offers, options (choice / matrix / fields), display axes. Integer-cent pricing
  shared by server, runtime and the PHP export.
- Orders (COD), risk scoring, Google Sheets sync, CSV / WhatsApp / PHP exports, per-page ad pixels with server
  events (Meta CAPI, TikTok Events API).
- Admin: generate wizard (photos → local in-browser AI analysis → details → offers → directions), builder,
  versions/history, media library (stored in MariaDB), settings, security (hidden gate, TOTP 2FA, sessions,
  rate limits, AES-GCM settings encryption).
- **Today everything is single-tenant:** one owner, one store's settings, one admin gate. Multi-tenancy is the
  core change.

## Constraints to design around

- **Hosting:** Hostinger Business. One managed Node.js app (Node 22), one MariaDB 10.4 database (about 3 GB
  quota, `max_allowed_packet` 16 MB), no root, no Redis, no background workers beyond a 5-minute cron.
  Turbopack loaders can't run there (see HANDOFF §4).
- **Temporary domain only for now:** no wildcard subdomains on `*.hostingersite.com`, so store addressing has to
  work with paths on one host at first, with custom domains per store planned later (Hostinger parked/addon
  domains + host-based routing).
- **Media:** today media lives in the database. A multi-tenant SaaS will outgrow that (3 GB). Plan quotas per store
  and a storage path that survives deploys (Hostinger wipes the build folders on every deploy).
- **AI:** the owner chose local, in-browser AI (Qwen-class VLM, no paid API) for the original app. Keep that as
  the default, and propose clearly-marked optional providers only if they bring a big quality gain (for example
  logo or image generation).
- **Security is first-class:** tenant isolation on every query and every file (tests that try to cross tenants),
  per-store secrets, per-store rate limits, audit logs, safe invites.

## Recommended way to build it

Use the method that worked for Offers v2 (docs/OFFERS.md):
1. An architect writes **docs/STORE-SAAS.md**, covering:
   - the tenant model (platform → stores → members/roles)
   - signup and invites
   - routing (path now, domains later)
   - data migration of the current single store into "store #1"
   - store pages (home, collections, product, landing, policies, thank-you, cart/checkout decision for COD)
   - the brand kit + logo designer
   - the design-generation upgrade
   - storage and quotas
   - security
   - the platform admin
   - phases with file ownership
2. Three reviewers attack it: COD/e-commerce operator, principal engineer, premium product designer. Then the
   architect revises.
3. Build in phases: core tenancy first, then parallel tracks. Then adversarial verification (including
   cross-tenant attack tests) and a fix loop.
4. Deploy to the Store Gen site with the archive method (HANDOFF §4), then run a live smoke test.
