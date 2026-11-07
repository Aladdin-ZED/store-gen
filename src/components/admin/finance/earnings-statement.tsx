"use client";
/**
 * An agent's earnings statement (operations.md OPE-§15.5; R2, S3 MONEY). The contract step (C2-C) froze its props: the
 * maintainer mounts `<EarningsStatement data={await earningsStatement(ctx.scope, ctx.user.id)} />` on P4's `/queue/me`
 * when the `commissions` entitlement is on (src/lib/finance/statement.server.ts). null data renders nothing. Stub until
 * S3 merges: renders nothing (`null`). No R1 screen mounts it.
 */
import type { ReactElement } from "react";
import type { EarningsStatementData } from "@/lib/finance/statement.server";

/** S3 (stub: renders nothing). */
export function EarningsStatement(props: { data: EarningsStatementData | null }): ReactElement | null {
  void props;
  return null;
}
