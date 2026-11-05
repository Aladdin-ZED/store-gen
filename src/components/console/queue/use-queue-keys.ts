"use client";
/**
 * The approval queue's key listener (platform.md PLA-§3.5 "Keyboard"): one window listener that turns a key press
 * into a `QueueCommand` through the pure `queueKeyCommand` (./queue-keymap.ts) with the builder's `isEditable` /
 * `overlayOpen` rules, and hands it to the split view. `/` and `?` stay with the shell.
 *
 *   useQueueKeys(state, (cmd) => run(cmd));
 */
import { useEffect, useRef } from "react";
import { isEditable, overlayOpen } from "../_compat/chords";
import { queueKeyCommand, type QueueCommand, type QueueKeyState } from "./queue-keymap";

export function useQueueKeys(state: QueueKeyState, onCommand: (cmd: QueueCommand) => void): void {
  const latest = useRef({ state, onCommand });
  useEffect(() => {
    latest.current = { state, onCommand };
  });

  useEffect(() => {
    // the shell's "G <key>" chords win: a key within 1.2 s of a bare "g" is the chord's second key, never a decision
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (bare && e.key.toLowerCase() === "g" && !isEditable(e.target)) {
        gAt = Date.now();
        return;
      }
      if (gAt && Date.now() - gAt <= 1_200) {
        gAt = 0;
        return;
      }
      gAt = 0;
      const cmd = queueKeyCommand(latest.current.state, {
        key: e.key,
        shift: e.shiftKey,
        mod: e.metaKey || e.ctrlKey || e.altKey,
        editable: isEditable(e.target),
        overlay: overlayOpen(),
      });
      if (cmd.kind === "none") return;
      e.preventDefault();
      latest.current.onCommand(cmd);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
