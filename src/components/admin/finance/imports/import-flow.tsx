"use client";
/**
 * The embeddable import flow (operations.md OPE-§18.1: upload → detect → map (the auto-picked saved mapping) → preview
 * with plain-words row errors → commit, resumable through `?run=`; R2, S3 MONEY owns the framework and this component).
 * The contract step (C2-C) froze its props for S4 LOGISTICS, which mounts it on `/shipping/imports` for its `tracking`
 * and `status` kinds (src/lib/shipping/import-kinds.ts) bound to one carrier account. Stub until S3 merges: renders
 * nothing (`null`). No R1 screen mounts it.
 */
import type { ReactElement } from "react";
import type { ImportKind } from "@/lib/imports/registry";

export interface ImportFlowProps {
  handle: string;
  kind: ImportKind;
  /** the carrier account the file belongs to ('' = none) */
  carrierAccountId: string;
  /** resume an existing run (`?run=`) */
  runId?: string | null;
  /** after a commit (or the job's last slice) */
  onCommitted?(runId: string): void;
}

/** S3 (stub: renders nothing). */
export function ImportFlow(props: ImportFlowProps): ReactElement | null {
  void props;
  return null;
}
