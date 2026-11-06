import "server-only";
/**
 * Settings → AI, the read (P7 AI; ai.md AI-§K.1, AI-§C.3, AI-§E.5). One pass through the seam's scope: the policy
 * (`aiPolicyFor`), its inputs for the lines the policy folds away (the Director flag and default, passes and the share
 * left), `store_ai`, the month's credits from `store_usage` (`aiUsageForStore`, never estimated) and per task group
 * from `ai_runs`, the explicit memory (store data, shown under impersonation too) and the last 20 runs as metadata.
 * No customer field is read here; nothing is written.
 */
import { libraryCopy } from "@/lib/ai/copy-library";
import { translator, type AdminLocale } from "@/lib/i18n/admin";
import { getPlatformSetting, getStoreSetting } from "@/lib/settings";
import { usageMetric } from "@/lib/tenancy/entitlement-keys";
import { usageValue } from "@/lib/tenancy/entitlements";
import type { StoreCtx } from "@/lib/tenancy/types";
import { cloudBlockFor, DIRECTOR_PASS_CREDITS_P90 } from "../policy";
import { dailyCreditLimit } from "../quota/cost";
import { aiPolicyFor } from "../router/server";
import { loadPolicyInputs } from "../router/policy.server";
import { aiFlagsFor } from "../server/flags";
import { listMemory, MEMORY_MAX_ACTIVE } from "../store/memory";
import { monthCreditsByTask, recentRuns, type RunStatus } from "../store/runs";
import { aiUsageForStore } from "../summary.server";
import { TASKS, type AiTaskId } from "../tasks";
import { SETTINGS_GROUPS, SETTINGS_LOCALES, directorShareOf, resetDateOf, retainsRequests, type ActivityRow, type AiSettingsView, type SettingsGroup, type SettingsLocale } from "./view";


const PHOTO_TASKS: ReadonlySet<string> = new Set(["analyze", "classify", "removeBackground", "image.studio", "media.alt"]);

/** The Credits row of a task (AI-§K.1 2): rewrites apart from the rest of the copy, the deep class apart from the Director. */
export function settingsGroupOf(task: AiTaskId): SettingsGroup {
  if (task === "copy.field") return "rewrites";
  if (task.startsWith("copy.")) return "copy";
  const def = TASKS[task];
  if (def?.class === "director_deep" || def?.caps?.passCounter === "deep") return "deep";
  if (def?.caps?.passCounter === "director" || task === "critique.doc") return "director";
  if (PHOTO_TASKS.has(task)) return "photos";
  return "other";
}

const statusOf = (s: RunStatus): ActivityRow["status"] => (s === "ok" ? "ok" : s === "running" ? "running" : s === "cancelled" ? "canceled" : "stopped");

const asLocale = (l: string): SettingsLocale => ((SETTINGS_LOCALES as readonly string[]).includes(l) ? (l as SettingsLocale) : "fr");

/** The library's hero line per locale for a neutral sample product (the Voice preview, no AI call). */
function previewOf(seed: number): AiSettingsView["preview"] {
  const out = {} as AiSettingsView["preview"];
  for (const locale of SETTINGS_LOCALES) {
    const t = translator(locale as AdminLocale);
    const copy = libraryCopy({ category: "skincare", locale, seed, productName: t("ai.settings.voice.sample") });
    // the library marks emphasis with *…*; the preview shows plain text
    out[locale] = { headline: copy.hero.headline.replace(/\*/g, ""), cta: copy.hero.cta.replace(/\*/g, "") };
  }
  return out;
}

function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export async function loadAiSettings(ctx: StoreCtx, now = new Date()): Promise<AiSettingsView> {
  const { scope, store } = ctx;
  const tz = store.timezone;
  const month = usageMetric("ai_credits", now, tz).period;
  const day = usageMetric("ai_credits_day", now, tz);
  const impersonating = ctx.impersonation !== null || scope.kind === "impersonation";
  const [policy, inputs, storeAi, platformAi, usage, byTask, dayUsed, directorUsed, flags, memory, runs] = await Promise.all([
    aiPolicyFor(ctx),
    // "View as store" reads no counter through the policy (D70); the page still shows the stored choices
    impersonating ? Promise.resolve(null) : loadPolicyInputs(ctx),
    getStoreSetting(scope, "store_ai", { fresh: true }),
    getPlatformSetting("platform_ai"),
    aiUsageForStore(scope, month),
    monthCreditsByTask(scope, month, tz),
    usageValue(scope, day),
    usageValue(scope, usageMetric("ai_credits_director", now, tz)),
    aiFlagsFor({ storeId: scope.storeId, userId: ctx.user.id, store, platformRole: ctx.user.platformRole }),
    listMemory(scope),
    recentRuns(scope, 20),
  ]);

  // what Cloud preferred would meet: the policy's block with the store's own mode set aside
  const baseBlock = impersonating
    ? policy.cloud.block
    : policy.cloud.block === "store_local_only" && inputs
      ? cloudBlockFor({ ...inputs.cloud, mode: "auto" })
      : policy.cloud.block;

  const groups = Object.fromEntries(SETTINGS_GROUPS.map((g) => [g, 0])) as Record<SettingsGroup, number>;
  for (const r of byTask) groups[settingsGroupOf(r.task)] += r.credits;

  const caps = platformAi.caps;
  const readOnly: AiSettingsView["readOnly"] = impersonating ? "impersonation" : ctx.can("ai.manage") ? null : ["suspended", "closed", "scheduled_deletion", "purged", "rejected"].includes(store.status) ? "state" : "role";
  return {
    handle: store.handle,
    readOnly,
    staffProbe: !impersonating && (ctx.user.platformRole === "admin" || ctx.user.platformRole === "super_admin") && readOnly === null,
    storeLocale: asLocale(store.defaultLocale),
    settings: {
      mode: storeAi.mode,
      director: storeAi.director,
      deepPass: storeAi.deepPass,
      localEnabled: storeAi.localEnabled,
      localTierCeiling: storeAi.localTierCeiling,
      bgRemoval: storeAi.bgRemoval,
      learning: storeAi.learning,
      sharePatterns: storeAi.sharePatterns,
      voice: {
        formality: storeAi.voice.formality,
        darija: storeAi.voice.darija,
        ctaByLocale: { ...storeAi.voice.ctaByLocale },
        wordsUse: [...storeAi.voice.wordsUse],
        wordsAvoid: [...storeAi.voice.wordsAvoid],
      },
    },
    cloud: {
      available: policy.cloud.available,
      block: policy.cloud.block,
      baseBlock,
      directorFlag: flags.has("ai_director_brief"),
      directorDefault: platformAi.directorAutoDefault ? "auto" : "ask",
      directorPassCredits: policy.cloud.directorPassCredits || DIRECTOR_PASS_CREDITS_P90,
      directorPassesLeft: inputs?.director.passesLeft ?? null,
      deepPassesLeft: inputs?.deep.passesLeft ?? null,
      interactiveRetains: retainsRequests(platformAi.classes.director_interactive.model),
      deepRetains: retainsRequests(platformAi.classes.director_deep.model),
    },
    credits: {
      month,
      used: usage.creditsUsed,
      limit: usage.creditsLimit,
      resetsOn: resetDateOf(month),
      dayUsed,
      dayLimit: dailyCreditLimit({ monthly: usage.creditsLimit, storeDailyCapPct: caps.storeDailyCapPct, dailyUsdPerStore: caps.dailyUsdPerStore, pending: store.status === "pending", pendingDailyFloor: caps.pendingDailyFloor }),
      groups,
      director: directorShareOf(usage.creditsLimit, caps.directorSharePct, directorUsed),
    },
    memory: {
      items: memory.map((m) => ({ id: m.id, kind: m.kind, text: m.text, locale: m.locale, source: m.source, pinned: m.pinned, screened: m.screened, at: m.updatedAt })),
      max: MEMORY_MAX_ACTIVE,
    },
    activity: runs.map((r) => ({ id: r.id, at: r.at, group: settingsGroupOf(r.task), provider: r.provider, status: statusOf(r.status), credits: r.credits, ms: r.ms })),
    preview: previewOf(seedOf(store.id)),
  };
}
