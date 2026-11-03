"use server";
/**
 * Flag and kill-switch actions of the console (P1 CONSOLE; platform.md PLA-§12, §M.1). A platform action file (lint L9).
 *
 *   await setKillSwitchAction({ key: "signups_enabled", value: false, reason, typed: "stop sign-ups", opId });   // kill.manage ↑
 *   await saveFlagAction({ key, default: true, rules: [], opId });                                              // flags.manage
 *
 * `setKillSwitchAction` is only ever called from the kill-switch card's confirmed sheet: never from a chord, ⌘K or a
 * bulk path (PLA-§12.1). The typed words (`read-only`, `stop sign-ups`) and the operation id are checked in
 * src/lib/platform/flags.ts, which de-duplicates on the sheet's `opId` itself.
 */
import type { OverrideScope } from "@/lib/platform/flag-eval";
import { clearFlagOverride, saveFlag, setFlagOverride, setKillSwitch } from "@/lib/platform/flags";
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/** `kill.manage` ↑ (super_admin): a kill switch on or off, with a reason (≤ 200) and the typed word where marked. */
export async function setKillSwitchAction(input: { key: string; value: boolean; reason: string; typed?: string; opId: string }): Promise<ActionResult<{ changed: boolean; from: boolean; to: boolean }>> {
  return platformAction("kill.manage", async (ctx) => done(await setKillSwitch(ctx, input)), { stepUp: true });
}

/** `flags.manage`: a release or ops flag's default and rules. */
export async function saveFlagAction(input: { key: string; default: unknown; rules: unknown; opId: string }): Promise<ActionResult<{ saved: boolean }>> {
  return platformAction("flags.manage", async (ctx) => done(await saveFlag(ctx, input)));
}

/** `flags.manage`: an override for one store, user, plan or market (note ≤ 200; Undo for 10 s clears it). */
export async function setFlagOverrideAction(input: { key: string; scope: OverrideScope; scopeId: string; value: unknown; note?: string | null; expiresAt?: string | null; opId?: string }): Promise<ActionResult<{ saved: true }>> {
  return platformAction("flags.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await setFlagOverride(ctx, input))));
}

/** `flags.manage`: removes an override. */
export async function clearFlagOverrideAction(input: { key: string; scope: OverrideScope; scopeId: string }): Promise<ActionResult<{ cleared: boolean }>> {
  return platformAction("flags.manage", async (ctx) => done(await clearFlagOverride(ctx, input)));
}
