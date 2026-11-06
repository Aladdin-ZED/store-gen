"use client";
/**
 * Optimistic writes of the landing settings screens (docs/STORE-SAAS.md §I.8 rule 2; landing.md LAN-§7.3, §8.4, §3.3):
 * the screen shows the new value at once, the server action runs with a fresh op id (its idempotency key,
 * src/lib/landing/op-once.server.ts), a refusal rolls the value back and says why, and a success shows a 6 s toast
 * with Undo, which writes the previous value back the same way. `reject` lets a caller turn an `ok` answer that wrote
 * nothing (zone problems, a brand refusal) into a rollback, so the screen can show the reason inline.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/admin/client";
import { actionMessage, type ActionResult } from "../lib/action-result";

/** an op id as `OpId` accepts it: 32 hex characters, one per intent (a retry of the same intent reuses it) */
export function newOpId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export const UNDO_MS = 6_000;

export interface OptimisticOpts<T, R> {
  /** the value the screen keeps after the server answered (defaults to the value sent) */
  fromResult?: (data: R, sent: T) => T;
  /** a reason (already translated) to roll back although the action answered ok; the caller shows it inline */
  reject?: (data: R) => string | null;
}

export function useOptimistic<T, R>(initial: T, write: (value: T, opId: string) => Promise<ActionResult<R>>, opts: OptimisticOpts<T, R> = {}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const latest = useRef(initial);
  const { fromResult, reject } = opts;

  const apply = useCallback((v: T) => {
    latest.current = v;
    setValue(v);
  }, []);

  // the toast's Undo calls the newest `save` through a ref (a callback can't name itself while it is declared)
  const saveRef = useRef<((next: T, message: string, o?: { undo?: boolean }) => Promise<unknown>) | null>(null);
  const save = useCallback(
    async (next: T, message: string, { undo = true }: { undo?: boolean } = {}): Promise<{ ok: true; data: R } | { ok: false; reason: string }> => {
      const prev = latest.current;
      apply(next);
      setPending(true);
      let res: ActionResult<R>;
      try {
        res = await write(next, newOpId());
      } catch {
        res = { ok: false, error: "network", message: "landing.common.network" };
      } finally {
        setPending(false);
      }
      if (!res.ok) {
        apply(prev);
        const reason = actionMessage(res, t("landing.common.failed"));
        toast.error(reason);
        return { ok: false, reason };
      }
      const rejected = reject?.(res.data) ?? null;
      if (rejected) {
        apply(prev);
        return { ok: false, reason: rejected };
      }
      apply(fromResult ? fromResult(res.data, next) : next);
      toast.success(message, {
        duration: UNDO_MS,
        ...(undo ? { action: { label: t("landing.common.undo"), onClick: () => void saveRef.current?.(prev, t("landing.common.undone"), { undo: false }) } } : {}),
      });
      return { ok: true, data: res.data };
    },
    [apply, fromResult, reject, t, write],
  );

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  return { value, set: apply, save, pending, latest };
}

/* the browser's clock for the live previews: null on the server and the first paint, then a Date per minute */
let nowMinute = -1;
let nowValue: Date | null = null;
const subscribeMinute = (tick: () => void) => {
  const timer = setInterval(tick, 60_000);
  return () => clearInterval(timer);
};
const nowSnapshot = (): Date => {
  const m = Math.floor(Date.now() / 60_000);
  if (m !== nowMinute || !nowValue) {
    nowMinute = m;
    nowValue = new Date();
  }
  return nowValue;
};

export function useNow(): Date | null {
  return useSyncExternalStore(subscribeMinute, nowSnapshot, () => null);
}
