/**
 * Legal document body — privacy policy, terms of sale, shipping & returns, contact — as a standalone,
 * elegant long-form reading page in the landing page's own theme (v2 · modern):
 *
 *   bar (wordmark + back to the product) · a softly lit hero panel (segmented document switcher,
 *   kicker, big title, "updated" chip) · two-column layout: a glass "in short" card that floats over
 *   the hero's lower edge + a sticky numbered table of contents | the article at a comfortable
 *   measure (numbered sections, identity ledgers, soft callouts, highlighted gaps the merchant must
 *   complete) · a "questions?" card · dark footer with the seller identity and the other documents.
 *
 * Pure markup, zero JavaScript (works the same live, exported and printed). Styles: legal.css.
 *
 * The store's answers (`policy`, ./policy.ts) decide every promise of the texts (./promises.ts) and which contact
 * channels show; without them the documents promise nothing and show their gaps (landing.md LAN-§3.3).
 */
import type { ReactElement, ReactNode } from "react";
import { brandName, cx, Icon, pad2, Picture, SkipLink, type IconName } from "../primitives";
import type { PageLinks, RenderContext, StoreContext } from "../types";
import { contactChannels, legalChrome, legalLang, legalTexts } from "./content";
import type { Block, Inline, LegalChrome, LegalKind, LegalText } from "./model";
import type { LegalPolicyInput } from "./policy";

type ChannelKey = "whatsapp" | "phone" | "email";

export const LEGAL_ORDER: readonly LegalKind[] = ["privacy", "terms", "shipping", "contact"];

const NAV_KEY = {
  privacy: "footer.privacy",
  terms: "footer.terms",
  shipping: "footer.shipping",
  contact: "footer.contact",
} as const;

/** The four documents as links (label in the page language, URL for the delivery mode) — footers, thank-you page. */
export function legalNav(ctx: Pick<RenderContext, "t" | "links">): { kind: LegalKind; label: string; href: string }[] {
  return LEGAL_ORDER.map((kind) => ({ kind, label: ctx.t(NAV_KEY[kind]), href: ctx.links[kind] }));
}

/** "7 octobre 2026" / "7 أكتوبر 2026" / "October 7, 2026" — Latin digits, the market's calendar day. */
function longDate(iso: string, locale: string): string {
  const tag = locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-FR" : locale === "en" ? "en-GB" : locale;
  try {
    return new Intl.DateTimeFormat(tag, { dateStyle: "long", numberingSystem: "latn", timeZone: "Africa/Casablanca" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/* ------------------------------------------------------------------ */
/* Inline & block content                                              */
/* ------------------------------------------------------------------ */

const ARABIC_LETTER = /[؀-ۿ]/;

function InlineRun({ parts, chrome }: { parts: readonly Inline[]; chrome: LegalChrome }): ReactElement {
  return (
    <>
      {parts.map((x, i) => {
        if (typeof x === "string") return x;
        if (x.kind === "b") return <strong key={i}>{x.text}</strong>;
        if (x.kind === "ph")
          return (
            <span key={i} className="lp-legal__ph">
              <span className="lp-visually-hidden">{chrome.todo} </span>
              {x.label}
            </span>
          );
        // phone numbers, e-mails and URLs keep their own (LTR) order inside Arabic sentences: digits and "+" carry no
        // direction, so `dir="auto"` read "+212 6 12…" right to left; a link without Arabic letters is isolated LTR
        return (
          <a key={i} href={x.href} className="lp-legal__a" dir={ARABIC_LETTER.test(x.text) ? "auto" : "ltr"} {...(x.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {x.text}
          </a>
        );
      })}
    </>
  );
}

const CALLOUT_ICON: Record<Extract<Block, { kind: "callout" }>["icon"], IconName> = {
  "cash-hand": "cash-hand",
  "shield-check": "shield-check",
  info: "info",
  return: "return",
  truck: "truck",
};

function BlockView({ block, chrome }: { block: Block; chrome: LegalChrome }): ReactElement {
  switch (block.kind) {
    case "p":
      return (
        <p className="lp-legal__p">
          <InlineRun parts={block.content} chrome={chrome} />
        </p>
      );
    case "list":
      return (
        <ul className="lp-legal__list" role="list">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineRun parts={item} chrome={chrome} />
            </li>
          ))}
        </ul>
      );
    case "facts":
      return (
        <dl className="lp-legal__facts">
          {block.rows.map((r, i) => (
            <div key={i} className="lp-legal__fact">
              <dt>{r.label}</dt>
              <dd>
                {/* isolated: a Latin address keeps its own order inside an Arabic page */}
                <bdi>
                  <InlineRun parts={r.value} chrome={chrome} />
                </bdi>
              </dd>
            </div>
          ))}
        </dl>
      );
    case "callout":
      return (
        <div className="lp-legal__callout">
          <span className="lp-legal__callout-icon" aria-hidden="true">
            <Icon name={CALLOUT_ICON[block.icon]} size={22} strokeWidth={1.9} />
          </span>
          <p>
            <InlineRun parts={block.content} chrome={chrome} />
          </p>
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Wordmark({ store, name, home }: { store: StoreContext; name: string; home: string }): ReactElement {
  return (
    <a className="lp-legal__brand" href={home}>
      {store.logo ? (
        <Picture asset={store.logo} sizes="10rem" fit="contain" alt={name} className="lp-legal__logo" />
      ) : (
        <span className="lp-legal__wordmark">{name}</span>
      )}
    </a>
  );
}

function DocSwitcher({ ctx, current, chrome }: { ctx: RenderContext; current: LegalKind; chrome: LegalChrome }): ReactElement {
  return (
    <nav className="lp-legal__docs" aria-label={chrome.documents}>
      <ol className="lp-legal__docs-list" role="list">
        {LEGAL_ORDER.map((k, i) => (
          <li key={k}>
            <a className="lp-legal__doc" href={ctx.links[k]} aria-current={k === current ? "page" : undefined}>
              <span className="lp-legal__doc-n" aria-hidden="true">
                {pad2(i + 1)}
              </span>
              {ctx.t(NAV_KEY[k])}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const CHANNEL_ICON = { whatsapp: "whatsapp", phone: "phone", email: "chat" } as const satisfies Record<string, IconName>;

/** Big tappable contact tiles (contact page) — WhatsApp first and emphasized. */
function ContactTiles({ store, chrome, lang, only }: { store: StoreContext; chrome: LegalChrome; lang: string; only: readonly ChannelKey[] }): ReactElement | null {
  const chans = contactChannels(store, only);
  const address = [store.address, store.city].filter(Boolean).join(", ");
  if (!chans.length && !address) return null;
  const label = { whatsapp: chrome.whatsapp, phone: chrome.call, email: chrome.email };
  return (
    <ul className="lp-legal__tiles" role="list">
      {chans.map((c) => (
        <li key={c.key}>
          <a
            className={cx("lp-legal__tile", c.key === "whatsapp" && "lp-legal__tile--main")}
            href={c.href}
            {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <span className="lp-legal__tile-icon" aria-hidden="true">
              <Icon name={CHANNEL_ICON[c.key]} size={26} strokeWidth={1.8} />
            </span>
            <span className="lp-legal__tile-label">{label[c.key]}</span>
            <span className="lp-legal__tile-value" dir="ltr">
              {c.text}
            </span>
            <Icon name="arrow-up-right" size={20} className="lp-legal__tile-go" />
          </a>
        </li>
      ))}
      {address ? (
        <li>
          <div className="lp-legal__tile lp-legal__tile--static">
            <span className="lp-legal__tile-icon" aria-hidden="true">
              <Icon name="map-pin" size={26} strokeWidth={1.8} />
            </span>
            <span className="lp-legal__tile-label">{lang === "ar" ? "العنوان" : lang === "fr" ? "Adresse" : "Address"}</span>
            <bdi className="lp-legal__tile-value">{address}</bdi>
          </div>
        </li>
      ) : null}
    </ul>
  );
}

/** "A question?" card closing every document but the contact page. */
function Questions({ store, chrome, links, only }: { store: StoreContext; chrome: LegalChrome; links: PageLinks; only: readonly ChannelKey[] }): ReactElement {
  const chans = contactChannels(store, only);
  const wa = chans.find((c) => c.key === "whatsapp");
  const others = chans.filter((c) => c.key !== "whatsapp");
  return (
    <aside className="lp-legal__ask" data-bg="soft" aria-labelledby="lp-legal-ask">
      <h2 id="lp-legal-ask" className="lp-legal__ask-title">
        {chrome.questions}
      </h2>
      <p className="lp-legal__ask-text">{chrome.questionsText}</p>
      <div className="lp-legal__ask-actions">
        {wa ? (
          <a className="lp-btn lp-btn--primary lp-btn--m" href={wa.href} target="_blank" rel="noopener noreferrer">
            <span className="lp-btn__icon lp-btn__icon--lead" aria-hidden="true">
              <Icon name="whatsapp" size="1.2em" strokeWidth={2} />
            </span>
            <span className="lp-btn__label">{chrome.whatsapp}</span>
          </a>
        ) : null}
        {others.map((c) => (
          <a key={c.key} className="lp-legal__ask-link" href={c.href}>
            <Icon name={CHANNEL_ICON[c.key]} size={18} />
            <span dir="ltr">{c.text}</span>
          </a>
        ))}
        {!chans.length ? (
          <a className="lp-legal__ask-link" href={links.contact}>
            <Icon name="arrow-right" size={18} />
            <span>{chrome.questions}</span>
          </a>
        ) : null}
      </div>
    </aside>
  );
}

function Footer({ ctx, store, chrome, year }: { ctx: RenderContext; store: StoreContext; chrome: LegalChrome; year: string }): ReactElement {
  const ids = [
    store.legalName,
    ctx.doc.market === "MA" && store.ice ? `ICE ${store.ice}` : null,
    ctx.doc.market === "MA" && store.rc ? `RC ${store.rc}` : null,
    [store.address, store.city].filter(Boolean).join(", ") || null,
  ].filter((x): x is string => !!x);
  const brand = brandName(ctx);
  return (
    <footer className="lp-section lp-legal__foot" data-bg="dark" data-space="tight">
      <div className="lp-container lp-legal__foot-grid">
        <div className="lp-legal__foot-id">
          <p className="lp-legal__foot-brand">{brand}</p>
          {ids.length ? (
            <p className="lp-legal__foot-line">
              {ids.map((id, i) => (
                <span key={i}>
                  {i ? " · " : null}
                  <bdi>{id}</bdi>
                </span>
              ))}
            </p>
          ) : null}
          <p className="lp-legal__foot-cod">
            <Icon name="cash-hand" size={18} />
            <span>{chrome.cod}</span>
          </p>
        </div>
        <nav aria-label={chrome.documents}>
          <ul className="lp-legal__foot-links" role="list">
            {LEGAL_ORDER.map((k) => (
              <li key={k}>
                <a href={ctx.links[k]}>{ctx.t(NAV_KEY[k])}</a>
              </li>
            ))}
            <li>
              <a href={ctx.links.home}>{chrome.back}</a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="lp-container">
        <p className="lp-legal__foot-copy">
          © {year} {brand}. {ctx.t("footer.rights")}
          {ctx.links.report ? (
            // "Report this store" (LAN-§3.9): the server's absolute reportUrl as given; never in an export
            <>
              {" "}
              <a className="lp-legal__report" href={ctx.links.report} rel="nofollow">
                {ctx.t("footer.report")}
              </a>
            </>
          ) : null}
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Body                                                                */
/* ------------------------------------------------------------------ */

export interface LegalBodyProps {
  ctx: RenderContext;
  kind: LegalKind;
  /** ISO date shown as "updated on" (the published version's date) */
  updatedAt: string;
  /**
   * The store's answers read at serve time (`policies`, `checkout.confirmationCall`, the zones' dates, the calling
   * window). Absent until the render paths pass it (CCR docs/saas/ccr/r1-p3-2.md): every answer then reads as unset.
   */
  policy?: LegalPolicyInput | null;
}

/** Title of a legal document in the page language (for <title>). */
export function legalTitle(ctx: RenderContext, kind: LegalKind): string {
  return legalTexts(ctx)[kind].title;
}

export function LegalBody({ ctx, kind, updatedAt, policy = null }: LegalBodyProps): ReactElement {
  const { store, links } = ctx;
  const lang = legalLang(ctx.locale);
  const chrome = legalChrome(lang);
  const text: LegalText = legalTexts(ctx, policy)[kind];
  const only = policy?.policies.contact.channels ?? [];
  const n = pad2(LEGAL_ORDER.indexOf(kind) + 1);
  const date = longDate(updatedAt, ctx.locale);
  const sectionId = (id: string) => `lg-${id}`;
  const toc: ReactNode = (
    <nav className="lp-legal__toc" aria-labelledby="lp-legal-toc">
      <h2 id="lp-legal-toc" className="lp-legal__aside-title">
        {chrome.toc}
      </h2>
      <ol className="lp-legal__toc-list" role="list">
        {text.sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${sectionId(s.id)}`}>
              <span className="lp-legal__toc-n" aria-hidden="true">
                {pad2(i + 1)}
              </span>
              <span>{s.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <>
      <SkipLink ctx={ctx} />
      <header className="lp-legal__bar" data-bg="base">
        <div className="lp-container lp-legal__bar-inner">
          <Wordmark store={store} name={brandName(ctx)} home={links.home} />
          <a className="lp-legal__back" href={links.home}>
            <Icon name="arrow-right" size="1em" className="lp-legal__back-icon" />
            <span>{chrome.back}</span>
          </a>
        </div>
      </header>

      <main id="main" className="lp-legal" tabIndex={-1}>
        <section className="lp-section lp-legal__hero" data-bg="soft" data-space="normal" aria-labelledby="lp-legal-title">
          <span className="lp-legal__tint" aria-hidden="true" />
          <div className="lp-container lp-legal__hero-inner">
            <DocSwitcher ctx={ctx} current={kind} chrome={chrome} />
            <p className="lp-legal__kicker">
              <span>{chrome.kicker}</span>
              <span className="lp-legal__kicker-n" aria-hidden="true">
                {/* isolated: "02 / 04" keeps its order inside Arabic text */}
                <span dir="ltr">{`${n} / ${pad2(LEGAL_ORDER.length)}`}</span>
              </span>
            </p>
            <h1 id="lp-legal-title" className="lp-legal__title">
              {text.title}
            </h1>
            <p className="lp-legal__updated">
              <Icon name="calendar" size={16} />
              <span>
                {chrome.updated} <time dateTime={updatedAt.slice(0, 10)}>{date}</time>
              </span>
            </p>
          </div>
        </section>

        <div className="lp-section lp-legal__content" data-bg="base" data-space="tight">
          <div className="lp-container lp-legal__layout">
            <div className="lp-legal__aside">
              <aside className="lp-legal__brief" aria-labelledby="lp-legal-brief">
                <h2 id="lp-legal-brief" className="lp-legal__aside-title">
                  {chrome.inShort}
                </h2>
                <ul className="lp-legal__brief-list" role="list">
                  {text.summary.map((line, i) => (
                    <li key={i}>
                      <Icon name="check" size={18} strokeWidth={2.2} className="lp-legal__brief-tick" />
                      <span>
                        <InlineRun parts={line} chrome={chrome} />
                      </span>
                    </li>
                  ))}
                </ul>
              </aside>
              {toc}
            </div>

            <article className="lp-legal__article" aria-labelledby="lp-legal-title">
              {kind === "contact" ? <ContactTiles store={store} chrome={chrome} lang={lang} only={only} /> : null}
              {text.sections.map((s, i) => (
                <section key={s.id} id={sectionId(s.id)} className="lp-legal__sec" aria-labelledby={`${sectionId(s.id)}-h`}>
                  <h2 id={`${sectionId(s.id)}-h`} className="lp-legal__h">
                    <span className="lp-legal__n" aria-hidden="true">
                      {pad2(i + 1)}
                    </span>
                    <span>{s.title}</span>
                  </h2>
                  {s.blocks.map((blk, j) => (
                    <BlockView key={j} block={blk} chrome={chrome} />
                  ))}
                </section>
              ))}
              {kind !== "contact" ? <Questions store={store} chrome={chrome} links={links} only={only} /> : null}
            </article>
          </div>
        </div>
      </main>

      <Footer ctx={ctx} store={store} chrome={chrome} year={updatedAt.slice(0, 4)} />
    </>
  );
}
