/**
 * Hard limits of the landing part (P3 LANDING; landing.md LAN-§23.2, LAN-§2.1, LAN-§7.2). Isomorphic constants: the
 * server enforces them, the editors and the add-on chunks read the same numbers. The quotas the owner can raise
 * (`campaigns_max`, `short_links_max`) are entitlements (core §A.4), never constants here.
 */

/** delivery zones per store (LAN-§2.1) */
export const MAX_ZONES = 40;
/** working days an ETA bound may reach (`0 ≤ etaMin ≤ etaMax ≤ 30`) */
export const MAX_ETA_DAYS = 30;
/** a zone fee or free-from threshold, in cents (0 … 1,000,000.00) */
export const MAX_FEE_CENTS = 100_000_000;
/** `delivery_zones.name` / `.note` column widths */
export const ZONE_NAME_MAX = 80;
export const ZONE_NOTE_MAX = 120;
/** `checkout.calendar.confirmationLeadDays` upper bound (OPS-12) */
export const MAX_LEAD_DAYS = 3;
/** a window ending further away than this many calendar days is told as a day range, never as dates (LAN-§7.2 step 4) */
export const ETA_DATE_HORIZON_DAYS = 21;
/** the confirmation-lead suggestion needs this many confirmed orders in the last LEAD_SAMPLE_DAYS days (LAN-§7.3) */
export const LEAD_MIN_ORDERS = 30;
export const LEAD_SAMPLE_DAYS = 28;

/** saved sections and house blocks per store (LP-24, R3) */
export const MAX_SAVED_BLOCKS = 200;
/** arms per experiment, running experiments per page (R3) */
export const MAX_EXPERIMENT_ARMS = 3;
export const MAX_RUNNING_EXPERIMENTS_PER_PAGE = 1;
/** a message template, in characters */
export const MAX_TEMPLATE_CHARS = 1_000;
/** a compiled Campaign Kit, in bytes */
export const MAX_KIT_BYTES = 64 * 1024;
/** a `wa.me` prefilled text, in characters */
export const MAX_WA_TEXT_CHARS = 1_000;
/** `doc.product.credits` names */
export const MAX_CREDIT_NAMES = 12;
