"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../_components/form-ui";
import { TurnstileField } from "../_components/turnstile-field";
import { IDLE } from "../_lib/form-state";
import { loginAction } from "./actions";

export function LoginForm({ next, siteKey, nonce }: { next: string | null; siteKey: string | null; nonce?: string }) {
  const t = useAuthT();
  const locale = useAdminLocale();
  const [state, action, pending] = useActionState(loginAction, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  // the human check appears once the server asks for it, and stays for the rest of the visit
  const [challenged, setChallenged] = useState(false);
  if (error?.challenge && !challenged) setChallenged(true);
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);

  // After a failed attempt, put the cursor where the user needs to act.
  useEffect(() => {
    if (state.status !== "error") return;
    const form = formRef.current;
    const target = form?.querySelector<HTMLInputElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLInputElement>('input[name="password"]');
    target?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <FormAlert message={error?.message ? t(error.message) : undefined} />
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
      <PasswordField label={t("auth.field.password")} toggleLabel={t("auth.field.show_password")} name="password" autoComplete="current-password" required maxLength={200} error={fe("password")} />
      {challenged && siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />}
      <SubmitButton pending={pending} pendingLabel={t("auth.login.pending")} className="mt-1">
        {t("auth.login.submit")}
      </SubmitButton>
    </form>
  );
}
