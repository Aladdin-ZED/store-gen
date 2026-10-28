/**
 * The identity catalog, Arabic (T2's R1.0 surfaces). Moved at P0b to the owners' files, D67 (CCR P2-15, without
 * renames and with the same values): `auth.*` → src/lib/i18n/admin/ar/auth.ts; `team.*`, `notify.invite.*` and
 * `notify.member.*` → ar/team.ts; `account.*`, `app.*` and `store.security.*` → ar/shell.ts (P2 SHELL);
 * `notify.store.impersonation_*` and `notify.user.*` → ar/notify.ts (P1 CONSOLE; the console's keys stay English in
 * R1); `error.*` → the core keys of src/lib/i18n/admin/ar.ts. Kept empty: a new identity key goes to its owner's file.
 */
import type { messages as en } from "./en";

export const messages: Partial<Record<keyof typeof en, string>> = {};
