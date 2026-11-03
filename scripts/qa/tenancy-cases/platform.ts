/**
 * Two-store attack cases of the platform track (P1 CONSOLE, platform.md PLA-§O.3).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), loaded by scripts/qa/tenancy-check.ts
 * (`test:tenancy`). Case files import only types from the harness; the modules under test load inside `run`.
 *
 * Step 3 (the health engine): the read half of PLA-§O.3 cases 8 and 9 on the snapshot API. Step 4: the tenant-callable
 * review and request functions of src/lib/platform/requests.ts (PLA-§3.7: the caller's own store only, the store from
 * the ctx, never from input). Step 7 adds the actions (`snoozeHealthIssueAction`, `recomputeHealthAction`, the queue
 * and lifecycle actions from B's session on A's path) and the other special cases.
 */
import type { StoreCtx } from "@/lib/tenancy/types";
import type { TenancyCase, TenancyKit } from "../tenancy-check";

/** A member's store context as `storeAction` builds it (the review functions take a ctx, not a session). */
async function memberCtx(k: TenancyKit, key: "A" | "B", role: "owner" | "viewer" = "owner", kind: "member" | "impersonation" = "member"): Promise<StoreCtx> {
  const { can } = await import("@/lib/auth/permissions");
  const userId = k.fx[key].members[role];
  return {
    user: { id: userId, email: `${role}@store-${key.toLowerCase()}.test`, name: role, totpEnabled: false, sessionId: `sess-${userId}`, platformRole: "none", locale: null, lastStoreId: k.fx[key].id },
    store: k.fx.rows[key],
    membership: { role, status: "active", ...(kind === "impersonation" ? { synthetic: "impersonation" } : {}) },
    scope: k.scope(key, kind),
    actor: { kind: kind === "impersonation" ? "impersonation" : "user", userId, impersonatorId: kind === "impersonation" ? k.fx.staff.id : null, ip: null },
    impersonation: kind === "impersonation" ? { id: "01JIMP00000000000000000001", storeId: k.fx[key].id, staffUserId: k.fx.staff.id, mode: "read", reason: "bug", expiresAt: new Date(Date.now() + 600_000) } : null,
    stepUpUntil: null,
    can: (p) => can(role, p),
  } as StoreCtx;
}

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (err: { code?: unknown }) => (typeof err?.code === "string" ? err.code : "threw"),
  );

export const cases: TenancyCase[] = [
  {
    name: "store_health: each store reads its own snapshot; tenants never get the console flags (PLA-§O.3 cases 8-9, read half)",
    async run(k) {
      const { computeStoreHealth } = await import("@/lib/health/run");
      const { getStoreHealth, markHealthDirty } = await import("@/lib/platform/health-snapshot");
      const { systemCtx } = await import("@/lib/jobs/scope");
      const job = systemCtx("platform.health");
      const a = await computeStoreHealth(job, k.fx.rows.A);
      const b = await computeStoreHealth(job, k.fx.rows.B);
      const before = await k.snapshotA();

      const fromB = await getStoreHealth(k.scope("B"));
      k.check("store_health: B's member reads B's own computed row", fromB !== null && fromB.score === b.score, fromB && { score: fromB.score, want: b.score });
      k.check("store_health: … without the console flags", fromB !== null && !("flags" in fromB));
      k.check("store_health: … with nothing of A", k.leaks(fromB).length === 0, k.leaks(fromB));
      const viewing = await getStoreHealth(k.scope("A", "impersonation"));
      k.check("store_health: staff viewing A read what A's members read (no flags)", viewing !== null && viewing.score === a.score && !("flags" in viewing));
      const staff = await getStoreHealth(k.scope("A", "platform"));
      k.check("store_health: the platform scope reads A's flags", staff !== null && Array.isArray(staff.flags));
      k.check("store_health: no customer data or secret inside A's own snapshot (case 8)", k.leaks(staff, { only: ["customer", "secret"] }).length === 0, k.leaks(staff, { only: ["customer", "secret"] }));
      await markHealthDirty(k.fx.B.id);
      await markHealthDirty(k.fx.ghostHandle);
      k.check("store_health: B's dirty mark (and a malformed id) leave A's rows unchanged", (await k.snapshotA()) === before);
    },
  },
  {
    name: "store requests and the review card: a member reaches only their own store's rows (PLA-§3.7, step 4)",
    async run(k) {
      const requests = await import("@/lib/platform/requests");
      const ownerA = await memberCtx(k, "A");
      const ownerB = await memberCtx(k, "B");
      const aRequest = await requests.createStoreRequest(ownerA, { kind: "go_live", message: null });
      const aId = "id" in aRequest ? aRequest.id : "";
      k.check("requests: A's owner files a request in A", aId.length === 26);
      const before = await k.snapshotA();

      k.check("requests: B's owner can't withdraw A's request (not_found)", (await codeOf(requests.withdrawStoreRequest(ownerB, aId))) === "not_found");
      k.check("requests: a ghost id is not_found too", (await codeOf(requests.withdrawStoreRequest(ownerB, "01JZZZZZZZZZZZZZZZZZZZZZZZ"))) === "not_found");
      const bRequest = await requests.createStoreRequest(ownerB, { kind: "go_live", message: null });
      k.check("requests: B's own request of the same kind is B's (one open per kind per store, not per platform)", "id" in bRequest);
      const listed = await requests.listStoreRequests(ownerB.scope);
      k.check("requests: B lists only its own rows", listed.length >= 1 && !listed.some((r) => r.id === aId) && k.leaks(listed).length === 0, k.leaks(listed));
      const card = await requests.getReviewCard(ownerB.scope);
      k.check("review card: B's card carries nothing of A", k.leaks(card).length === 0, k.leaks(card));
      k.check("review card: B's answer finds no question of A (not_found)", (await codeOf(requests.answerReviewQuestion(ownerB, "an answer"))) === "not_found");
      k.check("review card: B can't appeal (B isn't rejected, A's rows untouched)", (await codeOf(requests.submitAppeal(ownerB, "an appeal"))) === "forbidden");
      k.check("review card: B's viewer can't file a request (billing.manage)", (await codeOf(requests.createStoreRequest(await memberCtx(k, "B", "viewer"), { kind: "plan_change", planId: "pro", message: null }))) === "forbidden");
      const viewingA = await memberCtx(k, "A", "owner", "impersonation");
      k.check("requests: a read-only view of A writes nothing (impersonation_read_only)", (await codeOf(requests.createStoreRequest(viewingA, { kind: "plan_change", planId: "pro", message: null }))) === "impersonation_read_only");
      k.check("requests: A's rows are unchanged by every call of B and of the view", (await k.snapshotA()) === before);
    },
  },
  {
    name: "legal re-acceptance: a person records only their own acceptance of a document they are asked for (PLA-§13.4, §22.15, step 5)",
    async run(k) {
      const legal = await import("@/lib/platform/legal");
      const { db } = await import("@/lib/db/client");
      const { legalAcceptances, legalDocuments } = await import("@/lib/db/schema");
      const { newId } = await import("@/lib/db/ids");
      const { and, eq, inArray } = await import("drizzle-orm");
      const ownerA = await memberCtx(k, "A");
      const ownerB = await memberCtx(k, "B");
      // a published AUP asking everyone to accept again, in every locale the fixtures read (retired at the end)
      const docs = (["ar", "fr", "en"] as const).map((locale) => ({ id: newId(), locale }));
      await db.insert(legalDocuments).values(docs.map((d) => ({ id: d.id, kind: "aup" as const, locale: d.locale, version: 9_000, title: "AUP", body: "Rules.", summary: "Changed.", status: "published" as const, needsLegalReview: false, requiresReacceptance: true, effectiveAt: new Date(Date.now() - 60_000), publishedAt: new Date() })));
      const ids = docs.map((d) => d.id);
      try {
        const before = await k.snapshotA();
        const askedB = await legal.pendingReacceptance(ownerB.user.id);
        const askedId = askedB?.docs[0]?.id ?? "";
        k.check("legal: B's owner is asked for the published AUP", ids.includes(askedId), askedB);
        k.check("legal: a document B's owner isn't asked for → conflict", (await codeOf(legal.recordReacceptance(ownerB, [newId()], { ipHash: null, uaLabel: "Chrome" }))) === "conflict");
        k.check("legal: a malformed id → invalid", (await codeOf(legal.recordReacceptance(ownerB, ["../" + askedId], { ipHash: null, uaLabel: "Chrome" }))) === "invalid");
        await legal.recordReacceptance(ownerB, [askedId], { ipHash: "f".repeat(64), uaLabel: "Chrome on Android" });
        const rowsB = await db.select().from(legalAcceptances).where(inArray(legalAcceptances.documentId, ids));
        k.check("legal: one row, B's owner's, outside any store (never A's)", rowsB.length === 1 && rowsB[0]!.userId === ownerB.user.id && rowsB[0]!.storeId === null, rowsB);
        k.check("legal: B's owner isn't asked again; A's owner still is (per person)", (await legal.pendingReacceptance(ownerB.user.id)) === null && ids.includes((await legal.pendingReacceptance(ownerA.user.id))?.docs[0]?.id ?? ""));
        k.check("legal: recording it twice → conflict (no longer asked)", (await codeOf(legal.recordReacceptance(ownerB, [askedId], { ipHash: null, uaLabel: "Chrome" }))) === "conflict");
        k.check("legal: A's rows are unchanged by B's acceptance", (await k.snapshotA()) === before);
      } finally {
        await db.update(legalDocuments).set({ status: "retired" }).where(and(inArray(legalDocuments.id, ids), eq(legalDocuments.status, "published")));
      }
    },
  },
];
