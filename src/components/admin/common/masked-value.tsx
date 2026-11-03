"use client";
/**
 * MaskedValue (P2 SHELL; platform.md PLA-§22.12, §7.2, §10.2, PD1, PD69): a customer field as the repository masked
 * it ("+212 6•• ••• •34") in a left-to-right isolate, with an optional audited reveal. Under impersonation there is no
 * reveal affordance at all, whatever the caller passed (`useViewerFlags`; the server refuses it anyway).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). The reveal asks once (every reveal is audited
 * server-side), then shows the clear value in place; a failed reveal keeps the mask and lets the viewer try again.
 */
import { EyeIcon, Loader2Icon } from "lucide-react";
import { useState, type ReactElement } from "react";
import type { Masked } from "@/lib/platform/mask";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TOUCH } from "./ui-classes";
import { useViewerFlags } from "./viewer-flags";

export interface MaskedValueProps {
  value: Masked | string;
  reveal?: { onReveal(): Promise<string>; label: string };
}

export function MaskedValue(p: MaskedValueProps): ReactElement | null {
  const { impersonating } = useViewerFlags();
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reveal = impersonating ? undefined : p.reveal;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
      <bdi dir="ltr" data-masked={shown === null ? "" : undefined} className={cn("truncate font-mono text-[13px] tabular-nums", shown === null && "text-foreground/80")}>
        {shown ?? p.value}
      </bdi>
      {reveal && shown === null && (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={async () => {
            setBusy(true);
            try {
              setShown(await reveal.onReveal());
            } catch {
              // the mask stays; the caller's action already toasted its refusal
            } finally {
              setBusy(false);
            }
          }}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-[var(--r-chip)] px-1.5 text-xs font-medium text-muted-foreground transition-colors duration-[var(--dur-1)] hover:bg-muted hover:text-foreground disabled:opacity-60",
            FOCUS_RING,
            TOUCH,
          )}
        >
          {busy ? <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : <EyeIcon aria-hidden="true" className="size-3.5" />}
          {reveal.label}
        </button>
      )}
    </span>
  );
}
