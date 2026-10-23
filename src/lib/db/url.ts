/**
 * DATABASE_URL as the app should use it. Hostinger's database setup writes `localhost` as the host, but
 * from Node.js `localhost` can resolve to ::1 (IPv6), which MariaDB users created for localhost may not
 * accept: connect over 127.0.0.1 instead (same server, IPv4 TCP). Any other host is left untouched.
 */
export function databaseUrl(raw: string | undefined = process.env.DATABASE_URL): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === "localhost") {
      u.hostname = "127.0.0.1";
      return u.toString();
    }
  } catch {
    // not a URL: let the driver report it
  }
  return raw;
}
