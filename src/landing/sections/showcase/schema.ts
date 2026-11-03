/**
 * Showcase data contract — shared by every variant. Field names are part of saved pages (and the
 * generator writes kicker / title / lead): extend, never rename.
 */
import { z } from "zod";
import { AssetRef } from "@/lib/page/schema";
import { IconField, opt } from "../benefits/kit";

/**
 * Ingredient drawing: a minimal Leaf line icon (botanical ingredients) or "icon" to use the custom
 * icon set (materials). "alternate" is the v1 name of the leafy sprig, kept for saved pages.
 */
export const ART = ["alternate", "sprig", "olive", "round", "fern", "lavender", "wild", "flower", "daisy", "leaf", "icon"] as const;
export type Art = (typeof ART)[number];

export const Point = z.object({
  label: z.string().min(1).max(40),
  text: opt(140),
  /** pin position on the product photo, % from the left / top */
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
});

export const Ingredient = z.object({
  name: z.string().min(1).max(40),
  origin: opt(40),
  /** "97 %", "Cœur", "2 500 mAh" — a percentage also draws a share bar */
  share: opt(16),
  text: opt(140),
  art: z.enum(ART).default("sprig"),
  icon: IconField.default("leaf"),
});

export const Spec = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(40),
});

export const schema = z.object({
  kicker: opt(60),
  title: z.string().min(1).max(140),
  lead: opt(280),
  image: AssetRef.optional(),
  points: z.array(Point).min(2).max(6),
  ingredients: z.array(Ingredient).min(2).max(6),
  caption: opt(60),
  height: opt(20),
  width: opt(20),
  specs: z.array(Spec).max(6).default([]),
  scaleNote: opt(90),
  cta: z.boolean().default(false),
  ctaLabel: opt(60),
  /** the defaults are typical figures for the category: on until the merchant has checked them */
  sample: z.boolean().default(false),
  /** figure (sheet S2): the label of its caption column ("FIG. 01"), a counted device; absent = no label */
  figure: z.string().max(20).optional(),
});

export type Data = z.infer<typeof schema>;
export type PointData = Data["points"][number];
export type IngredientData = Data["ingredients"][number];
