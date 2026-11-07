/**
 * Logo parameters (design.md DES-§13.12, DES-§13.16; isomorphic, pure). Track S2 BRAND & LOGO owns this file in R2 (the
 * HarfBuzz engine, moves, SVG serialiser, candidates and exports build on it). The contract step (C2-C) froze the
 * schemas other tracks validate against before S2 merges:
 *   - `LogoParams` / `LogoSystem` (stored in `store_themes.logo`) exactly as DES-§13.12; `FontId` = the theme font
 *     manifest's ids (`KnownFontId`); `SymbolParams` is `null` in R2 (the symbol grammar is R3, D4);
 *   - `LogoConceptParams` + `LOGO_VOCAB`: S7 AI DATA's `logo.system` task returns parameters ONLY (never SVG, never path
 *     data), validated by this zod; its prompt renders the vocabulary from `LOGO_VOCAB` at module load;
 *   - `defaultLogoParams`: the library rung S7 uses with Cloud AI off.
 * The parameters fully determine the output: the same params and engine version give byte-identical SVG.
 * `defaultLogoParams` is a stub until S2 merges (throws `NotBuiltYet("S2", "defaultLogoParams")`). No R1 path uses this
 * file (the R1 favicon / monogram files in src/lib/logo/ are untouched).
 */
import { z } from "zod";
import { notBuiltYet } from "@/lib/contracts/not-built";
import { Hex } from "@/lib/page/schema";
import { FONT_IDS } from "@/lib/theme/fonts.generated";
import type { BrandGenome } from "@/lib/design/brand";

export const FontId = z.enum(FONT_IDS);
/** R3 (D4, symbol-led marks): no symbol parameters exist in R2. */
export const SymbolParams = z.null();

export const LOGO_MOVE_KINDS = ["tittle", "weight", "baseline", "counter", "ligature", "stem-cut", "terminal"] as const;
export const LOGO_MARK_KINDS = ["monogram", "initial-ar", "glyph", "symbol"] as const;
export const LOGO_CONSTRUCTIONS = ["single", "shared-stem", "stacked", "interlock"] as const;
export const LOGO_ENCLOSURES = ["none", "circle", "rounded", "arch", "squircle"] as const;
export const LOGO_LOCKUPS = ["horizontal", "stacked", "wordmark", "mark", "bilingual-stacked", "bilingual-side"] as const;

/** The closed logo vocabulary (no badge, seal or hand-drawn move exists in it; owner rule 2). */
export const LOGO_VOCAB = {
  moves: LOGO_MOVE_KINDS,
  marks: LOGO_MARK_KINDS,
  constructions: LOGO_CONSTRUCTIONS,
  enclosures: LOGO_ENCLOSURES,
  lockups: LOGO_LOCKUPS,
} as const;

const index = z.number().int().min(0);

export const LogoParams = z.object({
  v: z.literal(1),
  seed: z.number().int().min(0),
  names: z.object({ latin: z.string().max(32).nullable(), arabic: z.string().max(32).nullable(), order: z.enum(["ar-first", "latin-first"]) }),
  tagline: z.object({ text: z.string().max(32), script: z.enum(["latin", "arabic"]) }).nullable(),
  font: z.object({ latin: FontId.nullable(), arabic: FontId.nullable(), weight: z.number().int().min(100).max(900), weightAr: z.number().int().min(100).max(900) }),
  /** optical tracking steps (± 0.01 em each, Latin) */
  spacing: z.number().int().min(-2).max(2),
  move: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("tittle"), index, shape: z.enum(["circle", "diamond", "arch"]), size: z.number().min(0.9).max(1.15) }),
    z.object({ kind: z.literal("weight"), index, delta: z.number().int().min(-200).max(200) }),
    /** index -1 = the whole word */
    z.object({ kind: z.literal("baseline"), index: z.number().int().min(-1), shift: z.number().min(-0.04).max(0.04) }),
    z.object({ kind: z.literal("counter"), index, contour: z.number().int().min(0) }),
    z.object({ kind: z.literal("ligature"), index }),
    z.object({ kind: z.literal("stem-cut"), index, angle: z.union([z.literal(0), z.literal(30)]), width: z.number().min(0.04).max(0.07) }),
    z.object({ kind: z.literal("terminal"), index, angle: z.number().min(0).max(45) }),
  ]),
  mark: z.object({
    kind: z.enum(LOGO_MARK_KINDS),
    letters: z.string().max(2).nullable(),
    construction: z.enum(LOGO_CONSTRUCTIONS).nullable(),
    enclosure: z.enum(LOGO_ENCLOSURES),
    symbol: SymbolParams.nullable(),
  }),
  lockup: z.object({ kind: z.enum(LOGO_LOCKUPS), ratioAr: z.number().min(1.0).max(1.3) }),
  colors: z.object({ ink: Hex, accent: Hex, ground: Hex, groundDark: Hex }),
});
export type LogoParams = z.infer<typeof LogoParams>;

/** The stored exports (DES-§13.14 rows stored as assets, `asset_refs.owner_kind = 'store_theme'`). */
export const LOGO_EXPORT_NAMES = ["primary-png", "favicon", "apple-touch", "icon-192", "icon-512", "avatar", "og"] as const;
export type LogoExportName = (typeof LOGO_EXPORT_NAMES)[number];

export interface LogoSystem {
  params: LogoParams;
  /** asset ids */
  exports: Partial<Record<LogoExportName, string>>;
  renderedAt: string;
  engineV: number;
}

/** DES-§13.16: one LLM concept = a subset of `LogoParams` plus a short guarded rationale. Parameters only. */
export const LogoConceptParams = z.object({
  font: z.object({ latin: FontId.nullable(), arabic: FontId.nullable() }),
  move: z.enum(LOGO_MOVE_KINDS),
  mark: z.enum(LOGO_MARK_KINDS),
  enclosure: z.enum(LOGO_ENCLOSURES),
  lockup: z.enum(LOGO_LOCKUPS),
  rationale: z.string().max(140),
});
export type LogoConceptParams = z.infer<typeof LogoConceptParams>;

/** The library rung: deterministic parameters for the store names and brand (no model call). S2 (stub: NotBuiltYet). */
export function defaultLogoParams(input: { names: LogoParams["names"]; brand: BrandGenome | null; seed: number }): LogoParams {
  void input;
  return notBuiltYet("S2", "defaultLogoParams");
}
