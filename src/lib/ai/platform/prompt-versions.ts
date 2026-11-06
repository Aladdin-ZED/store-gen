import "server-only";
/**
 * The `prompt_versions` rows (P7 AI; ai.md AI-§F.1, AI-§M.1, AI R8; docs/STORE-SAAS.md §H.4 boot step 5, D64). A P
 * table: only `src/lib/ai/platform/**` reads or writes it, each statement annotated.
 *
 *   - `syncPromptVersions()`: one row per registered version (`task` = the family, `version` = "family@vN"), its
 *     `template_hash` and `rubric_version` refreshed; a new row of a family's seed version (the first release, AI-§F.1)
 *     is born `active`, any other `draft` (a later version goes live only through the eval gate and the canary). The
 *     status of an existing row is never touched here. Idempotent; the boot calls it inside the boot lock (P7 merge,
 *     CCR P7-6) and `ensurePromptVersions()` runs it lazily once per process before the first read.
 *   - `promptVersionRows()`: the rows, for the console's Prompts & evals tab and the canary rules.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { promptVersions } from "@/lib/db/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import { PROMPTS, SEED_VERSIONS, R1_FAMILIES, templateHash, type R1Family } from "../prompts/registry";

export type PromptVersionRow = typeof promptVersions.$inferSelect;

const isSeed = (family: string, version: string): boolean =>
  (R1_FAMILIES as readonly string[]).includes(family) && (SEED_VERSIONS[family as R1Family].server === version || SEED_VERSIONS[family as R1Family].local === version);

/** Upserts every registered version; returns how many rows the registry holds. */
export async function syncPromptVersions(now = new Date()): Promise<{ versions: number }> {
  const all = Object.values(PROMPTS);
  for (const p of all) {
    const hash = templateHash(p);
    const seed = isSeed(p.family, p.version);
    // tenancy: platform prompt_versions is a P table (D64): the registry's own rows, no store data
    await db
      .insert(promptVersions)
      .values({
        task: p.family,
        version: p.version,
        provider: p.provider,
        templateHash: hash,
        rubricVersion: p.rubricVersion,
        status: seed ? "active" : "draft",
        activatedAt: seed ? now : null,
        notes: p.goal.slice(0, 300),
        createdAt: now,
      })
      .onDuplicateKeyUpdate({ set: { templateHash: hash, rubricVersion: p.rubricVersion, provider: p.provider } });
  }
  return { versions: all.length };
}

/** Process-wide "synced" marker (platform data under the store id "p", §E.6); re-runs after 6 h, harmlessly. */
const synced = scopedCache<number>({ name: "ai-prompt-sync", maxEntries: 1, ttlMs: 6 * 3_600_000 });

/** Runs `syncPromptVersions()` once per process lifetime window before the first read (AI R8 "also lazily"). */
export async function ensurePromptVersions(): Promise<void> {
  await synced.getOrLoad("p", "sync", async () => (await syncPromptVersions()).versions);
}

/** Every row, by family then version. */
export async function promptVersionRows(): Promise<PromptVersionRow[]> {
  await ensurePromptVersions();
  // tenancy: platform prompt_versions is a P table (D64): read by the console and the canary rules
  return db.select().from(promptVersions).orderBy(asc(promptVersions.task), asc(promptVersions.version));
}

/** The server canaries per family (status `canary`, `canary_bp` > 0), cached 30 s per process (AI-§F.8). */
const canaries = scopedCache<Record<string, { version: string; bp: number }>>({ name: "ai-prompt-canary", maxEntries: 1, ttlMs: 30_000 });

/** The family's server canary and its slice, or null (the router picks it by `inCanary`). Never throws. */
export async function canaryVersionFor(family: string): Promise<{ version: string; bp: number } | null> {
  try {
    const map = await canaries.getOrLoad("p", "canary", async () => {
      await ensurePromptVersions();
      // tenancy: platform prompt_versions is a P table (D64): the canary rows, no store data
      const rows = await db
        .select({ task: promptVersions.task, version: promptVersions.version, bp: promptVersions.canaryBp })
        .from(promptVersions)
        .where(and(eq(promptVersions.status, "canary"), eq(promptVersions.provider, "server")));
      const out: Record<string, { version: string; bp: number }> = {};
      for (const r of rows) if (r.bp > 0 && PROMPTS[r.version]) out[r.task] = { version: r.version, bp: r.bp };
      return out;
    });
    return map[family] ?? null;
  } catch (err) {
    console.error(`[ai] canary versions unavailable: ${err instanceof Error ? err.name : "error"}`);
    return null;
  }
}

/** Drops the cached canary rows (a console activation, tests). */
export function invalidateCanaries(): void {
  canaries.clear();
}
