"use client";
/**
 * StepUpSheet (P2 SHELL; platform.md PLA-§22.12, §14.2, §4.4, PD1, PD80; docs/STORE-SAAS.md §B.7): the fresh-code
 * sheet an action answering `{ ok: false, error: "step_up" }` opens. The console always asks for the TOTP code; the
 * tenant side asks for TOTP when enrolled, else the password (T2's `stepUpPasswordAction`), and `method` overrides it.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders nothing while closed and a plain
 * dialog while open (Escape calls `onClose`); the code form and its `onVerified` call are P2's.
 */
import type { ReactElement } from "react";

export interface StepUpSheetProps {
  open: boolean;
  onVerified(): void;
  onClose(): void;
  surface: "console" | "tenant";
  /** rev 4, PD80: tenant only; default from the viewer (TOTP when enrolled, else password); the console is always "totp" */
  method?: "totp" | "password";
}

export function StepUpSheet(p: StepUpSheetProps): ReactElement | null {
  if (!p.open) return null;
  return (
    <dialog
      open
      data-surface={p.surface}
      data-method={p.method}
      onKeyDown={(e) => {
        if (e.key === "Escape") p.onClose();
      }}
    />
  );
}
