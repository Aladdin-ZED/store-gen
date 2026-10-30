/**
 * Prompt assembly (P7 AI; ai.md AI-§B.5, AI-§E.3 controls 1 and 5, AI-§E.5, AI-§G.3; AI-02 (4), AI-06 (1), AI-08 (1)).
 * Isomorphic and pure; the server part that reads the store's settings is ./assemble.server.ts.
 *
 * One request, in render order (`tools → system → messages`, a cache is a byte-exact prefix):
 *   system[0]  block 2, the platform text of the version: no store data at all; `cache_control` ttl 1h
 *   system[1]  block 3, the store layer (policies, voice, ≤ 30 memory items): `cache_control` 5 min; absent for the
 *              families that need no store context (analyze, screen, judge)
 *   system[2]  the per-run canary line of the Director families: after the last breakpoint, never cached
 *   messages   one user turn, block 4: images first (labelled), the data blocks (escaped, sorted-key JSON), the
 *              request's instruction and the style rotation line (2 of 6 exemplars per locale, AI-§G.3)
 *
 * `assemble()` receives the scope and refuses any memory or exemplar row whose `storeId` is not the scope's
 * (`AiAssemblyError` "cross_store_context", area ai): another store's text cannot reach a prompt even through a
 * repository bug. Rows the injection screen marked suspicious are left out of block 3 (./store-block.ts).
 * `buildRequest()` is the order the router follows: the PII gate over the task's untrusted paths first, then the
 * assembly; a field that is mostly contact data blocks the call (`pii_blocked`).
 */
import type { BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { StoreScope } from "@/lib/tenancy/types";
import type { AiFlag, AiTaskInput } from "../provider/types";
import { canaryLine, isCanary, mintCanary } from "../safety/canary";
import { gateInput } from "../safety/pii";
import type { AiTaskId } from "../tasks";
import { sha256Hex } from "./sha256";
import type { StoreBlockCtx } from "./store-block";
import { styleRotation } from "./style-guide";
import type { LooseFormat, PromptVersion } from "./types";

export type AssemblyErrorCode = "cross_store_context" | "not_server" | "bad_canary";

/** A refusal of the assembly; the server records it (`recordError("ai", …)`) and the run fails without a call. */
export class AiAssemblyError extends Error {
  readonly area = "ai" as const;
  constructor(
    readonly code: AssemblyErrorCode,
    /** what was refused, never page text: "memory:<id>", "exemplar:<id>", "ctx" */
    readonly at: string,
  ) {
    super(`ai assembly: ${code} (${at})`);
    this.name = "AiAssemblyError";
  }
}

export interface AssembleOpts {
  /** the run's canary token (16 hex); minted when absent, for the families that carry one */
  canary?: string | null;
  /** the style rotation pair; by default `styleRotation(scope.storeId, pageId, seed)` for the copy families */
  rotation?: readonly [number, number] | null;
  pageId?: string | null;
  seed?: string | number;
  /** `platform_ai.cacheTtl.platform` (AI-§B.5): "5m" when traffic is high */
  platformTtl?: "1h" | "5m";
}

export interface AssembledPrompt {
  promptVersion: string;
  rubricVersion: "v3" | null;
  /** first 12 hex of sha256(block 3); null without a store block */
  voiceVersion: string | null;
  system: BetaTextBlockParam[];
  messages: BetaMessageParam[];
  format?: LooseFormat;
  canary: string | null;
  rotation: readonly [number, number] | null;
}

const ROTATED = new Set(["copy.page", "copy.hero"]);

/** Refuses a row of another store (AI-§E.5): the scope is the only "which store". */
function assertOwnRows(scope: StoreScope, ctx: StoreBlockCtx): void {
  if (ctx.storeId !== scope.storeId) throw new AiAssemblyError("cross_store_context", "ctx");
  for (const m of ctx.memory) if (m.storeId !== scope.storeId) throw new AiAssemblyError("cross_store_context", `memory:${m.id}`);
  for (const e of ctx.exemplars) if (e.storeId !== scope.storeId) throw new AiAssemblyError("cross_store_context", `exemplar:${e.id}`);
}

/** The request of one server run of `p` for the scope's store. Throws `AiAssemblyError`. */
export function assemble<T extends AiTaskId>(scope: StoreScope, p: PromptVersion<T>, input: AiTaskInput<T>, ctx: StoreBlockCtx, opts: AssembleOpts = {}): AssembledPrompt {
  if (p.provider !== "server") throw new AiAssemblyError("not_server", p.version);
  assertOwnRows(scope, ctx);
  const system: BetaTextBlockParam[] = [{ type: "text", text: p.platformBlock(null), cache_control: { type: "ephemeral", ttl: opts.platformTtl ?? "1h" } }];
  const store = p.storeBlock(ctx);
  if (store) system.push({ type: "text", text: store, cache_control: { type: "ephemeral" } });
  let canary: string | null = null;
  if (p.canary) {
    canary = opts.canary ?? mintCanary();
    if (!isCanary(canary)) throw new AiAssemblyError("bad_canary", p.version);
    system.push({ type: "text", text: canaryLine(canary) });
  }
  const rotation = opts.rotation !== undefined ? opts.rotation : ROTATED.has(p.family) ? styleRotation(scope.storeId, opts.pageId ?? null, opts.seed ?? 0) : null;
  const content = p.userBlock(input, { rotation });
  return {
    promptVersion: p.version,
    rubricVersion: p.rubricVersion,
    voiceVersion: store ? sha256Hex(store).slice(0, 12) : null,
    system,
    messages: [{ role: "user", content }],
    ...(p.format ? { format: p.format } : {}),
    canary,
    rotation,
  };
}

/** The router's order (AI-§A.4 step 2, then the assembly): PII gate, then `assemble`. */
export function buildRequest<T extends AiTaskId>(
  scope: StoreScope,
  p: PromptVersion<T>,
  input: AiTaskInput<T>,
  ctx: StoreBlockCtx,
  opts: AssembleOpts = {},
): { blocked: true } | { blocked: false; prompt: AssembledPrompt; flags: AiFlag[] } {
  const gated = gateInput(p.task, input);
  if ("blocked" in gated) return { blocked: true };
  return { blocked: false, prompt: assemble(scope, p, gated.input as AiTaskInput<T>, ctx, opts), flags: gated.flags };
}

/** The index of the system block after which nothing is cached (the last block with `cache_control`). */
export function lastBreakpoint(system: readonly BetaTextBlockParam[]): number {
  let at = -1;
  system.forEach((b, i) => {
    if (b.cache_control) at = i;
  });
  return at;
}
