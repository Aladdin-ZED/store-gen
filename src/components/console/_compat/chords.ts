"use client";
/**
 * Keyboard chords for the console (platform.md PLA-§4.3, §4.7 rule 2): `G O`-style two-key sequences and single keys
 * (`?`, `/`), never while the focus is in an editable field or while an overlay owns the keyboard (the builder's
 * `isEditable` / `overlayOpen` rules, src/components/builder/shortcuts.ts:16-25).
 *
 *   useChords([{ keys: "g o", run: () => router.push("/admin") }, { keys: "?", run: openSheet }]);
 *
 * Local copy (brief p1-08: "as a last resort, minimal local copies in src/components/console/_compat/"): P2's shared
 * `useChords()` (src/components/admin/shell/chords.ts) is not on this branch. Same rules; the verify step swaps the
 * import once P2's hook lands.
 */
import { useEffect, useRef } from "react";

export interface Chord {
  /** "g o" (a sequence, lower case) or one key ("?", "/") */
  keys: string;
  run(): void;
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
/** the second key must follow the first within this window */
const SEQUENCE_MS = 1_200;

export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.isContentEditable || !!el.closest(EDITABLE);
}

/** A modal surface (dialog, sheet, menu) owns the keyboard while it is open. */
export function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-slot="popover-content"][data-state="open"]');
}

export function useChords(chords: readonly Chord[]): void {
  const latest = useRef(chords);
  useEffect(() => {
    latest.current = chords;
  }, [chords]);

  useEffect(() => {
    let pending: { key: string; at: number } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (isEditable(e.target) || overlayOpen()) {
        pending = null;
        return;
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const now = Date.now();
      if (pending && now - pending.at <= SEQUENCE_MS) {
        const seq = `${pending.key} ${key}`;
        pending = null;
        const hit = latest.current.find((c) => c.keys === seq);
        if (hit) {
          e.preventDefault();
          hit.run();
        }
        return;
      }
      pending = null;
      const single = latest.current.find((c) => c.keys === key);
      if (single) {
        e.preventDefault();
        single.run();
        return;
      }
      if (latest.current.some((c) => c.keys.startsWith(`${key} `))) pending = { key, at: now };
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
