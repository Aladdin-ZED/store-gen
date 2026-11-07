// proves: LP-11
/**
 * test:wa-price (P3 LANDING; landing.md LAN-§11.6, §25): `npm run test:wa-price` (tsx src/lib/wa-order/selftest.ts).
 * Pure, no database:
 *  1. every offer of the `duo`, `tshirt` and `colors` fixtures, completed with the first available values: the intent's
 *     total equals `orderTotals` of the same resolved selection (100 %), with and without the bump;
 *  2. a partial selection (one group left empty) names that group in `toConfirm` and prices the offer's real "from"
 *     total plus its delivery fee; an unknown offer falls back to the page's default offer;
 *  3. a tampered body (totals, prices, fees, currency) changes neither the price nor the message;
 *  4. the message: the reference always in it, ≤ 1,000 characters, its wa.me link ≤ 2,000 (a long Arabic template is
 *     cut, the reference kept); the owner's template gets every variable, `{eta_text}` empty without a zone;
 *  5. references: `WA-` + 6 Crockford characters, 10,000 draws without a forbidden letter.
 * Exits 1 on any failure.
 */
import { UnitIn, type SelectionInput } from "@/lib/orders/contract";
import { resolveSelection } from "@/lib/orders/validate";
import { expandUnits } from "@/lib/page/catalog";
import { getFixture, OFFER_FIXTURES } from "@/lib/page/fixtures";
import { availableCombos, availableOptions } from "@/lib/page/options";
import { bumpOffered, effectiveFree, offerMath, orderTotals, toCents } from "@/lib/page/pricing";
import { isChoiceGroup, isMatrixGroup, type Offer, type PageDoc } from "@/lib/page/schema";
import { WA_REF_RE, WA_TEXT_MAX, WA_URL_MAX, WaOrderRequest } from "./contract";
import { priceWaSelection } from "./price";
import { newWaRef } from "./ref";
import { waOrderText, waOrderValues } from "./text";

let failures = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failures++;
    console.log("  ✗", name, detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 400)}`);
  }
}

/** Every slot filled with the first available value (distinct items on distinct lines), the extras' first options. */
function complete(doc: PageDoc, offer: Offer): SelectionInput {
  const slots = expandUnits(offer, doc.items);
  const used = new Map<string, number>();
  const units: UnitIn[] = slots.map((s) => {
    let itemId = s.item;
    const u: UnitIn = { o: {}, f: {} };
    if (!itemId) {
      const n = used.get(s.lineId) ?? 0;
      used.set(s.lineId, n + 1);
      itemId = s.available?.[s.distinct ? n : 0] ?? null;
      if (itemId) u.item = itemId;
    }
    const item = doc.items.find((it) => it.id === itemId);
    for (const g of item?.groups ?? []) {
      const rules = g.perUnit ? s.rules : undefined;
      if (isChoiceGroup(g)) {
        const o = availableOptions(g, rules)[0];
        if (o) u.o[g.id] = o.id;
      } else if (isMatrixGroup(g)) {
        const c = availableCombos(g, rules, item).find((x) => x.state === "in");
        if (c) u.o[g.id] = c.key;
      } else u.f[g.id] = "Test";
    }
    return u;
  });
  const extras: Record<string, string> = {};
  for (const x of doc.offers.extras) {
    if (x.scope !== "all" && !x.scope.includes(offer.id)) continue;
    if (isChoiceGroup(x)) extras[x.id] = x.options.find((o) => !o.soldOut)?.id ?? "";
    else if (!isMatrixGroup(x)) extras[x.id] = "Test";
  }
  return { offerId: offer.id, units, extras, bump: false };
}

const req = (input: SelectionInput, extra: Record<string, unknown> = {}) =>
  WaOrderRequest.parse({ pageKey: "pk_test_0000", bundleId: input.offerId, bump: input.bump, units: input.units, extras: input.extras, ...extra });

console.log("test:wa-price");

/* 1. resolved selections price like orders */
let resolvedOffers = 0;
for (const name of OFFER_FIXTURES) {
  const { doc } = getFixture(name);
  for (const offer of doc.offers.bundles) {
    for (const bump of [false, true]) {
      if (bump && !bumpOffered(doc, offer.id)) continue;
      const input = { ...complete(doc, offer), bump };
      const r = resolveSelection(doc, offer, input);
      if (r.errors.length) {
        check(`${name}/${offer.id}: the first available values resolve`, false, r.errors);
        continue;
      }
      const want = orderTotals(doc, r.selection)!;
      const p = priceWaSelection(doc, req(input));
      check(`${name}/${offer.id}${bump ? "+bump" : ""}: total = orderTotals`, p.resolved && p.total === want.total && p.shipping === want.shipping && p.subtotal === want.subtotal, { p: [p.total, p.shipping], want: [want.total, want.shipping] });
      check(`${name}/${offer.id}: nothing to confirm`, p.toConfirm.length === 0, p.toConfirm);
      resolvedOffers++;
    }
  }
}
check("1. every fixture offer was priced", resolvedOffers >= 6, resolvedOffers);

/* 2. partial selections: the real "from" total, the groups named */
{
  let partials = 0;
  for (const name of OFFER_FIXTURES) {
    const { doc } = getFixture(name);
    for (const offer of doc.offers.bundles) {
      const input = complete(doc, offer);
      const k = input.units.findIndex((u) => Object.keys(u.o).length > 0);
      if (k < 0) continue;
      const gid = Object.keys(input.units[k]!.o)[0]!;
      const partial = { ...input, units: input.units.map((u, i) => (i === k ? { ...u, o: Object.fromEntries(Object.entries(u.o).filter(([g]) => g !== gid)) } : u)) };
      const r = resolveSelection(doc, offer, partial);
      if (!r.errors.length) continue; // a single available value fills itself in
      const p = priceWaSelection(doc, req(partial));
      const want = offerMath(doc, offer).from + (effectiveFree(doc, offer) ? 0 : toCents(doc.offers.shippingFee));
      const item = doc.items.find((it) => it.id === (input.units[k]!.item ?? expandUnits(offer, doc.items)[k]!.item));
      const gname = item?.groups.find((g) => g.id === gid)?.name;
      check(`${name}/${offer.id}: partial → the "from" total`, !p.resolved && p.total === want, { total: p.total, want });
      check(`${name}/${offer.id}: partial → "${gname}" to confirm`, !!gname && p.toConfirm.includes(gname), p.toConfirm);
      partials++;
    }
  }
  check("2. partial selections were exercised", partials >= 2, partials);
  const { doc } = getFixture("duo");
  const unknown = priceWaSelection(doc, WaOrderRequest.parse({ pageKey: "pk_test_0000", bundleId: "nope-offer" }));
  check("2. an unknown offer falls back to the default offer", doc.offers.bundles.some((o) => o.id === unknown.offer.id));
}

/* 3. a tampered body changes nothing */
{
  const { doc } = getFixture("tshirt");
  const offer = doc.offers.bundles[0]!;
  const input = complete(doc, offer);
  const forged = { total: 1, totalCents: 1, total_cents: 1, st: 1, price: 1, unitPrice: 1, subtotal: 1, shipping: 0, delivery: 0, fee: 0, currency: "EUR", prices: { [offer.id]: 1 } };
  const parsed = req(input, forged);
  check("3. the request schema keeps no price field", !Object.keys(parsed).some((k) => /price|total|fee|shipping|delivery|currency|^st$/i.test(k)), Object.keys(parsed));
  const a = priceWaSelection(doc, req(input));
  const b = priceWaSelection(doc, parsed);
  check("3. a tampered body cannot change the total", a.total === b.total && a.shipping === b.shipping, [a.total, b.total]);
  const ta = waOrderText({ doc, price: a, ref: "WA-7K3Q9X", number: "212600000000", template: null, etaText: "" });
  const tb = waOrderText({ doc, price: b, ref: "WA-7K3Q9X", number: "212600000000", template: null, etaText: "" });
  check("3. nor the message", ta.text === tb.text);
}

/* 4. the message */
{
  for (const name of OFFER_FIXTURES) {
    for (const locale of ["ar", "fr", "en"] as const) {
      const { doc } = getFixture(name, { locale });
      const p = priceWaSelection(doc, req(complete(doc, doc.offers.bundles[0]!)));
      const { text, url } = waOrderText({ doc, price: p, ref: "WA-7K3Q9X", number: "212600000000", template: null, etaText: "" });
      const total = waOrderValues({ doc, price: p, ref: "WA-7K3Q9X", etaText: "" }).total!;
      check(`4. ${name}/${locale}: composed message has the ref and the total`, text.includes("WA-7K3Q9X") && text.includes(total), text);
      check(`4. ${name}/${locale}: within the limits`, Array.from(text).length <= WA_TEXT_MAX && url.length <= WA_URL_MAX, [Array.from(text).length, url.length]);
      check(`4. ${name}/${locale}: no customer block`, !/\n\n/.test(text), text);
    }
  }
  const { doc } = getFixture("duo", { locale: "ar" });
  const p = priceWaSelection(doc, req(complete(doc, doc.offers.bundles[0]!)));
  const long = `${"السلام عليكم، بغيت نطلب {offer} بـ{total}. ".repeat(40)}`;
  const cut = waOrderText({ doc, price: p, ref: "WA-ABCDEF", number: "212600000000", template: long, etaText: "" });
  check("4. a long Arabic template is cut within 2,000 URL bytes, the ref kept", cut.url.length <= WA_URL_MAX && Array.from(cut.text).length <= WA_TEXT_MAX && cut.text.includes("WA-ABCDEF"), [cut.url.length, cut.text.slice(-30)]);
  const noRef = waOrderText({ doc, price: p, ref: "WA-ABCDEF", number: "212600000000", template: "{offer} {total}", etaText: "" });
  check("4. a template without {ref} still carries the ref", noRef.text.endsWith("WA-ABCDEF"), noRef.text);
  const all = waOrderText({ doc, price: p, ref: "WA-ABCDEF", number: "212600000000", template: "{offer}|{units}|{total}|{delivery}|{ref}|{product}[[|{options_to_confirm}]][[|{eta_text}]]", etaText: "" });
  check("4. every variable filled, empty blocks dropped", !/\{\w+\}/.test(all.text) && all.text.split("|").length === 6, all.text);
  const eta = waOrderText({ doc, price: p, ref: "WA-ABCDEF", number: "212600000000", template: "{offer}[[ · {eta_text}]]", etaText: "بين 12 و14 نونبر" });
  check("4. {eta_text} is the zone line when there is one", eta.text.includes("بين 12 و14 نونبر"), eta.text);
}

/* 5. references */
{
  const seen = new Set<string>();
  let bad = 0;
  for (let i = 0; i < 10_000; i++) {
    const r = newWaRef();
    if (!WA_REF_RE.test(r)) bad++;
    seen.add(r);
  }
  check("5. 10,000 refs match WA-[Crockford]{6}", bad === 0, bad);
  check("5. and barely collide", seen.size >= 9_990, seen.size);
}

console.log(failures ? `\n${failures} check(s) failed, ${passed} passed` : `\nall ${passed} checks passed`);
process.exit(failures ? 1 : 0);
