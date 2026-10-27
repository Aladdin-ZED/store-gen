import "server-only";
/**
 * The order timeline (P4 CALL CENTER; operations.md OPE-§2.2, §4.1; docs/STORE-SAAS.md §K.2 P0, LAN Q17). Frozen at
 * P0: the event type catalog (append-only, ≤ 32 chars) and `appendOrderEvent`, the one door other tracks use to append
 * an event outside a transition (P3: lead attribution, tracking-link opened, kit share, zone_not_served, the shopper's
 * requests and confirm intent). P4 adds `appendEvents`, `orderTimeline` and the notes here.
 */
import type { WriteScope } from "@/lib/tenancy/types";
import type { OrderActor } from "./transition";

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

/** One event outside a transition; never changes `rev`. An order of another store answers `not_found`. */
export async function appendOrderEvent(scope: WriteScope, orderId: string, e: AppendOrderEventInput): Promise<AppendOrderEventResult> {
  void scope;
  void orderId;
  void e;
  throw new Error("not implemented: P4 appendOrderEvent");
}
