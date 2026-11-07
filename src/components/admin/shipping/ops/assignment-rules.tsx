"use client";
/**
 * The assignment rules editor (operations.md OPE-§5.6, OP-18; R2, S4 LOGISTICS owns `src/components/admin/shipping/**`).
 * The R2 contract step (C2-E) froze its props and mounted it once in P4's "Retries and assignment" tab
 * (src/components/admin/callcenter/callcenter-view.tsx), where the assignment mode is set, from the call-centre view's
 * R2 block (absent while `releaseOn("R2")` is false). S4's body lists ≤ 20 rules (first match wins), edits them with
 * the store's agents and live pages, and saves `ops.assignmentRules` through its own audited action. Stub until S4
 * merges: renders nothing (`null`).
 */
import type { ReactElement } from "react";
import type { AssignmentRule } from "@/lib/settings/keys/ops";

export interface AssignmentRulesEditorProps {
  rules: AssignmentRule[];
  /** active members who take calls (display names only) */
  agents: { id: string; name: string }[];
  /** the store's published pages */
  pages: { id: string; name: string }[];
  canEdit: boolean;
}

/** S4 (stub: renders nothing). */
export function AssignmentRulesEditor(props: AssignmentRulesEditorProps): ReactElement | null {
  void props;
  return null;
}
