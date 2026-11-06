/**
 * The plan editor's pure rules (platform.md PLA-§9.1, §9.2, §9.4; PD8, PD58; core §A.4, §A.5.2). Isomorphic and
 * selftested: the rows of the editor grouped Limits / Features / Later releases, each explained three ways (the
 * registry default, the plan's value, the effective sentence), the patch validation, the diff the audit row carries,
 * the impact preview once the rows are read, and the job's two clocks. src/lib/platform/plans.ts (server-only) reads
 * and writes; everything that can be decided without the database is decided here.
 *
 *   planEditorRows(plan, caps)                       // rows by group, "Stores on this plan get 1 GiB."
 *   checkPlanPatch(plan, { media_bytes: 500 * MiB }) // { ok: true, changes: [{ key, from, to }], next }
 *   computeImpact({ stores, changes, usage, users }) // PlanImpact: lowered (≤ 20 examples, highest usage first), featuresOff
 *
 * Rules (PLA-§9.2): limits are integers ≥ 0 or null (unlimited); features booleans; "default" removes the key from the
 * plan (the registry default applies); unknown keys are refused; keys whose release is not live are shown with the
 * release chip and refused (`release_locked`); `take_orders` stays on (`take_orders_locked`, PD8: orders are never
 * blocked by a plan). A limit under a lifecycle cap (core §A.5.2: media, members, AI credits, exports while pending)
 * says what pending stores get. The console reads English in R1 (PD9), so the sentences are rendered in English.
 */
import { releaseOn, type Release } from "@/lib/auth/permissions";
import { t, type MessageKey } from "@/lib/i18n/admin";
import {
  ENTITLEMENTS,
  ENTITLEMENT_KEYS,
  GiB,
  KiB,
  MiB,
  USAGE_METRICS,
  isEntitlementKey,
  type EntitlementKey,
  type FeatureKey,
  type LimitKey,
  type UsageMetricName,
} from "@/lib/tenancy/entitlement-keys";

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

/** PLA-§9.1: a plan id */
export const PLAN_ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
/** plans.name is varchar(60) */
export const PLAN_NAME_MAX = 60;
/** the column default of `stores.plan_id`: new stores land here, so it is never hidden or retired in R1 */
export const DEFAULT_PLAN_ID = "beta";
export const PLAN_STATUSES = ["active", "hidden", "retired"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** A `plans` row's two bags (keys present = the plan's own value; absent = the registry default). */
export interface PlanBags {
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}

/** One value as the editor sends it: a limit, unlimited (null), a feature, or "default" (drop the key). */
export type PlanValue = number | null | boolean | "default";
/** The editor's patch: entitlement key → new value. */
export type PlanPatch = Readonly<Record<string, PlanValue>>;

export type PlanGroup = "limits" | "features" | "later";
export type Effective = number | null | boolean;

const kindOf = (key: EntitlementKey) => ENTITLEMENTS[key].kind;
const releaseOf = (key: EntitlementKey): Release | null => ("release" in ENTITLEMENTS[key] ? ((ENTITLEMENTS[key] as { release?: Release }).release ?? null) : null);

/** The editor group of a key: keys whose release is not live go under Later releases. */
export function groupOf(key: EntitlementKey): PlanGroup {
  const release = releaseOf(key);
  if (release && !releaseOn(release)) return "later";
  return kindOf(key) === "limit" ? "limits" : "features";
}

/** The plan's own value of a key, or "default" when the plan leaves it to the registry. */
export function planValueOf(plan: PlanBags, key: EntitlementKey): PlanValue {
  const bag: Record<string, unknown> = kindOf(key) === "limit" ? plan.limits : plan.features;
  if (!Object.prototype.hasOwnProperty.call(bag, key)) return "default";
  const v = bag[key];
  if (kindOf(key) === "feature") return typeof v === "boolean" ? v : "default";
  return v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) ? (v as number | null) : "default";
}

/** What a store on the plan gets before overrides, boosts and the lifecycle cap. */
export function effectiveOf(key: EntitlementKey, value: PlanValue): Effective {
  return value === "default" ? (ENTITLEMENTS[key].default as Effective) : value;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** "1 GiB", "1.9 GiB", "812 MiB", "64 KiB", "900 B" (binary units, one decimal above a GiB). */
export function formatBytes(n: number): string {
  if (n >= GiB) return `${trim1(n / GiB)} GiB`;
  if (n >= MiB) return `${Math.round(n / MiB).toLocaleString("en-US")} MiB`;
  if (n >= KiB) return `${Math.round(n / KiB)} KiB`;
  return `${n} B`;
}
const trim1 = (x: number) => {
  const s = (Math.round(x * 10) / 10).toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
};

/** The noun of a limit, singular and plural ("page" / "pages"); bytes are formatted on their own. */
const NOUN: Record<LimitKey, readonly [string, string]> = {
  media_bytes: ["of media storage", "of media storage"],
  pages_max: ["page", "pages"],
  products_max: ["product", "products"],
  members_max: ["member", "members"],
  agents_max: ["agent", "agents"],
  versions_kept_per_page: ["version kept per page", "versions kept per page"],
  exports_month: ["export a month", "exports a month"],
  ai_credits_month: ["AI credit a month", "AI credits a month"],
  webhooks_max: ["webhook", "webhooks"],
  custom_domains_max: ["custom domain", "custom domains"],
  orders_month_soft: ["order a month", "orders a month"],
  campaigns_max: ["campaign", "campaigns"],
  short_links_max: ["short link", "short links"],
};

/** "1 GiB of media storage", "50 pages", "unlimited pages", "1,500 AI credits a month". */
export function formatLimit(key: LimitKey, value: number | null): string {
  const [one, many] = NOUN[key];
  if (value === null) return key === "media_bytes" ? "unlimited media storage" : `unlimited ${many}`;
  if (key === "media_bytes") return `${formatBytes(value)} ${one}`;
  return `${value.toLocaleString("en-US")} ${value === 1 ? one : many}`;
}

/** A short amount for lists and examples: "1.9 GiB", "37", "unlimited". */
export function formatAmount(key: LimitKey, value: number | null): string {
  if (value === null) return "unlimited";
  return key === "media_bytes" ? formatBytes(value) : value.toLocaleString("en-US");
}

/** The usage gauge or counter a limit is charged against (`store_usage`), or null (versions are not counted). */
export function gaugeOf(key: LimitKey): UsageMetricName | null {
  for (const [metric, def] of Object.entries(USAGE_METRICS) as [UsageMetricName, (typeof USAGE_METRICS)[UsageMetricName]][]) {
    if (def.limit === key) return metric;
  }
  return null;
}

/** The label key of an entitlement (console.entitlement.<key>) and its one-line description. */
export const labelKeyOf = (key: EntitlementKey): MessageKey => `console.entitlement.${key}`;
export const descriptionKeyOf = (key: EntitlementKey): MessageKey => `console.entitlement.${key}.desc`;

/* ------------------------------------------------------------------ */
/* The lifecycle cap (core §A.5.2)                                     */
/* ------------------------------------------------------------------ */

/** The pending tunables of `platform.signup.*` (PLA-§2.4), passed in so the rule stays pure. */
export interface PendingCapValues {
  mediaMiB: number;
  mediaMiBBeforeSubmit: number;
  membersMax: number;
}

/** AI R5: the pending month (T1's PENDING_AI_CREDITS_MONTH; `test:platform` pins the two with applyStateCap). */
export const PENDING_AI_CREDITS = 100;

const minCap = (value: number | null, cap: number) => (value === null ? cap : Math.min(value, cap));

/**
 * What a pending store gets for a limit the lifecycle caps (core §A.5.2), or null when the key is not capped while
 * pending. Media has two tiers: before and after "Submit for review".
 */
export function pendingLimit(key: LimitKey, value: number | null, caps: PendingCapValues): { before: number; after: number } | null {
  switch (key) {
    case "media_bytes":
      return { before: minCap(value, caps.mediaMiBBeforeSubmit * MiB), after: minCap(value, caps.mediaMiB * MiB) };
    case "members_max": {
      const v = minCap(value, caps.membersMax);
      return { before: v, after: v };
    }
    case "ai_credits_month": {
      const v = minCap(value, PENDING_AI_CREDITS);
      return { before: v, after: v };
    }
    case "exports_month":
      return { before: 0, after: 0 };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The editor's rows (PLA-§9.2, PD58)                                  */
/* ------------------------------------------------------------------ */

export interface PlanEditorRow {
  key: EntitlementKey;
  group: PlanGroup;
  kind: "limit" | "feature";
  unit: "bytes" | "count" | null;
  /** the release chip of a Later releases row */
  release: Release | null;
  label: MessageKey;
  description: MessageKey;
  registryDefault: Effective;
  planValue: PlanValue;
  effective: Effective;
  /** "Stores on this plan get 1 GiB of media storage." */
  sentence: string;
  /** "Pending stores get 20 MiB, then 100 MiB once they submit for review, until approval." */
  pendingSentence: string | null;
  /** why the row cannot be edited */
  locked: "take_orders" | "release" | null;
}

/** The effective sentence of one key at one plan value (English, PD9). */
export function effectiveSentence(key: EntitlementKey, value: PlanValue): string {
  const eff = effectiveOf(key, value);
  if (key === "take_orders") return t("console.plans.take_orders_locked");
  if (kindOf(key) === "feature") return t(eff ? "console.plans.sentence.feature_on" : "console.plans.sentence.feature_off", { feature: t(labelKeyOf(key)) });
  if (key === "orders_month_soft") return eff === null ? t("console.plans.sentence.soft_none") : t("console.plans.sentence.soft", { value: formatLimit(key, eff as number) });
  return t("console.plans.sentence.limit", { value: formatLimit(key as LimitKey, eff as number | null) });
}

/** The pending line of a capped limit, or null. */
export function pendingSentence(key: EntitlementKey, value: PlanValue, caps: PendingCapValues): string | null {
  if (kindOf(key) !== "limit") return null;
  const lk = key as LimitKey;
  const cap = pendingLimit(lk, effectiveOf(key, value) as number | null, caps);
  if (!cap) return null;
  if (cap.before !== cap.after) return t("console.plans.sentence.pending_two", { before: formatAmount(lk, cap.before), after: formatAmount(lk, cap.after) });
  return t("console.plans.sentence.pending", { value: formatLimit(lk, cap.after) });
}

/** Every key of the registry as an editor row, in registry order within its group. */
export function planEditorRows(plan: PlanBags, caps: PendingCapValues): PlanEditorRow[] {
  return ENTITLEMENT_KEYS.map((key): PlanEditorRow => {
    const group = groupOf(key);
    const planValue = planValueOf(plan, key);
    const kind = kindOf(key);
    return {
      key,
      group,
      kind,
      unit: kind === "feature" ? null : key === "media_bytes" ? "bytes" : "count",
      release: releaseOf(key),
      label: labelKeyOf(key),
      description: descriptionKeyOf(key),
      registryDefault: ENTITLEMENTS[key].default as Effective,
      planValue,
      effective: effectiveOf(key, planValue),
      sentence: group === "later" ? t("console.plans.sentence.later", { release: releaseOf(key) ?? "" }) : effectiveSentence(key, planValue),
      pendingSentence: group === "later" ? null : pendingSentence(key, planValue, caps),
      locked: key === "take_orders" ? "take_orders" : group === "later" ? "release" : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* The patch (PLA-§9.2 validation)                                     */
/* ------------------------------------------------------------------ */

export interface PlanChange {
  key: EntitlementKey;
  from: PlanValue;
  to: PlanValue;
}

export type PlanPatchCheck =
  | { ok: true; changes: PlanChange[]; next: PlanBags }
  | { ok: false; key: string; code: "unknown_key" | "release_locked" | "take_orders_locked" | "value_type" | "empty" };

const validLimit = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);

/**
 * The patch against the plan's current bags: refusals first (the first offending key), then the changed keys only
 * and the bags as they will be stored. A patch that changes nothing answers `empty`.
 */
export function checkPlanPatch(plan: PlanBags, patch: PlanPatch): PlanPatchCheck {
  const entries = Object.entries(patch ?? {});
  for (const [key, value] of entries) {
    if (!isEntitlementKey(key)) return { ok: false, key: key.slice(0, 48), code: "unknown_key" };
    if (key === "take_orders" && value === false) return { ok: false, key, code: "take_orders_locked" };
    if (groupOf(key) === "later") return { ok: false, key, code: "release_locked" };
    if (value === "default") continue;
    if (kindOf(key) === "feature" ? typeof value !== "boolean" : !validLimit(value)) return { ok: false, key, code: "value_type" };
  }
  const next: PlanBags = { limits: { ...plan.limits }, features: { ...plan.features } };
  const changes: PlanChange[] = [];
  for (const [rawKey, to] of entries) {
    const key = rawKey as EntitlementKey;
    const from = planValueOf(plan, key);
    if (from === to) continue;
    const bag: Record<string, unknown> = kindOf(key) === "limit" ? next.limits : next.features;
    if (to === "default") delete bag[key];
    else bag[key] = to;
    changes.push({ key, from, to });
  }
  if (!changes.length) return { ok: false, key: "", code: "empty" };
  changes.sort((a, b) => ENTITLEMENT_KEYS.indexOf(a.key) - ENTITLEMENT_KEYS.indexOf(b.key));
  return { ok: true, changes, next };
}

/** The audit row's diff (`platform.plan.updated { diff }`): key → { from, to }, "default" kept as the word. */
export function planDiff(changes: readonly PlanChange[]): Record<string, { from: PlanValue; to: PlanValue }> {
  return Object.fromEntries(changes.map((c) => [c.key, { from: c.from, to: c.to }]));
}

/** A stable key of a patch for the `plan-impact` cache (sorted keys). */
export function patchHash(patch: PlanPatch): string {
  return JSON.stringify(Object.keys(patch).sort().map((k) => [k, patch[k]]));
}

/* ------------------------------------------------------------------ */
/* The impact preview (PLA-§9.2 PlanImpact, PD58)                      */
/* ------------------------------------------------------------------ */

/** PLA-§L: at most this many example handles per key */
export const IMPACT_EXAMPLES_MAX = 20;

export interface PlanImpact {
  /** stores on the plan (purged ones aside) */
  stores: number;
  /** limits lowered: `stores` = stores on the plan without an override or boost of the key; `storesAbove` = those already above the new limit */
  lowered: {
    key: EntitlementKey;
    from: number | null;
    to: number | null;
    stores: number;
    storesAbove: number;
    /** false: the key has no usage counter (versions per page), so nobody is counted above */
    measured: boolean;
    examples: { handle: string; used: number }[];
  }[];
  /** features switched off: the stores that use the feature today (its marker) and lose it; `measured: false` = no marker, every store without an override */
  featuresOff: { key: EntitlementKey; stores: number; measured: boolean; examples: { handle: string }[] }[];
  /** stores on the plan whose effective values do not change (overrides, boosts or usage below) */
  unaffected: number;
}

/** One store on the plan as the preview reads it. */
export interface ImpactStore {
  id: string;
  /** null only for a purged store (never listed) */
  handle: string | null;
  /** keys with a live override or boost: the plan value does not reach the store */
  shielded: ReadonlySet<string>;
}

export interface ImpactInput {
  stores: readonly ImpactStore[];
  /** effective values before and after, per changed key */
  changes: readonly { key: EntitlementKey; from: Effective; to: Effective }[];
  /** usage per store of a limit's counter, or null when the key has none */
  usage: (key: LimitKey) => ReadonlyMap<string, number> | null;
  /** the stores using a feature today, or null when the feature has no marker */
  users: (key: FeatureKey) => ReadonlySet<string> | null;
}

/** A limit goes down: unlimited → a number, or a smaller number. */
export const lowers = (from: number | null, to: number | null) => to !== null && (from === null || to < from);

/** ≤ 20 examples, highest usage first (handle order on a tie), handles only (public). */
export function topExamples(rows: readonly { handle: string | null; used: number }[], max = IMPACT_EXAMPLES_MAX): { handle: string; used: number }[] {
  return rows
    .filter((r): r is { handle: string; used: number } => typeof r.handle === "string" && r.handle.length > 0)
    .sort((a, b) => b.used - a.used || (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0))
    .slice(0, max)
    .map((r) => ({ handle: r.handle, used: r.used }));
}

/** The PlanImpact of the changes over the plan's stores (pure: the rows were read by previewPlanChange). */
export function computeImpact(input: ImpactInput): PlanImpact {
  const affected = new Set<string>();
  const lowered: PlanImpact["lowered"] = [];
  const featuresOff: PlanImpact["featuresOff"] = [];
  for (const c of input.changes) {
    const open = input.stores.filter((s) => !s.shielded.has(c.key));
    if (kindOf(c.key) === "limit") {
      const from = c.from as number | null;
      const to = c.to as number | null;
      if (!lowers(from, to)) continue;
      const usage = input.usage(c.key as LimitKey);
      const above = usage ? open.filter((s) => (usage.get(s.id) ?? 0) > (to as number)) : [];
      for (const s of above) affected.add(s.id);
      lowered.push({
        key: c.key,
        from,
        to,
        stores: open.length,
        storesAbove: above.length,
        measured: usage !== null,
        examples: topExamples(above.map((s) => ({ handle: s.handle, used: usage?.get(s.id) ?? 0 }))),
      });
    } else if (c.from === true && c.to === false) {
      const users = input.users(c.key as FeatureKey);
      const losing = users ? open.filter((s) => users.has(s.id)) : open;
      for (const s of losing) affected.add(s.id);
      featuresOff.push({
        key: c.key,
        stores: losing.length,
        measured: users !== null,
        examples: losing
          .filter((s): s is ImpactStore & { handle: string } => typeof s.handle === "string")
          .map((s) => ({ handle: s.handle }))
          .sort((a, b) => (a.handle < b.handle ? -1 : 1))
          .slice(0, IMPACT_EXAMPLES_MAX),
      });
    }
  }
  return { stores: input.stores.length, lowered, featuresOff, unaffected: input.stores.length - affected.size };
}

/** What a store above a lowered limit keeps and loses (the sentence's second half). */
function consequenceKey(key: LimitKey): MessageKey {
  if (key === "media_bytes") return "console.plans.consequence.media";
  if (key === "orders_month_soft") return "console.plans.consequence.soft";
  const gauge = gaugeOf(key);
  return gauge && USAGE_METRICS[gauge].period === "month" ? "console.plans.consequence.month" : "console.plans.consequence.count";
}

/** "@argan-souk 1.9 GiB, @maison-nour 812 MiB, @…" (three named, then "@…" when there are more). */
function exampleList(key: LimitKey, examples: readonly { handle: string; used: number }[], total: number): string {
  const named = examples.slice(0, 3).map((e) => `@${e.handle} ${formatAmount(key, e.used)}`);
  return total > named.length ? [...named, "@…"].join(", ") : named.join(", ");
}

/**
 * The preview's sentences (PLA-§9.2): "Lowers media storage for 12 stores; 3 are already above 500 MiB (@argan-souk
 * 1.9 GiB, @maison-nour 812 MiB, @…): they keep their files, new uploads are refused until they are below the limit."
 * and "Sheets sync pauses for 4 stores that are connected."
 */
export function impactSentences(impact: PlanImpact): string[] {
  const out: string[] = [];
  for (const l of impact.lowered) {
    const key = l.key as LimitKey;
    const head = t("console.plans.impact.lowers", { label: t(labelKeyOf(key)).toLowerCase(), count: l.stores });
    if (!l.measured) out.push(`${head}${t("console.plans.impact.unmeasured")}`);
    else if (l.storesAbove === 0) out.push(`${head}${t("console.plans.impact.none_above", { limit: formatAmount(key, l.to) })}`);
    else
      out.push(
        `${head}${t("console.plans.impact.above", { count: l.storesAbove, limit: formatAmount(key, l.to), examples: exampleList(key, l.examples, l.storesAbove), consequence: t(consequenceKey(key)) })}`,
      );
  }
  for (const f of impact.featuresOff) {
    const specific: MessageKey = `console.plans.impact.off.${f.key}`;
    const text = t(specific, { count: f.stores });
    out.push(text !== specific ? text : t("console.plans.impact.off", { label: t(labelKeyOf(f.key)), count: f.stores }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The platform.entitlements job (PLA-§9.4)                            */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
/** `plan.boost_ending` goes out this long before a boost expires */
export const BOOST_ENDING_DAYS = 3;
/** expired override / boost rows are deleted this long after their expiry */
export const EXPIRED_KEEP_DAYS = 30;

/** A boost whose `plan.boost_ending` is due now: it expires within 3 days and has not expired yet. */
export function boostEndingDue(row: { source: string; expiresAt: Date | null }, now: Date): boolean {
  if (row.source !== "boost" || !row.expiresAt) return false;
  const left = row.expiresAt.getTime() - now.getTime();
  return left > 0 && left <= BOOST_ENDING_DAYS * DAY;
}

/** The instant before which an expired row is deleted. */
export const purgeBefore = (now: Date) => new Date(now.getTime() - EXPIRED_KEEP_DAYS * DAY);

/** The once-per-row key of a boost's ending notice (a renewed boost has a new expiry, so a new notice). */
export const boostEndingKey = (storeId: string, key: string, expiresAt: Date) => `boost_ending:${storeId}:${key}:${expiresAt.getTime()}`;
