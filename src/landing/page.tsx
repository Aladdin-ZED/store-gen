/**
 * Page body: PageDoc sections → wrapped section elements with modern dividers between color changes
 * (curve · diagonal · steps · arch · wave · fade; none on "panels" pages).
 *
 *   <body>{renderPageBody(doc, ctx)}</body>
 *
 * Structure:  [skip link]  [leading "top" sections]  <main id="main" tabindex="-1">…</main>  [trailing "bottom" sections]  [floating]
 * The skip link (keyboard users jump past the announcement and header) is rendered only with a <main>.
 * Every in-flow section gets ONE root:
 *   <section id class="lp-section lp-<type> lp-<type>--<variant>" data-section data-variant data-bg data-space data-sid>
 * A section whose render() returns <SectionShell> as its root is absorbed into that root (the shell's
 * `as`, anchor, aria and className props are honored) — never nested inside a second wrapper.
 * Floating sections (sticky bar, WhatsApp bubble) render their own fixed root after the content.
 *
 * Sections are validated against their schema at render time (normalizeSection): unknown types are
 * skipped, invalid data is repaired from defaults, a section rendering null leaves no trace.
 * Pure: same doc + ctx → same markup (dividers are seeded).
 */
import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { Divider } from "./illustrations";
import { SectionShell, SkipLink, type SectionShellProps } from "./primitives";
import { cx } from "./primitives/util";
import type { RenderContext, SectionProps } from "./types";
import type { Divider as DividerKind, PageDoc, SectionBg, SectionInstance } from "@/lib/page/schema";
import { normalizeSection } from "@/lib/page/validate";
import { SAME_FIELD, themeTokens, themeTones } from "@/lib/generator/tones";
import { getArchetype, parseColor, toOklch } from "@/lib/theme";

export interface PageBodyOptions {
  /** section ids to leave out (e.g. sections that failed a server render probe) */
  skip?: ReadonlySet<string>;
  /** wraps each in-flow and floating section (admin preview: per-section error boundary) */
  guard?: (section: SectionInstance, node: ReactNode) => ReactNode;
  /** called when a section's render() throws; may return a replacement node (preview placeholder) */
  onError?: (section: SectionInstance, error: unknown) => ReactNode | void;
  /** a row after the last in-flow section and before the floating layers (the Shell's "Report this store" fallback) */
  after?: ReactNode;
}

/** DOM ids the document shell or runtime own; a section with such an id gets an "s-" prefix. */
const RESERVED_IDS = new Set(["order", "order-form", "lp-config", "main", "top"]);
const ORDER_SECTION = "orderForm";

/** Visual weight of a background — the divider edge grows out of the heavier block. */
const BG_WEIGHT: Record<SectionBg, number> = { base: 0, soft: 1, surface: 1, accent: 3, pop: 3, dark: 4 };

interface Planned {
  inst: SectionInstance;
  type: string;
  category: string;
  variant: string;
  element: ReactNode;
  /** effective background (a SectionShell root may override the instance's) */
  bg: SectionBg;
  /** DOM id of the section root (unique within the page) */
  anchor: string;
}

interface DividerPlan {
  kind: DrawnDivider;
  seed: string;
  flip: boolean;
}

export function sectionAnchor(inst: Pick<SectionInstance, "id" | "type">, requested?: string): string {
  if (inst.type === ORDER_SECTION) return "order";
  const id = requested && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(requested) ? requested : inst.id;
  return RESERVED_IDS.has(id) ? `s-${id}` : id;
}

type DrawnDivider = Exclude<DividerKind, "none">;

const drawn = (d: DividerKind): d is DrawnDivider => d !== "none";

/** The page's divider family: theme.dividers, else the archetype's own (both v2 kinds only). */
function dividerFamily(doc: PageDoc): DrawnDivider[] {
  const fromSpec = doc.theme.dividers.filter(drawn);
  return fromSpec.length ? fromSpec : getArchetype(doc.theme.archetype).dividers.filter(drawn);
}

/** "panels" pages float every section as an inset rounded panel: the page gap separates them, not an edge. */
export function pageSurfaces(doc: PageDoc): "flush" | "panels" {
  const s = doc.theme.surfaces;
  return s === "archetype" ? getArchetype(doc.theme.archetype).surfaces.kind : s;
}

/** Thin bands: a shaped edge against them would eat the band — they meet their neighbors with a clean cut. */
const STRIP_TYPES = new Set(["trustBar", "marquee"]);

/**
 * A fade only reads as light when its two grounds sit close in lightness (OKLab L): from a cream page
 * into a near-black block it draws a long muddy smear instead. Past this gap the edge is a shape.
 */
const FADE_MAX_DL = 0.25;
const LIGHT_BGS: ReadonlySet<SectionBg> = new Set(["base", "soft", "surface"]);

/** Lightness gap between two section grounds, from the theme's real colors (null: unknown). */
function lightnessGap(doc: PageDoc): (a: SectionBg, b: SectionBg) => number | null {
  const tokens = themeTokens(doc.theme, doc.locale);
  const cache = new Map<SectionBg, number | null>();
  const l = (bg: SectionBg): number | null => {
    if (!cache.has(bg)) {
      const hex = parseColor(tokens?.[`${bg}:sec-bg`] ?? "");
      cache.set(bg, hex ? toOklch(hex).l : null);
    }
    return cache.get(bg) ?? null;
  };
  return (a, b) => {
    const la = l(a);
    const lb = l(b);
    return la === null || lb === null ? null : Math.abs(la - lb);
  };
}

/**
 * Dividers drawn ABOVE each section (keyed by section id):
 *  - "panels" pages: never (the panels are separated by space and color; an explicit divider
 *    would only be hidden by CSS);
 *  - an explicit section.divider wins on "flush" pages ("none" = nothing);
 *  - "auto": only where the color really changes (two backgrounds that read as one field get no
 *    edge — it would show as a seam), never next to the top bar / header or a thin strip. Shaped
 *    edges mark the color moments: where a color block begins or ends a shape is likely, between
 *    two calm fields a plain cut is (space + color change). Never two plain cuts in a row, never the
 *    same shape as the previous drawn edge. A "fade" only between grounds close in lightness
 *    (ΔL < FADE_MAX_DL); across a bigger gap the next shape of the theme's list takes its place.
 *    Seeded per page.
 */
function planDividers(flow: readonly Planned[], doc: PageDoc, ctx: RenderContext): Map<string, DividerPlan> {
  const plan = new Map<string, DividerPlan>();
  if (pageSurfaces(doc) === "panels") return plan;
  const family = dividerFamily(doc);
  const tones = themeTones(doc.theme, doc.locale);
  const gap = lightnessGap(doc);
  const sameField = (a: SectionBg, b: SectionBg) => a === b || (!!tones && tones.dist(a, b) < SAME_FIELD);
  const thin = (p: Planned) => p.category === "top" || STRIP_TYPES.has(p.type);
  const strongEdge = (a: SectionBg, b: SectionBg) => (tones ? tones.strong(a) || tones.strong(b) : BG_WEIGHT[a] >= 3 || BG_WEIGHT[b] >= 3);
  // unknown colors: only the three light grounds count as close
  const fadeFits = (a: SectionBg, b: SectionBg) => {
    const d = gap(a, b);
    return d === null ? LIGHT_BGS.has(a) && LIGHT_BGS.has(b) : d < FADE_MAX_DL;
  };
  /** the drawn shape, or — for a fade across too big a lightness gap — the next one in the list */
  const fitShape = (shapes: readonly DrawnDivider[], i: number, a: SectionBg, b: SectionBg): DividerKind => {
    for (let k = 0; k < shapes.length; k++) {
      const s = shapes[(i + k) % shapes.length]!;
      if (s !== "fade" || fadeFits(a, b)) return s;
    }
    return "none";
  };
  let last: DividerKind | null = null;
  let lastDrawn: DrawnDivider | null = null;
  for (let i = 1; i < flow.length; i++) {
    const prev = flow[i - 1]!;
    const cur = flow[i]!;
    let kind: DividerKind | null = null;
    if (cur.inst.divider !== "auto") {
      kind = cur.inst.divider;
    } else if (!sameField(prev.bg, cur.bg) && !thin(prev) && !thin(cur)) {
      const rnd = ctx.rng(`divider:${prev.inst.id}>${cur.inst.id}`);
      // never the same shape as the previous drawn edge, plain cut or not in between
      const shapes: DrawnDivider[] = family.filter((k) => k !== lastDrawn);
      const plain: boolean = last !== "none" && (shapes.length === 0 || rnd() < (strongEdge(prev.bg, cur.bg) ? 0.25 : 0.6));
      kind = plain || shapes.length === 0 ? "none" : fitShape(shapes, Math.floor(rnd() * shapes.length), prev.bg, cur.bg);
    }
    if (kind === null) continue;
    last = kind;
    if (!drawn(kind)) continue;
    lastDrawn = kind;
    plan.set(cur.inst.id, {
      kind,
      seed: `${doc.theme.seed}:${cur.inst.id}`,
      flip: BG_WEIGHT[cur.bg] > BG_WEIGHT[prev.bg],
    });
  }
  return plan;
}

/* ------------------------------------------------------------------ */
/* Photo direction                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sections that hand out the product photos in list order, item by item (no frame scoring decides
 * which photo leads): the benefits media pool.
 */
const POOL_ORDERED = new Set(["benefits"]);
/** Sections that show no product photo of their own (bars, bands, text blocks): they do not separate two photo moments. */
const PHOTO_FREE = new Set(["announcement", "header", "trustBar", "marquee", "urgency", "faq"]);

const ownImages = (data: Record<string, unknown>): boolean =>
  Array.isArray(data.items) && data.items.some((it) => !!it && typeof it === "object" && !!(it as { image?: unknown }).image);

/**
 * The render context a section is drawn with. A pool-ordered section that comes right after the
 * hero (only bars and bands in between) would open on the very photo the hero just showed — the
 * same picture twice in one scroll. With two photos or more, its list is rotated so the hero's
 * lead photo comes last: the section opens on the next one and the page reads as one shoot, not
 * one picture repeated. Sections that pick photos by frame fit, and items with their own image,
 * are left alone; the page's product never changes (same photos, same order elsewhere).
 */
function photoContext(sections: readonly { inst: SectionInstance; data: Record<string, unknown> }[], at: number, ctx: RenderContext): RenderContext {
  const self = sections[at]!;
  const images = ctx.product.images;
  if (!POOL_ORDERED.has(self.inst.type) || images.length < 2 || ownImages(self.data)) return ctx;
  let p = at - 1;
  while (p >= 0 && PHOTO_FREE.has(sections[p]!.inst.type)) p--;
  const before = sections[p];
  if (!before || before.inst.type !== "hero") return ctx;
  const heroImage = before.data.image as { id?: unknown } | undefined;
  const lead = typeof heroImage?.id === "string" ? heroImage.id : images[0]!.id;
  const k = images.findIndex((ref) => ref.id === lead);
  if (k < 0) return ctx;
  const rotated = [...images.slice(k + 1), ...images.slice(0, k + 1)];
  return { ...ctx, product: { ...ctx.product, images: rotated } };
}

const shellProps = (element: ReactNode): SectionShellProps | null =>
  isValidElement(element) && element.type === SectionShell ? (element.props as SectionShellProps) : null;

/**
 * Unique DOM ids for the in-flow sections: the requested anchor (SectionShell `anchor`) or the
 * instance id; a collision (two sections asking for the same anchor, or an anchor equal to another
 * section's id) falls back to the instance id, then to a numbered variant.
 */
function assignAnchors(flow: Planned[]): void {
  const used = new Set<string>();
  for (const p of flow) {
    let id = sectionAnchor(p.inst, shellProps(p.element)?.anchor);
    if (used.has(id)) id = sectionAnchor(p.inst);
    if (used.has(id)) {
      const stem = id;
      for (let n = 2; used.has(id); n++) id = `${stem}-${n}`;
    }
    used.add(id);
    p.anchor = id;
  }
}

/**
 * Floating sections render their own fixed root; when that root is a plain element without the
 * editor hooks, they are added so the admin preview can outline and select it like any section.
 */
function floatingRoot(p: Planned): ReactNode {
  const el = p.element;
  if (!isValidElement(el) || typeof el.type !== "string") return el;
  const props = el.props as Record<string, unknown>;
  if (props["data-sid"] !== undefined) return el;
  return cloneElement(el as ReactElement<Record<string, unknown>>, { "data-sid": p.inst.id, "data-section": p.type, "data-variant": p.variant });
}

/** Section root (absorbing a <SectionShell> root element when the section returned one). */
function SectionRoot({ item }: { item: Planned }): ReactElement {
  const { inst, type, variant, element, anchor, bg } = item;
  const p = shellProps(element);
  if (p) {
    const Tag = p.as ?? "section";
    return (
      <Tag
        id={anchor}
        className={cx("lp-section", `lp-${type}`, `lp-${type}--${p.variant || variant}`, p.className)}
        data-section={type}
        data-variant={variant}
        data-sid={inst.id}
        data-bg={bg}
        data-space={p.space ?? inst.spacing}
        aria-labelledby={p.labelledBy}
        aria-label={p.labelledBy ? undefined : p.label}
      >
        {p.children}
      </Tag>
    );
  }
  return (
    <section
      id={anchor}
      className={cx("lp-section", `lp-${type}`, `lp-${type}--${variant}`)}
      data-section={type}
      data-variant={variant}
      data-sid={inst.id}
      data-bg={bg}
      data-space={inst.spacing}
    >
      {element}
    </section>
  );
}

export function renderPageBody(doc: PageDoc, ctx: RenderContext, opts: PageBodyOptions = {}): ReactElement {
  const planned: Planned[] = [];
  const shown: { inst: SectionInstance; data: Record<string, unknown>; def: NonNullable<ReturnType<typeof normalizeSection>>["def"]; variant: string }[] = [];
  for (const inst of doc.sections) {
    if (inst.hidden || opts.skip?.has(inst.id)) continue;
    const norm = normalizeSection(inst, doc);
    if (!norm) continue;
    shown.push({ inst, data: norm.data, def: norm.def, variant: norm.variant });
  }
  // photo direction is judged on the in-flow order (top bars and floating bars are not neighbors)
  const inFlow = shown.filter((s) => s.def.category !== "floating" && s.def.category !== "top");
  let index = 0;
  for (const norm of shown) {
    const inst = norm.inst;
    const at = inFlow.indexOf(norm);
    const sectionCtx = at >= 0 ? photoContext(inFlow, at, ctx) : ctx;
    const props: SectionProps<Record<string, unknown>> = { id: inst.id, variant: norm.variant, bg: inst.bg, data: norm.data, ctx: sectionCtx, index: index++ };
    let element: ReactNode;
    try {
      element = norm.def.render(props);
    } catch (err) {
      element = opts.onError?.(inst, err) ?? null;
    }
    if (element === null || element === undefined || element === false) continue;
    const bg = shellProps(element)?.bg ?? inst.bg;
    planned.push({ inst, type: norm.def.type, category: norm.def.category, variant: norm.variant, element, bg, anchor: inst.id });
  }

  const flow = planned.filter((p) => p.category !== "floating");
  const floating = planned.filter((p) => p.category === "floating");
  assignAnchors(flow);
  const dividers = planDividers(flow, doc, ctx);
  const wrap = (p: Planned, node: ReactNode) => (opts.guard ? opts.guard(p.inst, node) : node);

  const firstMain = flow.findIndex((p) => p.category !== "top");
  let lastMain = -1;
  for (let i = flow.length - 1; i >= 0; i--) {
    if (flow[i]!.category !== "bottom") {
      lastMain = i;
      break;
    }
  }

  const top: ReactNode[] = [];
  const main: ReactNode[] = [];
  const bottom: ReactNode[] = [];
  flow.forEach((p, i) => {
    const group = firstMain < 0 || i < firstMain ? top : i > lastMain ? bottom : main;
    const d = dividers.get(p.inst.id);
    const prev = flow[i - 1];
    if (d && prev) {
      group.push(<Divider key={`dv-${p.inst.id}`} kind={d.kind} uid={`dv-${p.inst.id}`} from={prev.bg} to={p.bg} seed={d.seed} flip={d.flip} />);
    }
    group.push(<Fragment key={p.inst.id}>{wrap(p, <SectionRoot item={p} />)}</Fragment>);
  });

  return (
    <>
      {main.length ? <SkipLink ctx={ctx} /> : null}
      {top}
      {main.length ? (
        <main id="main" className="lp-main" tabIndex={-1}>
          {main}
        </main>
      ) : null}
      {bottom}
      {opts.after ?? null}
      {floating.map((p) => (
        <Fragment key={p.inst.id}>{wrap(p, floatingRoot(p))}</Fragment>
      ))}
    </>
  );
}

/** Section types that actually render on this page (for per-section CSS chunks). */
export function usedSectionTypes(doc: PageDoc): string[] {
  const types = new Set<string>();
  for (const s of doc.sections) if (!s.hidden) types.add(s.type);
  return [...types];
}
