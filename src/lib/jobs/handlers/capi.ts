import "server-only";
/**
 * Outbox handler `capi` (P5 INTEGRATIONS; operations.md OPE-§20.4, OPE-§J; docs/STORE-SAAS.md §H.1): the server-side
 * ad events (Meta Purchase, ConfirmedOrder, DeliveredOrder; TikTok Events API).
 * Extension file (docs/STORE-SAAS.md §K.3), created empty at P0 and imported for its effect by src/lib/jobs/registry.ts;
 * the track registers its handler here with `registerOutboxHandler({ kind: "capi", … })` (src/lib/jobs/outbox.ts;
 * perStorePerTick 20, timeoutMs 8,000) and never edits the registry.
 */
export {};
