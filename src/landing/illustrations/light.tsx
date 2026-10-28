/**
 * Light & depth — soft product-tinted light built from CSS gradients and masks (no SVG filters,
 * no blur): cheap to paint, smooth at any size, animated only through transform/opacity.
 *
 * Colors are section-aware (illustrations.css): the default light ("glow") is the block's action colour at ≤ 10 %
 * alpha (the theme emits no aurora lights since core D60 rev 3), and beams/spotlights use a pale tint that reads as
 * light on dark blocks and as a soft tinted wash on light ones. The Aurora mesh below leaves with the section redraws
 * that mount it (design.md DES-§4.10.1).
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
/* Aurora                                                              */
/* ------------------------------------------------------------------ */

export interface AuroraProps extends Omit<LightBase, "tone" | "place"> {
  seed?: Seed;
  /**
   * Paint the theme's own contrast-solved field (--lp-aurora) instead of a seeded composition:
   * use it when body text sits on the light (the theme guarantees AA over that exact field). Its
   * intensity defaults to "strong" (the full solved field); seeded auroras default to "soft".
   */
  solved?: boolean;
  /** slow ambient drift of the light (motion-gated) */
  drift?: boolean;
  /**
   * ultra-subtle film grain on top (breaks gradient banding): "auto" (default) follows the theme
   * (html[data-texture="grain"]), true always, false never
   */
  grain?: boolean | "auto";
  /** absolute full-bleed layer (default) — false = block sized by your CSS */
  layer?: boolean;
}

/**
 * Composition of the seeded mesh — the same model the theme's contrast solver uses (one light high on
 * the start side, one on the end side, one low and wide; one light per aurora hue, never doubled), so
 * the overlaps it produces are the kind the theme already keeps text-safe. Ranges in % of the box.
 */
const AURORA_FIELDS: readonly { x: [number, number]; y: [number, number]; w: [number, number]; h: [number, number] }[] = [
  { x: [8, 30], y: [8, 30], w: [104, 140], h: [96, 128] },
  { x: [70, 92], y: [14, 42], w: [84, 120], h: [80, 116] },
  { x: [34, 66], y: [76, 96], w: [120, 164], h: [84, 116] },
];

/**
 * Mesh light: three large soft lights in the product's hues (--lp-aurora-1/2/3, solved per section by
 * the theme), low contrast, overlapping — the modern backdrop for posters, CTAs and hero stages.
 * Seeded composition (positions, sizes, mirrored or not); drift is a slow transform loop per light.
 */
export function Aurora({ seed = 1, solved = false, intensity, drift = false, grain = "auto", layer = true, className }: AuroraProps): ReactElement {
  const rng = createRng(seed, "aurora");
  const mirror = rng.chance(0.5);
  const fields = solved
    ? [<span key="f" className="lp-aurora__field" />]
    : AURORA_FIELDS.map((f, i) => {
        const x = rng.range(f.x[0], f.x[1]);
        return (
          <span
            key={i}
            className="lp-aurora__f"
            data-n={i + 1}
            style={vars({
              "--x": `${rnd(mirror ? 100 - x : x)}%`,
              "--y": `${rnd(rng.range(f.y[0], f.y[1]))}%`,
              "--w": `${rnd(rng.range(f.w[0], f.w[1]))}%`,
              "--h": `${rnd(rng.range(f.h[0], f.h[1]))}%`,
            })}
          />
        );
      });
  return (
    <span
      className={cx("lp-ill lp-light lp-aurora", layer && "lp-layer", drift && "lp-aurora--drift", className)}
      data-i={intensity ?? (solved ? "strong" : "soft")}
      aria-hidden="true"
    >
      {fields}
      {grain ? <span className="lp-grain" data-auto={grain === "auto" ? "" : undefined} /> : null}
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
/* Grain                                                               */
/* ------------------------------------------------------------------ */

export interface GrainProps {
  /** layer opacity, 0–0.03 (default 0.025): film grain is felt, never seen */
  opacity?: number;
  /** blend with what is under it (default soft-light) */
  blend?: "soft-light" | "overlay" | "normal";
  className?: string;
  /** kept for older call sites: the grain is a shared CSS texture and needs no id */
  uid?: string;
}

/**
 * Ultra-subtle film grain for gradient and dark fields (breaks banding, adds a premium tooth).
 * A static, tiled noise image from illustrations.css — no live SVG filter.
 */
export function Grain({ opacity, blend = "soft-light", className }: GrainProps): ReactElement {
  const o = opacity === undefined ? undefined : rnd(clamp(opacity, 0, 0.03), 3);
  return (
    <span
      className={cx("lp-grain lp-layer", className)}
      data-blend={blend === "soft-light" ? undefined : blend}
      style={vars({ "--ill-grain": o })}
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
