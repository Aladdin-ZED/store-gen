import "server-only";
/**
 * The reveal-rate alarm (operations.md OPE-§8.4, OP-19; R2, S4 LOGISTICS owns this file). The contract step (C2-C) froze the
 * three functions of the maintainer's R2 seams in P4's files:
 *   - `revealGate(scope, userId)`: in `reveal.ts` `run()` after the rate limit; `{ ok: false, pausedUntil }` answers
 *     `reveal_paused` (HTTP 429 with the code, "Too many numbers opened. Ask your manager.");
 *   - `noteReveal(scope, userId, countThisHour)`: after `appendEvents`, raises the alarm / pause past the thresholds;
 *   - `revealAlarmStates(scope, userIds)`: the queue board's agent rows (`board.server.ts`), only agents in alarm or
 *     paused are keyed (`pausedUntil` ISO or null).
 * Contract bodies until S4 merges: open gate, no-op, no state (no alarm can exist before S4), so reveals behave as in R1.
 */
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

export interface RevealAlarmState {
  state: "alarm" | "paused";
  count: number;
  pausedUntil: string | null;
}

/** May this agent reveal a number now? S4 (contract body: always). */
export async function revealGate(scope: WriteScope, userId: string): Promise<{ ok: true } | { ok: false; pausedUntil: Date }> {
  void scope;
  void userId;
  return { ok: true };
}

/** Count one reveal of this hour toward the alarm. S4 (contract body: no-op). */
export async function noteReveal(scope: WriteScope, userId: string, countThisHour: number): Promise<void> {
  void scope;
  void userId;
  void countThisHour;
}

/** The alarm state of these agents (absent = normal). S4 (contract body: none). */
export async function revealAlarmStates(scope: StoreScope, userIds: string[]): Promise<Record<string, RevealAlarmState>> {
  void scope;
  void userIds;
  return {};
}
