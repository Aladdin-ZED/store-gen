"use server";
/**
 * `/signup` (docs/STORE-SAAS.md §B.2): `signupAction` runs
 *
 *   publicAction("signup", (ctx) => signupAccount(form, ctx), { turnstile: "challenge", burst: "signup", token })
 *
 * so the same-origin check, the burst floor and `p:signup:ip` 5/h pass first, then src/lib/auth/signup.ts decides
 * (the mode, the human check, the fields, the score, the daily ceiling, one transaction). A created account gets its
 * session here and lands on its store. `checkHandleAction` is the form's live availability check
 * (`p:handle:ip` 60 / 10 min); it never says why a handle is taken.
 */
import { redirect } from "next/navigation";
import { publicAction } from "@/lib/auth";
import { limits } from "@/lib/auth/attempts";
import { setSessionCookie } from "@/lib/auth/cookies";
import { signupAccount, type SignupForm } from "@/lib/auth/signup";
import { newHandleProblem } from "@/lib/auth/stores";
import { isAdminLocale } from "@/lib/i18n/admin";
import type { ActionResult } from "@/lib/tenancy/types";
import { field, type FormState } from "../_lib/form-state";

export type SignupState = FormState | { status: "waitlisted"; reason: "mode" | "capped" } | { status: "closed" };

const VALUES = ["name", "email", "phone", "storeName", "handle", "market", "inviteCode", "note"] as const;

export async function signupAction(data: FormData): Promise<ActionResult<SignupState>> {
  return publicAction(
    "signup",
    async (ctx): Promise<SignupState> => {
      const values: Record<string, string> = {};
      for (const name of VALUES) values[name] = field(data, name, name === "note" ? 600 : 200);
      const locale = field(data, "locale", 4);
      const formMs = Number(field(data, "formMs", 12));
      const form: SignupForm = {
        name: values.name,
        email: values.email,
        password: field(data, "password", 1024),
        phone: values.phone || undefined,
        storeName: values.storeName,
        handle: values.handle,
        mode: "landing",
        market: values.market || undefined,
        inviteCode: values.inviteCode || undefined,
        acceptLegal: field(data, "acceptLegal", 8) === "on",
        formMs: Number.isFinite(formMs) ? formMs : null,
        locale: isAdminLocale(locale) ? locale : "fr",
        note: values.note || undefined,
      };
      const outcome = await signupAccount(form, ctx);
      if (outcome.kind === "closed") return { status: "closed" };
      if (outcome.kind === "waitlisted") return { status: "waitlisted", reason: outcome.reason };
      await setSessionCookie(outcome.session.token, outcome.session.cookieExpiresAt);
      redirect(`/app/${outcome.handle}`);
    },
    { turnstile: "challenge", burst: "signup", token: field(data, "cf-turnstile-response", 2048) || null },
  );
}

/** The live handle check: null = free (as far as anyone may know before the insert), else the field's message key. */
export async function checkHandleAction(handle: unknown): Promise<ActionResult<{ problem: string | null; limited?: true }>> {
  return publicAction(
    "handle",
    async (ctx) => {
      if (typeof handle !== "string" || handle.length > 64) return { problem: "auth.signup.handle_format" };
      if (!(await limits.handleIp(ctx.ip)).ok) return { problem: null, limited: true as const };
      return { problem: await newHandleProblem(handle.trim().toLowerCase()) };
    },
    { turnstile: "challenge", burst: "handle" },
  );
}
