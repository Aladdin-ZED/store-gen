/**
 * Auth error types (isomorphic).
 */
import type { ActionErrorCode, MessageKey } from "@/lib/tenancy/types";

export type AuthErrorCode = "unauthenticated" | "forbidden" | "mfa_required";

/** Thrown by requireUser({ throwOnFail: true }); route handlers map it to 401/403. */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthError";
  }

  /** Suggested HTTP status for route handlers. */
  get status(): 401 | 403 {
    return this.code === "forbidden" ? 403 : 401;
  }
}

/** A user-facing validation problem in an auth/user-management operation. */
export class AuthInputError extends Error {
  constructor(
    message: string,
    public readonly field: "email" | "password" | "newPassword" | "name" | "role" | "code" | null = null,
  ) {
    super(message);
    this.name = "AuthInputError";
  }
}

/**
 * The scrypt semaphore is full (docs/STORE-SAAS.md §B.3: 2 running, 16 waiting, 4 s at most): the caller answers
 * HTTP 503 / `busy` with the generic busy message, never a hash computed late.
 */
export class AuthBusyError extends Error {
  constructor() {
    super("auth busy");
    this.name = "AuthBusyError";
  }

  get status(): 503 {
    return 503;
  }
}

/**
 * A refusal with its own action code (§E.2's open tail: `owns_store`, `is_staff`, `last_owner`, `challenge`, …) and
 * an optional message key; the action wrappers answer `{ ok: false, error: code, message }`.
 */
export class AuthRefusal extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    public readonly messageKey?: MessageKey,
  ) {
    super(messageKey ?? code);
    this.name = "AuthRefusal";
  }
}

/**
 * Field problems of a public or account form, one message key per field (`auth.signup.email_invalid`, …). The action
 * wrappers answer `invalid` with one `items` entry per field (`field` set) and the first key as `message`.
 */
export class FieldsError extends Error {
  constructor(public readonly fields: Readonly<Record<string, MessageKey>>) {
    super(Object.values(fields)[0] ?? "invalid");
    this.name = "FieldsError";
  }
}
