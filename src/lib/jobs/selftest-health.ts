/**
 * test:jobs, the platform health sections (P8 step 11; docs/STORE-SAAS.md §H.5, platform.md PLA-§15.1, PLA-§15.2).
 * Loaded by ./selftest.ts after its server-only stub. Offline: pure modules only (getHealth itself runs against
 * MariaDB in test:storage's `health` section).
 *
 *  health: alarms      every helper at, under and over its threshold (db 70 / 85 %, DATA_DIR 70 / 85 % and the walk's
 *                      own rule, 300,000 files, pool wait 500 ms, tick lag 250 ms, render stuck 60 min or two idle runs,
 *                      failed > 24 h, no tick 10 min, the scaled Sheets threshold, error spike 50, design 300 MB,
 *                      edge bad key 10, gate mismatch); null never alarms except no_tick
 *  health: isolation   a throwing source and a hanging one give their section null and a code, the others are read;
 *                      a stub's not_implemented is not reported to the ring; the requested subset only
 *  health: projection  the frozen shape from a report: failed sections empty and named, no_snapshot before the first
 *                      walk, not_requested, notMeasured
 *  health: edge        the tally deltas: bad keys counted once, a prev-key change once, a reset tally restarts
 */
import type { Harness } from "./testing/harness";

type Alarms = typeof import("./alarms");
type Sections = typeof import("./health-sections");
type Walk = typeof import("@/lib/storage/walk");
type EdgeTallyMod = typeof import("./edge-tally");

export interface HealthSectionDeps {
  A: Alarms;
  HS: Sections;
  W: Walk;
  ET: EdgeTallyMod;
}

const MiB = 1024 * 1024;

export function healthSections(h: Harness, d: HealthSectionDeps): void {
  const { A, HS, W, ET } = d;

  h.section("health: alarms", (t) => {
    const Q = 1000;
    t.eq("dbLevel: 69.9 % / 70 % / 84.9 % / 85 % / 100 %", [A.dbLevel(699, Q), A.dbLevel(700, Q), A.dbLevel(849, Q), A.dbLevel(850, Q), A.dbLevel(1000, Q)], [null, "db_70", "db_70", "db_85", "db_85"]);
    t.eq("dbLevel: not measured is no level", [A.dbLevel(null, Q), A.dbLevel(500, null), A.dbLevel(500, 0)], [null, null, null]);
    const B = 20 * 1024 ** 3;
    const dd = [0.699, 0.7, 0.849, 0.85, 1.2].map((r) => Math.round(r * B));
    t.eq("dataDirLevel: under, at and over 70 / 85 %", dd.map((b) => A.dataDirLevel(b, B)), [null, "data_dir_70", "data_dir_70", "data_dir_85", "data_dir_85"]);
    t.eq("…the same verdicts as the walk's own rule (one threshold)", dd.map((b) => W.dataDirLevel(b, B)), dd.map((b) => A.dataDirLevel(b, B)));
    t.eq("dataDirLevel: no snapshot is no level", A.dataDirLevel(null, B), null);
    t.eq("inodeWarn: 299,999 / 300,000 / 300,001", [A.inodeWarn(299_999), A.inodeWarn(300_000), A.inodeWarn(300_001), A.inodeWarn(null)], [false, false, true, false]);
    t.eq("…the walk's inodeWarning agrees", [299_999, 300_000, 300_001].map((n) => W.inodeWarning(n)), [false, false, true]);
    t.eq("poolWaitAlarm: 499 / 500 / 501 ms on either pool, null none", [
      A.poolWaitAlarm({ poolWaitP95Ms: 499, lockPoolWaitP95Ms: null }),
      A.poolWaitAlarm({ poolWaitP95Ms: 500, lockPoolWaitP95Ms: 500 }),
      A.poolWaitAlarm({ poolWaitP95Ms: 501, lockPoolWaitP95Ms: null }),
      A.poolWaitAlarm({ poolWaitP95Ms: 0, lockPoolWaitP95Ms: 501 }),
      A.poolWaitAlarm({ poolWaitP95Ms: null, lockPoolWaitP95Ms: null }),
    ], [false, false, true, true, false]);
    t.eq("tickLagAlarm: 249 / 250 / 251 ms, null", [A.tickLagAlarm(249), A.tickLagAlarm(250), A.tickLagAlarm(251), A.tickLagAlarm(null)], [false, false, true, false]);
    t.eq("renderStuck: oldest 59 / 60 / 61 min", [59, 60, 61].map((m) => A.renderStuck({ oldestMin: m, pending: 1, recentProcessed: [3, 3] })), [false, false, true]);
    t.eq("renderStuck: throughput 0 over two runs with pending → stuck; one run, or nothing pending, or a run that rendered → not", [
      A.renderStuck({ oldestMin: 5, pending: 4, recentProcessed: [0, 0, 7] }),
      A.renderStuck({ oldestMin: 5, pending: 4, recentProcessed: [0] }),
      A.renderStuck({ oldestMin: null, pending: 0, recentProcessed: [0, 0] }),
      A.renderStuck({ oldestMin: 5, pending: 4, recentProcessed: [0, 2] }),
    ], [true, false, false, false]);
    t.eq("renderFailedOld: 0 / 1 / null", [A.renderFailedOld(0), A.renderFailedOld(1), A.renderFailedOld(null)], [false, true, false]);
    const now = Date.UTC(2026, 10, 4, 12, 0, 0);
    t.eq("noTick: 9:59 / 10:00 / 10:01 since the last row, never a row", [A.noTick(now - 599_000, now), A.noTick(now - 600_000, now), A.noTick(new Date(now - 601_000).toISOString(), now), A.noTick(null, now)], [false, false, true, true]);
    t.eq("sheetsBacklogAlarm, ≤ 16 active stores: 15 min is the threshold (15 no, 16 yes)", [A.sheetsBacklogAlarm(15, 16), A.sheetsBacklogAlarm(16, 16), A.sheetsBacklogAlarm(14, 0)], [false, true, false]);
    t.eq("…scaled at 100 stores: max(15, 5 × ceil(100 / 16)) = 35 (35 no, 36 yes)", [A.sheetsBacklogAlarm(20, 100), A.sheetsBacklogAlarm(35, 100), A.sheetsBacklogAlarm(36, 100)], [false, false, true]);
    t.eq("…at 17 stores: 15 (5 × 2 = 10 < 15), no backlog measured never alarms", [A.sheetsBacklogAlarm(16, 17), A.sheetsBacklogAlarm(null, 17)], [true, false]);
    t.eq("errorSpike: 50 / 51 per hour", [A.errorSpike(50), A.errorSpike(51), A.errorSpike(null)], [false, true, false]);
    t.eq("designTablesLarge: 300 MB together / one byte over", [A.designTablesLarge({ genomesBytes: 200 * MiB, shinglesBytes: 100 * MiB }), A.designTablesLarge({ genomesBytes: 200 * MiB, shinglesBytes: 100 * MiB + 1 }), A.designTablesLarge(null)], [false, true, false]);
    t.eq("edgeBadKeyAlarm: 9 / 10 a minute", [A.edgeBadKeyAlarm(9), A.edgeBadKeyAlarm(10), A.edgeBadKeyAlarm(null)], [false, true, false]);
    t.eq("gateMismatchAlarm: true only (null = unknown)", [A.gateMismatchAlarm(true), A.gateMismatchAlarm(false), A.gateMismatchAlarm(null)], [true, false, false]);
  });

  type Readers = import("./health-sections").SectionReaders;
  const fakeReaders = (over: Partial<Record<keyof Readers, () => Promise<unknown>>> = {}): Readers => {
    const base: Record<string, () => Promise<unknown>> = {};
    for (const s of HS.HEALTH_SECTIONS) base[s] = async () => ({ section: s });
    return { ...base, ...over } as unknown as Readers;
  };

  h.section("health: isolation", async (t) => {
    const reported: string[] = [];
    const r = await HS.collectSections(
      fakeReaders({
        db: async () => {
          throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
        },
        edge: () => new Promise(() => undefined),
        ai: async () => {
          throw new Error("not implemented: P7 aiHealth");
        },
        errors: () => {
          throw new TypeError("sync throw");
        },
      }),
      { timeoutMs: 50, onError: (s, _e, code) => reported.push(`${s}:${code}`) },
    );
    t.eq("the failing sections are null", [r.db, r.edge, r.ai, r.errors], [null, null, null, null]);
    t.eq("…codes: the driver's, timeout, not_implemented, the error's name", [r.sectionErrors.db, r.sectionErrors.edge, r.sectionErrors.ai, r.sectionErrors.errors], ["ECONNREFUSED", "timeout", "not_implemented", "TypeError"]);
    const others = HS.HEALTH_SECTIONS.filter((s) => !["db", "edge", "ai", "errors"].includes(s));
    t.check("every other section is present", others.every((s) => (r[s] as { section?: string } | null)?.section === s), JSON.stringify(r));
    t.eq("the ring hears of real failures, not of a stub", reported.sort(), ["db:ECONNREFUSED", "edge:timeout", "errors:TypeError"]);
    const sub = await HS.collectSections(fakeReaders(), { sections: ["tick", "edge"] });
    t.check("a requested subset reads only those sections (the rest null, no error)", sub.tick !== null && sub.edge !== null && sub.db === null && Object.keys(sub.sectionErrors).length === 0);
  });

  h.section("health: projection", async (t) => {
    const r = await HS.collectSections(
      fakeReaders({
        dataDir: async () => ({ walk: null, backend: "db", dataDirSet: false, check: null, mediaChunksReclaimableBytes: null, level: null, inodeWarn: false }),
        renders: async () => {
          throw new Error("boom");
        },
        edge: async () => ({ sMode: false, workerVersion: null, lastEdgeAt: null, prevKeyRequests24h: 0, badKey24h: 2, foreignHosts24h: null, badKeyMinute: 0, rotationPending: false }),
        commerce: async () => ({ lastOrderAt: null, ordersPerHour24: Array(24).fill(0), from: "2026-11-03T12:00:00.000Z" }),
      }),
      { sections: ["dataDir", "renders", "edge", "commerce"] },
    );
    const p = HS.toPlatformHealth(r);
    t.eq("a failed renders section: empty values and its code (a plain Error: read_failed)", [p.renders.totals.pending, p.renders.oldestMin, p.sectionErrors.renders], [0, null, "read_failed"]);
    t.eq("dataDir before the first walk: no_snapshot (the panel's 'Snapshot not taken yet')", [p.sectionErrors.dataDir, p.dataDir.budgetBytes, p.detail.dataDir?.at], ["no_snapshot", null, null]);
    t.eq("unrequested sections are named not_requested", [p.sectionErrors.tick, p.sectionErrors.db, p.ai], ["not_requested", "not_requested", null]);
    t.check("edge: badKey24h kept, the unmeasured foreign hosts listed in notMeasured", p.edge.badKey24h === 2 && p.edge.foreignHosts24h === 0 && p.notMeasured.includes("edge.foreignHosts24h"));
    t.eq("commerce: 24 measured buckets", p.commerce.ordersPerHour24.length, 24);
  });

  h.section("health: edge", (t) => {
    const tally = (bad: number, prevKeyAt: number | null, extra: Record<string, unknown> = {}) => ({ minuteStart: 0, badKeyMinute: 0, badKey: { bad_key: bad, stale: 1, unconfigured: 0 }, prevKeyAt, verifiedAt: null, ...extra });
    const a = ET.edgeDeltas(tally(4, null), null);
    t.eq("the first look records everything since the process started", [a.badKey, a.prevKey, a.foreignHosts], [5, 0, 0]);
    const b = ET.edgeDeltas(tally(6, 1000), a.next);
    t.eq("the next records only what is new, a prev-key change once", [b.badKey, b.prevKey], [2, 1]);
    const c = ET.edgeDeltas(tally(6, 1000), b.next);
    t.eq("an unchanged tally records nothing", [c.badKey, c.prevKey], [0, 0]);
    const reset = ET.edgeDeltas(tally(1, null), c.next);
    t.eq("a tally that went backwards (reset) restarts from it", reset.badKey, 2);
    t.eq("foreignHosts / workerVersion read only when the tally exposes them (CCR r1-p8-23)", [ET.tallyForeignHosts(tally(0, null)), ET.tallyForeignHosts(tally(0, null, { foreignHosts: 3 })), ET.tallyWorkerVersion(tally(0, null, { workerVersion: "w-12" })), ET.tallyWorkerVersion(tally(0, null, { workerVersion: "bad value!" }))], [null, 3, "w-12", null]);
  });
}
