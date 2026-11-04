/**
 * The ⌘K palette's pure rules (P2 SHELL; platform.md PLA-§22.13, UX-02; design.md DES-§16.10; docs/STORE-SAAS.md
 * §I.3), kept out of the client components so `test:shell` checks them without a browser:
 *
 * - the query's mode: `>` actions only, `/` search only, `?` the shortcut sheet; a typed order id opens its drawer;
 * - the local index (≤ 300 entries, rebuilt with the store): the nav items `navFor` allows, the settings tabs, the
 *   member names (`members.read`) and the 20 most recent pages, matched in the browser without a round trip;
 * - the first-open state: 5 recents (per store and member, `localStorage`, a convenience: every access is wrapped) and
 *   up to 4 suggestions chosen by role and mode;
 * - the server answer's timing: a 120 ms debounce, skeleton rows only after 150 ms, then shown for at least 300 ms.
 *
 * Every link here stays under the store on screen (`/app/<handle>`): a stored recent pointing anywhere else is dropped.
 */
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import { modeAllows, type ModeFeature, type StoreMode } from "@/lib/tenancy/mode";
import type { MessageKey } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { orderIdOf, type GoTarget } from "./chords";
import { COMMANDS, commandsFor, type CommandCtx, type CommandDef } from "./commands";

/* ------------------------------------------------------------------ timing (PLA-§22.13, DES-§16.10) */

export const SEARCH_DEBOUNCE_MS = 120;
export const SKELETON_AFTER_MS = 150;
export const SKELETON_MIN_MS = 300;
/** The server is asked from this many characters (the route's `SearchQuery` minimum). */
export const SERVER_MIN_CHARS = 2;

/**
 * Are the skeleton rows on screen at `now`? `startedAt`: when the request left; `doneAt`: when its answer arrived (null
 * while pending). They appear after 150 ms of waiting and, once shown, stay 300 ms so they never flash.
 */
export function skeletonVisible(startedAt: number, doneAt: number | null, now: number): boolean {
  const shownAt = startedAt + SKELETON_AFTER_MS;
  if (doneAt === null) return now >= shownAt;
  if (doneAt < shownAt) return false;
  return now < shownAt + SKELETON_MIN_MS;
}

/** When the answer may replace the skeleton: right away when the skeleton never showed, else after its 300 ms. */
export function revealAt(startedAt: number, doneAt: number): number {
  const shownAt = startedAt + SKELETON_AFTER_MS;
  return doneAt < shownAt ? doneAt : Math.max(doneAt, shownAt + SKELETON_MIN_MS);
}

/* ------------------------------------------------------------------ the query */

export type PaletteMode = "all" | "actions" | "search";

export interface PaletteQuery {
  mode: PaletteMode;
  /** the text without its mode prefix, trimmed */
  q: string;
  /** `?` alone: open the shortcut sheet */
  shortcuts: boolean;
  /** a typed order id (`^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$`, upper-cased) */
  orderId: string | null;
}

export function parsePaletteQuery(raw: string): PaletteQuery {
  const text = raw.replace(/^\s+/, "");
  if (text === "?") return { mode: "all", q: "", shortcuts: true, orderId: null };
  const mode: PaletteMode = text.startsWith(">") ? "actions" : text.startsWith("/") ? "search" : "all";
  const q = (mode === "all" ? text : text.slice(1)).trim();
  return { mode, q, shortcuts: false, orderId: mode === "actions" ? null : orderIdOf(q) };
}

/* ------------------------------------------------------------------ matching */

/** Lower case, no diacritics, single spaces (the search route's folding, so both sides agree). */
export function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** How well `needle` (folded) names an entry: 4 title starts with it, 3 a title word does, 2 inside the title, 1 a keyword; 0 no match. */
export function matchScore(needle: string, title: string, keywords: readonly string[] = []): number {
  if (!needle) return 1;
  const t = fold(title);
  if (t.startsWith(needle)) return 4;
  if (t.split(/[\s\-_/&·,.]+/).some((w) => w.startsWith(needle))) return 3;
  if (t.includes(needle)) return 2;
  return keywords.some((k) => fold(k).includes(needle)) ? 1 : 0;
}

/** The entries `q` matches, best first, stable otherwise, at most `max`. */
export function rank<T>(items: readonly T[], q: string, text: (item: T) => { title: string; keywords?: readonly string[] }, max = Infinity): T[] {
  const needle = fold(q);
  return items
    .map((item, i) => {
      const { title, keywords } = text(item);
      return { item, i, s: matchScore(needle, title, keywords) };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.item);
}

/* ------------------------------------------------------------------ the local index (PLA-§22.13) */

export const LOCAL_INDEX_MAX = 300;
export const RECENT_PAGES_MAX = 20;
/** Local matches shown per kind. */
export const LOCAL_PER_KIND = 6;

export type LocalKind = "nav" | "setting" | "page" | "member";

export interface LocalEntry {
  kind: LocalKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  keywords: string[];
  /** the registry icon of a nav item or tab */
  navId?: string;
}

export interface LocalIndexInput {
  handle: string;
  nav: readonly { id: string; label: string; href: string; keywords: readonly string[]; group: string }[];
  tabs: readonly { id: string; label: string; description: string | null; href: string; keywords: readonly string[] }[];
  pages: readonly { id: string; name: string; slug: string; status: string }[];
  members: readonly { userId: string; name: string; role: string }[];
  /** the role's label in the viewer's language */
  roleLabel(role: string): string;
  /** the page status's label */
  statusLabel?(status: string): string;
  /** members only for `members.read` (the layout already reads none without it) */
  canReadMembers: boolean;
}

/** The store's local index: nav items (the settings tabs come as settings), tabs, recent pages, members; ≤ 300 entries. */
export function buildLocalIndex(p: LocalIndexInput): LocalEntry[] {
  const home = appHref(p.handle);
  const out: LocalEntry[] = [];
  for (const n of p.nav) if (n.group !== "settings") out.push({ kind: "nav", id: n.id, title: n.label, href: n.href, keywords: [...n.keywords], navId: n.id });
  for (const s of p.tabs) out.push({ kind: "setting", id: s.id, title: s.label, ...(s.description ? { subtitle: s.description } : {}), href: s.href, keywords: [...s.keywords], navId: s.id });
  for (const pg of p.pages.slice(0, RECENT_PAGES_MAX)) {
    // the subtitle names the slug and the status, never a hand-built link (the page opens in the editor)
    const status = p.statusLabel ? p.statusLabel(pg.status) : null;
    out.push({ kind: "page", id: pg.id, title: pg.name, subtitle: status ? `${pg.slug} · ${status}` : pg.slug, href: appHref(p.handle, `/pages/${pg.id}/edit`), keywords: [pg.slug] });
  }
  if (p.canReadMembers) {
    for (const m of p.members) {
      if (!m.name.trim()) continue;
      out.push({ kind: "member", id: m.userId, title: m.name.trim(), subtitle: p.roleLabel(m.role), href: appHref(p.handle, "/team"), keywords: [] });
    }
  }
  return out.filter((e) => e.href === home || e.href.startsWith(`${home}/`) || e.href.startsWith(`${home}?`)).slice(0, LOCAL_INDEX_MAX);
}

/** The local entries `q` matches, grouped by kind in index order, at most `perKind` each. */
export function matchLocal(index: readonly LocalEntry[], q: string, perKind = LOCAL_PER_KIND): Record<LocalKind, LocalEntry[]> {
  const out: Record<LocalKind, LocalEntry[]> = { nav: [], setting: [], page: [], member: [] };
  for (const kind of Object.keys(out) as LocalKind[]) out[kind] = rank(index.filter((e) => e.kind === kind), q, (e) => ({ title: e.title, keywords: e.keywords }), perKind);
  return out;
}

/* ------------------------------------------------------------------ recents (DES-§16.10 first-open state) */

export const RECENTS_SHOWN = 5;
export const RECENTS_KEPT = 12;
/** What a recent may be: a thing the viewer opened (never a nav jump or an action). */
export const RECENT_KINDS = ["page", "order", "customer", "lead", "member", "setting"] as const;

export interface RecentEntry {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  at: number;
}

/**
 * The storage key: under `sg:<storeId>:<userId>:`, so a store switch and sign-out sweep it with the store's other
 * client state (`storeKeyMatches`, ./client-state.ts).
 */
export const recentsKey = (storeId: string, userId: string) => `sg:${storeId}:${userId}:cmdk-recent`;

function isRecent(v: unknown, home: string): v is RecentEntry {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<RecentEntry>;
  return (
    typeof r.kind === "string" &&
    (RECENT_KINDS as readonly string[]).includes(r.kind) &&
    typeof r.id === "string" &&
    r.id.length > 0 &&
    r.id.length <= 100 &&
    typeof r.title === "string" &&
    r.title.trim().length > 0 &&
    r.title.length <= 200 &&
    (r.subtitle === undefined || (typeof r.subtitle === "string" && r.subtitle.length <= 200)) &&
    typeof r.href === "string" &&
    r.href.length <= 500 &&
    (r.href === home || r.href.startsWith(`${home}/`) || r.href.startsWith(`${home}?`)) &&
    !r.href.includes("//") &&
    typeof r.at === "number" &&
    Number.isFinite(r.at)
  );
}

/** The stored recents of this store, newest first, well formed and under `/app/<handle>` only; [] when storage is blocked. */
export function readRecents(storage: () => Pick<Storage, "getItem">, key: string, handle: string): RecentEntry[] {
  try {
    const raw = storage().getItem(key);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const home = appHref(handle);
    return list.filter((v): v is RecentEntry => isRecent(v, home)).sort((a, b) => b.at - a.at).slice(0, RECENTS_KEPT);
  } catch {
    return [];
  }
}

/** `entry` first, its older copy removed, at most `RECENTS_KEPT`. Pure. */
export function pushRecent(list: readonly RecentEntry[], entry: Omit<RecentEntry, "at">, at: number): RecentEntry[] {
  if (!(RECENT_KINDS as readonly string[]).includes(entry.kind)) return [...list];
  const next: RecentEntry = { ...entry, at };
  return [next, ...list.filter((r) => !(r.kind === entry.kind && r.id === entry.id))].slice(0, RECENTS_KEPT);
}

/** Writes the list; a blocked or full storage keeps it for this visit only. */
export function writeRecents(storage: () => Pick<Storage, "setItem">, key: string, list: readonly RecentEntry[]): boolean {
  try {
    storage().setItem(key, JSON.stringify(list.slice(0, RECENTS_KEPT)));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ suggestions (DES-§16.10, UX-36) */

export const SUGGESTIONS_MAX = 4;

export type SuggestionId = "new_page" | "call_queue" | "today_orders" | "brand" | "invite" | "upload_media" | "notifications";

export interface SuggestionDef {
  id: SuggestionId;
  label: MessageKey;
  /** store-relative; a `navId` suggestion takes the nav item's link instead */
  path: `/${string}`;
  permission: StorePermission;
  mode?: ModeFeature;
  /** shown only while the nav has this item (a screen another track ships) */
  navId?: string;
  icon: string;
}

export const SUGGESTIONS: Readonly<Record<SuggestionId, SuggestionDef>> = {
  new_page: { id: "new_page", label: "shell.cmdk.suggest.new_page", path: "/generate", permission: "pages.write", mode: "landing", icon: "Sparkles" },
  call_queue: { id: "call_queue", label: "shell.cmdk.suggest.call_queue", path: "/queue", permission: "agents.self", icon: "PhoneCall" },
  today_orders: { id: "today_orders", label: "shell.cmdk.suggest.today_orders", path: "/orders?range=today", permission: "orders.read", icon: "ReceiptText" },
  brand: { id: "brand", label: "shell.cmdk.suggest.brand", path: "/settings/brand", permission: "brand.write", navId: "brand", icon: "Palette" },
  invite: { id: "invite", label: "shell.cmdk.suggest.invite", path: "/team", permission: "members.invite", icon: "UsersRound" },
  upload_media: { id: "upload_media", label: "shell.cmdk.suggest.upload_media", path: "/media?upload=1", permission: "media.write", icon: "Images" },
  notifications: { id: "notifications", label: "shell.cmdk.suggest.notifications", path: "/notifications", permission: "store.read", icon: "Bell" },
};

/** The order each family of roles sees them in: the call roles work the queue, the others build pages. */
const ORDER: Readonly<Record<"call" | "build", readonly SuggestionId[]>> = {
  call: ["call_queue", "today_orders", "invite", "notifications"],
  build: ["new_page", "today_orders", "brand", "invite", "upload_media", "notifications"],
};

export interface SuggestionViewer {
  role: StoreRole;
  mode: StoreMode;
  can(p: StorePermission): boolean;
  /** the nav items on screen (id → link) */
  nav: ReadonlyMap<string, string>;
  handle: string;
}

/** Up to 4 suggestions for this member and store mode, each with its link. */
export function paletteSuggestions(v: SuggestionViewer, max = SUGGESTIONS_MAX): { def: SuggestionDef; href: string }[] {
  const family = v.role === "agent" || v.role === "manager" ? "call" : "build";
  const out: { def: SuggestionDef; href: string }[] = [];
  for (const id of ORDER[family]) {
    const def = SUGGESTIONS[id];
    if (!v.can(def.permission)) continue;
    if (def.mode && !modeAllows(v.mode, def.mode)) continue;
    if (def.navId && !v.nav.has(def.navId)) continue;
    out.push({ def, href: def.navId ? v.nav.get(def.navId)! : appHref(v.handle, def.path) });
    if (out.length >= max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ a typed order id */

/** The drawer link of a typed order id, for a member who may read orders; null otherwise. */
export function orderDrawerHref(handle: string, orderId: string | null, canReadOrders: boolean): string | null {
  return orderId && canReadOrders ? appHref(handle, `/orders?order=${encodeURIComponent(orderId)}`) : null;
}

/* ------------------------------------------------------------------ the G chords' targets */

/**
 * Where each `G` chord goes for this member (§I.3): the nav item of the same id when they see it, the overview
 * always, Settings to their first tab, the queue to the R1.0 alias for the call roles until P4's item exists. A target
 * left out has no screen for them: the chord does nothing and the sheet does not list it. `switch_store` is not a link.
 */
export function goHrefs(p: { handle: string; nav: ReadonlyMap<string, string>; firstSettingsHref: string | null; can(perm: StorePermission): boolean }): Partial<Record<Exclude<GoTarget, "switch_store">, string>> {
  const out: Partial<Record<Exclude<GoTarget, "switch_store">, string>> = { overview: appHref(p.handle) };
  for (const target of ["orders", "leads", "customers", "pages", "media", "team", "notifications"] as const) {
    const href = p.nav.get(target);
    if (href) out[target] = href;
  }
  const queue = p.nav.get("queue") ?? (p.can("agents.self") ? appHref(p.handle, "/queue") : undefined);
  if (queue) out.queue = queue;
  if (p.firstSettingsHref) out.settings = p.firstSettingsHref;
  return out;
}

/* ------------------------------------------------------------------ a health fix runs a command (PD66) */

/**
 * The command a `HealthFix` of kind `action` names (`actionId` = a `CommandDef.id`, e.g. P5's `integrations.sync_sheets`),
 * when this member may run it in this store (`commandsFor`: permission, mode, release); null otherwise, and the fix
 * then shows as a link or not at all.
 */
export function commandForFix(actionId: string, ctx: Pick<CommandCtx, "store" | "can">, commands: readonly CommandDef[] = COMMANDS): CommandDef | null {
  return commandsFor(ctx, commands).find((c) => c.id === actionId) ?? null;
}
