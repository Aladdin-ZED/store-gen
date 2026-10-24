"use client";
/**
 * The identity surfaces' client helper for §E.2 action results: a localised toast for a refusal (its message key,
 * else `error.<code>`), an optional success toast, and the result back to the caller (which handles `step_up` and
 * field items itself). A network failure reads as the generic server error, never raw text.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { refusalText } from "@/lib/auth/i18n";
import { useAuthT } from "@/lib/auth/i18n/client";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import type { ActionResult } from "@/lib/tenancy/types";

type Failure = Extract<ActionResult<never>, { ok: false }>;

export interface RunOpts<T> {
  /** a message key, or a function of the data returning the text */
  success?: string | ((data: T) => string);
  /** refusal codes the caller shows itself (no toast): e.g. "step_up", "invalid" with field items */
  quiet?: readonly string[];
}

export function useRunAction(): <T>(promise: Promise<ActionResult<T>>, opts?: RunOpts<T>) => Promise<ActionResult<T>> {
  const t = useAuthT();
  const locale = useAdminLocale();
  return useCallback(
    async <T,>(promise: Promise<ActionResult<T>>, opts: RunOpts<T> = {}): Promise<ActionResult<T>> => {
      let res: ActionResult<T>;
      try {
        res = await promise;
      } catch {
        res = { ok: false, error: "server" } satisfies Failure;
      }
      if (res.ok) {
        const msg = typeof opts.success === "function" ? opts.success(res.data) : opts.success ? t(opts.success) : null;
        if (msg) toast.success(msg);
      } else if (!opts.quiet?.includes(res.error)) {
        toast.error(refusalText(res, locale));
      }
      return res;
    },
    [t, locale],
  );
}
