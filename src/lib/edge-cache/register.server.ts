/**
 * S6 PLATFORM UX's registration module for the edge cache (R2; S6 owns `src/lib/edge-cache/**`). The maintainer's seam
 * imports it once from the Node branch of src/instrumentation.ts (`await import("@/lib/edge-cache/register.server")`),
 * where S6 registers `onStoreInvalidated("edge-purge", …)`, so src/lib/tenancy/cache.ts gains no static DB import.
 * Contract body (C2-C): empty; nothing registers until S6 merges.
 */
export {};
