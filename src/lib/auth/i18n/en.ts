/**
 * The identity catalog, English (T2's R1.0 surfaces). Moved at P0b to the owners' files, D67 (CCR P2-15, without
 * renames and with the same values): `auth.*` → src/lib/i18n/admin/en/auth.ts; `team.*`, `notify.invite.*` and
 * `notify.member.*` → en/team.ts; `account.*`, `app.*` and `store.security.*` → en/shell.ts (P2 SHELL); `console.*`
 * → en/console.ts; `notify.store.impersonation_*` and `notify.user.*` → en/notify.ts (P1 CONSOLE); `error.*` → the
 * core keys of src/lib/i18n/admin/en.ts. Kept empty: a new identity key goes to its owner's file, never here.
 */
export const messages = {} as const satisfies Record<string, string>;
