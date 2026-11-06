/**
 * The 7-day views line of a page row (LAN-§15.2; docs/STORE-SAAS.md §I.8 rule 3: a sparkline only with ≥ 7 points).
 * A plain SVG path in the brand ink with a faint area under it; the last day gets a small end mark. No axis, no
 * motion beyond the row's own. Fewer than 7 points render nothing (the caller shows its note).
 */
import { cn } from "@/lib/utils";

export const SPARK_MIN_POINTS = 7;

export function Sparkline({ points, label, className, width = 96, height = 28 }: { points: readonly number[] | null; label: string; className?: string; width?: number; height?: number }) {
  if (!points || points.length < SPARK_MIN_POINTS) return null;
  const max = Math.max(1, ...points);
  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1]![0].toFixed(1)} ${height - pad} L${pad} ${height - pad} Z`;
  const [lx, ly] = xy[xy.length - 1]!;
  return (
    // the time axis runs left to right in every language (SVG coordinates are not mirrored, core §I.5 allow-list)
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("shrink-0 overflow-visible text-brand", className)}>
      <path d={area} fill="currentColor" opacity={0.08} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2.25} fill="currentColor" />
    </svg>
  );
}
