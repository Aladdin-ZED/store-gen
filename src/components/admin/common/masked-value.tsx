"use client";
/**
 * MaskedValue (P2 SHELL; platform.md PLA-§22.12, §7.2, §10.2, PD1, PD69): a customer field as the repository masked
 * it ("+212 6•• ••• •34"), with an optional audited reveal; under impersonation `reveal` is never passed.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the value and, with `reveal`, one
 * button that asks for the clear value once (every reveal is audited server-side) and then shows it.
 */
import { useState, type ReactElement } from "react";
import type { Masked } from "@/lib/platform/mask";

export interface MaskedValueProps {
  value: Masked | string;
  reveal?: { onReveal(): Promise<string>; label: string };
}

export function MaskedValue(p: MaskedValueProps): ReactElement | null {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reveal = p.reveal;
  return (
    <span>
      <span>{shown ?? p.value}</span>
      {reveal && shown === null && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setShown(await reveal.onReveal());
            } finally {
              setBusy(false);
            }
          }}
        >
          {reveal.label}
        </button>
      )}
    </span>
  );
}
