/**
 * The order hand-off between the landing form and the thank-you page (sessionStorage "lp-order", or
 * "lp:<handle>:order" on a store page under /s/<handle>, core skey): survives a refresh of the thank-you page.
 * Read back defensively: storage is user-controlled, so every field is type-checked and bounded (≤ 22 groups
 * × 4 parts × 40 characters).
 */
import type { W } from "./core";
import { sget, skey, sset } from "./core";

/** The storage key name (core skey: "lp-order" outside /s/<handle>). */
export const ORDER_KEY = "order";
export const ORDER_ID_RE = /^[A-Za-z0-9-]{4,40}$/;

/** One line of the order as the thank-you page draws it: identical units counted. */
export interface OrderGroup {
  n: number;
  /** item name (multi-item pages), the gift label, the bump item */
  item?: string;
  parts: { label: string; sw?: string }[];
  fields?: { name: string; value: string }[];
  free?: true;
  /** "gift": a non-catalog gift · "bump": the order bump · "extra": a page extra (item = its name) */
  k?: "gift" | "bump" | "extra";
  /** pixel content id ("" for gifts and extras: no content of their own) */
  cid: string;
  /** price of one unit of the group (cents, allocation of the offer price); an extra: its surcharge */
  p?: number;
}

export interface OrderRecord {
  orderId: string;
  name: string;
  /** money (the server's total) */
  total: number;
  currency: string;
  bundleLabel: string;
  /** human line for [data-ty="items"]: offer label (+ order bump title) */
  items: string;
  /** units incl. free ones (+ the bump) */
  qty: number;
  groups?: OrderGroup[];
  upsellToken?: string;
  eventId: string;
  /** epoch ms the order was confirmed (upsell window start) */
  ts: number;
  pageKey: string;
  upsell?: "added" | "declined";
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
const SW = /^#[0-9a-fA-F]{6}$/;

/** Stored groups, bounded and type-checked. */
function groups(v: unknown): OrderGroup[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: OrderGroup[] = [];
  for (const g of v.slice(0, 22) as Record<string, unknown>[]) {
    if (!g || typeof g !== "object") continue;
    const parts = (Array.isArray(g.parts) ? (g.parts.slice(0, 4) as { label?: unknown; sw?: unknown }[]) : [])
      .filter((p) => p && typeof p.label === "string" && p.label)
      .map((p) => (typeof p.sw === "string" && SW.test(p.sw) ? { label: s(p.label, 40), sw: p.sw } : { label: s(p.label, 40) }));
    const fields = (Array.isArray(g.fields) ? (g.fields.slice(0, 4) as { name?: unknown; value?: unknown }[]) : [])
      .filter((f) => f && typeof f.name === "string" && typeof f.value === "string" && f.value)
      .map((f) => ({ name: s(f.name, 40), value: s(f.value, 60) }));
    const item = s(g.item, 60);
    if (!parts.length && !fields.length && !item && g.free !== true) continue;
    const o: OrderGroup = { n: Math.min(20, Math.max(1, Math.floor(n(g.n)) || 1)), parts, cid: s(g.cid, 120) };
    if (item) o.item = item;
    if (fields.length) o.fields = fields;
    if (g.free === true) o.free = true;
    if (g.k === "gift" || g.k === "bump" || g.k === "extra") o.k = g.k;
    if (n(g.p) > 0) o.p = Math.round(n(g.p));
    out.push(o);
  }
  return out.length ? out : undefined;
}

export function readOrder(win: W): OrderRecord | null {
  try {
    const o = JSON.parse(sget(win, "sessionStorage", skey(win, ORDER_KEY)) || "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || typeof o.orderId !== "string" || !ORDER_ID_RE.test(o.orderId)) return null;
    const token = s(o.upsellToken, 128);
    return {
      orderId: o.orderId,
      name: s(o.name, 80),
      total: n(o.total),
      currency: /^[A-Z]{3}$/.test(s(o.currency, 3)) ? s(o.currency, 3) : "",
      bundleLabel: s(o.bundleLabel, 120),
      items: s(o.items, 240),
      qty: Math.max(1, Math.floor(n(o.qty)) || 1),
      groups: groups(o.groups),
      upsellToken: /^[a-zA-Z0-9_-]{16,128}$/.test(token) ? token : undefined,
      eventId: s(o.eventId, 64),
      ts: n(o.ts),
      pageKey: s(o.pageKey, 80),
      upsell: o.upsell === "added" || o.upsell === "declined" ? o.upsell : undefined,
    };
  } catch {
    return null;
  }
}

export function writeOrder(win: W, rec: OrderRecord): boolean {
  return sset(win, "sessionStorage", skey(win, ORDER_KEY), JSON.stringify(rec));
}
