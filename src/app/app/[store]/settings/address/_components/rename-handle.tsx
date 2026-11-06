"use client";
/**
 * Settings → Address → Rename the handle (P2 SHELL; platform.md PLA-§22.10.2; docs/STORE-SAAS.md §C.7, ENGC-30):
 * the new handle with live availability (250 ms after the last keystroke; "Available" or "Not available" only, never
 * why), the 12-month warning, the 30-day rule ("You can rename again on <date>") and store #1's free-rename line; a
 * confirm sheet, then `renameHandleAction`, then the dashboard at its new address.
 *
 * The live check is the signup's own seam-wrapped `checkHandleAction` (`/api/auth/handle` has no R1 owner): it answers
 * a problem key or nothing, and this field folds every problem into "Not available". The server decides again.
 */
import { CheckIcon, LinkIcon, Loader2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/admin/common/confirm-dialog";
import { formatDay } from "@/components/admin/common/primitive-logic";
import { BusyButton, Field, FIELD_INPUT, SettingsCard } from "@/components/admin/common/settings-kit";
import { useActionError } from "@/components/admin/shell/use-action-error";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { checkHandleAction } from "@/app/(public)/signup/actions";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
type Check = "idle" | "checking" | "free" | "taken";

function useAvailability(handle: string, current: string): Check {
  const [state, setState] = useState<Check>("idle");
  const [prev, setPrev] = useState<string | null>(null);
  if (handle !== prev) {
    setPrev(handle);
    setState(!handle || handle === current ? "idle" : HANDLE_RE.test(handle) ? "checking" : "taken");
  }
  useEffect(() => {
    if (!HANDLE_RE.test(handle) || handle === current) return;
    let live = true;
    const timer = setTimeout(() => {
      void checkHandleAction(handle)
        .then((r) => {
          // a refusal of the seam (the burst floor) says nothing about the handle: back to idle
          if (live) setState(!r.ok || r.data.limited ? "idle" : r.data.problem ? "taken" : "free");
        })
        .catch(() => live && setState("idle"));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [handle, current]);
  return state;
}

export function RenameHandle({
  current,
  canRename,
  locked,
  nextAt,
  freeRename,
  rename,
}: {
  current: string;
  canRename: boolean;
  /** why the field is read-only: the role, the store's state, or a support view */
  locked: "role" | "state" | "support" | null;
  nextAt: string;
  freeRename: boolean;
  rename(input: { handle: string }): Promise<ActionResult<{ handle: string; href: string }>>;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const actions = useActionError();
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handle = value.trim().toLowerCase();
  const check = useAvailability(handle, current);
  // the 30-day rule: the date is the server's; store #1's unused grant lifts it once
  const [now] = useState(() => Date.now());
  const tooSoon = !freeRename && new Date(nextAt).getTime() > now;
  const usable = canRename && !tooSoon;
  const ready = usable && check === "free" && !busy;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usable) return;
    if (!HANDLE_RE.test(handle)) return setError("shell.address.rename_format");
    if (check === "taken") return setError("shell.address.not_available");
    if (ready) setConfirm(true);
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await actions.run(() => rename({ handle }), {
        toastInvalid: true,
      });
      if (res.ok) {
        toast.success(t("shell.address.renamed"));
        router.replace(res.data.href);
        router.refresh();
        return;
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const status =
    check === "checking" ? (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        {t("shell.address.checking")}
      </span>
    ) : check === "free" ? (
      <span className="inline-flex items-center gap-1.5 text-success-ink">
        <CheckIcon aria-hidden="true" className="size-3" />
        {t("shell.address.available")}
      </span>
    ) : check === "taken" ? (
      <span className="inline-flex items-center gap-1.5 text-destructive-ink">
        <XIcon aria-hidden="true" className="size-3" />
        {t("shell.address.not_available")}
      </span>
    ) : (
      t("shell.address.rename_hint")
    );

  return (
    <>
      <form onSubmit={submit} noValidate className="contents">
        <SettingsCard
          title={t("shell.address.rename")}
          description={t("shell.address.rename_lead")}
          footer={
            usable ? (
              <BusyButton type="submit" variant="brand" busy={busy} disabled={!ready}>
                {t("shell.address.rename_submit")}
              </BusyButton>
            ) : undefined
          }
        >
          {locked ? (
            <p className="rounded-[var(--r-control)] bg-muted/50 px-3.5 py-2.5 text-[13px] text-muted-foreground">{t(`shell.address.locked_${locked}`)}</p>
          ) : (
            <>
              <Field label={t("shell.address.rename_field")} hint={<span aria-live="polite">{status}</span>} error={error}>
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute start-3 top-1/2 flex -translate-y-1/2 items-center text-muted-foreground">
                      <LinkIcon aria-hidden="true" className="size-3.5" />
                    </span>
                    <Input
                      {...p}
                      dir="ltr"
                      className={cn(FIELD_INPUT, "ps-9 font-mono")}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={30}
                      placeholder={current}
                      disabled={!usable}
                      value={value}
                      onChange={(e) => {
                        setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                        setError(null);
                      }}
                    />
                  </div>
                )}
              </Field>
              <ul className="grid gap-1.5 text-[13px] text-muted-foreground">
                <li>{t("shell.address.rename_warning")}</li>
                <li>
                  {tooSoon
                    ? t("shell.address.rename_next", {
                        date: formatDay(nextAt, locale),
                      })
                    : t("shell.address.rename_once")}
                </li>
                {freeRename && <li className="font-medium text-foreground">{t("shell.address.rename_free")}</li>}
              </ul>
            </>
          )}
        </SettingsCard>
      </form>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        icon={<LinkIcon />}
        title={t("shell.address.rename_confirm", { handle })}
        description={t("shell.address.rename_warning")}
        confirmLabel={t("shell.address.rename_submit")}
        onConfirm={run}
      />
    </>
  );
}
