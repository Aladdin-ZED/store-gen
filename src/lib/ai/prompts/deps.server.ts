import "server-only";
/**
 * The production wiring of the store layer's repositories (P7 AI; ai.md AI-§E.5, AI-§G.2): the scoped `ai_memory`
 * repository feeds `storeBlockCtxFor` / `assembleFor` (./assemble.server.ts); R1 has no exemplar rows. Tests inject
 * their own `StoreBlockDeps` (a planted cross-store row must make `assemble()` throw `cross_store_context`).
 */
import { activeMemory } from "../store/memory";
import type { StoreBlockDeps } from "./assemble.server";

export function assembleDepsFor(extra: Omit<StoreBlockDeps, "memory"> = {}): StoreBlockDeps {
  return { ...extra, memory: activeMemory };
}
