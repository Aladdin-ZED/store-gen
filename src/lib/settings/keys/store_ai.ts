/**
 * Store setting `store_ai` (docs/STORE-SAAS.md §D.10, ai.md AI-§M.5; owner: ai, P7): the store's AI choices. The
 * device tier stays in the browser. Accepts the shape the R1.0 conversion writes from the legacy `ai` key,
 * `{ mode, localEnabled, tier, bgRemoval }` (§D.8 step 3): `tier` is read as `localTierCeiling` when that is unset.
 * `voice.darija` is the core table's `darijaRatio` (AI-§M.5), so the brand view and the prompts read one field.
 */
import { z } from "zod";

/** AI-§G.2: how the store sounds; G28 / G31 of the design genome read `register` / `darija` through brandView(). */
export const BrandVoice = z.object({
  warmCrisp: z.number().int().min(-2).max(2).default(0),
  playfulSerious: z.number().int().min(-2).max(2).default(0),
  formality: z.enum(["vous", "tu"]).default("vous"),
  darija: z.enum(["none", "cta", "light"]).default("cta"),
  ctaByLocale: z.partialRecord(z.enum(["ar", "fr", "en"]), z.string().trim().min(2).max(32)).default({}),
  wordsUse: z.array(z.string().trim().min(2).max(40)).max(12).default([]),
  wordsAvoid: z.array(z.string().trim().min(2).max(40)).max(24).default([]),
  /** design gene G28 */
  register: z.enum(["plain", "warm", "precise", "bold", "poetic-restrained"]).nullable().default(null),
});

const LocalTier = z.enum(["lite", "full"]);

export const StoreAi = z
  .object({
    mode: z.enum(["auto", "local", "server"]).default("auto"),
    /** the interactive Director pass; null = the platform default ("ask" until platform_ai.directorAutoDefault, then "auto") */
    director: z.enum(["auto", "ask", "off"]).nullable().default(null),
    /** blueprints, logo systems, deep critique (pattern B) */
    deepPass: z.boolean().default(true),
    /** legacy `ai.enabled` */
    localEnabled: z.boolean().default(true),
    localTierCeiling: LocalTier.optional(),
    /** legacy alias of localTierCeiling (the converted `ai.tier`), read only */
    tier: LocalTier.optional(),
    bgRemoval: z.boolean().default(true),
    learning: z.boolean().default(true),
    sharePatterns: z.boolean().default(false),
    contributeTraining: z.boolean().default(false),
    voice: BrandVoice.prefault({}),
  })
  .transform(({ tier, localTierCeiling, ...rest }) => ({ ...rest, localTierCeiling: localTierCeiling ?? tier ?? ("lite" as const) }));
export type StoreAiSetting = z.output<typeof StoreAi>;
