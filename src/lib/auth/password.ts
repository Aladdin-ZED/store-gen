/**
 * Password hashing (scrypt, node:crypto) and password policy.
 *
 * Encoded form (PHC-like, self-describing so parameters can evolve):
 *   $scrypt$ln=16,r=8,p=1$<salt base64>$<hash base64>
 * N = 2^ln = 65536, r = 8, p = 1 → 64 MiB per hash; runs on the libuv pool (async) so it never blocks the event loop.
 *
 * Every derivation passes the scrypt semaphore (docs/STORE-SAAS.md §B.3): at most 2 at once, 16 waiting, 4 s of
 * waiting at most, then `AuthBusyError` (HTTP 503, the generic busy message). Sign-in, signup, invite acceptance,
 * reset, password change and the step-up all hash through it, so a burst of sign-ups can never hold 64 MiB per
 * request on a 1 GB plan; unknown e-mails burn the dummy hash inside it too.
 */
import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { SCRYPT_CONCURRENCY, SCRYPT_QUEUE_MAX, SCRYPT_WAIT_MS } from "./config";
import { AuthBusyError } from "./errors";

interface ScryptWaiter {
  grant(): void;
  timer: ReturnType<typeof setTimeout>;
}

declare global {
  var __sgScrypt: { active: number; waiting: ScryptWaiter[] } | undefined;
}

/** One process-wide gate (globalThis: the RSC and route-handler layers may load this module twice). */
const scryptGate = () => (globalThis.__sgScrypt ??= { active: 0, waiting: [] });

function releaseSlot(): void {
  const gate = scryptGate();
  const next = gate.waiting.shift();
  if (next) next.grant(); // hand the slot over: `active` is unchanged
  else gate.active = Math.max(0, gate.active - 1);
}

/** Runs `fn` holding one scrypt slot. Throws AuthBusyError when 16 already wait or the wait passes 4 s. */
export async function withScryptSlot<T>(fn: () => Promise<T>): Promise<T> {
  const gate = scryptGate();
  if (gate.active < SCRYPT_CONCURRENCY) {
    gate.active++;
  } else {
    if (gate.waiting.length >= SCRYPT_QUEUE_MAX) throw new AuthBusyError();
    await new Promise<void>((resolve, reject) => {
      const waiter: ScryptWaiter = {
        grant: () => {
          clearTimeout(waiter.timer);
          resolve();
        },
        timer: setTimeout(() => {
          const at = gate.waiting.indexOf(waiter);
          if (at !== -1) gate.waiting.splice(at, 1);
          reject(new AuthBusyError());
        }, SCRYPT_WAIT_MS),
      };
      gate.waiting.push(waiter);
    });
  }
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

/** For tests: the semaphore's running and waiting counts. */
export function scryptSlotState(): { active: number; waiting: number } {
  const gate = scryptGate();
  return { active: gate.active, waiting: gate.waiting.length };
}

const CURRENT = { ln: 16, r: 8, p: 1 } as const;
const KEY_LEN = 32;
const SALT_LEN = 32;
/** 2× the current cost (64 MiB) — headroom for a future parameter bump, nothing more. */
const MAX_SCRYPT_MEMORY = 128 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Hash of a random, discarded password with the current parameters. Verifying against it costs
 * the same as a real check, so unknown e-mails take as long as known ones (no user enumeration by timing).
 */
const DUMMY_HASH = "$scrypt$ln=16,r=8,p=1$fiXlmGXv7mWEXQ2W+Qwh89F4gkV1qX7gWyrB8iPVK70$fGDa/Q5esye5uIgTxIyu0C5HmPdAB6lSRsuQRLgFkL4";

const ENCODED_RE = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]{22,88})\$([A-Za-z0-9+/]{22,88})$/;

interface Parsed {
  ln: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(encoded: string): Parsed | null {
  const m = ENCODED_RE.exec(encoded);
  if (!m) return null;
  const [ln, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Bound the work factor so a tampered row can't make one verification allocate more than
  // MAX_SCRYPT_MEMORY (scrypt needs 128·N·r bytes) or spin for minutes.
  if (ln < 14 || r < 1 || p < 1 || p > 4 || 128 * 2 ** ln * r > MAX_SCRYPT_MEMORY) return null;
  const salt = Buffer.from(m[4]!, "base64");
  const hash = Buffer.from(m[5]!, "base64");
  if (salt.length < 16 || hash.length < 16) return null;
  return { ln, r, p, salt, hash };
}

const b64 = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

function derive(password: string, salt: Buffer, ln: number, r: number, p: number, keyLen: number): Promise<Buffer> {
  const N = 2 ** ln;
  return withScryptSlot(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(password.normalize("NFKC"), salt, keyLen, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) => (err ? reject(err) : resolve(key)));
      }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await derive(password, salt, CURRENT.ln, CURRENT.r, CURRENT.p, KEY_LEN);
  return `$scrypt$ln=${CURRENT.ln},r=${CURRENT.r},p=${CURRENT.p}$${b64(salt)}$${b64(hash)}`;
}

/** Constant-time verification. Malformed hashes verify as false (after doing equivalent work). */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parse(encoded);
  if (!parsed) {
    await burnPasswordCheck(password);
    return false;
  }
  const candidate = await derive(password, parsed.salt, parsed.ln, parsed.r, parsed.p, parsed.hash.length);
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

/** True when the hash was made with different (older) parameters and should be replaced after a successful login. */
export function needsRehash(encoded: string): boolean {
  const parsed = parse(encoded);
  return (
    !parsed ||
    parsed.ln !== CURRENT.ln ||
    parsed.r !== CURRENT.r ||
    parsed.p !== CURRENT.p ||
    parsed.hash.length !== KEY_LEN ||
    parsed.salt.length !== SALT_LEN
  );
}

/** Spends the same time as a real verification (used when the account does not exist). */
export async function burnPasswordCheck(password: string): Promise<void> {
  const parsed = parse(DUMMY_HASH)!;
  await derive(password, parsed.salt, parsed.ln, parsed.r, parsed.p, parsed.hash.length);
}

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd123",
  "motdepasse",
  "motdepasse1",
  "motdepasse123",
  "0123456789",
  "1234567890",
  "12345678910",
  "123456789a",
  "a123456789",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "qwertyuiop",
  "qwerty1234",
  "qwerty12345",
  "azertyuiop",
  "azerty1234",
  "azerty12345",
  "abcdefghij",
  "abcd123456",
  "iloveyou12",
  "letmein123",
  "welcome123",
  "admin12345",
  "adminadmin",
  "administrator",
  "changeme123",
  "codstudio",
  "codstudio1",
  "codstudio123",
  "morocco2024",
  "morocco2025",
  "morocco2026",
  "maroc12345",
]);

/** What is wrong with a password (the forms tick these off live; `auth.password.<problem>` is the message key). */
export type PasswordProblem = "too_short" | "too_long" | "contains_email" | "common" | "repetitive";

/** Length-based (NIST 800-63B style) — no composition rules — plus a few cheap checks. Null when acceptable. */
export function passwordProblem(password: string, email?: string | null): PasswordProblem | null {
  const value = password.normalize("NFKC");
  const length = [...value].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";

  const lower = value.toLowerCase();
  if (email) {
    const normalizedEmail = email.normalize("NFKC").trim().toLowerCase();
    const local = normalizedEmail.split("@")[0] ?? "";
    if (lower.includes(normalizedEmail) || (local.length >= 4 && lower.includes(local))) return "contains_email";
  }
  if (COMMON_PASSWORDS.has(lower)) return "common";
  if (new Set(value).size < 4) return "repetitive";
  return null;
}

const PROBLEM_TEXT: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  contains_email: "Don't include your email address in your password.",
  common: "This password is too common. Choose something less predictable.",
  repetitive: "Use a less repetitive password.",
};

/** Returns a user-facing problem with the password (English, today's /admin forms), or null when acceptable. */
export function checkPasswordPolicy(password: string, email?: string | null): string | null {
  const problem = passwordProblem(password, email);
  return problem ? PROBLEM_TEXT[problem] : null;
}
