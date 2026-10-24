/**
 * The result of the sign-in pages' form actions (useActionState-friendly). Messages are catalog keys (the identity
 * catalog, src/lib/auth/i18n), rendered by the form in the page's language: an action never builds user-facing text.
 * Successful flows usually redirect, so a success state only carries what a page must display.
 */
import type { ActionResult, GateItem } from "@/lib/tenancy/types";

export type FieldErrors = Partial<Record<string, string>>;

export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      /** form-level message key (generic for credential errors) */
      message?: string;
      /** field name → message key */
      fieldErrors?: FieldErrors;
      /** non-secret values to restore into the form after an error */
      values?: Record<string, string>;
      /** the server wants the human check before the next attempt (§B.3) */
      challenge?: boolean;
      /** bumps on every refused submit, so the human check re-arms */
      attempt?: number;
    };

export const IDLE: FormState = { status: "idle" };

export function formError(message?: string, fieldErrors?: FieldErrors, values?: Record<string, string>, extra: { challenge?: boolean } = {}): FormState {
  return { status: "error", message, fieldErrors, values, ...extra, attempt: Date.now() };
}

/** The field errors of an `invalid` action result (one `items` entry per field, §E.2). */
export function fieldErrorsOf(items: readonly GateItem[] | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const item of items ?? []) if (item.field && !out[item.field]) out[item.field] = item.title;
  return out;
}

/** Reads a string field from FormData (files and missing fields become ""), bounded in length. */
export function field(data: FormData, name: string, max = 1024): string {
  const value = data.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** What a form shows for a seam refusal (the action's own outcomes arrive as its state). */
export interface Refusals {
  /** error code → message key, over the defaults (rate_limited, busy, challenge) */
  keys?: Partial<Record<string, string>>;
  /** use the refusal's own message key when it has one (default true) */
  message?: boolean;
  /** non-secret fields restored into the form after a refusal */
  keep?: readonly string[];
  /** the key of a code with no entry (default "error.server") */
  fallback?: (code: string) => string;
}

const REFUSAL_KEYS: Readonly<Record<string, string>> = { rate_limited: "error.rate_limited", busy: "error.busy", challenge: "auth.challenge" };

/**
 * The form state from a server action's result (lint L9: every action body is `return <seam>(…)`, so a refusal of
 * the seam itself arrives here, not in the action): `invalid` with items → field errors, any other code → a
 * form-level message key; the kept fields are read back from the submitted data. An undefined result (the action
 * redirected) keeps the previous state.
 */
export function formStateOf<S>(r: ActionResult<S> | undefined, prev: S, data: FormData, refusals: Refusals = {}): S | FormState {
  if (!r) return prev;
  if (r.ok) return r.data;
  const values: Record<string, string> = {};
  for (const name of refusals.keep ?? []) values[name] = field(data, name, 600);
  if (r.error === "invalid" && r.items?.length) return formError(undefined, fieldErrorsOf(r.items), values);
  const own = refusals.message === false ? undefined : r.message;
  return formError(own ?? refusals.keys?.[r.error] ?? REFUSAL_KEYS[r.error] ?? refusals.fallback?.(r.error) ?? "error.server", undefined, values, { challenge: r.error === "challenge" });
}
