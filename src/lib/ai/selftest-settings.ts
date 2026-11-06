/**
 * test:ai sections of step 12 (P7 AI; ai.md AI-§K.1, AI-08 (4), AI-§Q.1, SF-03): Settings → AI.
 *  - settings-snapshot: `settingsSnapshot` / `settingsStates` over the page's states (platform off, entitlement,
 *    suspended, impersonation, On-device only, empty lists, credits out) and the retention line: present whenever a
 *    deep class is reachable (a retaining model behind the deep pass or the Director), absent otherwise (AI-08 (4));
 *  - settings-numbers: the reset date, the Director share (the spec's 106 of 180, 120 kept), meters, word lists, the
 *    voice preview line;
 *  - settings-keys: every literal `t("…")` key of src/components/admin/ai/settings exists in en, fr and ar;
 *  - health-ai: the SF-03 rules answer their own fixtures (fires with the expected severity and metric, silent null).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { messages as AR } from "@/lib/i18n/admin/ar/ai";
import { messages as EN } from "@/lib/i18n/admin/en/ai";
import { messages as FR } from "@/lib/i18n/admin/fr/ai";
import type { HealthInputs } from "@/lib/health/types";
import { cleanWords, directorShareOf, meterFraction, previewLine, resetDateOf, retainsRequests, settingsSnapshot, settingsStates, type AiSettingsView } from "./settings/view";

export interface SettingsSelftestApi {
  section(name: string, run: () => void | Promise<void>, opts?: { slow?: boolean; strict?: boolean }): void;
  check(ok: boolean, msg: string): void;
  eq(a: unknown, b: unknown, msg: string): void;
}

type Patch = { [K in keyof AiSettingsView]?: AiSettingsView[K] extends object ? Partial<AiSettingsView[K]> : AiSettingsView[K] };

function view(p: Patch = {}): AiSettingsView {
  const base: AiSettingsView = {
    handle: "demo",
    readOnly: null,
    staffProbe: false,
    storeLocale: "fr",
    settings: { mode: "auto", director: null, deepPass: true, localEnabled: true, localTierCeiling: "lite", bgRemoval: true, learning: true, sharePatterns: false, voice: { formality: "vous", darija: "cta", ctaByLocale: {}, wordsUse: [], wordsAvoid: [] } },
    cloud: { available: true, block: null, baseBlock: null, directorFlag: true, directorDefault: "ask", directorPassCredits: 53, directorPassesLeft: 30, deepPassesLeft: 5, interactiveRetains: false, deepRetains: true },
    credits: { month: "2026-10", used: 88, limit: 300, resetsOn: "2026-11-01", dayUsed: 10, dayLimit: 75, groups: { copy: 40, photos: 8, rewrites: 4, director: 36, deep: 0, other: 0 }, director: { used: 36, share: 180, kept: 120 } },
    memory: { items: [{ id: "01J00000000000000000000000", kind: "fact", text: "Livraison en 48 h à Casablanca", locale: null, source: "explicit", pinned: false, screened: false, at: "2026-10-02T10:00:00.000Z" }], max: 30 },
    activity: [{ id: "01J00000000000000000000001", at: "2026-10-03T10:00:00.000Z", group: "copy", provider: "server", status: "ok", credits: 4, ms: 2_400 }],
    preview: { ar: { headline: "h-ar", cta: "اطلب" }, fr: { headline: "h-fr", cta: "Je commande" }, en: { headline: "h-en", cta: "Order" } },
  };
  return {
    ...base,
    ...p,
    settings: { ...base.settings, ...p.settings },
    cloud: { ...base.cloud, ...p.cloud },
    credits: { ...base.credits, ...p.credits } as AiSettingsView["credits"],
    memory: { ...base.memory, ...p.memory },
  } as AiSettingsView;
}

/** Literal admin keys of a component folder (`t("ai.…")`, `t('ai.…')`). */
function literalKeys(dir: string): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!/\.tsx?$/.test(f)) continue;
    for (const m of readFileSync(path.join(dir, f), "utf8").matchAll(/\bt\(\s*"((?:ai|health)\.[a-z0-9_.]+)"/g)) out.add(m[1]!);
  }
  return [...out].sort();
}

export function registerSettingsSections(t: SettingsSelftestApi): void {
  const { section, check, eq } = t;

  section("settings-snapshot", () => {
    eq(settingsSnapshot(view()), "mode=auto writable server:enabled cloud:live director:ask(default) retention memory:1 activity:1", "live store: Ask is the default, the deep pass reaches Fable: the retention line");
    // AI-08 (4): the retention line follows the reachable deep classes
    check(!settingsStates(view({ settings: { deepPass: false } })).retention, "deep pass off, Director on a model without retention: no retention line");
    check(settingsStates(view({ settings: { deepPass: false }, cloud: { interactiveRetains: true } })).retention, "deep pass off, the Director's model retains: the retention line");
    check(!settingsStates(view({ settings: { deepPass: false, director: "off" }, cloud: { interactiveRetains: true } })).retention, "Director off and deep off: no retention line");
    check(!settingsStates(view({ cloud: { directorFlag: false, interactiveRetains: true }, settings: { deepPass: false } })).retention, "Director flag off and deep off: no retention line");
    check(!settingsStates(view({ cloud: { deepRetains: false } , settings: { deepPass: true } })).retention, "a deep class without retention: no line");
    check(!settingsStates(view({ settings: { mode: "local" } })).retention, "On-device only: no deep class reachable, no retention line");
    check(!settingsStates(view({ cloud: { available: false, block: "platform_off", baseBlock: "platform_off" } })).retention, "Cloud AI off by the platform: no retention line");
    check(settingsStates(view({ cloud: { available: false, block: "quota_store", baseBlock: "quota_store" } })).retention, "credits used up is not structural: the class stays reachable, the line stays");
    eq(
      settingsSnapshot(view({ cloud: { available: false, block: "platform_off", baseBlock: "platform_off" } })),
      "mode=auto writable notice:ai.settings.cloud_off server:disabled cloud:greyed director:ask(default) memory:1 activity:1",
      "platform off: one sentence, Cloud preferred disabled, the cloud sections greyed",
    );
    eq(settingsSnapshot(view({ cloud: { available: false, block: "no_key", baseBlock: "no_key" } })).includes("notice:ai.settings.cloud_off"), true, "no key reads as the platform's off");
    eq(settingsSnapshot(view({ cloud: { available: false, block: "entitlement", baseBlock: "entitlement" } })).includes("notice:ai.block.entitlement server:disabled"), true, "entitlement off: its own sentence");
    eq(
      settingsSnapshot(view({ settings: { mode: "local" }, cloud: { available: false, block: "store_local_only", baseBlock: null } })),
      "mode=local writable server:enabled local-only cloud:greyed director:ask(default) memory:1 activity:1",
      "On-device only: Cloud preferred stays choosable, the cloud sections greyed with that line",
    );
    eq(settingsSnapshot(view({ readOnly: "state", cloud: { available: false, block: "state", baseBlock: "state" } })).startsWith("mode=auto read-only:state notice:ai.block.state"), true, "suspended: read-only, the state sentence");
    eq(settingsSnapshot(view({ readOnly: "impersonation", cloud: { available: false, block: "state", baseBlock: "state" } })).startsWith("mode=auto read-only:impersonation notice:ai.block.impersonation"), true, "View as store: read-only, the support sentence");
    eq(settingsSnapshot(view({ settings: { director: "auto" } })).includes("director:auto "), true, "an explicit choice has no Default marker");
    eq(settingsSnapshot(view({ cloud: { directorFlag: false } })).includes("director:hidden"), true, "the Director section is hidden while its flag is off");
    eq(settingsSnapshot(view({ cloud: { directorDefault: "auto" } })).includes("director:auto(default)"), true, "the platform default once it is Auto");
    eq(settingsSnapshot(view({ memory: { items: [] }, activity: [] })).includes("memory:empty activity:empty"), true, "empty memory and activity: the quiet states");
    eq(settingsSnapshot(view({ credits: { used: 300, limit: 300 } })).endsWith("credits-out:month"), true, "credits used up: the reset line");
    eq(settingsSnapshot(view({ credits: { dayUsed: 75, dayLimit: 75 } })).endsWith("credits-out:day"), true, "today's credits used up");
    check(!settingsSnapshot(view({ credits: { used: 10, limit: null, dayLimit: null } })).includes("credits-out"), "no limit known: never out");
  });

  section("settings-numbers", () => {
    eq(resetDateOf("2026-10"), "2026-11-01", "October resets on 1 November");
    eq(resetDateOf("2026-12"), "2027-01-01", "December resets on 1 January");
    eq(directorShareOf(300, 60, 106), { used: 106, share: 180, kept: 120 }, "the spec's line: 106 of 180, 120 kept for copy");
    eq(directorShareOf(null, 60, 5), null, "no limit: no share line");
    eq(meterFraction(150, 300), 0.5, "half the bar");
    eq(meterFraction(400, 300), 1, "the bar never overflows");
    eq(meterFraction(5, null), null, "no limit: no bar");
    eq(cleanWords(["  premium ", "Premium", "x", "naturel", "a".repeat(41), "bio"], 2), ["premium", "naturel"], "trimmed, deduplicated case-insensitively, 2 to 40 characters, capped");
    eq(previewLine(view(), { ctaByLocale: { fr: "Je réserve" } }, "fr"), { headline: "h-fr", cta: "Je réserve" }, "the store's own button text wins in the preview");
    eq(previewLine(view(), { ctaByLocale: { fr: " " } }, "fr").cta, "Je commande", "an empty button text keeps the library's");
    check(retainsRequests("claude-fable-5-1") && !retainsRequests("claude-opus-5-5") && !retainsRequests(null), "Fable models keep requests 30 days");
  });

  section("settings-keys", () => {
    const dir = path.join(process.cwd(), "src", "components", "admin", "ai", "settings");
    const keys = literalKeys(dir);
    check(keys.length > 60, `the settings components use their keys literally (${keys.length})`);
    const en = EN as Record<string, string>;
    const fr = FR as Record<string, string>;
    const ar = AR as Record<string, string>;
    const templated = [
      ...["auto", "local", "server"].flatMap((m) => [`ai.settings.mode.label.${m}`, `ai.settings.mode.${m}`]),
      ...["auto", "ask", "off"].flatMap((d) => [`ai.settings.director.label.${d}`, `ai.settings.director.${d}`]),
      ...["copy", "photos", "rewrites", "director", "deep", "other"].map((g) => `ai.settings.group.${g}`),
      ...["voice", "fact", "avoid", "prefer", "policy"].map((k) => `ai.settings.memory.kind.${k}`),
      ...["explicit", "learned"].map((s) => `ai.settings.memory.source.${s}`),
      ...["ok", "running", "stopped", "canceled"].map((s) => `ai.settings.activity.status.${s}`),
      ...["none", "cta", "light"].map((d) => `ai.settings.voice.darija.${d}`),
      ...["ar", "fr", "en"].map((l) => `ai.settings.voice.locale.${l}`),
      ...["impersonation", "state", "role"].map((r) => `ai.settings.readonly.${r}`),
      "ai.block.state", "ai.block.quota_platform", "ai.settings.cloud_off", "ai.nav.settings",
      ...["credits_low", "director_off_with_cloud", "learning_off"].flatMap((r) => ["title", "body", "fix"].map((x) => `health.ai.${r}.${x}`)),
    ];
    for (const k of [...keys, ...templated]) check(typeof en[k] === "string" && typeof fr[k] === "string" && typeof ar[k] === "string" && !!en[k] && !!fr[k] && !!ar[k], `en, fr and ar: ${k}`);
  });

  section("health-ai", async () => {
    const { rules, fixtures } = await import("@/lib/health/rules/ai");
    const base = { store: { id: "s", timezone: "Africa/Casablanca" }, now: new Date("2026-11-10T12:00:00Z"), ai: null } as unknown as HealthInputs;
    const scope = { kind: "member", storeId: "s" } as never;
    eq(rules.map((r) => r.id).sort(), ["ai:credits_low", "ai:director_off_with_cloud", "ai:learning_off"], "the three SF-03 ai rules");
    for (const f of fixtures) {
      const rule = rules.find((r) => r.id === f.rule)!;
      const on = await rule.collect(scope, { ...base, ...f.fires } as HealthInputs);
      check(on !== null && on.id === f.rule && (f.expect?.severity === undefined || on.severity === f.expect.severity) && (f.expect?.metric === undefined || on.evidence.metric === f.expect.metric), `${f.rule}: fires on its fixture`);
      const off = await rule.collect(scope, { ...base, ...f.silent } as HealthInputs);
      check(off === null, `${f.rule}: silent on its fixture`);
      if (on) check(on.fix.kind === "link" && on.fix.href("demo").endsWith("/settings/ai"), `${f.rule}: fixes in Settings → AI`);
    }
    const low = await rules[0]!.collect(scope, { ...base, ai: { month: "2026-11", creditsUsed: 250, creditsLimit: 300, costMicros: 0 } } as HealthInputs);
    eq(low && { value: low.evidence.value, n: low.evidence.n, points: low.points }, { value: 16, n: 250, points: 3 }, "credits_low: 16 % left, n = the credits used");
    check((await rules[0]!.collect(scope, { ...base, ai: { month: "2026-11", creditsUsed: 239, creditsLimit: 300, costMicros: 0 } } as HealthInputs)) === null, "credits_low: 20 % left is not low");
    const hint = await rules[2]!.collect(scope, { ...base, aiSettings: { director: null, learning: false, cloudOn: false } } as unknown as HealthInputs);
    eq(hint?.points, 0, "learning_off is a hint: no points");
  });
}
