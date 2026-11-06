/**
 * The ⌘K search's orchestration, pure (P2 SHELL; platform.md PLA-§22.13, UX-02; docs/STORE-SAAS.md §I.3): every
 * provider of one store searched in parallel within its budget, the answers checked and grouped for the palette. No
 * database and no request: src/lib/admin-data/search.ts hands it the providers (the tracks' and the shell's) and
 * `test:shell` runs it on fakes.
 *
 * - A provider later than `budgetMs` is dropped from this answer and named in `slow` (its groups show "Slow, try
 *   again"), never awaited; one that throws is dropped the same way, its failure returned for the caller's log.
 * - A hit is kept only when it is well formed, of one of its provider's kinds, and links into the store on screen
 *   (`/app/<handle>`): a provider bug cannot send the palette to another store or off the dashboard.
 * - Groups follow the providers' order; each keeps at most `SEARCH_GROUP_MAX` hits, de-duplicated by kind and id.
 *
 * The shell provider's matching is here too (`settingHits`, `memberHits`): src/lib/admin-data/search.ts reads the
 * member list and hands it over.
 */
import { z } from "zod";
import { settingsTabs } from "@/components/admin/shell/store-nav";
import type { SearchHit, SearchProvider } from "@/lib/admin-data/search/types";
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import { t, type AdminLocale, type MessageKey } from "@/lib/i18n/admin";
import type { MemberSummary } from "@/lib/tenancy/invites";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";

/** `?q=`: 2-60 characters once trimmed (PLA-§22.13; the palette searches the server from 2 characters). */
export const SearchQuery = z
  .string()
  .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(2).max(60));

export const SEARCH_GROUP_MAX = 8;

/** The palette group of a hit kind without its own `group` (the `shell.cmdk.group.*` labels). */
export const KIND_GROUPS: Readonly<Record<string, MessageKey>> = {
  page: "shell.cmdk.group.pages",
  order: "shell.cmdk.group.orders",
  customer: "shell.cmdk.group.customers",
  setting: "shell.cmdk.group.settings",
  member: "shell.cmdk.group.members",
};
/** Hits of a kind no label names land under "Go to". */
export const OTHER_GROUP: MessageKey = "shell.cmdk.group.jump";

export interface SearchGroup {
  /** = the label key: one group per label */
  id: MessageKey;
  label: MessageKey;
  hits: SearchHit[];
}

/** A provider left out of this answer, with the groups it would have filled. */
export interface SlowProvider {
  id: string;
  groups: MessageKey[];
}

export interface StoreSearchResult {
  groups: SearchGroup[];
  slow: SlowProvider[];
}

export interface ProviderFailure {
  id: string;
  reason: "timeout" | "error";
  detail?: string;
}

const groupOfKind = (kind: string): MessageKey => KIND_GROUPS[kind] ?? OTHER_GROUP;

/** The groups a provider fills (its kinds' labels, in order, once each). */
export function providerGroups(p: Pick<SearchProvider, "kinds">): MessageKey[] {
  return [...new Set(p.kinds.map(groupOfKind))];
}

/** A link into the store on screen: `/app/<handle>` itself or below it (a path, a query or a fragment). */
export function inStoreHref(href: unknown, home: string): href is string {
  if (typeof href !== "string" || href.length > 500) return false;
  if (href === home) return true;
  return [`${home}/`, `${home}?`, `${home}#`].some((p) => href.startsWith(p)) && !href.includes("//", home.length) && !/[\s\\]/.test(href);
}

function wellFormed(hit: unknown, provider: SearchProvider, home: string): hit is SearchHit {
  if (!hit || typeof hit !== "object") return false;
  const h = hit as Partial<SearchHit>;
  return (
    typeof h.id === "string" &&
    h.id.length > 0 &&
    typeof h.kind === "string" &&
    provider.kinds.includes(h.kind) &&
    typeof h.title === "string" &&
    h.title.trim().length > 0 &&
    (h.subtitle === undefined || typeof h.subtitle === "string") &&
    (h.group === undefined || typeof h.group === "string") &&
    inStoreHref(h.href, home)
  );
}

/**
 * Runs `providers` for one store and query. `home` is the store's dashboard root (`appHref(handle)`); `viewer` is
 * what a provider receives (its role restricts it: an agent's own queue).
 */
export async function runSearchProviders(
  providers: readonly SearchProvider[],
  scope: StoreScope,
  q: string,
  viewer: Parameters<SearchProvider["search"]>[2],
  opts: { budgetMs: number; home: string },
): Promise<{ result: StoreSearchResult; failures: ProviderFailure[] }> {
  const settled = await Promise.all(
    providers.map(async (p): Promise<{ p: SearchProvider; hits: unknown[] } | { p: SearchProvider; failure: ProviderFailure }> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), opts.budgetMs);
      });
      try {
        // a synchronous throw is that provider's failure, not the route's
        const work = Promise.resolve().then(() => p.search(scope, q, viewer));
        work.catch(() => undefined); // a rejection after the budget is not an unhandled rejection
        const answer = await Promise.race([work, late]);
        if (answer === "timeout") return { p, failure: { id: p.id, reason: "timeout" } };
        if (!Array.isArray(answer)) return { p, failure: { id: p.id, reason: "error", detail: "not a list" } };
        return { p, hits: answer };
      } catch (err) {
        return { p, failure: { id: p.id, reason: "error", detail: err instanceof Error ? err.message : String(err) } };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const groups = new Map<MessageKey, SearchGroup>();
  const seen = new Set<string>();
  const slow: SlowProvider[] = [];
  const failures: ProviderFailure[] = [];
  for (const s of settled) {
    if ("failure" in s) {
      failures.push(s.failure);
      slow.push({ id: s.p.id, groups: providerGroups(s.p) });
      continue;
    }
    for (const hit of s.hits) {
      if (!wellFormed(hit, s.p, opts.home)) continue;
      const key = `${hit.kind}\u0000${hit.id}`;
      if (seen.has(key)) continue;
      const label = (hit.group as MessageKey | undefined) ?? groupOfKind(hit.kind);
      const group = groups.get(label) ?? { id: label, label, hits: [] };
      if (group.hits.length >= SEARCH_GROUP_MAX) continue;
      seen.add(key);
      group.hits.push({ id: hit.id, kind: hit.kind, title: hit.title, href: hit.href, ...(hit.subtitle ? { subtitle: hit.subtitle } : {}), ...(hit.group ? { group: hit.group } : {}) });
      groups.set(label, group);
    }
  }
  return { result: { groups: [...groups.values()], slow }, failures };
}

/** Every hit of an answer, in group order (the R1.0 palette's flat list until its rework). */
export function flatHits(result: StoreSearchResult): SearchHit[] {
  return result.groups.flatMap((g) => g.hits);
}

/* ------------------------------------------------------------------ */
/* the shell provider's matching                                       */
/* ------------------------------------------------------------------ */

/** Who searches: the provider's `{ userId, role }`, plus what the shell provider needs (grants, language, the store's links). */
export interface SearchViewer {
  userId: string;
  role: StoreRole;
  locale: AdminLocale;
  /** the store on screen: every hit links under `/app/<handle>` */
  handle: string;
  /** the store's mode: the settings tabs follow the registry's filter (a hidden tab is never found); "landing" when absent */
  mode?: StoreMode;
  can(p: StorePermission): boolean;
}

/** Lower case, no diacritics, single spaces: "Écran  Général" and "ecran general" match. */
export function foldSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The shell provider's hits per kind. */
export const SHELL_MAX = 6;

/**
 * The settings tabs the viewer may open (the registry's `settings` group, any track's, `settingsTabs`) whose label,
 * one-line description or keywords (in their language or English) match.
 */
export function settingHits(viewer: Pick<SearchViewer, "can" | "locale" | "handle" | "mode">, q: string): SearchHit[] {
  const needle = foldSearch(q);
  const nav = { handle: viewer.handle, mode: viewer.mode ?? "landing", can: viewer.can };
  const english = new Map(settingsTabs(nav, "en").map((tab) => [tab.id, tab]));
  const hits: SearchHit[] = [];
  for (const tab of settingsTabs(nav, viewer.locale)) {
    const en = english.get(tab.id);
    const hay = [tab.label, tab.description ?? "", en?.label ?? "", en?.description ?? "", tab.id, ...tab.keywords].map(foldSearch);
    if (!hay.some((h) => h.includes(needle))) continue;
    hits.push({ id: tab.id, kind: "setting", title: tab.label, ...(tab.description ? { subtitle: tab.description } : {}), href: tab.href, group: "shell.cmdk.group.settings" });
    if (hits.length >= SHELL_MAX) break;
  }
  return hits;
}

/** Team members whose name or e-mail match (the e-mail as the list shows it: masked under "view as store"); the role as subtitle. */
export function memberHits(members: readonly Pick<MemberSummary, "userId" | "name" | "email" | "role" | "status">[], viewer: Pick<SearchViewer, "locale" | "handle">, q: string): SearchHit[] {
  const needle = foldSearch(q);
  const hits: SearchHit[] = [];
  for (const m of members) {
    if (![m.name, m.email].some((v) => foldSearch(v).includes(needle))) continue;
    const role = t(`team.role.${m.role}` as MessageKey, undefined, viewer.locale);
    hits.push({ id: m.userId, kind: "member", title: m.name.trim() || m.email, subtitle: m.status === "active" ? role : `${role} · ${t("shell.cmdk.member_paused", undefined, viewer.locale)}`, href: appHref(viewer.handle, "/team"), group: "shell.cmdk.group.members" });
    if (hits.length >= SHELL_MAX) break;
  }
  return hits;
}

