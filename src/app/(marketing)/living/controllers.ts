/**
 * Per-model animation builders for the homepage runtime (./runtime.ts, spec §5). WAAPI only, on the SSR markup the
 * server components render (no DOM is built, no React state is touched), compositor-friendly properties only
 * (transform, opacity, stroke-dashoffset). Most "once" models play by CSS transitions keyed on [data-in]; this file
 * holds what CSS can't do: travel along sampled paths (data-pts, no offset-path), the hero's direction loop with its
 * shared-element FLIP, the console's call loop and the route's scroll-linked or looping lap.
 *
 * Curves mirror src/lib/theme/archetypes.ts EASE: expoOut for arrivals and settles, inOut ("machine") for travel.
 */

export const EXPO = "cubic-bezier(.16,1,.3,1)"; // EASE.expoOut
export const MACHINE = "cubic-bezier(.65,0,.35,1)"; // EASE.inOut

export interface Loop {
  /** start or continue */
  resume(): void;
  pause(): void;
  /** stop for good and show the final frame (motion off) */
  settle(): void;
}

type Pt = [number, number];
type Frames = [number, Keyframe][];

export const parsePts = (s: string | undefined): Pt[] =>
  (s ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.split(",").map(Number) as Pt);

/** The model's variant on screen (the other one is display:none through @container). */
export function visibleSvg(root: Element): SVGSVGElement | null {
  for (const s of Array.from(root.querySelectorAll<SVGSVGElement>("svg[data-v]"))) if (s.getBoundingClientRect().width > 0) return s;
  return null;
}

/** Time (0..1) at which the machine curve reaches progress u: travel offsets carry the easing themselves. */
function invMachine(u: number): number {
  const B = (s: number, p1: number, p2: number) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (B(m, 0, 1) < u) lo = m;
    else hi = m;
  }
  return B((lo + hi) / 2, 0.65, 0.35);
}

/** Keyframes from timed partial frames: every frame carries every property (carried forward), offsets in 0..1. */
function keyframes(D: number, frames: Frames): Keyframe[] {
  const sorted = [...frames].sort((a, b) => a[0] - b[0]);
  const cur: Record<string, string | number> = {};
  for (const [, k] of sorted) for (const p of Object.keys(k)) if (!(p in cur)) cur[p] = k[p] as string | number;
  const out = sorted.map(([ms, k]) => {
    Object.assign(cur, k);
    return { ...cur, offset: Math.min(1, Math.max(0, ms / D)) } as Keyframe;
  });
  if (out[0].offset !== 0) out.unshift({ ...out[0], offset: 0 });
  if (out[out.length - 1].offset !== 1) out.push({ ...out[out.length - 1], offset: 1 });
  return out;
}

/* ------------------------------------------------------------------ */
/* hero: the genome loom                                               */
/* ------------------------------------------------------------------ */

const rectOf = (s: string | undefined) => {
  const [x, y, w, h] = (s ?? "0 0 1 1").split(" ").map(Number);
  return { x, y, w: w || 1, h: h || 1 };
};
type R = ReturnType<typeof rectOf>;
/** maps rect q onto rect p, in the element's own user space (transform-origin 0 0) */
const fit = (p: R, q: R) => `translate(${p.x}px, ${p.y}px) scale(${p.w / q.w}, ${p.h / q.h}) translate(${-q.x}px, ${-q.y}px)`;

export function loomLoop(root: HTMLElement, firstDelay: number): Loop {
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const order = radios.map((r) => r.value);
  let last = radios.find((r) => r.checked)?.value ?? order[0];
  let timer = 0;
  let running = false;
  let hold = false;
  let manual = false;
  let settled = false;
  let started = false;
  let anims: Animation[] = [];

  const add = (el: Element | null, kf: Keyframe[], opt: KeyframeAnimationOptions) => {
    if (el) anims.push(el.animate(kf, opt));
  };

  function transition(from: string, to: string) {
    const svg = visibleSvg(root);
    if (!svg || from === to || settled) return;
    anims = anims.filter((a) => a.playState !== "finished");
    const q = (s: string) => svg.querySelector(s);
    // shared-element FLIP of the media, title and swatch blocks
    for (const n of [1, 2, 3]) {
      const a = q(`[data-sl="frame"][data-state="${from}"] [data-r][data-b="${n}"]`) as SVGElement | null;
      const b = q(`[data-sl="frame"][data-state="${to}"] [data-r][data-b="${n}"]`) as SVGElement | null;
      if (!a || !b) continue;
      const ra = rectOf(a.dataset.r);
      const rb = rectOf(b.dataset.r);
      add(b, [{ transform: fit(ra, rb) }, { transform: "none" }], { duration: 900, delay: 200, easing: EXPO, fill: "backwards" });
      add(a, [{ transform: "none" }, { transform: fit(rb, ra) }], { duration: 900, delay: 200, easing: EXPO });
    }
    // the genes whose value changes: chip highlight, then their trace redraws
    const vals = (s: string) => Array.from(svg.querySelectorAll(`[data-sl="rail"][data-state="${s}"] [data-g]`)).map((e) => [(e as SVGElement).dataset.g, e.textContent] as const);
    const before = new Map(vals(from));
    let k = 0;
    for (const [g, v] of vals(to)) {
      if (!g || before.get(g) === v) continue;
      add(q(`[data-hl="${g}"]`), [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1100, delay: 80 * k });
      add(q(`[data-tr="${g}"]`), [{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.7 }, { strokeDashoffset: 0, opacity: 0.35 }], { duration: 700, delay: 80 * k, easing: EXPO, fill: "backwards" });
      k++;
    }
    svg.querySelectorAll(`[data-sl="frame"][data-state="${to}"] [data-tg] rect`).forEach((r, i) => {
      add(r, [{ opacity: 0 }, { opacity: 1, offset: 0.33 }, { opacity: 0 }], { duration: 600, delay: 200 + 40 * i });
    });
    // proof: the scan re-sweeps the frame and the three gates re-check
    add(q("[data-scan]"), [{ transform: "translateY(0px)", opacity: 1 }, { transform: "translateY(530px)", opacity: 1, offset: 0.94 }, { transform: "translateY(552px)", opacity: 0 }], { duration: 900, delay: 1200 });
    for (const g of [0, 1, 2]) {
      const at = 1200 + 900 * (0.246 + 0.101 * g); // the scan reaches gate g's centre (GATE_Y + 20 + 56g in the 552 frame)
      add(q(`[data-gc="${g}"]`), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 220, delay: at, easing: EXPO, fill: "backwards" });
      add(q(`[data-gb="${g}"]`), [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 600, delay: at });
    }
    last = to;
  }

  function next() {
    const i = order.indexOf(last);
    const to = order[(i + 1) % order.length];
    const r = radios.find((x) => x.value === to);
    if (r) r.checked = true; // CSS :has() swaps the state; focus never moves
    transition(last, to);
  }

  function arm(delay: number) {
    clearTimeout(timer);
    if (!running || hold || manual || settled) return;
    timer = window.setTimeout(() => {
      next();
      arm(7000);
    }, delay);
  }

  const onChange = (e: Event) => {
    manual = true; // a visitor's choice stops the auto-advance for the visit
    clearTimeout(timer);
    transition(last, (e.target as HTMLInputElement).value);
  };
  const onEnter = () => {
    hold = true;
    clearTimeout(timer);
  };
  const onLeave = () => {
    hold = false;
    arm(2000);
  };
  radios.forEach((r) => r.addEventListener("change", onChange));
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusin", onEnter);
  root.addEventListener("focusout", onLeave);

  return {
    resume() {
      if (settled || running) return;
      running = true;
      anims.forEach((a) => a.playState === "paused" && a.play());
      arm(started ? 4000 : firstDelay);
      started = true;
    },
    pause() {
      running = false;
      clearTimeout(timer);
      anims.forEach((a) => a.playState === "running" && a.pause());
    },
    settle() {
      this.pause();
      settled = true;
      anims.forEach((a) => a.cancel());
      anims = [];
    },
  };
}

/* ------------------------------------------------------------------ */
/* route: one lap on a 0..1 progress, scroll-linked or a 9 s loop      */
/* ------------------------------------------------------------------ */

type ViewTimelineCtor = new (o: { subject: Element; axis?: string }) => AnimationTimeline;

export function routeAnims(root: HTMLElement, mode: "scroll" | "loop"): Animation[] {
  const svg = visibleSvg(root);
  const tokenEl = svg?.querySelector<SVGGElement>("[data-token]");
  if (!svg || !tokenEl) return [];
  const P = parsePts(tokenEl.dataset.token);
  const stops = (tokenEl.dataset.stops ?? "0 1").split(" ").map(Number);
  const n = P.length;
  const end = P[n - 1];
  const at = (u: number): Pt => {
    const i = Math.min(n - 2, Math.floor(u * (n - 1)));
    const t = u * (n - 1) - i;
    return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
  };
  const D = 9000;
  const dwell = 500;
  const tail = mode === "loop" ? 1500 : 0;
  const fade = mode === "loop" ? 400 : 0;
  const legs = stops.length - 1;
  const leg = (D - dwell * stops.length - tail) / legs;
  const arrive = stops.map((_, i) => i * (dwell + leg));
  // (time, progress) along the path: dwell at each station, the machine curve on every leg
  const track: [number, number][] = [];
  for (let i = 0; i < stops.length; i++) {
    track.push([arrive[i], stops[i]], [arrive[i] + dwell, stops[i]]);
    if (i === legs) break;
    for (let j = 1; j < n - 1; j++) {
      const u = j / (n - 1);
      if (u <= stops[i] || u >= stops[i + 1]) continue;
      const v = (u - stops[i]) / (stops[i + 1] - stops[i]);
      track.push([arrive[i] + dwell + invMachine(v) * leg, u]);
    }
  }
  track.push([D, 1]);
  const move: Frames = track.map(([ms, u]) => {
    const [x, y] = at(u);
    return [ms, { transform: `translate(${(x - end[0]).toFixed(2)}px, ${(y - end[1]).toFixed(2)}px)` }];
  });
  const shown = (lit: number): Frames =>
    mode === "loop"
      ? [
          [0, { opacity: lit }],
          [200, { opacity: 1 }],
          [D - fade, { opacity: 1 }],
          [D, { opacity: 0 }],
        ]
      : [
          [0, { opacity: lit }],
          [200, { opacity: 1 }],
          [D, { opacity: 1 }],
        ];
  const anims: [Element | null, Frames][] = [
    [tokenEl, [...move, ...((mode === "loop" ? [[0, { opacity: 0 }], [200, { opacity: 1 }], [D - fade, { opacity: 1 }], [D, { opacity: 0 }]] : [[0, { opacity: 1 }]]) as Frames)]],
    [svg.querySelector("[data-travel]"), [...track.map(([ms, u]): [number, Keyframe] => [ms, { strokeDashoffset: 1 - u }]), ...(mode === "loop" ? ([[D - fade, { strokeDashoffset: 0, opacity: 1 }], [D, { strokeDashoffset: 0, opacity: 0 }]] as Frames) : [])]],
  ];
  const trail = svg.querySelector<SVGPathElement>("[data-trail]");
  if (trail) {
    const L = Number(trail.dataset.trail) || 1;
    anims.push([trail, [...track.map(([ms, u]): [number, Keyframe] => [ms, { strokeDashoffset: 48 - u * L, opacity: 1 }]), [D - Math.max(fade, 300), { opacity: 1 }], [D, { opacity: 0 }]]]);
  }
  svg.querySelectorAll<SVGGElement>("[data-on]").forEach((g) => {
    const i = Number(g.dataset.on);
    const a = arrive[i] ?? 0;
    const f: Frames = i === 0 ? shown(0) : [[0, { opacity: 0 }], [a, { opacity: 0 }], [a + 220, { opacity: 1 }], ...(mode === "loop" ? ([[D - fade, { opacity: 1 }], [D, { opacity: 0 }]] as Frames) : ([[D, { opacity: 1 }]] as Frames))];
    anims.push([g, f]);
  });
  // a lap that loops on its own clock, or the route's own scroll range
  const VT = (window as unknown as { ViewTimeline?: ViewTimelineCtor }).ViewTimeline;
  const opts: KeyframeAnimationOptions =
    mode === "scroll" && VT
      ? ({ timeline: new VT({ subject: root }), rangeStart: "entry 50%", rangeEnd: "contain 90%", fill: "both", duration: "auto" } as unknown as KeyframeAnimationOptions)
      : { duration: D, iterations: Infinity, fill: "both" };
  return anims.filter(([el]) => el).map(([el, f]) => (el as Element).animate(keyframes(D, f), opts));
}

/* ------------------------------------------------------------------ */
/* console: three 6.4 s calls in one 19.2 s lap (the third: call back) */
/* ------------------------------------------------------------------ */

export function consoleAnims(root: HTMLElement): Animation[] {
  const svg = root.querySelector<SVGSVGElement>('svg[data-v="wide"]');
  if (!svg || svg.getBoundingClientRect().width === 0) return [];
  const q = (s: string) => svg.querySelector<SVGElement>(s);
  const C = 6400;
  const D = 3 * C;
  const card = q("[data-card]");
  const from = card?.dataset.from ?? "none";
  const toCb = card?.dataset.cb ?? "none";
  const exit = card?.dataset.exit ?? "none";
  const hand = q("[data-hand]");
  const F: Record<string, Frames> = { q0: [], q1: [], q2: [], q3: [], card: [], hl: [], ok: [], okFill: [], cb: [], cbFill: [], hand: [] };
  for (let c = 0; c < 3; c++) {
    const b = c * C;
    const callback = c === 2;
    F.q0.push([b, { transform: "translateY(0px)", opacity: 1 }], [b + 240, { transform: "translateY(-4px)", opacity: 1 }], [b + 241, { transform: "translateY(-4px)", opacity: 0 }], [b + 4100, { transform: "translateY(0px)", opacity: 0 }], [b + 4101, { transform: "translateY(0px)", opacity: 1 }]);
    for (const k of [1, 2, 3]) {
      const fr: Frames = [
        [b + 3800, { transform: "translateY(0px)", opacity: 1 }],
        [b + 4100, { transform: "translateY(-44px)", opacity: 1 }],
        [b + 4101, { transform: "translateY(0px)", opacity: k === 3 ? 0 : 1 }],
        [b + 4400, { transform: "translateY(0px)", opacity: 1 }],
      ];
      F[`q${k}`].push([b, { transform: "translateY(0px)", opacity: 1 }], ...fr);
    }
    F.card.push(
      [b, { transform: from, opacity: 0 }],
      [b + 240, { transform: from, opacity: 0 }],
      [b + 241, { transform: from, opacity: 1 }],
      [b + 840, { transform: "none", opacity: 1 }],
      [b + 3400, { transform: "none", opacity: 1 }],
      ...((callback
        ? [
            [b + 4000, { transform: toCb, opacity: 1 }],
            [b + 5800, { transform: toCb, opacity: 1 }],
            [b + 6200, { transform: toCb, opacity: 0 }],
          ]
        : [
            [b + 3800, { transform: exit, opacity: 0 }],
            [b + 3801, { transform: from, opacity: 0 }],
          ]) as Frames),
    );
    F.hl.push([b, { transform: "translateY(64px)" }], [b + 840, { transform: "translateY(-32px)" }], [b + 1540, { transform: "translateY(0px)" }], [b + 2240, { transform: "translateY(32px)" }], [b + 2940, { transform: "translateY(64px)" }]);
    const press = (key: "ok" | "cb", fill: "okFill" | "cbFill", on: boolean) => {
      F[key].push([b, { transform: "scale(1)" }], ...((on ? [[b + 2940, { transform: "scale(0.97)" }], [b + 3120, { transform: "scale(1)" }]] : []) as Frames));
      F[fill].push([b, { opacity: 0 }], ...((on ? [[b + 2940, { opacity: 0 }], [b + 3140, { opacity: 1 }], [b + 6000, { opacity: 1 }], [b + 6300, { opacity: 0 }]] : []) as Frames));
    };
    press("ok", "okFill", !callback);
    press("cb", "cbFill", callback);
    F.hand.push([b, { transform: "rotate(0deg)" }], ...((callback ? [[b + 3400, { transform: "rotate(0deg)" }], [b + 4000, { transform: "rotate(90deg)" }], [b + 6000, { transform: "rotate(90deg)" }], [b + 6400, { transform: "rotate(0deg)" }]] : []) as Frames));
  }
  const els: Record<string, SVGElement | null> = {
    q0: q('[data-q="0"]'),
    q1: q('[data-q="1"]'),
    q2: q('[data-q="2"]'),
    q3: q('[data-q="3"]'),
    card,
    hl: q("[data-hlline]"),
    ok: q('[data-o="confirmed"]'),
    okFill: q('[data-fill="confirmed"]'),
    cb: q('[data-o="callback"]'),
    cbFill: q('[data-fill="callback"]'),
    hand,
  };
  if (hand) hand.style.transformOrigin = hand.dataset.hand ?? "";
  const ease: Record<string, string> = { card: EXPO, hl: EXPO, q1: EXPO, q2: EXPO, q3: EXPO, hand: EXPO };
  return Object.entries(els)
    .filter(([, el]) => el)
    .map(([k, el]) => {
      const kfs = keyframes(D, F[k]).map((f) => ({ ...f, easing: ease[k] ?? "linear" }));
      return (el as SVGElement).animate(kfs, { duration: D, iterations: Infinity, fill: "both" });
    });
}

/** A loop built from a set of animations (created on first resume). */
export function animLoop(build: () => Animation[]): Loop {
  let anims: Animation[] | null = null;
  return {
    resume() {
      if (!anims) anims = build();
      else anims.forEach((a) => a.play());
    },
    pause() {
      anims?.forEach((a) => a.pause());
    },
    settle() {
      anims?.forEach((a) => a.cancel());
      anims = null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* once models: what CSS transitions can't do                          */
/* ------------------------------------------------------------------ */

function travel(el: Element, pts: Pt[], delay: number, duration: number): Animation {
  return el.animate(
    pts.map(([x, y], i) => ({ transform: `translate(${x}px, ${y}px)`, opacity: i === 0 || i === pts.length - 1 ? 0 : 1 })),
    { delay, duration, easing: MACHINE, fill: "none" },
  );
}

export function onceExtras(root: HTMLElement): Animation[] {
  const svg = visibleSvg(root);
  if (!svg) return [];
  const out: Animation[] = [];
  if (root.dataset.model === "ledger") {
    const tok = svg.querySelector<SVGElement>("[data-token]");
    if (tok) out.push(travel(tok, parsePts(tok.dataset.token), 2000, 1200));
  }
  if (root.dataset.model === "dock") {
    const tiles = Array.from(svg.querySelectorAll("[data-tile]"));
    svg.querySelectorAll<SVGElement>("[data-pkt]").forEach((p, i) => {
      const delay = 1700 + 160 * i;
      out.push(travel(p, parsePts(p.dataset.pkt), delay, 700));
      if (tiles[i]) out.push(tiles[i].animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { delay: delay + 640, duration: 520 }));
    });
  }
  return out;
}
