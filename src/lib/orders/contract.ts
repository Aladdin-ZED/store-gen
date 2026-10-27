/**
 * Public order API contract — shared by the landing runtime (client), the Next.js route handlers,
 * and mirrored by the exported standalone order.php (`cod_parse_payload`).
 *
 * Two payload versions (docs/OFFERS.md §G.1), dispatched on `v` BEFORE parsing (no z.union):
 *   v absent → OrderPayloadV1 (published v1 pages, exports, old tabs: forever) — `variants` per unit;
 *   v === 2  → OrderPayloadV2 — `units` (item + options + fields), `extras`, `b` (bump item), `ver`
 *              (the publish version the page was rendered from) and `st` (the total shown, cents).
 * A v2-shaped body without `v` never parses as v1 (`units` / `extras` must be absent there).
 */
import { z } from "zod";

const S = (max: number) => z.string().trim().max(max);

export const Utm = z
  .object({
    source: S(120),
    medium: S(120),
    campaign: S(200),
    content: S(200),
    term: S(200),
    fbclid: S(500),
    ttclid: S(500),
    sccid: S(500),
    gclid: S(500),
  })
  .partial();

/** Ids of offers, groups, options, dims (schema `Id`). */
export const ID_RE = /^[A-Za-z0-9_-]{2,40}$/;
/** Item ids (schema `ItemId`). */
export const ITEM_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
/** Publish version ids (ULID). */
export const VERSION_RE = /^[A-Za-z0-9]{26}$/;

const PageKey = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);
const Idem = z.string().regex(/^[a-f0-9-]{36}$/);
const BundleId = z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/);

/** Fields every payload version shares (= the v1 fields, minus `variants`). */
const Base = z.object({
  /** live pages: page public key; exports: export key */
  pageKey: PageKey,
  /** idempotency key generated when the form is first touched (uuid v4) */
  idem: Idem,
  /** shared with pixels for dedup (browser Purchase ↔ server events) */
  eventId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
  bundleId: BundleId,
  bump: z.boolean().default(false),
  name: S(80).pipe(z.string().min(2)),
  phone: S(24).pipe(z.string().min(6)),
  city: S(80).optional(),
  address: S(240).optional(),
  note: S(300).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  /** honeypot — must be empty */
  website: z.string().max(0).optional().or(z.literal("")),
  /** ms between first interaction and submit (bots submit instantly) */
  t: z.number().int().min(0).max(86_400_000),
  utm: Utm.default({}),
  fbp: S(200).optional(),
  fbc: S(500).optional(),
  ttp: S(200).optional(),
  /** page URL the order came from (for exports: their domain) */
  ref: S(500).optional(),
  locale: z.string().max(5).optional(),
  /** Cloudflare Turnstile token (required only when the page embeds a site key) */
  cf: z.string().max(2048).optional(),
});

/** One unit of a v2 payload: the chosen item (choice units), options and typed fields. */
export const UnitIn = z
  .object({
    /** required for choice units; ignored for fixed ones */
    item: z.string().regex(ITEM_RE).optional(),
    /** choice option id | matrix "dim=value|dim=value" (any order; locked dims may be omitted) */
    o: z.record(z.string().regex(ID_RE), z.string().max(250)).default({}),
    /** field values (the server re-cleans and re-checks them) */
    f: z.record(z.string().regex(ID_RE), z.string().max(240)).default({}),
  })
  .refine((u) => Object.keys(u.o).length <= 8 && Object.keys(u.f).length <= 4);
export type UnitIn = z.infer<typeof UnitIn>;

export const OrderPayloadV2 = Base.extend({
  v: z.literal(2),
  /** publish version the page was rendered from (absent in exports) */
  ver: z.string().regex(VERSION_RE).optional(),
  /** total shown on the submit button, cents */
  st: z.number().int().min(0).max(1_000_000_000),
  units: z.array(UnitIn).max(20).default([]),
  extras: z
    .record(z.string().regex(ID_RE), z.string().max(240))
    .default({})
    .refine((x) => Object.keys(x).length <= 4),
  /** the bump item's options */
  b: UnitIn.optional(),
});
export type OrderPayloadV2 = z.infer<typeof OrderPayloadV2>;

export const OrderPayloadV1 = Base.extend({
  /** per unit: { groupId: optionId } */
  variants: z.array(z.record(z.string().max(40), z.string().max(40))).max(20).default([]),
  // a v2-shaped body without `v` never parses as v1
  units: z.undefined().optional(),
  extras: z.undefined().optional(),
});
export type OrderPayloadV1 = z.infer<typeof OrderPayloadV1>;

export type OrderPayload = OrderPayloadV1 | OrderPayloadV2;
/** @deprecated one release: the v1 schema. Parse request bodies with parseOrderPayload (dispatch on `v`). */
export const OrderPayload = OrderPayloadV1;
export const isPayloadV2 = (p: OrderPayload): p is OrderPayloadV2 => (p as { v?: unknown }).v === 2;

/* ------------------------------------------------------------------ */
/* Field errors                                                        */
/* ------------------------------------------------------------------ */

/**
 * v1 field error key of one product option group, named like its form control: "v.<unit>.<groupId>"
 * (per-unit group, 0-based unit) or "v.<groupId>" (one choice shared by every unit). v1 payloads only.
 */
export type VariantFieldKey = `v.${string}`;
export const VARIANT_FIELD_RE = /^v\.(?:(\d{1,2})\.)?([A-Za-z0-9_-]{1,40})$/;
/** Option error codes: nothing chosen · an option the group does not have · a sold-out option. */
export type VariantError = "required" | "invalid" | "unavailable";

/**
 * v2 field error keys (docs/OFFERS.md §G.2, §J.2): the item chooser of unit k "u.<k>.@item", a
 * per-unit group "u.<k>.<gid>", a shared group "s.<itemId>.<gid>", an order extra "x.<gid>", a group
 * of the bump item "b.<gid>".
 */
export type UnitFieldKey = `u.${string}` | `s.${string}` | `x.${string}` | `b.${string}`;
export const UNIT_FIELD_RE = /^(?:u\.\d{1,2}\.(?:@item|[A-Za-z0-9_-]{2,40})|s\.[a-z0-9][a-z0-9-]{1,23}\.[A-Za-z0-9_-]{2,40}|x\.[A-Za-z0-9_-]{2,40}|b\.[A-Za-z0-9_-]{2,40})$/;
/** v2 error codes of units, groups, extras and the bump item. */
export type UnitError = "required" | "invalid" | "unavailable" | "too_long" | "duplicate";

/**
 * Form control names of the v2 runtime (§F.6, the server parses the same): "u.<k>.@item",
 * "u.<k>.<gid>", "u.<k>.<gid>.<dimId>" (linked matrix dim), "s.<itemId>.<gid>[.<dimId>]", "x.<gid>",
 * "b.<gid>[.<dimId>]". `@` never occurs in an id: there is no reserved group id.
 */
export const CONTROL_NAME_RE =
  /^(?:u\.\d{1,2}\.(?:@item|[A-Za-z0-9_-]{2,40}(?:\.[A-Za-z0-9_-]{2,40})?)|s\.[a-z0-9][a-z0-9-]{1,23}\.[A-Za-z0-9_-]{2,40}(?:\.[A-Za-z0-9_-]{2,40})?|x\.[A-Za-z0-9_-]{2,40}|b\.[A-Za-z0-9_-]{2,40}(?:\.[A-Za-z0-9_-]{2,40})?)$/;

/** Server field errors: the delivery fields, the offer, and one entry per unit / group / extra in error. */
export type OrderFieldErrors = Partial<Record<"name" | "phone" | "city" | "address" | "email" | "bundleId", string>> & {
  [k: VariantFieldKey]: string | undefined;
} & { [k: UnitFieldKey]: string | undefined };

export type OrderResponse =
  | {
      ok: true;
      orderId: string;
      /** signed token allowing the thank-you page to add the upsell to this order once */
      upsellToken?: string;
      total: number;
      currency: string;
    }
  | {
      ok: false;
      /** "stale": the page the shopper saw was replaced; the runtime reloads once and restores the form */
      error: "invalid" | "duplicate" | "rate_limited" | "blocked" | "unavailable" | "server" | "stale";
      fields?: OrderFieldErrors;
    };

const DELIVERY_FIELDS = new Set(["name", "phone", "city", "address", "email", "bundleId"]);

/** Zod issue path → the field key the runtime marks (null: no field of its own). */
function issueKey(path: readonly PropertyKey[]): string | null {
  const [a, b, c, d] = path.map(String);
  if (a === undefined) return null;
  if (DELIVERY_FIELDS.has(a)) return a;
  if (a === "units" && b !== undefined && /^\d{1,2}$/.test(b)) {
    if (c === "item") return `u.${b}.@item`;
    if ((c === "o" || c === "f") && d !== undefined && ID_RE.test(d)) return `u.${b}.${d}`;
    return null;
  }
  if (a === "extras" && b !== undefined && ID_RE.test(b)) return `x.${b}`;
  if (a === "b" && (b === "o" || b === "f") && c !== undefined && ID_RE.test(c)) return `b.${c}`;
  return null;
}

/**
 * Dispatch BEFORE parsing: raw.v === 2 → V2; raw.v absent → V1; anything else → invalid. Zod paths
 * become field keys (units.k.item → u.k.@item; units.k.o.gid / units.k.f.gid → u.k.gid; extras.gid →
 * x.gid; b.o.gid / b.f.gid → b.gid; delivery fields as today). A too-long text says "too_long".
 */
export function parseOrderPayload(
  raw: unknown,
): { ok: true; v: 1; data: OrderPayloadV1 } | { ok: true; v: 2; data: OrderPayloadV2 } | { ok: false; fields: OrderFieldErrors } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, fields: {} };
  const v = (raw as { v?: unknown }).v;
  const fail = (err: z.ZodError) => {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issueKey(issue.path);
      if (!key || fields[key]) continue;
      fields[key] = issue.code === "too_big" && (issue as { origin?: string }).origin === "string" ? "too_long" : "invalid";
    }
    return { ok: false as const, fields: fields as OrderFieldErrors };
  };
  if (v === 2) {
    const r = OrderPayloadV2.safeParse(raw);
    return r.success ? { ok: true, v: 2, data: r.data } : fail(r.error);
  }
  if (v === undefined) {
    const r = OrderPayloadV1.safeParse(raw);
    return r.success ? { ok: true, v: 1, data: r.data } : fail(r.error);
  }
  return { ok: false, fields: {} };
}

/** What the validation reads of a payload, whatever its version. */
export interface SelectionInput {
  offerId: string;
  units: UnitIn[];
  extras: Record<string, string>;
  bump: boolean;
  b?: UnitIn;
}

/** v1 → v2 view: units[u] = { o: variants[u] ?? variants[0] ?? {}, f: {} } (the v1 runtime sends one record per unit). */
export function toSelectionInput(p: OrderPayload): SelectionInput {
  if (isPayloadV2(p)) return { offerId: p.bundleId, units: p.units, extras: p.extras, bump: p.bump, ...(p.b ? { b: p.b } : {}) };
  // one entry per possible unit (offers hold at most 20); the validation reads the ones the offer has
  const units: UnitIn[] = [];
  for (let u = 0; u < 20; u++) units.push({ o: { ...(p.variants[u] ?? p.variants[0] ?? {}) }, f: {} });
  return { offerId: p.bundleId, units, extras: {}, bump: p.bump };
}

/**
 * The chosen product options of a v1 order as one line for people (v1 rows: OrderItems.variants).
 * Kept for v1 readers; v2 text lives in ./text.ts (unitsText / orderText), mirrored by order.php and
 * the runtime.
 */
export function variantText(units: readonly Record<string, string>[] | null | undefined): string {
  const counts = new Map<string, number>();
  for (const unit of units ?? []) {
    const text = Object.values(unit ?? {})
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .join("/");
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return Array.from(counts, ([text, n]) => (n > 1 ? `${n} × ${text}` : text)).join(" + ");
}

/* ------------------------------------------------------------------ */
/* Leads, upsell, events                                               */
/* ------------------------------------------------------------------ */

/** Abandoned-lead capture (sent once the phone becomes valid, debounced). Units / extras are tolerant: never an error. */
export const LeadPayload = z.object({
  pageKey: PageKey,
  idem: Idem,
  phone: S(24),
  name: S(80).optional(),
  city: S(80).optional(),
  bundleId: BundleId.optional(),
  utm: Utm.default({}),
  v: z.literal(2).optional().catch(undefined),
  ver: z.string().regex(VERSION_RE).optional().catch(undefined),
  /** each entry parsed with UnitIn.safeParse, bad entries dropped (leadUnits) */
  units: z.array(z.unknown()).max(20).optional().catch(undefined),
  extras: z.record(z.string(), z.unknown()).optional().catch(undefined),
});
export type LeadPayload = z.output<typeof LeadPayload>;

/** The lead's units that parse (bad entries dropped) and its string extras with valid ids. */
export function leadSelection(lead: Pick<LeadPayload, "units" | "extras">): { units: UnitIn[]; extras: Record<string, string> } {
  const units: UnitIn[] = [];
  for (const u of lead.units ?? []) {
    const r = UnitIn.safeParse(u);
    if (r.success) units.push(r.data);
  }
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(lead.extras ?? {})) {
    if (Object.keys(extras).length >= 4) break;
    if (ID_RE.test(k) && typeof v === "string" && v.length <= 240) extras[k] = v;
  }
  return { units, extras };
}

export const UpsellPayload = z.object({
  orderId: z.string().regex(/^[A-Z0-9-]{6,32}$/),
  token: z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/),
});

export type UpsellResponse =
  | { ok: true; orderId: string; total: number; currency: string }
  | { ok: false; error: "invalid" | "expired" | "rate_limited" | "server" };

/** Lightweight analytics beacon (navigator.sendBeacon, text/plain JSON). */
export const EventPayload = z.object({
  pageKey: PageKey,
  type: z.enum(["view", "form_start", "bundle_change", "cta_click"]),
  /** anonymous visitor id stored in localStorage (random, no PII) */
  vid: z.string().regex(/^[a-zA-Z0-9_-]{8,40}$/),
  bundleId: z.string().max(40).optional(),
  utm: Utm.default({}),
});

/**
 * Sheet / admin order statuses (French labels are what call-center agents see in Google Sheets). From R1 `status` is
 * the projection of the order's state axes (operations.md OPE-§3.3, `projectStatus` in src/lib/orders/state.ts). The
 * first nine rows never move; the last five are appended for P4 at P0 (OPE-§Q.2, Q.9a: the maintainer appends them,
 * so P4 needs no CCR).
 */
export const ORDER_STATUSES = [
  { id: "new", fr: "Nouvelle", color: "#E8F0FE" },
  { id: "confirmed", fr: "Confirmée", color: "#E6F4EA" },
  { id: "no_answer", fr: "Injoignable", color: "#FEF7E0" },
  { id: "callback", fr: "Reportée", color: "#F3E8FD" },
  { id: "shipped", fr: "Expédiée", color: "#E0F2F1" },
  { id: "delivered", fr: "Livrée", color: "#CEEAD6" },
  { id: "returned", fr: "Retournée", color: "#FCE8E6" },
  { id: "cancelled", fr: "Annulée", color: "#F1F3F4" },
  { id: "fake", fr: "Fausse commande", color: "#F6D6D3" },
  // R1 (OPE-§3.3): refused at the door; a closed duplicate; unreachable after the ladder ("Injoignable" stays no_answer's);
  // in transit or out for delivery; a lost parcel (not a return)
  { id: "refused", fr: "Refusée", color: "#F8D7DD" },
  { id: "duplicate", fr: "Doublon", color: "#ECEFF1" },
  { id: "unreachable", fr: "Injoignable clôturée", color: "#EDE7F6" },
  { id: "in_transit", fr: "En livraison", color: "#E0F7FA" },
  { id: "lost", fr: "Perdue", color: "#E8EAED" },
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number]["id"];
