/**
 * test:jobs, the purge's, lifecycle's and retention's sections (P8 step 10; docs/STORE-SAAS.md §F.9, §H.9, §H.11,
 * §A.5.1, ENGC-31, SEC-20, SEC-21). Loaded by ./selftest.ts after its server-only stub. Offline: pure modules only (the
 * job itself runs against MariaDB and a temp DATA_DIR in test:storage's `purge` section).
 *
 *  purge: registration   purge in slot 5 (tick, ≤ the slot's 11 s, after backup and exports), lifecycle in slot 7
 *                        (tick, ≤ 2 s)
 *  purge: plan           purgePlan() invariants: every schema.ts tenant table exactly once (deleted or kept), the
 *                        KEEP list excluded, the queue tables first, every ai_* table in group 1, the shingles by
 *                        owner_tag, the §F.9 order, every per-store DATA_AREAS area once and before the media rows,
 *                        media_chunks just before media_files, store_health last; a new table lands before pages
 *  purge: redaction      redactMetaForPurge on fixtures: the explicit PII keys, *_norm and …Norm, the audit secret
 *                        rule, nested objects and arrays, null kept, other keys and values kept, JSON strings
 *  purge: reason         purgeReasonOf: scheduled_deletion past purge_after, rejected for 30 days, nothing else;
 *                        the plan signature a resumed cursor is checked against; the shingles' owner tag
 *  retention: cutoffs    the §H.11 cutoff table at a fixed instant, every statement bounded, the daily metrics
 */
import { randomBytes } from "node:crypto";
import type { Job } from "./runner";
import type { Harness } from "./testing/harness";

type Plan = typeof import("./purge/plan");
type Redact = typeof import("./purge/redact");
type Retention = typeof import("./retention");
type Slots = typeof import("./slots");
type PurgeJob = typeof import("./purge");

export interface PurgeSectionDeps {
  PL: Plan;
  RD: Redact;
  RT: Retention;
  S: Slots;
  PJ: PurgeJob;
  JOBS: readonly Job[];
}

const DAY = 86_400_000;

export function purgeSections(h: Harness, d: PurgeSectionDeps): void {
  const { PL, RD, RT, S, PJ, JOBS } = d;

  h.section("purge: registration", (t) => {
    const purge = JOBS.find((j) => j.name === "purge");
    const life = JOBS.find((j) => j.name === "lifecycle");
    t.check("purge: slot 5, every tick", !!purge && S.slotOf(purge) === "5" && purge.every === "tick");
    t.check("…≤ slot 5's 11 s (§F.9's 15 s does not fit the slot: recorded drift)", !!purge && purge.budgetMs === 11_000 && purge.budgetMs <= S.maxJobBudgetMs("5"));
    const five = JOBS.filter((j) => S.slotOf(j) === "5").map((j) => j.name);
    t.check("…after the backup and the exports in slot 5", five.indexOf("purge") > five.indexOf("backup") && five.indexOf("purge") > five.indexOf("exports"));
    t.check("lifecycle: slot 7, every tick, ≤ 2 s", !!life && S.slotOf(life) === "7" && life.every === "tick" && life.budgetMs <= 2_000);
    t.eq("the budget rules still hold", S.jobBudgetProblems(JOBS), []);
  });

  h.section("purge: plan", (t) => {
    const tenant = PL.schemaTenantTables();
    const plan = PL.purgePlan();
    const rows = plan.steps.filter((s) => s.kind === "rows");
    const byStore = rows.filter((s) => s.by === "store_id").map((s) => s.table);
    const at = (pred: (s: (typeof plan.steps)[number]) => boolean) => plan.steps.findIndex(pred);
    const tableAt = (name: string) => at((s) => s.kind === "rows" && s.table === name);
    const areaAt = (name: string) => at((s) => s.kind === "area" && s.area === name);

    t.check(`schema.ts has tenant tables (${tenant.length})`, tenant.length >= 50 && tenant.includes("orders") && !tenant.includes("stores"));
    t.eq("every tenant table exactly once: deleted WHERE store_id or kept", [...byStore, ...plan.keep].sort(), tenant);
    t.eq("…no table deleted twice", new Set(byStore).size, byStore.length);
    t.eq("plan.tables = the store_id deletes", [...plan.tables].sort(), [...byStore].sort());
    t.eq("kept: the §F.9 list (stores stays as the tombstone, it has no store_id)", [...plan.keep].sort(), [...PL.PURGE_KEEP].sort());
    t.eq("…none of them is deleted", plan.keep.filter((k) => byStore.includes(k)), []);
    t.eq("the queue tables first, the export files with export_jobs", plan.steps.slice(0, 4).map((s) => (s.kind === "rows" ? s.table : `area:${s.area}`)), ["outbox", "render_jobs", "export_jobs", "area:exports"]);
    const ai = tenant.filter((x) => x.startsWith("ai_"));
    t.check(`every ai_* tenant table in group 1 (${ai.length}), before preview_tokens`, ai.length >= 5 && ai.every((x) => rows.find((s) => s.table === x)?.group === 1 && tableAt(x) < tableAt("preview_tokens")));
    t.check("…ai_jobs, ai_batch_items, ai_usage_daily named first among them", tableAt("ai_jobs") < tableAt("ai_batch_items") && tableAt("ai_batch_items") < tableAt("ai_usage_daily") && ai.every((x) => tableAt(x) >= tableAt("ai_jobs")));
    const shingles = plan.steps.find((s) => s.kind === "rows" && s.table === "headline_shingles");
    t.check("headline_shingles by owner_tag, in group 2 after design_genomes", shingles?.kind === "rows" && shingles.by === "owner_tag" && shingles.group === 2 && tableAt("design_genomes") < tableAt("headline_shingles"));
    const order = ["outbox", "preview_tokens", "design_genomes", "campaigns", "ad_spend_daily", "order_events", "agent_profiles", "error_events", "leads", "orders", "customers", "stats_daily", "page_versions", "pages", "exports", "asset_refs", "media_files", "assets", "store_settings", "store_members"];
    const idx = order.map(tableAt);
    t.check("the §F.9 order", idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]!)), JSON.stringify(Object.fromEntries(order.map((n, i) => [n, idx[i]]))));
    t.check("agent_* tables in group 4", tenant.filter((x) => x.startsWith("agent_")).every((x) => rows.find((s) => s.table === x)?.group === 4));
    const areas = plan.steps.filter((s) => s.kind === "area").map((s) => (s.kind === "area" ? s.area : ""));
    t.eq("every per-store DATA_AREAS area once (SEC-21)", [...areas].sort(), [...PL.perStoreAreas()].sort());
    t.check("…all before the media rows, the others after the store's content (asset_refs)", areas.every((a) => areaAt(a) < tableAt("media_files")) && areas.filter((a) => a !== "exports").every((a) => areaAt(a) > tableAt("asset_refs")));
    const chunks = plan.steps.find((s) => s.kind === "rows" && s.table === "media_chunks");
    t.check("media_chunks by the store's media keys, just before media_files", chunks?.kind === "rows" && chunks.by === "media_key" && tableAt("media_chunks") === tableAt("media_files") - 1);
    t.eq("store_health last", plan.steps[plan.steps.length - 1], { kind: "rows", group: 7, table: "store_health", by: "store_id" });
    // a table added tomorrow, one more ai_* and agent_* table, and a renamed one that no longer exists
    const later = PL.purgePlan([...tenant.filter((x) => x !== "carrier_rates"), "zz_reviews", "ai_new_cache", "agent_shifts"]);
    const lAt = (name: string) => later.steps.findIndex((s) => s.kind === "rows" && s.table === name);
    t.check("a new tenant table is deleted the day it is added, before pages (group 3)", lAt("zz_reviews") > lAt("ad_spend_daily") && lAt("zz_reviews") < lAt("pages") && later.steps[lAt("zz_reviews")]?.group === 3);
    t.check("…a new ai_* table joins group 1, a new agent_* table group 4", later.steps[lAt("ai_new_cache")]?.group === 1 && later.steps[lAt("agent_shifts")]?.group === 4);
    t.check("…a named table missing from the schema is skipped", lAt("carrier_rates") === -1 && later.tables.length === plan.tables.length + 2);
    t.eq("without a configured area, nothing for it", PL.purgePlan(tenant, ["media"]).steps.filter((s) => s.kind === "area").map((s) => (s.kind === "area" ? s.area : "")), ["media"]);
  });

  h.section("purge: redaction", (t) => {
    const P = RD.PURGED;
    const meta = {
      from: "active",
      to: "closed",
      reason: "fake_orders",
      note: "Fatima called from 0612345678",
      Name: "Fatima Zahra",
      phone: "+212612345678",
      email: "fz@example.test",
      nested: { address: "12 rue X", landmark: "near the mosque", city: "Rabat", ua: "Mozilla/5.0", email_norm: "fz@example.test", phoneNorm: "212612345678", count: 3 },
      list: [{ name: "n1", id: "a" }, "kept text", 7],
      token: "t0k",
      apiKey: "sk-1",
      password: "p",
      code: "123456",
      orderId: "CMD-000123",
      storeName: "Argan Store",
      cleared: null,
    };
    t.eq("the PII keys, *_norm / …Norm and the secret rule are purged; everything else kept", RD.redactMetaForPurge(meta), {
      from: "active",
      to: "closed",
      reason: "fake_orders",
      note: P,
      Name: P,
      phone: P,
      email: P,
      nested: { address: P, landmark: P, city: P, ua: P, email_norm: P, phoneNorm: P, count: 3 },
      list: [{ name: P, id: "a" }, "kept text", 7],
      token: P,
      apiKey: P,
      password: P,
      code: P,
      orderId: "CMD-000123",
      storeName: "Argan Store",
      cleared: null,
    });
    t.eq("a whole object under a PII key goes as one value", RD.redactMetaForPurge({ address: { line1: "x", city: "y" } }), { address: P });
    t.eq("the key list is the explicit one (SEC-20)", [...RD.PURGE_PII_KEYS], ["email", "phone", "name", "address", "landmark", "note", "city", "ua"]);
    t.check("…'normal', 'enorm' and 'nameplate' are not PII keys", !RD.isPurgeKey("normal") && !RD.isPurgeKey("enorm") && !RD.isPurgeKey("nameplate"));
    t.eq("a JSON string in, a JSON string out", RD.redactMetaForPurge(JSON.stringify({ phone: "+2126", n: 1 })), JSON.stringify({ phone: P, n: 1 }));
    t.eq("null stays null; an unreadable string becomes { purged: true }", [RD.redactMetaForPurge(null), RD.redactMetaForPurge("{oops")], [null, JSON.stringify({ purged: true })]);
    t.eq("idempotent", RD.redactMetaForPurge(RD.redactMetaForPurge(meta)), RD.redactMetaForPurge(meta));
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 12; i++) deep = { d: deep };
    t.check("a meta deeper than the writer ever stores is cut, never walked forever", JSON.stringify(RD.redactMetaForPurge(deep)).includes(P));
    t.eq("signals emptied (the column is NOT NULL), notes' body", [RD.PURGED_SIGNALS, RD.PURGED_NOTE_BODY], [{ v: 1, flags: [], purged: true }, "[purged]"]);
  });

  h.section("purge: reason", (t) => {
    const now = Date.UTC(2026, 10, 3, 12);
    const f = (status: string, purgeAfter: number | null, changedAt: number | null) =>
      PJ.purgeReasonOf({ status: status as never, purgeAfter: purgeAfter === null ? null : new Date(purgeAfter), statusChangedAt: changedAt === null ? null : new Date(changedAt) }, now);
    t.eq("scheduled_deletion, purge_after passed", f("scheduled_deletion", now - 1, now - DAY), "purge_scheduled");
    t.eq("scheduled_deletion, purge_after ahead / missing", [f("scheduled_deletion", now + 60_000, now), f("scheduled_deletion", null, now - 90 * DAY)], [null, null]);
    t.eq("rejected for 30 days / 29 days", [f("rejected", null, now - 30 * DAY), f("rejected", null, now - 29 * DAY)], ["purge_rejected", null]);
    t.eq("the plan signature: stable, and another when a table is added (a resumed cursor then restarts at step 0)", [PJ.planSignature(PL.purgePlan()) === PJ.planSignature(PL.purgePlan()), PJ.planSignature(PL.purgePlan()) !== PJ.planSignature(PL.purgePlan([...PL.schemaTenantTables(), "zz_reviews"]))], [true, true]);
    t.eq("any other status is never purged", ["active", "pending", "restricted", "suspended", "closed", "purged"].map((s) => f(s, now - 90 * DAY, now - 90 * DAY)), [null, null, null, null, null, null]);
    // the owner tag is an hmac: a throwaway APP_SECRET of this process, never the owner's
    const env = process.env as Record<string, string | undefined>;
    const saved = env.APP_SECRET;
    env.APP_SECRET = randomBytes(32).toString("hex");
    try {
      const tag = (id: string) => PJ.shingleOwnerTag(id);
      t.eq("the owner tag: 16 hex, stable, per store", [/^[0-9a-f]{16}$/.test(tag("01JB8ZK3Q4R5S6T7V8W9XYZ0AA")), tag("01JB8ZK3Q4R5S6T7V8W9XYZ0AA") === tag("01JB8ZK3Q4R5S6T7V8W9XYZ0AA"), tag("01JB8ZK3Q4R5S6T7V8W9XYZ0AA") !== tag("01JB8ZK3Q4R5S6T7V8W9XYZ0BB")], [true, true, true]);
    } finally {
      if (saved === undefined) delete env.APP_SECRET;
      else env.APP_SECRET = saved;
    }
  });

  h.section("retention: cutoffs", (t) => {
    const now = Date.UTC(2026, 10, 3, 12);
    const table = Object.fromEntries(RT.RETENTION_RULES.map((r) => { const c = RT.retentionCutoff(r, now); return [r.name, c instanceof Date ? c.toISOString() : c]; }));
    t.eq("the §H.11 core rows at 2026-11-03 12:00 UTC", table, {
      outboxDone: "2026-10-20T12:00:00.000Z",
      outboxDead: "2026-10-04T12:00:00.000Z",
      jobRuns: "2026-10-20T12:00:00.000Z",
      errorEvents: "2026-10-04T12:00:00.000Z",
      notifications: "2026-08-05T12:00:00.000Z",
      auditLog: "2025-09-29T12:00:00.000Z",
      impersonation: "2025-09-29T12:00:00.000Z",
      platformRequests: "2025-09-29T12:00:00.000Z",
      storeInvites: "2026-10-04T12:00:00.000Z",
      slugHistory: "2026-11-03T12:00:00.000Z",
      previewTokens: "2026-10-04T12:00:00.000Z",
      dailyUsage: "2026-10-27",
      passwordResets: "2026-10-04T12:00:00.000Z",
      staffInvites: "2026-10-04T12:00:00.000Z",
      // R2 contract step C2-E (S6, OS-13): the Worker's per-minute counters, 14 days
      edgeReports: "2026-10-20T12:00:00.000Z",
    });
    t.check("every statement deletes, is bounded by LIMIT 2000 and compares with its cutoff", RT.RETENTION_RULES.every((r) => /^DELETE FROM [a-z_]+ WHERE /.test(r.sql) && r.sql.endsWith(" LIMIT 2000") && r.sql.includes("< ?") && r.sql.includes(`FROM ${r.table} `)));
    t.eq("names unique", new Set(RT.RETENTION_RULES.map((r) => r.name)).size, RT.RETENTION_RULES.length);
    t.eq("the daily store_usage metrics come from USAGE_METRICS' period (P0b F-10)", [...RT.DAILY_USAGE_METRICS], ["ai_credits_day", "ai_deep_passes", "ai_director_passes"]);
    t.eq("store_usage: the metric list, then the day", RT.retentionParams(RT.RETENTION_RULES.find((r) => r.table === "store_usage")!, now), [["ai_credits_day", "ai_deep_passes", "ai_director_passes"], "2026-10-27"]);
    t.eq("test orders after 30 days, statements of 2,000 rows", [RT.TEST_ORDERS_KEEP_DAYS, RT.RETENTION_SLICE], [30, 2000]);
    t.check("no other track's retention rows here (ai.retention, design.retention, ops.capi_ctx_purge)", !RT.RETENTION_RULES.some((r) => r.table.startsWith("ai_") || r.table === "design_genomes" || r.table === "orders"));
  });
}
