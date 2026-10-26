# Store Gen SaaS: consolidated research (input for docs/STORE-SAAS.md)

Written 2026-10-23 by the research consolidator. It merges six area studies and resolves the conflicts between them:

| Area | File | Owner brief items |
|---|---|---|
| Domains, subdomains, hosting | `docs/saas/research/domains.md` | 6, 12, 13 |
| COD operations, agents, accounting, integrations | `docs/saas/research/cod-ops.md` | 9, 10, 11 |
| Integrated AI and the learning loop | `docs/saas/research/ai.md` | 8, 11, 4, 15 |
| Generative design and logo | `docs/saas/research/design-gen.md` | 4, 8, 14, 15 |
| Platform administration | `docs/saas/research/platform-admin.md` | 2, 3, 13, 14 |
| Storefront and landing pages | `docs/saas/research/storefront.md` | 1, 7, 9 |

Other references: `docs/STORE-GEN-BRIEF.md` (goals 1-15), `docs/HANDOFF.md` (owner rules §2, Hostinger §4) and
`docs/saas/TENANCY-MAP.md` (the verified map of today's code, ids such as GEN-06, AUTH-08 and LND-16).

Conventions:
- External facts carry a URL in the area file they come from. This file cites the area file (for example
  `domains.md §1.2`), plus the key URLs again where a decision rests on them. Code facts are `path:line`.
- **[unverified]** marks anything not confirmed at a primary source.
- Priority: **P0** = needed for launch (must land in R1 or R2), **P1** = next, **P2** = later.
- Effort, normalised across the six areas (they used slightly different scales): **S** = up to about 2 days,
  **M** = up to about 2 weeks, **L** = more than 2 weeks, each for one engineer agent.
- Mode: **store**, **landing**, **both** (store and landing tenants) or **platform** (owner/console only).

---

## 1. Owner summary (plain English)

1. Store Gen becomes one website that hosts many shops. Each seller signs up, chooses "full store", "landing pages" or
   both, and gets their own space, their own team and their own data, fully separated from other sellers.
2. Your main domain is the platform: the home page, sign-up, the sellers' dashboards and your own control room.
   Every shop gets an address like `myshop.yourdomain.com`. Shops can connect their own domain later.
3. Hostinger alone can't create those shop addresses. The fix is cheap: buy a domain and put it on free Cloudflare.
   A small Cloudflare script then sends every shop address to your single Hostinger app. Until you buy the domain,
   shops work on the temporary address as `.../s/myshop`.
4. You approve every new account. Sellers can build and preview straight away. They can publish and take orders only
   after you approve them. Each sign-up arrives with a risk score that explains itself.
5. In your control room, every shop has a profile: orders, sales, confirmation and delivery rates, team, activity log,
   usage, integrations, domains, AI use, risk and your private notes. You can suspend, restore, export or view any
   shop (read-only, time-limited, and the shop is told).
6. Shops get a real call center. Agents press "Next order", call or WhatsApp, follow a script, and log every attempt.
   Phone numbers stay hidden until the agent calls. Agents are paid per delivered order, not per confirmation.
7. Shops get real accounting: product cost, delivery and return fees, ad spend, expenses and agent pay. The headline
   numbers are profit per delivered order and true ROAS. Carrier payment statements are matched against orders,
   so the seller sees the cash still held by each carrier.
8. Integrations: Google Sheets for each shop, signed webhooks (Zapier, Make, n8n), Telegram alerts and WhatsApp
   messages, delivery companies (CSV first, then APIs as carriers give us their docs), and ad events sent at order,
   confirmation or delivery.
9. Design stops repeating itself. Every page and shop gets a "design DNA" built from strong choices: layout, fonts,
   colours, image style and voice. The system checks that no new shop is too close to another shop on the platform.
10. Automatic design checks block the "AI look" before publishing: too much glass, the same radius everywhere, copied
    card grids, clichéd phrases. Most problems are fixed automatically.
11. A logo designer draws real letter shapes (Arabic and Latin done correctly) with one deliberate design idea, and
    exports logo, favicon, social images and app icons.
12. AI is fast everywhere: an instant draft appears first and better text streams in on top. It runs on the seller's
    computer when it can and on an optional, clearly marked cloud AI when the device is weak.
13. The AI "learns from your results" rather than retraining itself: it remembers each shop's edits, favours designs
    and copy that bring delivered orders, and every change is tested before release. Shoppers' private data never
    goes to the cloud AI.
14. What you buy: a domain (a .com is the safest choice), a free Cloudflare account, and later $5/month of Cloudflare
    Workers once shop traffic grows. You may also turn on the cloud AI key, which costs about $9 per active shop per
    month (estimate).
15. Plan: R1 = the platform with landing-page shops, the call center, approvals and your control room, on your new
    domain. R2 = full shops, accounting, logo designer. R3 = custom domains, carrier APIs, the WhatsApp bot, reviews,
    tests and learning.

---

## 2. Key decisions

"Conflict" rows record where two area files disagreed and how this file resolves it. The architect should treat
these as settled unless new evidence appears.

| # | Topic | Decision | Why | Conf. | Source |
|---|---|---|---|---|---|
| D1 | Store subdomains | Cloudflare zone (Free) with a proxied `*` record and a ~60-line Worker on `*.<domain>/*`. The Worker forwards to the one hostname Hostinger knows (the apex), adding `x-sg-host`, `x-sg-edge` (a shared secret) and `x-sg-ip`. `www` 301s to the apex at the edge | Hostinger has no wildcard subdomains or wildcard SSL. The account is at the 5 Node app cap [MCP]. Each Hostinger hostname probably costs a Node process (~11 threads of a plan-wide NPROC 120). Host-header override is Enterprise-only (https://developers.cloudflare.com/rules/origin-rules/). Same-zone Worker fetches go to the origin (https://developers.cloudflare.com/workers/configuration/routing/routes/) | High | domains.md §2-3 |
| D2 | Hostinger-native subdomain or parked domain per store | Never for stores. At most 1-2 special names, after probe V2 | 5-app cap, a process per hostname, SSL setups per domain are rate-limited | High | domains.md §1.2-1.4 |
| D3 | Addressing modes | One route tree with three modes: P (path `/s/<handle>/…`, works today, permanent fallback), S (subdomain, when `STORE_ROOT_DOMAIN` and `EDGE_KEY` are set), C (custom domain, P1). Canonical order C > S > P. Other addresses answer 308 on GET/HEAD, keeping the full query string. Public POST APIs are accepted on every address a store owns. Temp-domain redirects are kept forever | Launch before buying a domain; ad links (`fbclid`, `ttclid`, UTM) never break | High | domains.md §4.4 |
| D4 | **Conflict: dashboard and console host.** platform-admin.md proposed `app.<domain>` and `admin.<domain>`; domains.md proposed the apex | **Apex for both at launch**: tenant dashboard `/app/<handle>/…`, platform console `/admin/**` behind today's gate, IP allowlist and mandatory staff 2FA. `app`, `admin` and `console` stay reserved labels. A separate console host (`console.<domain>` via the Worker plus `ADMIN_HOST` and a Server Actions `allowedOrigins` entry) is P1, after probe V3 | The apex is the only host that bypasses the Worker, so the Server Actions Origin check works unchanged (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md:13,40`). The shared-origin risk (TENANCY-MAP C7) ends once S mode is on: the apex then serves no tenant HTML, because `/s/` 308s to subdomains and builder or console previews render in sandboxed iframes | Medium-high | domains.md §3, §4.3; platform-admin.md §1, §21 |
| D5 | **Conflict: when public sign-ups open.** platform-admin.md suggested `closed` on the temp domain | Temp domain = path mode for the owner's store #1 and invited beta sellers (signup mode `invite`). Public sign-ups in `approval` mode open on the real domain with S mode on. The owner buys the domain during R1 | Path mode puts every store, its pixel scripts and the dashboards on one origin. Isolation then rests on CSP alone. A real domain gives each store its own origin | High | domains.md §4.5; platform-admin.md §5.1, §21 |
| D6 | Proxy role | `proxy.ts` only parses hosts and rewrites (`/s/<h>`, `/_d/<host>`). DB lookups (host to store, LRU) happen in route handlers. `effectiveHost()` is the single source of truth: it trusts `x-sg-host` only after a constant-time `x-sg-edge` match, strips client-sent `x-sg-*`, and supports `EDGE_KEY_PREV` rotation | Next 16 proxy runs on Node, `runtime` config is not allowed, and the docs say not to rely on shared modules or globals (`proxy.md:19, 253-255`) | High | domains.md §4.1-4.2 |
| D7 | Cookies and CSRF | `__Host-cs` and `__Host-csg` stay host-only on the platform host and never get `Domain=.<root>`. Store hosts get no Cookie header and 404 `/admin`, `/app`, `/api/app`, `/s/`, `/_d/` and `Next-Action` POSTs. CSRF stays strict same-origin (`src/lib/security/csrf.ts:48-56`), never "same-site" | Subdomains are same-site with the dashboard. `__Host-` cookies can't be tossed from a subdomain | High | domains.md §4.5 |
| D8 | Order API and CSP per host | Replace `selfHosts()` (`src/lib/orders/origin.ts:94-110`, trusts any Host or X-Forwarded-Host) with `storeHosts(storeOfPageKey)`. The document CSP adds the effective host only when it came through the edge and maps to the served store. Add `STORE_ROOT_DOMAIN` to `sharedSuffix` | Store A's pages can't post store B's orders | High | domains.md §4.6 |
| D9 | **Conflict: custom domains.** platform-admin.md mentioned a manual hPanel attach | Cloudflare for SaaS custom hostnames (P1): 100 free, then $0.10 each per month (https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/). TXT pre-validation, cron polling, "make primary", daily DNS re-check. The console queue only shows requests and can require an admin approval. No hPanel step | hPanel parked domains have the same process and SSL costs as D2 | Medium-high | domains.md §5; platform-admin.md §5.4 |
| D10 | Hostinger CDN | Off for the real domain (Cloudflare is the CDN). It can stay as it is on the temp domain | Two caches in series mix hosts and break per-host CSP and IP hops | Medium | domains.md §3 |
| D11 | Media | A filesystem media backend outside the deploy-wiped folder (`MEDIA_DIR`, boot check refuses a path inside the build) with per-store byte quotas, in R1. In S and C modes, publish absolute platform-origin `/media/<key>` URLs behind a Cloudflare cache-everything rule | 3 GB DB quota, and Hostinger suspends writes, orders included, at the cap. Image requests then don't count against the Worker quota | High | TENANCY-MAP §1.2.9, §11.1; domains.md §3 |
| D12 | Signup mode and approval | `approval` mode: anyone signs up (Turnstile). The account and first store start as a **pending sandbox**: build, generate and preview are allowed; publish, orders, Sheets, pixels, PHP export and domains are denied by entitlement. Explainable `scoreSignup()` (the `scoreRisk` pattern, `src/lib/orders/risk.ts:42`). Nothing is auto-rejected at launch | Keeps scam and phishing stores off the shared domain without losing sellers to waiting | High | platform-admin.md §5 |
| D13 | Store lifecycle | `pending → active ⇄ restricted ⇄ suspended → closed → scheduled_deletion → purged`, plus `rejected`. Each state has a fixed public, API, dashboard and cron behaviour. Purge runs in cron slices, never as a cascade. Step-up 2FA for suspend and close, four-eyes or a 24 h delay for purge | Separates soft problems from fraud; safe on a 120 s, cron-only host | Medium | platform-admin.md §7 |
| D14 | Impersonation | Read-only "View as store" by default, with a reason, 30 min (60 max), a ribbon, both identities in the audit and a store notification. Write access needs an owner support grant (P1) | WorkOS, GitHub and Shopify collaborator patterns. Server actions are callable by id, so read-only is enforced in `storeAction` | High | platform-admin.md §9 |
| D15 | Plans and quotas | `plans` + `store_entitlements` (override > boost > plan) + `store_usage` + `store_subscriptions(provider='manual')`, all behind one `entitlement(store, key)`. **Orders are never blocked by a quota**, only creation actions | Fair use of one 3 GB DB and one process; billing plugs in later | High | platform-admin.md §8 |
| D16 | PII in the console | Masked by default. One-order reveal needs a reason, step-up TOTP and an audit row. No bulk PII export for support | The owner sees "every detail" without leaking customers on every screen | High | platform-admin.md §15 |
| D17 | Order status model | Three axes (`confirm_state`, `ship_state`, `money_state`) behind a state machine. The legacy `orders.status` becomes a derived projection, and new labels (refused, duplicate, unreachable, in_transit) are only appended | Refused vs returned and remitted vs delivered are where COD money is lost. Sheets, CSV and the PHP export depend on the 9 legacy labels (`src/lib/orders/contract.ts:304-314`) | High | cod-ops.md §2.2 |
| D18 | Order timeline | Append-only `order_events`, indexed `(store_id, order_id, at)` and `(store_id, actor_id, at)`: the single source for the drawer, KPIs, commissions, audit and AI training | Today only a generic audit row exists (`src/lib/orders/admin.ts:193-194`) | High | cod-ops.md §2.3 |
| D19 | Agent assignment | Pull-based "Next order" claim queue with 10-minute leases through an atomic `UPDATE … LIMIT 1` with a claim token, plus round-robin and later rules | MariaDB 10.4 has no `SKIP LOCKED` (added in 10.6), and there are no workers | High | cod-ops.md §3.2 |
| D20 | Commissions | Default = an amount per delivered order: accrued as pending at confirmation, earned on delivery, voided on refusal, return or cancel | Paying on confirmation rewards forced confirmations that come back as paid returns | High | cod-ops.md §3.5 |
| D21 | Carriers | A `CarrierAdapter` interface with capability flags. R2 = a manual CSV adapter (manifest presets, tracking, status and remittance imports). Sendit is the first API adapter (P1), built only from docs the carrier hands over | No Moroccan carrier publishes official API docs. Sendit's endpoint names are visible only through its official plugin | High | cod-ops.md §4 |
| D22 | **Conflict: delivery fees.** storefront.md put the per-city delivery line at P0; cod-ops.md put per-city fees at checkout at P1 (PHP export parity) | One shopper-facing `delivery_zones` model (city groups: fee, free-from threshold, ETA range, not served; owner-typed, empty by default). P0: the ETA and fee line shows on PDP, landing and form, and store-mode checkout (payload v3) charges the zone fee. Landing pages keep charging their flat page fee until P1 (a runtime v3 chunk plus PHP parity); while zones are on, the landing line shows the page's real fee, never a different one. Cost-side carrier fees live in a separate `carrier_rates` table (accounting) | Trust and fewer refusals now, without breaking the frozen landing runtime (24.2 KB, 30 B headroom, LND-16) or the PHP export | Medium-high | storefront.md §4.6; cod-ops.md §4.4 |
| D23 | Purchase event timing | Per store or page: Purchase at order (today), at confirmation, or at delivery. Custom `ConfirmedOrder` and `DeliveredOrder` events are sent anyway, with a deterministic event id. Events older than 7 days are filtered for Meta (dropped, or sent to an offline dataset) | Ads optimise on real buyers. One stale event fails Meta's whole request (https://developers.facebook.com/docs/marketing-api/conversions-api/offline-events) | Medium | cod-ops.md §6.4 |
| D24 | Google Sheets scale | Per-store config with ownership proof, a store-scoped pull, a per-tick request budget with round-robin and batching. A store-owned service account is P1 | 60 req/min per user per project: one platform service account is a single shared quota (https://developers.google.com/sheets/api/limits) | High | cod-ops.md §6.1 |
| D25 | Async work | One DB outbox pattern (drained by `after()` and the 5-min cron, exponential backoff, dead letters, replay) for webhooks, carrier pushes, CAPI retries, WhatsApp and mail | No Redis or workers. The pattern already exists for Sheets (`src/lib/orders/http.ts:51-63`) | High | cod-ops.md §6.2 |
| D26 | Accounting core | A cost snapshot on each order at shipping, `carrier_rates`, `ad_spend_daily` (manual + CSV), `expenses`, a `finance_daily` rollup. Headline KPIs: cost per delivered order, true ROAS, contribution margin, break-even CPA. Remittance import is **CSV only** at P0 (XLSX P1) | COD profit depends on outcomes and fees. A new parser dependency is slow to install here | High | cod-ops.md §5 |
| D27 | Meaning of "always training" | Weights are never trained on the server. Improvement comes from four loops: brand memory, retrieval exemplars, Thompson-sampling priors on genes, and an eval harness that gates every prompt or model change. A consented export for an off-platform fine-tune is P2. UI wording: "learns from your results" | No GPU, ~3 GB RAM, 120 s request cap (`src/app/api/cron/tick/route.ts:25`) | High | ai.md §2 |
| D28 | **Conflict: local-first vs fast everywhere.** The brief keeps local in-browser AI as the default; the owner now wants AI "fast everywhere" | One `AiProvider` interface with the ladder **server (optional, "Cloud AI" chip) → local worker → rule-based library**. The server provider ships **disabled** until the owner sets the key and a monthly cap. Store default "Auto" = local when the device tier allows, cloud only for weak devices, phones and server-only tasks. "On-device only" store mode is enforced server-side | Keeps the privacy-first default and the guaranteed library floor. Phones can't reasonably download 0.9-2.2 GB models (`src/lib/ai/capabilities.ts:6-8`) | High | ai.md §3 |
| D29 | Cloud model and settings | `@anthropic-ai/sdk`. The model id is a platform setting, default `claude-opus-5-5`. `effort: "low"` on interactive routes, medium for blueprint, logo and critique, high for batch work. `messages.parse` with a **loose** schema; lengths are enforced afterwards by `mergeAiCopy`/`fitText`. No forced `tool_choice`, no prefill. Prompt caching of a ≥512-token stable prefix; Batches (50%) through the cron. Fast mode off by default | The API drops min/max length constraints, and forced tool_choice and prefill return 400 on Opus 5.5 | High | ai.md §3.2-3.3 |
| D30 | Honesty guard | Every output, from any provider, passes the Zod contracts and `mergeAiCopy`/`cleanAiText` (`src/lib/ai/guard.ts:27-98`). Suggested facts from photos count only after the owner ticks them | The guard is the single honesty choke point (owner rule: never invented data) | High | ai.md §0.3 |
| D31 | Customer PII and AI | Customer names, phones, addresses and notes are never sent to the server provider by default; risk and insight features get pseudonymised or aggregated features. Untrusted text goes only in delimited data blocks. Copilot writes are proposals executed after a click, with scope taken from the session | Morocco Law 09-08 restricts transfers abroad; OWASP LLM01 | High | ai.md §7 |
| D32 | Learning reward | Delivered orders per unique visitor, per version and variant, smoothed. Confirmed orders are the interim proxy. Blend with owner signals (chosen, kept unedited) at about 0.4/0.6 once market data exists **[unverified start values]** | Raw COD orders are inflated by fakes. `orders.version_id` already ties outcomes to versions | Medium | ai.md §4.2 |
| D33 | **Merged: gene statistics.** design-gen.md (`gene_stats`) and ai.md (`ai_gene_stats_store`, `platform_gene_stats`) proposed the same thing twice | One learning store for design and copy genes: per-store Beta posteriors with hierarchical shrinkage from platform priors, plus k-anonymous (k ≥ 5 stores) opt-in platform aggregates with no store ids. The performance signal counts only after a minimum sample (start at 300 visits per value **[to tune]**). The learned bonus is capped at about 25% of the rank score, and one direction of three is always exploration | One loop, one schema, no convergence onto "the winning look" | Medium | design-gen.md §8; ai.md §4.4, §4.7 |
| D34 | Retrieval | P0 = structured keyed exemplars in MariaDB. P1 = browser-computed multilingual embeddings stored as int8 BLOBs with brute-force cosine per store | MariaDB 10.4 has no VECTOR type (it arrived in 11.7) | High | ai.md §4.6 |
| D35 | Design Genome | The archetype becomes a **prior**, not a preset. About 31 genes in three levels (brand, page, section), stored as versioned JSON that compiles to today's `ThemeSpec` plus overrides; old pages get a back-derived genome. Only the bold genes (composition grammar, type pairing, colour strategy, image treatment, voice) are sampled; the rest come from a seeded constraint solver | Sameness comes from archetype locks (`src/lib/theme/tokens.ts:419-433`), 3 storylines (`src/lib/generator/plan.ts:90-97`) and anti-repeat only among sibling directions (`src/lib/generator/directions.ts:455-470`) | High | design-gen.md §1, §3 |
| D36 | Anti-repetition | A weighted genome distance: platform-wide ≥ 0.25, same niche ≥ 0.40, pages of one store ≥ 0.30 **[thresholds to calibrate on ~200 pages]**. Checked server-side by brute force, returning scores only. A per-store brand seed, a genome reservation while a store is live, a novelty budget (P1) and a MAP-Elites archive that direction 3 explores (P1) | Makes "never two near-identical stores" a checkable rule | Medium | design-gen.md §4; storefront.md §7 |
| D37 | **Conflict: cross-tenant headline check.** ai.md placed it in the P2 opt-in pattern library | P0, inside the copy cliché detector: MinHash over hashed shingles only, no plaintext and no store ids. It only says "too close" | Owner item 8 needs it at launch, and it leaks no content, so it needs no opt-in | Medium | design-gen.md §4.4; ai.md §4.7 |
| D38 | DESIGN.md v3 | Turn the 2026 "AI tells" into budgets: glass ≤ 2 per page, a 4-tier radius ladder, one hero signature + ≤ 3 secondary details, bento ≤ 1 section, ≤ 2 centred sections in a row, no bounce outside the playground archetype. Remove the orange-family colour words (GEN-14) | The current bible prescribes several patterns that anti-slop sources flag | High | design-gen.md §2 |
| D39 | Quality gates | Pure-TS static gates on PageDoc + BuiltTheme + asset metadata at generate, save and publish (contrast, grid, radius ladder, rhythm, density, image fit, RTL, no-orange, slop score, copy cliché and specificity). Deterministic repairs first. Screenshot checks only in local/CI Playwright | No headless browser or workers on Hostinger; static gates take milliseconds | High | design-gen.md §5 |
| D40 | Logo engine | Never live text. Shape with harfbuzzjs (Arabic joining, kerning), outline to SVG paths, optical spacing, exactly one craft move, monograms on a construction grid. No badges, seals or hand-drawn marks. The LLM may propose parameters (P1); a deterministic engine renders them | Today's favicon is `system-ui` text that varies per OS (`src/landing/document.tsx:189-201`). opentype.js has no Arabic joining | High | design-gen.md §7 |
| D41 | Store coherence | One Brand Genome per store across three registers (marketing, commerce utility, transactional). Landing pages choose `store` (inherit) or `campaign` (page genes vary within a brand radius ≤ 0.35) | One brand everywhere while landing pages still vary | High | design-gen.md §6 |
| D42 | Store page rendering | Catalog pages render on request, cached by `(storeId, path, locale, catalog_version)` with ETag and a byte-bounded LRU. Landing pages stay static at publish; a product → landing dependency index re-renders attached landings | Correct invalidation on one Node process without a queue | Medium-high | storefront.md §10 D2 |
| D43 | Store runtime | Separate runtime chunks per capability (cart ≤ 6 KB, checkout ≤ 8 KB, search ≤ 5 KB gz **[proposal]**). The landing chunk stays frozen at 24.2 KB. PageDoc v2, runtime config v2, payload v2 and the PHP export are frozen; stores add payload v3 | LND-16: the landing chunk is within 30 B of its budget | High | storefront.md §10 D1; TENANCY-MAP §1.2.10 |
| D44 | PDP buy model | Per store: inline COD form (default for ≤ 3 products or ad-driven stores) or cart + "buy now" one-page checkout, both on payload v3 with server re-pricing | Most COD orders are single-product ad clicks | Medium | storefront.md §10 D3 |
| D45 | Checkout fields | Morocco: name, phone, city combobox, one-line address, optional note. EU: street, postal code, city. Correct autocomplete tokens, `dir=ltr` phone field inside RTL | Baymard: field count drives usability; COD has no payment step | High | storefront.md §4.5 |
| D46 | Reviews | Badges, `aggregateRating` and JSON-LD only from verified delivered orders. Imports are allowed but labelled and excluded from the aggregate. Sample reviews, stats and social proof can't be published on SaaS stores: the checklist warning (`src/lib/editor/checklist.ts:142-152`) becomes an error | EU Omnibus Annex I 23b; owner rule | High | storefront.md §4.9 |
| D47 | **Merged: A/B tests and the live bandit.** storefront.md (fixed-horizon A/B, private cache) and ai.md (Thompson bandit) proposed two systems | One **Experiments** engine (P1) with two modes: **Fair test** (fixed split and horizon, minimum sample, no early winner; the default) and **Auto-optimize** (Thompson weights from the cron, 10% floor per arm). In-page variants (headline, hero, offer display) are chosen client-side from a cacheable weights JSON, so HTML stays cacheable. Whole-page versions use URL split or `Cache-Control: private` only while a test runs. Price and offer terms are never varied | One engine, honest stats by default, spend-shifting when the seller wants it | Medium | storefront.md §5.2 L5; ai.md §4.4B |
| D48 | **Conflict: stock timing.** storefront.md reserved stock at order creation; cod-ops.md decremented at confirmation | A soft hold at order creation that expires or is released on cancel, fake, unreachable or refusal; the hard decrement happens at shipping. P1 | Many COD orders never ship, so holding stock hard at order time shows false "sold out" | Medium | storefront.md §8; cod-ops.md §8.1 |
| D49 | SEO for attached landings | A landing attached to a product defaults to `noindex` + canonical to the PDP, with an owner toggle. No automatic language or geo redirect: an `Accept-Language` chip and `hreflang` | Avoids duplicate content and keeps shared caching | Medium | storefront.md §10 D7-D8 |
| D50 | Realtime | Visibility-aware 15 s polling of cheap cached pulse endpoints. SSE only after a test shows Hostinger's proxy doesn't buffer it. A DB-backed notification centre | 120 s request cap, no inbound WebSockets (https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/) | Medium | platform-admin.md §10.3 |
| D51 | Email | Hostinger SMTP through a `mail_queue` drained by the cron with per-minute caps, transactional only (R2). In R1, invites are copy-link and password resets are admin-assisted | No email exists today; Hostinger limits are low (200/h and 5/min cited **[unverified for Business]**) | Medium | platform-admin.md §11 |
| D52 | Backups | R1: a per-store export ZIP plus cron-sliced logical JSON dumps of critical tables outside `public_html` (7 daily, 4 weekly). The owner keeps `APP_SECRET` offline. Off-site copy and restore drill later | Hostinger backup coverage is unverified; orders are the seller's business | Medium | platform-admin.md §18 |
| D53 | Handles | 3-30 chars `[a-z0-9-]`, no `--` at positions 3-4, an infrastructure reserved list plus a brand-protection deny list, 12-month rename 308s, 180-day quarantine after deletion, neutral 404/410/503 pages | Wildcard DNS removes dangling-DNS takeover; the remaining risks are re-registration and look-alike phishing | Medium | domains.md §4.8 |

---

## 3. Unified feature catalog

Deduplicated across the six areas. "R" = target release (§4). Features that two areas both proposed appear once, and
the merge is noted in the scope.

### 3.1 Platform (sign-up, approval, plans, lifecycle, console)

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| PL-01 | Signup modes | P0 | S | platform | R1 | `closed / invite / approval / waitlist / open` setting; hashed, expiring invite codes |
| PL-02 | Pending-store sandbox | P0 | M | platform | R1 | A `pending` plan: build and preview allowed; publish, orders, Sheets, pixels, PHP export and domains denied; private preview link; reduced media quota |
| PL-03 | Signup risk score | P0 | M | platform | R1 | `scoreSignup` → `{score, flags}`: vendored CC0 disposable list, MX lookup, protected-brand substring match, identity-link hashes, velocity, Turnstile, bot UA |
| PL-04 | Approval queue | P0 | M | platform | R1 | Keyboard triage, split view with the draft preview and the signup cluster, approve / request info / reject + block / snooze, bulk fast lane, SLA tile, one appeal. Later also carries go-live, custom-domain and plan requests |
| PL-05 | Platform pulse overview | P0 | S | platform | R1 | KPI row, a "needs attention" list, a live activity feed |
| PL-06 | Stores list | P0 | M | platform | R1 | Filters by status, mode, plan, market, risk, "needs attention"; health chips; quota and sync-error flags |
| PL-07 | Store profile | P0 | L | platform | R1 | Tabs: Overview KPIs, Orders (masked), Catalog and pages (takedown), Team (platform actions), Activity, Usage and plan, Integrations health, Domains, Risk snapshot, Notes. The Ops tab (rates, agents, carrier/Sheets/webhook health, remittance ageing, aggregates only) fills in as R2 data lands |
| PL-08 | Lifecycle state machine | P0 | M | platform | R1 | 8 states with the behaviour table, reasons, notifications, audit, cached status checks, purge in cron slices, tombstones (D13) |
| PL-09 | Store export ZIP | P0 | M | both | R1 | Orders and leads CSV, products JSON, pages HTML + doc, media, settings without secrets, audit; cron-built; signed 24 h link |
| PL-10 | Read-only "View as store" | P0 | M | platform | R1 | Impersonation session row, reason, 30/60 min, ribbon, server-side write refusal, store notification (D14) |
| PL-11 | Plans, entitlements, usage meters | P0 | M | platform | R1 | `plans`, `store_entitlements`, `store_usage`, `store_subscriptions(manual)`, `entitlement()`, `QuotaError` UX; orders never blocked (D15) |
| PL-12 | Kill switches | P0 | S | platform | R1 | Signups, publishing, AI, Sheets, CAPI, uploads, platform read-only (orders keep flowing) |
| PL-13 | Notification centre | P0 | S | both | R1 | `notifications` table + bell, lazy fan-out of broadcasts; kinds for orders, risk, sync, quota, approval, support |
| PL-14 | Platform settings + legal templates | P0 | M | platform | R1 | Brand, signup, thresholds, reserved handles, protected brands; ToS, Privacy, AUP, DPA and store legal templates in ar/fr/en; `legal_acceptances`. The rebrand must not touch the HKDF salt or purpose strings |
| PL-15 | Support grants + break-glass write | P1 | M | platform | R3 | Owner grants scoped write access for 24/72 h; super-admin emergency write with a red ribbon |
| PL-16 | Tickets inbox | P1 | M | both | R3 | Auto-context, macros in ar/fr/en, assignment, SLA, appeals, view-as from a ticket |
| PL-17 | Broadcasts and changelog | P1 | M | platform | R3 | Targeted announcements, maintenance banners, a "What's new" drawer, seen/click counts |
| PL-18 | Store health score + dormancy | P1 | S | platform | R3 | Weighted ring in the lists; 60-day dormant tag |
| PL-19 | Global analytics | P1 | M | platform | R3 | Activation funnel, placed/confirmed/delivered GMV clearly labelled, mode mix, section usage; `store_daily_rollup`; k ≥ 5 suppression |
| PL-20 | Abuse reports + takedowns | P1 | M | both | R3 | Public "Report this store" link, queue, page and media takedown |
| PL-21 | Ownership transfer | P1 | S | both | R3 | Audited transfer confirmed by both people |
| PL-22 | Full UTS #39 skeletons + mixed-script check | P1 | S | platform | R3 | Vendored `confusables.txt` **[unverified size]** |
| PL-23 | Manual billing, then a payment provider | P2 | M | platform | later | `payments_manual`; provider on `store_subscriptions` (Moroccan providers **[unverified]**) |
| PL-24 | Web Risk URL checks, VPN/ASN signal | P2 | M | platform | later | Optional Google Cloud key; ASN dataset if a reliable free one exists |
| PL-25 | Help centre + CSAT | P2 | M | both | later | In-app articles, one-tap rating |

### 3.2 Tenancy and team

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| TN-01 | Tenant model | P0 | L | both | R1 | `stores`, `store_members`, `store_invites`, `store_settings`; `store_id NOT NULL` with no default and FK RESTRICT everywhere; uniques become `(store_id, …)` (TENANCY-MAP §1.2.1) |
| TN-02 | One store-scope seam | P0 | M | both | R1 | `requireStoreMember`, `storeAction`/`storeGuard`; every by-id query adds `AND store_id = ?` |
| TN-03 | Store #1 migration | P0 | M | both | R1 | The current single store becomes store #1 (mode landing, `Africa/Casablanca`, MAD) |
| TN-04 | Settings split | P0 | M | both | R1 | Platform vs store settings; cache key `${storeId}:${key}`; encryption purpose `settings:${storeId}:${key}`; `platform_ai` / `store_ai` |
| TN-05 | Public auth | P0 | M | both | R1 | `/login`, `/signup`, `/invite/<token>` with Turnstile, a scrypt semaphore and `locked_until` enforced (AUTH-25/26/27) |
| TN-06 | Invites | P0 | M | both | R1 | Hashed, expiring, one-time link tokens (copy link in R1, email in R2); never temporary passwords |
| TN-07 | Multi-store membership + store switcher | P0 | S | both | R1 | One user in several stores; password, 2FA and ban are platform-only |
| TN-08 | Store roles | P0 | M | both | R1 | owner / admin / manager / agent / logistics / editor, with new permissions (`orders.assign`, `orders.reveal_phone`, `orders.export`, `orders.force_status`, `shipments.write`, `finance.*`, `payouts.approve`, `integrations.manage`, `ai.use`) |
| TN-09 | Store mode | P0 | S | both | R1 | `store / landing / both`, gated by entitlement; a mode switch hides data and never deletes it |
| TN-10 | Tenancy test gate | P0 | M | both | R1 | Static lint for unscoped queries and caches, a DB-backed two-store attack suite, a server-action replay; fails the build (TENANCY-MAP §10) |
| TN-11 | Store-qualified caches, locks and rate buckets | P0 | S | both | R1 | Every `globalThis.__cod*` cache and bucket keyed by store (TENANCY-MAP §7.5-7.6) |
| TN-12 | Accountant and viewer roles | P1 | S | both | R2 | Finance read/write without customer phones; dashboards only |
| TN-13 | Store-level "require 2FA for members" | P1 | S | both | R3 | Enforced at the membership check |
| TN-14 | External confirmation-team membership | P2 | M | both | later | An outsourced call center invited as a team with its own manager |

### 3.3 Store (storefront)

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| ST-01 | Catalog | P0 | L | store | R2 | `products` / `collections` reusing the Offers v2 `Item`/`Offer` schema and the pricing engine unchanged; inventory counters |
| ST-02 | Store page kinds + chrome | P0 | L | store | R2 | home, collection, product, page, policy, cart, checkout, search, 404; `StoreRenderContext`; navHeader (bar / centred / drawer), footer, menus editor, announcement bar, branded 404 |
| ST-03 | productCard + productGrid + collection page | P0 | M | store | R2 | Card variants, grid/carousel/bento/editorial, sort, load-more with real URLs, bestsellers from real order counts |
| ST-04 | PDP anatomy | P0 | L | store | R2 | Gallery with a video slot, price with a genuine compare-at, Offers v2 pack picker, options, inline COD form or cart, delivery line, trust row from facts only, sticky buy bar (`src/landing/runtime/sticky.ts`), ProductGroup JSON-LD |
| ST-05 | Cart + one-page COD checkout + payload v3 | P0 | L | store | R2 | Separate cart chunk, store-keyed storage, integer cents from `page/pricing.ts`, stale detection on `catalog_version`, per-line server re-pricing, zone fee charged (D22) |
| ST-06 | Checkout field model + phone and city UX | P0 | M | store | R2 | Market-driven fields, autocomplete tokens, Arabic-digit-safe phone with as-you-type format, city combobox over the 147 cities with folded matching |
| ST-07 | On-request render cache | P0 | M | store | R2 | `(storeId, path, locale, catalog_version)` ETag + LRU; product → landing dependency index (D42) |
| ST-08 | Store SEO | P0 | M | store | R2 | Organization / WebSite / Product(Group) JSON-LD, clean URLs `/p/…` and `/c/…` with redirects, OG per kind, never a stale `priceValidUntil` |
| ST-09 | Home grammar, 4 archetypes | P0 | M | store | R2 | Hero product, category bento, editorial lookbook, catalogue-dense, built on the design grammar (DG-04) |
| ST-10 | Accessibility AA pass | P0 | M | both | R2 | Dialogs, focus, announced errors, reduced motion, an automated check in the render matrix |
| ST-11 | Filters, quick add, search | P1 | M | store | R3 | Client index ≤ 500 products, bottom-sheet filters, Arabic/Arabizi/accent-folded matching |
| ST-12 | Multi-locale siblings + hreflang + locale chip | P1 | M | both | R3 | Per-locale product text, no auto-redirect (D49) |
| ST-13 | Verified review collection | P1 | L | both | R3 | Signed post-delivery link, photo reviews, hide-only moderation with audit, "verified" badge, auto disclosure, "imported" label (D46) |
| ST-14 | Coupons | P1 | M | both | R3 | Server-validated codes, caps, real end dates |
| ST-15 | Stock soft hold + decrement at shipping | P1 | M | both | R3 | D48 |
| ST-16 | Size guide | P1 | S | store | R3 | Per-product chart, bottom sheet; the garment detector proposes an empty skeleton |
| ST-17 | ETA as dates | P1 | S | both | R3 | Cut-off hour, working days, a Moroccan holiday table |
| ST-18 | Speculation Rules + bfcache hygiene | P1 | S | store | R3 | `moderate` prefetch grid → PDP; no `no-store` on public pages |
| ST-19 | Home archetypes 5-8 | P1 | M | store | R3 | Drop, routine, gift guide, local maker (modern visuals only) |
| ST-20 | Breadcrumbs | P1 | S | store | R3 | Visible + BreadcrumbList JSON-LD |
| ST-21 | EU legal pack | P1 | M | both | at the first EU store (then P0) | 30-day lowest price, consent banner with Consent Mode v2, review disclosure, EU address fields, an AA gate |
| ST-22 | PWA per store, "my orders" with OTP, recently viewed, co-purchase cross-sell | P2 | M | store | later | Repeat-buyer features; OTP needs a messaging provider |

### 3.4 Landing pages

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| LP-01 | Keep every landing feature, store-scoped | P0 | M | landing | R1 | 27 sections / ~91 variants, Offers v2, options, 4 form variants, leads, idempotency, pixels + CAPI, builder, versions, exports (TENANCY-MAP §8.3); contracts frozen (D43) |
| LP-02 | Block publishing sample reviews, stats and social proof | P0 | S | both | R1 | The checklist warning becomes an error on SaaS stores (D46) |
| LP-03 | Delivery promise line by city | P0 | M | both | R1 | `delivery_zones` (owner-typed, empty by default); ETA + fee line on landing, PDP and form (D22) |
| LP-04 | Thank-you: "Confirm on WhatsApp" + expectation block + tracking link | P0 | S | both | R1 | wa.me prefilled with the order id; the store's real confirmation number and hours; a signed tracking link |
| LP-05 | Order tracking page | P0 | M | both | R1 | Order number + last 4 phone digits, or the signed link; status timeline; change or cancel request before shipping; `noindex`; rate-limited |
| LP-06 | Abandoned-lead recovery inbox | P0 | M | both | R1 | Leads per store with the selection, one-tap agent WhatsApp message, statuses, retention purge, attribution when the phone later orders |
| LP-07 | Attach a landing to a catalog product | P0 | M | both | R2 | `product_id` reference; shared price, options and stock; campaign offers built only from the product's items; `noindex` + canonical to the PDP by default (D49) |
| LP-08 | Campaign vs inherit theme mode | P1 | S | both | R2 | D41 |
| LP-09 | Experiments (Fair test + Auto-optimize) | P1 | L | both | R3 | D47 |
| LP-10 | Upsell → downsell chain + cross-store upsell | P1 | M | both | R3 | Max 2 steps, real windows; the agent sees the added lines |
| LP-11 | Live "Order on WhatsApp" option | P1 | S | both | R3 | A server-priced lead, then wa.me; the agent converts it in the admin |
| LP-12 | Short links with UTM presets | P1 | S | both | R3 | `/go/<code>` on the store host; a `go.<domain>` host is P2 |
| LP-13 | Scheduled campaigns | P1 | S | both | R3 | The cron applies scheduled versions, price changes and promo ends |
| LP-14 | Video-first hero, PDP video, UGC strip | P1 | M | both | R3 | Poster as LCP, deferred 9:16 clip, one video playing at a time |
| LP-15 | Per-page analytics with delivered rate | P1 | M | both | R3 | Views, form starts, orders and conversion by offer, UTM, variant and city, plus the refusal rate, from `stats_version_daily` (AI-12) |
| LP-16 | Per-city fees charged on landing pages | P1 | M | landing | R3 | A runtime v3 chunk + PHP export parity (D22) |
| LP-17 | Two-step form, quizzes, advertorial kind, build-your-box / multiple bumps, honest exit popup, section visibility by UTM or device, opt-in real "orders today" counter | P2 | M each | both | later | Validate each with Experiments first. Rejected outright: fake viewers, fake purchase toasts, resetting countdowns, invented stock |

### 3.5 Orders, call center and agents

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| OP-01 | 3-axis status + state machine + legacy projection | P0 | M | both | R1 | D17; forced moves need a reason and are audited |
| OP-02 | `order_events` timeline + internal notes | P0 | M | both | R1 | D18; shown in the order drawer |
| OP-03 | Agent claim queue | P0 | M | both | R1 | "Next order", 10-min leases, round-robin among online agents with caps, presence, calling window, rebalancing (D19) |
| OP-04 | Retry ladder, callbacks, outcomes, cancel reasons | P0 | S | both | R1 | A configurable 6-step no-answer ladder (defaults are reasoned, not researched), exact callback `due_at`, coded reasons |
| OP-05 | Call script panel (template) | P0 | S | both | R1 | ar/fr/en steps from the page doc and the stored order values |
| OP-06 | Store-wide duplicates + merge, customer profiles | P0 | M | both | R1 | Same E.164 phone with an open order in N days → flag or merge; "3 delivered, 1 refused" in the drawer |
| OP-07 | Phone masking + reveal audit | P0 | S | both | R1 | Masked lists; reveal on Call/WhatsApp writes `phone_revealed`; agents get no export and no sheet link |
| OP-08 | Manual / phone / DM orders + post-creation editing | P0 | M | both | R1 | Same validation and pricing; line edits re-priced and audited |
| OP-09 | Bulk actions + saved views | P0 | S | both | R1 | Assign, status, export, print; views by agent, city, risk, due |
| OP-10 | Agent KPIs | P0 | M | both | R1 | Confirmation rate, delivery rate, first-touch time, attempts per confirmation; `agent_stats_daily` |
| OP-11 | Manager board basics | P0 | S | both | R1 | Queue depth by state, oldest callback due, agents online (15-30 s polling) |
| OP-12 | Per-store blocklist | P0 | S | both | R1 | Fixes ORD-03; "block and cancel all open orders of this phone" |
| OP-13 | Address normalisation (rules) | P0 | S | both | R1 | Fuzzy city match with ar/fr transliteration over `cities-ma.ts` |
| OP-14 | Risk explanation (template) | P0 | S | both | R1 | Plain ar/fr reasons from `risk.ts` flags |
| OP-15 | Commission rules + earnings ledger + agent statement | P0 | M | both | R2 | Pay on delivered with clawback (D20); `agent_earnings`, `payouts`; a live statement for each agent; posts as an expense |
| OP-16 | Shipments + manual CSV carrier adapter | P0 | M | both | R2 | `CarrierAdapter` interface, manifest CSV presets, tracking and status import, picking list and manifest PDF (D21) |
| OP-17 | Keyboard-first agent console | P1 | S | both | R2 | N = next, C = call, 1-6 = outcomes |
| OP-18 | Assignment rules | P1 | M | both | R2 | By product, city, language, risk or value |
| OP-19 | Reveal-rate alarm | P1 | S | both | R2 | More than N reveals per hour → notify the manager |
| OP-20 | Sendit API adapter | P1 | M | both | R3 | Login, districts, create parcel, labels, webhooks; only after Sendit provides field-level docs |
| OP-21 | Carrier webhooks + tracking polling | P1 | S | both | R3 | Per-store hook keys; round-robin polling inside the tick budget |
| OP-22 | Returns and exchanges | P1 | M | both | R3 | Received / restock / damaged; re-shipment as a linked shipment |
| OP-23 | WhatsApp Cloud API confirmation bot | P1 | L | both | R3 | The store's own WABA, a utility template with Confirm/Cancel/Change, an inbound webhook, fallback to the call queue |
| OP-24 | High-risk confirmation (OTP / "reply 1") | P1 | M | both | R3 | Only for high-risk orders |
| OP-25 | Leaderboard, full manager board, payout batches, quality review | P1 | M | both | R3 | Opt-in leaderboard visibility |
| OP-26 | Carrier routing rules | P1 | S | both | R3 | City → preferred carrier, fallback |
| OP-27 | More carrier adapters (Ameex, Coliix, Ozon Express…) | P1-P2 | M each | both | R3+ | On owner demand, from carrier-provided docs only |
| OP-28 | Opt-in cross-store refusal network | P2 | L | platform | later | Hashed-phone aggregate counts; needs a Law 09-08/CNDP legal review first |
| OP-29 | VoIP click-to-call, number masking, recordings | P2 | L | both | later | A telephony provider linked to `order_events` |

### 3.6 Accounting

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| AC-01 | Product costs + packaging + cost snapshot | P0 | M | both | R2 | `product_costs` with history for catalog products and landing items; a snapshot frozen on the order at shipping |
| AC-02 | Carrier rates (cost side) | P0 | S | both | R2 | `carrier_rates` per carrier × city: delivery, return, COD fee; estimate vs actual from statements |
| AC-03 | Ad spend + expenses | P0 | S | both | R2 | `ad_spend_daily` (manual + CSV presets built from real samples), `expenses` with recurring rules and attachments |
| AC-04 | Profit dashboard | P0 | M | both | R2 | CPD, true ROAS, contribution margin, profit per delivered order, per product/day/page/campaign/city/carrier; day-level ad allocation; `finance_daily` |
| AC-05 | Break-even CPA calculator | P0 | S | both | R2 | Per product, at the store's own confirmation × delivery rates |
| AC-06 | Remittance reconciliation | P0 | M | both | R2 | CSV import with mapping presets, match by tracking, flags (unremitted, amount or fee differences, unknown lines), cash held by carrier ageing (0-7, 8-14, 15-30, > 30 days) |
| AC-07 | Accountant exports | P0 | S | both | R2 | Sales register, remittance report, expenses CSV |
| AC-08 | Campaign-level ad allocation | P1 | M | both | R3 | By `utm_campaign` / `utm_id` |
| AC-09 | Tax profile + reserve estimate, journal CSV, PDF P&L | P1 | M | both | R3 | "Estimation, consult your accountant"; rates from DGI **[verify]** |
| AC-10 | XLSX statement import | P1 | S | both | R3 | One vetted minimal dependency |
| AC-11 | Stock purchase log / inventory value | P1 | M | store | R3 | Purchased qty × unit cost |
| AC-12 | Ad spend API import (Meta/TikTok), multi-currency, FEC export | P2 | L | both | later | OAuth app review per platform **[unverified scope]** |

### 3.7 Integrations

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| IN-01 | Per-store Google Sheets + quota scheduler | P0 | M | both | R1 | Ownership proof, store-scoped pull, per-tick request budget, round-robin, batching; fixes SHT-01..11 (D24) |
| IN-02 | Purchase trigger setting + 7-day guard | P0 | M | both | R1 | D23 |
| IN-03 | Per-store pixel secrets | P0 | M | both | R1 | CAPI and Events tokens keyed `(store, pixel)` (PIX-01) |
| IN-04 | Telegram notifications | P0 | S | both | R1 | Port `cod_telegram` from the PHP export (`src/lib/export/templates/order.php:2632-2660`): new order, daily summary, sync errors, cash held > 15 days |
| IN-05 | WhatsApp click-to-chat templates | P0 | S | both | R1 | Prefilled per-locale messages, saved quick replies, attempt logging |
| IN-06 | Turnstile | P0 | S | both | R1 | One platform widget on the apex covers all store subdomains; per-store keys kept |
| IN-07 | Signed outbound webhooks | P0 | M | both | R2 | Standard Webhooks headers (HMAC-SHA256), outbox with backoff and replay, SSRF guard (https only, private ranges refused, no redirects), ≤ 10 endpoints, delivery log (D25) |
| IN-08 | Transactional email | P1 | M | platform | R2 | Hostinger SMTP via `mail_queue` (D51): verification, reset, approval and impersonation notices |
| IN-09 | Sheets upgrades | P1 | M | both | R2 | Pull notes, tracking, carrier and fee columns; tab routing per page; store-owned service account; label mapping |
| IN-10 | Store API keys + REST + inbound "create order" | P1 | M | both | R3 | Scoped hashed keys; Zapier/Make polling triggers |
| IN-11 | Catalog feeds (Meta, TikTok, Google) | P1 | M | store | R3 | Tokenised per-store feed URLs (field lists **[confirm with each platform]**) |
| IN-12 | Product CSV import (Shopify first) | P1 | M | store | R3 | Handle-grouped variants → products + Offers v2 items; SSRF-safe image fetch; sanitised HTML |
| IN-13 | TikTok offline events | P1 | M | both | R3 | **[Verify `event_source` values and windows]** |
| IN-14 | SMS gateway, Snap/GA4 server events, Apps Script real-time sheet push, Google OAuth sheet picker, native Zapier/Make apps, returns as negative events | P2 | M-L | both | later | After the P0/P1 base |

### 3.8 AI

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| AI-01 | Provider layer + router + metering | P0 | M | both | R1 | `AiProvider` (server/local/library), per-task ladder and store mode, "Cloud AI" chip, reserve-then-reconcile cost, credits (1 credit = $0.01), per-store daily caps, platform monthly cap + kill switch, `ai_runs`, `ai_cache` (D28-D29) |
| AI-02 | Page copy ar/fr/en with a Darija touch, streamed | P0 | M | both | R1 | Instant library draft, AI fields streamed over it, parallel locales on the server, guard applied (~$0.06 per locale **[estimate ±2×]**) |
| AI-03 | Speed kit | P0 | S | both | R1 | Classify and cut out when photos land, warm the VLM early, a consented local-model download card, deadlines with quiet fallback chips |
| AI-04 | Photo analysis + suggested facts | P0 | S | both | R1 | Local or server VLM; suggested facts need an explicit owner tick |
| AI-05 | Field-level rewrite | P0 | S | both | R1 | Shorter / more Darija / more premium / gift angle; low effort |
| AI-06 | Brand voice + explicit memory | P0 | S | both | R1 | Tone, formality, MSA/Darija ratio, words to use or avoid, CTA, the policies copy may state; replaces the hard-coded lines (`src/lib/ai/prompts.ts:99-103`, GEN-08) |
| AI-07 | Eval harness v1 + prompt versions | P0 | M | platform | R1 | About 60 fixtures incl. injection and medical-adjacent cases; deterministic scorers (invented numbers, banned words, language, length, no-orange, diversity); a gate on prompt and model changes; scorecards in the console |
| AI-08 | AI safety and isolation | P0 | S | both | R1 | Delimited data blocks, server-enforced PII policy, model text never rendered as HTML, all AI tables `store_id NOT NULL`, cross-tenant AI tests (D31) |
| AI-09 | SEO meta, alt and OG text | P0 | S | both | R2 | Per product, page and locale; Batches for catalogs |
| AI-10 | Catalog translation | P0 | S | store | R2 | Products, collections, policies |
| AI-11 | Store blueprint | P0 | M | store | R2 | Brand-kit brief, collections, home sections, about and policy drafts from stated facts only; novelty vs other tenants; falls back to generator rules without Cloud AI |
| AI-12 | Outcome data plumbing | P1 | M | both | R2 | `stats_version_daily` (views, uniques, form starts, orders, confirmed, delivered, returned), status-pull rollups, `genomeOf(doc)`, version id + `variant_key` on beacons and orders. In R2 so data accumulates before the learning loops start |
| AI-13 | Learned priors | P1 | M | both | R3 | One gene-stats system for design and copy (D33): Thompson sampling, hierarchical shrinkage, exploration slot, capped bonus, novelty penalty, per-store seed; a design-drift chart in the console |
| AI-14 | Learned brand memory + retrieval exemplars | P1 | M | both | R3 | Nightly distillation of edit diffs; keyed exemplars that rotate; a "What the AI learned" panel |
| AI-15 | Call-center scripts, AI-tailored | P1 | S | both | R3 | Objection answers and upsell line from facts and policies |
| AI-16 | Offer and pack advisor | P1 | S | both | R3 | Ranks pack structures; never invents prices |
| AI-17 | Weekly insights digest + "Today" brief | P1 | M | both | R3 | Batches over aggregates only; templates first |
| AI-18 | Copilot / ⌘K natural language | P1 | M | both | R3 | Strict tools with `tool_choice: auto`; read tools run, write tools return proposal cards; scope from the session |
| AI-19 | Design critique and repair | P1 | M | both | R3 | Structured summary in, ≤ 3 ops from a closed vocabulary out, validated by zod, kept only if the score rises; local or server (merges design-gen §5.4 and ai F-18) |
| AI-20 | Ad creative briefs | P1 | S | both | R3 | Hooks, angles, UGC scripts for Meta and TikTok, matched to the best-delivering variant |
| AI-21 | Local image studio | P1 | M | both | R3 | Backdrop, shadow, reflection, colour-matched stage from the cutout; batch mode |
| AI-22 | Semantic retrieval | P1 | M | both | R3 | Browser embeddings (multilingual-e5-small or embeddinggemma-300m, Arabic/Darija benchmark first) (D34) |
| AI-23 | Risk v2 + best call time + cancel-reason insights | P1 | M | both | R3 | Per-store logistic regression retrained nightly on outcomes, with a platform prior; explainable and advisory |
| AI-24 | Platform pattern library (k-anon, opt-in), prompt canary + judge calibration, fine-tune export + tuned local model (Atlas-Chat to evaluate for Darija), shopper assistant, generative imagery, Chrome built-in AI, bring-your-own key | P2 | M-L | both | later | Each gated on volume, consent or legal checks |

### 3.9 Design generation and logo

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| DG-01 | DESIGN.md v3 | P0 | S | both | R1 | Budgets, tells list, new genes, orange words removed (D38). Must land before any build agent reads the bible |
| DG-02 | Design Genome v1 | P0 | L | both | R1 | Schema, compile to ThemeSpec + overrides, back-derive old pages (D35) |
| DG-03 | Unlock archetype locks + radius ladder + glass budget | P0 | M | both | R1 | `tokens.ts:419-433`, archetypes, landing CSS (GEN-06) |
| DG-04 | Choreography grammar | P0 | M | both | R1 | Replaces the 3 storylines; hard COD invariants (form reachable from the hero CTA within the first 3 screens, offers before the final CTA, a colour moment in the top half, no same-background neighbours); reused by store page kinds |
| DG-05 | Brand seed + genome distance + reservation | P0 | M | both | R1 | `design_genomes` table, server-side distance service (D36) |
| DG-06 | Static quality gates + slop score + repairs + Design check panel | P0 | M | both | R1 | D39 |
| DG-07 | Copy cliché + specificity detector | P0 | M | both | R1 | ar/fr/en seed lexicons, structure tags in the copy library, MinHash near-duplicate check within the store and across the niche (D37) |
| DG-08 | Font pairing expansion | P0 | M | both | R1 | ≥ 8 pairings per archetype, Arabic roster review (OFL only, subsetting, ≤ 2 preloads) |
| DG-09 | Threshold calibration corpus | P0 | S | platform | R1 | About 200 generated pages to tune distances, Jaccard limits and gates before launch, plus a designer-seeded genome set |
| DG-10 | Logo designer v1 | P0 | L | both | R2 | HarfBuzz shaping and outlines, optical spacing, one craft move, monogram grid, small-size test, exports SVG / PNG / favicon / apple-touch / OG, 6 candidates in 3 families with locks and "more like this" (D40) |
| DG-11 | Store theme across registers | P0 | M | store | R2 | `store_theme`, `themeMode` store/campaign, register rules (D41) |
| DG-12 | Generation studio | P1 | M | both | R2 | Live direction previews with genome chips, a "why this design" line, gene sliders (boldness, density, warmth, motion), seed history |
| DG-13 | Visual CI | P1 | M | platform | R2 | Playwright msedge screenshots at 360/768/1440 in ar + fr: clipping, overflow, SSIM near-duplicates |
| DG-14 | Email / transactional token compiler | P1 | S | both | R2 | Inline styles; PNG logo; shared with the PHP export and packing slips |
| DG-15 | Section layout grammar | P1 | L | both | R3 | Slots × arrangements (stack, split, overlap, hang, bleed, index): about 10× the layout space |
| DG-16 | Novelty budget + MAP-Elites archive | P1 | M | both | R3 | 9 × 7 × 4 cells per niche; direction 3 explores an under-filled cell |
| DG-17 | Bilingual lockups + symbol grammar | P1 | M | both | R3 | Weight-balanced Arabic/Latin, golden tests on Moroccan names |
| DG-18 | LLM logo concept parameters | P1 | M | both | R3 | The model proposes parameters only; the engine renders |
| DG-19 | Squircle masks, optional vector-AI symbol provider (opt-in), brand guidelines export, motion signature editor | P2 | S-M | both | later | Polish and opt-in extras |

### 3.10 Admin UX

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| UX-01 | Onboarding wow flow | P0 | L | both | R1 | Mode cards → photos → AI analysis while name and handle are typed (live address preview + availability) → full-bleed reveal with alternate directions → Morocco defaults (delivery fee empty, never invented) → setup ring + "In review" pill |
| UX-02 | Store-scoped ⌘K (tenant + console) | P0 | S | both | R1 | Jump to order, store, user or ticket; create; run actions; approve next; fixes the ADM-02 search leak |
| UX-03 | Console identity | P0 | S | platform | R1 | Deep-ink base with a cyan/teal accent (OKLCH hue 190-230°), a permanent "Platform" badge, a violet impersonation ribbon with countdown |
| UX-04 | Admin upgrade | P1 | L | both | R2 | 3-input OKLCH theme (Linear method), density modes, ≤ 250 ms ease-out motion with no bounce, real-data-only KPI tiles and a COD funnel chart (orders → confirmed → shipped → delivered → cash), acting empty states, split views, undo toasts |
| UX-05 | Live address card | P1 | S | both | R2 | Copy link, QR code, WhatsApp share, test-order link |
| UX-06 | Realtime dashboards | P1 | M | both | R2 | D50; animated arrivals; an honest "live" dot |
| UX-07 | PWA + Web Push for owners and agents | P1 | M | both | R3 | App-shell cache without PII; VAPID push; agent queue on mobile (iOS push only for Home Screen apps) |
| UX-08 | Arabic RTL + French dashboard locales | P1 | L | both | R3 | Per-user admin locale (ADM-40) |

### 3.11 Security

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| SE-01 | Platform roles + mandatory staff 2FA + step-up | P0 | S | platform | R1 | super_admin / admin / support / analyst; `platformAction`; TOTP again within 5 min for dangerous actions |
| SE-02 | Host security rules | P0 | M | both | R1 | D7 + D8: `__Host-` cookies host-only, Cookie stripped on store hosts, strict same-origin CSRF, `storeHosts()` order-API binding, per-host CSP, `STORE_ROOT_DOMAIN` in `sharedSuffix` |
| SE-03 | Handle rules + reserved and brand deny lists | P0 | S | both | R1 | D53 |
| SE-04 | Platform audit + break-glass PII reveal | P0 | S | platform | R1 | `audit_log` gains `store_id`, `actor_kind`, `impersonator_id`; reveal with reason + step-up (D16) |
| SE-05 | Shared-origin hygiene | P0 | S | both | R1 | Store-keyed web storage (LND-12..14, GEN-03, LND-29), no tenant JS or HTML, console and builder previews only in sandboxed iframes |
| SE-06 | Close account-takeover paths | P0 | S | both | R1 | Password and 2FA resets become platform-only (AUTH-08/09/11), shipped with `store_members` |
| SE-07 | SSRF guard library | P0 | S | both | R2 | One guard for webhooks, image imports and feed fetches |
| SE-08 | Audit hash chain + break-glass review | P1 | S | platform | R3 | `prev_hash`/`row_hash` HMAC chain; weekly review view |
| SE-09 | Passkeys | P2 | M | both | later | WebAuthn for staff and sellers |

### 3.12 Ops (routing, edge, storage, jobs)

| ID | Feature | P | E | Mode | R | Scope |
|---|---|---|---|---|---|---|
| OS-01 | Path mode `/s/<handle>` | P0 | S | both | R1 | The only mode on the temp domain; a permanent fallback |
| OS-02 | Host router in `proxy.ts` | P0 | M | both | R1 | `effectiveHost`, host classes, internal rewrite, neutral 404s (D6) |
| OS-03 | URL builders + canonical 308 | P0 | M | both | R1 | `storeOrigin`, `storeUrl`, `adminHref`; canonical, og and JSON-LD per store; CAPI `event_source_url`; base-aware in-page links; batched re-render on an address change |
| OS-04 | Per-store robots.txt and sitemap.xml | P0 | S | both | R1 | Rewritten per host; the platform robots lists path-mode sitemaps; `Disallow: /s/` once S mode is on |
| OS-05 | Cloudflare edge kit + migration runbook | P0 | M | platform | R1 | `edge/worker.js` in the repo, wildcard record, www redirect, media cache rule, `EDGE_KEY` rotation, env keys, permanent temp-domain 308s (§5) |
| OS-06 | Console Domains view | P0 | S | platform | R1 | Every store's addresses, mode, canonical, TLS and DNS state, last check, redirect hits |
| OS-07 | Filesystem media backend + per-store byte quotas | P0 | M | both | R1 | D11; sharded files, fsync + rename before the DB commit, orphan sweeper, db → fs migrator, `asset_refs` index |
| OS-08 | Cron job runner | P0 | M | platform | R1 | Per-store round-robin cursor, per-step budgets inside the 110 s tick, `job_runs`, a last-tick alarm |
| OS-09 | Health basics | P0 | M | platform | R1 | `error_events` ring, DB size per table and per store, Sheets backlog per store, build info |
| OS-10 | Logical backups | P0 | M | platform | R1 | D52 |
| OS-11 | Retention jobs | P0 | S | platform | R1 | Leads 30 d (exists), raw carrier payloads 30 d, `ai_runs` outputs 90 d, rollups replace old events |
| OS-12 | Edge HTML caching + purge on publish | P1 | M | both | R2 | Worker Cache API keyed by host + path, honours `s-maxage`; essential before ad scale |
| OS-13 | Worker error alert + Workers Paid trigger | P1 | S | platform | R2 | Alert on Worker errors; upgrade to Workers Paid ($5/month, https://developers.cloudflare.com/workers/platform/pricing/) before the 100k requests/day free quota is near |
| OS-14 | Custom domains via Cloudflare for SaaS | P1 | L | both | R3 | `store_domains`, API create and poll, TXT pre-validation, registrar detection from NS, status timeline, make primary, daily re-check, `dns_lost`, release after 30 d (D9) |
| OS-15 | Domain health alerts | P1 | S | both | R3 | DNS lost, certificate failing, CNAME changed → dashboard + WhatsApp/email |
| OS-16 | Turnstile for custom domains | P1 | S | both | R3 | Per-store keys or a widget pool (10 hostnames per free widget, no wildcards) |
| OS-17 | Separate storefront root domain | P1 | S | platform | R3 | `STORE_ROOT_DOMAIN` ≠ platform domain; a prerequisite for a PSL listing |
| OS-18 | Off-site backups + restore drill | P1 | M | platform | R3 | Owner-connected remote copy; checksum and row-count validation |
| OS-19 | PSL listing, preview hosts `p-<token>.<domain>`, `go.<domain>`, domain search/buy help, VPS/Caddy origin path | P2 | S-L | platform | later | When scale or Hostinger's limits require them |

---

## 4. Release plan

Every P0 lands in R1 or R2. Each release is a coherent slice that can be deployed and used on its own.

### R1: SaaS core, sellable as "COD landing pages + call center" (landing-mode tenants)

What a seller can do at the end of R1: sign up (approval mode), build distinct, premium landing pages with a fast AI,
get approved, publish on `<handle>.<domain>`, and run orders through a real call center with Sheets, WhatsApp,
Telegram and ad events. What the owner can do: approve accounts and see and control every store.

- **Tenancy core:** TN-01..11, SE-01..06, store #1 migration, the tenancy test gate green.
- **Routing and edge:** OS-01..06, then the domain move (§5) before public sign-ups open (D5).
- **Platform console core:** PL-01..14, UX-02, UX-03.
- **Landing product:** LP-01..06 (LP-03 needs `delivery_zones`).
- **Operations:** OP-01..14, IN-01..06.
- **Design upgrade:** DG-01..09 (DG-01 first, before the other build tracks start).
- **AI core:** AI-01..08 (Cloud AI ships disabled until the owner sets the key and cap).
- **Platform ops:** OS-07..11, UX-01.
- **Exit criteria:**
  - two-store attack suite green;
  - verification V1-V11 passed on the real domain;
  - owner store #1 plus at least 3 beta sellers live on subdomains;
  - eval gate green;
  - no-orange and theme checks green.

### R2: full stores and the money side

- **Store mode:** ST-01..10, LP-07, LP-08, DG-10..14, AI-09..11.
- **Money and logistics:** OP-15..19, AC-01..07, TN-12, IN-07..09, SE-07.
- **Platform UX and ops:** UX-04..06, OS-12, OS-13, the store-profile Ops tab (PL-07).
- **Data for learning:** AI-12, so outcome data accumulates before the R3 learning loops.
- **Exit criteria:**
  - a "both"-mode store with catalog, cart and attached landings;
  - profit dashboard and remittance matching tested on the owner's real carrier statement files;
  - a load test of on-request store pages through the edge cache.

### R3: grow and learn

- **Domains:** OS-14..18.
- **Carriers and messaging:** OP-20..27, IN-10..13, AC-08..11.
- **Storefront and landing growth:** ST-11..20, LP-09..16.
- **AI and design learning:** AI-13..23, DG-15..18.
- **Platform:** PL-15..22, TN-13, UX-07, UX-08, SE-08.
- **EU pack (ST-21):** becomes P0 when the first EU store is planned.

### Later (P2)

Everything marked P2 above, each gated on volume, consent, legal review or the owner's demand.

---

## 5. Domain and hosting architecture

### 5.1 Recommendation

```
Cloudflare zone <domain> (Free plan: DNS + Universal SSL for the apex and first-level subdomains)
  <domain>            proxied A → Hostinger IP  ─────────────────────────────► Hostinger site (ONE Node process)
  www.<domain>        Redirect Rule 301 → apex (never reaches Hostinger)               ▲
  <handle>.<domain>   proxied * → Worker "sg-edge" ── fetch https://<domain><path>  ───┘
                        + x-sg-host, x-sg-edge (secret), x-sg-ip; refuses /admin, /app, /api/app, Next-Action
  (P1) shop.brand.ma  CNAME → stores.<domain> (Cloudflare for SaaS custom hostname, route */*) → same Worker
  /media/*            Cache Rule "cache everything" (absolute platform-origin URLs; no Worker cost)
```

- **Apex:** marketing, sign-up and login, the tenant dashboard `/app/<handle>/…`, the gated console `/admin/**`,
  `/api/public/*`, `/media/*`, and path-mode stores `/s/<h>/…` (which 308 to subdomains once S mode is on).
- **Store hosts:** rewritten internally to `/s/<handle>/…`. No cookies. Platform paths, internal prefixes and
  Server Action POSTs answer 404.
- **Config:**
  - `PLATFORM_URL` (replaces `PUBLIC_URL`, which stays an alias for one release);
  - `STORE_ROOT_DOMAIN` (equal to the apex at launch, separable later);
  - `EDGE_KEY` and `EDGE_KEY_PREV`;
  - `BEHIND_CLOUDFLARE=1`, `TRUSTED_PROXY_HOPS`.
- **Why not the alternatives:** a Hostinger subdomain per store hits the 5-app cap, costs about a process per hostname
  and needs per-store SSL. A VPS with Caddy is the P2 scale path, for when the 3 GB RAM or NPROC 120 become the limit.

### 5.2 What the owner buys and configures

1. **Buy a domain.** A `.com` is the safest choice for Morocco and Europe. Prices were not researched; Hostinger's
   read-only availability check can test names.
2. **Create a free Cloudflare account.** Plan for Workers Paid ($5/month) before ad traffic passes 100,000 store
   requests per day.
3. **Configure (about 1-2 hours, after R1's router ships):**
   - In hPanel, connect the domain to the Store Gen site (lightgreen-hippopotamus) only. Never touch myrizq.shop.
   - In Cloudflare, add the zone. Check that the apex A record points to the Store Gen server IP (confirm it in
     hPanel; 92.113.28.252 is only inferred from the myrizq zone). Copy the mail records if mailboxes are used. Add a
     proxied `*` record.
   - Switch the nameservers to Cloudflare. This is the owner's own action in hPanel or at the registrar.
   - Turn the Hostinger CDN off for this domain. Pick the TLS route: Hostinger SSL with Full (strict), or a
     Cloudflare Origin CA certificate uploaded as a custom SSL.
   - In Cloudflare, add the www Redirect Rule, the `/media/*` Cache Rule, the `sg-edge` Worker (code from the repo),
     the `EDGE_KEY` secret and the route `*.<domain>/*`.
   - In Cloudflare, add the route exclusion `console.<domain>/*` with Worker **None**: the console host is reached
     directly, never through the store Worker, which deletes cookies and refuses `/admin/**` (STORE-SAAS §C.5, CCR
     r1.0-t3-8). Serve `console.<domain>` from Hostinger as its own hostname (V2 decides how).
   - In Hostinger, set the env vars with a full replace of all keys (HANDOFF §4), then rebuild.
   - Re-render all live pages, then switch on the permanent temp-domain → new-domain 308s.
   - Update the cron URL, the Meta and TikTok domain settings, the Turnstile hostnames and any Sheets links.

### 5.3 Verification (all must pass before public sign-ups open)

| # | Check | Pass condition |
|---|---|---|
| V1 | `host-selftest.ts`: decision-table tests, forged `x-sg-*` without the key, `/s/` and `/_d/` on store hosts, reserved and deep labels, `Next-Action` POST on a store host | All 404s and rewrites as specified |
| V2 | (Optional) probe: one Hostinger subdomain alias on the Node site; does it serve the app, and do processes grow by about 11 threads? Remove it afterwards | Recorded in HANDOFF |
| V3 | `curl -sI https://probe.<domain>/` returns the app's neutral 404 with `x-sg-mode: subdomain`; the apex does not run the Worker; www 301s. Also confirms the route pattern excludes the apex. Cache check (CCR r1.0-t3-9, ENGC-2): two store hosts, each requested twice on one path (`curl -sI https://a.<domain>/x`, then `https://b.<domain>/x`); then `curl -sI https://<domain>/x` | As stated; every store response carries `CDN-Cache-Control: no-store`, `cf-cache-status` is absent, `DYNAMIC` or `BYPASS` and nothing else (`HIT`, `EXPIRED`, `REVALIDATED`, `UPDATING` and `STALE` all fail: the subrequest went through the cache), each body names its own store, and the apex answers the platform's page. The Worker's subrequest already carries `cf: { cacheTtlByStatus: { "100-599": -1 } }` ("do not cache at all"; never `cacheTtl`, which forces caching). On a failure: also set the `cache: "no-store"` fetch option (compatibility date 2024-11-11 or later) and look for a zone Cache Rule on `*.<domain>` |
| V4 | Direct-origin forgery with `--resolve` and a wrong `x-sg-edge` | Treated as the platform host; header ignored |
| V5 | Playwright (msedge): no Cookie reaches store routes; a `__Host-cs` write from a store page is rejected; a dashboard POST with `Sec-Fetch-Site: same-site` is refused | As stated |
| V6 | Order API: store A's page posting store B's pageKey is refused; correct posts from S and P addresses succeed | As stated |
| V7 | `/s/h/x?fbclid=1&utm_source=fb` on the temp domain → `https://h.<domain>/x?fbclid=1&utm_source=fb` (308); a renamed handle redirects too | Query preserved byte for byte |
| V8 | `openssl s_client -servername h.<domain>` shows an edge certificate covering `*.<domain>` | As stated |
| V9 | The Visitor IP check on a store host and on the apex shows the tester's real IP | Real IP both ways |
| V10 | Turnstile on a subdomain with the apex-hostname widget | Token verifies |
| V11 | 200 concurrent store requests through the Worker | Hostinger NPROC flat, no 503s, request count visible against the quota |
| V12 | (P1) A custom hostname on a second test domain | Active; `x-sg-host` equals the customer host; CSP allows only it + the platform |

---

## 6. Risks, unverified items, owner questions

### 6.1 Top risks (with the mitigation already in the plan)

- **One forgotten store scope leaks data across tenants.** Mitigation: TN-10 gate, `NOT NULL` with no default,
  repository-only access, cross-tenant AI and host tests.
- **The Worker is a single point of failure** (Free quota of 100k requests/day). Mitigation: OS-13 alert and Workers
  Paid upgrade, path mode as the emergency address, edge caching.
- **One Hostinger Node process shares 3 GB RAM, 2 cores and NPROC 120 with COD Studio.** Mitigation: edge HTML and
  media caching, cheap polling endpoints, sliced cron jobs, the VPS path in P2.
- **The shared registrable domain:** one phishing store can get the whole domain flagged, and sellers can't verify a
  subdomain in Meta at eTLD+1. Mitigation: approval mode, the brand deny list, takedowns; custom domains in R3 for
  serious advertisers.
- **The 3 GB DB quota stops orders at the cap.** Mitigation: filesystem media in R1, retention jobs, per-store meters,
  70%/85% alarms.
- **Cloud AI cost drift** (thinking tokens only controlled by effort, estimates ±2×). Mitigation: metering from day
  one, caps, kill switch, local and library fallbacks.
- **Generation convergence or bad combinations.** Mitigation: bold-gene-only sampling, constraint solver, gates,
  exploration slot, novelty penalty, calibration corpus DG-09.
- **Carrier APIs are private.** Mitigation: CSV adapter first; adapters only from carrier-provided docs.
- **MariaDB 10.4 is past end-of-life** (no `SKIP LOCKED`, no VECTOR). Mitigation: keep SQL portable to MySQL 8.

### 6.2 Unverified (check before relying on them)

- **Hostinger:**
  - whether a subdomain or alias reaches the same Node app, and whether each hostname spawns a process (V2);
  - temp-domain behaviour after a real domain is connected;
  - Let's Encrypt renewal behind the Cloudflare proxy;
  - SMTP limits on Business;
  - SSE buffering;
  - inode limits and backup coverage;
  - whether a newer MariaDB is available.
- **Cloudflare:**
  - route semantics for `*.<domain>/*` vs the apex;
  - `CF-Connecting-IP` on same-zone Worker subrequests;
  - API token permission names for custom hostnames.
- **Meta and TikTok:**
  - the default `_fbp` cookie domain level;
  - multi-portfolio domain verification;
  - TikTok offline event sources and windows;
  - catalog feed fields;
  - Morocco WhatsApp template rates after the 2026-10-01 update;
  - WABA onboarding requirements.
- **Carriers:** field-level API docs (Sendit included); whether Ameex, Coliix and Ozon Express give API access to a SaaS.
- **Anthropic:**
  - the primary Commercial Terms and DPA (no training on API content, retention);
  - whether `fallbacks` combines with `messages.parse` and fast mode;
  - the owner account's rate-limit tier;
  - vision token cost.
- **Libraries and models:**
  - harfbuzzjs WASM size;
  - `@resvg/resvg-js` binary on Hostinger Node 22;
  - paper.js / PathBool boolean ops;
  - final Arabic font roster;
  - Arabic/Darija quality of the browser embedding models and of the local and cloud models.
- **Law:**
  - Morocco 09-08/CNDP declarations, transfers and retention;
  - auto-entrepreneur and VAT figures;
  - whether ICE/RC ids must be displayed;
  - the scope of the EAA microenterprise exemption.
- **Numbers to tune:** all thresholds (genome distances, Jaccard limits, bandit floors, 300-visit floor, 0.4/0.6
  blend, retry ladder, 10-min lease) are starting points. Market percentages (COD share, refusal rates) are vendor
  claims and must never be shown as benchmarks.

### 6.3 Questions only the owner can answer

1. **Domain:** which name do you want for the platform (and its brand name), and can you buy it and create the
   Cloudflare account during R1? Public sign-ups wait for it (D5).
2. **Cloud AI:** may the platform pay for the Claude API (estimate about $9 per active store per month), and what
   monthly cap do you want? Until you say yes, the AI runs on-device and with the built-in library only.
3. **Plans:** what plans and limits do you want to sell (names, quotas, which features)? We build entitlements without
   prices, and orders are never blocked.
4. **Orange brands:** the no-orange rule applies to everything generated. Should it also force-shift a seller's own
   orange brand colour or uploaded logo, or may sellers keep their real brand colours on their own store?
5. **Real files:** can you share one sample of each: carrier payment statement (CSV or XLSX), Meta and TikTok Ads
   Manager exports, and your Sendit (or other carrier) API docs from your merchant account? Accounting presets and
   the first carrier adapter are built from them.
6. **Legal:** can a Moroccan lawyer review the Terms, Privacy Policy, Law 09-08/CNDP declarations and data retention
   before public launch?
