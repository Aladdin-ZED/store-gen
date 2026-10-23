# Research: generative design that never looks AI-made, and never repeats

Area: **design-gen** (owner brief items 4, 8, 14, 15; docs/STORE-GEN-BRIEF.md). Input for the architect of
docs/STORE-SAAS.md. Date: 2026-10-23.

Conventions: `path:line` = verified in this repo today. URLs = external sources (most are practitioner writing,
not studies; weighed as such). **[unverified]** = not confirmed, check before building. Priorities: **P0** launch,
**P1** next, **P2** later. Effort: **S** ≤ 2 days, **M** ≤ 2 weeks, **L** > 2 weeks (one engineer).

Owner rules that bind every idea below: no orange (OKLCH hue 25–75° with chroma > 0.06) anywhere, generated or
admin; maximally modern, never vintage or craft; natural ar/fr/en; never invented prices, ratings, stock, reviews or
figures.

---

## 0. Headline conclusions

1. **Today's sameness comes from locks, not from a lack of randomness.** The archetype fixes button, card,
   mask, glyph, emphasis and density for every page it touches (`src/lib/theme/tokens.ts:419-433`). Only ~3 font
   pairings exist per archetype (34 pairings over 27 fonts, `src/lib/theme/archetypes.ts:249+`,
   `src/lib/theme/fonts.generated.ts:50`). There are only 3 storylines (`src/lib/generator/plan.ts:90-97`), and
   anti-repetition works only *between the 3 directions of one wizard run* (`src/lib/generator/directions.ts:455-470`).
   Two sellers of perfume get the same `maison` button, card, mask and type family. Fix: replace "archetype =
   preset" with a **Design Genome**, ~40 explicit genes where the archetype is a *prior* (weights), not a lock.
2. **Our own design bible prescribes several 2026 "AI tells".** DESIGN.md §1.2 asks for glass chips, aurora glows,
   20–32px radii on every card, and a "signature moment per section" (docs/DESIGN.md:28-46). Independent
   anti-slop lists flag exactly these: glassmorphism everywhere, decorative glows, the same exaggerated radius on
   everything, bento by default, the hero-metric template, bounce easing
   ([impeccable anti-patterns](https://mintlify.wiki/pbakaus/impeccable/concepts/anti-patterns),
   [Noqta](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026),
   [StudioMeyer reality check](https://studiomeyer.io/en/blog/webdesign-trends-2026-reality-check.md)).
   → **DESIGN.md v3** must turn each of these into a *budget* (for example ≤ 2 glass instances per page, a radius
   ladder instead of one radius, one hero signature plus ≤ 3 secondary details per page).
3. **Designers are not more random; they make stronger decisions.** What reads as "designed" is one idea pushed
   hard (scale contrast, a deliberate grid, image-led crops, restrained palette, real copy), while everything
   else stays quiet. The genome therefore samples a small number of **bold genes** (composition grammar, type
   contrast, color strategy, image treatment) and derives the rest by **coherence rules**. Many independent
   random knobs would give noise.
4. **Anti-repetition is a measurable distance, enforced platform-wide and per niche.** We need a weighted genome
   distance (categorical + OKLab color + section-sequence edit distance + copy-structure distance), a
   nearest-neighbour check against every live store in the niche (brute force is enough at our scale), a
   per-gene novelty budget (inverse-frequency weighting), and a MAP-Elites-style archive of "cells" so the platform
   fills the design space instead of collapsing to the favourite look
   ([MAP-Elites in PCG, Alvarez et al.](https://arxiv.org/pdf/1906.05175), [QD survey](https://ar5iv.labs.arxiv.org/html/1907.04053)).
5. **Quality gates must be static and fast, so they can run on Hostinger at generation time.** Contrast, grid and
   rhythm, density, image focal fit, RTL, banned patterns and copy clichés can all be computed from the PageDoc
   plus the built tokens in pure TypeScript, with no headless browser. Screenshot-based gates (clipping, overlap,
   visual near-duplicates) stay in local/CI QA (`qa/admin-visual/*`, Playwright msedge).
6. **One Brand Genome drives a whole store.** Brand genes (type, color core, shape, logo, voice) are fixed per
   store. Surface "registers" (marketing / commerce utility / transactional email) choose which page genes vary.
   Landing pages in a store either inherit the store genome or run as a "campaign" that may mutate composition
   and motion but must stay *within* a brand radius. This is the inverse of the anti-repetition constraint.
7. **The logo designer must outline real glyphs; it must not render live text.** Shape with HarfBuzz (WASM) for
   correct Arabic joining and kerning ([harfbuzzjs](https://npmjs.com/package/harfbuzzjs)), then apply optical
   spacing and **one** deliberate typographic move (a cut, a join, a tittle swap, a weight shift). Monograms are
   built on a construction grid, symbols come from a shape grammar on a module grid, and Arabic/Latin lockups
   are balanced by visual weight, not x-height
   ([typography.guru thread](https://typography.guru/forums/topic/61760-arabic-on-bilingual-signage/)). OFL fonts
   may be used in logos, including outlined, with no attribution required
   ([OFL FAQ](https://tug.ctan.org/fonts/gentium/OFL-FAQ.txt)). Today's favicon monogram is live `system-ui` text
   in SVG (`src/landing/document.tsx:189-201`), so it renders differently on every OS. It is the seed to replace.
8. **"Gets better over time" needs no ML infrastructure for design.** Log genome, merchant choice among
   directions, gene overrides, publish, and orders per visit. Keep Beta counts per (niche, gene value) in MariaDB,
   aggregated by the 5-minute cron. Sample priors with Thompson sampling under the novelty budget. This is
   learning that a Hostinger Business plan can run.
9. **The admin upgrade is mostly discipline, not new libraries.** The stack already has shadcn, Tailwind v4, cmdk,
   motion, recharts and sonner (package.json:43-75). Copy Linear's method: generate the theme from 3 inputs (base,
   accent, contrast) in a perceptual color space ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)).
   Add a density mode, a command palette for every action, ≤ 250ms ease-out motion with no bounce, real-data-only
   charts, and empty states that act.

---

## 1. What the current engine does (codebase evidence)

| Fact | Where | Consequence for "no repetition" |
|---|---|---|
| 11 archetypes; each fixes `button`, `card`, `mask`, `glyph`, `emphasis`, `density` | `theme/archetypes.ts:164-219`, emitted as-is in `theme/tokens.ts:419-433` | Every `maison` page has the same button, card, mask and emphasis. Biggest source of sameness. TENANCY-MAP GEN-06 already flags it. |
| 34 font pairings for 11 archetypes (~3 each), 27 fonts (15 Latin, 12 Arabic), all OFL | `archetypes.ts` (`displayAr:` ×34); `fonts.generated.ts:50` | 1 in 3 odds that two same-archetype stores share type. Arabic options are even narrower. 22 of 27 fonts are variable `wght` (2 are also `opsz`), so **continuous weight** genes are possible today. |
| Pairing picked uniformly per seed | `theme/vibe.ts:579` | No memory of what other stores use. |
| 9 color harmonies with OKLCH recipes | `theme/palette.ts:182+`, `page/schema.ts:510-521` | A good base for the "color strategy" gene. Accent/pop come from the product photo, so color is already the most varied gene. |
| 3 storylines; template preference per archetype | `generator/plan.ts:90-112` | Section order repeats across pages. TENANCY-MAP GEN-11. |
| Variant choice: archetype preference, then weighted draw with "reservations" (calm, store name, facts, WhatsApp, invented figures) | `plan.ts:173-300` | Good honesty filters to keep. Diversity is limited to the archetype's preferred list. |
| Anti-repeat only across the 3 sibling directions (`avoid` map, `SPREAD_TYPES`) | `directions.ts:167, 455-470`; `plan.ts:165` | Nothing stops store #2 getting store #1's page. |
| Seed = f(inputs) | TENANCY-MAP GEN-12 (`directions.ts:427`) | Same product photo gives the same design across tenants. |
| ~1,100 lines of copy alternatives per locale | `ai/copy-library/{ar,fr,en}.ts` | Wording varies, but the **structure** of headlines does not. Banned hype words are guarded for en/fr/ar (`ai/guard.ts:28-32`). |
| Theme QA verifies contrast and no-orange on the **emitted** CSS (40 seeds × archetypes × locales, culori) | `scripts/check-theme.ts:1-40` | A strong gate culture to extend to composition and copy gates. |
| Favicon monogram = `<text font-family="system-ui">` in a squircle | `landing/document.tsx:189-201` | Not a logo: it varies per OS and has no craft. |
| DESIGN.md still mentions amber, terracotta, saffron and tomato | TENANCY-MAP GEN-14 | Fix in DESIGN.md v3 before agents read it. |
| Admin: shadcn + Tailwind v4, cmdk palette, motion, recharts, sonner; jade brand accent; no-orange status tokens | `app/globals.css:1-40`; `components/admin/shell/command-palette*.tsx`; package.json | The base is right. The upgrade is about density, motion and data-viz craft. |

---

## 2. External research: what reads as "AI-made" in 2025–2026, and what experts do instead

### 2.1 Tells (each becomes a detector rule in §5)

| Tell | Source | Detector rule (static) |
|---|---|---|
| Purple→blue / indigo gradients, neon on dark, gradient text | [DEV "AI purple problem"](https://dev.to/jaainil/ai-purple-problem-make-your-ui-unmistakable-3ono), [impeccable](https://mintlify.wiki/pbakaus/impeccable/concepts/anti-patterns) | accent/pop hue both in 260–310° with C > 0.12 on a dark base → fail; any `background-clip:text` gradient → fail |
| Centered dark hero + glow blob + centered CTA | [impeccable](https://mintlify.wiki/pbakaus/impeccable/concepts/anti-patterns), [imagegen-frontend skill](https://mcpservers.org/hi/agent-skills/leonxlnx/imagegen-frontend-web) | > 60% of in-flow sections center-aligned → warn; centered hero + aurora + dark base → fail |
| Identical 3-card grids (icon + heading + text) | impeccable, Noqta | ≥ 2 sections rendering N equal cards with N = 3 → fail (`plan.ts:173` GENERIC already down-weights) |
| Same exaggerated radius on everything | [Noqta](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026) | radius ladder collapses (btn = card = media = chip) → fail |
| Glassmorphism everywhere | impeccable; [StudioMeyer](https://studiomeyer.io/en/blog/webdesign-trends-2026-reality-check.md) (restrict to nav/modals, paint cost) | > 2 glass surfaces per viewport-height or > 4 per page → fail |
| Hero-metric template (big number + label + gradient) | impeccable | `stats` big-numbers without merchant numbers is already blocked (`plan.ts` INVENTED_FIGURE); also flag gradient accents on numbers |
| Icons above every heading; emoji bullets | impeccable; DESIGN.md §1.1 | icon-headed blocks > 2 sections → warn; emoji anywhere → fail (`guard.ts` EMOJI) |
| Bounce/elastic easing; animating layout props | impeccable | easing curves with y1 < 0 or y2 > 1 only in `playground`, ≤ 1 use; never on layout properties |
| Pure #000 / #fff, gray text on color | impeccable | tokens: no pure black/white grounds (tinted neutrals already exist) |
| Thick one-side accent border on rounded card | Noqta, impeccable | CSS lint in the section kit |
| "Live"/"New" pills that mean nothing; fake urgency | Noqta | urgency/countdown only with a real end date (existing honesty rule) |
| Copy: delve, tapestry, vibrant, crucial, enhance, fostering, showcase, "not only… but also", long polysyllabic words | [The Conversation](https://theconversation.com/chatgpt-is-changing-the-way-we-write-heres-how-and-why-its-a-problem-239601), [Pew 2026](https://www.pewresearch.org/data-labs/2026/08/20/how-much-of-the-internet-is-written-with-ai.md), [Grammarly](https://www.grammarly.com/blog/ai-writing/common-ai-words/) | cliché lexicon + structure patterns (§5.3). Single words are weak evidence and lists date fast (Economist, cited in the search summary), so we score density, not single hits |

### 2.2 What senior designers do instead (applied as genome rules)

- **One idea per surface, pushed hard.** A page commits to a composition grammar (editorial, poster, gallery…)
  and lets everything else support it. Encoded: only 3–4 "bold genes" are sampled freely; the rest are derived.
- **Typographic contrast and hierarchy, not decoration.** Large display/body ratio, tight tracking at display
  size and normal at body size (Geist's display tracking is negative, per a
  [third-party reference](https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/vercel.md) [unverified exact values]),
  ≤ 3 weights per section, balanced wraps (`text-wrap: balance` is Baseline 2024; `pretty` is not in Firefox
  ([MDN](https://developer.mozilla.org/docs/Web/CSS/text-wrap), [ishadeed](https://ishadeed.com/article/balancing-text-css/))).
- **Asymmetric grids and real negative space.** 5:7, 4:8 or 3:9 splits, a hanging column for captions, offset
  margins. Fewer containers: spacing, type and hairlines do the separating (impeccable: "wrapping everything in
  cards" is a tell).
- **Image-led compositions.** Crop with intent (tight detail vs wide context), bleed off an edge, keep the focal
  point on a third. Content-aware crop tooling exists ([smartcrop.js](https://29a.ch/2014/04/03/smartcrop-content-aware-image-cropping)).
- **Restrained motion.** UI motion < 300ms, ease-out, no ease-in for UI
  ([emil-design-eng skill summary](https://tessl.io/registry/skills/github/emilkowalski/skill/emil-design-eng), secondhand).
  Kinetic text only for an intro (StudioMeyer). Our landing reveals can stay longer (500–900ms, DESIGN.md §3) but
  must use one easing family per page.
- **Perceptual color systems.** Linear generates themes from 3 inputs (base, accent, contrast) in LCH instead of
  98 hand-set variables ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). We already work in OKLCH.
- **Detail craft:** optical alignment (hang quotes, nudge play icons), nested radii (inner = outer − padding),
  tabular numerals for prices. These already sit in the DESIGN.md §9 checklist and become automated gates in §5.

---

## 3. The Design Genome

### 3.1 Structure

```
DesignGenome v1
├─ brand   (store-level, stable; owned by the brand kit)    → type, color core, shape, voice, logo
├─ page    (per page; sampled per generation)               → composition grammar, grid, rhythm, motion, imagery
└─ section (per section instance; derived + light sampling) → layout grammar, alignment, media slot, detail
```

- Stored as JSON: `store_theme.genome` (brand + default page genes) and `PageDoc.design.genome` (page + section
  genes, plus `brandRef` = the store genome version). Versioned (`v`), so old pages keep rendering.
- `ThemeSpec` (`page/schema.ts:531-562`) stays the **render contract**. The genome *compiles to* ThemeSpec plus new
  optional overrides (the GEN-06 fix) and to the section plan. Existing pages without a genome get one
  back-derived (archetype defaults), so nothing breaks.
- Archetype becomes `brand.vibe`, a **prior** that sets the weights of every other gene. It no longer decides
  their values.

### 3.2 Gene table (values, archetype prior, coupling)

"Bold" genes (★) are sampled freely within the prior. The others are derived by the rules in §3.3, plus small
jitter.

| # | Gene | Level | Values / range | Prior examples | Couplings / guards |
|---|---|---|---|---|---|
| G1 | vibe ★ | brand | 11 archetypes (existing) | from `rankArchetypes` + niche | sets priors for all others |
| G2 | composition grammar ★ | page | `editorial-column`, `poster`, `gallery-led`, `stage`, `specimen` (spec-sheet precision), `catalogue` (index/list), `split-tension` (5:7 halves with overlap), `cinematic` (full-bleed image chapters), `quiet-luxe` (vast space, small type, one image per screen) | maison: quiet-luxe .35, cinematic .25, editorial .2 · kinetic: poster .4, cinematic .3 · circuit: specimen .45, stage .3 | decides the hero family, section variant pools and image ratio; calm mood forbids `poster` |
| G3 | grid | page | columns 4/8/12; split ratio {1:1, 5:7, 4:8, 3:9, 0.382}; margin {narrow 16–24, wide 32–64, offset (asymmetric)}; container 1080–1440 | editorial: 12 col, 4:8, offset | every gap from one 4px or 8px base (`grid.unit`) |
| G4 | type pairing ★ | brand | from an expanded pairing catalogue (target ≥ 8 per archetype, ≥ 60 total) | per archetype (existing notes) | Arabic partner chosen by weight/colour match (§6.5 rules) |
| G5 | type scale | brand | ratio mobile 1.125–1.25, desktop 1.2–1.5; display max 48–160px clamp | quiet-luxe: low ratio + small display; poster: 1.5 + huge | display/body size ratio ≥ 3 on hero (contrast rule) |
| G6 | display weight & tracking | brand | weight continuous within the font's `wghtRange`; tracking = f(size): `t = −0.022em × log2(size/16)` clamped [−0.05, 0] Latin; 0 for Arabic (DESIGN.md §2.3) | Didone: 400 weight, mild tracking; grotesk poster: 700–900, −0.04em | ≤ 3 weights per section |
| G7 | case & labels | brand | display `none`/`uppercase` (condensed only); labels `mono`/`small-caps`/`plain` | circuit: mono · maison: small-caps | uppercase never for Arabic; tracking > 0 only for uppercase labels ≤ 13px |
| G8 | numerals | brand | tabular lining (prices, always); figures in copy: lining/old-style (serif only) | — | prices always tabular (DESIGN.md §9) |
| G9 | color strategy ★ | brand | `ink+one` (neutral page, accent ≤ 8% of area), `duotone` (accent + pop fields), `color-field` (one big full-bleed block per screen), `tonal` (tints of one hue), `dark-luxe`, `high-key` (very light, pastel pop), `monochrome+signal` (gray scale + one signal color for CTA) | maison: dark-luxe/ink+one · playground: color-field/duotone | built on the 9 harmonies; **no-orange guard on everything** (existing stack `theme/color.ts`, `theme/blend.ts`) |
| G10 | accent area budget | page | 3–35% of rendered area | ink+one 3–8%, color-field 25–35% | checked statically from section bgs × estimated heights |
| G11 | contrast level | brand | `standard` / `high` (Linear-style single input) | — | raises ink/ground separation; AA always met |
| G12 | radius ladder | brand | 4 tiers {chip, control, card, media} from sets: `crisp` 2/4/6/8, `soft` 6/10/16/24, `round` 999/14/24/32, `mixed` (sharp UI, arch/round media) | editorial: crisp · playground: round | tiers must differ (anti-tell); nested radius rule |
| G13 | corner geometry | brand | circular / superellipse (squircle) | circuit, bloom: squircle | SVG mask for squircle media; CSS `corner-shape` as enhancement **[unverified support]** |
| G14 | stroke & hairline | brand | 1px / 1.5px / none; line strength 0.08–0.3 | specimen: strong hairlines | crisp-pixel snapping |
| G15 | surface & depth | brand | `flat`, `hairline`, `tonal-layers`, `ambient-shadow`, `directional-shadow` (one light source) | maison: directional · editorial: hairline | shadow tinted by surface (existing) |
| G16 | glass budget | page | 0–2 per page (nav/sticky bar don't count) | circuit 2, editorial 0 | only over imagery or color fields, never on plain grounds |
| G17 | mask family | brand | arch / circle / pill / rounded / rect / cut-corner | souk: arch | **unlocked** from archetype (GEN-06) |
| G18 | image treatment ★ | page | `cutout-stage`, `full-bleed-crop`, `framed` (inset with margin), `tight-detail` (macro crops), `tonal-duotone` (accent-tinted, only for secondary images), `grid-contact` (contact-sheet grid) | depends on photo inputs (cutout, count, resolution) | duotone never on the primary product image (honest colour) |
| G19 | crop & focal | section | aspect {4:5, 3:4, 1:1, 2:3, 16:9, 21:9}; focal on thirds / center / edge-bleed | — | focal point from the focal editor or smartcrop; gate §5 |
| G20 | density | page | airy / balanced / dense + sequence pattern (`A B A C`, `A A B`) | quiet-luxe: airy | unlocked from archetype (GEN-06) |
| G21 | section spacing | page | `--lp-space-section` multiplier 0.75–1.6 | — | from grid unit |
| G22 | alignment bias | page | start / mixed / center-statement (≤ 2 centered sections) | — | anti-tell rule (§5) |
| G23 | motion signature | brand | easing family {expo-out, quint-out, spring-soft, linear-mask}; base duration 180–900ms; reveal set: 1–2 kinds from DESIGN.md §6; stagger 30–80ms; scroll-linked on/off | kinetic: expo-out 250ms · maison: quint-out 800ms | one family per page; reduced-motion respected |
| G24 | choreography | page | storyline grammar (§3.4), color-moment slots, boundary-cross slot, signature slot | — | DESIGN.md §4 rules stay hard constraints |
| G25 | detail kit | brand | glyph {dot, spark, diamond, none}; numbering {`01`, `Nº 1`, `1/`, none}; caption style {mono, small-caps, italic-serif (Latin only)}; divider family | — | **unlocked** glyph/emphasis (GEN-06) |
| G26 | emphasis | brand | swoosh / highlight / color / italic (Latin) | — | italic → color for Arabic (existing) |
| G27 | button | brand | solid / pill / soft / outline / underline (+ `glow` only on dark) | — | primary CTA always solid or pill for COD clarity |
| G28 | voice register ★ | brand | `plain` (factual, short), `warm` (friendly, family), `precise` (clinical, numbers), `bold` (short punchy), `poetic-restrained` (sensory, luxe) | maison: poetic-restrained · apothecary: precise | calm mood forbids `bold` |
| G29 | headline structure | section | noun-phrase, imperative, question, number-led (merchant numbers only), contrast pair ("Light on skin. Serious on stains."), quote-led, single word + subline | voice-dependent weights | §4.4 anti-repetition |
| G30 | sentence length & punctuation | brand | mean words per sentence 5–14; ≤ 1 "!" per page (existing rule) | — | Arabic: MSA with light Darija in CTAs (DESIGN.md §8) |
| G31 | Darija ratio | brand | 0 / CTA-only / light | Morocco default CTA-only | merchant chooses |

### 3.3 Coherence rules (constraint layer)

Sample the bold genes, then run a small constraint solver (forward checking plus backtracking, ≤ 200 tries,
deterministic per seed). Representative hard rules:

- Didone/hairline serif display ⇒ display ≥ 40px on mobile, tracking ∈ [−0.02, 0], `radius.control ≤ 10`,
  `surface ∈ {flat, hairline, directional}`.
- `poster` ⇒ display weight ≥ 700 or a condensed face, `G5.ratio ≥ 1.4`, `color-field` or `duotone`.
- `quiet-luxe` ⇒ `density = airy`, `G10 ≤ 10%`, `glass ≤ 1`, `motion.duration ≥ 600`.
- `specimen` ⇒ `labels = mono` or small-caps, `hairline ≥ 1px`, `G12 ∈ {crisp, mixed}`.
- dark base ⇒ `shadow ∈ {none, glow-ambient}`, ink contrast per APCA advisory (§5.1).
- `cutout-stage` requires a cutout. `full-bleed-crop` requires ≥ 1 photo with width ≥ 1600px; otherwise `framed`.
- calm mood (existing `mood.ts`) ⇒ forbids `poster`, `color-field`, `bold` voice, bounce easing, marquees
  (existing `LOUD_FOR_CALM`, `plan.ts`).
- Arabic primary locale ⇒ an Arabic display face must exist for the pairing; no uppercase or tracking genes apply.
- Every colour gene ⇒ passes the existing no-orange stack (`orangeMixes()` must be empty, `theme/index.ts`).

Soft rules (penalties in the quality score): scale contrast too low (< 2.5 hero ratio), > 2 sections with
the same alignment and density in a row, accent area outside the strategy band.

### 3.4 Section choreography grammar (replaces the 3 fixed storylines)

A small **stochastic grammar** keeps COD conversion invariants and varies the rest:

```
Page      → Top Hero Act1 Form Act2 Offer Assure Close Footer Floating
Act1      → Promise | Problem Promise | Proof Promise          (weights by vibe + mood)
Promise   → benefits [visual]        visual → showcase | gallery | video
Act2      → (proof | story | compare | specs | steps){2..4}     without repeats, density-alternating
Assure    → guarantee faq? | faq guarantee?
Close     → cta
Invariants (hard): form reachable from the hero CTA and present ≤ 3rd screen; offers before the final CTA;
one full-bleed colour moment in the top half; no two consecutive same-bg sections (DESIGN.md §4).
```

Expansion is seeded. The number of distinct orders grows from 3 to roughly a hundred valid sequences, and every
one keeps the COD invariants. The grammar is reusable for store page kinds (home, collection, PDP) with
different non-terminals (GEN-11).

### 3.5 Section layout grammar (inside a section)

Each section variant declares **slots** (media, title, body, list, proof, CTA) and **arrangements**
(`stack`, `split(r)`, `overlap(dx,dy)`, `hang` (caption column), `bleed(edge)`, `index` (numbered rows)). The
composition grammar (G2) picks arrangements per section so that variants feel like one art direction. With
~90 variant ids (STORE-GEN-BRIEF says ~88) × ~3 arrangements × alignment, the effective layout space grows about 10× without writing 10× the
components. Effort: M per batch of sections (the kit already has primitives in `src/landing/primitives`).

### 3.6 Sampling algorithm (deterministic, explainable)

```
genome(seedStore, product, niche, mood, locale, archive):
  prior   ← vibePrior(G1) ⊗ nichePrior(niche) ⊗ learnedPrior(niche)       // §8 Beta counts
  prior   ← prior × novelty(archive, niche)                                 // §4.3 inverse frequency
  bold    ← sample(prior, ★ genes, rng(seedStore ⊕ seedPage, "bold"))
  rest    ← derive(bold) + jitter                                           // §3.3 rules
  g       ← solve(bold ∪ rest, hard rules)    (backtrack on the cheapest gene first)
  if dist(g, nearest(archive, niche)) < τ → resample 1 bold gene (≤ 8 tries, keep best)
  return g + explanation[]  // "Editorial column · Fraunces/Readex · ink+one · tight-detail crops"
```

The seed mixes a per-store brand seed (fixes GEN-12), so identical photos in two stores still diverge.

---

## 4. Anti-repetition

### 4.1 Genome distance

`d(a,b) = Σ w_i · d_i(a_i, b_i) / Σ w_i`, in [0,1]:

| Component | d_i | Weight |
|---|---|---|
| composition grammar, color strategy, image treatment | 0/1 categorical | 3 each |
| type pairing | 0 same pairing; 0.5 same display family; 0.25 same Arabic display only | 3 |
| accent / pop colour | OKLab ΔE normalised (0.15 = 1) | 2 |
| base (light/tinted/dark), radius ladder, mask, surface, button, emphasis, glyph | categorical | 1 each |
| type scale ratio, display weight, section spacing, accent area | `|Δ|/range` | 1 each |
| section sequence | normalised Levenshtein over `type:variant` tokens | 3 |
| hero variant + arrangement | categorical | 2 |
| copy structure | Jaccard over headline-structure tags + 3-gram shingles of headings (§4.4) | 2 |

### 4.2 Thresholds and scope

- **Platform-wide:** a new store genome must satisfy `d ≥ 0.25` against every live store. **Same niche:**
  `d ≥ 0.40`. **Pages inside one store:** brand genes are equal by design, and page genes need `d_page ≥ 0.30`
  against the store's last 10 pages, so landing pages for one store don't clone each other.
- Storage: `design_genomes(store_id, page_id NULL, niche, vec JSON, keys…)`. At ≤ 10k stores × ~40 dims,
  brute-force nearest neighbour in Node takes milliseconds (no index needed). Add a bucket key
  (`niche|grammar|colorStrategy`) to filter first. Tenant isolation: the distance check reads other tenants'
  vectors **server-side only**, returns a boolean or score, and never exposes another store's genome.
- First-come fairness: a store's genome is "reserved" while live. Deleted or suspended stores release it after 90
  days.

### 4.3 Novelty budget (per gene, per niche)

`w'(v) = w(v) · (1 + ε) / (1 + ε + share(v)/target(v))`, where `share` is the fraction of live stores in the niche
using value `v` and `target` = 1/|values| (or a designer-set share). Rare values gain weight; over-used ones lose it.
Quality always wins: the learned prior (§8) multiplies first, so a poor value is never boosted. A floor stops
any value from dropping below 2% while it is still valid.

### 4.4 Copy-structure variety

- Tag every generated headline with a **structure** (G29) and a **rhetorical device** (contrast pair, number,
  sensory verb, question, quote). Keep per-store and per-niche frequencies, and down-weight structures above
  their share as in §4.3.
- Near-duplicate check: MinHash over word 3-gram shingles of all section titles and leads (ar/fr/en
  normalised: Arabic diacritics stripped, alef/ya unified, French accents folded). Reject when Jaccard > 0.5
  against the store's other pages or > 0.35 against the 50 most recent pages in the niche. Fallback: re-pick from
  the copy library with another structure.
- The copy library (`ai/copy-library/*`) gains **structure tags** per alternative, so remix-copy
  (`generator/remix.ts`) can rotate structures and not only synonyms.

### 4.5 MAP-Elites archive (P1)

Behaviour dims = `composition grammar × color strategy × type class (serif/grotesk/condensed/mono-accent)`. That gives
9 × 7 × 4 = 252 cells per niche. Each cell keeps the best-scoring genomes (quality score §5.5, plus learned
conversion). Direction 3 of every wizard run is drawn from an **under-filled cell**, which keeps the system
exploring. The other two come from the best cells for the product ([MAP-Elites](https://arxiv.org/pdf/1906.05175)).

---

## 5. Quality gates (automatic, scored, with repair)

All gates run in pure TypeScript on `PageDoc + BuiltTheme + asset metadata` (≈ tens of ms). They run in the
wizard, on save and on publish. **Hard fail** blocks publish with a fix suggestion. **Soft** lowers the score.

### 5.1 Visual gates

| Gate | Method | Threshold |
|---|---|---|
| Contrast | existing WCAG checks on emitted tokens (`scripts/check-theme.ts`); add APCA as an advisory signal (draft, may change) ([APCA intro](https://github.com/Myndex/apca-introduction)) | hard: WCAG AA; soft: body Lc ≥ 75, headings Lc ≥ 60 |
| Grid & spacing | every spacing/padding token is a multiple of `grid.unit`; section arrangements land on grid lines | hard |
| Radius ladder | chip < control ≤ card < media (or the `mixed` rule); nested radius = outer − padding | hard |
| Rhythm | no 3 consecutive sections with the same density; no same-bg neighbours; alignment run ≤ 2 centered | soft |
| Density | words per section ≤ budget per density (airy 35, balanced 70, dense 120); list items 3–6; ≤ 1 marquee in the body (existing `calmBands`) | soft (hard when > 2× budget) |
| Accent area | estimated rendered area of accent/pop grounds ∈ the strategy band (G10) | soft |
| Image fit | per slot: `pxWidth ≥ 1.5 × slotWidth@DPR2`; focal point inside the crop's safe area (inner 80%); cutout present for stage heroes; same photo ≤ 2 times per page | hard for resolution/focal, soft for reuse |
| Type | display/body ratio ≥ 2.5 on hero; ≤ 3 weights per section; max line length 45–75ch at desktop; `text-wrap: balance` on headings | soft |
| RTL | logical properties only (lint the section CSS); directional icons mirrored (allow-list); no letter-spacing/uppercase/italic in `[lang=ar]`; prices and phones wrapped in `<bdi>`/`dir=ltr`; Arabic +6–10% size (DESIGN.md §2.3) | hard |
| No orange | existing `orangeMixes()` empty | hard |

### 5.2 Banned-pattern detector ("slop score")

Each item adds points. `slop ≥ 6` fails; `3–5` triggers a repair:

| Pattern | Points |
|---|---|
| purple/indigo accent+pop on a dark base, or gradient text | 4 |
| > 2 glass surfaces per page (nav/sticky excluded) | 2 + 1 each extra |
| radius ladder collapsed | 3 |
| ≥ 2 equal-card triplets | 3 |
| > 60% centered sections | 2 |
| aurora/glow on > 2 sections | 2 |
| icon above every block title in > 2 sections | 1 |
| bento used in > 1 section | 1 |
| bounce easing outside `playground` | 2 |
| more than 1 "signature" animation per section on > 50% of sections (motion noise) | 2 |

### 5.3 Copy cliché detector (ar / fr / en)

- **Lexicon density:** hits per 100 words from curated lists. These are **seed lists** for the owner and copy
  reviewers to extend; they are not an exhaustive claim:
  - en: elevate, unlock, seamless, game-changer, delve, tapestry, vibrant, crucial, enhance, fostering,
    showcase, "in today's fast-paced", "look no further", "whether you're… or…", "not only… but also"
    (existing `guard.ts:28` covers the first group).
  - fr: révolutionnaire, incroyable, ultime, sublimez, plongez dans, découvrez l'univers, "que vous soyez… ou…",
    "alliant… et…", "le compagnon idéal", "n'attendez plus", "un must-have".
  - ar: ثوري, سحري, لا مثيل له, "اكتشف عالم", "استمتع بتجربة", "الخيار الأمثل", "رفيقك المثالي", "لا تفوت الفرصة",
    "جودة عالية وسعر مناسب" (the last as a density signal; it is legitimate once).
- **Structure patterns:** triads of adjectives ("soft, light and elegant") > 1 per page; "Not just X, Y" frames;
  every heading the same structure; questions in > 2 headings; > 1 exclamation (existing rule).
- **Specificity score:** share of sentences containing a concrete noun from the product facts, a number the merchant gave
  (`guard.ts` `allowedNumbers`), a sensory verb, or a delivery/COD fact. Target ≥ 50% for benefits and hero.
- Score = specificity − cliché density − structure repetition. A low score triggers re-picking from the library
  or regenerating with the local model, under the existing honesty guard.

### 5.4 Critique-and-repair pass

1. **Deterministic repairs first** (cheap, exact): glass over budget → turn the extra chips into solid tonal chips;
   collapsed radius → snap to the ladder; centered run → flip one section to start alignment; triplet cards → swap
   to `numbered`/`zigzag` (existing variants); low-res photo in a full-bleed slot → `framed`; cliché line → library
   alternative with another structure.
2. **Optional AI critique (P1):** feed the local model a *structured summary* (genome, section list, gate results,
   headlines), not screenshots, and ask for ≤ 3 repair ops from a closed vocabulary (`swapVariant`, `changeGene`,
   `rewriteLine`). Validate them with zod (`generator/zod-tools.ts`), apply, and re-score. Keep the change only if
   the score rises. At most 2 rounds.
3. Keep the best of {original, repaired}. Log every repair (feeds §8).

### 5.5 Quality score

`Q = 100 − 15·hardFails(blocks) − Σ soft penalties − 4·slop + 10·specificity + 5·noveltyBonus`, shown in the
admin as a **Design check** panel with plain-language items ("Two sections use frosted glass: kept the first,
made the second solid"). Visual CI (local/CI only): Playwright screenshots at 360/768/1440, ar + fr, checking
for text clipping, overflow, overlap and SSIM near-duplicates between directions (extends `qa/admin-visual/*`).

---

## 6. One theme across the whole store

### 6.1 Registers

| Register | Surfaces | Genes that apply | Genes frozen to calm values |
|---|---|---|---|
| **Marketing** | home hero/editorial blocks, landing pages, collection banners, campaign pages | all page genes | — |
| **Commerce utility** | collection grid, PDP info column, cart, checkout/COD form, account/order tracking | brand type, colour core, radius ladder, button, numerals | composition `catalogue`/`split-tension`, motion ≤ 250ms, glass 0, accent area ≤ 8%, alignment start |
| **Transactional** | thank-you, order emails, WhatsApp message previews, invoices/packing slips, legal | logo, colour core, type (with web-safe fallbacks), voice | layout = single column, no motion, no decoration |

### 6.2 Inheritance

- `store_theme` holds the Brand Genome (+ locks from the brand kit: "keep this accent", "keep this font").
- Store pages use `themeMode: "store"` (GEN-05). Landing pages pick `store` (inherit everything) or
  `campaign` (inherit the brand genes; page genes may mutate, with `d_brand(page, store) ≤ 0.35` on brand
  components so they still read as the same store).
- Brand locks are respected by the no-orange repair: move pop/neutral first and the accent last, with a UI note
  (GEN-07).

### 6.3 Emails and offline outputs

Compile the tokens to **inline styles** for emails (no CSS variables in many email clients **[unverified per
client]**). Use a PNG logo (from §7 export) and fonts as web-safe stacks with the brand font only as progressive
`@font-face` where supported. The same tokens go to the PHP export and the PDF packing slip (if built).

### 6.4 Store page kinds

| Page | Composition grammar default | Signature (1) | Must-haves |
|---|---|---|---|
| Home | from G2 (marketing) | hero + one editorial chapter | featured collections, real proof only, COD/delivery promise |
| Collection | `catalogue` | banner crop + sticky filter chip bar | product card system from brand genes, price tabular, empty state |
| PDP | `split-tension` | gallery motion | variant pickers (Offers v2 options), COD form inline or drawer, delivery ETA text from the merchant |
| Cart/checkout (if any) | utility | progress line | COD reassurance copy; no decoration |
| Thank-you | transactional | order summary + upsell (existing) | WhatsApp confirm CTA when configured |

### 6.5 Arabic/Latin type rules for the store

Pair by visual weight, contrast and colour, not by name. Let Arabic take more vertical space (taller line-height
≥ 1.6, existing) and allow a slightly heavier weight than the Latin
([typography.guru](https://typography.guru/forums/topic/61760-arabic-on-bilingual-signage/),
[Arabic typography guide](https://freezil-website-wjfnk.kinsta.page/blog/arabic-typography-guide.html)). Expand
the Arabic font roster with OFL candidates such as Cairo, Almarai, Vazirmatn and Kufam
([Cairo](https://github.com/Gue3bara/Cairo), [Vazirmatn](https://www.jsdelivr.com/package/npm/vazirmatn)). Check
each one's licence, variable axes and modernity (no old calligraphic display, DESIGN.md §1.2) before adding it
**[unverified: final list]**.

---

## 7. The logo designer

### 7.1 Outputs (a logo *system*, not one picture)

Primary lockup (horizontal), stacked lockup, wordmark, monogram/symbol, Arabic + Latin bilingual lockup (when both
names exist), mono (ink) and inverse versions, clear-space and minimum-size rules. Exports: SVG (paths only, tight
`viewBox` + clear-space), PNG 1×/2× via `@resvg/resvg-js` (napi prebuilt binaries, custom font buffers
supported; [README](https://cdn.jsdelivr.net/npm/@resvg/resvg-js@2.6.2/README.md)), favicon SVG + PNG 32/48,
apple-touch 180 PNG, 512 maskable, social avatar 400, OG 1200×630 card. The brand kit stores the **parameters**
(JSON), so any export can be re-rendered.
**[unverified]**: that the resvg prebuilt binary loads on Hostinger's Node 22 (linux-x64-gnu expected). Fallback:
render PNGs in the browser (canvas) and upload them.

### 7.2 Pipeline

```
name(s) → script detect → shape (harfbuzzjs: GSUB/GPOS, Arabic joining, kerning)
        → glyph outlines (font.glyphToPath) → optical spacing pass → one craft move → weight/width tune
        → lockup composer (symbol/monogram + wordmark, ar+lat) → colour + contrast check → small-size test
        → candidates (12) → score → present 6 in 3 families → merchant "more like this" / locks / tweaks
```

- **Shaping:** harfbuzzjs exposes shaping plus `glyphToPath` for SVG paths ([npm](https://npmjs.com/package/harfbuzzjs)).
  opentype.js kerns but documents no Arabic joining ([README](https://cdn.jsdelivr.net/gh/opentypejs/opentype.js@master/README.md)),
  so it is not enough for Arabic. Runs in the browser and in Node, and the WASM is small **[unverified size]**.
- **Optical spacing:** for each adjacent glyph pair, sample both outlines at N=24 heights between baseline and
  x-height (cap height for caps). Compute the horizontal gap profile and adjust advance so the *mean gap area*
  matches a target derived from the letter "n|n" (or "H|H") pair. Clamp per-pair corrections to ±6% em and add
  wordmark tracking from G6. Arabic: no tracking. Spacing applies only between words or disconnected letters,
  never inside a joined cluster.
- **Craft moves** (exactly **one** per wordmark, chosen by vibe; boolean ops via paper.js headless or PathBool
  [[paper.js PathItem](https://unpkg.com/paper@0.12.18/dist/docs/classes/PathItem.html)]):

  | Move | Description | Fits |
  |---|---|---|
  | stem cut | a clean diagonal or horizontal notch through one stem/bowl at a construction angle (e.g. 30°) | circuit, kinetic, editorial |
  | ligature join | two adjacent letters share a stem or crossbar (t-t, f-i, s-t…) | maison, editorial |
  | tittle swap | i/j dot (or Arabic dots of a chosen letter) replaced by the brand glyph (circle, diamond, arch) | bloom, playground, souk |
  | terminal trim | one terminal cut flat/angled consistently with the symbol | garage, circuit |
  | weight shift | one letter (or the first) set one weight step heavier/lighter on the variable `wght` axis | apothecary, field |
  | counter accent | one counter filled with the accent colour (only when the counter ≥ 18% of the glyph box) | playground, hearth |
  | baseline shift | one glyph raised/lowered by ≤ 4% em with intent | editorial poster |

  Avoided: badges, seals, rotating-text rings, ribbons, banners, stamps, distressed or hand-drawn marks
  (owner rule). Gradients appear only in the optional app-icon tile, never in the mark.
- **Monogram on a construction grid:** a 24-unit square grid plus a circle grid (radii 6/9/12). Letters come from
  stroke skeletons (lines and quarter/half arcs) with one stroke width (unit 2.5–4) and one corner radius. For two
  letters: shared-stem, interlock (over/under via boolean subtract), or stacked. Enclosures: none, circle,
  squircle, arch (modern Moroccan), rounded square. Scored on optical centring (visual centroid within 2% of the
  centre) and stroke consistency.
- **Geometric symbols:** a shape grammar on a 2×2 or 3×3 module grid. Primitives: circle, half-disc, quarter-disc,
  square, arch, triangle, rounded bar. Rotational symmetry order 1/2/4/8 and positive/negative space. Souk adds
  `{8/3}` star-polygon line geometry as thin modern strokes (zellige reinterpretation, DESIGN.md §7 spirit).
  Each symbol is reduced to ≤ 4 primitives (simplicity rule).
- **Small-size test:** rasterise at 16 and 32px. Foreground coverage 20–60%, no feature thinner than 1.5px at
  32px, and the mark is still recognisable: perceptual-hash distance between the 32px and 256px renders (scaled)
  below a threshold **[threshold to tune]**. Marks that fail get a simplified favicon variant (monogram only).
- **Bilingual lockups:** Arabic and Latin set in fonts matched by visual weight/colour. Arabic at ~110–125% of the
  Latin size to balance visual height **[to tune per pairing]**. Do not force x-height matching (forum consensus
  above). Arrangements: side-by-side with a hairline divider (Arabic on the right in `ar` contexts, Latin first in
  `fr`/`en`), stacked (primary script on top), or symbol-centred. Never mirror Latin letters into fake Arabic; no
  decorative kashida stretching beyond 1 use; diacritics optional.
- **Colour:** ink + accent from the Brand Genome; mono and inverse always generated; contrast ≥ 3:1 for the mark
  on its ground (graphical object) and AA for any tagline; no-orange guard applied.
- **Names:** the local model may propose names and taglines (TENANCY-MAP §11 mentions brand-brief tasks), with
  the honesty guard. Show a plain note that trademark availability is the merchant's to check (we can't verify it).

### 7.3 Interaction (designer-grade, fast)

Show 6 candidates in 3 families (wordmark-led, monogram-led, symbol-led) plus live previews on the storefront
header, favicon tab, WhatsApp avatar, a shipping label and the OG card. Controls: "more like this" (mutate 1–2
genes), locks (font, colour, move), sliders (weight, spacing, symbol size), and an "Arabic first / Latin first"
toggle. The merchant can also upload their own logo. Then the designer only builds the lockups and exports
(extract colours with the existing `extractPalette`).

### 7.4 Optional provider (P2, opt-in, clearly marked)

Recraft documents vector generation and brand style controls in its API
([Recraft docs](https://www.recraft.ai/docs/api-reference/getting-started)); model names and pricing differ between
third-party listings **[unverified]**. If enabled per store: generate symbol ideas only, then pass them
through the same cleanup (path simplification, grid snapping, small-size test). Wordmarks stay procedural so the
typography stays exact. Default off (the owner prefers local AI).

---

## 8. Getting better over time (design learning loop)

- **Events** (per store, tenant-scoped): `design.directions_shown(genomes)`, `design.direction_chosen`,
  `design.gene_overridden(gene, from, to)`, `design.section_swapped`, `design.repair_applied`, `page.published`,
  plus storefront outcomes: visits, form starts, orders, confirmed orders, delivered orders. Delivered is the
  real COD outcome; it comes from the ops/agents area.
- **Priors:** `gene_stats(niche, gene, value, shown, chosen, kept_after_7d, orders, visits)` aggregated by the
  5-minute cron. Thompson sampling on Beta(chosen+1, shown−chosen+1) for "merchant taste" and on delivered-order
  rate for "performance". The performance signal gets weight only after ≥ 300 visits per value in a niche, to avoid
  noise **[threshold to tune]**.
- **Overrides teach:** if merchants in a niche keep switching `radius = round → crisp`, that prior shifts
  automatically. Platform admin sees a "design drift" chart and can pin or ban values.
- **Privacy/isolation:** only aggregated counts cross tenants. No store's content, genome or images are shown to another.
- This plugs into the platform's broader AI learning loop (separate research area).

---

## 9. Admin UI design upgrade (Linear / Vercel / Stripe / Framer level)

Direction: **calm graphite + one jade signal** (current `globals.css`), denser and faster, with more precise
motion. Concretely:

| Topic | Spec |
|---|---|
| Theme generation | 3 inputs (base neutral, accent, contrast) → full token set in OKLCH, as Linear does with LCH ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)); light/dark generated; no-orange scan (`qa/admin-visual/scan.mjs`) |
| Type | one UI sans with a display cut for headings (Linear uses Inter Display + Inter), tabular numerals in every table and KPI, 13px base in dense mode, 14px comfortable |
| Density | per-user toggle (comfortable / compact); tables 32px rows compact, 40px comfortable; sticky headers; column chooser |
| Command palette | `⌘K` for everything: navigate, switch store, create (page, product, offer, store), search orders by phone/ID, run actions (confirm order, assign agent), platform-admin actions (approve account). Show shortcuts. Sequence keys (G then O = orders) |
| Motion | 120–250ms, ease-out family (`cubic-bezier(.2,.8,.2,1)`-class), no bounce; list reorders with layout animation (motion); optimistic updates with undo toast (sonner) |
| Empty states | one sentence, one primary action, a *preview* of what will appear (skeleton or illustration of the real UI), never fake numbers |
| Data-viz | real data only; KPI tile = value + delta vs previous period + 28-day sparkline (only when ≥ 7 data points); COD funnel (orders → confirmed → shipped → delivered → cash collected); cohort tables; colour = neutral series + jade for "ours", crimson for loss, yellow for warn (no orange); recharts with tabular axes (the `dataviz` skill palette rules apply) |
| Layout | split views (list + detail drawer) for orders, pages, stores; resizable panels (`components/ui/resizable.tsx` exists); breadcrumbs with store switcher |
| Generation studio | directions shown as live previews with genome chips ("Editorial · Fraunces/Readex · ink+one · tight crops"), a "Why this design" line, sliders mapped to genes (Boldness → G2/G5/G10, Density → G20, Warmth → neutral hue, Motion → G23), Design check panel (§5.5), seed history with one-click restore |
| Platform admin | "mission control": store table with health (orders 7d, confirmation rate, delivered %, storage %, errors), approval queue for new accounts (with risk signals), per-store profile page with tabs (overview, orders, team, pages, logs, billing) |
| Craft checks | the DESIGN.md §9 checklist applied to admin screens; `qa/admin-design/shoot.mjs` screenshot pass at 1280/1440 + mobile 390 |

---

## 10. Prioritised backlog

| Feature | P | Effort | Why it matters to a COD seller |
|---|---|---|---|
| Design Genome v1 (schema, compile to ThemeSpec + overrides, back-derive for old pages) | P0 | L | Their store stops looking like the competitor's next door, which is the main promise of the product |
| Unlock archetype-locked attrs (GEN-06) + radius ladder + glass budget | P0 | M | Removes the biggest sameness and the visible "AI tells" right away |
| DESIGN.md v3 (budgets, de-orange GEN-14, new genes, tells list) | P0 | S | Every agent and generator reads it; it has to be right before build |
| Choreography grammar (replace 3 storylines) | P0 | M | Varied pages with the COD conversion invariants kept |
| Per-store brand seed + platform/niche distance check + reservation | P0 | M | Guarantees "never two near-identical stores" |
| Static quality gates + slop score + deterministic repairs + Design check panel | P0 | M | Bad layouts never get published; the merchant sees why |
| Copy cliché detector ar/fr/en + structure tags in the copy library | P0 | M | Copy sounds human and local; trust drives COD confirmation |
| Expand font pairings (≥ 8 per archetype; Arabic roster review) | P0 | M | Type is the fastest visible differentiator |
| Logo designer v1: shaped/outlined wordmarks + optical spacing + 1 craft move + monogram grid + exports (SVG/PNG/favicon/OG) | P0 | L | Most sellers have no logo; a good one makes the store and WhatsApp look trustworthy |
| Store theme across registers (home/collection/PDP/cart/thank-you/legal) | P0 | M | One brand everywhere |
| Section layout grammar (slots × arrangements) | P1 | L | ~10× layout space without 10× components |
| Novelty budget + MAP-Elites archive (direction 3 explores) | P1 | M | Keeps variety high as the platform grows |
| Learning loop: gene_stats + Thompson priors + drift chart | P1 | M | Designs that convert (delivered orders) get chosen more often |
| AI critique-and-repair with the local model (closed op vocabulary) | P1 | M | Catches subtler issues; stays fast and free |
| Bilingual Arabic/Latin lockups + symbol grammar | P1 | M | Moroccan stores need both scripts done right |
| Email/transactional token compiler | P1 | S | Confirmation emails and slips match the brand |
| Admin upgrade: density, palette actions, motion, KPI/funnel viz, generation studio | P1 | L | Faster daily operation for owner and agents |
| Visual CI (screenshots, SSIM near-dup, clipping) | P1 | M | Catches regressions the static gates can't see |
| Campaign mode for landing pages (brand-radius constraint) | P1 | S | Many landing pages per store without losing the brand |
| Squircle masks / `corner-shape` enhancement | P2 | S | Extra polish |
| Optional vector-AI symbol provider (Recraft-class) | P2 | M | Some richer symbols; paid and opt-in |
| Brand guidelines page export (PDF/HTML) | P2 | S | Sellers share it with printers and ad designers |
| Motion signature editor (custom easing per brand) | P2 | S | Fine control for premium brands |

---

## 11. Risks

- **Combinatorial quality drop:** more genes means more bad combinations. Mitigation: bold-genes-only sampling,
  a hard constraint layer, gates, and a 252-cell archive seeded with designer-approved genomes before launch.
- **Performance budget:** new arrangements and masks add CSS. Inline only used sections (existing), and keep the
  JS caps of docs/OFFERS.md §F.9.
- **Tenant leakage via distance checks:** compute server-side, return scores only, never genomes; audit-log.
- **Arabic shaping in logos:** wrong joining is unacceptable. Use HarfBuzz only and add a golden-test set of
  Moroccan store names.
- **Font roster growth vs. storage/perf:** each family adds files. Subset per locale and keep ≤ 2 preloads (existing `fontPreloads`).
- **Learning loop bias:** early merchants' taste could narrow variety. The novelty floor and exploration cell
  counter this.
- **Trademark collisions in logos:** we can't check them; say so plainly in the UI.
- **Over-correction:** some "tells" (bento, glass) are fine in moderation. We budget them; we don't ban them.

## 12. Unverified / to check before build

- Exact WASM size and Node 22 behaviour of harfbuzzjs; Arabic `glyphToPath` output for all manifest Arabic fonts.
- `@resvg/resvg-js` prebuilt binary on Hostinger Node 22 (glibc/linux-x64).
- paper.js headless (paper-jsdom) API for boolean ops on SVG path strings, or PathBool.js maturity.
- Final Arabic font additions (licence OFL, variable axes, design fit) on Google Fonts.
- CSS `corner-shape` / superellipse browser support.
- APCA thresholds (WCAG 3 is a draft).
- Email-client support for CSS variables (assumed poor; we inline anyway).
- Recraft API model names, SVG output parameters, pricing.
- All numeric thresholds marked "to tune" (distance τ, Jaccard limits, small-size phash, Arabic size ratio,
  300-visit learning floor) need calibration on a corpus of ~200 generated pages.
