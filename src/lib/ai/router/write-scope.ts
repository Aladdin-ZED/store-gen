/**
 * The write scope of an AI write (P7 AI; docs/STORE-SAAS.md D70, D71): the seam's writable kinds (member, public,
 * system); an impersonation or a platform scope is read-only and answers `state` before anything is read. CCR
 * r1-p7-7 moves this narrowing into src/lib/tenancy/seam.ts (`writeScopeOf`, the one file lint L6 lets narrow a scope)
 * at the merge; until then it is this track's one L6 report (moved here from ./run.server.ts at step 8, so the job
 * drivers and the batch queue share it without importing the provider).
 */
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

export function writeScopeOf(scope: StoreScope): WriteScope | null {
  return scope.kind === "member" || scope.kind === "public" || scope.kind === "system" ? (scope as WriteScope) : null;
}
