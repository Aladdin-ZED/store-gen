/**
 * Settings → AI, the pure half (P7 AI; ai.md AI-§K.1, AI-§K.5, AI-§E.6, AI-01, AI-06, AI-08 (4)). Isomorphic: the
 * page's view model (built by ./load.server.ts, metadata and store data only, never a customer field), the rules that
 * decide what each section says (`settingsStates`), the retention rule and the derived numbers (the Director share,
 * the reset date). The client sections read `settingsStates` and test:ai snapshots it, so the two cannot drift.
 */
import type { CloudBlock } from "../policy";
import type { AiProviderId } from "../tasks";

export const SETTINGS_LOCALES = ["ar", "fr", "en"] as const;
export type SettingsLocale = (typeof SETTINGS_LOCALES)[number];

/** The credit rows of the Credits section (AI-§K.1 2). */
export const SETTINGS_GROUPS = ["copy", "photos", "rewrites", "director", "deep", "other"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export const MEMORY_KIND_IDS = ["voice", "fact", "avoid", "prefer", "policy"] as const;
export type MemoryKindId = (typeof MEMORY_KIND_IDS)[number];

export type AiMode = "auto" | "local" | "server";
export type DirectorChoice = "auto" | "ask" | "off";

export interface VoiceView {
  formality: "vous" | "tu";
  darija: "none" | "cta" | "light";
  ctaByLocale: Partial<Record<SettingsLocale, string>>;
  wordsUse: string[];
  wordsAvoid: string[];
}

export interface MemoryView {
  id: string;
  kind: MemoryKindId;
  text: string;
  locale: string | null;
  source: "explicit" | "learned";
  pinned: boolean;
  /** kept out of every prompt until staff clear it */
  screened: boolean;
  at: string;
}

export interface ActivityRow {
  id: string;
  at: string;
  group: SettingsGroup;
  provider: AiProviderId;
  /** ok, running, canceled; "stopped" = refused, timed out, invalid, over a quota or an error (the ladder answered) */
  status: "running" | "ok" | "stopped" | "canceled";
  credits: number;
  ms: number | null;
}

export interface AiSettingsView {
  handle: string;
  /** null = the member may write (`ai.manage`); otherwise why every input is disabled */
  readOnly: null | "impersonation" | "state" | "role";
  /** a platform staff member who belongs to the store, outside "View as store": the probe card (D56) */
  staffProbe: boolean;
  /** the store's copy locale (the preview opens on it) */
  storeLocale: SettingsLocale;
  settings: {
    mode: AiMode;
    /** null = the platform default */
    director: DirectorChoice | null;
    deepPass: boolean;
    localEnabled: boolean;
    localTierCeiling: "lite" | "full";
    bgRemoval: boolean;
    learning: boolean;
    sharePatterns: boolean;
    voice: VoiceView;
  };
  cloud: {
    /** Cloud AI for this store right now (the policy) */
    available: boolean;
    block: CloudBlock | null;
    /** the block when the store's own mode is set aside: what Cloud preferred would meet */
    baseBlock: CloudBlock | null;
    /** the release flag ai_director_brief */
    directorFlag: boolean;
    /** the platform's choice for stores that never chose */
    directorDefault: DirectorChoice;
    directorPassCredits: number;
    directorPassesLeft: number | null;
    deepPassesLeft: number | null;
    /** a model that keeps requests 30 days serves the Director or the deep class (AI-§E.6) */
    interactiveRetains: boolean;
    deepRetains: boolean;
  };
  credits: {
    /** "YYYY-MM" (store time) */
    month: string;
    /** store_usage, never estimated */
    used: number;
    limit: number | null;
    /** "YYYY-MM-DD": the first day of next month */
    resetsOn: string;
    dayUsed: number;
    dayLimit: number | null;
    groups: Record<SettingsGroup, number>;
    director: { used: number; share: number; kept: number } | null;
  };
  memory: { items: MemoryView[]; max: number };
  activity: ActivityRow[];
  /** the library's hero line per locale (no AI call) */
  preview: Record<SettingsLocale, { headline: string; cta: string }>;
}

/* ------------------------------------------------------------------ */
/* rules                                                               */
/* ------------------------------------------------------------------ */

/** Fable models keep API requests 30 days (AI-§E.6, `platform_ai.retentionNotice`). */
export const retainsRequests = (model: string | null | undefined): boolean => typeof model === "string" && model.startsWith("claude-fable-");

/** Blocks that make Cloud preferred meaningless for this store (a quota or a pause comes back by itself). */
const STRUCTURAL: ReadonlySet<CloudBlock> = new Set<CloudBlock>(["platform_off", "no_key", "no_cap", "kill", "entitlement", "state"]);
const PLATFORM_OFF: ReadonlySet<CloudBlock> = new Set<CloudBlock>(["platform_off", "no_key", "no_cap", "kill"]);

/** The reason sentence of a cloud block (`ai.block.*`); null when there is none to show. */
export function blockKey(block: CloudBlock | null, readOnly: AiSettingsView["readOnly"]): string | null {
  if (!block) return null;
  if (PLATFORM_OFF.has(block)) return "ai.settings.cloud_off";
  if (block === "state") return readOnly === "impersonation" ? "ai.block.impersonation" : "ai.block.state";
  return `ai.block.${block}`;
}

/** What every section shows, decided once (AI-§K.1 states). */
export interface SettingsStates {
  readOnly: boolean;
  /** the one sentence under the page heading when Cloud AI is not reachable for the store (platform, plan, state) */
  cloudNotice: string | null;
  /** Cloud preferred disabled, with its reason */
  serverDisabled: string | null;
  /** the store chose On-device only: the cloud sections are greyed with that line */
  localOnly: boolean;
  /** Director and Credits greyed (cloud off, local only, or a structural block) */
  cloudGreyed: boolean;
  directorVisible: boolean;
  /** the Director's effective choice and whether it is the platform default */
  director: { value: DirectorChoice; isDefault: boolean };
  /** the retention line (AI-08 (4)) */
  retention: boolean;
  memoryEmpty: boolean;
  activityEmpty: boolean;
  /** "credits_out" | "day_out" | null: Settings shows the reset time (AI-§K.5) */
  creditsOut: "month" | "day" | null;
}

export function settingsStates(v: AiSettingsView): SettingsStates {
  const structural = v.cloud.baseBlock !== null && STRUCTURAL.has(v.cloud.baseBlock);
  const localOnly = v.settings.mode === "local";
  const cloudReachable = !structural;
  const director = { value: v.settings.director ?? v.cloud.directorDefault, isDefault: v.settings.director === null };
  const directorOn = v.cloud.directorFlag && director.value !== "off";
  return {
    readOnly: v.readOnly !== null,
    cloudNotice: structural ? blockKey(v.cloud.baseBlock, v.readOnly) : null,
    serverDisabled: structural ? blockKey(v.cloud.baseBlock, v.readOnly) : null,
    localOnly,
    cloudGreyed: structural || localOnly,
    directorVisible: v.cloud.directorFlag,
    director,
    retention: cloudReachable && !localOnly && ((v.settings.deepPass && v.cloud.deepRetains) || (directorOn && v.cloud.interactiveRetains)),
    memoryEmpty: v.memory.items.length === 0,
    activityEmpty: v.activity.length === 0,
    creditsOut: v.credits.limit !== null && v.credits.used >= v.credits.limit ? "month" : v.credits.dayLimit !== null && v.credits.dayUsed >= v.credits.dayLimit ? "day" : null,
  };
}

/* ------------------------------------------------------------------ */
/* numbers                                                             */
/* ------------------------------------------------------------------ */

/** "2026-10" → "2026-11-01" */
export function resetDateOf(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new RangeError(`ai settings: bad month "${month.slice(0, 20)}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
}

/** The Director's share of the month (AI-§C.2 rev 3): share = ⌊limit × pct / 100⌋, the rest is kept for copy. */
export function directorShareOf(limit: number | null, sharePct: number, used: number): { used: number; share: number; kept: number } | null {
  if (limit === null) return null;
  const share = Math.floor((limit * sharePct) / 100);
  return { used: Math.max(0, used), share, kept: Math.max(0, limit - share) };
}

export const creditsLeft = (limit: number | null, used: number): number | null => (limit === null ? null : Math.max(0, limit - used));

/** The fraction of the bar (0…1); null = no limit known. */
export const meterFraction = (used: number, limit: number | null): number | null => (limit === null || limit <= 0 ? null : Math.min(1, Math.max(0, used / limit)));

/* ------------------------------------------------------------------ */
/* voice                                                               */
/* ------------------------------------------------------------------ */

/** A word list as the chips input keeps it: trimmed, 2–40 characters, no duplicates (case-insensitive), capped. */
export function cleanWords(words: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = raw.replace(/\s+/g, " ").trim();
    const k = w.toLocaleLowerCase();
    if (w.length < 2 || w.length > 40 || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** The preview line of the Voice section: the library's headline and the store's own button text when it set one. */
export function previewLine(v: Pick<AiSettingsView, "preview">, voice: Pick<VoiceView, "ctaByLocale">, locale: SettingsLocale): { headline: string; cta: string } {
  const base = v.preview[locale];
  const own = voice.ctaByLocale[locale]?.trim();
  return { headline: base.headline, cta: own && own.length >= 2 ? own : base.cta };
}

/* ------------------------------------------------------------------ */
/* test:ai snapshot                                                    */
/* ------------------------------------------------------------------ */

/** One line per state that changes what the page renders; test:ai compares it against the fixtures' expectations. */
export function settingsSnapshot(v: AiSettingsView): string {
  const s = settingsStates(v);
  const parts = [
    `mode=${v.settings.mode}`,
    s.readOnly ? `read-only:${v.readOnly}` : "writable",
    s.cloudNotice ? `notice:${s.cloudNotice}` : null,
    s.serverDisabled ? "server:disabled" : "server:enabled",
    s.localOnly ? "local-only" : null,
    s.cloudGreyed ? "cloud:greyed" : "cloud:live",
    s.directorVisible ? `director:${s.director.value}${s.director.isDefault ? "(default)" : ""}` : "director:hidden",
    s.retention ? "retention" : null,
    s.memoryEmpty ? "memory:empty" : `memory:${v.memory.items.length}`,
    s.activityEmpty ? "activity:empty" : `activity:${v.activity.length}`,
    s.creditsOut ? `credits-out:${s.creditsOut}` : null,
  ];
  return parts.filter(Boolean).join(" ");
}
