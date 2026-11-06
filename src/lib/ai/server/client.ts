import "server-only";
/**
 * The one Claude client of the process (P7 AI; ai.md AI-§B.1; docs/STORE-SAAS.md §H.7, §F.10; P0b review F-1, F-2).
 *
 *   new Anthropic({ apiKey, ...anthropicEndpoint(), maxRetries: 0, timeout: 90_000 })
 *
 *   - `anthropic()`: created lazily with the explicit key of `resolveKey()` (the sealed console key, else env
 *     `ANTHROPIC_API_KEY`); null when there is no key (the policy's `no_key`). Rebuilt when the key or the endpoint
 *     changes; a new key also clears an auth-open breaker (AI-§B.10 "until the key changes").
 *   - `anthropicEndpoint()` (the maintainer's helper) pins the base URL, `authToken: null` and the SDK's log level, so
 *     neither `ANTHROPIC_BASE_URL` nor `ANTHROPIC_AUTH_TOKEN` nor `ANTHROPIC_LOG` can redirect, add to or log a request.
 *     The fake provider of the tests is reached only through its `ai-base-url` seam (`SG_E2E=1`, a loopback origin, a
 *     `cod_test_*` database; otherwise ignored with one `[security]` line). This file never reads `SG_AI_*` itself.
 *   - `maxRetries: 0`: retries are the router's (AI-§A.4 step 10), inside the route deadline.
 * The key is never logged, returned or put in an error: only a 16-hex fingerprint is kept to notice a change.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { anthropicEndpoint } from "@/lib/security/test-seams";
import { breaker } from "./breaker";
import { resolveKey } from "./key";
import { dropProcessState, readProcessState, writeProcessState } from "./process";

export { keySource, type KeySource } from "./key";

/** The client's own request ceiling; every call passes a shorter per-request timeout (the route deadline). */
export const CLIENT_TIMEOUT_MS = 90_000;

interface CachedClient {
  fingerprint: string;
  keyPrint: string;
  client: Anthropic;
}

const keyPrint = (key: string): string => createHash("sha256").update(key).digest("hex").slice(0, 16);

/** The process client, or null without a key. */
export async function anthropic(): Promise<Anthropic | null> {
  const key = await resolveKey();
  if (!key) return null;
  const endpoint = anthropicEndpoint();
  const kp = keyPrint(key);
  const fingerprint = `${kp}|${endpoint.baseURL}`;
  const cached = readProcessState<CachedClient>("client");
  if (cached?.fingerprint === fingerprint) return cached.client;
  if (cached && cached.keyPrint !== kp) breaker().authCleared();
  const client = new Anthropic({ apiKey: key, ...endpoint, maxRetries: 0, timeout: CLIENT_TIMEOUT_MS });
  writeProcessState<CachedClient>("client", { fingerprint, keyPrint: kp, client });
  return client;
}

/** After the key changes in the console: the next call builds a new client, and an auth-open breaker closes. */
export function resetAnthropic(): void {
  dropProcessState("client");
  breaker().authCleared();
}
