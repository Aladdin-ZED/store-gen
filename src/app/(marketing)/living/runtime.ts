/**
 * The homepage's client runtime (spec §5.5). No React, no dependency. It boots after `load` plus an idle callback,
 * only animates the server-rendered markup (it builds no DOM), and keeps every model's SSR final frame as the truth:
 *
 * - reveals: section heads below the fold are armed (data-armed) and shown once (data-in), opacity only when reduced;
 * - once models: armed when off-screen at boot (a model already visible stays final and never rewinds), played once
 *   at their threshold by CSS transitions on [data-in] plus the WAAPI extras of ./controllers.ts;
 * - loops (hero, console, route without ViewTimeline): at most one runs, the most visible at ≥ 35 %; a hidden tab,
 *   Save-Data, reduced motion or the Pause control stop them;
 * - the route is scroll-linked (ViewTimeline) when the browser can, text never is;
 * - Pause motion (WCAG 2.2.2): html[data-motion=off] + localStorage "sg-motion"; everything settles to its final frame;
 * - the hero's pointer depth: four layer offsets lerped per frame, fine pointers from 1024 px only.
 */
import { animLoop, consoleAnims, loomLoop, onceExtras, routeAnims, type Loop } from "./controllers";

type Conn = { saveData?: boolean };

export function boot(): () => void {
  let dispose: (() => void) | null = null;
  let cancelled = false;
  let idleId = 0;
  const go = () => {
    if (!cancelled) dispose = start();
  };
  const idle = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    idleId = ric ? ric(go, { timeout: 1500 }) : window.setTimeout(go, 200);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", idle);
    const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (cic) cic(idleId);
    else clearTimeout(idleId);
    dispose?.();
  };
}

function start(): () => void {
  const html = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const off = () => html.dataset.motion === "off";
  const motion = () => !reduce.matches && !off();
  const saveData = (navigator as Navigator & { connection?: Conn }).connection?.saveData === true;
  const vh = () => window.innerHeight || html.clientHeight;
  const onScreen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh();
  };
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document | Window, type: K | string, fn: (e: Event) => void) => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };

  /* reveals ------------------------------------------------------------ */
  const reveals = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  const show = (el: HTMLElement) => {
    if (el.dataset.armed === undefined) return;
    delete el.dataset.armed;
    el.dataset.in = "";
  };
  const rio = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          show(e.target as HTMLElement);
          rio.unobserve(e.target);
        }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  if (!off())
    for (const el of reveals)
      if (!onScreen(el)) {
        el.dataset.armed = "";
        rio.observe(el);
      }

  /* once models -------------------------------------------------------- */
  const extras: Animation[] = [];
  const timers: number[] = [];
  const play = (el: HTMLElement) => {
    if (el.dataset.armed === undefined) return;
    delete el.dataset.armed;
    el.dataset.in = "";
    if (motion()) extras.push(...onceExtras(el));
    timers.push(window.setTimeout(() => delete el.dataset.in, Number(el.dataset.dur || 2400) + 400));
  };
  const onces = Array.from(document.querySelectorAll<HTMLElement>('[data-model][data-kind="once"]'));
  if (motion()) for (const el of onces) if (!onScreen(el)) el.dataset.armed = "";

  /* loops -------------------------------------------------------------- */
  type Entry = { el: HTMLElement; ctl: Loop; ratio: number };
  const loops: Entry[] = [];
  let active: Loop | null = null;
  const loom = document.querySelector<HTMLElement>('[data-model="loom"]');
  if (loom) loops.push({ el: loom, ctl: loomLoop(loom, Math.max(1200, 7000 - performance.now())), ratio: onScreen(loom) ? 1 : 0 });
  const cons = document.querySelector<HTMLElement>('[data-model="console"]');
  if (cons) loops.push({ el: cons, ctl: animLoop(() => consoleAnims(cons)), ratio: 0 });
  const route = document.querySelector<HTMLElement>('[data-model="route"]');
  const scrollLinked = !!route && "ViewTimeline" in window;
  let routeScroll: Animation[] = [];
  const attachRoute = () => {
    if (route && scrollLinked && motion() && !routeScroll.length) routeScroll = routeAnims(route, "scroll");
  };
  const detachRoute = () => {
    routeScroll.forEach((a) => a.cancel());
    routeScroll = [];
  };
  if (route && !scrollLinked) loops.push({ el: route, ctl: animLoop(() => routeAnims(route, "loop")), ratio: 0 });
  attachRoute();

  const schedule = () => {
    if (!motion() || saveData || document.hidden) {
      active?.pause();
      active = null;
      return;
    }
    let best: Entry | null = null;
    for (const l of loops) if (l.ratio >= 0.35 && (!best || l.ratio > best.ratio)) best = l;
    const next = best?.ctl ?? null;
    if (next !== active) {
      active?.pause();
      active = next;
      active?.resume();
    }
  };

  const ratioOf = (e: IntersectionObserverEntry) => (e.isIntersecting ? Math.max(e.intersectionRatio, e.intersectionRect.height / Math.max(1, vh())) : 0);
  const mio = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const ratio = ratioOf(e);
        if (el.dataset.kind === "once") {
          if (ratio >= Number(el.dataset.at || 0.4)) {
            play(el);
            mio.unobserve(el);
          }
        } else {
          const l = loops.find((x) => x.el === el);
          if (l) l.ratio = ratio;
        }
      }
      schedule();
    },
    { threshold: [0, 0.2, 0.35, 0.4, 0.6, 0.8, 1] },
  );
  for (const el of onces) if (el.dataset.armed !== undefined) mio.observe(el);
  for (const l of loops) mio.observe(l.el);
  on(document, "visibilitychange", schedule);

  /* pointer depth (secondary detail 1) --------------------------------- */
  const panel = loom?.closest<HTMLElement>("[data-depth]");
  if (loom && panel && matchMedia("(pointer: fine) and (min-width: 1024px)").matches) {
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      loom.style.setProperty("--dx", x.toFixed(3));
      loom.style.setProperty("--dy", y.toFixed(3));
      raf = now - last < 1200 || Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    on(panel, "pointermove", (e) => {
      if (!motion()) return;
      const r = panel.getBoundingClientRect();
      const p = e as PointerEvent;
      tx = ((p.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((p.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    });
    on(panel, "pointerleave", () => {
      tx = 0;
      ty = 0;
      kick();
    });
    cleanups.push(() => cancelAnimationFrame(raf));
  }

  /* Pause motion ------------------------------------------------------- */
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-pause]"));
  const sync = () => buttons.forEach((b) => b.setAttribute("aria-pressed", off() ? "true" : "false"));
  const settleAll = () => {
    reveals.forEach(show);
    onces.forEach((el) => {
      if (el.dataset.armed !== undefined) play(el);
    });
    extras.forEach((a) => a.finish());
    active?.pause();
    active = null;
    loops.forEach((l) => l.ctl.settle());
    detachRoute();
    loom?.style.removeProperty("--dx");
    loom?.style.removeProperty("--dy");
  };
  const toggle = () => {
    if (off()) {
      delete html.dataset.motion;
      try {
        localStorage.removeItem("sg-motion");
      } catch {}
      attachRoute();
      schedule();
    } else {
      html.dataset.motion = "off";
      try {
        localStorage.setItem("sg-motion", "off");
      } catch {}
      settleAll();
    }
    sync();
  };
  for (const b of buttons) on(b, "click", toggle);
  sync();
  const onReduce = () => (reduce.matches ? settleAll() : schedule());
  reduce.addEventListener("change", onReduce);
  cleanups.push(() => reduce.removeEventListener("change", onReduce));
  if (off() || reduce.matches) settleAll();
  schedule();

  return () => {
    rio.disconnect();
    mio.disconnect();
    timers.forEach(clearTimeout);
    active?.pause();
    loops.forEach((l) => l.ctl.settle());
    detachRoute();
    extras.forEach((a) => a.cancel());
    cleanups.forEach((c) => c());
  };
}
