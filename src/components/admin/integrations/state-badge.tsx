import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_CHIP, type HubTone } from "./hub-format";

/** A state as its word plus its token colour (§I.6, OPE-§28.1): never a lone dot. */
export function StateBadge({ tone, children, live = false, className }: { tone: HubTone; children: ReactNode; live?: boolean; className?: string }) {
  const t = TONE_CHIP[tone];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs leading-none font-medium whitespace-nowrap ring-1 ring-inset", t.chip, className)}>
      <span aria-hidden="true" className="relative flex size-1.5">
        {live && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden", t.dot)} />}
        <span className={cn("relative inline-flex size-1.5 rounded-full", t.dot)} />
      </span>
      {children}
    </span>
  );
}
