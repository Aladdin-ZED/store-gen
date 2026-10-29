import type { ReactElement } from "react";
import { round2 } from "@/lib/page/pricing";
import type { RenderContext } from "../types";
import { lookOf } from "./RichText";
import { cx } from "./util";

export interface PriceProps {
  ctx: RenderContext;
  amount: number;
  /** genuine reference price — struck through only when it is really higher */
  compareAt?: number;
  size?: "s" | "m" | "l" | "xl";
  /** savings chip, formatted per offers.showSavings (amount / percent / both / none) */
  showSavings?: boolean;
  /**
   * Follow the currently selected bundle (runtime updates `data-lp-price="current"`).
   * A live price never shows a static reference/savings (they would go stale on bundle change).
   */
  live?: boolean;
  /** "From 249 DH" */
  from?: boolean;
  /** draw the diagonal strike across the reference on scroll (default true; false in tiny UI such as a sticky bar) */
  animate?: boolean;
  className?: string;
}

/** Savings between a reference and a price; null when there is no real saving. */
export function savingsOf(amount: number, compareAt: number | undefined): { amount: number; pct: number } | null {
  if (compareAt === undefined || !Number.isFinite(compareAt) || compareAt - amount <= 0.009) return null;
  const s = round2(compareAt - amount);
  return { amount: s, pct: Math.min(99, Math.max(1, Math.round((s / compareAt) * 100))) };
}

/** Savings label per the page's offers.showSavings setting ("−30%", "Économisez 120 DH"…). */
export function savingsLabel(ctx: RenderContext, saving: { amount: number; pct: number }): { pct?: string; amount?: string } {
  const mode = ctx.offers.showSavings;
  if (mode === "none") return {};
  const pct = ctx.t("bundle.savePct", { pct: saving.pct });
  const amt = ctx.t("bundle.save", { amount: ctx.money(saving.amount) });
  if (mode === "percent") return { pct };
  if (mode === "amount") return { amount: amt };
  return { pct, amount: amt };
}

/** A formatted amount split into typographic parts: currency before/after, integer, fraction. */
export interface MoneyParts {
  pre: string;
  int: string;
  /** decimal separator + cents (",90"), "" for whole amounts */
  frac: string;
  post: string;
}

const AMOUNT = /\d[\d\s  .,'’]*\d|\d/;

/**
 * Split ctx.money() output ("249 DH", "1 299 درهم", "24,90 €", "$10.00") without re-formatting it:
 * the parts concatenate back to the exact string, so copied and spoken text never change.
 */
export function moneyParts(formatted: string): MoneyParts {
  const m = AMOUNT.exec(formatted);
  if (!m) return { pre: "", int: formatted, frac: "", post: "" };
  const num = m[0];
  const cents = /[.,]\d{1,2}$/.exec(num);
  // a trailing ".000"-style group is a thousands group, not cents
  const frac = cents && !/[.,]\d{3}$/.test(num) ? cents[0] : "";
  return {
    pre: formatted.slice(0, m.index),
    int: frac ? num.slice(0, -frac.length) : num,
    frac,
    post: formatted.slice(m.index + num.length),
  };
}

/**
 * Typographic money: big tabular numerals, small currency, raised cents — inside one <bdi> so the amount
 * keeps its written order in Arabic text. The numerals (integer + cents) sit in their own LTR box:
 * the flex row follows the text direction ("149 درهم" reads number-first in Arabic) but "24,90"
 * must never become "90,24". Text content equals ctx.money(amount) exactly.
 */
export function Money({ ctx, amount, className }: { ctx: RenderContext; amount: number; className?: string }): ReactElement {
  const p = moneyParts(ctx.money(amount));
  // the space between figure and currency gets its own small box: in a label (often monospace) face
  // or at display size a full-width space would open a gap as wide as a digit
  const pre = /^(.*?)(\s*)$/.exec(p.pre)!;
  const post = /^(\s*)(.*)$/.exec(p.post)!;
  return (
    <bdi className={cx("lp-money", className)}>
      {pre[1] ? <span className="lp-money__cur lp-money__cur--pre">{pre[1]}</span> : null}
      {pre[2] ? <span className="lp-money__gap">{pre[2]}</span> : null}
      <span className="lp-money__num">
        <span className="lp-money__int">{p.int}</span>
        {p.frac ? <span className="lp-money__frac">{p.frac}</span> : null}
      </span>
      {post[1] ? <span className="lp-money__gap">{post[1]}</span> : null}
      {post[2] ? <span className="lp-money__cur">{post[2]}</span> : null}
    </bdi>
  );
}

export function Price({
  ctx,
  amount,
  compareAt,
  size = "m",
  showSavings = false,
  live = false,
  from = false,
  animate = true,
  className,
}: PriceProps): ReactElement {
  const saving = live ? null : savingsOf(amount, compareAt);
  const labels = saving && showSavings ? savingsLabel(ctx, saving) : {};
  if (lookOf(ctx)) return <LookPrice ctx={ctx} amount={amount} compareAt={compareAt} size={size} live={live} from={from} animate={animate} className={className} saving={saving} labels={labels} />;
  // The " " text nodes between parts are dropped by the flex layout but keep copied text and the
  // spoken/accessible text readable ("À partir de 249 DH Au lieu de 299 DH"), not glued together.
  return (
    <span className={cx("lp-price", `lp-price--${size}`, className)}>
      {from ? (
        <>
          <span className="lp-price__from">{ctx.t("price.from")}</span>{" "}
        </>
      ) : null}
      {live ? (
        // runtime rewrites this text on bundle change: keep it a single text node
        <bdi className="lp-price__now" data-lp-price="current">
          {ctx.money(amount)}
        </bdi>
      ) : (
        <span className="lp-price__now">
          <Money ctx={ctx} amount={amount} />
        </span>
      )}
      {saving ? (
        <>
          {" "}
          {/* the strike is a crisp diagonal hairline (base.css ::after), drawn on with data-reveal="draw" */}
          <s className="lp-price__was" data-reveal={animate ? "draw" : undefined}>
            <span className="lp-visually-hidden">{ctx.t("price.was")} </span>
            <bdi>{ctx.money(compareAt!)}</bdi>
          </s>
        </>
      ) : null}
      {labels.pct ? (
        <>
          {" "}
          <span className="lp-price__save">
            <bdi dir="ltr">{labels.pct}</bdi>
          </span>
        </>
      ) : null}
      {labels.amount ? (
        <>
          {" "}
          <span className="lp-price__save-amt">{labels.amount}</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * The price cluster under a look (design.md DES-§4.5.4 Price, DES-§10.5 Numerals; T1, RTL4): the price, the struck
 * reference and the discount chip as one inline-flex unit that never splits across a line (.lp-price__cluster, logical
 * gaps, tabular lining figures through data-num); the "save N DH" line and the "from" label sit beside it, outside the
 * unit. A document without a look keeps the markup of Price above.
 */
function LookPrice({
  ctx,
  amount,
  compareAt,
  size,
  live,
  from,
  animate,
  className,
  saving,
  labels,
}: Required<Pick<PriceProps, "size" | "live" | "from" | "animate">> &
  Pick<PriceProps, "ctx" | "amount" | "compareAt" | "className"> & { saving: { amount: number; pct: number } | null; labels: { pct?: string; amount?: string } }): ReactElement {
  return (
    <span className={cx("lp-price", `lp-price--${size}`, className)}>
      {from ? (
        <>
          <span className="lp-price__from">{ctx.t("price.from")}</span>{" "}
        </>
      ) : null}
      <span className="lp-price__cluster" data-num="">
        {live ? (
          <bdi className="lp-price__now" data-lp-price="current">
            {ctx.money(amount)}
          </bdi>
        ) : (
          <span className="lp-price__now">
            <Money ctx={ctx} amount={amount} />
          </span>
        )}
        {saving ? (
          <>
            {" "}
            <s className="lp-price__was" data-reveal={animate ? "draw" : undefined}>
              <span className="lp-visually-hidden">{ctx.t("price.was")} </span>
              <bdi>{ctx.money(compareAt!)}</bdi>
            </s>
          </>
        ) : null}
        {labels.pct ? (
          <>
            {" "}
            <span className="lp-price__save">
              <bdi dir="ltr">{labels.pct}</bdi>
            </span>
          </>
        ) : null}
      </span>
      {labels.amount ? (
        <>
          {" "}
          <span className="lp-price__save-amt">{labels.amount}</span>
        </>
      ) : null}
    </span>
  );
}
