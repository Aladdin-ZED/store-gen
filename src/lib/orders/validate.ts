/**
 * Server-side order validation against the version of the page the shopper saw (src/lib/orders/
 * resolve.ts orderVersion): offer, units (item choosers, options, combinations, typed fields, line
 * rules), extras, bump item, phone, name, city, address, email, note (docs/OFFERS.md §G.2). Prices
 * are recomputed with orderTotals() in integer cents — client totals never count.
 *
 *   validateOrder(payload, doc, { fallback })   v1 and v2 payloads (v1: `variants`, error keys v.*)
 *   resolveSelection(doc, offer, input)         the units / extras / bump part (shared rules: page/options.ts)
 */
import type { OrderItems, OrderUnit } from "@/lib/db/schema";
import { findCity, getMarket } from "@/lib/markets";
import { normalizePhone } from "@/lib/markets/phone";
import type { NormalizedPhone } from "@/lib/markets/types";
import { expandUnits, itemName, offerAvailable, offerSheetLabel } from "@/lib/page/catalog";
import {
  availableCombos,
  availableOptions,
  checkField,
  cleanText,
  dimRules,
  parseCellKey,
  resolveCombo,
  ruleAllows,
  ruleLock,
  type Combo,
} from "@/lib/page/options";
import { bumpOffered, effectiveFree, fromCents, orderTotals, toCents, type OrderTotals, type Selection, type UnitChoice } from "@/lib/page/pricing";
import { landingZoneFee, type ZoneFee } from "@/lib/catalog/delivery";
import { isChoiceGroup, isFieldGroup, isMatrixGroup, LOCALES, type ChoiceGroup, type ExtraGroup, type FieldGroup, type Item, type LineRule, type MatrixGroup, type Offer, type OptionGroup, type PageDoc } from "@/lib/page/schema";
import { isPayloadV2, toSelectionInput, type OrderPayload, type SelectionInput, type UnitError, type UnitFieldKey, type UnitIn, type VariantError, type VariantFieldKey } from "./contract";
import { orderUnitOf } from "./text";

export type OrderField = "name" | "phone" | "city" | "address" | "email" | "bundleId";
/** Field error codes (the runtime shows its own localized message per field). */
export type FieldError = "required" | "invalid" | "unavailable" | "too_long";

export interface ValidOrder {
  /** the offer ordered (`bundle`: v1 name) */
  offer: Offer;
  bundle: Offer;
  selection: Selection;
  /** integer cents */
  totals: OrderTotals;
  items: OrderItems;
  units: OrderUnit[];
  phone: NormalizedPhone;
  phoneRaw: string;
  name: string;
  city: string | null;
  address: string | null;
  note: string | null;
  email: string | null;
  locale: string;
}

/** Field errors: delivery fields and offer, plus one entry per unit / group / extra in error (v1 payloads: v.* keys). */
export type ValidationFields = Partial<Record<OrderField, FieldError>> & { [k: VariantFieldKey]: VariantError | undefined } & {
  [k: UnitFieldKey]: UnitError | undefined;
};

export type ValidationResult = { ok: true; value: ValidOrder } | { ok: false; fields: ValidationFields; stale?: true };

/** Trim, NFC, drop control & bidi-override characters, collapse whitespace, cap at `max` UTF-16 units. */
export function cleanInput(v: string | null | undefined, max: number): string {
  return cleanText(v).slice(0, max);
}

const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} '’.\-]*$/u;
const LETTER = /\p{L}/gu;

/** Customer name: ≥ 2 letters (Arabic, Latin… any script), no digits or symbols. */
export function validName(raw: string): string | null {
  const name = cleanInput(raw, 80);
  if (!NAME_CHARS.test(name)) return null;
  if ((name.match(LETTER) ?? []).length < 2) return null;
  return name;
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

interface KeyedError {
  key: string;
  code: UnitError;
  /** v1 ordering (group-major, like v1 resolveVariants): group index, unit index */
  gi: number;
  k: number;
}

export interface ResolvedSelection {
  selection: Selection;
  /** snapshots of the units (free flags, labels, codes), in unit order */
  units: OrderUnit[];
  bumpUnit?: OrderUnit;
  errors: KeyedError[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A choice group's value: rules (lock = the server's value; allow = subset), required / invalid / unavailable; single available auto-filled. */
function resolveChoice(g: ChoiceGroup, wanted: string, rule: LineRule | undefined): { value: string } | { error: UnitError } {
  const lock = ruleLock(rule);
  if (lock) {
    const o = g.options.find((x) => x.id === lock);
    return !o ? { error: "invalid" } : o.soldOut ? { error: "unavailable" } : { value: lock };
  }
  if (!wanted) {
    const avail = availableOptions(g, rule ? { [g.id]: rule } : undefined);
    return avail.length === 1 ? { value: avail[0]!.id } : { error: "required" };
  }
  const o = g.options.find((x) => x.id === wanted);
  if (!o || !ruleAllows(rule, o.id)) return { error: "invalid" };
  if (o.soldOut) return { error: "unavailable" };
  return { value: o.id };
}

/** A matrix value "dim=value|dim=value" (any order) + the line's dim rules → a canonical cell key. */
function resolveMatrix(g: MatrixGroup, item: Item, raw: string, rules: Record<string, LineRule> | undefined): { value: string } | { error: UnitError } {
  const r = g.perUnit ? dimRules(g, rules) : {};
  let combo: Combo = {};
  if (raw) {
    const parsed = parseCellKey(raw);
    if (!parsed) return { error: "invalid" };
    for (const [dim, value] of Object.entries(parsed)) {
      const d = g.dims.find((x) => x.id === dim);
      if (!d || !d.values.some((v) => v.id === value)) return { error: "invalid" };
    }
    combo = parsed;
  }
  for (const d of g.dims) {
    const lock = ruleLock(r[d.id]);
    if (lock) combo[d.id] = lock; // locked dims: the server's value (payload ignored)
    else if (combo[d.id] !== undefined && !ruleAllows(r[d.id], combo[d.id]!)) return { error: "invalid" };
  }
  // a dim left empty with a single possible value (given the others) is filled in
  const missing = g.dims.filter((d) => combo[d.id] === undefined);
  if (missing.length) {
    const fits = availableCombos(g, g.perUnit ? rules : undefined, item).filter((c) => g.dims.every((d) => combo[d.id] === undefined || c.values.find((x) => x.dim.id === d.id)?.value.id === combo[d.id]));
    for (const d of missing) {
      const ids = new Set(fits.map((c) => c.values.find((x) => x.dim.id === d.id)!.value.id));
      if (ids.size === 1) combo[d.id] = [...ids][0]!;
    }
  }
  if (g.dims.some((d) => combo[d.id] === undefined)) return { error: "required" };
  const res = resolveCombo(g, combo, item);
  if (!res) return { error: "invalid" };
  if (res.state === "out") return { error: "unavailable" };
  if (res.state === "none") return { error: "invalid" };
  return { value: res.key };
}

/** One group of a unit (or of the bump item / an extra) against its input. */
function resolveGroup(g: OptionGroup | ExtraGroup, item: Item | null, src: UnitIn | undefined, rules: Record<string, LineRule> | undefined): { value?: string; field?: string } | { error: UnitError } {
  if (isChoiceGroup(g)) {
    const r = resolveChoice(g, str(src?.o[g.id]), g.perUnit ? rules?.[g.id] : undefined);
    return "error" in r ? r : { value: r.value };
  }
  if (isMatrixGroup(g)) {
    const r = resolveMatrix(g, item!, str(src?.o[g.id]), rules);
    return "error" in r ? r : { value: r.value };
  }
  const r = checkField(g as FieldGroup, src?.f[g.id]);
  return r.ok ? (r.value ? { field: r.value } : {}) : { error: r.error };
}

/**
 * The units, extras and bump of an order against the offer (§G.2). Locked values are the server's,
 * shared groups (perUnit: false) are read from the first unit of the item, unknown group ids and
 * extra units in the payload are ignored.
 */
export function resolveSelection(doc: Pick<PageDoc, "items" | "offers" | "product">, offer: Offer, input: SelectionInput): ResolvedSelection {
  const byId = new Map(doc.items.map((it) => [it.id, it]));
  const slots = expandUnits(offer, doc.items);
  const errors: KeyedError[] = [];
  const units: UnitChoice[] = [];
  const snaps: OrderUnit[] = [];
  const firstOf = new Map<string, number>();
  const chosenInLine = new Map<string, Set<string>>();

  slots.forEach((slot, k) => {
    const u = input.units[k];
    let itemId = slot.item;
    if (!itemId) {
      // item chooser of a choice unit
      const wanted = str(u?.item);
      const key = `u.${k}.@item`;
      let error: UnitError | null = null;
      const available = slot.available ?? [];
      if (!wanted) {
        if (available.length === 1) itemId = available[0]!;
        else error = available.length ? "required" : "unavailable";
      } else if (!slot.choices?.includes(wanted)) error = "invalid";
      else if (!available.includes(wanted)) error = "unavailable";
      else if (slot.distinct && chosenInLine.get(slot.lineId)?.has(wanted)) error = "duplicate";
      else itemId = wanted;
      if (error) {
        errors.push({ key, code: error, gi: -1, k });
        units.push({ item: wanted, options: {}, fields: {} });
        return;
      }
      const seen = chosenInLine.get(slot.lineId) ?? new Set<string>();
      seen.add(itemId!);
      chosenInLine.set(slot.lineId, seen);
    }
    const item = byId.get(itemId!)!;
    if (!firstOf.has(item.id)) firstOf.set(item.id, k);
    const k0 = firstOf.get(item.id)!;
    const choice: UnitChoice = { item: item.id, options: {}, fields: {} };
    let ok = true;
    item.groups.forEach((g, gi) => {
      if (!g.perUnit && k !== k0) {
        // shared group: one value for every unit of this item (resolved on its first unit)
        const first = units[k0];
        if (first?.options[g.id] !== undefined) choice.options[g.id] = first.options[g.id]!;
        if (first?.fields[g.id] !== undefined) choice.fields[g.id] = first.fields[g.id]!;
        return;
      }
      const src = g.perUnit ? u : input.units[k0];
      const key = g.perUnit ? `u.${k}.${g.id}` : `s.${item.id}.${g.id}`;
      const r = resolveGroup(g, item, src, g.perUnit ? slot.rules : undefined);
      if ("error" in r) {
        ok = false;
        errors.push({ key, code: r.error, gi, k: g.perUnit ? k : -1 });
        return;
      }
      if (r.value !== undefined) choice.options[g.id] = r.value;
      if (r.field !== undefined) choice.fields[g.id] = r.field;
    });
    units.push(choice);
    if (ok) snaps.push(orderUnitOf(doc, item, choice, slot.free));
  });

  // order extras whose scope holds the offer (others ignored)
  const extras: Record<string, string> = {};
  doc.offers.extras.forEach((x, xi) => {
    if (x.scope !== "all" && !x.scope.includes(offer.id)) return;
    const value = input.extras[x.id];
    const r = resolveGroup(x, null, { o: { [x.id]: str(value) }, f: { [x.id]: str(value) } }, undefined);
    if ("error" in r) errors.push({ key: `x.${x.id}`, code: r.error, gi: 1000 + xi, k: -1 });
    else if (r.value !== undefined) extras[x.id] = r.value;
    else if (r.field !== undefined) extras[x.id] = r.field;
  });

  // bump: a catalog item collects its options (perUnit ignored, no rules); bump options never add deltas
  const bump = input.bump && bumpOffered(doc, offer.id);
  let bumpChoice: UnitChoice | undefined;
  let bumpUnit: OrderUnit | undefined;
  const bumpItem = bump && doc.offers.orderBump?.item ? byId.get(doc.offers.orderBump.item) : undefined;
  if (bumpItem) {
    bumpChoice = { item: bumpItem.id, options: {}, fields: {} };
    let ok = true;
    bumpItem.groups.forEach((g, gi) => {
      const r = resolveGroup({ ...g, perUnit: true } as OptionGroup, bumpItem, input.b, undefined);
      if ("error" in r) {
        ok = false;
        errors.push({ key: `b.${g.id}`, code: r.error, gi: 2000 + gi, k: -1 });
        return;
      }
      if (r.value !== undefined) bumpChoice!.options[g.id] = r.value;
      if (r.field !== undefined) bumpChoice!.fields[g.id] = r.field;
    });
    if (ok) bumpUnit = orderUnitOf(doc, bumpItem, bumpChoice, true);
    // the bump's price is the price on its checkbox: its options are recorded, never charged
    if (bumpUnit) delete bumpUnit.free;
  }

  return {
    selection: { offerId: offer.id, units, extras, bump, ...(bumpChoice ? { bumpUnit: bumpChoice } : {}) },
    units: snaps,
    ...(bumpUnit ? { bumpUnit } : {}),
    errors,
  };
}

/** v2 error key → the v1 control name ("u.1.color" → "v.1.color", "s.main.color" → "v.color"). */
function v1Key(key: string): string | null {
  const m = /^u\.(\d{1,2})\.([A-Za-z0-9_-]{2,40})$/.exec(key);
  if (m) return `v.${m[1]}.${m[2]}`;
  const s = /^s\.[a-z0-9-]+\.([A-Za-z0-9_-]{2,40})$/.exec(key);
  if (s) return `v.${s[1]}`;
  return null;
}

/** v1 compat record of one unit: { groupName: label, …, fieldName: value } (+ "Article" on multi-item pages); repeated names kept apart. */
function compatRecord(doc: Pick<PageDoc, "items" | "product">, item: Item, unit: UnitChoice): Record<string, string> {
  const rec: Record<string, string> = {};
  const seen = new Map<string, number>();
  const put = (name: string, value: string) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    rec[n > 1 ? `${name} (${n})` : name] = value;
  };
  if (doc.items.length > 1) put("Article", itemName(doc, item));
  for (const g of item.groups) {
    if (isChoiceGroup(g)) {
      const o = g.options.find((x) => x.id === unit.options[g.id]);
      if (o) put(g.name, o.label);
    } else if (isMatrixGroup(g)) {
      const combo = unit.options[g.id] ? parseCellKey(unit.options[g.id]!) : null;
      const res = combo ? resolveCombo(g, combo, item) : null;
      for (const x of res?.values ?? []) put(x.dim.name, x.value.label);
    } else if (isFieldGroup(g) && unit.fields[g.id]) put(g.name, unit.fields[g.id]!);
  }
  return rec;
}

/* ------------------------------------------------------------------ */
/* Order                                                               */
/* ------------------------------------------------------------------ */

export interface ValidateOptions {
  /**
   * The doc is the CURRENT version although the shopper may have seen another one (resolve.ts
   * orderVersion: replaced > 72 h ago, unknown `ver`): any offer / unit error, or a total that differs
   * from the one shown (v2 `st`), answers "stale" so the page reloads.
   */
  fallback?: boolean;
  /**
   * LP-16 (core D75, R2 contract step C2-B2): the version is `runtime_v = 3` ("charge delivery by city"): the delivery
   * is `landingZoneFee` over the shopper's zone (src/lib/render/landing-v3.server.ts `landingShippingZone`) instead of
   * the flat page fee, with today's stale and compare rules. Absent: today's rule.
   */
  zone?: { zone: ZoneFee | null };
}

/** The totals with LP-16's zone delivery (`opts.zone`), or the totals as `orderTotals` priced them. */
export function zonedTotals(doc: PageDoc, offer: Offer, totals: OrderTotals, zone: { zone: ZoneFee | null } | undefined): OrderTotals {
  if (!zone) return totals;
  const shipping = landingZoneFee({ zone: zone.zone, pageFeeCents: toCents(doc.offers.shippingFee), subtotalCents: totals.subtotal, allLinesFree: effectiveFree(doc, offer) });
  return { ...totals, shipping, total: totals.subtotal + shipping };
}

export function validateOrder(p: OrderPayload, doc: PageDoc, opts: ValidateOptions = {}): ValidationResult {
  const fields: Record<string, string> = {};
  const form = doc.form;
  const v2 = isPayloadV2(p);
  const input = toSelectionInput(p);

  const offer = doc.offers.bundles.find((b) => b.id === input.offerId);
  if (!offer) fields.bundleId = "invalid";
  else if (!offerAvailable(offer, doc.items)) fields.bundleId = "unavailable";

  let resolved: ResolvedSelection | null = null;
  if (offer && !fields.bundleId) {
    resolved = resolveSelection(doc, offer, input);
    const errs = v2 ? resolved.errors : [...resolved.errors].sort((a, b) => a.gi - b.gi || a.k - b.k);
    for (const e of errs) {
      if (v2) fields[e.key] ??= e.code;
      else {
        // v1 payloads keep their v1 keys (the old runtime marks "v.<unit>.<gid>" / "v.<gid>")
        const key = v1Key(e.key);
        if (key) fields[key] ??= e.code;
        else fields.bundleId ??= "invalid";
      }
    }
  }
  const priced = resolved && offer ? orderTotals(doc, resolved.selection) : null;
  const totals = priced && offer ? zonedTotals(doc, offer, priced, opts.zone) : null;

  // the page the shopper saw is gone: any offer or unit error, or another total → reload ("stale")
  if (opts.fallback) {
    const unitErr = Object.keys(fields).some((k) => k === "bundleId" || /^[usxb]\./.test(k));
    if (unitErr || (v2 && totals && totals.total !== p.st)) return { ok: false, fields: fields as ValidationFields, stale: true };
  } else if (v2 && totals && !Object.keys(fields).length && totals.total !== p.st) {
    console.warn(`[orders] parity mismatch on offer ${offer!.id}: shown ${p.st}, server ${totals.total} (server total wins)`);
  }

  const name = validName(p.name);
  if (!name) fields.name = cleanInput(p.name, 80) ? "invalid" : "required";

  const phoneRaw = cleanInput(p.phone, 40);
  const phone = normalizePhone(p.phone, form.phoneCountry);
  if (!phone) fields.phone = phoneRaw ? "invalid" : "required";

  let city: string | null = null;
  if (form.city !== "hidden") {
    const cityIn = cleanInput(p.city, 80);
    const market = getMarket(doc.market);
    if (form.city === "select" && market.cities) {
      const match = findCity(market.code, cityIn);
      if (match) city = match.value;
      else fields.city = cityIn ? "invalid" : "required";
    } else if ((cityIn.match(LETTER) ?? []).length >= 2) {
      city = cityIn;
    } else {
      fields.city = cityIn ? "invalid" : "required";
    }
  }

  let address: string | null = null;
  if (form.address !== "hidden") {
    const addr = cleanInput(p.address, 240);
    // "other city" means the locality lives in the address line
    const required = form.address === "required" || city === "Autre";
    if (addr.length >= 4) address = addr;
    else if (required) fields.address = addr ? "invalid" : "required";
    else address = addr || null;
  }

  let email: string | null = null;
  if (form.email !== "hidden") {
    const mail = cleanInput(p.email, 120).toLowerCase();
    if (mail) email = mail;
    else if (form.email === "required") fields.email = "required";
  }

  const note = form.note === "hidden" ? null : cleanInput(p.note, 300) || null;

  if (Object.keys(fields).length || !offer || !resolved || !totals || !name || !phone) return { ok: false, fields: fields as ValidationFields };

  const locale = p.locale && (LOCALES as readonly string[]).includes(p.locale) ? p.locale : doc.locale;
  const byId = new Map(doc.items.map((it) => [it.id, it]));
  const slots = expandUnits(offer, doc.items);
  const anyGroups = slots.some((s, k) => (byId.get(resolved.selection.units[k]?.item ?? s.item ?? "")?.groups.length ?? 0) > 0);
  const variants = doc.items.length > 1 || anyGroups ? resolved.selection.units.map((u) => compatRecord(doc, byId.get(u.item)!, u)) : [];
  const extras: NonNullable<OrderItems["extras"]> = [];
  for (const x of doc.offers.extras) {
    const value = resolved.selection.extras[x.id];
    if (value === undefined || value === "") continue;
    if (isChoiceGroup(x)) {
      const o = x.options.find((c) => c.id === value);
      if (o) extras.push({ name: x.name, value: o.label, ...(o.code ? { code: o.code } : {}), ...(o.delta ? { delta: o.delta } : {}) });
    } else extras.push({ name: x.name, value, typed: true, ...(x.delta ? { delta: x.delta } : {}) });
  }
  const bump = doc.offers.orderBump;
  const items: OrderItems = {
    v: 2,
    bundleId: offer.id,
    bundleLabel: offerSheetLabel(doc, offer),
    qty: totals.offer.units,
    // effective price per unit inside the chosen offer (v1 meaning)
    unitPrice: fromCents(Math.round((totals.offer.price + totals.deltas) / Math.max(1, totals.offer.units))),
    variants,
    units: resolved.units,
    ...(extras.length ? { extras } : {}),
    ...(offer.gift ? { gift: { label: offer.gift.label } } : {}),
    price: fromCents(totals.offer.price),
    deltas: fromCents(totals.deltas),
    ...(totals.reasons.length ? { reasons: totals.reasons.map((r) => ({ label: r.label, count: r.count, amount: fromCents(r.cents) })) } : {}),
    ...(totals.bump > 0 && bump ? { bump: { title: bump.title, price: fromCents(totals.bump), ...(resolved.bumpUnit ? { unit: resolved.bumpUnit } : {}) } } : {}),
  };
  return {
    ok: true,
    value: { offer, bundle: offer, selection: resolved.selection, totals, items, units: resolved.units, phone, phoneRaw, name, city, address, note, email, locale },
  };
}
