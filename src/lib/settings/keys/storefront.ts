/**
 * Store setting `storefront` (docs/STORE-SAAS.md §D.10; storefront.md STO-§10.1; level S, not secret; R2). S1
 * STOREFRONT owns this file in R2; the R2 contract step (C2-E, STO-§27.1 "the settings keys `storefront` and
 * `checkout.store` with their first schemas") wrote the first schema from STO-§10.1, and S1 refines its validation
 * without changing the shape. Writes need `storefront.write` (core §A.3.1), audit `store.storefront.settings_updated`,
 * and bump `catalog_version` (STO-R19). Registered with release R2 (`STORE_SETTING_RELEASE`): no R1 screen reads or
 * writes it, and the R1 store export leaves it out.
 */
import { z } from "zod";
import { Tracking } from "@/lib/page/schema";
import type { HERO_FAMILIES as HERO, PDP_FAMILIES as PDP } from "@/storefront/fold";
import { HOME_STORYLINES } from "@/storefront/home/grammar";
import { LinkRefSchema } from "@/storefront/schema";

/** STO-§9.5 / §12.8 families, repeated so the settings registry never loads the fold estimator (checked below) */
const HERO_FAMILIES = ["stage", "editorial-split", "poster-type", "bento-lead", "cinematic-bleed", "quiet-luxe", "catalogue-index", "specimen-sheet"] as const;
const PDP_FAMILIES = ["split", "stacked", "rail", "immersive", "specimen", "quiet"] as const;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** compile-time: the two lists stay the frozen lists of src/storefront/fold.ts */
export const FAMILIES_IN_SYNC: [Same<(typeof HERO_FAMILIES)[number], (typeof HERO)[number]>, Same<(typeof PDP_FAMILIES)[number], (typeof PDP)[number]>] = [true, true];

/** a menu entry id (the editor's short ids) */
const Id = z.string().regex(/^[A-Za-z0-9_-]{4,26}$/);

const MenuLeaf = z.object({ id: Id, label: z.string().min(1).max(30), link: LinkRefSchema });
/** ≤ 2 levels */
const MenuItem = MenuLeaf.extend({ children: z.array(MenuLeaf).max(8).default([]) });

const countLinks = (main: readonly { children: readonly unknown[] }[]): number => main.reduce((n, m) => n + 1 + m.children.length, 0);

export const StorefrontSettings = z.object({
  header: z
    .object({
      variant: z.enum(["bar", "centered", "drawer"]).default("bar"),
      sticky: z.enum(["compact", "always", "off"]).default("compact"),
      search: z.boolean().default(true),
      /** px on desktop; mobile = min(value, 32) */
      logoHeight: z.number().int().min(24).max(56).default(32),
    })
    .prefault({}),
  menus: z
    .object({
      /** ≤ 40 links in total */
      main: z
        .array(MenuItem)
        .max(8)
        .default([])
        .refine((m) => countLinks(m) <= 40, { error: "At most 40 links in the main menu." }),
      footer: z
        .array(z.object({ id: Id, title: z.string().min(1).max(30), links: z.array(MenuLeaf).max(8) }))
        .max(4)
        .default([]),
    })
    .prefault({}),
  announcement: z
    .object({
      enabled: z.boolean().default(false),
      /** rotate: 6 s, paused on hover / focus, static under reduced motion */
      variant: z.enum(["static", "rotate"]).default("static"),
      messages: z
        .array(
          z.object({
            text: z.string().min(1).max(90),
            link: LinkRefSchema.optional(),
            startsAt: z.iso.datetime({ offset: true }).optional(),
            endsAt: z.iso.datetime({ offset: true }).optional(),
          }),
        )
        .max(3)
        .default([]),
    })
    .prefault({}),
  footer: z
    .object({
      variant: z.enum(["columns", "compact", "statement"]).default("columns"),
      statement: z.string().max(160).optional(),
      /** the seller identity line (law 31-08): only facts that exist */
      identity: z.boolean().default(true),
    })
    .prefault({}),
  whatsapp: z.object({ float: z.enum(["bubble", "tab", "off"]).default("bubble"), prefill: z.string().max(120).optional() }).prefault({}),
  /** library ids or { none: true } (STO-D18) */
  pixels: Tracking.prefault({}),
  home: z
    .object({
      /** the slot list (STO-§11.1) */
      storyline: z.enum(HOME_STORYLINES).default("hero-product"),
      /** owner override of the G2 pool draw (STO-§9.5); unset = drawn from the Brand Genome */
      heroFamily: z.enum(HERO_FAMILIES).optional(),
    })
    .prefault({}),
  /** owner override of the PDP family (STO-§12.8); unset = drawn */
  pdpFamily: z.enum(PDP_FAMILIES).optional(),
  productCard: z.enum(["minimal", "framed", "overlay", "editorial"]).default("minimal"),
  imageRatio: z.enum(["4:5", "1:1", "3:4"]).default("4:5"),
  /** Arabic-Indic digits on ar pages only when "arabic" */
  digits: z.enum(["latin", "arabic"]).default("latin"),
  /** default of StockConfig.showLow for new products */
  showLowStock: z.boolean().default(false),
});
export type StorefrontSettings = z.output<typeof StorefrontSettings>;
