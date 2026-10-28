/**
 * Two-store attack cases of the ai track (P7 AI, ai.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty file as not applicable until the track merges.
 *
 * Reads (step 2):
 *  - `finalizeCtxFor(scope, input)` (src/lib/ai/schema/tasks/ctx.server.ts): the store facts every task's finalize
 *    reads (policies, the voice's banned words, WhatsApp, the calling window) come from the scope's store only. A and
 *    B each get a canary in `store_ai.voice.wordsAvoid` and their own policies; B's context carries B's and none of
 *    A's (nor any harness canary of A), A's context carries A's (the check is not blind), and the read leaves A's rows
 *    as they were. The browser never sends these fields, so the scope is the only way in.
 */
import { randomBytes } from "node:crypto";
import { finalizeCtxFor } from "@/lib/ai/schema/tasks/ctx.server";
import { setStoreSetting } from "@/lib/settings";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { TenancyCase } from "../tenancy-check";

/** the harness hands out member scopes; the settings write takes the WriteScope it is */
const writable = (s: StoreScope): s is WriteScope => s.kind === "member";

export const cases: TenancyCase[] = [
  {
    name: "ai: finalizeCtxFor reads its own store's policies, voice and window only",
    async run(kit) {
      const tag = randomBytes(4).toString("hex");
      const avoid = { A: `ai-avoid-a-${tag}`, B: `ai-avoid-b-${tag}` };
      for (const key of ["A", "B"] as const) {
        const scope = kit.scope(key);
        if (!writable(scope)) throw new Error(`ai: the harness scope of ${key} is not a member scope`);
        const actor = { id: kit.fx[key].members.owner, ip: null };
        await setStoreSetting(scope, "store_ai", { voice: { wordsAvoid: [avoid[key]] } }, actor);
        await setStoreSetting(scope, "policies", { returns: { accepted: key === "A", windowDays: key === "A" ? 23 : null } }, actor);
      }
      const input = { locale: "fr" as const, productName: "Sérum", facts: [] };
      const before = await kit.snapshotA();

      const asB = await finalizeCtxFor(kit.scope("B"), input);
      kit.check("ai/finalizeCtxFor(B): B's banned words", asB.wordsAvoid?.includes(avoid.B) === true, asB.wordsAvoid);
      kit.check("ai/finalizeCtxFor(B): none of A's banned words", !JSON.stringify(asB).includes(avoid.A), asB.wordsAvoid);
      kit.check("ai/finalizeCtxFor(B): B's policies, not A's", asB.policies.returns.accepted === false && asB.policies.returns.windowDays === null, asB.policies.returns);
      kit.check("ai/finalizeCtxFor(B): no canary of A", kit.leaks(asB).length === 0, kit.leaks(asB));
      kit.check("ai/finalizeCtxFor(B): no hours from an unsaved window", asB.callingHours.text === null, asB.callingHours);

      const asA = await finalizeCtxFor(kit.scope("A"), input);
      kit.check("ai/finalizeCtxFor(A): A's own banned words and policies (the check is not blind)", asA.wordsAvoid?.includes(avoid.A) === true && asA.policies.returns.windowDays === 23, { wordsAvoid: asA.wordsAvoid, returns: asA.policies.returns });
      kit.check("ai/finalizeCtxFor: the read leaves A's rows as they were", (await kit.snapshotA()) === before);
    },
  },
];
