/**
 * The design gates (P6 DESIGN; design.md DES-§8, DG-06): pure and isomorphic. `runGates` (≤ 8 ms p95), `repairDoc`
 * (≤ 30 ms), `applyOps`, `summarize` (design_genomes.report) and `toGateItem` (the core's `GateItem`, `design:*`).
 * The adapter from a document and its context is ../gate-input.ts (`gateInputFor`, `KIND_GATES`).
 */
export { AI_REPAIR_OPS, applyOps, repairDoc, type AiRepairOp, type ApplyCtx, type RepairOp } from "./repair";
export { gateItemsOf, noveltyTerm, PRE_FIT, qContributions, qScore, runGates, summarize, toGateItem } from "./run";
export { composition, type CompositionFacts } from "./composition";
export { KIND_GATES, registerOfKind, type KindGates } from "./kinds";
export { planFor, OPTIONAL_TYPES } from "./plan";
export { slopItems, tellDevices } from "./slop";
export { pageView, type PageView, type SecView } from "./view";
export { apcaLc } from "./visual";
export * from "./types";
