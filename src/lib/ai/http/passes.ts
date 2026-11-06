import "server-only";
/**
 * The Director passes of a wizard session (P7 AI; ai.md AI-§A.7 Director routes, AI-19 acceptance 3; docs/STORE-SAAS.md
 * §H.12). The browser names each pass `{ session, id }`; `director/plan` starts one, and a newer pass of the same
 * session (the owner asked again, or chose an instant direction) supersedes the older: its later stages, and its
 * results that arrive after the newer started, answer `410 { error: "pass_superseded" }`.
 *
 * Per process and per (store, user, session), 30 minutes: a pass this process never saw start (a restart, or a
 * critique sent without its plan) is adopted as the session's current pass, and its first stage charges the Director
 * pass counter (`charged: false` until a stage's run row exists), so a skipped plan never makes a free pass.
 */
import { scopedCache } from "@/lib/tenancy/cache";

interface SessionPasses {
  current: string;
  /** the plan stage of `current` ran here: the pass counter was charged by it */
  charged: boolean;
  /** the passes this session left behind, newest last (≤ 16) */
  old: string[];
}

const SUPERSEDED_KEPT = 16;
const sessions = scopedCache<SessionPasses>({ name: "ai-director-passes", maxEntries: 4_000, ttlMs: 30 * 60_000 });

const keyOf = (userId: string, session: string) => `${userId}:${session}`;

export type PassVerdict = { ok: true; charged: boolean } | { ok: false };

/**
 * A stage of pass `id` starts. A pass the session has not seen becomes its current pass (the previous one superseded);
 * `charged` says whether an earlier stage of this pass already charged the Director pass counter (`markCharged`).
 */
export function beginStage(storeId: string, userId: string, pass: { session: string; id: string }): PassVerdict {
  const key = keyOf(userId, pass.session);
  const s = sessions.get(storeId, key);
  if (s?.old.includes(pass.id)) return { ok: false };
  if (!s || s.current !== pass.id) {
    const old = s ? [...s.old, s.current].slice(-SUPERSEDED_KEPT) : [];
    sessions.set(storeId, key, { current: pass.id, charged: false, old });
    return { ok: true, charged: false };
  }
  return { ok: true, charged: s.charged };
}

/** A stage of the pass reserved its credits and the pass counter (its run row exists): later stages are free of it. */
export function markCharged(storeId: string, userId: string, pass: { session: string; id: string }): void {
  const s = sessions.get(storeId, keyOf(userId, pass.session));
  if (s && s.current === pass.id) s.charged = true;
}

/** True when a newer pass of the session started since `id` began (its result is dropped with 410). */
export function isSuperseded(storeId: string, userId: string, pass: { session: string; id: string }): boolean {
  const s = sessions.get(storeId, keyOf(userId, pass.session));
  return !!s && s.current !== pass.id;
}
