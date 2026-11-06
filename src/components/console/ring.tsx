/**
 * A score ring for console lists and cards (platform.md PLA-§3.5 "score ring (24 px …)", §6.1 "24 px ring", the queue
 * detail's 56 px ring): the number inside in tabular numerals, the arc filled to the score and stroked by its tint.
 * Decorative to assistive technology: the row or card next to it says the band or the components in words.
 *
 *   <ScoreRing score={62} tint={bandTint("hold")} size={24} />
 *
 * The 24 px size is the console's own: P2's `HealthRing` takes 40 / 56 / 96 (PLA-§22.12; CCR r1-p1-10 item 1).
 */
import { cn } from "@/lib/utils";
import { TINT_STROKE, type Tint } from "./tints";

const STROKE: Record<24 | 32 | 56, number> = { 24: 2.25, 32: 2.5, 56: 4 };
const FONT: Record<24 | 32 | 56, string> = { 24: "text-[9.5px]", 32: "text-[11px]", 56: "text-[17px]" };

export function ScoreRing({ score, tint, size, title, className }: { score: number; tint: Tint; size: 24 | 32 | 56; title?: string; className?: string }) {
  const sw = STROKE[size];
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score));
  return (
    <span title={title} aria-hidden={title ? undefined : true} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90 rtl:scale-y-[-1]" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw} stroke="var(--c-hairline)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={sw} stroke={TINT_STROKE[tint]} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className={cn("num relative leading-none font-semibold tracking-[-0.02em]", FONT[size])}>{score}</span>
    </span>
  );
}
