/**
 * Addressing configuration read from the environment at call time (docs/STORE-SAAS.md §C.1, §H.7): restart
 * after a change, never a rebuild (none of these is a NEXT_PUBLIC_* variable). Framework-free and isomorphic
 * so src/lib/urls stays importable by client components; in a browser bundle every value reads as unset,
 * which is why the URL builders that need it refuse to run there.
 *
 *   PLATFORM_URL           platform origin (PUBLIC_URL is its alias for one release and wins only when it is unset)
 *   STORE_ROOT_DOMAIN      the domain store subdomains hang off (= the apex at launch)
 *   EDGE_KEY               the Worker's shared secret; with STORE_ROOT_DOMAIN it turns S mode on
 *   LEGACY_PLATFORM_HOSTS  comma list of former platform hosts (308 forever, D19)
 *   ADMIN_HOST             the console's own host (from the domain move, D44)
 */

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Canonical "hostname[:port]" for a Host-style value: lower-case, IDNA, no trailing dot, default ports
 * dropped; null for anything that is not a bare host. Same rules as normalizeHost() in
 * src/lib/auth/config.ts (server-only there; test:hosts keeps the two equal).
 */
export function hostOf(value: string | null | undefined): string | null {
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

/** An IPv4 or IPv6 literal, with or without a port. */
export function isIpLiteral(host: string): boolean {
  if (host.startsWith("[")) return true;
  return IPV4_RE.test(host.replace(/:\d+$/, ""));
}

/** A host value or an origin URL ("https://x.y" with no path) → its normalized host. */
function hostOrOrigin(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!value.includes("://")) return hostOf(value);
  try {
    const u = new URL(value);
    const bare = u.pathname === "/" && !u.search && !u.hash && !u.username && !u.password;
    return (u.protocol === "https:" || u.protocol === "http:") && bare ? hostOf(u.host) : null;
  } catch {
    return null;
  }
}

/** PLATFORM_URL (else PUBLIC_URL) when it is an http(s) URL; only its origin is used. */
export function platformUrl(): URL | null {
  for (const raw of [process.env.PLATFORM_URL, process.env.PUBLIC_URL]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const u = new URL(value);
      return u.protocol === "https:" || u.protocol === "http:" ? new URL(u.origin) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** PLATFORM_HOST = normalizeHost(new URL(PLATFORM_URL).host), or null when unset. */
export function platformHost(): string | null {
  const url = platformUrl();
  return url ? hostOf(url.host) : null;
}

/** STORE_ROOT_DOMAIN as a bare registrable-looking domain (no port, no IP, at least one dot), or null. */
export function storeRootDomain(): string | null {
  const host = hostOf(process.env.STORE_ROOT_DOMAIN);
  if (!host || host.includes(":") || isIpLiteral(host) || !host.includes(".")) return null;
  return host;
}

/** EDGE_KEY is set to something long enough to be a secret (32+ chars; host.ts also refuses template values). */
export function edgeKeyPresent(): boolean {
  return (process.env.EDGE_KEY?.trim().length ?? 0) >= 32;
}

/** S mode: STORE_ROOT_DOMAIN and EDGE_KEY are both set (§C.1). */
export function subdomainMode(): boolean {
  return storeRootDomain() !== null && edgeKeyPresent();
}

/** LEGACY_PLATFORM_HOSTS, normalized; the current platform host is never one of them. */
export function legacyPlatformHosts(): ReadonlySet<string> {
  const platform = platformHost();
  const hosts = (process.env.LEGACY_PLATFORM_HOSTS ?? "")
    .split(",")
    .map((h) => hostOrOrigin(h))
    .filter((h): h is string => h !== null && h !== platform);
  return new Set(hosts);
}

/**
 * ADMIN_HOST (bare host or origin URL), or null when unset or unusable: an IP, a single-label name or the
 * platform host itself (the same refusals as src/lib/auth/config.ts adminHost()).
 */
export function adminHostName(): string | null {
  const host = hostOrOrigin(process.env.ADMIN_HOST);
  if (!host || isIpLiteral(host) || !host.replace(/:\d+$/, "").includes(".")) return null;
  return host === platformHost() ? null : host;
}
