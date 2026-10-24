"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { FormAlert, SubmitButton, TextField } from "../../_components/form-ui";
import { OtpField } from "../../_components/otp-field";
import { IDLE, formStateOf, type FormState } from "../../_lib/form-state";
import { verifyAction } from "./actions";

export function VerifyForm({ next }: { next: string | null }) {
  const t = useAuthT();
  const [state, action, pending] = useActionState(async (prev: FormState, data: FormData) => formStateOf(await verifyAction(data), prev, data), IDLE);
  const [method, setMethod] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [seenState, setSeenState] = useState(state);
  const formRef = useRef<HTMLFormElement>(null);
  const error = state.status === "error" ? state : null;
  const codeError = error?.fieldErrors?.code ? t(error.fieldErrors.code) : undefined;

  // A rejected code is useless: clear it (during render, on the new result)…
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "error") setCode("");
  }
  // …and return focus to the input.
  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLInputElement>('input[name="code"]')?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="grid gap-6">
      <input type="hidden" name="method" value={method} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormAlert message={error?.message ? t(error.message) : undefined} />

      {method === "totp" ? (
        <div dir="ltr">
          <OtpField
            label={t("auth.verify.code")}
            name="code"
            value={code}
            onChange={setCode}
            onComplete={() => {
              if (!pending) formRef.current?.requestSubmit();
            }}
            error={codeError}
            autoFocus
            disabled={pending}
          />
        </div>
      ) : (
        <TextField
          key="recovery"
          label={t("auth.verify.recovery_code")}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          autoFocus
          maxLength={20}
          placeholder="XXXX-XXXX-XXXX"
          className="font-mono tracking-wider uppercase placeholder:normal-case"
          hint={t("auth.verify.recovery_hint")}
          error={codeError}
        />
      )}

      <SubmitButton pending={pending} pendingLabel={t("auth.verify.pending")}>
        {t("auth.verify.submit")}
      </SubmitButton>

      <button
        type="button"
        onClick={() => {
          setMethod((m) => (m === "totp" ? "recovery" : "totp"));
          setCode("");
        }}
        className="justify-self-center rounded-sm text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t(method === "totp" ? "auth.verify.use_recovery" : "auth.verify.use_totp")}
      </button>
    </form>
  );
}
