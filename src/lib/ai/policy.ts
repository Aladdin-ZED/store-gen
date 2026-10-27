/**
 * The AI policy object (P7 AI; ai.md AI-§A.4; docs/STORE-SAAS.md §K.2 P0 ai stubs, AI R13, D59, D70). Isomorphic types
 * (the server computes the policy per request with `aiPolicyFor(ctx)`, src/lib/ai/router/server.ts, and hands it to
 * every page that runs AI; it is advisory for the client, the server re-checks every line on its own rung). Frozen at
 * P0 (src/lib/contracts/r1-p0.ts); P7 adds the pure `ladderFor(policy, task, device)` here.
 */
import type { AiTier } from "./protocol";
import type { AiTaskId } from "./tasks";

/** why `cloud.available` is false, the first that holds in the AI-§A.4 order */
export type CloudBlock =
  | "platform_off"
  | "no_key"
  | "no_cap"
  | "kill"
  | "entitlement"
  | "state"
  | "store_local_only"
  | "quota_store"
  | "quota_day"
  | "quota_platform"
  | "quota_platform_pending"
  | "paused";

export interface AiPolicy {
  mode: "auto" | "local" | "server";
  cloud: {
    available: boolean;
    block: CloudBlock | null;
    creditsLeft: number | null;
    dayLeft: number | null;
    /** store_ai.director (null → the platform default) ∧ the Director class reachable ∧ passes left today ∧ the Director share left */
    director: "auto" | "ask" | "off" | "unavailable";
    /** rev 3: why `director` is "unavailable", for the chip copy (AI-§L) */
    directorBlock: "passes_day" | "quota_director" | "class_down" | null;
    /** rev 3: the current p90 estimate of one interactive pass in credits, shown on the button in every mode (QUAL-34) */
    directorPassCredits: number;
    directorPassesLeft: number | null;
    deepPass: boolean;
    deepPassesLeft: number | null;
    /** pattern B; "batch" only when platform_ai.classes.director_deep.batch = "always" */
    deepTransport: "job" | "batch";
  };
  local: { enabled: boolean; tierMax: "lite" | "full"; bgRemoval: boolean };
  autoPrefersCloud: Partial<Record<AiTaskId, true>>;
  /** tasks released and flagged on for this store */
  live: AiTaskId[];
  transport: "stream" | "poll";
  /** local prompt versions to use */
  promptVersions: Partial<Record<AiTaskId, string>>;
  /** compact voice block for local prompts (≤ 120 tokens, AI-§F.2) */
  voiceLocal: string;
  /** "<platform brand> AI" (GEN-13) */
  workerName: string;
}

/** protocol.ts's tier type under its R1 name (P7 renames AiTier to DeviceTier there and keeps the alias one release). */
export type DeviceTier = AiTier;
export interface DeviceInfo {
  tier: DeviceTier;
  mobile: boolean;
  saveData: boolean;
  vlmCached: boolean;
}
