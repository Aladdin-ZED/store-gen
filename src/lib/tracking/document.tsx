/**
 * The `/track` document (P3 LANDING; landing.md LAN-§9.4, §3.6, §3.9, LD38): server-rendered static HTML, one column
 * ≤ 560 px, the order's theme tokens around the page's own stylesheet (src/landing/addons/css/track.css), the `track`
 * chunk at the end of the body. Transactional register: 0 glass, 0 aurora, no reveal, verbs instead of numbers, ids
 * and numbers in LTR isolates with tabular figures, RTL complete.
 *
 * States: lookup (with the id filled from `?o=`, the not-found notice after a refused signed link, the noscript
 * line), view (timeline, delivery line, carrier, requests, WhatsApp, help, rights). The request sheet is one
 * <dialog> the chunk opens; the request buttons and the lookup form stay `hidden` until the chunk runs, so a page
 * without script shows only what works without it (the status of a signed link, the WhatsApp link).
 */
import type { ReactElement, ReactNode } from "react";
import { fill, TRK, type ShopperLocale, type TrkCopy } from "@/lib/landing/copy";
import { TRACK_REQUEST_BUTTONS, type TrackData, type TrackRequestKind, type TrackView } from "./contract";
import { trackDay, trackMoment } from "./format";

export interface TrackLegalLink {
  kind: string;
  label: string;
  href: string;
}

export type TrackState =
  | { kind: "lookup"; o: string | null; notice: "not_found" | null; whatsapp: string | null }
  | { kind: "view"; view: TrackView; closed: boolean };

export interface TrackDocumentProps {
  locale: ShopperLocale;
  dir: "rtl" | "ltr";
  storeName: string;
  homeHref: string;
  logo: { src: string; alt: string } | null;
  icon: { href: string; type: string } | null;
  themeColor: string | null;
  colorScheme: string;
  css: string;
  preloads: { href: string; type: string }[];
  state: TrackState;
  data: TrackData;
  /** the `track` chunk (absent: the asset build has not emitted it; the page still shows a signed link's status) */
  script: string | null;
  tz: string;
  legal: TrackLegalLink[];
  report: { href: string; label: string } | null;
  /** "<base>/track": the lookup's own address ("Track another order") */
  trackPath: string;
}

/** `</script` inside the inline JSON would end the element; `<!--` would open a comment. */
const inlineJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const waHref = (digits: string, text: string | null) => `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

function Ltr({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}

function Header({ storeName, homeHref, logo }: Pick<TrackDocumentProps, "storeName" | "homeHref" | "logo">): ReactElement {
  return (
    <header className="trk-head">
      <a className="trk-brand" href={homeHref}>
        {/* static HTML, not a Next.js page: next/image does not apply */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img className="trk-logo" src={logo.src} alt={logo.alt || storeName} decoding="async" /> : <span className="trk-brand__name">{storeName}</span>}
      </a>
    </header>
  );
}

function OrderCard({ view, c, locale, tz }: { view: TrackView; c: TrkCopy; locale: ShopperLocale; tz: string }): ReactElement {
  return (
    <section className="trk-card trk-order" aria-label={c.orderNo}>
      <div className="trk-order__top">
        <span className="trk-chip">
          <span className="trk-chip__label">{c.orderNo}</span>
          <Ltr className="trk-num">{view.orderId}</Ltr>
        </span>
        <time className="trk-order__date" dateTime={view.placedAt}>
          {fill(c.placedOn, { date: trackDay(view.placedAt, locale, tz) })}
        </time>
      </div>
      <p className="trk-order__offer">{view.summary.offer}</p>
      {view.summary.units ? <p className="trk-order__units">{view.summary.units}</p> : null}
      <dl className="trk-order__facts">
        <div>
          <dt>{c.total}</dt>
          <dd>
            <Ltr className="trk-num">{view.summary.total}</Ltr>
          </dd>
        </div>
        <div>
          <dt>{c.phone}</dt>
          <dd>
            <Ltr className="trk-num">{view.maskedPhone}</Ltr>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Timeline({ view, c, locale, tz }: { view: TrackView; c: TrkCopy; locale: ShopperLocale; tz: string }): ReactElement {
  const currentIndex = view.steps.findIndex((s) => s.id === view.current);
  return (
    <section className="trk-card trk-steps" aria-labelledby="trk-steps-title">
      <h2 id="trk-steps-title" className="trk-label">
        {c.timeline}
      </h2>
      <ol className="trk-steps__list" role="list">
        {view.steps.map((step, i) => {
          const state = i === currentIndex ? "current" : step.done ? "done" : "todo";
          const carrier = step.id === "shipped" && step.done && view.carrier;
          return (
            <li key={step.id} className="trk-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="trk-step__rail" aria-hidden="true" />
              <span className="trk-step__mark" aria-hidden="true" />
              <div className="trk-step__body">
                <p className="trk-step__verb">{c.step[step.id]}</p>
                {step.at && step.done ? (
                  <time className="trk-step__at" dateTime={step.at}>
                    {trackMoment(step.at, locale, tz)}
                  </time>
                ) : null}
                {carrier ? (
                  <p className="trk-step__carrier">
                    {carrier.name ? fill(c.shippedWith, { carrier: carrier.name }) : null}
                    {carrier.name && carrier.ref ? " · " : null}
                    {carrier.ref ? (
                      <>
                        {`${c.carrierRef.replace("{ref}", "").trim()} `}
                        <Ltr className="trk-num">{carrier.ref}</Ltr>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const REQUEST_LABEL: Record<(typeof TRACK_REQUEST_BUTTONS)[number], keyof TrkCopy> = { change_address: "changeAddress", cancel: "cancel", other: "other" };
const CAN_KEY: Record<(typeof TRACK_REQUEST_BUTTONS)[number], keyof TrackView["canRequest"]> = { change_address: "changeAddress", cancel: "cancel", other: "other" };

function Requests({ view, c }: { view: TrackView; c: TrkCopy }): ReactElement | null {
  const shown = TRACK_REQUEST_BUTTONS.filter((k) => view.canRequest[CAN_KEY[k]] || view.pending.includes(k as TrackRequestKind));
  if (!shown.length) return null;
  return (
    <section className="trk-requests" aria-labelledby="trk-req-title" data-trk-requests hidden>
      <h2 id="trk-req-title" className="trk-label">
        {c.needChange}
      </h2>
      <ul className="trk-list" role="list">
        {shown.map((kind) => {
          const pending = view.pending.includes(kind);
          return (
            <li key={kind}>
              <button type="button" className="trk-row" data-trk-kind={kind} disabled={pending} aria-haspopup="dialog">
                <span className="trk-row__text">{c[REQUEST_LABEL[kind]] as string}</span>
                {pending ? <span className="trk-row__state">{c.requested}</span> : <span className="trk-row__chev" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sheet({ c }: { c: TrkCopy }): ReactElement {
  return (
    <dialog className="trk-sheet" id="trk-sheet" aria-labelledby="trk-sheet-title">
      <form className="trk-sheet__form" method="dialog" data-trk-sheet>
        <h2 id="trk-sheet-title" className="trk-sheet__title" data-trk-sheet-title>
          {c.other}
        </h2>
        <p className="trk-sheet__note">{c.sheetNote}</p>
        <label className="trk-field">
          <span className="trk-field__label">{c.sheetText}</span>
          <textarea className="trk-input trk-input--area" name="text" maxLength={300} rows={3} />
        </label>
        <p className="trk-status" role="status" aria-live="polite" data-trk-status />
        <div className="trk-sheet__actions">
          <button type="submit" className="trk-btn trk-btn--primary" value="send" data-trk-send>
            {c.send}
          </button>
          <button type="button" className="trk-btn trk-btn--text" data-trk-close>
            {c.close}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Help({ c, help, orderId }: { c: TrkCopy; help: TrackView["help"]; orderId: string | null }): ReactElement | null {
  if (!help.whatsapp && !help.phone) return null;
  return (
    <section className="trk-help">
      {help.whatsapp ? (
        <a className="trk-btn trk-btn--primary trk-btn--block" href={waHref(help.whatsapp, orderId ? fill(c.waText, { order_id: orderId }) : null)} target="_blank" rel="noopener">
          {c.whatsapp}
        </a>
      ) : null}
      {help.phone ? (
        <p className="trk-help__line">
          <a className="trk-link" href={telHref(help.phone)}>
            {c.call}
          </a>{" "}
          <Ltr className="trk-num trk-help__phone">{help.phone}</Ltr>
        </p>
      ) : null}
      {help.hours ? <p className="trk-help__hours">{fill(c.hours, { hours: help.hours })}</p> : null}
    </section>
  );
}

function Footer({ c, rights, report, legal, trackPath, another }: { c: TrkCopy; rights: string | null; report: TrackDocumentProps["report"]; legal: TrackLegalLink[]; trackPath: string; another: boolean }): ReactElement {
  return (
    <footer className="trk-foot">
      {rights ? <p className="trk-foot__rights">{rights}</p> : null}
      {report ? (
        <p className="trk-foot__report">
          <a href={report.href} rel="nofollow">
            {report.label}
          </a>
        </p>
      ) : null}
      {legal.length ? (
        <nav aria-label={c.storeLinks}>
          <ul className="trk-foot__legal" role="list">
            {legal.map((l) => (
              <li key={l.kind}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {another ? (
        <p className="trk-foot__another">
          <a className="trk-link" href={trackPath}>
            {c.another}
          </a>
        </p>
      ) : null}
    </footer>
  );
}

function ViewBody({ view, closed, c, locale, tz }: { view: TrackView; closed: boolean; c: TrkCopy; locale: ShopperLocale; tz: string }): ReactElement {
  return (
    <>
      <div className="trk-hero">
        <p className="trk-eyebrow">{view.firstName ? fill(c.hello, { name: view.firstName }) : c.title}</p>
        <h1 className="trk-title">{c.step[view.current]}</h1>
        {view.eta ? <p className="trk-eta">{view.eta.text}</p> : null}
        {view.eta?.confirmedOn ? <p className="trk-eta__why">{fill(c.confirmedOn, { date: view.eta.confirmedOn })}</p> : null}
      </div>
      <Timeline view={view} c={c} locale={locale} tz={tz} />
      <OrderCard view={view} c={c} locale={locale} tz={tz} />
      {closed ? <p className="trk-note">{c.closed}</p> : <Requests view={view} c={c} />}
      <p className="trk-status trk-status--page" role="status" aria-live="polite" data-trk-page-status />
      <Help c={c} help={view.help} orderId={view.orderId} />
      <Sheet c={c} />
    </>
  );
}

function LookupBody({ state, c }: { state: Extract<TrackState, { kind: "lookup" }>; c: TrkCopy }): ReactElement {
  return (
    <>
      <div className="trk-hero">
        <h1 className="trk-title">{c.title}</h1>
        <p className="trk-lead">{c.lead}</p>
      </div>
      {state.notice === "not_found" ? (
        <p className="trk-alert" role="alert">
          {c.notFound}
        </p>
      ) : null}
      <form className="trk-card trk-lookup" data-trk-lookup hidden noValidate>
        <label className="trk-field">
          <span className="trk-field__label">{c.orderNo}</span>
          <input
            className="trk-input trk-num"
            name="o"
            dir="ltr"
            defaultValue={state.o ?? ""}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            required
            placeholder="CMD-7K3Q9X"
          />
        </label>
        <label className="trk-field">
          <span className="trk-field__label">{c.last4}</span>
          <input className="trk-input trk-num trk-input--pin" name="last4" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}" required />
        </label>
        <p className="trk-status" role="status" aria-live="polite" data-trk-status />
        <button type="submit" className="trk-btn trk-btn--primary trk-btn--block">
          {c.find}
        </button>
      </form>
      <noscript>
        <p className="trk-note">{c.noscript}</p>
      </noscript>
      {state.whatsapp ? (
        <section className="trk-help">
          <a className="trk-btn trk-btn--soft trk-btn--block" href={waHref(state.whatsapp, state.o ? fill(c.waText, { order_id: state.o }) : null)} target="_blank" rel="noopener">
            {c.whatsapp}
          </a>
        </section>
      ) : null}
    </>
  );
}

export function TrackDocument(props: TrackDocumentProps): ReactElement {
  const { locale, dir, state, css, data, script } = props;
  const c = TRK[locale];
  const view = state.kind === "view" ? state.view : null;
  return (
    <html lang={locale} dir={dir} className="trk-doc">
      {/* a standalone document rendered to static HTML — not a Next.js page, so next/head does not apply */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{`${c.title} · ${props.storeName}`}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
        {props.themeColor ? <meta name="theme-color" content={props.themeColor} /> : null}
        <meta name="color-scheme" content={props.colorScheme} />
        <meta name="format-detection" content="telephone=no" />
        {props.icon ? <link rel="icon" href={props.icon.href} type={props.icon.type} /> : null}
        {props.preloads.map((p) => (
          <link key={p.href} rel="preload" as="font" type={p.type} href={p.href} crossOrigin="anonymous" />
        ))}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script type="application/json" id="lp-track" dangerouslySetInnerHTML={{ __html: inlineJson(data) }} />
      </head>
      <body className="trk-body">
        <div className="trk">
          <Header storeName={props.storeName} homeHref={props.homeHref} logo={props.logo} />
          <main id="main" className="trk-main">
            {view && state.kind === "view" ? <ViewBody view={view} closed={state.closed} c={c} locale={locale} tz={props.tz} /> : null}
            {state.kind === "lookup" ? <LookupBody state={state} c={c} /> : null}
          </main>
          <Footer c={c} rights={view?.rightsLine ?? null} report={props.report} legal={props.legal} trackPath={props.trackPath} another={!!view} />
        </div>
        {script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}
      </body>
    </html>
  );
}
