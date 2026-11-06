/**
 * The inbox CSV (P3 LANDING; landing.md LAN-§10.3 "Bulk: export CSV"): the inbox rows as the read repository gives
 * them (phones masked, names and notes masked under "View as store"), UTF-8 with a BOM for Excel, RFC 4180 fields,
 * formula-injection safe (a leading = + - @ tab or CR gets a ' prefix). Money in the store currency's major units
 * from integer cents; times in ISO 8601 UTC. Isomorphic and pure.
 */
import type { LeadRow } from "./types";

export const LEAD_CSV_HEADER = [
  "id",
  "created_at",
  "status",
  "kind",
  "ref",
  "phone",
  "name",
  "city",
  "page",
  "selection",
  "total",
  "currency",
  "attempts",
  "assignee_id",
  "contacted_at",
  "next_follow_up",
  "lost_reason",
  "order_id",
  "test",
] as const;

export function csvField(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadCsv(rows: readonly LeadRow[]): string {
  const lines = [LEAD_CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt,
        r.status,
        r.kind,
        r.ref,
        r.phone,
        r.name,
        r.city,
        r.pageName,
        r.selection,
        r.totalCents === null ? "" : (r.totalCents / 100).toFixed(2),
        r.currency,
        r.attempts,
        r.assigneeId,
        r.contactedAt,
        r.nextAt,
        r.lostReason,
        r.convertedOrderId,
        r.isTest ? "yes" : "",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
