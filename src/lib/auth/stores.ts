import "server-only";
/**
 * A new store and its owner (docs/STORE-SAAS.md §B.2 step 7, §B.11, PLA-§22.2 `/app/new`): the rows every creation path
 * writes inside its transaction, so signup, "Create another store" and the first-run setup can never drift apart.
 *
 *   stores          status pending | active, the platform's new-store defaults (`platform.newStore.*`), a random brand seed
 *   store_members   the creator as `owner`
 *
 * The owner membership is the store's first tenant row: it is written through `newStoreScope(storeId)` (the seam's
 * one scope for a store the same transaction created), never from input.
 */
import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import type { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { storeMembers, stores } from "@/lib/db/schema";
import type { PlatformSetting } from "@/lib/settings/keys/platform";
import { handleProblem as t1HandleProblem, checkHandleAvailable, isHandle } from "@/lib/tenancy/handles";
import { newStoreScope } from "@/lib/tenancy/seam";
import { storeValues } from "@/lib/tenancy/sql";
import type { MessageKey, StoreStatus, WriteScope } from "@/lib/tenancy/types";
import type { StoreMode } from "@/lib/tenancy/mode";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface NewStoreRow {
  name: string;
  handle: string;
  mode: StoreMode;
  status: Extract<StoreStatus, "pending" | "active">;
  market: string;
  createdBy: string;
  /** default: the column default ("beta"); setup uses "internal" (§B.11) */
  planId?: string;
  /** set on an auto-approved or internal store */
  approvedBy?: string | null;
}

/** Inserts the store row and its owner membership; returns the store id and its creator scope. */
export async function insertStoreTx(tx: Tx, input: NewStoreRow, defaults: PlatformSetting["newStore"]): Promise<{ storeId: string; scope: WriteScope }> {
  const storeId = newId();
  const now = new Date();
  await tx.insert(stores).values({
    id: storeId,
    handle: input.handle,
    name: input.name,
    mode: input.mode,
    status: input.status,
    statusChangedAt: now,
    ...(input.planId ? { planId: input.planId } : {}),
    market: input.market,
    currency: defaults.currency,
    timezone: defaults.timezone,
    defaultLocale: defaults.defaultLocale,
    locales: defaults.locales,
    brandSeed: randomBytes(8).toString("hex"),
    createdBy: input.createdBy,
    ...(input.status === "active" ? { approvedAt: now, approvedBy: input.approvedBy ?? null } : {}),
  });
  const scope = newStoreScope(storeId);
  await insertOwnerTx(tx, scope, input.createdBy, now);
  return { storeId, scope };
}

/** The creator's owner membership of the new store (lint L1: the scope is the parameter). */
async function insertOwnerTx(tx: Tx, scope: WriteScope, userId: string, joinedAt: Date): Promise<void> {
  await tx.insert(storeMembers).values(storeValues(scope, { userId, role: "owner" as const, status: "active" as const, joinedAt }));
}

/** `store.created` (§F.5) in the new store's audit, by its creator. */
export async function auditStoreCreated(storeId: string, userId: string, ip: string | null, meta: Record<string, unknown>): Promise<void> {
  await audit("store.created", { userId, target: storeId, meta, ip, scope: { storeId, actorKind: "user" } });
}

/** A store name: NFKC, control characters dropped, spaces collapsed, 2-120 characters. */
export function cleanStoreName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const length = [...value].length;
  return length >= 2 && length <= 120 ? value : null;
}

/**
 * Why a new store may not take `handle` (§C.7), as the form's message key, or null. T1's `handleProblem` /
 * `checkHandleAvailable` decide (reserved lists, protected brands, history quarantine), and the unique index at
 * insert. Never says why a handle is taken.
 */
export async function newHandleProblem(handle: string): Promise<MessageKey | null> {
  if (!isHandle(handle)) return "auth.signup.handle_format";
  const problem = t1HandleProblem(handle, { allowProtected: false });
  if (problem === "format") return "auth.signup.handle_format";
  if (problem) return "auth.signup.handle_unavailable";
  if ((await checkHandleAvailable(handle)) === "unavailable") return "auth.signup.handle_unavailable";
  return null;
}
