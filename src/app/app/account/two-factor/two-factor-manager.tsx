"use client";

import { ArrowLeftIcon, CheckIcon, CopyIcon, KeyRoundIcon, ShieldCheckIcon, SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthT } from "@/lib/auth/i18n/client";
import { FormAlert, PasswordField, SubmitButton, TextField } from "@/app/(public)/_components/form-ui";
import { Section } from "@/app/(public)/_components/kit";
import { OtpField } from "@/app/(public)/_components/otp-field";
import type { ActionResult } from "@/lib/tenancy/types";
import { beginEnrollmentAction, confirmEnrollmentAction, disableAction, regenerateCodesAction, type ChallengeState, type CodesState, type DisableState } from "./actions";
import { RecoveryCodes } from "./recovery-codes";

const IDLE_CHALLENGE: ChallengeState = { status: "idle" };
const IDLE_CODES: CodesState = { status: "idle" };
const IDLE_DISABLE: DisableState = { status: "idle" };

const linkClass =
  "inline-flex items-center justify-self-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

/** A userAction result as the form's state: the seam's refusal (an ended session) is a form-level message. */
function stateOf<S>(r: ActionResult<S> | undefined, prev: S): S | { status: "error"; message: string } {
  if (!r) return prev;
  return r.ok ? r.data : { status: "error", message: r.message ?? (r.error === "rate_limited" ? "error.rate_limited" : "error.server") };
}

export function TwoFactorManager({
  enabled,
  remaining,
  continueHref,
  fromSetup,
  fromSettings,
  staff,
}: {
  enabled: boolean;
  remaining: number;
  continueHref: string;
  fromSetup: boolean;
  /** opened from the Security page: "Done" and turning off return there */
  fromSettings: boolean;
  /** platform staff: two-step verification can't be turned off (§B.7) */
  staff: boolean;
}) {
  const t = useAuthT();
  const [challenge, begin, beginning] = useActionState<ChallengeState>(async (prev: ChallengeState) => stateOf(await beginEnrollmentAction(), prev), IDLE_CHALLENGE);
  const [confirmed, confirm, confirming] = useActionState<CodesState, FormData>(async (prev: CodesState, data: FormData) => stateOf(await confirmEnrollmentAction(prev, data), prev), IDLE_CODES);
  const [regenerated, regenerate, regenerating] = useActionState<CodesState, FormData>(async (prev: CodesState, data: FormData) => stateOf(await regenerateCodesAction(prev, data), prev), IDLE_CODES);

  // fresh codes win over everything else: they are shown exactly once
  if (confirmed.status === "codes") return <RecoveryCodes codes={confirmed.recoveryCodes} continueHref={continueHref} />;
  if (regenerated.status === "codes") return <RecoveryCodes codes={regenerated.recoveryCodes} continueHref={continueHref} />;

  if (enabled) {
    return (
      <EnabledView
        remaining={remaining}
        continueHref={continueHref}
        fromSettings={fromSettings}
        staff={staff}
        regenerate={regenerate}
        regenerating={regenerating}
        regenerateError={regenerated.status === "error" ? regenerated : null}
      />
    );
  }
  if (challenge.status === "challenge") {
    return <ChallengeView challenge={challenge} confirm={confirm} confirming={confirming} error={confirmed.status === "error" ? confirmed : null} restart={begin} restarting={beginning} />;
  }
  return (
    <Section title={t("account.2fa.intro_title")} description={t("account.2fa.intro_lead")}>
      <form action={begin} className="grid gap-5">
        <FormAlert message={challenge.status === "error" ? t(challenge.message) : undefined} />
        {fromSetup && <p className="text-sm font-medium">{t("account.2fa.setup_step")}</p>}
        <ul className="grid gap-3 text-sm">
          <li className="flex gap-3">
            <SmartphoneIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>{t("account.2fa.intro_apps")}</span>
          </li>
          <li className="flex gap-3">
            <KeyRoundIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>{t("account.2fa.intro_codes")}</span>
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton pending={beginning} pendingLabel={t("account.2fa.preparing")} className="w-auto px-5">
            {t("account.2fa.set_up")}
          </SubmitButton>
          {fromSettings && (
            <Link href={continueHref} className={linkClass}>
              <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:rotate-180" />
              {t("account.2fa.back")}
            </Link>
          )}
        </div>
      </form>
    </Section>
  );
}

function ChallengeView({
  challenge,
  confirm,
  confirming,
  error,
  restart,
  restarting,
}: {
  challenge: Extract<ChallengeState, { status: "challenge" }>;
  confirm: (data: FormData) => void;
  confirming: boolean;
  error: { message: string; field?: string } | null;
  restart: (data: FormData) => void;
  restarting: boolean;
}) {
  const t = useAuthT();
  const [code, setCode] = useState("");
  // controlled, so a mistyped code doesn't also wipe the password (form actions reset uncontrolled fields)
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    // clear only what was wrong: a rejected password keeps the code, anything else asks for a new code
    if (error?.field === "password") setPassword("");
    else if (error) setCode("");
  }

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(challenge.secretDisplay.replace(/\s/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Section title={t("account.2fa.scan_title")} description={t("account.2fa.scan_lead")}>
      <div className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR code, nothing to optimise */}
        <img src={challenge.qrDataUrl} alt={t("account.2fa.qr_alt")} width={152} height={152} className="size-38 shrink-0 rounded-[8px] border bg-white p-1.5" />
        <div className="grid min-w-0 flex-1 basis-48 gap-2 text-xs text-muted-foreground">
          <p>{t("account.2fa.cant_scan")}</p>
          <code dir="ltr" className="rounded-[6px] bg-muted px-2 py-1.5 text-[0.8rem] leading-relaxed break-all text-foreground">
            {challenge.secretDisplay}
          </code>
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={copySecret}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {t(copied ? "account.copied" : "account.2fa.copy_key")}
          </Button>
        </div>
      </div>
      <form action={confirm} noValidate className="grid max-w-sm gap-4">
        <FormAlert message={error && !error.field ? t(error.message) : undefined} />
        <div dir="ltr">
          <OtpField label={t("account.2fa.enter_code")} name="code" value={code} onChange={setCode} error={error?.field === "code" ? t(error.message) : undefined} autoFocus />
        </div>
        <PasswordField
          label={t("account.2fa.confirm_password")}
          toggleLabel={t("auth.field.show_password")}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={t("account.2fa.confirm_hint")}
          error={error?.field === "password" ? t(error.message) : undefined}
        />
        <SubmitButton pending={confirming} pendingLabel={t("account.2fa.turning_on")}>
          {t("account.2fa.turn_on")}
        </SubmitButton>
      </form>
      <form action={restart}>
        <button type="submit" disabled={restarting} className={`${linkClass} disabled:opacity-50`}>
          {t("account.2fa.restart")}
        </button>
      </form>
    </Section>
  );
}

function EnabledView({
  remaining,
  continueHref,
  fromSettings,
  staff,
  regenerate,
  regenerating,
  regenerateError,
}: {
  remaining: number;
  continueHref: string;
  fromSettings: boolean;
  staff: boolean;
  regenerate: (data: FormData) => void;
  regenerating: boolean;
  regenerateError: { message: string; field?: string } | null;
}) {
  const t = useAuthT();
  const [code, setCode] = useState("");
  const [seenError, setSeenError] = useState(regenerateError);
  if (regenerateError !== seenError) {
    setSeenError(regenerateError);
    if (regenerateError) setCode("");
  }
  const [showDisable, setShowDisable] = useState(false);
  const [disabled, disable, disabling] = useActionState<DisableState, FormData>(async (prev: DisableState, data: FormData) => stateOf(await disableAction(prev, data), prev), IDLE_DISABLE);
  const disableError = disabled.status === "error" ? disabled : null;
  const low = remaining <= 3;

  return (
    <div className="grid gap-6">
      <Section
        title={t("account.2fa.on_title")}
        description={
          <span className={low ? "font-medium text-warn-ink dark:text-warn" : undefined}>
            {t("account.security.codes_left", { count: remaining })}
            {low && ` ${t("account.2fa.low")}`}
          </span>
        }
        aside={<ShieldCheckIcon aria-hidden="true" className="size-5 text-success-ink dark:text-success" />}
      >
        <form action={regenerate} noValidate className="grid max-w-sm gap-4">
          <p className="text-sm text-muted-foreground">{t("account.2fa.regen_lead")}</p>
          <FormAlert message={regenerateError && regenerateError.field !== "code" ? t(regenerateError.message) : undefined} />
          <div dir="ltr">
            <OtpField label={t("auth.verify.code")} name="code" value={code} onChange={setCode} error={regenerateError?.field === "code" ? t(regenerateError.message) : undefined} />
          </div>
          <SubmitButton pending={regenerating} pendingLabel={t("account.2fa.generating")} variant="outline">
            {t("account.2fa.regen")}
          </SubmitButton>
        </form>
      </Section>

      {!staff && (
        <Section tone="danger" title={t("account.2fa.off_title")} description={t("account.2fa.off_lead")}>
          {showDisable ? (
            <form action={disable} noValidate className="grid max-w-sm gap-4">
              {fromSettings && <input type="hidden" name="from" value="settings" />}
              <FormAlert message={disableError && !disableError.field ? t(disableError.message) : undefined} />
              <PasswordField label={t("auth.field.password")} toggleLabel={t("auth.field.show_password")} name="password" autoComplete="current-password" required error={disableError?.field === "password" ? t(disableError.message) : undefined} />
              <TextField
                label={t("account.2fa.code_or_recovery")}
                name="code"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                dir="ltr"
                maxLength={20}
                required
                className="font-mono tracking-wider"
                error={disableError?.field === "code" ? t(disableError.message) : undefined}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="ghost" className="h-10" onClick={() => setShowDisable(false)}>
                  {t("account.cancel")}
                </Button>
                <SubmitButton pending={disabling} pendingLabel={t("account.2fa.turning_off")} variant="destructive">
                  {t("account.2fa.turn_off")}
                </SubmitButton>
              </div>
            </form>
          ) : (
            <Button type="button" variant="destructive" className="justify-self-start" onClick={() => setShowDisable(true)}>
              {t("account.2fa.turn_off")}
            </Button>
          )}
        </Section>
      )}

      <Button asChild variant="secondary" className="justify-self-start">
        <Link href={continueHref}>{t(fromSettings ? "account.2fa.back" : "account.done")}</Link>
      </Button>
    </div>
  );
}
