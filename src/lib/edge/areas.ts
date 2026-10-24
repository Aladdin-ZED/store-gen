import "server-only";
/**
 * Path areas (docs/STORE-SAAS.md §C.3 step 1): what part of the app a request path belongs to, the input of
 * every proxy rule. The successor of adminAreaOf() (src/lib/auth/gate.ts): the same percent-decoding,
 * backslash and slash collapsing and case folding, so encoded or oddly-cased variants land in the same
 * area as the plain path. No Next.js request APIs; used by src/proxy.ts and tests.
 */
import { isGatePath } from "@/lib/auth/gate";
import { APP_STATIC_SEGMENTS } from "@/lib/tenancy/handles";

export type Area =
  | "console" // /admin/**
  | "console-api" // /api/admin/**
  | "app" // /app/** (GET /app/manifest.webmanifest is its one non-HTML path, isAppManifestPath)
  | "app-api" // /api/app/**
  | "auth" // /login, /signup, /invite/* (incl. /invite/staff/*), /reset/*, /report/* (D76)
  | "kit" // /kit/*: platform-only public share pages (LAN Q12)
  | "marketing" // /, /terms, /privacy, /aup, /features
  | "store" // /s/**
  | "internal" // /d/** (custom-domain rewrite target, D16)
  | "preview" // /preview/*
  | "public-api" // /api/public/**, /api/health, /api/hooks/** (R2)
  | "api-v1" // /api/v1/** (R3: platform host only, bearer api_keys only)
  | "cron" // /api/cron/**
  | "gate" // the ADMIN_GATE segment
  | "other";

/** decoded, "\" → "/", "//" collapsed, lower-cased (adminAreaOf's normalisation) */
export function normalizePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // keep the raw path; malformed escapes can't route anywhere sensible anyway
  }
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
}

/** `path` is `prefix` itself or below it (segment boundary: "/application" is not under "/app"). */
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

const MARKETING = new Set(["/", "/terms", "/privacy", "/aup", "/features"]);
const AUTH = ["/login", "/signup", "/invite", "/reset", "/report"] as const;

export function areaOf(pathname: string): Area {
  // the gate is an exact match on the raw path, compared through digests (isGatePath)
  if (isGatePath(pathname)) return "gate";
  const path = normalizePath(pathname);
  if (under(path, "/admin")) return "console";
  if (under(path, "/api/admin")) return "console-api";
  if (under(path, "/api/app")) return "app-api";
  if (under(path, "/api/public") || path === "/api/health" || under(path, "/api/hooks")) return "public-api";
  if (under(path, "/api/v1")) return "api-v1";
  if (under(path, "/api/cron")) return "cron";
  if (under(path, "/app")) return "app";
  if (AUTH.some((p) => under(path, p))) return "auth";
  if (under(path, "/kit")) return "kit";
  if (under(path, "/s")) return "store";
  if (under(path, "/d")) return "internal";
  if (under(path, "/preview")) return "preview";
  if (MARKETING.has(path.length > 1 ? path.replace(/\/$/, "") : path)) return "marketing";
  return "other";
}

/** `GET /app/manifest.webmanifest`: in the `app` area but no nonce headers; the handler's Content-Type and Cache-Control stay (PLA Q.26). */
export function isAppManifestPath(pathname: string): boolean {
  return normalizePath(pathname) === "/app/manifest.webmanifest";
}

const HANDLE_SEGMENT_RE = /^[a-z0-9-]{1,63}$/;

/**
 * The handle segment of `/<prefix>/<handle>[/rest]` (normalised), or null. `rest` keeps the remainder
 * ("" for the store home) without the query. The caller still checks the handle (isHandle, the store
 * lookup): this only cuts the path.
 */
function handleAt(prefix: "/s" | "/app", pathname: string): { handle: string; rest: string } | null {
  const path = normalizePath(pathname.split("?")[0] ?? "");
  if (!path.startsWith(`${prefix}/`)) return null;
  const tail = path.slice(prefix.length + 1);
  const slash = tail.indexOf("/");
  const handle = slash === -1 ? tail : tail.slice(0, slash);
  if (!HANDLE_SEGMENT_RE.test(handle)) return null;
  return { handle, rest: slash === -1 ? "" : tail.slice(slash) };
}

/** `/s/<handle>/<rest>` → { handle, rest: "/<rest>" | "" }. */
export function storePathParts(pathname: string): { handle: string; rest: string } | null {
  return handleAt("/s", pathname);
}

/** `/app/<handle>/…` → the handle (`x-sg-path` of a store action, D2); the static segments (`/app/new`, `/app/account`, …) are not stores. */
export function appPathHandle(pathname: string): string | null {
  const parts = handleAt("/app", pathname);
  if (!parts || APP_STATIC_SEGMENTS.has(parts.handle)) return null;
  return parts.handle;
}
