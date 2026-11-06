import "server-only";
/**
 * The WhatsApp templates screen's reads (P5 INTEGRATIONS; operations.md OPE-§22.2, §22.3, OD24, OD63; IN-05), every
 * part through the store's scope; a failed block is `null` (an inline retry there), never a blank screen.
 *
 * - `rows`: the store's every-page WhatsApp rows (the edited slots and the quick replies, kind `custom`); the slots
 *   nobody edited show their built-in, which the client reads from ./builtins.ts (no row is ever seeded, OD24);
 * - `preview`: the live preview's facts, on the store's most recent non-test, non-honeypot order: the values of the
 *   template variables in the three template locales through `orderTemplateValues` (stored facts only), the phone
 *   always masked, and under "view as store" the customer fields masked first (`maskIfImpersonation`), so the
 *   preview never carries more than the viewer may read. `templatePreview(scope, orderId)` serves the same for one
 *   order of THIS store (another store's id is `null`, the action's not_found);
 * - `confirmation`: the store's confirmation number (`store.confirmation`, LP-04) as an agent dials it;
 * - `hours`: the calling hours of `callingWindowFor` (staff text, `hoursText`) and `configured` (OD63: "Hours not set
 *   yet" and the link to /team/callcenter while false).
 */
import { and, desc, eq } from "drizzle-orm";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { hoursText } from "@/lib/callcenter/window";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { maskIfImpersonation, maskPhone } from "@/lib/platform/mask";
import { getStoreSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { NOT_HONEYPOT } from "../health";
import type { TemplateValues } from "../template-lang";
import { orderTemplateValues } from "../templates";
import { confirmNumberOf } from "../template-values";
import { TEMPLATE_LOCALES, type TemplateLocale } from "./builtins";
import { listTemplates, type TemplateRowView } from "./templates.server";

export interface TemplatePreview {
  orderId: string;
  /** always masked: the preview is a text, not a way to read a number */
  phone: string;
  values: Record<TemplateLocale, TemplateValues>;
}

export interface WhatsAppScreen {
  rows: TemplateRowView[] | null;
  preview: TemplatePreview | null | "error";
  confirmation: { number: string } | null;
  hours: { configured: boolean; text: string | null } | null;
}

const DATE_LOCALE: Record<TemplateLocale, string> = { ar: "ar-MA", fr: "fr-MA", en: "en-GB" };

function logged<T>(area: string, fallback: T) {
  return (err: unknown): T => {
    console.error(`[whatsapp:screen:${area}]`, err instanceof Error ? err.message.slice(0, 200) : "read failed");
    return fallback;
  };
}

/** The preview facts of one order row of this store (masked first under an impersonation scope). */
async function previewOf(scope: StoreScope, row: typeof orders.$inferSelect, viewer: { firstName: string | null }): Promise<TemplatePreview> {
  const order = maskIfImpersonation(scope, row) as typeof orders.$inferSelect;
  const entries = await Promise.all(TEMPLATE_LOCALES.map(async (locale) => [locale, await orderTemplateValues(scope, order, { firstName: viewer.firstName, locale })] as const));
  return { orderId: row.id, phone: row.phone ? maskPhone(row.phone) : "", values: Object.fromEntries(entries) as Record<TemplateLocale, TemplateValues> };
}

/** The preview on one order of this store; null when the id is not one of its orders (core §E.3: no existence leak). */
export async function templatePreview(scope: StoreScope, orderId: string, viewer: { firstName: string | null }): Promise<TemplatePreview | null> {
  const [row] = await db.select().from(orders).where(byId(orders, scope, orderId)).limit(1);
  return row ? previewOf(scope, row, viewer) : null;
}

/** The store's most recent real order (not a test, not a honeypot row): the default preview. */
async function latestPreview(scope: StoreScope, viewer: { firstName: string | null }): Promise<TemplatePreview | null> {
  const [row] = await db
    .select()
    .from(orders)
    .where(whereStore(orders, scope, and(eq(orders.isTest, false), NOT_HONEYPOT)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row ? previewOf(scope, row, viewer) : null;
}

async function hoursOf(scope: StoreScope, locale: TemplateLocale): Promise<WhatsAppScreen["hours"]> {
  const w = await callingWindowFor(scope);
  if (!w.configured) return { configured: false, text: null };
  let text: string | null = null;
  try {
    text = hoursText(w, locale, DATE_LOCALE[locale], new Date()) || null;
  } catch {
    // P4's hoursText not built yet: the hours exist but have no words here; the link still opens them
    text = null;
  }
  return { configured: true, text };
}

export async function whatsappScreen(scope: StoreScope, viewer: { firstName: string | null; locale: TemplateLocale }): Promise<WhatsAppScreen> {
  const [rows, preview, confirmation, hours] = await Promise.all([
    listTemplates(scope, { channel: "whatsapp", pageId: null }).catch(logged("rows", null)),
    latestPreview(scope, viewer).catch(logged<"error">("preview", "error")),
    Promise.all([getStoreSetting(scope, "store"), getStoreById(scope.storeId)])
      .then(([s, store]) => ({ number: confirmNumberOf(s.confirmation ?? null, store?.market ?? "MA") }))
      .catch(logged("confirmation", null)),
    hoursOf(scope, viewer.locale).catch(logged("hours", null)),
  ]);
  return { rows, preview, confirmation, hours };
}
