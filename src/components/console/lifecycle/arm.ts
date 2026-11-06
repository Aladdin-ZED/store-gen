/**
 * The lifecycle sheet's arm window as a pure reducer (platform.md PLA-§8.0 step 2, PD54): `test:platform` pins it.
 *
 *   idle ─arm(5)→ armed(5) ─tick→ armed(4) … ─tick at 0, open and focused→ sending (fired + 1) ─settled→ sent | idle
 *                     └─cancel (Cancel, Esc, the sheet closing)→ cancelled            └─at 0 not focused→ cancelled
 *
 * Rules: Cancel works at any moment before the write and sends nothing; the write fires exactly once, when the
 * countdown reaches 0 while the sheet is still open and focused (`fired` grows by one, and the sheet sends when it
 * sees it grow); a sheet that closed or lost focus at 0 cancels instead. `armBlockers` lists what is missing before
 * the sheet may arm: the reason, the note an "Other" reason needs, the typed handle (the edge's own rule or the
 * PD54 cooldown) and the typed word of a purge.
 *
 *   const [s, dispatch] = useReducer(armReducer, ARM_IDLE);
 *   dispatch({ type: "arm", seconds: 5 });
 *   dispatch({ type: "tick", open: true, focused: document.hasFocus() });
 */

export type ArmPhase = "idle" | "armed" | "sending" | "sent" | "cancelled";
export type CancelCause = "user" | "escape" | "closed" | "unfocused";

export interface ArmState {
  phase: ArmPhase;
  /** whole seconds left while armed */
  remaining: number;
  /** the window armed with */
  total: number;
  /** how many writes this sheet has sent (grows by exactly one per completed countdown) */
  fired: number;
  cancelledBy: CancelCause | null;
}

export type ArmEvent =
  | { type: "arm"; seconds: number }
  | { type: "tick"; open: boolean; focused: boolean }
  | { type: "cancel"; by: Exclude<CancelCause, "unfocused"> }
  | { type: "settled"; ok: boolean }
  | { type: "reset" };

export const ARM_IDLE: ArmState = { phase: "idle", remaining: 0, total: 0, fired: 0, cancelledBy: null };

/** platform.lifecycle.armSeconds is 3-15 (src/lib/settings/keys/platform.ts) */
const clampSeconds = (n: number) => (Number.isFinite(n) ? Math.min(15, Math.max(1, Math.round(n))) : 5);

export function armReducer(s: ArmState, e: ArmEvent): ArmState {
  switch (e.type) {
    case "arm":
      if (s.phase === "armed" || s.phase === "sending") return s;
      return { ...s, phase: "armed", remaining: clampSeconds(e.seconds), total: clampSeconds(e.seconds), cancelledBy: null };
    case "tick": {
      if (s.phase !== "armed") return s;
      if (!e.open) return { ...s, phase: "cancelled", remaining: 0, cancelledBy: "closed" };
      const remaining = s.remaining - 1;
      if (remaining > 0) return { ...s, remaining };
      return e.focused ? { ...s, phase: "sending", remaining: 0, fired: s.fired + 1 } : { ...s, phase: "cancelled", remaining: 0, cancelledBy: "unfocused" };
    }
    case "cancel":
      return s.phase === "armed" ? { ...s, phase: "cancelled", remaining: 0, cancelledBy: e.by } : s;
    case "settled":
      return s.phase === "sending" ? { ...s, phase: e.ok ? "sent" : "idle" } : s;
    case "reset":
      return s.phase === "sending" ? s : { ...ARM_IDLE, fired: s.fired };
  }
}

/** The typed handle as the server compares it (lifecycle-rules.ts `typedHandleMatches`; the selftest keeps them equal). */
export function handleMatches(typed: string, handle: string | null): boolean {
  if (!handle) return false;
  const v = typed.trim().toLowerCase().replace(/^@/, "");
  return v.length > 0 && v === handle.toLowerCase();
}

export interface ArmRules {
  /** the store's handle (the typed confirmation) */
  handle: string | null;
  /** the edge needs the typed handle, or the PD54 cooldown does */
  typedHandle: boolean;
  /** a purge also needs the word "purge" */
  typedWord: "purge" | null;
}

export interface ArmForm {
  reason: string | null;
  note: string;
  typed: string;
  word: string;
}

export type ArmBlocker = "reason" | "note" | "handle" | "word";

/** What the sheet still needs before it may arm (empty = the primary button arms). */
export function armBlockers(rules: ArmRules, form: ArmForm): ArmBlocker[] {
  const out: ArmBlocker[] = [];
  if (!form.reason) out.push("reason");
  if (form.reason === "other" && !form.note.trim()) out.push("note");
  if (rules.typedHandle && !handleMatches(form.typed, rules.handle)) out.push("handle");
  if (rules.typedWord && form.word.trim().toLowerCase() !== rules.typedWord) out.push("word");
  return out;
}
