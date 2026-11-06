/**
 * whatsapp → quote cards (design.md DES-§5.13 S6): the id stays for saved pages; the phone mock-ups are gone (S21:
 * no phone frame, no bubbles, no read ticks, no timestamps). What the customers wrote is set as plain quotes: each
 * thread's own words (the customer's messages, never the shop's answers) on a card of the page's one card tier, the
 * name and the city under it in caption size. No avatar, no rating, no time (D2). One quote: a single wide quote at
 * lead size; two or three: a row of cards from 48rem, one column on phones. No price and no button here (ctas 0).
 * The quotes are the merchant's content (honesty I4: the publish gate asks for real ones while `sample` is on).
 */
import { Fragment, type ReactElement } from "react";
import { Container, RichText, SectionShell, reveal } from "../../primitives";
import { Header, titleId } from "./parts";
import type { ChatData, Props } from "./schema";

interface QuoteLine {
  text: string;
  path: string;
}

/** The customer's own words in a thread, in order (the shop's replies and photo-only messages are left out). */
function customerWords(chat: ChatData, ci: number): QuoteLine[] {
  return chat.messages
    .map((m, mi) => ({ m, path: `chats.${ci}.messages.${mi}.text` }))
    .filter(({ m }) => m.from === "customer" && m.text.trim())
    .map(({ m, path }) => ({ text: m.text.trim(), path }));
}

export function WhatsAppView({ id, ctx, data, bg }: Props): ReactElement {
  const quotes = data.chats
    .map((chat, ci) => ({ chat, ci, lines: customerWords(chat, ci) }))
    .filter((q) => q.lines.length)
    .slice(0, 3);
  return (
    <SectionShell id={id} ctx={ctx} type="socialProof" variant="whatsapp" bg={bg} labelledBy={titleId(id)}>
      <Container>
        <Header ctx={ctx} data={data} id={id} />
        <ul className="lp-sp__quotes" role="list" data-n={quotes.length}>
          {quotes.map(({ chat, ci, lines }, k) => (
            <li key={ci} className="lp-sp__quote" {...reveal("rise", 80 + k * 90)}>
              <figure className="lp-sp__qfig">
                <blockquote className="lp-sp__qtext">
                  <p>
                    {lines.map((l, i) => (
                      <Fragment key={l.path}>
                        {i ? " " : null}
                        <RichText as="span" text={l.text} ctx={ctx} decorate={false} editPath={l.path} />
                      </Fragment>
                    ))}
                  </p>
                </blockquote>
                <figcaption className="lp-sp__qby">
                  <span className="lp-sp__qname">{chat.name}</span>
                  {chat.city.trim() ? <span className="lp-sp__qcity">{chat.city}</span> : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </SectionShell>
  );
}
