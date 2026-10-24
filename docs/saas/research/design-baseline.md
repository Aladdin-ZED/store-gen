# Design baseline — what today's generator produces (2026-10-24)

Status: research input for `docs/saas/spec/design.md`. Companion to `docs/saas/research/design-gen.md` (the planned
Design Genome); the targets in §5 are the numbers that spec must adopt. Everything here is measured on the
current `main` (68c3793) with `scripts/qa/render.ts`; nothing under `src/` was changed. All scratch material lives
in `qa/saas-baseline/` (git-ignored) and is re-runnable.

**Verdict in one line:** component craft is good (type pairings, price micro-copy, COD form plumbing, RTL plumbing),
art direction is absent: 39 of 39 landing pages share one 27-section order, one hero grammar on 23 of them, 2–3
photos repeated 37–64 times, invented proof on every page, and a 32–38-screen scroll. Consensus score **4.3 / 10**.

---

## 1. Method

### 1.1 What was rendered

| Set | Pages | Command shape |
|---|---|---|
| Fixture × locale defaults | 14 (7 fixtures `argan massage blender parfum duo tshirt colors` × ar/fr) | `scripts/qa/render.ts --fixture X --locale L` |
| Archetype sweep, argan (ar) | 11 (`maison apothecary souk hearth bloom field playground kinetic circuit garage editorial`) | `--archetype A` |
| Archetype sweep, tshirt (ar) | 11 | same |
| Seed variants, argan souk ar | 3 (`--seed 7`, `4242`, `90210`; default is 1207) | |
| Thank-you pages | 2 (argan ar, tshirt fr) | `--page merci` |

All 41 with `--now 2026-10-24T10:00:00Z`, QA end state (no `--live`). 0 render errors, 0 `validateDoc` repairs,
0 console/page errors, 0 failed requests across 41 × 2 viewports (Edge, Playwright `channel: "msedge"`).

The 210-page **repetition audit** (§4) is separate: `qa/saas-baseline/repetition-audit.ts` runs
`generateDirections` for the 7 fixtures × 10 seedBases × 3 directions in-process (no browser), the way `selftest.ts`
does, and dumps plans/themes to `repetition-records.json` + `repetition-report.md`.

### 1.2 Where the material is

| Path (under `qa/saas-baseline/`) | Content |
|---|---|
| `html/<name>.html` | 41 rendered pages (940 KB–1 MB each, ≈170 KB gz) |
| `shots/<name>-mobile-fold.png` | 390×844 first viewport @2x (780×1688). **The reliable "first impression" shot.** |
| `shots/<name>-mobile.png`, `shots/<name>-desktop.png` | Full-page 390 @2x and 1440×900 @1x. **Corrupt below ~8 192 CSS px (mobile) / ~16 384 px (desktop)**: Chromium's capture texture limit makes the page tile and repeat (hero reappears at y≈8 400 and y≈24 500 in `argan-default-ar-mobile.png`; the "black rectangle over the arch" in the showcase is this artefact). Nothing below `stats` is trustworthy in these files. |
| `tiles/*-mobile-sheetN.png`, `tiles/*-desktop-sheetN.png`, `tiles/*-m-N.png`, `tiles/*-d-N.png`, `tiles/*-dsk-N.png` | **Re-shot in viewport segments** and composed into contact sheets (`tiles/reshoot.mjs`, `compose.py`, `compose_desk.py`, `make_tiles.py`). Use these for anything below the fold. |
| `tiles/folds-01…11.png`, `review/folds-*.png` | Contact sheets of all 41 fold shots, grouped by fixture/archetype. |
| `review-crops/<name>-m-N.png`, `-d-N.png`, `review-crops/sections/*` | Per-section mobile/desktop crops used for the typography/RTL/copy audit. |
| `review-crops/<name>.txt` | Visible-text extracts per page (copy audit source). |
| `index.json` | Per page: fixture, archetype, locale, seed, heights, `sectionOrder`, `sections[] {type, variant, sid, bg}`, `theme` (`<html data-*>` tokens), `dir`, `problems`, plus an `observations` block. |
| `repetition-report.md`, `repetition-records.json` | 210-plan audit output (§4). |
| `render-all.sh`, `shoot-baseline.mjs`, `build-index.mjs`, `render.log`, `shoot.log` | Re-run scripts and logs. |

Name convention: `<fixture>-<archetype|default>-<locale>[-s<seed>][-merci]`, e.g. `argan-default-ar-s7`,
`parfum-default-fr`, `tshirt-default-fr-merci`.

### 1.3 Who judged

Three independent critic passes (art direction; typography/RTL/copy; composition/COD craft) scored 11 dimensions
on the same evidence set, then one repetition pass measured the generator directly. §2 is the consensus (median of
the three, rounded toward the two that agree); §3 keeps every fact at least two critics confirmed or the HTML shows.

### 1.4 Harness defects to fix before the next baseline

1. Shoot in viewport segments (≤ 8 000 CSS px per capture) and stitch; never trust one full-page PNG above that.
2. The `.lp-skip` link ("Aller au contenu / انتقل إلى المحتوى") is baked into many `review-crops/sections/*` crops.
   It is probably focus-triggered by the capture script; confirm it is never visible on plain scroll.
3. Index `fonts.display/body` is empty for all pages (the `<html data-*>` set does not carry fonts); read them from
   the `--lp-font-*` tokens in the HTML instead.

---

## 2. Scorecard (consensus of three critics; 1 = disaster, 10 = senior art director)

| # | Dimension | Score | Spread | Consensus reason |
|---|---|---|---|---|
| 1 | Visual hierarchy & composition | **4** | 4 · 4 · 5 | One hero grammar on 23/39 pages (chip → stars → headline → ghost word → masked product + 3 callout pills → price). Mobile is a single column of equal-width cards; no bleed, no overlap, no deliberate empty space. Real composition only on `parfum-default-fr` and `tshirt-default-fr` desktop and `argan-editorial-ar`. |
| 2 | Typography craft | **5** | 6 · 5 · 5 | Latin pairings are good. Arabic display is weak (Reem Kufi on souk, per-word reveal spans that break bidi and strand prepositions, tight display leading with diacritic collisions). Prices in Bodoni old-style figures on `parfum-default-fr`. |
| 3 | Colour strategy | **5** | 5 · 6 · 5 | Product-derived accent, no orange detected. But 4–9 accent/pop/dark slabs per page (index: min 4, max 9), an unmotivated third "pop" hue (teal on argan, ice-blue on massage, pink on parfum), muddy dark pages, three nested surface levels. |
| 4 | Imagery treatment | **3** | 3 · 3 · 3 | 2–3 distinct `src` per page shown in 40–64 `<picture>` slots; same crop every time; before/after = same photo desaturated; "video" = still + chip; massage "cutout" is a grey rectangle; tshirt is a flat vector. |
| 5 | Rhythm & spacing | **3** | 3 · 3 · 4 | 27 sections, identical opener cadence (label pill → H2 → lede), 32–38 phone screens, form at screen 14–17, packs shown 2–3×, 58–68 `.lp-btn` per page. |
| 6 | Motion & detail | **5** | 5 · 5 · 5 | 80–96 `backdrop-filter` rules and 343–397 `data-reveal` nodes per page (motion noise); rotating-text stamps on trust bars; uniform radius. Good details exist (leader-line hotspots, FIG. captions, pedestal offers, ×2 sticky badge). |
| 7 | Freedom from "AI tells" | **3** | 3 · 2 · 4 | Ghost word, eyebrow chip, 3 hotspots, chat-bubble "problem", big-number stats with invented footnoted sources, phone-mock reviews, tape marquee, desaturated slider, rotating seal, countdown, "4,7 (312)" on every page. Lexicon is clean (no Unlock/Elevate/Seamless in any locale). |
| 8 | RTL correctness | **6** | 7 · 6 · 6 | Plumbing right (`dir="ltr"` phone with +212, Western digits, mirrored arrows/leader lines, no Arabic tracking). Faults are typographic: bidi reversal "X Pulse", wrong-end ellipsis, "48-24", "02 يومين", rotated Arabic tab, clipped ghost words and marquees. |
| 9 | COD conversion craft (mobile) | **6** | 6 · 5 · 6 | Sticky bar, COD reassurance, +212 field, city select are best-in-class. Price + CTA below the fold on the 23 stage heroes; form 2 840 px tall at 45 % depth; pack chosen twice; invented per-piece options; three floating layers collide. |
| 10 | Distinctiveness between pages | **2** | 2 · 2 · 3 | argan × 11 archetypes = one wireframe re-skinned; seeds change palette and copy only; different products at the same archetype share hero, pairing and tail. |
| 11 | Premium feel vs generic template | **5** | 5 · 4 · 6 | Not a generic SaaS template (no icon triplets, no indigo gradient); two desktop pages reach studio level; the rest reads as a polished Shopify COD theme with every section switched on. |
| | **Overall** | **4.3** | 4.5 · 4 · 4.5 | |

---

## 3. Evidence

Shot names below are the `qa/saas-baseline/` basenames; `-fold` = `shots/<name>-mobile-fold.png`, `sheet` =
`tiles/<name>-mobile-sheetN.png` / `-desktop-sheetN.png`, `crop` = `review-crops/<name>-m-N.png`.

### 3.1 Composition and hierarchy

- **One hero grammar.** `stage` hero on 23/39 landings (index `hero.variant`: stage 23, poster 8, spec 4,
  editorial 4), chosen solely by archetype: stage for maison/apothecary/souk/hearth/bloom/field, poster for
  playground/kinetic, spec for circuit/garage, editorial for editorial. Every stage fold is: eyebrow chip, stars
  "4,7 (312)", headline with swoosh/underline on one word, subline, oversized ghost word behind the photo ("Ambre",
  "FreshGo", "Sérum", "Éclat", "الآركان", "تيشيرت"), product in arch/rounded/circle mask with three callout pills,
  price, pack pills, CTA. See `tiles/folds-02.png`, `folds-03.png`, `folds-05.png`, `folds-07.png`;
  `argan-apothecary-ar-fold`, `argan-bloom-ar-fold`, `argan-field-ar-fold`, `argan-maison-ar-fold`,
  `blender-default-fr-fold`, `duo-default-fr-fold`, `parfum-default-ar-fold`, `tshirt-maison-ar-fold`.
- **No negative space as a device; no boundary crossing.** Every mobile section is a full-width stack of rounded
  cards of equal width (`argan-default-ar-mobile-sheet1…4`, `parfum-default-fr-mobile-sheet*`). On `surfaces:
  panels` pages even the hero sits inside a rounded panel (`argan-default-ar-desktop-sheet1`,
  `parfum-default-fr-dsk-1`). Three nested surface levels (panel → tinted surface → card) so nothing reads as
  ground (`argan-default-ar-dsk-1`, `argan-default-ar-dsk-2`).
- **Where composition exists** (keep as reference register): `parfum-default-fr-dsk-1/2` (numbered 01–05 Didone
  benefits with hanging thumbnails, Didone quote on brown, pedestal ×1/×2/×3 offers); `tshirt-default-fr-dsk-1/2`
  (5:7 editorial split, big quote problem block, "FIG. 01" captions, spec-sheet table); `argan-editorial-ar-m-1…4`
  (figure captions, numbered column, ruler/dimension showcase). All of it flattens into a centred stack on mobile.
- **Fold conversion.** On the 23 stage heroes price and primary CTA fall below 844 px; the fold shows only the
  small header button (`argan-default-ar-fold`, `parfum-default-ar-fold`, `blender-default-ar-fold`,
  `tshirt-maison-ar-fold`, `argan-apothecary-ar-fold`, `argan-bloom-ar-fold`). Poster/spec heroes get it right
  (`massage-default-ar-fold`, `tshirt-garage-ar-fold`, `argan-playground-ar-fold`), but `massage-default-fr-fold`
  (kinetic) pushes the CTA under the fold and `colors-default-ar-fold` crops it.

### 3.2 Typography

Good: Bodoni Moda + Hanken (`parfum-default-fr`), Big Shoulders + Figtree (`massage-default-fr`), Archivo
(`tshirt-default-fr`), Gloock + Figtree (`argan-default-fr`), Changa + Noto Kufi (`argan-kinetic-ar`), Instrument
Serif + Hanken. Tabular price chips and the `⁦−25%⁩` isolates are correct where used.

Faults, each with the page to open:

| Fault | Pages / shots |
|---|---|
| Prices in Bodoni **old-style figures**: "249 DH" reads "2 19", subtotal "449" wobbles (violates DESIGN.md §9 tabular-lining rule) | `parfum-default-fr-dsk-2`, `review-crops/parfum-default-fr-d-1.png` |
| Reem Kufi as Arabic display on souk: decorative/2010, swoosh-underlined ~20× per page; damma of "تُلمس" sits on the underline | `argan-default-ar-fold`, `argan-souk-ar-fold`, `argan-default-ar-m-1` |
| Arabic display leading too tight: hamza of "بدأت" collides with the full stop of the line above (Alexandria ExtraBold) | `massage-default-ar-m-0` (review-crops) |
| Per-word reveal spans break the bidi run: "Pulse X" renders "X Pulse"; `text-overflow` truncates the Latin run at the wrong end ("…lse X مسدس التدليك") | `massage-default-ar` orderForm heading and reviews (`review-crops/massage-default-ar-m-1/2`, `massage-default-ar.txt`) |
| Per-word spans strand prepositions / build widow stacks: "نعومة تُلمس من / أول استعمال"; h1 as three one-word lines "قماش / تحسّ / به"; "به" alone; justified gaps "قماش   تحسّ   به" | `argan-default-ar-fold`, `argan-editorial-ar-fold`, `tshirt-default-ar-fold`, `tshirt-garage-ar-fold` |
| FR hero wraps into 4 ragged 1–2-word lines in the desktop 1/3 column: "Une douceur / qu'on sent / dès le / premier geste." | `argan-default-fr-ds-1` (review) |
| Ghost word spelled differently from the product chip: "الآركان" vs "الأركان" (every argan ar page), "تشيرت" vs "تيشيرت" | `argan-*-ar-fold`, `tshirt-playground-ar-fold` |
| Ghost word clipped by viewport/card edge or overlapped by the seal | `colors-default-ar-fold`, `argan-circuit-ar-fold`, `argan-playground-ar-fold`, `argan-kinetic-ar-fold`, `tshirt-kinetic-ar-fold` |
| Hero display ≈ 36 px on mobile: modest for paid-traffic pages | all stage folds |

### 3.3 Colour

- Accent/pop/dark full-bleed sections per page: **4 to 9** (index `sections[].bg`, excluding header/announcement/
  floats). Every page cycles base → soft → surface → accent → dark → pop in the same order
  (`argan-default-ar-mobile-sheet2/3`, `parfum-default-fr-mobile-sheet2/3`).
- **Unmotivated third hue:** teal marquee + story band in a brown/gold page (`argan-default-ar`, y≈8 100 and
  ≈20 000, `argan-default-ar-mobile-sheet2/3`); cyan "pop" panel in a black/gold page (`argan-circuit-ar-m-2`,
  y≈4 800); powder/ice-blue ribbon and badge in red/black (`massage-default-fr-mobile-sheet2`); pink demo and
  WhatsApp CTAs in an ivory/brown maison page (`parfum-default-fr-dsk-2`); blue hero + ochre + beige + brown on
  `argan-playground-ar-m-1…4`.
- **Muddy dark pages:** dark base + brown panels + gold cards, low ink contrast on body text, and a bright cream
  photo rectangle inside the arch (`argan-default-ar-fold`, `argan-souk-ar-fold`, `argan-default-fr-m-1`).
- **Saturation fatigue:** red hero + red cards + red stats + red tape (`massage-default-fr-mobile-sheet1/2`,
  `massage-default-ar-fold`). Mint/hot-pink/black/white alternation (`colors-default-ar-m-0…2`).
- **Palette unrelated to product:** pink/berry base for an argan serum on seeds 7 and 90210
  (`argan-default-ar-s7-fold`, `argan-default-ar-s90210-fold`).
- **Orange risk:** argan gold family sits at OKLCH hue ≈ 85–90°, just outside the 25–75° gate; it will read amber
  on cheap AMOLED panels (`argan-default-ar`, `argan-kinetic-ar`, `argan-circuit-ar`, `argan-garage-ar`). Keep
  gated, add an sRGB-rendering check for hue 75–95° at high chroma.
- Good: argan olive-gold, parfum taupe/ivory, tshirt sage/olive, blender raspberry, duo blush; `colors-default-ar`
  is loud but coherent.

### 3.4 Imagery

- `argan-default-ar.html`: 3 distinct image `src`, 40 `<picture>`; `parfum-default-fr.html`: 2 src, 64 pictures;
  `tshirt-default-fr.html`: 3 src, 62 pictures. The argan bottle-on-stand appears ≈ 14–19× per page at the same
  crop and scale (hero, chat bubble, 3 benefit cards, showcase, stats card, before/after ×2, offer ×3, gallery,
  story, video poster, sticky bar) — `argan-default-ar-mobile-sheet1…4`, `argan-default-fr-mobile-sheet1…4`.
- **Fabricated before/after:** the same photo desaturated on one half, captioned "SANS/AVEC", "LE MATIN/LE SOIR",
  "Photos de Khadija M. · Tanger" (`argan-default-ar-mobile-sheet2` y≈7 500, `parfum-default-fr-mobile-sheet2`,
  `tshirt-default-fr-mobile-sheet2`, `blender-default-fr-desktop-sheet3`, `massage-default-fr-mobile-sheet2`).
- **"Video" is a still** with an "en action" chip (`*-mobile-sheet3`, section `video`).
- **Non-cutout treated as cutout:** the massage gun is a grey-background render placed as a tilted grey card on
  crimson/charcoal, no stage, no contact shadow (`massage-default-ar-fold`, `massage-default-fr-fold`,
  `massage-default-ar-m-0`). The tshirt is a flat vector placeholder on every tshirt page; hotspots point at blank
  fabric (`tshirt-default-fr-fold`, `tshirt-bloom-ar-fold`).
- **Mismatched second photo:** parfum's flat-lay shows a gold bottle while the hero shows a clear one
  (`parfum-default-fr-mobile-sheet1/2`).
- **Outline marquee glitch:** boxed word "Eau de parf|um" (`parfum-default-fr-mobile-sheet2` y≈7 250), "سيروم زيت"
  cut mid-glyph (`argan-editorial-ar-m-2`, `argan-circuit-ar-m-2`, `argan-playground-ar-m-2`).

### 3.5 Rhythm, length, duplication

- Mobile height 26 525–31 757 CSS px (32–38 screens of 844); desktop 24 944–32 839 px. Order form at y≈12 000–
  14 500 (screen 14–17), 2 840 px tall (3.4 screens) — `argan-default-ar-mobile-sheet3`.
- 27 sections, each opening with label pill → two-line H2 with one coloured/italic/underlined word → lede, ~22×
  per page (`*-mobile-sheet*`).
- Packs shown 2–3× (offer tickets, order-form step 01, often the final CTA card): `argan-editorial-ar-m-3/4`,
  `tshirt-default-fr-mobile-sheet3`, `massage-default-fr-mobile-sheet3` (y≈9 600 and ≈12 000).
- `.lp-btn` per page: 68 (`argan-default-ar`), 58 (`parfum-default-fr`), 66 (`tshirt-default-fr`); ~20 visually
  distinct CTAs per page; 4 CTAs visible at once on mobile (header, hero, sticky bar, WhatsApp float).
- Trust strip 2×2 in `trustBar`, again as a 3-up inside the form, again in the footer; countdown in the
  announcement bar, the urgency block and the CTA card (`parfum-default-fr-mobile-sheet1…3`).
- Card grids 8× per page (trust, benefits, stats, offer, reviews, steps, guarantee, specs).

### 3.6 Motion and detail

- `backdrop-filter`: 96 / 80 / 80 rules (argan-default-ar / parfum-default-fr / tshirt-default-fr); glass on
  hotspots, price badges, sticky bar, seal, marquee, counters.
- `data-reveal`: 394 / 397 / 343 nodes — everything animates.
- Rotating-text stamp badges on trust bars and guarantees although DESIGN.md §1.1 bans them (`argan-default-fr-m-1`
  trustBar `stamps`, `parfum-default-fr` "0 DH d'avance", `massage-default-fr` "−198 DH", `tshirt-playground-ar`,
  `argan-kinetic-ar`); glass orbs with dashed curved connectors in `steps` (`argan-default-fr-mobile-sheet3`);
  gradient progress bars under stats; giant cut-off wordmark footer on every page.
- Every card radius 20–28 px, every chip a pill, every surface the same soft grey shadow: the radius ladder is one
  rung (`*-mobile-sheet*`).
- Floating-layer collisions: sticky bar sits 40 px above the in-flow "Je veux l'essayer" button
  (`parfum-default-fr-mobile-sheet2` reviews); sticky bar + WhatsApp bubble + in-section CTA on every mid-scroll
  crop; two fixed bars + float eat ≈ 130 px of 844.
- `hero:scrapbook` (collage, banned aesthetic per DESIGN.md §1.1) is reachable through the `tagged` list in
  `chooseVariant` and reaches 12 % of plans in the 210-page audit (`src/landing/sections/hero/index.tsx:127-131`).

### 3.7 "AI tells" and invented data

Per page, all of: ghost word; eyebrow pill above every H2; three hotspot callouts; chat-bubble "problem" with
timestamps 21:38–21:43 (`argan-default-ar-mobile-sheet1`, `blender-default-fr-desktop-sheet2`,
`colors-default-ar-m-1`); big-number stats with gradient bars and asterisked sources; phone mockups of WhatsApp
reviews; tape marquee; desaturated slider; rotating seal; countdown "L'offre se termine dans 02 jours"; "VS" circle
comparison (`massage-default-fr-mobile-sheet3`); ratings "4,7 (312)" / "4,8 (54)" / "4,6 (128)" on every hero,
review summary and footer; initials avatars "il y a 2 jours".

Invented figures rendered as measured, from the copy library (`src/landing/sections/stats/copy.ts:57-69`, `:109-125`,
`:135-151`): "94 % … Questionnaire auprès de nos clientes après 14 jours", "+9 400 pièces livrées partout au Maroc",
"3 200 percussions / 3 200 ضربة في الدقيقة". The `INVENTED_FIGURE` reservation blocks `socialProof:counter` but
not these. Same-page contradictions: tshirt "+9 400 pièces livrées" (stats) vs "1 000 colis livrés" (socialProof,
`tshirt-default-fr-mobile-sheet4` y≈19 200); blender "frais en 30 secondes" (hero) vs "Prêt en 40 secondes"
(benefits) vs "30 s et c'est prêt" (stats) — `blender-default-fr-desktop-sheet1…3`.

Copy skeletons identical across products (fr: "Ce que change X au quotidien", "Mesuré, pas imaginé", "Des chiffres
précis, avec leur source juste en dessous", "Des messages de gens qui ont commandé, reçu, puis recommandé",
"Trente secondes, on s'occupe du reste", "Vous ne payez que si ça vous plaît", "Une question avant de commander ?
On vous répond." on argan/parfum/blender/tshirt/massage; ar: "ما الذي يغيّره X في يومك", "مقيس، لا متخيَّل",
"عمّر المعلومات، والباقي علينا"). Grammar slotting breaks French: "Ce que change Sérum à l'huile d'argan pure, au
quotidien" (missing article). Arabic register drifts inside one page: MSA ledes, Darija CTAs and FAQ questions,
MSA FAQ answers (`argan-default-ar.txt`, `tshirt-default-ar` crops). "Trente secondes, on s'occupe du reste" is
contradicted by a 2 800 px form.

Lexicon is clean: no Unlock/Elevate/Seamless/révolutionnaire/ثوري in any `review-crops/*.txt`.

### 3.8 RTL

Right: `lang="ar" dir="rtl"`, logical properties, mirrored arrows/chevrons/leader lines/grid columns, `dir="ltr"`
phone input with leading +212, Western digits (correct for Morocco), `⁦−25%⁩` isolates, `[lang=ar]` zeroes tracking,
sticky bar mirrored (price right, CTA left).

Wrong, with pages: "التوصيل فـ 48-24 ساعة" range reversed (`blender-default-ar-fold` announcement); countdown "02
يومين 16:25:10" ordering and double-counted dual (`argan-circuit-ar-fold`, every ar announcement); bidi reversal
"X Pulse" and wrong-end ellipsis (`massage-default-ar`); rotated vertical Arabic WhatsApp tab "سولنا على واتساب"
(`argan-editorial-ar-m-2`, `tshirt-default-ar-m-1`); Arabic on a circular path in ring badges; discount chip
detached far left of the price cluster "249 درهم ~~329~~ −24%" (`parfum-default-ar-fold`); footer "12 , rue Ibn
Khaldoun , Essaouira" with spaced commas and "contact @dar-argane.example" split (`argan-default-ar-mobile-sheet4`);
marquee and ghost-word clipping listed in §3.2/§3.4.

### 3.9 COD conversion

Strong: sticky bar (thumbnail, ×2 badge, price, strike-through, "خلّص ملي توصلك" / "Commander"); COD line under
submit ("ما كتخلص حتى توصلك", "Vous ne payez qu'à la réception"); +212 field; city `<select>`; order summary;
WhatsApp alternative; "النتائج فردية" disclaimers; merci pages (`argan-default-ar-merci-fold`,
`tshirt-default-fr-merci-fold`) are clean and restrained.

Weak: price/CTA under the fold on stage heroes (§3.1); form at screen 14–17 and 3.4 screens tall; pack re-chosen
in the form after the offer section; invented per-piece option "Pièce 1 · Usage Visage/Cheveux" for a serum
(`argan-default-fr-mobile-sheet3`); confusing "Modifier" per-piece UI (`blender-default-fr-desktop-sheet4`
y≈12 000); upsell checkbox and note field before submit; single-value colour picker still shown ("Noir ● / grey ○",
`massage-default-fr`, `tshirt-default-fr`); `tshirt-default-fr` minimal form has underline-only inputs with no visible
boxes; announcement ticker's second item clipped behind the countdown pill at 390 px (`argan-default-ar-s7-fold`);
≈170 KB gz HTML + 40–64 pictures + 2 font families on 3G.

---

## 4. Repetition: measurements and root causes

Source: `qa/saas-baseline/repetition-report.md` (210 plans = 7 fixtures × 10 seedBases × 3 directions, 3.8 s).

### 4.1 Measurements

| Axis | Measurement |
|---|---|
| Rendered section order (41 pages) | **1 distinct order** across all 39 landings (27 sections). Seeds 1207/7/4242/90210 of argan souk: identical order and identical variant ids; only palette, pairing, `data-base`, `data-surfaces` and headline wording change. |
| Archetype per product (210 plans) | Fixed triple per fixture over all 10 seeds: argan apothecary › bloom › maison; massage kinetic › circuit › apothecary; blender hearth › circuit › field; parfum maison › bloom › editorial; duo apothecary › bloom › maison; tshirt and colors editorial › bloom › maison. bloom 50, maison 50, apothecary 30, editorial 30, circuit 20, kinetic/hearth/field 10. **souk, playground, garage: 0 of 210.** 100 % of 945 same-fixture seed pairs share the archetype. |
| Section sequence (plans) | 119 distinct of 210; 74 distinct type sets. Positional lock: hero 0 (210/210), trustBar 1 (193), benefits 2–3 (210), orderForm 3–5 (210), **offer › guarantee › faq › cta tail on 210/210**. Variety = which optional blocks exist (problem 53 %, story 61 %, specs 38 %, comparison 33 %, marquee 33 %, gallery 26 %), not where anything goes. |
| First-screen tuples | distinct (hero, benefits, orderForm) = **54** of 210; (archetype, hero, benefits, orderForm, offer) = 115. |
| Variant entropy | hero 2.22/2.58 bits (editorial 30 %, split 30 %, stage 20 %, scrapbook 12 %, spec 5 %, poster 2 %); trustBar 1.38/2.00 (chips 48, ledger 42, stamps 9, ribbon 1); socialProof 0.89/1.58 (whatsapp 69, ugc 31; counter blocked); steps:cards 3 %. Within an archetype the top hero takes 54–80 % (maison stage 54 %, apothecary split 60 %, field editorial 80 %). |
| Theme tokens | button/card/mask/glyph/emphasis/density/shadow: **8 distinct tuples for 210 pages = the 8 archetypes used**; radius 1:1 with archetype; 3 font pairings per archetype, top pairing 37–50 % (bloom "cover" 48 %, maison "atelier" 48 %); 4 display faces cover 69 % of pages; El Messiri on 47 of 90 ar pages; base light 49 / tinted 44 / dark 8 (dark only circuit/kinetic); surfaces panels 77 %; offer (picker, selection, density) 9 tuples, selection and density 100 % fixed per archetype. Accent/pop: 78/25 distinct — colour is the only product-driven axis. |
| Cross-product similarity J(type:variant) | all cross-fixture pairs mean 0.23 (types-only 0.79, same hero 24 %); same archetype 0.33, ≥0.5 in 8 %; same archetype + same seedBase **0.42, ≥0.7 in 15 %**. 19 of 20 "twins" (same archetype, hero, pairing, base, identical order, different product) share the seedBase, e.g. `argan#11/dir3 ≈ tshirt#11/dir3` J=0.89. |
| Locale | tshirt (fr) vs colors (ar), same seed/rank: identical sections, variants, backgrounds and theme in 30/30. Locale changes nothing structurally. |
| Seed sensitivity (same product, rank) | same archetype 100 %, same hero 43 %, same pairing 31 %, same base 52 %, same order 1 %, mean J 0.35; over 10 seeds a product visits only 8–9 (archetype, hero) pairs and ≤ 3 base moods. |
| Within one wizard run | anti-repeat works: 3 distinct heroes in 90 % of runs, sibling J 0.17. |

Net: for one category the platform offers ≈ 3 archetypes × 3 pairings × ~3 heroes × 3 storylines × 2 bases ≈ 160
first-screen looks, all with the same buttons, cards, masks, radii and tail; two stores in one niche sit at J ≈ 0.33
on variants and 0.79 on section types with nothing pushing them apart.

### 4.2 Root causes (file:line)

1. **Archetype is a seed-free function of (category, palette, keywords).** `rankArchetypes` / `CATEGORY_TABLE`
   (`src/lib/theme/vibe.ts:29-45, 308-328`) + `moodFit`; `pickArchetypes` (`src/lib/generator/directions.ts:368-386`)
   takes the top 3. No seed, store or locale enters; the 35 % runner-up swap in `themeFromProduct` (`vibe.ts:510-518`)
   is dead because the generator always forces `archetype`.
2. **Archetype locks ~70 % of the look.** `ARCHETYPE_DEFS[a]` fixes button, card, mask, glyph, emphasis, radius,
   density, shadow, harmony, container, type ratio, labels, motion; `themeFromProduct` emits
   `radius/shadow/texture: "archetype"` (`vibe.ts:608-610`), read verbatim by `buildThemeTokens` (`tokens.ts:419-433`).
   Only base mood weights, a 15–35 % surfaces flip, dividers, ornament ±0.2 and a 3-pairing draw (`vibe.ts:579`) are
   sampled.
3. **Three pairings per archetype**, uniform draw (`archetypes.ts`, `d.fonts`).
4. **Three storylines with a fixed head and tail.** `TEMPLATES` (`src/lib/generator/plan.ts:90-97`) all start
   hero › trustBar › benefits and end offer › guarantee › faq › cta; `TEMPLATE_PREF` 0.6/0.28/0.12 (`plan.ts:100-112,
   124`); optional blocks rolled by `AFFINITY` (`plan.ts:75-87`). The rendered QA fixtures force all 27 sections on,
   so the 41 pages show the worst case: one order.
5. **Steep variant prior on a short list.** `chooseVariant` (`plan.ts:262-308`) weights `preferredVariants`
   (2–3 ids) 0.58/0.27/0.15; `STRICT_SPREAD` only avoids the two siblings; reservations (GENERIC, LOUD_FOR_CALM,
   NEEDS_STORE_NAME, INVENTED_FIGURE) shrink pools further. `tagged` lets `hero:scrapbook` in.
6. **Anti-repeat scope = the 3 siblings of one run** (`directions.ts:455-470`); no cross-store, cross-product or
   cross-run memory.
7. **RNG ignores the product.** `directionSeed` = seedBase + `direction:i:archetype` (`directions.ts:427`); every
   `rngFor(seed, key)` depends on nothing else, so two products at the same (seedBase, archetype) are near-twins. In
   production `seedBase = Math.random()` per wizard session (`src/components/generate/state.ts:188, 217`), so this
   appears as "the product does not shape the design", not as literal duplicates.
8. **Offer display is an archetype table** (`OFFER_LOOK`, `src/lib/generator/offers.ts:128-140`).
9. **Rendered hero is archetype-determined** (`src/landing/sections/hero/index.tsx` preferred lists): stage for 6
   archetypes, so 23/39 QA pages share the stage grammar.
10. **Proof sections render from copy libraries** (`src/landing/sections/stats/copy.ts`) rather than merchant
    fields; `INVENTED_FIGURE` guards one variant, not the section family.

---

## 5. What the new design system must achieve (measurable targets for `docs/saas/spec/design.md`)

Each target names the baseline value it replaces. "Hard" blocks publish; "soft" lowers the quality score
(design-gen.md §5.5). Gene ids refer to design-gen.md §3.2.

### 5.1 Novelty and distance

| Target | Baseline | Rule |
|---|---|---|
| N1 Genome distance, same niche | J(type:variant) 0.33, twins at 15 % | `d ≥ 0.40` (design-gen §4.1 metric) against every live store in the niche; `d ≥ 0.25` platform-wide. Hard at store creation; re-checked on brand-gene change. |
| N2 Pages inside one store | seeds give identical order | `d_page ≥ 0.30` against the store's last 10 pages. Hard. |
| N3 Section-order diversity | 1 distinct order in 39 pages; tail identical 210/210 | Over any 100 generated landings in one niche: ≥ 60 distinct in-flow sequences; no 4-section subsequence present in > 50 % of pages; no fixed position for any section except hero (0) and footer (last). Measured in CI on the fixture sweep. |
| N4 First-screen tuples | 54 distinct (hero, benefits, form) / 210 | ≥ 150 / 210 on the same sweep; (hero family × composition grammar × colour strategy) ≥ 40 distinct / 210. |
| N5 Archetype reach | 3 archetypes per category, 3 of 11 unreachable | Every archetype reachable for every category (floor 2 % per design-gen §4.3); top archetype share per category ≤ 45 % over 100 stores; souk/playground/garage > 0. |
| N6 Seed and product sensitivity | same seed + archetype, different product → J 0.42 | Product facts enter the RNG stream (seed = hash(seedBase, store, product, locale)); same (seedBase, archetype) across two products must give J ≤ 0.25 and never share hero + pairing + order. |
| N7 Locale sensitivity | ar/fr identical structure 30/30 | Arabic and Latin pages of the same genome differ in type scale, hero arrangement choice (RTL-aware pools) and line-break strategy; identical `type:variant` sequences across locales allowed, identical rendered type metrics not. |
| N8 Copy-structure novelty | 7 fr and 3 ar H2 skeletons verbatim on every product | Per niche, no headline 3-gram shingle (after product-name masking) may appear on > 10 % of live pages (design-gen §4.4 `headline_shingles`); headline-structure (G29) share per page ≤ 40 % for any one structure; ≥ 4 structures per page. Soft; hard at > 25 % shingle share. |

### 5.2 Composition, hero, storyline

| Target | Baseline | Rule |
|---|---|---|
| C1 Hero families | stage on 23/39 (59 %) | ≥ 6 structurally different hero families (poster, editorial column, cinematic bleed, quiet-luxe, specimen, split-tension, stage); any one family ≤ 30 % per niche over 100 stores. |
| C2 Hero fold contract (mobile 390×844) | price + CTA below fold on 23 heroes | Product image, price, one primary CTA and the COD line all inside the first 844 px for **every** hero family and locale. Hard (Playwright gate). |
| C3 Section count & length | 27 sections, 26.5k–31.8k px, 32–38 screens | 8–14 in-flow sections; mobile height ≤ 12 000 px (≈ 14 screens) at 390; order form starts ≤ 3 000 px (screen ≤ 4). Hard above 16 sections or 15 000 px. |
| C4 Composition devices | none | Per page: ≥ 1 full-bleed image or colour moment, ≥ 1 boundary-crossing element (image or type crossing a section edge), ≥ 1 "quiet" screen (≤ 35 words, one image or none). Soft. |
| C5 Section-opener grammar | label pill → H2 → lede ~22× per page | ≥ 5 opener structures (no label, caption column, number-led, quote-led, bare headline, image-first); eyebrow pill on ≤ 30 % of sections; swoosh/underline emphasis on hero only. Soft; hard when one opener > 70 %. |
| C6 Alignment | centred stack everywhere on mobile | ≤ 2 centre-aligned sections per page (design-gen §5.2). |
| C7 Density pattern | uniform | No 3 consecutive sections with the same density; A-B-A-C or A-A-B pattern declared in the plan and verified from word counts (airy ≤ 35, balanced ≤ 70, dense ≤ 120 words). |

### 5.3 Type

| Target | Baseline | Rule |
|---|---|---|
| T1 Numerals | Bodoni old-style figures on prices | `font-variant-numeric: tabular-nums lining-nums` on every price, counter, phone, quantity. Hard (CSS lint on `.lp-price*`, `.lp-count*`, `[data-num]`). |
| T2 Arabic display line-breaking | one-word lines, stranded "من/به", justified gaps | h1/h2 in `[lang=ar]`: ≥ 2 words per line, never end a line on a preposition/particle (من في على إلى عن مع و), `text-wrap: balance`, 2–3 lines max at 390; reveals animate whole lines (clip/mask), never per-word spans. Hard. |
| T3 Arabic leading & marks | hamza/damma collisions | Display `line-height ≥ 1.25`, body ≥ 1.6 in `[lang=ar]`; `padding-block` ≥ 0.12em on display runs; underline/swoosh offset below descender box. Hard for leading, soft for underline. |
| T4 Arabic display faces | Reem Kufi on souk, El Messiri on 52 % of ar pages | No Reem Kufi as display; ≥ 8 Arabic display candidates (Noto Kufi, Alexandria, IBM Plex Arabic, Changa, Cairo, Tajawal, Almarai, Readex Pro …); any one face ≤ 30 % of ar pages per niche. |
| T5 Pairing breadth | 3 per archetype, top 37–50 %, 4 faces = 69 % | ≥ 8 pairings per archetype, ≥ 60 total (G4); top pairing ≤ 25 % within an archetype; top display face ≤ 20 % platform-wide. |
| T6 Mobile display size & measure | ≈ 36 px hero, 4-line ragged FR heroes | Hero display ≥ 44 px at 390 (display/body ratio ≥ 2.5); display `max-inline-size` 10–14 ch; ≤ 3 lines; body measure 45–75 ch desktop. Soft. |
| T7 Latin bidi hygiene | "X Pulse", wrong-end ellipsis | Latin product names in `[lang=ar]` wrapped in `<bdi>`; truncation only with `dir`-aware overflow; `unicode-bidi: isolate` on chips/list items. Hard. |
| T8 Watermark consistency | "الآركان" vs "الأركان" | Any ghost/watermark text derives from the same product-name token as the chip, or the device is dropped. Hard. |

### 5.4 Colour

| Target | Baseline | Rule |
|---|---|---|
| K1 Colour strategy gene | one base/soft/surface/accent/dark/pop cycle | Strategy (G9) sampled per store: ink+one, duotone, colour-field, tonal, dark-luxe, high-key, monochrome+signal; any one strategy ≤ 35 % per niche. |
| K2 Full-bleed colour moments | 4–9 accent/pop/dark slabs per page | ≤ 2 full-bleed accent/pop moments per page (colour-field strategy: ≤ 1 per screen, ≤ 4 per page). Hard above 4. |
| K3 Accent area budget | not measured | ink+one 3–8 %, tonal/high-key ≤ 15 %, duotone ≤ 25 %, colour-field 25–35 % of estimated rendered area (G10). Soft. |
| K4 Pop derivation | teal on argan, ice-blue on massage, pink on parfum | Pop hue within ±30° (analogous) or 150–210° (complement) of the accent in OKLCH, chroma within ±0.04 of accent; dark bases allow no third hue. Hard. |
| K5 Surface levels | panel → surface → card | One ground + one card tier per page (`tonal-layers` strategy may add one); nested cards forbidden. Hard. |
| K6 Orange guard | argan gold at hue 85–90° | Existing gate (hue 25–75°, chroma > 0.06) stays hard; add advisory for hue 75–95° with chroma > 0.10 rendered to sRGB (soft). |
| K7 Dark pages | muddy brown-black, cream photo rectangle | Body text on dark ≥ APCA Lc 75 (advisory) and WCAG AA (hard); photos with uniform light backgrounds on dark bases must be cut out or framed on a matching panel (ties to I3). |
| K8 Base from photo | pink base for argan | Base luminance chosen from photo-background luminance and strategy, not archetype alone; palette hue family must be within the product/photo harmony or declared "contrast" strategy. |

### 5.5 Imagery

| Target | Baseline | Rule |
|---|---|---|
| I1 Reuse | one `src` in 14–19 slots | Same photo ≤ 3 appearances per page (sticky bar and form thumbnail excluded); ≤ 2 for primary hero image at the same crop. Hard above 4. |
| I2 Crop intent | one crop | ≥ 3 distinct crops per page from focal points (full / tight-detail / context or bleed); aspect ratios from the G19 set; focal inside the inner 80 % of every slot. Hard for focal, soft for count. |
| I3 Cutout detection | grey render placed as a cutout | Uniform-background images are either cut out (alpha) or switched to `framed`/`full-bleed-crop`; `cutout-stage` requires alpha; every cutout gets a contact shadow or stage. Hard. |
| I4 Honest proof sections | desaturated clone slider, still "video", stock-like credits | `beforeAfter` requires two distinct merchant images; `video` requires a video URL/file; `gallery`/`ugc`/`lookbook` require ≥ 3 distinct assets; photo credits only from merchant-entered names. Otherwise the section is reserved. Hard. |
| I5 Hotspots | pointing at blank fabric | Hotspot callouts only with merchant-placed anchors (focal editor); otherwise the hero family without hotspots. Hard. |
| I6 Resolution | not measured | `pxWidth ≥ 1.5 × slotWidth@DPR2` per slot (design-gen §5.1). Hard. |
| I7 Marquee clipping | boxed/cut words | Marquee track uses word-safe duplication and `direction`; QA gate: no element containing Arabic or Latin text may clip its glyph box (`overflow` check on screenshot diff). Hard. |

### 5.6 Rhythm, motion, detail budgets

| Target | Baseline | Rule |
|---|---|---|
| R1 CTA count | 58–68 `.lp-btn`, ~20 visible CTAs | ≤ 6 primary CTAs per page (sticky bar counts as 1); ≤ 2 CTAs visible simultaneously on mobile; header CTA hidden while hero CTA is in view; WhatsApp float collapses into the sticky bar when the bar is shown. Hard above 8. |
| R2 Offer duplication | packs 2–3× | Pack/offer picker rendered once; it lives in the order form (the form picker is the offer section). Hard. |
| R3 Trust & urgency duplication | trust strip 3×, countdown 3× | Trust strip once; countdown once and only with a merchant-set end date; urgency as a chip in the form, not a section. Hard. |
| R4 Glass budget | 80–96 `backdrop-filter` | ≤ 2 glass surfaces per page outside nav/sticky (G16). Hard above 4. |
| R5 Reveal budget | 343–397 `data-reveal` | ≤ 60 reveal nodes per page; reveals on hero and section heads only; 1–2 reveal kinds and one easing family per page; ≤ 1 signature animation per section. Hard above 120. |
| R6 Radius ladder | one rung (20–28 px everywhere) | 4 distinct tiers chip < control ≤ card < media from one set (crisp/soft/round/mixed); nested radius = outer − padding. Hard. |
| R7 Floating layers | sticky + WhatsApp + in-flow CTA overlap | ≤ 1 fixed bar + ≤ 1 float; fixed UI ≤ 88 px of 844; sticky bar hidden while any in-flow primary CTA is ≥ 50 % visible. Hard. |
| R8 Tell budget | all tells on every page | Each of {ghost word, eyebrow chip set, hotspot trio, chat-mock problem, rotating stamp, tape marquee, big-number stats, desaturated slider, countdown, phone-mock reviews, giant footer wordmark} is a sampled device with page budget ≤ 1 in total per page from this list ≤ 2; never the same pair twice in a niche; rotating stamp and scrapbook removed from pools (DESIGN.md §1.1). Slop score ≥ 6 fails (design-gen §5.2). |
| R9 Equal-card grids | 8 grids per page | ≤ 3 card-grid sections per page; no two adjacent; ≤ 1 equal-card triplet. Soft; hard above 5. |

### 5.7 Copy and data honesty

| Target | Baseline | Rule |
|---|---|---|
| D1 Numbers-consistency gate | 30 s vs 40 s; 9 400 vs 1 000 | Every numeric claim resolves to exactly one merchant field (`allowedNumbers`) and the same value is used everywhere it appears; contradiction = hard fail. |
| D2 No library figures | `stats/copy.ts` percentages and "questionnaire" sources | Stats/counter/ratings/review sections render only from merchant-entered data (`reviews` table, order counts, declared tests); no copy-library number, no "4,7 (312)" default, no synthetic names/cities/"il y a 2 jours". Hard. |
| D3 Register lock (ar) | MSA ledes, Darija CTAs, mixed FAQ | One register per page (G31: MSA / MSA+Darija CTAs / Darija-leaning), applied to questions **and** answers; lint on FAQ pairs. Soft; hard when FAQ Q/A registers differ. |
| D4 French product slotting | "Ce que change Sérum … au quotidien" | `{product}` carries gender/article metadata; templates use "ce sérum / cette huile" forms or rewrite around the name. Hard (grammar lint on article + noun). |
| D5 Specificity | not measured | ≥ 50 % of hero and benefit sentences contain a product fact, merchant number, sensory verb or COD/delivery fact (design-gen §5.3). Soft. |
| D6 Lexicon | clean | Keep the hype-word guard; extend the fr/ar seed lists from design-gen §5.3; ≤ 1 "!" per page. Hard on existing list. |

### 5.8 RTL gates

| Target | Rule |
|---|---|
| RTL1 | Numeric ranges, timers, phone numbers, prices with Latin units wrapped in `<bdi dir="ltr">`; "48-24" style reversals = hard fail (regex on rendered text in `[dir=rtl]`). |
| RTL2 | Countdown pluralisation: dual/plural rules (يوم / يومان / أيام) or numeral + singular; never "02 يومين". Hard. |
| RTL3 | No rotated/vertical Arabic, no Arabic on circular text paths. Hard. |
| RTL4 | Price cluster (price, old price, discount chip) is one inline-flex unit with logical gaps; chip adjacency verified in RTL screenshot. Hard. |
| RTL5 | Addresses and e-mails as `dir="ltr"` inline blocks; no spaced punctuation. Hard. |
| RTL6 | Clip gate: no element with Arabic text may have its glyph box clipped by `overflow` (ghost words, marquees, badges). Hard. |
| RTL7 | Existing rules stay hard: logical properties only, mirrored directional icons (allow-list), no letter-spacing/uppercase/italic in `[lang=ar]`, Arabic +6–10 % size, `dir="ltr"` tel input with leading +212. |
| RTL8 | Every visual CI run covers ar and fr at 390 and 1440; the `.lp-skip` link must not appear on plain scroll. |

### 5.9 COD form and weight

| Target | Baseline | Rule |
|---|---|---|
| F1 Form position & size | screen 14–17, 2 840 px | Form top ≤ 3 000 px at 390; form height ≤ 1 100 px (≈ 1.3 screens) in default state: offer → name → phone → city → submit; address/note after the confirmation call or collapsed. Hard. |
| F2 Options | invented "Usage" per piece; single-value colour picker shown | Per-piece options only when the product declares variants (docs/OFFERS.md); pickers with one value hidden; per-piece rows collapsed behind one summary row. Hard. |
| F3 Inputs | underline-only fields on `minimal` | Every form variant renders visible input boundaries (border or filled) at ≥ 3:1 contrast. Hard. |
| F4 Upsell | before submit | Upsell on the merci page or after submit only. Hard. |
| F5 Weight | ≈170 KB gz HTML, 40–64 pictures, 96 glass rules | ≤ 90 KB gz HTML per landing; CSS of used variants inlined once; ≤ 16 `<picture>` elements; lazy-load below the form; ≤ 2 font families / ≤ 4 font files. Soft; hard above 140 KB gz. |

### 5.10 Verification harness (how targets are measured)

- Fixture sweep in CI: 7 fixtures × ar/fr × 10 seeds (140 plans) for N3–N8, T5, K1, R8, R9; 41-page render set for
  C2–C7, K2, I1–I7, R1–R7, RTL1–RTL8, F1–F5. Playwright `channel: "msedge"`, 390 and 1440, screenshots in ≤ 8 000 px
  segments.
- Report format: `qa/saas-baseline/index.json` schema extended with `genome`, `gates[] {id, level, pass, value,
  threshold}`, `slop`, `Q`; regression = any hard gate pass→fail or median Q drop > 3.
- The scorecard in §2 is re-run by critics on the same 11 dimensions after R1 of the genome ships; target
  consensus ≥ 7.5 overall, no dimension < 6, distinctiveness ≥ 8.

---

## 6. Keep-list (do not regress)

1. **Product-derived palettes and the no-orange gate** — argan olive-gold, parfum taupe/ivory, tshirt sage/olive,
   blender raspberry, duo blush, colors mint/pink; tinted neutrals; AA contrast; `theme/color.ts` + `theme/blend.ts`
   stay the foundation the genome widens.
2. **Latin type pairings** — Bodoni Moda/Hanken, Big Shoulders/Figtree, Archivo, Gloock/Figtree, Instrument
   Serif/Hanken, Changa/Noto Kufi (ar); the catalogue grows to ≥ 60, nothing is removed.
3. **Mobile sticky order bar** — thumbnail with ×2 badge, price, strike-through, discount, "خلّص ملي توصلك" /
   "Commander"; desktop floating pill. Keep exactly, add the hide-while-in-flow-CTA rule.
4. **COD form plumbing** — `dir="ltr"` tel input with leading +212, city `<select>`, order summary "المجموع اللي
   غادي تخلص عند الاستلام", reassurance line under submit, WhatsApp alternative, privacy line, "النتائج فردية"
   disclaimers; merci pages (`argan-default-ar-merci`, `tshirt-default-fr-merci`) as the restraint reference.
5. **Price micro-craft** — pack cards with per-piece price and savings, crossed old price, `⁦−25%⁩` isolates,
   Western digits in ar, DH/درهم handling, tabular chips (extend to all numerals, T1).
6. **Copy voice and guard** — concrete, sensory, numbers over adjectives, no hype words in any locale; Darija CTAs
   and FAQ questions ("اطلب دابا", "خلّص ملي توصلك", "عاين قبل ما تخلص", "بغيت هاد العرض", "واش كتوصلو لمدينتي؟");
   good lines: "Une douceur qu'on sent dès le premier geste", "Une signature, pas une tendance", "Sur la photo, le
   tissu avait l'air beau. En vrai, il grattait.", "انتهى التمرين. بدأت الراحة", "قماش تحسّ به". Vary structure, keep
   voice.
7. **Editorial craft details → detail kit** — numbered 01–05 Didone benefits with hanging thumbnails
   (`parfum-default-fr-dsk-1`), "FIG. 01" captions and spec-sheet tables (`tshirt-default-fr-dsk-2`,
   `argan-editorial-ar`), ruler/dimension showcase (`argan-editorial-ar-m-2`), pedestal ×1/×2/×3 offers, leader-line
   hotspots (merchant-anchored only), the "0 DH d'avance" seal as a budgeted option.
8. **RTL plumbing** — logical properties, mirrored arrows/chevrons/leader lines/grid columns, `[lang=ar]` zero
   tracking and no uppercase/italic, Western numerals for Morocco, mirrored sticky bar.
9. **Honesty reservations already in place** — `INVENTED_FIGURE`, `NEEDS_STORE_NAME`, `GENERIC`, `LOUD_FOR_CALM`
   in `chooseVariant`; the hype-word guard in `guard.ts`; `allowedNumbers`. Extend their scope (D1, D2, I4), do not
   replace them.
10. **Within-run anti-repeat** — `STRICT_SPREAD` and the sibling `avoid` map give 3 distinct heroes in 90 % of
    wizard runs (sibling J 0.17); keep as the inner loop of the cross-store distance check.
11. **Theme token discipline and QA renderer** — `<html data-*>` contract, `scripts/qa/render.ts --now/--seed/
    --archetype`, `validateDoc`, zero console errors on 41 × 2 viewports; the new harness extends it (segmented
    shots, genome + gates in the index).
