import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import { databaseUrl } from "./url";

/**
 * Single pooled connection for the process (Hostinger shared plans cap connections per user —
 * keep the pool small). Host must be 127.0.0.1 on Hostinger (localhost resolves to ::1 there).
 */
declare global {
  var __codDb: { pool: mysql.Pool; db: MySql2Database<typeof schema> } | undefined;
}

const DEFAULT_POOL_SIZE = 6;

/**
 * The query pool's connectionLimit (§H.7 "Database connection budget", ENGC-12; P0b, CCR P8-15): DB_POOL_SIZE when it
 * is an integer from 2 to 20, else 6. Unset or blank → 6 silently; set but invalid → one warning (create() runs once per
 * process) naming only the variable, never a value.
 */
export function poolSize(raw: string | undefined = process.env.DB_POOL_SIZE): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_POOL_SIZE;
  const n = /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  if (Number.isInteger(n) && n >= 2 && n <= 20) return n;
  console.warn(`[db] DB_POOL_SIZE is not an integer from 2 to 20; using ${DEFAULT_POOL_SIZE}`);
  return DEFAULT_POOL_SIZE;
}

function create() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: poolSize(),
    maxIdle: 2,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    dateStrings: false,
    supportBigNumbers: true,
  });
  // Column defaults (CURRENT_TIMESTAMP(3)) and NOW() must be UTC like the dates written from JS.
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  const db = drizzle(pool, { schema, mode: "default" });
  return { pool, db };
}

function get() {
  globalThis.__codDb ??= create();
  return globalThis.__codDb;
}

/** Drizzle instance (lazy — importing this module never connects at build time). */
export const db = new Proxy({} as MySql2Database<typeof schema>, {
  get(_t, prop) {
    return Reflect.get(get().db, prop);
  },
});

export function pool(): mysql.Pool {
  return get().pool;
}

export { schema };
