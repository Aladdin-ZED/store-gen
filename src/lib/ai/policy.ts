/**
 * The AI policy object and the ladder (P7 AI; ai.md AI-§A.4, AI-D2, AI-D3, AI-D5; docs/STORE-SAAS.md §K.2 P0 ai stubs,
 * AI R13, D59, D70). Isomorphic and pure. The server computes the policy per request with `aiPolicyFor(ctx)`
 * (src/lib/ai/router/server.ts), from the inputs the evaluators below take, and hands it to every page that runs AI; it
 * is advisory for the client, and the server re-checks every line on its own rung. `AiPolicy`, `CloudBlock` and
 * `DeviceInfo` are frozen at P0 (src/lib/contracts/r1-p0.ts, r1-p0b-design.ts).
 *
 *   - `ladderFor(policy, task, device)`: the rungs one run tries, in order (the AI-§A.4 decision table);
 *   - `cloudBlockFor(inputs)`: the first `CloudBlock` that holds, in the AI-§A.4 order;
 *   - `directorFor(inputs)`: the effective Director mode and why it is unavailable;
 *   - `degradeSteps(...)`: the degrade ladder, which removes stages and never swaps a model inside a class (AI-D5).
 */
import type { DeviceTier } from "./protocol";
import type { AiProviderId, AiTaskId, TaskClass } from "./tasks";

export type { DeviceTier } from "./protocol";

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

export interface DeviceInfo {
  tier: DeviceTier;
  mobile: boolean;
  saveData: boolean;
  vlmCached: boolean;
}

/* ------------------------------------------------------------------ */
/* The cloud block order (AI-§A.4)                                     */
/* ------------------------------------------------------------------ */

/** What `aiPolicyFor` reads before it can say whether the cloud is available (all pure values). */
export interface CloudInputs {
  /** a "View as store" session (D70): staff never spend a store's credits */
  impersonation: boolean;
  /** platform_ai.enabled */
  enabled: boolean;
  /** a key in platform_ai_secret or env */
  hasKey: boolean;
  /** platform_ai.caps.monthlyUsd (null = no cap = cloud off) */
  monthlyUsd: number | null;
  /** the flag ai_generation_enabled (the kill switch is "off" when the flag is false) */
  generationOn: boolean;
  /** the circuit breaker (AI-§B.10) */
  paused: boolean;
  /** entitlement(store, "cloud_ai") after the state cap of core §A.5.2 */
  entitlement: "ok" | "entitlement" | "state";
  /** store_ai.mode */
  mode: AiPolicy["mode"];
  /** credits left this month / today (null = unlimited) */
  creditsLeft: number | null;
  dayLeft: number | null;
  /** platform spend left under the cap, in micros (null = unknown → not blocking) */
  platformLeftMicros: number | null;
  /** the store is `pending` and the pending stores' share is spent */
  pending: boolean;
  pendingLeftMicros: number | null;
}

/**
 * The first block that holds, in the AI-§A.4 order: enabled → key → cap → kill switch → breaker → entitlement (the
 * state cap inside it) → the store's "On-device only" → month credits → day credits → platform cap → the pending share.
 * A "View as store" session is `state` before anything else (D70, the P0 stub's answer).
 */
export function cloudBlockFor(i: CloudInputs): CloudBlock | null {
  if (i.impersonation) return "state";
  if (!i.enabled) return "platform_off";
  if (!i.hasKey) return "no_key";
  if (i.monthlyUsd === null || !(i.monthlyUsd > 0)) return "no_cap";
  if (!i.generationOn) return "kill";
  if (i.paused) return "paused";
  if (i.entitlement !== "ok") return i.entitlement;
  if (i.mode === "local") return "store_local_only";
  if (i.creditsLeft !== null && i.creditsLeft <= 0) return "quota_store";
  if (i.dayLeft !== null && i.dayLeft <= 0) return "quota_day";
  if (i.platformLeftMicros !== null && i.platformLeftMicros <= 0) return "quota_platform";
  if (i.pending && i.pendingLeftMicros !== null && i.pendingLeftMicros <= 0) return "quota_platform_pending";
  return null;
}

/** What the Director line of the policy reads (AI-§A.4, AI-§C.2, AI-§C.3). */
export interface DirectorInputs {
  cloudAvailable: boolean;
  /** the release flag ai_director_brief */
  flagOn: boolean;
  /** store_ai.director (null = never chose) */
  storeChoice: "auto" | "ask" | "off" | null;
  /** platform_ai.directorAutoDefault: "ask" until the preference test passed */
  autoDefault: boolean;
  /** the director_interactive class marked unavailable (AI-§B.2) */
  classDown: boolean;
  /** today's Director passes left (null = no cap) */
  passesLeft: number | null;
  /** the store's Director share of the month left, in credits (null = unlimited) */
  shareLeft: number | null;
}

/** The effective Director mode; `quota_director` is never a CloudBlock (copy keeps working, AI-§A.4 rev 3). */
export function directorFor(i: DirectorInputs): { director: AiPolicy["cloud"]["director"]; directorBlock: AiPolicy["cloud"]["directorBlock"] } {
  if (!i.cloudAvailable || !i.flagOn) return { director: "unavailable", directorBlock: null };
  if (i.classDown) return { director: "unavailable", directorBlock: "class_down" };
  if (i.passesLeft !== null && i.passesLeft <= 0) return { director: "unavailable", directorBlock: "passes_day" };
  if (i.shareLeft !== null && i.shareLeft <= 0) return { director: "unavailable", directorBlock: "quota_director" };
  return { director: i.storeChoice ?? (i.autoDefault ? "auto" : "ask"), directorBlock: null };
}

/** The deep pass line: store_ai.deepPass ∧ the class reachable ∧ passes left ∧ no deep job running for the store. */
export function deepPassFor(i: { cloudAvailable: boolean; storeDeepPass: boolean; classDown: boolean; passesLeft: number | null; jobRunning: boolean }): boolean {
  return i.cloudAvailable && i.storeDeepPass && !i.classDown && (i.passesLeft === null || i.passesLeft > 0) && !i.jobRunning;
}

/* ------------------------------------------------------------------ */
/* The whole policy from its inputs (aiPolicyFor's pure half)          */
/* ------------------------------------------------------------------ */

/** rev 4 note of AI-§A.8.6: the button and the reservation keep the conservative 53 credits until `ai_runs` shows the real p90 */
export const DIRECTOR_PASS_CREDITS_P90 = 53;

/** Everything `aiPolicyFor` reads, already loaded (src/lib/ai/router/server.ts); pure values only. */
export interface PolicyInputs {
  cloud: CloudInputs;
  director: Omit<DirectorInputs, "cloudAvailable">;
  deep: { storeDeepPass: boolean; classDown: boolean; passesLeft: number | null; jobRunning: boolean; batchAlways: boolean };
  directorPassCredits: number;
  local: AiPolicy["local"];
  /** the tasks released and flagged on (before impersonation) */
  live: AiTaskId[];
  autoPrefersCloud: AiPolicy["autoPrefersCloud"];
  transport: AiPolicy["transport"];
  promptVersions: AiPolicy["promptVersions"];
  voiceLocal: string;
  workerName: string;
}

/**
 * The policy (AI-§A.4): the first cloud block in order, the Director and deep lines, and the impersonation rule (D70):
 * a "View as store" session gets `live: []`, `cloud.available = false` with `state` and the local rung off, so no AI
 * action renders and nothing is spent. `creditsLeft` / `dayLeft` are reported whatever the block (the chips show them).
 */
export function buildPolicy(i: PolicyInputs): AiPolicy {
  const block = cloudBlockFor(i.cloud);
  const available = block === null;
  const imp = i.cloud.impersonation;
  const { director, directorBlock } = directorFor({ ...i.director, cloudAvailable: available });
  const deepPass = deepPassFor({ cloudAvailable: available, storeDeepPass: i.deep.storeDeepPass, classDown: i.deep.classDown, passesLeft: i.deep.passesLeft, jobRunning: i.deep.jobRunning });
  return {
    mode: i.cloud.mode,
    cloud: {
      available,
      block,
      creditsLeft: imp ? null : i.cloud.creditsLeft,
      dayLeft: imp ? null : i.cloud.dayLeft,
      director,
      directorBlock,
      directorPassCredits: i.directorPassCredits,
      directorPassesLeft: imp ? null : i.director.passesLeft,
      deepPass,
      deepPassesLeft: imp ? null : i.deep.passesLeft,
      deepTransport: i.deep.batchAlways ? "batch" : "job",
    },
    local: imp ? { ...i.local, enabled: false } : i.local,
    autoPrefersCloud: imp ? {} : i.autoPrefersCloud,
    live: imp ? [] : i.live,
    transport: i.transport,
    promptVersions: imp ? {} : i.promptVersions,
    voiceLocal: imp ? "" : i.voiceLocal,
    workerName: i.workerName,
  };
}

/* ------------------------------------------------------------------ */
/* ladderFor (the AI-§A.4 decision table)                              */
/* ------------------------------------------------------------------ */

type LadderRow = "local_only" | "analyze" | "copy_main" | "copy_field" | "translate" | "director" | "critique_doc" | "deep" | "server_only" | "library_first";

const ROWS: Readonly<Record<AiTaskId, LadderRow>> = {
  classify: "local_only",
  removeBackground: "local_only",
  embed: "local_only",
  "image.studio": "local_only",
  analyze: "analyze",
  "copy.hero": "copy_main",
  "copy.page": "copy_main",
  "copy.field": "copy_field",
  "copy.translate": "translate",
  "design.plan": "director",
  "design.critique": "director",
  "design.verify": "director",
  "critique.doc": "critique_doc",
  "store.blueprint": "deep",
  "logo.system": "deep",
  "logo.params": "server_only",
  "offers.advise": "server_only",
  "callcenter.script": "server_only",
  "ad.brief": "server_only",
  "copilot.turn": "server_only",
  "seo.meta": "server_only",
  "media.alt": "server_only",
  "product.describe": "server_only",
  "injection.screen": "server_only",
  "eval.judge": "server_only",
  "risk.explain": "library_first",
  "insights.weekly": "library_first",
  "insights.why": "library_first",
  "health.report": "library_first",
  "brief.today": "library_first",
  "memory.distill": "library_first",
};

/**
 * Server-only tasks with no library rung: hidden in "On-device only" (AI-§A.4 "the feature is hidden"). Every other
 * server-only task has one (the kit templates, the OP-05 script, `suggestOffers()`, the alt template, the keyword
 * heuristic for `injection.screen`, the generator's rules for `logo.params`; AI-§A.5).
 */
const NO_LIBRARY: ReadonlySet<AiTaskId> = new Set<AiTaskId>(["eval.judge"]);

const TIER_RANK: Record<DeviceTier, number> = { off: 0, lite: 1, full: 2 };

/** The device tier the store allows: the device's, capped by `store_ai.localTierCeiling`; off when local AI is off. */
export function effectiveTier(policy: Pick<AiPolicy, "local">, device: DeviceInfo): DeviceTier {
  if (!policy.local.enabled) return "off";
  return TIER_RANK[device.tier] <= TIER_RANK[policy.local.tierMax] ? device.tier : policy.local.tierMax;
}

/**
 * The ladder for one run: the first rung is tried first; a failure with `retryable` or a policy block moves down
 * (`ladderAdvances`). A task that is not live is invisible (empty ladder). The server rung needs `cloud.available` and
 * never appears in "On-device only" (the server refuses it anyway, `store_local_only`); the local rung needs local AI on
 * and a tier (the VLM in Auto only when cached: nothing waits for a download, D59); the library rung never fails.
 * `opts.upgrade` = the owner asked for the AI version of a library-first task (AI-§A.4 last row).
 */
export function ladderFor(policy: AiPolicy, task: AiTaskId, device: DeviceInfo, opts: { upgrade?: boolean } = {}): AiProviderId[] {
  if (!policy.live.includes(task)) return [];
  const mode = policy.mode;
  const tier = effectiveTier(policy, device);
  const cloud = policy.cloud.available && mode !== "local";
  const row = ROWS[task];
  const order = (rungs: (AiProviderId | false)[]): AiProviderId[] => rungs.filter((r): r is AiProviderId => r !== false);
  let ladder: AiProviderId[];
  switch (row) {
    case "local_only":
      ladder = order([tier !== "off" && "local"]);
      break;
    case "analyze": {
      const vlm = tier !== "off";
      if (mode === "local") ladder = order([vlm && "local"]);
      else if (mode === "server") ladder = order([cloud && "server", vlm && "local"]);
      else ladder = order([cloud && "server", vlm && device.vlmCached && "local"]);
      break;
    }
    case "copy_main": {
      const canLocal = tier !== "off";
      if (mode === "local") ladder = order([canLocal && "local", "library"]);
      else if (mode === "server") ladder = order([cloud && "server", canLocal && "local", "library"]);
      else if (tier === "full" && !device.mobile && !device.saveData) ladder = order(["local", cloud && "server", "library"]);
      else ladder = order([cloud && "server", canLocal && "local", "library"]);
      break;
    }
    case "copy_field":
    case "translate": {
      // translate's library rung = keep the source text, marked "not translated yet"
      const canLocal = tier !== "off";
      ladder = mode === "local" ? order([canLocal && "local", "library"]) : order([cloud && "server", canLocal && "local", "library"]);
      break;
    }
    case "director": {
      // the library rung is the instant set (the engine's three directions); never a local rung in R1
      const director = policy.cloud.director === "auto" || policy.cloud.director === "ask";
      ladder = mode === "local" ? ["library"] : order([cloud && director && "server", "library"]);
      break;
    }
    case "critique_doc":
      // library = design's deterministic repairs (repairDoc); local critique-lite is R3 and only if the harness justifies it
      ladder = mode === "local" ? ["library"] : order([cloud && "server", "library"]);
      break;
    case "deep":
      // server = a detached job (pattern B, or C when deepTransport is "batch"); library = the generator's rules
      ladder = mode === "local" ? ["library"] : order([cloud && policy.cloud.deepPass && "server", "library"]);
      break;
    case "server_only": {
      const lib = !NO_LIBRARY.has(task);
      ladder = mode === "local" ? order([lib && "library"]) : order([cloud && "server", lib && "library"]);
      break;
    }
    case "library_first":
      ladder = mode === "server" || (mode === "auto" && opts.upgrade) ? order(["library", cloud && "server"]) : ["library"];
      break;
  }
  // autoPrefersCloud moves the server rung to the front of the Auto row (set only from eval results, AI-§F.6)
  if (mode === "auto" && policy.autoPrefersCloud[task] && ladder.includes("server") && row !== "library_first") {
    ladder = ["server", ...ladder.filter((r) => r !== "server")];
  }
  return ladder;
}

/* ------------------------------------------------------------------ */
/* The degrade ladder (AI-D5)                                          */
/* ------------------------------------------------------------------ */

/**
 * deep → interactive → engine + Worker copy → engine + local → engine + library, each step with a visible chip (AI-§K.5).
 * A step names the class it runs on; the model is always `platform_ai.classes[class].model`, so degrading removes a
 * stage and never swaps a model inside a class.
 */
export const DEGRADE_STEPS = ["deep", "interactive", "engine_worker", "engine_local", "engine_library"] as const;
export type DegradeStep = (typeof DEGRADE_STEPS)[number];
export const DEGRADE_CLASS: Readonly<Record<DegradeStep, TaskClass | null>> = {
  deep: "director_deep",
  interactive: "director_interactive",
  engine_worker: "worker",
  engine_local: null,
  engine_library: null,
};

/** The steps still open from `from` down, given the policy and the device; the library step is always last. */
export function degradeSteps(from: DegradeStep, policy: AiPolicy, device: DeviceInfo): DegradeStep[] {
  const cloud = policy.cloud.available && policy.mode !== "local";
  const open: Record<DegradeStep, boolean> = {
    deep: cloud && policy.cloud.deepPass,
    interactive: cloud && (policy.cloud.director === "auto" || policy.cloud.director === "ask"),
    engine_worker: cloud,
    engine_local: effectiveTier(policy, device) !== "off",
    engine_library: true,
  };
  return DEGRADE_STEPS.slice(DEGRADE_STEPS.indexOf(from)).filter((s) => open[s]);
}
