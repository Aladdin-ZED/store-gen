/**
 * Marquee — a moving strip of short words (product sensations + the COD promises) between denser
 * sections. The moving tracks are decoration (aria-hidden, paused off-screen and on hover); a
 * visually hidden list carries the same words once for assistive tech.
 *
 *   tape    (id kept for saved pages) renders as the outline strip: whole items duplicated, no tape
 *             texture, no rotation (design.md DES-§5.13 S8, I7)
 *   outline → giant hairline-outlined words gliding slowly through a lens at the center: a light
 *             veil (calm pages), a frosted glass capsule or a solid ink capsule (bold pages) in
 *             which each word turns solid and product photos come to full color
 *   double  → a solid color band and an outlined echo row travelling in opposite directions; on
 *             energetic archetypes the band leans a few degrees across the section (calm pages:
 *             level, in a soft tone)
 *
 * Every row shears gently with page scroll where scroll-driven animations exist (progressive).
 */
import { Fragment, type ReactElement, type ReactNode } from "react";
import { z } from "zod";
import type { Archetype, SectionBg } from "@/lib/page/schema";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { cssVars, cx, MarqueeTrack, Picture, reveal, RichText, SectionShell } from "../../primitives";
import { defineSection, type FieldSpec, type RenderContext, type ResolvedAsset } from "../../types";
import { asPictureFrame, bestShot, STRIP_PILL } from "../cta/fit";
import { defaultWords } from "./copy";
import { withRevealScope } from "../reveal-scope";

const Word = z.object({
  /** may be empty while the merchant types — empty words are skipped */
  text: z.string().trim().max(40).default(""),
});

const Schema = z.object({
  items: z.array(Word).min(2).max(8),
  /** what sits between the words; auto = the variant's best (photos on `outline`, mark/photo in turn on warm strips) */
  separator: z.enum(["auto", "glyph", "product", "none"]).default("auto"),
  speed: z.enum(["auto", "slow", "normal", "fast"]).default("auto"),
  /** travel toward the reading end instead of the reading start */
  reverse: z.boolean().default(false),
  /** `double` only: lean the color band (auto = energetic archetypes lean, calm ones stay level) */
  tilt: z.enum(["auto", "level", "tilted"]).default("auto"),
});

type Data = z.infer<typeof Schema>;
type Speed = Exclude<Data["speed"], "auto">;
type Variant = "outline" | "double";

const fields: FieldSpec[] = [
  {
    kind: "list",
    path: "items",
    label: "Words",
    itemLabel: "Word",
    titlePath: "text",
    min: 2,
    max: 8,
    item: [
      {
        kind: "text",
        path: "text",
        label: "Text",
        max: 40,
        placeholder: "Paiement à la livraison",
        help: "1–3 words read best at this size. Mix what the product feels like with true promises (payment on delivery, delivery time). *Word* lights it up.",
      },
    ],
    newItem: () => ({ text: "" }),
  },
  {
    kind: "group",
    label: "Style",
    fields: [
      {
        kind: "select",
        path: "separator",
        label: "Between the words",
        options: [
          { value: "auto", label: "Best for this layout" },
          { value: "glyph", label: "Page mark" },
          { value: "product", label: "Product photo" },
          { value: "none", label: "Space only" },
        ],
        help: "Product photo uses the cutout or the first product image in a small pill. Automatic: photos on Giant outline, marks and photos in turn on warm Bold strips, marks elsewhere.",
      },
      {
        kind: "select",
        path: "tilt",
        label: "Band angle (Double layout)",
        options: [
          { value: "auto", label: "Match the page style" },
          { value: "level", label: "Level" },
          { value: "tilted", label: "Leaning" },
        ],
      },
    ],
  },
  {
    kind: "group",
    label: "Motion",
    fields: [
      {
        kind: "select",
        path: "speed",
        label: "Speed",
        options: [
          { value: "auto", label: "Match the page style" },
          { value: "slow", label: "Calm" },
          { value: "normal", label: "Normal" },
          { value: "fast", label: "Lively" },
        ],
        help: "The strip pauses while hovered and off-screen, and stands still for visitors who reduce motion.",
      },
      { kind: "toggle", path: "reverse", label: "Scroll the other way" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

interface WordItem {
  /** index in data.items (edit paths) */
  i: number;
  text: string;
}

const wordsOf = (data: Data): WordItem[] =>
  data.items.flatMap((w, i) => (w.text.trim() ? [{ i, text: w.text.trim() }] : []));

/** Archetypes with a quicker natural pace (sport, workshop, toys). */
const BRISK: ReadonlySet<Archetype> = new Set(["kinetic", "garage", "playground"]);

function speedOf(ctx: RenderContext, data: Data, v: Variant): Speed {
  if (data.speed !== "auto") return data.speed;
  // giant words travel far per item: the outline strip always glides
  return v !== "outline" && BRISK.has(ctx.archetype) ? "normal" : "slow";
}

/**
 * Separator mark per archetype — small, crisp CSS shapes drawn in the section accent (no ornament
 * glyphs): a hairline rule for quiet luxury, a solid arch for modern Moroccan, a glossy bead for
 * beauty, a leaning bar for sport, a precise plus for tech…
 */
type Mark = "rule" | "ring" | "arch" | "pill" | "slash" | "dash" | "plus" | "dot" | "bead" | "leaf" | "square" | "hex";

const MARK: Readonly<Record<Archetype, Mark>> = {
  maison: "rule",
  apothecary: "ring",
  souk: "arch",
  playground: "pill",
  kinetic: "slash",
  circuit: "plus",
  hearth: "dot",
  bloom: "bead",
  field: "leaf",
  editorial: "square",
  garage: "hex",
};

/**
 * Archetypes whose `outline` lens is a solid ink capsule knocking the words out in the section color.
 * Calm pages get a light veil (a hairline capsule, the words simply turn solid); the rest the
 * theme's frosted glass (AA over any backdrop).
 */
const INVERT_LENS: ReadonlySet<Archetype> = new Set(["kinetic", "garage", "playground", "editorial"]);

/**
 * Cutout first (it sits cleanly in any frame), then the product photo that frames best in the small
 * pill: a person as a whole-faced bust, a product whole (never a face sliced by the pill's edge).
 */
const productThumb = (ctx: RenderContext): ResolvedAsset | null => {
  const cut = ctx.asset(ctx.product.cutout);
  return cut?.alpha ? cut : (bestShot(ctx, () => STRIP_PILL) ?? cut);
};

/** Light or dark family of a color block on this page (neutral blocks are dark on dark-mood pages). */
function family(ctx: RenderContext, bg: SectionBg): string {
  if (bg === "accent" || bg === "pop") return bg;
  return bg === "dark" || ctx.doc.theme.palette.base === "dark" ? "dark" : "light";
}

/** A calm page (quiet product, luxury): soft blocks, level bands, the light lens. */
const isCalm = (ctx: RenderContext): boolean => ctx.motion === "calm";

/**
 * Color block for the `double` band: the first preference that does not melt into the section. Calm
 * pages reach for the soft pop tone before the dark block (a near-black band on a blush page is loud).
 */
function bandBg(ctx: RenderContext, bg: SectionBg): SectionBg {
  const own = family(ctx, bg);
  const order = isCalm(ctx) ? (["accent", "pop", "dark"] as const) : (["accent", "dark", "pop"] as const);
  return order.find((b) => family(ctx, b) !== own) ?? "pop";
}

/** Lean of the `double` band in degrees (0 = level), within the archetype's modern tilt range. */
function tiltOf(ctx: RenderContext, data: Data): number {
  const max = Math.abs(ARCHETYPE_DEFS[ctx.archetype].tilt[1]);
  if (data.tilt === "level" || (data.tilt === "auto" && (max === 0 || isCalm(ctx)))) return 0;
  return Math.min(2.5, Math.max(1.5, max));
}

/** Material of the `outline` lens: a light veil on calm pages (whatever the archetype), an ink capsule on bold ones, else glass. */
function lensOf(ctx: RenderContext): "ink" | "veil" | "glass" {
  if (isCalm(ctx)) return "veil";
  return INVERT_LENS.has(ctx.archetype) ? "ink" : "glass";
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** What sits between the words: one mark, the product photo, both in turn, or space only. */
type SepMode = "mark" | "photo" | "mixed" | "none";

function sepMode(ctx: RenderContext, data: Data, v: Variant, photo: ResolvedAsset | null): SepMode {
  if (data.separator === "none") return "none";
  if (data.separator === "glyph" || !photo) return "mark";
  if (data.separator === "product" || v === "outline") return "photo";
  return "mark";
}

interface Parts {
  ctx: RenderContext;
  data: Data;
  words: WordItem[];
  speed: Speed;
  sep: SepMode;
  photo: ResolvedAsset | null;
}

function MarkShape({ ctx }: { ctx: RenderContext }): ReactElement {
  const mark = MARK[ctx.archetype];
  // between Arabic words a leaning bar reads as the digit ١: sport pages get a speed dash there
  return <span className="lp-marquee__mark" data-mark={mark === "slash" && ctx.locale === "ar" ? "dash" : mark} />;
}

/** Product photo in a pill (a cutout stands free with its own shadow). Decorative: the strip is aria-hidden. */
function Photo({ asset }: { asset: ResolvedAsset }): ReactElement {
  return (
    <span className={cx("lp-marquee__thumb", asset.alpha && "lp-marquee__thumb--cut")}>
      <Picture
        asset={asset}
        alt=""
        fit={asset.alpha ? "contain" : "cover"}
        sizes="(min-width: 64rem) 12rem, 6rem"
        frame={asset.alpha ? undefined : asPictureFrame(STRIP_PILL)}
      />
    </span>
  );
}

/** Track items: the words — with their separator built in when marks and photos take turns. */
function items(p: Parts, list: WordItem[]): ReactNode[] {
  return list.map((w, k) => {
    const word = (
      <RichText key={w.i} ctx={p.ctx} as="span" className="lp-marquee__word" text={w.text} decorate={false} editPath={`items.${w.i}.text`} />
    );
    if (p.sep !== "mixed" || !p.photo) return word;
    return (
      <Fragment key={w.i}>
        {word}
        <span className="lp-marquee__sep">{k % 2 ? <Photo asset={p.photo} /> : <MarkShape ctx={p.ctx} />}</span>
      </Fragment>
    );
  });
}

/** The separator MarqueeTrack repeats after every item (none when the items carry their own). */
function trackSeparator(p: Parts): ReactNode | false {
  if (p.sep === "none" || p.sep === "mixed") return false;
  return p.sep === "photo" && p.photo ? <Photo asset={p.photo} /> : <MarkShape ctx={p.ctx} />;
}

/**
 * A full-bleed track inside a scroll-shear wrapper. The shear pushes the same way the words travel
 * (a reversed track shears the other way), so scrolling reads as a burst of speed.
 */
function Track({ p, list, reverse, minItems }: { p: Parts; list: WordItem[]; reverse: boolean; minItems: number }): ReactElement {
  return (
    <div className="lp-marquee__drift" style={reverse ? cssVars({ "--mq-way": -1 }) : undefined}>
      <MarqueeTrack
        ctx={p.ctx}
        items={items(p, list)}
        speed={p.speed}
        reverse={reverse}
        separator={trackSeparator(p)}
        minItems={minItems}
      />
    </div>
  );
}

/** Depth-of-field ends: words soften into a progressive blur as they enter and leave (wide screens). */
function Edges(): ReactElement {
  return (
    <>
      <span className="lp-marquee__edge lp-marquee__edge--l" />
      <span className="lp-marquee__edge lp-marquee__edge--r" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

/**
 * Two identical tracks stacked: outlined words below, filled words above, the filled layer clipped
 * to the lens capsule at the center. Same items, same speed, same pause triggers (the section root
 * is itself a `.lp-marquee`, so hover pauses both) — the layers never drift apart.
 */
function Outline({ p }: { p: Parts }): ReactElement {
  return (
    <div className="lp-marquee__spot" data-lens={lensOf(p.ctx)}>
      <div className="lp-marquee__line" {...reveal("fade")}>
        <Track p={p} list={p.words} reverse={p.data.reverse} minItems={6} />
      </div>
      <div className="lp-marquee__focus" {...reveal("scale-in", 160)}>
        <span className="lp-marquee__glass" />
        <div className="lp-marquee__lens">
          <Track p={p} list={p.words} reverse={p.data.reverse} minItems={6} />
        </div>
      </div>
      <Edges />
    </div>
  );
}

function Double({ p, bg }: { p: Parts; bg: SectionBg }): ReactElement {
  const tilt = tiltOf(p.ctx, p.data);
  // the echo starts half a loop later, so the same word never stacks over itself
  const half = Math.ceil(p.words.length / 2);
  const echo = [...p.words.slice(half), ...p.words.slice(0, half)];
  return (
    <div className={cx("lp-marquee__pair", tilt && "lp-marquee__pair--tilt")} style={tilt ? cssVars({ "--mq-tilt": `${-tilt}deg` }) : undefined}>
      <div className="lp-marquee__row lp-marquee__row--band" data-bg={bandBg(p.ctx, bg)} {...reveal("wipe-side")}>
        <Track p={p} list={p.words} reverse={p.data.reverse} minItems={8} />
        <Edges />
      </div>
      <div className="lp-marquee__row lp-marquee__row--echo" {...reveal("wipe-side", 180)}>
        <Track p={p} list={echo} reverse={!p.data.reverse} minItems={8} />
        <Edges />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export default withRevealScope(defineSection({
  type: "marquee",
  label: "Marquee strip",
  labelFr: "Bande défilante",
  category: "proof",
  description: "A moving strip of short words between two sections: what the product feels like and the order promises.",
  variants: [
    {
      id: "tape",
      label: "Bold strip (shown as the outline strip)",
      description: "Kept for saved pages: it now shows as the giant outline strip, whole words only, without tape or rotation.",
      archetypes: ["souk", "playground", "kinetic", "hearth", "field", "garage"],
    },
    {
      id: "outline",
      label: "Giant outline",
      description: "Huge outlined words gliding slowly through a glass lens at the center, where each word turns solid.",
      archetypes: ["maison", "apothecary", "circuit", "editorial", "bloom", "kinetic"],
    },
    {
      id: "double",
      label: "Double",
      description: "A solid color band and an outlined echo row travelling in opposite directions; the band leans on lively pages.",
      archetypes: ["bloom", "souk", "playground", "hearth", "maison", "editorial"],
    },
  ],
  schema: Schema,
  defaults: ({ locale, product, offers, rng }): Data => ({
    items: defaultWords({ locale, product, offers, rng }).map((text) => ({ text })),
    separator: "auto",
    speed: "auto",
    reverse: false,
    tilt: "auto",
  }),
  fields,
  render: ({ id, variant, bg, data, ctx }) => {
    const list = wordsOf(data);
    if (!list.length) return null;
    // the bold strip (tape) is redrawn as the outline strip (S8, owner rule 2); an unknown id takes it too
    const v: Variant = variant === "double" ? "double" : "outline";
    const photo = productThumb(ctx);
    const p: Parts = { ctx, data, words: list, speed: speedOf(ctx, data, v), sep: sepMode(ctx, data, v, photo), photo };
    return (
      <SectionShell id={id} ctx={ctx} type="marquee" variant={v} bg={bg} as="div">
        {/* the moving strip is decoration: the same words are read once from the list below */}
        <div className="lp-marquee__stage" aria-hidden="true">
          {v === "double" ? <Double p={p} bg={bg} /> : <Outline p={p} />}
        </div>
        <ul className="lp-visually-hidden" role="list">
          {list.map((w) => (
            <li key={w.i}>
              <RichText ctx={ctx} text={w.text} decorate={false} />
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  },
}));
