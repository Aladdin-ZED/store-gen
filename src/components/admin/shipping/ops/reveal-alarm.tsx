"use client";
/**
 * The reveal-alarm badge of the queue board's agent rows (operations.md OPE-§8.4, OP-19; R2, S4 LOGISTICS owns
 * `src/components/admin/shipping/**`). The R2 contract step (C2-E) froze its props and mounted it in P4's board
 * (src/components/admin/queue/board.tsx) for each agent whose `revealAlarm` the board server read through S4's
 * `revealAlarmStates` (absent while `releaseOn("R2")` is false). S4's body shows "alarm" / "paused until …" and, for
 * a manager (`canLift`), the audited "Lift the pause" (`callcenter.reveal_pause_lifted`). Stub until S4 merges:
 * renders nothing (`null`).
 */
import type { ReactElement } from "react";
import type { RevealAlarmState } from "@/lib/callcenter/reveal-alarm";

export interface RevealAlarmBadgeProps {
  userId: string;
  state: RevealAlarmState;
  /** the viewer may lift a pause (orders.assign, not read-only) */
  canLift: boolean;
}

/** S4 (stub: renders nothing). */
export function RevealAlarmBadge(props: RevealAlarmBadgeProps): ReactElement | null {
  void props;
  return null;
}
