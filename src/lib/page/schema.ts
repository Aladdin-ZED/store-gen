/**
 * PageDoc — the single source of truth for a landing page.
 * Admin edits it, the generator produces it, the renderer turns it into HTML,
 * the exporter zips that HTML. Every field is validated before render/publish.
 *
 * Version 2 (docs/OFFERS.md): a page sells ITEMS (`items`, 1–8; items[0] is the lead item, the
 * upgraded v1 product is the item "main"), OFFERS are lines of items (`offers.bundles`, key kept),
 * option groups are choice / matrix / field groups. `PageDoc` upgrades every v1 document and repairs
 * what existing data can break (src/lib/page/upgrade.ts) before validating, so every read
 * (`PageDoc.safeParse`, `validateDoc`) of a draft, a published version or an export accepts v1 JSON.
 * Writes are always v2; version rows keep their v1 JSON forever.
 *
 * Shared, framework-free (safe in browser, server and web workers).
 */
import { z } from "zod";
import { PIXEL_ID_RE, PIXEL_LIMIT, type PixelPlatform } from "../pixels/ids";
import { cellKey } from "./options";
import { upgradeDoc } from "./upgrade";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const HEX = /^#[0-9a-fA-F]{6}$/;
export const Hex = z.string().regex(HEX, "Expected #rrggbb");

export const LOCALES = ["ar", "fr", "en", "es", "de", "it", "nl", "pt"] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;
export const RTL_LOCALES: readonly Locale[] = ["ar"];
export const dirOf = (l: Locale): "rtl" | "ltr" => (RTL_LOCALES.includes(l) ? "rtl" : "ltr");

export const MARKETS = ["MA", "FR", "BE", "ES", "DE", "IT", "NL", "PT", "INTL"] as const;
export const Market = z.enum(MARKETS);
export type Market = z.infer<typeof Market>;

/** Short id of sections, offers, lines, groups and options (url-safe, 2–40 chars). */
export const ID_RE = /^[a-zA-Z0-9_-]{2,40}$/;
export const Id = z.string().regex(ID_RE);

/** Item ids: short, lowercase, no "." or ":" (separators in keys). The upgraded v1 product is "main". */
export const ITEM_ID_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
export const ItemId = z.string().regex(ITEM_ID_RE);
export const MAIN_ITEM_ID = "main";

/** True when an amount has at most 2 decimals (integer cents). */
export const isWholeCents = (m: number) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6;

/** An amount in the page currency: ≥ 0, ≤ 10 000 000, at most 2 decimals (pricing works in integer cents). */
export const Money = z.number().nonnegative().max(10_000_000).refine(isWholeCents, { error: "2 decimals max" });

/** Price difference of an option, a combination or a field: 0–100 000 (never negative: discounts belong to offers). */
export const Delta = Money.max(100_000);

/** Inline text: plain text with a tiny safe markup: *emphasis* and **strong**. Never HTML. */
export const InlineText = z.string().max(400);
/** Block text: InlineText rules + line breaks + "- " bullet lines. Never HTML. */
export const BlockText = z.string().max(4000);

/** Crop of a photo, 0..1 of its width / height (an item cut out of a group photo). CSS only. */
export const CropBox = z
  .object({
    x: z.number().min(0).max(0.95),
    y: z.number().min(0).max(0.95),
    w: z.number().min(0.05).max(1),
    h: z.number().min(0.05).max(1),
  })
  .refine((b) => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, { error: "The crop leaves the photo." });
export type CropBox = z.infer<typeof CropBox>;

/** Reference to an uploaded asset (image/video). Resolved to URLs by RenderContext.asset(). */
export const AssetRef = z.object({
  id: z.string().regex(/^[a-f0-9]{16,64}$/),
  alt: z.string().max(200).default(""),
  /** focal point for object-position, 0..1 */
  fx: z.number().min(0).max(1).optional(),
  fy: z.number().min(0).max(1).optional(),
  /** crop of the photo (an item cut out of a group photo); rendered with CSS only */
  box: CropBox.optional(),
});
export type AssetRef = z.infer<typeof AssetRef>;

/* ------------------------------------------------------------------ */
/* Product (the story of the page)                                     */
/* ------------------------------------------------------------------ */

export const PRODUCT_CATEGORIES = [
  "beauty",
  "skincare",
  "haircare",
  "fragrance",
  "jewelry",
  "watches",
  "fashion",
  "bags",
  "health",
  "supplements",
  "fitness",
  "sport",
  "kitchen",
  "home",
  "cleaning",
  "decor",
  "kids",
  "toys",
  "pets",
  "tech",
  "gadgets",
  "car",
  "tools",
  "grooming",
  "organic-food",
  "traditional",
  "garden",
  "other",
] as const;
export const ProductCategory = z.enum(PRODUCT_CATEGORIES);
export type ProductCategory = z.infer<typeof ProductCategory>;

/* ------------------------------------------------------------------ */
/* Option groups (§D)                                                  */
/* ------------------------------------------------------------------ */

/** Warehouse code (Latin): Sheets, CSV and order.php print it instead of the label ("NR" for "نوار"). */
export const WAREHOUSE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,19}$/;

export const Choice = z.object({
  id: Id,
  label: z.string().min(1).max(40),
  swatch: Hex.optional(),
  image: AssetRef.optional(),
  soldOut: z.boolean().default(false),
  /** warehouse code (Latin): Sheets, CSV and order.php print it instead of the label */
  code: z.string().regex(WAREHOUSE_CODE_RE).optional(),
  /** surcharge per unit when chosen ("XL +20"). Never negative: discounts belong to offers. */
  delta: Delta.optional(),
});
export type Choice = z.infer<typeof Choice>;

const GroupBase = {
  id: Id,
  name: z.string().min(1).max(40), // "Couleur", "Taille", "اللون"
  /** true: one value per unit of this item · false: one value shared by every unit of this item in the order */
  perUnit: z.boolean().default(true),
};

export const CHOICE_KINDS = ["swatch", "text", "image"] as const;
export type ChoiceKind = (typeof CHOICE_KINDS)[number];

export const ChoiceGroup = z.object({
  ...GroupBase,
  kind: z.enum(CHOICE_KINDS),
  options: z.array(Choice).min(1).max(40),
  /** "select": a native dropdown (long lists, e.g. 30 shoe sizes); "auto": dots / tiles / chips by kind */
  display: z.enum(["auto", "select"]).default("auto"),
});
export type ChoiceGroup = z.infer<typeof ChoiceGroup>;

export const MatrixDim = z.object({
  id: Id,
  name: z.string().min(1).max(40),
  kind: z.enum(CHOICE_KINDS).default("text"),
  /** value.soldOut = every combination with it is out */
  values: z.array(Choice).min(1).max(24),
});
export type MatrixDim = z.infer<typeof MatrixDim>;

export const CELL_STATES = ["in", "out", "none"] as const;
export type CellState = (typeof CELL_STATES)[number];

export const MatrixCell = z.object({
  /** the combination(s) this exception applies to; a dim missing from v is a wildcard (1..dims.length entries) */
  v: z.record(Id, Id),
  /** out = épuisé · none = not made (never shown as épuisé) */
  state: z.enum(CELL_STATES).default("in"),
  image: AssetRef.optional(),
  /** replaces Σ value deltas */
  delta: Delta.optional(),
  /** replaces item.sku */
  sku: z.string().max(60).optional(),
});
export type MatrixCell = z.infer<typeof MatrixCell>;

export const MATRIX_MAX_COMBINATIONS = 240;

export const MatrixGroup = z.object({
  ...GroupBase,
  kind: z.literal("matrix"),
  dims: z.array(MatrixDim).min(2).max(3),
  /** only exceptions; every other combination exists, in stock */
  cells: z.array(MatrixCell).max(240).default([]),
  /** "combined": one picker of the valid combinations ("Noir · M"); "linked": one selector per dim; "auto": combined when ≤ 8 valid */
  display: z.enum(["auto", "linked", "combined"]).default("auto"),
});
export type MatrixGroup = z.infer<typeof MatrixGroup>;

export const FIELD_CHARSETS = ["any", "letters", "latin", "digits"] as const;
export type FieldCharset = (typeof FIELD_CHARSETS)[number];

export const FieldGroup = z.object({
  ...GroupBase,
  kind: z.literal("field"),
  input: z.enum(["text", "number"]).default("text"),
  required: z.boolean().default(true),
  /** code points */
  maxLength: z.number().int().min(1).max(60).default(24),
  min: z.number().int().min(0).max(1_000_000).optional(),
  max: z.number().int().min(0).max(1_000_000).optional(),
  charset: z.enum(FIELD_CHARSETS).default("any"),
  placeholder: z.string().max(40).optional(),
  help: z.string().max(90).optional(),
  /** only when required = false ("gravure +30") */
  delta: Delta.optional(),
});
export type FieldGroup = z.infer<typeof FieldGroup>;

export const OptionGroup = z.discriminatedUnion("kind", [ChoiceGroup, MatrixGroup, FieldGroup]);
export type OptionGroup = z.infer<typeof OptionGroup>;

export const isChoiceGroup = (g: { kind: string }): g is ChoiceGroup => g.kind === "swatch" || g.kind === "text" || g.kind === "image";
export const isMatrixGroup = (g: { kind: string }): g is MatrixGroup => g.kind === "matrix";
export const isFieldGroup = (g: { kind: string }): g is FieldGroup => g.kind === "field";

/** v1 name of a choice option. @deprecated one release: use Choice. */
export const VariantOption = Choice;
export type VariantOption = Choice;
/**
 * v1 option group (product.variants): a choice group whose kind defaults to "text".
 * @deprecated one release: use ChoiceGroup (items[].groups).
 */
export const VariantGroup = z.preprocess(
  (g) => (g && typeof g === "object" && !Array.isArray(g) && (g as { kind?: unknown }).kind === undefined ? { ...g, kind: "text" } : g),
  ChoiceGroup,
);
export type VariantGroup = ChoiceGroup;

/* ------------------------------------------------------------------ */
/* Product & items                                                     */
/* ------------------------------------------------------------------ */

const Rating = z.object({ value: z.number().min(1).max(5), count: z.number().int().min(1).max(1_000_000) });

/** The page's story: name, words, photos, rating. Prices and options live on the items (§B). */
export const Product = z.object({
  name: z.string().min(1).max(120),
  tagline: InlineText.optional(),
  description: BlockText.optional(),
  category: ProductCategory.default("other"),
  images: z.array(AssetRef).max(30).default([]),
  /** transparent background cutout of the product (hero stage) */
  cutout: AssetRef.optional(),
  /** real aggregated rating — never invent */
  rating: Rating.optional(),
});
export type Product = z.infer<typeof Product>;

/**
 * The v1 product (story + price, compare-at, SKU and options): what the generate wizard still sends.
 * @deprecated one release: the wizard sends items (Phase 1, GN).
 */
export const LegacyProduct = Product.extend({
  price: Money,
  compareAt: Money.optional(),
  sku: z.string().max(60).optional(),
  variants: z.array(VariantGroup).max(4).default([]),
});
export type LegacyProduct = z.infer<typeof LegacyProduct>;

export const Item = z.object({
  id: ItemId,
  /** shown on cards, unit heads, summaries. Required (non-empty) when the page has 2+ items; on a single-item page "" = product name */
  name: z.string().max(120).default(""),
  /** Sheets / WhatsApp / receipts name; default = name */
  short: z.string().max(40).optional(),
  /** the item's photos: own photos, crops of a group photo (box), and the uncropped group photos it appears in */
  images: z.array(AssetRef).max(8).default([]),
  cutout: AssetRef.optional(),
  sku: z.string().max(60).optional(),
  /** reference unit price: one unit bought alone. Base of the automatic reference and of savings. */
  price: Money,
  /** genuine previous unit price, struck where a single unit price is shown */
  compareAt: Money.optional(),
  groups: z.array(OptionGroup).max(4).default([]),
  /** whole item unavailable: choice lines skip it, offers with a fixed line on it are unavailable */
  soldOut: z.boolean().default(false),
});
export type Item = z.infer<typeof Item>;

/* ------------------------------------------------------------------ */
/* Offers (§C)                                                         */
/* ------------------------------------------------------------------ */

/** A choice group id, or "<matrixGroupId>.<dimId>". */
export const RULE_KEY_RE = /^[A-Za-z0-9_-]{2,40}(\.[A-Za-z0-9_-]{2,40})?$/;
export const RuleKey = z.string().regex(RULE_KEY_RE);

export const LineRule = z.union([
  /** fixed: static chip, filled by the server */
  z.object({ lock: Id }).strict(),
  /** subset; preset ∈ allow = initial value */
  z.object({ allow: z.array(Id).min(1).max(40), preset: Id.optional() }).strict(),
  /** initial value only */
  z.object({ preset: Id }).strict(),
]);
export type LineRule = z.infer<typeof LineRule>;

export const FixedPick = z.object({ item: ItemId }).strict();
export const ChoicePick = z
  .object({
    /** the customer chooses, per unit */
    choice: z.array(ItemId).min(2).max(8),
    /** "2 différents au choix" */
    distinct: z.boolean().default(false),
    /** "difference": pricier items cost their difference (§C.3) */
    surcharge: z.enum(["none", "difference"]).default("none"),
  })
  .strict();
export type FixedPick = z.infer<typeof FixedPick>;
export type ChoicePick = z.infer<typeof ChoicePick>;

export const OfferLine = z.object({
  /** "l1", stable for memory keys */
  id: Id,
  qty: z.number().int().min(1).max(20),
  pick: z.union([FixedPick, ChoicePick]),
  /** a catalog item given for free (BOGO, "+ a free mini"); never carries surcharges */
  free: z.boolean().default(false),
  /** unit head override ("Votre 2e parfum", "Votre cadeau") */
  label: z.string().max(40).optional(),
  /** fixed-item lines only: lock / restrict / preset the item's options on this line; ≤ 3 keys */
  rules: z.record(RuleKey, LineRule).optional(),
});
export type OfferLine = z.infer<typeof OfferLine>;

export const isFixedPick = (p: OfferLine["pick"]): p is FixedPick => "item" in p;
export const isChoicePick = (p: OfferLine["pick"]): p is ChoicePick => "choice" in p;

export const VISUAL_ARRANGES = ["auto", "row", "overlap", "grid"] as const;
export const OfferVisual = z.discriminatedUnion("mode", [
  /** composed from the lines' item photos (§E.6) */
  z.object({ mode: z.literal("auto") }),
  z.object({
    mode: z.literal("custom"),
    /** the owner's photos: a group shot, group shot + 3rd item… */
    images: z.array(AssetRef).min(1).max(4),
    arrange: z.enum(VISUAL_ARRANGES).default("auto"),
  }),
]);
export type OfferVisual = z.infer<typeof OfferVisual>;

export const BADGES = ["none", "popular", "best", "custom"] as const;

export const Offer = z.object({
  id: Id,
  /** segment / tab label (pills, teasers): ≤ 14; default automatic (§C.4) */
  short: z.string().max(14).optional(),
  lines: z.array(OfferLine).min(1).max(6),
  /** else an automatic name (§C.4) */
  title: z.string().max(60).optional(),
  subtitle: z.string().max(90).optional(),
  /** card bullets (stack, visual, pills panel) */
  perks: z.array(z.string().min(1).max(40)).max(3).default(() => []),
  /** total price of the offer's units (before surcharges, bump, extras and delivery) */
  price: Money,
  /** genuine reference total; absent = automatic reference (§C.3); never invented */
  compareAt: Money.optional(),
  badge: z.enum(BADGES).default("none"),
  badgeText: z.string().max(28).optional(),
  /** no delivery fee for this offer (real; only meaningful when shippingFee > 0) */
  freeShipping: z.boolean().default(false),
  /** non-catalog gift (text + optional photo): card, summary, AND the order (§G.3) */
  gift: z.object({ label: z.string().min(1).max(60), image: AssetRef.optional() }).optional(),
  visual: OfferVisual.default(() => ({ mode: "auto" as const })),
  preselected: z.boolean().default(false),
  soldOut: z.boolean().default(false),
});
export type Offer = z.infer<typeof Offer>;
/** @deprecated one release: an offer (`offers.bundles` keeps its v1 key). */
export const Bundle = Offer;
/** @deprecated one release: use Offer. */
export type Bundle = Offer;

/* ------------------------------------------------------------------ */
/* Offer layouts (§E.1)                                                */
/* ------------------------------------------------------------------ */

/** UI "Offer layout" (= v1 BUNDLE_CARD_STYLES). */
export const OFFER_PICKERS = ["stack", "tiers", "ticket", "pills", "visual"] as const;
export type OfferPicker = (typeof OFFER_PICKERS)[number];
/** @deprecated one release: use OFFER_PICKERS. */
export const BUNDLE_CARD_STYLES = OFFER_PICKERS;
/** UI "Personalization layout" */
export const OFFER_FILLS = ["auto", "inline", "rows", "steps", "box"] as const;
export type OfferFill = (typeof OFFER_FILLS)[number];
/** UI "Selected style" */
export const OFFER_SELECTIONS = ["soft", "solid", "outline"] as const;
export type OfferSelection = (typeof OFFER_SELECTIONS)[number];
export const OFFER_MEDIA = ["auto", "none", "thumb", "large"] as const;
export type OfferMedia = (typeof OFFER_MEDIA)[number];
export const OFFER_DENSITIES = ["comfortable", "compact"] as const;
export type OfferDensity = (typeof OFFER_DENSITIES)[number];

export const OfferDisplay = z.object({
  picker: z.enum(OFFER_PICKERS).default("stack"),
  fill: z.enum(OFFER_FILLS).default("auto"),
  selection: z.enum(OFFER_SELECTIONS).default("soft"),
  media: z.enum(OFFER_MEDIA).default("auto"),
  density: z.enum(OFFER_DENSITIES).default("comfortable"),
});
export type OfferDisplay = z.infer<typeof OfferDisplay>;
export const DEFAULT_OFFER_DISPLAY: OfferDisplay = { picker: "stack", fill: "auto", selection: "soft", media: "auto", density: "comfortable" };

/** Which offers an extra applies to: every offer, or these offer ids. */
const Scope = z.union([z.literal("all"), z.array(Id).min(1).max(8)]).default("all");
export const ExtraGroup = z.discriminatedUnion("kind", [ChoiceGroup.extend({ scope: Scope }), FieldGroup.extend({ scope: Scope })]);
export type ExtraGroup = z.infer<typeof ExtraGroup>;

export const OrderBump = z.object({
  enabled: z.boolean().default(false),
  title: z.string().max(80),
  description: z.string().max(160).optional(),
  price: Money,
  image: AssetRef.optional(),
  /** the bump is a catalog item (qty 1): title/image default from it, its options are collected, SKU/contents include it */
  item: ItemId.optional(),
  /** shown only with these offers (absent = all) */
  offers: z.array(Id).min(1).max(8).optional(),
});
export type OrderBump = z.infer<typeof OrderBump>;

export const Upsell = z.object({
  enabled: z.boolean().default(false),
  title: z.string().max(80),
  description: z.string().max(240).optional(),
  price: Money,
  compareAt: Money.optional(),
  image: AssetRef.optional(),
  /** offer window on thank-you page, minutes */
  windowMinutes: z.number().int().min(1).max(120).default(10),
  /** the upsell is a catalog item ("options à confirmer" in the order text) */
  item: ItemId.optional(),
});
export type Upsell = z.infer<typeof Upsell>;

export const Offers = z.object({
  /** the page's offers (key kept from v1, D3) */
  bundles: z.array(Offer).min(1).max(8),
  /** §E (replaces v1 cardStyle) */
  display: OfferDisplay.default(() => ({ ...DEFAULT_OFFER_DISPLAY })),
  /** order-level choices (gift wrap, card message), once per order; perUnit ignored */
  extras: z.array(ExtraGroup).max(4).default(() => []),
  showPerUnit: z.boolean().default(true),
  showSavings: z.enum(["amount", "percent", "both", "none"]).default("both"),
  /** delivery fee added to every order whose offer is not free-delivery (0 = free) */
  shippingFee: Money.default(0),
  orderBump: OrderBump.optional(),
  upsell: Upsell.optional(),
  urgency: z
    .object({
      /** ISO datetime set by admin. Countdown hides itself after it passes. Never auto-resets. */
      countdownEnd: z.string().datetime({ offset: true }).optional(),
      /** real stock number typed by admin */
      stockLeft: z.number().int().min(0).max(100_000).optional(),
    })
    .default(() => ({})),
});
export type Offers = z.infer<typeof Offers>;

/* ------------------------------------------------------------------ */
/* Order form                                                          */
/* ------------------------------------------------------------------ */

export const FormConfig = z.object({
  city: z.enum(["select", "text", "hidden"]).default("select"),
  address: z.enum(["required", "optional", "hidden"]).default("required"),
  note: z.enum(["optional", "hidden"]).default("hidden"),
  email: z.enum(["required", "optional", "hidden"]).default("hidden"),
  /** ISO 3166 alpha-2 used for phone validation + city list */
  phoneCountry: z.string().regex(/^[A-Z]{2}$/).default("MA"),
  title: InlineText.optional(),
  submitLabel: z.string().max(60).optional(),
  /** small reassurance line under the submit button */
  reassurance: z.string().max(140).optional(),
  whatsapp: z
    .object({ enabled: z.boolean().default(false), number: z.string().regex(/^\+?[0-9]{8,15}$/) })
    .optional(),
});
export type FormConfig = z.infer<typeof FormConfig>;

/* ------------------------------------------------------------------ */
/* Theme spec (source of truth; tokens are derived by the engine)      */
/* ------------------------------------------------------------------ */

export const ARCHETYPES = [
  "maison",
  "apothecary",
  "souk",
  "playground",
  "kinetic",
  "circuit",
  "hearth",
  "bloom",
  "field",
  "editorial",
  "garage",
] as const;
export const Archetype = z.enum(ARCHETYPES);
export type Archetype = z.infer<typeof Archetype>;

export const HARMONIES = [
  "mono-luxe",
  "clay-sage",
  "earth-triad",
  "pop-complement",
  "contrast-neon",
  "cool-precise",
  "warm-butter",
  "blush-berry",
  "ink-accent",
] as const;
export const Harmony = z.enum(HARMONIES);

/** Modern section transitions only (DESIGN.md §4.6) — no torn/zigzag/scallop/stitch/tape edges. */
export const DIVIDERS = ["none", "curve", "diagonal", "steps", "arch", "wave", "fade"] as const;
export const Divider = z.enum(DIVIDERS);
export type Divider = z.infer<typeof Divider>;

/** Font ids are keys of the font manifest (src/lib/theme/fonts.ts). */
export const FontId = z.string().regex(/^[a-z0-9-]{2,48}$/);

/*
 * Design genome vocabulary carried by `ThemeSpec.look` (docs/saas/spec/design.md DES-§4.1, DES-§4.5.1; CCR
 * DES-R1). Part of the doc contract, so the design modules import these from here.
 */
export const GRAMMARS = ["editorial-column", "poster", "gallery-led", "stage", "specimen", "catalogue", "split-tension", "cinematic", "quiet-luxe"] as const;
export const COLOR_STRATEGIES = ["ink+one", "duotone", "color-field", "tonal", "dark-luxe", "high-key", "mono+signal"] as const;
export const TREATMENTS = ["cutout-stage", "framed-stage", "full-bleed-crop", "framed", "tight-detail", "tonal-duotone", "grid-contact"] as const;
export const LADDERS = ["crisp", "soft", "round", "mixed"] as const;
export const DEPTHS = ["flat", "hairline", "tonal", "ambient", "directional"] as const;
export const MASKS = ["arch", "circle", "pill", "rounded", "rect", "cut", "blob"] as const;
export const EASE_FAMILIES = ["expo", "quint", "quart", "critical", "soft-spring", "mask"] as const; // soft-spring: playground only (DS28)
export const REVEALS = ["fade-rise", "blur-in", "mask-wipe", "scale-in", "line-draw"] as const;
export type Grammar = (typeof GRAMMARS)[number];
export type ColorStrategy = (typeof COLOR_STRATEGIES)[number];
export type Treatment = (typeof TREATMENTS)[number];
export type Ladder = (typeof LADDERS)[number];
export type Depth = (typeof DEPTHS)[number];
export type Mask = (typeof MASKS)[number];
export type EaseFamily = (typeof EASE_FAMILIES)[number];
export type Reveal = (typeof REVEALS)[number];

/**
 * The compiled design genome of a page (DES-§4.5.1). Optional in ThemeSpec with no .default(): documents
 * without it validate and checksum exactly as before (DS2), and an absent look renders today's output.
 */
export const ThemeLook = z
  .object({
    v: z.literal(1),
    g: z.enum(GRAMMARS),
    grid: z.object({
      c: z.union([z.literal(4), z.literal(8), z.literal(12)]),
      s: z.enum(["1:1", "5:7", "4:8", "3:9", "golden"]),
      m: z.enum(["narrow", "wide", "offset"]),
      w: z.number().int().min(1080).max(1440),
      u: z.union([z.literal(4), z.literal(8)]),
    }),
    type: z.object({
      rm: z.number().min(1.125).max(1.25),
      rd: z.number().min(1.2).max(1.5),
      dmax: z.number().int().min(48).max(160),
      w: z.number().int().min(100).max(900),
      wAr: z.number().int().min(100).max(900),
      tk: z.number().min(0).max(0.03),
      dc: z.enum(["none", "uppercase"]),
      lb: z.enum(["mono", "smallcaps", "plain"]),
      nu: z.enum(["lining", "oldstyle"]),
    }),
    cs: z.enum(COLOR_STRATEGIES),
    area: z.number().min(0.03).max(0.35),
    hc: z.boolean(),
    ladder: z.enum(LADDERS),
    corner: z.enum(["circle", "squircle"]),
    hair: z.object({ w: z.union([z.literal(0), z.literal(1), z.literal(1.5)]), s: z.number().min(0.08).max(0.3) }),
    depth: z.enum(DEPTHS),
    glass: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    mask: z.enum(MASKS),
    img: z.enum(TREATMENTS),
    dens: z.enum(["airy", "balanced", "dense"]),
    space: z.number().min(0.75).max(1.6),
    align: z.enum(["start", "mixed", "center-statement"]),
    mo: z.object({
      f: z.enum(EASE_FAMILIES),
      d: z.number().int().min(180).max(900),
      r: z.array(z.enum(REVEALS)).min(1).max(2),
      st: z.number().int().min(30).max(80),
      sc: z.boolean(),
      scope: z.enum(["heads", "hero", "none"]), // reveal scope (G35, R5); heads = hero + section heads only
    }),
    kit: z.object({
      gl: z.enum(["dot", "spark", "diamond", "none"]),
      nb: z.enum(["none", "plain", "padded"]),
      cap: z.enum(["mono", "smallcaps", "italic-serif", "plain"]),
    }),
    em: z.enum(["none", "swoosh", "highlight", "color", "italic"]), // "none" (G26): no emphasised word in the hero title
    btn: z.enum(["solid", "pill", "soft", "outline", "underline", "glow"]),
    gid: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(), // design_genomes id (learning join, ai.md AI-§G.4)
    locks: z.array(z.enum(["G1", "G2", "G4", "G9", "G18", "G23", "G28"])).max(7).optional(), // "Lock for this page" (DES-§15.4); absent = none
  })
  .strict();
export type ThemeLook = z.infer<typeof ThemeLook>;

export const ThemeSpec = z.object({
  archetype: Archetype,
  /** deterministic seed for every procedural choice (illustrations, rotations, blobs) */
  seed: z.number().int().min(0).max(2_147_483_647),
  palette: z.object({
    accent: Hex,
    pop: Hex,
    /** hue (0-360) used to tint neutrals; defaults to accent hue */
    neutralHue: z.number().min(0).max(360).optional(),
    /** overall page lightness mood */
    base: z.enum(["light", "tinted", "dark"]).default("light"),
    harmony: Harmony,
  }),
  fonts: z.object({
    display: FontId,
    body: FontId,
    accent: FontId.optional(),
    /** used when page locale is Arabic */
    displayAr: FontId,
    bodyAr: FontId,
  }),
  radius: z.enum(["archetype", "none", "subtle", "soft", "round"]).default("archetype"),
  shadow: z.enum(["archetype", "none", "soft", "deep", "glow"]).default("archetype"),
  /** only an ultra-subtle film grain is allowed (modern direction) */
  texture: z.enum(["archetype", "none", "grain"]).default("archetype"),
  /** "panels": sections float as large rounded panels inset from the viewport; "flush": edge-to-edge */
  surfaces: z.enum(["archetype", "flush", "panels"]).default("archetype"),
  motion: z.enum(["calm", "lively", "off"]).default("lively"),
  dividers: z.array(Divider).max(4).default([]), // empty → archetype family
  /** 0..2 multiplier on decorative illustration density */
  ornament: z.number().min(0).max(2).default(1),
  /** the compiled design genome (DES-R1); optional with no default, so a doc without it is unchanged */
  look: ThemeLook.optional(),
});
export type ThemeSpec = z.infer<typeof ThemeSpec>;

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export const SECTION_BGS = ["base", "soft", "surface", "accent", "dark", "pop"] as const;
export const SectionBg = z.enum(SECTION_BGS);
export type SectionBg = z.infer<typeof SectionBg>;

export const SectionInstance = z.object({
  id: Id,
  type: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,40}$/),
  variant: z.string().regex(/^[a-z0-9-]{1,40}$/),
  bg: SectionBg.default("base"),
  /** divider drawn ABOVE this section; "auto" lets the engine decide */
  divider: z.union([Divider, z.literal("auto")]).default("auto"),
  spacing: z.enum(["tight", "normal", "airy"]).default("normal"),
  hidden: z.boolean().default(false),
  /** section data — validated against the section definition's schema */
  data: z.record(z.string(), z.unknown()).default({}),
});
export type SectionInstance = z.infer<typeof SectionInstance>;

/* ------------------------------------------------------------------ */
/* Tracking / SEO / thank-you                                          */
/* ------------------------------------------------------------------ */

/**
 * The ad pixel ids of one platform: 1…PIXEL_LIMIT ids, deduplicated. A single id string — how pages
 * and the store setting stored it before multi-pixel support — reads as [id]; an empty list is
 * "not set" (undefined), so `!!tracking.metaPixelId` keeps meaning "this platform is on".
 */
const pixelIds = (platform: PixelPlatform) => {
  const id = z.string().regex(PIXEL_ID_RE[platform]);
  return z
    .union([id.transform((s) => [s]), z.array(id).max(PIXEL_LIMIT[platform])])
    .transform((ids) => (ids.length ? [...new Set(ids)] : undefined))
    .optional();
};

/** Ad pixels of a page (and of the store "pixels" setting): see src/lib/pixels. */
export const Tracking = z.object({
  metaPixelId: pixelIds("meta"),
  tiktokPixelId: pixelIds("tiktok"),
  snapPixelId: pixelIds("snap"),
  ga4Id: pixelIds("ga4"),
  /** "No pixel on this page" (organic / test). Repair drops it when any id is set. */
  none: z.literal(true).optional(),
  /** "Pixels copied from {page}" until the owner keeps or edits them */
  copiedFrom: z.string().max(120).optional(),
});
export type Tracking = z.infer<typeof Tracking>;

export const Seo = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(170).optional(),
  ogImage: AssetRef.optional(),
  noindex: z.boolean().default(false),
});

export const ThankYou = z.object({
  title: InlineText.optional(),
  message: BlockText.optional(),
  /** show delivery timeline steps */
  showTimeline: z.boolean().default(true),
});

/* ------------------------------------------------------------------ */
/* Limits and refinements (§B.1, §C.1, §D.1, §J.1)                     */
/* ------------------------------------------------------------------ */

export const LIMITS = {
  items: 8,
  itemPhotos: 8,
  groupsPerItem: 4,
  fieldsPerItem: 2,
  matrixPerItem: 1,
  choiceOptions: 40,
  matrixValues: 24,
  matrixCombinations: MATRIX_MAX_COMBINATIONS,
  matrixCells: 240,
  /** Σ choice options + matrix dim values on a page */
  pageOptions: 200,
  /** Σ matrix cells on a page */
  pageCells: 300,
  /** option / value / cell photos on a page (publish cap `page_too_large`, checklist error) */
  pagePhotos: 48,
  offers: 8,
  linesPerOffer: 6,
  unitsPerOffer: 20,
  rulesPerLine: 3,
  extras: 4,
  perks: 3,
  customVisualPhotos: 4,
} as const;

type Ctx = z.RefinementCtx;
const issue = (c: Ctx, path: (string | number)[], message: string) => c.addIssue({ code: "custom", message, path });

/** Choice options + matrix values (with their photos) of one group list. */
function countOptions(groups: readonly OptionGroup[]): { options: number; cells: number; photos: number } {
  let options = 0;
  let cells = 0;
  let photos = 0;
  for (const g of groups) {
    if (isChoiceGroup(g)) {
      options += g.options.length;
      photos += g.options.filter((o) => o.image).length;
    } else if (isMatrixGroup(g)) {
      for (const d of g.dims) {
        options += d.values.length;
        photos += d.values.filter((o) => o.image).length;
      }
      cells += g.cells.length;
      photos += g.cells.filter((x) => x.image).length;
    }
  }
  return { options, cells, photos };
}

/** Option / value / cell photos of a page (each becomes a <picture> template): §F.9 page cap. */
export function optionPhotoCount(doc: { items: readonly Item[]; offers: { extras: readonly ExtraGroup[] } }): number {
  let n = 0;
  for (const it of doc.items) n += countOptions(it.groups).photos;
  for (const x of doc.offers.extras) if (isChoiceGroup(x)) n += x.options.filter((o) => o.image).length;
  return n;
}

function uniqueIds(c: Ctx, ids: readonly string[], path: (string | number)[], what: string): void {
  const seen = new Set<string>();
  ids.forEach((id, i) => {
    if (seen.has(id)) issue(c, [...path, i, "id"], `Duplicate ${what} id "${id}".`);
    seen.add(id);
  });
}

function groupIssues(c: Ctx, g: OptionGroup | ExtraGroup, path: (string | number)[]): void {
  if (isChoiceGroup(g)) {
    uniqueIds(c, g.options.map((o) => o.id), [...path, "options"], "option");
    return;
  }
  if (isFieldGroup(g)) {
    if (g.required && g.delta !== undefined && g.delta > 0) issue(c, [...path, "delta"], "A required field can't add a price; include it in the offer price or make it optional.");
    if (g.min !== undefined && g.max !== undefined && g.min > g.max) issue(c, [...path, "max"], "The maximum is below the minimum.");
    return;
  }
  // matrix
  uniqueIds(c, g.dims.map((d) => d.id), [...path, "dims"], "dimension");
  g.dims.forEach((d, i) => uniqueIds(c, d.values.map((v) => v.id), [...path, "dims", i, "values"], "value"));
  const combos = g.dims.reduce((n, d) => n * d.values.length, 1);
  if (combos > MATRIX_MAX_COMBINATIONS) issue(c, [...path, "dims"], `${combos} combinations: at most ${MATRIX_MAX_COMBINATIONS}.`);
  const dims = new Map(g.dims.map((d) => [d.id, new Set(d.values.map((v) => v.id))]));
  const keys = new Set<string>();
  g.cells.forEach((cell, i) => {
    const entries = Object.entries(cell.v);
    if (entries.length < 1 || entries.length > g.dims.length) issue(c, [...path, "cells", i, "v"], "A combination names 1 value per dimension at most.");
    for (const [dim, value] of entries) {
      const values = dims.get(dim);
      if (!values) issue(c, [...path, "cells", i, "v", dim], `Unknown dimension "${dim}".`);
      else if (!values.has(value)) issue(c, [...path, "cells", i, "v", dim], `Unknown value "${value}".`);
    }
    const key = cellKey(cell.v);
    if (keys.has(key)) issue(c, [...path, "cells", i, "v"], `Combination "${key}" is listed twice.`);
    keys.add(key);
  });
}

/** Hard rules for v2-only constructs; everything v1 data can break is repaired by upgradeDoc (§I.1). */
function docIssues(d: z.output<typeof PageDocBase>, c: Ctx): void {
  const items = d.items;
  const byId = new Map<string, Item>();
  items.forEach((it, i) => {
    if (byId.has(it.id)) issue(c, ["items", i, "id"], `Duplicate item id "${it.id}".`);
    byId.set(it.id, it);
    if (items.length > 1 && !it.name.trim()) issue(c, ["items", i, "name"], "Name every product when the page sells more than one.");
    uniqueIds(c, it.groups.map((g) => g.id), ["items", i, "groups"], "group");
    if (it.groups.filter(isFieldGroup).length > LIMITS.fieldsPerItem) issue(c, ["items", i, "groups"], `At most ${LIMITS.fieldsPerItem} custom fields per product.`);
    if (it.groups.filter(isMatrixGroup).length > LIMITS.matrixPerItem) issue(c, ["items", i, "groups"], "At most one combined option per product.");
    it.groups.forEach((g, gi) => groupIssues(c, g, ["items", i, "groups", gi]));
  });

  // page caps (photos are a publish cap: page_too_large)
  let options = 0;
  let cells = 0;
  for (const it of items) {
    const n = countOptions(it.groups);
    options += n.options;
    cells += n.cells;
  }
  for (const x of d.offers.extras) if (isChoiceGroup(x)) options += x.options.length;
  if (options > LIMITS.pageOptions) issue(c, ["items"], `${options} options on the page: at most ${LIMITS.pageOptions}.`);
  if (cells > LIMITS.pageCells) issue(c, ["items"], `${cells} combination exceptions on the page: at most ${LIMITS.pageCells}.`);

  const offers = d.offers.bundles;
  const offerIds = new Set(offers.map((o) => o.id));
  uniqueIds(c, offers.map((o) => o.id), ["offers", "bundles"], "offer");
  if (offers.filter((o) => o.preselected).length > 1) issue(c, ["offers", "bundles"], "Only one offer can be selected first.");
  offers.forEach((o, oi) => {
    const at = ["offers", "bundles", oi];
    uniqueIds(c, o.lines.map((l) => l.id), [...at, "lines"], "line");
    const units = o.lines.reduce((n, l) => n + l.qty, 0);
    if (units > LIMITS.unitsPerOffer) issue(c, [...at, "lines"], `${units} pieces: an offer holds at most ${LIMITS.unitsPerOffer}.`);
    if (!o.lines.some((l) => !l.free)) issue(c, [...at, "lines"], "An offer needs at least one paid line.");
    o.lines.forEach((l, li) => {
      const lat = [...at, "lines", li];
      if (isFixedPick(l.pick)) {
        const item = byId.get(l.pick.item);
        if (!item) issue(c, [...lat, "pick", "item"], `Unknown product "${l.pick.item}".`);
        if (l.rules && item) ruleIssues(c, item, l.rules, [...lat, "rules"]);
      } else {
        const choice = l.pick.choice;
        if (new Set(choice).size !== choice.length) issue(c, [...lat, "pick", "choice"], "A product is listed twice in the choice.");
        for (const id of choice) if (!byId.has(id)) issue(c, [...lat, "pick", "choice"], `Unknown product "${id}".`);
        if (l.pick.distinct && l.qty > choice.length) issue(c, [...lat, "qty"], "More different pieces than products to choose from.");
        if (l.rules && Object.keys(l.rules).length) issue(c, [...lat, "rules"], "Option rules apply to fixed products only.");
      }
    });
  });

  const bump = d.offers.orderBump;
  if (bump?.item && !byId.has(bump.item)) issue(c, ["offers", "orderBump", "item"], `Unknown product "${bump.item}".`);
  for (const id of bump?.offers ?? []) if (!offerIds.has(id)) issue(c, ["offers", "orderBump", "offers"], `Unknown offer "${id}".`);
  const upsell = d.offers.upsell;
  if (upsell?.item && !byId.has(upsell.item)) issue(c, ["offers", "upsell", "item"], `Unknown product "${upsell.item}".`);
  uniqueIds(c, d.offers.extras.map((x) => x.id), ["offers", "extras"], "extra");
  d.offers.extras.forEach((x, xi) => {
    groupIssues(c, x, ["offers", "extras", xi]);
    if (x.scope !== "all") for (const id of x.scope) if (!offerIds.has(id)) issue(c, ["offers", "extras", xi, "scope"], `Unknown offer "${id}".`);
  });
}

function ruleIssues(c: Ctx, item: Item, rules: Record<string, LineRule>, path: (string | number)[]): void {
  const keys = Object.keys(rules);
  if (keys.length > LIMITS.rulesPerLine) issue(c, path, `At most ${LIMITS.rulesPerLine} option rules per line.`);
  for (const key of keys) {
    const rule = rules[key]!;
    const [gid, dimId] = key.split(".");
    const g = item.groups.find((x) => x.id === gid);
    let values: Choice[] | null = null;
    if (g && isChoiceGroup(g) && dimId === undefined) values = g.perUnit ? g.options : null;
    else if (g && isMatrixGroup(g) && dimId !== undefined) values = g.perUnit ? (g.dims.find((dd) => dd.id === dimId)?.values ?? null) : null;
    if (!values) {
      issue(c, [...path, key], g && !g.perUnit ? "Rules can't target an option shared by every piece." : `"${key}" is not an option of this product.`);
      continue;
    }
    const ids = new Set(values.map((v) => v.id));
    const named = "lock" in rule ? [rule.lock] : [...("allow" in rule ? rule.allow : []), ...(rule.preset ? [rule.preset] : [])];
    for (const id of named) if (!ids.has(id)) issue(c, [...path, key], `Unknown option "${id}".`);
    if ("allow" in rule && rule.preset && !rule.allow.includes(rule.preset)) issue(c, [...path, key, "preset"], "The preset must be one of the allowed options.");
  }
}

/* ------------------------------------------------------------------ */
/* PageDoc                                                             */
/* ------------------------------------------------------------------ */

const PageDocBase = z.object({
  v: z.literal(2),
  locale: Locale,
  market: Market,
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** the story (name, words, photos, rating) */
  product: Product,
  /** what the page sells (items[0] = lead item) */
  items: z.array(Item).min(1).max(LIMITS.items),
  offers: Offers,
  form: FormConfig,
  theme: ThemeSpec,
  sections: z.array(SectionInstance).max(60),
  seo: Seo.default(() => ({ noindex: false })),
  tracking: Tracking.default(() => ({})),
  thankYou: ThankYou.default(() => ({ showTimeline: true })),
});

/** The v2 document (no upgrade): what writes produce. */
export const PageDocObject = PageDocBase.superRefine(docIssues);

/** Every read: v1 → v2 upgrade + deterministic repairs (src/lib/page/upgrade.ts), then PageDocObject. */
export const PageDoc = z.preprocess(upgradeDoc, PageDocObject);
export type PageDoc = z.infer<typeof PageDocObject>;
export type PageDocInput = z.input<typeof PageDocObject>;
