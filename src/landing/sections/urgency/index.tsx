/**
 * Urgency — only ever real numbers (DESIGN.md §1.1: no fake countdowns, no invented stock).
 * Data comes from Offers: `urgency.countdownEnd` (admin end date, never resets) and
 * `urgency.stockLeft` (typed by the admin). The variant picks what leads:
 *  - countdown — copy | the live timer, whose face follows the archetype:
 *                · glass / soft (souk, apothecary, field, bloom, hearth…): a "drop card" — the product
 *                  photo with frosted glass tiles (digits + unit inside) floating over it, a live chip
 *                  on top; without a photo, the same tiles over a drifting product-hued light;
 *                · hairline (maison, editorial): open numerals between hairlines, no box at all;
 *                · instrument (kinetic, circuit, garage): one smoked slab cut into cells by hairlines,
 *                  mono unit labels, the running seconds in the accent;
 *                · clay (playground): color blocks set down slightly askew;
 *                and the real last day underneath, with a calendar tile;
 *  - stock     — the real count as one giant number + a tray of dots, one per real piece (the
 *                partial row on top: pieces leave from the top, the next one breathes), or a
 *                segmented level meter with the exact fill when the batch size is known;
 *  - banner    — a slim "live activity" band: product thumb, headline, a capsule with the live
 *                value, a small CTA.
 * A variant whose data is missing falls back to the other real signal, then to an honest
 * delivery route (order today → confirmation call → at your door, paid on arrival), or to nothing.
 * When the countdown ends in the visitor's browser the section hides itself (CSS on the runtime's
 * data-expired), so an expired timer is never left on screen.
 * Mobile order: headline → the live visual → the CTA (the reason comes before the ask).
 */
import type { ReactElement } from "react";
import { z } from "zod";
import type { Archetype, SectionBg } from "@/lib/page/schema";
import { DotGrid, ZelligeLines } from "../../illustrations";
import {
  Countdown,
  Cta,
  Icon,
  Kicker,
  Picture,
  RichText,
  SectionShell,
  TITLE_REVEAL,
  clamp,
  cssVars,
  cx,
  isoToMs,
  plainText,
  type IconName,
} from "../../primitives";
import { defineSection, type RenderContext, type ResolvedAsset } from "../../types";
import { photoPlan } from "../orderForm/fit";
import { PlannedPhoto } from "../orderForm/photo";
import { dotLegend, endParts, ofTemplate, routeStops, stockLabel, stockUnit, untilTemplate, urgencyCopy, type RouteStop } from "./copy";
import { withRevealScope } from "../reveal-scope";

const VARIANT_IDS = ["countdown", "stock", "banner"] as const;
type Variant = (typeof VARIANT_IDS)[number];
type Mode = "countdown" | "stock" | "promise";

/** Up to this count every piece gets its own dot; above it the number speaks alone (or the gauge). */
const DOTS_MAX = 100;
/** Dots per row of the stock tray. */
const DOTS_ROW = 10;

/**
 * The clock's face per archetype (a class on the root, so the CSS needs no archetype lists):
 * hairline numerals (maison, editorial), a smoked instrument display (kinetic, circuit, garage),
 * clay color blocks (playground), pillowy glass (bloom, hearth), frosted glass elsewhere.
 */
type Face = "glass" | "hairline" | "instrument" | "clay" | "soft";
const FACES: Partial<Record<Archetype, Face>> = {
  maison: "hairline",
  editorial: "hairline",
  kinetic: "instrument",
  circuit: "instrument",
  garage: "instrument",
  playground: "clay",
  bloom: "soft",
  hearth: "soft",
};
const faceOf = (ctx: RenderContext): Face => FACES[ctx.archetype] ?? "glass";

const RouteItem = z.object({
  when: z.string().max(30).default(""),
  what: z.string().max(90).default(""),
});

const schema = z.object({
  kicker: z.string().max(60).default(""),
  /** headline while a real countdown runs */
  countdownTitle: z.string().max(140).default(""),
  /** headline when the real stock leads */
  stockTitle: z.string().max(140).default(""),
  /** headline without countdown or stock (delivery promise) */
  promiseTitle: z.string().max(140).default(""),
  lead: z.string().max(220).default(""),
  /** show "Until Friday 9 October, 19:00" under the timer */
  showEndDate: z.boolean().default(true),
  /** small chip next to the stock number, e.g. "Next restock: November" */
  stockNote: z.string().max(60).default(""),
  /** size of the batch the stock comes from — draws a gauge instead of the dot matrix */
  batchSize: z.number().int().min(1).max(100_000).optional(),
  /** the delivery route shown without countdown or stock (empty = built-in route) */
  route: z.array(RouteItem).max(4).default([]),
  showCta: z.boolean().default(true),
  ctaLabel: z.string().max(40).default(""),
  /** without a countdown or stock: show the delivery promise, or hide the section */
  whenEmpty: z.enum(["promise", "hide"]).default("promise"),
});
type Data = z.infer<typeof schema>;

/** The admin's end date, only while it is still in the future (pure ISO math, no Date). */
function liveEnd(ctx: RenderContext): string | null {
  const end = ctx.offers.urgency?.countdownEnd;
  if (!end) return null;
  const endMs = isoToMs(end);
  const nowMs = isoToMs(ctx.now);
  return Number.isFinite(endMs) && Number.isFinite(nowMs) && endMs > nowMs ? end : null;
}

/** Real stock left; 0 means sold out, which is never used as an urgency argument. */
function liveStock(ctx: RenderContext): number | null {
  const n = ctx.offers.urgency?.stockLeft;
  return typeof n === "number" && n > 0 ? n : null;
}

function modeOf(v: Variant, end: string | null, stock: number | null, data: Data): Mode | null {
  const order: Mode[] = v === "stock" ? ["stock", "countdown"] : ["countdown", "stock"];
  for (const m of order) if ((m === "countdown" && end) || (m === "stock" && stock)) return m;
  return data.whenEmpty === "promise" ? "promise" : null;
}

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** A product photo for the drop card / the band thumb: the second shot when there is one (the hero shows the first). */
function productPhoto(ctx: RenderContext, preferSecond: boolean): ResolvedAsset | null {
  const imgs = ctx.product.images;
  const first = preferSecond && imgs.length > 1 ? ctx.asset(imgs[1]) : null;
  return first ?? ctx.asset(imgs[0]);
}

interface Common {
  id: string;
  bg: SectionBg;
  ctx: RenderContext;
  data: Data;
  mode: Mode;
  titleId: string;
  end: string | null;
  stock: number | null;
}

/* ------------------------------------------------------------------ */
/* Copy column                                                         */
/* ------------------------------------------------------------------ */

function titleOf({ ctx, data, mode, stock }: Common): { text: string; path: string } {
  if (mode === "countdown") return { text: data.countdownTitle.trim() || ctx.t("urgency.endsIn"), path: "countdownTitle" };
  if (mode === "stock") return { text: data.stockTitle.trim() || ctx.t("urgency.stockLeft", { n: stock ?? 0 }), path: "stockTitle" };
  return { text: data.promiseTitle.trim() || ctx.t("trust.delivery"), path: "promiseTitle" };
}

function Copy(c: Common) {
  const { ctx, data, titleId } = c;
  const title = titleOf(c);
  return (
    <div className="lp-urg__copy">
      <Kicker ctx={ctx} text={data.kicker} editPath="kicker" reveal="fade" />
      <RichText as="h2" id={titleId} className="lp-urg__title lp-h2" text={title.text} ctx={ctx} editPath={title.path} reveal={TITLE_REVEAL[ctx.archetype]} delay={60} split />
      {data.lead.trim() ? (
        <RichText as="p" className="lp-urg__lead" text={data.lead} ctx={ctx} editPath="lead" reveal="fade" delay={220} />
      ) : null}
    </div>
  );
}

/** Order CTA with the live price + the COD promise underneath. */
function Go({ ctx, data }: { ctx: RenderContext; data: Data }) {
  if (!data.showCta) return null;
  return (
    <div className="lp-urg__go" data-reveal="rise" data-delay="300">
      <Cta ctx={ctx} label={data.ctaLabel} editPath="ctaLabel" size="l" withPrice wide />
      <p className="lp-urg__cod">
        <Icon name="cash-hand" size="1.15em" />
        <span>{ctx.t("trust.cod")}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* countdown                                                           */
/* ------------------------------------------------------------------ */

/** Faint archetype texture inside a photo-less stage: zellige hairlines (souk) or a dot grid (circuit). */
function StageTexture({ ctx, id }: { ctx: RenderContext; id: string }) {
  if (ctx.ornament <= 0) return null;
  if (ctx.archetype === "souk") return <ZelligeLines uid={`${id}-zl`} tile={84} opacity={0.07} className="lp-urg__tex" />;
  if (ctx.archetype === "circuit") return <DotGrid cell={18} opacity={0.5} className="lp-urg__tex" />;
  return null;
}

/** Is the section already a dark block (a dark color block, or a neutral block of a dark page)? */
const darkish = (ctx: RenderContext, bg: SectionBg): boolean =>
  bg === "dark" || (ctx.doc.theme.palette.base === "dark" && (bg === "base" || bg === "soft" || bg === "surface"));

/** Smoked display for the instrument archetypes (adopts the dark block's palette). */
const stageBg = (ctx: RenderContext, bg: SectionBg): "dark" | undefined => (faceOf(ctx) === "instrument" && !darkish(ctx, bg) ? "dark" : undefined);

/**
 * The live label ("The offer ends in") — or null when the headline already says exactly that (a
 * merchant who cleared the title gets the kit line there, and it is never printed twice).
 */
function statusText(c: Common): string | null {
  const label = c.ctx.t("urgency.endsIn");
  return plainText(titleOf(c).text).trim() === label ? null : label;
}

function Stage(c: Common & { end: string }) {
  const { id, ctx, data, end, bg } = c;
  const face = faceOf(ctx);
  const photo = face === "glass" || face === "soft" ? productPhoto(ctx, true) : null;
  // the window: 4:5, or 5:4 for a wide product (fit.ts) — the photo fitted subject-first to it
  const plan = photo ? photoPlan(photo) : null;
  const parts = data.showEndDate ? endParts(end, ctx.locale, ctx.doc.market) : null;
  const label = statusText(c);
  const until = parts ? (
    <p className="lp-urg__until" data-reveal="fade" data-delay="420">
      <span className="lp-urg__cal" aria-hidden="true">
        <span className="lp-urg__cal-d">{parts.day}</span>
      </span>
      <span>{fill(untilTemplate(ctx.locale), { date: parts.date, time: parts.time })}</span>
    </p>
  ) : null;
  return (
    <div className="lp-urg__clock">
      <div
        className={cx("lp-urg__stage", "lp-decor-host", photo && "lp-urg__stage--photo")}
        data-bg={stageBg(ctx, bg)}
        data-reveal="scale-in"
        data-delay="120"
      >
        {photo ? (
          // the photo in its own window, fitted subject-first to that exact frame (4:5 at every width)
          <span className="lp-urg__photo" data-wide={plan?.wide ? "" : undefined}>
            {plan ? <PlannedPhoto asset={photo} sizes="(min-width: 56rem) 28vw, 86vw" plan={plan} /> : null}
          </span>
        ) : null}
        {/* the drifting product light: only under glass (no photo) and inside the smoked slab */}
        {!photo && face !== "hairline" && face !== "clay" ? <span className="lp-urg__light" aria-hidden="true" /> : null}
        {!photo ? <StageTexture ctx={ctx} id={id} /> : null}
        {label ? (
          <p className="lp-urg__status" aria-hidden="true">
            <span className="lp-urg__pulse" />
            {label}
          </p>
        ) : null}
        <Countdown ctx={ctx} end={end} className="lp-urg__cd" />
        {/* the drop card holds its own last day (beside the tiles on wide cards) */}
        {photo ? until : null}
      </div>
      {photo ? null : until}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* stock                                                               */
/* ------------------------------------------------------------------ */

/**
 * One dot per real piece, ten to a row. The partial row sits on top, flush to the end — the tray
 * empties from the top — and its first dot (the next piece to go) keeps breathing.
 */
function Dots({ ctx, n }: { ctx: RenderContext; n: number }) {
  const rest = n % DOTS_ROW;
  const start = n > DOTS_ROW && rest ? DOTS_ROW - rest + 1 : undefined;
  // a few pieces read as one row of big dots; a full tray packs its dots tighter
  const size = n <= DOTS_ROW ? "few" : n > 50 ? "dense" : undefined;
  return (
    <span className="lp-urg__meter">
      <span
        className="lp-urg__dots"
        data-size={size}
        data-reveal="fade"
        data-delay="200"
        aria-hidden="true"
        style={cssVars({ "--cols": Math.min(n, DOTS_ROW) })}
      >
        {Array.from({ length: n }, (_, i) => (
          <i key={i} style={cssVars({ "--i": i, "--start": i === 0 ? start : undefined })} />
        ))}
      </span>
      <span className="lp-urg__legend" aria-hidden="true">
        <i />
        {dotLegend(ctx.locale)}
      </span>
    </span>
  );
}

/**
 * Segmented level meter of the batch the merchant declared: the segments are a ruler (one per piece
 * up to 24 pieces, otherwise 20 × 5 %), the fill is exact — a partly lit segment shows the remainder.
 */
function Gauge({ ctx, n, batch }: { ctx: RenderContext; n: number; batch: number }) {
  const segs = batch <= 24 ? batch : 20;
  const lit = (n / batch) * segs;
  return (
    <span className="lp-urg__meter">
      <span className="lp-urg__gauge" data-reveal="fade" data-delay="200" aria-hidden="true" style={cssVars({ "--segs": segs })}>
        {Array.from({ length: segs }, (_, i) => {
          const f = clamp(lit - i, 0, 1);
          return <i key={i} data-on={f > 0 ? "" : undefined} style={cssVars({ "--f": f.toFixed(3), "--i": i })} />;
        })}
      </span>
      <span className="lp-urg__legend lp-urg__legend--gauge">
        <bdi>{fill(ofTemplate(ctx.locale), { n: ctx.num(n), total: ctx.num(batch) })}</bdi>
      </span>
    </span>
  );
}

function StockCard({ ctx, data, n }: Common & { n: number }) {
  const note = data.stockNote.trim();
  const batch = data.batchSize && data.batchSize >= n ? data.batchSize : null;
  const meter = batch ? <Gauge ctx={ctx} n={n} batch={batch} /> : n <= DOTS_MAX ? <Dots ctx={ctx} n={n} /> : null;
  return (
    <div className={cx("lp-urg__stock", batch && "lp-urg__stock--gauge", !meter && "lp-urg__stock--solo")} data-reveal="rise" data-delay="120">
      <p className="lp-urg__status">
        <span className="lp-urg__pulse" aria-hidden="true" />
        {stockLabel(ctx.locale)}
      </p>
      {note ? <RichText as="p" className="lp-urg__note" text={note} ctx={ctx} editPath="stockNote" decorate={false} /> : null}
      <p className="lp-urg__count">
        <span className="lp-urg__n" data-reveal="blur-in" data-delay="160">
          <bdi>{ctx.num(n)}</bdi>
        </span>
        <span className="lp-urg__unit">{stockUnit(ctx.locale, n)}</span>
      </p>
      {meter}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* promise (no countdown, no stock)                                    */
/* ------------------------------------------------------------------ */

const STOP_ICONS: IconName[] = ["bag", "phone", "truck", "home"];

function Route({ ctx, data }: { ctx: RenderContext; data: Data }) {
  const own = data.route.filter((s) => s.when.trim() || s.what.trim());
  const custom = own.length >= 2;
  const stops: RouteStop[] = custom ? own : routeStops(ctx.locale);
  return (
    <div className="lp-urg__route" data-reveal="rise" data-delay="120">
      <ol className="lp-urg__stops" data-n={stops.length} data-stagger="120" style={cssVars({ "--n": stops.length })}>
        {stops.map((s, i) => {
          // edit paths point at the merchant's own items (the built-in route has nothing to edit)
          const at = custom ? data.route.indexOf(s) : -1;
          return (
            <li key={i} className="lp-urg__stop" data-reveal="rise">
              <span className="lp-urg__pin" aria-hidden="true">
                <Icon name={STOP_ICONS[i] ?? "check"} size="1.25rem" />
              </span>
              <RichText as="span" className="lp-urg__when" text={s.when} ctx={ctx} decorate={false} editPath={at >= 0 ? `route.${at}.when` : undefined} />
              <RichText as="span" className="lp-urg__what" text={s.what} ctx={ctx} decorate={false} editPath={at >= 0 ? `route.${at}.what` : undefined} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* banner                                                              */
/* ------------------------------------------------------------------ */

/**
 * The live value in a dark capsule (it adopts the dark block's palette); on a section that is already
 * dark, the capsule inverts to the section's ink instead.
 */
function Island(c: Common) {
  const inverse = darkish(c.ctx, c.bg);
  return (
    <span className={cx("lp-urg__island", inverse && "lp-urg__island--inverse")} data-bg={inverse ? undefined : "dark"}>
      <IslandBody {...c} />
    </span>
  );
}

function IslandBody(c: Common) {
  const { ctx, mode, end, stock } = c;
  if (mode === "countdown" && end) {
    const label = statusText(c);
    return (
      <>
        <span className="lp-urg__pulse" aria-hidden="true" />
        {label ? (
          <span className="lp-urg__ilabel" aria-hidden="true">
            {label}
          </span>
        ) : null}
        <Countdown ctx={ctx} end={end} compact className="lp-urg__icd" />
      </>
    );
  }
  if (mode === "stock" && stock) {
    return (
      <>
        <span className="lp-urg__pulse" aria-hidden="true" />
        <span className="lp-urg__inum">
          <bdi>{ctx.num(stock)}</bdi>
        </span>
        <span className="lp-urg__ilabel">{stockUnit(ctx.locale, stock)}</span>
      </>
    );
  }
  return (
    <>
      <span className="lp-urg__iitem">
        <Icon name="truck" size="1.15em" />
        <RichText as="span" text={ctx.t("trust.delivery")} ctx={ctx} decorate={false} />
      </span>
      <span className="lp-urg__iitem">
        <Icon name="cash-hand" size="1.15em" />
        {ctx.t("trust.cod")}
      </span>
    </>
  );
}

function Band(c: Common) {
  const { ctx, data, titleId } = c;
  const title = titleOf(c);
  const thumb = productPhoto(ctx, false);
  return (
    <div className={cx("lp-container", "lp-urg__band", thumb && "lp-urg__band--thumb")}>
      {thumb ? (
        <span className="lp-urg__thumb" data-reveal="scale-in" data-delay="40">
          <Picture asset={thumb} sizes="72px" alt="" ratio={1} />
        </span>
      ) : null}
      <RichText as="h2" id={titleId} className="lp-urg__btitle" text={title.text} ctx={ctx} editPath={title.path} reveal="blur-in" delay={60} />
      <span className="lp-urg__bmeta" data-reveal="scale-in" data-delay="160">
        <Island {...c} />
      </span>
      {data.showCta ? (
        <span className="lp-urg__bgo" data-reveal="rise" data-delay="240">
          <Cta ctx={ctx} label={data.ctaLabel.trim() || ctx.t("cta.order")} editPath={data.ctaLabel.trim() ? "ctaLabel" : undefined} size="m" className="lp-urg__bcta" />
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function render({ id, variant, bg, data, ctx }: { id: string; variant: string; bg: SectionBg; data: Data; ctx: RenderContext }): ReactElement | null {
  const v: Variant = (VARIANT_IDS as readonly string[]).includes(variant) ? (variant as Variant) : "countdown";
  const end = liveEnd(ctx);
  const stock = liveStock(ctx);
  const mode = modeOf(v, end, stock, data);
  if (!mode) return null;
  const titleId = `${id}-title`;
  const common: Common = { id, bg, ctx, data, mode, titleId, end, stock };
  const root = `lp-urg lp-urg--${mode} lp-urg--${faceOf(ctx)}`;

  if (v === "banner") {
    return (
      <SectionShell id={id} ctx={ctx} type="urgency" variant={v} bg={bg} space="tight" labelledBy={titleId} className={root}>
        <Band {...common} />
      </SectionShell>
    );
  }

  const visual =
    mode === "countdown" && end ? (
      <Stage {...common} end={end} />
    ) : mode === "stock" && stock ? (
      <StockCard {...common} n={stock} />
    ) : (
      <Route ctx={ctx} data={data} />
    );
  return (
    <SectionShell id={id} ctx={ctx} type="urgency" variant={v} bg={bg} labelledBy={titleId} className={root}>
      <div className="lp-container lp-urg__wrap">
        <Copy {...common} />
        <div className="lp-urg__visual">{visual}</div>
        <Go ctx={ctx} data={data} />
      </div>
    </SectionShell>
  );
}

export default withRevealScope(defineSection({
  type: "urgency",
  label: "Urgency",
  labelFr: "Urgence",
  category: "offer",
  description: "A real countdown or real stock left — never invented. Without either, an honest delivery promise.",
  variants: [
    {
      id: "countdown",
      label: "Countdown",
      description: "The live timer in frosted glass tiles over the product photo (or as open numerals / a smoked display, per style), with the real last day. Hides itself when it ends.",
    },
    {
      id: "stock",
      label: "Stock left",
      description: "The real stock as one giant number with a dot per piece, or a segmented gauge of the batch.",
      archetypes: ["playground", "kinetic", "souk", "garage", "hearth", "circuit", "field"],
    },
    { id: "banner", label: "Slim band", description: "One line: product thumb, headline, a capsule with the live timer, and a small order button." },
  ],
  schema,
  defaults: ({ locale, product, rng }) => {
    const c = urgencyCopy(locale, product.name, rng);
    return {
      kicker: c.kicker,
      countdownTitle: c.countdownTitle,
      stockTitle: c.stockTitle,
      promiseTitle: c.promiseTitle,
      lead: "",
      showEndDate: true,
      stockNote: "",
      route: c.route,
      showCta: true,
      ctaLabel: "",
      whenEmpty: "promise" as const,
    };
  },
  fields: [
    {
      kind: "group",
      label: "Heading",
      fields: [
        { kind: "text", path: "kicker", label: "Kicker", max: 60, help: "Small line above the headline." },
        { kind: "textarea", path: "lead", label: "Intro", max: 220, rows: 2, help: "Optional, e.g. what the offer includes." },
      ],
    },
    {
      kind: "group",
      label: "Headline for each situation",
      fields: [
        {
          kind: "text",
          path: "countdownTitle",
          label: "While the countdown runs",
          max: 140,
          help: "The end date is set in Offers → Urgency. Wrap words in *stars* to emphasize them.",
        },
        { kind: "text", path: "stockTitle", label: "When stock is shown", max: 140, help: "The stock number is set in Offers → Urgency." },
        { kind: "text", path: "promiseTitle", label: "Without countdown or stock", max: 140, help: "Shown with the delivery route below." },
      ],
    },
    {
      kind: "group",
      label: "Countdown",
      fields: [{ kind: "toggle", path: "showEndDate", label: "Show the end date", help: "“Until Friday 9 October, 19:00”, in your market's time zone." }],
    },
    {
      kind: "group",
      label: "Stock",
      fields: [
        { kind: "text", path: "stockNote", label: "Note next to the number", max: 60, help: "Optional and true, e.g. “Next restock: November”." },
        {
          kind: "number",
          path: "batchSize",
          label: "Batch size",
          min: 1,
          max: 100000,
          step: 1,
          help: "Optional: how many pieces the batch had. Draws a gauge; empty = one dot per piece (up to 100).",
        },
      ],
    },
    {
      kind: "list",
      path: "route",
      label: "Delivery route (no countdown, no stock)",
      itemLabel: "Step",
      titlePath: "when",
      max: 4,
      item: [
        { kind: "text", path: "when", label: "When", max: 30, placeholder: "Sous 24 h" },
        { kind: "text", path: "what", label: "What happens", max: 90, placeholder: "Un appel pour confirmer" },
      ],
      newItem: () => ({ when: "", what: "" }),
    },
    {
      kind: "group",
      label: "Button",
      fields: [
        { kind: "toggle", path: "showCta", label: "Show order button" },
        { kind: "text", path: "ctaLabel", label: "Button text", max: 40, help: "Empty = default text. The live price is added." },
      ],
    },
    {
      kind: "select",
      path: "whenEmpty",
      label: "With no countdown and no stock",
      options: [
        { value: "promise", label: "Show the delivery route" },
        { value: "hide", label: "Hide the section" },
      ],
      help: "Urgency is never invented: this decides what appears when Offers has no end date or stock.",
    },
  ],
  render,
}));
