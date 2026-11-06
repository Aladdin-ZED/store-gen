"use client";
/**
 * One guarded console write (platform.md PLA-§4.4, §4.5): the sheet keeps one operation id for its whole life, sends,
 * and on `{ ok: false, error: "step_up" }` opens the StepUpSheet and resends the same call (same opId) once the code
 * is verified. Other refusals come back as one problem line (the action's message key, or the fallback).
 *
 *   const g = useGuarded();
 *   const r = await g.run((opId) => banUserAction({ userId, reason, opId }));   // null while a step-up is pending
 *   return <>{form}{g.sheet}</>;
 */
import { useRef, useState, type ReactElement } from "react";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "@/lib/tenancy/types";
import { newOpId } from "./op";

export interface Guarded {
  /** sends `call(opId)`; resolves with the success data, or null (refused: `problem` says why; or waiting for a step-up) */
  run<T>(call: (opId: string) => Promise<ActionResult<T>>, onDone?: (data: T) => void): Promise<T | null>;
  busy: boolean;
  problem: string | null;
  setProblem(p: string | null): void;
  /** a new operation id (a new sheet, or a changed decision) */
  reset(): void;
  sheet: ReactElement;
}

export function useGuarded(fallback = "console.action.failed"): Guarded {
  const t = useT();
  const opId = useRef(newOpId());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<null | (() => void)>(null);

  async function run<T>(call: (opId: string) => Promise<ActionResult<T>>, onDone?: (data: T) => void): Promise<T | null> {
    setBusy(true);
    setProblem(null);
    const r: ActionResult<T> = await call(opId.current).catch(() => ({ ok: false as const, error: "server" as const }));
    setBusy(false);
    if (r.ok) {
      onDone?.(r.data);
      return r.data;
    }
    if (r.error === "step_up") {
      setWaiting(() => () => void run(call, onDone));
      return null;
    }
    setProblem(r.message ? t(r.message) : t(r.error === "unavailable" ? "console.action.unavailable" : r.error === "rate_limited" ? "console.action.rate_limited" : fallback));
    return null;
  }

  return {
    run,
    busy,
    problem,
    setProblem,
    reset: () => {
      opId.current = newOpId();
      setProblem(null);
    },
    sheet: (
      <StepUpSheet
        open={waiting !== null}
        surface="console"
        method="totp"
        onClose={() => setWaiting(null)}
        onVerified={() => {
          const again = waiting;
          setWaiting(null);
          again?.();
        }}
      />
    ),
  };
}
