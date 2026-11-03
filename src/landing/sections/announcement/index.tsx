/**
 * Announcement bar — the slim band above everything that answers the COD shopper's first questions
 * (how do I pay, when does it arrive, can I check it) before the hero has even loaded. Real content
 * only: defaults are the store's standing promises (free delivery only when every pack ships free),
 * and the live countdown appears only while the admin's real end date is still ahead.
 *
 *   ticker — promises glide across the full band between small glyphs and slide UNDER a frosted
 *            countdown lens pinned at the end edge (they blur as they pass behind it); a single
 *            promise does not loop — it sits still, centered
 *   static — one centered line over a light seam: an icon in a glossy disc whose ring fills while
 *            the message holds its turn, the messages taking turns (rise + blur-to-sharp), an
 *            optional live countdown capsule beside them
 *   split  — an inset glass capsule: two promises pinned to its edges on concentric solid discs,
 *            joined by a hairline drawn from the middle (the countdown takes the middle while it runs)
 */
import type { ReactElement } from "react";
import { z } from "zod";
import { everyOfferFree } from "@/lib/page/pricing";
import type { Archetype } from "@/lib/page/schema";
import {
  Countdown,
  cssVars,
  cx,
  editAttr,
  Icon,
  ICON_NAMES,
  isoToMs,
  MarqueeTrack,
  Ornament,
  reveal,
  RichText,
  SectionShell,
  type IconName,
} from "../../primitives";
import { defineSection, type FieldSpec, type RenderContext } from "../../types";
import { line, PLEDGE_ICON, type Pledge } from "./copy";
import { withRevealScope } from "../reveal-scope";

const IconId = z.enum(ICON_NAMES as [IconName, ...IconName[]]);

const Item = z.object({
  icon: IconId.default("check"),
  /** may be empty while the merchant types a new message — empty messages are skipped */
  text: z.string().trim().max(64).default(""),
});

const Schema = z.object({
  items: z.array(Item).min(1).max(5),
  /** ticker scroll speed / how long each message stays in the single line; auto = the archetype's pace */
  speed: z.enum(["auto", "slow", "normal", "fast"]).default("auto"),
  /** mini countdown to offers.urgency.countdownEnd (renders only while that date is in the future) */
  countdown: z.boolean().default(true),
  /** label of the countdown; empty → "L'offre se termine dans" */
  countdownLabel: z.string().trim().max(40).default(""),
});

type Data = z.infer<typeof Schema>;
type ItemData = z.infer<typeof Item>;
type Speed = Exclude<Data["speed"], "auto">;

const fields: FieldSpec[] = [
  {
    kind: "list",
    path: "items",
    label: "Messages",
    itemLabel: "Message",
    titlePath: "text",
    min: 1,
    max: 5,
    item: [
      {
        kind: "text",
        path: "text",
        label: "Text",
        max: 64,
        help: "Short and true: payment on delivery, delivery time, free delivery only if it really is free. *Word* lights it up in the accent color.",
      },
      { kind: "icon", path: "icon", label: "Icon" },
    ],
    newItem: () => ({ icon: "check", text: "" }),
  },
  {
    kind: "group",
    label: "Motion",
    fields: [
      {
        kind: "select",
        path: "speed",
        label: "Speed",
        options: [
          { value: "auto", label: "Match the page style" },
          { value: "slow", label: "Calm" },
          { value: "normal", label: "Normal" },
          { value: "fast", label: "Lively" },
        ],
        help: "Ticker: how fast the messages scroll. Single line: how long each message stays before the next one slides in. Split shows the first two messages and does not move.",
      },
    ],
  },
  {
    kind: "group",
    label: "Countdown",
    fields: [
      {
        kind: "toggle",
        path: "countdown",
        label: "Show the offer countdown",
        help: "Uses the end date set in Offers → Urgency. Hidden when no date is set or once it has passed — it never restarts.",
      },
      { kind: "text", path: "countdownLabel", label: "Countdown label", max: 40, placeholder: "L'offre se termine dans" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

/** Free delivery is only claimed when no fee is added and every pack ships free. */
function freeDelivery(offers: RenderContext["offers"]): boolean {
  return everyOfferFree({ offers });
}

interface Msg {
  /** index in data.items (edit paths) */
  i: number;
  icon: IconName;
  text: string;
}

/** Non-empty messages in order. */
function messages(data: Data): Msg[] {
  return data.items.flatMap((it, i) => (it.text.trim() ? [{ i, icon: it.icon, text: it.text.trim() }] : []));
}

/** The admin's real offer end date, when the countdown is on and that date is still ahead (pure: no Date). */
function liveEnd(ctx: RenderContext, data: Data): string | null {
  const end = ctx.offers.urgency?.countdownEnd;
  if (!data.countdown || !end) return null;
  const endMs = isoToMs(end);
  const nowMs = isoToMs(ctx.now);
  return Number.isFinite(endMs) && Number.isFinite(nowMs) && endMs > nowMs ? end : null;
}

/** Archetypes that move faster by default (sport, workshop, toys). */
const BRISK: ReadonlySet<Archetype> = new Set(["kinetic", "garage", "playground"]);

function speedOf(ctx: RenderContext, data: Data): Speed {
  return data.speed !== "auto" ? data.speed : BRISK.has(ctx.archetype) ? "normal" : "slow";
}

/** Seconds each message stays in the single line. */
const STEP: Readonly<Record<Speed, number>> = { slow: 5, normal: 4, fast: 3 };

/** Precision archetypes separate with a clean slash; the others with their own glyph. */
const SLASHED: ReadonlySet<Archetype> = new Set(["circuit", "editorial"]);

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

type IconLook = "bare" | "disc" | "solid";

/** `ring`: a hairline around the disc that fills while the message holds its turn (single line loop). */
function Message({ ctx, m, look = "bare", ring = false }: { ctx: RenderContext; m: Msg; look?: IconLook; ring?: boolean }): ReactElement {
  return (
    <span className="lp-announcement__msg">
      <span className={cx("lp-announcement__icon", look !== "bare" && `lp-announcement__icon--${look}`)} aria-hidden="true">
        {ring ? (
          <svg className="lp-announcement__ring lp-flip-rtl" viewBox="0 0 36 36" focusable="false">
            <circle cx="18" cy="18" r="17.25" pathLength={1} transform="rotate(-90 18 18)" />
          </svg>
        ) : null}
        <Icon name={m.icon} size="1.15em" strokeWidth={1.9} />
      </span>
      <RichText as="span" className="lp-announcement__text" text={m.text} ctx={ctx} decorate={false} editPath={`items.${m.i}.text`} />
    </span>
  );
}

/** Frosted capsule: live pulse · label (wide screens) · compact countdown. */
function Timer({ ctx, data, end, delay }: { ctx: RenderContext; data: Data; end: string; delay?: number }): ReactElement {
  const label = data.countdownLabel.trim() || ctx.t("urgency.endsIn");
  return (
    <div className="lp-announcement__pill" {...reveal("stamp", delay)}>
      <span className="lp-announcement__live" aria-hidden="true" />
      {/* the timer carries the same text as its accessible name */}
      <span className="lp-announcement__pill-label" aria-hidden="true" {...editAttr(ctx, "countdownLabel")}>
        {label}
      </span>
      <Countdown ctx={ctx} end={end} compact label={label} className="lp-announcement__cd" />
    </div>
  );
}

/** A 1px hairline drawn on from its center, or from one end (mirrored on RTL pages). */
function Rule({ from, delay }: { from: "center" | "start" | "end"; delay: number }): ReactElement {
  const paths = from === "center" ? ["M50 .5H0", "M50 .5H100"] : [from === "start" ? "M0 .5H100" : "M100 .5H0"];
  return (
    <svg
      className={cx("lp-announcement__rule", from !== "center" && "lp-flip-rtl")}
      viewBox="0 0 100 1"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      {...reveal("draw", delay)}
    >
      {paths.map((d) => (
        <path key={d} className="lp-draw" pathLength={1} d={d} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

interface VariantProps {
  ctx: RenderContext;
  data: Data;
  list: Msg[];
  end: string | null;
}

function Ticker({ ctx, data, list, end }: VariantProps): ReactElement {
  // one promise does not loop (the same line chasing itself reads as spam): it rests, centered
  if (list.length === 1) {
    return (
      <div className="lp-announcement__band" data-solo="" data-timed={end ? "" : undefined}>
        <div className="lp-announcement__solo" {...reveal("blur-in")}>
          <Message ctx={ctx} m={list[0]!} />
        </div>
        {end ? <Timer ctx={ctx} data={data} end={end} delay={200} /> : null}
      </div>
    );
  }
  const separator = SLASHED.has(ctx.archetype) ? (
    <span className="lp-announcement__slash" />
  ) : (
    <Ornament ctx={ctx} size="0.62em" className="lp-announcement__glyph" />
  );
  return (
    <div className="lp-announcement__band" data-timed={end ? "" : undefined}>
      <div className="lp-announcement__track" {...reveal("fade")}>
        <MarqueeTrack
          ctx={ctx}
          speed={speedOf(ctx, data)}
          minItems={6}
          separator={separator}
          items={list.map((m) => (
            <Message key={m.i} ctx={ctx} m={m} />
          ))}
          className="lp-announcement__marquee"
        />
      </div>
      {end ? <Timer ctx={ctx} data={data} end={end} delay={260} /> : null}
    </div>
  );
}

function Static({ ctx, data, list, end }: VariantProps): ReactElement {
  const n = list.length;
  const step = STEP[speedOf(ctx, data)];
  // several messages take turns in one slot; data-marquee lets the runtime pause the loop off-screen
  const turns = n > 1;
  return (
    <>
      <div className="lp-container lp-announcement__line">
        <ul
          className="lp-announcement__rot"
          role="list"
          data-n={turns ? n : undefined}
          data-marquee={turns ? "" : undefined}
          style={turns ? cssVars({ "--ann-step": `${step}s`, "--ann-cycle": `${step * n}s` }) : undefined}
          {...reveal("blur-in")}
        >
          {list.map((m, k) => (
            <li key={m.i} className="lp-announcement__slot" style={turns ? cssVars({ "--k": k }) : undefined}>
              <Message ctx={ctx} m={m} look="disc" ring={turns} />
            </li>
          ))}
        </ul>
        {end ? <Timer ctx={ctx} data={data} end={end} delay={200} /> : null}
      </div>
      {/* a 1px light seam along the bottom edge, opening from the middle */}
      <span className="lp-announcement__seam" aria-hidden="true" {...reveal("fade", 120)} />
    </>
  );
}

/**
 * Entrance = one wave from the middle outward: the capsule fades in, the countdown pops, the
 * hairlines draw toward the edges, then both promises unveil from their inner edge (start side
 * mirrored in the CSS).
 */
function Split({ ctx, data, list, end }: VariantProps): ReactElement {
  // render() only gets here with at least one message
  const [a, b] = list as [Msg, ...Msg[]];
  const lines = end ? 120 : 60;
  const sides = lines + 160;
  return (
    <div className="lp-container lp-announcement__wrap">
      <div className="lp-announcement__capsule" data-timed={end ? "" : undefined} data-single={b ? undefined : ""} {...reveal("fade")}>
        <div className="lp-announcement__side lp-announcement__side--start" {...reveal("wipe-side", sides)}>
          <Message ctx={ctx} m={a} look="solid" />
        </div>
        <Rule from={end ? "end" : "center"} delay={lines} />
        {end ? <Timer ctx={ctx} data={data} end={end} /> : null}
        {end ? <Rule from="start" delay={lines} /> : null}
        {b ? (
          <div className="lp-announcement__side lp-announcement__side--end" {...reveal("wipe-side", sides)}>
            <Message ctx={ctx} m={b} look="solid" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export default withRevealScope(defineSection({
  type: "announcement",
  label: "Announcement bar",
  labelFr: "Barre d’annonce",
  category: "top",
  description: "A slim band above the header with the order promises: cash on delivery, delivery time, free delivery, live offer countdown.",
  singleton: true,
  variants: [
    {
      id: "ticker",
      label: "Ticker",
      description: "Promises glide across the band between small glyphs and slip under a frosted countdown lens pinned at the end.",
    },
    {
      id: "static",
      label: "Single line",
      description: "One centered line over a light seam; messages take turns with a smooth rise, beside a live countdown capsule.",
      archetypes: ["maison", "apothecary", "editorial", "bloom"],
    },
    {
      id: "split",
      label: "Split capsule",
      description: "Two promises pinned to the edges of a glass capsule, joined by a drawn hairline (the countdown takes the middle).",
      archetypes: ["circuit", "editorial", "maison", "kinetic"],
    },
  ],
  schema: Schema,
  defaults: ({ locale, offers, archetype, rng }): Data => {
    const free = freeDelivery(offers);
    // payment first (the first COD question) — or, when delivery really is free, sometimes that
    const order: Pledge[] =
      free && rng() < 0.5 ? ["free", "cod", "delivery", "check"] : ["cod", "delivery", ...(free ? (["free"] as const) : []), "check"];
    const items: ItemData[] = order.map((p) => ({ icon: PLEDGE_ICON[p], text: line(locale, p, archetype, rng) }));
    return { items, speed: "auto", countdown: true, countdownLabel: "" };
  },
  fields,
  render: ({ id, variant, bg, data, ctx }) => {
    const list = messages(data);
    if (!list.length) return null;
    const end = liveEnd(ctx, data);
    const v = variant === "static" || variant === "split" ? variant : "ticker";
    const props: VariantProps = { ctx, data, list, end };
    return (
      <SectionShell id={id} ctx={ctx} type="announcement" variant={v} bg={bg} as="div">
        {v === "static" ? <Static {...props} /> : v === "split" ? <Split {...props} /> : <Ticker {...props} />}
      </SectionShell>
    );
  },
}));
