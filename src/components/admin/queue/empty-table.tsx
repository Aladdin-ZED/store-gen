/** The ops screens' quiet empty state (P4 CALL CENTER; core §I.8): a skeleton of the real table, one sentence, one action. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyTable({ cols, text, action }: { cols: number; text: string; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="grid gap-px opacity-60" aria-hidden="true">
        {[0, 1, 2].map((r) => (
          <div key={r} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
            {Array.from({ length: Math.min(cols, 5) }, (_, i) => (
              <span key={i} className={cn("h-2.5 rounded-full bg-foreground/[0.06]", i === 0 ? "w-28" : "w-12", i > 2 && "hidden sm:block")} />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 bg-card/70 px-6 text-center">
        <p className="q-sm max-w-sm text-foreground/80">{text}</p>
        {action}
      </div>
    </div>
  );
}
