import "server-only";
/**
 * The `ai_memory` repository, explicit part (P7 AI; ai.md AI-§G.2, AI-06, AI-08 (3), AI-§E.5; docs/STORE-SAAS.md
 * §E.3, D71). Every function takes the scope first; writes take a `WriteScope`.
 *
 *   - `listMemory`: the store's items for Settings → AI → Voice (tombstones excluded);
 *   - `activeMemory`: the active rows as the prompt assembly reads them (`PromptMemoryRow`, the `deps.memory` of
 *     `storeBlockCtxFor`); a row the injection screen marked stays in the list but `promptMemory()` drops it until a
 *     staff member clears it, and `assemble()` refuses any row of another store (`cross_store_context`);
 *   - `addMemory`: one explicit item (≤ 300 characters, ≤ 30 active per store, `MemoryError("memory_full")` past it);
 *   - `deleteMemory`: a tombstone (`active = false`, `evidence.deleted = true`), so R3's learner never re-learns it;
 *   - `setMemoryPinned`, `markMemoryScreen`, `clearMemoryScreen`.
 * Owner text only: no customer field ever reaches these rows (SF-05).
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { aiMemory } from "@/lib/db/schema";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { PromptMemoryRow } from "../prompts/store-block";

export const MEMORY_MAX_ACTIVE = 30;
export const MEMORY_MAX_CHARS = 300;

export const MEMORY_KINDS = ["voice", "fact", "avoid", "prefer", "policy"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MemoryInput = z.strictObject({
  kind: z.enum(MEMORY_KINDS),
  text: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2).max(MEMORY_MAX_CHARS)),
  /** null = every locale */
  locale: z.enum(["ar", "fr", "en"]).nullable().default(null),
});
export type MemoryInput = z.input<typeof MemoryInput>;

export class MemoryError extends Error {
  constructor(readonly code: "memory_full" | "not_found") {
    super(`ai memory: ${code}`);
    this.name = "MemoryError";
  }
}

type Evidence = NonNullable<(typeof aiMemory.$inferSelect)["evidence"]>;

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  text: string;
  locale: string | null;
  source: "explicit" | "learned";
  active: boolean;
  pinned: boolean;
  /** the injection screen marked it and no staff member cleared it yet: kept out of every prompt */
  screened: boolean;
  createdAt: string;
  updatedAt: string;
}

const isScreened = (e: Evidence | null): boolean => e?.screen?.suspicious === true && !e.screen.clearedAt;

/** The store's items, newest first, tombstones excluded. */
export async function listMemory(scope: StoreScope): Promise<MemoryItem[]> {
  const rows = await db.select().from(aiMemory).where(whereStore(aiMemory, scope)).orderBy(desc(aiMemory.pinned), desc(aiMemory.updatedAt));
  return rows
    .filter((r) => r.evidence?.deleted !== true)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      text: r.text,
      locale: r.locale,
      source: r.source,
      active: r.active,
      pinned: r.pinned,
      screened: isScreened(r.evidence),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
}

/** The active rows the prompt assembly reads (block 3), in the shape `assemble()` checks row by row. */
export async function activeMemory(scope: StoreScope): Promise<PromptMemoryRow[]> {
  const rows = await db.select().from(aiMemory).where(whereStore(aiMemory, scope, eq(aiMemory.active, true)));
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    kind: r.kind,
    text: r.text,
    locale: r.locale,
    source: r.source,
    active: r.active,
    pinned: r.pinned,
    evidence: r.evidence ? { ...(r.evidence.deleted ? { deleted: true as const } : {}), ...(r.evidence.screen ? { screen: r.evidence.screen } : {}) } : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function activeCount(scope: StoreScope): Promise<number> {
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(aiMemory).where(whereStore(aiMemory, scope, eq(aiMemory.active, true)));
  return Number(row?.n ?? 0);
}

/** One explicit item; `memory_full` at 30 active items. Returns the new id. */
export async function addMemory(scope: WriteScope, input: MemoryInput, createdBy: string | null): Promise<string> {
  const v = MemoryInput.parse(input);
  if ((await activeCount(scope)) >= MEMORY_MAX_ACTIVE) throw new MemoryError("memory_full");
  const id = newId();
  await db.insert(aiMemory).values(storeValues(scope, { id, kind: v.kind, text: v.text, locale: v.locale, source: "explicit" as const, active: true, pinned: false, evidence: null, createdBy }));
  return id;
}

async function evidenceOf(scope: StoreScope, id: string): Promise<Evidence | null | undefined> {
  const [row] = await db.select({ evidence: aiMemory.evidence }).from(aiMemory).where(byId(aiMemory, scope, id)).limit(1);
  return row ? row.evidence : undefined;
}

/** A tombstone: out of every prompt and every list; another store's id is `not_found`. */
export async function deleteMemory(scope: WriteScope, id: string): Promise<void> {
  const evidence = await evidenceOf(scope, id);
  if (evidence === undefined) throw new MemoryError("not_found");
  const [res] = await db
    .update(aiMemory)
    .set({ active: false, pinned: false, evidence: { ...(evidence ?? {}), deleted: true } })
    .where(byId(aiMemory, scope, id));
  if ((res as { affectedRows?: number }).affectedRows !== 1) throw new MemoryError("not_found");
}

/** Pinned items sort first and survive the 30-item trim of the prompt (AI-§F.2). */
export async function setMemoryPinned(scope: WriteScope, id: string, pinned: boolean): Promise<void> {
  const [res] = await db
    .update(aiMemory)
    .set({ pinned })
    .where(whereStore(aiMemory, scope, eq(aiMemory.id, id), eq(aiMemory.active, true)));
  if ((res as { affectedRows?: number }).affectedRows !== 1) throw new MemoryError("not_found");
}

/** The `injection.screen` verdict on an item (AI-08 (3)); a suspicious row stays out of every prompt. */
export async function markMemoryScreen(scope: WriteScope, id: string, verdict: { suspicious: boolean; reason: string }, at = new Date()): Promise<void> {
  const evidence = await evidenceOf(scope, id);
  if (evidence === undefined) throw new MemoryError("not_found");
  await db
    .update(aiMemory)
    .set({ evidence: { ...(evidence ?? {}), screen: { suspicious: verdict.suspicious, reason: verdict.reason.slice(0, 200), at: at.toISOString() } } })
    .where(byId(aiMemory, scope, id));
}

/** A staff member clears a screened item (audited by the console action, `platform.ai.screen_cleared`). */
export async function clearMemoryScreen(scope: WriteScope, id: string, clearedBy: string, at = new Date()): Promise<void> {
  const evidence = await evidenceOf(scope, id);
  if (!evidence?.screen) throw new MemoryError("not_found");
  await db
    .update(aiMemory)
    .set({ evidence: { ...evidence, screen: { ...evidence.screen, clearedBy, clearedAt: at.toISOString() } } })
    .where(byId(aiMemory, scope, id));
}
