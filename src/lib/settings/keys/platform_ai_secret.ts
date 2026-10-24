/**
 * Platform setting `platform_ai_secret` (docs/STORE-SAAS.md §D.10, ai.md AI-§M.5; secret; owner: ai, P7): the provider
 * key, set only through `platformAction("ai.platform", …, { stepUp: true })`; the console shows "set / not set".
 * Env ANTHROPIC_API_KEY is the fallback while it is empty (AI R6).
 */
import { z } from "zod";
import { id26, isoDateTime } from "../fields";

export const PlatformAiSecret = z.object({
  apiKey: z
    .string()
    .regex(/^sk-ant-[A-Za-z0-9_-]{20,200}$/)
    .optional(),
  setAt: isoDateTime.optional(),
  setBy: id26.optional(),
});
export type PlatformAiSecret = z.output<typeof PlatformAiSecret>;
