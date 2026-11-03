/**
 * test:jobs, the store export's sections (P8 step 8; docs/STORE-SAAS.md §F.9, §H.2 slot 5). Loaded by ./selftest.ts
 * after its server-only stub. Offline: the ZIP cases write a few small files under one os.tmpdir() folder and remove
 * it; the signature cases use a throwaway APP_SECRET of this process (the job itself runs against MariaDB and a temp
 * DATA_DIR in test:storage's `export` section).
 *
 *  exports: registration  `exports` in slot 5, every tick, 11 s, CPU-bound (halved under lag)
 *  exports: csv           BOM, RFC 4180 quoting (comma, quote, CR, LF), the formula guard (= + - @ tab CR) on text
 *                         only, numbers / decimals with their scale / booleans / dates / JSON / NULL
 *  exports: zip           CRC-32 (node:zlib against the table), a part written across simulated tick boundaries (the
 *                         state through JSON, a fresh writer each tick, garbage after the saved offset cut away) opens
 *                         with fflate and every entry is byte-identical (stored and deflated, UTF-8 names, an empty
 *                         entry); a lost or short part refuses to resume; bad names and duplicates refused
 *  exports: parts         a small limit splits into several complete archives, each ≤ the limit unless it holds one
 *                         larger entry, every entry in exactly one part, sha256 and bytes of each; fitsPart's rule;
 *                         a resume in the middle of a roll; parsePartsState refusals
 *  exports: signature     a fresh token verifies; expired, tampered (sig, exp, part, job) and another store's refused
 *  exports: deny list     no exported column of any export table names a secret; the §F.9 list per table; nested
 *                         secret keys and run ids stripped; slugs and media extensions; README in ar / fr / en
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Job } from "./runner";
import type { Harness } from "./testing/harness";

type Zip = typeof import("@/lib/exports-store/zip");
type Csv = typeof import("@/lib/exports-store/csv");
type Sign = typeof import("@/lib/exports-store/sign");
type Columns = typeof import("@/lib/exports-store/columns");
type Readme = typeof import("@/lib/exports-store/readme");
type Slots = typeof import("./slots");
type Runner = typeof import("./runner");

export interface ExportSectionDeps {
  Z: Zip;
  CSV: Csv;
  SIG: Sign;
  COL: Columns;
  RM: Readme;
  S: Slots;
  R: Runner;
  JOBS: readonly Job[];
}

const STORE_A = "01JB8ZK3Q4R5S6T7V8W9XYZ0AA";
const STORE_B = "01JB8ZK3Q4R5S6T7V8W9XYZ0BB";
const JOB = "01JC0000000000000000000000";

export function exportSections(h: Harness, d: ExportSectionDeps): void {
  const { Z, CSV, SIG, COL, RM, S, R, JOBS } = d;

  h.section("exports: registration", (t) => {
    const j = JOBS.find((x) => x.name === "exports");
    t.check("exports: slot 5, every tick, 11 s", !!j && S.slotOf(j) === "5" && j.every === "tick" && j.budgetMs === 11_000);
    t.check("…CPU-bound: the runner halves it under lag", R.CPU_BOUND_JOBS.has("exports"));
    t.check("…within slot 5's cap", !!j && j.budgetMs <= S.maxJobBudgetMs("5"));
  });

  h.section("exports: csv", (t) => {
    t.eq("BOM is U+FEFF", CSV.CSV_BOM, "﻿");
    t.eq("plain text untouched", CSV.csvValue("Casablanca"), "Casablanca");
    t.eq("Arabic untouched", CSV.csvValue("الدار البيضاء"), "الدار البيضاء");
    t.eq("a comma is quoted", CSV.csvValue("a,b"), '"a,b"');
    t.eq("quotes doubled", CSV.csvValue('say "hi"'), '"say ""hi"""');
    t.eq("LF and CR quoted", [CSV.csvValue("a\nb"), CSV.csvValue("a\r\nb")], ['"a\nb"', '"a\r\nb"']);
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      const v = CSV.csvValue(`${lead}cmd|' /C calc'!A0`);
      t.check(`a text cell starting with ${JSON.stringify(lead)} gets an apostrophe`, v.startsWith("'") || v.startsWith(`"'`));
    }
    t.eq("=HYPERLINK with a comma: guarded and quoted", CSV.csvValue('=HYPERLINK("http://x",1)'), '"\'=HYPERLINK(""http://x"",1)"');
    t.eq("an E.164 phone is text: guarded", CSV.csvValue("+212612345678"), "'+212612345678");
    t.eq("a negative number from a numeric column is a number", CSV.csvValue(-150), "-150");
    t.eq("a decimal column keeps its stored scale", CSV.csvValue(199, { columnType: "MySqlDecimalNumber", scale: 2 }), "199.00");
    t.eq("integer cents stay integers", CSV.csvValue(19_990, { columnType: "MySqlBigInt53" }), "19990");
    t.eq("booleans as stored (1 / 0)", [CSV.csvValue(true), CSV.csvValue(false)], ["1", "0"]);
    t.eq("NULL is empty", [CSV.csvValue(null), CSV.csvValue(undefined)], ["", ""]);
    t.eq("dates in ISO UTC", CSV.csvValue(new Date(Date.UTC(2026, 10, 3, 9, 5, 7, 12))), "2026-11-03T09:05:07.012Z");
    t.eq("JSON columns compact and quoted", CSV.csvValue({ a: 1, b: "x,y" }), '"{""a"":1,""b"":""x,y""}"');
    t.eq("a JSON value starting with a sign is guarded too", CSV.csvValue(["-1"]), '"[""-1""]"');
    t.eq("lines end with CRLF", CSV.csvLine(["a", "b"]), "a,b\r\n");
    t.eq("header", CSV.csvHeader(["id", "phone"]), "id,phone\r\n");
  });

  const root = mkdtempSync(join(tmpdir(), "sg-export-selftest-"));
  const cleanup = () => rmSync(root, { recursive: true, force: true });

  h.section("exports: zip", async (t) => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const sample = randomBytes(70_000);
    t.eq("CRC-32: node:zlib and the table agree", Z.crc32(sample), Z.crc32Table(sample));
    t.eq("CRC-32 continues across chunks", Z.crc32(sample.subarray(30_000), Z.crc32(sample.subarray(0, 30_000))), Z.crc32Table(sample));
    t.eq("CRC-32 of '123456789' is the check value", Z.crc32Table(Buffer.from("123456789")), 0xcbf43926);

    const file = join(root, "one.zip");
    const text = Buffer.from("id,name\r\n" + "1,Amina الدار البيضاء\r\n".repeat(400), "utf8");
    const media = randomBytes(40_000);
    const big = join(root, "big.csv");
    writeFileSync(big, Buffer.concat([Buffer.from("﻿"), text]));
    // tick 1: two entries, the state saved through JSON
    let w = await Z.ZipPartWriter.open(file, null);
    await w.add("orders.csv", { path: big }, "deflate");
    await w.add("media/a1.webp", media, "store");
    let saved = JSON.parse(JSON.stringify(w.state())) as unknown;
    await w.close();
    // the tick dies after writing half an entry it never saved
    appendFileSync(file, randomBytes(5_000));
    // tick 2: resumes, the garbage is cut away
    const s2 = Z.parseZipState(saved);
    t.check("the saved state parses", s2 !== null);
    w = await Z.ZipPartWriter.open(file, s2);
    t.eq("…the file is cut back to the saved offset", statSync(file).size, s2!.offset);
    await w.add("pages/وردة/index.html", Buffer.from("<!doctype html><p>مرحبا</p>"), "deflate");
    await w.add("empty.json", Buffer.alloc(0), "deflate");
    saved = JSON.parse(JSON.stringify(w.state()));
    await w.close();
    // tick 3: a stream source, then the directory
    w = await Z.ZipPartWriter.open(file, Z.parseZipState(saved));
    const streamed = randomBytes(9_000);
    await w.add("media/b2.mp4", {
      stream: async function* () {
        yield streamed.subarray(0, 4_000);
        yield streamed.subarray(4_000);
      },
    }, "store");
    const total = await w.finish();
    t.eq("finish answers the file's size", total, statSync(file).size);
    let entries: Record<string, Uint8Array> = {};
    try {
      entries = unzipSync(new Uint8Array(readFileSync(file)));
    } catch (err) {
      t.check("fflate opens the archive", false, String(err));
    }
    t.eq("every entry, in order", Object.keys(entries), ["orders.csv", "media/a1.webp", "pages/وردة/index.html", "empty.json", "media/b2.mp4"]);
    t.check("the deflated CSV is byte-identical (BOM kept)", Buffer.from(entries["orders.csv"] ?? []).equals(readFileSync(big)));
    t.check("the stored media is byte-identical", Buffer.from(entries["media/a1.webp"] ?? []).equals(media));
    t.eq("UTF-8 names and text", strFromU8(entries["pages/وردة/index.html"] ?? new Uint8Array()), "<!doctype html><p>مرحبا</p>");
    t.eq("an empty entry", entries["empty.json"]?.length, 0);
    t.check("a streamed entry is byte-identical", Buffer.from(entries["media/b2.mp4"] ?? []).equals(streamed));
    const raw = readFileSync(file);
    t.eq("media is stored (method 0), text deflated (method 8)", [raw.readUInt16LE(8), raw.readUInt16LE((Z.parseZipState(saved)!.entries[1]!.o) + 8)], [8, 0]);
    t.check("the deflated text is smaller than the text", (Z.parseZipState(saved)!.entries[0]!.z) < text.length);

    // resume refusals
    const lost = join(root, "lost.zip");
    await t.rejects("a part that is gone does not resume", () => Z.ZipPartWriter.open(lost, { v: 1, offset: 100, entries: [] }), /part_missing/);
    writeFileSync(lost, Buffer.alloc(50));
    await t.rejects("a part shorter than its cursor does not resume", () => Z.ZipPartWriter.open(lost, { v: 1, offset: 100, entries: [] }), /part_short/);
    unlinkSync(lost);
    const w2 = await Z.ZipPartWriter.open(join(root, "names.zip"), null);
    for (const bad of ["../x", "/abs", "a//b", "a\\b", "", "a/./b", "x\u0000y"]) await t.rejects(`a bad name ${JSON.stringify(bad)} is refused`, () => w2.add(bad, Buffer.from("x"), "store"), /bad entry name/);
    await w2.add("a.txt", Buffer.from("x"), "store");
    await t.rejects("a duplicate name is refused", () => w2.add("a.txt", Buffer.from("y"), "store"), /duplicate/);
    await w2.close();
    t.eq("parseZipState refuses garbage", [Z.parseZipState(null), Z.parseZipState({ v: 2, offset: 0, entries: [] }), Z.parseZipState({ v: 1, offset: -1, entries: [] }), Z.parseZipState({ v: 1, offset: 0, entries: [{ n: "a", c: 1, z: 1, u: 1, o: 0, m: 5, t: 0, d: 0 }] })], [null, null, null, null]);
    const dos = Z.dosDateTime(new Date(Date.UTC(2026, 10, 3, 14, 30, 58)));
    t.eq("DOS date and time (UTC fields)", [dos.date >> 9, (dos.date >> 5) & 15, dos.date & 31, dos.time >> 11, (dos.time >> 5) & 63, (dos.time & 31) * 2], [46, 11, 3, 14, 30, 58]);
  });

  h.section("exports: parts", async (t) => {
    const { unzipSync } = await import("fflate");
    const dir = mkdtempSync(join(root, "parts-"));
    const LIMIT = 4_096;
    const blobs = Array.from({ length: 9 }, (_, i) => ({ name: `media/m${i}.webp`, data: randomBytes(i === 4 ? 6_000 : 900) }));
    let parts = await Z.ZipParts.open(dir, null, LIMIT);
    let state = parts.state();
    for (const [i, b] of blobs.entries()) {
      // a fresh writer every other entry: the state goes through JSON like the job's cursor
      if (i % 2 === 0) {
        await parts.close();
        parts = await Z.ZipParts.open(dir, Z.parsePartsState(JSON.parse(JSON.stringify(state))), LIMIT);
      }
      await parts.add(b.name, b.data, "store");
      state = parts.state();
    }
    const done = await parts.finish();
    t.check("a small limit gives several parts", done.length >= 3, `${done.length} parts`);
    t.eq("parts are named part-<n>.zip", done.map((p) => p.name), done.map((_, i) => Z.partFileName(i + 1)));
    const seen: string[] = [];
    let okBytes = true;
    let okSha = true;
    let okSize = true;
    for (const p of done) {
      const buf = readFileSync(join(dir, p.name));
      okBytes &&= buf.length === p.bytes;
      okSha &&= createHash("sha256").update(buf).digest("hex") === p.sha256;
      const names = Object.keys(unzipSync(new Uint8Array(buf)));
      okSize &&= p.bytes <= LIMIT || names.length === 1;
      seen.push(...names);
    }
    t.check("each part's bytes are the file's", okBytes);
    t.check("each part's sha256 is the file's", okSha);
    t.check("each part ≤ the limit, unless it holds one larger entry alone", okSize);
    t.eq("every entry in exactly one part, in order", seen, blobs.map((b) => b.name));

    // a tick dies in the middle of a roll (the part finished on disk, its cursor not saved): the resume redoes it
    const dir2 = mkdtempSync(join(root, "roll-"));
    let p2 = await Z.ZipParts.open(dir2, null, 2_000);
    await p2.add("a.bin", randomBytes(1_200), "store");
    const before = JSON.parse(JSON.stringify(p2.state())) as unknown;
    await p2.add("b.bin", randomBytes(1_200), "store"); // rolls: part 1 finished, part 2 begun
    t.eq("…the add rolled to part 2", p2.part, 2);
    await p2.close();
    p2 = await Z.ZipParts.open(dir2, Z.parsePartsState(before), 2_000);
    await p2.add("b.bin", randomBytes(1_200), "store");
    const done2 = await p2.finish();
    t.eq("…resumed from the saved cursor: two parts, one entry each", done2.map((p) => Object.keys(unzipSync(new Uint8Array(readFileSync(join(dir2, p.name)))))), [["a.bin"], ["b.bin"]]);

    const at = { bytes: 1_000, count: 3, directoryBytes: 200 };
    t.check("fitsPart: fits under the limit", Z.fitsPart(at, "x", 100, "store", 2_000));
    t.check("fitsPart: an entry past the limit starts the next part", !Z.fitsPart(at, "x", 900, "store", 2_000));
    t.check("fitsPart: an empty part takes any entry", Z.fitsPart({ bytes: 0, count: 0, directoryBytes: 22 }, "x", 10_000, "store", 2_000));
    t.check("fitsPart: deflate counts its worst case", !Z.fitsPart(at, "x", 700, "deflate", 1_980) && Z.fitsPart(at, "x", 700, "store", 1_980));
    t.check("fitsPart: 65,000 entries close a part", !Z.fitsPart({ bytes: 10, count: Z.MAX_PART_ENTRIES, directoryBytes: 10 }, "x", 1, "store", Z.PART_LIMIT_BYTES));
    t.eq("the default limit is 500 MB", Z.PART_LIMIT_BYTES, 500 * 1024 * 1024);
    t.eq("parsePartsState refuses a done list that does not match n", Z.parsePartsState({ n: 2, zip: { v: 1, offset: 0, entries: [] }, done: [] }), null);
    t.eq("parsePartsState refuses a bad sha", Z.parsePartsState({ n: 2, zip: { v: 1, offset: 0, entries: [] }, done: [{ name: "part-1.zip", bytes: 1, sha256: "x" }] }), null);
    cleanup();
  });

  h.section("exports: signature", (t) => {
    const env = process.env as Record<string, string | undefined>;
    const saved = env.APP_SECRET;
    env.APP_SECRET = randomBytes(32).toString("hex");
    try {
      const now = Date.UTC(2026, 10, 3, 12, 0, 0);
      const exp = Math.floor(now / 1000) + SIG.EXPORT_LINK_TTL_S;
      const tok = SIG.exportToken(STORE_A, JOB, "1", exp);
      t.check("a fresh token verifies", SIG.verifyExportToken(STORE_A, JOB, "1", tok, now));
      t.check("…until its exp", SIG.verifyExportToken(STORE_A, JOB, "1", tok, exp * 1000 - 1) && !SIG.verifyExportToken(STORE_A, JOB, "1", tok, exp * 1000));
      t.check("expired: refused", !SIG.verifyExportToken(STORE_A, JOB, "1", tok, now + 25 * 3_600_000));
      const [e, s] = tok.split(".") as [string, string];
      const flip = (x: string) => x.slice(0, -1) + (x.endsWith("0") ? "1" : "0");
      t.check("a tampered signature: refused", !SIG.verifyExportToken(STORE_A, JOB, "1", `${e}.${flip(s)}`, now));
      t.check("a later exp with the old signature: refused", !SIG.verifyExportToken(STORE_A, JOB, "1", `${Number(e) + 3600}.${s}`, now));
      t.check("another part: refused", !SIG.verifyExportToken(STORE_A, JOB, "2", tok, now));
      t.check("another job: refused", !SIG.verifyExportToken(STORE_A, "01JC0000000000000000000001", "1", tok, now));
      t.check("another store (B's key): refused", !SIG.verifyExportToken(STORE_B, JOB, "1", tok, now));
      t.check("B's token for the same job id never verifies for A", !SIG.verifyExportToken(STORE_A, JOB, "1", SIG.exportToken(STORE_B, JOB, "1", exp), now));
      t.check("malformed tokens: refused", ["", "x", `${e}`, `${e}.`, `.${s}`, `${e}.${s.toUpperCase()}`, `-1.${s}`, null, undefined].every((x) => !SIG.verifyExportToken(STORE_A, JOB, "1", x, now)));
      t.eq("the link is valid 24 h", SIG.EXPORT_LINK_TTL_S, 86_400);
      t.eq("never past the job's expiry", SIG.linkExpiry(now, new Date(now + 3_600_000)), Math.floor(now / 1000) + 3_600);
      t.eq("24 h when the job lives longer", SIG.linkExpiry(now, new Date(now + 72 * 3_600_000)), exp);
    } finally {
      if (saved === undefined) delete env.APP_SECRET;
      else env.APP_SECRET = saved;
    }
  });

  h.section("exports: deny list", (t) => {
    const leaks: string[] = [];
    for (const [table, cols] of Object.entries(COL.EXPORT_TABLES)) {
      const { names } = COL.pickColumns(table, cols, null);
      for (const n of names) if (COL.COLUMN_SECRET_RE.test(n) || (COL.EXPORT_DENY[table] ?? []).includes(n)) leaks.push(`${table}.${n}`);
    }
    t.eq("no exported column names a secret, in any export table", leaks, []);
    const orders = COL.pickColumns("orders", COL.EXPORT_TABLES.orders, null).names;
    t.check("orders: never capi_ctx, the upsell token hash or the claim token", !orders.includes("capi_ctx") && !orders.includes("upsell_token_hash") && !orders.includes("claim_token"));
    t.check("orders: every other column, phones and amounts included", ["id", "phone", "phone_raw", "subtotal", "total", "currency", "adjust_cents", "is_test", "items"].every((c) => orders.includes(c)));
    t.check("campaigns: never the share token hash", !COL.pickColumns("campaigns", COL.EXPORT_TABLES.campaigns, null).names.includes("share_token_hash"));
    t.check("short_links keeps its code (not a secret)", COL.pickColumns("short_links", COL.EXPORT_TABLES.short_links, null).names.includes("code"));
    t.check("a secret-looking column of any table is withheld", ["webhook_secret", "api_key_hash", "bot_token", "carrier_credentials", "password_hash", "totp_secret_enc", "test_token"].every((c) => !COL.columnAllowed("anything", c)));
    const present = new Set(["id", "store_id", "phone"]);
    const p = COL.pickColumns("orders", COL.EXPORT_TABLES.orders, present);
    t.eq("columns the database lacks are skipped and listed", [p.names, p.missing.includes("landmark"), p.missing.includes("capi_ctx")], [["id", "store_id", "phone"], true, false]);
    const AUDIT_RE = /pass|secret|token|otp|cookie|authorization|recovery|^code$|private.?key|api.?key/i;
    t.eq(
      "nested secret keys dropped at any depth",
      COL.stripSecretKeys({ name: "x", botToken: "t", deep: [{ secretKey: "s", ok: 1, apiKey: "k" }], webhook: { url: "u", secret: "s" } }, AUDIT_RE),
      { name: "x", deep: [{ ok: 1 }], webhook: { url: "u" } },
    );
    t.eq("slugs as names: kept, else cleaned with the id's tail", [COL.slugName("creme-visage", "01JC00000000000000000ABCDE"), COL.slugName("../x y", "01JC00000000000000000ABCDE")], ["creme-visage", "x-y-0abcde"]);
    t.eq("media extensions from the stored type", [COL.mediaExt("image/webp"), COL.mediaExt("image/JPEG"), COL.mediaExt("video/mp4"), COL.mediaExt("application/x-what")], ["webp", "jpg", "mp4", "bin"]);
    t.eq("run ids dropped from AI memory evidence", COL.stripRunIds({ edits: 2, runIds: ["r1"], runId: "r", examples: ["a"], screen: { reason: "x", lastRunId: "r" }, truncated: true }), { edits: 2, examples: ["a"], screen: { reason: "x" }, truncated: true });

    const readme = RM.buildReadme({ storeName: "Bayt Lwarda", handle: "warda", createdAt: "2026-11-03T10:00:00.000Z", parts: 2, files: ["orders.csv", "pages/", "media/"], notes: ["table customers: not in this database, customers.csv skipped"] });
    t.check("README: Arabic, French and English", readme.includes("تصدير بيانات المتجر") && readme.includes("Export des données") && readme.includes("Data export of"));
    t.check("README: no em or en dash", !/[–—]/.test(readme));
    t.check("README: the files written, the part count and the notes", readme.includes("orders.csv") && readme.includes("media/") && readme.includes("2 ZIP parts") && readme.includes("customers.csv skipped"));
    t.check("README: says what is never exported", readme.includes("Never included") && readme.includes("Jamais inclus"));
  });
}
