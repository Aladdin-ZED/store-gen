/**
 * Illustration & light system — v2 · modern (docs/DESIGN.md §7). Product-tinted light, precise
 * lines, clean vector shapes and modern section transitions. Pure components: same props → same
 * markup (no hooks, no Math.random). Styles: ./illustrations.css · Catalog: ./README.md
 */

/* core */
export { createRng, hashSeed, mulberry32, seededTilt, type Rng, type Seed } from "./core/rng";
export { estimateEm, hasArabic, illId, isolateNumbers, type Idle, type IllBase, type Tone, type Tone3 } from "./core/svg";
export type { Pt } from "./core/geom";

/* light & depth */
export {
  Beam,
  GlassChip,
  GlowOrb,
  Halo,
  Spotlight,
  type BeamOrigin,
  type BeamProps,
  type GlassChipProps,
  type GlowOrbProps,
  type HaloProps,
  type Intensity,
  type LightPlace,
  type SpotlightProps,
} from "./light";

/* precise lines */
export {
  CheckMark,
  CircleMark,
  CrossMark,
  DotGrid,
  GridLines,
  LeaderLine,
  Rings,
  Sparkline,
  SpeedLines,
  Swoosh,
  type CircleMarkProps,
  type CircleVariant,
  type DotGridProps,
  type Fade,
  type GridLinesProps,
  type LeaderEnd,
  type LeaderLineProps,
  type MarkFrame,
  type RingsProps,
  type SparklineProps,
  type SpeedLinesProps,
  type SwooshProps,
  type SwooshVariant,
  type TickProps,
} from "./lines";

/* badge, glyphs, shapes */
export { Badge, type BadgeProps, type BadgeVariant } from "./badge";
export { Glyph, glyph, GLYPH_KINDS, Sparkle, sparkD, type GlyphKind, type GlyphProps, type SparkleProps } from "./glyphs";
export { Shape3D, Sticker, type Shape3DKind, type Shape3DProps, type StickerProps, type StickerShape } from "./shapes";
export { Leaf, type LeafProps, type LeafVariant } from "./botanical";
export { Pictogram, PICTOGRAM_KINDS, pickPictogram, type PictogramKind, type PictogramProps } from "./pictograms";

/* Moroccan geometry & arch masks */
export { ArchClip, ArchFrame, archPath, ZelligeLines, type ArchFrameProps, type ArchKind, type ArchPathOpts, type Keyline, type ZelligeLinesProps } from "./moroccan";

/* measurement */
export { Dimension, Ruler, type DimensionProps, type RulerProps } from "./measure";

/* section transitions */
export { Divider, type DividerProps, type DividerSize } from "./dividers";

/* v1 names, re-implemented in the modern style (see README → "Renamed in v2") */
export {
  BlueprintGrid,
  Botanical,
  Doodle,
  HandArrow,
  HandCheck,
  HandCross,
  LeafSprig,
  Pattern,
  PriceTag,
  Rays,
  ScribbleUnderline,
  Squiggle,
  Stamp,
  Tape,
  type ArrowHead,
  type ArrowTail,
  type BlueprintGridProps,
  type BotanicalProps,
  type BotanicalVariant,
  type DoodleKind,
  type DoodleProps,
  type HandArrowProps,
  type HandTickProps,
  type LeafSprigProps,
  type PatternFade,
  type PatternKind,
  type PatternProps,
  type PriceTagProps,
  type RaysProps,
  type RaysVariant,
  type ScribbleUnderlineProps,
  type SprigVariant,
  type SquiggleProps,
  type SquiggleVariant,
  type StampProps,
  type StampVariant,
  type TapeCorner,
  type TapeProps,
  type TapeVariant,
  type TickFrame,
  type UnderlineVariant,
} from "./compat";
