/**
 * The ⌘K command registry (docs/STORE-SAAS.md §I.3). Maintainer-owned (§K.3): the import lines of the track files
 * `./<track>.ts` are pre-written here (P0 for the R1 tracks, P0b for P6's `design.ts`; an R1.0 track asks through a CCR).
 */
import { permissionDef, releaseOn } from "@/lib/auth/permissions";
import { modeAllows } from "@/lib/tenancy/mode";
import { commands as designCommands } from "./design";
import { commands as integrationsCommands } from "./integrations";
import { commands as landingCommands } from "./landing";
import { commands as opsCommands } from "./ops";
import { commands as shellCommands } from "./shell";
import type { CommandCtx, CommandDef } from "./types";

export type { CommandCtx, CommandDef } from "./types";

/** Every contributed command, in track order (P2 … P6; written at P0 and P0b, `scripts/qa/registries-check.ts` proves none is left out). */
export const COMMANDS: readonly CommandDef[] = [...shellCommands, ...landingCommands, ...opsCommands, ...integrationsCommands, ...designCommands];

/** The commands this member may run in this store (permission, mode, release), in registry order. */
export function commandsFor(ctx: Pick<CommandCtx, "store" | "can">, commands: readonly CommandDef[] = COMMANDS): CommandDef[] {
  return commands.filter((c) => {
    if (c.release && !releaseOn(c.release)) return false;
    if (c.mode && !modeAllows(ctx.store.mode, c.mode)) return false;
    if (!c.permission) return true;
    const def = permissionDef(c.permission);
    return releaseOn(def.release) && (!def.mode || modeAllows(ctx.store.mode, def.mode)) && ctx.can(c.permission);
  });
}
