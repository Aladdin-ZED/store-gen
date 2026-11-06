"use client";
/**
 * The staff invitation's form (platform.md PLA-§14.1, PD13): "accept" for the signed-in invitee, "sign_up" for a new
 * account (name and password, the e-mail locked: the action never takes it). The action redirects on success (to the
 * two-step setup for the console); a refusal comes back as its sentence.
 */
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/admin/client";
import type { AdminLocale } from "@/lib/i18n/admin";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../../../_components/form-ui";
import { TurnstileField } from "../../../_components/turnstile-field";
import { acceptStaffInviteAction } from "./actions";

export function StaffAcceptForm({ token, mode, emailMasked, role, locale, siteKey, nonce }: { token: string; mode: "accept" | "sign_up"; emailMasked: string; role: string; locale: AdminLocale; siteKey: string | null; nonce?: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // the action redirects on success (the router follows it); only a refusal comes back
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setPending(true);
    setProblem(null);
    const r = await acceptStaffInviteAction({
      token,
      name: mode === "sign_up" ? String(data.get("name") ?? "") : undefined,
      password: mode === "sign_up" ? String(data.get("password") ?? "") : undefined,
      locale,
      turnstile: String(data.get("cf-turnstile-response") ?? "") || null,
    });
    setPending(false);
    if (r && !r.ok) {
      setProblem(r.message ? t(r.message) : t(r.error === "rate_limited" ? "console.staff_invite.rate_limited" : "console.staff_invite.failed"));
      setAttempt((n) => n + 1);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 grid gap-5">
      <FormAlert message={problem ?? undefined} />
      {mode === "sign_up" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="staff-invite-email">{t("console.staff_invite.email")}</Label>
            <Input id="staff-invite-email" value={emailMasked} readOnly disabled dir="ltr" className="h-10 bg-muted/50 px-3 text-[0.9rem]" />
            <p className="text-xs text-muted-foreground">{t("console.staff_invite.email_locked")}</p>
          </div>
          <TextField label={t("console.staff_invite.name")} name="name" autoComplete="name" required autoFocus maxLength={120} />
          <PasswordField label={t("console.staff_invite.password")} toggleLabel={t("console.staff_invite.show_password")} name="password" autoComplete="new-password" required maxLength={200} hint={t("console.staff_invite.password_hint")} />
        </>
      )}
      {siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={attempt || undefined} />}
      <SubmitButton pending={pending} pendingLabel={t("console.staff_invite.joining")} variant="brand">
        {t(mode === "accept" ? "console.staff_invite.accept" : "console.staff_invite.create_and_join", { role })}
      </SubmitButton>
      <p className="text-xs text-muted-foreground">{t("console.staff_invite.two_factor_next")}</p>
    </form>
  );
}
