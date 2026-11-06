/**
 * The legacy binding rule (P5 INTEGRATIONS; operations.md OPE-§19.2, OPE-§J `sheets.bind_legacy`; TENANCY-MAP §7.7),
 * the pure part. Before 0005 a store's sheet lived in its `sheets` setting alone; R1 makes one spreadsheet one store's
 * (`sheet_bindings.spreadsheet_id` is the primary key). Every store whose setting names a spreadsheet without a binding
 * gets a `legacy` one, and when two stores name the same spreadsheet one of them keeps it:
 *
 *   - a store that proved its ownership with a code (`method: "code"`) keeps it: a proof is never moved;
 *   - otherwise the earliest `connectedAt` keeps it (ties: the smaller store id, so the answer never depends on the
 *     order the stores were read). A setting with no `connectedAt` predates R1.0's per-store connect (every R1.0 save
 *     writes one), i.e. it is the single-tenant sheet store #1 inherited: it reads as the earliest;
 *   - a later store that already holds a `legacy` binding (the push bound it on the fly) gives it to the earlier one;
 *   - every other store is a loser: its sheet is paused (`enabled: false`) with the status code `binding_conflict`.
 *
 * Framework-free (the conversions check runs it offline); src/lib/sheets/bind-legacy.ts does the I/O.
 */

/** One store whose `sheets` setting names `spreadsheetId`, as the legacy pass read it through the store's own scope. */
export interface LegacyMember {
  storeId: string;
  spreadsheetId: string;
  /** epoch ms of `sheets.connectedAt`; null = none recorded (the pre-R1.0 sheet) */
  connectedAt: number | null;
  /** the store's own binding of this spreadsheet, if any */
  holds: "code" | "legacy" | null;
}

/** What to do for one spreadsheet. */
export interface LegacyPlan {
  spreadsheetId: string;
  /** the store that keeps or gets the spreadsheet */
  winner: string;
  /** the winner has no binding yet: claim one (`legacy`); the claim can still fail (a store outside the group holds it) */
  claim: boolean;
  /** a later store's `legacy` binding to release before the claim */
  release: string | null;
  /** the stores whose sheet is paused with `binding_conflict` (never the winner) */
  losers: string[];
}

const NEVER = Number.NEGATIVE_INFINITY;
const earliest = (a: LegacyMember, b: LegacyMember) => (a.connectedAt ?? NEVER) - (b.connectedAt ?? NEVER) || (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0);

/**
 * The plan for every spreadsheet named by more than one store, or by one store without a binding. Spreadsheets whose
 * only member already holds it need nothing and are left out. Deterministic: the same members give the same plans.
 */
export function legacyPlans(members: readonly LegacyMember[]): LegacyPlan[] {
  const groups = new Map<string, LegacyMember[]>();
  for (const m of members) {
    const g = groups.get(m.spreadsheetId) ?? [];
    // one entry per store (a store read twice keeps its last reading)
    const i = g.findIndex((x) => x.storeId === m.storeId);
    if (i >= 0) g[i] = m;
    else g.push(m);
    groups.set(m.spreadsheetId, g);
  }
  const out: LegacyPlan[] = [];
  for (const [spreadsheetId, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const sorted = [...group].sort(earliest);
    const proved = sorted.find((m) => m.holds === "code");
    const winner = proved ?? sorted[0]!;
    const holder = sorted.find((m) => m.holds !== null) ?? null;
    if (group.length === 1 && winner.holds !== null) continue;
    out.push({
      spreadsheetId,
      winner: winner.storeId,
      claim: winner.holds === null,
      release: holder && holder.storeId !== winner.storeId ? holder.storeId : null,
      losers: sorted.filter((m) => m.storeId !== winner.storeId).map((m) => m.storeId),
    });
  }
  return out;
}
