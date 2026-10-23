/**
 * One-time boot tasks run by ONE process (several workers, a deploy overlapping a restart):
 *
 *   const r = await withBootLock(async () => { await task(); return n; });   // → { ran: true, value } | { ran: false }
 *
 * GET_LOCK('<database>:cod_boot', 10) on a dedicated connection (MySQL named locks are connection
 * scoped and server wide, hence the database prefix — like the migration lock in ./migrate.ts),
 * RELEASE_LOCK in `finally`. When another process holds the lock past the timeout the task is
 * skipped: that process runs it. Framework-free (instrumentation and CLI scripts).
 */
import mysql from "mysql2/promise";
import { databaseUrl } from "./url";

export interface BootLockOptions {
  databaseUrl?: string;
  /** seconds to wait for another process holding the lock */
  timeoutSec?: number;
}

export type BootLockResult<T> = { ran: true; value: T } | { ran: false };

export async function withBootLock<T>(fn: () => Promise<T>, opts: BootLockOptions = {}): Promise<BootLockResult<T>> {
  const url = databaseUrl(opts.databaseUrl ?? process.env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL is not set");
  const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4_unicode_ci", timezone: "Z", connectTimeout: 10_000 });
  try {
    const [[{ dbName }]] = (await conn.query("SELECT DATABASE() AS dbName")) as unknown as [[{ dbName: string | null }]];
    const lockName = `${dbName ?? "app"}:cod_boot`.slice(0, 64);
    const [[{ got }]] = (await conn.query("SELECT GET_LOCK(?, ?) AS got", [lockName, opts.timeoutSec ?? 10])) as unknown as [[{ got: number | null }]];
    if (got !== 1) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
    }
  } finally {
    await conn.end().catch(() => undefined);
  }
}
