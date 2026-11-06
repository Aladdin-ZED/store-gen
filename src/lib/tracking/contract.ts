/**
 * The order tracking contract (P3 LANDING; landing.md LAN-§9.2, §9.3, LD8, LD9). Isomorphic: the server builds and
 * answers with these shapes, the `track` add-on chunk posts `TrackRequest` bodies, the thank-you's `assist-ty` posts
 * the `intent`.
 *
 *   TrackRequest.safeParse(body)      lookup | proof | signed | request | intent (zod v4, the API's only input)
 *   TrackView                         what a shopper may see: never a full phone, an address, a note, an e-mail,
 *                                     another order, an agent's name, an internal note or a risk score
 *   TrackResponse                     { ok: true, view?, s? } | { ok: false, error } (every refusal of a lookup,
 *                                     a proof or another store's order is the same `not_found`)
 *
 * Three proofs open an order (LD8): the signed link `?o=&s=` agents send, the thank-you's proof link (`?o=` and the
 * order's idem in the URL fragment, posted as `k`), and the lookup (order number + the last 4 digits of the phone).
 * A successful proof or lookup answers `s`, the order's signed link parameter, so the page reloads at the signed
 * address and the server renders the status (the browser never builds the view itself).
 */
import { z } from "zod";

/** The timeline's steps (LAN-§9.2): `cancelled` is one neutral word for cancelled, fake and duplicate orders. */
export const TRACK_STEP_IDS = ["placed", "confirmed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"] as const;
export type TrackStepId = (typeof TRACK_STEP_IDS)[number];

/** What a shopper may ask from the tracking page; the order itself never changes (LD9). */
export const TRACK_REQUEST_KINDS = ["change_address", "change_phone", "cancel", "other"] as const;
export type TrackRequestKind = (typeof TRACK_REQUEST_KINDS)[number];

/** The kinds the page offers as buttons, in order (`change_phone` stays an API kind without a button). */
export const TRACK_REQUEST_BUTTONS = ["change_address", "cancel", "other"] as const satisfies readonly TrackRequestKind[];

export interface TrackStep {
  id: TrackStepId;
  /** ISO instant of the first event of the transition (null: the step is ahead, or the time is unknown) */
  at: string | null;
  done: boolean;
}

export interface TrackView {
  orderId: string;
  placedAt: string;
  firstName: string | null;
  /** "•• •• 12 34": the last 4 digits only */
  maskedPhone: string;
  /** the customer-facing order text (src/lib/orders/text.ts), never the address */
  summary: { offer: string; units: string; total: string };
  steps: TrackStep[];
  current: TrackStepId;
  /** the delivery window: after the call from `confirmed_at`, before it the pre-call window from `created_at` (LAN-§7.2) */
  eta: { text: string; confirmedOn?: string } | null;
  /** R1: `orders.carrier_label` / `orders.tracking_ref` (typed by the agent or pulled from the Sheet) */
  carrier: { name: string; ref: string | null; url: string | null } | null;
  canRequest: { changeAddress: boolean; cancel: boolean; other: boolean };
  pending: TrackRequestKind[];
  help: { whatsapp?: string; phone?: string; hours?: string };
  rightsLine: string | null;
}

/** "CMD-7K3Q9X": 2 to 8 capitals, a dash, 4 to 11 base-36 capitals (orders.id ≤ 20, D28) */
export const ORDER_ID_RE = /^[A-Z]{2,8}-[0-9A-Z]{4,11}$/;
/** the order's idempotency key (uuid v4, `orders.idem`): the thank-you proof */
export const IDEM_RE = /^[a-f0-9-]{36}$/;
/** the `s` of a signed link: "<exp base36>.<sig 22>" (src/lib/tenancy/public.ts signTrackLink) */
export const SIGNED_RE = /^[0-9a-z]{1,11}\.[A-Za-z0-9_-]{22}$/;

export const OrderId = z.string().regex(ORDER_ID_RE);
export const Idem = z.string().regex(IDEM_RE);
export const SignedS = z.string().regex(SIGNED_RE);
export const Last4 = z.string().regex(/^\d{4}$/);

/** How a request proves the order: the proof key, the signed parameter or the last 4 digits. */
export type TrackAuth = { k: string } | { s: string } | { last4: string };
export const TrackAuthSchema = z.union([z.object({ k: Idem }).strict(), z.object({ s: SignedS }).strict(), z.object({ last4: Last4 }).strict()]);

export const TrackRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("lookup"), o: OrderId, last4: Last4 }),
  z.object({ op: z.literal("proof"), o: OrderId, k: Idem }),
  z.object({ op: z.literal("signed"), o: OrderId, s: SignedS }),
  z.object({ op: z.literal("request"), o: OrderId, auth: TrackAuthSchema, kind: z.enum(TRACK_REQUEST_KINDS), text: z.string().trim().max(300).optional() }),
  z.object({ op: z.literal("intent"), o: OrderId, k: Idem, kind: z.literal("confirm_whatsapp") }),
]);
export type TrackRequest = z.infer<typeof TrackRequest>;

export type TrackError = "not_found" | "rate_limited" | "invalid" | "closed";
/** `s`: the signed link parameter of the order, answered to a lookup or a proof (the page reloads at that address). */
export type TrackResponse = { ok: true; view?: TrackView; s?: string } | { ok: false; error: TrackError };

/** The `lp-track` data block the document hands the `track` chunk (strings already in the page language). */
export interface TrackData {
  /** the API (relative: every host the store owns serves it) */
  ep: string;
  /** the document's own path ("<base>/track"), where a proven order reloads with `?o=&s=` */
  path: string;
  /** the order of a view (signed documents), else absent */
  o?: string;
  s?: string;
  msg: { notFound: string; rateLimited: string; closed: string; error: string; sent: string; requested: string };
}
