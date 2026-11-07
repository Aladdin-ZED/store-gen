import "server-only";
/**
 * The order timeline (P4 CALL CENTER; operations.md OPE-§2.2, §4.1; OP-02, R-D18; docs/STORE-SAAS.md §K.2 P0, LAN Q17).
 *
 *   catalog          `ORDER_EVENT_TYPES` (frozen at P0, append-only, ≤ 32 chars) and one zod meta schema per type
 *                    (≤ 2 KB serialised; never a token, an IP address or a user agent)
 *   appendEvents     the writer's door: the events of one transaction, validated, in the caller's handle
 *   appendOrderEvent the one door other tracks use outside a transition (P3's lead attribution, tracking-link opened,
 *                    kit share, zone_not_served, the shopper's requests); its meta is also refused when it carries a
 *                    phone number; it never changes `rev`
 *   orderTimeline    newest first, keyset on id, texts as `ops.tl.*` message refs in the reader's language, phones
 *                    masked at render, actor names resolved, every item through `maskIfImpersonation`
 *   notes            addNote, editNote (the author, within 5 minutes: a new `note` event `{ edited, of }`), hideNote
 *                    (managers: `note_hidden`, the text stays stored for the audit). Notes never bump `rev`.
 *
 * Agents read the timeline of the orders they can see (OD12, src/lib/callcenter/visibility.ts); another store's order,
 * an order the viewer cannot see and a missing id all answer alike (core §E.3 rule 3).
 */
import { desc, eq, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { brandName } from "@/lib/auth/platform-config";
import { viewerSeesOrder, type OrderViewer } from "@/lib/callcenter/visibility";
import { db } from "@/lib/db/client";
import { orderEvents, orders, users } from "@/lib/db/schema";
import { maskIfImpersonation } from "@/lib/platform/mask";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import type { Tx } from "./hooks";
import { maskPhonesIn } from "./masking";
import type { MessageRef } from "./risk-explain";
import { CANCEL_REASONS, RETURN_REASONS, type OrderActor } from "./state";

/** OPE-§2.2's catalog plus landing's two shopper events (LAN Q17); append-only. */
export const ORDER_EVENT_TYPES = [
  "created",
  "state_changed",
  "call_attempt",
  "delivery_rescue",
  "recall_requested",
  "hold_set",
  "tracking_set",
  "line_outcome", // R2 (OD51)
  "refunded", // R2 (OD59)
  "whatsapp_sent",
  "assigned",
  "unassigned",
  "claimed",
  "released",
  "lead_attributed",
  "track_opened",
  "zone_not_served",
  "kit_shared",
  "customer_request", // LAN-§9.3
  "customer_confirm_intent", // LAN-§8.3
  "field_edited",
  "note",
  "note_hidden",
  "phone_revealed",
  "duplicate_suspected",
  "duplicate_dismissed",
  "blocked",
  "priority_pinned",
  "external_rejected",
  "capi_sent",
  "capi_stale",
  "capi_failed",
  "undo",
  "manifest_exported", // the R1 Carrier CSV (OD55); the R2 manifest too
  "shipment_created", // R2 (S4)
  "carrier_status", // R2 (S4)
  "remitted", // R2 (S3)
  "merged", // R2 (S4)
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];
export const isOrderEventType = (v: unknown): v is OrderEventType => typeof v === "string" && (ORDER_EVENT_TYPES as readonly string[]).includes(v);

/* ------------------------------------------------------------------ */
/* meta schemas (OPE-§2.2)                                             */
/* ------------------------------------------------------------------ */

/** the serialised meta of one event, at most (OPE-§2.2) */
export const META_MAX_BYTES = 2048;
const ORDER_ID = z.string().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/);
const ID26 = z.string().regex(/^[0-9A-Z]{26}$/);
const ISO = z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
const CODE = z.string().regex(/^[a-z0-9_.:-]{1,32}$/);
const label = (max: number) => z.string().max(max);
const SOURCES = ["ui", "bulk", "outcome", "sheet", "carrier", "import", "api", "bot", "customer", "system"] as const;
const AXES = ["confirm", "ship", "money"] as const;
const OUTCOMES = ["confirmed", "no_answer", "busy", "switched_off", "wrong_number", "callback", "cancelled", "fake", "duplicate", "customer_informed", "reschedule", "cancel_recall"] as const;
/** A track other than P4 writes these (P3, P5, R2): any small flat object, still bounded, phone-free and secret-free. */
const OTHER = z.record(z.string().max(32), z.union([z.string().max(300), z.number(), z.boolean(), z.null(), z.array(z.union([z.string().max(80), z.number()])).max(20)]));
const loose = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

export const ORDER_EVENT_META = {
  created: z.strictObject({
    source: z.enum(["live", "export", "php", "manual", "api", "storefront", "whatsapp"]),
    pageId: label(26),
    versionId: label(26).nullable().optional(),
    totalCents: z.number().int(),
    risk: z.number().int().min(0).max(100),
    flags: z.array(CODE).max(24),
    test: z.literal(true).optional(),
    /** a lead an agent converted (OPE-§11.4) */
    leadId: ID26.optional(),
  }),
  state_changed: z.strictObject({
    axis: z.enum(AXES),
    source: z.enum(SOURCES),
    implied: z.literal(true).optional(),
    forced: z.literal(true).optional(),
    auto: z.literal(true).optional(),
    dueAt: ISO.optional(),
    duplicateOf: ORDER_ID.optional(),
    /** OD52: "at_delivery" = cash at the door (auto); "manual" = Mark cash received */
    settlement: z.enum(["at_delivery", "manual"]).optional(),
    collectedCents: z.number().int().min(0).optional(),
    shipAfter: ISO.nullable().optional(),
    inbound: z.literal(true).optional(),
    agentLabel: label(60).optional(),
    ref: label(80).optional(),
    deliveryLane: z.literal(true).optional(),
    rescueExhausted: z.literal(true).optional(),
    /** a compensating move of the undo window (OPE-§12.5) */
    undo: z.literal(true).optional(),
  }),
  call_attempt: z.strictObject({
    channel: z.enum(["call", "whatsapp"]),
    outcome: z.enum(OUTCOMES),
    attemptNo: z.number().int().min(0).max(255),
    nextDueAt: ISO.optional(),
    lane: z.literal("delivery").optional(),
    inbound: z.literal(true).optional(),
    /** the objection chip tapped before the outcome (OPE-§7.2), for the R3 script learner; an id, never a text */
    objectionId: z.string().regex(/^[a-z0-9_]{1,20}$/).optional(),
  }),
  delivery_rescue: z.strictObject({ outcome: z.enum(["customer_informed", "reschedule", "cancel_recall", "rescue_exhausted"]), shipAfter: ISO.optional(), attemptNo: z.number().int().min(0).max(255) }),
  recall_requested: z.strictObject({ reason: CODE, carrierNotified: z.boolean().optional() }),
  hold_set: z.strictObject({ shipAfter: ISO.nullable() }),
  tracking_set: z.strictObject({ trackingRef: label(64).nullable(), carrierLabel: label(60).nullable().optional() }),
  line_outcome: z.strictObject({ lines: z.array(z.strictObject({ i: z.number().int().min(0), state: z.enum(["delivered", "refused", "pending"]), qty: z.number().int().min(0) })).max(50), collectedCents: z.number().int().min(0) }),
  refunded: z.strictObject({ cents: z.number().int().min(1), method: z.enum(["cash", "transfer", "store_credit"]) }),
  whatsapp_sent: z.strictObject({ template: label(80), locale: label(5) }),
  assigned: z.strictObject({ to: ID26.optional(), by: z.enum(["rr", "manual", "rule", "claim", "inbound", "label_map"]), ruleId: label(26).optional() }),
  unassigned: z.strictObject({ to: ID26.optional(), by: z.enum(["rr", "manual", "rule", "claim", "inbound", "label_map"]), ruleId: label(26).optional() }),
  claimed: z.strictObject({ leaseUntil: ISO }),
  released: z.strictObject({ why: z.enum(["skip", "break", "manager", "outcome", "lease_expired", "store_state"]) }),
  lead_attributed: loose({ leadId: label(26).optional() }),
  track_opened: loose({ via: z.enum(["wa", "link"]).optional() }),
  zone_not_served: loose({ cityKey: label(40).nullable().optional() }),
  kit_shared: loose({ campaignId: label(26).optional() }),
  customer_request: loose({ kind: CODE.optional(), text: label(300).optional() }),
  customer_confirm_intent: loose({ kind: CODE.optional() }),
  field_edited: z.strictObject({
    fields: z.array(z.strictObject({ f: z.string().regex(/^[a-zA-Z_]{1,24}$/), before: label(300).nullable(), after: label(300).nullable() })).min(1).max(12),
    inTransit: z.literal(true).optional(),
    inbound: z.literal(true).optional(),
  }),
  note: z.strictObject({ edited: z.literal(true).optional(), of: z.number().int().positive().optional(), agentLabel: label(60).optional(), cellHash: z.string().regex(/^[0-9a-f]{8,64}$/).optional() }),
  note_hidden: z.strictObject({ of: z.number().int().positive() }),
  phone_revealed: loose({ why: z.enum(["call", "whatsapp", "view", "export", "manifest"]).optional() }),
  duplicate_suspected: z.strictObject({ of: z.array(ORDER_ID).min(1).max(5) }),
  duplicate_dismissed: z.strictObject({ of: z.array(ORDER_ID).min(1).max(5) }),
  blocked: z.strictObject({ kind: z.enum(["phone", "ip"]) }),
  priority_pinned: z.strictObject({ pinned: z.boolean() }),
  external_rejected: z.strictObject({ source: z.enum(SOURCES), wanted: label(24), why: CODE, ref: label(80).optional() }),
  capi_sent: OTHER,
  capi_stale: OTHER,
  capi_failed: OTHER,
  undo: z.strictObject({ of: z.array(z.number().int().positive()).min(1).max(20) }),
  manifest_exported: OTHER,
  shipment_created: OTHER,
  carrier_status: OTHER,
  remitted: OTHER,
  merged: OTHER,
} as const satisfies Record<OrderEventType, z.ZodType>;

/** Keys a meta may never carry, at any depth (OPE-§2.2: tokens, IP addresses, user agents). */
const SECRET_KEY = /token|secret|password|^ip$|^ip[A-Z_]|^ips?$|user_?agent|^ua$/i;

function secretKeys(v: unknown, path = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => secretKeys(x, `${path}[${i}]`));
  if (!v || typeof v !== "object") return [];
  return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (SECRET_KEY.test(k) ? [`${path}.${k}`] : secretKeys(x, `${path}.${k}`)));
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap(strings);
  return [];
}

/** True when a string of the meta carries a phone number (E.164, international or Moroccan national forms). */
export function metaHasPhone(meta: unknown): boolean {
  return strings(meta).some((s) => maskPhonesIn(s, "MA") !== s);
}

/** The meta as stored (null when empty), or the reason it is refused. */
export function checkMeta(type: OrderEventType, meta: Record<string, unknown> | null | undefined): { ok: true; meta: Record<string, unknown> | null } | { ok: false; why: string } {
  const parsed = ORDER_EVENT_META[type].safeParse(meta ?? {});
  if (!parsed.success) return { ok: false, why: `schema: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  // undefined members dropped, so an all-undefined meta stores as NULL
  const value = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
  const bad = secretKeys(value);
  if (bad.length) return { ok: false, why: `forbidden key ${bad[0]}` };
  if (Object.keys(value).length === 0) return { ok: true, meta: null };
  if (Buffer.byteLength(JSON.stringify(value)) > META_MAX_BYTES) return { ok: false, why: "over 2 KB" };
  return { ok: true, meta: value };
}

/* ------------------------------------------------------------------ */
/* writing                                                             */
/* ------------------------------------------------------------------ */

/** One event as the writers build it; the store comes from the scope only. */
export interface NewOrderEvent {
  orderId: string;
  actorKind: OrderActor["kind"] | "platform";
  actorId?: string | null;
  type: OrderEventType;
  fromState?: string | null;
  toState?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  meta?: Record<string, unknown> | null;
  /** the order's rev after this event; null for events that do not change the order */
  rev?: number | null;
  at?: Date;
}

/** The database handle a writer passes: the transaction of its write, or the pool. */
export type EventDb = Tx | typeof db;

const NOTE_MAX = 500;
const cut = (s: string | null | undefined, n: number) => (s == null ? null : Array.from(s).slice(0, n).join(""));

/**
 * Appends events in the caller's transaction (or on the pool) and answers their ids, in order. Each meta is checked
 * against its type's schema; a refused meta is a programming error of the caller and throws (the transaction rolls
 * back). Phones are not checked here: `field_edited` stores E.164 values by design and renders them masked.
 */
export async function appendEvents(tx: EventDb, scope: WriteScope, events: readonly NewOrderEvent[]): Promise<number[]> {
  const ids: number[] = [];
  for (const e of events) {
    if (!isOrderEventType(e.type)) throw new Error(`order_events: unknown type "${String(e.type)}"`);
    const meta = checkMeta(e.type, e.meta);
    if (!meta.ok) throw new Error(`order_events: ${e.type} meta refused (${meta.why})`);
    const [res] = await tx.insert(orderEvents).values(
      storeValues(scope, {
        orderId: e.orderId,
        // Date.now() (not `new Date()`): a test's fake clock reaches the event times too
        at: e.at ?? new Date(Date.now()),
        actorKind: e.actorKind,
        actorId: e.actorId ?? null,
        type: e.type,
        fromState: cut(e.fromState, 24),
        toState: cut(e.toState, 24),
        reasonCode: cut(e.reasonCode, 32),
        note: cut(e.note, NOTE_MAX),
        meta: meta.meta,
        rev: e.rev ?? null,
      }),
    );
    ids.push(Number((res as { insertId: number | string }).insertId));
  }
  return ids;
}

/**
 * The order's rescue calls so far (OD48, OPE-§6.1a, §L "rescue calls per order"): its `call_attempt` events of the
 * delivery lane, whatever their outcome. `transitionOrder` reads it when a carrier reports another failed attempt
 * (back in the lane while calls < `rescue.maxCalls`), the outcome to decide when the lane is exhausted, the card for
 * "Rescue calls left". P4 step 3: counted from the attempts rather than from `delivery_rescue` (OPE-§3.2's wording),
 * because a no-answer rescue call writes no `delivery_rescue` (its meta enum has no such outcome), so counting those
 * would let a customer who never answers be called forever.
 */
export async function countRescueCalls(tx: EventDb, scope: StoreScope, orderId: string): Promise<number> {
  const [n] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orderId), eq(orderEvents.type, "call_attempt"), sql`JSON_VALUE(${orderEvents.meta}, '$.lane') = 'delivery'`));
  return Number(n?.n ?? 0);
}

export interface AppendOrderEventInput {
  actorKind: OrderActor["kind"];
  actorId?: string | null;
  type: OrderEventType;
  reasonCode?: string;
  note?: string;
  /** zod-validated (≤ 2 KB); E.164 and national phone patterns are refused (`bad_meta`) */
  meta?: Record<string, unknown>;
}
export type AppendOrderEventResult = { ok: true; id: number } | { ok: false; error: "not_found" | "bad_type" | "bad_meta" };

const ACTOR_KINDS: ReadonlySet<string> = new Set(["user", "system", "api", "bot", "customer", "sheet", "carrier", "integration", "reconciliation"]);

/** One event outside a transition; never changes `rev`. An order of another store answers `not_found`. */
export async function appendOrderEvent(scope: WriteScope, orderId: string, e: AppendOrderEventInput): Promise<AppendOrderEventResult> {
  if (!isOrderEventType(e.type)) return { ok: false, error: "bad_type" };
  if (!ACTOR_KINDS.has(e.actorKind) || (e.actorId != null && !/^[0-9A-Z]{26}$/.test(e.actorId))) return { ok: false, error: "bad_meta" };
  if (e.reasonCode !== undefined && !CODE.safeParse(e.reasonCode).success) return { ok: false, error: "bad_meta" };
  const meta = checkMeta(e.type, e.meta);
  if (!meta.ok || metaHasPhone(meta.meta)) return { ok: false, error: "bad_meta" };
  if (typeof orderId !== "string" || !ORDER_ID.safeParse(orderId).success) return { ok: false, error: "not_found" };
  const [order] = await db.select({ id: orders.id }).from(orders).where(byId(orders, scope, orderId)).limit(1);
  if (!order) return { ok: false, error: "not_found" };
  const [id] = await appendEvents(db, scope, [{ orderId, actorKind: e.actorKind, actorId: e.actorId ?? null, type: e.type, reasonCode: e.reasonCode ?? null, note: e.note ?? null, meta: meta.meta }]);
  return { ok: true, id: id! };
}

/* ------------------------------------------------------------------ */
/* the timeline                                                        */
/* ------------------------------------------------------------------ */

export type TimelineFilter = "all" | "calls" | "changes" | "notes";

/** One line of the drawer's timeline (OPE-§4.1). No phone, e-mail, address or note field: text lives in message refs. */
export interface TimelineItem {
  id: number;
  at: string;
  type: OrderEventType;
  /** 0006 (AI R37): `integration` (a carrier adapter) and `reconciliation` (a matched statement line) are written in R2 */
  actor: { kind: OrderActor["kind"] | "platform" | "integration" | "reconciliation"; name: string | null };
  text: MessageRef;
  detail?: MessageRef[];
  masked: true;
}

/** The types each filter chip shows (OPE-§4.2); "all" shows every type. */
export const TIMELINE_FILTERS: Readonly<Record<Exclude<TimelineFilter, "all">, readonly OrderEventType[]>> = {
  calls: ["call_attempt", "whatsapp_sent", "delivery_rescue", "phone_revealed", "claimed", "released", "customer_confirm_intent"],
  changes: [
    "created",
    "state_changed",
    "field_edited",
    "hold_set",
    "tracking_set",
    "recall_requested",
    "assigned",
    "unassigned",
    "duplicate_suspected",
    "duplicate_dismissed",
    "blocked",
    "priority_pinned",
    "external_rejected",
    "undo",
    "manifest_exported",
    "line_outcome",
    "refunded",
    "shipment_created",
    "carrier_status",
    "remitted",
    "merged",
  ],
  notes: ["note", "customer_request"],
};

export const TIMELINE_PAGE = 30;
const TIMELINE_MAX = 100;

/** The viewer of a ctx, as the visibility rule reads it. */
export const viewerOf = (ctx: StoreCtx): OrderViewer => ({ kind: "user", userId: ctx.user.id, role: ctx.membership.role, can: (p) => ctx.can(p) });

type EventRow = typeof orderEvents.$inferSelect;

/** A free text as a reader may see it: phones masked for everyone (OD11), hidden under impersonation (OD61). */
function shownText(scope: StoreScope, text: string, country: string): string {
  const masked = maskIfImpersonation(scope, { name: null, phone: null, address: null, city: null, landmark: null, note: text }).note;
  return scope.kind === "impersonation" ? String(masked) : maskPhonesIn(text, country);
}

/** A field_edited value as a reader may see it: the edited field masked like the order's own field (OD61). */
function shownField(scope: StoreScope, f: string, value: string | null, country: string): string | null {
  if (value === null) return null;
  if (scope.kind !== "impersonation") return maskPhonesIn(value, country);
  const m = maskIfImpersonation(scope, {
    name: f === "name" ? value : null,
    phone: f === "phone" ? value : null,
    address: f === "address" ? value : null,
    city: f === "city" ? value : null,
    landmark: f === "landmark" ? value : null,
    note: f === "city" ? null : value,
  });
  const out = f === "name" ? m.name : f === "phone" ? m.phone : f === "address" ? m.address : f === "city" ? m.city : f === "landmark" ? m.landmark : m.note;
  return out === null ? null : String(out);
}

const iso = (d: Date) => d.toISOString();
const isCancelReason = (c: string | null): c is string => !!c && (CANCEL_REASONS as readonly string[]).includes(c);
const isReturnReason = (c: string | null): c is string => !!c && (RETURN_REASONS as readonly string[]).includes(c);

/** The message refs of one event (OPE-§N `ops.tl.*`). */
function describe(scope: StoreScope, e: EventRow, country: string, note: { text: string; edited: boolean; hidden: boolean } | null): { text: MessageRef; detail: MessageRef[] } {
  const m = (e.meta ?? {}) as Record<string, unknown>;
  const detail: MessageRef[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (e.type) {
    case "state_changed": {
      const axis = str(m.axis) || "confirm";
      if (m.forced) detail.push({ key: "ops.tl.detail.forced" });
      if (m.implied) detail.push({ key: "ops.tl.detail.implied" });
      if (m.auto) detail.push({ key: "ops.tl.detail.auto" });
      if (axis === "confirm" && isCancelReason(e.reasonCode)) detail.push({ key: `ops.reason.${e.reasonCode}` });
      if (axis === "ship" && isReturnReason(e.reasonCode)) detail.push({ key: `ops.reason.return.${e.reasonCode}` });
      if (typeof m.dueAt === "string") detail.push({ key: "ops.tl.detail.dueAt", vars: { at: m.dueAt } });
      if (typeof m.shipAfter === "string") detail.push({ key: "ops.tl.detail.shipAfter", vars: { at: m.shipAfter } });
      if (m.settlement === "at_delivery") detail.push({ key: "ops.tl.detail.atDelivery" });
      else if (m.settlement === "manual") detail.push({ key: "ops.tl.detail.cashMarked" });
      if (typeof m.duplicateOf === "string") detail.push({ key: "ops.tl.detail.duplicateOf", vars: { id: m.duplicateOf } });
      if (m.inbound) detail.push({ key: "ops.tl.detail.inbound" });
      if (e.note) detail.push({ key: "ops.tl.detail.reason", vars: { text: shownText(scope, e.note, country) } });
      return { text: { key: `ops.tl.state_changed.${axis}.${e.toState ?? ""}` }, detail };
    }
    case "call_attempt": {
      if (typeof m.nextDueAt === "string") detail.push({ key: "ops.tl.detail.nextDueAt", vars: { at: m.nextDueAt } });
      if (m.inbound) detail.push({ key: "ops.tl.detail.inbound" });
      if (e.note) detail.push({ key: "ops.tl.detail.reason", vars: { text: shownText(scope, e.note, country) } });
      return { text: { key: `ops.tl.call_attempt.${str(m.outcome) || "no_answer"}`, vars: { n: Number(m.attemptNo) || 0, channel: str(m.channel) || "call" } }, detail };
    }
    case "note": {
      if (note?.edited) detail.push({ key: "ops.tl.detail.edited" });
      if (note?.hidden) detail.push({ key: "ops.tl.detail.hidden" });
      return { text: { key: "ops.tl.note", vars: { text: shownText(scope, note?.text ?? e.note ?? "", country) } }, detail };
    }
    case "customer_request":
      return { text: { key: "ops.tl.customer_request", vars: { text: shownText(scope, str(m.text) || e.note || "", country) } }, detail };
    case "field_edited": {
      const fields = Array.isArray(m.fields) ? (m.fields as { f: string; before: string | null; after: string | null }[]) : [];
      for (const f of fields) {
        detail.push({ key: `ops.tl.field.${f.f}`, vars: { before: shownField(scope, f.f, f.before, country) ?? "", after: shownField(scope, f.f, f.after, country) ?? "" } });
      }
      if (m.inTransit) detail.push({ key: "ops.tl.detail.inTransit" });
      return { text: { key: "ops.tl.field_edited", vars: { n: fields.length } }, detail };
    }
    case "duplicate_suspected":
    case "duplicate_dismissed":
      return { text: { key: `ops.tl.${e.type}`, vars: { ids: (Array.isArray(m.of) ? (m.of as string[]) : []).join(", ") } }, detail };
    case "external_rejected":
      return { text: { key: "ops.tl.external_rejected", vars: { wanted: str(m.wanted) } }, detail };
    case "hold_set":
      return { text: m.shipAfter ? { key: "ops.tl.hold_set", vars: { at: str(m.shipAfter) } } : { key: "ops.tl.hold_removed" }, detail };
    case "tracking_set":
      return { text: { key: "ops.tl.tracking_set", vars: { ref: str(m.trackingRef), carrier: str(m.carrierLabel) } }, detail };
    case "released":
      return { text: { key: `ops.tl.released.${str(m.why) || "manager"}` }, detail };
    case "assigned":
    case "unassigned":
      return { text: { key: `ops.tl.${e.type}`, vars: { by: str(m.by) } }, detail };
    case "blocked":
      return { text: { key: `ops.tl.blocked.${str(m.kind) || "phone"}` }, detail };
    case "priority_pinned":
      return { text: { key: m.pinned ? "ops.tl.priority_pinned" : "ops.tl.priority_unpinned" }, detail };
    case "phone_revealed":
      return { text: { key: "ops.tl.phone_revealed", vars: { why: str(m.why) || "view" } }, detail };
    default:
      return { text: { key: `ops.tl.${e.type}` }, detail };
  }
}

/** Display names of the actors of a page (members by display name; sheet, carrier and system by label). */
async function actorNames(rows: readonly EventRow[], carrierLabel: string | null): Promise<(e: EventRow) => string | null> {
  const ids = [...new Set(rows.filter((r) => r.actorKind === "user" && r.actorId).map((r) => r.actorId!))];
  const people = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  const byIdName = new Map(people.map((p) => [p.id, p.name]));
  const brand = rows.some((r) => r.actorKind === "system") ? await brandName() : null;
  return (e) => {
    const m = (e.meta ?? {}) as Record<string, unknown>;
    switch (e.actorKind) {
      case "user":
        return (e.actorId && byIdName.get(e.actorId)) || null;
      case "sheet":
        return typeof m.agentLabel === "string" && m.agentLabel ? `Google Sheet · ${m.agentLabel}` : "Google Sheet";
      case "carrier":
      case "integration": // R2: a carrier adapter's status sync (AI R45)
        return carrierLabel;
      case "system":
        return brand;
      case "platform":
        return "Support";
      default:
        return null;
    }
  };
}

/** A note event's meta, read loosely (the stored row was validated on write). */
const noteMeta = (e: Pick<EventRow, "meta">) => (e.meta ?? {}) as { edited?: boolean; of?: number };

/**
 * The timeline of one order, newest first (keyset on id). An order the viewer cannot see, another store's and a
 * missing id all answer `{ items: [], more: false }`. Note edits replace their note's text ("edited"); a hidden note is
 * dropped for agents and marked for managers; `note_hidden` itself is never an item.
 */
export async function orderTimeline(scope: StoreScope, viewer: StoreCtx, orderId: string, opts: { beforeId?: number; limit?: number; filter?: TimelineFilter } = {}): Promise<{ items: TimelineItem[]; more: boolean }> {
  const empty = { items: [] as TimelineItem[], more: false };
  if (typeof orderId !== "string" || !ORDER_ID.safeParse(orderId).success) return empty;
  const [order] = await db
    .select({ id: orders.id, assigneeId: orders.assigneeId, confirmedBy: orders.confirmedBy, carrierLabel: orders.carrierLabel })
    .from(orders)
    .where(byId(orders, scope, orderId))
    .limit(1);
  if (!order || !viewerSeesOrder(scope, viewerOf(viewer), order, true)) return empty;

  const limit = Math.max(1, Math.min(TIMELINE_MAX, Math.trunc(opts.limit ?? TIMELINE_PAGE)));
  const filter = opts.filter && opts.filter !== "all" ? TIMELINE_FILTERS[opts.filter] : null;
  const conds: (SQL | undefined)[] = [
    eq(orderEvents.orderId, orderId),
    ne(orderEvents.type, "note_hidden"),
    // a note edit is shown through its note, never as its own line (MariaDB's JSON_VALUE answers '1' for true)
    sql`NOT (${orderEvents.type} = 'note' AND COALESCE(JSON_VALUE(${orderEvents.meta}, '$.edited'), '') IN ('1', 'true'))`,
    typeof opts.beforeId === "number" && Number.isFinite(opts.beforeId) ? lt(orderEvents.id, Math.trunc(opts.beforeId)) : undefined,
    filter ? inArray(orderEvents.type, [...filter]) : undefined,
  ];
  const rows = await db
    .select()
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, ...conds))
    .orderBy(desc(orderEvents.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);

  // the edits and hides of the notes on this page
  const noteIds = page.filter((r) => r.type === "note").map((r) => r.id);
  const followUps = noteIds.length
    ? await db
        .select({ id: orderEvents.id, type: orderEvents.type, note: orderEvents.note, meta: orderEvents.meta })
        .from(orderEvents)
        .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orderId), inArray(orderEvents.type, ["note", "note_hidden"]), sql`JSON_VALUE(${orderEvents.meta}, '$.of') IS NOT NULL`))
        .orderBy(orderEvents.id)
    : [];
  const latest = new Map<number, string>();
  const hidden = new Set<number>();
  for (const f of followUps) {
    const of = Number(noteMeta(f).of);
    if (!noteIds.includes(of)) continue;
    if (f.type === "note_hidden") hidden.add(of);
    else latest.set(of, f.note ?? "");
  }
  const managerView = !!viewer.can("orders.read_all");
  const country = viewer.store.market || "MA";
  const nameOf = await actorNames(page, order.carrierLabel ?? null);
  const items: TimelineItem[] = [];
  for (const e of page) {
    const isHidden = e.type === "note" && hidden.has(e.id);
    if (isHidden && !managerView) continue;
    const note = e.type === "note" ? { text: latest.get(e.id) ?? e.note ?? "", edited: latest.has(e.id), hidden: isHidden } : null;
    const { text, detail } = describe(scope, e, country, note);
    items.push({ id: e.id, at: iso(e.at), type: e.type as OrderEventType, actor: { kind: e.actorKind, name: nameOf(e) }, text, ...(detail.length ? { detail } : {}), masked: true });
  }
  return { items, more };
}

/* ------------------------------------------------------------------ */
/* notes                                                               */
/* ------------------------------------------------------------------ */

/** a note may be edited by its author this long after it was written (OPE-§4.1) */
export const NOTE_EDIT_WINDOW_MS = 5 * 60_000;

/** Control characters out (newlines kept), at most two blank lines in a row, trimmed. */
export function cleanNote(text: unknown): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const noteLength = (s: string) => Array.from(s).length;

/** The order a member may annotate: visible to them (OD12) and in their store. */
async function annotatable(ctx: WriteCtx, orderId: string): Promise<boolean> {
  if (typeof orderId !== "string" || !ORDER_ID.safeParse(orderId).success || !ctx.can("orders.write")) return false;
  const [order] = await db.select({ id: orders.id, assigneeId: orders.assigneeId, confirmedBy: orders.confirmedBy }).from(orders).where(byId(orders, ctx.scope, orderId)).limit(1);
  return !!order && viewerSeesOrder(ctx.scope, viewerOf(ctx), order, true);
}

export type NoteResult = { ok: true; id: number } | { ok: false; error: "not_found" | "too_long" | "empty" };
export type NoteEditResult = { ok: true; id: number } | { ok: false; error: "not_found" | "too_long" | "empty" | "forbidden" | "too_late" };

/** An internal note on an order the member can see (≤ 500 characters; phones are masked when it is read). */
export async function addNote(ctx: WriteCtx, orderId: string, text: string): Promise<NoteResult> {
  const clean = cleanNote(text);
  if (!clean) return { ok: false, error: "empty" };
  if (noteLength(clean) > NOTE_MAX) return { ok: false, error: "too_long" };
  if (!(await annotatable(ctx, orderId))) return { ok: false, error: "not_found" };
  const [id] = await appendEvents(db, ctx.scope, [{ orderId, actorKind: "user", actorId: ctx.user.id, type: "note", note: clean }]);
  return { ok: true, id: id! };
}

/** The original note of `eventId` (an edit points at its note), in this order and store, or null. */
async function originalNote(scope: StoreScope, orderId: string, eventId: number): Promise<EventRow | null> {
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  const [row] = await db
    .select()
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, eq(orderEvents.id, eventId), eq(orderEvents.orderId, orderId), eq(orderEvents.type, "note")))
    .limit(1);
  if (!row) return null;
  const of = noteMeta(row).of;
  return typeof of === "number" ? originalNote(scope, orderId, of) : row;
}

/** The author edits their note within 5 minutes of writing it: a new `note` event `{ edited: true, of }`. */
export async function editNote(ctx: WriteCtx, orderId: string, eventId: number, text: string, now = new Date()): Promise<NoteEditResult> {
  const clean = cleanNote(text);
  if (!clean) return { ok: false, error: "empty" };
  if (noteLength(clean) > NOTE_MAX) return { ok: false, error: "too_long" };
  if (!(await annotatable(ctx, orderId))) return { ok: false, error: "not_found" };
  const note = await originalNote(ctx.scope, orderId, eventId);
  if (!note) return { ok: false, error: "not_found" };
  if (note.actorKind !== "user" || note.actorId !== ctx.user.id) return { ok: false, error: "forbidden" };
  if (now.getTime() - note.at.getTime() > NOTE_EDIT_WINDOW_MS) return { ok: false, error: "too_late" };
  const [id] = await appendEvents(db, ctx.scope, [{ orderId, actorKind: "user", actorId: ctx.user.id, type: "note", note: clean, meta: { edited: true, of: note.id } }]);
  return { ok: true, id: id! };
}

/** A manager (`orders.assign`) hides a note from agents; the text stays stored for the audit (`note_hidden`). */
export async function hideNote(ctx: WriteCtx, orderId: string, eventId: number): Promise<{ ok: true; id: number } | { ok: false; error: "not_found" | "forbidden" }> {
  if (!(await annotatable(ctx, orderId))) return { ok: false, error: "not_found" };
  if (!ctx.can("orders.assign")) return { ok: false, error: "forbidden" };
  const note = await originalNote(ctx.scope, orderId, eventId);
  if (!note) return { ok: false, error: "not_found" };
  const [id] = await appendEvents(db, ctx.scope, [{ orderId, actorKind: "user", actorId: ctx.user.id, type: "note_hidden", meta: { of: note.id } }]);
  return { ok: true, id: id! };
}
