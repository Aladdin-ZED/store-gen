/**
 * Export request contract — shared by the admin ExportDialog (client) and the export route handlers.
 * Isomorphic and framework-free: no I/O, no server-only imports.
 *
 *   parseExportRequest(body)      → normalized request, or per-field errors (English, shown as is)
 *   normalizeAllowedOrigins(list) → canonical allow-list entries checked with the order API's own matcher
 *   normalizeSiteUrl(raw)         → { origin, base, href } of the public address of the exported site
 */
import { z } from "zod";
import { adminHostName, hostOf, legacyPlatformHosts, platformHost, storeRootDomain } from "@/lib/edge/env";
import { originAllowed } from "@/lib/orders/origin";
import { whatsappDigits } from "@/lib/render/config";

export const EXPORT_MODES = ["connected", "php", "whatsapp"] as const;
export type ExportMode = (typeof EXPORT_MODES)[number];
export const isExportMode = (v: unknown): v is ExportMode => typeof v === "string" && (EXPORT_MODES as readonly string[]).includes(v);

/** Page / version / export ids are ULIDs (src/lib/db/ids.ts newId). */
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const MAX_ALLOWED_ORIGINS = 20;

const RawRequest = z.object({
  versionId: z.string().regex(ULID_RE),
  mode: z.enum(EXPORT_MODES),
  allowedOrigins: z.array(z.string().max(300)).max(50).default([]),
  options: z
    .object({
      /** .htaccess, _headers and vercel.json */
      hostConfigs: z.boolean().default(true),
      /** public address of the exported site (canonical URL, sitemap, robots, absolute OG images) */
      siteUrl: z.string().max(300).optional(),
      /** WhatsApp mode: number orders are sent to (any format the admin types) */
      whatsappNumber: z.string().max(40).optional(),
      /** PHP mode: put the app's Google service-account key into cod-private/config.php (owners only) */
      embedServiceAccount: z.boolean().default(false),
    })
    .default({ hostConfigs: true, embedServiceAccount: false }),
});

export interface SiteUrl {
  /** "https://shop.ma" */
  origin: string;
  /** "https://shop.ma/promo/" — always ends with "/" */
  base: string;
  /** "/promo/" — path of the site root on its host */
  path: string;
}

export interface ExportRequest {
  versionId: string;
  mode: ExportMode;
  /** canonical allow-list (connected mode; empty otherwise) */
  allowedOrigins: string[];
  options: {
    hostConfigs: boolean;
    siteUrl: SiteUrl | null;
    /**
     * WhatsApp mode: the number as typed ("+212 6 12…", "06 12…"); turned into wa.me digits with the
     * page's phone country by the server. null → the page's / store's WhatsApp number.
     */
    whatsappNumber: string | null;
    embedServiceAccount: boolean;
  };
}

export type ExportRequestField = "versionId" | "mode" | "allowedOrigins" | "siteUrl" | "whatsappNumber" | "embedServiceAccount";

export type ParsedExportRequest =
  | { ok: true; value: ExportRequest }
  | { ok: false; errors: Partial<Record<ExportRequestField, string>> };

/* ------------------------------------------------------------------ */
/* Hosts                                                               */
/* ------------------------------------------------------------------ */

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host);

/** A DNS name with at least two labels, an IPv4 literal, or localhost — after IDN → punycode. */
function hostOk(hostname: string): boolean {
  if (hostname === "localhost") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname.split(".").every((n) => Number(n) <= 255);
  const labels = hostname.split(".");
  return labels.length >= 2 && labels.every((l) => LABEL.test(l)) && /[a-z]/.test(labels[labels.length - 1]!);
}

interface ParsedEntry {
  scheme: "https" | "http" | null;
  wildcard: boolean;
  /** hostname[:port], lower case, punycode */
  host: string;
}

/** "https://shop.ma", "shop.ma", "*.shop.ma", "https://*.shop.ma:8443/" → parts, or null. */
function parseEntry(raw: string): ParsedEntry | null {
  let v = raw.trim().toLowerCase();
  if (!v || v.length > 260) return null;
  const m = /^([a-z][a-z0-9+.-]*):\/\//.exec(v);
  let scheme: ParsedEntry["scheme"] = null;
  if (m) {
    if (m[1] !== "https" && m[1] !== "http") return null;
    scheme = m[1];
    v = v.slice(m[0].length);
  }
  v = v.replace(/\/+$/, "");
  if (!v || /[/?#@\s\\]/.test(v)) return null;
  const wildcard = v.startsWith("*.");
  if (wildcard) v = v.slice(2);
  if (v.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(`${scheme ?? "https"}://${v}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  if (!hostOk(url.hostname)) return null;
  return { scheme, wildcard, host: url.host };
}

function entryText(e: ParsedEntry): string {
  return `${e.scheme ? `${e.scheme}://` : ""}${e.wildcard ? "*." : ""}${e.host}`;
}

/**
 * An entry naming the platform itself (PLATFORM_HOST, a former platform host, the console's host) or a store address
 * under STORE_ROOT_DOMAIN (the apex, a subdomain, a wildcard covering one): every store's pages are served there, so
 * the export would take orders from all of them (docs/STORE-SAAS.md §C.9, SEC-23). Refused at save; `originAllowed`
 * refuses it again at check time. The variables are server-only: in the dialog this check passes and the server
 * answers the field error.
 */
function platformEntry(e: ParsedEntry): boolean {
  const host = hostOf(e.host);
  if (!host) return false;
  const name = host.replace(/:\d+$/, "");
  const covers = (h: string) => (e.wildcard ? h.replace(/:\d+$/, "").endsWith(`.${name}`) : h === host);
  for (const h of [platformHost(), adminHostName(), ...legacyPlatformHosts()]) if (h && covers(h)) return true;
  const root = storeRootDomain();
  return !!root && (name === root || name.endsWith(`.${root}`) || (e.wildcard && root.endsWith(`.${name}`)));
}

/**
 * Validates allow-list entries for connected exports (full origins, bare hosts or "*.shop.ma"
 * wildcards). Every accepted entry is proven effective with the order API's own matcher, so the
 * dialog can never save an entry the server would silently ignore (e.g. "*.co.ma"). `platform` lists
 * the entries refused because they name the platform's own addresses (also in `invalid`).
 */
export function normalizeAllowedOrigins(input: readonly string[]): { origins: string[]; invalid: string[]; platform: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  const platform: string[] = [];
  for (const raw of input) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const e = parseEntry(trimmed);
    const text = e ? entryText(e) : "";
    const probe = e ? `${e.scheme ?? "https"}://${e.wildcard ? "www." : ""}${e.host}` : "";
    // the platform's own addresses first: originAllowed refuses them too (T3, SEC-23), and the seller is told why
    if (e && platformEntry(e)) {
      invalid.push(trimmed);
      platform.push(trimmed);
      continue;
    }
    if (!e || !originAllowed(probe, [text])) {
      invalid.push(trimmed);
      continue;
    }
    if (!origins.includes(text)) origins.push(text);
  }
  return { origins, invalid, platform };
}

/** Is this origin covered by the allow-list (same rules as the order API)? */
export function originCovered(origin: string, allowed: readonly string[]): boolean {
  return originAllowed(origin, allowed);
}

/** The public address of the exported site: https (http only for localhost), no query or fragment. */
export function normalizeSiteUrl(raw: string | null | undefined): SiteUrl | null {
  const v = (raw ?? "").trim();
  if (!v || v.length > 300) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  const local = isLocalHost(url.host);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password || url.search || url.hash || !hostOk(url.hostname)) return null;
  // the site root is a folder: drop a trailing file name ("…/index.html"), keep "/"
  let path = url.pathname.replace(/\/[^/]*\.[a-z0-9]{2,5}$/i, "/");
  if (!path.endsWith("/")) path += "/";
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(path)) return null;
  return { origin: url.origin, base: `${url.origin}${path}`, path };
}

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export const WHATSAPP_HINT = "Enter a WhatsApp number with its country code, e.g. +212 6 12 34 56 78";

/**
 * Validates an export request. `requireOrigins: false` (size estimates) accepts a connected request
 * without domains; `phoneCountry` completes national WhatsApp numbers ("06…") for the format check.
 */
export function parseExportRequest(input: unknown, opts: { phoneCountry?: string; requireOrigins?: boolean } = {}): ParsedExportRequest {
  const parsed = RawRequest.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<Record<ExportRequestField, string>> = {};
    for (const issue of parsed.error.issues) {
      const head = issue.path[0] === "options" ? issue.path[1] : issue.path[0];
      if (head === "versionId") errors.versionId = "Choose a version to export.";
      else if (head === "mode") errors.mode = "Choose how orders are received.";
      else if (head === "allowedOrigins") errors.allowedOrigins = "Too many domains (max 20).";
      else if (head === "siteUrl") errors.siteUrl = "The site address is too long.";
      else if (head === "whatsappNumber") errors.whatsappNumber = "Enter a valid WhatsApp number.";
    }
    if (!Object.keys(errors).length) errors.mode = "Invalid export request.";
    return { ok: false, errors };
  }
  const r = parsed.data;
  const errors: Partial<Record<ExportRequestField, string>> = {};

  const rawSite = r.options.siteUrl?.trim() ?? "";
  const siteUrl = rawSite ? normalizeSiteUrl(rawSite) : null;
  if (rawSite && !siteUrl) errors.siteUrl = "Use a full https:// address, e.g. https://shop.ma";

  let allowedOrigins: string[] = [];
  if (r.mode === "connected") {
    const { origins, invalid, platform } = normalizeAllowedOrigins(r.allowedOrigins);
    if (platform.length) {
      errors.allowedOrigins = `${platform[0]} is this platform's own address, shared by every store. Add the domain where you will host the page.`;
    } else if (invalid.length) {
      errors.allowedOrigins = `Not a valid domain: ${invalid.slice(0, 3).join(", ")} — use shop.ma, https://shop.ma or *.shop.ma`;
    } else if (!origins.length && opts.requireOrigins !== false) {
      errors.allowedOrigins = "Add the domain where you will host the page — orders from other sites are refused.";
    } else if (origins.length > MAX_ALLOWED_ORIGINS) {
      errors.allowedOrigins = `At most ${MAX_ALLOWED_ORIGINS} domains.`;
    }
    allowedOrigins = origins;
  }

  let whatsappNumber: string | null = null;
  if (r.mode === "whatsapp" && r.options.whatsappNumber?.trim()) {
    whatsappNumber = r.options.whatsappNumber.trim();
    if (!whatsappDigits(whatsappNumber, opts.phoneCountry ?? "MA")) errors.whatsappNumber = WHATSAPP_HINT;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      versionId: r.versionId,
      mode: r.mode,
      allowedOrigins,
      options: {
        hostConfigs: r.options.hostConfigs,
        siteUrl,
        whatsappNumber,
        embedServiceAccount: r.mode === "php" && r.options.embedServiceAccount,
      },
    },
  };
}

/** "argan-connected-20261007-1730.zip" */
export function exportFileName(slug: string, mode: ExportMode, at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}`;
  const safe = slug.replace(/[^a-z0-9-]/g, "").slice(0, 60) || "landing";
  return `${safe}-${mode}-${stamp}.zip`;
}
