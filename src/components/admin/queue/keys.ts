/**
 * The agent console's single-key map (P4 CALL CENTER; operations.md OPE-§13.3, OP-17; core §I.3). Pure and
 * isomorphic: the console matches it, `src/components/admin/shell/commands/ops.ts` registers it so the shell's `?`
 * sheet lists it beside the chords, and `test:ops` proves it disjoint from the shell chords (`G O`, `G Q` …).
 *
 * Keys are matched by `event.code` (`KeyN`, `Digit1` …), never by the character, so an Arabic or AZERTY layout presses
 * the same physical key; `?` is the one key matched by its character too (its physical key differs per layout). A key
 * never fires inside an editable field, with a modifier held, or while an overlay (dialog, sheet, menu) is open: the
 * builder's `isEditable` / `overlayOpen` rules (src/components/builder/shortcuts.ts:16-25), copied here verbatim until
 * that file exports them (CCR r1-p4-9).
 */
import type { MessageKey } from "@/lib/i18n/admin";

export type QueueKeyId = "next" | "call" | "whatsapp" | "o1" | "o2" | "o3" | "o4" | "o5" | "o6" | "edit" | "script" | "note" | "skip" | "inbound" | "deliverFrom" | "help" | "close";

export interface QueueKey {
  id: QueueKeyId;
  /** the cap shown in hints and in the `?` sheet */
  key: string;
  /** `KeyboardEvent.code` values */
  codes: readonly string[];
  /** the confirm lane's label (and every key's outside the grid) */
  label: MessageKey;
  /** the delivery lane's label of `1`-`6` (OPE-§6.1a: the same keys, remapped) */
  delivery?: MessageKey;
}

export const QUEUE_KEYS: readonly QueueKey[] = [
  { id: "next", key: "N", codes: ["KeyN"], label: "ops.key.next" },
  { id: "call", key: "C", codes: ["KeyC"], label: "ops.queue.call" },
  { id: "whatsapp", key: "W", codes: ["KeyW"], label: "ops.key.whatsapp" },
  { id: "o1", key: "1", codes: ["Digit1", "Numpad1"], label: "ops.outcome.confirmed", delivery: "ops.rescue.customer_informed" },
  { id: "o2", key: "2", codes: ["Digit2", "Numpad2"], label: "ops.outcome.no_answer", delivery: "ops.rescue.reschedule" },
  { id: "o3", key: "3", codes: ["Digit3", "Numpad3"], label: "ops.outcome.busy", delivery: "ops.outcome.no_answer" },
  { id: "o4", key: "4", codes: ["Digit4", "Numpad4"], label: "ops.outcome.callback", delivery: "ops.rescue.busy" },
  { id: "o5", key: "5", codes: ["Digit5", "Numpad5"], label: "ops.outcome.cancelled", delivery: "ops.rescue.cancel_recall" },
  { id: "o6", key: "6", codes: ["Digit6", "Numpad6"], label: "ops.outcome.more", delivery: "ops.skip" },
  { id: "edit", key: "E", codes: ["KeyE"], label: "ops.key.edit" },
  { id: "script", key: "S", codes: ["KeyS"], label: "ops.key.script" },
  { id: "note", key: "T", codes: ["KeyT"], label: "ops.key.note" },
  { id: "skip", key: "X", codes: ["KeyX"], label: "ops.key.skip" },
  { id: "inbound", key: "I", codes: ["KeyI"], label: "ops.key.inbound" },
  { id: "deliverFrom", key: "D", codes: ["KeyD"], label: "ops.hold.deliverFrom" },
  { id: "help", key: "?", codes: [], label: "ops.key.help" },
  { id: "close", key: "Esc", codes: ["Escape"], label: "ops.key.close" },
];

/** the outcome keys in grid order */
export const OUTCOME_KEYS = ["o1", "o2", "o3", "o4", "o5", "o6"] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

const BY_CODE: ReadonlyMap<string, QueueKeyId> = new Map(QUEUE_KEYS.flatMap((k) => k.codes.map((c) => [c, k.id] as const)));

/** The queue action of a key press, or null (modifiers held, or a key outside the map). */
export function queueKeyOf(e: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): QueueKeyId | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "?" || e.key === "؟") return "help";
  if (e.shiftKey && e.code === "Slash") return "help";
  if (e.shiftKey) return null;
  return BY_CODE.get(e.code) ?? null;
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/** src/components/builder/shortcuts.ts:16-20 (same rule) */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.isContentEditable || !!el.closest(EDITABLE);
}

/** src/components/builder/shortcuts.ts:22-25 (same rule): a modal surface owns the keyboard while it is open */
export function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-slot="popover-content"][data-state="open"]');
}
