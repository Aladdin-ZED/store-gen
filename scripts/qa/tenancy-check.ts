/**
 * The two-store attack suite (docs/STORE-SAAS.md §F.1, §F.2, §J.2 `test:tenancy`; TENANCY-MAP §10.2). Store A is the
 * victim, store B the attacker. Every role of B (owner, admin, manager, editor, agent, viewer), a member of both
 * stores, a signed-in outsider, platform staff without a membership and staff "viewing as" a store each try every
 * read and write against A's ids and A's handle: pages, versions, orders, leads, blocklist, media, exports, pixels,
 * Sheets, settings, team, search. Every attempt must answer exactly what a missing id (or an unknown handle) answers,
 * leave A's rows byte-identical and return none of A's canaries.
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
 *  - repositories: the store repositories called with B's scope and A's ids (identical to a missing id), the
 *    impersonation scope (customer fields masked), the console scope (`listPagesForConsole`, SEC-18)
 *  - actions × roles: every exported server action (the "use server" files, derived from the tree) on B's path with
 *    A's ids, on A's path, with B's own record beside A's (B's page, A's version), and in B's own store for the role
 *    matrix (a key the role lacks → `forbidden`; a granted role reaches the body)
 *  - routes: every route handler under src/app/api/** and src/app/app/** (derived from the tree, SEC-9), every method,
 *    on A's handle and on B's handle with A's ids (the neutral 404, no canary), and the role matrix of each handler's
 *    own storeGuard key (403)
 *  - pages: every page and layout under /app/<handle> rendered as B's members on A's handle (the neutral 404), on B's
 *    handle with A's ids (no canary in the props that reach the client), and as A's owner (the canaries are found:
 *    the scan is not blind)
 *  - special cases: same slug, same pixel id with per-store tokens, a sheet listing A's order ids pulled for B, the
 *    blocklist, an identical image upload, A's `sourceAssetId`, a document naming A's asset (save, preview, export),
 *    the settings and pixel-usage caches, x-sg-path tampering, a store-host action, B connecting A's sheet, a
 *    client-sent x-sg-path on the upload route (SEC-3), the export allow-list (SEC-23), the cron tick's per-store
 *    loop, team, invites, preview tokens
 *  - impersonation (D70): staff "viewing as" a store through T2's seam: writes refused, no customer canary in any
 *    action, route or page payload
 *  - plug-ins: every scripts/qa/tenancy-cases/<track>.ts (`export const cases: TenancyCase[]`, DES-R13)
 *
 * Calls that reach another track's typed stub ("not implemented: T2 …") are listed as pending with the stub's name,
 * never counted as passes; they become real checks the day the stub is implemented. T1's settings, crypto,
 * entitlement, usage and store-loop stubs are answered by a local adapter instead (plain JSON rows, an HMAC and
 * AES-GCM under a random test key, everything allowed, in-memory counters, a plain loop over the stores), and T1's real
 * functions once they land (the adapter only answers "not implemented: T1"). Test secrets are random per run and never
 * printed. scripts/qa/action-replay.ts reuses this file's fixtures and cases. Exit code 1 when a check fails.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, createHash, createHmac, generateKeyPairSync, randomBytes, randomInt } from "node:crypto";
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
/* T1 adapters (only while T1's functions answer "not implemented")    */
/* ------------------------------------------------------------------ */

type AnyFn = (...args: unknown[]) => unknown;
/** true for the typed stub of `track` (C0a): "not implemented: T1 (getStoreSetting)" */
export const stubError = (e: unknown, track?: string): boolean => e instanceof Error && e.message.startsWith(`not implemented: ${track ?? ""}`);
/** "T3 (publishPage)" from a stub's error or log text */
export const stubName = (text: string): string | null => /not implemented: (T\d|P\d|C0b|P0)[^"\n]*?\)/.exec(text)?.[0].replace("not implemented: ", "") ?? null;

export const adapterUse = new Map<string, number>();
const used = (name: string) => adapterUse.set(name, (adapterUse.get(name) ?? 0) + 1);
/** usage counters of the adapter: `${owner}|${metric}|${period}` → value */
export const usageCounters = new Map<string, number>();
const TEST_KEY = randomBytes(32);

type SettingsModule = typeof import("@/lib/settings/store-registry");
async function adapterGet(scope: { storeId: string }, key: string): Promise<unknown> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { storeSettings } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { STORE_SETTINGS, storeSettingSchema } = load<SettingsModule>("@/lib/settings/store-registry");
  const [row] = await db
    .select()
    .from(storeSettings)
    .where(and(eq(storeSettings.storeId, scope.storeId), eq(storeSettings.key, key)))
    .limit(1);
  const schema = storeSettingSchema(key as never);
  const parsed = row ? schema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : schema.parse(STORE_SETTINGS[key as keyof typeof STORE_SETTINGS].defaults() as never);
}
async function adapterSet(scope: { storeId: string }, key: string, input: unknown): Promise<unknown> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const { storeSettings } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { storeSettingSchema } = load<SettingsModule>("@/lib/settings/store-registry");
  const value = storeSettingSchema(key as never).parse(input as never);
  await db
    .insert(storeSettings)
    .values({ storeId: scope.storeId, key, value, encrypted: false })
    .onDuplicateKeyUpdate({ set: { value, encrypted: false } });
  return structuredClone(value);
}

const cryptoKey = (scope: unknown, purpose: unknown) =>
  createHash("sha256")
    .update(TEST_KEY)
    .update(`|${typeof scope === "string" ? scope : `store:${(scope as { store?: string }).store ?? "?"}`}|${String(purpose)}`)
    .digest();

const ADAPTERS: Record<string, (real: Record<string, AnyFn>) => Record<string, AnyFn>> = {
  "src/lib/settings/index.ts": (real) => {
    const fallback =
      (name: string, impl: AnyFn): AnyFn =>
      async (...args) => {
        try {
          return await real[name]!(...args);
        } catch (e) {
          if (!stubError(e, "T1")) throw e;
          used(name);
          return impl(...args);
        }
      };
    return {
      getStoreSetting: fallback("getStoreSetting", (scope, key) => adapterGet(scope as { storeId: string }, key as string)),
      getStoreSettings: fallback("getStoreSettings", async (scope, keys) => {
        const out: Record<string, unknown> = {};
        for (const k of keys as string[]) out[k] = await adapterGet(scope as { storeId: string }, k);
        return out;
      }),
      setStoreSetting: fallback("setStoreSetting", (scope, key, input) => adapterSet(scope as { storeId: string }, key as string, input)),
      updateStoreSetting: fallback("updateStoreSetting", async (scope, key, patch) => {
        const { STORE_SETTINGS } = load<SettingsModule>("@/lib/settings/store-registry");
        const { isMaskedSecret } = load<typeof import("@/lib/settings/fields")>("@/lib/settings/fields");
        const current = (await adapterGet(scope as { storeId: string }, key as string)) as Record<string, unknown>;
        const next: Record<string, unknown> = { ...current, ...(patch as Record<string, unknown>) };
        const sensitive = (STORE_SETTINGS[key as keyof typeof STORE_SETTINGS] as { sensitive?: readonly string[] }).sensitive ?? [];
        for (const f of sensitive) if (isMaskedSecret(next[f])) next[f] = current[f];
        return adapterSet(scope as { storeId: string }, key as string, next);
      }),
      getPlatformSetting: fallback("getPlatformSetting", (key) => {
        const { platformSettingSchema } = load<typeof import("@/lib/settings/platform-registry")>("@/lib/settings/platform-registry");
        return platformSettingSchema(key as never).parse({} as never);
      }),
    };
  },
  "src/lib/security/crypto.ts": (real) => {
    const fallback =
      (name: string, impl: AnyFn): AnyFn =>
      (...args) => {
        try {
          return real[name]!(...args);
        } catch (e) {
          if (!stubError(e, "T1")) throw e;
          used(name);
          return impl(...args);
        }
      };
    return {
      hmacBytes: fallback("hmacBytes", (data, purpose) =>
        createHmac("sha256", TEST_KEY)
          .update(String(purpose))
          .update(data as Uint8Array)
          .digest("hex"),
      ),
      seal: fallback("seal", (plain, scope, purpose) => {
        const iv = randomBytes(12);
        const c = createCipheriv("aes-256-gcm", cryptoKey(scope, purpose), iv);
        const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
        return `t1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
      }),
      open: fallback("open", (envelope, scope, purpose) => {
        const [v, iv, tag, ct] = String(envelope).split(".");
        if (v !== "t1" || !iv || !tag || ct === undefined) throw new Error("not an envelope");
        const d = createDecipheriv("aes-256-gcm", cryptoKey(scope, purpose), Buffer.from(iv, "base64url"));
        d.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
      }),
    };
  },
  "src/lib/tenancy/entitlements.ts": (real) => {
    const fallback =
      (name: string, impl: AnyFn): AnyFn =>
      async (...args) => {
        try {
          return await real[name]!(...args);
        } catch (e) {
          if (!stubError(e, "T1")) throw e;
          used(name);
          return impl(...args);
        }
      };
    // features on, limits off: the suite is about which store, not about plans
    return {
      assertFeature: fallback("assertFeature", async () => undefined),
      assertWithin: fallback("assertWithin", async () => undefined),
      activeKillSwitches: fallback("activeKillSwitches", async () => []),
    };
  },
  "src/lib/jobs/scope.ts": (real) => ({
    // every store in the states, one by one, a failing store skipped (the job cursor and the budget are T1's)
    forEachStore: async (...args) => {
      try {
        return await real.forEachStore!(...args);
      } catch (e) {
        if (!stubError(e, "T1")) throw e;
        used("forEachStore");
        const [ctx, opts, fn] = args as [unknown, { states: readonly string[] }, (scope: StoreScope, store: StoreRow) => Promise<void>];
        const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
        const { getStoreById } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
        const [rows] = (await pool().query("SELECT id FROM stores WHERE status IN (?) ORDER BY id", [opts.states])) as unknown as [{ id: string }[]];
        let visited = 0;
        for (const { id } of rows) {
          const store = await getStoreById(id);
          if (!store) continue;
          visited++;
          try {
            await fn((real.systemScope as (c: unknown, id: string) => StoreScope)(ctx, id), store);
          } catch (err) {
            console.error(`[forEachStore adapter] store skipped: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        return { visited, done: true };
      }
    },
  }),
  "src/lib/tenancy/usage.ts": (real) => {
    const key = (owner: string, metric: unknown, period?: unknown) =>
      typeof metric === "object" && metric ? `${owner}|${(metric as { metric: string }).metric}|${(metric as { period: string }).period}` : `${owner}|${String(metric)}|${String(period)}`;
    const add = (k: string, delta: number) => {
      const v = Math.max(0, (usageCounters.get(k) ?? 0) + delta);
      usageCounters.set(k, v);
      return { value: v, limit: null };
    };
    const fallback =
      (name: string, impl: AnyFn): AnyFn =>
      async (...args) => {
        try {
          return await real[name]!(...args);
        } catch (e) {
          if (!stubError(e, "T1")) throw e;
          used(name);
          return impl(...args);
        }
      };
    return {
      chargeUsage: fallback("chargeUsage", (scope, metric, delta) => add(key((scope as { storeId: string }).storeId, metric), delta as number)),
      refundUsage: fallback("refundUsage", (scope, metric, delta) => add(key((scope as { storeId: string }).storeId, metric), -(delta as number))),
      chargePlatformUsage: fallback("chargePlatformUsage", (metric, period, delta) => add(key("platform", metric, period), delta as number)),
      refundPlatformUsage: fallback("refundPlatformUsage", (metric, period, delta) => add(key("platform", metric, period), -(delta as number))),
    };
  },
};
{
  const origLoad = M._load;
  const proxied = new Map<string, unknown>();
  M._load = function (request: string, parent: unknown, isMain: boolean) {
    const exp = origLoad.call(this, request, parent, isMain);
    if (!/settings|crypto|entitlements|usage|scope|^\.|^@\//.test(request)) return exp;
    let rel = "";
    try {
      rel = path.relative(ROOT, M._resolveFilename(request, parent, isMain)).split(path.sep).join("/");
    } catch {
      return exp;
    }
    const make = ADAPTERS[rel];
    if (!make) return exp;
    if (!proxied.has(rel)) {
      const real = exp as Record<string, AnyFn>;
      const over = make(real);
      proxied.set(rel, new Proxy(real, { get: (t, p) => (typeof p === "string" && p in over ? over[p] : Reflect.get(t, p)) }));
    }
    return proxied.get(rel);
  };
}

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
      const id = m ? decodeURIComponent(m[1]!) : "";
      const rows = fakeSheets.get(id);
      if (!rows) return json({ error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } }, 404);
      const rest = m?.[2] ?? "";
      if (method === "GET" && rest.startsWith("/values/")) {
        return json({ values: u.searchParams.get("majorDimension") === "COLUMNS" ? [rows.map((r) => r[0])] : rows });
      }
      if (method === "GET") return json({ spreadsheetId: id, properties: { title: "Orders" }, sheets: [{ properties: { sheetId: 0, title: "Commandes" } }] });
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
  pending: Map<string, string[]>; // stub → check names
  ms: number;
}
const tallies = new Map<string, Tally>();
let currentSuite = "setup";
const tally = (suite = currentSuite) => {
  let t = tallies.get(suite);
  if (!t) tallies.set(suite, (t = { pass: 0, fail: [], pending: new Map(), ms: 0 }));
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
/** A check that could not run: the code path ends in another track's typed stub. */
export function pending(name: string, reason: string): void {
  const t = tally();
  const list = t.pending.get(reason) ?? [];
  list.push(name);
  t.pending.set(reason, list);
  if (VERBOSE) console.log(`  … [${currentSuite}] ${name} · pending: ${reason}`);
}

/* ================================================================== */
/* 2. calls inside Next's request stores                              */
/* ================================================================== */

export type Who = { userId: string } | { sessionToken: string } | { anonymous: true };

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
  const [chunks] = (await p.query("SELECT c.`key`, c.idx, SHA2(c.data, 256) AS h FROM media_chunks c JOIN media_files f ON f.`key` = c.`key` WHERE f.store_id = ?", [storeId])) as unknown as [unknown[]];
  tables.media_chunks = digest(chunks);
  const [buckets] = (await p.query("SELECT bucket FROM rate_limits WHERE bucket LIKE ?", [`%${storeId}%`])) as unknown as [unknown[]];
  tables.rate_limits = digest(buckets);
  tables.usage = digest([...usageCounters].filter(([k]) => k.startsWith(`${storeId}|`)));
  return { hash: createHash("sha256").update(text(tables)).digest("hex"), tables };
}
export function snapshotDiff(a: { tables: Record<string, string> }, b: { tables: Record<string, string> }): string[] {
  return Object.keys({ ...a.tables, ...b.tables }).filter((k) => a.tables[k] !== b.tables[k]);
}

/* ================================================================== */
/* 5. the action catalogue                                             */
/* ================================================================== */

export type Area = "pages" | "versions" | "orders" | "leads" | "blocklist" | "media" | "exports" | "pixels" | "sheets" | "settings" | "search" | "generate" | "audit";

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
  /** the granted call ends in another track's store-less interim, refused or failing until the scoped form lands (named) */
  interim?: string;
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
  opts: { interim?: string; mixed?: ActionCase["mixed"] } = {},
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
    interim: "T3 (publishTrackingOnly, scoped overload: CCR r1.0-t4-11)",
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
  "src/app/admin/(auth)/login/actions.ts": "sign-in (T2): no store, no session yet",
  "src/app/admin/(auth)/login/verify/actions.ts": "two-step sign-in (T2): no store",
  "src/app/admin/(auth)/setup/actions.ts": "first-run bootstrap (T2): no store",
  "src/app/admin/(auth)/two-factor/actions.ts": "the account's own two-step setup (T2): no store",
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
      const real = await call({ userId: who.userId }, own, () => fn(...structuredClone(args)));
      const label = `${c.id} · ${who.label} · B's path, A's ids`;
      if (namesA) {
        const ghost = await call({ userId: who.userId }, own, () => fn(...structuredClone(ghostArgs)));
        if (real.stub || ghost.stub) pending(label, real.stub ?? ghost.stub!);
        else check(`${label}: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
      } else if (real.stub) pending(label, real.stub);
      const leaked = leaks(fx, [answerOf(real), real.revalidated], { sent: args });
      check(`${label}: no canary of A`, leaked.length === 0, leaked);
      check(`${label}: revalidates only B's screens`, real.revalidated.every((t) => !t.includes(`/app/${fx.A.handle}`)), real.revalidated);

      // 2. A's path: the neutral not_found, as for an unknown handle (the member of both is A's viewer: below)
      if (who.userId === fx.dual) continue;
      const onA = await call({ userId: who.userId }, appPath(fx.A.handle, c.path), () => fn(...structuredClone(args)));
      const onGhost = await call({ userId: who.userId }, appPath(fx.ghostHandle, c.path), () => fn(...structuredClone(args)));
      const la = `${c.id} · ${who.label} · A's path`;
      check(`${la}: not_found`, refusal(onA) === "not_found", answerOf(onA));
      check(`${la}: same answer as an unknown handle`, text(answerOf(onA)) === text(answerOf(onGhost)), { onA: answerOf(onA), onGhost: answerOf(onGhost) });
      check(`${la}: no canary of A`, leaks(fx, answerOf(onA), { sent: args }).length === 0, leaks(fx, answerOf(onA), { sent: args }));
    }
    // the member of both stores on A's path is A's viewer: a write is forbidden
    if (c.write) {
      const r = await call({ userId: fx.dual }, appPath(fx.A.handle, c.path), () => fn(...structuredClone(args)));
      const expect = c.permission.every((p) => can("viewer", p)) ? null : "forbidden";
      if (expect) check(`${c.id} · member of A and B · A's path (A's viewer): forbidden`, refusal(r) === expect, answerOf(r));
    }
    // B's own record with A's: what the same call with a missing id answers
    if (c.mixed) {
      const mixed = await c.mixed(fx, fresh);
      const real = await call({ userId: fx.B.members.owner }, appPath(fx.B.handle, c.path), () => fn(...structuredClone(mixed)));
      const ghost = await call({ userId: fx.B.members.owner }, appPath(fx.B.handle, c.path), () => fn(...ghostify(fx, structuredClone(mixed))));
      const label = `${c.id} · B owner · B's record with A's`;
      if (real.stub || ghost.stub) pending(label, real.stub ?? ghost.stub!);
      else check(`${label}: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
      check(`${label}: no canary of A`, leaks(fx, answerOf(real), { sent: mixed }).length === 0, leaks(fx, answerOf(real), { sent: mixed }));
    }
    const after = await snapshot(fx.A.id);
    check(`${c.id}: A's rows unchanged by every attempt`, after.hash === before.hash, snapshotDiff(before, after));

    // 3. the role matrix in B's own store: a role without the key is refused before the body
    for (const role of ROLES) {
      const allowed = c.permission.every((p) => can(role, p));
      const ownArgs = await c.own(fx, fresh);
      const r = await call({ userId: fx.B.members[role] }, appPath(fx.B.handle, c.path), () => fn(...ownArgs));
      const code = refusal(r);
      const label = `${c.id} · B ${role} · own store (${allowed ? "granted" : "not granted"})`;
      if (!allowed) check(`${label}: forbidden`, code === "forbidden", answerOf(r));
      else if (r.stub) pending(label, r.stub);
      else if (code === "server" && c.interim) pending(label, c.interim);
      // granted: the body runs (an answer of its own, never a refusal of the seam or a server error)
      else check(`${label}: reaches the body`, code !== "forbidden" && code !== "not_found" && code !== "threw" && code !== "server", answerOf(r));
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

/** Every route handler of the dashboard and the API (derived from src/app/api/** , src/app/app/** and src/app/s/**). */
export function deriveRoutes(): RouteFile[] {
  const out: RouteFile[] = [];
  for (const base of ["api", "app", "s"]) {
    for (const file of walk(path.join(ROOT, "src", "app", base), (f) => /[\\/]route\.(ts|tsx)$/.test(f))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const template = `/${rel.replace(/^src\/app\//, "").replace(/\/route\.tsx?$/, "")}`
        .split("/")
        .filter((seg) => !/^\(.*\)$/.test(seg))
        .join("/");
      const mod = load<Record<string, unknown>>(file);
      out.push({ file: rel, template, methods: METHODS.filter((m) => typeof mod[m] === "function") });
    }
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
    "GET /api/app/[store]/orders/export": { query: { page: A.page.live, q: A.customer.name } },
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
  return (/storeGuard\([^)]*?"([a-z_.]+)"/.exec(body)?.[1] as StorePermission | undefined) ?? null;
}

export async function routeSuite(kit: Kit): Promise<void> {
  const { fx } = kit;
  const { can } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  suite("routes");
  const routes = deriveRoutes();
  check("the route list is derived from the tree (api/app/** and app/** handlers found)", routes.some((r) => r.template.startsWith("/api/app/")) && routes.some((r) => r.template.startsWith("/app/")), routes.map((r) => r.template));
  for (const route of routes) {
    const tenant = route.template.includes("[store]") && !route.template.startsWith("/s/");
    for (const method of route.methods) {
      const plan = routePlan(fx, method, route.template);
      const before = await snapshot(fx.A.id);
      if (!tenant) {
        // public and cron routes: a member's session changes nothing and shows nothing of A (GET / HEAD only)
        if (method !== "GET" && method !== "HEAD") continue;
        for (const who of attackers(fx).slice(0, 1)) {
          const params: Record<string, string> = {};
          if (route.template.includes("[store]")) params.store = fx.A.handle;
          if (route.template.includes("[slug]")) params.slug = fx.A.slug;
          if (route.template.includes("[id]")) params.id = idFor(fx, route.template, fx.A);
          const r = await callRoute({ userId: who.userId }, route, method, params, plan);
          const leaked = leaks(fx, routeAnswer(r), { only: ["customer", "secret"] });
          check(`${method} ${route.template} · ${who.label}: no customer or secret canary of A`, leaked.length === 0, leaked);
          if (route.template === "/api/cron/tick") check(`${method} ${route.template} · ${who.label}: refused without the cron key`, r.ok && r.value!.status >= 400, routeAnswer(r));
        }
        continue;
      }
      for (const who of attackers(fx)) {
        const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.A) } : {};
        // 1. A's handle: the neutral 404 of an unknown handle
        if (who.userId !== fx.dual) {
          const onA = await callRoute({ userId: who.userId }, route, method, { store: fx.A.handle, ...ids }, plan, { photo: fx.A.photoBytes });
          const onGhost = await callRoute({ userId: who.userId }, route, method, { store: fx.ghostHandle, ...ids }, plan, { photo: fx.A.photoBytes });
          const la = `${method} ${route.template} · ${who.label} · A's handle`;
          const a = routeAnswer(onA);
          const g = JSON.parse(text(routeAnswer(onGhost)).split(fx.ghostHandle).join(fx.A.handle)) as unknown;
          if (onA.stub) pending(la, onA.stub);
          else {
            check(`${la}: same answer as an unknown handle`, text(a) === text(g), { onA: a, onGhost: g });
            check(`${la}: 404 (or the alias redirect)`, onA.ok && (onA.value!.status === 404 || (onA.value!.status === 307 && (onA.value!.location ?? "").includes(`/app/${fx.A.handle}/`))), a);
          }
          check(`${la}: no canary of A`, leaks(fx, a, { sent: plan }).length === 0, leaks(fx, a, { sent: plan }));
        }
        // 2. B's handle with A's ids: what a missing id answers
        if (plan.skipIds) continue;
        const real = await callRoute({ userId: who.userId }, route, method, { store: fx.B.handle, ...ids }, plan);
        const ghost = await callRoute({ userId: who.userId }, route, method, { store: fx.B.handle, ...ghostify(fx, ids) }, ghostify(fx, plan));
        const lb = `${method} ${route.template} · ${who.label} · B's handle, A's ids`;
        if (real.stub || ghost.stub) pending(lb, real.stub ?? ghost.stub!);
        else check(`${lb}: same answer as a missing id`, text(routeAnswer(real)) === text(unghost(fx, routeAnswer(ghost))), { real: routeAnswer(real), ghost: routeAnswer(ghost) });
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
      // the role matrix in B's own store: a role without the handler's key gets 403 before the body
      if (key && route.template.startsWith("/api/app/")) {
        for (const role of ROLES) {
          if (can(role, key)) continue;
          const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.B) } : {};
          const r = await callRoute({ userId: fx.B.members[role] }, route, method, { store: fx.B.handle, ...ids }, {}, { photo: fx.B.photoBytes });
          check(`${method} ${route.template} · B ${role} · own store: 403 without ${key}`, r.ok && r.value!.status === 403, routeAnswer(r));
        }
      }
    }
  }
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
  const mod = load<{ default: (p: unknown) => unknown }>(path.join(ROOT, page.file));
  let urlPath = page.template;
  for (const [k, v] of Object.entries(params)) urlPath = urlPath.replace(`[${k}]`, v);
  const o = await call(
    who,
    urlPath,
    async () => {
      const props = page.kind === "layout" ? { children: null, params: Promise.resolve(params) } : { params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) };
      return text(await renderTree(await mod.default(props)));
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
    "/app/[store]/orders": [{ page: A.page.live, q: A.customer.name }, { tab: "leads" }, { tab: "blocked" }],
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
    const perm = /permission: "([a-z_.]+)"/.exec(source)?.[1] as StorePermission | undefined;
    // a layout with no seam call reads no store data (the frame of a route group): it may render, empty of A
    const dataFree = page.kind === "layout" && !/requireStoreMember\(|memberCtx\(/.test(source);
    const name = `${page.template}${page.kind === "layout" ? " (layout)" : ""}`;
    const ids: Record<string, string> = page.template.includes("[id]") ? { id: fx.A.page.live } : {};
    // A's owner: the screen renders and carries A's data (the scan below is not blind)
    const mine = await renderPage({ userId: fx.A.members.owner }, page, { store: fx.A.handle, ...ids });
    const sees = ownerSees(fx, page.template);
    if (mine.kind === "error" && mine.stub) pending(`${name} · A's owner renders`, mine.stub);
    else check(`${name} · A's owner renders`, mine.kind === "render", mine);
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
        const granted = perm ? can(who.role, perm) : true;
        if (!granted) check(`${label}: 404 for a role without ${perm}`, r.kind === "notFound", r.kind);
        else if (r.kind === "render") check(`${label}: no canary of A`, leaks(fx, r.payload, { sent: [sp, ids] }).length === 0, leaks(fx, r.payload, { sent: [sp, ids] }));
        else if (r.kind === "error" && r.stub) pending(label, r.stub);
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
  if (real.stub || ghost.stub) return pending(label, real.stub ?? ghost.stub!);
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
  await same(fx, "auditPage(B)", () => SEC.auditPage(B, { limit: 100 }));
  await same(fx, "navCounts(B)", () => D.navCounts(B));
  await same(fx, "getSheetHealth(B)", () => D.getSheetHealth(B));
  await same(fx, "getDashboard(B)", () => D.getDashboard(B, fx.rows.B, { totpEnabled: false }));
  // team (T2's repositories)
  await same(fx, "listMembersByScope(B)", () => INV.listMembersByScope(B));
  await same(fx, "listInvitesByScope(B)", () => INV.listInvitesByScope(B));
  // preview tokens (T3): A's page from B's scope
  const minted = await call({ anonymous: true }, "/", () => PT.mintPreviewToken(B, { pageId: fx.A.page.live, ttlSec: 3600, audience: "seller" }));
  if (minted.stub) pending("mintPreviewToken(B, A's page) → not_found", minted.stub);
  else check("mintPreviewToken(B, A's page) → not_found", !minted.ok && /not_found/.test(text(answerOf(minted))), answerOf(minted));

  const after = await snapshot(fx.A.id);
  check("A's rows unchanged by every repository attempt", after.hash === before.hash, snapshotDiff(before, after));

  // impersonation scope of A (D70): the customer fields are masked in every read
  const imp = scopeOf(fx.A.id, "impersonation");
  const masked = async (label: string, fn: () => Promise<unknown>) => {
    const o = await call({ anonymous: true }, "/", fn);
    if (o.stub) return pending(label, o.stub);
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
  if (tick.stub) pending("cron tick: each store's orders reach its own sheet", tick.stub);
  else {
    check("cron tick with the key: 200", tick.ok && tick.value!.status === 200, routeAnswer(tick));
    check("cron tick: A's queued order went to A's sheet, B's to B's", text(toA).includes(queuedA) && text(toB).includes(queuedB), { toA: toA.length, toB: toB.length });
    check("cron tick: no order of one store in the other's sheet", !text(toA).includes(queuedB) && !text(toB).includes(queuedA) && !text(toB).includes(fx.A.customer.name), { toA: toA.map((n) => n.url), toB: toB.map((n) => n.url) });
    check("cron tick: no write to any other spreadsheet", writes.every((n) => n.url.includes(fx.A.spreadsheetId) || n.url.includes(fx.B.spreadsheetId)), writes.map((n) => n.url));
  }

  // B connecting A's spreadsheet: a proof code, nothing about the sheet, A untouched
  const connect = await callRoute(ownerB, route("/api/app/[store]/sheets/connect"), "POST", { store: fx.B.handle }, { body: { url: `https://docs.google.com/spreadsheets/d/${fx.A.spreadsheetId}/edit` } });
  check("B pasting A's sheet link gets a proof code, not a connection", connect.ok && connect.value!.status === 200 && /"proof"/.test(connect.value!.body), routeAnswer(connect));
  const verify = await callRoute(ownerB, route("/api/app/[store]/sheets/verify"), "POST", { store: fx.B.handle }, {});
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
  if (up.stub) pending("identical image uploaded in B", up.stub);
  else {
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
  const hostOk = await call(ownerA, appPath(fx.A.handle, "/orders"), () => getOrder(fx.A.order.main), { identityHeaders: { host: PLATFORM_HOST } });
  const hostBad = await call(ownerA, appPath(fx.A.handle, "/orders"), () => getOrder(fx.A.order.main), { identityHeaders: { host: "atlas-argan.shop.example" } });
  check("A's owner on the platform host: the order", refusal(hostOk) === null, answerOf(hostOk));
  check("A's owner posting the same action on another host: not_found", refusal(hostBad) === "not_found", answerOf(hostBad));

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
    if (rev.stub) pending("revokeInvite(B, A's invite) → not found", rev.stub);
    else {
      const [inv] = await db.select({ revoked: S.storeInvites.revokedAt }).from(S.storeInvites).where(and(eq(S.storeInvites.id, fx.A.invite), eq(S.storeInvites.storeId, fx.A.id)));
      check("revokeInvite(B, A's invite): refused, A's invite still open", !rev.ok && inv?.revoked === null, answerOf(rev));
    }
    const list = await call(ownerB, appPath(fx.B.handle, "/team"), () => INV.listInvites(ctxB.value!));
    if (list.stub) pending("listInvites(B): nothing of A", list.stub);
    else check("listInvites(B): nothing of A", list.ok && leaks(fx, list.value).length === 0, leaks(fx, list.value));
  }
  const preview2 = await call({ anonymous: true }, "/", () => INV.previewInvite("SG-NOTATOKEN0000"));
  if (preview2.stub) pending("previewInvite(unknown token) → null", preview2.stub);
  else check("previewInvite(unknown token) → null (no enumeration)", preview2.ok && preview2.value === null, answerOf(preview2));
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

/** A staff session viewing `store` through T2's seam, or the stub that blocks it. */
export async function impersonate(fx: Fixtures, store: StoreFx): Promise<{ token: string } | { stub: string }> {
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
  if (r.stub) return { stub: r.stub };
  if (!r.ok) return { stub: `impersonation failed: ${text(answerOf(r)).slice(0, 120)}` };
  return { token };
}

export async function impersonationSuite(kit: Kit): Promise<void> {
  const { fx, fresh } = kit;
  suite("impersonation");
  const onA = await impersonate(fx, fx.A);
  if ("stub" in onA) {
    for (const c of ACTION_CASES) pending(`${c.id} · staff viewing A`, onA.stub);
    for (const p of derivePages()) pending(`${p.template} · staff viewing A: no customer canary`, onA.stub);
    return;
  }
  const who = { sessionToken: onA.token };
  const before = await snapshot(fx.A.id);
  for (const c of ACTION_CASES) {
    const args = await c.victim(fx, fresh);
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
      if (r.kind === "render") check(`${label}: no customer canary in the payload`, leaks(fx, r.payload, { only: ["customer", "secret"] }).length === 0, leaks(fx, r.payload, { only: ["customer", "secret"] }));
      else if (r.kind === "error" && r.stub) pending(label, r.stub);
      else check(`${label}: renders or 404`, r.kind === "notFound", r);
    }
  }
  for (const route of deriveRoutes().filter((r) => r.template.includes("[store]") && r.methods.includes("GET"))) {
    const ids: Record<string, string> = route.template.includes("[id]") ? { id: idFor(fx, route.template, fx.A) } : {};
    const r = await callRoute(who, route, "GET", { store: fx.A.handle, ...ids }, routePlan(fx, "GET", route.template));
    check(`GET ${route.template} · staff viewing A: no customer or secret canary`, leaks(fx, routeAnswer(r), { only: ["customer", "secret"] }).length === 0, leaks(fx, routeAnswer(r), { only: ["customer", "secret"] }));
  }
  check("A's rows unchanged while staff viewed A", (await snapshot(fx.A.id)).hash === before.hash);
  // staff viewing B, with A's ids: what a missing id answers
  const onB = await impersonate(fx, fx.B);
  if ("stub" in onB) return;
  for (const c of ACTION_CASES.filter((x) => !x.write)) {
    const args = await c.victim(fx, fresh);
    const real = await call({ sessionToken: onB.token }, appPath(fx.B.handle, c.path), () => actionFn(c)(...args));
    const ghost = await call({ sessionToken: onB.token }, appPath(fx.B.handle, c.path), () => actionFn(c)(...ghostify(fx, args)));
    check(`${c.id} · staff viewing B, A's ids: same answer as a missing id`, text(answerOf(real)) === text(unghost(fx, answerOf(ghost))), { real: answerOf(real), ghost: answerOf(ghost) });
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
  pending: typeof pending;
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
    pending,
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
  let pend = 0;
  console.log(`\n${title}`);
  for (const [name, t] of tallies) {
    const p = [...t.pending.values()].reduce((n, l) => n + l.length, 0);
    pass += t.pass;
    fail += t.fail.length;
    pend += p;
    console.log(`  ${t.fail.length ? "✗" : "✓"} ${name}: ${t.pass} passed${t.fail.length ? `, ${t.fail.length} FAILED` : ""}${p ? `, ${p} pending` : ""} (${Math.round(t.ms / 1000)} s)`);
  }
  const blockers = new Map<string, number>();
  for (const t of tallies.values()) for (const [why, list] of t.pending) blockers.set(why, (blockers.get(why) ?? 0) + list.length);
  if (blockers.size) {
    console.log("  pending (the code path ends in another track's typed stub; real checks once it is implemented):");
    for (const [why, n] of [...blockers].sort((a, b) => b[1] - a[1])) console.log(`    · ${why}: ${n}`);
  }
  if (adapterUse.size) console.log(`  T1 adapter answered: ${[...adapterUse].map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  for (const line of extra) console.log(`  ${line}`);
  if (fail) {
    console.log("\nFAILURES");
    for (const [name, t] of tallies) for (const f of t.fail) console.log(`  ✗ [${name}] ${f}`);
  }
  console.log(`\n${fail ? "✗" : "✓"} ${title}: ${pass} passed, ${fail} failed, ${pend} pending`);
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
    await impersonationSuite(kit);
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
