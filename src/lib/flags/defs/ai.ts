/**
 * Release flags of the ai track (P7 AI; ai.md AI-§A.2 `TaskDef.flag`, AI-§B.13 step 5; docs/STORE-SAAS.md §D.4, §H.12
 * rule 1, §K.3; PLA Q.16). Extension file imported by src/lib/flags/registry.ts; the boot task seeds them with
 * `INSERT IGNORE` (a console edit is never overwritten). Every one ships off: the console turns them on per store,
 * plan or rollout. src/lib/ai/server/flags.ts resolves them for the router.
 */
import type { FlagDef } from "../registry";

export const flags: FlagDef[] = [
  { key: "ai_director_brief", kind: "release", type: "boolean", default: false, ownerTrack: "ai", description: "The Director pass (AI-19a): the interactive plan and critique around the wizard's three designs. Off: the instant set only." },
  {
    key: "ai_detached_jobs",
    kind: "release",
    type: "boolean",
    default: false,
    ownerTrack: "ai",
    description: "Schedules after() as the free first driver of detached AI jobs. Set from the detached-job probe (on when after() survived 30 s past the response); off, jobs still run on polls and one-item batches.",
  },
  { key: "ai_copilot", kind: "release", type: "boolean", default: false, ownerTrack: "ai", description: "The admin copilot and the natural-language command bar (AI-18, R3)." },
  { key: "ai_learned_priors", kind: "release", type: "boolean", default: false, ownerTrack: "ai", description: "Learned gene priors in the generator's sampler (AI-13, R3). Off: the uniform priors." },
  { key: "ai_risk_v2", kind: "release", type: "boolean", default: false, ownerTrack: "ai", description: "Risk v2, the best call time and cancel-reason insights (AI-23, R3)." },
];
