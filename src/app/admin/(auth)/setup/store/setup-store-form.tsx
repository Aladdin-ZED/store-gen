"use client";

import { useActionState } from "react";
import { useAuthT } from "@/lib/auth/i18n/client";
import { FormAlert, SubmitButton } from "@/app/(public)/_components/form-ui";
import { StoreNameAndHandle } from "@/app/(public)/_components/handle-field";
import { IDLE } from "@/app/(public)/_lib/form-state";
import { setupStoreAction } from "./actions";

export function SetupStoreForm() {
  const t = useAuthT();
  const [state, action, pending] = useActionState(setupStoreAction, IDLE);
  const error = state.status === "error" ? state : null;
  return (
    <form action={action} noValidate className="grid gap-5">
      <FormAlert message={error?.message ? t(error.message) : undefined} />
      <StoreNameAndHandle initialName={error?.values?.storeName ?? ""} initialHandle={error?.values?.handle ?? ""} errors={{ storeName: error?.fieldErrors?.storeName, handle: error?.fieldErrors?.handle }} />
      <SubmitButton pending={pending} pendingLabel={t("app.new.creating")} className="mt-1">
        {t("app.new.submit")}
      </SubmitButton>
    </form>
  );
}
