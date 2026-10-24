# Store Gen SaaS part spec: design (genome, anti-repetition, quality gates, brand kit, logo designer, generation flows, admin design system)

Status: **part spec, revision 2 (elevated)** (2026-10-24, design part architect, owner brief item 16). Not yet
reviewed (DES-§28 is empty). Built on `docs/STORE-SAAS.md` **revision 2** (the core contract, cited as **core §X**; its
appendix §Q.6 decided every request of revision 1, and this revision's text follows those decisions), on the settled
research decisions of `docs/saas/RESEARCH.md` §2 (cited as **R-D1 … R-D53**), and on the three elevation inputs: the
measured baseline `docs/saas/research/design-baseline.md` (score 4.3/10, distinctiveness 2/10; its §5 targets are cited
as **N1 … F5** and every one of them is a gate here, DES-§8.10), `docs/saas/research/rethink-ai.md` (the Director loop,
cited **rethink-ai §n**) and `docs/saas/research/rethink-features.md` (Design DNA made visible, the admin UX ceiling,
cited **rethink-features §n**). It covers every design feature id **DG-01 … DG-19**, every admin design-system id
**UX-01 … UX-08** (RESEARCH §3.9, §3.10) and the signature feature **SF-02 Design DNA** the core assigned to this
track (core §L.2), with scope, release and acceptance criteria. Section ids carry the prefix **DES-§** so
cross-references to the core (`core §E.2`) and to the sibling part specs (`ai.md AI-§A.6`, `platform.md PLA-§6.3`,
`storefront.md STO-§8.4`, `landing.md LAN-§6`) stay unambiguous.

This document may refine only the tables core §D.9 assigns to the design part (`design_genomes`, `headline_shingles`,
`store_themes`, `design_archive`, `gene_stats_*` shared with ai) and the schemas of the settings `brand` and
`platform_design` (core §D.10). Everything else it needed from the core was requested in revision 1 and is decided in
core §Q.6 (DES-§27 records the decisions); the few second-round requests this revision could not avoid are in
DES-§27.2. Nothing here edits the core.

Inputs: `docs/STORE-GEN-BRIEF.md` items 4, 8, 14, 15, **16** · `docs/HANDOFF.md` §2 (owner rules) · core revision 2
(mostly §0 D37, D51-D53, D59-D64, §A.3, §D.5-D.6, §D.10, §E, §F.1-F.2, §H.2-H.3, §I.3-I.8, §J, §K.2, §L.3, **§M**, §Q.6)
· RESEARCH §2-§4 · `docs/saas/research/design-gen.md` (the area study, cited **dg §x**) · `design-baseline.md` (entire:
§1 method, §2 scorecard, §3 evidence, §4 root causes with `file:line`, §5 targets, §6 keep-list) · `rethink-ai.md` §0-§1
(Director loop, rubric v3 precedence, render digest, vision tiles, the 120 s wall), §9 (17 changes) · `rethink-features.md`
§1.2 (Design DNA), §2 (admin UX ceiling), §3 (catalog delta), §4 (the 3-minute wow demo = R1 acceptance) · the anti-slop
rubric `qa/ref/anti-slop-frontend-rubric.md` (adopted where it does not conflict with the owner rules: its orange-family
palette rows §4.2 are void, its serif ban is replaced by the pairing rules of DES-§10, Arabic has its own type rules in
DES-§10.5; its §4.5-4.7 and §9 tells are detectors here) · `docs/saas/spec/ai.md` revision 1 (AI-19a Director brief,
AI-§A.6 CopyRequest v2, AI-§D.2 guard v2) · `landing.md` revision 1 (LAN-§6 honesty rules, LAN-§7 delivery line) ·
`storefront.md` revision 1 (STO-§8.4 registers) · `docs/saas/TENANCY-MAP.md` (GEN-01 … GEN-14) · the baseline renders in
`qa/saas-baseline/` (git-ignored; 41 documents, 123 shots, `index.json` with per-page heights and section orders). Code
facts are `path:line` at commit `a0ffec1` (the revision 1 facts at `15c9cef` were re-verified and still hold; `src/` has
not changed). Next.js is 16.4: nothing in this part touches `src/proxy.ts`, routing or the request hook; server actions
follow core §E.2.

Frozen for the whole of R1 and untouched by this revision: landing **PageDoc v2** (the one additive, optional,
default-free change `ThemeSpec.look` of DES-R1 is accepted and applied by the maintainer in C0, core §K.1), **runtime
config v2**, **order payload v2**, the **PHP export** and the landing runtime chunk at **24,200 B gz**
(`src/landing/runtime/budgets.json:3`). Every rule in this document compiles to CSS tokens, `<html>` attributes,
server-rendered markup and planner choices: **zero runtime JavaScript bytes** (DS24).

Reading order for a build agent: DES-§0 (decisions) → DES-§1 (your feature rows) → **DES-§8.10 (the baseline target
coverage map: which gate owns which target)** and **DES-§8.12 (root causes made impossible by construction)** → the
track you own (DES-§26) → the sections your files touch → DES-§25 (tests you must keep green) → DES-§29 (what changed in
this revision and why) → DES-§27 (how the core decided the requests).

### Owner summary (plain English)

1. Today two shops that sell the same kind of product get almost the same page: the same hero, the same chips on the
   photo, the same giant word behind the product. Only the colours and the font change (we checked this on 41 rendered
   pages). The fix is a **design DNA ("genome")** of 31 choices: layout family, grid, fonts, colour strategy, photo
   treatment, shapes, motion, voice. A few bold choices are drawn at random within what suits the product; every other
   choice follows design rules, so the result looks decided, not random.
2. Every new page is compared with every live shop on the platform (by numbers only: nobody ever sees another shop's
   design). If it is too close, the system draws again before you see it. A design already live in a shop is reserved
   for that shop.
3. Before anything is published, automatic **design checks** run in a few milliseconds: contrast, spacing, the "AI look"
   (too much frosted glass, the same rounded corners everywhere, three identical cards, giant ghost words, rotating-text
   badges, "Edition 01" labels), clichéd phrases in Arabic, French and English, and headlines too close to another shop's.
   Most problems are fixed automatically; the rest are explained in a **Design check** panel with a one-click fix.
4. Copy rules get stricter: no long dashes used as decoration, no "Découvrez l'univers…", no "اكتشف عالم…", no empty
   superlatives. Copy must name real things about the product (its facts, your numbers, how it feels, cash on delivery).
5. Each shop gets a **brand kit**: logo, colours, fonts and voice. In R1 you upload a logo and lock colours and fonts; every
   new page follows them. Orange is never produced: if you pick an orange, the picker moves to the nearest allowed colour
   and says so. An uploaded logo file is never changed.
6. In R2 a **logo designer** draws real letter shapes (Arabic joined correctly, Latin optically spaced) with exactly one
   deliberate design idea, plus monograms built on a grid. It exports logo, favicon, app icons and social images. No
   badges, seals, stamps or hand-drawn marks.
7. A whole shop (home, collections, product pages, checkout, emails) shares one brand. Landing pages either follow the shop
   look or run as a "campaign" that may vary its layout but stays recognisably the same brand.
8. Your own dashboard and the sellers' dashboards get a precise, calm design system (Linear / Vercel / Stripe level):
   one jade accent for sellers, teal for your control room, violet when staff view a shop, compact density, fast motion
   with no bounce, charts with real data only.
9. Quality is measured, not claimed: on a fixed set of 200 generated pages the median design score must be at least 82
   of 100, no hard failure may remain, and the three directions of one run must be clearly different.
10. What you need to do: nothing for R1. When cloud AI is on, a "Director" (the strongest model) can suggest design
    directions; the design engine still checks and builds everything itself.
11. **New in revision 2.** We measured what today's generator produces: 39 of 39 pages had the same 27-section order,
    23 of 39 the same hero, two or three photos repeated up to 64 times, invented numbers and reviews on every page,
    32 to 38 phone screens before the end. Every one of those findings is now a rule the server checks before a page
    goes live: the page is refused with a named reason and a one-tap fix, never a generic error (core §M).
12. A page now has budgets a designer would recognise: 8 to 14 sections, at most 14 phone screens, the order form on
    the first four, at most 6 buttons, at most 2 frosted surfaces, reveals on headings only, every photo used at most
    3 times in different crops, a small label above at most one section in three, one easing family. Each budget has a
    measured threshold and a test.
13. Arabic gets its own typography rules: headlines break on whole lines, never on single words, never ending on
    "من" or "في"; display faces are chosen from eight modern Arabic families, never a decorative one; prices, phones
    and ranges always read left to right; nothing Arabic is rotated or set on a circle.
14. Everything above works with cloud AI **off**: the 3-minute demo (sign up, drop photos, publish, order, confirm)
    runs on the rules engine alone and must pass with distinct designs for two shops using the same photos.
15. Before the design work is called done, the same three expert judges re-score the regenerated pages on the same 11
    questions: the overall score must reach at least 7.5 of 10 (today 4.3), no question below 6, and
    "distinctiveness between pages" at least 8 of 10 (today 2).

---

## DES-§0 Decisions at a glance

R-D35 … R-D41 are the design decisions this spec builds on, adopted as settled; R-D33 (gene statistics) and R-D37
(cross-tenant headline check) are shared with ai.md. Rows marked **refines** or **deviates** say why.

| # | Decision | Why |
|---|---|---|
| DS1 | **Design Genome v1 = 35 genes** (G1 … G31 of revision 1 plus the four **rhythm genes** G32 opener and kicker budget, G33 photo-use plan, G34 CTA plan, G35 reveal plan, DES-§4.2) in three levels: brand (store-stable), page (per generation), section (per instance). The archetype becomes gene G1 `vibe`, a **prior** over the other genes, never a lock (R-D35, GEN-06). The rhythm genes are solved, never sampled; they exist so the baseline's rhythm faults (C5, I1, R1, R5) are decided by the planner and checkable before render. | Sameness comes from archetype locks (`src/lib/theme/tokens.ts:419-433`), 3 storylines (`src/lib/generator/plan.ts:90-97`) and sibling-only anti-repeat (`src/lib/generator/directions.ts:455-470`); dg §0.1; design-baseline §4.2 root causes 2, 4, 5, 9. |
| DS2 | **Where the genome lives:** the full genome (all 31 genes, seed, explanation) is a row in `design_genomes`; the **render-relevant part compiles to an optional `ThemeSpec.look`** (≤ 700 B JSON, no default) inside the PageDoc. **Deviates R-D35** (which put `PageDoc.design.genome` in the doc): only the compiled look enters the doc. | The PageDoc is frozen and `z.object` strips unknown keys; an optional field without a default leaves every existing doc's validated JSON, and so its published checksum (`src/lib/db/boot-tasks.ts:24-47`, sha256 of `validateDoc(doc)`), unchanged. The doc stays self-contained for re-renders (core D50) and exports; the genome row is history and the novelty index. Request DES-R1. |
| DS3 | **Bold genes are sampled, the rest are solved.** Six bold genes (G1 vibe, G2 composition grammar, G4 type pairing, G9 colour strategy, G18 image treatment, G28 voice register) are drawn from priors; the other 25 come from a seeded, deterministic constraint solver (forward checking + backtracking, ≤ 200 node expansions, cheapest gene first). | dg §0.3: designers make a few strong decisions and keep the rest quiet; many independent random knobs give noise (R-D35). |
| DS4 | **Precedence at render:** an explicit non-`"archetype"` ThemeSpec value (today's builder fields `radius`, `shadow`, `texture`, `surfaces`) > `look` > the archetype default. A doc without `look` keeps today's theme tokens and `<html>` attributes; only the owner-rule fixes of DES-§4.5.4 (redrawn seal/stamp/tape/ticket variants, no rotating ring, no numbered cover lines) and DS28 (spring overshoot) change how it renders, at its next render (DES-§23.1). | Back-compat for every published page; the builder keeps working while it learns to edit `look`; owner rules apply to old pages too. |
| DS5 | **Seeds mix the store's brand seed:** `seed = deriveSeed(stores.brand_seed, inputHash, "direction:<i>", attempt)`. | Identical photos in two stores diverge (GEN-12, R-D36). |
| DS6 | **Distance thresholds** (starting points, calibrated by DG-09): platform-wide d ≥ **0.25**, same niche d ≥ **0.40**, pages of one store d_page ≥ **0.30** (against its last 10 pages), campaign brand radius d_brand ≤ **0.35**; `clone` = d < **0.12** (the wording level "almost identical"). **Changed in rev 2 (core §M.4, core §Q.6 DES-R3 A\*, baseline N1/N2 "hard"):** at publish every `too_close` band (below the niche, platform or own-page threshold) is a **hard** `design_blocked` item (`design:N1`, `design:N2`), not only the 0.12 clone; `close` (within +0.05 of the threshold) is a soft note with the one-click "Differentiate". First come keeps its design: the earliest pool row in a collision is never the one refused. The wizard never shows a `too_close` candidate (it resamples, DES-§14.2), so the server refusal is the backstop, not the normal path. (R-D36) | The baseline measured twins at 15 % and J 0.33 inside a niche; a warning-only threshold would let the first beta stores clone each other on day one. The core made N1/N2 hard at publish; this spec follows it and keeps the seller's path smooth by never proposing a candidate that would be refused. |
| DS7 | **The distance service answers verdicts, not numbers:** clients get `ok` / `close` / `too_close` per candidate; raw distances stay on the server (logs, calibration). Requests are rate-limited per store. **Refines R-D36** ("returning scores only"). | A numeric distance oracle can be probed to reconstruct another store's vector; a coarse verdict can't. The core adopted it in rev 2: §F.2 and D64 now say "verdict bands only, never another store's genome or text" (DES-R17 accepted). |
| DS8 | **Cross-store checks read only live and reserved genomes** (published pages, active store themes). Generated-but-unpublished rows influence only their own store. A genome stays reserved 90 days after its store leaves `active`/`restricted`. | First-come fairness (R-D36) without letting a tenant flood the index from the wizard. |
| DS9 | **Headline check = bottom-k MinHash** (k = 256) per (niche, store) over HMAC'd word-3-gram shingles in `headline_shingles`; in-store Jaccard > 0.5 and cross-store containment > 0.35 resample generated copy. Owner-typed copy is only flagged. (R-D37, core D35) | Bounded rows per store (≤ 256 per niche; a store's live headlines rarely exceed 300 shingles, so most sketches are exact), no plaintext, no store id (only the opaque `owner_tag`), deletable at purge. |
| DS10 | **Quality gates are pure TypeScript** on `PageDoc + BuiltTheme + asset metadata + genome`, ≤ 8 ms per doc in Node. They run in the wizard, the builder (client, 400 ms after the last edit) and on **save** (server, `warn` mode, summary stored), and **authoritatively at publish** through the one core registry `src/lib/render/prepublish.ts` (core D51, §M; the design check is `src/lib/render/prepublish/design.ts`, P6). Hard fails answer `design_blocked` with core `GateItem[]`; soft items lower Q and appear as notes and as Store Health design issues (core §I.7). Budget gates (`budget:*`, core §M.2) and honesty gates (`honesty:*`, landing LAN-§6, core §M.3) are the core's and landing's; this part supplies the measurement modules they call (`src/lib/design/heights.ts`, `variantFeatures`, DES-§5.3, §8.4) and never duplicates their hard refusals. (R-D39) | No headless browser on Hostinger; the server re-check means a modified client can't publish a failing page; one registry means one dialog listing budget, honesty and design items together (core §M.1 precedence budget → honesty → design). |
| DS11 | **Deterministic repairs first**, from a closed `RepairOp` vocabulary, at most 3 rounds, keep the best of {original, repaired} by score; AI critique (AI-19, R3) proposes ops from the same vocabulary and is kept only when the score rises. | R-D39; dg §5.4. One vocabulary for rules, the local model and the Director. |
| DS12 | **Slop score** = the dg §5.2 list **plus the tells seen in the baseline renders** (giant ghost word, rotating-text ring badge, masthead/number eyebrows, glass callouts piled on the hero photo, decorative status dots, two scrolling strips, identical section headers; rev 2 adds per-word reveal spans, the chat-mock problem block, phone-mock reviews, the countdown chip, the giant cut-off footer wordmark, the hotspot trio without merchant anchors and the **tell budget** R8: at most 2 of the 11 named devices per page, never the same pair twice in a niche). ≥ 6 is hard (`design:S00`), 3-5 triggers repair. **Refines R-D39.** | `qa/saas-baseline/shots/argan-default-ar-s7-mobile-fold.png` and `…-s4242-…` show the same composition across seeds; `tshirt-kinetic-ar` shows a rotating-text ring and a clipped Arabic ghost word; `argan-editorial-ar` shows "الإصدار 01 · العناية" (the "Brand · No. 01" tell, rubric §9.F); design-baseline §3.7 lists all eleven devices on every page. |
| DS13 | **Em and en dashes are not used as separators in generated copy**; the cliché detector rewrites them (period, comma or colon by context). Owner-typed text is flagged, never rewritten. **Refines DESIGN.md §8.** | The rubric's #1 tell (§9.G); today's library has them ("Douceur, confort, éclat — au quotidien", `src/lib/ai/copy-library/fr.ts`). |
| DS14 | **DESIGN.md v3** turns the 2026 tells into **budgets** (glass ≤ 2 per page, a 4-tier radius ladder, 1 hero signature + ≤ 3 secondary details, bento ≤ 1, ≤ 2 centred sections in a row, no bounce outside `playground`, …) and removes every orange colour word. Written in core step C0 by the design lead. (R-D38, DG-01, GEN-14) | Every generator and build agent reads the bible first; the old one prescribes several tells (dg §0.2). |
| DS15 | **Store coherence:** one Brand Genome per store across three registers (marketing, commerce utility, transactional); landing pages choose `store` (inherit) or `campaign` (page genes vary within d_brand ≤ 0.35). In R1 (landing-only stores) the brand kit's locks feed every new generation. (R-D41) | One brand everywhere while landing pages keep varying. |
| DS16 | **Brand kit storage:** R1 = store setting `brand` (logo asset ids, colour and font locks, voice pointer); R2 = versioned `store_themes` rows (Brand Genome, compiled theme, locks, logo parameters and export asset ids). A brand change in R2 enqueues `render_jobs` reason `brand` for every live inherit page (core §H.3). | Setting first keeps R1 small; versions make R2 brand changes reversible and auditable. |
| DS17 | **No-orange brand colours** (core D37, `allowSellerBrandOrange = false`): `nearestAllowed(hex)` moves a picked or extracted colour out of OKLCH hue 25-75° (chroma > 0.06) to the side with the smaller ΔE OKLab, or drops chroma to 0.06 ("sand") when that is closer; the UI shows the before/after swatch and a one-line note. An uploaded logo file is never recoloured; the palette taken from it is. | Owner rule 1 and the lead default. |
| DS18 | **Logo engine = harfbuzzjs shaping on the shipped OFL fonts, converted once from WOFF2 to SFNT at build time** (`scripts/build-logo-fonts.mjs`), outlines to SVG paths, deterministic and isomorphic (browser preview, Node export from parameters). Never live text. (R-D40) | HarfBuzz is the only correct Arabic shaper (opentype.js has no joining, dg §7.2); HarfBuzz reads SFNT, not WOFF2; the 27 fonts already ship (`src/lib/theme/fonts.generated.ts:50`), so no font download is needed. Request DES-R6 (package) and DES-R7 (prebuild). |
| DS19 | **Craft moves come in two tiers:** contour moves (tittle swap, weight shift, baseline shift, counter accent, ligature join) need no boolean geometry; cut moves (stem cut, terminal trim, monogram interlock) use `clipper-lib` on flattened outlines. Until the package lands, cut moves are disabled and the engine still offers five moves. | Robust boolean ops are hard to hand-write; Clipper is zero-dependency integer geometry. The designer never waits on it. Request DES-R6. |
| DS20 | **PNG exports use `sharp`** (already a dependency, `package.json`) to rasterise path-only SVG. **Deviates dg §7.1** (`@resvg/resvg-js`). Fallback: the browser rasterises with canvas and uploads through the media pipeline. | No new native binary on Hostinger (resvg's prebuilt binary is unverified there, RESEARCH §6.2); path-only SVG needs no font loading. |
| DS21 | **The admin design system has one source:** a 3-input OKLCH generator (base hue, accent, contrast) produces every admin token at build time in `scripts/build-admin-css.mjs` (core §I.6); surfaces tenant (jade 166), console (teal 205), impersonation (violet 295), the rev 2 status pair `--info` / `--info-ink` at hue **250** (core §I.6, OPE Q.16); **no bounce anywhere, today's shell included** (core D60): `--ui-spring` (`src/app/globals.css:120`, used at `:225`) is removed, the sidebar pill spring (`src/components/admin/shell/app-sidebar.tsx:96`, `stiffness: 480`) becomes a tween, the generate icon's `ease-[cubic-bezier(.34,1.36,.64,1)] group-hover/gen:rotate-12` (`:146`) goes; aurora + grain are a budget of one per screen and off by default (`dashboard/kpi-card.tsx:58`, `common/empty-state.tsx:28`); sparklines need ≥ 7 points (`kpi-card.tsx:92` draws from 2); delta chips use semantic tokens (`kpi-card.tsx:75` uses Tailwind `emerald`/`rose`). Arabic UI face = **IBM Plex Sans Arabic** (400/500/700, already in `public/fonts`). `test:admin-motion` fails on springs, overshoot curves and any duration above 400 ms outside the builder canvas (core §I.6). | Linear's method (dg §9); core §I.6 asks design.md to pick the Arabic face; Plex Arabic is a UI face with compact proportions at 13-14 px and ships today; rethink-features §2.1 rule 4, §2.5, §2.6 name the three admin habits that break the owner's own rules. |
| DS22 | **MAP-Elites archive cells hold platform designer seeds and counts, never another store's genome.** Direction 3 explores an under-filled cell by its coordinates only. **Refines R-D36 / dg §4.5.** | Using a tenant's elite genome as another tenant's template would leak and clone designs. |
| DS23 | **Director hints (AI-19a, ai.md AI-D18) enter the sampler as `GeneHints`** (a closed vocabulary of gene values with weights ≤ 3×); the solver, the gates and the novelty check still decide. A hint that breaks a hard rule is dropped and logged. | Brief item 16 wants the strongest design thinking; the deterministic engine stays the authority (R-D30 spirit for design). |
| DS24 | **Landing PageDoc v2, runtime config v2, payload v2, the PHP export and the 24.2 KB landing chunk are untouched.** Genes compile to CSS tokens, `<html>` attributes and planner choices only: zero runtime JS bytes. A new render budget key `css` caps the inlined CSS growth at +4 KB gzip on the heaviest page. | Frozen contracts (core §K.3, LND-16). Request DES-R5. |
| DS25 | **Measurable quality targets** (brief item 16) on the DG-09 corpus: median Q ≥ 82, minimum Q ≥ 70, 0 hard fails after repair, median slop ≤ 2, median distance between the 3 directions of one run ≥ 0.35, ≥ 7 of 9 grammars over 20 runs of one input, 0 em dashes in generated copy, median cliché density ≤ 0.5 per 100 words; **plus every §5 target of the baseline at its threshold** (DES-§8.10: ≥ 60 distinct in-flow sequences per 100 pages in one niche, no 4-section subsequence on > 50 %, ≥ 150 distinct first-screen tuples per 210 plans, hero family ≤ 30 % per niche, top pairing ≤ 25 % per archetype, …) **and the re-scored critic consensus ≥ 7.5 / 10 with no dimension < 6 and distinctiveness ≥ 8** (design-baseline §5.10; DES-§17.6). The design track is "done" only when all three groups hold on the merged build (core §K.2 exit criterion 10). | "Highest quality bar" must be checkable; numbers are starting points the calibration may raise, never lower without the owner; the scorecard that found 4.3 is the one that must find ≥ 7.5. |
| DS26 | **The generator stays client-side; novelty is one batched server verdict per wizard run.** The browser samples 3 directions plus up to 3 alternates each (≤ 12 candidates, genome + plan only, no full docs), sends their distance views to `checkNoveltyAction`, and builds full docs only for the chosen candidates. Publish recomputes the vector from the doc on the server. | The wizard already generates in the browser (`src/components/generate/wizard.tsx:777`); 12 small vectors cost one request and ≤ 25 ms of server time; a lying client only fools its own preview, never the publish check. |
| DS27 | **The novelty certificate is shown in words, never numbers** ("Distinct across the platform", "Distinct in your niche", "Distinct from your other pages"), each from the DS7 verdict bands. **Refines** rethink-features §1.2, which showed raw distances. | Raw distances to "the nearest store" are an oracle (DS7); bands carry the promise without the leak. |
| DS28 | **No bounce outside `playground`, measured as overshoot:** easing curves with y1 < 0 or y2 > 1 and springs with ζ < 0.85 (overshoot > 0.6 %) are allowed only on `playground`, never on layout properties. `SPRINGS.soft` moves from ζ 0.78 to 0.86; `bouncy` (ζ 0.56) stays playground-only. The admin uses no spring at all. **Refines R-D38.** | Seven archetypes use the 0.78 spring today (`src/lib/theme/archetypes.ts:337,409,555,700,772,844,988`, ≈ 2 % overshoot), which reads as a soft bounce; owner rule 2 and rethink-features §3.4. Old pages change only at their next render. |
| DS29 | **A genome reservation lasts 90 days or until the store is purged, whichever comes first.** Purge deletes `design_genomes` (core §F.9) and nothing anonymous is kept. **Refines R-D36** ("release after 90 days"). | A purged tenant leaves no data behind (core §F.9); a closed store reaches purge after ≥ 31 days, which still covers the copy-a-departing-store risk the reservation targets. |
| DS30 | **DG-14 compiles e-mail and packing-slip tokens only; the PHP export does not change.** **Deviates RESEARCH DG-14** ("shared with the PHP export"). | The PHP export is a frozen contract (core §K.3, R1.0 exit criterion 4); its pages already embed the published theme CSS. |
| DS31 | **DG-12 sliders and seed history are R3 (track D4); the DNA card and the "why this design" line ship in R1 (GN-1); "Bolder / Calmer" remix steps ship in R1 as one Boldness step each** (DES-§14.7). **Changed in rev 2:** revision 1 kept the sliders in R2; the core decided R3 (core §L.2 DG-12, rethink-features §3.3) and this revision follows it. The two remix steps keep the day-one "make it calmer" request answered without the studio. | The R1 surface is already wide (core §K.2); one Boldness step costs S and covers the common ask; the studio with four sliders and seed restore waits for the learning data that makes "seed history" worth reading. |
| DS32 | **R1 favicon fix without fonts:** when a store has no logo, the favicon and the header placeholder become a **construction-grid monogram** (24-unit grid, stroke skeletons for A-Z and 0-9, pure geometry, ≈ 6 KB) for Latin initials, or the brand glyph in its enclosure for an Arabic-only name; the `system-ui` `<text>` monogram is retired. HarfBuzz-shaped Arabic initials arrive with DG-10 (R2). | Today's favicon renders differently on every OS (`src/landing/document.tsx:189-201`); the grid monogram needs no package and no font, so it can ship in R1. Request DES-R11 (accepted as a maintainer CCR, core §Q.6). |
| DS33 | **Every §5 target of the design baseline is a gate with its threshold and level**, owned by exactly one module: `design:*` (this part, `src/lib/render/prepublish/design.ts` and the gates), `budget:*` (the core, `prepublish/budget.ts`: F5, C3, F1, C2, R1, R4, R5, K2, I1), `honesty:*` (landing, `prepublish/landing.ts`: I4, I5, D1, D2, LP-21). The full map is DES-§8.10; a target that two modules could measure is measured by one and only reported by the other (never two refusals for one fault). | design-baseline §5 (the owner's "measurable targets"); core D51/D52 and §M fixed the registry, the codes and the budget thresholds; a seller must see one list with one fix per item. |
| DS34 | **The engine authors structure; the model directs** (rethink-ai §0.1, §1.1). Every guarantee (no orange, AA, COD invariants, honesty, distinctness, the budgets) is a property of the deterministic engine; the Director (ai.md) briefs directions as `GeneHints`, picks among gate-passing `GenomeCard`s, critiques against **rubric v3** (precedence: owner rules → DESIGN.md v3 budgets → the gates and the slop score → compatible anti-slop items) with a mechanical **render digest** this part computes (`renderDigest`, DES-§8.9), and proposes repairs only from the closed `RepairOp` vocabulary. **The engine-only path (Cloud AI off) passes every gate**: the 3-minute wow demo runs with it off (core §K.2 exit criterion 12, rethink-features §4). | Brief item 16 asks for the strongest design thinking and for a product that never waits for a model; a bad model day can then never ship a bad page. |
| DS35 | **Kickers are a budget, openers are a grammar.** The kicker (eyebrow) appears on at most ⌈n/3⌉ in-flow sections (hero counts as one) and never on two neighbours; every section opens with one of ≥ 6 **opener structures** (bare headline, caption column, number-led, quote-led, image-first, kicker + headline + lead), with no opener on > 50 % of sections and the hero's emphasis device (swoosh, highlight) on the hero only. `PageCopy` kickers become optional in the copy schema (P7, `src/lib/ai/copy-schema.ts:113-151`, core §K.2 P7 row); the renderer's `SectionHeader` gains an `opener` prop. | Baseline C5: label pill → H2 → lede ≈ 22× per page; rethink-ai §0.4, §9.9; rubric §4.7 eyebrow restraint. |
| DS36 | **A photo-use plan per page**: every merchant asset is assigned ≤ 3 appearances (sticky bar and form thumbnail excluded, ≤ 2 for the primary image at the same crop) with **role diversity** (hero, detail, context, proof, offer) and ≥ 3 distinct crops from the focal point; sections that would need a fourth appearance are dropped from the grammar or switched to a photo-free variant before the doc exists. The budget gate `budget:I1` (core §M.2, > 4 hard) is then never reached. | Baseline I1-I2: one `src` in 14-19 slots at one crop; design-baseline §3.4. |
| DS37 | **A typography engine, not a pairing list**: per pairing and locale the compiled type tokens come from measured font metrics (`FONT_DATA.metrics`: `xHeight`, `capHeight`, `ascent`, `descent`, `xWidthAvg`, `unitsPerEm`, `src/lib/theme/fonts.generated.ts:19-29`): Arabic/Latin size and weight harmonisation, tracking per size (Latin only), line-height per script, fluid scales from G5 with the hero display ≥ 44 px at 390, balanced whole-line headline breaking with Arabic particle binding, tabular lining numerals on every price, counter, phone and quantity. Reem Kufi leaves every display role (T4). | Baseline T1-T8 (Bodoni old-style prices, one-word Arabic lines, stranded particles, 36 px heroes, Reem Kufi as souk display, El Messiri on 52 % of ar pages); DESIGN.md §2.3 Arabic rules. |
| DS38 | **Seven colour strategies inside the no-orange guard and a two-level surface system**: strategies G9 (ink+one, duotone, color-field, tonal, dark-luxe, high-key, mono+signal; ≤ 35 % share each per niche), the pop hue derived from the accent (analogous ±30° or complement 150-210°, chroma within ±0.04; no third hue on dark bases), **one ground + one card tier per page** (nested cards forbidden; `tonal` may add one layer), ≤ 2 full-bleed accent/pop moments (color-field ≤ 4, ≤ 1 per screen), base lightness from the photo background and the strategy, and the advisory band 75-95° at C > 0.10 rendered to sRGB. | Baseline K1-K8 (4-9 slabs per page, teal on argan, panel → surface → card, pink base for argan, gold at hue 85-90° near the gate); DESIGN.md §2.2. |
| DS39 | **Motion signatures are tokens with budgets**: six easing families (G23), durations 180-900 ms from one family per page, 1-2 reveal kinds, **reveals on the hero and section heads only** (≤ 60 `[data-reveal]` nodes per page; the budget gate `budget:R5` refuses > 120), ≤ 1 signature animation per section, no overshoot outside `playground` (DS28), whole-line text reveals (no per-word spans), `prefers-reduced-motion` = opacity only. | Baseline R5 (343-397 reveal nodes), R8 motion noise, T2 (per-word spans break bidi and strand particles); owner rule 2 "smooth and precise". |
| DS40 | **CTA plan**: ≤ 6 primary CTAs per page (sticky bar counts as 1; `budget:R1` hard above 8), ≤ 2 visible at once on mobile, the header CTA hidden while the hero CTA is in view, the WhatsApp float collapsing into the sticky bar when the bar shows, ≤ 1 fixed bar + ≤ 1 float, fixed UI ≤ 88 px of 844, the pack/offer picker rendered once (in the form; the `offer` section is a showcase without a picker when the form has one), trust strip once, countdown once and only with a merchant end date, urgency as a chip in the form, never a section. | Baseline R1-R3, R7 (58-68 `.lp-btn`, packs 2-3×, trust strip 3×, countdown 3×, three floating layers colliding); design-baseline §3.5-3.6. |
| DS41 | **A fold contract per hero family** (C2): at 390 × 844 the product image, the price, one primary CTA and the COD line are inside the first 844 px for every hero family and locale; each family declares its fold layout in the registry (`features.fold`), the height model checks it statically and the core's Playwright gate checks it on the render (`budget:C2`, core §M.2). | Baseline: price and CTA below the fold on 23 of 39 heroes; paid traffic lands on the fold. |
| DS42 | **Honesty of design devices is structural**: `beforeAfter` needs two distinct merchant images, `video` a file or URL, `gallery` / `ugc` / `lookbook` ≥ 3 distinct assets, hotspots merchant-placed anchors, stats and counters merchant numbers, photo credits merchant-typed; the planner's reservations refuse the variant **before** generation and landing's honesty gate refuses it at publish (`honesty:I4`, `honesty:I5`, `honesty:D2`). The copy library's figure tables (`src/landing/sections/stats/copy.ts:55-69`) are never rendered as data again. | Baseline §3.4, §3.7 (desaturated clone slider, still "video", "94 % … questionnaire", "4,7 (312)" on every page); owner rule 4; core §M.3. |
| DS43 | **Verification = the baseline method re-run**: the same 7 fixtures × ar/fr × 10 seeds (140 plans) and the 41-page render set, the same `index.json` schema extended with `genome`, `gates[]`, `slop`, `Q`, and the same three critic passes on the same 11 dimensions; targets consensus ≥ 7.5, no dimension < 6, distinctiveness ≥ 8 (design-baseline §5.10). Until that report exists on the merged build, DG-02 … DG-09 are not "done" (core §K.2 exit criterion 10). | A score measured once (4.3) is only beaten by the same measurement; brief item 16 asks for "measurable quality targets, then adversarial review". |
| DS44 | **One register per Arabic page and French that agrees with the product name**: G31 fixes the register for questions and answers alike (`design:D3` hard when a FAQ pair mixes registers); `{product}` carries gender and article metadata in the copy library (`ProductRef = { text, gender: "m" \| "f" \| null, article: "le" \| "la" \| "l'" \| null }`) so templates render "ce sérum / cette huile" (`design:D4` grammar lint on article + noun). | Baseline D3-D4 ("Ce que change Sérum à l'huile d'argan pure, au quotidien"; MSA ledes with Darija FAQ questions and MSA answers). |
| DS45 | **The brand voice has one source**: `BrandSetting` no longer stores a register; G28 / G31 read `store_ai.voice.register` / `.darija` and `brand.voiceSummary` is derived read-only (core §D.10 `brand` row, AI R24). The brand page's Voice tab writes `store_ai.voice` through ai.md's action. | Two copies of a voice drift; the core decided one source. |
| DS46 | **Store Health carries the design signal** (SF-03, core §I.7): the rules file `src/lib/health/rules/design.ts` (P6) contributes `design:q_low` (a live page with Q < 70), `design:slop` (slop ≥ 3), `design:pages_close` (two live landings with d_page < 0.30) and `design:no_dna` (a live page generated before design DNA, severity 1), group `design`, cap 15; `designHealth(scope)` is the P0 stub the `platform.health` job calls. The score never gates; publish gates are DES-§8.8. | rethink-features §1.3; core D53, §I.7, §K.2 P0 list. |

---

## DES-§1 Feature map: scope, release, track, acceptance

Release and track per core §K and §L.2. "Acceptance" is what the verification agent checks; each row points to the section
with the detail and to the tests of DES-§25.

### DES-§1.1 Design generation and logo (DG-01 … DG-19)

| ID | Feature | Rel. | Track | Scope | Acceptance | Spec |
|---|---|---|---|---|---|---|
| DG-01 | DESIGN.md v3 | R1.0 (C0) | design lead (docs only) | Budgets table, tells list, banned list update, gene and register chapters, §2.5 attribute value sets extended, every orange colour word removed | `grep -inE "amber|terracotta|saffron|tomato|coral|ochre|apricot|peach" docs/DESIGN.md` hits only the owner-rule paragraph (§1.0, the forbidden examples); the budgets of DES-§3.2 present verbatim; §2.5 value sets equal `THEME_ATTR_VALUES` (checked by `theme:check`) | DES-§3 |
| DG-02 | Design Genome v1 | R1 | P6 | Schema (35 genes incl. the four rhythm genes), sampler, solver, compile to `ThemeSpec` + `look`, back-derivation for old docs, explanation chips, `GenomeCard` for the Director | Same seed → byte-identical genome; 11 archetypes × 3 moods × 200 seeds satisfy every hard rule; `buildTheme(compile(g))` never throws and `orangeMixes` is empty; `compile(genomeOf(docWithoutLook))` reproduces today's `<html>` attributes on every baseline fixture; N5: every archetype reachable for every category, top archetype ≤ 45 % per category over 100 simulated stores, souk/playground/garage > 0; N6: same (seedBase, archetype) across two products gives J ≤ 0.25 and never shares hero + pairing + order | DES-§4 |
| DG-03 | Unlock archetype locks + radius ladder + glass budget | R1 | P6 | `look` drives btn/card/mask/glyph/emphasis/density; 4-tier radius tokens; glass counted per page; one ground + one card tier (K5) | Over 2,000 generated docs: every gene value of G12/G15/G17/G25/G26/G27 appears under ≥ 4 archetypes; radius tiers strictly increase (or the `mixed` rule, R6); glass ≤ 2 on 100 % of pages (R4); 0 nested cards (K5); the 8 distinct theme tuples of the baseline become ≥ 150 over 210 plans | DES-§4.5, DES-§8 |
| DG-04 | Choreography grammar | R1 | P6 | Stochastic grammar replaces the 3 storylines, with hard COD invariants and a variable tail; opener grammar, CTA plan, photo-use plan, reveal plan, fold contract; reused by store page kinds | ≥ 100 distinct valid in-flow sequences over 10,000 expansions; 100 % satisfy the invariants I1-I7; form reachable ≤ 3 estimated screens on 100 %; **N3** on the 140-plan sweep: ≥ 60 distinct in-flow sequences per 100 plans of one niche, no 4-section subsequence on > 50 %, no fixed position except hero (0) and footer (last); **N4** ≥ 150 distinct (hero, benefits, form) tuples per 210 plans and ≥ 40 distinct (hero family × grammar × strategy); **C1** hero family ≤ 30 % per niche; 8-14 in-flow sections and ≤ 12,000 estimated px on 100 % (C3) | DES-§5 |
| DG-05 | Brand seed + genome distance + reservation | R1 | P6 | `design_genomes` rows, `genomeVector`, `genomeDistance`, `checkNovelty` (verdict bands), publish-time hard N1/N2, reservation reconcile job | Distance is symmetric, 0 on identical, in [0,1]; two stores with identical inputs get d ≥ 0.25 (also asserted by `qa:wow-demo`, core §J.3); responses never contain another store's id, vector or genome (attack suite); a `too_close` doc is refused at publish with `design:N1` / `design:N2`; a closed store's genomes stay reserved 90 days or until purge (DS29) | DES-§7 |
| DG-06 | Static gates + slop score + repairs + Design check panel | R1 | P6 | 37 visual/structural gates (V01-V37), 26 slop items (S01-S26), the four novelty items, the baseline target coverage map, the repair vocabulary (21 ops), Q score, panel in the builder and per direction, the registered design check in the core registry, the render digest for the Director | Gates ≤ 8 ms per doc (Node, p95 over fixtures); a baseline-like fixture scores slop ≥ 6 and ≤ 2 after repair; publish of a doc with a hard fail answers `design_blocked` with core `GateItem[]` whose ids are `design:<target>`; every design-baseline §5 hard target has a failing and a passing fixture in `test:design`; the worst baseline page fails and every §6 keep-list page passes | DES-§8 |
| DG-07 | Copy cliché + specificity detector + headline check | R1 | P6 | ar/fr/en normalisers, seed lexicons, structure tags on the copy library, specificity score, em-dash repair, register lock (D3), French article metadata (D4), MinHash headline check in-store and cross-store, `·` rationing | Library: 0 em/en dashes, every headline tagged, ≥ 3 structures per family × locale, every `{product}` template article-safe; detector flags ≥ 90 % of a 120-line cliché fixture and ≤ 5 % of a 120-line clean fixture; a FAQ fixture mixing MSA questions with Darija answers fails `design:D3`; bottom-k containment within ±0.08 of exact on synthetic sets; N8: no 3-gram shingle on > 10 % of a niche's live pages (soft), > 25 % hard | DES-§9 |
| DG-08 | Font pairing expansion + typography engine | R1 | P6 | ≥ 8 pairings per archetype (≥ 88 entries, ≥ 60 unique tuples) from the 27 shipped fonts; pairing rules; ≤ 2 preloads; the harmonisation engine of DES-§10.5 (size, weight, tracking, leading per script; balanced whole-line breaks; tabular lining numerals) | Every pairing passes the validity rules of DES-§10.2 incl. F11 (no Reem Kufi as display, T4) and F12 (concentration); every non-playful Arabic display face is used by ≥ 3 archetypes and each playful one (Marhey, Baloo Bhaijaan 2, Lemonada) by ≥ 2; `fontPreloads` returns ≤ 2 for every pairing × locale; T5 on the sweep: top pairing ≤ 25 % within an archetype, top display face ≤ 20 % platform-wide, any Arabic display face ≤ 30 % of ar pages per niche; T6: hero display ≥ 44 px at 390 on 100 % | DES-§10 |
| DG-09 | Threshold calibration corpus + verification | R1 | P6 (+ maintainer for the human review and the critic re-score) | 200 generated pages + ≥ 44 designer seed genomes; human-labelled pairs; fitted thresholds in `calibration.json`; the baseline method re-run (140 plans, 41-page render set, extended `index.json`, three critic passes) | `calibration.json` committed with version and date; DS25 targets met on the corpus or the miss recorded with the owner's decision; the re-scored consensus ≥ 7.5, no dimension < 6, distinctiveness ≥ 8 (DS43) | DES-§17 |
| DG-10 | Logo designer v1 | R2 | S2 | HarfBuzz shaping and outlines (ar + Latin), optical spacing, one craft move, Latin monogram grid, Arabic initial in enclosure, basic stacked bilingual lockup, small-size test, exports, 6 candidates in 3 families, locks, "more like this" | Arabic golden names shape with correct joining (glyph-id goldens); exported SVG contains only `svg`/`g`/`path` with palette fills; small-size test passes or a simplified favicon is produced; 12 candidates in ≤ 600 ms in the browser (mid laptop) | DES-§13 |
| DG-11 | Store theme across registers | R2 | S2 (+ S1 consumers) | `store_themes`, Brand Genome, register rules, inherit/campaign compile, brand re-render fan-out | A commerce-utility page never has glass, motion > 250 ms or accent area > 8 %; a campaign page with d_brand > 0.35 gets the "drifts from your brand" warning; a brand change enqueues one render job per live inherit page | DES-§11 |
| DG-12 | Generation studio | R1 (DNA card, "why" line, Bolder / Calmer) · **R3** (sliders, seed history, D4; core §L.2) | P6 · D4 | R1: the DNA card and the why line (GN-1) plus the two one-step remixes; R3: direction previews with genome chips, four sliders mapped to genes, seed history with restore, locks | Each slider moves only its genes (property test); restoring a seed reproduces the doc byte for byte; studio never shows a direction with a hard fail; R1: "Calmer" lowers G5.rd, G10 and moves G2 one step toward quiet-luxe and never raises Q's hard items | DES-§14.5, DES-§14.7 |
| DG-13 | Visual CI | R2 | S2 (CI scripts) | Playwright msedge 360/768/1440 × ar/fr: clipping, overflow, overlap, ghost-word legibility, SSIM near-duplicates | Runs on the DG-09 corpus in ≤ 15 min locally; a seeded clipping fixture fails; 0 failures on the corpus at R2 exit | DES-§17.5 |
| DG-14 | Email / transactional token compiler | R2 | S2 | Inline-style tokens and a PNG logo for e-mails (core §B.10 templates) and packing slips; the PHP export stays frozen | Every template renders with brand colours at AA; no CSS variables in output; snapshot tests for ar (RTL) and fr | DES-§18 |
| DG-15 | Section layout grammar | R3 | D4 | Slots × arrangements (stack, split, overlap, hang, bleed, index) declared per section; `data.arrange` | Distinct (type, variant, arrangement, align) tuples ≥ 10 × today's 91 variants; every arrangement passes RTL and 320 px checks | DES-§6 |
| DG-16 | Novelty budget + MAP-Elites archive | R3 | D4 | Inverse-frequency gene weights per niche (floor 2 %), 252 cells per niche, direction 3 explores | Over 1,000 simulated stores in one niche: no gene value share > 2 × its target; filled cells grow monotonically; no tenant genome reachable from another store's request | DES-§7.6, DES-§7.7 |
| DG-17 | Bilingual lockups + symbol grammar | R3 | D4 | Weight-balanced ar/Latin lockups (side-by-side, stacked, symbol-centred), symbol shape grammar on a module grid, golden tests on Moroccan names | 30 Moroccan name pairs: ink-weight ratio within 0.92-1.08 and perceived-height ratio within 0.9-1.1; symbols ≤ 4 primitives; designer review signs off the golden sheet | DES-§13.8, DES-§13.9 |
| DG-18 | LLM logo concept parameters | R3 | D4 (+ ai.md `logo.concepts`) | The model proposes `LogoConceptParams` only; the engine renders; gates apply | 100 % of accepted concepts parse against the closed schema; 0 raw SVG from the model reaches storage | DES-§13.16 |
| DG-19 | Squircle masks, optional vector-AI symbols, brand guidelines export, motion signature editor | later | — | Polish and opt-in extras, each gated on owner demand | Each item gets its own acceptance when scheduled | DES-§13.17, DES-§11.7 |

### DES-§1.2 Admin and design-system ids (UX-01 … UX-08)

Product behaviour of these ids belongs to platform.md (core §L.2); this spec owns their **design system**: tokens, type,
motion, density, data-viz, states, visuals. Releases follow core §L.2 and platform.md PD10.

| ID | Feature | Rel. | Track | Design scope here | Acceptance (design part) | Spec |
|---|---|---|---|---|---|---|
| UX-01 | Onboarding wow flow | R1 | P2 (+ P6 generator pieces) | The reveal composition, motion, device paths and the generator call that produces it | Reveal ≤ 2.5 s after analysis ends on a 4× CPU-throttled run (library copy); 3 directions pairwise d ≥ 0.35; no hard fail on screen; 360 px and ar RTL screenshots clean | DES-§14.3 |
| UX-02 | Store-scoped ⌘K (tenant + console) | R1 | P2, P1 | Palette anatomy, rows, groups, keys, motion, console variant | Opens ≤ 50 ms after the key (warm); keyboard-only path for every row; matches DES-§16.10 dimensions; RTL mirrored | DES-§16.10 |
| UX-03 | Console identity | R1 | P1 (+ P2 tokens) | Teal surface tokens, deep-ink sidebar, "Platform" badge, violet impersonation ribbon | `test:admin-tokens` green; ribbon text ≥ 4.5:1; badge visible on every console route | DES-§16.11 |
| UX-04 | Admin upgrade | R2 | S6 | Token generator use everywhere, density modes, motion, KPI tiles, COD funnel, empty states, split views, undo toasts | Every R2 screen passes the DES-§16.17 checklist at 1280/1440/390 in light and dark; no hard-coded colour outside tokens (lint); no bounce easing | DES-§16 |
| UX-05 | Live address card | **R1** (core §L.2, rethink-features §3.2) | P2 (card; P3 the test-link and kit entries) | Card composition, QR styling, share buttons, "Open a test order", "Create a campaign" | QR scans at 3 cm printed and on screen; ink ≥ 7:1 on its ground; the card is the last screen of the wow demo at 1:40 (rethink-features §4) | DES-§16.12 |
| UX-06 | Realtime dashboards | R2 | S6 | Live dot semantics, arrival animation, number ticks | The dot shows "live" only when the last poll succeeded < 30 s ago; arrivals animate once, never loop; reduced motion = no movement | DES-§16.13 |
| UX-07 | PWA + Web Push | R1 manifest (platform.md PD10), R3 push | P2, D5 | Manifest icons and theme colours; store app icons from the logo engine (R2) | Maskable icon safe zone (inner 80 % circle) respected; `theme_color` from tokens | DES-§16.14 |
| UX-08 | French + Arabic RTL dashboard | R2 fr / R3 ar | S6, D5 | Arabic type scale, RTL mirroring rules, numerals, chart direction | Every ar screen passes the RTL checks of DES-§16.15; no `left`/`right` physical properties in admin CSS (lint) | DES-§16.15 |

### DES-§1.3 Not in a catalog row but owned here

| Item | Rel. | Track | Note |
|---|---|---|---|
| BK-1 Brand kit basic (`/app/<h>/brand`: logo upload, colour locks, font locks, voice entry point) | R1 | P6 (DES-R2 accepted, core §K.2) | core §I.1 lists `/brand` as R1 basic with `brand.write`; no catalog id covers it. DES-§12 |
| GN-1 Genome chips + "why this design" line in the wizard directions | R1 | P6 | Explainability is part of DG-02; the sliders and seed history are DG-12 (R3). DES-§14.1 |
| GH-1 `GeneHints` intake for the Director brief (ai.md AI-19a) | R1 (flag `ai_director_brief`) | P6 | DES-§4.6, DES-§14.6 |
| **SF-02 Design DNA made visible** (rethink-features §1.2; core §L.2 row SF-02) | R1 | P6 | = DG-02 … DG-07 + the DNA card, the novelty certificate in words (DS27), the per-gene locks ("Lock for this page / for my brand"), the Design check panel; the Director review button is AI-19 (R2, S7 engine side with S1's builder mount, DES-§8.9). Acceptance: the wow demo at 0:50 shows three directions each with a DNA card and three novelty words, pairwise d ≥ 0.25, no orange, Design check green (rethink-features §4). DES-§14.1, §15.4 |
| TC-1 Baseline target coverage (every design-baseline §5 id as a gate or a fixture) | R1 | P6 (+ core budget gates, landing honesty gates) | DES-§8.10; `test:design` fixtures per id; `qa:design-corpus` reports per id. |
| HR-1 Store Health design rules (`src/lib/health/rules/design.ts`, `designHealth(scope)`) | R1 | P6 | core §I.7 (group `design`, cap 15), DS46. DES-§8.11 |
| FL-1 Design flags (`src/lib/flags/defs/design.ts`: `design_publish_gates`) | R1 | P6 | core §D.4: ops flag `"block" \| "warn"`, the mirror of `platform_design.gatesAtPublish`. DES-§2.9 |
| SP-1 ⌘K search provider (`src/lib/admin-data/search/design.ts`: pages by design tags) | R1 | P6 | core §I.3 (LAN Q18 extension point). DES-§15.5 |
| RD-1 Render digest and `GenomeCard` for the Director (rethink-ai §1.2, §1.4) | R1 (digest, cards) · R2 (preview tiles, S7) | P6 · S7 | DES-§8.9 |

---

## DES-§2 Data: tables, settings, retention

This part refines only the tables core §D.9 gives it. Every tenant row is written through `storeValues(scope, …)` and
read through `whereStore` / `byId` (core §E.3); the one cross-store read (the novelty pool) is DES-§7.4 and needs the
lint allowlist entry of request DES-R9.

### DES-§2.1 `design_genomes` (0005, tenant): final column list

```ts
// src/lib/db/schema.ts (written by the core maintainer in P0 from this list; core §D.5 shape + refinements marked +)
export const designGenomes = mysqlTable("design_genomes", {
  id: id26().primaryKey(), storeId: storeRef(), pageId: id26("page_id"), versionId: id26("version_id"),
  kind: mysqlEnum("kind", ["brand", "page"]).notNull(),
  source: mysqlEnum("source", ["generated", "chosen", "published", "derived", "theme"]).notNull(),   // +
  niche: varchar("niche", { length: 64 }).notNull(),                     // nicheKey(), DES-§7.3
  bucket: varchar("bucket", { length: 96 }).notNull(),                   // "niche|grammar|colorStrategy" (R-D36)
  genomeV: tinyint("genome_v").notNull().default(1),                     // + DesignGenome schema version
  vec: jsonText<number[]>("vec").notNull(),                              // packed DistanceView, DES-§7.1 (≤ 400 B)
  genome: jsonText<GenomeCompact>("genome").notNull(),                   // compact genome, DES-§4.1 (≤ 1,200 B)
  seed: int("seed").notNull(),                                           // + sampling seed (restore, DG-12)
  q: tinyint("q"), slop: tinyint("slop"),                                // + gate summary at the time of the row
  report: jsonText<GateSummary>("report"),                               // + ≤ 1 KB: gate ids and counts, never page text
  novelty: jsonText<NoveltyBands>("novelty"),                            // + verdict bands shown to the owner (DS27)
  live: boolean("live").notNull().default(false),
  pool: boolean("pool").notNull().default(false),                        // + live OR reserved_until > now (DES-§7.5)
  reservedUntil: ts("reserved_until"),
  createdAt: createdAt(), updatedAt: updatedAt(),                        // + updated_at = pool cache watermark
}, (t) => [
  index("dg_bucket_idx").on(t.bucket, t.live), index("dg_store_idx").on(t.storeId, t.pageId), index("dg_niche_idx").on(t.niche, t.live),
  index("dg_pool_idx").on(t.pool, t.updatedAt),                           // + pool cache refresh (DES-§7.4)
  index("dg_store_kind_idx").on(t.storeId, t.kind, t.createdAt),          // + own-page checks, retention
  index("dg_version_idx").on(t.storeId, t.versionId),                     // + genomeOf(version) join (ai.md AI-§G.4)
]);
```

| `source` | Written by | When | `live` |
|---|---|---|---|
| `generated` | `recordCandidatesAction` (DES-§14.2) | the directions of a wizard run that the owner did not pick | false |
| `chosen` | `createFromDirectionsAction` | the direction that became the page draft | false |
| `published` | the pre-publish hook (DES-§8.8) | each publish of a page version | true for the live version only |
| `derived` | job `design.backfill` (DES-§23.2) | published pages that predate the genome (`genomeOf(doc)`, no `look`) | true while published |
| `theme` | store theme activation (R2, DES-§11.4) | each `store_themes` version | true for the active one |

**Size and retention** (3 GB DB, core §H.11). A row is ≤ 1.8 KB (genome ≤ 1,200 B, vec ≤ 400 B, report ≤ 200 B in
practice). The nightly job `design.retention` (DES-§24) deletes `generated` rows older than 14 days, `chosen` rows older
than 90 days whose page was never published, and `published` / `derived` rows that are not live and older than 180
days (ai.md's gene join runs nightly over the last 90 days). Hard cap: 600 rows per store; above it the oldest non-live
rows go first. 1,000 stores at the cap ≈ 1.1 GB worst case, typical ≪ 100 MB; the console health view shows the table
size and alarms at 300 MB (request DES-R12).

```ts
// src/lib/design/types.ts
export type Band = "ok" | "close" | "too_close";
export interface NoveltyBands { v: 1; platform: Band; niche: Band; own: Band | "first"; at: string /* ISO */ }
export interface GateSummary { v: 1; hard: GateId[]; soft: GateId[]; slop: SlopId[]; copy: { cliche: number; spec: number } }
```

### DES-§2.2 `headline_shingles` (0005, platform, no store id)

Core §D.5 columns stay. Refinements: `kind enum('title','lead') NOT NULL DEFAULT 'title'` (titles and leads are
sketched together, weighed apart in DES-§9.6) and index `hs_niche_owner_idx (niche_key, owner_tag)`.

- `hash` = first 16 hex chars of `HMAC-SHA256(key = HKDF(APP_SECRET, salt "cod-studio", info "headline-shingle:v1"),
  data = nicheKey + "\u0000" + shingle)`. The numeric order of `hash` (unsigned 64-bit) is the MinHash order.
- `owner_tag` = core D35 (`hmac(storeId, "shingle-owner")[:16]`), never returned by any API.
- Per `(niche_key, owner_tag)` the table keeps the **bottom 256** hashes of the union of the store's **live** page
  titles and leads, generated and owner-typed alike (the check must see owner copy that another store could lift).
  Rewritten on publish and unpublish by `syncShingles(scope, niche)`: one `DELETE … WHERE niche_key = ? AND owner_tag
  = ?` plus one multi-row insert of ≤ 256 rows.
- Purge deletes by `owner_tag` (core §F.9 already lists the table).

### DES-§2.3 `store_themes` (0006, tenant, R2): final column list

```ts
export const storeThemes = mysqlTable("store_themes", {
  storeId: storeRef(), version: int("version").notNull(),
  status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("draft"),   // +
  activeKey: varchar("active_key", { length: 26 }),                       // + = store_id while active, else NULL
  genome: longtext("genome").notNull(),                                    // BrandGenome JSON (DES-§11.2)
  themeSpec: longtext("theme_spec").notNull(),                             // compiled brand ThemeSpec incl. look (brand genes)
  locks: longtext("locks").notNull(),                                      // BrandLocks (DES-§12.3)
  logo: longtext("logo"),                                                  // LogoSystem: params + export asset ids (DES-§13.12)
  note: varchar("note", { length: 200 }),                                  // + "Accent changed", shown in the history list
  active: boolean("active").notNull().default(false),                     // core column, kept equal to (status = 'active')
  createdBy: id26("created_by"), createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.version] }), uniqueIndex("st_active_uq").on(t.activeKey),
           index("st_store_status_idx").on(t.storeId, t.status, t.version)]);
```

Activation is one transaction: archive the current active row (`status='archived', active=0, active_key=NULL WHERE
store_id = ? AND status = 'active'`), then activate the new one (`status='active', active=1, active_key=store_id`); the
unique `active_key` makes two concurrent activations fail cleanly (the loser answers `conflict`). At most 30 versions
per store; older archived versions are deleted and their logo exports dropped from `asset_refs`.

### DES-§2.4 `design_archive` (0007, platform, R3)

Core §D.6 lists `niche_key, cell_key, genome_id, score`. **Refined** (DS22): `genome_id` is replaced by `seed_id
varchar(40) NULL` (an id of the committed designer-seed set `src/lib/design/seeds/*.ts`, never a tenant genome), plus
`filled int NOT NULL DEFAULT 0` (live pool genomes in the cell, nightly), `best_q tinyint NULL` (Q of the designer seed),
`updated_at`. PK `(niche_key, cell_key)`. Written only by job `design.archive` (DES-§7.7). Request DES-R10 records the
column swap so the maintainer cuts 0007 that way.

### DES-§2.5 `gene_stats_store` / `gene_stats_platform` (0007, shared with ai)

ai.md owns the math and the jobs (AI-§G.5). Design owns the **vocabulary**: `gene` = a key of `GENE_VOCAB` (`"G2"`,
`"G9"`, … and the copy genes `"G29"`, `"angle"`), `value` = a value string of that gene. Continuous genes are bucketed
before they reach the tables by `bucketOf(gene, value)` (DES-§4.2), e.g. G10 accent area → `"03-08"`, `"08-16"`,
`"16-25"`, `"25-35"`. No column change.

### DES-§2.6 Store setting `brand` (R1 schema; owner part = design)

```ts
// src/lib/settings/keys/brand.ts (owned by design; the core store registry imports it, core §D.10, §K.3)
export const ColorRole = z.enum(["accent", "pop", "neutral", "base"]);
export const ColorMove = z.object({ role: z.enum(["accent", "pop"]), from: Hex, to: Hex, at: z.string().datetime() });
export const BrandSetting = z.object({
  v: z.literal(1).default(1),
  logo: z.object({
    primary: AssetId.nullable().default(null),          // uploaded raster logo (R1) or the designer's PNG export (R2)
    mark: AssetId.nullable().default(null),             // square mark for favicon and avatar (optional upload)
    wordmark: AssetId.nullable().default(null),         // wordmark-only rendition (core §D.10 names it; R2 designer export, R1 optional upload)
    inverse: AssetId.nullable().default(null),          // light-on-dark version (optional)
    source: z.enum(["upload", "designer"]).default("upload"),
  }).default({}),
  colors: z.object({
    accent: Hex.nullable().default(null), pop: Hex.nullable().default(null),
    neutralHue: z.number().min(0).max(360).nullable().default(null),
    base: z.enum(["light", "tinted", "dark"]).nullable().default(null),
    locks: z.array(ColorRole).max(4).default([]),        // locked roles are never re-sampled by generation
    moves: z.array(ColorMove).max(4).default([]),        // what the no-orange guard changed (the visible note, DS17)
    fromLogo: z.array(Hex).max(6).default([]),          // extractPalette() of the logo, already passed through nearestAllowed
  }).default({}),
  fonts: z.object({
    pairing: z.string().regex(/^[a-z0-9-]{2,40}$/).nullable().default(null),   // a pairing id of the catalogue (DES-§10.3)
    locked: z.boolean().default(false),
  }).default({}),
  /** brand gene locks, R1 subset; values validated against GENE_VOCAB (G28 and G31 are read from store_ai.voice, DS45) */
  genes: z.partialRecord(z.enum(["G12", "G17", "G23", "G26", "G27"]), z.string().max(48)).default({}),
  storeThemeVersion: z.number().int().positive().nullable().default(null),                       // R2: active store_themes.version
});
export type BrandSetting = z.infer<typeof BrandSetting>;
/** Read-only view the brand page and the sampler use: the setting plus the voice derived from store_ai (core §D.10, AI R24). */
export interface BrandView extends BrandSetting { voiceSummary: { register: VoiceRegister | null; darija: "none" | "cta" | "light" } }
export function brandView(setting: BrandSetting, storeAi: Pick<StoreAiSetting, "voice" | "darijaRatio">): BrandView;   // pure
```

- Logo asset ids pass `assertOwned(scope, "asset", ids)` (core §E.3 rule 5) and are synced to `asset_refs` with
  `owner_kind = 'brand'` (core §G.5) on every write.
- An unknown gene value is dropped and reported as a warning item on save (never a silent change).
- **Rev 2 (DS45, core §D.10 `brand` row):** the `voice.register` field of revision 1 is gone; `G28` and `G31` read
  `store_ai.voice.register` and `store_ai.darijaRatio` (ai.md AI-06) through `brandView()`; the brand page's Voice tab
  is a view over `store_ai` and writes through ai.md's `updateStoreAiAction` (P7), so one source of truth exists.
- The R1.0 conversion copies the old `store.logo` field here (core §D.10 row `store`; T1 owns the conversion, DES-R16
  accepted).
- Every write audits `store.brand.updated` with the changed roles (never colour values in the audit meta beyond hex).

### DES-§2.7 Platform setting `platform_design` (request DES-R8)

```ts
// src/lib/settings/keys/platform-design.ts (owned by design)
export const PlatformDesign = z.object({
  novelty: z.enum(["on", "warn", "off"]).default("on"),      // warn = verdicts shown, never blocking; off = kill switch for the check
  thresholds: z.object({                                      // overrides calibration.json; never below the R-D36 floors
    platform: z.number().min(0.25).max(0.6).optional(), niche: z.number().min(0.4).max(0.8).optional(),
    ownPage: z.number().min(0.3).max(0.7).optional(), brandRadius: z.number().min(0.2).max(0.35).optional(),
    clone: z.number().min(0.12).max(0.25).optional(),
  }).default({}),
  slop: z.object({ fail: z.number().int().min(4).max(10).default(6), repair: z.number().int().min(2).max(5).default(3) }).default({}),
  gatesAtPublish: z.enum(["block", "warn"]).default("block"),  // incident switch: "warn" lets hard design fails publish (audited)
  calibrationVersion: z.string().max(20).nullable().default(null),
});
```

Read through `getPlatformSetting("platform_design")` (cached 30 s); changes need `platform.settings`, are audited
(`platform.design.changed`) and are a field group on `/admin/settings/general` (core §D.10; platform.md places the
group). Bans and pins of gene values stay in ai.md's `platform_ai.genePins` (one list, read by the sampler, DES-§4.3).
**Rev 2:** `gatesAtPublish` has a flag mirror (DES-§2.9) so an incident switch needs no settings write; the effective
mode is `flagValue("design_publish_gates", ctx) ?? platform_design.gatesAtPublish`, and `warn` never applies to
honesty items (core §M.1 rule 3). The `thresholds` floors (0.25 / 0.40 / 0.30 / 0.35 / 0.12) are the R-D36 numbers and
the baseline's N1-N2 rules; the console can only raise them.

### DES-§2.8 Events this part emits (consumed by ai.md)

No new table. The wizard and the builder report through ai.md's feedback API (AI-§G.1, from R2): `chosen` /
`not_chosen` with the `design_genomes.id` of each direction and its `direction_slot` (`best_fit` / `contrast` /
`explore`, core §D.6 `ai_feedback`); gene overrides as `ai_feedback` rows with `field = "gene:<G#>"` and gene values
(never page text) in `before_text` / `after_text`; repairs as `repair_applied` / `repair_reverted` / `repair_rejected`
with the op name; the publish path copies the draft's `generation` block (`source`, genome id, Director picks, prompt
versions) into `page_versions.generation_source` / `critic_picks` (core §D.2, rethink-ai §5.6). In R1 only the
`design_genomes` rows and the provenance columns are written (AI-§G.1: feedback capture starts in R2).

### DES-§2.9 Flags owned by this part (`src/lib/flags/defs/design.ts`, core §D.4)

```ts
export const flags: FlagDef[] = [
  { key: "design_publish_gates", kind: "ops", type: "string", default: "block", description: "Design items at publish: block (refuse) or warn (publish, audit page.publish.design_override)" },
  { key: "design_novelty_check", kind: "ops", type: "string", default: "on", description: "Cross-store novelty verdicts: on, warn (never blocking) or off (every verdict ok)" },
  { key: "design_new_heroes", kind: "release", type: "boolean", default: true, description: "The new hero families (cinema, quiet, index, contact, statement) in the generation pools; off keeps today's six minus scrapbook" },
];
```

`design_novelty_check` mirrors `platform_design.novelty` the same way; both flags are read through `flagValue()` with
the store in `ctx` so one store can be exempted during an incident. No flag is read by the landing runtime (zero bytes).

### DES-§2.10 Health rules file (`src/lib/health/rules/design.ts`, core §I.7)

The rules are specified in DES-§8.11; the file exports `rules: HealthRule[]` and nothing else, and `designHealth(scope)`
(P0 stub, `src/lib/design/health.server.ts`) is the read API the `platform.health` job and the rules call: `{ pages:
{ pageId; q: number | null; slop: number | null; hasLook: boolean; genomeId: string | null }[]; closePairs: [string,
string][] }` from the store's live `design_genomes` rows (one scoped query, ≤ 40 ms).

---

## DES-§3 DESIGN.md v3 (DG-01, R1.0 step C0)

`docs/DESIGN.md` is rewritten by the design lead during core step C0 (core §K.1), before any build agent reads it. Docs
only, no code. Title: "Design Bible: Store Gen (v3, Genome)". The rules below are its content contract.

### DES-§3.1 Chapter list (v3)

| § | Chapter | Source |
|---|---|---|
| 0 | Owner rules, verbatim: no orange (the exact band), maximally modern, never vintage or craft, never AI-generic, natural ar/fr/en, never invented data | HANDOFF §2 |
| 1 | Budgets (DES-§3.2), the tells list (DES-§3.3), the banned list v3 (DES-§3.4) | this spec |
| 2 | Token contract: v2 tokens plus the `look` tokens (DES-§4.5.3); §2.5 value sets = `THEME_ATTR_VALUES` incl. the new attributes | `archetypes.ts` |
| 3 | The genome: levels, the 31 genes, bold vs solved, what each gene changes on screen (one line each) | DES-§4 |
| 4 | Archetypes as priors (one paragraph each, colour words only from the allowed families, DES-§3.5) | DES-§4.3 |
| 5 | Page choreography grammar and the six COD invariants | DES-§5 |
| 6 | Imagery: the six treatments, resolution and focal rules | DES-§4, DES-§8 |
| 7 | Motion: easing families, durations, the overshoot rule (DS28), reduced motion | DES-§4.2 G23 |
| 8 | Copy voice v3: registers, headline structures, the dash rule, the cliché lexicon pointer, Darija in CTAs | DES-§9 |
| 9 | Registers: marketing, commerce utility, transactional | DES-§11 |
| 10 | Logo and brand kit rules: no badges, seals, stamps, rotating-text rings, ribbons, hand-drawn or distressed marks | DES-§12, DES-§13 |
| 11 | Precision checklist (today's §9, each line tagged with its gate id) | DES-§8 |
| 12 | Accessibility and performance (today's §10 plus the `css` budget) | DS24 |

### DES-§3.2 Budgets (verbatim table in v3 §1)

| Budget | Limit per page | Gate (DES-§8.10) | Baseline |
|---|---|---|---|
| In-flow sections | 8-14 (hard above 16, `budget:C3`) | V24 / `budget:C3` | 27 |
| Estimated mobile height at 390 px | ≤ 12,000 px (hard above 15,000, `budget:C3`) | V24 / `budget:C3` | 26,525-31,757 |
| Order form | starts ≤ 3,000 px at 390 (grammar: ≤ 3 estimated screens), ≤ 1,100 px tall in its default state | V22 / `budget:F1` | screen 14-17, 2,840 px |
| First screen (390 × 844) | product image, price, primary CTA and the COD line inside it, every hero family and locale | V25 / `budget:C2` | 23 heroes below the fold |
| Primary CTAs | ≤ 6 (sticky bar counts as 1; hard above 8, `budget:R1`); ≤ 2 visible at once on mobile | V26 / `budget:R1` | 58-68 `.lp-btn` |
| Floating layers | ≤ 1 fixed bar + ≤ 1 float, fixed UI ≤ 88 px of 844, the bar hidden while an in-flow primary CTA is ≥ 50 % visible | V27 | three layers colliding |
| Frosted glass surfaces (sticky bar and header excluded) | ≤ 2 (soft above 2, hard above 4, `budget:R4`) | V06 / `budget:R4` | 80-96 `backdrop-filter` rules |
| Reveal nodes | ≤ 60 `[data-reveal]`, on the hero and section heads only (hard above 120, `budget:R5`); 1-2 reveal kinds; one easing family | V28 / `budget:R5` | 343-397 |
| Photo appearances | each asset ≤ 3 times (sticky bar and form thumbnail excluded; hard above 4, `budget:I1`), ≤ 2 for the hero image at the same crop, ≥ 3 distinct crops per page | V14 / `budget:I1` | one `src` in 14-19 slots |
| Full-bleed accent / pop moments | ≤ 2 (color-field: ≤ 1 per screen, ≤ 4; hard above 4, `budget:K2`) | V10 / `budget:K2` | 4-9 slabs |
| Surface levels | one ground + one card tier (`tonal` may add one layer); nested cards never | V29 | panel → surface → card |
| Kickers (eyebrows) | ≤ ⌈in-flow sections / 3⌉, hero counts as one, never on two neighbours; plain topic words; no numbering, no "Edition 01", no "Brand · No. 01" | V30, S15 | on every section |
| Section openers | ≥ 5 distinct opener structures per page; no opener on > 50 % of sections (hard above 70 %) | V30 | one opener ≈ 22× |
| Offer picker | once, inside the order form; the `offer` section is a showcase | V31 | packs 2-3× |
| Trust strip · countdown | once each; the countdown only with a merchant end date; urgency as a form chip, never a section | V32 | 3× each |
| Card-grid sections | ≤ 3, never adjacent; equal-card triplets ≤ 1 (hard above 5 grids) | V33, S04 | 8 grids |
| Radius ladder | 4 tiers, chip < control ≤ card < media (`mixed` ladder: control ≤ 8 px, media round); nested radius = outer − padding | V05 | one rung 20-28 px |
| Signature details | 1 hero signature + ≤ 3 secondary details on the whole page (a detail = a ticking number, a drawn line, a floating chip, a scale-in image, a cursor-following glow) | S11 | every section |
| Tell devices (R8 list: ghost word, eyebrow set, hotspot trio, chat-mock problem, rotating stamp, tape marquee, big-number stats, desaturated slider, countdown, phone-mock reviews, giant footer wordmark) | ≤ 2 per page in total; never the same pair twice in a niche; rotating stamp and scrapbook removed from the pools | S00 … S24 | all 11 on every page |
| Bento compositions | ≤ 1 section | S08 | |
| Centred sections | ≤ 2 in a row and ≤ 50 % of in-flow sections; ≤ 2 centre-aligned on mobile (C6) | V08, S05 | centred stack everywhere |
| Density pattern | no 3 consecutive sections with the same density; airy ≤ 35 / balanced ≤ 70 / dense ≤ 120 words (C7) | V09 | uniform |
| Aurora / glow fields | ≤ 2 sections | S06 | |
| Scrolling strips (marquee, ticker, ribbon) | ≤ 1 in the body; word-safe duplication; never clipped (I7) | V19, S14, V34 | boxed words |
| Giant decorative words (display ≥ 9 vw beside or behind content) | ≤ 1, never clipped in Arabic, the same product-name token as the chip (T8) | S12, V35 | "الآركان" vs "الأركان" |
| Chips laid over product photos | ≤ 2 per photo, on ≤ 1 photo per page | S13 | 3 callout pills |
| Middle dot `·` | ≤ 1 per metadata line, never in a headline | C07 | |
| Exclamation marks | ≤ 1 per page, in the final call to action only | C05 | |
| Easing | one family per page; overshoot only in `playground` (DS28) | V23 | 0.78 spring on 7 archetypes |
| Accent area | inside the colour-strategy band (G10) | V10 | not measured |
| Page weight | ≤ 90 KB gz HTML, ≤ 16 `<picture>`, ≤ 2 font families / ≤ 4 font files (hard above 140 KB gz, `budget:F5`) | `budget:F5` (core) | ≈ 170 KB gz, 40-64 pictures |

### DES-§3.3 Tells list (v3 §1.2; each row names its detector)

Purple or indigo accent and pop on a dark base (S01) · gradient text (S01) · glass on plain grounds (V06) · one radius
everywhere (S03) · three identical cards (S04) · icons above every heading (S07) · centred dark hero with a glow blob
(S05, S06) · hero metric with a gradient (S10) · bounce easing (S09) · decorative status dots (S16) · section-number and
edition eyebrows (S15) · rotating-text ring badges (S17) · two scrolling strips (S14) · identical section headers, the
same kicker + title + lead pattern in ≥ 4 sections (S18) · pills laid over product photos (S13) · em and en dashes as
separators (C01) · "Discover the world of…", "Découvrez l'univers…", "اكتشف عالم…" frames (C02) · adjective triads
(C03) · "Not just X, Y" frames (C03) · empty superlatives (C02) · **rev 2, from the baseline renders (design-baseline
§3.6-3.7):** headlines revealed word by word (S19; also the bidi breaker T2) · the chat-bubble "problem" block with
fake timestamps (S20) · phone-mock WhatsApp reviews (S21) · big-number stats with gradient bars and footnoted sources
(S22; the figures themselves are an honesty refusal) · the countdown chip in the announcement bar, the urgency block and
the CTA card (S23) · the giant cut-off wordmark footer (S24) · hotspot callouts pointing at nothing (S25; merchant
anchors only, `honesty:I5`) · "4,7 (312)" default ratings and "il y a 2 jours" avatars (honesty D2) · the same photo at
the same crop in every section (V14) · panel → tinted surface → card nesting (V29) · the eyebrow pill on every section
(V30) · 58 buttons (V26).

### DES-§3.4 Banned list v3 (replaces today's §1.1 and the "Required" §1.2)

Today's §1.2 prescribes glass chips over products, 20-32 px radii on every card and "a signature moment per section"
(`docs/DESIGN.md:28-46`). v3 replaces it with the budgets above and with "what modern means here": one idea per page
pushed hard (the composition grammar), quiet supporting genes, type contrast as hierarchy, asymmetric grids, image-led
crops, light and depth as budgets, UI motion under 300 ms and reveals of 500-900 ms in one easing family. Today's banned
rows stay (craft and vintage motifs, hand-drawn marks, purple gradients, emoji, hype copy, fake proof, default Inter);
v3 adds rotating-text rings, version and edition eyebrows, decorative dots, pills on photos, em and en dash separators,
two scrolling strips, ghost words that clip Arabic, the `·`-separated "metadata strip" headline, and (rev 2) the
scrapbook collage hero, per-word headline reveals, chat-mock and phone-mock proof blocks, library figures rendered as
data, invented per-piece options, single-value pickers, underline-only form inputs, upsells before submit, rotated or
circular Arabic, reversed numeric ranges in RTL, "02 يومين"-style duals, the old-style-figure price, and any third hue
on a dark base. **What "modern" means here, in one sentence per axis:** one composition idea pushed hard (G2), type
contrast as the hierarchy (G5 ≥ 2.5 at the hero), an asymmetric grid with real negative space (G3, G22), image-led crops
from the focal point (G18, G19), light and depth as budgets (G15, G16), UI motion under 300 ms and reveals of 500-900 ms
in one easing family (G23), copy that names the product's facts (DES-§9.6).

### DES-§3.5 Colour words (GEN-14)

Every orange-family colour word goes: v3 never writes amber, terracotta, saffron, tomato, coral, ochre, apricot, peach,
copper, rust, tangerine or "sun-warm" for a colour. souk reads "majorelle blue, deep teal, rose clay (low chroma), olive,
sand"; hearth "butter yellow, olive, sage, cream"; garage "graphite, steel blue, signal yellow". These words appear only
in the owner-rule paragraph of §0, quoted as forbidden examples. Acceptance:
`grep -inE "amber|terracotta|saffron|tomato|coral|ochre|apricot|peach|copper|rust|tangerine" docs/DESIGN.md` hits §0
only.

### DES-§3.6 Attribute value sets (v3 §2.5)

v3 §2.5 lists today's sets plus the attributes that exist only when a doc carries `theme.look` (DES-§4.5.2).
`theme:check` (`scripts/check-theme.ts`) gains a step that parses the §2.5 code block of `docs/DESIGN.md` and compares
it with `THEME_ATTR_VALUES` in both directions, so the bible and the engine cannot drift.

---

## DES-§4 The Design Genome (DG-02, DG-03, R1, track P6)

### DES-§4.1 Types (`src/lib/design/genome.ts`, pure, isomorphic)

```ts
export const GRAMMARS = ["editorial-column", "poster", "gallery-led", "stage", "specimen", "catalogue", "split-tension", "cinematic", "quiet-luxe"] as const;
export const COLOR_STRATEGIES = ["ink+one", "duotone", "color-field", "tonal", "dark-luxe", "high-key", "mono+signal"] as const;
export const TREATMENTS = ["cutout-stage", "full-bleed-crop", "framed", "tight-detail", "tonal-duotone", "grid-contact"] as const;
export const VOICE_REGISTERS = ["plain", "warm", "precise", "bold", "poetic-restrained"] as const;
export const HEADLINE_STRUCTURES = ["noun-phrase", "imperative", "question", "number-led", "contrast-pair", "quote-led", "word-subline"] as const;
export const ANGLES = ["benefit", "problem", "ritual", "gift", "value", "proof", "origin"] as const;   // copy angle (ai.md CopyRequest v2)
export const LADDERS = ["crisp", "soft", "round", "mixed"] as const;
export const DEPTHS = ["flat", "hairline", "tonal", "ambient", "directional"] as const;
export const MASKS = ["arch", "circle", "pill", "rounded", "rect", "cut", "blob"] as const;            // + rect, cut (DES-§3.6)
export const EASE_FAMILIES = ["expo", "quint", "quart", "critical", "soft-spring", "mask"] as const;   // soft-spring: playground only (DS28)
export const REVEALS = ["fade-rise", "blur-in", "mask-wipe", "scale-in", "line-draw"] as const;
export type Grammar = (typeof GRAMMARS)[number];   // … one alias per const above

export type GeneKey = `G${1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35}`;
export type BoldGene = "G1" | "G2" | "G4" | "G9" | "G18" | "G28";
export type RhythmGene = "G32" | "G33" | "G34" | "G35";                 // rev 2: solved from the plan, never sampled (DS1)
export type GeneLevel = "brand" | "page" | "section";
export const OPENERS = ["bare", "caption", "number", "quote", "image", "kicker"] as const;   // DES-§5.8 (C5)
export type Opener = (typeof OPENERS)[number];
export type PhotoRole = "hero" | "detail" | "context" | "proof" | "offer" | "thumb";          // DES-§5.10 (I1, I2)
export interface PhotoPlan { max: 3; uses: Record<string /* assetId */, { role: PhotoRole; aspect: Aspect; crop: "full" | "tight" | "context" | "bleed"; section: string }[]> }
export interface CtaPlan { primary: string[] /* section ids carrying a primary CTA, ≤ 6 incl. "sticky" */; headerHidesInHero: true; floatCollapses: boolean }
export interface RevealPlan { scope: "heads" | "hero" | "none"; kinds: Reveal[] /* 1-2 */; nodes: number /* estimate ≤ 60 */ }

export interface BrandGenes {
  G1: Archetype;                                                   // vibe ★
  G4: string;                                                      // pairing id ★ (DES-§10.3)
  G5: { rm: number; rd: number; dmax: number };                    // type scale ratio mobile / desktop, display max px
  G6: { w: number; wAr: number; tk: number };                      // display weight (Latin, Arabic), tracking coefficient
  G7: { dc: "none" | "uppercase"; lb: "mono" | "smallcaps" | "plain" };
  G8: "lining" | "oldstyle";
  G9: ColorStrategy;                                               // ★
  G11: "standard" | "high";
  G12: Ladder;
  G13: "circle" | "squircle";                                      // squircle emitted only from DG-19 (later)
  G14: { w: 0 | 1 | 1.5; s: number };
  G15: Depth;
  G17: Mask;
  G23: { f: EaseFamily; d: number; r: Reveal[]; st: number; sc: boolean };
  G25: { gl: "dot" | "spark" | "diamond" | "none"; nb: "none" | "plain" | "padded"; cap: "mono" | "smallcaps" | "italic-serif" | "plain" };
  G26: "swoosh" | "highlight" | "color" | "italic";
  G27: "solid" | "pill" | "soft" | "outline" | "underline" | "glow";
  G28: VoiceRegister;                                              // ★
  G30: { mw: number; ex: 0 | 1 };                                  // mean words per sentence, exclamations allowed
  G31: "none" | "cta" | "light";                                   // Darija ratio
}
export interface PageGenes {
  G2: Grammar;                                                     // ★
  G3: { c: 4 | 8 | 12; s: "1:1" | "5:7" | "4:8" | "3:9" | "golden"; m: "narrow" | "wide" | "offset"; w: number; u: 4 | 8 };
  G10: number;                                                     // accent area 0.03-0.35
  G16: 0 | 1 | 2;                                                  // glass budget
  G18: Treatment;                                                  // ★
  G20: { l: "airy" | "balanced" | "dense"; p: "ABAC" | "AAB" | "ABAB" };
  G21: number;                                                     // section spacing multiplier 0.75-1.6
  G22: "start" | "mixed" | "center-statement";
  G24: { seq: string[]; moments: number[]; cross: number | null; signature: number };   // DES-§5 expansion record
  G32: { budget: number; openers: Opener[] };                     // kicker budget ⌈n/3⌉ and the opener per in-flow section (DES-§5.8)
  G33: PhotoPlan;                                                  // photo-use plan (DES-§5.10)
  G34: CtaPlan;                                                    // CTA plan (DES-§5.9)
  G35: RevealPlan;                                                 // reveal plan (DES-§5.11)
  angle: Angle;
}
export interface SectionGene { id: string; type: string; variant: string; G19?: { a: Aspect; f: "thirds" | "center" | "bleed" }; G29?: HeadlineStructure; arrange?: Arrangement }
export interface DesignGenome {
  v: 1;
  seed: number;                                                    // sampling seed (deriveSeed(brandSeed, inputHash, …), DS5)
  brand: BrandGenes;
  page: PageGenes;
  sections: SectionGene[];                                         // ≤ 40
  why: string[];                                                   // explanation chip keys (DES-§4.8), ≤ 6
  hints?: { from: "director"; accepted: GeneKey[]; dropped: GeneKey[] };
}
/** Compact storage form for design_genomes.genome: short keys, numbers rounded to 3 decimals, ≤ 1,200 B. */
export type GenomeCompact = { v: 1; s: number; b: Record<string, unknown>; p: Record<string, unknown>; x: [string, string, string?, string?][] };
export function packGenome(g: DesignGenome): GenomeCompact;
export function unpackGenome(c: GenomeCompact): DesignGenome;    // throws GenomeError on an unknown value
export const DesignGenomeSchema: z.ZodType<DesignGenome>;          // strict; every value from GENE_VOCAB
```

`GENE_VOCAB` (`src/lib/design/vocab.ts`) is the closed vocabulary ai.md validates against (AI-§D.3): for each gene key
its level, kind (`enum` | `range` | `struct`), values or `[min, max, step]`, the bold flag, and `bucketOf()` for
`gene_stats`. It is the only list of gene values; schemas, priors, the Director prompt and the studio sliders import it.

### DES-§4.2 Gene table

"Back-derive" = the value `genomeOf(doc)` gives a doc without `look` (DES-§4.7). "Compiles to" = where the value lands
(DES-§4.5). "Order" = solver order (smallest effective domain first, ties by this column).

| # | Gene | Level | Values / range | Back-derive | Compiles to | Order |
|---|---|---|---|---|---|---|
| G1 ★ | vibe | brand | 11 archetypes | `theme.archetype` | `ThemeSpec.archetype` | sampled 1st |
| G2 ★ | composition grammar | page | 9 `GRAMMARS` | hero variant (DES-§4.7) | `look.g` → `data-grammar`, hero pool, section pools (DES-§5.4) | sampled 2nd |
| G3 | grid | page | cols 4/8/12 · split 1:1, 5:7, 4:8, 3:9, golden (0.382) · margin narrow 16-24 / wide 32-64 / offset · container 1080-1440 step 40 · unit 4/8 | 12 · 1:1 · wide · `archetype.container` · 8 | `--lp-container`, `--lp-gutter`, `--lp-split-a/-b`, `--lp-unit` | 9 |
| G4 ★ | type pairing | brand | catalogue ids (DES-§10.3) | `findPairing(theme.fonts)` or `"custom"` | `ThemeSpec.fonts` + weights | sampled 4th |
| G5 | type scale | brand | rm 1.125-1.25 · rd 1.2-1.5 · dmax 48-160 px | `archetype.typeRatio`, dmax 96 | `--lp-step-*` (clamp) | 5 |
| G6 | display weight, tracking | brand | w within the font's `weightRange` step 10 · wAr same · tk 0-0.03 (tracking = −tk × log2(size/16) em, clamped −0.05…0; 0 for Arabic) | pairing weights · tk from `archetype.display.tracking` | `--lp-display-weight(-ar)`, `--lp-display-tracking` | 6 |
| G7 | case and labels | brand | display none/uppercase · labels mono/smallcaps/plain | archetype `display.case`, `labels.case` | `--lp-display-case`, `data-labels` | 7 |
| G8 | numerals in copy | brand | lining / oldstyle (serif body only); prices always tabular lining | lining | `--lp-num-copy` | 20 |
| G9 ★ | colour strategy | brand | 7 `COLOR_STRATEGIES` | from base + harmony (DES-§4.7) | `palette.base`, `palette.harmony`, colour-moment count, G10 band | sampled 3rd |
| G10 | accent area | page | 0.03-0.35 (band per G9, DES-§4.4) | band midpoint | planner colour moments; gate V10 | 3 |
| G11 | contrast level | brand | standard / high | standard | palette contrast targets (+0.04 ink L separation, line strength × 1.25) | 21 |
| G12 | radius ladder | brand | crisp 2/4/6/8 · soft 6/10/16/24 · round 999/14/24/32 · mixed 4/8/12/999 (chip/control/card/media) | radius kind: none, subtle → crisp; soft → soft; round → round | `--lp-radius-chip/-control/-card/-media`, `data-ladder` | 8 |
| G13 | corner geometry | brand | circle / squircle | circle | `data-corner` (squircle = DG-19) | 22 |
| G14 | hairline | brand | width 0 / 1 / 1.5 px · strength 0.08-0.3 | `borderWidth`, `lineStrength` | `--lp-border-w`, line tokens | 12 |
| G15 | surface and depth | brand | flat, hairline, tonal, ambient, directional | shadow + card: none → flat, outlined → hairline, soft → tonal, raised → ambient, deep → directional | `data-depth`, `data-card`, shadow tokens | 10 |
| G16 | glass budget | page | 0 / 1 / 2 | 2 if card = glass, else 0 | planner (glass variants, chips), card style | 2 |
| G17 | mask family | brand | 7 `MASKS` | `archetype.mask` | `data-mask` | 11 |
| G18 ★ | image treatment | page | 6 `TREATMENTS` | hero variant (DES-§4.7) | hero and media variant pools, `data-img` | sampled 5th |
| G19 | crop and focal | section | aspect 4:5, 3:4, 1:1, 2:3, 16:9, 21:9 · focal thirds / center / bleed | variant default | section `ratio` where the variant supports it; focal from the asset | per section |
| G20 | density | page | airy / balanced / dense · pattern ABAC / AAB / ABAB | `archetype.density`, ABAC | `data-density`, `spacingFor()` | 4 |
| G21 | section spacing | page | 0.75-1.6 | 1 | `--lp-space-section` multiplier | 13 |
| G22 | alignment bias | page | start / mixed / center-statement (≤ 2 centred) | mixed | per-section alignment, `data-align` | 14 |
| G23 | motion signature | brand | family 6 `EASE_FAMILIES` · d 180-900 ms · reveals 1-2 of 5 · stagger 30-80 ms · scroll-linked on/off | archetype `motion` | `--lp-ease*`, `--lp-dur-*`, `--lp-stagger`, `data-reveal` | 15 |
| G24 | choreography | page | grammar expansion record (DES-§5) | the doc's section order | `doc.sections` order (generation time) | after solve |
| G25 | detail kit | brand | glyph dot/spark/diamond/none · numbering none/plain/padded (list items only, never eyebrows) · caption mono/smallcaps/italic-serif/plain | `archetype.glyph`, none, plain | `data-glyph`, `data-numbering`, `data-caption` | 16 |
| G26 | emphasis | brand | swoosh / highlight / color / italic | `archetype.emphasis` | `data-emphasis` (italic → color for Arabic) | 17 |
| G27 | button family | brand | solid / pill / soft / outline / underline / glow | `archetype.button` | `data-btn`; the primary CTA is solid unless G27 ∈ {pill, glow} (H20) | 18 |
| G28 ★ | voice register | brand | 5 `VOICE_REGISTERS` | top prior of the archetype | copy request `voice.register`, structure weights | sampled 6th |
| G29 | headline structure | section | 7 `HEADLINE_STRUCTURES` | library tag, else `noun-phrase` | copy picks (DES-§9.5) | copy step |
| G30 | sentence rhythm | brand | mean words 5-14 · exclamations 0/1 | 9 · 1 | `fitText` budgets, guard | 23 |
| G31 | Darija ratio | brand | none / cta / light (read from `store_ai.darijaRatio`, DS45) | `cta` when market = MA and locale = ar, else none | copy request | 24 |
| G32 (rev 2) | opener and kicker budget | page | `budget` = ⌈in-flow / 3⌉; `openers[i]` ∈ 6 `OPENERS` with ≥ 5 distinct per page, no opener on > 50 %, no `kicker` on two neighbours | `kicker` everywhere (today's pages) | `SectionHeader opener=` per section; the copy step drops the kicker string where the opener has none (DES-§5.8) | after solve |
| G33 (rev 2) | photo-use plan | page | each asset ≤ 3 uses (hero image ≤ 2 at the same crop), roles from `PhotoRole`, ≥ 3 distinct crops, aspects from the G19 set | one asset everywhere (today) | section media refs (`AssetRef` + `ratio` where the variant supports it), the sticky and form thumbnails excluded from the count (DES-§5.10) | after solve |
| G34 (rev 2) | CTA plan | page | ≤ 6 primary CTAs incl. the sticky bar; header CTA hidden while the hero CTA is in view; the float collapses into the bar | every section with a button (today) | section data `cta` toggles (optional, no default), `data-cta-plan` on `<html>` for the header / float CSS rule (DES-§5.9) | after solve |
| G35 (rev 2) | reveal plan | page | scope heads / hero / none; 1-2 kinds from G23.r; ≤ 60 nodes estimated from `features.revealNodes` | every element (today) | `look.mo.scope` → `data-reveal-scope`; the renderer emits `data-reveal` only on hero elements and section heads inside the scope (DES-§5.11) | after solve |

Bucketing for `gene_stats` (`bucketOf`): G5 rd → `"1.20-1.30" | "1.30-1.40" | "1.40-1.50"`; G6 w → hundreds;
G10 → `"03-08" | "08-16" | "16-25" | "25-35"`; G21 → `"0.75-1.0" | "1.0-1.25" | "1.25-1.6"`; G23 d →
`"180-300" | "300-600" | "600-900"`; structs → their categorical parts joined with `/` (`"12/5:7/offset"`). The rhythm
genes G32-G35 are not learned (no `gene_stats` rows): they are budgets, not taste.

### DES-§4.3 Priors for the bold genes (`src/lib/design/priors.ts`, designer-set starting values)

Weights per archetype; a value not listed gets the **floor 0.02** unless a hard rule forbids it (so every grammar can
appear, DS25). Rows are normalised after the floor. Learned priors (ai.md AI-§G.5, R3) multiply these; Director hints
multiply by ≤ 3 (DES-§4.6); novelty weights (DES-§7.6, R3) multiply last; `platform_ai.genePins` bans set 0 and pins
set the only value.

**G2 grammar**

| Vibe | editorial-column | poster | gallery-led | stage | specimen | catalogue | split-tension | cinematic | quiet-luxe |
|---|---|---|---|---|---|---|---|---|---|
| maison | .18 | | .12 | .08 | | | .10 | .22 | .30 |
| apothecary | .18 | | | .14 | .30 | .08 | .20 | | .10 |
| souk | .18 | .10 | .24 | .12 | | | .16 | .20 | |
| playground | | .30 | .18 | .22 | | .14 | .16 | | |
| kinetic | | .32 | | .14 | .10 | | .18 | .26 | |
| circuit | | | | .26 | .34 | .14 | .16 | .10 | |
| hearth | .18 | | .20 | .22 | | .16 | .24 | | |
| bloom | .20 | | .26 | .16 | | | .18 | | .20 |
| field | .26 | | .20 | | .14 | | .18 | .22 | |
| editorial | .32 | | .22 | | | | .14 | .18 | .14 |
| garage | | .24 | | .20 | .28 | | .16 | .12 | |

**G9 colour strategy**

| Vibe | ink+one | duotone | color-field | tonal | dark-luxe | high-key | mono+signal |
|---|---|---|---|---|---|---|---|
| maison | .28 | | | .20 | .34 | .08 | .10 |
| apothecary | .30 | .08 | | .18 | | .24 | .20 |
| souk | .16 | .24 | .20 | .26 | .14 | | |
| playground | | .30 | .32 | .16 | | .22 | |
| kinetic | .10 | .22 | .24 | | .16 | | .28 |
| circuit | .24 | .12 | | | .26 | .08 | .30 |
| hearth | .18 | .20 | .10 | .28 | | .24 | |
| bloom | .14 | .20 | .08 | .28 | | .30 | |
| field | .24 | .18 | .14 | .30 | .14 | | |
| editorial | .32 | | .16 | .18 | .12 | | .22 |
| garage | .20 | .12 | .08 | | .30 | | .30 |

**G28 voice register**: maison poetic-restrained .5 / plain .3 / precise .2 · apothecary precise .5 / plain .35 /
warm .15 · souk warm .4 / poetic-restrained .3 / plain .3 · playground warm .45 / bold .35 / plain .2 · kinetic bold .5 /
precise .25 / plain .25 · circuit precise .55 / plain .3 / bold .15 · hearth warm .5 / plain .35 / precise .15 · bloom
warm .4 / poetic-restrained .35 / plain .25 · field plain .4 / warm .35 / poetic-restrained .25 · editorial
poetic-restrained .35 / plain .35 / precise .3 · garage precise .4 / bold .35 / plain .25.

**G18 image treatment** is conditioned on G2 (then filtered by the photo facts, H13):

| G2 | cutout-stage | full-bleed-crop | framed | tight-detail | tonal-duotone | grid-contact |
|---|---|---|---|---|---|---|
| editorial-column | | .20 | .35 | .30 | .15 | |
| poster | .55 | .30 | | .15 | | |
| gallery-led | | .25 | .30 | | .05 | .40 |
| stage | .85 | | .15 | | | |
| specimen | .45 | | .20 | .35 | | |
| catalogue | .20 | | .50 | | | .30 |
| split-tension | .30 | .35 | .20 | .15 | | |
| cinematic | | .70 | | .30 | | |
| quiet-luxe | .20 | .30 | .40 | .10 | | |

`tonal-duotone` as a page treatment means: primary product images framed and true-colour, secondary images tinted
(never the primary image, honest colour).

**G4 pairing**: uniform over the archetype's ≥ 8 catalogue pairings (DES-§10.3), plus "borrowed" pairings from
compatible archetypes (the `alsoFits` column of the catalogue) at weight 0.3 each. **G1 vibe**: the three directions
take the top 3 distinct archetypes of `rankDirections()` (existing), except direction 3 in exploration mode (DES-§7.7,
R3) and forced archetypes (admin choice, existing).

### DES-§4.4 Coherence rules and the solver (`src/lib/design/solve.ts`)

**Hard rules** (a candidate violating one is never emitted):

| Id | Rule |
|---|---|
| H01 | calm mood (`mood.ts`) ⇒ G2 ≠ poster, G9 ≠ color-field, G28 ≠ bold, G23.f ∉ {soft-spring}, G16 ≤ 1, no marquee (planner) |
| H02 | primary locale ar ⇒ the pairing has `displayAr` and `bodyAr`; G7.dc, G6.tk and G26 = italic are ignored at compile for Arabic |
| H03 | Didone or hairline-serif display (`bodoni-moda`, `instrument-serif`) ⇒ G5.dmax ≥ 56, G6.tk ≤ 0.02, G12 ∈ {crisp, soft, mixed}, G15 ∈ {flat, hairline, directional} |
| H04 | G2 = poster ⇒ (G6.w ≥ 700 or display = `big-shoulders-display`) ∧ G5.rd ≥ 1.4 ∧ G9 ∈ {color-field, duotone, mono+signal} |
| H05 | G2 = quiet-luxe ⇒ G20.l = airy ∧ G10 ≤ 0.10 ∧ G16 ≤ 1 ∧ G23.d ≥ 600 ∧ G9 ∈ {ink+one, dark-luxe, tonal, high-key} |
| H06 | G2 = specimen ⇒ G7.lb ∈ {mono, smallcaps} ∧ G14.w ≥ 1 ∧ G12 ∈ {crisp, mixed} |
| H07 | G2 = cinematic ⇒ G18 ∈ {full-bleed-crop, tight-detail} |
| H08 | G2 = gallery-led ⇒ ≥ 3 photos ∧ G18 ∈ {grid-contact, framed, full-bleed-crop, tonal-duotone} |
| H09 | G2 = stage ⇒ G18 = cutout-stage |
| H10 | G2 = catalogue ⇒ G20.l ∈ {balanced, dense} ∧ G22 = start |
| H11 | G9 = dark-luxe ⇒ base dark ∧ G15 ∈ {flat, hairline, directional} |
| H12 | G27 = glow ⇒ base dark |
| H13 | photo facts: cutout-stage needs an asset with alpha; full-bleed-crop needs a photo ≥ 1600 px wide; tight-detail needs one ≥ 1400 px; grid-contact needs ≥ 3 photos; otherwise the treatment falls back to framed (and G2 values that require it are removed from the domain) |
| H14 | G12 tiers strictly increase, except `mixed` (control ≤ 8 px, media round); nested radius = outer − padding at compile |
| H15 | any overshoot easing (G23.f = soft-spring, or a curve with y1 < 0 or y2 > 1) ⇒ G1 = playground (DS28) |
| H16 | G16 > 0 ⇒ G9 ∈ {color-field, duotone, dark-luxe} or G18 ∈ {full-bleed-crop, cutout-stage}: glass only over imagery or colour fields |
| H17 | G7.dc = uppercase ⇒ display ∈ {big-shoulders-display} or (display ∈ {archivo, schibsted-grotesk} ∧ G6.w ≥ 700) |
| H18 | G25.cap = italic-serif ⇒ the pairing's display or accent is a serif with italics (`FONT_DATA.italic`) |
| H19 | G26 = italic ⇒ the display face ships italics; else color |
| H20 | the primary CTA is solid unless G27 ∈ {pill, glow}; G27 = underline only with G2 ∈ {editorial-column, quiet-luxe, catalogue} |
| H21 | G10 ∈ band(G9): ink+one 0.03-0.08 · duotone 0.12-0.22 · color-field 0.25-0.35 · tonal 0.08-0.16 · dark-luxe 0.04-0.10 · high-key 0.10-0.20 · mono+signal 0.03-0.06 |
| H22 | G2 ∈ {split-tension, editorial-column} ⇒ G3.s ≠ 1:1; G3.m = offset ⇒ G3.c = 12 |
| H23 | G20.l = dense ⇒ G21 ≤ 1.1; airy ⇒ G21 ≥ 1.1 |
| H24 | no orange: `orangeMixes(compile(g).theme)` is empty; a hit runs today's palette repair with brand locks respected (pop and neutral first, accent last, GEN-07); a lock that cannot be kept fails the candidate |
| H25 (rev 2, K4) | pop derivation: the pop hue lies within ±30° of the accent hue (analogous) or in 150-210° from it (complement), its chroma within ±0.04 of the accent's; on a dark base the pop is a tint of the accent (no third hue); the harmony recipes of `src/lib/theme/palette.ts:182` that would break this are removed from the G9 → palette sets of DES-§4.4 |
| H26 (rev 2, K5) | one ground + one card tier: `surfaces = "panels"` only when the page's card tier is `flat` or `hairline` (sections inside a panel never carry raised cards); `tonal` may add one tinted layer; a nested card (card inside card inside panel) is a compile error, not a style |
| H27 (rev 2, K8) | base from the photo: `palette.base = dark` only when G9 ∈ {dark-luxe, mono+signal} **and** (the primary photo has alpha or its background luminance ≤ 0.35); `tinted` neutral hue within ±25° of the photo's dominant hue or the accent (never a pink base for an olive product); otherwise `light` |
| H28 (rev 2, C2) | fold contract: for the chosen hero family and locale the estimated fold (hero `features.fold` + the type steps at 390) places image, price, primary CTA and the COD line inside 844 px; the solver lowers G5.dmax in steps of 8 px (≥ 44 px) and then the hero's photo aspect before it changes the family |
| H29 (rev 2, C5) | opener grammar: G32 satisfies ⌈n/3⌉ kickers, ≥ 5 distinct openers, no opener > 50 %, hero emphasis device on the hero only |
| H30 (rev 2, I1) | photo-use plan feasible: the in-flow sequence needs ≤ 3 uses of every asset; a sequence that would need a fourth use loses its media-hungriest optional block (`gallery`, `beforeAfter`, `showcase`) or switches it to a photo-free variant before any doc exists |
| H31 (rev 2, R1, R7) | CTA plan: ≤ 6 primary CTAs incl. the sticky bar; ≤ 1 fixed bar + ≤ 1 float; the WhatsApp float exists only when the store has WhatsApp (existing reservation) and collapses into the bar on mobile |
| H32 (rev 2, R5) | reveal plan: scope `heads` (default) or `hero`; `none` for the commerce and transactional registers; estimated nodes ≤ 60 |
| H33 (rev 2, T4, T5) | type concentration: the pairing's `displayAr` is never `reem-kufi`; when the store's niche pool (DES-§7.4) shows a display face on ≥ 30 % of ar pages, that face's pairings lose weight × 0.5 in this sample (anti-concentration; the R3 novelty budget generalises it) |

**G9 → palette** (input to `productTheme`): ink+one → base light | tinted, harmonies {ink-accent, cool-precise,
mono-luxe}, 1 colour moment · duotone → light | tinted, {pop-complement, blush-berry, clay-sage, earth-triad}, 2 moments
(accent + pop) · color-field → light, {pop-complement, warm-butter, contrast-neon (playground, kinetic only)}, 2-3
moments, one full-bleed accent block per ~2 screens · tonal → tinted, {clay-sage, mono-luxe, earth-triad}, 1-2 moments ·
dark-luxe → dark, {mono-luxe, ink-accent}, 1 moment · high-key → light, {blush-berry, warm-butter, cool-precise}, pastel
pop · mono+signal → light | dark, {ink-accent, cool-precise}, accent on CTAs + 1 moment, pop desaturated (C ≤ 0.04).
When the archetype's own harmony is in the set it wins; when none of the set fits the photo (accent extraction), the
archetype harmony is used and G9 is re-derived (`deriveStrategy`) so the label never lies.

**Soft rules** (penalties in Q and tie-breaks in the solver): hero display/body ratio < 2.5 (−3) · 3 sections in a
row with the same density and alignment (−2) · G5.rd < 1.25 with G2 ∈ {poster, cinematic} (−3) · G6.w < 400 at
dmax > 120 on a light base (−2, hairlines vanish) · G21 > 1.4 with G20.l = balanced (−1) · display and body from the
same family without an opsz axis (−2).

**Algorithm** (deterministic per seed, ≤ 200 node expansions, ≤ 3 ms in Node):

```
sampleGenome(input: SampleInput, opts): DesignGenome
  rng(k)   = rngFor(seed, "genome:" + k)                         // independent streams (src/lib/generator/rng.ts)
  locks    = brand kit locks ∪ opts.locks                         // locked genes are fixed values, never sampled
  for gene in [G1, G2, G9, G4, G18, G28]:                         // bold, in this order (each conditions the next)
    w = prior(gene | earlier bold) × hints(gene) × learned(gene) × novelty(gene)   // DES-§4.3, §4.6, ai.md, §7.6
    w = w with values violating H-rules given earlier choices set to 0, floor 0.02 re-applied to valid values
    value = locks[gene] ?? weighted(rng(gene), w)
  domains  = for each solved gene: preferred order = derive(gene, bold) (DES-§4.3 tables, archetype data) with
             ±1-step jitter from rng(gene); domain = all values passing unary constraints
  solve: pick the unassigned gene with the smallest domain (ties: Order column); try values in preferred order;
         forward-check every hard rule touching it; on an empty domain backtrack (chronological); count expansions
  if expansions > 200: relax the last bold gene to its archetype default and solve once more; if that fails too,
         return backDerive(archetype defaults) with why = ["fallback"] (logged, never shown as a failure)
  compile → H24 check → explanation (DES-§4.8)
  // rev 2: the rhythm genes are solved after the choreography expansion (DES-§5.5 step 3), in this order and with these
  // retries: G33 photos (H30; on failure drop or switch the media-hungriest optional block, ≤ 3 times) → G34 CTAs (H31)
  // → G32 openers (H29) → G35 reveals (H32) → H28 fold (lower dmax, then the hero photo aspect, then re-pick the hero
  // variant inside the grammar's pool). Every retry stays inside the same rng streams, so the result is still a pure
  // function of (seed, inputs).
```

`SampleInput = { archetype?: Archetype; brandSeed: string; inputHash: string; directionIndex: 0 | 1 | 2; attempt:
number; mood: MoodReading; locale: Locale; market: Market; photos: PhotoFacts; niche: string; brand: BrandSetting |
null; ranked: RankedDirection[] }`, `seed = deriveSeed(hash32(brandSeed + "|" + inputHash), "direction:" + i + ":" +
attempt)` (DS5). `PhotoFacts = { count: number; maxWidth: number; hasCutout: boolean; dominant: Hex | null }`, built
from `PhotoInfo` (`src/lib/generator/garment.ts`) and the asset metadata the wizard already has.

### DES-§4.5 Compile to ThemeSpec + `look` (`src/lib/design/compile.ts`)

```ts
export interface Compiled { theme: ThemeSpec; plan: PlanDirectives; copy: CopyDirectives }
export function compileGenome(g: DesignGenome, ctx: CompileCtx): Compiled;   // pure; ctx = palette, photos, locale, brand locks
export interface PlanDirectives {
  grammar: Grammar; heroPool: WeightedVariant[]; pools: Partial<Record<ThemeSectionType, WeightedVariant[]>>;
  colorMoments: number; glass: 0 | 1 | 2; density: PageGenes["G20"]; align: PageGenes["G22"];
  treatment: Treatment; aspects: Partial<Record<string, Aspect>>; choreographySeed: number;
}
export interface CopyDirectives { register: VoiceRegister; structures: Partial<Record<HeadlineStructure, number>>; angle: Angle; darija: BrandGenes["G31"]; meanWords: number; exclaim: 0 | 1 }
```

#### DES-§4.5.1 `ThemeLook` (request DES-R1: one optional field in the frozen `ThemeSpec`)

```ts
// src/lib/page/schema.ts (maintainer-owned, frozen; added by CCR DES-R1). No .default(): docs without it validate and
// checksum exactly as before (DS2).
export const ThemeLook = z.object({
  v: z.literal(1),
  g: z.enum(GRAMMARS),
  grid: z.object({ c: z.union([z.literal(4), z.literal(8), z.literal(12)]), s: z.enum(["1:1", "5:7", "4:8", "3:9", "golden"]),
                   m: z.enum(["narrow", "wide", "offset"]), w: z.number().int().min(1080).max(1440), u: z.union([z.literal(4), z.literal(8)]) }),
  type: z.object({ rm: z.number().min(1.125).max(1.25), rd: z.number().min(1.2).max(1.5), dmax: z.number().int().min(48).max(160),
                   w: z.number().int().min(100).max(900), wAr: z.number().int().min(100).max(900), tk: z.number().min(0).max(0.03),
                   dc: z.enum(["none", "uppercase"]), lb: z.enum(["mono", "smallcaps", "plain"]), nu: z.enum(["lining", "oldstyle"]) }),
  cs: z.enum(COLOR_STRATEGIES), area: z.number().min(0.03).max(0.35), hc: z.boolean(),
  ladder: z.enum(LADDERS), corner: z.enum(["circle", "squircle"]),
  hair: z.object({ w: z.union([z.literal(0), z.literal(1), z.literal(1.5)]), s: z.number().min(0.08).max(0.3) }),
  depth: z.enum(DEPTHS), glass: z.union([z.literal(0), z.literal(1), z.literal(2)]), mask: z.enum(MASKS), img: z.enum(TREATMENTS),
  dens: z.enum(["airy", "balanced", "dense"]), space: z.number().min(0.75).max(1.6), align: z.enum(["start", "mixed", "center-statement"]),
  mo: z.object({ f: z.enum(EASE_FAMILIES), d: z.number().int().min(180).max(900), r: z.array(z.enum(REVEALS)).min(1).max(2),
                 st: z.number().int().min(30).max(80), sc: z.boolean(),
                 scope: z.enum(["heads", "hero", "none"]) }),                            // rev 2: reveal scope (G35, R5); heads = hero + section heads only
  kit: z.object({ gl: z.enum(["dot", "spark", "diamond", "none"]), nb: z.enum(["none", "plain", "padded"]), cap: z.enum(["mono", "smallcaps", "italic-serif", "plain"]) }),
  em: z.enum(["swoosh", "highlight", "color", "italic"]), btn: z.enum(["solid", "pill", "soft", "outline", "underline", "glow"]),
  gid: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),        // design_genomes id (learning join, ai.md AI-§G.4)
  locks: z.array(z.enum(["G1", "G2", "G4", "G9", "G18", "G28"])).max(6).optional(),   // rev 2: "Lock for this page" (DES-§15.4); absent = none
}).strict();
// ThemeSpec gains:  look: ThemeLook.optional(),
```

A compiled look serialises to ≈ 570-690 B of JSON (`theme:check` asserts ≤ 700 B over 2,000 sampled genomes; the rev 2
`mo.scope` adds ≤ 16 B). The constants (`GRAMMARS`, …) move with it into `src/lib/page/schema.ts` (they are part of the
doc contract); the design modules import them from there. **Rule for every other new field this part adds to a section
data schema (`src/landing/sections/<type>/schema.ts`, P6): `.optional()` with no default** (`opener`, `cta`, `ghost`,
`arrange`, `align`, `ratio` additions), so `validateDoc(doc)` of an existing document serialises byte-identically and
its published checksum (`src/lib/db/boot-tasks.ts:24-47`) never changes; an absent field renders exactly today's
behaviour.

#### DES-§4.5.2 `<html>` attributes

`buildThemeTokens` (`src/lib/theme/tokens.ts:419-433`) keeps every attribute it emits today. With `spec.look`
present, and only then:
- the archetype locks are replaced: `data-btn` ← `look.btn`, `data-card` ← card of `look.depth` (flat → flat,
  hairline → outlined, tonal → soft, ambient → raised, directional → raised; `glass` only when the page is allowed
  glass and the variant asks for it), `data-mask` ← `look.mask`, `data-glyph` ← `look.kit.gl`, `data-emphasis` ←
  `look.em` (italic → color for Arabic, existing), `data-density` ← `look.dens`, `data-radius` ← nearest legacy kind
  of `look.ladder` (crisp → subtle, soft → soft, round → round, mixed → subtle);
- new attributes are added: `data-look="1"`, `data-grammar`, `data-ladder`, `data-depth`, `data-labels`, `data-align`,
  `data-img`, `data-reveal` (space-separated reveal kinds), `data-numbering`, `data-caption`, `data-corner`;
- precedence (DS4): a ThemeSpec field that is not `"archetype"` (builder overrides `radius`, `shadow`, `texture`,
  `surfaces`) wins over the look; the look wins over the archetype.

`THEME_ATTR_VALUES` gains the new keys with their full value sets; `data-mask` gains `rect` and `cut`. DESIGN v3 §2.5
lists them (DES-§3.6).

#### DES-§4.5.3 Tokens (only with `look`)

`--lp-radius-chip`, `--lp-radius-control`, `--lp-radius-card` (alongside the existing `--lp-radius-*` scale, which is
re-derived from the ladder so old selectors keep working), `--lp-radius-media` (from the ladder), `--lp-unit`,
`--lp-split-a` / `--lp-split-b` (fr units of the split), `--lp-container` (G3.w), `--lp-gutter` (G3.m), the type steps
recomputed from G5, `--lp-display-weight(-ar)`, `--lp-display-tracking`, `--lp-num-copy`, `--lp-space-section`
(× G21), `--lp-ease`, `--lp-ease-out` (G23.f: expo `cubic-bezier(.16,1,.3,1)`, quint `(.22,1,.36,1)`, quart
`(.25,1,.5,1)`, critical = the ζ 1 spring sampled into `linear()`, soft-spring = ζ 0.86 (DS28), mask = `(.77,0,.18,1)`),
`--lp-dur-s/-m/-l` = G23.d × (0.45, 0.8, 1.15) clamped 160-1000 ms, `--lp-stagger` = G23.st. Each new colour mix the
landing CSS paints from these is registered in `src/lib/theme/blend.ts` (owner rule 1); there are none in R1 (the look
adds geometry, type and motion tokens only; colour still comes from the palette solver).

#### DES-§4.5.4 Section kit work that makes the genes real (P6, `src/landing/sections/**`, `src/landing/styles/**`)

Today: 27 section types, 91 variants (`src/landing/registry.ts`; hero variants `stage, editorial, poster, scrapbook,
spec, split`, `src/landing/sections/hero/index.tsx:108-140`). The additions below reach the variety the targets need
(C1 ≥ 6 hero families, N3/N4 sequence and tuple diversity, the keep-list details of design-baseline §6.7) and redraw
every variant the baseline caught as a tell. CSS budgets are gzip bytes added to `src/landing/styles/base.css`
(141,274 B raw / 33,482 B gz today); only the CSS of used variants is inlined per page, and the page cap is the `css`
budget key (DES-R5, +4,096 B gz on the heaviest page). "Track" is who builds it; every new section data field is
optional without a default (DES-§4.5.1 rule).

**Hero families (C1; pools in DES-§5.4; fold contracts in DES-§5.12):**

| Variant | Status | Props (`data.*`, optional) | CSS gz | RTL notes | Track |
|---|---|---|---|---|---|
| `hero:stage` | redrawn | `ghost?: boolean` (default off for `ar` and for G16 = 0), `chips?: 0 \| 1 \| 2` (≤ 2 callouts, default 1), `stagePreset?: "glow" \| "contact" \| "plinth"` | ±0 (removals) | ghost word never clipped: the word is sized by `--sh-word` like titles (`SectionHeader.tsx:70-80` method) and dropped when it would overflow; chips at inline-end | P6 |
| `hero:editorial` | redrawn | cover lines unnumbered (`number` prop removed from its header), `coverLines?: 2 \| 3` | ±0 | numbers in `<bdi dir="ltr">` | P6 |
| `hero:poster` | redrawn | the turning badge removed (S17); `priceBlock?: "static" \| "band"` | −200 | display weight ≥ 700 enforced by H04; uppercase never for `ar` | P6 |
| `hero:spec` | redrawn | callouts ≤ 3, glass only when G16 allows (else hairline cards), figures merchant-only | −100 | callout numbers LTR isolates | P6 |
| `hero:split` | kept | `ratio?: "5:7" \| "4:8" \| "1:1"` (G3), `mediaSide?: "start" \| "end"` | +150 | mirrored by logical properties; `mediaSide` is logical | P6 |
| `hero:cinema` (rev 1) | new | `band?: "below" \| "beside"`, `caption?: string`, photo ≥ 1600 px wide (H13) | +1,400 | the band sits inline-start on desktop; text never over the photo except the one caption | P6 |
| `hero:quiet` (rev 1) | new | `ratio?: "4:5" \| "1:1"`, `frame?: "framed" \| "bleed"` | +900 | small display (dmax ≤ 56), price and CTA on one line under the image | P6 |
| `hero:index` (rev 1) | new | `facts?: 3..5` merchant facts as numbered rows (G25.nb), `numbering?: "plain" \| "padded"` | +1,100 | row numbers LTR isolates; rows are an `index` arrangement | P6 |
| `hero:contact` (rev 2, replaces scrapbook in every pool) | new | `photos: 3..4` (`AssetRef[]`), `titleCell?: "tl" \| "tr" \| "bl" \| "br"`, grid-contact treatment | +1,300 | the grid mirrors; the title cell is logical (`tl` = inline-start top) | P6 |
| `hero:statement` (rev 2) | new | `structure?: "word-subline" \| "contrast-pair"` (G29 of the hero title), `image?: "small-framed" \| "cutout"` | +900 | type-first; the product image stays in the fold (C2) as a framed thumbnail ≥ 160 px | P6 |
| `hero:scrapbook` | kept for old docs only, out of every pool (banned aesthetic, design-baseline §3.6) | — | −300 (tape, polaroid frames removed; redrawn as a quiet `contact` grid) | — | P6 |

**Sections and primitives:**

| Change | Props / rule | CSS gz | RTL notes | Why | Track |
|---|---|---|---|---|---|
| `SectionHeader` gains `opener: Opener` (DES-§5.8): `bare` (title only), `caption` (small caption column inline-start, no kicker), `number` (a plain `01` list number, never on the kicker), `quote` (lead first as a pulled line), `image` (the section's first image above the title), `kicker` (today's) | one prop; the kicker string is ignored unless `opener = "kicker"` | +450 | caption column mirrors; numbers LTR isolates | C5, S18 | P6 (primitives, DES-R18) |
| `SectionHeader.titleSplit` defaults to **false**; `RichText.split` keeps `.lp-word` only for Latin display ≥ 48 px with `scope = heads`; Arabic never splits (T2) | reveals animate whole lines with `clip-path` masks (`mask-wipe`, `fade-rise`) | ±0 | the bidi run is never broken; "Pulse X" stays "X Pulse"-free | T2, S19 | P6 (primitives) |
| `RichText` binds Arabic particles to the next word with U+00A0 (`من في على إلى عن مع و-` prefixes and `ب/ل/ك` clitics typed with a space) so no line ends on a particle; `text-wrap: balance` on h1/h2, `pretty` on leads | — | +0 | ar only | T2 | P6 (primitives) |
| `RichText` wraps Latin tokens inside `[lang=ar]` text in `<bdi>`; chips and list items get `unicode-bidi: isolate` | — | +60 | ar only | T7 | P6 (primitives) |
| `Price` renders the price cluster (price, old price, discount chip) as one `inline-flex` unit with logical gaps; `font-variant-numeric: tabular-nums lining-nums` on `.lp-price*`, `.lp-count*`, `[data-num]`, phones and quantities | — | +120 | the cluster never splits across the line; chip adjacent in both directions | T1, RTL4 | P6 (primitives) |
| `Countdown` emits the Arabic plural forms the runtime already picks (`data-forms` keyed by `Intl.PluralRules`: `one` "يوم", `two` "يومان", `few` "أيام", `many` "يومًا", `other` "يوم"; `src/landing/runtime/countdown.ts:7-12`) and the numeral + unit in one `<bdi dir="ltr">` group; ranges "24-48" as LTR isolates | — | +0 | fixes "02 يومين" and "48-24" without touching the frozen runtime | RTL1, RTL2 | P6 (primitives) |
| `Badge` sticker shapes `burst` / `scallop` are drawn as plain circles (already `look = "circle"`, `Badge.tsx:107`); the `textPath` ring is removed; Arabic never on a path | — | −200 | RTL3 | S17, RTL3 | P6 (primitives) |
| `MarqueeTrack` duplicates the track **per whole item** with `direction`-aware offsets and `overflow: clip` on the track, never on a word; the outline marquee gets `padding-inline` ≥ 0.5 em | — | +80 | ar tracks run inline-start → end | I7, RTL6 | P6 (primitives) |
| `whatsappFloat:tab` renders a horizontal pill in `ar` (no rotated Arabic) | `data.tabLabel?` | +40 | RTL3 | RTL3 | P6 |
| `footer:big` wordmark is sized by `--sh-word` (fits, never clipped); addresses and e-mails in `dir="ltr"` inline blocks without spaced punctuation | — | +40 | RTL5 | S24, RTL5 | P6 |
| `benefits:hanging` (rev 2): numbered rows with hanging thumbnails (the keep-list's Didone 01-05 benefits, design-baseline §6.7) | `thumbs?: boolean` | +900 | thumbnails hang inline-start | keep-list 7, C5 | P6 |
| `showcase:figure` (rev 2): one large image with a "FIG. 01" caption column (keep-list) | `caption?: string`, `figure?: string` | +600 | caption column inline-end | keep-list 7 | P6 |
| `gallery:contact` (rev 2): 3-6 photos as a contact sheet (grid-contact treatment) | `cols?: 2 \| 3` | +700 | grid mirrors | I2, gallery-led grammar | P6 |
| `offer:showcase` (rev 2): the offer section as a showcase of the packs **without a picker** when the form carries the picker (R2) | `picker?: false` | +400 | — | R2 | P6 |
| `problem:chat` redrawn: pains as a plain two-column ledger, no bubbles, no timestamps (the id stays) | — | −300 | — | S20 | P6 |
| `socialProof:whatsapp` redrawn: plain quote cards, no phone mock-up frame; `socialProof:counter` stays blocked without merchant numbers | — | −400 | — | S21, D2 | P6 |
| `stats:*` render only `allowedNumbers` (merchant figures); the copy tables of `src/landing/sections/stats/copy.ts:55-69` become **examples in the editor placeholder**, never page content | — | ±0 | — | D2, DS42 | P6 (+ `honesty:D2` refusal by P3) |
| `urgency:*` leaves the planner's grammar (the form chip replaces it: P3's `orderForm` reads the merchant end date, LAN-§6.2); the section stays for old docs | — | ±0 | — | R3 | P6 planner, P3 form |
| `guarantee:seal`, `cta:stamp`, `trustBar:stamps`, `marquee:tape`, `offer:tickets` keep their ids (doc compatibility) but are redrawn without seal, stamp, tape or ticket shapes and without circular text | — | −600 | — | owner rule 2 | P6 |
| every variant declares `features` (DES-§8.4) incl. `fold`, `revealNodes`, `ctas`, `slots` | — | 0 | — | the gates read data | P6 |
| `[data-look]` selectors implement the new attributes; no selector changes for docs without look; `[data-reveal-scope]` scopes the reveal CSS | — | +500 | — | DS4, G35 | P6 |

Net CSS change to `base.css`: ≈ +8.0 KB gz added, ≈ −2.1 KB removed; the per-page inlined CSS stays within the `css`
budget because a page uses one hero family and ≤ 14 sections (measured by `render-check`, DES-§19).

### DES-§4.6 Director hints (`GeneHints`, GH-1, flag `ai_director_brief`)

```ts
// src/lib/design/hints.ts
export type GeneHints = Partial<Record<BoldGene | "G10" | "G16" | "G20" | "G23", { value: string; weight: 1 | 2 | 3 }[]>>;  // ≤ 3 values per gene
export interface HintIntake { accepted: GeneKey[]; dropped: { gene: string; value: string; why: "vocab" | "hard_rule" | "locked" | "photo" }[] }
export function applyHints(prior: GenePrior, gene: GeneKey, hints: GeneHints | undefined): GenePrior;   // multiplies weights, never adds a value
export function validateHints(raw: unknown): { hints: GeneHints; intake: HintIntake };                 // GENE_VOCAB check
```

The ai task `design.direct` returns three `{ hints, angle, headlineStructure, why }` (ai.md AI-19a). Direction *i*
samples with `hints[i]`; direction 3 keeps its exploration slot (hints applied at weight ≤ 2 only). A hinted value that
breaks a hard rule, a lock or the photo facts is dropped and listed in `genome.hints.dropped` (logged, visible in the
console AI page as a count). Hints never bypass the solver, the gates or the novelty check (DS23).

### DES-§4.7 Back-derivation `genomeOf(doc)` (`src/lib/design/derive.ts`)

```ts
export function genomeOf(doc: PageDoc, opts?: { photos?: PhotoFacts }): DesignGenome;   // pure, total (never throws)
```

- With `doc.theme.look`: the look's genes are read back exactly; G1, G4, G9 from the spec; sections from
  `doc.sections`; copy genes from the library tags (or `noun-phrase`).
- Without look: archetype defaults (Back-derive column of DES-§4.2) and these maps:

| Hero variant | G2 | G18 |
|---|---|---|
| stage | stage | cutout-stage |
| editorial | editorial-column | framed |
| poster | poster | cutout-stage |
| scrapbook | gallery-led | grid-contact |
| spec | specimen | cutout-stage |
| split | split-tension | framed |
| cinema / quiet / index (new) | cinematic / quiet-luxe / catalogue | full-bleed-crop / framed / framed |

  G9 from the palette: base dark + harmony ∈ {mono-luxe, ink-accent} → dark-luxe; base dark otherwise → mono+signal;
  harmony ink-accent → ink+one; cool-precise → mono+signal; pop-complement or contrast-neon → color-field when ≥ 2
  strong-background sections, else duotone; clay-sage, earth-triad, mono-luxe on tinted → tonal; blush-berry or
  warm-butter on light → high-key.
- Consistency test (DG-02 acceptance): for every baseline fixture, `buildTheme(compileGenome(genomeOf(doc)).theme
  with the look)` emits exactly the attributes `buildTheme(doc.theme)` emits today, ignoring only the new
  `[data-look]`-scoped attributes.

### DES-§4.8 Explanation (GN-1)

```ts
// src/lib/design/explain.ts
export interface GenomeChip { gene: GeneKey; key: MessageKey; vars?: Record<string, string> }   // rendered by the admin catalog (core §I.5)
export function explainGenome(g: DesignGenome): { chips: GenomeChip[]; why: { key: MessageKey; vars: Record<string, string> } };
```

Four chips, one per bold visual gene (G2 grammar, G4 pairing as "Display / Arabic display" names, G9 strategy, G18
treatment), shown as separate chips (never a `·`-joined string, budget C07). The "why" line is one sentence from a
template that only uses inputs: "{grammar} for a {mood} product; {strategy} keeps your product's {colourName} in front"
(colour name from the OKLCH hue family words of DES-§20.3, never an orange-family word because the colour itself is
never orange). Labels in ar/fr/en: DES-§20.2.

### DES-§4.9 Module layout (P6, R1)

| File | Exports |
|---|---|
| `src/lib/design/genome.ts`, `vocab.ts`, `types.ts` | types, `GENE_VOCAB`, `bucketOf`, `packGenome` / `unpackGenome`, `DesignGenomeSchema` |
| `src/lib/design/priors.ts` | DES-§4.3 tables, `priorFor(gene, ctx)` |
| `src/lib/design/solve.ts` | `sampleGenome`, `solve`, hard and soft rules |
| `src/lib/design/compile.ts` | `compileGenome`, G9 → palette, look builder |
| `src/lib/design/derive.ts` | `genomeOf`, `deriveStrategy` |
| `src/lib/design/hints.ts`, `explain.ts` | DES-§4.6, DES-§4.8 |
| `src/lib/design/openers.ts`, `photos.ts`, `cta.ts`, `reveals.ts` (rev 2) | the rhythm genes G32-G35: `planOpeners`, `planPhotos`, `planCtas`, `planReveals` (DES-§5.8-5.11), each pure over the in-flow list, the photo facts and the registry `features` |
| `src/lib/design/heights.ts` (rev 2, the core's measurement module) | `estimateHeights(doc, look, locale): { sections: number[]; total: number; formTop: number; fold: FoldReport }` at 390 px (DES-§5.3, §5.12); called by the core's `budget.ts` (core §M.2 rows C3, F1, C2) |
| `src/lib/design/typography.ts` (rev 2) | the harmonisation engine of DES-§10.5: `typeTokens(pairing, look, locale): TypeTokens` |
| `src/lib/design/digest.ts` (rev 2) | `renderDigest(doc, theme, genome, features)` and `genomeCard(…)` for the Director (DES-§8.9) |
| `src/lib/design/health.server.ts` (rev 2) | `designHealth(scope)` (DES-§2.10, §8.11) |
| `src/lib/design/index.ts` | the public API (isomorphic; no Node or DOM imports) |
| `src/lib/theme/tokens.ts`, `archetypes.ts` | look-aware emission, new attribute sets, `SPRINGS.soft` 0.86 |

### DES-§4.10 Colour strategies and the surface system (rev 2; DS38; K1-K8)

Seven strategies (G9), each a complete colour **plan** rather than a harmony name. Every colour still comes from the
product palette through the existing no-orange stack (`src/lib/theme/color.ts:262-267` guard band with margin,
`src/lib/theme/blend.ts` mixes, `orangeMixes()` on the emitted tokens); the strategy decides how much of it is used
where.

| Strategy | Intent | Base (H27) | Harmonies kept (`palette.ts:182`) | Moments (I4) and accent area (G10 band) | Pop rule (H25) | Surfaces (H26) | Baseline fault it ends |
|---|---|---|---|---|---|---|---|
| ink+one | one neutral page, one accent used identically everywhere | light or tinted | ink-accent, cool-precise, mono-luxe | 1 moment; 3-8 % | pop = a tint of the accent (no second hue) | flush, hairline or flat cards | "teal marquee in a brown/gold page" |
| duotone | accent + pop fields, both from the photo | light or tinted | pop-complement, blush-berry, clay-sage, earth-triad | 2 moments (accent, pop); 12-22 % | complement 150-210° or analogous ±30°, chroma ±0.04 | flush; one card tier | "4-9 slabs" |
| color-field | one big full-bleed block per screen, type on colour | light | pop-complement, warm-butter, contrast-neon (playground, kinetic only) | ≤ 1 per screen, ≤ 4 per page; 25-35 % | as duotone | flush; cards only on neutral screens | saturation fatigue (red hero + red cards + red stats) |
| tonal | tints of one hue, depth by lightness | tinted | clay-sage, mono-luxe, earth-triad | 1-2 moments; 8-16 % | pop = the same hue at another lightness | may add one tonal layer (the one exception to one-card-tier) | "panel → surface → card" |
| dark-luxe | deep ground, one accent, photos cut out or framed | dark (H27 conditions) | mono-luxe, ink-accent | 1 moment; 4-10 % | none: pop = accent tint; no third hue on dark | flat or hairline; no raised cards | muddy brown-black + cream photo rectangle |
| high-key | very light page, pastel pop, ink type | light | blush-berry, warm-butter, cool-precise | 1 pastel moment; 10-20 % | pastel pop (C ≤ 0.08) analogous to the accent | flush; hairline cards | |
| mono+signal | greys and one signal colour on CTAs | light or dark | ink-accent, cool-precise | CTAs + 1 moment; 3-6 % | pop desaturated (C ≤ 0.04) | hairline | |

The **surface system** (K5, V29): a page has one ground (`base` / `soft` / `surface` per section, never more than two
neutral tiers in a row), **one card tier** (flat, hairline, tonal, ambient or directional from G15) and **no card inside
a card**; `data-surfaces="panels"` (sections as inset rounded panels) is allowed only with a flat or hairline card tier,
so a panel never contains raised cards (today 77 % of pages are `panels` with raised cards inside, design-baseline
§4.1); glass (G16) is a budget over imagery or colour fields, never a tier. Full-bleed moments are planned by the
grammar (`moments` slots, DES-§5.5) and counted by `budget:K2`. The K6 advisory (V37) renders every emitted colour to
sRGB with culori and notes hue 75-95° at chroma > 0.10 (the argan gold family sits at 85-90°, design-baseline §3.3);
the picker's hue slider shows that band hatched in a lighter pattern than the forbidden 25-75° band (DES-§12.4).

### DES-§4.11 Imagery pipeline (rev 2; G18, G19, G33; I1-I7, K7)

The merchant's photos are the only imagery (no stock, no generated images by default, rethink-ai §1.3); the pipeline
turns them into deliberate crops. Ownership: the media pipeline (`src/lib/media/process.ts`, T4 / P8) stores masters,
variants and the focal point; the local cutout and studio stage are ai.md's (AI-21, `ai.worker.ts:287-356`); this part
decides treatment, crop, role and consistency, and renders through the existing `Picture` primitive (AVIF/WebP srcset,
width/height, hero eager, DESIGN.md §5).

| Step | Rule | Where |
|---|---|---|
| Photo facts | `PhotoFacts = { count, maxWidth, hasCutout, dominant, background: { luminance: number; uniform: boolean }, sharp: boolean }` per asset from the asset metadata and a 32 × 32 downscale in the browser (edge-band variance decides `uniform`, Laplacian variance decides `sharp`); nothing is sent anywhere | wizard (P6), `src/lib/generator/garment.ts` `PhotoInfo` extended |
| Treatment choice (G18) | conditioned on G2 and filtered by H13: `cutout-stage` needs alpha; `full-bleed-crop` needs ≥ 1,600 px and `sharp`; `tight-detail` needs ≥ 1,400 px; `grid-contact` needs ≥ 3 assets; `framed` always possible; `tonal-duotone` only on secondary roles | sampler |
| Focal-aware crops (G19, I2) | the focal point comes from the focal editor (`assets.focus`) or the asset's stored default (centre of the alpha bbox for cutouts, else the centre); each slot's aspect (4:5, 3:4, 1:1, 2:3, 16:9, 21:9) crops around the focus with `object-position` from the normalised focus; the focus must stay inside the inner 80 % of the crop (V12) or the slot takes `framed`; three crop families per page (`full`, `tight` = the inner 50 % around the focus, `context` = the outer frame or `bleed`) | `planPhotos` (DES-§5.10), `Picture` |
| Cutouts and stages (I3) | an image on a stage needs alpha: `hasCutout` from the media pipeline's alpha mask (local BiRefNet, AI-21); without alpha a uniform-background photo on a dark base is **framed on a matching panel** (its background luminance decides a `soft` or `surface` panel), never placed as a fake cutout; stage presets per vibe: `glow` (radial product-tinted glow, maison / bloom / souk), `contact` (soft contact shadow only, apothecary / field / hearth / editorial), `plinth` (a flat tinted plinth with a hairline, circuit / kinetic / garage / playground); exactly one preset per page | `hero:stage`, `showcase`, `offer` visuals |
| Tint and duotone | `tonal-duotone` = `mix-blend-mode: luminosity` over the accent tint (the existing blend guard registers the mix, owner rule 1), applied to `context` and `proof` roles only; the `hero` and `offer` roles are always true-colour (honest colour) | compile → CSS tokens |
| Consistency rules | photos on one page come from one "set": when backgrounds differ (uniform vs textured, luminance Δ > 0.35), the planner frames the odd ones (`framed`) so the page reads as one shoot; the hero and the sticky / form thumbnails use the same asset at the same crop (one product identity); a second product image that contradicts the first (parfum gold vs clear bottle, design-baseline §3.4) is a `detail` or `context` role, never a second `hero` | `planPhotos` |
| Resolution ladder (I6) | each slot declares `cssWidth1440` and `cssWidth390` (`features.slots`); the asset must be ≥ 1.5 × the slot at DPR 2 (hard below 1.0 ×); below 1.5 × the slot takes a narrower aspect or `framed` (V11 repair) | V11 |
| Weight (F5) | ≤ 16 `<picture>` elements per page (the photo plan's 3-uses cap makes it ≤ 12 in practice); every `Picture` below the form is lazy; the hero `Picture` is `fetchpriority="high"` | `budget:F5`, `Picture` |
| Photo quality advice (AI-04 / AI-21, Cloud optional) | the Director's `photoQuality` (rethink-ai §1.4) may say "too soft for a full-width hero"; the engine already refused that treatment by H13, so the advice explains, never decides | ai.md |

### DES-§4.12 Motion signatures as tokens (rev 2; G23, G35; DS39; R5, S09, S10, V23)

Six easing families, each a complete signature: curve, duration scale, stagger, allowed reveal kinds and the surfaces
it may touch. One family per page (V23); the admin uses none of them (DES-§16.6).

| Family (G23.f) | `--lp-ease-out` | Durations s / m / l (× G23.d) | Stagger | Reveal kinds (1-2 of) | Fits | Never |
|---|---|---|---|---|---|---|
| expo | `cubic-bezier(.16,1,.3,1)` | 0.45 / 0.8 / 1.15, d 180-400 ms | 30-45 ms | fade-rise, mask-wipe | kinetic, garage, circuit, playground | layout properties |
| quint | `cubic-bezier(.22,1,.36,1)` | d 300-700 | 45-70 ms | fade-rise, blur-in, scale-in | maison, bloom, hearth, souk | `blur-in` on body text |
| quart | `cubic-bezier(.25,1,.5,1)` | d 240-600 | 40-60 ms | fade-rise, line-draw | apothecary, field, editorial | |
| critical | a ζ = 1 spring sampled into `linear()` (no overshoot) | d 300-600 | 40-60 ms | fade-rise, scale-in | any | |
| soft-spring | ζ 0.86 spring (`SPRINGS.soft` 0.78 → 0.86, DS28) | d 240-500 | 30-50 ms | scale-in, fade-rise | **playground only** (H15) | layout properties; any other vibe |
| mask | `cubic-bezier(.77,0,.18,1)` | d 500-900 | 60-80 ms | mask-wipe, line-draw | editorial, cinematic grammar, quiet-luxe | per-word text |

Budgets compiled into the page: reveals only inside the G35 scope (hero + section heads, ≤ 60 nodes; `data-reveal-scope`),
1-2 kinds, one signature animation per section (`features.signature` summed ≤ sections, S10), ≤ 3 secondary details
per page (S11), UI motion (hover, press, selection) ≤ 300 ms, scroll-linked effects (`G23.sc`, `animation-timeline:
view()`) only on the hero media and never on text; `prefers-reduced-motion`: opacity only, ≤ 120 ms (the frozen
runtime `reveal.ts` already honours it). The tokens are the existing `--lp-ease`, `--lp-ease-out`, `--lp-dur-s/-m/-l`,
`--lp-stagger` plus `data-reveal` / `data-reveal-scope`; `--lp-ease-spring` is emitted only for `soft-spring` on
`playground` and is absent elsewhere (so a stray selector cannot bounce). The baseline's seven `spring: "soft"`
archetypes (`src/lib/theme/archetypes.ts:337, 409, 555, 700, 772, 844, 988`) read as a 2 % overshoot today; after DS28
they are ζ 0.86 (≤ 0.3 % overshoot, below perception) and only `playground` keeps `bouncy` (`:482`).

---

## DES-§5 Choreography grammar (DG-04, R1, P6)

Replaces the three fixed storylines (`src/lib/generator/plan.ts:90-112`, GEN-11). `chooseVariant`, `calmBands`,
`assignBackgrounds` and `spacingFor` stay; only the order and the variant pools change.

### DES-§5.1 Grammar

```
Page    → Top Hero Strip? Act1 Form Act2 Close Footer Floating
Top     → announcement? header                               (unchanged rules)
Strip   → trustBar | marquee | ε                              (marquee: not calm, ≤ 1 per page; trustBar once per page, R3)
Act1    → Promise | Problem | Proof | Visual | Promise Visual | Problem Promise | Visual Promise | Objection
          (≤ 2 blocks, I2 decides)
Promise → benefits
Problem → problem
Proof   → reviews | socialProof | stats                       (owner data only, I6)
Visual  → showcase | gallery | video | beforeAfter             (each only with the material I4/I5 need, DS42)
Objection → faq                                              (a short pre-form FAQ of ≤ 3 questions; the long FAQ then leaves Act2)
Form    → orderForm                                           (the only picker on the page, R2)
Act2    → Block{2..4}, Block ∈ {Proof, story, comparison, specs, steps, Visual, Problem (if unused), Promise (if unused),
          offer, guarantee, faq (if unused)}; no type twice; at most one Visual; alternating density where G20.p asks
Close   → cta | guarantee cta | faq cta | cta faq | story cta | ε    (ε when Act2 ended with cta-like block: offer:showcase or guarantee:split)
Footer  → footer;  Floating → stickyCta whatsappFloat?        (unchanged rules; the float collapses into the bar, R7)
```

**Rev 2 changes to the grammar (design-baseline §4.2 root cause 4: the tail `offer › guarantee › faq › cta` sat on
210/210 plans):** `offer`, `guarantee` and `faq` are ordinary Act2 blocks, not a fixed tail; `Close` has six
productions; `Objection` lets a short FAQ precede the form; `urgency` is no longer a section (the form chip carries the
merchant end date, LAN-§6.2); the only sections with a fixed position are the hero (first in flow) and the footer
(last) (N3). The invariant I3 (`offer` before the final `cta`) still holds because `Close` is the last production.

Production weights come from G1 (vibe), G2 (grammar), mood and the inputs:

| Production | Weights |
|---|---|
| Act1 | Promise .26 · Problem .14 · Proof .12 (0 without owner proof) · Visual .14 · Promise Visual .12 · Problem Promise .08 · Visual Promise .08 · Objection .06; × 1.5 for Visual under gallery-led / cinematic; × 1.5 for Problem under apothecary, hearth, kinetic (the AFFINITY table of `plan.ts:75-87` keeps its role for optional blocks); Objection × 2 under specimen / catalogue |
| Act2 length | 2: .25 · 3: .45 · 4: .30; dense pages (G20.l = dense) +1 block allowed, airy pages −1; the total in-flow count must land in 8-14 (C3) or the expansion retries |
| Act2 block | AFFINITY[vibe][type] × grammar affinity (story ↑ editorial-column, quiet-luxe; specs ↑ specimen, catalogue; comparison ↑ split-tension, specimen; Visual ↑ gallery-led, cinematic; offer ↑ when the page has ≥ 2 packs; guarantee ↑ apothecary, hearth, field) |
| Act2 order | a random permutation of the drawn blocks, re-drawn (≤ 10 times) while it repeats any 4-section subsequence already used by ≥ 50 % of the store's own pages or of the simulated corpus pool (N3; the niche pool is read through the novelty verdict's `seq` component, never by sequence text) |
| Strip | trustBar .6 · marquee .25 · ε .15 (marquee 0 when calm or G2 ∈ {quiet-luxe, catalogue}) |
| Close | cta .35 · guarantee cta .2 · faq cta .15 · cta faq .1 · story cta .1 · ε .1 |

### DES-§5.2 Invariants (hard; gate V22, and the core budget gates that re-measure them)

| Id | Invariant | Also measured by |
|---|---|---|
| I1 | every hero CTA targets the order form anchor (`#order`) | V21 |
| I2 | the order form starts within the first **3.0 estimated mobile screens** (390 × 844, DES-§5.3), i.e. ≤ 2,532 px (stricter than the core's 3,000 px) | `budget:F1` (core §M.2) |
| I3 | when an `offer` section exists, it is before the final `cta` | — |
| I4 | one full-bleed colour moment (background accent, dark or pop) starts in the top half of the estimated page height; ≤ 2 such moments per page (color-field ≤ 4, ≤ 1 per screen) | V10, `budget:K2` |
| I5 | no two consecutive in-flow sections share a background (DESIGN.md §4, `assignBackgrounds`) | V07 |
| I6 | reviews, socialProof and stats appear only with owner-provided data (LP-02; `plan.ts` reservations keep their honesty filters); beforeAfter, video, gallery, ugc, lookbook and hotspots only with the material DS42 names | `honesty:I4`, `honesty:I5`, `honesty:D2` (landing) |
| I7 (rev 2) | the fold contract of the chosen hero family holds at 390 × 844 for the page's locale (DES-§5.12) | V25, `budget:C2` (core §M.2, Playwright) |
| I8 (rev 2) | 8 ≤ in-flow sections ≤ 14 and estimated mobile height ≤ 12,000 px; the expansion never emits more (the core's hard caps 16 / 15,000 are a backstop for owner edits in the builder) | V24, `budget:C3` |

Soft (V24): ≤ 1 strip in the body (V19 is hard above 1); estimated length 8-14 screens.

### DES-§5.3 Height model (`src/lib/design/heights.ts`)

Estimated height at 390 px in screens (844 px), before density: announcement .05 · header .08 · hero 1.0 · trustBar
.12 · marquee .10 · benefits 1.3 · showcase 1.1 · gallery 1.0 · video .9 · beforeAfter 1.0 · problem .9 · reviews 1.2
· socialProof .8 · stats .6 · story 1.0 · comparison 1.1 · specs .9 · steps 1.0 · offer 1.2 · orderForm 1.6 (1.3 in
the default state with the F1 field order, DES-§5.12) · urgency .4 · guarantee .6 · faq 1.2 · cta .7 · footer .6.
Multipliers: airy × 1.2, dense × 0.85, `spacingFor` tight/airy × 0.95 / 1.08, G21 adds `(G21 − 1) × 0.12` screens per
section. A variant may override its type value in the registry `features.h`. The model is calibrated once against the
baseline renders (`qa/saas-baseline/index.json` heights: 39 landings, mobile 26,525-31,757 px, median 28,463) by DG-09
(ratio of estimated to measured mobile height within 0.8-1.25 on ≥ 90 % of pages) and re-checked on the regenerated
corpus.

**Rev 2: the module is the core's measurement for `budget:C3`, `budget:F1` and `budget:C2` (core §M.2), so its API is
frozen at P0:**

```ts
// src/lib/design/heights.ts (pure, isomorphic; no DOM)
export interface FoldReport { family: string; ok: boolean; items: { image: number; price: number; cta: number; cod: number } /* estimated top px at 390 */; limit: 844 }
export interface HeightReport { v: 1; viewport: 390; sections: { id: string; type: string; variant: string; top: number; height: number }[]; total: number; screens: number; formTop: number | null; formHeight: number | null; fold: FoldReport; inFlow: number }
export function estimateHeights(doc: PageDoc, opts: { look: ThemeLook | null; locale: Locale; features: (type: string, variant: string, data: unknown) => VariantFeaturesResolved }): HeightReport;   // ≤ 1 ms
export const HEIGHT_MODEL_VERSION: number;   // bumped with the coefficients; calibration.json records the version it was fitted against
```

The core's `budget-limits.ts` holds the thresholds (90 KB / 140 KB, 12,000 / 15,000 px, 14 / 16 sections, 3,000 px
form top) with the baseline values beside them (core §M.2); this module holds the coefficients. A doc without `look`
is estimated with the archetype defaults (`genomeOf`), so legacy pages get the same numbers.

### DES-§5.4 Grammar → variant pools (weights; the archetype's `preferredVariants` still filter what fits)

| G2 | hero | benefits | gallery / showcase | steps | story | orderForm | faq | trustBar |
|---|---|---|---|---|---|---|---|---|
| editorial-column | editorial .45, split .3, statement .25 | zigzag .35, numbered .25, hanging .25, stack .15 | lookbook .4, filmstrip .3, contact .3 / ingredients .4, figure .3 | timeline .5, strip .5 | letter .4, image-text .4, manifesto .2 | split .5, minimal .5 | two-col .6, accordion .4 | ledger .6, chips .4 |
| poster | poster .7, statement .2, split .1 | bento .35, stack .35, zigzag .3 | carousel .6, contact .4 / hotspots .5 (merchant anchors only) | cards .6, strip .4 | manifesto .7, image-text .3 | bold .7, card .3 | accordion .7, two-col .3 | ribbon .5, chips .5 |
| gallery-led | contact .5, split .3, cinema .2 | stack .5, zigzag .5 | masonry .4, contact .3, lookbook .3 / exploded .3, figure .4 | illustrated .5, strip .5 | image-text .7, letter .3 | card .5, split .5 | accordion .6, two-col .4 | chips .7, ledger .3 |
| stage | stage .75, spec .25 | numbered .4, hanging .3, bento .3 | carousel .5 / hotspots .5, exploded .5 | cards .5, timeline .5 | image-text .6, letter .4 | card .6, bold .4 | accordion .6, two-col .4 | chips .6, ribbon .4 |
| specimen | spec .55, index .45 | numbered .6, stack .4 | filmstrip .5 / dimensions .5, exploded .5 | timeline .6, strip .4 | manifesto .5, letter .5 | minimal .6, split .4 | two-col .7, accordion .3 | ledger .8, chips .2 |
| catalogue | index .65, split .35 | stack .5, numbered .5 | masonry .6, filmstrip .4 / dimensions .6, figure .4 | strip .7, timeline .3 | letter .6, image-text .4 | minimal .7, card .3 | two-col .6, accordion .4 | ledger .7, chips .3 |
| split-tension | split .65, editorial .2, statement .15 | zigzag .6, bento .4 | lookbook .4, carousel .6 / hotspots .5, ingredients .5 | timeline .5, cards .5 | image-text .7, manifesto .3 | split .7, card .3 | accordion .5, two-col .5 | chips .5, ledger .5 |
| cinematic | cinema .8, split .2 | stack .6, zigzag .4 | filmstrip .6, lookbook .4 / exploded .5, figure .5 | strip .6, timeline .4 | image-text .5, manifesto .5 | split .6, bold .4 | accordion .7, two-col .3 | ribbon .5, chips .5 |
| quiet-luxe | quiet .6, statement .25, editorial .15 | stack .6, hanging .4 | lookbook .7, filmstrip .3 / ingredients .6, figure .4 | timeline .7, strip .3 | letter .7, manifesto .3 | minimal .8, split .2 | two-col .6, accordion .4 | ledger .8, chips .2 |

Other types keep today's archetype pools with the pools' reservations. `benefits:icons` is down-weighted × 0.5
everywhere (icons above every block, S07) and `benefits:bento` is capped at one per page (S08). **Rev 2:** `scrapbook`
is in no pool (banned aesthetic; `hero:contact` replaces it), `faq:chat` and `problem:chat` are out of every pool
(chat mock-ups, S20), `socialProof:whatsapp` stays in the pool only as the redrawn plain quote cards (S21),
`trustBar:stamps` is out of every pool (its redraw exists for old docs), `stats:*` enter a pool only when
`allowedNumbers` has ≥ 2 merchant figures (D2), `urgency:*` is in no pool (R3). A pool entry whose variant needs
material the page lacks (H13, DS42) is removed before the draw, so the honesty gate is a backstop.

**C1 by construction:** with the pools above, 9 hero families are reachable and each grammar leads with a different
one; the 140-plan sweep (DES-§17.1) asserts that no hero family exceeds 30 % of plans within one niche and that the
(hero family × grammar × colour strategy) tuple count is ≥ 40 over 210 plans (N4).

### DES-§5.5 Expansion (`src/lib/design/choreography.ts`)

```ts
export interface ChoreographyCtx { vibe: Archetype; grammar: Grammar; mood: MoodReading; density: PageGenes["G20"];
  has: { ownerProof: boolean; video: boolean; photos: number; endDate: boolean; whatsapp: boolean; storeName: boolean }; picker: OfferPicker }
export function expandChoreography(ctx: ChoreographyCtx, rng: () => number): { inFlow: string[]; record: PageGenes["G24"] } | null;
export function choreographyFallback(ctx: ChoreographyCtx): string[];   // today's TEMPLATES[TEMPLATE_PREF[vibe][0]]
```

1. Expand each non-terminal with the weighted productions; drop blocks the inputs cannot fill (no video → no `video`;
   no second distinct image → no `beforeAfter`; fewer than 3 photos → no `gallery` / `contact`; no merchant figures →
   no `stats`; DS42).
2. Check I2-I4 and I8 with the height model; on failure retry (new draw from the same stream) up to 50 times.
3. **Rev 2:** solve the rhythm genes on the sequence (DES-§5.8-5.11): `planPhotos` (H30; a 4th use drops or switches
   the media-hungriest optional block, ≤ 3 retries), `planCtas` (H31), `planOpeners` (H29), `planReveals` (H32), then
   the fold check (H28, DES-§5.12).
4. Mark slots: `moments` = indices that `assignBackgrounds` must paint with strong grounds (count from G10 band, I4
   first, ≤ 2 outside color-field), `cross` = the one boundary-crossing slot (product overlapping a panel edge,
   DESIGN.md §1.2), `signature` = the hero (the page's one signature; secondary details are counted by S11), `quiet` =
   one screen with ≤ 35 words and ≤ 1 image (C4), `density` = the G20.p pattern over the blocks (C7).
5. 50 failures → `choreographyFallback` and `why += "fallback-order"` (the fallback is one of three **rev 2** orders
   that themselves satisfy I1-I8 and the budgets, not today's 14-section templates).

`planSections` (`plan.ts:641`) takes the in-flow list from here instead of `chooseOrder`, then runs today's variant,
background and spacing passes with the grammar pools. `templateOrder` and `TEMPLATES` stay for remix of old docs.

### DES-§5.6 Store page kinds (R2, reused by storefront.md)

The same expander runs with kind-specific grammars, registered by storefront.md's sections:

```
Home       → Top HeroHome Collections? Act(2..4) Proof? Promise Footer      HeroHome → hero-home variants (storefront.md)
Collection → Top Banner? Filters Grid Pagination Footer                      (commerce utility register, DES-§11.1)
Product    → Top Gallery Info(price, options, COD form inline or drawer, delivery line) Act(1..3) Faq? Related Footer
Cart / Checkout → utility only; no choreography (single column)
```

Home and product kinds keep I1 (CTA → the product's form), I5 and I6; I2 applies to the product kind only.

### DES-§5.7 Distinctness by construction (N3 … N7, rev 2)

| Target | Construction that makes it hold | Measured by |
|---|---|---|
| N3 ≥ 60 distinct in-flow sequences per 100 plans in one niche; no 4-section subsequence on > 50 %; no fixed position except hero and footer | the grammar of DES-§5.1 (Act1 × 8, Act2 permutations, six Close productions, Objection), the Act2 re-draw against repeated 4-grams, `offer` / `guarantee` / `faq` as ordinary blocks | `test:design` (10,000 expansions ≥ 100 distinct; per-niche sweep ≥ 60/100; max 4-gram share ≤ 50 %; position histogram) |
| N4 ≥ 150 distinct (hero, benefits, form) tuples / 210; ≥ 40 distinct (hero family × grammar × strategy) | 9 hero families × ≥ 4 benefits variants × 4 form variants through grammar pools with ≤ .65 top weight; the sampler's bold genes | sweep report |
| N5 every archetype reachable per category; top ≤ 45 %; souk / playground / garage > 0 | the 0.02 floor in `priorFor` over `rankDirections` (DES-§4.3) and, in R1, a per-store **category prior widening**: the three directions take the top archetype plus two drawn from the next five by score (not the fixed top 3 of `pickArchetypes`, `directions.ts:390`) | sweep report (100 simulated stores per category) |
| N6 product facts enter the RNG; same (seedBase, archetype) across two products → J ≤ 0.25, never the same hero + pairing + order | `seed = deriveSeed(hash32(brandSeed + "\|" + inputHash), …)` where `inputHash` covers asset ids, product name, category and locale (DS5, DES-§14.2 step 1); `directionSeed`'s `seedBase`-only derivation (`directions.ts:427`) is replaced | `test:design` pairwise J over 7 fixtures × 10 seedBases |
| N7 ar and Latin pages of one genome differ in type scale, hero arrangement choice and line-break strategy | `typeTokens(pairing, look, locale)` (DES-§10.5) scales and leads per script; RTL-aware hero pools (`hero:cinema.band` and `hero:split.mediaSide` are logical; `hero:statement` structures differ per locale); Arabic particle binding | render-check ar/fr fixtures: identical `type:variant` sequence allowed, identical type metrics (`--lp-step-*`, line-height) not |

### DES-§5.8 Openers and the kicker budget (G32; C5, S15, S18)

`planOpeners(inFlow, grammar, rng): Opener[]` assigns one opener per in-flow section from `OPENERS`:
- budget: `kicker` on ≤ ⌈n/3⌉ sections (the hero counts), never on two neighbours, never on `orderForm` or `footer`;
- variety: ≥ 5 distinct openers per page, no opener on > 50 % of sections (hard above 70 %, `design:C5`);
- affinities: editorial-column and quiet-luxe → `caption` and `bare`; specimen and catalogue → `number` and `bare`;
  poster and cinematic → `image` and `bare`; split-tension and stage → `kicker` and `quote`; gallery-led → `image`;
- the hero's emphasis device (G26 swoosh / highlight / color / italic) applies to the hero title only; section titles
  carry no emphasis (the baseline showed the swoosh ≈ 20× per page, §3.2);
- the copy step drops the kicker string for sections whose opener is not `kicker`; `PageCopy` kickers are optional in
  the schema from P7 (`src/lib/ai/copy-schema.ts:113-151`; core §K.2 P7 row) and the library still provides one for
  every section so the opener can change later in the builder without a copy call.
Rendering: `SectionHeader opener={…}` (DES-§4.5.4); `data.opener` (optional, no default) is written into the section
data so the builder shows and edits it; a doc without it renders `kicker` (today).

### DES-§5.9 CTA plan (G34; R1, R7)

`planCtas(inFlow, variants, features, has): CtaPlan`: the primary CTAs are the hero's, the order form's submit, the
final `cta` block's and the sticky bar (counts as one); `offer:showcase` has none (the picker lives in the form, R2);
`benefits`, `reviews`, `story`, `guarantee`, `faq` render **no** button (their `cta` data toggle, optional, defaults to
off in new docs through the plan; old docs keep theirs); at most **6** primary CTAs and ≤ 2 visible at once at 390 px
(the height model checks the hero CTA and the sticky bar do not both show while the form is on screen). Rules compiled
to CSS: `[data-cta-plan~="hide-header"]` hides the header CTA while the hero CTA is in view (`IntersectionObserver` is
already in the frozen runtime for the sticky bar, `src/landing/runtime/sticky.ts`; the header rule reuses the same
`data-in` flag the sticky logic sets, zero new bytes), `[data-cta-plan~="collapse-float"]` docks the WhatsApp float into
the sticky bar's inline-start on mobile when the bar is visible (R7: ≤ 1 fixed bar + ≤ 1 float, fixed UI ≤ 88 px of
844). Labels: one intent, one label (rubric §4.5 "no duplicate CTA intent"): the hero, form and final CTA share the
`cta` string of the copy; "WhatsApp" is the second intent and the only other label.

### DES-§5.10 Photo-use plan (G33; I1, I2)

`planPhotos(inFlow, variants, photos, focal): PhotoPlan`:
1. Roles: the primary photo takes `hero` once (at the hero's crop) and at most one more role at a **different crop**
   (`tight` detail or `context`); secondary photos take `detail`, `context`, `proof` and `offer` roles; the sticky bar
   and form thumbnails (`thumb`) are excluded from the count.
2. Caps: every asset ≤ 3 appearances; the hero image ≤ 2 at the same crop; a plan needing more drops the media-hungriest
   optional block or switches `gallery` → `showcase:figure`, `beforeAfter` → removed, `story:image-text` →
   `story:letter` (H30).
3. Crops: ≥ 3 distinct crops per page from the focal point (`full`, `tight` = the inner 50 % around the focus, `context`
   = the outer frame, `bleed` = edge-to-edge); aspects from the G19 set; the focal point stays inside the inner 80 % of
   every slot (I2) or the slot takes `framed` (V12 repair).
4. Treatment coherence (G18): `tonal-duotone` tints only secondary roles, never `hero` or `offer`; `cutout-stage` needs
   alpha on the `hero` role; `grid-contact` needs ≥ 3 distinct assets (H13).
5. Output: section media refs + `ratio` where the variant supports it; `features.slots` gives each slot's CSS width for
   V11 (resolution ≥ 1.5 × the slot at 1440 px, hard below 1.0 ×).
The budget gate `budget:I1` (core §M.2, > 4 hard) counts asset ids in the published doc; a planned page never reaches
it; an owner who pastes the same photo into a fifth section meets it in the builder first (same id).

### DES-§5.11 Reveal plan (G35; R5, T2)

`planReveals(inFlow, look): RevealPlan`: scope `heads` (default): `data-reveal` on the hero's title, lead, media and
CTA and on each section's title and lead (and the first image of `image` openers); `hero`: the hero only (airy
quiet-luxe pages); `none`: commerce and transactional registers (DES-§11.1). Kinds: 1-2 from G23.r; stagger G23.st;
whole-line text reveals (`mask-wipe` or `fade-rise` on the block, never `.lp-word` spans in Arabic, T2); estimated
nodes = hero (≤ 6) + 2 per section + images in scope ≤ **60**; the renderer emits `data-reveal` only inside the scope
(`[data-reveal-scope]`, read from `look.mo.scope`), so a legacy doc without `look` keeps today's reveals and the
budget gate `budget:R5` (> 120 hard) catches only owner-built pages. `prefers-reduced-motion`: opacity only, ≤ 120 ms
(existing `reveal.ts` behaviour, frozen).

### DES-§5.12 Fold contract (I7; C2, F1)

Each hero family declares `features.fold` = the ordered stack of its fold elements with estimated heights at 390 px
(header .08 screen + announcement .05 when present + the family's rows). The height model computes the top of the
product image, the price, the primary CTA and the COD line ("خلّص ملي توصلك" / "Paiement à la livraison", the sticky
bar's line or the hero's own) and `fold.ok` = all four ≤ 844 px for the page's locale (Arabic type metrics are taller,
DES-§10.5). Families and their fold stacks: `stage` image (≤ 46 vh) → title (≤ 2 lines) → price + CTA + COD row;
`editorial` title → image (≤ 40 vh) → price row; `poster` title band → image → price block; `spec` image → callouts
(≤ 2 shown in the fold) → price row; `split` image beside text ≥ 768 px, stacked image (≤ 44 vh) → text → price row on
mobile; `cinema` image (≤ 56 vh) → band (title, price, CTA, COD); `quiet` image (≤ 52 vh) → one line (title) → one line
(price, CTA); `index` image (≤ 40 vh) → 3 facts → price row; `contact` grid (≤ 58 vh) with the title cell holding
price + CTA; `statement` title (≤ 3 lines) → thumbnail ≥ 160 px → price row. A family whose fold cannot hold at the
page's `dmax` is re-solved (H28). The core's `budget:C2` re-measures the rendered page in Playwright (`qa:publish-gates`,
core §J.3) with the same four elements, so the static estimate and the measured fold are compared on every corpus run
(ratio within 0.9-1.1 on ≥ 95 % of pages, else the coefficients are refitted). The order form's default state (F1) is
`offer → name → phone → city → submit`, address and note collapsed or after the confirmation call (P3's `orderForm`,
LAN-§3.2; the height model gives it 1.3 screens, V22 keeps it ≤ 3 screens from the top).

---

## DES-§6 Section layout grammar (DG-15, R3, track D4)

### DES-§6.1 Slots and arrangements

Each section variant declares **slots** (`media`, `title`, `body`, `list`, `proof`, `cta`) and the **arrangements** it
supports. An arrangement changes the CSS grid placement only (no new component):

| Arrangement | Meaning | Constraints |
|---|---|---|
| `stack` | slots in one column | always supported; the 320-479 px fallback of every other arrangement |
| `split(r)` | media and text side by side, r ∈ {1:1, 5:7, 7:5, 4:8, 8:4} | ≥ 768 px; mirrored by logical properties in RTL |
| `overlap(dx, dy)` | media overlaps the text panel by 8-16 % | ≥ 768 px; the boundary-cross slot (DES-§5.5) only; never over a CTA |
| `hang` | a caption or label column hangs in the margin | ≥ 1024 px and G3.m = offset |
| `bleed(edge)` | media bleeds off the inline-start or inline-end edge | ≥ 768 px; media ≥ 1600 px wide (V11) |
| `index` | items as numbered rows with hairlines | list slots only; G25.nb ≠ none; one numbering style per page |

`SectionInstance.data.arrange` is an optional field added to the section data schemas of the variants that support it
(`src/landing/sections/<type>/schema.ts`); a doc without it renders the variant's default (today's layout).
Alignment `start | center | end` (`data.align`) joins it; `end` is the mirrored start, meaningful in mixed-direction
pages.

### DES-§6.2 Support matrix and the 10× target

Every variant supports `stack` plus ≥ 3 other arrangements on average (the registry lists them per variant); with
three alignments, 94 variants × ≈ 4 arrangements × 3 alignments ≈ 1,100 tuples ≥ 10 × 91 (DG-15 acceptance). G2 sets
arrangement weights: editorial-column → split 5:7 / hang; poster → overlap / bleed; gallery-led → bleed / split; stage →
stack / overlap; specimen → index / hang; catalogue → index / split; split-tension → split 5:7 / overlap; cinematic →
bleed; quiet-luxe → stack / split 4:8. **Page rule:** at most 2 non-stack arrangement families per page, and the same
arrangement never on two adjacent sections (rhythm, V08).

### DES-§6.3 Checks

Each arrangement has a render-check fixture at 320, 390, 768, 1440 px in ar and fr (`scripts/qa/render-check.ts`
fixtures, P6/D4) and a visual-CI case (DES-§17.5); `bleed` and `overlap` are refused by the planner when the focal
point (G19) would leave the inner 80 % safe area.

---

## DES-§7 Distance, novelty, reservation (DG-05 R1, DG-16 R3)

### DES-§7.1 Distance view (`src/lib/design/distance.ts`, pure, isomorphic)

```ts
export interface DistanceView {
  v: 1; kind: "page" | "brand";
  cat: { grammar: number; strategy: number; treatment: number; pairing: number; displayFamily: number; arDisplay: number;
         base: number; ladder: number; mask: number; depth: number; button: number; emphasis: number; glyph: number;
         density: number; align: number };                         // indices into GENE_VOCAB value lists, -1 = n/a
  accent: [number, number, number]; pop: [number, number, number]; // OKLab of the compiled palette
  num: { rd: number; w: number; space: number; area: number };     // normalised 0..1 by the gene ranges
  hero: number;                                                    // token id of hero variant + arrangement
  seq: number[];                                                   // ≤ 24 token ids of in-flow "type:variant"
  tags: number[];                                                  // 7-bin histogram of G29 over titles, normalised
}
export function distanceView(g: DesignGenome, compiled: Compiled): DistanceView;
export function packView(v: DistanceView): number[];              // the design_genomes.vec layout (≤ 400 B as JSON)
export function unpackView(vec: readonly number[]): DistanceView;
export function genomeDistance(a: DistanceView, b: DistanceView, scope?: "full" | "page" | "brand"): number;   // [0, 1], symmetric
```

Token ids come from a frozen table `src/lib/design/tokens-table.ts` (append-only: a new variant gets the next id), so
stored vectors stay comparable across releases.

### DES-§7.2 Components and weights

`d(a, b) = Σ wᵢ · dᵢ / Σ wᵢ` over the components present in the scope.

| Component | dᵢ | w (full) | page | brand |
|---|---|---|---|---|
| grammar G2 | 0/1 | 3 | 3 | |
| colour strategy G9 | 0/1 | 3 | | 3 |
| image treatment G18 | 0/1 | 3 | 3 | |
| type pairing G4 | 0 same pairing · 0.5 same Latin display family · 0.75 same Arabic display only · 1 otherwise | 3 | | 3 |
| accent colour | OKLab ΔE / 0.15, capped at 1 | 2 | | 2 |
| pop colour | OKLab ΔE / 0.15, capped at 1 | 1 | | 1 |
| base, ladder, mask, depth, button, emphasis, glyph | 0/1 each | 1 each (7) | | 1 each (7) |
| type scale rd, display weight | \|Δ\| on the normalised value | 1 each (2) | | 1 each (2) |
| section spacing, accent area | \|Δ\| normalised | 1 each (2) | 1 each (2) | |
| density, alignment | 0/1 | 1 each (2) | 1 each (2) | |
| section sequence | normalised Levenshtein over `seq` | 3 | 3 | |
| hero variant + arrangement | 0/1 | 2 | 2 | |
| copy structure | 1 − weighted Jaccard of `tags` | 2 | 2 | |
| **Σ w** | | **36** | **18** | **19** |

Properties (unit-tested): symmetric, `d(a, a) = 0`, `0 ≤ d ≤ 1`, triangle inequality not required. Two genomes that
differ in grammar, strategy and treatment are already at d ≥ 9/36 = 0.25, so the platform threshold is reachable by
the bold genes alone; the niche threshold (0.40) needs more.

### DES-§7.3 Niche key

`nicheKey(store, product) = market + ":" + family`, with `family` = `stores.category` when the owner set it, else the
copy family of the product (`copyFamily()`, `src/lib/ai/copy-library/index.ts`: 15 families + `modest`). Example
`"MA:skincare"`. Stores in two markets share the platform threshold, not the niche threshold.

### DES-§7.4 The novelty service (`src/lib/design/novelty.server.ts`, server-only)

```ts
export type NoveltyContext = "wizard" | "remix" | "studio" | "publish" | "theme";
export interface NoveltyRequest { candidates: { key: string; view: DistanceView }[]; niche: string; pageId?: string | null }  // ≤ 16 candidates
export interface NoveltyVerdict { key: string; platform: Band; niche: Band; own: Band | "first"; clone: boolean }
export function checkNovelty(scope: StoreScope, req: NoveltyRequest, ctx: NoveltyContext): Promise<NoveltyVerdict[]>;
export function thresholds(): Thresholds;   // calibration.json ⊕ platform_design.thresholds (never below the floors)
```

- **Pool cache:** the core-registered `scopedCache("novelty-pool")` under the platform key (≤ 20,000 entries, ≤ 10 MB,
  60 s, watermark `design_genomes.updated_at`, core §E.6) of `{ id, storeId, kind, niche, view }` for rows with
  `pool = 1`. Refreshed at most every 60 s by `SELECT id, store_id, kind, niche, vec, pool FROM design_genomes WHERE
  updated_at > ? ORDER BY updated_at, id LIMIT 5000` (`// tenancy: platform design-novelty`, DES-R9 accepted, core D64,
  pinned at 3 annotations with `src/lib/jobs/tracks/design.ts`); rows that left the pool are evicted by the same
  query. `storeId` stays in process memory only, to exclude the caller's own store; it is never serialised.
- **Niche shares for the sampler (H33, K1, T4, T5):** the same cache answers `nicheShares(niche): { grammar, strategy,
  displayFamily, arDisplay, heroFamily }` as **value → share** maps over the niche's pool rows (counts only, k ≥ 5
  stores or the map is empty); the sampler reads them through `checkNovelty`'s sibling `nicheSharesAction` (same bucket,
  same verdict-only discipline: shares are rounded to 5 % and never carry a store id). In R1 they feed the
  anti-concentration rules; in R3 the full novelty budget (DES-§7.6).
- **Own pages:** read through the scope: the store's last 10 `published` / `chosen` page rows (`dg_store_kind_idx`),
  excluding `req.pageId`. `own = "first"` when there are none.
- **Bands:** `ok` when d ≥ threshold + 0.05, `close` when threshold ≤ d < threshold + 0.05, `too_close` below
  (DS7). Platform uses the full distance against other stores' page and brand rows of the same `kind`; niche uses the
  same rows filtered by `niche`; own uses the page scope.
- **Clone flag:** `clone = true` when d < `thresholds().clone` (0.12) against any other store's pool row (DS6).
- **Cost:** brute force, ≤ 16 candidates × ≤ 20,000 rows; p95 ≤ 25 ms in Node (unit-timed on a synthetic pool).
- **Rate limits:** `storeBucket(scope, "design:novelty")` 60 calls / 10 min, and ≤ 16 candidates per call (≤ 960
  verdicts per 10 minutes). Above it: `rate_limited`; the wizard then shows its directions without bands.
- **Kill:** `platform_design.novelty = "off"` (or the flag `design_novelty_check`, DES-§2.9) → every verdict `ok`,
  `clone = false`; `"warn"` → verdicts computed, never blocking. Logged in `job_runs`-style counters (`error_events` area
  `design`, code `novelty_off`) once per hour.
- **Logs:** raw distances are written only to an in-memory ring (last 2,000 verdicts) that the calibration script
  reads in development (`SG_DESIGN_DEBUG=1`, never in production) and to nothing persistent.

### DES-§7.5 Live, pool and reservation

| Event | Rows | Effect |
|---|---|---|
| page published (pre-publish hook, DES-§8.8) | the new `published` row | `live = 1, pool = 1`; the previous live row of that page: `live = 0`, `reserved_until = now + 30 d`, `pool = 1` |
| page unpublished, archived or deleted | its live row | `live = 0`, `reserved_until = now + 30 d` |
| store theme activated (R2) | the `theme` row | as publish, kind `brand` |
| store leaves `active` / `restricted` (any other status) | every live row of the store | `live = 0`, `reserved_until = status_changed_at + 90 d` (DS8, DS29) |
| store returns to `active` / `restricted` | rows of currently published pages and the active theme | `live = 1, pool = 1` |
| store purged | all rows | deleted by the purge job (core §F.9) |

Job `design.reserve` (track file `src/lib/jobs/tracks/design.ts`, every tick, 2 s budget): (1) store-status
reconcile: `UPDATE design_genomes dg JOIN stores s ON s.id = dg.store_id SET dg.live = 0, dg.reserved_until =
s.status_changed_at + INTERVAL 90 DAY WHERE dg.live = 1 AND s.status NOT IN ('active','restricted')` and the reverse for
returning stores (`// tenancy: platform design-reserve`); (2) expiry: `UPDATE design_genomes SET pool = 0 WHERE pool = 1
AND live = 0 AND reserved_until < UTC_TIMESTAMP(3) LIMIT 2000`. Both statements touch only `live`, `pool`,
`reserved_until`, `updated_at`.

### DES-§7.6 Novelty budget (DG-16, R3, D4)

Per niche and per bold gene value: `w'(v) = w(v) · (1 + ε) / (1 + ε + share(v) / target(v))`, ε = 0.25, `share(v)` = the
fraction of pool rows in the niche with value `v` (computed from the pool cache, no table), `target(v)` = 1 / |valid
values| (or a designer share from `priors.ts`). Floor 0.02 while the value is valid. Applied after the learned prior
and before the hard rules (DES-§4.4). Acceptance (DG-16): 1,000 simulated stores in one niche → no value's share exceeds
2 × its target. Shares are never shown per store; the console's niche chart shows them only for niches with ≥ 5 stores
(k-anonymity, core §F.11).

### DES-§7.7 MAP-Elites archive (DG-16, R3, D4)

- Cell = `grammar × colour strategy × type class` (9 × 7 × 4 = 252 per niche); type class of the display face:
  `serif` (bodoni-moda, fraunces, gloock, young-serif, instrument-serif), `condensed` (big-shoulders-display),
  `grotesk` (the other Latin displays), `mono-accent` (a grotesk display whose pairing has a mono accent).
  `cell_key = "<g2>|<g9>|<class>"`.
- Elites are the **designer seed genomes** (`src/lib/design/seeds/*.ts`, ≥ 44 at R1 = 4 per archetype from DG-09, grown
  to ≥ 252 by R3): parameters only, written by the design lead, scored by the gates (`best_q`).
- `filled` = pool rows in the cell (nightly job `design.archive`, from the pool cache).
- **Direction 3 explores:** when the wizard has ≥ 3 directions, direction 3 fixes (G2, G9, type class) to the
  under-filled cell (lowest `filled`, ties by highest designer `best_q`) that is valid under the hard rules, the mood and
  the photo facts, and samples the remaining genes inside it. With fewer than 5 stores in the niche the cell choice
  uses the platform-wide counts instead (no niche signal leaks).
- No request ever reads another store's genome through the archive: cells carry counts and seed ids only (DS22).

### DES-§7.8 Publish-time distance gates (R1; core §M.4, DS6)

The design check registered in the core registry (DES-§8.8) recomputes the page's view from the doc (`genomeOf(doc)` +
the doc's look) and calls `checkNovelty(scope, …, "publish")`. **Hard items (`design_blocked`):**

| Item id | Condition | Title (ar/fr/en keys in DES-§20.1) | Fix offered |
|---|---|---|---|
| `design:N1` | `platform = too_close` or `niche = too_close` (d below the platform or the niche threshold against another store's live page or brand row); `clone = true` (d < 0.12) sets `vars.clone = 1` so the wording says "almost identical" | `design.gate.N1` | `differentiate` (DES-§15.3): resample one bold page gene, ≤ 6 seeds, preview before/after |
| `design:N2` | `own = too_close` (d_page < 0.30 against one of the store's last 10 published / chosen pages) | `design.gate.N2` | `differentiate` with the store's own pages as the reference |
| `design:N8` | a generated or owner-typed headline whose 3-gram shingle share in the niche is > 25 % (`checkHeadlineNovelty`, DES-§9.8) | `design.gate.N8` | `rewriteLine` (generated) or the editor focus on the line (owner) |

**First come keeps its design:** when the earliest pool row in a collision belongs to the publishing store, the item is
not raised (the other store was the one that came too close; its own publish raised it). **Soft notes:** `close` on any
band (within +0.05 of the threshold) and a shingle share in 10-25 % lower Q (N02) and appear in the Design check panel
and as the Store Health issue `design:pages_close` (own pages only); they never refuse. Owner-typed copy is never
rewritten by a repair; it is flagged with the line focused. The wizard and the studio never present a `too_close`
candidate (DES-§14.2 step 5 resamples), so a seller meets `design:N1` / `design:N2` at publish only after editing a
page toward another design in the builder; the panel shows the same item live (core §M.1 rule 6).

---

## DES-§8 Quality gates, slop score, repairs (DG-06, R1, P6)

### DES-§8.1 API (`src/lib/design/gates/**`, pure, isomorphic)

```ts
export type Register = "marketing" | "commerce" | "transactional";
export interface AssetMeta { id: string; width: number; height: number; alpha: boolean; focus?: { x: number; y: number } | null }
export interface GateInput {
  doc: PageDoc; theme: BuiltTheme; genome: DesignGenome; assets: ReadonlyMap<string, AssetMeta>;
  locale: Locale; register: Register; context: "wizard" | "builder" | "save" | "remix" | "publish";
  origin: ReadonlyMap<string, "generated" | "owner">;   // per text field path: who wrote it (DES-§9.8)
  ownerProof: boolean;                                  // the store has real reviews/proof data (LP-02)
  facts: CopyFacts;                                     // merchant facts, allowedNumbers, policies, delivery text (DES-§9.6)
  heights?: HeightReport;                               // rev 2: estimateHeights() when the caller already has it (else computed)
  novelty?: NoveltyVerdict | null;                      // rev 2: the bands when known (publish passes the server verdict)
}
/** Internal ids: V = visual/structural, S = slop, C = copy, N = novelty, T = type, K = colour, I = imagery, R = rhythm, RTL, D = copy honesty mirrors. */
export type GateId = `V${string}` | `S${string}` | `C${string}` | `N${string}` | `T${string}` | `K${string}` | `I${string}` | `R${string}` | `RTL${string}` | `D${string}`;
export interface DesignGateItem {
  id: GateId; target?: BaselineTargetId;                // rev 2: the design-baseline §5 id the item enforces (DES-§8.10), e.g. "C5"
  level: "hard" | "soft" | "info"; section?: string; field?: string;
  penalty: number;                                      // soft: points off Q; hard: 15
  msg: MessageKey; vars?: Record<string, string | number>;
  fix?: RepairOp[];                                     // the one-click fix the panel offers (DES-§15.2)
}
export interface GateReport {
  v: 2; q: number; hard: DesignGateItem[]; soft: DesignGateItem[]; info: DesignGateItem[];
  slop: { score: number; items: DesignGateItem[] }; copy: CopyReport; heights: HeightReport; ms: number;
}
export function runGates(input: GateInput): GateReport;                          // ≤ 8 ms p95 in Node per doc
export function repairDoc(input: GateInput, opts?: { rounds?: 1 | 2 | 3; allowCopy?: boolean }): { doc: PageDoc; report: GateReport; log: RepairLog[] };
export function summarize(r: GateReport): GateSummary;                          // design_genomes.report
/** rev 2: the core's shared item type (core §M.1). id = "design:<target or gate id>", one fix per item, titles are ar/fr/en message keys. */
export function toGateItem(item: DesignGateItem): import("@/lib/render/prepublish").GateItem;
//   { id: `design:${item.target ?? item.id}`, level: item.level === "hard" ? "hard" : "soft", title: item.msg, vars: item.vars,
//     sectionId: item.section, field: item.field, fix: item.fix?.length ? { sectionId: item.section, actionId: `design:repair:${item.id}` } : undefined }
```

The internal items keep their penalties and repair ops for the panel and the wizard; the core sees only `GateItem`
(`toGateItem`), so one item has one id on both sides: the publish dialog, the Design check panel and the Store Health
list name the same `design:C5` for the same fault (core §M.5).

### DES-§8.2 Visual and structural gates

| Id | Gate | Method (static, from doc + tokens + asset meta + variant features) | Level |
|---|---|---|---|
| V01 | Contrast AA | `contrastAudit` on the emitted tokens per section background (existing, `src/lib/theme/palette.ts`): text ≥ 4.5:1, large text and UI ≥ 3:1 | hard |
| V02 | Contrast APCA (advisory) | body Lc ≥ 75, headings Lc ≥ 60 (APCA is a draft, so advisory only) | soft −2 each |
| V03 | No orange | `orangeMixes(spec, locale)` empty; no colour literal in section data in the band | hard |
| V04 | Grid unit | every spacing token is a multiple of `look.grid.u` (or 4) | hard |
| V05 | Radius ladder | chip < control ≤ card < media (`mixed`: control ≤ 8, media ≥ 999 or the mask); nested radius = outer − padding | hard |
| V06 | Glass budget | glass surfaces on the page (sticky bar and header excluded) ≤ G16 (and ≤ 2): soft above 2; above 4 the core's `budget:R4` refuses (this part reports, never refuses twice, DS33) | soft (R4 hard by the core) |
| V07 | Background rhythm | I5 (no same-background neighbours) | hard |
| V08 | Alignment and density runs | ≤ 2 centred in a row; no 3 in a row with the same density | soft −2 |
| V09 | Density words | words per section ≤ 35 airy / 70 balanced / 120 dense; list items 3-6 | soft −1; hard above 2× |
| V10 | Accent area | estimated area of accent/pop grounds (heights × full-bleed) within the G10 band ± 0.03 | soft −2 |
| V11 | Image resolution | for each media slot: asset width ≥ 1.5 × the slot's CSS width at 1440 px (slot widths per variant from `features.slots`) | hard below 1.0×, soft below 1.5× |
| V12 | Focal safe area | the asset's focus point lies inside the inner 80 % of the crop for the slot aspect | hard |
| V13 | Cutout required | stage, poster and spec heroes have an alpha asset | hard |
| V14 | Photo reuse (I1, I2) | the same asset ≤ 3 times per page (sticky bar and form thumbnail excluded), the hero image ≤ 2 at the same crop, ≥ 3 distinct crops per page; above 4 the core's `budget:I1` refuses | soft −1 per extra use, −2 below 3 crops |
| V15 | Type contrast | hero display / body size ratio ≥ 2.5 at 390 and 1440 px (from the type steps) | soft −3 |
| V16 | Weights per section | ≤ 3 font weights per section | soft −1 |
| V17 | Measure | body line length 45-75 ch at 1440 px (container, columns, font size, `xWidthAvg`) | soft −1 |
| V18 | RTL (RTL7) | for `ar`: no uppercase, letter-spacing or italic tokens; display/body are Arabic faces; directional icons from the mirrored allow-list; prices and phones in isolates; Arabic +6-10 % size; `dir="ltr"` tel input with +212 (renderer contract, checked by render-check) | hard |
| V19 | Scrolling strips | ≤ 1 marquee / ticker / ribbon in the body | hard above 1 |
| V20 | Proof honesty (I4, I5, D2) | reviews, socialProof, stats only with owner data (LP-02, `ownerProof`); beforeAfter with two distinct merchant images; video with a file or URL; gallery / ugc / lookbook with ≥ 3 distinct assets; hotspots with merchant anchors | **info** here (the panel shows it live); the refusal is landing's `honesty:I4` / `honesty:I5` / `honesty:D2` (core §M.3, DS33) |
| V21 | CTA clarity | the primary CTA is solid or pill (H20), has a label, targets `#order` (I1) | hard |
| V22 | Choreography invariants | I2, I3, I4, I6, I8 (DES-§5.2); the form top ≤ 3 estimated screens | hard (the core's `budget:F1` re-measures the 3,000 px form top on the render) |
| V23 | Motion | no overshoot easing outside `playground` (DS28), one easing family per page, nothing animates layout properties (variant features) | hard |
| V24 | Page length (C3) | 8-14 in-flow sections and estimated mobile height ≤ 12,000 px; above 16 sections or 15,000 px the core's `budget:C3` refuses | soft −2 (C3 hard by the core) |
| V25 (rev 2) | Fold contract (C2) | `estimateHeights().fold.ok` for the hero family and locale (DES-§5.12) | hard (and `budget:C2` on the render, core) |
| V26 (rev 2) | CTA count (R1) | ≤ 6 primary CTAs incl. the sticky bar; ≤ 2 visible at once at 390 (height model); one label per intent | soft −2 (above 8 the core's `budget:R1` refuses) |
| V27 (rev 2) | Floating layers (R7) | ≤ 1 fixed bar + ≤ 1 float; fixed UI ≤ 88 px of 844; the float collapses into the bar; the bar hides while an in-flow primary CTA is ≥ 50 % visible (`data-cta-plan`) | hard |
| V28 (rev 2) | Reveal budget (R5) | `features.revealNodes` summed inside the scope ≤ 60; 1-2 reveal kinds; reveals on hero and heads only; whole-line text reveals | soft −2 (above 120 the core's `budget:R5` refuses) |
| V29 (rev 2) | Surface levels (K5) | one ground + one card tier; no card inside a card inside a panel; `panels` only with a flat / hairline card tier (H26) | hard |
| V30 (rev 2) | Openers (C5) | kickers ≤ ⌈n/3⌉, never on two neighbours; ≥ 5 distinct openers; no opener on > 50 % (hard above 70 %); hero emphasis device on the hero only | soft −2 / hard above 70 % |
| V31 (rev 2) | Offer duplication (R2) | the pack / offer picker rendered once (in the order form); `offer` with a picker only when the form has none | hard |
| V32 (rev 2) | Trust and urgency duplication (R3) | the trust strip once; the countdown once and only with a merchant end date (LAN-§6.2 is the honesty source); urgency as a form chip, never a section in a generated plan | hard |
| V33 (rev 2) | Card grids (R9) | ≤ 3 card-grid sections, never adjacent; equal-card triplets ≤ 1 (S04) | soft −2 (hard above 5 grids) |
| V34 (rev 2) | Marquee clipping (I7) | the marquee track duplicates whole items with `padding-inline` ≥ 0.5 em; no text node inside a `[data-marquee]` may clip (static: item lengths × advance vs track; render: the RTL6 clip check) | hard |
| V35 (rev 2) | Watermark consistency (T8) | a ghost / watermark text equals the product-name token of the chip (`bigWordOf(product.name)`, `src/landing/sections/hero/parts.tsx:108`) or the device is dropped | hard |
| V36 (rev 2) | Pop derivation and dark base (K4, K7, K8) | pop within ±30° or 150-210° of the accent and chroma ±0.04; no third hue on a dark base; body text on dark ≥ AA (hard) and APCA Lc 75 (advisory); a light-background photo on a dark base is cut out or framed on a matching panel (I3) | hard (K4, K7 AA, I3) / soft (APCA, K8) |
| V37 (rev 2) | Orange advisory band (K6) | any emitted colour with hue 75-95° and chroma > 0.10 rendered to sRGB → note (the 25-75° gate V03 stays hard) | soft −1 |
| N01 → `design:N1` | Niche / platform distance (DES-§7.8) | `too_close` on the niche or platform band (publish) | hard |
| N02 | Novelty bands | DES-§7.4: platform / niche `close` −1; own page `close` −1; shingle share 10-25 % −1 | soft |
| N03 → `design:N2` | Own-page distance (N2) | `own = too_close` (publish) | hard |
| N04 → `design:N8` | Headline shingle share (N8) | > 25 % in the niche (publish) | hard |

### DES-§8.3 Slop score

| Id | Pattern | Points |
|---|---|---|
| S01 | purple/indigo accent and pop (OKLCH hue 260-310°, C > 0.12) on a dark base, or gradient text (`background-clip: text`) | 4 |
| S02 | more than 2 glass surfaces (sticky bar and header excluded) | 2 + 1 per extra |
| S03 | radius ladder collapsed (chip, control, card, media within 2 px of each other) | 3 |
| S04 | ≥ 2 equal-card triplets (3 same-size cards, icon + title + text) | 3 |
| S05 | > 60 % of in-flow sections centred, or a centred dark hero with a glow field | 2 |
| S06 | aurora / glow on > 2 sections | 2 |
| S07 | icon above every block title in > 2 sections | 1 |
| S08 | bento in > 1 section | 1 |
| S09 | bounce easing outside `playground` | 2 |
| S10 | more than 1 signature animation per section on > 50 % of sections | 2 |
| S11 | more than 3 secondary details on the page (DES-§3.2) | 1 per extra, ≤ 3 |
| S12 | more than 1 giant decorative word, or any in an `ar` page whose word would overflow its container (char count × average advance > container) | 2 |
| S13 | chips laid over product photos: > 2 on one photo or on > 1 photo | 2 |
| S14 | two or more scrolling strips | 3 |
| S15 | numbered or edition eyebrows (`/^\s*(\d{1,3}\b\|n[o°º]\.?\s*\d\|vol\.\|edition\|édition\|chapitre\|الإصدار\|العدد\|رقم)/i` on kickers) | 2 |
| S16 | decorative status dots (a dot glyph before > 3 list items or badges without a state) | 1 |
| S17 | rotating-text ring badge | 3 |
| S18 | identical section headers: the same kicker + title + lead pattern in ≥ 4 sections | 2 |
| S19 (rev 2) | per-word reveal spans on any Arabic title, or on > 2 Latin titles | 2 |
| S20 (rev 2) | chat-mock problem block (bubbles, timestamps) | 2 |
| S21 (rev 2) | phone-mock review frames | 2 |
| S22 (rev 2) | big-number stats with gradient bars or footnoted "sources" (the figures themselves are `honesty:D2`) | 2 |
| S23 (rev 2) | the countdown rendered as a chip in more than one place, or any countdown outside the form chip in a generated plan | 2 |
| S24 (rev 2) | giant cut-off wordmark footer (a footer word wider than its container) | 1 |
| S25 (rev 2) | hotspot callouts without merchant anchors (also `honesty:I5`) | 2 |
| S26 (rev 2) | tell budget (R8): > 2 devices from the eleven-item list on one page (ghost word, eyebrow set, hotspot trio, chat-mock problem, rotating stamp, tape marquee, big-number stats, desaturated slider, countdown, phone-mock reviews, giant footer wordmark) | 3 (+1 per extra) |

`score ≥ platform_design.slop.fail` (default 6) is a **hard** item (`S00 slop_fail`, core id `design:R8`); `≥
slop.repair` (default 3) triggers repairs in the wizard and remix; the builder shows the items and their fixes. The
baseline pages score 14-19 on this table (design-baseline §3.7 lists every device on every page); the corpus asserts a
median ≤ 2 after generation (DS25).

### DES-§8.4 Variant features (registry data, `src/landing/sections/<type>/index.tsx`)

```ts
// src/landing/registry.ts (P6): each variant entry gains `features` (optional fields default to 0 / false)
export interface VariantFeatures {
  glass?: number; aurora?: boolean; centered?: boolean; equalCards?: 0 | 3 | 4; iconHeads?: boolean; bento?: boolean;
  scroller?: boolean; signature?: number; details?: number; ghostWord?: boolean; ring?: boolean; overlayChips?: number;
  dots?: boolean; numberedEyebrow?: boolean; animatesLayout?: boolean;
  slots?: { name: string; cssWidth1440: number; cssWidth390: number; aspect: Aspect | "free"; role: PhotoRole }[];   // V11, V12, the photo plan
  decor?: Partial<Record<"ghost" | "ring" | "chips" | "aurora" | "dots" | "ticker", string>>;   // data path that turns it off
  h?: number;                                                                  // height override in screens (DES-§5.3)
  arrangements?: Arrangement[];                                                // DG-15 (R3)
  // rev 2
  ctas?: number;                     // primary CTAs the variant renders by default (hero 1, orderForm 1, cta 1, stickyCta 1, others 0 unless data.cta)
  cardGrid?: boolean;                // the variant is a grid of equal cards (R9)
  picker?: boolean;                  // renders the offer / pack picker (R2; orderForm and offer:stacked/tickets/shelf true, offer:showcase false)
  fixed?: "bar" | "float" | null;    // a fixed layer (stickyCta → "bar", whatsappFloat → "float"; R7)
  fixedPx?: number;                  // its height at 390 (bar ≤ 64, float ≤ 24 collapsed)
  revealNodes?: number;              // `[data-reveal]` nodes the variant emits inside scope "heads" (R5)
  fold?: { rows: { el: "image" | "title" | "price" | "cta" | "cod" | "callouts" | "facts" | "band" | "grid"; vh?: number; lines?: number }[] } | null;   // hero families only (DES-§5.12)
  openers?: Opener[];                // openers the variant's header supports (default: every opener; orderForm and footer: none)
  textRuns?: ("display" | "marquee" | "badge" | "ghost")[];   // text that can clip (RTL6, I7, T8 checks)
}
export type VariantFeaturesResolved = Required<Omit<VariantFeatures, "decor" | "slots" | "h" | "arrangements" | "fold" | "openers" | "textRuns">> & Pick<VariantFeatures, "slots" | "fold" | "openers" | "textRuns">;
export function variantFeatures(type: string, variant: string, data: unknown): VariantFeaturesResolved;
```

Data toggles (`decor`) override the static features: `hero:stage` with `data.ghost = false` has `ghostWord = false`;
`data.cta = false` sets `ctas = 0`; `data.opener` narrows `openers`. A registry test (`test:registry`) fails when a
variant omits `features`, when a hero variant omits `fold`, or when a `fixed` variant omits `fixedPx` (so a new variant
cannot dodge the slop score, the fold contract or the floating-layer rule). The core's `budget.ts` reads only this
function and `estimateHeights()` (DS33), so the data is the single source for the design, budget and health
computations.

### DES-§8.5 Quality score

`Q = clamp(100 − 15·H − Σ soft penalties − 4·slop + 10·spec + 5·nov, 0, 100)`, rounded. `H` = hard items, `spec` =
specificity (0-1, DES-§9.6), `nov` = 1 when every novelty band is `ok`, 0.5 when the worst is `close`, 0 otherwise (and
0 in the builder before the first check). Shown as a whole number with its three largest contributions ("Good · 86:
2 sections share an alignment run (−2), hero contrast low (−3)").

### DES-§8.6 Repairs

```ts
export type RepairOp =
  | { op: "swapVariant"; section: string; to: string }
  | { op: "changeGene"; gene: GeneKey; to: string }
  | { op: "rewriteLine"; section: string; field: string; structure?: HeadlineStructure }   // library alternative; generated text only
  | { op: "setBg"; section: string; to: SectionBg }
  | { op: "setAlign"; section: string; to: "start" | "center" }
  | { op: "solidifyGlass"; section: string }
  | { op: "snapLadder" }
  | { op: "frameImage"; section: string; slot: string }
  | { op: "dropDecor"; section: string; decor: "ghost" | "ring" | "chips" | "aurora" | "dots" | "ticker" }
  | { op: "dropSection"; section: string }              // optional types only: marquee, socialProof, stats, urgency, video, gallery, beforeAfter
  | { op: "moveSection"; section: string; to: number }
  | { op: "punctuate"; section: string; field: string }   // dashes, exclamations, middle dots (DES-§9.7)
  // rev 2
  | { op: "dropKicker"; section: string }               // opener → "bare" (rethink-ai §1.2, §9.9)
  | { op: "setOpener"; section: string; to: Opener }
  | { op: "trimCopy"; section: string; field: string; maxWords: number }   // generated text only; library alternative that fits
  | { op: "rebalancePhotos"; plan: PhotoPlan }           // re-run planPhotos with a different seed stream (I1, I2)
  | { op: "scopeReveals"; to: RevealPlan["scope"] }      // heads | hero | none (R5)
  | { op: "collapseCta"; section: string }               // data.cta = false (R1)
  | { op: "swapHeroFamily"; to: string }                 // the grammar's next hero family that satisfies the fold (C2) and the photo facts
  | { op: "snapPop" }                                    // re-derive the pop from the accent (K4)
  | { op: "flattenSurfaces" };                           // panels → flush, or the card tier → hairline (K5)
export const AI_REPAIR_OPS = ["swapVariant", "changeGene", "rewriteLine", "dropKicker", "setOpener", "setAlign", "moveSection", "trimCopy", "swapHeroFamily"] as const;   // the closed subset the Director may propose (rethink-ai §1.2 `RepairOp`); ai.md validates against it
export function applyOps(doc: PageDoc, genome: DesignGenome, ops: readonly RepairOp[]): { doc: PageDoc; genome: DesignGenome; applied: RepairOp[]; skipped: { op: RepairOp; why: string }[] };
```

Deterministic plan (first matching row per item; at most 6 ops per round; hard items first):

| Item | Op |
|---|---|
| V06 / S02 glass over budget | `solidifyGlass` on every glass section after the first G16 ones |
| V05 / S03 ladder | `snapLadder` (recompile the G12 tiers) |
| V07 same background | `setBg` on the later section to the nearest allowed neutral |
| V08 / S05 centred run | `setAlign start` on the middle section of the run |
| V11 low resolution in a bleed slot | `frameImage`; still failing → `changeGene G18 framed` |
| V12 focal outside the safe area | `frameImage` (framed slots crop around the focus) |
| V13 cutout missing | `swapVariant hero split` (or `editorial` when split is the current one) |
| V19 / S14 strips | `dropSection` the marquee; else `swapVariant trustBar chips` |
| V22 form too low | `moveSection orderForm` to the latest index that passes I2 |
| V23 / S09 bounce | `changeGene G23 quint` |
| V10 accent area | `setBg` one moment section up or down |
| S04 triplets | `swapVariant` to `numbered` or `zigzag` (benefits), `strip` (steps) |
| S06 aurora | `dropDecor aurora` on the later sections |
| S12 ghost word | `dropDecor ghost` |
| S13 chips on photos | `dropDecor chips` on all but the first photo |
| S15 eyebrows / S18 identical headers | `rewriteLine kicker` (a plain topic kicker from the library) or drop the kicker on 2 sections |
| S17 ring badge | `dropDecor ring` |
| C01 dashes, C05 exclamations, C07 dots | `punctuate` |
| C02 / C03 / C06 / C08 copy | `rewriteLine` with another structure (generated text only) |
| V25 fold (rev 2) | `changeGene G5` (dmax − 8 px, ≥ 44) → the hero photo aspect → `swapHeroFamily` |
| V26 CTA count (rev 2) | `collapseCta` on the sections farthest from the form, the final `cta` last |
| V27 floating layers (rev 2) | `changeGene G34` (`floatCollapses = true`); a second fixed variant → `dropSection` |
| V28 reveal budget (rev 2) | `scopeReveals heads`, then `hero` |
| V29 surfaces (rev 2) | `flattenSurfaces` |
| V30 openers (rev 2) | `dropKicker` on the kickers above the budget (the hero keeps its own), then `setOpener` toward the under-used opener |
| V31 offer duplication (rev 2) | `swapVariant offer showcase` (the picker stays in the form) |
| V32 trust / urgency duplication (rev 2) | `dropSection` the later trust strip or the urgency section; a countdown without a merchant end date is removed by landing's honesty rule (never repaired into a fake date) |
| V33 card grids (rev 2) | `swapVariant` the adjacent grid to a non-grid variant of the same type (steps → strip, benefits → numbered / hanging, reviews → notes) |
| V34 marquee clipping (rev 2) | `swapVariant marquee outline` → else `dropSection` |
| V35 watermark (rev 2) | `dropDecor ghost` (the token is the product name; a differing word is never kept) |
| V36 pop / dark (rev 2) | `snapPop`; a light-background photo on a dark base → `frameImage` |
| S19 per-word spans (rev 2) | `changeGene G35` (whole-line reveals; the compile sets `titleSplit = false`) |
| S20 / S21 chat and phone mocks (rev 2) | `swapVariant problem split`, `swapVariant socialProof ugc` (redrawn plain cards) |
| S22 stats devices (rev 2) | `swapVariant stats rings` → else `dropSection` (the figures are `honesty:D2`) |
| S23 countdown chips (rev 2) | `dropDecor ticker` on the announcement, `dropSection urgency` |
| S24 footer wordmark (rev 2) | `swapVariant footer simple` |
| S26 tell budget (rev 2) | drop the lowest-value devices first (`dropDecor` ghost / ring / chips / ticker, then `swapVariant`) until ≤ 2 remain |
| N1 / N2 (rev 2) | `differentiate` = `changeGene G2` or `G18` with ≤ 6 seeds, keep the first that clears every band (DES-§15.3) |

Loop: up to 3 rounds; after each round `runGates` again; the result kept is the best of {original, round 1, 2, 3} by
(fewer hard items, then slop below the fail line, then higher Q). Repairs never touch owner-typed text, never change
prices, items, offers, pixels or the form fields, and never drop a section the owner added. Every applied op is logged
(`RepairLog = { op, item, before, after }`, counts kept in `design_genomes.report`).

### DES-§8.7 Where the gates run

| Context | When | Repairs | Budget |
|---|---|---|---|
| wizard | after each direction doc is built, before it is shown; the budget thresholds of the core's `budget-limits.ts` are checked on the estimates too, so a direction that the server would refuse is never shown | automatic (3 rounds) | ≤ 30 ms per direction incl. repairs |
| remix | after `remixDoc` | automatic (2 rounds) | ≤ 20 ms |
| builder | 400 ms after the last edit, in an idle callback; the panel lists design, budget (estimated) and honesty items with the same ids as the publish dialog (core §M.1 rule 6: `buildChecklist` carries the `GateItem[]`) | offered as one-click fixes in the panel | ≤ 8 ms |
| save (server, rev 2) | in `savePageDraft` after validation, `warn` mode: never refuses; writes `q`, `slop` and the `GateSummary` on the draft's `chosen` genome row (or creates a `derived` row for a legacy page) so the pages list, Store Health and the console see Q without a browser | none | ≤ 10 ms |
| publish (server) | the design check in the core registry (DES-§8.8) | none (the owner approved this doc) | ≤ 15 ms incl. novelty |
| re-render (server, core §H.3) | `warn` mode through the same registry; items recorded as notes in `render_jobs.error` and surfaced as Store Health design issues | none | ≤ 15 ms |
| export (ZIP, PHP, connected, WhatsApp) | `block` mode like a publish (core §M.1 rule 5) | none | ≤ 15 ms |
| store theme activation (R2) | before activating | offered | ≤ 50 ms for all inherit pages |

### DES-§8.8 The design check and listener in the core registry (core D51, §M; DES-R3 accepted A\*)

The registry is the core's (`src/lib/render/prepublish.ts`, maintainer, created in C0): one file imports the three
track files `prepublish/{budget,landing,design}.ts`; `publishPage` renders first (the budget gate needs the HTML), runs
every check, and the first failing code wins in the order **budget → honesty → design** while every item of every check
is listed (core §M.1). The core's types, used as they are:

```ts
// core §M.1 (verbatim shape): PrePublishCtx { scope, store, pageId, doc, prev, theme, assets, actor, now, mode: "block" | "warn" }
// GateItem { id: "<track>:<rule>", level: "hard" | "soft", title: MessageKey, detail?, vars?, field?, sectionId?, fix?: { tab?, sectionId?, actionId? } }
// PrePublishResult = { ok: true; notes?: GateItem[] } | { ok: false; code: "design_blocked" | "honesty_blocked" | "budget_blocked"; items: GateItem[] }
// src/lib/render/prepublish/design.ts (P6)
registerPrePublishCheck("design", async (ctx) => {
  const genome = genomeOf(ctx.doc);                                        // the doc's look or the back-derivation
  const novelty = await checkNovelty(ctx.scope, { candidates: [{ key: ctx.pageId, view: distanceView(genome, compiled) }], niche, pageId: ctx.pageId }, "publish");
  const headlines = await checkHeadlineNovelty(ctx.scope, niche, generatedTitlesAndLeads(ctx.doc));
  const report = runGates({ doc: ctx.doc, theme: ctx.theme, genome, assets: ctx.assets, locale, register: "marketing", context: "publish", origin: originFrom(ctx.prev, ctx.doc), ownerProof, facts, novelty: novelty[0] });
  const items = [...report.hard, ...noveltyItems(novelty[0], headlines)].filter(notOwnerCopy).map(toGateItem);
  const notes = [...report.soft, ...report.info].map(toGateItem);
  if (items.length && ctx.mode === "block") return { ok: false, code: "design_blocked", items: [...items, ...notes] };
  return { ok: true, notes: [...items, ...notes] };                       // warn mode: the core audits page.publish.design_override
});
registerPublishListener("design", async (ctx) => { /* DES-§7.5 live flip, the `published` genome row with q / slop / report, syncShingles (DES-§2.2); on "unpublished": DES-§7.5 + syncShingles */ });
```

Rules: (1) hard items exclude copy items on owner-typed fields and exclude V09 / V24 / V26 / V28 (soft here; their hard
levels are the core's budget gates) and V20 (landing's honesty gate), DS33; (2) `mode` comes from the core (the flag
`design_publish_gates` or `platform_design.gatesAtPublish`); honesty items are never `warn`-able and are not this
check's; (3) the design listener never fails the publish: a failure is an `error_events` row (area `design`) and
`design.backfill` repairs the row later (core §M.1 rule 4); (4) re-renders run this check in `warn` mode and exports in
`block` mode (core §M.1 rule 5); (5) the publish dialog renders every item with its one fix (a deep link to the
section through `fix.sectionId`, or the repair action `design:repair:<id>` the builder applies as an undoable edit);
never a toast (core §I.4); (6) the same items appear live in the builder through `buildChecklist(doc,
LandingCheckContext)` (T4 / P3 contract, core §K.1), so the dialog is never the first time an item appears (core §M.5);
(7) `storeAction` carries the typed refusal `{ ok: false, error: "design_blocked", items }` (core §E.2); the lint L12
checks that every publish path calls `runPrePublishChecks()`.

### DES-§8.9 The Director interface: digest, cards, rubric v3, repairs (rethink-ai §1; AI-19a R1, AI-19 R2)

The engine authors structure; the model directs (DS34). This part supplies the three deterministic inputs the Director
reads and the one vocabulary it may answer with; ai.md owns the prompts, the calls, the budgets and the loop.

```ts
// src/lib/design/digest.ts (pure, isomorphic)
export interface RenderDigest {                       // rethink-ai §1.2 `RenderDigest`, computed from the doc + features + heights, no DOM
  v: 1;
  sections: { id: string; type: string; variant: string; family: string /* layout family for the repetition cap */; opener: Opener; align: "start" | "center"; bg: SectionBg; glass: number; kicker: boolean; words: number; cardGrid: boolean; ctas: number; reveals: number }[];
  hero: { family: string; headlineLines390: number; subWords: number; textElements: number; ctaWraps: boolean; ctaContrast: number; fitsViewport390: boolean; topPaddingPx: number; fold: FoldReport };
  counts: { eyebrows: number; eyebrowBudget: number; centeredRun: number; sameFamilyMax: number; zigzagRun: number; marquees: number; bento: number; equalCardTriplets: number; glass: number; reveals: number; ctas: number; photoUses: Record<string, number>; fullBleedMoments: number };
  type: { pairing: string; displayFamily: string; arDisplay: string | null; heroDisplayPx390: number; ratio: number; weightsPerSectionMax: number };
  colour: { strategy: ColorStrategy; base: "light" | "tinted" | "dark"; accentOklch: [number, number, number]; popOklch: [number, number, number]; accentArea: number; orangeAdvisory: boolean };
  gates: { hard: GateId[]; soft: GateId[]; slop: number; q: number };
  heights: Pick<HeightReport, "total" | "screens" | "formTop" | "inFlow">;
  honesty: { allowedNumbers: number; numbersInCopy: number; proofSections: string[] };   // counts only; never customer data
}
export function renderDigest(doc: PageDoc, theme: BuiltTheme, genome: DesignGenome, report: GateReport): RenderDigest;   // ≤ 2 ms
export interface GenomeCard {                         // rethink-ai §1.2 `GenomeCard` (≈ 120 tokens): what the Director sees instead of a genome
  id: string; slot: "best_fit" | "contrast" | "explore"; bold: Record<BoldGene, string>; derived: Record<string, string | number>;
  q: number; slop: number; gateFails: GateId[]; distance: { own: Band | "first"; niche: Band; platform: Band };   // bands, never numbers (DS7)
  explanation: string[];                              // the DES-§4.8 chips as text, e.g. "Editorial column · Fraunces/Readex Pro · ink+one · tight-detail crops"
}
export function genomeCard(g: DesignGenome, report: GateReport, bands: NoveltyBands | null, slot: GenomeCard["slot"]): GenomeCard;
export function critiqueSummary(report: GateReport, genome: DesignGenome, doc: PageDoc): CritiqueInput;   // = { card, digest, headlines: { section, field, text, structure }[] } for generated text only; never owner contact data
```

- **Rubric v3 precedence** (rethink-ai §1.3), the order every Director prompt and every human reviewer applies when
  sources disagree: (1) the owner rules (no orange, modern, honest, natural ar/fr/en: hard, deterministic where
  possible); (2) DESIGN.md v3 budgets (DES-§3.2); (3) the gates, the slop score, the copy detectors and the distance
  thresholds of this document; (4) the compatible anti-slop rubric items (design read, dials, anti-centre bias, shape and
  colour consistency locks, button / CTA-wrap / form contrast, hero fits the viewport with ≤ 2 headline lines and ≤ 4
  text elements, eyebrow restraint, split-header ban, zigzag cap, section-family repetition cap, the copy self-audit,
  the production tells, the em-dash ban on **generated** copy). Void here: the rubric's orange-family palette rows,
  "dark mode mandatory" (a landing page keeps one theme), the stock-image sourcing rules (only the merchant's photos
  appear), the serif ban as written (the pairing rules decide, DES-§10). The digest answers the mechanical rows; tiles
  (R2, S7) answer the judged ones; when the critic contradicts the digest, the engine trusts the digest and logs
  `critic_contradiction` (rethink-ai §1.7).
- **Hints in (R1, flag `ai_director_brief`):** `GeneHints` (DES-§4.6) multiply priors ≤ 3×; the solver, the gates and
  the novelty check decide.
- **Critique and repair (R2, AI-19 "Director review" button; the engine side is this part's, the button is mounted in
  the builder by S1, core §K.4):** the Director's `{ ops: RepairOp[] }` is validated against `AI_REPAIR_OPS` and
  `GENE_VOCAB`; `applyOps` runs on a sandbox copy; the result is kept only when Q rises by ≥ 3, no hard item appears and
  every band stays `ok` (rethink-features §1.2), at most 2 rounds, capped per store per day by ai.md.
- **Preview tiles (R2, S7):** the admin browser rasterises the preview (fidelity-flagged, rethink-ai §1.4); the digest
  stays the ground truth. Nothing in this interface runs in the landing runtime.
- **Engine-only guarantee (DS34):** with Cloud AI off, steps 1-7 of DES-§14.2 produce three directions that pass every
  hard gate, every budget estimate and the novelty bands; `qa:wow-demo` (core §J.3) runs this path and asserts it.

### DES-§8.10 Baseline target coverage map (design-baseline §5; DS33)

Every target id, the module that **refuses** it (one owner), the gate that reports it, its level and threshold, where
it is measured, and the fixture that proves it. "static" = pure TS on the doc (wizard, builder, save, publish);
"render" = Playwright on the rendered page (`qa:publish-gates` core §J.3, `qa:design-corpus` DES-§17); "sweep" = the
140-plan fixture sweep (DES-§17.1). Hard = refuses publish; soft = lowers Q and becomes a Store Health note.

| Target | Owner · gate | Level · threshold | Where | Fixture in `test:design` / corpus |
|---|---|---|---|---|
| N1 niche d ≥ 0.40, platform ≥ 0.25 | design · `design:N1` (DES-§7.8) | hard at publish; the wizard resamples | static + pool | two-store fixture with identical photos → d ≥ 0.25; a cloned doc → `design_blocked` (`test:design-db`) |
| N2 own pages d_page ≥ 0.30 | design · `design:N2` | hard | static + own rows | store with 10 pages, an 11th near-copy → blocked |
| N3 ≥ 60 distinct orders / 100, no 4-gram > 50 %, no fixed position | design · grammar (DES-§5.7) | construction; corpus assertion | sweep | 140 plans per niche: distinct ≥ 60/100, max 4-gram share ≤ 50 %, positions free except 0 and last |
| N4 ≥ 150 distinct first-screen tuples / 210; ≥ 40 (hero × grammar × strategy) | design · pools (DES-§5.4) | corpus assertion | sweep | counts on 210 plans |
| N5 every archetype per category, top ≤ 45 %, souk/playground/garage > 0 | design · priors (DES-§4.3, §5.7) | corpus assertion | sweep | 100 simulated stores × 10 categories |
| N6 product-sensitive seed, J ≤ 0.25 across products | design · DS5 seed (DES-§14.2) | unit | static | same seedBase + archetype, two fixtures → J ≤ 0.25, no shared hero + pairing + order |
| N7 ar / fr differ in type metrics and hero arrangement | design · `typeTokens` (DES-§10.5) | render-check | render | ar vs fr fixture: identical sequence allowed, identical `--lp-step-*` / line-height not |
| N8 shingle share ≤ 10 % soft, > 25 % hard | design · `design:N8` (DES-§9.8) | soft / hard | static + `headline_shingles` | synthetic niche with 20 live pages |
| C1 ≥ 6 hero families, any ≤ 30 % per niche | design · pools | corpus assertion | sweep | hero family histogram per niche |
| C2 fold contract (image, price, CTA, COD inside 844 px) | **budget** · `budget:C2` (render) + design V25 (static) | hard | static + render | every hero family × ar/fr at 390 |
| C3 8-14 sections, ≤ 12,000 px (hard 16 / 15,000) | **budget** · `budget:C3`; design V24 soft | soft / hard | static (height model) | the 27-section baseline doc → `budget_blocked`; keep-list pages pass |
| C4 ≥ 1 full-bleed moment, ≥ 1 boundary cross, ≥ 1 quiet screen | design · V10 + the `cross` / `quiet` slots (DES-§5.5) | soft −2 | static | plan without a quiet screen → −2 |
| C5 ≥ 5 openers, kicker ≤ 30 %, emphasis hero-only; hard when one opener > 70 % | design · V30 | soft / hard | static | 12 sections all `kicker` → hard |
| C6 ≤ 2 centred sections | design · V08 (centred ≤ 2 in a row and ≤ 2 centre-aligned on mobile) | soft −2 | static | |
| C7 density pattern, word budgets | design · V09 | soft −1 / hard above 2× | static | |
| T1 tabular lining numerals on prices, counters, phones, quantities | design · `base.css` rule + `test:render` CSS lint on `.lp-price*`, `.lp-count*`, `[data-num]` | hard (lint) | render-check | Bodoni fixture: `font-variant-numeric` present |
| T2 Arabic display breaks: ≥ 2 words per line, no line ending on a particle, balance, 2-3 lines at 390, whole-line reveals | design · `RichText` binding + S19 + V18 | hard | static (S19) + render (line count, last-word check on the rendered h1/h2) | `argan-default-ar` headline fixture |
| T3 Arabic leading ≥ 1.25 display / ≥ 1.6 body, `padding-block` ≥ 0.12 em, underline offset | design · `typeTokens` + V18 | hard (leading) / soft (underline) | static tokens | `massage-default-ar` fixture |
| T4 no Reem Kufi display, ≥ 8 Arabic display candidates, any ≤ 30 % of ar pages per niche | design · F11, F12, H33 | hard (F11) / corpus (F12) | static + sweep | pairing catalogue scan; sweep histogram |
| T5 ≥ 8 pairings per archetype, ≥ 60 total; top pairing ≤ 25 % per archetype; top display ≤ 20 % platform-wide | design · catalogue + H33 | corpus assertion | sweep | |
| T6 hero display ≥ 44 px at 390, ratio ≥ 2.5, `max-inline-size` 10-14 ch, ≤ 3 lines, measure 45-75 ch | design · V15 + `typeTokens` | soft −3 | static tokens | |
| T7 Latin bidi hygiene in `[lang=ar]` | design · `RichText` `<bdi>` + V18 | hard | render-check (no reversed Latin runs) | `massage-default-ar` "X Pulse" fixture |
| T8 watermark = product-name token | design · V35 | hard | static | "الآركان" vs "الأركان" fixture |
| K1 strategy sampled per store, any ≤ 35 % per niche | design · G9 + H33 shares | corpus assertion | sweep | |
| K2 ≤ 2 full-bleed moments (color-field ≤ 4), hard above 4 | **budget** · `budget:K2`; design V10 / I4 | soft / hard | static (`features` + plan) | |
| K3 accent area per strategy band | design · V10 | soft −2 | static | |
| K4 pop derivation | design · H25 + V36 | hard | static | teal-on-argan fixture → repaired `snapPop` |
| K5 one ground + one card tier, no nested cards | design · H26 + V29 | hard | static | panels + raised cards fixture |
| K6 orange guard 25-75° hard; 75-95° at C > 0.10 advisory | design · V03 (hard) + V37 (soft) | hard / soft | static (`orangeMixes`, culori sRGB) | the argan gold fixture at hue 85-90° → note |
| K7 dark pages: AA hard, APCA Lc 75 advisory, light-background photos cut out or framed | design · V01 + V02 + V36 | hard / soft | static | |
| K8 base from photo background and strategy | design · H27 | construction (soft V36 note on a mismatch) | static | pink-base-for-argan fixture → light / tinted |
| I1 each photo ≤ 3 uses, hero ≤ 2 at the same crop; hard above 4 | **budget** · `budget:I1`; design V14 + G33 | soft / hard | static | |
| I2 ≥ 3 crops, aspects from G19, focal inside the inner 80 % | design · V12 (focal, hard) + V14 (crops, soft) | hard / soft | static (asset focus) | |
| I3 uniform-background images cut out or framed; `cutout-stage` needs alpha; contact shadow or stage | design · V13 + V36 + `stagePreset` | hard | static | the massage grey render fixture |
| I4 honest proof sections | **honesty** · `honesty:I4` (landing); design V20 info | hard | static | |
| I5 hotspots merchant-anchored | **honesty** · `honesty:I5`; design S25 | hard | static | |
| I6 resolution ≥ 1.5 × slot at DPR2 | design · V11 | hard below 1.0 ×, soft below 1.5 × | static (`features.slots`) | |
| I7 marquee word-safe, no clipped glyph box | design · V34 (static) + RTL6 clip check (render) | hard | both | "Eau de parf\|um" fixture |
| R1 ≤ 6 primary CTAs (hard > 8), ≤ 2 visible, header hides, float collapses | **budget** · `budget:R1`; design V26 + G34 + V27 | soft / hard | static + render count | 68-button baseline doc → `budget_blocked` |
| R2 offer picker once | design · V31 | hard | static | |
| R3 trust once, countdown once with a merchant date, urgency as a chip | design · V32 (+ `honesty:LP-21` for the date) | hard | static | |
| R4 glass ≤ 2 (hard > 4) | **budget** · `budget:R4`; design V06 | soft / hard | static / CSS count | 96-rule baseline doc → `budget_blocked` |
| R5 reveals ≤ 60 on heads (hard > 120), 1-2 kinds, one family | **budget** · `budget:R5`; design V28 + G35 + V23 | soft / hard | static / DOM count | 394-node baseline doc → `budget_blocked` |
| R6 radius ladder, nested radius = outer − padding | design · V05 | hard | static tokens | |
| R7 ≤ 1 bar + ≤ 1 float, fixed ≤ 88 px, bar hides near an in-flow CTA | design · V27 | hard | static + render (`qa:design-corpus` measures fixed heights) | |
| R8 tell budget ≤ 2 of 11, never the same pair twice in a niche; slop ≥ 6 fails | design · S26 + `design:R8` (slop) | hard | static (+ corpus for the pair rule) | the baseline-like fixture scores ≥ 6 |
| R9 ≤ 3 card grids, none adjacent, ≤ 1 triplet (hard > 5) | design · V33 + S04 | soft / hard | static | |
| D1 numbers consistency | **honesty** · `honesty:D1` (landing, `allowedNumbers`); design `copyReport.numbers` for Q and the wizard repair | hard | static | "30 s vs 40 s" blender fixture |
| D2 no library figures, ratings, synthetic names | **honesty** · `honesty:D2`; design S22 + DS42 pools | hard | static | "94 % questionnaire" fixture |
| D3 one Arabic register per page incl. FAQ Q/A | design · `design:D3` (DES-§9.4) | soft / hard when a FAQ pair mixes registers | static | MSA question + Darija answer fixture |
| D4 French article agreement | design · `design:D4` (DES-§9.5 `ProductRef`) | hard (grammar lint) | static | "Ce que change Sérum" fixture |
| D5 specificity ≥ 50 % | design · C04 | soft | static | |
| D6 lexicon, ≤ 1 "!" | design · C02 / C05 (+ guard `BANNED`, P7) | hard on the existing list | static | |
| RTL1 ranges, timers, phones, prices with Latin units in `<bdi dir="ltr">`; "48-24" = fail | design · `Price` / `Countdown` / `RichText` + render regex on `[dir=rtl]` text | hard | render-check | announcement "24-48" fixture |
| RTL2 countdown plurals | design · `Countdown` forms | hard | render-check (`data-forms` present, "02 يومين" absent) | |
| RTL3 no rotated / circular Arabic | design · `Badge`, `whatsappFloat:tab` + `test:render` lint (`writing-mode`, `textPath` in ar documents) | hard | render-check | |
| RTL4 price cluster one unit | design · `Price` + render adjacency check | hard | render-check (bounding boxes) | `parfum-default-ar` fixture |
| RTL5 addresses and e-mails LTR, no spaced punctuation | design · `footer` + render regex | hard | render-check | |
| RTL6 no clipped Arabic glyph box | design · clip check in `qa:design-corpus` (R1, segmented shots) and `qa:design-visual` (R2) | hard | render | seeded clipping fixture must fail |
| RTL7 logical properties, mirrored icons, no tracking / uppercase / italic, +6-10 %, LTR tel | design · V18 + `test:render` | hard | static + render-check | |
| RTL8 every visual run covers ar and fr at 390 and 1440; no `.lp-skip` on plain scroll | design · corpus harness (DES-§17.1) | harness rule | render | |
| F1 form top ≤ 3,000 px, height ≤ 1,100 px default, field order | **budget** · `budget:F1` (top); landing `orderForm` (order, collapse); design V22 (I2) + height model | hard | static | |
| F2 options only with declared variants, single-value pickers hidden, per-piece rows collapsed | design (generator, `src/lib/generator/offers.ts`, no invented per-piece options) + landing (`orderForm` rendering) | hard | static (generator unit) + render | the "Usage Visage/Cheveux" fixture never generates |
| F3 visible input boundaries ≥ 3:1 on every form variant | landing (`orderForm:minimal`, LAN-§3.2) + design contrast audit V01 on form tokens | hard | static tokens | |
| F4 upsell after submit only | landing (thank-you, LAN-§8) | hard | render | |
| F5 ≤ 90 KB gz HTML, ≤ 16 pictures, ≤ 2 families / ≤ 4 files (hard 140 KB) | **budget** · `budget:F5`; design `fontPreloads` (F9) + photo plan | soft / hard | render (gzip) | 170 KB baseline doc → `budget_blocked` |

Reading the map: 45 targets are refused by this part, 9 by the core's budget gates, 7 by landing's honesty gates (plus
F3/F4 by landing's form and thank-you), 5 are corpus assertions by construction (N3-N5, C1, K1, T5); no target is
without a refuser or a measured assertion.

### DES-§8.11 Store Health design rules (`src/lib/health/rules/design.ts`; SF-03, core §I.7, DS46)

```ts
export const rules: HealthRule[] = [
  { id: "design:q_low",       group: "design", release: "R1", collect: live pages with q < 70 → severity 2, points 6, evidence { metric: "q", value: minQ, window: "live", n: livePages }, fix: link to /pages/<id>/edit (the Design check panel), text "design.health.q_low" },
  { id: "design:slop",        group: "design", release: "R1", collect: live pages with slop ≥ 3 → severity 2, points 6, fix: the panel's "Fix all" action (`design:repair:all`) },
  { id: "design:pages_close", group: "design", release: "R1", collect: two live landings with d_page < 0.30 (from designHealth().closePairs) → severity 1, points 3, fix: "Differentiate" on the newer page },
  { id: "design:no_dna",      group: "design", release: "R1", collect: a live page without `look` and without a `derived` row older than the backfill → severity 1, points 3, fix: "Remix design" (DES-§15.4) },
  { id: "design:brand_empty", group: "design", release: "R1", mode: "landing", collect: no logo and no colour lock after ≥ 2 live pages → severity 1, points 3, fix: link to /brand },
];
```

Group cap 15 (core `HEALTH_CAPS.design`), so a store never loses more than 15 points to design; every rule reads only
the store's own `design_genomes` rows through `designHealth(scope)` (≤ 40 ms, one scoped query) and never another
store's data (the `pages_close` pairs are the store's own pages). Snooze, evidence `n` and i18n follow core §I.7;
`markHealthDirty(storeId)` is called by the publish listener (DES-§8.8) and by `savePageDraft` when Q crosses 70 or
slop crosses 3. The score never gates a publish.

### DES-§8.12 Root causes made impossible by construction (design-baseline §4.2)

| # | Root cause (today, `file:line`) | What replaces it | Where it is checked |
|---|---|---|---|
| 1 | archetype = a seed-free function of (category, palette, keywords): `rankArchetypes` / `CATEGORY_TABLE` (`src/lib/theme/vibe.ts:29-45, 308-328`), `pickArchetypes` takes the top 3 (`src/lib/generator/directions.ts:390`) | G1 stays ranked, but directions 2 and 3 are drawn from the next five by score with the 0.02 floor (DES-§5.7 N5), the brand seed and the input hash enter the rng (DS5), and direction 3 explores in R3 (DES-§7.7) | N5 sweep |
| 2 | the archetype locks ~70 % of the look: `ARCHETYPE_DEFS[a]` fixes button, card, mask, glyph, emphasis, radius, density, shadow, harmony, container, type ratio, labels, motion; `themeFromProduct` emits `radius/shadow/texture: "archetype"` (`vibe.ts:608-610`) read by `buildThemeTokens` (`tokens.ts:419-433`) | 35 genes; the archetype is a prior over them (DS1); `look` overrides the locks (DES-§4.5.2) | DG-03 acceptance: every G12/G15/G17/G25/G26/G27 value under ≥ 4 archetypes |
| 3 | three pairings per archetype, uniform draw (`vibe.ts:579`, `archetypes.ts` `d.fonts`) | ≥ 8 pairings per archetype plus borrowed ones (DES-§10.3), anti-concentration H33, the typography engine (DES-§10.5) | T5 sweep |
| 4 | three storylines with a fixed head and tail (`src/lib/generator/plan.ts:90-112`), `TEMPLATE_PREF` 0.6/0.28/0.12 | the grammar of DES-§5.1 with free Act2 permutations, six Close productions and the 4-gram re-draw | N3 sweep |
| 5 | steep variant prior on a short list: `chooseVariant` weights `preferredVariants` 0.58/0.27/0.15 (`plan.ts:262-308`); `tagged` lets `hero:scrapbook` in (`src/landing/sections/hero/index.tsx:127-131`) | grammar pools with ≤ .65 top weight and 9 hero families (DES-§5.4); scrapbook, chat mocks and stamps out of every pool | N4, C1 sweeps |
| 6 | anti-repeat scope = the 3 siblings of one run (`directions.ts:455-470`) | the novelty service against every live store and the store's own pages (DES-§7), hard at publish (DS6) | `test:design-db`, N1/N2 fixtures |
| 7 | the RNG ignores the product: `directionSeed = seedBase + direction:i:archetype` (`directions.ts:427`); `seedBase = Math.random()` per session (`src/components/generate/state.ts:188, 217`) | `seed = deriveSeed(hash32(brandSeed + "\|" + inputHash), …)` (DS5, DES-§14.2 step 1) | N6 unit test |
| 8 | offer display is an archetype table (`OFFER_LOOK`, `src/lib/generator/offers.ts:128-140`) | `OFFER_LOOK` becomes the prior of a per-page draw over (picker, selection, density) conditioned on G2 and G12 (`offers.ts` keeps the table as weights, not values); the picker renders once (R2) | N4 tuple count includes the offer picker |
| 9 | the rendered hero is archetype-determined (`hero/index.tsx` preferred lists): stage for 6 archetypes | hero pools per grammar (DES-§5.4) and the fold contract per family (DES-§5.12) | C1, C2 |
| 10 | proof sections render from copy libraries (`src/landing/sections/stats/copy.ts:55-69`); `INVENTED_FIGURE` guards one variant | DS42: the planner's reservations refuse the variant without material, the library figures become editor placeholders, landing's `honesty:D2` refuses at publish | D2 fixture |

---

## DES-§9 Copy: cliché and specificity detector, headline check (DG-07, R1, P6)

### DES-§9.1 Normalisers (`src/lib/design/text/normalize.ts`)

| Locale | Steps |
|---|---|
| ar | NFKC; strip tashkeel `[ً-ٰٟ]` and tatweel `ـ`; unify `[أإآٱ]` → `ا`, `ى` → `ي`, `ة` → `ه`, `ؤ` → `و`, `ئ` → `ي`; Arabic-Indic and Eastern digits → ASCII |
| fr | NFD, strip `\p{M}`, lowercase; `œ` → `oe`, `æ` → `ae`; `’` → `'`; split elisions (`l'`, `d'`, `j'`, `qu'`, `n'`, `s'`, `c'`) |
| en | NFKC, lowercase, `’` → `'` |
| all | remove `*emphasis*` / `**strong**` markers; the product name tokens → `§p`; numbers → `§n`; slot tokens (`{delivery}`, `{where}`) → `§s`; collapse whitespace; split on Unicode punctuation |

### DES-§9.2 Shingles

Word 3-grams of the normalised tokens of each title and lead; a title of ≤ 3 tokens contributes its 2-grams plus the
whole title as one shingle. Titles and leads are sketched together with `kind` (DES-§2.2).

### DES-§9.3 Cliché lexicons (seed lists; `src/lib/design/lexicon/{ar,fr,en}.ts`)

Each entry: `{ p: string; w: 1 | 2 | 3; k: "word" | "phrase" | "frame" }`; frames use `…` as a gap of ≤ 6 tokens.
Owner and copy reviewers extend them; the lists are a seed, not a claim of completeness. Today's `BANNED` hype lists in
`src/lib/ai/guard.ts:28-32` stay a hard rejection; the lexicon adds density scoring on top.

- **en:** elevate (3), unlock (3), seamless (3), game-changer (3), delve (3), tapestry (3), vibrant (2), crucial (2),
  enhance (2), fostering (2), showcase (1), curated (1), effortless (1), redefine (2), indulge in (2), embark (2),
  boasts (2), must-have (2), "in today's fast-paced" (3), "look no further" (3), "take your … to the next level" (3),
  "experience the difference" (2), "whether you're … or …" (3, frame), "not only … but also" (3, frame).
- **fr:** révolutionnaire (3), incroyable (2), ultime (2), sublimez (2), "plongez dans" (3), "découvrez l'univers" (3),
  "laissez-vous séduire" (3), "offrez-vous" (1), "l'allié idéal" / "l'alliée idéale" (2), "le compagnon idéal" (3),
  "n'attendez plus" (2), "un must-have" (2), "à couper le souffle" (2), "une expérience unique" (2), "sans compromis"
  (1), "un véritable" (1), "redéfinit" (2), "que vous soyez … ou …" (3, frame), "alliant … et …" (2, frame).
- **ar:** ثوري (3), سحري (3), "لا مثيل له" (3), "اكتشف عالم" (3), "استمتع بتجربة" (2), "تجربة فريدة" (2), "الخيار الأمثل"
  (2), "الحل الأمثل" (2), "رفيقك المثالي" (3), "سر الجمال" (2), "حلمك أصبح حقيقة" (3), "لا تفوت الفرصة" (2), "جودة عالية
  وسعر مناسب" (1, legitimate once), "سواء كنت … أو …" (3, frame), "ليس مجرد … بل …" (3, frame); Darija: "ما تفوتش
  الفرصة" (2), "عرض ما كاينش بحالو" (2).

### DES-§9.4 Structure detectors

| Id part | Detector | Penalty (C03) |
|---|---|---|
| triad | three adjectives or nouns joined by commas and one "and/et/و" in one sentence, more than once per page | −2 |
| not-just | "not just X, Y", "plus qu'un(e) X, un(e) Y", "ليس مجرد … بل" frames | −2 |
| sameness | every in-flow title tagged with the same G29 structure; any one structure on > 40 % of titles; fewer than 4 structures on a page with ≥ 8 titles (N8 structure rule) | −2 |
| questions | questions in > 2 titles | −2 |
| bang | > 1 exclamation mark on the page (C05; generated: repaired) | hard for generated, −2 for owner |
| dots | `·` more than once in a line, or in a title (C07; the rubric's rationing, rethink-ai §1.3) | −1 |
| emoji | any emoji (existing guard) | hard |
| register (rev 2, D3) | `ar` pages: `registerOf(text)` classifies each sentence `msa` / `darija` / `mixed` from a Darija marker lexicon (`واش, بغيت, ديال, دابا, كيفاش, علاش, باش, هاد, غادي, كتـ-, ما…ش, بزاف, شحال, فين, ملي, خلّص`) and MSA markers (`سوف, الذي, التي, إنّ, ليس, ذلك, هذه, كما, حيث`); the page register (G31) decides what may appear where: `none` = MSA everywhere; `cta` = Darija only in CTA labels, the sticky bar, the form submit / reassurance and FAQ **questions**; `light` = Darija allowed in leads and FAQ answers too. A FAQ pair whose question and answer registers differ is **hard** (`design:D3`); any other breach is −2 per sentence (generated: repaired by `rewriteLine` with the register's alternative) | hard (FAQ pair) / −2 |
| article (rev 2, D4) | `fr`: every rendered `{product}` slot is checked by `articleCheck(template, productRef)`: a template that places the name after `ce / cette / le / la / du / de la / un / une` needs `productRef.gender`; a template starting the slot with a bare name after a preposition ("Ce que change Sérum …") is rewritten to the gendered form ("Ce que change ce sérum") or to the name-free alternative the library carries for every such template | hard (grammar lint on the library at `test:copylib`; `design:D4` on owner-typed templates is soft −2) |

### DES-§9.5 Headline structures in the copy library

`src/lib/ai/copy-library/types.ts` gains `export type Line = string | { t: string; s: HeadlineStructure; d?: Device;
r?: "msa" | "darija" }` for hero titles, section titles and leads (`Device = "contrast" | "number" | "sensory" |
"question" | "quote"`); a plain string is read as `{ t, s: structureOf(t), r: registerOf(t) }` (`structureOf` and
`registerOf` = the heuristic taggers of DES-§9.9). **Rev 2 (D4):** the product name is read as a `ProductRef = { text:
string; gender: "m" | "f" | null; article: "le" | "la" | "l'" | null; plural: boolean }` by `productRef(name, locale)`
(`src/lib/ai/copy-library/product-ref.ts`, pure): a name typed with its article ("l'huile d'argan", "la crème") is
parsed; otherwise the head noun is looked up in a small French noun-gender lexicon (≈ 300 product nouns: sérum m, huile
f, crème f, savon m, shampoing m, montre f, parfum m, t-shirt m, robe f, abaya f, blender m, mixeur m, pistolet m,
tapis m, bougie f, …) and `gender: null` when unknown. **No PageDoc field is added** (the one R1 change to the frozen doc
is `ThemeSpec.look`, core §K.1); the wizard's Details step offers a one-tap "le / la" chip when `fr` is a page locale and
the gender is unknown, which simply prefixes the article in the typed name (the name is shown without it where the
header or the sticky bar needs the bare noun, by the same parser). `fr` templates use `{product:ce}` / `{product:le}`
/ `{product}` slots that `articleFor(ref, slot)` resolves ("ce sérum", "cette huile", "l'huile") and every template
with a gendered slot has a name-free alternative for `gender: null`. DG-07 acceptance: every hero and section title of every family ×
locale is tagged, ≥ 3 structures per family × locale for hero titles, the library contains no em or en dash (`grep -c
"—\|–"` = 0; today fr 12, en 17, ar 4 lines), and `test:copylib` renders every `fr` template against the four
`ProductRef` shapes with 0 article faults. Picks: the copy step takes G29 weights from `CopyDirectives.structures`
(G28 voice → structure weights below) and rotates structures across the three directions so two directions of one run
never share the hero title structure.

| G28 | Structure weights for titles |
|---|---|
| plain | noun-phrase .35, word-subline .25, imperative .2, contrast-pair .2 |
| warm | imperative .3, noun-phrase .25, question .15, quote-led .15, contrast-pair .15 |
| precise | noun-phrase .35, number-led .25 (merchant numbers only, else 0), contrast-pair .25, word-subline .15 |
| bold | imperative .4, word-subline .3, contrast-pair .3 |
| poetic-restrained | word-subline .35, noun-phrase .3, contrast-pair .2, quote-led .15 |

### DES-§9.6 Specificity score

For hero + benefits sentences: a sentence is **specific** when it contains at least one of: a token of the product
facts, materials or colours (`facts`, `Analysis`), a number the merchant gave (`allowedNumbers`, `guard.ts`), a sensory
verb or noun from the per-locale list (en smell, feel, glide, melt, absorb, rinse, fold, warm, cool, texture; fr sentir,
glisser, fondre, absorber, rincer, plier, chauffer, rafraîchir, texture, parfum; ar رائحة, ملمس, ينساب, يذوب, يمتص,
يُشطف, يدفئ, ينعش, ناعم, خفيف), or a delivery / cash-on-delivery fact from the store's policies or delivery text.
`spec = specific / total` (0-1). Target ≥ 0.5 (C04 penalty `round((0.5 − spec) × 20)` when below).

### DES-§9.7 Punctuation repair (`punctuate`, generated text only)

| Pattern | ar | fr | en |
|---|---|---|---|
| ` — ` / ` – ` between two clauses | `،` (or `.` when the second clause has ≥ 6 words) | `. ` + capitalise, or `, ` when the second part has ≤ 4 words | same as fr |
| ` — ` before a list or an explanation | `: ` | ` : ` (French spacing applied later) | `: ` |
| `—` at the start of an attribution | `- ` | `- ` | `- ` |
| range `10–20` | `10-20` | `10-20` | `10-20` |
| 2nd and later `!` | `.` | `.` | `.` |
| 2nd and later `·` in a line | ` ` + line break in lists, `، ` in ar, `, ` in fr/en | | |

Owner-typed text is never rewritten: the panel flags it (C01 soft −1 per field) with a "Fix punctuation" button that
applies the same table after the owner clicks.

### DES-§9.8 Headline near-duplicate checks

- **Origin:** every text field carries an origin: `generated` (library, local or cloud AI, untouched since) or `owner`
  (typed or edited). The builder already knows edits; the wizard marks everything `generated`. Stored in the editor
  state, not in the doc; at publish the server treats fields equal to the generation-time text (kept in the `chosen`
  genome row's report as a hash per field) as generated, everything else as owner.
- **In-store:** Jaccard of the page's shingle set vs each other page of the store (titles + leads, computed from the
  store's own docs, no table) > 0.5 → generated lines are resampled (`rewriteLine` with another structure), owner lines
  flagged (C06 soft −2).
- **Cross-store:** `checkHeadlineNovelty(scope, niche, texts)` (the core's P0 stub name, core §K.2; server action
  wrapper `checkHeadlinesAction`, ≤ 60 lines, `storeBucket(scope, "design:headlines")` 60 / 10 min): HMAC shingles →
  `SELECT owner_tag, hash FROM headline_shingles WHERE niche_key = ? AND hash IN (…) AND owner_tag <> ?`; for owners with
  ≥ 3 matched shingles, `τ_B` = max stored hash when B holds 256 rows (else ∞) and containment = matches / |candidate
  shingles with hash ≤ τ_B|. Containment > 0.35 → line verdict `close`. **Rev 2 (N8):** the same query also returns, per
  line, the **share** of the niche's live owners whose sketch contains any of the line's shingles, rounded to 5 % and
  computed over ≥ 5 owners (else `null`): share > 10 % → soft note; share > 25 % → the publish-time hard item
  `design:N8` (DES-§7.8). Answers per line `{ verdict: ok | close; share: number | null }` only (no owner, no count).
  Generated `close` lines are resampled (C08); owner lines get a soft flag "Close to wording already live on another
  store" (−1) and, above 25 %, the hard item with the line focused (the owner rewrites it; nothing is rewritten for
  them).
- **Library exhaustion:** in a crowded niche every library alternative may be `close`; after 3 resamples the least
  contained line is kept with the C08 soft item and the panel suggests "Write again" (AI) or an edit. This is the
  intended pressure toward fresh copy, never a block (the > 25 % share is a block only because it means the exact
  wording is already the niche's cliché).

### DES-§9.9 API (`src/lib/design/cliche.ts`, `text/*.ts`)

```ts
export interface ClicheHit { p: string; w: 1 | 2 | 3; k: "word" | "phrase" | "frame"; at: number }
export function clicheScore(text: string, locale: Locale): { score: number /* hits per 100 words, weighted */; hits: ClicheHit[] };   // used by ai.md guard v2 rule 6
export function structureOf(title: string, locale: Locale): HeadlineStructure;
export function specificity(doc: PageDoc, facts: CopyFacts): number;
export interface CopyReport { cliche: number; spec: number; items: GateItem[]; dashes: number; bangs: number }
export function copyReport(doc: PageDoc, facts: CopyFacts, origin: GateInput["origin"]): CopyReport;
export function shingles(text: string, locale: Locale): string[];
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number;
// rev 2
export function registerOf(text: string): "msa" | "darija" | "mixed" | "none";                   // DES-§9.4 register row
export function articleCheck(template: string, ref: ProductRef): { ok: boolean; fixed: string | null };   // DES-§9.5 (D4)
export function numbersReport(doc: PageDoc, facts: CopyFacts): { unknown: { field: string; value: string }[]; conflicts: { value: string; fields: string[] }[] };   // D1 mirror for Q and the wizard repair; the refusal is landing's honesty gate
export interface CopyReport { cliche: number; spec: number; items: DesignGateItem[]; dashes: number; bangs: number; registerBreaches: number; numbers: ReturnType<typeof numbersReport> }
```

ai.md's targeted re-ask fires when hero + benefits `clicheScore` > 1.0 or any weight-3 hit (AI-§D.2 rule 6).

### DES-§9.10 The copy voice system (rev 2; G28, G30, G31, DS44)

The five registers of G28 are **voices**, not tones: each fixes sentence rhythm (G30), headline structures (DES-§9.5
weights), what the lead may do, and how the three locales realise it. The library and the Director prompts (ai.md) read
the same table.

| Register | Rhythm (G30 mean words / exclamations) | Lead and body rules | ar (MSA + Darija per G31) | fr | en |
|---|---|---|---|---|---|
| plain | 7-9 / 0 | one fact per sentence; verbs in the present; no adjective without a noun it measures | MSA short sentences; Darija in CTAs and FAQ questions when G31 ≥ `cta` | `vous`, present, no "découvrez" | plain present, no "discover" |
| warm | 9-12 / 0-1 | second person, a place or a moment ("الدار", "le matin"), one sensory noun per lead | MSA with Darija warmth words in CTAs ("دابا", "ديالك") | tutoiement never; "chez vous" allowed | contractions allowed |
| precise | 6-9 / 0 | numbers only from `allowedNumbers`; materials, dimensions, counts; no metaphor | MSA only in body; Darija CTA allowed | nominal sentences allowed ("Lame en acier.") | spec-sheet nouns |
| bold | 4-7 / ≤ 1 | imperative or word + subline; ≤ 2 clauses; the exclamation, if any, on the final CTA | Darija-leaning when G31 = `light` ("مصنوع باش يدوم") | imperatives ("Faites-le durer.") | imperatives |
| poetic-restrained | 8-12 / 0 | one image per sentence, concrete nouns, no "world of"; a contrast pair allowed once per page | MSA, no Darija in body; CTA may be Darija | no "univers", no "sublimer" | no "elevate", no "tapestry" |

Rules shared by every register: natural ar/fr/en (owner rule 4): Arabic defaults to Western digits for Morocco, no
tashkeel in copy, hamza spelled consistently (the normaliser of DES-§9.1 unifies for comparison, the library spells
one way); French uses the `ProductRef` article and real typographic quotes « » with spaces when quoting; English never
uses the Darija or French line as a translation source without the library's own line. The Darija ratio G31 is read
from `store_ai.darijaRatio` (DS45) and the register from `store_ai.voice.register` when the owner set one; otherwise
the sampler's G28 prior per archetype (DES-§4.3) decides and the chosen register is written back to the genome only
(never to the setting). The voice examples on the brand page are DES-§20.4.

### DES-§9.11 Honesty of numbers and data: what this part checks and who refuses

`numbersReport()` (D1) and the `stats` / proof pool rules (D2, DS42) run in every gate context so the wizard repairs a
contradiction immediately (`rewriteLine` to the merchant's figure or to the figure-free alternative) and Q reflects it;
the **publish refusal** is landing's `honesty:D1` / `honesty:D2` (core §M.3, LAN-§6.1), never `warn`-able, with the
field named. The two parts share `allowedNumbers` (`src/lib/ai/guard.ts:52-66`, P7's choke point) as the one source of
"merchant numbers"; this part never derives a number from a photo, a category or a library table.

---

## DES-§10 Font pairings (DG-08, R1, P6)

### DES-§10.1 Today

34 pairings over the 27 shipped OFL fonts (15 Latin, 12 Arabic; `src/lib/theme/fonts.generated.ts:50`), about 3 per
archetype, picked uniformly per seed (`src/lib/theme/vibe.ts:579`). Two stores of one archetype share type one time in
three. No font is added in R1: the catalogue grows by **combination**, not by downloads.

### DES-§10.2 Validity rules (`src/lib/design/pairings.ts`, checked by `theme:check`)

| Id | Rule |
|---|---|
| F1 | Latin display = body family only when display weight − 400 ≥ 200, or the pairing has a mono accent |
| F2 | mono faces (`jetbrains-mono`, `ibm-plex-mono`) only as `accent` |
| F3 | a serif display takes a sans body (no serif / serif pairs) |
| F4 | Arabic display = Arabic body only when the weight gap ≥ 200 |
| F5 | Arabic body ∈ {ibm-plex-sans-arabic, noto-naskh-arabic, readex-pro, tajawal, noto-kufi-arabic, alexandria}; playful faces (marhey, baloo-bhaijaan-2, lemonada) are never body |
| F6 | display weights inside the face's `weightRange`; static faces only at a shipped weight (gloock, young-serif, instrument-serif: 400) |
| F7 | playful Arabic displays only in playground, hearth, bloom |
| F8 | italic emphasis (G26 italic, G25 italic-serif captions) only when the display or the accent ships italics (bodoni-moda, fraunces, instrument-serif) |
| F9 | `fontPreloads` returns ≤ 2 files (display + body of the page's script) for every pairing × locale (existing rule, now tested per pairing) |
| F10 | every Arabic face used as `displayAr` appears in ≥ 3 archetypes (playful ones ≥ 2); ≥ 60 unique (display, body, displayAr, bodyAr) tuples overall |
| F11 (rev 2, T4) | `reem-kufi` is never `displayAr` (it stays a label / accent face for souk and bloom at ≤ 20 px); the Arabic display roster is `alexandria`, `noto-kufi-arabic`, `changa`, `el-messiri`, `readex-pro`, `ibm-plex-sans-arabic`, `tajawal`, `noto-naskh-arabic` (≥ 8 candidates) plus the playful three under F7 |
| F12 (rev 2, T4, T5) | concentration: on the 140-plan sweep no `displayAr` face exceeds 30 % of `ar` pages per niche, no pairing exceeds 25 % within an archetype, no Latin display family exceeds 20 % platform-wide; the sampler's H33 enforces it against the niche shares at generation time |
| F13 (rev 2, T3) | an Arabic display face's `ascent − descent` metrics decide its display `line-height` (≥ 1.25) and `padding-block` (≥ 0.12 em) through `typeTokens`, never a fixed value; faces with tall marks (`el-messiri`, `noto-naskh-arabic`) get ≥ 1.32 |

### DES-§10.3 Catalogue additions (5 per archetype; the 34 existing pairings keep their ids and values)

Weights: Latin display / Arabic display. "Also fits" = archetypes that may borrow the pairing at prior weight 0.3.

| Archetype | id | display (w) | body | accent | displayAr (w) | bodyAr | also fits |
|---|---|---|---|---|---|---|---|
| maison | nocturne | bodoni-moda 400 | instrument-sans | | alexandria 300 | ibm-plex-sans-arabic | editorial |
| maison | gallery | gloock 400 | instrument-sans | ibm-plex-mono | el-messiri 600 | noto-naskh-arabic | editorial, bloom |
| maison | satin | fraunces 300 | hanken-grotesk | | alexandria 300 | ibm-plex-sans-arabic | bloom |
| maison | monolith | instrument-serif 400 | schibsted-grotesk | | readex-pro 400 | ibm-plex-sans-arabic | apothecary |
| maison | prive | bodoni-moda 500 | schibsted-grotesk | | el-messiri 500 | tajawal | |
| apothecary | clinic | schibsted-grotesk 600 | schibsted-grotesk | jetbrains-mono | ibm-plex-sans-arabic 700 | ibm-plex-sans-arabic | circuit |
| apothecary | ritual | instrument-serif 400 | figtree | | el-messiri 600 | readex-pro | bloom, field |
| apothecary | assay | dm-sans 600 | dm-sans | ibm-plex-mono | alexandria 600 | tajawal | circuit |
| apothecary | botanica | fraunces 400 | hanken-grotesk | jetbrains-mono | readex-pro 500 | ibm-plex-sans-arabic | field |
| apothecary | serum | bodoni-moda 400 | instrument-sans | ibm-plex-mono | alexandria 400 | ibm-plex-sans-arabic | maison |
| souk | majorelle | bricolage-grotesque 600 | figtree | reem-kufi (labels only) | noto-kufi-arabic 600 | tajawal | playground |
| souk | dar | young-serif 400 | dm-sans | | el-messiri 600 | readex-pro | hearth |
| souk | kasbah | archivo 700 | figtree | | changa 700 | tajawal | garage |
| souk | sahara | instrument-serif 400 | hanken-grotesk | | alexandria 500 | ibm-plex-sans-arabic | field |
| souk | agadir | fraunces 500 | instrument-sans | | readex-pro 600 | noto-naskh-arabic | |
| playground | pop | bricolage-grotesque 800 | figtree | | baloo-bhaijaan-2 700 | tajawal | |
| playground | jelly | young-serif 400 | dm-sans | | baloo-bhaijaan-2 600 | readex-pro | hearth |
| playground | block | archivo 800 | dm-sans | | lemonada 700 | tajawal | kinetic |
| playground | sprout | fraunces 700 | figtree | | marhey 700 | readex-pro | |
| playground | parade | big-shoulders-display 800 | figtree | | changa 700 | tajawal | kinetic |
| kinetic | sprint | archivo 900 | instrument-sans | jetbrains-mono | changa 800 | ibm-plex-sans-arabic | garage |
| kinetic | pulse | bricolage-grotesque 800 | hanken-grotesk | | noto-kufi-arabic 800 | readex-pro | |
| kinetic | lane | schibsted-grotesk 800 | schibsted-grotesk | ibm-plex-mono | alexandria 700 | tajawal | circuit |
| kinetic | drive | big-shoulders-display 900 | dm-sans | | noto-kufi-arabic 800 | ibm-plex-sans-arabic | garage |
| kinetic | arena | hanken-grotesk 800 | figtree | jetbrains-mono | changa 700 | readex-pro | |
| circuit | kernel | dm-sans 600 | dm-sans | jetbrains-mono | ibm-plex-sans-arabic 700 | ibm-plex-sans-arabic | apothecary |
| circuit | lumen | instrument-serif 400 | instrument-sans | jetbrains-mono | alexandria 500 | ibm-plex-sans-arabic | maison |
| circuit | array | archivo 700 | instrument-sans | ibm-plex-mono | noto-kufi-arabic 700 | readex-pro | garage |
| circuit | orbit | bricolage-grotesque 600 | hanken-grotesk | jetbrains-mono | readex-pro 600 | tajawal | |
| circuit | signal | schibsted-grotesk 700 | figtree | ibm-plex-mono | changa 600 | ibm-plex-sans-arabic | |
| hearth | terrace | fraunces 500 | dm-sans | | alexandria 600 | tajawal | field |
| hearth | loft | instrument-serif 400 | figtree | | el-messiri 600 | readex-pro | bloom |
| hearth | brunch | bricolage-grotesque 700 | figtree | | marhey 600 | tajawal | playground |
| hearth | ceramic | gloock 400 | hanken-grotesk | | alexandria 600 | ibm-plex-sans-arabic | |
| hearth | nest | young-serif 400 | instrument-sans | | baloo-bhaijaan-2 600 | readex-pro | playground |
| bloom | rosewater | bodoni-moda 400 | figtree | | el-messiri 500 | readex-pro | maison |
| bloom | peony | fraunces 400 | dm-sans | reem-kufi (labels only) | readex-pro 500 | ibm-plex-sans-arabic | |
| bloom | dew | instrument-serif 400 | instrument-sans | | alexandria 400 | tajawal | apothecary |
| bloom | blossom | young-serif 400 | hanken-grotesk | | lemonada 600 | tajawal | playground |
| bloom | silk | gloock 400 | figtree | | el-messiri 600 | noto-naskh-arabic | maison |
| field | meadow | instrument-serif 400 | dm-sans | | alexandria 500 | readex-pro | |
| field | terroir | gloock 400 | instrument-sans | ibm-plex-mono | el-messiri 600 | noto-naskh-arabic | souk |
| field | ridge | archivo 700 | figtree | | changa 700 | tajawal | garage |
| field | orchard | bricolage-grotesque 600 | hanken-grotesk | | el-messiri 600 | ibm-plex-sans-arabic | hearth |
| field | cedar | fraunces 600 | schibsted-grotesk | | noto-kufi-arabic 600 | readex-pro | |
| editorial | broadsheet | bodoni-moda 400 | instrument-sans | ibm-plex-mono | el-messiri 500 | noto-naskh-arabic | maison |
| editorial | column | fraunces 400 | schibsted-grotesk | | readex-pro 500 | ibm-plex-sans-arabic | |
| editorial | folio | gloock 400 | dm-sans | jetbrains-mono | noto-kufi-arabic 600 | tajawal | |
| editorial | index | schibsted-grotesk 800 | schibsted-grotesk | instrument-serif | alexandria 700 | ibm-plex-sans-arabic | circuit |
| editorial | runway | big-shoulders-display 800 | hanken-grotesk | | changa 700 | readex-pro | kinetic |
| garage | piston | archivo 900 | hanken-grotesk | jetbrains-mono | changa 800 | ibm-plex-sans-arabic | kinetic |
| garage | alloy | schibsted-grotesk 800 | dm-sans | ibm-plex-mono | noto-kufi-arabic 700 | readex-pro | circuit |
| garage | gauge | big-shoulders-display 800 | instrument-sans | jetbrains-mono | alexandria 700 | tajawal | |
| garage | carbon | hanken-grotesk 800 | hanken-grotesk | ibm-plex-mono | readex-pro 700 | tajawal | circuit |
| garage | rally | bricolage-grotesque 800 | archivo | | changa 700 | tajawal | kinetic |

Each new entry gets a one-sentence designer `note` (shown in the font picker and the DNA card), written with the
pairing. `index` uses Instrument Serif only as the italic emphasis accent inside a sans headline (F8). **Rev 2 (T4):**
the eight entries that used `reem-kufi` as `displayAr` in revision 1 now use `alexandria`, `readex-pro`,
`noto-kufi-arabic`, `changa` or `el-messiri`; the 34 existing pairings that carry `reem-kufi` as `displayAr` in
`src/lib/theme/archetypes.ts` keep their ids for old docs but are re-pointed in the catalogue to another display face
(a published doc keeps the fonts in its own `ThemeSpec.fonts`, so nothing live changes); `reem-kufi` remains available
as a small label face (`accent` role, ≤ 20 px) for souk and bloom.

### DES-§10.4 Roster growth (later, owner-gated)

Candidates from design-gen §6.5 (Cairo, Almarai, Vazirmatn, Kufam) are added only after a licence check (OFL), a
modernity review against DESIGN v3 §1 and a size check; a new face means a `@fontsource` devDependency and a
`scripts/sync-fonts.mjs` manifest line (maintainer CCR). Not in R1.

### DES-§10.5 The typography engine (rev 2; DS37; T1-T3, T6, T7, N7)

`typeTokens(pairing, look, locale): TypeTokens` (`src/lib/design/typography.ts`, pure) replaces the archetype's fixed
type ratio and the +6-10 % Arabic rule of thumb with values computed from the shipped font metrics
(`FONT_DATA[id].metrics`: `unitsPerEm`, `ascent`, `descent`, `lineGap`, `xWidthAvg`, `capHeight`, `xHeight`,
`src/lib/theme/fonts.generated.ts:19-29`). Every value lands in the existing `--lp-*` tokens; no runtime bytes.

| Concern | Rule | Token(s) |
|---|---|---|
| Fluid scale | `step(n) = clamp(min, fluid, max)` from G5: body 16 px (ar 17), ratio `rm` on mobile and `rd` on desktop, display `dmax` as the cap; the hero display is ≥ 44 px at 390 (T6: `step-5` min 44) and the display / body ratio ≥ 2.5 (V15) | `--lp-step--1 … --lp-step-6` |
| Arabic size harmonisation | the Arabic body is scaled so its main-body ink band matches the Latin x-height band: `sizeAr = sizeLat × (xHeightLat / upemLat) / (bodyBandAr / upemAr)`, where `bodyBandAr` = the Arabic face's measured x-height proxy (`xHeight` of the manifest when present, else `0.47 × upem`), clamped to 1.04-1.14 (the +6-10 % rule becomes a measured number per pairing) | `--lp-ar-scale` applied under `[lang=ar]` |
| Arabic weight compensation | `wAr = clamp(w + Δ, weightRange)` with `Δ = +50` for grotesk Latin displays, `+100` for Didone / hairline serifs (the Arabic display must not read lighter beside a high-contrast serif); bodies +0 | `--lp-display-weight-ar` |
| Tracking per size (Latin only) | `tracking(size) = −tk × log2(size / 16)` em, clamped −0.05 … 0 (G6.tk); 0 for Arabic always; +0.02 … +0.06 em only for Latin uppercase labels ≤ 13 px (G7) | `--lp-display-tracking`, `--lp-label-tracking` |
| Line-height per script | Latin display 1.02-1.10 (by `dmax`: 1.10 at 48, 1.02 at ≥ 120), Latin body 1.45-1.6; Arabic display ≥ 1.25 (F13: ≥ 1.32 for faces with tall marks), Arabic body ≥ 1.6 (T3); `padding-block` ≥ 0.12 em on Arabic display runs so marks never collide with the line above | `--lp-display-lh`, `--lp-body-lh`, `--lp-display-pad` |
| Headline breaking | h1 / h2 get `text-wrap: balance`; leads `text-wrap: pretty`; `max-inline-size` 10-14 ch on display (T6); Arabic particles bound to the next word with U+00A0 (DES-§4.5.4 `RichText`), so no line ends on `من في على إلى عن مع و`; the `--sh-word` cap (`SectionHeader.tsx:70-80`) keeps the longest word inside the column; 2-3 lines at 390 (the solver lowers `dmax` first, H28) | existing `--sh-word` + the two `text-wrap` rules |
| Reveals | whole lines, never `.lp-word` spans for Arabic; Latin word split only for display ≥ 48 px inside the reveal scope (T2, S19) | `data-reveal` scoping (G35) |
| Numerals | `font-variant-numeric: tabular-nums lining-nums` on `.lp-price*`, `.lp-count*`, `[data-num]`, phones and quantities (T1) in every face, serif included (Bodoni Moda's default figures are old-style); G8 `oldstyle` applies to running copy only | `--lp-num-copy` |
| Measure | body line length 45-75 ch at 1440 (V17) from `xWidthAvg` and the container (G3.w) | container / column tokens |
| Latin inside Arabic | `<bdi>` isolation (T7); phones, ids, ranges, prices with Latin units as `dir="ltr"` isolates (RTL1); Western digits by default for Morocco | markup |
| Underline / swoosh offset | `text-underline-offset` and the swoosh baseline computed from `descent / upem` so the stroke sits below the descender box of the actual face (T3 soft) | `--lp-em-offset` |

Acceptance (`theme:check` and `test:design`): for every pairing × locale the emitted tokens satisfy T1, T3, T6 and
V15; two pairings never share the same `(--lp-ar-scale, --lp-display-lh)` for different faces unless the metrics are
equal (N7); the baseline faults reproduce as failing fixtures (Bodoni old-style price, 36 px hero, Alexandria hamza
collision, "X Pulse" reversal, one-word Arabic lines) and pass after the engine.

---

## DES-§11 One brand across a store: registers, inherit and campaign (DG-11, R2, S2; R1 subset)

### DES-§11.1 Registers

| Register | Surfaces | Genes that apply | Genes frozen |
|---|---|---|---|
| **marketing** | landing pages, store home hero and editorial blocks, collection banners, campaign pages | every gene | none |
| **commerce** | collection grid, PDP info column, cart, checkout, COD form, order tracking (LP-05), search | brand type, colour core, ladder, button, numerals, depth | G2 ∈ {catalogue, split-tension}; motion ≤ 250 ms, one reveal kind (fade-rise), reveal scope `none` (G35); G16 = 0; accent area ≤ 0.08; G22 = start; no decor (ghost, ring, chips, aurora); CTA plan: one primary per screen (G34); openers `bare` or `number` only (G32) |
| **transactional** | thank-you page, e-mails (DG-14), WhatsApp previews, packing slips, legal pages | logo, colour core, type (with web-safe fallbacks), voice | single column, no motion (reveal scope `none`), no decoration, no glass, accent only on the one CTA and links; openers `bare` |

`compileRegister(brand: BrandGenome, register: Register, page?: PageGenes): Compiled` (`src/lib/design/registers.ts`):
marketing = `compileGenome` with the page genes; commerce and transactional = the brand genes with the frozen values.
The gates run with `register` set (DES-§8.1); V-items about frozen genes become hard in the commerce register
("A commerce-utility page never has glass, motion > 250 ms or accent area > 8 %", DG-11 acceptance).

### DES-§11.2 Brand Genome

```ts
// src/lib/design/brand.ts
export interface BrandGenome {
  v: 1; brand: BrandGenes;
  house: Pick<PageGenes, "G3" | "G16" | "G20" | "G21" | "G22">;   // the store's default page rhythm
  locks: BrandLocks; seed: number; logo?: { version: number } | null;
}
export interface BrandLocks { colors: ColorRole[]; pairing: boolean; genes: GeneKey[] }   // from the brand setting / store theme
export function brandFromSetting(s: BrandSetting, fallback: DesignGenome | null): Partial<BrandGenes>;     // R1: locks only
export function sampleBrand(input: BrandSampleInput): BrandGenome;                                         // R2: store generation
```

### DES-§11.3 Inherit and campaign (`pages.theme_mode`, 0006, LP-08)

| `theme_mode` | Brand genes | Page genes | Novelty |
|---|---|---|---|
| `store` (default for store pages and for landing pages created in a store-mode store) | the active store theme, resolved at render (DES-§11.5) | the store's `house` genes; sections still vary | own-page d_page ≥ 0.30 still applies |
| `campaign` | locked genes from the store theme; unlocked G9, G12, G15, G23, G26, G27 may vary | sampled per page | d_brand(page, store) ≤ 0.35; above it a soft item "This campaign drifts from your brand" with "Bring closer" (resample the drifting genes toward the store's values) |
| NULL (landing pages of landing-mode stores, every page from before R2) | the doc's own theme | the doc's own | as today |

### DES-§11.4 Store theme lifecycle (R2)

1. **Create**: store generation (DES-§14.4) or the brand page "Create a store theme" writes version 1 as `draft`.
2. **Edit**: brand page changes (colours, type, gene locks, logo) write a new `draft` version (the previous active
   version keeps rendering).
3. **Preview**: every draft renders the store home, one PDP and one landing page at 390 / 1440 in a sandboxed preview
   (`/app/<h>/preview/theme/<version>`, core SE-05), with the gates of every register.
4. **Activate**: the transaction of DES-§2.3, a `theme` genome row (`kind = brand`, novelty context `theme`), then
   `enqueueRenders(scope, livePagesWith(theme_mode ∈ {store, campaign}), "brand", 5)` (core §H.3). Audit
   `store.theme.activated`.
5. **Roll back**: activate an archived version (same path).

### DES-§11.5 Render-time theme resolution (request DES-R4)

D50 re-renders a page from its published doc with the store context of now. For `theme_mode` store or campaign pages
the renderer must take the brand part from the active store theme, not from the doc:

```ts
// src/lib/design/effective.ts (S2): called by the render context builder (core T3 file, CCR DES-R4)
export function effectiveTheme(doc: PageDoc, mode: "store" | "campaign" | null, active: { spec: ThemeSpec; locks: BrandLocks } | null): ThemeSpec;
```

`store`: palette, fonts, archetype and the brand fields of `look` come from `active.spec`; page fields of `look` from
the doc. `campaign`: only locked roles and genes are replaced. `null` or no active theme: `doc.theme` unchanged. The
doc, its checksum and `runtime_v` never change (core D50).

### DES-§11.6 R1 behaviour (landing-only stores, no `store_themes`)

- New generations read `brand` locks (accent / pop / neutral / base, pairing, gene locks, voice register) as fixed
  genes.
- Existing pages keep their own theme. A logo or store-name change re-renders live pages (header logo, favicon,
  OG) through `render_jobs` reason `brand` (request DES-R4 part B: the reason exists; R1 enqueues it for identity
  changes only).
- "Apply my brand to this page" in the builder (Theme panel) rewrites the page draft's colours / fonts / locked genes
  from the brand setting (a normal draft edit, published by the owner).

### DES-§11.7 Motion signature editor (DG-19, later)

A per-brand easing editor (bezier handles within the no-overshoot rule, durations 180-900) shown only when the owner
asks; out of scope until scheduled.

---

## DES-§12 Brand kit (BK-1 R1 basic; R2 full with S2)

### DES-§12.1 Route, permissions, files

`/app/<h>/brand` (core §I.1 row; request DES-R2 gives it to P6 in R1 and to S2 in R2). Reading needs `pages.read`;
every write needs `brand.write`. Actions in `src/app/app/[store]/brand/actions.ts` through `storeAction("brand.write",
…)` (core §E.2); the media upload goes through the core upload endpoint (`/api/app/<h>/media`, core §G.4) and the
action then binds the asset id.

### DES-§12.2 Screens (R1)

Layout: page header "Brand" + a one-line explanation ("Every new page and design uses these choices."), a left tab
rail (Logo · Colours · Type · Voice; R2 adds Logo designer · History · Exports), a live **specimen** on the right (the
store name in the display face in Latin and Arabic, a button, a price, a card, the colour swatches on light and dark
grounds) that updates instantly. At 390 px the tabs become a segmented control and the specimen moves above the form.

| Tab | Content | Empty state | Set state |
|---|---|---|---|
| Logo | drop zone (PNG, WebP, JPEG, AVIF; ≤ 8 MB; ≥ 256 px on the short side); optional square mark and inverse version; previews on a light ground, a dark ground, a 32 px favicon, a WhatsApp avatar circle | the grid monogram preview (DS32) with "No logo yet. We show this monogram until you add one." and, in R2, "Design a logo" | the three previews; a warning when the logo has < 3:1 contrast on one of the grounds ("Add a light version for dark backgrounds") |
| Colours | accent, pop, neutral tint, base (light / tinted / dark); OKLCH picker (lightness, chroma, hue sliders + hex field); "From your logo" swatches; "From your product photos" swatches (last 3 products); a lock per role | "No brand colours. Each design picks colours from your product photos." | swatches with lock toggles; the moved-colour note (DES-§12.4) |
| Type | pairing cards filtered to the store's top vibes first (the specimen renders each card in its real faces); lock | "Each design picks a type pairing that suits the product." | the chosen card pinned on top with a lock |
| Voice | the five registers as cards with one example line each (ar / fr / en, DES-§20.4); Darija ratio (none / CTA only / light); a link "Words to use and avoid" to Settings → AI → Brand voice (ai.md AI-06). **Rev 2 (DS45):** the tab is a view over `store_ai.voice` / `store_ai.darijaRatio` and writes through ai.md's action; the brand setting stores no voice | "Each design picks the voice that suits the product." | the chosen card |

Every change saves on blur (optimistic, Undo toast for 10 s, core §I.4 conventions); errors map to the limit sheet or
an inline message, never a raw error.

### DES-§12.3 Locks and how generation uses them

Locks are the owner's statement "keep this". A locked colour role, pairing or gene is a fixed value in
`sampleGenome` (DES-§4.4) and in remix, studio sliders and Director hints (a hint on a locked gene is dropped). The
no-orange repair moves unlocked roles first (pop, neutral) and a locked accent never (GEN-07); a lock that cannot be
honoured because the colour is orange never happens, because the stored colour was already moved (DES-§12.4).

### DES-§12.4 No-orange brand colours (DS17, core D37)

```ts
// src/lib/theme/brand-color.ts (P6)
export interface AllowedColor { hex: Hex; moved: boolean; side: "low" | "high" | "muted" | null; deltaE: number }
export function nearestAllowed(hex: Hex): AllowedColor;
```

`nearestAllowed` returns the input unchanged when `!nearOrange(toOklch(hex))` (the guard band with margin,
`src/lib/theme/color.ts:262-267`); otherwise the candidate of {`noOrange(hex, "low")`, `noOrange(hex, "high")`, the
muted version (same L and h, chroma 0.056 / 0.05 / 0.042, or 0.038 / 0.032 / 0.025 for L ≥ 0.8)} with the smallest
OKLab ΔE to the input; ties go to muted. The picker shows the request and the result side by side for 6 s with the note
"Orange isn't used on Store Gen pages, so we picked the closest allowed colour." and stores a `ColorMove`. The hue
slider shows the forbidden band as a hatched, non-selectable range (25-75° at chroma > 0.06). The extracted logo
palette goes through the same function; **the logo file itself is never recoloured**. `allowSellerBrandOrange = true`
(platform setting) is not implemented in R1 or R2: the setting is read and, if true, the brand page shows "Not
available yet"; enabling it needs an owner decision on RESEARCH §6.3 Q4 and a CCR, because the theme engine refuses
orange for every spec.

### DES-§12.5 Logo upload details

- Accepted through the media pipeline (raster only; no SVG uploads in R1 or R2: an uploaded SVG can carry script).
- On bind: `extractPalette` (existing) on a 96 × 96 downscale → `colors.fromLogo` (≤ 6, through `nearestAllowed`);
  the alpha mask's luminance gives the light/dark ground contrast warning.
- Favicon: the `mark` asset when present, else the primary logo when its aspect is ≤ 1.6:1, else the grid monogram
  (DS32). Header: the primary logo, height from the header variant tokens.
- Changing or removing the logo enqueues the identity re-render (DES-§11.6) and writes `asset_refs` (`owner_kind
  'brand'`).

### DES-§12.6 Grid monogram for R1 (DS32; `src/lib/logo/monogram-grid.ts`, P6)

A 24-unit square grid; letters A-Z and digits 0-9 as stroke skeletons (lines, quarter and half arcs, defined in grid
units), one stroke width per vibe (2.5 units for maison / editorial / bloom, 3 for apothecary / field / souk / hearth,
3.5 for kinetic / circuit / garage / playground), round or butt caps from G27 (pill → round). Enclosures: none,
circle (r = 11), rounded square (r = 6), arch (modern Moroccan, souk and bloom only). Up to 2 letters: the first two
initials of the store name's Latin words (or one initial). An Arabic-only name renders the brand glyph (G25: dot,
spark or diamond) inside the enclosure. Output: an SVG with `<path>` elements only (stroked), colours from the theme
tokens (`lp-accent` ground, `lp-accent-ink` mark), no `<text>`. Optical centring: the visual centroid of the letter ink
within 2 % of the enclosure centre (computed from the skeleton). `brandIcon(ctx, theme)` replaces `faviconHref` in
`src/landing/document.tsx` (request DES-R11).

---

## DES-§13 Logo designer (DG-10 R2 S2 · DG-17, DG-18 R3 D4 · DG-19 later)

### DES-§13.1 What it makes (a logo system, not one picture)

Primary horizontal lockup, stacked lockup, wordmark, mark (monogram, Arabic initial or symbol), each in colour, mono
(ink) and inverse; clear space = the cap height of the wordmark on every side; minimum sizes (wordmark 72 px wide on
screen, mark 16 px); the exports of DES-§13.14. Never live text: every glyph is an outline. Never badges, seals, stamps,
rotating-text rings, ribbons, banners, distressed or hand-drawn marks (owner rule, R-D40). Gradients appear only in the
optional app-icon ground, never in the mark. **Rev 2:** the core accepted the packages (DES-R6: `harfbuzzjs`,
`clipper-lib`, pinned after the S2 spike), the build step and tests (DES-R7: `scripts/build-logo-fonts.mjs` in
`prebuild` / `predev`, `test:logo`) and the PNG path (DES-R14: `keepPng`), all R2 (core §K.4, §Q.6); the R1 grid
monogram (DES-§12.6) is the only logo code that ships in R1. The designer's quality bar is the same as the pages': one
idea per mark (the single craft move), measured legibility (the small-size test), balanced bilingual weight (not
x-height matching), and never a device from the banned list; the Director (R3, DG-18) proposes parameters only.

### DES-§13.2 Module layout (`src/lib/logo/**`, isomorphic unless marked)

| File | Role |
|---|---|
| `fonts.ts` | loads SFNT bytes of a font subset (browser: `fetch("/logo-fonts/<file>")`, Node: `DATA` read from `public/logo-fonts`), caches `hb` faces per id/subset/weight |
| `shape.ts` | harfbuzzjs wrapper: segmentation, shaping, glyph outlines (DES-§13.4) |
| `path.ts` | path parse / transform / flatten, bbox, signed area, centroid, contour classes, ink profiles |
| `spacing.ts` | optical spacing (DES-§13.6) |
| `moves/*.ts` | the seven craft moves (DES-§13.7) |
| `bool.ts` | Clipper-based union / difference / offset (cut moves, stroke to fill), loaded lazily (DS19) |
| `monogram.ts`, `monogram-grid.ts` | monograms on the construction grid (DES-§13.8); the grid set also ships in R1 (DS32) |
| `enclosure.ts`, `lockup.ts`, `bilingual.ts`, `symbol.ts` | DES-§13.8, §13.9 (bilingual balance and symbols are R3) |
| `color.ts`, `smallsize.ts`, `score.ts` | DES-§13.10, §13.11, §13.13 |
| `params.ts` | `LogoParams`, `LogoSystem` Zod schemas (DES-§13.12) |
| `svg.ts` | the only serialiser: `<svg>`, `<g>`, `<path>` with `d`, `fill`, `fill-rule`, `transform`; numbers at 2 decimals |
| `render.server.ts` | Node: params → SVG → PNG through `sharp` (DS20), server-only |
| `candidates.ts` | candidate generation, families, mutation ("more like this") |
| `favicon.ts` | `brandIcon(ctx, theme)` for the landing document (R1 grid monogram; R2 the designer mark) |
| `selftest.ts` | `npm run test:logo` (DES-§25) |

### DES-§13.3 Shaping fonts: WOFF2 → SFNT at build time (request DES-R7)

`scripts/build-logo-fonts.mjs` (S2, runs in `prebuild` / `predev` after `build-landing-assets.mjs`):
1. For each font of the manifest and each shipped subset (`latin`, `latin-ext`, `arabic`), read
   `public/fonts/<id>/<file>.woff2` with the WOFF2 table reader already in `scripts/sync-fonts.mjs:71-115`
   (Brotli via `node:zlib`).
2. Reconstruct the transformed tables per the W3C WOFF2 spec: `glyf` / `loca` transform version 0 (§5.1-5.3), `hmtx`
   transform (§5.4) when present; copy the other tables.
3. Write an SFNT (offset table, sorted table directory, 4-byte padding, table checksums, `head.checkSumAdjustment`) to
   `public/logo-fonts/<id>-<subset>-<axis|weight>.ttf` and a manifest `public/logo-fonts/manifest.json` (`{ file, id,
   subset, bytes, sha256, unicodeRange }`); outputs are git-ignored and deterministic.
4. Self-check: every output opens in harfbuzzjs and shapes "Hamburgefonstiv" (Latin) or "متجر الأمل" (Arabic
   subsets) to non-empty glyphs; failure fails the build step with the file name.

The browser fetches only the subsets a session needs (typically 2 files, ≈ 100-300 KB uncompressed, served
`immutable`); the landing pages never load them. Variable fonts are instanced by HarfBuzz at shaping time
(`setVariations`), so one file per subset serves every weight. **[verify]** harfbuzzjs's `setVariations` +
`glyphToPath` instance behaviour and the WASM size in the S2 spike (RESEARCH §6.2).

### DES-§13.4 Shaping (`shape.ts`)

```ts
export interface ShapeRequest { text: string; font: string /* KnownFontId */; weight: number; sizePx: number; features?: string[] }
export interface ShapedGlyph { gid: number; cluster: number; ax: number; dx: number; dy: number; path: Path; joinsNext: boolean }
export interface ShapedRun { script: "arabic" | "latin"; dir: "rtl" | "ltr"; glyphs: ShapedGlyph[]; advance: number; upem: number; metrics: { xHeight: number; capHeight: number; ascent: number; descent: number } }
export function shapeText(req: ShapeRequest): Promise<ShapedRun[]>;   // ≤ 5 ms per 20-character run after warm-up
```

- Segment runs by script (Arabic: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; Latin otherwise);
  digits follow the surrounding run. Each run picks the subset file whose `unicodeRange` covers it.
- Features: HarfBuzz defaults (`kern`, `liga`, `calt`; Arabic `init`, `medi`, `fina`, `isol`, `rlig`) plus none
  added by default; `liga` off for monogram letters.
- `joinsNext` = the glyph connects to the next one (Arabic joining from the shaped output: no gap and the cursive
  attachment); spacing never opens a joined pair (DES-§13.6).
- Outlines from `glyphToPath` are converted to a y-down path at `sizePx` and kept in font units for geometry.
- Names are limited to 32 characters per script, letters, digits, spaces, `&`, `-`, `'` and the Arabic letters; other
  characters are refused by the input schema.

### DES-§13.5 Geometry (`path.ts`)

Flattening with adaptive subdivision (tolerance 0.5 font units), signed area (shoelace) for contour classes (outer =
the winding of the glyph's largest contour, inner = opposite), bbox, ink centroid (area-weighted), and **ink profiles**:
for a glyph and N horizontal sample lines, the leftmost and rightmost ink x on each line (from the flattened contours).

### DES-§13.6 Optical spacing (`spacing.ts`)

For each adjacent pair of separately drawn units (Latin letters; in Arabic only across a non-joining boundary: after
ا د ذ ر ز و ؤ ة or a space):
1. Sample N = 24 lines between baseline and x-height (both lowercase), cap height (both capitals) or the band of the
   lower of the two.
2. `gap(y) = (advance of the left glyph − its rightmost ink at y) + (leftmost ink of the right glyph at y)`, clamped to
   0.25 em (open shapes like "L|T" must not dominate).
3. `area = mean(gap)`; the target is the same measure for "n|n" (lowercase), "H|H" (capitals) or, in Arabic, "ب|ا"
   in that font and weight.
4. Correction = target − area, clamped to ±0.06 em (Latin) and ±0.03 em (Arabic); then the wordmark tracking of G6
   (Latin only, 0 for Arabic).
5. Kerning from the font (GPOS) is applied first; the optical pass adjusts on top.

### DES-§13.7 Craft moves (exactly one per wordmark)

| Move | Geometry tier | Eligible when | Parameters | Fits (vibes) |
|---|---|---|---|---|
| tittle swap | contour | an `i` / `j` dot, or an Arabic letter whose dots are separate small contours (area < 3 % of the glyph box, above x-height or below baseline) | `shape`: circle, diamond, arch (from G25 glyph), size 0.9-1.15 × the original dot area | bloom, playground, souk |
| weight shift | contour | variable display face | one glyph (first letter or a chosen index) ± 100-200 on `wght`, re-shaped with the same advance | apothecary, field, editorial |
| baseline shift | contour | always (fallback move) | one glyph raised or lowered by 2-4 % em | editorial, kinetic |
| counter accent | contour | an inner contour with area ≥ 18 % of its glyph box | that counter filled with the accent colour as its own path | playground, hearth |
| ligature join | contour | two adjacent Latin letters with crossbars or stems within 0.08 em (t-t, f-i, f-f, s-t, r-n) | a bridge rectangle at the crossbar height; overlapping fills render as one shape (non-zero rule) | maison, editorial |
| stem cut | cut (Clipper) | a vertical stem ≥ 0.6 × cap height | a notch at 30° or 0°, width 0.04-0.07 em, through one stem | circuit, kinetic, editorial |
| terminal trim | cut (Clipper) | a terminal (an end of an open stroke: c, e, r, s, t, a) | the terminal cut flat or at the symbol angle | garage, circuit |

Choice: eligible moves × the vibe weights (fits = 1.0, other = 0.3), seeded; the move is recorded in the params. A
candidate without any eligible non-fallback move uses the baseline shift. Arabic wordmarks: tittle swap (dots), weight
shift, baseline shift (whole word only, never inside a joined cluster); never a cut through a joining stroke; no kashida
stretching beyond one use (and only as an explicit parameter).

### DES-§13.8 Monograms and enclosures

- **Latin monogram (R2):** one or two letters from the display face outlines, or the grid skeleton set (DES-§12.6)
  converted to fills with a Clipper offset; two letters as `shared-stem`, `stacked` or `interlock` (over/under by a
  Clipper difference, a cut move, so it waits for `bool.ts`). Placed on the 24-unit grid with the circle grid (radii 6,
  9, 12); stroke width 2.5-4 units, one corner radius.
- **Arabic initial (R2):** the first letter of the Arabic name shaped in its isolated form, scaled so its ink band
  matches 60 % of the enclosure height, optically centred (ink centroid within 2 % of the centre).
- **Enclosures:** none, circle, rounded square (r = 0.25 side), arch (souk, bloom), squircle (n = 4 superellipse,
  64-point polyline fitted to cubic curves; DG-19 for media masks, allowed here for the mark only).
- Scored on optical centring and stroke consistency (stroke width variance < 8 %).

### DES-§13.9 Lockups and bilingual balance

- **R2 lockups:** horizontal (mark + wordmark, gap = 0.5 × cap height, mark height = 1.25 × cap height), stacked (mark
  above, centred), wordmark only, mark only; **basic bilingual stacked** (primary script on top, the other at 62 % of
  its size, both outlined), the order from "Arabic first / Latin first" (default: the store's default locale).
- **DG-17 (R3) balanced bilingual:** side-by-side with a hairline divider (Arabic on the right in `ar` contexts, Latin
  first in fr/en), stacked, or symbol-centred. Balance is measured, not guessed: ink-weight ratio (filled area / ink
  bbox area of each script) within 0.92-1.08 after a weight adjustment of the variable face, and perceived height
  ratio (Latin: x-height ink band; Arabic: 10th-90th percentile of the main-body ink, dots excluded) within 0.9-1.1
  after scaling Arabic by 110-125 % (starting range, tuned per pairing on the golden sheet). Never mirrored Latin as
  fake Arabic, never forced x-height matching.
- **DG-17 symbol grammar (R3):** symbols on a 2 × 2 or 3 × 3 module grid from ≤ 4 primitives (circle, half-disc,
  quarter-disc, square, arch, triangle, rounded bar), rotational symmetry of order 1, 2, 4 or 8, positive / negative
  space; souk may add an {8/3} star polygon as thin modern strokes at low weight (DESIGN.md §7 spirit). Scored on
  simplicity, small-size legibility and distinctness.

### DES-§13.10 Colour

Ink and accent from the Brand Genome (the store theme or the brand setting); mono (ink only) and inverse always
generated; contrast ≥ 3:1 for the mark on its ground (graphical object) and ≥ 4.5:1 for a tagline; every colour through
`uiColor` / `nearestAllowed` (no orange). The counter-accent move uses the accent only when it keeps 3:1 against the
ground; otherwise the move is not eligible.

### DES-§13.11 Small-size test (`smallsize.ts`)

Rasterise the mark at 16, 32 and 256 px (browser: `OffscreenCanvas` + `Path2D`; Node: `sharp`). Pass when: foreground
coverage at 32 px is 20-60 %; the thinnest feature at 32 px is ≥ 1.5 px (estimated as 2 × ink area / ink perimeter of
the flattened outline at that scale); the 64-bit difference hash of the 32 px render and of the 256 px render
downscaled to 32 px differ in ≤ 10 bits (starting value, tuned on the golden sheet). A mark that fails gets a simplified
favicon variant (the monogram or initial alone, no enclosure detail), and the wordmark is never used as a favicon.

### DES-§13.12 Parameters (`params.ts`, stored in `store_themes.logo`)

```ts
export const LogoParams = z.object({
  v: z.literal(1), seed: z.number().int().min(0),
  names: z.object({ latin: z.string().max(32).nullable(), arabic: z.string().max(32).nullable(), order: z.enum(["ar-first", "latin-first"]) }),
  tagline: z.object({ text: z.string().max(32), script: z.enum(["latin", "arabic"]) }).nullable(),
  font: z.object({ latin: FontId.nullable(), arabic: FontId.nullable(), weight: z.number().int().min(100).max(900), weightAr: z.number().int().min(100).max(900) }),
  spacing: z.number().int().min(-2).max(2),                              // optical tracking steps (± 0.01 em each, Latin)
  move: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("tittle"), index: z.number().int().min(0), shape: z.enum(["circle", "diamond", "arch"]), size: z.number().min(0.9).max(1.15) }),
    z.object({ kind: z.literal("weight"), index: z.number().int().min(0), delta: z.number().int().min(-200).max(200) }),
    z.object({ kind: z.literal("baseline"), index: z.number().int().min(-1), shift: z.number().min(-0.04).max(0.04) }),   // -1 = whole word
    z.object({ kind: z.literal("counter"), index: z.number().int().min(0), contour: z.number().int().min(0) }),
    z.object({ kind: z.literal("ligature"), index: z.number().int().min(0) }),
    z.object({ kind: z.literal("stem-cut"), index: z.number().int().min(0), angle: z.union([z.literal(0), z.literal(30)]), width: z.number().min(0.04).max(0.07) }),
    z.object({ kind: z.literal("terminal"), index: z.number().int().min(0), angle: z.number().min(0).max(45) }),
  ]),
  mark: z.object({ kind: z.enum(["monogram", "initial-ar", "glyph", "symbol"]), letters: z.string().max(2).nullable(),
                   construction: z.enum(["single", "shared-stem", "stacked", "interlock"]).nullable(),
                   enclosure: z.enum(["none", "circle", "rounded", "arch", "squircle"]), symbol: SymbolParams.nullable() }),
  lockup: z.object({ kind: z.enum(["horizontal", "stacked", "wordmark", "mark", "bilingual-stacked", "bilingual-side"]), ratioAr: z.number().min(1.0).max(1.3) }),
  colors: z.object({ ink: Hex, accent: Hex, ground: Hex, groundDark: Hex }),
});
export interface LogoSystem { params: LogoParams; exports: Partial<Record<LogoExportName, string /* asset id */>>; renderedAt: string; engineV: number }
```

The parameters fully determine the output: the same params and `engineV` give byte-identical SVG in the browser and in
Node (golden test). `engineV` bumps when the engine changes output; stored systems re-export lazily on the next view.

### DES-§13.13 Candidates, scoring, interaction

- **Generation:** 12 candidates in 3 families of 4: **wordmark-led** (wordmark with its craft move), **monogram-led**
  (mark + wordmark horizontal), **mark-led** (enclosed initial or monogram above the wordmark; R3 adds symbol-led).
  Fonts: the brand pairing's display faces plus 2 alternates of the same type class (DES-§7.7) from the catalogue;
  weights from G6 ± 1 step; moves and enclosures by the vibe tables; seeded from `brandSeed`.
- **Score:** `S = 0.30 · legibility (small-size pass, coverage) + 0.25 · balance (centroid, ink evenness, bilingual
  ratios) + 0.20 · distinctness (parameter distance to the other candidates) + 0.15 · vibe fit (move and enclosure
  weights) + 0.10 · simplicity (≤ 24 subpaths, ≤ 600 nodes)`. The top 2 per family are shown (6).
- **More like this:** mutate 1-2 parameters of the chosen candidate (font within class, weight ± 1, move parameters,
  enclosure) → 6 new candidates, the chosen one pinned first.
- **Locks:** font, colour, move, enclosure, lockup; **sliders:** weight (± 2 steps), spacing (−2…+2), mark size
  (0.8-1.2), Arabic size ratio (DG-17, R3).
- **Timing:** 12 candidates ≤ 600 ms in the browser on a mid laptop after the WASM and fonts are warm; the WASM and
  font files load when the Designer tab opens (never in the dashboard shell bundle, never in landing pages).

### DES-§13.14 Exports

| Name | Format and size | Built from | Stored |
|---|---|---|---|
| `primary`, `stacked`, `wordmark`, `mark` × `color`, `mono`, `inverse` | SVG, tight `viewBox` + clear space | params, on demand | not stored (route `/api/app/<h>/brand/logo/<name>.svg`, `brand.write` or `pages.read`) |
| `primary-png` | PNG height 64 and 128 (1× / 2×) | `render.server.ts` | asset (e-mails, DG-14) |
| `favicon` | SVG (mark, path-only) + PNG 32 and 48 | params | SVG inline in the store context; PNGs as assets |
| `apple-touch` | PNG 180, opaque ground, mark at 70 % | params | asset |
| `icon-192`, `icon-512` | PNG maskable (mark inside the inner 80 % circle) | params | asset |
| `avatar` | PNG 400 (mark inside the inner 70 % circle) | params | asset (WhatsApp, social) |
| `og` | PNG 1200 × 630 (ground + primary lockup; no claims, no product) | params | asset (store home OG when no page OG image exists) |

PNG assets are kept as PNG (request DES-R14: a `keepPng` path in the media pipeline for brand exports ≤ 1200 × 630 and
≤ 300 KB, no WebP/AVIF variants, so iOS and e-mail clients can use them). Each export is an `asset_refs` row with
`owner_kind = 'store_theme'`. Inline SVG in published HTML is produced only by `svg.ts` from parameters (numbers and
fixed element names; nothing user-supplied reaches the markup).

### DES-§13.15 Designer screen (`/app/<h>/brand`, tab "Logo designer", R2)

- **Inputs** (left): Latin name, Arabic name (both prefilled from the store name; either may be empty), "Arabic first
  / Latin first", optional tagline, a style row with the brand vibe chip.
- **Grid** (centre): 6 candidate cards on the store's ground, each with its family label; skeleton cards for the first
  300 ms; "More like this" on hover / long-press.
- **Detail** (right or a sheet on mobile): live previews: storefront header at 1440 and 390 px, a browser tab with the
  16 / 32 px favicon, a WhatsApp chat avatar, a shipping label (mono, 50 mm wide), the OG card; locks and sliders;
  "Use this logo".
- **Use this logo:** writes a draft store theme version with `logo` (R2 store mode) or, in landing mode, renders the
  exports, sets `brand.logo.primary` / `mark` to the PNG exports and `source = "designer"`; identity re-render
  (DES-§11.6).
- **Notice:** "We can't check trademarks. Make sure the name and the logo are yours to use." (DES-§20.1).
- **Upload path stays:** an uploaded logo always wins; the designer then offers only lockups around it in R3 (never
  redraws it).

### DES-§13.16 LLM concept parameters (DG-18, R3, D4 + ai.md `logo.concepts`)

`LogoConceptParams` = a subset of `LogoParams` (font ids from the catalogue, move kind, mark kind, enclosure, lockup,
a short rationale ≤ 140 chars). The model returns 3-6 concepts (ai.md AI-§D.3: parameters only, never SVG); each is
validated by the Zod schema, rendered by the engine, small-size tested and scored like any candidate. Raw model text
never reaches storage except the rationale (guarded).

### DES-§13.17 Later (DG-19)

Squircle media masks (CSS `corner-shape` as enhancement **[unverified support]**, SVG mask fallback) · an optional
vector-AI symbol provider (opt-in per store, cleaned by path simplification, grid snapping and the small-size test,
wordmarks stay procedural) · a brand guidelines export (HTML/PDF: logo system, clear space, colours, type, voice) · the
motion signature editor (DES-§11.7). Each gets its own acceptance when scheduled.

### DES-§13.18 Golden sets

`src/lib/logo/goldens/names.ts`: 30 generic Moroccan-style name pairs (for example "Dar Argan / دار أركان", "Nour /
نور", "Atlas Home / أطلس هوم", "Zitouna / زيتونة", "Yasmine / ياسمين", "Lalla Beauty / لالة بيوتي", "Sahara Fit / صحراء
فيت", "Mimosa / ميموزا", "Oud Majlis / عود مجلس", "Riad Kids / رياض كيدز"), chosen to cover joining and non-joining
letters, dots above and below, lam-alef, digits and short and long names. `goldens/shape.json` holds the shaped glyph-id
sequences per font, generated by the first run and **reviewed by an Arabic-reading designer** before it is committed;
later runs must match byte for byte. `goldens/svg/*.svg` holds the expected SVG of 12 fixed parameter sets.

---

## DES-§14 Generation flows

### DES-§14.1 What every direction carries (GN-1, R1)

`DirectionView = { genome: DesignGenome; chips: GenomeChip[]; why; novelty: NoveltyBands | null; report: GateSummary;
q: number; hinted: boolean }`, rendered in the wizard, the onboarding reveal, the builder Theme panel and (R2) the
studio. Novelty is shown as words (DS27): "Distinct across the platform", "Distinct in your niche", "Different from
your other pages" (or "Close to …" for `close`, never shown for `too_close` because such a candidate is replaced).

### DES-§14.2 Landing page generation (R1, wizard and onboarding)

Inputs already in the wizard (`src/components/generate/wizard.tsx`) plus three new props from the page: the store's
`brandSeed` (from `stores.brand_seed`, core §D.4), the `brand` setting and `niche` (DES-§7.3).

| Step | Where | What | Budget |
|---|---|---|---|
| 1 | browser | `inputHash = sha256(sorted asset ids, product name, category, locale)` (WebCrypto) | < 5 ms |
| 2 | browser | `pickArchetypes` (existing) → 3 vibes (forced archetypes lead); R3: direction 3 = exploration cell (DES-§7.7) | < 5 ms |
| 3 | browser | per direction i, attempts 0-3: `sampleGenome` → `compileGenome` → `expandChoreography` + the rhythm planners (DES-§5.5 step 3: photos, CTAs, openers, reveals, fold) → `planSections` with the directives (no copy) → `estimateHeights` (I2, I8, fold) → `distanceView`; skip an attempt whose pairwise distance to an earlier direction's chosen candidate is < 0.25 or whose estimates breach a core budget threshold (`budget-limits.ts`) | ≤ 150 ms for 12 candidates |
| 4 | server | `checkNoveltyAction({ candidates ≤ 12, niche })` (DES-§7.4) → bands (+ `nicheSharesAction` for H33, cached per wizard session) | one round trip, ≤ 25 ms server time |
| 5 | browser | per direction keep the first candidate with every band `ok`, else the one with the best worst band **that is not `too_close`** (a `too_close` candidate is never shown, DS6; when all four attempts are `too_close` the direction re-samples its bold genes once more with `explore` weights); then full docs via `buildDirection` with the genome (copy library + AI copy merge, existing) | ≤ 600 ms for 3 docs |
| 6 | browser | `repairDoc` (3 rounds) per doc, then the budget estimates again | ≤ 30 ms per doc |
| 7 | server | `checkHeadlineNovelty` (through `checkHeadlinesAction`) for the generated titles and leads of the 3 docs (≤ 60 lines) → resample `close` lines from the library, re-run the copy gates | one round trip |
| 8 | browser | present (DES-§14.3); AI copy streaming (ai.md AI-02) overlays fields as they arrive and re-runs the copy gates per field | |
| 9 | server | `recordCandidatesAction` (in `after()`) writes the 3 directions as `generated` rows | async |
| 10 | server | "Use this direction" → `createFromDirectionsAction` (moved to `src/app/app/[store]/generate/actions.ts`, core §I.1): validates the docs (today's checks), writes the page and the generation versions, writes the `chosen` genome row from `genomeOf(doc)` on the server plus the client's copy-gene tags (validated against `GENE_VOCAB`) | existing |

The whole path from "Generate" to the directions is ≤ 2.5 s with library copy on a 4× CPU-throttled desktop run
(UX-01 acceptance) and ≤ 1.5 s p75 on a mid-range Android over 4G for the wow demo's 0:50 reveal (rethink-features §4,
**[measure]** in `qa:wow-demo`). Failures degrade, never block: a failed or slow (> 3 s) novelty call shows the
directions without the novelty words and a quiet line "Uniqueness check unavailable right now"; the publish check still
runs. The three directions of one run must be pairwise d ≥ 0.25 (hard, by construction in step 3) and target a median
≥ 0.35 (DS25). Nothing in steps 1-9 downloads a model or waits for Cloud AI (core D59): the category comes from the
owner's tap, the palette from the photos in the browser, the copy from the library; SigLIP and the VLM refine after the
reveal.

### DES-§14.3 The onboarding reveal (UX-01, R1; flow owned by platform.md PD4 at `/app/<h>/welcome`)

- **Composition:** a deep neutral stage (admin token `--surface-stage`, DES-§16.2) with the chosen direction full-bleed
  in a device frame (desktop: a 1440 frame at ~70 % width plus a phone frame overlapping its lower inline-end corner by
  12 %; mobile: the phone preview at full height); the two alternates as smaller cards beside it (desktop) or behind a
  horizontal swipe (mobile, with dots that carry state: the current card); under the main preview the four DNA chips,
  the why line and the three novelty words; actions "Use this design" (primary) and "See the other directions"
  (secondary).
- **Motion:** the main preview scales 0.96 → 1 with opacity 0 → 1 over 420 ms (quint-out), the alternates follow with an
  80 ms stagger; chips fade in last (180 ms). No confetti, no glow sweep, no parallax. Reduced motion: a 180 ms
  crossfade only.
- **States:** analysing (skeleton of the exact final layout after 150 ms, kept ≥ 300 ms; a progress line names the real
  step: "Reading your photos", "Choosing type", "Checking it's unique"); revealed; error (one sentence + "Try again";
  the library fallback always produces directions).
- **Honesty:** prices are the ones the owner typed (PD23); no stock, ratings or reviews appear in previews; sample
  proof sections are absent (LP-02).
- **Acceptance:** reveal ≤ 2.5 s after the analysis ends (library copy); the 3 directions pairwise d ≥ 0.35 on the
  DG-09 fixtures; no hard gate item on screen; 360 px and Arabic RTL screenshots clean (visual CI fixture).

### DES-§14.4 Store generation from photos and the brand kit (R2, S2 with storefront.md S1)

1. **Inputs:** the store's products (catalog, R2) with their photos and analysis, the brand kit, the store name, mode,
   market and policies.
2. **Brand:** `sampleBrand({ products, brand, brandSeed, niche })`: G1 from `rankArchetypes` over the pooled palettes and
   the majority category; G4, G9, G28 sampled under the brand locks; the brand-level genes solved; novelty context
   `theme` (kind `brand`) against other stores' brand rows. With Cloud AI on, ai.md's `store.blueprint` stage 1
   (AI-11) supplies `GeneHints` for the brand genes (DES-§4.6).
3. **Pages:** the home page (kind `home`, marketing register) through the home grammar (DES-§5.6); collection and
   product templates (commerce register) from storefront.md's page-kind sections, compiled with `compileRegister`.
4. **Check:** gates per register on every generated page; brand novelty; the store theme draft (version 1).
5. **Preview and activate** (DES-§11.4). Generation never activates on its own.
6. **Acceptance (with AI-11):** the blueprint compiles with 0 hard gate items; brand distance to every live store in the
   niche ≥ the threshold or one bold gene is resampled; no fact, number or policy appears that the owner did not give.

### DES-§14.5 Generation studio (DG-12: R1 subset in the Theme panel; the studio with sliders and seed history R3, D4; core §L.2)

**R1 (P6):** the DNA card (DES-§15.4), the why line, the novelty words and the two remix steps "Bolder" / "Calmer"
(DES-§14.7) in the builder's Theme panel. **R3 (D4):** the studio below.

A "Design studio" sheet in the builder's Theme panel (and on the brand page for the store theme):
- **Directions:** 3 fresh directions for the current page content (the wizard pipeline of DES-§14.2 without step 10),
  each with its chips, why line and novelty words; "Apply" replaces the page's theme and section plan as one undoable
  edit.
- **Sliders** (5 steps, −2 … +2, each step a deterministic gene edit, re-solved and re-gated within 30 ms):

| Slider | Genes it moves (only these) |
|---|---|
| Boldness | G2 along quiet-luxe → editorial-column → split-tension → cinematic → poster (valid values only), G5.rd 1.2 → 1.5, G10 low → high end of its band |
| Density | G20.l airy / balanced / dense and G21 1.4 / 1.2 / 1.0 / 0.9 / 0.8 |
| Warmth | neutral hue toward 85° (warm sand) or 230° (cool) by 20° per step at neutral chroma ≤ 0.02 (never in the orange band) |
| Motion | G23.d 180 / 300 / 450 / 650 / 900 ms, reveal count 1 → 2; step −2 also sets `motion: "calm"` |

- **Seed history:** the last 20 genomes of the page (`generated`, `chosen`, `published` rows) with their chips and
  dates; "Restore" re-applies that genome to the current content (byte-identical doc when the content is unchanged,
  DG-12 acceptance).
- **Locks:** lock a gene for this page, or for the brand (writes the `brand` setting `genes`, needs `brand.write`).
- Every studio result passes the gates; a direction with a hard item is never shown (DG-12 acceptance).

### DES-§14.6 Director hints in the wizard (GH-1, R1 behind `ai_director_brief`)

When the flag is on and Cloud AI is available, the wizard starts ai.md's `design.direct` in parallel with step 2. The
directions render from rules first (never delayed). If the brief arrives within 90 s: directions 1-2 are re-sampled with
their hints (direction 3 keeps exploration, hints at weight ≤ 2), steps 3-7 run again for those directions, and the
directions animate in place (180 ms crossfade) with a "Refined by the Director" chip plus the Cloud AI chip (ai.md). A
later brief is ignored. Dropped hints are counted, never shown to the seller.

### DES-§14.7 Remix (existing `remixDoc`, `src/lib/generator/remix.ts`)

| Scope (UI) | Genome effect |
|---|---|
| Design | resample one of G9, G4, G18 (unlocked, seeded) and re-solve the dependent genes |
| Layout | re-expand the choreography and the variant picks under the same genome |
| Copy | rotate the G29 structures and pick library alternatives (generated fields only) |
| All | a new page genome within the brand locks |
| More like this (new) | mutate 1-2 solved genes (not bold) |
| Bolder / Calmer (new, R1) | one Boldness step (the R1 slice of DG-12, DS31): **Calmer** = G5.rd − 0.05 (≥ 1.2), G10 to the low end of its band, G20.l one step toward airy, G21 + 0.1, G2 one step along quiet-luxe ← editorial-column ← split-tension ← cinematic ← poster when the next value is valid; **Bolder** = the inverse; both re-solve the dependent genes, re-plan the rhythm genes and re-gate within 30 ms |
| Upgrade to design DNA (new, R1) | for a doc without `look`: `genomeOf(doc)` → the same genome re-compiled with a look and the rhythm plans (openers, photo plan, CTA plan, reveal scope); the owner sees a before / after toggle; copy untouched |

Each remix result must be d_page ≥ 0.15 from the current doc (otherwise the next seed is tried, ≤ 6), passes the gates
with 2 repair rounds and runs the own-page novelty check (context `remix`). Old docs without `look` remix through
`genomeOf(doc)` and gain a look.

### DES-§14.8 The engine-only guarantee and the wow demo (rev 2; DS34; rethink-features §4; core §K.2 exit criterion 12)

With Cloud AI off, the local model cache empty and no network beyond the app's own routes, the seller path of the
3-minute demo produces at 0:50 three directions that pass every hard gate, every budget estimate and the novelty bands,
each with a DNA card and three novelty words; `qa:wow-demo` (core §J.3, maintainer; the design steps are this part's
contribution) asserts on a 390 px viewport with 4G throttling:

| Clock | Design assertion | Source |
|---|---|---|
| 0:50 | three directions rendered; pairwise `genomeDistance ≥ 0.25`; every direction's `GateReport.hard` empty; estimates within the core budget thresholds; `orangeMixes` empty on each; the chips contain no `·`; the why line names only inputs | DES-§14.2, DS25 |
| 0:50 | the DNA card shows four chips and the three novelty words; no number appears on the card | DS27 |
| 1:05 | the delivery fee line is absent (no zones); no invented number in any field (`numbersReport().unknown` empty) | DS42, LAN-§7.4 |
| 1:40 | publish passes with 0 refusals and the `published` genome row exists with `live = 1`; the page's `look` is present | DES-§8.8 |
| run 2 | the same three photos in a second store give directions with `d ≥ 0.25` to the first store's chosen genome; the second store's publish is not refused by N1 (d ≥ 0.40 in the same niche, else the resample of step 5 found a clear candidate) | DS5, DS6 |
| every page | the no-orange scan (`qa/verify/orange-check.mjs`) and the admin token check pass | owner rule 1 |

Everything the Director adds (hints, critique, repairs, tiles) is an upgrade on this path and can be absent without
any assertion failing.

---

## DES-§15 Builder integration (DG-06 panel, DNA card; R1, P6)

### DES-§15.1 Design check panel (`src/components/builder/panels/DesignCheckPanel.tsx`)

- **Where:** a right-rail tab "Design check" next to Theme; a count badge with the number of blocking items (hidden at
  0); the publish dialog shows the same list when publishing is blocked.
- **Header:** Q as a number with a label (Excellent ≥ 90 · Good 80-89 · Fair 65-79 · Needs work < 65) and its three
  largest contributions in plain words.
- **Groups:** Blocking (hard: design, **budget** and **honesty** items alike, with the same `design:` / `budget:` /
  `honesty:` ids the publish dialog shows, delivered by `buildChecklist(doc, LandingCheckContext)` and the client-side
  estimates of the core thresholds) · Improve (soft visual) · Copy · Uniqueness (bands, with "Differentiate") · Budgets
  (the live meters: sections 11/14, height 9,800/12,000 px, CTAs 5/6, glass 1/2, reveals 44/60, photo uses per asset,
  kickers 3/4; each meter turns to the warn tint at the soft limit and to the destructive tint at the hard one). Each
  item: one plain sentence (DES-§20.1), the section chip (click scrolls the canvas to the section and outlines it for
  1.2 s), a "Fix" button when the item carries ops, "Ignore on this page" for soft items (a per-viewer convenience in
  localStorage, never stored in the doc). Honesty items carry no "Ignore".
- **States:** checking (skeleton rows after 150 ms, never a spinner), clean ("Nothing to fix. This page meets the design
  checks."), stale (shown for ≤ 400 ms after an edit, then rerun), unavailable (server checks offline: local checks
  still shown).
- **Density:** 32 px rows, 13 px text in the compact admin density; works at 360 px as a bottom sheet.

### DES-§15.2 Fixes are editor edits

"Fix" applies the item's `RepairOp`s through the builder store (zustand + zundo history, `src/components/builder/**`),
so Undo (⌘Z) reverts it like any edit; the canvas updates live; the gates rerun. "Fix all" (blocking group only)
applies every blocking item's ops in one history step.

### DES-§15.3 Differentiate

Shown when a novelty band is `close`, when any band is `too_close`, or when the server answered `design:N1` /
`design:N2` at publish: resample one bold page gene (G2 or G18, unlocked; the brand's locked genes never move) with up
to 6 seeds, keep the first that clears every band, preview it as a before / after toggle, apply as one undoable edit;
when no seed clears the bands the panel says so and offers "Remix design" (a new page genome within the brand locks)
instead of pretending.

### DES-§15.4 DNA card (Theme panel)

The chips, the why line, the novelty words, and a lock toggle per bold gene ("Lock for this page" / "Lock for my brand"
with `brand.write`; a page lock is `doc.theme.look.locks?` (optional, no default) and a brand lock writes
`brand.genes` / `brand.colors.locks` / `brand.fonts.locked`, DES-§12.3). Old docs without `look` show the back-derived
chips with "Generated before design DNA; remix to upgrade" and the "Upgrade to design DNA" remix (DES-§14.7). The card
also shows the provenance line "Designed by the engine" / "Refined by the Director" (from the draft's `generation`
block, rethink-ai §5.6) so "which AI wrote this" is visible before publish.

### DES-§15.5 Mounts and extension files owned here (core §K.2 P6 row)

- **`ProofAttestSheet` (P3's component, LAN Q31 accepted):** mounted by the builder at the `sample` toggle of proof
  sections and at the rating field; the design panel's honesty items deep-link to it.
- **P7's AI components (AI R15 accepted):** `useAiTask`, the field rewrite chips and the Director brief chip are mounted
  in the builder and the wizard by P6 at the places DES-§14.6 and DES-§15.1 name; P6 merges after P7 (core §K.2 merge
  order) so the imports exist.
- **⌘K search provider** `src/lib/admin-data/search/design.ts` (core §I.3 extension point, LAN Q18): `provider = { id:
  "design", kinds: ["page"], search(scope, q, viewer) }` matches pages by their design tags (grammar, colour strategy,
  pairing names, hero family, the chip labels of DES-§20.2 in the viewer's locale) from the store's `design_genomes`
  rows (`chosen` / `published`, scoped), ≤ 120 ms, ≤ 8 hits, each hit `{ kind: "page", id, title, hint: "Editorial
  column · Fraunces / Readex Pro", href: appHref(h, "/pages/<id>/edit") }`; never another store's rows.
- **Nav** `src/components/admin/shell/nav/design.ts`: the `Brand` item under Settings (`brand.write` to edit,
  `pages.read` to view) and the `Generate` item under Landing pages (`pages.write` + `ai.use`); both filter by mode per
  core §I.3.
- **i18n** `src/lib/i18n/admin/<locale>/design.ts`: every key of DES-§20 in `en`, and in `ar` / `fr` for every gate
  title, every notification kind and every string of the onboarding reveal (core §I.5 `test:i18n-coverage`).

---

## DES-§16 Admin design system (UX-01 … UX-08 design depth; R1 foundation P2 + P1, R2 upgrade S6)

Direction: **calm graphite, one signal colour, precise type, fast honest motion.** The stack stays (shadcn, Tailwind v4,
cmdk, motion, recharts, sonner, `package.json`); the work is discipline. Owner rules win over every reference (no orange,
no bounce, no vintage, no AI tells).

### DES-§16.1 Testable principles

1. **Instant:** route changes feel < 150 ms (prefetch on hover and focus, streamed server components, cached first
   page); writes are optimistic with rollback or Undo; skeletons mirror the final layout, appear after 150 ms and stay ≥
   300 ms.
2. **Keyboard everywhere:** ⌘K for every page and action, two-key chords (`G O` orders …, platform.md / rethink §2.2), `?`
   for the shortcut sheet, `/` for search; every action reachable without a pointer.
3. **Honest data:** placed, confirmed and delivered never share a tile; every rate shows its n; sparklines need ≥ 7
   points; no number that is not the store's own (or a labelled k ≥ 5 platform median).
4. **One accent, one glass, no bounce:** jade for the tenant, teal for the console, violet only for impersonation; the
   topbar is the only frosted surface; ease-out only.
5. **Dense but breathing:** two densities (DES-§16.7); tabular numerals in every number column; ≤ 2 lines per cell.
6. **Phone-first for agents:** 44 px targets, outcomes under the thumb, drawers become full-height sheets.
7. **RTL-perfect:** logical properties only, mirrored directional icons, isolates for phones and ids (DES-§16.15).
8. **No AI tells:** skeletons over spinners, label above input, no placeholder-as-label, no decorative status dots, no
   em or en dash in UI copy, no "Step 1 / 2 / 3" labels, one label per intent (rubric §4.5-4.7, §9; owner rules win).

### DES-§16.2 The token generator (`scripts/build-admin-css.mjs` + `src/lib/admin-theme/**`, core §I.6)

Three inputs per surface: `base` (neutral hue, chroma), `accent` (hue, chroma), `contrast` (`standard` | `high`).
Every token is computed in OKLCH and emitted for light and dark into the precompiled admin CSS (no Turbopack loader,
HANDOFF §4).

```ts
// src/lib/admin-theme/generate.ts (pure; imported by the build script and by admin-tokens-check)
export interface SurfaceInput { base: { h: number; c: number }; accent: { h: number; c: number }; contrast: "standard" | "high" }
export const SURFACES = {
  tenant:  { base: { h: 265, c: 0.006 }, accent: { h: 166, c: 0.10 }, contrast: "standard" },
  console: { base: { h: 230, c: 0.008 }, accent: { h: 205, c: 0.09 }, contrast: "standard" },
} as const satisfies Record<string, SurfaceInput>;
export function generateTokens(s: SurfaceInput, mode: "light" | "dark"): Record<AdminToken, string>;   // "oklch(L C H)" strings
```

Neutral roles (L in light / dark; chroma = `base.c × factor`; `high` contrast uses the bracketed L):

| Token | L light | L dark | chroma factor |
|---|---|---|---|
| `--background` | 0.990 | 0.165 | 0.25 |
| `--card`, `--popover` | 0.998 | 0.190 | 0.15 |
| `--sidebar` | 0.966 | 0.150 | 0.40 |
| `--muted`, `--secondary` | 0.962 | 0.240 | 0.50 |
| `--accent` (hover tint) | 0.955 | 0.260 | 0.65 |
| `--border` | 0.915 (0.880) | 0.300 (0.340) | 0.65 |
| `--input` | 0.885 | 0.330 | 0.80 |
| `--muted-foreground` | 0.500 (0.440) | 0.700 (0.760) | 2.0 |
| `--foreground`, `--primary` | 0.200 (0.160) | 0.955 (0.975) | 1.4 |
| `--surface-stage` (onboarding stage, DES-§14.3) | 0.180 | 0.120 | 1.6 |

Accent roles: `--brand` L 0.53 / 0.70 at `accent.c`; `--brand-foreground` L 0.99 C 0.006; `--brand-soft` L 0.955 C
`accent.c × 0.26` (light) / L 0.30 C `accent.c × 0.5` (dark); `--ring` L 0.60 C `accent.c`. Status (shared by both
surfaces): `--success` h 150 (L 0.64 C 0.15, ink L 0.44), `--warn` h 95 (L 0.84 C 0.155, ink L 0.43), `--destructive`
h 17 (L 0.55 C 0.19), `--info` / `--info-ink` h **250** (L 0.58 C 0.12 / ink L 0.40; core §I.6, OPE Q.16: callbacks,
in-transit and scheduled chips; violet stays reserved for impersonation). Impersonation: `--imp-bg` L 0.42 C 0.15
h 295, `--imp-ink` L 0.99. Break-glass (R3): `--bg-ribbon` h 17 L 0.45 C 0.17. Data-viz categorical set (DES-§16.9):
jade 166, blue 250 (= `--info`), violet 295, rose 350, yellow 95, graphite.

Checks in `scripts/qa/admin-tokens-check.ts` (`test:admin-tokens`, core §J.1), for both surfaces and modes: every token
outside hue 25-75° at chroma > 0.06; `--foreground` on `--background` ≥ 7:1 (12:1 high); `--muted-foreground` on
`--background` and on `--card` ≥ 4.5:1; `--brand` as text on `--background` ≥ 4.5:1 and `--brand-foreground` on
`--brand` ≥ 4.5:1; `--border` vs `--background` ΔL ≥ 0.07 (hairlines visible); `--imp-ink` on `--imp-bg` ≥ 7:1; every
status ink on its soft background ≥ 4.5:1. Today's values (`src/app/globals.css:74-116`) are what the tenant input
reproduces within ΔE 0.01, so R1 changes nothing visible except the fixes listed in DES-§16.16.

### DES-§16.3 Type

- **Latin UI:** Instrument Sans (shipped, variable 400-700). Scale (px / weight / line-height / tracking):
  11 / 500 / 1.35 / 0 (captions, column headings, sentence case) · 12 / 400-500 / 1.4 / 0 · 13 / 400 / 1.45 / 0 (compact
  base) · 14 / 400 / 1.5 / 0 (comfortable base) · 16 / 600 / 1.35 / −0.006 em (section titles) · 20 / 600 / 1.25 /
  −0.011 em (page titles) · 28 and 32 / 600 / 1.1 / −0.015 em (KPI values only).
- **Numbers:** `font-variant-numeric: tabular-nums` on tables, KPI tiles, money, counts and timers; money via
  `src/lib/markets/money.ts`.
- **Ids:** JetBrains Mono 12 / 13 in `dir="ltr"` isolates.
- **Arabic UI (DS21):** IBM Plex Sans Arabic 400 / 500 / 700 (shipped static files, `public/fonts/ibm-plex-sans-arabic`):
  sizes +1 px over the Latin step at 12-16 px, line-height ≥ 1.6, no letter-spacing, no uppercase; 600 maps to 700 for
  titles and 500 for emphasis in body.
- No other face in the admin; no serif display in dashboards (rubric §9.B).

### DES-§16.4 Space and layout

4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Page gutter 24 px (≥ 1024), 16 px (< 768). Content widths: dashboards
and lists up to 1280 px; forms and settings 720 px reading width inside a 960 px frame; split views = list 400-480 px +
detail (resizable, `components/ui/resizable.tsx`), collapsing to list → full-screen detail under 1024 px. Drawers 480 px
(order drawer 560 px), sheets on mobile at full height.

### DES-§16.5 Shape and elevation

Radius ladder `--r-chip 6px`, `--r-control 8px`, `--r-card 12px`, `--r-sheet 16px` (core §I.6); nested elements use
outer − padding. Hairlines 1 px from `color-mix(in oklch, var(--foreground) 9%, transparent)` (registered with the blend
guard, owner rule 1). Shadows only on floating layers (popover, menu, drawer, sheet, the toast stack):
`0 8px 24px -8px oklch(0.2 0.01 265 / 0.18), 0 0 0 1px var(--border)`. One glass surface: the topbar (blur 12 px,
saturate 1.2, fill alpha 0.78, opaque fallback). Cards only where elevation means something; lists separate with
hairlines.

### DES-§16.6 Motion

`--dur-1 120ms` (hover, press, checkbox), `--dur-2 180ms` (popover, tab indicator, toast), `--dur-3 240ms` (drawer,
sheet, palette list); easing `--ease-out cubic-bezier(.2,.8,.2,1)` for everything (exits too, at `--dur-1` with
opacity). Allowed: the sidebar active pill slides (layout animation, tween, not spring); rows enter with a 6 px rise and
fade, staggered 20 ms, ≤ 12 rows; drawers slide; numbers roll once per change (≤ 400 ms); toasts rise. Forbidden:
spring overshoot (`src/components/admin/shell/app-sidebar.tsx:96` spring stiffness 480 and `:146`
`cubic-bezier(.34,1.36,.64,1)` become tweens: the pill keeps `layoutId="nav-active"` with `transition={{ duration:
0.18, ease: [0.2, 0.8, 0.2, 1] }}`, the generate icon loses `group-hover/gen:rotate-12` and its 500 ms transition),
rotation on hover, pulsing glows, parallax, confetti, looping animations. `--ui-spring` (`src/app/globals.css:120`,
consumed at `:225`) is removed; `scripts/qa/admin-motion-check.ts` (P2, in `npm test`, core §J.1) fails on any
`cubic-bezier` with y1 < 0 or y2 > 1 in admin CSS, on `type: "spring"` or `bounce` in `src/components/admin/**` and
`src/components/console/**`, and on any transition or animation duration above **400 ms** outside the builder canvas
(core §I.6). `prefers-reduced-motion`: opacity only, ≤ 120 ms.

### DES-§16.7 Density

`[data-density="comfortable" | "compact"]` (core §I.6): rows 40 / 32 px, controls 36 / 30 px, base 14 / 13 px,
paddings 12 / 8 px in cells. Default: compact for members whose role is `agent` or `manager` and in the console;
comfortable otherwise. The viewer's choice is remembered in localStorage (a convenience, core rule). On touch devices
controls are ≥ 44 px whatever the density.

### DES-§16.8 Component anatomy

| Component | Rules |
|---|---|
| Buttons | heights 36 / 30 (+ 44 touch); variants primary (ink), brand (jade: the one main action per view), secondary (hairline outline), ghost, destructive (crimson, confirm for irreversible); icon 16 px with 6 px gap; one primary per view |
| Inputs | label above (13 / 500), helper below (12, muted), error below in `--destructive` with an icon and the field outlined; never a placeholder as the label; masks for phones in `dir="ltr"` |
| Tables | sticky header (11 / 500 muted, sentence case), one hairline between rows, no zebra, hover `--accent`, selection = `--brand-soft` + a 2 px inline-start indicator, numbers aligned to the inline end, truncation with a title, column chooser, keyboard row focus |
| Status chips | text + tinted ground (status soft tokens); a dot only for real live state (UX-06), never decorative (S16 applies to the admin) |
| Tabs / segmented | 2 px indicator that slides (`--dur-2`), counts in tabular muted text |
| Toasts | sonner, bottom-end, Undo for 10 s on destructive and bulk actions, one line + an action |
| Skeletons | the exact final layout, after 150 ms, ≥ 300 ms, shimmer-free (static tint) |
| Drawers / sheets | 480 / 560 px, header with title + close, sticky footer for actions, focus trapped, `Esc` closes |
| Banners | one at a time at the top of the content (pending, restricted, suspended, quota, kill switch, 2FA; core §I.4), severity tint, dismissible only when informational |
| Limit sheet | what is limited, the current use as a meter, the plan line, "Ask for more" (platform.md) |
| Empty states | **quiet** (default): a skeleton preview of the real UI in its final shape, one sentence, one primary action, an optional teaching line; **celebration** (once: first store, first order): the aurora + grain budget of one per screen |

### DES-§16.9 Data visualisation

- **Series colours:** context graphite (L 0.56 C 0.02 h 265), "ours" / delivered jade (`--brand`), loss / refused
  crimson (`--destructive`), warn / pending yellow (`--warn`); categorical (≤ 6): jade 166, blue 240, violet 295, rose
  350, yellow 95, graphite. All outside the banned band (checked by `test:admin-tokens`).
- **KPI tile:** label (13, muted) · value (28 / 32, 600, tabular) · delta chip vs the previous period (semantic tokens,
  arrow icon, never Tailwind `emerald` / `rose`: `dashboard/kpi-card.tsx:75`) with its n · sparkline only with ≥ 7
  points (28 days, 1.5 px jade line, last point marked; today `kpi-card.tsx:92` draws from `spark.length > 1`) · a
  definition on hover ("Delivered orders, last 28 days"). The hero tile loses aurora + grain by default
  (`kpi-card.tsx:58`, `emphasis && "adm-aurora adm-grain"`); placed, confirmed and delivered never share a tile (core
  §I.8 rule 3).
- **COD funnel (signature chart):** horizontal stepped bars orders → confirmed → shipped → delivered → cash collected;
  bar length ∝ count, absolute count + step rate between bars, delivered in jade, the others in the graphite ramp,
  refused and returned as a thin crimson annotation; one funnel per period; tabular labels.
- **Charts:** recharts (code-split, `dashboard/orders-chart-plot.tsx`); axes 11 px muted; horizontal hairline gridlines
  only; no dual axes, no pies except a two-segment share; the last point labelled; tooltips with exact values and dates
  in the store time zone; fewer than 5 points → a table instead.

### DES-§16.10 Command palette visuals (UX-02)

Width 640 px (≤ 92 vw), 12 vh from the top; input row 48 px with 16 px text and a search icon; results ≤ 420 px tall;
rows 36 / 32 px (density) with a 16 px icon, label, secondary text in muted, and the shortcut as `kbd` chips (20 px, mono
11 px) at the inline end; group headings 11 / 500 muted, sentence case; the selected row has `--accent` and a 2 px
inline-start indicator in the surface accent. Open: opacity 0 → 1 and scale 0.98 → 1 over 120 ms ease-out; close 100
ms. Backdrop `oklch(0.2 0.01 265 / 0.32)` without blur (the glass budget belongs to the topbar). States: skeleton rows
after 150 ms for server results; "No results for …" with up to 3 suggestions; a footer with key hints as separate `kbd`
groups (no `·` strings). RTL mirrored. Console variant: teal indicator, a "Platform" prefix chip in the input.
Acceptance: opens ≤ 50 ms after the key on a warm shell; every row reachable by keyboard.

### DES-§16.11 Console identity (UX-03, R1, P1)

Deep-ink sidebar on every console route in both modes (L 0.18 C 0.012 h 230, foreground L 0.93), content surface from
the `console` input (teal 205 accent), compact density by default; a permanent **Platform** badge (20 px pill, teal soft
ground, teal ink, "Platform") before the breadcrumb on every console route; the impersonation ribbon (tenant shell):
full width, 32 px, `--imp-bg` / `--imp-ink`, text "Viewing <store> as support · read-only · mm:ss left" (one `·`
group as data separators is the documented exception, since these are three data fields) with a tabular mono countdown
and an inverse-outline End button. Acceptance: `test:admin-tokens` green; ribbon text ≥ 7:1; the badge visible on every
console route (e2e check).

### DES-§16.12 Live address card (UX-05, **R1**, P2; core §I.4, rethink-features §3.2)

A card on the dashboard after the first publish, on the pages list and at the onboarding end: the canonical store URL
in mono (`dir="ltr"`, truncated in the middle), Copy (toast "Link copied"), a QR code (the existing `qrcode` package,
`package.json:65`; ink = `--foreground` on L 0.99 ground, ≥ 7:1, square modules, quiet zone 4 modules, error correction
M, no logo inside the code, ≥ 4 px modules on screen, PNG and SVG download), "Share on WhatsApp" (`wa.me` with the URL),
"Open a test order" (SF-05, P3 mints the D54 token) and "Create a campaign" (SF-01, P3). Composition: one card, the URL
row first, the QR at inline-end (96 px on desktop, 128 px centred on mobile), the four actions as secondary buttons in
one row that wraps to two on mobile; no aurora. Acceptance: the QR scans from 3 cm printed and from the screen; the
card is on screen at 1:40 of the wow demo.

### DES-§16.13 Realtime (UX-06, R2)

The live indicator is a static 6 px dot in `--success` with the text "Live · 12 s ago"; it shows live only when the last
pulse poll succeeded < 30 s ago (core D46), else grey with "Paused" / "Reconnecting". New rows insert with a 6 px rise +
fade (180 ms) and a `--brand-soft` ground that fades over 1.2 s, once; counters roll once per change. Nothing loops;
reduced motion: no movement, the ground tint only.

### DES-§16.14 PWA icons and manifest (UX-07; R1 manifest per platform.md PD10, R3 push)

The `/app/` manifest uses `theme_color` = the tenant `--sidebar` light hex and `background_color` = `--background`;
icons 192 and 512 maskable (mark inside the inner 80 % circle) rendered at build time from the platform brand initial
with the grid monogram (DS32) on the deep-ink ground; R2 store icons come from the logo engine exports (DES-§13.14).

### DES-§16.15 RTL, Arabic and French (UX-08: fr R2, ar R3)

- Logical properties only in admin code: `scripts/qa/admin-rtl-lint.ts` (new, in `npm test`) fails on `ml-`, `mr-`,
  `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l*`, `rounded-r*`, `border-l*`, `border-r*` and
  CSS `margin-left|right`, `padding-left|right`, `left:`, `right:` in `src/components/{admin,console,builder,generate}/**`
  and `src/app/{app,admin}/**` (allow-list file for the few physical cases, each with a reason).
- Mirrored icons: chevrons, arrows, back / forward, undo / redo, list indents, progress direction; never logos, media
  controls or charts' time axes (time runs left to right with Latin digits; legends and labels follow the reading
  direction).
- Digits: Latin by default, an Arabic-Indic toggle per user (R3); phones, order ids, URLs in `<bdi dir="ltr">`.
- French labels run 20-30 % longer: no fixed-width buttons; truncation rules per component; acceptance through the
  catalog coverage report (platform.md) and screenshots at 1280 / 390.

### DES-§16.16 What changes when

| Release / track | Scope |
|---|---|
| R1, P2 (shell) | token generator (tenant reproduces today), console input, `--info` pair at hue 250, density attribute, motion fixes (sidebar spring and rotation, `--ui-spring` removed, the 400 ms rule), `test:admin-motion` / `test:admin-rtl` / `test:i18n-coverage` (core §J.1), radius tokens, Plex Arabic for `ar` pages (auth, onboarding, agent console, D36), palette visuals, banners, limit sheet, quiet empty states (aurora off by default, celebration variant twice), KPI ≥ 7-point rule and semantic delta tokens, the Store Health ring and issue list (SF-03 UI), onboarding reveal (DES-§14.3), the **full live address card** (DES-§16.12), manifest |
| R1, P1 (console) | console identity, impersonation ribbon, console palette variant, the console health ring |
| R1, P6 | Design check panel with budget meters, DNA card with locks and provenance, brand page (BK-1), the search provider, the design health rules, the design flags |
| R1, P3 / P4 / P5 | their screens on the system per core §I.8's 13-screen order; P4 owns the agent console's phone-first rules (core §I.8 rule 6) |
| R2, S6 (UX-04) | every screen of rethink-features §2.9 on the system: split views, saved-view bars, bulk bars, COD funnel, undo toasts everywhere, realtime arrivals, French catalog |
| R3, D5 | Arabic RTL dashboard, digits toggle, push |

### DES-§16.17 Screen checklist (acceptance for every screen a track ships)

At 1280, 1440 and 390 px, light and dark: (1) only tokens for colour, radius, shadow and motion (lint); (2) no orange
(scan, `qa/admin-visual/shoot.mjs --scan-only`); (3) one primary action; (4) labels above inputs, errors inline;
(5) skeletons mirror the content; (6) every number tabular and honest (n shown for rates); (7) keyboard path for every
action, visible focus ring ≥ 3:1; (8) no spring, rotation or looping animation; reduced motion respected; (9) no
decorative dots, em or en dashes, `Step 1/2/3` labels; (10) RTL lint clean; (11) 44 px targets on touch; (12) empty,
loading, error and limit states designed (not default).

---

## DES-§17 Calibration corpus and visual CI (DG-09 R1 · DG-13 R2)

### DES-§17.1 Corpus (`scripts/qa/design-corpus.ts`, `npm run qa:design-corpus`, local only)

- **Fixtures:** 20 products, 2 per family (skincare, haircare, fragrance, jewelry, modest fashion, kitchen, home, kids,
  tech, terroir), each with 3-4 photos owned by the project (the `qa` render fixtures plus new ones under
  `qa/design-corpus/fixtures/`, git-ignored like `qa/saas-baseline/`), owner-typed facts and prices written for the
  fixture.
- **Pages:** 20 fixtures × 10 runs = 200 generated pages; each run uses a different simulated store (`brandSeed`),
  locales ar 50 % / fr 35 % / en 15 %, mood as the fixture dictates; 3 directions per run kept for the direction
  metrics (600 docs, 200 "chosen").
- **Pool simulation:** the chosen docs of earlier runs form the novelty pool of later runs (in memory), so the
  thresholds are tested against a growing platform.
- **The baseline sweep (rev 2, design-baseline §5.10):** the same `scripts/qa/render.ts` fixtures and method the
  baseline used: 7 fixtures (`argan massage blender parfum duo tshirt colors`) × ar/fr × 10 seeds = **140 plans** for
  N3-N8, T5, K1, R8, R9, and the **41-page render set** (14 fixture × locale defaults, the two 11-archetype sweeps, 3
  seeds, 2 thank-you pages) for C2-C7, K2, I1-I7, R1-R7, RTL1-RTL8, F1-F5, shot in ≤ 8,000 px segments at 390 and 1440
  (the harness defects of design-baseline §1.4 fixed: segmented shots, the `.lp-skip` link never focused, fonts read from
  the `--lp-font-*` tokens). `qa/saas-baseline/index.json` keeps its schema and gains per page `genome` (compact),
  `gates: { id, level, pass, value, threshold }[]`, `slop`, `Q`, `heights.estimated`, `fold`, `ctas`, `reveals`,
  `photoUses`, `openers`, `hero.family`; the 2026-10-24 file is kept as `index.baseline.json` so every run diffs
  against it.

### DES-§17.2 Designer seed genomes

≥ 44 genomes (4 per archetype) written by the design lead in `src/lib/design/seeds/<archetype>.ts` as parameters, each
compiled, gated (Q ≥ 85, 0 hard items) and rendered once for review. They are the MAP-Elites elites (DES-§7.7) and the
regression set for the solver (every seed must stay valid when rules change).

### DES-§17.3 Labelling and fitting

1. `qa:design-corpus --pairs 300` samples 300 pairs across bands of d (stratified: 100 with d < 0.2, 100 with 0.2-0.45,
   100 above), renders the mobile fold and the desktop fold of both pages (Playwright, `channel: "msedge"`, a test server
   on port 3451+, never 3400 or 3450) into `qa/design-corpus/review/index.html`.
2. The owner or a designer labels each pair **near-identical**, **related** or **different** (keys 1 / 2 / 3); labels
   go to `qa/design-corpus/labels.json` (committed; no customer data in it).
3. Fit (`--fit`): `clone = max(0.12, P95 of d over near-identical pairs − 0.02)`; `platform = max(0.25, P95 of d over
   near-identical pairs + 0.05)`; `niche = max(0.40, P75 of d over related pairs)`; `ownPage = max(0.30, P50 of d over
   related pairs)`; `brandRadius = min(0.35, P90 of d_brand over pairs labelled related within one simulated store)`. The
   height model scale (DES-§5.3), the slop fail line (a baseline-like fixture must score ≥ 6) and the specificity
   target are checked in the same run.
4. Output `src/lib/design/calibration.json`: `{ version, date, thresholds, heightScale, slop, spec, counts, approved:
   "owner" | "pending" }`. Values may be raised by the fit; lowering below the R-D36 floors needs the owner's written
   decision in `docs/saas/PROGRESS.md` (DS25).

### DES-§17.4 Quality report (`npm run qa:design-report`)

Prints the DS25 table over the corpus: median and minimum Q, hard items after repair, median slop, the median pairwise
distance of the 3 directions per run, grammars seen over 20 runs of one fixture (≥ 7 of 9), em/en dashes in generated
copy (0), median cliché density (≤ 0.5 per 100 words), median specificity, novelty verdict mix. **Rev 2:** a second
table lists every design-baseline §5 target id with its baseline value, the threshold, the measured value on the
sweep or the render set, pass / fail and the owning gate (the DES-§8.10 map as a report), plus the distinctness
metrics (distinct in-flow sequences per 100, max 4-gram share, first-screen tuples, hero-family histogram per niche,
archetype reach per category, pairing concentration, display-face shares, strategy shares) and the admin checks
(`test:admin-tokens`, `test:admin-motion`, `test:admin-rtl` results on the same build). A DS25 miss or a target miss is
recorded with the owner's decision before R1 exit (DG-09 acceptance); regression against the previous run = any hard
gate pass → fail or a median Q drop > 3 (core §J.3).

### DES-§17.5 Visual CI (DG-13, R2, S2; `scripts/qa/design-visual.mjs`, `npm run qa:design-visual`)

Playwright msedge, viewports 360 / 768 / 1440, ar and fr, over the corpus and the section-arrangement fixtures:

| Check | Method | Fails when |
|---|---|---|
| text clipping | for text elements without intended ellipsis: `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1` | any |
| horizontal overflow | `document.scrollingElement.scrollWidth > innerWidth` | any |
| text overlap | bounding boxes of text runs from different blocks intersect by > 4 px² | any |
| ghost-word legibility | decorative words with font-size ≥ 9 vw: clipped share | > 30 % (Latin), > 0 % (Arabic) |
| near-duplicate directions | SSIM of the 390 px hero folds of the 3 directions of a run (grayscale, 128 × 277, `sharp` decode) | SSIM > 0.92 |
| reduced motion | page loaded with `prefers-reduced-motion: reduce`: no transform animation runs | any |

Budget ≤ 15 minutes locally; artefacts in `qa/design-visual/out/` (git-ignored); a seeded clipping fixture must fail
(self-test of the checker). 0 failures on the corpus is an R2 exit criterion. **R1 subset (rev 2):** `qa:design-corpus`
already renders the 41-page set in Playwright, so it runs the three cheapest rows in R1 on that set: text clipping
(RTL6, I7), horizontal overflow, and the fold check that mirrors `budget:C2` (image, price, CTA, COD line inside 844 px
at 390), plus the fixed-layer height sum (R7 ≤ 88 px) and the `[dir=rtl]` text regexes of RTL1 / RTL2 / RTL5; the SSIM
near-duplicate and overlap rows wait for R2.

### DES-§17.6 The critic re-score (rev 2; DS43; design-baseline §1.3, §2, §5.10)

The number that found 4.3 is the number that must find ≥ 7.5. After the P6 merge and before the R1 exit:

1. **Same material:** the regenerated 41-page render set and its contact sheets (`tiles/folds-*.png`, per-section
   crops, visible-text extracts), produced by the same scripts as the baseline (`qa/saas-baseline/shoot-baseline.mjs`,
   `tiles/reshoot.mjs`, `build-index.mjs`), with the harness defects fixed.
2. **Same judges, same questions:** three independent critic passes (art direction; typography / RTL / copy;
   composition / COD craft) score the 11 dimensions of design-baseline §2 from 1 to 10 on the same evidence set, blind
   to the gate results; a critic may be a human designer or a frontier-model pass (ai.md's `eval.judge`, Director deep,
   two-model jury with disagreements to a human, rethink-ai §3.6) but at least one pass is human and the Darija / French
   naturalness items are human-rated.
3. **Consensus:** the median of the three, rounded toward the two that agree (design-baseline §1.3); every fact a
   critic cites must be on a named shot.
4. **Targets:** overall consensus **≥ 7.5**, **no dimension < 6**, **dimension 10 "distinctiveness between pages" ≥ 8**
   (baseline 2); the §6 keep-list items are re-checked as regressions (each keep-list item has a named shot in the new
   set that shows it intact).
5. **Output:** `qa/saas-baseline/rescore-<date>.md` (committed as a docs artefact without the shots) with the
   scorecard, the per-page evidence index and the list of misses; a miss on any target blocks "done" for DG-02 … DG-09
   and goes into `docs/saas/PROGRESS.md` with the owner's decision (DS25).
6. **Cadence:** once at R1 exit on the merged build; again at R2 exit with the store page kinds in the set; the DG-13
   visual CI (R2) automates the clip / overlap / near-duplicate rows between re-scores.

---

## DES-§18 E-mail and transactional tokens (DG-14, R2, S2)

```ts
// src/lib/design/email.ts
export interface EmailTokens {
  width: 600; dir: "ltr" | "rtl"; bg: Hex; card: Hex; ink: Hex; inkSoft: Hex; line: Hex; accent: Hex; accentInk: Hex;
  button: { bg: Hex; ink: Hex; radius: 8 | 12 }; font: string; fontAr: string;
  logo: { url: string; width: number; height: number; alt: string } | null;
}
export function emailTokens(scope: StoreScope, locale: Locale): Promise<EmailTokens>;   // brand setting / active store theme
export type EmailRole = "body" | "card" | "title" | "text" | "muted" | "button" | "link" | "rule" | "footer";
export function inlineStyle(role: EmailRole, t: EmailTokens): string;                 // "background:#…;color:#…;…"
```

- Inline styles only, no CSS variables, table layout, 600 px; colours from the brand (light base forced: e-mail clients
  invert dark themes unpredictably); every pair checked ≥ 4.5:1 (an accent that fails as a button ground becomes a
  hairline + ink button).
- Fonts: Latin `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` with the brand family name first (no web
  font loading); Arabic `Tahoma, "Segoe UI", Arial, sans-serif`, `dir="rtl"`, line-height 1.7.
- Logo: the `primary-png` export (DES-§13.14) or a PNG rendition of the uploaded logo (request DES-R14), height 32-48 px.
- Consumers: the Mailer templates (core §B.10, `src/lib/mail/**`, R2 S5) and the packing slip (S4, grayscale-safe: ink
  only, mono logo). The PHP export is not touched (DS30).
- Tests: snapshot of every template in ar (RTL) and fr; no `var(` in the output; contrast pairs; the logo URL is an
  absolute platform media URL (`mediaUrl`, core §C.6).

---

## DES-§19 Performance budgets

| Item | Budget | Checked by |
|---|---|---|
| landing runtime JS added by this part | 0 bytes (24,200 B gz unchanged, LND-16) | `render-check` |
| inlined CSS growth from `look` and the new variants | ≤ +4 KB gz on the heaviest page (new budget key `css`, request DES-R5) | `render-check` |
| `look` JSON in the doc | ≤ 700 B | `theme:check` |
| `sampleGenome` + compile, per candidate | ≤ 3 ms (200 node expansions) | `test:design` (timed) |
| wizard candidates (12, genome + plan + view) | ≤ 150 ms | `test:design` |
| `runGates` | ≤ 8 ms p95 per doc in Node | `test:design` over the fixtures |
| `repairDoc` (3 rounds) | ≤ 30 ms per doc | `test:design` |
| `checkNovelty` | ≤ 25 ms p95 server time for 16 candidates × 20,000 pool rows | `test:design` (synthetic pool) |
| pool cache (`novelty-pool`) | ≤ 10 MB, ≤ 20,000 entries | `ScopedCache` bounds |
| `estimateHeights` (rev 2) | ≤ 1 ms per doc | `test:design` |
| rhythm planners `planOpeners` / `planPhotos` / `planCtas` / `planReveals` (rev 2) | ≤ 2 ms together per candidate | `test:design` |
| `typeTokens` (rev 2) | ≤ 0.2 ms per pairing × locale (pure arithmetic over the manifest) | `test:design` |
| `renderDigest` (rev 2) | ≤ 2 ms per doc | `test:design` |
| `base.css` growth (rev 2) | ≤ +8 KB gz added, ≥ 2 KB removed (DES-§4.5.4); per-page inlined CSS within the `css` key | `render-check` |
| the design check at publish incl. novelty and headline checks (rev 2) | ≤ 15 ms server time (core §M.1 allows ≤ 400 ms per check) | `test:prepublish` |
| `designHealth(scope)` (rev 2) | ≤ 40 ms, one scoped query | `test:health` fixture |
| `design_genomes` | ≤ 600 rows per store, ≤ 1.8 KB per row | retention job, console tile |
| `headline_shingles` | ≤ 256 rows per (niche, store) | `syncShingles` |
| logo designer | 12 candidates ≤ 600 ms warm; WASM + fonts only on the Designer tab | `test:logo` (Node timing), manual browser check |
| admin palette | opens ≤ 50 ms warm | e2e timing |
| admin route change | ≤ 150 ms perceived (prefetch) | e2e timing |

---

## DES-§20 Copy keys and labels

Admin keys live in `src/lib/i18n/admin/<locale>/design.ts` (P6 R1, S2 R2; core §I.5 extension files). Dashboard
surfaces ship `en` in R1, `fr` in R2, `ar` in R3 (core D36); the onboarding reveal and its chips ship ar / fr / en in R1.
**Rev 2 (core §I.5, §M.5):** every publish-gate `GateItem.title` and `detail` this part emits (`design.gate.*`,
`design.slop.*`, `design.copy.*`, `design.novelty.*`), every Store Health rule text (`design.health.*`) and every
notification kind exist in **ar / fr / en** in R1, checked by `test:i18n-coverage`; no catalog value contains an em
dash or a "Step 1/2/3" label. Titles say what was measured with the value ("Page height 15,400 px at 390 · limit
15,000" is the core's budget item; this part's say "Kicker labels on 9 of 12 sections · keep up to 4").

### DES-§20.1 Message keys (en; a selection, the full list lives in the catalog)

| Key | en |
|---|---|
| `design.check.title` | Design check |
| `design.check.clean` | Nothing to fix. This page meets the design checks. |
| `design.check.blocked` | Fix these before publishing. |
| `design.check.fix` / `.fixAll` / `.ignore` | Fix · Fix all · Ignore on this page |
| `design.gate.V01` | Some text doesn't have enough contrast with its background. |
| `design.gate.V06` | {count} sections use frosted glass. Keep up to 2. |
| `design.gate.V11` | The photo in "{section}" is too small for this layout and will look blurry. |
| `design.gate.V13` | This hero needs a photo with a transparent background. |
| `design.gate.V19` | Two scrolling strips compete for attention. Keep one. |
| `design.gate.V20` | Reviews and numbers need your real data before publishing. |
| `design.gate.V22` | Move the order form higher so customers find it within the first screens. |
| `design.slop.S12` | The giant background word is clipped on small screens. |
| `design.slop.S15` | Section labels shouldn't be numbered. Use a plain topic word. |
| `design.slop.S17` | Rotating text badges look generated. We removed it. |
| `design.copy.C01` | Replace long dashes with a full stop, a comma or a colon. |
| `design.copy.C02` | "{phrase}" sounds generic. Say something specific about your product. |
| `design.copy.C08` | This headline is close to wording already live on another store. |
| `design.novelty.platform.ok` / `.close` | Distinct across the platform · Close to designs elsewhere on the platform |
| `design.novelty.niche.ok` / `.close` | Distinct in your niche · Close to other stores in your niche |
| `design.novelty.own.ok` / `.close` / `.first` | Different from your other pages · Close to one of your pages · Your first page |
| `design.differentiate` | Differentiate |
| `design.dna.refined` | Refined by the Director |
| `design.dna.engine` | Designed by the engine |
| `brand.colors.moved` | Orange isn't used on Store Gen pages, so we picked the closest allowed colour. |
| `brand.logo.empty` | No logo yet. We show this monogram until you add one. |
| `brand.logo.contrast` | Add a light version of your logo for dark backgrounds. |
| `logo.trademark` | We can't check trademarks. Make sure the name and the logo are yours to use. |
| `logo.moreLikeThis` / `.use` | More like this · Use this logo |
| `design.gate.N1` (rev 2) | This design is too close to another store's live page{clone, select, 1 {, almost identical} other {}}. Change the layout, the photo treatment or the colours to publish. |
| `design.gate.N2` (rev 2) | This page is too close to one of your other pages. Differentiate it or edit the other one. |
| `design.gate.N8` (rev 2) | "{line}" is wording that many stores in your niche already use. Rewrite it in your own words. |
| `design.gate.C5` / `V30` (rev 2) | Small labels sit above {count} of {total} sections. Keep up to {budget}; the headline alone is enough. |
| `design.gate.V25` (rev 2) | The first screen must show the product, the price, the button and the cash-on-delivery line. Shorten the headline or pick another hero. |
| `design.gate.V26` (rev 2) | {count} buttons on one page. Keep up to 6; the sticky bar counts as one. |
| `design.gate.V27` (rev 2) | Two floating layers overlap on phones. Keep one bar and one float. |
| `design.gate.V29` (rev 2) | Cards sit inside cards. Keep one ground and one card level. |
| `design.gate.V31` (rev 2) | The pack choice appears twice. Keep it in the order form. |
| `design.gate.V32` (rev 2) | The trust strip or the countdown appears more than once. Keep one. |
| `design.gate.V34` (rev 2) | The scrolling strip cuts words in half. |
| `design.gate.V35` (rev 2) | The giant background word differs from the product name. |
| `design.gate.D3` (rev 2) | This question and its answer are written in different registers. Keep one voice. |
| `design.gate.D4` (rev 2) | "{text}" is missing its article. Pick "le" or "la" for the product name. |
| `design.health.q_low` / `.slop` / `.pages_close` / `.no_dna` / `.brand_empty` (rev 2) | "{page}" scores {q} on the design check · "{page}" uses {count} generated-looking devices · "{a}" and "{b}" look alike · "{page}" was generated before design DNA · No brand colours or logo yet |

**ar / fr for the hard items (R1, `test:i18n-coverage`; the full catalog carries every key):**

| Key | fr | ar |
|---|---|---|
| `design.gate.N1` | Ce design est trop proche d'une page publiée par une autre boutique. Changez la mise en page, le traitement des photos ou les couleurs pour publier. | هذا التصميم قريب جدًا من صفحة منشورة لمتجر آخر. غيّر التخطيط أو معالجة الصور أو الألوان حتى تنشر. |
| `design.gate.N2` | Cette page ressemble trop à une de vos autres pages. Différenciez-la ou modifiez l'autre. | هذه الصفحة تشبه كثيرًا صفحة أخرى من صفحاتك. ميّزها أو عدّل الأخرى. |
| `design.gate.N8` | « {line} » est une formule déjà très utilisée dans votre secteur. Réécrivez-la avec vos mots. | «{line}» عبارة يستعملها كثيرون في مجالك. أعد كتابتها بكلماتك. |
| `design.gate.C5` | Des petites étiquettes surmontent {count} sections sur {total}. Gardez-en {budget} au plus : le titre suffit. | عناوين صغيرة فوق {count} من {total} أقسام. أبقِ {budget} على الأكثر، فالعنوان يكفي. |
| `design.gate.V25` | Le premier écran doit montrer le produit, le prix, le bouton et la ligne paiement à la livraison. Raccourcissez le titre ou choisissez un autre hero. | يجب أن تظهر في الشاشة الأولى صورة المنتج والسعر والزر وسطر الدفع عند الاستلام. قصّر العنوان أو اختر واجهة أخرى. |
| `design.gate.V26` | {count} boutons sur une page. Gardez-en 6 au plus ; la barre fixe compte pour un. | {count} زرًا في صفحة واحدة. أبقِ 6 على الأكثر، والشريط الثابت يُحسب واحدًا. |
| `design.gate.V29` | Des cartes dans des cartes. Gardez un fond et un seul niveau de cartes. | بطاقات داخل بطاقات. أبقِ خلفية واحدة ومستوى بطاقات واحدًا. |
| `design.gate.D3` | Cette question et sa réponse ne sont pas dans le même registre. Gardez une seule voix. | هذا السؤال وجوابه مكتوبان بأسلوبين مختلفين. أبقِ أسلوبًا واحدًا. |
| `design.gate.D4` | « {text} » manque d'article. Choisissez « le » ou « la » pour le nom du produit. | «{text}» تنقصه أداة التعريف. اختر «le» أو «la» لاسم المنتج. |

### DES-§20.2 Bold gene labels (onboarding chips: ar / fr / en in R1)

| Value | en | fr | ar |
|---|---|---|---|
| editorial-column | Editorial column | Colonne éditoriale | عمود تحريري |
| poster | Poster | Affiche | أسلوب الملصق |
| gallery-led | Gallery first | La galerie d'abord | الصور أولاً |
| stage | Product stage | Produit en scène | المنتج على المنصة |
| specimen | Spec sheet | Fiche technique | بطاقة تقنية |
| catalogue | Catalogue | Catalogue | كتالوج |
| split-tension | Offset split | Partage décalé | تقسيم غير متماثل |
| cinematic | Cinematic | Cinématique | سينمائي |
| quiet-luxe | Quiet luxury | Luxe discret | فخامة هادئة |
| ink+one | Ink and one accent | Encre et un accent | حبر ولون واحد |
| duotone | Two colours | Duo de couleurs | لونان |
| color-field | Colour fields | Aplats de couleur | مساحات لونية |
| tonal | Tonal | Camaïeu | درجات لون واحد |
| dark-luxe | Dark and rich | Sombre et profond | داكن وفاخر |
| high-key | Light and airy | Clair et lumineux | فاتح ومضيء |
| mono+signal | Greys and one signal | Gris et un signal | رمادي ولون إشارة |
| cutout-stage | Cut-out on stage | Détouré en scène | منتج مفرّغ على منصة |
| full-bleed-crop | Full-bleed photos | Photos pleine largeur | صور بعرض كامل |
| framed | Framed photos | Photos encadrées | صور بإطار |
| tight-detail | Close-up details | Gros plans | لقطات قريبة |
| tonal-duotone | Tinted secondary photos | Photos secondaires teintées | صور ثانوية ملوّنة |
| grid-contact | Photo grid | Grille de photos | شبكة صور |
| plain / warm / precise / bold / poetic-restrained | Plain · Warm · Precise · Bold · Sensory | Simple · Chaleureux · Précis · Direct · Sensoriel | بسيط · دافئ · دقيق · جريء · حسّي |

Type pairing chips show the real family names ("Fraunces / Readex Pro").

### DES-§20.3 Colour family words for the "why" line

| OKLCH | en | fr | ar |
|---|---|---|---|
| C ≤ 0.03, L ≥ 0.85 / mid / L ≤ 0.3 | ivory / stone / ink | ivoire / pierre / encre | عاجي / حجري / حبري |
| h 25-75, C ≤ 0.06 (warm neutral), L ≥ 0.8 / 0.5-0.8 / < 0.5 | cream / sand / cocoa | crème / sable / cacao | كريمي / رملي / كاكاو |
| h 0-25 (and 350-360), L ≥ 0.7 / below | rose / crimson | rose / cramoisi | وردي / قرمزي |
| h 75-110 | golden yellow | jaune doré | أصفر ذهبي |
| h 110-150, L < 0.5 / above | olive / lime | olive / citron vert | زيتوني / ليموني |
| h 150-185 | jade green | vert jade | أخضر يشمي |
| h 185-220 | teal | bleu canard | أزرق مخضر |
| h 220-260, L < 0.4 / above | navy / blue | bleu nuit / bleu | كحلي / أزرق |
| h 260-300 | indigo | indigo | نيلي |
| h 300-350, L < 0.45 / above | plum / violet | prune / violet | برقوقي / بنفسجي |

No orange-family word exists in the table, because no emitted colour is in the band.

### DES-§20.4 Voice register examples (brand page cards; illustrative, no claims, no numbers)

| Register | en | fr | ar |
|---|---|---|---|
| plain | Soft cotton, cut to fall straight. Delivered to your door, you pay on arrival. | Coton doux, coupe droite. Livré chez vous, vous payez à la réception. | قطن ناعم بقصّة مستقيمة. يوصلك حتى باب الدار وتخلّص عند الاستلام. |
| warm | Made for slow mornings at home, and for the people you share them with. | Pensé pour les matins tranquilles à la maison, et pour ceux avec qui vous les partagez. | مصمّم لصباحات هادئة في الدار، ولمن تشاركهم إياها. |
| precise | Stainless steel blade, balanced handle, one-piece build. | Lame en acier inoxydable, manche équilibré, construction monobloc. | شفرة من الفولاذ المقاوم للصدأ، مقبض متوازن، وتصميم من قطعة واحدة. |
| bold | Built for the long run. | Fait pour durer. | مصنوع باش يدوم. |
| poetic-restrained | Warm wood, a trace of rose, then skin. | Bois chaud, une trace de rose, puis la peau. | خشب دافئ، لمسة ورد، ثم بشرتك. |

---

## DES-§21 Interfaces with the AI layer (ai.md)

| ai.md needs | Design provides | Where |
|---|---|---|
| the closed gene vocabulary (AI-§D.3) | `GENE_VOCAB`, `DesignGenomeSchema`, `AI_REPAIR_OPS` | `src/lib/design/vocab.ts`, `gates/repair.ts` |
| Director brief intake (AI-19a, AI-D18) | `validateHints`, `applyHints`, `sampleGenome(…, { hints })` (DES-§4.6); `directorBriefInput(ctx)` = product summary (name, category, owner facts, analysis colours and materials), mood, market, locale, the ranked vibes, brand locks and `GENE_VOCAB` (never another store's data) | `src/lib/design/hints.ts` |
| copy genes for CopyRequest v2 (AI-§A.6) | `CopyDirectives.angle`, `.structures`, `.register`, `.darija` from the genome | `compile.ts` |
| cliché penalty in guard v2 (AI-§D.2 rule 6) | `clicheScore(text, locale)` | `src/lib/design/cliche.ts` |
| library alternatives with other structures (AI-§A.5) | structure-tagged `Line` entries (DES-§9.5) | `src/lib/ai/copy-library/**` |
| `genomeOf` per version (AI-§G.4) | `genomeOf(doc)` and the `published` rows with `version_id` | `derive.ts`, DES-§8.8 |
| learned priors (AI-13, R3) | G1 through `rankDirections` (the archetype score gains the capped bonus) and the other bold genes in `sampleGenome`: weights × `1 + sampleBonus(…)`, capped so the learned share stays ≤ 25 % of the rank score (R-D33); direction 3 uses the MAP-Elites cell (DES-§7.7) or, when no valid cell exists, `explorationPick` | `priors.ts` |
| gene pins and bans (AI-§G.5) | the sampler reads `platform_ai.genePins` (ban → weight 0, pin → the only value unless a hard rule refuses it) | `priors.ts` |
| critique and repair (AI-19, R3) | `critiqueSummary`, `applyOps`, the Q rule (DES-§8.9) | `gates/**` |
| store blueprint (AI-11, R2) | `compileBlueprint(blueprint) → { brand: BrandGenome; home: PlanDirectives }` validated against `GENE_VOCAB`; then DES-§14.4 | `src/lib/design/blueprint.ts` (S2) |
| logo concepts (DG-18, R3) | `LogoConceptParams` schema and the engine (DES-§13.16) | `src/lib/logo/params.ts` |
| the render digest and the candidate cards the Director reads (rethink-ai §1.2, §1.4; rev 2) | `renderDigest(doc, theme, genome, report)`, `genomeCard(g, report, bands, slot)` (DES-§8.9); the digest is the ground truth the critic must not contradict | `src/lib/design/digest.ts` |
| the closed repair vocabulary (rethink-ai §1.2; rev 2) | `AI_REPAIR_OPS` = swapVariant, changeGene, rewriteLine, dropKicker, setOpener, setAlign, moveSection, trimCopy, swapHeroFamily; `applyOps` on a sandbox copy; the Q rule (+3, no new hard item, bands stay `ok`) | `src/lib/design/gates/repair.ts` |
| the rubric v3 precedence and the compatible anti-slop items (rethink-ai §1.3; rev 2) | the ordered list of DES-§8.9 is the text ai.md's `system[1]` renders; the design part owns the list, ai.md owns the prompt | DES-§8.9 |
| the voice table (DES-§9.10; rev 2) | registers × locales × rhythm as structured data for the copy prompts and the library | `src/lib/design/voice.ts` |
| cross-store headline check (core P0 stub name) | `checkHeadlineNovelty(scope, niche, texts)` (DES-§9.8) with `{ verdict, share }` per line | `src/lib/design/headlines.server.ts` |
| the design health read (core §I.7, §K.2 P0) | `designHealth(scope)` (DES-§2.10) | `src/lib/design/health.server.ts` |
| the kicker budget the copy schema honours (rethink-ai §9.9; rev 2) | `CopyDirectives.kickers: Set<sectionId>` from G32; P7 makes `PageCopy.*.kicker` optional and the library keeps one per section | `compile.ts` |
| niche shares for anti-concentration (H33; rev 2) | `nicheShares(niche)` through `nicheSharesAction` (rounded to 5 %, k ≥ 5) | `src/lib/design/novelty.server.ts` |

---

## DES-§22 Security and isolation of design data

| Risk | Mitigation | Test (DES-§25) |
|---|---|---|
| the distance service as an oracle for another store's design | verdict bands only, no ids, no numbers, no vectors in answers (DS7); ≤ 16 candidates per call and 60 calls / 10 min per store; raw distances never persisted | `design-db-check`: answer shape identical whatever the pool; no store id or vector in any response; bucket refusal at call 61 |
| headline check as a text oracle | HMAC shingles with a server-only key, answers per line `ok` / `close`, no counts or owners; rate-limited | same; owner tags never serialised (schema test on every design response type) |
| cross-store reads outside the allowlist | only `novelty.server.ts` and the jobs track file read other stores' rows, annotated (request DES-R9); the lint pins the count | `test:tenancy-lint` |
| a tenant's genome reused as another's template | the archive holds designer seeds and counts only (DS22); exploration fixes three categorical genes, never copies a genome | static test: `src/lib/design/seeds/**` and `design_archive` writes contain no store id or genome id |
| brand assets from another store | `assertOwned(scope, "asset", ids)` on every brand write; export routes go through `storeGuard` | attack case: B binds A's asset id → `not_found`; B fetches A's logo export → 404 |
| SVG injection through logos | no SVG uploads; generated SVG from `svg.ts` only (fixed element names, numeric attributes, palette hex); names and taglines become outlines | `test:logo`: output element whitelist (`svg`, `g`, `path`), no `<text>`, `<script>`, `href`, `style` attributes or event handlers |
| prompt injection through Director hints | hints are validated values from `GENE_VOCAB`; free text (`why`) passes the guard and is rendered as text | `test:design`: invalid hints dropped, never applied |
| impersonation | every design action is a `storeAction` with a write permission (`pages.write`, `brand.write`), so read-only impersonation is refused (core §B.8) | attack suite (core) |
| purge | `design_genomes` deleted by store, `headline_shingles` by `owner_tag`, `store_themes` and brand assets with the store (core §F.9) | `design-db-check`: purge leaves 0 rows for the store's owner tag |
| a modified client that skips the wizard's gates or forges `q` / `slop` (rev 2) | the server recomputes `runGates` at save (`warn`, stores its own `q` / `slop`) and at publish (the registry); client-sent `q` / `slop` / genome tags are advisory and validated against `GENE_VOCAB`; the novelty verdict at publish is the server's | `design-db-check`: a doc posted with a fake `q = 95` stores the recomputed value; a `too_close` doc is refused whatever the client claims |
| niche shares as an oracle (rev 2) | `nicheShares` returns value → share maps rounded to 5 % over ≥ 5 stores, no ids, no counts; the same 60 / 10 min bucket as novelty | schema test on the response type; k-anonymity fixture (4 stores → empty map) |
| `platform_design` and the design flags as a bypass (rev 2) | writes need `platform.settings` / `flags.manage` (step-up for flags per core §A.3.3), are audited (`platform.design.changed`, `platform.flag.changed`); `warn` never applies to honesty items; the floors cannot be lowered from the console | `test:permissions`, `test:prepublish` (`warn` mode audits) |
| Store Health evidence leaking page content (rev 2) | `designHealth()` returns ids, `q`, `slop`, `hasLook` and pair ids only; issue texts are message keys with page titles the viewer may read anyway; no other store is ever read | `test:health-db` canary (core §J.2) |
| the `GateItem.detail` / `vars` carrying customer data (rev 2) | items carry section ids, counts, thresholds and the owner's own copy line (`N8`, `D4`) only; never order, customer or other-store data | schema test on `toGateItem` |

Attack cases are added through request DES-R13 (a `scripts/qa/tenancy-cases/design.ts` extension of the core suite).

---

## DES-§23 Back-compatibility and migration

### DES-§23.1 Documents

- `look` is optional with no default: docs without it validate and checksum as before (DS2), keep today's theme
  tokens and attributes, and change rendering only through the owner-rule fixes of DES-§4.5.4 and DS28, at their next
  render. `render-check` holds a golden HTML per baseline fixture and fails on any diff outside a reviewed allow-list
  (the listed variant redraws and the spring values).
- Docs with `look` are new (generated after the P6 merge) or upgraded by an owner remix.
- A rollback build would strip `look` on read (unknown key) and render archetype defaults: pages stay valid; R1 deploys
  are fix-forward anyway (core §H.10).

### DES-§23.2 Backfill job `design.backfill`

Per store (round-robin, ≤ 50 pages per tick, 2 s budget, cursor in `cron_cursors`): for each published page without a
live genome row → a `derived` row from `genomeOf(doc)` (live, pool) and `syncShingles`. Idempotent; finishes within a
few ticks for today's volumes; re-run automatically when `genome_v` or the token table changes.

### DES-§23.3 Other migrations

- Copy library: remove every em and en dash (fr 12, en 17, ar 4 lines today), add the structure and register tags
  (DES-§9.5), make every `fr` template article-safe (`{product:ce}` slots + name-free alternatives, D4) and move the
  `stats` figure tables to editor placeholders (DS42).
- `docs/DESIGN.md` → v3 in step C0 (DES-§3).
- `THEME_ATTR_VALUES` gains the new attributes (`data-grammar`, `data-ladder`, `data-depth`, `data-labels`, `data-align`,
  `data-img`, `data-reveal`, `data-reveal-scope`, `data-numbering`, `data-caption`, `data-corner`, `data-cta-plan`;
  `data-mask` + `rect`, `cut`); DESIGN v3 §2.5 lists them; `theme:check` compares both.
- The `brand` setting takes over the logo from the `store` setting during the R1.0 conversion (T1, DES-§2.6); the
  `voice.register` field of revision 1 never ships (DS45), so no conversion is needed for it.
- The wizard draft key moves from `sg:gen:<storeId>:v2` to `sg:gen:<storeId>:v3` when drafts carry genomes; v2 drafts
  are discarded (client-only, core §B.4).
- `SPRINGS.soft` 0.78 → 0.86 (DS28); `--ui-spring` removed from the admin CSS; the sidebar pill and generate icon become
  tweens (DS21).
- **Rev 2:** `reem-kufi` leaves every `displayAr` role of the pairing catalogue (published docs keep their own
  `ThemeSpec.fonts`, nothing live changes; a remix re-picks); `hero:scrapbook`, `problem:chat`, `faq:chat`,
  `trustBar:stamps` and `urgency:*` leave the generation pools (old docs render their redrawn forms); `OFFER_LOOK`
  becomes weights (`src/lib/generator/offers.ts:128-140`); every new section data field is optional without a default
  (DES-§4.5.1 rule), so the published checksums of the 41 baseline docs stay byte-identical (asserted by
  `render-check`); `SectionHeader.titleSplit` defaults to false (T2) and the per-word CSS stays for docs that render
  with `look.mo.scope` absent only where Latin display ≥ 48 px.

---

## DES-§24 Jobs, limits and parameters

### DES-§24.1 Jobs (`src/lib/jobs/tracks/design.ts`, core §H.2)

| Job | Every | Budget | Does |
|---|---|---|---|
| `design.reserve` | tick | 2 s | store-status reconcile and pool expiry (DES-§7.5) |
| `design.backfill` | tick until done | 2 s | DES-§23.2 |
| `design.retention` | daily 03:50 | 5 s per tick until done | DES-§2.1 retention and the 600-row cap |
| `design.shingles` | daily 04:10 | 3 s | verifies each store's sketch against its live pages and rewrites drifted ones |
| `design.archive` (R3) | daily 04:20 | 3 s | cell fill counts per niche into `design_archive` |

### DES-§24.2 Limits

| Limit | Value |
|---|---|
| directions per wizard run / attempts per direction / candidates per novelty call | 3 / 4 / ≤ 16 |
| novelty calls · headline calls per store | 60 / 10 min each (`design:novelty`, `design:headlines`) |
| headline lines per call | 60 |
| repair rounds / ops per round | 3 / 6 |
| headline resamples per line | 3 |
| studio slider steps / seed history | 5 per slider / 20 genomes |
| remix minimum own distance / seeds tried | 0.15 / 6 |
| `design_genomes` rows per store | 600 |
| shingles per (niche, store) | 256 |
| `store_themes` versions per store | 30 |
| brand gene locks (R1) | 7 genes (G12, G17, G23, G26, G27, G28, G31) |
| brand colour moves kept | 4 |
| logo names / tagline | 32 characters each |
| logo candidates generated / shown / "more like this" | 12 / 6 / 6 |
| glass surfaces per page | ≤ 2 (hard above 4, `budget:R4`) |
| `look` size | ≤ 700 B |
| in-flow sections / estimated mobile height (rev 2) | 8-14 / ≤ 12,000 px (the core refuses above 16 / 15,000) |
| primary CTAs (rev 2) | ≤ 6 incl. the sticky bar (the core refuses above 8); ≤ 2 visible at once at 390 |
| fixed layers (rev 2) | ≤ 1 bar + ≤ 1 float; fixed UI ≤ 88 px of 844 |
| reveal nodes / kinds / easing families (rev 2) | ≤ 60 / 1-2 / 1 (the core refuses above 120 nodes) |
| photo appearances per asset / hero image at the same crop / distinct crops per page (rev 2) | ≤ 3 / ≤ 2 / ≥ 3 (the core refuses above 4) |
| kickers per page (rev 2) | ≤ ⌈in-flow / 3⌉, never on two neighbours; ≥ 5 distinct openers |
| full-bleed accent / pop moments (rev 2) | ≤ 2 (color-field ≤ 4, ≤ 1 per screen; the core refuses above 4) |
| tell devices from the R8 list (rev 2) | ≤ 2 per page |
| card-grid sections (rev 2) | ≤ 3, never adjacent (hard above 5) |
| hero display at 390 (rev 2) | ≥ 44 px; display / body ≥ 2.5; ≤ 3 lines |
| Arabic display line-height / body (rev 2) | ≥ 1.25 (≥ 1.32 tall-mark faces) / ≥ 1.6 |
| display face share per niche (ar) / pairing share per archetype / Latin display family platform-wide (rev 2) | ≤ 30 % / ≤ 25 % / ≤ 20 % |
| colour strategy share per niche (rev 2) | ≤ 35 % |
| hero family share per niche (rev 2) | ≤ 30 % |
| headline shingle share in the niche (rev 2) | > 10 % soft, > 25 % hard |
| `base.css` growth from this part (rev 2) | ≤ +8 KB gz |

### DES-§24.3 Starting values to calibrate (DG-09)

Distance thresholds (0.25 / 0.40 / 0.30 / 0.35 / 0.12), band margin 0.05, slop lines 6 / 3, specificity target 0.5,
cliché re-ask line 1.0, headline Jaccard 0.5 and containment 0.35, the shingle share lines 10 % / 25 %, height-model
coefficients (incl. the fold stacks per hero family and the Arabic scale factor per pairing), the small-size hash
distance 10 bits, the Arabic lockup size ratio 110-125 %, the 0.02 novelty floor and ε 0.25, the anti-concentration
factor 0.5 (H33), the Arabic `bodyBand` proxy 0.47 × upem, the weight compensation +50 / +100, the K6 advisory band
75-95° at C > 0.10. Every one lives in `calibration.json` or `priors.ts`, never inline in code; the core's budget
thresholds live in the core's `budget-limits.ts` and are not this part's to change.

---

## DES-§25 Tests

### DES-§25.1 `npm test` (offline)

| Script | File | Checks |
|---|---|---|
| `test:design` (new; core §J.1) | `src/lib/design/selftest.ts` (+ `scripts/qa/design-check.ts` for the fixture sweep) | same seed → byte-identical genome; 11 archetypes × 3 moods × 200 seeds satisfy H01-H33; `compileGenome` never throws, `orangeMixes` empty, look ≤ 700 B; `genomeOf` consistency on the baseline fixtures (DES-§4.7); solver ≤ 200 expansions and ≤ 3 ms; hints: invalid values dropped, locks respected; distance: symmetric, `d(a,a) = 0`, range [0, 1], two stores with identical inputs ≥ 0.25 (GEN-12); N6: same (seedBase, archetype) across two fixtures → J ≤ 0.25, no shared hero + pairing + order; choreography: ≥ 100 distinct sequences over 10,000 expansions, 100 % invariants I1-I8, form ≤ 3 screens, 8-14 sections, ≤ 12,000 px; **the 140-plan sweep** (7 fixtures × ar/fr × 10 seeds): N3 ≥ 60 distinct per 100 and max 4-gram ≤ 50 %, N4 ≥ 150 tuples / 210 and ≥ 40 (hero × grammar × strategy), C1 hero family ≤ 30 % per niche, T5 / F12 concentration, K1 strategy ≤ 35 %; the rhythm planners: kickers ≤ ⌈n/3⌉ and ≥ 5 openers, photo uses ≤ 3 and ≥ 3 crops, CTAs ≤ 6, reveals ≤ 60, fold ok for every hero family × ar/fr; `estimateHeights` vs the baseline `index.json` heights within 0.8-1.25 on ≥ 90 %; gates ≤ 8 ms p95; **every design-baseline §5 hard target has a failing and a passing fixture** (DES-§8.10: the 27-section 170 KB baseline doc, the ghost-word / ring / three-glass / two-strips / numbered-eyebrow doc scores slop ≥ 6 and ≤ 2 after repair, the "X Pulse" doc, the "02 يومين" doc, the Bodoni old-style price doc, the panel → surface → card doc, the teal-on-argan pop, the 68-button doc, the 394-reveal doc, the "Ce que change Sérum" template, the MSA / Darija FAQ pair); the §6 keep-list pages pass every hard gate; repairs idempotent (repairing twice = once); copy: a 120-line cliché fixture per locale flagged ≥ 90 %, a 120-line clean fixture ≤ 5 %; `registerOf` on a 60-line labelled Darija / MSA set ≥ 90 %; normalisers (ar alef/ya/ta marbuta, fr elisions, digits); bottom-k containment within ±0.08 of exact on synthetic sets; `punctuate` table; specificity; `typeTokens` satisfies T1 / T3 / T6 / V15 for every pairing × locale; `nearestAllowed` never returns a colour in the guard band, picks the minimum ΔE among its candidates and is idempotent; chips never contain `·`; `renderDigest` fields equal the gate inputs on 20 docs; `toGateItem` ids are `design:*` and titles exist in ar/fr/en; pack/unpack round trips; the token table is append-only (snapshot) |
| `theme:check` (extended) | `scripts/check-theme.ts` | DESIGN v3 §2.5 = `THEME_ATTR_VALUES`; pairing rules F1-F13 over the catalogue (incl. no `reem-kufi` as `displayAr`); no overshoot easing outside playground (DS28); look emission for 2,000 sampled genomes keeps contrast and no-orange; the K6 advisory list is printed |
| `test:render` (extended) | `scripts/qa/render-check.ts` | golden HTML for docs without look (allow-listed diffs only; the 41 baseline docs' published checksums unchanged); the hero families `cinema`, `quiet`, `index`, `contact`, `statement` at 320 / 390 / 768 / 1440 in ar and fr; the `css` budget; landing chunk 24,200 B gz unchanged; the T1 CSS lint (`font-variant-numeric` on `.lp-price*`, `.lp-count*`, `[data-num]`); RTL1 / RTL2 / RTL3 / RTL5 regexes on the ar fixtures (`[dir=rtl]` text with "48-24"-style reversals, "02 يومين", `writing-mode` / `textPath` in ar documents, spaced punctuation in addresses); `data-reveal` count ≤ 60 on a `look` doc; T7 `<bdi>` on Latin runs in ar |
| `test:copylib` (extended) | `src/lib/ai/copy-library/selftest.ts` | 0 em / en dashes; every hero and section title tagged with structure and register; ≥ 3 structures per family × locale for hero titles; every `fr` template renders against the four `ProductRef` shapes with 0 article faults (D4); the `stats` tables are not referenced by any section renderer |
| `test:registry` (new) | `src/landing/selftest-registry.ts` | every variant declares `features`; hero variants declare `fold`; fixed variants declare `fixedPx`; decor paths exist in the variant's data schema; no pool of DES-§5.4 names a variant outside the registry; `scrapbook`, `problem:chat`, `faq:chat`, `trustBar:stamps`, `urgency:*` appear in no pool |
| `test:admin-tokens` (extended) | `scripts/qa/admin-tokens-check.ts` | DES-§16.2 contrast and no-orange checks for both surfaces and modes; `--info` present in light and dark; `--ui-spring` absent (core §J.1) |
| `test:admin-motion` (new, P2) | `scripts/qa/admin-motion-check.ts` | DES-§16.6 incl. the 400 ms rule; the two named sites (`app-sidebar.tsx:96`, `:146`) are tweens |
| `test:admin-rtl` (new, P2) | `scripts/qa/admin-rtl-lint.ts` | DES-§16.15 |
| `test:i18n-coverage` (P2, core §J.1) | `scripts/qa/i18n-coverage.ts` | every `design.gate.*`, `design.slop.*`, `design.copy.*`, `design.novelty.*`, `design.health.*` key and the onboarding reveal strings exist in ar / fr / en; no em dash or "Step n" in any catalog value |
| `test:prepublish` (maintainer, core §J.1) | `src/lib/render/selftest-prepublish.ts` | the design check is registered, refuses a `too_close` fixture with `design:N1`, lists budget + honesty + design items together, `warn` mode audits `page.publish.design_override`; the design listener never fails a publish |
| `test:health` (P1, core §J.1) | `src/lib/health/selftest.ts` | the five design rules with and without data; group cap 15; `design:pages_close` only from the store's own rows |
| `test:logo` (R2, new) | `src/lib/logo/selftest.ts` | shaping goldens (`goldens/shape.json`), SVG goldens, element whitelist, spacing clamps, move eligibility, small-size test on the golden marks, browser/Node byte-identical SVG for the same params, 12 candidates timing in Node |

### DES-§25.2 DB-backed (`npm run test:db`, `cod_test_*` databases only)

`test:design-db` (`scripts/qa/design-db-check.ts`): seeded pool of 3 stores → bands and the clone flag; reservation
transitions with store status changes (suspend, restore, close, purge); retention and the row cap; `syncShingles` on
publish / unpublish; cross-store headline containment and the N8 share (k ≥ 5 → value, 4 stores → `null`); rate-limit
refusal; the publish check writes the live row and refuses `design:N1` / `design:N2` / `design:N8` while first-come
keeps its design; the save path stores the recomputed `q` / `slop` whatever the client sent; `nicheShares` rounding and
k-anonymity; plus the design cases of the tenancy suite (DES-§22, DES-R13 accepted: `scripts/qa/tenancy-cases/design.ts`).

### DES-§25.3 e2e and local QA

e2e (core §J.3): the onboarding reveal timing (≤ 2.5 s after analysis, library copy, 4× CPU throttle), palette open ≤
50 ms, the Platform badge on every console route, the impersonation ribbon contrast; **`qa:wow-demo`** (maintainer; the
design assertions of DES-§14.8 contributed by P6); **`qa:publish-gates`** (maintainer): the design-baseline worst page
refused with `budget_blocked` items naming count, height and bytes, a `too_close` page refused with `design:N1`, the
dialog lists the fixes, `warn` publishes and audits. Local: `qa:design-corpus` (the 140-plan sweep + the 41-page render
set with the R1 visual subset, DES-§17.1, §17.5), `qa:design-report` (DS25 table + the per-target table, DES-§17.4),
the critic re-score (DES-§17.6, at R1 exit), `qa:design-visual` (R2), `qa/admin-visual/shoot.mjs --scan-only`,
`qa/verify/orange-check.mjs` on every rendered page.

---

## DES-§26 Tracks and file ownership (consistent with core §K)

| Release · track | Owns (create / modify) | Delivers |
|---|---|---|
| R1.0 · C0 (design lead, docs only) | `docs/DESIGN.md` | DG-01 (DES-§3) |
| R1 · **P6 DESIGN** | the core §K.2 P6 row (rev 2, DES-R2 accepted): `src/lib/theme/**`, `src/lib/generator/**`, `src/lib/design/**`, `src/lib/ai/copy-library/**`, `src/landing/sections/**` (except `orderForm/**`), `src/landing/styles/**`, `src/landing/registry.ts` (the `features` field), `src/landing/selftest-registry.ts`, `scripts/check-theme.ts`, `src/components/generate/**` (except `ai/**`), `src/components/builder/**` (except `ai/**`; mounts P3's `ProofAttestSheet` and P7's AI components, DES-§15.5), `src/app/app/[store]/{generate,brand}/**`, `src/components/admin/brand/**`, `src/lib/logo/{monogram-grid,favicon}.ts`, `src/lib/settings/keys/{brand,platform-design}.ts`, `src/lib/render/prepublish/design.ts`, `src/lib/health/rules/design.ts`, `src/lib/flags/defs/design.ts`, `src/lib/admin-data/search/design.ts`, `src/lib/jobs/tracks/design.ts`, `src/components/admin/shell/nav/design.ts`, `src/lib/i18n/admin/<locale>/design.ts`, `scripts/qa/design-*.ts`, `scripts/qa/tenancy-cases/design.ts`; **requested in rev 2 (DES-R18):** `src/landing/primitives/{SectionHeader,RichText,Price,Countdown,Badge,MarqueeTrack,Kicker}.tsx` | DG-02 … DG-09, SF-02, BK-1, GN-1, GH-1, TC-1, HR-1, FL-1, SP-1, RD-1 (digest and cards), DS32 favicon, the P0 stubs `GENE_VOCAB`, `sampleGenome`, `clicheScore`, `checkHeadlineNovelty`, `genomeDistance` / `checkNovelty`, `designHealth`, `estimateHeights`, `variantFeatures` (core §K.2) |
| R1 · P2 SHELL | its core §K.2 files incl. `scripts/qa/{admin-tokens-check,admin-motion-check,admin-rtl-lint,i18n-coverage}.ts`, `src/app/globals.css`, `scripts/build-admin-css.mjs`, `src/lib/admin-theme/**`, `src/components/admin/{shell,common,dashboard}/**` | DES-§16.1-16.10, §16.12 (the full address card, R1), §16.14, the Store Health ring and issue list UI, the reveal composition of DES-§14.3 (P6 supplies the generator calls and chips) |
| R1 · P1 CONSOLE | its core §K.2 files (`src/lib/health/**` engine and registry imports; the rules files belong to their tracks) | DES-§16.11, the console health ring, the `platform_design` field group placement on `/admin/settings/general` |
| R1 · P3 LANDING | its core §K.2 files: `src/lib/render/prepublish/landing.ts` (the honesty gate: I4, I5, D1, D2, LP-21), `src/landing/sections/orderForm/**` (F1 field order, F2 picker rules, F3 input boundaries, the urgency chip), `src/landing/thankyou/**` (F4), `ProofAttestSheet` | the honesty side of DES-§8.10 |
| R1 · P7 AI | its core §K.2 files: `src/lib/ai/copy-schema.ts` (kickers optional, ≤ ⌈n/3⌉), `src/lib/ai/guard.ts` (`allowedNumbers`, `BANNED`), the Director interactive pass, `design.direct`, `ad.brief` | consumers of DES-§4.6, §8.9, §9.10, §21 |
| R1 · maintainer | `src/lib/render/prepublish.ts` and `prepublish/budget.ts` + `budget-limits.ts` (core §M.2, calling `estimateHeights` and `variantFeatures`), `src/lib/page/schema.ts` (`ThemeLook`, DES-R1), `src/landing/document.tsx` (`brandIcon`, DES-R11 CCR), `budgets.json` (`css` key, DES-R5), `scripts/qa/{wow-demo,publish-gates-e2e}.ts` | DES-§8.10 budget rows, DES-§14.8 |
| R2 · **S2 BRAND & LOGO** | `src/lib/logo/**` (takes over the R1 files), `src/lib/design/{brand,registers,effective,email,blueprint,store-theme.server}.ts`, `src/app/app/[store]/brand/**`, `src/components/admin/brand/**`, `src/app/api/app/[store]/brand/**`, `scripts/build-logo-fonts.mjs`, `scripts/qa/design-visual.mjs` | DG-10 … DG-14, DES-§11, DES-§14.4, DES-§18 |
| R2 · S1 STOREFRONT | storefront.md files; registers page-kind grammars and calls `compileRegister` / `effectiveTheme`; mounts the AI-19 "Director review" button in the builder (core §K.4) | DES-§5.6, §11 consumers, §8.9 button |
| R2 · S7 AI DATA | preview rasterisation and tiles, verify round 2, `recordPublishFeedback` (core §K.4) | DES-§8.9 tiles (RD-1 R2), DES-§2.8 |
| R2 · S6 PLATFORM UX | P2's admin files | UX-04, UX-06 (DES-§16.13, §16.16) |
| R3 · D4 LEARNING | `src/lib/design/{archive,novelty-budget}.ts`, `src/lib/design/seeds/**`, `src/landing/sections/**` (arrangements), `src/lib/logo/{bilingual,symbol}.ts`, the generation studio (DG-12 sliders, seed history; DES-§14.5) | DG-12 (studio), DG-15 … DG-18 |
| R3 · D5 PLATFORM | admin RTL files | UX-07 push, UX-08 Arabic dashboard |
| core maintainer | `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `src/lib/page/schema.ts`, `src/landing/runtime/budgets.json`, `src/landing/document.tsx` (R1 read-only), registries | DES-§27 |

Merge order (core §K.2): DG-01 in C0; P8 → P2 → P1 → P5 → P4 → P3 (wave 1) → P7 → **P6** (design last: it changes
generated output everywhere; `useAiTask` exists for GH-1) → P3 wave 2 (needs P6's structure tags for the Campaign Kit
brief) → integration; the DG-09 corpus, the per-target report and the critic re-score run on the merged build before
R1 exit (core exit criteria 9, 10, 12).

---

## DES-§27 Requests to the core

### DES-§27.1 Revision 1 requests and how the core decided them (core §Q.6)

Every request below was **accepted**; three with a change: DES-R1 (A\*: the one additive, optional, default-free PageDoc
change of R1, applied by the maintainer in C0, 0 changed checksums asserted), DES-R3 (A\*: merged with LAN Q13 into one
registry `src/lib/render/prepublish.ts` with the shared `GateItem` type and the three codes; DES-§8.8 follows it),
DES-R9 (A under D64: pinned at 3 annotations). DES-R6, DES-R7 (logo parts), DES-R14 are R2. Where this revision's text
differs from the request wording, this revision follows the core (the appendix wins until the part's next revision,
core §Q).

| # | Change | Why |
|---|---|---|
| DES-R1 | `src/lib/page/schema.ts`: add the constants of DES-§4.1 that the doc uses (`GRAMMARS`, `COLOR_STRATEGIES`, `TREATMENTS`, `LADDERS`, `DEPTHS`, `MASKS`, `EASE_FAMILIES`, `REVEALS`), the `ThemeLook` object of DES-§4.5.1, and `look: ThemeLook.optional()` in `ThemeSpec` (no default). Frozen-contract change; `render-check` and the published-checksum boot task must show 0 changed checksums on existing docs | DS2: the compiled genome must travel with the doc (re-renders, exports) without touching old docs |
| DES-R2 | Core §K.2 P6 row: add the files listed in DES-§26 (P6 "plus by request"); P2 row: add `scripts/qa/admin-motion-check.ts`, `scripts/qa/admin-rtl-lint.ts`; core §K.4 S2 row: the S2 list of DES-§26; register the extension files `src/components/admin/shell/nav/design.ts`, `src/lib/i18n/admin/<locale>/design.ts`, `src/lib/jobs/tracks/design.ts`, `src/lib/settings/keys/{brand,platform-design}.ts` in their registries | `/brand`, the generate route actions and the registry `features` field have no owner today; tracks never edit registries (core §K.3) |
| DES-R3 | New core file `src/lib/render/prepublish.ts` (registry of DES-§8.8: `registerPrePublishCheck`, `registerPublishListener`), called by `publishPage` before the version row is written (checks) and after commit (listeners, also by `unpublishPage`); importing `src/lib/render/prepublish/<track>.ts`. Add the action error code `design_blocked` with a typed `items: GateItem[]` payload to the `storeAction` error mapping (core §E.2) and the audit action `page.publish.design_override` | DS10: the server must re-check designs at publish; listeners keep `design_genomes` and `headline_shingles` live without touching T3's publish code again |
| DES-R4 | (A, R2) the render context builder loads the active store theme (`store_themes` where `active_key = store_id`, cached with the store row, invalidated on activation) and calls `effectiveTheme(doc, page.theme_mode, active)` (DES-§11.5) before `buildTheme`; (B, R1) a logo, mark or store-name change enqueues `render_jobs` reason `brand` for every live page (core §H.3 currently says brand is R2) | one brand across live pages without changing docs or checksums (core D50) |
| DES-R5 | `src/landing/runtime/budgets.json`: a key `css` = the inlined CSS of the heaviest baseline page (gzip) + 4,096 B, enforced by `render-check` | DS24 |
| DES-R6 | R2 packages (maintainer installs, versions pinned exactly after the S2 spike verifies size, licence and Node 22 / browser behaviour): `harfbuzzjs` (shaping, outlines) and `clipper-lib` (boolean ops and offsets) | DS18, DS19 |
| DES-R7 | `package.json`: R1 scripts `test:design`, `test:registry`, `test:admin-motion`, `test:admin-rtl` added to `npm test`; `test:design-db` added to `test:db`; `qa:design-corpus`, `qa:design-report`; R2: `node scripts/build-logo-fonts.mjs` appended to `prebuild` and `predev`, `test:logo` in `npm test`, `qa:design-visual`. `.gitignore`: `public/logo-fonts/`, `qa/design-corpus/fixtures/`, `qa/design-corpus/review/`, `qa/design-visual/out/` | the core owns `package.json` (core §K.3) |
| DES-R8 | Platform settings registry: key `platform_design` (schema file owned by design, DES-§2.7); audit action `platform.design.changed`; a console field group on `/admin/settings/general` or the AI page (platform.md places it) | thresholds and the novelty / publish-gate switches must be changeable without a deploy |
| DES-R9 | Tenancy lint allowlist (core §E.3 rule 6, §F.1 L1/L10): `src/lib/design/novelty.server.ts` (annotation `// tenancy: platform design-novelty`) and `src/lib/jobs/tracks/design.ts` (`// tenancy: platform design-reserve`), read-only cross-store queries, pinned count 3 | the novelty pool must read other stores' vectors server-side (R-D36) |
| DES-R10 | Cut the tables with the refinements of DES-§2.1 (`design_genomes`: `source`, `genome_v`, `seed`, `q`, `slop`, `report`, `novelty`, `pool`, `updated_at`, three indexes), DES-§2.2 (`headline_shingles.kind`, `hs_niche_owner_idx`), DES-§2.3 (`store_themes`: `status`, `active_key` + unique, `note`, index) and DES-§2.4 (`design_archive`: `seed_id`, `filled`, `best_q`, `updated_at` instead of `genome_id`, `score`) | core §D.9 lets design refine them; the maintainer writes the migrations |
| DES-R11 | `src/landing/document.tsx` (read-only in R1 product): replace `faviconHref` (lines 189-201) with `brandIcon(ctx, theme)` from `src/lib/logo/favicon.ts`; in R2 add `<link rel="apple-touch-icon">` when the `apple-touch` export exists | DS32, DES-§13.14 |
| DES-R12 | `getHealth()` (core §H.5) adds the sizes of `design_genomes` and `headline_shingles` and an alarm at 300 MB | DES-§2.1 retention visibility |
| DES-R13 | `scripts/qa/tenancy-check.ts` imports every `scripts/qa/tenancy-cases/*.ts` (each exports cases with the suite's helpers) | the design attack cases (DES-§22) without editing a T4 file |
| DES-R14 | (R2) media pipeline option `keepPng` for brand exports and PNG renditions of uploaded logos: PNG master ≤ 1200 × 630 and ≤ 300 KB, no WebP/AVIF variants, served as `image/png`, `asset_refs` owner kinds `brand` / `store_theme` | iOS home-screen icons and e-mail clients need PNG (`src/landing/document.tsx` comment; DES-§18) |
| DES-R15 | `AuditAction` union (core §F.5): `store.brand.updated`, `store.theme.activated`, `page.publish.design_override`, `platform.design.changed` | audit coverage of brand, theme and gate overrides |
| DES-R16 | Store settings registry: the `brand` key uses the schema of DES-§2.6 from R1.0; the R1.0 conversion copies the `store.logo` field into `brand.logo.primary` and removes it from `store` | core §D.10 row `brand` / `store` |
| DES-R17 | Core text updates for revision 2: §I.6 names IBM Plex Sans Arabic as the admin Arabic face (DS21), removes `--ui-spring`, and lists `test:admin-motion` / `test:admin-rtl` beside `test:admin-tokens`; §H.3 notes the R1 identity re-render (DES-R4 B); §F.2 "cross-tenant design checks return scores only" becomes "return verdict bands only" (DS7) | keep the core and this part consistent |

### DES-§27.2 Second-round requests (revision 2; only what this revision could not avoid)

| # | Change | Why |
|---|---|---|
| DES-R18 | Core §K.2 P6 row: add `src/landing/primitives/{SectionHeader,RichText,Price,Countdown,Badge,MarqueeTrack,Kicker}.tsx` (today `src/landing/primitives/**` is in no track's list, so it is read-only in R1 product). Needed for: the opener grammar (`SectionHeader.opener`, C5 / S18), whole-line reveals and Arabic particle binding (`RichText`, T2 / S19), `<bdi>` isolation (T7), the price cluster and tabular numerals (`Price`, T1 / RTL4), the Arabic plural forms and LTR groups (`Countdown`, RTL1 / RTL2), the removal of the text ring (`Badge`, S17 / RTL3), word-safe marquee tracks (`MarqueeTrack`, I7 / RTL6). Every change is additive (new props, defaults = today's output for docs without `look`) and covered by `render-check` goldens. Alternative if refused: the same edits as seven CCRs applied by the maintainer in the P6 merge week | six baseline hard targets (T1, T2, T7, RTL1, RTL2, RTL3) and two soft ones (C5, I7) live in these primitives; core §M.4 lists T1-T3, T7 and RTL1-RTL7 as hard design gates at publish |
| DES-R19 | Core §K.2 P0 stub list: add `estimateHeights(doc, opts): HeightReport` and `variantFeatures(type, variant, data): VariantFeaturesResolved` to the design stubs (core §M.2 names them as the budget gate's measurement: "the design height model (`src/lib/design/heights.ts`, DES-§5.3)" and "section variant features (DES-§8.4)"), with the `HeightReport` / `FoldReport` / `VariantFeaturesResolved` types frozen at P0 so `prepublish/budget.ts` compiles against them before P6 merges | the budget gates are the core's and merge before P6 (P8 → … → P6); they need typed stubs on day one |
| DES-R20 | `src/lib/ai/copy-schema.ts` (P7): confirm the kicker fields become `.optional()` in the loose and strict `PageCopy` schemas and that `mergeAiCopy` drops a kicker for sections whose `CopyDirectives.kickers` excludes them (rethink-ai §9.9 names P7; this revision's G32 depends on it) | one source for the kicker budget; without it the library's kicker string would render on every section again |

---

## DES-§28 Review decisions

(Empty in revision 2. Filled after the reviews: each row = reviewer, point, decision, section changed.)

---

## DES-§29 Elevation changes (rev 2)

Every change of this revision, what it does and where it came from. Codes: **DS** = a decision of DES-§0, **core** = a
section or decision of `docs/STORE-SAAS.md` revision 2, **Q.6** = the core's decision on a revision 1 request, **DB** =
a design-baseline §5 target or §4 root cause, **RA** = rethink-ai section, **RF** = rethink-features section, **rubric**
= `qa/ref/anti-slop-frontend-rubric.md`.

| # | Change | Why | Source |
|---|---|---|---|
| 1 | Status → revision 2; inputs widened to core rev 2, the baseline, the two rethinks and the rubric; code facts re-verified at `a0ffec1`; reading order through the coverage map | brief item 16; the part must be built against the core's decisions, not its own requests | header; core §Q.6 |
| 2 | Owner summary items 11-15 (measured findings, budgets, Arabic type, Cloud AI off, the re-score) | the owner reads this first | DB §2, §5; RF §4 |
| 3 | DS1 35 genes (four rhythm genes G32-G35); DS6 hard N1/N2 at publish with first-come and "never shown"; DS10 one registry and the owner split; DS12 slop tells S19-S26 and the tell budget; DS21 the admin no-bounce sites named with lines, `--info` 250, the 400 ms rule; DS25 the three target groups incl. the ≥ 7.5 / ≥ 8 re-score; DS31 DG-12 sliders → R3 | align with core D51, D52, D60, §L.2, §M; make the baseline's rhythm faults planner decisions | core §0, §I.6, §L.2, §M.4; DB C5, I1, R1, R5, R8; RF §3.3 |
| 4 | New decisions DS33-DS46: every §5 target a gate with one owner; engine authors / model directs with rubric v3 and the digest; kicker budget and opener grammar; photo-use plan; the typography engine; seven colour strategies and the surface system; motion signatures as tokens; the CTA plan; the fold contract per hero family; structural honesty of devices; verification = the baseline method; one Arabic register and French article metadata; one voice source; design rules in Store Health | the heart of item 16: raise the ceiling concretely and make the root causes impossible | DB §4, §5; RA §0.1, §1.1-1.3, §9.9; RF §1.2, §1.3; core D53, D59, §D.10 (AI R24), §I.7 |
| 5 | DES-§1 rows re-scoped with measurable acceptance (N3-N6 in DG-02 / DG-04, T4-T6 in DG-08, the re-score in DG-09, DG-12 R1 / R3 split, UX-05 R1 P2); new rows SF-02, TC-1, HR-1, FL-1, SP-1, RD-1 | every feature id of the area and the SF item the core assigned, with a checkable acceptance | core §L.2, §K.2 P6 row; RF §1.2, §3.2 |
| 6 | DES-§2: `BrandSetting.logo.wordmark`, voice derived from `store_ai` (`brandView`), `platform_design` with its flag mirror and floors; new §2.9 flags file, §2.10 health read API; §2.8 provenance columns | one source of truth per setting; the core's flag and health registries | core §D.4, §D.10, §I.7; AI R24; RA §5.6 |
| 7 | DES-§3: the budgets table doubled (sections, height, form, fold, CTAs, floating layers, reveals, photo appearances, moments, surface levels, kickers, openers, picker, trust / countdown, card grids, tells, weight) with the baseline value per row; tells list extended; banned list extended and "what modern means" per axis | DESIGN.md v3 is the bible every build agent reads; the baseline named the faults | DB §3, §5; rubric §4.7, §9.F |
| 8 | DES-§4: `GeneKey` 1..35, `PageGenes` G32-G35 with `PhotoPlan` / `CtaPlan` / `RevealPlan` / `Opener`; gene table rows; hard rules H25-H33 (pop derivation, surface levels, base from photo, fold, openers, photo plan, CTA plan, reveal plan, type concentration); `ThemeLook.mo.scope` and `locks`; the optional-without-default rule for section data; the variant additions table (9 hero families with props, CSS gz, RTL notes, track; the primitives changes; redraws; pool removals); module layout (+ `openers`, `photos`, `cta`, `reveals`, `heights`, `typography`, `digest`, `health.server`); new §4.10 colour strategies and surfaces, §4.11 imagery pipeline, §4.12 motion signatures | brief (a), (b), (d), (e), (f); the baseline's K, I, R, T rows | DB §3.3-3.6, §5.2-5.6; RA §1.4; DESIGN.md §5-§6 |
| 9 | DES-§5: the grammar with a variable tail, `Objection`, free Act2 permutations and the 4-gram re-draw; invariants I7 (fold) and I8 (8-14 / 12,000); the frozen `estimateHeights` API for the core's budget gates; pools with the new hero families and the pool removals; expansion step 3 (rhythm planners); new §5.7 distinctness by construction (N3-N7), §5.8 openers, §5.9 CTA plan, §5.10 photo plan, §5.11 reveal plan, §5.12 fold contract | DB §4.2 root causes 4, 5, 9 and the targets N3-N7, C1-C3, C5, I1-I2, R1, R5, R7 | DB §4-§5; core §M.2 |
| 10 | DES-§7: `novelty-pool` cache name, `nicheShares` for anti-concentration, the flag mirror; §7.8 rewritten as the publish-time distance gates (`design:N1`, `design:N2`, `design:N8`, first come, soft notes) | core §E.6 named the cache; core §M.4 made N1/N2/N8 hard | core §E.6, §M.4; Q.6 DES-R3, DES-R9 |
| 11 | DES-§8: `GateInput` with facts / heights / novelty; `DesignGateItem` + `toGateItem` to the core's `GateItem` with `design:<target>` ids; gates V25-V37 and the owner split annotations on V06, V14, V19-V24; slop S19-S26; `VariantFeatures` with `ctas`, `cardGrid`, `picker`, `fixed`, `revealNodes`, `fold`, `openers`, `textRuns`; repair ops (+ 9) and plan rows; run contexts (save, re-render, export); §8.8 rewritten on the core registry; §8.9 rewritten as the Director interface (digest, cards, rubric v3 precedence, repairs, tiles, engine-only guarantee); new §8.10 the coverage map (66 ids), §8.11 health rules, §8.12 root causes → construction | brief (i) and the "adopt EVERY §5 target as a gate" instruction; RA's division of labour | core D51, §M.1-M.5; DB §4.2, §5; RA §1.1-1.4, §1.7, §9.11 |
| 12 | DES-§9: structure detectors `register` (D3) and `article` (D4); `Line.r`, `ProductRef` without a doc change; `checkHeadlineNovelty` (the core's stub name) with the N8 share; `numbersReport`, `registerOf`, `articleCheck`; new §9.10 the voice system (registers × locales × rhythm × Darija ratio) and §9.11 honesty of numbers (who refuses) | brief (g); the baseline's D3-D6 and the owner's natural-language rule | DB §3.7, §5.7; core §M.3; DS44, DS45 |
| 13 | DES-§10: rules F11-F13 (no Reem Kufi display, concentration, metric-driven Arabic leading); eight catalogue rows re-pointed; new §10.5 the typography engine (fluid scale, Arabic size and weight harmonisation from metrics, tracking per size, leading per script, balanced whole-line breaking with particle binding, tabular lining numerals, measure, bidi isolation, underline offset) | brief (c); the baseline's T1-T8 | DB §3.2, §5.3; DESIGN.md §2.3; `fonts.generated.ts:19-29` |
| 14 | DES-§11 registers with reveal scope, CTA plan and openers per register; DES-§12 Voice tab as a view over `store_ai`; DES-§13 the accepted R2 packages, build step and PNG path noted, the designer's bar restated | brief (j), (k); core §K.4, §Q.6 | Q.6 DES-R6, R7, R14; AI R24 |
| 15 | DES-§14: step 3 with rhythm planners and budget estimates, step 5 never shows `too_close`, step 7 `checkHeadlineNovelty`; the 1.5 s Android target; D59 "no download"; §14.5 R1 / R3 split; §14.7 Bolder / Calmer defined, "Upgrade to design DNA"; new §14.8 the engine-only guarantee and the wow-demo assertions | the demo is the R1 acceptance and runs with Cloud AI off | RF §4; core D59, §K.2 exit criterion 12; DS34 |
| 16 | DES-§15: panel groups with budget and honesty items and live budget meters; DNA card locks (`look.locks`, brand locks) and provenance line; new §15.5 mounts and extension files (ProofAttestSheet, P7 components, the search provider, nav, i18n) | core §I.3-I.4 extension points; LAN Q31, AI R15 | core §K.2 P6 row, §K.3 |
| 17 | DES-§16: `--info` at 250, the data-viz set; the two named admin motion sites with their exact replacement, the 400 ms rule; KPI `:92` cite and "placed / confirmed / delivered never share a tile"; §16.12 the full address card in R1 (P2); §16.16 table per track | the admin had the tells the owner banned; UX-05 raised | core D60, §I.6, §I.8, §L.2; RF §2.1, §2.5, §2.6, §3.2; OPE Q.16 |
| 18 | DES-§17: the baseline sweep and render set with the extended `index.json` and `index.baseline.json`; the per-target report; the R1 visual subset (clip, overflow, fold, fixed heights, RTL regexes); new §17.6 the critic re-score with its targets and cadence | brief (i): the harness that found 4.3 must find ≥ 7.5 | DB §1, §5.10; core §J.3, §K.2 exit criterion 10 |
| 19 | DES-§19 budgets (+ 9 rows), DES-§20 ar / fr / en gate titles and the new keys, DES-§21 interfaces (+ 9 rows), DES-§22 security (+ 6 rows), DES-§23 back-compat items, DES-§24 limits (+ 15 rows) and starting values, DES-§25 tests (every §5 hard target as a fixture; `test:i18n-coverage`, `test:prepublish`, `test:health` rows), DES-§26 tracks per the core's rows (P6 incl. health / flags / search; P3, P7, maintainer, S1, S7 rows) | coherence: limits, tests, ownership and keys all follow the new gates | core §I.5, §J, §K.2, §K.3 |
| 20 | DES-§27 split into §27.1 (how the core decided) and §27.2 (three second-round requests: primitives to P6, the budget-gate stubs, the kicker schema confirmation) | the brief asked for second-round requests only where unavoidable | core §Q.6 |

Second-round requests to the core (DES-§27.2): **DES-R18** `src/landing/primitives/**` (seven files) added to the P6
row, or the same edits as maintainer CCRs; **DES-R19** `estimateHeights` / `variantFeatures` typed stubs in the P0
list; **DES-R20** P7's kicker-optional confirmation.
