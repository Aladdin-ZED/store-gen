"use client";

import { MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { SignupMode } from "@/lib/auth/platform-config";
import type { AdminLocale } from "@/lib/i18n/admin";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../_components/form-ui";
import { StoreNameAndHandle } from "../_components/handle-field";
import { TurnstileField } from "../_components/turnstile-field";
import { IDLE, formStateOf, type Refusals } from "../_lib/form-state";
import { signupAction, type SignupState } from "./actions";

/** the seam's refusals of a signup (its own outcomes come back as the form state); the non-secret fields stay */
const SIGNUP_REFUSALS: Refusals = { keys: { challenge: "auth.signup.challenge" }, keep: ["name", "email", "phone", "storeName", "handle", "market", "inviteCode", "note"] };

/** "MA" → "Maroc" / "المغرب" / "Morocco" in the page language. */
function regionLabel(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function SignupForm({
  mode,
  locale,
  markets,
  siteKey,
  nonce,
  inviteCode,
  legalRequired,
}: {
  mode: Exclude<SignupMode, "closed">;
  locale: AdminLocale;
  markets: string[];
  siteKey: string | null;
  nonce?: string;
  inviteCode: string;
  legalRequired: boolean;
}) {
  const t = useAuthT();
  const [state, action, pending] = useActionState<SignupState, FormData>(
    async (prev, data) => formStateOf(await signupAction(data), prev, data, SIGNUP_REFUSALS),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);
  const v = (name: string, fallback = "") => error?.values?.[name] ?? fallback;

  // focus time inside the form (a signal of the risk score, PLA-§3.4): counted while the page is visible
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.status === "waitlisted" || state.status === "closed") {
    const key = state.status === "closed" ? "auth.signup.closed_lead" : state.reason === "capped" ? "auth.signup.capped" : "auth.signup.waitlisted";
    return (
      <div role="status" className="grid justify-items-center gap-4 rounded-[12px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] bg-card px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
          <MailCheckIcon aria-hidden="true" className="size-5" />
        </span>
        <p className="max-w-sm text-sm leading-relaxed text-pretty">{t(key)}</p>
      </div>
    );
  }

  if (mode === "waitlist") {
    return (
      <form ref={formRef} action={action} noValidate className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />
        <FormAlert message={error?.message ? t(error.message) : undefined} />
        <TextField label={t("auth.field.email")} name="email" type="email" inputMode="email" autoComplete="email" dir="ltr" required autoFocus maxLength={191} defaultValue={v("email")} error={fe("email")} />
        <TextField label={t("auth.field.phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={32} defaultValue={v("phone")} error={fe("phone")} hint={t("auth.field.phone_hint")} />
        <TextField label={t("auth.signup.what_you_sell")} name="note" maxLength={300} defaultValue={v("note")} error={fe("note")} />
        <SubmitButton pending={pending} pendingLabel={t("auth.signup.pending")}>
          {t("auth.signup.join_waitlist")}
        </SubmitButton>
      </form>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) => {
        fd.set("formMs", String(Math.min(30 * 60_000, Date.now() - startedAt)));
        return action(fd);
      }}
      noValidate
      className="grid gap-7"
    >
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={error?.message ? t(error.message) : undefined} />

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-[0.8rem] font-medium text-muted-foreground">{t("auth.signup.you")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("auth.field.name")} name="name" autoComplete="name" required autoFocus maxLength={120} defaultValue={v("name")} error={fe("name")} />
          <TextField label={t("auth.field.phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={32} defaultValue={v("phone")} error={fe("phone")} hint={t("auth.field.phone_hint")} />
        </div>
        <TextField label={t("auth.field.email")} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} dir="ltr" required maxLength={191} defaultValue={v("email")} error={fe("email")} />
        <PasswordField label={t("auth.field.password")} toggleLabel={t("auth.field.show_password")} name="password" autoComplete="new-password" required maxLength={200} hint={t("auth.field.password_hint")} error={fe("password")} />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-[0.8rem] font-medium text-muted-foreground">{t("auth.signup.your_store")}</legend>
        <StoreNameAndHandle initialName={v("storeName")} initialHandle={v("handle")} errors={{ storeName: error?.fieldErrors?.storeName, handle: error?.fieldErrors?.handle }} />
        {markets.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor="signup-market">{t("auth.field.market")}</Label>
            <select
              id="signup-market"
              name="market"
              defaultValue={v("market", markets[0])}
              className="h-10 rounded-[8px] border border-input bg-card px-3 text-[0.9rem] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {markets.map((m) => (
                <option key={m} value={m}>
                  {regionLabel(locale, m)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="market" value={markets[0] ?? "MA"} />
        )}
        {mode === "invite" && (
          <TextField
            label={t("auth.field.invite_code")}
            name="inviteCode"
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            placeholder="SG-XXXX-XXXX-XXXX"
            className="font-mono tracking-wide uppercase placeholder:normal-case"
            defaultValue={v("inviteCode", inviteCode)}
            error={fe("inviteCode")}
            hint={t("auth.field.invite_code_hint")}
          />
        )}
      </fieldset>

      {legalRequired && (
        <div className="grid gap-1.5">
          <div className="flex items-start gap-3">
            <Checkbox id="signup-legal" name="acceptLegal" className="mt-0.5" aria-invalid={fe("acceptLegal") ? true : undefined} />
            <Label htmlFor="signup-legal" className="text-sm leading-relaxed font-normal text-muted-foreground">
              <span>
                {t("auth.signup.legal_prefix")}{" "}
                <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-4">
                  {t("auth.signup.legal_terms")}
                </Link>
                {", "}
                <Link href="/privacy" target="_blank" className="text-foreground underline underline-offset-4">
                  {t("auth.signup.legal_privacy")}
                </Link>
                {` ${t("auth.signup.legal_and")} `}
                <Link href="/aup" target="_blank" className="text-foreground underline underline-offset-4">
                  {t("auth.signup.legal_aup")}
                </Link>
                .
              </span>
            </Label>
          </div>
          {fe("acceptLegal") && <p className="ps-7 text-xs font-medium text-destructive">{fe("acceptLegal")}</p>}
        </div>
      )}

      {siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />}

      <SubmitButton pending={pending} pendingLabel={t("auth.signup.pending")}>
        {t("auth.signup.submit")}
      </SubmitButton>
      {mode !== "open" && <p className="-mt-3 text-center text-xs text-muted-foreground">{t("auth.signup.review_note")}</p>}
    </form>
  );
}
