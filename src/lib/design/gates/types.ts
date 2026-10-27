/**
 * Design gate shapes (P6 DESIGN; design.md DES-§8.1, DES-§8.5; docs/STORE-SAAS.md §K.2 P0 design stubs, §M.1, §M.4).
 * Pure types: the gate report the render digest (`renderDigest`, P0 stub) and the Director cards read. Typed at P0 so
 * P7 builds its Director pass against them before P6 merges; P6 adds `GateInput` / `GateInputCtx` (`gateInputFor`,
 * DES-§8.13), `runGates`, `repairDoc`, `summarize` and `toGateItem` here without re-typing these exports (CCR).
 */
import type { GateId } from "@/lib/db/schema";
import type { MessageKey } from "@/lib/tenancy/types";
import type { HeightReport } from "../types.frozen";
import type { CopyReport } from "../cliche";
import type { RepairOp } from "./repair";

/**
 * Internal ids (V visual/structural, S slop, C copy, N novelty, T type, K colour, I imagery, R rhythm, RTL, D copy
 * honesty mirrors) and the origin classes of the core's one origin map (`originFrom(prev, doc)`, core §M.1 rule 2):
 * declared with the `design_genomes.report` shape in src/lib/db/schema.ts (0005), re-exported here.
 */
export type { GateId, OriginClass } from "@/lib/db/schema";

export type Register = "marketing" | "commerce" | "transactional";

/** the slop-score items (DES-§8.3) */
export type SlopId = `S${string}`;
/** the design-baseline §5 target an item enforces (DES-§8.10), e.g. "C5"; P6 narrows it to the target list */
export type BaselineTargetId = string;

export interface DesignGateItem {
  id: GateId;
  target?: BaselineTargetId;
  level: "hard" | "soft" | "info";
  section?: string;
  field?: string;
  /** soft: points off Q; hard: 15 */
  penalty: number;
  msg: MessageKey;
  vars?: Record<string, string | number>;
  /** the one-click fix the panel offers (DES-§15.2) */
  fix?: RepairOp[];
}

export type CompositionKey = "fullBleedMoment" | "boundaryCross" | "quietScreen" | "heroTypeRatio" | "asymmetricGrid" | "distinctCrops" | "heroSignature";

export interface GateReport {
  v: 3;
  q: number;
  hard: DesignGateItem[];
  soft: DesignGateItem[];
  info: DesignGateItem[];
  slop: { score: number; items: DesignGateItem[] };
  copy: CopyReport;
  heights: HeightReport;
  ms: number;
  /** rev 3 (UX-16): 0-15, DES-§8.5 */
  composition: { score: number; items: { key: CompositionKey; points: number }[] };
}
