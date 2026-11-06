"use client";
/**
 * RoleExplainer (P2 SHELL; platform.md PLA-§22.4.4, TN-08, TN-12; docs/STORE-SAAS.md §A.3): what a store role can and
 * can't do, from `roleSummary(role)` (derived from the permission matrix through `can()`, so it never drifts): the
 * role's one line, up to 4 "Can" and 3 "Can't" bullets. The invite form, the role select and the members table show
 * it; `compact` keeps the line alone (a select's description).
 */
import { CheckIcon, MinusIcon } from "lucide-react";
import type { StoreRole } from "@/lib/auth/permissions";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { roleSummary } from "./role-summary";

export function RoleExplainer({ role, compact = false, className }: { role: StoreRole; compact?: boolean; className?: string }) {
  const t = useT();
  const s = roleSummary(role);
  if (compact) return <p className={cn("text-xs leading-snug text-pretty text-muted-foreground", className)}>{t(s.line)}</p>;
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="grid gap-0.5">
        <p className="text-sm font-semibold">{t(s.label)}</p>
        <p className="text-[13px] leading-snug text-pretty text-muted-foreground">{t(s.line)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {s.can.length > 0 && (
          <div className="grid content-start gap-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">{t("team.role.can_title")}</p>
            <ul className="grid gap-1.5">
              {s.can.map((key) => (
                <li key={key} className="flex items-start gap-2 text-[13px] leading-snug">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2.5} />
                  <span className="text-pretty">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.cannot.length > 0 && (
          <div className="grid content-start gap-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">{t("team.role.cannot_title")}</p>
            <ul className="grid gap-1.5">
              {s.cannot.map((key) => (
                <li key={key} className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
                  <MinusIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                  <span className="text-pretty">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
