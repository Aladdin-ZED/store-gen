import "server-only";
/**
 * Abandoned-lead capture: the runtime posts the form state once the phone looks valid. One row per
 * idempotency key (= the order's idem), updated while the visitor keeps typing, marked converted
 * when the order arrives. Invalid phones and throttled clients are ignored silently.
 *
 * In the store of the resolved page key (docs/STORE-SAAS.md §E.3, ORD-18): the network budget is the store's
 * (`s:<sid>:lead:ip:<hash>`, 30 per 10 min), the "already ordered" check reads the store's orders, the row is
 * written with the store from the scope, and an idem that another store already used is never updated (the key is
 * global, the row is not). A lead from a test link (D54) is stored `is_test`.
 *
 * `selection` (docs/OFFERS.md §G.1, §I.2, §I.4): the warehouse text of the part of the lead's offer
 * choice that resolves against the version the visitor saw ("1 × Jour + 1 × Nuit (NR/M)"), ≤ 400
 * characters. Units or extras that don't resolve (not chosen yet, unknown ids) are left out, never
 * an error.
 */
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { leads, orders } from "@/lib/db/schema";
import { findCity, getMarket } from "@/lib/markets";
import { normalizePhone } from "@/lib/markets/phone";
import { hashIp } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import type { PublicPageTarget } from "@/lib/tenancy/public";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import type { LeadPayload, UnitIn } from "./contract";
import { storeBucketKey } from "./create";
import { orderVersion } from "./resolve";
import { leadSelectionText } from "./lead-text";
import { cleanInput, validName } from "./validate";

type Lead = z.output<typeof LeadPayload>;

export interface UpsertLeadContext {
  ip: string;
  /** the resolved page key (resolvePublicTarget, purpose "order") */
  target: PublicPageTarget;
  /** resolveTestToken(target.store, ?sg-test).test (D54) */
  test?: boolean;
}

export function upsertLead(payload: Lead, ctx: UpsertLeadContext): Promise<{ stored: boolean }> {
  return storeLead(ctx.target.scope, payload, ctx);
}

async function storeLead(scope: WriteScope, payload: Lead, ctx: UpsertLeadContext): Promise<{ stored: boolean }> {
  const { target } = ctx;
  const gate = await rateLimit(storeBucketKey(scope, "lead:ip", hashIp(ctx.ip)), 30, 600);
  if (!gate.ok) return { stored: false };

  const { doc } = target;
  const phone = normalizePhone(payload.phone, doc.form.phoneCountry);
  if (!phone) return { stored: false };

  const [converted] = await db.select({ id: orders.id }).from(orders).where(whereStore(orders, scope, eq(orders.idem, payload.idem))).limit(1);
  if (converted) return { stored: false };

  const name = payload.name ? validName(payload.name) : null;
  const cityInput = cleanInput(payload.city, 80);
  const market = getMarket(doc.market);
  const city = cityInput ? (market.cities ? (findCity(market.code, cityInput)?.value ?? null) : cityInput) : null;
  const bundleId = payload.bundleId && doc.offers.bundles.some((b) => b.id === payload.bundleId) ? payload.bundleId : null;
  const utm = Object.fromEntries(Object.entries(payload.utm).filter(([, v]) => typeof v === "string" && v));

  // the selection reads the version the visitor saw (same rule as orders); never blocks the lead
  let selection: string | null = null;
  try {
    const seen = await orderVersion(scope, target, payload);
    const units = (payload.units ?? []).filter((u): u is UnitIn => !!u && typeof u === "object");
    const extras = Object.fromEntries(Object.entries(payload.extras ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"));
    const id = payload.bundleId && seen.doc.offers.bundles.some((b) => b.id === payload.bundleId) ? payload.bundleId : null;
    selection = leadSelectionText(seen.doc, { bundleId: id, units, extras });
  } catch (err) {
    console.warn("[leads] selection skipped:", err instanceof Error ? err.message : "unknown error");
  }

  // only this store's, this page's unconverted lead may be updated through its idem
  const own = sql`\`store_id\` = ${scope.storeId} AND \`page_id\` = ${target.pageId} AND \`converted_order_id\` IS NULL`;
  await db
    .insert(leads)
    .values(
      storeValues(scope, {
        id: newId(),
        pageId: target.pageId,
        idem: payload.idem,
        phone: phone.e164,
        name,
        city,
        bundleId,
        selection,
        utm: Object.keys(utm).length ? utm : null,
        isTest: !!ctx.test,
        createdAt: new Date(),
      }),
    )
    .onDuplicateKeyUpdate({
      set: {
        phone: sql`IF(${own}, VALUES(\`phone\`), \`phone\`)`,
        name: sql`IF(${own}, COALESCE(VALUES(\`name\`), \`name\`), \`name\`)`,
        city: sql`IF(${own}, COALESCE(VALUES(\`city\`), \`city\`), \`city\`)`,
        bundleId: sql`IF(${own}, COALESCE(VALUES(\`bundle_id\`), \`bundle_id\`), \`bundle_id\`)`,
        selection: sql`IF(${own}, COALESCE(VALUES(\`selection\`), \`selection\`), \`selection\`)`,
      },
    });
  return { stored: true };
}
