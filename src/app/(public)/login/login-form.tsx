"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../_components/form-ui";
import { TurnstileField } from "../_components/turnstile-field";
import { IDLE, formStateOf, type FormState, type Refusals } from "../_lib/form-state";
import { loginAction } from "./actions";
import { ForgotPassword } from "./forgot-sheet";

/** the seam's refusals of a sign-in (its own outcomes come back as the form state) */
const LOGIN_REFUSALS: Refusals = { keys: { rate_limited: "auth.login.limited", busy: "auth.login.busy" }, message: false, keep: ["email"] };

export function LoginForm({ next, siteKey, nonce, supportWhatsapp }: { next: string | null; siteKey: string | null; nonce?: string; supportWhatsapp: string | null }) {
  const t = useAuthT();
  const locale = useAdminLocale();
  const [state, action, pending] = useActionState(
    async (prev: FormState, data: FormData) => formStateOf(await loginAction(data), prev, data, LOGIN_REFUSALS),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  // the human check appears once the server asks for it, and stays for the rest of the visit
  const [challenged, setChallenged] = useState(false);
  if (error?.challenge && !challenged) setChallenged(true);
  // the challenge is a step, not a failure: its sentence sits above the widget instead of the error alert
  const message = error?.message && !(error.challenge && challenged && siteKey) ? t(error.message) : undefined;
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);

  // After a failed attempt, put the cursor where the user needs to act.
  useEffect(() => {
    if (state.status !== "error") return;
    const form = formRef.current;
    const target = form?.querySelector<HTMLInputElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLInputElement>('input[name="password"]');
    target?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-3">
      {next && <input type="hidden" name="next" value={next} />}
      <FormAlert message={message} />
      <TextField
        label={t("auth.field.email")}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        dir="ltr"
        required
        autoFocus
        maxLength={191}
        defaultValue={error?.values?.email ?? ""}
        error={fe("email")}
      />
      <PasswordField
        label={t("auth.field.password")}
        toggleLabel={t("auth.field.show_password")}
        labelAside={<ForgotPassword supportWhatsapp={supportWhatsapp} />}
        name="password"
        autoComplete="current-password"
        required
        maxLength={200}
        error={fe("password")}
      />
      {challenged && siteKey && (
        <div role="status" className="mt-2 grid gap-3 rounded-[var(--r-card)] bg-muted/60 p-4">
          <p className="text-[13px] leading-relaxed text-pretty">{t("auth.login.challenge_note")}</p>
          <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />
        </div>
      )}
      <SubmitButton pending={pending} pendingLabel={t("auth.login.pending")} className="mt-3">
        {t("auth.login.submit")}
      </SubmitButton>
    </form>
  );
}
