/**
 * The pricing fingerprint (P3 LANDING; landing.md LAN-§18.4, also the Campaign Kit's `offersHash`, LAN-§13.3; D3
 * reuses it in R3 for the experiments engine): sha256 over the canonical JSON of what decides a price, the first 16
 * hex characters. Inside it: the currency, every item (id, price, compare-at, SKU, its option groups' ids, deltas and
 * sold-out flags), every offer (id, price, lines with qty, item or choices and free, free delivery, sold out), the page
 * fee, the extras' option deltas, the order bump (price, item) and the upsell (price, item, window). Display axes, copy,
 * media and theme stay outside, so a new headline never marks a kit stale and a new price always does. Pure.
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/ai/prompts/text";
import type { PageDoc } from "@/lib/page/schema";

/** The keys of an option group (and of its options, dims, values and cells) that move a price or an availability. */
const GROUP_KEYS: ReadonlySet<string> = new Set(["id", "kind", "options", "dims", "values", "cells", "v", "delta", "soldOut", "required"]);

/** A group reduced to its pricing keys, recursively (labels, swatches and photos dropped). */
function pricingOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pricingOf);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (GROUP_KEYS.has(k)) out[k] = pricingOf(v);
  return out;
}

/** The fingerprint's input (exported for the tests: what is in, what is out). */
export function pricingProjection(doc: Pick<PageDoc, "currency" | "items" | "offers">) {
  const o = doc.offers;
  return {
    currency: doc.currency,
    items: doc.items.map((it) => ({ id: it.id, price: it.price, compareAt: it.compareAt ?? null, sku: it.sku ?? null, groups: pricingOf(it.groups), soldOut: it.soldOut })),
    bundles: o.bundles.map((b) => ({ id: b.id, price: b.price, lines: b.lines.map((l) => ({ qty: l.qty, pick: l.pick, free: l.free })), freeShipping: b.freeShipping, soldOut: b.soldOut })),
    shippingFee: o.shippingFee,
    extras: pricingOf(o.extras),
    orderBump: o.orderBump?.enabled ? { price: o.orderBump.price, item: o.orderBump.item ?? null } : null,
    upsell: o.upsell?.enabled ? { price: o.upsell.price, item: o.upsell.item ?? null, windowMinutes: o.upsell.windowMinutes } : null,
  };
}

/** 16 lowercase hex characters (LAN-§18.4). */
export function pricingFingerprint(doc: Pick<PageDoc, "currency" | "items" | "offers">): string {
  return createHash("sha256").update(canonicalJson(pricingProjection(doc))).digest("hex").slice(0, 16);
}
