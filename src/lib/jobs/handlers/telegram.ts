import "server-only";
/**
 * Outbox handler `telegram` (P5 INTEGRATIONS; operations.md OPE-§21.3, OPE-§J; docs/STORE-SAAS.md §H.1): the store's
 * Telegram messages (new orders, the daily summary, integration errors).
 * Extension file (docs/STORE-SAAS.md §K.3), created empty at P0 and imported for its effect by src/lib/jobs/registry.ts;
 * the track registers its handler here with `registerOutboxHandler({ kind: "telegram", … })` (src/lib/jobs/outbox.ts;
 * perStorePerTick 10, timeoutMs 6,000) and never edits the registry.
 */
export {};
