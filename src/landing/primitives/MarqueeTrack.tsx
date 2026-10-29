import type { ReactElement, ReactNode } from "react";
import type { RenderContext } from "../types";
import { Ornament } from "./Ornament";
import { RichText } from "./RichText";
import { cssVars, cx } from "./util";

export interface MarqueeTrackProps {
  ctx: RenderContext;
  /** text items go through RichText (*emphasis*, numbers kept in order on RTL pages); nodes render as is */
  items: ReactNode[];
  speed?: "slow" | "normal" | "fast";
  /** scroll toward inline-end instead of inline-start */
  reverse?: boolean;
  /** between items; default = archetype ornament glyph, false = none */
  separator?: ReactNode | false;
  /** fade the edges */
  fade?: boolean;
  /** minimum items per loop half so the band always overfills wide screens */
  minItems?: number;
  className?: string;
}

/** seconds each item takes to travel, per speed */
const PER_ITEM = { slow: 6.5, normal: 4.2, fast: 2.6 } as const;

/**
 * Seamless CSS marquee (runtime: data-marquee → paused off-screen). The item list is repeated
 * until one half overfills the viewport, then the half is duplicated (aria-hidden) and the track
 * slides by exactly 50%. Only the first copy is exposed to assistive tech.
 *
 * The copies are always whole items (design.md DES-§4.5.4 MarqueeTrack, I7): a word is never cut at a copy boundary,
 * and the travel follows the page direction (lp-marquee-rtl on RTL pages). Under a look the band clips with
 * `overflow: clip` on the marquee box only and every item keeps `padding-inline` ≥ 0.5 em (base.css §20), so an outline
 * or italic glyph is never cut at its own edge.
 */
export function MarqueeTrack({
  ctx,
  items,
  speed = "normal",
  reverse = false,
  separator,
  fade = false,
  minItems = 8,
  className,
}: MarqueeTrackProps): ReactElement | null {
  const list = items
    .filter((i) => i !== null && i !== undefined && i !== false && !(typeof i === "string" && !i.trim()))
    .map((i, k) => (typeof i === "string" ? <RichText key={k} ctx={ctx} text={i} decorate={false} /> : i));
  if (!list.length) return null;
  const copies = Math.max(1, Math.ceil(minItems / list.length));
  const duration = Math.round(list.length * copies * PER_ITEM[speed] * 10) / 10;
  const sep = separator === false ? null : (separator ?? <Ornament ctx={ctx} className="lp-marquee__ornament" />);

  // Repeated copies are aria-hidden and inert: a link or button inside an item stays reachable once
  // (in the first copy) instead of being announced or focused again and again.
  const half = (hidden: boolean) => (
    <div className="lp-marquee__group" aria-hidden={hidden ? true : undefined} inert={hidden || undefined}>
      {Array.from({ length: copies }, (_, c) =>
        list.map((item, i) => (
          <span
            key={`${c}.${i}`}
            className="lp-marquee__item"
            aria-hidden={!hidden && c > 0 ? true : undefined}
            inert={(!hidden && c > 0) || undefined}
          >
            <span className="lp-marquee__content">{item}</span>
            {sep ? (
              <span className="lp-marquee__sep" aria-hidden="true">
                {sep}
              </span>
            ) : null}
          </span>
        )),
      )}
    </div>
  );

  return (
    <div
      className={cx("lp-marquee", className)}
      data-marquee=""
      data-speed={speed}
      data-reverse={reverse ? "" : undefined}
      data-fade={fade ? "" : undefined}
      style={cssVars({ "--mq-dur": `${duration}s` })}
    >
      <div className="lp-marquee__track">
        {half(false)}
        {half(true)}
      </div>
    </div>
  );
}
