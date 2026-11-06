import { CheckIcon } from "lucide-react";
import { BrandMark } from "@/components/admin/shell/brand-mark";
import { cn } from "@/lib/utils";

/*
 * The quiet brand panel of the sign-in screens (platform.md PLA-§22.1): the platform wordmark, one headline and three
 * value lines, over a few hairline arches (the brand mark's shape) at the panel's lower end. Flat strokes only: no
 * glow, no gradient wash, no stock imagery and no numbers (owner rule 4). Pure SVG, no client JS; always dark.
 */

/** The wordmark: the brand tile and the platform name (`platform.brand.name`). */
export function Wordmark({ brand, tone = "brand", className }: { brand: string; tone?: "brand" | "ink"; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark tone={tone} className="size-7 rounded-[9px]" />
      <span className="truncate text-[0.95rem] leading-none font-semibold tracking-[-0.02em]">{brand}</span>
    </span>
  );
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Concentric arches standing on the lower edge, centred near the inline end (mirrored in RTL). */
function arches(rtl: boolean) {
  const width = 720;
  const height = 960;
  const cx = width * (rtl ? 0.26 : 0.74);
  const baseY = height + 4;
  const springY = height * 0.66;
  return {
    width,
    height,
    cx,
    dotY: springY + (baseY - springY) * 0.44,
    paths: Array.from({ length: 7 }, (_, i) => {
      const r = 104 + i * 30;
      return {
        d: `M${r1(cx - r)},${baseY} V${r1(springY)} A${r},${r} 0 0 1 ${r1(cx + r)},${r1(springY)} V${baseY}`,
        opacity: r1(0.34 - i * 0.04),
      };
    }),
  };
}

export function BrandPanel({ brand, headline, values, rtl = false, className }: { brand: string; headline: string; values: [string, string, string]; rtl?: boolean; className?: string }) {
  const art = arches(rtl);
  return (
    <aside aria-label={brand} className={cn("relative isolate flex-col justify-between overflow-hidden bg-(--auth-ink) p-12 text-(--auth-paper) xl:p-16", className)}>
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 -z-10 size-full" viewBox={`0 0 ${art.width} ${art.height}`} preserveAspectRatio="xMidYMax slice">
        <g fill="none" className="stroke-(--auth-paper)" strokeLinecap="round">
          {art.paths.map((p, i) => (
            <path key={i} d={p.d} strokeWidth={1} strokeOpacity={p.opacity} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <circle cx={art.cx} cy={art.dotY} r={7} className="fill-(--auth-accent)" />
      </svg>

      <Wordmark brand={brand} tone="ink" />

      <div className="grid max-w-[30rem] gap-8 pb-[18vh]">
        <p className="text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.032em] text-balance xl:text-[2.6rem]">{headline}</p>
        <ul className="grid gap-3.5">
          {values.map((line) => (
            <li key={line} className="flex items-start gap-3 text-[0.95rem] leading-relaxed text-(--auth-paper)/72">
              <span aria-hidden="true" className="mt-[0.3rem] grid size-4 shrink-0 place-items-center rounded-full bg-white/[0.08] text-(--auth-accent)">
                <CheckIcon className="size-2.5" strokeWidth={3} />
              </span>
              <span className="text-pretty">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
