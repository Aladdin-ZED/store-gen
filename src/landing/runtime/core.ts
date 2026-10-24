/**
 * Runtime plumbing shared by every module: the context object, scoped listeners/cleanups,
 * a tiny typed event bus, the optional-chunk registry and DOM helpers.
 *
 * Everything goes through ctx.doc / ctx.win (never the globals) so the same code runs on the live
 * page and inside the admin preview iframe driven from the parent window. Never use `instanceof`
 * on DOM nodes here: nodes from the iframe belong to another realm.
 */
import type { LandingRuntimeConfig } from "./config";
import type { Sel } from "./money";

export type W = Window & typeof globalThis;
export type Fn = () => void;
export type Ctl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** One product line of a pixel event: content id, quantity, unit price (cents). */
export interface Content {
  id: string;
  q: number;
  p: number;
}

export interface Purchase {
  orderId: string;
  /** order total (money, the server's) */
  value: number;
  currency: string;
  eventId: string;
  qty: number;
  /** per content id (from the stored order groups) */
  contents?: Content[];
  /** content_name on multi-item pages: the offer label (§G.7); else the product name */
  name?: string;
}

/** Cross-module events. `select` is a request, `bundle` the applied result, `units` = the selection changed. */
export interface Bus {
  select: string;
  bundle: { id: string; user: boolean };
  units: null;
  start: null;
  cta: string | null;
  purchase: Purchase;
}

/** State that survives refresh() (preview re-renders) for the lifetime of one instance. */
export interface State {
  bundleId: string;
  bump: boolean;
  /** first form interaction (epoch ms); 0 = not started */
  t0: number;
  idem: string;
  eventId: string;
  /** idem the abandoned-lead beacon was sent for */
  lead: string;
  sending: boolean;
  done: boolean;
  utm: Record<string, string>;
  /** the current selection (set by units.ts; an empty one before) */
  sel: () => Sel;
  /** what an ad pixel event says about the selection (or another offer's empty one), cents (bundles.ts) */
  px: (offerId?: string) => PixelOrder | null;
}

/** The selection as pixel events see it (docs/OFFERS.md §G.7). Amounts in cents. */
export interface PixelOrder {
  subtotal: number;
  total: number;
  /** units + bump */
  units: number;
  contents: Content[];
  /** product name (single item) or the offer label */
  name: string;
}

/**
 * Optional chunks (docs/OFFERS.md §F.9) register `(window.__lpx = window.__lpx || []).push([name, fn])`
 * before the core script; the admin preview passes them all to initLanding directly.
 * pixels: Module · turnstile: (c, form) => Captcha · units-matrix / units-fields / fill-steps-box: (host) => kit.
 */
export type Feature = (...a: never[]) => unknown;
export type Features = Record<string, Feature>;

export interface Ctx {
  doc: Document;
  win: W;
  cfg: LandingRuntimeConfig;
  /** admin preview: no network, no pixels, no storage side effects that matter */
  preview: boolean;
  /** prefers-reduced-motion or theme motion "off" */
  reduced: boolean;
  st: State;
  /** registered optional chunks */
  fx: Features;
  /** register a cleanup for this scope */
  add(fn: Fn): void;
  /** addEventListener with automatic removal and exception guard */
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  emit<K extends keyof Bus>(k: K, d: Bus[K]): void;
  sub<K extends keyof Bus>(k: K, fn: (d: Bus[K]) => void): void;
}

export function report(win: W, e: unknown): void {
  try {
    win.console.warn("[lp]", e);
  } catch {
    /* console unavailable */
  }
}

export function $$<E extends Element = HTMLElement>(root: ParentNode, sel: string): E[] {
  return Array.prototype.slice.call(root.querySelectorAll(sel)) as E[];
}

/** Boolean attribute toggle (present = on). */
export function flag(el: Element, name: string, on: boolean): void {
  if (on !== el.hasAttribute(name)) {
    if (on) el.setAttribute(name, "");
    else el.removeAttribute(name);
  }
}

/** `hidden` without touching the DOM when it already matches. */
export function hide(el: Element, off: boolean): void {
  const h = el as HTMLElement;
  if (h.hidden !== off) h.hidden = off;
}

/**
 * Set text while keeping an existing single text node (React in the preview keeps references to
 * its text nodes; replacing them would detach its future updates).
 */
export function setText(el: Element, s: string): void {
  const n = el.firstChild;
  if (n && n === el.lastChild && n.nodeType === 3) {
    if (n.nodeValue !== s) n.nodeValue = s;
  } else if (el.textContent !== s) el.textContent = s;
}

/** "{a} · {b}" with tokens replaced (unknown tokens kept). */
export function fill(s: string, v: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
}

export function num(v: string | null | undefined, fb = 0): number {
  const n = parseFloat(v || "");
  return isFinite(n) ? n : fb;
}

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function closest(t: EventTarget | null, sel: string): HTMLElement | null {
  const el = t as Element | null;
  return el && typeof el.closest === "function" ? (el.closest(sel) as HTMLElement | null) : null;
}

export function getForm(c: Pick<Ctx, "doc">): HTMLFormElement | null {
  return c.doc.querySelector<HTMLFormElement>("form[data-lp-form]");
}

type StoreKind = "localStorage" | "sessionStorage";

/**
 * The web-storage name of a runtime key ("utm", "vid", "order", "px-u", "wa"; docs/STORE-SAAS.md §C.9). On a
 * store page in P mode (/s/<handle> and below) every store shares the platform origin, so the name carries the
 * store: "lp:<handle>:<key>"; anywhere else (a store's own host, exports, the preview) it stays "lp-<key>". The
 * one place the prefix is derived; tracking, pixels, the order hand-off and the WhatsApp bridge all call it.
 */
export function skey(win: W, key: string): string {
  const m = /^\/s\/([a-z0-9-]{3,30})(?:\/|$)/.exec(win.location.pathname);
  return (m ? "lp:" + m[1] + ":" : "lp-") + key;
}

/** Storage access that never throws (private mode, blocked site data, sandboxed previews). */
export function sget(win: W, kind: StoreKind, key: string): string | null {
  try {
    return win[kind].getItem(key);
  } catch {
    return null;
  }
}

export function sset(win: W, kind: StoreKind, key: string, val: string): boolean {
  try {
    win[kind].setItem(key, val);
    return true;
  } catch {
    return false;
  }
}

export function sdel(win: W, kind: StoreKind, key: string): void {
  try {
    win[kind].removeItem(key);
  } catch {
    /* storage blocked */
  }
}

/** JSON from storage, or null (never throws). */
export function sjson<T>(win: W, kind: StoreKind, key: string): T | null {
  try {
    return JSON.parse(sget(win, kind, key) || "null") as T | null;
  } catch {
    return null;
  }
}

/** Direction of an element as rendered (RTL-aware widgets). */
export function isRtl(c: Ctx, el: Element): boolean {
  try {
    return c.win.getComputedStyle(el).direction === "rtl";
  } catch {
    return c.cfg.dir === "rtl";
  }
}

/** Write a live status line ([data-lp-status], aria-live=polite) with a `data-tone` for styling. */
export function setStatus(el: Element | null, text: string, tone: "error" | "info" | "success" | ""): void {
  if (!el) return;
  setText(el, text);
  if (text && tone) el.setAttribute("data-tone", tone);
  else el.removeAttribute("data-tone");
}

/** Disable a control (native `disabled` on buttons, aria-disabled everywhere). */
export function disable(el: Element | null, off: boolean): void {
  if (!el) return;
  if (el.tagName === "BUTTON") (el as HTMLButtonElement).disabled = off;
  el.setAttribute("aria-disabled", String(off));
}

/** A radio / checkbox is on, a select or text control has a value. */
export const checked = (el: Ctl) => (el.type === "radio" || el.type === "checkbox" ? (el as HTMLInputElement).checked : !!el.value);
