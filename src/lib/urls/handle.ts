/**
 * The store handle's format (docs/STORE-SAAS.md §C.7): the `<handle>` of `/app/<handle>`, `/s/<handle>` and
 * `<handle>.<STORE_ROOT_DOMAIN>`. Isomorphic and free of imports, so client components can check a handle
 * (`src/components/admin/shell/store-handle.tsx`) without pulling src/lib/tenancy/handles.ts, whose availability and
 * rename functions load the database lazily (a bundler still follows that import into the browser graph).
 */

/** 3-30 chars of a-z 0-9 and inner hyphens; see isHandle for the "--" rule. */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** The handle format: HANDLE_RE and no "--" at positions 3-4 (blocks `xn--` punycode and look-alike IDNs). */
export function isHandle(value: string): boolean {
  return HANDLE_RE.test(value) && value.slice(2, 4) !== "--";
}
