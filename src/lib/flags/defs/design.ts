/**
 * Release and ops flags of the design track (P6 DESIGN, design.md).
 * Extension file (docs/STORE-SAAS.md §D.4, §K.3; PLA Q.16), created empty at P0 and imported by
 * src/lib/flags/registry.ts; the boot task seeds what the track declares here. The three flags of design.md DES-§2.9:
 * read through `flagValue()` with the store in `ctx` (one store can be exempted during an incident); the landing
 * runtime reads none of them (zero bytes).
 */
import type { FlagDef } from "../registry";

export const flags: FlagDef[] = [
  {
    key: "design_publish_gates",
    kind: "ops",
    type: "string",
    // "block" here adds no exemption: the effective mode is the weaker of this flag and platform_design.gatesAtPublish
    // (General settings, "Design gates at publish", warn by default), so the console switch can still turn blocking on
    default: "block",
    description: "Design and budget items at publish: warn exempts (publish, audit page.publish.design_override / budget_override); block follows General settings › Design gates at publish",
    ownerTrack: "design",
  },
  {
    key: "design_novelty_check",
    kind: "ops",
    type: "string",
    default: "on",
    description: "Cross-store novelty verdicts: on, warn (never blocking) or off (every verdict ok)",
    ownerTrack: "design",
  },
  {
    key: "design_new_heroes",
    kind: "release",
    type: "boolean",
    default: true,
    description: "The new hero families (cinema, quiet, index, contact, statement) in the generation pools; off keeps today's six minus scrapbook",
    ownerTrack: "design",
  },
];
