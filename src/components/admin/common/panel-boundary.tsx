"use client";
/**
 * PanelBoundary (P2 SHELL; platform.md PLA-§22.12, §4.5, §22.17, PD1; design.md DES-§16.8, §16.17 item 12): one
 * panel's Suspense and error boundary, so a slow or failing panel never takes the page with it. While loading: the
 * panel's skeleton (after 200 ms, static tint). On error: "This panel couldn't load. The rest of the page works.",
 * **Retry** (Next's `retry()`: re-fetches the server children in a transition, client state outside kept) and the
 * error reference (the `digest` the server logged with `error_events`, so support can find it), never raw error text.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). Built on `catchError` (next/error): `redirect()`
 * and `notFound()` pass through it, and its state clears on a client navigation.
 */
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import { Suspense, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { PanelSkeleton } from "./skeleton";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface PanelBoundaryProps {
  title: string;
  children: ReactNode;
}

/** The reference of a thrown value: the server digest when there is one, else nothing (never the message). */
function referenceOf(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error) {
    const d = (error as { digest?: unknown }).digest;
    if (typeof d === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(d)) return d;
  }
  return null;
}

export function PanelError({ title, error, retry }: { title: string; error: unknown; retry(): void }) {
  const t = useT();
  const ref = referenceOf(error);
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[var(--r-control)] bg-destructive-soft/50 p-4 ring-1 ring-destructive/15 ring-inset sm:flex-row sm:items-center">
      <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive-ink" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-sm font-medium text-foreground">
          <span className="sr-only">{title}: </span>
          {t("shell.panel.error")}
        </p>
        {ref && (
          <p className="text-xs text-muted-foreground">
            {t("shell.panel.ref", { ref: "⁨" + ref + "⁩" })}
          </p>
        )}
      </div>
      <Button type="button" variant="outline" size="lg" className={`gap-1.5 ${FOCUS_RING} ${TOUCH}`} onClick={() => retry()}>
        <RotateCwIcon aria-hidden="true" />
        {t("shell.err.retry")}
      </Button>
    </div>
  );
}

const Boundary = catchError((props: { title: string }, info: ErrorInfo) => <PanelError title={props.title} error={info.error} retry={info.retry} />);

export function PanelBoundary(p: PanelBoundaryProps): ReactElement | null {
  return (
    <section aria-label={p.title} className="min-w-0">
      <Boundary title={p.title}>
        <Suspense fallback={<PanelSkeleton />}>{p.children}</Suspense>
      </Boundary>
    </section>
  );
}
