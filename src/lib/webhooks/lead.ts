import "server-only";
/**
 * `lead.created` webhooks (operations.md OPE-§23.1, IN-07; OPE Q.18). Track S5 owns `src/lib/webhooks/**` in R2 and
 * writes the body: one outbox item per active endpoint subscribed to `lead.created` (Standard Webhooks payload v1),
 * written with `tx` when the lead's insert has one.
 *
 * The R2 contract step (C2-B2) froze the signature (src/lib/contracts/r2-contract.ts): the core's `onLeadCreated` hook
 * (src/lib/orders/hooks.ts) calls it right after a lead row is inserted, never for a test lead. Contract stub: no-op.
 */
import type { LeadRow, Tx } from "@/lib/orders/hooks";
import type { WriteScope } from "@/lib/tenancy/types";

/** The `lead.created` events of a new lead (S5, R2). Contract stub: nothing is queued. */
export async function leadCreatedWebhooks(scope: WriteScope, lead: LeadRow, tx?: Tx): Promise<void> {
  void scope;
  void lead;
  void tx;
}
