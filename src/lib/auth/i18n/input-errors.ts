/**
 * Today's English `AuthInputError` texts (src/lib/auth/{mfa,users,index}.ts, still shown as-is by the legacy /admin
 * forms) mapped to the identity catalog's keys, so the account pages render them in the viewer's language. An
 * unknown text falls back to the generic `error.invalid`. Server code (the password module is server-only).
 */
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../password";

const KEYS: Readonly<Record<string, string>> = {
  "Your account is not available.": "auth.account.unavailable",
  "Two-step verification is already on.": "auth.2fa.already_on",
  "Too many attempts. Wait a few minutes and try again.": "error.rate_limited",
  "Your password is incorrect.": "auth.step_up.password_wrong",
  "Your current password is incorrect.": "auth.step_up.password_wrong",
  "This setup has expired. Start again to get a new code.": "auth.2fa.setup_expired",
  "That code didn't match. Check your device's clock and try the newest code.": "auth.2fa.code_clock",
  "Setup changed in another window. Start again.": "auth.2fa.setup_changed",
  "That code didn't match.": "auth.2fa.code_wrong",
  "Choose a password you haven't used here before.": "auth.password.reused",
  [`Use at least ${PASSWORD_MIN_LENGTH} characters.`]: "auth.password.too_short",
  [`Use at most ${PASSWORD_MAX_LENGTH} characters.`]: "auth.password.too_long",
  "Don't include your email address in your password.": "auth.password.contains_email",
  "This password is too common. Choose something less predictable.": "auth.password.common",
  "Use a less repetitive password.": "auth.password.repetitive",
};

export function inputErrorKey(message: string): string {
  return KEYS[message] ?? "error.invalid";
}
