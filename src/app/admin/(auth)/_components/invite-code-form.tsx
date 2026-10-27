"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createInviteCodeAction } from "@/lib/auth/actions";
import { useAuthT } from "@/lib/auth/i18n/client";
import { cn } from "@/lib/utils";
import { TextField } from "@/app/(public)/_components/form-ui";
import { useRunAction } from "@/app/(public)/_components/run-action";
import { DateText } from "@/app/(public)/_components/when";

type Expiry = 7 | 30 | 90 | null;
const EXPIRIES: Expiry[] = [7, 30, 90, null];

const segment = (active: boolean) =>
  cn(
    "h-8 rounded-[6px] px-3 text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active ? "bg-foreground/[0.07] font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
  );

/**
 * The console home's invite code form in R1.0 (docs/STORE-SAAS.md §B.6): a label for staff, how many sign-ups the code
 * allows and when it expires; the code comes back once and is shown with a copy button until the next one is made.
 * P1's Settings → Signup replaces it.
 */
export function InviteCodeForm() {
  const t = useAuthT();
  const run = useRunAction();
  const [label, setLabel] = useState("");
  const [uses, setUses] = useState("1");
  const [expiry, setExpiry] = useState<Expiry>(30);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const usesMax = Number(uses);
  const ready = label.trim().length >= 2 && Number.isInteger(usesMax) && usesMax >= 1 && usesMax <= 500;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await run(createInviteCodeAction({ label, usesMax, expiresInDays: expiry }), { quiet: ["invalid"] });
      if (res.ok) {
        setCreated(res.data);
        setCopied(false);
        setLabel("");
        setUses("1");
        return;
      }
      if (res.error === "invalid") setErrors(Object.fromEntries((res.items ?? []).flatMap((i) => (i.field ? [[i.field, i.title]] : []))));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-5">
      {created && (
        <div role="status" data-invite-code={created.code} className="grid gap-3 rounded-[8px] border border-[oklch(0.6_0.1_205/0.35)] bg-[oklch(0.6_0.1_205/0.07)] p-4">
          <p className="text-sm font-medium">{t("console.invite.created")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <code dir="ltr" className="rounded-[6px] bg-background px-2.5 py-1.5 font-mono text-[0.95rem] tracking-[0.04em] text-foreground">
              {created.code}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              {t(copied ? "console.invite.copied" : "console.invite.copy")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{created.expiresAt ? <>{t("console.invite.expires_on")} <DateText iso={created.expiresAt} /></> : t("console.invite.never_expires")}</p>
        </div>
      )}
      <form onSubmit={submit} noValidate className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <TextField
            label={t("console.invite.label")}
            name="label"
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            hint={t("console.invite.label_hint")}
            error={errors.label ? t(errors.label) : undefined}
          />
          <TextField
            label={t("console.invite.uses")}
            name="usesMax"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            dir="ltr"
            value={uses}
            onChange={(e) => setUses(e.target.value)}
            hint={t("console.invite.uses_hint")}
            error={errors.usesMax ? t(errors.usesMax) : undefined}
          />
        </div>
        <div className="grid gap-2">
          <Label>{t("console.invite.expiry")}</Label>
          <div role="radiogroup" aria-label={t("console.invite.expiry")} className="inline-flex w-fit rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] p-0.5">
            {EXPIRIES.map((d) => (
              <button key={String(d)} type="button" role="radio" aria-checked={expiry === d} onClick={() => setExpiry(d)} className={cn(segment(expiry === d), "tabular-nums")}>
                {d === null ? t("console.invite.expiry_never") : t("console.invite.expiry_days", { count: d })}
              </button>
            ))}
          </div>
          {errors.expiresInDays && <p className="text-sm text-destructive">{t(errors.expiresInDays)}</p>}
        </div>
        <Button type="submit" variant="brand" className="justify-self-start" disabled={!ready || busy}>
          {busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : created ? <PlusIcon aria-hidden="true" /> : <KeyRoundIcon aria-hidden="true" />}
          {t(created ? "console.invite.create_another" : "console.invite.create")}
        </Button>
      </form>
    </div>
  );
}
