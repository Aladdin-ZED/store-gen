/**
 * Order validation self-test (no database, no Next runtime):  npx tsx src/lib/orders/selftest.ts
 *
 *  1. v1 payloads on upgraded v1 documents — per-unit and shared groups: valid, missing, unknown,
 *     sold out, a lone available option filled in, unknown group ids ignored, duplicate group names
 *     kept apart; error keys stay the v1 control names ("v.<unit>.<groupId>" / "v.<groupId>").
 *  2. validateOrder (v1) — stored units in group order, totals never depending on options.
 *  3. variantText — the v1 one-line "Variante" text.
 *  4. parseOrderPayload — dispatch on `v`, Zod paths → field keys, a v2 body never parses as v1.
 *  5. validateOrder (v2) on the duo / tshirt / colors fixtures — item choosers, matrix, fields,
 *     rules (locks ignore the payload, allow lists), distinct choices, choice-price differences,
 *     shared groups, extras scope, bump item, "stale" on a fallback version, order snapshots.
 *  6. version choice (chooseOrderVersion) and the versionDoc repair fallback (orderDocOf).
 *  7. store-side customer fields per scope (maskCustomer, D70): masked under a staff impersonation scope, unchanged
 *     for member, public, system and platform scopes; a partial row keeps its shape.
 */
import { maskCustomer } from "@/lib/admin-data/mask";
import { getFixture } from "@/lib/page/fixtures";
import { emptySelection, orderTotals } from "@/lib/page/pricing";
import { PageDoc, type PageDoc as PageDocT } from "@/lib/page/schema";
import type { StoreScope } from "@/lib/tenancy/types";
import { orderText } from "./text";
import { parseOrderPayload, toSelectionInput, UNIT_FIELD_RE, VARIANT_FIELD_RE, variantText, type OrderPayloadV1, type OrderPayloadV2 } from "./contract";
import { validateOrder, type ValidationResult } from "./validate";
import { chooseOrderVersion, orderDocOf, STALE_WINDOW_MS } from "./versions";

let passes = 0;
const failures: string[] = [];
function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else failures.push(`${name}\n    got:  ${a}\n    want: ${e}`);
}
const ok = (name: string, cond: boolean, detail?: unknown) => eq(name + (detail !== undefined && !cond ? ` (${JSON.stringify(detail)})` : ""), cond, true);

/* ------------------------------------------------------------------ */
/* v1 fixtures (stored v1 JSON, upgraded on read)                      */
/* ------------------------------------------------------------------ */

const color = {
  id: "color",
  name: "Couleur",
  kind: "swatch" as const,
  perUnit: true,
  options: [
    { id: "noir", label: "Noir", swatch: "#1d1d1f", soldOut: false },
    { id: "beige", label: "Beige", swatch: "#d8ccb4", soldOut: false },
    { id: "rouge", label: "Bordeaux", swatch: "#7a1f3d", soldOut: true },
  ],
};
const size = {
  id: "size",
  name: "Taille",
  kind: "text" as const,
  perUnit: true,
  options: ["S", "M", "L", "XL"].map((s) => ({ id: `sz-${s.toLowerCase()}`, label: s, soldOut: s === "XL" })),
};
const groups = [color, size];

const form = { phoneCountry: "MA", city: "text", address: "required", email: "hidden", note: "optional" };
const theme = {
  archetype: "souk",
  seed: 1,
  palette: { accent: "#2c5aa8", pop: "#e9a5b9", harmony: "pop-complement" },
  fonts: { display: "figtree", body: "figtree", displayAr: "readex-pro", bodyAr: "readex-pro" },
};

/** A stored v1 document (product.variants, bundles with qty), read through the v2 schema. */
function v1Doc(variants: unknown[], bundles: unknown[] = [{ id: "x1", qty: 1, price: 199 }, { id: "x2", qty: 2, price: 359 }, { id: "x3", qty: 3, price: 499 }]): PageDocT {
  return PageDoc.parse({
    v: 1,
    locale: "fr",
    market: "MA",
    currency: "MAD",
    product: { name: "Robe brodée", price: 199, variants },
    offers: { bundles },
    form,
    theme,
    sections: [],
  });
}

const base1: OrderPayloadV1 = {
  pageKey: "pk_selftest_0001",
  idem: "00000000-0000-4000-8000-000000000000",
  eventId: "ev_selftest_0001",
  bundleId: "x2",
  variants: [],
  bump: false,
  name: "Salma Bennani",
  phone: "0612345678",
  city: "Casablanca",
  address: "12 rue Atlas",
  t: 9000,
  utm: {},
};

type V1Result = { ok: true; units: Record<string, string>[] } | { ok: false; errors: Record<string, string> };
/** The v1 resolveVariants cases, through validateOrder: one pack of `qty` units. */
function v1run(g: unknown[], qty: number, chosen: Record<string, string>[]): V1Result {
  const doc = v1Doc(g, [{ id: "pk", qty, price: 100 * qty }]);
  const r = validateOrder({ ...base1, bundleId: "pk", variants: chosen }, doc);
  if (r.ok) return { ok: true, units: r.value.items.variants };
  const errors: Record<string, string> = {};
  for (const [k, e] of Object.entries(r.fields)) if (k.startsWith("v.") && typeof e === "string") errors[k] = e;
  return { ok: false, errors };
}

/* 1 · v1 payloads on upgraded documents ------------------------------ */
eq("x1 valid", v1run(groups, 1, [{ color: "noir", size: "sz-m" }]), { ok: true, units: [{ Couleur: "Noir", Taille: "M" }] });
eq(
  "x2 valid, different per unit",
  v1run(groups, 2, [
    { color: "noir", size: "sz-m" },
    { color: "beige", size: "sz-l" },
  ]),
  { ok: true, units: [{ Couleur: "Noir", Taille: "M" }, { Couleur: "Beige", Taille: "L" }] },
);
eq("missing size (unit 1)", v1run(groups, 1, [{ color: "noir" }]), { ok: false, errors: { "v.0.size": "required" } });
eq("missing everything x2", v1run(groups, 2, []), {
  ok: false,
  errors: { "v.0.color": "required", "v.1.color": "required", "v.0.size": "required", "v.1.size": "required" },
});
// v1 → v2 view (§G.1): units[u] = variants[u] ?? variants[0] — the v1 runtime always sends one record per unit
eq("a missing unit record reads the first unit's (v1 → v2 view)", v1run(groups, 2, [{ color: "noir", size: "sz-s" }]), {
  ok: true,
  units: [{ Couleur: "Noir", Taille: "S" }, { Couleur: "Noir", Taille: "S" }],
});
eq("unknown option", v1run(groups, 1, [{ color: "violet", size: "sz-m" }]), { ok: false, errors: { "v.0.color": "invalid" } });
eq("sold-out option", v1run(groups, 2, [{ color: "noir", size: "sz-m" }, { color: "noir", size: "sz-xl" }]), {
  ok: false,
  errors: { "v.1.size": "unavailable" },
});
eq("sold-out color", v1run(groups, 1, [{ color: "rouge", size: "sz-s" }]), { ok: false, errors: { "v.0.color": "unavailable" } });
eq("unknown group ids ignored", v1run(groups, 1, [{ color: "noir", size: "sz-s", hack: "x" }]), { ok: true, units: [{ Couleur: "Noir", Taille: "S" }] });
eq("units beyond qty ignored", v1run(groups, 1, [{ color: "noir", size: "sz-s" }, { color: "violet" }]), { ok: true, units: [{ Couleur: "Noir", Taille: "S" }] });
const lone = { ...size, options: [{ id: "one", label: "Taille unique", soldOut: false }, { id: "kid", label: "Enfant", soldOut: true }] };
eq("lone available option filled in", v1run([lone], 2, []), { ok: true, units: [{ Taille: "Taille unique" }, { Taille: "Taille unique" }] });
eq("lone available: a sold-out pick is still refused", v1run([lone], 1, [{ size: "kid" }]), { ok: false, errors: { "v.0.size": "unavailable" } });
const shared = { ...color, perUnit: false };
eq("perUnit=false: one shared choice for every unit", v1run([shared, size], 2, [{ color: "beige", size: "sz-s" }, { color: "noir", size: "sz-m" }]), {
  ok: true,
  units: [{ Couleur: "Beige", Taille: "S" }, { Couleur: "Beige", Taille: "M" }],
});
eq("perUnit=false missing → one error under v.<groupId>", v1run([shared, size], 2, [{ size: "sz-s" }, { size: "sz-m" }]), {
  ok: false,
  errors: { "v.color": "required" },
});
eq("perUnit=false sold out", v1run([shared], 3, [{ color: "rouge" }]), { ok: false, errors: { "v.color": "unavailable" } });
eq("duplicate group names kept apart", v1run([color, { ...color, id: "color2" }], 1, [{ color: "noir", color2: "beige" }]), {
  ok: true,
  units: [{ Couleur: "Noir", "Couleur (2)": "Beige" }],
});
eq("no groups → no units", v1run([], 2, [{ x: "y" }]), { ok: true, units: [] });
{
  const r = v1run([shared, size], 2, []);
  eq("error keys match the v1 control-name pattern", !r.ok && Object.keys(r.errors).every((k) => VARIANT_FIELD_RE.test(k)), true);
}

/* 2 · validateOrder (v1) ----------------------------------------------- */
const doc1 = v1Doc(groups);
const run = (variants: Record<string, string>[], bundleId = "x2") => validateOrder({ ...base1, bundleId, variants }, doc1);

const ok2 = run([
  { color: "noir", size: "sz-m" },
  { color: "beige", size: "sz-l" },
]);
eq("valid x2 order", ok2.ok, true);
if (ok2.ok) {
  eq("stored per-unit choices (group order)", ok2.value.items.variants, [{ Couleur: "Noir", Taille: "M" }, { Couleur: "Beige", Taille: "L" }]);
  eq("total from the pack, not the options (cents)", ok2.value.totals.total, orderTotals(doc1, emptySelection("x2"))!.total);
  eq("total 359 DH", ok2.value.totals.total, 35900);
  eq("sheet text of the order (v1 compat)", variantText(ok2.value.items.variants), "Noir/M + Beige/L");
  eq("sheet text of the order (v2 text)", orderText(ok2.value.items), "Noir/M + Beige/L");
  eq("v1 label kept", ok2.value.items.bundleLabel, "x2");
  eq("v1 unit price kept", ok2.value.items.unitPrice, 179.5);
  eq("rows are v2 with the units", [ok2.value.items.v, ok2.value.items.units?.length, ok2.value.items.qty], [2, 2, 2]);
}
const same = run([{ color: "noir", size: "sz-m" }, { color: "noir", size: "sz-m" }]);
eq("identical units: same total", same.ok && same.value.totals.total, ok2.ok && ok2.value.totals.total);
if (same.ok) eq("identical units counted", orderText(same.value.items), "2 × Noir/M");
const miss = run([{ color: "noir", size: "sz-m" }, { color: "noir" }]);
eq("missing size of unit 2 → field v.1.size", miss.ok ? null : miss.fields, { "v.1.size": "required" });
const bad = run([{ color: "noir", size: "sz-xl" }, { color: "pink", size: "sz-m" }]);
eq("sold out + unknown in one order", bad.ok ? null : bad.fields, { "v.1.color": "invalid", "v.0.size": "unavailable" });
const mixed = validateOrder({ ...base1, name: "", variants: [{ color: "noir" }] }, doc1);
// unit 2 reads unit 1's record (v1 → v2 view): only the size is missing
eq("option errors next to field errors", mixed.ok ? null : mixed.fields, { "v.0.size": "required", "v.1.size": "required", name: "required" });
const unknownPack = run([{ color: "noir", size: "sz-m" }], "x9");
eq("unknown pack: options not judged", unknownPack.ok ? null : unknownPack.fields, { bundleId: "invalid" });
const x1 = run([{ color: "beige", size: "sz-s" }], "x1");
eq("x1 order stores one unit", x1.ok && x1.value.items.variants, [{ Couleur: "Beige", Taille: "S" }]);
{
  const titled = v1Doc(groups, [{ id: "duo", qty: 2, price: 359, title: "Pack Duo" }]);
  const r = validateOrder({ ...base1, bundleId: "duo", variants: [{ color: "noir", size: "sz-m" }, { color: "noir", size: "sz-m" }] }, titled);
  eq("v1 titled label byte-identical", r.ok && r.value.items.bundleLabel, "Pack Duo (x2)");
}
{
  const fee = PageDoc.parse({ ...JSON.parse(JSON.stringify(doc1)), offers: { ...doc1.offers, shippingFee: 25 } });
  const r = validateOrder({ ...base1, bundleId: "x1", variants: [{ color: "beige", size: "sz-s" }] }, fee);
  eq("v1 fee always charged after the upgrade (freeShipping false)", r.ok && [r.value.totals.shipping, r.value.totals.total], [2500, 22400]);
}

/* 3 · variantText ------------------------------------------------------ */
eq("text: one unit", variantText([{ Couleur: "Noir", Taille: "M" }]), "Noir/M");
eq("text: identical units counted", variantText([{ Couleur: "Noir", Taille: "M" }, { Couleur: "Noir", Taille: "M" }]), "2 × Noir/M");
eq(
  "text: mixed units, first-seen order",
  variantText([{ c: "Noir", t: "M" }, { c: "Beige", t: "L" }, { c: "Noir", t: "M" }]),
  "2 × Noir/M + Beige/L",
);
eq("text: Arabic labels", variantText([{ اللون: "أسود", المقاس: "M" }]), "أسود/M");
eq("text: empty", variantText([]), "");
eq("text: old rows without variants", variantText(undefined), "");
eq("text: blank labels skipped", variantText([{ a: " ", b: "M" }, {}]), "M");

/* 4 · parseOrderPayload ------------------------------------------------ */
const base2: OrderPayloadV2 = { ...base1, variants: undefined, v: 2, st: 0, units: [], extras: {} } as unknown as OrderPayloadV2;
delete (base2 as { variants?: unknown }).variants;
{
  const r = parseOrderPayload({ ...base2, units: [{ item: "main", o: { "g-fit": "d-col=o-noir|d-size=o-m" } }], st: 12900 });
  eq("v2 body → V2", r.ok && r.v, 2);
  const v1 = parseOrderPayload({ ...base1 });
  eq("no v → V1", v1.ok && v1.v, 1);
  const shaped = { ...base2 } as Record<string, unknown>;
  delete shaped.v;
  eq("a v2-shaped body without v never parses as v1", parseOrderPayload(shaped).ok, false);
  eq("v: 3 → invalid", parseOrderPayload({ ...base1, v: 3 }).ok, false);
  eq("not an object → invalid", parseOrderPayload("x").ok, false);
  const keys = parseOrderPayload({
    ...base2,
    name: "x".repeat(90),
    units: [{ item: "NOT AN ID" }, { o: { "g-fit": "x".repeat(300) }, f: { "g-name": "y".repeat(300) } }],
    extras: { "g-wrap": "z".repeat(300) },
    b: { o: { "g-col": "q".repeat(260) } },
  });
  eq("paths → keys", keys.ok ? null : keys.fields, { name: "too_long", "u.0.@item": "invalid", "u.1.g-fit": "too_long", "u.1.g-name": "too_long", "x.g-wrap": "too_long", "b.g-col": "too_long" });
  ok("every v2 key matches the unit key pattern", keys.ok ? false : Object.keys(keys.fields).filter((k) => k !== "name").every((k) => UNIT_FIELD_RE.test(k)));
  const v1name = parseOrderPayload({ ...base1, name: "x".repeat(90) });
  eq("a 90-character name: too_long (v1)", v1name.ok ? null : v1name.fields, { name: "too_long" });
  const missingSt = parseOrderPayload({ ...base2, st: undefined });
  eq("v2 without st → invalid", missingSt.ok, false);
  eq("v1 → selection input", toSelectionInput({ ...base1, variants: [{ color: "noir" }] }).units.slice(0, 2), [{ o: { color: "noir" }, f: {} }, { o: { color: "noir" }, f: {} }]);
}

/* 5 · validateOrder (v2) on the Offers v2 fixtures ------------------------ */
// most payloads below send st: 0 on the current version: the server total wins, logged as a parity mismatch
const parityLogs: string[] = [];
const warn = console.warn;
console.warn = (...args: unknown[]) => void parityLogs.push(args.map(String).join(" "));
type UnitArg = { item?: string; o?: Record<string, string>; f?: Record<string, string> };
const v2 = (doc: PageDocT, bundleId: string, units: UnitArg[], extra: Partial<OrderPayloadV2> = {}, opts: { fallback?: boolean } = {}): ValidationResult => {
  const p = { ...base2, bundleId, units: units.map((u) => ({ o: {}, f: {}, ...u })), extras: {}, st: 0, ...extra } as OrderPayloadV2;
  return validateOrder(p, doc, opts);
};
const fieldsOf = (r: ValidationResult) => (r.ok ? null : r.fields);

const duo = getFixture("duo").doc;
{
  eq("duo: choice unit without an item → u.0.@item required", fieldsOf(v2(duo, "one", [])), { "u.0.@item": "required" });
  eq("duo: an item outside the choice → invalid", fieldsOf(v2(duo, "one", [{ item: "serum" }])), { "u.0.@item": "invalid" });
  const one = v2(duo, "one", [{ item: "nuit" }], { st: 14900 });
  ok("duo: choice unit ok", one.ok, fieldsOf(one));
  if (one.ok) {
    eq("duo: snapshot of the chosen item", [one.value.units[0]!.item, one.value.units[0]!.label, one.value.units[0]!.short], ["nuit", "Crème nuit", "Nuit"]);
    eq("duo: Sheets label", one.value.items.bundleLabel, "Une crème au choix (x1)");
    eq("duo: total", one.value.totals.total, 14900);
    eq("duo: compat variants carry the article", one.value.items.variants, [{ Article: "Crème nuit" }]);
    eq("duo: order text", orderText(one.value.items), "1 × Nuit");
  }
  const trio = v2(duo, "trio", [{}, {}, {}], { st: 34900 });
  ok("duo: trio (fixed lines) ok", trio.ok, fieldsOf(trio));
  if (trio.ok) eq("duo: trio text", orderText(trio.value.items), "1 × Jour + 1 × Nuit + 1 × Sérum");
  // stale: the page the shopper saw is gone (fallback) and the total differs
  const stale = v2(duo, "trio", [{}, {}, {}], { st: 30000 }, { fallback: true });
  eq("duo: fallback + other total → stale", !stale.ok && stale.stale, true);
  const fine = v2(duo, "trio", [{}, {}, {}], { st: 34900 }, { fallback: true });
  ok("duo: fallback + same total → accepted", fine.ok);
  const parity = v2(duo, "trio", [{}, {}, {}], { st: 1 });
  ok("duo: current version + other total → accepted (server total wins)", parity.ok && parity.value.totals.total === 34900);
  const staleUnit = v2(duo, "one", [{ item: "serum" }], { st: 14900 }, { fallback: true });
  eq("duo: fallback + unit error → stale", !staleUnit.ok && staleUnit.stale, true);

  // sold out item: auto-fill the only available choice, refuse the sold-out one, offers on it unavailable
  const sold = PageDoc.parse({ ...JSON.parse(JSON.stringify(duo)), items: duo.items.map((it) => (it.id === "nuit" ? { ...it, soldOut: true } : it)) });
  const auto = v2(sold, "one", []);
  ok("sold out: the lone available choice is filled in", auto.ok && auto.value.units[0]!.item === "main", fieldsOf(auto));
  eq("sold out: the sold-out choice → unavailable", fieldsOf(v2(sold, "one", [{ item: "nuit" }])), { "u.0.@item": "unavailable" });
  eq("sold out: an offer with a fixed line on it → bundleId unavailable", fieldsOf(v2(sold, "trio", [{}, {}, {}])), { bundleId: "unavailable" });

  // any 2 of 3, all different, pricier ones cost their difference (§C.6)
  const any2 = PageDoc.parse({
    ...JSON.parse(JSON.stringify(duo)),
    offers: {
      ...duo.offers,
      bundles: [...duo.offers.bundles, { id: "any2", title: "2 au choix", price: 279, lines: [{ id: "l1", qty: 2, pick: { choice: ["main", "nuit", "serum"], distinct: true, surcharge: "difference" } }] }],
      extras: [{ id: "g-wrap", kind: "text", name: "Emballage cadeau", scope: ["duo", "trio"], options: [{ id: "o-no", label: "Non" }, { id: "o-yes", label: "Oui", delta: 15 }] }],
      orderBump: { enabled: true, title: "Ajoutez le sérum", price: 99, item: "serum", offers: ["one", "duo"] },
    },
  });
  eq("distinct: the same item twice → duplicate on the later unit", fieldsOf(v2(any2, "any2", [{ item: "main" }, { item: "main" }])), { "u.1.@item": "duplicate" });
  const diff = v2(any2, "any2", [{ item: "main" }, { item: "serum" }]);
  ok("distinct: two different items ok", diff.ok, fieldsOf(diff));
  if (diff.ok) {
    eq("difference: Jour + Sérum = 329", diff.value.totals.total, 32900);
    eq("difference: reason row", diff.value.items.reasons, [{ label: "Sérum", count: 1, amount: 50 }]);
  }
  eq("extras in scope are required (choice)", fieldsOf(v2(any2, "duo", [{}, {}])), { "x.g-wrap": "required" });
  const wrap = v2(any2, "duo", [{}, {}], { extras: { "g-wrap": "o-yes" } });
  ok("extras: chosen", wrap.ok && wrap.value.totals.total === 24900 + 1500, fieldsOf(wrap));
  if (wrap.ok) eq("extras: order segment", orderText(wrap.value.items), "1 × Jour + 1 × Nuit || Commande : Emballage cadeau = Oui (+15)");
  ok("extras out of scope are ignored", v2(any2, "one", [{ item: "main" }], { extras: { "g-wrap": "o-yes" } }).ok);
  eq("extras: an unknown option → invalid", fieldsOf(v2(any2, "duo", [{}, {}], { extras: { "g-wrap": "o-maybe" } })), { "x.g-wrap": "invalid" });
  const bump = v2(any2, "duo", [{}, {}], { extras: { "g-wrap": "o-no" }, bump: true });
  ok("bump item with the offer", bump.ok && bump.value.totals.bump === 9900 && bump.value.items.bump?.unit?.item === "serum", fieldsOf(bump));
  if (bump.ok) eq("bump: text marker", orderText(bump.value.items), "1 × Jour + 1 × Nuit + [AJOUT] 1 × Sérum || Commande : Emballage cadeau = Non");
  const noBump = v2(any2, "trio", [{}, {}, {}], { extras: { "g-wrap": "o-no" }, bump: true });
  ok("bump not offered with this offer: ignored", noBump.ok && noBump.value.totals.bump === 0, fieldsOf(noBump));
}

const tshirt = getFixture("tshirt").doc;
{
  const cell = (col: string, sz: string) => ({ o: { "g-fit": `d-size=o-${sz}|d-col=o-${col}` } });
  const okNoirM = v2(tshirt, "x1", [cell("noir", "m")]);
  ok("matrix: a valid combination (any key order)", okNoirM.ok, fieldsOf(okNoirM));
  if (okNoirM.ok) {
    eq("matrix: snapshot value / code / sku", [okNoirM.value.units[0]!.options[0], okNoirM.value.units[0]!.sku], [{ name: "Couleur & taille", value: "Noir/M", code: "NR/M" }, "TS"]);
    eq("matrix: warehouse text uses codes", orderText(okNoirM.value.items), "NR/M");
    eq("matrix: customer text uses labels", orderText(okNoirM.value.items, { mode: "customer" }), "Noir/M");
    eq("matrix: compat variants per dim", okNoirM.value.items.variants, [{ Couleur: "Noir", Taille: "M" }]);
  }
  eq("matrix: an out combination → unavailable", fieldsOf(v2(tshirt, "x1", [cell("noir", "xl")])), { "u.0.g-fit": "unavailable" });
  eq("matrix: a combination not made → invalid", fieldsOf(v2(tshirt, "x1", [cell("blanc", "s")])), { "u.0.g-fit": "invalid" });
  const blancM = v2(tshirt, "x1", [cell("blanc", "m")]);
  eq("matrix: the cell's sku", blancM.ok && blancM.value.units[0]!.sku, "TS-BL-M");
  const blancXl = v2(tshirt, "x1", [cell("blanc", "xl")]);
  eq("matrix: value delta (XL +20)", blancXl.ok && [blancXl.value.totals.total, blancXl.value.items.reasons], [14900, [{ label: "XL", count: 1, amount: 20 }]]);
  eq("matrix: a missing dim → required", fieldsOf(v2(tshirt, "x1", [{ o: { "g-fit": "d-col=o-noir" } }])), { "u.0.g-fit": "required" });
  eq("matrix: nothing chosen → required", fieldsOf(v2(tshirt, "x1", [{}])), { "u.0.g-fit": "required" });
  eq("matrix: an unknown value → invalid", fieldsOf(v2(tshirt, "x1", [{ o: { "g-fit": "d-col=o-rouge|d-size=o-m" } }])), { "u.0.g-fit": "invalid" });
  eq("matrix: a malformed value → invalid", fieldsOf(v2(tshirt, "x1", [{ o: { "g-fit": "noir" } }])), { "u.0.g-fit": "invalid" });
  const name = v2(tshirt, "x1", [{ ...cell("noir", "m"), f: { "g-name": "  Sara​ " } }]);
  ok("field: cleaned value (+30)", name.ok && name.value.units[0]!.fields?.[0]?.value === "Sara" && name.value.totals.total === 15900, fieldsOf(name));
  if (name.ok) eq("field: text in « »", orderText(name.value.items), "NR/M · Prénom à imprimer « Sara »");
  ok("field: Arabic letters", v2(tshirt, "x1", [{ ...cell("noir", "m"), f: { "g-name": "سارة" } }]).ok);
  eq("field: markup → invalid", fieldsOf(v2(tshirt, "x1", [{ ...cell("noir", "m"), f: { "g-name": "<b>Sara" } }])), { "u.0.g-name": "invalid" });
  eq("field: digits in a letters field → invalid", fieldsOf(v2(tshirt, "x1", [{ ...cell("noir", "m"), f: { "g-name": "Sara1" } }])), { "u.0.g-name": "invalid" });
  eq("field: 13 letters (max 12) → too_long", fieldsOf(v2(tshirt, "x1", [{ ...cell("noir", "m"), f: { "g-name": "Abcdefghijklm" } }])), { "u.0.g-name": "too_long" });
  ok("field: optional and empty → no delta", (() => {
    const r = v2(tshirt, "x1", [{ ...cell("noir", "m"), f: { "g-name": "   " } }]);
    return r.ok && r.value.totals.total === 12900 && !r.value.units[0]!.fields;
  })());
  const two = v2(tshirt, "x2", [cell("noir", "m"), cell("gris", "l")]);
  ok("x2: two units", two.ok && two.value.items.qty === 2, fieldsOf(two));
  if (two.ok) eq("x2: text", orderText(two.value.items), "NR/M + GR/L");
  eq("x2: errors keyed per unit", fieldsOf(v2(tshirt, "x2", [cell("noir", "m"), cell("noir", "xl")])), { "u.1.g-fit": "unavailable" });
}

const colors = getFixture("colors", { locale: "fr" }).doc;
{
  const sz = (s: string, col?: string) => ({ o: { "g-fit": col ? `d-col=o-${col}|d-size=o-${s}` : `d-size=o-${s}` } });
  const pack = v2(colors, "colors", [sz("m", "blanc"), sz("m"), sz("l")]);
  ok("locks: the locked color is the server's (payload ignored)", pack.ok, fieldsOf(pack));
  if (pack.ok) eq("locks: Noir, Blanc, Gris", pack.value.units.map((u) => u.options[0]!.value), ["Noir/M", "Blanc/M", "Gris/L"]);
  eq("locks: Blanc + S is not made → invalid", fieldsOf(v2(colors, "colors", [sz("m"), sz("s"), sz("m")])), { "u.1.g-fit": "invalid" });
  eq("locks: Noir + XL is out → unavailable", fieldsOf(v2(colors, "colors", [sz("xl"), sz("m"), sz("m")])), { "u.0.g-fit": "unavailable" });
  eq("allow: a color outside the list → invalid", fieldsOf(v2(colors, "x3-promo", [sz("m", "blanc"), sz("m", "noir"), sz("m", "gris")])), { "u.0.g-fit": "invalid" });
  const promo = v2(colors, "x3-promo", [sz("m", "noir"), sz("xl", "gris"), sz("l", "gris")]);
  ok("allow: allowed colors ok (+20 for XL)", promo.ok && promo.value.totals.total === 29900 + 2000, fieldsOf(promo));
}

// shared groups (perUnit: false) on a v2 payload: read from the first unit of the item, key s.<item>.<gid>
{
  const doc = v1Doc([{ ...color, perUnit: false }, size]);
  const r = v2(doc, "x2", [{ o: { color: "beige", size: "sz-s" } }, { o: { color: "noir", size: "sz-m" } }]);
  ok("shared: the first unit's value for every unit", r.ok && r.value.items.variants.map((u) => u.Couleur).join() === "Beige,Beige", fieldsOf(r));
  eq("shared: missing → s.main.<gid>", fieldsOf(v2(doc, "x2", [{ o: { size: "sz-s" } }, { o: { color: "noir", size: "sz-m" } }])), { "s.main.color": "required" });
}

console.warn = warn;
ok("a total that differs from the one shown is logged (current version)", parityLogs.some((l) => l.startsWith("[orders] parity mismatch on offer trio: shown 1, server 34900")));

/* 6 · versions ----------------------------------------------------------- */
{
  const now = Date.parse("2026-10-16T12:00:00Z");
  const h = 3600_000;
  const at = (hoursAgo: number) => new Date(now - hoursAgo * h);
  const rows = [
    { id: "V1OLD", createdAt: at(200), runtimeV: 1 },
    { id: "V1NEW", createdAt: at(100), runtimeV: 1 },
    { id: "V2A", createdAt: at(80), runtimeV: 2 },
    { id: "V2B", createdAt: at(10), runtimeV: 2 },
  ];
  eq("v2: ver = current", chooseOrderVersion("V2B", rows, { v: 2, ver: "V2B" }, now), { versionId: "V2B", fallback: false });
  eq("v2: replaced 10 h ago → that version", chooseOrderVersion("V2B", rows, { v: 2, ver: "V2A" }, now), { versionId: "V2A", fallback: false });
  eq("v2: replaced 80 h ago → current + fallback", chooseOrderVersion("V2B", rows, { v: 2, ver: "V1NEW" }, now), { versionId: "V2B", fallback: true });
  eq("v2: unknown ver → current + fallback", chooseOrderVersion("V2B", rows, { v: 2, ver: "NOPE" }, now), { versionId: "V2B", fallback: true });
  eq("v2: no ver → current + fallback", chooseOrderVersion("V2B", rows, { v: 2 }, now), { versionId: "V2B", fallback: true });
  eq("v1: the newest v1 version, replaced 80 h ago → current + fallback", chooseOrderVersion("V2B", rows, {}, now), { versionId: "V2B", fallback: true });
  eq("v1: the newest v1 version replaced < 72 h → it", chooseOrderVersion("V2A", [...rows.slice(0, 2), { id: "V2A", createdAt: at(20), runtimeV: 2 }], {}, now), { versionId: "V1NEW", fallback: false });
  eq("v1: current is v1 → current", chooseOrderVersion("V1NEW", rows.slice(0, 2), {}, now), { versionId: "V1NEW", fallback: false });
  eq("v1: no v1 version → current + fallback", chooseOrderVersion("V2B", rows.slice(2), {}, now), { versionId: "V2B", fallback: true });
  eq("the window is 72 h", STALE_WINDOW_MS, 72 * h);
}

/* 7 · customer fields per scope ------------------------------------------- */
{
  // test scopes: the seam mints the real ones (src/lib/tenancy/seam.ts); only `kind` and `storeId` are read here
  const scopeOf = (kind: StoreScope["kind"]) => Object.freeze({ storeId: "0000000000000000000000000A", kind }) as unknown as StoreScope;
  const row = {
    id: "MA-7KQ2XW",
    name: "Salma Benali",
    phone: "+212612345634",
    city: "Casablanca",
    address: "12 rue des Orangers",
    note: "Appeler après 18 h",
    email: "salma@example.com",
    total: 299,
  };
  for (const kind of ["member", "public", "system", "platform"] as const) {
    eq(`mask: ${kind} scope → the row unchanged`, maskCustomer(scopeOf(kind), row), row);
  }
  const masked = maskCustomer(scopeOf("impersonation"), row);
  eq("mask: impersonation → name, phone, address, note, e-mail masked; city and the rest kept", masked, {
    ...row,
    name: "Salma B.",
    phone: "+2126 ••••••34",
    address: "Casablanca · address hidden",
    note: "Hidden",
    email: "Hidden",
  });
  ok("mask: no canary survives impersonation", !JSON.stringify(masked).includes("Benali") && !JSON.stringify(masked).includes("612345634") && !JSON.stringify(masked).includes("Orangers"));
  eq("mask: a partial row keeps its shape (blocklist phone)", maskCustomer(scopeOf("impersonation"), { phone: "+212612345634" }), { phone: "+2126 ••••••34" });
  eq("mask: null fields stay null", maskCustomer(scopeOf("impersonation"), { name: null, phone: null, email: null }), { name: null, phone: null, email: null });
}

async function asyncChecks() {
  const raw = JSON.parse(JSON.stringify({ ...getFixture("argan").doc }));
  raw.theme.texture = "paper"; // a retired value: PageDoc refuses it, validateDoc migrates it
  const silence = console.error;
  console.error = () => undefined;
  const doc = await orderDocOf(raw, "VTEST");
  const broken = await orderDocOf({ v: 2, nope: true }, "VBROKEN");
  console.error = silence;
  eq("versionDoc: a repairable doc is repaired, never refused", !!doc && doc.theme.texture === "archetype", true);
  eq("versionDoc: an unrecoverable doc → null", broken, null);
  const v1raw = { v: 1, locale: "fr", market: "MA", currency: "MAD", product: { name: "Robe", price: 199 }, offers: { bundles: [{ id: "x1", qty: 1, price: 199 }] }, form, theme, sections: [] };
  const up = await orderDocOf(v1raw, "VV1");
  eq("versionDoc: a v1 JSON version reads as v2", up && [up.v, up.items[0]!.id, up.offers.bundles[0]!.lines[0]!.qty], [2, "main", 1]);
}

asyncChecks()
  .catch((err) => failures.push(`async checks threw: ${err instanceof Error ? err.stack : String(err)}`))
  .finally(() => {
    console.log(`orders selftest: ${passes} passed, ${failures.length} failed`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(failures.length ? 1 : 0);
  });
