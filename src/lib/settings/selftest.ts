/**
 * Settings key self-test (docs/STORE-SAAS.md §D.10, §K.2 step P0):
 *   npm run test:settings        (tsx src/lib/settings/selftest.ts; offline, no DB, < 2 s)
 *
 * Checks the two registries against an independent transcription of the §D.10 table, so a key that drifts in level,
 * secrecy or shape fails here before a track builds on it:
 *   - every R1 key exists in the registry of its level (S → store-registry.ts, P → platform-registry.ts) with the
 *     secret flag of the table; the removed keys (`ai`, `home`, `pixels`) and the R2 / R3 keys are in neither;
 *   - every key's schema is a real z.object (no passthrough / catchall: §D.10 forbids it), except the markers and the
 *     `pixel_health` map, whose shapes the table fixes;
 *   - every key's default parses, and the stored form re-parses to the same value (a JSON round trip, which is how
 *     index.ts stores and reads rows);
 *   - defaults never invent business data: fees, prices, hours promises, packaging cost, policy facts stay
 *     null / "unset" / empty until the owner types them; the calling window is DEFAULT_WINDOW with `savedAt: null`;
 *   - the rev 3 / rev 4 fields of §K.2 P0 parse and refuse what they must (confirmationLeadDays 0-3, addressMode,
 *     the ISO `days` container, ≤ 3 ranges a day, ≤ 4 non-overlapping windowOverrides, agentLabels ≤ 50, carrierCsv,
 *     myCarrier, adAccounts / adRates, brand genes incl. G1 and G9); `platform_ai.classes` use the §D.10 model ids;
 *   - the P0b fields: `platform_backup` retention within PLA-§17's bounds (daily 3-30, weekly 1-12) and its
 *     `purgeRequests` (a { storeId, at } list of at most 1,000, empty by default; CCR P8-6);
 *   - old stored rows keep parsing: `store.confirmation.hours` and `policies.contact.hours` (removed by D73) are
 *     stripped while every other owner-typed field survives; the R1.0 conversion shapes of `store_ai`, `defaults`,
 *     `sheets` and `tracking_secrets` parse;
 *   - secret keys mask every sensitive field through the registries' redaction and never echo the raw value.
 * Exits 1 on any failure.
 */
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import { isMaskedSecret } from "./fields";
import { DEFAULT_WINDOW } from "./keys/ops";
import { PLATFORM_SETTINGS, redactPlatformSetting, type PlatformSettingKey } from "./platform-registry";
import { STORE_SETTINGS, redactStoreSetting, type StoreSettingKey } from "./store-registry";

let checks = 0;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

/* ------------------------------------------------------------------ */
/* the §D.10 table, transcribed                                        */
/* ------------------------------------------------------------------ */

/** R1 keys: level and secrecy (§D.10 "Level" and "Secret" columns). */
const R1_KEYS: Record<string, { level: "S" | "P"; secret: boolean }> = {
  store: { level: "S", secret: false },
  defaults: { level: "S", secret: false },
  sheets: { level: "S", secret: false },
  pixel_library: { level: "S", secret: false },
  pixel_health: { level: "S", secret: false },
  tracking_secrets: { level: "S", secret: true },
  turnstile: { level: "S", secret: true },
  doc_schema: { level: "P", secret: false },
  tenancy_v1: { level: "P", secret: false },
  legal_seed: { level: "P", secret: false },
  platform: { level: "P", secret: false },
  platform_ai: { level: "P", secret: false },
  platform_ai_secret: { level: "P", secret: true },
  platform_design: { level: "P", secret: false },
  platform_turnstile: { level: "P", secret: true },
  platform_backup: { level: "P", secret: false },
  store_ai: { level: "S", secret: false },
  brand: { level: "S", secret: false },
  onboarding: { level: "S", secret: false },
  landing: { level: "S", secret: false },
  policies: { level: "S", secret: false },
  checkout: { level: "S", secret: false },
  accounting: { level: "S", secret: false },
  ops: { level: "S", secret: false },
  conversions: { level: "S", secret: false },
  notifications: { level: "S", secret: false },
  telegram: { level: "S", secret: true },
  export_key: { level: "S", secret: true },
};
/** Removed in R1.0 (`ai` split, `home` → stores.home_page_id, `pixels` read once by the conversion). */
const REMOVED_KEYS = ["ai", "home", "pixels"];
/** Added by the contract step of their release, not before. */
const LATER_KEYS = ["platform_push", "platform_mail", "platform_cloudflare", "storefront", "carrier_credentials", "sheets_sa", "whatsapp_cloud", "feeds", "reviews"];
/** Keys whose value is not an object by design (markers, the "platform:id" → entry map). */
const NOT_OBJECT_KEYS = new Set(["doc_schema", "legal_seed", "tenancy_v1", "pixel_health"]);

type AnyDef = { schema: z.ZodType; secret: boolean; defaults: () => unknown; sensitive?: readonly string[] };
const storeDefs = STORE_SETTINGS as unknown as Record<string, AnyDef>;
const platformDefs = PLATFORM_SETTINGS as unknown as Record<string, AnyDef>;
const defOf = (key: string): AnyDef | undefined => (Object.hasOwn(storeDefs, key) ? storeDefs[key] : Object.hasOwn(platformDefs, key) ? platformDefs[key] : undefined);

/* ------------------------------------------------------------------ */
/* zod introspection (zod 4 `_zod.def`)                               */
/* ------------------------------------------------------------------ */

interface ZodDefLike {
  type: string;
  shape?: Record<string, unknown>;
  catchall?: unknown;
  in?: unknown;
  innerType?: unknown;
}
const zdef = (s: unknown): ZodDefLike => (s as { _zod: { def: ZodDefLike } })._zod.def;
/** The object at the core of a key schema (through transforms, defaults and nullables), or null. */
function objectCore(s: unknown): ZodDefLike | null {
  const d = zdef(s);
  if (d.type === "object") return d;
  if (d.type === "pipe" && d.in) return objectCore(d.in);
  if (d.innerType) return objectCore(d.innerType);
  return null;
}

const parse = (key: string, value: unknown) => defOf(key)!.schema.safeParse(value);
const ok = (key: string, value: unknown) => parse(key, value).success;
/** Parse a value the test expects to be valid; a failure is reported and yields an empty object. */
function value<T = Record<string, unknown>>(key: string, input: unknown, what: string): T {
  const r = parse(key, input);
  check(r.success, `${key}: ${what} parses${r.success ? "" : ` (${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")})`}`);
  return (r.success ? r.data : {}) as T;
}
const defaultOf = <T = Record<string, unknown>>(key: string): T => value<T>(key, defOf(key)!.defaults(), "its default");

/* ------------------------------------------------------------------ */
/* 1. registries vs the table                                          */
/* ------------------------------------------------------------------ */

for (const [key, row] of Object.entries(R1_KEYS)) {
  const inStore = Object.hasOwn(storeDefs, key);
  const inPlatform = Object.hasOwn(platformDefs, key);
  check(row.level === "S" ? inStore && !inPlatform : inPlatform && !inStore, `${key}: registered once, at level ${row.level}`);
  const d = defOf(key);
  if (!d) continue;
  check(d.secret === row.secret, `${key}: secret = ${row.secret}`);
  if (row.secret) check((d.sensitive?.length ?? 0) > 0, `${key}: a secret key names its sensitive fields`);
}
for (const key of [...Object.keys(storeDefs), ...Object.keys(platformDefs)]) check(Object.hasOwn(R1_KEYS, key), `${key}: registered but not an R1 key of §D.10`);
for (const key of [...REMOVED_KEYS, ...LATER_KEYS]) check(!defOf(key), `${key}: not registered in R1`);

/* ------------------------------------------------------------------ */
/* 2. real objects, defaults parse and re-parse                        */
/* ------------------------------------------------------------------ */

for (const key of Object.keys(R1_KEYS)) {
  const d = defOf(key);
  if (!d) continue;
  if (!NOT_OBJECT_KEYS.has(key)) {
    const core = objectCore(d.schema);
    check(core !== null, `${key}: the schema is a z.object`);
    check(core?.catchall === undefined, `${key}: no passthrough / catchall (§D.10)`);
    check(Object.keys(core?.shape ?? {}).length > 0, `${key}: the object lists its fields`);
    for (const f of d.sensitive ?? []) check(Object.hasOwn(core?.shape ?? {}, f), `${key}: sensitive field "${f}" exists in the schema`);
  }
  const first = d.schema.safeParse(d.defaults());
  check(first.success, `${key}: the default parses`);
  if (!first.success) continue;
  // compared as stored (JSON), so an `undefined` optional and an absent one are the same value
  const asStored = (x: unknown): unknown => JSON.parse(JSON.stringify(x ?? null));
  const stored = asStored(first.data);
  const again = d.schema.safeParse(stored);
  check(again.success && isDeepStrictEqual(asStored(again.data), stored), `${key}: the stored default re-parses to the same value`);
}

/* ------------------------------------------------------------------ */
/* 3. defaults never invent business data                              */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const at = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Obj)[k] : undefined), o);
const expectDefaults = (key: string, expected: Record<string, unknown>) => {
  const v = defaultOf(key);
  for (const [path, want] of Object.entries(expected)) check(isDeepStrictEqual(at(v, path), want), `${key}: default ${path} = ${JSON.stringify(want)} (got ${JSON.stringify(at(v, path))})`);
};

expectDefaults("defaults", { shippingFee: null, deliveryText: "", locales: [] });
expectDefaults("store", { "confirmation.withinHours": undefined, "confirmation.callerPhone": undefined, phone: undefined, legalName: undefined });
expectDefaults("policies", {
  inspection: "unset",
  "delivery.coverage": "unset",
  "delivery.typicalDays": null,
  "delivery.freeFromCents": null,
  "returns.accepted": null,
  "returns.windowDays": null,
  "returns.whoPays": "unset",
  "exchange.accepted": null,
  "refund.method": "unset",
  "refund.withinDays": null,
  "warranty.months": null,
  "contact.channels": [],
  "contact.hours": undefined,
  extras: [],
  reviewedAt: null,
});
expectDefaults("checkout", {
  zonesEnabled: false,
  "calendar.cutoffHour": null,
  "calendar.holidays": [],
  "calendar.holidaysReviewedYear": null,
  "calendar.confirmationLeadDays": null,
  addressMode: null,
});
expectDefaults("accounting", { packagingCents: null, adAccounts: {}, adRates: [], "myCarrier.settlement": "at_delivery", "myCarrier.confirmedAt": null });
expectDefaults("ops", {
  "callingWindow.savedAt": null,
  "callingWindow.closedDates": [],
  windowOverrides: [],
  openOverrideUntil: null,
  carrierCsv: null,
  agentLabels: {},
  cityAliases: {},
  "rescue.maxCalls": 3,
  "rescue.retryMinutes": 60,
});
expectDefaults("onboarding", { "draft.priceMinor": null, "draft.compareAtMinor": null, "draft.productName": null, pageId: null });
expectDefaults("brand", { "colors.accent": null, "colors.pop": null, "logo.primary": null, genes: {}, "fonts.pairing": null });
expectDefaults("store_ai", { director: null, sharePatterns: false, contributeTraining: false, localTierCeiling: "lite" });
expectDefaults("telegram", { enabled: false, botToken: null, chatId: null, pii: "masked" });
expectDefaults("export_key", { privateKey: null, clientEmail: null });
expectDefaults("platform", {
  "brand.name": "Store Gen",
  "brand.supportWhatsapp": null,
  "brand.supportHours": null,
  "signup.mode": null,
  "signup.allowedMarkets": ["MA"],
  "signup.pendingMediaMiB": 100,
  "signup.pendingMediaMiBBeforeSubmit": 20,
  "signup.pendingMediaTotalMiB": 5_000,
  "signup.pendingStoresPerDay": 50,
  "signup.pendingMembersMax": 2,
  "newStore.market": "MA",
  allowSellerBrandOrange: false,
  reservedHandles: [],
  "analytics.k": 5,
});
expectDefaults("platform_ai", {
  enabled: false,
  prices: {},
  "caps.monthlyUsd": null,
  "caps.dailyUsdPerStore": null,
  "caps.directorPassesPerStorePerDay": 30,
  "caps.deepPassesPerStorePerDay": 5,
  "caps.concurrentDirector": 4,
  "caps.concurrentWorker": 8,
  "caps.pendingSharePct": 10,
  "caps.pendingDailyFloor": 10,
  "caps.directorSharePct": 60,
  directorAutoDefault: false,
  patternLibrary: false,
  retentionNotice: "30d",
  "evalGate.minWinRateLowerBound": 0.5,
  "evalGate.maxDiversityDrop": 0.02,
  "evalGate.maxCostIncrease": 0.2,
  killSwitch: false,
  classesCanary: null,
  preferenceTest: null,
  rubricVersion: "v3",
  routes: {},
  autoPrefersCloud: {},
  genePins: {},
  modelInfo: {},
  probe: null,
});
expectDefaults("platform_ai_secret", { apiKey: undefined });
expectDefaults("platform_design", { gatesAtPublish: "block", novelty: "on" });
expectDefaults("platform_backup", { "retention.daily": 7, "retention.weekly": 4, lastDownloadAt: null, purgeRequests: [] });

// platform_ai classes: exactly the §D.10 model ids and efforts (D55), fast mode off
const CLASS_MODELS: Record<string, [string, string]> = {
  director_interactive: ["claude-opus-5-5", "medium"],
  director_deep: ["claude-fable-5-1", "high"],
  worker: ["claude-sonnet-5-5", "low"],
  fast: ["claude-haiku-5-5", "low"],
};
{
  const classes = (defaultOf("platform_ai").classes ?? {}) as Record<string, Obj>;
  check(isDeepStrictEqual(Object.keys(classes).sort(), Object.keys(CLASS_MODELS).sort()), "platform_ai: exactly the four task classes");
  for (const [cls, [model, effort]] of Object.entries(CLASS_MODELS)) {
    check(classes[cls]?.model === model && classes[cls]?.effort === effort, `platform_ai.classes.${cls} = ${model} / ${effort}`);
    check(classes[cls]?.fastMode === false && Number(classes[cls]?.timeoutMs) <= 90_000, `platform_ai.classes.${cls}: fastMode false, timeout ≤ 90 s`);
  }
}

// the calling window: DEFAULT_WINDOW, ISO keys 1-7, Friday its own day, never saved
{
  const w = (defaultOf("ops").callingWindow ?? {}) as { days?: Record<string, unknown[]> };
  check(isDeepStrictEqual(Object.keys(w.days ?? {}).sort(), ["1", "2", "3", "4", "5", "6", "7"]), "ops.callingWindow.days: exactly the ISO keys 1-7");
  check(isDeepStrictEqual(w.days, JSON.parse(JSON.stringify(DEFAULT_WINDOW.days))), "ops.callingWindow: the default is DEFAULT_WINDOW");
  check(!isDeepStrictEqual(w.days?.["5"], w.days?.["1"]), "ops.callingWindow: Friday (5) has its own ranges");
}

/* ------------------------------------------------------------------ */
/* 4. the rev 3 / rev 4 fields                                         */
/* ------------------------------------------------------------------ */

const range = (from: string, to: string) => ({ from, to });
const week = (r: unknown[]) => ({ 1: r, 2: r, 3: r, 4: r, 5: r, 6: r, 7: r });
const W = week([range("09:00", "12:00")]);

check(ok("checkout", { calendar: { confirmationLeadDays: 3 } }), "checkout.calendar.confirmationLeadDays 3 accepted");
check(!ok("checkout", { calendar: { confirmationLeadDays: 4 } }), "checkout.calendar.confirmationLeadDays 4 refused");
check(ok("checkout", { addressMode: "optional" }) && ok("checkout", { addressMode: null }), "checkout.addressMode optional / null accepted");
check(!ok("checkout", { addressMode: "maybe" }), "checkout.addressMode outside the enum refused");

check(ok("ops", { callingWindow: { days: W } }), "ops.callingWindow with the ISO container accepted");
check(!ok("ops", { callingWindow: { days: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } } }), "ops.callingWindow without day 7 refused");
check(!ok("ops", { callingWindow: { days: week([range("08:00", "09:00"), range("10:00", "11:00"), range("12:00", "13:00"), range("14:00", "15:00")]) } }), "ops: 4 ranges in a day refused");
check(!ok("ops", { callingWindow: { days: week([range("9:00", "12:00")]) } }), "ops: a range not in HH:MM refused");
{
  const saved = value<{ callingWindow: { savedAt: string | null } }>("ops", { callingWindow: { days: W, savedAt: "2026-10-27T10:00:00.000Z" } }, "a saved window");
  check(saved.callingWindow?.savedAt === "2026-10-27T10:00:00.000Z", "ops.callingWindow.savedAt kept once the owner saved");
}
const override = (from: string, to: string) => ({ label: "Ramadan", from, to, days: W });
check(ok("ops", { windowOverrides: [override("2027-02-08", "2027-03-09"), override("2027-03-10", "2027-03-12")] }), "ops.windowOverrides: two separate schedules accepted");
check(!ok("ops", { windowOverrides: [override("2027-02-08", "2027-03-09"), override("2027-03-01", "2027-03-12")] }), "ops.windowOverrides: overlapping schedules refused");
check(!ok("ops", { windowOverrides: [override("2027-03-09", "2027-02-08")] }), "ops.windowOverrides: an end before the start refused");
check(
  !ok("ops", { windowOverrides: ["01", "02", "03", "04", "05"].map((m) => override(`2027-${m}-01`, `2027-${m}-02`)) }),
  "ops.windowOverrides: a fifth schedule refused",
);
check(ok("ops", { openOverrideUntil: "2026-10-27T12:00:00.000Z" }), "ops.openOverrideUntil accepts an instant");
check(ok("ops", { rescue: { maxCalls: 0 } }) && !ok("ops", { rescue: { maxCalls: 6 } }), "ops.rescue.maxCalls 0-5");
{
  const ulid = "01JBQ8Z9X7K3M2N4P5R6S7T8V9";
  const labels = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`Agent ${i}`, ulid]));
  check(ok("ops", { agentLabels: { Salma: ulid } }), "ops.agentLabels: a label → member accepted");
  check(!ok("ops", { agentLabels: labels }), "ops.agentLabels: 51 labels refused");
  check(!ok("ops", { agentLabels: { Salma: "not-a-ulid" } }), "ops.agentLabels: a non-ULID member refused");
}
{
  const csv = value<{ carrierCsv: { delimiter: string; columns: unknown[] } | null }>(
    "ops",
    { carrierCsv: { columns: [{ header: "Nom", source: "name" }, { header: "Tél", source: "phone" }, { header: "Prix", source: "cod_amount" }] } },
    "a Carrier CSV column list",
  );
  check(csv.carrierCsv?.delimiter === ";" && csv.carrierCsv?.columns.length === 3, "ops.carrierCsv: delimiter ; by default, columns kept in order");
  check(!ok("ops", { carrierCsv: { columns: [] } }), "ops.carrierCsv: an empty column list refused");
  check(!ok("ops", { carrierCsv: { columns: [{ header: "X", source: "email" }] } }), "ops.carrierCsv: a source outside the manifest list refused");
}

{
  const acc = value<{ adAccounts: Record<string, { currency: string }>; adRates: { currency: string }[] }>(
    "accounting",
    { adAccounts: { meta: { currency: "usd" } }, adRates: [{ currency: "eur", fromDay: "2026-10-01", rateMilli: 10_850 }] },
    "lower-case ad currencies",
  );
  check(acc.adAccounts?.meta?.currency === "USD" && acc.adRates?.[0]?.currency === "EUR", "accounting: ad currencies stored upper-case");
}
check(
  !ok("accounting", { adRates: [{ currency: "USD", fromDay: "2026-10-01", rateMilli: 10_000 }, { currency: "usd", fromDay: "2026-10-01", rateMilli: 10_100 }] }),
  "accounting.adRates: one rate per currency and day, whatever the case",
);
check(!ok("accounting", { adAccounts: { facebook: { currency: "USD" } } }), "accounting.adAccounts: an unknown ad platform refused");
check(ok("accounting", { packagingCents: 350 }) && !ok("accounting", { packagingCents: 3.5 }), "accounting.packagingCents: integer cents only");
check(ok("accounting", { myCarrier: { settlement: "statement" } }), "accounting.myCarrier.settlement statement accepted");

{
  const b = value<{ genes: Record<string, string> }>("brand", { genes: { G1: "split", G9: "serif-display" } }, "the G1 / G9 locks");
  check(b.genes?.G1 === "split" && b.genes?.G9 === "serif-display", "brand.genes: G1 and G9 kept");
  check(!ok("brand", { genes: { G2: "x" } }), "brand.genes: a page gene (G2) refused at brand level");
}

{
  const route = { routes: { "copy.page": { effort: "low", deadlineMs: 60_000 } }, autoPrefersCloud: { removeBackground: true } };
  check(ok("platform_ai", route), "platform_ai.routes / autoPrefersCloud: task ids accepted");
  check(!ok("platform_ai", { routes: { "copy.page": { deadlineMs: 600_000 } } }), "platform_ai.routes: a deadline over 90 s refused (rev 4)");
  check(
    ok("platform_ai", { probe: { at: "2026-10-27T10:00:00.000Z", tokPerSec: { director_interactive: 180 }, lines: { "11": { pass: true } } } }),
    "platform_ai.probe: a measured run accepted",
  );
  check(!ok("platform_ai", { classes: { worker: { model: "gpt-4o", effort: "low", maxTokens: 8_000, timeoutMs: 60_000, fallbacks: "default", batch: "allowed" } } }), "platform_ai: a non-claude model id refused");
}

// platform_backup (P0b, CCR P8-6): the PLA-§17 retention bounds and the SEC-20 purgeRequests
check(ok("platform_backup", { retention: { daily: 3, weekly: 1 } }) && ok("platform_backup", { retention: { daily: 30, weekly: 12 } }), "platform_backup.retention: daily 3-30 and weekly 1-12 accepted at the bounds");
check(!ok("platform_backup", { retention: { daily: 2 } }) && !ok("platform_backup", { retention: { daily: 31 } }), "platform_backup.retention.daily outside 3-30 refused");
check(!ok("platform_backup", { retention: { weekly: 0 } }) && !ok("platform_backup", { retention: { weekly: 13 } }), "platform_backup.retention.weekly outside 1-12 refused");
check(!ok("platform_backup", { retention: { daily: 7.5 } }), "platform_backup.retention.daily: integers only");
{
  const purge = { storeId: "01JBQ8Z9X7K3M2N4P5R6S7T8V9", at: "2026-10-27T10:00:00.000Z" };
  const b = value<{ purgeRequests: unknown[]; retention: { daily: number; weekly: number } }>("platform_backup", { purgeRequests: [purge] }, "a purge request");
  check(isDeepStrictEqual(b.purgeRequests, [purge]) && b.retention?.daily === 7 && b.retention?.weekly === 4, "platform_backup.purgeRequests: a { storeId, at } entry kept beside the default retention");
  check(!ok("platform_backup", { purgeRequests: [{ ...purge, storeId: "01jbq8z9x7k3m2n4p5r6s7t8v9" }] }), "platform_backup.purgeRequests: a lower-case store id refused");
  check(!ok("platform_backup", { purgeRequests: [{ ...purge, storeId: "01JBQ8Z9X7K3M2N4P5R6S7T8V" }] }), "platform_backup.purgeRequests: a 25-character store id refused");
  check(!ok("platform_backup", { purgeRequests: [{ ...purge, at: "yesterday" }] }), "platform_backup.purgeRequests: a non-ISO instant refused");
  check(ok("platform_backup", { purgeRequests: Array.from({ length: 1000 }, () => purge) }), "platform_backup.purgeRequests: 1,000 entries accepted");
  check(!ok("platform_backup", { purgeRequests: Array.from({ length: 1001 }, () => purge) }), "platform_backup.purgeRequests: 1,001 entries refused");
}

/* ------------------------------------------------------------------ */
/* 5. old stored rows keep parsing                                     */
/* ------------------------------------------------------------------ */

{
  const hours = { days: [1, 2, 3, 4, 5, 6], from: "09:00", to: "18:00" };
  const s = value<{ confirmation: Obj; phone?: string; legalName?: string }>(
    "store",
    {
      storeName: "Old name",
      logo: { id: "a".repeat(16) },
      legalName: "SARL Atlas",
      phone: "06 12 34 56 78",
      confirmation: { callerPhone: "+212612345678", whatsapp: "212612345678", withinHours: 2, hours },
    },
    "a stored row with confirmation.hours and the legacy name / logo",
  );
  check(!Object.hasOwn(s.confirmation ?? {}, "hours"), "store.confirmation.hours stripped (D73)");
  check(s.confirmation?.callerPhone === "+212612345678" && s.confirmation?.withinHours === 2 && s.confirmation?.whatsapp === "212612345678", "store.confirmation: the other owner-typed fields kept");
  check(s.phone === "0612345678" && s.legalName === "SARL Atlas", "store: contacts and legal facts kept");
  check(!Object.hasOwn(s, "storeName") && !Object.hasOwn(s, "logo"), "store: the moved name / logo fields dropped on read");

  const p = value<{ contact: Obj; inspection: string }>("policies", { inspection: "allowed", contact: { channels: ["phone", "whatsapp"], hours } }, "a stored row with contact.hours");
  check(!Object.hasOwn(p.contact ?? {}, "hours"), "policies.contact.hours stripped (D73)");
  check(isDeepStrictEqual(p.contact?.channels, ["phone", "whatsapp"]) && p.inspection === "allowed", "policies: channels and the other facts kept");
}
{
  const ai = value<Obj>("store_ai", { mode: "auto", localEnabled: false, tier: "full", bgRemoval: false }, "the converted legacy ai value");
  check(ai.localTierCeiling === "full" && ai.localEnabled === false && ai.bgRemoval === false && !Object.hasOwn(ai, "tier"), "store_ai: legacy tier read as localTierCeiling");
  const again = parse("store_ai", JSON.parse(JSON.stringify(ai)));
  check(again.success && isDeepStrictEqual(again.data, ai), "store_ai: the converted value re-parses unchanged");
}
{
  const d = value<Obj>("defaults", { market: "MA", locale: "ar", currency: "MAD", phoneCountry: "MA", shippingFee: 0, deliveryText: "Livraison gratuite" }, "the legacy defaults value");
  check(d.shippingFee === 0 && d.deliveryText === "Livraison gratuite", "defaults: an owner-typed fee of 0 is kept");
  check(!Object.hasOwn(d, "currency") && !Object.hasOwn(d, "market"), "defaults: currency / market (now stores columns) dropped on read");
}
value("sheets", {
  enabled: true,
  url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
  spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  sheetId: 0,
  sheetTitle: "Orders",
  connectedAt: "2026-05-01T10:00:00.000Z",
}, "the legacy single-tenant sheets value");
value("tracking_secrets", { metaCapiToken: "EAABlegacytoken0001", tiktokToken: "legacyTikTokToken01" }, "the legacy single-token secrets");

/* ------------------------------------------------------------------ */
/* 6. secrets redact                                                   */
/* ------------------------------------------------------------------ */

const SECRET_SAMPLES: { key: string; input: Obj; raw: string[] }[] = [
  {
    key: "tracking_secrets",
    input: { metaTokens: { "123456789012": "EAABsecretMetaToken42" }, tiktokTokens: { C4ABCDEFGH12: "ttSecretToken4242" }, metaCapiToken: "EAABlegacySecret777" },
    raw: ["EAABsecretMetaToken42", "ttSecretToken4242", "EAABlegacySecret777"],
  },
  { key: "turnstile", input: { siteKey: "0x4AAAAAAAsite00", secretKey: "0x4AAAAAAAsecretKey99" }, raw: ["0x4AAAAAAAsecretKey99"] },
  { key: "telegram", input: { enabled: true, botToken: "123456789:AAHsecretTelegramBotToken_xyz", chatId: "-1001234567" }, raw: ["123456789:AAHsecretTelegramBotToken_xyz"] },
  {
    key: "export_key",
    input: { clientEmail: "orders@proj.iam.gserviceaccount.com", privateKey: `-----BEGIN PRIVATE KEY-----\n${"M".repeat(120)}\n-----END PRIVATE KEY-----\n`, privateKeyId: "abc123" },
    raw: ["M".repeat(120)],
  },
  { key: "platform_ai_secret", input: { apiKey: `sk-ant-api03-${"x".repeat(40)}` }, raw: [`sk-ant-api03-${"x".repeat(40)}`] },
  { key: "platform_turnstile", input: { siteKey: "0x4AAAAAAAsite00", secretKey: "0x4AAAAAAAplatformSecret1" }, raw: ["0x4AAAAAAAplatformSecret1"] },
];
const redact = (key: string, v: unknown): unknown =>
  Object.hasOwn(storeDefs, key) ? redactStoreSetting(key as StoreSettingKey, v as never) : redactPlatformSetting(key as PlatformSettingKey, v as never);
for (const sample of SECRET_SAMPLES) {
  const v = value(sample.key, sample.input, "a filled secret value");
  const red = redact(sample.key, v);
  const text = JSON.stringify(red);
  check(sample.raw.every((r) => !text.includes(r)), `${sample.key}: the redacted copy never carries the raw secret`);
  for (const f of defOf(sample.key)?.sensitive ?? []) {
    const field = (red as Obj)[f];
    if (typeof field === "string") check(isMaskedSecret(field), `${sample.key}.${f}: masked`);
    else if (field && typeof field === "object") check(Object.values(field).every((s) => isMaskedSecret(s)), `${sample.key}.${f}: every entry masked`);
  }
  check(Object.keys(red as Obj).length === Object.keys(v).length, `${sample.key}: redaction keeps the value's shape`);
}
for (const [key, row] of Object.entries(R1_KEYS)) {
  if (row.secret) continue;
  const v = defaultOf(key);
  check(redact(key, v) === v, `${key}: a non-secret key is returned as is`);
}

if (failures > 0) {
  console.error(`✗ settings selftest: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`✓ settings selftest: all ${checks} checks passed`);
