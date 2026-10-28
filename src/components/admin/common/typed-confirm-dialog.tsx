"use client";
/**
 * TypedConfirmDialog (P2 SHELL; platform.md PLA-§22.12, §8, PD1, PD54): the confirmation of an irreversible or
 * high-impact action that unlocks only when the expected text (a handle, "delete", …) is typed exactly.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders nothing while closed; while open, a
 * plain dialog with the title, the body, the expected text over its input and the confirm button, enabled once the
 * typed text equals `expected` (Escape calls `onClose`). The typed text starts empty at every opening.
 */
import { useId, useState, type ReactElement, type ReactNode } from "react";

export interface TypedConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  expected: string;
  confirmLabel: string;
  tone: "danger" | "warn";
  onConfirm(): Promise<void>;
  onClose(): void;
}

export function TypedConfirmDialog(p: TypedConfirmDialogProps): ReactElement | null {
  return p.open ? <OpenDialog {...p} /> : null;
}

function OpenDialog(p: TypedConfirmDialogProps) {
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <dialog
      open
      aria-labelledby={titleId}
      data-tone={p.tone}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) p.onClose();
      }}
    >
      <h2 id={titleId}>{p.title}</h2>
      <div>{p.body}</div>
      <label>
        <code>{p.expected}</code>
        <input value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={busy || typed !== p.expected}
        onClick={async () => {
          setBusy(true);
          try {
            await p.onConfirm();
          } finally {
            setBusy(false);
          }
        }}
      >
        {p.confirmLabel}
      </button>
    </dialog>
  );
}
