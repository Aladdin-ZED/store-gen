"use server";
/**
 * `/reset/<token>` (docs/STORE-SAAS.md §B.9): a new password from a staff-issued link, through
 * `publicAction("reset")` (same-origin, the burst floor, `p:reset:ip` 10 / 15 min, the human check when the platform
 * widget exists). The link is consumed by one conditional UPDATE (src/lib/auth/reset.ts); every session of the user
 * ends, so the next stop is the sign-in page.
 */
import { redirect } from "next/navigation";
import { publicAction } from "@/lib/auth";
import { consumePasswordReset } from "@/lib/auth/reset";
import { field, fieldErrorsOf, formError, type FormState } from "../../_lib/form-state";

export async function resetAction(_prev: FormState, data: FormData): Promise<FormState> {
  const token = field(data, "token", 64);
  const password = field(data, "password", 1024);
  if (!password) return formError(undefined, { password: "auth.password.too_short" });
  if (password !== field(data, "confirm", 1024)) return formError(undefined, { confirm: "auth.reset.mismatch" });

  const r = await publicAction("reset", (ctx) => consumePasswordReset(token, password, { ip: ctx.ip }), {
    turnstile: "when-configured",
    burst: "reset",
    token: field(data, "cf-turnstile-response", 2048) || null,
  });
  if (!r.ok) {
    if (r.error === "invalid" && r.items?.length) return formError(undefined, fieldErrorsOf(r.items));
    return formError(r.message ?? (r.error === "rate_limited" ? "error.rate_limited" : r.error === "busy" ? "error.busy" : r.error === "challenge" ? "auth.challenge" : "error.server"), undefined, undefined, {
      challenge: r.error === "challenge",
    });
  }
  redirect("/login?notice=password-reset");
}
