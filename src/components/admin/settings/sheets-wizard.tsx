"use client";
/**
 * Connect a Google Sheet (operations.md OPE-§19.3, §19.8 "Not connected" and "Proof pending"; core §B.7): the value
 * line, the link field (its label above, never a placeholder as the label) and Connect; then the ownership proof as
 * two headed blocks, "Share the sheet" (the service-account e-mail with Copy) and "Add the code" (the code large in
 * mono with Copy), Verify and the expiry, relative and absolute in the store's time zone.
 *
 * Connect and Verify are secret writes under `integrations.manage`: a `step_up` answer opens the store's step-up
 * sheet and the same call runs once more. The store's own sheet reconnects at once; a sheet another store holds
 * answers the one generic refusal (`int.sheets.refused`). The code itself is shown only right after it is issued (the
 * server keeps its hash): after a reload the block says so and offers the link again.
 */
import { ArrowUpRightIcon, Loader2Icon, PlugZapIcon, ShieldCheckIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { startSheetConnectAction, verifySheetConnectAction } from "@/app/app/[store]/integrations/sheets/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { CopyButton } from "../common/copy-button";
import { clock, relTime } from "../integrations/hub-format";
import { useNow } from "../integrations/hub-states";
import { useStoreStepUp } from "../shell/step-up";
import { useStore } from "../shell/store-context";

export interface SheetsWizardProps {
  /** the platform's service account is usable (else the field is shown disabled with one line why) */
  available: boolean;
  serviceAccountEmail: string | null;
  /** a proof issued earlier and still waiting (its code is not known any more) */
  proof: { expiresAt: string } | null;
  canWrite: boolean;
  now: number;
}

/** A refusal of either answer shape (the action itself, or `stepUp.action` around it). */
type Refusal = { ok: false; error: string; message?: string };

export function SheetsWizard({ available, serviceAccountEmail: email, proof: initialProof, canWrite, now: serverNow }: SheetsWizardProps) {
  const t = useT();
  const router = useRouter();
  const stepUp = useStoreStepUp();
  const fieldId = useId();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"connect" | "verify" | null>(null);
  const [error, setError] = useState<{ text: string; raw: boolean } | null>(null);
  const [proof, setProof] = useState<{ code: string | null; expiresAt: string; email: string | null } | null>(
    initialProof ? { code: null, expiresAt: initialProof.expiresAt, email } : null,
  );

  /** The words of a refusal: its catalog key, or the plain text of the Sheets library (French, `explain()`). */
  const refusal = (res: Refusal) => {
    if (res.error === "step_up") return setError({ text: t("int.sheets.stepUpNeeded"), raw: false });
    if (res.error === "rate_limited") return setError({ text: t("int.sheets.rateLimited"), raw: false });
    const key: MessageKey = res.message ?? `error.${res.error}`;
    const text = t(key);
    setError({ text, raw: text === key && !!res.message });
  };

  const connected = (data: { created: boolean; sheet: { sheetTitle: string } }) => {
    toast.success(t(data.created ? "int.sheets.connectedCreated" : "int.sheets.connected", { tab: data.sheet.sheetTitle }), proof ? { description: t("int.sheets.renameBack") } : undefined);
    setProof(null);
    setLink("");
    router.refresh();
  };

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !link.trim()) return;
    setBusy("connect");
    setError(null);
    try {
      const res = await stepUp.action(() => startSheetConnectAction(link));
      if (!res.ok) return refusal(res);
      if (res.data.kind === "proof") setProof({ code: res.data.code, expiresAt: res.data.expiresAt, email: res.data.serviceAccountEmail ?? email });
      else connected(res.data);
    } catch {
      setError({ text: t("int.sheets.network"), raw: false });
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (busy) return;
    setBusy("verify");
    setError(null);
    try {
      const res = await stepUp.action(() => verifySheetConnectAction());
      if (!res.ok) return refusal(res);
      if (res.data.kind === "connected") return connected(res.data);
      if (res.data.reason === "no_proof") setProof((p) => p && { ...p, code: null });
      setError({ text: t(`int.sheets.proof.${res.data.reason}`), raw: false });
    } catch {
      setError({ text: t("int.sheets.network"), raw: false });
    } finally {
      setBusy(null);
    }
  }

  const alert = (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="rounded-xl bg-destructive/[0.06] px-3.5 py-2.5 text-sm leading-relaxed text-pretty text-destructive ring-1 ring-destructive/15 ring-inset"
        >
          {/* the Sheets library's own words are French (explain()); the catalog's are in the viewer's language */}
          <span lang={error.raw ? "fr" : undefined}>{error.text}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );

  if (proof) {
    return (
      <ProofBlocks
        proof={proof}
        busy={busy}
        canWrite={canWrite}
        serverNow={serverNow}
        alert={alert}
        onVerify={verify}
        onRestart={() => {
          setProof(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <section aria-labelledby="sheets-connect-title" className="adm-surface grid gap-6 p-4 sm:p-6">
      <div className="grid max-w-[60ch] gap-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/70">
          <PlugZapIcon className="size-4.5" aria-hidden="true" />
        </span>
        <h2 id="sheets-connect-title" className="mt-2 text-base font-semibold tracking-[-0.01em]">
          {t("int.sheets.connect.title")}
        </h2>
        <p className="text-[0.95rem] leading-relaxed text-pretty text-foreground/80">{t("int.sheets.connect.value")}</p>
      </div>

      <form onSubmit={connect} className="grid max-w-2xl gap-2.5">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {t("int.sheets.connect.label")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={fieldId}
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
            type="url"
            inputMode="url"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            required
            disabled={!available || !canWrite || busy !== null}
            aria-invalid={!!error}
            aria-describedby={`${fieldId}-help`}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="h-11 min-w-0 flex-1 font-mono text-[0.8rem] sm:h-10"
          />
          <Button type="submit" variant="brand" className="h-11 shrink-0 px-5 sm:h-10" disabled={!available || !canWrite || busy !== null || !link.trim()}>
            {busy === "connect" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <PlugZapIcon aria-hidden="true" />}
            {t(busy === "connect" ? "int.sheets.connect.pending" : "int.sheets.connect.submit")}
          </Button>
        </div>
        <p id={`${fieldId}-help`} className="text-xs leading-relaxed text-pretty text-muted-foreground">
          {t(available ? "int.sheets.connect.help" : "int.sheets.unavailable")}
        </p>
        {alert}
      </form>

      {available && canWrite && (
        <div className="border-t border-border/60 pt-4">
          <Button asChild variant="ghost" className="-ms-2.5 h-11 px-2.5 text-foreground/80 sm:h-8">
            <a href="https://sheets.new" target="_blank" rel="noopener noreferrer">
              {t("int.sheets.connect.newSheet")}
              <ArrowUpRightIcon className="rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </Button>
        </div>
      )}
    </section>
  );
}

function ProofBlocks({
  proof,
  busy,
  canWrite,
  serverNow,
  alert,
  onVerify,
  onRestart,
}: {
  proof: { code: string | null; expiresAt: string; email: string | null };
  busy: "connect" | "verify" | null;
  canWrite: boolean;
  serverNow: number;
  alert: ReactNode;
  onVerify: () => void;
  onRestart: () => void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const now = useNow(serverNow);
  return (
    <section aria-labelledby="sheets-proof-title" className="adm-surface grid gap-6 p-4 sm:p-6">
      <div className="grid max-w-[62ch] gap-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/70">
          <ShieldCheckIcon className="size-4.5" aria-hidden="true" />
        </span>
        <h2 id="sheets-proof-title" className="mt-2 text-base font-semibold tracking-[-0.01em]">
          {t("int.sheets.proof.title")}
        </h2>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t("int.sheets.proof.lead")}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title={t("int.sheets.proof.share.title")} body={t("int.sheets.proof.share.body")}>
          {!proof.email && (
            <p className="rounded-xl bg-background px-3.5 py-3 text-sm leading-relaxed text-pretty text-muted-foreground ring-1 ring-foreground/[0.08] ring-inset">
              {t("int.sheets.unavailable")}
            </p>
          )}
          {proof.email && (
            <div className="flex min-w-0 items-center gap-1 rounded-xl bg-background py-1 ps-3 pe-1 ring-1 ring-foreground/[0.08] ring-inset">
              <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[0.8rem] select-all">
                {proof.email}
              </bdi>
              <CopyButton value={proof.email} label={t("int.sheets.copyEmail")} toastMessage={t("int.sheets.copiedEmail")} size="icon" className="size-11 sm:size-8" />
            </div>
          )}
        </Block>
        <Block title={t("int.sheets.proof.code.title")} body={t("int.sheets.proof.code.body")}>
          {proof.code ? (
            <div className="flex min-w-0 items-center gap-1 rounded-xl bg-background py-1.5 ps-4 pe-1 ring-1 ring-foreground/[0.08] ring-inset">
              <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-xl font-semibold tracking-[0.14em] tabular-nums select-all sm:text-2xl">
                {proof.code}
              </code>
              <CopyButton value={proof.code} label={t("int.sheets.copyCode")} toastMessage={t("int.sheets.copiedCode")} size="icon" className="size-11 sm:size-9" />
            </div>
          ) : (
            <p className="rounded-xl bg-background px-3.5 py-3 text-sm leading-relaxed text-pretty text-muted-foreground ring-1 ring-foreground/[0.08] ring-inset">
              {t("int.sheets.proof.code.lost")}
            </p>
          )}
        </Block>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Button variant="brand" className="h-11 px-5 sm:h-10" onClick={onVerify} disabled={!canWrite || busy !== null}>
            {busy === "verify" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <ShieldCheckIcon aria-hidden="true" />}
            {t(busy === "verify" ? "int.sheets.proof.verifying" : "int.sheets.proof.verify")}
          </Button>
          <Button variant="ghost" className="h-11 px-3 sm:h-10" onClick={onRestart} disabled={busy !== null}>
            {t("int.sheets.proof.restart")}
          </Button>
          <p className="text-xs text-muted-foreground sm:ms-auto" suppressHydrationWarning>
            {t("int.sheets.proof.expires", { rel: relTime(proof.expiresAt, locale, now), at: clock(proof.expiresAt, locale, store.timeZone) })}
          </p>
        </div>
        {alert}
      </div>
    </section>
  );
}

function Block({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className={cn("grid content-start gap-3 rounded-2xl bg-foreground/[0.025] p-4 ring-1 ring-foreground/[0.05] ring-inset sm:p-5")}>
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
