/**
 * Store setting `brand` (docs/STORE-SAAS.md §D.10, design.md DES-§2.6; owner: design, P6): the R1 schema from R1.0
 * (DES-R16). Logo asset ids pass `assertOwned` and are synced to `asset_refs` (owner_kind 'brand') on every write;
 * colours passed the no-orange guard (`moves` is what it changed). The voice is not here: `brandView()` derives it
 * read-only from `store_ai.voice` (AI R24), the one source of truth.
 */
import { z } from "zod";
import { Hex } from "@/lib/page/schema";
import { assetId, isoDateTime } from "../fields";

export const ColorRole = z.enum(["accent", "pop", "neutral", "base"]);
export const ColorMove = z.object({ role: z.enum(["accent", "pop"]), from: Hex, to: Hex, at: isoDateTime });

export const BrandSetting = z.object({
  v: z.literal(1).default(1),
  logo: z
    .object({
      /** uploaded raster logo (R1) or the designer's PNG export (R2) */
      primary: assetId.nullable().default(null),
      /** square mark for favicon and avatar (optional upload) */
      mark: assetId.nullable().default(null),
      /** wordmark-only rendition (R2 designer export, R1 optional upload) */
      wordmark: assetId.nullable().default(null),
      /** light-on-dark version (optional) */
      inverse: assetId.nullable().default(null),
      source: z.enum(["upload", "designer"]).default("upload"),
    })
    .prefault({}),
  colors: z
    .object({
      accent: Hex.nullable().default(null),
      pop: Hex.nullable().default(null),
      neutralHue: z.number().min(0).max(360).nullable().default(null),
      base: z.enum(["light", "tinted", "dark"]).nullable().default(null),
      /** locked roles are never re-sampled by generation */
      locks: z.array(ColorRole).max(4).default([]),
      /** what the no-orange guard changed (the visible note, DS17) */
      moves: z.array(ColorMove).max(4).default([]),
      /** extractPalette() of the logo, already passed through nearestAllowed */
      fromLogo: z.array(Hex).max(6).default([]),
    })
    .prefault({}),
  fonts: z
    .object({
      /** a pairing id of the catalogue (DES-§10.3) */
      pairing: z.string().regex(/^[a-z0-9-]{2,40}$/).nullable().default(null),
      locked: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Brand gene locks, R1 subset; values validated against GENE_VOCAB by the save path (G28 / G31 are read from
   * store_ai.voice, G4 is `fonts.locked`, the page genes have page locks only). Rev 4: + G1 and G9.
   */
  genes: z.partialRecord(z.enum(["G1", "G9", "G12", "G17", "G23", "G26", "G27"]), z.string().max(48)).default({}),
  /** R2: the active store_themes.version */
  storeThemeVersion: z.number().int().positive().nullable().default(null),
});
export type BrandSetting = z.output<typeof BrandSetting>;
