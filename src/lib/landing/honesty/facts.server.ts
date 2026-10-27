import "server-only";
/**
 * A page's merchant facts (P3 LANDING; landing.md LAN-§6.4, ENGP-8; docs/STORE-SAAS.md §M.1 rule 2, §K.2 P0): the
 * numerals the seller vouched for, so the builder checklist and the honesty gate judge the facts the seller actually
 * gave. The create-from-directions path calls `recordFacts(scope, pageId, facts)` with the wizard's facts.
 *
 * Frozen at P0 as a re-export of the R1.0 home (src/lib/editor/facts.server.ts, T4): the same signatures and the same
 * `page.fact_attested` audit rows, working today. P3 may move the bodies here and leave the editor file re-exporting.
 */
export { factsFor, recordFacts, type AttestedFact, type CopyFacts } from "@/lib/editor/facts.server";
