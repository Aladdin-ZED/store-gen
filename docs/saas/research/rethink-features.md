# Rethink: product power and the admin ceiling (Fable pass, 2026-10-24)

Input for Phase 2b ELEVATE (owner brief item 16, `docs/STORE-GEN-BRIEF.md:45-51`). It answers one question: which
features make Store Gen clearly better than YouCan, Shopify-for-COD (Shopify + a COD form app), Lightfunnels and the
Moroccan COD operations tools, and how the admin must feel so a seller believes it. Everything settled in
`docs/saas/RESEARCH.md` §2 (D1-D53) stays settled unless a row below says **changes Dx** and gives the cost.

Companion: `docs/saas/research/rethink-ai.md` owns the provider layer, prompts and the learning loops in depth. This
file names what each feature asks of the AI (tier, effort, cost) and stops there.

Conventions: `path:line` = verified in this repo on 2026-10-24. URLs = checked on 2026-10-24; competitor facts come
from the vendor's own page unless marked **[secondary]**. **[unverified]** = not confirmed; **[estimate]** = a number
with stated assumptions, to be measured. Priorities P0/P1/P2, effort S/M/L and releases R1/R2/R3 as in RESEARCH.md.
Cloud AI prices are the ones ai.md §3.2 records for `claude-opus-5-5` ($4 in / $20 out per million tokens, cache reads
$0.20) and `claude-haiku-5-5` ($0.10 / $0.50); thinking tokens at a given effort are unknown, so every cloud cost
carries ±2×. Local AI costs $0. Hostinger: one Node 22 process, about 3 GB RAM, 120 s per request, a 5-minute cron,
no workers (https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/).

---

## 0. The verdict in twelve lines

1. **The switch reasons are five, and they are all COD-specific:** Campaign Kit (one product → everything a campaign
   needs, in one screen), Design DNA (a store that is provably unlike any other on the platform), Profit Guardian
   (profit on *delivered* orders with a break-even CPA computed from the store's own rates), Call Center Autopilot
   (a queue that pays agents on delivery and learns when to call) and the Delivery Promise (dates by city, not
   "24-72 h"). No competitor checked has more than two of these, and none ties them to the page that produced the
   order (§1, "Why competitors don't have it" columns).
2. **Five more keep sellers from leaving:** Store Health with reasoned fixes, Experiments with honest statistics,
   Catalog from photos, Growth Autopilot, Carrier Reconciliation with cash-held ageing.
3. **Two are table stakes in Morocco and must simply be done better than everyone:** WhatsApp-first ordering and
   confirmation (every Moroccan tool has WhatsApp confirmation) and teammate roles that fit a COD business.
4. The admin's "futuristic" feel is not decoration. It is **latency discipline** (optimistic writes, skeletons that
   mirror content, 15 s pulse polling), **keyboard everywhere** (⌘K + two-key chords + the agent console on digits),
   **honest data** (placed / confirmed / delivered always labelled) and **one accent**. The current admin already has
   the right kit (shadcn, cmdk, motion, recharts, sonner, `package.json:50-80`); §2 lists exactly what to keep and
   what to redesign, file by file.
5. Three current admin habits break the owner's own rules and go: spring and overshoot easing in the sidebar
   (`src/components/admin/shell/app-sidebar.tsx:96,146`), aurora + grain on the hero KPI tile and on every empty state
   (`dashboard/kpi-card.tsx:58`, `common/empty-state.tsx:28`), and a dashboard that calls placed revenue "Revenue"
   (`dashboard/dashboard-view.tsx:99-105`).
6. **Onboarding in under two minutes is honest only if the 200-400 MB SigLIP download leaves the critical path.**
   Directions can be ranked from the owner's category tap plus the photo palette
   (`src/lib/generator/directions.ts:375-380`); classification refines in the background. §4 has the timed script.
7. **Catalog delta (§3):** ADD 4 features (Campaign Kit, Store Health, Profit Guardian lite, Test-order mode), RAISE 8
   small items into R1 (ETA as dates, Order on WhatsApp, short links, live address card, keyboard agent console,
   template ad brief, pulse ETag, Director critique to R2), CUT or trim 5 (order merge, three store-profile tabs, gene
   sliders, DPA template, broadcast changelog) so R1 stays about the same size (+1 to +2 engineer-weeks net).
8. **Changes to settled decisions:** D47 "Fair test" gets always-valid sequential inference so sellers may peek (§1.8);
   UX-01 gets the no-download critical path (§4); D38/I.6 "no bounce" is extended explicitly to the admin shell; PL-18
   becomes a tenant-facing feature, not only a console ring. Nothing else moves.
9. The AI's depth is spent where it changes money: Director tier (high effort) on design critique, store blueprint
   and the weekly digest; low effort on every interactive route; rules and the copy library everywhere else. A seller
   who never enables Cloud AI still gets every feature below (§1.13).
10. Every number shown to a seller comes from their own store (trailing 28 days) or from a k ≥ 5 platform median
    labelled as such. No vendor "benchmarks" (RESEARCH §6.2) ever appear in the UI.
11. The R1 acceptance scenario (§4) is a two-persona, three-minute demo: seller phone + owner console, from signup to a
    confirmed order, with p75 time budgets and an exact pass/fail list.
12. Biggest risks: the R1 surface is wide (tenancy + call center + design genome at once), the first-run model
    downloads, and MariaDB 10.4 (no `SKIP LOCKED`, https://mariadb.com/docs/release-notes/community-server/10.6/10.6.0.md).
    The mitigations are already in RESEARCH; §1 adds per-feature failure modes and tests.

---

## 1. Signature features

Format for each: user story · end to end · data · AI depth · why competitors don't have it (verified) · effort,
release · risks and failure modes · tests. Tier A = a seller switches for it; Tier B = keeps them; Tier C = table
stakes done better.

### Competitor baseline (what was verified, so the claims below are honest)

| Product | What it has (own page) | What was not found on it |
|---|---|---|
| **YouCan** (MA store builder) | Phone confirmation as a managed service: agents call "with zero delay", "retry several times at different times of day", activation "by purchasing a minimum credit of 100 MAD", pricing only in the dashboard (https://youcan.shop/en/help/blog/confirm). Shipping zones by country with price- or weight-tiered rates and free shipping (https://youcan.shop/en/help/settings/shipping-zones). Dec-2025 release: checkout editor, statistics (orders, AOV, visits, acquisition sources, conversion, checkout flow performance), confirmation/delivery/payment statuses editable (https://youcan.shop/en/blog/posts/newsletter-december2025). YouCan Ship aggregates carriers with one consolidated payout (https://ship.youcan.shop/en/our-services). Staff with per-person permissions (https://help.youcan.shop/hc/en-us/articles/35317034450205) | WhatsApp in the Confirm flow, agent management or commissions, confirmation rate, delivery rate, profit, ad spend, cash held, delivery ETA by city, A/B tests, a store-uniqueness guarantee |
| **Lightfunnels** | Funnel, store and page builders, "out-of-the-box cash on delivery product forms", one-click upsell, order bumps, split testing of pages ("test them against each other"), per-page clicks/CTR/visits, "Lightfunnels AI" announced without details, mobile app (https://lightfunnels.com/). COD is a payment-gateway toggle (https://docs.lightfunnels.com/cash-on-delivery/) | Order confirmation, WhatsApp, team roles, delivery ETA, profit, carriers, honest-stats rules for the split test |
| **Shopify + Releasit COD Form & Upsells** (the "Shopify-for-COD" stack) | 1-click COD form, OTP by SMS/WhatsApp, Google Sheets sync, pre/post-purchase upsells, downsells, quantity offers, abandoned checkout recovery, pixels (Meta, TikTok, Google, Pinterest, Snap), IP blocking and postal-code limits, shipping rates for the form, A/B tests on upsells (Unlimited plan, $69.99/month), Free plan up to 60 orders/month, 4.9 from 2,457 reviews (https://apps.shopify.com/releasit-cod-order-form). Shopify Sidekick: "Turn your store idea into a stunning design", photo editor, product copy, "Give me a weekly performance summary" (https://www.shopify.com/magic) | A call center, agents, commissions, delivered-based profit, carrier reconciliation, delivery ETA by city, catalog from photos (Sidekick edits photos, it does not build a catalog from them) |
| **eGrow** (MA ops tool, no store builder) | "Every order is confirmed on WhatsApp with confirm and cancel buttons", non-responders go to a "Confirmation Center" for agent calls, Call Center App, Team Management, 60 carriers, "the carrier payout file is matched against your delivered orders, parcel by parcel", "KPIs & profit" in the nav, AI Agent for WhatsApp/Instagram replies, plans from $59/month (https://www.egrow.com/en/cod-management-tool) | A store or landing builder (its own page says the free tools are widgets and generators), design, delivery promise to shoppers, break-even CPA, agent commissions on delivery |
| **COD CRM** (MA, free tier) | Kanban pipeline, 1-click shipping with Eagle Express, roles Admin/Agent/Viewer, "Suivi des paiements et commissions par agent", KPIs incl. delivery rate, "seuil de rentabilité", CPD/ROAS per campaign, Telegram reports, abandoned-cart recovery (https://www.codcrm.ma/) | Store or landing builder, design, WhatsApp feature, delivery promise, honest experiments |
| **CodFlow** (MA, MAD 299-1,499/month) | Order hub, AWB generation (Ozone Express, LaVision), per-agent confirmation rate and cost per order, "Profit net réel" (revenue minus courier fees, returns, commissions), roles admin/confirmer/courier/accountant (https://codflow.ma/) | Store builder, design, delivery promise, experiments, AI |
| **Ettajer** (MA COD store builder, 120-790 MAD/month) | "Sell cash on delivery, beautifully", templates and a visual builder, localized city/neighbourhood/phone checkout, WhatsApp and SMS verification, courier integrations (Business plan), pixels + Meta CAPI, "Ettajer Diagnostics", custom domains (https://ettajer.com/) | AI, team roles, call center, profit, delivery ETA, a uniqueness guarantee (it is template-based by its own description) |
| **wedoCOD** (MA operations service) | Confirmation call center paid on delivery (10 MAD per delivered order in its calculator), flat 30 MAD shipping, profit calculator per order, agents and warehouse admin (https://wedocod.com/) | Store builder, WhatsApp, design |
| **Yanmo** (MA WhatsApp inbox, $39-149/month) | Unified WhatsApp inbox, templates "sent based on order status (Confirmed, No Answer, Cancelled...)", voice notes, automations, auto-send to delivery partners, unlimited stores (https://yanmo.ma/) | Profit, commissions, store builder, delivery promise |
| **Shopify profit apps** (TrueProfit, BeProfit) **[secondary]** | Net profit with COGS, shipping, fees and synced ad spend from Meta/Google/TikTok; product- and ad-level profit (https://trueprofit.io/blog/trueprofit-vs-beprofit, vendor blog) | COD outcomes (refused/returned), cash held by carrier, break-even at the store's confirmation × delivery rates |

Reading: the Moroccan market already has WhatsApp confirmation, call centers, carrier pushes and even per-agent
commissions and break-even figures, but **always as a separate operations tool bolted onto a template store**. The
store builders (YouCan, Ettajer, Lightfunnels) have none of the operations depth, and the operations tools have no
page. Store Gen's structural advantage is that the page, the offer, the pixel, the script, the carrier fee and the
profit line are one object. Every signature feature below exploits that join.

### 1.1 Campaign Kit (Tier A, new feature SF-01)

**User story.** "I have one product and photos. In two minutes I want the page, the packs, the pixel, the message my
agent sends, the script she reads, the link I put in the ad, and the brief I give my designer, all consistent, all
in Darija and French."

**End to end.**
1. Entry: *Create → Campaign* (or the onboarding itself). Input = the product (a landing item set today; a catalog
   product in R2) and a channel mix (Meta, TikTok, WhatsApp broadcast, organic).
2. The page is generated as today (`src/components/generate/state.ts:20-27`: Photos → Analysis → Details → Offers →
   Directions), Design DNA applied (§1.2). The pixel gate on the Directions step stays (per-page pixel answer, HANDOFF §5).
3. The kit compiles **from the page document and the store settings**, never from free text:
   - **WhatsApp confirmation template** (IN-05) per locale with variables `{order_id, offer_label, total, city,
     eta_text}`; the ETA text comes from Delivery Zones (§1.6) or is omitted (never invented).
   - **Call script** (OP-05, template): greet → verify product, pack, total *as stored on the order* → address and
     landmark → availability on the ETA day → optional upsell line from the thank-you upsell → close. Cancel reasons
     coded (OP-04).
   - **Ad creative brief** (AI-20, template version raised to R1, §3): three angles derived from the page's benefit
     structure tags (DG-07), each with a hook, primary text and headline in ar + fr, a visual direction taken from the
     page's image treatment gene (G18), a 15 s UGC beat sheet, and a "do not say" list built from the honesty guard
     (`src/lib/ai/guard.ts:28-39`) and the facts the owner did *not* give.
   - **Links**: one short link per channel `/go/<code>` on the store host (LP-12, raised to R1) with UTM presets
     `utm_source=meta|tiktok|whatsapp`, `utm_campaign=<kit slug>`, `utm_content=<angle id>`; the QR code for print and
     stories (`qrcode` is installed, `package.json:65`).
   - **Pixel plan**: which events fire where (PageView, ViewContent, AddToCart on pack choice, InitiateCheckout, Lead,
     Purchase at the chosen trigger: order, confirmed or delivered, D23) and the test-event code reminder.
4. The kit screen shows everything as copyable blocks, with a signed read-only share link (`noindex`) for a media
   buyer or designer who has no account. Publishing the page publishes the kit; pausing the kit pauses the short links
   (410 with the store's neutral page).
5. Over time the kit is where results land: per-angle orders, confirmed and delivered rates (LP-15) and the
   break-even line (§1.4), so the brief is rewritten from what delivered, not from what clicked.

**Data.**
```
campaigns(id, store_id NOT NULL, name, product_ref JSON {kind:'landing_items'|'product', id}, page_id, page_version_id,
          offers_hash, pixel_plan JSON, channels JSON, utm_presets JSON [{code, source, medium, campaign, content}],
          templates JSON {whatsapp: {ar, fr}, script: {ar, fr, en}, brief: AdBrief}, share_token_hash, status
          enum('draft','live','paused','ended'), starts_at, ends_at, created_by, created_at, updated_at)
short_links(store_id NOT NULL, code CHAR(6), campaign_id, target_path, utm JSON, hits INT, created_at)   -- LP-12
AdBrief = { angles: Array<{ id, name, hook: {ar, fr}, primary: {ar, fr}, headline: {ar, fr}, visual: string,
            ugc15: string[] }>, doNotSay: string[], compliance: string[], source: 'library'|'cloud', promptVersion }
```
Attribution needs nothing new: orders already carry `utm` (`src/lib/db/schema.ts:286` per cod-ops.md §1) and the
`variant_key` column lands with AI-12.

**AI depth.** Reflex tier (library + rules) produces a complete kit in < 300 ms client-side. With Cloud AI on, one
call per locale pair for the brief (`ad.brief`, effort low → medium, `max_tokens` 3,000, about $0.04-0.08 per kit)
and one for the script (`callcenter.script`, about $0.04) stream over the template; a kit with cloud copy for the
page itself costs about $0.30 **[estimate ±2×]** (3 locales × $0.06 + analyze $0.02 + brief + script). Prompt
structure for the brief (the stable prefix is cached, ≥ 512 tokens):

```
system[cached]   platform rules: honesty (only facts and numbers present in <facts>), banned words, no medical claims,
                 one emphasis per headline, Darija register notes, the AdBrief schema in words
system           store memory (AI-06): voice sliders, words to use/avoid, preferred CTA (≤ 600 tokens)
user             <facts>{name, facts[], price_shown, offers[], delivery_text?, policies[]}</facts>
                 <page>{headline, benefits[], structure_tags[]}</page> <market>MA, locales ar fr</market>
                 Task: 3 angles ≠ in structure tag; each hook ≤ 12 words; UGC beats ≤ 6; doNotSay from facts not given
post             zod AdBrief (loose lengths) → fitText → guard.allowedNumbers → cliché/specificity score (DG-07)
```
Text that fails the guard falls back per field to the template, with a quiet "library" chip.

**Why competitors don't have it.** Lightfunnels builds funnels and split tests but shows no confirmation script,
WhatsApp template or ad brief on its page; Releasit lives inside Shopify's product page and has no page generator; eGrow,
COD CRM, CodFlow and Yanmo have no page builder at all; Ettajer builds the store but lists no scripts, briefs or
agents; Shopify's Sidekick writes "social media content" generically, not a COD kit tied to the exact pack shown on the
page (sources in the baseline table).

**Effort, release.** M, R1 (orchestration over existing pieces: `campaigns` + `short_links` tables, the kit screen,
template brief, share link). Cloud brief: S more, R1 behind the Cloud AI flag.

**Risks and failure modes.** Kit drift: the page changes after the kit is written → the kit stores
`page_version_id` and shows "page changed since" with a one-click recompile. Short-link abuse: codes are random 6
chars, rate-limited, 410 when paused. Brief hallucination: impossible by construction (guard + template fallback), the
test below proves it. Share link leak: read-only, revocable, no PII inside.

**Tests.** `scripts/qa/kit-check.ts`: 60 eval fixtures (AI-07) → every brief passes `allowedNumbers` (0 invented
numbers), banned-word count 0, each angle has a distinct structure tag; the kit compiles with Cloud AI off; `/go/<code>`
preserves the query byte for byte (same rule as V7); pausing returns 410; the share link answers 404 after revocation.

### 1.2 Design DNA (Tier A; DG-02..07 + D35-D39, made visible)

**User story.** "My store must not look like the shop next door that used the same app. Show me why this design is
mine, let me lock what I love, and stop me from publishing something that looks machine-made."

**End to end.**
1. Generation samples the bold genes (composition grammar, type pairing, colour strategy, image treatment, voice) with
   a per-store brand seed, solves the rest with the coherence rules, and runs the platform distance check
   (design-gen.md §3.6, §4): `d ≥ 0.25` against every live store, `≥ 0.40` within the niche, `≥ 0.30` between the
   store's own pages (D36, thresholds to calibrate on the DG-09 corpus).
2. Every direction carries a **DNA card**: the one-line explanation (`explanation[]`, design-gen.md §3.6, e.g.
   "Editorial column · Fraunces/Readex · ink + one · tight-detail crops"), and a **novelty certificate**:
   "Nearest store on the platform: 0.41 · nearest in your niche: 0.52 · your other pages: 0.33". The numbers are
   distances only; no other store's identity or genome is ever shown (D36 server-side, scores only).
3. **Locks**: the seller pins a gene ("keep this type pairing", "keep this accent"). Locks persist in `store_theme`
   (D41) and bound the campaign-mode radius (`d_brand ≤ 0.35`).
4. **Design check** (DG-06) runs on generate, save and publish: contrast, grid, radius ladder, rhythm, density, image
   fit, RTL, no-orange, slop score, copy cliché and specificity. Deterministic repairs apply first; the panel explains
   each change in plain words ("Two sections used frosted glass: kept the first, made the second solid").
5. **Director review** (AI-19, R2 behind the Cloud AI flag, §3): a structured summary in, ≤ 3 operations out of a
   closed vocabulary, applied in a sandbox copy and kept only if the quality score rises by ≥ 3 and every gate still
   passes. Not automatic: one button, capped per store per day.
6. The learning loop (D33) nudges priors toward genes that *deliver*, capped at 25% of the rank score, with one
   exploration direction of three, so the platform never converges on one look.

**Data.** `design_genomes(store_id, page_id NULL, niche, vec JSON, bucket_key, reserved_until)` (DG-05);
`PageDoc.design.genome` + `store_theme.genome` (D35); `design_checks(store_id, page_id, version_id, q_score, slop,
items JSON, repairs JSON, at)` for the panel and the console drift chart. Novelty certificate =
`{platform: number, niche: number, own: number, computed_at}` stored on the version so it does not recompute on
every view.

**Algorithm note (what to add to design-gen.md).** The distance check is brute force over ≤ 10k vectors in Node
(milliseconds); add a `bucket_key = niche|grammar|colorStrategy` prefilter and a 60 s per-store memo so the wizard's
three directions cost one pass. Resampling: if any direction fails the threshold, resample one bold gene, ≤ 8 tries,
keep the best; if all fail, show the best with a warning and no certificate (never block generation).

**AI depth.** Rules and the solver (0 cost, < 50 ms) do the work. Director review is the only cloud step: input
≈ 6-10k tokens (genome, section list, gate report, headlines) ≈ $0.03-0.04, output ≤ 2k ≈ $0.04, thinking at high
effort unknown; budget **$0.30-0.70 per review [estimate ±2×]**, which is why it is a button, not a hook.

**Why competitors don't have it.** YouCan, Ettajer and Lightfunnels are template products by their own words
("Start with a template", "battle tested" templates); Shopify Sidekick designs from a prompt but publishes no
uniqueness rule; none of the operations tools design anything. No checked product shows a novelty measure or a
pre-publish quality gate for "AI look".

**Effort, release.** DG-02 L + DG-03..07 M each in R1 (already planned); the DNA card, certificate and locks add S;
Director review M in R2.

**Risks.** Combinatorial quality drops (mitigated by bold-gene sampling + gates + the DG-09 corpus); thresholds wrong
at launch (calibrate on ~200 pages before public sign-ups); sellers over-locking into sameness within their own
store (campaign radius keeps pages apart); the distance service as a leak (returns scores only, audited).

**Tests.** `src/lib/design/selftest.ts`: 20 runs of the same input produce pairwise `d ≥ 0.25`; two stores with
identical photos differ (`d ≥ 0.25`, GEN-12 fixed); every emitted theme passes `orangeMixes() = []`
(`scripts/check-theme.ts`); repairs are idempotent; the certificate never includes a store id (schema test).

### 1.3 Store Health Score with reasoned fixes (Tier B, new feature SF-03; PL-18 raised and made tenant-facing)

**User story.** "Tell me, in one number and five lines, what is costing me money today and fix it with one tap."

**End to end.** The score replaces the setup checklist (`src/lib/admin-data/dashboard.ts:173-180`, six static items)
and absorbs the publish checklist (`src/lib/editor/checklist.ts:69-227`). It is computed nightly by the cron and
recomputed on demand with a 5-minute cache, shown as a ring on the dashboard and in the console stores list (PL-18).

**Algorithm.**
```
score = 100 - Σ_groups min(cap_g, Σ points(issue))        groups and caps:
  setup 25 · trust & honesty 20 · design quality 15 · conversion hygiene 15 · operations 15 · integrations 10
issue = { id, group, severity 1|2|3 → points 3|6|10, evidence: {metric, value, baseline?, window, n},
          fix: {kind:'link'|'action', href|actionId, label_i18n}, text_i18n (ar/fr/en template with the numbers) }
```
Rules, all from the store's own data (an operations rule stays silent below its minimum sample):
- *Setup*: no contact phone or WhatsApp (`store:contact`), legal identity missing (`store:legal`), no published page,
  delivery zones empty while the page shows a flat fee (§1.6), 2FA off for a member with `orders.read_all`.
- *Trust & honesty*: countdown ended (`urgency:past`), compare-at not higher (`product:compare`), stock set to 0
  (`urgency:stock`), sample reviews or stats present (LP-02 makes them an error at publish anyway).
- *Design quality*: live pages with `q_score < 70` or `slop ≥ 3` (DG-06); two live landings closer than 0.30 (§1.2).
- *Conversion hygiene*: missing SEO title/description, missing alt text (`media:alt`), no pixel on a live page, Purchase
  trigger set to "at order" while the store runs confirmation calls (D23 suggestion, not an error), form hidden.
- *Operations* (n ≥ 30 orders in 28 days): first-touch time p50 above the store's own calling-window target
  (`callcenter.configure`), orders without an attempt > 2 h inside the window, unreachable rate 7 d above 28 d + 10
  points, refusal rate per city above the store average + 10 points with n ≥ 20 (R2, needs ship states), phone reveals
  above the OP-19 alarm, cash held by a carrier > 30 days (R2).
- *Integrations*: Sheets backlog > 15 min, CAPI failures in the last 24 h, Telegram token failing, media or DB quota ≥ 80%.

Platform medians (k ≥ 5 stores, PL-19) appear only in R3 and only labelled "platform median"; the score never uses them.

**Data.** `store_health_daily(store_id NOT NULL, day, score, issues JSON, computed_at)` + the live recompute. Issue
texts are templates; no AI is required. The weekly digest (AI-17) reuses `issues` as its input.

**Why competitors don't have it.** YouCan ships a static "Checklist before you start"
(https://youcan.shop/en/help/checklist); Ettajer names "Ettajer Diagnostics" without describing it; no checked tool
publishes a reasoned health score over setup, honesty, design quality and call-center operations together. Shopify's
setup guide is a checklist, not a score **[secondary]**.

**Effort, release.** M, R1 (rules engine + ring + issue list + console reuse); operations rules that need ship states
arrive with OP-16 in R2.

**Risks.** Nagging: cap the list to five issues, sorted by points, with "snooze 7 days" per issue (stored, audited).
False alarms from small samples: minimum-n rules, and the evidence shows `n`. Score gaming: it is advisory and never
gates anything; publish gates stay in DG-06.

**Tests.** `src/lib/health/selftest.ts`: fixtures per rule with and without minimum n; score monotonic (fixing an
issue never lowers it); i18n templates render with every variable in ar/fr/en; snooze expires; a two-store fixture
proves no cross-store evidence.

### 1.4 Profit Guardian (Tier A; AC-04/AC-05 with an R1 "lite" layer, new feature SF-04)

**User story.** "Before I raise my budget I want to know the most I can pay per order, using *my* confirmation and
delivery rates, and I want to be told the moment a campaign goes under water."

**End to end.**
- **R1 lite (manual inputs, S-M):** an optional `cost_cents` per landing item and a store packaging cost; the fee
  charged to the customer (page flat fee or zone fee); an optional owner-typed carrier fee and return fee per zone
  (`carrier_rates`, AC-02, created early with manual values); ad spend typed per day and platform (`ad_spend_daily`,
  AC-03 manual). Delivered and returned outcomes already exist in the 9 legacy statuses pulled from Sheets
  (`src/lib/orders/contract.ts:304-314` per cod-ops.md §1).
- **R2 full:** cost snapshot at shipping (AC-01), statements (§1.7), campaign-level allocation (AC-08), `finance_daily`.

**Formulas (integer cents, trailing 28 days, minimum n = 30 placed orders, else "needs 30 orders").**
```
c = confirmed / (worked − fake − duplicate)                 confirmation rate
d = delivered / shipped                                     delivery rate (R1: from Sheets statuses)
margin_delivered = price + fee_charged − cogs − packaging − carrier_fee
loss_failed      = carrier_fee + return_fee + packaging     (refused or returned)
E_placed  = c·d·margin_delivered − c·(1−d)·loss_failed      expected contribution per placed order, before ads
BE_CPA_placed    = E_placed                                 the most ads may cost per placed order
BE_CPA_delivered = E_placed / (c·d)
realised_today   = Σ net of delivered orders − Σ loss of failed orders − ad spend
expected_pending = Σ over confirmed/shipped orders of (d·margin − (1−d)·loss) ± 1.96·sqrt(n·d·(1−d))·(margin+loss)
```
The UI shows "realised" and "expected (±)" as two numbers, never one blended figure. True ROAS = delivered revenue ÷
ad spend; CPD = ad spend ÷ delivered (cod-ops.md §5.3).

**Alerts (notification centre + Telegram, IN-04).** CPA_placed > 1.1 × BE_CPA_placed for 2 consecutive days with ≥ 20
placed orders; refusal rate 7 d > 28 d + 10 points (n ≥ 20); a city whose refusal rate exceeds the store average + 15
points (n ≥ 20) with the suggestion "mark as not served or raise the fee" (links to §1.6); cash held by one carrier
> 30 days (R2).

**Data.** `product_costs` (AC-01; R1: `landing_items.cost_cents` + history row), `carrier_rates`, `ad_spend_daily`,
`expenses`, `finance_daily` (cod-ops.md §5), plus `profit_alerts(store_id, kind, key, fired_at, cleared_at)` for
hysteresis.

**AI depth.** None required. The weekly digest (AI-17, Director tier, Batches) may narrate the numbers; it never
computes them.

**Why competitors don't have it.** COD CRM shows "seuil de rentabilité" and CPD/ROAS per campaign, CodFlow a "Profit
net réel", wedoCOD a per-order calculator (baseline table): the Moroccan tools have pieces. None computes break-even
from the store's own c × d with confidence intervals, none separates realised from expected, and none sits inside
the product that also owns the page, the offer and the fee the shopper saw. Shopify profit apps sync ad spend but
model card payments, not refusals **[secondary]**. YouCan's statistics name no profit, ad spend or cash metric.

**Effort, release.** Lite S-M in R1; full AC-01..AC-07 M in R2 (unchanged).

**Risks.** Garbage in: costs are optional, and every figure that depends on a missing input shows "add cost to
see profit", never a guess. Small samples: minimum n everywhere, intervals shown. Sheets status lag (5 min pull):
label "as of hh:mm". Currency: one per store (multi-currency P2).

**Tests.** `scripts/qa/profit-check.ts`: golden fixtures for E_placed, BE_CPA and intervals; a store below n = 30 shows
no rates; alerts fire once and clear (hysteresis); cents parity with `src/lib/page/pricing.ts` on fee and totals;
the R1 lite path works with zero costs typed (shows prompts, no numbers).

### 1.5 Call Center Autopilot (Tier A; OP-03..OP-15 + AI-23 as one product)

**User story.** "My agent opens the app on her phone, presses Next, calls, taps the result, and gets paid for what
is delivered. I see who confirms orders that actually arrive, and the app learns when my customers answer."

**End to end.**
1. **Next order** claims the highest-priority due order with a 10-minute lease (atomic `UPDATE … LIMIT 1` with a
   claim token, D19, because MariaDB 10.4 has no `SKIP LOCKED`). Presence online/break/offline; the calling window
   per store stops "Next" outside it (OP-03).
2. **Masked phone** until Call or WhatsApp, which writes `phone_revealed` (OP-07). The agent sees the product, pack,
   options, total as stored, city, landmark, risk chips with plain reasons (OP-14), customer history ("3 delivered,
   1 refused", OP-06) and the kit script (§1.1).
3. **Outcomes on keys 1-6** (OP-17, raised to R1): answered-confirmed, no answer, busy/switched off, wrong number,
   callback at…, cancelled (reason code). Each writes an `order_events` row (D18).
4. **Retry ladder** (OP-04) with exact `due_at`; after ≥ 200 attempts in the store, the ladder's hours are chosen
   by the **best-time learner** (AI-23, R3): per `(weekday, hour)` a Beta posterior `answered / attempts` with a
   platform prior (α₀ = β₀ = 2 **[to tune]**); the next retry picks the hour inside the window with the highest
   posterior mean subject to spacing ≥ 1 h and "never the same hour twice"; the UI explains it ("17h-18h: 62% of
   your calls answered, n = 84").
5. **WhatsApp first** when the store has templates: click-to-chat with the kit template and attempt logging (R1); the
   store's own WABA with Confirm/Cancel buttons and an inbound webhook that moves `confirm_state` (OP-23, R3).
6. **Commissions on delivered** (OP-15, R2): accrued pending at confirmation, earned at delivery, voided on refusal
   or return (D20); the agent sees her live statement.
7. **Manager board** (OP-11): queue depth by state, oldest due callback, agents online, each agent's confirmation and
   delivery rates (OP-10), reveal-rate alarm (OP-19).

**Data.** `orders.{confirm_state, ship_state, money_state, assignee_id, lease_until, claim, due_at, attempts,
priority}`, `order_events`, `customers`, `agent_profiles` (STORE-SAAS D49), `attempt_stats(store_id, weekday, hour,
attempts, answered)` for the learner, `agent_earnings`, `payouts`, `agent_stats_daily` (cod-ops.md §9).

**AI depth.** Rules (ladder, learner) at $0. Scripts are templates in R1; `callcenter.script` (AI-15, ≈ $0.04, no
PII) tailors objection answers per product in R3. Risk explanation stays a template (F-10).

**Why competitors don't have it.** YouCan Confirm is a managed service (agents are YouCan's, the seller sees calls
and a notification); eGrow has a Confirmation Center and a Call Center App from $59/month, separate from the store;
COD CRM tracks commissions per agent and CodFlow per-agent confirmation rates, but neither pays on delivery with a
clawback, masks phones with a reveal audit, or learns call times; MyLeadDone is outsourcing **[secondary]**. None is
inside the product that generated the page, so no script knows the exact pack and price the shopper saw.

**Effort, release.** OP-01..OP-14 in R1 (planned); OP-17 S raised to R1; OP-15 R2; learner and WABA bot R3.

**Risks and failure modes.** Lease starvation under load: the claim statement is indexed `(store_id,
confirm_state, due_at)` and tested at 200 concurrent claims (one row each, no double claim). Agents reselling
numbers: masking, no export, reveal alarm (mitigation, not a guarantee, cod-ops.md §10). Paying on delivery delays
pay by days: the statement shows pending vs earned, and the owner may add a per-confirmed base. Wrong learned hours
early: the learner is advisory until n ≥ 200 and never leaves the calling window.

**Tests.** `src/lib/callcenter/selftest.ts`: 200 concurrent claims on a 50-order fixture produce 50 distinct
assignments; an expired lease is reclaimable; outcomes write events with the right `from/to`; the ladder respects
the window and holidays; learner picks follow the posterior on a synthetic table; `phone_revealed` is written on every
unmask; an agent's queue query never returns another agent's claimed order (two-store, two-agent fixture).

### 1.6 Delivery Promise: zones, fees and ETA as dates (Tier A; D22 + LP-03 + ST-17 raised to R1)

**User story.** "When a shopper in Tanger picks her city, she sees 'Livraison mercredi 29 ou jeudi 30 · 25 DH' and
I stop paying for refusals caused by surprises."

**End to end.** Zones are owner-typed city groups, empty by default (D22): `delivery_zones(store_id, name, cities[],
fee_cents, free_from_cents?, eta_min_days, eta_max_days, not_served bool)` over the 147-city list with ar/fr/en labels
(`src/lib/markets/cities-ma.ts:10-30`). The line appears on the PDP, the landing offer block and inside the form after
the city pick; store-mode checkout charges the zone fee (payload v3); landing pages keep charging their flat page fee
until LP-16 (`src/lib/page/pricing.ts:329-349` is frozen with the runtime) and show the page's real fee, never a
different one.

**ETA as dates (raised from R3 to R1, S).**
```
etaWindow(zone, now, store):
  start = (store.cutoff_hour && localTime(now) > cutoff) ? nextWorkingDay(now) : workingDayOf(now)
  from  = addWorkingDays(start, zone.eta_min_days, store.workdays, holidays)
  to    = addWorkingDays(start, zone.eta_max_days, store.workdays, holidays)
  text  = i18n.range(from, to)      // "Livraison entre mer. 29 et jeu. 30 oct." · "التوصيل بين الأربعاء 29 والخميس 30"
  not_served → "Nous ne livrons pas encore à {city}" + WhatsApp button, order form hides the submit
```
`holidays` is a store-editable table seeded with the fixed Moroccan public holidays; movable religious holidays are
typed by the owner each year with a reminder, because their dates are set by observation **[dates to verify
yearly]**. Baymard's finding that shoppers want a delivery date, not a speed, is the reason to show dates
(https://baymard.com/blog/shipping-speed-vs-delivery-date).

**Learned ETA (R3).** Observed lead time per `(carrier, city)` from `shipments.shipped_at → delivered_at`, p50 and
p80 with n ≥ 30 in the last 90 days; the owner may accept "based on your last 84 deliveries: 1-2 working days" to
replace the typed range. Never automatic: a wrong promise costs more than none (storefront.md §11).

**Why competitors don't have it.** YouCan zones are per country with price or weight tiers and no delivery time
field; Lightfunnels' COD page covers only the gateway toggle; Releasit lists "shipping rates" for its form, not a
dated promise by city; eGrow's "delivery follow-ups" message after the order, not before it. No checked product shows
a per-city delivery date at the point of decision.

**Effort, release.** LP-03 M (planned R1) + ETA dates S (raised to R1); learned ETA S in R3; LP-16 M in R3.

**Risks.** Wrong dates after a holiday the owner forgot: the health rule "holiday table not reviewed this year"
fires in Ramadan/Eid months; the shopper line says "estimated". Zone fee vs landing flat fee mismatch: the landing
shows its own fee until LP-16 (rule in D22). Cities outside the list: "Autre ville" keeps the store range text.

**Tests.** `src/lib/markets/eta.selftest.ts`: cut-off and weekend crossings, Friday half-days if configured, holidays
skipped, Arabic and French date rendering, `not_served` hides submit; render-check fixtures assert the line is
absent when zones are empty.

### 1.7 Carrier Reconciliation and cash held (Tier B; AC-06 + D17 money axis)

**User story.** "The carrier says it paid me. I want to see every delivered parcel that is not on any statement, and
how long each carrier has been sitting on my cash."

**End to end.** Import the carrier statement (CSV first, saved column mapping per store, D38 in STORE-SAAS §0), match
by tracking → shipment → order, set `money_state` to `remitted` on matched lines, flag `amount_diff`, `fee_diff`
(statement fee vs `carrier_rates` zone fee), `unknown` (line without an order) and `missing` (delivered > N days
with no statement). Ageing buckets of "collected but not remitted" per carrier: 0-7, 8-14, 15-30, > 30 days. The
> 30 bucket raises a Profit Guardian alert (§1.4) and appears in the store profile Ops tab (PL-07, R2).

**Data.** `remittances`, `remittance_lines`, `shipments.remittance_id`, `import_mappings` (cod-ops.md §5.4; STORE-SAAS
D38). XLSX import is P1 (AC-10) because a parser dependency installs slowly here (HANDOFF §3).

**Why competitors don't have it (and who does).** eGrow matches "the carrier payout file … parcel by parcel", YouCan
Ship pays one consolidated payout, COD CRM tracks Eagle Express transfers: reconciliation exists in the market. The
difference here is the join: the fee variance against the zone rate the shopper was promised, the ageing per carrier
feeding profit and alerts, and the money axis on the order itself (D17), all without a $59/month second tool.

**Effort, release.** M, R2 (unchanged). **Risks.** Carrier formats vary per statement: mapping presets are built only
from real files the owner shares (RESEARCH §6.3 Q5). **Tests.** golden statements with duplicates, partial payments,
fee differences and unknown lines; ageing math across month ends; re-import is idempotent (`statement_ref` unique).

### 1.8 Experiments with honest statistics (Tier B; D47, **changes D47's "Fair test" math**)

**User story.** "I want to test two headlines without lying to myself. Let me look every day without ruining the
result, and tell me when it is really decided, in deliveries, not clicks."

**End to end.** Two modes stay (D47): **Fair test** (default) and **Auto-optimize** (Thompson weights from the cron,
10% floor per arm). What changes: Fair test uses **always-valid sequential inference** instead of a fixed horizon.
Johari, Pekelis and Walsh show p-values and confidence intervals that stay valid under continuous monitoring and
optional stopping (https://arxiv.org/abs/1512.04922), which is exactly how sellers behave; Evan Miller's warning
about peeking (https://www.evanmiller.org/how-not-to-run-an-ab-test.html) is answered by the method, not by a
rule nobody follows. Cost of the change: S (a few dozen lines), no new dependency.

```
mSPRT for Bernoulli arms (A, B), mixture variance τ² [to tune on the DG-09 traffic corpus, start 0.1²]:
  Λ_n = sqrt(V/(V+τ²)) · exp( τ²·(p̂_B − p̂_A)² / (2·V·(V+τ²)) ),  V = p̄(1−p̄)·(1/n_A + 1/n_B)
  p_n = min(1, 1/Λ_n), always-valid; stop when p_n < 0.05 and both arms have ≥ 100 uniques
UI: "chance B beats A" (Beta posterior), "always-valid p", "uniques per arm", "decided / not yet"
Primary metric: confirmed orders per unique at 7 days, re-scored to delivered when carriers report (D32)
```
Variants are chosen client-side from a cacheable weights JSON (HTML stays cacheable, D47); beacons and orders carry
`variant_key` (AI-12). Guardrails: never price or offer terms, ≤ 3 arms, both arms pass the Design check, auto-end at
28 days, no "winner" badge before the stop rule.

**Data.** `experiments(store_id, page_id, mode, metric, arms JSON, started_at, ended_at, decision JSON)`,
`stats_version_daily` (AI-12). **AI depth.** None; the Auto-optimize weights are a cron computation.

**Why competitors don't have it.** Lightfunnels split-tests pages and "pauses the losing one" with no published
statistics rule; Releasit runs A/B tests on upsells (Unlimited plan); neither scores on delivered orders or protects
the seller from peeking. YouCan, Ettajer and the operations tools list no experiments.

**Effort, release.** L, R3 (unchanged; LP-09). **Risks.** Low traffic per store: show "not enough visitors yet" with
the uniques needed at the current rates; pooled priors never cross stores. **Tests.** simulation: 10,000 A/A tests
yield ≤ 5% false "decided" under continuous monitoring; A/B with a true 20% lift reaches a decision at the expected
sample; variant assignment is sticky per visitor id; price fields are rejected by the arm schema.

### 1.9 Growth Autopilot (Tier B; AI-17 + AI-18 + the "Today" brief)

**User story.** "Each morning, three lines: what to do, what is wrong, what to try. Each week, a page. In my
language, from my numbers, and when it suggests a change, one tap applies it."

**End to end.** The **Today brief** on the dashboard is three template lines from real counts (orders to call now,
the worst open issue from Store Health, one opportunity such as "pack 2 delivered 71% vs 58% for pack 1 (n = 43):
make it the default pack"). The **weekly digest** (AI-17, R3) runs in Batches at high effort (Director) over
aggregates only: delivered rate by city, page and variant; cancel-reason mix; agent rates; cash to collect; the
kit angles that delivered. Every suggestion is a **proposal card** (AI-18 pattern: read tools run, write tools return
a proposal the user confirms) with the exact change ("set the default offer to Pack Duo on page X") and an undo.

**AI depth.** Templates in R1 at $0; digest ≈ $0.08 per store per week in Batches (ai.md F-16); copilot calls ≈ $0.02.
Customer PII never enters a prompt (D31): inputs are counts, rates and pseudonymous agent labels.

**Why competitors don't have it.** Shopify Sidekick answers "Give me a weekly performance summary" over card-paid
sales; eGrow and Yanmo report confirmation and delivery counts; none reasons about refusals by city, pack structure or
call timing, and none applies a change with one confirmed tap in Darija or French.

**Effort, release.** Today brief S in R1; digest M and copilot M in R3 (unchanged). **Risks.** Prompt injection via
product names and sheet cells (ai.md §7.2 controls, injection fixtures in AI-07). **Tests.** template brief renders
from zero data ("no orders yet"); proposals carry a server-validated action id and scope from the session, never from
model text (replay test with a foreign store id must fail).

### 1.10 Catalog from photos (Tier B; AI-04 + Items/`AssetRef.box` + AI-09/AI-10/AI-11)

**User story.** "I drop twelve photos of my eight products. The app cuts each one out, names it, drafts the
description in Arabic and French, proposes the colour and size matrix, and asks me to tick the facts it guessed."

**End to end.** The wizard already crops items from group photos (`AssetRef.box`, Offers v2 items 1-8 per page,
HANDOFF §5), classifies and removes backgrounds locally (`src/lib/ai/worker/ai.worker.ts:116-124`; BiRefNet_lite fp16
115 MB, https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/tree/main/onnx). R2 adds the catalog target: photos →
`products` with items, options matrix proposal from detected variants, suggested facts that need an explicit tick
(AI-04 honesty rule), names/descriptions/alt/SEO per locale (AI-09, AI-10 in Batches), and the store blueprint (AI-11)
for collections and home sections. Prices are always typed by the owner; the matrix proposal has no prices.

**AI depth.** Local SigLIP + VLM when cached; `analyze` on the server ≈ $0.02 per 2 photos with images downscaled to
≤ 1024 px; Batches for a 50-product catalog ≈ $0.50-1.00 in SEO/alt/translation **[estimate ±2×]**.

**Why competitors don't have it.** Shopify's Sidekick page offers a photo editor ("Upgrade your phone photos to
studio shots") and copy from prompts, not a catalog built from photos; YouCan and Ettajer import CSVs; the operations
tools have no catalog. Lightfunnels imports from Shopify or AliExpress.

**Effort, release.** M, R2 (AI-11 + ST-01 already planned; the photo-first entry adds S). **Risks.** Mis-cropped
items: the crop dialog exists (`src/components/admin/items/crop-dialog.tsx`); wrong facts: tick-to-accept; model
downloads on phones: route to the server or skip (D28). **Tests.** fixture photos → expected item count ±1; no price
field in any proposal; suggested facts absent from copy until ticked (guard test).

### 1.11 WhatsApp-first ordering and confirmation (Tier C, done better; LP-04 + LP-11 raised + IN-05 + OP-23)

**User story.** "Some customers will never fill a form. Let them order on WhatsApp with the exact pack priced, let
my agent convert it in one tap, and confirm every order on WhatsApp before I call."

**End to end.** R1: "Order on WhatsApp" creates a **server-priced lead** with the selection (payload reuses
`pricing.ts`), then opens `wa.me` with the order text; the agent converts the lead to an order in the drawer (LP-11,
raised to R1, S). The thank-you page gets "Confirm on WhatsApp" with the order id prefilled and the store's real
confirmation number and hours (LP-04). Agents get quick replies in ar/fr with variables (IN-05), logged as attempts.
R3: the store's own WABA with a utility template and Confirm/Cancel/Change buttons, inbound webhook, fallback to the
call queue (OP-23); catalog, multi-product (up to 30 items) and cart messages exist in the Cloud API for stores that
want WhatsApp as a storefront (https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services).

**Why it is table stakes.** eGrow confirms every order on WhatsApp with buttons, Yanmo sells a WhatsApp inbox, Micro
COD Manager auto-sends confirmations **[secondary]**, Ettajer verifies by WhatsApp or SMS, Releasit does OTP by
WhatsApp. **What is better here:** no API or template approval needed on day one (click-to-chat works for every
store), the message carries the exact priced selection and ETA, attempts are logged against the order and the agent,
and the shopper's number never reaches a third-party inbox.

**Effort, release.** LP-04 S + IN-05 S + LP-11 S in R1; OP-23 L in R3. **Risks.** Meta's Morocco template rates
changed on 2026-10-01 and are **[unverified]** (cod-ops.md §2.7); keep click-to-chat as the permanent path. **Tests.**
lead total equals the runtime total (parity); conversion to order re-prices on the server; `wa.me` text ≤ the
length that short links allow (storefront.md S18, third-party **[secondary]**).

### 1.12 Teammate roles that fit a COD business (Tier C, done better; TN-08 and STORE-SAAS §A.3)

**Already specified** in `docs/STORE-SAAS.md` §A.3: owner, admin, manager, editor, agent, viewer in R1; logistics
and accountant in R2; agents see only their queue, phones masked until Call; accountant sees finance without phones;
`invitableRoles(manager) = ["agent"]`; "require 2FA for members" enforced in the seam from R1 (STORE-SAAS D12).

**What makes it a feature rather than a settings page.** Invites are WhatsApp-friendly links bound to the invited
e-mail (STORE-SAAS D10); the first screen after accepting an agent invite is the queue, not a dashboard; the manager
sees confirmation *and* delivery rate per agent (OP-10) so "who confirms orders that arrive" is visible; every
reveal and export is audited (OP-07, SE-04).

**Market check.** YouCan has per-person staff permissions; CodFlow has admin/confirmer/courier/accountant; COD CRM
Admin/Agent/Viewer with commissions. Roles alone switch nobody; masking, reveal audit, queue isolation and pay-on-
delivered together do.

**Effort, release.** R1 as planned. **Tests.** `test:permissions` (STORE-SAAS §J.1) plus the two-agent queue test in §1.5.

### 1.13 How the AI thinks inside these features (depth per surface)

| Tier | Where | Latency target | Cost per call | Used by |
|---|---|---|---|---|
| Reflex (library, rules, solver) | everywhere, first paint | < 50 ms | $0 | kit templates, DNA sampling, health, ETA, profit, ladder |
| Local (SigLIP, Qwen3.5 0.8B/2B, BiRefNet) | capable desktops, cached models | seconds to ~1 min for copy (`wizard.tsx:1025`) | $0 | analysis, cutouts, copy refinement |
| Cloud low (`effort: low`) | interactive routes with deadlines (ai.md §3.3) | ≤ 25 s field rewrite, ≤ 90 s page copy | $0.01-0.06 | copy, rewrite, analyze, SEO, script |
| Cloud medium | kit brief, store blueprint, logo parameters | ≤ 110 s, streamed | $0.04-0.20 | §1.1, §1.10 |
| **Director** (`claude-opus-5-5`, effort high) | design critique on request, store blueprint in store mode, weekly digest (Batches) | critique ≤ 60 s; digest async | $0.30-0.70 critique, $0.08 digest **[estimate ±2×]** | §1.2, §1.9, §1.10 |

Rules that hold at every tier: Zod contract + honesty guard on every output (D30), customer PII never in a cloud
prompt (D31), the store's "On-device only" mode enforced server-side (D28), a monthly platform cap and kill switch
(AI-01). A store that never enables Cloud AI loses only the Director review, the tailored script, the weekly digest
and the copilot; every feature above still works on templates and rules.

---

## 2. Admin UX ceiling

### 2.1 What "Linear / Vercel / Stripe / Framer level" means here, in testable rules

1. **Instant.** Navigation between shell screens feels < 150 ms (prefetched route chunks on hover and focus, server
   components streamed, lists hydrate from a cached first page). Writes are optimistic: "Update the UI immediately when
   success is likely; reconcile on server response", with rollback or Undo on failure; mutations complete in < 500 ms
   and carry an idempotency key (Vercel Web Interface Guidelines, https://vercel.com/design/guidelines). Skeletons
   "mirror final content exactly", appear after a 150-300 ms delay and stay ≥ 300-500 ms to avoid flicker (same source).
2. **Keyboard everywhere.** ⌘K for any page or action; two-key chords for destinations ("press G then I to open
   Inbox" in Linear's guide, https://linear.app/enablement/guide/navigating-linear); `?` shows every shortcut; `/`
   focuses search. The builder already has a shortcut map (`src/components/builder/shortcuts.ts:144-155`); the agent
   console gets digits.
3. **Honest data.** Placed, confirmed and delivered are three different words and never share a tile; every rate
   shows its `n`; sparklines only with ≥ 7 points (STORE-SAAS §I.6; today `kpi-card.tsx:92` draws from 2).
4. **One accent, one glass, no bounce.** Jade for the tenant, teal-cyan for the console, violet ribbon while
   impersonating (UX-03, STORE-SAAS §I.6). One frosted surface per screen (the topbar, `admin.css:73-76`); aurora +
   grain are a budget of one per screen and off by default. Easing is ease-out 120/180/240 ms (`--dur-1..3`), never
   spring overshoot: `app-sidebar.tsx:96` (spring stiffness 480) and `:146` (`cubic-bezier(.34,1.36,.64,1)`) change.
5. **Dense but breathing.** Comfortable 40 px rows and 14 px base by default; compact 32 px and 13 px for agents and
   managers (per viewer, `[data-density]`, STORE-SAAS §I.6). Tabular numerals in every number column
   (`font-variant-numeric: tabular-nums`, Vercel guidelines). Max two lines per cell, truncation with a title.
6. **Phone-first for agents.** 44 px targets on mobile (Vercel guidelines), outcomes as a 2 × 3 grid under the thumb,
   drawers become full-height sheets, tables become two-line rows. Every swipe has a tap alternative.
7. **RTL-perfect.** Logical properties only (the shell already uses `ms-auto`, `end-4`: `topbar.tsx:62`,
   `command-palette-body.tsx:85`), mirrored chevrons and progress, Arabic UI face from the installed OFL set, phones
   and ids in `dir="ltr"` isolates, dates in the store time zone (STORE-SAAS §I.5).
8. **No AI tells in the admin either.** The anti-slop rubric's hard rules that apply to product UI are adopted:
   skeletons over spinners, label above input, no placeholder-as-label, no decorative status dots, no em-dash in UI
   copy, no "Step 1/2/3" labels, one CTA label per intent (`qa/ref/anti-slop-frontend-rubric.md` §4.5-4.7, §9). Owner
   rules win where they conflict: the rubric's palette suggestions that include orange families are ignored.

### 2.2 Information architecture

The route tree and nav groups are fixed by `docs/STORE-SAAS.md` §I.1-I.3 (Workspace, Sell, Landing pages, Catalog R2,
Library, Team, Connect, Money R2, Settings). This section adds the interaction model on top.

**Shell.**
- *Store switcher* in the sidebar header (replaces the brand block, `app-sidebar.tsx:118-129`, ADM-29): logo from the
  brand kit, name, mode badge, status pill ("In review"), memberships with roles, "Create a store", "Platform console"
  for staff. Keyboard: ⌘K "Switch to …" and `G` then `W`.
- *Topbar* (`topbar.tsx`): breadcrumb root becomes the store name (`:38` says "Studio", ADM-30); the ⌘K button stays
  (`:59-71`); the bell joins it; "View store" opens the canonical store address (`storeUrl`, OS-03).
- *Banners*: pending, restricted, suspended, quota ≥ 80%, kill switch, require-2FA (STORE-SAAS §I.4), one at a time,
  dismissible only when informational.
- *Limit sheet*: every `QuotaError` opens one premium sheet (what is limited, current use, "ask for more"), never a
  raw error (PL-11).

**⌘K (UX-02).** Today's palette searches pages and orders across the whole database (`command-palette-body.tsx:84`,
ADM-02 PII leak) with hard-coded actions (`:135-170`) including "Export all orders (CSV)" (`:149-158`). New model:
- Scope from the session store; agents search only their queue; phone search needs `orders.read_all` and shows masked
  results.
- Three result sources: a **local index** shipped with the shell (pages, products, settings, team names; ≤ 300
  entries; instant), **server search** for orders by id or phone and customers (debounce 120 ms, skeleton rows after
  150 ms, ≥ 300 ms visible), and **actions** filtered by `can()` with their shortcut shown.
- Typed patterns act directly: an order id (`^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$`, `orders-view.tsx:42`) opens the drawer;
  `>` prefixes an action; `/` searches; `?` opens the shortcut sheet.
- Chords: `G O` orders, `G Q` queue, `G L` leads, `G C` customers, `G P` pages, `G M` media, `G T` team, `G S`
  settings, `G H` overview, `G N` notifications, `G W` switch store; `C` opens Create (page, product R2, manual order,
  invite); `N` = next order and `1-6` outcomes inside the queue; `E` edit, `Enter` open, `Esc` close, `J/K` or arrows
  move in lists. Chords never fire inside editable fields or open overlays (the builder's `isEditable` /
  `overlayOpen` rules, `shortcuts.ts:16-25`).
- Copilot (AI-18, R3) is the same input with natural language: read tools run, write tools return proposal cards.

**Notification centre (PL-13).** DB-backed `notifications`, a bell with an unread count, a panel grouped by kind with
collapsed batches ("12 new orders since 14:02"), deep links, mark-read, platform broadcasts fanned out lazily.
Refresh via the `pulse` endpoint (STORE-SAAS D46: visibility-aware 15 s polling, cached 5 s per store). **Added**:
`pulse` answers `{unread, counts: {new_orders, due_callbacks, sync_failed}, last_order_id, health}` with an ETag so
unchanged polls cost a 304, and one tab per browser polls and shares through `BroadcastChannel` (S).

**Instant search inside screens.** Orders, leads, customers, pages and media keep a client-side filter over the loaded
page (< 100 ms) and a server query for the rest; filters live in the URL (the `useQueryState` pattern,
`orders-view.tsx:56`), so views are shareable and ⌘K-linkable.

**Saved views and bulk actions (OP-09).** Orders: "To call now", "Due callbacks", "High risk", "Failed sync", "By
agent", "By city"; a selection bar at the bottom with assign, status, export, print; every bulk action is one
server call with a count in the toast and Undo where safe (status moves within 10 s).

### 2.3 Onboarding (UX-01) and the wow moment

The flow is in §4 with timings. Design rules: mode cards (Store / Landing pages / Both) as three large visual tiles
with one sentence each; photos drop first, forms later; the name and handle are typed while classification runs, with
a live address preview and an availability check (`…/s/<handle>` now, `<handle>.<domain>` later); the reveal is
full-bleed with three directions and their DNA cards; Morocco defaults are pre-filled except money (delivery fee
empty, never invented); the dashboard opens with the Store Health ring and the "In review" pill. The **live address
card** (UX-05, raised to R1): copy link, QR, "Share on WhatsApp", "Open a test order" (§3 SF-05), so the first thing a
seller does after publishing is show someone.

### 2.4 Empty states that teach

Pattern: a quiet surface (ring-1, no aurora by default), a **preview of the real UI** in its final shape (a skeleton of
the table or card the data will fill, never fake numbers), one sentence, one primary action, and when relevant a second
line that teaches ("Orders arrive here the second a shopper submits the form; your agent sees them in Queue."). The
current `EmptyState` (`empty-state.tsx:28`: aurora, grain, dot grid on every instance) becomes the *celebration*
variant used once (first store created, first order) and the quiet variant everywhere else.

### 2.5 Data-viz style

- Series colours: neutral graphite for context, jade for "ours / delivered", crimson for loss / refused, yellow for
  warn / pending; no orange anywhere (hue 25-75°, chroma > 0.06 is a test failure, `scripts/qa/admin-tokens-check.ts`,
  STORE-SAAS §I.6).
- The **COD funnel** is the signature chart: orders → confirmed → shipped → delivered → cash collected, horizontal
  stepped bars with absolute counts and step rates, one per period, delivered in jade.
- KPI tiles (`kpi-card.tsx`): value, delta vs the previous period, sparkline only with ≥ 7 points, a hint that names
  the definition ("Delivered orders, 28 days"); the hero tile loses aurora + grain by default (`:58`); delta chips use
  the semantic tokens instead of Tailwind `emerald`/`rose` classes (`:75`).
- Tables over charts for anything with fewer than 5 points; no pie charts except a two-segment share; no dual axes;
  label the last point; recharts stays code-split (`dashboard/orders-chart-plot.tsx`).

### 2.6 Motion signature (restrained)

Durations `--dur-1 120ms`, `--dur-2 180ms`, `--dur-3 240ms`, easing `cubic-bezier(.2,.8,.2,1)`, no bounce
(STORE-SAAS §I.6, D38). Allowed moves: the sidebar active pill slides (layout animation, ease-out), rows enter with a
6 px rise + fade staggered 20 ms (max 12 rows animate), drawers slide 240 ms, numbers roll once on load
(`common/animated-number.tsx`), toasts rise 180 ms. Forbidden: rotation on hover (`app-sidebar.tsx:146` rotates the
generate icon with overshoot), pulsing glows, parallax, confetti. `prefers-reduced-motion` keeps opacity only.

### 2.7 Density, typography, surfaces

Instrument Sans with tabular numerals, JetBrains Mono for ids (STORE-SAAS §I.6); 13/14 px base by density; a 4-tier
radius ladder 6/8/12/16; hairlines at 1 px with `color-mix` from the foreground; shadows tinted by the surface and
used only on floating layers (drawer, popover, the one glass bar); cards only where elevation means something, lists
separated by hairlines otherwise (rubric §4.4).

### 2.8 i18n ar/fr/en and the RTL admin

Message catalogs with `MessageKey` typing (STORE-SAAS §I.5); R1 complete in ar/fr/en for the public auth pages,
onboarding, the agent console, order tracking and thank-you additions; French dashboard R2; Arabic RTL dashboard R3
(UX-08). Rules now, so R3 costs nothing extra: logical properties only (lint `(^| )(ml|mr|pl|pr|left|right)-` in
admin files), icons that imply direction come from a mirrored allow-list, Latin digits by default with a per-user
toggle, phones and ids in `<bdi dir="ltr">`, dates in the store time zone, no uppercase or letter-spacing for Arabic
labels (DESIGN.md §2.3).

### 2.9 Keep, rework, redesign (existing admin parts)

| Part | Where | Decision |
|---|---|---|
| shadcn + Tailwind v4 tokens (OKLCH, jade, status tokens) | `src/app/globals.css:1-11` | **Keep**; add the 3-input generator and the console surface (STORE-SAAS §I.6) |
| cmdk palette, code-split, prefetched | `shell/command-palette.tsx`, `command-palette-body.tsx` | **Rework**: scope, local index, chords, action registry from `navFor(ctx)` |
| Sidebar shell (inset, collapsible, badges) | `shell/app-sidebar.tsx` | **Rework**: switcher header, groups from STORE-SAAS §I.3, ease-out motion, no icon rotation |
| Topbar (glass, breadcrumb, ⌘K button, theme) | `shell/topbar.tsx` | **Keep**; store name root, bell |
| KPI card + sparkline + animated number | `dashboard/kpi-card.tsx`, `common/animated-number.tsx` | **Keep**; ≥ 7 points rule, semantic delta tokens, aurora off by default |
| Dashboard | `dashboard/dashboard-view.tsx` | **Redesign**: Today brief, COD KPI set (orders today, confirmed today, delivered 28 d, first-touch p50, conversion, cash to collect R2), funnel, work lists, health ring |
| Setup checklist ring | `dashboard/setup-checklist.tsx` | **Rework** into the Store Health ring (§1.3) |
| Sheet health tile | `dashboard/sheet-health.tsx` | **Keep** as the pattern for every integration tile |
| Empty state | `common/empty-state.tsx` | **Rework**: quiet default + celebration variant |
| Segmented, StatusChip, Pager, SearchField, ConfirmDialog, CopyButton, RelativeTime | `common/*` | **Keep** |
| Orders view (tabs, URL state, drawer link) | `orders/orders-view.tsx` | **Redesign**: saved views, columns by role, bulk bar; keep `?order=` URL state (`:57-68`) |
| Order drawer | `orders/order-drawer.tsx` | **Redesign**: masked phone + reveal (`:169-183` shows the full number), timeline (D18), attempts and outcomes, script panel, notes, customer history; keep the Sheets block (`:205-216`) |
| Leads panel, blocklist panel | `orders/leads-panel.tsx`, `orders/blocklist-panel.tsx` | **Rework** into the Leads inbox (LP-06) and a store-scoped blocklist (OP-12) |
| Pages list, page card, preview dialog | `pages/*` | **Keep**; add the address card and kit link |
| Builder (canvas, inspector, panels, versions, shortcuts) | `src/components/builder/**` | **Keep**; add the Design check panel (DG-06) and the DNA card in the Theme panel; Director review button (R2) |
| Generate wizard (5 steps) | `src/components/generate/wizard.tsx` (1,110 lines) | **Keep the engine, re-skin for onboarding**: mode cards before it, no blocking download (§4), reveal screen, DNA cards |
| Settings nav (mixes user, store, platform) | `shell/nav.ts:59-72` | **Redesign** per STORE-SAAS §I.1: account pages under `/app/account`, store settings groups, platform items only in the console |
| Team panel | `settings/team-panel.tsx` | **Rework**: invites by link, roles per §A.3, agent fields |
| Audit timeline | `settings/audit-log.tsx` | **Keep**; store filter |
| Security panel (2FA, sessions, network view) | `settings/security-panel.tsx` | **Keep** for the account; the proxy-hop view moves to the console (ADM-26) |
| Media library, focal editor, items crop | `media/*`, `items/*` | **Keep** |
| Export dialog | `export/*` | **Keep** (landing mode) |

### 2.10 Screen-by-screen priority (R1 build order)

| # | Screen | Why first | Effort |
|---|---|---|---|
| 1 | Signup → mode cards → onboarding wizard → reveal → address card | the wow moment and the acceptance scenario (§4) | L (UX-01) |
| 2 | Dashboard with Today brief, COD KPIs, funnel, health ring | the first screen every day | M |
| 3 | Orders list (saved views, bulk bar) + order drawer (timeline, masked phone, outcomes, script) | where money is won or lost | L |
| 4 | Agent queue (`/queue`, phone-first, keys N and 1-6) | the call center is the R1 product | M |
| 5 | Pages list + address card + kit screen | publish, share, run ads | M |
| 6 | Leads inbox | warm paid traffic (LP-06) | S-M |
| 7 | Customers (profiles, history, blocklist) | duplicate and fake defence (OP-06, OP-12) | M |
| 8 | Team & invites, agent profiles | onboarding a team on day one | M |
| 9 | Connect: Sheets, Pixels, Telegram, WhatsApp templates | every store connects at least two | M |
| 10 | Settings: general, market, checkout & delivery (zones, ETA, holidays), policies, brand (basic), anti-spam, AI, address, plan & usage, audit, danger | the zones screen is new; the rest is re-skinned | M |
| 11 | Notifications panel | ties alerts to actions | S |
| 12 | Console: approval queue, stores list, store profile (Overview, Orders masked, Team, Activity, Usage), health, flags, AI | the owner's control room (PL-04..PL-12) | L |
| 13 | Builder additions: Design check panel, DNA card | quality visible at edit time | S-M |

---

## 3. Feature catalog delta (RESEARCH.md §3)

### 3.1 ADD

| ID | Feature | P | E | Mode | R | Why |
|---|---|---|---|---|---|---|
| SF-01 | **Campaign Kit** (§1.1): `campaigns`, templates (WhatsApp, script, brief), UTM presets, short links, pixel plan, share link, kit screen; cloud brief behind the AI flag | P0 | M | both | R1 | The R1 unit of work; turns six existing pieces into the reason to switch |
| SF-03 | **Store Health Score** with reasoned fixes (§1.3): rules engine, `store_health_daily`, ring, issue list, snooze; replaces the setup checklist and feeds PL-18 | P0 | M | both | R1 | One number that tells the seller what to do; reuses `checklist.ts` |
| SF-04 | **Profit Guardian lite** (§1.4): item cost, packaging, manual carrier fee per zone, manual ad spend, break-even CPA with intervals, two alerts | P0 | S-M | both | R1 | The question every COD seller asks before scaling; full AC-01..AC-07 stay R2 |
| SF-05 | **Test-order mode**: a signed `?test=` link from the address card marks orders `is_test` (excluded from KPIs, Sheets, CAPI, learning; shown with a TEST chip in the queue) | P0 | S | both | R1 | Lets sellers and QA walk the full flow without poisoning stats or ads (owner test orders hit risk ≥ 70 today, HANDOFF §5) |
| SF-06 | **Pulse ETag + shared poller** (§2.2): 304 on unchanged pulse, one poller per browser via `BroadcastChannel` | P1 | S | both | R1 | Keeps 15 s polling cheap on one Node process (D50) |

### 3.2 RAISE

| ID | From → to | E | Why |
|---|---|---|---|
| ST-17 ETA as dates | P1 R3 → P0 R1 | S | Baymard's delivery-date lever; zones (LP-03) already land in R1 (§1.6) |
| LP-11 Live "Order on WhatsApp" | P1 R3 → P0 R1 | S | Table stakes in Morocco (§1.11); a lead + `wa.me`, no API |
| LP-12 Short links with UTM presets | P1 R3 → P0 R1 (store host only; `go.<domain>` stays P2) | S | Needed by the kit for attribution |
| UX-05 Live address card (copy, QR, WhatsApp share, test order) | P1 R2 → P0 R1 | S | The wow moment ends with sharing (§4) |
| OP-17 Keyboard-first agent console | P1 R2 → P0 R1 | S | N and 1-6 are what make the queue feel instant on a laptop |
| AI-20 Ad creative briefs | P1 R3 → template version P0 R1 (inside SF-01); LLM version stays R3 | S | Template from benefit structure tags costs little and completes the kit |
| AI-19 Design critique and repair (Director review) | P1 R3 → P1 R2, cloud-only, on request | M | Brief item 16 asks for the Director tier on critique; static gates (DG-06) stay the R1 gate |
| PL-18 Store health score | P1 R3 console ring → P0 R1 tenant feature (SF-03) with the console ring reading the same table | M (in SF-03) | Same computation, both audiences |

### 3.3 CUT or trim (to keep R1 shippable)

| ID | Change | Saves | Why |
|---|---|---|---|
| OP-06 Duplicates + **merge** | R1 keeps the store-wide duplicate flag, link and "separate order"; **merge** (lines combined, one parcel, one fee) moves to R2 | M → S | Merge touches pricing parity, Sheets rows and the PHP export; the flag catches the loss |
| PL-07 Store profile | R1 tabs: Overview, Orders (masked), Team, Activity, Usage & plan; Catalog & pages, Integrations health, Domains, Risk, Notes, Media move to R2 (Notes stays if S) | L → M | The approval queue and the stores list carry R1; the rest needs R2 data anyway |
| DG-12 Generation studio | Gene sliders and seed history move to R3; the "why this design" line and DNA card ship in R1 via DG-02 `explanation[]` | M → S | Sliders without the learning loop are decoration |
| PL-14 Legal templates | R1: ToS, Privacy, AUP and store legal templates (reusing `src/landing/legal/content.ts`); the platform DPA moves to R2 | S | Needs a lawyer either way (STORE-SAAS D39) |
| PL-17 Broadcasts and changelog | Stays R3; no R1 "What's new" drawer | S | Not needed before public sign-ups |

Net R1 effort: ADD ≈ M + M + S-M + S + S, RAISE ≈ 6 × S (+ M in R2), CUT ≈ M + L→M + M + S saved. Roughly +1 to +2
engineer-weeks on R1 **[estimate]**; nothing in the exit criteria of RESEARCH §4 changes, and §4 below becomes the
twelfth exit criterion.

### 3.4 Changes to settled decisions (explicit)

| Decision | Change | Cost |
|---|---|---|
| D47 Experiments | "Fair test" uses always-valid sequential inference (mSPRT) instead of a fixed horizon; peeking allowed; stop rule shown | S, no dependency |
| UX-01 / AI-03 | Onboarding never waits for a model download; category tap + photo palette rank the directions; SigLIP and the VLM refine in the background or on the server when Cloud AI is on | S (ordering of existing jobs) |
| D38 / I.6 | "No bounce" applies to the admin shell today (two spring/overshoot sites) and aurora + grain become a budget of one per screen | S |
| PL-18 | Tenant-facing with reasoned fixes, not only a console ring | folded into SF-03 |
| D50 | Pulse gains an ETag and a shared poller | S |

---

## 4. The wow demo: three minutes from signup to a confirmed order (R1 acceptance scenario)

**Setting.** Two screens: the seller on a mid-range Android phone (Chrome, 4G) and the owner on the console. Signup
mode `invite` on the temporary domain (STORE-SAAS D9) or `approval` on the real domain; either way the console
approves during the demo. Cloud AI may be on or off: the script must pass with it **off** (library + rules), and the
timings below are for off. Test data: three product photos (one group photo), a never-used phone for the test order.

**Why this is honest.** Directions are ranked from category, palette, vibe hint and keywords
(`src/lib/generator/directions.ts:375-380`); the palette comes from the photos in the browser; the category is one tap
on the chip the wizard already shows (`wizard.tsx:1011` suggests it). SigLIP needs a 99.5 MB vision + 111 MB text
download at q8 on WASM, or 186 + 221 MB fp16 on WebGPU (https://huggingface.co/Xenova/siglip-base-patch16-224/tree/main/onnx),
which is 1-3 minutes on 4G, so it runs after the reveal and only refines. The copy is the hand-written library,
complete and honest (`src/lib/ai/copy-library/*`). Publishing a pending store is denied by entitlement (PL-02), so the
owner's approval is part of the path.

| Clock | Seller (phone) | Owner (console) | Budget (p75) | Pass condition |
|---|---|---|---|---|
| 0:00 | Opens the invite link, signs up (e-mail, password, phone, Turnstile) | | form ≤ 20 s human time; server ≤ 1 s | account created, session set, no email needed (STORE-SAAS D10) |
| 0:20 | Picks **Landing pages** on the mode cards | | tap | `stores.mode = landing`, status `pending` |
| 0:25 | Drops 3 photos | | upload 3 × ≈ 600 KB ≤ 8 s on 4G; palette ≤ 0.3 s client-side | thumbnails appear progressively; cutout job starts in the background |
| 0:35 | Types the store name and handle while the address preview updates; taps the suggested category chip | | availability check ≤ 300 ms per keystroke (debounced) | handle valid, address shown as `/s/<handle>` or `<handle>.<domain>` |
| 0:50 | **Reveal**: three directions full-bleed, each with a DNA card and novelty certificate | | generation ≤ 1.5 s client-side **[measure]**; preview render ≤ 1 s server | three directions, pairwise `d ≥ 0.25`, no orange, Design check green |
| 1:05 | Picks one; Details: price typed, delivery fee left empty on purpose, one fact | | | the fee line is absent (never invented); checklist shows "delivery zones empty" as a health issue, not a blocker |
| 1:25 | Taps **Publish** → "In review" sheet explains what is locked | Approval queue: the row shows score, flags, a draft thumbnail; presses **A** | approve ≤ 1 s | store `active`, seller notified in-app within one pulse (≤ 15 s) |
| 1:40 | Publish succeeds; the **address card** shows link, QR, WhatsApp share, **Open a test order** | | publish ≤ 3 s (version row split, HANDOFF §4) | live page answers 200 with the pixel answer recorded; `/` of the store host serves it |
| 1:55 | Opens the test-order link on the same phone, picks the pack, fills name, phone (never used), city, address; submits | | page LCP ≤ 2.5 s on 4G (storefront.md §4.15); submit ≤ 1 s | order created with `is_test = 1`, risk < 70, excluded from CAPI and Sheets; thank-you shows "Confirm on WhatsApp" |
| 2:15 | Taps **Confirm on WhatsApp** (opens `wa.me` with the order id) | Opens **Queue**, presses **N** | claim ≤ 300 ms | the order is claimed with a 10-min lease, phone masked, TEST chip visible |
| 2:30 | | Presses **C** (call) or **W** (WhatsApp template): phone revealed, `phone_revealed` event written; presses **1** (confirmed) | each action ≤ 500 ms, optimistic | `confirm_state = confirmed`, timeline shows attempt → confirmed, commission row `pending` (R2) |
| 2:50 | Dashboard: Today brief line 1 reads "1 order confirmed today"; health ring shows the zones issue with a one-tap fix | Store profile Overview shows the first-order milestone | pulse ≤ 15 s | counts match on both screens; nothing counts the test order in revenue KPIs |
| 3:00 | Done | Done | | Telegram "new order" fired only if the store connected it (not required for pass) |

**Acceptance checks (automated where possible).**
1. Playwright (msedge, HANDOFF §3) runs the seller path on a 390 px viewport with 4G throttling and asserts every
   pass condition; total wall time ≤ 3:30 including human-typing pauses modelled at 150 ms per character.
2. The run passes with Cloud AI off and with the local model cache empty (no download on the critical path; the
   SigLIP job may still be running at 3:00).
3. The run passes twice with the same photos in two stores and yields different genomes (`d ≥ 0.25`).
4. Every page in the path passes the no-orange scan (`qa/verify/orange-check.mjs`, `qa/admin-visual/shoot.mjs
   --scan-only`) and the admin token check.
5. The test order never reaches Sheets, CAPI or the learning tables (assert on `is_test`), and the dashboard revenue
   stays at 0.
6. A second agent pressing **N** at 2:15 does not receive the same order (two-session test).
7. The two-store attack suite (TN-10) is green on the same build.

**What the audience should feel.** Nothing waited for the AI; the design looked like theirs; the price and fee were
only what they typed; the owner's approval took one key; the order appeared on the phone of the person who would
call it before the shopper had put the phone down.

---

## 5. Risks across the whole rethink

- **R1 surface width.** Tenancy, routing, call center, design genome and the kit at once. Mitigation: the §2.10
  order, the §3.3 cuts, and the rule that every raise is S.
- **First-run downloads.** Quantified above; the critical path avoids them. The "Download local AI" consent card
  (AI-03) stays off mobile data.
- **Honesty under pressure.** Every feature that shows a number has a minimum-n rule and a "needs data" state; the
  tests in §1 assert zero invented numbers.
- **Convergence of designs** as the learning loop starts (D33 caps, exploration slot, novelty penalty).
- **MariaDB 10.4**: claim queue without `SKIP LOCKED` is tested at concurrency; SQL stays portable.
- **Hostinger's 120 s and one process**: every cloud route has a deadline and a fallback; pulse is cheap; renders are
  queued and deduplicated (STORE-SAAS D25).

## 6. Unverified items introduced by this file

- Moroccan movable holiday dates per year (owner-typed; §1.6).
- mSPRT mixture variance τ and the 100-unique minimum (§1.8) **[to tune]**; the Beta prior α₀ = β₀ = 2 for the
  best-time learner (§1.5).
- Director critique cost ($0.30-0.70) and all cloud costs (±2×).
- Direction generation time ≤ 1.5 s on a mid Android (§4) **[measure]**; photo upload sizes after client downscale.
- `BroadcastChannel` availability in the Android browsers the sellers use (fallback: independent pollers).
- Shopify setup guide and TrueProfit/BeProfit COD behaviour (**[secondary]** sources only).
- Whether "Ettajer Diagnostics" overlaps Store Health (its page names it without detail).

## 7. Sources

Competitors (vendor pages, read 2026-10-24): https://youcan.shop/en/help/blog/confirm ·
https://youcan.shop/en/help/settings/shipping-zones · https://youcan.shop/en/blog/posts/newsletter-december2025 ·
https://youcan.shop/en/help/checklist · https://ship.youcan.shop/en/our-services ·
https://help.youcan.shop/hc/en-us/articles/35317034450205 · https://lightfunnels.com/ ·
https://docs.lightfunnels.com/cash-on-delivery/ · https://apps.shopify.com/releasit-cod-order-form ·
https://www.shopify.com/magic · https://www.egrow.com/en/cod-management-tool · https://www.codcrm.ma/ ·
https://codflow.ma/ · https://ettajer.com/ · https://wedocod.com/ · https://yanmo.ma/ ·
https://trueprofit.io/blog/trueprofit-vs-beprofit [secondary].

Design, UX and methods: https://linear.app/enablement/guide/navigating-linear ·
https://linear.app/now/how-we-redesigned-the-linear-ui · https://vercel.com/design/guidelines ·
https://baymard.com/blog/shipping-speed-vs-delivery-date · https://baymard.com/blog/checkout-flow-average-form-fields ·
https://arxiv.org/abs/1512.04922 · https://www.evanmiller.org/how-not-to-run-an-ab-test.html ·
`qa/ref/anti-slop-frontend-rubric.md` (local copy).

Platform facts: https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/ ·
https://mariadb.com/docs/release-notes/community-server/10.6/10.6.0.md ·
https://developers.facebook.com/docs/marketing-api/conversions-api/offline-events ·
https://developers.facebook.com/docs/whatsapp/cloud-api/guides/sell-products-and-services ·
https://huggingface.co/Xenova/siglip-base-patch16-224/tree/main/onnx ·
https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/tree/main/onnx ·
https://platform.claude.com/docs/en/about-claude/pricing.md (prices as recorded in `docs/saas/research/ai.md` §3.2).

Repo documents: `docs/STORE-GEN-BRIEF.md`, `docs/HANDOFF.md` §2-§5, `docs/saas/RESEARCH.md` §2-§4,
`docs/saas/research/{platform-admin,storefront,cod-ops,design-gen,ai}.md`, `docs/STORE-SAAS.md` §0, §A.3, §I,
`docs/saas/TENANCY-MAP.md` (ADM-02, ADM-26, ADM-28..31, GEN-06, GEN-12).
