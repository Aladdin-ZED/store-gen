"use client";
/**
 * The welcome flow's top bar (P2 SHELL; platform.md PLA-§22.2: full screen, no sidebar): the store's mark and name on
 * the start side, the four-segment progress in the middle, "Skip for now" (until the page exists) or "Go to my
 * dashboard" (on the done step) on the end side. Under 640 px the progress drops under the row so nothing truncates.
 */
import Link from "next/link";
import { BrandMark } from "@/components/admin/shell/brand-mark";
import { useStore } from "@/components/admin/shell/store-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/admin/common/ui-classes";
import { PROGRESS_SEGMENTS } from "./flow-logic";

export function WelcomeHeader({ progress, onSkip, busy, dashboard }: { progress: number; onSkip?: (() => void) | null; busy?: boolean; dashboard?: boolean }) {
  const t = useT();
  const store = useStore();
  const bar = (
    <div role="progressbar" aria-label={t("onboarding.progress")} aria-valuemin={0} aria-valuemax={PROGRESS_SEGMENTS} aria-valuenow={progress} className="flex w-full gap-1.5">
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
        <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i < progress ? "bg-primary" : "bg-border")} />
      ))}
    </div>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-[1fr_minmax(160px,240px)_1fr] sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="size-7 shrink-0" />
          <span className="truncate text-[0.95rem] font-semibold tracking-tight">{store.name}</span>
        </div>
        <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">{bar}</div>
        <div className="flex justify-end">
          {dashboard ? (
            <Link href={store.href("")} className={cn(buttonVariants({ variant: "ghost" }), "h-11 rounded-full px-4 text-muted-foreground hover:text-foreground", FOCUS_RING)}>
              {t("onboarding.done")}
            </Link>
          ) : onSkip ? (
            <Button type="button" variant="ghost" className={cn("h-11 rounded-full px-4 text-muted-foreground hover:text-foreground", FOCUS_RING)} onClick={onSkip} disabled={busy}>
              {t("onboarding.skip")}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
