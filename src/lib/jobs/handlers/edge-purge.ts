import "server-only";
/**
 * Outbox handler of the `edge_purge` kind (S6 PLATFORM UX, platform.md).
 * Extension file (docs/STORE-SAAS.md §H.1, §K.3), created as a stub at the R2 contract step (C2-D) and imported by
 * src/lib/jobs/registry.ts; the track replaces the body and never edits the registry. The stub is paused, so the
 * drainer never claims a `edge_purge` row (no R1 path enqueues one) and `send` is never called before the track builds it.
 * The throughput numbers are stub values (no spec row names them yet): S6 sets them with the body (PLA-§16.4).
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import { registerOutboxHandler } from "@/lib/jobs/outbox";

registerOutboxHandler<unknown>({
  kind: "edge_purge",
  maxPerTick: 50,
  perStorePerTick: 20,
  timeoutMs: 8000,
  paused: async () => true,
  send: async () => notBuiltYet("S6", "edge-purge outbox handler"),
});
