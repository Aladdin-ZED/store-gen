/**
 * Platform selftest (platform.md PLA-§O.1, P1 CONSOLE):
 *   npm run test:platform        (tsx src/lib/platform/selftest.ts; offline: no DB, no network, no React render)
 *
 * Checks, all on injected dependencies:
 *   - scoreSignup golden fixtures (PL-03): exact score, flags, points, band and `partial`, the MX lookup failing open,
 *     the guards failing closed (out of the fast lane), the 2 s budget on a hanging lookup, and `signals` free of any
 *     raw e-mail, phone, IP or user agent;
 *   - bandFor's table, the `autoApprove` truth table per mode (PL-01, `turnstile: "off"` refused in `open`), the hold
 *     class, `explainBand` against `bandFor` on every fixture (PL-04 / PD52: the pivot removed re-scores to
 *     `bandWithout`; no pivot when no single flag changes the band), the Turnstile flags never on a fixture scored in
 *     `approval` / `open`;
 *   - normalisation (`normalizeEmailForIdentity`, `brandTokens` = handles.ts `brandFoldings`, `matchBrandTerm`), every
 *     mask function (short and one-word names, IPv6, `maskIfImpersonation` identity vs masking with the city kept);
 *   - `renderMarkdownLite` escaping (`<script>`, `javascript:` links, nested emphasis) on the element tree, the
 *     keyset cursor (a tampered token → null), the reason codes and the risk flags against the console catalogs, the
 *     `PlatformSettingSchema` defaults and refusals (TN-04), and `FEATURE_PROOFS` (PD77) against the PLA-§O lists
 *     mirrored below;
 *   - two copies pinned to their sources (the BOT_UA pattern, `describeUserAgent`) until CCR r1-p1-1 shares them.
 * Exits 1 on any failure.
 */
import { readFileSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { ReactElement, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* PD77: FEATURE_PROOFS and the PLA-§O lists it names                  */
/* ------------------------------------------------------------------ */

/** Every R1 id of PLA-§1 (the feature maps' rows whose release is R1, or that carry an R1 slice). */
export const R1_FEATURE_IDS = [
  "PL-01", "PL-02", "PL-03", "PL-04", "PL-05", "PL-06", "PL-07", "PL-08", "PL-09", "PL-10", "PL-11", "PL-12", "PL-13", "PL-14",
  "PL-18", "PL-20",
  "TN-01", "TN-02", "TN-03", "TN-04", "TN-05", "TN-06", "TN-07", "TN-08", "TN-09", "TN-10", "TN-11", "TN-12", "TN-13",
  "UX-01", "UX-02", "UX-03", "UX-05", "UX-07", "UX-08",
  "SE-01", "SE-04", "OS-06", "OS-09", "OS-10",
  "SF-01", "SF-03", "SF-05", "SF-06", "SF-11",
] as const;
export type FeatureId = (typeof R1_FEATURE_IDS)[number];

/** PLA-§O.2: the cases of `test:platform-db` (scripts/qa/platform-check.ts; the spec's "test:db case n"). */
export const PLATFORM_DB_CASES: Readonly<Record<number, string>> = {
  1: "queue", 2: "requests", 3: "platform requests", 4: "plans", 5: "health", 6: "notifications", 7: "staff", 8: "legal",
  9: "impersonation from the console", 10: "query plans and --perf", 11: "lifecycle safety", 12: "console pulse and impersonation",
  13: "sandbox ceilings", 14: "impersonation masking at the repository", 15: "brand guard and reports", 16: "account deletion",
  17: "tenant step-up ladder", 18: "sandbox ceilings, refund paths", 19: "machinery screens", 20: "invite consumption",
};

/** PLA-§O.3: the attack cases of scripts/qa/tenancy-cases/platform.ts, run by `test:tenancy`. */
export const ATTACK_CASES: Readonly<Record<number, string>> = {
  1: "console canaries per role", 2: "analyst refusals and k-suppression", 3: "support refusals", 4: "tenant owner → console actions",
  5: "store requests across stores", 6: "pulse and search across stores", 7: "media proxy and export signatures", 8: "no canary in platform rows",
  9: "health snooze and recompute across stores", 10: "pulse under impersonation", 11: "lifecycle preview and actions from a tenant",
  12: "address card slots", 13: "sandbox cap under a signup flood", 14: "shared pending media budget", 15: "impersonation masking on tenant routes",
  16: "store audit page across stores", 17: "public report", 18: "locale cookie", 19: "private preview links", 20: "account deletion and step-up",
};

/** PLA-§O.4: the e2e steps and the committed script that runs each (rev 6 P0b: P1's, P2's, the shared harnesses). */
export const E2E_STEPS: Readonly<Record<number, { title: string; scripts: readonly string[] }>> = {
  1: { title: "approval flow", scripts: ["qa:console-e2e"] },
  2: { title: "onboarding timing", scripts: ["qa:shell-e2e"] },
  3: { title: "impersonation", scripts: ["qa:console-e2e"] },
  4: { title: "kill switches", scripts: ["qa:console-e2e"] },
  5: { title: "invites", scripts: ["qa:shell-e2e"] },
  6: { title: "screenshots", scripts: ["qa:console-e2e", "qa:shell-e2e"] },
  7: { title: "PWA manifest", scripts: ["qa:shell-e2e"] },
  8: { title: "headers", scripts: ["qa:headers"] },
  9: { title: "release check (manual)", scripts: [] },
  10: { title: "admin perf", scripts: ["qa:admin-perf"] },
  11: { title: "pulse e2e", scripts: ["qa:pulse-e2e"] },
  12: { title: "lifecycle sheet", scripts: ["qa:console-e2e"] },
  13: { title: "health ring", scripts: ["qa:console-e2e", "qa:shell-e2e"] },
  14: { title: "dashboard timings", scripts: ["qa:shell-e2e"] },
  15: { title: "reveal layout (R1 integration)", scripts: ["qa:shell-e2e"] },
  16: { title: "brand guard end to end", scripts: ["qa:console-e2e"] },
  17: { title: "ceilings in the UI", scripts: ["qa:console-e2e"] },
  18: { title: "cookies", scripts: ["qa:headers"] },
  19: { title: "step-up ladder", scripts: ["qa:shell-e2e"] },
  20: { title: "account deletion", scripts: ["qa:console-e2e", "qa:shell-e2e"] },
  21: { title: "report link on every public page", scripts: ["qa:console-e2e"] },
};

/** PLA-§O.5: the wow-demo moments this part's rows cite. */
export const WOW_DEMO_MOMENTS = ["0:50", "1:25", "1:40", "2:50"] as const;

/**
 * The script vocabulary of a proof: PLA-§O.1 / §O.2 suites, `test:tenancy` (the §O.3 attack cases), `e2e` (§O.4
 * steps), `qa:wow-demo` (§O.5), plus `test:tenancy-lint`, the core suite PLA-§1.2 cites for TN-11. A proof is
 * `<script>`, `<script>#<case or step>` (required for the three numbered lists) or `qa:wow-demo@<m:ss>`.
 */
export const PROOF_SCRIPTS: Readonly<Record<string, "plain" | "numbered" | "moment">> = {
  "test:platform": "plain",
  "test:health": "plain",
  "test:shell": "plain",
  "test:pulse": "plain",
  "test:admin-tokens": "plain",
  "test:admin-motion": "plain",
  "test:admin-rtl": "plain",
  "test:i18n-coverage": "plain",
  "test:permissions": "plain",
  "test:health-db": "plain",
  "test:tenancy-lint": "plain",
  "test:platform-db": "numbered",
  "test:tenancy": "numbered",
  e2e: "numbered",
  "qa:wow-demo": "moment",
};

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * PD77: the "Proven by" cell of every R1 row of PLA-§1, machine-readable. Where PLA-§O.1's rev 6 P0b `test:shell` row
 * moved a pure check out of `test:platform` (P2's `roleSummary`, `modeSummary`, the zero-data brief), the proof names
 * `test:shell`, which is where the check runs.
 */
export const FEATURE_PROOFS: Record<FeatureId, string[]> = {
  "PL-01": ["test:platform", "test:platform-db#13", "e2e#1"],
  "PL-02": ["test:platform-db#13", "test:tenancy#13", "test:tenancy#14", "e2e#1", "e2e#17"],
  "PL-03": ["test:platform", "test:tenancy#8"],
  "PL-04": ["test:platform", "test:platform-db#1", "test:tenancy#1", "e2e#1", "qa:wow-demo@1:25"],
  "PL-05": ["test:platform-db#10", "test:tenancy#2"],
  "PL-06": ["test:platform-db#10"],
  "PL-07": ["test:tenancy#1", "test:platform-db#10", "e2e#6"],
  "PL-08": ["test:platform", "test:platform-db#3", "test:platform-db#11", "e2e#12"],
  "PL-09": ["test:tenancy#7", "e2e#19"],
  "PL-10": ["test:platform-db#9", "test:platform-db#12", "test:platform-db#14", "test:tenancy#15", "e2e#3"],
  "PL-11": ["test:platform", "test:platform-db#2", "test:platform-db#4"],
  "PL-12": ["test:platform", "e2e#4"],
  "PL-13": ["test:platform", "test:i18n-coverage", "test:platform-db#6"],
  "PL-14": ["test:platform", "test:platform-db#8"],
  "PL-18": ["test:health", "test:health-db", "e2e#13", "qa:wow-demo@2:50"],
  "PL-20": ["test:platform-db#15", "test:tenancy#17", "e2e#16"],
  "TN-01": ["test:tenancy#1", "e2e#6"],
  "TN-02": ["test:i18n-coverage", "e2e#4", "e2e#17"],
  "TN-03": ["e2e#6", "test:platform-db#3"],
  "TN-04": ["test:platform", "test:platform-db#8"],
  "TN-05": ["e2e#1", "e2e#5", "e2e#6", "e2e#18", "test:i18n-coverage"],
  "TN-06": ["e2e#5", "test:platform-db#20"],
  "TN-07": ["e2e#6", "test:tenancy#6"],
  "TN-08": ["test:shell", "test:permissions"],
  "TN-09": ["test:shell", "e2e#6"],
  "TN-10": range(1, 20).map((n) => `test:tenancy#${n}`),
  "TN-11": ["test:tenancy-lint"],
  "TN-12": ["test:shell"],
  "TN-13": ["test:platform-db#17"],
  "UX-01": ["e2e#2", "e2e#15", "qa:wow-demo@0:50"],
  "UX-02": ["test:tenancy#6", "e2e#10"],
  "UX-03": ["test:admin-tokens", "test:admin-motion", "test:admin-rtl"],
  "UX-05": ["test:tenancy#12", "e2e#6", "qa:wow-demo@1:40"],
  "UX-07": ["e2e#7"],
  "UX-08": ["test:i18n-coverage", "test:admin-rtl"],
  "SE-01": ["test:platform-db#7", "e2e#6"],
  "SE-04": ["test:platform-db#19"],
  "OS-06": ["test:platform-db#19"],
  "OS-09": ["test:platform-db#19"],
  "OS-10": ["test:platform-db#19"],
  "SF-01": ["test:platform"],
  "SF-03": ["test:health", "test:health-db", "e2e#13", "qa:wow-demo@2:50"],
  "SF-05": ["test:tenancy#12", "qa:wow-demo@1:40"],
  "SF-06": ["test:pulse", "e2e#11"],
  "SF-11": ["test:shell", "qa:wow-demo@2:50"],
};

/** Why a proof entry is invalid, or null (exported for the self-check below). */
export function proofProblem(entry: string): string | null {
  const m = /^([a-z0-9:-]+)(?:#(\d+)|@(\d:\d\d))?$/.exec(entry);
  if (!m) return "not <script>[#n|@m:ss]";
  const [, script, num, moment] = m;
  const kind = PROOF_SCRIPTS[script!];
  if (!kind) return `"${script}" is not a script of PLA-§O`;
  if (kind === "numbered") {
    if (!num) return `${script} needs a case or step number`;
    const list = script === "test:platform-db" ? PLATFORM_DB_CASES : script === "test:tenancy" ? ATTACK_CASES : E2E_STEPS;
    if (!Object.hasOwn(list, Number(num))) return `${script} has no case or step ${num}`;
  } else if (num) return `${script} takes no number`;
  if (kind === "moment") {
    if (!moment || !(WOW_DEMO_MOMENTS as readonly string[]).includes(moment)) return `qa:wow-demo needs one of ${WOW_DEMO_MOMENTS.join(", ")}`;
  } else if (moment) return `${script} takes no moment`;
  return null;
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

let checks = 0;
let failures = 0;
const skips: string[] = [];
const check = (ok: boolean, msg: string) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = join(__dirname, "..", "..", "..");
const source = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

async function main(): Promise<void> {
  // the modules under test are marked `import "server-only"`; outside Next that import throws (as in selftest-identity)
  {
    const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
    const orig = M._resolveFilename;
    const stub = require.resolve("zod");
    M._resolveFilename = function (req: string, ...rest: unknown[]) {
      return req === "server-only" ? stub : orig.call(this, req, ...rest);
    };
  }
  const env = process.env as Record<string, string | undefined>;
  env.APP_SECRET = "platform-selftest-9f3c2a71d4b8e605c1f7a2d93b6e4c08";
  if (env.NODE_ENV === "production") throw new Error("the platform selftest never runs with NODE_ENV=production");
  const t0 = performance.now();

  const risk = await import("./signup-risk");
  const band = await import("./signup-band");
  const norm = await import("./normalize");
  const mask = await import("./mask");
  const md = await import("./markdown-lite");
  const cursor = await import("./cursor");
  const reasons = await import("./reasons");
  const { PlatformSettingSchema } = await import("@/lib/settings/keys/platform");
  const { PROTECTED_BRANDS } = await import("./data/protected-brands");
  const handles = await import("@/lib/tenancy/handles");
  const { hmac } = await import("@/lib/security/crypto");
  const { messages: enConsole } = await import("@/lib/i18n/admin/en/console");
  const { messages: frConsole } = await import("@/lib/i18n/admin/fr/console");
  const { messages: arConsole } = await import("@/lib/i18n/admin/ar/console");
  const { messages: enAll } = await import("@/lib/i18n/admin/en");
  const disposableMod = await import("./data/disposable-domains.json");
  const disposable = ("default" in disposableMod ? disposableMod.default : disposableMod) as { license: string; domains: string[] };

  type Input = import("./signup-risk").SignupRiskInput;
  type Deps = import("./signup-risk").SignupRiskDeps;
  type Score = import("./signup-risk").SignupScore;
  type Match = import("./signup-risk").IdentityMatch;
  type Signup = import("@/lib/settings/keys/platform").PlatformSetting["signup"];
  type SignupMode = import("./types").SignupMode;
  type Code = import("./types").SignupFlagCode;
  type Thresholds = import("./types").SignupThresholds;

  const DEFAULT_SIGNUP: Signup = PlatformSettingSchema.parse({}).signup;
  const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  const SEED_TERMS = PROTECTED_BRANDS.map((b) => ({ term: b.term, kind: b.kind, match: b.match }));

  /* ---------------------------------------------------------------- */
  /* 1. scoreSignup golden fixtures (PLA-§O.1 row 1)                  */
  /* ---------------------------------------------------------------- */

  const BASE: Input = {
    email: "salma.benali@gmail.com",
    phoneE164: "+212612345634",
    name: "Salma Benali",
    storeName: "Nour Argan",
    handle: "nour-argan",
    ip: "196.200.12.7",
    ua: CHROME_UA,
    deviceId: null,
    turnstile: "ok",
    formMs: 48_000,
    market: "MA",
    mode: "landing",
    locale: "fr",
    via: "signup",
  };
  const hashOf = (kind: string, value: string) => hmac(value, `identity:${kind}`);

  interface World {
    mx?: Record<string, "ok" | "none" | "null" | "timeout" | "hang">;
    /** answered by link kind; `onlyHash` restricts a match to one exact hashed value */
    matches?: (Match & { onlyHash?: string })[];
    velocity?: boolean;
    extraTerms?: { term: string; kind: string; match: "exact" | "substring" | "skeleton" }[];
    trusted?: boolean;
    setting?: Partial<Signup>;
    fail?: ("identity" | "terms" | "velocity" | "setting" | "trusted" | "now")[];
    budgetMs?: number;
  }
  interface Calls {
    mx: string[];
    trusted: string[];
    links: { kind: string; valueHash: string }[];
    velocity: string[];
  }
  function depsOf(w: World, calls: Calls): Deps {
    const boom = (what: string) => {
      throw new Error(`fixture: ${what} failed`);
    };
    return {
      now: () => (w.fail?.includes("now") ? boom("now") : performance.now()),
      resolveMx: async (domain) => {
        calls.mx.push(domain);
        const a = w.mx?.[domain] ?? "ok";
        return a === "hang" ? new Promise<never>(() => {}) : a;
      },
      identityMatches: async (links) => {
        calls.links.push(...links);
        if (w.fail?.includes("identity")) boom("identity");
        return (w.matches ?? [])
          .filter((m) => links.some((l) => l.kind === m.kind && (!m.onlyHash || m.onlyHash === l.valueHash)))
          .map((m) => ({ kind: m.kind, users: m.users, banned: m.banned, recentUsers24h: m.recentUsers24h }));
      },
      velocity: async (net) => {
        calls.velocity.push(net);
        if (w.fail?.includes("velocity")) boom("velocity");
        return w.velocity ?? false;
      },
      protectedTerms: async () => (w.fail?.includes("terms") ? boom("terms") : [...SEED_TERMS, ...(w.extraTerms ?? [])]),
      trustedCreator: async (userId) => {
        calls.trusted.push(userId);
        if (w.fail?.includes("trusted")) boom("trusted");
        return w.trusted ?? false;
      },
      signupSetting: async () => (w.fail?.includes("setting") ? boom("setting") : { ...DEFAULT_SIGNUP, ...w.setting }),
      ...(w.budgetMs !== undefined ? { budgetMs: w.budgetMs } : {}),
    };
  }

  interface Fixture {
    name: string;
    input?: Partial<Input>;
    world?: World;
    /** the platform signup mode this applicant came through (for the auto-approval and Turnstile checks) */
    mode?: SignupMode;
    expect: { score: number; band: import("./types").SignupBand; flags: [Code, number][]; partial?: boolean; evidence?: Partial<Record<Code, Record<string, string | number>>> };
    /** the band is held at review by a guard that did not answer (not bandFor's) */
    floor?: true;
    /** an input whose re-score must give the pivot's bandWithout (PD52 "remove the pivot, re-score") */
    without?: Partial<Input>;
    maxMs?: number;
  }

  const FIXTURES: Fixture[] = [
    { name: "clean Gmail sign-up", mode: "approval", expect: { score: 0, band: "fast", flags: [] } },
    { name: "clean sign-up, open mode", mode: "open", input: { email: "karim@menara.ma" }, expect: { score: 0, band: "fast", flags: [] } },
    {
      name: "disposable domain",
      mode: "approval",
      input: { email: "deal@yopmail.com" },
      expect: { score: 35, band: "review", flags: [["disposable_email", 35]], evidence: { disposable_email: { domain: "yopmail.com" } } },
      without: { email: "deal@gmail.com" },
    },
    { name: "a subdomain of a disposable domain", input: { email: "x@inbox.mailinator.com" }, expect: { score: 35, band: "review", flags: [["disposable_email", 35]] } },
    { name: "null MX", input: { email: "a@nullmx.ma" }, world: { mx: { "nullmx.ma": "null" } }, expect: { score: 25, band: "review", flags: [["null_mx", 25]], evidence: { null_mx: { domain: "nullmx.ma" } } } },
    { name: "no MX", input: { email: "a@nomx.ma" }, world: { mx: { "nomx.ma": "none" } }, expect: { score: 20, band: "fast", flags: [["no_mx", 20]] } },
    { name: "MX timeout fails open", input: { email: "a@slow.ma" }, world: { mx: { "slow.ma": "timeout" } }, expect: { score: 0, band: "fast", flags: [["mx_unknown", 0]], partial: true } },
    {
      name: "MX hanging past the budget",
      input: { email: "a@hang.ma" },
      world: { mx: { "hang.ma": "hang" }, budgetMs: 40 },
      expect: { score: 0, band: "fast", flags: [["mx_unknown", 0]], partial: true },
      maxMs: 1_000,
    },
    {
      name: "face-b00k-shop handle",
      input: { handle: "face-b00k-shop", storeName: "Shop" },
      expect: { score: 40, band: "review", flags: [["brand_exact", 40]], evidence: { brand_exact: { term: "facebook", field: "handle" } } },
      without: { handle: "nour-shop" },
    },
    {
      name: "Banque Populaire Store (bank)",
      input: { storeName: "Banque Populaire Store", handle: "bp-store" },
      world: { extraTerms: [{ term: "Banque Populaire", kind: "bank", match: "exact" }] },
      expect: { score: 40, band: "review", flags: [["brand_exact", 40]], evidence: { brand_exact: { term: "Banque Populaire", field: "store_name" } } },
    },
    {
      name: "Arabic name with tatweel",
      input: { storeName: "اتصـــالات المغرب", handle: "atisalat-shop" },
      world: { extraTerms: [{ term: "اتصالات", kind: "brand", match: "exact" }] },
      expect: { score: 40, band: "review", flags: [["brand_exact", 40]], evidence: { brand_exact: { term: "اتصالات", field: "store_name" } } },
    },
    {
      name: "Arabic name with diacritics",
      input: { storeName: "اتِّصالات للهواتف", handle: "hawatif-ma" },
      world: { extraTerms: [{ term: "اتصالات", kind: "brand", match: "exact" }] },
      expect: { score: 40, band: "review", flags: [["brand_exact", 40]] },
    },
    { name: "paypa1-shop (1 read as l)", input: { handle: "paypa1-shop", storeName: "Shop" }, expect: { score: 40, band: "review", flags: [["brand_exact", 40]], evidence: { brand_exact: { term: "paypal", field: "handle" } } } },
    { name: "vvhatsapp-ma (vv read as w)", input: { handle: "vvhatsapp-ma", storeName: "Shop" }, expect: { score: 40, band: "review", flags: [["brand_exact", 40]] } },
    {
      name: "a brand inside the e-mail's local part",
      input: { email: "cih.support@gmail.com" },
      expect: { score: 40, band: "review", flags: [["brand_exact", 40]], evidence: { brand_exact: { term: "cih", field: "email" } } },
    },
    {
      name: "a substring term inside a word",
      input: { storeName: "Mybankshop", handle: "my-shop" },
      expect: { score: 25, band: "review", flags: [["brand_near", 25]], evidence: { brand_near: { term: "bank", field: "store_name" } } },
    },
    { name: "an exact-only term inside a word stays free", input: { storeName: "Metal Art Visage", handle: "metal-art" }, expect: { score: 0, band: "fast", flags: [] } },
    {
      name: "offensive term",
      input: { storeName: "Connard Shop", handle: "c-shop" },
      world: { extraTerms: [{ term: "connard", kind: "offensive", match: "substring" }] },
      expect: { score: 30, band: "review", flags: [["offensive_term", 30]], evidence: { offensive_term: { field: "store_name" } } },
    },
    {
      name: "Gmail dot / plus variant",
      input: { email: "s.a.l.m.a+promo@googlemail.com" },
      world: { matches: [{ kind: "email_norm", users: 1, banned: 0, recentUsers24h: 0, onlyHash: hashOf("email_norm", "salma@gmail.com") }] },
      expect: { score: 25, band: "review", flags: [["dup_email_norm", 25]], evidence: { dup_email_norm: { users: 1 } } },
    },
    { name: "phone shared by 1", world: { matches: [{ kind: "phone", users: 1, banned: 0, recentUsers24h: 0 }] }, expect: { score: 20, band: "fast", flags: [["dup_phone", 20]] } },
    { name: "phone shared by 2", world: { matches: [{ kind: "phone", users: 2, banned: 0, recentUsers24h: 0 }] }, expect: { score: 30, band: "review", flags: [["dup_phone", 30]] } },
    { name: "phone shared by 3 → +40", world: { matches: [{ kind: "phone", users: 3, banned: 0, recentUsers24h: 0 }] }, expect: { score: 40, band: "review", flags: [["dup_phone", 40]] } },
    { name: "phone shared by 7 → capped at +40", world: { matches: [{ kind: "phone", users: 7, banned: 0, recentUsers24h: 1 }] }, expect: { score: 40, band: "review", flags: [["dup_phone", 40]] } },
    { name: "network: 2 recent accounts", world: { matches: [{ kind: "net", users: 9, banned: 0, recentUsers24h: 2 }] }, expect: { score: 15, band: "fast", flags: [["dup_network", 15]] } },
    { name: "network: 1 recent account is no signal", world: { matches: [{ kind: "net", users: 30, banned: 0, recentUsers24h: 1 }] }, expect: { score: 0, band: "fast", flags: [] } },
    {
      name: "shared device (hold class)",
      input: { deviceId: "AbCdEfGhIjKlMnOpQrStUv" },
      world: { matches: [{ kind: "device", users: 1, banned: 0, recentUsers24h: 1 }] },
      expect: { score: 30, band: "review", flags: [["dup_device", 30]] },
    },
    {
      name: "banned link → reject_candidate whatever the score",
      mode: "invite",
      input: { via: "invite_code", inviteLabel: "Beta Casablanca" },
      world: { matches: [{ kind: "email_norm", users: 1, banned: 1, recentUsers24h: 0 }] },
      expect: { score: 55, band: "reject_candidate", flags: [["dup_email_norm", 25], ["linked_banned", 50], ["invite_code", -20]], evidence: { linked_banned: { banned: 1 } } },
    },
    {
      name: "banned device link",
      input: { deviceId: "AbCdEfGhIjKlMnOpQrStUv" },
      world: { matches: [{ kind: "device", users: 2, banned: 1, recentUsers24h: 0 }] },
      expect: { score: 80, band: "reject_candidate", flags: [["dup_device", 30], ["linked_banned", 50]] },
    },
    { name: "network velocity", world: { velocity: true }, expect: { score: 20, band: "fast", flags: [["velocity_network", 20]] } },
    { name: "Turnstile missing (invite mode)", mode: "invite", input: { turnstile: "missing" }, expect: { score: 20, band: "fast", flags: [["turnstile_missing", 20]] } },
    { name: "Turnstile unverified (invite mode)", mode: "invite", input: { turnstile: "unverified" }, expect: { score: 10, band: "fast", flags: [["turnstile_unverified", 10]] } },
    { name: "3 s form → too_fast", input: { formMs: 3_000 }, expect: { score: 30, band: "review", flags: [["too_fast", 30]], evidence: { too_fast: { ms: 3_000 } } } },
    { name: "8 s form → fast", input: { formMs: 8_000 }, expect: { score: 10, band: "fast", flags: [["fast", 10]] } },
    { name: "no form timing is no signal", input: { formMs: null }, expect: { score: 0, band: "fast", flags: [] } },
    { name: "bot UA", input: { ua: "python-requests/2.31.0" }, expect: { score: 40, band: "review", flags: [["bot_ua", 40]], evidence: { bot_ua: { uaLabel: "Browser" } } } },
    { name: "headless browser UA", input: { ua: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/124.0 Safari/537.36" }, expect: { score: 40, band: "review", flags: [["bot_ua", 40]] } },
    { name: "no UA", input: { ua: null }, expect: { score: 20, band: "fast", flags: [["no_ua", 20]], evidence: { no_ua: { uaLabel: "Unknown device" } } } },
    {
      name: "phone country ≠ market",
      input: { phoneE164: "+33612345678" },
      expect: { score: 5, band: "fast", flags: [["phone_market_mismatch", 5]], evidence: { phone_market_mismatch: { phoneCountry: "FR", market: "MA" } } },
    },
    { name: "market not allowed (a forged post)", input: { market: "DZ", phoneE164: null }, expect: { score: 40, band: "review", flags: [["market_not_allowed", 40]] } },
    { name: "invite code −20 (clamped at 0)", mode: "invite", input: { via: "invite_code", inviteLabel: "Beta Casablanca" }, expect: { score: 0, band: "fast", flags: [["invite_code", -20]], evidence: { invite_code: { label: "Beta Casablanca" } } } },
    { name: "waitlist invite −20", mode: "invite", input: { via: "waitlist_invite", email: "deal@yopmail.com" }, expect: { score: 15, band: "fast", flags: [["disposable_email", 35], ["invite_code", -20]] } },
    {
      name: "trusted creator −30, clamped at 0",
      mode: "approval",
      input: { via: "app_new", existingUserId: "01JTRUSTEDCREATOR000000000", turnstile: "off", phoneE164: null },
      world: { trusted: true },
      expect: { score: 0, band: "fast", flags: [["trusted_creator", -30]] },
    },
    {
      name: "trusted creator offsets a disposable domain",
      mode: "approval",
      input: { via: "app_new", existingUserId: "01JTRUSTEDCREATOR000000000", turnstile: "off", phoneE164: null, email: "deal@yopmail.com" },
      world: { trusted: true },
      expect: { score: 5, band: "fast", flags: [["disposable_email", 35], ["trusted_creator", -30]] },
    },
    {
      name: "untrusted creator",
      mode: "approval",
      input: { via: "app_new", existingUserId: "01JNOTTRUSTED0000000000000", turnstile: "off", phoneE164: null },
      world: { trusted: false },
      expect: { score: 0, band: "fast", flags: [] },
    },
    { name: "weights override from settings", input: { email: "deal@yopmail.com" }, world: { setting: { weights: { disposable_email: 70 } } }, expect: { score: 70, band: "hold", flags: [["disposable_email", 70]] } },
    { name: "an out-of-range weight is ignored", input: { formMs: 2_000 }, world: { setting: { weights: { too_fast: 500 } } }, expect: { score: 30, band: "review", flags: [["too_fast", 30]] } },
    {
      name: "thresholds from settings",
      input: { email: "deal@yopmail.com" },
      world: { setting: { thresholds: { fastLaneMax: 10, holdMin: 30, rejectCandidateMin: 50 } } },
      expect: { score: 35, band: "hold", flags: [["disposable_email", 35]] },
    },
    {
      name: "thresholds out of order fall back to the defaults",
      input: { email: "deal@yopmail.com" },
      world: { setting: { thresholds: { fastLaneMax: 70, holdMin: 60, rejectCandidateMin: 85 } } },
      expect: { score: 35, band: "review", flags: [["disposable_email", 35]] },
    },
    {
      name: "several signals add up",
      input: { email: "deal@yopmail.com", ua: null, formMs: 2_500 },
      expect: { score: 85, band: "reject_candidate", flags: [["disposable_email", 35], ["too_fast", 30], ["no_ua", 20]] },
    },
    { name: "clamped at 100", input: { email: "deal@yopmail.com", ua: "curl/8.1", formMs: 900, market: "DZ", phoneE164: null }, expect: { score: 100, band: "reject_candidate", flags: [["disposable_email", 35], ["too_fast", 30], ["bot_ua", 40], ["market_not_allowed", 40]] } },
    { name: "identity lookup failure → review, partial", world: { fail: ["identity"] }, floor: true, expect: { score: 0, band: "review", flags: [], partial: true } },
    { name: "protected terms failure → review, partial", world: { fail: ["terms"] }, floor: true, expect: { score: 0, band: "review", flags: [], partial: true } },
    { name: "velocity failure → review, partial", world: { fail: ["velocity"] }, floor: true, expect: { score: 0, band: "review", flags: [], partial: true } },
    { name: "settings failure → defaults, review, partial", input: { market: "DZ", phoneE164: null }, world: { fail: ["setting"] }, expect: { score: 40, band: "review", flags: [["market_not_allowed", 40]], partial: true } },
    { name: "trusted-creator failure is only a missing discount", input: { via: "app_new", existingUserId: "01JTRUSTEDCREATOR000000000", turnstile: "off" }, world: { fail: ["trusted"] }, expect: { score: 0, band: "fast", flags: [] } },
    { name: "an unexpected failure never throws", world: { fail: ["now"] }, floor: true, expect: { score: 0, band: "review", flags: [], partial: true } },
  ];
  check(FIXTURES.length >= 30 && FIXTURES.length <= 60, `30-60 golden fixtures (${FIXTURES.length})`);

  const thresholdsOf = (f: Fixture): Thresholds => band.thresholdsOrDefault(f.world?.setting?.thresholds ?? DEFAULT_SIGNUP.thresholds);
  const scored: { f: Fixture; s: Score; input: Input }[] = [];
  for (const f of FIXTURES) {
    const input: Input = { ...BASE, ...f.input };
    const calls: Calls = { mx: [], trusted: [], links: [], velocity: [] };
    const started = performance.now();
    let s: Score;
    // an unexpected failure is logged once (the error's name only, never the input); keep the run's output clean
    const logged: string[] = [];
    const consoleError = console.error;
    if (f.world?.fail?.includes("now")) console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
    try {
      s = await risk.scoreSignup(input, depsOf(f.world ?? {}, calls));
    } catch (err) {
      check(false, `${f.name}: scoreSignup threw (${err instanceof Error ? err.message : String(err)})`);
      continue;
    } finally {
      console.error = consoleError;
    }
    if (f.world?.fail?.includes("now")) check(logged.length === 1 && logged[0]!.startsWith("[signup-risk] score failed") && !logged[0]!.includes(input.email), `${f.name}: one log line, no input in it`);
    const took = performance.now() - started;
    scored.push({ f, s, input });
    const got = s.flags.map((x) => [x.code, x.points]);
    check(s.score === f.expect.score, `${f.name}: score ${s.score}, expected ${f.expect.score}`);
    check(s.band === f.expect.band, `${f.name}: band ${s.band}, expected ${f.expect.band}`);
    check(eq(got, f.expect.flags), `${f.name}: flags ${JSON.stringify(got)}, expected ${JSON.stringify(f.expect.flags)}`);
    check(s.signals.partial === (f.expect.partial ?? false), `${f.name}: partial ${s.signals.partial}`);
    for (const [code, ev] of Object.entries(f.expect.evidence ?? {})) {
      check(eq(s.flags.find((x) => x.code === code)?.evidence, ev), `${f.name}: ${code} evidence ${JSON.stringify(s.flags.find((x) => x.code === code)?.evidence)}`);
    }
    // the stored signals mirror the score and carry nothing raw (PL-03, attack case 8)
    check(s.signals.v === 1 && s.signals.band === s.band && eq(s.signals.flags, s.flags), `${f.name}: signals mirror the score`);
    check(s.score >= 0 && s.score <= 100 && Number.isInteger(s.score), `${f.name}: score is an integer 0-100`);
    check(typeof s.signals.ms === "number" && s.signals.ms >= 0, `${f.name}: signals.ms`);
    const json = JSON.stringify(s);
    const raw = [input.email, input.email.split("@")[0]!, input.ip ?? "", input.phoneE164 ?? "", (input.phoneE164 ?? "").replace("+", ""), input.ua ?? "", input.deviceId ?? "", input.name];
    for (const r of raw) if (r.length >= 4) check(!json.includes(r), `${f.name}: the score carries no raw "${r.slice(0, 12)}…"`);
    check(calls.links.every((l) => /^[0-9a-f]{64}$/.test(l.valueHash)), `${f.name}: the identity lookup sees hashes only`);
    if (f.maxMs) check(took < f.maxMs, `${f.name}: answered in ${Math.round(took)} ms (< ${f.maxMs})`);
    // MX is never looked up for the big providers or a disposable domain
    if (/@(gmail\.com|menara\.ma)$/.test(input.email) || f.expect.flags.some(([c]) => c === "disposable_email")) {
      check(calls.mx.length === 0, `${f.name}: no MX lookup`);
    }
    if (input.via !== "app_new") check(calls.trusted.length === 0, `${f.name}: the trusted-creator check runs only on /app/new`);
  }

  // the hashed links equal T2's rule: hmac(value, "identity:<kind>") over the normalised e-mail, the phone, the network
  // hash and a well-formed device marker (the DB harness pins them to src/lib/auth/identity.ts's rows)
  {
    const { links, netHash } = risk.identityLinksFor({ email: "S.Alma+x@GoogleMail.com", phoneE164: "+212612345634", ip: "196.200.12.7", deviceId: "AbCdEfGhIjKlMnOpQrStUv" });
    check(eq(links.map((l) => l.kind), ["email_norm", "phone", "net", "device"]), "identityLinksFor: the four kinds in order");
    check(links[0]!.valueHash === hashOf("email_norm", "salma@gmail.com"), "identityLinksFor: e-mail link over the normalised e-mail");
    check(netHash !== null && links[2]!.valueHash === hashOf("net", netHash), "identityLinksFor: net link over the network hash");
    const none = risk.identityLinksFor({ email: "a@b.ma", phoneE164: null, ip: "0.0.0.0", deviceId: "short" });
    check(eq(none.links.map((l) => l.kind), ["email_norm"]) && none.netHash === null, "identityLinksFor: no phone, no network for 0.0.0.0, no malformed device marker");
  }

  /* ---------------------------------------------------------------- */
  /* 2. bands, hold class, auto-approval, explanations                */
  /* ---------------------------------------------------------------- */

  const T = band.DEFAULT_THRESHOLDS;
  const bandTable: [number, import("./types").SignupBand][] = [[0, "fast"], [24, "fast"], [25, "review"], [59, "review"], [60, "hold"], [84, "hold"], [85, "reject_candidate"], [100, "reject_candidate"]];
  for (const [score, want] of bandTable) check(band.bandFor(score, [], T) === want, `bandFor(${score}) = ${want}`);
  check(band.bandFor(0, [{ code: "linked_banned" }], T) === "reject_candidate", "bandFor: linked_banned at 0 → reject_candidate");
  const custom = { fastLaneMax: 10, holdMin: 30, rejectCandidateMin: 50 };
  for (const [score, want] of [[10, "fast"], [11, "review"], [29, "review"], [30, "hold"], [49, "hold"], [50, "reject_candidate"]] as const) {
    check(band.bandFor(score, [], custom) === want, `bandFor(${score}) with 10/30/50 = ${want}`);
  }
  check(band.bandFor(30, [], { fastLaneMax: 40, holdMin: 30, rejectCandidateMin: 85 }) === "review", "bandFor: out-of-order thresholds use the defaults");
  check(eq([...band.HOLD_CLASS].sort(), ["bot_ua", "brand_exact", "dup_device", "linked_banned", "market_not_allowed", "offensive_term"]), "HOLD_CLASS is exactly the six PLA-§3.4.1 codes");
  check(eq(Object.keys(band.DEFAULT_SIGNUP_POINTS).sort(), [...band.SIGNUP_FLAG_CODES].sort()), "every flag code has default points");
  check(band.pointsFor("invite_code") === -20 && band.pointsFor("trusted_creator") === -30 && band.pointsFor("linked_banned") === 50, "negative and ban points");

  // autoApprove: every combination against the PLA-§3.4.1 sentence, written independently here
  const MODES: SignupMode[] = ["closed", "invite", "approval", "waitlist", "open"];
  const BANDS = ["fast", "review", "hold", "reject_candidate"] as const;
  const HUMAN = ["ok", "missing", "unverified", "off"] as const;
  let truthRows = 0;
  for (const mode of MODES)
    for (const b of BANDS)
      for (const hold of [false, true])
        for (const human of HUMAN)
          for (const trustedCreator of [false, true])
            for (const on of [false, true]) {
              const s = { band: b, flags: hold ? [{ code: "dup_device" as const }] : [{ code: "fast" as const }], signals: { inputs: { turnstile: human } } };
              const want =
                (mode === "open" || (mode === "approval" && trustedCreator && on)) && b === "fast" && !hold && (human === "ok" || (human === "off" && mode !== "open"));
              const got = band.autoApprove(mode, s, { trustedCreator, setting: { trustedCreatorAutoApprove: on } });
              truthRows++;
              if (got !== want) check(false, `autoApprove(${mode}, ${b}, hold ${hold}, ${human}, trusted ${trustedCreator}, setting ${on}) = ${got}`);
            }
  check(truthRows === 5 * 4 * 2 * 4 * 2 * 2, `autoApprove truth table: ${truthRows} rows`);
  const fastOk = { band: "fast" as const, flags: [], signals: { inputs: { turnstile: "ok" as const } } };
  const fastOff = { band: "fast" as const, flags: [], signals: { inputs: { turnstile: "off" as const } } };
  check(band.autoApprove("open", fastOk, { trustedCreator: false, setting: DEFAULT_SIGNUP }), "open + fast + Turnstile ok → auto-approved");
  check(!band.autoApprove("open", fastOff, { trustedCreator: false, setting: DEFAULT_SIGNUP }), "open + Turnstile off → refused");
  check(band.autoApprove("approval", fastOff, { trustedCreator: true, setting: DEFAULT_SIGNUP }), "approval + trusted creator (/app/new, no widget) → auto-approved (PD31)");
  check(!band.autoApprove("approval", fastOk, { trustedCreator: false, setting: DEFAULT_SIGNUP }), "approval without a trusted creator → never");
  for (const mode of ["closed", "invite", "waitlist"] as const) check(!band.autoApprove(mode, fastOk, { trustedCreator: true, setting: DEFAULT_SIGNUP }), `${mode} never auto-approves`);

  // per fixture: the Turnstile flags only outside approval / open; auto-approval agrees with the hold class
  for (const { f, s } of scored) {
    if (f.mode === "approval" || f.mode === "open") check(!s.flags.some((x) => x.code === "turnstile_missing" || x.code === "turnstile_unverified"), `${f.name}: no Turnstile flag in ${f.mode} mode`);
    if (s.flags.some((x) => band.HOLD_CLASS.has(x.code))) for (const mode of MODES) check(!band.autoApprove(mode, s, { trustedCreator: true, setting: DEFAULT_SIGNUP }), `${f.name}: a hold-class flag never auto-approves (${mode})`);
  }

  // explainBand vs bandFor on every fixture (PL-04 / PD52)
  let pivots = 0;
  for (const { f, s, input } of scored) {
    const t = thresholdsOf(f);
    const e = band.explainBand(s, t);
    check(e.band === band.bandFor(s.score, s.flags, t), `${f.name}: explainBand's band = bandFor`);
    if (!f.floor) check(e.band === s.band, `${f.name}: explainBand's band = the stored band`);
    check(eq(e.holds, s.flags.filter((x) => band.HOLD_CLASS.has(x.code)).map((x) => x.code)), `${f.name}: holds`);
    const lower = (bw: string) => band.BAND_ORDER[bw as keyof typeof band.BAND_ORDER];
    if (e.pivot) {
      pivots++;
      const at = s.flags.findIndex((x) => x.code === e.pivot!.code);
      const rest = s.flags.filter((_, j) => j !== at);
      check(band.bandFor(band.scoreOf(rest), rest, t) === e.pivot.bandWithout, `${f.name}: removing ${e.pivot.code} re-scores to ${e.pivot.bandWithout}`);
      check(lower(e.pivot.bandWithout) < lower(e.band), `${f.name}: the pivot lowers the band`);
      for (let j = 0; j < s.flags.length; j++) {
        const r = s.flags.filter((_, k) => k !== j);
        check(lower(band.bandFor(band.scoreOf(r), r, t)) >= lower(e.pivot.bandWithout), `${f.name}: no single removal lowers the band further than the pivot`);
      }
      if (f.without) {
        const again = await risk.scoreSignup({ ...input, ...f.without }, depsOf(f.world ?? {}, { mx: [], trusted: [], links: [], velocity: [] }));
        check(again.band === e.pivot.bandWithout, `${f.name}: the input without the pivot's signal scores ${again.band} (= bandWithout ${e.pivot.bandWithout})`);
      }
    } else {
      for (let j = 0; j < s.flags.length; j++) {
        const r = s.flags.filter((_, k) => k !== j);
        check(lower(band.bandFor(band.scoreOf(r), r, t)) >= lower(e.band), `${f.name}: no pivot, so no single removal lowers the band`);
      }
    }
    if (e.band === "fast") check(e.marginToLower === 0, `${f.name}: marginToLower 0 in the fast lane`);
    if (e.band === "review") check(e.marginToLower === s.score - t.fastLaneMax, `${f.name}: marginToLower to the fast lane`);
    check(band.explainFlag(s.flags[0] ?? { code: "fast" }).startsWith("console.risk."), `${f.name}: explainFlag key`);
  }
  check(pivots >= 10, `explainBand found a pivot on ${pivots} fixtures`);
  {
    const banned = band.explainBand({ score: 55, flags: [{ code: "dup_email_norm", points: 25 }, { code: "linked_banned", points: 50 }, { code: "invite_code", points: -20 }] }, T);
    check(banned.band === "reject_candidate" && banned.pivot?.code === "linked_banned" && banned.pivot.bandWithout === "fast" && banned.marginToLower === 0, "explainBand: linked_banned is the pivot of a forced band, margin 0");
    const two = band.explainBand({ score: 80, flags: [{ code: "disposable_email", points: 35 }, { code: "brand_exact", points: 40 }, { code: "phone_market_mismatch", points: 5 }] }, T);
    check(two.band === "hold" && two.pivot?.code === "brand_exact" && two.pivot.bandWithout === "review" && two.marginToLower === 21, "explainBand: on a tie the bigger flag is the pivot; margin to review");
  }

  /* ---------------------------------------------------------------- */
  /* 3. normalisation                                                 */
  /* ---------------------------------------------------------------- */

  const emailNorm: [string, string][] = [
    ["Salma.Benali@Gmail.com", "salmabenali@gmail.com"],
    ["s.a.l.m.a+promo@googlemail.com", "salma@gmail.com"],
    ["karim+shop@menara.ma", "karim@menara.ma"],
    ["k.a.r.i.m@menara.ma", "k.a.r.i.m@menara.ma"],
    ["  ADMIN@Example.MA ", "admin@example.ma"],
    ["+tag@gmail.com", "+tag@gmail.com"],
    ["no-at-sign", "no-at-sign"],
  ];
  for (const [input, want] of emailNorm) check(norm.normalizeEmailForIdentity(input) === want, `normalizeEmailForIdentity(${input}) = ${want}`);
  check(eq(norm.splitEmail("Salma@Gmail.COM"), { local: "salma", domain: "gmail.com" }) && norm.splitEmail("x@") === null && norm.splitEmail("@x.ma") === null, "splitEmail");
  for (const v of ["face-b00k", "paypa1-shop", "vvhatsapp-ma", "goog1e-store", "app1e", "rnetal", "Cash$Plus", "visa-ma", "Nour Argan"]) {
    check(eq([...norm.brandFoldings(v)].sort(), [...handles.brandFoldings(v)].sort()), `brandFoldings("${v}") = handles.ts`);
  }
  check(norm.brandTokens("face-b00k shop").some((r) => r.joined === "facebookshop" && eq(r.tokens, ["face", "book", "shop"])), "brandTokens: tokens and the joined form");
  check(norm.brandTokens("اتصـــالات، المغرب").some((r) => eq(r.tokens, ["اتصالات", "المغرب"])), "brandTokens: tatweel removed, Arabic comma separates");
  check(norm.brandTokens("مَتْجَر نُور").some((r) => eq(r.tokens, ["متجر", "نور"])), "brandTokens: Arabic diacritics removed");
  const termCases: [string, { term: string; match: "exact" | "substring" | "skeleton" }, "exact" | "near" | null][] = [
    ["meta-support", { term: "meta", match: "exact" }, "exact"],
    ["metal-art", { term: "meta", match: "exact" }, null],
    ["visage", { term: "visa", match: "exact" }, null],
    ["CIH Bank Vérification", { term: "cih", match: "exact" }, "exact"],
    ["Mybankshop", { term: "bank", match: "substring" }, "near"],
    ["face-b00k-shop", { term: "facebook", match: "substring" }, "exact"],
    ["thefacebookshop", { term: "facebook", match: "substring" }, "near"],
    ["Banque Populaire", { term: "banque populaire", match: "exact" }, "exact"],
    ["ctmexpress", { term: "ctm", match: "substring" }, null],
    ["Store Gen Pro", { term: "storegen", match: "substring" }, "exact"],
    ["x", { term: "x", match: "exact" }, null],
  ];
  for (const [value, term, want] of termCases) check(norm.matchBrandTerm(norm.brandTokens(value), term) === want, `matchBrandTerm("${value}", ${term.term}/${term.match}) = ${want}`);

  /* ---------------------------------------------------------------- */
  /* 4. masking (PLA-§7.2, PD35, PD69)                                */
  /* ---------------------------------------------------------------- */

  const phones: [string, string][] = [
    ["+212612345634", "+212 6•• ••• •34"],
    ["+33612345678", "+33 6•• ••• •78"],
    ["+14155552671", "+1 4•• ••• ••71"],
    ["+971501234567", "+971 5•• ••• •67"],
    ["+79161234567", "+7 9•• ••• ••67"],
    ["0612345634", "0•• ••• ••34"],
    ["+2126", "••••••"],
    ["", "••••••"],
  ];
  for (const [p, want] of phones) check(mask.maskPhoneGrouped(p) === want, `maskPhoneGrouped(${p}) = "${want}" (got "${mask.maskPhoneGrouped(p)}")`);
  // maskPhone keeps C0a's format until CCR r1-p1-2 flips PHONE_FORMAT together with the orders selftest's pins
  const livePhone = (e164: string) => (mask.PHONE_FORMAT === "grouped" ? mask.maskPhoneGrouped(e164) : null);
  const c0aPhones: [string, string][] = [
    ["+212612345634", "+2126 ••••••34"],
    ["+212600000777", "+2126 ••••••77"],
    ["+2126", "••••••"],
  ];
  for (const [p, want] of c0aPhones) check(mask.maskPhone(p) === (livePhone(p) ?? want), `maskPhone(${p}) follows PHONE_FORMAT "${mask.PHONE_FORMAT}" (got "${mask.maskPhone(p)}")`);
  check(!mask.maskPhone("+212612345634").includes("1234") && !mask.maskPhoneGrouped("+212612345634").includes("1234"), "both phone formats hide the middle digits");
  const emails: [string, string][] = [
    ["salma.b@gmail.com", "s•••@gmail.com"],
    ["a@x.ma", "a•••@x.ma"],
    ["Karim@Menara.MA", "K•••@menara.ma"],
    ["no-at-sign", "•••"],
    ["@x.ma", "•••"],
    ["x@", "•••"],
  ];
  for (const [e, want] of emails) check(mask.maskEmail(e) === want, `maskEmail(${e}) = "${want}" (got "${mask.maskEmail(e)}")`);
  const names: [string, string][] = [
    ["Salma Benali", "Salma B."],
    ["Salma El Idrissi", "Salma I."],
    ["Salma", "S•••"],
    ["A", "A•••"],
    ["   ", "•••"],
    ["سلمى بنعلي", "سلمى ب."],
  ];
  for (const [n, want] of names) check(mask.maskName(n) === want, `maskName(${n}) = "${want}" (got "${mask.maskName(n)}")`);
  check(mask.maskAddress("Casablanca") === "Casablanca · address hidden" && mask.maskAddress(null) === "Address hidden" && mask.maskAddress("  ") === "Address hidden", "maskAddress");
  const ips: [string | null, string][] = [
    ["196.200.12.7", "196.200.•.•"],
    ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "2001:db8:85a3::•"],
    ["2001:db8::1", "2001:db8:0::•"],
    ["fe80::1%eth0", "fe80:0:0::•"],
    ["::ffff:196.200.1.2", "196.200.•.•"],
    ["::1", "0:0:0::•"],
    ["999.1.1.1", "•••"],
    ["1::2::3", "•••"],
    ["hello", "•••"],
    [null, "•••"],
  ];
  for (const [ip, want] of ips) check(mask.maskIp(ip) === want, `maskIp(${ip}) = "${want}" (got "${mask.maskIp(ip)}")`);
  const contact = { email: "canary.seller@example.test", phone: "+212600000777" };
  check(eq(mask.sellerContact("super_admin", contact), contact) && eq(mask.sellerContact("admin", contact), contact), "sellerContact: in full for admin+");
  for (const role of ["support", "analyst"] as const) {
    const c = mask.sellerContact(role, contact);
    check(c.email === "c•••@example.test" && c.phone === mask.maskPhone(contact.phone), `sellerContact: masked for ${role}`);
    check(mask.sellerContact(role, { email: contact.email, phone: null }).phone === null, `sellerContact: no phone stays null (${role})`);
  }
  const row = { id: "01JORDER000000000000000000", name: "Canaryname Zzz", phone: "+212600000777", address: "Rue Canary 77", city: "Casablanca", landmark: "near canary", note: "canary-note-77", totalCents: 19_900 };
  const scope = (kind: string) => ({ storeId: "01JSTOREA00000000000000000", kind }) as unknown as import("@/lib/tenancy/types").StoreScope;
  for (const kind of ["member", "system", "platform", "public"]) check(mask.maskIfImpersonation(scope(kind), row) === row, `maskIfImpersonation: identity for ${kind}`);
  const masked = mask.maskIfImpersonation(scope("impersonation"), row);
  check(masked !== row && masked.city === "Casablanca" && masked.id === row.id && masked.totalCents === 19_900, "maskIfImpersonation: masks, keeps the city and the other fields");
  check(masked.name === "Canaryname Z." && masked.phone === mask.maskPhone(row.phone) && masked.address === "Casablanca · address hidden" && masked.landmark === "Hidden" && masked.note === "Hidden", "maskIfImpersonation: every customer field masked");
  const mjson = JSON.stringify(masked);
  for (const canary of ["Zzz", "600000777", "Rue Canary", "near canary", "canary-note"]) check(!mjson.includes(canary), `maskIfImpersonation: no "${canary}" left`);
  const nulls = mask.maskCustomerFields({ name: null, phone: null, address: null, city: null, landmark: null, note: null });
  check(Object.values(nulls).every((v) => v === null), "maskCustomerFields: null stays null");

  /* ---------------------------------------------------------------- */
  /* 5. markdown-lite (PLA-§13.6)                                     */
  /* ---------------------------------------------------------------- */

  const isEl = (n: unknown): n is ReactElement<Record<string, unknown>> => typeof n === "object" && n !== null && "type" in n && "props" in n;
  const elements = (n: ReactNode): ReactElement<Record<string, unknown>>[] => {
    if (Array.isArray(n)) return n.flatMap(elements);
    if (!isEl(n)) return [];
    return [n, ...elements(n.props.children as ReactNode)];
  };
  const textOf = (n: ReactNode): string => (Array.isArray(n) ? n.map(textOf).join("") : typeof n === "string" || typeof n === "number" ? String(n) : isEl(n) ? textOf(n.props.children as ReactNode) : "");
  const types = (n: ReactNode) => elements(n).map((e) => (typeof e.type === "string" ? e.type : "#"));
  const nodeOf = (src: string, opts?: Parameters<typeof md.renderMarkdownLite>[1]) => md.renderMarkdownLite(src, opts);

  const hostile = nodeOf('# Terms\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[click](javascript:alert(1)) [x](JAVASCRIPT:alert(1)) [y](data:text/html,1) [z](http://plain.ma)');
  const hostileEls = elements(hostile);
  check(!hostileEls.some((e) => ["script", "img", "a", "iframe"].includes(String(e.type))), "markdown: no script, img or link element from hostile input");
  check(!hostileEls.some((e) => "dangerouslySetInnerHTML" in e.props), "markdown: never dangerouslySetInnerHTML");
  check(textOf(hostile).includes("<script>alert(1)</script>") && textOf(hostile).includes("click"), "markdown: the hostile text is shown as text, a refused link keeps its words");
  const link = elements(nodeOf("See [the form](https://example.ma/form?a=1).")).find((e) => e.type === "a");
  check(!!link && link.props.href === "https://example.ma/form?a=1" && link.props.rel === "noopener noreferrer nofollow" && link.props.target === "_blank", "markdown: an https link with rel and target");
  check(eq(types(nodeOf("**bold *it* bold**")), ["#", "p", "strong", "em"]), "markdown: strong > em");
  check(eq(types(nodeOf("*a **b** c*")), ["#", "p", "em", "strong"]), "markdown: em > strong");
  check(eq(types(nodeOf("***x***")), ["#", "p", "strong", "em"]) && textOf(nodeOf("***x***")) === "x", "markdown: ***x*** = strong(em(x))");
  check(textOf(nodeOf("2 * 3 * 4 and a ** b")) === "2 * 3 * 4 and a ** b", "markdown: spaced stars stay text");
  check(textOf(nodeOf("\\*not italic\\*")) === "*not italic*" && !types(nodeOf("\\*not italic\\*")).includes("em"), "markdown: escaped markers");
  check(eq(types(nodeOf("# One\n## Two\n### Three\n#### Four")), ["#", "h2", "h3", "h4", "p"]), "markdown: # → h2 by default, #### is text");
  check(eq(types(nodeOf("# One", { headingBase: 1 })), ["#", "h1"]), "markdown: headingBase 1");
  check(eq(types(nodeOf("- a\n- b\n\n1. c\n2. d")), ["#", "ul", "li", "li", "ol", "li", "li"]), "markdown: lists");
  check(elements(nodeOf("3. c\n4. d")).find((e) => e.type === "ol")?.props.start === 3, "markdown: an ordered list keeps its start");
  check(eq(types(nodeOf("line one\nline two")), ["#", "p", "br"]), "markdown: a single line break is kept");
  check(textOf(nodeOf("`<b>code</b>`")) === "<b>code</b>" && types(nodeOf("`x`")).includes("code"), "markdown: inline code is text");
  check(textOf(nodeOf("Hello {{store.name}}")) === "Hello {{store.name}}" && !types(nodeOf("Hello {{store.name}}")).includes("span"), "markdown: placeholders are text without opts");
  const filled = nodeOf("Hello {{store.name}} {{evil}}", { placeholders: { fields: ["store.name"], value: (f) => (f === "store.name" ? "Nour" : null) } });
  const field = elements(filled).find((e) => e.type === "span");
  check(!!field && field.props["data-field"] === "store.name" && textOf(filled) === "Hello Nour {{evil}}", "markdown: an allowed placeholder renders, an unknown one stays text");
  check(md.toPlainText("# Title\nSome **bold** [link](https://x.ma) {{f}}\n\n- a\n- b") === "Title\nSome bold link {{f}}\n- a\n- b", "toPlainText");
  {
    const started = performance.now();
    md.renderMarkdownLite(`${"**a *b [c `d {{e ".repeat(8_000)}`);
    md.renderMarkdownLite("x".repeat(250_000));
    check(performance.now() - started < 1_500, `markdown: pathological input renders in ${Math.round(performance.now() - started)} ms`);
  }

  /* ---------------------------------------------------------------- */
  /* 6. cursor (PLA-§4.5)                                             */
  /* ---------------------------------------------------------------- */

  const token = cursor.encodeCursor(["2026-10-28T09:00:00.000Z", "01JSTOREA00000000000000000"]);
  check(eq(cursor.decodeCursor(token), ["2026-10-28T09:00:00.000Z", "01JSTOREA00000000000000000"]), "cursor: round trip");
  check(eq(cursor.decodeCursor(cursor.encodeCursor([42, null, true])), [42, null, true]), "cursor: numbers, null, booleans");
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ k: ["2099-01-01T00:00:00.000Z", "01JSTOREB00000000000000000"] })).toString("base64url");
  const bad = [
    `${forged}.${sig}`,
    `${body}.${sig!.slice(0, 15)}${sig!.endsWith("0") ? "1" : "0"}`,
    `${body!.slice(0, -2)}AA.${sig}`,
    `${body}`,
    "",
    "not a cursor",
    `${body}.${sig}.extra`,
    `${"A".repeat(600)}.${sig}`,
  ];
  for (const b of bad) check(cursor.decodeCursor(b) === null, `cursor: tampered "${b.slice(0, 20)}…" → null`);
  check(cursor.decodeCursor(null) === null && cursor.decodeCursor(undefined) === null, "cursor: absent → null");
  let threw = false;
  try {
    cursor.encodeCursor([{ nested: true } as unknown as string]);
  } catch {
    threw = true;
  }
  check(threw, "cursor: a non-primitive value is refused");

  /* ---------------------------------------------------------------- */
  /* 7. reasons and risk copy                                         */
  /* ---------------------------------------------------------------- */

  const en = enConsole as Record<string, string>;
  const fr = frConsole as Record<string, string | undefined>;
  const ar = arConsole as Record<string, string | undefined>;
  const varsOf = (template: string) => new Set([...template.matchAll(/\{(\w+)(?:,\s*plural)?/g)].map((m) => m[1]!));
  check(reasons.STORE_STATUS_REASONS.length === new Set(reasons.STORE_STATUS_REASONS).size && reasons.STORE_STATUS_REASONS.length === 27, `27 distinct reason codes (${reasons.STORE_STATUS_REASONS.length})`);
  for (const code of reasons.STORE_STATUS_REASONS) {
    const key = reasons.reasonLabelKey(code);
    check(typeof en[key] === "string" && en[key]!.length > 0, `${key} (en)`);
    check(typeof fr[key] === "string" && typeof ar[key] === "string", `${key} (fr, ar)`);
    check(reasons.isStoreStatusReason(code) && code.length <= 40, `${code}: fits stores.status_reason`);
  }
  check(!reasons.isStoreStatusReason("nope") && reasons.isReasonFor("restrict", "fake_orders") && !reasons.isReasonFor("restrict", "phishing"), "isStoreStatusReason / isReasonFor");
  check(reasons.reasonNeedsNote("other") && !reasons.reasonNeedsNote("phishing"), "an `other` reason needs a note");
  const shellReasons = Object.keys(enAll).filter((k) => k.startsWith("shell.status_reason."));
  if (shellReasons.length === 0) skips.push("shell.status_reason.<code>: P2's shell catalog has no such key on this branch yet (checked at the P1 merge)");
  else for (const code of reasons.STORE_STATUS_REASONS) check(shellReasons.includes(reasons.reasonSentenceKey(code)), `${reasons.reasonSentenceKey(code)} (P2's catalog)`);

  // every flag code has its console.risk text in ar / fr / en, with the same placeholders, each one a key the scorer's
  // evidence carries ({field} is rendered from console.risk.field.*)
  const evidenceKeys = new Map<string, Set<string>>();
  for (const { s } of scored) for (const flag of s.flags) for (const k of Object.keys(flag.evidence ?? {})) (evidenceKeys.get(flag.code) ?? evidenceKeys.set(flag.code, new Set()).get(flag.code)!).add(k);
  for (const code of band.SIGNUP_FLAG_CODES) {
    const key = `console.risk.${code}`;
    const tpl = en[key];
    check(typeof tpl === "string", `${key} (en)`);
    if (typeof tpl !== "string") continue;
    for (const [loc, cat] of [["fr", fr], ["ar", ar]] as const) check(typeof cat[key] === "string" && eq([...varsOf(cat[key]!)].sort(), [...varsOf(tpl)].sort()), `${key} (${loc}): same placeholders as en`);
    if (code !== "mixed_script") for (const v of varsOf(tpl)) check(evidenceKeys.get(code)?.has(v) === true, `${key}: {${v}} is evidence the scorer stores`);
  }
  for (const f of ["store_name", "handle", "email"]) check(!!en[`console.risk.field.${f}`] && !!fr[`console.risk.field.${f}`] && !!ar[`console.risk.field.${f}`], `console.risk.field.${f}`);
  for (const [loc, cat] of [["en", en], ["fr", fr], ["ar", ar]] as const) {
    for (const [k, v] of Object.entries(cat)) if (/^console\.(risk|reason)\./.test(k)) check(!/[\u2013\u2014]/.test(v ?? "") && !/\bStep \d/i.test(v ?? ""), `${k} (${loc}): no en/em dash, no "Step n"`);
  }

  /* ---------------------------------------------------------------- */
  /* 8. PlatformSettingSchema (PLA-§2.4, TN-04)                       */
  /* ---------------------------------------------------------------- */

  const p = PlatformSettingSchema.safeParse({});
  check(p.success, "PlatformSettingSchema parses {}");
  if (p.success) {
    const sg = p.data.signup;
    check(sg.pendingMediaMiBBeforeSubmit === 20 && sg.pendingMediaMiB === 100 && sg.pendingMediaTotalMiB === 5_000 && sg.pendingStoresPerDay === 50, "the rev 3 ceilings default to 20 / 100 / 5,000 / 50");
    check(eq(sg.thresholds, { fastLaneMax: 24, holdMin: 60, rejectCandidateMin: 85 }) && eq(sg.weights, {}) && sg.mode === null && sg.trustedCreatorAutoApprove, "signup defaults");
    check(p.data.brand.name === "Store Gen" && p.data.health.snoozeDays === 7 && p.data.lifecycle.armSeconds === 5 && p.data.lifecycle.cooldownMinutes === 10 && p.data.analytics.k === 5, "other defaults");
  }
  const refused = (v: unknown) => !PlatformSettingSchema.safeParse(v).success;
  check(refused({ signup: { pendingMediaMiBBeforeSubmit: 150, pendingMediaMiB: 100 } }), "refuses pendingMediaMiBBeforeSubmit > pendingMediaMiB");
  check(!refused({ signup: { pendingMediaMiBBeforeSubmit: 100, pendingMediaMiB: 100 } }), "accepts equal tiers");
  check(refused({ signup: { pendingMediaMiBBeforeSubmit: 30, pendingMediaMiB: 20 } }), "refuses a cap after submit below the cap before");
  check(refused({ signup: { thresholds: { fastLaneMax: 60, holdMin: 60, rejectCandidateMin: 85 } } }) && refused({ signup: { thresholds: { fastLaneMax: 20, holdMin: 90, rejectCandidateMin: 85 } } }), "refuses thresholds out of order");
  check(refused({ signup: { pendingStoresPerDay: 0 } }) && refused({ signup: { pendingMediaTotalMiB: 100 } }) && refused({ analytics: { k: 4 } }), "refuses values outside the ceilings");
  check(refused({ signup: { weights: { too_fast: 101 } } }) && !refused({ signup: { weights: { too_fast: -50 } } }), "weights within -50 … 100");

  /* ---------------------------------------------------------------- */
  /* 9. FEATURE_PROOFS (PD77)                                         */
  /* ---------------------------------------------------------------- */

  check(eq(Object.keys(FEATURE_PROOFS).sort(), [...R1_FEATURE_IDS].sort()), "FEATURE_PROOFS has exactly the R1 ids of PLA-§1");
  for (const id of R1_FEATURE_IDS) {
    const proofs = FEATURE_PROOFS[id];
    check(proofs.length > 0, `${id}: at least one proof`);
    for (const entry of proofs) {
      const problem = proofProblem(entry);
      check(problem === null, `${id}: "${entry}" ${problem ?? ""}`);
    }
  }
  // the self-check of the checker: wrong entries are caught
  for (const wrong of ["test:db#1", "test:platform-db#21", "test:tenancy", "e2e#22", "qa:wow-demo@3:10", "test:platform#1", "qa:wow-demo"]) check(proofProblem(wrong) !== null, `proofProblem refuses "${wrong}"`);
  check(Object.keys(PLATFORM_DB_CASES).length === 20 && Object.keys(ATTACK_CASES).length === 20 && Object.keys(E2E_STEPS).length === 21, "the PLA-§O lists: 20 DB cases, 20 attack cases, 21 e2e steps");
  check(Object.values(E2E_STEPS).every((s) => s.scripts.every((x) => /^qa:/.test(x))), "every e2e step names qa: scripts");

  /* ---------------------------------------------------------------- */
  /* 10. data and pinned copies                                       */
  /* ---------------------------------------------------------------- */

  const list = disposable.domains as string[];
  check(list.length >= 100 && eq(list, [...new Set(list)].sort()) && list.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), `disposable-domains.json: ${list.length} sorted, unique, lower-case domains`);
  check(disposable.license === "CC0-1.0", "disposable-domains.json: CC0");
  check(risk.isDisposableDomain("yopmail.com") && risk.isDisposableDomain("a.b.mailinator.com") && !risk.isDisposableDomain("gmail.com") && !risk.isDisposableDomain("mailinator.com.evil.ma"), "isDisposableDomain: parents, never a suffix trick");
  for (const d of risk.MX_SKIP_DOMAINS) check(!risk.isDisposableDomain(d), `${d}: a large provider is not disposable`);

  const pinned = (file: string, re: RegExp) => re.exec(source(file))?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const botMine = pinned("src/lib/platform/signup-risk.ts", /const BOT_UA = (\/.*\/i);/);
  const botTheirs = pinned("src/lib/orders/risk.ts", /const BOT_UA = (\/.*\/i);/);
  check(botMine !== null && botMine === botTheirs, "BOT_UA: the copy equals src/lib/orders/risk.ts");
  const uaRe = /function describeUserAgent\(ua: string \| null\): string \{([\s\S]*?)\n\}/;
  const uaMine = pinned("src/lib/platform/signup-risk.ts", uaRe);
  const uaTheirs = pinned("src/lib/admin-data/security.ts", uaRe);
  check(uaMine !== null && uaMine === uaTheirs, "describeUserAgent: the copy equals src/lib/admin-data/security.ts");

  const ms = Math.round(performance.now() - t0);
  for (const s of skips) console.log(`  SKIP ${s}`);
  if (failures > 0) {
    console.error(`✗ platform selftest: ${failures} of ${checks} checks failed (${ms} ms)`);
    process.exit(1);
  }
  console.log(`✓ platform selftest: all ${checks} checks passed, ${FIXTURES.length} golden signup fixtures, ${skips.length} skipped (${ms} ms)`);
}

if (/[\\/]src[\\/]lib[\\/]platform[\\/]selftest\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((err: unknown) => {
    console.error("✗ platform selftest crashed:", err);
    process.exit(1);
  });
}
