/**
 * The failure-code table (P7 AI; ai.md AI-§A.3, AI-§A.7, AI-§B.10). Isomorphic and pure: one row per `AiFailCode` with
 * its group, whether the same rung may be retried, and the HTTP status an AI route answers with (AI-§A.7: policy
 * blocks 403, `flag_off` the neutral 404 of an unknown route, input 422, quotas and rates 429, busy and provider 503).
 * The SDK error mapping (`fromSdkError`, AI-§B.10) produces these codes; the routes and the client ladder read them.
 */
import type { AiFailCode, AiFailure } from "./types";
import type { AiProviderId } from "../tasks";

export type FailGroup = "policy" | "money" | "input" | "output" | "provider" | "local";

export interface FailInfo {
  group: FailGroup;
  /** the same rung may be tried again (within the deadline, AI-§A.4 step 10) */
  retryable: boolean;
  /** the AI route's HTTP status */
  status: number;
}

const row = (group: FailGroup, retryable: boolean, status: number): FailInfo => ({ group, retryable, status });

export const FAIL_CODES: Readonly<Record<AiFailCode, FailInfo>> = {
  disabled: row("policy", false, 403),
  store_local_only: row("policy", false, 403),
  no_key: row("policy", false, 403),
  no_cap: row("policy", false, 403),
  kill: row("policy", false, 403),
  entitlement: row("policy", false, 403),
  state: row("policy", false, 403),
  // the same neutral answer as an unknown route (AI-§A.2: a task whose release or flag is off is invisible)
  flag_off: row("policy", false, 404),
  quota_store: row("money", false, 429),
  quota_day: row("money", false, 429),
  quota_platform: row("money", false, 429),
  quota_platform_pending: row("money", false, 429),
  quota_director: row("money", false, 429),
  rate_limited: row("money", true, 429),
  busy: row("money", true, 503),
  pii_blocked: row("input", false, 422),
  input_invalid: row("input", false, 422),
  refused: row("output", false, 422),
  invalid_output: row("output", false, 502),
  max_tokens: row("output", false, 502),
  timeout: row("output", true, 504),
  cancelled: row("output", false, 499),
  // never 401 to the browser: the member's session is fine, the platform's key is not
  provider_auth: row("provider", false, 503),
  provider_overloaded: row("provider", true, 503),
  provider_error: row("provider", true, 503),
  bad_request: row("provider", false, 500),
  model_unavailable: row("provider", false, 503),
  device_unsupported: row("local", false, 500),
  model_load: row("local", false, 500),
  oom: row("local", false, 500),
  unknown: row("local", false, 500),
};

/** The typed failure of one rung. */
export function aiFailure(code: AiFailCode, provider: AiProviderId, runId: string | null = null, retryAfterSec?: number): AiFailure {
  const f: AiFailure = { ok: false, code, retryable: FAIL_CODES[code].retryable, provider, runId };
  if (retryAfterSec !== undefined) f.retryAfterSec = Math.max(0, Math.ceil(retryAfterSec));
  return f;
}

/**
 * Whether the client ladder moves to the next rung after this failure (AI-§A.4: "a failure with `retryable` or a policy
 * block moves down"). Every failure does, except an abort the user asked for: a refusal, a PII block or a timeout on
 * the server still leaves local and the library.
 */
export function ladderAdvances(code: AiFailCode): boolean {
  return code !== "cancelled";
}
