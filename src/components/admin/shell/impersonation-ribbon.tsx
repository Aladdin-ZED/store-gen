"use client";
/**
 * The "view as store" ribbon (P2 SHELL; platform.md PLA-§10.2, PD56, PD69; design.md DES-§16.11; docs/STORE-SAAS.md
 * §B.8; PL-10): violet (`--imp-bg` / `--imp-ink`, ≥ 7:1, test:admin-tokens), 36 px, full width above the topbar, never
 * dismissible. "Viewing <store> as Store Gen support · Read-only · 24:13 left" (three data fields: the documented `·`
 * exception), then:
 *
 * - **Why**: the reason, and the line "Customer details are hidden from support" so the seller sees it too;
 * - **Note**: a one-line note for the store's file in the console (P1's `addImpersonationNoteAction`, staff only; it
 *   never writes a tenant row);
 * - **Open profile**: the console's store profile in a new tab;
 * - **End**: T2's `endImpersonationAction`, back to the console.
 *
 * The countdown reads the pulse's `impersonation.endsAt` first and the first paint's `expiresAt` until a body names
 * one, on the client clock corrected once by the server's offset, so a navigation or a second tab never shows a stale
 * time. At 0 the view ends itself. `HiddenWhileViewing` is the lock state of the sensitive surfaces (secrets, exports,
 * phone reveal) during the view.
 */
import { EyeIcon, LockIcon, SquareArrowOutUpRightIcon, InfoIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { endImpersonationAction } from "@/lib/auth/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { ImpersonationReason } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { NUM } from "../common/ui-classes";
import { useViewerFlags } from "../common/viewer-flags";
import { clockOffset, formatCountdown, remainingMs, ribbonEndsAt } from "./pulse-state";
import { usePulse } from "./use-pulse";

export const RIBBON_HEIGHT_PX = 36;

/**
 * The note composer calls P1's console action (`src/app/admin/(console)/…`): loaded only when a ribbon shows, so the
 * members' dashboard bundle never pulls the console's route chunk.
 */
const NoteComposer = dynamic(() => import("./impersonation-note").then((m) => m.NoteComposer), { ssr: false });

export interface RibbonProps {
  storeId: string;
  storeName: string;
  /** the first paint's `ctx.impersonation.expiresAt` (ISO) */
  expiresAt: string;
  /** the server's clock when the layout rendered (ISO): the offset, measured once */
  serverNow: string;
  reason: ImpersonationReason;
  /** the console's store profile */
  profileHref: string;
}

/** The ribbon's own focus ring: the ink on the violet (the shell's ring colour would vanish on it). */
const RING = "outline-none focus-visible:ring-2 focus-visible:ring-imp-ink focus-visible:ring-offset-2 focus-visible:ring-offset-imp-bg";
export /**
 * The ribbon is 36 px: below 768 px its controls keep a 44 px hit area through an invisible overlay instead of growing
 * past the ribbon (TOUCH's min-height would).
 */
const HIT = "max-md:after:absolute max-md:after:-inset-x-1 max-md:after:top-1/2 max-md:after:h-11 max-md:after:-translate-y-1/2 max-md:after:content-['']";
const GHOST = cn("relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--r-control)] px-2 text-xs font-medium text-imp-ink hover:bg-imp-ink/12", RING, HIT);

/** The client clock to the second (null on the server and during hydration, so both render the same text). */
function subscribeSeconds(onChange: () => void): () => void {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}
const secondNow = () => Math.floor(Date.now() / 1000) * 1000;
const noClock = () => null;

function useCountdown(endsAt: string | null, serverNow: string): number {
  // the server's offset, measured once when the ribbon mounts (a re-render must not move it)
  const [offset] = useState(() => clockOffset(serverNow, Date.now()));
  const now = useSyncExternalStore(subscribeSeconds, secondNow, noClock);
  // the server render counts on its own clock; the client takes over at its first tick
  return now === null ? remainingMs(endsAt, Date.parse(serverNow), 0) : remainingMs(endsAt, now, offset);
}

export function ImpersonationRibbon(p: RibbonProps) {
  const t = useT();
  const pulse = usePulse();
  const endsAt = ribbonEndsAt(pulse.body, p.expiresAt);
  const left = useCountdown(endsAt, p.serverNow);
  const [ending, startEnding] = useTransition();
  const ended = useRef(false);

  // at 0 the view ends itself: T2's action ends the row and returns to the console
  useEffect(() => {
    if (left > 0 || ended.current || !endsAt) return;
    ended.current = true;
    startEnding(async () => {
      await endImpersonationAction();
    });
  }, [left, endsAt]);

  return (
    <div
      role="region"
      aria-label={t("shell.impersonation.ribbon")}
      data-slot="impersonation-ribbon"
      className="sticky top-0 z-50 flex h-9 w-full shrink-0 items-center gap-2 bg-imp-bg px-3 text-imp-ink sm:px-4"
    >
      <EyeIcon aria-hidden="true" className="size-4 shrink-0" />
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] leading-none">
        <span className="truncate max-sm:hidden">{t("shell.impersonation.viewing", { store: p.storeName })}</span>
        <span className="truncate sm:hidden">{t("shell.impersonation.label")}</span>
        <span aria-hidden="true" className="opacity-60">
          ·
        </span>
        <span className="shrink-0 max-sm:hidden">{t("shell.impersonation.read_only")}</span>
        <span aria-hidden="true" className="opacity-60 max-sm:hidden">
          ·
        </span>
        <span className={cn("shrink-0 font-mono text-[12px] font-medium", NUM)} dir="ltr" aria-live="off">
          {t("shell.impersonation.left", { time: formatCountdown(left) })}
        </span>
      </p>
      <Popover>
        <PopoverTrigger className={GHOST}>
          <InfoIcon aria-hidden="true" className="size-3.5" />
          <span className="max-sm:sr-only">{t("shell.impersonation.why")}</span>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="grid w-72 gap-2 rounded-[var(--r-sheet)] p-4 text-sm">
          <p className="font-medium">{t("shell.impersonation.why_title")}</p>
          <p className="text-muted-foreground">{t("shell.impersonation.reason", { reason: t(`shell.impersonation.reasons.${p.reason}`) })}</p>
          <p className="flex items-start gap-2 text-muted-foreground">
            <LockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {t("shell.impersonation.masked")}
          </p>
        </PopoverContent>
      </Popover>
      <div className="max-sm:hidden">
        <NoteComposer storeId={p.storeId} />
      </div>
      <a href={p.profileHref} target="_blank" rel="noopener noreferrer" className={cn(GHOST, "max-md:hidden")}>
        <SquareArrowOutUpRightIcon aria-hidden="true" className="size-3.5" />
        {t("shell.impersonation.open_profile")}
      </a>
      <form action={endImpersonationAction}>
        <button
          type="submit"
          disabled={ending}
          className={cn("relative inline-flex h-7 shrink-0 items-center rounded-[var(--r-control)] px-2.5 text-xs font-semibold text-imp-ink ring-1 ring-imp-ink/70 ring-inset hover:bg-imp-ink hover:text-imp-bg disabled:opacity-60", RING, HIT)}
        >
          {t("shell.impersonation.end")}
        </button>
      </form>
    </div>
  );
}

/** A sensitive surface during "view as store": its lock state instead of the content (secrets, exports, phone reveal). */
export function HiddenWhileViewing({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT();
  const { impersonating } = useViewerFlags();
  if (!impersonating) return <>{children}</>;
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-[var(--r-control)] bg-muted px-3 py-2 text-[13px] text-muted-foreground", className)}>
      <LockIcon aria-hidden="true" className="size-3.5 shrink-0" />
      {t("shell.impersonation.hidden")}
    </p>
  );
}
