"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useStepUp } from "@/components/admin/settings/security-panel";
import { useAuthT } from "@/lib/auth/i18n/client";
import { TextField } from "@/app/(public)/_components/form-ui";
import { useRunAction } from "@/app/(public)/_components/run-action";
import { deleteMyAccountAction } from "../actions";

/** The typed word of the page's language (`delete`, `supprimer`, `حذف`), then the step-up sheet, then the deletion. */
export function DeleteAccountForm({ word, totp }: { word: string; totp: boolean }) {
  const t = useAuthT();
  const run = useRunAction();
  const stepUp = useStepUp(totp);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === word.toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await stepUp.guard(
        () => run(deleteMyAccountAction({ confirm: typed, expected: word }), { quiet: ["step_up", "invalid"] }),
        (res) => {
          if (!res.ok && res.error === "invalid") setError(res.message ?? "error.invalid");
        },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="grid max-w-sm gap-4 border-t pt-5">
        <TextField
          label={t("account.danger.type_word", { word })}
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          error={error ? t(error) : undefined}
        />
        <Button type="submit" variant="destructive" className="justify-self-start" disabled={!matches || busy}>
          {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {t("account.danger.delete")}
        </Button>
      </form>
      {/* outside the form: React events bubble through portals, so the sheet's own submit must not reach this one */}
      {stepUp.sheet}
    </>
  );
}
