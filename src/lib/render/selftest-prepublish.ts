/**
 * `npm run test:prepublish` (maintainer; docs/STORE-SAAS.md §M.1, §M.2, §J.1, §K.2 P0 stub rule; P0 maintainer
 * decision 5): the core's budget gate and the STUB-BUILD LOCK, offline (no database, no server).
 *
 *  - budget-limits: the landing profile within the D52 ceilings, the two bands; `heightModelIsStub()` agrees with the
 *    height report (`stub: true` exactly while HEIGHT_MODEL_VERSION is 0);
 *  - the gate is registered as "budget"; while design's stubs are in place it refuses no fixture (every item a note
 *    flagged `stub`, the baseline faults included), C2 / C3 / F1 derive nothing from the stub's 600 px sections, and
 *    the rows that need no height (F5, R1, R5, K2, I1) classify synthetic documents hard past their limits;
 *  - `registerBudgetProfile` clamps to the D52 ceilings and refuses a second registration and "landing";
 *  - the lock: `assertStubBuildAllowed` throws under NODE_ENV=production without SG_STUB_BUILD_OK=1 and not with it;
 *    importing budget.ts in a production process throws; scripts/qa/stub-lock.ts exits 1 without the variable and 0
 *    with it; the deploy archive's gate-file rule refuses `stubBuild: true`;
 *  - the one origin builder (§M.1 rule 2, P0b CCR P3-11; src/lib/render/origin.ts, re-exported here): an edited field
 *    → owner, an unedited recorded field → its class, no record → library, a path absent from a present record →
 *    owner; `hash16` deterministic (the FNV-1a 64 test vectors), NFC- and trim-insensitive.
 * After P6 merges the real model, the stub-only checks flip to the C2 / C3 / F1 hard fixtures of
 * src/lib/design/calibration/heights.json (enabled at the P6 merge, §K.2).
 *
 * `npm test` runs the in-process checks over the fr fixtures; `--slow` (the second script of `npm run test:slow`, so
 * every `npm run gate`) adds the ar fixtures and the four child processes of the lock proof (P0 review G7: the
 * npm test budget re-cut; `prebuild` runs scripts/qa/stub-lock.ts itself on every build).
 *
 *   npx tsx src/lib/render/selftest-prepublish.ts [--slow]
 */
import Module from "node:module";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

// run outside Next: `server-only` resolves to its empty build (the renderer needs the plain React builds)
const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = M._resolveFilename;
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return require.resolve("next/dist/compiled/server-only/empty.js");
  return resolveFilename.call(this, request, ...rest);
};

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SLOW = process.argv.includes("--slow");
let failures = 0;
let passed = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log("  ✓", name);
  } catch (err) {
    failures++;
    console.log("  ✗", name, "\n     ", err instanceof Error ? err.message : err);
  }
}

/** Runs `node <args>` in the repository with `env` on top of a copy of this process's environment. */
function run(args: string[], env: Record<string, string | undefined>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (code) => resolve({ code, out }));
  });
}
const TSX = ["--import", "tsx"];

async function main() {
  const limits = await import("./prepublish/budget-limits");
  const budget = await import("./prepublish/budget");
  const { HEIGHT_MODEL_VERSION, estimateHeights } = await import("@/lib/design/heights");
  const { variantFeatures } = await import("@/lib/design/features");
  const { getFixture, fixtureAssets, FIXTURE_NAMES } = await import("@/lib/page/fixtures");
  const { validateDoc } = await import("@/lib/page/validate");
  const { renderLandingHtml } = await import("./core");
  const { storePageLinks } = await import("@/landing/context");
  const { gateFileProblem } = await import("../../../scripts/deploy/gate-file.mjs");
  const now = "2026-10-27T12:00:00.000Z";
  const stub = limits.heightModelIsStub();
  console.log(`test:prepublish${SLOW ? " --slow" : ""} · height model ${stub ? "is the P0 stub (HEIGHT_MODEL_VERSION 0)" : `v${HEIGHT_MODEL_VERSION}`}`);

  const argan = validateDoc(getFixture("argan", { now, locale: "fr" }).doc).doc;
  assert.ok(argan, "the argan fixture validates");
  const doc = argan;

  await check("limits: the landing profile is inside the D52 ceilings; HEIGHT_BAND 0.8, FOLD_BAND 0.9", () => {
    const p = limits.LANDING_PROFILE;
    const c = limits.D52_CEILINGS;
    assert.equal(limits.HEIGHT_BAND, 0.8);
    assert.equal(limits.FOLD_BAND, 0.9);
    assert.ok(p.htmlGz.hard <= c.htmlGz && p.sections.hard <= c.sections && p.heightPx.hard <= c.heightPx && p.ctas.hard <= c.ctas);
    assert.ok(p.glass.hard <= c.glass && p.reveals.hard <= c.reveals && p.photoReuse.hard <= c.photoReuse);
    for (const k of ["sections", "heightPx", "ctas", "glass", "reveals", "photoReuse", "htmlGz"] as const) assert.ok(p[k].soft <= p[k].hard, k);
  });

  await check("stub predicate: heightModelIsStub() ⇔ HEIGHT_MODEL_VERSION 0 ⇔ every report says stub: true", () => {
    assert.equal(stub, HEIGHT_MODEL_VERSION === 0);
    for (const name of FIXTURE_NAMES) {
      const d = validateDoc(getFixture(name, { now, locale: "ar" }).doc).doc!;
      const r = estimateHeights(d, { look: d.theme.look ?? null, locale: d.locale, features: variantFeatures });
      assert.equal(r.stub === true, stub, `${name}: report.stub`);
      if (stub) {
        assert.ok(r.fold.ok && r.formTop === null && r.sections.every((s) => s.height === 600), `${name}: the §K.2 stub shape`);
        assert.ok(!r.sections.some((s) => s.type === "stickyCta" || s.type === "whatsappFloat"), `${name}: fixed layers are not in-flow`);
      }
    }
  });

  await check("registry: the budget check is registered with the publish checks", async () => {
    await import("./prepublish");
    assert.ok(globalThis.__sgPrePublish?.checks.has("budget"));
  });

  await check("origin: textFieldsOf walks every string leaf of each section at <section.id>.<dot.path>, array indices included", async () => {
    const { textFieldsOf } = await import("./origin");
    const d = { ...doc, sections: [{ ...doc.sections[0]!, id: "hero1", data: { title: "Huile d'argan", n: 3, on: true, items: [{ q: "Q1", a: "A1" }], img: { id: "x", alt: "" } } }] };
    assert.deepEqual([...textFieldsOf(d)], [["hero1.title", "Huile d'argan"], ["hero1.items.0.q", "Q1"], ["hero1.items.0.a", "A1"], ["hero1.img.id", "x"], ["hero1.img.alt", ""]]);
    const all = textFieldsOf(doc);
    assert.ok(all.size > 10 && [...all.keys()].every((k) => doc.sections.some((sec) => k.startsWith(`${sec.id}.`))), "every path starts with its section id");
  });

  await check("origin: an edited field → owner; an unedited recorded field → its class; no record → library; a path absent from a present record → owner", async () => {
    const origin = await import("./origin");
    const pre = await import("./prepublish");
    assert.ok(pre.originFrom === origin.originFrom && pre.textFieldsOf === origin.textFieldsOf && pre.hash16 === origin.hash16, "prepublish re-exports the one builder");
    const at = (title: string) => ({ ...doc, sections: [{ ...doc.sections[0]!, id: "hero1", data: { title, lead: "Pressée à froid", kicker: "Nouveau" } }] });
    const d = at("Huile d'argan");
    const gen = {
      "hero1.title": { h: origin.hash16("Huile d'argan"), o: "cloud" as const },
      "hero1.lead": { h: origin.hash16("Pressée à froid"), o: "library" as const },
    };
    const m = origin.originFrom(null, d, gen);
    assert.deepEqual([...m], [["hero1.title", "cloud"], ["hero1.lead", "library"], ["hero1.kicker", "owner"]], "recorded fields keep their class; the unrecorded one is owner");
    assert.equal(origin.originFrom(null, at("Huile d'argan bio"), gen).get("hero1.title"), "owner", "an edited field");
    for (const none of [undefined, null]) assert.deepEqual([...origin.originFrom(null, d, none).values()], ["library", "library", "library"], `no record (${none})`);
    assert.deepEqual([...origin.originFrom(null, d, {}).values()], ["owner", "owner", "owner"], "an empty record names no field");
    assert.deepEqual(origin.originFrom(d, d, gen), m, "prev is not consulted in R1");
    // the record survives Unicode normalisation and outer whitespace; a class outside the five never leaks
    assert.equal(origin.originFrom(null, at("  Huile d'argan \n"), gen).get("hero1.title"), "cloud");
    const nfd = { "hero1.lead": { h: origin.hash16("Presse\u0301e a\u0300 froid"), o: "engine" as const } };
    assert.equal(origin.originFrom(null, d, nfd).get("hero1.lead"), "engine");
    assert.equal(origin.originFrom(null, d, { "hero1.title": { h: gen["hero1.title"].h, o: "robot" as never } }).get("hero1.title"), "owner");
  });

  await check("origin: hash16 is FNV-1a 64 over NFC(trim(text)) as 16 lowercase hex, deterministic", async () => {
    const { hash16 } = await import("./origin");
    // the published FNV-1a 64-bit vectors
    assert.equal(hash16(""), "cbf29ce484222325");
    assert.equal(hash16("a"), "af63dc4c8601ec8c");
    assert.equal(hash16("foobar"), "85944171f73967e8");
    for (const t of ["Huile d'argan", "زيت الأركان الأصلي", "Crème 100 % bio ✓", "😀"]) {
      assert.match(hash16(t), /^[0-9a-f]{16}$/);
      assert.equal(hash16(t), hash16(t), "deterministic");
      assert.equal(hash16(` ${t}\t`), hash16(t), "trim-insensitive");
    }
    assert.equal(hash16("Cre\u0300me"), hash16("Cr\u00e8me"), "NFC-insensitive");
    assert.equal(hash16("e\u0301"), hash16("\u00e9"));
    assert.notEqual(hash16("Huile d'argan"), hash16("Huile d'Argan"), "case-sensitive");
  });

  await check(`fixtures: while design's stubs are in place, no fixture (live, ${SLOW ? "fr and ar" : "fr"}) is refused; every budget item is a note flagged stub`, async () => {
    if (!stub) return; // the P6 merge enables the hard fixtures of src/lib/design/calibration/heights.json instead
    let baselineHard = 0;
    for (const name of FIXTURE_NAMES) {
      for (const locale of SLOW ? (["fr", "ar"] as const) : (["fr"] as const)) {
        const fx = getFixture(name, { now, locale });
        const d = validateDoc(fx.doc).doc!;
        const html = (
          await renderLandingHtml(d, {
            mode: "live",
            assets: fixtureAssets("/"),
            pageKey: fx.pageKey,
            store: fx.store,
            urls: { landing: `/s/qa/${name}`, thankYou: `/s/qa/${name}/merci`, endpoints: { order: "/api/public/order", lead: "/api/public/lead", event: "/api/public/event", upsell: "/api/public/upsell" } },
            links: storePageLinks("/s/qa", name, `https://platform.example/report/qa?p=%2Fs%2Fqa%2F${name}`),
            now,
          })
        ).html;
        baselineHard += budget.budgetReport({ doc: d, html }).items.filter((i) => i.level === "hard").length;
        const res = budget.budgetResult({ doc: d, html });
        assert.ok(res.ok, `${name}/${locale}: refused`);
        assert.ok((res.notes ?? []).every((i) => i.level === "soft" && i.vars?.stub === 1), `${name}/${locale}: a note without the stub flag`);
      }
    }
    // today's engine output is the design baseline the D52 rows were written against: the rows do measure it
    assert.ok(baselineHard > 0, "the fixtures carry the baseline faults (classified hard, published as notes before P6)");
  });

  await check("stub rule: C2 / C3 / F1 are notes flagged stub; nothing is derived from the stub's heights", () => {
    if (!stub) return;
    const long = { ...doc, sections: [...doc.sections, ...Array.from({ length: 20 }, (_, i) => ({ ...doc.sections.find((s) => s.type === "faq")!, id: `faq${i}` }))] };
    const r = budget.budgetReport({ doc: long });
    const c3 = r.items.filter((i) => i.id === "budget:C3");
    assert.ok(c3.length === 1 && c3[0]!.level === "soft" && c3[0]!.vars?.stub === 1 && c3[0]!.title === "budget.C3.sections", JSON.stringify(c3));
    assert.ok(!r.items.some((i) => i.title === "budget.C3.height" || i.id === "budget:C2" || i.title === "budget.F1.position"));
    const formless = { ...doc, sections: doc.sections.filter((s) => s.type !== "orderForm") };
    const f1 = budget.budgetReport({ doc: formless }).items.find((i) => i.id === "budget:F1");
    assert.ok(f1 && f1.level === "soft" && f1.vars?.stub === 1 && f1.title === "budget.F1.missing", JSON.stringify(f1));
  });

  await check("rows without heights: F5 weight, R1 order buttons, R5 reveals, K2 colour bands, I1 photo reuse classify hard past the limit, soft past the note line", async () => {
    // a document whose own sections trip no row: every background neutral
    const clean = { ...doc, sections: doc.sections.map((s) => ({ ...s, bg: "base" as const })) };
    const hardIds = (r: ReturnType<typeof budget.budgetReport>) => r.items.filter((i) => i.level === "hard").map((i) => i.id);
    assert.deepEqual(hardIds(budget.budgetReport({ doc: clean })), []);
    // F5: an incompressible document over 140 KB gz
    const noise = randomBytes(200_000).toString("base64");
    assert.deepEqual(hardIds(budget.budgetReport({ doc: clean, html: `<html><body>${noise}</body></html>` })), ["budget:F5"]);
    assert.deepEqual(hardIds(budget.budgetReport({ doc: clean, html: '<a class="lp-btn lp-btn--primary">x</a>'.repeat(9) })), ["budget:R1"]);
    assert.deepEqual(
      budget.budgetReport({ doc: clean, html: '<a class="lp-btn lp-btn--primary">x</a>'.repeat(7) }).items.filter((i) => i.id === "budget:R1").map((i) => i.level),
      ["soft"],
    );
    assert.deepEqual(hardIds(budget.budgetReport({ doc: clean, html: '<span data-reveal="rise">x</span>'.repeat(121) })), ["budget:R5"]);
    const base = clean.sections.find((s) => s.type === "faq")!;
    const bands = { ...clean, sections: [...clean.sections, ...Array.from({ length: 5 }, (_, i) => ({ ...base, id: `band${i}`, bg: "accent" as const }))] };
    assert.deepEqual(hardIds(budget.budgetReport({ doc: bands })), ["budget:K2"]);
    const img = { id: "a".repeat(32), alt: "" };
    const reuse = { ...clean, sections: [...clean.sections, ...Array.from({ length: 5 }, (_, i) => ({ ...base, id: `img${i}`, data: { ...base.data, image: img } }))] };
    assert.deepEqual(hardIds(budget.budgetReport({ doc: reuse })), ["budget:I1"]);
    // the check: refused once design's model is real; before P6 the same items are notes flagged stub
    const res = budget.budgetResult({ doc: bands, html: "" });
    if (stub) assert.ok(res.ok && (res.notes ?? []).some((i) => i.id === "budget:K2" && i.level === "soft" && i.vars?.stub === 1), JSON.stringify(res));
    else assert.ok(!res.ok && res.code === "budget_blocked" && res.items.some((i) => i.id === "budget:K2"));
  });

  await check("profiles: clamped to the D52 ceilings; a second registration and 'landing' are refused; unregistered kinds use the landing profile", () => {
    const loose = { ...limits.LANDING_PROFILE, sections: { soft: 30, hard: 40 }, htmlGz: { soft: 300_000, hard: 400_000 }, ctas: { soft: 9, hard: 20 } };
    budget.registerBudgetProfile("product", loose);
    const p = budget.budgetProfileFor("product");
    assert.deepEqual([p.sections.hard, p.htmlGz.hard, p.ctas.hard], [16, 140 * 1024, 8]);
    assert.throws(() => budget.registerBudgetProfile("product", loose), /already registered/);
    assert.throws(() => budget.registerBudgetProfile("landing" as "product", loose), /never re-registered/);
    assert.equal(budget.budgetProfileFor("cart"), limits.LANDING_PROFILE);
    globalThis.__sgBudgetProfiles?.delete("product");
  });

  await check("lock: assertStubBuildAllowed throws in production without SG_STUB_BUILD_OK=1 and never otherwise", () => {
    if (!stub) {
      budget.assertStubBuildAllowed({ NODE_ENV: "production" });
      return;
    }
    assert.throws(() => budget.assertStubBuildAllowed({ NODE_ENV: "production" }), /stub-lock: design's height model/);
    assert.throws(() => budget.assertStubBuildAllowed({ NODE_ENV: "production", SG_STUB_BUILD_OK: "true" }), /stub-lock/);
    budget.assertStubBuildAllowed({ NODE_ENV: "production", SG_STUB_BUILD_OK: "1" });
    budget.assertStubBuildAllowed({ NODE_ENV: "development" });
    budget.assertStubBuildAllowed({});
  });

  if (!SLOW) console.log("  · lock: the child-process proof (stub-lock.ts exit codes, budget.ts loaded in production) runs with --slow (npm run test:slow)");
  else await check("lock: scripts/qa/stub-lock.ts exits 1 without SG_STUB_BUILD_OK and 0 with it; budget.ts throws at load in production", async () => {
    const budgetUrl = new URL(`file:///${path.join(ROOT, "src", "lib", "render", "prepublish", "budget.ts").replace(/\\/g, "/")}`).href;
    const load = `import(${JSON.stringify(budgetUrl)}).then(() => { console.log("loaded"); process.exit(0); }, (e) => { console.log(String(e && e.message)); process.exit(3); });`;
    const [without, withVar, prodLoad, prodOk] = await Promise.all([
      run([...TSX, "scripts/qa/stub-lock.ts"], { SG_STUB_BUILD_OK: undefined }),
      run([...TSX, "scripts/qa/stub-lock.ts"], { SG_STUB_BUILD_OK: "1" }),
      run(["--conditions=react-server", ...TSX, "--input-type=module", "-e", load], { NODE_ENV: "production", SG_STUB_BUILD_OK: undefined }),
      run(["--conditions=react-server", ...TSX, "--input-type=module", "-e", load], { NODE_ENV: "production", SG_STUB_BUILD_OK: "1" }),
    ]);
    if (stub) {
      assert.equal(without.code, 1, `stub-lock without the variable: exit ${without.code}\n${without.out}`);
      assert.match(without.out, /stub-lock: design's height model/);
      assert.equal(withVar.code, 0, `stub-lock with SG_STUB_BUILD_OK=1: exit ${withVar.code}\n${withVar.out}`);
      assert.equal(prodLoad.code, 3, `budget.ts in production without the variable: exit ${prodLoad.code}\n${prodLoad.out}`);
      assert.match(prodLoad.out, /stub-lock: design's height model/);
    } else {
      assert.equal(without.code, 0, without.out);
      assert.equal(prodLoad.code, 0, prodLoad.out);
    }
    assert.equal(prodOk.code, 0, `budget.ts in production with SG_STUB_BUILD_OK=1: exit ${prodOk.code}\n${prodOk.out}`);
  });

  await check("archive: the gate-file rule refuses stubBuild: true, a stale or foreign file, and accepts a fresh one for HEAD", () => {
    const head = "a".repeat(40);
    const at = new Date(Date.parse(now)).toISOString();
    const nowMs = Date.parse(now) + 60_000;
    assert.equal(gateFileProblem({ sha: head, at }, { head, now: nowMs }), null);
    assert.match(gateFileProblem({ sha: head, at, stubBuild: true }, { head, now: nowMs }) ?? "", /stubBuild: true/);
    assert.match(gateFileProblem({ sha: "b".repeat(40), at }, { head, now: nowMs }) ?? "", /not HEAD/);
    assert.match(gateFileProblem({ sha: head, at }, { head, now: nowMs + 25 * 3_600_000 }) ?? "", /h old/);
    assert.match(gateFileProblem(null, { head, now: nowMs }) ?? "", /no commit/);
  });

  console.log(failures ? `test:prepublish: ${failures} FAILED, ${passed} passed` : `test:prepublish: all ${passed} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
