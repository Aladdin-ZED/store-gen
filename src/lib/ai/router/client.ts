/**
 * The browser rung of the AI router (P7 AI; ai.md AI-§A.7, AI-D2; docs/STORE-SAAS.md §K.2, §K.3; P0b CCR P2-10).
 * Browser module: no server import. `useAiTask(task, ctx)` walks `ladderFor(policy, task, device)` on the client
 * (server rung = one POST the server re-checks, then the local model, then the library); `useDeviceInfo()` reads the
 * device for that ladder; `cancelStoreAiJobs(storeId)` is the cancel hook P2's `clearStoreClientState` calls on a
 * store switch and on sign-out (platform.md PLA-§22.3). The signatures are frozen (src/lib/contracts/r1-p0b-design.ts)
 * because P2 mounts them before P7 merges; the component mounts are P7-11, at the P7 merge.
 *
 * P0b stubs, the "Cloud AI off" state of a platform without P7 (like `runAi` in ./server.ts):
 *   - `useAiTask`: state idle, nothing run; `run` resolves the typed failure `disabled` (not retryable), so the caller
 *     takes its library path; `cancel` does nothing (nothing runs);
 *   - `useDeviceInfo`: the most conservative profile (a phone on save-data with no local tier), which turns every model
 *     download off; it is never displayed, and P7 replaces it with the measured device;
 *   - `cancelStoreAiJobs`: a no-op (no job runs in the browser yet).
 */
import type { AiPolicy, DeviceInfo } from "../policy";
import type { AiFallbackNote, AiOutcome, AiRunOpts, AiTaskInput, AiTaskOutput } from "../provider/types";
import type { AiProviderId, AiSurface, AiTaskId } from "../tasks";

/** What a mounted task shows: its run status, the rung that answered, the fallbacks taken, the streamed fields. */
export interface AiTaskState {
  status: "idle" | "running" | "done" | "error";
  provider: AiProviderId | null;
  notes: AiFallbackNote[];
  fields: Record<string, unknown>;
  credits: number | null;
}

/** The idle state (one object: a stub never runs, so it never changes). */
const IDLE: AiTaskState = { status: "idle", provider: null, notes: [], fields: {}, credits: null };

/** The hook's run and cancel: stable functions, so a caller may list them in effect dependencies. */
async function runDisabled(): Promise<AiOutcome<never>> {
  return { ok: false, code: "disabled", retryable: false, provider: "server", runId: null };
}
function cancelNothing(): void {}

/** One browser task (AI-§A.7). P0b stub: idle; `run` answers `disabled`. */
export function useAiTask<T extends AiTaskId>(
  task: T,
  ctx: { handle: string; policy: AiPolicy; device: DeviceInfo },
): {
  state: AiTaskState;
  run(input: AiTaskInput<T>, opts?: Omit<AiRunOpts, "surface"> & { surface: AiSurface }): Promise<AiOutcome<AiTaskOutput<T>>>;
  cancel(): void;
} {
  void task;
  void ctx;
  return { state: IDLE, run: runDisabled, cancel: cancelNothing };
}

/** The most conservative device: a phone on save-data without a local tier (no model download). */
const CONSERVATIVE_DEVICE: DeviceInfo = { tier: "off", mobile: true, saveData: true, vlmCached: false };

/** The device the ladder reads (capabilities.ts + userAgentData.mobile / pointer: coarse + connection.saveData). P0b stub. */
export function useDeviceInfo(): DeviceInfo {
  return CONSERVATIVE_DEVICE;
}

/** Cancels the store's running browser AI jobs (P2's clearStoreClientState, PLA-§22.3). P0b stub: nothing runs. */
export function cancelStoreAiJobs(storeId: string): void {
  void storeId;
}
