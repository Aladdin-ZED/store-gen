"use client";
/**
 * Security of the signed-in account (docs/STORE-SAAS.md §B.7, §B.9; PLA-§22.5), two exports:
 *
 *   AccountSecurityPanel  `/app/account/security`: password change, two-step status, the signed-in devices; in the
 *                         viewer's language (ar / fr / en)
 *   StepUpDialog          the step-up sheet (§B.7, SEC-17): a TOTP code when the account has one, else the password
 *                         ("sudo mode"); fresh for 5 minutes, then the refused action is retried
 */
import { KeyRoundIcon, LaptopIcon, Loader2Icon, LogOutIcon, MonitorSmartphoneIcon, ShieldCheckIcon, ShieldIcon, SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logout, stepUpPasswordAction, stepUpTotpAction } from "@/lib/auth/actions";
import { useAuthT } from "@/lib/auth/i18n/client";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";
import type { ActionResult as SeamResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { PasswordField } from "@/app/(public)/_components/form-ui";
import { Pill, Section } from "@/app/(public)/_components/kit";
import { OtpField } from "@/app/(public)/_components/otp-field";
import { useRunAction } from "@/app/(public)/_components/run-action";
import { DateText, When } from "@/app/(public)/_components/when";
import { ConfirmDialog } from "../common/confirm-dialog";
import { clearDashboardDrafts } from "../lib/drafts";

/* ------------------------------------------------------------------ */
/* Step-up sheet                                                       */
/* ------------------------------------------------------------------ */

/**
 * `const stepUp = useStepUp(user.totpEnabled)`: `stepUp.guard(() => action(input))` runs the action and, when it
 * answers `step_up`, opens the sheet and runs it once more after a fresh proof. Render `{stepUp.sheet}` once.
 */
export function useStepUp(totp: boolean) {
  const [retry, setRetry] = useState<null | (() => Promise<void>)>(null);
  const guard = useCallback(async <T,>(run: () => Promise<SeamResult<T>>, after?: (r: SeamResult<T>) => void | Promise<void>): Promise<SeamResult<T>> => {
    const r = await run();
    if (!r.ok && r.error === "step_up") {
      setRetry(() => async () => {
        const again = await run();
        await after?.(again);
      });
    } else {
      await after?.(r);
    }
    return r;
  }, []);
  const sheet = (
    <StepUpDialog
      open={retry !== null}
      totp={totp}
      onOpenChange={(open) => !open && setRetry(null)}
      onVerified={async () => {
        const next = retry;
        setRetry(null);
        await next?.();
      }}
    />
  );
  return { guard, sheet };
}

export function StepUpDialog({ open, totp, onOpenChange, onVerified }: { open: boolean; totp: boolean; onOpenChange: (open: boolean) => void; onVerified: () => void | Promise<void> }) {
  const t = useAuthT();
  const run = useRunAction();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // React events bubble through the portal: never let this submit reach a form the sheet was opened from
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await run(totp ? stepUpTotpAction(code) : stepUpPasswordAction(password), { quiet: ["invalid", "totp_required"] });
      if (res.ok) {
        setCode("");
        setPassword("");
        setError(null);
        await onVerified();
      } else if (res.error === "invalid" || res.error === "totp_required") {
        setError(res.message ?? "error.invalid");
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t("auth.step_up.title")}</DialogTitle>
            <DialogDescription>{t(totp ? "auth.step_up.lead_totp" : "auth.step_up.lead_password")}</DialogDescription>
          </DialogHeader>
          {totp ? (
            <div dir="ltr">
              <OtpField label={t("auth.verify.code")} name="code" value={code} onChange={setCode} error={error ? t(error) : undefined} autoFocus disabled={busy} />
            </div>
          ) : (
            <PasswordField
              label={t("auth.field.password")}
              toggleLabel={t("auth.field.show_password")}
              name="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error ? t(error) : undefined}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("account.cancel")}
            </Button>
            <Button type="submit" variant="brand" disabled={busy || (totp ? code.length !== 6 : !password)}>
              {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {t("auth.step_up.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* /app/account/security                                               */
/* ------------------------------------------------------------------ */

export interface AccountDevice {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  impersonating: boolean;
}

function deviceIcon(label: string) {
  if (/iOS|Android/.test(label)) return SmartphoneIcon;
  if (/Windows|macOS|Linux/.test(label)) return LaptopIcon;
  return MonitorSmartphoneIcon;
}

export function AccountSecurityPanel({
  email,
  twoFactor,
  devices,
  notice,
  actions,
}: {
  email: string;
  twoFactor: { enabled: boolean; recoveryCodesRemaining: number };
  devices: AccountDevice[];
  /** a whitelisted notice key (back from the two-step page) */
  notice: string | null;
  actions: {
    changePassword: (input: { current: string; next: string }) => Promise<SeamResult<null>>;
    revokeSession: (id: string) => Promise<SeamResult<null>>;
    signOutOthers: () => Promise<SeamResult<{ count: number }>>;
  };
}) {
  const t = useAuthT();
  return (
    <div className="grid gap-6">
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(notice)}
        </p>
      )}
      <PasswordSection email={email} save={actions.changePassword} />
      <TwoFactorSection {...twoFactor} />
      <DevicesSection devices={devices} revoke={actions.revokeSession} signOutOthers={actions.signOutOthers} />
      <p className="text-xs text-muted-foreground">{t("account.security.footnote")}</p>
    </div>
  );
}

function PasswordSection({ email, save }: { email: string; save: (input: { current: string; next: string }) => Promise<SeamResult<null>> }) {
  const t = useAuthT();
  const run = useRunAction();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!current) local.current = "account.security.current_required";
    if (next !== confirm) local.confirm = "auth.reset.mismatch";
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      const res = await run(save({ current, next }), { success: "account.security.password_changed", quiet: ["invalid"] });
      if (res.ok) {
        setCurrent("");
        setNext("");
        setConfirm("");
        router.refresh();
      } else if (res.error === "invalid") {
        const field = res.items?.[0]?.field;
        setErrors({ [field === "password" ? "current" : "next"]: res.message ?? "error.invalid" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title={t("account.security.password")} description={t("account.security.password_lead")}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        {/* lets password managers attach the new password to the right account */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div className="grid gap-4 sm:grid-cols-3">
          <PasswordField label={t("account.security.current")} toggleLabel={t("auth.field.show_password")} name="current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current ? t(errors.current) : undefined} />
          <PasswordField label={t("auth.field.new_password")} toggleLabel={t("auth.field.show_password")} name="next" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next ? t(errors.next) : undefined} />
          <PasswordField label={t("auth.field.confirm_password")} toggleLabel={t("auth.field.show_password")} name="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm ? t(errors.confirm) : undefined} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("auth.field.password_hint")}</p>
          <Button type="submit" variant="brand" disabled={saving || !current || !next}>
            {saving && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {t("account.security.change_password")}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function TwoFactorSection({ enabled, recoveryCodesRemaining }: { enabled: boolean; recoveryCodesRemaining: number }) {
  const t = useAuthT();
  const low = enabled && recoveryCodesRemaining <= 3;
  return (
    <Section
      title={t("account.security.two_factor")}
      description={t(enabled ? "account.security.two_factor_on_lead" : "account.security.two_factor_off_lead")}
      aside={<Pill tone={enabled ? "success" : "warn"}>{t(enabled ? "account.security.on" : "account.security.off")}</Pill>}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 items-center justify-center rounded-[10px]", enabled ? "bg-success/12 text-success-ink dark:text-success" : "bg-foreground/[0.05] text-muted-foreground")}>
            {enabled ? <ShieldCheckIcon aria-hidden="true" className="size-5" /> : <ShieldIcon aria-hidden="true" className="size-5" />}
          </span>
          <p className={cn("text-sm", low ? "font-medium text-warn-ink dark:text-warn" : "text-muted-foreground")}>
            {enabled ? t("account.security.codes_left", { count: recoveryCodesRemaining }) : t("account.security.apps")}
          </p>
        </div>
        <Button asChild variant={enabled ? "outline" : "brand"}>
          <Link href={`${ACCOUNT_TWO_FACTOR_PATH}?from=settings`}>
            <KeyRoundIcon aria-hidden="true" />
            {t(enabled ? "account.security.manage_codes" : "account.security.set_up")}
          </Link>
        </Button>
      </div>
    </Section>
  );
}

function DevicesSection({ devices, revoke, signOutOthers }: { devices: AccountDevice[]; revoke: (id: string) => Promise<SeamResult<null>>; signOutOthers: () => Promise<SeamResult<{ count: number }>> }) {
  const t = useAuthT();
  const run = useRunAction();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const others = devices.filter((d) => !d.current).length;

  const end = async (id: string) => {
    setBusy(id);
    try {
      const res = await run(revoke(id), { success: "account.security.device_signed_out" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title={t("account.security.devices")}
      description={t("account.security.devices_lead")}
      aside={
        others > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)}>
            <LogOutIcon aria-hidden="true" className="rtl:rotate-180" />
            {t("account.security.sign_out_others")}
          </Button>
        ) : undefined
      }
    >
      <ul className="divide-y divide-[color-mix(in_oklab,var(--foreground)_8%,transparent)] rounded-[8px] border border-[color-mix(in_oklab,var(--foreground)_8%,transparent)]">
        {devices.map((d) => {
          const Icon = deviceIcon(d.device);
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[8px]", d.current ? "bg-brand/10 text-brand" : "bg-foreground/[0.05] text-muted-foreground")}>
                  <Icon aria-hidden="true" className="size-[1.05rem]" />
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <bdi dir="ltr">{d.device}</bdi>
                    {d.current && <Pill tone="brand">{t("account.security.this_device")}</Pill>}
                    {d.impersonating && <Pill tone="violet">{t("account.security.viewing_store")}</Pill>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("account.security.active")} <When iso={d.lastSeenAt} /> · {t("account.security.since")} <DateText iso={d.createdAt} />
                  </p>
                </div>
              </div>
              {d.current ? (
                <form action={logout} onSubmit={clearDashboardDrafts}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOutIcon aria-hidden="true" className="rtl:rotate-180" />
                    {t("app.bar.sign_out")}
                  </Button>
                </form>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy === d.id} onClick={() => void end(d.id)}>
                  {busy === d.id ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : <LogOutIcon aria-hidden="true" className="rtl:rotate-180" />}
                  {t("app.bar.sign_out")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others === 0 && <p className="text-xs text-muted-foreground">{t("account.security.only_this")}</p>}

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        icon={<LogOutIcon />}
        title={t("account.security.sign_out_others_title", { count: others })}
        description={t("account.security.sign_out_others_lead")}
        confirmLabel={t("account.security.sign_out_others_confirm")}
        pendingLabel={t("account.security.signing_out")}
        onConfirm={async () => {
          const res = await run(signOutOthers(), { success: (d) => t("account.security.signed_out_count", { count: d.count }) });
          if (!res.ok) return false;
          router.refresh();
        }}
      />
    </Section>
  );
}
