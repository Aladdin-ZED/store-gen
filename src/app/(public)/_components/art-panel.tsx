import { BrandMark } from "@/components/admin/shell/brand-mark";
import { cn } from "@/lib/utils";

/*
 * Art for the sign-in screens: "the stage". The brand mark's arch drawn as concentric hairline arches rising out of
 * the panel's lower edge, lit from inside by one product-tinted radial, with the order dot resting in it, over a
 * faint dot field. No grain and no mesh gradient (D60). Seeded by the UTC day, so the composition shifts slightly
 * from one day to the next but is stable within a day. Pure SVG, no client JS; the art is always dark.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Changes once per UTC day; the auth pages render per request, so this is read at request time. */
export function daySeed(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

interface Stage {
  cx: number;
  springY: number;
  baseY: number;
  arches: { d: string; opacity: number }[];
  innerR: number;
  dotY: number;
}

function buildStage(seed: number, full: boolean, width: number, height: number, rtl: boolean): Stage {
  const rand = mulberry32(seed);
  const along = full ? 0.7 + rand() * 0.06 : 0.8 + rand() * 0.06;
  // the stage sits at the inline end, so it mirrors with the page
  const cx = width * (rtl ? 1 - along : along);
  const baseY = height + 4;
  const innerR = full ? 112 + rand() * 16 : 46;
  const step = full ? 24 + rand() * 6 : 15;
  const count = full ? 8 : 7;
  const springY = full ? height * (0.6 + rand() * 0.05) : height * 0.62;
  const arches = Array.from({ length: count }, (_, i) => {
    const r = innerR + i * step;
    return {
      d: `M${r1(cx - r)},${baseY} V${r1(springY)} A${r1(r)},${r1(r)} 0 0 1 ${r1(cx + r)},${r1(springY)} V${baseY}`,
      // the innermost lines carry the light; the outer ones fade into the field
      opacity: r1(1 - (i / count) * 0.85),
    };
  });
  const dotY = springY + (baseY - springY) * (full ? 0.42 : 0.46);
  return { cx, springY, baseY, arches, innerR, dotY };
}

export function ArtPanel({
  variant,
  idPrefix,
  seed,
  brand,
  headline,
  footnote,
  rtl = false,
  className,
}: {
  variant: "full" | "band";
  idPrefix: string;
  /** composition seed (see daySeed) */
  seed: number;
  /** the platform brand (`platform.brand.name`) */
  brand: string;
  headline?: string;
  footnote?: [string, string];
  rtl?: boolean;
  className?: string;
}) {
  const full = variant === "full";
  const width = 720;
  const height = full ? 960 : 240;
  const stage = buildStage(seed * 2654435761, full, width, height, rtl);
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <aside
      aria-label={brand}
      className={cn(
        "relative isolate overflow-hidden bg-(--auth-ink) text-(--auth-paper)",
        full ? "flex-col justify-between border-e border-white/[0.07] p-10 xl:p-14" : "flex h-28 items-end px-6 pb-5 sm:px-10",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute inset-0 -z-10 size-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={full ? "xMidYMax slice" : rtl ? "xMinYMid slice" : "xMaxYMid slice"}
      >
        <defs>
          {/* the stage light: one tinted radial, ≤ 10 % at its edge (D60) */}
          <radialGradient id={id("light")} cx={stage.cx} cy={stage.dotY} r={stage.innerR * (full ? 3.2 : 3.6)} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: "var(--auth-glow)", stopOpacity: 0.42 }} />
            <stop offset="0.35" style={{ stopColor: "var(--auth-glow)", stopOpacity: 0.1 }} />
            <stop offset="1" style={{ stopColor: "var(--auth-glow)", stopOpacity: 0 }} />
          </radialGradient>
          {/* arch strokes are lit near the light and fall off toward the field */}
          <radialGradient id={id("stroke")} cx={stage.cx} cy={stage.dotY} r={stage.innerR * 4} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: "var(--auth-accent)", stopOpacity: 0.95 }} />
            <stop offset="0.45" style={{ stopColor: "var(--auth-paper)", stopOpacity: 0.28 }} />
            <stop offset="1" style={{ stopColor: "var(--auth-paper)", stopOpacity: 0.06 }} />
          </radialGradient>
          <radialGradient id={id("grid-fade")} cx={stage.cx} cy={stage.springY} r={full ? 620 : 420} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={id("grid-mask")}>
            <rect width={width} height={height} fill={`url(#${id("grid-fade")})`} />
          </mask>
          <pattern id={id("dots")} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.9" className="fill-(--auth-paper)" fillOpacity="0.16" />
          </pattern>
          <filter id={id("dot-glow")} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={full ? 10 : 6} />
          </filter>
        </defs>

        <rect width={width} height={height} className="fill-(--auth-ink)" />
        <rect width={width} height={height} fill={`url(#${id("dots")})`} mask={`url(#${id("grid-mask")})`} />
        <rect width={width} height={height} fill={`url(#${id("light")})`} />

        <g fill="none" stroke={`url(#${id("stroke")})`} strokeLinecap="round">
          {stage.arches.map((arch, i) => (
            <path key={i} d={arch.d} strokeWidth={i === 0 ? 1.6 : 1} strokeOpacity={arch.opacity} vectorEffect="non-scaling-stroke" />
          ))}
        </g>

        {/* the order dot, resting in the arch */}
        <circle cx={stage.cx} cy={stage.dotY} r={full ? 22 : 12} className="fill-(--auth-glow)" opacity="0.6" filter={`url(#${id("dot-glow")})`} />
        <circle cx={stage.cx} cy={stage.dotY} r={full ? 9 : 5} className="fill-(--auth-accent)" />
      </svg>

      <div className="flex items-center gap-2.5">
        <BrandMark tone="ink" />
        <span className="text-[0.95rem] leading-none font-semibold tracking-[-0.02em]">{brand}</span>
      </div>

      {full && headline && (
        <>
          <p className="max-w-[28rem] text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance xl:text-[2.85rem]">{headline}</p>
          {footnote && (
            <p className="flex items-center justify-between gap-6 text-xs text-(--auth-paper)/55">
              <span>{footnote[0]}</span>
              <span>{footnote[1]}</span>
            </p>
          )}
        </>
      )}
    </aside>
  );
}
