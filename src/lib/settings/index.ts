/**
 * Settings with typed accessors (docs/STORE-SAAS.md §D.10, TN-04).
 *  - every key is validated by its zod schema on write and on read (bad rows fall back to defaults)
 *  - store keys live in `store_settings` behind a StoreScope (./store-registry.ts), platform keys in `settings`
 *    (./platform-registry.ts); secret keys are sealed with envelope v2 (§F.3) bound to the store and the key
 *  - one process cache per (store, key), 30 s TTL, invalidated on write by this process and by invalidateStore
 *
 *   const store = await getStoreSetting(ctx.scope, "store");
 *   await updateStoreSetting(ctx.scope, "turnstile", { siteKey }, { id: ctx.user.id, ip: ctx.actor.ip });
 *
 * Today's single-tenant getSetting / setSetting / updateSetting (rows in `settings`, v1 envelopes) keep working for
 * their callers until T3 / T4 move them; they are deleted in R1.0 and lint L3 forbids them afterwards.
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { settings, storeSettings } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { decrypt, encrypt, open, openLegacy, seal } from "@/lib/security/crypto";
import { scopedCache } from "@/lib/tenancy/cache";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { PLATFORM_SETTINGS, isPlatformSettingKey, platformSettingSchema, type PlatformSettingInput, type PlatformSettingKey, type PlatformSettingValue } from "./platform-registry";
import { SETTINGS, isMaskedSecret, settingSchema, type SettingInput, type SettingKey, type SettingValue } from "./schemas";
import { STORE_SETTINGS, isStoreSettingKey, storeSettingSchema, type StoreSettingInput, type StoreSettingKey, type StoreSettingValue } from "./store-registry";

export * from "./schemas";
export type { PlatformSettingInput, PlatformSettingKey, PlatformSettingValue } from "./platform-registry";
export type { StoreSettingInput, StoreSettingKey, StoreSettingValue } from "./store-registry";

const TTL_MS = 30_000;

interface CacheEntry {
  value: unknown;
  expires: number;
}

declare global {
  var __codSettingsCache: Map<SettingKey, CacheEntry> | undefined;
}

const cache = () => (globalThis.__codSettingsCache ??= new Map<SettingKey, CacheEntry>());
const purpose = (key: SettingKey) => `settings:${key}`;

interface Row {
  key: string;
  value: unknown;
  encrypted: boolean;
}

function defaultsFor<K extends SettingKey>(key: K): SettingValue<K> {
  const schema = settingSchema(key);
  const parsed = schema.safeParse(SETTINGS[key].defaults());
  if (parsed.success) return parsed.data;
  console.error(`[settings] defaults for "${key}" are invalid (check related env vars); using empty defaults`);
  return schema.parse({});
}

function decode<K extends SettingKey>(key: K, row: Row | undefined): SettingValue<K> {
  if (!row) return defaultsFor(key);
  const schema = settingSchema(key);
  let raw: unknown;
  try {
    raw = row.encrypted ? JSON.parse(decrypt(String(row.value), purpose(key))) : row.value;
  } catch (err) {
    // JSON.parse quotes the text it choked on — here the decrypted secret — so its message is never logged
    console.error(`[settings] cannot read "${key}" (${err instanceof SyntaxError ? "stored value is not valid JSON" : errorSummary(err)}); using defaults`);
    return defaultsFor(key);
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.error(`[settings] stored "${key}" failed validation; using defaults`);
  return defaultsFor(key);
}

function remember(key: SettingKey, value: unknown) {
  cache().set(key, { value, expires: Date.now() + TTL_MS });
}

function cached<K extends SettingKey>(key: K): SettingValue<K> | undefined {
  const hit = cache().get(key);
  if (!hit || hit.expires <= Date.now()) return undefined;
  return structuredClone(hit.value) as SettingValue<K>;
}

async function load<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const value = decode(key, rows[0]);
  remember(key, value);
  return structuredClone(value);
}

export async function getSetting<K extends SettingKey>(key: K, opts: { fresh?: boolean } = {}): Promise<SettingValue<K>> {
  return readLegacy(key, opts);
}

/* the legacy API's bodies, shared by its four exports (removed together with them, §D.10) */
async function readLegacy<K extends SettingKey>(key: K, opts: { fresh?: boolean } = {}): Promise<SettingValue<K>> {
  if (!opts.fresh) {
    const hit = cached(key);
    if (hit !== undefined) return hit;
  }
  return load(key);
}

/** Several keys in one query. */
export async function getSettings<K extends SettingKey>(keys: readonly K[]): Promise<{ [P in K]: SettingValue<P> }> {
  const out = {} as { [P in K]: SettingValue<P> };
  const missing: K[] = [];
  for (const key of keys) {
    const hit = cached(key);
    if (hit !== undefined) out[key] = hit;
    else missing.push(key);
  }
  if (missing.length) {
    const rows = await db.select().from(settings).where(inArray(settings.key, missing));
    for (const key of missing) {
      const value = decode(key, rows.find((r) => r.key === key));
      remember(key, value);
      out[key] = structuredClone(value);
    }
  }
  return out;
}

/** Validates without saving (for form feedback). */
export function parseSettingInput<K extends SettingKey>(key: K, input: unknown) {
  return settingSchema(key).safeParse(input);
}

export interface SettingsActor {
  id: string;
  ip?: string | null;
  /** audited actor kind; default "user" for a member scope, "system" for a system or public one */
  kind?: Actor["kind"];
}

/** Replaces the whole value of a key. Throws ZodError when invalid. */
export async function setSetting<K extends SettingKey>(
  key: K,
  input: SettingInput<K>,
  actor?: SettingsActor,
): Promise<SettingValue<K>> {
  return writeLegacy(key, input, actor);
}

async function writeLegacy<K extends SettingKey>(key: K, input: SettingInput<K>, actor?: SettingsActor): Promise<SettingValue<K>> {
  const def = SETTINGS[key];
  const value = settingSchema(key).parse(input);
  const stored: unknown = def.secret ? encrypt(JSON.stringify(value), purpose(key)) : value;
  const updatedAt = new Date();
  await db
    .insert(settings)
    .values({ key, value: stored, encrypted: def.secret, updatedAt })
    .onDuplicateKeyUpdate({ set: { value: stored, encrypted: def.secret, updatedAt } });
  invalidateSettings(key);
  await audit("settings.updated", {
    userId: actor?.id ?? null,
    target: key,
    meta: { fields: Object.keys(value as Record<string, unknown>) },
    ip: actor?.ip,
  });
  return structuredClone(value);
}

/**
 * Shallow-merges a partial update into the stored value. Sensitive fields submitted as the
 * redacted mask (unchanged in the form) keep their stored secret. Throws ZodError when invalid.
 */
export async function updateSetting<K extends SettingKey>(
  key: K,
  patch: Partial<SettingInput<K>>,
  actor?: SettingsActor,
): Promise<SettingValue<K>> {
  const current = (await readLegacy(key, { fresh: true })) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };
  for (const [field, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined || isMaskedSecret(value)) continue;
    merged[field] = value;
  }
  return writeLegacy(key, merged as SettingInput<K>, actor);
}

export function invalidateSettings(key?: SettingKey): void {
  if (key) cache().delete(key);
  else cache().clear();
}

/* ------------------------------------------------------------------ */
/* Multi-tenant API (§D.10)                                            */
/* ------------------------------------------------------------------ */
/*
 * Store keys live in `store_settings` (PK store_id + key) and are reached only through a StoreScope; platform keys
 * live in `settings` and are read by anyone but written only from platform code. One process cache, the
 * ScopedCache "settings" (§E.6): entries under (storeId, key), platform rows under the store id "p", 30 s TTL (another
 * process may have written), at most 4,000 entries, single flight per key. `invalidateStore(storeId)` drops a store's
 * keys with every other cache. Secret keys are sealed whole with envelope v2 (§F.3): scope `store:<storeId>` or
 * `platform`, purpose `settings:<key>`. A legacy store row (`purpose_v = 0`, the v1 envelope the 0004 conversion
 * copied) opens with openLegacy until the boot task re-seals it (ENGC-19). Values are validated on read (a bad row
 * falls back to the defaults, logged without the value) and on write (ZodError).
 */

/** The staff member writing a platform key (audited with actor kind "platform"; a boot task passes "system"). */
export interface PlatformActor {
  id: string;
  ip?: string | null;
  kind?: "platform" | "system";
}

const PLATFORM = "p";
const settingsCache = scopedCache<unknown>({ name: "settings", maxEntries: 4_000, ttlMs: TTL_MS });
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const sealPurpose = (key: string) => `settings:${key}`;
const userIdOf = (id: string | undefined) => (id && ULID_RE.test(id) ? id : null);

function assertStoreKey(key: unknown): asserts key is StoreSettingKey {
  if (!isStoreSettingKey(key)) throw new Error(`settings: "${String(key)}" is not a store setting`);
}

function assertPlatformKey(key: unknown): asserts key is PlatformSettingKey {
  if (!isPlatformSettingKey(key)) throw new Error(`settings: "${String(key)}" is not a platform setting`);
}

type Parser<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false } };

function fallback<T>(label: string, schema: Parser<T>, defaults: () => unknown): T {
  const parsed = schema.safeParse(defaults());
  if (parsed.success) return parsed.data;
  console.error(`[settings] defaults for "${label}" are invalid; using empty defaults`);
  const empty = schema.safeParse({});
  if (empty.success) return empty.data;
  throw new Error(`settings: "${label}" has no valid defaults`);
}

const storeDefaults = <K extends StoreSettingKey>(key: K): StoreSettingValue<K> => fallback(key, storeSettingSchema(key), STORE_SETTINGS[key].defaults);
const platformDefaults = <K extends PlatformSettingKey>(key: K): PlatformSettingValue<K> =>
  fallback(key, platformSettingSchema(key), PLATFORM_SETTINGS[key].defaults);

interface StoredRow {
  value: unknown;
  encrypted: boolean;
  /** store rows only: 0 = legacy v1 envelope, 2 = envelope v2 */
  purposeV?: number;
}

/** Parse one stored value; anything unreadable logs its reason (never the value) and answers null. */
function readRow(label: string, row: StoredRow, unseal: (envelope: string) => string): { raw: unknown } | null {
  if (!row.encrypted) return { raw: row.value };
  try {
    return { raw: JSON.parse(unseal(String(row.value))) };
  } catch (err) {
    // JSON.parse quotes the text it choked on (here the decrypted secret), so its message is never logged
    console.error(`[settings] cannot read "${label}" (${err instanceof SyntaxError ? "stored value is not valid JSON" : errorSummary(err)}); using defaults`);
    return null;
  }
}

/**
 * A stored row that exists but does not open (a wrong APP_SECRET, a damaged envelope): updateStoreSetting refuses to
 * merge into the defaults and overwrite it, since the row may still be recoverable (the conversion keeps a v1 row that
 * does not open for the same reason). Answered as `server` by actionFailure; the message never holds the value.
 */
export class SettingUnreadableError extends Error {
  constructor(readonly key: string) {
    super(`settings: the stored "${key}" cannot be read; not overwritten`);
    this.name = "SettingUnreadableError";
  }
}

/** One stored row decoded: `absent` (no row), `unreadable` (a row that does not open), else `ok` (valid or defaults). */
function readStoreRow<K extends StoreSettingKey>(storeId: string, key: K, row: StoredRow | undefined): { state: "absent" | "unreadable" | "ok"; value: StoreSettingValue<K> } {
  if (!row) return { state: "absent", value: storeDefaults(key) };
  const read = readRow(`${storeId}:${key}`, row, (envelope) =>
    row.purposeV === 0 ? openLegacy(envelope, sealPurpose(key)) : open(envelope, { store: storeId }, sealPurpose(key)),
  );
  if (!read) return { state: "unreadable", value: storeDefaults(key) };
  const parsed = storeSettingSchema(key).safeParse(read.raw);
  if (parsed.success) return { state: "ok", value: parsed.data };
  console.error(`[settings] stored "${storeId}:${key}" failed validation; using defaults`);
  return { state: "ok", value: storeDefaults(key) };
}

function decodeStore<K extends StoreSettingKey>(storeId: string, key: K, row: StoredRow | undefined): StoreSettingValue<K> {
  return readStoreRow(storeId, key, row).value;
}

function decodePlatform<K extends PlatformSettingKey>(key: K, row: StoredRow | undefined): PlatformSettingValue<K> {
  if (!row) return platformDefaults(key);
  const read = readRow(`${PLATFORM}:${key}`, row, (envelope) => open(envelope, "platform", sealPurpose(key)));
  if (!read) return platformDefaults(key);
  const parsed = platformSettingSchema(key).safeParse(read.raw);
  if (parsed.success) return parsed.data;
  console.error(`[settings] stored "${PLATFORM}:${key}" failed validation; using defaults`);
  return platformDefaults(key);
}

const storeRowColumns = { key: storeSettings.key, value: storeSettings.value, encrypted: storeSettings.encrypted, purposeV: storeSettings.purposeV };

async function loadStoreRows(scope: StoreScope, keys: readonly StoreSettingKey[]): Promise<Map<string, StoredRow>> {
  const rows = await db
    .select(storeRowColumns)
    .from(storeSettings)
    .where(whereStore(storeSettings, scope, keys.length === 1 ? eq(storeSettings.key, keys[0]!) : inArray(storeSettings.key, [...keys])));
  return new Map(rows.map((r) => [r.key, r]));
}

/**
 * A store key, validated (a bad row falls back to the defaults); cached 30 s under `${storeId}:${key}`. Secret keys
 * open with envelope v2 (scope store:<storeId>, purpose settings:<key>), legacy `purpose_v = 0` rows with openLegacy.
 */
export async function getStoreSetting<K extends StoreSettingKey>(scope: StoreScope, key: K, opts: { fresh?: boolean } = {}): Promise<StoreSettingValue<K>> {
  assertStoreKey(key);
  const storeId = scope.storeId;
  const load = async () => decodeStore(storeId, key, (await loadStoreRows(scope, [key])).get(key));
  if (opts.fresh) {
    const value = await load();
    settingsCache.set(storeId, key, value);
    return structuredClone(value);
  }
  return structuredClone((await settingsCache.getOrLoad(storeId, key, load)) as StoreSettingValue<K>);
}

/** Several store keys in one query (cached keys are not read again). */
export async function getStoreSettings<K extends StoreSettingKey>(scope: StoreScope, keys: readonly K[]): Promise<{ [P in K]: StoreSettingValue<P> }> {
  const unique = [...new Set(keys)];
  unique.forEach(assertStoreKey);
  const storeId = scope.storeId;
  const missing = new Set(unique.filter((key) => settingsCache.get(storeId, key) === undefined));
  // one query for every miss, shared by the per-key single-flight loads below
  let batch: Promise<Map<string, StoredRow>> | null = null;
  const rows = () => (batch ??= loadStoreRows(scope, [...missing]));
  const values = await Promise.all(
    unique.map((key) =>
      settingsCache.getOrLoad(storeId, key, async () =>
        // a key that was cached a moment ago but expired (or was invalidated) since is not in the batch: read it alone
        decodeStore(storeId, key, (missing.has(key) ? await rows() : await loadStoreRows(scope, [key])).get(key)),
      ),
    ),
  );
  const out = {} as Record<K, unknown>;
  unique.forEach((key, i) => {
    out[key] = structuredClone(values[i]);
  });
  return out as { [P in K]: StoreSettingValue<P> };
}

/** Validates a store key without saving (for form feedback). */
export function parseStoreSettingInput<K extends StoreSettingKey>(key: K, input: unknown) {
  assertStoreKey(key);
  return storeSettingSchema(key).safeParse(input);
}

type Executor = Pick<typeof db, "insert">;

/** Validate, seal when secret, upsert. Returns the stored (parsed) value. */
async function writeStoreRow<K extends StoreSettingKey>(exec: Executor, scope: WriteScope, key: K, input: unknown, actor: SettingsActor): Promise<StoreSettingValue<K>> {
  const value = storeSettingSchema(key).parse(input);
  const secret = STORE_SETTINGS[key].secret;
  const stored: unknown = secret ? seal(JSON.stringify(value), { store: scope.storeId }, sealPurpose(key)) : value;
  const set = { value: stored, encrypted: secret, purposeV: 2, updatedBy: userIdOf(actor.id), updatedAt: new Date() };
  await exec
    .insert(storeSettings)
    .values(storeValues(scope, { key, ...set }))
    .onDuplicateKeyUpdate({ set });
  return value;
}

const fieldNames = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : []);

async function afterStoreWrite(scope: WriteScope, key: StoreSettingKey, value: unknown, actor: SettingsActor): Promise<void> {
  invalidateStoreSettings(scope.storeId, key);
  await audit("store.settings.updated", {
    userId: userIdOf(actor.id),
    target: key,
    meta: { key, fields: fieldNames(value) },
    ip: actor.ip,
    scope: { storeId: scope.storeId, actorKind: actor.kind ?? (scope.kind === "member" ? "user" : "system") },
  });
}

/** Replaces a store key; audit `store.settings.updated` with the store id. Throws ZodError when invalid. */
export async function setStoreSetting<K extends StoreSettingKey>(scope: WriteScope, key: K, input: StoreSettingInput<K>, actor: SettingsActor): Promise<StoreSettingValue<K>> {
  assertStoreKey(key);
  const value = await writeStoreRow(db, scope, key, input, actor);
  await afterStoreWrite(scope, key, value, actor);
  return structuredClone(value);
}

function isDeadlock(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const { code, errno, cause } = e as { code?: unknown; errno?: unknown; cause?: unknown };
    if (code === "ER_LOCK_DEADLOCK" || errno === 1213) return true;
    e = cause;
  }
  return false;
}

/**
 * Shallow merge into the stored value; a sensitive field submitted as the mask keeps its stored secret. The read and
 * the write share one transaction holding the row lock, so two concurrent patches of one key (pixel health from
 * parallel orders, two tabs) never lose each other's fields. Throws ZodError when the merge is invalid, and
 * SettingUnreadableError (nothing written) when the stored row exists but does not open. `patch` may be a function of
 * the current value, called under the row lock (the conversion merges nested maps with it).
 */
export async function updateStoreSetting<K extends StoreSettingKey>(
  scope: WriteScope,
  key: K,
  patch: Partial<StoreSettingInput<K>> | ((current: StoreSettingValue<K>) => Partial<StoreSettingInput<K>>),
  actor: SettingsActor,
): Promise<StoreSettingValue<K>> {
  assertStoreKey(key);
  for (let attempt = 1; ; attempt++) {
    try {
      const value = await db.transaction(async (tx) => {
        const [row] = await tx
          .select(storeRowColumns)
          .from(storeSettings)
          .where(whereStore(storeSettings, scope, eq(storeSettings.key, key)))
          .for("update");
        const current = readStoreRow(scope.storeId, key, row);
        // merging a patch into the defaults would replace a stored secret the patch left masked
        if (current.state === "unreadable") throw new SettingUnreadableError(key);
        const merged: Record<string, unknown> = { ...(current.value as Record<string, unknown>) };
        const fields = typeof patch === "function" ? patch(structuredClone(current.value)) : patch;
        for (const [field, v] of Object.entries(fields as Record<string, unknown>)) {
          if (v === undefined || isMaskedSecret(v)) continue;
          merged[field] = v;
        }
        return writeStoreRow(tx, scope, key, merged, actor);
      });
      await afterStoreWrite(scope, key, value, actor);
      return structuredClone(value);
    } catch (err) {
      // two first-time patches of one missing row can deadlock on the gap lock: InnoDB rolls one back, run it again
      if (attempt < 3 && isDeadlock(err)) continue;
      throw err;
    }
  }
}

/** Drops one key or every key of a store from this process's cache (invalidateStore does it with every cache). */
export function invalidateStoreSettings(storeId: string, key?: StoreSettingKey): void {
  settingsCache.delete(storeId, key);
}

/** Drops one platform key (or every one) from this process's cache. */
export function invalidatePlatformSettings(key?: PlatformSettingKey): void {
  settingsCache.delete(PLATFORM, key);
}

async function loadPlatformRow<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> {
  const [row] = await db.select({ value: settings.value, encrypted: settings.encrypted }).from(settings).where(eq(settings.key, key)).limit(1);
  return decodePlatform(key, row);
}

/** A platform key, cached 30 s under `p:${key}`; secrets with envelope v2 scope `platform`. */
export async function getPlatformSetting<K extends PlatformSettingKey>(key: K, opts: { fresh?: boolean } = {}): Promise<PlatformSettingValue<K>> {
  assertPlatformKey(key);
  if (opts.fresh) {
    const value = await loadPlatformRow(key);
    settingsCache.set(PLATFORM, key, value);
    return structuredClone(value);
  }
  return structuredClone((await settingsCache.getOrLoad(PLATFORM, key, () => loadPlatformRow(key))) as PlatformSettingValue<K>);
}

/** Validates a platform key without saving (for console form feedback). */
export function parsePlatformSettingInput<K extends PlatformSettingKey>(key: K, input: unknown) {
  assertPlatformKey(key);
  return platformSettingSchema(key).safeParse(input);
}

/** Platform code only (a platformAction, or a boot task with kind "system"); audit `platform.settings.updated`. */
export async function setPlatformSetting<K extends PlatformSettingKey>(key: K, input: PlatformSettingInput<K>, actor: PlatformActor): Promise<PlatformSettingValue<K>> {
  assertPlatformKey(key);
  const value = platformSettingSchema(key).parse(input);
  const secret = PLATFORM_SETTINGS[key].secret;
  const stored: unknown = secret ? seal(JSON.stringify(value), "platform", sealPurpose(key)) : value;
  const updatedAt = new Date();
  await db
    .insert(settings)
    .values({ key, value: stored, encrypted: secret, updatedAt })
    .onDuplicateKeyUpdate({ set: { value: stored, encrypted: secret, updatedAt } });
  invalidatePlatformSettings(key);
  await audit("platform.settings.updated", {
    userId: userIdOf(actor.id),
    target: key,
    meta: { key, fields: fieldNames(value) },
    ip: actor.ip,
    scope: { storeId: null, actorKind: actor.kind ?? "platform" },
  });
  return structuredClone(value);
}
