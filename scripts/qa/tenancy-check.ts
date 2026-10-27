/**
 * The two-store attack suite (docs/STORE-SAAS.md §F.1, §F.2, §J.2 `test:tenancy`; TENANCY-MAP §10.2). Store A is the
 * victim, store B the attacker. Every role of B (owner, admin, manager, editor, agent, viewer), a member of both
 * stores, a signed-in outsider, platform staff without a membership and staff "viewing as" a store each try every
 * read and write against A's ids and A's handle: pages, versions, orders, leads, blocklist, media, exports, pixels,
 * Sheets, settings, team, search. Every attempt must answer exactly what a missing id (or an unknown handle) answers,
 * leave A's rows byte-identical and return none of A's canaries. The attackers hold a fresh step-up (§B.7, `armed`):
 * the strongest stolen session, so a step-up gate never hides a handler's body from the attack.
 *
 *   npx tsx scripts/qa/tenancy-check.ts [--db cod_test_tenancy_check] [--verbose] [--keep]
 *
 * It creates its own throwaway database on XAMPP's MariaDB (root, no password; TENANCY_DB_SERVER overrides
 * mysql://root@127.0.0.1:3306; the name must be cod_test_*), migrates it, seeds the two stores and drops it at the end
 * (unless --keep). No server, no network: the actions, route handlers and pages run in this process through the
 * request-context seam (`runAsIdentity`, §E.4) inside Next's own request stores, and `fetch` answers from a fake
 * Google (Sheets, CAPI) that records every request.
 *
 * Suites:
 *  - repositories: the store repositories called with B's scope and A's ids (identical to a missing id; every
 *    scoped export of src/lib that takes an id, a slug or a document), the impersonation scope (customer fields
 *    masked), the console scope (`listPagesForConsole`, SEC-18)
 *  - actions × roles: every exported server action (the "use server" files, derived from the tree) on B's path with
 *    A's ids, on A's path, with B's own record beside A's (B's page, A's version), and in B's own store for the role
 *    matrix (a key the role lacks → `forbidden`; a granted role reaches the body)
 *  - routes: every route handler of src/app (derived from the tree, SEC-9), every method: the dashboard routes on A's
 *    handle and on B's handle with A's ids (the neutral 404, no canary), the role matrix of each handler's own
 *    storeGuard key (403 without it, the body with it); the public routes on A's address (no customer or secret
 *    canary) and on B's address with A's slugs (nothing of A, never a redirect into A)
 *  - pages: every page and layout under /app/<handle> rendered as B's members on A's handle (the neutral 404), on B's
 *    handle with A's ids (no canary in the props that reach the client), and as A's owner (the canaries are found:
 *    the scan is not blind)
 *  - special cases: same slug, same pixel id with per-store tokens, a sheet listing A's order ids pulled for B, the
 *    blocklist, an identical image upload, A's `sourceAssetId`, a document naming A's asset (save, preview, export
 *    estimate and ZIP), the settings and pixel-usage caches, x-sg-path tampering, a store-host action, B connecting
 *    A's sheet, a client-sent x-sg-path on the upload route (SEC-3), the export allow-list (SEC-23), the cron tick's
 *    per-store loop, a scope and a store row that disagree (the render cache), team, invites (reuse, expiry, escalation, enumeration, 10 parallel accepts, SEC-24), preview tokens (minted
 *    from B, forged with A's page, SEC-7), a document naming A's asset at publish, the render of one slug in two
 *    stores, a client-sent x-sg-path on a public route, a suspended store's page key, parallel uploads (the quota race)
 *    and a pending store at the shared disk budget (D69)
 *  - impersonation (D70): staff "viewing as" a store through T2's seam: writes refused, no customer canary in any
 *    action, route or page payload; staff viewing B attacking A's paths, handle and ids like any member of B
 *  - account and console: the pages outside /app/<handle> (picker, account, new store, console, sign-in) and the
 *    account actions that take an id (another user's session, another store's id, another store's handle)
 *  - T4 review: the tenant audit screen and action never carry a staff note the store was not shown, a staff e-mail
 *    or a staff user id (§F.5); the Sheets proof code planted in A's order rows proves nothing (SHT-09: titles only);
 *    the integrations secrets and the exports of customer data ask for a fresh step-up (§B.7: none or a stale one
 *    refused, a fresh one works and is named on the audit row); the cron pulls a store whose orders are all synced
 *    (SHT-11); the agent's R1.0 queue (§A.3.2 interim); the store-named titles of the overview and the builder
 *  - plug-ins: every scripts/qa/tenancy-cases/<track>.ts (`export const cases: TenancyCase[]`, DES-R13)
 *
 * All real code (R1.0: T1, T2, T3 and T4 merged): no adapter, no stand-in. A call that still ends in a typed stub
 * ("not implemented: …") fails its check (until the R1.0 merge it was listed as pending). A case of the spec that has no
 * code in R1.0 is listed under "not applicable" with its reason (`notApplicable`), never counted as a pass. Test
 * secrets are random per run and never printed. scripts/qa/action-replay.ts reuses this file's fixtures and cases.
 * Exit code 1 when a check fails.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, generateKeyPairSync, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import type { RequestIdentity } from "@/lib/tenancy/context";
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import type { Actor, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";

/* ================================================================== */
/* 0. process                                                          */
/* ================================================================== */

export const ROOT = path.resolve(__dirname, "..", "..");
const nodeRequire = createRequire(__filename);
/** A module of the app, loaded after the environment below is in place (never a static import: it would run first). */
export const load = <T>(id: string): T => nodeRequire(id) as T;

const SCRIPT = path.basename(process.argv[1] ?? "tenancy-check").replace(/\.[cm]?[jt]s$/, "");
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export const DB_NAME = flag("db") ?? process.env.TENANCY_DB ?? `cod_test_${SCRIPT.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
const DB_RE = /^cod_test_[a-z0-9_]{1,48}$/;
const DB_SERVER = (process.env.TENANCY_DB_SERVER ?? "mysql://root@127.0.0.1:3306").replace(/\/+$/, "");
export const PLATFORM = "http://localhost:3451";
const PLATFORM_HOST = "localhost:3451";
export const VERBOSE = process.argv.includes("--verbose");
const KEEP = process.argv.includes("--keep");

if (!DB_RE.test(DB_NAME)) {
  console.error(`✗ refusing to run on database "${DB_NAME}": use a throwaway cod_test_* name`);
  process.exit(1);
}

/** A throwaway platform service account (Sheets): a fresh RSA key the fake Google below accepts. */
const TEST_SA = (() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    type: "service_account",
    project_id: "tenancy-check",
    private_key_id: randomBytes(8).toString("hex"),
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    client_email: "tenancy-check@tenancy-check.iam.gserviceaccount.com",
    client_id: "1",
    token_uri: "https://oauth2.googleapis.com/token",
  };
})();

{
  const env = process.env as Record<string, string | undefined>;
  // the platform of this process: P mode on one host, a fresh secret (never the owner's), nothing from .env files
  for (const k of [
    "PUBLIC_URL",
    "STORE_ROOT_DOMAIN",
    "ADMIN_HOST",
    "ADMIN_GATE",
    "ADMIN_IP_ALLOWLIST",
    "EDGE_KEY",
    "LEGACY_PLATFORM_HOSTS",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "TRUSTED_PROXY_HOPS",
    "SETUP_TOKEN",
  ])
    delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${DB_NAME}`;
  env.SG_TEST_CONTEXT = "1";
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = PLATFORM;
  env.CRON_KEY = randomBytes(16).toString("hex");
  env.GOOGLE_SA_JSON_B64 = Buffer.from(JSON.stringify(TEST_SA)).toString("base64");
  if (!env.NODE_ENV || env.NODE_ENV === "production") env.NODE_ENV = "test";
  // Next's request stores need the global its server bootstrap sets
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

interface ModuleInternals {
  _resolveFilename: (request: string, parent: unknown, isMain: boolean, ...rest: unknown[]) => string;
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  _extensions: Record<string, (m: { exports: unknown }, filename: string) => void>;
  _cache: Record<string, { exports: unknown } | undefined>;
}
const M = Module as unknown as ModuleInternals;

// `import "server-only"` throws outside Next; stylesheet imports of the admin components are build-time only
{
  const orig = M._resolveFilename;
  const empty = nodeRequire.resolve("drizzle-orm");
  M._resolveFilename = function (request: string, ...rest: unknown[]) {
    return request === "server-only" || request === "client-only" ? empty : (orig as (...a: unknown[]) => string).call(this, request, ...rest);
  };
  M._extensions[".css"] = (m) => {
    m.exports = {};
  };
}

/* ------------------------------------------------------------------ */
/* typed stubs: every R1.0 track has merged, reaching one is a failure */
/* ------------------------------------------------------------------ */

/** "T3 (publishPage)" from a stub's error or log text ("not implemented: T3 (publishPage)") */
export const stubName = (text: string): string | null => /not implemented: (T\d|P\d+|C0b|P0)[^"\n]*?\)/.exec(text)?.[0].replace("not implemented: ", "") ?? null;

/* ------------------------------------------------------------------ */
/* the network: a fake Google that records every request               */
/* ------------------------------------------------------------------ */

export interface NetCall {
  method: string;
  url: string;
  body: string;
  auth: string;
}
export const network: NetCall[] = [];
/** spreadsheetId → rows (A2:M) the fake Sheets API answers */
export const fakeSheets = new Map<string, unknown[][]>();
/** spreadsheetId → its title and tab titles (the metadata GET; default "Orders" with one "Commandes" tab) */
export const fakeSheetMeta = new Map<string, { title: string; tabs: string[] }>();
{
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
    network.push({ method, url, body, auth: headers.get("authorization") ?? "" });
    const u = new URL(url);
    if (u.host === "oauth2.googleapis.com") return json({ access_token: "tenancy-check-token", expires_in: 3600 });
    if (u.host === "sheets.googleapis.com") {
      const m = /^\/v4\/spreadsheets\/([^/]+)(\/.*)?$/.exec(u.pathname);
      // "<id>:batchUpdate" (a method suffix) names the same spreadsheet
      const id = m ? decodeURIComponent(m[1]!).replace(/:[A-Za-z]+$/, "") : "";
      const rows = fakeSheets.get(id);
      if (!rows) return json({ error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } }, 404);
      const rest = m?.[2] ?? "";
      if (method === "GET" && rest.startsWith("/values/")) {
        return json({ values: u.searchParams.get("majorDimension") === "COLUMNS" ? [rows.map((r) => r[0])] : rows });
      }
      if (method === "GET") {
        const meta = fakeSheetMeta.get(id) ?? { title: "Orders", tabs: ["Commandes"] };
        return json({ spreadsheetId: id, properties: { title: meta.title }, sheets: meta.tabs.map((title, sheetId) => ({ properties: { sheetId, title } })) });
      }
      return json({ spreadsheetId: id, replies: [], updates: { updatedRows: 0 } });
    }
    // CAPI and everything else: refused, recorded
    return json({ error: { message: "network disabled in test:tenancy" } }, 503);
  }) as typeof fetch;
}

/* ================================================================== */
/* 1. results                                                          */
/* ================================================================== */

interface Tally {
  pass: number;
  fail: string[];
  /** cases of the spec with no code in R1.0: "name · reason" */
  na: string[];
  ms: number;
}
const tallies = new Map<string, Tally>();
let currentSuite = "setup";
const tally = (suite = currentSuite) => {
  let t = tallies.get(suite);
  if (!t) tallies.set(suite, (t = { pass: 0, fail: [], na: [], ms: 0 }));
  return t;
};
let suiteStarted = Date.now();
export function suite(name: string): void {
  tally().ms += Date.now() - suiteStarted;
  suiteStarted = Date.now();
  currentSuite = name;
  tally();
}
const short = (v: unknown, n = 400) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v, jsonSafe);
  } catch {
    s = String(v);
  }
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
export function check(name: string, ok: boolean, detail?: unknown): void {
  const t = tally();
  if (ok) t.pass++;
  else t.fail.push(detail === undefined ? name : `${name}\n      ${short(detail)}`);
  if (VERBOSE || !ok) console.log(`${ok ? "  ✓" : "  ✗"} [${currentSuite}] ${name}${!ok && detail !== undefined ? ` · ${short(detail, 300)}` : ""}`);
}
/**
 * The calls behind a check ran real code. Every R1.0 track has merged, so a call that still ends in a typed stub
 * ("not implemented: …") fails here (until the R1.0 merge such a check was listed as pending). True when none did.
 */
export function ranReal(label: string, ...outcomes: ({ stub: string | null } | null | undefined)[]): boolean {
  const stub = outcomes.find((o) => o?.stub)?.stub ?? null;
  if (stub) check(`${label}: runs real code`, false, `reached the typed stub ${stub}`);
  return stub === null;
}
/** A case of the spec that has no code in R1.0 (named with its reason): listed, never a pass, never pending. */
export function notApplicable(name: string, reason: string): void {
  tally().na.push(`${name} · ${reason}`);
  if (VERBOSE) console.log(`  – [${currentSuite}] ${name} · not applicable: ${reason}`);
}

/* ================================================================== */
/* 2. calls inside Next's request stores                              */
/* ================================================================== */

/** who calls: a signed-in user (optionally with a fresh step-up, §B.7), a real session row, or nobody */
export type Who = { userId: string; stepUpAt?: Date } | { sessionToken: string } | { anonymous: true };
/** A signed-in user who stepped up just now (§B.7): the attackers and the granted roles (a gate never hides a body). */
export const armed = (userId: string): Who => ({ userId, stepUpAt: new Date() });

export interface Outcome<T = unknown> {
  ok: boolean;
  value?: T;
  error?: unknown;
  /** the stub this call ended in ("T3 (publishPage)"), from its error or its logs */
  stub: string | null;
  /** the revalidatePath tags of the call */
  revalidated: string[];
  logs: string[];
}

interface WorkStore {
  page: string;
  route: string;
  incrementalCache: object;
  pendingRevalidatedTags: { tag: string }[];
  forceStatic: boolean;
  dynamicShouldError: boolean;
  isStaticGeneration: boolean;
  afterContext: { after: (task: unknown) => void };
}

type Storage = { run<R>(store: unknown, fn: () => R): R };
let nextStores: { work: Storage; unit: Storage; RequestCookies: new (h: Headers) => unknown } | null = null;
const stores = () =>
  (nextStores ??= {
    work: load<{ workAsyncStorage: Storage }>("next/dist/server/app-render/work-async-storage.external").workAsyncStorage,
    unit: load<{ workUnitAsyncStorage: Storage }>("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage,
    RequestCookies: load<{ RequestCookies: new (h: Headers) => unknown }>("next/dist/compiled/@edge-runtime/cookies").RequestCookies,
  });

/** The request headers of a platform-host call (same-origin, as the browser sends them). */
export function platformHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ host: PLATFORM_HOST, origin: PLATFORM, "sec-fetch-site": "same-origin", "user-agent": "tenancy-check", ...extra });
}

/**
 * Run `fn` as `who` on `path`: the identity seam (runAsIdentity, §E.4) when `who` names a user, inside a work store
 * (revalidatePath, after()) and a request store (headers(), cookies()) like a server action of `next start`. `raw`
 * skips the identity seam: the seam then reads the session cookie and the signed path from `headers` (the
 * production path, for the tampering cases). Never throws: the outcome carries the error.
 */
export async function call<T>(who: Who, urlPath: string, fn: () => Promise<T>, opts: { headers?: Headers; raw?: boolean; identityHeaders?: HeadersInit } = {}): Promise<Outcome<T>> {
  const { runAsIdentity } = load<typeof import("@/lib/tenancy/context")>("@/lib/tenancy/context");
  const s = stores();
  const headers = opts.headers ?? platformHeaders();
  const after: (() => unknown)[] = [];
  const work: WorkStore = {
    page: "/app/[store]/page",
    route: "/app/[store]",
    incrementalCache: {},
    pendingRevalidatedTags: [],
    forceStatic: false,
    dynamicShouldError: false,
    isStaticGeneration: false,
    afterContext: { after: (task) => void after.push(typeof task === "function" ? (task as () => unknown) : () => task) },
  };
  const cookies = new s.RequestCookies(headers);
  const unit = { type: "request", phase: "action", headers, cookies, mutableCookies: cookies, userspaceMutableCookies: cookies, implicitTags: { tags: [], expirationsByCacheKind: new Map() } };
  const logs: string[] = [];
  const restore = captureConsole(logs);
  const out: Outcome<T> = { ok: false, stub: null, revalidated: [], logs };
  try {
    const run = () => s.work.run(work, () => s.unit.run(unit, fn));
    let value: T;
    if (opts.raw || "anonymous" in who) value = await run();
    else {
      // the identity carries the request's headers (the host class, and the Origin T2's same-origin check reads)
      const identity: RequestIdentity = { ...who, path: urlPath, headers: opts.identityHeaders ?? Object.fromEntries(headers) };
      value = await runAsIdentity(identity, run);
    }
    for (const task of after.splice(0)) await s.work.run(work, () => s.unit.run(unit, async () => task()));
    out.ok = true;
    out.value = value;
  } catch (e) {
    out.error = e;
  } finally {
    restore();
  }
  out.revalidated = work.pendingRevalidatedTags.map((t) => t.tag);
  out.stub = stubName(`${out.error instanceof Error ? out.error.message : ""}\n${logs.join("\n")}`);
  return out;
}

function captureConsole(into: string[]): () => void {
  const orig = { error: console.error, warn: console.warn };
  const grab =
    (kind: string) =>
    (...args: unknown[]) => {
      into.push(`${kind}: ${args.map((a) => (a instanceof Error ? `${a.message}` : typeof a === "string" ? a : short(a, 300))).join(" ")}`);
    };
  console.error = grab("error");
  console.warn = grab("warn");
  return () => {
    console.error = orig.error;
    console.warn = orig.warn;
  };
}

/* ================================================================== */
/* 3. fixtures                                                         */
/* ================================================================== */

export const ROLES = ["owner", "admin", "manager", "editor", "agent", "viewer"] as const satisfies readonly StoreRole[];
export type Role = (typeof ROLES)[number];

export interface StoreFx {
  key: "A" | "B";
  id: string;
  handle: string;
  name: string;
  members: Record<Role, string>;
  /** the session token of the owner (the raw-request cases) */
  ownerToken: string;
  page: { live: string; draft: string; archived: string };
  /** the live page's slug: the same in both stores */
  slug: string;
  version: { live: string; saved: string; generation: string };
  order: { main: string; failed: string };
  lead: string;
  block: { phone: string; ip: string };
  asset: { photo: string; cutout: string };
  /** the photo's bytes (the identical-upload case) */
  photoBytes: Buffer;
  export: string;
  invite: string;
  pixel: { own: string; shared: string };
  spreadsheetId: string;
  customer: { name: string; phone: string; address: string; note: string; email: string; city: string };
  auditId: number;
}

export interface Fixtures {
  A: StoreFx;
  B: StoreFx;
  /** viewer of A and owner of B: the store comes from the path, the grants from that store's membership */
  dual: string;
  /** signed in, member of nothing */
  outsider: string;
  /** platform super_admin (TOTP), member of nothing */
  staff: { id: string; token: string };
  /** A's strings that must never reach B */
  canaries: { customer: string[]; data: string[]; secret: string[]; ids: string[] };
  /** A id → a same-format id that exists nowhere */
  ghosts: Map<string, string>;
  /** an unknown, well-formed handle */
  ghostHandle: string;
  rows: { A: StoreRow; B: StoreRow };
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let baseDoc: unknown = null;
/** A copy of the argan fixture as a validated PageDoc (built once: its theme generation is slow). */
function fixtureDoc(assetId?: string): Record<string, unknown> {
  if (!baseDoc) {
    const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
    const { validateDoc } = load<typeof import("@/lib/page/validate")>("@/lib/page/validate");
    baseDoc = validateDoc(getFixture("argan").doc).doc;
  }
  if (!assetId) return structuredClone(baseDoc) as Record<string, unknown>;
  // every image of the fixture becomes `assetId` (a document naming only the store's own files)
  const { collectAssetIds } = load<typeof import("@/landing/context")>("@/landing/context");
  let json = JSON.stringify(baseDoc);
  for (const id of collectAssetIds(baseDoc as import("@/lib/page/schema").PageDoc)) json = json.split(`"${id}"`).join(`"${assetId}"`);
  return JSON.parse(json) as Record<string, unknown>;
}
const rand = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join("");
const tag = () => rand("BCDFGHJKLMNPQRSTVWXZ", 6);
/** a 15-digit Meta pixel id */
const metaPixelId = () => `${rand("123456789", 1)}${rand("0123456789", 14)}`;

async function png(width: number, height: number, alpha: boolean): Promise<Buffer> {
  const sharp = load<(input: Buffer, opts: { raw: { width: number; height: number; channels: 3 | 4 } }) => { png(): { toBuffer(): Promise<Buffer> } }>("sharp");
  const channels = alpha ? 4 : 3;
  return sharp(randomBytes(width * height * channels), { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

function serviceAccountJson(email: string): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return JSON.stringify({
    type: "service_account",
    project_id: "store-export",
    private_key_id: randomBytes(10).toString("hex"),
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    client_email: email,
    client_id: String(randomInt(1e9)),
    token_uri: "https://oauth2.googleapis.com/token",
  });
}

export function scopeOf(storeId: string, kind: StoreScope["kind"] = "member"): StoreScope {
  const { mintScope } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  return mintScope(kind, storeId);
}
export const writeScope = (storeId: string): WriteScope => scopeOf(storeId, "member") as WriteScope;
export const userActor = (userId: string): Actor => ({ kind: "user", userId, impersonatorId: null, ip: null });

async function rootQuery(sql: string): Promise<unknown> {
  const mysql = load<typeof import("mysql2/promise")>("mysql2/promise");
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    const [rows] = await conn.query(sql);
    return rows;
  } finally {
    await conn.end();
  }
}

async function createDatabase(): Promise<void> {
  await rootQuery(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await rootQuery(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

export async function dropDatabase(): Promise<string[]> {
  try {
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  } catch {
    // never opened
  }
  if (!KEEP) await rootQuery(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  const left = (await rootQuery("SHOW DATABASES LIKE 'cod\\_test\\_%'")) as Record<string, string>[];
  return left.map((r) => Object.values(r)[0]!);
}

/** Two stores, every role in each, a member of both, an outsider, staff; A's and B's records with their canaries. */
async function seed(): Promise<Fixtures> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId, newPublicKey } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { eq, sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { validateDoc } = load<typeof import("@/lib/page/validate")>("@/lib/page/validate");
  const { getStoreById } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const { processUpload } = load<typeof import("@/lib/media/process")>("@/lib/media/process");
  const { setAssetAlt } = load<typeof import("@/lib/admin-data/assets")>("@/lib/admin-data/assets");
  const { auditIn } = load<typeof import("@/lib/admin-data/store-audit")>("@/lib/admin-data/store-audit");
  const { savePixelEntry } = load<typeof import("@/lib/pixels/library.server")>("@/lib/pixels/library.server");
  const { saveSheetsConfig } = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
  const { setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { recordSlugMove } = load<typeof import("@/lib/editor/slug-history")>("@/lib/editor/slug-history");
  const { recordFacts } = load<typeof import("@/lib/editor/facts.server")>("@/lib/editor/facts.server");

  const user = async (email: string, name: string, opts: { platformRole?: string; totp?: boolean } = {}) => {
    const id = newId();
    // never signs in with a password: the identity seam or a sessions row below stands for a completed sign-in
    await db.insert(S.users).values({ id, email, name, passwordHash: "tenancy-check:no-password", platformRole: (opts.platformRole ?? "none") as never, totpEnabled: !!opts.totp });
    return id;
  };
  const session = async (userId: string) => {
    const token = randomBytes(32).toString("base64url");
    await db.insert(S.sessions).values({ id: createHash("sha256").update(token, "utf8").digest("hex"), userId, mfaPassed: true, expiresAt: new Date(Date.now() + 3_600_000) });
    return token;
  };
  const member = (storeId: string, userId: string, role: StoreRole) => db.insert(S.storeMembers).values({ storeId, userId, role });

  const buildStore = async (key: "A" | "B", handle: string, name: string): Promise<StoreFx> => {
    const t = tag();
    const owner = await user(`owner-${key.toLowerCase()}@tenancy.test`, `Owner ${key}`);
    const id = newId();
    await db.execute(sql`INSERT INTO stores (id, handle, name, status, brand_seed, created_by) VALUES (${id}, ${handle}, ${name}, 'active', ${randomBytes(8).toString("hex")}, ${owner})`);
    const members = { owner } as Record<Role, string>;
    await member(id, owner, "owner");
    for (const role of ROLES.filter((r) => r !== "owner")) {
      members[role] = await user(`${role}-${key.toLowerCase()}@tenancy.test`, `${role} ${key}`);
      await member(id, members[role], role);
    }
    const scope = writeScope(id);
    const actor = userActor(owner);
    const row = (await getStoreById(id))!;

    // media: a photo and a cutout derived from it (real uploads: per-store ids, files, quota)
    const photoBytes = await png(48, 32, false);
    const photo = (await processUpload(scope, row, photoBytes, `photo-${t}.png`, { createdBy: owner })).asset.id;
    const cutout = (await processUpload(scope, row, await png(32, 32, true), `cutout-${t}.png`, { createdBy: owner, cutout: true, sourceAssetId: photo })).asset.id;
    await setAssetAlt(scope, photo, `alt ${t} photo`, actor);

    // pages: live (with a publish version), draft, archived; one save and one generation version
    const fixture = fixtureDoc(photo);
    const product = fixture.product as Record<string, unknown>;
    product.name = `Argan ${t}`;
    fixture.seo = { ...((fixture.seo as object | undefined) ?? {}), title: `Seo ${t}` };
    // the store's two Meta pixels fire on its pages (one of them is the other store's too, PIX-01)
    const pixel = { own: metaPixelId(), shared: SHARED_PIXEL };
    fixture.tracking = { metaPixelId: [pixel.own, pixel.shared] };
    const doc = validateDoc(fixture).doc!;
    const page = { live: newId(), draft: newId(), archived: newId() };
    const insertPage = (pid: string, slug: string, pname: string, status: "draft" | "published" | "archived") =>
      db.insert(S.pages).values({ id: pid, storeId: id, slug, name: pname, status, locale: doc.locale, publicKey: newPublicKey(), draft: doc, createdBy: owner });
    await insertPage(page.live, "argan", `Live ${t}`, "published");
    await insertPage(page.draft, `draft-${t.toLowerCase()}`, `Draft ${t}`, "draft");
    await insertPage(page.archived, `old-${t.toLowerCase()}`, `Old ${t}`, "archived");
    const version = { live: newId(), saved: newId(), generation: newId() };
    const insertVersion = (vid: string, kind: "publish" | "save" | "generation", label: string) =>
      db.insert(S.pageVersions).values({
        id: vid,
        storeId: id,
        pageId: page.live,
        kind,
        label,
        doc,
        checksum: createHash("sha256").update(vid).digest("hex"),
        createdBy: owner,
        ...(kind === "publish" ? { html: `<!doctype html><title>Live ${t}</title><p>published ${t}</p>`, csp: "default-src 'none'", runtimeV: 2 } : {}),
      });
    await insertVersion(version.live, "publish", `Published ${t}`);
    await insertVersion(version.saved, "save", `Saved ${t}`);
    await insertVersion(version.generation, "generation", `Generated ${t}`);
    await db.update(S.pages).set({ publishedVersionId: version.live, firstPublishedAt: new Date() }).where(eq(S.pages.id, page.live));
    await recordSlugMove(scope, page.live, `before-${t.toLowerCase()}`);
    await recordFacts(scope, page.live, [`${randomInt(3, 9)} couleurs`], actor);

    // customer data (masked under impersonation: the canary sits in the masked part of each field)
    const middle = String(randomInt(100000, 999999));
    const customer = {
      name: `Salma Zk${t}`,
      phone: `+2126${middle}04`,
      address: `12 derb ${t}addr`,
      note: `door ${t}note`,
      email: `salma.${t.toLowerCase()}@mail.test`,
      city: "Casablanca",
    };
    const items = { v: 2, bundleId: "b1", bundleLabel: "1 x Argan", qty: 1, unitPrice: 199, variants: [] } as never;
    const order = { main: `${key}${rand(CROCKFORD, 1)}-${rand(CROCKFORD, 8)}`, failed: `${key}${rand(CROCKFORD, 1)}-${rand(CROCKFORD, 8)}` };
    const orderRow = (oid: string, sheetStatus: "synced" | "failed") => ({
      id: oid,
      storeId: id,
      pageId: page.live,
      versionId: version.live,
      status: "new",
      name: customer.name,
      phone: customer.phone,
      phoneRaw: `06${middle}04`,
      city: customer.city,
      address: customer.address,
      note: customer.note,
      email: customer.email,
      productName: `Argan ${t}`,
      items,
      qty: 1,
      subtotal: 19900,
      shipping: 0,
      total: 19900,
      currency: "MAD",
      idem: randomBytes(18).toString("hex"),
      ipHash: createHash("sha256").update(`ip-${t}`).digest("hex"),
      sheetStatus,
    });
    await db.insert(S.orders).values(orderRow(order.main, "synced") as never);
    await db.insert(S.orders).values(orderRow(order.failed, "failed") as never);
    const lead = newId();
    await db.insert(S.leads).values({ id: lead, storeId: id, pageId: page.live, idem: randomBytes(18).toString("hex"), phone: customer.phone, name: customer.name, city: customer.city, createdAt: new Date(Date.now() - 40 * 86_400_000) });
    const block = { phone: newId(), ip: newId() };
    await db.insert(S.blocklist).values({ id: block.phone, storeId: id, kind: "phone", value: `+2127${middle}99`, reason: `fraud ${t}` });
    await db.insert(S.blocklist).values({ id: block.ip, storeId: id, kind: "ip", value: createHash("sha256").update(`bad-ip-${t}`).digest("hex"), reason: `bot ${t}` });
    const exportId = newId();
    await db.insert(S.exportsTable).values({ id: exportId, storeId: id, pageId: page.live, versionId: version.live, mode: "connected", publicKey: newPublicKey(), allowedOrigins: [`https://shop-${t.toLowerCase()}.example`], fileName: `export-${t}.zip`, createdBy: owner });
    const invite = newId();
    await db.insert(S.storeInvites).values({ id: invite, storeId: id, emailNorm: `invitee.${t.toLowerCase()}@mail.test`, role: "editor", tokenHash: createHash("sha256").update(randomBytes(16)).digest("hex"), invitedBy: owner, expiresAt: new Date(Date.now() + 7 * 86_400_000) });

    // settings: identity, logo, Turnstile, the export key, the connected sheet, pixels with tokens
    const settingsActor = { id: owner, ip: null };
    await setStoreSetting(scope, "store", { legalName: `${t} SARL`, phone: "0522000000", email: `contact.${t.toLowerCase()}@store.test`, address: `${t} boulevard`, city: "Rabat", country: "MA", socials: {}, confirmation: {} }, settingsActor);
    await setStoreSetting(scope, "brand", { v: 1, logo: { primary: photo } } as never, settingsActor);
    await setStoreSetting(scope, "turnstile", { siteKey: `0x4AAAAAAA${t}site`, secretKey: `0x4AAAAAAA${t}secret` }, settingsActor);
    const sa = JSON.parse(serviceAccountJson(`export-${t.toLowerCase()}@store.iam.gserviceaccount.com`)) as { client_email: string; private_key: string; private_key_id: string };
    await setStoreSetting(scope, "export_key", { clientEmail: sa.client_email, privateKey: sa.private_key, privateKeyId: sa.private_key_id, setAt: new Date().toISOString() }, settingsActor);
    const spreadsheetId = `1x${t}${rand("abcdefghijkmnopqrstuvwxyz0123456789", 30)}`;
    await saveSheetsConfig(scope, { spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true }, settingsActor);
    fakeSheets.set(spreadsheetId, []);
    await savePixelEntry(scope, { platform: "meta", id: pixel.own, label: `Pixel ${t}`, token: `EAAT${t}own${randomBytes(12).toString("hex")}`, testCode: `TEST${t}` }, actor);
    await savePixelEntry(scope, { platform: "meta", id: pixel.shared, label: `Shared ${t}`, ...(key === "A" ? { token: `EAAT${t}shared${randomBytes(12).toString("hex")}` } : {}) }, actor);

    await auditIn(scope, actor, "store.profile_updated" as never, { meta: { fields: ["name"], note: `audit ${t}` } });
    const [audited] = (await db.execute(sql`SELECT MAX(id) AS id FROM audit_log WHERE store_id = ${id}`)) as unknown as [{ id: number }[]];

    return {
      key,
      id,
      handle,
      name,
      members,
      ownerToken: await session(owner),
      page,
      slug: "argan",
      version,
      order,
      lead,
      block,
      asset: { photo, cutout },
      photoBytes,
      export: exportId,
      invite,
      pixel,
      spreadsheetId,
      customer,
      auditId: Number(audited[0]!.id),
      // the tag stays in the closure: the canaries below are read from the rows
    };
  };

  const A = await buildStore("A", "atlas-argan", "Atlas Argan");
  const B = await buildStore("B", "baraka-home", "Baraka Home");
  const dual = await user("dual@tenancy.test", "Dual member");
  await member(A.id, dual, "viewer");
  await member(B.id, dual, "owner");
  const outsider = await user("outsider@tenancy.test", "Outsider");
  const staffId = await user("staff@tenancy.test", "Platform staff", { platformRole: "super_admin", totp: true });
  const staff = { id: staffId, token: await session(staffId) };

  const canaries = await canariesOf(A);
  const ghosts = new Map<string, string>();
  for (const v of canaries.ids) ghosts.set(v, ghostOf(v));
  return { A, B, dual, outsider, staff, canaries, ghosts, ghostHandle: "zz-ghost-store", rows: { A: (await getStoreById(A.id))!, B: (await getStoreById(B.id))! } };
}

/** The pixel id both stores use (each with its own token, PIX-01). */
const SHARED_PIXEL = metaPixelId();

/** A's distinctive strings, read back from A's rows (so a seeding change can't silently drop one). */
async function canariesOf(A: StoreFx): Promise<Fixtures["canaries"]> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const q = async (text: ReturnType<typeof sql>) => ((await db.execute(text)) as unknown as [Record<string, unknown>[]])[0];
  const strings = (rows: Record<string, unknown>[]) => rows.flatMap((r) => Object.values(r)).filter((v): v is string => typeof v === "string" && v.length >= 6);
  const t = /Zk([A-Z]{6})$/.exec(A.customer.name)![1]!;
  const middle = A.customer.phone.slice(5, 11);
  const customer = [`Zk${t}`, `${middle}04`, `${t}addr`, `${t}note`, A.customer.email, `${middle}99`];
  const data = [
    ...strings(await q(sql`SELECT name FROM pages WHERE store_id = ${A.id}`)),
    ...strings(await q(sql`SELECT label FROM page_versions WHERE store_id = ${A.id}`)),
    `alt ${t}`,
    `Pixel ${t}`,
    `Shared ${t}`,
    A.pixel.own,
    A.spreadsheetId,
    `${t} SARL`,
    `${t} boulevard`,
    `contact.${t.toLowerCase()}`,
    `audit ${t}`,
    `fraud ${t}`,
    `bot ${t}`,
    `invitee.${t.toLowerCase()}`,
    `export-${t}`,
    `shop-${t.toLowerCase()}`,
    `published ${t}`,
    `Argan ${t}`,
    `Seo ${t}`,
    `0x4AAAAAAA${t}site`,
  ];
  const secrets = await q(sql`SELECT value FROM store_settings WHERE store_id = ${A.id} AND \`key\` IN ('tracking_secrets', 'turnstile', 'export_key')`);
  const secret = [`EAAT${t}`, `TEST${t}`, `${t}secret`, `export-${t.toLowerCase()}@`, ...strings(secrets).flatMap((s) => (s.includes("PRIVATE KEY") ? [s.slice(40, 90)] : []))];
  const ids = [
    A.page.live,
    A.page.draft,
    A.page.archived,
    A.version.live,
    A.version.saved,
    A.version.generation,
    A.order.main,
    A.order.failed,
    A.lead,
    A.block.phone,
    A.block.ip,
    A.asset.photo,
    A.asset.cutout,
    A.export,
    A.invite,
    ...strings(await q(sql`SELECT public_key FROM pages WHERE store_id = ${A.id}`)),
    ...strings(await q(sql`SELECT \`key\` FROM media_files WHERE store_id = ${A.id}`)),
  ];
  return { customer, data: [...new Set(data)], secret, ids: [...new Set(ids)] };
}

function ghostOf(id: string): string {
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return `01${rand(CROCKFORD, 24)}`;
  if (/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/.test(id)) return `ZZ-${rand(CROCKFORD, id.length - 3)}`;
  if (/^[a-f0-9]{16,64}$/.test(id)) return rand("0123456789abcdef", id.length);
  if (/^[0-9]{6,20}$/.test(id)) return rand("123456789", id.length);
  return `${id.slice(0, 2)}${rand(CROCKFORD, Math.max(4, id.length - 2))}`;
}

/** `value` with every A id replaced by its ghost (a deep copy). */
export function ghostify<T>(fx: Fixtures, value: T): T {
  return mapStrings(value, (s) => {
    let out = s;
    for (const [real, ghost] of fx.ghosts) if (out.includes(real)) out = out.split(real).join(ghost);
    return out;
  });
}
/** The inverse of ghostify (to compare a ghost answer with the real one). */
export function unghost<T>(fx: Fixtures, value: T): T {
  return mapStrings(value, (s) => {
    let out = s;
    for (const [real, ghost] of fx.ghosts) if (out.includes(ghost)) out = out.split(ghost).join(real);
    return out;
  });
}
function mapStrings<T>(value: T, f: (s: string) => string): T {
  if (typeof value === "string") return f(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [f(k), mapStrings(v, f)])) as T;
  }
  return value;
}

/* ================================================================== */
/* 4. evidence: canaries, answers, fingerprints                        */
/* ================================================================== */

export function jsonSafe(_k: string, v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "function") return "[fn]";
  if (typeof v === "symbol") return v.toString();
  if (v instanceof Map) return Object.fromEntries(v);
  if (v instanceof Set) return [...v];
  if (Buffer.isBuffer(v)) return `[buffer ${createHash("sha256").update(v).digest("hex").slice(0, 16)}]`;
  if (v instanceof Uint8Array) return `[bytes ${v.length}]`;
  return v;
}
export const text = (v: unknown): string => {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, jsonSafe) ?? "";
  } catch {
    return String(v);
  }
};

/** A's canaries found in `value`; strings the caller itself sent (`sent`) don't count. */
export function leaks(fx: Fixtures, value: unknown, opts: { sent?: unknown; only?: readonly ("customer" | "data" | "secret" | "ids")[] } = {}): string[] {
  const hay = text(value);
  const sent = opts.sent === undefined ? "" : text(opts.sent);
  const groups = opts.only ?? (["customer", "data", "secret", "ids"] as const);
  const found: string[] = [];
  for (const g of groups) for (const c of fx.canaries[g]) if (hay.includes(c) && !sent.includes(c)) found.push(`${g}:${c}`);
  return found;
}

/** What an answer looks like for comparison: a result, a thrown error's class/code/message, a response. */
export function answerOf(o: Outcome): unknown {
  if (o.ok) return { value: normalizeValue(o.value) };
  const e = o.error as { name?: string; code?: unknown; message?: string; digest?: unknown } | undefined;
  return { threw: e?.name ?? typeof e, code: e?.code ?? null, digest: e?.digest ?? null, message: e?.message?.slice(0, 300) ?? null };
}
/** fields that differ between two identical answers (clocks, one-time codes) */
const VOLATILE = /^(createdAt|updatedAt|expiresAt|until|at|ts|setAt|revalidatedAt|lastSeenAt|serverUpdatedAt|requestId|rid)$/;
function normalizeValue(v: unknown): unknown {
  const json = JSON.stringify(v, jsonSafe);
  if (json === undefined) return null;
  return JSON.parse(json, (k, val: unknown) => {
    if (VOLATILE.test(k) && (typeof val === "string" || typeof val === "number")) return "<volatile>";
    // a one-time proof code ({ code, expiresAt }) is random per answer
    if (val && typeof val === "object" && "code" in val && "expiresAt" in val) return { ...(val as object), code: "<volatile>" };
    return val;
  });
}

/** One fingerprint of everything store A owns: tenant rows, the stores row, its members' users, media chunks, buckets, counters. */
export async function snapshot(storeId: string): Promise<{ hash: string; tables: Record<string, string> }> {
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const p = pool();
  const [cols] = (await p.query("SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'store_id' ORDER BY TABLE_NAME", [DB_NAME])) as unknown as [{ t: string }[]];
  const tables: Record<string, string> = {};
  const digest = (rows: unknown[]) =>
    createHash("sha256")
      .update(
        rows
          .map((r) => text(r))
          .sort()
          .join("\n"),
      )
      .digest("hex");
  for (const { t } of cols) {
    const [rows] = (await p.query("SELECT * FROM ?? WHERE store_id = ?", [t, storeId])) as unknown as [unknown[]];
    tables[t] = digest(rows);
  }
  const [store] = (await p.query("SELECT * FROM stores WHERE id = ?", [storeId])) as unknown as [unknown[]];
  tables.stores = digest(store);
  const [members] = (await p.query("SELECT u.* FROM users u JOIN store_members m ON m.user_id = u.id WHERE m.store_id = ?", [storeId])) as unknown as [unknown[]];
  tables.users = digest(members);
  // the account rows of A's members (sessions, resets, sign-in links, read marks: no store_id, keyed by the user)
  const [userTables] = (await p.query(
    "SELECT c.TABLE_NAME AS t FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = ? AND c.COLUMN_NAME = 'user_id' AND c.TABLE_NAME NOT IN (SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'store_id') ORDER BY 1",
    [DB_NAME, DB_NAME],
  )) as unknown as [{ t: string }[]];
  for (const { t } of userTables) {
    const [rows] = (await p.query("SELECT x.* FROM ?? x JOIN store_members m ON m.user_id = x.user_id WHERE m.store_id = ?", [t, storeId])) as unknown as [unknown[]];
    tables[`${t} (A's members)`] = digest(rows);
  }
  // the visitor markers of A's pages (no store_id: a page id is global)
  const [visitors] = (await p.query("SELECT v.* FROM stats_visitors v JOIN pages pg ON pg.id = v.page_id WHERE pg.store_id = ?", [storeId])) as unknown as [unknown[]];
  tables.stats_visitors = digest(visitors);
  const [chunks] = (await p.query("SELECT c.`key`, c.idx, SHA2(c.data, 256) AS h FROM media_chunks c JOIN media_files f ON f.`key` = c.`key` WHERE f.store_id = ?", [storeId])) as unknown as [unknown[]];
  tables.media_chunks = digest(chunks);
  const [buckets] = (await p.query("SELECT bucket FROM rate_limits WHERE bucket LIKE ?", [`%${storeId}%`])) as unknown as [unknown[]];
  tables.rate_limits = digest(buckets);
  return { hash: createHash("sha256").update(text(tables)).digest("hex"), tables };
}
export function snapshotDiff(a: { tables: Record<string, string> }, b: { tables: Record<string, string> }): string[] {
  return Object.keys({ ...a.tables, ...b.tables }).filter((k) => a.tables[k] !== b.tables[k]);
}

/* ================================================================== */
/* 5. the action catalogue                                             */
/* ================================================================== */

export type Area = "pages" | "versions" | "orders" | "leads" | "blocklist" | "media" | "exports" | "pixels" | "sheets" | "settings" | "search" | "generate" | "audit" | "team";

export interface ActionCase {
  /** "<file>#<export>" */
  id: string;
  file: string;
  name: string;
  area: Area;
  /** the dashboard path the action is posted from (the store comes from it, D2) */
  path: `/${string}` | "";
  /** every key the seam requires (all of them) */
  permission: StorePermission[];
  /** writes something: refused under impersonation, A's rows fingerprinted around it */
  write: boolean;
  /** arguments naming A's records (the attack, and A's owner's own call in qa:action-replay) */
  victim: (fx: Fixtures, fresh: Fresh) => Promise<unknown[]> | unknown[];
  /** arguments naming the attacker's own records (the role matrix) */
  own: (fx: Fixtures, fresh: Fresh) => Promise<unknown[]> | unknown[];
  /** arguments mixing the attacker's own record with A's (B's page, A's version): A's part answers as missing */
  mixed?: (fx: Fixtures, fresh: Fresh) => Promise<unknown[]> | unknown[];
  /**
   * The caller acts on their own membership only (leaving the store): never posted on B's path by B's fixture members
   * nor by the member of both on A's path (they would leave), so A's path is attacked by every non-member of A and the
   * role matrix runs as a fresh member of B per role.
   */
  self?: true;
}

/** Records made on demand (destructive cases get their own target). */
export interface Fresh {
  page(store: StoreFx, status?: "draft" | "published" | "archived"): Promise<string>;
  version(store: StoreFx, pageId: string, kind?: "save" | "publish"): Promise<string>;
  order(store: StoreFx, sheet?: "synced" | "failed" | "pending"): Promise<string>;
  block(store: StoreFx): Promise<string>;
  exportOf(store: StoreFx): Promise<string>;
  asset(store: StoreFx): Promise<string>;
  /** a Meta pixel of the store's library, with a token and a test code */
  pixel(store: StoreFx): Promise<string>;
  /** a pending invite of the store (id) */
  invite(store: StoreFx): Promise<string>;
  /** a new user, member of the store with `role` (user id) */
  member(store: StoreFx, role: Role): Promise<string>;
  updatedAt(pageId: string): Promise<number>;
  doc(store: StoreFx, opts?: { assetId?: string }): Promise<unknown>;
}

const F = (file: string) => ({ file, at: (name: string) => `${file}#${name}` });
const DASH = F("src/app/app/[store]/actions.ts");
const EXPORTS = F("src/app/app/[store]/exports/actions.ts");
const GENERATE = F("src/app/app/[store]/generate/actions.ts");
const HISTORY = F("src/app/app/[store]/history/actions.ts");
const MEDIA = F("src/app/app/[store]/media/actions.ts");
const ORDERS = F("src/app/app/[store]/orders/actions.ts");
const PAGES = F("src/app/app/[store]/pages/actions.ts");
const SETTINGS = F("src/app/app/[store]/settings/actions.ts");
const SHEETS = F("src/app/app/[store]/integrations/sheets/actions.ts");
const TEAM = F("src/app/app/[store]/team/actions.ts");
const EDITOR = F("src/lib/editor/actions.ts");
const PIXELS = F("src/lib/pixels/actions.ts");

function act(
  file: { file: string; at: (n: string) => string },
  name: string,
  area: Area,
  path: ActionCase["path"],
  permission: StorePermission | StorePermission[],
  write: boolean,
  victim: ActionCase["victim"],
  own: ActionCase["own"],
  opts: { mixed?: ActionCase["mixed"]; self?: true } = {},
): ActionCase {
  return { id: file.at(name), file: file.file, name, area, path, permission: Array.isArray(permission) ? permission : [permission], write, victim, own, ...opts };
}

const directions = async (fresh: Fresh, store: StoreFx, assetId?: string) => {
  const doc = (await fresh.doc(store, { assetId })) as { theme: { archetype: string } };
  return [{ name: "Huile d'argan", chosen: 0, directions: [{ archetype: doc.theme.archetype, label: "Direction 1", doc }], facts: ["3 couleurs"] }];
};
const storeForm = (store: StoreFx, logo?: string) => ({ storeName: store.name, legalName: `${store.name} SARL`, ...(logo ? { logo: { id: logo } } : {}), country: "MA", socials: {} });

/** Every exported server action of the store dashboard, with A's and B's arguments. */
export const ACTION_CASES: ActionCase[] = [
  // shell
  act(DASH, "searchAction", "search", "", "store.read", false, (fx) => [fx.canaries.customer[0]!], () => ["Baraka"]),
  // exports
  act(EXPORTS, "revokeExportAction", "exports", "/exports", "export.create", true, (fx, f) => f.exportOf(fx.A).then((id) => [id]), (fx, f) => f.exportOf(fx.B).then((id) => [id])),
  // generate
  act(GENERATE, "createFromDirectionsAction", "generate", "/generate", "pages.write", true, (fx, f) => directions(f, fx.A), (fx, f) => directions(f, fx.B)),
  // history
  act(HISTORY, "starVersionAction", "versions", "/history", "pages.write", true, (fx) => [fx.A.version.saved, true], (fx) => [fx.B.version.saved, true]),
  act(HISTORY, "restoreVersionAction", "versions", "/history", "pages.write", true, (fx) => [fx.A.version.saved], (fx) => [fx.B.version.saved]),
  act(HISTORY, "duplicateVersionAction", "versions", "/history", "pages.write", true, (fx) => [fx.A.version.saved], (fx) => [fx.B.version.saved]),
  // media
  act(MEDIA, "getAssetUsageAction", "media", "/media", "media.read", false, (fx) => [fx.A.asset.photo], (fx) => [fx.B.asset.photo]),
  act(MEDIA, "setAssetAltAction", "media", "/media", "media.write", true, (fx) => [fx.A.asset.photo, "Replaced alt"], (fx) => [fx.B.asset.photo, "B alt"]),
  // orders, leads, blocklist
  act(ORDERS, "getOrderAction", "orders", "/orders", "orders.read", false, (fx) => [fx.A.order.main], (fx) => [fx.B.order.main]),
  act(ORDERS, "updateOrderStatusAction", "orders", "/orders", "orders.write", true, (fx) => [fx.A.order.main, "confirmed"], (fx) => [fx.B.order.main, "confirmed"]),
  act(ORDERS, "resendToSheetAction", "orders", "/orders", "orders.write", true, (fx) => [fx.A.order.failed], (fx, f) => f.order(fx.B, "failed").then((id) => [id])),
  act(ORDERS, "retryFailedSyncAction", "orders", "/orders", "orders.write", true, () => [], () => []),
  act(ORDERS, "blockFromOrderAction", "blocklist", "/orders", "blocklist.write", true, (fx) => [fx.A.order.main, { phone: true, ip: true }, "attack"], (fx, f) => f.order(fx.B).then((id) => [id, { phone: true, ip: false }, "own"])),
  // a phone typed by B is B's own entry (the special cases block A's customer's phone in B)
  act(ORDERS, "blockPhoneAction", "blocklist", "/orders", "blocklist.write", true, () => [`+2126${randomInt(10_000_000, 99_999_999)}`, "attack"], () => [`+2126${randomInt(10_000_000, 99_999_999)}`, "own"]),
  act(ORDERS, "unblockAction", "blocklist", "/orders", "blocklist.write", true, (fx) => [fx.A.block.phone], (fx, f) => f.block(fx.B).then((id) => [id])),
  // pages
  act(PAGES, "duplicatePageAction", "pages", "/pages", "pages.write", true, (fx) => [fx.A.page.live], (fx) => [fx.B.page.live]),
  act(PAGES, "publishPageAction", "pages", "/pages", "pages.publish", true, (fx, f) => f.page(fx.A).then((id) => [id]), (fx, f) => f.page(fx.B).then((id) => [id])),
  act(PAGES, "unpublishPageAction", "pages", "/pages", "pages.publish", true, (fx, f) => f.page(fx.A, "published").then((id) => [id]), (fx, f) => f.page(fx.B, "published").then((id) => [id])),
  act(PAGES, "setHomePageAction", "pages", "/pages", "pages.publish", true, (fx) => [fx.A.page.live], (fx) => [fx.B.page.live]),
  act(PAGES, "archivePageAction", "pages", "/pages", "pages.write", true, (fx, f) => f.page(fx.A).then((id) => [id]), (fx, f) => f.page(fx.B).then((id) => [id])),
  act(PAGES, "restorePageAction", "pages", "/pages", "pages.write", true, (fx, f) => f.page(fx.A, "archived").then((id) => [id]), (fx, f) => f.page(fx.B, "archived").then((id) => [id])),
  act(PAGES, "deletePageAction", "pages", "/pages", "pages.write", true, (fx, f) => f.page(fx.A).then((id) => [id]), (fx, f) => f.page(fx.B).then((id) => [id])),
  // settings
  act(SETTINGS, "saveStoreAction", "settings", "/settings/general", "settings.write", true, (fx) => [storeForm(fx.A, fx.A.asset.photo)], (fx) => [storeForm(fx.B)]),
  act(SETTINGS, "saveDefaultsAction", "settings", "/settings/market", "settings.write", true, () => [{ market: "MA", locale: "fr", currency: "MAD", phoneCountry: "MA", shippingFee: 0, deliveryText: "Livraison 48h" }], () => [{ market: "MA", locale: "ar", currency: "MAD", phoneCountry: "MA", shippingFee: 0, deliveryText: "" }]),
  act(SETTINGS, "saveAiAction", "settings", "/settings/ai", "settings.write", true, () => [{ enabled: false, tier: "lite", bgRemoval: false }], () => [{ enabled: true, tier: "lite", bgRemoval: true }]),
  act(SETTINGS, "saveTurnstileAction", "settings", "/settings/anti-spam", "settings.write", true, (fx) => [{ siteKey: fx.canaries.data.find((c) => c.startsWith("0x4AAAAAAA"))!, secretKey: "••••cret" }], () => [{ siteKey: "0x4BBBBBBBBBBsite", secretKey: "0x4BBBBBBBBBBsecret" }]),
  act(SETTINGS, "loadAuditAction", "audit", "/settings/audit", "audit.read", false, (fx) => [{ beforeId: fx.A.auditId + 1 }], () => [{}]),
  // the store's export key
  act(SHEETS, "saveExportKeyAction", "sheets", "/integrations/sheets", "integrations.manage", true, () => [serviceAccountJson("attack@other.iam.gserviceaccount.com")], () => [serviceAccountJson("own@b.iam.gserviceaccount.com")]),
  act(SHEETS, "deleteExportKeyAction", "sheets", "/integrations/sheets", "integrations.manage", true, () => [], () => []),
  // team (T2's store actions; merged at the T4 merge): A's invites and members answer like missing ones
  // agent invites: the one role every inviting role may invite and revoke (a manager only agents, invitableRoles)
  act(TEAM, "createInviteAction", "team", "/team", "members.invite", true, () => [{ email: `attack.${randomInt(1e9)}@mail.test`, role: "agent" }], () => [{ email: `own.${randomInt(1e9)}@mail.test`, role: "agent" }]),
  act(TEAM, "revokeInviteAction", "team", "/team", "members.invite", true, (fx, f) => f.invite(fx.A).then((id) => [{ inviteId: id }]), (fx, f) => f.invite(fx.B).then((id) => [{ inviteId: id }])),
  act(TEAM, "changeMemberRoleAction", "team", "/team", "members.manage", true, (fx) => [{ userId: fx.A.members.editor, role: "viewer" }], (fx, f) => f.member(fx.B, "viewer").then((id) => [{ userId: id, role: "agent" }])),
  act(TEAM, "setMemberStatusAction", "team", "/team", "members.manage", true, (fx) => [{ userId: fx.A.members.agent, status: "suspended" }], (fx, f) => f.member(fx.B, "viewer").then((id) => [{ userId: id, status: "suspended" }])),
  act(TEAM, "removeMemberAction", "team", "/team", "members.manage", true, (fx, f) => f.member(fx.A, "viewer").then((id) => [{ userId: id }]), (fx, f) => f.member(fx.B, "viewer").then((id) => [{ userId: id }])),
  act(TEAM, "leaveStoreAction", "team", "/team", "store.read", true, () => [], () => [], { self: true }),
  // builder
  act(EDITOR, "loadPage", "pages", "/pages", "pages.read", false, (fx) => [{ pageId: fx.A.page.live }], (fx) => [{ pageId: fx.B.page.live }]),
  act(EDITOR, "saveDraft", "pages", "/pages", "pages.write", true, async (fx, f) => [{ pageId: fx.A.page.draft, doc: await f.doc(fx.A), baseUpdatedAt: await f.updatedAt(fx.A.page.draft), force: true }], async (fx, f) => {
    const id = await f.page(fx.B);
    return [{ pageId: id, doc: await f.doc(fx.B), baseUpdatedAt: await f.updatedAt(id), force: false }];
  }),
  act(EDITOR, "createVersion", "versions", "/pages", "pages.write", true, (fx) => [{ pageId: fx.A.page.live, kind: "save", label: "attack" }], (fx) => [{ pageId: fx.B.page.live, kind: "save", label: "own" }]),
  act(EDITOR, "listVersions", "versions", "/pages", "pages.read", false, (fx) => [{ pageId: fx.A.page.live }], (fx) => [{ pageId: fx.B.page.live }]),
  act(EDITOR, "getVersionPreview", "versions", "/pages", "pages.read", false, (fx) => [{ pageId: fx.A.page.live, versionId: fx.A.version.live }], (fx) => [{ pageId: fx.B.page.live, versionId: fx.B.version.live }], {
    mixed: (fx) => [{ pageId: fx.B.page.live, versionId: fx.A.version.live }],
  }),
  act(EDITOR, "restoreVersion", "versions", "/pages", "pages.write", true, async (fx, f) => [{ pageId: fx.A.page.live, versionId: fx.A.version.saved, baseUpdatedAt: await f.updatedAt(fx.A.page.live) }], async (fx, f) => {
    const id = await f.page(fx.B);
    return [{ pageId: id, versionId: await f.version(fx.B, id), baseUpdatedAt: await f.updatedAt(id) }];
  }, {
    mixed: async (fx, f) => [{ pageId: fx.B.page.live, versionId: fx.A.version.saved, baseUpdatedAt: await f.updatedAt(fx.B.page.live) }],
  }),
  act(EDITOR, "starVersion", "versions", "/pages", "pages.write", true, (fx) => [{ pageId: fx.A.page.live, versionId: fx.A.version.saved, starred: true }], (fx) => [{ pageId: fx.B.page.live, versionId: fx.B.version.saved, starred: true }], {
    mixed: (fx) => [{ pageId: fx.B.page.live, versionId: fx.A.version.saved, starred: true }],
  }),
  act(EDITOR, "renameVersion", "versions", "/pages", "pages.write", true, (fx) => [{ pageId: fx.A.page.live, versionId: fx.A.version.saved, label: "renamed" }], (fx) => [{ pageId: fx.B.page.live, versionId: fx.B.version.saved, label: "renamed" }], {
    mixed: (fx) => [{ pageId: fx.B.page.live, versionId: fx.A.version.saved, label: "renamed" }],
  }),
  act(EDITOR, "duplicatePage", "pages", "/pages", "pages.write", true, (fx) => [{ pageId: fx.A.page.live, versionId: fx.A.version.saved }], (fx) => [{ pageId: fx.B.page.live }], {
    mixed: (fx) => [{ pageId: fx.B.page.live, versionId: fx.A.version.saved }],
  }),
  act(EDITOR, "updatePageMeta", "pages", "/pages", "pages.write", true, (fx, f) => f.page(fx.A).then((id) => [{ pageId: id, name: "Renamed", slug: `moved-${randomInt(1e6)}` }]), (fx, f) => f.page(fx.B).then((id) => [{ pageId: id, name: "Renamed", slug: `moved-${randomInt(1e6)}` }])),
  act(EDITOR, "publish", "pages", "/pages", "pages.publish", true, (fx, f) => f.page(fx.A).then((id) => [{ pageId: id }]), (fx, f) => f.page(fx.B).then((id) => [{ pageId: id }])),
  act(EDITOR, "unpublish", "pages", "/pages", "pages.publish", true, (fx, f) => f.page(fx.A, "published").then((id) => [{ pageId: id }]), (fx, f) => f.page(fx.B, "published").then((id) => [{ pageId: id }])),
  // pixels
  act(PIXELS, "pixelLibraryAction", "pixels", "/integrations/pixels", "pages.read", false, () => [], () => []),
  act(PIXELS, "savePixelEntryAction", "pixels", "/integrations/pixels", "pixels.manage", true, (fx) => [{ platform: "meta", id: fx.A.pixel.shared, label: "attack label" }], () => [{ platform: "meta", id: metaPixelId(), label: "own" }]),
  act(PIXELS, "removePixelEntryAction", "pixels", "/integrations/pixels", ["pixels.manage", "integrations.manage"], true, (fx, f) => f.pixel(fx.A).then((id) => [{ platform: "meta", id }]), (fx, f) => f.pixel(fx.B).then((id) => [{ platform: "meta", id }])),
  act(PIXELS, "pixelUsageAction", "pixels", "/integrations/pixels", "settings.read", false, (fx) => [{ platform: "meta", id: fx.A.pixel.own }], (fx) => [{ platform: "meta", id: fx.B.pixel.shared }]),
  act(PIXELS, "replacePixelAction", "pixels", "/pages", "pages.write", true, (fx) => [{ platform: "meta", from: fx.A.pixel.shared, to: null, pageIds: [fx.A.page.live, fx.A.page.draft], live: false }], (fx) => [{ platform: "meta", from: fx.B.pixel.shared, to: null, pageIds: [fx.B.page.draft], live: false }], {
    // a fresh page of B (its draft has no pixel: both calls leave it unchanged) beside A's draft
    mixed: async (fx, f) => [{ platform: "meta", from: fx.B.pixel.shared, to: null, pageIds: [await f.page(fx.B), fx.A.page.draft], live: false }],
  }),
  act(PIXELS, "pagePixelsAction", "pixels", "/pages", "pages.read", false, (fx) => [fx.A.page.live], (fx) => [fx.B.page.live]),
  act(PIXELS, "applyLiveTrackingAction", "pixels", "/pages", "pages.publish", true, (fx) => [{ pageId: fx.A.page.live, baseVersionId: fx.A.version.live }], (fx) => [{ pageId: fx.B.page.live, baseVersionId: fx.B.version.live }], {
    mixed: (fx) => [{ pageId: fx.B.page.live, baseVersionId: fx.A.version.live }],
  }),
  act(PIXELS, "startPixelTestAction", "pixels", "/integrations/pixels", "pages.publish", true, (fx) => [{ pageId: fx.A.page.live, platform: "meta", id: fx.A.pixel.own, minutes: 30 }], (fx) => [{ pageId: fx.B.page.live, platform: "meta", id: fx.B.pixel.own, minutes: 30 }]),
  act(PIXELS, "stopPixelTestAction", "pixels", "/integrations/pixels", "pages.publish", true, (fx) => [{ pageId: fx.A.page.live, platform: "meta", id: fx.A.pixel.own }], (fx) => [{ pageId: fx.B.page.live, platform: "meta", id: fx.B.pixel.own }]),
  act(PIXELS, "pagesPixelsAction", "pixels", "/pages", "pages.read", false, () => [], () => []),
  act(PIXELS, "wizardPixelsAction", "pixels", "/generate", "pages.read", false, () => [], () => []),
  act(PIXELS, "sendPixelTestAction", "pixels", "/integrations/pixels", "integrations.manage", false, (fx) => [{ platform: "meta", id: fx.A.pixel.shared, token: "", testCode: "TEST4242" }], (fx) => [{ platform: "meta", id: fx.B.pixel.own, token: "", testCode: "" }]),
  act(PIXELS, "storePixelSummaryAction", "pixels", "/generate", "pages.read", false, () => [], () => []),
];

/** "use server" files that are not store actions (each with the reason); any other must have a case for every export. */
export const NOT_STORE_ACTIONS: Record<string, string> = {
  "src/app/(public)/actions.ts": "the language menu (T2): signed out or in, no store",
  "src/app/(public)/invite/[token]/actions.ts": "invite acceptance (T2): the store comes from the hashed one-time token, never a path (selftest-team)",
  "src/app/(public)/login/actions.ts": "sign-in (T2): no store, no session yet",
  "src/app/(public)/login/verify/actions.ts": "two-step sign-in (T2): no store",
  "src/app/(public)/reset/[token]/actions.ts": "a password reset by its one-time link (T2): no store",
  "src/app/(public)/signup/actions.ts": "sign-up and the handle check (T2): no store yet",
  "src/app/admin/(auth)/setup/actions.ts": "first-run bootstrap (T2): no store",
  "src/app/admin/(auth)/setup/store/actions.ts": "the super_admin's first store (T2): before any membership",
  "src/app/app/account/actions.ts": "the account's own profile, password, sessions and deletion (T2): no store",
  "src/app/app/account/two-factor/actions.ts": "the account's own two-step setup (T2): no store",
  "src/app/app/new/actions.ts": "a new store (T2): the caller is a member of nothing there yet",
  "src/lib/auth/actions.ts": "account session actions (T2): no store",
};

/** Every exported function of every "use server" file under src/ (derived from the tree, so a new action is attacked the day it is added). */
export function deriveServerActions(): { file: string; name: string; storeScoped: boolean }[] {
  const out: { file: string; name: string; storeScoped: boolean }[] = [];
  for (const file of walk(path.join(ROOT, "src"), (f) => /\.(ts|tsx)$/.test(f))) {
    const src = readFileSync(file, "utf8");
    if (directiveOf(src) !== "use server") continue;
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    for (const m of src.matchAll(/^export\s+async\s+function\s+([A-Za-z0-9_]+)/gm)) out.push({ file: rel, name: m[1]!, storeScoped: !(rel in NOT_STORE_ACTIONS) });
  }
  return out;
}

/** The module's directive ("use server" / "use client") after its leading comments, in one linear pass. */
export function directiveOf(src: string): "use server" | "use client" | null {
  let i = 0;
  for (;;) {
    while (i < src.length && /\s/.test(src[i]!)) i++;
    if (src.startsWith("//", i)) {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end + 1;
    } else if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 2;
    } else break;
  }
  const m = /^["'](use server|use client)["']/.exec(src.slice(i, i + 16));
  return m ? (m[1] as "use server" | "use client") : null;
}

export function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      out.push(...walk(p, keep));
    } else if (keep(p)) out.push(p);
  }
  return out.sort();
}

/** The source text of one exported function (to check the declared keys against the code). */
export function functionSource(file: string, name: string): string {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  const start = src.search(new RegExp(`^export\\s+async\\s+function\\s+${name}\\b`, "m"));
  if (start < 0) return "";
  const next = src.slice(start + 1).search(/^export\s/m);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

/** The action function itself. */
export function actionFn(c: Pick<ActionCase, "file" | "name">): (...args: unknown[]) => Promise<unknown> {
  const mod = load<Record<string, unknown>>(path.join(ROOT, c.file));
  const fn = mod[c.name];
  if (typeof fn !== "function") throw new Error(`${c.file} has no export ${c.name}`);
  return fn as (...args: unknown[]) => Promise<unknown>;
}

/** An action result's refusal code: storeAction's `error`, or the builder's (`{ ok: false, error }`). */
export function refusal(o: Outcome): string | null {
  if (!o.ok) return "threw";
  const v = o.value as { ok?: boolean; error?: unknown } | null;
  return v && typeof v === "object" && v.ok === false ? String(v.error) : null;
}

/* ================================================================== */
/* 6. setup                                                            */
/* ================================================================== */

export interface Kit {
  fx: Fixtures;
  fresh: Fresh;
}

export async function setup(): Promise<Kit> {
  suite("setup");
  await createDatabase();
  const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
  const migrated = await runMigrations();
  check("migrations applied on the throwaway database", (migrated as { status?: string }).status === "applied", migrated);
  const fx = await seed();
  return { fx, fresh: freshFactory(fx) };
}

function freshFactory(fx: Fixtures): Fresh {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { newId, newPublicKey } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const register = (store: StoreFx, id: string) => {
    if (store.key !== "A") return id;
    fx.canaries.ids.push(id);
    fx.ghosts.set(id, ghostOf(id));
    return id;
  };
  const doc = async (store: StoreFx, opts: { assetId?: string } = {}) => {
    const d = fixtureDoc(store.asset.photo);
    if (opts.assetId) (d.product as Record<string, unknown>).images = [{ id: opts.assetId }];
    return d as unknown as import("@/lib/page/schema").PageDoc;
  };
  return {
    doc,
    async page(store, status = "draft") {
      const id = newId();
      const d = await doc(store);
      await db.insert(S.pages).values({ id, storeId: store.id, slug: `p-${id.toLowerCase()}`, name: `${store.key === "A" ? fx.canaries.data[0] : "B"} copy`, status, locale: d.locale, publicKey: newPublicKey(), draft: d, createdBy: store.members.owner });
      if (status === "published") {
        const vid = newId();
        await db.insert(S.pageVersions).values({ id: vid, storeId: store.id, pageId: id, kind: "publish", label: null, doc: d, checksum: createHash("sha256").update(vid).digest("hex"), createdBy: store.members.owner, html: "<!doctype html><p>live</p>", runtimeV: 2 });
        await db.update(S.pages).set({ publishedVersionId: vid }).where(eq(S.pages.id, id));
        register(store, vid);
      }
      return register(store, id);
    },
    async version(store, pageId, kind = "save") {
      const id = newId();
      await db.insert(S.pageVersions).values({ id, storeId: store.id, pageId, kind, label: "fresh", doc: await doc(store), checksum: createHash("sha256").update(id).digest("hex"), createdBy: store.members.owner });
      return register(store, id);
    },
    async order(store, sheet = "pending") {
      const id = `${store.key}${rand(CROCKFORD, 1)}-${rand(CROCKFORD, 8)}`;
      await db.insert(S.orders).values({
        id,
        storeId: store.id,
        pageId: store.page.live,
        versionId: store.version.live,
        status: "new",
        name: store.customer.name,
        phone: `+2126${randomInt(10_000_000, 99_999_999)}`,
        city: store.customer.city,
        address: store.customer.address,
        productName: "Argan",
        items: { v: 2, bundleId: "b1", bundleLabel: "1 x Argan", qty: 1, unitPrice: 199, variants: [] } as never,
        qty: 1,
        subtotal: 19900,
        shipping: 0,
        total: 19900,
        currency: "MAD",
        idem: randomBytes(18).toString("hex"),
        sheetStatus: sheet,
      } as never);
      return register(store, id);
    },
    async block(store) {
      const id = newId();
      await db.insert(S.blocklist).values({ id, storeId: store.id, kind: "phone", value: `+2125${randomInt(10_000_000, 99_999_999)}`, reason: "fresh" });
      return register(store, id);
    },
    async exportOf(store) {
      const id = newId();
      await db.insert(S.exportsTable).values({ id, storeId: store.id, pageId: store.page.live, versionId: store.version.live, mode: "connected", publicKey: newPublicKey(), allowedOrigins: [] });
      return register(store, id);
    },
    async pixel(store) {
      const { savePixelEntry } = load<typeof import("@/lib/pixels/library.server")>("@/lib/pixels/library.server");
      const id = metaPixelId();
      await savePixelEntry(writeScope(store.id), { platform: "meta", id, label: "fresh", token: `EAAT${randomBytes(12).toString("hex")}`, testCode: "TEST9999" }, userActor(store.members.owner));
      if (store.key === "A") fx.canaries.data.push(id);
      return register(store, id);
    },
    async asset(store) {
      const id = rand("0123456789abcdef", 32);
      await db.insert(S.assets).values({ id, storeId: store.id, mime: "image/webp", width: 10, height: 10, bytes: 10, variants: [], tags: [] } as never);
      return register(store, id);
    },
    async invite(store) {
      const id = newId();
      await db.insert(S.storeInvites).values({ id, storeId: store.id, emailNorm: `fresh.${id.toLowerCase()}@mail.test`, role: "agent", tokenHash: createHash("sha256").update(randomBytes(16)).digest("hex"), invitedBy: store.members.owner, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
      return register(store, id);
    },
    async member(store, role) {
      const id = newId();
      await db.insert(S.users).values({ id, email: `fresh.${id.toLowerCase()}@tenancy.test`, name: `Fresh ${role}`, passwordHash: "tenancy-check:no-password", platformRole: "none" as never, totpEnabled: false });
      await db.insert(S.storeMembers).values({ storeId: store.id, userId: id, role });
      return register(store, id);
    },
    async updatedAt(pageId) {
      const [r] = await db.select({ u: S.pages.updatedAt }).from(S.pages).where(eq(S.pages.id, pageId)).limit(1);
      return r?.u.getTime() ?? 0;
    },
  };
}

/* ================================================================== */
/* 7. suites                                                           */
/* ================================================================== */

/** The attackers of store A: every role of B, the member of both (as B's owner), an outsider, staff without a membership. */
export function attackers(fx: Fixtures): { label: string; userId: string; role: Role | null }[] {
  return [
    ...ROLES.map((r) => ({ label: `B ${r}`, userId: fx.B.members[r], role: r as Role | null })),
    { label: "member of A and B", userId: fx.dual, role: "owner" as Role },
    { label: "outsider", userId: fx.outsider, role: null },
    { label: "staff without membership", userId: fx.staff.id, role: null },
  ];
}

const appPath = (handle: string, p: string) => `/app/${handle}${p}`;

/** Every action as every attacker: on B's path with A's ids (≡ a missing id), on A's path (≡ an unknown handle), the role matrix. */
export async function actionSuite(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  const { can } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  suite("actions × roles");

  // coverage: derived from the tree
  const derived = deriveServerActions();
  const known = new Set(ACTION_CASES.map((c) => c.id));
  for (const d of derived) {
    if (!d.storeScoped) continue;
    check(`action ${d.file}#${d.name} has an attack case`, known.has(`${d.file}#${d.name}`));
  }
  for (const c of ACTION_CASES) {
    check(`case ${c.id} names an exported action`, derived.some((d) => `${d.file}#${d.name}` === c.id));
    let body = functionSource(c.file, c.name);
    // keys computed by a helper of the file (`storeAction(entryKeys(input), …)`): the helper's text counts
    const helper = /storeAction\((\w+)\(/.exec(body)?.[1];
    if (helper) {
      const src = readFileSync(path.join(ROOT, c.file), "utf8");
      const at = src.search(new RegExp(`^function ${helper}\\b`, "m"));
      if (at >= 0) body += src.slice(at, src.indexOf("\n}\n", at) + 2);
    }
    check(`case ${c.id}: its keys are the code's (${c.permission.join(", ")})`, c.permission.every((p) => body.includes(`"${p}"`)), body.slice(0, 200));
  }
  for (const [file, why] of Object.entries(NOT_STORE_ACTIONS)) {
    const src = existsSync(path.join(ROOT, file)) ? readFileSync(path.join(ROOT, file), "utf8") : "";
    check(`${file} is not a store action file (${why})`, !src.includes("storeAction("));
  }

  const slow: [string, number][] = [];
  for (const c of ACTION_CASES) {
    const caseStarted = Date.now();
    const fn = actionFn(c);
    // the arguments first: a destructive case gets a fresh record of A, made before the fingerprint
    const args = await c.victim(fx, fresh);
    const ghostArgs = ghostify(fx, args);
    // no id of A in the arguments (a form of B's own): the two calls would be the same call, only the effects count
    const namesA = text(args) !== text(ghostArgs);
    const before = await snapshot(fx.A.id);
    for (const who of attackers(fx)) {
      // 1. B's path (the attacker's own store, or none) with A's ids: what a missing id answers
      const own = appPath(fx.B.handle, c.path);
      // a self action of a member of B would act on that member (leave B): A's path below is the attack
      if (c.self && who.role !== null) {
        if (who.userId === fx.dual) continue;
        const onA = await call(armed(who.userId), appPath(fx.A.handle, c.path), () => fn(...structuredClone(args)));
        const onGhost = await call(armed(who.userId), appPath(fx.ghostHandle, c.path), () => fn(...structuredClone(args)));
        check(`${c.id} · ${who.label} · A's path: not_found`, refusal(onA) === "not_found", answerOf(onA));
        check(`${c.id} · ${who.label} · A's path: same answer as an unknown handle`, text(answerOf(onA)) === text(answerOf(onGhost)), { onA: answerOf(onA), onGhost: answerOf(onGhost) });
        continue;
      }
      const real = await call(armed(who.userId), own, () => fn(...structuredClone(args)));
      const label = `${c.id} · ${who.label} · B's path, A's ids`;
      if (namesA) {
        const ghost = await call(armed(who.userId), own, () => fn(...structuredClone(ghostArgs)));
        if (ranReal(label, real, ghost)) check(`${label}: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
      } else ranReal(label, real);
      const leaked = leaks(fx, [answerOf(real), real.revalidated], { sent: args });
      check(`${label}: no canary of A`, leaked.length === 0, leaked);
      check(`${label}: revalidates only B's screens`, real.revalidated.every((t) => !t.includes(`/app/${fx.A.handle}`)), real.revalidated);

      // 2. A's path: the neutral not_found, as for an unknown handle (the member of both is A's viewer: below)
      if (who.userId === fx.dual) continue;
      const onA = await call(armed(who.userId), appPath(fx.A.handle, c.path), () => fn(...structuredClone(args)));
      const onGhost = await call(armed(who.userId), appPath(fx.ghostHandle, c.path), () => fn(...structuredClone(args)));
      const la = `${c.id} · ${who.label} · A's path`;
      check(`${la}: not_found`, refusal(onA) === "not_found", answerOf(onA));
      check(`${la}: same answer as an unknown handle`, text(answerOf(onA)) === text(answerOf(onGhost)), { onA: answerOf(onA), onGhost: answerOf(onGhost) });
      check(`${la}: no canary of A`, leaks(fx, answerOf(onA), { sent: args }).length === 0, leaks(fx, answerOf(onA), { sent: args }));
    }
    // the member of both stores on A's path is A's viewer: a write is forbidden (a self action would act on them)
    if (c.write && !c.self) {
      const r = await call({ userId: fx.dual }, appPath(fx.A.handle, c.path), () => fn(...structuredClone(args)));
      const expect = c.permission.every((p) => can("viewer", p)) ? null : "forbidden";
      if (expect) check(`${c.id} · member of A and B · A's path (A's viewer): forbidden`, refusal(r) === expect, answerOf(r));
    }
    // B's own record with A's: what the same call with a missing id answers
    if (c.mixed) {
      const mixed = await c.mixed(fx, fresh);
      const real = await call(armed(fx.B.members.owner), appPath(fx.B.handle, c.path), () => fn(...structuredClone(mixed)));
      const ghost = await call(armed(fx.B.members.owner), appPath(fx.B.handle, c.path), () => fn(...ghostify(fx, structuredClone(mixed))));
      const label = `${c.id} · B owner · B's record with A's`;
      if (ranReal(label, real, ghost)) check(`${label}: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
      check(`${label}: no canary of A`, leaks(fx, answerOf(real), { sent: mixed }).length === 0, leaks(fx, answerOf(real), { sent: mixed }));
    }
    const after = await snapshot(fx.A.id);
    check(`${c.id}: A's rows unchanged by every attempt`, after.hash === before.hash, snapshotDiff(before, after));

    // 3. the role matrix in B's own store: a role without the key is refused before the body
    for (const role of ROLES) {
      const allowed = c.permission.every((p) => can(role, p));
      const ownArgs = await c.own(fx, fresh);
      // a self action runs as a fresh member of B (the fixture's members stay)
      const caller = c.self ? await fresh.member(fx.B, role) : fx.B.members[role];
      // a granted member with a fresh step-up (the secret writes and exports ask for one, §B.7): the body runs
      const r = await call(allowed ? armed(caller) : { userId: caller }, appPath(fx.B.handle, c.path), () => fn(...ownArgs));
      const code = refusal(r);
      const label = `${c.id} · B ${role} · own store (${allowed ? "granted" : "not granted"})`;
      if (!allowed) check(`${label}: forbidden`, code === "forbidden", answerOf(r));
      else if (!ranReal(label, r)) continue;
      // granted: the body runs (an answer of its own, never a refusal of the seam or a server error)
      else check(`${label}: reaches the body`, code !== "forbidden" && code !== "not_found" && code !== "threw" && code !== "server" && code !== "step_up", answerOf(r));
    }
    slow.push([c.id, Date.now() - caseStarted]);
  }
  for (const [id, ms] of slow.sort((a, b) => b[1] - a[1]).slice(0, 12)) if (ms > 2000) console.log(`  … slow case: ${id} ${Math.round(ms / 1000)} s`);
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

export interface RouteFile {
  file: string;
  /** "/api/app/[store]/media/[id]" */
  template: string;
  methods: string[];
}

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every route handler of the app (derived from the whole src/app tree: dashboard, API, store routes, media, previews, SEO files). */
export function deriveRoutes(): RouteFile[] {
  const out: RouteFile[] = [];
  for (const file of walk(path.join(ROOT, "src", "app"), (f) => /[\\/]route\.(ts|tsx)$/.test(f))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const template = `/${rel.replace(/^src\/app\//, "").replace(/\/?route\.tsx?$/, "")}`
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .join("/");
    const mod = load<Record<string, unknown>>(file);
    out.push({ file: rel, template: template || "/", methods: METHODS.filter((m) => typeof mod[m] === "function") });
  }
  return out;
}

/** The A id a route's [id] segment takes, by the segment before it. */
function idFor(fx: Fixtures, template: string, store: StoreFx): string {
  const parent = /\/([^/]+)\/\[id\]/.exec(template)?.[1] ?? "";
  if (parent === "export") return store.export;
  if (parent === "media") return store.asset.photo;
  return store.page.live;
}

interface RoutePlan {
  query?: Record<string, string>;
  body?: unknown;
  multipart?: boolean;
  /** the B-handle-with-A's-ids comparison does not apply (an upload of the same bytes dedupes the second time) */
  skipIds?: boolean;
}
/** Query and body per "<METHOD> <template>" naming A's records; a route not listed gets none. */
function routePlan(fx: Fixtures, method: string, template: string): RoutePlan {
  const A = fx.A;
  const plans: Record<string, RoutePlan> = {
    "GET /api/app/[store]/media": { query: { sourceAssetId: A.asset.photo, q: fx.canaries.data.find((c) => c.startsWith("alt "))! } },
    "POST /api/app/[store]/media": { multipart: true, skipIds: true },
    "DELETE /api/app/[store]/media": { query: { id: A.asset.photo, force: "1" } },
    "PATCH /api/app/[store]/media/[id]": { body: { focal: { x: 0.5, y: 0.5 } } },
    "GET /api/app/[store]/export": { query: { pageId: A.page.live, versionId: A.version.live } },
    "POST /api/app/[store]/export": { body: { versionId: A.version.live, mode: "connected", allowedOrigins: ["https://shop.example.org"], options: { hostConfigs: true } } },
    "GET /api/app/[store]/export/estimate": { query: { versionId: A.version.live, mode: "php" } },
    // the Orders filter is `page_id` (parseOrderQuery); `page` is the pager
    "GET /api/app/[store]/orders/export": { query: { page_id: A.page.live, q: A.customer.name } },
    "POST /api/app/[store]/sheets/connect": { body: { url: `https://docs.google.com/spreadsheets/d/${A.spreadsheetId}/edit#gid=0` } },
    "PATCH /api/app/[store]/sheets/connect": { body: { enabled: true } },
    "GET /app/[store]/preview/[id]": { query: { v: A.version.live } },
  };
  return plans[`${method} ${template}`] ?? {};
}

export interface RouteAnswer {
  status: number;
  location: string | null;
  body: string;
  contentType: string;
}

/** Call one route handler in-process (a NextRequest of the platform host). */
export async function callRoute(
  who: Who,
  route: RouteFile,
  method: string,
  params: Record<string, string>,
  plan: RoutePlan,
  opts: { headers?: Record<string, string>; photo?: Buffer } = {},
): Promise<Outcome<RouteAnswer>> {
  const { NextRequest } = load<typeof import("next/server")>("next/server");
  const mod = load<Record<string, (req: unknown, ctx: unknown) => Promise<Response>>>(path.join(ROOT, route.file));
  let urlPath = route.template;
  for (const [k, v] of Object.entries(params)) urlPath = urlPath.replace(`[${k}]`, encodeURIComponent(v));
  const url = new URL(urlPath, PLATFORM);
  for (const [k, v] of Object.entries(plan.query ?? {})) url.searchParams.set(k, v);
  const headers = platformHeaders(opts.headers);
  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (plan.multipart) {
      const boundary = `----tenancy${randomBytes(6).toString("hex")}`;
      const parts: Buffer[] = [];
      const field = (name: string, value: string) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
      for (const [k, v] of Object.entries((plan.body as Record<string, string> | undefined) ?? {})) field(k, v);
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`), opts.photo ?? Buffer.alloc(0), Buffer.from(`\r\n--${boundary}--\r\n`));
      const buf = Buffer.concat(parts);
      body = new Uint8Array(buf);
      headers.set("content-type", `multipart/form-data; boundary=${boundary}`);
      headers.set("content-length", String(buf.length));
    } else {
      body = JSON.stringify(plan.body ?? {});
      headers.set("content-type", "application/json");
    }
  }
  const req = new NextRequest(url, { method, headers, body });
  return call(who, `${url.pathname}${url.search}`, async () => {
    const res = await mod[method]!(req, { params: Promise.resolve(params) });
    const type = res.headers.get("content-type") ?? "";
    const raw = method === "HEAD" ? "" : /zip|octet|image|video/.test(type) ? `[binary ${(await res.arrayBuffer()).byteLength}]` : await res.text();
    return { status: res.status, location: res.headers.get("location"), body: raw, contentType: type };
  });
}

const routeAnswer = (o: Outcome<RouteAnswer>) => (o.ok ? { status: o.value!.status, location: o.value!.location, body: normalizeBody(o.value!.body) } : answerOf(o));
function normalizeBody(body: string): unknown {
  try {
    return normalizeValue(JSON.parse(body));
  } catch {
    return body;
  }
}

/** The key a route method's storeGuard asks for, read from the handler's source (null: no guard of its own). */
function guardKey(route: RouteFile, method: string): StorePermission | null {
  const src = readFileSync(path.join(ROOT, route.file), "utf8");
  const start = src.search(new RegExp(`^export async function ${method}\\b`, "m"));
  if (start < 0) return null;
  const next = src.slice(start + 1).search(/^export\s/m);
  const body = next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
  // the first string literal of the call (`storeGuard(req, (await params).store, "media.read")`: the handle expression has parentheses)
  return (/storeGuard\([^"]*?"([a-z_.]+)"/.exec(body)?.[1] as StorePermission | undefined) ?? null;
}

/**
 * A public, platform or cron route (no store in a dashboard path): a member's session changes nothing and shows
 * nothing it should not. On A's address (GET/HEAD): no customer or secret canary (A's published pages are public by
 * design); on B's address with A's slug, A's old and draft slugs and `?p=` naming them: nothing of A at all and never
 * a redirect into A; every other method (an empty body): the signed-out answer, no canary of A.
 */
async function publicRoute(fx: Fixtures, route: RouteFile, method: string, slugsA: string[]): Promise<void> {
  const who = { userId: fx.B.members.owner };
  const t = route.template;
  const mediaKeyA = fx.canaries.ids.find((k) => k.startsWith(fx.A.asset.photo) && k !== fx.A.asset.photo) ?? "";
  const params = (store: StoreFx, slug: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (t.includes("[store]")) out.store = store.handle;
    if (t.includes("[slug]")) out.slug = slug;
    if (t.includes("[id]")) out.id = idFor(fx, t, fx.A);
    if (t.includes("[key]")) out.key = mediaKeyA;
    if (t.includes("[token]")) out.token = "not-a-preview-token";
    if (t.includes("[name]")) out.name = "argan";
    if (t.includes("[doc]")) out.doc = "privacy";
    if (t.includes("[kind]")) out.kind = "privacy";
    return out;
  };
  const label = `${method} ${t}`;
  if (method !== "GET" && method !== "HEAD") {
    const r = await callRoute(who, route, method, params(fx.A, fx.A.slug), { body: {} });
    const anon = await callRoute({ anonymous: true }, route, method, params(fx.A, fx.A.slug), { body: {} });
    if (ranReal(`${label} · B owner, empty body`, r, anon)) check(`${label} · B owner, empty body: the signed-out answer`, text(routeAnswer(r)) === text(routeAnswer(anon)), { member: routeAnswer(r), anonymous: routeAnswer(anon) });
    const leaked = leaks(fx, routeAnswer(r), { only: ["customer", "secret"] });
    check(`${label} · B owner, empty body: no customer or secret canary of A`, leaked.length === 0, leaked);
    return;
  }
  const onA = await callRoute(who, route, method, params(fx.A, fx.A.slug), {});
  if (!ranReal(`${label} · B owner · A's address`, onA)) return;
  const leakedA = leaks(fx, routeAnswer(onA), { only: ["customer", "secret"] });
  check(`${label} · B owner · A's address: no customer or secret canary of A`, leakedA.length === 0, leakedA);
  if (t === "/api/cron/tick") check(`${label} · B owner: refused without the cron key`, onA.ok && onA.value!.status >= 400, routeAnswer(onA));
  if (!t.includes("[store]")) return;
  for (const slug of [...new Set(slugsA)]) {
    const p = params(fx.B, slug);
    const onB = await callRoute(who, route, method, p, { query: { p: slug } });
    const l = `${label} · B's address, A's slug "${slug}"`;
    if (!ranReal(l, onB)) continue;
    const leaked = leaks(fx, routeAnswer(onB), { sent: p });
    check(`${l}: nothing of A`, leaked.length === 0, leaked);
    const to = onB.ok ? (onB.value!.location ?? "") : "";
    check(`${l}: never a redirect into A`, !to.includes(`/s/${fx.A.handle}`) && !(onB.ok && onB.value!.body.includes(`/s/${fx.A.handle}/`)), { status: onB.ok ? onB.value!.status : null, location: to });
  }
}

export async function routeSuite(kit: Kit): Promise<void> {
  const { fx } = kit;
  const { can } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  suite("routes");
  const routes = deriveRoutes();
  check(
    "the route list is derived from the tree (api/app/**, app/**, s/** and the root handlers found)",
    ["/api/app/", "/app/", "/s/", "/media/", "/preview/", "/api/public/"].every((p) => routes.some((r) => r.template.startsWith(p))),
    routes.map((r) => r.template),
  );
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const [slugRows] = (await pool().query("SELECT slug FROM page_slug_history WHERE store_id = ?", [fx.A.id])) as unknown as [{ slug: string }[]];
  // A's old slugs (a 308 to A's page on A's address): on B's address they are nobody's
  const oldSlugsA = slugRows.map((r) => r.slug);
  check("A has an old slug in its history (the redirect case below is not empty)", oldSlugsA.length > 0, oldSlugsA);
  const [[draftRow]] = (await pool().query("SELECT slug FROM pages WHERE id = ?", [fx.A.page.draft])) as unknown as [[{ slug: string }]];
  // the shared live slug, A's old slugs and the slug only A's draft uses
  const slugsA = [fx.A.slug, ...oldSlugsA, draftRow.slug];
  notApplicable(
    "the public writes (POST /api/public/order, lead, event, upsell) with A's page key under a member's session",
    "the public write path takes no session (a shopper's request): its two-store cases (A's page key from B's host in S mode, per-store limits, blocklist, idem, upsell) are test:public-api's",
  );
  for (const route of routes) {
    const tenant = route.template.includes("[store]") && !route.template.startsWith("/s/");
    for (const method of route.methods) {
      const plan = routePlan(fx, method, route.template);
      const before = await snapshot(fx.A.id);
      if (!tenant) {
        await publicRoute(fx, route, method, slugsA);
        const after = await snapshot(fx.A.id);
        check(`${method} ${route.template}: A's rows unchanged by every attempt`, after.hash === before.hash, snapshotDiff(before, after));
        continue;
      }
      for (const who of attackers(fx)) {
        const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.A) } : {};
        // 1. A's handle: the neutral 404 of an unknown handle
        if (who.userId !== fx.dual) {
          const onA = await callRoute(armed(who.userId), route, method, { store: fx.A.handle, ...ids }, plan, { photo: fx.A.photoBytes });
          const onGhost = await callRoute(armed(who.userId), route, method, { store: fx.ghostHandle, ...ids }, plan, { photo: fx.A.photoBytes });
          const la = `${method} ${route.template} · ${who.label} · A's handle`;
          const a = routeAnswer(onA);
          const g = JSON.parse(text(routeAnswer(onGhost)).split(fx.ghostHandle).join(fx.A.handle)) as unknown;
          if (ranReal(la, onA, onGhost)) {
            check(`${la}: same answer as an unknown handle`, text(a) === text(g), { onA: a, onGhost: g });
            check(`${la}: 404 (or the alias redirect)`, onA.ok && (onA.value!.status === 404 || (onA.value!.status === 307 && (onA.value!.location ?? "").includes(`/app/${fx.A.handle}/`))), a);
          }
          check(`${la}: no canary of A`, leaks(fx, a, { sent: plan }).length === 0, leaks(fx, a, { sent: plan }));
        }
        // 2. B's handle with A's ids: what a missing id answers
        if (plan.skipIds) continue;
        const real = await callRoute(armed(who.userId), route, method, { store: fx.B.handle, ...ids }, plan);
        const ghost = await callRoute(armed(who.userId), route, method, { store: fx.B.handle, ...ghostify(fx, ids) }, ghostify(fx, plan));
        const lb = `${method} ${route.template} · ${who.label} · B's handle, A's ids`;
        if (ranReal(lb, real, ghost)) check(`${lb}: same answer as a missing id`, text(routeAnswer(real)) === text(unghost(fx, routeAnswer(ghost))), { real: routeAnswer(real), ghost: routeAnswer(ghost) });
        const leaked = leaks(fx, routeAnswer(real), { sent: [plan, ids] });
        check(`${lb}: no canary of A`, leaked.length === 0, leaked);
      }
      // the member of both stores on A's handle is A's viewer: a key the viewer lacks is refused (403, not 404)
      const key = guardKey(route, method);
      if (key && !can("viewer", key)) {
        const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.A) } : {};
        const r = await callRoute({ userId: fx.dual }, route, method, { store: fx.A.handle, ...ids }, plan, { photo: fx.A.photoBytes });
        check(`${method} ${route.template} · member of A and B · A's handle (A's viewer): 403 without ${key}`, r.ok && r.value!.status === 403, routeAnswer(r));
      }
      const after = await snapshot(fx.A.id);
      check(`${method} ${route.template}: A's rows unchanged by every attempt`, after.hash === before.hash, snapshotDiff(before, after));
      // the role matrix in B's own store: a role without the handler's key is refused before the body (an API
      // answers 403; a dashboard route the neutral 404 of a page), a granted role reaches the body with B's own
      // records (so the refusals above are the code's, not a broken route's)
      for (const role of ROLES) {
        const granted = key === null ? role === "owner" : can(role, key);
        if (key === null && !granted) continue;
        const own = await ownRoutePlan(fx, kit.fresh, method, route.template);
        // a granted member with a fresh step-up (a customer-data export asks for one, §B.7): the body runs
        const r = await callRoute({ userId: fx.B.members[role], ...(granted ? { stepUpAt: new Date() } : {}) }, route, method, { store: fx.B.handle, ...own.ids }, granted ? own.plan : {}, { photo: fx.B.photoBytes });
        const label = `${method} ${route.template} · B ${role} · own store`;
        if (!ranReal(label, r)) continue;
        const status = r.ok ? r.value!.status : 500;
        if (!granted) check(`${label}: refused without ${key}`, route.template.startsWith("/api/app/") ? status === 403 : status === 403 || status === 404, routeAnswer(r));
        else check(`${label}: reaches the handler${key ? ` with ${key}` : ""}`, r.ok && status < 500 && ![401, 403, 404].includes(status), routeAnswer(r));
      }
    }
  }
}

/** B's own records for one route method: the granted roles' positive control (destructive methods get fresh records). */
async function ownRoutePlan(fx: Fixtures, fresh: Fresh, method: string, template: string): Promise<{ ids: Record<string, string>; plan: RoutePlan }> {
  const B = fx.B;
  const key = `${method} ${template}`;
  if (key === "DELETE /api/app/[store]/media") return { ids: {}, plan: { query: { id: await fresh.asset(B), force: "1" } } };
  if (key === "DELETE /api/app/[store]/export/[id]") return { ids: { id: await fresh.exportOf(B) }, plan: {} };
  const plans: Record<string, RoutePlan> = {
    "GET /api/app/[store]/media": { query: { sourceAssetId: B.asset.photo } },
    "POST /api/app/[store]/media": { multipart: true },
    "PATCH /api/app/[store]/media/[id]": { body: { focal: { x: 0.4, y: 0.6 } } },
    "GET /api/app/[store]/export": { query: { pageId: B.page.live, versionId: B.version.live } },
    "POST /api/app/[store]/export": { body: { versionId: B.version.live, mode: "connected", allowedOrigins: ["https://shop.example.org"], options: { hostConfigs: true } } },
    "GET /api/app/[store]/export/estimate": { query: { versionId: B.version.live, mode: "php" } },
    "GET /api/app/[store]/orders/export": { query: { page_id: B.page.live } },
    "POST /api/app/[store]/sheets/connect": { body: { url: `https://docs.google.com/spreadsheets/d/${B.spreadsheetId}/edit#gid=0` } },
    "PATCH /api/app/[store]/sheets/connect": { body: { enabled: true } },
    "GET /app/[store]/preview/[id]": { query: { v: B.version.live } },
  };
  return { ids: template.includes("[id]") ? { id: idFor(fx, template, B) } : {}, plan: plans[key] ?? {} };
}

/* ------------------------------------------------------------------ */
/* pages: the props that reach the client                              */
/* ------------------------------------------------------------------ */

export interface PageFile {
  file: string;
  template: string;
  kind: "page" | "layout";
}

export function derivePages(): PageFile[] {
  return walk(path.join(ROOT, "src", "app", "app", "[store]"), (f) => /[\\/](page|layout)\.tsx$/.test(f)).map((file) => {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const template = `/${rel.replace(/^src\/app\//, "").replace(/\/(page|layout)\.tsx$/, "")}`
      .split("/")
      .filter((seg) => !/^\(.*\)$/.test(seg))
      .join("/");
    return { file: rel, template, kind: rel.endsWith("layout.tsx") ? "layout" : "page" };
  });
}

const CLIENT = new WeakSet<object>();
const clientChecked = new Set<string>();
/** Mark every export of the loaded "use client" modules of src/ (their props are what the RSC payload carries). */
function markClientModules(): void {
  for (const [file, mod] of Object.entries(M._cache)) {
    if (clientChecked.has(file) || !mod) continue;
    clientChecked.add(file);
    if (!file.startsWith(path.join(ROOT, "src")) || !/\.(tsx?|jsx?)$/.test(file)) continue;
    const head = readFileSync(file, "utf8").slice(0, 400);
    if (directiveOf(head) !== "use client") continue;
    for (const v of Object.values((mod.exports as Record<string, unknown>) ?? {})) if (v && (typeof v === "function" || typeof v === "object")) CLIENT.add(v as object);
  }
}

const isElement = (v: unknown): v is { type: unknown; props: Record<string, unknown> } =>
  !!v && typeof v === "object" && typeof (v as { $$typeof?: unknown }).$$typeof === "symbol" && "props" in (v as object);
const isNextControl = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && /^NEXT_/.test((e as { digest: string }).digest);

/**
 * The server-rendered tree with every server component run (async or sync, until a client boundary): the props of
 * client components and the text of host elements, i.e. what the RSC payload would carry to the browser.
 */
export async function renderTree(node: unknown, depth = 0): Promise<unknown> {
  if (depth > 300) return "[too deep]";
  if (node === null || node === undefined || typeof node === "boolean") return null;
  if (typeof node !== "object") return typeof node === "function" ? "[fn]" : node;
  if (node instanceof Promise) return renderTree(await node, depth + 1);
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const n of node) out.push(await renderTree(n, depth + 1));
    return out;
  }
  if (isElement(node)) {
    const { type, props } = node;
    if (typeof type === "function") {
      markClientModules();
      const name = (type as { displayName?: string; name?: string }).displayName ?? type.name ?? "anonymous";
      if (!CLIENT.has(type)) {
        try {
          return await renderTree(await (type as (p: unknown) => unknown)(props), depth + 1);
        } catch (e) {
          if (isNextControl(e)) throw e;
          // a component that needs React's renderer (hooks): its props are what it gets
        }
      }
      return { component: name, props: await renderProps(props, depth) };
    }
    return { element: typeof type === "string" ? type : String((type as { $$typeof?: symbol })?.$$typeof?.toString() ?? typeof type), props: await renderProps(props, depth) };
  }
  if (Object.getPrototypeOf(node) === Object.prototype) return renderProps(node as Record<string, unknown>, depth);
  return node;
}
async function renderProps(props: Record<string, unknown>, depth: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props ?? {})) out[k] = await renderTree(v, depth + 1);
  return out;
}

export type PageResult = { kind: "notFound" } | { kind: "redirect"; to: string } | { kind: "render"; payload: string } | { kind: "error"; message: string; stub: string | null };

export async function renderPage(who: Who, page: PageFile, params: Record<string, string>, searchParams: Record<string, string> = {}, opts: { identityHeaders?: HeadersInit } = {}): Promise<PageResult> {
  const mod = load<{ default: (p: unknown) => unknown; generateMetadata?: (p: unknown, parent: Promise<unknown>) => unknown; metadata?: unknown }>(path.join(ROOT, page.file));
  let urlPath = page.template;
  for (const [k, v] of Object.entries(params)) urlPath = urlPath.replace(`[${k}]`, v);
  const o = await call(
    who,
    urlPath,
    async () => {
      const props = page.kind === "layout" ? { children: null, params: Promise.resolve(params) } : { params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) };
      const body = text(await renderTree(await mod.default(props)));
      // the document's <title> and meta tags too (LND-24: a page or store name in the title is a payload like any other)
      const meta = typeof mod.generateMetadata === "function" ? await mod.generateMetadata(props, Promise.resolve({})) : mod.metadata;
      return meta === undefined ? body : `${body}\n<metadata>${text(meta)}`;
    },
    opts,
  );
  if (o.ok) return { kind: "render", payload: o.value! };
  const digest = (o.error as { digest?: string } | undefined)?.digest ?? "";
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return { kind: "notFound" };
  if (digest.startsWith("NEXT_REDIRECT")) return { kind: "redirect", to: digest.split(";")[2] ?? "" };
  return { kind: "error", message: o.error instanceof Error ? o.error.message.slice(0, 300) : String(o.error), stub: o.stub };
}

/** Search params per page template naming A's records. */
function pageQueries(fx: Fixtures, template: string): Record<string, string>[] {
  const A = fx.A;
  const q: Record<string, Record<string, string>[]> = {
    "/app/[store]/history": [{ page_id: A.page.live }, {}],
    "/app/[store]/pages": [{ focus: A.page.live, q: fx.canaries.data[0]! }, { status: "archived" }],
    // the Orders filter is `page_id` (parseOrderQuery); `page` is the pager
    "/app/[store]/orders": [{ page_id: A.page.live, q: A.customer.name }, { tab: "leads", page_id: A.page.live }, { tab: "blocked" }],
    "/app/[store]/exports": [{ page: A.page.live }],
  };
  return q[template] ?? [{}];
}

/** What A's owner must see on each screen (so a clean scan of B's payload means something). */
function ownerSees(fx: Fixtures, template: string): string | null {
  const t: Record<string, string> = {
    "/app/[store]/orders": fx.canaries.customer[0]!,
    "/app/[store]/pages": fx.canaries.data[0]!,
    "/app/[store]/history": fx.canaries.data.find((c) => c.startsWith("Saved "))!,
    "/app/[store]/media": fx.canaries.data.find((c) => c.startsWith("alt "))!,
    "/app/[store]/exports": fx.canaries.data.find((c) => c.startsWith("shop-"))!,
    "/app/[store]/settings/general": fx.canaries.data.find((c) => c.endsWith(" SARL"))!,
    "/app/[store]/integrations/pixels": fx.canaries.data.find((c) => c.startsWith("Pixel "))!,
  };
  return t[template] ?? null;
}

export async function pageSuite(kit: Kit): Promise<void> {
  const { fx } = kit;
  const { can } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  suite("pages");
  const pages = derivePages();
  check("the page list is derived from the tree", pages.length >= 10, pages.map((p) => p.template));
  for (const page of pages) {
    const source = readFileSync(path.join(ROOT, page.file), "utf8");
    // the page's own keys: `permission: "pages.read"` or `permission: ["pages.write", "ai.use"]` (all required)
    const declared = /permission: (\[[^\]]*\]|"[a-z_.]+")/.exec(source)?.[1] ?? "";
    const perms = [...declared.matchAll(/"([a-z_.]+)"/g)].map((m) => m[1] as StorePermission);
    const perm = perms.join(" + ") || undefined;
    // a layout with no seam call reads no store data (the frame of a route group): it may render, empty of A
    const dataFree = page.kind === "layout" && !/requireStoreMember\(|memberCtx\(/.test(source);
    const name = `${page.template}${page.kind === "layout" ? " (layout)" : ""}`;
    const ids: Record<string, string> = page.template.includes("[id]") ? { id: fx.A.page.live } : {};
    // A's owner: the screen renders and carries A's data (the scan below is not blind)
    const mine = await renderPage({ userId: fx.A.members.owner }, page, { store: fx.A.handle, ...ids });
    const sees = ownerSees(fx, page.template);
    if (ranReal(`${name} · A's owner renders`, mine.kind === "error" ? mine : null)) check(`${name} · A's owner renders`, mine.kind === "render", mine);
    if (sees && mine.kind === "render" && page.kind === "page") check(`${name} · A's owner sees A's data in the payload`, mine.payload.includes(sees), sees);

    for (const who of attackers(fx)) {
      // 1. A's handle: the neutral 404 (the member of both is A's viewer)
      if (who.userId !== fx.dual) {
        const r = await renderPage({ userId: who.userId }, page, { store: fx.A.handle, ...ids });
        if (dataFree) check(`${name} · ${who.label} · A's handle: nothing of A`, r.kind === "notFound" || (r.kind === "render" && leaks(fx, r.payload).length === 0), r);
        else check(`${name} · ${who.label} · A's handle: 404`, r.kind === "notFound", r);
      }
      // 2. B's handle with A's ids: nothing of A in the payload
      if (!who.role) continue;
      for (const sp of pageQueries(fx, page.template)) {
        const r = await renderPage({ userId: who.userId }, page, { store: fx.B.handle, ...ids }, sp);
        const label = `${name}${Object.keys(sp).length ? `?${new URLSearchParams(sp)}` : ""} · ${who.label} · B's handle, A's ids`;
        const granted = perms.every((p) => can(who.role!, p));
        if (!granted) check(`${label}: 404 for a role without ${perm}`, r.kind === "notFound", r.kind);
        else if (r.kind === "render") check(`${label}: no canary of A`, leaks(fx, r.payload, { sent: [sp, ids] }).length === 0, leaks(fx, r.payload, { sent: [sp, ids] }));
        else if (!ranReal(label, r.kind === "error" ? r : null)) continue;
        // A's page id in B's builder: the neutral 404; an agent's dashboard: its own order queue
        else check(`${label}: 404 or a redirect inside B`, (r.kind === "notFound" && page.template.includes("[id]")) || (r.kind === "redirect" && r.to.startsWith(`/app/${fx.B.handle}/`)), r);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* repositories                                                        */
/* ------------------------------------------------------------------ */

/** fn(B's scope, A's ids) vs fn(B's scope, ghosts): the same answer, no canary. */
async function same(fx: Fixtures, label: string, fn: (ids: Fixtures["A"]) => Promise<unknown>, opts: { sent?: unknown } = {}): Promise<void> {
  const ghostA = ghostify(fx, structuredClone({ ...fx.A, photoBytes: undefined })) as unknown as Fixtures["A"];
  const real = await call({ anonymous: true }, "/", () => fn(fx.A));
  const ghost = await call({ anonymous: true }, "/", () => fn(ghostA));
  if (!ranReal(label, real, ghost)) return;
  check(`${label}: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
  const leaked = leaks(fx, answerOf(real), { sent: opts.sent });
  check(`${label}: no canary of A`, leaked.length === 0, leaked);
}

export async function repositorySuite(kit: Kit): Promise<void> {
  const { fx } = kit;
  suite("repositories");
  const B = writeScope(fx.B.id);
  const bActor = userActor(fx.B.members.owner);
  const before = await snapshot(fx.A.id);
  const P = load<typeof import("@/lib/admin-data/pages")>("@/lib/admin-data/pages");
  const O = load<typeof import("@/lib/orders/admin")>("@/lib/orders/admin");
  const AO = load<typeof import("@/lib/admin-data/orders")>("@/lib/admin-data/orders");
  const H = load<typeof import("@/lib/admin-data/history")>("@/lib/admin-data/history");
  const E = load<typeof import("@/lib/admin-data/exports")>("@/lib/admin-data/exports");
  const AS = load<typeof import("@/lib/admin-data/assets")>("@/lib/admin-data/assets");
  const SE = load<typeof import("@/lib/admin-data/search")>("@/lib/admin-data/search");
  const SEC = load<typeof import("@/lib/admin-data/security")>("@/lib/admin-data/security");
  const D = load<typeof import("@/lib/admin-data/dashboard")>("@/lib/admin-data/dashboard");
  const MA = load<typeof import("@/lib/media/assets")>("@/lib/media/assets");
  const ED = load<typeof import("@/lib/editor/pages.server")>("@/lib/editor/pages.server");
  const FA = load<typeof import("@/lib/editor/facts.server")>("@/lib/editor/facts.server");
  const SH = load<typeof import("@/lib/editor/slug-history")>("@/lib/editor/slug-history");
  const PX = load<typeof import("@/lib/pixels/library.server")>("@/lib/pixels/library.server");
  const PU = load<typeof import("@/lib/pixels/usage.server")>("@/lib/pixels/usage.server");
  const PH = load<typeof import("@/lib/pixels/health.server")>("@/lib/pixels/health.server");
  const SC = load<typeof import("@/lib/sheets")>("@/lib/sheets");
  const EX = load<typeof import("@/lib/export/server")>("@/lib/export/server");
  const SA = load<typeof import("@/lib/export/service-account")>("@/lib/export/service-account");
  const INV = load<typeof import("@/lib/tenancy/invites")>("@/lib/tenancy/invites");
  const PT = load<typeof import("@/lib/render/preview-token")>("@/lib/render/preview-token");

  // pages
  await same(fx, "listPages(B, all)", () => P.listPages(B, { status: "all" }));
  await same(fx, "pageOptions(B)", () => P.pageOptions(B, { includeArchived: true }));
  await same(fx, "pageCounts(B)", () => P.pageCounts(B));
  await same(fx, "homePageId(B)", () => P.homePageId(B));
  for (const [name, f] of [
    ["duplicatePage", (a: StoreFx) => P.duplicatePage(B, a.page.live, bActor)],
    ["unpublishPage", (a: StoreFx) => P.unpublishPage(B, a.page.live, bActor)],
    ["archivePage", (a: StoreFx) => P.archivePage(B, a.page.draft, bActor)],
    ["restoreArchivedPage", (a: StoreFx) => P.restoreArchivedPage(B, a.page.archived, bActor)],
    ["deletePage", (a: StoreFx) => P.deletePage(B, a.page.draft, bActor)],
    ["setHomePage", (a: StoreFx) => P.setHomePage(B, a.page.live, bActor)],
  ] as const)
    await same(fx, `${name}(B, A's page)`, f);
  await same(fx, "uniqueSlug(B, A's slug) is B's own namespace", async () => P.uniqueSlug(B, "argan"));
  // builder persistence
  const userB = { id: fx.B.members.owner, name: "Owner B", email: "owner-b@tenancy.test" } as never;
  await same(fx, "currentMeta(B, A's page)", (a) => ED.currentMeta(B, a.page.live));
  await same(fx, "listVersionSummaries(B, A's page)", (a) => ED.listVersionSummaries(B, a.page.live));
  await same(fx, "versionsByIds(B, A's versions)", (a) => ED.versionsByIds(B, [a.version.live, a.version.saved]));
  await same(fx, "versionPreview(B, A's page, A's version)", (a) => ED.versionPreview(B, a.page.live, a.version.live));
  await same(fx, "versionPreview(B, B's page, A's version)", (a) => ED.versionPreview(B, fx.B.page.live, a.version.live));
  await same(fx, "loadBootstrap(B, A's page)", (a) => ED.loadBootstrap({ scope: B, store: fx.rows.B, user: userB, can: () => true }, a.page.live));
  await same(fx, "saveDraft(B, A's page)", async (a) => ED.saveDraft(B, userB, { pageId: a.page.draft, doc: await kit.fresh.doc(fx.B), baseUpdatedAt: 0, force: true }));
  await same(fx, "createVersion(B, A's page)", (a) => ED.createVersion(B, userB, a.page.live, "save", "x"));
  await same(fx, "restoreVersion(B, A's version)", (a) => ED.restoreVersion(B, userB, { pageId: a.page.live, versionId: a.version.saved, baseUpdatedAt: 0 }));
  await same(fx, "restoreVersion(B, B's page, A's version)", (a) => ED.restoreVersion(B, userB, { pageId: fx.B.page.live, versionId: a.version.saved, baseUpdatedAt: 0 }));
  await same(fx, "setVersionStar(B, A's version)", (a) => ED.setVersionStar(B, a.page.live, a.version.saved, true));
  await same(fx, "renameVersion(B, A's version)", (a) => ED.renameVersion(B, a.page.live, a.version.saved, "pwned"));
  await same(fx, "duplicateAsPage(B, A's page)", (a) => ED.duplicateAsPage(B, bActor, { pageId: a.page.live }));
  await same(fx, "updateMeta(B, A's page)", (a) => ED.updateMeta(B, a.page.live, { name: "pwned" }));
  await same(fx, "revertSlug(B, A's page)", (a) => ED.revertSlug(B, a.page.live, "pwned"));
  await same(fx, "slugProblem(B, A's slug)", () => ED.slugProblem(B, "argan", fx.B.page.draft));
  await same(fx, "factsFor(B, A's page)", (a) => FA.factsFor(B, a.page.live));
  await same(fx, "recordSlugMove(B, A's page)", (a) => SH.recordSlugMove(B, a.page.live, "stolen-slug"));
  // versions
  await same(fx, "listVersions(B, A's page)", (a) => H.listVersions(B, { pageId: a.page.live }));
  await same(fx, "versionKindCounts(B, A's page)", (a) => H.versionKindCounts(B, a.page.live));
  await same(fx, "setVersionStarred(B, A's version)", (a) => H.setVersionStarred(B, a.version.saved, true, bActor));
  await same(fx, "duplicateVersionAsPage(B, A's version)", (a) => H.duplicateVersionAsPage(B, a.version.saved, bActor));
  await same(fx, "restoreVersion(history, B, A's version)", (a) => H.restoreVersion(B, a.version.saved, userB, bActor));
  // orders, leads, blocklist
  await same(fx, "listOrders(B)", () => O.listOrders(B, {}));
  await same(fx, "listOrders(B, q = A's customer)", () => O.listOrders(B, { q: fx.A.customer.name }), { sent: fx.A.customer.name });
  await same(fx, "getOrder(B, A's order)", (a) => O.getOrder(B, a.order.main));
  await same(fx, "orderDetailJson(B, A's order)", (a) => AO.orderDetailJson(B, a.order.main));
  await same(fx, "updateOrderStatus(B, A's order)", (a) => O.updateOrderStatus(B, a.order.main, "confirmed", bActor));
  await same(fx, "requeueOrderSync(B, A's order)", (a) => O.requeueOrderSync(B, a.order.failed, bActor));
  await same(fx, "blockFromOrder(B, A's order)", (a) => O.blockFromOrder(B, a.order.main, { phone: true, ip: true }, null, bActor));
  await same(fx, "unblock(B, A's entry)", (a) => O.unblock(B, a.block.phone, bActor));
  await same(fx, "listLeads(B)", () => O.listLeads(B, { abandonedOnly: false }));
  await same(fx, "listBlocklist(B)", () => O.listBlocklist(B));
  await same(fx, "tabCounts(B)", () => AO.tabCounts(B));
  await same(fx, "statusCounts(B)", () => AO.statusCounts(B, AO.parseOrderQuery({}), "Africa/Casablanca"));
  await same(fx, "orderStatsByPage(B)", () => O.orderStatsByPage(B, { from: new Date(0), to: new Date(Date.now() + 86_400_000) }));
  await same(fx, "ordersCsv(B)", () => new Response(O.ordersCsv(B, {})).text());
  await same(fx, "leadsCsv(B)", () => new Response(O.leadsCsv(B, { abandonedOnly: false })).text());
  // B's purge of abandoned leads (A's lead is 40 days old too): only B's own rows go
  const purged = await call({ anonymous: true }, "/", () => O.purgeAbandonedLeads(B, 30));
  check("purgeAbandonedLeads(B, 30) deletes B's old lead only", purged.ok && purged.value === 1 && (await O.listLeads(writeScope(fx.A.id), { abandonedOnly: false })).total === 1, answerOf(purged));
  // media
  await same(fx, "getAsset(B, A's photo)", (a) => MA.getAsset(B, a.asset.photo));
  await same(fx, "getAssetsByIds(B, A's files)", (a) => MA.getAssetsByIds(B, [a.asset.photo, a.asset.cutout]));
  await same(fx, "listAssets(B, source = A's photo)", (a) => MA.listAssets(B, { sourceAssetId: a.asset.photo }));
  await same(fx, "hasDerivedAssets(B, A's photo)", (a) => MA.hasDerivedAssets(B, a.asset.photo));
  await same(fx, "setAssetTags(B, A's photo)", (a) => MA.setAssetTags(B, a.asset.photo, ["pwned"]));
  await same(fx, "deleteAsset(B, A's photo)", (a) => MA.deleteAsset(B, fx.rows.B, a.asset.photo));
  await same(fx, "previewAssetsFor(B, A's photo)", (a) => AS.previewAssetsFor(B, [], [{ id: a.asset.photo, alt: "" }]));
  await same(fx, "countStoreAssets(B, A's photo)", (a) => AS.countStoreAssets(B, [a.asset.photo]));
  await same(fx, "setAssetAlt(B, A's photo)", (a) => AS.setAssetAlt(B, a.asset.photo, "pwned", bActor));
  await same(fx, "livePagesUsing(B, A's photo)", (a) => AS.livePagesUsing(B, a.asset.photo));
  await same(fx, "isStoreLogo(B, A's photo)", (a) => AS.isStoreLogo(B, a.asset.photo));
  await same(fx, "assetUsage(B, A's photo)", (a) => AS.assetUsage(B, a.asset.photo));
  await same(fx, "mediaCounts(B)", () => AS.mediaCounts(B));
  await same(fx, "storeStorage(B)", () => AS.storeStorage(B));
  // exports
  await same(fx, "listExports(B, A's page)", (a) => E.listExports(B, { pageId: a.page.live }));
  await same(fx, "revokeExport(B, A's export)", (a) => E.revokeExport(B, a.export, bActor));
  await same(fx, "getExportContext(B, A's page)", (a) => EX.getExportContext(B, a.page.live, { canEmbedKey: true }));
  await same(fx, "estimateExport(B, A's version)", (a) => EX.estimateExport(B, { versionId: a.version.live, mode: "php", allowedOrigins: [], options: { hostConfigs: true } } as never));
  await same(fx, "buildExport(B, A's version)", (a) => EX.buildExport(B, { versionId: a.version.live, mode: "connected", allowedOrigins: ["https://shop.example.org"], options: { hostConfigs: true } } as never, bActor, { canEmbedKey: true }));
  await same(fx, "revokeExport(export, B, A's export)", (a) => EX.revokeExport(B, a.export, bActor));
  await same(fx, "exportKeyInfo(B)", () => SA.exportKeyInfo(B));
  await same(fx, "storeExportKey(B)", () => SA.storeExportKey(B));
  // pixels
  await same(fx, "getLibrary(B)", () => PX.getLibrary(B));
  await same(fx, "pixelLibraryView(B, tokens)", () => PX.pixelLibraryView(B, { canCreate: true, canSeeTokens: true, fresh: true }));
  await same(fx, "liveTracking(B, A's page)", (a) => PX.liveTracking(B, a.page.live));
  await same(fx, "startPixelTest(B, A's page)", (a) => PX.startPixelTest(B, { pageId: a.page.live, platform: "meta", id: SHARED_PIXEL, minutes: 30 }, bActor));
  await same(fx, "removePixelEntry(B, A's pixel)", (a) => PX.removePixelEntry(B, { platform: "meta", id: a.pixel.own }, bActor));
  await same(fx, "pixelUsageOf(B, A's pixel)", (a) => PU.pixelUsageOf(B, "meta", a.pixel.own));
  await same(fx, "livePagePixels(B)", () => PU.livePagePixels(B));
  await same(fx, "recentPagesWithPixels(B)", () => PU.recentPagesWithPixels(B));
  await same(fx, "getPixelHealth(B)", () => PH.getPixelHealth(B));
  // Sheets
  await same(fx, "getSheetsConfig(B)", () => SC.getSheetsConfig(B));
  await same(fx, "syncHealth(B)", () => SC.syncHealth(B));
  // search, audit, dashboard
  for (const q of [fx.A.customer.name, fx.canaries.data[0]!, fx.A.order.main, "%%", "__", "%a%"]) await same(fx, `searchAdmin(B, "${q.slice(0, 12)}…")`, () => SE.searchAdmin(B, fx.rows.B, q, { pages: true, orders: true }), { sent: q });
  // the tenant reader takes the store ctx (listStoreAudit: audit.read, the ctx's store)
  await same(fx, "auditPage(B)", () => SEC.auditPage({ scope: B, store: fx.rows.B, can: () => true } as never, { limit: 100 }));
  await same(fx, "navCounts(B)", () => D.navCounts(B));
  await same(fx, "getSheetHealth(B)", () => D.getSheetHealth(B));
  await same(fx, "getDashboard(B)", () => D.getDashboard(B, fx.rows.B, { totpEnabled: false }));
  // team (T2's repositories)
  await same(fx, "listMembersByScope(B)", () => INV.listMembersByScope(B));
  await same(fx, "listInvitesByScope(B)", () => INV.listInvitesByScope(B));
  // preview tokens (T3): A's page from B's scope
  const minted = await call({ anonymous: true }, "/", () => PT.mintPreviewToken(B, { pageId: fx.A.page.live, ttlSec: 3600, audience: "seller" }));
  if (ranReal("mintPreviewToken(B, A's page) → not_found", minted)) check("mintPreviewToken(B, A's page) → not_found", !minted.ok && /not_found/.test(text(answerOf(minted))), answerOf(minted));

  const after = await snapshot(fx.A.id);
  check("A's rows unchanged by every repository attempt", after.hash === before.hash, snapshotDiff(before, after));


  // the remaining scoped repositories of src/lib that take an id, a slug or a document, reached from B's scope with
  // A's records (the store-wide ones: nothing of A); A's visit is recorded first, so its counters exist to protect
  {
    const SI = load<typeof import("@/lib/admin-data/store-info")>("@/lib/admin-data/store-info");
    const AR = load<typeof import("@/lib/db/audit-rows")>("@/lib/db/audit-rows");
    const RS = load<typeof import("@/lib/orders/resolve")>("@/lib/orders/resolve");
    const HT = load<typeof import("@/lib/orders/http")>("@/lib/orders/http");
    const UP = load<typeof import("@/lib/orders/upsell")>("@/lib/orders/upsell");
    const TS = load<typeof import("@/lib/orders/turnstile")>("@/lib/orders/turnstile");
    const RC = load<typeof import("@/lib/render/store-context.server")>("@/lib/render/store-context.server");
    const SP = load<typeof import("@/lib/render/store-pages.server")>("@/lib/render/store-pages.server");
    const CF = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
    const SY = load<typeof import("@/lib/sheets/sync")>("@/lib/sheets/sync");
    const ST = load<typeof import("@/lib/stats")>("@/lib/stats");
    const OW = load<typeof import("@/lib/tenancy/owned")>("@/lib/tenancy/owned");
    const MI = load<typeof import("@/lib/media/ids")>("@/lib/media/ids");
    const GU = load<typeof import("@/lib/db/usage")>("@/lib/db/usage");
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    const scopeA = writeScope(fx.A.id);
    const rowB = fx.rows.B;
    await ST.recordEvent(scopeA, fx.A.page.live, { type: "view", vid: "tenancy-check-visitor" } as never, "203.0.113.20");
    const minted = await PT.mintPreviewToken(scopeOf(fx.A.id), { pageId: fx.A.page.live, ttlSec: 3600, audience: "seller" });
    fx.canaries.ids.push(minted.tokenId);
    fx.ghosts.set(minted.tokenId, ghostOf(minted.tokenId));
    const [[draftA]] = (await pool().query("SELECT slug FROM pages WHERE id = ?", [fx.A.page.draft])) as unknown as [[{ slug: string }]];
    const [oldA] = (await pool().query("SELECT slug FROM page_slug_history WHERE store_id = ?", [fx.A.id])) as unknown as [{ slug: string }[]];
    const before2 = await snapshot(fx.A.id);
    // a document of B naming A's two files (a pasted id) beside B's own photo
    const baseB = (await kit.fresh.doc(fx.B)) as unknown as import("@/lib/page/schema").PageDoc;
    const naming = (a: StoreFx) => {
      const d = structuredClone(baseB) as unknown as { product: { images: { id: string }[] } };
      d.product.images = [{ id: fx.B.asset.photo }, { id: a.asset.photo }, { id: a.asset.cutout }];
      return d as unknown as import("@/lib/page/schema").PageDoc;
    };
    await same(fx, "storeInfoFor(B)", () => SI.storeInfoFor(B));
    await same(fx, "selectStoreAuditRows(B)", () => AR.selectStoreAuditRows(B, [], 200));
    await same(fx, "assetsFor(B, a doc naming A's files)", (a) => ED.assetsFor(B, naming(a)), { sent: naming(fx.A) });
    await same(fx, "previewSource(B, A's page, draft)", (a) => ED.previewSource(B, a.page.live, null));
    await same(fx, "previewSource(B, A's page, A's version)", (a) => ED.previewSource(B, a.page.live, a.version.saved));
    await same(fx, "previewSource(B, B's page, A's version)", (a) => ED.previewSource(B, fx.B.page.live, a.version.saved));
    await same(fx, "versionDoc(B, A's version)", (a) => RS.versionDoc(B, a.version.live));
    const siteKeyA = fx.canaries.data.find((c) => c.startsWith("0x4AAAAAAA"))!;
    await same(fx, "versionEmbedsSiteKey(B, A's version, A's site key)", (a) => RS.versionEmbedsSiteKey(B, a.version.live, siteKeyA), { sent: siteKeyA });
    await same(fx, "exportOrigins(B, A's export)", (a) => HT.exportOrigins(B, a.export));
    await same(fx, "acceptUpsell(B, A's order)", (a) => UP.acceptUpsell(B, { orderId: a.order.main, token: "tenancy-check-upsell-token" }, { ip: "203.0.113.9" }));
    await same(fx, "turnstileKeysFor(B)", () => TS.turnstileKeysFor(B));
    await same(fx, "memberRole(B, A's owner)", (a) => PX.memberRole(B, a.members.owner));
    await same(fx, "stopPixelTest(B, A's page, A's pixel)", (a) => PX.stopPixelTest(B, { pageId: a.page.live, platform: "meta", id: a.pixel.own }, bActor));
    await same(fx, "revokePreviewToken(B, A's link)", () => PT.revokePreviewToken(scopeOf(fx.B.id), minted.tokenId), { sent: minted.tokenId });
    // A's owner has no role in B: B's library rule refuses A's pixel for them (never A's grants)
    const rule = await call({ anonymous: true }, "/", () => PX.enforceLibraryRule(B, { metaPixelId: [fx.A.pixel.own] }, userActor(fx.A.members.owner)));
    check("enforceLibraryRule(B, A's pixel, actor = A's owner): refused (no role in B)", !rule.ok && /pixel_not_in_library/.test(text(answerOf(rule))), answerOf(rule));
    // B's owner adds A's pixel id to B's library: B's own blank entry, nothing of A's entry (label, token, tests)
    await PX.ensureInLibrary(B, [{ platform: "meta", id: fx.A.pixel.own }], bActor);
    const entry = (await PX.pixelLibraryView(B, { canCreate: true, canSeeTokens: true, fresh: true })).pixels.find((p) => p.id === fx.A.pixel.own);
    check("ensureInLibrary(B, A's pixel id): B's own blank entry, nothing of A's", !!entry && leaks(fx, entry, { sent: fx.A.pixel.own }).length === 0 && !text(entry).includes("EAAT"), entry);
    // B's entry goes again (the id is one of A's canaries: B's own copy of it would read as a leak in the scans below)
    await PX.removePixelEntry(B, { platform: "meta", id: fx.A.pixel.own }, bActor);
    await same(fx, "hasHealthRow(B)", () => PH.hasHealthRow(B));
    await same(fx, "storeAssetRows(B, A's files)", (a) => RC.storeAssetRows(B, [a.asset.photo, a.asset.cutout]));
    const rcB = await RC.loadStoreRenderContext(B, rowB, { pageId: fx.A.page.live });
    check("loadStoreRenderContext(B, pageId = A's page): nothing of A", leaks(fx, rcB, { sent: fx.A.page.live }).length === 0, leaks(fx, rcB, { sent: fx.A.page.live }));
    const resolved = await RC.storeAssetResolver(B, rcB, naming(fx.A));
    check("storeAssetResolver(B, a doc naming A's files): B's rows only", resolved.rows.every((r) => r.storeId === fx.B.id) && leaks(fx, resolved.rows).length === 0, resolved.rows.map((r) => r.id));
    for (const slug of [fx.A.slug, draftA.slug, ...oldA.map((r) => r.slug)]) {
      const pub = await SP.getPublishedPage(B, rowB, slug);
      check(`getPublishedPage(B, "${slug}"): B's own page or none, nothing of A`, leaks(fx, pub, { sent: slug }).length === 0, leaks(fx, pub, { sent: slug }));
      const moved = await SP.slugHistoryTarget(B, rowB, slug);
      check(`slugHistoryTarget(B, "${slug}"): never a page of A`, oldA.some((r) => r.slug === slug) ? moved === null : leaks(fx, moved).length === 0, moved);
    }
    const storeWide: [string, () => Promise<unknown>][] = [
      ["getStoreHomePage(B)", () => SP.getStoreHomePage(B, rowB)],
      ["listSitemapPages(B)", () => SP.listSitemapPages(B, rowB)],
      ["storeHasPublishedPage(B)", () => SP.storeHasPublishedPage(B, rowB)],
      ["getStoreLegalDocument(B, privacy, ?p = A's slug)", () => SP.getStoreLegalDocument(B, rowB, "privacy", draftA.slug)],
      ["activeSheet(B)", () => CF.activeSheet(B)],
      ["pendingProof(B)", () => CF.pendingProof(B)],
      ["selectSyncBatch(B)", () => SY.selectSyncBatch(B, {})],
      ["getPageStats(B)", () => ST.getPageStats(B, { from: "2026-01-01", to: "2027-12-31" })],
    ];
    for (const [label, fn] of storeWide) {
      const o = await call({ anonymous: true }, "/", fn);
      if (ranReal(label, o)) check(`${label}: nothing of A`, o.ok && leaks(fx, o.value).length === 0, o.ok ? leaks(fx, o.value) : answerOf(o));
    }
    await same(fx, "getPageStats(B, pageIds = A's page)", (a) => ST.getPageStats(B, { from: "2026-01-01", to: "2027-12-31" }, { pageIds: [a.page.live] }));
    await same(fx, "pushOrderStatus(B, A's order)", (a) => SY.pushOrderStatus(B, a.order.main, "confirmed"));
    for (const [kind, pick] of [
      ["page", (a: StoreFx) => a.page.live],
      ["version", (a: StoreFx) => a.version.saved],
      ["asset", (a: StoreFx) => a.asset.photo],
      ["export", (a: StoreFx) => a.export],
      ["pixel", (a: StoreFx) => a.pixel.own],
    ] as const)
      await same(fx, `assertOwned(B, ${kind}, A's)`, (a) => OW.assertOwned(B, kind, [pick(a)]));
    check("mediaAssetId: A's bytes get another id in B (per-store ids, MED-01)", MI.mediaAssetId(B, fx.A.photoBytes) !== MI.mediaAssetId(scopeA, fx.A.photoBytes));
    // writes keyed by A's page or slug from B's scope: A's counters, visitor markers and slug history stay
    await same(fx, "deletePageStats(B, A's page)", (a) => ST.deletePageStats(B, a.page.live));
    await same(fx, "countSlugHit(B, A's old slug)", () => SP.countSlugHit(B, oldA[0]!.slug));
    await same(fx, "releaseOldSlug(B, A's old slug)", () => SH.releaseOldSlug(B, oldA[0]!.slug));
    await same(fx, "recomputeStoreGauges(B)", () => GU.recomputeStoreGauges(B).then(() => null));
    const after2 = await snapshot(fx.A.id);
    check("A's rows (stats, visitor markers, slug history, preview link) unchanged by the repositories above", after2.hash === before2.hash, snapshotDiff(before2, after2));
  }

  // impersonation scope of A (D70): the customer fields are masked in every read
  const imp = scopeOf(fx.A.id, "impersonation");
  const masked = async (label: string, fn: () => Promise<unknown>) => {
    const o = await call({ anonymous: true }, "/", fn);
    if (!ranReal(label, o)) return;
    check(`${label}: no customer canary under impersonation`, o.ok && leaks(fx, o.value, { only: ["customer"] }).length === 0, o.ok ? leaks(fx, o.value, { only: ["customer"] }) : answerOf(o));
  };
  await masked("listOrders(A, impersonation)", () => O.listOrders(imp, {}));
  await masked("getOrder(A, impersonation)", () => O.getOrder(imp, fx.A.order.main));
  await masked("orderDetailJson(A, impersonation)", () => AO.orderDetailJson(imp, fx.A.order.main));
  await masked("listLeads(A, impersonation)", () => O.listLeads(imp, { abandonedOnly: false }));
  await masked("listBlocklist(A, impersonation)", () => O.listBlocklist(imp));
  await masked("searchAdmin(A, impersonation)", () => SE.searchAdmin(imp, fx.rows.A, "Salma", { pages: true, orders: true }));
  await masked("ordersCsv(A, impersonation)", () => new Response(O.ordersCsv(imp, {})).text());
  await masked("leadsCsv(A, impersonation)", () => new Response(O.leadsCsv(imp, { abandonedOnly: false })).text());
  await masked("getDashboard(A, impersonation)", () => D.getDashboard(imp, fx.rows.A, { totpEnabled: false }));
  const masks = await call({ anonymous: true }, "/", () => O.listOrders(imp, { q: fx.A.customer.name }));
  check("listOrders(A, impersonation, q = the customer's name) finds nothing (masked fields are not searchable)", masks.ok && (masks.value as { total: number }).total === 0, answerOf(masks));
  // the console's page rows (SEC-18): name and seoTitle of the store's own pages only
  const consoleRows = await call({ anonymous: true }, "/", () => P.listPagesForConsole(scopeOf(fx.A.id, "platform")));
  check(
    "listPagesForConsole(A's platform scope): A's pages with name and seoTitle",
    consoleRows.ok && (consoleRows.value as { id: string; name: string; seoTitle: string | null }[]).some((r) => r.id === fx.A.page.live && r.name.length > 0 && !!r.seoTitle),
    answerOf(consoleRows),
  );
  const consoleB = await call({ anonymous: true }, "/", () => P.listPagesForConsole(scopeOf(fx.B.id, "platform")));
  check("listPagesForConsole(B's platform scope): nothing of A", consoleB.ok && leaks(fx, consoleB.value).length === 0, leaks(fx, consoleB.value));
}

/* ------------------------------------------------------------------ */
/* special cases (TENANCY-MAP §10.2, §F.1)                             */
/* ------------------------------------------------------------------ */

export async function specialSuite(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  suite("special cases");
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq, and } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const A = writeScope(fx.A.id);
  const B = writeScope(fx.B.id);
  const routes = deriveRoutes();
  const route = (t: string) => routes.find((r) => r.template === t)!;
  const ownerB = { userId: fx.B.members.owner };

  // same slug in both stores: each store's own namespace
  const ED = load<typeof import("@/lib/editor/pages.server")>("@/lib/editor/pages.server");
  check("same slug: A and B both have a page at /argan", (await db.select({ id: S.pages.id }).from(S.pages).where(eq(S.pages.slug, "argan"))).length === 2);
  check("same slug: /argan in B is taken by B's own page only", (await ED.slugProblem(B, "argan", fx.B.page.draft))?.code === "slug_taken");
  const aOnlySlug = (await db.select({ slug: S.pages.slug }).from(S.pages).where(eq(S.pages.id, fx.A.page.draft)))[0]!.slug;
  check("same slug: a slug only A uses is free in B", (await ED.slugProblem(B, aOnlySlug, fx.B.page.draft)) === null);

  // same pixel id in both stores, each with its own token (PIX-01)
  const before = network.length;
  const send = await call(ownerB, appPath(fx.B.handle, "/integrations/pixels"), () => actionFn({ file: PIXELS.file, name: "sendPixelTestAction" })({ platform: "meta", id: SHARED_PIXEL, token: "", testCode: "TEST1234" }));
  check("same pixel id: B's test event never uses A's token (B has none: refused)", refusal(send) === "invalid" && !text(network.slice(before)).includes("EAAT"), answerOf(send));
  const PX = load<typeof import("@/lib/pixels/library.server")>("@/lib/pixels/library.server");
  const viewB = await PX.pixelLibraryView(B, { canCreate: true, canSeeTokens: true, fresh: true });
  const sharedB = viewB.pixels.find((p) => p.id === SHARED_PIXEL);
  check("same pixel id: B's library entry for the shared id is B's (B's label, no server token of A)", !!sharedB && !leaks(fx, sharedB).length && !text(sharedB).includes("EAAT"), sharedB);

  // a sheet listing A's order ids, pulled for B: 0 of A's orders change (SHT-05); B's sheet is connected again first
  // (the routes suite disconnected it as B's owner and admin)
  const { saveSheetsConfig } = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
  await saveSheetsConfig(B, { spreadsheetId: fx.B.spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true }, { id: fx.B.members.owner, ip: null });
  fakeSheets.set(fx.B.spreadsheetId, [
    [fx.A.order.main, "", "delivered"],
    [fx.A.order.failed, "", "returned"],
  ]);
  const SC = load<typeof import("@/lib/sheets")>("@/lib/sheets");
  const snapA = await snapshot(fx.A.id);
  const pull = await call(ownerB, "/", () => SC.pullStatuses(B, { force: true }));
  check("sheet with A's order ids pulled for B: read, 0 updated", pull.ok && (pull.value as { updated: number; seen: number }).updated === 0 && (pull.value as { seen: number }).seen === 2, answerOf(pull));
  const push = await call(ownerB, "/", () => SC.syncPendingOrders(B, { force: true }));
  const appended = network.filter((n) => n.url.includes("sheets.googleapis.com") && n.method !== "GET");
  check("B's sync writes only to B's spreadsheet, never an order of A", push.ok && appended.every((n) => n.url.includes(fx.B.spreadsheetId) && !n.body.includes(fx.A.order.main) && !n.body.includes(fx.A.customer.name)), appended.map((n) => n.url));
  check("A's orders unchanged by B's pull and push", (await snapshot(fx.A.id)).hash === snapA.hash);
  fakeSheets.set(fx.B.spreadsheetId, []);

  // the cron tick (T4's per-store loop): each store's queued orders reach its own sheet only (SHT-02, SHT-11)
  const queuedA = await fresh.order(fx.A, "pending");
  const queuedB = await fresh.order(fx.B, "pending");
  const netCron = network.length;
  const tick = await callRoute({ anonymous: true }, route("/api/cron/tick"), "GET", {}, {}, { headers: { "x-cron-key": process.env.CRON_KEY! } });
  const writes = network.slice(netCron).filter((n) => n.url.includes("sheets.googleapis.com") && n.method !== "GET");
  const toA = writes.filter((n) => n.url.includes(fx.A.spreadsheetId));
  const toB = writes.filter((n) => n.url.includes(fx.B.spreadsheetId));
  if (ranReal("cron tick: each store's orders reach its own sheet", tick)) {
    check("cron tick with the key: 200", tick.ok && tick.value!.status === 200, routeAnswer(tick));
    check("cron tick: A's queued order went to A's sheet, B's to B's", text(toA).includes(queuedA) && text(toB).includes(queuedB), { toA: toA.length, toB: toB.length });
    check("cron tick: no order of one store in the other's sheet", !text(toA).includes(queuedB) && !text(toB).includes(queuedA) && !text(toB).includes(fx.A.customer.name), { toA: toA.map((n) => n.url), toB: toB.map((n) => n.url) });
    check("cron tick: no write to any other spreadsheet", writes.every((n) => n.url.includes(fx.A.spreadsheetId) || n.url.includes(fx.B.spreadsheetId)), writes.map((n) => n.url));
  }

  // B connecting A's spreadsheet: a proof code, nothing about the sheet, A untouched
  const connect = await callRoute(armed(fx.B.members.owner), route("/api/app/[store]/sheets/connect"), "POST", { store: fx.B.handle }, { body: { url: `https://docs.google.com/spreadsheets/d/${fx.A.spreadsheetId}/edit` } });
  check("B pasting A's sheet link gets a proof code, not a connection", connect.ok && connect.value!.status === 200 && /"proof"/.test(connect.value!.body), routeAnswer(connect));
  const verify = await callRoute(armed(fx.B.members.owner), route("/api/app/[store]/sheets/verify"), "POST", { store: fx.B.handle }, {});
  check("B verifying without the code in the sheet: refused", verify.ok && verify.value!.status === 409, routeAnswer(verify));
  const sheetsB = await SC.getSheetsConfig(B);
  check("B's connected sheet is still B's own", sheetsB?.spreadsheetId === fx.B.spreadsheetId, sheetsB);

  // blocklist isolation: B blocking A's customer stores B's own row; A's list is A's
  const O = load<typeof import("@/lib/orders/admin")>("@/lib/orders/admin");
  const nA = (await O.listBlocklist(A)).total;
  const blocked = await O.blockPhone(B, fx.A.customer.phone, "MA", "attack", userActor(fx.B.members.owner));
  check("blocklist: B's block of the same phone is B's row", blocked.ok && (await O.listBlocklist(A)).total === nA);

  // identical image in both stores, A's sourceAssetId, a client-sent x-sg-path (SEC-3)
  const up = await callRoute(ownerB, route("/api/app/[store]/media"), "POST", { store: fx.B.handle }, { multipart: true, body: { cutout: "1", sourceAssetId: fx.A.asset.photo } }, { photo: fx.A.photoBytes, headers: { "x-sg-path": `/app/${fx.A.handle}/media` } });
  const upBody = up.ok ? (JSON.parse(up.value!.body) as { ok?: boolean; deduped?: boolean; asset?: { id: string } }) : null;
  if (ranReal("identical image uploaded in B", up)) {
    check("identical image uploaded in B: a new asset of B, not deduped onto A's", up.ok && up.value!.status === 201 && upBody?.deduped === false && !!upBody.asset && upBody.asset.id !== fx.A.asset.photo, routeAnswer(up));
    const [row] = upBody?.asset ? await db.select({ storeId: S.assets.storeId, source: S.assets.sourceAssetId }).from(S.assets).where(eq(S.assets.id, upBody.asset.id)) : [];
    check("the upload belongs to B (the client-sent x-sg-path is ignored)", row?.storeId === fx.B.id, row);
    check("A's photo as sourceAssetId is dropped", row !== undefined && row.source === null, row);
  }

  // a document naming A's asset: saved (it's B's draft), never resolved from A (bootstrap, preview, export)
  const pageB = await fresh.page(fx.B);
  const docWithA = await fresh.doc(fx.B, { assetId: fx.A.asset.photo });
  const save = await call(ownerB, appPath(fx.B.handle, "/pages"), () => actionFn({ file: EDITOR.file, name: "saveDraft" })({ pageId: pageB, doc: docWithA, baseUpdatedAt: 0, force: true }));
  check("a doc naming A's asset saves into B's page", refusal(save) === null, answerOf(save));
  const boot = await call(ownerB, appPath(fx.B.handle, "/pages"), () => actionFn({ file: EDITOR.file, name: "loadPage" })({ pageId: pageB }));
  check("…its bootstrap carries nothing of A's asset", refusal(boot) === null && !text((boot.value as { boot?: { assets?: unknown } }).boot?.assets ?? {}).includes(fx.A.asset.photo), answerOf(boot));
  const preview = await callRoute(ownerB, route("/app/[store]/preview/[id]"), "GET", { store: fx.B.handle, id: pageB }, {});
  check("…its preview never shows A's file", preview.ok && !leaks(fx, preview.value!.body, { sent: docWithA }).length && !preview.value!.body.includes(fx.canaries.ids.find((k) => k.startsWith(fx.A.asset.photo) && k !== fx.A.asset.photo) ?? "\u0000"), routeAnswer(preview));
  const ver = await fresh.version(fx.B, pageB);
  await db.update(S.pageVersions).set({ doc: docWithA as never }).where(eq(S.pageVersions.id, ver));
  const est = await callRoute(ownerB, route("/api/app/[store]/export/estimate"), "GET", { store: fx.B.handle }, { query: { versionId: ver, mode: "php" } });
  check("…its export estimate counts nothing of A", est.ok && leaks(fx, est.value!.body, { sent: docWithA }).length === 0, routeAnswer(est));
  // …and its export ZIP (the files themselves): no entry named after A's ids, no text naming A's data, no file of A's bytes
  const builtZip = await call(ownerB, appPath(fx.B.handle, "/exports"), async () => {
    const EX = load<typeof import("@/lib/export/server")>("@/lib/export/server");
    const built = await EX.buildExport(B, { versionId: ver, mode: "php", allowedOrigins: [], options: { hostConfigs: true } } as never, userActor(fx.B.members.owner), { canEmbedKey: false });
    return new Uint8Array(await new Response(built.stream).arrayBuffer());
  });
  if (ranReal("…its export ZIP", builtZip)) {
    check("…its export ZIP builds", builtZip.ok, answerOf(builtZip));
    if (builtZip.ok) {
      const { unzipSync, strFromU8 } = load<typeof import("fflate")>("fflate");
      const entries = unzipSync(builtZip.value!);
      const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const [chunks] = (await pool().query("SELECT f.`key` AS k, c.data AS d FROM media_files f JOIN media_chunks c ON c.`key` = f.`key` WHERE f.store_id = ? ORDER BY f.`key`, c.idx", [fx.A.id])) as unknown as [{ k: string; d: Buffer }[]];
      const filesA = new Map<string, Buffer[]>();
      for (const c of chunks) filesA.set(c.k, [...(filesA.get(c.k) ?? []), c.d]);
      const hashesA = new Set([...filesA.values()].map((parts) => createHash("sha256").update(Buffer.concat(parts)).digest("hex")));
      const names = Object.keys(entries);
      const textual = names.filter((n) => /\.(html?|php|js|mjs|css|json|txt|md|htaccess|xml|webmanifest)$|(^|\/)\.[a-z]+$/i.test(n));
      const leakedText = textual.flatMap((n) => leaks(fx, strFromU8(entries[n]!), { sent: docWithA }).map((l) => `${n}: ${l}`));
      const sameBytes = names.filter((n) => hashesA.has(createHash("sha256").update(entries[n]!).digest("hex")));
      check("…its export ZIP: no entry named after A's ids", names.every((n) => leaks(fx, n, { only: ["ids"] }).length === 0), names);
      check("…its export ZIP: no text naming A's data", hashesA.size > 0 && textual.length > 0 && leakedText.length === 0, leakedText.slice(0, 5));
      check("…its export ZIP: no file with the bytes of one of A's files", sameBytes.length === 0, sameBytes);
    }
  }
  // that page goes again: B's own document names A's ids, which later scans of B's screens would read as leaks
  const PG = load<typeof import("@/lib/admin-data/pages")>("@/lib/admin-data/pages");
  check("…then B deletes that page (its versions with it)", await PG.deletePage(B, pageB, userActor(fx.B.members.owner)));

  // caches: A's change never shows in B (settings, store row, pixel usage)
  const SETTINGS_MOD = load<typeof import("@/lib/settings")>("@/lib/settings");
  const storeB0 = await SETTINGS_MOD.getStoreSetting(B, "store");
  await call({ userId: fx.A.members.owner }, appPath(fx.A.handle, "/settings/general"), () => actionFn({ file: SETTINGS.file, name: "saveStoreAction" })({ storeName: "Atlas Argan", legalName: "Atlas Renamed SARL", country: "MA", socials: {} }));
  const storeB1 = await SETTINGS_MOD.getStoreSetting(B, "store");
  check("settings cache: A's new legal name never reads in B", text(storeB1) === text(storeB0) && !text(storeB1).includes("Atlas Renamed"), storeB1);
  const PU = load<typeof import("@/lib/pixels/usage.server")>("@/lib/pixels/usage.server");
  const usageB0 = text(await PU.pixelUsage(B));
  await PU.pixelUsage(A, { fresh: true });
  check("pixel usage cache: per store", text(await PU.pixelUsage(B)) === usageB0 && !usageB0.includes(fx.A.page.live));

  // x-sg-path tampering: the production path of the seam (session cookie + signed path, no identity)
  const { stampRequestPath } = load<typeof import("@/lib/edge/path-sig")>("@/lib/edge/path-sig");
  const { SESSION_COOKIE } = load<typeof import("@/lib/auth/config")>("@/lib/auth/config");
  const getOrder = actionFn({ file: ORDERS.file, name: "getOrderAction" });
  const signed = (p: string) => {
    const h = platformHeaders({ cookie: `${SESSION_COOKIE}=${fx.B.ownerToken}` });
    stampRequestPath(h, p);
    return h;
  };
  const okB = await call({ anonymous: true }, "", () => getOrder(fx.B.order.main), { raw: true, headers: signed(`/app/${fx.B.handle}/orders`) });
  check("signed path of B + B's session: B's order", refusal(okB) === null, answerOf(okB));
  const tampered = signed(`/app/${fx.B.handle}/orders`);
  tampered.set("x-sg-path", `/app/${fx.A.handle}/orders`);
  const t1 = await call({ anonymous: true }, "", () => getOrder(fx.A.order.main), { raw: true, headers: tampered });
  check("x-sg-path changed to A's after signing: not_found", refusal(t1) === "not_found", answerOf(t1));
  const unsigned = platformHeaders({ cookie: `${SESSION_COOKIE}=${fx.B.ownerToken}`, "x-sg-path": `/app/${fx.B.handle}/orders` });
  const t2 = await call({ anonymous: true }, "", () => getOrder(fx.B.order.main), { raw: true, headers: unsigned });
  check("an unsigned x-sg-path: not_found", refusal(t2) === "not_found", answerOf(t2));
  const t3 = await call({ anonymous: true }, "", () => getOrder(fx.A.order.main), { raw: true, headers: signed(`/app/${fx.A.handle}/orders`) });
  check("a correctly signed path of A with B's session: not_found", refusal(t3) === "not_found", answerOf(t3));

  // a store-host action: only the platform host class serves the dashboard
  const ownerA = { userId: fx.A.members.owner };
  const hostOk = await call(ownerA, appPath(fx.A.handle, "/orders"), () => getOrder(fx.A.order.main), { identityHeaders: Object.fromEntries(platformHeaders()) });
  // the same post from a store host's own page: T2's seam refuses its Origin first (CRIT2-11, §C.9: only the platform
  // and console hosts may post a dashboard action), for A's handle exactly as for an unknown one
  const storeHost = (handle: string) => ({ host: `${handle}.shop.example`, origin: `https://${handle}.shop.example`, "sec-fetch-site": "same-origin" });
  const hostBad = await call(ownerA, appPath(fx.A.handle, "/orders"), () => getOrder(fx.A.order.main), { identityHeaders: storeHost(fx.A.handle) });
  const hostGhost = await call(ownerA, appPath(fx.ghostHandle, "/orders"), () => getOrder(fx.A.order.main), { identityHeaders: storeHost(fx.ghostHandle) });
  check("A's owner on the platform host: the order", refusal(hostOk) === null, answerOf(hostOk));
  check("A's owner posting the same action from a store host: refused (forbidden)", refusal(hostBad) === "forbidden", answerOf(hostBad));
  check("…the same answer as an unknown handle there, no canary", text(answerOf(hostBad)) === text(answerOf(hostGhost)) && leaks(fx, answerOf(hostBad)).length === 0, { bad: answerOf(hostBad), ghost: answerOf(hostGhost) });

  // the export allow-list never names the platform itself or a sibling (SEC-23)
  const { parseExportRequest } = load<typeof import("@/lib/export/options")>("@/lib/export/options");
  for (const origin of [PLATFORM, "https://localhost:3451", PLATFORM_HOST]) {
    const r = parseExportRequest({ versionId: fx.B.version.live, mode: "connected", allowedOrigins: [origin], options: { hostConfigs: true } });
    check(`export allow-list: the platform's own ${origin} is refused`, !r.ok && /platform's own address/.test(r.errors.allowedOrigins ?? ""), r);
  }
  const shop = parseExportRequest({ versionId: fx.B.version.live, mode: "connected", allowedOrigins: ["https://shop.example.org"], options: { hostConfigs: true } });
  check("export allow-list: the seller's own domain is accepted", shop.ok, shop);
  // the routes take the same parser: B's export naming the platform host is a field error, nothing is built
  const exportRoute = await callRoute(ownerB, route("/api/app/[store]/export"), "POST", { store: fx.B.handle }, { body: { versionId: fx.B.version.live, mode: "connected", allowedOrigins: [PLATFORM], options: { hostConfigs: true } } });
  check("POST /api/app/<B>/export allow-listing the platform: 422, no export row", exportRoute.ok && exportRoute.value!.status === 422, routeAnswer(exportRoute));

  // team (T2): another store's invite id, invite tokens
  const INV = load<typeof import("@/lib/tenancy/invites")>("@/lib/tenancy/invites");
  const ctxB = await call(ownerB, appPath(fx.B.handle, "/team"), async () => {
    const { requireStoreMember } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
    return requireStoreMember({ handle: fx.B.handle, permission: "members.manage", throwOnFail: true });
  });
  if (ctxB.ok) {
    const rev = await call(ownerB, appPath(fx.B.handle, "/team"), () => INV.revokeInvite(ctxB.value!, fx.A.invite));
    if (ranReal("revokeInvite(B, A's invite) → not found", rev)) {
      const [inv] = await db.select({ revoked: S.storeInvites.revokedAt }).from(S.storeInvites).where(and(eq(S.storeInvites.id, fx.A.invite), eq(S.storeInvites.storeId, fx.A.id)));
      check("revokeInvite(B, A's invite): refused, A's invite still open", !rev.ok && inv?.revoked === null, answerOf(rev));
    }
    const list = await call(ownerB, appPath(fx.B.handle, "/team"), () => INV.listInvites(ctxB.value!));
    if (ranReal("listInvites(B): nothing of A", list)) check("listInvites(B): nothing of A", list.ok && leaks(fx, list.value).length === 0, leaks(fx, list.value));
  }
  const preview2 = await call({ anonymous: true }, "/", () => INV.previewInvite("SG-NOTATOKEN0000"));
  if (ranReal("previewInvite(unknown token) → null", preview2)) check("previewInvite(unknown token) → null (no enumeration)", preview2.ok && preview2.value === null, answerOf(preview2));
}

/**
 * The rest of the §F.1 / TENANCY-MAP §10.2 special cases, all through real code: a document naming A's files at
 * publish, the render of one slug in two stores (and a scope / store pair that disagree: the render cache never files
 * one store's page under the other's key), preview tokens forged with A's page (SEC-7), a client-sent x-sg-path on a
 * public route (SEC-3), a suspended store's page key, invites (reuse, expiry, escalation, 10 parallel accepts:
 * SEC-24), parallel uploads (the quota race), the daily sandbox ceiling and a pending store at the shared disk budget
 * (D69). The cases of the spec with no code in R1.0 are listed as not applicable, with their reason.
 */
export async function moreSpecialCases(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  suite("special cases");
  const { db, pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const PUB = load<typeof import("@/lib/render/publish.server")>("@/lib/render/publish.server");
  const SP = load<typeof import("@/lib/render/store-pages.server")>("@/lib/render/store-pages.server");
  const TP = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const A = writeScope(fx.A.id);
  const B = writeScope(fx.B.id);
  const ownerA = { userId: fx.A.members.owner };
  const ownerB = { userId: fx.B.members.owner };
  const routes = deriveRoutes();
  const route = (t: string) => routes.find((r) => r.template === t)!;
  const tagOf = (store: StoreFx) => /Zk([A-Z]{6})$/.exec(store.customer.name)![1]!;
  const register = (id: string) => {
    if (!fx.canaries.ids.includes(id)) fx.canaries.ids.push(id);
    if (!fx.ghosts.has(id)) fx.ghosts.set(id, ghostOf(id));
  };

  // 1. publish: A's /argan and B's /argan (each its own seeded document), then a page of B whose document names A's
  // two files beside B's own photo (a pasted id): the publish resolves B's own files only
  const seededDraft = async (store: StoreFx) => {
    const [v] = await db.select({ doc: S.pageVersions.doc }).from(S.pageVersions).where(eq(S.pageVersions.id, store.version.live));
    await db.update(S.pages).set({ draft: v!.doc as never }).where(eq(S.pages.id, store.page.live));
  };
  await seededDraft(fx.A);
  await seededDraft(fx.B);
  const pubA = await call(ownerA, appPath(fx.A.handle, "/pages"), () => PUB.publishPage(A, fx.A.page.live, { actor: userActor(fx.A.members.owner) }));
  check("A publishes /argan (the real render)", pubA.ok, answerOf(pubA));
  if (pubA.ok) register(pubA.value!.versionId);
  const pubB = await call(ownerB, appPath(fx.B.handle, "/pages"), () => PUB.publishPage(B, fx.B.page.live, { actor: userActor(fx.B.members.owner) }));
  check("B publishes /argan (the same slug)", pubB.ok, answerOf(pubB));
  const naming = await fresh.page(fx.B);
  const docB = (await fresh.doc(fx.B)) as unknown as { product: { images: { id: string }[] } };
  docB.product.images = [{ id: fx.B.asset.photo }, { id: fx.A.asset.photo }, { id: fx.A.asset.cutout }];
  await db.update(S.pages).set({ draft: docB as never }).where(eq(S.pages.id, naming));
  const pubN = await call(ownerB, appPath(fx.B.handle, "/pages"), () => PUB.publishPage(B, naming, { actor: userActor(fx.B.members.owner) }));
  check("B publishes a page whose document names A's files", pubN.ok, answerOf(pubN));
  if (pubN.ok) {
    const [ver] = await db.select({ html: S.pageVersions.html, ty: S.pageVersions.thankYouHtml }).from(S.pageVersions).where(eq(S.pageVersions.id, pubN.value!.versionId));
    const leaked = leaks(fx, [ver?.html, ver?.ty]);
    check("…its published HTML (landing and thank-you) names nothing of A: not A's files, not A's data", !!ver?.html && leaked.length === 0, leaked);
  }
  // that page goes again (B's own document names A's ids: the scans below would read B's own strings as leaks)
  const P = load<typeof import("@/lib/admin-data/pages")>("@/lib/admin-data/pages");
  check("…then B deletes that page (its versions with it)", await P.deletePage(B, naming, userActor(fx.B.members.owner)));

  // 2. a scope and a store row that disagree are refused before the render cache is read or filled
  const rowB = (await TP.resolveStoreByHandle(fx.B.handle))!;
  const crossed = await call({ anonymous: true }, "/", () => SP.getPublishedPage(A, rowB, fx.A.slug));
  check("getPublishedPage(A's scope, B's row): refused (one store's page is never filed under the other's cache key)", !crossed.ok, answerOf(crossed));
  for (const [label, fn] of [
    ["getStoreHomePage", () => SP.getStoreHomePage(A, rowB)],
    ["listSitemapPages", () => SP.listSitemapPages(A, rowB)],
    ["storeHasPublishedPage", () => SP.storeHasPublishedPage(A, rowB)],
    ["slugHistoryTarget", () => SP.slugHistoryTarget(A, rowB, "before-x")],
    ["getStoreLegalDocument", () => SP.getStoreLegalDocument(A, rowB, "privacy", fx.A.slug)],
  ] as const) {
    const r = await call({ anonymous: true }, "/", fn as () => Promise<unknown>);
    check(`${label}(A's scope, B's row): refused`, !r.ok, answerOf(r));
  }

  // 3. the render of one slug in two stores: each address serves its own store's page
  const slugRoute = route("/s/[store]/[slug]");
  const liveA = await callRoute({ anonymous: true }, slugRoute, "GET", { store: fx.A.handle, slug: fx.A.slug }, {});
  const liveB = await callRoute({ anonymous: true }, slugRoute, "GET", { store: fx.B.handle, slug: fx.B.slug }, {});
  check("render: /s/<A>/argan serves A's page (A's product name)", liveA.ok && liveA.value!.status === 200 && liveA.value!.body.includes(`Argan ${tagOf(fx.A)}`), routeAnswer(liveA));
  check("render: /s/<B>/argan serves B's page (B's product name)", liveB.ok && liveB.value!.status === 200 && liveB.value!.body.includes(`Argan ${tagOf(fx.B)}`), routeAnswer(liveB));
  check("render: /s/<B>/argan carries nothing of A (same slug, the render cache per store)", liveB.ok && leaks(fx, liveB.value!.body).length === 0, liveB.ok ? leaks(fx, liveB.value!.body) : answerOf(liveB));
  // a client-sent x-sg-path on a public route is ignored (SEC-3): the same answer as without it
  const tampered = await callRoute({ anonymous: true }, slugRoute, "GET", { store: fx.B.handle, slug: fx.B.slug }, {}, { headers: { "x-sg-path": `/app/${fx.A.handle}/orders` } });
  check("a client-sent x-sg-path naming A on B's public page: ignored (the same answer)", text(routeAnswer(tampered)) === text(routeAnswer(liveB)), { tampered: text(routeAnswer(tampered)).slice(0, 200), plain: text(routeAnswer(liveB)).slice(0, 200) });

  // 4. preview tokens (SEC-7): B's genuine link works; the same envelope naming A's page, or A's store, is the 404
  const PT = load<typeof import("@/lib/render/preview-token")>("@/lib/render/preview-token");
  const { seal, open } = load<typeof import("@/lib/security/crypto")>("@/lib/security/crypto");
  const mintedB = await PT.mintPreviewToken(scopeOf(fx.B.id), { pageId: fx.B.page.live, ttlSec: 3600, audience: "seller", actor: userActor(fx.B.members.owner) });
  const tokenB = mintedB.url.split("/preview/")[1]!;
  const payload = JSON.parse(open(tokenB, "platform", "preview:v1")) as Record<string, unknown>;
  const previewRoute = route("/preview/[token]");
  const genuine = await callRoute({ anonymous: true }, previewRoute, "GET", { token: tokenB }, {});
  check("preview: B's genuine link renders B's page", genuine.ok && genuine.value!.status === 200, routeAnswer(genuine));
  const unknown = await callRoute({ anonymous: true }, previewRoute, "GET", { token: "not-a-preview-token" }, {});
  for (const [label, forged] of [
    ["B's row with A's page id", { ...payload, pageId: fx.A.page.live }],
    ["A's store and page with B's row id", { ...payload, storeId: fx.A.id, pageId: fx.A.page.live }],
  ] as const) {
    const token = seal(JSON.stringify(forged), "platform", "preview:v1");
    const r = await callRoute({ anonymous: true }, previewRoute, "GET", { token }, {});
    check(`preview: a token forged with ${label} → the 404 of an unknown token, nothing of A`, r.ok && r.value!.status === 404 && text(routeAnswer(r)) === text(routeAnswer(unknown)) && leaks(fx, routeAnswer(r)).length === 0, routeAnswer(r));
  }
  const revoke = await call({ anonymous: true }, "/", () => PT.revokePreviewToken(scopeOf(fx.A.id), String(payload.jti)));
  check("revokePreviewToken(A, B's link id): not_found, B's link still works", !revoke.ok && /not_found/.test(text(answerOf(revoke))) && (await PT.openPreviewToken(tokenB)) !== null, answerOf(revoke));
  notApplicable("mintPreviewLinkAction with A's page id from B (rev 3)", "no preview-link action in R1.0 (the share sheet arrives with P3); the repository it calls, mintPreviewToken, is attacked with B's scope and A's page above");

  // 5. a suspended store's page key refuses orders like an unknown key (§A.5.3; an active store's key resolves)
  const target = await TP.resolvePublicTarget(await pageKeyOf(fx.A.page.live));
  check("resolvePublicTarget(A's live page key): A's page in A's store (the positive control)", target?.store.id === fx.A.id && target.pageId === fx.A.page.live, target ? { store: target.store.id, page: target.pageId } : null);
  const suspended = await seedStore("suspended");
  const suspTarget = await TP.resolvePublicTarget(suspended.pageKey);
  check(
    "a suspended store's page key: its own store, every public API refused (order, lead, upsell, event: unavailable; track: 404)",
    suspTarget?.store.id === suspended.id && (["order", "lead", "upsell", "event"] as const).every((api) => TP.publicApiAnswer(suspTarget.store.status, api) === "unavailable") && TP.publicApiAnswer(suspTarget.store.status, "track") === "not_found",
    suspTarget ? suspTarget.store.status : null,
  );
  // a schema-valid order (the route resolves the key before anything else of the store): the unknown key's answer
  const orderRoute = route("/api/public/order");
  const order = (pageKey: string) => ({ pageKey, idem: randomUUID(), eventId: `qa_${randomBytes(6).toString("hex")}`, bundleId: "b1", variants: [], bump: false, name: "Qa Tester", phone: "+212612345678", city: "Casablanca", address: "12 Rue Test, Maarif", email: "", website: "", t: 30_000, utm: {} });
  const susp = await callRoute({ anonymous: true }, orderRoute, "POST", {}, { body: order(suspended.pageKey) }, { headers: { "x-forwarded-for": "198.51.100.71" } });
  const unk = await callRoute({ anonymous: true }, orderRoute, "POST", {}, { body: order("pk_unknown_page_key_0") }, { headers: { "x-forwarded-for": "198.51.100.72" } });
  check("POST /api/public/order with a suspended store's page key: 404 unavailable, the unknown key's answer", susp.ok && susp.value!.status === 404 && text(routeAnswer(susp)) === text(routeAnswer(unk)), { suspended: routeAnswer(susp), unknown: routeAnswer(unk) });
  const [[suspOrders]] = (await pool().query("SELECT COUNT(*) AS n FROM orders WHERE store_id = ?", [suspended.id])) as unknown as [[{ n: number }]];
  check("…and the suspended store has no order", Number(suspOrders.n) === 0, suspOrders);

  // 6. invites: token reuse, expiry, escalation, enumeration (above), 10 parallel accepts → one membership (SEC-24)
  await inviteCases(kit);

  // 7. the quota race: parallel uploads into B charge B's own gauge exactly, A's rows stay
  const GU = load<typeof import("@/lib/db/usage")>("@/lib/db/usage");
  await GU.recomputeStoreGauges(B);
  const snapA = await snapshot(fx.A.id);
  const mediaRoute = route("/api/app/[store]/media");
  // three members of B with two uploads each (the upload slots: 2 per member, 3 per store, 4 per process)
  const uploaders = [fx.B.members.owner, fx.B.members.admin, fx.B.members.editor];
  const images = await Promise.all(Array.from({ length: 6 }, (_, i) => png(40 + i, 36 + i, false)));
  const ups = await Promise.all(images.map((photo, i) => callRoute({ userId: uploaders[i % 3]! }, mediaRoute, "POST", { store: fx.B.handle }, { multipart: true }, { photo })));
  const statuses = ups.map((u) => (u.ok ? u.value!.status : 500));
  check("quota race: 6 parallel uploads in B answer 201 or a busy 429/503, never a 500", statuses.every((s) => s === 201 || s === 429 || s === 503) && statuses.filter((s) => s === 201).length >= 2, statuses);
  const drift = await GU.recomputeStoreGauges(B);
  check("quota race: B's media gauge equals B's files afterwards (no lost or doubled charge)", drift.media_bytes.before === drift.media_bytes.after, drift.media_bytes);
  check("quota race: A's rows unchanged (A's gauge, files, buckets)", (await snapshot(fx.A.id)).hash === snapA.hash, snapshotDiff(snapA, await snapshot(fx.A.id)));

  // 8. D69: the day's sandbox ceiling (the 51st pending store lands in the waitlist) and the shared disk budget
  await sandboxCases(kit);

  notApplicable("addImpersonationNoteAction from a tenant session / from staff not viewing the store (rev 2.1)", "no impersonation-note action in R1.0 (the console's notes arrive with P1, PLA-§10)");
  notApplicable("a store-side replay(ctx, id) of another store's outbox row (rev 2.1)", "no outbox in R1.0 (the jobs outbox arrives with P8)");
  notApplicable("registerBudgetProfile with a kind other than the document's (rev 2.1)", "no budget-profile registry in R1.0 (the per-kind budgets arrive with P0/P3; R1.0 renders landing pages only)");
  notApplicable("export allow-list entries naming the apex or a sibling store subdomain (SEC-23, S mode)", "this suite runs the platform in P mode (no STORE_ROOT_DOMAIN): the S-mode entries are test:public-api's, which runs both modes; the platform's own host is refused above");

  async function pageKeyOf(pageId: string): Promise<string> {
    const [[row]] = (await pool().query("SELECT public_key FROM pages WHERE id = ?", [pageId])) as unknown as [[{ public_key: string }]];
    return row.public_key;
  }

  /** A third store in `status` with an owner and one published page (its page key). */
  async function seedStore(status: "suspended" | "pending"): Promise<{ id: string; pageKey: string }> {
    const { newId, newPublicKey } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
    const { sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
    const id = newId();
    const owner = newId();
    await db.insert(S.users).values({ id: owner, email: `owner-${id.toLowerCase()}@tenancy.test`, name: "Owner C", passwordHash: "tenancy-check:no-password", platformRole: "none" as never, totpEnabled: false });
    await db.execute(sql`INSERT INTO stores (id, handle, name, status, brand_seed, created_by) VALUES (${id}, ${`c-${id.toLowerCase().slice(-10)}`}, ${"Store C"}, ${status}, ${randomBytes(8).toString("hex")}, ${owner})`);
    await db.insert(S.storeMembers).values({ storeId: id, userId: owner, role: "owner" });
    const doc = await fresh.doc(fx.B);
    const pageId = newId();
    const versionId = newId();
    const pageKey = newPublicKey();
    await db.insert(S.pages).values({ id: pageId, storeId: id, slug: "argan", name: "C page", status: "published", locale: (doc as { locale: string }).locale as never, publicKey: pageKey, draft: doc as never, createdBy: owner });
    await db.insert(S.pageVersions).values({ id: versionId, storeId: id, pageId, kind: "publish", label: null, doc: doc as never, checksum: createHash("sha256").update(versionId).digest("hex"), createdBy: owner, html: "<!doctype html><p>c</p>", runtimeV: 2 });
    await db.update(S.pages).set({ publishedVersionId: versionId }).where(eq(S.pages.id, pageId));
    return { id, pageKey };
  }
}

/** Invites (TENANCY-MAP §10.2, SEC-24): a token joins its own store with its own role, once, for its own e-mail. */
async function inviteCases(kit: Kit): Promise<void> {
  const { fx } = kit;
  const { db, pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const INV = load<typeof import("@/lib/tenancy/invites")>("@/lib/tenancy/invites");
  const { requireStoreMember } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  const ownerA = { userId: fx.A.members.owner };
  const ctxA = await call(ownerA, appPath(fx.A.handle, "/team"), () => requireStoreMember({ handle: fx.A.handle, permission: "members.invite", throwOnFail: true }));
  if (!ranReal("invites: A's owner's team context", ctxA)) return;
  if (!ctxA.ok) return check("invites: A's owner's team context", false, answerOf(ctxA));
  const newUser = async (email: string) => {
    const id = newId();
    await db.insert(S.users).values({ id, email, name: "Joiner", passwordHash: "tenancy-check:no-password", platformRole: "none" as never, totpEnabled: false });
    return id;
  };
  const mint = async (email: string) => {
    const r = await call(ownerA, appPath(fx.A.handle, "/team"), () => INV.createInvite(ctxA.value!, { email, role: "agent" }));
    if (!r.ok) throw new Error(`createInvite: ${text(answerOf(r))}`);
    return r.value!.url.split("/invite/")[1]!;
  };
  const memberships = async (userId: string) =>
    ((await pool().query("SELECT store_id, role FROM store_members WHERE user_id = ? ORDER BY store_id", [userId])) as unknown as [{ store_id: string; role: string }[]])[0];

  // 10 parallel accepts of one invite: exactly one membership, the invite's role, in the invite's store (SEC-24)
  const email = `joiner.${randomInt(1e9)}@mail.test`;
  const joiner = await newUser(email);
  const token = await mint(email);
  const accepts = await Promise.all(Array.from({ length: 10 }, () => call({ anonymous: true }, "/", () => INV.acceptInvite(token, { userId: joiner }))));
  const rows = await memberships(joiner);
  check("10 parallel accepts of one invite: one membership, as agent, in A only (SEC-24)", rows.length === 1 && rows[0]!.store_id === fx.A.id && rows[0]!.role === "agent", { rows, answers: accepts.map((a) => (a.ok ? (a.value as { joined: boolean }).joined : text(answerOf(a)).slice(0, 60))) });
  check("…exactly one of them joined", accepts.filter((a) => a.ok && (a.value as { joined: boolean }).joined).length === 1, accepts.map((a) => (a.ok ? (a.value as { joined: boolean }).joined : "refused")));
  // reuse: the spent token joins nobody else (and answers what an unknown token answers)
  const other = await newUser(`other.${randomInt(1e9)}@mail.test`);
  const reuse = await call({ anonymous: true }, "/", () => INV.acceptInvite(token, { userId: other }));
  const unknownTok = await call({ anonymous: true }, "/", () => INV.acceptInvite("SG-NOTATOKEN0000", { userId: other }));
  check("a spent invite token: refused like an unknown token, no membership", !reuse.ok && text(answerOf(reuse)) === text(answerOf(unknownTok)) && (await memberships(other)).length === 0, { reuse: answerOf(reuse), unknown: answerOf(unknownTok) });
  check("previewInvite(a spent token) → null", (await INV.previewInvite(token)) === null);
  // escalation: B's owner (a member of B, another e-mail) takes nothing from A's invite; the role is the invite's
  const email2 = `invitee2.${randomInt(1e9)}@mail.test`;
  const token2 = await mint(email2);
  const wrong = await call({ anonymous: true }, "/", () => INV.acceptInvite(token2, { userId: fx.B.members.owner }));
  check("A's invite accepted by B's owner (another e-mail): refused, B's owner gets no role in A", !wrong.ok && !(await memberships(fx.B.members.owner)).some((m) => m.store_id === fx.A.id), answerOf(wrong));
  // expiry: an expired invite previews as nothing and joins nobody
  await pool().query("UPDATE store_invites SET expires_at = ? WHERE token_hash = ?", [new Date(Date.now() - 60_000), INV.hashInviteToken(token2)]);
  const invitee2 = await newUser(email2);
  const expired = await call({ anonymous: true }, "/", () => INV.acceptInvite(token2, { userId: invitee2 }));
  check("an expired invite: previews as null, refused at accept, no membership", (await INV.previewInvite(token2)) === null && !expired.ok && (await memberships(invitee2)).length === 0, answerOf(expired));
}

/** D69: the daily sandbox ceiling and the shared disk budget of pending stores, through T2's signup and the media route. */
async function sandboxCases(kit: Kit): Promise<void> {
  const { fx } = kit;
  const SU = load<typeof import("@/lib/auth/signup")>("@/lib/auth/signup");
  const U = load<typeof import("@/lib/tenancy/usage")>("@/lib/tenancy/usage");
  const { getPlatformSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { signup } = await getPlatformSetting("platform");
  const day = SU.platformDay();
  const limit = signup.pendingStoresPerDay;
  const approval = { mode: { mode: "approval" as const, stored: "approval" as const, unguarded: false, turnstile: null } } as never;
  const form = (n: string) => ({
    name: `Sandbox Seller ${n}`,
    email: `sandbox.${n}@mail.test`,
    password: `Tenancy-${randomBytes(9).toString("base64url")}-9q`,
    phone: "+212612345678",
    storeName: `Sandbox ${n}`,
    handle: `sandbox-${n}`,
    market: "MA",
    acceptLegal: true,
    formMs: 42_000,
    locale: "fr" as const,
  });
  // rotating /64s: no per-network limit stands in for the ceiling
  const ctx = (n: number) => ({ ip: `2001:db8:${(0x100 + n).toString(16)}::1`, ua: "Mozilla/5.0 (tenancy-check)", deviceId: null, turnstile: async () => "ok" as const });
  // the day's first limit - 1 sandboxes are taken (charged on the real counter), so the next signup is the limit-th
  await U.chargePlatformUsage("pending_stores", day, limit - 1, { limit });
  const last = await call({ anonymous: true }, "/signup", () => SU.signupAccount(form(`a${randomInt(1e6)}`), ctx(1) as never, approval));
  const over = await call({ anonymous: true }, "/signup", () => SU.signupAccount(form(`b${randomInt(1e6)}`), ctx(2) as never, approval));
  check(`the day's ${limit}th signup in approval mode: a pending store`, last.ok && (last.value as { kind: string; storeStatus?: string }).kind === "created" && (last.value as { storeStatus?: string }).storeStatus === "pending", answerOf(last));
  check(`the ${limit + 1}st: the waitlist (capped), no store (D69)`, over.ok && (over.value as { kind: string; reason?: string }).kind === "waitlisted" && (over.value as { reason?: string }).reason === "capped", answerOf(over));
  await U.refundPlatformUsage("pending_stores", day, limit);
  if (!last.ok || (last.value as { kind: string }).kind !== "created") return;
  const created = last.value as { userId: string; handle: string; storeId: string };
  // the pending store at the shared disk budget: an upload answers `quota` (413), never a 500, and charges nothing
  const MiB = 1024 * 1024;
  const budget = signup.pendingMediaTotalMiB * MiB;
  await U.chargePlatformUsage("pending_media_bytes", "total", budget);
  const before = await snapshot(created.storeId);
  const up = await callRoute({ userId: created.userId }, deriveRoutes().find((r) => r.template === "/api/app/[store]/media")!, "POST", { store: created.handle }, { multipart: true }, { photo: await png(48, 40, false) });
  check("a pending store at the shared disk budget: the upload answers 413 quota, never a 500 (D69)", up.ok && up.value!.status === 413 && /"quota"/.test(up.value!.body), routeAnswer(up));
  // only the attempt's own bookkeeping moves (its rate bucket, the day's upload bytes, the member's last activity)
  const moved = snapshotDiff(before, await snapshot(created.storeId));
  check("…and stores nothing (no asset, no file)", !moved.some((t) => ["assets", "media_files", "media_chunks"].includes(t)), moved);
  await U.refundPlatformUsage("pending_media_bytes", "total", budget);
  check("…A's rows never involved", leaks(fx, routeAnswer(up)).length === 0, leaks(fx, routeAnswer(up)));
}
/* ------------------------------------------------------------------ */
/* account and console: the pages and actions outside /app/<handle>    */
/* ------------------------------------------------------------------ */

/** Every page and layout of the app outside /app/[store] (the picker, account, new store, console, sign-in, marketing). */
export function deriveOtherPages(): PageFile[] {
  return walk(path.join(ROOT, "src", "app"), (f) => /[\\/](page|layout)\.tsx$/.test(f))
    .map((file) => {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const template = `/${rel.replace(/^src\/app\//, "").replace(/\/?(page|layout)\.tsx$/, "")}`
        .split("/")
        .filter((seg) => !/^\(.*\)$/.test(seg))
        .join("/");
      return { file: rel, template: template || "/", kind: (rel.endsWith("layout.tsx") ? "layout" : "page") as PageFile["kind"] };
    })
    // the root layout is the document frame (next/font, a build-time loader that only runs inside Next) and reads no
    // data: every page below renders inside it in the real app
    .filter((p) => !p.file.startsWith("src/app/app/[store]/") && p.file !== "src/app/layout.tsx");
}

/**
 * The pages outside a store (the store picker, the account pages, /app/new, the console home, sign-in and the
 * marketing pages) rendered as every attacker of A: whatever they render carries nothing of A (a member of both sees
 * A's name and handle in the picker, which are not canaries). The account actions that take an id or a handle, with
 * A's: another member's session, A's store id, A's handle (start a view as a non-staff member): the answer of a
 * missing one, A untouched.
 */
export async function accountSuite(kit: Kit): Promise<void> {
  const { fx } = kit;
  suite("account and console");
  const pages = deriveOtherPages();
  check("the pages outside /app/<handle> are derived from the tree (picker, account, new store, console)", ["/app", "/app/account", "/app/new", "/admin"].every((t) => pages.some((p) => p.template === t && p.kind === "page")), pages.map((p) => p.template));
  const before = await snapshot(fx.A.id);
  for (const page of pages) {
    const params: Record<string, string> = page.template.includes("[token]") ? { token: "SG-NOTATOKEN0000" } : {};
    for (const who of attackers(fx)) {
      const r = await renderPage({ userId: who.userId }, page, params);
      const label = `${page.template}${page.kind === "layout" ? " (layout)" : ""} · ${who.label}`;
      if (!ranReal(label, r.kind === "error" ? r : null)) continue;
      if (r.kind === "render") check(`${label}: nothing of A`, leaks(fx, r.payload).length === 0, leaks(fx, r.payload));
      // a redirect never lands in A's dashboard (only the member of both may be sent there)
      else if (r.kind === "redirect") check(`${label}: a redirect outside A`, who.userId === fx.dual || !r.to.includes(`/app/${fx.A.handle}`), r.to);
      else check(`${label}: renders, redirects or 404s`, r.kind === "notFound", r);
    }
  }

  // the account actions with A's ids, as B's owner on a real session row (the session-bound ones read it)
  const AUTH = load<typeof import("@/lib/auth/actions")>("@/lib/auth/actions");
  const ACC = load<typeof import("@/app/app/account/actions")>(path.join(ROOT, "src", "app", "app", "account", "actions.ts"));
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const sessionOf = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
  const asB = { sessionToken: fx.B.ownerToken };
  // setLastStoreAction(A's id): not B's owner's store, nothing remembered, the answer of an unknown id
  const last = await call(asB, "/app", () => AUTH.setLastStoreAction(fx.A.id));
  const lastGhost = await call(asB, "/app", () => AUTH.setLastStoreAction(ghostOf(fx.A.id)));
  const [[sess]] = (await pool().query("SELECT last_store_id FROM sessions WHERE id = ?", [sessionOf(fx.B.ownerToken)])) as unknown as [[{ last_store_id: string | null }]];
  check("setLastStoreAction(A's id) as B's owner: nothing remembered, the answer of an unknown id", ranReal("setLastStoreAction", last, lastGhost) && text(answerOf(last)) === text(answerOf(lastGhost)) && sess?.last_store_id !== fx.A.id, { real: answerOf(last), ghost: answerOf(lastGhost), lastStore: sess?.last_store_id });
  // revokeSessionAction(A's owner's session id): another user's session matches nothing
  const rev = await call(asB, "/app/account/sessions", () => ACC.revokeSessionAction(sessionOf(fx.A.ownerToken)));
  const [[alive]] = (await pool().query("SELECT COUNT(*) AS n FROM sessions WHERE id = ?", [sessionOf(fx.A.ownerToken)])) as unknown as [[{ n: number }]];
  check("revokeSessionAction(A's owner's session) as B's owner: A's owner stays signed in", ranReal("revokeSessionAction", rev) && Number(alive?.n) === 1, { answer: answerOf(rev), alive: alive?.n });
  // startImpersonationAction(A's handle) by members and outsiders: refused, the answer of an unknown handle
  for (const who of attackers(fx).filter((w) => w.userId !== fx.staff.id)) {
    const real = await call({ userId: who.userId }, "/admin", () => AUTH.startImpersonationAction({ handle: fx.A.handle, reason: "ticket" as never, ticketRef: "X" }));
    const ghost = await call({ userId: who.userId }, "/admin", () => AUTH.startImpersonationAction({ handle: fx.ghostHandle, reason: "ticket" as never, ticketRef: "X" }));
    const label = `startImpersonationAction(A's handle) · ${who.label}`;
    if (ranReal(label, real, ghost)) check(`${label}: refused, the answer of an unknown handle`, refusal(real) !== null && text(answerOf(real)) === text(answerOf(ghost)), { real: answerOf(real), ghost: answerOf(ghost) });
  }
  const after = await snapshot(fx.A.id);
  check("A's rows (and its members' sessions) unchanged by every account-page render and account action", after.hash === before.hash, snapshotDiff(before, after));
}

// D71 (§F.1, rev 3): `platformScope()` is not a WriteScope; tsc fails here the day a write repository accepts one.
export function platformScopeNeverWrites(ctx: import("@/lib/tenancy/types").PlatformCtx, storeId: string): void {
  const { platformScope } = load<typeof import("@/lib/platform/seam")>("@/lib/platform/seam");
  const { setAssetAlt } = load<typeof import("@/lib/admin-data/assets")>("@/lib/admin-data/assets");
  // @ts-expect-error a platform scope is read-only (D71)
  void setAssetAlt(platformScope(ctx, storeId), "id", "alt", ctx.actor);
}

/* ------------------------------------------------------------------ */
/* impersonation through the seam (T2)                                 */
/* ------------------------------------------------------------------ */

/** A staff session viewing `store` through T2's seam (a real `sessions` row with a fresh step-up); null when T2 refused it. */
export async function impersonate(fx: Fixtures, store: StoreFx): Promise<string | null> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const token = randomBytes(32).toString("base64url");
  await db.insert(S.sessions).values({ id: createHash("sha256").update(token, "utf8").digest("hex"), userId: fx.staff.id, mfaPassed: true, expiresAt: new Date(Date.now() + 3_600_000), stepUpAt: new Date() });
  const r = await call({ sessionToken: token }, "/admin", async () => {
    const { requirePlatform } = load<typeof import("@/lib/platform/seam")>("@/lib/platform/seam");
    const { startImpersonation } = load<typeof import("@/lib/platform/impersonation")>("@/lib/platform/impersonation");
    const ctx = await requirePlatform({ permission: "stores.impersonate", throwOnFail: true });
    return startImpersonation(ctx, { storeId: store.id, reason: "ticket", ticketRef: "TENANCY-CHECK", minutes: 15 });
  });
  const label = `staff starts a read-only view of store ${store.key} (T2's seam)`;
  if (!ranReal(label, r)) return null;
  check(label, r.ok, answerOf(r));
  return r.ok ? token : null;
}

export async function impersonationSuite(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  suite("impersonation");
  const tokenA = await impersonate(fx, fx.A);
  if (!tokenA) return;
  const who = { sessionToken: tokenA };
  // every case's arguments first: a destructive case makes a fresh record of A, which must predate the fingerprint
  const victims = new Map<ActionCase, unknown[]>();
  for (const c of ACTION_CASES) victims.set(c, await c.victim(fx, fresh));
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const auditRows = async (storeId: string, afterId: number) =>
    ((await pool().query("SELECT id, action, user_id FROM audit_log WHERE store_id = ? AND id > ? ORDER BY id", [storeId, afterId])) as unknown as [{ id: number; action: string; user_id: string | null }[]])[0];
  const auditTop = async (storeId: string) =>
    Number(((await pool().query("SELECT COALESCE(MAX(id), 0) AS top FROM audit_log WHERE store_id = ?", [storeId])) as unknown as [[{ top: number }]])[0][0].top);
  const top = await auditTop(fx.A.id);
  const before = await snapshot(fx.A.id);
  for (const c of ACTION_CASES) {
    const args = victims.get(c)!;
    const r = await call(who, appPath(fx.A.handle, c.path), () => actionFn(c)(...args));
    if (c.write) check(`${c.id} · staff viewing A: refused (read-only)`, ["impersonation_read_only", "forbidden"].includes(refusal(r) ?? ""), answerOf(r));
    else {
      const leaked = leaks(fx, answerOf(r), { only: ["customer", "secret"] });
      check(`${c.id} · staff viewing A: no customer or secret canary`, leaked.length === 0, leaked);
    }
  }
  for (const page of derivePages()) {
    const ids: Record<string, string> = page.template.includes("[id]") ? { id: fx.A.page.live } : {};
    for (const sp of pageQueries(fx, page.template)) {
      const r = await renderPage(who, page, { store: fx.A.handle, ...ids }, sp);
      const label = `${page.template} · staff viewing A`;
      // the search box echoes what the staff member typed (`?q=` a customer's name): their own string, not a leak
      if (r.kind === "render") check(`${label}: no customer canary in the payload`, leaks(fx, r.payload, { only: ["customer", "secret"], sent: sp }).length === 0, leaks(fx, r.payload, { only: ["customer", "secret"], sent: sp }));
      else if (ranReal(label, r.kind === "error" ? r : null)) check(`${label}: renders or 404`, r.kind === "notFound", r);
    }
  }
  const tenantRoutes = deriveRoutes().filter((r) => r.template.includes("[store]"));
  for (const route of tenantRoutes) {
    for (const method of route.methods) {
      const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.A) } : {};
      const r = await callRoute(who, route, method, { store: fx.A.handle, ...ids }, routePlan(fx, method, route.template), { photo: fx.A.photoBytes });
      const label = `${method} ${route.template} · staff viewing A`;
      if (!ranReal(label, r)) continue;
      check(`${label}: no customer or secret canary`, leaks(fx, routeAnswer(r), { only: ["customer", "secret"] }).length === 0, leaks(fx, routeAnswer(r), { only: ["customer", "secret"] }));
      // a state-changing method of a dashboard API is refused before its body
      if (method !== "GET" && method !== "HEAD" && route.template.startsWith("/api/app/")) check(`${label}: a write is refused (403, read-only)`, r.ok && r.value!.status === 403, routeAnswer(r));
    }
  }
  const afterView = await snapshot(fx.A.id);
  // the one row the view may add (PLA-§10.2): `platform.impersonation.write_refused` per refused write, by the staff member
  const moved = snapshotDiff(before, afterView);
  const added = await auditRows(fx.A.id, top);
  // a refused call is audited whatever the case's own `write` flag says (sendPixelTestAction needs a write key)
  const writes = ACTION_CASES.length + tenantRoutes.reduce((n, r) => n + r.methods.length, 0);
  check("A's rows unchanged while staff viewed A (but the audit of each refused write)", moved.every((t) => t === "audit_log"), moved);
  check(
    `…A's audit gained only write_refused rows of the staff member, at most one per refused call (${writes})`,
    added.length > 0 && added.length <= writes && added.every((r) => r.action === "platform.impersonation.write_refused" && r.user_id === fx.staff.id),
    { rows: added.length, other: added.filter((r) => r.action !== "platform.impersonation.write_refused" || r.user_id !== fx.staff.id).slice(0, 5) },
  );

  // staff viewing B attack A like any member of B: A's path / handle answer as an unknown handle, B's path with A's
  // ids as missing ids, nothing of A in any answer, A's rows (its audit included) byte-identical
  const tokenB = await impersonate(fx, fx.B);
  if (!tokenB) return;
  const viewB = { sessionToken: tokenB };
  // the fresh records of A first (A's own audit rows), then the fingerprint and the audit mark
  const victimsB = new Map<ActionCase, unknown[]>();
  for (const c of ACTION_CASES) victimsB.set(c, await c.victim(fx, fresh));
  const topA = await auditTop(fx.A.id);
  const beforeB = await snapshot(fx.A.id);
  for (const c of ACTION_CASES) {
    const args = victimsB.get(c)!;
    const onA = await call(viewB, appPath(fx.A.handle, c.path), () => actionFn(c)(...structuredClone(args)));
    const onGhost = await call(viewB, appPath(fx.ghostHandle, c.path), () => actionFn(c)(...structuredClone(args)));
    const la = `${c.id} · staff viewing B · A's path`;
    if (ranReal(la, onA, onGhost)) {
      check(`${la}: not_found`, refusal(onA) === "not_found", answerOf(onA));
      check(`${la}: same answer as an unknown handle`, text(answerOf(onA)) === text(answerOf(onGhost)), { onA: answerOf(onA), onGhost: answerOf(onGhost) });
    }
    const ghostArgs = ghostify(fx, args);
    const real = await call(viewB, appPath(fx.B.handle, c.path), () => actionFn(c)(...structuredClone(args)));
    const ghost = await call(viewB, appPath(fx.B.handle, c.path), () => actionFn(c)(...structuredClone(ghostArgs)));
    const lb = `${c.id} · staff viewing B · B's path, A's ids`;
    if (ranReal(lb, real, ghost)) {
      if (text(args) !== text(ghostArgs)) check(`${lb}: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
      if (c.write) check(`${lb}: refused`, refusal(real) !== null, answerOf(real));
    }
    const leaked = leaks(fx, [answerOf(onA), answerOf(real)], { sent: args });
    check(`${c.id} · staff viewing B: no canary of A`, leaked.length === 0, leaked);
  }
  for (const page of derivePages()) {
    const ids: Record<string, string> = page.template.includes("[id]") ? { id: fx.A.page.live } : {};
    const onA = await renderPage(viewB, page, { store: fx.A.handle, ...ids });
    const dataFree = page.kind === "layout" && !/requireStoreMember\(|memberCtx\(/.test(readFileSync(path.join(ROOT, page.file), "utf8"));
    const la = `${page.template}${page.kind === "layout" ? " (layout)" : ""} · staff viewing B · A's handle`;
    if (ranReal(la, onA.kind === "error" ? onA : null)) {
      if (dataFree) check(`${la}: nothing of A`, onA.kind === "notFound" || (onA.kind === "render" && leaks(fx, onA.payload).length === 0), onA);
      else check(`${la}: 404`, onA.kind === "notFound", onA);
    }
    for (const sp of pageQueries(fx, page.template)) {
      const r = await renderPage(viewB, page, { store: fx.B.handle, ...ids }, sp);
      const lb = `${page.template}${Object.keys(sp).length ? `?${new URLSearchParams(sp)}` : ""} · staff viewing B · B's handle, A's ids`;
      if (r.kind === "render") check(`${lb}: no canary of A`, leaks(fx, r.payload, { sent: [sp, ids] }).length === 0, leaks(fx, r.payload, { sent: [sp, ids] }));
      else if (ranReal(lb, r.kind === "error" ? r : null)) check(`${lb}: 404 or a redirect inside B`, r.kind === "notFound" || (r.kind === "redirect" && r.to.startsWith(`/app/${fx.B.handle}/`)), r);
    }
  }
  for (const route of tenantRoutes) {
    for (const method of route.methods) {
      const plan = routePlan(fx, method, route.template);
      const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.A) } : {};
      if (route.template.startsWith("/s/")) {
        // A's public store routes: the staff member viewing B is one more visitor there (the signed-out answer)
        const params: Record<string, string> = { store: fx.A.handle, ...(route.template.includes("[slug]") ? { slug: fx.A.slug } : {}), ...(route.template.includes("[kind]") ? { kind: "privacy" } : {}) };
        const seen = await callRoute(viewB, route, method, params, {});
        const anon = await callRoute({ anonymous: true }, route, method, params, {});
        const l = `${method} ${route.template} · staff viewing B · A's public address`;
        if (ranReal(l, seen, anon)) {
          check(`${l}: the signed-out answer, no customer or secret canary`, text(routeAnswer(seen)) === text(routeAnswer(anon)) && leaks(fx, routeAnswer(seen), { only: ["customer", "secret"] }).length === 0, { seen: routeAnswer(seen), anonymous: routeAnswer(anon), logs: seen.logs.slice(0, 3) });
          check(`${l}: served (never a 5xx)`, anon.ok && anon.value!.status < 500, { status: anon.ok ? anon.value!.status : null, logs: anon.logs.slice(0, 3) });
        }
        continue;
      }
      const onA = await callRoute(viewB, route, method, { store: fx.A.handle, ...ids }, plan, { photo: fx.A.photoBytes });
      const onGhost = await callRoute(viewB, route, method, { store: fx.ghostHandle, ...ids }, plan, { photo: fx.A.photoBytes });
      const la = `${method} ${route.template} · staff viewing B · A's handle`;
      const a = routeAnswer(onA);
      if (ranReal(la, onA, onGhost)) {
        const g = JSON.parse(text(routeAnswer(onGhost)).split(fx.ghostHandle).join(fx.A.handle)) as unknown;
        check(`${la}: same answer as an unknown handle`, text(a) === text(g), { onA: a, onGhost: g });
        check(`${la}: 404 (or the alias redirect)`, onA.ok && (onA.value!.status === 404 || (onA.value!.status === 307 && (onA.value!.location ?? "").includes(`/app/${fx.A.handle}/`))), a);
      }
      if (plan.skipIds) continue;
      const real = await callRoute(viewB, route, method, { store: fx.B.handle, ...ids }, plan);
      const ghost = await callRoute(viewB, route, method, { store: fx.B.handle, ...ghostify(fx, ids) }, ghostify(fx, plan));
      const lb = `${method} ${route.template} · staff viewing B · B's handle, A's ids`;
      if (ranReal(lb, real, ghost)) check(`${lb}: same answer as a missing id`, text(routeAnswer(real)) === text(unghost(fx, routeAnswer(ghost))), { real: routeAnswer(real), ghost: routeAnswer(ghost) });
      const leaked = leaks(fx, [a, routeAnswer(real)], { sent: [plan, ids] });
      check(`${method} ${route.template} · staff viewing B: no canary of A`, leaked.length === 0, leaked);
    }
  }
  const afterB = await snapshot(fx.A.id);
  check("A's rows byte-identical while staff viewed B and attacked A (its audit included)", afterB.hash === beforeB.hash, snapshotDiff(beforeB, afterB));
  const strayAudit = await auditRows(fx.A.id, topA);
  check("…no audit row of A from the view of B", strayAudit.length === 0, strayAudit);
}

/* ------------------------------------------------------------------ */
/* the T4 review's cases (R1.0 step 5)                                 */
/* ------------------------------------------------------------------ */

/**
 * The defects the T4 review found, each with its regression case: the tenant audit screen redacts staff rows (§F.5,
 * PLA-§8.1), the Sheets proof code planted through A's order rows proves nothing (SHT-09: the code goes in a title),
 * the secret writes under integrations.manage and the customer-data exports ask for a fresh step-up (§B.7, SEC-17),
 * the cron pulls a store with no order to push (SHT-11), the agent's R1.0 queue (§A.3.2 interim) and the store-named
 * titles (the overview, the builder). Runs after the impersonation suite, so B's audit holds real staff rows.
 */
export async function reviewSuite(kit: Kit): Promise<void> {
  const { fx } = kit;
  suite("special cases (T4 review)");
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { can, ownQueueOnly } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  const routes = deriveRoutes();
  const route = (t: string) => routes.find((r) => r.template === t)!;
  const pages = derivePages();
  const pageOf = (t: string) => pages.find((p) => p.template === t && p.kind === "page")!;
  const B = writeScope(fx.B.id);
  const ownerB = fx.B.members.owner;
  // a step-up of 6 minutes ago: past the 5-minute window (§B.7)
  const stale = (userId: string): Who => ({ userId, stepUpAt: new Date(Date.now() - 6 * 60_000) });
  const status = (r: Outcome<RouteAnswer>) => (r.ok ? r.value!.status : 500);
  const bodyOf = (r: Outcome<RouteAnswer>) => (r.ok ? r.value!.body : "");
  const lastMeta = async (storeId: string, action: string): Promise<string> => {
    const [rows] = (await pool().query("SELECT meta FROM audit_log WHERE store_id = ? AND action = ? ORDER BY id DESC LIMIT 1", [storeId, action])) as unknown as [{ meta: unknown }[]];
    return text(rows[0]?.meta ?? null);
  };

  // 1. the tenant audit screen (§F.5): a staff row shows the staff member's display name only, never a note the store
  // was not shown, the staff e-mail or the staff user id; a note shown to the store is shown
  {
    const { auditFrom } = load<typeof import("@/lib/audit")>("@/lib/audit");
    const { lifecycleAuditMeta } = load<typeof import("@/lib/tenancy/lifecycle")>("@/lib/tenancy/lifecycle");
    const hidden = `staff-only ${randomBytes(5).toString("hex")}`;
    const shown = `for-the-store ${randomBytes(5).toString("hex")}`;
    // a platform ctx as auditFrom reads it (the staff member, no store ctx): the lifecycle's own row shape
    const staffCtx = { user: { id: fx.staff.id }, actor: { kind: "platform", userId: fx.staff.id, impersonatorId: null, ip: "203.0.113.77" } } as never;
    await auditFrom(staffCtx, "platform.store.restricted", { storeId: fx.B.id, target: fx.B.id, meta: lifecycleAuditMeta("active", "restricted", { reason: "abuse_review" }, hidden) });
    await auditFrom(staffCtx, "platform.store.restored", { storeId: fx.B.id, target: fx.B.id, meta: lifecycleAuditMeta("restricted", "active", { reason: "resolved", notify: { showNote: true } }, shown) });
    // and a row of B's own owner, newest (the staff views of B above wrote many rows: the page shows the latest 50)
    const { auditIn } = load<typeof import("@/lib/admin-data/store-audit")>("@/lib/admin-data/store-audit");
    await auditIn(B, userActor(ownerB), "store.settings.updated", { meta: { key: "store" } });
    const staffMarks = [hidden, "staff@tenancy.test", fx.staff.id];
    const page = await renderPage({ userId: ownerB }, pageOf("/app/[store]/settings/audit"), { store: fx.B.handle });
    const action = await call({ userId: ownerB }, appPath(fx.B.handle, "/settings/audit"), () => actionFn({ file: SETTINGS.file, name: "loadAuditAction" })({}));
    for (const [label, hay] of [
      ["the audit page's payload", page.kind === "render" ? page.payload : ""],
      ["loadAuditAction", refusal(action) === null ? text(answerOf(action)) : ""],
    ] as const) {
      check(`B's ${label}: lists the staff rows by display name (the scan is not blind)`, hay.includes("platform.store.restricted") && hay.includes("Platform staff") && hay.includes("Owner B"), hay.slice(0, 300));
      check(`B's ${label}: no hidden staff note, staff e-mail or staff user id`, staffMarks.every((m) => !hay.includes(m)), staffMarks.filter((m) => hay.includes(m)));
      check(`B's ${label}: the note shown to the store is there`, hay.includes(shown));
    }
  }

  // 2. the Sheets proof (SHT-09): connect and verify ask for a fresh step-up; the code planted in A's order rows (what
  // a shopper types: an address, a note) proves nothing, since no cell is read; the code in a title connects
  {
    const SC = load<typeof import("@/lib/sheets")>("@/lib/sheets");
    const { saveSheetsConfig } = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
    const connectRoute = route("/api/app/[store]/sheets/connect");
    const verifyRoute = route("/api/app/[store]/sheets/verify");
    const linkA = `https://docs.google.com/spreadsheets/d/${fx.A.spreadsheetId}/edit#gid=0`;
    for (const [label, who] of [
      ["no step-up", { userId: ownerB }],
      ["a stale step-up (6 min)", stale(ownerB)],
    ] as const) {
      const c = await callRoute(who, connectRoute, "POST", { store: fx.B.handle }, { body: { url: linkA } });
      check(`POST sheets/connect with ${label}: 403 step_up`, status(c) === 403 && /"step_up"/.test(bodyOf(c)), routeAnswer(c));
      const v = await callRoute(who, verifyRoute, "POST", { store: fx.B.handle }, {});
      check(`POST sheets/verify with ${label}: 403 step_up`, status(v) === 403 && /"step_up"/.test(bodyOf(v)), routeAnswer(v));
    }
    const start = await callRoute(armed(ownerB), connectRoute, "POST", { store: fx.B.handle }, { body: { url: linkA } });
    const code = start.ok ? (JSON.parse(start.value!.body) as { proof?: { code?: string } }).proof?.code : undefined;
    check("B pasting A's link with a fresh step-up: a proof code", typeof code === "string" && /^SG-/.test(code), routeAnswer(start));
    if (code) {
      const rowsA = fakeSheets.get(fx.A.spreadsheetId) ?? [];
      // the code reached A's orders tab through an order on A's public page (lower-cased in the address, as typed in the note)
      fakeSheets.set(fx.A.spreadsheetId, [[fx.A.order.main, "27/10/2026", "Nouvelle", "Shopper", "0612345678", "Casablanca", `derb ${code.toLowerCase()} rue 4`, "Argan", "", 1, 199, `merci ${code}`, "Live"]]);
      const netBefore = network.length;
      const v = await callRoute(armed(ownerB), verifyRoute, "POST", { store: fx.B.handle }, {});
      check("the proof code in A's order rows (address, note): verify refused (code_missing)", status(v) === 409 && /code_missing/.test(bodyOf(v)), routeAnswer(v));
      const touched = network.slice(netBefore).filter((n) => n.url.includes(fx.A.spreadsheetId));
      check("…no cell of A's sheet read, nothing written to it (one metadata read of its titles)", touched.every((n) => n.method === "GET" && !n.url.includes("/values/")), touched.map((n) => `${n.method} ${n.url.slice(0, 120)}`));
      check("…B's connected sheet is still B's own", (await SC.getSheetsConfig(B))?.spreadsheetId === fx.B.spreadsheetId);
      fakeSheets.set(fx.A.spreadsheetId, rowsA);
    }
    // the positive control: B's own new spreadsheet; the code as a tab's name connects it, the row names the step-up
    const ownSheet = `1x${rand("abcdefghijkmnopqrstuvwxyz0123456789", 38)}`;
    fakeSheets.set(ownSheet, []);
    fakeSheetMeta.set(ownSheet, { title: "Ventes Baraka", tabs: ["Feuille 1"] });
    const own = await callRoute(armed(ownerB), connectRoute, "POST", { store: fx.B.handle }, { body: { url: `https://docs.google.com/spreadsheets/d/${ownSheet}/edit` } });
    const ownCode = own.ok ? (JSON.parse(own.value!.body) as { proof?: { code?: string } }).proof?.code : undefined;
    check("B's own new spreadsheet: a proof code", typeof ownCode === "string", routeAnswer(own));
    if (ownCode) {
      const early = await callRoute(armed(ownerB), verifyRoute, "POST", { store: fx.B.handle }, {});
      check("…before the code is in a title: refused (code_missing)", status(early) === 409 && /code_missing/.test(bodyOf(early)), routeAnswer(early));
      fakeSheetMeta.set(ownSheet, { title: "Ventes Baraka", tabs: ["Feuille 1", ownCode.toLowerCase()] });
      const done = await callRoute(armed(ownerB), verifyRoute, "POST", { store: fx.B.handle }, {});
      check("…with the code as a tab's name: connected", status(done) === 200 && (await SC.getSheetsConfig(B))?.spreadsheetId === ownSheet, routeAnswer(done));
      check("…its integrations.sheets.connected row names the step-up (meta.stepUp)", /"stepUp":"password"/.test(await lastMeta(fx.B.id, "integrations.sheets.connected")), await lastMeta(fx.B.id, "integrations.sheets.connected"));
    }
    await saveSheetsConfig(B, { spreadsheetId: fx.B.spreadsheetId, sheetId: 0, sheetTitle: "Commandes", enabled: true }, { id: ownerB, ip: null });
  }

  // 3. the other secret writes and the exports of customer data (§B.7): none or a stale step-up is refused, a fresh
  // one works and the audit row names its method (§F.5 rev 4); a write that plants no secret needs none
  {
    const { getStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
    const PX = load<typeof import("@/lib/pixels/library.server")>("@/lib/pixels/library.server");
    const keyPath = appPath(fx.B.handle, "/integrations/sheets");
    const saveKey = actionFn({ file: SHEETS.file, name: "saveExportKeyAction" });
    const keyJson = serviceAccountJson("review@baraka.iam.gserviceaccount.com");
    const k0 = await call({ userId: ownerB }, keyPath, () => saveKey(keyJson));
    const k1 = await call(stale(ownerB), keyPath, () => saveKey(keyJson));
    const k2 = await call(armed(ownerB), keyPath, () => saveKey(keyJson));
    check("saveExportKeyAction without a step-up: step_up", refusal(k0) === "step_up", answerOf(k0));
    check("…with a stale one: step_up", refusal(k1) === "step_up", answerOf(k1));
    check("…with a fresh one: saved, integrations.export_key.set names the step-up", refusal(k2) === null && /"stepUp"/.test(await lastMeta(fx.B.id, "integrations.export_key.set")), answerOf(k2));

    const pixPath = appPath(fx.B.handle, "/integrations/pixels");
    const savePixel = actionFn({ file: PIXELS.file, name: "savePixelEntryAction" });
    const pid = metaPixelId();
    const token = `EAAR${randomBytes(18).toString("hex")}`;
    const secrets = async () => text(await getStoreSetting(B, "tracking_secrets", { fresh: true }));
    const l0 = await call({ userId: ownerB }, pixPath, () => savePixel({ platform: "meta", id: pid, label: "Review pixel" }));
    check("savePixelEntryAction with no secret (id and label): no step-up needed", refusal(l0) === null, answerOf(l0));
    const t0 = await call(stale(ownerB), pixPath, () => savePixel({ platform: "meta", id: pid, label: "Review pixel", token }));
    check("…a new server token with a stale step-up: step_up, nothing stored", refusal(t0) === "step_up" && !(await secrets()).includes(token), answerOf(t0));
    const c0 = await call(stale(ownerB), pixPath, () => savePixel({ platform: "meta", id: pid, label: "Review pixel", testCode: "TEST7777" }));
    check("…a test event code with a stale step-up: step_up", refusal(c0) === "step_up", answerOf(c0));
    const t1 = await call(armed(ownerB), pixPath, () => savePixel({ platform: "meta", id: pid, label: "Review pixel", token }));
    check("…with a fresh one: stored, integrations.conversions.changed names the step-up", refusal(t1) === null && (await secrets()).includes(token) && /"stepUp"/.test(await lastMeta(fx.B.id, "integrations.conversions.changed")), answerOf(t1));
    await PX.removePixelEntry(B, { platform: "meta", id: pid }, userActor(ownerB));

    // the store's Google key in a ZIP (Editor on its orders sheet)
    const exportRoute = route("/api/app/[store]/export");
    const php = { versionId: fx.B.version.live, mode: "php", allowedOrigins: [], options: { hostConfigs: true, embedServiceAccount: true } };
    const e0 = await callRoute(stale(ownerB), exportRoute, "POST", { store: fx.B.handle }, { body: php });
    check("POST export with the store's Google key and a stale step-up: 403 step_up", status(e0) === 403 && /"step_up"/.test(bodyOf(e0)), routeAnswer(e0));
    const e1 = await callRoute(armed(ownerB), exportRoute, "POST", { store: fx.B.handle }, { body: php });
    check("…with a fresh one: the ZIP, export.created names the key and the step-up", status(e1) === 200 && /"stepUp"/.test(await lastMeta(fx.B.id, "export.created")) && /review@baraka/.test(await lastMeta(fx.B.id, "export.created")), routeAnswer(e1));
    const e2 = await callRoute({ userId: ownerB }, exportRoute, "POST", { store: fx.B.handle }, { body: { ...php, options: { hostConfigs: true } } });
    check("…a PHP export without the key needs no step-up", status(e2) === 200, routeAnswer(e2));

    // the orders CSV (orders.export): the Orders screen fetches it and opens the step-up sheet on this answer
    const csv = route("/api/app/[store]/orders/export");
    const o0 = await callRoute(stale(ownerB), csv, "GET", { store: fx.B.handle }, {});
    check("GET orders/export with a stale step-up: 403 step_up", status(o0) === 403 && /"step_up"/.test(bodyOf(o0)), routeAnswer(o0));
    const o1 = await callRoute(armed(ownerB), csv, "GET", { store: fx.B.handle }, { query: { page_id: fx.B.page.live } });
    check("…with a fresh one: the CSV, orders.exported names the step-up", status(o1) === 200 && /text\/csv/.test(o1.ok ? o1.value!.contentType : "") && /"stepUp"/.test(await lastMeta(fx.B.id, "orders.exported")), routeAnswer(o1));
    const o2 = await callRoute(armed(ownerB), csv, "GET", { store: fx.B.handle }, { query: { page_id: fx.A.page.live } });
    check("…filtered by A's page id (page_id): nothing of A", status(o2) === 200 && leaks(fx, bodyOf(o2), { sent: fx.A.page.live }).length === 0, leaks(fx, bodyOf(o2), { sent: fx.A.page.live }));
  }

  // 4. the cron (SHT-11): a store whose orders are all synced still gets the statuses its agents set in the sheet
  {
    await pool().query("UPDATE orders SET sheet_status = 'synced' WHERE store_id = ?", [fx.B.id]);
    // no pull for a while: the store's sheets:pull window is over
    await pool().query("DELETE FROM rate_limits WHERE bucket = ?", [`s:${fx.B.id}:sheets:pull`]);
    const [[before]] = (await pool().query("SELECT status FROM orders WHERE id = ?", [fx.B.order.main])) as unknown as [[{ status: string }]];
    fakeSheets.set(fx.B.spreadsheetId, [[fx.B.order.main, "", "delivered"]]);
    const tick = await callRoute({ anonymous: true }, route("/api/cron/tick"), "GET", {}, {}, { headers: { "x-cron-key": process.env.CRON_KEY! } });
    const [[after]] = (await pool().query("SELECT status FROM orders WHERE id = ?", [fx.B.order.main])) as unknown as [[{ status: string }]];
    check("cron tick: a store with no order to push still has its sheet's statuses pulled (SHT-11)", status(tick) === 200 && before.status !== "delivered" && after.status === "delivered", { tick: routeAnswer(tick), before, after });
    fakeSheets.set(fx.B.spreadsheetId, []);
  }

  // 5. the agent (§A.3.2 agent*, R1.0 interim: the store's whole queue until P4's assignment; no export, no blocklist,
  // no screen beyond Orders)
  {
    const agent = fx.B.members.agent;
    check(
      "agent*: the order, lead and customer keys are the own-queue keys (P4's predicate switch)",
      (["orders.read", "orders.write", "orders.reveal_phone", "leads.read", "customers.read"] as StorePermission[]).every((p) => ownQueueOnly("agent", p)) && !ownQueueOnly("manager", "orders.read"),
    );
    check(
      "agent: none of orders.read_all, orders.export, blocklist.write, pages, settings, integrations, pixels, exports",
      !(["orders.read_all", "orders.export", "blocklist.write", "pages.read", "settings.read", "integrations.manage", "pixels.manage", "export.create"] as StorePermission[]).some((p) => can("agent", p)),
    );
    const got = await call({ userId: agent }, appPath(fx.B.handle, "/orders"), () => actionFn({ file: ORDERS.file, name: "getOrderAction" })(fx.B.order.main));
    check("agent (R1.0 interim): reads an order of its store's queue", refusal(got) === null, answerOf(got));
    const gotA = await call({ userId: agent }, appPath(fx.B.handle, "/orders"), () => actionFn({ file: ORDERS.file, name: "getOrderAction" })(fx.A.order.main));
    const gotGhost = await call({ userId: agent }, appPath(fx.B.handle, "/orders"), () => actionFn({ file: ORDERS.file, name: "getOrderAction" })(fx.ghosts.get(fx.A.order.main)!));
    check("…never another store's (A's order answers as a missing one, no canary)", refusal(gotA) !== null && text(answerOf(gotA)) === text(unghost(fx, answerOf(gotGhost))) && leaks(fx, answerOf(gotA), { sent: fx.A.order.main }).length === 0, answerOf(gotA));
    const csv = await callRoute(armed(agent), route("/api/app/[store]/orders/export"), "GET", { store: fx.B.handle }, {});
    check("agent: the orders CSV is refused (403)", status(csv) === 403, routeAnswer(csv));
    const home = await renderPage({ userId: agent }, pageOf("/app/[store]"), { store: fx.B.handle });
    check("agent: the overview sends it to Orders", home.kind === "redirect" && home.to === `/app/${fx.B.handle}/orders`, home);
    const { storeNav } = load<typeof import("@/components/admin/shell/store-nav")>("@/components/admin/shell/store-nav");
    const ids = storeNav({ handle: fx.B.handle, mode: fx.rows.B.mode, can: (p) => can("agent", p) }).flatMap((g) => g.items.map((i) => i.id));
    check("agent: its nav has Orders and no Overview (always redirected), Sheets, Pixels or Exports", ids.includes("orders") && !ids.some((i) => ["overview", "sheets", "pixels", "exports"].includes(i)), ids);
  }

  // 6. the titles name the member's own store and page only (LND-24): the metadata is part of every page scan above
  {
    const home = await renderPage({ userId: ownerB }, pageOf("/app/[store]"), { store: fx.B.handle });
    check("the overview's title: \"Overview · <store>\" (the layout's template skips its own page)", home.kind === "render" && home.payload.includes(`Overview · ${fx.B.name}`), home.kind);
    const builder = pageOf("/app/[store]/pages/[id]/edit");
    const mine = await renderPage({ userId: fx.A.members.owner }, builder, { store: fx.A.handle, id: fx.A.page.live });
    check("A's builder title names A's page (the metadata scan is not blind)", mine.kind === "render" && /<metadata>.*· Builder/.test(mine.payload) && mine.payload.includes(fx.canaries.data.find((c) => c.startsWith("Live "))!), mine.kind);
    const theirs = await renderPage({ userId: ownerB }, builder, { store: fx.B.handle, id: fx.A.page.live });
    check("B's builder with A's page id: the 404, no title of A", theirs.kind === "notFound" || (theirs.kind === "render" && leaks(fx, theirs.payload, { sent: fx.A.page.live }).length === 0), theirs.kind);
  }

  // 7. an owner whose language is Arabic: the English store dashboard stays left to right (§I.5: Arabic RTL is R3); the
  // translated identity pages (the /app frame, the team page) follow the viewer
  {
    await pool().query("UPDATE users SET locale = 'ar' WHERE id = ?", [ownerB]);
    try {
      const frame = deriveOtherPages().find((p) => p.file === "src/app/app/layout.tsx")!;
      const outer = await renderPage({ userId: ownerB }, frame, {});
      check("ar owner: the /app frame is Arabic, right to left (the identity pages)", outer.kind === "render" && /"lang":"ar","dir":"rtl"/.test(outer.payload), outer.kind);
      // by file: the builder's (editor) group layout has the same template
      const shell = pages.find((p) => p.file === "src/app/app/[store]/layout.tsx")!;
      const inner = await renderPage({ userId: ownerB }, shell, { store: fx.B.handle });
      check("ar owner: the store shell is English, left to right (no mirrored English sidebar)", inner.kind === "render" && /"lang":"en","dir":"ltr"/.test(inner.payload) && !/"dir":"rtl"/.test(inner.payload), inner.kind);
      const team = await renderPage({ userId: ownerB }, pageOf("/app/[store]/team"), { store: fx.B.handle });
      check("ar owner: the team page (translated) is Arabic, right to left inside the shell", team.kind === "render" && /"lang":"ar","dir":"rtl"/.test(team.payload), team.kind);
    } finally {
      await pool().query("UPDATE users SET locale = NULL WHERE id = ?", [ownerB]);
    }
  }

  // 8. links that lead somewhere: the account's danger page sends an owner to a screen that exists (no
  // /settings/danger before P2), and the Orders CSV is fetched so its step-up refusal opens the sheet
  {
    const danger = deriveOtherPages().find((p) => p.template === "/app/account/danger" && p.kind === "page")!;
    const r = await renderPage({ userId: ownerB }, danger, {});
    const hrefs = r.kind === "render" ? [...r.payload.matchAll(/"href":"(\/app\/[^"]+)"/g)].map((m) => m[1]!) : [];
    const known = [...pages.map((p) => p.template), ...deriveOtherPages().map((p) => p.template)].map((t) => new RegExp(`^${t.replace(/\[[^\]]+\]/g, "[^/]+")}$`));
    check("the account danger page names B's team for B's owner", hrefs.includes(`/app/${fx.B.handle}/team`), hrefs);
    check("…and every /app link of it is a screen of the tree", hrefs.length > 0 && hrefs.every((h) => known.some((re) => re.test(h.split(/[?#]/)[0]!))), hrefs);
    const sources = ["src/components/admin/orders/orders-view.tsx", "src/components/admin/shell/command-palette-body.tsx"].map((f) => readFileSync(path.join(ROOT, f), "utf8"));
    check(
      "the Orders CSV buttons fetch the route (downloadFile: a step_up answer opens the sheet), never a bare download link",
      sources.every((src) => src.includes("downloadFile(") && !/href=\{[^}]*\/orders\/export/.test(src) && !/\.href = store\.api\("\/orders\/export"\)/.test(src)),
    );
  }
}

/* ------------------------------------------------------------------ */
/* plug-ins: scripts/qa/tenancy-cases/<track>.ts (DES-R13)             */
/* ------------------------------------------------------------------ */

/** What a track's case file exports: `export const cases: TenancyCase[]` (built with this file's helpers). */
export interface TenancyCase {
  name: string;
  run(kit: TenancyKit): Promise<void>;
}
export interface TenancyKit extends Kit {
  check: typeof check;
  ranReal: typeof ranReal;
  notApplicable: typeof notApplicable;
  call: typeof call;
  callRoute: typeof callRoute;
  renderPage: typeof renderPage;
  leaks: (value: unknown, opts?: Parameters<typeof leaks>[2]) => string[];
  snapshotA: () => Promise<string>;
  ghostify: <T>(value: T) => T;
  scope: (store: "A" | "B", kind?: StoreScope["kind"]) => StoreScope;
}

export async function pluginSuite(kit: Kit): Promise<void> {
  const dir = path.join(ROOT, "scripts", "qa", "tenancy-cases");
  const files = walk(dir, (f) => /\.ts$/.test(f));
  const tk: TenancyKit = {
    ...kit,
    check,
    ranReal,
    notApplicable,
    call,
    callRoute,
    renderPage,
    leaks: (value, opts) => leaks(kit.fx, value, opts),
    snapshotA: async () => (await snapshot(kit.fx.A.id)).hash,
    ghostify: (value) => ghostify(kit.fx, value),
    scope: (store, kind = "member") => scopeOf(kit.fx[store].id, kind),
  };
  for (const file of files) {
    suite(`cases: ${path.basename(file, ".ts")}`);
    const mod = load<{ cases?: TenancyCase[]; default?: TenancyCase[] }>(file);
    const cases = mod.cases ?? mod.default ?? [];
    check(`${path.basename(file)} exports its cases`, Array.isArray(cases) && cases.length > 0);
    for (const c of cases) {
      try {
        await c.run(tk);
      } catch (e) {
        check(`${c.name} ran`, false, e instanceof Error ? e.stack : e);
      }
    }
  }
}

/* ================================================================== */
/* 8. report and main                                                  */
/* ================================================================== */

export function report(title: string, extra: string[] = []): number {
  suite(currentSuite);
  let pass = 0;
  let fail = 0;
  const na: string[] = [];
  console.log(`\n${title}`);
  for (const [name, t] of tallies) {
    pass += t.pass;
    fail += t.fail.length;
    na.push(...t.na.map((n) => `[${name}] ${n}`));
    console.log(`  ${t.fail.length ? "✗" : "✓"} ${name}: ${t.pass} passed${t.fail.length ? `, ${t.fail.length} FAILED` : ""}${t.na.length ? `, ${t.na.length} not applicable` : ""} (${Math.round(t.ms / 1000)} s)`);
  }
  if (na.length) {
    console.log("  not applicable in R1.0 (no code yet; each with its reason):");
    for (const line of na) console.log(`    · ${line}`);
  }
  for (const line of extra) console.log(`  ${line}`);
  if (fail) {
    console.log("\nFAILURES");
    for (const [name, t] of tallies) for (const f of t.fail) console.log(`  ✗ [${name}] ${f}`);
  }
  // no check is ever pending since the R1.0 merge: a typed stub reached fails its check (ranReal)
  console.log(`\n${fail ? "✗" : "✓"} ${title}: ${pass} passed, ${fail} failed, 0 pending, ${na.length} not applicable`);
  return fail;
}

async function main(): Promise<void> {
  const started = Date.now();
  let failed = 1;
  try {
    const kit = await setup();
    await repositorySuite(kit);
    await actionSuite(kit);
    await routeSuite(kit);
    await pageSuite(kit);
    await specialSuite(kit);
    await moreSpecialCases(kit);
    await impersonationSuite(kit);
    await reviewSuite(kit);
    await accountSuite(kit);
    await pluginSuite(kit);
    failed = 0;
  } catch (e) {
    check("the suite ran to the end", false, e instanceof Error ? e.stack : e);
  } finally {
    const left = await dropDatabase().catch((e) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    const fails = report("test:tenancy (two-store attack suite)", [
      `database ${DB_NAME} ${KEEP ? "kept" : "dropped"}; cod_test_* left: ${left.length ? left.join(", ") : "none"}`,
      `network: ${network.length} requests answered by the fake Google / refused`,
      `${Math.round((Date.now() - started) / 1000)} s`,
    ]);
    process.exit(fails || failed ? 1 : 0);
  }
}

if (require.main === module) void main();
