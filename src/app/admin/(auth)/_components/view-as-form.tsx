"use client";

import { EyeIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { startImpersonationAction } from "@/lib/auth/actions";
import { useAuthT } from "@/lib/auth/i18n/client";
import type { ImpersonationReason } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { TextField } from "@/app/(public)/_components/form-ui";
import { useRunAction } from "@/app/(public)/_components/run-action";

const REASONS: ImpersonationReason[] = ["onboarding", "ticket", "abuse_review", "bug", "other"];
const MINUTES = [15, 30, 60] as const;

const segment = (active: boolean) =>
  cn(
    "h-8 rounded-[6px] px-3 text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active ? "bg-foreground/[0.07] font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
  );

/**
 * PLA-§10.1's start sheet in R1.0: the store by handle, the reason (a note for "other"), the ticket reference (support
 * must give one), 15 / 30 / 60 minutes, and the masked-customers line staff read before they start.
 */
export function ViewAsForm({ ticketRequired }: { ticketRequired: boolean }) {
  const t = useAuthT();
  const run = useRunAction();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [reason, setReason] = useState<ImpersonationReason>("onboarding");
  const [note, setNote] = useState("");
  const [ticketRef, setTicketRef] = useState("");
  const [minutes, setMinutes] = useState<15 | 30 | 60>(30);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ready = handle.trim().length >= 3 && (!ticketRequired || ticketRef.trim()) && (reason !== "other" || note.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await run(startImpersonationAction({ handle, reason, note: note || undefined, ticketRef: ticketRef || undefined, minutes }), { quiet: ["invalid"] });
      if (res.ok) {
        router.push(res.data.url);
        return;
      }
      if (res.error === "invalid") setErrors(Object.fromEntries((res.items ?? []).flatMap((i) => (i.field ? [[i.field, i.title]] : []))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("console.impersonation.handle")}
          name="handle"
          dir="ltr"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={31}
          placeholder="@atlas-argan"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={errors.handle ? t(errors.handle) : undefined}
        />
        <TextField
          label={t("console.impersonation.ticket")}
          name="ticketRef"
          maxLength={60}
          value={ticketRef}
          onChange={(e) => setTicketRef(e.target.value)}
          hint={t(ticketRequired ? "console.impersonation.ticket_hint_required" : "console.impersonation.ticket_hint")}
          error={errors.ticketRef ? t(errors.ticketRef) : undefined}
        />
      </div>
      <div className="grid gap-2">
        <Label>{t("console.impersonation.reason")}</Label>
        <div role="radiogroup" className="inline-flex w-fit flex-wrap rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] p-0.5">
          {REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={segment(reason === r)}>
              {t(`console.impersonation.reason.${r}`)}
            </button>
          ))}
        </div>
      </div>
      <TextField
        label={t("console.impersonation.note")}
        name="note"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        hint={t(reason === "other" ? "console.impersonation.note_required" : "console.impersonation.note_hint")}
        error={errors.note ? t(errors.note) : undefined}
      />
      <div className="grid gap-2">
        <Label>{t("console.impersonation.duration")}</Label>
        <div role="radiogroup" className="inline-flex w-fit rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_9%,transparent)] p-0.5">
          {MINUTES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)} className={cn(segment(minutes === m), "tabular-nums")}>
              {t("console.impersonation.minutes", { count: m })}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("console.impersonation.masked")}</p>
      <Button type="submit" variant="brand" className="justify-self-start" disabled={!ready || busy}>
        {busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : <EyeIcon aria-hidden="true" />}
        {t("console.impersonation.start")}
      </Button>
    </form>
  );
}
