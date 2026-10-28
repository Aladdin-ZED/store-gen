/**
 * Envelope self-test (no database, no Next runtime):  npm run test:envelope  (tsx src/lib/security/selftest-envelope.ts)
 *
 * docs/STORE-SAAS.md §F.3, D30, §J.1. A rename of the HKDF salt, of a purpose string or of the info layout breaks
 * this suite, because the golden vectors below were sealed once by an independent script (raw node:crypto, not
 * crypto.ts) with a fixed test secret:
 *
 *  1. golden v1 vectors (today's settings and TOTP envelopes) open through decrypt / openLegacy;
 *  2. golden v2 vectors (store, platform, non-Latin text) open through open();
 *  3. seal → open round trips; a fresh seal opens with an independent HKDF("cod-studio", "<scope>:<purpose>:k1")
 *     key and the same string as AAD, and not under another salt;
 *  4. AAD binding: a v2 envelope whose AAD names another kid fails, an unknown kid fails, a relabelled kid fails;
 *  5. a store-A ciphertext fails under store B, under the platform and under another purpose (and the reverse);
 *  6. v1 never opens through open(), v2 never through openLegacy(); tampered, truncated and malformed envelopes fail;
 *     bad scopes and purposes throw;
 *  7. hmacBytes / hmac golden values; the derived-key LRU stays at 512 keys; no APP_SECRET → nothing seals;
 *  8. binary envelopes (P0b, CCR P8-3, §H.6): a golden SGB2 vector (fixed key material, IV and plaintext give fixed
 *     bytes) opens through openBytes and is rebuilt byte for byte independently; the layout of a fresh seal; a store-A
 *     part refused under store B, the platform and another purpose; wrong magic, kid, truncation and tampering refused.
 */
import { createCipheriv, createDecipheriv, hkdfSync } from "node:crypto";
import Module from "node:module";

// crypto.ts and auth/config are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("zod"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const env = process.env as Record<string, string | undefined>;
/** the test secret the golden vectors were sealed with (never a real one) */
const TEST_SECRET = "selftest-envelope-k1-generation-0123456789";
env.APP_SECRET = TEST_SECRET;

const STORE_1 = "00000000000000000000000001";
const STORE_B = "01J0STOREB0000000000000000";

const GOLDEN = {
  v1Settings: {
    purpose: "settings:turnstile",
    plain: '{"siteKey":"0x4AAAAAAAselftest","secretKey":"0x4AAAAAAAsecret-selftest"}',
    envelope: "v1.OKHiCuzS2m8hprIv.NMTHi8OdznCVecN6PCsQAQ.7ZMfX_wSM09mPRaCQt1jDQqOIU3NGKSkHbziUQcnqf2aCvlhfEZkIVvP3fzTphmGoizo8efaIvZbFIIzSung5ZyYf3Kgtpqh",
  },
  v1Totp: {
    purpose: "totp:01JABCDEFGHJKMNPQRSTVWXYZ0",
    plain: "JBSWY3DPEHPK3PXP",
    envelope: "v1.SkHxKYSPIDYPiFES.BQxVY6SI8s15dTUFoB_mKA.ggfWjiEDLbCf1t8k-zkaKg",
  },
  v2Store: {
    scope: { store: STORE_1 },
    purpose: "settings:telegram",
    plain: '{"botToken":"123456:selftest-token","chatId":"-1001"}',
    envelope: "v2.k1.3zVs9g99K-nu5leS.zpM00X6ePnBbp_hQFow6Tw.-HY1Duf3CyZ9P9NmbDGTUE1XBQW8T_ye6bETM6UtNaWonMa2DOvxR4EdHv7PwIZoEwvydTI",
  },
  v2Platform: {
    scope: "platform" as const,
    purpose: "settings:platform_ai_secret",
    plain: '{"apiKey":"sk-selftest-platform"}',
    envelope: "v2.k1.TpPYKiiKnnLU6oa6.wmouocSdT7Qvm2Dbx2z2BA.CmoDR1KkfuxCYHSG5yjoe_eJcRt4Ra5fTgxTuCYDUgof",
  },
  v2Arabic: {
    scope: { store: STORE_B },
    purpose: "settings:export_key",
    plain: "رمز سري للمتجر — clé secrète",
    envelope: "v2.k1.vNsZR6X7mqPUdR5-.5iRGDTOflmyamnDsqDHG2A.h0VUbCyrTZ3u8WDPP9Eqokrr9qqFCCBlWQfHj62CjB4mDZjieTd1acTs4Aw",
  },
  /** key derived for "…:k1", labelled k1, but the AAD names k2 */
  v2AadK2: "v2.k1.Y9I7Pq4s4Fm1yS2t.Mnjrqs4DuPKMW2qsYy8_Jw.QsKtXndkOw",
  /** a well-formed k2 envelope (key and AAD for k2): no k2 exists in R1 */
  v2KidK2: "v2.k2.Fo6QbYGrMdT6UOCb.ywYbAXemXhG78OfSg32ALQ.ENVE4gQaqg",
  /** HMAC-SHA256 of bytes 00 01 02 03 fa fb fc fd fe ff, purpose "media-id:<store #1>" */
  hmacBytes: "d0d1790cbe3f59a63292e97b4268c77e6f6935572ee0d74cb0a004e0301ac9d0",
  /** hmac("203.0.113.7", "ip"), the hashIp key */
  hmacIp: "3e04edcf52c9135af663cbd048d31ec31f03f08da2697ffbd66147d21f657797",
  /** SGB2 binary envelope (hex), scope platform, purpose backup:v1, IV "SGB2 golden!": a gzip head, bytes 00-0f, fd fe ff, UTF-8 text */
  bytesPlatform: {
    purpose: "backup:v1",
    iv: "5347423220676f6c64656e21",
    plain: "1f8b0800000102030405060708090a0b0c0d0e0ffdfeff6261636b7570207061727420c2b720d8acd8b2d8a1",
    sealed:
      "53474232026b315347423220676f6c64656e21872d112c894af2a497a7ae802c2c0fc1d11d4297e36185b2356ccfc2a5697baa4984eb1d52b5de0bb42061ca7c5f29bf7506cc67e85bda81f10e055c",
  },
};

let passes = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `got ${a}, expected ${e}`);
}
function throws(name: string, fn: () => unknown, match?: RegExp): void {
  try {
    fn();
    check(name, false, "did not throw");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, !match || match.test(msg), `threw "${msg}"`);
  }
}

/** Independent v2 open with raw node:crypto: pins the salt, the info layout and AAD = info. */
function independentOpen(envelope: string, info: string, salt = "cod-studio"): string {
  const [, , iv, tag, ct] = envelope.split(".");
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(TEST_SECRET, "utf8"), Buffer.from(salt), Buffer.from(info, "utf8"), 32));
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv!, "base64url"), { authTagLength: 16 });
  d.setAAD(Buffer.from(info, "utf8"));
  d.setAuthTag(Buffer.from(tag!, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct!, "base64url")), d.final()]).toString("utf8");
}

/** Independent SGB2 seal with raw node:crypto and a given IV: pins the binary layout, the derivation and AAD = info. */
function independentSealBytes(plain: Buffer, info: string, iv: Buffer): Buffer {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(TEST_SECRET, "utf8"), Buffer.from("cod-studio"), Buffer.from(info, "utf8"), 32));
  const ci = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  ci.setAAD(Buffer.from(info, "utf8"));
  const ct = Buffer.concat([ci.update(plain), ci.final()]);
  return Buffer.concat([Buffer.from("SGB2", "ascii"), Buffer.from([2]), Buffer.from("k1", "ascii"), iv, ci.getAuthTag(), ct]);
}

/** Independent SGB2 open with raw node:crypto (kid "k1", 2 bytes). */
function independentOpenBytes(buf: Buffer, info: string): Buffer {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(TEST_SECRET, "utf8"), Buffer.from("cod-studio"), Buffer.from(info, "utf8"), 32));
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(7, 19), { authTagLength: 16 });
  d.setAAD(Buffer.from(info, "utf8"));
  d.setAuthTag(buf.subarray(19, 35));
  return Buffer.concat([d.update(buf.subarray(35)), d.final()]);
}

/** Flip one character of one dot-separated part (base64url alphabet kept). */
function tamper(envelope: string, part: number): string {
  const parts = envelope.split(".");
  const p = parts[part]!;
  const i = Math.floor(p.length / 2);
  parts[part] = p.slice(0, i) + (p[i] === "A" ? "B" : "A") + p.slice(i + 1);
  return parts.join(".");
}

async function main(): Promise<void> {
  const c = await import("./crypto");

  /* 1. golden v1 ------------------------------------------------------------------------------ */
  for (const name of ["v1Settings", "v1Totp"] as const) {
    const g = GOLDEN[name];
    eq(`${name}: decrypt`, c.decrypt(g.envelope, g.purpose), g.plain);
    eq(`${name}: openLegacy`, c.openLegacy(g.envelope, g.purpose), g.plain);
    throws(`${name}: another v1 purpose fails`, () => c.openLegacy(g.envelope, `${g.purpose}x`));
    eq(`${name}: envelopeVersion`, c.envelopeVersion(g.envelope), 1);
  }
  // encrypt() itself is unchanged: a fresh v1 envelope opens with decrypt
  eq("v1 round trip", c.decrypt(c.encrypt("v1 still works", "settings:sheets"), "settings:sheets"), "v1 still works");

  /* 2. golden v2 ------------------------------------------------------------------------------ */
  for (const name of ["v2Store", "v2Platform", "v2Arabic"] as const) {
    const g = GOLDEN[name];
    eq(`${name}: open`, c.open(g.envelope, g.scope, g.purpose), g.plain);
    eq(`${name}: envelopeVersion`, c.envelopeVersion(g.envelope), 2);
  }

  /* 3. round trips and the independent derivation ---------------------------------------------- */
  const scopeA = { store: STORE_1 };
  const scopeB = { store: STORE_B };
  for (const plain of ["", "x", '{"secretKey":"0x4AAA"}', "ⵜⴰⵎⴰⵣⵉⵖⵜ · العربية · français", "a".repeat(20_000)]) {
    const env1 = c.seal(plain, scopeA, "settings:turnstile");
    eq(`round trip (${plain.length} chars)`, c.open(env1, scopeA, "settings:turnstile"), plain);
  }
  const fresh = c.seal("independent", scopeA, "settings:turnstile");
  check("seal format v2.k1.<iv16>.<tag22>.<ct>", /^v2\.k1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(fresh), fresh.slice(0, 12));
  check("two seals differ (random IV)", fresh !== c.seal("independent", scopeA, "settings:turnstile"));
  eq("independent HKDF(cod-studio) + AAD = info opens a fresh seal", independentOpen(fresh, `store:${STORE_1}:settings:turnstile:k1`), "independent");
  throws("another salt does not open it (salt frozen)", () => independentOpen(fresh, `store:${STORE_1}:settings:turnstile:k1`, "store-gen"));
  throws("the info without the kid does not open it", () => independentOpen(fresh, `store:${STORE_1}:settings:turnstile`));
  const plat = c.seal("p", "platform", "settings:platform_turnstile");
  eq("platform info string is platform:<purpose>:k1", independentOpen(plat, "platform:settings:platform_turnstile:k1"), "p");

  /* 4. kid binding ------------------------------------------------------------------------------ */
  throws("AAD naming k2 under a k1 label fails", () => c.open(GOLDEN.v2AadK2, scopeA, "settings:telegram"));
  throws("an unknown kid (k2) fails", () => c.open(GOLDEN.v2KidK2, scopeA, "settings:telegram"), /unknown key id/);
  throws("a k1 envelope relabelled k2 fails", () => c.open(GOLDEN.v2Store.envelope.replace("v2.k1.", "v2.k2."), scopeA, "settings:telegram"));
  throws("a kid that is not an own key fails", () => c.open(GOLDEN.v2Store.envelope.replace("v2.k1.", "v2.toString."), scopeA, "settings:telegram"));

  /* 5. store binding ---------------------------------------------------------------------------- */
  const sealedA = c.seal('{"botToken":"A"}', scopeA, "settings:telegram");
  throws("store A ciphertext under store B fails", () => c.open(sealedA, scopeB, "settings:telegram"), /does not open/);
  throws("store A ciphertext under the platform fails", () => c.open(sealedA, "platform", "settings:telegram"));
  throws("store A ciphertext under another purpose fails", () => c.open(sealedA, scopeA, "settings:turnstile"));
  throws("golden store #1 envelope under store B fails", () => c.open(GOLDEN.v2Store.envelope, scopeB, GOLDEN.v2Store.purpose));
  throws("platform ciphertext under store #1 fails", () => c.open(GOLDEN.v2Platform.envelope, scopeA, GOLDEN.v2Platform.purpose));
  throws("store B ciphertext under store A fails", () => c.open(GOLDEN.v2Arabic.envelope, scopeA, GOLDEN.v2Arabic.purpose));

  /* 6. versions, tampering, malformed input ---------------------------------------------------- */
  throws("a v1 envelope never opens through open()", () => c.open(GOLDEN.v1Settings.envelope, scopeA, "settings:turnstile"), /bad envelope/);
  throws("a v2 envelope never opens through openLegacy()", () => c.openLegacy(GOLDEN.v2Store.envelope, "settings:telegram"));
  throws("tampered iv fails", () => c.open(tamper(sealedA, 2), scopeA, "settings:telegram"));
  throws("tampered tag fails", () => c.open(tamper(sealedA, 3), scopeA, "settings:telegram"));
  throws("tampered ciphertext fails", () => c.open(tamper(sealedA, 4), scopeA, "settings:telegram"));
  throws("truncated tag fails", () => {
    const p = sealedA.split(".");
    p[3] = p[3]!.slice(0, 10);
    c.open(p.join("."), scopeA, "settings:telegram");
  });
  for (const bad of ["", "v2", "v2.k1", "v2.k1.a.b", "v2.k1.a.b.c.d", "v3.k1.a.b.c", "plain text"]) {
    throws(`malformed "${bad}" fails`, () => c.open(bad, scopeA, "settings:telegram"), /bad envelope/);
  }
  eq("envelopeVersion of junk", [c.envelopeVersion("x"), c.envelopeVersion(null), c.envelopeVersion("v2.k1.a")], [null, null, null]);
  for (const [label, scope] of [
    ["empty store id", { store: "" }],
    ["store id with ':'", { store: "a:b" }],
    ["store id with a space", { store: "a b" }],
    ["not a scope", {} as { store: string }],
  ] as const) {
    throws(`seal refuses ${label}`, () => c.seal("x", scope, "settings:telegram"), /bad envelope scope/);
    throws(`open refuses ${label}`, () => c.open(sealedA, scope, "settings:telegram"), /bad envelope scope/);
  }
  throws("seal refuses an empty purpose", () => c.seal("x", scopeA, ""), /bad envelope purpose/);

  /* 7. hmac, key cache, missing secret --------------------------------------------------------- */
  const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
  eq("hmacBytes golden (media-id:<store>)", c.hmacBytes(bytes, `media-id:${STORE_1}`), GOLDEN.hmacBytes);
  check("hmacBytes differs per store", c.hmacBytes(bytes, `media-id:${STORE_B}`) !== GOLDEN.hmacBytes);
  eq("hmac golden (ip)", c.hmac("203.0.113.7", "ip"), GOLDEN.hmacIp);

  for (let i = 0; i < 700; i++) c.seal("x", { store: `S${i}` }, "settings:telegram");
  check("derived-key LRU bounded at 512", c.keyCacheSize() <= 512, String(c.keyCacheSize()));
  eq("an evicted key re-derives (golden still opens)", c.open(GOLDEN.v2Store.envelope, scopeA, GOLDEN.v2Store.purpose), GOLDEN.v2Store.plain);

  env.APP_SECRET = "";
  throws("no APP_SECRET: a new key cannot be derived", () => c.seal("x", { store: "NEVERSEEN" }, "settings:telegram"), /APP_SECRET/);
  env.APP_SECRET = "change-me-change-me-change-me-change-me";
  throws("a template APP_SECRET: nothing seals", () => c.seal("x", { store: "NEVERSEEN2" }, "settings:telegram"), /template/);
  env.APP_SECRET = TEST_SECRET;

  /* 8. binary envelopes (SGB2) ------------------------------------------------------------------ */
  const gb = GOLDEN.bytesPlatform;
  const goldenBuf = Buffer.from(gb.sealed, "hex");
  const goldenPlain = Buffer.from(gb.plain, "hex");
  eq("SGB2 golden: openBytes", c.openBytes(goldenBuf, "platform", gb.purpose).toString("hex"), gb.plain);
  eq("SGB2 golden: fixed key material, IV and plaintext give the fixed bytes", independentSealBytes(goldenPlain, "platform:backup:v1:k1", Buffer.from(gb.iv, "hex")).toString("hex"), gb.sealed);
  throws("SGB2 golden: refused under store #1", () => c.openBytes(goldenBuf, scopeA, gb.purpose), /does not open/);
  throws("SGB2 golden: refused under another purpose", () => c.openBytes(goldenBuf, "platform", "backup:v2"), /does not open/);

  const part = Buffer.concat([goldenPlain, Buffer.from("x".repeat(1000), "ascii")]);
  const sealedPart = c.sealBytes(part, scopeA, "backup:v1");
  eq("SGB2 layout: magic, kid length, kid", [sealedPart.subarray(0, 4).toString("latin1"), sealedPart[4], sealedPart.subarray(5, 7).toString("latin1")], ["SGB2", 2, "k1"]);
  eq("SGB2 layout: 7 + iv 12 + tag 16 + ciphertext of the plaintext's length", sealedPart.length, 7 + 12 + 16 + part.length);
  eq("SGB2: an independent open of a fresh seal", independentOpenBytes(sealedPart, `store:${STORE_1}:backup:v1:k1`).equals(part), true);
  check("SGB2: two seals differ (random IV)", !sealedPart.equals(c.sealBytes(part, scopeA, "backup:v1")));
  for (const size of [0, 1, 1 << 20]) {
    const data = Buffer.alloc(size, size % 251);
    eq(`SGB2 round trip (${size} bytes)`, c.openBytes(c.sealBytes(data, scopeA, "backup:v1"), scopeA, "backup:v1").equals(data), true);
  }

  // cross-store refusal: a part of store A never opens as store B's, the platform's or under another purpose
  throws("SGB2: store A part under store B fails", () => c.openBytes(sealedPart, scopeB, "backup:v1"), /does not open/);
  throws("SGB2: store A part under the platform fails", () => c.openBytes(sealedPart, "platform", "backup:v1"), /does not open/);
  throws("SGB2: store A part under another purpose fails", () => c.openBytes(sealedPart, scopeA, "backup:v2"), /does not open/);
  throws("SGB2: store B part under store A fails", () => c.openBytes(c.sealBytes(part, scopeB, "backup:v1"), scopeA, "backup:v1"), /does not open/);

  // malformed buffers
  const withByte = (buf: Buffer, at: number, value: number) => {
    const copy = Buffer.from(buf);
    copy[at] = value;
    return copy;
  };
  throws("SGB2: another magic fails", () => c.openBytes(withByte(sealedPart, 3, 0x33), scopeA, "backup:v1"), /bad binary envelope/);
  throws("SGB2: a string envelope is not a binary one", () => c.openBytes(Buffer.from(c.seal("x", scopeA, "backup:v1"), "utf8"), scopeA, "backup:v1"), /bad binary envelope/);
  throws("SGB2: an unknown kid (k2) fails", () => c.openBytes(withByte(sealedPart, 6, 0x32), scopeA, "backup:v1"), /unknown key id/);
  throws("SGB2: a kid with the high bit set never reads as k1", () => c.openBytes(withByte(withByte(sealedPart, 5, 0xeb), 6, 0xb1), scopeA, "backup:v1"), /unknown key id/);
  throws("SGB2: a zero kid length fails", () => c.openBytes(withByte(sealedPart, 4, 0), scopeA, "backup:v1"), /bad binary envelope/);
  throws("SGB2: a kid length past the end fails", () => c.openBytes(withByte(sealedPart, 4, 255), scopeA, "backup:v1"));
  throws("SGB2: a truncated buffer fails", () => c.openBytes(sealedPart.subarray(0, 30), scopeA, "backup:v1"), /bad binary envelope/);
  throws("SGB2: a tampered IV fails", () => c.openBytes(withByte(sealedPart, 8, sealedPart[8]! ^ 1), scopeA, "backup:v1"), /does not open/);
  throws("SGB2: a tampered tag fails", () => c.openBytes(withByte(sealedPart, 20, sealedPart[20]! ^ 1), scopeA, "backup:v1"), /does not open/);
  throws("SGB2: a tampered ciphertext fails", () => c.openBytes(withByte(sealedPart, sealedPart.length - 1, sealedPart[sealedPart.length - 1]! ^ 1), scopeA, "backup:v1"), /does not open/);
  throws("SGB2: a dropped ciphertext byte fails", () => c.openBytes(sealedPart.subarray(0, sealedPart.length - 1), scopeA, "backup:v1"), /does not open/);
  throws("SGB2: not a Buffer fails", () => c.openBytes("SGB2" as unknown as Buffer, scopeA, "backup:v1"), /bad binary envelope/);
  throws("sealBytes refuses a bad scope", () => c.sealBytes(part, { store: "a:b" }, "backup:v1"), /bad envelope scope/);
  throws("sealBytes refuses an empty purpose", () => c.sealBytes(part, scopeA, ""), /bad envelope purpose/);
  throws("sealBytes refuses a string", () => c.sealBytes("x" as unknown as Buffer, scopeA, "backup:v1"), /takes a Buffer/);
}

main().then(
  () => {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.log(`\nenvelope selftest: ${passes} passed, ${failures.length} failed`);
    if (failures.length) process.exit(1);
  },
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
