# Decoration & light system — v2 · modern

Product-tinted light, precise vector lines, clean shapes and modern section transitions
(docs/DESIGN.md §7). Decoration supports the product; it never becomes ornament. Everything here is
a **pure component**: no hooks, no context, no `Math.random`, so the same props always give
byte-identical markup (publish, admin preview, static export).

```tsx
import { Badge, Divider, GlassChip, GlowOrb, LeaderLine, Swoosh } from "@/landing/illustrations";
```

Styles: `illustrations.css` is bundled into the landing base stylesheet by
`scripts/build-landing-assets.mjs` (run `node scripts/build-landing-assets.mjs` after editing it).

## Ground rules

| Topic | Rule |
| --- | --- |
| **Seed** | `seed: number \| string`. Derive it from the page seed + section id + a local key: ``seed={`${ctx.seed}:${id}:leader`}``. Same seed, same drawing; another key, another drawing. Seeds only vary composition (positions, widths, which side), never smoothness: every curve is an exact cubic. |
| **uid** | Pieces that emit XML ids (gradients, clip paths, text arcs, patterns) take a required `uid`: section id + local key (``uid={`${id}-badge`}``). Ids become `lpi-<uid>-<local>`. |
| **Color** | Never hard-coded. `tone` (primary, painted as `currentColor`), `tone2`, `tone3` map to theme tokens: `--sec-*` inside a `[data-bg]` section, `--lp-*` elsewhere. Tones: `current ink soft line accent accent-ink accent-soft accent-strong pop pop-ink bg card card-ink chip dark highlight glow` (`paper` = `card`, kept for older call sites); `tone3`: `bg card chip ink accent pop dark`. `glow` = the section's product light. `highlight` = the kit's hue-true accent tint `--mx-tint-2` (the accent mixed into the drained ground, never into the ground itself — that is how a crimson on cream turns peach; keeps the section ink legible). |
| **Light** | Glows (GlowOrb, the Spotlight cone) use the block's one product light (`--ill-glow`: the accent tint at ≤ 10 % alpha, DES-§3.2 S06). There is no mesh of lights and no grain on a generated page (core D60 rev 3, V40): the `Aurora` and `Grain` pieces are gone. Product stages (the Halo disc, the Spotlight pool) use `--lp-stage-glow`, the theme's ambient glow behind a cutout. `intensity` multiplies that light: `subtle` .4 · `soft` .65 · `medium` .85 · `strong` 1 (exactly the light the theme guarantees text over). Beams use a pale tint of the product hue at ~70% of that. An explicit `tone` replaces the theme light with that token. No SVG or blur filters: gradients + masks only, animated with transform/opacity. |
| **Size** | SVG pieces: `size` sets the width (number → px, or a CSS length string); height follows the viewBox. HTML-hosted pieces take CSS lengths: `size` prop or `--badge-size`, `--sticker-size`. Light layers fill their host (`layer`, default) or a `size` box. |
| **Decorative** | Everything is `aria-hidden` and ignores pointer events. Words that matter (badge text, sticker text) must also exist as real text nearby. `GlassChip`, `Dimension` and `Sticker` host real HTML text. |
| **Draw reveal** | Strokes carry `pathLength="1"` + `.lp-draw`. `reveal` puts `data-reveal="draw"` on the piece (`delay` in ms → `data-delay`); the runtime sets `data-in` and `styles/base.css` draws the strokes. Multi-part pieces stage themselves with `data-d="1..4"` (line → end dot, stem → leaves → buds) and solid bits (`.lp-draw-pop`) pop with a spring on their stage. |
| **Pop reveal** | `Badge` and `Sticker` take `reveal` → `data-reveal="stamp"` (spring pop, owned by base.css). |
| **Idle** | `idle="spin" \| "spin-rev" \| "float" \| "drift" \| "pulse" \| "twinkle"`. Only under `html[data-motion]` other than `off` and `prefers-reduced-motion: no-preference`; `calm` runs them 1.8× slower; `pulse`, `twinkle` and the leader `pulse` ping run on `lively` only. Loops run on an inner element, never on the one carrying `data-reveal` or a placement transform, so `reveal` + `idle` + `place` are always safe together. |
| **RTL** | Directional pieces (LeaderLine, SpeedLines, Beam origins, side fades, asymmetric dividers) mirror under `[dir="rtl"]`; `rtlFlip` opts any SVG piece in. Placement (`place`) is logical. Short labels inside stickers, price chips and dimension chips take their direction from their own text (`unicode-bidi: plaintext`). |

### Text helpers (TS)

`estimateEm(s, caps?)` — conservative advance width in em (Latin caps / Arabic), for fitting SVG text.
`hasArabic(s)` — any Arabic letter. `isolateNumbers(s)` — Arabic text with every number wrapped in an
LTR isolate (U+2066…U+2069), for SVG or HTML strings that the bidi algorithm would otherwise reorder.

### Layering & helpers (CSS)

| Class / attribute | Use |
| --- | --- |
| `.lp-decor-host` | on the section or media box: `position: relative; isolation: isolate` |
| `.lp-decor-host--clip` | also clips bleeding light (placed orbs and halos overhang on purpose) |
| `.lp-layer` | absolute full-bleed layer, z 0 (light, grids, zellige) |
| `.lp-decor` / `.lp-decor--front` | absolute decoration, z 1 (behind content) / z 3 (over content) |
| `.lp-above-decor` | content wrapper, z 2 |
| `place` prop: `center top bottom start end top-start top-end bottom-start bottom-end` | light pieces and Shape3D: absolute placement centred on that point of the host (logical) |
| `.lp-glass` | frosted glass from the theme's per-section glass: `--sec-glass` fill + `--lp-glass-filter` blur/saturation, `--sec-glass-border`, inner highlight, `--lp-shadow-m`. `--sec-glass-ink` is AA over any backdrop and on the opaque `--sec-glass-solid` used without `backdrop-filter` and under `prefers-reduced-transparency`. Add `data-bg="dark"` for smoked glass on a light block. |

## Catalog

All components accept `className`. Archetype tags show where a piece shines (DESIGN.md §3).

### Light & depth — `light.tsx`

| Component | Props (beyond className) | Notes |
| --- | --- | --- |
| `GlowOrb` | `size` (60%), `shape` circle / wide / tall, `tone` (glow), `intensity`, `place`, `idle` float / drift / pulse | Soft gaussian light behind a product or headline. All archetypes. |
| `Halo` | `size` (80%), `rings` 0–3, `orbit`, `seed`, `tone`, `intensity`, `place`, `idle` pulse / float | Disc of stage light (`--lp-stage-glow`) + 1px accent hairline rings + optional orbiting dot. Maison, bloom, apothecary. |
| `Beam` | `seed`, `origin` top / top-start / top-end / bottom, `count` 1–7, `angle`, `spread`, `fan` (64°), `tone`, `intensity`, `layer` | One soft stage beam, or a fan of 2–7 discrete beams from one source with seeded widths, reach and strength (a stage rig, never a sunburst). Kinetic, maison, playground. |
| `Spotlight` | `origin` top / top-start / top-end, `pool`, `tone`, `intensity` (medium), `layer` | Stage cone (the block's product light) + pool of light on the floor under a cutout (`--lp-stage-glow`). Maison, circuit, hero `stage`. |
| `GlassChip` | `glass` auto / dark, `size` s / m, children | Frosted pill with real content: spec callouts, captions over media. |

### Precise lines — `lines.tsx`

| Component | Props | Notes |
| --- | --- | --- |
| `GridLines` | `cell` (40), `major` (every Nth line stronger), `tone` (line), `opacity`, `fade` radial / down / up / edges / start / end / none, `layer` | CSS hairline grid fading out. Circuit, editorial, spec heroes. |
| `DotGrid` | `cell` (22), `dot` (1.1px), `tone`, `opacity`, `fade`, `layer` | Fine dot matrix. Circuit, apothecary, playground. |
| `LeaderLine` | `from` / `to` (viewBox points), `width` × `height` (200 × 120), `shape` curve / elbow, `curve` −1…1, `start` / `end` dot / ring / arrow / none, `weight`, `pulse`, `reveal`, `tone` (ink) | Precise callout: anchor ring → smooth curve (or diagonal + shelf) → end dot. Draws on; the anchor can ping. Hotspots, spec and stage heroes. |
| `Swoosh` | `seed`, `variant` sweep / arc / line / wave, `aspect` (8), `weight` (3), `waves`, `vertical`, `tone` (accent) | One clean underline stroke, stretched to its box: size it under the word. `wave` = a calm sine line. |
| `Rings` | `count` (4), `spread` (.4), `fade`, `tone` (line) | Concentric 1px rings drawing on in sequence. With `reveal` the stroke scales with the box (1 unit of 200), so the draw dash measures the whole circle. |
| `SpeedLines` | `uid`, `seed`, `count`, `weight`, `tone` (accent) | Clean gradient streaks trailing behind an object moving toward the inline end. Kinetic. |
| `Sparkline` | `uid`, `values` (real numbers), `width` × `height`, `area`, `dot`, `weight` | Smooth trend line, soft area, end dot. Stats. |
| `CircleMark` | `seed`, `variant` oval / loose / box, `aspect`, `weight` | A precise ellipse (or pill) drawn around a word or number. |
| `CheckMark` / `CrossMark` | `frame` plain / ring / disc / square, `weight`, `tone3` | Geometric marks; `disc` knocks the mark out of a solid circle. |

### Badge — `badge.tsx`

`Badge({ uid, text, label?, sublabel?, glyph?, sep?, variant?, tone?, tone2?, spin?, upright?, reveal?, delay?, size?, minPx? })`
— clean circular badge with text running around it (vector, no ink). `text` is one phrase or 2–4
(each gets its own arc, separated by `sep`); Latin caps are tracked out along their arc with
`textLength` (a short phrase only so far, then centred), Arabic is never letter-spaced (sized from a
safe estimate). **Readable minimum**: ring text never renders under ~9px (Latin) / 10.5px (Arabic)
on screen — up to 18 / 20.5 of 200 units, one size for every phrase of a ring. A short phrase repeats
onto more arcs only while it stays that large (a long phrase goes round once, never twice small).
When all the phrases only read on a large badge, a compact ring (the first phrase alone, larger) is
drawn too and the badge switches by its own width (`data-ring-at`, an `@container lp-ring` query in
illustrations.css; engines without container queries keep all phrases). `minPx` (smallest diameter
in CSS px) skips the compact ring when the badge is known to stay large enough; below 7rem it lifts the
ring text (within its band, up to 21 / 23.5 of 200 units) so a small badge still reads at ~9px — a
section showing a badge under 7rem on phones should pass its smallest size.
`variant` solid (filled disc, knocked-out text, accent highlight + tinted shadow), outline (hairline)
or glass (frosted disc, text in the glass ink). The ring spins slowly with `spin`; the center
(`label`, `sublabel`, `glyph`) stays upright.
`upright` (default: on when any phrase is Arabic) sets the ring as a seal: arcs under the bottom run
counter-clockwise so every phrase reads upright, one type size for the whole ring, and `spin` becomes
a ±6° sway (`.lp-idle-sway`). Bidi: Latin / numeric strings render `direction="ltr"` in their own
isolate (`−25%` stays `−25%` on RTL pages); numbers inside Arabic phrases are wrapped in LTR isolates
(`isolateNumbers`), so `24–48` never flips to `48–24`. Class `.lp-ringbadge` (`.lp-badge` belongs to
the primitives).

### Glyphs & Sparkle — `glyphs.tsx`

`Glyph({ kind })` inline 1em mark and `glyph(kind, x, y, r)` for your own SVG. Kinds: `dot spark diamond
star8 asterisk check heart bolt leaf flower`. `Sparkle({ seed, twin, tone2, twinkle })`: one clean
4-point star (+ an optional small twin); one per section at most. `sparkD()` exports the star path.

### Shapes — `shapes.tsx`

| Component | Props | Notes |
| --- | --- | --- |
| `Shape3D` | `shape` sphere / pill / torus, `tone` (accent), `finish` matte / gloss, `size` (6rem), `seed` (orientation), `place`, `idle` float | Soft 3D form from gradient shading: key light, bounce light, occlusion, contact shadow. Playground, bloom. |
| `Sticker` | `seed`, `shape` circle / cookie / burst / blob / spark, `tone` (pop), `shadow` soft / none, `tilt` (≤ 6°), `idle`, `reveal`, `delay`, children | Crisp vector sticker with real text on top, colored soft shadow, hairline sheen. `cookie` has 6–8 soft lobes, `burst` 8–9 rounded points (contemporary soft shapes, not seals). Size: `--sticker-size`. |

### Leaf & pictograms — `botanical.tsx`, `pictograms.tsx`

`Leaf({ seed, variant, weight, tone2 })` — minimal single-weight botanical line icons: `leaf`, sprigs
(`sprig olive round fern lavender wild`, 64 × 96) and blooms (`flower daisy`, 64 × 64). Exact almond
leaves on smooth stems; draws stem → leaves → buds. Field, apothecary, souk (olive), bloom.

`Pictogram({ kind?, pool?, seed, weight })` — consistent 48-grid line icons (`heart smile sun cloud leaf
star bolt drop arrowLoop underline spiral flower crown sparkle check`); omit `kind` to let the seed pick
from `pool`. `pickPictogram(seed, pool)` exposes that pick.

### Modern Moroccan — `moroccan.tsx`

| Component | Props | Notes |
| --- | --- | --- |
| `ZelligeLines` | `uid`, `tile` (96px), `variant` star / rosette, `tone` (accent), `opacity` (≤ .12, default .06), `weight`, `fade` (radial), `layer` | The {8/2} star-and-cross tessellation as hairlines at very low opacity, masked to fade out. Souk (and maison accents). |
| `ArchFrame` | `uid`, `kind` round / pointed / horseshoe / keyhole, `ratio` (.8), `keyline` none / line / offset / inset, `tone` (line; `bg` for inset), `reveal`, `delay`, children | Clips media to a clean arch (bounding-box clipPath computed for the ratio, so curves never distort; feet drawn as continuous corners, like the kit's squircles) + optional 1px keyline: `line` on the edge, `offset` floating outside, `inset` a closed passe-partout line just inside, concentric with the arch. `reveal`: the frame rises open (`mask-arch`) while the media settles 1.06 → 1, then the keyline (a non-scaling 1px hairline, `.lp-nss`) fades in. |
| `ArchClip` / `archPath()` | `uid`, `kind`, `ratio` | Just the clipPath (`clip-path: url(#lpi-<uid>-arch)`), or the raw outline. |

### Measurement — `measure.tsx`

`Ruler({ length, unit, orientation, from, body, unitLabel })` — real subdivisions (mm, or 1/8 inch),
mono numerals. `Dimension({ orientation, ends, tone, children })` — hairline + tick or chevron caps + a
centred chip label (real text). Showcase `dimensions`, spec heroes.

### Section transitions — `dividers.tsx`

`Divider({ kind, uid, from, to, seed?, flip?, height? })` for exactly `DIVIDERS` in
`src/lib/page/schema.ts`:

| kind | Shape |
| --- | --- |
| `none` | renders nothing (space + color change) |
| `curve` | one large asymmetric swoop |
| `diagonal` | a subtle clean angle |
| `steps` | a clean offset joined by a smooth S |
| `arch` | one soft dome across the width (a sine profile: reads as an arch at 390px as at 1440px, never a flat-topped tab) |
| `wave` | one gentle period |
| `fade` | a soft color fade (smoothstep, OKLab; each step capped to a sand where it would cross the orange band — `--mx-safe`). The page renderer only draws it between grounds within ΔL 0.25 of each other; past that the next shape of the theme list is used |

`from` / `to` are the section backgrounds above / below; the fill uses the raw section colors
(`--lp-bg --lp-soft --lp-surface --lp-accent --lp-dark --lp-pop`). By default the upper section
hangs into the lower one; `flip` makes the lower one rise (use it when the lower block is heavier).
Heights are responsive per kind (`height`: `sm`, `md`, `lg` or px). The seed picks side, curvature and
split; asymmetric kinds mirror in RTL. The shape's base sits 2px outside the box, so no seam row ever
shows. Under `html[data-surfaces="panels"]` dividers are hidden: floating panels are separated by the
page gap, never by a full-bleed edge.

## Archetype pairings

| Archetype | Reach for |
| --- | --- |
| maison | Spotlight, Halo (rings), GlowOrb, hairline LeaderLine + GlassChip, Badge outline, one Sparkle |
| apothecary | DotGrid, Halo, LeaderLine + GlassChip, Leaf, CheckMark ring, Sparkline |
| souk | ZelligeLines (≤ 6%), ArchFrame, Leaf olive, Badge solid with `star8` |
| playground | Shape3D, Sticker cookie / burst, Beam fan, DotGrid |
| kinetic | Beam, SpeedLines, Swoosh sweep, GridLines |
| circuit | GridLines major, DotGrid, LeaderLine elbow, GlassChip, Rings, Sparkline |
| hearth | GlowOrb, Sticker blob, Swoosh arc, Leaf |
| bloom | Halo + orbit, Shape3D gloss, Sparkle twin |
| field | Leaf, Swoosh |
| editorial | GridLines (edges), CircleMark, LeaderLine, Dimension |
| garage | GridLines, Beam, Ruler, Dimension, Shape3D pill |

## Renamed in v2

v1 names keep compiling: each renders the closest modern component (see `compat.tsx`). New code
uses the modern names.

| v1 | v2 rendering |
| --- | --- |
| `HandArrow` | `LeaderLine` with a chevron end (clean curve) |
| `HandCheck` / `HandCross` (`frame` circled / boxed) | `CheckMark` / `CrossMark` (`ring` / `square`) |
| `Squiggle` | `Swoosh variant="wave"` |
| `ScribbleUnderline` | `Swoosh` (line → line, double → arc, scribble / swash → sweep, wave / zigzag → wave) |
| `Stamp` | `Badge` (classic → outline, badge / seal → solid; `texture`, `tilt` ignored) |
| `PriceTag` | a clean price chip: solid pill, soft shadow, inner highlight, ≤ 3° tilt (no string) |
| `Rays` | `Beam` fan of 3–6 soft stage beams from the top (tone ignored: rays are light) |
| `Pattern` | `ZelligeLines` (zellige), `DotGrid` (dots, halftone, terrazzo), `GridLines` (everything else; blueprint gets major lines) |
| `BlueprintGrid` | `GridLines` with major lines |
| `Doodle` / `DoodleKind` | `Pictogram` / `PictogramKind` |
| `LeafSprig` (alternate → sprig) / `Botanical` | `Leaf` |
| `Tape` | renders nothing: tape has no modern form (overlap media with a `GlassChip` instead) |
| `Sticker` shape `scallop` | `cookie` |
| tone `paper` | `card` |

## Removed in v2

Paper/kraft/wood/ink textures, tape, ink stamps, torn/scalloped/zigzag/stitched/perforated edges and
dividers (`TornEdge`, `Scallop`, `ZelligeBand`, `CautionStripe`, the marquee-tape divider), doodles and
scribbles, hand circles, confetti, checker/gingham/halftone/terrazzo patterns, perforations, caution
stripes, hanging price tags with strings, die-cut sticker rims, ornamental flourishes and the 360°
ray burst.

## Recipes

**Product on a lit stage** (hero `stage`, maison / circuit):
```tsx
<section className="lp-section lp-decor-host" data-bg="dark">
  <Spotlight />
  <div className="stage lp-decor-host">
    <Halo place="center" size="96%" rings={2} orbit seed={`${ctx.seed}:${id}:halo`} idle="pulse" />
    <Picture … />
    <LeaderLine className="lp-decor--front" from={[12, 100]} to={[188, 18]} reveal pulse />
    <GlassChip>{spec}</GlassChip>
  </div>
</section>
```

**Rotating badge over a poster** (hero `poster`, cta `stamp`, guarantee `seal`):
```tsx
<Badge uid={`${id}-badge`} text={[t("trust.cod"), t("trust.delivery")]} label="COD" spin reveal />
```

**Souk backdrop**: `<ZelligeLines uid={`${id}-z`} variant="rosette" />` (layer, radial fade, 6%) under an
`<ArchFrame uid={`${id}-arch`} kind="keyhole" keyline="offset" reveal>` photo.

**Emphasis underline**: position a `Swoosh` absolutely under the emphasized word (`width: 104%`,
`height: .42em`); it draws on with `reveal`.

## QA

Determinism: rendering the same tree twice yields identical markup, and different seeds yield
different compositions (checked for every component across five archetypes). Visual QA screenshots
of the full catalog (5 archetypes + Arabic RTL, light/soft/dark/color blocks, every divider) live in
`qa/illustrations/`.
