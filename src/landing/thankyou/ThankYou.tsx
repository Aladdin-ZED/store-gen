/**
 * Thank-you page body — the confirmation moment, in the page's own theme (v2 · modern):
 *
 *   top bar (wordmark · COD chip)
 *   hero: a color-block panel under one flat tint (`.lp-ty__tint`: one accent radial at 10 %, no mesh, no
 *         grain); an animated check drawing inside a ring (two soft pulses, then still), the order number
 *         on an opaque chip (the "Confirm on WhatsApp" pill beside it when the add-on is on), a big display
 *         title with the shopper's name, the call-back message
 *   cards that float over the hero's lower edge: the order summary (a <dl>; "Track my order" in its
 *         footer when the add-on is on) + a "what happens next" timeline of verbs, never numbers, from the
 *         store's answers (landing.md LAN-§6.3: the call step only with `checkout.confirmationCall`, "check,
 *         then pay" only when `policies.inspection` is allowed; the call step holds the expectation)
 *   optional one-click upsell card (product on a lit stage, price, countdown tiles, CTA)
 *   WhatsApp help · back to the product · legal links
 *
 * Runtime hooks (src/landing/runtime/thankyou.ts): [data-ty="name|orderId|total|items|options"] are
 * filled from sessionStorage (options: the chosen colors / sizes, drawn like the form's summary); <html data-ty-state="filled|partial|empty"> drives what is shown;
 * [data-ty-upsell] (+ accept/decline/status, [data-countdown]) is the upsell block.
 * Without JS the page still reads correctly (name & order rows stay hidden, upsell stays hidden).
 * Pure markup; every animation is CSS (collapsed by prefers-reduced-motion and data-motion="off").
 *
 * The add-on blocks (landing.md LAN-§8.1, `assist-ty`): [data-lp-ty="confirm|expect|expect-save|track"] are rendered
 * only when the document's `lp-assist-ty` block carries them (`ctx.addons`, CCR r1-p3-10), so with every block off the
 * page differs from before only by its tint, its verb timeline and the "Report this store" link of the legal row
 * (LAN-§3.6, §3.9). Design budgets (LAN-§3.6): 0 glass, at most 8 reveals, one primary action (the upsell's "add"),
 * order id, total and phone in LTR isolates with tabular figures.
 */
import type { ReactElement, ReactNode } from "react";
import { TY, shopperLocaleOf } from "@/lib/landing/copy";
import { addonBlock, shopperOf } from "../addons/facts";
import type { AssistTyData } from "../addons/plan";
import { legalChrome, legalLang, legalNav } from "../legal";
import { brandName, cx, Icon, pad2, Picture, Price, RichText, SkipLink, type IconName } from "../primitives";
import type { RenderContext } from "../types";
import { offerLabel, whatsappNumber } from "@/lib/render/config";
import { offerWord } from "../sections/orderForm/copy";
import { offerCustomImage } from "@/lib/page/catalog";
import { defaultBundleId, emptySelection, fromCents, orderTotals } from "@/lib/page/pricing";
import type { PageDoc, SectionBg } from "@/lib/page/schema";
import { getArchetype } from "@/lib/theme";

export interface ThankYouProps {
  doc: PageDoc;
  ctx: RenderContext;
  /** product page URL ("back" link) */
  landingUrl: string;
}

/** One step of the "what happens next" timeline: a verb phrase and its line (LAN-§6.3, §3.6). */
interface StepCopy {
  label: string;
  hint: string;
}

/** Copy specific to this page that the shared microcopy (i18n.ts) does not carry. */
interface TyCopy {
  next: string;
  yourOrder: string;
  /** the offer row's label: a noun (the form's "Choisissez votre offre" reads as an instruction here) */
  offer: string;
  options: string;
  /** the timeline: received, the confirmation call, shipping, paying (after a check when inspection is allowed) */
  steps: { placed: StepCopy; call: StepCopy; ship: StepCopy; payCheck: StepCopy; pay: StepCopy };
}

const COPY: Record<"ar" | "fr" | "en", TyCopy> = {
  fr: {
    next: "Et maintenant ?",
    yourOrder: "Votre commande",
    offer: "Votre offre",
    options: "Vos choix",
    steps: {
      placed: { label: "Nous avons reçu votre commande", hint: "Elle est bien enregistrée." },
      call: { label: "Nous vous appelons", hint: "Nous vous appelons pour confirmer l'adresse." },
      ship: { label: "Nous expédions le colis", hint: "Votre colis part avec le livreur." },
      payCheck: { label: "Vous vérifiez, puis vous payez", hint: "Ouvrez le colis, vérifiez, puis payez en espèces." },
      pay: { label: "Vous payez à la livraison", hint: "En espèces, à la remise du colis." },
    },
  },
  ar: {
    next: "شنو غادي يوقع دابا؟",
    yourOrder: "الطلب ديالك",
    offer: "العرض ديالك",
    options: "اختياراتك",
    steps: {
      placed: { label: "توصلنا بالطلب ديالك", hint: "الطلب تسجل عندنا." },
      call: { label: "غادي نعيطو ليك", hint: "كنعيطو ليك باش نأكدو العنوان." },
      ship: { label: "كنصيفطو الكولي", hint: "الكولي كيخرج مع شركة التوصيل." },
      payCheck: { label: "كتشوف السلعة، من بعد كتخلص", hint: "حل الكولي، شوف السلعة، من بعد خلص كاش." },
      pay: { label: "كتخلص ملي توصلك", hint: "كاش، ملي يوصلك الكولي." },
    },
  },
  en: {
    next: "What happens next",
    yourOrder: "Your order",
    offer: "Your offer",
    options: "Your choices",
    steps: {
      placed: { label: "We have your order", hint: "It's registered." },
      call: { label: "We call you", hint: "We call you to confirm the address." },
      ship: { label: "We ship your parcel", hint: "Your parcel leaves with the courier." },
      payCheck: { label: "You check, then pay", hint: "Open the parcel, check it, then pay in cash." },
      pay: { label: "You pay on delivery", hint: "In cash, when the parcel is handed over." },
    },
  },
};

const copyFor = (locale: string): TyCopy => COPY[locale as keyof typeof COPY] ?? COPY.en;

const NAME_SLOT = /^(.*?)(\s*)\{name\}([,،]?)([\s\S]*)$/;

/** Split "Merci {name}, c'est noté !" → before / (space + name + comma) / after, so the name group can hide. */
function splitTitle(template: string): { before: string; gap: string; comma: string; after: string } | null {
  const m = NAME_SLOT.exec(template);
  if (!m) return null;
  return { before: m[1] ?? "", gap: m[2] ?? "", comma: m[3] ?? "", after: m[4] ?? "" };
}

/** The timeline's answers: the store's facts when the render passes them, else a call (the setting's default) and no inspection promise. */
function timelineFacts(ctx: RenderContext): { call: boolean; inspect: boolean } {
  const f = shopperOf(ctx);
  return { call: f ? f.confirmationCall : true, inspect: f?.inspection === "allowed" };
}

/** Hero color block: the archetype's first characteristic color moment. */
function heroBg(doc: PageDoc): SectionBg {
  return getArchetype(doc.theme.archetype).colorMoments.find((b) => b !== "base") ?? "accent";
}

/** Check drawing inside a glowing ring (sizes in the 96 × 96 viewBox; dash lengths = path lengths). */
function SuccessMark(): ReactElement {
  return (
    <div className="lp-ty__mark" aria-hidden="true">
      <span className="lp-ty__mark-glow" />
      <span className="lp-ty__mark-pulse" />
      <span className="lp-ty__mark-pulse lp-ty__mark-pulse--late" />
      <svg className="lp-ty__mark-svg" viewBox="0 0 96 96" focusable="false">
        <circle className="lp-ty__mark-track" cx="48" cy="48" r="45" />
        <circle className="lp-ty__mark-arc" cx="48" cy="48" r="45" transform="rotate(-90 48 48)" />
        <circle className="lp-ty__mark-disc" cx="48" cy="48" r="37" />
        <path className="lp-ty__mark-check" d="M32.5 49.5l10.5 10.5 21-22.5" />
      </svg>
    </div>
  );
}

type StepKey = "placed" | "call" | "ship" | "pay";

/** The steps of LAN-§6.3: received (done), the call when the store confirms by phone (now), shipping, paying. */
function stepsFor(call: boolean): { key: StepKey; icon: IconName; state: "done" | "now" | "next" }[] {
  return [
    { key: "placed", icon: "check", state: "done" },
    ...(call ? [{ key: "call" as const, icon: "phone" as const, state: "now" as const }] : []),
    { key: "ship", icon: "truck", state: call ? "next" : "now" },
    { key: "pay", icon: "cash-hand", state: "next" },
  ];
}

/**
 * The call step's line: the expectation (LAN-§8.1) when the `assist-ty` block carries it, the sentence without
 * `{when}` with the caller phone in an LTR isolate (the chunk adds `{when}` in the shopper's browser), and the
 * "save this number" line; else the step's own words.
 */
function CallHint({ ctx, copy }: { ctx: RenderContext; copy: StepCopy }): ReactElement {
  const e = addonBlock<AssistTyData>(ctx, "lp-assist-ty")?.expect;
  if (!e) return <span className="lp-ty__step-hint">{copy.hint}</span>;
  const [before, after] = e.s.plain.split("{phone}");
  return (
    <>
      <span className="lp-ty__step-hint" data-lp-ty="expect">
        {before}
        <bdi dir="ltr" className="lp-ty-phone">
          {e.phone}
        </bdi>
        {after}
      </span>
      <span className="lp-ty__step-hint" data-lp-ty="expect-save">
        {e.s.save}
      </span>
    </>
  );
}

function Timeline({ ctx, copy }: { ctx: RenderContext; copy: TyCopy }): ReactElement {
  const facts = timelineFacts(ctx);
  return (
    <section className="lp-ty__card lp-ty__next" aria-labelledby="lp-ty-next" data-reveal="rise" data-delay="160">
      <h2 id="lp-ty-next" className="lp-ty__card-title">
        {copy.next}
      </h2>
      <ol className="lp-ty__steps" role="list">
        {stepsFor(facts.call).map((s) => {
          const c = s.key === "pay" ? (facts.inspect ? copy.steps.payCheck : copy.steps.pay) : copy.steps[s.key];
          return (
            <li key={s.key} className="lp-ty__step" data-state={s.state} data-step={s.key} aria-current={s.state === "now" ? "step" : undefined}>
              <span className="lp-ty__step-node" aria-hidden="true">
                <Icon name={s.icon} size={18} strokeWidth={2} />
              </span>
              <span className="lp-ty__step-text">
                <span className="lp-ty__step-label">{c.label}</span>
                {s.key === "call" ? <CallHint ctx={ctx} copy={c} /> : <span className="lp-ty__step-hint">{c.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Summary({ doc, ctx, copy }: { doc: PageDoc; ctx: RenderContext; copy: TyCopy }): ReactElement {
  const { product, offers } = doc;
  const track = addonBlock<AssistTyData>(ctx, "lp-assist-ty")?.track;
  const id = defaultBundleId(offers, doc.items);
  const bundle = offers.bundles.find((b) => b.id === id) ?? offers.bundles[0]!;
  const cents = orderTotals(doc, emptySelection(bundle.id));
  const totals = cents ? { total: fromCents(cents.total) } : null;
  const image = ctx.asset(offerCustomImage(bundle) ?? product.cutout ?? product.images[0]);
  // the options row: something to say beyond the offer label (options, several items, gifts, a bump
  // item, page extras such as a gift wrap)
  const details =
    doc.items.some((it) => it.groups.length > 0) ||
    offers.extras.length > 0 ||
    doc.items.length > 1 ||
    offers.bundles.some((b) => !!b.gift || b.lines.some((l) => l.free)) ||
    !!(offers.orderBump?.enabled && offers.orderBump.item);
  return (
    <aside className="lp-ty__card lp-ty__summary" aria-labelledby="lp-ty-summary" data-reveal="rise" data-delay="80">
      <p className="lp-ty__card-kicker">{copy.yourOrder}</p>
      <div className="lp-ty__summary-head">
        <div className={cx("lp-ty__summary-media", image?.alpha && "lp-ty__summary-media--cutout")}>
          <Picture asset={image} sizes="6rem" ratio={1} fit={image?.alpha ? "contain" : "cover"} alt="" />
        </div>
        <h2 id="lp-ty-summary" className="lp-ty__summary-title">
          {product.name}
        </h2>
      </div>
      <dl className="lp-ty__rows">
        <div className="lp-ty__row" data-need-order="">
          <dt>{copy.offer}</dt>
          <dd data-ty="items">{offerLabel(ctx, bundle)}</dd>
        </div>
        {details ? (
          // filled by the runtime from the order just placed (item names, dots, fields in « », "Offert",
          // "Cadeau : …" — docs/OFFERS.md §G.8); hidden while empty (no JS, or no record)
          <div className="lp-ty__row lp-ty__row--opts" data-need-order="">
            <dt>{copy.options}</dt>
            <dd className="lp-vsum" data-ty="options" data-free={offerWord(ctx.locale, "free")} data-gift={offerWord(ctx.locale, "gift", {})} />
          </div>
        ) : null}
        <div className="lp-ty__row lp-ty__row--total" data-need-order="">
          <dt>{ctx.t("form.total")}</dt>
          <dd>
            <bdi dir="ltr" data-ty="total">
              {totals ? ctx.money(totals.total) : ctx.money(bundle.price)}
            </bdi>
          </dd>
        </div>
      </dl>
      <p className="lp-ty__pay">
        <Icon name="cash-hand" size={18} />
        <span>{ctx.t("trust.cod")}</span>
      </p>
      {track ? (
        // "Track my order" (LAN-§8.1): the chunk writes `?o=<id>` (and the proof) and shows it
        <a className="lp-ty__track" data-lp-ty="track" href={track.base} hidden>
          <Icon name="map-pin" size={18} />
          <span>{TY[shopperLocaleOf(ctx.locale)].track}</span>
        </a>
      ) : null}
    </aside>
  );
}

function UpsellCountdown({ ctx, minutes }: { ctx: RenderContext; minutes: number }): ReactElement {
  const end = new Date(Date.parse(ctx.now) + minutes * 60_000).toISOString();
  const withHours = minutes >= 60;
  const unit = (k: "h" | "m" | "s", v: number, label: string) => (
    <span className="lp-ty__cd-unit">
      <span className="lp-ty__cd-num" data-cd={k}>
        {pad2(v)}
      </span>
      <span className="lp-visually-hidden">{label}</span>
    </span>
  );
  const sep = (
    <span className="lp-ty__cd-sep" aria-hidden="true">
      :
    </span>
  );
  return (
    <p className="lp-ty__cd" data-countdown={end} role="timer" aria-label={ctx.t("thanks.upsellEnds")}>
      <span className="lp-ty__cd-label">
        <Icon name="clock" size={16} />
        {ctx.t("thanks.upsellEnds")}
      </span>
      {/* digits read left to right in every locale */}
      <span className="lp-ty__cd-digits" dir="ltr">
        {withHours ? (
          <>
            {unit("h", Math.floor(minutes / 60), ctx.t("urgency.hours"))}
            {sep}
          </>
        ) : null}
        {unit("m", withHours ? minutes % 60 : minutes, ctx.t("urgency.minutes"))}
        {sep}
        {unit("s", 0, ctx.t("urgency.seconds"))}
      </span>
    </p>
  );
}

function Upsell({ doc, ctx }: { doc: PageDoc; ctx: RenderContext }): ReactElement | null {
  const up = doc.offers.upsell;
  if (!up?.enabled) return null;
  const image = ctx.asset(up.image ?? doc.product.cutout ?? doc.product.images[0]);
  return (
    <section className="lp-ty__upsell" data-ty-upsell="" data-state="idle" data-bg="surface" aria-labelledby="lp-ty-upsell" hidden>
      <div className={cx("lp-ty__upsell-stage", image?.alpha && "lp-ty__upsell-stage--cutout")}>
        <Picture asset={image} sizes="(min-width: 48rem) 20rem, 80vw" ratio={1} fit={image?.alpha ? "contain" : "cover"} alt="" />
      </div>
      <div className="lp-ty__upsell-body">
        <p className="lp-ty__upsell-kicker">
          <Icon name="gift" size={16} />
          <span>{ctx.t("thanks.upsellKicker")}</span>
        </p>
        <h2 id="lp-ty-upsell" className="lp-ty__upsell-title">
          <RichText text={up.title} ctx={ctx} />
        </h2>
        {up.description ? <RichText text={up.description} ctx={ctx} as="p" className="lp-ty__upsell-text" decorate={false} /> : null}
        <Price ctx={ctx} amount={up.price} compareAt={up.compareAt} size="l" showSavings />
        <UpsellCountdown ctx={ctx} minutes={up.windowMinutes} />
        <div className="lp-ty__upsell-actions">
          <button type="button" className="lp-btn lp-btn--primary lp-btn--l" data-ty-upsell-accept="">
            <span className="lp-btn__icon lp-btn__icon--lead" aria-hidden="true">
              <Icon name="plus" size="1.1em" strokeWidth={2} />
            </span>
            <span className="lp-btn__label">{ctx.t("thanks.upsellAdd")}</span>
          </button>
          <button type="button" className="lp-ty__decline" data-ty-upsell-decline="">
            {ctx.t("thanks.upsellNo")}
          </button>
        </div>
        <p className="lp-ty__upsell-status" data-ty-upsell-status="" role="status" aria-live="polite" />
      </div>
    </section>
  );
}

function Help({ ctx, whatsapp, landingUrl, productName }: { ctx: RenderContext; whatsapp: string | null; landingUrl: string; productName: string }): ReactElement {
  return (
    <div className="lp-ty__help" data-reveal="fade">
      {whatsapp ? (
        <a
          className="lp-btn lp-btn--secondary lp-btn--m lp-ty__wa"
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(productName)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="lp-btn__icon lp-btn__icon--lead" aria-hidden="true">
            <Icon name="whatsapp" size="1.2em" strokeWidth={2} />
          </span>
          <span className="lp-btn__label">{ctx.t("trust.support")}</span>
        </a>
      ) : null}
      <a className="lp-ty__back" href={landingUrl}>
        <Icon name="arrow-right" size="1em" className="lp-ty__back-icon" />
        <span>{ctx.t("thanks.back")}</span>
      </a>
    </div>
  );
}

/**
 * Privacy · terms · shipping & returns · contact, in the delivery mode's URLs, then "Report this store" (LAN-§3.9:
 * `ctx.links.report` as given, set on live, test and preview documents, never in an export).
 */
function LegalLinks({ ctx }: { ctx: RenderContext }): ReactElement {
  const report = ctx.links.report;
  return (
    <nav className="lp-ty__legal" aria-label={legalChrome(legalLang(ctx.locale)).documents}>
      <ul className="lp-ty__legal-list" role="list">
        {legalNav(ctx).map((l) => (
          <li key={l.kind}>
            <a href={l.href}>{l.label}</a>
          </li>
        ))}
        {report ? (
          <li>
            <a href={report} rel="nofollow">
              {ctx.t("footer.report")}
            </a>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

/** "Confirm on WhatsApp" (LAN-§8.1): a compact pill beside the order number, filled and shown by `assist-ty`. */
function ConfirmPill({ ctx, wa }: { ctx: RenderContext; wa: string }): ReactElement {
  return (
    <a className="lp-ty__confirm" data-lp-ty="confirm" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" hidden>
      <Icon name="whatsapp" size={16} strokeWidth={2} />
      <span>{TY[shopperLocaleOf(ctx.locale)].confirm}</span>
    </a>
  );
}

export function ThankYouBody({ doc, ctx, landingUrl }: ThankYouProps): ReactElement {
  const whatsapp = whatsappNumber(doc, ctx.store.whatsapp);
  const copy = copyFor(ctx.locale);
  const template = doc.thankYou.title?.trim() || ctx.t("thanks.title");
  const parts = splitTitle(template);
  const message = doc.thankYou.message?.trim() || ctx.t("thanks.message");
  const logo = ctx.store.logo;
  const brand = brandName(ctx);
  const confirm = addonBlock<AssistTyData>(ctx, "lp-assist-ty")?.confirm;
  const order = (
    <p className="lp-ty__order">
      <span>{ctx.t("thanks.orderNo")}</span> <bdi dir="ltr" className="lp-ty__order-id" data-ty="orderId" />
    </p>
  );
  const title: ReactNode = parts ? (
    <>
      <RichText text={parts.before} ctx={ctx} />
      <span className="lp-ty__who">
        {parts.gap}
        <span className="lp-ty__name" data-ty="name" />
        {parts.comma}
      </span>
      {/^\s/.test(parts.after) ? " " : null}
      <RichText text={parts.after} ctx={ctx} />
    </>
  ) : (
    <RichText text={template} ctx={ctx} />
  );

  return (
    <>
      <SkipLink ctx={ctx} />
      <header className="lp-ty__bar" data-bg="base">
        <div className="lp-container lp-ty__bar-inner">
          {logo ? (
            <Picture asset={logo} sizes="9rem" fit="contain" alt={brand} className="lp-ty__logo" />
          ) : (
            <span className="lp-ty__brand">{brand}</span>
          )}
          <span className="lp-ty__cod">
            <Icon name="cash-hand" size={16} />
            <span>{ctx.t("trust.cod")}</span>
          </span>
        </div>
      </header>

      <main id="main" className="lp-ty" tabIndex={-1}>
        <section className="lp-section lp-ty__hero" data-bg={heroBg(doc)} data-space="normal" aria-labelledby="lp-ty-title">
          <span className="lp-ty__tint" aria-hidden="true" />
          <div className="lp-container lp-ty__hero-inner">
            <SuccessMark />
            {confirm ? (
              <div className="lp-ty__ids">
                {order}
                <ConfirmPill ctx={ctx} wa={confirm.wa} />
              </div>
            ) : (
              order
            )}
            <h1 id="lp-ty-title" className="lp-ty__title" data-reveal="blur-in" data-delay="120">
              {title}
            </h1>
            <RichText text={message} ctx={ctx} block as="div" className="lp-ty__lead" reveal="fade" delay={260} decorate={false} />
          </div>
        </section>

        <div className="lp-ty__content" data-bg="base">
          <div className={cx("lp-container lp-ty__grid", !doc.thankYou.showTimeline && "lp-ty__grid--single")}>
            <Summary doc={doc} ctx={ctx} copy={copy} />
            {doc.thankYou.showTimeline ? <Timeline ctx={ctx} copy={copy} /> : null}
          </div>
          <div className="lp-container lp-ty__after">
            <Upsell doc={doc} ctx={ctx} />
            <Help ctx={ctx} whatsapp={whatsapp} landingUrl={landingUrl} productName={doc.product.name} />
            <LegalLinks ctx={ctx} />
          </div>
        </div>
      </main>
    </>
  );
}
