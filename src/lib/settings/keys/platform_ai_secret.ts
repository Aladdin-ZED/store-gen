/**
 * Platform setting `platform_ai_secret` (docs/STORE-SAAS.md §D.10, ai.md AI-§M.5; secret; owner: ai, P7): the provider
 * key, set only through `platformAction("ai.platform", …, { stepUp: true })`; the console shows "set / not set" and the
 * date. Env ANTHROPIC_API_KEY is the fallback while it is empty (AI R6). The whole value is sealed with envelope v2 and
 * `apiKey` is redacted wherever the registry redacts (the registry's `sensitive` list), unchanged here.
 */
import { z } from "zod";
import { id26, isoDateTime } from "../fields";

/** The shape of an Anthropic API key (AI-§M.5); the console form validates against it before the save. */
export const ANTHROPIC_KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;

export const PlatformAiSecret = z.object({
  apiKey: z.string().regex(ANTHROPIC_KEY_RE).optional(),
  setAt: isoDateTime.optional(),
  setBy: id26.optional(),
});
export type PlatformAiSecret = z.output<typeof PlatformAiSecret>;
