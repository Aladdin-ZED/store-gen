/**
 * UI screenshots for build agents and reviewers (maintainer tool, R1 product; docs/STORE-SAAS.md §K.3): a throwaway
 * database with a two-store seed, `next dev` on a port you choose, then Playwright (Edge) screenshots of the paths you
 * name, signed in as the actor you name, at desktop and phone sizes, in light and dark, in en / fr / ar (RTL). It stops
 * everything it started and drops the database unless --keep. Read the PNGs it writes to judge the UI you built.
 *
 *   npx tsx scripts/qa/ui-shots.ts --prefix p2 --port 3462 --paths "/app/{a},/app/{a}/settings/general"
 *        [--as ownerA|managerA|agentA|ownerB|staff|outsider|anon]  [--locale en,ar]  [--dark]  [--full]
 *        [--viewports 1440x900,390x844]  [--seed <file.ts>[#export]]  [--console]  [--out qa/ui-shots/p2]
 *        [--wait 600]  [--keep]  [--turbopack]
 *
 * Run it through the machine-wide mutex (it starts a dev server): node C:/Users/SICO/sg-wt/heavy.mjs <dir> "npx tsx …".
 *
 * - Paths: `{a}` / `{b}` become the two stores' handles (atlas-argan, baraka-home). A path that answers a redirect is
 *   followed by the browser; the shot records the final URL and the first response status.
 * - Actors (all with a completed sign-in, 2FA passed): ownerA, managerA, agentA (store A), ownerB (store B), staff (a
 *   super_admin with no membership), outsider (signed in, no store), anon (signed out). `--locale` sets the actor's
 *   `users.locale` and the visitor cookie, so `ar` renders right-to-left.
 * - `--seed <file.ts>[#name]`: a module of yours exporting `async function <name = uiSeed>(ctx: UiSeedContext)` that adds
 *   rows (pages, orders, leads …) after the base seed; it receives a mysql2 connection to the throwaway database and
 *   the seeded ids. Keep seed modules in files your track owns (e.g. your own check script) or in the git-ignored qa/.
 * - `--console`: opens the platform console's gate first (ADMIN_GATE is read from .env.local and never printed), so
 *   console paths (/admin/...) render for `--as staff`.
 * - Output: <out>/<actor>-<locale>-<scheme>-<w>x<h>-<path>.png and <out>/summary.json (status, final URL, console
 *   errors, page errors, failed requests per shot). Exit 1 when a shot failed to load or a page threw.
 * - Motion: the context uses `reducedMotion: "reduce"` and collapses transitions, so shots show final states.
 * - next dev runs with `--webpack` when node_modules is a junction (the track worktrees: Turbopack refuses files outside
 *   the workspace root), else with Turbopack; `--turbopack` forces Turbopack.
 *
 * Never 3400 / 3450 (the owner's dev servers). The session tokens are random values for the throwaway database and are
 * never printed. The database name is cod_test_<prefix>_ui.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection as tcpConnect } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { newId } from "@/lib/db/ids";
import { runMigrations } from "@/lib/db/migrate";

const ROOT = resolve(__dirname, "..", "..");
const OWNER_PORTS = new Set([3400, 3450]);
const SESSION_COOKIE = "cs"; // src/lib/auth/config.ts outside production
const LOCALE_COOKIE = "sgl"; // src/lib/auth/locale.ts outside production
const SERVER_READY_MS = 300_000;
const NAV_TIMEOUT_MS = 180_000;
const GUARDED_FILES = ["next-env.d.ts", "AGENTS.md", "CLAUDE.md", "tsconfig.json"];
const ACTORS = ["ownerA", "managerA", "agentA", "ownerB", "staff", "outsider", "anon"] as const;
type ActorName = (typeof ACTORS)[number];
const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`ui-shots: ${message}`);
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* database                                                            */
/* ------------------------------------------------------------------ */

const rootConnection = () => mysql.createConnection({ host: "127.0.0.1", port: 3306, user: "root", charset: "utf8mb4_unicode_ci", timezone: "Z" });

async function createDatabase(name: string): Promise<void> {
  const conn = await rootConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

async function dropDatabase(name: string): Promise<void> {
  const conn = await rootConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
  } finally {
    await conn.end();
  }
}

export interface UiActor {
  userId: string;
  email: string;
  token: string;
}

/** What a `--seed` module receives. */
export interface UiSeedContext {
  conn: mysql.Connection;
  databaseUrl: string;
  stores: { a: { id: string; handle: string; name: string }; b: { id: string; handle: string; name: string } };
  actors: Record<Exclude<ActorName, "anon">, UiActor>;
  newId: () => string;
}

async function baseSeed(conn: mysql.Connection, url: string): Promise<UiSeedContext> {
  const actor = async (email: string, name: string, platformRole = "none"): Promise<UiActor> => {
    const userId = newId();
    // never signs in with a password: the session row below stands for a completed sign-in
    await conn.query("INSERT INTO users (id, email, name, password_hash, platform_role, totp_enabled) VALUES (?, ?, ?, ?, ?, ?)", [
      userId,
      email,
      name,
      "ui-shots:no-password",
      platformRole,
      platformRole === "none" ? 0 : 1,
    ]);
    const token = randomBytes(32).toString("base64url");
    const sid = createHash("sha256").update(token, "utf8").digest("hex");
    await conn.query("INSERT INTO sessions (id, user_id, mfa_passed, created_at, expires_at, last_seen_at) VALUES (?, ?, 1, NOW(3), NOW(3) + INTERVAL 4 HOUR, NOW(3))", [sid, userId]);
    return { userId, email, token };
  };
  const store = async (handle: string, name: string, createdBy: string) => {
    const id = newId();
    await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed, created_by) VALUES (?, ?, ?, 'active', ?, ?)", [id, handle, name, randomBytes(8).toString("hex"), createdBy]);
    return { id, handle, name };
  };
  const member = (storeId: string, userId: string, role: string) => conn.query("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, ?)", [storeId, userId, role]);

  const actors = {
    ownerA: await actor("salma@atlas-argan.test", "Salma Benali"),
    managerA: await actor("youssef@atlas-argan.test", "Youssef Amrani"),
    agentA: await actor("hajar@atlas-argan.test", "Hajar Idrissi"),
    ownerB: await actor("karim@baraka-home.test", "Karim Tazi"),
    staff: await actor("ops@store-gen.test", "Platform Ops", "super_admin"),
    outsider: await actor("visitor@example.test", "Nadia Visitor"),
  };
  const a = await store("atlas-argan", "Atlas Argan", actors.ownerA.userId);
  const b = await store("baraka-home", "Baraka Home", actors.ownerB.userId);
  await member(a.id, actors.ownerA.userId, "owner");
  await member(a.id, actors.managerA.userId, "manager");
  await member(a.id, actors.agentA.userId, "agent");
  await member(b.id, actors.ownerB.userId, "owner");
  return { conn, databaseUrl: url, stores: { a, b }, actors, newId };
}

/* ------------------------------------------------------------------ */
/* server                                                              */
/* ------------------------------------------------------------------ */

function portOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const s = tcpConnect({ host: "127.0.0.1", port });
    s.once("connect", () => {
      s.destroy();
      done(true);
    });
    s.once("error", () => done(false));
  });
}

function listeners(port: number): number[] {
  if (process.platform !== "win32") return [];
  const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout ?? "";
  const pids = new Set<number>();
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 5 && cols[3] === "LISTENING" && cols[1]!.endsWith(`:${port}`)) pids.add(Number(cols[4]));
  }
  return [...pids].filter((pid) => pid > 0);
}

function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }
}

/** True when node_modules is a junction / symlink (the track worktrees), where Turbopack refuses to compile. */
function nodeModulesIsLink(): boolean {
  try {
    return lstatSync(join(ROOT, "node_modules")).isSymbolicLink();
  } catch {
    return false;
  }
}

function prepareAssets(): void {
  for (const script of ["scripts/build-landing-assets.mjs", "scripts/build-admin-css.mjs"]) {
    const r = spawnSync(process.execPath, [join(ROOT, script)], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) fail(`${script} failed: ${(r.stderr || r.stdout || "").slice(-600)}`);
  }
}

function startServer(port: number, databaseUrl: string, webpack: boolean, log: string[]): ChildProcess {
  const next = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const args = [next, "dev", "-p", String(port)];
  if (webpack) args.push("--webpack");
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, PLATFORM_URL: `http://localhost:${port}`, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const keep = (b: Buffer) => {
    log.push(...b.toString("utf8").split(/\r?\n/).filter(Boolean));
    if (log.length > 4000) log.splice(0, log.length - 4000);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return child;
}

async function stopServer(child: ChildProcess, port: number): Promise<boolean> {
  if (child.pid) killTree(child.pid);
  for (let i = 0; i < 40; i++) {
    if (!(await portOpen(port))) return true;
    if (i === 10) for (const pid of listeners(port)) killTree(pid);
    await new Promise((r) => setTimeout(r, 250));
  }
  return !(await portOpen(port));
}

async function waitReady(port: number, child: ChildProcess): Promise<boolean> {
  const until = Date.now() + SERVER_READY_MS;
  while (Date.now() < until) {
    if (child.exitCode !== null) return false;
    try {
      await fetch(`http://localhost:${port}/login`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  return false;
}

/** ADMIN_GATE from .env.local (never printed). */
function adminGate(): string | null {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*ADMIN_GATE\s*=\s*(.*)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, "").trim() || null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* shots                                                               */
/* ------------------------------------------------------------------ */

const QA_CSS =
  "*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;" +
  "animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important;caret-color:transparent!important}" +
  // the Next.js dev indicator is not part of the product
  "nextjs-portal{display:none!important}";

interface ShotResult {
  path: string;
  actor: ActorName;
  locale: Locale;
  scheme: "light" | "dark";
  viewport: string;
  file: string | null;
  status: number | null;
  finalUrl: string | null;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  ms: number;
}

const slug = (p: string) => (p.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "_") || "root").slice(0, 80);

async function shoot(
  browser: Browser,
  opts: { port: number; actor: ActorName; token: string | null; locale: Locale; scheme: "light" | "dark"; width: number; height: number; full: boolean; wait: number; gate: string | null; out: string },
  path: string,
): Promise<ShotResult> {
  const t0 = Date.now();
  const base = `http://localhost:${opts.port}`;
  const context: BrowserContext = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.width < 600 ? 2 : 1,
    isMobile: opts.width < 600,
    hasTouch: opts.width < 600,
    colorScheme: opts.scheme,
    reducedMotion: "reduce",
    locale: opts.locale === "ar" ? "ar-MA" : opts.locale === "fr" ? "fr-MA" : "en-US",
    extraHTTPHeaders: { "accept-language": opts.locale },
  });
  const cookies: { name: string; value: string; url: string }[] = [{ name: LOCALE_COOKIE, value: opts.locale, url: base }];
  if (opts.token) cookies.push({ name: SESSION_COOKIE, value: opts.token, url: base });
  await context.addCookies(cookies);
  await context.addInitScript(`(() => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(QA_CSS)}; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); })();`);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 300)));
  page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url().replace(base, "")} ${r.failure()?.errorText ?? ""}`.slice(0, 200)));
  let status: number | null = null;
  let file: string | null = null;
  let finalUrl: string | null = null;
  try {
    if (opts.gate) await page.goto(`${base}/${opts.gate}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    status = res?.status() ?? null;
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
    await page.waitForTimeout(opts.wait);
    finalUrl = page.url().replace(base, "").replace(opts.gate ?? "\u0000", "<gate>");
    file = join(opts.out, `${opts.actor}-${opts.locale}-${opts.scheme}-${opts.width}x${opts.height}-${slug(path)}.png`);
    await page.screenshot({ path: file, fullPage: opts.full });
  } catch (err) {
    pageErrors.push(`navigation: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  } finally {
    await context.close();
  }
  return { path, actor: opts.actor, locale: opts.locale, scheme: opts.scheme, viewport: `${opts.width}x${opts.height}`, file, status, finalUrl, consoleErrors, pageErrors, failedRequests, ms: Date.now() - t0 };
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main(): Promise<number> {
  const prefix = arg("prefix") ?? fail("--prefix <track> is required (the database is cod_test_<prefix>_ui)");
  if (!/^[a-z0-9]{1,12}$/.test(prefix)) fail("--prefix must be 1-12 lowercase letters or digits");
  const port = Number(arg("port") ?? fail("--port is required"));
  if (!Number.isInteger(port) || port < 1024 || OWNER_PORTS.has(port)) fail("--port must be a free port other than 3400 / 3450");
  if (await portOpen(port)) fail(`something already listens on ${port}; not touching it`);
  const actor = (arg("as") ?? "ownerA") as ActorName;
  if (!ACTORS.includes(actor)) fail(`--as must be one of ${ACTORS.join(", ")}`);
  const paths = (arg("paths") ?? fail('--paths "/a,/b" is required'))
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const locales = (arg("locale") ?? "en").split(",").map((l) => l.trim()) as Locale[];
  if (locales.some((l) => !LOCALES.includes(l))) fail("--locale takes en, fr, ar (comma-separated)");
  const viewports = (arg("viewports") ?? "1440x900,390x844").split(",").map((v) => {
    const m = /^(\d{3,4})x(\d{3,4})$/.exec(v.trim());
    if (!m) fail(`bad viewport ${v}`);
    return { width: Number(m[1]), height: Number(m[2]) };
  });
  const schemes: ("light" | "dark")[] = flag("dark") ? ["light", "dark"] : ["light"];
  const out = resolve(ROOT, arg("out") ?? join("qa", "ui-shots", prefix));
  const wait = Math.max(0, Number(arg("wait") ?? 600) || 0);
  const webpack = !flag("turbopack") && nodeModulesIsLink();
  const dbName = `cod_test_${prefix}_ui`;
  const url = `mysql://root@127.0.0.1:3306/${dbName}`;
  mkdirSync(out, { recursive: true });

  const guarded = new Map(GUARDED_FILES.map((f) => [f, existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : null]));
  const log: string[] = [];
  let child: ChildProcess | null = null;
  let browser: Browser | null = null;
  const results: ShotResult[] = [];
  let failed = false;
  try {
    await createDatabase(dbName);
    const migrated = await runMigrations({ databaseUrl: url, migrationsFolder: join(ROOT, "drizzle") });
    if (migrated.status !== "applied" && migrated.status !== "up-to-date") fail(`migrations: ${JSON.stringify(migrated)}`);
    const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4_unicode_ci", timezone: "Z", multipleStatements: true });
    let ctx: UiSeedContext;
    try {
      ctx = await baseSeed(conn, url);
      const seedArg = arg("seed");
      if (seedArg) {
        const [file, name = "uiSeed"] = seedArg.split("#");
        const abs = isAbsolute(file!) ? file! : resolve(ROOT, file!);
        const mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
        const fn = (mod[name] ?? (mod.default as Record<string, unknown> | undefined)?.[name]) as ((c: UiSeedContext) => Promise<void>) | undefined;
        if (typeof fn !== "function") fail(`--seed: ${file} exports no function ${name}`);
        await fn(ctx);
      }
      const userId = actor === "anon" ? null : ctx.actors[actor].userId;
      if (userId) await conn.query("UPDATE users SET locale = ? WHERE id = ?", [locales[0], userId]);
    } finally {
      await conn.end();
    }
    const token = actor === "anon" ? null : ctx.actors[actor].token;
    const resolved = paths.map((p) => p.replaceAll("{a}", ctx.stores.a.handle).replaceAll("{b}", ctx.stores.b.handle));

    prepareAssets();
    child = startServer(port, url, webpack, log);
    if (!(await waitReady(port, child))) {
      console.log(`✗ next dev did not answer within ${SERVER_READY_MS / 1000} s`);
      failed = true;
      return 1;
    }
    console.log(`next dev ready on ${port} (${webpack ? "webpack" : "turbopack"}); shooting ${resolved.length} path(s) as ${actor}`);
    const gate = flag("console") ? adminGate() : null;
    if (flag("console") && !gate) console.log("  (--console: no ADMIN_GATE in .env.local; console paths will 404)");
    browser = await chromium.launch({ channel: "msedge" });
    for (const locale of locales) {
      if (locale !== locales[0] && token) {
        const c2 = await mysql.createConnection({ uri: url, charset: "utf8mb4_unicode_ci", timezone: "Z" });
        await c2.query("UPDATE users SET locale = ? WHERE id = ?", [locale, ctx.actors[actor as Exclude<ActorName, "anon">].userId]);
        await c2.end();
      }
      for (const scheme of schemes)
        for (const vp of viewports)
          for (const p of resolved) {
            const r = await shoot(browser, { port, actor, token, locale, scheme, width: vp.width, height: vp.height, full: flag("full"), wait, gate, out }, p);
            results.push(r);
            const bad = !r.file || r.pageErrors.length > 0 || (r.status !== null && r.status >= 500);
            if (bad) failed = true;
            console.log(
              `${bad ? "✗" : "✓"} ${p} [${locale} ${scheme} ${r.viewport}] → ${r.status ?? "-"} ${r.finalUrl ?? ""}${r.consoleErrors.length ? ` · ${r.consoleErrors.length} console error(s)` : ""}${r.pageErrors.length ? ` · ${r.pageErrors[0]}` : ""}${r.file ? `\n    ${r.file}` : ""}`,
            );
          }
    }
    return failed ? 1 : 0;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (child) {
      const stopped = await stopServer(child, port);
      if (!stopped) console.log(`! the server on ${port} did not stop cleanly`);
    }
    for (const [file, bytes] of guarded) {
      const p = join(ROOT, file);
      const now = existsSync(p) ? readFileSync(p) : null;
      if (bytes && (!now || !now.equals(bytes))) writeFileSync(p, bytes);
    }
    writeFileSync(join(out, "summary.json"), JSON.stringify({ results }, null, 1));
    if (failed && log.length) {
      const logFile = join(tmpdir(), `ui-shots-next-${port}.log`);
      writeFileSync(logFile, log.join("\n"));
      console.log(`--- next dev (last lines; the whole log: ${logFile}) ---\n${log.filter((l) => !/^\s*$/.test(l)).slice(-30).join("\n")}`);
    }
    if (!flag("keep")) await dropDatabase(dbName).catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`ui-shots: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
  },
);
