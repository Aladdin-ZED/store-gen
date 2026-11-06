"use client";
/**
 * The sign-up form (platform.md PLA-§22.1, §3.1; docs/STORE-SAAS.md §B.2): two steps on one page with a two-segment
 * progress bar. *Account* (the invite code first in invite mode, checked only on submit; name; e-mail; password with
 * the live policy ticks; phone formatted as typed) and *Your store* (name and handle with the live availability and
 * the address preview; the mode cards; the market; the legal acceptance; the human check). Both steps are one
 * `<form>`: the hidden step's fields still post, and a refused submit reopens the step that holds the first error.
 * `formMs` counts the time with focus inside the form across both steps (the server clamps it).
 */
import { ArrowLeftIcon, ArrowRightIcon, MailCheckIcon } from "lucide-react";
import type { CountryCode } from "libphonenumber-js/min";
import { useActionState, useEffect, useRef, useState, type FocusEvent } from "react";
import { ModeCards } from "@/components/admin/common/mode-explainer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { SignupMode } from "@/lib/auth/platform-config";
import type { AdminLocale } from "@/lib/i18n/admin";
import type { StoreMode } from "@/lib/tenancy/mode";
import { cn } from "@/lib/utils";
import { CONTROL_CLASS } from "../_components/control";
import { FormAlert, PasswordField, SubmitButton, TextField } from "../_components/form-ui";
import { StoreNameAndHandle } from "../_components/handle-field";
import { LegalAcceptance, type LegalDocView } from "../_components/legal-sheet";
import { PasswordTicks, passwordTicks } from "../_components/password-ticks";
import { PhoneField } from "../_components/phone-field";
import { TurnstileField } from "../_components/turnstile-field";
import { IDLE, formStateOf, type FieldErrors, type Refusals } from "../_lib/form-state";
import { signupAction, type SignupState } from "./actions";

/** the seam's refusals of a signup (its own outcomes come back as the form state); the non-secret fields stay */
const SIGNUP_REFUSALS: Refusals = { keys: { challenge: "auth.signup.challenge" }, keep: ["name", "email", "phone", "storeName", "handle", "market", "inviteCode", "note"] };

/** the fields of the Account step: an error on any of them reopens it */
const ACCOUNT_FIELDS = ["inviteCode", "name", "email", "password", "phone"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "MA" → "Maroc" / "المغرب" / "Morocco" in the page language. */
function regionLabel(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Time with focus inside the form (PLA-§3.4's signal): started on focus-in, stopped when focus leaves the form. */
function useFocusTime() {
  const acc = useRef({ total: 0, since: null as number | null });
  return {
    onFocus: () => {
      if (acc.current.since === null) acc.current.since = Date.now();
    },
    onBlur: (e: FocusEvent<HTMLFormElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null) || acc.current.since === null) return;
      acc.current.total += Date.now() - acc.current.since;
      acc.current.since = null;
    },
    read: () => Math.min(30 * 60_000, acc.current.total + (acc.current.since === null ? 0 : Date.now() - acc.current.since)),
  };
}

export function SignupForm({
  mode,
  locale,
  markets,
  siteKey,
  nonce,
  inviteCode,
  legalRequired,
  legalDocs,
  addressTemplate,
}: {
  mode: Exclude<SignupMode, "closed">;
  locale: AdminLocale;
  markets: string[];
  siteKey: string | null;
  nonce?: string;
  inviteCode: string;
  legalRequired: boolean;
  legalDocs: LegalDocView[];
  /** the store's future address with `__HANDLE__` in place of the handle */
  addressTemplate: string;
}) {
  const t = useAuthT();
  const [state, action, pending] = useActionState<SignupState, FormData>(
    async (prev, data) => formStateOf(await signupAction(data), prev, data, SIGNUP_REFUSALS),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  const v = (name: string, fallback = "") => error?.values?.[name] ?? fallback;
  const focusTime = useFocusTime();

  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeMode, setStoreMode] = useState<StoreMode>("landing");
  const [interest, setInterest] = useState(false);
  const phoneCountry = (markets[0] ?? "MA") as CountryCode;

  // a refused submit: back to the step that holds the first field error (the server checks every field at once)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setClientErrors({});
    if (error?.fieldErrors && ACCOUNT_FIELDS.some((f) => error.fieldErrors?.[f])) setStep(1);
  }
  const fe = (name: string) => {
    const key = clientErrors[name] ?? error?.fieldErrors?.[name];
    return key ? t(key) : undefined;
  };

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.status === "waitlisted" || state.status === "closed") {
    const key = state.status === "closed" ? "auth.signup.closed_lead" : state.reason === "capped" ? "auth.signup.capped" : "auth.signup.waitlisted";
    return (
      <div role="status" className="grid justify-items-center gap-4 rounded-[var(--r-card)] bg-card px-6 py-10 text-center ring-1 ring-border">
        <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand">
          <MailCheckIcon aria-hidden="true" className="size-5" />
        </span>
        <p className="max-w-sm text-sm leading-relaxed text-pretty">{t(key)}</p>
      </div>
    );
  }

  if (mode === "waitlist") {
    return (
      <form ref={formRef} action={action} noValidate className="grid gap-3">
        <input type="hidden" name="locale" value={locale} />
        <FormAlert message={error?.message ? t(error.message) : undefined} />
        <TextField label={t("auth.field.email")} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} dir="ltr" required autoFocus maxLength={191} defaultValue={v("email")} error={fe("email")} />
        <PhoneField label={t("auth.field.phone")} name="phone" country={phoneCountry} defaultValue={v("phone")} error={fe("phone")} />
        <TextField label={t("auth.signup.what_you_sell")} name="note" maxLength={300} defaultValue={v("note")} error={fe("note")} />
        <SubmitButton pending={pending} pendingLabel={t("auth.signup.pending")} className="mt-2">
          {t("auth.signup.join_waitlist")}
        </SubmitButton>
      </form>
    );
  }

  const continueToStore = () => {
    const form = formRef.current;
    const name = (form?.querySelector<HTMLInputElement>('input[name="name"]')?.value ?? "").trim();
    const ticks = passwordTicks(password, email);
    const errors: FieldErrors = {};
    if (!name) errors.name = "auth.name_invalid";
    if (!EMAIL_RE.test(email.trim())) errors.email = "auth.email_invalid";
    if (!ticks.length) errors.password = "auth.password.too_short";
    else if (!ticks.varied) errors.password = "auth.password.repetitive";
    else if (!ticks.email) errors.password = "auth.password.contains_email";
    setClientErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setStep(2);
    requestAnimationFrame(() => form?.querySelector<HTMLInputElement>('input[name="storeName"]')?.focus());
  };

  return (
    <form
      ref={formRef}
      action={(fd) => {
        fd.set("formMs", String(focusTime.read()));
        return action(fd);
      }}
      onFocus={focusTime.onFocus}
      onBlur={focusTime.onBlur}
      onKeyDown={(e) => {
        // Enter on the Account step moves on instead of submitting half a form
        if (step === 1 && e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          continueToStore();
        }
      }}
      noValidate
      className="grid gap-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="mode" value={storeMode} />
      {interest && <input type="hidden" name="modeInterest" value="store" />}

      <div
        role="progressbar"
        aria-label={t("auth.signup.progress")}
        aria-valuemin={1}
        aria-valuemax={2}
        aria-valuenow={step}
        aria-valuetext={t(step === 1 ? "auth.signup.you" : "auth.signup.your_store")}
        className="grid grid-cols-2 gap-1.5"
      >
        <span className="h-1 rounded-full bg-brand" />
        <span className={cn("h-1 rounded-full transition-colors duration-300", step === 2 ? "bg-brand" : "bg-muted")} />
      </div>

      <FormAlert message={error?.message ? t(error.message) : undefined} />

      <div hidden={step !== 1} className="grid gap-3">
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
            autoFocus
          />
        )}
        <TextField label={t("auth.field.name")} name="name" autoComplete="name" required autoFocus={mode !== "invite"} maxLength={120} defaultValue={v("name")} error={fe("name")} />
        <TextField
          label={t("auth.field.email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          required
          maxLength={191}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fe("email")}
        />
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
          <PasswordTicks password={password} email={email} />
        </div>
        <PhoneField label={t("auth.signup.phone_optional")} name="phone" country={phoneCountry} defaultValue={v("phone")} error={fe("phone")} />
        <Button type="button" onClick={continueToStore} className={cn(CONTROL_CLASS, "mt-2 w-full gap-2 font-medium")}>
          {t("auth.signup.continue")}
          <ArrowRightIcon aria-hidden="true" className="rtl:-scale-x-100" />
        </Button>
      </div>

      <div hidden={step !== 2} className="grid gap-3.5">
        <div className="grid gap-3">
          <StoreNameAndHandle initialName={v("storeName")} initialHandle={v("handle")} errors={{ storeName: error?.fieldErrors?.storeName, handle: error?.fieldErrors?.handle }} addressTemplate={addressTemplate} collapsible />
        </div>
        <ModeCards value={storeMode} onChange={setStoreMode} notify={{ checked: interest, onChange: setInterest }} compact />
        {markets.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor="signup-market" className="text-[13px] font-medium">
              {t("auth.field.market")}
            </Label>
            <select
              id="signup-market"
              name="market"
              defaultValue={v("market", markets[0])}
              className={cn(CONTROL_CLASS, "rounded-[var(--r-control)] border border-input bg-card px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50")}
            >
              {markets.map((m) => (
                <option key={m} value={m}>
                  {regionLabel(locale, m)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[13px] font-medium">{t("auth.field.market")}</span>
            <span className="inline-flex h-7 items-center rounded-[var(--r-chip)] bg-muted px-2.5 text-[13px] font-medium">
              {(markets[0] ?? "MA") === "MA" ? t("auth.signup.market_fixed") : regionLabel(locale, markets[0]!)}
            </span>
            <input type="hidden" name="market" value={markets[0] ?? "MA"} />
          </div>
        )}
        {legalRequired && <LegalAcceptance id="signup-legal" docs={legalDocs} error={fe("acceptLegal")} />}
        {siteKey && step === 2 && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={error?.attempt} />}
        <div className="mt-1 flex gap-2.5">
          <Button type="button" variant="outline" onClick={() => setStep(1)} aria-label={t("auth.signup.back")} className={cn(CONTROL_CLASS, "w-auto shrink-0 px-4")}>
            <ArrowLeftIcon aria-hidden="true" className="rtl:-scale-x-100" />
          </Button>
          <SubmitButton pending={pending} pendingLabel={t("auth.signup.pending")} className="flex-1">
            {t("auth.signup.submit")}
          </SubmitButton>
        </div>
        {mode !== "open" && <p className="-mt-1 text-center text-xs text-muted-foreground">{t("auth.signup.review_note")}</p>}
      </div>
    </form>
  );
}
