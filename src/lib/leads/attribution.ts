/**
 * Lead attribution (P3 LANDING; landing.md LD12, LAN-§10.4). Pure: the landing order hook
 * (src/lib/orders/hooks/landing.ts) loads the candidates of one new order through its scope and applies the answer
 * with a guarded, scoped UPDATE.
 *
 *  1. a lead with the order's idem (the same form session) → `converted`, via `idem`;
 *  2. a WhatsApp intent whose `WA-` ref the order's note carries → `recovered` after a contact attempt, else
 *     `converted`, via `phone` (the intent has no phone of its own yet);
 *  3. else the newest unconverted lead of the same phone created in the 7 days before the order → `recovered` when it
 *     had a contact attempt, else `converted`, via `phone`.
 * A test order matches only test leads and a normal order only normal ones (D54); a converted lead is never matched
 * again; a lead created after the order never takes credit for it.
 */

export const ATTRIBUTION_DAYS = 7;
const DAY_MS = 86_400_000;
const REF_RE = /\bWA-[0-9A-HJKMNP-TV-Z]{6}\b/;

export interface AttributionOrder {
  idem: string;
  phone: string;
  isTest: boolean;
  createdAt: Date;
  note: string | null;
}

export interface AttributionLead {
  id: string;
  idem: string;
  phone: string | null;
  ref: string | null;
  attempts: number;
  isTest: boolean;
  createdAt: Date;
  convertedOrderId: string | null;
}

export interface Attribution {
  leadId: string;
  status: "converted" | "recovered";
  via: "idem" | "phone";
}

/** The `WA-` ref an order's note carries, or null. */
export function refInNote(note: string | null | undefined): string | null {
  return note ? (REF_RE.exec(note.toUpperCase())?.[0] ?? null) : null;
}

/** Which lead the order credits (LD12), or null. */
export function attributeOrder(order: AttributionOrder, leads: readonly AttributionLead[]): Attribution | null {
  const open = leads.filter((l) => l.convertedOrderId === null && l.isTest === order.isTest);
  const byIdem = open.find((l) => l.idem === order.idem);
  if (byIdem) return { leadId: byIdem.id, status: "converted", via: "idem" };

  const at = order.createdAt.getTime();
  const recent = open
    .filter((l) => l.createdAt.getTime() <= at && at - l.createdAt.getTime() <= ATTRIBUTION_DAYS * DAY_MS)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  const ref = refInNote(order.note);
  const match = (ref ? recent.find((l) => l.ref === ref) : undefined) ?? recent.find((l) => l.phone !== null && l.phone === order.phone);
  if (!match) return null;
  return { leadId: match.id, status: match.attempts > 0 ? "recovered" : "converted", via: "phone" };
}
