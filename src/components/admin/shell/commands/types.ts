/**
 * ⌘K command types (docs/STORE-SAAS.md §I.3, PLA Q.17, LAN Q18). Isomorphic and maintainer-owned (§K.3). Commands are
 * contributed by the track files `./<track>.ts` (each exports `commands: CommandDef[]`: Sync Sheets, Export orders,
 * Publish, Recompute health, Open a test order…) and filtered like the navigation.
 */
import type { Release, StorePermission } from "@/lib/auth/permissions";
import type { ModeFeature } from "@/lib/tenancy/mode";
import type { MessageKey, StoreRow } from "@/lib/tenancy/types";

/** What a command's `run` gets in the browser: the store, the member's grants and the shell's navigation. */
export interface CommandCtx {
  store: Pick<StoreRow, "id" | "handle" | "name" | "mode" | "status">;
  can(p: StorePermission): boolean;
  navigate(href: string): void;
}

export interface CommandDef {
  id: string; // "<track>.<name>"; Store Health fixes name it as their actionId (PD66)
  label: MessageKey;
  group: "jump" | "create" | "run";
  permission?: StorePermission;
  mode?: ModeFeature;
  release?: Release;
  shortcut?: string; // "G O", "N"… (never fires inside editable fields or open overlays)
  run: (ctx: CommandCtx) => void | Promise<void>;
}
