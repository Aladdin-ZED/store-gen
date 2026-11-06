/**
 * Error logging without request data (no PII in logs).
 *
 * A failed database call must never be logged by its message: drizzle's DrizzleQueryError message is
 * "Failed query: <sql>\nparams: <every bound value>" — customer name, phone, address… — and the
 * driver's own sqlMessage / sql can quote values too ("Duplicate entry '+2126…' for key …"). Those
 * errors are reduced to their driver code (ER_LOCK_DEADLOCK, PROTOCOL_CONNECTION_LOST, ECONNREFUSED…).
 */
import { DrizzleQueryError } from "drizzle-orm";

type ErrLike = { code?: unknown; errno?: unknown; sqlState?: unknown; sqlMessage?: unknown; sql?: unknown; query?: unknown; params?: unknown; cause?: unknown };

const isQueryError = (e: ErrLike): boolean => e instanceof DrizzleQueryError || ("query" in e && "params" in e);
const isDriverError = (e: ErrLike): boolean => "sqlMessage" in e || "sqlState" in e || "sql" in e || (typeof e.code === "string" && typeof e.errno === "number");

/**
 * Database part of an error chain → "CODE (errno)" (or "query_failed"); null when no link of the
 * chain (the error and its causes) comes from the database layer.
 */
function dbErrorCode(err: unknown): string | null {
  let fromDb = false;
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e && typeof e === "object"; depth++) {
    const x = e as ErrLike;
    if (isQueryError(x)) fromDb = true;
    if (isDriverError(x)) {
      const code = typeof x.code === "string" && /^[A-Z0-9_]{2,64}$/.test(x.code) ? x.code : "db_error";
      const errno = typeof x.errno === "number" ? ` (${x.errno})` : "";
      return `${code}${errno}`;
    }
    e = x.cause;
  }
  return fromDb ? "query_failed" : null;
}

/** One-line, PII-free description of an error for the server log. */
export function errorSummary(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const db = dbErrorCode(err);
  return db ? `${err.name}: ${db}` : `${err.name}: ${err.message}`;
}

/** Log an unexpected failure without request data (no PII in logs). */
export function logError(scope: string, err: unknown): void {
  console.error(`[${scope}]`, errorSummary(err));
  // the error ring (§H.5, CCR r1-p8-8): area = the scope before ':' ("orders:create" → "orders"); never throws, never
  // waits; a lazy import keeps this file free of server-only and the module graph acyclic (errors.ts imports this file)
  void import("@/lib/jobs/errors").then((m) => m.recordError(scope.split(":")[0] ?? scope, err), () => undefined);
}
