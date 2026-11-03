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
 *   - two copies pinned to their sources (the BOT_UA pattern, `describeUserAgent`) until CCR r1-p1-1 shares them;
 *   - notification kinds (PL-13): every PLA-§18.2 kind registered, every registered kind's vars a `z.object` without a
 *     phone / name / address / email / note key, tenant kinds titled and bodied in ar / fr / en with the same
 *     placeholders (each a var of the kind), staff kinds titled in en, the code labels per locale, the link rule
 *     fixtures of PLA-§O.1 rev 4 and each kind's link builder, the R1.0 senders' vars, dates shown with Latin digits;
 *   - flags (PL-12): the platform declarations, `resolveFlag`'s order, a 20 % rollout stable per store, an expired
 *     override ignored;
 *   - the brand match (PD70: exact / near / none, an Arabic term, an offensive term never named, the 200 cap) and the
 *     abuse report input (reason enum, the 2,000 cap, the same-host path rule);
 *   - Store Health on the console side (step 3): `staleAfterMin` and the measured cycle, every PLA-§15.2 alarm code with
 *     its `console.attention.*` sentence and `console.alarm.*` label, `alarmsFrom` fixtures and the run state (raised
 *     once, recovered silently, the hour key), the live brand scan (store name / SEO title / policy text / nowhere, a
 *     5-character substring never live, the weekly key hashed), the console flags per code;
 *   - the queue and the lifecycle sheet (step 4): the tabs a row is listed in (snooze re-entry at query time, the hold
 *     class out of the Fast lane), the counts, the SLA tile, keyset paging and search, the snooze times (platform time
 *     zone, a DST change), the decisions' inputs, the grant check (`take_orders_locked`, a boost ≤ 90 days), every
 *     console edge of lifecycle-rules.ts against T1's ALLOWED_TRANSITIONS (permission, ↑, audit, notification, dates),
 *     the cooldown on a fake clock, `storeSees` per edge and locale, the console keys every refusal names, and the
 *     sign-up admin chips;
 *   - plans, flags, staff, legal and the domain move (step 5): `PlanImpact.examples` (≤ 20, highest usage first), the
 *     shielded stores, the impact and effective sentences (PD58, the pending caps), the editor's groups and the patch
 *     refusals (`take_orders_locked`, later releases), the entitlements job's clocks; the kill switches' typed words,
 *     states, copy and banners, the flag editor's validation and the rules summary; the staff invite states and the
 *     last-super_admin invariant; the legal placeholders, the line diff, the acceptance locale order, the red lines and
 *     the seeded drafts (every kind × locale, no DPA, nothing invented); the domain checklist (the env step says
 *     restart) and the checks that answer without a network call.
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
  const notifyKinds = await import("./notify-kinds");
  const notifyRegistry = await import("@/lib/notify/registry");
  const flagEval = await import("./flag-eval");
  const flagRegistry = await import("@/lib/flags/registry");
  const brandMatch = await import("./brand-match");
  const abuseInput = await import("./abuse-input");
  const { USAGE_METRICS } = await import("@/lib/tenancy/entitlement-keys");
  const { messages: frAll } = await import("@/lib/i18n/admin/fr");
  const { messages: arAll } = await import("@/lib/i18n/admin/ar");
  const { z } = await import("zod");
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

  /* ---------------------------------------------------------------- */
  /* 11. notification kinds (PLA-§18, PL-13)                          */
  /* ---------------------------------------------------------------- */

  type Catalog = Readonly<Record<string, string | undefined>>;
  const catalogs: Record<"en" | "fr" | "ar", Catalog> = { en: enAll as Catalog, fr: frAll as Catalog, ar: arAll as Catalog };
  const KINDS = notifyRegistry.NOTIFICATION_KINDS;
  const kindNames = KINDS.map((k) => k.kind);
  check(new Set(kindNames).size === kindNames.length, "notification kinds: every name once across the tracks");
  /** PLA-§18.2 (and the R1.0 kind T1 already sends: signup.reopened) */
  const PLATFORM_KINDS = [
    "signup.received", "signup.info_requested", "signup.approved", "signup.rejected", "signup.reopened",
    "store.restricted", "store.suspended", "store.restored", "store.closed", "store.reopened", "store.deletion_scheduled", "store.deletion_cancelled",
    "store.impersonation_started", "store.impersonation_ended", "store.export_by_platform",
    "request.answered", "plan.changed", "plan.boost_granted", "plan.boost_ending", "quota.80", "quota.100", "health.issue_new",
    "member.joined", "invite.accepted", "member.role_changed", "member.suspended",
    "security.2fa_required", "user.2fa_reset", "user.password_reset", "legal.updated", "staff.message",
    "staff.signup_new", "staff.signup_hold", "staff.info_answered", "staff.appeal", "staff.request",
    "staff.purge_requested", "staff.purge_confirmed", "staff.super_admin_requested", "staff.alarm", "staff.kill_changed",
    "staff.mention", "staff.impersonation_started", "staff.abuse_report", "staff.signup_capped",
  ];
  for (const name of PLATFORM_KINDS) check(kindNames.includes(name), `${name}: registered (PLA-§18.2)`);
  check(notifyRegistry.notificationKind("staff.signup_new")?.batch?.windowMin === 60, "staff.signup_new is batched hourly");

  for (const k of KINDS) {
    const keys = notifyKinds.varKeysOf(k.vars);
    check(keys !== null, `${k.kind}: vars is a z.object`);
    const banned = (keys ?? []).filter((key) => notifyKinds.isBannedVarKey(key));
    check(banned.length === 0, `${k.kind}: no vars key named phone, name, address, email or note (${banned.join(", ")})`);
    for (const key of Object.keys(notifyKinds.labelsOf(k))) check((keys ?? []).includes(key), `${k.kind}: label for a declared var (${key})`);
    const locales = k.tenant ? (["en", "fr", "ar"] as const) : (["en"] as const);
    for (const part of ["title", "body"] as const) {
      const key = `notify.${k.kind}.${part}`;
      const ref = catalogs.en[key];
      // a staff kind needs its English title; a tenant kind its title and body in every locale
      if (part === "body" && !k.tenant && ref === undefined) continue;
      for (const loc of locales) check(typeof catalogs[loc][key] === "string" && catalogs[loc][key]!.length > 0, `${key}: ${loc}`);
      if (ref === undefined) continue;
      const want = notifyKinds.placeholdersOf(ref);
      check(want.every((p) => (keys ?? []).includes(p)), `${key}: every placeholder is a var of the kind (${want.join(", ")})`);
      for (const loc of locales) {
        const text = catalogs[loc][key];
        if (text !== undefined) check(eq(notifyKinds.placeholdersOf(text), want), `${key}: ${loc} has the same placeholders as en`);
      }
    }
  }
  // the code labels the kinds name, in every locale of the kinds that use them
  const labelSets: [prefix: string, codes: readonly string[], locales: readonly ("en" | "fr" | "ar")[]][] = [
    ["notify.reason", reasons.STORE_STATUS_REASONS, ["en", "fr", "ar"]],
    ["notify.visit_reason", ["onboarding", "ticket", "abuse_review", "bug", "other"] satisfies import("@/lib/tenancy/types").ImpersonationReason[], ["en", "fr", "ar"]],
    ["notify.request_kind", ["signup", "reopen", "go_live", "plan_change", "limit_raise", "mode_change", "domain"], ["en", "fr", "ar"]],
    ["notify.outcome", ["granted", "declined"], ["en", "fr", "ar"]],
    ["notify.metric", Object.entries(USAGE_METRICS).filter(([, d]) => d.limit !== null).map(([m]) => m), ["en", "fr", "ar"]],
    ["notify.legal_kind", ["tos", "privacy", "aup", "dpa"], ["en", "fr", "ar"]],
    ["notify.abuse_reason", abuseInput.ABUSE_REASONS, ["en"]],
  ];
  for (const [prefix, codes, locales] of labelSets) {
    const missing = codes.flatMap((code) => locales.filter((loc) => typeof catalogs[loc][`${prefix}.${code}`] !== "string").map((loc) => `${code}/${loc}`));
    check(missing.length === 0, `${prefix}.*: a label per code (${missing.join(", ")})`);
  }
  // no dashes or "Step n" in this file's copy (PLA-§N.1, core §I.8 rule 8)
  for (const [loc, cat] of Object.entries(catalogs)) {
    for (const [key, text] of Object.entries(cat)) {
      if (!key.startsWith("notify.") || typeof text !== "string") continue;
      check(!/[–—]|\bStep \d/.test(text), `${key} (${loc}): no em or en dash, no "Step n"`);
    }
  }
  check(
    catalogs.en["notify.store.impersonation_started.body"]!.endsWith("Customer details were hidden.") &&
      catalogs.fr["notify.store.impersonation_started.body"]!.endsWith("Les données clients étaient masquées.") &&
      catalogs.ar["notify.store.impersonation_started.body"]!.endsWith("كانت بيانات الزبناء مخفية."),
    "store.impersonation_started.body ends with the masking sentence in ar / fr / en (PD69)",
  );

  // the declaration guard
  const refusesDecl = (decl: () => unknown) => {
    try {
      decl();
      return false;
    } catch {
      return true;
    }
  };
  const base = { group: "store", defaultSeverity: "info", audienceHint: "store", tenant: true } as const;
  check(refusesDecl(() => notifyKinds.defineKind({ ...base, kind: "x.leak", vars: z.object({ phone: z.string() }) })), "defineKind refuses a customer-data vars key");
  check(refusesDecl(() => notifyKinds.defineKind({ ...base, kind: "x.leak", vars: z.object({ Email: z.string() }) })), "defineKind refuses it in any case");
  check(refusesDecl(() => notifyKinds.defineKind({ ...base, kind: "x.label", vars: z.object({ a: z.string() }), labels: { b: "notify.reason" } })), "defineKind refuses a label for an unknown var");
  check(refusesDecl(() => notifyKinds.defineKind({ ...base, kind: "NoDot", vars: z.object({}) })), "defineKind refuses a malformed kind name");
  check(eq(notifyKinds.placeholdersOf("{count, plural, one {# x} other {# y}} for {store} by {by} {store}"), ["by", "count", "store"]), "placeholdersOf reads {var} and plural variables");

  // the link rule (PLA-§O.1 rev 4 fixtures) and the registry's shapes
  for (const link of ["/app/atlas-argan", "/app/atlas-argan/x", "/app/atlas-argan?a", "/admin/x", "/app/account?doc=tos", "/admin", "/app/atlas-argan#health", "/admin/queue?r=01JQUEUE000000000000000000"]) {
    check(notifyKinds.notifyLinkOk(link) === link, `link rule: "${link}" passes`);
  }
  const refusedLinks = [
    "https://evil.example", "//evil", "/app/../admin", "javascript:alert(1)", "/app/atlas-argan/../../admin", "/app/atlas-argan/%2e%2e/admin",
    "/app/atlas-argan/%2E%2E/admin", "/admin\\evil", "/app/atlas-argan//evil.example", "/admin x", "", "/app/ab", "/apps/atlas-argan",
    `/admin/${"x".repeat(300)}`, "/app/atlas-argan/%zz",
  ];
  for (const link of refusedLinks) check(notifyKinds.notifyLinkOk(link) === null, `link rule: "${link.slice(0, 40)}" is stored as null`);
  check(eq(notifyKinds.NOTIFY_LINK_SHAPES.map(String), notifyRegistry.NOTIFY_LINK_RES.map(String)), "the link shapes equal the registry's NOTIFY_LINK_RES");
  // every kind's builder makes a link of its own audience, and none without a handle for a store link
  for (const k of KINDS) {
    if (!k.link) continue;
    const built = notifyKinds.notifyLinkOk(k.link({}, { handle: "atlas-argan" }));
    const shape = k.tenant ? /^\/app\/(?:atlas-argan|account)(?:[/?#]|$)/ : /^\/admin(?:[/?#]|$)/;
    check(built !== null && shape.test(built), `${k.kind}: the link builder makes a ${k.tenant ? "tenant" : "console"} link (${built})`);
    if (k.tenant && built?.startsWith("/app/atlas-argan")) check(notifyKinds.notifyLinkOk(k.link({}, { handle: null })) === null, `${k.kind}: no handle, no link`);
  }
  const linkOf = (kind: string, vars: Record<string, unknown>) => notifyRegistry.notificationKind(kind)!.link!(vars, { handle: "atlas-argan" });
  const SID = "01JSTORE000000000000000000";
  check(linkOf("signup.approved", {}) === "/app/atlas-argan/pages" && linkOf("health.issue_new", {}) === "/app/atlas-argan#health" && linkOf("store.impersonation_started", {}) === "/app/atlas-argan/settings/audit", "tenant links per PLA-§18.2");
  check(linkOf("legal.updated", { kind: "tos" }) === "/app/account?doc=tos" && linkOf("user.password_reset", {}) === "/app/account/security", "user-level links per PLA-§18.2");
  check(
    linkOf("staff.abuse_report", { storeId: SID }) === `/admin/stores/${SID}` &&
      linkOf("staff.impersonation_started", { storeId: SID }) === `/admin/stores/${SID}/activity` &&
      linkOf("staff.signup_new", {}) === "/admin/queue" &&
      linkOf("staff.appeal", { requestId: SID }) === `/admin/queue?r=${SID}` &&
      linkOf("staff.signup_capped", {}) === "/admin/settings/signup?tab=waitlist",
    "staff links per PLA-§18.2",
  );
  // vars schemas: the R1.0 senders' shapes still parse (transitionStore, impersonation, signup, team)
  const parses = (kind: string, vars: unknown) => notifyRegistry.notificationKind(kind)!.vars.safeParse(vars).success;
  check(parses("store.restricted", { reason: "fake_orders" }) && parses("signup.approved", { reason: "approved" }) && parses("staff.signup_capped", { day: "2026-10-28" }), "the lifecycle and signup senders' vars parse");
  check(
    parses("store.impersonation_started", { reason: "ticket", from: "2026-10-28T09:00:00.000Z", to: "2026-10-28T09:30:00.000Z" }) && parses("staff.impersonation_started", { store: "atlas-argan", by: SID, minutes: 30 }),
    "the impersonation senders' vars parse",
  );
  check(parses("invite.accepted", { member: "Salma B.", role: "manager" }) && parses("member.role_changed", { role: "agent" }) && parses("member.suspended", {}), "the team senders' vars parse");
  check(!parses("quota.80", { metric: "pages", used: 8, limit: 10 }) && !parses("staff.abuse_report", { store: "x", reason: "spam", count24h: 1 }), "a missing var or a code outside the enum is refused");
  // read-time display: dates in the reader's locale and time zone, Latin digits, codes unchanged
  const at = "2026-10-28T10:00:00.000Z";
  const enAt = String(notifyKinds.displayVar(at, "en", "Africa/Casablanca"));
  const arAt = String(notifyKinds.displayVar(at, "ar", "Africa/Casablanca"));
  check(enAt.includes("2026") && enAt.includes("11:00"), `displayVar: an instant in the store's time zone (${enAt})`);
  check(arAt.includes("2026") && !/[٠-٩]/.test(arAt), `displayVar: Arabic with Latin digits (${arAt})`);
  check(
    String(notifyKinds.displayVar("2026-11-02", "fr", "UTC")).includes("2026") && notifyKinds.displayVar("fake_orders", "en", "UTC") === "fake_orders" && notifyKinds.displayVar(3, "en", "UTC") === 3,
    "displayVar: a day as a date, codes and numbers unchanged",
  );

  /* ---------------------------------------------------------------- */
  /* 12. flags (PLA-§12.2, PL-12)                                     */
  /* ---------------------------------------------------------------- */

  type FlagRowState = import("./flag-eval").FlagRowState;
  type FlagContext = import("./flag-eval").FlagContext;
  type OverrideScope = import("./flag-eval").OverrideScope;
  const FLAGS = flagRegistry.FLAG_DEFS;
  check(new Set(FLAGS.map((f) => f.key)).size === FLAGS.length, "flags: every key once across the tracks");
  for (const f of FLAGS) {
    check(/^[a-z][a-z0-9_]{1,63}$/.test(f.key) && f.description.length <= 300 && f.ownerTrack.length <= 16 && flagEval.valueFits(f.type, f.default), `flag ${f.key}: key, description, owner and a default of its type`);
  }
  const perf = flagRegistry.flagDef("console_perf_panel");
  const ring = flagRegistry.flagDef("health_tenant_ring");
  check(perf?.kind === "ops" && perf.default === false && perf.ownerTrack === "platform", "console_perf_panel: ops, false (PLA-§12.2)");
  check(ring?.kind === "release" && ring.default === true && ring.ownerTrack === "platform", "health_tenant_ring: release, true (PLA-§12.2)");

  const now = new Date("2026-10-28T12:00:00Z");
  const future = new Date("2026-11-28T12:00:00Z");
  const past = new Date("2026-10-27T12:00:00Z");
  const flagDefF: import("@/lib/flags/registry").FlagDef = { key: "f", kind: "release", type: "boolean", description: "test", default: false, ownerTrack: "platform" };
  const rowF: FlagRowState = { key: "f", kind: "release", type: "boolean", defaultValue: true, rules: [{ when: { plans: ["pro"] }, value: false }], archived: false };
  const ovr = (scope: OverrideScope, scopeId: string, value: unknown, expiresAt: Date | null = null) => ({ flagKey: "f", scope, scopeId, value, expiresAt });
  const overrides = [ovr("market", "MA", true), ovr("plan", "pro", true), ovr("store", "S1", false), ovr("user", "U1", true)];
  const ctxAll: FlagContext = { userId: "U1", storeId: "S1", planId: "pro", market: "MA" };
  const src = (ctx: FlagContext, o = overrides, row: FlagRowState | undefined = rowF) => flagEval.resolveFlag("f", ctx, { def: flagDefF, row, overrides: o, now })?.source;
  check(src(ctxAll) === "override:user", "flagValue order: the user override first");
  check(src({ ...ctxAll, userId: undefined }) === "override:store", "… then the store override");
  check(src({ ...ctxAll, userId: undefined, storeId: undefined }) === "override:plan", "… then the plan override");
  check(src({ market: "MA" }) === "override:market", "… then the market override");
  check(src({ planId: "pro" }, []) === "rule:0", "… then the first matching rule");
  check(src({ planId: "basic" }, []) === "row" && src({}, []) === "row", "… then the row's default (a rule whose condition the context lacks does not hold)");
  check(flagEval.resolveFlag("f", {}, { def: flagDefF, overrides: [], now })?.source === "code", "… then the declaration's default");
  check(src(ctxAll, [ovr("user", "U1", true, past), ovr("store", "S1", false, future)]) === "override:store", "an expired override is ignored, an unexpired one applies");
  check(src(ctxAll, [ovr("user", "U1", "yes")]) === "rule:0", "an override of the wrong type is skipped");
  check(flagEval.resolveFlag("g", {}, { overrides: [], now }) === null, "no row, no declaration: nothing answers");
  const rolloutRow = (pct: number): FlagRowState => ({ key: "r", kind: "release", type: "boolean", defaultValue: false, rules: [{ when: {}, value: true, rollout: pct }], archived: false });
  const inFlag = (storeId: string, pct = 20) => flagEval.resolveFlag("r", { storeId }, { row: rolloutRow(pct), overrides: [], now })?.value === true;
  const storeIds = Array.from({ length: 2_000 }, (_, i) => `01JSTORE${String(i).padStart(18, "0")}`);
  const share = storeIds.filter((s) => inFlag(s)).length / storeIds.length;
  check(share > 0.16 && share < 0.24, `a 20 % rollout puts about 20 % of 2,000 stores in (${(share * 100).toFixed(1)} %)`);
  check(storeIds.slice(0, 200).every((s) => [1, 2, 3, 4, 5].every(() => inFlag(s) === inFlag(s))), "the same store lands in the same bucket on every evaluation");
  const { createHash } = await import("node:crypto");
  const bucketOf = (text: string) => parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16) % 100;
  check(storeIds.slice(0, 50).every((s) => flagEval.rolloutBucket("r", { storeId: s }) === bucketOf(`r:${s}`)), "the bucket is parseInt(sha256(key:storeId)[0..7], 16) % 100");
  check(flagEval.rolloutBucket("r", { userId: "U9" }) === bucketOf("r:U9"), "without a store, the user decides the bucket");
  check(storeIds.slice(0, 100).every((s) => !inFlag(s, 0) && inFlag(s, 100)), "rollout 0 takes no one, 100 everyone");
  check(flagEval.ruleMatches({ when: { platformRoles: ["admin"] }, value: true }, { platformRole: "admin" }) && !flagEval.ruleMatches({ when: { platformRoles: ["admin"] }, value: true }, { platformRole: "none" }), "a platform-role rule holds for that role only");
  check(
    flagEval.ruleMatches({ when: { modes: ["store"], storeStatus: ["active"] }, value: 1 }, { mode: "store", storeStatus: "active" }) && !flagEval.ruleMatches({ when: { modes: ["store"], storeStatus: ["active"] }, value: 1 }, { mode: "store" }),
    "every condition must hold",
  );
  check(flagEval.valueFits("json", { a: 1 }) && !flagEval.valueFits("json", [1]) && !flagEval.valueFits("number", Number.NaN) && flagEval.valueFits("string", ""), "valueFits per type");

  /* ---------------------------------------------------------------- */
  /* 13. brand guard (PLA-§13.3, PD70, D76)                           */
  /* ---------------------------------------------------------------- */

  type ProtectedTerm = import("./brand-match").ProtectedTerm;
  const TERMS: ProtectedTerm[] = [...SEED_TERMS, { term: "اتصالات", kind: "brand", match: "exact" }, { term: "badword", kind: "offensive", match: "substring" }];
  const bm = (value: string, field: import("./brand-match").BrandField = "store_name") => brandMatch.matchTerms(field, value, TERMS);
  check(bm("CIH Bank · Vérification").verdict === "exact", 'matchTerms: "CIH Bank · Vérification" is exact');
  check(bm("face-b00k-shop").verdict === "exact" && bm("face-b00k-shop").term === "facebook", "matchTerms: face-b00k-shop is exact on facebook (brandTokens)");
  check(bm("Nour Argan Shop").verdict === "ok", "matchTerms: a clean name is ok");
  check(bm("mybankshop").verdict === "near" && bm("mybankshop").term === "bank" && bm("mybankshop").termKind === "bank", "matchTerms: a substring term of 4+ chars inside the value is near, with the term");
  check(bm("inwistore").verdict === "ok", "matchTerms: an exact-only term never answers near");
  check(bm("اتـصـالات المغرب", "whatsapp_name").verdict === "exact" && bm("اتـصـالات المغرب").term === "اتصالات", "matchTerms: an Arabic term through tatweel");
  check(eq(bm("The badword shop"), { verdict: "exact", termKind: "offensive" }), "matchTerms: an offensive term is exact and never named");
  check(bm("").verdict === "ok" && bm("   ").verdict === "ok", "matchTerms: an empty value is ok");
  check(bm(`${"a".repeat(brandMatch.BRAND_VALUE_MAX)} facebook`).verdict === "ok" && bm(`${"a".repeat(150)} facebook`).verdict === "exact", "matchTerms: the value is cut at 200 characters");
  check(eq(bm("CIH Bank", "seo_title"), bm("CIH Bank", "store_name")), "matchTerms: one rule for every field");
  check(!JSON.stringify(Object.keys(bm("CIH Bank"))).includes("value"), "matchTerms never echoes the value");

  /* ---------------------------------------------------------------- */
  /* 14. abuse report input (PLA-§24.2, PLA-§L)                       */
  /* ---------------------------------------------------------------- */

  const goodReport = { handle: " Atlas-Argan ", reason: "scam", details: "I paid and got nothing.", pagePath: "/s/atlas-argan/argan-oil?utm_source=fb#form", contact: "reporter@example.test", ip: "196.200.12.7" };
  const parsedReport = abuseInput.parseAbuseReport(goodReport);
  check(parsedReport.handle === "atlas-argan" && parsedReport.reason === "scam" && parsedReport.pagePath === "/s/atlas-argan/argan-oil", "parseAbuseReport: the handle lower-cased, the path without its query");
  const reportRefused = (patch: Record<string, unknown>) => !abuseInput.AbuseReportSchema.safeParse({ ...goodReport, ...patch }).success;
  check(reportRefused({ reason: "spam" }) && reportRefused({ reason: undefined }), "parseAbuseReport: the reason must be one of the six");
  check(!reportRefused({ details: "x".repeat(2_000) }) && reportRefused({ details: "x".repeat(2_001) }), "parseAbuseReport: details up to 2,000 characters");
  check(!reportRefused({ contact: "x".repeat(120) }) && reportRefused({ contact: "x".repeat(121) }), "parseAbuseReport: contact up to 120 characters");
  check(abuseInput.parseAbuseReport({ ...goodReport, details: "  \u0007 ", contact: "" }).details === null && abuseInput.parseAbuseReport({ ...goodReport, contact: "" }).contact === null, "parseAbuseReport: empty text is null, control characters dropped");
  check(abuseInput.parseAbuseReport({ ...goodReport, details: "line one\r\nline two\u0000" }).details === "line one\nline two", "parseAbuseReport: plain text keeps line breaks");
  for (const path of ["https://evil.example/x", "//evil.example/x", "relative/path", "/a\\b", "/a b", `/${"p".repeat(300)}`, "javascript:alert(1)"]) {
    check(abuseInput.sameHostPath(path) === null, `sameHostPath: "${path.slice(0, 30)}" is dropped`);
  }
  check(abuseInput.sameHostPath("/argan-oil#form") === "/argan-oil" && abuseInput.sameHostPath(`/${"p".repeat(299)}`)?.length === 300 && abuseInput.sameHostPath(null) === null, "sameHostPath: a path on the store's host, 300 characters at most");
  check(abuseInput.REPORT_LIMITS.ipPerHour === 5 && abuseInput.REPORT_LIMITS.storePerDay === 20, "report buckets: 5 per hour per IP, 20 per day per store (core §E.8)");

  /* ---------------------------------------------------------------- */
  /* 15. Store Health on the console side (PLA-§6.3, §15.2; step 3)   */
  /* ---------------------------------------------------------------- */

  // a check with a detail printed on failure (this section's fixtures are objects)
  const checkD = (ok: unknown, msg: string, detail?: unknown) => check(Boolean(ok), detail === undefined || ok ? msg : `${msg} ${JSON.stringify(detail)?.slice(0, 300)}`);
  const hscore = await import("./health-score");
  const alarmRules = await import("./alarm-rules");
  const hfx = await import("@/lib/health/fixtures");
  const hflags = await import("@/lib/health/platform-flags");
  const hrules = await import("@/lib/health/rules/platform");
  const hnotices = await import("@/lib/health/notices");
  type HInputs = import("@/lib/health/types").HealthInputs;
  type HIssue = import("@/lib/health/types").HealthIssue;
  const HNOW = hfx.FIXTURE_NOW;
  const HDAY = 86_400_000;

  // staleAfterMin = max(staleAlarmMinutes, 1.5 × cycleMin) (PD78)
  checkD(hscore.staleAfterMin(60, null) === 60 && hscore.staleAfterMin(60, 30) === 60 && hscore.staleAfterMin(60, 50) === 75 && hscore.staleAfterMin(60, 150) === 225, "staleAfterMin: the setting, or 1.5 × the measured cycle");
  checkD(hscore.staleAfterMin(15, 0) === 15 && hscore.staleAfterMin(15, Number.NaN) === 15 && hscore.staleAfterMin(0, null) === 1, "staleAfterMin: an unknown cycle is the setting alone, never below 1");
  checkD(hscore.cycleMinutes(300, [10, 10, 10]) === 150 && hscore.cycleMinutes(100, []) === null && hscore.cycleMinutes(5, [20]) === 5, "cycleMin = ceil(rotation / storesPerTickP50) × 5 (PLA-§6.3.4)");
  checkD(hscore.cycleMinutes(240, [...Array(20).fill(1), ...Array(12).fill(12)]) === 100, "cycleMin: the median of the last 12 runs only");

  // every alarm code: its Needs-attention sentence with its variables, its short label without any
  const enCatalog = enAll as Record<string, string>;
  checkD(new Set(alarmRules.ALARM_CODES).size === alarmRules.ALARM_CODES.length && alarmRules.ALARM_CODES.length >= 37, "ALARM_CODES: every PLA-§15.2 code once", alarmRules.ALARM_CODES.length);
  for (const code of alarmRules.ALARM_CODES) {
    const sentence = enCatalog[`console.attention.${code}`];
    checkD(sentence && notifyKinds.placeholdersOf(sentence).join() === [...alarmRules.ALARM_VARS[code]].sort().join(), `console.attention.${code} with {${alarmRules.ALARM_VARS[code].join("}, {")}}`, sentence);
    const label = enCatalog[`console.alarm.${code}`];
    checkD(label && notifyKinds.placeholdersOf(label).length === 0, `console.alarm.${code}: a label without variables (staff.alarm's {alarm})`);
  }
  for (const gone of ["disk_low", "signup_cap_reached"]) checkD(!(alarmRules.ALARM_CODES as readonly string[]).includes(gone), `${gone} is a withdrawn code (rev 3 / rev 4)`);
  checkD(notifyKinds.labelsOf(notifyRegistry.notificationKind("staff.alarm")).alarm === "console.alarm", "staff.alarm labels its code with console.alarm.<code>");

  // alarmsFrom: pure fixtures
  const baseAlarm: import("./alarm-rules").AlarmInputs = { now: HNOW, machine: null, ai: null, health: null, flagged: null, signup: null, backup: null, breakglass: null };
  const codes = (patch: Partial<import("./alarm-rules").AlarmInputs>) => alarmRules.alarmsFrom({ ...baseAlarm, ...patch }).map((a) => `${a.code}:${a.level}`);
  checkD(codes({}).length === 0, "alarms: every source missing → nothing raised (never guessed)");
  const health = (stale: number, active = 300) => ({ activeStores: active, staleActive: stale, staleAfterMin: 225, slowStreak: 0, lastP50Ms: 300 });
  checkD(codes({ health: health(0) }).length === 0 && codes({ health: health(3) }).join() === "health_stale:warn" && codes({ health: health(31) }).join() === "health_stale:danger", "health_stale: yellow when any active store is stale, red past 10 %");
  checkD(codes({ health: { ...health(0), slowStreak: 2 } }).length === 0 && codes({ health: { ...health(0), slowStreak: 3, lastP50Ms: 900 } }).join() === "health_job_slow:warn", "health_job_slow after three slow runs in a row");
  const signup = (p: Partial<NonNullable<import("./alarm-rules").AlarmInputs["signup"]>>) => ({ unguarded: false, pendingToday: 0, cap: 50, pendingMediaBytes: 0, pendingMediaBudgetBytes: 5_000 * 1024 * 1024, ...p });
  checkD(codes({ signup: signup({ pendingMediaBytes: 3_900 * 1024 * 1024 }) }).length === 0 && codes({ signup: signup({ pendingMediaBytes: 4_000 * 1024 * 1024 }) }).join() === "pending_media_budget:warn" && codes({ signup: signup({ pendingMediaBytes: 4_750 * 1024 * 1024 }) }).join() === "pending_media_budget:danger", "pending_media_budget: 80 % yellow, 95 % red (core §H.5)");
  checkD(codes({ signup: signup({ unguarded: true }) }).join() === "signup_unguarded:danger", "signup_unguarded: red");
  const capped = alarmRules.alarmsFrom({ ...baseAlarm, signup: signup({ pendingToday: 50 }) });
  checkD(capped.length === 1 && capped[0]!.code === "signup_capped" && capped[0]!.level === "info" && capped[0]!.notify === "never", "signup_capped: information, never a staff.alarm (staff.signup_capped is the sign-up's)");
  const flaggedStore = { storeId: "01JH000000000000000000STA1", flags: [{ code: "brand_term_live" as const, severity: 2 as const, since: HNOW.toISOString(), detail: hflags.brandDetail({ term: "cih", field: "seo_title", pageId: "P1" }) }, { code: "abuse_reports_new" as const, severity: 2 as const, since: HNOW.toISOString(), value: 4 }] };
  const perStore = alarmRules.alarmsFrom({ ...baseAlarm, flagged: [flaggedStore] });
  checkD(perStore.length === 2 && perStore.every((a) => a.storeId === flaggedStore.storeId && a.notify === "elsewhere"), "brand_term_live and abuse_reports_spike per store, notified by their own writer", perStore);
  checkD(perStore.find((a) => a.code === "brand_term_live")?.vars.term === "cih", "brand_term_live names the term and field for staff");
  const machine = {
    at: HNOW.toISOString(),
    cron: { lastTickAt: new Date(HNOW.getTime() - 11 * 60_000).toISOString(), lastTickMs: 900, lastTickOk: true, jobs: [] },
    outbox: { byKind: [], oldestPending: [] },
    renders: { byReason: [], oldestPending: null, failed24h: [], doneLastHour: 0, notes: 0 },
    sheets: [],
    storage: { db: { bytes: 86, quotaBytes: 100, ratio: 0.86, level: "warn" as const }, tables: [], stores: [] },
    dataDir: { bytes: 0, budgetBytes: null, files: 10 },
    errors24h: [],
    runtime: { node: "v22", memory: { rss: 1, heapUsed: 1, heapTotal: 1 }, uptimeSec: 1, bootWarnings: [] },
    edge: { sMode: false, workerVersion: null, lastEdgeAt: null, prevKeyRequests24h: 0, badKey24h: 0, foreignHosts24h: 0 },
    build: { id: null, gateSha: null, gateAt: null },
    db: { poolWaitP95Ms: null, lockPoolWaitP95Ms: null },
    tick: { lagP95Ms: null, skipped24h: 0 },
    commerce: { lastOrderAt: null, ordersPerHour24: [] },
    sheetsTop: [],
    ai: null,
    design: { genomesBytes: 0, shinglesBytes: 0 },
    health: { staleSnapshots: 0, dirtyRows: 0 },
  } as import("./health").PlatformHealth;
  checkD(codes({ machine }).join() === "no_tick:danger,db_85:danger", "machinery: no tick for 11 min and the DB at 86 % (one of db_70 / db_85)", codes({ machine }));
  checkD(codes({ machine: { ...machine, edge: { ...machine.edge, sMode: true } }, health: health(0, 1) }).includes("edge_silent:danger") && !codes({ machine, health: health(0, 1) }).includes("edge_silent:danger"), "edge_silent only while S mode is on and a store is live");

  // the run's state: a newly raised alarm once, a recovery recorded, one key per code and hour
  const first = alarmRules.alarmsFrom({ ...baseAlarm, health: health(3) });
  const d1 = alarmRules.diffAlarms({ raised: {}, recovered: {} }, first, HNOW);
  const d2 = alarmRules.diffAlarms(d1.next, first, new Date(HNOW.getTime() + 5 * 60_000));
  const d3 = alarmRules.diffAlarms(d2.next, [], new Date(HNOW.getTime() + 10 * 60_000));
  checkD(d1.raisedNow.length === 1 && d2.raisedNow.length === 0 && d2.next.raised.health_stale === d1.next.raised.health_stale, "an alarm notifies when raised, not while it stays raised");
  checkD(d3.recoveredNow.join() === "health_stale" && d3.raisedNow.length === 0 && typeof d3.next.recovered.health_stale === "string", "a recovered alarm sends nothing and keeps its time (\"Recovered 14:20\")");
  checkD(alarmRules.alarmDedupeKey({ code: "no_tick" }, HNOW) === "alarm:no_tick:2026-10-28T10" && alarmRules.alarmDedupeKey({ code: "brand_term_live", storeId: "S1" }, HNOW) === "alarm:brand_term_live:S1:2026-10-28T10", "alarm dedupe alarm:<code>:<YYYY-MM-DDTHH> (per store after the code)");

  // platform:brand_term_live (PD70): store name, a live page's SEO title, a policy text, nowhere; a 5-char substring never live
  const terms: import("./brand-match").ProtectedTerm[] = [
    { term: "cih", kind: "bank", match: "exact" },
    { term: "facebook", kind: "brand", match: "substring" },
    { term: "bank", kind: "bank", match: "substring" },
    { term: "jumia", kind: "brand", match: "substring" },
    { term: "badword", kind: "offensive", match: "substring" },
  ];
  const brandIn = (patch: Partial<HInputs>) => hrules.brandScan(hfx.emptyHealthInputs(patch), terms);
  const brand = (p: Partial<NonNullable<HInputs["brand"]>>) => ({ storeName: "Nour Argan", legalName: null, whatsappName: null, policyTexts: [], ...p });
  checkD(brandIn({ brand: brand({ storeName: "CIH Bank · Vérification" }) }).live?.field === "store_name", "brand_term_live: an exact term in the store name");
  const seoHit = brandIn({ brand: brand({}), pages: hfx.fixturePages(2, { live: [{ id: "PAGE1", slug: "a", updatedAt: HNOW, name: "Huile", seoTitle: "Paiement facebook officiel" }] }) }).live;
  checkD(seoHit?.field === "seo_title" && seoHit.pageId === "PAGE1" && seoHit.term === "facebook", "brand_term_live: a live page's SEO title, with its page id", seoHit);
  const policyHit = brandIn({ brand: brand({ policyTexts: [`${"Retours acceptés sous 7 jours. ".repeat(12)}Contact via facebook.`] }) }).live;
  checkD(policyHit?.field === "policy_text", "brand_term_live: inside a long policy text (200-character windows)", policyHit);
  checkD(brandIn({ brand: brand({}), pages: hfx.fixturePages(1) }).live === null && brandIn({}).live === null, "brand_term_live: nowhere → none (the empty base too)");
  const nearOnly = brandIn({ brand: brand({ storeName: "Mybankshop" }) });
  checkD(nearOnly.live === null && nearOnly.near?.term === "bank", "a substring term under 6 characters is never live, only near (brand_near_live)", nearOnly);
  checkD(brandIn({ brand: brand({ storeName: "Jumiadeals" }) }).live === null, "a 5-character substring term (jumia) inside a word never raises brand_term_live");
  checkD(brandIn({ brand: brand({ storeName: "The badword shop" }) }).live === null, "offensive terms are not brands (the write path refuses them)");
  const flagsOf = (patch: Partial<HInputs>) => hflags.platformFlags(hfx.emptyHealthInputs(patch), [], { terms }).map((f) => f.code);
  checkD(flagsOf({ brand: brand({ storeName: "CIH Bank" }) }).includes("brand_term_live") && flagsOf({ brand: brand({ storeName: "Mybankshop" }) }).includes("brand_near_live"), "platformFlags: brand_term_live / brand_near_live from the scan");
  checkD(!hflags.platformFlags(hfx.emptyHealthInputs({ brand: brand({ storeName: "CIH Bank" }) }), []).some((f) => f.code.startsWith("brand_")), "without the terms no brand flag (never guessed)");
  const wk1 = hnotices.healthDedupe.brandTermLive("S1", "CIH", new Date("2026-10-26T01:00:00Z"));
  checkD(wk1 === hnotices.healthDedupe.brandTermLive("S1", "cih", new Date("2026-11-01T23:00:00Z")) && wk1 !== hnotices.healthDedupe.brandTermLive("S1", "cih", new Date("2026-11-02T01:00:00Z")), "brand_term_live alarm: once per store, term and ISO week");
  checkD(/^alarm:brand_term_live:S1:[0-9a-f]{12}:2026-W44$/.test(wk1) && !wk1.includes("cih"), "… keyed by a hash of the term, never the term", wk1);

  // the console flags per code (PLA-§6.3.3)
  const issueOf = (id: string, sev: 1 | 2 | 3): HIssue => ({ id, group: "integrations", severity: sev, points: hscore.pointsFor(sev), evidence: { metric: id, value: 1, window: "24h", n: 1 }, fix: { kind: "action", actionId: "ops.open_queue", label: "health.platform.quota.fix" }, text: "health.platform.quota.fix" });
  const flagFixtures: [string, Partial<HInputs>, HIssue[]][] = [
    ["sheets_backlog", {}, [issueOf("int:sheets_backlog", 3)]],
    ["outbox_dead", {}, [issueOf("int:delivery_dead", 2)]],
    ["capi_failing", {}, [issueOf("int:capi_failing", 2)]],
    ["telegram_failing", {}, [issueOf("int:telegram_failing", 1)]],
    ["sheets_error", { sheets: { pending: 0, oldestMin: null, lastRunFailedAt: new Date(HNOW.getTime() - 30 * 60_000) } }, []],
    ["quota_high", { usage: [{ metric: "pages", period: "total", used: 8, limit: 10 }] }, []],
    ["quota_full", { usage: [{ metric: "pages", period: "total", used: 10, limit: 10 }] }, []],
    ["risky_orders", { orders: hfx.fixtureOrders(20, { risky7d: 6 }) }, []],
    ["render_failed", { pages: hfx.fixturePages(1, { renderFailed: 1 }) }, []],
    ["review_waiting", { store: hfx.fixtureStore({ status: "pending" }), review: { submittedAt: new Date(HNOW.getTime() - 25 * 3_600_000), status: "pending" } }, []],
    ["restricted", { store: hfx.fixtureStore({ status: "restricted" }) }, []],
    ["suspended", { store: hfx.fixtureStore({ status: "suspended" }) }, []],
    ["abuse_reports_new", { abuseReports: { new24h: 1, total: 1 } }, []],
  ];
  for (const [code, patch, issues] of flagFixtures) {
    const got = hflags.platformFlags(hfx.emptyHealthInputs(patch), issues).map((f) => f.code);
    checkD(got.includes(code as never), `platformFlags: ${code}`, got);
  }
  checkD(!hflags.platformFlags(hfx.emptyHealthInputs({ store: hfx.fixtureStore({ status: "pending" }), review: { submittedAt: new Date(HNOW.getTime() - 23 * 3_600_000), status: "pending" } })).some((f) => f.code === "review_waiting"), "review_waiting: not before slaHours (24 h when unset)");
  checkD(hflags.platformFlags(hfx.emptyHealthInputs({ abuseReports: { new24h: 3, total: 9 } })).find((f) => f.code === "abuse_reports_new")?.severity === 2, "abuse_reports_new: 3 in 24 h → severity 2");
  checkD(hflags.platformFlags(hfx.emptyHealthInputs({ sheets: { pending: 0, oldestMin: null, lastRunFailedAt: new Date(HNOW.getTime() - 2 * HDAY) } })).length === 0, "sheets_error: a failed run older than an hour is quiet");

  /* ---------------------------------------------------------------- */
  /* Step 4: the queue's rules, the grant check, the lifecycle sheet's rules, sign-up admin (PLA-§3.3-§3.7, §8, §9.4) */
  /* ---------------------------------------------------------------- */
  const qr = await import("./queue-rules");
  const lr = await import("./lifecycle-rules");
  const lifecycle = await import("@/lib/tenancy/lifecycle");
  const plansMod = await import("./plans");
  const signupAdmin = await import("./signup-admin");
  const { messageOf } = await import("@/lib/i18n/admin");
  type QRow = import("./queue-rules").QueueIndexRow;
  type LStatus = import("@/lib/tenancy/types").StoreStatus;
  const QNOW = new Date("2026-10-29T10:00:00.000Z");
  const QMIN = 60_000;
  const QDAY = 86_400_000;
  const qrow = (p: Partial<QRow>): QRow => ({
    id: "01JQ0000000000000000000001",
    storeId: "01JS0000000000000000000001",
    kind: "signup",
    status: "pending",
    band: "fast",
    score: 10,
    codes: [],
    snoozeUntil: null,
    createdAt: new Date(QNOW.getTime() - 60 * QMIN),
    submittedAt: null,
    answeredAt: null,
    decidedAt: null,
    decidedBy: null,
    storeName: "atlas argan",
    handle: "atlas-argan",
    email: "salma@gmail.com",
    market: "MA",
    ...p,
  });
  const tabs = (p: Partial<QRow>) => qr.tabsOf(qrow(p), QNOW).join();
  checkD(tabs({}) === "review,fast", "queue tabs: a pending fast row is in Review and the Fast lane");
  checkD(tabs({ codes: ["linked_banned"] }) === "review", "queue tabs: a hold-class flag keeps a fast row out of the Fast lane", tabs({ codes: ["linked_banned"] }));
  checkD(tabs({ band: "hold" }) === "review,hold" && tabs({ band: "reject_candidate" }) === "review,hold" && tabs({ band: "review" }) === "review", "queue tabs: hold and reject_candidate rows are in Hold too");
  checkD(tabs({ status: "snoozed", snoozeUntil: new Date(QNOW.getTime() + QMIN) }) === "snoozed", "queue tabs: a snooze before its time is Snoozed only");
  checkD(tabs({ status: "snoozed", snoozeUntil: new Date(QNOW.getTime() - QMIN) }) === "review,fast", "queue tabs: a snooze past its time re-enters Review at query time");
  checkD(tabs({ status: "needs_info" }) === "needs_info" && tabs({ status: "pending", answeredAt: QNOW }) === "review,fast", "queue tabs: Needs info waits on the seller; an answered row is back in Review");
  checkD(tabs({ kind: "plan_change" }) === "requests" && tabs({ kind: "go_live" }) === "requests", "queue tabs: the other kinds are Requests, never the Fast lane");
  checkD(tabs({ status: "approved", decidedAt: new Date(QNOW.getTime() - 10 * QDAY) }) === "decided" && tabs({ status: "rejected", decidedAt: new Date(QNOW.getTime() - 31 * QDAY) }) === "", "queue tabs: Decided keeps 30 days");
  const counted = qr.tabCounts([qrow({}), qrow({ id: "01JQ0000000000000000000002", band: "hold" }), qrow({ id: "01JQ0000000000000000000003", kind: "limit_raise" }), qrow({ id: "01JQ0000000000000000000004", status: "needs_info" })], QNOW);
  checkD(counted.review === 2 && counted.fast === 1 && counted.hold === 1 && counted.requests === 1 && counted.needs_info === 1 && counted.snoozed === 0 && counted.decided === 0, "queue tab counts", counted);
  checkD(qr.inFastLane(qrow({}), QNOW) && !qr.inFastLane(qrow({ kind: "reopen", band: "review" }), QNOW) && !qr.inFastLane(qrow({ status: "needs_info" }), QNOW), "inFastLane: only a waiting fast review row without a hold flag (bulk approve's rule)");
  // the SLA tile
  const decidedRow = (id: string, minutes: number, by: string | null = "01JSTAFF000000000000000001") =>
    qrow({ id, status: "approved", submittedAt: new Date(QNOW.getTime() - 2 * QDAY), decidedAt: new Date(QNOW.getTime() - 2 * QDAY + minutes * QMIN), decidedBy: by });
  const sla = qr.slaTile([decidedRow("01JQ0000000000000000000011", 30), decidedRow("01JQ0000000000000000000012", 90), decidedRow("01JQ0000000000000000000013", 5, null), qrow({ createdAt: new Date(QNOW.getTime() - 192 * QMIN) })], QNOW, null);
  checkD(sla.medianDecisionMin === 60 && sla.n === 2 && sla.oldestWaitingMin === 192 && sla.pastSla === null, "SLA tile: median of staff decisions (an automatic one is no sample), oldest waiting, no target → no past-SLA count", sla);
  checkD(qr.slaTile([qrow({ createdAt: new Date(QNOW.getTime() - 25 * 60 * QMIN) })], QNOW, 24).pastSla === 1 && qr.slaTile([], QNOW, 24).medianDecisionMin === null, "SLA tile: rows past slaHours; no decision → no median");
  // paging and search
  const many = Array.from({ length: 5 }, (_, i) => qrow({ id: `01JQ000000000000000000010${i}`, createdAt: new Date(QNOW.getTime() - (10 - i) * QMIN) }));
  const p1 = qr.pageOf(many, "review", {}, null, QNOW, 2);
  const p2 = qr.pageOf(many, "review", {}, p1.next, QNOW, 2);
  const p3 = qr.pageOf(many, "review", {}, p2.next, QNOW, 2);
  checkD(p1.ids.join() === [many[0]!.id, many[1]!.id].join() && p2.ids.join() === [many[2]!.id, many[3]!.id].join() && p3.ids.join() === many[4]!.id && p3.next === null, "pageOf: oldest waiting first, keyset pages without overlap", { p1, p2, p3 });
  checkD(
    qr.matchesFilter(qrow({}), { q: "Atl" }) && qr.matchesFilter(qrow({}), { q: "@atlas" }) && qr.matchesFilter(qrow({}), { q: "SALMA@gmail.com" }) && !qr.matchesFilter(qrow({}), { q: "salma@" }) && !qr.matchesFilter(qrow({}), { q: "argan" }) && qr.matchesFilter(qrow({}), { q: "a" }),
    "queue search: name or handle prefix, an exact e-mail only, under 2 characters ignored",
  );
  checkD(!qr.matchesFilter(qrow({}), { market: "TN" }) && qr.matchesFilter(qrow({}), { market: "MA" }), "queue filter: market");
  // snooze times
  checkD(qr.snoozeUntil("1h", QNOW, "Africa/Casablanca").getTime() === QNOW.getTime() + 60 * QMIN && qr.snoozeUntil("3d", QNOW, "Africa/Casablanca").getTime() === QNOW.getTime() + 3 * QDAY, "snooze: 1 h and 3 days");
  const tomorrow = qr.snoozeUntil("tomorrow", QNOW, "Africa/Casablanca").toISOString();
  checkD(tomorrow === "2026-10-30T08:00:00.000Z", "snooze: tomorrow 09:00 in the platform time zone (Casablanca, UTC+1)", tomorrow);
  checkD(qr.snoozeUntil("tomorrow", new Date("2026-03-28T20:00:00.000Z"), "Europe/Paris").toISOString() === "2026-03-29T07:00:00.000Z", "snooze: tomorrow 09:00 across a DST change (Paris, CEST)");
  // inputs (zod v4)
  const ids51 = Array.from({ length: 51 }, (_, i) => `01JQ000000000000000000${String(i).padStart(4, "0")}`);
  checkD(!qr.BulkApproveInput.safeParse({ reviewIds: ids51 }).success && qr.BulkApproveInput.safeParse({ reviewIds: ids51.slice(0, 50) }).success, "bulk approve: at most 50 ids");
  checkD(!qr.AskInfoInput.safeParse({ reviewId: "01JQ0000000000000000000001", question: "x".repeat(501) }).success && !qr.AskInfoInput.safeParse({ reviewId: "01JQ0000000000000000000001", question: "   " }).success, "ask info: 1-500 characters once cleaned");
  checkD(qr.cleanText(" a\u0007b\nc ") === "a b\nc" && qr.cleanText("ｆｕｌｌ") === "full", "plain text: NFKC, control characters out, newlines kept");
  const ctxOk = qr.BusinessContextInput.safeParse({ sells: "  Argan oil ", link: null, whatsapp: "+212 6 61 23 45 67" });
  checkD(ctxOk.success && ctxOk.data.sells === "Argan oil" && ctxOk.data.link === null && ctxOk.data.whatsapp === "+212661234567", "business context: trimmed, the WhatsApp number normalised to E.164", ctxOk);
  checkD(!qr.BusinessContextInput.safeParse({ sells: null, link: null, whatsapp: "0661234567" }).success && !qr.BusinessContextInput.safeParse({ sells: "x".repeat(201), link: null, whatsapp: null }).success, "business context: a local number and a 201-character field refused");
  const reqParsed = qr.ReviewRequestSchema.safeParse({ kind: "limit_raise", key: "media_bytes", used: 90, limit: 100, asked: 200, message: null, storeId: "01JS0000000000000000000009" });
  checkD(reqParsed.success && !("storeId" in reqParsed.data), "store request: unknown keys (a store id) are dropped");
  checkD(!qr.ReviewRequestSchema.safeParse({ kind: "limit_raise", key: "not_a_key", used: 1, limit: 1, asked: 2, message: null }).success, "store request: an unknown entitlement key refused");
  checkD(qr.approveNeedsNote("hold") && qr.approveNeedsNote("reject_candidate") && !qr.approveNeedsNote("fast") && !qr.approveNeedsNote("review"), "approve: a note for hold and reject_candidate");
  checkD(
    qr.resolvePermission("plan_change") === "entitlements.override" && qr.resolvePermission("limit_raise") === "entitlements.override" && qr.resolvePermission("go_live") === "signups.decide" && qr.resolvePermission("mode_change") === "signups.decide" && qr.resolvePermission("domain") === "signups.decide",
    "resolve: plan and limit requests need entitlements.override",
  );
  checkD(!qr.GrantSpecSchema.safeParse({ kind: "boost", key: "nope", value: 1 }).success && qr.GrantSpecSchema.safeParse({ kind: "plan", planId: "growth" }).success, "GrantSpec: known keys only");
  for (const r of qr.REJECT_REASONS) checkD(typeof (enConsole as Record<string, string>)[`console.reject.${r}`] === "string", `console.reject.${r} has a staff label`);

  // plans: the grant check of an override or boost (PLA-§9.4, PD8)
  type GrantIn = Parameters<typeof plansMod.checkEntitlementGrant>[0];
  const gc = (p: Partial<GrantIn>) => {
    const r = plansMod.checkEntitlementGrant({ key: "media_bytes", source: "boost", value: 2048, expiresAt: new Date(QNOW.getTime() + 7 * QDAY), reason: "Launch week", ...p }, QNOW);
    return r.ok ? "ok" : r.code;
  };
  checkD(gc({}) === "ok" && gc({ source: "override", expiresAt: null }) === "ok" && gc({ source: "override", value: null, expiresAt: null }) === "ok", "grant check: a boost with an expiry, an override without one, unlimited");
  checkD(gc({ key: "take_orders", value: false }) === "take_orders_locked" && gc({ key: "take_orders", value: true }) === "ok", "grant check: take_orders false is refused (take_orders_locked)");
  checkD(gc({ expiresAt: null }) === "boost_expiry_required" && gc({ expiresAt: new Date(QNOW.getTime() + 91 * QDAY) }) === "boost_too_long" && gc({ expiresAt: new Date(QNOW.getTime() - QMIN) }) === "expiry_past", "grant check: a boost expires within 90 days, never in the past");
  checkD(gc({ value: -1 }) === "value_type" && gc({ value: 1.5 }) === "value_type" && gc({ value: true }) === "value_type" && gc({ key: "sheets", value: 3 }) === "value_type", "grant check: a limit is a whole number ≥ 0 or unlimited, a feature a boolean");
  checkD(gc({ reason: "  " }) === "reason_length" && gc({ reason: "x".repeat(201) }) === "reason_length", "grant check: a reason of 1-200 characters");
  for (const code of ["value_type", "boost_expiry_required", "expiry_past", "boost_too_long", "reason_length", "expiry_invalid"]) checkD(typeof (enConsole as Record<string, string>)[`console.entitlement.${code}`] === "string", `console.entitlement.${code} has a sentence`);

  // the lifecycle sheet's rules against T1's edge table (the preview and the action decide with them)
  const ALL_STATUSES: readonly LStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"];
  let edgesChecked = 0;
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (from === to) continue;
      const action = lr.lifecycleActionOf(from, to);
      const edge = lifecycle.findEdge(from, to);
      if (action && action !== "purge") {
        edgesChecked++;
        const req = lr.requirementsOf(action);
        checkD(edge?.staff && edge.staff.permission === req.permission && edge.staff.stepUp === req.stepUp, `lifecycle ${from} → ${to} (${action}): the permission and ↑ of ALLOWED_TRANSITIONS`, { edge: edge?.staff, req });
        const writes = lr.writesOf(from, to);
        checkD(writes && edge && writes.audit === edge.audit.staff && writes.notification === edge.notify, `lifecycle ${from} → ${to}: the audit action and the one notification of the edge`, { writes, edge: edge?.audit });
      } else if (edge?.staff && to !== "purged") {
        checkD(lr.isQueueEdge(from, to), `lifecycle ${from} → ${to}: a staff edge without a console action is the queue's`);
      }
    }
  }
  checkD(edgesChecked === 16, "lifecycle: 16 console edges (restrict, suspend ×2, restore ×3, close ×4, reopen ×4 targets, deletion, cancel) map onto T1's table", edgesChecked);
  checkD(lr.lifecycleActionOf("closed", "purged") === "purge" && lr.lifecycleActionOf("active", "purged") === null && lr.lifecycleActionOf("pending", "active") === null, "lifecycle: purge only from closed / scheduled_deletion; approve is not a console action");
  checkD(
    lr.REQUIREMENTS.restrict.reasons === reasons.RESTRICT_REASONS &&
      lr.REQUIREMENTS.suspend.reasons === reasons.SUSPEND_REASONS &&
      lr.REQUIREMENTS.close.reasons === reasons.CLOSE_REASONS &&
      lr.REQUIREMENTS.schedule_deletion.reasons === reasons.DELETION_REASONS &&
      lr.REQUIREMENTS.purge.reasons === reasons.PURGE_REASONS &&
      lr.REQUIREMENTS.reopen.reasons === reasons.RESTORE_REASONS,
    "lifecycle: each action offers its PLA-§8.2 reason list",
  );
  const typed = (a: import("./lifecycle-rules").LifecycleAction) => lr.REQUIREMENTS[a].typedHandle;
  checkD(typed("suspend") && typed("close") && typed("schedule_deletion") && typed("purge") && !typed("restrict") && !typed("restore") && !typed("reopen") && !typed("cancel_deletion") && !lr.REQUIREMENTS.restrict.stepUp, "lifecycle: the typed handle of the PLA-§8.1 table; restrict stays light (no ↑, no typed confirmation)");
  checkD(lr.typedHandleMatches(" @Atlas-Argan ", "atlas-argan") && !lr.typedHandleMatches("atlas", "atlas-argan") && !lr.typedHandleMatches("x", null) && !lr.typedHandleMatches(undefined, "atlas-argan"), "typed handle: trimmed, case-folded, '@' optional, exact");
  // the cooldown on a fake clock (PD54)
  const changed = new Date(QNOW.getTime() - 4 * QMIN);
  const cd = lr.cooldownState(changed, QNOW, 10);
  checkD(cd.inside && cd.minutesAgo === 4 && cd.until?.getTime() === changed.getTime() + 10 * QMIN, "cooldown: a change 4 minutes ago is inside a 10-minute window", cd);
  checkD(!lr.cooldownState(new Date(QNOW.getTime() - 10 * QMIN), QNOW, 10).inside && !lr.cooldownState(null, QNOW, 10).inside && !lr.cooldownState(changed, QNOW, 0).inside, "cooldown: over at 10 minutes, never for a store that never changed, off at 0");
  checkD(lr.typedHandleRequired("restrict", { inside: true }) && !lr.typedHandleRequired("restrict", { inside: false }) && lr.typedHandleRequired("suspend", { inside: false }), "cooldown: inside it, even restrict needs the typed handle");
  // the dates the transition writes (lifecycle.ts transitionColumns)
  const row0 = { closedAt: new Date(QNOW.getTime() - 3 * QDAY), purgeAfter: new Date(QNOW.getTime() + 27 * QDAY) };
  const datePairs: [LStatus, LStatus][] = [["active", "closed"], ["pending", "closed"], ["closed", "active"], ["closed", "scheduled_deletion"], ["scheduled_deletion", "closed"], ["active", "restricted"]];
  for (const [from, to] of datePairs) {
    const cols = lifecycle.transitionColumns(from, to, QNOW, { userId: null });
    const want = lr.predictedDates(from, to, QNOW, row0);
    const colClosed = "closed_at" in cols ? (cols.closed_at as Date | null) : row0.closedAt;
    const colPurge = "purge_after" in cols ? (cols.purge_after as Date | null) : row0.purgeAfter;
    checkD((want.closedAt?.getTime() ?? null) === (colClosed?.getTime() ?? null) && (want.purgeAfter?.getTime() ?? null) === (colPurge?.getTime() ?? null), `predictedDates ${from} → ${to} = what transitionStore writes`, { want, cols });
  }
  // what the store sees, per edge and locale (PLA-§8.0: "rendered from shell.* keys in the store's default locale")
  checkD(lr.pagesOf("active", false) === "live" && lr.pagesOf("restricted", true) === "live" && lr.pagesOf("suspended", false) === "neutral_404" && lr.pagesOf("suspended", true) === "neutral_503" && lr.pagesOf("closed", true) === "neutral_404", "public pages per state (core §A.5.3, D32)");
  checkD(lr.ordersOf("active") === "open" && lr.ordersOf("restricted") === "unavailable" && lr.ordersOf("pending") === "unavailable" && lr.ordersOf("suspended") === "refused" && lr.ordersOf("closed") === "refused", "public orders per state (core §A.5.3)");
  const sees = (status: LStatus, from: LStatus, locale: "ar" | "fr" | "en", reason: string, dates: { closedAt?: Date; purgeAfter?: Date } = {}, suspendNotice = false) =>
    lr.storeSeesFor({ from, status, reason, closedAt: dates.closedAt ?? null, purgeAfter: dates.purgeAfter ?? null, suspendNotice, locale, timeZone: "Africa/Casablanca", notification: { title: "T", body: "B" } });
  const in30 = new Date(QNOW.getTime() + 30 * QDAY);
  for (const locale of ["ar", "fr", "en"] as const) {
    const shellKey = messageOf("shell.banner.restricted", locale) !== undefined;
    const r = sees("restricted", "active", locale, "fake_orders");
    const reasonText = (shellKey ? (messageOf("shell.status_reason.fake_orders", locale) ?? messageOf("notify.reason.fake_orders", locale)) : messageOf("notify.reason.fake_orders", "en")) ?? "?";
    checkD(r.banner?.includes(reasonText) && r.publicPages === "unchanged" && r.publicOrders === "unavailable" && r.locale === locale && r.fallback === !shellKey, `storeSees restrict (${locale}): the banner with the reason sentence, pages unchanged, orders unavailable`, r);
    const s = sees("suspended", "active", locale, "phishing", {}, true);
    checkD(s.publicPages === "neutral_503" && s.publicOrders === "refused" && !!s.banner, `storeSees suspend with the notice (${locale}): the neutral 503`, s);
    const c = sees("closed", "active", locale, "owner_request", { closedAt: QNOW, purgeAfter: in30 });
    const cLocale = messageOf("shell.banner.closed", locale) !== undefined ? locale : "en";
    checkD(c.banner?.includes(lr.storeDay(QNOW, cLocale, "Africa/Casablanca")) && c.banner.includes(lr.storeDay(in30, cLocale, "Africa/Casablanca")) && c.publicPages === "neutral_404", `storeSees close (${locale}): closed today, reopen until +30 days`, c);
    checkD(!/[٠-٩]/.test(lr.storeDay(QNOW, locale, "Africa/Casablanca")), `storeSees dates in ${locale} use Latin digits`);
    const back = sees("active", "suspended", locale, "issue_resolved");
    checkD(back.banner === null && back.publicPages === "live" && back.publicOrders === "open" && back.title === "T", `storeSees restore (${locale}): no banner, pages live again, orders open`, back);
  }
  const deletionDay = new Date("2026-10-30T10:00:00.000Z");
  const del = lr.storeSeesFor({ from: "closed", status: "scheduled_deletion", reason: "retention", closedAt: QNOW, purgeAfter: deletionDay, suspendNotice: false, locale: "en", timeZone: "Africa/Casablanca", notification: null });
  checkD(del.banner?.includes(lr.storeDay(deletionDay, "en", "Africa/Casablanca")) && del.title === null, "storeSees schedule deletion: the page names the deletion day", del);
  checkD(lr.storeLocaleOf("fr") === "fr" && lr.storeLocaleOf("de") === "ar" && lr.storeLocaleOf(null) === "ar", "the store's locale: ar / fr / en, else the platform default ar");
  if (messageOf("shell.status_reason.fake_orders", "en") === undefined) {
    skips.push("lifecycle storeSees in the store's locale: shell.banner.* / shell.status_reason.* are P2's keys, not on r1/p1 yet; the PLA-§N.2 English texts stand in (fallback: true)");
  }

  // the keys this step's modules answer with exist (a refusal never shows a raw key)
  const stepFiles = ["queue.ts", "queue-rules.ts", "plans.ts", "platform-requests.ts", "requests.ts", "lifecycle-rules.ts", "lifecycle-preview.ts", "lifecycle-actions.ts", "signup-admin.ts"];
  const usedKeys = new Set<string>();
  for (const f of stepFiles) for (const m of source(`src/lib/platform/${f}`).matchAll(/"(console\.[a-z_]+\.[a-z_.]+)"/g)) usedKeys.add(m[1]!);
  const missingKeys = [...usedKeys].filter((k) => !(k in enConsole));
  checkD(usedKeys.size >= 30 && missingKeys.length === 0, `every console.* key the queue, plans, requests and lifecycle modules answer with is in en/console.ts (${usedKeys.size})`, missingKeys);

  // sign-up admin
  const inv = (p: Partial<{ uses: number; usesMax: number; expiresAt: Date | null; revokedAt: Date | null }>) => signupAdmin.inviteStateOf({ uses: 0, usesMax: 1, expiresAt: null, revokedAt: null, ...p }, QNOW);
  checkD(inv({}) === "active" && inv({ uses: 1 }) === "used_up" && inv({ expiresAt: QNOW }) === "expired" && inv({ revokedAt: QNOW, uses: 1, expiresAt: QNOW }) === "revoked" && inv({ uses: 3, usesMax: 10 }) === "active", "invite code state chips: revoked > expired > used up > active");
  checkD(eq(signupAdmin.waitlistSourceOf("cap:2026-10-29"), { kind: "daily_cap", day: "2026-10-29" }) && eq(signupAdmin.waitlistSourceOf("utm:facebook"), { kind: "label", label: "utm:facebook" }) && signupAdmin.waitlistSourceOf(null) === null, "waitlist source: the daily-cap chip for cap:<day>");
  checkD(signupAdmin.waitlistLabel(new Date("2026-10-29T23:30:00.000Z")) === "Waitlist 2026-10-30", "waitlist codes are labelled with the platform day (Casablanca)");

  /* ---------------------------------------------------------------- */
  /* step 5: plans, flags, staff, legal, the domain move              */
  /* ---------------------------------------------------------------- */
  const pr = await import("./plan-rules");
  const fr5 = await import("./flag-rules");
  const sr = await import("./staff-rules");
  const lg = await import("./legal-rules");
  const dm = await import("./domain-move-rules");
  const { LEGAL_SEED, LEGAL_SEED_VERSION } = await import("./data/legal");
  const { POLICY_TEMPLATE_FIELDS } = await import("@/lib/policies/fields");
  const { ENTITLEMENT_KEYS, GiB, MiB } = await import("@/lib/tenancy/entitlement-keys");
  const killKeys = (await import("@/lib/flags/registry")).KILL_SWITCHES;
  const { ADMIN_LOCALES: ADMIN_LOCALE_LIST } = await import("@/lib/i18n/admin");

  // PlanImpact (PLA-§9.2, PD58): ≤ 20 examples, highest usage first, handle order on a tie; shielded stores never counted
  const onPlan = Array.from({ length: 30 }, (_, i) => ({ id: `S${String(i).padStart(2, "0")}`, handle: `shop-${String(i).padStart(2, "0")}`, shielded: new Set<string>(i === 29 ? ["media_bytes", "sheets"] : []) }));
  const usageMap = new Map(onPlan.map((s, i) => [s.id, (i < 25 ? 600 + (i % 7) * 50 : 100) * MiB]));
  const impact = pr.computeImpact({
    stores: onPlan,
    changes: [
      { key: "media_bytes", from: 1 * GiB, to: 500 * MiB },
      { key: "sheets", from: true, to: false },
      { key: "versions_kept_per_page", from: 30, to: 10 },
    ],
    usage: (k) => (k === "media_bytes" ? usageMap : null),
    users: (k) => (k === "sheets" ? new Set(["S01", "S02", "S29"]) : null),
  });
  const media = impact.lowered.find((l) => l.key === "media_bytes")!;
  const usedOrder = media.examples.map((e) => e.used);
  const sortedDesc = usedOrder.every((u, i) => i === 0 || usedOrder[i - 1]! >= u);
  const tieOrder = media.examples.every((e, i, all) => i === 0 || all[i - 1]!.used !== e.used || all[i - 1]!.handle < e.handle);
  checkD(media.examples.length === pr.IMPACT_EXAMPLES_MAX && sortedDesc && tieOrder, "PlanImpact.examples: 20 at most, highest usage first, handle order on a tie", media.examples.slice(0, 4));
  checkD(media.stores === 29 && media.storesAbove === 25 && media.measured, "PlanImpact: the shielded store (an override of the keys) is out of the count; 25 stores above 500 MiB", media);
  const versions = impact.lowered.find((l) => l.key === "versions_kept_per_page")!;
  checkD(versions && !versions.measured && versions.storesAbove === 0 && versions.examples.length === 0, "PlanImpact: a limit without a counter is unmeasured, nobody counted above", versions);
  const sheetsOff = impact.featuresOff.find((f) => f.key === "sheets")!;
  checkD(sheetsOff.stores === 2 && sheetsOff.measured && eq(sheetsOff.examples.map((e) => e.handle), ["shop-01", "shop-02"]), "PlanImpact.featuresOff: the stores using the feature (its marker), the shielded one left out", sheetsOff);
  checkD(impact.stores === 30 && impact.unaffected === 30 - 25, "PlanImpact.unaffected: the stores whose effective values do not change", { stores: impact.stores, unaffected: impact.unaffected });
  checkD(eq(pr.topExamples([{ handle: "b", used: 5 }, { handle: "a", used: 5 }, { handle: null, used: 99 }, { handle: "c", used: 7 }]), [{ handle: "c", used: 7 }, { handle: "a", used: 5 }, { handle: "b", used: 5 }]), "topExamples: no handle → never an example; ties by handle");
  const sentences = pr.impactSentences({
    stores: 12,
    lowered: [{ key: "media_bytes", from: 1 * GiB, to: 500 * MiB, stores: 12, storesAbove: 4, measured: true, examples: [{ handle: "argan-souk", used: Math.round(1.9 * GiB) }, { handle: "maison-nour", used: 812 * MiB }, { handle: "dar-zitoun", used: 640 * MiB }, { handle: "riad-bloom", used: 520 * MiB }] }],
    featuresOff: [{ key: "sheets", stores: 4, measured: true, examples: [] }],
    unaffected: 8,
  });
  checkD(
    sentences[0] === "Lowers media storage for 12 stores; 4 are already above 500 MiB (@argan-souk 1.9 GiB, @maison-nour 812 MiB, @dar-zitoun 640 MiB, @…): they keep their files, new uploads are refused until they are below the limit.",
    "the impact sentence (PLA-§9.2's form): three examples named, then @…",
    sentences[0],
  );
  checkD(sentences[1] === "Sheets sync pauses for 4 stores that are connected.", "the feature-off sentence names what stops", sentences[1]);

  // the effective sentence (PD58)
  const caps = { mediaMiB: 100, mediaMiBBeforeSubmit: 20, membersMax: 2 };
  checkD(pr.effectiveSentence("media_bytes", 1 * GiB) === "Stores on this plan get 1 GiB of media storage.", "effective sentence: 1 GiB of media storage", pr.effectiveSentence("media_bytes", 1 * GiB));
  checkD(pr.effectiveSentence("media_bytes", "default") === "Stores on this plan get 1 GiB of media storage.", "effective sentence: the registry default when the plan leaves the key");
  checkD(pr.effectiveSentence("pages_max", null) === "Stores on this plan get unlimited pages." && pr.effectiveSentence("pages_max", 1) === "Stores on this plan get 1 page.", "effective sentence: unlimited, and the singular");
  checkD(pr.effectiveSentence("ai_credits_month", 1500) === "Stores on this plan get 1,500 AI credits a month.", "effective sentence: grouped thousands", pr.effectiveSentence("ai_credits_month", 1500));
  checkD(pr.effectiveSentence("orders_month_soft", null) === "Stores on this plan have no monthly order threshold." && pr.effectiveSentence("orders_month_soft", 2000) === "Stores on this plan see a banner past 2,000 orders a month. Orders are never refused.", "effective sentence: the soft order threshold never refuses");
  checkD(pr.effectiveSentence("sheets", false) === "Google Sheets sync: off for stores on this plan." && pr.effectiveSentence("take_orders", true) === "Orders can't be switched off by a plan or an override.", "effective sentence: a feature, and take_orders' locked note");
  checkD(pr.pendingSentence("media_bytes", 1 * GiB, caps) === "Pending stores get 20 MiB, then 100 MiB once they submit for review, until approval.", "pending sentence: the two media tiers (D69)", pr.pendingSentence("media_bytes", 1 * GiB, caps));
  checkD(pr.pendingSentence("members_max", 10, caps) === "Pending stores get 2 members until approval." && pr.pendingSentence("pages_max", 50, caps) === null, "pending sentence: a capped limit says the cap wins while pending; an uncapped one says nothing");
  checkD(pr.pendingSentence("media_bytes", 10 * MiB, caps) === "Pending stores get 10 MiB of media storage until approval.", "pending sentence: a plan value under the cap is what pending stores get", pr.pendingSentence("media_bytes", 10 * MiB, caps));
  checkD(pr.formatBytes(Math.round(1.9 * GiB)) === "1.9 GiB" && pr.formatBytes(812 * MiB) === "812 MiB" && pr.formatBytes(2 * GiB) === "2 GiB" && pr.formatBytes(64 * 1024) === "64 KiB", "formatBytes: binary units");

  // the editor rows (PLA-§9.2): the Later releases list of R1, campaigns and short links under Limits
  const rows5 = pr.planEditorRows({ limits: { media_bytes: 500 * MiB }, features: { sheets: false } }, caps);
  const later = rows5.filter((r) => r.group === "later").map((r) => r.key).sort();
  checkD(eq(later, ["accounting", "api_keys", "commissions", "coupons", "custom_domain", "custom_domains_max", "experiments", "products_max", "reviews", "webhooks", "webhooks_max"]), "editor rows: Later releases are exactly PLA-§9.2's R1 list", later);
  checkD(rows5.find((r) => r.key === "campaigns_max")?.group === "limits" && rows5.find((r) => r.key === "short_links_max")?.group === "limits", "editor rows: campaigns_max and short_links_max under Limits");
  checkD(rows5.length === ENTITLEMENT_KEYS.length && rows5.find((r) => r.key === "take_orders")?.locked === "take_orders" && rows5.find((r) => r.key === "products_max")?.locked === "release", "editor rows: every registry key, take_orders and Later releases locked");
  const mediaRow = rows5.find((r) => r.key === "media_bytes")!;
  checkD(mediaRow.planValue === 500 * MiB && mediaRow.registryDefault === 1 * GiB && mediaRow.effective === 500 * MiB && mediaRow.unit === "bytes" && mediaRow.sentence === "Stores on this plan get 500 MiB of media storage.", "editor row: registry default, plan value, effective sentence (three explanations)", mediaRow);
  checkD(rows5.find((r) => r.key === "pages_max")?.planValue === "default", "editor row: a key the plan leaves reads Use default");
  const missingEnt = ENTITLEMENT_KEYS.filter((k) => !(`console.entitlement.${k}` in enConsole) || !(`console.entitlement.${k}.desc` in enConsole));
  checkD(missingEnt.length === 0, "every entitlement key has console.entitlement.<key> and .desc", missingEnt);

  // the patch (validation of PLA-§9.2)
  const bags = { limits: { media_bytes: 1 * GiB }, features: {} };
  const code = (patch: Record<string, unknown>) => {
    const c = pr.checkPlanPatch(bags, patch as never);
    return c.ok ? "ok" : `${c.code}:${c.key}`;
  };
  checkD(code({ take_orders: false }) === "take_orders_locked:take_orders", "a plan can't switch take_orders off (PD8)");
  checkD(code({ nope: 1 }) === "unknown_key:nope" && code({ products_max: 10 }) === "release_locked:products_max", "unknown keys and later-release keys refused");
  checkD(code({ pages_max: -1 }) === "value_type:pages_max" && code({ pages_max: 1.5 }) === "value_type:pages_max" && code({ sheets: "yes" }) === "value_type:sheets" && code({ pages_max: true }) === "value_type:pages_max", "limits: integers ≥ 0 or null; features: booleans");
  checkD(code({ media_bytes: 1 * GiB }) === "empty:" && code({}) === "empty:", "a patch that changes nothing answers empty");
  const patched = pr.checkPlanPatch(bags, { media_bytes: "default", pages_max: null, sheets: false });
  checkD(patched.ok && !("media_bytes" in patched.next.limits) && patched.next.limits.pages_max === null && patched.next.features.sheets === false && eq(patched.changes.map((c) => c.key), ["media_bytes", "pages_max", "sheets"]), "a patch: default drops the key, null is unlimited, changes in registry order", patched);
  checkD(patched.ok && eq(pr.planDiff(patched.changes).media_bytes, { from: 1 * GiB, to: "default" }), "the audit diff keeps from / to per changed key");
  checkD(pr.patchHash({ b: 1, a: 2 }) === pr.patchHash({ a: 2, b: 1 }), "the impact cache key ignores key order");

  // the entitlements job's clocks (PLA-§9.4)
  const NOW5 = new Date("2026-10-29T12:00:00.000Z");
  const H = 3_600_000;
  checkD(pr.boostEndingDue({ source: "boost", expiresAt: new Date(NOW5.getTime() + 71 * H) }, NOW5) && !pr.boostEndingDue({ source: "boost", expiresAt: new Date(NOW5.getTime() + 73 * H) }, NOW5) && !pr.boostEndingDue({ source: "boost", expiresAt: new Date(NOW5.getTime() - H) }, NOW5) && !pr.boostEndingDue({ source: "override", expiresAt: new Date(NOW5.getTime() + H) }, NOW5), "boost_ending is due within 3 days of a boost's expiry, never for an override or an expired row");
  checkD(pr.purgeBefore(NOW5).toISOString() === "2026-09-29T12:00:00.000Z", "rows expired for more than 30 days are deleted");
  checkD(pr.boostEndingKey("S1", "media_bytes", new Date(1)) !== pr.boostEndingKey("S1", "media_bytes", new Date(2)), "a renewed boost (new expiry) gets its own ending notice");
  const grant = (p: Partial<Parameters<typeof plansMod.checkEntitlementGrant>[0]>) => plansMod.checkEntitlementGrant({ key: "media_bytes", source: "boost", value: 2 * GiB, expiresAt: new Date(NOW5.getTime() + 7 * 24 * H), reason: "Ramadan", ...p }, NOW5);
  checkD(!grant({ key: "take_orders", source: "override", value: false, expiresAt: null }).ok && grant({}).ok && !grant({ expiresAt: new Date(NOW5.getTime() + 91 * 24 * H) }).ok, "overrides refuse take_orders false; a boost lasts 90 days at most");

  // kill switches and flags (PLA-§12)
  checkD(fr5.killTypedFor("platform_read_only", true) === "read-only" && fr5.killTypedFor("signups_enabled", false) === "stop sign-ups" && fr5.killTypedFor("platform_read_only", false) === null && fr5.killTypedFor("signups_enabled", true) === null && fr5.killTypedFor("uploads_enabled", false) === null, "typed confirmation only to trip read-only and sign-ups (switching back needs none)");
  checkD(fr5.killState("platform_read_only", true) === "read_only_on" && fr5.killState("platform_read_only", false) === "off" && fr5.killState("publishing_enabled", false) === "stopped" && fr5.killState("publishing_enabled", true) === "normal", "kill states: Normal / Stopped, and Off / Read-only on");
  const killMissing = killKeys.flatMap((k) => (["name", "effect", "stops", "keeps"] as const).map((part) => `console.kill.${k}.${part}`)).filter((key) => !(key in enConsole));
  checkD(killMissing.length === 0 && eq([...fr5.KILL_ORDER], [...killKeys]), "every kill switch has its name, effect, stops and keeps in en", killMissing);
  checkD(killKeys.every((k) => ADMIN_LOCALE_LIST.every((l) => fr5.killBanner(k, l).text.length > 10)), "every kill switch has a tenant banner in ar / fr / en (P2's shell.kill.<key>, else the reference text)");
  checkD(fr5.KILL_AFFECTS.signups_enabled === "none" && fr5.KILL_AFFECTS.sheets_sync_enabled === "sheets" && fr5.KILL_AFFECTS.capi_enabled === "pixels" && fr5.KILL_AFFECTS.platform_read_only === "live_states", "affected stores per switch (PLA-§12.1)");
  const fe = (type: "boolean" | "number" | "string" | "json", input: { default: unknown; rules: unknown }) => {
    const c = fr5.checkFlagEdit(type, input);
    return c.ok ? "ok" : `${c.field}:${c.code}`;
  };
  checkD(fe("boolean", { default: true, rules: [{ when: { plans: ["pro"] }, value: true }, { when: {}, value: true, rollout: 20 }] }) === "ok", "flag editor: a default and ordered rules of the type");
  checkD(fe("boolean", { default: "x", rules: [] }) === "default:value_type" && fe("json", { default: "{bad", rules: [] }) === "default:json_invalid" && fe("json", { default: '{"a":1}', rules: [] }) === "ok", "flag editor: the default's type, JSON validated");
  checkD(fe("boolean", { default: true, rules: [{ when: { country: ["MA"] }, value: true }] }) === "rules.0.when:condition_unknown" && fe("boolean", { default: true, rules: [{ when: { markets: ["ma"] }, value: true }] }) === "rules.0.when.markets:condition_invalid" && fe("boolean", { default: true, rules: [{ when: {}, value: true, rollout: 101 }] }) === "rules.0.rollout:rollout_invalid", "flag editor: unknown conditions, bad values, rollout 0-100 refused");
  checkD(fe("boolean", { default: true, rules: Array.from({ length: 21 }, () => ({ when: {}, value: true })) }) === "rules:rules_too_many", "flag editor: 20 rules at most");
  checkD(fr5.rulesSummary([{ when: { plans: ["pro"] }, value: true }, { when: {}, value: true, rollout: 20 }], "boolean") === "pro plan → on · 20 % of stores → on", "the rules column: Pro plan → on · 20 % of stores → on", fr5.rulesSummary([{ when: { plans: ["pro"] }, value: true }, { when: {}, value: true, rollout: 20 }], "boolean"));
  checkD(fr5.scopeIdOk("store", "01JTOS00000000000000000001") && !fr5.scopeIdOk("store", "pro") && fr5.scopeIdOk("plan", "pro") && fr5.scopeIdOk("market", "MA") && !fr5.scopeIdOk("market", "Morocco"), "override targets fit their scope");
  for (const k of ["value_type", "json_invalid", "rules_invalid", "rules_too_many", "condition_unknown", "condition_invalid", "rollout_invalid"]) checkD(`console.flag.${k}` in enConsole, `console.flag.${k} exists`);

  // staff (PLA-§14.1)
  const inv5 = (p: Partial<{ acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }>) => sr.staffInviteState({ acceptedAt: null, revokedAt: null, expiresAt: new Date(NOW5.getTime() + H), ...p }, NOW5);
  checkD(inv5({}) === "valid" && inv5({ expiresAt: NOW5 }) === "expired" && inv5({ revokedAt: NOW5, expiresAt: NOW5 }) === "revoked" && inv5({ acceptedAt: NOW5, revokedAt: NOW5 }) === "used", "staff invite state: used > revoked > expired > valid; expiry at the instant is expired");
  checkD(sr.STAFF_INVITE_TTL_MS === 72 * H && sr.STAFF_INVITES_PENDING_MAX === 10 && !sr.isInvitableStaffRole("super_admin") && sr.isInvitableStaffRole("analyst"), "staff invites: 72 h, 10 pending, never super_admin directly (PD7)");
  const supers = (list: [string, boolean, boolean][]) => list.map(([id, totpEnabled, disabled]) => ({ id, totpEnabled, disabled }));
  checkD(sr.leavesNoSuperAdmin(supers([["A", true, false]]), "A") && !sr.leavesNoSuperAdmin(supers([["A", true, false], ["B", true, false]]), "A") && sr.leavesNoSuperAdmin(supers([["A", true, false], ["B", false, false], ["C", true, true]]), "A") && !sr.leavesNoSuperAdmin(supers([["A", true, false]]), "Z"), "the last active super_admin with TOTP can't go; one without TOTP or disabled doesn't count");
  checkD(sr.staffStateOf({ totpEnabled: false }) === "waiting_2fa" && sr.staffStateOf({ totpEnabled: true }) === "active", "staff state: Waiting for 2FA until TOTP");

  // legal (PLA-§13.4, §13.6)
  checkD(eq(lg.placeholderProblem("tos", "Hello {{inspection}}"), { code: "placeholders_not_allowed", names: ["inspection"] }), "legal: a platform document refuses placeholders");
  checkD(eq(lg.placeholderProblem("store_returns", "Window: {{returns.windowDays}} {{returns.days}} {{ hack }}"), { code: "unknown_placeholder", names: ["returns.days", "hack"] }), "legal: a store template refuses fields P3 does not export", lg.placeholderProblem("store_returns", "Window: {{returns.windowDays}} {{returns.days}} {{ hack }}"));
  checkD(lg.placeholderProblem("store_returns", "Window: {{returns.windowDays}}, \\{{literal}}") === null && lg.placeholderProblem("tos", "No placeholder here") === null, "legal: known fields pass, an escaped \\{{ is text");
  checkD(eq(lg.lineDiff("a\nb\nc", "a\nB\nc\nd"), [{ op: "same", text: "a" }, { op: "del", text: "b" }, { op: "add", text: "B" }, { op: "same", text: "c" }, { op: "add", text: "d" }]), "legal: the line diff", lg.lineDiff("a\nb\nc", "a\nB\nc\nd"));
  const bigA = Array.from({ length: 3_000 }, (_, i) => `a${i}`).join("\n");
  const bigB = Array.from({ length: 3_000 }, (_, i) => `b${i}`).join("\n");
  const tBig = performance.now();
  const bigDiff = lg.lineDiff(bigA, bigB);
  checkD(eq(lg.diffStats(bigDiff), { added: 3_000, removed: 3_000 }) && performance.now() - tBig < 1_500, "legal: a full rewrite falls back to the replacement in bounded time");
  const pub = [
    { id: "1", kind: "tos", locale: "fr", version: 2 },
    { id: "2", kind: "tos", locale: "fr", version: 3 },
    { id: "3", kind: "tos", locale: "en", version: 1 },
    { id: "4", kind: "privacy", locale: "ar", version: 1 },
  ];
  checkD(eq(lg.pickAccepted(pub, "ar").map((d) => d.id), ["2", "4"]) && eq(lg.pickAccepted(pub, "en").map((d) => d.id), ["3", "4"]) && eq(lg.pickAccepted(pub, null).map((d) => d.id), ["2", "4"]), "legal: the published version per kind in locale → fr → en → ar; a kind with none is not asked");
  checkD(eq(lg.kindsWithoutPublished(pub), ["aup"]) && eq(lg.kindsWithoutPublished([]), ["tos", "privacy", "aup"]), "legal: the red lines name the platform kinds without a published version");
  checkD(lg.typedMatches(" Publish Unreviewed ", lg.PUBLISH_UNREVIEWED_WORD) && !lg.typedMatches("publish", lg.PUBLISH_UNREVIEWED_WORD) && lg.typedMatches("reviewed", lg.REVIEWED_WORD), "legal: the typed confirmations");
  // the seed (PD49): every R1 kind × locale, no DPA, no invented number, address or link, valid placeholders
  const seedKeys = LEGAL_SEED.map((d) => `${d.kind}/${d.locale}`).sort();
  const wantKeys = lg.R1_LEGAL_KINDS.flatMap((k) => lg.LEGAL_LOCALES.map((l) => `${k}/${l}`)).sort();
  checkD(LEGAL_SEED_VERSION >= 1 && eq(seedKeys, wantKeys) && !LEGAL_SEED.some((d) => d.kind === "dpa"), `legal seed: ${wantKeys.length} drafts, every R1 kind in ar / fr / en, no DPA`, seedKeys);
  const seedProblems = LEGAL_SEED.flatMap((d) => {
    const out: string[] = [];
    if (d.title.length < 1 || d.title.length > lg.LEGAL_TITLE_MAX) out.push(`${d.kind}/${d.locale}: title`);
    if (d.body.length > lg.LEGAL_BODY_MAX) out.push(`${d.kind}/${d.locale}: body`);
    if (lg.placeholderProblem(d.kind, d.body, POLICY_TEMPLATE_FIELDS)) out.push(`${d.kind}/${d.locale}: placeholders`);
    if (/\d{5,}|@|https?:|www\./i.test(d.body)) out.push(`${d.kind}/${d.locale}: a number, e-mail or link`);
    if (/<[a-z/!]/i.test(d.body)) out.push(`${d.kind}/${d.locale}: raw HTML`);
    if (md.toPlainText(d.body, lg.isStoreKind(d.kind) ? { placeholders: { fields: POLICY_TEMPLATE_FIELDS } } : {}).length < 80) out.push(`${d.kind}/${d.locale}: renders empty`);
    return out;
  });
  checkD(seedProblems.length === 0, "legal seed: titles and bodies fit, placeholders known (store templates only), no number, e-mail, link or HTML", seedProblems);
  const fieldsPerLocale = (kind: string) => lg.LEGAL_LOCALES.map((l) => lg.templateFields(LEGAL_SEED.find((d) => d.kind === kind && d.locale === l)!.body).sort().join(","));
  checkD(lg.STORE_KINDS.every((k) => new Set(fieldsPerLocale(k)).size === 1), "legal seed: each store template names the same fields in ar, fr and en");

  // the domain move (PLA-§16.3, §16.5)
  const envStep = dm.DOMAIN_STEPS.find((s) => s.id === "env_replace")!;
  checkD(/\brestart\b/i.test(`${envStep.title} ${envStep.detail}`) && !/rebuild/i.test(JSON.stringify(dm.DOMAIN_STEPS)) && !/rebuild/i.test(JSON.stringify(dm.DOMAIN_CHECKS)), "domain checklist: the env step says restart, and no text says rebuild (ENGC-26)");
  checkD(/ADMIN_HOST=console\.<domain>/.test(envStep.detail) && ["PLATFORM_URL", "PUBLIC_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY", "BEHIND_CLOUDFLARE=1", "LEGACY_PLATFORM_HOSTS", "TRUSTED_PROXY_HOPS"].every((k) => envStep.detail.includes(k)), "domain checklist: the env step names every key the move adds (core §C.10 step 1)");
  const order = dm.DOMAIN_STEPS.map((s) => s.id);
  checkD(new Set(order).size === order.length && order.indexOf("allowlist_check") < order.indexOf("nameservers") && order.indexOf("worker") < order.indexOf("env_replace") && order.indexOf("env_replace") < order.indexOf("rerender"), "domain checklist: unique steps, the allowlist check before the nameservers, env before the re-render", order);
  checkD(eq([...dm.RUNNABLE_CHECKS], ["V3", "V7", "V8", "V10", "V12", "V13"]) && dm.DOMAIN_CHECKS.length === 13, "domain checks: V1 … V13, the server runs V3, V7, V8, V10, V12, V13");
  checkD(dm.SKIP_TEXT.sModeOff === "S mode is off" && dm.SKIP_TEXT.adminHostUnset === "ADMIN_HOST not set (expected before the move)", "domain checks: the answers on the temporary domain (PLA-§16.5)");
  checkD(dm.adminHostLine({ sMode: true, adminHost: null }) === "shared_origin" && dm.adminHostLine({ sMode: false, adminHost: null }) === "not_yet" && dm.adminHostLine({ sMode: true, adminHost: "console.x.ma" }) === "own_host", "status card: the ADMIN_HOST line (red while S mode runs without it)");
  checkD(dm.signupDefaultFor({ sMode: true, v13Passed: false, turnstile: true }) === "invite" && dm.signupDefaultFor({ sMode: true, v13Passed: true, turnstile: true }) === "approval" && dm.signupDefaultFor({ sMode: false, v13Passed: true, turnstile: true }) === "invite", "status card: the D9 default flips only with S mode and V13");
  checkD(dm.noteOf({ message: "m", answers: ["x".repeat(400)] }).length === dm.CHECK_NOTE_MAX, "a check's note is cut to 200 characters");

  // the keys this step's modules answer with exist (a refusal never shows a raw key)
  const step5Files = ["plans.ts", "plan-rules.ts", "flags.ts", "flag-rules.ts", "staff.ts", "legal.ts", "legal-rules.ts", "domain-move.ts", "op-once.ts"];
  const used5 = new Set<string>();
  for (const f of step5Files) for (const m of source(`src/lib/platform/${f}`).matchAll(/"(console\.[a-z_]+\.[a-z_.]+)"/g)) used5.add(m[1]!);
  const missing5 = [...used5].filter((k) => !(k in enConsole));
  checkD(used5.size >= 60 && missing5.length === 0, `every console.* key the plans, flags, staff, legal and domain modules answer with is in en/console.ts (${used5.size})`, missing5);
  for (const k of ["unknown_key", "release_locked", "value_type"]) checkD(`console.plans.${k}` in enConsole, `console.plans.${k} exists (a refused patch)`);
  for (const k of ["placeholders_not_allowed", "unknown_placeholder"]) checkD(`console.legal.${k}` in enConsole, `console.legal.${k} exists (a refused body)`);

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
