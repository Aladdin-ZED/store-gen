/**
 * qa:r1-exit, the R1.0 exit scenario (docs/STORE-SAAS.md §K.1 exit criterion 5) as one browser run against a
 * PRODUCTION build (`next build`, then `next start` on port 3452) with a throwaway database and its own environment:
 *
 *   npm run qa:r1-exit [-- --port 3452] [--db cod_test_fin_e2e | cod_test_p0_*] [--data-dir <dir>] [--build | --no-build]
 *                         [--keep] [--headed] [--shots <dir>] [--verbose]
 *
 *  a) console: `/admin` is the neutral 404 without the gate; `/<ADMIN_GATE>` 303s and sets the gate cookie; the first
 *     super_admin is bootstrapped at `/admin/setup` with SETUP_TOKEN, enrols TOTP (codes computed here, RFC 6238), opens
 *     store #1 on the first-run store step, signs out, signs in again with password + TOTP and opens the console;
 *  b) store #1: the owner lands on `/app/<h1>`, generates a landing page from a fixture photo (the wizard, local AI off
 *     the network: every non-localhost request is aborted), publishes it from the builder and opens
 *     `/s/<h1>/<slug>` (200, the §F.6 store-document headers, no Set-Cookie);
 *  c) a REAL order through the public page form (a valid Moroccan mobile) and a TEST order (D54: the page opened with a
 *     `?sg-test=` token minted by `signTestToken`, the real function, with this run's APP_SECRET); both are in
 *     `/app/<h1>/orders`, the test one marked "Test"; in the database both carry store #1's id and only the test one
 *     `is_test`; Google Sheets runs only when E2E_SHEETS_SPREADSHEET_ID and GOOGLE_SA_JSON_B64 are set in this
 *     process's environment (never read from .env.local), else it is skipped with that reason;
 *  d) the console creates an invite code; a second user signs up with it (`invite` mode, the default with S mode off),
 *     gets a PENDING store h2, builds a page and previews it, cannot publish it (the builder's publish answers the
 *     refusal and the database keeps the page a draft), gets the neutral 404 on `/app/<h1>/**` and on store #1's ids
 *     under its own handle; the console's review queue lists h2;
 *  e) cleanup: the server on the port is stopped (its own process tree only; never 3400 / 3450), the database dropped
 *     (unless --keep) and the data directory removed when this run created it.
 *
 * Build: an existing `.next` build is reused when it is newer than every file under src/, next.config.ts and
 * package.json (the gate runs `npm run build` right before `test:e2e`); otherwise, or with --build, this script runs
 * `npm run build` itself. --no-build never builds (and fails on a stale build).
 *
 * Environment of the server: this process's environment, every key named in `.env*` blanked (their values are never
 * read, only their names), then random APP_SECRET / ADMIN_GATE / SETUP_TOKEN / CRON_KEY, PLATFORM_URL = PUBLIC_URL =
 * http://localhost:<port>, DATA_DIR, DATABASE_URL. Secrets are never printed. Exit code 1 when a check fails.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { createConnection as tcpConnect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import mysql from "mysql2/promise";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const ROOT = resolve(__dirname, "..", "..", "..");
const OWNER_PORTS = new Set([3400, 3450]);
const DB_RE = /^cod_test_(?:fin|p0)_[a-z0-9_]{1,40}$/;
const SERVER_READY_MS = 180_000;
const NAV_MS = 60_000;

/* ------------------------------------------------------------------ */
/* arguments, results                                                  */
/* ------------------------------------------------------------------ */

const ARGS = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = ARGS.indexOf(`--${name}`);
  return i >= 0 ? ARGS[i + 1] : undefined;
};
const flag = (name: string) => ARGS.includes(`--${name}`);
const VERBOSE = flag("verbose");

type Result = { step: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
const timings: { step: string; ms: number }[] = [];
let currentStep = "setup";

function check(name: string, ok: boolean, detail: unknown = ""): boolean {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ step: currentStep, name, ok, detail: d });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${d && (!ok || VERBOSE) ? ` · ${d.slice(0, 600)}` : ""}`);
  return ok;
}
function note(text: string): void {
  console.log(`  · ${text}`);
}

class StepAbort extends Error {}
/** A check the rest of the step depends on: fails the step when false. */
function must(name: string, ok: boolean, detail: unknown = ""): void {
  if (!check(name, ok, detail)) throw new StepAbort(name);
}

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */

function newestSource(): { file: string; mtime: number } {
  let best = { file: "", mtime: 0 };
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) visit(p);
      else if (st.mtimeMs > best.mtime) best = { file: p, mtime: st.mtimeMs };
    }
  };
  visit(join(ROOT, "src"));
  for (const f of ["next.config.ts", "package.json"]) {
    const p = join(ROOT, f);
    if (existsSync(p) && statSync(p).mtimeMs > best.mtime) best = { file: p, mtime: statSync(p).mtimeMs };
  }
  return best;
}

function buildState(): { fresh: boolean; why: string } {
  const id = join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(id)) return { fresh: false, why: "no production build in .next" };
  const builtAt = statSync(id).mtimeMs;
  const newest = newestSource();
  if (newest.mtime > builtAt) return { fresh: false, why: `${newest.file.slice(ROOT.length + 1)} is newer than the build` };
  return { fresh: true, why: `build ${Math.round((Date.now() - builtAt) / 60_000)} min old, newer than every source file` };
}

function runBuild(): boolean {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  return r.status === 0;
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

let dbConn: mysql.Connection | null = null;
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await dbConn!.query(sql, params);
  return rows as T[];
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

/** Key names of the env files Next loads in production (values are never read). */
function envFileKeys(): string[] {
  const keys = new Set<string>();
  for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (m) keys.add(m[1]!);
    }
  }
  return [...keys];
}

/** Keys the run decides itself (empty = off), whatever this shell or an env file holds. */
const FORCED_EMPTY = [
  "ADMIN_HOST",
  "ADMIN_IP_ALLOWLIST",
  "STORE_ROOT_DOMAIN",
  "EDGE_KEY",
  "EDGE_KEY_PREV",
  "LEGACY_PLATFORM_HOSTS",
  "BEHIND_CLOUDFLARE",
  "TRUSTED_PROXY_HOPS",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "SMTP_URL",
  "MAIL_FROM",
  "ANTHROPIC_API_KEY",
  "SG_TEST_CONTEXT",
  "MEDIA_DIR",
  "MEDIA_CACHE_DIR",
  "DATA_DIR_BUDGET_BYTES",
  "APP_TIMEZONE",
  "DB_QUOTA_MB",
];

interface RunEnv {
  port: number;
  base: string;
  databaseUrl: string;
  dataDir: string;
  appSecret: string;
  gate: string;
  setupToken: string;
  cronKey: string;
  sheets: { spreadsheetId: string } | null;
}

function serverEnv(run: RunEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of envFileKeys()) env[k] = "";
  for (const k of FORCED_EMPTY) env[k] = "";
  if (!run.sheets) env.GOOGLE_SA_JSON_B64 = "";
  else env.GOOGLE_SA_JSON_B64 = process.env.GOOGLE_SA_JSON_B64;
  Object.assign(env, {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: run.databaseUrl,
    APP_SECRET: run.appSecret,
    ADMIN_GATE: run.gate,
    SETUP_TOKEN: run.setupToken,
    CRON_KEY: run.cronKey,
    PLATFORM_URL: run.base,
    PUBLIC_URL: run.base,
    DATA_DIR: run.dataDir,
  });
  return env;
}

function startServer(run: RunEnv, log: string[]): ChildProcess {
  const next = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "start", "-p", String(run.port)], {
    cwd: ROOT,
    env: serverEnv(run),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const keep = (b: Buffer) => {
    for (const line of b.toString("utf8").split(/\r?\n/).filter(Boolean)) {
      log.push(line);
      if (VERBOSE) console.log(`    [server] ${line}`);
    }
    if (log.length > 5000) log.splice(0, log.length - 5000);
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

async function waitHealthy(base: string, child: ChildProcess): Promise<{ ok: boolean; body: unknown }> {
  const until = Date.now() + SERVER_READY_MS;
  let last: unknown = null;
  while (Date.now() < until) {
    if (child.exitCode !== null) return { ok: false, body: `server exited with ${child.exitCode}` };
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10_000) });
      last = await res.json().catch(() => null);
      if (res.ok) return { ok: true, body: last };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return { ok: false, body: last };
}

/* ------------------------------------------------------------------ */
/* TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30 s), computed here           */
/* ------------------------------------------------------------------ */

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error("not a base32 secret");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const off = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}
const totpStep = () => Math.floor(Date.now() / 30_000);

/** A code no earlier login used (replay protection: each step is accepted once). */
let lastTotpStep = 0;
async function freshTotp(secret: string): Promise<string> {
  let step = totpStep();
  if (step <= lastTotpStep) {
    // the ±1 drift window accepts the next step right away
    step = lastTotpStep + 1;
    if (step > totpStep() + 1) {
      await new Promise((r) => setTimeout(r, (step - 1) * 30_000 - Date.now() + 500));
    }
  }
  lastTotpStep = step;
  return totp(secret, step);
}

/* ------------------------------------------------------------------ */
/* browser helpers                                                     */
/* ------------------------------------------------------------------ */

const blockedHosts = new Set<string>();
const pageErrors: string[] = [];
const contexts: BrowserContext[] = [];

async function newActor(browser: Browser, base: string): Promise<BrowserContext> {
  // the desktop Edge a customer runs (headless mode announces itself in the user agent, which the order API's risk
  // score rightly reads as an automated client)
  const v = browser.version();
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36 Edg/${v}`;
  const ctx = await browser.newContext({ baseURL: base, locale: "en-US", userAgent, viewport: { width: 1280, height: 900 }, acceptDownloads: false });
  ctx.setDefaultTimeout(30_000);
  ctx.setDefaultNavigationTimeout(NAV_MS);
  // nothing leaves this machine: the local AI's model downloads, fonts, vendors (the run must be offline-safe)
  await ctx.route(
    (url) => !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    (route) => {
      blockedHosts.add(new URL(route.request().url()).host);
      return route.abort("blockedbyclient");
    },
  );
  ctx.on("page", (p) => watchPage(p));
  contexts.push(ctx);
  return ctx;
}

/** After a failed step: what every open page shows (alerts, invalid fields, error text) and a screenshot of each. */
async function diagnose(label: string): Promise<void> {
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.isClosed()) continue;
      try {
        // a string, not a function: tsx's name helpers do not exist in the page
        const facts = await p.evaluate(`(() => {
          const text = (el) => (el.textContent || "").split(String.fromCharCode(10)).join(" ").trim();
          return {
            alerts: [...document.querySelectorAll('[role="alert"], [data-sonner-toast], .text-destructive')].map(text).filter(Boolean).slice(0, 8),
            invalid: [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => e.name || e.id).slice(0, 8),
            heading: text(document.querySelector("h1") || document.body).slice(0, 120),
          };
        })()`);
        note(`page ${p.url()} · ${JSON.stringify(facts)}`);
      } catch {
        /* closed meanwhile */
      }
      await shot(p, `fail-${label}`);
    }
  }
}

function watchPage(p: Page): void {
  p.on("pageerror", (err) => pageErrors.push(`${p.url()} · ${err.message.slice(0, 200)}`));
}

let shotsDir: string | null = null;
let shotN = 0;
async function shot(p: Page, label: string): Promise<void> {
  if (!shotsDir) return;
  try {
    const file = join(shotsDir, `${String(++shotN).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
    await p.screenshot({ path: file, fullPage: false });
    note(`screenshot ${file}`);
  } catch {
    /* the page may be gone */
  }
}

const pathOf = (p: Page) => new URL(p.url()).pathname;

async function waitPath(p: Page, re: RegExp, ms = NAV_MS): Promise<boolean> {
  try {
    await p.waitForURL((u) => re.test(u.pathname), { timeout: ms });
    return true;
  } catch {
    return false;
  }
}

/** GET with the context's cookies (a document request, no redirects followed). */
async function getAs(ctx: BrowserContext, path: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const res = await ctx.request.get(path, { maxRedirects: 0, failOnStatusCode: false });
  return { status: res.status(), headers: res.headers(), body: await res.text() };
}

/* ------------------------------------------------------------------ */
/* scenario pieces                                                     */
/* ------------------------------------------------------------------ */

interface Owner {
  name: string;
  email: string;
  password: string;
  totpSecret: string;
}

interface StoreRef {
  id: string;
  handle: string;
  name: string;
}

/** A well-formed id no row has (Crockford base32, 26 characters): what "missing" answers. */
const GHOST_ID = "01JZZZZZZZZZZZZZZZZZZZGHST";

const FIXTURE_PHOTO = join(ROOT, "public", "dev-fixtures", "998b0718f328c3caadde3ff7afbafd16-960.webp"); // argan-amber (CREDITS.md)

/**
 * The generator wizard at /app/<h>/generate with one fixture photo: photos → analysis → details → offers → three
 * directions → "Use this direction" → the builder. Returns the new page id.
 */
async function generatePage(p: Page, handle: string, product: { name: string; price: string }): Promise<{ pageId: string }> {
  await p.goto(`/app/${handle}/generate`);
  const file = p.locator('input[type="file"]').first();
  await file.waitFor({ state: "attached" });
  await file.setInputFiles(FIXTURE_PHOTO);
  await p.getByText(/1 photo ready/).waitFor({ timeout: 60_000 });
  check("wizard: the fixture photo uploaded to the store's library", true);

  const next = () => p.getByRole("button", { name: /^Continue/ });
  await next().click(); // → analysis
  await p.waitForTimeout(400);
  await next().click(); // → details
  await p.getByLabel("Product name").fill(product.name);
  await p.getByLabel("Price").fill(product.price);
  await next().click(); // → offers
  await p.getByRole("button", { name: /Design 3 directions/ }).click();

  const use = p.getByRole("button", { name: /Use this direction|Choose ad tracking first/ }).first();
  await use.waitFor({ timeout: 90_000 });
  if (/Choose ad tracking first/.test((await use.textContent()) ?? "")) {
    // per-page pixels on (PAGE_PIXELS): the page's answer is "no pixel" (nothing is configured in this store)
    await p.getByText("No pixel on this page", { exact: true }).first().click();
  }
  const enabled = p.getByRole("button", { name: "Use this direction" }).first();
  await enabled.click();
  const ok = await waitPath(p, new RegExp(`^/app/${handle}/pages/[0-9A-HJKMNP-TV-Z]{26}/edit$`), 90_000);
  must("wizard: \"Use this direction\" created a draft and opened the builder", ok, pathOf(p));
  const pageId = /\/pages\/([0-9A-HJKMNP-TV-Z]{26})\/edit/.exec(pathOf(p))![1]!;
  return { pageId };
}

/**
 * The honest way past the publish dialog's sample-content step (§M.3): the run never ticks "the reviews, chats and
 * numbers on this page are real" for example content. It hides every visible section the draft still marks
 * `sample` (the checklist's own rule, read from the saved draft) with the section list's "Hide section" button.
 */
async function hideSampleSections(p: Page, pageId: string): Promise<string[]> {
  const [row] = await q<{ draft: unknown }>("SELECT draft FROM pages WHERE id = ?", [pageId]);
  const draft = (typeof row?.draft === "string" ? JSON.parse(row.draft) : row?.draft) as { sections?: { id: string; type: string; hidden?: boolean; data?: { sample?: boolean } }[] } | null;
  const samples = (draft?.sections ?? []).filter((sec) => sec.data?.sample === true && !sec.hidden);
  for (const sec of samples) {
    const li = p.locator(`li[data-section-id="${sec.id}"]`);
    await li.scrollIntoViewIfNeeded();
    await li.hover();
    await li.getByRole("button", { name: "Hide section" }).click();
    await li.getByRole("button", { name: "Show section" }).waitFor();
  }
  return samples.map((sec) => sec.type);
}

/** The builder's Publish → the dialog's publish button. Returns the dialog's final state. */
async function publishFromBuilder(p: Page): Promise<{ live: boolean; disabled: boolean; text: string }> {
  const publish = p.getByRole("button", { name: "Publish", exact: true });
  await publish.waitFor({ timeout: 60_000 });
  // the builder saves on its own; give its first autosave a moment
  await p.waitForTimeout(1_500);
  if (await publish.isDisabled()) return { live: false, disabled: true, text: "the Publish button is disabled" };
  await publish.click();
  const dialog = p.getByRole("dialog");
  await dialog.waitFor();
  const confirmReal = dialog.getByRole("checkbox");
  // the honesty step (§M.3): a sample section must be confirmed real or edited first; the run never confirms
  // invented content, so a page that needs it fails here with the dialog's text
  const go = dialog.getByRole("button", { name: /Publish now|Publish without pixels|to fix/ });
  await go.waitFor();
  const label = (await go.textContent()) ?? "";
  if (/to fix/.test(label) || (await go.isDisabled())) {
    return { live: false, disabled: true, text: `${label.trim()} · ${(await dialog.innerText()).slice(0, 400)}${(await confirmReal.count()) ? " (asks to confirm sample content)" : ""}` };
  }
  await go.click();
  // the dialog either turns into "Your page is live" or comes back to its check phase with the server's answer
  const done = dialog.getByText("Your page is live");
  await p.waitForTimeout(800); // the click sets the "Publishing…" phase first
  const until = Date.now() + 60_000;
  let live = false;
  while (Date.now() < until) {
    if (await done.isVisible().catch(() => false)) {
      live = true;
      break;
    }
    const busy = await dialog.getByRole("button", { name: /Publishing…/ }).count().catch(() => 0);
    if (!busy && (await go.isVisible().catch(() => false))) break;
    await p.waitForTimeout(250);
  }
  const text = (await dialog.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
  return { live, disabled: false, text };
}

/** The landing order form: every visible required field, a Moroccan mobile, then submit. */
async function placeOrder(p: Page, customer: { name: string; phone: string; city: string; address: string }): Promise<void> {
  const form = p.locator("form").filter({ has: p.locator('input[name="phone"]') }).first();
  await form.waitFor({ state: "attached" });
  await form.scrollIntoViewIfNeeded();
  let typed = false;
  for (let round = 0; round < 6; round++) {
    const fill = async (sel: string, value: string) => {
      const el = form.locator(sel).first();
      if ((await el.count()) && (await el.isVisible()) && !(await el.inputValue())) await el.fill(value);
    };
    await fill('input[name="name"]', customer.name);
    await fill('input[name="phone"]', customer.phone);
    await fill('input[name="city"]', customer.city);
    await fill('input[name="address"]', customer.address);
    const city = form.locator('select[name="city"]').first();
    if ((await city.count()) && (await city.isVisible()) && !(await city.inputValue())) {
      const values = await city.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
      if (values[0]) await city.selectOption(values[0]);
    }
    const email = form.locator('input[name="email"][required]').first();
    if ((await email.count()) && (await email.isVisible()) && !(await email.inputValue())) await email.fill("client@example.com");
    if (!typed) {
      // a person takes a few seconds between the first field and the submit (the runtime's "form sent in under 3 s"
      // risk flag measures exactly that)
      typed = true;
      await p.waitForTimeout(3_500);
    }
    const submit = form.locator('button[type="submit"]').filter({ visible: true }).first();
    if (await submit.count()) {
      await submit.click();
      return;
    }
    // a steps / box form: its own "next" button
    const nextBtn = form.getByRole("button").filter({ visible: true }).last();
    await nextBtn.click();
    await p.waitForTimeout(400);
  }
  throw new Error("the order form has no submit button");
}

/** Security headers of a store document (§F.6). */
function documentHeaderProblems(h: Record<string, string>, kind: "live" | "test"): string[] {
  const out: string[] = [];
  const csp = h["content-security-policy"] ?? "";
  const directive = (name: string) => (csp.split(";").map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name) ?? "").split(/\s+/).slice(1);
  if (!csp) out.push("no Content-Security-Policy");
  if (!directive("script-src").some((v) => v.startsWith("'sha256-"))) out.push("script-src is not hash-based");
  if (directive("script-src").includes("'unsafe-inline'") && !directive("script-src").some((v) => v.startsWith("'sha256-"))) out.push("script-src allows unsafe-inline");
  for (const d of ["connect-src", "form-action"]) {
    const v = directive(d);
    if (v.includes("'self'")) out.push(`${d} has a bare 'self'`);
    if (!v.some((x) => x.endsWith("/api/public/"))) out.push(`${d} does not name /api/public/`);
  }
  if (!directive("frame-ancestors").length && h["x-frame-options"] === undefined) out.push("no frame-ancestors / X-Frame-Options");
  if (h["x-content-type-options"] !== "nosniff") out.push("no X-Content-Type-Options: nosniff");
  if (!h["referrer-policy"]) out.push("no Referrer-Policy");
  if (h["cross-origin-opener-policy"] !== "same-origin-allow-popups") out.push(`COOP is ${h["cross-origin-opener-policy"] ?? "missing"}`);
  if (!h["cross-origin-resource-policy"]) out.push("no Cross-Origin-Resource-Policy");
  if (!/max-age=\d+/.test(h["strict-transport-security"] ?? "")) out.push("no HSTS");
  if (h["set-cookie"]) out.push("a store document sets a cookie");
  const cc = h["cache-control"] ?? "";
  if (kind === "live" && !/public/.test(cc)) out.push(`live document Cache-Control is "${cc}"`);
  if (kind === "test" && !(/private/.test(cc) && /no-store/.test(cc))) out.push(`test render Cache-Control is "${cc}"`);
  if (kind === "test" && !/noindex/.test(h["x-robots-tag"] ?? "")) out.push("test render is indexable");
  return out;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  currentStep = name;
  console.log(`\n▸ ${name}`);
  const t0 = Date.now();
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof StepAbort)) check(`${name} ran to the end`, false, err instanceof Error ? (VERBOSE ? err.stack : err.message) : String(err));
    await diagnose(name.slice(0, 2));
    return null;
  } finally {
    timings.push({ step: name, ms: Date.now() - t0 });
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}

async function main(): Promise<number> {
  const started = Date.now();
  const port = Number(arg("port") ?? 3452);
  const dbName = arg("db") ?? "cod_test_fin_e2e";
  const keep = flag("keep");
  if (!DB_RE.test(dbName)) throw new Error(`--db must match ${DB_RE}`);
  if (!Number.isInteger(port) || port < 1024 || OWNER_PORTS.has(port)) throw new Error("--port must be a free port other than 3400 / 3450");
  if (await portOpen(port)) throw new Error(`something already listens on ${port}; not touching it`);

  const givenDataDir = arg("data-dir");
  const dataDir = givenDataDir ? resolve(givenDataDir, `r1-exit-${randomBytes(4).toString("hex")}`) : mkdtempSync(join(tmpdir(), "sg-r1-exit-"));
  mkdirSync(dataDir, { recursive: true });
  shotsDir = arg("shots") ?? null;
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  const sheetsId = process.env.E2E_SHEETS_SPREADSHEET_ID;
  const run: RunEnv = {
    port,
    base: `http://localhost:${port}`,
    databaseUrl: `mysql://root@127.0.0.1:3306/${dbName}`,
    dataDir,
    appSecret: randomBytes(48).toString("base64url"),
    gate: `gate${randomBytes(12).toString("hex")}`,
    setupToken: randomBytes(32).toString("base64url"),
    cronKey: randomBytes(32).toString("base64url"),
    sheets: sheetsId && process.env.GOOGLE_SA_JSON_B64 ? { spreadsheetId: sheetsId } : null,
  };

  // the test token is minted by the real function with this run's secret (D54; P3's "Open a test order" calls it)
  process.env.APP_SECRET = run.appSecret;
  process.env.DATABASE_URL = run.databaseUrl;

  let child: ChildProcess | null = null;
  let browser: Browser | null = null;
  const log: string[] = [];

  try {
    await step("build", async () => {
      const state = buildState();
      const force = flag("build");
      if (state.fresh && !force) {
        note(`reusing the production build (${state.why})`);
        return;
      }
      if (flag("no-build")) must("a fresh production build exists (--no-build)", false, state.why);
      note(`building: ${force ? "--build" : state.why}`);
      must("npm run build", runBuild());
    });
    if (results.some((r) => !r.ok)) return 1;

    await step("server", async () => {
      await createDatabase(dbName);
      dbConn = await mysql.createConnection({ uri: run.databaseUrl, charset: "utf8mb4_unicode_ci", timezone: "Z" });
      child = startServer(run, log);
      const health = await waitHealthy(run.base, child);
      must(`next start on ${port} answers /api/health`, health.ok, health.body);
      const body = health.body as { app?: string; db?: unknown };
      must('/api/health → app: "store-gen" (never COD Studio, QA-01)', body?.app === "store-gen", body);
      const [mig] = await q<{ n: number }>("SELECT COUNT(*) AS n FROM __drizzle_migrations").catch(() => [{ n: -1 }]);
      check("boot applied the migrations to the empty database", Number(mig?.n) > 0, `${mig?.n} migration rows`);
      browser = await chromium.launch({ channel: "msedge", headless: !flag("headed") });
      note(`Edge ${browser.version()} (Playwright channel msedge), data dir ${givenDataDir ? "in the given folder" : "in the OS temp folder"}`);
    });
    if (!browser || results.some((r) => !r.ok)) return 1;
    const b: Browser = browser;

    const owner: Owner = { name: "Salma Idrissi", email: "owner@r1-exit.test", password: `Tadelakt-${randomBytes(9).toString("hex")}-k9`, totpSecret: "" };
    const ownerCtx = await newActor(b, run.base);
    const op = await ownerCtx.newPage();
    watchPage(op);
    let store1: StoreRef | null = null;

    /* a) bootstrap + console */
    await step("a) gate, bootstrap, 2FA, console sign-in", async () => {
      const hidden = await getAs(ownerCtx, "/admin");
      must("/admin without the gate cookie → the neutral 404", hidden.status === 404, hidden.status);

      const gateRes = await ownerCtx.request.get(`/${run.gate}`, { maxRedirects: 0, failOnStatusCode: false });
      check("/<ADMIN_GATE> → 303 to /admin", gateRes.status() === 303 && new URL(gateRes.headers()["location"] ?? "", run.base).pathname === "/admin", `${gateRes.status()} → ${gateRes.headers()["location"]}`);
      const cookies = await ownerCtx.cookies();
      must("the gate cookie is set (__Host-csg, HttpOnly, Secure)", cookies.some((c) => c.name === "__Host-csg" && c.httpOnly && c.secure), cookies.map((c) => c.name));

      await op.goto("/admin/setup");
      must("/admin/setup opens behind the gate while no super_admin exists", (await op.locator('input[name="token"]').count()) === 1, pathOf(op));
      await op.locator('input[name="token"]').fill(run.setupToken);
      await op.locator('input[name="name"]').fill(owner.name);
      await op.locator('input[name="email"]').fill(owner.email);
      await op.locator('input[name="password"]').fill(owner.password);
      await op.locator('input[name="confirm"]').fill(owner.password);
      await op.getByRole("button", { name: "Create the owner account" }).click();
      must("setup → the TOTP enrolment (/app/account/two-factor?from=setup)", await waitPath(op, /^\/app\/account\/two-factor$/), op.url());
      const [sa] = await q<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE platform_role = 'super_admin'");
      check("exactly one super_admin in the database", Number(sa?.n) === 1, sa);

      await op.getByRole("button", { name: "Set up authenticator app" }).click();
      const secretEl = op.locator("code").filter({ hasText: /^[A-Z2-7 ]{16,}$/ }).first();
      await secretEl.waitFor();
      owner.totpSecret = ((await secretEl.textContent()) ?? "").replace(/\s/g, "");
      must("the enrolment shows the secret key (base32)", /^[A-Z2-7]{16,}$/.test(owner.totpSecret));
      await op.locator('input[name="code"]').fill(await freshTotp(owner.totpSecret));
      await op.locator('input[name="password"]').fill(owner.password);
      await op.getByRole("button", { name: "Turn on two-step verification" }).click();
      await op.getByText("I've stored these codes somewhere safe").waitFor();
      await op.getByText("I've stored these codes somewhere safe").click();
      await op.getByRole("link", { name: "Continue" }).click();
      must("2FA on → the first-run store step (/admin/setup/store)", await waitPath(op, /^\/admin\/setup\/store$/), op.url());
      const [u] = await q<{ totp_enabled: number }>("SELECT totp_enabled FROM users WHERE email = ?", [owner.email]);
      check("users.totp_enabled = 1", Number(u?.totp_enabled) === 1, u);

      // store #1 on the first-run step (§B.11): active, internal plan
      await op.locator('input[name="storeName"]').fill("Atlas Argan");
      await op.locator('input[name="handle-visible"]').fill("atlas-argan");
      await op.getByText(/available/i).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
      await op.getByRole("button", { name: "Create the store" }).click();
      must("store #1 created → /app/atlas-argan", await waitPath(op, /^\/app\/atlas-argan$/), op.url());
      const [s] = await q<{ id: string; handle: string; name: string; status: string; plan_id: string }>("SELECT id, handle, name, status, plan_id FROM stores WHERE handle = 'atlas-argan'");
      must("store #1 is active on the internal plan", s?.status === "active" && s.plan_id === "internal", s);
      store1 = { id: s!.id, handle: s!.handle, name: s!.name };

      // sign out, then the real console sign-in: password, then a TOTP code
      await op.goto("/app/account");
      await op.getByRole("button", { name: /Sign out/ }).first().click();
      must("signed out → /login", await waitPath(op, /^\/login$/), op.url());
      await op.goto("/admin");
      must("/admin signed out (gate cookie kept) → the sign-in page", await waitPath(op, /^\/login$/), op.url());
      await op.locator('input[name="email"]').fill(owner.email);
      await op.locator('input[name="password"]').fill(owner.password);
      await op.getByRole("button", { name: "Sign in" }).click();
      must("password accepted → the TOTP step (/login/verify)", await waitPath(op, /^\/login\/verify$/), op.url());
      // the code field submits itself on the sixth digit; the button only when it did not
      await op.locator('input[name="code"]').first().fill(await freshTotp(owner.totpSecret));
      if (!(await waitPath(op, /^\/admin$/, 5_000))) await op.getByRole("button", { name: "Verify and continue" }).click().catch(() => undefined);
      must("TOTP accepted → the console (/admin)", await waitPath(op, /^\/admin$/), op.url());
      await op.getByText(`Hello, ${owner.name}`).waitFor();
      check("the console home greets the super_admin", true);
      const roleText = await op.locator("main").innerText();
      check("the console shows the platform role", /super/i.test(roleText), roleText.slice(0, 200));
      await shot(op, "console-home");
    });
    if (!store1) return 1;
    const s1: StoreRef = store1;

    /* b) store #1: a landing page from a fixture, published, live */
    let page1: { id: string; slug: string } | null = null;
    await step("b) store #1: generate, publish, open the live page", async () => {
      await op.goto(`/app/${s1.handle}`);
      must("the owner lands on /app/<h1> (200)", pathOf(op) === `/app/${s1.handle}`, op.url());
      await op.getByText(s1.name).first().waitFor();

      const { pageId } = await generatePage(op, s1.handle, { name: "Huile d'argan pure", price: "199" });
      const [row] = await q<{ store_id: string; status: string; slug: string }>("SELECT store_id, status, slug FROM pages WHERE id = ?", [pageId]);
      must("the draft page belongs to store #1", row?.store_id === s1.id && row.status === "draft", row);
      await shot(op, "builder-store1");
      const hidden = await hideSampleSections(op, pageId);
      note(`sections with example content hidden before publishing: ${hidden.join(", ") || "none"}`);

      const pub = await publishFromBuilder(op);
      await shot(op, "publish-store1");
      must("the builder publishes the page (\"Your page is live\")", pub.live, pub.text);
      const [after] = await q<{ status: string; slug: string; published_version_id: string | null }>("SELECT status, slug, published_version_id FROM pages WHERE id = ?", [pageId]);
      must("pages.status = published with a version", after?.status === "published" && !!after.published_version_id, after);
      page1 = { id: pageId, slug: after!.slug };

      const visitor = await newActor(b, run.base);
      const live = await getAs(visitor, `/s/${s1.handle}/${page1.slug}`);
      check(`GET /s/<h1>/<slug> → 200`, live.status === 200, live.status);
      const problems = documentHeaderProblems(live.headers, "live");
      check("the live document carries the §F.6 store-document headers", problems.length === 0, problems);
      check("the live document is the published page (its product name, an order form)", live.body.includes("argan") && /name="phone"/.test(live.body), live.body.length);
      await visitor.close();
    });
    if (!page1) return 1;
    const p1: { id: string; slug: string } = page1;

    /* c) a real order and a test order */
    let realOrderId: string | null = null;
    await step("c) a real order and a test order (D54), the dashboard's orders", async () => {
      const visitor = await newActor(b, run.base);
      const vp = await visitor.newPage();
      await vp.goto(`/s/${s1.handle}/${p1.slug}`);
      await placeOrder(vp, { name: "Youssef Amrani", phone: "0612345678", city: "Casablanca", address: "12 rue des Orangers, Maarif" });
      must("the real order → the thank-you page", await waitPath(vp, new RegExp(`^/s/${s1.handle}/${p1.slug}/merci$`), 30_000), vp.url());
      await shot(vp, "thank-you-real");
      const real = await q<{ id: string; store_id: string; is_test: number; phone: string; sheet_status: string; risk_score: number; flags: string | null }>("SELECT id, store_id, is_test, phone, sheet_status, risk_score, flags FROM orders WHERE is_test = 0");
      must("one real order in the database", real.length === 1, real.length);
      check("the real order has store_id = store #1", real[0]!.store_id === s1.id, { store_id: real[0]!.store_id });
      check("the phone is stored in E.164 (+212…)", real[0]!.phone === "+212612345678", real[0]!.phone);
      note(`real order risk ${real[0]!.risk_score}, flags ${real[0]!.flags ?? "none"}`);
      realOrderId = real[0]!.id;
      await visitor.close();

      // the test link (D54): signed for store #1 with this run's APP_SECRET by the real minting function
      const Mod = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
      const orig = Mod._resolveFilename;
      const stub = require.resolve("next/dist/compiled/server-only/empty.js");
      Mod._resolveFilename = function (this: unknown, req: string, ...rest: unknown[]) {
        return req === "server-only" ? stub : orig.call(this, req, ...rest);
      };
      const { signTestToken, TEST_PARAM } = await import("@/lib/tenancy/public");
      const token = signTestToken(s1.id);
      const tester = await newActor(b, run.base);
      const testPath = `/s/${s1.handle}/${p1.slug}?${TEST_PARAM}=${encodeURIComponent(token)}`;
      const testDoc = await getAs(tester, testPath);
      check("the test link renders (200)", testDoc.status === 200, testDoc.status);
      const tp = documentHeaderProblems(testDoc.headers, "test");
      check("the test render: private, no-store, noindex, the store-document headers", tp.length === 0, tp);
      const tpage = await tester.newPage();
      await tpage.goto(testPath);
      await placeOrder(tpage, { name: "Test Commande", phone: "0612345678", city: "Rabat", address: "Test address" });
      must("the test order → the test thank-you page", await waitPath(tpage, new RegExp(`^/s/${s1.handle}/${p1.slug}/merci$`), 30_000), tpage.url());
      await shot(tpage, "thank-you-test");
      await tester.close();
      const test = await q<{ id: string; store_id: string; is_test: number; flags: string | null; sheet_status: string }>("SELECT id, store_id, is_test, flags, sheet_status FROM orders WHERE is_test = 1");
      must("one test order in the database", test.length === 1, test.length);
      check("the test order has store_id = store #1, the flag \"test\" and sheet_status disabled", test[0]!.store_id === s1.id && String(test[0]!.flags).includes('"test"') && test[0]!.sheet_status === "disabled", test[0]);
      const stats = await q<{ orders: number }>("SELECT COALESCE(SUM(orders), 0) AS orders FROM stats_daily WHERE store_id = ?", [s1.id]).catch(() => [{ orders: -1 }]);
      check("the stats count the real order only (test traffic never counts)", Number(stats[0]?.orders) === 1, stats[0]);

      // the dashboard: both orders, the test one marked
      await op.goto(`/app/${s1.handle}/orders`);
      const rows = op.locator("tbody tr");
      await rows.first().waitFor();
      const realRow = rows.filter({ hasText: realOrderId! });
      const testRow = rows.filter({ hasText: test[0]!.id });
      check("/app/<h1>/orders lists the real order", (await realRow.count()) === 1);
      check("/app/<h1>/orders lists the test order", (await testRow.count()) === 1);
      check("the test order's row is marked \"Test\"", (await testRow.getByText("Test", { exact: true }).count()) === 1, (await testRow.innerText().catch(() => "")).slice(0, 200));
      check("the real order's row carries no test mark", (await realRow.getByText("Test", { exact: true }).count()) === 0);
      await shot(op, "orders-store1");

      if (run.sheets) note("Sheets: configured for this run (E2E_SHEETS_SPREADSHEET_ID); the push is P5's acceptance and is not driven here");
      else note("Sheets: skipped (no E2E_SHEETS_SPREADSHEET_ID + GOOGLE_SA_JSON_B64 in this environment; a real sheet needs a Google service account)");
    });

    /* d) invite code, second user, pending store */
    await step("d) invite code, second user in a pending store, isolation, the review queue", async () => {
      await op.goto("/admin");
      const form = op.locator("#invite-codes");
      await form.waitFor();
      await form.locator('input[name="label"]').fill("Second seller (e2e)");
      await form.getByRole("button", { name: "Create code" }).click();
      const shown = form.locator("[data-invite-code]");
      await shown.waitFor();
      const code = (await shown.getAttribute("data-invite-code")) ?? "";
      must("the console shows a new invite code once (SG-…)", /^SG-[0-9A-HJKMNP-TV-Z]{12}$/.test(code), code.replace(/.(?=.{4})/g, "•"));
      const [inv] = await q<{ n: number }>("SELECT COUNT(*) AS n FROM platform_invites WHERE uses = 0 AND uses_max = 1");
      check("platform_invites holds the code's hash (not the code)", Number(inv?.n) === 1 && (await q("SELECT id FROM platform_invites WHERE code_hash LIKE ?", [`%${code.slice(3)}%`])).length === 0, inv);

      const second = await newActor(b, run.base);
      const sp = await second.newPage();
      await sp.goto("/signup");
      must("/signup in invite mode asks for the code", (await sp.locator('input[name="inviteCode"]').count()) === 1);
      await sp.locator('input[name="name"]').fill("Karim Bennani");
      await sp.locator('input[name="phone"]').fill("0661234567");
      await sp.locator('input[name="email"]').fill("seller2@r1-exit.test");
      await sp.locator('input[name="password"]').fill(`Zellige-${randomBytes(9).toString("hex")}-m4`);
      await sp.locator('input[name="storeName"]').fill("Baraka Home");
      await sp.locator('input[name="handle-visible"]').fill("baraka-home");
      await sp.locator('input[name="inviteCode"]').fill(code);
      const legal = sp.locator("#signup-legal");
      if (await legal.count()) await legal.click();
      await sp.getByRole("button", { name: "Create my store" }).click();
      must("signup → /app/baraka-home", await waitPath(sp, /^\/app\/baraka-home(\/.*)?$/), sp.url());
      const [s2] = await q<{ id: string; status: string }>("SELECT id, status FROM stores WHERE handle = 'baraka-home'");
      must("store h2 is PENDING", s2?.status === "pending", s2);
      const [used] = await q<{ uses: number }>("SELECT uses FROM platform_invites LIMIT 1");
      check("the invite code was consumed (uses = 1)", Number(used?.uses) === 1, used);
      await shot(sp, "pending-store-home");

      // h2 builds a page and previews it
      const { pageId: page2 } = await generatePage(sp, "baraka-home", { name: "Coussin berbère", price: "249" });
      const [row2] = await q<{ store_id: string; status: string }>("SELECT store_id, status FROM pages WHERE id = ?", [page2]);
      check("the pending store's draft belongs to h2", row2?.store_id === s2!.id, row2);
      const preview = await getAs(second, `/app/baraka-home/preview/${page2}`);
      check("h2 previews its draft (/app/<h2>/preview/<id> → 200)", preview.status === 200 && /<html/i.test(preview.body), preview.status);

      // … but cannot publish (the same honest page as store #1, so the refusal is the store's state, not the checklist)
      await sp.goto(`/app/baraka-home/pages/${page2}/edit`);
      await hideSampleSections(sp, page2);
      const pub = await publishFromBuilder(sp);
      await shot(sp, "publish-refused-store2");
      check("the pending store cannot publish: the builder answers \"Your store is in review…\"", !pub.live && /Your store is in review/.test(pub.text), pub.text);
      const [after2] = await q<{ status: string; published_version_id: string | null }>("SELECT status, published_version_id FROM pages WHERE id = ?", [page2]);
      check("h2's page stays a draft without a published version", after2?.status === "draft" && !after2.published_version_id, after2);
      const [slug2] = await q<{ slug: string }>("SELECT slug FROM pages WHERE id = ?", [page2]);
      const pub2 = await getAs(second, `/s/baraka-home/${slug2?.slug ?? "x"}`);
      check("/s/<h2>/<slug> → 404 (a pending store has no public pages)", pub2.status === 404, pub2.status);

      // isolation: store #1 is invisible to h2's owner
      // store #1's handle: the layout's seam answers before anything streams, so these are real 404s
      const foreign = [
        `/app/${s1.handle}`,
        `/app/${s1.handle}/orders`,
        `/app/${s1.handle}/pages`,
        `/app/${s1.handle}/pages/${p1.id}/edit`,
        `/app/${s1.handle}/preview/${p1.id}`,
        `/app/${s1.handle}/settings/general`,
        `/api/app/${s1.handle}/orders/export`,
        `/api/app/${s1.handle}/media`,
      ];
      const label = (path: string) => path.replace(s1.handle, "<h1>").replace(p1.id, "<page1>").replace("baraka-home", "<h2>").replace(GHOST_ID, "<missing id>").replace("0123456789abcdef".repeat(2), "<missing id>").replace(/media\/[0-9a-f]{32}$/, "media/<asset1>");
      const canaries = [s1.name, p1.slug, p1.id, realOrderId ?? "~", "Youssef", "612345678"];
      const unknown = await getAs(second, "/app/no-such-store-e2e");
      // a canary the request itself carries (the id in the path) is an echo, not a leak
      const leaksIn = (body: string, path: string) => canaries.filter((c) => !path.includes(c) && body.includes(c));
      for (const path of foreign) {
        const r = await getAs(second, path);
        const leaked = leaksIn(r.body, path);
        check(`h2's owner: ${label(path)} → 404, nothing of store #1`, r.status === 404 && leaked.length === 0, { status: r.status, leaked });
      }
      check("…the same status as an unknown handle", unknown.status === 404, unknown.status);

      // store #1's ids under h2's own handle answer exactly as a missing id: a route handler with a real 404; the
      // builder page with the store's not-found screen (it renders inside [store]/loading.tsx, so Next has already
      // committed the 200 of the stream: Next's documented contract, with noindex injected)
      const byId: [string, string][] = [
        [`/app/baraka-home/preview/${p1.id}`, `/app/baraka-home/preview/${GHOST_ID}`],
        [`/app/baraka-home/pages/${p1.id}/edit`, `/app/baraka-home/pages/${GHOST_ID}/edit`],
      ];
      const [asset1] = await q<{ id: string }>("SELECT id FROM assets WHERE store_id = ? LIMIT 1", [s1.id]);
      // a well-formed media id no row has (32 hex, D21)
      if (asset1) byId.push([`/api/app/baraka-home/media/${asset1.id}`, `/api/app/baraka-home/media/${"0123456789abcdef".repeat(2)}`]);
      else check("store #1 has the uploaded fixture photo in its library", false);
      for (const [path, ghostPath] of byId) {
        const [r, ghost] = [await getAs(second, path), await getAs(second, ghostPath)];
        const leaked = leaksIn(r.body, path);
        // a streamed notFound(): the HTML carries Next's 404 digest for the boundary (the browser renders the store's
        // not-found screen from it, checked below) and the dashboard's noindex
        const notFoundUi = (b: string) => b.includes("NEXT_HTTP_ERROR_FALLBACK;404") && /name="robots" content="noindex/.test(b);
        let same = r.status === ghost.status && (r.status === 404 || (notFoundUi(r.body) && notFoundUi(ghost.body)));
        if (same && r.status === 200) {
          // what the member sees: the not-found screen, for store #1's id and for a missing one alike
          for (const target of [path, ghostPath]) {
            await sp.goto(target);
            const seen = await sp.getByText("This screen isn't available").waitFor({ timeout: 20_000 }).then(() => true, () => false);
            same &&= seen;
          }
        }
        check(`h2's owner: ${label(path)} answers as ${label(ghostPath)} (${r.status === 404 ? "404" : "the not-found screen"}), nothing of store #1`, same && leaked.length === 0, {
          status: r.status,
          ghost: ghost.status,
          leaked,
          ...(same ? {} : { notFoundUi: [notFoundUi(r.body), notFoundUi(ghost.body)], robots: /<meta[^>]*robots[^>]*>/.exec(r.body)?.[0] ?? null }),
        });
      }
      const ordersOwn = await getAs(second, `/app/baraka-home/orders?order=${realOrderId}`);
      check("h2's own orders screen with store #1's order id shows nothing of it", ordersOwn.status === 200 && !ordersOwn.body.includes("Youssef") && !ordersOwn.body.includes("612345678"), ordersOwn.status);
      await second.close();

      // the console's review queue lists h2
      await op.goto("/admin");
      const queue = op.locator("#queue");
      await queue.waitFor();
      check("the console's review queue lists h2 (Baraka Home, @baraka-home)", (await queue.locator('[data-store-handle="baraka-home"]').count()) === 1, (await queue.innerText()).slice(0, 300));
      check("…and not store #1 (active)", (await queue.locator(`[data-store-handle="${s1.handle}"]`).count()) === 0);
      await shot(op, "console-queue");
    });

    await ownerCtx.close();
    return results.some((r) => !r.ok) ? 1 : 0;
  } finally {
    currentStep = "e) cleanup";
    console.log(`\n▸ e) cleanup`);
    const t0 = Date.now();
    if (browser) await (browser as Browser).close().catch(() => undefined);
    if (dbConn) await (dbConn as mysql.Connection).end().catch(() => undefined);
    if (child) check(`server on ${port} stopped`, await stopServer(child, port), `listeners after: ${listeners(port).length}`);
    if (!keep) {
      const left = await dropDatabase(dbName).catch((e) => [`drop failed: ${e instanceof Error ? e.message : String(e)}`]);
      check(`database ${dbName} dropped`, !left.includes(dbName), `cod_test_* left: ${left.length ? left.join(", ") : "none"}`);
    } else note(`--keep: database ${dbName} kept`);
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      note(`could not remove ${dataDir}`);
    }
    timings.push({ step: "e) cleanup", ms: Date.now() - t0 });
    if (blockedHosts.size) note(`external requests aborted (offline run): ${[...blockedHosts].sort().join(", ")}`);
    if (pageErrors.length) note(`page errors seen: ${pageErrors.length}\n      ${pageErrors.slice(0, 8).join("\n      ")}`);
    const failed = results.filter((r) => !r.ok);
    if (failed.length && log.length) {
      const file = join(tmpdir(), `r1-exit-next-${port}.log`);
      writeFileSync(file, log.join("\n"));
      console.log(`--- next start (last lines; the whole log: ${file}) ---\n${log.slice(-30).join("\n")}`);
    }
    console.log("\n" + timings.map((t) => `  ${t.step}: ${(t.ms / 1000).toFixed(1)} s`).join("\n"));
    console.log(
      failed.length
        ? `✗ qa:r1-exit: ${failed.length} of ${results.length} checks failed (${Math.round((Date.now() - started) / 1000)} s)`
        : `✓ qa:r1-exit: all ${results.length} checks passed (${Math.round((Date.now() - started) / 1000)} s)`,
    );
  }
}

main()
  .then((code) => process.exit(code || (results.some((r) => !r.ok) ? 1 : 0)))
  .catch((err) => {
    console.error(`✗ qa:r1-exit: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
