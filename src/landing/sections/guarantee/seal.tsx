/**
 * seal → the promise card (design.md DES-§5.13 S8; owner rule 2): the id stays for saved pages, the seal is gone. No
 * badge, no ring of text, no rotating disc, no rings of light. A hairline card on the page's ground holds the
 * promises (icon, the promise in strong type, its sentence) and the closing row (the order button when the merchant
 * keeps it, the quiet delivery & returns link). The real COD fact ("0 DH d'avance") is a plain text chip at the top of
 * the card, never a seal shape; a merchant's own short word takes its place, a check centre shows none.
 * Desktop: the split heading (title | lead) over the card. RTL: the card and the chip mirror by logical properties.
 */
import type { ReactElement } from "react";
import { SectionHeader, reveal } from "@/landing/primitives";
import type { RenderContext } from "../../types";
import { UI, langOf } from "./copy";
import { promiseLines, typo, type GuaranteeData, type ViewProps } from "./model";
import { Foot, PromiseList, zeroAmount } from "./parts";

/** The chip's words: "0 DH" and "d'avance", the merchant's own label and line, or nothing (a check centre). */
function chipWords(ctx: RenderContext, data: GuaranteeData): { strong: string; rest: string; ltr: boolean } | null {
  const own = data.badgeLabel.trim();
  if (data.badgeCenter === "text" && own) return { strong: own, rest: data.badgeSub.trim(), ltr: false };
  if (data.badgeCenter !== "zero") return null;
  const z = zeroAmount(ctx);
  const amount = z.cur ? (z.before ? `${z.cur} ${z.n}` : `${z.n} ${z.cur}`) : z.n;
  return { strong: amount, rest: data.badgeSub.trim() || UI[langOf(ctx.locale)].upfront, ltr: true };
}

export function Seal({ ctx, data, titleId }: ViewProps): ReactElement {
  const lines = promiseLines(data);
  const chip = chipWords(ctx, data);
  return (
    <div className="lp-container lp-guarantee__wrap lp-cq">
      <SectionHeader
        ctx={ctx}
        kicker={data.kicker}
        title={typo(ctx.locale, data.title)}
        lead={typo(ctx.locale, data.lead)}
        size="m"
        align="split"
        titleId={titleId}
        editBase=""
        className="lp-guarantee__head"
      />
      <div className="lp-guarantee__card lp-guarantee__card--line" {...reveal("rise", 60)}>
        {chip ? (
          <p className="lp-guarantee__zchip">
            {/* the amount reads left to right in every language ("0 DH", "DH 0") */}
            <bdi className="lp-guarantee__zstrong" dir={chip.ltr ? "ltr" : undefined}>
              {chip.strong}
            </bdi>
            {chip.rest ? <span className="lp-guarantee__zrest">{chip.rest}</span> : null}
          </p>
        ) : null}
        <PromiseList ctx={ctx} lines={lines} delay={160} />
        <Foot ctx={ctx} data={data} delay={360} />
      </div>
    </div>
  );
}
