/**
 * Secrets regression check — no database, no network:
 *
 *   npx tsx --conditions=react-server scripts/qa/secrets-check.ts      (exit code 1 on any failure)
 *
 * 1. Template secrets fail closed: the values .env.example used to ship (and any "change-me" / "xxxxxx"
 *    value) leave the admin gate, /admin/setup, the cron endpoint and APP_SECRET unconfigured, with a
 *    boot warning that never quotes the value; generated secrets are never mistaken for templates.
 * 2. Database errors are logged by code only: a failed query's message lists every bound value
 *    (customer name, phone, address, e-mail, password hash) and must never reach the log.
 * 3. PHP exports only ever embed the store's own export key (store setting `export_key`, sealed and write-only), never
 *    the platform's own Sheets key, and their README tells the owner how to revoke it (EXP-03, §F.10).
 * 4. The test seams never reach Hostinger (§H.7, P0b CCR P5-6 / P7-9): no Hostinger env file (every `.env.hostinger*`
 *    file of the repository root, and the env template the owner copies them from, `.env.example`) sets any of
 *    NEVER_DEPLOYED_VARS: TEST_SEAM_VARS, SG_TEST_CONTEXT and (P0b review F-1) the Anthropic SDK's own
 *    ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN and ANTHROPIC_CUSTOM_HEADERS, which the SDK reads unguarded and which
 *    would send the platform key and every prompt elsewhere. A finding names the file and the variable, never a
 *    value; the files' values are never printed. Self-checked first on synthetic scratch files, in both directions.
 *    The environment pushed to Hostinger is checked after each push by HANDOFF §4's variable-name listing.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DrizzleQueryError } from "drizzle-orm";
import { adminGateSecret, authConfigWarnings, cronKeySecret, isAppSecretConfigured, isPlaceholderSecret, setupTokenSecret } from "@/lib/auth/config";
import { readmeMd } from "@/lib/export/readme";
import { exportKeyState, NO_EXPORT_KEY, parseServiceAccountKey, SAME_AS_APP_KEY, storedKey } from "@/lib/export/service-account";
import { errorSummary } from "@/lib/orders/log";
import { deriveKey } from "@/lib/security/crypto";
import { NEVER_DEPLOYED_VARS, TEST_SEAM_VARS } from "@/lib/security/test-seams";
import { redactStoreSetting, STORE_SETTINGS } from "@/lib/settings/store-registry";

let failures = 0;
let checks = 0;
const check = (ok: boolean, msg: string) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

/* ------------------------------------------------------------------ */
/* 1. template secrets                                                 */
/* ------------------------------------------------------------------ */

const TEMPLATE = {
  APP_SECRET: "change-me-to-a-long-random-string",
  ADMIN_GATE: "gate-change-me-xxxxxxxx",
  SETUP_TOKEN: "change-me-setup-token",
  CRON_KEY: "change-me-cron-key",
};
Object.assign(process.env, TEMPLATE);

check(!isAppSecretConfigured(), "template APP_SECRET counts as unconfigured");
check(adminGateSecret() === null, "template ADMIN_GATE leaves the admin unreachable");
check(setupTokenSecret() === null, "template SETUP_TOKEN keeps /admin/setup hidden");
check(cronKeySecret() === null, "template CRON_KEY keeps the cron endpoint disabled");
let threw = false;
try {
  deriveKey("secrets-check:template");
} catch {
  threw = true;
}
check(threw, "nothing is encrypted or signed with a template APP_SECRET");

const warnings = authConfigWarnings();
for (const name of Object.keys(TEMPLATE)) {
  check(
    warnings.some((w) => w.startsWith(`${name} is still a template value`)),
    `boot warning names the template ${name}`,
  );
}
check(!warnings.some((w) => Object.values(TEMPLATE).some((v) => w.includes(v))), "boot warnings never quote a secret value");

for (const v of ["changeme", "CHANGE_ME_PLEASE", "replace-me-now-1234", "your-secret-key-here", "your_app_secret_0123456789abcdef", "placeholder-token", "example-gate-123", "xxxxxxxxxxxx", "aaaaaaaaaaaaaaaa"]) {
  check(isPlaceholderSecret(v), `"${v}" is a template value`);
}

// generated secrets (the documented command, hex, short gates) are never flagged
let falsePositives = 0;
for (let i = 0; i < 3000; i++) {
  for (const v of [randomBytes(48).toString("base64url"), randomBytes(32).toString("hex"), randomBytes(16).toString("base64url")]) {
    if (isPlaceholderSecret(v)) falsePositives++;
  }
}
check(falsePositives === 0, `generated secrets are never flagged (${falsePositives} of 9000 were)`);
for (const v of ["studio-k29fx81q4mz7w2pd", "gate-selftest-k29fx81q4mz7w2pd", "selftest-secret-0123456789-abcdefghijklmnopqrstuvwxyz"]) {
  check(!isPlaceholderSecret(v), `"${v}" (docs / self-test value) is accepted`);
}

const real = {
  APP_SECRET: randomBytes(48).toString("base64url"),
  ADMIN_GATE: randomBytes(18).toString("base64url"),
  SETUP_TOKEN: randomBytes(18).toString("base64url"),
  CRON_KEY: randomBytes(24).toString("base64url"),
};
Object.assign(process.env, real);
check(isAppSecretConfigured(), "a generated APP_SECRET is configured");
check(adminGateSecret() === real.ADMIN_GATE, "a generated ADMIN_GATE opens the gate");
check(setupTokenSecret() === real.SETUP_TOKEN, "a generated SETUP_TOKEN enables setup");
check(cronKeySecret() === real.CRON_KEY, "a generated CRON_KEY enables the cron endpoint");
check(deriveKey("secrets-check:real").length === 32, "a generated APP_SECRET derives keys");
check(!authConfigWarnings().some((w) => w.includes("template value")), "no template warning for generated secrets");
process.env.CRON_KEY = "short";
check(cronKeySecret() === null, "a CRON_KEY under 8 characters keeps the cron endpoint disabled");
process.env.CRON_KEY = "";
check(cronKeySecret() === null && !authConfigWarnings().some((w) => w.startsWith("CRON_KEY")), "an empty CRON_KEY disables cron quietly");

/* ------------------------------------------------------------------ */
/* 2. database errors in logs                                          */
/* ------------------------------------------------------------------ */

const PII = ["Ahmed Benali", "+212612345678", "0612345678", "12 rue Atlas", "ahmed@example.ma", "$scrypt$N=16384"];
const driverError = (code: string, errno: number, message: string) =>
  Object.assign(new Error(message), { code, errno, sqlState: "40001", sqlMessage: message, sql: `insert into \`orders\` values ('${PII.join("', '")}')` });

const deadlock = new DrizzleQueryError(
  "insert into `orders` (`id`, `name`, `phone`, `phone_raw`, `address`, `email`) values (?, ?, ?, ?, ?, ?)",
  ["01JABCDEF", ...PII],
  driverError("ER_LOCK_DEADLOCK", 1213, "Deadlock found when trying to get lock; try restarting transaction"),
);
const duplicate = driverError("ER_DUP_ENTRY", 1062, "Duplicate entry '+212612345678-p1' for key 'orders_phone_page'");
const wrapped = new Error("post-insert bookkeeping failed", { cause: deadlock });
const noCause = new DrizzleQueryError("update `users` set `password_hash` = ? where `email` = ?", ["$scrypt$N=16384$abc", "ahmed@example.ma"], undefined);

for (const [label, err, code] of [
  ["drizzle query error (deadlock)", deadlock, "ER_LOCK_DEADLOCK"],
  ["raw mysql2 error (duplicate entry)", duplicate, "ER_DUP_ENTRY"],
  ["error caused by a query error", wrapped, "ER_LOCK_DEADLOCK"],
  ["query error without driver cause", noCause, "query_failed"],
] as const) {
  const line = errorSummary(err);
  check(line.includes(code), `${label}: summary keeps the code (${line})`);
  check(!PII.some((v) => line.includes(v)) && !line.includes("params") && !line.includes("insert into"), `${label}: summary has no SQL or bound values (${line})`);
}
check(errorSummary(new TypeError("fetch failed")) === "TypeError: fetch failed", "other errors keep their message");
check(errorSummary("boom") === "unknown error", "non-errors are not printed");

/* ------------------------------------------------------------------ */
/* 3. PHP export key                                                   */
/* ------------------------------------------------------------------ */

const keyJson = (email: string, keyId: string) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  return { type: "service_account", client_email: email, private_key: privateKey, private_key_id: keyId, project_id: "cod-studio", client_id: "1234" };
};
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64");
const appKey = keyJson("orders-writer@cod-studio.iam.gserviceaccount.com", "app-key-1");
const exportKey = keyJson("php-exports@cod-studio.iam.gserviceaccount.com", "export-key-1");

process.env.GOOGLE_SA_JSON_B64 = b64(appKey);
delete process.env.GOOGLE_EXPORT_SA_JSON_B64;
check(exportKeyState(null).problem === NO_EXPORT_KEY, "no store key → nothing can be embedded (never the app's key)");
check(exportKeyState(parseServiceAccountKey(JSON.stringify(appKey))).problem === SAME_AS_APP_KEY, "the app's own key is refused as a store export key");
check(exportKeyState(parseServiceAccountKey(b64(keyJson(appKey.client_email, "app-key-2")))).problem === SAME_AS_APP_KEY, "another key of the app's own service account is refused");
check(
  exportKeyState(parseServiceAccountKey(b64({ ...appKey, client_email: "renamed@cod-studio.iam.gserviceaccount.com", private_key_id: "other" }))).problem === SAME_AS_APP_KEY,
  "the app's private key under another e-mail is refused",
);
check(parseServiceAccountKey("bm90IGEga2V5") === null, "an invalid key is not parsed (the settings card answers INVALID_EXPORT_KEY)");

const ok = exportKeyState(parseServiceAccountKey(b64(exportKey)));
check(ok.key?.email === exportKey.client_email && ok.key.keyId === "export-key-1", "a store's own export key is embedded, with its e-mail and key id");
const embedded = ok.key ? (JSON.parse(Buffer.from(ok.key.b64, "base64").toString("utf8")) as Record<string, unknown>) : {};
check(
  JSON.stringify(Object.keys(embedded).sort()) === JSON.stringify(["client_email", "private_key", "private_key_id", "type"]) && embedded.private_key === exportKey.private_key,
  "only the minimal fields of the export key go into config.php",
);
check(embedded.private_key !== appKey.private_key && embedded.client_email !== appKey.client_email, "the embedded key is not the app's");

// the store's key is a secret store key (§F.10: the check gains the new key names): sealed, write-only, never echoed
const storedExportKey = { clientEmail: exportKey.client_email, privateKey: exportKey.private_key, privateKeyId: exportKey.private_key_id, setAt: "2026-10-26T12:00:00.000Z" };
check(STORE_SETTINGS.export_key.secret, "export_key is a secret store key (encrypted, bound to the store)");
check(!JSON.stringify(redactStoreSetting("export_key", storedExportKey)).includes(exportKey.private_key.slice(30, 80)), "a redacted export_key never carries the private key");
check(storedKey(storedExportKey)?.client_email === exportKey.client_email, "the stored setting reads back as the store's key");

const readme = (serviceAccount: boolean) =>
  readmeMd({
    mode: "php",
    pageName: "Argan",
    storeName: "Store",
    exportId: "01JTEST",
    createdAt: new Date("2026-10-08T12:00:00Z"),
    site: null,
    hostConfigs: true,
    allowedOrigins: [],
    php: { spreadsheet: true, serviceAccount, serviceAccountEmail: serviceAccount ? exportKey.client_email : undefined },
    root: "public_html",
    privateDir: "cod-private",
    warnings: [],
  });
const withKey = readme(true);
check(!withKey.includes("if it is not used elsewhere"), "README no longer gives the impossible revoke advice");
check(withKey.includes(exportKey.client_email) && withKey.includes("IAM & Admin") && withKey.includes("delete the key"), "README names the export key to delete when a ZIP leaks");
check(withKey.includes("every row") && withKey.includes("not the platform's own key"), "README says what the embedded key can reach");
check(!withKey.includes(exportKey.private_key.slice(30, 80)), "README never contains the key itself");
const withoutKey = readme(false);
check(withoutKey.includes("never the platform's own key") && withoutKey.includes("delete the key you uploaded"), "README (own key) warns against the app's key and explains revocation");

/* ------------------------------------------------------------------ */
/* 4. test seams in Hostinger env files                                */
/* ------------------------------------------------------------------ */

/**
 * Variables a Hostinger env file must never set: the seams of src/lib/security/test-seams.ts, §E.4's context seam and
 * the Anthropic SDK's redirecting variables (P0b review F-1); one list with the boot check (`NEVER_DEPLOYED_VARS`).
 */
const NEVER_ON_HOSTINGER: readonly string[] = NEVER_DEPLOYED_VARS;
check(
  [...TEST_SEAM_VARS, "SG_TEST_CONTEXT", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_CUSTOM_HEADERS"].every((v) => NEVER_ON_HOSTINGER.includes(v)),
  `the refused list holds the seams, SG_TEST_CONTEXT and the SDK's ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_CUSTOM_HEADERS (${NEVER_ON_HOSTINGER.join(", ")})`,
);
check(!NEVER_ON_HOSTINGER.includes("ANTHROPIC_API_KEY"), "ANTHROPIC_API_KEY stays allowed on Hostinger (the fallback key, §H.7)");
/** The env template the Hostinger files are copied from (its header points at hPanel); committed, so it is checked too. */
const HOSTINGER_TEMPLATE = ".env.example";

/** The Hostinger env files of `dir`: every `.env.hostinger*` file, then the template. */
function hostingerEnvFiles(dir: string): string[] {
  const own = readdirSync(dir).filter((n) => n.startsWith(".env.hostinger")).sort();
  return [...own, ...(existsSync(join(dir, HOSTINGER_TEMPLATE)) ? [HOSTINGER_TEMPLATE] : [])].map((n) => join(dir, n));
}

/** The variable names `text` assigns (`NAME=…`, `export NAME=…`; comment lines skipped). Values are never kept. */
function assignedNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) names.push(m[1]!);
  }
  return names;
}

/** Each test-seam variable a file sets, even to an empty value: { file (its name only), name }. */
function seamFindings(files: readonly string[]): { file: string; name: string }[] {
  const out: { file: string; name: string }[] = [];
  for (const f of files) {
    for (const name of new Set(assignedNames(readFileSync(f, "utf8")))) {
      if (NEVER_ON_HOSTINGER.includes(name)) out.push({ file: basename(f), name });
    }
  }
  return out;
}
const findingText = (f: { file: string; name: string }) => `${f.file} sets ${f.name}: a test seam must never be set on Hostinger (§H.7)`;

// self-check on synthetic scratch files (never the real ones): both directions
{
  const marker = `seamFixtureValue-${randomBytes(6).toString("hex")}`;
  const bad = mkdtempSync(join(tmpdir(), "sg-secrets-bad-"));
  const good = mkdtempSync(join(tmpdir(), "sg-secrets-good-"));
  try {
    writeFileSync(join(bad, ".env.hostinger"), `APP_SECRET=${marker}\nSG_E2E=1\n# SG_AI_HARNESS=1\nexport SG_AI_BASE_URL=http://127.0.0.1:4011/${marker}\r\nSG_E2E=1\n`);
    writeFileSync(join(bad, ".env.hostinger.previous"), `SG_TEST_CONTEXT = 1\nCRON_KEY=${marker}\nANTHROPIC_API_KEY=sk-ant-${marker}\nANTHROPIC_BASE_URL=https://${marker}.example\nexport ANTHROPIC_AUTH_TOKEN=${marker}\n`);
    writeFileSync(join(bad, ".env.hostinger.sdk"), `# ANTHROPIC_BASE_URL=https://api.anthropic.com\nANTHROPIC_CUSTOM_HEADERS=x-probe: ${marker}\n`);
    writeFileSync(join(bad, HOSTINGER_TEMPLATE), "# template\nSG_E2E_MOCK_ORIGIN=\nSG_AI_NO_AFTER=1\n");
    writeFileSync(join(bad, ".env.local"), `SG_AI_HARNESS=${marker}\n`);
    const found = seamFindings(hostingerEnvFiles(bad));
    check(
      JSON.stringify(found) ===
        JSON.stringify([
          { file: ".env.hostinger", name: "SG_E2E" },
          { file: ".env.hostinger", name: "SG_AI_BASE_URL" },
          { file: ".env.hostinger.previous", name: "SG_TEST_CONTEXT" },
          { file: ".env.hostinger.previous", name: "ANTHROPIC_BASE_URL" },
          { file: ".env.hostinger.previous", name: "ANTHROPIC_AUTH_TOKEN" },
          { file: ".env.hostinger.sdk", name: "ANTHROPIC_CUSTOM_HEADERS" },
          { file: ".env.example", name: "SG_E2E_MOCK_ORIGIN" },
          { file: ".env.example", name: "SG_AI_NO_AFTER" },
        ]),
      `seam self-check: every .env.hostinger* file and the template are read, a variable set even empty is found once per file, the SDK's redirecting variables are found and ANTHROPIC_API_KEY is not, comments and .env.local are not (${JSON.stringify(found)})`,
    );
    check(!found.map(findingText).some((t) => t.includes(marker) || t.includes("127.0.0.1")), "seam self-check: a finding names the file and the variable, never a value");
    writeFileSync(join(good, ".env.hostinger"), `APP_SECRET=${marker}\n# SG_E2E=1 (never on Hostinger)\nPLATFORM_URL=https://example.test\nSG_E2EX=1\nXSG_E2E=1\nANTHROPIC_API_KEY=sk-ant-${marker}\nANTHROPIC_BASE_URLS=1\n`);
    writeFileSync(join(good, HOSTINGER_TEMPLATE), "# SG_TEST_CONTEXT is never set here\nDATABASE_URL=\n");
    writeFileSync(join(good, ".env.local"), "SG_E2E=1\nSG_TEST_CONTEXT=1\n");
    const clean = seamFindings(hostingerEnvFiles(good));
    check(clean.length === 0, `seam self-check: clean Hostinger files pass (a comment, a longer name and a local file are not findings: ${JSON.stringify(clean)})`);
  } finally {
    rmSync(bad, { recursive: true, force: true });
    rmSync(good, { recursive: true, force: true });
  }
}
// the real tree: names only are read into the findings, nothing is printed but the file and variable names
{
  const root = join(__dirname, "..", "..");
  const files = hostingerEnvFiles(root);
  check(files.some((f) => basename(f) === HOSTINGER_TEMPLATE), `the Hostinger env template ${HOSTINGER_TEMPLATE} is present and read`);
  const found = seamFindings(files);
  if (found.length) for (const f of found) check(false, findingText(f));
  else check(true, "no Hostinger env file sets a test seam");
  console.log(`  test seams: ${files.length} Hostinger env file(s) read (${files.map((f) => basename(f)).join(", ")}), ${found.length} finding(s)`);
}

console.log(failures ? `✗ secrets check: ${failures} of ${checks} failed` : `✓ secrets check: ${checks} checks passed`);
process.exit(failures ? 1 : 0);
