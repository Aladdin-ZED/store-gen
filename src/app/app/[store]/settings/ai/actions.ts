"use server";
/**
 * Settings → AI server actions (P7 AI; ai.md AI-§K.1, AI-06; docs/STORE-SAAS.md §E, D71). Each body is
 * `return storeAction(ai.manage, …)` around the scoped write of src/lib/ai/settings/write.server.ts, which checks the
 * key again, honours the input's idempotency key and audits. The probe is the one staff action: membership of the
 * store through the seam (`settings.read`), then the platform role inside `startProbe`; sellers never see it.
 */
import { revalidatePath } from "next/cache";
import { addMemoryItem, deleteMemoryItem, pinMemoryItem, saveDeepPass, saveDirector, saveLearning, saveLocal, saveMode, saveShare, saveVoice, startProbe } from "@/lib/ai/settings/write.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, StoreCtx } from "@/lib/tenancy/types";

const refresh = (ctx: StoreCtx) => revalidatePath(`/app/${ctx.store.handle}/settings/ai`);

/** The write, then the page's data again (the toggles are optimistic; the server answer settles them). */
const after =
  <C extends StoreCtx, T>(write: (ctx: C, input: unknown) => Promise<T>, input: unknown) =>
  async (ctx: C): Promise<T> => {
    const out = await write(ctx, input);
    refresh(ctx);
    return out;
  };

export async function saveModeAction(input: { key: string; mode: "auto" | "local" | "server" }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(saveMode, input));
}

export async function saveDirectorAction(input: { key: string; director: "auto" | "ask" | "off" | null }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(saveDirector, input));
}

export async function saveDeepPassAction(input: { key: string; deepPass: boolean }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(saveDeepPass, input));
}

export async function saveLocalAction(input: { key: string; localEnabled?: boolean; localTierCeiling?: "lite" | "full"; bgRemoval?: boolean }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(saveLocal, input));
}

export async function toggleLearningAction(input: { key: string; learning: boolean }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(saveLearning, input));
}

export async function toggleShareAction(input: { key: string; sharePatterns: boolean }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(saveShare, input));
}

export async function saveVoiceAction(input: {
  key: string;
  voice: { formality: "vous" | "tu"; darija: "none" | "cta" | "light"; ctaByLocale: Partial<Record<"ar" | "fr" | "en", string>>; wordsUse: string[]; wordsAvoid: string[] };
}): Promise<ActionResult<Awaited<ReturnType<typeof saveVoice>>>> {
  return storeAction("ai.manage", after(saveVoice, input));
}

export async function addMemoryAction(input: { key: string; item: { kind: "voice" | "fact" | "avoid" | "prefer" | "policy"; text: string; locale?: "ar" | "fr" | "en" | null } }): Promise<ActionResult<{ id: string }>> {
  return storeAction("ai.manage", after(addMemoryItem, input));
}

export async function deleteMemoryAction(input: { key: string; id: string }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(deleteMemoryItem, input));
}

export async function pinMemoryAction(input: { key: string; id: string; pinned: boolean }): Promise<ActionResult<null>> {
  return storeAction("ai.manage", after(pinMemoryItem, input));
}

export async function runProbeAction(input: { key: string }): Promise<ActionResult<{ jobId: string }>> {
  return storeAction("settings.read", after(startProbe, input));
}
