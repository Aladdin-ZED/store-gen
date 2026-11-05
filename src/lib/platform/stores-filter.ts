/**
 * The stores list's filters (platform.md PLA-§6.1, PD44): the URL's query parameters, the saved chips and the vocab
 * of each filter. Pure and isomorphic, so the console's filter bar builds the same URLs the server parses.
 *
 *   const filter = parseStoresFilter(Object.fromEntries(searchParams));   // anything malformed is dropped
 *   storesQuery({ ...filter, status: ["pending"] })                         // "status=pending&sort=health"
 */
import { z } from "zod";
import type { HealthFlagCode } from "@/lib/health/types";
import type { StoreStatus } from "@/lib/tenancy/types";

export const STORES_PAGE_SIZE = 50;
export const STORES_CSV_MAX = 10_000;

export const STORE_STATUSES = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"] as const satisfies readonly StoreStatus[];
export const STORE_MODES = ["landing", "store", "both"] as const;
export const STORE_BANDS = ["fast", "review", "hold", "reject_candidate"] as const;
export const STORE_SORTS = ["created", "health", "name", "activity"] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

export const STORE_FLAG_CODES = [
  "sheets_backlog",
  "sheets_error",
  "outbox_dead",
  "capi_failing",
  "telegram_failing",
  "quota_high",
  "quota_full",
  "risky_orders",
  "inactive_14d",
  "dormant_60d",
  "setup_incomplete",
  "render_failed",
  "review_waiting",
  "restricted",
  "suspended",
  "brand_term_live",
  "brand_near_live",
  "abuse_reports_new",
] as const satisfies readonly HealthFlagCode[];

const many = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === undefined || v === "" ? undefined : Array.isArray(v) ? v : String(v).split(",")), z.array(z.enum(values)).max(values.length).optional());
const one = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess((v) => (v === "" || v === undefined ? undefined : Array.isArray(v) ? v[0] : v), z.enum(values).optional());
const bool = z.preprocess((v) => v === "1" || v === 1 || v === true || v === "true", z.boolean());

/** The URL's query parameters (PLA-§6.1); anything unknown or malformed is dropped, never an error. */
export const StoresFilterSchema = z.object({
  status: many(STORE_STATUSES),
  mode: one(STORE_MODES),
  plan: z.preprocess((v) => (typeof v === "string" && /^[a-z0-9_-]{1,32}$/.test(v) ? v : undefined), z.string().optional()),
  market: z.preprocess((v) => (typeof v === "string" && /^[A-Z]{2,8}$/.test(v) ? v : undefined), z.string().optional()),
  band: many(STORE_BANDS),
  /** any of these health flag codes (the "Quota ≥ 80 %" and "Sync errors" chips pass several) */
  flag: many(STORE_FLAG_CODES),
  attention: bool.optional(),
  dormant: bool.optional(),
  /** a name prefix, a handle prefix ("@" optional), or an exact owner e-mail */
  q: z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, 120) : undefined), z.string().optional()),
  sort: one(STORE_SORTS),
});
export type StoresFilter = z.infer<typeof StoresFilterSchema>;

export function parseStoresFilter(params: Record<string, unknown>): StoresFilter {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(StoresFilterSchema.shape)) {
    const r = (StoresFilterSchema.shape as Record<string, z.ZodType>)[key]!.safeParse(params[key]);
    if (r.success && r.data !== undefined && r.data !== false) out[key] = r.data;
  }
  return out as StoresFilter;
}

/** The saved chips above the table (PLA-§6.1), as filters. */
export const SAVED_CHIPS = {
  attention: { attention: true },
  in_review: { status: ["pending"] },
  restricted: { status: ["restricted"] },
  suspended: { status: ["suspended"] },
  dormant: { dormant: true },
  quota_80: { flag: ["quota_high", "quota_full"] },
  sync_errors: { flag: ["sheets_error", "sheets_backlog", "outbox_dead", "capi_failing", "telegram_failing"] },
  internal: { plan: "internal" },
} as const satisfies Record<string, StoresFilter>;
export type SavedChip = keyof typeof SAVED_CHIPS;

/** The filter as the URL's query string (arrays comma-joined, defaults left out), for links and the CSV. */
export function storesQuery(f: StoresFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "sort" && v === "created") continue;
    p.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v));
  }
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}

/** The saved chip a filter equals exactly (its chip shows pressed), or null. */
export function chipOf(f: StoresFilter): SavedChip | null {
  const rest = Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== "sort" && k !== "q" && v !== undefined));
  for (const [id, chip] of Object.entries(SAVED_CHIPS) as [SavedChip, StoresFilter][]) {
    if (JSON.stringify(Object.fromEntries(Object.entries(chip).sort())) === JSON.stringify(Object.fromEntries(Object.entries(rest).sort()))) return id;
  }
  return null;
}
