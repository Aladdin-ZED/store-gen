"use client";
/**
 * LockedControl (P2 SHELL; platform.md PLA-§22.12, §22.8, §3.6, PD1, PD56): a control that stays visible, same look
 * plus a lock glyph, and explains instead of acting. Pressing it (click, Enter or Space) never fires the action: it
 * opens what the reason calls for (`lockView`):
 *
 * - `pending` (or a pending state): the sentence "Unlocks after approval" and a link to the review card;
 * - `plan`: the limit sheet, feature variant (owners ask for a plan change there);
 * - a state, a kill switch, a role, a later release, the impersonation view: a small popover with the sentence.
 *
 * `LockReason` is also the `disabled` type of `IssueRow`. Props frozen at PLA-§22.12
 * (src/lib/contracts/r1-p0b-platform.ts). The child is one element (a button or a link): it keeps its classes and
 * gains `aria-disabled`, `aria-haspopup` and the glyph; a native `disabled` is lifted so the explanation can open.
 */
import { LockIcon } from "lucide-react";
import Link from "next/link";
import { cloneElement, isValidElement, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/admin/client";
import type { KillKey } from "@/lib/flags/registry";
import type { FeatureKey } from "@/lib/tenancy/entitlement-keys";
import type { StoreStatus } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { LimitSheet } from "../shell/limit-sheet";
import { useOptionalStore } from "../shell/store-context";
import { lockView } from "./primitive-logic";
import { FOCUS_RING } from "./ui-classes";

export type LockReason =
  | { kind: "pending" }
  | { kind: "state"; status: StoreStatus }
  | { kind: "plan"; key: FeatureKey }
  | { kind: "kill"; key: KillKey }
  | { kind: "role" }
  | { kind: "release"; release: "R2" | "R3" }
  | { kind: "impersonation" } /* rev 2, PD56 */;

export interface LockedControlProps {
  reason: LockReason;
  children: ReactElement;
}

type ChildProps = { children?: ReactNode; className?: string; onClick?: (e: MouseEvent) => void; disabled?: boolean };

export function LockedControl(p: LockedControlProps): ReactElement | null {
  const t = useT();
  const store = useOptionalStore();
  const [open, setOpen] = useState(false);
  const view = lockView(p.reason);
  if (!isValidElement<ChildProps>(p.children)) return null;
  const child = p.children;

  const trigger = cloneElement(
    child,
    {
      "aria-disabled": true,
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "data-locked": p.reason.kind,
      disabled: false,
      className: cn(child.props.className, "cursor-help opacity-70 hover:opacity-80"),
      onClick: (e: MouseEvent) => {
        // the action never runs: no navigation, no submit, no handler of the child
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      },
    } as Partial<ChildProps> & Record<string, unknown>,
    <>
      {child.props.children}
      <LockIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-80" />
      <span className="sr-only">. {t("shell.locked.label")}</span>
    </>,
  );

  if (view.opens === "limit" && p.reason.kind === "plan") {
    return (
      <>
        {trigger}
        <LimitSheet open={open} onOpenChange={setOpen} limit={{ kind: "feature", key: p.reason.key, reason: "plan" }} />
      </>
    );
  }

  const reviewHref = view.opens === "review" && store ? `${store.href("")}#review` : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent role="dialog" aria-label={t("shell.locked.title")} className="w-72 gap-2 rounded-[var(--r-card)] p-4">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--r-chip)] bg-muted text-muted-foreground">
            <LockIcon className="size-3.5" />
          </span>
          <div className="grid gap-1">
            <p className="text-[13px] font-medium text-foreground">{t("shell.locked.title")}</p>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{t(view.key)}</p>
            {reviewHref && (
              <Link href={reviewHref} onClick={() => setOpen(false)} className={cn("mt-1 w-fit rounded-[var(--r-chip)] text-sm font-medium text-brand underline-offset-4 hover:underline", FOCUS_RING)}>
                {t("shell.locked.pending_cta")}
              </Link>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
