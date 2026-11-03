/**
 * chat → ledger (design.md DES-§5.13 S5): the id stays for saved pages; the chat mock is gone (S20: no bubbles, no
 * timestamps, no avatars, no typing dots). The pains are a plain two-column ledger on hairlines: each pain at the
 * inline start in the strong weight, the product's answer at the inline end (≤ 2 lines); on phones the answer sits
 * under its pain, indented by one column. The turn (the one line that names the product) closes it. No price and no
 * button here (ctas 0): the page's actions live in the hero, the form and the final call.
 */
import type { ReactElement } from "react";
import { Container, RichText, SectionHeader, reveal } from "@/landing/primitives";
import type { ViewProps } from "./model";

/** Reveal step between ledger rows (ms): the hairlines tick in one after the other. */
const ROW_STEP = 90;

export function Chat({ ctx, data, titleId }: ViewProps): ReactElement {
  const solution = data.solution.trim();
  return (
    <Container className="lp-problem__ledgergrid">
      <SectionHeader ctx={ctx} kicker={data.kicker} title={data.title} lead={data.lead} editBase="" titleId={titleId} size="l" align="split" className="lp-problem__head" />
      <dl className="lp-problem__ledger">
        {data.pains.map((p, i) => (
          <div key={i} className="lp-problem__row" data-fix={p.fix.trim() ? "" : undefined} {...reveal("rise", 120 + i * ROW_STEP)}>
            <dt className="lp-problem__pain">
              <RichText as="span" text={p.text} ctx={ctx} decorate={false} editPath={`pains.${i}.text`} />
            </dt>
            <dd className="lp-problem__fix">{p.fix.trim() ? <RichText as="span" text={p.fix} ctx={ctx} decorate={false} editPath={`pains.${i}.fix`} /> : null}</dd>
          </div>
        ))}
      </dl>
      {solution ? <RichText as="p" block className="lp-problem__close" text={solution} ctx={ctx} editPath="solution" reveal="rise" delay={120 + data.pains.length * ROW_STEP} /> : null}
    </Container>
  );
}
