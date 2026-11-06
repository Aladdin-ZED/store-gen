"use client";
/**
 * "Report this store" form (platform.md PLA-§24.2 R1 slice, PD70; PL-20): reason, details (≤ 2,000), the page path
 * the reporter came from (prefilled from `?p=`, same host, no query), an optional contact, Turnstile when configured.
 * Whatever the server did with it, an accepted post shows the same thanks (no handle oracle). Every target is 44 px
 * on phones; Arabic reads right to left from the shell.
 */
import { CheckCircle2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/admin/client";
import type { AdminLocale } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { FormAlert, SubmitButton, TextField } from "../../_components/form-ui";
import { TurnstileField } from "../../_components/turnstile-field";
import { reportStoreAction, type ReportStoreInput } from "./actions";

const DETAILS_MAX = 2_000;

export function ReportForm({ handle, reasons, path, locale, siteKey, nonce }: { handle: string; reasons: readonly ReportStoreInput["reason"][]; path: string | null; locale: AdminLocale; siteKey: string | null; nonce?: string }) {
  const t = useT();
  const [reason, setReason] = useState<ReportStoreInput["reason"] | "">("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reason) {
      setProblem(t("report.reason_required"));
      return;
    }
    const data = new FormData(e.currentTarget);
    setPending(true);
    setProblem(null);
    const r = await reportStoreAction({
      handle,
      reason,
      details: details.trim() || null,
      pagePath: String(data.get("page") ?? "") || null,
      contact: String(data.get("contact") ?? "").trim() || null,
      turnstile: String(data.get("cf-turnstile-response") ?? "") || null,
    }).catch(() => ({ ok: false as const, error: "server" as const, message: undefined }));
    setPending(false);
    if (r.ok) {
      setSent(true);
      return;
    }
    setAttempt((n) => n + 1);
    setProblem(r.error === "rate_limited" ? t("report.rate_limited") : r.message ? t(r.message) : t("report.failed"));
  };

  if (sent) {
    return (
      <div role="status" className="mt-6 grid justify-items-start gap-3 rounded-[12px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] bg-card p-5">
        <CheckCircle2Icon aria-hidden="true" className="size-6 text-[oklch(0.55_0.12_160)]" />
        <p className="text-[0.95rem] font-semibold">{t("report.thanks")}</p>
        <p className="text-sm text-muted-foreground">{t("report.thanks_lead")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 grid gap-5">
      <FormAlert message={problem ?? undefined} />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("report.reason")}</legend>
        {reasons.map((r) => (
          <label
            key={r}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] px-3.5 py-2.5 text-sm transition-colors has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[color-mix(in_oklch,var(--brand)_7%,transparent)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]",
            )}
          >
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 shrink-0 accent-[var(--brand)]" />
            <span>{t(`report.reason.${r}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="report-details">{t("report.details")}</Label>
          <span className={cn("text-xs tabular-nums text-muted-foreground", details.length > DETAILS_MAX && "font-medium text-destructive")}>
            {details.length} / {DETAILS_MAX}
          </span>
        </div>
        <Textarea id="report-details" rows={4} maxLength={DETAILS_MAX} value={details} onChange={(e) => setDetails(e.target.value)} aria-describedby="report-details-hint" className="min-h-28 text-[0.9rem]" />
        <p id="report-details-hint" className="text-xs text-muted-foreground">
          {t("report.details_hint")}
        </p>
      </div>
      <TextField label={t("report.page")} name="page" dir="ltr" defaultValue={path ?? ""} maxLength={300} placeholder="/" hint={t("report.page_hint")} className="h-11" />
      <TextField label={t("report.contact")} name="contact" autoComplete="email" maxLength={120} hint={t("report.contact_hint")} className="h-11" />
      {siteKey && <TurnstileField siteKey={siteKey} nonce={nonce} locale={locale} resetKey={attempt || undefined} />}
      <SubmitButton pending={pending} pendingLabel={t("report.sending")} variant="brand" className="h-11">
        {t("report.submit")}
      </SubmitButton>
    </form>
  );
}
