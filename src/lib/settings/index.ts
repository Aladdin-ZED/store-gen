/**
 * Settings store (MariaDB `settings` table) with typed accessors.
 *  - every key is validated by its zod schema on write and on read (bad rows fall back to defaults)
 *  - secret keys are stored as AES-GCM envelopes bound to the key (purpose "settings:<key>")
 *  - small in-process cache (30 s TTL), invalidated on write by this process
 *
 *   const store = await getSetting("store");
 *   await updateSetting("ai", { tier: "full" }, { id: user.id, ip });
 *
 * Multi-tenant API (docs/STORE-SAAS.md §D.10): store keys in `store_settings` through a StoreScope, platform keys in
 * `settings`; the registries are ./store-registry.ts and ./platform-registry.ts. Signatures frozen at C0a, bodies
 * T1's (§K.1): until T1 merges they throw "not implemented: T1", and today's single-tenant getSetting / setSetting /
 * updateSetting below keep working for their callers (deleted in R1.0; lint L3 forbids them afterwards).
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { decrypt, encrypt } from "@/lib/security/crypto";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { PlatformSettingInput, PlatformSettingKey, PlatformSettingValue } from "./platform-registry";
import { SETTINGS, isMaskedSecret, settingSchema, type SettingInput, type SettingKey, type SettingValue } from "./schemas";
import type { StoreSettingInput, StoreSettingKey, StoreSettingValue } from "./store-registry";

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
}

/** Replaces the whole value of a key. Throws ZodError when invalid. */
export async function setSetting<K extends SettingKey>(
  key: K,
  input: SettingInput<K>,
  actor?: SettingsActor,
): Promise<SettingValue<K>> {
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
  const current = (await getSetting(key, { fresh: true })) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };
  for (const [field, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined || isMaskedSecret(value)) continue;
    merged[field] = value;
  }
  return setSetting(key, merged as SettingInput<K>, actor);
}

export function invalidateSettings(key?: SettingKey): void {
  if (key) cache().delete(key);
  else cache().clear();
}

/* ------------------------------------------------------------------ */
/* Multi-tenant API (§D.10): typed stubs until T1 merges               */
/* ------------------------------------------------------------------ */

/** The staff member writing a platform key (audited with actor kind "platform"). */
export interface PlatformActor {
  id: string;
  ip?: string | null;
}

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T1 (${fn})`);
}

/**
 * A store key, validated (a bad row falls back to the defaults); cached 30 s under `${storeId}:${key}`. Secret keys
 * open with envelope v2 (scope store:<storeId>, purpose settings:<key>), legacy `purpose_v = 0` rows with openLegacy.
 */
export async function getStoreSetting<K extends StoreSettingKey>(scope: StoreScope, key: K, opts?: { fresh?: boolean }): Promise<StoreSettingValue<K>> {
  return notImplemented("getStoreSetting", scope, key, opts);
}

/** Several store keys in one query. */
export async function getStoreSettings<K extends StoreSettingKey>(scope: StoreScope, keys: readonly K[]): Promise<{ [P in K]: StoreSettingValue<P> }> {
  return notImplemented("getStoreSettings", scope, keys);
}

/** Replaces a store key; audit `store.settings.updated` with the store id. Throws ZodError when invalid. */
export async function setStoreSetting<K extends StoreSettingKey>(scope: WriteScope, key: K, input: StoreSettingInput<K>, actor: SettingsActor): Promise<StoreSettingValue<K>> {
  return notImplemented("setStoreSetting", scope, key, input, actor);
}

/** Shallow merge; a sensitive field submitted as the mask keeps its stored secret. */
export async function updateStoreSetting<K extends StoreSettingKey>(scope: WriteScope, key: K, patch: Partial<StoreSettingInput<K>>, actor: SettingsActor): Promise<StoreSettingValue<K>> {
  return notImplemented("updateStoreSetting", scope, key, patch, actor);
}

/** Drops one key or every key of a store from this process's cache (invalidateStore calls it). No-op until T1 caches. */
export function invalidateStoreSettings(storeId: string, key?: StoreSettingKey): void {
  void storeId;
  void key;
}

/** A platform key, cached 30 s under `p:${key}`; secrets with envelope v2 scope `platform`. */
export async function getPlatformSetting<K extends PlatformSettingKey>(key: K, opts?: { fresh?: boolean }): Promise<PlatformSettingValue<K>> {
  return notImplemented("getPlatformSetting", key, opts);
}

/** Platform code only (a platformAction); audit `platform.settings.updated`. */
export async function setPlatformSetting<K extends PlatformSettingKey>(key: K, input: PlatformSettingInput<K>, actor: PlatformActor): Promise<PlatformSettingValue<K>> {
  return notImplemented("setPlatformSetting", key, input, actor);
}
