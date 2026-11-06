"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { AdminLocale } from "@/lib/i18n/admin";
import { FormAlert, PasswordField, SubmitButton } from "../../_components/form-ui";
import { PasswordTicks } from "../../_components/password-ticks";
import { TurnstileField } from "../../_components/turnstile-field";
import { IDLE, formStateOf, type FormState } from "../../_lib/form-state";
import { resetAction } from "./actions";

export function ResetForm({ token, locale, siteKey, nonce }: { token: string; locale: AdminLocale; siteKey: string | null; nonce?: string }) {
  const t = useAuthT();
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => formStateOf(await resetAction(data), prev, data), IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const error = state.status === "error" ? state : null;
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <FormAlert message={error?.message ? t(error.message) : undefined} />
      <div className="grid gap-2">
      <PasswordField
        label={t("auth.field.new_password")}
        toggleLabel={t("auth.field.show_password")}
        name="password"
        autoComplete="new-password"
        required
        autoFocus
        maxLength={200}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fe("password")}
      />
      <PasswordTicks password={password} email={null} />
      </div>
      <PasswordField label={t("auth.field.confirm_password")} toggleLabel={t("auth.field.show_password")} name="confirm" autoComplete="new-password" required maxLength={200} error={fe("confirm")} />
      {siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />}
      <SubmitButton pending={pending} pendingLabel={t("auth.reset.pending")} className="mt-3">
        {t("auth.reset.submit")}
      </SubmitButton>
    </form>
  );
}
