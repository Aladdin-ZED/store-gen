/**
 * Pure rules of the console read models (platform.md PLA-§5.2, §6.1; PD15): isomorphic, so `test:platform` checks them
 * without a database.
 */
import type { PlatformRole } from "@/lib/auth/permissions";

/** PD15: an analyst sees order aggregates only when at least k (≥ 5) stores contribute. */
export function suppressedFor(role: PlatformRole, contributingStores: number, k: number): boolean {
  return role === "analyst" && contributingStores < Math.max(5, k);
}

/** One CSV cell: quoted when needed, a leading formula character neutralised (CSV injection, OWASP). */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ?`"${s.replace(/"/g, '""')}"` : s;
}
