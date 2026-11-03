import "server-only";
/**
 * The provider key (P7 AI; ai.md AI-§B.1, AI R6; docs/STORE-SAAS.md §H.7, §D.10 `platform_ai_secret`): the sealed
 * `platform_ai_secret.apiKey` wins, else env `ANTHROPIC_API_KEY` (the fallback while the console has none).
 *
 *   - `keySource()`: "settings" | "env" | "none", the only thing the console, the policy and `aiHealth()` ever see;
 *   - `resolveKey()`: the key itself, for the one SDK client builder (step 7). Never logged, never returned to a route,
 *     never put in an audit `meta` or an error message; a read failure answers as "no key" (the policy then says
 *     `no_key`, never a stack with the envelope in it).
 */
import { getPlatformSetting } from "@/lib/settings";
import { ANTHROPIC_KEY_RE } from "@/lib/settings/keys/platform_ai_secret";

export type KeySource = "settings" | "env" | "none";

/** The env fallback, accepted only in the Anthropic key shape (a stray value never reaches the SDK). */
function envKey(): string | null {
  const v = process.env.ANTHROPIC_API_KEY?.trim();
  return v && ANTHROPIC_KEY_RE.test(v) ? v : null;
}

async function settingsKey(): Promise<string | null> {
  try {
    const secret = await getPlatformSetting("platform_ai_secret");
    return secret.apiKey && ANTHROPIC_KEY_RE.test(secret.apiKey) ? secret.apiKey : null;
  } catch {
    // an envelope that does not open (APP_SECRET rotated without a re-seal) is "no key from settings"; the message
    // could name the sealed purpose, so nothing of it is logged here
    return null;
  }
}

/** Where the key comes from; never the key. */
export async function keySource(): Promise<KeySource> {
  if (await settingsKey()) return "settings";
  return envKey() ? "env" : "none";
}

/** The key for the SDK client builder only (src/lib/ai/server/client.ts, step 7); null = no key. */
export async function resolveKey(): Promise<string | null> {
  return (await settingsKey()) ?? envKey();
}
