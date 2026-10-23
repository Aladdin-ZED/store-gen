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

function create() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 6,
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
