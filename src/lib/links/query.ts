/**
 * The query rule of `/go/<code>` (P3 LANDING; landing.md LAN-§12.1 "Query rule", LD14; docs/STORE-SAAS.md V7): pure.
 *
 * `incoming` is the raw query exactly as received (no leading "?"). When any of its keys starts with `utm_` (ASCII
 * case-insensitive, the key as sent, before any decoding) the result is `incoming` unchanged: the ad platform's own
 * tags win. Otherwise the link's set presets come first, in the fixed order source, medium, campaign, content, term,
 * percent-encoded, followed by "&" + `incoming` when there is one. The incoming part is never decoded, re-encoded or
 * reordered, so click ids (`fbclid`, `ttclid`, `gclid`, `ScCid`) arrive byte for byte.
 */
import { UTM_KEYS, type ShortLinkUtm } from "./types";

/** Does the raw query carry a `utm_*` key (ASCII case-insensitive)? */
export function hasUtmKey(incoming: string): boolean {
  if (!incoming) return false;
  for (const part of incoming.split("&")) {
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    if (key.length >= 4 && key.slice(0, 4).replace(/[A-Z]/g, (c) => c.toLowerCase()) === "utm_") return true;
  }
  return false;
}

/** The preset part ("utm_source=…&utm_medium=…") of a link, in the fixed order; "" when none is set. */
export function presetQuery(utm: ShortLinkUtm | null | undefined): string {
  if (!utm) return "";
  const parts: string[] = [];
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (typeof value === "string" && value !== "") parts.push(`utm_${key}=${encodeURIComponent(value)}`);
  }
  return parts.join("&");
}

/** The query of the redirect without its "?" ("" when none): see the module comment. */
export function linkQuery(utm: ShortLinkUtm | null | undefined, incoming: string): string {
  const raw = incoming.startsWith("?") ? incoming.slice(1) : incoming;
  if (hasUtmKey(raw)) return raw;
  const presets = presetQuery(utm);
  if (!presets) return raw;
  return raw ? `${presets}&${raw}` : presets;
}

/** The raw query of a request URL without its "?" and fragment, exactly as the client sent it ("" when none). */
export function rawQueryOf(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return "";
  const hash = url.indexOf("#", q);
  return hash < 0 ? url.slice(q + 1) : url.slice(q + 1, hash);
}
