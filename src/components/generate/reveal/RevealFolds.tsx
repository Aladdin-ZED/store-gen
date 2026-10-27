"use client";
/**
 * The onboarding reveal: three directions as three real page folds (P6 DESIGN; design.md DES-§14.3, UX-01, UX-20;
 * docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT2-6). P2's `/app/<h>/welcome` step mounts it and owns the step, its
 * timing and its acceptance; P7 fills the two slots (`<DirectorWhy directionId>` in each DNA card, its
 * `<DirectorPassControl>` in the bottom action row beside "Use this design", never over a fold).
 *
 * The props are frozen at P0 (src/lib/contracts/r1-p0.ts) because P2 and P7 merge before P6. P0 stub: the three
 * documents' first sections rendered statically side by side (stacked on a phone), each with its label, its DNA slot
 * and its "Use this design" button, the action slot under them; a skeleton while analysing, one sentence and "Try
 * again" on error. P6 replaces the body (the live 390 px folds, the carousel with its 8 % peek, the DNA bottom sheet,
 * the motion of DES-§14.3) and never changes the props.
 */
import type { ReactNode } from "react";
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import { Button } from "@/components/ui/button";
import type { GenomeCard } from "@/lib/design/digest";
import { useT } from "@/lib/i18n/admin/client";
import type { PageDoc } from "@/lib/page/schema";

export type RevealDirection = { id: string; doc: PageDoc; card: GenomeCard; label: string };

export interface RevealFoldsProps {
  directions: readonly [RevealDirection, RevealDirection, RevealDirection];
  state: "analysing" | "revealed" | "error";
  /** P7's <DirectorWhy directionId>, inside each DNA card / bottom sheet */
  dnaSlot?: (directionId: string) => ReactNode;
  /** P7's <DirectorPassControl>, the bottom action row beside "Use this design" */
  actionSlot?: ReactNode;
  onUse(directionId: string): void;
  onRetry?(): void;
}

/** The stub renders without the store's files: images resolve to nothing until P6's reveal loads them. */
const NO_ASSETS: PreviewAssets = {};

export function RevealFolds({ directions, state, dnaSlot, actionSlot, onUse, onRetry }: RevealFoldsProps) {
  const t = useT();
  if (state === "error") {
    return (
      <div className="adm-surface-flat flex flex-wrap items-center gap-3 p-5 text-sm" role="alert">
        <p className="min-w-0 flex-1 text-pretty">{t("design.reveal.error")}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onRetry}>
            {t("design.reveal.retry")}
          </Button>
        ) : null}
      </div>
    );
  }
  if (state === "analysing") {
    return (
      <div className="grid gap-3" aria-busy="true">
        <p className="text-[0.85rem] text-muted-foreground">{t("design.reveal.analysing")}</p>
        <ul className="grid gap-4 md:grid-cols-3">
          {directions.map((d) => (
            <li key={d.id} className="aspect-[9/16] max-h-[520px] rounded-xl bg-muted" />
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <ul className="grid gap-4 md:grid-cols-3">
        {directions.map((d) => (
          <li key={d.id} className="grid content-start gap-3">
            <LandingThumbnail doc={d.doc} assets={NO_ASSETS} device="mobile" sections={3} label={d.label} className="w-full overflow-hidden rounded-xl border" />
            <p className="text-[0.85rem] font-medium">{d.label}</p>
            {dnaSlot ? <div className="min-w-0">{dnaSlot(d.id)}</div> : null}
            <Button className="h-10 rounded-full" onClick={() => onUse(d.id)}>
              {t("design.reveal.use")}
            </Button>
          </li>
        ))}
      </ul>
      {actionSlot ? <div className="flex flex-wrap items-center gap-3">{actionSlot}</div> : null}
    </div>
  );
}
