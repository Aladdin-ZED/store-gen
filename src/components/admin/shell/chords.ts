/**
 * Keyboard chords of the tenant shell (P2 SHELL; platform.md PLA-§22.13, UX-02; docs/STORE-SAAS.md §I.3). The parser
 * is pure (a key stream and a clock in, a command out), so `test:shell` drives it without a DOM; `useChords` (step
 * p2-08) feeds it the window's keydown events with `isEditable(e.target)` and `overlayOpen()`.
 *
 *   G then H/O/Q/L/C/P/M/T/S/N/W within 1 s   overview, orders, queue, leads, customers, pages, media, team,
 *                                             settings, notifications, switch store
 *   C   Create      ?   shortcut sheet      /   search      >   actions
 *
 * `N`, `1-6` (the queue, P4), `E`, `Enter`, `Esc` and `J/K` belong to the screen that has them; the parser lets them
 * through. Nothing fires inside an editable field or while an overlay owns the keyboard, nor with Ctrl, ⌘ or Alt held
 * (those are the browser's and the palette's). `isEditable` / `overlayOpen` re-implement the builder's private rules
 * (src/components/builder/shortcuts.ts:16-25) so both surfaces judge a key the same way.
 */

/** A typed order id opens the order drawer directly (orders-view.tsx, the orders actions' `OrderId`). */
export const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

/** The order id `query` names (trimmed, upper-cased), or null. */
export function orderIdOf(query: string): string | null {
  const id = query.trim().toUpperCase();
  return ORDER_ID_RE.test(id) ? id : null;
}

export const CHORD_WINDOW_MS = 1_000;

export type GoTarget = "overview" | "orders" | "queue" | "leads" | "customers" | "pages" | "media" | "team" | "settings" | "notifications" | "switch_store";

/** G-sequences (§I.3). */
export const GO_CHORDS: Readonly<Record<string, GoTarget>> = {
  h: "overview",
  o: "orders",
  q: "queue",
  l: "leads",
  c: "customers",
  p: "pages",
  m: "media",
  t: "team",
  s: "settings",
  n: "notifications",
  w: "switch_store",
};

/** The store-relative path of each target (`switch_store` opens the switcher instead). */
export const GO_PATHS: Readonly<Record<Exclude<GoTarget, "switch_store">, `/${string}` | "">> = {
  overview: "",
  orders: "/orders",
  queue: "/queue",
  leads: "/leads",
  customers: "/customers",
  pages: "/pages",
  media: "/media",
  team: "/team",
  settings: "/settings",
  notifications: "/notifications",
};

export type ChordCommand =
  | { kind: "go"; target: GoTarget }
  | { kind: "create" }
  | { kind: "shortcuts" }
  | { kind: "search" }
  | { kind: "actions" };

export interface ChordKey {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** `isEditable(e.target)` */
  editable: boolean;
  /** `overlayOpen()` */
  overlay: boolean;
  /** an IME composition or an auto-repeat */
  isComposing?: boolean;
  repeat?: boolean;
}

export interface ChordParser {
  /** the command this key completes, or null (the caller then lets the key through) */
  feed(k: ChordKey): ChordCommand | null;
  /** is a `G` waiting for its second key? (the shortcut hint shows "G …") */
  pending(): boolean;
  reset(): void;
}

/** A chord parser over an injectable clock (the selftest's fake time). */
export function createChordParser(now: () => number = () => Date.now(), windowMs: number = CHORD_WINDOW_MS): ChordParser {
  let gAt: number | null = null;
  return {
    feed(k) {
      if (k.editable || k.overlay || k.ctrlKey || k.metaKey || k.altKey || k.isComposing || k.repeat) {
        gAt = null;
        return null;
      }
      const t = now();
      const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
      if (gAt !== null && t - gAt <= windowMs) {
        gAt = null;
        const target = GO_CHORDS[key];
        return target ? { kind: "go", target } : null;
      }
      gAt = null;
      switch (key) {
        case "g":
          gAt = t;
          return null;
        case "c":
          return { kind: "create" };
        case "?":
          return { kind: "shortcuts" };
        case "/":
          return { kind: "search" };
        case ">":
          return { kind: "actions" };
        default:
          return null;
      }
    },
    pending: () => gAt !== null && now() - gAt <= windowMs,
    reset() {
      gAt = null;
    },
  };
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const OPEN_OVERLAY =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-slot="popover-content"][data-state="open"]';

/** Is the key's target a field that keeps its own keys? (the builder's rule) */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.isContentEditable || !!el.closest(EDITABLE);
}

/** Does an open dialog, sheet, menu or popover own the keyboard? (the builder's rule) */
export function overlayOpen(doc: Pick<Document, "querySelector"> | null = typeof document === "undefined" ? null : document): boolean {
  return !!doc?.querySelector(OPEN_OVERLAY);
}
