/**
 * Two-store attack cases of the shell track (P2 SHELL, platform.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0b (CCR X-1) and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty `cases` as not applicable until the track merges.
 * `actions` holds the attack cases of P2's own store server actions (they join the harness's `ACTION_CASES`); P1 keeps
 * the PLA-§O.3 special cases, the shell's included, in `tenancy-cases/platform.ts`.
 */
import type { TenancyCase, TrackActionCase } from "../tenancy-check";

export const cases: TenancyCase[] = [];

export const actions: TrackActionCase[] = [];
