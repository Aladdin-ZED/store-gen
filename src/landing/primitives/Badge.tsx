import type { ReactElement } from "react";
import type { RenderContext } from "../types";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { RichText } from "./RichText";
import { cssVars, cx, reveal, seededRotation, type RevealKind } from "./util";

/**
 * Color tones (base.css .lp-tone-*). `sec`, `chip`, `glass` and the status tones follow the section
 * they sit on ([data-bg] --sec-* tokens); `accent`, `pop`, `ink`, `dark` are solid fills that stay
 * readable on any section. `paper` is the legacy name of `card` (the section's card surface).
 */
export type Tone =
  | "accent"
  | "pop"
  | "ink"
  | "dark"
  | "soft"
  | "card"
  | "paper"
  | "success"
  | "warn"
  | "danger"
  | "sec"
  | "chip"
  | "glass";

interface LabelProps {
  ctx: RenderContext;
  text: string;
  tone?: Tone;
  icon?: IconName;
  className?: string;
  editPath?: string;
}

/** Small label pill (“Le plus choisi”, “N°07”): label face, tracked caps in Latin, plain in Arabic. */
export function Badge({ ctx, text, tone = "ink", icon, className, editPath }: LabelProps): ReactElement | null {
  if (!text.trim()) return null;
  return (
    <span className={cx("lp-badge", `lp-tone-${tone}`, className)}>
      {icon ? <Icon name={icon} size="1.1em" strokeWidth={2} /> : null}
      <RichText as="span" text={text} ctx={ctx} decorate={false} editPath={editPath} />
    </span>
  );
}

/** Crisp rounded chip with an optional icon (ingredients, trust points, city names). */
export function Chip({
  ctx,
  text,
  tone = "chip",
  icon,
  size = "m",
  className,
  editPath,
}: LabelProps & { size?: "s" | "m" }): ReactElement | null {
  if (!text.trim()) return null;
  return (
    <span className={cx("lp-chip", size === "s" && "lp-chip--s", `lp-tone-${tone}`, className)}>
      {icon ? <Icon name={icon} size="1.2em" /> : null}
      <RichText as="span" text={text} ctx={ctx} decorate={false} editPath={editPath} />
    </span>
  );
}

/**
 * Sticker shapes. v2 has no die-cut outlines: `pill` and `label` are clean chips, `circle` a round
 * disc for a short figure (“−30%”). `burst` and `scallop` are kept for saved pages and render as
 * the circle. No sticker sets its text on a path or turns it out of the line (design.md DES-§4.5.4 Badge, S17, RTL3):
 * the primitives draw no textPath ring, and Arabic is never on a path, with or without a look.
 */
export type StickerShape = "burst" | "scallop" | "circle" | "pill" | "label";

export interface StickerProps extends LabelProps {
  /** seed key for the rotation (stable per placement, e.g. "hero-sticker-1") */
  rotateKey?: string;
  shape?: StickerShape;
  size?: "s" | "m" | "l";
  /** rotation multiplier inside the archetype's tilt range (0 = straight) */
  tilt?: number;
  /** entrance (e.g. "stamp" = a springy pop); none by default */
  reveal?: RevealKind | false;
  delay?: number;
}

/**
 * Sticker — a crisp pill/disc that floats over media or a card edge: solid tone, soft lifted
 * shadow, 1px inner highlight, a slight seeded tilt inside the archetype's range (same key → same
 * angle on every render; straight archetypes stay straight).
 */
export function Sticker({
  ctx,
  text,
  tone = "pop",
  icon,
  rotateKey,
  shape = "pill",
  size = "m",
  tilt = 1,
  className,
  editPath,
  reveal: rv,
  delay,
}: StickerProps): ReactElement | null {
  if (!text.trim()) return null;
  const rot = tilt === 0 ? 0 : seededRotation(ctx, `sticker:${rotateKey ?? text}`, tilt);
  const look = shape === "burst" || shape === "scallop" ? "circle" : shape;
  return (
    <span
      className={cx("lp-diecut", `lp-diecut--${look}`, `lp-diecut--${size}`, `lp-tone-${tone}`, className)}
      data-shape={look}
      style={cssVars({ "--rot": `${rot}deg` })}
      {...reveal(rv, delay)}
    >
      <span className="lp-diecut__text">
        {icon ? <Icon name={icon} size="1.15em" strokeWidth={2} /> : null}
        <RichText as="span" text={text} ctx={ctx} decorate={false} editPath={editPath} />
      </span>
    </span>
  );
}
