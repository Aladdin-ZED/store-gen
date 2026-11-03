import { z } from "zod";
import { AssetRef } from "@/lib/page/schema";
import { ICON_NAMES, type IconName } from "../../primitives";

const IconId = z.enum(ICON_NAMES as [IconName, ...IconName[]]);

/** A short product fact shown around the product: glass callout, cover line, spec label, bullet. */
export const HeroNote = z.object({
  title: z.string().min(1).max(40),
  detail: z.string().max(60).default(""),
});

export const HeroTrust = z.object({
  icon: IconId.default("check"),
  text: z.string().min(1).max(60),
});

export const HeroSchema = z.object({
  /** small line above the headline — defaults to the product name */
  kicker: z.string().max(90).default(""),
  /** h1 — supports *emphasis* and **strong** */
  title: z.string().max(140).default(""),
  subtitle: z.string().max(260).default(""),
  /** giant display word (stage, poster) */
  bigWord: z.string().max(16).default(""),
  /** editorial masthead line, e.g. "Édition 01 · Soin" */
  issue: z.string().max(60).default(""),
  ctaLabel: z.string().max(48).default(""),
  ctaPrice: z.boolean().default(false),
  showRating: z.boolean().default(true),
  /** "×2 −10% · ×3 −20%" pack teaser, computed from the real bundles */
  showTeaser: z.boolean().default(true),
  /** compact pack chips (split) */
  showBundles: z.boolean().default(true),
  /** product facts: glass callouts (stage, spec), cover lines (editorial), chips (collage), bullets (split) */
  notes: z.array(HeroNote).max(4).default([]),
  trust: z.array(HeroTrust).max(4).default([]),
  /** main visual override (default: product cutout, else first product photo) */
  image: AssetRef.optional(),
  /** extra photos for the collage and the split gallery (default: product photos) */
  images: z.array(AssetRef).max(4).default([]),
  /*
   * Section kit fields (P6 DESIGN, design.md DES-§4.5.4, sheets H1-H4 of DES-§5.13). Every one is optional with no
   * default (DES-§4.5.1 rule): a saved document validates and checksums byte-identically, and an absent field draws
   * the sheet's default.
   */
  /** stage, poster: the giant product word behind the product; off unless true (DS56, ≤ 15 % of a niche's pages) */
  ghost: z.boolean().optional(),
  /** stage: product notes laid over the photo as callouts, 0-2; absent = 0 (S13: ≤ 2 chips on ≤ 1 photo) */
  chips: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  /** stage: the product's stage preset (DES-§4.11.1); absent = the archetype's set */
  stagePreset: z.enum(["glow", "contact", "plinth"]).optional(),
  /** editorial: unnumbered cover lines under the buy box, 2 or 3; absent = up to 3 */
  coverLines: z.union([z.literal(2), z.literal(3)]).optional(),
  /** poster: the price cluster as a tag on the print ("static", the default) or a band over the action */
  priceBlock: z.enum(["static", "band"]).optional(),
  /*
   * Section kit II (sheets H5-H10): the new families' options, optional without a default like the fields above.
   */
  /** split: text : media columns from 64rem (5:7, 4:8, 1:1; absent = today's split); quiet: the photo's aspect (4:5, 1:1) */
  ratio: z.enum(["5:7", "4:8", "1:1", "4:5"]).optional(),
  /** split: the media column's logical side from 64rem (absent = start, today's) */
  mediaSide: z.enum(["start", "end"]).optional(),
  /** cinema: the commerce band under the photo (default) or beside it from 64rem */
  band: z.enum(["below", "beside"]).optional(),
  /** cinema: the one line allowed over the photo, never in the phone's first screen */
  caption: z.string().max(60).optional(),
  /** quiet: the photo inset in a hairline frame (default) or running edge to edge on phones */
  frame: z.enum(["framed", "bleed"]).optional(),
  /** index: how many of the product notes are listed as numbered fact rows (3-5; absent = every filled note) */
  facts: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
  /** index: row numbers as "1" (plain, default) or "01" (padded, a counted device) */
  numbering: z.enum(["plain", "padded"]).optional(),
  /** contact: the sheet's photos, 3-4 distinct (absent = the main image, the extra photos, then the product's) */
  photos: z.array(AssetRef).max(4).optional(),
  /** contact: the title cell, logical (tl = inline-start top); absent = tr */
  titleCell: z.enum(["tl", "tr", "bl", "br"]).optional(),
  /** statement: the title as one big word over a subline, or two short contrasting lines */
  structure: z.enum(["word-subline", "contrast-pair"]).optional(),
  /** statement: the product as a small framed thumbnail (default) or a small cut-out on a plinth (needs a cut-out) */
  thumb: z.enum(["small-framed", "cutout"]).optional(),
});

export type HeroData = z.infer<typeof HeroSchema>;
export type HeroNoteData = z.infer<typeof HeroNote>;
