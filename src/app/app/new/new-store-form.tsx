"use client";

import { MailCheckIcon } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { useAuthT } from "@/lib/auth/i18n/client";
import { useAdminLocale } from "@/lib/i18n/admin/client";
import { FormAlert, SubmitButton } from "@/app/(public)/_components/form-ui";
import { StoreNameAndHandle } from "@/app/(public)/_components/handle-field";
import { Section } from "@/app/(public)/_components/kit";
import { IDLE, formStateOf, type Refusals } from "@/app/(public)/_lib/form-state";
import { createStoreAction, type NewStoreState } from "./actions";

/** the refusals of a new store (its own outcomes come back as the form state); the fields stay */
const NEW_STORE_REFUSALS: Refusals = { keys: { rate_limited: "app.new.limit" }, keep: ["storeName", "handle", "market"], fallback: (code) => `error.${code}` };

/** "MA" → "Maroc" / "المغرب" / "Morocco" in the page language. */
function regionLabel(locale: string, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function NewStoreForm({ markets }: { markets: string[] }) {
  const t = useAuthT();
  const locale = useAdminLocale();
  const [state, action, pending] = useActionState<NewStoreState, FormData>(
    async (prev, data) => formStateOf(await createStoreAction(data), prev, data, NEW_STORE_REFUSALS),
    IDLE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [startedAt] = useState(() => Date.now());
  const error = state.status === "error" ? state : null;

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  if (state.status === "closed" || state.status === "capped") {
    return (
      <Section title={t(state.status === "closed" ? "auth.signup.closed_title" : "app.new.capped_title")}>
        <div className="flex items-start gap-3">
          <MailCheckIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
          <p className="text-sm leading-relaxed text-muted-foreground">{t(state.status === "closed" ? "auth.signup.closed_lead" : "app.new.capped")}</p>
        </div>
      </Section>
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
    >
      <Section title={t("app.new.section")} description={t("app.new.section_lead")}>
        <FormAlert message={error?.message ? t(error.message) : undefined} />
        <StoreNameAndHandle initialName={error?.values?.storeName ?? ""} initialHandle={error?.values?.handle ?? ""} errors={{ storeName: error?.fieldErrors?.storeName, handle: error?.fieldErrors?.handle }} />
        {markets.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor="new-market">{t("auth.field.market")}</Label>
            <select
              id="new-market"
              name="market"
              defaultValue={error?.values?.market || markets[0]}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("app.new.review_note")}</p>
          <SubmitButton pending={pending} pendingLabel={t("app.new.creating")} className="w-auto px-5">
            {t("app.new.submit")}
          </SubmitButton>
        </div>
      </Section>
    </form>
  );
}
