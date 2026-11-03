"use client";
/**
 * StepUpSheet (P2 SHELL; platform.md PLA-§22.12, §22.8 `step_up`, §14.2, §4.4, PD1, PD80; docs/STORE-SAAS.md §B.7):
 * the fresh-proof sheet an action answering `{ ok: false, error: "step_up" }` opens; after `onVerified` the caller
 * re-runs the action with the same operation id. The console always asks for the TOTP code; the tenant asks for TOTP
 * when the member enrolled it, else the password (T2's password step-up, PD80), and `method` overrides that default.
 * The proof lasts 5 minutes (`sessions.step_up_at`); a wrong answer stays in the sheet as a field error.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). The tenant default comes from the nearest
 * `StepUpMethodProvider` (the store layout passes the member's `totpEnabled`); without one the password is asked, which
 * the server answers with `totp_required` for an enrolled account, and the sheet then switches to the code.
 */
import { Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { PasswordField } from "@/app/(public)/_components/form-ui";
import { OtpField } from "@/app/(public)/_components/otp-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stepUpPasswordAction, stepUpTotpAction } from "@/lib/auth/actions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { TOUCH } from "./ui-classes";

export interface StepUpSheetProps {
  open: boolean;
  onVerified(): void;
  onClose(): void;
  surface: "console" | "tenant";
  /** rev 4, PD80: tenant only; default from the viewer (TOTP when enrolled, else password); the console is always "totp" */
  method?: "totp" | "password";
}

const StepUpMethodContext = createContext<"totp" | "password" | null>(null);

/** The tenant's default step-up method for the sheets below it (the member's `totpEnabled`). */
export function StepUpMethodProvider({ totp, children }: { totp: boolean; children: ReactNode }) {
  return <StepUpMethodContext.Provider value={totp ? "totp" : "password"}>{children}</StepUpMethodContext.Provider>;
}

export function StepUpSheet(p: StepUpSheetProps): ReactElement | null {
  const fallback = useContext(StepUpMethodContext);
  const method: "totp" | "password" = p.surface === "console" ? "totp" : (p.method ?? fallback ?? "password");
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      {p.open && <Body key={method} method={method} surface={p.surface} onVerified={p.onVerified} onClose={p.onClose} />}
    </Dialog>
  );
}

function Body(p: { method: "totp" | "password"; surface: "console" | "tenant"; onVerified(): void; onClose(): void }) {
  const t = useT();
  // the server may answer `totp_required` to a password: the sheet then asks for the code (tenant only)
  const [method, setMethod] = useState(p.method);
  useEffect(() => setMethod(p.method), [p.method]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const totp = method === "totp";
  const ready = totp ? code.length === 6 : password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await (totp ? stepUpTotpAction(code) : stepUpPasswordAction(password));
      if (res.ok) {
        setCode("");
        setPassword("");
        p.onVerified();
        return;
      }
      if (res.error === "totp_required" && p.surface === "tenant") {
        setMethod("totp");
        setError("auth.step_up.use_totp");
      } else if (res.error === "invalid" || res.error === "totp_required") {
        setError(res.message ?? (totp ? "auth.step_up.code_wrong" : "auth.step_up.password_wrong"));
      } else if (res.error === "rate_limited") {
        setError("shell.err.rate_limited");
      } else {
        setError(res.message ?? "shell.err.generic");
      }
      setCode("");
    } catch {
      setError("shell.err.offline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent showCloseButton={false} className="gap-0 rounded-[var(--r-sheet)] p-0 sm:max-w-sm">
      <form
        className="grid gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          // React events bubble through the portal: never let this submit reach a form the sheet was opened from
          e.stopPropagation();
          void submit();
        }}
      >
        <DialogHeader className="gap-2">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-[var(--r-control)] bg-brand-soft text-brand">
            <ShieldCheckIcon className="size-5" />
          </span>
          <DialogTitle className="text-base font-semibold tracking-[-0.006em]">{t("shell.stepup.title")}</DialogTitle>
          <DialogDescription className="leading-relaxed text-pretty">{t(totp ? "auth.step_up.lead_totp" : "auth.step_up.lead_password")}</DialogDescription>
        </DialogHeader>
        {totp ? (
          <div dir="ltr">
            <OtpField
              label={t("shell.stepup.code")}
              name="code"
              value={code}
              onChange={setCode}
              onComplete={() => void submit()}
              error={error ? t(error) : undefined}
              autoFocus
              disabled={busy}
            />
          </div>
        ) : (
          <PasswordField
            label={t("shell.stepup.password")}
            toggleLabel={t("auth.field.show_password")}
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ? t(error) : undefined}
          />
        )}
        <DialogFooter className="mx-0 mb-0 gap-2 rounded-none border-0 bg-transparent p-0">
          <Button type="button" variant="ghost" className={TOUCH} disabled={busy} onClick={p.onClose}>
            {t("shell.stepup.cancel")}
          </Button>
          <Button type="submit" variant="brand" className={cn(TOUCH)} disabled={!ready || busy} aria-busy={busy || undefined}>
            {busy && <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {t("shell.stepup.confirm")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
