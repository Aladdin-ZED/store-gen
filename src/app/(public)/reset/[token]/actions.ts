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
import type { ActionResult } from "@/lib/tenancy/types";
import { field, formError, type FormState } from "../../_lib/form-state";

export async function resetAction(data: FormData): Promise<ActionResult<FormState>> {
  return publicAction(
    "reset",
    async (ctx) => {
      const token = field(data, "token", 64);
      const password = field(data, "password", 1024);
      if (!password) return formError(undefined, { password: "auth.password.too_short" });
      if (password !== field(data, "confirm", 1024)) return formError(undefined, { confirm: "auth.reset.mismatch" });
      await consumePasswordReset(token, password, { ip: ctx.ip });
      redirect("/login?notice=password-reset");
    },
    { turnstile: "when-configured", burst: "reset", token: field(data, "cf-turnstile-response", 2048) || null },
  );
}
