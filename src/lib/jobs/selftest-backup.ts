/**
 * test:jobs, the logical backup's sections (P8 step 9; docs/STORE-SAAS.md §H.6, §F.9 SEC-20, PLA-§17). Loaded by
 * ./selftest.ts after its server-only stub. Offline: the part cases write a few small files under one os.tmpdir()
 * folder and remove it, sealed with a throwaway APP_SECRET of this process (the job itself runs against MariaDB and a
 * temp DATA_DIR in test:storage's `backup` section).
 *
 *  backup: registration  `backup` in slot 5, daily at 03:30, CPU-bound (halved under lag), within the slot, before
 *                        `exports`
 *  backup: retention     the calendar on fixtures: N newest done runs kept, the M newest Sundays as weeklies, a
 *                        Sunday counted once, failed runs kept back to the oldest kept daily, running never pruned,
 *                        the PLA-§17 bounds clamped, Sunday → weekly
 *  backup: manifest      the file's shape (counts and hashes only), part names, parse refusals (a part under another
 *                        table, a duplicate, a bad hash, a bad day), the backup_runs column subset, real days only
 *  backup: parts         the NDJSON encoding round trip (binary, JSON, NULL, exact strings), the part rule under a small
 *                        limit (every part ≤ the limit unless one larger line, every line once, in order), the 8 MiB
 *                        constants, sealed parts that open, verify and restore through a recording target, and a
 *                        tampered, a resealed-but-wrong-hash and a missing part refused before any write
 *  backup: purge rule    purgeIdsToDrop: kept while a retained snapshot started before the request, dropped after,
 *                        nothing without snapshots, a running run counts
 *  backup: restore target  cod_test_* only unless manual; the app's own database refused even then
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "./runner";
import type { Harness } from "./testing/harness";

type Format = typeof import("@/lib/backup/format");
type Manifest = typeof import("@/lib/backup/manifest");
type Retention = typeof import("@/lib/backup/retention");
type Restore = typeof import("@/lib/backup/restore");
type Seal = typeof import("@/lib/backup/seal");
type Slots = typeof import("./slots");
type Runner = typeof import("./runner");

export interface BackupSectionDeps {
  F: Format;
  M: Manifest;
  RT: Retention;
  RS: Restore;
  SE: Seal;
  S: Slots;
  R: Runner;
  JOBS: readonly Job[];
}

const STORE_X = "01JB8ZK3Q4R5S6T7V8W9XYZ0XX";
const STORE_Y = "01JB8ZK3Q4R5S6T7V8W9XYZ0YY";

export function backupSections(h: Harness, d: BackupSectionDeps): void {
  const { F, M, RT, RS, SE, S, R, JOBS } = d;

  h.section("backup: registration", (t) => {
    const j = JOBS.find((x) => x.name === "backup");
    t.check("backup: slot 5, daily at 03:30", !!j && S.slotOf(j) === "5" && typeof j.every === "object" && j.every.dailyAt === "03:30");
    t.check("…CPU-bound: the runner halves it under lag", R.CPU_BOUND_JOBS.has("backup"));
    t.check("…within slot 5's cap, and the exports keep ≥ 3 s of the slot", !!j && j.budgetMs <= S.maxJobBudgetMs("5") && j.budgetMs <= S.slotById("5").budgetMs - 3_000);
    const names = JOBS.filter((x) => S.slotOf(x) === "5").map((x) => x.name);
    t.check("…runs before the exports in slot 5", names.indexOf("backup") >= 0 && names.indexOf("backup") < names.indexOf("exports"));
  });

  h.section("backup: retention", (t) => {
    t.eq("Sunday 2026-11-01 is the weekly, Monday 2026-11-02 a daily", [RT.isSunday("2026-11-01"), RT.kindOfDay("2026-11-01"), RT.kindOfDay("2026-11-02")], [true, "weekly", "daily"]);
    // 60 consecutive done days ending Tuesday 2026-11-03
    const days: string[] = [];
    for (let i = 0; i < 60; i++) days.push(new Date(Date.UTC(2026, 10, 3) - i * 86_400_000).toISOString().slice(0, 10));
    const runs = days.map((day) => ({ id: `r-${day}`, day, kind: RT.kindOfDay(day), state: "done" as const }));
    const plan = RT.retentionPlan(runs, { daily: 7, weekly: 4 });
    const keptDays = plan.keep.map((id) => id.slice(2));
    t.eq("defaults 7 + 4: the 7 newest days and 3 older Sundays (the newest Sunday counts in both)", keptDays, ["2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29", "2026-10-28", "2026-10-25", "2026-10-18", "2026-10-11"]);
    t.check("…every Sunday kept is a Sunday", keptDays.slice(7).every((x) => RT.isSunday(x)));
    t.eq("…the other 50 pruned, none kept twice", [plan.prune.length, new Set([...plan.keep, ...plan.prune]).size], [50, 60]);
    t.eq("bounds: daily 1 → 3, weekly 99 → 12, garbage → the defaults", [RT.clampRetention({ daily: 1, weekly: 99 }), RT.clampRetention({ daily: "x", weekly: null }), RT.clampRetention(undefined)], [{ daily: 3, weekly: 12 }, { daily: 7, weekly: 4 }, { daily: 7, weekly: 4 }]);
    const clamped = RT.retentionPlan(runs, { daily: 0, weekly: 0 });
    t.eq("…daily 0 / weekly 0 act as 3 / 1", clamped.keep.map((id) => id.slice(2)), ["2026-11-03", "2026-11-02", "2026-11-01"]);
    const mixed = [
      { id: "a", day: "2026-11-03", kind: "daily" as const, state: "running" as const },
      { id: "b", day: "2026-11-02", kind: "daily" as const, state: "failed" as const },
      { id: "c", day: "2026-11-01", kind: "weekly" as const, state: "done" as const },
      { id: "d", day: "2026-10-31", kind: "daily" as const, state: "done" as const },
      { id: "e", day: "2026-10-30", kind: "daily" as const, state: "done" as const },
      { id: "f", day: "2026-10-29", kind: "daily" as const, state: "failed" as const },
      { id: "g", day: "2026-10-28", kind: "daily" as const, state: "done" as const },
      { id: "h", day: "2026-10-27", kind: "daily" as const, state: "pruned" as const },
    ];
    const pm = RT.retentionPlan(mixed, { daily: 3, weekly: 1 });
    t.eq("running never pruned or listed, failed kept back to the 3rd daily, an older failed and done pruned", pm, { keep: ["b", "c", "d", "e"], prune: ["f", "g"] });
    t.eq("fewer done runs than N: every failed run kept", RT.retentionPlan([{ id: "x", day: "2026-01-01", kind: "daily", state: "failed" }], {}), { keep: ["x"], prune: [] });
  });

  h.section("backup: manifest", (t) => {
    t.eq("part names: table.nnnn.ndjson.gz.sg", [M.partName("orders", 1), M.partName("audit_log", 12345)], ["orders.0001.ndjson.gz.sg", "audit_log.12345.ndjson.gz.sg"]);
    t.check("…bad tables and numbers refused", [() => M.partName("../x", 1), () => M.partName("orders", 0), () => M.partName("Orders", 1)].every((f) => {
      try {
        f();
        return false;
      } catch {
        return true;
      }
    }));
    t.eq("real days only", [M.isBackupDay("2026-11-03"), M.isBackupDay("2026-02-30"), M.isBackupDay("../2026"), M.isBackupDay(20261103)], [true, false, false, false]);
    const progress = { v: 1 as const, tables: [{ name: "orders", rows: 3, parts: [{ name: "orders.0001.ndjson.gz.sg", bytes: 120, sha256: "a".repeat(64) }] }, { name: "leads", rows: 0, parts: [] }] };
    const file = M.buildManifest({ day: "2026-11-03", kind: "daily" }, progress, new Date("2026-11-03T03:31:00Z"), "0123456789ab");
    t.eq("the file: v, day, kind, createdAt, build, tables (counts and hashes only)", Object.keys(file), ["v", "day", "kind", "createdAt", "build", "tables"]);
    t.eq("…round trip through its JSON text", M.parseManifest(JSON.stringify(file)), file);
    t.eq("…the backup_runs column is { v, tables }", M.manifestColumn(file), progress);
    const bad = (mut: (f: typeof file) => unknown) => M.parseManifest(JSON.stringify(mut(structuredClone(file))));
    t.eq(
      "refused: a part named for another table, a duplicate, a bad hash, a bad day, any other key (a row value), not JSON",
      [
        bad((f) => ((f.tables[1]!.parts as unknown[]).push({ ...f.tables[0]!.parts[0]! }), f)),
        bad((f) => (f.tables[0]!.parts.push({ ...f.tables[0]!.parts[0]! }), f)),
        bad((f) => ((f.tables[0]!.parts[0]!.sha256 = "zz"), f)),
        bad((f) => ((f.day = "2026-13-01"), f)),
        bad((f) => ({ ...f, tables: [{ ...f.tables[0], sample: { phone: "+212600000000" } }] })),
        M.parseManifest("{not json"),
      ],
      [null, null, null, null, null, null],
    );
  });

  h.section("backup: parts", async (t) => {
    const row = { id: "01JB0000000000000000000001", total: "199.00", big: "9007199254740993", at: "2026-11-03 03:30:00.125", bin: Buffer.from([0, 1, 254, 255]), meta: { a: [1, "x"] }, none: null, city: "الدار البيضاء" };
    const line = F.encodeRow(row);
    t.check("one line, newline-terminated, no raw newline inside", line.endsWith("\n") && line.indexOf("\n") === line.length - 1);
    const back = F.decodeRow(line.trim());
    t.eq("…columns kept in order", back.columns, Object.keys(row));
    t.check("…binary back as the same bytes, JSON back as its text, exact strings and NULL kept", Buffer.isBuffer(back.values[4]) && (back.values[4] as Buffer).equals(row.bin) && back.values[5] === '{"a":[1,"x"]}' && back.values[1] === "199.00" && back.values[2] === "9007199254740993" && back.values[6] === null && back.values[7] === row.city);
    t.check("a line that is not an object is refused", (() => {
      try {
        F.decodeRow("[1,2]");
        return false;
      } catch {
        return true;
      }
    })());
    t.check("8 MiB: a sealed part's raw limit leaves 64 KiB for gzip and the envelope", F.PART_MAX_BYTES === 8 * 1024 * 1024 && F.PART_RAW_LIMIT === F.PART_MAX_BYTES - 65_536);

    // the part rule with a 200-byte limit: lines of 30-90 bytes and one of 500
    const LIMIT = 200;
    const lines = Array.from({ length: 40 }, (_, i) => Buffer.from(`${JSON.stringify({ i, pad: "x".repeat(20 + ((i * 37) % 60)) })}\n`));
    lines.splice(17, 0, Buffer.from(`${JSON.stringify({ i: "big", pad: "y".repeat(480) })}\n`));
    const parts: Buffer[] = [];
    const pb = new F.PartBuffer();
    for (const [i, l] of lines.entries()) {
      if (!pb.fits(l, LIMIT)) parts.push(pb.take().data);
      pb.push(l, [i]);
    }
    parts.push(pb.take().data);
    t.check("every part ≤ the limit, except the one holding the single larger line", parts.every((p) => p.length <= LIMIT || (p.length > LIMIT && F.ndjsonLines(p).length === 1)));
    t.eq("…every line exactly once, in order", Buffer.concat(parts).equals(Buffer.concat(lines)), true);
    t.check("…several parts", parts.length > 5);
    t.eq("fitsPart: the first line always fits", [F.fitsPart(0, 999, 10), F.fitsPart(5, 5, 10), F.fitsPart(6, 5, 10)], [true, true, false]);

    // sealed parts on disk: verify, restore through a recording target, then the refusals
    const env = process.env as Record<string, string | undefined>;
    const savedSecret = env.APP_SECRET;
    env.APP_SECRET = randomBytes(32).toString("hex");
    const dir = mkdtempSync(join(tmpdir(), "sg-backup-"));
    try {
      const tableRows = { stores: [{ id: STORE_X, name: "X" }, { id: STORE_Y, name: "Y" }], orders: [{ id: "CMD-1", store_id: STORE_X, total: "10.00" }, { id: "CMD-2", store_id: STORE_X, total: "20.00" }, { id: "CMD-3", store_id: STORE_Y, total: "30.00" }] };
      const progress = { v: 1 as const, tables: [] as { name: string; rows: number; parts: { name: string; bytes: number; sha256: string }[] }[] };
      for (const [name, rows] of Object.entries(tableRows)) {
        const entry = { name, rows: 0, parts: [] as { name: string; bytes: number; sha256: string }[] };
        // one row per part: several parts per table
        for (const [i, r] of rows.entries()) {
          const sealed = SE.sealPart(await F.gzip(Buffer.from(F.encodeRow(r))));
          const pn = M.partName(name, i + 1);
          await F.writeFileDurable(join(dir, pn), sealed);
          entry.parts.push({ name: pn, bytes: sealed.length, sha256: F.sha256Hex(sealed) });
          entry.rows++;
        }
        progress.tables.push(entry);
      }
      writeFileSync(join(dir, M.MANIFEST_FILE), JSON.stringify(M.buildManifest({ day: "2026-11-03", kind: "daily" }, progress, new Date(), null)));
      t.check("a sealed part starts with the SGB2 magic and holds no plaintext", readFileSync(join(dir, "orders.0001.ndjson.gz.sg")).subarray(0, 4).toString() === "SGB2" && !readFileSync(join(dir, "orders.0001.ndjson.gz.sg")).includes("CMD-1"));
      const calls: string[] = [];
      const inserted: unknown[][] = [];
      const target = {
        async reset(table: string) {
          calls.push(`reset ${table}`);
        },
        async insert(table: string, columns: string[], rows: unknown[][]) {
          calls.push(`insert ${table} ${columns.join(",")} ${rows.length}`);
          inserted.push(...rows);
        },
      };
      const r = await RS.restoreBackupDir(dir, target, { batchRows: 2 });
      t.eq("restore: each table emptied then filled, batches of ≤ 2, the manifest's counts", [r.tables, calls], [
        [
          { name: "stores", rows: 2 },
          { name: "orders", rows: 3 },
        ],
        ["reset stores", "insert stores id,name 2", "reset orders", "insert orders id,store_id,total 2", "insert orders id,store_id,total 1"],
      ]);
      t.eq("…the values as written", inserted.at(-1), ["CMD-3", STORE_Y, "30.00"]);

      const refused = async (mutate: () => void, restoreAfter: () => void) => {
        calls.length = 0;
        mutate();
        try {
          await RS.restoreBackupDir(dir, target);
          return "restored";
        } catch (err) {
          return err instanceof RS.RestoreError ? `${err.code}:${calls.length}` : "other";
        } finally {
          restoreAfter();
        }
      };
      const p2 = join(dir, "orders.0002.ndjson.gz.sg");
      const good = readFileSync(p2);
      const flipped = Buffer.from(good);
      flipped[flipped.length - 3] = flipped[flipped.length - 3]! ^ 0xff;
      t.eq("a tampered part: 'checksum', nothing written", await refused(() => writeFileSync(p2, flipped), () => writeFileSync(p2, good)), "checksum:0");
      const manifestPath = join(dir, M.MANIFEST_FILE);
      const goodManifest = readFileSync(manifestPath, "utf8");
      const forged = JSON.parse(goodManifest) as { tables: { parts: { name: string; sha256: string }[] }[] };
      forged.tables[1]!.parts[1]!.sha256 = F.sha256Hex(flipped);
      t.eq(
        "a tampered part whose hash was forged in the manifest: the envelope refuses it ('open_failed')",
        await refused(
          () => {
            writeFileSync(p2, flipped);
            writeFileSync(manifestPath, JSON.stringify(forged));
          },
          () => {
            writeFileSync(p2, good);
            writeFileSync(manifestPath, goodManifest);
          },
        ),
        "open_failed:3",
      );
      t.eq("a missing part: 'missing_part', nothing written", await refused(() => rmSync(p2), () => writeFileSync(p2, good)), "missing_part:0");
      t.eq("no manifest: 'no_manifest'", await refused(() => rmSync(manifestPath), () => writeFileSync(manifestPath, goodManifest)), "no_manifest:0");
      t.check("a part sealed for another purpose never opens as a backup part", (() => {
        try {
          SE.openPart(readFileSync(p2).subarray(0, 10));
          return false;
        } catch {
          return true;
        }
      })());
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (savedSecret === undefined) delete env.APP_SECRET;
      else env.APP_SECRET = savedSecret;
    }
  });

  h.section("backup: purge rule", (t) => {
    const req = [
      { storeId: STORE_X, at: "2026-10-01T10:00:00.000Z" },
      { storeId: STORE_Y, at: "2026-11-02T10:00:00.000Z" },
    ];
    t.eq("no snapshot retained: nothing dropped", RT.purgeIdsToDrop(req, []), []);
    t.eq("the oldest retained snapshot started before X's request: both kept", RT.purgeIdsToDrop(req, [{ startedAt: "2026-09-30T03:30:00.000Z" }, { startedAt: "2026-11-03T03:30:00.000Z" }]), []);
    t.eq("every retained snapshot started after X's request: X dropped, Y kept", RT.purgeIdsToDrop(req, [{ startedAt: "2026-10-05T03:30:00.000Z" }, { startedAt: "2026-11-03T03:30:00.000Z" }]), [STORE_X]);
    t.eq("…after both: both dropped", RT.purgeIdsToDrop(req, [{ startedAt: "2026-11-03T03:30:00.000Z" }]), [STORE_X, STORE_Y]);
    t.eq("a snapshot started at the very instant of the request still holds it", RT.purgeIdsToDrop([{ storeId: STORE_X, at: "2026-11-03T03:30:00.000Z" }], [{ startedAt: "2026-11-03T03:30:00.000Z" }]), []);
  });

  h.section("backup: restore target", (t) => {
    const ok = (name: string, opts?: Parameters<Restore["assertRestoreTarget"]>[1]) => {
      try {
        RS.assertRestoreTarget(name, opts);
        return true;
      } catch (err) {
        return err instanceof RS.RestoreError && err.code === "target_refused" ? false : "other";
      }
    };
    t.eq("cod_test_* accepted; cod_storegen, cod_studio, a live name refused", [ok("cod_test_restore_a"), ok("cod_storegen"), ok("cod_studio"), ok("u123_store")], [true, false, false, false]);
    t.eq("manual: a plain name accepted, the denied app database and odd names refused", [ok("u123_store", { manual: true }), ok("u123_store", { manual: true, deny: ["u123_store"] }), ok("a;drop", { manual: true }), ok("", { manual: true })], [true, false, false, false]);
  });
}
