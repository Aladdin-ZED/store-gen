/**
 * The pulse body, composed (P2 SHELL; docs/STORE-SAAS.md §I.4, D57; platform.md PLA-§22.6, SF-06). Pure apart from the
 * contributors it awaits: no database, no request. The route (`./route.ts`, step p2-04) loads the two halves, runs the
 * contributors and answers `304` when `If-None-Match` names the body's ETag.
 *
 *   const { counts, failures } = await runContributors(PULSE_CONTRIBUTORS, scope, viewer);   // 50 ms each, in parallel
 *   const body = composePulse(storePart, userPart, counts, now);                              // the frozen StorePulse
 *   const etag = pulseEtag(body);                                                             // `at` is not hashed
 *   const since = clampSince(url.searchParams.get("since"), now);                             // for aiJobsForPulse
 *
 * The two halves (PLA-§22.6): the store part (`build`, `store`, `kill`, `health`) may be cached 5 s per store in the
 * `pulse` scopedCache; the user part (`unread`, `impersonation`, `reaccept`, `jobs`) and the contributors' counts are
 * computed for every request and never cached, so one viewer's numbers never reach another (`buildPulse` keeps the
 * split by construction: only `loadStorePart` goes through the cache).
 */
import { createHash } from "node:crypto";
import type { PulseContributor, StorePulse } from "@/lib/pulse/types";
import type { StoreScope } from "@/lib/tenancy/types";

/** The contributor budget of core §I.4 (each contributor, in parallel). */
export const CONTRIBUTOR_BUDGET_MS = 50;
/** `since` window of core §I.4: at most 10 minutes back; the default when absent or invalid is 30 s back. */
export const SINCE_MAX_BACK_MS = 10 * 60_000;
export const SINCE_DEFAULT_BACK_MS = 30_000;

export type PulseViewer = Parameters<PulseContributor["contribute"]>[1];
/** The cacheable half: one per store, the same for every viewer. */
export type PulseStorePart = Pick<StorePulse, "build" | "store" | "kill" | "health">;
/** The per-viewer half: computed for each request, never cached across users. */
export type PulseUserPart = Pick<StorePulse, "unread" | "impersonation" | "reaccept" | "jobs">;

export interface ContributorFailure {
  id: string;
  reason: "timeout" | "error";
  /** the thrown message (never sent to the browser: the route records it in error_events) */
  detail?: string;
}

export interface ContributorRun {
  counts: Record<string, number>;
  failures: ContributorFailure[];
}

/** A counter is a non-negative safe integer; anything else is dropped, never coerced to 0 (owner rule 4). */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Runs every contributor in parallel, each within `budgetMs`. A contributor that is late or throws has all its keys
 * omitted and its failure recorded; the others are unaffected. Keys merge in list order (the registry's track order);
 * a key a later contributor repeats keeps the first value. A late answer is ignored when it arrives.
 */
export async function runContributors(
  list: readonly PulseContributor[],
  scope: StoreScope,
  viewer: PulseViewer,
  budgetMs = CONTRIBUTOR_BUDGET_MS,
): Promise<ContributorRun> {
  const settled = await Promise.all(
    list.map(async (c): Promise<{ id: string; counts: Record<string, number> } | ContributorFailure> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), budgetMs);
      });
      try {
        // a contributor that throws synchronously is still one failure, not the route's
        const work = Promise.resolve().then(() => c.contribute(scope, viewer));
        work.catch(() => undefined); // a rejection after the timeout is not an unhandled rejection
        const answer = await Promise.race([work, late]);
        if (answer === "timeout") return { id: c.id, reason: "timeout" };
        if (answer === null || typeof answer !== "object") return { id: c.id, reason: "error", detail: "not a record" };
        return { id: c.id, counts: answer };
      } catch (err) {
        return { id: c.id, reason: "error", detail: err instanceof Error ? err.message : String(err) };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  const counts: Record<string, number> = {};
  const failures: ContributorFailure[] = [];
  for (const s of settled) {
    if ("reason" in s) {
      failures.push(s);
      continue;
    }
    for (const [key, value] of Object.entries(s.counts)) {
      if (isCount(value) && !Object.hasOwn(counts, key)) counts[key] = value;
    }
  }
  return { counts, failures };
}

/** The frozen `StorePulse` of the two halves and the counts (fresh objects: the cached store part is never mutated). */
export function composePulse(storePart: PulseStorePart, userPart: PulseUserPart, counts: Record<string, number>, now: Date = new Date()): StorePulse {
  return {
    v: 1,
    at: now.toISOString(),
    build: storePart.build,
    unread: userPart.unread,
    store: { status: storePart.store.status, statusReason: storePart.store.statusReason, review: storePart.store.review },
    kill: [...storePart.kill].sort(),
    impersonation: userPart.impersonation ? { endsAt: userPart.impersonation.endsAt } : null,
    reaccept: userPart.reaccept,
    health: storePart.health ? { score: storePart.health.score, attention: storePart.health.attention, computedAt: storePart.health.computedAt } : null,
    jobs: { running: userPart.jobs.running, done: [...userPart.jobs.done] },
    counts: { ...counts },
  };
}

/** JSON with object keys sorted at every depth (arrays keep their order): equal payloads give equal strings. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * The strong ETag of a pulse body: sha256 (base64url) of its canonical JSON **without `at`**. `at` changes on every
 * compose, so hashing it would make every answer new and no poll would ever get a `304` (decision recorded in the
 * step report); every other field, the counts included, changes the tag.
 */
export function pulseEtag(body: StorePulse): string {
  const { at: _at, ...rest } = body;
  void _at;
  return `"${createHash("sha256").update(canonicalJson(rest), "utf8").digest("base64url")}"`;
}

/** Does an `If-None-Match` header name `etag`? Handles lists, `*` and the weak `W/` prefix (RFC 9110 §13.1.2, weak comparison). */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, "");
  const want = bare(etag);
  return ifNoneMatch.split(",").some((t) => {
    const tag = t.trim();
    return tag === "*" || bare(tag) === want;
  });
}

/** `?since=` clamped to [now − 10 min, now]; absent or not an ISO date gives now − 30 s (core §I.4). */
export function clampSince(raw: string | null | undefined, now: Date): Date {
  const nowMs = now.getTime();
  const fallback = new Date(nowMs - SINCE_DEFAULT_BACK_MS);
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 40) return fallback;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return fallback;
  return new Date(Math.min(nowMs, Math.max(nowMs - SINCE_MAX_BACK_MS, ms)));
}

/** The store part's cache: the `pulse` scopedCache's `getOrLoad` in the route, a Map in the selftest. */
export interface PulseStoreCache {
  getOrLoad(storeId: string, key: string, load: () => Promise<PulseStorePart>): Promise<PulseStorePart>;
}

/**
 * One pulse answer: the cached store part, the fresh user part and the fresh counts, composed. Only `loadStorePart`
 * goes through `cache`; `loadUserPart` and the contributors run for each call, for the viewer of that call.
 */
export async function buildPulse(deps: {
  scope: StoreScope;
  viewer: PulseViewer;
  cache: PulseStoreCache;
  loadStorePart: () => Promise<PulseStorePart>;
  loadUserPart: () => Promise<PulseUserPart>;
  contributors: readonly PulseContributor[];
  now?: Date;
  budgetMs?: number;
}): Promise<{ body: StorePulse; etag: string; failures: ContributorFailure[] }> {
  const [storePart, userPart, run] = await Promise.all([
    deps.cache.getOrLoad(deps.scope.storeId, "store", deps.loadStorePart),
    deps.loadUserPart(),
    runContributors(deps.contributors, deps.scope, deps.viewer, deps.budgetMs),
  ]);
  const body = composePulse(storePart, userPart, run.counts, deps.now);
  return { body, etag: pulseEtag(body), failures: run.failures };
}
