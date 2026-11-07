/**
 * FROZEN CONTRACT: the public order API payload v3 and the stored `OrderItemsV3`, written by the R2 contract step
 * (C2-B1, maintainer; docs/STORE-SAAS.md §K.4, storefront.md STO-§16.1, §16.4, §15.11, §15.13; requests STO-R8,
 * ORD-19, ORD-20, LND-33). Owning track: S1 STOREFRONT (the store checkout chunks, `/api/public/store/{order,lead}`,
 * src/lib/catalog/order-v3.server.ts); S3 / S4 / S5 / S7 read `OrderItemsV3`. A track never edits this file: a change
 * goes through a CCR to the maintainer (docs/saas/ccr/README.md) and is re-frozen in src/lib/contracts/r2-contract.ts.
 * src/lib/orders/contract.ts (payloads v1 / v2) is not touched.
 *
 * Units (rev 3, ENGP-27): every amount of a v3 request and response is an INTEGER IN CENTS (`ls`, `dl`, `st`;
 * `totalCents`, `deliveryCents`, `subCents`, `lineCents`); the conversion to the decimal `orders.total` / `subtotal` /
 * `shipping` columns happens once, at storage (`cents / 100`, STO-§16.4).
 *
 * R2 planners' additions (C2-B1, S4's OP-06 merge, OPE-§9.4): an `OrderLineV3` may carry `src` (the landing page and
 * version a merged v2 order's pack was priced on; `productId` / `productKey` / `slug` are "" on such a line) and
 * `OrderItemsV3.surface` takes "merge". Additive: a storefront order never has `src` and never says "merge".
 */
import { z } from "zod";
import type { OrderItems } from "@/lib/db/schema";
import { UnitIn, Utm } from "./contract";

const Key = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
const Id = z.string().regex(/^[A-Za-z0-9_-]{2,40}$/);
const Ver = z.string().regex(/^[A-Za-z0-9]{26}$/);
const S = (n: number) => z.string().trim().max(n);
const Idem = z.string().regex(/^[a-f0-9-]{36}$/);

/* ------------------------------------------------------------------ */
/* the request (STO-§16.1)                                             */
/* ------------------------------------------------------------------ */

export const LineIn = z.object({
  /** products.public_key */
  pk: Key,
  /** products.rev the line was priced with */
  rev: Ver,
  bundleId: Id,
  units: z.array(UnitIn).max(20).default([]),
  extras: z
    .record(Id, z.string().max(240))
    .default({})
    .refine((x) => Object.keys(x).length <= 4),
  n: z.number().int().min(1).max(10).default(1),
  /** line subtotal shown: n × (price + deltas), cents */
  ls: z.number().int().min(0).max(1_000_000_000),
});
export type LineIn = z.infer<typeof LineIn>;

export const OrderPayloadV3 = z.object({
  v: z.literal(3),
  surface: z.enum(["pdp", "cart", "buy_now"]),
  /** pages.public_key of the template the checkout ran on */
  ctx: Key,
  idem: Idem,
  eventId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  lines: z.array(LineIn).min(1).max(20),
  /** stores.catalog_version the page was rendered with */
  cv: z.number().int().min(0),
  /** delivery shown, cents */
  dl: z.number().int().min(0).max(100_000_000),
  /** total shown, cents */
  st: z.number().int().min(0).max(1_000_000_000),
  name: S(80).pipe(z.string().min(2)),
  phone: S(24).pipe(z.string().min(6)),
  city: S(80).optional(),
  address: S(240).optional(),
  postal: S(12).optional(),
  note: S(300).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  wa: z.boolean().default(true),
  /** honeypot */
  website: z.string().max(0).optional().or(z.literal("")),
  t: z.number().int().min(0).max(86_400_000),
  utm: Utm.default({}),
  fbp: S(200).optional(),
  fbc: S(500).optional(),
  ttp: S(200).optional(),
  ref: S(500).optional(),
  locale: z.string().max(5).optional(),
  cf: z.string().max(2048).optional(),
  /** R3 (ST-14); ignored before */
  coupon: z
    .string()
    .regex(/^[A-Za-z0-9-]{3,32}$/)
    .optional(),
  /** rev 2: the session's test token (STO-D33); verified with resolveTestToken, never trusted as a flag */
  test: z.string().max(80).optional(),
});
export type OrderPayloadV3 = z.infer<typeof OrderPayloadV3>;

/* ------------------------------------------------------------------ */
/* field errors and the response                                       */
/* ------------------------------------------------------------------ */

/** `l.<i>` line-level codes; nested keys reuse the v2 unit keys under the line prefix. */
export type LineFieldKey = `l.${number}` | `l.${number}.n` | `l.${number}.bundleId` | `l.${number}.u.${string}` | `l.${number}.s.${string}` | `l.${number}.x.${string}`;
export type OrderFieldErrorsV3 = Partial<Record<"name" | "phone" | "city" | "address" | "postal" | "email" | "coupon", string>> & { [k: LineFieldKey]: string | undefined };

/**
 * Field error values: `required`, `invalid`, `unavailable`, `too_long`, `duplicate` (the v2 vocabulary) and, for
 * `l.<i>`, `changed` / `removed`.
 */
export type FieldErrorV3 = "required" | "invalid" | "unavailable" | "too_long" | "duplicate" | "changed" | "removed";

const DELIVERY_FIELDS_V3 = new Set(["name", "phone", "city", "address", "postal", "email", "coupon"]);
const LINE_ID = /^[A-Za-z0-9_-]{2,40}$/;

/** Zod issue path → the field key the runtime marks (null: no field of its own). */
function issueKeyV3(path: readonly PropertyKey[]): string | null {
  const [a, b, c, d, e, f] = path.map(String);
  if (a === undefined) return null;
  if (DELIVERY_FIELDS_V3.has(a)) return a;
  if (a !== "lines" || b === undefined || !/^\d{1,2}$/.test(b)) return null;
  const l = `l.${b}`;
  if (c === "n" || c === "bundleId") return `${l}.${c}`;
  if (c === "units" && d !== undefined && /^\d{1,2}$/.test(d)) {
    if (e === "item") return `${l}.u.${d}.@item`;
    if ((e === "o" || e === "f") && f !== undefined && LINE_ID.test(f)) return `${l}.u.${d}.${f}`;
    return l;
  }
  if (c === "extras" && d !== undefined && LINE_ID.test(d)) return `${l}.x.${d}`;
  return l;
}

/**
 * `raw.v === 3` → OrderPayloadV3; anything else is invalid (the v1 / v2 bodies go to `parseOrderPayload`). Zod paths
 * become field keys: lines.i.units.k.item → l.i.u.k.@item, lines.i.units.k.{o,f}.gid → l.i.u.k.gid, lines.i.extras.gid
 * → l.i.x.gid, lines.i.{n,bundleId} → l.i.n / l.i.bundleId, any other line path → l.i; the delivery fields as named.
 * A too-long text says "too_long". Unknown keys are stripped (forward compatibility, like v2).
 */
export function parseOrderPayloadV3(raw: unknown): { ok: true; data: OrderPayloadV3 } | { ok: false; fields: OrderFieldErrorsV3 } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || (raw as { v?: unknown }).v !== 3) return { ok: false, fields: {} };
  const r = OrderPayloadV3.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issueKeyV3(issue.path);
    if (!key || fields[key]) continue;
    fields[key] = issue.code === "too_big" && (issue as { origin?: string }).origin === "string" ? "too_long" : "invalid";
  }
  return { ok: false, fields: fields as OrderFieldErrorsV3 };
}

/** rev 3 (ENGP-27): every amount in a v3 response is an INTEGER IN CENTS, named with the `Cents` suffix. */
export interface LineVerdict {
  i: number;
  state: "ok" | "changed" | "unavailable" | "removed";
  subCents?: number;
  lineCents?: number;
  rev?: string;
  label?: string;
  text?: string;
}
export type OrderResponseV3 =
  | { ok: true; orderId: string; totalCents: number; deliveryCents: number; currency: string; lines: { i: number; subCents: number; lineCents: number }[]; track?: string; wa?: string; duplicate?: true }
  | { ok: false; error: "invalid" | "stale" | "not_served" | "rate_limited" | "blocked" | "unavailable" | "server"; fields?: OrderFieldErrorsV3; lines?: LineVerdict[]; deliveryCents?: number; totalCents?: number };

/* ------------------------------------------------------------------ */
/* abandoned checkouts and WhatsApp intents (STO-§15.11, §15.13)       */
/* ------------------------------------------------------------------ */

export const LeadPayloadV3 = z.object({
  v: z.literal(3),
  /** rev 2: "whatsapp" = a server-priced order intent (STO-§15.13) */
  kind: z.enum(["form", "whatsapp"]).default("form"),
  ctx: Key,
  idem: Idem,
  /** required for kind "form"; absent for "whatsapp" (leads.phone is NULL-able, core §D.2) */
  phone: S(24).optional(),
  name: S(80).optional(),
  city: S(80).optional(),
  /** tolerant: each parsed with LineIn.omit({ ls }).safeParse, bad entries dropped (leadLinesV3) */
  lines: z.array(z.unknown()).max(20).optional(),
  utm: Utm.default({}),
  locale: z.string().max(5).optional(),
  /** the session's test token (STO-D33) → leads.is_test */
  test: z.string().max(80).optional(),
});
export type LeadPayloadV3 = z.infer<typeof LeadPayloadV3>;

/** A lead line: `LineIn` without the shown subtotal. */
export const LeadLineIn = LineIn.omit({ ls: true });
export type LeadLineIn = z.infer<typeof LeadLineIn>;

/** The lead's lines that parse (bad entries dropped, never an error). */
export function leadLinesV3(lead: Pick<LeadPayloadV3, "lines">): LeadLineIn[] {
  const out: LeadLineIn[] = [];
  for (const l of lead.lines ?? []) {
    const r = LeadLineIn.safeParse(l);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** `kind = 'form'` always answers `{ ok: true }` (no oracle); a WhatsApp intent answers the server-priced text. */
export type LeadResponseV3 = { ok: true; wa?: { ref: string; number: string; text: string } } | { ok: false; error: "invalid" | "unavailable" | "rate_limited" };

/* ------------------------------------------------------------------ */
/* storage: OrderItemsV3 in orders.items (STO-§16.4, request STO-R8)   */
/* ------------------------------------------------------------------ */

/** The delivery fee rule that priced the order (STO-§15.9, STO-D10; `coupon` is R3). S1's src/lib/catalog/delivery.ts re-exports it. */
export type DeliveryRule = "free_offer" | "free_threshold" | "zone" | "fallback" | "coupon";

export interface OrderLineV3 {
  /** "" on a merged landing line (`src` set) */
  productId: string;
  productKey: string;
  slug: string;
  productName: string;
  rev: string;
  n: number;
  /** the v2 shape for ONE pack (bundleId, bundleLabel, qty, unitPrice, variants, units, extras, price, deltas, reasons) */
  pack: OrderItems;
  /** price + deltas of one pack */
  subCents: number;
  /** n × subCents */
  lineCents: number;
  /** S4 merge (OPE-§9.4): the landing page and version a merged v2 order's pack was priced on */
  src?: { pageId: string; versionId: string | null };
}

export interface OrderItemsV3 {
  v: 3;
  /** "merge": the kept order of an OP-06 merge (S4, OPE-§9.4) */
  surface: "pdp" | "cart" | "buy_now" | "merge";
  /** the template page the checkout ran on ("" for a merge) */
  ctxPageId: string;
  lines: OrderLineV3[];
  delivery: { cents: number; rule: DeliveryRule; zoneId?: string; zoneName?: string };
  /** R3 */
  discount?: { code: string; couponId: string; cents: number };
  contact: { whatsapp: boolean; postal?: string };
}

/** `orders.items` of any row, its guard and its v1 / v2 view: the zod-free module ./items-v3.ts (isomorphic readers import it). */
export { isItemsV3, orderItemsView, type AnyOrderItems } from "./items-v3";
