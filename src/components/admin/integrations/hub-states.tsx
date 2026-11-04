"use client";
/**
 * The integrations hub's quiet states (OPE-§28.1, DES-§16.17, D60: no aurora, no grain): nothing connected (a skeleton
 * preview of the strip, one sentence, one primary action, one teaching line; never a made-up number), the pending
 * store's locked card, an inline load error with a retry, and the one-line read-only reason.
 */
import { EyeIcon, LockIcon, RotateCwIcon, SheetIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";

/** "now" for relative times: the server's instant first (no hydration drift), then a fresh one every 30 s. */
export function useNow(initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function ReadOnlyNote({ text }: { text: string }) {
  return (
    <p className="mb-6 flex items-start gap-2 text-sm text-muted-foreground">
      <EyeIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

export function LockedCard() {
  const t = useT();
  return (
    <section className="adm-surface-flat flex flex-col items-start gap-3 p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/60">
        <LockIcon className="size-4.5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold tracking-[-0.01em]">{t("int.hub.locked.title")}</h2>
      <p className="max-w-[52ch] text-sm text-pretty text-muted-foreground">{t("int.hub.locked.body")}</p>
    </section>
  );
}

/** Nothing connected yet: the strip's outline in skeleton, the sentence, Connect Google Sheets, one teaching line. */
export function EmptyHub({ canConnect }: { canConnect: boolean }) {
  const t = useT();
  const store = useStore();
  return (
    <section className="adm-surface-flat overflow-hidden p-5 sm:p-8">
      <div aria-hidden="true" className="grid grid-cols-1 gap-3 opacity-70 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("rounded-2xl bg-card/70 p-4 ring-1 ring-foreground/[0.06] ring-inset", i > 0 && "max-sm:hidden")}>
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 w-24 rounded-full bg-foreground/[0.07]" />
              <div className="h-5 w-14 rounded-full bg-foreground/[0.05]" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="grid gap-1.5">
                  <div className="h-2 w-10 rounded-full bg-foreground/[0.05]" />
                  <div className="h-3.5 w-8 rounded-full bg-foreground/[0.08]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-7 grid max-w-[56ch] gap-4">
        <p className="text-[0.95rem] leading-relaxed font-medium text-pretty">{t("int.hub.empty.lead")}</p>
        {canConnect && (
          <div>
            <Button asChild variant="brand" className="h-11 px-4 sm:h-9">
              <Link href={store.href("/integrations/sheets")}>
                <SheetIcon aria-hidden="true" />
                {t("int.hub.connectSheets")}
              </Link>
            </Button>
          </div>
        )}
        <p className="text-sm text-pretty text-muted-foreground">{t("int.hub.empty.teach")}</p>
      </div>
    </section>
  );
}

/** A block that failed to load: one line and Try again (a fresh server render, or the caller's own retry). */
export function InlineError({ text, onRetry, className }: { text?: string; onRetry?: () => void; className?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-destructive/[0.06] px-4 py-3 ring-1 ring-destructive/15 ring-inset", className)}>
      <p className="text-sm text-destructive">{text ?? t("int.hub.loadError")}</p>
      <Button variant="outline" size="sm" className="h-11 sm:h-7" disabled={pending} onClick={() => (onRetry ? onRetry() : start(() => router.refresh()))}>
        <RotateCwIcon className={cn(pending && "animate-spin")} aria-hidden="true" />
        {t("int.hub.retry")}
      </Button>
    </div>
  );
}
