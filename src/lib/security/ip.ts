/**
 * Client IP for rate limiting & abuse signals (always hashed before storage).
 *
 * Left-most X-Forwarded-For entries and CF-Connecting-IP are client-controlled unless a trusted proxy
 * overwrites them, so we read what the proxies in front of the app appended, walking the list from
 * the right (nearest proxy first):
 *  - internal hops (loopback, private, link-local, shared CGNAT and unique-local addresses) are
 *    skipped: no visitor reaches a public site from one, so they are the host's own proxies talking
 *    over its internal network (e.g. its CDN → web server → app);
 *  - the TRUSTED_PROXY_HOPS-th public entry from the right is the visitor (default 1: the address the
 *    host's outermost proxy saw connecting). Each further public appending proxy in front (a CDN that
 *    connects from public addresses) needs one more hop.
 * A visitor can only add entries to the LEFT of the ones the proxies append, so they never move this
 * pick, unless TRUSTED_PROXY_HOPS is set higher than the real chain or the request itself comes from
 * inside the host's network. The owner checks the result on the live site in Settings → Security
 * (clientIpReport): a value too low puts every visitor in one rate-limit bucket.
 *
 * CF-Connecting-IP is honoured only when BEHIND_CLOUDFLARE=1 AND that proxy hop is a Cloudflare edge
 * address: the origin of a managed Node.js app stays reachable directly (shared IP + Host header,
 * hosting sub-domain), so the header alone proves nothing.
 *
 * Store hosts in S mode reach the app through the Store Gen Worker (docs/STORE-SAAS.md §C.2, §C.5): when its
 * key and timestamp verify (edgeVerified), the Worker's x-sg-ip (Cloudflare's CF-Connecting-IP as the Worker
 * saw it) is the visitor and wins over every rule above. An x-sg-ip without a verified key is ignored, here
 * and in the proxy, which deletes it; handlers never rely on that deletion (D18).
 *
 * Limits, the IP blocklist and velocity signals key on rateKeyIp(): an IPv6 client controls its whole
 * /64 (2^64 source addresses), so per-address buckets would be free to rotate.
 */
import { BlockList, isIP } from "node:net";
import { edgeClientIp } from "@/lib/edge/host";
import { CLOUDFLARE_IPV4, CLOUDFLARE_IPV6 } from "./cloudflare-ips";

/**
 * TRUSTED_PROXY_HOPS (1–5, default 1): how many proxies in front of the app append a PUBLIC address
 * to X-Forwarded-For (internal hops are not counted, see the header comment).
 */
export function trustedProxyHops(): number {
  const n = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
}

/** The 8 hextets of a syntactically valid IPv6 address (embedded dotted IPv4 tail included). */
function ipv6Hextets(v: string): number[] | null {
  let s = v;
  const tail: number[] = [];
  if (s.includes(".")) {
    const colon = s.lastIndexOf(":");
    const quad = s.slice(colon + 1).split(".").map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
    if (quad.length !== 4 || quad.some((n) => n < 0 || n > 255)) return null;
    tail.push((quad[0]! << 8) | quad[1]!, (quad[2]! << 8) | quad[3]!);
    s = s.slice(0, colon + 1);
    if (!s.endsWith("::")) s = s.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (x: string | undefined) => (x ? x.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : -1)) : []);
  const head = groups(halves[0]);
  const rest = groups(halves[1]);
  const gap = 8 - tail.length - head.length - rest.length;
  if (halves.length === 2 ? gap < 1 : gap !== 0) return null;
  const out = [...head, ...new Array<number>(halves.length === 2 ? gap : 0).fill(0), ...rest, ...tail];
  return out.length === 8 && out.every((n) => n >= 0) ? out : null;
}

/**
 * An address as found in a header → its canonical form: trimmed, lower-case, brackets / port / zone id
 * removed, IPv4-mapped IPv6 ("::ffff:1.2.3.4") unwrapped to IPv4. null when it is not an IP address.
 */
export function canonicalIp(raw: string | null | undefined): string | null {
  let v = raw?.trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    if (end === -1) return null;
    v = v.slice(1, end);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(v)) {
    v = v.slice(0, v.lastIndexOf(":"));
  }
  const zone = v.indexOf("%");
  if (zone !== -1) v = v.slice(0, zone);
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind !== 6) return null;
  const h = ipv6Hextets(v);
  if (!h) return null;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return [h[6]! >> 8, h[6]! & 255, h[7]! >> 8, h[7]! & 255].join(".");
  }
  return v;
}

/**
 * The network an address stands for, as used by every per-IP limit, the IP blocklist and the
 * same-network velocity signal: IPv4 → the address itself; IPv6 → its /64 ("2001:db8:0:1::/64"),
 * the block a single subscriber, VPS or phone controls. Anything that is not an IP is returned
 * trimmed and lower-cased (one shared bucket, as before).
 */
export function rateKeyIp(ip: string): string {
  const c = canonicalIp(ip);
  if (!c) return ip.trim().toLowerCase();
  if (isIP(c) === 4) return c;
  const h = ipv6Hextets(c);
  return h ? `${h.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64` : c;
}

let cloudflareRanges: BlockList | null = null;

/** Is `ip` inside Cloudflare's published edge ranges? */
export function isCloudflareIp(ip: string): boolean {
  const c = canonicalIp(ip);
  const kind = c ? isIP(c) : 0;
  if (!c || !kind) return false;
  if (!cloudflareRanges) {
    const list = new BlockList();
    for (const [ranges, family] of [
      [CLOUDFLARE_IPV4, "ipv4"],
      [CLOUDFLARE_IPV6, "ipv6"],
    ] as const) {
      for (const range of ranges) {
        const [net, prefix] = range.split("/");
        list.addSubnet(net!, Number(prefix), family);
      }
    }
    cloudflareRanges = list;
  }
  return cloudflareRanges.check(c, kind === 4 ? "ipv4" : "ipv6");
}

let internalRanges: BlockList | null = null;

/**
 * Addresses no visitor reaches a public website from: loopback, RFC 1918 private, link-local, the
 * shared CGNAT space (100.64/10, used inside carrier and provider networks), "this network" 0/8,
 * IPv6 loopback / unspecified, unique-local fc00::/7 and link-local fe80::/10. IPv4-mapped IPv6 is
 * unwrapped first (canonicalIp).
 */
export function isInternalIp(ip: string): boolean {
  const c = canonicalIp(ip);
  const kind = c ? isIP(c) : 0;
  if (!c || !kind) return false;
  if (!internalRanges) {
    const list = new BlockList();
    for (const [net, prefix] of [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.168.0.0", 16],
    ] as const) {
      list.addSubnet(net, prefix, "ipv4");
    }
    for (const [net, prefix] of [
      ["::", 127], // :: and ::1
      ["fc00::", 7],
      ["fe80::", 10],
    ] as const) {
      list.addSubnet(net, prefix, "ipv6");
    }
    internalRanges = list;
  }
  return internalRanges.check(c, kind === 4 ? "ipv4" : "ipv6");
}

/** One X-Forwarded-For entry as the client-IP walk sees it. */
interface Hop {
  /** the entry as received (trimmed) */
  raw: string;
  /** canonical address, null when the entry is not an IP */
  ip: string | null;
  /** loopback / private / link-local / CGNAT / unique-local: skipped by the walk */
  internal: boolean;
}

/**
 * X-Forwarded-For entries, left (farthest from the app) to right (appended by the nearest proxy).
 * Only the right-most MAX_HOPS are looked at: the proxies' entries are a handful, anything further
 * left is client-sent padding.
 */
const MAX_HOPS = 32;
function forwardedHops(headers: Headers): Hop[] {
  return (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-MAX_HOPS)
    .map((raw) => {
      const ip = canonicalIp(raw);
      return { raw, ip, internal: ip !== null && isInternalIp(ip) };
    });
}

/**
 * Index of the entry read as the visitor: the `trusted`-th public entry counted from the right,
 * internal entries skipped. Fewer public entries than that: the left-most public one. None public
 * (a request from inside the network, local development): the right-most entry. null: no entries.
 */
function pickHop(hops: readonly Hop[], trusted: number): number | null {
  let seen = 0;
  let leftmostPublic: number | null = null;
  for (let i = hops.length - 1; i >= 0; i--) {
    if (hops[i]!.internal) continue;
    leftmostPublic = i;
    if (++seen === trusted) return i;
  }
  if (leftmostPublic !== null) return leftmostPublic;
  return hops.length ? hops.length - 1 : null;
}

/** The address the proxies in front of the app saw connecting (canonical when it is a valid IP). */
function proxyHop(headers: Headers): string | null {
  const hops = forwardedHops(headers);
  const at = pickHop(hops, trustedProxyHops());
  if (at !== null) return hops[at]!.ip ?? hops[at]!.raw;
  const real = headers.get("x-real-ip")?.trim();
  return real ? (canonicalIp(real) ?? real) : null;
}

/** The visitor's address as the app reads it (see the header comment); "0.0.0.0" when nothing is sent. */
export function clientIp(headers: Headers): string {
  return resolveClientIp(headers).ip;
}

function resolveClientIp(headers: Headers): { ip: string; viaCloudflare: boolean; viaEdge: boolean } {
  const edge = canonicalIp(edgeClientIp(headers));
  if (edge) return { ip: edge, viaCloudflare: true, viaEdge: true };
  const hop = proxyHop(headers);
  if (process.env.BEHIND_CLOUDFLARE === "1" && hop && isCloudflareIp(hop)) {
    const cf = canonicalIp(headers.get("cf-connecting-ip"));
    if (cf) return { ip: cf, viaCloudflare: true, viaEdge: false };
  }
  return { ip: hop ?? "0.0.0.0", viaCloudflare: false, viaEdge: false };
}

/**
 * How clientIp() reads this request, for the owner's check in Settings → Security: the address it
 * picks must be the owner's own public IP. One more public appending proxy in front of the host's
 * (a CDN) would make it that proxy's address, shared by every visitor (one rate-limit bucket for all).
 * The viewer's own request only; nothing here is logged or stored.
 */
export interface ClientIpReport {
  /** X-Forwarded-For entries, left to right; at most the 12 right-most */
  hops: {
    /** the entry, ≤ 64 characters */
    value: string;
    /** 1 = the right-most public entry, 2 = the next one to its left…; null for internal entries */
    publicHop: number | null;
    internal: boolean;
    /** the entry clientIp() reads */
    used: boolean;
  }[];
  /** X-Real-IP (used only when X-Forwarded-For is absent) */
  realIp: string | null;
  trustedHops: number;
  /** what clientIp() returns for this request */
  clientIp: string;
  /** BEHIND_CLOUDFLARE=1 and the used hop is a Cloudflare edge: clientIp is CF-Connecting-IP (also true via the Worker) */
  viaCloudflare: boolean;
  /** the Store Gen Worker verified (store hosts in S mode): clientIp is its x-sg-ip */
  viaEdge: boolean;
}

export function clientIpReport(headers: Headers): ClientIpReport {
  const all = forwardedHops(headers);
  const at = pickHop(all, trustedProxyHops());
  // the right-most entries are the ones that matter (TRUSTED_PROXY_HOPS ≤ 5); the rest is client-sent
  const offset = Math.max(0, all.length - 12);
  const numbers = new Array<number | null>(all.length).fill(null);
  for (let i = all.length - 1, n = 0; i >= 0; i--) if (!all[i]!.internal) numbers[i] = ++n;
  const resolved = resolveClientIp(headers);
  return {
    hops: all.slice(offset).map((h, i) => ({
      value: h.raw.slice(0, 64),
      publicHop: numbers[offset + i] ?? null,
      internal: h.internal,
      used: offset + i === at,
    })),
    realIp: headers.get("x-real-ip")?.trim().slice(0, 64) || null,
    trustedHops: trustedProxyHops(),
    clientIp: resolved.ip.slice(0, 64),
    viaCloudflare: resolved.viaCloudflare,
    viaEdge: resolved.viaEdge,
  };
}
