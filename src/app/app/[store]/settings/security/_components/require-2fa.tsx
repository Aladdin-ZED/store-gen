"use client";
/**
 * Settings → Security on screen (P2 SHELL; platform.md PLA-§22.10.3, TN-13): the switch, its reason when the viewer
 * may not change it, the members still without two-step verification (initials, name, role, "You"), and the confirm
 * sheet before it turns on (turning it off needs no sheet: nothing is asked of anyone).
 */
import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/admin/common/confirm-dialog";
import { Monogram } from "@/components/admin/common/monogram";
import { SettingsCard } from "@/components/admin/common/settings-kit";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import { useActionError } from "@/components/admin/shell/use-action-error";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreRole } from "@/lib/auth/permissions";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";

export function Require2fa({
  on,
  reason,
  without,
  enrolHref,
  save,
}: {
  on: boolean;
  reason: "role" | "own_first" | null;
  without: { userId: string; name: string; role: StoreRole; self: boolean }[];
  enrolHref: string;
  save(input: { on: boolean }): Promise<ActionResult<{ requireMember2fa: boolean }>>;
}) {
  const t = useT();
  const router = useRouter();
  const actions = useActionError();
  const id = useId();
  const [value, setValue] = useState(on);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const write = async (next: boolean) => {
    setBusy(true);
    const before = value;
    // optimistic: the switch moves at once and comes back when the server refuses
    setValue(next);
    try {
      const res = await actions.run(() => save({ on: next }));
      if (res.ok) {
        toast.success(t("shell.security.saved"));
        router.refresh();
      } else setValue(before);
      return res.ok ? undefined : false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsCard title={t("shell.security.title")} description={t("shell.security.lead")}>
        <div className="flex items-start justify-between gap-4 rounded-[var(--r-control)] bg-muted/50 px-4 py-3.5">
          <div className="grid gap-1">
            <label htmlFor={id} className="text-sm font-medium">
              {t("shell.security.require_2fa")}
            </label>
            <p className="text-[13px] text-muted-foreground">{t("shell.security.require_2fa_lead")}</p>
            {reason === "own_first" && (
              <p className="text-[13px] font-medium text-warn-ink">
                {t("shell.security.own_first")}{" "}
                <Link href={enrolHref} className={cn("underline underline-offset-4", FOCUS_RING)}>
                  {t("shell.security.enrol")}
                </Link>
              </p>
            )}
            {reason === "role" && <p className="text-[13px] text-muted-foreground">{t("shell.security.owner_only")}</p>}
          </div>
          <Switch id={id} checked={value} disabled={reason !== null || busy} onCheckedChange={(next) => (next ? setConfirm(true) : void write(false))} className="mt-0.5 shrink-0" />
        </div>

        <div className="grid gap-2">
          <p className="text-[13px] font-medium">{t("shell.security.members_without", { count: without.length })}</p>
          {without.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-success-ink">
              <ShieldCheckIcon aria-hidden="true" className="size-4" />
              {t("shell.security.everyone_on")}
            </p>
          ) : (
            <ul className="grid divide-y divide-[color-mix(in_oklch,var(--foreground)_9%,transparent)]">
              {without.map((m) => (
                <li key={m.userId} className="flex min-h-12 items-center gap-3 py-2">
                  <Monogram name={m.name} seed={m.userId} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                  {m.self && <span className="rounded-[var(--r-chip)] bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">{t("team.you")}</span>}
                  <span className="text-[13px] text-muted-foreground">{t(`team.role.${m.role}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        icon={<ShieldCheckIcon />}
        title={t("shell.security.confirm_title")}
        description={t("shell.security.confirm_lead")}
        confirmLabel={t("shell.security.confirm_on")}
        onConfirm={() => write(true)}
      >
        {without.length > 0 && <p className="text-[13px] text-muted-foreground">{t("shell.security.members_without", { count: without.length })}</p>}
      </ConfirmDialog>
    </>
  );
}
