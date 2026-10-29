/**
 * Notification kind helpers (platform.md PLA-§18.1; docs/STORE-SAAS.md §I.4). Pure and isomorphic: the kind files
 * (`src/lib/notify/kinds/<track>.ts`) declare with them, `notify()` validates and renders with them, `test:platform`
 * checks every registered kind against them.
 *
 *   export const kinds = [
 *     defineKind({ kind: "store.restricted", group: "store", defaultSeverity: "warn", audienceHint: "store_role",
 *       tenant: true, vars: z.object({ reason: v.code }), link: tenantLink(""), labels: { reason: "notify.reason" } }),
 *   ];
 *
 * Rules a kind keeps (core §I.4):
 *   - `vars` is a flat `z.object` of ids, counts, codes, ISO dates and short labels; a key named phone, name, address,
 *     email or note is refused at declaration (`defineKind` throws) and by `test:platform`;
 *   - `link(vars, ctx)` builds an in-app path only: `/app/<handle>…` (tenantLink), `/app/account…` (accountLink) or
 *     `/admin…` (consolePath, the relative form of `consoleHref()`; the console renders it on ADMIN_HOST, PD82).
 *     `notify()` checks the result again and stores NULL for anything else;
 *   - `labels` maps a var to a message key prefix: at read time `<prefix>.<value>` in the reader's locale replaces the
 *     code when the key exists (a reason code reads "Fake orders", a role "Manager"); otherwise the code shows as is.
 */
import { z } from "zod";
import { messageOf, t, type AdminLocale, type MessageVars } from "@/lib/i18n/admin";
import type { NotificationKindDef } from "@/lib/notify/registry";

/** Keys a vars schema may never have (customer data never rides in a notification, core §I.4, PL-13). */
export const BANNED_VAR_KEYS = ["phone", "name", "address", "email", "note"] as const;
const BANNED_RE = /^(?:phone|name|address|email|note)$/i;

/** Is `key` a refused vars key (case-insensitive)? */
export function isBannedVarKey(key: string): boolean {
  return BANNED_RE.test(key);
}

/** The building blocks of a vars schema. */
export const v = {
  /** a 26-char id (store, user, request) */
  id: z.string().regex(/^[0-9A-Z]{26}$/),
  /** a machine code: reason, metric, role, kind, alarm code */
  code: z.string().regex(/^[a-z0-9][a-z0-9_.:-]{0,39}$/),
  /** a short display label (a store handle, a member's display name, a plan name): one line, ≤ 60 chars */
  label: z.string().min(1).max(60),
  count: z.number().int().min(0),
  /** an instant (rendered as a date and time in the reader's locale) */
  instant: z.iso.datetime({ offset: true }),
  /** a calendar day "YYYY-MM-DD" (rendered as a date) */
  day: z.iso.date(),
};

/** A message key prefix per var: `<prefix>.<value>` is the label shown in place of the code when the key exists. */
export type VarLabels = Readonly<Record<string, string>>;

/** What `defineKind` takes: the registry's shape with a typed `z.object` vars schema, plus the optional labels. */
export type KindInput<S extends z.ZodObject> = Omit<NotificationKindDef<z.infer<S>>, "vars"> & { vars: S; labels?: VarLabels };

/** A declared kind as the registry stores it, with its labels attached (read back through `labelsOf`). */
export type DeclaredKind = NotificationKindDef & { labels?: VarLabels };

const KIND_RE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

/**
 * Declares one kind. Throws at module load on a malformed declaration (a programming error caught by every test
 * run): a kind name over 40 chars or not `<area>.<event>`, a refused vars key, a label for an unknown var.
 */
export function defineKind<S extends z.ZodObject>(def: KindInput<S>): DeclaredKind {
  if (!KIND_RE.test(def.kind) || def.kind.length > 40) throw new Error(`notify kind "${def.kind}": not <area>.<event> (≤ 40 chars)`);
  const keys = Object.keys(def.vars.shape);
  const banned = keys.find(isBannedVarKey);
  if (banned) throw new Error(`notify kind "${def.kind}": vars key "${banned}" is customer data`);
  for (const key of Object.keys(def.labels ?? {})) if (!keys.includes(key)) throw new Error(`notify kind "${def.kind}": label for unknown var "${key}"`);
  return def as unknown as DeclaredKind;
}

/** The labels a kind declared (none for the kinds of other tracks unless they use `defineKind` with labels). */
export function labelsOf(def: NotificationKindDef | undefined): VarLabels {
  return (def as DeclaredKind | undefined)?.labels ?? {};
}

/** The vars keys of a kind's schema, or null when the schema is not a `z.object` (refused by `test:platform`). */
export function varKeysOf(schema: z.ZodType): string[] | null {
  return schema instanceof z.ZodObject ? Object.keys(schema.shape) : null;
}

/* ------------------------------------------------------------------ */
/* Link builders                                                       */
/* ------------------------------------------------------------------ */

type LinkFn<V> = (vars: V, ctx: { handle: string | null }) => string;

/**
 * `/app/<handle><path>` (`appHref`'s form), or "" without a handle (stored NULL: a kind with a store link sent to a
 * target without a store). `path` is "" for the dashboard root, else starts with "/", "?" or "#".
 */
export function tenantLink<V>(path: "" | `/${string}` | `?${string}` | `#${string}` | ((vars: V) => string)): LinkFn<V> {
  return (vars, ctx) => (ctx.handle ? `/app/${ctx.handle}${typeof path === "function" ? path(vars) : path}` : "");
}

/** `/app/account<path>`: a user-level page, the same for every store. */
export function accountLink<V>(path: "" | `/${string}` | `?${string}` | ((vars: V) => string)): LinkFn<V> {
  return (vars) => `/app/account${typeof path === "function" ? path(vars) : path}`;
}

/** `/admin<path>`: the relative form of `consoleHref(path)` (src/lib/urls/index.ts), stored relative (PLA-§18.1). */
export function consolePath<V>(path: `/${string}` | ((vars: V) => string)): LinkFn<V> {
  return (vars) => {
    const rest = typeof path === "function" ? path(vars) : path;
    return rest === "/" ? "/admin" : `/admin${rest}`;
  };
}

/* ------------------------------------------------------------------ */
/* The link rule (PLA-§18.1 rev 4, core §I.4 rev 3, SEC-6)             */
/* ------------------------------------------------------------------ */

/** The three link shapes a notification may carry (the registry's NOTIFY_LINK_RES, kept in step by `test:platform`). */
export const NOTIFY_LINK_SHAPES: readonly RegExp[] = [/^\/app\/[a-z0-9-]{3,30}(?:[/?#]|$)/, /^\/app\/account(?:[/?#]|$)/, /^\/admin(?:[/?#]|$)/];

/**
 * A link a notification may carry, else null (stored NULL, never rewritten): one of the three in-app shapes, at most
 * 300 chars, and nothing a browser could resolve elsewhere: no scheme, no `//`, no backslash, no dot segment (plain
 * or percent-encoded) in the path, no control or space character.
 */
export function notifyLinkOk(link: string | null | undefined): string | null {
  if (typeof link !== "string" || link.length === 0 || link.length > 300) return null;
  if (!NOTIFY_LINK_SHAPES.some((re) => re.test(link))) return null;
  if (/[\u0000- \u007f\\]/.test(link)) return null;
  const path = link.split(/[?#]/, 1)[0]!;
  if (path.includes("//")) return null;
  const segments = path.split("/").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return "%";
    }
  });
  if (segments.some((s) => s === "." || s === ".." || s === "%" || /[/\\]/.test(s))) return null;
  return link;
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** The placeholder names of an ICU-lite template (`{var}` and the variable of `{n, plural, …}`), sorted, unique. */
export function placeholdersOf(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/\{(\w+)(?:\s*,\s*plural\s*,)?/g)) out.add(m[1]!);
  return [...out].sort();
}

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The Intl locale of an admin locale, with Latin digits (PLA-§N.1). */
const INTL_LOCALE: Record<string, string> = { en: "en-GB", fr: "fr-FR", ar: "ar-MA-u-nu-latn" };

/**
 * A var value as the reader sees it: an ISO instant as a date and time in `timeZone`, an ISO day as a date, anything
 * else unchanged. Pure (Intl only).
 */
export function displayVar(value: string | number, locale: string, timeZone: string): string | number {
  if (typeof value !== "string") return value;
  const intl = INTL_LOCALE[locale] ?? "en-GB";
  try {
    if (INSTANT_RE.test(value)) {
      const at = new Date(value);
      if (!Number.isNaN(at.getTime())) return new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone }).format(at);
    } else if (DAY_RE.test(value)) {
      const at = new Date(`${value}T12:00:00Z`);
      if (!Number.isNaN(at.getTime())) return new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" }).format(at);
    }
  } catch {
    // an unknown time zone: the raw value
  }
  return value;
}

/**
 * A notification's title and body as a reader sees them (pure): each var through its kind's label
 * (`<prefix>.<value>` in the reader's locale when the key exists), ISO dates in `timeZone`, the kind's texts
 * `notify.<kind>.title` / `.body`; staff free text is the body as typed. `notify.ts` renders the centre with it and
 * the console's lifecycle preview shows the store the same words before anything is sent (PLA-§8.0).
 */
export function kindText(
  kind: string,
  labels: VarLabels,
  vars: Readonly<Record<string, string | number>> | null,
  locale: AdminLocale,
  timeZone: string,
  text: string | null,
): { title: string; body: string | null } {
  const shown: MessageVars = {};
  for (const [key, value] of Object.entries(vars ?? {})) {
    const prefix = labels[key];
    const label = prefix && typeof value === "string" ? messageOf(`${prefix}.${value}`, locale) : undefined;
    shown[key] = label ?? displayVar(value, locale, timeZone);
  }
  const bodyKey = `notify.${kind}.body`;
  return { title: t(`notify.${kind}.title`, shown, locale), body: text ?? (messageOf(bodyKey, locale) !== undefined ? t(bodyKey, shown, locale) : null) };
}
