/**
 * Media hardening self-test (no database, no Next runtime):
 *   npx tsx src/lib/media/selftest.ts
 *
 *  1. video.ts — bounded MP4/WebM walks (hostile "millions of tiny boxes" files are rejected fast and
 *     cheaply) and the privacy scrub (XMP uuid, udta/meta, telemetry tracks + their samples, trailing
 *     bytes; WebM Tags/Attachments/Chapters/Info/track names + SeekHead entries), with structure
 *     re-validated after the rewrite. Real WebM samples in qa/video/media are checked when present.
 *  2. upload-body.ts — single-copy body reader (and the capped reader for chunked bodies) and the
 *     multipart parser against undici-encoded forms.
 *  3. upload-slots.ts / throttle.ts — in-flight upload slots (per member of a store, per store, per process)
 *     and the per-IP media token bucket.
 *  4. gate.ts — the processing gate shared fairly between stores (≤ 1 running + 1 waiting per store).
 * The database/disk side lives in selftest-store.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MediaError } from "./errors";
import { MAX_CONCURRENT, MAX_WAITING, acquireMediaGate, releaseMediaGate } from "./gate";
import { spendMediaTokens, BUCKET_SIZE, REFILL_PER_SECOND } from "./throttle";
import { declaredLength, MAX_PARTS, multipartBoundary, parseMultipart, readCappedBody, readExactBody } from "./upload-body";
import { MAX_UPLOADS, MAX_UPLOADS_PER_STORE, MAX_UPLOADS_PER_USER, takeUploadSlot } from "./upload-slots";
import { inspectVideo, MAX_SIBLINGS } from "./video";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes++;
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const section = (title: string) => console.log(`\n${title}`);
const has = (buf: Buffer, needle: string | Buffer) => buf.indexOf(typeof needle === "string" ? Buffer.from(needle, "latin1") : needle) >= 0;
function rejects(fn: () => unknown, code: string): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof MediaError && err.code === code;
  }
}

/* ------------------------------------------------------------------ */
/* MP4 builders                                                        */
/* ------------------------------------------------------------------ */

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]);
};
const fullBox = (type: string, ...parts: Buffer[]) => box(type, u32(0), ...parts);

function tkhd(width: number, height: number, portrait = false): Buffer {
  const body = Buffer.alloc(80); // after version/flags: 20 header bytes, 16 misc, 36 matrix, 8 size
  const matrix = portrait ? [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000] : [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  matrix.forEach((v, i) => body.writeInt32BE(v, 36 + i * 4));
  body.writeUInt32BE(width * 0x10000, 72);
  body.writeUInt32BE(height * 0x10000, 76);
  return fullBox("tkhd", body);
}
const hdlr = (handler: string) => fullBox("hdlr", u32(0), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from("Handler\0"));
const stsd = (codec: string) => fullBox("stsd", u32(1), box(codec, Buffer.alloc(78)));
/** sample table: one chunk per entry of `chunks` (offset + sample sizes) */
function stbl(codec: string, chunks: { offset: number; sizes: number[] }[]): Buffer {
  const sizes = chunks.flatMap((c) => c.sizes);
  const stsc = Buffer.concat(chunks.map((c, i) => Buffer.concat([u32(i + 1), u32(c.sizes.length), u32(1)])));
  return box(
    "stbl",
    stsd(codec),
    fullBox("stts", u32(0)),
    fullBox("stsc", u32(chunks.length), stsc),
    fullBox("stsz", u32(0), u32(sizes.length), ...sizes.map(u32)),
    fullBox("stco", u32(chunks.length), ...chunks.map((c) => u32(c.offset))),
  );
}
const trak = (handler: string, header: Buffer, table: Buffer, ...extra: Buffer[]) =>
  box("trak", header, box("mdia", fullBox("mdhd", Buffer.alloc(20)), hdlr(handler), box("minf", table)), ...extra);

const XYZ = Buffer.from([0xa9, 0x78, 0x79, 0x7a]); // ©xyz (QuickTime location atom)

interface Mp4Case {
  file: Buffer;
  trailing: number;
}

/** ftyp · uuid(XMP) · mdat(video + GPMF samples) · moov(video trak, gpmd trak, udta, meta) · garbage */
function sampleMp4(opts: { codec?: string; portrait?: boolean; fragmented?: boolean } = {}): Mp4Case {
  const ftyp = box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomavc1"));
  const xmp = box(
    "uuid",
    Buffer.from("be7acfcb97a942e89c71999491e3afac", "hex"),
    Buffer.from('<x:xmpmeta><stRef:filePath>C:\\Users\\AhmedPrivate\\Projects\\argan.prproj</stRef:filePath></x:xmpmeta>'),
  );
  const video = [Buffer.from("VIDEOFRAME-0001"), Buffer.from("VIDEOFRAME-0002")];
  const gps = [Buffer.from("GPS5LAT33.5731LON-7.5898#1"), Buffer.from("GPS5LAT33.5731LON-7.5898#2"), Buffer.from("GPS5LAT33.5731LON-7.5898#3")];
  const mdatBody = Buffer.concat([...video, ...gps]);
  const mdatStart = ftyp.length + xmp.length + 8;
  const videoOffset = mdatStart;
  const gpsOffset = mdatStart + video[0]!.length + video[1]!.length;
  const mdat = box("mdat", mdatBody);
  const moov = box(
    "moov",
    fullBox("mvhd", Buffer.alloc(96)),
    trak(
      "vide",
      tkhd(640, 360, opts.portrait),
      stbl(opts.codec ?? "avc1", [{ offset: videoOffset, sizes: video.map((v) => v.length) }]),
      box("udta", box("©xyz", Buffer.from("+33.5731-007.5898/"))),
    ),
    trak(
      "meta",
      tkhd(0, 0),
      // two chunks: samples 1+2 in the first, sample 3 in the second
      stbl("gpmd", [
        { offset: gpsOffset, sizes: [gps[0]!.length, gps[1]!.length] },
        { offset: gpsOffset + gps[0]!.length + gps[1]!.length, sizes: [gps[2]!.length] },
      ]),
    ),
    ...(opts.fragmented ? [box("mvex", fullBox("trex", Buffer.alloc(20)))] : []),
    box("udta", box("©xyz", Buffer.from("+33.5731-007.5898/")), box("auth", Buffer.from("Ahmed Owner"))),
    fullBox("meta", hdlr("mdta"), box("keys", Buffer.from("com.apple.quicktime.location.ISO6709"))),
  );
  const garbage = Buffer.concat([u32(0xffff), Buffer.from("TRAILING-SECRET-NOTES")]);
  return { file: Buffer.concat([ftyp, xmp, mdat, moov, garbage]), trailing: garbage.length };
}

/** Top-level / nested box types of an MP4 (strict: every child list must tile its parent exactly). */
function mp4Types(buf: Buffer, start: number, end: number): string[] | null {
  const out: string[] = [];
  let o = start;
  while (o < end) {
    if (o + 8 > end) return null;
    const size = buf.readUInt32BE(o);
    if (size < 8 || o + size > end) return null;
    out.push(buf.toString("latin1", o + 4, o + 8));
    o += size;
  }
  return out;
}
function mp4Child(buf: Buffer, start: number, end: number, type: string): [number, number] | null {
  let o = start;
  while (o + 8 <= end) {
    const size = buf.readUInt32BE(o);
    if (buf.toString("latin1", o + 4, o + 8) === type) return [o + 8, o + size];
    o += size;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* WebM builders                                                       */
/* ------------------------------------------------------------------ */

function idBytes(id: number): Buffer {
  const len = id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1;
  const b = Buffer.alloc(len);
  b.writeUIntBE(id, 0, len);
  return b;
}
function sizeBytes(n: number): Buffer {
  if (n < 0x7f) return Buffer.from([0x80 | n]);
  if (n < 0x3fff) return Buffer.from([0x40 | (n >> 8), n & 0xff]);
  const b = Buffer.alloc(4);
  b.writeUInt32BE(0x10000000 | n);
  return b;
}
const UNKNOWN = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const el = (id: number, ...parts: (Buffer | string)[]) => {
  const body = Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "utf8") : p)));
  return Buffer.concat([idBytes(id), sizeBytes(body.length), body]);
};
const uintEl = (id: number, v: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v);
  return el(id, b);
};
const elUnknown = (id: number, ...parts: Buffer[]) => Buffer.concat([idBytes(id), UNKNOWN, ...parts]);

const W = {
  ebml: 0x1a45dfa3, docType: 0x4282, segment: 0x18538067, seekHead: 0x114d9b74, seek: 0x4dbb, seekId: 0x53ab,
  seekPos: 0x53ac, info: 0x1549a966, timecodeScale: 0x2ad7b1, muxingApp: 0x4d80, writingApp: 0x5741,
  title: 0x7ba9, dateUtc: 0x4461, crc: 0xbf, tracks: 0x1654ae6b, trackEntry: 0xae, trackNumber: 0xd7,
  name: 0x536e, codecId: 0x86, video: 0xe0, pixelWidth: 0xb0, pixelHeight: 0xba, tags: 0x1254c367,
  tag: 0x7373, simpleTag: 0x67c8, tagName: 0x45a3, tagString: 0x4487, cluster: 0x1f43b675, timecode: 0xe7,
  simpleBlock: 0xa3, cues: 0x1c53bb6b, attachments: 0x1941a469, attachedFile: 0x61a7, fileName: 0x466e,
  fileData: 0x465c, chapters: 0x1043a770,
};
const MASTERS = new Set([W.segment, W.seekHead, W.seek, W.info, W.tracks, W.trackEntry, W.video, W.cluster, W.ebml]);

function sampleWebm(opts: { liveCluster?: boolean } = {}): Buffer {
  const header = el(W.ebml, el(W.docType, "webm"));
  const seekHead = el(
    W.seekHead,
    el(W.seek, el(W.seekId, idBytes(W.tags)), el(W.seekPos, Buffer.from([0x01, 0x00]))),
    el(W.seek, el(W.seekId, idBytes(W.cues)), el(W.seekPos, Buffer.from([0x02, 0x00]))),
  );
  const info = el(
    W.info,
    el(W.crc, Buffer.from([1, 2, 3, 4])),
    el(W.timecodeScale, Buffer.from([0x0f, 0x42, 0x40])),
    el(W.muxingApp, "Lavf60.3.100"),
    el(W.writingApp, "Lavf60.3.100"),
    el(W.title, "Ahmed home warehouse Casablanca"),
    el(W.dateUtc, Buffer.alloc(8, 7)),
  );
  const tracks = el(
    W.tracks,
    el(
      W.trackEntry,
      el(W.trackNumber, Buffer.from([1])),
      el(W.name, "Samsung SM-G991B rear camera"),
      el(W.codecId, "V_VP9"),
      el(W.video, uintEl(W.pixelWidth, 720), uintEl(W.pixelHeight, 1280)),
    ),
  );
  const tags = el(W.tags, el(W.tag, el(W.simpleTag, el(W.tagName, "location"), el(W.tagString, "+33.5731-007.5898/"))));
  const cluster = (frame: string) => el(W.cluster, el(W.timecode, Buffer.from([0])), el(W.simpleBlock, frame));
  const attachments = el(W.attachments, el(W.attachedFile, el(W.fileName, "secret-id-card.jpg"), el(W.fileData, "JPEGDATA-PRIVATE")));
  const chapters = el(W.chapters, Buffer.from("CHAPTER-Ahmed"));
  const cues = el(W.cues, Buffer.from([0xbb, 0x80]));
  if (opts.liveCluster) {
    // live/streamed layout: unknown-size Segment and Cluster, Tags after the cluster
    const liveCluster = elUnknown(W.cluster, el(W.timecode, Buffer.from([0])), el(W.simpleBlock, "VIDEOFRAME-LIVE-1"), el(W.simpleBlock, "VIDEOFRAME-LIVE-2"));
    return Buffer.concat([header, elUnknown(W.segment, info, tracks, liveCluster, tags, cluster("VIDEOFRAME-AFTER"))]);
  }
  return Buffer.concat([header, el(W.segment, seekHead, info, tracks, tags, cluster("VIDEOFRAME-0001"), cues, attachments, chapters)]);
}

/** Strict EBML structure check: every master element's children tile it exactly. */
function webmValid(buf: Buffer, start: number, end: number, depth = 0): boolean {
  let o = start;
  while (o < end) {
    const first = buf[o]!;
    let idLen = 1;
    while (idLen <= 4 && !(first & (0x80 >> (idLen - 1)))) idLen++;
    if (idLen > 4) return false;
    const id = buf.readUIntBE(o, idLen);
    const s0 = buf[o + idLen]!;
    let sLen = 1;
    while (sLen <= 8 && !(s0 & (0x80 >> (sLen - 1)))) sLen++;
    if (sLen > 8) return false;
    let size = s0 & (0xff >> sLen);
    let allOnes = size === 0xff >> sLen;
    for (let i = 1; i < sLen; i++) {
      size = size * 256 + buf[o + idLen + i]!;
      if (buf[o + idLen + i] !== 0xff) allOnes = false;
    }
    const body = o + idLen + sLen;
    const elEnd = allOnes ? end : body + size;
    if (elEnd > end) return false;
    if (MASTERS.has(id) && depth < 6 && !allOnes && !webmValid(buf, body, elEnd, depth + 1)) return false;
    if (allOnes) return true; // unknown size: the rest belongs to it
    o = elEnd;
  }
  return o === end;
}

/* ------------------------------------------------------------------ */
/* 1. video                                                            */
/* ------------------------------------------------------------------ */

section("video · MP4 scrub");
{
  const { file, trailing } = sampleMp4();
  const original = Buffer.from(file);
  const info = inspectVideo(file, "mp4");
  const out = info.data;
  check("mp4 dimensions", info.width === 640 && info.height === 360, `${info.width}×${info.height}`);
  check("trailing bytes dropped", out.length === original.length - trailing, `${out.length} vs ${original.length}`);
  check("XMP uuid wiped", !has(out, "AhmedPrivate") && !has(out, "xmpmeta"));
  check("©xyz location atoms wiped", !has(out, XYZ) && !has(out, "+33.5731"));
  check("moov meta keys wiped", !has(out, "com.apple.quicktime.location"));
  check("udta author wiped", !has(out, "Ahmed Owner"));
  check("telemetry samples zeroed in mdat", !has(out, "GPS5LAT"));
  check("video samples untouched", has(out, "VIDEOFRAME-0001") && has(out, "VIDEOFRAME-0002"));
  check("trailing secret gone", !has(out, "TRAILING-SECRET"));
  const top = mp4Types(out, 0, out.length);
  check("top level tiles exactly", JSON.stringify(top) === JSON.stringify(["ftyp", "free", "mdat", "moov"]), JSON.stringify(top));
  const moov = mp4Child(out, 0, out.length, "moov")!;
  const kids = mp4Types(out, moov[0], moov[1]);
  check("moov keeps mvhd + video trak, blanks the rest", JSON.stringify(kids) === JSON.stringify(["mvhd", "trak", "free", "free", "free"]), JSON.stringify(kids));
  const vtrak = mp4Child(out, moov[0], moov[1], "trak")!;
  check("video trak udta blanked", JSON.stringify(mp4Types(out, vtrak[0], vtrak[1])) === JSON.stringify(["tkhd", "mdia", "free"]));
  check("same length up to the last box", out.subarray(0, 8).equals(original.subarray(0, 8)) && out.length + trailing === original.length);
  const again = inspectVideo(Buffer.from(out), "mp4");
  check("scrubbed file re-inspects identically", again.width === 640 && again.height === 360 && again.data.equals(out));

  const portrait = inspectVideo(sampleMp4({ portrait: true }).file, "mp4");
  check("rotation matrix swaps to portrait", portrait.width === 360 && portrait.height === 640);
  check("HEVC refused", rejects(() => inspectVideo(sampleMp4({ codec: "hvc1" }).file, "mp4"), "video_codec"));
  check("fragmented file with a telemetry track refused", rejects(() => inspectVideo(sampleMp4({ fragmented: true }).file, "mp4"), "video_track"));
  check("no moov → invalid", rejects(() => inspectVideo(Buffer.concat([box("ftyp", Buffer.from("isom")), box("mdat", Buffer.alloc(16))]), "mp4"), "invalid_video"));

  // abusive sample table: constant sample size with 4 billion samples must not spin
  const t0 = performance.now();
  const hostile = (() => {
    const ftyp = box("ftyp", Buffer.from("isom"), u32(0));
    const mdat = box("mdat", Buffer.alloc(64));
    const table = box(
      "stbl",
      stsd("gpmd"),
      fullBox("stsc", u32(1), u32(1), u32(0xffffffff), u32(1)),
      fullBox("stsz", u32(4), u32(0xffffffff)),
      fullBox("stco", u32(1), u32(ftyp.length + 8)),
    );
    const moov = box("moov", trak("vide", tkhd(320, 240), stbl("avc1", [])), trak("meta", tkhd(0, 0), table));
    return Buffer.concat([ftyp, mdat, moov]);
  })();
  check("4-billion-sample table rejected", rejects(() => inspectVideo(hostile, "mp4"), "invalid_video"));
  check("…quickly", performance.now() - t0 < 500, `${Math.round(performance.now() - t0)} ms`);
}

section("video · WebM scrub");
{
  const file = sampleWebm();
  const original = Buffer.from(file);
  const info = inspectVideo(file, "webm");
  const out = info.data;
  check("webm dimensions", info.width === 720 && info.height === 1280, `${info.width}×${info.height}`);
  check("length unchanged (offsets stay valid)", out.length === original.length);
  check("Info title/date wiped", !has(out, "Ahmed home") && !has(out, Buffer.alloc(8, 7)));
  check("track name wiped", !has(out, "Samsung"));
  check("Tags (location) wiped", !has(out, "+33.5731") && !has(out, "location"));
  check("Attachments wiped", !has(out, "secret-id-card") && !has(out, "JPEGDATA"));
  check("Chapters wiped", !has(out, "CHAPTER-Ahmed"));
  check("muxing app kept", has(out, "Lavf60.3.100"));
  check("frames untouched", has(out, "VIDEOFRAME-0001"));
  check("CRC-32 of the edited Info voided", !has(out, Buffer.from([1, 2, 3, 4])));
  check("SeekHead entry for Tags voided", !has(out, idBytes(W.tags)));
  check("SeekHead entry for Cues kept", out.indexOf(idBytes(W.cues)) < out.indexOf(Buffer.from("Lavf")));
  check("structure still tiles exactly", webmValid(out, 0, out.length));
  const again = inspectVideo(Buffer.from(out), "webm");
  check("scrubbed file re-inspects identically", again.width === 720 && again.data.equals(out));

  const live = sampleWebm({ liveCluster: true });
  const liveInfo = inspectVideo(live, "webm");
  check("live layout: dims read", liveInfo.width === 720 && liveInfo.height === 1280);
  check("live layout: Tags after an unknown-size cluster wiped", !has(liveInfo.data, "+33.5731"));
  check("live layout: frames untouched", has(liveInfo.data, "VIDEOFRAME-LIVE-2") && has(liveInfo.data, "VIDEOFRAME-AFTER"));

  for (const name of ["land.webm", "tall.webm"]) {
    const path = join(process.cwd(), "qa", "video", "media", name);
    if (!existsSync(path)) continue;
    const real = readFileSync(path);
    const before = Buffer.from(real);
    try {
      const r = inspectVideo(real, "webm");
      const changed = r.data.reduce((n, b, i) => n + (b !== before[i] ? 1 : 0), 0);
      check(`real ${name}: parsed`, r.width > 0 && r.height > 0 && r.data.length === before.length, `${r.width}×${r.height}`);
      check(`real ${name}: still well-formed`, webmValid(r.data, 0, r.data.length));
      console.log(`  · ${name}: ${r.width}×${r.height}, ${changed} metadata byte(s) rewritten`);
    } catch (err) {
      check(`real ${name}: parsed`, false, String(err));
    }
  }
}

section("video · hostile files (bounded walks)");
{
  const run = (label: string, make: () => Buffer, format: "mp4" | "webm") => {
    const buf = make();
    (globalThis as { gc?: () => void }).gc?.();
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const ok = rejects(() => inspectVideo(buf, format), "invalid_video");
    const ms = performance.now() - t0;
    const heapMb = (process.memoryUsage().heapUsed - heap0) / 1e6;
    check(`${label}: rejected`, ok);
    check(`${label}: fast (${ms.toFixed(1)} ms)`, ms < 250);
    check(`${label}: no heap blow-up (${heapMb.toFixed(1)} MB)`, heapMb < 32);
  };
  const MB25 = 25 * 1024 * 1024;
  run("25 MB of 8-byte MP4 free boxes", () => {
    const buf = Buffer.alloc(MB25);
    box("ftyp", Buffer.from("isom"), u32(0)).copy(buf, 0);
    for (let o = 16; o + 8 <= buf.length; o += 8) {
      buf.writeUInt32BE(8, o);
      buf.write("free", o + 4, "latin1");
    }
    return buf;
  }, "mp4");
  run("25 MB of WebM Void elements (top level)", () => {
    const head = el(W.ebml, el(W.docType, "webm"));
    const buf = Buffer.alloc(MB25);
    head.copy(buf, 0);
    for (let o = head.length; o + 2 <= buf.length; o += 2) {
      buf[o] = 0xec;
      buf[o + 1] = 0x80;
    }
    return buf;
  }, "webm");
  run("25 MB of WebM Void elements (inside Segment)", () => {
    const head = Buffer.concat([el(W.ebml, el(W.docType, "webm")), idBytes(W.segment), UNKNOWN]);
    const buf = Buffer.alloc(MB25);
    head.copy(buf, 0);
    for (let o = head.length; o + 2 <= buf.length; o += 2) {
      buf[o] = 0xec;
      buf[o + 1] = 0x80;
    }
    return buf;
  }, "webm");
  run("MP4 moov with 16k+1 empty traks", () => {
    const traks = Buffer.alloc((MAX_SIBLINGS + 1) * 8);
    for (let i = 0; i < MAX_SIBLINGS + 1; i++) {
      traks.writeUInt32BE(8, i * 8);
      traks.write("trak", i * 8 + 4, "latin1");
    }
    return Buffer.concat([box("ftyp", Buffer.from("isom"), u32(0)), box("mdat", Buffer.alloc(8)), box("moov", traks)]);
  }, "mp4");
}

/* ------------------------------------------------------------------ */
/* 2. upload body                                                      */
/* ------------------------------------------------------------------ */

const streamOf = (buf: Buffer, chunk = 7919) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (let o = 0; o < buf.length; o += chunk) c.enqueue(new Uint8Array(buf.subarray(o, o + chunk)));
      c.close();
    },
  });

async function encode(form: FormData): Promise<{ type: string; body: Buffer }> {
  const res = new Response(form);
  return { type: res.headers.get("content-type")!, body: Buffer.from(await res.arrayBuffer()) };
}

async function uploadBodyTests(): Promise<void> {
  section("upload body · multipart");
  const payload = Buffer.alloc(3 * 1024 * 1024 + 17);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff;
  // bytes that look like a delimiter but are not this form's boundary
  Buffer.from("\r\n------WebKitFormBoundaryNOPE\r\n--").copy(payload, 1000);
  const form = new FormData();
  form.append("cutout", "1");
  form.append("file", new Blob([new Uint8Array(payload)]), 'vid "final"\r\nمنتج.mp4');
  form.append("sourceAssetId", "0123456789abcdef0123456789abcdef");
  form.append("file", new Blob(["second file ignored"]), "b.png");
  const { type, body } = await encode(form);

  const boundary = multipartBoundary(type);
  check("boundary parsed from undici Content-Type", !!boundary && type.includes(boundary));
  const read = await readExactBody(streamOf(body), body.length);
  check("exact body read", read.ok && read.value.equals(body));
  const parsed = read.ok && boundary ? parseMultipart(read.value, boundary) : null;
  check("form parsed", !!parsed);
  check("file bytes identical", !!parsed?.file && parsed.file.data.equals(payload));
  check("file is a view, not a copy", !!parsed?.file && read.ok && parsed.file.data.buffer === read.value.buffer);
  check("WHATWG-escaped filename decoded", parsed?.file?.name === 'vid "final"\r\nمنتج.mp4', JSON.stringify(parsed?.file?.name));
  check("first file wins", parsed?.file?.data.length === payload.length);
  check("text fields", parsed?.fields.get("cutout") === "1" && parsed?.fields.get("sourceAssetId") === "0123456789abcdef0123456789abcdef");

  const short = await readExactBody(streamOf(body), body.length + 1);
  check("body shorter than Content-Length → 400", !short.ok && short.status === 400);
  const long = await readExactBody(streamOf(body), body.length - 1);
  check("body longer than Content-Length → 400", !long.ok && long.status === 400);
  check("missing body → 400", !(await readExactBody(null, 10)).ok);

  // no Content-Length (a proxy forwarding the upload chunked): streamed under a hard cap
  const capped = await readCappedBody(streamOf(body), body.length);
  check("chunked body within the cap read whole", capped.ok && capped.value.equals(body));
  let pulled = 0;
  let cancelled = false;
  const endless = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled++;
      c.enqueue(new Uint8Array(64 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const over = await readCappedBody(endless, 1024 * 1024);
  check("endless chunked body → 413 at the cap, stream cancelled", !over.ok && over.status === 413 && cancelled && pulled <= 20, `pulled ${pulled} chunks`);
  check("empty chunked body → 400", !(await readCappedBody(streamOf(Buffer.alloc(0)), 1024)).ok);
  check("missing chunked body → 400", !(await readCappedBody(null, 1024)).ok);

  if (boundary) {
    check("truncated body → null", parseMultipart(body.subarray(0, body.length - 10), boundary) === null);
    const many = new FormData();
    for (let i = 0; i <= MAX_PARTS; i++) many.append(`f${i}`, "x");
    const m = await encode(many);
    check("too many parts → null", parseMultipart(m.body, multipartBoundary(m.type)!) === null);
    const pre = Buffer.concat([Buffer.from("preamble text\r\n"), body]);
    check("preamble tolerated", parseMultipart(pre, boundary)?.file?.data.equals(payload) === true);
    const hugeHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a"\r\nX-Pad: ${"a".repeat(9000)}\r\n\r\nzz\r\n--${boundary}--\r\n`);
    check("oversized part headers → null", parseMultipart(hugeHeader, boundary) === null);
  }
  check("quoted boundary", multipartBoundary('multipart/form-data; charset=utf-8; boundary="a b:c"') === "a b:c");
  check("not multipart → null", multipartBoundary("application/json") === null);
  check("bad boundary chars → null", multipartBoundary("multipart/form-data; boundary=a<b") === null);
  check("boundary > 70 chars → null", multipartBoundary(`multipart/form-data; boundary=${"a".repeat(71)}`) === null);
  check("Content-Length parsed", declaredLength(new Headers({ "content-length": "1234" })) === 1234);
  check("bad Content-Length → null", declaredLength(new Headers({ "content-length": "12, 12" })) === null && declaredLength(new Headers()) === null);
}

/* ------------------------------------------------------------------ */
/* 3. slots + throttle                                                 */
/* ------------------------------------------------------------------ */

function slotAndThrottleTests(): void {
  section("upload slots");
  const a1 = takeUploadSlot("A", "a");
  const a2 = takeUploadSlot("A", "a");
  const a3 = takeUploadSlot("A", "a");
  check(`per member of a store ≤ ${MAX_UPLOADS_PER_USER}`, a1.ok && a2.ok && !a3.ok && a3.scope === "user");
  const sameUserOtherStore = takeUploadSlot("B", "a");
  check("the same user in another store has their own slots", sameUserOtherStore.ok);
  const a4 = takeUploadSlot("A", "b");
  const a5 = takeUploadSlot("A", "c");
  check(`per store ≤ ${MAX_UPLOADS_PER_STORE}`, a4.ok && !a5.ok && a5.scope === "store");
  const over = takeUploadSlot("C", "z");
  check(`per process ≤ ${MAX_UPLOADS}`, MAX_UPLOADS === 4 && !over.ok && over.scope === "server");
  if (a1.ok) {
    a1.release();
    a1.release(); // idempotent
  }
  const again = takeUploadSlot("C", "z");
  check("release frees exactly one slot (another store takes it)", again.ok && !takeUploadSlot("D", "y").ok);
  for (const s of [a2, a4, sameUserOtherStore, again]) if (s.ok) s.release();
  const st = globalThis.__codUploadSlots;
  check("all released", st?.total === 0 && st.perUser.size === 0 && st.perStore.size === 0);

  section("media throttle");
  const t = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < BUCKET_SIZE; i++) if (spendMediaTokens("198.51.100.7", 1, t) === 0) allowed++;
  check(`burst of ${BUCKET_SIZE} allowed`, allowed === BUCKET_SIZE);
  const wait = spendMediaTokens("198.51.100.7", 1, t);
  check("next one waits ≥ 1 s", wait >= 1, String(wait));
  check("refills over time", spendMediaTokens("198.51.100.7", REFILL_PER_SECOND, t + 1000) === 0);
  check("other addresses unaffected", spendMediaTokens("203.0.113.9", 1, t) === 0);
  check("large cost waits proportionally", spendMediaTokens("198.51.100.7", 13, t + 1000) === Math.ceil(13 / REFILL_PER_SECOND));
}

/* ------------------------------------------------------------------ */
/* 4. processing gate                                                  */
/* ------------------------------------------------------------------ */

async function gateTests(): Promise<void> {
  section("processing gate · per-store fairness");
  const busy = async (storeId: string) => {
    try {
      await acquireMediaGate(storeId);
      return "ok";
    } catch (err) {
      return err instanceof MediaError && err.code === "busy" ? "busy" : "error";
    }
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const order: string[] = [];
  check("first job of a store runs at once", (await busy("A")) === "ok");
  // A's second job waits even though the process has a free slot: one running per store
  const a2 = acquireMediaGate("A").then(() => order.push("A2"));
  await tick();
  check("a store's second job waits while its first runs", order.length === 0 && globalThis.__codMediaGate?.active === 1);
  check("a store's third job is refused (1 running + 1 waiting per store)", (await busy("A")) === "busy");
  check("another store starts at once in the free process slot", (await busy("B")) === "ok" && globalThis.__codMediaGate?.active === MAX_CONCURRENT);
  const waiting = ["C", "D", "E"].map((id) => acquireMediaGate(id).then(() => order.push(id)));
  await tick();
  check(`process queue ≤ ${MAX_WAITING}`, globalThis.__codMediaGate?.waiters.length === MAX_WAITING && (await busy("F")) === "busy");
  releaseMediaGate("A");
  await tick();
  // the slot goes to the oldest waiter whose store has nothing running: A2 (queued first, A now idle)
  check("a freed slot starts the oldest eligible waiter", order.join(",") === "A2", order.join(","));
  releaseMediaGate("B");
  await tick();
  check("then the next store in line", order.join(",") === "A2,C", order.join(","));
  releaseMediaGate("A");
  releaseMediaGate("C");
  await Promise.all([a2, ...waiting]);
  check("every waiter ran in order", order.join(",") === "A2,C,D,E", order.join(","));
  releaseMediaGate("D");
  releaseMediaGate("E");
  const g = globalThis.__codMediaGate;
  check("gate empty afterwards", g?.active === 0 && g.waiters.length === 0 && g.stores.size === 0);
}

async function main(): Promise<void> {
  await uploadBodyTests();
  slotAndThrottleTests();
  await gateTests();
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

void main();
