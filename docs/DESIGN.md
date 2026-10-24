# Design Bible: Store Gen (v3, Genome)

Status: **v3**, 2026-10-24, written in core step C0 (track C0b, feature DG-01) from the content contract of
`docs/saas/spec/design.md` DES-§3 and the measured targets of `docs/saas/research/design-baseline.md` §5. It replaces
v2 ("COD Studio landing kit, Modern"). Docs only: the engine that enforces it is the design track P6 (genome, gates,
section kit), the core's budget gates (`docs/STORE-SAAS.md` §M.2) and landing's honesty gates (§M.3).

Every generator, build agent, reviewer and model prompt reads **§0 and §1 before touching a landing section, a theme
token or a line of copy**. The owner measured today's output at 4.3 / 10 with distinctiveness 2 / 10 (design-baseline
§2); this file turns each fault found there into a rule with a number and a gate.

**How to read a rule.** Each rule names the gate that enforces it: `V`, `S`, `C`, `N`, `T`, `K`, `I`, `R`, `RTL`, `D`
are the design gates (DES-§8.2, §8.3; the core sees them as `design:<id>`), `budget:*` are the core's (§M.2),
`honesty:*` are landing's (§M.3, always hard, no warn mode), `H01`-`H36` are the genome's coherence rules (DES-§4.4).
Where a rule replaces a measured fault, the baseline target id follows (design-baseline §5: N1-N8, C1-C7, T1-T8, K1-K8,
I1-I7, R1-R9, D1-D6, RTL1-RTL8, F1-F5). **Hard** = the page does not publish; **soft** = a note that lowers the quality
score Q and appears in Store Health.

**Precedence when two rules disagree** (DS34): the owner rules (§0) → the budgets (§1.1) → the gates and the slop score
(DES-§8; §11 here) → the compatible items of the anti-slop rubric (`qa/ref/anti-slop-frontend-rubric.md`; its orange
palette rows are void, its serif ban is replaced by the pairing rules of DES-§10, Arabic has its own type rules in
§2.3, and its "organic, messy numbers" advice is void because a page renders merchant numbers only).

**Two parts of this file are sources, not summaries.** The budgets table of §1.1 is the documented source of the
thresholds in `src/lib/render/prepublish/budget-limits.ts` (core §M.2), and the value sets of §2.5 are the source
`THEME_ATTR_VALUES` follows (`theme:check` compares the two in both directions, DES-§3.6). A change to either goes
through the maintainer (core §K.3) and changes code and file together. Everything else restates the design spec for
build agents: when a number here and in DES-§ disagree, the spec wins and this file is corrected.

| § | Chapter |
|---|---|
| 0 | Owner rules |
| 1 | Budgets, the tells list, the banned list |
| 2 | Token contract (incl. the §2.5 attribute value sets) |
| 3 | The genome: levels, the 35 genes, colour strategies |
| 4 | Archetypes as priors |
| 5 | Page choreography, the eight COD invariants, the fold contract, the composition sheets |
| 6 | Imagery, stages, masks, depth and the light kit |
| 7 | Motion |
| 8 | Copy voice |
| 9 | Registers |
| 10 | Logo and brand kit |
| 11 | Precision checklist (every line tagged with its gate) |
| 12 | Accessibility and performance |

**Where v2 sections went** (code comments still cite v2 numbers; read them through this map):

| v2 § | v2 title | v3 § |
|---|---|---|
| 1.1 | Banned | 1.3 |
| 1.2 | Required ("modern & premium") | replaced by the budgets (1.1), "what modern means" (0.2) and the depth recipes (6.6) |
| 2.1-2.5 | Token contract | 2.1-2.5 (same numbers; 2.5 extended) |
| 3 | Archetypes | 4 |
| 4 | Page rhythm (4.6 transitions) | 5 (5.4 backgrounds and transitions) |
| 5 | Imagery | 6 |
| 6 | Motion language | 7 |
| 7 | Decoration system | 6.7 |
| 8 | Copy voice | 8 |
| 9 | Precision checklist (and the landing browser floor) | 11 (browser floor: 12.3) |
| 10 | Accessibility & performance | 12 |

---

## 0. Owner rules

These are the owner's rules, quoted from `docs/HANDOFF.md` §2 and the project brief. They outrank everything below.

> **Rule 1.** **No orange, ever,** in the admin or the landing pages: no colour with OKLCH hue 25–75° and chroma >
> 0.06 (red-orange, coral, terracotta, amber, ochre). Beige/sand neutrals are fine. Crimson (< 25°) and yellow/gold
> (> 75°) are fine. New colour mixes must be registered with the blend guard (`src/lib/theme/blend.ts`).
> Checks: `qa/verify/orange-check.mjs` and `qa/admin-visual/shoot.mjs --scan-only`.
>
> **Rule 2.** **Design must be maximally modern, smooth and precise,** with no vintage/craft motifs and no generic AI
> look: precise spacing and alignment, intentional compositions, premium states, perfect RTL. See `docs/DESIGN.md`
> (banned list, §9 precision checklist, §10 budgets). *[v3: banned list §1.3, precision checklist §11, budgets §1.1.]*
>
> **Rule 4.** Natural Arabic copy (Darija-friendly for Morocco), French and English. Never invent prices, ratings,
> stock or reviews.

> *"Be modern into the maximum and smooth with every detail and styling; don't be based on old styles and shapes;
> high quality, creative, based on each product vibe."* (the product owner)

### 0.1 No orange: the exact band, the guard and the blend guard

- **The rule band.** No colour with OKLCH hue **25-75°** at chroma **> 0.06**, in any role: theme tokens, section data
  colours, brand picks, logo palettes, blends, shadows, glows, gradients, the admin. Neutrals of that hue at chroma ≤
  0.06 (cream, sand, cocoa) are allowed; crimson below 25° and golden yellow above 75° are allowed (gold for the accent
  and pop roles only under the gold band rule below). Gate: **V03** (hard, every role) and **H24** (no genome candidate
  whose compiled theme has an orange mix).
- **The engine's margin.** The engine never creates a colour on the edge of the rule: `ORANGE_GUARD`
  (`src/lib/theme/color.ts:262`) keeps generated colours out of hue **22-80°** (from **15°** when L ≥ 0.65, where a
  light red already reads salmon) above chroma 0.06 (**0.04** for pastels at L ≥ 0.8). `theme:check` reports the margin
  kept.
- **The gold band** (H34, **V37**, hard for the `accent` and `pop` roles; K6). Hue **75-95°** at chroma **> 0.10**,
  rendered to sRGB, is never the accent or the pop: on cheap AMOLED panels it reads as the forbidden colour. The repair
  is **"sand + signal"**: the gold becomes the page's warm neutral (chroma clamped to ≤ 0.06, "sand"), and the accent
  and pop are drawn from the families that flatter gold: olive 110-130°, teal 185-215°, majorelle 240-260°. Other roles
  in the band at C > 0.10 are a soft note.
- **The blend guard.** Two clean tokens can paint orange when the CSS mixes them: `color-mix()` tints, alpha washes
  composited over a block in sRGB, gradient stops, shadows tinted toward the accent (a crimson accent over a butter
  yellow field crosses the band at a 42 % mix). Every mix, gradient, tinted shadow, glow or wash a stylesheet paints is
  registered in `src/lib/theme/blend.ts` with the ratios it uses; `orangeMixes()` audits the emitted theme;
  `theme:check` and `test:design` fail on a mix that is not registered (DS48). A section variant never declares its own
  shadow or mix (§6.6).
- **Brand colours.** `nearestAllowed(hex)` moves a picked or extracted colour out of the band (to the side with the
  smaller ΔE, or muted to chroma ≤ 0.06), shows the before / after swatch for 6 s with a one-line note, and records the
  move; an uploaded logo file is never recoloured (core D37, DS17; §10.2).
- **Colour words.** No chapter after this one names an orange-family colour as something to use. The forbidden words,
  quoted here once as forbidden examples: orange, red-orange, amber, terracotta, saffron (as a colour), tomato, coral,
  ochre, apricot, peach, copper, rust, tangerine, "sun-warm"; in French ambre, safran, cuivre, abricot, pêche, corail;
  in Arabic برتقالي. Colours are named with the families of §4 and of DES-§20.3 (ivory, stone, ink, cream, sand,
  cocoa, rose, crimson, golden yellow, olive, lime, jade, teal, navy, blue, indigo, plum, violet, plus majorelle blue,
  sage, butter yellow, graphite, steel blue, signal yellow).
- **The owner's core market** (argan, honey, saffron) photographs inside or beside the band. Those
  pages are not refused: their gold or warm photo colour becomes the sand neutral and the accent comes from olive, teal
  or majorelle (§3.4).
- **Checks:** V03, V37, H24, `theme:check`, `test:design`, `qa/verify/orange-check.mjs` (rendered pages),
  `qa/admin-visual/shoot.mjs --scan-only` (admin).

### 0.2 Maximally modern, smooth and precise; never vintage, never generic AI

Modern here is not a mood board; it is one sentence per axis (DES-§3.4):

| Axis | What modern means on a Store Gen page | Gene |
|---|---|---|
| Composition | one composition idea per page, pushed hard; the supporting genes stay quiet | G2 |
| Hierarchy | type contrast is the hierarchy: hero display / body ≥ 2.5 (≥ 3 earns composition points) | G5 |
| Grid | an asymmetric grid with real negative space (5:7, 4:8, 3:9, golden; offset margins) | G3, G22 |
| Imagery | image-led crops from the focal point, never the same photo at the same crop twice | G18, G19 |
| Light and depth | budgets, not effects: five depth recipes, ≤ 2 glass surfaces, ≤ 2 glows, no aurora, no grain | G15, G16 |
| Motion | UI motion under 300 ms, reveals of 500-900 ms in one easing family, no bounce outside `playground` | G23 |
| Copy | copy that names the product's facts, the merchant's numbers, how it feels and how cash on delivery works | G28 |

Never vintage or craft (paper, tape, stamps, stitched edges, hand-drawn marks; §1.3), never the generic AI look (the
tells of §1.2), never a template (the genome draws a different composition for every store, §3).

### 0.3 Natural Arabic, French and English

Arabic is written for Morocco: MSA frames with Darija where the page register allows it (CTAs, the sticky bar, the
form reassurance and FAQ questions by default; §8.7), Western digits, no tashkeel in copy, one register per page.
French uses the product's real article ("ce sérum", "cette huile") and real quotes « ». English is its own line, never
a translation of the French. Gates: D3, D4, C02 (§8).

### 0.4 Never invent data

Prices, old prices, savings, ratings, review counts, stock figures, countdown end dates, stats, delivery fees and
times, names, cities, avatars and photo credits come from the merchant or they are not on the page. A section that
needs material the store does not have is never planned (invariant I6); copy-library figures are editor placeholders,
never page content (DS42). Gates: `honesty:D1`, `honesty:D2`, `honesty:I4`, `honesty:I5`, `honesty:LP-21` (always
hard), V20 (shown live in the builder).

---

## 1. Budgets, the tells list, the banned list

### 1.1 Budgets (per page; verbatim from DES-§3.2, the source of core §M.2)

"Gate" names the gate that reports or refuses (design gates DES-§8.10; `budget:*` = core §M.2); "Baseline" is the
value measured on today's generator (design-baseline §3-§5). The `budget:*` thresholds are code constants in
`src/lib/render/prepublish/budget-limits.ts`, each with its baseline value beside it.

| Budget | Limit per page | Gate (DES-§8.10) | Baseline |
|---|---|---|---|
| In-flow sections | 8-14 (hard above 16, `budget:C3`) | V24 / `budget:C3` | 27 |
| Estimated mobile height at 390 px | ≤ 12,000 px (hard above 15,000, `budget:C3`) | V24 / `budget:C3` | 26,525-31,757 |
| Order form | starts ≤ 3,000 px at 390 (grammar: ≤ 3 estimated screens), ≤ 1,100 px tall in its default state | V22 / `budget:F1` | screen 14-17, 2,840 px |
| First screen (390 × 844) | product image, price, primary CTA and the COD line inside it, every hero family and locale | V25 / `budget:C2` | 23 heroes below the fold |
| Primary CTAs | ≤ 6 (sticky bar counts as 1; hard above 8, `budget:R1`); ≤ 2 visible at once on mobile | V26 / `budget:R1` | 58-68 `.lp-btn` |
| Floating layers | ≤ 1 fixed bar + ≤ 1 float, fixed UI ≤ 88 px of 844, the bar hidden while any `[data-hero-cta]` (hero, form submit, final `cta`) or the order form is on screen at all (the frozen `sticky.ts`, `stickyVisible`; stricter than "≥ 50 % visible", DES-§5.9) | V27 | three layers colliding |
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
| Radius ladder | 4 tiers in **effective radius** (a pill = min(999, height / 2), so a 28 px chip pill is 14): chip < control ≤ card < media; pills are exempt from the ordering test; `mixed` ladder: control ≤ 8 px, media takes the `cut` or `rect` mask instead of `999` (rev 3, UX-12 / UX-25); nested radius = outer − padding | V05 | one rung 20-28 px |
| Signature details | 1 hero signature + ≤ 3 secondary details on the whole page (a detail = a ticking number, a drawn line, a floating chip, a scale-in image, a cursor-following glow) | S11 | every section |
| Tell devices (R8 list, 13 items in rev 3: ghost word, eyebrow set, hotspot trio, chat-mock problem, rotating stamp, tape marquee, big-number stats, desaturated slider, countdown, phone-mock reviews, giant footer wordmark, **figure captions "FIG. 01", padded list numbering "001 ·"**) | ≤ 2 per page in total; the two rev 3 additions ≤ 1 of the two per page and on ≤ 20 % of pages per niche; never the same pair twice in a niche (measured on the sweep and through `nicheShares.tells`, DES-§7.4); rotating stamp and scrapbook removed from the pools; the ghost word **default off** everywhere and sampled on ≤ 15 % of pages per niche; the hero emphasis device may be `none` (G26, ≥ 40 % prior mass) | S00 … S26 | all 11 on every page; the swoosh ≈ 20× |
| Bento compositions | ≤ 1 section | S08 | |
| Centred sections | ≤ 2 in a row and ≤ 50 % of in-flow sections; centre-aligned **body copy** on mobile ≤ 2 sections for most grammars and ≤ 4 for `poster`, `quiet-luxe` and `statement`-led pages (display-only centred sections do not count) (C6, rev 3) | V08, S05 | centred stack everywhere |
| Layout rhythm (rev 3, DS53) | ≤ 2 consecutive image + text splits (hard above); ≥ 4 layout families per 8 in-flow sections (soft below 4, hard below 3); media-led and type-led families alternate; no two adjacent sections with the same `arrange` | V38 | zigzag → image-text → comparison → mediaText |
| Density pattern | no 3 consecutive sections with the same density; airy ≤ 35 / balanced ≤ 70 / dense ≤ 120 **lead + body** words (C7; `faq`, `specs`, `comparison`, `orderForm`, `footer` exempt) | V09 | uniform |
| Aurora (a mesh of two or more soft lights: the `Aurora` component, `.lp-aurora`, `--lp-aurora` / `--lp-aurora-1..3`) and grain | **0 on every generated page** (rev 5, CRIT2-4; core D60 rev 3: no budget, removed like the admin's `adm-aurora` / `adm-grain`) | **V40 (hard)** | today's `poster` hero, both `cta` posters and the `ugc` cards paint seeded auroras |
| Glow (one product-tinted radial: the stage glow behind a cutout, `GlowOrb`) | ≤ 2 sections, ≤ 10 % alpha (the D60 thank-you allowance, applied to every page) | S06 | |
| Scrolling strips (marquee, ticker, ribbon) | ≤ 1 in the body; word-safe duplication; never clipped (I7) | V19, S14, V34 | boxed words |
| Giant decorative words (display ≥ 9 vw beside or behind content) | ≤ 1, never clipped in Arabic, the same product-name token as the chip (T8) | S12, V35 | "الآركان" vs "الأركان" |
| Chips laid over product photos | ≤ 2 per photo, on ≤ 1 photo per page | S13 | 3 callout pills |
| Middle dot `·` | ≤ 1 per metadata line, never in a headline | C07 | |
| Exclamation marks | ≤ 1 per page, in the final call to action only | C05 | |
| Easing | one family per page; overshoot only in `playground` (DS28) | V23 | 0.78 spring on 7 archetypes |
| Accent area | inside the colour-strategy band (G10) | V10 | not measured |
| Gold band (rev 3, UX-17) | hue 75-95° at chroma > 0.10 never on the `accent` or `pop` role (hard); neutrals and tints at C ≤ 0.06 allowed; repair "sand + signal" (DES-§4.10) | V37 (hard for accent / pop) | argan gold at 85-90° |
| Composition (rev 3, UX-16) | ≥ 1 full-bleed moment, ≥ 1 boundary cross, ≥ 1 quiet screen, hero type ratio ≥ 3, `G3.s` ≠ 1:1 with an offset margin, ≥ 3 distinct crops when ≥ 2 assets, **one declared hero signature** (soft −4 when absent); composition score 0-15 in Q, corpus median ≥ 10 | V39, C4 | 1:1 grids and framed photos everywhere |
| Page weight | ≤ 90 KB gz HTML, ≤ 16 `<picture>`, ≤ 2 font families / ≤ 4 font files (hard above 140 KB gz, `budget:F5`) | `budget:F5` (core) | ≈ 170 KB gz, 40-64 pictures |

How the table is applied:

1. **Heights are estimated, not measured** (no browser runs at publish on Hostinger). The height model
   (`src/lib/design/heights.ts`, DES-§5.3) gives the totals; the C3 and F1 hard lines are applied to the estimate × the
   band constant `HEIGHT_BAND = 0.8` (refused above 18,750 px estimated height or 3,750 px estimated form top), and C2
   to the estimate × `FOLD_BAND = 0.9` (refused when a fold item's estimated top passes 938 px). The zone between the
   soft and the hard line is a soft note whose message says "estimated" (`vars.estimated = 1`; core §M.2).
2. **The planner aims inside the soft lines with a margin:** 8-14 in-flow sections, ≤ 12,000 px, the order form within
   3 estimated screens (≤ 2,532 px, I2), the four fold items ≤ 760 px (I7). The hard lines are the backstop for owner
   edits in the builder.
3. **Experiment arms** (`[data-xa]` whose key is not `.a`, R3) are gated as their own documents: they are left out of
   the F5 picture count and of R1, R5 and I1 (core §M.2).
4. **Store page kinds** (R2) register their own profiles, which may only tighten these lines (core §M.2
   `registerBudgetProfile`, the D52 ceilings).
5. **The slop score** (§11.4) sums the tell detectors; ≥ 6 refuses (`design:R8`), 3-5 triggers repairs, the corpus
   median target is ≤ 2.

### 1.2 The tells list (each with its detector)

The "AI look" the owner banned, as the baseline renders and the 2026 rubric show it (DES-§3.3):

| Tell | Detector |
|---|---|
| purple or indigo accent and pop on a dark base | S01 |
| gradient text | S01 |
| glass on plain grounds | V06 |
| one radius everywhere | S03 |
| three identical cards | S04 |
| icons above every heading | S07 |
| a centred dark hero with a glow blob | S05, S06 |
| a hero metric with a gradient | S10 |
| bounce easing | S09 |
| decorative status dots | S16 |
| section-number and edition eyebrows | S15 |
| rotating-text ring badges | S17 |
| two scrolling strips | S14 |
| identical section headers (the same kicker + title + lead pattern in ≥ 4 sections) | S18 |
| pills laid over product photos | S13 |
| em and en dashes as separators | C01 |
| "Discover the world of…", "Découvrez l'univers…", "اكتشف عالم…" frames | C02 |
| adjective triads | C03 |
| "Not just X, Y" frames | C03 |
| empty superlatives | C02 |
| headlines revealed word by word (also the bidi breaker T2) | S19 |
| the chat-bubble "problem" block with fake timestamps | S20 |
| phone-mock WhatsApp reviews | S21 |
| big-number stats with gradient bars and footnoted sources (the figures themselves are an honesty refusal) | S22 |
| the countdown chip in the announcement bar, the urgency block and the CTA card | S23 |
| the giant cut-off wordmark footer | S24 |
| hotspot callouts pointing at nothing (merchant anchors only) | S25, `honesty:I5` |
| "4,7 (312)" default ratings and "il y a 2 jours" avatars | `honesty:D2` |
| the same photo at the same crop in every section | V14 |
| panel → tinted surface → card nesting | V29 |
| the eyebrow pill on every section | V30 |
| 58 buttons | V26 |

The **tell budget** (R8, S26): at most 2 of the 13 counted devices on one page (ghost word, eyebrow set, hotspot trio,
chat-mock problem, rotating stamp, tape marquee, big-number stats, desaturated slider, countdown, phone-mock reviews,
giant footer wordmark, figure captions "FIG. 01", padded list numbering "001 ·"), never the same pair twice in a niche.

### 1.3 The banned list v3 (with the 2026 AI tells)

Replaces v2 §1.1 and the v2 "Required" list (v2 prescribed glass chips over products, 20-32 px radii on every card and
a signature moment per section; v3 replaces those with the budgets of §1.1).

| Banned | Do instead | Gate |
|---|---|---|
| **Craft and vintage motifs:** paper, kraft, wood, linen or ink textures; washi tape; polaroids; post-its; rubber or ink stamps; torn paper; scalloped, zigzag, stitched or perforated edges; ticket stubs; caution stripes; rivets; stencil type; dashed borders; double-rule frames; ornamental flourishes; the scrapbook collage hero | clean surfaces, light, depth and type; the redrawn `guarantee:seal`, `cta:stamp`, `trustBar:stamps`, `marquee:tape`, `offer:tickets` keep their ids for old documents and draw no seal, stamp, tape or ticket shape | owner rule 2, pools (DES-§5.4) |
| **Any texture**, film grain included | none: grain is removed from generated pages (`data-texture` is always `none`) | V40 (hard), core D60 |
| **Aurora and mesh-gradient fields** (two or more soft lights: the `Aurora` component, `.lp-aurora`, `--lp-aurora*`) | a flat accent slab, or one product-tinted radial at ≤ 10 % alpha on ≤ 2 sections | V40 (hard), S06 |
| Hand-drawn scribbles, doodles, sketchy arrows, wobbly underlines | one clean vector stroke when a mark is needed (the hero swoosh, a precise leader line to a merchant anchor) | owner rule 2 |
| Purple → blue / indigo gradients, gradient text, neon and outer glows | product-derived colour; light only as the budgeted stage glow | S01, S06 |
| Everything centred; three equal icon cards; `rounded-2xl` + grey shadow everywhere | asymmetric grids, the opener grammar, the radius ladder, one card tier | V08, S04, S03, V05 |
| Glass as the default material | ≤ 2 glass surfaces per page, only over imagery or colour fields, opaque fallback | V06, `budget:R4`, H16 |
| Emoji icons, ✨, the generic stock-icon look | the custom icon set; no icon above every heading | emoji guard (hard), S07 |
| Uniform fade-up on every element; per-word headline reveals | the reveal plan: hero and section heads only, whole lines | V28, S19, T2 |
| Hype copy ("Elevate", "Unlock", "Revolutionize", "Seamless", "Game-changer", "Découvrez l'univers", "اكتشف عالم") | concrete, sensory, specific copy | C02, guard `BANNED` |
| Em and en dashes as separators, `·`-separated metadata-strip headlines, more than one "!" | periods, commas, colons; one exclamation, in the final call to action | C01, C07, C05 |
| Fake proof: invented ratings, review counts, stock, countdowns, "trusted by" logos, synthetic names and cities, avatars, photo credits as decoration, library percentages and "sources" | merchant data only, or the section is not planned | `honesty:D1`, `D2`, `I4`, `I5`, `LP-21` |
| Grey-500 body on white, default Inter everywhere | tinted neutrals from the product hue, the pairing catalogue (DES-§10.3) | V01, pairings F1-F15 |
| Rotating-text rings, badges on circular paths, seals, ribbons | plain text chips; Arabic never on a path | S17, RTL3 |
| Version, edition and section-number eyebrows ("Edition 01", "Brand · No. 01", "V2.0", "BETA", "001 · Capabilities", "الإصدار 01") | plain topic words, on ≤ ⌈n/3⌉ sections | S15, V30 |
| Decorative status dots before list items, badges or nav links | a dot only for a real state | S16 |
| Pills, chips and tags laid over product photos beyond the budget | ≤ 2 chips on ≤ 1 photo; a caption under the image instead | S13 |
| Two scrolling strips; marquees that clip words | ≤ 1 strip, whole-item duplication | S14, V19, V34 |
| Giant ghost words that clip Arabic, or spell the product differently from the chip | off by default; ≤ 1, sized to fit, the product-name token | S12, V35, RTL6 |
| Chat-mock problem blocks and phone-mock reviews | the problem ledger (S5 sheet) and plain quote cards (S6) | S20, S21 |
| Countdown chips in the announcement bar, urgency sections, a countdown without a merchant end date | one countdown, as a chip in the order form, with the merchant's end date | S23, V32, `honesty:LP-21` |
| Invented per-piece options, single-value pickers, underline-only inputs, upsells before submit | declared variants only, hidden single values, visible input boundaries ≥ 3:1, upsell after submit | F2, F3, F4 |
| Rotated or circular Arabic, reversed numeric ranges in RTL ("48-24"), "02 يومين" duals, old-style figures on prices | horizontal Arabic, LTR isolates, Arabic plural forms, tabular lining numerals | RTL1-RTL3, T1 |
| A third hue on a dark base; a light-background photo pasted on a dark ground as a fake cut-out | the pop as a tint of the accent; the photo framed on a panel or plinth (`framed-stage`) | V36, H25, H27 |
| Fake product UI built from boxes (fake dashboards, fake chat screens, fake terminals) | the merchant's real photos, or no preview | S20, S21, review |
| Decorative text strips across the hero ("BRAND. MOTION. SPATIAL."), scroll cues ("Scroll", animated mouse wheels), locale, time or weather strips, `01 / 4` counters on images | nothing: the hero needs no label, the user knows how to scroll | review (rubric §9.F) |
| A small paragraph floating in the top corner of a section header | the lead directly under the title, or a clean two-column opener (`caption`) | V30, review |
| Top and bottom borders on every row of a list or spec table; filled-track score bars | one hairline between rows; a number with its label | review, S22 |
| "Step 1 / Étape 1 / الخطوة 1" as a label | the step's own verb or noun; a plain list number (G25) is allowed | review |
| Pure black (`#000`) grounds and text | the palette's tinted ink | palette solver |
| Custom mouse cursors, cursor-following effects on text | the system cursor; a cursor-following glow only as a counted secondary detail on media | S11, review |

"Review" means no automatic gate yet: the design lead and the critic passes check it (DES-§17.6), and a detector may be
added to the slop score later.

---

## 2. Token contract

The theme engine (`src/lib/theme`) writes these on `:root` and on every `[data-bg]` section. Components use **only**
tokens for colour, type, radius, shadow and motion: no hex literal, no hard-coded radius, no local shadow (DES-§4.10.1).

### 2.1 Global palette

```
--lp-bg --lp-surface --lp-surface-2 --lp-soft --lp-ink --lp-ink-soft --lp-ink-mute --lp-line --lp-line-strong
--lp-accent --lp-accent-ink --lp-accent-soft --lp-accent-strong --lp-pop --lp-pop-ink --lp-dark --lp-dark-ink
--lp-success --lp-danger --lp-warn   --lp-a-50 … --lp-a-950   --lp-n-50 … --lp-n-950
```

Every colour comes from the product palette through the no-orange stack (§0.1). With `look` (§2.6) the strategy G9
decides how much of it is used where (§3.4); the palette solver still produces the colours.

### 2.2 Section-local palette

Every section root carries `data-bg="base|soft|surface|accent|dark|pop"`. Inside a section only `--sec-*` is used:

```
--sec-bg --sec-ink --sec-ink-soft --sec-line --sec-line-strong --sec-accent --sec-accent-ink
--sec-card --sec-card-ink --sec-chip --sec-chip-ink --sec-highlight
--sec-glass --sec-glass-ink --sec-glass-border --sec-glass-solid
--sec-success --sec-danger --sec-warn
```

Raw section grounds (dividers, overlaps): base `--lp-bg`, soft `--lp-soft`, surface `--lp-surface`, accent `--lp-accent`,
dark `--lp-dark`, pop `--lp-pop`. `--sec-glass-solid` is the opaque fallback every glass surface needs.

### 2.3 Type

```
--lp-font-display --lp-font-body --lp-font-accent --lp-font-label --lp-font-emphasis --lp-emphasis-style
--lp-display-weight --lp-display-weight-ar --lp-display-tracking --lp-display-case --lp-display-lh --lp-display-pad
--lp-body-lh --lp-body-weight --lp-medium-weight --lp-semibold-weight --lp-strong-weight --lp-accent-weight
--lp-label-case --lp-label-tracking --lp-num-copy --lp-ar-scale --lp-em-offset --lp-step--1 … --lp-step-6
```

`--lp-display-weight-ar`, `--lp-display-pad`, `--lp-num-copy`, `--lp-ar-scale` and `--lp-em-offset` arrive with the
typography engine (P6): `typeTokens(pairing, look, locale)` (DES-§10.5) computes the type tokens from measured font
metrics:

- **Scale:** fluid steps from G5; body 16 px (Arabic 17); the hero display ≥ **44 px** at 390 and ≥ 2.5 × the body
  (T6, V15); display `max-inline-size` 10-14 ch, ≤ 3 lines.
- **Latin tracking:** `−tk × log2(size / 16)` em, clamped −0.05…0, only on large display; +0.02…+0.06 em only on Latin
  uppercase labels ≤ 13 px.
- **Numerals:** `font-variant-numeric: tabular-nums lining-nums` on every price, counter, phone and quantity, in every
  face, serif included (T1). Old-style figures only in running serif copy (G8).
- **Arabic, under `[lang="ar"]`** (RTL7, T2, T3): no letter-spacing, no uppercase, no italics (italic emphasis becomes
  colour), no faux bold; Arabic display faces only (never `reem-kufi`, `noto-naskh-arabic` or `ibm-plex-sans-arabic` as
  display, F11); size from `--lp-ar-scale`, measured per pairing on Arabic glyphs and clamped to 1.04-1.14 (the v2
  "+6-10 %" rule is gone); display line-height ≥ 1.25 (≥ 1.32 for tall-mark faces) from the Arabic mark metrics, body ≥
  1.6; `padding-block` ≥ 0.12 em on display runs so marks never touch the line above; particles (`من في على إلى عن مع
  و`) bound to the next word so no line ends on one; whole-line breaking with `text-wrap: balance`, ≥ 2 words per line,
  2-3 lines at 390.
- **Until the Arabic metrics are measured** at build time (DES-R21), the engine uses a hand-tuned fallback table and
  nothing may call those values "measured" (the DNA card says "tuned").

### 2.4 Shape, depth, motion, space

```
--lp-radius-xs --lp-radius-s --lp-radius-m --lp-radius-l --lp-radius-xl --lp-radius-btn --lp-radius-media
--lp-radius-pill --lp-radius-panel --lp-panel-inset --lp-panel-gap --lp-border-w --lp-border-style
--lp-shadow-s --lp-shadow-m --lp-shadow-l --lp-shadow-glow --lp-shadow-product --lp-shadow-product-filter
--lp-highlight --lp-highlight-accent --lp-glass-blur --lp-glass-filter --lp-stage-glow
--lp-ease --lp-ease-out --lp-ease-in-out --lp-ease-expo-out --lp-ease-quint-out --lp-ease-spring --lp-ease-pop
--lp-dur-s --lp-dur-m --lp-dur-l --lp-stagger --lp-reveal-distance --lp-tilt-min --lp-tilt-max --lp-ornament
--lp-space-section --lp-container --lp-gutter
```

**Withdrawn on generated pages (core D60):** `--lp-grain`, `--lp-grain-opacity`, `--lp-aurora` and `--lp-aurora-1..3`
are no longer emitted once P6 merges; a stylesheet that reads them is a V40 failure. With `look`, `--lp-ease-spring`
is emitted only for the `soft-spring` family on `playground` and is absent elsewhere, so a stray selector cannot bounce;
every other curve, `--lp-ease-pop` included, has no perceptible overshoot outside `playground` (DS28, §7.3).

**Look tokens** (emitted only when the document carries `theme.look`, DES-§4.5.3):

```
--lp-radius-chip --lp-radius-control --lp-radius-card --lp-radius-media     (the G12 ladder; the --lp-radius-* scale is re-derived from it)
--lp-unit --lp-split-a --lp-split-b --lp-container --lp-gutter              (G3)
--lp-step-*  --lp-display-weight(-ar)  --lp-display-tracking  --lp-num-copy  (G5, G6, G8)
--lp-space-section                                                          (× G21)
--lp-ease --lp-ease-out --lp-dur-s --lp-dur-m --lp-dur-l --lp-stagger      (G23; durations = d × 0.45 / 0.8 / 1.15, clamped 160-1000 ms)
--lp-shadow-card --lp-shadow-float --lp-line --lp-highlight --lp-ring       (the depth recipes, §6.6)
--lp-stage-glow --lp-stage-glow-2 --lp-stage-contact --lp-stage-plinth --lp-stage-plinth-line   (the stage presets, §6.5)
--lp-reveal-i                                                               (the hero choreography slot index, §7.5)
```

The look adds geometry, type and motion tokens only; colour still comes from the palette solver, and every new mix a
stylesheet paints from these tokens is registered in `blend.ts` (§0.1).

### 2.5 Theme attributes on `<html>` (contract: exact value sets)

The engine emits these attributes and the CSS switches on them. The block below is parsed by `theme:check` and
compared with `THEME_ATTR_VALUES` (`src/lib/theme/archetypes.ts`, plus `ARCHETYPES` for `data-arch`) in both
directions, so it holds **one attribute per line, the name, then its values separated by ` | `, and nothing else**.
Old v1 values (paper, ticket, stamp, scribble, polaroid, halftone…) do not exist.

```
data-arch          maison | apothecary | souk | playground | kinetic | circuit | hearth | bloom | field | editorial | garage
data-btn           solid | pill | glow | soft | outline | underline
data-card          flat | soft | outlined | raised | glass
data-emphasis      swoosh | highlight | color | italic | none
data-mask          arch | circle | pill | rounded | rect | cut | blob
data-glyph         dot | spark | diamond | none
data-texture       none | grain
data-radius        none | subtle | soft | round
data-shadow        none | soft | deep | glow
data-surfaces      flush | panels
data-motion        calm | lively | off
data-base          light | tinted | dark
data-density       airy | balanced | dense
data-look          1
data-grammar       editorial-column | poster | gallery-led | stage | specimen | catalogue | split-tension | cinematic | quiet-luxe
data-ladder        crisp | soft | round | mixed
data-depth         flat | hairline | tonal | ambient | directional
data-labels        mono | smallcaps | plain
data-align         start | mixed | center-statement
data-img           cutout-stage | framed-stage | full-bleed-crop | framed | tight-detail | tonal-duotone | grid-contact
data-reveal-kinds  fade-rise | blur-in | mask-wipe | scale-in | line-draw
data-reveal-scope  heads | hero | none
data-numbering     none | plain | padded
data-caption       mono | smallcaps | italic-serif | plain
data-corner        circle | squircle
```

What each attribute carries:

| Attribute | Source | Notes |
|---|---|---|
| `data-arch` | G1 (`ThemeSpec.archetype`) | always present |
| `data-btn` | G27 (`look.btn`), else the archetype | the primary CTA is solid unless the family is `pill` or `glow` (H20); `glow` only on a dark base (H12) |
| `data-card` | the card of `look.depth` (flat → flat, hairline → outlined, tonal → soft, ambient → raised, directional → raised), else the archetype | `glass` only when the page's glass budget allows it and the variant asks for it |
| `data-emphasis` | G26 (`look.em`), else the archetype | hero title only; `italic` becomes `color` for Arabic; `none` = no emphasised word (prior ≥ 40 %) |
| `data-mask` | G17 (`look.mask`), else the archetype | `rect` and `cut` exist only with `look`; geometry in §6.5 |
| `data-glyph` | G25 (`look.kit.gl`), else the archetype | |
| `data-texture` | always `none` from P6 (core D60) | `grain` stays in the set because `ThemeSpec.texture` still validates it on old documents; it is ignored at render and the builder shows a one-line notice instead of the control |
| `data-radius` | the legacy kind nearest the ladder (crisp → subtle, soft → soft, round → round, mixed → subtle), else the archetype | old selectors keep working |
| `data-shadow`, `data-motion`, `data-base` | unchanged | `data-base="dark"` only under H27 (§3.3) |
| `data-surfaces` | unchanged | `panels` only with a flat or hairline card tier (H26) |
| `data-density` | G20 (`look.dens`), else the archetype | |
| `data-look` … `data-corner` | only when the document carries `theme.look` | `data-look="1"`, then G2, G12, G15, G7.lb, G22, G18 (as rendered: `framed-stage` until a real mask lands, §6.1), G23.r, G35, G25.nb, G25.cap, G13 (`squircle` is emitted only from DG-19) |
| `data-reveal-kinds` | G23.r (`look.mo.r`) | a token list: 1-2 of the values, space-separated. It is not called `data-reveal`, because the frozen runtime selects every `[data-reveal]` element (`src/landing/runtime/reveal.ts:16`) and `<html>` must not be one of them |

Document markers that are **not** theme attributes (written by the renderer from the document, outside
`THEME_ATTR_VALUES`): `data-cta-plan` on `<html>` (tokens `hide-header`, `collapse-float`, §5.5), `data-hero-cta` on the
hero CTA, the order form's submit and the final `cta` button, `data-sticky-cta` on the sticky bar (the runtime adds
`data-visible`), `data-reveal="<kind>"` on the elements inside the reveal scope, `data-bg` on sections, `data-num` on
numerals, `data-marquee` on scrolling tracks, `data-xa` on experiment arms; the runtime's own `html.lp-js`,
`html[data-rv]` and `[data-in]`.

### 2.6 Precedence (DS4)

An explicit ThemeSpec value that is not `"archetype"` (the builder's `radius`, `shadow`, `surfaces` overrides) wins over
the look; the look wins over the archetype default. **Texture is the exception:** the builder's texture override no
longer wins; the compiled theme always sets `data-texture="none"`. A document without `look` keeps today's tokens and
attributes; only the owner-rule fixes (the redrawn seal, stamp, tape and ticket variants, no rotating ring, no numbered
cover lines, no aurora or grain) and the overshoot fix (DS28) change how it renders, at its next render.

---

## 3. The genome

### 3.1 Levels, bold genes and solved genes

A page's design is a **genome of 35 genes** (DES-§4.1) in three levels: **brand** (stable across a store), **page**
(drawn per generation) and **section** (per section instance). Designers make a few strong decisions and keep the rest
quiet, so:

- **Seven bold genes are sampled** from priors: G1 vibe, G2 composition grammar, G9 colour strategy, G4 type pairing,
  G18 image treatment, G23.f motion family and G28 voice register, in that order, each conditioned on the earlier
  ones (DES-§4.4). The archetype is G1: **a prior over the other genes, never a lock** (DS1).
- **The other genes are solved** by a seeded, deterministic constraint solver (≤ 200 node expansions) that honours the
  hard coherence rules of §3.3, so the result looks decided, not random.
- **The four rhythm genes G32-G35** (openers, photos, CTAs, reveals) are solved from the plan after the section order
  exists; they are budgets, never sampled and never learned.
- **Seeds mix the store's brand seed and the inputs** (`deriveSeed(brand_seed, inputHash, "direction:<i>", attempt)`,
  DS5): identical photos in two stores diverge.
- **Locks and hints.** A brand-kit lock fixes a gene; a Director hint (cloud AI, optional) multiplies a gene value's
  weight by ≤ 3 and may pin one bold gene per direction; a hint that breaks a hard rule is dropped and logged (DS23,
  DS59). The engine-only path passes every gate (DS34).
- **Where it lives.** The full genome is a `design_genomes` row; the render-relevant part compiles to the optional
  `ThemeSpec.look` (≤ 700 B, no default, so documents without it checksum exactly as before; DS2).

### 3.2 The 35 genes, and what each one changes on screen

★ = bold (sampled). Values and back-derivation rules: DES-§4.2.

| # | Gene | Level | Values | What it changes on screen |
|---|---|---|---|---|
| G1 ★ | vibe | brand | 11 archetypes | the product world every other gene starts from (§4) |
| G2 ★ | composition grammar | page | 9 grammars | the page's one idea: the hero family, the section pools and the hero choreography (§5) |
| G3 | grid | page | 4 / 8 / 12 columns · split 1:1, 5:7, 4:8, 3:9, golden · margin narrow, wide, offset · container 1080-1440 · unit 4 / 8 | where columns break and how much negative space sits beside the text |
| G4 ★ | type pairing | brand | catalogue ids (DES-§10.3) | the display, body, accent and Arabic faces |
| G5 | type scale | brand | ratio 1.125-1.25 mobile, 1.2-1.5 desktop · display max 48-160 px | how large the hero title gets and how steep the hierarchy is |
| G6 | display weight, tracking | brand | weight in the face's range (Latin, Arabic) · tracking 0-0.03 | the colour of the display type; negative tracking on large Latin only |
| G7 | case and labels | brand | display none / uppercase · labels mono / smallcaps / plain | uppercase display (condensed or heavy grotesks only, H17; never Arabic) and the label voice |
| G8 | numerals in copy | brand | lining / oldstyle | old-style figures in running serif copy only; prices always tabular lining |
| G9 ★ | colour strategy | brand | 7 strategies | how much colour goes where (§3.4) |
| G10 | accent area | page | 0.03-0.35 | the share of the page painted with accent or pop grounds, inside the G9 band (H21) |
| G11 | contrast level | brand | standard / high | ink and line separation |
| G12 | radius ladder | brand | crisp 2/4/6/8 · soft 6/10/16/24 · round 999/14/24/32 · mixed 4/8/12 + media `cut` or `rect` (chip / control / card / media) | four distinct radii from one set (V05) |
| G13 | corner geometry | brand | circle / squircle | squircle corners (later, DG-19) |
| G14 | hairline | brand | 0 / 1 / 1.5 px · strength 0.08-0.3 | the weight of rules and frames |
| G15 | surface and depth | brand | flat, hairline, tonal, ambient, directional | the one card tier and its shadow recipe (§6.6) |
| G16 | glass budget | page | 0 / 1 / 2 | how many frosted surfaces the page may have, only over imagery or colour fields (H16) |
| G17 | mask family | brand | arch, circle, pill, rounded, rect, cut, blob | the shape media are clipped to (§6.5) |
| G18 ★ | image treatment | page | 7 treatments | how the merchant's photo is staged, framed or cropped (§6.1) |
| G19 | crop and focal | section | aspect 4:5, 3:4, 1:1, 2:3, 16:9, 21:9 · focal thirds / center / bleed | each slot's crop around the focal point |
| G20 | density | page | airy / balanced / dense · pattern ABAC / AAB / ABAB | words per section and the padding rhythm |
| G21 | section spacing | page | × 0.75-1.6 | the vertical space between sections |
| G22 | alignment bias | page | start / mixed / center-statement | which sections are centred (≤ 2 in a row) |
| G23 ★ (f) | motion signature | brand | family (6, sampled) · duration 180-900 ms · 1-2 reveal kinds · stagger 30-80 ms · scroll-linked on / off | how the hero arrives and how everything else answers (§7) |
| G24 | choreography | page | the grammar expansion record | the in-flow section order, the colour-moment slots, the boundary cross, the signature slot |
| G25 | detail kit | brand | glyph dot / spark / diamond / none · list numbering none / plain / padded · captions mono / smallcaps / italic-serif / plain | the small marks; numbering on list items only, never on eyebrows |
| G26 | emphasis | brand | none (≥ 40 %) / swoosh / highlight / color / italic | the one emphasised word in the hero title, or none |
| G27 | button family | brand | solid / pill / soft / outline / underline / glow | the button shape; `underline` only on editorial-column, quiet-luxe and catalogue pages (H20) |
| G28 ★ | voice register | brand | plain, warm, precise, bold, poetic-restrained | sentence rhythm, headline structures and what a lead may do (§8.1) |
| G29 | headline structure | section | 7 structures | the shape of each title (§8.2) |
| G30 | sentence rhythm | brand | mean words 5-14 · exclamations 0 / 1 | sentence length |
| G31 | Darija ratio | brand | none / cta / light | where Darija may appear in Arabic copy (§8.7) |
| G32 | openers and kicker budget | page | kickers on ≤ ⌈n / 3⌉ sections; one of 6 openers per section | how each section begins (§5.3) |
| G33 | photo-use plan | page | ≤ 3 uses per asset, roles, ≥ 3 crops | which photo appears where, at which crop (§6.2) |
| G34 | CTA plan | page | ≤ 6 primary CTAs incl. the sticky bar | which sections carry a button (§5.5) |
| G35 | reveal plan | page | scope heads / hero / none; ≤ 60 nodes | which elements reveal on scroll (§7.4) |

### 3.3 Coherence rules a designer must know (hard; DES-§4.4)

| Id | Rule |
|---|---|
| H01 | a calm mood excludes the poster grammar, color-field, the bold voice, soft-spring motion, more than one glass surface and the marquee |
| H03 | a Didone or hairline-serif display (Bodoni Moda, Instrument Serif) needs a display max ≥ 56 px, tracking ≤ 0.02, a crisp, soft or mixed ladder and flat, hairline or directional depth |
| H04 | `poster` needs display weight ≥ 700 (or Big Shoulders), a desktop ratio ≥ 1.4 and color-field, duotone or mono+signal |
| H05 | `quiet-luxe` needs airy density, accent area ≤ 0.10, ≤ 1 glass surface, durations ≥ 600 ms and ink+one, dark-luxe, tonal or high-key |
| H06 | `specimen` needs mono or smallcaps labels, a ≥ 1 px hairline and a crisp or mixed ladder |
| H07-H09 | `cinematic` needs full-bleed-crop or tight-detail; `gallery-led` needs ≥ 3 photos and grid-contact, framed, full-bleed-crop or tonal-duotone; `stage` needs cutout-stage or framed-stage |
| H11, H12 | dark-luxe needs a dark base and flat, hairline or directional depth; a glow button needs a dark base |
| H13 | photo facts decide the treatment, slot by slot and breakpoint by breakpoint (§6.4) |
| H14 | the ladder's tiers strictly increase (mixed: control ≤ 8 px, media `cut` or `rect`); nested radius = outer − padding |
| H15 | any overshoot easing belongs to `playground` only |
| H16 | glass only over imagery or colour fields (color-field, duotone, dark-luxe, or a full-bleed or cut-out image) |
| H20 | the primary CTA is solid unless the button family is pill or glow |
| H21 | the accent area sits inside its strategy's band (ink+one 0.03-0.08, duotone 0.12-0.22, color-field 0.25-0.35, tonal 0.08-0.16, dark-luxe 0.04-0.10, high-key 0.10-0.20, mono+signal 0.03-0.06) |
| H22 | split-tension and editorial-column never use a 1:1 split; an offset margin needs 12 columns |
| H24 | no orange anywhere in the compiled theme; a brand lock that cannot be kept fails the candidate |
| H25 | the pop lies within ±30° of the accent (analogous) or 150-210° from it (complement), chroma within ±0.04; on a dark base the pop is a tint of the accent |
| H26 | one ground + one card tier; `panels` only with flat or hairline cards; a card inside a card is a compile error |
| H27 | a dark base only for dark-luxe or mono+signal, and only when the photo has alpha, a dark background, or is framed on a panel or plinth |
| H28-H32 | the fold contract (§5.6), the opener grammar (§5.3), the photo plan (§6.2), the CTA plan (§5.5), the reveal plan (§7.4) |
| H33 | anti-concentration: when a niche (≥ 10 stores) shows a grammar, strategy, hero family, display face or pairing near its cap, its prior weight falls (caps: grammar ≤ 25 %, colour strategy ≤ 25 %, hero family ≤ 20 % per niche, Arabic display face ≤ 30 %, Latin display family ≤ 20 % platform-wide, Fraunces and Instrument Serif ≤ 8 % each platform-wide) |
| H34 | the gold band (§0.1) |
| H35 | Act2 ordering: ≤ 2 consecutive image + text splits, ≥ 4 layout families per 8 in-flow sections, no two adjacent sections with the same arrangement |
| H36 | the one-asset grammar (§6.3) |

### 3.4 Colour strategies and the surface system (G9; DES-§4.10)

Seven strategies, each a complete colour **plan**, not a harmony name. Every colour still comes from the product palette
through the no-orange stack; the strategy decides how much of it is used where. Any one strategy stays ≤ 25 % per niche
(H33; K1).

| Strategy | Intent | Base (H27) | Harmonies kept (`palette.ts:182`) | Moments (I4) and accent area (G10 band) | Pop rule (H25) | Surfaces (H26) | Baseline fault it ends |
|---|---|---|---|---|---|---|---|
| ink+one | one neutral page, one accent used identically everywhere | light or tinted | ink-accent, cool-precise, mono-luxe | 1 moment; 3-8 % | pop = a tint of the accent (no second hue) | flush, hairline or flat cards | "teal marquee in a gold-toned page" |
| duotone | accent + pop fields, both from the photo | light or tinted | pop-complement, blush-berry, clay-sage, earth-triad | 2 moments (accent, pop); 12-22 % | complement 150-210° or analogous ±30°, chroma ±0.04 | flush; one card tier | "4-9 slabs" |
| color-field | one big full-bleed block per screen, type on colour | light | pop-complement, warm-butter, contrast-neon (playground, kinetic only) | ≤ 1 per screen, ≤ 4 per page; 25-35 % | as duotone | flush; cards only on neutral screens | saturation fatigue (red hero + red cards + red stats) |
| tonal | tints of one hue, depth by lightness | tinted | clay-sage, mono-luxe, earth-triad | 1-2 moments; 8-16 % | pop = the same hue at another lightness | may add one tonal layer (the one exception to one-card-tier) | "panel → surface → card" |
| dark-luxe | deep ground, one accent, photos cut out or framed | dark (H27 conditions) | mono-luxe, ink-accent | 1 moment; 4-10 % | none: pop = accent tint; no third hue on dark | flat or hairline; no raised cards | muddy near-black + cream photo rectangle |
| high-key | very light page, pastel pop, ink type | light | blush-berry, warm-butter, cool-precise | 1 pastel moment; 10-20 % | pastel pop (C ≤ 0.08) analogous to the accent | flush; hairline cards | |
| mono+signal | greys and one signal colour on CTAs | light or dark | ink-accent, cool-precise | CTAs + 1 moment; 3-6 % | pop desaturated (C ≤ 0.04) | hairline | |

- **Surfaces** (K5, V29): one ground per section (base, soft or surface; never more than two neutral tiers in a row),
  **one card tier** for the page (from G15), and **no card inside a card**. `data-surfaces="panels"` (sections as inset
  rounded panels) only with a flat or hairline card tier. Glass is a budget over imagery or colour fields, never a tier.
- **Full-bleed moments** are planned by the grammar and counted by `budget:K2` (≤ 2; color-field ≤ 1 per screen, ≤ 4).
- **Base from the photo** (H27; K8): the base lightness follows the photo background and the strategy; a tinted
  neutral stays within ±25° of the photo's dominant hue or the accent (never a rose base for an olive product).
- **Worked example: argan gold** (`argan-gold` fixture). Extraction gives a dominant `oklch(0.72 0.14 88)` and a
  secondary `oklch(0.35 0.05 70)`. The gold band fires: the neutral takes hue 88 at chroma 0.03-0.06 (sand ground
  `oklch(0.96 0.03 88)`, cocoa ink `oklch(0.28 0.04 80)`), the accent is the olive analogue `oklch(0.46 0.10 122)` (AA on
  sand), the pop is teal `oklch(0.55 0.11 200)` for duotone or the accent's tint for ink+one; tonal keeps the gold
  family as lightness steps of the sand; dark-luxe sets the ground to `oklch(0.20 0.02 80)` with the photo framed on a
  surface panel. The honey fixture (dominant hue 78) and a third fixture whose dominant sits inside the forbidden band
  (moved by `nearestAllowed` first) take the same path; on all three `orangeMixes` is empty and no accent or pop has a
  hue in 22-95° at C > 0.10.

### 3.5 Distinctness (DES-§7)

Every new page is compared, by numbers only, with every live store: platform-wide distance d ≥ **0.25**, same niche d ≥
**τ_niche(n)** (0.40 while the niche has ≤ 20 live stores, falling to 0.30 at ≥ 100), the store's own pages of the same
product d_page ≥ **0.30**, and d < **0.12** is a clone. At publish a `too_close` band is hard (`design:N1`, `design:N2`),
except the server-verified exhaustion path of a crowded niche (a note, never a near-copy). The wizard never shows a
`too_close` candidate; clients only ever see verdict bands ("Distinct across the platform"), never another store's
numbers or design (DS6, DS7, DS27). Headlines: a generated line whose 3-gram shingles exceed 25 % of the niche is
recomposed (`design:N8`, hard on generated text, soft on the owner's own words).

---

## 4. Archetypes as priors

G1 is drawn first and conditions the other bold genes; it never fixes them. Every value not listed in an archetype's
prior keeps a floor weight of 0.02 unless a hard rule forbids it, so every grammar and strategy stays reachable (N5).
Direction 1 takes the best-fit archetype after the anti-concentration factor; directions 2 and 3 are drawn from the next
five (DES-§4.3). The numbers below are the designer-set starting priors (G2 grammar, G9 strategy, G28 voice); the
calibration may move them, never below the floor. The motion family is conditioned on the grammar, not the archetype
(§7.1); the archetype only grants `playground` its soft spring. The faces named per archetype come from the pairing
catalogue (DES-§10.3, ≥ 8 pairings per archetype, rules F1-F15), which is the source; colour words come from the
allowed families only (§0.1).

**`maison`: perfume, watches, jewellery.** Quiet luxury: one object lit on a still ground, hairline structure, vast
space. Grammar: quiet-luxe .30, cinematic .22, editorial-column .18, gallery-led .12, split-tension .10, stage .08.
Strategy: dark-luxe .34, ink+one .28, tonal .20, mono+signal .10, high-key .08. Voice: poetic-restrained .5, plain .3,
precise .2. Type: high-contrast serifs (Bodoni Moda, Gloock, Instrument Serif, Fraunces; Cormorant Garamond and DM Serif
Display join in R1) over a quiet grotesk body (Instrument Sans, Schibsted Grotesk, Hanken Grotesk); Arabic display
Alexandria at light weights, Readex Pro, or El Messiri beside a serif (F14). A Didone display brings H03 with it.
Stage preset `glow` for cut-outs. Colours: ink or ivory grounds, stone and sand neutrals, one deep accent (plum, navy,
crimson or jade). Never gold as the accent (§0.1), never glass chips on the bottle.

**`apothecary`: skincare, health, supplements.** Clinical clean: ingredient facts, precise hairlines, generous ground.
Grammar: specimen .30, split-tension .20, editorial-column .18, stage .14, quiet-luxe .10, catalogue .08. Strategy:
ink+one .30, high-key .24, mono+signal .20, tonal .18, duotone .08. Voice: precise .5, plain .35, warm .15. Type:
grotesks and quiet serifs (Schibsted Grotesk, DM Sans, Instrument Serif, Fraunces, Bodoni Moda; Manrope joins in R1)
with a mono accent for facts (JetBrains Mono, IBM Plex Mono); Arabic display Vazirmatn, Alexandria, Readex Pro, El
Messiri beside a serif. Stage preset `contact`. The specimen grammar brings mono or smallcaps labels and a hairline
(H06). Colours: ivory and stone grounds, a sage, jade, teal or navy accent. Never an invented percentage or "tested"
claim (`honesty:D2`).

**`souk`: argan, honey, crafts, traditional wear.** Modern Moroccan: the product's own warmth on clean arch masks, thin
modern geometry, nothing souvenir. Grammar: gallery-led .24, cinematic .20, editorial-column .18, split-tension .16,
stage .12, poster .10. Strategy: tonal .26, duotone .24, color-field .20, ink+one .16, dark-luxe .14. Voice: warm .4,
poetic-restrained .3, plain .3. Type: Bricolage Grotesque, Young Serif, Archivo, Instrument Serif, Fraunces over Figtree,
DM Sans or Hanken Grotesk; Arabic display Noto Kufi Arabic, Changa, Alexandria, Readex Pro, El Messiri beside a serif
(Reem Kufi only as a small label face ≤ 20 px, never display, F11). Stage preset `glow`; the `arch` mask; abstract
zellige line geometry at ≤ 6 % opacity counts as a secondary detail. Colours: majorelle blue, deep teal, rose clay (low
chroma), olive, sand. Argan and honey photos sit in or near the gold band and take sand + signal (§3.4). Never
lanterns, carpets, arabesque frames, calligraphic display or rotated Arabic.

**`playground`: kids, toys, pets, fun gadgets.** Playful modern: vivid colour fields, big rounded shapes, crisp vector
stickers. Grammar: poster .30, stage .22, gallery-led .18, split-tension .16, catalogue .14. Strategy: color-field .32,
duotone .30, high-key .22, tonal .16. Voice: warm .45, bold .35, plain .2. Type: heavy grotesks and soft serifs
(Bricolage Grotesque 800, Archivo 800, Big Shoulders Display, Young Serif, Fraunces 700; Syne joins in R1) over Figtree
or DM Sans; the playful Arabic faces Baloo Bhaijaan 2, Lemonada and Marhey are allowed here (F7), and Changa. The only
archetype with the `soft-spring` family (ζ 0.86, never on layout properties, H15) and the `contrast-neon` harmony.
Stage preset `plinth`; directional depth as a drawn offset plate. Colours: blue, jade, lime, violet, rose and butter
yellow fields.

**`kinetic`: sport, fitness, massage.** Sport-tech: dark grounds, one electric signal, condensed heavy type, velocity.
Grammar: poster .32, cinematic .26, split-tension .18, stage .14, specimen .10. Strategy: mono+signal .28, color-field
.24, duotone .22, dark-luxe .16, ink+one .10. Voice: bold .5, precise .25, plain .25. Type: Archivo 900, Big Shoulders
Display, Bricolage Grotesque, Schibsted Grotesk, Hanken Grotesk 800 (Syne joins in R1) with mono accents; Arabic display
Changa, Noto Kufi Arabic, Alexandria (Kufam joins in R1). Uppercase display only on condensed or heavy
grotesks (H17), never in Arabic. Stage preset `plinth`; plate depth; clean speed streaks count as a secondary detail.
Colours: ink and graphite grounds, one signal (lime, jade, crimson or electric blue).

**`circuit`: tech, gadgets, electronics.** Precision tech: black and white with one signal, mono labels, spec numbers,
thin lines. Grammar: specimen .34, stage .26, split-tension .16, catalogue .14, cinematic .10. Strategy: mono+signal
.30, dark-luxe .26, ink+one .24, duotone .12, high-key .08. Voice: precise .55, plain .3, bold .15. Type: DM Sans,
Archivo, Bricolage Grotesque, Schibsted Grotesk, Instrument Serif (Manrope joins in R1) with JetBrains Mono
or IBM Plex Mono; Arabic display Cairo, Alexandria, Noto Kufi Arabic, Readex Pro, Changa (Kufam joins in R1). Stage
preset `plinth`; plate depth. Colours: ink, ivory, stone greys, one signal (blue, jade or lime). Never a fake product
UI built from boxes, never an invented spec number.

**`hearth`: home, kitchen, cleaning.** Soft home: daylight, warm creams, pillowy friendly shapes. Grammar:
split-tension .24, stage .22, gallery-led .20, editorial-column .18, catalogue .16. Strategy: tonal .28, high-key .24,
duotone .20, ink+one .18, color-field .10. Voice: warm .5, plain .35, precise .15. Type: Fraunces, Instrument Serif,
Gloock, Young Serif, Bricolage Grotesque (DM Serif Display joins in R1) over DM Sans or Figtree; Arabic display
Alexandria, El Messiri beside a serif, the playful Marhey and Baloo Bhaijaan 2 (F7). Stage preset `contact`. Colours:
butter yellow, olive, sage, cream. Never tile textures or gingham.

**`bloom`: beauty, makeup, accessories.** Beauty glow: soft light, glossy highlights, an elegant serif beside a clean
sans. Grammar: gallery-led .26, editorial-column .20, quiet-luxe .20, split-tension .18, stage .16. Strategy: high-key
.30, tonal .28, duotone .20, ink+one .14, color-field .08. Voice: warm .4, poetic-restrained .35, plain .25. Type: Bodoni
Moda, Fraunces, Instrument Serif, Young Serif, Gloock (Cormorant Garamond joins in R1) over Figtree, DM Sans or Instrument
Sans; Arabic display El Messiri, Readex Pro, Alexandria, Lemonada (F7). Stage preset `glow`; the arch enclosure is
allowed for monograms. Colours: rose, plum, ivory and sand, with a pastel pop (C ≤ 0.08). Never glitter or gradient text.

**`field`: organic food, eco, plants.** Fresh organic: natural light, greens, minimal line icons. Grammar:
editorial-column .26, cinematic .22, gallery-led .20, split-tension .18, specimen .14. Strategy: tonal .30, ink+one .24,
duotone .18, color-field .14, dark-luxe .14. Voice: plain .4, warm .35, poetic-restrained .25. Type: Instrument Serif,
Gloock, Archivo, Bricolage Grotesque, Fraunces (Cormorant Garamond and Manrope join in R1); Arabic display Alexandria,
El Messiri beside a serif, Changa, Cairo, Noto Kufi Arabic. Stage preset `contact`. Colours: olive, sage, lime, jade and
cream. Never kraft paper or leaf scribbles.

**`editorial`: fashion, minimal, general.** Swiss editorial: a strong grid, large type, monochrome plus one accent,
captions. Grammar: editorial-column .32, gallery-led .22, cinematic .18, split-tension .14, quiet-luxe .14. Strategy:
ink+one .32, mono+signal .22, tonal .18, color-field .16, dark-luxe .12. Voice: poetic-restrained .35, plain .35,
precise .3. Type: Bodoni Moda, Fraunces, Gloock, Schibsted Grotesk 800, Big Shoulders Display 800 (Cormorant Garamond
and DM Serif Display join in R1) with a mono accent; Arabic display El Messiri beside a serif, Readex Pro, Noto Kufi
Arabic, Alexandria, Changa (Vazirmatn joins in R1). Stage preset `contact`. Colours: ink and ivory with one accent
(crimson, navy, jade or violet). Never numbered or edition eyebrows (S15); figure captions are a counted tell.

**`garage`: tools, car, grooming.** Industrial modern: graphite and steel, condensed type, precise lines, without tape,
stencil or rivets. Grammar: specimen .28, poster .24, stage .20, split-tension .16, cinematic .12. Strategy: dark-luxe
.30, mono+signal .30, ink+one .20, duotone .12, color-field .08. Voice: precise .4, bold .35, plain .25. Type: Archivo
900, Schibsted Grotesk 800, Big Shoulders Display, Hanken Grotesk 800, Bricolage Grotesque 800 (Syne joins in R1) with
mono accents; Arabic display Changa, Noto Kufi Arabic, Alexandria, Readex Pro (Kufam and Vazirmatn join in R1). Stage
preset `plinth`; plate depth. Colours: graphite, steel blue, signal yellow. Never caution stripes or metallic sheens.

---

## 5. Page choreography, the COD invariants, the fold and the composition sheets

### 5.1 The grammar (DES-§5.1)

The three fixed storylines are gone. A page is expanded from this grammar; only the hero (first in flow) and the
footer (last) have fixed positions.

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

- **Production weights** come from G1, G2, the mood and the inputs (DES-§5.1): Act1 favours a single Promise; two-block
  Act1 openings survive when the hero is compact; Act2 holds 2-4 blocks (3 most often); Close has six productions.
- **Act2 is ordered, not shuffled** (H35, V38): the density pattern is honoured, media-led and type-led layout families
  alternate, ≤ 2 consecutive image + text splits, ≥ 4 layout families per 8 in-flow sections, no two adjacent sections
  with the same arrangement; then a 4-section subsequence used by ≥ 50 % of the store's or the niche's pages is redrawn.
- **Targets** (N3): ≥ 60 distinct in-flow orders per 100 pages in one niche, no 4-section subsequence on > 50 %, the
  order form's position entropy ≥ 1.0 bit and the final section's ≥ 1.2 bits.

**Grammar → variant pools** (weights; the archetype's preferred variants still filter what fits; DES-§5.4):

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

Out of every pool: `hero:scrapbook` (banned aesthetic; `hero:contact` replaces it), `faq:chat` and `problem:chat` (chat
mock-ups), `trustBar:stamps`, `urgency:*` (the form chip replaces it). `benefits:icons` is weighted × 0.5 everywhere
(S07) and `benefits:bento` appears at most once (S08). `stats:*` enters a pool only with ≥ 2 merchant figures. A variant
whose material the page lacks is removed before the draw, so the honesty gate is a backstop.

### 5.2 The eight COD invariants (hard; V22 and the core budget gates)

| Id | Invariant | Also measured by |
|---|---|---|
| I1 | every hero CTA targets the order form anchor (`#order`) | V21 |
| I2 | the order form starts within the first **3.0 estimated mobile screens** (390 × 844, DES-§5.3), i.e. ≤ 2,532 px (stricter than the core's 3,000 px) | `budget:F1` (core §M.2) |
| I3 | when an `offer` section exists, it is before the final `cta` | — |
| I4 | one full-bleed colour moment (background accent, dark or pop) starts in the top half of the estimated page height; ≤ 2 such moments per page (color-field ≤ 4, ≤ 1 per screen) | V10, `budget:K2` |
| I5 | no two consecutive in-flow sections share a background (§5.4 here, `assignBackgrounds`) | V07 |
| I6 | reviews, socialProof and stats appear only with owner-provided data (LP-02; `plan.ts` reservations keep their honesty filters); beforeAfter, video, gallery, ugc, lookbook and hotspots only with the material DS42 names | `honesty:I4`, `honesty:I5`, `honesty:D2` (landing) |
| I7 (rev 2; rev 3 three zones, DS41) | the fold contract of the chosen hero family holds at 390 × 844 for the page's locale: the planner targets the four fold items ≤ **760 px** (estimate), the gate refuses above **938 px**, the band between is a soft `estimated` note (DES-§5.12) | V25 (static), `budget:C2` (core §M.2; the Playwright measurement is the calibration check on the corpus, not the publish decision) |
| I8 (rev 2) | 8 ≤ in-flow sections ≤ 14 and estimated mobile height ≤ 12,000 px; the expansion never emits more (the core's hard caps 16 / 15,000 are a backstop for owner edits in the builder) | V24, `budget:C3` |

Soft (V24): ≤ 1 scrolling strip in the body (V19 is hard above 1); an estimated length of 8-14 screens.

### 5.3 Openers and the kicker budget (G32; C5)

- Every in-flow section opens with one of six structures: `bare` (title only), `caption` (a small caption column at
  inline-start, no kicker), `number` (a plain list number, never on the kicker), `quote` (the lead first, as a pulled
  line), `image` (the section's first image above the title), `kicker` (kicker + title + lead).
- Budget: the kicker on ≤ ⌈in-flow sections / 3⌉ sections (the hero counts), never on two neighbours, never on the
  order form or the footer; plain topic words only, no numbering, no "Edition 01" (S15).
- Variety: ≥ 5 distinct openers per page, no opener on > 50 % of sections (hard above 70 %, V30).
- Affinities: editorial-column and quiet-luxe lean to `caption` and `bare`; specimen and catalogue to `number` and
  `bare`; poster and cinematic to `image` and `bare`; split-tension and stage to `kicker` and `quote`; gallery-led to
  `image`.
- The hero's emphasis device (G26) is on the hero title only; section titles carry no emphasis.

### 5.4 Backgrounds and transitions

- No two consecutive in-flow sections share a background (I5, V07, `assignBackgrounds`); the colour moments are the
  slots the plan reserves (I4; ≤ 2, color-field ≤ 4).
- One boundary cross per page (a product or thumbnail overlapping a panel edge, or the `hang` / `overlap` arrangement)
  and one quiet screen (≤ 35 words, ≤ 1 image; C4).
- Transitions between sections are modern only: `none` (space and a ground change), `curve` (one smooth large curve),
  `diagonal` (a subtle clean angle), `steps` (a clean offset), `arch` (one smooth arch), `wave` (one gentle wave),
  `fade` (a gradient between the two grounds, registered with the blend guard). Never torn, zigzag, scalloped,
  stitched, taped or ornamental edges; prefer overlaps and rounded panels.

### 5.5 CTAs and floating layers (G34; R1, R7)

- **Primary CTAs:** the hero's, the order form's submit, the final `cta` block's and the sticky bar (counts as one):
  ≤ 6 per page (hard above 8, `budget:R1`), ≤ 2 visible at once at 390. `benefits`, `reviews`, `story`, `guarantee` and
  `faq` render no button in new documents; `offer:showcase` has none (the picker lives in the form).
- **One intent, one label:** the hero, form and final CTA share the copy's `cta` string; WhatsApp is the only other
  intent.
- **Floating layers:** ≤ 1 fixed bar + ≤ 1 float, fixed UI ≤ 88 px of 844. The frozen runtime (`sticky.ts`) hides the
  bar while any `[data-hero-cta]` (hero CTA, form submit, final CTA) or the order form is on screen at all. The plan
  compiles to markup and CSS only (zero runtime bytes): `data-cta-plan~="hide-header"` hides the header's buy button
  exactly while the bar is hidden; `data-cta-plan~="collapse-float"` docks and shrinks the WhatsApp float above the
  visible bar under 64 rem (V27; DES-§5.9).
- The sticky order bar itself is a keep-list item: thumbnail with the ×2 badge, price, old price, discount and the COD
  line ("خلّص ملي توصلك" / "Commander"); the desktop floating pill.

### 5.6 The fold contract (I7; C2)

At 390 × 844 the product image, the price, one primary CTA and the COD line ("خلّص ملي توصلك" / "Paiement à la
livraison") sit inside the first 844 px for **every hero family and locale**. Each family declares its fold stack
(`features.fold`, generated from its sheet). The static estimate has a measured error band, so there are three zones:

| Zone | Estimated top of the lowest fold item (image, price, CTA, COD line) at 390 | Who | Effect |
|---|---|---|---|
| target | ≤ **760 px** (844 × 0.9) | the planner and the solver (H28), the wizard | the page is generated to this line; a direction above it is repaired before it is shown |
| band | 760 < top ≤ **938 px** (844 / 0.9) | the gate (V25, `budget:C2`) | a **soft** note with `vars.estimated = 1`, message "estimated"; the owner sees it live in the panel and the publish dialog lists it as a note |
| refused | > 938 px | the gate (V25 hard → `design:C2`; the core's `budget:C2` row reads the same `FoldReport`) | `design_blocked` / `budget_blocked`; outside the fold even at the band's edge |

When a direction misses the target, the solver repairs in this order (H28): drop the hero lead → shorten the title to 2
lines → cut the image height in 2 vh steps (≥ 36 vh) → drop the kicker → lower the display max in 8 px steps (≥ 48
px, never 44) → swap the hero family inside the grammar's pool. The headline is the last thing to shrink. The order
form's default state is `offer → name → phone → city → [address] → submit`, 1.1 screens, inputs 52-56 px tall at 16
px text (P3's contract).

**Fold budget per family × locale at 390 × 844 (rev 3, UX-11), in px, derived from the sheets of DES-§5.13.** Rows:
header 68 · announcement 42 (counted: the worst case) · display line at 44 px: Latin 46 (lh 1.05), Arabic 61 (× 1.08
scale, lh 1.28) · lead at 18 / 19 px, 2 lines: Latin 54, Arabic 61 · price cluster 40 · button 52 · price + CTA on one
line 52 · COD line 24 · gaps 16 (after the image), 12 (title → lead / lead → price), 8 (before the COD line). The
sticky bar never counts.

| Family | Fold stack at 390 | Latin total | Arabic total | Slack to 760 (ar) | First repair when short (H28 ladder) |
|---|---|---|---|---|---|
| `stage` | header + announcement 110 · image **46 vh** 388 (ar: 42 vh 354) · 16 · title ≤ 2 lines · 16 · price 40 · 12 · CTA 52 · 8 · COD 24 (no lead in the fold) | 758 | 788 → **754** at 42 vh | 6 | the image steps down 2 vh (≥ 36 vh); the lead is already below the fold |
| `editorial` | 110 · kicker 24 · title ≤ 2 lines · 12 · lead 2 lines · 16 · image **40 vh** 338 · 16 · price + CTA line 52 · 8 · COD 24 | 746 | 783 → **722** without the lead | 38 | drop the lead from the fold (it reappears under the image) |
| `poster` | 110 · title band ≤ 2 lines at 56 px (118 / 156) · 16 · image 40 vh 338 · 16 · price block 52 · 8 · COD 24 | 682 | 720 | 40 | title to 2 lines at `dmax` 48 |
| `spec` | 110 · image 40 vh 338 · 16 · callouts ≤ 2 × 28 · 16 · title ≤ 2 lines · 16 · price + CTA line 52 · 8 · COD 24 | 728 | 758 | 2 | one callout in the fold |
| `split` (stacked) | 110 · image **44 vh** 371 · 16 · title ≤ 2 lines · 16 · price + CTA line 52 · 8 · COD 24 (lead below the fold on mobile) | 689 | 719 | 41 | image −2 vh |
| `cinema` | 110 · image **50 vh** 422 · band: title ≤ 2 lines + price + CTA line 52 + COD 24 + band padding 24 | 724 | 754 | 6 | image −2 vh (≥ 44 vh on this family); the caption is never in the fold |
| `quiet` | 110 · image **52 vh** 439 · 16 · title 1 line · 12 · price + CTA line 52 · 8 · COD 24 | 707 | 722 | 38 | image −2 vh |
| `index` | 110 · image **36 vh** 304 · 16 · title ≤ 2 lines · 12 · 3 facts × 32 · 16 · price + CTA line 52 · 8 · COD 24 | 730 | 760 | 0 | 2 facts in the fold (the third below) |
| `contact` | 110 · grid **58 vh** 490 (title cell: title ≤ 2 lines at step-4 28 px, price 40, CTA 52 inside the cell) · 8 · COD 24 | 632 | 648 | 112 | — |
| `statement` | 110 · title ≤ 3 lines at 48 px (150 / 198) · 16 · thumbnail 160 · 16 · price + CTA line 52 · 8 · COD 24 (a lead fits: +54 / 61) | 536 (590) | 584 (645) | 115 | — |

Every row is a `test:design` fixture in both locales (`fold ok` at the target with the fixture's longest library title,
the ar variant of each, UX-11), and the registry's `features.fold` for each family is the row's stack, generated from
`sheets.ts` (DS47).

### 5.7 Composition sheets (DES-§5.13)

A sheet is the drawing a build agent works from: one per hero family (H1-H10) and per new or redrawn section (S1-S8).
The registry's `features.fold`, `features.slots` and `features.h` are generated from them (`src/lib/design/sheets.ts`),
so the model and the drawing cannot drift, and **no variant code starts before its sheet exists** (DS47). Reproduced
from DES-§5.13; the spec is the master copy.

**Notation.** Grids are in **G3 grid units**: 4 columns at 390 (gutter 16, unit 8, column ≈ 82 px), 8 columns at 768
(gutter 24, column ≈ 78 px), 12 columns at 1440 (container 1,280, gutter 32, column ≈ 77 px). A cell `IMG` is the media
slot, `TTL` the title, `KCK` the kicker, `LED` the lead, `PRC` the price cluster (price, old price, discount chip as one
`inline-flex` unit, DES-§4.5.4 `Price`), `CTA` the primary button, `COD` the cash-on-delivery line, `FCT` a fact row,
`CAP` a caption, `·` an empty cell (negative space is drawn, not left over). Rows are the sheet's slot rows; heights are
the fold budget rows of DES-§5.12. **Type steps** (from `typeTokens`, DES-§10.5): `D` = display (`step-6`, the hero
title, 44-56 px at 390 per family), `T` = section title (`step-4`, 28-32), `L` = lead (`step-2`, 18 / ar 19), `B` = body
(`step-0`, 16 / ar 17), `C` = caption (`step--1`, 13; ar 14), `P` = price (`step-3`, 22-24, tabular lining). **RTL**: every
grid mirrors by logical properties; a sheet says where the mirror changes the composition (and where it must not: the
price cluster and the COD line never split; LTR isolates for numerals). **Reference**: a keep-list shot
(design-baseline §6, §3.1) or a real brand page named for its *composition*, never for its colours or type.

#### H1 `hero:stage` (grammar `stage`; treatments `cutout-stage`, `framed-stage`)

```
390 (4 col)                 768 (8 col)                         1440 (12 col, container 1280)
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG  46vh (42 ar) |       | ·  |  IMG 5 col, 4:5 (≤ 52vh) | ·  |   | KCK TTL (6 col) |  IMG 5 col, 4:5     |
|  stage preset     |       | ·  |  stage preset            | ·  |   | TTL D 2 lines   |  stage preset       |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   | LED L (5 col)   |  product bbox ≤ 72% |
| TTL  D  ≤ 2 lines |       | TTL D ≤ 2 lines (6 col, start)       |   | PRC · CTA  COD  |  of the slot height |
| PRC | CTA         |       | PRC | CTA | COD                     |   | ·    ·    ·     |  ·                  |
| COD               |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+
```

- Slots: `IMG` 4 col × 46 vh (ar 42 vh), aspect free inside the cap, the product bbox ≤ 72 % of the slot height so the
  preset has room; `TTL` D ≤ 2 lines (10-14 ch `max-inline-size`); `PRC` 40 px; `CTA` 52 px, full width at 390,
  beside the price from 768; `COD` C one line; no lead in the fold (the lead opens Act1 or sits under the fold).
- Price cluster + COD: directly under the title at 390 (one glance: product → promise → price → button → COD); at 1440
  the cluster and the COD line close the text column, never under the image.
- Signature detail: the product landing on its stage (the preset's glow / contact / plinth and the `scale-in` row of
  DES-§4.12). No chips by default (`chips = 0`), ghost word off.
- RTL: the grid mirrors; at 1440 the text column is inline-start (so right in `ar`), the product inline-end; the COD
  line and price cluster stay one `bdi` group each.
- Recipe: `cutout-stage` with `glow` (maison / bloom / souk), `contact` (apothecary / field / hearth / editorial) or
  `plinth` (circuit / kinetic / garage / playground); `framed-stage` with `plinth` or `contact` only (DES-§4.11.1).
- Reference: `massage-default-ar-fold` for the fold that already worked (image, price, CTA inside 844); Aesop's product
  page for a single object on a flat lit ground.

#### H2 `hero:editorial` (grammar `editorial-column`; treatments `framed`, `tight-detail`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| KCK  C            |       | KCK                      | ·  | ·  |   | ·  | KCK TTL D ≤ 3 lines (5 col) | IMG |
| TTL  D ≤ 2 lines  |       | TTL D ≤ 2 lines (5 col)  | ·  | ·  |   | ·  | LED L (4 col)               | 5:7 |
| LED  L ≤ 2 lines  |       | LED L (4 col)            | ·  | ·  |   | ·  | PRC  CTA  COD               | col |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   | ·  | ·                           | 5-11|
| IMG  40vh  (4:5)  |       | IMG 5:7 → 5 col, framed  | PRC CTA |   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+       |                          | COD     |     (offset margin: col 1 empty, G3.m = offset)
| PRC | CTA   COD   |       +----+----+----+----+----+----+----+----+
+----+----+----+----+
```

- Slots: `KCK` C (one topic word, optional, counts in the kicker budget); `TTL` D ≤ 2 lines at 390, ≤ 3 at 1440;
  `LED` L ≤ 2 lines (the first fold item dropped when short); `IMG` 4:5 framed at 390 (40 vh cap), 5:7 at ≥ 768 with a
  hairline frame (`G15` recipe) or a `tight-detail` crop; `PRC` + `CTA` on one 52 px line; `COD` under it.
- Signature detail: the title's line-by-line `mask-wipe` and the one empty column at 1440 (negative space is the
  device; nothing else is added).
- RTL: the empty column stays inline-start; the caption column of the `caption` opener hangs inline-start.
- Recipe: hairline frame on light bases, `surface` panel on dark (H27 (c)).
- Reference: `tshirt-default-fr-dsk-1` (5:7 editorial split) for the desktop; a Monocle product column for the 390
  stack (title and lead before the image).

#### H3 `hero:poster` (grammar `poster`; treatments `cutout-stage` / `framed-stage` / `full-bleed-crop`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL  D 56px       |       | TTL  D ≤ 2 lines, 7 col, start   |   | TTL  D ≤ 2 lines, 9 col (dmax ≤ 112)   |
|      ≤ 2 lines    |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+       | IMG  4 col, 1:1  | PRC band       |   | IMG 6 col, 4:5 (mask) | PRC band 4 col |
| IMG  40vh         |       |  mask arch/rect  | CTA            |   |                       | CTA  COD       |
+----+----+----+----+       |                  | COD            |   | ·                     | ·              |
| PRC band  CTA     |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| COD               |
+----+----+----+----+
```

- Slots: `TTL` D at 56 px (`dmax` ≥ 56, weight ≥ 700, H04), ≤ 2 lines, never uppercase in `ar`; `IMG` 1:1 or 4:5 with
  the `arch` or `rect` mask (`cut` allowed as the page's one device); `PRC band` = the price cluster on a colour field
  (`color-field` / `duotone` strategies: the band is one of the page's moments); `CTA` 52; `COD` under the band.
- Signature detail: the image's mask reveal (DES-§4.12); the turning badge is gone (S17).
- RTL: the title keeps `text-align: start`; the band is inline-end at ≥ 768 (so left in `ar`).
- Reference: `argan-playground-ar-fold` and `tshirt-garage-ar-fold` (poster folds that already held price + CTA);
  Nike's launch poster pages for type-first + one object.

#### H4 `hero:spec` (grammar `specimen`; treatments `cutout-stage` / `framed-stage` / `tight-detail`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG  40vh         |       | IMG 5 col, 4:5          | FCT 01 ... |   | FCT 01 (3 col) | IMG 6 col 1:1 | FCT 02 |
+----+----+----+----+       |                         | FCT 02 ... |   | FCT 03         |  leader lines | ·      |
| FCT 01 · FCT 02   |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL  D ≤ 2 lines  |       | TTL D (5 col)   | PRC CTA COD      |   | TTL D (6 col)  | PRC  CTA  COD          |
| PRC | CTA   COD   |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+
```

- Slots: `IMG` 4:5 (1:1 at 1440); `FCT` ≤ 2 callouts in the fold at 390 (28 px rows, mono or smallcaps label `G7.lb`,
  merchant facts only, numbers in LTR isolates), ≤ 3 on the page; leader lines only at ≥ 1024 and only to
  merchant-placed anchors (`honesty:I5`); `TTL` D ≤ 2 lines; `PRC` + `CTA` one line; `COD`.
- Signature detail: the callout lines drawing in (`line-draw`, quart). Glass only when G16 allows (else hairline cards).
- RTL: callouts at inline-start of the image at 1440 mirror to the right; leader lines mirror (keep-list 8).
- Reference: `argan-editorial-ar-m-2` (ruler / dimension showcase) for the fact register; Teenage Engineering product
  pages for the spec-first object.

#### H5 `hero:split` (grammar `split-tension`; treatments `framed`, `full-bleed-crop`, `cutout-stage`)

```
390 (stacked)               768 (side by side ≥ 768)            1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG  44vh         |       | TTL D (3 col)  | IMG 5 col, 4:5     |   | TTL D ≤ 3 (5 col) | · | IMG 6 col 4:5   |
+----+----+----+----+       | LED L          |  (ratio 5:7)       |   | LED L (4 col)     | · |  (4:8 or 5:7)   |
| TTL  D ≤ 2 lines  |       | PRC CTA        |                    |   | PRC  CTA          | · |  bleed inline-end|
| PRC | CTA   COD   |       | COD            |                    |   | COD               | · | if ≥1.5×slot@2x |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
```

- Slots: `ratio` 5:7 default (4:8 for `offset` margins, 1:1 never with this grammar, H22); `mediaSide` logical;
  `IMG` 4:5 framed, or `bleed` off the inline-end edge when the asset is ≥ 1.5 × the slot at DPR 2 (H13); the lead is
  below the fold at 390.
- Signature detail: the media's edge wipe; the tension is the unequal split, so the text column is never centred.
- RTL: `mediaSide = "end"` puts the image on the left in `ar`; the bleed edge follows.
- Reference: `tshirt-default-fr-dsk-1/2` (5:7 editorial split with the big quote block) for the proportion.

#### H6 `hero:cinema` (grammar `cinematic`; treatment `full-bleed-crop`, `tight-detail`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG  50vh  bleed  |       | IMG 8 col bleed, 16:9 (≤ 60vh)      |   | IMG 12 col bleed, 21:9 (≤ 72vh)         |
|  edge to edge     |       |                                     |   |                                          |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| band: TTL D ≤ 2   |       | band 5 col: TTL · PRC CTA · COD | CAP |   | band 4 col inline-start: TTL PRC CTA COD | CAP (3 col, inline-end) |
| PRC | CTA   COD   |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+
```

- Slots: `IMG` edge-to-edge, 50 vh cap at 390 (16:9 at 768, 21:9 at 1440; the asset must be ≥ 1.5 × the slot at DPR 2
  on every breakpoint the variant declares, else the variant declares a mobile-only bleed with a framed desktop
  fallback); `band` = title ≤ 2 lines, price + CTA line, COD, on the ground (text never over the photo except the one
  `CAP` caption, C, ≤ 60 characters, never in the fold).
- Signature detail: the slow settle (1.08 → 1 over `--lp-dur-l × 1.5`) and the optional −6 % scroll translate.
- RTL: the band is inline-start (right in `ar`) at 1440; the caption inline-end.
- Reference: Hermès' and Byredo's campaign pages for a photo that carries the fold with the commerce under it.

#### H7 `hero:quiet` (grammar `quiet-luxe`; treatments `framed`, `full-bleed-crop`, `cutout-stage`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| ·  IMG 52vh  4:5 ·|       | ·  | ·  | IMG 4 col, 4:5 | ·  | ·  |   | ·  | ·  | ·  | IMG 4 col 4:5 | ·  | TTL 3 col |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   | ·  | ·  | ·  |               | ·  | PRC CTA   |
| TTL  D ≤ 1 line   |       | TTL D 1 line (4 col, start)         |   | ·  | ·  | ·  |               | ·  | COD       |
| PRC · CTA  · COD  |       | PRC CTA COD on one line             |   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+       +----+----+----+----+----+----+----+----+
```

- Slots: `IMG` 4:5 (1:1 allowed) inset by one column at 390 (the inset is the composition), 52 vh cap; `TTL` D at
  `dmax` ≤ 56, **one line** (the title is the product name or a ≤ 4-word noun phrase, DES-§9.12 `quiet` skeletons);
  `PRC` + `CTA` + `COD` on one line (the COD line wraps under on `ar` when the price has three digits); the lead is
  absent from the hero.
- Signature detail: stillness (the image's slow fade is the whole choreography); the stagger is the page's longest.
- RTL: the 1440 text column is inline-end (left in `ar`); nothing else changes.
- Recipe: `G20.l = airy`, `G10 ≤ 0.10`, `G16 ≤ 1` (H05); hairline or flat depth only.
- Reference: Aesop and Le Labo product pages (a small object, a lot of ground, one line of type).

#### H8 `hero:index` (grammar `catalogue`; treatments `framed`, `cutout-stage` / `framed-stage`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG  36vh  4:5    |       | IMG 4 col 4:5      | TTL D ≤ 2     |   | IMG 5 col 1:1  | TTL D ≤ 2 (6 col)        |
+----+----+----+----+       |                    | 01 FCT ────── |   |                | 01 FCT ────────── (rows) |
| TTL  D ≤ 2 lines  |       |                    | 02 FCT ────── |   |                | 02 FCT ────────── |
| 01 FCT ────────── |       |                    | 03 FCT ────── |   |                | 03 FCT ────────── |
| 02 FCT ────────── |       |                    | PRC CTA  COD  |   |                | 04 FCT ────────── |
| 03 FCT ────────── |       +----+----+----+----+----+----+----+----+   |                | PRC  CTA  COD    |
| PRC | CTA   COD   |                                                   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+
```

- Slots: `IMG` 36 vh cap at 390; `TTL` D ≤ 2 lines; `FCT` 3-5 merchant facts as numbered rows (32 px, hairline
  between rows, `G25.nb` plain or padded; **padded numbering is a counted device**, DS56), 3 in the fold at 390 (2 when
  the title takes 2 Arabic lines, DES-§5.12); `PRC` + `CTA` one line; `COD`.
- Signature detail: the index rows ticking in with their hairlines (`line-draw`).
- RTL: row numbers are LTR isolates at inline-start of each row; the hairlines run full width.
- Reference: `argan-editorial-ar-m-1…4` (numbered column, figure captions) for the register; a Muji product sheet for
  the facts-as-index idea.

#### H9 `hero:contact` (grammar `gallery-led`; treatment `grid-contact`; replaces `scrapbook`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG a    | IMG b  |       | IMG a (3)   | IMG b (3)  | TTL cell |   | IMG a (4) | IMG b (4) | TTL cell (4): |
| (1:1)    | (1:1)  |       |             |            | TTL T    |   |           |           |  TTL T ≤ 2    |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL cell: TTL T   |       | IMG c (3)   | IMG d (3)  | PRC CTA  |   | IMG c (4) | IMG d (4) |  PRC  CTA     |
|  PRC  CTA         |       |             |            | COD      |   |           |           |  COD          |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| COD               |         (titleCell = tr here; tl/bl/br by seed)
+----+----+----+----+
```

- Slots: 3-4 photos (`AssetRef[]`, distinct assets, ≥ 1.5 × the cell at DPR 2), 1:1 cells (4:5 at 1440 with 4 photos),
  2 px gaps (the sheet is the device: a contact sheet, not a gallery of cards); the **title cell** (`titleCell`, logical
  `tl`/`tr`/`bl`/`br`) holds the title at T (not D: the photos lead), the price cluster and the CTA; the COD line under
  the grid at 390, inside the cell from 768.
- Signature detail: the cell cascade (reading order, +1 stagger per cell, the title cell last).
- RTL: the grid mirrors; `tr` becomes the top-left cell in `ar` because it is logical (inline-end top).
- Reference: a Kinfolk contact-sheet opener; the baseline's `scrapbook` tape and polaroid frames are banned (§3.6).

#### H10 `hero:statement` (grammars `quiet-luxe`, `poster`, `editorial-column`; type-first; the one-asset default)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL  D 48px       |       | TTL D ≤ 3 lines (6 col, start)   | · |   | TTL D ≤ 3 lines (8 col, dmax ≤ 96)   | · |
|      ≤ 3 lines    |       |   structure: word-subline / pair  | · |   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+       +----+----+----+----+----+----+----+----+   | LED L (4 col) | IMG 3 col framed | PRC CTA COD |
| IMG  160px framed |       | IMG 3 col framed | LED L | PRC CTA |   +--+--+--+--+--+--+--+--+--+--+--+--+
| PRC | CTA   COD   |       |                  |       | COD     |
| LED  L (fits)     |       +----+----+----+----+----+----+----+----+
+----+----+----+----+
```

- Slots: `TTL` D at 48 px (≤ 3 lines; `structure` = `word-subline` (one big word + a subline at L) or `contrast-pair`
  (two short lines joined by a line break, never an em dash)); `IMG` a framed thumbnail ≥ 160 px (the product stays in
  the fold, C2) or a small cut-out on a `plinth`; `PRC` + `CTA` one line; `COD`; a lead fits in the fold on this
  family (the only one).
- Signature detail: the type itself (ratio ≥ 3 against the body); no other device on the hero.
- RTL: the word-subline structure sets the big word on its own line in both scripts; the Arabic big word is sized by
  `--sh-word` so it never clips (S12).
- Reference: `argan-editorial-ar` headline register; a Wieden+Kennedy statement poster for the proportion. This is the
  default family of the one-asset grammar (H36).

#### S1 `benefits:hanging` (keep-list 7; replaces the icon-grid reflex)

```
390                         768 / 1440 (hanging column inline-start)
+----+----+----+----+       +----+----+----+----+----+----+----+----+
| TTL T  (opener)   |       | 01 |thumb| TTL B/600 · body B (5 col)  | ·  |
| 01 thumb | B text |       | 02 |thumb| ...                         | ·  |
| 02 thumb | B text |       | 03 |thumb| ...                         | ·  |
| 03 thumb | B text |       +----+----+----+----+----+----+----+----+
+----+----+----+----+
```

- 3-5 rows, 72 px thumbnails (`detail` or `context` crops of the merchant's photos, ≥ 1.5 × at DPR 2, else no thumbs:
  `thumbs = false` renders the numbered ledger), number at C mono / smallcaps (`G25.nb`; padded = a counted device),
  title B/600 one line, body B ≤ 24 words; hairline between rows; **no icons** (S07).
- Signature detail: the hanging thumbnail that breaks the text column's edge (the boundary cross, C4) at ≥ 768.
- RTL: thumbnails and numbers hang inline-start (right in `ar`); numerals LTR isolates.
- Reference: `parfum-default-fr-dsk-1` (numbered 01-05 Didone benefits with hanging thumbnails).

#### S2 `showcase:figure` (keep-list 7)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL T ≤ 2 lines   |       | TTL T ≤ 2 (5 col, start)  | ·  | ·  |   | · | TTL T ≤ 2 (6 col)    | ·  | ·  | · |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| IMG 4:5 full      |       | IMG 6 col, 3:2 (framed)  | CAP 2 col |   | · | IMG 8 col, 3:2 or 4:5 | CAP column |
|                   |       |                          | FIG. 01 C |   | · |  (framed)             | 3 col:     |
+----+----+----+----+       |                          | caption B |   | · |                       | "FIG. 01"  |
| CAP C: figure ·   |       +----+----+----+----+----+----+----+----+   | · |                       | C mono     |
|  caption B        |                                                   | · |                       | caption B  |
+----+----+----+----+                                                   +--+--+--+--+--+--+--+--+--+--+--+--+
```

- One large image (`context` or `detail` role, true colour), a caption column at inline-end (≥ 768: 2 col; ≥ 1024: 3
  col) or under the image (< 768): figure label C mono (`figure` prop, **a counted device**, ≤ 20 % of pages per niche,
  DS56) and a caption B ≤ 40 words (≤ 5 lines at 390) that names a fact; the title T ≤ 2 lines; no second image, no
  CTA (`ctas = 0`), no price cluster (a showcase never sells; the form does).
- Slots (rev 4, the 768 column added): `IMG` 4:5 at 390 (full column), 3:2 at 768 (6 col), 3:2 or 4:5 at 1440 (8 col,
  offset one column: G3.m = offset); the crop is `context` or `tight` (only when the tight crop covers the slot at DPR
  2, H13).
- Signature detail: the caption column hanging in the margin (`hang` arrangement at ≥ 1024, G3.m = offset).
- RTL: the caption column inline-end (left in `ar`); the figure label "FIG. 01" becomes "الشكل 01" with the numeral in
  an LTR isolate.
- Recipe: hairline frame (`G15` hairline) on light and tinted bases, the `surface` panel on dark (H27 (c)).
- Reference: `tshirt-default-fr-dsk-2` ("FIG. 01" captions).

#### S3 `gallery:contact` (grid-contact treatment)

```
390 (cols 2)                768 (cols 3)                        1440 (cols 3, container 1280)
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL T ≤ 2 (opener)|       | TTL T ≤ 2 (5 col)                    |   | TTL T (5 col) | ·  LED L ≤ 2 (4 col)   |
+---------+---------+       +-----------+-----------+------------+   +------------+-------------+-------------+
| IMG a   | IMG b   |       | IMG a 1:1 | IMG b 1:1 | IMG c 1:1  |   | IMG a 1:1  | IMG b 1:1   | IMG c 1:1   |
| 1:1     | 1:1     |       +-----------+-----------+------------+   +------------+-------------+-------------+
+---------+---------+       | IMG d     | IMG e     | IMG f      |   | IMG d      | IMG e       | IMG f       |
| IMG c   | IMG d   |       +-----------+-----------+------------+   +------------+-------------+-------------+
+---------+---------+          (2 px gaps; 3-6 distinct assets; odd counts end with a 2-cell row)
```

- 3-6 photos as a contact sheet: `cols` 2 (390) or 3 (≥ 768), 1:1 cells, 2 px gaps, no captions, no frames, no
  lightbox chrome; the title at T (≤ 2 lines) above with the `image` or `bare` opener, an optional lead L ≤ 2 lines
  beside it at 1440; the cells reveal in reading order. Each cell ≥ 1.5 × its CSS width at DPR 2 (390: 186 px cells
  need ≥ 558 px assets; 1440: 425 px cells need ≥ 1,275 px), else the asset leaves the grid and the count drops (a grid
  of 2 becomes `showcase:figure`).
- No price, no CTA (`ctas = 0`); the COD line never appears in a gallery.
- Signature detail: the uniform grid itself; distinct assets only (H08, `honesty:I4`).
- RTL: reading order mirrors (cell a at inline-start top). Recipe: no shadow, no radius beyond `--lp-radius-media` of
  the ladder (crisp / mixed ladders give square cells). Reference: a Kinfolk or Cereal magazine contact spread.

#### S4 `offer:showcase` (R2; the picker lives in the form)

```
390 (scroll row, 12 % peek)      768 / 1440 (3-column row; 1440 inside 10 col, offset 1)
+------------+------------+-+    +-------------+-------------+-------------+
| PACK ×1    | PACK ×2  ★ | |    | PACK ×1     | PACK ×2  ★  | PACK ×3     |
| name B/600 | (accent-   | |    | name B/600  | soft ground | name B/600  |
| P per piece| soft, line)| |    | P per piece | P per piece | P per piece |
| −25 % chip | −33 % chip | |    | savings chip| savings chip| savings chip|
+------------+------------+-+    +-------------+-------------+-------------+
  TTL T ≤ 2 above the row; "Choose your pack in the form" C link to #order under it
```

- The packs as a row of 2-3 cards at 390 (horizontal scroll with a 12 % peek, each card 72 vw) and a 3-column row at ≥
  768: pack name B/600 (1 line), per-piece price P tabular (the price cluster rule: price, old price and chip as one
  `inline-flex` unit), savings chip (`−25 %` as an LTR isolate, keep-list 5), **no picker and no button** (`picker =
  false`, `ctas = 0`); the recommended pack (★ above) has the hairline + `--lp-accent-soft` ground, never a "best
  seller" badge without merchant data; a C link "Choose your pack in the form" to `#order` under the row (a link, not a
  CTA).
- Signature detail: none (this is a quiet section by design; it may be the page's `quiet` screen, C4).
- RTL: the row scrolls from inline-start; prices stay one `bdi` group. Recipe: card tier from `G15`, never raised on a
  `panels` page (H26). Reference: keep-list 7 (pedestal ×1/×2/×3 offers), without the pedestal when `G18` is not a stage
  treatment.

#### S5 `problem` ledger (redraw of `problem:chat`)

```
390                         768                                 1440
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL T ≤ 2 / quote |       | TTL T ≤ 2 (5 col)   | LED quote (3)  |   | TTL T (4 col) | ·  | LED quote L (5 col) |
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| pain B/600        |       | pain B/600 (4 col)  | answer B (4)   |   | · | pain B/600 (4) | answer B (6 col)  |
|  · answer B (ind.)|       |---------------------|----------------|   |---|----------------|-------------------|
| pain B/600        |       | pain …              | answer …       |   | · | pain …         | answer …          |
|  · answer B       |       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
+----+----+----+----+         (3-4 rows; hairline between rows)
```

- Pains as a two-column ledger at ≥ 768 (pain B/600 inline-start, one line; the product's answer B inline-end, ≤ 2
  lines; hairline rows, 3-4 rows) and a stacked list at 390 (pain, then answer indented by one column); no bubbles, no
  timestamps, no avatars (S20); the opener `quote` is allowed (the lead as a pulled line at L).
- No price, no CTA (`ctas = 0`).
- Signature detail: the ledger's hairlines (`line-draw`) or none.
- RTL: columns mirror (pain at inline-start, so right in `ar`). Reference: `tshirt-default-fr-dsk-1` (the big quote
  problem block) for the register.

#### S6 `socialProof` quote cards (redraw of `socialProof:whatsapp`)

```
390                         768                                 1440 (the one-wide-quote form)
+----+----+----+----+       +----+----+----+----+----+----+----+----+   +--+--+--+--+--+--+--+--+--+--+--+--+
| TTL T ≤ 2         |       | TTL T ≤ 2 (5 col)                    |   | · | « quote at L, ≤ 4 lines (8 col) »  | · |
+----+----+----+----+       +------------+-----------+------------+   | · | name · city C (4 col)              | · |
| « quote B/L »     |       | « quote »  | « quote » | « quote »  |   +--+--+--+--+--+--+--+--+--+--+--+--+
| name · city C     |       | name, city | name, city| name, city |      (or the 3-card row of 768 at 4 col each)
+----+----+----+----+       +------------+-----------+------------+
```

- Owner-attested quotes only (LP-02, `honesty:I4`): 2-3 cards, quote B/L (≤ 6 lines at 390), name and city in C
  (never a timestamp, a rating or an avatar photo the owner did not upload, D2); card tier from `G15` (no phone frame,
  S21); at 390 one column, at ≥ 768 a 3-column row or a single wide quote (`quote` opener) when there is one.
- No price, no CTA (`ctas = 0`).
- Signature detail: the single wide quote when the grammar is `editorial-column` or `quiet-luxe`.
- RTL: quotation marks « » / „“ per locale from the voice table. Reference: the merci pages of keep-list 4 for restraint.

#### S7 `stats` (merchant figures only)

```
390 (2 col)                 768 / 1440 (one row, hairline separators)
+---------+---------+       +-----------+-----------+-----------+-----------+
| FIG s5  | FIG s5  |       | FIG step-5| FIG step-5| FIG step-5| FIG step-5|
| label C | label C |       | label C   | label C   | label C   | label C   |
+---------+---------+       +-----------+-----------+-----------+-----------+
| FIG     | FIG     |       | source C (only when the owner typed one)      |
+---------+---------+
```

- 2-4 figures from `allowedNumbers` (else the section is not in the pool, DS42): figure at step-5 tabular lining
  (never a gradient, never a bar, S22), label C under it (≤ 2 lines), a source line only when the owner typed one; a
  2-column grid at 390, a row at ≥ 768 with hairline separators.
- No price, no CTA (`ctas = 0`).
- Signature detail: the ticking number (one per page, S11). RTL: figures are LTR isolates with the unit per locale.

#### S8 The redrawn `cta`, `guarantee:seal`, `trustBar:stamps`, `marquee:tape`, `offer:tickets`

```
cta at 390                  cta at 768 / 1440 (start-aligned; a centred 8-col block only on poster / quiet-luxe / statement pages)
+----+----+----+----+       +----+----+----+----+----+----+----+----+
| TTL T ≤ 2 lines   |       | TTL T ≤ 2 lines (6 col)         | ·  |
| PRC (optional)    |       | PRC (optional) · CTA 52 px      | ·  |
| CTA full width 52 |       | COD C                           | ·  |
| COD C             |       +----+----+----+----+----+----+----+----+
+----+----+----+----+
```

- `cta`: title T ≤ 2 lines, one primary button (`data-hero-cta`, DES-§5.9), the COD line, optionally the price
  cluster; a colour moment when the plan assigns one; no countdown (R3), no second button.
- `guarantee:seal` → a hairline card with the guarantee text and the merchant's return policy line; the "0 DH
  d'avance" mark is a text chip, never a seal shape.
- `trustBar:stamps` → out of every pool; the redraw for old docs is the `chips` variant's row.
- `marquee:tape` → the `outline` marquee with whole-item duplication (I7), no tape texture, no rotation.
- `offer:tickets` → the `showcase` cards above with a `cut` corner as the one allowed device, no perforations.
- RTL: the `cta` block and the guarantee card mirror; the COD line and the price cluster stay one `bdi` group each.
  Reference: `massage-default-ar` closing block (one button, one COD line) for the restraint.

**Rule for every sheet:** the registry entry's `features.fold.rows`, `features.slots[*].cssWidth390 / cssWidth1440 /
aspect` and `features.h` are generated from `SHEETS` (`sheets.ts`) and `test:registry` fails on a hand-edited value; a
new variant without a sheet cannot enter a pool (`test:registry`); the sheet's "signature detail" is the variant's
`features.signature` (1) and its `features.details`.

---

## 6. Imagery, stages, masks, depth and the light kit

The merchant's photos are the only imagery: no stock, no generated images by default. The pipeline turns them into
deliberate crops; it never fakes a cut-out, a second product or a lifestyle shot.

### 6.1 The seven treatments (G18)

| Treatment | What it is | Needs (H13) | Grammar prior (G18 \| G2) |
|---|---|---|---|
| `cutout-stage` | the product cut out (alpha) standing on a stage preset | a real alpha mask, or an estimated cut-out (then only `plinth` or `contact`, and the page renders `framed-stage` until the real mask lands) | stage .70, poster .45, specimen .35, split-tension .30, catalogue .20, quiet-luxe .20 |
| `framed-stage` | the true-colour photo as a framed object on a plinth or with a contact shadow; no alpha needed | nothing | stage .30, poster .10, specimen .10, plus the `cutout-stage` weight of its row when the photo has no alpha |
| `full-bleed-crop` | an edge-to-edge crop | the asset ≥ 1.5 × the slot at DPR 2 on every breakpoint the variant declares, and sharp (a mobile-only bleed with a framed desktop fallback may be declared) | cinematic .70, split-tension .35, poster .30, quiet-luxe .30, gallery-led .25, editorial-column .20 |
| `framed` | a framed photo: hairline frame on light bases, a surface panel on dark | always possible | catalogue .50, quiet-luxe .40, editorial-column .35, gallery-led .30, specimen .20, split-tension .20 |
| `tight-detail` | the inner-50 % crop around the focus, as a detail | the tight crop covers its slot at DPR 2 at ≥ 1.0 × | specimen .35, editorial-column .30, cinematic .30, poster .15, split-tension .15, quiet-luxe .10 |
| `tonal-duotone` | secondary images tinted (`luminosity` over the accent tint, the mix registered); hero and offer images stay true colour | a secondary role | editorial-column .15, gallery-led .05 |
| `grid-contact` | 3-6 photos as a contact sheet | ≥ 3 distinct photos | gallery-led .40, catalogue .30 |

A treatment whose needs are not met falls back to `framed-stage` (stage family) or `framed`, and a grammar that
requires a missing treatment leaves the domain. The genome records what the design is (`cutout-stage`); the document's
`look.img` carries what is rendered (`framed-stage` until a real mask exists), so a page never shows a fake cut-out
(V13).

### 6.2 The photo-use plan (G33; I1, I2)

- **Roles:** the primary photo takes `hero` once and at most one more role at a **different crop** (`tight` detail or
  `context`); secondary photos take `detail`, `context`, `proof` and `offer`; the sticky bar and form thumbnails do not
  count.
- **Caps:** every asset ≤ 3 appearances, the hero image ≤ 2 at the same crop (hard above 4, `budget:I1`); a plan that
  would need more drops its most media-hungry optional block or switches it (`gallery` → `showcase:figure`,
  `beforeAfter` → removed, `story:image-text` → `story:letter`).
- **Crops:** `full`, `tight` (the inner 50 % around the focus, only when its pixels cover the slot), `context` (the
  outer frame) and `bleed`; ≥ 3 distinct crops per page when ≥ 2 assets exist (V14); aspects from 4:5, 3:4, 1:1, 2:3,
  16:9, 21:9.
- **One set:** when backgrounds differ (uniform vs textured, luminance Δ > 0.35) the odd photos are framed so the page
  reads as one shoot; the hero and the sticky / form thumbnails use the same asset at the same crop; a second product
  image that contradicts the first is a `detail` or `context`, never a second hero.

### 6.3 The one-asset grammar (H36; the modal input is one phone photo)

With one photo the plan uses the type-led hero families (`statement`, `quiet`, `editorial`) or the stage family with
`framed-stage`, one `framed` and one `context` use of the asset at two crops, colour-field or tonal moments instead of
a gallery, showcase or contact grid, and no `tight` crop unless its pixels cover the slot. "≥ 3 crops" is not raised.
`hero:statement` is the one-asset default.

### 6.4 Resolution, focal point and cut-outs (V11, V12, V13; I2, I3, I6)

- **Resolution:** each slot declares its CSS width at 390 and 1440 (`features.slots`); the crop's effective pixels must
  be ≥ 1.5 × the slot × DPR 2 (soft below 1.5 ×, hard below 1.0 ×); below 1.5 × the slot takes a narrower aspect or
  `framed`.
- **Focal point:** from the focal editor or the stored default (the centre of the alpha box for cut-outs); the focus
  stays inside the inner 80 % of every crop, else the slot takes `framed` (V12, hard).
- **Cut-outs need alpha:** a cut-out on a stage needs the media pipeline's mask or the browser's estimated cut-out (an
  edge flood-fill on uniform backgrounds, ΔE ≤ 6, kept in the wizard only). Without either, a uniform-background photo
  is `framed-stage`. A light-background photo pasted on a dark ground as if cut out is banned (V36).

### 6.5 Stage presets and mask geometry (DES-§4.11.1)

Exactly one stage preset per page. All values are relative to the product's bounding box (`bbox`: the alpha box for
cut-outs, the framed photo's box for `framed-stage`) and the base lightness `L`.

| Preset | Geometry | Colour | Motion (G23 family; reduced motion = static) | Never |
|---|---|---|---|---|
| `glow` | a radial field centred at (`bbox.cx`, `bbox.cy + 0.15 h`), radii `0.9 w` × `0.6 h` (ellipse), feathered to 0 at `1.35 w` | `color-mix(in oklch, product dominant 70%, ground)` at alpha **0.28** on light (L ≥ 0.8), 0.22 tinted, **0.38** dark; a second, tighter radial (`0.45 w`) at alpha 0.12 for depth; `--lp-stage-glow`, `--lp-stage-glow-2` | the field scales 1.04 → 1 over `--lp-dur-l` on reveal; no loop | a glow on a `framed-stage` (its hard photo edge would show a matte); a glow hue outside the accent family (S05) |
| `contact` | an ellipse under the product: centre (`bbox.cx`, `bbox.bottom − 0.02 h`), radii `0.42 w` × `0.06 h`, blur `0.05 h` (CSS `filter: blur()` on an absolutely positioned pseudo-element, never on the image) | ink at alpha **0.22** light / 0.26 tinted / **0.45** dark, tinted toward the dominant (`color-mix(in oklch, ink 80%, dominant)`); `--lp-stage-contact` | the ellipse fades in 60 ms after the product's reveal (stagger), opacity only | a contact shadow offset sideways (it reads as a drop shadow, not a resting object) |
| `plinth` | a flat slab under the product: width `1.12 w` (min 160 px), height **`0.09 h`** (min 12, max 28 px), top edge at `bbox.bottom − 0.03 h`, radius = `--lp-radius-control`, a 1 px hairline at the top edge; on `framed-stage` the framed photo overlaps the slab by `0.03 h` so it "stands" | slab `color-mix(in oklch, ground 88%, dominant)` (light) or `oklch(from ground calc(l + 0.06) c h)` (dark); hairline `--lp-line`; `--lp-stage-plinth`, `--lp-stage-plinth-line` | the slab draws from the centre (`scale-x 0.6 → 1`) over `--lp-dur-m` with `line-draw` families, else static | a plinth wider than the hero column at 390 (clamped to the column minus one gutter) |

**Glow alpha ceiling (decided for v3).** Core D60 (rev 5) and the Glow row of §1.1 cap every glow on a generated page
at **10 % alpha**, which the `glow` row above (written in rev 3) exceeds. Until the spec re-tunes the row, the preset's
alphas are scaled by 0.10 / 0.38, so the dark-base value lands on the ceiling and the others keep their proportion:
**0.074** on light grounds, **0.058** tinted, **0.10** dark, and **0.032** for the second, tighter radial. Geometry,
colour mix and motion are unchanged.

Mask geometry (G17, `data-mask`), as `clip-path` on the media element; the logo enclosures reuse the same shapes:

| Mask | Geometry | Minimum slot | RTL |
|---|---|---|---|
| `arch` | a half-ellipse top with **rise = 0.5 × slot width** (a true semicircle on square slots, flatter on 4:5: rise = min(0.5 w, 0.36 h)), straight sides, square or `--lp-radius-card` bottom corners | 240 px wide | symmetric |
| `circle` | inscribed circle, image `object-fit: cover` on the focus | 160 px | symmetric |
| `pill` | `--lp-radius-media = 999` on the long axis; the short axis ≥ 0.45 × the long axis | 200 px | symmetric |
| `rounded` | `--lp-radius-media` from the ladder (effective radius, DES-§3.2) | — | symmetric |
| `rect` | no mask (the `mixed` ladder's media value; replaces `999` on media, UX-12) | — | — |
| `cut` | one corner cut at 45°, size = `--lp-radius-card × 2` (crisp ladder) or `× 3` (soft / mixed), the cut corner at **inline-end top** by default | 200 px | the cut corner mirrors to inline-end in RTL (logical) |
| `blob` | a 6-point closed cubic spline on a unit circle with radii r_i ∈ [0.82, 1.0] drawn by seed (`rng("mask:blob")`), tangents at ±0.55 of the chord, rendered as an SVG `clipPath` `path` with `clipPathUnits="objectBoundingBox"`; the focus stays inside the inner 80 % (V12) | 240 px | the same path mirrored (`scale(-1,1)`) |

`cut` and `blob` sit on ≤ 1 media slot per page (they are devices, counted by S11); a hero takes `arch`, `rounded`,
`rect` or `pill` only when its sheet lists it.

### 6.6 Depth recipes (G15; DES-§4.10.1)

These five recipes are the whole depth vocabulary of a page: a variant may not declare its own shadow. Every shadow
colour and mix is registered in `blend.ts`; `test:design` fails on one that is not. `L` = the ground's OKLCH lightness,
`ink` = `--lp-ink`, `acc` = the accent.

| G15 | Card surface | Shadow stack (`--lp-shadow-card`) | Hairline (`--lp-line`) | Inner highlight (`--lp-highlight`) | Floating layers (`--lp-shadow-float`: sticky bar, float, popover) |
|---|---|---|---|---|---|
| `flat` | ground or `soft` tier, no border | none | none | none | `0 8px 24px -12px oklch(from ink l c h / 0.18)` |
| `hairline` | ground | none | 1 px, alpha **0.09** on light (L ≥ 0.8), **0.14** on tinted (0.5 ≤ L < 0.8), **0.18** on dark (L < 0.5), colour `color-mix(in oklch, ink, transparent)` | 1 px top `oklch(1 0 0 / 0.35)` on dark bases only (`inset 0 1px 0`) | as flat |
| `tonal` | the `surface` tier one lightness step from the ground (ΔL 0.035 light / 0.05 dark), no shadow | none | optional 1 px at alpha 0.06 | none | as flat |
| `ambient` | `card` tier | two layers: `0 1px 2px oklch(from ink l c h / A1), 0 12px 32px -16px oklch(from ink l c h / A2)` with (A1, A2) = (0.06, 0.14) light · (0.08, 0.18) tinted · (0.28, 0.40) dark; the shadow colour is the **ink tinted toward the accent** (`color-mix(in oklch, ink 85%, acc)`) so a shadow never reads grey on a tinted ground | 1 px at alpha 0.06 (light) only | 1 px top at `oklch(1 0 0 / 0.45)` on dark | `0 16px 48px -20px …/0.32` |
| `directional` | `card` tier | one hard-edged layer `0 8px 0 -2px oklch(from acc l c h / 0.22)` (a drawn offset plate) **or** `0 10px 28px -12px oklch(from ink l c h / 0.24)` at a 100° light angle, chosen by G1 (`circuit` / `kinetic` / `garage` / `playground` → plate; others → angled) | 1 px at alpha 0.12 | none | plate shadows never on floating layers; angled `0 14px 40px -18px …/0.30` |

- **Focus ring:** 2 px `--lp-ring` (the accent moved ±0.1 L toward the ground for ≥ 3:1) with a 2 px ground offset;
  buttons and inputs share it.
- **Selection morph** (chips, the pack picker): background `--lp-accent-soft` + a 1 px `--lp-accent` border, 180 ms
  `--lp-ease-out`, no scale.
- **Card hover:** no translate, the shadow's second layer alpha × 1.3, 180 ms; never a scale on layout.
- **No grain** on any ground (D60); **glass** (G16) only over imagery or colour fields, with `--sec-glass-solid` as the
  opaque fallback when `backdrop-filter` is unsupported.

### 6.7 The light and decoration kit (`src/landing/illustrations`, P6's from rev 5)

Product-tinted, seeded, crisp vector and light. Decoration supports the product; each device counts against a budget.

| Device | Rule | Budget |
|---|---|---|
| `GlowOrb`, the stage glow | one product-tinted radial, hue inside the accent's analogous family (±30°), ≤ 10 % alpha (the `glow` stage preset is scaled to this ceiling, §6.5) | ≤ 2 sections (S06) |
| `Spotlight`, `Beam`, `Halo`, `Rings` | product-tinted light and thin concentric lines; every mix registered | secondary details (S11) |
| `Aurora`, `Grain` | **removed from generated pages** | 0 (V40) |
| `GlassChip` | frosted chip with an opaque fallback; AA over the image (scrim) | glass budget (V06) and chips on photos (S13) |
| `Badge` | a plain circular badge; no rotating-text ring; Arabic never on a path | S17, RTL3 |
| `Swoosh` | one clean underline stroke on the hero's emphasised word, offset below the descender box | hero only (G26) |
| `LeaderLine`, `Sparkline`, `Ruler`, `Dimension` | precise lines to merchant-placed anchors and merchant figures only | `honesty:I5`, S25 |
| `GridLines`, `DotGrid` | only to organise real content (a spec grid, the index rows), never as background decoration | secondary details |
| `ZelligeLines`, `ArchFrame` | abstract Moroccan geometry as thin modern lines at ≤ 6 % opacity; the clean arch | souk-led pages; secondary details |
| `SpeedLines`, `Leaf`, `Pictogram`, `Shape3D`, `Sticker` | clean gradient streaks (kinetic), minimal line icons, CSS volumes and vector stickers (playground); gradients registered | secondary details |
| v1 names (`Stamp`, `Tape`, `Doodle`, `HandArrow`, `ScribbleUnderline`, …) | kept only as modern re-implementations for old documents; never drawn by a new plan | out of every pool |

A **signature detail** is the hero's (one per page, V39); a **secondary detail** is a ticking number, a drawn line, a
floating chip, a scale-in image or a cursor-following glow on media: ≤ 3 on the whole page (S11).

### 6.8 The `Picture` primitive

`Picture` only: AVIF / WebP `srcset`, explicit width and height, the hero eager with `fetchpriority="high"`, every
picture below the form lazy; ≤ 16 `<picture>` elements per page (`budget:F5`; the photo plan keeps it ≤ 12 in
practice); `object-position` from the normalised focus.

---

## 7. Motion

### 7.1 Easing families (G23.f; DES-§4.12)

Six families, each a complete signature. **One family per page** (V23); the admin uses none of them. The family is a
bold gene drawn from a prior conditioned on the grammar, so two stores of one vibe differ in how their hero moves:

| G2 | expo | quint | quart | critical | mask | soft-spring (playground only) |
|---|---|---|---|---|---|---|
| editorial-column | | .15 | .35 | .15 | .35 | |
| poster | .45 | | | .20 | .35 | (+.20 when G1 = playground) |
| gallery-led | .20 | .25 | .20 | .15 | .20 | |
| stage | .25 | .35 | .15 | .25 | | (+.25 when G1 = playground) |
| specimen | .30 | | .30 | .25 | .15 | |
| catalogue | .20 | | .35 | .35 | .10 | |
| split-tension | .25 | .20 | .20 | .20 | .15 | |
| cinematic | .20 | .30 | | | .50 | |
| quiet-luxe | | .45 | | .35 | .20 | |

`critical` is the no-overshoot default when a hard rule removes the others; `soft-spring` exists only under H15.

| Family (G23.f) | `--lp-ease-out` | Durations s / m / l (× G23.d) | Stagger | Reveal kinds (1-2 of) | Fits | Never |
|---|---|---|---|---|---|---|
| expo | `cubic-bezier(.16,1,.3,1)` | 0.45 / 0.8 / 1.15, d 180-400 ms | 30-45 ms | fade-rise, mask-wipe | kinetic, garage, circuit, playground | layout properties |
| quint | `cubic-bezier(.22,1,.36,1)` | d 300-700 | 45-70 ms | fade-rise, blur-in, scale-in | maison, bloom, hearth, souk | `blur-in` on body text |
| quart | `cubic-bezier(.25,1,.5,1)` | d 240-600 | 40-60 ms | fade-rise, line-draw | apothecary, field, editorial | |
| critical | a ζ = 1 spring sampled into `linear()` (no overshoot) | d 300-600 | 40-60 ms | fade-rise, scale-in | any | |
| soft-spring | ζ 0.86 spring (`SPRINGS.soft` 0.78 → 0.86, DS28) | d 240-500 | 30-50 ms | scale-in, fade-rise | **playground only** (H15) | layout properties; any other vibe |
| mask | `cubic-bezier(.77,0,.18,1)` | d 500-900 | 60-80 ms | mask-wipe, line-draw | editorial, cinematic grammar, quiet-luxe | per-word text |

### 7.2 Durations and budgets

- Durations come from the family (`--lp-dur-s / -m / -l` = G23.d × 0.45 / 0.8 / 1.15, clamped 160-1000 ms); staggers
  30-80 ms; UI motion (hover, press, selection) ≤ 300 ms; reveals 500-900 ms.
- One signature animation per section at most (S10), ≤ 3 secondary details per page (S11).
- Scroll-linked effects (`G23.sc`, `animation-timeline: view()`, progressive enhancement) only on the hero media, never
  on text.
- Nothing animates layout properties: `transform`, `opacity`, `filter` and `clip-path` only (V23).

### 7.3 The overshoot rule (DS28)

Easing curves with y1 < 0 or y2 > 1 and springs with ζ < 0.85 (overshoot > 0.6 %) exist only on `playground`, and
never on layout properties (H15, V23, S09). `SPRINGS.soft` moves from ζ 0.78 to 0.86 (≤ 0.3 % overshoot, below
perception); `bouncy` (ζ 0.56) stays `playground` only. `--lp-ease-spring` is emitted only for `soft-spring` on
`playground`.

### 7.4 The reveal plan (G35; R5, T2)

- Scope `heads` (default): `data-reveal` on the hero's title, lead, media and CTA and on each section's title and lead
  (and the first image of `image` openers); `hero`: the hero only (airy quiet-luxe pages); `none`: the commerce and
  transactional registers.
- ≤ 60 reveal nodes per page (hard above 120, `budget:R5`), 1-2 reveal kinds, one easing family.
- Text reveals animate **whole lines** (`mask-wipe` or `fade-rise` on the block); never per-word spans in Arabic; a
  Latin word split only for display ≥ 48 px inside the scope (S19, T2).

### 7.5 Hero choreography per grammar

A signature is also *what moves first*. The compile emits `data-reveal` with a per-slot `--lp-reveal-i` index and the
stagger from G23.st, so the frozen runtime's one `data-in` flip produces the sequence with CSS only. No row's total
(last offset × stagger + `--lp-dur-l`) exceeds 1,400 ms.

| G2 | Order (first → last) and offsets | Reveal kind per slot | Image settle | Scroll-linked | The one signature slot |
|---|---|---|---|---|---|
| editorial-column | kicker (0) → title lines (+1 stagger each, whole lines) → lead (+2) → image (+3) → price cluster (+4) → CTA (+4) → COD line (+5) | `mask-wipe` on title lines (mask family) or `fade-rise` (others); image `fade-rise` 12 px | image 1.00 (no scale; the photo is a document) | none | the title's line-by-line wipe |
| poster | title band (0, as one block) → image (+1) → price block (+2) → CTA (+2) → COD (+3) | `mask-wipe` (expo / mask) or `scale-in` 0.97 → 1 (critical); never per word | image 1.06 → 1 inside its mask over `--lp-dur-l` | none | the image's mask reveal |
| gallery-led | grid cells (0, +1, +1, +2 in reading order, the title cell last at +3) → price + CTA inside the title cell (+4) → COD (+5) | `fade-rise` 8 px per cell; `blur-in` on the title cell (quint) | cells 1.03 → 1 | none | the cell cascade |
| stage | stage ground / glow (0) → product (+1, `scale-in` 0.94 → 1 or `fade-rise` 16 px) → contact / plinth (+1 + 60 ms) → title (+2) → price cluster (+3) → CTA (+3) → COD (+4) | product `scale-in` or `fade-rise`; text `fade-rise` | product settles over `--lp-dur-l`; the glow field 1.04 → 1 | the product may drift ≤ 12 px over the first 60 % of the hero's scroll range (desktop only) | the product landing on its stage |
| specimen | image (0) → callouts in order (+1, +2) → title (+3) → price row (+4) → COD (+5) | callouts `line-draw` (quart) or `fade-rise`; title `fade-rise` | image 1.00 | none | the callout lines drawing in |
| catalogue | image (0) → title (+1) → facts rows (+2, +3, +4) → price row (+5) → COD (+6) | `fade-rise` 6 px; row hairlines `line-draw` | image 1.00 | none | the index rows ticking in |
| split-tension | media (0) → title (+1) → lead (+2) → price row (+3) → CTA (+3) → COD (+4) | media `fade-rise` 16 px or `mask-wipe` from the inline-start edge; text `fade-rise` | media 1.04 → 1 | none | the media's edge wipe |
| cinematic | image (0, `mask-wipe` from the bottom or `fade-rise` 0 px, opacity only) → band (+2, as one block: title, price, CTA, COD) → caption (+3) | mask family; the band `fade-rise` 8 px | image 1.08 → 1 over `--lp-dur-l × 1.5` (the only slow settle on the platform) | the image may translate −6 % over the hero's scroll range (desktop and mobile, transform only) | the slow settle |
| quiet-luxe | image (0, opacity only, `--lp-dur-l`) → title (+2) → price + CTA line (+3) → COD (+4); the longest stagger (G23.st ≥ 60) | `fade-rise` 4 px or `blur-in` on the title (quint); nothing else moves | image 1.02 → 1, or none | none | stillness: the image's slow fade is the whole choreography |

The `statement`, `index`, `quiet`, `cinema` and `contact` heroes follow the row of the grammar they serve.

### 7.6 Reduced motion and interaction

- `prefers-reduced-motion: reduce`: opacity only, ≤ 120 ms, in the same order (the frozen `reveal.ts` honours it); no
  transform, no scroll-linked motion.
- `data-motion="off"` turns every duration to 0.
- Accordions animate height smoothly (`interpolate-size` or the grid-rows technique, with a static fallback).
- Selection, focus and hover follow the recipes of §6.6; nothing jumps, nothing shifts layout.

---

## 8. Copy voice

### 8.1 The five registers (G28; DES-§9.10)

The registers are **voices**, not tones: each fixes sentence rhythm, headline structures and what a lead may do, in
each locale. The library and the Director prompts read the same table.

| Register | Rhythm (G30 mean words / exclamations) | Lead and body rules | ar (MSA + Darija per G31) | fr | en |
|---|---|---|---|---|---|
| plain | 7-9 / 0 | one fact per sentence; verbs in the present; no adjective without a noun it measures | MSA short sentences; Darija in CTAs and FAQ questions when G31 ≥ `cta` | `vous`, present, no "découvrez" | plain present, no "discover" |
| warm | 9-12 / 0-1 | second person, a place or a moment ("الدار", "le matin"), one sensory noun per lead | MSA with Darija warmth words in CTAs ("دابا", "ديالك") | tutoiement never; "chez vous" allowed | contractions allowed |
| precise | 6-9 / 0 | numbers only from `allowedNumbers`; materials, dimensions, counts; no metaphor | MSA only in body; Darija CTA allowed | nominal sentences allowed ("Lame en acier.") | spec-sheet nouns |
| bold | 4-7 / ≤ 1 | imperative or word + subline; ≤ 2 clauses; the exclamation, if any, on the final CTA | Darija-leaning when G31 = `light` ("مصنوع باش يدوم") | imperatives ("Faites-le durer.") | imperatives |
| poetic-restrained | 8-12 / 0 | one image per sentence, concrete nouns, no "world of"; a contrast pair allowed once per page | MSA, no Darija in body; CTA may be Darija | no "univers", no "sublimer" | no "elevate", no "tapestry" |

Rules shared by every register: Arabic uses Western digits for Morocco, no tashkeel in copy and one consistent hamza
spelling; French uses the `ProductRef` article and « » with spaces when quoting; English never translates the Darija or
French line.

### 8.2 Headline structures (G29)

Seven structures: `noun-phrase`, `imperative`, `question`, `number-led` (merchant numbers only), `contrast-pair` (two
short lines joined by a line break, never a dash), `quote-led`, `word-subline` (one big word + a subline). Per page:
no structure on > 40 % of titles, ≥ 4 structures on a page with ≥ 8 titles, questions in ≤ 2 titles; the three
directions of one run never share the hero title's structure.

| G28 | Structure weights for titles |
|---|---|
| plain | noun-phrase .35, word-subline .25, imperative .2, contrast-pair .2 |
| warm | imperative .3, noun-phrase .25, question .15, quote-led .15, contrast-pair .15 |
| precise | noun-phrase .35, number-led .25 (merchant numbers only, else 0), contrast-pair .25, word-subline .15 |
| bold | imperative .4, word-subline .3, contrast-pair .3 |
| poetic-restrained | word-subline .35, noun-phrase .3, contrast-pair .2, quote-led .15 |

### 8.3 Composed, not picked (DES-§9.12)

The engine composes the hero title, the section titles and the leads from skeletons (structure × angle × slots) filled
with the product's own facts: `{fact}`, `{number}` (merchant numbers only), `{sense}` (a sensory verb or noun),
`{cod}` (a cash-on-delivery or delivery fact from the store's policies), `{place}` (a place or moment of the warm
register), `{product}`. A skeleton whose slots the store cannot fill is not drawn, so no number, place or claim is ever
invented. Every composed line: the register's rhythm, no cliché hit, no em or en dash, no `·`, French article agreement,
Arabic particle binding, the sheet's line count, and ≥ 1 filled fact, number, sense or COD slot. Examples: "L'huile
d'argan, une texture qui pénètre sans film gras." · "خلّي زيت الأركان يرافق صباحك في الدار، وخلّص ملي توصلك."

### 8.4 The dash rule and punctuation (DS13, C01, C05, C07)

Em and en dashes are not separators in generated copy; `punctuate` rewrites them. Owner-typed text is never rewritten:
the builder flags it with a "Fix punctuation" button.

| Pattern | ar | fr | en |
|---|---|---|---|
| ` — ` / ` – ` between two clauses | `،` (or `.` when the second clause has ≥ 6 words) | `. ` + capitalise, or `, ` when the second part has ≤ 4 words | same as fr |
| ` — ` before a list or an explanation | `: ` | ` : ` (French spacing applied later) | `: ` |
| `—` at the start of an attribution | `- ` | `- ` | `- ` |
| range `10–20` | `10-20` | `10-20` | `10-20` |
| 2nd and later `!` | `.` | `.` | `.` |
| 2nd and later `·` in a line | ` ` + line break in lists, `، ` in ar, `, ` in fr/en | | |

Also: ≤ 1 exclamation mark per page, in the final call to action only (C05); the middle dot `·` ≤ 1 per metadata line,
never in a headline (C07); real typographic quotes; ranges with a plain hyphen.

### 8.5 The cliché lexicon (C02, C03)

Seed lists per locale live in `src/lib/design/lexicon/{ar,fr,en}.ts` (DES-§9.3), written as stems with inflection
classes and matched after normalisation (Arabic clitics and light stemming, French lemmas). They are a seed, extended by
the owner and copy reviewers; the existing `BANNED` hype list (`src/lib/ai/guard.ts`) stays a hard rejection. Examples:
en "elevate", "unlock", "seamless", "delve", "look no further", "not only … but also"; fr "révolutionnaire",
"plongez dans", "découvrez l'univers", "laissez-vous séduire", "que vous soyez … ou …"; ar "ثوري", "سحري", "لا مثيل
له", "اكتشف عالم", "تجربة فريدة", "ليس مجرد … بل …", Darija "ما تفوتش الفرصة". Structure detectors (C03): adjective
triads more than once, "not just X, Y" frames, one structure on every title, questions in > 2 titles.

### 8.6 Specificity (C04; D5)

At least **50 %** of hero and benefit sentences contain a product fact, a merchant number, a sensory word (en smell,
feel, glide, melt, absorb; fr sentir, glisser, fondre; ar رائحة، ملمس، ينساب، يذوب) or a cash-on-delivery or delivery
fact. Copy names real things; numbers beat adjectives.

### 8.7 Darija and the register lock (G31; D3)

- G31 `none`: MSA everywhere; `cta`: Darija only in CTA labels, the sticky bar, the form submit and reassurance, and FAQ
  **questions**; `light`: Darija also in leads and FAQ answers. The register comes from the store's voice setting when
  the owner set one, else from the archetype prior.
- One register per page, questions and answers alike: a generated FAQ pair that mixes MSA and Darija is hard
  (`design:D3`, repaired before the owner sees it); on owner-typed text it is a soft note.
- Keep-list voice (design-baseline §6.6): "اطلب دابا", "خلّص ملي توصلك", "عاين قبل ما تخلص", "بغيت هاد العرض", "واش
  كتوصلو لمدينتي؟"; "Paiement à la livraison", "Vérifiez avant de payer".

### 8.8 French articles (D4)

`{product}` carries gender and article (`ProductRef`): templates render "ce sérum / cette huile / l'huile", never "Ce
que change Sérum…"; every gendered template has a name-free alternative for an unknown gender (`test:copylib`).

### 8.9 Numbers

`allowedNumbers` (`src/lib/ai/guard.ts`) is the one source of merchant numbers. A numeric claim resolves to exactly one
merchant field and keeps the same value everywhere (`honesty:D1`); no number is derived from a photo, a category or a
library table.

---

## 9. Registers

One brand runs across three registers (DES-§11.1). Landing pages are marketing; the commerce and transactional
registers clamp the genes.

| Register | Surfaces | Genes that apply | Genes frozen |
|---|---|---|---|
| **marketing** | landing pages, store home hero and editorial blocks, collection banners, campaign pages | every gene | none |
| **commerce** | collection grid, PDP info column, cart, checkout, COD form, order tracking (LP-05), search | brand type, colour core, ladder, button, numerals, depth; **the PDP hero family is drawn from the store's G2 through STO-§12.8's pool** (`cinematic → immersive .7`, `quiet-luxe → quiet .8`, `poster → stacked .6`, …) and the **marketing islands** of STO-§8.4 (`collectionHeader:banner`, the PDP gallery + `productContent` slot) use the store's full gene set (rev 3, UX-21: the rev 2 "G2 ∈ {catalogue, split-tension}" sentence is withdrawn; it applies to the **collection grid and the info column's own layout** only, which are a grid and a column by nature) | clamps, not grammars: motion ≤ 250 ms, one reveal kind (fade-rise), reveal scope `none` (G35) outside the islands; G16 = 0; accent area ≤ 0.08; G22 = start; no decor (ghost, ring, chips, aurora); CTA plan: one primary per screen (G34); openers `bare` or `number` only (G32) |
| **transactional** | thank-you page, e-mails (DG-14), WhatsApp previews, packing slips, legal pages | logo, colour core, type (with web-safe fallbacks), voice | single column, no motion (reveal scope `none`), no decoration, no glass, accent only on the one CTA and links; openers `bare` |

In R1 (landing-only stores) the brand kit's locks (logo, colours, fonts, the voice pointer) feed every new generation;
the thank-you page and legal pages use the transactional clamps.

---

## 10. Logo and brand kit

### 10.1 Never

Badges, seals, stamps, rotating-text rings, ribbons, banners, distressed or hand-drawn marks; live text in a logo
(every glyph is an outline); mirrored Latin as fake Arabic; gradients in a mark (only the optional app-icon ground may
carry one). The quality bar is the pages': one idea per mark, measured legibility, balanced bilingual weight.

### 10.2 The R1 brand kit (store setting `brand`)

- **Logo upload:** raster only through the media pipeline (no SVG uploads: an SVG can carry script); the file itself is
  never recoloured. Its palette (≤ 6 colours from a 96 × 96 downscale) goes through `nearestAllowed`.
- **Colours:** every pick and extraction passes `nearestAllowed` (§0.1) with the before / after swatch and the note
  "Orange isn't used on Store Gen pages, so we picked the closest allowed colour."; the hue slider hatches 25-75° (C >
  0.06) for every role and 75-95° (C > 0.10) for the accent and pop roles, where a gold pick becomes the warm neutral
  and the picker proposes an olive, teal or majorelle accent.
- **Locks:** colour and font locks are honoured by every new generation; the voice lives in the store's AI voice
  setting (one source).
- **Favicon:** the `mark` asset, else the primary logo when its aspect is ≤ 1.6:1, else the grid monogram.

### 10.3 The R1 grid monogram (DS32)

A 24-unit square grid; letters A-Z and digits 0-9 as stroke skeletons (lines, quarter and half arcs); one stroke width
per vibe (2.5 units maison / editorial / bloom, 3 apothecary / field / souk / hearth, 3.5 kinetic / circuit / garage /
playground); round caps with the pill button family, else butt. Enclosures: none, circle (r = 11), rounded square (r =
6), arch (souk and bloom only). Up to 2 Latin initials; an Arabic-only name renders the brand glyph in its enclosure.
Paths only, no `<text>`; colours from the theme tokens; the ink centroid within 2 % of the enclosure centre.

### 10.4 The logo designer (R2)

- HarfBuzz-shaped outlines on the shipped OFL fonts (Arabic joined correctly, Latin optically spaced); deterministic.
- **Exactly one craft move per wordmark:**

| Move | Geometry tier | Eligible when | Parameters | Fits (vibes) |
|---|---|---|---|---|
| tittle swap | contour | an `i` / `j` dot, or an Arabic letter whose dots are separate small contours (area < 3 % of the glyph box, above x-height or below baseline) | `shape`: circle, diamond, arch (from G25 glyph), size 0.9-1.15 × the original dot area | bloom, playground, souk |
| weight shift | contour | variable display face | one glyph (first letter or a chosen index) ± 100-200 on `wght`, re-shaped with the same advance | apothecary, field, editorial |
| baseline shift | contour | always (fallback move) | one glyph raised or lowered by 2-4 % em | editorial, kinetic |
| counter accent | contour | an inner contour with area ≥ 18 % of its glyph box | that counter filled with the accent colour as its own path | playground, hearth |
| ligature join | contour | two adjacent Latin letters with crossbars or stems within 0.08 em (t-t, f-i, f-f, s-t, r-n) | a bridge rectangle at the crossbar height; overlapping fills render as one shape (non-zero rule) | maison, editorial |
| stem cut | cut (Clipper) | a vertical stem ≥ 0.6 × cap height | a notch at 30° or 0°, width 0.04-0.07 em, through one stem | circuit, kinetic, editorial |
| terminal trim | cut (Clipper) | a terminal (an end of an open stroke: c, e, r, s, t, a) | the terminal cut flat or at the symbol angle | garage, circuit |

- Arabic wordmarks: tittle swap, weight shift or a whole-word baseline shift only; never a cut through a joining stroke;
  kashida at most once, as an explicit parameter.
- Monograms on the 24-unit grid with one corner radius; Arabic initials in their isolated form at 60 % of the enclosure
  height; enclosures none, circle, rounded square, arch (souk, bloom), squircle (mark only).
- Bilingual lockups: primary script on top, the other at 62 %; balanced by measured ink weight (0.92-1.08) and perceived
  height (0.9-1.1), never by forced x-height matching.
- Colour: mono and inverse always generated; the mark ≥ 3:1 on its ground, a tagline ≥ 4.5:1; no orange.
- Small-size test at 16, 32 and 256 px (coverage 20-60 % at 32 px, thinnest feature ≥ 1.5 px); a mark that fails gets
  a simplified favicon, and a wordmark is never a favicon.

---

## 11. Precision checklist

> *"Every element built at a high-quality creative level that fits a modern vibe from high-quality designer
> inspiration — not an AI-generated vibe. Every detail built with precision, creative structure and creative touches of
> design detail."* (the owner's standing rule)

Run it on every section and every page before calling it done. Each line names the gate that checks it and the
baseline target it serves; "review" lines have no automatic gate yet.

### 11.1 Page and section

| Check | Precisely | Gate | Target |
|---|---|---|---|
| Spacing system | every gap from one scale: spacing tokens are multiples of the grid unit (G3, else 4); no one-off margins; no doubled padding where a card meets a section edge; one inner padding per card size | V04 | |
| Grid and alignment | elements snap to the G3 grid; text baselines and image edges align across columns; optical alignment of quotes, icons and numerals | V04, review | |
| Centring | ≤ 2 centred sections in a row and ≤ 50 % of in-flow sections; centred body copy on mobile ≤ 2 sections (≤ 4 on poster, quiet-luxe and statement pages) | V08, S05 | C6 |
| Type hierarchy | hero display ≥ 44 px at 390 and ≥ 2.5 × the body (≥ 3 for composition points); display 10-14 ch wide, ≤ 3 lines | V15, T6 | T6 |
| Type details | `text-wrap: balance` on h1 / h2, `pretty` on leads; body measure 45-75 ch at 1440; ≤ 3 weights per section; tracking only on large Latin display; tabular lining numerals on every price, counter, phone and quantity | V16, V17, T1 | T1, T6 |
| Radius ladder | four tiers, chip < control ≤ card < media, in effective radius (a pill = min(999, height / 2)); nested radius = outer − padding; never one radius everywhere | V05, S03 | R6 |
| Hairlines | one stroke width per page (G14); crisp 1 px hairlines on whole pixels; one hairline between rows, never a top and a bottom border on every row | V04, review | |
| Depth | only the five recipes of §6.6; shadows tinted by the ink toward the accent, one light source; a variant declares no shadow of its own | `theme:check`, `test:design` | K5 |
| Surfaces | one ground + one card tier; no card inside a card; panels only with flat or hairline cards | V29 | K5 |
| Colour | every colour from tokens; AA on every ground, text over images included (scrim); no orange; the gold band never on accent or pop; the pop derived from the accent; no third hue on a dark base; the accent area inside its band | V01, V02, V03, V37, V36, V10 | K3, K4, K6, K7 |
| States | hover, active, selected, focus and disabled defined for every control; the focus ring recipe; the selection morph | V01, review | |
| Composition | one idea per page (G2); ≥ 1 full-bleed moment in the top half, ≥ 1 boundary cross, ≥ 1 quiet screen; an asymmetric grid on ≥ 1 section | V10, V39, composition score | C4, C9 |
| Signature and details | one declared hero signature; ≤ 3 secondary details on the whole page; ≤ 1 signature animation per section (this replaces v2's "a micro-detail in every section") | V39, S10, S11 | R8 |
| Rhythm | no two neighbours share a background; ≤ 2 consecutive image + text splits; ≥ 4 layout families per 8 sections; no 3 sections in a row at one density; word budgets airy ≤ 35 / balanced ≤ 70 / dense ≤ 120 | V07, V38, V08, V09 | C7, C8 |
| Openers | kickers ≤ ⌈n / 3⌉, never on neighbours, plain topic words; ≥ 5 distinct openers; none on > 50 % of sections | V30, S15, S18 | C5 |
| CTAs | ≤ 6 primary CTAs, ≤ 2 visible on mobile, one label per intent, every hero CTA to `#order`, the primary CTA solid or pill | V26, V21 | R1 |
| Floating layers | ≤ 1 bar + ≤ 1 float, fixed UI ≤ 88 px; the bar hidden while a primary CTA or the form is on screen; the header CTA and the float follow the CTA plan | V27 | R7 |
| Duplication | the offer picker once, in the form; the trust strip once; one countdown, with a merchant end date, as a form chip | V31, V32, S23 | R2, R3 |
| Imagery | each photo ≤ 3 uses, the hero ≤ 2 at one crop; ≥ 3 crops when ≥ 2 assets exist; focus inside the inner 80 %; pixels ≥ 1.5 × the slot at DPR 2; cut-outs only with alpha; one consistent set | V11, V12, V13, V14 | I1, I2, I3, I6 |
| Motion | one easing family; no overshoot outside `playground`; nothing animates layout; reveals on the hero and heads only, ≤ 60, whole lines; UI motion ≤ 300 ms | V23, V28, S09, S19 | R5, T2 |
| Glass and light | ≤ 2 glass surfaces, only over imagery or colour fields, opaque fallback; glow on ≤ 2 sections at ≤ 10 % alpha; no aurora, no grain | V06, S06, V40 | R4 |
| Strips and big words | ≤ 1 scrolling strip, whole-item duplication, never clipped; ≤ 1 giant decorative word, sized to fit, the product-name token | V19, V34, S12, V35 | I7, T8 |
| Copy | no em or en dash separators; ≤ 1 "!"; `·` ≤ 1 per metadata line; no cliché frames; ≥ 50 % specific sentences; one Arabic register; French articles agree | C01, C05, C07, C02, C03, C04, D3, D4 | D3-D6, N8 |
| Honesty | every number from a merchant field; no library figures, ratings or synthetic names; proof sections only with their material | `honesty:D1`, `D2`, `I4`, `I5`, `LP-21` | D1, D2, I4, I5 |
| Budgets | 8-14 sections, ≤ 12,000 px, the form within 3 screens, fold items ≤ 760 px, HTML ≤ 90 KB gz | `budget:C3`, `F1`, `C2`, `F5` | C2, C3, F1, F5 |

### 11.2 RTL and Arabic

| Check | Precisely | Gate | Target |
|---|---|---|---|
| Ranges, timers, phones, prices | numeric ranges, timers, phone numbers and prices with Latin units in `<bdi dir="ltr">`; "48-24" is a failure | `Price`, `Countdown`, `RichText` + render regex | RTL1 |
| Countdown plurals | Arabic plural forms (يوم / يومان / أيام / يومًا) from `Intl.PluralRules`, numeral and unit in one LTR group; never "02 يومين" | `Countdown` forms, render-check | RTL2 |
| No rotated or circular Arabic | no `writing-mode` tricks, no `textPath`, the WhatsApp tab horizontal in `ar` | `test:render` lint | RTL3 |
| Price cluster | price, old price and discount chip as one `inline-flex` unit with logical gaps; never split across a line | `Price`, render adjacency | RTL4 |
| Addresses and e-mails | `dir="ltr"` inline blocks, no spaced punctuation | `footer`, render regex | RTL5 |
| No clipped Arabic | no element with Arabic text has its glyph box clipped (ghost words, marquees, badges) | `qa:design-corpus` clip check | RTL6 |
| Logical layout | logical properties only; mirrored directional icons from the allow-list; no tracking, uppercase or italic in `[lang=ar]`; `--lp-ar-scale` = the engine's value for the pairing; the `dir="ltr"` tel input with +212 | V18, `test:render` | RTL7 |
| Coverage | every visual run covers ar and fr at 390 and 1440; the skip link never appears on plain scroll | corpus harness | RTL8 |
| Line breaking | ≥ 2 words per line, no line ending on a particle, balanced, 2-3 lines at 390, whole-line reveals | `RichText` binding, S19, V18 | T2 |
| Leading and marks | display ≥ 1.25, body ≥ 1.6, `padding-block` ≥ 0.12 em on display, the underline below the descender box | `typeTokens`, V18 | T3 |
| Display faces | never Reem Kufi, Noto Naskh Arabic or IBM Plex Sans Arabic as display; no face on > 30 % of a niche's Arabic pages | F11, F12, H33 | T4 |
| Latin inside Arabic | Latin product names in `<bdi>`; `unicode-bidi: isolate` on chips and list items; truncation only with `dir`-aware overflow | `RichText`, V18 | T7 |
| Watermarks | a ghost or watermark word is the same product-name token as the chip, or the device is dropped | V35 | T8 |

### 11.3 States and edge cases

Long Arabic and French text; 1 vs 5 items; a missing image; one photo only (§6.3); 320 px and 1440 px+; reduced motion;
no JavaScript (content stays visible: reveal styles apply only under `html.lp-js`, and a 2.5 s CSS failsafe reveals
everything when the runtime never sets `html[data-rv]`); RTL
mirroring; owner edits beyond the plan (the budget gates are the backstop); legacy documents without `look` (today's
tokens and attributes). All of them must look intentional.

### 11.4 Scores

- **Slop score** (DES-§8.3): the sum of the S-detectors. ≥ 6 refuses publish (`design:R8`), 3-5 triggers repairs in the
  wizard and remix, the corpus median target is ≤ 2 (the baseline pages score 14-19).
- **Quality score** `Q = clamp(70 − 15·H − Σ soft penalties − 4·slop + 10·spec + 5·nov + comp, 0, 100)` (DES-§8.5): H
  = hard items, `spec` = specificity 0-1, `nov` = 1 when every novelty band is `ok`, `comp` = the composition score
  0-15 (full-bleed moment 2, boundary cross 2, quiet screen 2, hero type ratio ≥ 3 2, asymmetric grid 2, distinct crops 2,
  hero signature 3). A clean but bland page scores 80; the corpus median target is ≥ 82, which needs composition.
  Labels: Excellent ≥ 90, Good 80-89, Fair 65-79, Needs work < 65.

---

## 12. Accessibility and performance

### 12.1 Accessibility

- **Contrast:** WCAG AA on every emitted token pair per section ground: text ≥ 4.5:1, large text and UI ≥ 3:1 (V01,
  hard); APCA advisory (body Lc ≥ 75, headings Lc ≥ 60, V02). Glass chips and any text over an image keep AA with a
  scrim. Form inputs show visible boundaries at ≥ 3:1 (F3).
- **Targets:** hit targets ≥ 44 px; form inputs 52-56 px tall at 16 px text, labels 13 / 500 above (P3's contract).
- **Focus:** a visible focus ring on every control (§6.6).
- **Motion:** `prefers-reduced-motion` honoured (§7.6).
- **Language and direction:** `lang` and `dir` on the document; logical properties only; mirrored icons from the
  allow-list; works from 320 px. Mobile is the primary canvas.

### 12.2 Performance

| Item | Budget | Checked by |
|---|---|---|
| Landing runtime JS added by design | **0 bytes**: every gene compiles to tokens, `<html>` attributes, markup and planner choices (DS24) | `render-check` |
| The landing chunk | 24,200 B gz, frozen (tolerance 0); a re-freeze is the owner's decision | `render-check`, `budgets.json` |
| The page's scripts | the `page` cap of `src/landing/runtime/budgets.json` (34,800 B gz for the chunks its `compositions.page` lists: pixels, Turnstile, the feature chunks, assist, landing); the thank-you page 12,600 B | `render-check` |
| Inlined CSS growth from `look` and the new variants | ≤ +4,096 B gz on the heaviest page (the `css` budget key, DES-R5), reported as two lines: the shared base ≤ +1.5 KB gz, the per-variant chunks ≤ +2.7 KB gz on one page | `render-check` |
| CSS delivery | only the CSS of the variants on the page is inlined, once | `render-check` |
| `look` JSON in the document | ≤ 700 B | `theme:check` |
| HTML | ≤ 90 KB gz soft, 140 KB gz hard | `budget:F5` |
| Pictures and fonts | ≤ 16 `<picture>`; ≤ 2 font families and ≤ 4 font files per page; `fontPreloads` ≤ 2 files (display + body of the page's script) | `budget:F5`, F9 |
| Glass | `backdrop-filter` always with an opaque fallback; ≤ 2 surfaces | V06 |
| Layout | no layout thrash; animations on `transform`, `opacity`, `filter` and `clip-path` only | V23 |
| Design computations | sampling + compile ≤ 3 ms per candidate; `runGates` ≤ 8 ms p95 per document; the whole design check at publish ≤ 150 ms p95 on Hostinger | `test:design`, `test:prepublish` |

### 12.3 Browser floor

Landing pages target Chrome 90, Safari 14, Firefox 90 and Samsung Internet 14 (`scripts/build-landing-assets.mjs`,
which lowers the CSS for these targets). Newer CSS is progressive enhancement and degrades to a correct, static layout
(the conventions of `src/landing/styles/base.css`):

- `color-mix()` and relative colours live only in `--mx-*` tokens with plain-token fallbacks, upgraded inside
  `@supports`; engines without them keep the theme's own chip and stage tokens;
- `linear()` springs (the `critical` family) are wrapped with an ease-out fallback, so a transition list never becomes
  invalid;
- individual transforms (`translate`, `scale`, `rotate`) carry motion only; anything a state depends on uses
  `transform`;
- `backdrop-filter` always sits on an opaque fill;
- `:has()`, `:focus-visible` and `:placeholder-shown` live in rules of their own, so an engine that cannot parse them
  drops that rule only (below the floor of `:has()`, the CTA plan's header rule simply never matches and the header
  CTA stays);
- `text-wrap: balance / pretty`, `animation-timeline: view()` and `interpolate-size` are enhancements only.
