"use client";

import { useActionState, useEffect, useRef } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { FormAlert, PasswordField, SubmitButton, TextField } from "@/app/(public)/_components/form-ui";
import { IDLE } from "@/app/(public)/_lib/form-state";
import { setupAction } from "./actions";

export function SetupForm() {
  const t = useAuthT();
  const [state, action, pending] = useActionState(setupAction, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-5">
      <FormAlert message={error?.message ? t(error.message) : undefined} />
      <PasswordField label={t("console.setup.token")} toggleLabel={t("auth.field.show_password")} name="token" autoComplete="off" required autoFocus hint={t("console.setup.token_hint")} error={fe("token")} />
      <div className="my-1 border-t" role="presentation" />
      <TextField label={t("auth.field.name")} name="name" autoComplete="name" required maxLength={120} defaultValue={error?.values?.name ?? ""} error={fe("name")} />
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
        maxLength={191}
        defaultValue={error?.values?.email ?? ""}
        error={fe("email")}
      />
      <PasswordField label={t("auth.field.password")} toggleLabel={t("auth.field.show_password")} name="password" autoComplete="new-password" required maxLength={200} hint={t("auth.field.password_hint")} error={fe("password")} />
      <PasswordField label={t("auth.field.confirm_password")} toggleLabel={t("auth.field.show_password")} name="confirm" autoComplete="new-password" required maxLength={200} error={fe("confirm")} />
      <SubmitButton pending={pending} pendingLabel={t("console.setup.pending")} className="mt-1">
        {t("console.setup.submit")}
      </SubmitButton>
    </form>
  );
}
