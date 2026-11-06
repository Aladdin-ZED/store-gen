import "server-only";
/**
 * The console ⌘K server search (platform.md PLA-§4.4, UX-02 console side; PD35): what `GET /api/admin/search?q=` answers.
 *
 *   const r = await consoleSearch(ctx, "argan");     // stores, people, the open reviews of matching stores
 *
 * Sources: stores by name or handle prefix (10, `stores_handle_uq` / a name prefix); people by exact e-mail (every role)
 * or name prefix (admin+ only); the open review of a matching store (`sr_store_kind_idx`); the typed patterns resolve
 * at once: an order id (the global primary key, masked card), a 26-character id (a store or a person), "@handle".
 * Every field is masked per role (PD35: an analyst's search never returns a full e-mail). Bucket
 * `p:console:search:<userId>` 60 a minute; a query shorter than 2 characters answers nothing.
 */
import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { isPlatformRole, type PlatformRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { signupReviews, stores, users } from "@/lib/db/schema";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import type { PlatformCtx, StoreStatus } from "@/lib/tenancy/types";
import { sellerContact, type Masked } from "./mask";
import { lookupOrderById, type OrderCard } from "./order-lookup";
import { ORDER_ID_RE } from "./profile/orders";

export const SEARCH_PER_MINUTE = 60;
export const SEARCH_STORES = 10;
export const SEARCH_PEOPLE = 10;
const ULID_RE = /^[0-9A-Z]{26}$/;

export interface SearchStore {
  id: string;
  handle: string | null;
  name: string;
  status: StoreStatus;
  href: string;
}

export interface SearchPerson {
  id: string;
  name: string;
  email: string | Masked;
  platformRole: PlatformRole | "none";
  href: string;
}

export interface SearchReview {
  id: string;
  storeId: string;
  handle: string | null;
  kind: string;
  status: string;
  band: string;
  score: number;
  href: string;
}

export interface ConsoleSearchResult {
  q: string;
  /** what the query was read as: an order id, an id, an e-mail, a handle or free text */
  pattern: "order" | "id" | "email" | "handle" | "text";
  order: OrderCard | null;
  stores: SearchStore[];
  people: SearchPerson[];
  reviews: SearchReview[];
}

const likePrefix = (q: string) => `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const isAdminPlus = (ctx: PlatformCtx) => ctx.role === "admin" || ctx.role === "super_admin";
const empty = (q: string, pattern: ConsoleSearchResult["pattern"]): ConsoleSearchResult => ({ q, pattern, order: null, stores: [], people: [], reviews: [] });

const storeHref = (id: string) => `/admin/stores/${id}`;
const personHref = (id: string) => `/admin/users/${id}`;

async function storesMatching(where: SQL): Promise<SearchStore[]> {
  const rows = await db.select({ id: stores.id, handle: stores.handle, name: stores.name, status: stores.status }).from(stores).where(where).orderBy(asc(stores.name), asc(stores.id)).limit(SEARCH_STORES);
  return rows.map((r) => ({ ...r, href: storeHref(r.id) }));
}

async function peopleMatching(ctx: PlatformCtx, where: SQL): Promise<SearchPerson[]> {
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, platformRole: users.platformRole, disabledReason: users.disabledReason }).from(users).where(where).orderBy(asc(users.name), asc(users.id)).limit(SEARCH_PEOPLE);
  return rows
    .filter((r) => r.disabledReason !== "deleted")
    .map((r) => ({ id: r.id, name: r.name, email: sellerContact(ctx.role, { email: r.email, phone: null }).email, platformRole: isPlatformRole(r.platformRole) ? r.platformRole : "none", href: personHref(r.id) }));
}

/** The open signup / reopen / request rows of the matched stores (sr_store_kind_idx). */
async function openReviews(storeIds: readonly string[]): Promise<SearchReview[]> {
  if (!storeIds.length) return [];
  // tenancy: platform console search: the open review rows of at most 10 matched stores (codes and numbers only)
  const rows = await db
    .select({ id: signupReviews.id, storeId: signupReviews.storeId, kind: signupReviews.kind, status: signupReviews.status, band: signupReviews.band, score: signupReviews.score, handle: stores.handle })
    .from(signupReviews)
    .innerJoin(stores, eq(stores.id, signupReviews.storeId))
    .where(and(inArray(signupReviews.storeId, [...storeIds]), inArray(signupReviews.status, ["pending", "needs_info", "snoozed"])))
    .limit(SEARCH_STORES * 2);
  return rows.map((r) => ({ ...r, href: `/admin/queue?review=${r.id}` }));
}

/** PLA-§4.4 (`console.read`): every result reachable from the keyboard; masked per role. */
export async function consoleSearch(ctx: PlatformCtx, input: string): Promise<ConsoleSearchResult> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const q = (typeof input === "string" ? input : "").normalize("NFKC").trim().slice(0, 120);
  if (q.length < 2) return empty(q, "text");
  if (!(await rateLimit(platformBucket("console:search", ctx.user.id), SEARCH_PER_MINUTE, 60)).ok) throw new AuthRefusal("rate_limited");

  // 1. typed patterns
  const upper = q.toUpperCase();
  if (ORDER_ID_RE.test(upper)) return { ...empty(q, "order"), order: await lookupOrderById(ctx, upper) };
  if (ULID_RE.test(upper)) {
    const [s, p] = await Promise.all([storesMatching(eq(stores.id, upper)), peopleMatching(ctx, eq(users.id, upper))]);
    return { ...empty(q, "id"), stores: s, people: p };
  }
  if (q.includes("@") && !q.startsWith("@")) {
    return { ...empty(q, "email"), people: await peopleMatching(ctx, eq(users.email, q.toLowerCase())) };
  }

  // 2. stores by name or handle prefix, the people by name prefix (admin+), the open reviews of those stores
  const handle = q.replace(/^@/, "").toLowerCase();
  const pattern: ConsoleSearchResult["pattern"] = q.startsWith("@") ? "handle" : "text";
  const storeWhere: SQL = pattern === "handle" ? sql`${stores.handle} LIKE ${likePrefix(handle)}` : or(sql`${stores.name} LIKE ${likePrefix(q)}`, sql`${stores.handle} LIKE ${likePrefix(handle)}`)!;
  const [found, people] = await Promise.all([
    storesMatching(storeWhere),
    pattern === "text" && isAdminPlus(ctx) ? peopleMatching(ctx, sql`${users.name} LIKE ${likePrefix(q)}`) : Promise.resolve([]),
  ]);
  return { q, pattern, order: null, stores: found, people, reviews: await openReviews(found.map((s) => s.id)) };
}
