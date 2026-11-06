"use client";
/** The staff "clear" of a screened row (AI-§E.3 step 4): removes `injection_suspected` after a human look, audited. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearAiScreenedAction } from "@/app/admin/(console)/ai/actions";
import { t } from "@/lib/i18n/admin";
import { sayOf, Spinner, Status, useConsoleAction, type Said } from "./client";

export function ClearScreenedButton({ runId }: { runId: string }) {
  const { run, pending, sheet } = useConsoleAction();
  const [said, setSaid] = useState<Said>(null);
  return (
    <div className="flex items-center gap-2">
      <Spinner on={pending} />
      <Button type="button" size="sm" variant="outline" disabled={pending || said?.tone === "ok"} onClick={() => void run(() => clearAiScreenedAction({ runId }), (r) => setSaid(sayOf(r, t("ai.console.quality.cleared", undefined, "en"))))}>
        {t("ai.console.quality.clear", undefined, "en")}
      </Button>
      <Status said={said} />
      {sheet}
    </div>
  );
}
