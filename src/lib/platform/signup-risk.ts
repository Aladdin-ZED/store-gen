import "server-only";
/**
 * Signup risk score (docs/STORE-SAAS.md §B.2 step 5, §F.8; platform.md PLA-§3.4, PD3, PD31, PD52, PL-03): the widened
 * contract `scoreSignup(input, deps?) → { score, flags, band, signals }` in the pattern of `scoreRisk`
 * (src/lib/orders/risk.ts). `signupAction` and the `/app/new` action pass the full input (T2, src/lib/auth/signup.ts).
 *
 *   const s = await scoreSignup({ email, phoneE164, name, storeName, handle, ip, ua, deviceId, turnstile, formMs, … });
 *   s.band            // "fast" | "review" | "hold" | "reject_candidate" (a triage order, never a refusal: R-D12)
 *   s.signals         // domains, countries, labels and counts only: never a raw e-mail, phone, IP or user agent
 *
 * Every signal of PLA-§3.4.1 with points overridable by `platform.signup.weights`, clamped 0-100. The lookups (MX,
 * identity links, the network's velocity, the protected terms, the trusted-creator check, the setting) run in parallel
 * inside one budget of 1.8 s, so the whole call stays under core §B.2's 2 s:
 * - an MX lookup that does not finish (or fails) is `mx_unknown`, 0 points, `partial: true`: it fails open;
 * - a lookup that guards against abuse (identity links and bans, velocity, protected terms, the setting) that fails
 *   or runs out of time sets `partial: true` and keeps the band out of the fast lane (`review` at best), because a
 *   ban or a brand nobody checked must never auto-approve;
 * - the call never throws: anything unexpected answers score 0, band `review`, `partial: true`.
 *
 * The lookups are `SignupRiskDeps`, injectable for the selftest (no network, no DB). The defaults (DNS, MariaDB, the
 * caches) live in ./signup-deps.ts and are loaded only when a dependency is not injected.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { DEVICE_MARKER_RE } from "@/lib/auth/config";
import { hashIp, hmac } from "@/lib/security/crypto";
import { PlatformSettingSchema, type PlatformSetting } from "@/lib/settings/keys/platform";
import disposableList from "./data/disposable-domains.json";
import { brandTokens, matchBrandTerm, normalizeEmailForIdentity, splitEmail } from "./normalize";
import { bandFor, dupPhonePoints, pointsFor, scoreOf, thresholdsOrDefault } from "./signup-band";
import type { IdentityKind, SignupBand, SignupFlag, SignupFlagCode, SignupSignals } from "./types";

export type { IdentityKind, SignupBand, SignupFlag, SignupFlagCode, SignupMode, SignupSignals, SignupThresholds } from "./types";
export {
  BAND_ORDER,
  DEFAULT_SIGNUP_POINTS,
  DEFAULT_THRESHOLDS,
  HOLD_CLASS,
  SIGNUP_FLAG_CODES,
  autoApprove,
  bandFor,
  explainBand,
  explainFlag,
  isSignupFlagCode,
  pointsFor,
  scoreOf,
  type BandExplanation,
} from "./signup-band";

export interface SignupRiskInput {
  email: string;
  phoneE164: string | null;
  name: string;
  storeName: string;
  handle: string;
  ip: string | null;
  ua: string | null;
  deviceId: string | null;
  turnstile: "ok" | "missing" | "unverified" | "off";
  formMs: number | null;
  market: string;
  mode: "landing" | "store" | "both";
  modeInterest?: "store" | "both";
  locale: "ar" | "fr" | "en";
  via: SignupSignals["inputs"]["via"];
  inviteLabel?: string;
  existingUserId?: string; // /app/new: the creator
}

export interface SignupScore {
  score: number; // 0-100
  flags: SignupFlag[];
  band: SignupBand;
  signals: SignupSignals;
}

export interface IdentityMatch {
  kind: IdentityKind;
  /** other users sharing the hashed value */
  users: number;
  /** of them, banned (`users.disabled`) */
  banned: number;
  /** of them, linked in the last 24 h */
  recentUsers24h: number;
}

export interface ProtectedTermRow {
  term: string;
  kind: string;
  match: "exact" | "substring" | "skeleton";
}

/** Injectable for the selftest (no network, no DB). */
export interface SignupRiskDeps {
  now(): number;
  resolveMx(domain: string): Promise<"ok" | "none" | "null" | "timeout">;
  identityMatches(links: readonly { kind: IdentityKind; valueHash: string }[]): Promise<IdentityMatch[]>;
  velocity(netHash: string): Promise<boolean>; // p:signup:net:<hash> over 3/day
  protectedTerms(): Promise<readonly ProtectedTermRow[]>;
  trustedCreator(userId: string): Promise<boolean>;
  /** P1 widening: `platform.signup` (weights, thresholds, allowed markets), read through the settings registry */
  signupSetting(): Promise<PlatformSetting["signup"]>;
  /** P1 widening for the selftest: the lookup budget in ms (default `LOOKUP_BUDGET_MS`) */
  budgetMs?: number;
}

/** The lookups' share of core §B.2's 2 s (the rest is the scoring and the caller's own work). */
export const LOOKUP_BUDGET_MS = 1_800;

/**
 * Large mailbox providers: an MX lookup would only cost time (PLA-§3.4.3). Their MX never changes, and an address
 * there is no signal either way.
 */
export const MX_SKIP_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "menara.ma",
]);

const DISPOSABLE: ReadonlySet<string> = new Set(disposableList.domains);

/** The domain or one of its parent domains is on the vendored CC0 list (core §F.8). */
export function isDisposableDomain(domain: string): boolean {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < labels.length - 1; i++) if (DISPOSABLE.has(labels.slice(i).join("."))) return true;
  return false;
}

/**
 * The BOT_UA pattern of src/lib/orders/risk.ts (not exported there; `test:platform` pins this copy to it, and CCR
 * r1-p1-1 asks for one shared export).
 */
const BOT_UA = /bot|crawl|spider|curl|wget|python|httpclient|okhttp|java\/|go-http|axios|node-fetch|headless|phantom|selenium|puppeteer|playwright/i;

/**
 * "Chrome · Windows" style label from a user agent (best effort, no fingerprinting): the `describeUserAgent` of
 * src/lib/admin-data/security.ts, whose module loads the request and database stack. `test:platform` pins this copy
 * to it line by line; CCR r1-p1-1 asks for a pure shared export.
 */
function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

/**
 * The hashed links of the applicant (PLA-§3.4.3), computed exactly as T2's `signupIdentityLinks` writes them
 * (src/lib/auth/identity.ts): `hmac(value, "identity:<kind>")` over the normalised e-mail, the E.164 phone, the
 * network hash and a well-formed device marker. The network hash is returned for the velocity bucket.
 */
export function identityLinksFor(input: Pick<SignupRiskInput, "email" | "phoneE164" | "ip" | "deviceId">): {
  links: { kind: IdentityKind; valueHash: string }[];
  netHash: string | null;
} {
  const link = (kind: IdentityKind, value: string) => ({ kind, valueHash: hmac(value, `identity:${kind}`) });
  const links = [link("email_norm", normalizeEmailForIdentity(input.email))];
  if (input.phoneE164) links.push(link("phone", input.phoneE164));
  let netHash: string | null = null;
  if (input.ip && input.ip !== "0.0.0.0") {
    try {
      netHash = hashIp(input.ip);
    } catch {
      netHash = null;
    }
  }
  if (netHash) links.push(link("net", netHash));
  if (typeof input.deviceId === "string" && DEVICE_MARKER_RE.test(input.deviceId)) links.push(link("device", input.deviceId));
  return { links, netHash };
}

/* ------------------------------------------------------------------ */
/* The score                                                           */
/* ------------------------------------------------------------------ */

const DEP_KEYS = ["now", "resolveMx", "identityMatches", "velocity", "protectedTerms", "trustedCreator", "signupSetting"] as const;

type Settled<T> = { ok: true; value: T } | { ok: false };
const TIMEOUT = Symbol("timeout");

/** The signals input block (safe: a domain, a country, labels, counts). */
function inputsOf(input: SignupRiskInput, emailDomain: string, phoneCountry: string | null): SignupSignals["inputs"] {
  return {
    emailDomain: emailDomain.slice(0, 120),
    phoneCountry,
    market: input.market.slice(0, 8),
    mode: input.mode,
    ...(input.modeInterest ? { modeInterest: input.modeInterest } : {}),
    locale: input.locale,
    uaLabel: describeUserAgent(input.ua),
    turnstile: input.turnstile,
    formMs: input.formMs,
    via: input.via,
  };
}

function phoneCountryOf(phone: string | null): string | null {
  if (!phone) return null;
  try {
    return parsePhoneNumberFromString(phone)?.country ?? null;
  } catch {
    return null;
  }
}

/** The answer when scoring itself fails: no flag, the review band, `partial` (core §B.2: never block a signup). */
function fallbackScore(input: SignupRiskInput, ms: number): SignupScore {
  const domain = splitEmail(input.email)?.domain ?? "";
  return {
    score: 0,
    flags: [],
    band: "review",
    signals: { v: 1, flags: [], band: "review", inputs: inputsOf(input, domain, null), cluster: { users: 0, banned: 0, kinds: [] }, partial: true, ms },
  };
}

/** The input's brand fields, in the order the flags report them. */
function brandFields(input: SignupRiskInput, local: string): { field: "store_name" | "handle" | "email"; value: string }[] {
  return [
    { field: "store_name", value: input.storeName },
    { field: "handle", value: input.handle },
    { field: "email", value: local },
  ];
}

export async function scoreSignup(input: SignupRiskInput, deps?: Partial<SignupRiskDeps>): Promise<SignupScore> {
  const injected: Partial<SignupRiskDeps> = {};
  for (const [k, v] of Object.entries(deps ?? {})) if (v !== undefined) (injected as Record<string, unknown>)[k] = v;
  const clock = injected.now ?? Date.now;
  let started = 0;
  try {
    started = clock();
    const missing = DEP_KEYS.some((k) => injected[k] === undefined);
    const defaults = missing ? (await import("./signup-deps")).signupRiskDefaults(input) : null;
    const d = { ...defaults, ...injected } as SignupRiskDeps;
    return await scoreWith(input, d, started);
  } catch (err) {
    console.error("[signup-risk] score failed:", err instanceof Error ? err.name : "unknown");
    let ms = 0;
    try {
      ms = Math.max(0, Math.round(clock() - started));
    } catch {
      ms = 0;
    }
    return fallbackScore(input, ms);
  }
}

async function scoreWith(input: SignupRiskInput, d: SignupRiskDeps, started: number): Promise<SignupScore> {
  const email = splitEmail(input.email);
  const domain = email?.domain ?? "";
  const disposable = domain !== "" && isDisposableDomain(domain);
  const { links, netHash } = identityLinksFor(input);
  const wantsMx = domain !== "" && !disposable && !MX_SKIP_DOMAINS.has(domain);
  const wantsTrust = input.via === "app_new" && !!input.existingUserId;

  // every lookup at once, inside one deadline; a lookup still running at the deadline counts as not answered
  const budget = typeof d.budgetMs === "number" && d.budgetMs >= 0 ? d.budgetMs : LOOKUP_BUDGET_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), budget);
  });
  const settle = async <T>(run: () => Promise<T>): Promise<Settled<T>> => {
    try {
      const value = await Promise.race([run(), deadline]);
      return value === TIMEOUT ? { ok: false } : { ok: true, value: value as T };
    } catch {
      return { ok: false };
    }
  };
  const none = <T>(value: T): Promise<Settled<T>> => Promise.resolve({ ok: true, value });
  let lookups;
  try {
    lookups = await Promise.all([
      settle(() => d.signupSetting()),
      wantsMx ? settle(() => d.resolveMx(domain)) : none<"ok" | "none" | "null" | "timeout">("ok"),
      settle(() => d.identityMatches(links)),
      netHash ? settle(() => d.velocity(netHash)) : none(false),
      settle(() => d.protectedTerms()),
      wantsTrust ? settle(() => d.trustedCreator(input.existingUserId!)) : none(false),
    ]);
  } finally {
    clearTimeout(timer);
  }
  const [settingR, mxR, matchesR, velocityR, termsR, trustR] = lookups;

  // a guard that did not answer keeps the signup out of the fast lane
  let unguarded = !settingR.ok;
  const signup: PlatformSetting["signup"] = settingR.ok ? settingR.value : PlatformSettingSchema.parse({}).signup;
  const weights = signup.weights;
  const flags: SignupFlag[] = [];
  const add = (code: SignupFlagCode, evidence?: SignupFlag["evidence"], points = pointsFor(code, weights)) => {
    flags.push(evidence ? { code, points, evidence } : { code, points });
  };

  // the e-mail domain
  let partial = false;
  if (disposable) add("disposable_email", { domain });
  const mx = mxR.ok ? mxR.value : "timeout";
  if (wantsMx && mx === "null") add("null_mx", { domain });
  else if (wantsMx && mx === "none") add("no_mx", { domain });
  else if (wantsMx && mx === "timeout") {
    add("mx_unknown");
    partial = true;
  }

  // protected terms on the store name, the handle and the e-mail's local part
  if (termsR.ok) {
    const fields = brandFields(input, email?.local ?? "").map((f) => ({ field: f.field, readings: brandTokens(f.value) }));
    let exact: { term: string; field: string } | null = null;
    let near: { term: string; field: string } | null = null;
    let offensive: string | null = null;
    for (const t of termsR.value) {
      const isOffensive = t.kind === "offensive";
      for (const f of fields) {
        const m = matchBrandTerm(f.readings, t);
        if (!m) continue;
        if (isOffensive) offensive ??= f.field;
        else if (m === "exact") exact ??= { term: t.term, field: f.field };
        else if (m === "near" && !fields.some((g) => matchBrandTerm(g.readings, t) === "exact")) near ??= { term: t.term, field: f.field };
      }
    }
    if (exact) add("brand_exact", exact);
    if (near) add("brand_near", near);
    if (offensive) add("offensive_term", { field: offensive });
  } else unguarded = true;

  // the identity cluster (hashed links only)
  const cluster: SignupSignals["cluster"] = { users: 0, banned: 0, kinds: [] };
  if (matchesR.ok) {
    const by = new Map(matchesR.value.map((m) => [m.kind, m]));
    const counted = (kind: IdentityKind, users: number) => {
      if (users <= 0) return;
      cluster.users = Math.max(cluster.users, users);
      if (!cluster.kinds.includes(kind)) cluster.kinds.push(kind);
    };
    const byEmail = by.get("email_norm");
    const phone = by.get("phone");
    const net = by.get("net");
    const device = by.get("device");
    if (byEmail && byEmail.users >= 1) {
      add("dup_email_norm", { users: byEmail.users });
      counted("email_norm", byEmail.users);
    }
    if (phone && phone.users >= 1) {
      add("dup_phone", { users: phone.users }, dupPhonePoints(phone.users, weights));
      counted("phone", phone.users);
    }
    if (net && net.recentUsers24h >= 2) {
      add("dup_network", { users: net.recentUsers24h });
      counted("net", net.recentUsers24h);
    }
    if (device && device.users >= 1) {
      add("dup_device", { users: device.users });
      counted("device", device.users);
    }
    const banned = Math.max(0, ...matchesR.value.map((m) => m.banned));
    if (banned > 0) {
      add("linked_banned", { banned });
      cluster.banned = banned;
      for (const m of matchesR.value) if (m.banned > 0) counted(m.kind, m.users);
    }
  } else unguarded = true;

  if (velocityR.ok) {
    if (velocityR.value) add("velocity_network");
  } else unguarded = true;

  // the human check is scored only where it is not a gate (invite mode, core §B.2 step 2): elsewhere a missing or
  // failed token never reaches the scorer
  if (input.turnstile === "missing") add("turnstile_missing");
  else if (input.turnstile === "unverified") add("turnstile_unverified");

  if (typeof input.formMs === "number" && Number.isFinite(input.formMs)) {
    const ms = Math.max(0, Math.round(input.formMs));
    if (ms < 4_000) add("too_fast", { ms });
    else if (ms < 10_000) add("fast", { ms });
  }

  const uaLabel = describeUserAgent(input.ua);
  if (!input.ua || !input.ua.trim()) add("no_ua", { uaLabel });
  else if (BOT_UA.test(input.ua)) add("bot_ua", { uaLabel });

  const phoneCountry = phoneCountryOf(input.phoneE164);
  if (phoneCountry && phoneCountry !== input.market) add("phone_market_mismatch", { phoneCountry, market: input.market.slice(0, 8) });
  if (!signup.allowedMarkets.includes(input.market)) add("market_not_allowed", { market: input.market.slice(0, 8) });

  if (input.via === "invite_code" || input.via === "waitlist_invite") add("invite_code", input.inviteLabel ? { label: input.inviteLabel.slice(0, 120) } : undefined);
  if (wantsTrust && trustR.ok && trustR.value) add("trusted_creator");

  const score = scoreOf(flags);
  let band = bandFor(score, flags, thresholdsOrDefault(signup.thresholds));
  if (unguarded) {
    partial = true;
    if (band === "fast") band = "review";
  }
  const ms = Math.max(0, Math.round(d.now() - started));
  return {
    score,
    flags,
    band,
    signals: { v: 1, flags, band, inputs: inputsOf(input, domain, phoneCountry), cluster, partial, ms },
  };
}
