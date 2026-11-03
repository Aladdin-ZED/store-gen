/**
 * `big` — the closing chapter of the page: a large statement (h2) with WhatsApp / call buttons,
 * a links grid (contact · your order · information), a base row (COD capsule, socials, identity,
 * back to top) and the signature moment — the store name set edge to edge across the bottom edge,
 * its letters melting from the page ink into the product accent over a horizon glow of the same
 * hue, rising out of the edge as the page reaches its end (scroll-driven where supported, a fade
 * elsewhere).
 */
import type { ReactElement } from "react";
import { cx, editAttr, Icon, LinkButton, reveal, RichText } from "../../primitives";
import type { RenderContext } from "../../types";
import { hasStoreName } from "../persona";
import { glueRanges } from "../trustBar/model";
import { GiantWord } from "./giant";
import type { FooterData } from "./model";
import {
  Brand,
  ChannelIcon,
  ChannelLink,
  channels,
  ChannelValue,
  chromeOf,
  CodPill,
  Identity,
  LegalNav,
  Socials,
  telHref,
  ToTop,
  whatsappHref,
} from "./parts";

/** Up to two contact buttons, WhatsApp first (with a pre-filled question about the product). */
function Actions({ ctx }: { ctx: RenderContext }): ReactElement | null {
  const c = chromeOf(ctx);
  const s = ctx.store;
  const hello = c.waHello.replace("{product}", ctx.product.name.slice(0, 80));
  const wa = s.whatsapp ? whatsappHref(s.whatsapp, hello) : undefined;
  const tel = s.phone ? telHref(s.phone) : undefined;
  const mail = s.email ? `mailto:${s.email}` : undefined;
  const buttons = [
    wa ? (
      <LinkButton
        key="wa"
        ctx={ctx}
        href={wa}
        label={c.askWhatsapp}
        variant="primary"
        size="l"
        icon="whatsapp"
        className="lp-footer__action"
      />
    ) : null,
    tel ? (
      <LinkButton
        key="tel"
        ctx={ctx}
        href={tel}
        label={c.call}
        variant={wa ? "secondary" : "primary"}
        size="l"
        icon="phone"
        className="lp-footer__action"
      />
    ) : null,
    mail ? (
      <LinkButton
        key="mail"
        ctx={ctx}
        href={mail}
        label={c.write}
        variant="secondary"
        size="l"
        icon="chat"
        className="lp-footer__action"
      />
    ) : null,
  ]
    .filter(Boolean)
    .slice(0, 2);
  if (!buttons.length) return null;
  return (
    <div className="lp-footer__actions" data-stagger="90">
      {buttons.map((b, i) => (
        <div
          key={i}
          className="lp-footer__action-wrap"
          {...reveal("rise", 260)}
        >
          {b}
        </div>
      ))}
    </div>
  );
}

export function Big({
  id,
  ctx,
  data,
}: {
  id: string;
  ctx: RenderContext;
  data: FooterData;
}): ReactElement {
  const c = chromeOf(ctx);
  const reach = data.showContact ? channels(ctx, c, data.showAddress) : [];
  const promises = data.promises.filter((p) => p.text.trim());
  const heading = data.heading.trim();
  // the statement invites a question: only with a channel to answer it
  const asks = !!heading && reach.some((ch) => ch.href);
  const socials = data.showSocials ? <Socials ctx={ctx} c={c} /> : null;
  const t = (k: string) => `${id}-ft-${k}`;
  // the giant word is the store's name (or the merchant's own word): never the product name standing
  // in for a store that has none — the page then simply closes on its base row
  const word = data.wordmark.trim() || (hasStoreName(ctx) ? ctx.store.name.trim() : "");

  return (
    <>
      <div className="lp-container lp-footer__upper">
        <div className="lp-footer__lead">
          {ctx.store.logo || !asks ? (
            <div className="lp-footer__mark" {...reveal("blur-in")}>
              <Brand ctx={ctx} />
            </div>
          ) : null}
          {asks ? (
            <RichText
              as="h2"
              className="lp-footer__title"
              text={heading}
              ctx={ctx}
              split
              reveal="blur-in"
              editPath="heading"
            />
          ) : null}
          <RichText
            as="p"
            className="lp-footer__tagline"
            text={data.tagline}
            ctx={ctx}
            decorate={false}
            reveal="fade"
            delay={180}
            editPath="tagline"
          />
          {asks ? <Actions ctx={ctx} /> : null}
        </div>

        <div className="lp-footer__cols" data-stagger="90">
          {reach.length ? (
            <div className="lp-footer__col" {...reveal("rise")}>
              <p className="lp-footer__col-title" id={t("contact")}>
                {c.contact}
              </p>
              <ul
                className="lp-footer__list"
                role="list"
                aria-labelledby={t("contact")}
              >
                {reach.map((ch) => (
                  <li key={ch.key}>
                    <ChannelLink ch={ch} c={c} className="lp-footer__item">
                      <span className="lp-footer__item-icon" aria-hidden="true">
                        <ChannelIcon k={ch.key} size="1.05em" />
                      </span>
                      <span className="lp-visually-hidden">{ch.label} </span>
                      <ChannelValue ch={ch} className="lp-footer__item-text" />
                    </ChannelLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {promises.length ? (
            <div className="lp-footer__col" {...reveal("rise")}>
              <p className="lp-footer__col-title" id={t("order")}>
                {c.order}
              </p>
              <ul
                className="lp-footer__list"
                role="list"
                aria-labelledby={t("order")}
              >
                {promises.map((p, i) => (
                  <li
                    key={i}
                    className="lp-footer__item lp-footer__item--static"
                  >
                    <span className="lp-footer__item-icon" aria-hidden="true">
                      <Icon name={p.icon} size="1.05em" />
                    </span>
                    <RichText
                      as="span"
                      className="lp-footer__item-text"
                      text={glueRanges(p.text, ctx.dir)}
                      ctx={ctx}
                      decorate={false}
                      editPath={`promises.${i}.text`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="lp-footer__col" {...reveal("rise")}>
            <p className="lp-footer__col-title" id={t("info")}>
              {c.info}
            </p>
            <LegalNav
              ctx={ctx}
              c={c}
              labelledBy={t("info")}
              className="lp-footer__legal--col"
            />
          </div>
        </div>
      </div>

      {/* without the giant word the base row closes the page: it keeps a run-out of its own */}
      <div className={cx("lp-container lp-footer__base", !word && "lp-footer__base--last")}>
        <span
          className="lp-footer__rule"
          aria-hidden="true"
          {...reveal("wipe-side", 100)}
        />
        <CodPill ctx={ctx} text={data.cod} delay={160} />
        {socials || data.backToTop ? (
          <div className="lp-footer__meta" {...reveal("fade", 220)}>
            {socials}
            {data.backToTop ? <ToTop c={c} /> : null}
          </div>
        ) : null}
        <div className="lp-footer__fine" {...reveal("fade", 260)}>
          <Identity ctx={ctx} />
        </div>
      </div>

      {word ? (
        <div
          className="lp-container lp-footer__giant"
          {...editAttr(ctx, "wordmark")}
          {...reveal("fade", 120)}
        >
          <GiantWord ctx={ctx} word={word} uid={id} />
        </div>
      ) : null}
    </>
  );
}
