# Store Gen SaaS part spec: design (genome, anti-repetition, quality gates, brand kit, logo designer, generation flows, admin design system)

Status: **part spec, revision 1** (2026-10-24, design part architect). Not yet reviewed (DES-§28 is empty). Built on
`docs/STORE-SAAS.md` revision 1 (the core contract, cited as **core §X**) and on the settled research decisions of
`docs/saas/RESEARCH.md` §2 (cited as **R-D1 … R-D53**). It covers every design feature id **DG-01 … DG-19** and every
admin design-system id **UX-01 … UX-08** (RESEARCH §3.9, §3.10) with scope, release and acceptance criteria. Section ids
carry the prefix **DES-§** so cross-references to the core (`core §E.2`) and to the sibling part specs (`ai.md AI-§A.6`,
`platform.md §22.2`, `storefront.md`, `landing.md`) stay unambiguous.

This document may refine only the tables core §D.9 assigns to the design part (`design_genomes`, `headline_shingles`,
`store_themes`, `design_archive`, `gene_stats_*` shared with ai) and the schema of the store setting `brand` (core §D.10).
Everything else it needs from the core (a frozen-schema change, file ownership, hooks, packages, a budget key, a lint
allowlist, a platform setting) is listed in **DES-§27 Requests to the core** with the exact change. Nothing here edits
the core.

Inputs: `docs/STORE-GEN-BRIEF.md` items 4, 8, 14, 15, 16 · `docs/HANDOFF.md` §2 (owner rules) · core (mostly §A.3, §D,
§E, §F.1, §G, §H.3, §I.3-§I.6, §J, §K) · RESEARCH §2-§4 · `docs/saas/research/design-gen.md` (the area study, cited
**dg §x**) · `docs/saas/research/ai.md`, `storefront.md`, `platform-admin.md` · `docs/saas/TENANCY-MAP.md` (GEN-01 …
GEN-14) · `docs/saas/spec/ai.md` revision 1 (AI-D18 Director brief, AI-§A.6 CopyRequest v2) · the anti-slop rubric
`qa/ref/anti-slop-frontend-rubric.md` §9 (owner rules win over it) · the baseline renders in `qa/saas-baseline/`
(git-ignored; 41 documents, 111 shots, rendered 2026-10-23). Code facts are `path:line` at commit `15c9cef`. Next.js is
16.4: nothing in this part touches `src/proxy.ts`, routing or the request hook; server actions follow core §E.2.

Reading order for a build agent: DES-§0 (decisions) → DES-§1 (your feature rows) → the track you own (DES-§26) → the
sections your files touch → DES-§25 (tests you must keep green) → DES-§27 (what the maintainer still has to give you).

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

---

## DES-§0 Decisions at a glance

R-D35 … R-D41 are the design decisions this spec builds on, adopted as settled; R-D33 (gene statistics) and R-D37
(cross-tenant headline check) are shared with ai.md. Rows marked **refines** or **deviates** say why.

| # | Decision | Why |
|---|---|---|
| DS1 | **Design Genome v1 = 31 genes** (G1 … G31) in three levels: brand (store-stable), page (per generation), section (per instance). The archetype becomes gene G1 `vibe`, a **prior** over the other genes, never a lock (R-D35, GEN-06). | Sameness comes from archetype locks (`src/lib/theme/tokens.ts:419-433`), 3 storylines (`src/lib/generator/plan.ts:90-97`) and sibling-only anti-repeat (`src/lib/generator/directions.ts:455-470`); dg §0.1. |
| DS2 | **Where the genome lives:** the full genome (all 31 genes, seed, explanation) is a row in `design_genomes`; the **render-relevant part compiles to an optional `ThemeSpec.look`** (≤ 700 B JSON, no default) inside the PageDoc. **Deviates R-D35** (which put `PageDoc.design.genome` in the doc): only the compiled look enters the doc. | The PageDoc is frozen and `z.object` strips unknown keys; an optional field without a default leaves every existing doc's validated JSON, and so its published checksum (`src/lib/db/boot-tasks.ts:24-47`, sha256 of `validateDoc(doc)`), unchanged. The doc stays self-contained for re-renders (core D50) and exports; the genome row is history and the novelty index. Request DES-R1. |
| DS3 | **Bold genes are sampled, the rest are solved.** Six bold genes (G1 vibe, G2 composition grammar, G4 type pairing, G9 colour strategy, G18 image treatment, G28 voice register) are drawn from priors; the other 25 come from a seeded, deterministic constraint solver (forward checking + backtracking, ≤ 200 node expansions, cheapest gene first). | dg §0.3: designers make a few strong decisions and keep the rest quiet; many independent random knobs give noise (R-D35). |
| DS4 | **Precedence at render:** an explicit non-`"archetype"` ThemeSpec value (today's builder fields `radius`, `shadow`, `texture`, `surfaces`) > `look` > the archetype default. A doc without `look` keeps today's theme tokens and `<html>` attributes; only the owner-rule fixes of DES-§4.5.4 (redrawn seal/stamp/tape/ticket variants, no rotating ring, no numbered cover lines) and DS28 (spring overshoot) change how it renders, at its next render (DES-§23.1). | Back-compat for every published page; the builder keeps working while it learns to edit `look`; owner rules apply to old pages too. |
| DS5 | **Seeds mix the store's brand seed:** `seed = deriveSeed(stores.brand_seed, inputHash, "direction:<i>", attempt)`. | Identical photos in two stores diverge (GEN-12, R-D36). |
| DS6 | **Distance thresholds** (starting points, calibrated by DG-09): platform-wide d ≥ **0.25**, same niche d ≥ **0.40**, pages of one store d_page ≥ **0.30** (against its last 10 pages), campaign brand radius d_brand ≤ **0.35**, cross-store **clone block** d < **0.12** at publish. (R-D36) | R-D36 numbers, plus a clone floor so that a near copy of another live store can never be published, while an owner's own edits are never blocked between 0.12 and the thresholds (they get a warning and a one-click "differentiate"). |
| DS7 | **The distance service answers verdicts, not numbers:** clients get `ok` / `close` / `too_close` per candidate; raw distances stay on the server (logs, calibration). Requests are rate-limited per store. **Refines R-D36** ("returning scores only"). | A numeric distance oracle can be probed to reconstruct another store's vector; a coarse verdict can't. core §F.2 ("cross-tenant design checks return scores only") is kept in spirit and tightened. |
| DS8 | **Cross-store checks read only live and reserved genomes** (published pages, active store themes). Generated-but-unpublished rows influence only their own store. A genome stays reserved 90 days after its store leaves `active`/`restricted`. | First-come fairness (R-D36) without letting a tenant flood the index from the wizard. |
| DS9 | **Headline check = bottom-k MinHash** (k = 256) per (niche, store) over HMAC'd word-3-gram shingles in `headline_shingles`; in-store Jaccard > 0.5 and cross-store containment > 0.35 resample generated copy. Owner-typed copy is only flagged. (R-D37, core D35) | Bounded rows per store (≤ 256 per niche; a store's live headlines rarely exceed 300 shingles, so most sketches are exact), no plaintext, no store id (only the opaque `owner_tag`), deletable at purge. |
| DS10 | **Quality gates are pure TypeScript** on `PageDoc + BuiltTheme + asset metadata + genome`, ≤ 8 ms per doc in Node. They run in the wizard and the builder (client) and **authoritatively at publish** (server, through a pre-publish check hook, request DES-R3). Hard fails block publish; soft items lower the score. (R-D39) | No headless browser on Hostinger; the server re-check means a modified client can't publish a failing page. |
| DS11 | **Deterministic repairs first**, from a closed `RepairOp` vocabulary, at most 3 rounds, keep the best of {original, repaired} by score; AI critique (AI-19, R3) proposes ops from the same vocabulary and is kept only when the score rises. | R-D39; dg §5.4. One vocabulary for rules, the local model and the Director. |
| DS12 | **Slop score** = the dg §5.2 list **plus seven tells seen in the baseline renders** (giant ghost word, rotating-text ring badge, masthead/number eyebrows, glass callouts piled on the hero photo, decorative status dots, two scrolling strips, identical section headers). ≥ 6 fails, 3-5 triggers repair. **Refines R-D39.** | `qa/saas-baseline/shots/argan-default-ar-s7-mobile-fold.png` and `…-s4242-…` show the same composition across seeds; `tshirt-kinetic-ar` shows a rotating-text ring and a clipped Arabic ghost word; `argan-editorial-ar` shows "الإصدار 01 · العناية" (the "Brand · No. 01" tell, rubric §9.F). |
| DS13 | **Em and en dashes are not used as separators in generated copy**; the cliché detector rewrites them (period, comma or colon by context). Owner-typed text is flagged, never rewritten. **Refines DESIGN.md §8.** | The rubric's #1 tell (§9.G); today's library has them ("Douceur, confort, éclat — au quotidien", `src/lib/ai/copy-library/fr.ts`). |
| DS14 | **DESIGN.md v3** turns the 2026 tells into **budgets** (glass ≤ 2 per page, a 4-tier radius ladder, 1 hero signature + ≤ 3 secondary details, bento ≤ 1, ≤ 2 centred sections in a row, no bounce outside `playground`, …) and removes every orange colour word. Written in core step C0 by the design lead. (R-D38, DG-01, GEN-14) | Every generator and build agent reads the bible first; the old one prescribes several tells (dg §0.2). |
| DS15 | **Store coherence:** one Brand Genome per store across three registers (marketing, commerce utility, transactional); landing pages choose `store` (inherit) or `campaign` (page genes vary within d_brand ≤ 0.35). In R1 (landing-only stores) the brand kit's locks feed every new generation. (R-D41) | One brand everywhere while landing pages keep varying. |
| DS16 | **Brand kit storage:** R1 = store setting `brand` (logo asset ids, colour and font locks, voice pointer); R2 = versioned `store_themes` rows (Brand Genome, compiled theme, locks, logo parameters and export asset ids). A brand change in R2 enqueues `render_jobs` reason `brand` for every live inherit page (core §H.3). | Setting first keeps R1 small; versions make R2 brand changes reversible and auditable. |
| DS17 | **No-orange brand colours** (core D37, `allowSellerBrandOrange = false`): `nearestAllowed(hex)` moves a picked or extracted colour out of OKLCH hue 25-75° (chroma > 0.06) to the side with the smaller ΔE OKLab, or drops chroma to 0.06 ("sand") when that is closer; the UI shows the before/after swatch and a one-line note. An uploaded logo file is never recoloured; the palette taken from it is. | Owner rule 1 and the lead default. |
| DS18 | **Logo engine = harfbuzzjs shaping on the shipped OFL fonts, converted once from WOFF2 to SFNT at build time** (`scripts/build-logo-fonts.mjs`), outlines to SVG paths, deterministic and isomorphic (browser preview, Node export from parameters). Never live text. (R-D40) | HarfBuzz is the only correct Arabic shaper (opentype.js has no joining, dg §7.2); HarfBuzz reads SFNT, not WOFF2; the 27 fonts already ship (`src/lib/theme/fonts.generated.ts:50`), so no font download is needed. Request DES-R6 (package) and DES-R7 (prebuild). |
| DS19 | **Craft moves come in two tiers:** contour moves (tittle swap, weight shift, baseline shift, counter accent, ligature join) need no boolean geometry; cut moves (stem cut, terminal trim, monogram interlock) use `clipper-lib` on flattened outlines. Until the package lands, cut moves are disabled and the engine still offers five moves. | Robust boolean ops are hard to hand-write; Clipper is zero-dependency integer geometry. The designer never waits on it. Request DES-R6. |
| DS20 | **PNG exports use `sharp`** (already a dependency, `package.json`) to rasterise path-only SVG. **Deviates dg §7.1** (`@resvg/resvg-js`). Fallback: the browser rasterises with canvas and uploads through the media pipeline. | No new native binary on Hostinger (resvg's prebuilt binary is unverified there, RESEARCH §6.2); path-only SVG needs no font loading. |
| DS21 | **The admin design system has one source:** a 3-input OKLCH generator (base hue, accent, contrast) produces every admin token at build time in `scripts/build-admin-css.mjs` (core §I.6); surfaces tenant (jade 166), console (teal 205), impersonation (violet 295); **no bounce**: `--ui-spring` (`src/app/globals.css`, `cubic-bezier(0.34, 1.36, 0.64, 1)`) is removed. Arabic UI face = **IBM Plex Sans Arabic** (400/500/700, already in `public/fonts`). | Linear's method (dg §9); core §I.6 asks design.md to pick the Arabic face; Plex Arabic is a UI face with compact proportions at 13-14 px and ships today. |
| DS22 | **MAP-Elites archive cells hold platform designer seeds and counts, never another store's genome.** Direction 3 explores an under-filled cell by its coordinates only. **Refines R-D36 / dg §4.5.** | Using a tenant's elite genome as another tenant's template would leak and clone designs. |
| DS23 | **Director hints (AI-19a, ai.md AI-D18) enter the sampler as `GeneHints`** (a closed vocabulary of gene values with weights ≤ 3×); the solver, the gates and the novelty check still decide. A hint that breaks a hard rule is dropped and logged. | Brief item 16 wants the strongest design thinking; the deterministic engine stays the authority (R-D30 spirit for design). |
| DS24 | **Landing PageDoc v2, runtime config v2, payload v2, the PHP export and the 24.2 KB landing chunk are untouched.** Genes compile to CSS tokens, `<html>` attributes and planner choices only: zero runtime JS bytes. A new render budget key `css` caps the inlined CSS growth at +4 KB gzip on the heaviest page. | Frozen contracts (core §K.3, LND-16). Request DES-R5. |
| DS25 | **Measurable quality targets** (brief item 16) on the DG-09 corpus: median Q ≥ 82, minimum Q ≥ 70, 0 hard fails after repair, median slop ≤ 2, median distance between the 3 directions of one run ≥ 0.35, ≥ 7 of 9 grammars over 20 runs of one input, 0 em dashes in generated copy, median cliché density ≤ 0.5 per 100 words. | "Highest quality bar" must be checkable; numbers are starting points the calibration may raise, never lower without the owner. |
| DS26 | **The generator stays client-side; novelty is one batched server verdict per wizard run.** The browser samples 3 directions plus up to 3 alternates each (≤ 12 candidates, genome + plan only, no full docs), sends their distance views to `checkNoveltyAction`, and builds full docs only for the chosen candidates. Publish recomputes the vector from the doc on the server. | The wizard already generates in the browser (`src/components/generate/wizard.tsx:777`); 12 small vectors cost one request and ≤ 25 ms of server time; a lying client only fools its own preview, never the publish check. |
| DS27 | **The novelty certificate is shown in words, never numbers** ("Distinct across the platform", "Distinct in your niche", "Distinct from your other pages"), each from the DS7 verdict bands. **Refines** rethink-features §1.2, which showed raw distances. | Raw distances to "the nearest store" are an oracle (DS7); bands carry the promise without the leak. |
| DS28 | **No bounce outside `playground`, measured as overshoot:** easing curves with y1 < 0 or y2 > 1 and springs with ζ < 0.85 (overshoot > 0.6 %) are allowed only on `playground`, never on layout properties. `SPRINGS.soft` moves from ζ 0.78 to 0.86; `bouncy` (ζ 0.56) stays playground-only. The admin uses no spring at all. **Refines R-D38.** | Seven archetypes use the 0.78 spring today (`src/lib/theme/archetypes.ts:337,409,555,700,772,844,988`, ≈ 2 % overshoot), which reads as a soft bounce; owner rule 2 and rethink-features §3.4. Old pages change only at their next render. |
| DS29 | **A genome reservation lasts 90 days or until the store is purged, whichever comes first.** Purge deletes `design_genomes` (core §F.9) and nothing anonymous is kept. **Refines R-D36** ("release after 90 days"). | A purged tenant leaves no data behind (core §F.9); a closed store reaches purge after ≥ 31 days, which still covers the copy-a-departing-store risk the reservation targets. |
| DS30 | **DG-14 compiles e-mail and packing-slip tokens only; the PHP export does not change.** **Deviates RESEARCH DG-14** ("shared with the PHP export"). | The PHP export is a frozen contract (core §K.3, R1.0 exit criterion 4); its pages already embed the published theme CSS. |
| DS31 | **DG-12 sliders and seed history stay in R2.** **Refines** rethink-features §3.3 (which moved them to R3): sliders are deterministic gene edits with an immediate visible result and need no learning loop; the DNA card and "why" line ship in R1 (GN-1). | Sellers ask "make it calmer" on day one; the cost is S on top of the R1 genome. |
| DS32 | **R1 favicon fix without fonts:** when a store has no logo, the favicon and the header placeholder become a **construction-grid monogram** (24-unit grid, stroke skeletons for A-Z and 0-9, pure geometry, ≈ 6 KB) for Latin initials, or the brand glyph in its enclosure for an Arabic-only name; the `system-ui` `<text>` monogram is retired. HarfBuzz-shaped Arabic initials arrive with DG-10 (R2). | Today's favicon renders differently on every OS (`src/landing/document.tsx:189-201`); the grid monogram needs no package and no font, so it can ship in R1. Request DES-R11. |

---

## DES-§1 Feature map: scope, release, track, acceptance

Release and track per core §K and §L.2. "Acceptance" is what the verification agent checks; each row points to the section
with the detail and to the tests of DES-§25.

### DES-§1.1 Design generation and logo (DG-01 … DG-19)

| ID | Feature | Rel. | Track | Scope | Acceptance | Spec |
|---|---|---|---|---|---|---|
| DG-01 | DESIGN.md v3 | R1.0 (C0) | design lead (docs only) | Budgets table, tells list, banned list update, gene and register chapters, §2.5 attribute value sets extended, every orange colour word removed | `grep -inE "amber|terracotta|saffron|tomato|coral|ochre|apricot|peach" docs/DESIGN.md` hits only the owner-rule paragraph (§1.0, the forbidden examples); the budgets of DES-§3.2 present verbatim; §2.5 value sets equal `THEME_ATTR_VALUES` (checked by `theme:check`) | DES-§3 |
| DG-02 | Design Genome v1 | R1 | P6 | Schema, sampler, solver, compile to `ThemeSpec` + `look`, back-derivation for old docs, explanation chips | Same seed → byte-identical genome; 11 archetypes × 3 moods × 200 seeds satisfy every hard rule; `buildTheme(compile(g))` never throws and `orangeMixes` is empty; `compile(genomeOf(docWithoutLook))` reproduces today's `<html>` attributes on every baseline fixture | DES-§4 |
| DG-03 | Unlock archetype locks + radius ladder + glass budget | R1 | P6 | `look` drives btn/card/mask/glyph/emphasis/density; 4-tier radius tokens; glass counted per page | Over 2,000 generated docs: every gene value of G12/G15/G17/G25/G26/G27 appears under ≥ 4 archetypes; radius tiers strictly increase (or the `mixed` rule); glass ≤ 2 on 100 % of pages | DES-§4.5, DES-§8 |
| DG-04 | Choreography grammar | R1 | P6 | Stochastic grammar replaces the 3 storylines, with hard COD invariants; reused by store page kinds | ≥ 100 distinct valid in-flow sequences over 10,000 expansions; 100 % satisfy the 6 invariants; form reachable ≤ 3 estimated screens on 100 % | DES-§5 |
| DG-05 | Brand seed + genome distance + reservation | R1 | P6 | `design_genomes` rows, `genomeVector`, `genomeDistance`, `checkNovelty` (verdicts), reservation reconcile job | Distance is symmetric, 0 on identical, in [0,1]; two stores with identical inputs get d ≥ 0.25; responses never contain another store's id, vector or genome (attack suite); a closed store's genomes stay reserved 90 days or until purge (DS29) | DES-§7 |
| DG-06 | Static gates + slop score + repairs + Design check panel | R1 | P6 | 24 gates, slop score, repair vocabulary, Q score, panel in the builder and per direction, server re-check at publish | Gates ≤ 8 ms per doc (Node, p95 over fixtures); a baseline-like fixture scores slop ≥ 6 and ≤ 2 after repair; publish of a doc with a hard fail answers `design_blocked` with the items | DES-§8 |
| DG-07 | Copy cliché + specificity detector + headline check | R1 | P6 | ar/fr/en normalisers, seed lexicons, structure tags on the copy library, specificity score, em-dash repair, MinHash headline check in-store and cross-store | Library: 0 em/en dashes, every headline tagged, ≥ 3 structures per family × locale; detector flags ≥ 90 % of a 120-line cliché fixture and ≤ 5 % of a 120-line clean fixture; bottom-k containment within ±0.08 of exact on synthetic sets | DES-§9 |
| DG-08 | Font pairing expansion | R1 | P6 | ≥ 8 pairings per archetype (≥ 88 entries, ≥ 60 unique tuples) from the 27 shipped fonts; pairing rules; ≤ 2 preloads | Every pairing passes the validity rules of DES-§10.2; every non-playful Arabic display face is used by ≥ 3 archetypes and each playful one (Marhey, Baloo Bhaijaan 2, Lemonada) by ≥ 2; `fontPreloads` returns ≤ 2 for every pairing × locale | DES-§10 |
| DG-09 | Threshold calibration corpus | R1 | P6 (+ maintainer for the human review) | 200 generated pages + ≥ 44 designer seed genomes; human-labelled pairs; fitted thresholds in `calibration.json` | `calibration.json` committed with version and date; DS25 targets met on the corpus or the miss recorded with the owner's decision | DES-§17 |
| DG-10 | Logo designer v1 | R2 | S2 | HarfBuzz shaping and outlines (ar + Latin), optical spacing, one craft move, Latin monogram grid, Arabic initial in enclosure, basic stacked bilingual lockup, small-size test, exports, 6 candidates in 3 families, locks, "more like this" | Arabic golden names shape with correct joining (glyph-id goldens); exported SVG contains only `svg`/`g`/`path` with palette fills; small-size test passes or a simplified favicon is produced; 12 candidates in ≤ 600 ms in the browser (mid laptop) | DES-§13 |
| DG-11 | Store theme across registers | R2 | S2 (+ S1 consumers) | `store_themes`, Brand Genome, register rules, inherit/campaign compile, brand re-render fan-out | A commerce-utility page never has glass, motion > 250 ms or accent area > 8 %; a campaign page with d_brand > 0.35 gets the "drifts from your brand" warning; a brand change enqueues one render job per live inherit page | DES-§11 |
| DG-12 | Generation studio | R2 | S2 | Direction previews with genome chips and "why", sliders mapped to genes, seed history with restore, locks | Each slider moves only its genes (property test); restoring a seed reproduces the doc byte for byte; studio never shows a direction with a hard fail | DES-§14.5 |
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
| UX-05 | Live address card | R2 (R1 text) | S6 | Card composition, QR styling, share buttons | QR scans at 3 cm printed and on screen; ink ≥ 7:1 on its ground | DES-§16.12 |
| UX-06 | Realtime dashboards | R2 | S6 | Live dot semantics, arrival animation, number ticks | The dot shows "live" only when the last poll succeeded < 30 s ago; arrivals animate once, never loop; reduced motion = no movement | DES-§16.13 |
| UX-07 | PWA + Web Push | R1 manifest (platform.md PD10), R3 push | P2, D5 | Manifest icons and theme colours; store app icons from the logo engine (R2) | Maskable icon safe zone (inner 80 % circle) respected; `theme_color` from tokens | DES-§16.14 |
| UX-08 | French + Arabic RTL dashboard | R2 fr / R3 ar | S6, D5 | Arabic type scale, RTL mirroring rules, numerals, chart direction | Every ar screen passes the RTL checks of DES-§16.15; no `left`/`right` physical properties in admin CSS (lint) | DES-§16.15 |

### DES-§1.3 Not in a catalog row but owned here

| Item | Rel. | Track | Note |
|---|---|---|---|
| BK-1 Brand kit basic (`/app/<h>/brand`: logo upload, colour locks, font locks, voice entry point) | R1 | P6 (request DES-R2) | core §I.1 lists `/brand` as R1 basic with `brand.write`; no catalog id covers it. DES-§12 |
| GN-1 Genome chips + "why this design" line in the wizard directions | R1 | P6 | Explainability is part of DG-02; the sliders and seed history are DG-12 (R2). DES-§14.1 |
| GH-1 `GeneHints` intake for the Director brief (ai.md AI-D18) | R1 (flagged) | P6 | DES-§4.6, DES-§14.6 |

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
  /** brand gene locks, R1 subset; values validated against GENE_VOCAB */
  genes: z.partialRecord(z.enum(["G12", "G17", "G23", "G26", "G27", "G28", "G31"]), z.string().max(48)).default({}),
  voice: z.object({ register: z.enum(VOICE_REGISTERS).nullable().default(null) }).default({}),   // the full voice lives in ai_memory (AI-06)
  storeThemeVersion: z.number().int().positive().nullable().default(null),                       // R2: active store_themes.version
});
export type BrandSetting = z.infer<typeof BrandSetting>;
```

- Logo asset ids pass `assertOwned(scope, "asset", ids)` (core §E.3 rule 5) and are synced to `asset_refs` with
  `owner_kind = 'brand'` (core §G.5) on every write.
- An unknown gene value is dropped and reported as a warning item on save (never a silent change).
- The R1.0 conversion copies the old `store.logo` field here (core §D.10 row `store`; T1 owns the conversion).
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
(`platform.design.changed`) and shown on the console AI page next to the gene pins. Bans and pins of gene values stay
in ai.md's `platform_ai.genePins` (one list, read by the sampler, DES-§4.3).

### DES-§2.8 Events this part emits (consumed by ai.md)

No new table. The wizard and the builder report through ai.md's feedback API (AI-§G.1, from R2): `chosen` /
`not_chosen` with the `design_genomes.id` of each direction; gene overrides as `ai_feedback` rows with `field =
"gene:<G#>"` and gene values (never page text) in `before_text` / `after_text`; repairs as counts inside `report`. In R1
only the `design_genomes` rows are written (AI-§G.1: feedback capture starts in R2).

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

| Budget | Limit per page | Gate |
|---|---|---|
| Frosted glass surfaces (sticky bar and header excluded) | ≤ 2 (soft above 2, hard above 4) | V06 |
| Radius ladder | 4 tiers, chip < control ≤ card < media (`mixed` ladder: control ≤ 8 px, media round) | V05 |
| Signature details | 1 hero signature + ≤ 3 secondary details on the whole page (a detail = a ticking number, a drawn line, a floating chip, a scale-in image, a cursor-following glow) | S11 |
| Bento compositions | ≤ 1 section | S08 |
| Centred sections | ≤ 2 in a row and ≤ 50 % of in-flow sections | V08, S05 |
| Aurora / glow fields | ≤ 2 sections | S06 |
| Scrolling strips (marquee, ticker, ribbon) | ≤ 1 in the body | V19, S14 |
| Equal-card triplets (3 same-size cards, icon + title + text) | ≤ 1 section | S04 |
| Giant decorative words (display ≥ 9 vw beside or behind content) | ≤ 1, never clipped in Arabic | S12 |
| Chips laid over product photos | ≤ 2 per photo, on ≤ 1 photo per page | S13 |
| Eyebrows | plain topic words; no numbering, no "Edition 01", no "Brand · No. 01" | S15 |
| Middle dot `·` | ≤ 1 per metadata line, never in a headline | C07 |
| Exclamation marks | ≤ 1 per page, in the final call to action only | C05 |
| Easing | one family per page; overshoot only in `playground` (DS28) | V23 |
| Accent area | inside the colour-strategy band (G10) | V10 |

### DES-§3.3 Tells list (v3 §1.2; each row names its detector)

Purple or indigo accent and pop on a dark base (S01) · gradient text (S01) · glass on plain grounds (V06) · one radius
everywhere (S03) · three identical cards (S04) · icons above every heading (S07) · centred dark hero with a glow blob
(S05, S06) · hero metric with a gradient (S10) · bounce easing (S09) · decorative status dots (S16) · section-number and
edition eyebrows (S15) · rotating-text ring badges (S17) · two scrolling strips (S14) · identical section headers, the
same kicker + title + lead pattern in ≥ 4 sections (S18) · pills laid over product photos (S13) · em and en dashes as
separators (C01) · "Discover the world of…", "Découvrez l'univers…", "اكتشف عالم…" frames (C02) · adjective triads
(C03) · "Not just X, Y" frames (C03) · empty superlatives (C02).

### DES-§3.4 Banned list v3 (replaces today's §1.1 and the "Required" §1.2)

Today's §1.2 prescribes glass chips over products, 20-32 px radii on every card and "a signature moment per section"
(`docs/DESIGN.md:28-46`). v3 replaces it with the budgets above and with "what modern means here": one idea per page
pushed hard (the composition grammar), quiet supporting genes, type contrast as hierarchy, asymmetric grids, image-led
crops, light and depth as budgets, UI motion under 300 ms and reveals of 500-900 ms in one easing family. Today's banned
rows stay (craft and vintage motifs, hand-drawn marks, purple gradients, emoji, hype copy, fake proof, default Inter);
v3 adds rotating-text rings, version and edition eyebrows, decorative dots, pills on photos, em and en dash separators,
two scrolling strips, ghost words that clip Arabic, and the `·`-separated "metadata strip" headline.

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

export type GeneKey = `G${1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31}`;
export type BoldGene = "G1" | "G2" | "G4" | "G9" | "G18" | "G28";
export type GeneLevel = "brand" | "page" | "section";

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
| G31 | Darija ratio | brand | none / cta / light | `cta` when market = MA and locale = ar, else none | copy request | 24 |

Bucketing for `gene_stats` (`bucketOf`): G5 rd → `"1.20-1.30" | "1.30-1.40" | "1.40-1.50"`; G6 w → hundreds;
G10 → `"03-08" | "08-16" | "16-25" | "25-35"`; G21 → `"0.75-1.0" | "1.0-1.25" | "1.25-1.6"`; G23 d →
`"180-300" | "300-600" | "600-900"`; structs → their categorical parts joined with `/` (`"12/5:7/offset"`).

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
                 st: z.number().int().min(30).max(80), sc: z.boolean() }),
  kit: z.object({ gl: z.enum(["dot", "spark", "diamond", "none"]), nb: z.enum(["none", "plain", "padded"]), cap: z.enum(["mono", "smallcaps", "italic-serif", "plain"]) }),
  em: z.enum(["swoosh", "highlight", "color", "italic"]), btn: z.enum(["solid", "pill", "soft", "outline", "underline", "glow"]),
  gid: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),        // design_genomes id (learning join, ai.md AI-§G.4)
}).strict();
// ThemeSpec gains:  look: ThemeLook.optional(),
```

A compiled look serialises to ≈ 560-680 B of JSON (`theme:check` asserts ≤ 700 B over 2,000 sampled genomes). The
constants (`GRAMMARS`, …) move with it into `src/lib/page/schema.ts` (they are part of the doc contract); the design
modules import them from there.

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

| Change | Why |
|---|---|
| 3 new hero variants: `cinema` (full-bleed photo chapter, type on a quiet band below or beside, no chips on the photo), `quiet` (one image per screen, small display, vast space), `index` (product beside a numbered fact list, catalogue precision) | grammars cinematic, quiet-luxe and catalogue have no hero today (hero variants: stage, editorial, poster, scrapbook, spec, split) |
| `hero:poster` loses the turning badge (rotating text ring); the price block stays static | tell S17 (baseline `tshirt-kinetic-ar`) |
| `hero:stage` giant word becomes optional (`data.ghost`, default off for Arabic and for G16 = 0) and its glass callouts ≤ 2 | tells S12, S13 (baseline `argan-*-s7`, `-s4242`) |
| `hero:editorial` "numbered cover lines" become plain cover lines (no `01` prefixes); eyebrow text never numbered | tell S15 ("الإصدار 01 · العناية", baseline `argan-editorial-ar`) |
| `guarantee:seal`, `cta:stamp`, `trustBar:stamps`, `marquee:tape`, `offer:tickets` keep their ids (doc compatibility) but are redrawn without seal, stamp, tape or ticket shapes and without circular text | owner rule 2 (no craft motifs) and the logo rules |
| every variant declares `features` (DES-§8.4) in the registry entry | the slop score reads data, not screenshots |
| `[data-look]` selectors implement the new attributes; no selector changes for docs without look | DS4, render-check goldens |

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
| `src/lib/design/index.ts` | the public API (isomorphic; no Node or DOM imports) |
| `src/lib/theme/tokens.ts`, `archetypes.ts` | look-aware emission, new attribute sets, `SPRINGS.soft` 0.86 |

---

## DES-§5 Choreography grammar (DG-04, R1, P6)

Replaces the three fixed storylines (`src/lib/generator/plan.ts:90-112`, GEN-11). `chooseVariant`, `calmBands`,
`assignBackgrounds` and `spacingFor` stay; only the order and the variant pools change.

### DES-§5.1 Grammar

```
Page    → Top Hero Strip? Act1 Form Act2 Offer Assure Close Footer Floating
Top     → announcement? header                               (unchanged rules)
Strip   → trustBar | marquee                                  (marquee: not calm, ≤ 1 per page)
Act1    → Promise | Problem | Proof | Visual | Promise Visual | Problem Promise     (≤ 2 blocks, I2 decides)
Promise → benefits
Problem → problem
Proof   → reviews | socialProof | stats                       (owner data only, I6)
Visual  → showcase | gallery | video | beforeAfter
Form    → orderForm
Act2    → Block{2..4}, Block ∈ {Proof, story, comparison, specs, steps, Visual, Problem (if unused), Promise (if unused)}
          without repeats of a type, alternating density where G20.p asks for it
Offer   → offer | ε                                           (ε when offers.display.picker ∈ {tiers, visual})
Assure  → guarantee faq | faq guarantee | faq
Close   → cta | urgency cta                                   (urgency only with a real end date)
Footer  → footer;  Floating → stickyCta whatsappFloat?        (unchanged rules)
```

Production weights come from G1 (vibe), G2 (grammar), mood and the inputs:

| Production | Weights |
|---|---|
| Act1 | Promise .30 · Problem .15 · Proof .15 (0 without owner proof) · Visual .15 · Promise Visual .15 · Problem Promise .10; × 1.5 for Visual under gallery-led / cinematic; × 1.5 for Problem under apothecary, hearth, kinetic (the AFFINITY table of `plan.ts:72-84` keeps its role for optional blocks) |
| Act2 length | 2: .25 · 3: .45 · 4: .30; dense pages (G20.l = dense) +1 block allowed, airy pages −1 |
| Act2 block | AFFINITY[vibe][type] × grammar affinity (story ↑ editorial-column, quiet-luxe; specs ↑ specimen, catalogue; comparison ↑ split-tension, specimen; Visual ↑ gallery-led, cinematic) |
| Strip | trustBar .7 · marquee .3 (0 when calm or G2 ∈ {quiet-luxe, catalogue}) |
| Assure | guarantee faq .45 · faq guarantee .35 · faq .20 |

### DES-§5.2 Invariants (hard; gate V22)

| Id | Invariant |
|---|---|
| I1 | every hero CTA targets the order form anchor (`#order`) |
| I2 | the order form starts within the first **3.0 estimated mobile screens** (390 × 844, DES-§5.3) |
| I3 | when an `offer` section exists, it is before the final `cta` |
| I4 | one full-bleed colour moment (background accent, dark or pop) starts in the top half of the estimated page height |
| I5 | no two consecutive in-flow sections share a background (DESIGN.md §4, `assignBackgrounds`) |
| I6 | reviews, socialProof and stats appear only with owner-provided data (LP-02; `plan.ts` reservations keep their honesty filters) |

Soft (V24): estimated mobile length 8-16 screens; 8-14 in-flow sections; ≤ 1 strip in the body (V19 is hard above 1).

### DES-§5.3 Height model (`src/lib/design/heights.ts`)

Estimated height at 390 px in screens (844 px), before density: announcement .05 · header .08 · hero 1.0 · trustBar
.12 · marquee .10 · benefits 1.3 · showcase 1.1 · gallery 1.0 · video .9 · beforeAfter 1.0 · problem .9 · reviews 1.2
· socialProof .8 · stats .6 · story 1.0 · comparison 1.1 · specs .9 · steps 1.0 · offer 1.2 · orderForm 1.6 · urgency
.4 · guarantee .6 · faq 1.2 · cta .7 · footer .6. Multipliers: airy × 1.2, dense × 0.85, `spacingFor` tight/airy
× 0.95 / 1.08, G21 adds `(G21 − 1) × 0.12` screens per section. A variant may override its type value in the registry
`features.h`. The model is calibrated once against the baseline renders (`qa/saas-baseline/index.json` heights) by
DG-09 (ratio of estimated to measured mobile height within 0.8-1.25 on ≥ 90 % of pages).

### DES-§5.4 Grammar → variant pools (weights; the archetype's `preferredVariants` still filter what fits)

| G2 | hero | benefits | gallery / showcase | steps | story | orderForm | faq | trustBar |
|---|---|---|---|---|---|---|---|---|
| editorial-column | editorial .6, split .4 | zigzag .5, numbered .3, stack .2 | lookbook .5, filmstrip .3 / ingredients .4 | timeline .5, strip .5 | letter .4, image-text .4, manifesto .2 | split .5, minimal .5 | two-col .6, accordion .4 | ledger .6, chips .4 |
| poster | poster .8, split .2 | bento .4, icons .3, stack .3 | carousel .6 / hotspots .5 | cards .6, strip .4 | manifesto .7, image-text .3 | bold .7, card .3 | accordion .7, chat .3 | ribbon .5, chips .5 |
| gallery-led | scrapbook .5, split .3, cinema .2 | stack .5, zigzag .5 | masonry .5, lookbook .3, carousel .2 / exploded .3 | illustrated .5, strip .5 | image-text .7, letter .3 | card .5, split .5 | accordion .6, two-col .4 | chips .7, stamps .3 |
| stage | stage .8, spec .2 | numbered .4, icons .3, bento .3 | carousel .5 / hotspots .6, exploded .4 | cards .5, timeline .5 | image-text .6, letter .4 | card .6, bold .4 | accordion .6, chat .4 | chips .6, ribbon .4 |
| specimen | spec .6, index .4 | numbered .6, stack .4 | filmstrip .5 / dimensions .5, exploded .5 | timeline .6, strip .4 | manifesto .5, letter .5 | minimal .6, split .4 | two-col .7, accordion .3 | ledger .8, chips .2 |
| catalogue | index .7, split .3 | stack .5, numbered .5 | masonry .6, filmstrip .4 / dimensions .6 | strip .7, timeline .3 | letter .6, image-text .4 | minimal .7, card .3 | two-col .6, accordion .4 | ledger .7, chips .3 |
| split-tension | split .7, editorial .3 | zigzag .6, bento .4 | lookbook .4, carousel .6 / hotspots .5, ingredients .5 | timeline .5, cards .5 | image-text .7, manifesto .3 | split .7, card .3 | accordion .5, two-col .5 | chips .5, ledger .5 |
| cinematic | cinema .8, split .2 | stack .6, zigzag .4 | filmstrip .6, lookbook .4 / exploded .5 | strip .6, timeline .4 | image-text .5, manifesto .5 | split .6, bold .4 | accordion .7, two-col .3 | ribbon .5, chips .5 |
| quiet-luxe | quiet .7, editorial .3 | stack .7, numbered .3 | lookbook .7, filmstrip .3 / ingredients .6 | timeline .7, strip .3 | letter .7, manifesto .3 | minimal .8, split .2 | two-col .6, accordion .4 | ledger .8, chips .2 |

Other types keep today's archetype pools. `benefits:icons` is down-weighted × 0.5 everywhere (icons above every block,
S07) and `benefits:bento` is capped at one per page (S08).

### DES-§5.5 Expansion (`src/lib/design/choreography.ts`)

```ts
export interface ChoreographyCtx { vibe: Archetype; grammar: Grammar; mood: MoodReading; density: PageGenes["G20"];
  has: { ownerProof: boolean; video: boolean; photos: number; endDate: boolean; whatsapp: boolean; storeName: boolean }; picker: OfferPicker }
export function expandChoreography(ctx: ChoreographyCtx, rng: () => number): { inFlow: string[]; record: PageGenes["G24"] } | null;
export function choreographyFallback(ctx: ChoreographyCtx): string[];   // today's TEMPLATES[TEMPLATE_PREF[vibe][0]]
```

1. Expand each non-terminal with the weighted productions; drop blocks the inputs cannot fill (no video → no `video`).
2. Check I2-I4 with the height model; on failure retry (new draw from the same stream) up to 50 times.
3. Mark slots: `moments` = indices that `assignBackgrounds` must paint with strong grounds (count from G10 band, I4
   first), `cross` = the one boundary-crossing slot (product overlapping a panel edge, DESIGN.md §1.2), `signature` =
   the hero (the page's one signature; secondary details are counted by S11).
4. 50 failures → `choreographyFallback` and `why += "fallback-order"`.

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

- **Pool cache:** a `scopedCache` under the platform key (`"design-pool"`, ≤ 20,000 entries, ≤ 10 MB, core §E.6) of
  `{ id, storeId, kind, niche, view }` for rows with `pool = 1`. Refreshed at most every 60 s by
  `SELECT id, store_id, kind, niche, vec, pool FROM design_genomes WHERE updated_at > ? ORDER BY updated_at, id LIMIT
  5000` (`// tenancy: platform design-novelty pool`, request DES-R9); rows that left the pool are evicted by the same
  query. `storeId` stays in process memory only, to exclude the caller's own store; it is never serialised.
- **Own pages:** read through the scope: the store's last 10 `published` / `chosen` page rows (`dg_store_kind_idx`),
  excluding `req.pageId`. `own = "first"` when there are none.
- **Bands:** `ok` when d ≥ threshold + 0.05, `close` when threshold ≤ d < threshold + 0.05, `too_close` below
  (DS7). Platform uses the full distance against other stores' page and brand rows of the same `kind`; niche uses the
  same rows filtered by `niche`; own uses the page scope.
- **Clone flag:** `clone = true` when d < `thresholds().clone` (0.12) against any other store's pool row (DS6).
- **Cost:** brute force, ≤ 16 candidates × ≤ 20,000 rows; p95 ≤ 25 ms in Node (unit-timed on a synthetic pool).
- **Rate limits:** `storeBucket(scope, "design:novelty")` 60 calls / 10 min, and ≤ 16 candidates per call (≤ 960
  verdicts per 10 minutes). Above it: `rate_limited`; the wizard then shows its directions without bands.
- **Kill:** `platform_design.novelty = "off"` → every verdict `ok`, `clone = false`; `"warn"` → verdicts computed,
  never blocking. Logged in `job_runs`-style counters (`error_events` area `design`, code `novelty_off`) once per hour.
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

### DES-§7.8 Publish-time clone block (R1)

The pre-publish hook (DES-§8.8) recomputes the page's view from the doc (`genomeOf(doc)` + the doc's look) and calls
`checkNovelty(scope, …, "publish")`. `clone = true` → publish answers `design_blocked` with item `N01` ("This design is
almost identical to another store's live page. Change the layout or colours to publish."; DES-§20.1), unless the
earliest pool row in the collision belongs to the publishing store (first come keeps its design). `too_close` on the
platform or niche band, or own `< 0.30`, is a soft warning only (owner edits are never blocked between 0.12 and the
thresholds, DS6) with the one-click "Differentiate" action (DES-§15.3).

---

## DES-§8 Quality gates, slop score, repairs (DG-06, R1, P6)

### DES-§8.1 API (`src/lib/design/gates/**`, pure, isomorphic)

```ts
export type Register = "marketing" | "commerce" | "transactional";
export interface AssetMeta { id: string; width: number; height: number; alpha: boolean; focus?: { x: number; y: number } | null }
export interface GateInput {
  doc: PageDoc; theme: BuiltTheme; genome: DesignGenome; assets: ReadonlyMap<string, AssetMeta>;
  locale: Locale; register: Register; context: "wizard" | "builder" | "remix" | "publish";
  origin: ReadonlyMap<string, "generated" | "owner">;   // per text field path: who wrote it (DES-§9.8)
  ownerProof: boolean;                                  // the store has real reviews/proof data (LP-02)
}
export type GateId = `V${string}` | `S${string}` | `C${string}` | `N${string}`;
export interface GateItem {
  id: GateId; level: "hard" | "soft" | "info"; section?: string; field?: string;
  penalty: number;                                      // soft: points off Q; hard: 15
  msg: MessageKey; vars?: Record<string, string | number>;
  fix?: RepairOp[];                                     // the one-click fix the panel offers (DES-§15.2)
}
export interface GateReport {
  v: 1; q: number; hard: GateItem[]; soft: GateItem[]; info: GateItem[];
  slop: { score: number; items: GateItem[] }; copy: CopyReport; ms: number;
}
export function runGates(input: GateInput): GateReport;                          // ≤ 8 ms p95 in Node per doc
export function repairDoc(input: GateInput, opts?: { rounds?: 1 | 2 | 3; allowCopy?: boolean }): { doc: PageDoc; report: GateReport; log: RepairLog[] };
export function summarize(r: GateReport): GateSummary;                          // design_genomes.report
```

### DES-§8.2 Visual and structural gates

| Id | Gate | Method (static, from doc + tokens + asset meta + variant features) | Level |
|---|---|---|---|
| V01 | Contrast AA | `contrastAudit` on the emitted tokens per section background (existing, `src/lib/theme/palette.ts`): text ≥ 4.5:1, large text and UI ≥ 3:1 | hard |
| V02 | Contrast APCA (advisory) | body Lc ≥ 75, headings Lc ≥ 60 (APCA is a draft, so advisory only) | soft −2 each |
| V03 | No orange | `orangeMixes(spec, locale)` empty; no colour literal in section data in the band | hard |
| V04 | Grid unit | every spacing token is a multiple of `look.grid.u` (or 4) | hard |
| V05 | Radius ladder | chip < control ≤ card < media (`mixed`: control ≤ 8, media ≥ 999 or the mask); nested radius = outer − padding | hard |
| V06 | Glass budget | glass surfaces on the page (sticky bar and header excluded) ≤ G16 (and ≤ 2): soft above 2, hard above 4 | soft / hard |
| V07 | Background rhythm | I5 (no same-background neighbours) | hard |
| V08 | Alignment and density runs | ≤ 2 centred in a row; no 3 in a row with the same density | soft −2 |
| V09 | Density words | words per section ≤ 35 airy / 70 balanced / 120 dense; list items 3-6 | soft −1; hard above 2× |
| V10 | Accent area | estimated area of accent/pop grounds (heights × full-bleed) within the G10 band ± 0.03 | soft −2 |
| V11 | Image resolution | for each media slot: asset width ≥ 1.5 × the slot's CSS width at 1440 px (slot widths per variant from `features.slots`) | hard below 1.0×, soft below 1.5× |
| V12 | Focal safe area | the asset's focus point lies inside the inner 80 % of the crop for the slot aspect | hard |
| V13 | Cutout required | stage, poster and spec heroes have an alpha asset | hard |
| V14 | Photo reuse | the same asset ≤ 2 times per page | soft −1 |
| V15 | Type contrast | hero display / body size ratio ≥ 2.5 at 390 and 1440 px (from the type steps) | soft −3 |
| V16 | Weights per section | ≤ 3 font weights per section | soft −1 |
| V17 | Measure | body line length 45-75 ch at 1440 px (container, columns, font size, `xWidthAvg`) | soft −1 |
| V18 | RTL | for `ar`: no uppercase, letter-spacing or italic tokens; display/body are Arabic faces; directional icons from the mirrored allow-list; prices and phones in isolates (renderer contract, checked by render-check) | hard |
| V19 | Scrolling strips | ≤ 1 marquee / ticker / ribbon in the body | hard above 1 |
| V20 | Proof honesty | reviews, socialProof, stats only with owner data (LP-02, `ownerProof`) | hard |
| V21 | CTA clarity | the primary CTA is solid or pill (H20), has a label, targets `#order` (I1) | hard |
| V22 | Choreography invariants | I2, I3, I4, I6 (DES-§5.2) | hard |
| V23 | Motion | no overshoot easing outside `playground` (DS28), one easing family per page, nothing animates layout properties (variant features) | hard |
| V24 | Page length | estimated mobile length 8-16 screens, 8-14 in-flow sections | soft −2 |
| N01 | Clone | DES-§7.8 (publish only) | hard |
| N02 | Novelty bands | DES-§7.4: platform / niche `too_close` −4, `close` −1; own page `too_close` −2 | soft |

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
| S15 | numbered or edition eyebrows (`/^\s*(\d{1,3}\b|n[o°º]\.?\s*\d|vol\.|edition|édition|chapitre|الإصدار|العدد|رقم)/i` on kickers) | 2 |
| S16 | decorative status dots (a dot glyph before > 3 list items or badges without a state) | 1 |
| S17 | rotating-text ring badge | 3 |
| S18 | identical section headers: the same kicker + title + lead pattern in ≥ 4 sections | 2 |

`score ≥ platform_design.slop.fail` (default 6) is a **hard** item (`S00 slop_fail`); `≥ slop.repair` (default 3)
triggers repairs in the wizard and remix; the builder shows the items and their fixes.

### DES-§8.4 Variant features (registry data, `src/landing/sections/<type>/index.tsx`)

```ts
// src/landing/registry.ts (P6): each variant entry gains `features` (optional fields default to 0 / false)
export interface VariantFeatures {
  glass?: number; aurora?: boolean; centered?: boolean; equalCards?: 0 | 3 | 4; iconHeads?: boolean; bento?: boolean;
  scroller?: boolean; signature?: number; details?: number; ghostWord?: boolean; ring?: boolean; overlayChips?: number;
  dots?: boolean; numberedEyebrow?: boolean; animatesLayout?: boolean;
  slots?: { name: string; cssWidth1440: number; aspect: Aspect | "free" }[];   // V11, V12
  decor?: Partial<Record<"ghost" | "ring" | "chips" | "aurora" | "dots" | "ticker", string>>;   // data path that turns it off
  h?: number;                                                                  // height override in screens (DES-§5.3)
  arrangements?: Arrangement[];                                                // DG-15 (R3)
}
export function variantFeatures(type: string, variant: string, data: unknown): Required<Omit<VariantFeatures, "decor" | "slots" | "h" | "arrangements">>;
```

Data toggles (`decor`) override the static features: `hero:stage` with `data.ghost = false` has `ghostWord = false`.
A registry test fails when a variant omits `features` (so a new variant cannot dodge the slop score).

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
  | { op: "dropSection"; section: string }              // optional types only: marquee, socialProof, stats, urgency, video
  | { op: "moveSection"; section: string; to: number }
  | { op: "punctuate"; section: string; field: string };  // dashes, exclamations, middle dots (DES-§9.7)
export const AI_REPAIR_OPS = ["swapVariant", "changeGene", "rewriteLine"] as const;   // the closed subset ai.md AI-19 may propose
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

Loop: up to 3 rounds; after each round `runGates` again; the result kept is the best of {original, round 1, 2, 3} by
(fewer hard items, then slop below the fail line, then higher Q). Repairs never touch owner-typed text, never change
prices, items, offers, pixels or the form fields, and never drop a section the owner added. Every applied op is logged
(`RepairLog = { op, item, before, after }`, counts kept in `design_genomes.report`).

### DES-§8.7 Where the gates run

| Context | When | Repairs | Budget |
|---|---|---|---|
| wizard | after each direction doc is built, before it is shown | automatic (3 rounds) | ≤ 30 ms per direction incl. repairs |
| remix | after `remixDoc` | automatic (2 rounds) | ≤ 20 ms |
| builder | 400 ms after the last edit, in an idle callback | offered as one-click fixes in the panel | ≤ 8 ms |
| publish (server) | in the pre-publish hook | none (the owner approved this doc) | ≤ 15 ms incl. novelty |
| store theme activation (R2) | before activating | offered | ≤ 50 ms for all inherit pages |

### DES-§8.8 Pre-publish and post-publish hooks (request DES-R3)

```ts
// src/lib/render/prepublish.ts (core-owned registry, new): called by publishPage before the version row is written
export interface PrePublishCtx { scope: StoreScope; store: StoreRow; pageId: string; doc: PageDoc; theme: BuiltTheme; assets: ReadonlyMap<string, AssetMeta>; actor: Actor }
export type PrePublishResult = { ok: true; notes?: GateItem[] } | { ok: false; code: "design_blocked"; items: GateItem[] };
export function registerPrePublishCheck(name: string, fn: (ctx: PrePublishCtx) => Promise<PrePublishResult>): void;
export function registerPublishListener(name: string, fn: (ctx: PrePublishCtx & { versionId: string; event: "published" | "unpublished" }) => Promise<void>): void;
// track file: src/lib/render/prepublish/design.ts (P6)
```

The design check: `runGates({ context: "publish", … })` → hard items (excluding copy items on owner-typed fields and
excluding V09/V24 in this context) or N01 → `{ ok: false, code: "design_blocked", items }`; `storeAction` maps the code
to the new action error `design_blocked` (request DES-R3) and the publish dialog lists the items with their fixes. With
`platform_design.gatesAtPublish = "warn"` the items become notes and the publish goes through (audited
`page.publish.design_override`). The design listener, after a successful publish: writes the `published`
`design_genomes` row (live), flips the previous live row (DES-§7.5), runs `syncShingles` (DES-§2.2); on unpublish:
DES-§7.5 and `syncShingles`. A listener failure never fails the publish; it records `error_events` area `design` and the
`design.backfill` job repairs the row later.

### DES-§8.9 AI critique interface (AI-19, R3; Director, ai.md)

`critiqueSummary(report, genome, doc) → CritiqueInput` (genome compact, section list `type:variant:bg`, gate item ids,
headlines with their structure tags, Q; never owner contact data) is the only input ai.md's `critique.doc` sees. Its
output `{ ops: RepairOp[] }` is validated against `AI_REPAIR_OPS` and `GENE_VOCAB`; `applyOps` runs in a sandbox copy;
the result is kept only when Q rises by ≥ 3 and no hard item appears (rethink-features §1.2), at most 2 rounds.

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
| sameness | every in-flow title tagged with the same G29 structure | −2 |
| questions | questions in > 2 titles | −2 |
| bang | > 1 exclamation mark on the page (C05; generated: repaired) | hard for generated, −2 for owner |
| dots | `·` more than once in a line, or in a title (C07) | −1 |
| emoji | any emoji (existing guard) | hard |

### DES-§9.5 Headline structures in the copy library

`src/lib/ai/copy-library/types.ts` gains `export type Line = string | { t: string; s: HeadlineStructure; d?: Device }`
for hero titles, section titles and leads (`Device = "contrast" | "number" | "sensory" | "question" | "quote"`); a plain
string is read as `{ t, s: structureOf(t) }` (`structureOf` = the heuristic tagger of DES-§9.9). DG-07 acceptance: every
hero and section title of every family × locale is tagged, ≥ 3 structures per family × locale for hero titles, and the
library contains no em or en dash (`grep -c "—\|–"` = 0; today fr 12, en 17, ar 4 lines). Picks: the copy step takes
G29 weights from `CopyDirectives.structures` (G28 voice → structure weights below) and rotates structures across the
three directions so two directions of one run never share the hero title structure.

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
- **Cross-store:** `checkHeadlines(scope, { niche, lines })` (server action, ≤ 60 lines, `storeBucket(scope,
  "design:headlines")` 60 / 10 min): HMAC shingles → `SELECT owner_tag, hash FROM headline_shingles WHERE niche_key = ?
  AND hash IN (…) AND owner_tag <> ?`; for owners with ≥ 3 matched shingles, `τ_B` = max stored hash when B holds 256
  rows (else ∞) and containment = matches / |candidate shingles with hash ≤ τ_B|. Containment > 0.35 → line verdict
  `close`. Answers per line `ok | close` only (no owner, no count). Generated `close` lines are resampled (C08); owner
  lines get a soft flag "Close to wording already live on another store" (−1).
- **Library exhaustion:** in a crowded niche every library alternative may be `close`; after 3 resamples the least
  contained line is kept with the C08 soft item and the panel suggests "Write again" (AI) or an edit. This is the
  intended pressure toward fresh copy, never a block.

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
```

ai.md's targeted re-ask fires when hero + benefits `clicheScore` > 1.0 or any weight-3 hit (AI-§D.2 rule 6).

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

### DES-§10.3 Catalogue additions (5 per archetype; the 34 existing pairings keep their ids and values)

Weights: Latin display / Arabic display. "Also fits" = archetypes that may borrow the pairing at prior weight 0.3.

| Archetype | id | display (w) | body | accent | displayAr (w) | bodyAr | also fits |
|---|---|---|---|---|---|---|---|
| maison | nocturne | bodoni-moda 400 | instrument-sans | | reem-kufi 500 | ibm-plex-sans-arabic | editorial |
| maison | gallery | gloock 400 | instrument-sans | ibm-plex-mono | el-messiri 600 | noto-naskh-arabic | editorial, bloom |
| maison | satin | fraunces 300 | hanken-grotesk | | alexandria 300 | ibm-plex-sans-arabic | bloom |
| maison | monolith | instrument-serif 400 | schibsted-grotesk | | readex-pro 400 | ibm-plex-sans-arabic | apothecary |
| maison | prive | bodoni-moda 500 | schibsted-grotesk | | el-messiri 500 | tajawal | |
| apothecary | clinic | schibsted-grotesk 600 | schibsted-grotesk | jetbrains-mono | ibm-plex-sans-arabic 700 | ibm-plex-sans-arabic | circuit |
| apothecary | ritual | instrument-serif 400 | figtree | | el-messiri 600 | readex-pro | bloom, field |
| apothecary | assay | dm-sans 600 | dm-sans | ibm-plex-mono | alexandria 600 | tajawal | circuit |
| apothecary | botanica | fraunces 400 | hanken-grotesk | jetbrains-mono | reem-kufi 500 | readex-pro | field |
| apothecary | serum | bodoni-moda 400 | instrument-sans | ibm-plex-mono | alexandria 400 | ibm-plex-sans-arabic | maison |
| souk | majorelle | bricolage-grotesque 600 | figtree | | reem-kufi 600 | tajawal | playground |
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
| circuit | signal | schibsted-grotesk 700 | figtree | ibm-plex-mono | reem-kufi 600 | ibm-plex-sans-arabic | |
| hearth | terrace | fraunces 500 | dm-sans | | alexandria 600 | tajawal | field |
| hearth | loft | instrument-serif 400 | figtree | | el-messiri 600 | readex-pro | bloom |
| hearth | brunch | bricolage-grotesque 700 | figtree | | marhey 600 | tajawal | playground |
| hearth | ceramic | gloock 400 | hanken-grotesk | | reem-kufi 600 | ibm-plex-sans-arabic | |
| hearth | nest | young-serif 400 | instrument-sans | | baloo-bhaijaan-2 600 | readex-pro | playground |
| bloom | rosewater | bodoni-moda 400 | figtree | | el-messiri 500 | readex-pro | maison |
| bloom | peony | fraunces 400 | dm-sans | | reem-kufi 500 | ibm-plex-sans-arabic | |
| bloom | dew | instrument-serif 400 | instrument-sans | | alexandria 400 | tajawal | apothecary |
| bloom | blossom | young-serif 400 | hanken-grotesk | | lemonada 600 | tajawal | playground |
| bloom | silk | gloock 400 | figtree | | el-messiri 600 | noto-naskh-arabic | maison |
| field | meadow | instrument-serif 400 | dm-sans | | alexandria 500 | readex-pro | |
| field | terroir | gloock 400 | instrument-sans | ibm-plex-mono | reem-kufi 600 | noto-naskh-arabic | souk |
| field | ridge | archivo 700 | figtree | | changa 700 | tajawal | garage |
| field | orchard | bricolage-grotesque 600 | hanken-grotesk | | el-messiri 600 | ibm-plex-sans-arabic | hearth |
| field | cedar | fraunces 600 | schibsted-grotesk | | noto-kufi-arabic 600 | readex-pro | |
| editorial | broadsheet | bodoni-moda 400 | instrument-sans | ibm-plex-mono | el-messiri 500 | noto-naskh-arabic | maison |
| editorial | column | fraunces 400 | schibsted-grotesk | | readex-pro 500 | ibm-plex-sans-arabic | |
| editorial | folio | gloock 400 | dm-sans | jetbrains-mono | reem-kufi 600 | tajawal | |
| editorial | index | schibsted-grotesk 800 | schibsted-grotesk | instrument-serif | alexandria 700 | ibm-plex-sans-arabic | circuit |
| editorial | runway | big-shoulders-display 800 | hanken-grotesk | | changa 700 | readex-pro | kinetic |
| garage | piston | archivo 900 | hanken-grotesk | jetbrains-mono | changa 800 | ibm-plex-sans-arabic | kinetic |
| garage | alloy | schibsted-grotesk 800 | dm-sans | ibm-plex-mono | noto-kufi-arabic 700 | readex-pro | circuit |
| garage | gauge | big-shoulders-display 800 | instrument-sans | jetbrains-mono | alexandria 700 | tajawal | |
| garage | carbon | hanken-grotesk 800 | hanken-grotesk | ibm-plex-mono | readex-pro 700 | tajawal | circuit |
| garage | rally | bricolage-grotesque 800 | archivo | | changa 700 | tajawal | kinetic |

Each new entry gets a one-sentence designer `note` (shown in the font picker and the DNA card), written with the
pairing. `index` uses Instrument Serif only as the italic emphasis accent inside a sans headline (F8).

### DES-§10.4 Roster growth (later, owner-gated)

Candidates from design-gen §6.5 (Cairo, Almarai, Vazirmatn, Kufam) are added only after a licence check (OFL), a
modernity review against DESIGN v3 §1 and a size check; a new face means a `@fontsource` devDependency and a
`scripts/sync-fonts.mjs` manifest line (maintainer CCR). Not in R1.

---

## DES-§11 One brand across a store: registers, inherit and campaign (DG-11, R2, S2; R1 subset)

### DES-§11.1 Registers

| Register | Surfaces | Genes that apply | Genes frozen |
|---|---|---|---|
| **marketing** | landing pages, store home hero and editorial blocks, collection banners, campaign pages | every gene | none |
| **commerce** | collection grid, PDP info column, cart, checkout, COD form, order tracking (LP-05), search | brand type, colour core, ladder, button, numerals, depth | G2 ∈ {catalogue, split-tension}; motion ≤ 250 ms, one reveal kind (fade-rise); G16 = 0; accent area ≤ 0.08; G22 = start; no decor (ghost, ring, chips, aurora) |
| **transactional** | thank-you page, e-mails (DG-14), WhatsApp previews, packing slips, legal pages | logo, colour core, type (with web-safe fallbacks), voice | single column, no motion, no decoration, no glass, accent only on the one CTA and links |

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
| Voice | the five registers as cards with one example line each (ar / fr / en, DES-§20.4); Darija ratio (none / CTA only / light); a link "Words to use and avoid" to Settings → AI → Brand voice (ai.md AI-06) | "Each design picks the voice that suits the product." | the chosen card |

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
optional app-icon ground, never in the mark.

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
| 3 | browser | per direction i, attempts 0-3: `sampleGenome` → `compileGenome` → `planSections` with the directives (no copy) → `distanceView`; skip an attempt whose pairwise distance to an earlier direction's chosen candidate is < 0.25 | ≤ 150 ms for 12 candidates |
| 4 | server | `checkNoveltyAction({ candidates ≤ 12, niche })` (DES-§7.4) → bands | one round trip, ≤ 25 ms server time |
| 5 | browser | per direction keep the first candidate with every band `ok`, else the one with the best worst band; then full docs via `buildDirection` with the genome (copy library + AI copy merge, existing) | ≤ 600 ms for 3 docs |
| 6 | browser | `repairDoc` (3 rounds) per doc | ≤ 30 ms per doc |
| 7 | server | `checkHeadlinesAction` for the generated titles and leads of the 3 docs (≤ 60 lines) → resample `close` lines from the library, re-run the copy gates | one round trip |
| 8 | browser | present (DES-§14.3); AI copy streaming (ai.md AI-02) overlays fields as they arrive and re-runs the copy gates per field | |
| 9 | server | `recordCandidatesAction` (in `after()`) writes the 3 directions as `generated` rows | async |
| 10 | server | "Use this direction" → `createFromDirectionsAction` (moved to `src/app/app/[store]/generate/actions.ts`, core §I.1): validates the docs (today's checks), writes the page and the generation versions, writes the `chosen` genome row from `genomeOf(doc)` on the server plus the client's copy-gene tags (validated against `GENE_VOCAB`) | existing |

The whole path from "Generate" to the directions is ≤ 2.5 s with library copy on a 4× CPU-throttled run (UX-01
acceptance). Failures degrade, never block: a failed or slow (> 3 s) novelty call shows the directions without the
novelty words and a quiet line "Uniqueness check unavailable right now"; the publish check still runs. The three
directions of one run must be pairwise d ≥ 0.25 (hard, by construction in step 3) and target a median ≥ 0.35 (DS25).

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

### DES-§14.5 Generation studio (DG-12, R2, S2)

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
| Bolder / Calmer (new, R1) | one Boldness slider step (DES-§14.5) |

Each remix result must be d_page ≥ 0.15 from the current doc (otherwise the next seed is tried, ≤ 6), passes the gates
with 2 repair rounds and runs the own-page novelty check (context `remix`). Old docs without `look` remix through
`genomeOf(doc)` and gain a look.

---

## DES-§15 Builder integration (DG-06 panel, DNA card; R1, P6)

### DES-§15.1 Design check panel (`src/components/builder/panels/DesignCheckPanel.tsx`)

- **Where:** a right-rail tab "Design check" next to Theme; a count badge with the number of blocking items (hidden at
  0); the publish dialog shows the same list when publishing is blocked.
- **Header:** Q as a number with a label (Excellent ≥ 90 · Good 80-89 · Fair 65-79 · Needs work < 65) and its three
  largest contributions in plain words.
- **Groups:** Blocking (hard) · Improve (soft visual) · Copy · Uniqueness (bands, with "Differentiate"). Each item: one
  plain sentence (DES-§20.1), the section chip (click scrolls the canvas to the section and outlines it for 1.2 s), a
  "Fix" button when the item carries ops, "Ignore on this page" for soft items (a per-viewer convenience in
  localStorage, never stored in the doc).
- **States:** checking (skeleton rows after 150 ms, never a spinner), clean ("Nothing to fix. This page meets the design
  checks."), stale (shown for ≤ 400 ms after an edit, then rerun), unavailable (server checks offline: local checks
  still shown).
- **Density:** 32 px rows, 13 px text in the compact admin density; works at 360 px as a bottom sheet.

### DES-§15.2 Fixes are editor edits

"Fix" applies the item's `RepairOp`s through the builder store (zustand + zundo history, `src/components/builder/**`),
so Undo (⌘Z) reverts it like any edit; the canvas updates live; the gates rerun. "Fix all" (blocking group only)
applies every blocking item's ops in one history step.

### DES-§15.3 Differentiate

Shown when a novelty band is `close`, the own-page band is `too_close`, or the server answered N01: resample one bold
page gene (G2 or G18, unlocked) with up to 6 seeds, keep the first that clears every band, preview it as a before /
after toggle, apply as one undoable edit.

### DES-§15.4 DNA card (Theme panel)

The chips, the why line, the novelty words, and a lock toggle per bold gene ("Lock for this page" / "Lock for my brand"
with `brand.write`). Old docs without `look` show the back-derived chips with "Generated before design DNA; remix to
upgrade" and a "Remix design" button.

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
h 17 (L 0.55 C 0.19), `--info` h 240 (L 0.58 C 0.12). Impersonation: `--imp-bg` L 0.42 C 0.15 h 295, `--imp-ink` L 0.99.
Break-glass (R3): `--bg-ribbon` h 17 L 0.45 C 0.17.

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
`cubic-bezier(.34,1.36,.64,1)` become tweens), rotation on hover, pulsing glows, parallax, confetti, looping
animations. `--ui-spring` (`src/app/globals.css:120`) is removed; `scripts/qa/admin-motion-check.ts` (new, in `npm
test`) fails on any `cubic-bezier` with y1 < 0 or y2 > 1 in admin CSS and on `type: "spring"` or `bounce` in
`src/components/admin/**` and `src/components/console/**`. `prefers-reduced-motion`: opacity only, ≤ 120 ms.

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
  points (28 days, 1.5 px jade line, last point marked) · a definition on hover ("Delivered orders, last 28 days").
  The hero tile loses aurora + grain by default (`kpi-card.tsx:58`).
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

### DES-§16.12 Live address card (UX-05; R1 text + copy, R2 QR, share, test order)

A card on the dashboard and the pages list: the canonical store URL in mono (`dir="ltr"`, truncated in the middle), Copy
(toast "Link copied"), and in R2 a QR code (the existing `qrcode` package; ink = `--foreground` on L 0.99 ground, ≥ 7:1,
square modules, quiet zone 4 modules, error correction M, no logo inside the code, ≥ 4 px modules on screen, PNG and SVG
download), "Share on WhatsApp" (`wa.me` with the URL) and "Open a test order" (rethink SF-05). Acceptance: the QR scans
from 3 cm printed and from the screen.

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
| R1, P2 (shell) | token generator (tenant reproduces today), console input, density attribute, motion fixes (sidebar spring and rotation, `--ui-spring` removed), radius tokens, Plex Arabic for `ar` pages (auth, onboarding, agent console, D36), palette visuals, banners, limit sheet, quiet empty states (aurora off by default), KPI ≥ 7-point rule and semantic delta tokens, onboarding reveal (DES-§14.3), address card text + copy, manifest |
| R1, P1 (console) | console identity, impersonation ribbon, console palette variant |
| R1, P6 | Design check panel, DNA card, brand page (BK-1) |
| R2, S6 (UX-04) | every screen of rethink-features §2.9 on the system: split views, saved-view bars, bulk bars, COD funnel, undo toasts everywhere, realtime arrivals, QR address card, French catalog |
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
copy (0), median cliché density (≤ 0.5 per 100 words), median specificity, novelty verdict mix. A DS25 miss is recorded
with the owner's decision before R1 exit (DG-09 acceptance).

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
(self-test of the checker). 0 failures on the corpus is an R2 exit criterion.

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
| pool cache | ≤ 10 MB, ≤ 20,000 entries | `ScopedCache` bounds |
| `design_genomes` | ≤ 600 rows per store, ≤ 1.8 KB per row | retention job, console tile |
| `headline_shingles` | ≤ 256 rows per (niche, store) | `syncShingles` |
| logo designer | 12 candidates ≤ 600 ms warm; WASM + fonts only on the Designer tab | `test:logo` (Node timing), manual browser check |
| admin palette | opens ≤ 50 ms warm | e2e timing |
| admin route change | ≤ 150 ms perceived (prefetch) | e2e timing |

---

## DES-§20 Copy keys and labels

Admin keys live in `src/lib/i18n/admin/<locale>/design.ts` (P6 R1, S2 R2; core §I.5 extension files). Dashboard
surfaces ship `en` in R1, `fr` in R2, `ar` in R3 (core D36); the onboarding reveal and its chips ship ar / fr / en in R1.

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
| `design.gate.N01` | This design is almost identical to another store's live page. Change the layout or colours to publish. |
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
| `brand.colors.moved` | Orange isn't used on Store Gen pages, so we picked the closest allowed colour. |
| `brand.logo.empty` | No logo yet. We show this monogram until you add one. |
| `brand.logo.contrast` | Add a light version of your logo for dark backgrounds. |
| `logo.trademark` | We can't check trademarks. Make sure the name and the logo are yours to use. |
| `logo.moreLikeThis` / `.use` | More like this · Use this logo |

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

- Copy library: remove every em and en dash (fr 12, en 17, ar 4 lines today) and add the structure tags (DES-§9.5).
- `docs/DESIGN.md` → v3 in step C0 (DES-§3).
- `THEME_ATTR_VALUES` gains the new attributes; DESIGN v3 §2.5 lists them; `theme:check` compares both.
- The `brand` setting takes over the logo from the `store` setting during the R1.0 conversion (T1, DES-§2.6).
- The wizard draft key moves from `sg:gen:<storeId>:v2` to `sg:gen:<storeId>:v3` when drafts carry genomes; v2 drafts
  are discarded (client-only, core §B.4).
- `SPRINGS.soft` 0.78 → 0.86 (DS28); `--ui-spring` removed from the admin CSS.

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
| glass surfaces per page | ≤ 2 (hard above 4) |
| `look` size | ≤ 700 B |

### DES-§24.3 Starting values to calibrate (DG-09)

Distance thresholds (0.25 / 0.40 / 0.30 / 0.35 / 0.12), band margin 0.05, slop lines 6 / 3, specificity target 0.5,
cliché re-ask line 1.0, headline Jaccard 0.5 and containment 0.35, height-model coefficients, the small-size hash
distance 10 bits, the Arabic lockup size ratio 110-125 %, the 0.02 novelty floor and ε 0.25. Every one lives in
`calibration.json` or `priors.ts`, never inline in code.

---

## DES-§25 Tests

### DES-§25.1 `npm test` (offline)

| Script | File | Checks |
|---|---|---|
| `test:design` (new) | `src/lib/design/selftest.ts` | same seed → byte-identical genome; 11 archetypes × 3 moods × 200 seeds satisfy H01-H24; `compileGenome` never throws, `orangeMixes` empty, look ≤ 700 B; `genomeOf` consistency on the baseline fixtures (DES-§4.7); solver ≤ 200 expansions and ≤ 3 ms; hints: invalid values dropped, locks respected; distance: symmetric, `d(a,a) = 0`, range [0, 1], two stores with identical inputs ≥ 0.25 (GEN-12); choreography: ≥ 100 distinct sequences over 10,000 expansions, 100 % invariants, form ≤ 3 screens; gates ≤ 8 ms p95; a baseline-like fixture (stage hero + ghost word + 3 glass + ring + two strips + numbered eyebrows) scores slop ≥ 6 and ≤ 2 after repair; repairs idempotent (repairing twice = once); copy: a 120-line cliché fixture per locale flagged ≥ 90 %, a 120-line clean fixture ≤ 5 %; normalisers (ar alef/ya/ta marbuta, fr elisions, digits); bottom-k containment within ±0.08 of exact on synthetic sets; `punctuate` table; specificity; `nearestAllowed` never returns a colour in the guard band, picks the minimum ΔE among its candidates and is idempotent; chips never contain `·`; pack/unpack round trips; the token table is append-only (snapshot) |
| `theme:check` (extended) | `scripts/check-theme.ts` | DESIGN v3 §2.5 = `THEME_ATTR_VALUES`; pairing rules F1-F10 over the catalogue; no overshoot easing outside playground (DS28); look emission for 2,000 sampled genomes keeps contrast and no-orange |
| `test:render` (extended) | `scripts/qa/render-check.ts` | golden HTML for docs without look (allow-listed diffs only); new hero variants `cinema`, `quiet`, `index` at 320 / 390 / 768 / 1440 in ar and fr; the `css` budget; landing chunk 24,200 B gz unchanged |
| `test:copylib` (extended) | `src/lib/ai/copy-library/selftest.ts` | 0 em / en dashes; every hero and section title tagged; ≥ 3 structures per family × locale for hero titles |
| `test:registry` (new) | `src/landing/selftest-registry.ts` | every variant declares `features`; decor paths exist in the variant's data schema |
| `test:admin-tokens` (extended) | `scripts/qa/admin-tokens-check.ts` | DES-§16.2 contrast and no-orange checks for both surfaces and modes |
| `test:admin-motion` (new) | `scripts/qa/admin-motion-check.ts` | DES-§16.6 |
| `test:admin-rtl` (new) | `scripts/qa/admin-rtl-lint.ts` | DES-§16.15 |
| `test:logo` (R2, new) | `src/lib/logo/selftest.ts` | shaping goldens (`goldens/shape.json`), SVG goldens, element whitelist, spacing clamps, move eligibility, small-size test on the golden marks, browser/Node byte-identical SVG for the same params, 12 candidates timing in Node |

### DES-§25.2 DB-backed (`npm run test:db`, `cod_test_*` databases only)

`test:design-db` (`scripts/qa/design-db-check.ts`): seeded pool of 3 stores → bands and the clone flag; reservation
transitions with store status changes (suspend, restore, close, purge); retention and the row cap; `syncShingles` on
publish / unpublish; cross-store headline containment; rate-limit refusal; the publish hook writes the live row and
refuses N01; plus the design cases of the tenancy suite (DES-§22, request DES-R13).

### DES-§25.3 e2e and local QA

e2e (core §J.3): the onboarding reveal timing (≤ 2.5 s after analysis, library copy, 4× CPU throttle), palette open ≤
50 ms, the Platform badge on every console route, the impersonation ribbon contrast. Local: `qa:design-corpus`,
`qa:design-report` (DS25 table), `qa:design-visual` (R2), `qa/admin-visual/shoot.mjs --scan-only`.

---

## DES-§26 Tracks and file ownership (consistent with core §K)

| Release · track | Owns (create / modify) | Delivers |
|---|---|---|
| R1.0 · C0 (design lead, docs only) | `docs/DESIGN.md` | DG-01 (DES-§3) |
| R1 · **P6 DESIGN** | core §K.2 list: `src/lib/theme/**`, `src/lib/generator/**`, `src/lib/design/**`, `src/lib/ai/copy-library/**`, `src/landing/sections/**` (except `orderForm/**`), `src/landing/styles/**`, `src/components/generate/**`, `src/components/builder/**`, `scripts/qa/design-*.ts`; **plus by request DES-R2:** `src/landing/registry.ts` (the `features` field), `src/landing/selftest-registry.ts`, `scripts/check-theme.ts`, `src/app/app/[store]/generate/**`, `src/app/app/[store]/brand/**`, `src/components/admin/brand/**`, `src/lib/logo/{monogram-grid,favicon}.ts`, `src/lib/settings/keys/{brand,platform-design}.ts`, `src/lib/render/prepublish/design.ts`, `src/lib/jobs/tracks/design.ts`, `src/components/admin/shell/nav/design.ts`, `src/lib/i18n/admin/<locale>/design.ts`, `scripts/qa/tenancy-cases/design.ts` | DG-02 … DG-09, BK-1, GN-1, GH-1, DS32 favicon |
| R1 · P2 SHELL | its core §K.2 files, plus by request DES-R2 the new `scripts/qa/admin-motion-check.ts` and `scripts/qa/admin-rtl-lint.ts` | DES-§16.1-16.10, §16.12 text, §16.14, the reveal composition of DES-§14.3 (P6 supplies the generator calls and chips) |
| R1 · P1 CONSOLE | its core §K.2 files | DES-§16.11 |
| R2 · **S2 BRAND & LOGO** | `src/lib/logo/**` (takes over the R1 files), `src/lib/design/{brand,registers,effective,email,blueprint,store-theme.server}.ts`, `src/app/app/[store]/brand/**`, `src/components/admin/brand/**`, `src/app/api/app/[store]/brand/**`, `scripts/build-logo-fonts.mjs`, `scripts/qa/design-visual.mjs` | DG-10 … DG-14, DES-§11, DES-§14.4, DES-§14.5, DES-§18 |
| R2 · S1 STOREFRONT | storefront.md files; registers page-kind grammars and calls `compileRegister` / `effectiveTheme` | DES-§5.6, §11 consumers |
| R2 · S6 PLATFORM UX | P2's admin files | UX-04 … UX-06 (DES-§16.12, §16.13, §16.16) |
| R3 · D4 LEARNING | `src/lib/design/{archive,novelty-budget}.ts`, `src/lib/design/seeds/**`, `src/landing/sections/**` (arrangements), `src/lib/logo/{bilingual,symbol}.ts` | DG-15 … DG-18 |
| R3 · D5 PLATFORM | admin RTL files | UX-07 push, UX-08 Arabic dashboard |
| core maintainer | `src/lib/db/schema.ts`, `drizzle/**`, `package.json`, `src/lib/page/schema.ts`, `src/landing/runtime/budgets.json`, `src/landing/document.tsx` (R1 read-only), registries | DES-§27 |

Merge order (core §K.2): DG-01 in C0; P6 merges last in R1 (after P7, so `useAiTask` exists for GH-1); the DG-09 corpus
runs on the merged build before R1 exit.

---

## DES-§27 Requests to the core

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

---

## DES-§28 Review decisions

(Empty in revision 1. Filled after the reviews: each row = reviewer, point, decision, section changed.)
