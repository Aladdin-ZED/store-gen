"use client";
/**
 * The error map in practice (P2 SHELL; platform.md PLA-§22.8 "Error codes → UI", §22.9, §10.2; docs/STORE-SAAS.md
 * §E.2, §B.7, §H.12, D65): every screen runs its writes through `run`, and a refusal becomes its surface, never raw
 * text (`./error-map.ts` decides which):
 *
 *   const actions = useActionError();
 *   const res = await actions.run(() => closeOwnStoreAction({ confirm, opId }));          // same opId on the re-run
 *   const res = await actions.run(() => uploadAction(f), { limit: { kind: "quota", metric: "media_bytes", used, limit } });
 *   actions.show(res);                                                                     // a result you already have
 *
 * - toasts go through sonner (`shell.err.*`, the state's read-only sentence, `shell.impersonation.write_refused`);
 * - `step_up` opens the step-up sheet and re-runs the same closure once after the proof (the caller's `opId` with it);
 * - `quota` / `feature_off` / `quota_platform_pending` open the limit sheet when the caller names the limit, else the
 *   sentence as a toast;
 * - `design_blocked` / `honesty_blocked` / `budget_blocked` are left to P3's publish dialog (`onBlocked`; the dialog
 *   stays open), never a toast;
 * - `job_queued` hands the job to the topbar's job chip (`pulse.trackJob`), which turns into "Ready · Open";
 * - `invalid` is the form's (field errors), unless the caller asks for a toast.
 * Every failure's code goes to the Help sheet's ring of the last five (`./client-errors.ts`).
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { ActionErrorCode, GateItem } from "@/lib/tenancy/types";
import type { ActionResult } from "../lib/action-result";
import { useT } from "@/lib/i18n/admin/client";
import { recordClientError } from "./client-errors";
import { resultErrorUi, type ErrorUi } from "./error-map";
import { useLimitSheet, type LimitSheetProps } from "./limit-sheet";
import { useStoreStepUp } from "./step-up";
import { useOptionalStore } from "./store-context";
import { usePulse } from "./use-pulse";

type Failed = { ok: false; error: ActionErrorCode; items?: GateItem[]; message?: string; jobId?: string };

export interface ActionErrorOptions {
  /** what the limit sheet shows for a `quota` / `feature_off` / `quota_platform_pending` answer */
  limit?: LimitSheetProps;
  /** the publish dialog's refusals (P3): the items, the dialog stays open */
  onBlocked?(ui: Extract<ErrorUi, { ui: "publish_dialog" }>): void;
  /** `invalid` as a toast too (forms show their fields instead) */
  toastInvalid?: boolean;
  /** the job chip's label for a `job_queued` answer */
  jobLabel?: string;
  /** a short reference for the generic message (the error_events id when the server gave one) */
  ref?: string;
}

export interface ActionErrorApi {
  /** shows the surface of a failed result (nothing for a success) */
  show(result: ActionResult<unknown> | Failed, opts?: ActionErrorOptions): void;
  /** runs `fn`; a `step_up` answer asks for the proof and runs `fn` once more; any other failure is shown */
  run<T>(fn: () => Promise<ActionResult<T>>, opts?: ActionErrorOptions): Promise<ActionResult<T>>;
}

/** A short client reference for the generic toast when the server named none. */
function clientRef(): string {
  return Date.now().toString(36).slice(-6).toUpperCase();
}

export function useActionError(): ActionErrorApi {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const store = useOptionalStore();
  const pulse = usePulse();
  const stepUp = useStoreStepUp();
  const limits = useLimitSheet();
  const status = pulse.body?.store.status ?? store?.status;
  const kill = pulse.body?.kill;

  const show = useCallback<ActionErrorApi["show"]>(
    (result, opts = {}) => {
      if (result.ok) return;
      const failed = result as Failed;
      if (typeof failed.error !== "string") return;
      recordClientError(failed.error);
      const ui = resultErrorUi(failed, { where: "action", status, kill, ref: opts.ref ?? clientRef() });
      const say = (key: string, vars?: Record<string, string | number>) => toast.error(t(key, vars));
      switch (ui.ui) {
        case "toast":
          say(ui.key, ui.vars);
          return;
        case "field":
          if (opts.toastInvalid || !failed.message) say(failed.message ?? ui.key);
          return;
        case "limit_sheet": {
          const note = ui.variant === "pending_ai" ? "pending_ai" : null;
          if (opts.limit && limits && ui.variant !== "brand") limits.open(opts.limit, { note });
          else say(ui.variant === "pending_ai" ? "shell.limit.reason.pending_ai" : ui.variant === "brand" ? "shell.limit.brand_protected" : (failed.message ?? ui.key));
          return;
        }
        case "step_up":
          // `run` re-runs after the proof; a bare result only asks for it
          void stepUp.request();
          return;
        case "publish_dialog":
          opts.onBlocked?.(ui);
          return;
        case "job_chip":
          if (ui.jobId) pulse.trackJob(ui.jobId, pathname, opts.jobLabel ?? null);
          toast(t("shell.jobs.working"));
          return;
        case "reload_sheet":
          say(ui.key);
          router.refresh();
          return;
        case "sheet":
          say(failed.message ?? ui.key);
          return;
        case "page_not_found":
          say("shell.err.not_found");
          return;
      }
    },
    [t, status, kill, limits, stepUp, pulse, pathname, router],
  );

  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts: ActionErrorOptions = {}): Promise<ActionResult<T>> => {
      let res: ActionResult<T>;
      try {
        res = await stepUp.action(fn);
      } catch {
        // the request never answered (offline, a deploy in between)
        recordClientError("offline");
        toast.error(t("shell.err.offline"));
        return { ok: false, error: "server" };
      }
      if (!res.ok && res.error !== "step_up") show(res, opts);
      return res;
    },
    [stepUp, show, t],
  );

  return useMemo(() => ({ show, run }), [show, run]);
}
