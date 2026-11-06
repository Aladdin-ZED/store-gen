/**
 * The domain move's pure rules (platform.md PLA-§16, OS-06; core §C.10, §H.7, D9, D44, PD82; RESEARCH §5.2, §5.3).
 * Isomorphic and selftested: the checklist's steps in their order (the owner's and the app's), the verification checks
 * V1 … V13 with which of them the server can run, the texts each step and check shows (English, the console reads
 * English in R1, PD9), the status card's lines, and the state the checklist keeps in `platform.domainMove` (dates
 * and staff ids, never a value). src/lib/platform/domain-move.ts reads the environment and runs the checks.
 *
 *   DOMAIN_STEPS.map((s) => s.id)        // "buy_domain", "cf_zone", …, "env_replace", "rerender", …
 *   checkDef("V12").runnable             // true: "Run" calls runDomainCheck("V12")
 *   adminHostLine({ sMode: true, adminHost: null })   // "shared_origin": the red line
 *
 * The env step's text says "restart": every domain key is a server-side `process.env` read, so a full env replace
 * needs a restart and nothing more (core §C.10 step 1, ENGC-26; `test:platform` pins the wording).
 */

/* ------------------------------------------------------------------ */
/* The checklist (PLA-§16.3)                                           */
/* ------------------------------------------------------------------ */

export interface DomainStepDef {
  id: string;
  /** who does it: the owner in Cloudflare / hPanel / third-party consoles, or the app (env, renders, redirects) */
  by: "owner" | "app";
  title: string;
  detail: string;
}

/**
 * The steps in the order they are done. The allowlist check comes before the nameserver switch (core §C.10 step 1:
 * behind Cloudflare the allowlist reads `CF-Connecting-IP`, so the owner confirms it still admits them first).
 */
export const DOMAIN_STEPS: readonly DomainStepDef[] = [
  { id: "buy_domain", by: "owner", title: "Buy the domain", detail: "Any registrar. The domain becomes the platform address and the root of every store's subdomain." },
  { id: "cf_zone", by: "owner", title: "Add the Cloudflare zone", detail: "Create the zone on the Cloudflare Free plan and import the DNS records it finds." },
  { id: "apex_a", by: "owner", title: "Check the apex A record in hPanel", detail: "In the Cloudflare zone, the apex A record points at the server address hPanel shows for the site." },
  { id: "wildcard_record", by: "owner", title: "Add the proxied * record", detail: "A proxied * record, so every store subdomain reaches Cloudflare and the Worker." },
  { id: "allowlist_check", by: "owner", title: "Verify the console allowlist still admits you", detail: "Security settings show the address the allowlist matched. Behind Cloudflare it reads CF-Connecting-IP: confirm your own address is listed before the nameservers switch." },
  { id: "nameservers", by: "owner", title: "Switch the nameservers", detail: "At the registrar, set the two Cloudflare nameservers. The switch can take a few hours." },
  { id: "hostinger_cdn_off", by: "owner", title: "Turn the Hostinger CDN off", detail: "Cloudflare caches in front of the app; a second CDN in between breaks the cache rules." },
  { id: "tls_full_strict", by: "owner", title: "Set TLS to Full (strict)", detail: "Cloudflare SSL/TLS mode Full (strict), so Cloudflare checks the origin certificate." },
  { id: "www_redirect", by: "owner", title: "Add the www Redirect Rule", detail: "www.<domain> redirects to the apex with a 301, keeping the path and the query." },
  { id: "media_cache_rule", by: "owner", title: "Add the /media/* Cache Rule", detail: "A Cache Rule for /media/* on every store subdomain: store files are cached at the edge." },
  { id: "worker", by: "owner", title: "Deploy the Worker", detail: "Deploy the Worker with its EDGE_KEY secret and the *.<domain>/* route. The apex is never routed through it." },
  {
    id: "env_replace",
    by: "app",
    title: "Replace the environment, then restart",
    detail:
      "Full replace of the Hostinger environment, adding PLATFORM_URL, PUBLIC_URL, STORE_ROOT_DOMAIN, EDGE_KEY, BEHIND_CLOUDFLARE=1, LEGACY_PLATFORM_HOSTS, TRUSTED_PROXY_HOPS and ADMIN_HOST=console.<domain> (20 keys), then restart the app. A restart is enough: every one of these keys is read at runtime.",
  },
  { id: "rerender", by: "app", title: "Re-render all live pages", detail: "Every live page is rendered again with the new addresses. Path-mode pages keep working meanwhile." },
  { id: "legacy_redirects", by: "app", title: "Turn the legacy 308 redirects on", detail: "The temporary domain answers with permanent redirects to the new addresses, query kept byte for byte." },
  { id: "cron_url", by: "owner", title: "Update the cron URL", detail: "In hPanel, the 5-minute cron calls the new platform address." },
  { id: "ad_domains", by: "owner", title: "Update the Meta and TikTok domains", detail: "Verify the new domain in Meta Business and TikTok, and update the event sources' domains." },
  { id: "turnstile_hostnames", by: "owner", title: "Add the new hostnames to Turnstile", detail: "In Cloudflare Turnstile, the platform widget lists the new apex; the apex hostname covers every store subdomain." },
  { id: "sheets_links", by: "owner", title: "Update the Sheets links", detail: "Links to the dashboard saved in shared Google Sheets point at the new address." },
];

export type DomainStepId = (typeof DOMAIN_STEPS)[number]["id"];
export const isDomainStep = (id: unknown): id is DomainStepId => typeof id === "string" && DOMAIN_STEPS.some((s) => s.id === id);

/* ------------------------------------------------------------------ */
/* The verification checks (RESEARCH §5.3, core §C.10 step 3)          */
/* ------------------------------------------------------------------ */

export const DOMAIN_CHECK_IDS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12", "V13"] as const;
export type DomainCheckId = (typeof DOMAIN_CHECK_IDS)[number];
export const isDomainCheck = (id: unknown): id is DomainCheckId => typeof id === "string" && (DOMAIN_CHECK_IDS as readonly string[]).includes(id);

export interface DomainCheckDef {
  id: DomainCheckId;
  title: string;
  /** how it passes */
  pass: string;
  /** true: the server runs it (`runDomainCheck`); false: done by hand and marked with a note */
  runnable: boolean;
  /** the script or tool of a manual check */
  how: string | null;
}

export const DOMAIN_CHECKS: readonly DomainCheckDef[] = [
  { id: "V1", title: "Host decision table", pass: "Every decision-table case, forged x-sg-* header and reserved label answers as specified.", runnable: false, how: "npm run test:hosts" },
  { id: "V2", title: "Hostinger subdomain alias (optional)", pass: "Recorded in HANDOFF whether an alias reaches the app and how the process count moves.", runnable: false, how: "a temporary alias in hPanel, removed afterwards" },
  { id: "V3", title: "Store subdomains reach the app, uncached", pass: "https://probe.<domain>/ answers the neutral 404 with x-sg-mode: subdomain, and Cloudflare does not cache store pages.", runnable: true, how: null },
  { id: "V4", title: "Direct-origin forgery", pass: "A request straight to the origin with a wrong x-sg-edge gets the neutral 404.", runnable: false, how: "curl --resolve with a wrong x-sg-edge" },
  { id: "V5", title: "No cookie reaches store routes", pass: "No cookie on store routes; a dashboard POST from a store page is refused.", runnable: false, how: "Playwright (msedge)" },
  { id: "V6", title: "Order API isolation", pass: "A page of one store cannot post an order with another store's key; correct posts succeed from both addresses.", runnable: false, how: "the order API checks" },
  { id: "V7", title: "Legacy links redirect, query kept", pass: "/s/<handle>/x?fbclid=1&utm_source=fb on the temporary domain answers 308 to https://<handle>.<domain>/x with the same query.", runnable: true, how: null },
  { id: "V8", title: "Edge certificate covers the subdomains", pass: "The certificate served for a store subdomain covers *.<domain>.", runnable: true, how: null },
  { id: "V9", title: "Visitor IP", pass: "The Visitor IP check shows the tester's real address on a store host and on the apex.", runnable: false, how: "Visitor addresses in Security settings, from both hosts" },
  { id: "V10", title: "Turnstile on a subdomain", pass: "A token from the test widget on a store subdomain verifies.", runnable: true, how: null },
  { id: "V11", title: "Load through the Worker", pass: "200 concurrent store requests: no 503, the process count stays flat.", runnable: false, how: "the load script" },
  { id: "V12", title: "Console on its own host", pass: "This page is served on ADMIN_HOST, and https://<domain>/admin without cookies answers the neutral 404.", runnable: true, how: null },
  { id: "V13", title: "Human check ready", pass: "The platform Turnstile widget is configured, lists the new domain, and a token from the test widget verifies for sign-up.", runnable: true, how: null },
];

export const RUNNABLE_CHECKS = DOMAIN_CHECKS.filter((c) => c.runnable).map((c) => c.id);
export const checkDef = (id: DomainCheckId): DomainCheckDef => DOMAIN_CHECKS.find((c) => c.id === id)!;

/** PLA-§L: a check's note */
export const CHECK_NOTE_MAX = 200;

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

/**
 * A run's answer. `skipped` = the check does not apply yet and nothing was called (S mode off, ADMIN_HOST unset): the
 * message says why. `needs_input` = a token or a confirmation is missing.
 */
export type DomainCheckOutcome = "passed" | "failed" | "skipped" | "needs_input";

export interface DomainCheckResult {
  id: DomainCheckId;
  outcome: DomainCheckOutcome;
  /** one sentence (English): what was found */
  message: string;
  /** the answers the check recorded ("HEAD https://x/admin → 404"), no secret, no customer data */
  answers: string[];
  /** true when a network call was made */
  network: boolean;
  ranAt: string;
}

/** The fixed answers of the checks that do not apply yet (PLA-§16.5 acceptance: no network call). */
export const SKIP_TEXT = {
  sModeOff: "S mode is off",
  adminHostUnset: "ADMIN_HOST not set (expected before the move)",
  noLegacyHost: "LEGACY_PLATFORM_HOSTS is not set (set it with the new environment)",
} as const;

/** The note recorded with a passed run: its answers, joined and cut to 200 characters. */
export function noteOf(result: Pick<DomainCheckResult, "message" | "answers">): string {
  return [result.message, ...result.answers].join(" · ").slice(0, CHECK_NOTE_MAX);
}

/* ------------------------------------------------------------------ */
/* The status card (PLA-§16.1)                                         */
/* ------------------------------------------------------------------ */

/** PLA-§16.1, D44 rev 3: the console's own host, the shared origin while S mode runs without it (red), or not yet. */
export type AdminHostLine = "own_host" | "shared_origin" | "not_yet";

export function adminHostLine(env: { sMode: boolean; adminHost: string | null }): AdminHostLine {
  if (env.adminHost) return "own_host";
  return env.sMode ? "shared_origin" : "not_yet";
}

export const ADMIN_HOST_TEXT: Readonly<Record<AdminHostLine, string>> = {
  own_host: "Console on its own host",
  shared_origin: "Console still on the shops' origin",
  not_yet: "Set at the domain move",
};

/**
 * The sign-up default the addresses imply (D9, core §B.2 rev 6): `approval` once S mode is on and V13 has passed,
 * else `invite`. A stored mode overrides it (shown beside it).
 */
export function signupDefaultFor(env: { sMode: boolean; v13Passed: boolean; turnstile: boolean }): "invite" | "approval" {
  return env.sMode && env.v13Passed && env.turnstile ? "approval" : "invite";
}

/** The state of one checklist row as the page shows it. */
export interface DomainStepView extends DomainStepDef {
  done: { at: string; by: string } | null;
}

export interface DomainCheckView extends DomainCheckDef {
  passed: { at: string; by: string; note: string } | null;
}

/** Every V check has passed: the banner offers "Switch sign-up to approval" (PLA-§16.3). */
export const allChecksPassed = (checks: Readonly<Record<string, unknown>>): boolean => DOMAIN_CHECK_IDS.every((id) => Boolean(checks[id]));
