/**
 * Stats model — schema, types and the pure number helpers shared by the three compositions.
 * Numbers are merchant proof: the schema carries a `sample` flag that defaults mark as true.
 */
import { z } from "zod";
import { clamp, round } from "@/landing/primitives";
import { AssetRef, type SectionBg } from "@/lib/page/schema";
import type { RenderContext } from "../../types";
import { opt } from "../benefits/kit";

export const Stat = z.object({
  value: z.number().min(0).max(1_000_000_000),
  /** before the number: "+", "×", "~" */
  prefix: opt(4),
  /** after the number: "%", " h", "/5", "+" */
  suffix: opt(10),
  label: z.string().min(1).max(90),
  /** the whole a ring or meter measures against (100 for %, 5 for a rating, 24 for hours) */
  of: z.number().min(0).max(1_000_000_000).nullish(),
});

export const schema = z.object({
  kicker: opt(60),
  title: z.string().min(1).max(140),
  lead: opt(280),
  items: z.array(Stat).min(2).max(4),
  /** footnote: where the numbers come from */
  source: opt(160),
  /** example numbers — the admin asks for real ones before publishing */
  sample: z.boolean().default(false),
  /** product visual in the lead panel (big-numbers) and inside the rings; default = product cutout / photo */
  image: AssetRef.optional(),
  showImage: z.boolean().default(true),
  cta: z.boolean().default(false),
  ctaLabel: opt(60),
});

export type Data = z.infer<typeof schema>;
export type StatItem = Data["items"][number];

export interface ViewProps {
  ctx: RenderContext;
  data: Data;
  id: string;
  bg: SectionBg;
  titleId: string;
}

/** Fraction digits carried by the value itself (4.7 → 1), at most two. */
export function decimalsOf(v: number): number {
  const s = String(v);
  const dot = s.indexOf(".");
  return dot === -1 || s.includes("e") ? 0 : Math.min(2, s.length - dot - 1);
}

/** The figure as plain text ("+12 400", "94%") — for the decorative ticker band. */
export function figureText(ctx: RenderContext, it: StatItem): string {
  return `${it.prefix}${ctx.num(round(it.value, decimalsOf(it.value)))}${it.suffix}`;
}

/**
 * Visual width of a figure in "digit units": digits count fully, affixes (set smaller) about half.
 * Drives the fluid font-size that lets the largest figure fill its column without overflowing.
 */
export function figureLength(ctx: RenderContext, it: StatItem): number {
  const num = ctx.num(round(it.value, decimalsOf(it.value))).length;
  const affix = (it.prefix + it.suffix).trim().length;
  return round(Math.max(1, num + affix * 0.55), 2);
}

/** Share of the whole: value / of, or value / 100 for percentages; null = nothing to measure. */
export function fractionOf(it: StatItem): number | null {
  const whole = it.of || (it.suffix.trim() === "%" ? 100 : 0);
  if (!whole) return null;
  return clamp(it.value / whole, 0, 1);
}

/**
 * The far end of a meter's scale: the whole, with the figure's unit ("24 h", "100%"). A ratio
 * suffix ("/5") already names the whole, so a rating's scale simply ends on "5".
 */
export function scaleEnd(ctx: RenderContext, it: StatItem): string {
  const whole = it.of || 100;
  const unit = it.suffix.trim().startsWith("/") ? "" : it.suffix;
  return `${ctx.num(round(whole, decimalsOf(whole)))}${unit}`;
}

/**
 * The figures a page may show (design.md DES-§5.13 S7, DS42; honesty D2): the merchant's own. While `sample` is on the
 * items are library examples (the editor shows them as placeholders), so only a figure that is the product's real
 * rating stays; a stats section with fewer than two merchant figures renders nothing (and ships no stylesheet).
 */
export function merchantFigures(ctx: RenderContext, data: Data): StatItem[] {
  if (!data.sample) return data.items;
  const r = ctx.product.rating;
  return r ? data.items.filter((it) => it.value === r.value && it.suffix.trim() === "/5") : [];
}

/** The product visual: the section's own image, else the product cutout, else its first photo. */
export function statsVisual(ctx: RenderContext, data: Data) {
  if (!data.showImage) return null;
  return ctx.asset(data.image) ?? ctx.asset(ctx.product.cutout) ?? ctx.asset(ctx.product.images[0]);
}
