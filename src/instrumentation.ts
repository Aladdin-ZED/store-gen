/**
 * Runs once per server start, before the first request is handled (Node.js runtime only). The boot order of
 * docs/STORE-SAAS.md §H.4, never crashing the process (a failure is logged; the app keeps serving what it can and the
 * next start retries):
 *  1. configuration warnings (never secret values): auth (an unusable APP_SECRET is logged as an error, since every
 *     order fails with it), addressing and the edge (§C.1, §H.7), the data directory, env aliases, the test context
 *     (§E.4); the gate SHA the build was cleared by (§H.10)
 *  2. pending database migrations (serialised across processes with a DB lock); a process that times out on the lock
 *     skips steps 5 and 6, which the process holding it runs
 *  3. the media storage check: arrives with the filesystem backend (§G.2, src/lib/media/storage/check.ts); while
 *     media lives in the database there is nothing to check
 *  4. expired sessions purged
 *  5. in ONE process (withBootLock), in the background so they never delay serving: published checksums, the store #1
 *     conversion (tenancy_v1, with the pixel library migration inside it), the protected brands and flags seeds
 *     (src/lib/db/boot-tasks.ts runBootTasks)
 *  6. the read-only checks `[upgrade-check]` and `[tenancy-check]` (runBootChecks)
 * Until the conversion has re-sealed them, store #1's legacy settings are read through openLegacy (ENGC-19), so
 * serving during step 5 is safe.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as typeof globalThis & { __codBooted?: boolean };
  if (g.__codBooted) return;
  g.__codBooted = true;

  // 1. configuration
  const { authConfigWarnings, isAppSecretConfigured } = await import("./lib/auth/config");
  // visitor IPs are hashed with APP_SECRET: without a usable one every order fails too, not only the
  // admin, so its line goes out at error level (hosts' log views filter and colour by level)
  const secretBroken = !isAppSecretConfigured();
  for (const warning of authConfigWarnings()) {
    if (secretBroken && warning.startsWith("APP_SECRET")) console.error(`[boot] ERROR: ${warning}`);
    else console.warn(`[boot] ${warning}`);
  }
  const { platformConfigLines } = await import("./lib/db/boot-config");
  for (const line of await platformConfigLines()) {
    if (line.level === "error") console.error(`[boot] ERROR: ${line.text}`);
    else if (line.level === "warn") console.warn(`[boot] ${line.text}`);
    else console.info(`[boot] ${line.text}`);
  }
  // §E.4 (CCR r1.0-t2-3): marks the test identity context as misconfigured for this process at start-up, so the
  // first request never logs it again (it never throws)
  const { identityContextMisconfigured } = await import("./lib/tenancy/context");
  identityContextMisconfigured();

  if (!process.env.DATABASE_URL) {
    console.error("[boot] DATABASE_URL is not set — skipping migrations.");
    return;
  }

  // 2. migrations
  let migrationsSettled = true;
  try {
    const { runMigrations } = await import("./lib/db/migrate");
    const result = await runMigrations();
    if (result.status === "lock-timeout") {
      // that process may still be inside 0004: it runs steps 5 and 6 itself once it has migrated
      migrationsSettled = false;
      console.warn("[boot] another process held the migration lock for too long; skipped migrations and the one-time tasks this time.");
    } else if (result.status === "applied") {
      console.info(`[boot] applied ${result.applied} migration(s) in ${result.durationMs} ms.`);
    } else {
      console.info(`[boot] database schema up to date (${result.total} migration(s)).`);
    }
  } catch (err) {
    console.error("[boot] database migration failed:", err instanceof Error ? err.message : err);
    return;
  }

  // 3. media storage check: none while media lives in the database (§G.2)

  // 4. sessions
  try {
    const { purgeExpiredSessions } = await import("./lib/auth/session");
    const purged = await purgeExpiredSessions();
    if (purged > 0) console.info(`[boot] purged ${purged} expired session(s).`);
  } catch (err) {
    console.error("[boot] session cleanup failed:", err instanceof Error ? err.message : err);
  }

  // 5. and 6., in the background (not after a lock timeout; runBootTasks also refuses while a migration is pending)
  if (migrationsSettled) void bootTasks();
}

/** Steps 5 and 6: the one-time tasks in the process that gets the boot lock, then the read-only checks. Never throws. */
async function bootTasks(): Promise<void> {
  try {
    const { runBootChecks, runBootTasks } = await import("./lib/db/boot-tasks");
    const res = await runBootTasks();
    if (res.ran) await runBootChecks();
  } catch (err) {
    console.error("[boot] one-time tasks failed:", err instanceof Error ? err.message : err);
  }
}
