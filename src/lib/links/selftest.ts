// proves: LP-12
/**
 * test:links (P3 LANDING; landing.md LAN-§12.3, rev 3 SEC-6; LD14, LD40):
 *
 *   npm run test:links        (tsx src/lib/links/selftest.ts [--db cod_test_p3_links] [--verbose])
 *
 * Pure: the query rule (presets first in the fixed order, percent-encoded; any `utm_` key, ASCII case-insensitive,
 * keeps the incoming query untouched; click ids byte for byte), `assertStoreRelativePath` (every rejection form) and
 * the codes. A compile-time case: no plain string reaches `goLocation` without the assertion (`@ts-expect-error`).
 * DB-backed, on the two-store fixtures of scripts/qa/tenancy-check.ts (a throwaway cod_test_* database, dropped at the
 * end): `createShortLink` (A's page, B's page → not_found, a draft → invalid, codes reserved / taken, the refund on a
 * failed insert), the route (308 with `private, no-store` and no Set-Cookie, the query byte for byte, paused → 410,
 * unknown → 404, A's code on B's host → 404, a pending store → the neutral 404, a page archived after creation → 404,
 * hand-written rows whose `target_ref` is a host → 404, S mode → `https://<handle>.<root>/`), edit target drops the
 * 60 s cache, 10,000 hits within 1 % after the flush, the 201st link answers quota, delete refunds.
 * Exits 1 on any failure.
 */
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { Kit } from "../../../scripts/qa/tenancy-check";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql"; // framework-free: no server-only, no connection
import type { StoreHandleLookup } from "@/lib/tenancy/public";
import type { StoreRow, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";

process.env.TENANCY_DB ??= "cod_test_p3_links";
const req = createRequire(__filename);
const T = req("../../../scripts/qa/tenancy-check") as typeof import("../../../scripts/qa/tenancy-check");
const { check, suite, load } = T;

type Q = typeof import("./query");
type Tg = typeof import("./target");
type Cd = typeof import("./codes");
type Sv = typeof import("./service.server");
type Go = typeof import("./serve.server");
type Ck = typeof import("./clicks");

/** compile-time (tsc): a plain string never reaches `goLocation`; only `assertStoreRelativePath` makes the type */
export function typeCases(go: Go["goLocation"], assert: Tg["assertStoreRelativePath"], store: Parameters<Go["goLocation"]>[0]): string[] {
  // @ts-expect-error a plain path string is not a StoreRelativePath
  const bad = go(store, "/x", "");
  // @ts-expect-error a template literal path is not either
  const bad2 = go(store, `/${"x"}`, "");
  return [bad, bad2, go(store, assert("/x"), "")];
}

function ownerCtx(kit: Kit, key: "A" | "B", store?: StoreRow): WriteCtx {
  const userId = kit.fx[key].members.owner;
  return {
    user: { id: userId, email: `owner-${key.toLowerCase()}@tenancy.test`, name: `Owner ${key}`, totpEnabled: false, sessionId: "links-check", platformRole: "none", locale: null, lastStoreId: kit.fx[key].id },
    store: store ?? kit.fx.rows[key],
    membership: { role: "owner", status: "active" },
    scope: T.writeScope(kit.fx[key].id),
    actor: { kind: "user", userId, impersonatorId: null, ip: null },
    impersonation: null,
    stepUpUntil: null,
    can: () => true,
  } as WriteCtx;
}

function pureCases(): void {
  const Qm = load<Q>("@/lib/links/query");
  const Tm = load<Tg>("@/lib/links/target");
  const Cm = load<Cd>("@/lib/links/codes");

  suite("the query rule (LAN-§12.1, V7)");
  const presets = { source: "facebook", medium: "paid_social", campaign: "ramadan argan&co" };
  const q = Qm.linkQuery(presets, "fbclid=AbC%2F1&x=1");
  check("presets first in the fixed order, percent-encoded, then & + the incoming part byte for byte", q === "utm_source=facebook&utm_medium=paid_social&utm_campaign=ramadan%20argan%26co&fbclid=AbC%2F1&x=1", q);
  check("an incoming utm_ key keeps the incoming query untouched", Qm.linkQuery(presets, "utm_source=mine") === "utm_source=mine");
  check("…ASCII case-insensitive", Qm.linkQuery(presets, "UTM_Source=Mine&fbclid=z") === "UTM_Source=Mine&fbclid=z");
  check("a key that only contains utm_ is not one", Qm.linkQuery({ source: "s" }, "x_utm_source=1") === "utm_source=s&x_utm_source=1");
  check("no presets: the incoming query as is", Qm.linkQuery({}, "gclid=a%2Bb&ScCid=Q") === "gclid=a%2Bb&ScCid=Q" && Qm.linkQuery(null, "") === "");
  check("no incoming query: the presets alone", Qm.linkQuery({ source: "tiktok", content: "angle-b" }, "") === "utm_source=tiktok&utm_content=angle-b");
  check("odd bytes of the incoming part survive (no decode, no re-encode, no reorder)", Qm.linkQuery({ source: "a" }, "b=%E2%9C%93&a=&&c") === "utm_source=a&b=%E2%9C%93&a=&&c");
  check("rawQueryOf: the raw query without ? and fragment", Qm.rawQueryOf("https://x.test/go/abc?fbclid=AbC%2F1&x=1#frag") === "fbclid=AbC%2F1&x=1" && Qm.rawQueryOf("https://x.test/go/abc") === "");

  suite("assertStoreRelativePath (SEC-6)");
  const rejects = ["//evil.example/x", "/\\evil.example", "\\\\evil", "javascript:alert(1)", "https://evil.example", "/x\u0000y", "/x y", " /x", "/%2F%2Fevil", "/%5Cevil", "evil", "", "/x:y/../z", "/X", "/a//b", "/ "];
  for (const p of rejects) {
    let threw = false;
    try {
      Tm.assertStoreRelativePath(p);
    } catch {
      threw = true;
    }
    check(`rejects ${JSON.stringify(p)}`, threw);
  }
  for (const p of ["/", "/argan", "/policies/terms", "/huile-argan-2"]) check(`accepts ${p}`, Tm.assertStoreRelativePath(p) === p);

  suite("codes");
  const codes = Array.from({ length: 200 }, () => Cm.generateCode());
  check("generated: 6 Crockford characters in lower case (no i, l, o, u)", codes.every((c) => /^[0-9a-hjkmnp-tv-z]{6}$/.test(c)), codes.slice(0, 3));
  check("generated codes are spread (200 draws, ≥ 195 distinct)", new Set(codes).size >= 195);
  check("owner codes: 3-16 of [a-z0-9-], letter or digit at both ends", Cm.codeProblem("ad1") === null && Cm.codeProblem("ramadan-2026-ok") === null && Cm.codeProblem("ab") === "format" && Cm.codeProblem("-ab") === "format" && Cm.codeProblem("ab-") === "format" && Cm.codeProblem("a".repeat(17)) === "format" && Cm.codeProblem("AbC") === "format");
  check("reserved words are refused", ["admin", "api", "track", "checkout", "login"].every((c) => Cm.codeProblem(c) === "reserved"));
}

async function main(): Promise<number> {
  // the harness first: no app module may open the worktree's own database
  const kit: Kit = await T.setup();
  pureCases();
  const { fx } = kit;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq, sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const Sv = load<Sv>("@/lib/links/service.server");
  const Go = load<Go>("@/lib/links/serve.server");
  const Ck = load<Ck>("@/lib/links/clicks");
  const U = load<typeof import("@/lib/tenancy/usage")>("@/lib/tenancy/usage");
  const E = load<typeof import("@/lib/tenancy/entitlements")>("@/lib/tenancy/entitlements");
  const { SeamError } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  const { FieldsError } = load<typeof import("@/lib/auth/errors")>("@/lib/auth/errors");
  const { systemScope, systemCtx } = load<typeof import("@/lib/jobs/scope")>("@/lib/jobs/scope");
  const host = new URL(T.PLATFORM).host;
  const ctxA = ownerCtx(kit, "A");
  const ctxB = ownerCtx(kit, "B");
  const A = ctxA.scope;
  const B = ctxB.scope;
  type Action = (typeof S.auditLog.$inferSelect)["action"];
  // every read and write of the cases goes through the store's scope (the tenancy lint's rules hold here too)
  const q = {
    audit: (scope: StoreScope, action: Action, target?: string) =>
      db.select({ id: S.auditLog.id }).from(S.auditLog).where(whereStore(S.auditLog, scope, eq(S.auditLog.action, action), target ? eq(S.auditLog.target, target) : undefined)),
    link: async (scope: StoreScope, id: string) =>
      (await db.select({ clicks: S.shortLinks.clicks, last: S.shortLinks.lastClickAt }).from(S.shortLinks).where(byId(S.shortLinks, scope, id)).limit(1))[0],
    setPage: (scope: WriteScope, id: string, pageId: string) => db.update(S.shortLinks).set({ pageId }).where(byId(S.shortLinks, scope, id)),
    insertRaw: (scope: WriteScope, v: { id: string; code: string; targetKind: "policy" | "product"; targetRef: string }) =>
      db.insert(S.shortLinks).values(storeValues(scope, { ...v, status: "active" as const })),
    count: async (scope: StoreScope) => Number((await db.select({ n: sql<number>`COUNT(*)` }).from(S.shortLinks).where(whereStore(S.shortLinks, scope)))[0]?.n ?? 0),
  };
  const GAUGE = { metric: "short_links", period: "total" } as const;

  const outcome = async <X>(fn: () => Promise<X>): Promise<{ ok: true; value: X } | { ok: false; err: unknown }> => {
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      return { ok: false, err };
    }
  };
  const field = (err: unknown) => (err instanceof FieldsError ? Object.keys(err.fields)[0] : null);
  const go = async (handle: string, code: string, query = "", o: { found?: StoreHandleLookup | null } = {}) => {
    const res = await Go.serveGo(new Request(`${T.PLATFORM}/s/${handle}/go/${code}${query}`, { headers: { host, "user-agent": "links-check" } }), handle, code, { ...(o.found !== undefined ? { found: o.found } : {}), defer: () => undefined });
    return { status: res.status, location: res.headers.get("location"), cache: res.headers.get("cache-control"), cookies: res.headers.getSetCookie(), body: await res.text(), headers: res.headers };
  };
  const base = `${T.PLATFORM}/s/${fx.A.handle}`;

  /* ------------------------------------------------------------ createShortLink */
  suite("createShortLink (LAN-§2.1, SEC-6)");
  const usedBefore = await U.usageValue(A, GAUGE);
  const page = await Sv.createShortLink(ctxA, { target: { kind: "page", pageId: fx.A.page.live }, channel: "meta", utm: { source: "facebook", medium: "paid_social", campaign: "argan" } });
  check("A's published page: a generated 6-character code", /^[0-9a-hjkmnp-tv-z]{6}$/.test(page.code), page);
  check("the gauge was charged once", (await U.usageValue(A, GAUGE)) === usedBefore + 1);
  const audit = await q.audit(A, "link.created", page.id);
  check("audited link.created in A", audit.length === 1);
  const foreign = await outcome(() => Sv.createShortLink(ctxA, { target: { kind: "page", pageId: fx.B.page.live } }));
  check("B's page id through A → not_found (like a missing page)", !foreign.ok && foreign.err instanceof SeamError && foreign.err.code === "not_found");
  const draft = await outcome(() => Sv.createShortLink(ctxA, { target: { kind: "page", pageId: fx.A.page.draft } }));
  check("an unpublished page → invalid (the target field)", !draft.ok && field(draft.err) === "target", !draft.ok && String(draft.err));
  const reserved = await outcome(() => Sv.createShortLink(ctxA, { target: { kind: "home" }, code: "admin" }));
  check("a reserved code → the code field", !reserved.ok && field(reserved.err) === "code");
  const usedMid = await U.usageValue(A, GAUGE);
  const custom = `ad-${randomBytes(2).toString("hex")}`;
  const home = await Sv.createShortLink(ctxA, { target: { kind: "home" }, code: custom.toUpperCase() });
  check("a chosen code is kept in lower case", home.code === custom);
  const taken = await outcome(() => Sv.createShortLink(ctxA, { target: { kind: "policy", policy: "terms" }, code: custom }));
  check("a taken code → the code field, and the unit is refunded", !taken.ok && field(taken.err) === "code" && (await U.usageValue(A, GAUGE)) === usedMid + 1);
  const sameInB = await Sv.createShortLink(ctxB, { target: { kind: "home" }, code: custom });
  check("codes are unique per store: B may use A's code", sameInB.code === custom);

  /* ------------------------------------------------------------ the route */
  suite("GET <base>/go/<code> (LAN-§12.1, §12.3)");
  const r = await go(fx.A.handle, page.code, "?fbclid=AbC%2F1&x=1");
  check(
    "308 to the page with the presets, then the incoming part byte for byte",
    r.status === 308 && r.location === `${base}/${fx.A.slug}?utm_source=facebook&utm_medium=paid_social&utm_campaign=argan&fbclid=AbC%2F1&x=1`,
    r.location,
  );
  check("Cache-Control: private, no-store; no Set-Cookie", r.cache === "private, no-store" && r.cookies.length === 0, { cache: r.cache, cookies: r.cookies });
  const mine = await go(fx.A.handle, page.code, "?utm_source=mine");
  check("?utm_source=mine is kept alone", mine.location === `${base}/${fx.A.slug}?utm_source=mine`, mine.location);
  const homeHit = await go(fx.A.handle, custom.toUpperCase());
  check("a home link → the store base (codes read in lower case)", homeHit.status === 308 && homeHit.location === base, homeHit.location);
  check("an unknown code → 404", (await go(fx.A.handle, "zzzzzz")).status === 404);
  check("a malformed code → 404 before any read", (await go(fx.A.handle, "a%2Fb")).status === 404);
  const cross = await go(fx.B.handle, page.code);
  check("A's code on B's host → 404 (never A's target)", cross.status === 404 && !cross.body.includes(fx.A.slug) && cross.location === null);
  const sameB = await go(fx.B.handle, custom);
  check("B's own link with the same code goes to B", sameB.status === 308 && sameB.location === `${T.PLATFORM}/s/${fx.B.handle}`, sameB.location);
  const pending = await go(fx.A.handle, page.code, "", { found: { kind: "current", store: { ...fx.rows.A, status: "pending" } } });
  check("a pending store → the neutral 404", pending.status === 404 && pending.location === null);

  await Sv.pauseShortLink(ctxA, page.id);
  const paused = await go(fx.A.handle, page.code);
  check(
    "paused → 410, the store's inactive page with a home link, never stored, no cookie",
    paused.status === 410 && /no-store/.test(paused.cache ?? "") && paused.cookies.length === 0 && paused.body.includes(`href="${base}"`) && /noindex/.test(paused.headers.get("x-robots-tag") ?? ""),
    { status: paused.status, cache: paused.cache },
  );
  check("audited link.paused", (await q.audit(A, "link.paused")).length >= 1);
  await Sv.resumeShortLink(ctxA, page.id);
  check("resumed → 308 again (the cache dropped on write)", (await go(fx.A.handle, page.code)).status === 308);

  // edit target: the 60 s lookup cache is dropped on the write
  await Sv.editTarget(ctxA, home.id, { kind: "policy", policy: "privacy" });
  const moved = await go(fx.A.handle, custom);
  check("edit target takes effect at once", moved.location === `${base}/policies/privacy`, moved.location);
  const editForeign = await outcome(() => Sv.editTarget(ctxB, home.id, { kind: "home" }));
  check("B cannot edit A's link (not_found)", !editForeign.ok && editForeign.err instanceof SeamError);

  // a page archived after the link was made: 404, never a redirect
  const arch = await Sv.createShortLink(ctxA, { target: { kind: "page", pageId: fx.A.page.live } });
  await q.setPage(A, arch.id, fx.A.page.archived);
  Sv.dropLinksCache(A);
  check("a page archived after creation → 404", (await go(fx.A.handle, arch.code)).status === 404);

  // hand-written rows: no column can carry a host
  for (const ref of ["//evil.example", "/\\evil", "https://evil.example"]) {
    const id = newId();
    const code = `h${randomBytes(3).toString("hex")}`;
    await q.insertRaw(A, { id, code, targetKind: "policy", targetRef: ref });
    const hit = await go(fx.A.handle, code);
    check(`a hand-written row with target_ref ${JSON.stringify(ref)} → 404`, hit.status === 404 && hit.location === null);
  }
  {
    const id = newId();
    const code = `r${randomBytes(3).toString("hex")}`;
    await q.insertRaw(A, { id, code, targetKind: "product", targetRef: fx.A.page.live });
    check("an R2 kind → 404 in R1", (await go(fx.A.handle, code)).status === 404);
  }

  // S mode: every Location is on https://<handle>.<root>/
  {
    const saved = { root: process.env.STORE_ROOT_DOMAIN, key: process.env.EDGE_KEY };
    process.env.STORE_ROOT_DOMAIN = "shops.example";
    process.env.EDGE_KEY = randomBytes(24).toString("hex");
    try {
      const s1 = await go(fx.A.handle, page.code, "?fbclid=1");
      const s2 = await go(fx.A.handle, custom);
      const prefix = `https://${fx.A.handle}.shops.example/`;
      check("S mode: the Location starts with https://<handle>.<root>/", !!s1.location?.startsWith(prefix) && !!s2.location?.startsWith(prefix) && s1.location!.endsWith(`/${fx.A.slug}?utm_source=facebook&utm_medium=paid_social&utm_campaign=argan&fbclid=1`), [s1.location, s2.location]);
    } finally {
      if (saved.root === undefined) delete process.env.STORE_ROOT_DOMAIN;
      else process.env.STORE_ROOT_DOMAIN = saved.root;
      if (saved.key === undefined) delete process.env.EDGE_KEY;
      else process.env.EDGE_KEY = saved.key;
    }
  }

  /* ------------------------------------------------------------ clicks */
  suite("clicks (links.flush)");
  {
    await Ck.flushClicks((id) => systemScope(systemCtx("links.flush"), id));
    const before = await q.link(A, page.id);
    const HITS = 10_000;
    let redirected = 0;
    for (let i = 0; i < HITS; i += 100) {
      const batch = await Promise.all(Array.from({ length: Math.min(100, HITS - i) }, () => go(fx.A.handle, page.code)));
      redirected += batch.filter((b) => b.status === 308).length;
    }
    const pending = Ck.pendingClicks(fx.A.id).get(page.id)?.n ?? 0;
    const flushed = await Ck.flushClicks((id) => systemScope(systemCtx("links.flush"), id));
    const after = await q.link(A, page.id);
    const counted = (after?.clicks ?? 0) - (before?.clicks ?? 0);
    check("10,000 hits: clicks within 1 % after the flush", redirected === HITS && Math.abs(counted - HITS) <= HITS / 100, { redirected, pending, counted, flushed });
    check("last_click_at is written", !!after?.last && Date.now() - after.last.getTime() < 120_000);
    check("nothing pending after the flush", Ck.pendingClicks(fx.A.id).size === 0);
    const bRow = await q.link(B, sameInB.id);
    check("B's link with the same code counted only B's hit", (bRow?.clicks ?? 0) === 1, bRow);
  }

  /* ------------------------------------------------------------ the gauge */
  suite("short_links_max (LD40, §D.7)");
  {
    const limit = await E.entitlement(A, "short_links_max");
    check("the beta default is 200", limit === 200, limit);
    const used = await U.usageValue(A, GAUGE);
    await U.chargeUsage(A, GAUGE, 199 - used);
    const last = await outcome(() => Sv.createShortLink(ctxA, { target: { kind: "home" } }));
    check("the 200th link is created", last.ok);
    const rowsBefore = await q.count(A);
    const over = await outcome(() => Sv.createShortLink(ctxA, { target: { kind: "home" } }));
    const rowsAfter = await q.count(A);
    check("the 201st link answers quota and writes nothing", !over.ok && over.err instanceof U.QuotaError && Number(rowsAfter) === Number(rowsBefore), !over.ok && String(over.err));
    if (last.ok) await Sv.deleteShortLink(ctxA, last.value.id);
    check("delete refunds the gauge", (await U.usageValue(A, GAUGE)) === 199);
    const delForeign = await outcome(() => Sv.deleteShortLink(ctxB, page.id));
    check("B cannot delete A's link (not_found), and the row stays", !delForeign.ok && !!(await q.link(A, page.id)));
  }
  return 0;
}

void (async () => {
  const started = Date.now();
  let failed = 1;
  try {
    failed = await main();
  } catch (e) {
    check("the suite ran to the end", false, e instanceof Error ? e.stack : e);
  } finally {
    const left = await T.dropDatabase().catch((e: unknown) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    const fails = T.report("test:links (LP-12)", [`database ${T.DB_NAME} dropped; cod_test_* left: ${left.length ? left.join(", ") : "none"}`, `${Math.round((Date.now() - started) / 1000)} s`]);
    process.exit(fails || failed ? 1 : 0);
  }
})();
