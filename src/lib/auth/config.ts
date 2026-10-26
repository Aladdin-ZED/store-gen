/**
 * Auth constants and environment-derived configuration (no I/O).
 */
import "server-only";

export const IS_PROD = process.env.NODE_ENV === "production";

/** `__Host-` cookies must be Secure, Path=/ and host-only — the strongest scoping browsers offer. */
export const SESSION_COOKIE = IS_PROD ? "__Host-cs" : "cs";
export const GATE_COOKIE = IS_PROD ? "__Host-csg" : "csg";

/**
 * Request header set by src/proxy.ts on platform UI requests (any client-supplied value is overwritten there):
 * what Server Components read to nonce their own <Script>s. The console's redirect-back path is the signed
 * `x-sg-path` (src/lib/edge/path-sig.ts, CCR r1.0-t3-1), which replaced the old `x-cs-pathname` header.
 */
export const NONCE_HEADER = "x-nonce";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Idle timeout: a session unused for this long expires (sliding). */
export const SESSION_IDLE_TTL_MS = 7 * DAY;
/** Hard cap from creation, regardless of activity. The cookie lives exactly this long. */
export const SESSION_ABSOLUTE_TTL_MS = 30 * DAY;
/** Sliding refresh is written at most this often per session. */
export const SESSION_TOUCH_INTERVAL_MS = 10 * MINUTE;
/** Oldest sessions beyond this count are revoked when a new one is created. */
export const MAX_SESSIONS_PER_USER = 10;
/** A login that still needs its second factor must finish within this window. */
export const MFA_PENDING_TTL_MS = 10 * MINUTE;

/** Gate cookie lifetime, counted from its last renewal. */
export const GATE_TTL_MS = 30 * DAY;
/** A gate cookie older than this is re-issued on the next admin request (sliding lifetime). */
export const GATE_RENEW_AFTER_MS = DAY;

/*
 * Sign-in buckets (docs/STORE-SAAS.md §B.3; all `p:`). Refusals come from the IP and the account-network buckets
 * only; the account-wide bucket raises the Turnstile challenge and never refuses (SEC-22: five networks must not lock
 * an account out). The account buckets are cleared by a full sign-in; unknown e-mails consume them too.
 */
export const LOGIN_WINDOW_SEC = 15 * 60;
/** attempts per IP per window (all outcomes) */
export const LOGIN_IP_LIMIT = 10;
/** attempts per account and network (`p:login:acctnet`): past it, "too many attempts" for this network only */
export const LOGIN_ACCTNET_LIMIT = 5;
/** attempts per account across networks (`p:login:acct`): a challenge threshold only, never a refusal */
export const LOGIN_ACCT_LIMIT = 20;
/** past this many failures in either account bucket the form needs a Turnstile token (when the widget is configured) */
export const LOGIN_CHALLENGE_AFTER = 3;

export const MFA_WINDOW_SEC = 15 * 60;
export const MFA_USER_LIMIT = 5;
export const MFA_IP_LIMIT = 10;
/** TOTP step-ups per user per window (`p:mfa:stepup`, §B.7) */
export const MFA_STEPUP_LIMIT = 5;
/** password checks of the current user per window (`p:password`: password change and the tenant step-up, §B.7) */
export const PASSWORD_CHECK_LIMIT = 5;

export const SETUP_WINDOW_SEC = 15 * 60;
export const SETUP_IP_LIMIT = 5;

/** The scrypt semaphore (§B.3): hashes running at once, waiting, and the longest wait before `AuthBusyError`. */
export const SCRYPT_CONCURRENCY = 2;
export const SCRYPT_QUEUE_MAX = 16;
export const SCRYPT_WAIT_MS = 4_000;

/** Authenticator label until the platform brand setting is readable (`platform.brand.name`, §B.7). */
export const TOTP_ISSUER = "Store Gen";

/**
 * The device marker (§B.1, PLA Q.3): 128 random bits, base64url, set by T3's proxy on area-`auth` GET responses
 * (and by `publicAction` when a form arrives without one). It carries no user data; T2 only reads it for the
 * `device` identity link. Same name and `__Host-` rule as the session cookie.
 */
export const DEVICE_COOKIE = IS_PROD ? "__Host-sgd" : "sgd";
export const DEVICE_MARKER_RE = /^[A-Za-z0-9_-]{22}$/;
export const DEVICE_COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60;

/** The platform day of the daily sandbox ceiling (`pending_stores`, D69): the owner's market time, never the server's. */
export const PLATFORM_TIMEZONE = "Africa/Casablanca";

const SECRET_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Template values ("change-me…", "your-secret", "xxxxxx", "aaaaaaaa…") that are public wherever the
 * template is: in .env.example, the docs or any copy of the project. A secret matching this is treated as
 * unset, so a deploy with copied defaults stays closed (404) instead of open to anyone holding the
 * template. Generated values do not match in practice (8 equal characters in a row: about 1 in 5 million
 * for a 64-char hex secret, far less for base64url).
 */
const PLACEHOLDER_RE = /change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(?:app[-_ ]?)?(?:secret|key|token|gate|password)|placeholder|example|x{6,}|(.)\1{7,}/i;

/** true for a known template / placeholder value (never for a randomly generated one). */
export function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_RE.test(value);
}

/** First path segments owned by real routes — a gate equal to one of them would shadow it (or loop). */
const RESERVED_SEGMENTS = new Set(["admin", "api", "media", "fonts", "_next", "administrator", "login", "setup"]);

/**
 * Same rule as security/crypto's key derivation (which throws otherwise), plus no template value.
 * Checked up front so a misconfigured server answers admin URLs with the ordinary 404 instead of a
 * 500 that would reveal them.
 */
export function isAppSecretConfigured(): boolean {
  const value = process.env.APP_SECRET ?? "";
  return value.length >= 32 && !isPlaceholderSecret(value);
}

/** The secret admin gate path segment, or null when unset/invalid/a placeholder (admin then stays unreachable). */
export function adminGateSecret(): string | null {
  const value = process.env.ADMIN_GATE?.trim();
  if (!value || !SECRET_TOKEN_RE.test(value) || RESERVED_SEGMENTS.has(value.toLowerCase()) || isPlaceholderSecret(value)) return null;
  return value;
}

/** One-time token required by /admin/setup, or null when unset/invalid/a placeholder (setup then stays hidden). */
export function setupTokenSecret(): string | null {
  const value = process.env.SETUP_TOKEN?.trim();
  return value && SECRET_TOKEN_RE.test(value) && !isPlaceholderSecret(value) ? value : null;
}

/** Key of the hPanel cron endpoint (/api/cron/tick?key=…), or null when unset, shorter than 8 or a placeholder (endpoint then answers 404). */
export function cronKeySecret(): string | null {
  const value = process.env.CRON_KEY?.trim();
  return value && value.length >= 8 && !isPlaceholderSecret(value) ? value : null;
}

/**
 * Optional admin IP allowlist (exact addresses, comma separated). Empty → everyone may reach the
 * gate. Matched against the address the nearest proxy saw (see gate.ts allowlistAddress()).
 */
export function adminIpAllowlist(): string[] {
  return (process.env.ADMIN_IP_ALLOWLIST ?? "")
    .split(",")
    .map((ip) => normalizeIp(ip))
    .filter((ip): ip is string => ip !== null);
}

/**
 * Lower-cases, trims, strips ports ("1.2.3.4:80", "[::1]:80"), IPv4-mapped IPv6 prefixes and IPv6
 * zone ids; null for empty input.
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  let value = ip?.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]"));
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(value)) value = value.slice(0, value.lastIndexOf(":"));
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  if (value.startsWith("::ffff:") && value.includes(".")) value = value.slice(7);
  return value || null;
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Canonical "hostname[:port]" for a Host-style value: lower-case, IDNA, no trailing dot, default ports
 * dropped. Null for anything that is not a bare host (empty, paths, queries, credentials, bad characters).
 */
export function normalizeHost(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(`http://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  const hostname = url.hostname.replace(/\.$/, "");
  if (!hostname) return null;
  const port = url.port === "443" ? "" : url.port; // the http: base already drops :80
  return port ? `${hostname}:${port}` : hostname;
}

/** Hosts a reverse proxy uses internally (IP literals, single-label names such as "localhost"), never a site name. */
export function isInternalHost(host: string): boolean {
  if (host.startsWith("[")) return true;
  const hostname = host.replace(/:\d+$/, "");
  return IPV4_RE.test(hostname) || !hostname.includes(".");
}

/** PUBLIC_URL's origin ("https://mystore.ma") when it is a valid http(s) URL. */
export function publicSiteOrigin(): string | null {
  const raw = process.env.PUBLIC_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

function publicUrlHost(): string | null {
  const origin = publicSiteOrigin();
  return origin ? normalizeHost(new URL(origin).host) : null;
}

interface AdminHostConfig {
  host: string | null;
  problem: string | null;
}

function readAdminHost(): AdminHostConfig {
  const raw = process.env.ADMIN_HOST?.trim();
  if (!raw) return { host: null, problem: null };
  let candidate: string | null = raw;
  if (raw.includes("://")) {
    candidate = null;
    try {
      const u = new URL(raw);
      const bare = u.pathname === "/" && !u.search && !u.hash && !u.username && !u.password;
      if ((u.protocol === "https:" || u.protocol === "http:") && bare) candidate = u.host;
    } catch {
      // not a URL: reported below
    }
  }
  const host = normalizeHost(candidate);
  if (!host || isInternalHost(host)) {
    return { host: null, problem: "ADMIN_HOST is not a valid host name (e.g. studio.mystore.ma). It is ignored, so the admin still shares the public pages' origin." };
  }
  if (host === publicUrlHost()) {
    return { host: null, problem: "ADMIN_HOST must be a host of its own, not PUBLIC_URL's (it would turn every landing page into a 404). It is ignored, so the admin still shares the public pages' origin." };
  }
  return { host, problem: null };
}

/**
 * Optional dedicated admin host name (ADMIN_HOST, e.g. "studio.mystore.ma"; a bare host or an origin URL).
 * When set, the gate, /admin and /api/admin answer only on this host, and this host serves nothing else.
 * The landing pages load third-party scripts (pixels); on a shared origin those scripts could drive the
 * admin with the owner's cookies. On a host of their own, the host-only `__Host-` cookies never reach
 * them. Null when unset or invalid (the admin then shares the public origin, as before).
 */
export function adminHost(): string | null {
  return readAdminHost().host;
}

/** Human-readable configuration problems, logged once at boot (never includes secret values). */
export function authConfigWarnings(): string[] {
  const warnings: string[] = [];
  const placeholder = (name: string, effect: string) =>
    `${name} is still a template value (e.g. from .env.example) — ${effect}. Generate a random one: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
  const appSecret = process.env.APP_SECRET ?? "";
  if (appSecret.length >= 32 && isPlaceholderSecret(appSecret)) warnings.push(placeholder("APP_SECRET", "every order fails (HTTP 500), the admin is unreachable and nothing is encrypted or signed until it is replaced"));
  else if (!isAppSecretConfigured()) warnings.push("APP_SECRET is missing or shorter than 32 characters — every order fails (HTTP 500), the admin is unreachable and settings encryption fails.");
  else if (IS_PROD && appSecret.length < 48) warnings.push("APP_SECRET should be at least 48 random characters in production.");

  const gate = adminGateSecret();
  const gateRaw = process.env.ADMIN_GATE?.trim() ?? "";
  if (!gate && gateRaw && isPlaceholderSecret(gateRaw)) warnings.push(placeholder("ADMIN_GATE", "the admin is unreachable"));
  else if (!gate) warnings.push("ADMIN_GATE is missing or invalid (8–128 chars of A–Z a–z 0–9 _ -, not a route name) — the admin is unreachable.");
  else if (IS_PROD && gate.length < 20) warnings.push("ADMIN_GATE is short; use 20+ random characters in production.");

  const setupRaw = process.env.SETUP_TOKEN?.trim() ?? "";
  if (setupRaw && isPlaceholderSecret(setupRaw)) warnings.push(placeholder("SETUP_TOKEN", "/admin/setup is disabled"));
  else if (setupRaw && !setupTokenSecret()) warnings.push("SETUP_TOKEN is invalid (8–128 chars of A–Z a–z 0–9 _ -) — /admin/setup is disabled.");

  const cronRaw = process.env.CRON_KEY?.trim() ?? "";
  if (cronRaw && isPlaceholderSecret(cronRaw)) warnings.push(placeholder("CRON_KEY", "/api/cron/tick stays disabled (orders are not pushed to Sheets in the background)"));
  else if (cronRaw && !cronKeySecret()) warnings.push("CRON_KEY is shorter than 8 characters — /api/cron/tick stays disabled.");
  if (IS_PROD && !process.env.PUBLIC_URL) warnings.push("PUBLIC_URL is not set.");

  const admin = readAdminHost();
  if (admin.problem) warnings.push(admin.problem);
  else if (admin.host && !publicUrlHost()) warnings.push("ADMIN_HOST is set but PUBLIC_URL is not: the admin's links to live pages would point at the admin host, which serves no landing pages.");
  else if (IS_PROD && !admin.host) {
    warnings.push("ADMIN_HOST is not set: the admin shares its origin with the public pages and the pixel scripts they load. Set ADMIN_HOST to a subdomain of its own (docs/DEPLOY-HOSTINGER.md §4a), or open live pages only in a browser profile with no admin session.");
  }
  return warnings;
}
