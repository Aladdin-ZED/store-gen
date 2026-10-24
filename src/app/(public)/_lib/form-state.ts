/**
 * The result of the sign-in pages' form actions (useActionState-friendly). Messages are catalog keys (the identity
 * catalog, src/lib/auth/i18n), rendered by the form in the page's language: an action never builds user-facing text.
 * Successful flows usually redirect, so a success state only carries what a page must display.
 */
import type { GateItem } from "@/lib/tenancy/types";

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
