/**
 * test:ai section of the policy (P7 AI; ai.md AI-§A.4, AI-§C.2, AI-§C.3; step 6 of the P7 plan). Registered by
 * src/lib/ai/selftest.ts, which owns the runner and the budget. Pure: `buildPolicy()` over hand-made inputs, no DB.
 *
 *   policy-order   every cloud block in the AI-§A.4 order: each input turned bad alone gives its own block, and with
 *                  every later input bad too the first one still wins; impersonation (D70) wins over all of them and
 *                  empties `live`, turns the local rung off and hides the counters; `quota_director` is never a cloud
 *                  block (copy stays available, the Director line says why); the deep line and its transport; the
 *                  periods of `periodRangeUtc` around a month and a DST-free zone.
 */
import { DIRECTOR_PASS_CREDITS_P90, buildPolicy, type CloudBlock, type PolicyInputs } from "./policy";
import { periodRangeUtc, zoneOffsetMs } from "./quota/periods";
import type { SelftestApi } from "./selftest-guard";

function inputs(patch: { cloud?: Partial<PolicyInputs["cloud"]>; director?: Partial<PolicyInputs["director"]>; deep?: Partial<PolicyInputs["deep"]> } = {}): PolicyInputs {
  return {
    cloud: {
      impersonation: false,
      enabled: true,
      hasKey: true,
      monthlyUsd: 100,
      generationOn: true,
      paused: false,
      entitlement: "ok",
      mode: "auto",
      creditsLeft: 120,
      dayLeft: 40,
      platformLeftMicros: 5_000_000,
      pending: false,
      pendingLeftMicros: 1_000_000,
      ...patch.cloud,
    },
    director: { flagOn: true, storeChoice: null, autoDefault: false, classDown: false, passesLeft: 30, shareLeft: 180, ...patch.director },
    deep: { storeDeepPass: true, classDown: false, passesLeft: 5, jobRunning: false, batchAlways: false, ...patch.deep },
    directorPassCredits: DIRECTOR_PASS_CREDITS_P90,
    local: { enabled: true, tierMax: "full", bgRemoval: true },
    live: ["copy.page", "analyze", "design.plan"],
    autoPrefersCloud: { analyze: true },
    transport: "stream",
    promptVersions: { "copy.page": "copy.page@l1" },
    voiceLocal: "Tone: warm.",
    workerName: "Store Gen AI",
  };
}

/** Each block with the single input that produces it, in the AI-§A.4 order. */
const ORDER: readonly [CloudBlock, Partial<PolicyInputs["cloud"]>][] = [
  ["platform_off", { enabled: false }],
  ["no_key", { hasKey: false }],
  ["no_cap", { monthlyUsd: null }],
  ["kill", { generationOn: false }],
  ["paused", { paused: true }],
  ["entitlement", { entitlement: "entitlement" }],
  ["store_local_only", { mode: "local" }],
  ["quota_store", { creditsLeft: 0 }],
  ["quota_day", { dayLeft: 0 }],
  ["quota_platform", { platformLeftMicros: 0 }],
  ["quota_platform_pending", { pending: true, pendingLeftMicros: 0 }],
];

export function registerPolicySections(t: SelftestApi): void {
  const { section, check, eq } = t;

  section("policy-order", () => {
    const ok = buildPolicy(inputs());
    check(ok.cloud.available && ok.cloud.block === null, "all inputs good: the cloud is available");
    eq([ok.cloud.director, ok.cloud.directorBlock, ok.cloud.directorPassCredits], ["ask", null, 53], "the Director line: the platform default ask, 53 credits a pass");
    check(ok.cloud.deepPass && ok.cloud.deepTransport === "job", "the deep line: available, pattern B");

    ORDER.forEach(([block, alone], i) => {
      eq(buildPolicy(inputs({ cloud: alone })).cloud.block, block, `${block} alone`);
      const laterBad = Object.assign({}, ...ORDER.slice(i).map(([, p]) => p)) as Partial<PolicyInputs["cloud"]>;
      eq(buildPolicy(inputs({ cloud: laterBad })).cloud.block, block, `${block} first with every later input bad too`);
    });
    eq(buildPolicy(inputs({ cloud: { entitlement: "state" } })).cloud.block, "state", "the state cap inside the entitlement line");
    eq(buildPolicy(inputs({ cloud: { pending: false, pendingLeftMicros: 0 } })).cloud.block, null, "a spent pending share never blocks an approved store");
    const blocked = buildPolicy(inputs({ cloud: { creditsLeft: 0 } }));
    eq([blocked.cloud.director, blocked.cloud.deepPass], ["unavailable", false], "a cloud block takes the Director and the deep pass with it");
    check(blocked.live.length === 3 && blocked.local.enabled, "a cloud block leaves the live list and the local rung");

    const all = Object.assign({}, ...ORDER.map(([, p]) => p)) as Partial<PolicyInputs["cloud"]>;
    const imp = buildPolicy(inputs({ cloud: { ...all, impersonation: true } }));
    eq(imp.cloud.block, "state", "impersonation wins over every other block");
    eq([imp.live, imp.local.enabled, imp.cloud.creditsLeft, imp.cloud.dayLeft, imp.cloud.directorPassesLeft, imp.voiceLocal, imp.promptVersions], [[], false, null, null, null, "", {}], "impersonation: nothing live, local off, no counter shown");

    const share = buildPolicy(inputs({ director: { shareLeft: 0 } }));
    check(share.cloud.available && share.cloud.block === null, "quota_director is never a cloud block: copy stays available");
    eq([share.cloud.director, share.cloud.directorBlock], ["unavailable", "quota_director"], "the Director share spent: unavailable with quota_director");
    eq(buildPolicy(inputs({ director: { passesLeft: 0 } })).cloud.directorBlock, "passes_day", "the passes of the day spent");
    eq(buildPolicy(inputs({ director: { classDown: true } })).cloud.directorBlock, "class_down", "the interactive class down");
    eq(buildPolicy(inputs({ director: { flagOn: false } })).cloud.director, "unavailable", "the release flag off");
    eq(buildPolicy(inputs({ director: { storeChoice: "off" } })).cloud.director, "off", "the store's own choice");
    eq(buildPolicy(inputs({ director: { autoDefault: true } })).cloud.director, "auto", "the platform default once the preference test passed");
    eq(buildPolicy(inputs({ deep: { jobRunning: true } })).cloud.deepPass, false, "one deep job at a time");
    eq(buildPolicy(inputs({ deep: { passesLeft: 0 } })).cloud.deepPass, false, "the deep passes of the day spent");
    eq(buildPolicy(inputs({ deep: { batchAlways: true } })).cloud.deepTransport, "batch", "deepTransport batch only with batch = always");

    // the store-time periods the usage reads sum ai_runs over
    eq(zoneOffsetMs(Date.UTC(2026, 0, 15, 12), "UTC"), 0, "UTC has no offset");
    eq(zoneOffsetMs(Date.UTC(2026, 0, 15, 12), "Asia/Tokyo"), 9 * 3_600_000, "Tokyo is UTC+9 (no DST)");
    const nov = periodRangeUtc("2026-11", "Asia/Tokyo");
    eq([nov.start.toISOString(), nov.end.toISOString()], ["2026-10-31T15:00:00.000Z", "2026-11-30T15:00:00.000Z"], "a Tokyo month in UTC");
    const dec = periodRangeUtc("2026-12", "UTC");
    eq(dec.end.toISOString(), "2027-01-01T00:00:00.000Z", "December ends at the next year");
    const day = periodRangeUtc("2026-11-03", "Asia/Tokyo");
    eq([day.start.toISOString(), day.end.toISOString()], ["2026-11-02T15:00:00.000Z", "2026-11-03T15:00:00.000Z"], "a Tokyo day in UTC");
    let threw = false;
    try {
      periodRangeUtc("2026-13", "UTC");
    } catch {
      threw = true;
    }
    check(threw, "a bad period throws");
  });
}
