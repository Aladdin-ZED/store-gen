import "server-only";
/**
 * `compileScript` (P4 CALL CENTER; operations.md OPE-§7.2, §7.3, RA §4.5, core §F.11): the script one order's card
 * carries. The pure half is ./script.ts (`compileScriptDoc`); this file picks the document and fills the values.
 *
 *   selection   the active `call_script` row of (store, the order's page, locale), else of (store, every page,
 *               locale), else the built-in (./script-builtins.ts, id `builtin:script:<locale>`); a row whose body no
 *               longer parses as a `ScriptDoc` is skipped, never shown half-valid
 *   locale      the panel's tab when given, else `orders.locale` when it is a script language, else the store's default
 *               language, else fr. An order's language is one its store served (the page it was placed on), so the
 *               store's own language list needs no read here.
 *   values      P5's `orderTemplateValues(scope, order, { firstName, locale })`, rendered by P5's `renderTemplate`.
 *               Personalisation is template-only: the text is built here from the order's stored values, no customer
 *               field ever reaches a model (an AI draft is written per page, never per order).
 *
 * P5's two functions are typed stubs that throw "not implemented" until the P5 merge (P5 merges before P4); in that
 * state, or on any failure of theirs, the script answers `unavailable` with no step rather than a raw template.
 */
import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { messageTemplates } from "@/lib/db/schema";
import { orderTemplateValues, renderTemplate } from "@/lib/integrations/templates";
import type { OrderRow } from "@/lib/orders/hooks";
import { logError } from "@/lib/orders/log";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { compileScriptDoc, isScriptLocale, ScriptDoc, type CompiledScript, type ScriptLocale, type TemplateValues } from "./script";
import { BUILTIN_SCRIPTS, builtinScriptId } from "./script-builtins";

/** A `call_script` row as the selection reads it (the card passes the rows it already read). */
export interface ScriptRow {
  id: string;
  pageId: string | null;
  body: string;
  source: "user" | "ai";
}

/** The script language of an order (see the header). */
export function scriptLocaleOf(orderLocale: string | null | undefined, storeDefault: string | null | undefined): ScriptLocale {
  if (isScriptLocale(orderLocale)) return orderLocale;
  if (isScriptLocale(storeDefault)) return storeDefault;
  return "fr";
}

function scriptRows(scope: StoreScope, pageId: string, locale: ScriptLocale): Promise<ScriptRow[]> {
  return db
    .select({ id: messageTemplates.id, pageId: messageTemplates.pageId, body: messageTemplates.body, source: messageTemplates.source })
    .from(messageTemplates)
    .where(
      whereStore(
        messageTemplates,
        scope,
        eq(messageTemplates.channel, "call_script"),
        eq(messageTemplates.status, "active"),
        eq(messageTemplates.locale, locale),
        or(isNull(messageTemplates.pageId), eq(messageTemplates.pageId, pageId)),
      ),
    )
    .orderBy(asc(messageTemplates.position))
    .limit(10);
}

const parseDoc = (body: string): ScriptDoc | null => {
  try {
    const r = ScriptDoc.safeParse(JSON.parse(body));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
};

/** The document of an order: the page's row, the store-wide row, or the built-in. */
export function pickScript(rows: readonly ScriptRow[], pageId: string, locale: ScriptLocale): { doc: ScriptDoc; source: CompiledScript["source"]; templateId: string } {
  for (const r of [...rows.filter((x) => x.pageId === pageId), ...rows.filter((x) => x.pageId === null)]) {
    const doc = parseDoc(r.body);
    if (doc) return { doc, source: r.source === "ai" ? "ai" : "store", templateId: r.id };
  }
  return { doc: BUILTIN_SCRIPTS[locale], source: "builtin", templateId: builtinScriptId(locale) };
}

const firstWord = (s: string | null | undefined): string | null => (s ?? "").trim().split(/\s+/)[0] || null;
const stub = (err: unknown) => err instanceof Error && err.message.startsWith("not implemented");

/** The order's script for `viewer` (see the header). `rows`: the card's read of the store's active script rows. */
export async function compileScript(scope: StoreScope, order: OrderRow, viewer: StoreCtx, opts: { locale?: ScriptLocale; rows?: readonly ScriptRow[] } = {}): Promise<CompiledScript> {
  const locale = opts.locale ?? scriptLocaleOf(order.locale, viewer.store.defaultLocale);
  const rows = opts.rows ?? (await scriptRows(scope, order.pageId, locale));
  const { doc, source, templateId } = pickScript(rows, order.pageId, locale);
  const meta = { locale, source, templateId };
  let values: TemplateValues;
  try {
    values = await orderTemplateValues(scope, order, { firstName: firstWord(viewer.user.name), locale });
    return compileScriptDoc(doc, values, renderTemplate, meta);
  } catch (err) {
    if (!stub(err)) logError("ops:script", err);
    return { ...meta, steps: [], objections: [], unavailable: true };
  }
}
