import "server-only";
/**
 * The owner's text of a landing template kind (P3 LANDING; landing.md LAN-§2.3, §8.4, §24.2): operations'
 * `message_templates` table (core §D.5, OPE-§2.5) read through the store scope, else the default of ./templates.ts.
 *
 *   templateFor(scope, "customer_confirm", "fr")   the active WhatsApp row of the store for that kind and locale that
 *                                                  applies to every page (`page_id` NULL), lowest `position` first, the
 *                                                  latest edit on a tie; else the built-in default
 *   ownTemplates(scope, kind)                      the owner's own texts of a kind per locale (null = the default)
 *   saveLandingTemplate(ctx, kind, locale, body)   writes or clears that row (the "After the order" card)
 *
 * Read uncached: the thank-you bakes the text at render time (publish, the `store_info` re-render), so a template the
 * owner saves a second ago must not lose to a stale cache entry.
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { messageTemplates } from "@/lib/db/schema";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { shopperLocaleOf, type ShopperLocale } from "./copy";
import { defaultTemplate, type LandingTemplateKind } from "./templates";

/** Longest template text a page carries (the confirm text itself is cut to 600 characters after filling). */
const MAX_TEMPLATE_CHARS = 1_000;

export async function templateFor(scope: StoreScope, kind: LandingTemplateKind, locale: string): Promise<string> {
  const loc = shopperLocaleOf(locale);
  const [row] = await db
    .select({ body: messageTemplates.body })
    .from(messageTemplates)
    .where(
      whereStore(
        messageTemplates,
        scope,
        and(eq(messageTemplates.channel, "whatsapp"), eq(messageTemplates.kind, kind), eq(messageTemplates.locale, loc), eq(messageTemplates.status, "active"), isNull(messageTemplates.pageId)),
      ),
    )
    .orderBy(asc(messageTemplates.position), desc(messageTemplates.updatedAt))
    .limit(1);
  const body = row?.body.trim();
  return body && body.length <= MAX_TEMPLATE_CHARS ? body : defaultTemplate(kind, loc);
}

const LOCALES: readonly ShopperLocale[] = ["ar", "fr", "en"];

/** The active store-wide WhatsApp row of a kind and locale (the one `templateFor` reads). */
const activeRow = (kind: LandingTemplateKind, loc: ShopperLocale) =>
  and(eq(messageTemplates.channel, "whatsapp"), eq(messageTemplates.kind, kind), eq(messageTemplates.locale, loc), eq(messageTemplates.status, "active"), isNull(messageTemplates.pageId));

/** The owner's own text of a kind in each locale, null where the page uses the default. */
export async function ownTemplates(scope: StoreScope, kind: LandingTemplateKind): Promise<Record<ShopperLocale, string | null>> {
  const out: Record<ShopperLocale, string | null> = { ar: null, fr: null, en: null };
  for (const loc of LOCALES) {
    const [row] = await db
      .select({ body: messageTemplates.body })
      .from(messageTemplates)
      .where(whereStore(messageTemplates, scope, activeRow(kind, loc)))
      .orderBy(asc(messageTemplates.position), desc(messageTemplates.updatedAt))
      .limit(1);
    const body = row?.body.trim();
    out[loc] = body && body.length <= MAX_TEMPLATE_CHARS ? body : null;
  }
  return out;
}

/**
 * Writes the store-wide text of a kind in one locale: the active rows of that kind and locale are archived and the new
 * text becomes the one active row; `body` null (or the default's own text) only archives, so the page reads the
 * default again. The caller validated the variables (`unknownTemplateVars`).
 */
export async function saveLandingTemplate(ctx: WriteCtx, kind: LandingTemplateKind, locale: ShopperLocale, body: string | null): Promise<void> {
  const { scope } = ctx;
  const text = body?.trim() ?? "";
  await db.transaction(async (tx) => {
    await tx.update(messageTemplates).set({ status: "archived", updatedBy: ctx.user.id }).where(whereStore(messageTemplates, scope, activeRow(kind, locale)));
    if (!text || text === defaultTemplate(kind, locale)) return;
    await tx.insert(messageTemplates).values(
      storeValues(scope, { id: newId(), channel: "whatsapp", kind, locale, pageId: null, name: `${kind} (${locale})`, body: text.slice(0, MAX_TEMPLATE_CHARS), status: "active", source: "user", position: 0, updatedBy: ctx.user.id }),
    );
  });
}
