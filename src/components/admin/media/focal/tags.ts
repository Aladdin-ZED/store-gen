/**
 * Focal-point values shared by the media API, the library and the builder (isomorphic, no React).
 *
 * Crops have two modes (src/lib/media/focus.ts): AUTO — an AssetRef without fx/fy, the renderer fits
 * every frame to the subject analysed at upload (AssetFocus: box, heads, hands, focal point); CUSTOM —
 * fx/fy set by the team, every frame centres on that point.
 *
 * The library can hold a team default point per image, kept in its tags as "focal:<x>,<y>" (0..1,
 * three decimals) — the same convention as the default alt text ("alt:<text>"), no schema change.
 * Placing the image on a page pre-fills fx/fy from it; without one, placements start in auto.
 */
import type { AssetFocus } from "@/lib/media/focus";
import type { FocalPoint } from "./frames";

export const FOCAL_TAG_PREFIX = "focal:";

const TAG_RE = /^focal:(0(?:\.\d{1,4})?|1(?:\.0{1,4})?),(0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/;

export const round3 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

export function roundFocal(p: FocalPoint): FocalPoint {
  return { x: round3(p.x), y: round3(p.y) };
}

export function focalTag(p: FocalPoint): string {
  const r = roundFocal(p);
  return `${FOCAL_TAG_PREFIX}${r.x.toFixed(3)},${r.y.toFixed(3)}`;
}

export function focalFromTags(tags: readonly string[] | null | undefined): FocalPoint | null {
  const tag = tags?.find((t) => t.startsWith(FOCAL_TAG_PREFIX));
  const m = tag ? TAG_RE.exec(tag) : null;
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/** Tags with the focal tag replaced (or removed with null). */
export function withFocalTag(tags: readonly string[] | null | undefined, p: FocalPoint | null): string[] {
  const rest = (tags ?? []).filter((t) => !t.startsWith(FOCAL_TAG_PREFIX));
  return p ? [...rest, focalTag(p)] : rest;
}

/** Same point within half a percent (what the eye can't tell apart in a crop). */
export function sameFocal(a: FocalPoint | null | undefined, b: FocalPoint | null | undefined, eps = 0.005): boolean {
  return !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

/** What GET /api/app/<handle>/media/[id] answers for an image. */
export interface FocalInfo {
  id: string;
  width: number;
  height: number;
  alpha: boolean;
  /** the subject analysis (null when the photo could not be analysed) */
  focus: AssetFocus | null;
  /** the team's default point in the library, if any */
  saved: FocalPoint | null;
}

/** Where the handle rests in auto mode: the analysed focal point (eyes level for people), else the centre. */
export function analysedFocal(focus: AssetFocus | null | undefined): FocalPoint {
  return focus ? { x: focus.x, y: focus.y } : { x: 0.5, y: 0.5 };
}
