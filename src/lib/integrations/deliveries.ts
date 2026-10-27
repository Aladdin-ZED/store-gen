import "server-only";
/**
 * The store's deliveries log (P5 INTEGRATIONS; operations.md OPE-§28.1, OD40; docs/STORE-SAAS.md §K.2 P0 rev 2.1): the
 * last 100 outbox rows of the store (`SELECT … FROM outbox WHERE store_id = ? …`, `ob_store_idx`), kinds `capi` and
 * `telegram` in R1 (R2 `webhook`, `carrier`; R3 `whatsapp`; `mail` never shown to tenants). A row carries a payload
 * summary, never the sealed payload and never a phone or a name. Replay is the core's `replay(ctx, id)`
 * (src/lib/jobs/outbox.ts). Typed stub frozen at P0.
 */
import type { OutboxKind, OutboxState } from "@/lib/jobs/outbox";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";

export interface DeliveriesQuery {
  kind?: Exclude<OutboxKind, "mail">;
  state?: OutboxState;
  /** keyset cursor: the `next` of the previous page */
  after?: string;
  /** ≤ 100 */
  limit?: number;
}

export interface DeliveryRow {
  id: string;
  /** created */
  at: string;
  kind: Exclude<OutboxKind, "mail">;
  topic: string;
  /** pixel last 4, chat label, endpoint host, carrier label */
  target: string | null;
  state: OutboxState;
  attempts: number;
  nextAt: string | null;
  lastStatus: number | null;
  /** the last error in plain words (`int.cause.<code>`) */
  lastErrorKey: MessageKey | null;
  /** order id, event name, amount in cents: never a customer field */
  summary: { orderId: string | null; event: string | null; amountCents: number | null };
}

export async function listDeliveries(scope: StoreScope, q: DeliveriesQuery): Promise<{ rows: DeliveryRow[]; next: string | null }> {
  void scope;
  void q;
  throw new Error("not implemented: P5 listDeliveries");
}
