/**
 * Tenancy unit self-test (no database, no Next runtime):  npm run test:tenancy-unit  (tsx src/lib/tenancy/selftest.ts)
 *
 * docs/STORE-SAAS.md §J.1. Covers the pure cores of T1's tenancy modules; the database statements around them are
 * exercised by test:migrate and test:tenancy:
 *
 *  1. entitlement resolution order (override > boost > plan > default; expired, unknown and ill-typed rows skipped),
 *     the release gate and the EntitlementError reason of every false feature;
 *  2. every §A.5.2 state cap in all eight states, incl. the two-tier pending media cap and the pending caps read from
 *     the platform setting (D69), and keys the table leaves alone;
 *  3. the kill switches (§H.8): the features they force off, never take_orders;
 *  4. the AI limits computed from the month: the daily cap with its 50 / pending 10 floor (D69, AI R30), the Director
 *     share, the pending slice;
 *  5. usage metric and period validation, platform periods (the D69 sandbox day);
 *  6. lifecycle: every edge of §A.5.1, who may take it (owner, staff with step-up, jobs and their timers), the
 *     columns each edge writes;
 *  7. handles: format, reserved (static, ADMIN_GATE, platform list), protected brands (exact vs substring, look-alike
 *     folding, a disabled seed, allowProtected), history availability, the 30-day rename rule, the conversion's
 *     handle derivation (ENGC-30);
 *  8. ScopedCache bounds (entries, bytes, TTL), single flight, a delete during a load, invalidateStore;
 *  9. storeBase / storeUrl / mediaUrl per addressing mode.
 *
 * Not here yet: the `Bucket` builders (C0b, §E.8) and `landingPathFor` (T2) join when their files exist.
 */
import Module from "node:module";

// entitlements.ts, usage.ts, lifecycle.ts and their imports are marked `import "server-only"`; outside Next it throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("zod"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const env = process.env as Record<string, string | undefined>;
env.APP_SECRET ??= "selftest-tenancy-unit-0123456789-abcdefghij";
// no DATABASE_URL on purpose: nothing below may open a connection
delete env.DATABASE_URL;

let passes = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) passes++;
  else failures.push(detail ? `${name} (${detail})` : name);
}
function eq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `got ${a}, expected ${e}`);
}
function throws(name: string, fn: () => unknown, re?: RegExp): void {
  try {
    fn();
    failures.push(`${name} (did not throw)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, !re || re.test(msg), msg);
  }
}

const STORE_A = "01J0STOREA0000000000000000";
const STORE_B = "01J0STOREB0000000000000000";
const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const STATES = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"] as const;

async function main(): Promise<void> {
  const E = await import("./entitlements");
  const K = await import("./entitlement-keys");
  const U = await import("./usage");
  const L = await import("./lifecycle");
  const H = await import("./handles");
  const C = await import("./cache");
  const URLS = await import("@/lib/urls");

  const now = new Date("2026-10-24T12:00:00.000Z");
  const caps = E.DEFAULT_PENDING_CAPS;
  const base = { status: "active" as const, plan: { limits: {}, features: {} }, rows: [], submitted: false, caps, now };

  /* 1. resolution order ------------------------------------------------------------------------ */
  {
    const r = E.resolveEntitlements(base);
    eq("defaults: media_bytes 1 GiB", r.values.media_bytes, GiB);
    eq("defaults: pages_max 50", r.values.pages_max, 50);
    eq("defaults: orders_month_soft unlimited", r.values.orders_month_soft, null);
    eq("defaults: publish on", r.values.publish, true);

    const plan = { limits: { pages_max: 200, media_bytes: null, bogus: 5, members_max: -1, agents_max: 1.5 }, features: { publish: false, api_keys: true, telegram: "yes" } };
    const p = E.resolveEntitlements({ ...base, plan });
    eq("plan limit beats the default", p.values.pages_max, 200);
    eq("plan null = unlimited", p.values.media_bytes, null);
    eq("a negative plan limit is ignored", p.values.members_max, 10);
    eq("a fractional plan limit is ignored", p.values.agents_max, 10);
    eq("a non-boolean plan feature is ignored", p.values.telegram, true);
    eq("plan feature false", p.values.publish, false);
    eq("…reason plan", p.off.publish, "plan");
    eq("an R3 feature stays off in R1 even when the plan grants it", p.values.api_keys, false);
    eq("…reason release", p.off.api_keys, "release");

    const later = new Date(now.getTime() + 3_600_000);
    const earlier = new Date(now.getTime() - 1);
    const rows = [
      { key: "pages_max", source: "boost" as const, value: 300, expiresAt: later },
      { key: "pages_max", source: "override" as const, value: 400, expiresAt: null },
      { key: "members_max", source: "boost" as const, value: 25, expiresAt: later },
      { key: "agents_max", source: "override" as const, value: 99, expiresAt: earlier },
      { key: "agents_max", source: "boost" as const, value: 40, expiresAt: later },
      { key: "exports_month", source: "override" as const, value: "lots", expiresAt: null },
      { key: "nonsense_key", source: "override" as const, value: 1, expiresAt: null },
      { key: "publish", source: "override" as const, value: true, expiresAt: null },
      { key: "webhooks", source: "override" as const, value: true, expiresAt: null },
      { key: "ai_credits_month", source: "override" as const, value: null, expiresAt: null },
    ];
    const o = E.resolveEntitlements({ ...base, plan, rows });
    eq("override beats boost and plan", o.values.pages_max, 400);
    eq("boost beats plan and default", o.values.members_max, 25);
    eq("an expired override falls to the live boost", o.values.agents_max, 40);
    eq("an ill-typed override is ignored", o.values.exports_month, 50);
    eq("an override true beats the plan's false", o.values.publish, true);
    check("…and clears the plan reason", o.off.publish === undefined);
    eq("an override cannot ship an R2 feature in R1", o.values.webhooks, false);
    eq("an override null = unlimited", o.values.ai_credits_month, null);
    const expiredBoost = E.resolveEntitlements({ ...base, rows: [{ key: "pages_max", source: "boost", value: 999, expiresAt: earlier }] });
    eq("an expired boost is ignored", expiredBoost.values.pages_max, 50);
    eq("an expiry exactly now has expired", E.resolveEntitlements({ ...base, rows: [{ key: "pages_max", source: "boost", value: 7, expiresAt: now }] }).values.pages_max, 50);
    eq("no plan row: registry defaults", E.resolveEntitlements({ ...base, plan: null }).values.pages_max, 50);
    check("validEntitlementValue: 0 is a limit", E.validEntitlementValue("pages_max", 0));
    check("validEntitlementValue: NaN is not", !E.validEntitlementValue("pages_max", Number.NaN));
    check("validEntitlementValue: a number is not a feature", !E.validEntitlementValue("publish", 1));
    const all = E.resolveEntitlements(base);
    eq("every registry key resolves", Object.keys(all.values).sort(), [...K.ENTITLEMENT_KEYS].sort());
  }

  /* 2. state caps (§A.5.2) --------------------------------------------------------------------- */
  {
    const cap = <Key extends Parameters<typeof E.applyStateCap>[1]>(s: (typeof STATES)[number], key: Key, v: Parameters<typeof E.applyStateCap<Key>>[2], opts?: Parameters<typeof E.applyStateCap>[3]) =>
      E.applyStateCap(s, key, v, opts);
    const expectFeature = (keys: readonly string[], on: readonly string[]) => {
      for (const key of keys) {
        for (const s of STATES) {
          eq(`${key} in ${s}`, cap(s, key as "publish", true), on.includes(s));
          eq(`${key} in ${s} never turns a plan false on`, cap(s, key as "publish", false), false);
        }
      }
    };
    expectFeature(["publish", "take_orders"], ["active"]);
    expectFeature(["sheets", "pixels_capi", "telegram", "webhooks", "php_export", "custom_domain", "api_keys"], ["active", "restricted"]);
    expectFeature(["cloud_ai", "invites"], ["pending", "active", "restricted"]);
    for (const s of STATES) {
      eq(`mode_store untouched in ${s}`, cap(s, "mode_store", true), true);
      eq(`remove_platform_badge untouched in ${s}`, cap(s, "remove_platform_badge", true), true);
    }

    eq("ai_credits_month pending ≤ 100", cap("pending", "ai_credits_month", 300), 100);
    eq("ai_credits_month pending below 100 stays", cap("pending", "ai_credits_month", 40), 40);
    eq("ai_credits_month pending unlimited → 100", cap("pending", "ai_credits_month", null), 100);
    for (const s of ["active", "restricted"] as const) eq(`ai_credits_month ${s} = plan`, cap(s, "ai_credits_month", 300), 300);
    for (const s of ["suspended", "closed"] as const) eq(`ai_credits_month ${s} = 0`, cap(s, "ai_credits_month", 300), 0);

    eq("media pending before submit: 20 MiB", cap("pending", "media_bytes", GiB), 20 * MiB);
    eq("media pending submitted: 100 MiB", cap("pending", "media_bytes", GiB, { submitted: true }), 100 * MiB);
    eq("media pending: the plan when smaller", cap("pending", "media_bytes", 5 * MiB, { submitted: true }), 5 * MiB);
    eq("media pending unlimited plan → the cap", cap("pending", "media_bytes", null), 20 * MiB);
    const tuned = { mediaMiB: 250, mediaMiBBeforeSubmit: 30, membersMax: 4 };
    eq("media pending: tuned before-submit cap", cap("pending", "media_bytes", GiB, { caps: tuned }), 30 * MiB);
    eq("media pending: tuned submitted cap", cap("pending", "media_bytes", GiB, { submitted: true, caps: tuned }), 250 * MiB);
    for (const s of STATES.filter((x) => x !== "pending")) eq(`media ${s} = plan`, cap(s, "media_bytes", GiB, { submitted: false }), GiB);

    eq("members pending ≤ 2", cap("pending", "members_max", 10), 2);
    eq("members pending: tuned", cap("pending", "members_max", 10, { caps: tuned }), 4);
    eq("members pending: smaller plan", cap("pending", "members_max", 1), 1);
    for (const s of STATES.filter((x) => x !== "pending")) eq(`members ${s} = plan`, cap(s, "members_max", 10), 10);
    eq("exports pending = 0", cap("pending", "exports_month", 50), 0);
    for (const s of STATES.filter((x) => x !== "pending")) eq(`exports ${s} = plan`, cap(s, "exports_month", 50), 50);
    for (const s of STATES) {
      eq(`campaigns ${s} = plan`, cap(s, "campaigns_max", 20), 20);
      eq(`short_links ${s} = plan`, cap(s, "short_links_max", 200), 200);
      eq(`versions_kept ${s} = plan (never 0 for a prune)`, cap(s, "versions_kept_per_page", 30), 30);
      eq(`pages_max ${s} = plan`, cap(s, "pages_max", 50), 50);
    }

    const pend = E.resolveEntitlements({ ...base, status: "pending" });
    eq("resolved pending: publish off", pend.values.publish, false);
    eq("…reason state", pend.off.publish, "state");
    eq("resolved pending: media 20 MiB", pend.values.media_bytes, 20 * MiB);
    eq("resolved pending submitted: media 100 MiB", E.resolveEntitlements({ ...base, status: "pending", submitted: true }).values.media_bytes, 100 * MiB);
    eq("resolved pending: cloud_ai on", pend.values.cloud_ai, true);
    const susp = E.resolveEntitlements({ ...base, status: "suspended", plan: { limits: {}, features: { sheets: false } } });
    eq("a plan-off feature keeps reason plan under a state cap", susp.off.sheets, "plan");
    eq("suspended: invites reason state", susp.off.invites, "state");
  }

  /* 3. kill switches (§H.8) -------------------------------------------------------------------- */
  {
    const set = E.resolveEntitlements(base);
    const killed = E.applyKillSwitches(set, ["publishing_enabled", "ai_generation_enabled", "sheets_sync_enabled", "capi_enabled", "uploads_enabled", "signups_enabled"]);
    eq("publishing_enabled off → publish false", killed.values.publish, false);
    eq("…reason kill", killed.off.publish, "kill");
    eq("ai_generation_enabled off → cloud_ai false", killed.values.cloud_ai, false);
    eq("sheets_sync_enabled off → sheets false", killed.values.sheets, false);
    eq("capi_enabled off → pixels_capi false", killed.values.pixels_capi, false);
    eq("no kill switch touches take_orders", killed.values.take_orders, true);
    eq("telegram unaffected", killed.values.telegram, true);
    eq("the input set is not mutated", set.values.publish, true);
    const ro = E.applyKillSwitches(set, ["platform_read_only"]);
    eq("platform_read_only → publish false", ro.values.publish, false);
    eq("platform_read_only keeps orders flowing", ro.values.take_orders, true);
    const already = E.applyKillSwitches(E.resolveEntitlements({ ...base, status: "pending" }), ["publishing_enabled"]);
    eq("a feature already off keeps its first reason", already.off.publish, "state");
    for (const kill of Object.keys(E.KILL_FEATURES)) check(`KILL_FEATURES.${kill} never lists take_orders`, !E.KILL_FEATURES[kill as keyof typeof E.KILL_FEATURES].includes("take_orders"));
  }

  /* 4. AI limits from the month (D69, AI R3/R28/R30) ------------------------------------------- */
  {
    const aiCaps = { storeDailyCapPct: 25, pendingDailyFloor: 10 };
    eq("daily: active 300 → 75", E.aiDailyCreditLimit("active", 300, aiCaps), 75);
    eq("daily: active 100 → floor 50", E.aiDailyCreditLimit("active", 100, aiCaps), 50);
    eq("daily: pending 100 → 25", E.aiDailyCreditLimit("pending", 100, aiCaps), 25);
    eq("daily: pending 20 → pending floor 10", E.aiDailyCreditLimit("pending", 20, aiCaps), 10);
    eq("daily: pending floor tuned to 5", E.aiDailyCreditLimit("pending", 4, { ...aiCaps, pendingDailyFloor: 5 }), 5);
    eq("daily: ceil, not floor", E.aiDailyCreditLimit("active", 1001, aiCaps), 251);
    eq("daily: month 0 → 0", E.aiDailyCreditLimit("suspended", 0, aiCaps), 0);
    eq("daily: unlimited month, no USD ceiling → unlimited", E.aiDailyCreditLimit("active", null, aiCaps), null);
    eq("daily: unlimited month with USD ceiling", E.aiDailyCreditLimit("active", null, { ...aiCaps, dailyUsdPerStore: 2 }), 200);
    eq("daily: the USD ceiling caps the percentage", E.aiDailyCreditLimit("active", 1500, { ...aiCaps, dailyUsdPerStore: 3 }), 300);
    eq("daily: the pending month cap then the pending floor", E.aiDailyCreditLimit("pending", E.applyStateCap("pending", "ai_credits_month", 1500), aiCaps), 25);
    eq("director: 60 % of 300", E.directorCreditLimit(300, 60), 180);
    eq("director: rounds down", E.directorCreditLimit(55, 60), 33);
    eq("director: unlimited", E.directorCreditLimit(null, 60), null);
    eq("pending slice: 10 % of $200", E.pendingAiSliceMicros(200, 10), 20_000_000);
  }

  /* 5. usage metrics and periods --------------------------------------------------------------- */
  {
    const tz = "Africa/Casablanca";
    eq("usageMetric gauge period", K.usageMetric("media_bytes", now, tz), { metric: "media_bytes", period: "total" });
    eq("usageMetric month in the store zone", K.usageMetric("ai_credits", new Date("2026-10-31T23:30:00Z"), "Asia/Tokyo"), { metric: "ai_credits", period: "2026-11" });
    eq("usageMetric day", K.usageMetric("ai_credits_day", now, tz).period, "2026-10-24");
    U.checkStoreMetric({ metric: "exports", period: "2026-10" });
    passes++;
    throws("a month metric refuses a day period", () => U.checkStoreMetric({ metric: "exports", period: "2026-10-24" }), /bad period/);
    throws("a gauge refuses a month", () => U.checkStoreMetric({ metric: "pages", period: "2026-10" }), /bad period/);
    throws("an unknown metric", () => U.checkStoreMetric({ metric: "nope" as "pages", period: "total" }), /unknown metric/);
    throws("month 13", () => U.checkStoreMetric({ metric: "exports", period: "2026-13" }), /bad period/);
    eq("platform day (D69 sandboxes)", U.platformPeriodOf("day", new Date("2026-10-24T23:59:59Z")), "2026-10-24");
    eq("platform month", U.platformPeriodOf("month", now), "2026-10");
    eq("platform hour", U.platformPeriodOf("hour", new Date("2026-10-24T07:05:00Z")), "2026-10-24T07");
    U.checkPlatformMetric("pending_stores", "2026-10-24");
    U.checkPlatformMetric("pending_media_bytes", "total");
    U.checkPlatformMetric("mail_sent", "2026-10-24T07");
    U.checkPlatformMetric("ai_cost_micros_pending", "2026-10");
    passes += 4;
    throws("pending_stores is per day", () => U.checkPlatformMetric("pending_stores", "2026-10"), /bad period/);
    throws("pending_media_bytes is a gauge", () => U.checkPlatformMetric("pending_media_bytes", "2026-10-24"), /bad period/);
    throws("ai_cost_micros is per month", () => U.checkPlatformMetric("ai_cost_micros", "total"), /bad period/);
    throws("an unknown platform metric", () => U.checkPlatformMetric("disk" as "mail_sent", "total"), /unknown platform metric/);
    const q = new U.QuotaError({ metric: "pages", period: "total" }, 50, 50);
    check("QuotaError carries metric, limit, used", q.limit === 50 && q.used === 50 && q.metric.metric === "pages" && q instanceof Error);
    check("entitlements re-exports QuotaError", E.QuotaError === U.QuotaError);
  }

  /* 6. lifecycle (§A.5.1) ---------------------------------------------------------------------- */
  {
    const user = { id: "01J0USER000000000000000000" } as never;
    const actor = { kind: "user", userId: "01J0USER000000000000000000", impersonatorId: null, ip: null } as const;
    const ownerCtx = (storeId: string, canClose = true) =>
      ({ user, store: { id: storeId }, membership: { role: "owner", status: "active" }, scope: { storeId, kind: "member" }, actor, impersonation: null, stepUpUntil: null, can: (p: string) => canClose && p === "store.close" }) as never;
    const staff = (perms: string[], stepUpFresh: boolean) => ({ user, role: "admin", actor: { ...actor, kind: "platform" }, can: (p: string) => perms.includes(p), stepUpFresh, stepUpUntil: null }) as never;
    const job = { job: "lifecycle", actor: { kind: "system", userId: null, impersonatorId: null, ip: null } } as never;
    const facts = (from: string, to: string, extra: Partial<Parameters<typeof L.checkTransition>[2]> = {}) =>
      ({ from, to, now, purgeAfter: null, statusChangedAt: null, closedFrom: null, ...extra }) as Parameters<typeof L.checkTransition>[2];
    const allowed = (name: string, fn: () => unknown) => {
      try {
        fn();
        passes++;
      } catch (err) {
        failures.push(`${name} (${err instanceof Error ? err.message : String(err)})`);
      }
    };
    const refused = (name: string, code: string, fn: () => unknown) => {
      try {
        fn();
        failures.push(`${name} (allowed)`);
      } catch (err) {
        check(name, err instanceof L.LifecycleError && err.code === code, err instanceof Error ? err.message : String(err));
      }
    };

    // the edge table
    const edges: [string, string][] = [
      ["pending", "active"], ["pending", "rejected"], ["rejected", "pending"], ["active", "restricted"], ["restricted", "active"],
      ["active", "suspended"], ["restricted", "suspended"], ["suspended", "active"], ["suspended", "restricted"],
      ["active", "closed"], ["restricted", "closed"], ["suspended", "closed"], ["pending", "closed"],
      ["closed", "active"], ["closed", "restricted"], ["closed", "suspended"], ["closed", "pending"],
      ["closed", "scheduled_deletion"], ["scheduled_deletion", "closed"], ["scheduled_deletion", "purged"], ["rejected", "purged"],
    ];
    for (const [f, t] of edges) check(`edge ${f} → ${t}`, L.findEdge(f as never, t as never) !== null);
    let none = 0;
    for (const f of STATES) for (const t of STATES) if (!edges.some(([a, b]) => a === f && b === t) && L.findEdge(f, t)) none++;
    eq("no other edge exists (purged is terminal, nothing skips a step)", none, 0);
    eq("pending → active is audited as an approval", L.findEdge("pending", "active")?.audit.staff, "platform.signup.approved");
    eq("pending → active notifies signup.approved", L.findEdge("pending", "active")?.notify, "signup.approved");
    eq("→ suspended notifies store.suspended", L.findEdge("restricted", "suspended")?.notify, "store.suspended");
    eq("suspended → restricted notifies store.restored", L.findEdge("suspended", "restricted")?.notify, "store.restored");
    eq("closed → previous notifies store.reopened", L.findEdge("closed", "active")?.notify, "store.reopened");
    eq("scheduled_deletion → closed notifies deletion_cancelled", L.findEdge("scheduled_deletion", "closed")?.notify, "store.deletion_cancelled");
    eq("the purge notifies nobody", L.findEdge("scheduled_deletion", "purged")?.notify, null);

    // owners
    allowed("owner closes an active store", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("active", "closed")));
    allowed("owner closes a pending store", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("pending", "closed")));
    refused("owner of B cannot close A", "forbidden", () => L.checkTransition(ownerCtx(STORE_B), STORE_A, facts("active", "closed")));
    refused("a member without store.close cannot close", "forbidden", () => L.checkTransition(ownerCtx(STORE_A, false), STORE_A, facts("active", "closed")));
    refused("owner cannot restrict", "forbidden", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("active", "restricted")));
    refused("owner cannot approve", "forbidden", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("pending", "active")));
    const window = new Date(now.getTime() + 86_400_000);
    allowed("owner reopens to active within 30 days", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("closed", "active", { closedFrom: "active", purgeAfter: window })));
    allowed("owner reopens to restricted", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("closed", "restricted", { closedFrom: "restricted", purgeAfter: window })));
    refused("owner reopens to another state than before", "invalid", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("closed", "active", { closedFrom: "restricted", purgeAfter: window })));
    refused("owner cannot reopen a store closed from suspended", "forbidden", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("closed", "suspended", { closedFrom: "suspended", purgeAfter: window })));
    refused("owner cannot reopen a store closed from pending", "forbidden", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("closed", "pending", { closedFrom: "pending", purgeAfter: window })));
    refused("owner cannot reopen when the previous state is unknown", "invalid", () => L.checkTransition(ownerCtx(STORE_A), STORE_A, facts("closed", "active", { purgeAfter: window })));
    refused("nobody reopens after 30 days", "invalid", () => L.checkTransition(staff(["stores.close"], true), STORE_A, facts("closed", "active", { closedFrom: "active", purgeAfter: now })));

    // staff
    allowed("signups.decide approves", () => L.checkTransition(staff(["signups.decide"], false), STORE_A, facts("pending", "active")));
    refused("approving needs signups.decide", "forbidden", () => L.checkTransition(staff(["stores.lifecycle"], true), STORE_A, facts("pending", "active")));
    allowed("restrict needs no step-up", () => L.checkTransition(staff(["stores.lifecycle"], false), STORE_A, facts("active", "restricted")));
    refused("suspend needs a step-up", "step_up", () => L.checkTransition(staff(["stores.lifecycle"], false), STORE_A, facts("active", "suspended")));
    allowed("suspend with a step-up", () => L.checkTransition(staff(["stores.lifecycle"], true), STORE_A, facts("restricted", "suspended")));
    refused("staff close needs a step-up", "step_up", () => L.checkTransition(staff(["stores.close"], false), STORE_A, facts("active", "closed")));
    allowed("staff reopen to the previous state (no step-up)", () => L.checkTransition(staff(["stores.close"], false), STORE_A, facts("closed", "suspended", { closedFrom: "suspended", purgeAfter: window })));
    allowed("staff reopen with the previous state unknown", () => L.checkTransition(staff(["stores.close"], false), STORE_A, facts("closed", "pending", { purgeAfter: window })));
    allowed("staff schedule the deletion early (step-up)", () => L.checkTransition(staff(["stores.close"], true), STORE_A, facts("closed", "scheduled_deletion", { purgeAfter: window })));
    refused("cancel deletion needs stores.purge", "forbidden", () => L.checkTransition(staff(["stores.close"], true), STORE_A, facts("scheduled_deletion", "closed")));
    allowed("cancel deletion with stores.purge + step-up", () => L.checkTransition(staff(["stores.purge"], true), STORE_A, facts("scheduled_deletion", "closed")));
    refused("staff cannot write a tombstone", "forbidden", () => L.checkTransition(staff(["stores.purge", "stores.close"], true), STORE_A, facts("scheduled_deletion", "purged")));
    refused("not an edge: active → pending", "invalid", () => L.checkTransition(staff(["stores.lifecycle"], true), STORE_A, facts("active", "pending")));
    refused("not an edge: purged → active", "invalid", () => L.checkTransition(staff(["stores.close", "stores.lifecycle"], true), STORE_A, facts("purged", "active")));

    // jobs
    refused("the cron waits for purge_after", "invalid", () => L.checkTransition(job, STORE_A, facts("closed", "scheduled_deletion", { purgeAfter: window })));
    allowed("the cron schedules after purge_after", () => L.checkTransition(job, STORE_A, facts("closed", "scheduled_deletion", { purgeAfter: new Date(now.getTime() - 1) })));
    allowed("an executed purge request schedules at once (purgeAt)", () => L.checkTransition(job, STORE_A, facts("closed", "scheduled_deletion", { purgeAfter: window, purgeAt: now })));
    refused("the purge waits 24 h", "invalid", () => L.checkTransition(job, STORE_A, facts("scheduled_deletion", "purged", { purgeAfter: window })));
    allowed("the purge after its delay", () => L.checkTransition(job, STORE_A, facts("scheduled_deletion", "purged", { purgeAfter: now })));
    refused("a rejected store waits 30 days", "invalid", () => L.checkTransition(job, STORE_A, facts("rejected", "purged", { statusChangedAt: new Date(now.getTime() - 29 * 86_400_000) })));
    allowed("a rejected store is purged after 30 days", () => L.checkTransition(job, STORE_A, facts("rejected", "purged", { statusChangedAt: new Date(now.getTime() - 30 * 86_400_000) })));
    refused("a job cannot approve", "forbidden", () => L.checkTransition(job, STORE_A, facts("pending", "active")));

    // columns
    const at = now.getTime();
    eq("close: closed_at + purge_after 30 d", L.transitionColumns("active", "closed", now, { userId: null }), { closed_at: now, purge_after: new Date(at + 30 * 86_400_000) });
    eq("reopen clears both", L.transitionColumns("closed", "active", now, { userId: null }), { closed_at: null, purge_after: null });
    eq("schedule: purge_after + 24 h", L.transitionColumns("closed", "scheduled_deletion", now, { userId: null }), { purge_after: new Date(at + 86_400_000) });
    eq("schedule with purgeAt", L.transitionColumns("closed", "scheduled_deletion", now, { userId: null, purgeAt: now }), { purge_after: now });
    eq("cancel deletion: a fresh 30 days", L.transitionColumns("scheduled_deletion", "closed", now, { userId: null }), { purge_after: new Date(at + 30 * 86_400_000) });
    eq("approval stamps approved_*", L.transitionColumns("pending", "active", now, { userId: "U1" }), { approved_at: now, approved_by: "U1" });
    eq("purge writes the tombstone", L.transitionColumns("scheduled_deletion", "purged", now, { userId: null }), { handle: null, name: "(purged)", purge_after: null });
    eq("restrict writes nothing else", L.transitionColumns("active", "restricted", now, { userId: "U1" }), {});
  }

  /* 7. handles (§C.7) -------------------------------------------------------------------------- */
  {
    const lists = { reserved: new Set<string>(["vip-shop"]), terms: H.handleLists().terms, at: 1 };
    for (const ok of ["abc", "nour-shop", "a1b", "store-1", "x".repeat(30)]) check(`isHandle ${ok}`, H.isHandle(ok));
    for (const bad of ["ab", "x".repeat(31), "-ab", "ab-", "Nour", "nour_shop", "xn--abc", "ab--c", "nour shop", "é-shop"]) check(`isHandle refuses ${bad}`, !H.isHandle(bad));
    eq("format", H.handleProblem("ab", {}, lists), "format");
    eq("static reserved", H.handleProblem("admin", {}, lists), "reserved");
    eq("static /app segment", H.handleProblem("account", {}, lists), "reserved");
    eq("platform.reservedHandles", H.handleProblem("vip-shop", {}, lists), "reserved");
    env.ADMIN_GATE = "Gate-Secret-Path";
    eq("the ADMIN_GATE value, case-insensitively", H.handleProblem("gate-secret-path", {}, lists), "reserved");
    delete env.ADMIN_GATE;
    eq("ADMIN_GATE unset: free", H.handleProblem("gate-secret-path", {}, lists), null);
    const protectedOnes = ["meta-support", "facebook-ma", "face-b00k", "my-instagram-shop", "cih-bank", "cihbank", "bank-of-nour", "visa-ma", "store-gen", "amana", "paypal-help", "jumia-deals", "c1h-pay"];
    for (const h of protectedOnes) eq(`protected ${h}`, H.handleProblem(h, {}, lists), "protected");
    const free = ["metal-art", "visage-beauty", "pineapple-juice", "posters-ma", "nour-shop", "governor-tea", "policeman-toys"];
    for (const h of free) eq(`not protected ${h}`, H.handleProblem(h, {}, lists), null);
    eq("allowProtected (staff, one signup)", H.handleProblem("cih-bank", { allowProtected: true }, lists), null);
    eq("allowProtected never lifts a reservation", H.handleProblem("admin", { allowProtected: true }, lists), "reserved");
    const disabled = { ...lists, terms: lists.terms.filter((t) => t.term !== "meta") };
    eq("a seed disabled in the console frees the term", H.handleProblem("meta-support", {}, disabled), null);
    const added = { ...lists, terms: [...lists.terms, { term: "nourstore", match: "exact" as const }] };
    eq("a staff-added exact term", H.handleProblem("nour-store", {}, added), "protected");
    eq("…before it was added", H.handleProblem("nour-store", {}, lists), null);
    check("handleUsesBrand: exact by part", H.handleUsesBrand("shop-cmi", [{ term: "cmi", match: "exact" }]));
    check("handleUsesBrand: exact not inside a part", !H.handleUsesBrand("cmiel", [{ term: "cmi", match: "exact" }]));
    check("handleUsesBrand: substring inside", H.handleUsesBrand("cmiel", [{ term: "cmi", match: "substring" }]));
    eq("foldBrand", H.foldBrand("F4ceB00K$"), "facebooks");
    check("the default snapshot is the seeded list", H.handleLists().terms.length > 30 && H.handleLists().at === 0);

    const h = (current: boolean, history: { storeId: string; reservedUntil: Date } | null, ownStoreId: string | null = null) => H.handleFree({ current, history, now, ownStoreId });
    const future = new Date(now.getTime() + 1000);
    check("free: no row anywhere", h(false, null));
    check("taken: another store's current handle", !h(true, null));
    check("taken: own current handle too", !h(true, null, STORE_A));
    check("taken: reserved in history", !h(false, { storeId: STORE_B, reservedUntil: future }));
    check("free: reservation expired", h(false, { storeId: STORE_B, reservedUntil: now }));
    check("free: a store takes back its own old handle", h(false, { storeId: STORE_A, reservedUntil: future }, STORE_A));
    check("taken: another store's quarantine for a rename", !h(false, { storeId: STORE_B, reservedUntil: future }, STORE_A));

    const created = new Date("2026-10-01T00:00:00Z");
    eq("rename: 30 days after creation", H.nextRenameAt(created, null).toISOString(), "2026-10-31T00:00:00.000Z");
    eq("rename: 30 days after the last rename", H.nextRenameAt(created, new Date("2026-12-01T00:00:00Z")).toISOString(), "2026-12-31T00:00:00.000Z");
    const err = new H.HandleError("too_soon", null, created);
    check("HandleError carries code and retryAt", err.code === "too_soon" && err.retryAt === created);

    // ENGC-30: the conversion's derivation (the JS twin of §D.8 S1)
    eq("name → handle", H.handleFromName("Boutique Nour", lists), "boutique-nour");
    eq("accents are runs, like S1", H.handleFromName("Café Nour", lists), "caf-nour");
    eq("trims hyphens", H.handleFromName("  --Shop Nour!! ", lists), "shop-nour");
    eq("cut to 30, then trimmed", H.handleFromName("the very long store name of nour - deluxe", lists), "the-very-long-store-name-of-no");
    eq("a cut landing on a hyphen is trimmed", H.handleFromName("abcdefghijklmnopqrstuvwxyzabc def", lists), "abcdefghijklmnopqrstuvwxyzabc");
    eq("Arabic only → nothing usable (store-1)", H.handleFromName("متجر نور", lists), null);
    eq("reserved → null", H.handleFromName("Admin", lists), null);
    eq("protected → null", H.handleFromName("CIH Bank", lists), null);
    eq("too short → null", H.handleFromName("A", lists), null);
    eq("the slug collapses \"--\" (so the xn-- rule never fires here)", H.handleFromName("xn--shop", lists), "xn-shop");
  }

  /* 8. ScopedCache and invalidateStore (§E.6) -------------------------------------------------- */
  {
    const lru = new C.ScopedCache<number>({ name: "t-lru", maxEntries: 3, ttlMs: 60_000 });
    lru.set(STORE_A, "a", 1);
    lru.set(STORE_A, "b", 2);
    lru.set(STORE_B, "c", 3);
    lru.get(STORE_A, "a"); // a is now the most recent
    lru.set(STORE_B, "d", 4);
    check("LRU evicts the least recent (b)", lru.get(STORE_A, "b") === undefined && lru.get(STORE_A, "a") === 1 && lru.get(STORE_B, "d") === 4);
    eq("LRU bounded by entries", lru.stats().entries, 3);
    check("a store's key never answers another store", lru.get(STORE_B, "a") === undefined);

    const bytes = new C.ScopedCache<string>({ name: "t-bytes", maxEntries: 100, maxBytes: 80, ttlMs: 60_000, sizeOf: (v) => v.length });
    bytes.set(STORE_A, "big", "x".repeat(11));
    check("an entry over 1/8 of maxBytes is not stored", bytes.get(STORE_A, "big") === undefined);
    for (let i = 0; i < 12; i++) bytes.set(STORE_A, `k${i}`, "y".repeat(10));
    check("bounded by bytes", bytes.stats().bytes <= 80, String(bytes.stats().bytes));
    throws("maxBytes needs sizeOf", () => new C.ScopedCache({ name: "t-bad", maxEntries: 1, maxBytes: 10, ttlMs: 1 }), /sizeOf/);
    throws("a store id with the separator is refused", () => lru.get("a\u0000b", "x"), /bad store id/);
    throws("an empty store id is refused", () => lru.set("", "x", 1), /bad store id/);

    const ttl = new C.ScopedCache<number>({ name: "t-ttl", maxEntries: 10, ttlMs: 20 });
    ttl.set(STORE_A, "x", 1);
    ttl.set(STORE_A, "long", 2, { ttlMs: 60_000 });
    check("null is a cached value", ttl.set(STORE_A, "n", null as never) === null && ttl.get(STORE_A, "n") === null);
    await new Promise((r) => setTimeout(r, 40));
    check("expired after ttlMs", ttl.get(STORE_A, "x") === undefined);
    check("a per-entry ttl overrides", ttl.get(STORE_A, "long") === 2);

    const flight = new C.ScopedCache<number>({ name: "t-flight", maxEntries: 10, ttlMs: 60_000 });
    let loads = 0;
    const slow = () => new Promise<number>((r) => setTimeout(() => r(++loads), 10));
    const [x, y] = await Promise.all([flight.getOrLoad(STORE_A, "k", slow), flight.getOrLoad(STORE_A, "k", slow)]);
    check("single flight: one load for concurrent callers", loads === 1 && x === 1 && y === 1);
    let failed = 0;
    await flight.getOrLoad(STORE_A, "bad", () => Promise.reject(new Error("boom"))).catch(() => failed++);
    eq("a failed load is not cached", await flight.getOrLoad(STORE_A, "bad", async () => 7), 7);
    check("…and rejected its caller", failed === 1);
    const pending = flight.getOrLoad(STORE_B, "race", () => new Promise<number>((r) => setTimeout(() => r(1), 15)));
    flight.delete(STORE_B);
    await pending;
    check("a delete during a load drops the stale result", flight.get(STORE_B, "race") === undefined);

    const one = C.scopedCache<number>({ name: "t-shared", maxEntries: 10, ttlMs: 60_000 });
    const two = C.scopedCache<number>({ name: "t-shared", maxEntries: 99, ttlMs: 1 });
    check("scopedCache by name is one cache per process", one === two);
    one.set(STORE_A, "x", 1);
    one.set(STORE_B, "x", 2);
    const other = C.scopedCache<number>({ name: "t-other", maxEntries: 10, ttlMs: 60_000 });
    other.set(STORE_A, "y", 3);
    let invalidated = "";
    C.onStoreInvalidated("t-legacy", (id) => (invalidated = id));
    C.onStoreInvalidated("t-throws", () => {
      throw new Error("ignored");
    });
    const quiet = console.error;
    console.error = () => undefined;
    try {
      C.invalidateStore(STORE_A);
    } finally {
      console.error = quiet;
    }
    check("invalidateStore drops the store from every cache", one.get(STORE_A, "x") === undefined && other.get(STORE_A, "y") === undefined);
    check("…and keeps other stores", one.get(STORE_B, "x") === 2);
    eq("…and calls the registered invalidators (a throwing one does not stop it)", invalidated, STORE_A);
  }

  /* 9. URL builders per addressing mode (§C.6) ------------------------------------------------- */
  {
    const store = { id: STORE_A, handle: "nour-shop", primaryDomain: "shop.nour.ma" };
    env.PLATFORM_URL = "https://app.example.com";
    delete env.STORE_ROOT_DOMAIN;
    delete env.EDGE_KEY;
    eq("P: addressMode", URLS.addressMode(store), "P");
    eq("P: storeBase", URLS.storeBase(store), "/s/nour-shop");
    eq("P: store home has no trailing slash", URLS.storeUrl(store), "https://app.example.com/s/nour-shop");
    eq("P: storeUrl", URLS.storeUrl(store, "/promo"), "https://app.example.com/s/nour-shop/promo");
    eq("P: mediaUrl is relative", URLS.mediaUrl(store, "ab c"), "/media/ab%20c");
    env.STORE_ROOT_DOMAIN = "stores.example.com";
    eq("STORE_ROOT_DOMAIN without EDGE_KEY stays P", URLS.addressMode(store), "P");
    env.EDGE_KEY = "k".repeat(32);
    eq("S: addressMode", URLS.addressMode(store), "S");
    eq("S: storeBase", URLS.storeBase(store), "");
    eq("S: storeUrl", URLS.storeUrl(store, "/promo"), "https://nour-shop.stores.example.com/promo");
    eq("S: store home", URLS.storeUrl(store), "https://nour-shop.stores.example.com/");
    eq("S: mediaUrl on the platform host", URLS.mediaUrl(store, "k1"), "https://app.example.com/media/k1");
    eq("C is ignored before R3", URLS.addressMode(store), "S");
    eq("appHref", URLS.appHref("nour-shop", "/orders"), "/app/nour-shop/orders");
    delete env.STORE_ROOT_DOMAIN;
    delete env.EDGE_KEY;
    delete env.PLATFORM_URL;
  }
}

main().then(
  () => {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.log(`\ntenancy unit selftest: ${passes} passed, ${failures.length} failed`);
    if (failures.length) process.exit(1);
  },
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
