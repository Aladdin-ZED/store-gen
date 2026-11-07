import "server-only";
/**
 * Outbox handler of the `webhook` kind (S5 INTEGRATIONS 2, operations.md OPE-§P).
 * Extension file (docs/STORE-SAAS.md §H.1, §K.3), created as a stub at the R2 contract step (C2-D) and imported by
 * src/lib/jobs/registry.ts; the track replaces the body and never edits the registry. The stub is paused, so the
 * drainer never claims a `webhook` row (no R1 path enqueues one) and `send` is never called before the track builds it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import { registerOutboxHandler } from "@/lib/jobs/outbox";

registerOutboxHandler<unknown>({
  kind: "webhook",
  maxPerTick: 100,
  perStorePerTick: 20,
  timeoutMs: 10000,
  paused: async () => true,
  send: async () => notBuiltYet("S5", "webhook outbox handler"),
});
