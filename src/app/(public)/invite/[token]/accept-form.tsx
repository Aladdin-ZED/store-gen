"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { AdminLocale } from "@/lib/i18n/admin";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../../_components/form-ui";
import { TurnstileField } from "../../_components/turnstile-field";
import { IDLE, formStateOf, type FormState } from "../../_lib/form-state";
import { acceptInviteAction } from "./actions";

/** "accept": the signed-in invitee confirms; "sign_up": a new account with the invited e-mail locked (D10). */
export function AcceptForm({
  token,
  mode,
  emailMasked,
  locale,
  siteKey,
  nonce,
}: {
  token: string;
  mode: "accept" | "sign_up";
  emailMasked: string;
  locale: AdminLocale;
  siteKey: string | null;
  nonce?: string;
}) {
  const t = useAuthT();
  const [state, action, pending] = useActionState(
    async (prev: FormState, data: FormData) => formStateOf(await acceptInviteAction(data), prev, data, { keep: ["name", "phone"] }),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="mt-6 grid gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={error?.message ? t(error.message) : undefined} />
      {mode === "sign_up" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{t("auth.field.email")}</Label>
            <Input id="invite-email" value={emailMasked} readOnly disabled dir="ltr" className="h-10 bg-muted/50 px-3 text-[0.9rem]" />
            <p className="text-xs text-muted-foreground">{t("team.invite.email_locked")}</p>
          </div>
          <TextField label={t("auth.field.name")} name="name" autoComplete="name" required autoFocus maxLength={120} defaultValue={error?.values?.name ?? ""} error={fe("name")} />
          <PasswordField label={t("auth.field.password")} toggleLabel={t("auth.field.show_password")} name="password" autoComplete="new-password" required maxLength={200} hint={t("auth.field.password_hint")} error={fe("password")} />
          <TextField label={t("auth.field.phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={32} defaultValue={error?.values?.phone ?? ""} hint={t("auth.field.phone_hint")} error={fe("phone")} />
        </>
      )}
      {siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />}
      <SubmitButton pending={pending} pendingLabel={t("team.invite.joining")}>
        {t(mode === "accept" ? "team.invite.accept" : "team.invite.create_and_join")}
      </SubmitButton>
    </form>
  );
}
