import "server-only";
/**
 * Enqueueing webhook events (operations.md OPE-§23; R2, S5 INTEGRATIONS 2 owns `src/lib/webhooks/**`: endpoints,
 * Standard Webhooks signing, the outbox handler). The contract step (C2-C) froze `enqueueWebhookEvent` for S3 MONEY,
 * which calls it after a carrier statement import commits (`remittance.imported`, one per statement, `ref` = the
 * statement's dedupe key, inside S3's transaction when `tx` is given so a rolled-back import leaves no outbox row).
 * Order events reach webhooks through S5's order hook, leads through `onLeadCreated` (no direct call). Answer: the
 * number of outbox rows written (one per active endpoint subscribed to the event). Contract body until S5 merges: 0
 * (no webhook endpoint can exist before S5). No R1 path calls it.
 */
import type { Tx } from "@/lib/orders/hooks";
import type { WriteScope } from "@/lib/tenancy/types";
import type { RemittanceWebhookV1 } from "./types";

/** Queue one event for every subscribed endpoint of the store. S5 (contract body: none queued). */
export async function enqueueWebhookEvent(scope: WriteScope, event: "remittance.imported", data: { remittance: RemittanceWebhookV1 }, opts: { ref: string; tx?: Tx }): Promise<{ enqueued: number }> {
  void scope;
  void event;
  void data;
  void opts;
  return { enqueued: 0 };
}
