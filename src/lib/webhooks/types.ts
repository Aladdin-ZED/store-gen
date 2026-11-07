/**
 * Webhook payloads v1 (operations.md OPE-§23.1, §23.2, IN-07; R2, S5 INTEGRATIONS 2 owns `src/lib/webhooks/**`;
 * isomorphic, types and one constant). The contract step (C2-C) froze the payload shapes other tracks build:
 * S3 MONEY's `remittance.imported` (`RemittanceWebhookV1`, through `enqueueWebhookEvent`, src/lib/webhooks/emit.ts) and
 * the order / lead payloads S5 fills from S1's v3 orders, S4's tracking (`trackingLinkFor`) and the lead hook
 * (`onLeadCreated`, OPE Q.18). Stable field names; additions only; a breaking change is `v2` (per-endpoint choice).
 */
import type { OrderStatus } from "@/lib/orders/contract";
import type { OrderStates } from "@/lib/orders/state";

/** OPE-§23.1 plus `lead.created` (OPE Q.18), `remittance.imported` (S3) and `ping` (test). */
export const WEBHOOK_EVENTS = [
  "order.created",
  "order.updated",
  "order.confirmed",
  "order.cancelled",
  "order.shipped",
  "order.delivered",
  "order.returned",
  "lead.created",
  "remittance.imported",
  "ping",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface OrderWebhookV1 {
  id: string;
  created_at: string;
  status: OrderStatus;
  states: OrderStates;
  source: string;
  is_test: boolean;
  /** phone: E.164 when the endpoint has `include_phone`, else masked; address only with `include_phone` */
  customer: { name: string; phone: string; city: string | null; address: string | null; locale: string | null };
  items: { product: string; offer_label: string; units_text: string; qty: number };
  totals: { currency: string; subtotal_cents: number; shipping_cents: number; adjust_cents: number; total_cents: number; /** "349.00" */ total: string };
  utm: Record<string, string> | null;
  /** null for cart (v3) orders */
  page: { id: string; slug: string } | null;
  cancel_reason: string | null;
  /** R2 shipments (S4's `trackingLinkFor`) */
  tracking?: { carrier: string; number: string; url?: string };
}

/** `lead.created` (additive, OPE Q.18). */
export interface LeadWebhookV1 {
  id: string;
  created_at: string;
  kind: "form" | "whatsapp";
  page: { id: string; slug: string } | null;
  customer: { name: string; phone: string; city: string | null };
  selection_text: string;
  total_cents: number | null;
  currency: string;
  utm: Record<string, string> | null;
}

/** `remittance.imported` (additive, S3's statement imports). */
export interface RemittanceWebhookV1 {
  id: string;
  carrier: string;
  statement_ref: string;
  period_from: string;
  period_to: string;
  paid_at: string | null;
  gross_cents: number;
  fees_cents: number;
  net_cents: number;
  currency: string;
  lines: number;
  matched: number;
}

export interface WebhookEnvelopeV1 {
  /** "evt_" + outbox id */
  id: string;
  type: WebhookEvent;
  created_at: string;
  store: { handle: string };
  data: { order?: OrderWebhookV1; lead?: LeadWebhookV1; remittance?: RemittanceWebhookV1 };
}
