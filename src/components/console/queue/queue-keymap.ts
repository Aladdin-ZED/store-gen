/**
 * The approval queue's keyboard as a pure reducer (platform.md PLA-§3.5 "Keyboard", §4.7 rule 2), so the rules are
 * selftested in `test:platform` and `use-queue-keys.ts` stays a thin listener:
 *   - ignored while the focus is in a text field, while an overlay owns the keyboard, and with ⌘ / Ctrl / Alt;
 *   - `J` / `K` or `↓` / `↑` move; `Enter` or `E` open the profile; `V` view as store;
 *   - `A` approve, `I` ask, `R` reject, `S` snooze (rows that can be decided, by staff who may decide);
 *   - `X` selects; `Shift+A` approves the selected rows, in the Fast lane tab only and over fast-lane rows only;
 *   - `Escape` clears the selection; `/` and `?` are the shell's (the page search and the shortcut sheet).
 * After a decision the next row gets the focus (`nextAfterDecision`) and the split view prefetches its detail.
 *
 *   const cmd = queueKeyCommand(state, { key: "j", shift: false, mod: false, editable: false, overlay: false });
 *   if (cmd.kind === "focus") setActive(cmd.id);
 */
import type { QueueTab } from "@/lib/platform/queue-rules";

export interface QueueKeyRow {
  id: string;
  /** waiting in the fast lane (band fast, no hold-class flag): the only rows Shift+A approves */
  fast: boolean;
  /** open (not decided, not read-only): A / I / R / S apply */
  decidable: boolean;
  /** a store request: no "Ask" (requests are granted or declined) */
  request: boolean;
}

export interface QueueKeyState {
  rows: readonly QueueKeyRow[];
  active: string | null;
  selected: readonly string[];
  tab: QueueTab;
  canDecide: boolean;
}

export interface QueueKeyPress {
  key: string;
  shift: boolean;
  /** ⌘, Ctrl or Alt held */
  mod: boolean;
  /** the event's target is an input, a textarea, a select or contenteditable */
  editable: boolean;
  /** a dialog, sheet, menu or popover is open */
  overlay: boolean;
}

export type QueueCommand =
  | { kind: "none" }
  | { kind: "focus"; id: string }
  | { kind: "open" | "view_as" | "approve" | "ask" | "reject" | "snooze"; id: string }
  | { kind: "toggle"; id: string }
  | { kind: "clear" }
  | { kind: "bulk_approve"; ids: string[] };

const NONE: QueueCommand = { kind: "none" };

function step(state: QueueKeyState, by: 1 | -1): QueueCommand {
  const { rows, active } = state;
  if (!rows.length) return NONE;
  const at = active ? rows.findIndex((r) => r.id === active) : -1;
  if (at < 0) return { kind: "focus", id: (by === 1 ? rows[0] : rows[rows.length - 1])!.id };
  const next = rows[Math.max(0, Math.min(rows.length - 1, at + by))]!;
  return next.id === active ? NONE : { kind: "focus", id: next.id };
}

/** The rows Shift+A approves: the selection, in order, that is still in the fast lane. */
export function bulkApprovable(state: Pick<QueueKeyState, "rows" | "selected" | "tab">): string[] {
  if (state.tab !== "fast") return [];
  const picked = new Set(state.selected);
  return state.rows.filter((r) => picked.has(r.id) && r.fast && r.decidable).map((r) => r.id);
}

export function queueKeyCommand(state: QueueKeyState, press: QueueKeyPress): QueueCommand {
  if (press.editable || press.overlay || press.mod) return NONE;
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  if (key === "j" || key === "ArrowDown") return press.shift ? NONE : step(state, 1);
  if (key === "k" || key === "ArrowUp") return press.shift ? NONE : step(state, -1);
  if (key === "Escape") return state.selected.length ? { kind: "clear" } : NONE;
  if (key === "a" && press.shift) {
    if (!state.canDecide) return NONE;
    const ids = bulkApprovable(state);
    return ids.length ? { kind: "bulk_approve", ids } : NONE;
  }
  const row = state.active ? state.rows.find((r) => r.id === state.active) : undefined;
  if (!row) return NONE;
  if (press.shift) return NONE;
  switch (key) {
    case "Enter":
    case "e":
      return { kind: "open", id: row.id };
    case "v":
      return { kind: "view_as", id: row.id };
    case "x":
      return { kind: "toggle", id: row.id };
    case "a":
    case "r":
    case "s":
      if (!state.canDecide || !row.decidable) return NONE;
      return { kind: key === "a" ? "approve" : key === "r" ? "reject" : "snooze", id: row.id };
    case "i":
      if (!state.canDecide || !row.decidable || row.request) return NONE;
      return { kind: "ask", id: row.id };
    default:
      return NONE;
  }
}

/** The row that gets the focus once `decided` leaves the list: the one after it, else the one before, else none. */
export function nextAfterDecision(ids: readonly string[], decided: string): string | null {
  const at = ids.indexOf(decided);
  if (at < 0) return ids[0] ?? null;
  return ids[at + 1] ?? ids[at - 1] ?? null;
}

/** The rows left after several leave at once (bulk approve): the first remaining row after the first one decided. */
export function nextAfterMany(ids: readonly string[], decided: readonly string[]): string | null {
  const gone = new Set(decided);
  const first = ids.findIndex((id) => gone.has(id));
  const rest = ids.filter((id) => !gone.has(id));
  if (!rest.length) return null;
  if (first < 0) return rest[0]!;
  const after = ids.slice(first).find((id) => !gone.has(id));
  return after ?? rest[rest.length - 1]!;
}
