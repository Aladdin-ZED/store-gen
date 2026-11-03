/**
 * test:jobs, the storage jobs' sections (P8 step 7; docs/STORE-SAAS.md §G.2, §G.3, §D.7, §H.2 slot 6). Loaded by
 * ./selftest.ts after its server-only stub, offline: the pure rules and the registration only (the jobs themselves run
 * against MariaDB and a temp DATA_DIR in test:storage's `storage-jobs` section).
 *
 *  storage jobs: registration  the five jobs in slot 6 with their times and budgets; media.migrate every tick; the
 *                              slot-6 daily-window invariant with them and every time §H.2 / OPE-§J names
 *  storage jobs: daily pass    passVisitor over the real round robin (src/lib/jobs/scope.ts `roundRobin`): each store
 *                              worked once per pass whatever the slices, from any start, a store added or deleted
 *                              between ticks, one store, none; the next pass starts where this one ended
 *  storage jobs: rules         walkRoots (MEDIA_DIR inside / outside DATA_DIR, case on win32), sweepVerdict (the hour),
 *                              parseSweep / parsePass, driftTotals and movedGauges, the 70 / 85 % levels and the
 *                              300,000-file warning on snapshot figures
 */
import { resolve, sep } from "node:path";
import type { Job } from "./runner";
import type { Harness } from "./testing/harness";

type Rules = typeof import("./storage/rules");
type Slots = typeof import("./slots");
type Scope = typeof import("./scope");
type Walk = typeof import("@/lib/storage/walk");

export interface StorageSectionDeps {
  RU: Rules;
  S: Slots;
  SC: Scope;
  W: Walk;
  JOBS: readonly Job[];
}

export function storageJobSections(h: Harness, d: StorageSectionDeps): void {
  const { RU, S, SC, W, JOBS } = d;

  /* ---------------------------------------------------------------- */
  h.section("storage jobs: registration", (t) => {
    const want: [string, Job["every"], number][] = [
      ["media.migrate", "tick", 3_000],
      ["usage.reconcile", { dailyAt: "02:05" }, 3_000],
      ["media.sweep", { dailyAt: "02:10" }, 3_000],
      ["storage.walk", { dailyAt: "02:15" }, 2_000],
      ["refs.reconcile", { dailyAt: "02:25" }, 3_000],
    ];
    for (const [name, every, budget] of want) {
      const j = JOBS.find((x) => x.name === name);
      t.check(`${name}: registered in slot 6, ${typeof every === "string" ? every : every.dailyAt}, ${budget} ms`, !!j && S.slotOf(j) === "6" && JSON.stringify(j.every) === JSON.stringify(every) && j.budgetMs === budget);
    }
    t.eq("the registry's slot-6 daily jobs: no window holds more than two", S.dailyCollisions(JOBS), []);
    // every daily time §H.2 and OPE-§J name (R1, R2, R3), with the five storage jobs: still ≤ 2 per tick
    const named: Pick<Job, "name" | "every">[] = [
      ["ops.rollup", "02:40"],
      ["fin.rollup", "03:40"],
      ["ops.customers_reconcile", "03:10"],
      ["fin.alerts", "04:00"],
      ["ai.retention", "03:50"],
      ["design.retention", "03:50"],
      ["design.shingles", "04:10"],
      ["design.archive", "04:20"],
      ["ai.distill", "02:40"],
      ["ai.genes", "02:55"],
      ["ai.genes_platform", "03:10"],
      ["ai.risk_train", "03:20"],
      ["ai.insights", "06:00"],
      ["catalog.stock_reconcile", "02:20"],
      ["catalog.collections", "02:30"],
      ["catalog.bestsellers", "03:40"],
      ["experiments.weights", "04:00"],
      ["delivery.holidays_review", "08:00"],
    ].map(([name, at]) => ({ name: name!, every: { dailyAt: at! } }));
    const all = [...named, ...JOBS.filter((j) => j.name.startsWith("media.") || j.name.endsWith(".reconcile") || j.name === "storage.walk")];
    t.eq("…and with every time the spec names (R1-R3)", S.dailyCollisions(all), []);
    const windows = new Set(Object.values(RU.STORAGE_JOB_TIMES).map((at) => Math.ceil(S.dailyMinutes(at)! / 5)));
    t.eq("the four daily storage jobs fall in four different windows", windows.size, 4);
    t.check("no storage job names a time the spec gives another job", Object.values(RU.STORAGE_JOB_TIMES).every((at) => !named.some((n) => typeof n.every === "object" && n.every.dailyAt === at)));
    t.eq("the jobs' budgets are the ones registered", Object.entries(RU.STORAGE_JOB_BUDGETS).map(([n, b]) => JOBS.find((j) => j.name === n)?.budgetMs === b), [true, true, true, true, true]);
    t.check("the storage jobs never claim more than slot 6's 8 s each", Object.values(RU.STORAGE_JOB_BUDGETS).every((b) => b <= S.maxJobBudgetMs("6")));
    t.eq("the walk's job is the row the fs backend and getHealth read", W.WALK_JOB, "storage.walk");
  });

  /* ---------------------------------------------------------------- */
  h.section("storage jobs: daily pass", async (t) => {
    /** stores as rows in id order; `ids` may change between ticks */
    let ids: string[] = [];
    let cursor = "";
    let pass: import("./storage/rules").PassState | null = null;
    const worked: string[] = [];
    /** one tick of the daily pass with room for `room` stores (the glue of ./storage/pass.ts over roundRobin) */
    const tick = async (room: number): Promise<boolean> => {
      const p = pass ?? { start: cursor, wrapped: false };
      const v = RU.passVisitor(p, cursor);
      let left = room;
      const run = await SC.roundRobin(
        {
          page: async (after, upTo, limit) => ids.filter((id) => id > after && (upTo === null || id <= upTo)).slice(0, limit).map((id) => ({ id })),
          readCursor: async () => cursor,
          writeCursor: async (c) => {
            cursor = c;
          },
        },
        { budgetMs: 1_000, stop: () => v.complete || left <= 0, now: () => 0, pageSize: 2 },
        async (store) => {
          if (v.visit(store.id) === "end") return;
          left--;
          worked.push(store.id);
        },
      );
      const complete = v.complete || run.done;
      pass = complete ? null : p;
      return complete;
    };
    const runPass = async (room: number): Promise<{ ticks: number; worked: string[] }> => {
      worked.length = 0;
      for (let n = 1; n <= 50; n++) if (await tick(room)) return { ticks: n, worked: [...worked] };
      return { ticks: -1, worked: [...worked] };
    };
    const once = (w: string[], set: string[]) => w.length === set.length && set.every((id) => w.filter((x) => x === id).length === 1);

    ids = ["A1", "A2", "A3", "A4", "A5"];
    const p1 = await runPass(10);
    t.eq("first pass, room for all: every store once, one tick", [p1.ticks, p1.worked], [1, ids]);
    const p2 = await runPass(2);
    t.check("next day, 2 stores a tick: every store once over 3 ticks", p2.ticks === 3 && once(p2.worked, ids), JSON.stringify(p2));
    const p3 = await runPass(2);
    t.check("the day after: once each again, from the store after the one the last pass ended on", p3.ticks === 3 && once(p3.worked, ids) && p3.worked[0] === "A2", JSON.stringify(p3));
    const p4 = await runPass(1);
    // the end is seen when a store past the start comes up: a tick spent on the last store finds it on the next one
    t.check("1 store a tick: once each over 5 working ticks (+1 that only finds the end)", p4.ticks >= 5 && p4.ticks <= 6 && once(p4.worked, ids), JSON.stringify(p4));

    // a store added and one deleted while a pass is in progress
    worked.length = 0;
    await tick(2);
    const before = [...worked];
    ids = ids.filter((id) => id !== before[1]).concat("A6");
    for (let n = 0; n < 10 && !(await tick(2)); n++);
    t.check("a store deleted mid-pass: the pass still ends, every other store once", once(worked.filter((id) => id !== "A6"), ["A1", "A2", "A3", "A4", "A5"]), JSON.stringify(worked));
    t.check("…and the store added mid-pass is worked at most once", worked.filter((id) => id === "A6").length <= 1);

    ids = ["B1"];
    cursor = "";
    pass = null;
    const one = await runPass(1);
    t.eq("one store: worked once per pass", [one.ticks, one.worked], [1, ["B1"]]);
    const again = await runPass(1);
    t.eq("…and once the next day (cursor on it)", [again.ticks, again.worked], [1, ["B1"]]);
    ids = [];
    cursor = "";
    pass = null;
    const none = await runPass(3);
    t.eq("no store: the pass completes at once", [none.ticks, none.worked], [1, []]);

    const v = RU.passVisitor({ start: "M", wrapped: false }, "M");
    t.eq("passVisitor: after the start, wrap, up to the start, then end", ["N", "Z", "A", "M", "N"].map((id) => v.visit(id)), ["work", "work", "work", "work", "end"]);
    t.check("…and stays ended", v.complete && v.visit("B") === "end");
  });

  /* ---------------------------------------------------------------- */
  h.section("storage jobs: rules", (t) => {
    const DATA = resolve(sep, "srv", "sg-data");
    t.eq("walkRoots: no DATA_DIR → nothing", RU.walkRoots(null, resolve(sep, "m")), []);
    t.eq("walkRoots: media under DATA_DIR → DATA_DIR only", RU.walkRoots(DATA, resolve(DATA, "media")), [DATA]);
    t.eq("walkRoots: MEDIA_DIR inside DATA_DIR → counted once", RU.walkRoots(DATA, resolve(DATA, "x", "m")), [DATA]);
    t.eq("walkRoots: MEDIA_DIR outside → both", RU.walkRoots(DATA, resolve(sep, "mnt", "m")), [DATA, resolve(sep, "mnt", "m")]);
    t.eq("walkRoots: a sibling that shares the prefix is outside", RU.walkRoots(DATA, `${DATA}-media`), [DATA, `${DATA}-media`]);
    t.check("isInside: case-insensitive on win32 only", RU.isInside("C:\\SRV\\Data\\m", "c:\\srv\\data", "win32") && !RU.isInside("/srv/DATA/m", "/srv/data", "linux"));
    t.eq("walkRoots: no media root → DATA_DIR", RU.walkRoots(DATA, null), [DATA]);

    const H = RU.ORPHAN_AGE_MS;
    t.eq("sweep: a file with a row is kept, however old", RU.sweepVerdict({ row: true, ageMs: 100 * H }), "keep");
    t.eq("sweep: no row, 59 min → kept (an upload writes its files first)", RU.sweepVerdict({ row: false, ageMs: H - 60_000 }), "keep");
    t.eq("sweep: no row, exactly 1 h → kept", RU.sweepVerdict({ row: false, ageMs: H }), "keep");
    t.eq("sweep: no row, older than 1 h → deleted", RU.sweepVerdict({ row: false, ageMs: H + 1 }), "delete");
    t.eq("sweep: an unreadable age → kept", RU.sweepVerdict({ row: false, ageMs: NaN }), "keep");
    t.eq("parseSweep: a phase and its cursor", RU.parseSweep({ phase: "disk", after: "01JB" }), { phase: "disk", after: "01JB" });
    t.eq("parseSweep: garbage → null", [RU.parseSweep(null), RU.parseSweep({ phase: "x" }), RU.parseSweep("tmp")], [null, null, null]);
    t.eq("parseSweep: a bad cursor → from the start", RU.parseSweep({ phase: "rows", after: 7 }), { phase: "rows", after: "" });
    t.eq("parsePass: kept / garbage", [RU.parsePass({ start: "A", wrapped: true }), RU.parsePass({ start: 1, wrapped: true }), RU.parsePass(null)], [{ start: "A", wrapped: true }, null, null]);

    const drifts = [
      { media_bytes: { before: 100, after: 120 }, pages: { before: 3, after: 3 } },
      { media_bytes: { before: 50, after: 40 }, pages: { before: 2, after: 1 } },
      { media_bytes: { before: 7, after: 7 }, pages: { before: 0, after: 0 } },
    ];
    t.eq("driftTotals: net delta and stores per gauge, stores with drift", RU.driftTotals(drifts), { stores: 3, driftStores: 2, media_bytes_delta: 10, media_bytes_stores: 2, pages_delta: -1, pages_stores: 1 });
    t.eq("driftTotals: nothing → zeros", RU.driftTotals([]), { stores: 0, driftStores: 0 });
    t.eq("movedGauges", drifts.map((g) => RU.movedGauges(g)), [1, 2, 0]);

    // the figures the health tile and the alarms take from a snapshot (§G.2, §H.5)
    const snap = W.readWalkSnapshot({ snapshot: { bytes: 15_032_385_536, files: 300_001, dirs: 12, budgetBytes: 21_474_836_480, complete: true, at: "2026-10-31T02:15:40.000Z" } });
    t.check("a stored snapshot reads back", !!snap && snap.files === 300_001 && snap.budgetBytes === 21_474_836_480);
    t.eq("…70 % of the 20 GiB budget → data_dir_70", snap && W.dataDirLevel(snap.bytes, snap.budgetBytes), "data_dir_70");
    t.eq("…85 % → data_dir_85", W.dataDirLevel(Math.ceil(0.85 * 21_474_836_480), 21_474_836_480), "data_dir_85");
    t.eq("…69.9 % → no alarm", W.dataDirLevel(Math.floor(0.699 * 21_474_836_480), 21_474_836_480), null);
    t.eq("…300,001 files → the inode warning; 300,000 → none", [W.inodeWarning(snap?.files ?? 0), W.inodeWarning(300_000)], [true, false]);
    t.eq("a walk in progress (no snapshot) reads as none", W.readWalkSnapshot({ walk: { roots: [DATA], i: 0 } }), null);
  });
}
