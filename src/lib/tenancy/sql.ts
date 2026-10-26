/**
 * Store predicates and insert values (docs/STORE-SAAS.md §E.3). Every query of a tenant table goes through
 * one of these, so the store predicate can't be forgotten and the store id only ever comes from the scope:
 *
 *   db.select().from(pages).where(whereStore(pages, scope, eq(pages.status, "published")))
 *   db.update(pages).set(patch).where(byId(pages, scope, id))          // 0 rows → not_found
 *   db.insert(pages).values(storeValues(scope, { id, slug, … }))
 *   sql`SELECT … FROM order_stats WHERE ${storeSql(scope)} AND day >= ${from}`
 *
 * Framework-free (no DB connection): imported by repositories, the lint's fixtures and tests.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { StoreScope } from "./types";

/** A scope must name a store: a hand-built `{}` cast to StoreScope fails loudly instead of matching nothing. */
function storeIdOf(scope: StoreScope): string {
  const id = (scope as { storeId?: unknown } | null | undefined)?.storeId;
  if (typeof id !== "string" || id.length === 0) throw new Error("tenancy: a StoreScope without a store id reached a query");
  return id;
}

/** `store_id = <scope's store>` on `table`. */
export function inStore<T extends { storeId: AnyMySqlColumn }>(table: T, scope: StoreScope): SQL {
  return eq(table.storeId, storeIdOf(scope));
}

/**
 * The store predicate AND every given condition (undefined conditions are skipped, like drizzle's `and`). Each
 * condition is wrapped in parentheses: drizzle inlines a nested SQL fragment without them, so a `sql\`a OR b\``
 * condition would otherwise read `store_id = ? and a OR b` and widen to every store (review C0b F2).
 */
export function whereStore<T extends { storeId: AnyMySqlColumn }>(table: T, scope: StoreScope, ...conds: (SQL | undefined)[]): SQL {
  return and(inStore(table, scope), ...conds.map((c) => (c === undefined ? undefined : sql`(${c})`)))!;
}

/** One row by its id, inside the scope's store: another store's id and a missing id both match nothing (§E.3 rule 3). */
export function byId<T extends { storeId: AnyMySqlColumn; id: AnyMySqlColumn }>(table: T, scope: StoreScope, id: string): SQL {
  return and(eq(table.id, id), inStore(table, scope))!;
}

/**
 * Insert values with `storeId` from the scope (§E.3 rule 4). Input schemas never carry a store id; one that
 * does and names another store is a programming error and throws rather than being silently replaced.
 */
export function storeValues<V extends object>(scope: StoreScope, values: V): V & { storeId: string } {
  const storeId = storeIdOf(scope);
  const given = (values as { storeId?: unknown }).storeId;
  if (given !== undefined && given !== storeId) throw new Error("tenancy: insert values carry a storeId of another store");
  return { ...values, storeId };
}

const COLUMN_RE = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$/;

/**
 * `store_id = ?` for raw SQL (stats, usage, rollups), the value bound as a parameter. `column` names an
 * aliased column (`"o.store_id"`); it is an identifier from code, never input, and is checked anyway.
 */
export function storeSql(scope: StoreScope, column = "store_id"): SQL {
  if (!COLUMN_RE.test(column)) throw new Error(`tenancy: bad store column "${column}"`);
  return sql`${sql.raw(column)} = ${storeIdOf(scope)}`;
}
