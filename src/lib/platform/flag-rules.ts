/**
 * The flags page's pure rules (platform.md PLA-§12.1 kill switches, PLA-§12.2 release and ops flags; PD29; core §D.4,
 * §H.8). Isomorphic and selftested: what each kill switch stops and keeps, its state words, the typed confirmation
 * that trips the two dangerous ones, which stores it affects, the tenant banner in ar / fr / en; for the other flags
 * the editor's validation (a default and ordered rules of the flag's type, JSON checked for `json`), the override
 * scopes and the one-line rule summary ("Pro plan → on · 20 % of stores → on"). src/lib/platform/flags.ts reads and
 * writes them.
 *
 *   killPreviewCopy("platform_read_only", true)   // { stops, keeps, typed: "read-only", affects: "live_states" }
 *   checkFlagEdit("boolean", { default: true, rules: [{ when: { plans: ["pro"] }, value: true }] })
 *   rulesSummary(rules, "boolean")                // "pro plan → on · 20 % of stores → on"
 *
 * The tenant banner of a tripped switch is P2's `shell.kill.<key>` (PLA-§N.3). Until P2's catalog carries it, the
 * preview shows the reference texts below and says so (`fallback: true`; CCR r1-p1-6).
 */
import { PLATFORM_ROLES, type PlatformRole } from "@/lib/auth/permissions";
import { KILL_SWITCHES, killTripped, type FlagRule, type KillKey } from "@/lib/flags/registry";
import { messageOf, type AdminLocale, type MessageKey } from "@/lib/i18n/admin";
import { STORE_MODES } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";
import { valueFits, type FlagType, type OverrideScope } from "./flag-eval";
import { PLAN_ID_RE } from "./plan-rules";

/** PLA-§L: reasons of kill switches and notes of flag overrides */
export const KILL_REASON_MAX = 200;
export const OVERRIDE_NOTE_MAX = 200;
/** rules per flag (the editor's ordered list) */
export const FLAG_RULES_MAX = 20;
/** PLA-§12.1: the history a kill-switch card shows */
export const KILL_HISTORY_MAX = 20;

/* ------------------------------------------------------------------ */
/* Kill switches (PLA-§12.1, PD29)                                     */
/* ------------------------------------------------------------------ */

/** Which stores a switch reaches (the sheet's "affected stores"). */
export type KillAffects = "none" | "live_states" | "sheets" | "pixels";

/** PLA-§12.1: signups —; publishing, uploads, AI, read-only: pending / active / restricted; sheets: a binding; capi: a pixel */
export const KILL_AFFECTS: Readonly<Record<KillKey, KillAffects>> = {
  signups_enabled: "none",
  publishing_enabled: "live_states",
  ai_generation_enabled: "live_states",
  sheets_sync_enabled: "sheets",
  capi_enabled: "pixels",
  uploads_enabled: "live_states",
  platform_read_only: "live_states",
};

/** the store states a `live_states` switch counts */
export const KILL_LIVE_STATES: readonly StoreStatus[] = ["pending", "active", "restricted"];

/** PLA-§12.1: the typed word that trips the two switches with the widest effect (switching back needs none). */
export const KILL_TYPED: Readonly<Record<KillKey, string | null>> = {
  signups_enabled: "stop sign-ups",
  publishing_enabled: null,
  ai_generation_enabled: null,
  sheets_sync_enabled: null,
  capi_enabled: null,
  uploads_enabled: null,
  platform_read_only: "read-only",
};

/** The typed word this change needs: only a change that trips the switch, and only on the two above. */
export function killTypedFor(key: KillKey, to: boolean): string | null {
  return killTripped(key, to) ? KILL_TYPED[key] : null;
}

export type KillState = "normal" | "stopped" | "off" | "read_only_on";

/** "Normal" / "Stopped"; `platform_read_only` reads "Off" / "Read-only on". */
export function killState(key: KillKey, value: boolean): KillState {
  if (key === "platform_read_only") return value ? "read_only_on" : "off";
  return value ? "normal" : "stopped";
}

/** The card's and the sheet's words (console, English): name, one sentence of effect, what stops, what keeps working. */
export function killCopy(key: KillKey): { name: MessageKey; effect: MessageKey; stops: MessageKey; keeps: MessageKey } {
  return { name: `console.kill.${key}.name`, effect: `console.kill.${key}.effect`, stops: `console.kill.${key}.stops`, keeps: `console.kill.${key}.keeps` };
}

/**
 * The tenant banner each switch shows while tripped (PLA-§N.3 `shell.kill.<key>`; the reference texts of the two the
 * spec writes out, and the same pattern for the others: what is paused, and that orders keep working).
 */
export const KILL_BANNER_FALLBACK: Readonly<Record<KillKey, Readonly<Record<AdminLocale, string>>>> = {
  signups_enabled: {
    en: "New sign-ups are paused for maintenance. Your store keeps working.",
    fr: "Les nouvelles inscriptions sont en pause pour maintenance. Votre boutique continue de fonctionner.",
    ar: "التسجيلات الجديدة متوقفة مؤقتًا للصيانة. متجرك يواصل العمل بشكل عادي.",
  },
  publishing_enabled: {
    en: "Publishing is paused for maintenance. Orders keep working.",
    fr: "La publication est en pause pour maintenance. Les commandes continuent.",
    ar: "النشر متوقف مؤقتًا للصيانة. الطلبات تستمر بشكل عادي.",
  },
  ai_generation_enabled: {
    en: "AI generation is paused for maintenance. Orders keep working.",
    fr: "La génération par IA est en pause pour maintenance. Les commandes continuent.",
    ar: "التوليد بالذكاء الاصطناعي متوقف مؤقتًا للصيانة. الطلبات تستمر بشكل عادي.",
  },
  sheets_sync_enabled: {
    en: "Google Sheets sync is paused for maintenance. Orders keep working and are sent to your sheet when it resumes.",
    fr: "La synchronisation Google Sheets est en pause pour maintenance. Les commandes continuent et partiront vers votre feuille à la reprise.",
    ar: "مزامنة Google Sheets متوقفة مؤقتًا للصيانة. الطلبات تستمر وستُرسل إلى ورقتك عند الاستئناف.",
  },
  capi_enabled: {
    en: "Server-side pixel events are paused for maintenance. Orders keep working and the events are sent when it resumes.",
    fr: "Les événements pixel côté serveur sont en pause pour maintenance. Les commandes continuent et les événements partiront à la reprise.",
    ar: "أحداث البكسل من الخادم متوقفة مؤقتًا للصيانة. الطلبات تستمر وستُرسل الأحداث عند الاستئناف.",
  },
  uploads_enabled: {
    en: "Uploads are paused for maintenance. Orders keep working.",
    fr: "Les envois de fichiers sont en pause pour maintenance. Les commandes continuent.",
    ar: "رفع الملفات متوقف مؤقتًا للصيانة. الطلبات تستمر بشكل عادي.",
  },
  platform_read_only: {
    en: "Store Gen is in maintenance: the dashboard is read-only. Orders keep coming in.",
    fr: "Store Gen est en maintenance : le tableau de bord est en lecture seule. Les commandes continuent d'arriver.",
    ar: "Store Gen في وضع الصيانة: لوحة التحكم للقراءة فقط. الطلبات تستمر في الوصول.",
  },
};

/** The tenant banner in one locale: P2's `shell.kill.<key>` when its catalog has it, else the reference text. */
export function killBanner(key: KillKey, locale: AdminLocale): { text: string; fallback: boolean } {
  const shell = messageOf(`shell.kill.${key}`, locale);
  return shell !== undefined ? { text: shell, fallback: false } : { text: KILL_BANNER_FALLBACK[key][locale], fallback: true };
}

/* ------------------------------------------------------------------ */
/* Release and ops flags (PLA-§12.2)                                   */
/* ------------------------------------------------------------------ */

const STATUSES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"];
const MARKET_RE = /^[A-Z]{2}$/;
const ULID_RE = /^[0-9A-Z]{26}$/;

const listOf = <T>(value: unknown, ok: (v: unknown) => v is T, max: number): T[] | null => (Array.isArray(value) && value.length >= 1 && value.length <= max && value.every(ok) ? [...new Set(value)] : null);
const isPlanId = (v: unknown): v is string => typeof v === "string" && PLAN_ID_RE.test(v);
const isMarket = (v: unknown): v is string => typeof v === "string" && MARKET_RE.test(v);
const isMode = (v: unknown): v is (typeof STORE_MODES)[number] => typeof v === "string" && (STORE_MODES as readonly string[]).includes(v);
const isStatus = (v: unknown): v is StoreStatus => typeof v === "string" && (STATUSES as readonly string[]).includes(v);
const isRole = (v: unknown): v is PlatformRole => typeof v === "string" && (PLATFORM_ROLES as readonly string[]).includes(v);

/** A value of the flag's type; a `json` flag also takes the editor's JSON text of an object. */
export function checkFlagValue(type: FlagType, value: unknown): { ok: true; value: FlagRule["value"] } | { ok: false; code: "value_type" | "json_invalid" } {
  let v = value;
  if (type === "json" && typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { ok: false, code: "json_invalid" };
    }
    if (JSON.stringify(v).length > 8_000) return { ok: false, code: "json_invalid" };
  }
  if (type === "number" && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) v = Number(v);
  if (type === "string" && typeof v === "string" && v.length > 500) return { ok: false, code: "value_type" };
  return valueFits(type, v) ? { ok: true, value: v as FlagRule["value"] } : { ok: false, code: type === "json" ? "json_invalid" : "value_type" };
}

export type FlagEditCheck = { ok: true; default: FlagRule["value"]; rules: FlagRule[] } | { ok: false; field: string; code: string };

/**
 * The editor's save (PLA-§12.2): the default of the flag's type, then each rule in order: known conditions only
 * (plans, modes, markets, store states, platform roles; each a non-empty list), a value of the flag's type and an
 * optional rollout 0-100. At most 20 rules; an empty `when` matches everyone.
 */
export function checkFlagEdit(type: FlagType, input: { default: unknown; rules: unknown }): FlagEditCheck {
  const d = checkFlagValue(type, input.default);
  if (!d.ok) return { ok: false, field: "default", code: d.code };
  if (!Array.isArray(input.rules)) return { ok: false, field: "rules", code: "rules_invalid" };
  if (input.rules.length > FLAG_RULES_MAX) return { ok: false, field: "rules", code: "rules_too_many" };
  const rules: FlagRule[] = [];
  for (let i = 0; i < input.rules.length; i++) {
    const raw = input.rules[i] as { when?: unknown; value?: unknown; rollout?: unknown } | null;
    const field = `rules.${i}`;
    if (!raw || typeof raw !== "object") return { ok: false, field, code: "rules_invalid" };
    const when = (raw.when ?? {}) as Record<string, unknown>;
    if (typeof when !== "object" || Array.isArray(when)) return { ok: false, field, code: "rules_invalid" };
    const out: FlagRule["when"] = {};
    for (const [cond, value] of Object.entries(when)) {
      if (value === undefined) continue;
      const parsed =
        cond === "plans" ? listOf(value, isPlanId, 50) : cond === "modes" ? listOf(value, isMode, 3) : cond === "markets" ? listOf(value, isMarket, 50) : cond === "storeStatus" ? listOf(value, isStatus, 8) : cond === "platformRoles" ? listOf(value, isRole, 4) : undefined;
      if (parsed === undefined) return { ok: false, field: `${field}.when`, code: "condition_unknown" };
      if (parsed === null) return { ok: false, field: `${field}.when.${cond}`, code: "condition_invalid" };
      (out as Record<string, unknown>)[cond] = parsed;
    }
    const value = checkFlagValue(type, raw.value);
    if (!value.ok) return { ok: false, field: `${field}.value`, code: value.code };
    let rollout: number | undefined;
    if (raw.rollout !== undefined && raw.rollout !== null) {
      if (typeof raw.rollout !== "number" || !Number.isInteger(raw.rollout) || raw.rollout < 0 || raw.rollout > 100) return { ok: false, field: `${field}.rollout`, code: "rollout_invalid" };
      rollout = raw.rollout;
    }
    rules.push({ when: out, value: value.value, ...(rollout !== undefined ? { rollout } : {}) });
  }
  return { ok: true, default: d.value, rules };
}

/** "on" / "off", a number, a quoted string, or "JSON". */
export function valueLabel(type: FlagType, value: unknown): string {
  if (type === "boolean") return value === true ? "on" : "off";
  if (type === "number") return String(value);
  if (type === "string") return `“${String(value).slice(0, 40)}”`;
  return "JSON";
}

/** One rule as the table reads it: "pro plan, MA → on", "20 % of stores → on", "everyone → off". */
export function ruleSummary(rule: FlagRule, type: FlagType): string {
  const w = rule.when ?? {};
  const parts: string[] = [];
  if (w.plans?.length) parts.push(`${w.plans.join(", ")} plan`);
  if (w.modes?.length) parts.push(`${w.modes.join(", ")} mode`);
  if (w.markets?.length) parts.push(w.markets.join(", "));
  if (w.storeStatus?.length) parts.push(`${w.storeStatus.join(", ")} stores`);
  if (w.platformRoles?.length) parts.push(`staff (${w.platformRoles.join(", ")})`);
  if (rule.rollout !== undefined && rule.rollout !== null) parts.push(`${rule.rollout} % of stores`);
  return `${parts.length ? parts.join(", ") : "everyone"} → ${valueLabel(type, rule.value)}`;
}

/** The rules column: "pro plan → on · 20 % of stores → on" ("" for none). */
export function rulesSummary(rules: readonly FlagRule[] | null | undefined, type: FlagType): string {
  return (rules ?? []).map((r) => ruleSummary(r, type)).join(" · ");
}

/** An override's target id fits its scope: a store or user ULID, a plan id, an ISO market code. */
export function scopeIdOk(scope: OverrideScope, id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (scope === "store" || scope === "user") return ULID_RE.test(id);
  if (scope === "plan") return PLAN_ID_RE.test(id);
  return MARKET_RE.test(id);
}

export const OVERRIDE_SCOPES: readonly OverrideScope[] = ["store", "user", "plan", "market"];

/** Every kill switch in the seeded order (the cards). */
export const KILL_ORDER: readonly KillKey[] = KILL_SWITCHES;
