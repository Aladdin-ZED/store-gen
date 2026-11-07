/**
 * The lead inbox types (P3 LANDING; landing.md LAN-§2.1, §10.3, §10.5). Isomorphic: the read repository
 * (src/lib/leads/read.ts), the writes (src/lib/leads/write.ts), the inbox screen and its actions share them.
 *
 * `LeadSelection` is declared once in src/lib/db/schema.ts (the `leads.sel` column type) and re-exported here; readers
 * dispatch on `v` (2: a landing form, 3: a store intent or abandoned checkout, R2).
 */
import { z } from "zod";

export type { LeadLineV3, LeadSelection, LeadSelectionV2, LeadSelectionV3 } from "@/lib/db/schema";

export const LEAD_STATUSES = ["new", "contacted", "recovered", "lost", "converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_KINDS = ["form", "whatsapp"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

/** `leads.lost_reason` (LAN-§2.1) */
export const LOST_REASONS = ["no_answer", "not_interested", "wrong_number", "already_ordered", "price", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];
/** The reason of a form lead linked to the WhatsApp intent of the same person ("Set phone", never picked by hand). */
export const MERGED_REASON = "merged";

/** The inbox views (LAN-§10.3): New · Follow-up due · Contacted · Recovered · Lost · All. */
export const LEAD_VIEWS = ["new", "due", "contacted", "recovered", "lost", "all"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

/** The retention window: the inbox, its header and the purge (core §H.2 slot 8) all count 30 days. */
export const LEAD_WINDOW_DAYS = 30;
/** Percentages and medians below this n are hidden ("needs more leads", core §I.8 rule 3). */
export const LEAD_MIN_N = 20;
/** `leads.sel` ceiling (LAN-§2.1). */
export const LEAD_SEL_MAX_BYTES = 8 * 1024;

const ID26 = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The inbox query (what the screen sends; the viewer's role never rides in it). `cursor` is the opaque `next` of the
 * previous page. Unknown or malformed values fall back to the defaults, never an error.
 */
export const LeadQuery = z.object({
  view: z.enum(LEAD_VIEWS).catch("all").default("all"),
  pageId: z.string().regex(ID26).optional().catch(undefined),
  city: z.string().trim().min(1).max(80).optional().catch(undefined),
  /** a member's id, or "none" for the unassigned leads */
  assignee: z.union([z.string().regex(ID26), z.literal("none")]).optional().catch(undefined),
  kind: z.enum(LEAD_KINDS).optional().catch(undefined),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  cursor: z.string().max(80).optional().catch(undefined),
  limit: z.number().int().min(1).max(100).catch(50).default(50),
});
export type LeadQuery = z.input<typeof LeadQuery>;
export type LeadQueryParsed = z.output<typeof LeadQuery>;

/** Who reads: an agent sees the leads assigned to them plus the unassigned `new` ones (LAN-§10.3). */
export interface LeadViewer {
  userId: string;
  role: string;
}

/** Risk hints of the lead's phone, computed at list time from the store's customers counters and blocklist (never stored). */
export interface LeadRisk {
  orders: number;
  delivered: number;
  refused: number;
  fake: number;
  blocked: boolean;
}

/** One inbox row. Customer fields arrive masked where the scope asks for it (D70); the phone is always masked. */
export interface LeadRow {
  id: string;
  status: LeadStatus;
  kind: LeadKind;
  /** `WA-XXXXXX` of a WhatsApp intent */
  ref: string | null;
  /** "06 •• •• 12 34" (P4's maskPhone); null for an intent without a phone yet */
  phone: string | null;
  name: string | null;
  city: string | null;
  note: string | null;
  pageId: string;
  pageName: string | null;
  /** the page locale: the recovery template's language */
  locale: string | null;
  /** the warehouse text of the selection (no customer data) */
  selection: string | null;
  /** the server total at capture, integer cents (display only; a conversion re-prices) */
  totalCents: number | null;
  currency: string;
  createdAt: string;
  attempts: number;
  assigneeId: string | null;
  contactedAt: string | null;
  nextAt: string | null;
  lostReason: LostReason | typeof MERGED_REASON | null;
  convertedOrderId: string | null;
  convertedVia: "idem" | "phone" | "agent" | null;
  isTest: boolean;
  risk: LeadRisk | null;
}

/** The 30-day header (LAN-§10.3). Test leads are never counted; a rate or a median below n = 20 is null. */
export interface LeadCounts {
  days: number;
  leads: number;
  contacted: number;
  recovered: { n: number; pct: number | null; confirmed: number; delivered: number };
  convertedWithoutContact: number;
  /** minutes from capture to the first attempt; null below n = 20 contacted leads */
  firstContactP50Min: number | null;
  firstContactN: number;
  /** WhatsApp intents (LP-11): how many, how many became an order, the rate (null below n = 20) */
  intents: { n: number; converted: number; pct: number | null };
}

/** What the convert sheet sends (the rest comes from the lead row). */
export const ConvertLeadInput = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  address: z.string().trim().max(240).optional(),
  note: z.string().trim().max(500).optional(),
  /** "The customer already confirmed" */
  confirmed: z.boolean(),
  /** the sheet's draft id, the order's `idem` */
  idem: z.string().uuid(),
});
export type ConvertLeadInput = z.input<typeof ConvertLeadInput>;

/** The conversion's answer: the order, or why not (`message` a message key or the order sheet's text). */
export type ConvertOutcome = { ok: true; orderId: string; already: boolean } | { ok: false; error: string; message?: string };
