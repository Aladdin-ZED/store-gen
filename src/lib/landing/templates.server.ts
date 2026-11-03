import "server-only";
/**
 * The owner's text of a landing template kind (P3 LANDING; landing.md LAN-§2.3, §8.4, §24.2): operations'
 * `message_templates` table (core §D.5, OPE-§2.5) read through the store scope, else the default of ./templates.ts.
 *
 *   templateFor(scope, "customer_confirm", "fr")   the active WhatsApp row of the store for that kind and locale that
 *                                                  applies to every page (`page_id` NULL), lowest `position` first, the
 *                                                  latest edit on a tie; else the built-in default
 *
 * Read uncached: the thank-you bakes the text at render time (publish, the `store_info` re-render), so a template the
 * owner saves a second ago must not lose to a stale cache entry.
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { messageTemplates } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { shopperLocaleOf } from "./copy";
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
