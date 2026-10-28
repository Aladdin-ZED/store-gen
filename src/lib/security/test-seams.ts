import "server-only";
/**
 * The test seams (docs/STORE-SAAS.md §H.7, P0b CCR P5-6 / P7-9; maintainer): the only reader of `TEST_SEAM_VARS`.
 * They let a production build run the e2e mocks and the stub AI provider against a throwaway database, which
 * `SG_TEST_CONTEXT` cannot (§E.4: it is ignored under NODE_ENV=production).
 *
 *   const mocks = testSeam("e2e-mocks");      // P5 src/lib/integrations/transport.ts: { origin } of the recorder, or null
 *   const fake = testSeam("ai-base-url");     // P7's provider: { origin } of the fake Anthropic endpoint, or null
 *   if (testSeam("ai-no-after")) …            // AI-§B.12 line 12: no after() driver for detached jobs
 *   if (!testSeam("ai-harness")) return 404;  // P7's component harness route
 *
 * Computed on every call from process.env (nothing cached). A seam is on only when ALL of these hold, in every
 * NODE_ENV, production included (never relaxed, never stricter):
 *  1. `SG_E2E === "1"`;
 *  2. every origin involved is loopback http: `http:`, host 127.0.0.1, localhost or [::1], no username or password,
 *     no path beyond `/` (no query, no fragment): `SG_E2E_MOCK_ORIGIN` for e2e-mocks, `SG_AI_BASE_URL` for
 *     ai-base-url, and for the boolean seams ai-no-after / ai-harness the app's own origin (PLATFORM_URL, else
 *     PUBLIC_URL, as src/lib/edge/env.ts reads it), whose own variable (`SG_AI_NO_AFTER` / `SG_AI_HARNESS`) must
 *     also be "1";
 *  3. the database name in DATABASE_URL's path matches /^cod_test_[a-z0-9_]+$/.
 * A seam whose own variable is unset is simply off. A seam whose own variable is set but refused is off and logs
 * `[security] test seam <seam> refused: <guard>` once per process and seam, never a value. `qa:secrets` fails a
 * Hostinger env file that sets any of `NEVER_DEPLOYED_VARS` (the seams, SG_TEST_CONTEXT and the Anthropic SDK's own
 * variables); `test:security` holds the truth table and fails on a direct read of these names anywhere else in src/**.
 *
 * The Anthropic client (AI-§B.1, P0b review F-1): `@anthropic-ai/sdk` reads ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN
 * and ANTHROPIC_LOG for every constructor option left undefined, with no guard of its own, so an explicit `apiKey`
 * alone still lets the environment send the key (X-Api-Key) and every prompt to another host, with a Bearer token
 * beside it. Every `new Anthropic(…)` therefore spreads `anthropicEndpoint()`, the one place the `ai-base-url` seam
 * becomes a base URL:
 *
 *   new Anthropic({ apiKey, ...anthropicEndpoint(), maxRetries: 0, timeout: 90_000 })
 *
 * `bootSeamCheck()` (src/instrumentation.ts) logs one `[security]` line naming the variables of `NEVER_DEPLOYED_VARS`
 * that are set in a process whose database is not a `cod_test_*` one (names only, never a value).
 */

export type TestSeam = "e2e-mocks" | "ai-base-url" | "ai-no-after" | "ai-harness";

export const TEST_SEAM_VARS = ["SG_E2E", "SG_E2E_MOCK_ORIGIN", "SG_AI_BASE_URL", "SG_AI_NO_AFTER", "SG_AI_HARNESS"] as const;

/**
 * The variables `@anthropic-ai/sdk` reads from the environment that would redirect or add to a request (P0b review
 * F-1): the base URL, a Bearer token sent beside the key, extra headers. `anthropicEndpoint()` pins the first two;
 * the headers cannot be pinned, so all three are refused on Hostinger and named at boot.
 */
export const ANTHROPIC_SDK_ENV_VARS = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_CUSTOM_HEADERS"] as const;

/** Variables a deployed process never carries: the seams, §E.4's test identity context, the SDK's own (`qa:secrets`, `bootSeamCheck`). */
export const NEVER_DEPLOYED_VARS = [...TEST_SEAM_VARS, "SG_TEST_CONTEXT", ...ANTHROPIC_SDK_ENV_VARS] as const;

/** The Claude API origin of every server client outside the `ai-base-url` seam (AI-§B.1). */
export const ANTHROPIC_API_ORIGIN = "https://api.anthropic.com";

/** Why a loopback origin was refused. */
export type OriginProblem = "missing" | "parse" | "protocol" | "credentials" | "host" | "path";

/** The guard that kept a requested seam off: the flag, the boolean seam's own value, an origin, the database. */
export type TestSeamGuard = "flag" | "value" | `origin.${OriginProblem}` | `app-origin.${OriginProblem}` | "database";

export type TestSeamDecision =
  | { on: true; origin: string | null }
  /** `guard` null: the seam's own variable is unset (not requested, nothing to log) */
  | { on: false; guard: TestSeamGuard | null };

type Env = Readonly<Record<string, string | undefined>>;

/** Each seam's own variable: unset = the seam is not requested. */
const OWN: Record<TestSeam, (typeof TEST_SEAM_VARS)[number]> = {
  "e2e-mocks": "SG_E2E_MOCK_ORIGIN",
  "ai-base-url": "SG_AI_BASE_URL",
  "ai-no-after": "SG_AI_NO_AFTER",
  "ai-harness": "SG_AI_HARNESS",
};

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TEST_DB_RE = /^cod_test_[a-z0-9_]+$/;

/** `raw` as a loopback http origin ("http://127.0.0.1:4010"), or why not. */
export function loopbackOrigin(raw: string | undefined): { origin: string } | { problem: OriginProblem } {
  const value = raw?.trim();
  if (!value) return { problem: "missing" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { problem: "parse" };
  }
  if (url.protocol !== "http:") return { problem: "protocol" };
  if (url.username || url.password) return { problem: "credentials" };
  if (!LOOPBACK_HOSTS.has(url.hostname)) return { problem: "host" };
  if (url.pathname !== "/" || url.search || url.hash) return { problem: "path" };
  return { origin: url.origin };
}

/** The database name of a `mysql://…/<name>` URL, or null. */
function databaseName(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return decodeURIComponent(new URL(value).pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

/** The pure decision over an environment (process.env for `testSeam`; synthetic objects in test:security). */
export function decideTestSeam(seam: TestSeam, env: Env): TestSeamDecision {
  const own = env[OWN[seam]]?.trim();
  if (!own) return { on: false, guard: null };
  if (env.SG_E2E !== "1") return { on: false, guard: "flag" };
  let origin: string | null = null;
  if (seam === "e2e-mocks" || seam === "ai-base-url") {
    const o = loopbackOrigin(own);
    if ("problem" in o) return { on: false, guard: `origin.${o.problem}` };
    origin = o.origin;
  } else {
    if (own !== "1") return { on: false, guard: "value" };
    // the app's own origin: PLATFORM_URL, else PUBLIC_URL (the first one set, as platformUrl() reads them)
    const app = loopbackOrigin(env.PLATFORM_URL?.trim() || env.PUBLIC_URL);
    if ("problem" in app) return { on: false, guard: `app-origin.${app.problem}` };
  }
  const name = databaseName(env.DATABASE_URL);
  if (!name || !TEST_DB_RE.test(name)) return { on: false, guard: "database" };
  return { on: true, origin };
}

/** The refusal lines already written (four fixed keys, one per seam; no store data). */
const refusalLogged: Record<TestSeam, boolean> = { "e2e-mocks": false, "ai-base-url": false, "ai-no-after": false, "ai-harness": false };

/**
 * The seam's answer for this process right now: `{ origin }` when on (`origin` = the seam's loopback origin for
 * e2e-mocks and ai-base-url, null for the boolean seams), else null (inert). See the header for the guards.
 */
export function testSeam(seam: TestSeam): { origin: string | null } | null {
  const d = decideTestSeam(seam, process.env);
  if (d.on) return { origin: d.origin };
  if (d.guard && !refusalLogged[seam]) {
    refusalLogged[seam] = true;
    console.error(`[security] test seam ${seam} refused: ${d.guard}`);
  }
  return null;
}

/**
 * The endpoint options every `new Anthropic(…)` spreads (AI-§B.1, core §H.7; P0b review F-1): the seam's loopback
 * origin when `ai-base-url` is on, else the Claude API origin (never `undefined`, which would let the SDK read
 * ANTHROPIC_BASE_URL); `authToken: null`, so ANTHROPIC_AUTH_TOKEN never adds a Bearer header beside the key; the SDK's
 * own log level pinned, so ANTHROPIC_LOG=debug never logs a request.
 */
export function anthropicEndpoint(): { baseURL: string; authToken: null; logLevel: "warn" } {
  return { baseURL: testSeam("ai-base-url")?.origin ?? ANTHROPIC_API_ORIGIN, authToken: null, logLevel: "warn" };
}

/**
 * The variables of `NEVER_DEPLOYED_VARS` set (non-blank) in `env` when its database is not a `cod_test_*` one, in
 * list order; [] for a throwaway test database, where the e2e runs set them on purpose.
 */
export function deployedTestVars(env: Env): string[] {
  const name = databaseName(env.DATABASE_URL);
  if (name && TEST_DB_RE.test(name)) return [];
  return NEVER_DEPLOYED_VARS.filter((v) => !!env[v]?.trim());
}

/** Boot (src/instrumentation.ts, step 1): one `[security]` line naming the variables, never a value; true when one is set. */
export function bootSeamCheck(): boolean {
  const set = deployedTestVars(process.env);
  if (set.length) console.error(`[security] test-only variables set outside a cod_test_ database: ${set.join(", ")}. Remove them (§H.7).`);
  return set.length > 0;
}
