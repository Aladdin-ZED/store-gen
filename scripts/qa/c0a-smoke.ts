/**
 * C0a exit smoke (docs/STORE-SAAS.md §K.1, C0a exit criteria 3 and 4): drizzle 0004 on an empty throwaway database
 * (applied, then a no-op), then ONE page under /app/<h> through the minimal seam, over real HTTP on `next dev`.
 *
 *   npx tsx scripts/qa/c0a-smoke.ts [--db cod_test_c0a_smoke] [--port 3451] [--keep]
 *
 *  1. creates the database on XAMPP's MariaDB (root, no password, 127.0.0.1:3306; the name must be cod_test_c0a_*)
 *  2. runMigrations twice: every migration applied, then "up-to-date" with 0 applied
 *  3. seeds two active stores with their owners, an agent of store A, a signed-in outsider and a super_admin with no
 *     membership (plain SQL: users, sessions with mfa_passed, stores, store_members)
 *  4. starts `next dev -p <port>` with DATABASE_URL pointing at that database and PLATFORM_URL = http://localhost:<port>
 *     (every other variable comes from .env.local as usual)
 *  5. GET /app/<A> with each session cookie: the owner and the agent 200 through the seam; a non-member, platform staff
 *     without a membership and store B's owner 404; store B's handle for A's owner 404; an unknown handle 404 with the
 *     non-member's status; signed out → the sign-in page
 *  6. stops the server it started (its own process tree; never 3400 / 3450, the owner's dev servers), restores the
 *     files `next dev` rewrites (next-env.d.ts) and drops the database unless --keep
 *
 * The session tokens are random test values for the throwaway database and are never printed. Exit code 1 when a
 * check fails.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection as tcpConnect } from "node:net";
import { join, resolve } from "node:path";
import mysql from "mysql2/promise";
import { newId } from "@/lib/db/ids";
import { runMigrations } from "@/lib/db/migrate";

const ROOT = resolve(__dirname, "..", "..");
const OWNER_PORTS = new Set([3400, 3450]);
const DB_RE = /^cod_test_c0a_[a-z0-9_]{1,40}$/;
const SESSION_COOKIE = "cs"; // src/lib/auth/config.ts outside production
const SERVER_READY_MS = 240_000;
/** files `next dev` may rewrite in the working tree: put back byte for byte */
const GUARDED_FILES = ["next-env.d.ts", "AGENTS.md", "CLAUDE.md", "tsconfig.json"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` · ${detail}` : ""}`);
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

async function dropDatabase(name: string): Promise<string[]> {
  const conn = await rootConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    const [rows] = (await conn.query("SHOW DATABASES LIKE 'cod\\_test\\_%'")) as unknown as [Record<string, string>[]];
    return rows.map((r) => Object.values(r)[0]!);
  } finally {
    await conn.end();
  }
}

interface Actor {
  userId: string;
  email: string;
  token: string;
}

interface Seed {
  a: { id: string; handle: string; name: string };
  b: { id: string; handle: string; name: string };
  ownerA: Actor;
  agentA: Actor;
  ownerB: Actor;
  outsider: Actor;
  staff: Actor;
}

async function seed(url: string): Promise<Seed> {
  const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4_unicode_ci", timezone: "Z" });
  try {
    const actor = async (email: string, name: string, platformRole = "none"): Promise<Actor> => {
      const userId = newId();
      // never signs in with a password: the session row below stands for a completed sign-in
      await conn.query("INSERT INTO users (id, email, name, password_hash, platform_role, totp_enabled) VALUES (?, ?, ?, ?, ?, ?)", [
        userId,
        email,
        name,
        "c0a-smoke:no-password",
        platformRole,
        platformRole === "none" ? 0 : 1,
      ]);
      const token = randomBytes(32).toString("base64url");
      const sid = createHash("sha256").update(token, "utf8").digest("hex");
      await conn.query("INSERT INTO sessions (id, user_id, mfa_passed, created_at, expires_at, last_seen_at) VALUES (?, ?, 1, NOW(3), NOW(3) + INTERVAL 1 HOUR, NOW(3))", [sid, userId]);
      return { userId, email, token };
    };
    const store = async (handle: string, name: string, createdBy: string) => {
      const id = newId();
      await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed, created_by) VALUES (?, ?, ?, 'active', ?, ?)", [id, handle, name, randomBytes(8).toString("hex"), createdBy]);
      return { id, handle, name };
    };
    const member = (storeId: string, userId: string, role: string) => conn.query("INSERT INTO store_members (store_id, user_id, role) VALUES (?, ?, ?)", [storeId, userId, role]);

    const ownerA = await actor("owner-a@c0a.test", "Owner A");
    const agentA = await actor("agent-a@c0a.test", "Agent A");
    const ownerB = await actor("owner-b@c0a.test", "Owner B");
    const outsider = await actor("outsider@c0a.test", "Outsider");
    const staff = await actor("staff@c0a.test", "Staff", "super_admin");
    const a = await store("atlas-argan", "Atlas Argan", ownerA.userId);
    const b = await store("baraka-home", "Baraka Home", ownerB.userId);
    await member(a.id, ownerA.userId, "owner");
    await member(a.id, agentA.userId, "agent");
    await member(b.id, ownerB.userId, "owner");
    return { a, b, ownerA, agentA, ownerB, outsider, staff };
  } finally {
    await conn.end();
  }
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

/** The PIDs listening on `port` (Windows netstat; elsewhere the spawned child is enough). */
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

function startServer(port: number, databaseUrl: string, log: string[]): ChildProcess {
  const next = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "dev", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, PLATFORM_URL: `http://localhost:${port}`, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const keep = (b: Buffer) => {
    log.push(...b.toString("utf8").split(/\r?\n/).filter(Boolean));
    if (log.length > 400) log.splice(0, log.length - 400);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return child;
}

async function stopServer(child: ChildProcess, port: number): Promise<boolean> {
  if (child.pid) killTree(child.pid);
  for (let i = 0; i < 40; i++) {
    if (!(await portOpen(port))) return true;
    if (i === 10) for (const pid of listeners(port)) killTree(pid); // an orphaned worker of that server, on that port only
    await new Promise((r) => setTimeout(r, 250));
  }
  return !(await portOpen(port));
}

/** The placeholder page prints "(<role>)"; React's SSR may separate the text nodes with empty comments. */
const roleShown = (html: string, role: string) => new RegExp(`\\((?:<!-- -->)?${role}(?:<!-- -->)?\\)`).test(html);

interface Probe {
  status: number;
  location: string | null;
  body: string;
}

async function get(port: number, path: string, token?: string): Promise<Probe> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(180_000),
  });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}

async function waitReady(port: number, path: string, child: ChildProcess): Promise<boolean> {
  const until = Date.now() + SERVER_READY_MS;
  while (Date.now() < until) {
    if (child.exitCode !== null) return false;
    try {
      await get(port, path);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const dbName = arg("db") ?? "cod_test_c0a_smoke";
  const port = Number(arg("port") ?? 3451);
  const keep = process.argv.includes("--keep");
  if (!DB_RE.test(dbName)) throw new Error(`c0a-smoke: --db must match ${DB_RE}`);
  if (!Number.isInteger(port) || port < 1024 || OWNER_PORTS.has(port)) throw new Error("c0a-smoke: --port must be a free port other than 3400 / 3450");
  if (await portOpen(port)) throw new Error(`c0a-smoke: something already listens on ${port}; not touching it`);

  const url = `mysql://root@127.0.0.1:3306/${dbName}`;
  const guarded = new Map(GUARDED_FILES.map((f) => [f, existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : null]));
  let child: ChildProcess | null = null;
  const log: string[] = [];

  try {
    // criterion 3: 0004 on an empty database, twice
    await createDatabase(dbName);
    const migrationsFolder = join(ROOT, "drizzle");
    const first = await runMigrations({ databaseUrl: url, migrationsFolder });
    check("migrate on an empty DB", first.status === "applied" && first.applied === first.total, JSON.stringify({ status: first.status, applied: first.applied, total: first.total }));
    const second = await runMigrations({ databaseUrl: url, migrationsFolder });
    check("migrate again (no-op)", second.status === "up-to-date" && second.applied === 0, JSON.stringify({ status: second.status, applied: second.applied, total: second.total }));

    // criterion 4: one page under /app/<h> through the minimal seam
    const s = await seed(url);
    console.log(`  seeded ${dbName}: stores ${s.a.handle} (owner + agent) and ${s.b.handle} (owner), an outsider, a super_admin`);
    child = startServer(port, url, log);
    const pathA = `/app/${s.a.handle}`;
    if (!(await waitReady(port, pathA, child))) {
      check("next dev ready", false, `no answer within ${SERVER_READY_MS / 1000} s`);
      return;
    }
    check("next dev ready", true, `port ${port}`);

    const owner = await get(port, pathA, s.ownerA.token);
    check(
      "owner of A → 200 through the seam",
      owner.status === 200 && owner.body.includes(s.a.name) && owner.body.includes('data-sg-seam="member"') && roleShown(owner.body, "owner"),
      `status ${owner.status}`,
    );
    const agent = await get(port, pathA, s.agentA.token);
    check("agent of A → 200 (store.read)", agent.status === 200 && roleShown(agent.body, "agent"), `status ${agent.status}`);
    const outsider = await get(port, pathA, s.outsider.token);
    check("signed-in non-member → 404", outsider.status === 404 && !outsider.body.includes(s.a.name), `status ${outsider.status}`);
    const staff = await get(port, pathA, s.staff.token);
    check("platform staff without a membership → 404", staff.status === 404 && !staff.body.includes(s.a.name), `status ${staff.status}`);
    const ownerB = await get(port, pathA, s.ownerB.token);
    check("owner of B on A's handle → 404", ownerB.status === 404 && !ownerB.body.includes(s.a.name), `status ${ownerB.status}`);
    const otherHandle = await get(port, `/app/${s.b.handle}`, s.ownerA.token);
    check("owner of A on B's handle → 404", otherHandle.status === 404 && !otherHandle.body.includes(s.b.name), `status ${otherHandle.status}`);
    const unknown = await get(port, "/app/no-such-store", s.ownerA.token);
    check("unknown handle → 404, same status as a non-member", unknown.status === 404 && unknown.status === outsider.status, `status ${unknown.status}`);
    const signedOut = await get(port, pathA);
    check(
      "signed out → the sign-in page",
      signedOut.status >= 300 && signedOut.status < 400 && (signedOut.location ?? "").includes(`/login?next=${encodeURIComponent(pathA)}`) && !(signedOut.location ?? "").includes("/admin/") && !signedOut.body.includes(s.a.name),
      `status ${signedOut.status} → ${signedOut.location ?? "-"}`,
    );
  } finally {
    if (child) check(`server on ${port} stopped`, await stopServer(child, port), `listeners after: ${listeners(port).length}`);
    for (const [file, bytes] of guarded) {
      const path = join(ROOT, file);
      const now = existsSync(path) ? readFileSync(path) : null;
      if (bytes && (!now || !now.equals(bytes))) {
        writeFileSync(path, bytes);
        console.log(`  restored ${file} (next dev rewrote it)`);
      }
    }
    if (!keep) {
      const left = await dropDatabase(dbName);
      check(`database ${dbName} dropped`, !left.includes(dbName), `cod_test_* left: ${left.length ? left.join(", ") : "none"}`);
    }
    if (results.some((r) => !r.ok) && log.length) console.log(`--- next dev (last lines) ---\n${log.slice(-40).join("\n")}`);
  }
}

main()
  .catch((err) => {
    check("c0a-smoke", false, err instanceof Error ? err.message : String(err));
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? `✗ c0a smoke: ${failed} of ${results.length} checks failed` : `✓ c0a smoke: all ${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  });
