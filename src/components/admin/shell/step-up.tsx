"use client";
/**
 * The store shell's step-up (docs/STORE-SAAS.md §B.7, SEC-17): one sheet for every screen of the store. A write that
 * answers `step_up` (a storeAction result, or a route's 403 `{ error: "step_up" }`) asks the member for a fresh proof
 * here, a TOTP code when the account has one, else the password, and is retried once after it:
 *
 *   const stepUp = useStoreStepUp();
 *   const res = await stepUp.action(() => saveExportKeyAction(raw));   // an ActionResult; retried once after the proof
 *   if (await stepUp.request()) …                                       // true once proven, false when dismissed
 *
 * The `[store]` layout renders the provider once (with the member's `totpEnabled`); the sheet itself loads on first
 * use. Outside a provider (a shared component on another surface) `request()` answers false at once.
 */
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "../lib/action-result";

const StepUpDialog = dynamic(() => import("../settings/security-panel").then((m) => m.StepUpDialog), { ssr: false });

interface StepUpApi {
  request(): Promise<boolean>;
}

const StepUpContext = createContext<StepUpApi | null>(null);

export function StepUpProvider({ totp, children }: { totp: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // every caller waiting on the sheet gets the same answer (two refused writes in a row share one proof)
  const waiting = useRef<((ok: boolean) => void)[]>([]);
  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    for (const resolve of waiting.current.splice(0)) resolve(ok);
  }, []);
  const request = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        waiting.current.push(resolve);
        setMounted(true);
        setOpen(true);
      }),
    [],
  );
  const api = useMemo(() => ({ request }), [request]);
  return (
    <StepUpContext.Provider value={api}>
      {children}
      {mounted && <StepUpDialog open={open} totp={totp} onOpenChange={(o) => !o && settle(false)} onVerified={() => settle(true)} />}
    </StepUpContext.Provider>
  );
}

export interface StoreStepUp {
  /** opens the sheet; true once the member proved it is them (the retry may run), false when they closed it */
  request(): Promise<boolean>;
  /** runs `run`; on a `step_up` answer asks for the proof and runs it once more (the first answer when dismissed) */
  action<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>>;
}

export function useStoreStepUp(): StoreStepUp {
  const api = useContext(StepUpContext);
  const request = useCallback(async () => (api ? api.request() : false), [api]);
  const action = useCallback(
    async <T,>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      const first = await run();
      if (first.ok || first.error !== "step_up") return first;
      return (await request()) ? run() : first;
    },
    [request],
  );
  return useMemo(() => ({ request, action }), [request, action]);
}

/** True when a route answered the step-up refusal (`403 { ok: false, error: "step_up" }`, src/lib/tenancy/seam.ts). */
export function isStepUpAnswer(status: number, body: unknown): boolean {
  return status === 403 && !!body && typeof body === "object" && (body as { error?: unknown }).error === "step_up";
}
