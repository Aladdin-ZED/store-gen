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
import { platformSetting } from "@/lib/auth/platform-config";
import { getRequestContext } from "@/lib/auth/request";
import { signupAccount, type SignupForm } from "@/lib/auth/signup";
import { newHandleProblem } from "@/lib/auth/stores";
import { isAdminLocale } from "@/lib/i18n/admin";
import { assertActionOrigin } from "@/lib/tenancy/seam";
import { field, fieldErrorsOf, formError, type FormState } from "../_lib/form-state";

export type SignupState = FormState | { status: "waitlisted"; reason: "mode" | "capped" } | { status: "closed" };

const VALUES = ["name", "email", "phone", "storeName", "handle", "market", "inviteCode", "note"] as const;

export async function signupAction(_prev: SignupState, data: FormData): Promise<SignupState> {
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

  const r = await publicAction("signup", (ctx) => signupAccount(form, ctx), { turnstile: "challenge", burst: "signup", token: field(data, "cf-turnstile-response", 2048) || null });
  if (!r.ok) {
    if (r.error === "invalid" && r.items?.length) return formError(undefined, fieldErrorsOf(r.items), values);
    const message = r.message ?? (r.error === "rate_limited" ? "error.rate_limited" : r.error === "busy" ? "error.busy" : r.error === "challenge" ? "auth.signup.challenge" : "error.server");
    return formError(message, undefined, values, { challenge: r.error === "challenge" });
  }
  const outcome = r.data;
  if (outcome.kind === "closed") return { status: "closed" };
  if (outcome.kind === "waitlisted") return { status: "waitlisted", reason: outcome.reason };
  await setSessionCookie(outcome.session.token, outcome.session.cookieExpiresAt);
  redirect(`/app/${outcome.handle}`);
}

/** The live handle check: null = free (as far as anyone may know before the insert), else the field's message key. */
export async function checkHandleAction(handle: unknown): Promise<{ problem: string | null; limited?: true }> {
  await assertActionOrigin();
  if (typeof handle !== "string" || handle.length > 64) return { problem: "auth.signup.handle_format" };
  const { ip } = await getRequestContext();
  if (!(await limits.handleIp(ip)).ok) return { problem: null, limited: true };
  return { problem: await newHandleProblem(handle.trim().toLowerCase(), await platformSetting()) };
}
