/**
 * Runtime pure-helper self-test:  npx tsx src/landing/runtime/selftest.ts
 * Covers phone normalization (MA + other markets), money formatting, totals parity with
 * src/lib/page/pricing.ts, id generation, locale-preserving number formatting, the countdown's
 * plural day label, LTR isolates in Arabic runtime strings, the sticky-header scroll offset, the
 * sticky buy bar's show rule (only after the hero CTA has been scrolled past), and the frozen chunk's
 * R1.0 edits held to the pre-R1.0 behaviour (storage names, captureUtm, adIds, flag / disable; CCR r1.0-m-7).
 */
import { webcrypto } from "node:crypto";
import { effectiveFree, emptySelection, offersMath, orderTotals, toCents } from "../../lib/page/pricing";
import { Item, Offers, Product } from "../../lib/page/schema";
import { createT, pluralForms } from "../i18n";
import type { Ctx } from "./core";
import { disable, flag, skey } from "./core";
import { randomId, uuid } from "./ids";
import { computeTotals, emptySel, formatMoney } from "./money";
import { NUM_RUN, formatNum, numStyle, toAsciiDigits } from "./numbers";
import { normalizePhone } from "./phone";
import { headerOffset } from "./scroll";
import { stickyVisible } from "./sticky";
import { adIds, captureUtm } from "./tracking";
import { RUNTIME_UI_KEYS } from "./strings";

let pass = 0;
const failures: string[] = [];
function eq(label: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else failures.push(`${label}\n    got:  ${g}\n    want: ${w}`);
}

/* ---------------- phone ---------------- */
const MA = { prefix: "+212", national: "^0[5-7][0-9]{8}$" };
const mobile = { national: "0612345678", e164: "+212612345678" };
const maCases: [string, string, { national: string; e164: string } | null][] = [
  ["national", "0612345678", mobile],
  ["spaces", "06 12 34 56 78", mobile],
  ["dashes", "06-12-34-56-78", mobile],
  ["dots", "06.12.34.56.78", mobile],
  ["parentheses", "(06) 12 34 56 78", mobile],
  ["nbsp + tabs", "06 12\t34 56 78", mobile],
  ["Arabic-Indic digits", "٠٦١٢٣٤٥٦٧٨", mobile],
  ["Persian digits", "۰۶۱۲ ۳۴۵۶ ۷۸", mobile],
  ["mixed digits", "06 ١٢ 34 ٥٦ 78", mobile],
  ["bidi marks", "‎0612345678‏", mobile],
  ["Arabic letter mark (pasted from Arabic text)", "؜٠٦١٢٣٤٥٦٧٨؜", mobile],
  ["zero-width chars", "06​12‌34‍56⁠78", mobile],
  ["unicode dashes", "06‑12–34−56 78", mobile],
  ["+212", "+212612345678", mobile],
  ["+212 spaced", "+212 6 12 34 56 78", mobile],
  ["+212 with trunk 0", "+212 0612345678", mobile],
  ["+212 Arabic digits", "+٢١٢٦١٢٣٤٥٦٧٨", mobile],
  ["00212", "00212612345678", mobile],
  ["00212 with trunk 0", "002120612345678", mobile],
  ["212 without plus", "212612345678", mobile],
  ["missing trunk 0", "612345678", mobile],
  ["07 mobile", "07 12 34 56 78", { national: "0712345678", e164: "+212712345678" }],
  ["05 landline", "05 22 12 34 56", { national: "0522123456", e164: "+212522123456" }],
  ["landline +212", "+212 5 22 12 34 56", { national: "0522123456", e164: "+212522123456" }],
  ["invalid 08 prefix", "0812345678", null],
  ["too short", "061234567", null],
  ["too long", "06123456789", null],
  ["letters", "06123a5678", null],
  ["empty", "", null],
  ["garbage", "phone", null],
  ["French number", "+33612345678", null],
  ["other intl prefix", "0033612345678", null],
  ["short +212", "+21261234567", null],
];
for (const [label, input, want] of maCases) eq(`phone MA: ${label} (${input})`, normalizePhone(input, MA), want);

eq("phone FR: +33", normalizePhone("+33 6 12 34 56 78", { prefix: "+33", national: "^0[1-9][0-9]{8}$" }), {
  national: "0612345678",
  e164: "+33612345678",
});
eq("phone FR: 0033", normalizePhone("0033612345678", { prefix: "+33", national: "^0[1-9][0-9]{8}$" }), {
  national: "0612345678",
  e164: "+33612345678",
});
eq("phone FR: national", normalizePhone("06 12 34 56 78", { prefix: "+33", national: "^0[1-9][0-9]{8}$" }), {
  national: "0612345678",
  e164: "+33612345678",
});
eq("phone ES: no trunk 0", normalizePhone("+34 612 345 678", { prefix: "+34", national: "^[6-9][0-9]{8}$" }), {
  national: "612345678",
  e164: "+34612345678",
});
eq("phone ES: national", normalizePhone("612345678", { prefix: "+34", national: "^[6-9][0-9]{8}$" }), {
  national: "612345678",
  e164: "+34612345678",
});
eq("phone IT: landline keeps 0", normalizePhone("06 1234 5678", { prefix: "+39", national: "^(3[0-9]{8,9}|0[0-9]{5,10})$" }), {
  national: "0612345678",
  e164: "+390612345678",
});
eq("phone: broken regex → null", normalizePhone("0612345678", { prefix: "+212", national: "([" }), null);

/* ---------------- money ---------------- */
const MAD_AR = { locale: "ar-MA", symbol: "درهم", position: "after" as const, decimals: 0 };
const MAD_FR = { locale: "fr-MA", symbol: "DH", position: "after" as const, decimals: 0 };
const EUR_FR = { locale: "fr-FR", symbol: "€", position: "after" as const, decimals: 2 };
const nb = " ";
eq("money MAD ar", formatMoney(249, MAD_AR), "249" + nb + "درهم");
eq("money MAD ar thousands", formatMoney(1249, MAD_AR), "1.249" + nb + "درهم");
eq("money MAD ar latin digits even for bare 'ar'", formatMoney(1249, { ...MAD_AR, locale: "ar-EG" }), "1,249" + nb + "درهم");
eq("money MAD ar explicit arab digits", formatMoney(249, { ...MAD_AR, locale: "ar-u-nu-arab" }), "٢٤٩" + nb + "درهم");
eq("money MAD fr", formatMoney(249, MAD_FR), "249" + nb + "DH");
eq("money MAD fr thousands", formatMoney(1249, MAD_FR), "1.249" + nb + "DH");
eq("money MAD cents never hidden", formatMoney(249.5, MAD_FR), "249,50" + nb + "DH");
eq("money MAD zero", formatMoney(0, MAD_FR), "0" + nb + "DH");
eq("money EUR fr", formatMoney(24.9, EUR_FR), "24,90" + nb + "€");
eq("money EUR fr thousands", formatMoney(1249.5, EUR_FR), "1 249,50" + nb + "€");
eq("money symbol before (1 char)", formatMoney(10, { locale: "en-US", symbol: "$", position: "before", decimals: 2 }), "$10.00");
eq("money symbol before (word)", formatMoney(10, { locale: "en-US", symbol: "MAD", position: "before", decimals: 0 }), "MAD" + nb + "10");
eq("money NaN → 0", formatMoney(Number.NaN, EUR_FR), "0,00" + nb + "€");
eq("money bad locale falls back", formatMoney(5, { locale: "!!", symbol: "", position: "after", decimals: 0 }), "5");

/* ---------------- totals vs pricing.ts ---------------- */
const product = Product.parse({ name: "Huile d'argan" });
const items = [Item.parse({ id: "main", price: 199 })];
const one = (qty: number) => [{ id: "l1", qty, pick: { item: "main" } }];
const offerVariants = [
  { shippingFee: 0, bump: true },
  { shippingFee: 25, bump: true },
  { shippingFee: 19.9, bump: false },
];
for (const v of offerVariants) {
  const offers = Offers.parse({
    bundles: [
      { id: "b1", lines: one(1), price: 199 },
      { id: "b2", lines: one(2), price: 349, badge: "popular", compareAt: 398 },
      { id: "b3", lines: one(3), price: 479.9, title: "Pack Famille" },
    ],
    shippingFee: v.shippingFee,
    orderBump: { enabled: v.bump, title: "Pochette", price: 49.5 },
  });
  const doc = { product, items, offers };
  // what the renderer embeds (config v2, cents): offerMath per offer, effective-free delivery, bump only when enabled
  const math = offersMath(doc);
  const cfg: Parameters<typeof computeTotals>[0] = {
    items: [{ id: "main", name: "", short: "", price: 19900, contentId: "pk", groups: [] }],
    bundles: offers.bundles.map((b, i) => ({
      id: b.id,
      label: `x${math[i]!.units}`,
      short: `×${math[i]!.units}`,
      price: math[i]!.price,
      from: math[i]!.from,
      reference: math[i]!.displayReference,
      savings: math[i]!.savings,
      savingsPct: math[i]!.savingsPct,
      free: effectiveFree(doc, b),
      units: b.lines.flatMap((l, line) => Array.from({ length: l.qty }, () => ({ line, item: "main" }))),
    })),
    extras: [],
    shippingFee: toCents(offers.shippingFee),
    bump: offers.orderBump && offers.orderBump.enabled ? { price: toCents(offers.orderBump.price) } : undefined,
  };
  for (const b of offers.bundles)
    for (const withBump of [false, true]) {
      const ref = orderTotals(doc, emptySelection(b.id, withBump))!;
      const got = computeTotals(cfg, emptySel(b.id, withBump))!;
      const label = `totals ${b.id} ship=${v.shippingFee} bumpEnabled=${v.bump} withBump=${withBump}`;
      eq(label, [got.price, got.bump, got.shipping, got.subtotal, got.total, got.units], [ref.offer.price, ref.bump, ref.shipping, ref.subtotal, ref.total, ref.offer.units]);
    }
  eq(`totals unknown bundle (ship=${v.shippingFee})`, computeTotals(cfg, emptySel("nope")), orderTotals(doc, emptySelection("nope")));
}

/* ---------------- ids ---------------- */
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CONTRACT_IDEM = /^[a-f0-9-]{36}$/;
const CONTRACT_EVENT = /^[a-zA-Z0-9_-]{8,64}$/;
const viaRandomUUID = uuid(webcrypto as unknown as Crypto);
const viaGetRandomValues = uuid({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) as Crypto["getRandomValues"] });
const viaMathRandom = uuid(null);
for (const [label, id] of [
  ["randomUUID", viaRandomUUID],
  ["getRandomValues", viaGetRandomValues],
  ["Math.random", viaMathRandom],
] as const) {
  eq(`uuid v4 via ${label}`, UUID_V4.test(id), true);
  eq(`uuid matches idem contract via ${label}`, CONTRACT_IDEM.test(id) && CONTRACT_EVENT.test(id), true);
}
eq("uuid unique", new Set(Array.from({ length: 200 }, () => uuid(null))).size, 200);
const vid = randomId(22, webcrypto as unknown as Crypto);
eq("visitor id format", /^[a-zA-Z0-9_-]{22}$/.test(vid), true);

/* ---------------- locale-preserving numbers (count roll-up / countdown) ---------------- */
eq("toAsciiDigits", toAsciiDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹"), "0123456789 0123456789");
const run = (s: string) => NUM_RUN.exec(s)![0];
eq("NUM_RUN finds grouped number", run("+12 000 clients"), "12 000");
eq("NUM_RUN stops at trailing text", run("98 % satisfaits"), "98");
eq("count: grouped latin", formatNum(5300.4, 0, numStyle("12 000", 0)), "5 300");
eq("count: comma decimal", formatNum(3.14159, 1, numStyle("4,8", 1)), "3,1");
eq("count: dot decimal", formatNum(2.5, 1, numStyle("4.8", 1)), "2.5");
eq("count: Arabic-Indic grouped", formatNum(7000, 0, numStyle("١٢٬٠٠٠", 0)), "٧٬٠٠٠");
eq("count: no grouping kept", formatNum(1999, 0, numStyle("2024", 0)), "1999");
eq("count: zero", formatNum(0, 0, numStyle("12 000", 0)), "0");

/* ---------------- countdown day label (plural forms re-picked by the runtime) ---------------- */
eq("plural forms fr", pluralForms("fr", "urgency.days"), { other: "jours", one: "jour" });
eq("plural forms ar (only forms differing from other)", pluralForms("ar", "urgency.days"), { other: "يوم", two: "يومين", few: "أيام" });
eq("plural forms of a plain string", pluralForms("fr", "form.title"), null);
for (const loc of ["fr", "ar", "en"] as const) {
  const forms = pluralForms(loc, "urgency.days")!;
  const rules = new Intl.PluralRules(loc);
  const t = createT(loc);
  for (const n of [0, 1, 2, 3, 7, 11, 25, 100, 101])
    eq(`day label ${loc} n=${n}: runtime pick = server t()`, forms[rules.select(n)] ?? forms.other, t("urgency.days", { n }));
}

/* ---------------- Arabic plain-text strings keep numeric runs in LTR isolates ---------------- */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const tAr = createT("ar");
eq("ar form.errPhone isolates the example", tAr("form.errPhone").includes(LRI + "06 12 34 56 78" + PDI), true);
eq("ar trust.delivery isolates the range", tAr("trust.delivery").includes(LRI + "24–48" + PDI), true);
eq("ar bundle.savePct isolates the signed percent", tAr("bundle.savePct", { pct: 30 }), LRI + "−30%" + PDI);
// every string the runtime writes as plain text: no bare digit group / range / signed number left
const BARE_RUN = /\d[\s\u{a0}\u{202f}\-\u{2010}-\u{2015}\/:]+\d|[+\-\u{2212}]\d|\d%/u;
for (const key of RUNTIME_UI_KEYS) {
  const v = tAr(key);
  const outside = v.replace(new RegExp(LRI + "[^" + PDI + "]*" + PDI, "g"), "");
  eq(`ar runtime string "${key}" has no un-isolated numeric run`, BARE_RUN.test(outside), false);
  eq(`ar runtime string "${key}" isolates are balanced`, v.split(LRI).length, v.split(PDI).length);
}

/* ---------------- headerOffset: visible part of a sticky/fixed header ---------------- */
interface FakeHeader {
  position: string;
  top: string;
  rect: { top: number; height: number };
}
function offsetFor(headers: FakeHeader[], innerHeight = 800): number {
  const els = headers.map((h) => ({
    h,
    getBoundingClientRect: () => ({ top: h.rect.top, bottom: h.rect.top + h.rect.height, height: h.rect.height }),
  }));
  const c = {
    doc: { querySelectorAll: () => els },
    win: { innerHeight, getComputedStyle: (el: { h: FakeHeader }) => ({ position: el.h.position, top: el.h.top }) },
  } as unknown as Ctx;
  return headerOffset(c);
}
eq("headerOffset sticky top 0", offsetFor([{ position: "sticky", top: "0px", rect: { top: 0, height: 64 } }]), 64);
eq("headerOffset sticky not yet stuck (page top)", offsetFor([{ position: "sticky", top: "0px", rect: { top: 36, height: 64 } }]), 64);
eq("headerOffset sticky with negative top (eyebrow rides above)", offsetFor([{ position: "sticky", top: "-28px", rect: { top: 36, height: 92 } }]), 64);
eq("headerOffset floating sticky bar (positive top)", offsetFor([{ position: "sticky", top: "12px", rect: { top: 12, height: 56 } }]), 68);
eq("headerOffset sticky top auto", offsetFor([{ position: "sticky", top: "auto", rect: { top: 0, height: 60 } }]), 60);
eq("headerOffset fixed at the top", offsetFor([{ position: "fixed", top: "0px", rect: { top: 0, height: 60 } }]), 60);
eq("headerOffset fixed bar at the bottom is no header", offsetFor([{ position: "fixed", top: "740px", rect: { top: 740, height: 60 } }]), 0);
eq("headerOffset static header", offsetFor([{ position: "static", top: "auto", rect: { top: 0, height: 60 } }]), 0);
eq("headerOffset too tall (≥ ⅓ viewport)", offsetFor([{ position: "sticky", top: "0px", rect: { top: 0, height: 300 } }]), 0);
eq("headerOffset hidden header", offsetFor([{ position: "sticky", top: "0px", rect: { top: 0, height: 0 } }]), 0);
eq(
  "headerOffset largest wins",
  offsetFor([
    { position: "sticky", top: "-20px", rect: { top: 0, height: 90 } },
    { position: "fixed", top: "0px", rect: { top: 0, height: 56 } },
  ]),
  70,
);

/* ---------------- sticky bar: shows only after the hero CTA has been scrolled past ---------------- */
{
  type Fake = { getBoundingClientRect: () => DOMRect; getAttribute: (n: string) => string | null };
  const el = (top: number, h: number, hidden = false, w = 300): Fake => ({
    getBoundingClientRect: () => ({ top, bottom: top + h, width: w, height: h }) as DOMRect,
    getAttribute: (n: string) => (n === "aria-hidden" && hidden ? "true" : null),
  });
  const vp = (scrollY: number, height = 800) => ({ height, scrollY });
  const box = (top: number) => el(top, 52);
  const end = (top: number) => el(top, 96, true);
  const formAt = (top: number) => el(top, 900, false, 360);
  const show = (zones: Fake[], form: Fake, v: { height: number; scrollY: number }) => stickyVisible([...zones, form], form, v.height, v.scrollY);
  eq("sticky first paint, hero CTA below the fold (phone)", show([box(900), end(9000)], formAt(3000), vp(0)), false);
  eq("sticky first paint, hero CTA on screen", show([box(500), end(9000)], formAt(3000), vp(0)), false);
  eq("sticky hero CTA partly above the top (not yet passed)", show([box(-30), end(9000)], formAt(3000), vp(400)), false);
  eq("sticky hero CTA scrolled past", show([box(-60), end(9000)], formAt(3000), vp(1000)), true);
  eq("sticky hidden while the order form is on screen", show([box(-900), end(9000)], formAt(200), vp(1800)), false);
  eq("sticky hidden at the page end marker", show([box(-8000), end(500)], formAt(-5000), vp(9000)), false);
  eq("sticky jump straight to the footer (CTA skipped) still counts as passed", show([box(-7000), end(1200)], formAt(-4000), vp(8000)), true);
  eq("sticky no hero CTA: hidden in the first viewport", show([end(9000)], formAt(3000), vp(300)), false);
  eq("sticky no hero CTA: shows past the first viewport", show([end(9000)], formAt(3000), vp(900)), true);
  const hidden = el(0, 0, false, 0);
  eq("sticky hero CTA hidden at this breakpoint → fold rule", show([hidden, end(9000)], formAt(3000), vp(900)), true);
  eq("sticky hero CTA hidden at this breakpoint, first viewport", show([hidden, end(9000)], formAt(3000), vp(100)), false);
  eq("sticky scrolled back up above the hero CTA", show([box(900), end(9000)], formAt(3000), vp(0)), false);
}

/* ---------------- frozen-chunk parity (CCR r1.0-m-7): T3's byte-saving edits behave like the baseline ---------------- */
{
  // the pre-R1.0 implementations (776d24c core.ts / tracking.ts), with the storage name as a parameter (the sanctioned change)
  const BASE_PARAMS: [string, string, number][] = [
    ["utm_source", "source", 120], ["utm_medium", "medium", 120], ["utm_campaign", "campaign", 200], ["utm_content", "content", 200],
    ["utm_term", "term", 200], ["fbclid", "fbclid", 500], ["ttclid", "ttclid", 500], ["ScCid", "sccid", 500], ["gclid", "gclid", 500],
  ];
  type Win = Parameters<typeof captureUtm>[0];
  const baseCapture = (win: Win, name: string): Record<string, string> => {
    const out: Record<string, string> = {};
    let found = false;
    try {
      const q = new URLSearchParams(win.location.search);
      for (const [param, key, max] of BASE_PARAMS) {
        const v = (q.get(param) || q.get(param.toLowerCase()) || "").trim();
        if (v) {
          out[key] = v.slice(0, max);
          found = true;
        }
      }
    } catch {
      /* malformed URL */
    }
    if (found) {
      win.sessionStorage.setItem(name, JSON.stringify(out));
      return out;
    }
    try {
      const saved = JSON.parse(win.sessionStorage.getItem(name) || "null") as Record<string, unknown> | null;
      if (saved && typeof saved === "object")
        for (const [, key, max] of BASE_PARAMS) {
          const v = saved[key];
          if (typeof v === "string" && v) out[key] = v.slice(0, max);
        }
    } catch {
      /* corrupted storage */
    }
    return out;
  };
  const baseAdIds = (cookies: Record<string, string>, fbclid: string | undefined) => {
    const o: { fbp?: string; fbc?: string; ttp?: string } = {};
    const fbp = cookies._fbp ?? "";
    const fbc = cookies._fbc || (fbclid ? "fb.1." + Date.now() + "." + fbclid : "");
    const ttp = cookies._ttp ?? "";
    if (fbp) o.fbp = fbp.slice(0, 200);
    if (fbc) o.fbc = fbc.slice(0, 500);
    if (ttp) o.ttp = ttp.slice(0, 200);
    return o;
  };
  const storage = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), dump: () => Object.fromEntries(m) };
  };
  const win = (pathname: string, search: string, session: Record<string, string> = {}) =>
    ({ location: { pathname, search }, sessionStorage: storage(session), localStorage: storage() }) as unknown as Win & { sessionStorage: ReturnType<typeof storage> };

  eq("skey outside /s/: today's names", [skey(win("/promo", ""), "utm"), skey(win("/", ""), "vid")], ["lp-utm", "lp-vid"]);
  eq("skey store home and pages share the store's prefix", [skey(win("/s/atlas-argan", ""), "utm"), skey(win("/s/atlas-argan/promo", ""), "utm")], ["lp:atlas-argan:utm", "lp:atlas-argan:utm"]);
  eq("skey: /s/x (too short) and /s/atlas-argan-x2/… are not confused", [skey(win("/s/ab/x", ""), "utm"), skey(win("/sx/atlas-argan", ""), "utm")], ["lp-utm", "lp-utm"]);

  const long = "x".repeat(700);
  const searches = [
    "",
    "?utm_source=%20fb%20&utm_medium=cpc&utm_campaign=c1&utm_content=a&utm_term=t",
    "?fbclid=AbC&ttclid=t1&ScCid=s1&gclid=g1",
    "?sccid=lower&UTM_SOURCE=ignored",
    `?utm_source=${long}&fbclid=${long}`,
    "?utm_source=&fbclid=%20%20",
    "?%E0%A4%A=bad&utm_source=ok",
  ];
  for (const path of ["/promo", "/s/atlas-argan/promo"]) {
    for (const search of searches) {
      const a = win(path, search);
      const b = win(path, search);
      eq(`captureUtm parity ${path}${search.slice(0, 40)}`, [captureUtm(a), a.sessionStorage.dump()], [baseCapture(b, skey(b, "utm")), b.sessionStorage.dump()]);
    }
    for (const saved of ['{"source":"fb","sccid":"s1","fbclid":"' + long + '","x":"y"}', '{"source":7,"medium":""}', "not json", "null"]) {
      const a = win(path, "", { [skey(win(path, ""), "utm")]: saved });
      const b = win(path, "", { [skey(win(path, ""), "utm")]: saved });
      eq(`captureUtm session restore parity ${path} ${saved.slice(0, 24)}`, captureUtm(a), baseCapture(b, skey(b, "utm")));
    }
  }

  const realNow = Date.now;
  Date.now = () => 1_760_000_000_000;
  try {
    for (const [cookies, fbclid] of [
      [{}, undefined],
      [{}, "IwAR0abc"],
      [{ _fbc: "fb.1.1.cookie" }, "IwAR0abc"],
      [{ _fbp: "fb.1.2.p".padEnd(260, "p"), _ttp: "ttp".padEnd(240, "t") }, undefined],
      [{ _fbp: "", _fbc: "", _ttp: "" }, "x".repeat(600)],
    ] as [Record<string, string>, string | undefined][]) {
      const doc = { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ") };
      const c = { doc, st: { utm: fbclid ? { fbclid } : {} } } as unknown as Ctx;
      eq(`adIds parity ${JSON.stringify(Object.keys(cookies))} fbclid=${!!fbclid}`, adIds(c), baseAdIds(cookies, fbclid));
    }
  } finally {
    Date.now = realNow;
  }

  // flag / disable: the same attribute writes as the baseline
  const element = (tagName: string, attrs: Record<string, string>) => {
    const m = new Map(Object.entries(attrs));
    const writes: string[] = [];
    return {
      tagName,
      disabled: false,
      writes,
      attrs: () => Object.fromEntries(m),
      hasAttribute: (n: string) => m.has(n),
      setAttribute: (n: string, v: string) => {
        writes.push(`set ${n}=${v}`);
        m.set(n, v);
      },
      removeAttribute: (n: string) => {
        writes.push(`del ${n}`);
        m.delete(n);
      },
    };
  };
  const baseFlag = (el: ReturnType<typeof element>, name: string, on: boolean) => {
    if (on) {
      if (!el.hasAttribute(name)) el.setAttribute(name, "");
    } else if (el.hasAttribute(name)) el.removeAttribute(name);
  };
  for (const start of [{}, { hidden: "" }, { hidden: "until-found" }] as Record<string, string>[]) {
    for (const on of [true, false]) {
      const a = element("DIV", start);
      const b = element("DIV", start);
      flag(a as unknown as Element, "hidden", on);
      baseFlag(b, "hidden", on);
      eq(`flag parity ${JSON.stringify(start)} on=${on}`, [a.writes, a.attrs()], [b.writes, b.attrs()]);
    }
  }
  for (const tag of ["BUTTON", "A"]) {
    for (const off of [true, false]) {
      const a = element(tag, {});
      disable(a as unknown as Element, off);
      eq(`disable ${tag} off=${off}`, [a.writes, a.disabled], [[`set aria-disabled=${off ? "true" : "false"}`], tag === "BUTTON" ? off : false]);
    }
  }
  disable(null, true); // never throws on a missing element
}

/* ---------------- report ---------------- */
if (failures.length) {
  console.error(`✗ ${failures.length} failed, ${pass} passed\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
} else console.log(`✓ runtime selftest: all ${pass} checks passed`);

// runtime ↔ server parity in cents (totals, reasons, allocation, order text, payloads): npm test runs it too
void import("./selftest-parity");
