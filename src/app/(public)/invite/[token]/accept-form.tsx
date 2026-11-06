"use client";

import { CircleCheckIcon, UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { CountryCode } from "libphonenumber-js/min";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { AdminLocale } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "../../_components/control";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../../_components/form-ui";
import { LegalAcceptance, type LegalDocView } from "../../_components/legal-sheet";
import { PasswordTicks } from "../../_components/password-ticks";
import { PhoneField } from "../../_components/phone-field";
import { TurnstileField } from "../../_components/turnstile-field";
import { IDLE, formStateOf } from "../../_lib/form-state";
import { acceptInviteAction, type InviteState } from "./actions";

type AcceptState = InviteState | { status: "full" };

/** A centred state card of the invitation page (joined, no free seat). */
function StateCard({ tone, title, children }: { tone: "success" | "muted"; title: string; children?: ReactNode }) {
  return (
    <div role="status" className="mt-6 grid justify-items-center gap-3 rounded-[var(--r-card)] bg-card px-6 py-8 text-center ring-1 ring-border">
      <span className={cn("grid size-11 place-items-center rounded-full", tone === "success" ? "bg-success/12 text-success-ink dark:text-success" : "bg-muted text-muted-foreground")}>
        {tone === "success" ? <CircleCheckIcon aria-hidden="true" className="size-5" /> : <UsersRoundIcon aria-hidden="true" className="size-5" />}
      </span>
      <p className="text-[0.95rem] font-semibold text-balance">{title}</p>
      {children}
    </div>
  );
}

/**
 * "accept": the signed-in invitee confirms; "sign_up": a new account with the invited e-mail locked (D10). Once the
 * server answers "joined", the state stays: a second tap never posts again (the invitation is consumed, and a second
 * post would read "no longer valid"), and the page opens the store.
 */
export function AcceptForm({
  token,
  mode,
  emailMasked,
  locale,
  siteKey,
  nonce,
  phoneCountry = "MA",
  legalDocs,
  legalRequired,
}: {
  token: string;
  mode: "accept" | "sign_up";
  emailMasked: string;
  locale: AdminLocale;
  siteKey: string | null;
  nonce?: string;
  /** the phone field's country (the platform's first market) */
  phoneCountry?: CountryCode;
  legalDocs: LegalDocView[];
  legalRequired: boolean;
}) {
  const t = useAuthT();
  const router = useRouter();
  const [state, action, pending] = useActionState<AcceptState, FormData>(async (prev, data) => {
    if (prev.status === "joined" || prev.status === "full") return prev;
    const r = await acceptInviteAction(data);
    if (r && !r.ok && r.error === "quota") return { status: "full" };
    return formStateOf(r, prev, data, { keep: ["name", "phone"] });
  }, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const error = state.status === "error" ? state : null;
  const fe = (name: string) => (error?.fieldErrors?.[name] ? t(error.fieldErrors[name]) : undefined);

  useEffect(() => {
    if (state.status === "error") formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    if (state.status !== "joined") return;
    const timer = setTimeout(() => router.replace(state.href), 900);
    return () => clearTimeout(timer);
  }, [state, router]);

  if (state.status === "joined") {
    return (
      <StateCard tone="success" title={t("team.joined", { store: state.storeName })}>
        <p className="text-sm text-muted-foreground">{t("team.invite.joined_lead")}</p>
        <Link href={state.href} replace className={cn(buttonVariants(), CONTROL_CLASS, "mt-2 w-full")}>
          {t("team.invite.open_store")}
        </Link>
      </StateCard>
    );
  }
  if (state.status === "full") {
    return (
      <StateCard tone="muted" title={t("team.invite.full_title")}>
        <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">{t("team.invite.full")}</p>
      </StateCard>
    );
  }

  return (
    <form ref={formRef} action={action} noValidate className="mt-6 grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <FormAlert message={error?.message ? t(error.message) : undefined} />
      {mode === "sign_up" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="invite-email" className="text-[13px] font-medium">
              {t("auth.field.email")}
            </Label>
            <Input id="invite-email" value={emailMasked} readOnly disabled dir="ltr" className={cn(CONTROL_CLASS, "bg-muted/50 px-3.5")} />
            <p className="text-xs text-muted-foreground">{t("team.invite.email_locked")}</p>
          </div>
          <TextField label={t("auth.field.name")} name="name" autoComplete="name" required autoFocus maxLength={120} defaultValue={error?.values?.name ?? ""} error={fe("name")} />
          <div className="grid gap-2">
            <PasswordField
              label={t("auth.field.password")}
              toggleLabel={t("auth.field.show_password")}
              name="password"
              autoComplete="new-password"
              required
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fe("password")}
            />
            <PasswordTicks password={password} email={null} />
          </div>
          <PhoneField label={t("auth.signup.phone_optional")} name="phone" country={phoneCountry} defaultValue={error?.values?.phone ?? ""} error={fe("phone")} />
          {legalRequired && <LegalAcceptance docs={legalDocs} error={fe("acceptLegal")} />}
        </>
      )}
      {siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />}
      <SubmitButton pending={pending} pendingLabel={t("team.invite.joining")} className="mt-3">
        {t(mode === "accept" ? "team.invite.accept" : "team.invite.create_and_join")}
      </SubmitButton>
    </form>
  );
}
