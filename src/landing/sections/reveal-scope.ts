/**
 * The reveal scope of a look document (P6 DESIGN; design.md DES-§5.11 G35, DES-§4.12, DES-§3.2 "Reveal nodes"; budget
 * R5). A page carrying `theme.look` animates its hero and its section heads only: `data-reveal` stays on at most six
 * outermost nodes of the hero and on the title and lead of each `SectionHeader`, and every other reveal of the
 * section is dropped from the markup, so the page ships ≤ 60 reveal nodes (≈ 6 + 2 per section) instead of 250-400.
 * `look.mo.scope` decides: `heads` (default), `hero` (the hero only) or `none` (nothing moves).
 *
 * A dropped reveal leaves its element in its final state: the attribute pair `data-reveal` / `data-delay` goes and the
 * element gets `data-in`, the flag the frozen runtime (src/landing/runtime/reveal.ts) would have set, so a rule that
 * waits for `[data-in]` (a struck price, a ledger mark, a counter's affix) shows its end state at once, and a counter
 * keeps the final figure the server wrote. Documents without look are returned untouched (their markup is the
 * render-check golden).
 *
 * Mechanics: the section's element tree is walked once and its function components are called in place (every
 * component under src/landing/sections and src/landing/primitives is a pure function of its props: no hooks, no
 * context), which yields the host elements and their `data-reveal` props without rendering. Keys are kept on the
 * expanded output, so lists reconcile as before in the builder's live preview.
 */
import { cloneElement, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { z } from "zod";
import { SectionHeader } from "../primitives/SectionHeader";
import type { RenderContext, SectionDefinition } from "../types";

/** Outermost reveal nodes the hero keeps (title, lead, media, price, action, COD line: DES-§5.11 "hero (≤ 6)"). */
export const HERO_REVEALS = 6;
/** Heads keep the reveals of these parts only: the title and the lead (or the pulled lead of the `quote` opener). */
const HEAD_PART = /\blp-sh__(?:title|lead|pull)\b/;

type Scope = "heads" | "hero" | "none";

interface Walk {
  /** where this subtree may keep a reveal: the hero's budget, a head's parts, or nowhere */
  zone: "hero" | "head" | "off";
  /** an ancestor already reveals: a nested reveal would only re-animate inside it */
  under: boolean;
  /** what is left of the hero's budget (shared by the whole hero subtree) */
  left: { n: number };
}

type Props = Record<string, unknown> & { children?: ReactNode; className?: unknown };

/** The page's reveal scope, or null for a document without look (its reveals are not touched). */
export function revealScope(ctx: Pick<RenderContext, "doc">): Scope | null {
  return ctx.doc.theme.look?.mo.scope ?? null;
}

/** A section definition whose render applies the page's reveal scope (every section type but the order form, P3's). */
export function withRevealScope<S extends z.ZodTypeAny>(def: SectionDefinition<S>): SectionDefinition<S> {
  const render = def.render;
  return { ...def, render: (props) => scopeReveals(def.type, render(props), props.ctx) };
}

/** A section's render, scoped: `type` is the section type (the hero keeps its budget, the others their heads). */
export function scopeReveals(type: string, el: ReactElement | null, ctx: Pick<RenderContext, "doc">): ReactElement | null {
  const scope = revealScope(ctx);
  if (!scope || !el) return el;
  const zone: Walk["zone"] = type === "hero" ? (scope === "none" ? "off" : "hero") : "off";
  const out = walk(el, { zone, under: false, left: { n: zone === "hero" ? HERO_REVEALS : 0 } }, scope === "heads");
  return isValidElement(out) ? out : createElement(Fragment, null, out);
}

function walk(node: ReactNode, w: Walk, heads: boolean): ReactNode {
  if (Array.isArray(node)) return node.map((n) => walk(n, w, heads));
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<Props>;
  const { type } = el;
  if (typeof type === "function") {
    // a class component cannot be called: leave it (none exist in the landing kit)
    if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) return el;
    const out = (type as (p: Props) => ReactNode)(el.props);
    const head = type === SectionHeader && heads && w.zone === "off";
    const next = walk(out, head ? { zone: "head", under: false, left: w.left } : w, heads);
    return keyed(next, el);
  }
  if (typeof type !== "string" && (type as unknown) !== Fragment) return el;
  const props = el.props;
  let strip = false;
  let under = w.under;
  if (typeof type === "string" && props["data-reveal"] !== undefined && props["data-reveal"] !== false) {
    const cls = typeof props.className === "string" ? props.className : "";
    const keep = !w.under && (w.zone === "hero" ? w.left.n > 0 : w.zone === "head" && HEAD_PART.test(cls));
    if (keep) {
      if (w.zone === "hero") w.left.n--;
      under = true;
    } else strip = true;
  }
  const children = props.children;
  const walked = children === undefined ? undefined : walk(children, under === w.under ? w : { ...w, under }, heads);
  if (!strip && walked === children) return el;
  // children go back as arguments, so React validates their keys exactly as it did for the original element
  const kids = walked === undefined ? [] : Array.isArray(walked) ? walked : [walked];
  return carry(el, cloneElement(el, strip ? DROPPED : undefined, ...kids));
}

/** A dropped reveal: no attribute pair, and the runtime's "revealed" flag set from the start (an undefined prop is not rendered). */
const DROPPED = { "data-reveal": undefined, "data-delay": undefined, "data-in": "" } as const;

/**
 * The expanded output of a component stands where the component's element stood: it keeps that element's key (lists
 * reconcile as before) and, in development, React's "key checked" mark, so a replacement inside a list is not
 * reported as a missing key (the original element was checked where it was written).
 */
function keyed(node: ReactNode, from: ReactElement): ReactNode {
  const key = from.key;
  if (isValidElement(node)) return carry(from, node.key === key || key === null ? node : cloneElement(node, { key }));
  return key === null ? node : createElement(Fragment, { key }, node);
}

type Checked = { _store?: { validated?: number } };

/** Development builds only: copies React's key-validation mark from the element replaced to its replacement. */
function carry<T extends ReactElement>(from: ReactElement, to: T): T {
  const a = (from as unknown as Checked)._store;
  const b = (to as unknown as Checked)._store;
  if (a && b && a.validated && !b.validated) b.validated = a.validated;
  return to;
}
