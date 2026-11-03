/**
 * Light & depth — soft product-tinted light built from CSS gradients and masks (no SVG filters,
 * no blur): cheap to paint, smooth at any size, animated only through transform/opacity.
 *
 * Colors are section-aware (illustrations.css): the default light ("glow") is the block's action colour at ≤ 10 %
 * alpha, and beams/spotlights use a pale tint that reads as light on dark blocks and as a soft tinted wash on light
 * ones. No mesh of lights and no film grain (core D60 rev 3, V40; design.md DES-§4.10.1): a section that wants light
 * gets one product-tinted radial (GlowOrb, a Halo, the stage glow) or a flat slab of its own colour.
 * Every piece is decorative (aria-hidden) and ignores pointer events.
 */
import type { ReactElement, ReactNode } from "react";
import { clamp, rnd } from "./core/geom";
import { createRng, type Seed } from "./core/rng";
import { cssLength, cx, toneAttr, vars, type Tone } from "./core/svg";

export type Intensity = "subtle" | "soft" | "medium" | "strong";

/** Absolute placement inside the nearest positioned host (.lp-decor-host). Logical: RTL mirrors. */
export type LightPlace = "center" | "top" | "bottom" | "start" | "end" | "top-start" | "top-end" | "bottom-start" | "bottom-end";

interface LightBase {
  className?: string;
  /** light color; default = the section-aware product light */
  tone?: Tone;
  intensity?: Intensity;
  /** absolute placement (otherwise the piece is a block sized by `size` / your CSS) */
  place?: LightPlace;
}

/* ------------------------------------------------------------------ */
/* GlowOrb                                                             */
/* ------------------------------------------------------------------ */

export interface GlowOrbProps extends LightBase {
  /** width (number → px, or a CSS length / %); default 60% */
  size?: number | string;
  /** circle, or a wide / tall ellipse */
  shape?: "circle" | "wide" | "tall";
  idle?: "float" | "drift" | "pulse";
}

/**
 * Soft radial light (gaussian falloff) — the ambient glow behind a product or a headline.
 * The root carries size + placement; the idle loop runs on the inner core (transforms never clash).
 */
export function GlowOrb({ size, shape = "circle", tone, intensity = "soft", place, idle, className }: GlowOrbProps): ReactElement {
  return (
    <span
      className={cx("lp-ill lp-light lp-orb", className)}
      data-tone={toneAttr(tone)}
      data-i={intensity}
      data-shape={shape === "circle" ? undefined : shape}
      data-place={place}
      style={vars({ "--ill-size": cssLength(size) })}
      aria-hidden="true"
    >
      <span className={cx("lp-orb__core", idle && `lp-idle-${idle}`)} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Halo                                                                */
/* ------------------------------------------------------------------ */

export interface HaloProps extends LightBase {
  /** width (number → px or CSS length); default 80% */
  size?: number | string;
  /** thin concentric rings around the glow (0–3) */
  rings?: number;
  /** a small satellite dot travelling the outer ring (spins when motion allows) */
  orbit?: boolean;
  seed?: Seed;
  idle?: "pulse" | "float";
}

/**
 * Product halo: a soft disc of light plus up to three hairline rings — the stage behind a cutout
 * product (bloom, maison, apothecary). Rings are 1px at any size (non-scaling strokes).
 */
export function Halo({ size, rings = 2, orbit = false, seed = 1, tone, intensity = "soft", place, idle, className }: HaloProps): ReactElement {
  const n = clamp(Math.round(rings), 0, 3);
  const radii = [99, 84, 69].slice(0, n);
  const start = createRng(seed, "halo").range(0, 360);
  const orbitR = radii[0] ?? 99;
  return (
    <span
      className={cx("lp-ill lp-light lp-halo", className)}
      data-tone={toneAttr(tone)}
      data-i={intensity}
      data-place={place}
      style={vars({ "--ill-size": cssLength(size) })}
      aria-hidden="true"
    >
      <span className={cx("lp-halo__glow", idle && `lp-idle-${idle}`)} />
      {n > 0 || orbit ? (
        <svg className="lp-halo__rings" viewBox="0 0 200 200" focusable="false" aria-hidden="true">
          <g fill="none" stroke="currentColor">
            {radii.map((r, i) => (
              <circle key={r} cx={100} cy={100} r={r - 0.5} strokeOpacity={rnd(0.5 - i * 0.12, 2)} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {orbit ? (
            <g className="lp-idle lp-idle-spin">
              <g transform={`rotate(${rnd(start)} 100 100)`}>
                <circle cx={100} cy={rnd(100 - orbitR + 0.5)} r={3.2} fill="currentColor" />
              </g>
            </g>
          ) : null}
        </svg>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Beam                                                                */
/* ------------------------------------------------------------------ */

export type BeamOrigin = "top" | "top-start" | "top-end" | "bottom";

export interface BeamProps extends Omit<LightBase, "place"> {
  seed?: Seed;
  /** where the light comes from (start / end are logical: they mirror in RTL) */
  origin?: BeamOrigin;
  /** 1 = one soft beam; 2–7 = a fan of stage beams opening from the same source */
  count?: number;
  /** tilt of the beam (or of the fan's axis) from vertical, in degrees (default: seeded, gentle) */
  angle?: number;
  /** angular width of each beam in degrees (default 26 for one beam, narrower in a fan) */
  spread?: number;
  /** total opening of a fan in degrees (default 64) */
  fan?: number;
  /** absolute full-bleed layer (default) */
  layer?: boolean;
}

/**
 * Soft light beam(s): conic light with an eased fade along its length — stage light slanting across
 * a section. A fan is 2–7 discrete beams opening from one source with seeded widths, lengths and
 * strengths (a stage rig, never a sunburst). Mirrors in RTL.
 */
export function Beam({ seed = 1, origin = "top", count = 1, angle, spread, fan = 64, tone, intensity = "soft", layer = true, className }: BeamProps): ReactElement {
  const rng = createRng(seed, "beam");
  const n = clamp(Math.round(count), 1, 7);
  // conic angles run clockwise from 12 o'clock: a negative tilt swings a top beam toward the inline end
  const side = origin === "top-start" ? -1 : origin === "top-end" ? 1 : rng.sign();
  const axis = angle === undefined ? (n === 1 ? rng.range(8, 22) : rng.range(0, 10)) * side : clamp(angle, -60, 60);
  const open = clamp(fan, 10, 140);
  const width = clamp(spread ?? (n === 1 ? 26 : Math.min(22, (open / n) * 1.25)), 4, 70);
  const rays: ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    rays.push(
      <span
        key={i}
        className="lp-beam__ray"
        style={vars({
          "--ill-tilt": `${rnd(axis + t * open + (n > 1 ? rng.jitter(open / n / 6) : 0), 1)}deg`,
          "--ill-spread": `${rnd(n > 1 ? width * rng.range(0.7, 1.15) : width, 1)}deg`,
          "--ill-len": n > 1 ? rnd(rng.range(0.72, 1), 2) : undefined,
          "--ill-ray": n > 1 ? rnd(rng.range(0.55, 1), 2) : undefined,
        })}
      />,
    );
  }
  return (
    <span
      className={cx("lp-ill lp-light lp-beam", layer && "lp-layer", className)}
      data-tone={toneAttr(tone)}
      data-i={intensity}
      data-origin={origin}
      aria-hidden="true"
    >
      {rays}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Spotlight                                                           */
/* ------------------------------------------------------------------ */

export interface SpotlightProps extends Omit<LightBase, "place"> {
  origin?: "top" | "top-start" | "top-end";
  /** the pool of light on the "floor" under the product */
  pool?: boolean;
  /** absolute full-bleed layer (default) */
  layer?: boolean;
}

/** Stage light: a soft cone from above and a pool of light on the floor (maison, circuit, hero stage). */
export function Spotlight({ origin = "top", pool = true, tone, intensity = "medium", layer = true, className }: SpotlightProps): ReactElement {
  return (
    <span
      className={cx("lp-ill lp-light lp-spot", layer && "lp-layer", className)}
      data-tone={toneAttr(tone)}
      data-i={intensity}
      data-origin={origin}
      data-pool={pool ? "" : undefined}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ */
/* GlassChip                                                           */
/* ------------------------------------------------------------------ */

export interface GlassChipProps {
  children: ReactNode;
  /** "auto" = frosted section card; "dark" = smoked glass (for chips over photos) */
  glass?: "auto" | "dark";
  size?: "s" | "m";
  className?: string;
}

/**
 * Frosted glass chip holding real content (spec callouts, captions over media). Paints the theme's
 * per-section glass (--sec-glass / -ink / -border, ink AA over any backdrop) through .lp-glass, with
 * the opaque --sec-glass-solid fallback. "dark" adopts the dark block's smoked glass by carrying
 * data-bg="dark" (the theme re-declares every --sec-* token there).
 */
export function GlassChip({ children, glass = "auto", size = "m", className }: GlassChipProps): ReactElement {
  return (
    <span className={cx("lp-glass lp-glasschip", className)} data-bg={glass === "dark" ? "dark" : undefined} data-size={size === "s" ? "s" : undefined}>
      {children}
    </span>
  );
}
