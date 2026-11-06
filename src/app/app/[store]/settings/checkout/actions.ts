"use server";
/**
 * "After the order" and the checkout options (P3 LANDING; landing.md LAN-§8.4, §8.5, §23.1; docs/STORE-SAAS.md §I.8):
 * the thank-you switches (`landing.thankYou`), the confirmation block (`store.confirmation`, the core key, written
 * through the settings writer), the `customer_confirm` text per locale (operations' `message_templates`, store-wide
 * rows), the checkout options (`checkout.*`, `checkout.write`) and the lead / tracking switches (`landing.*`). Every
 * body is `return storeAction(…)` with the browser's op id, and every write queues the live pages for a `store_info`
 * re-render: the thank-you bakes these numbers and texts (LAN-§8.5).
 *
 * The calling window itself is operations' (`saveCallingWindowAction`, P4), mounted on the same card.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { MAX_TEMPLATE_CHARS } from "@/lib/landing/limits";
import { onceForStore } from "@/lib/landing/op-once.server";
import { rerenderLive } from "@/lib/landing/rerender.server";
import { unknownTemplateVars } from "@/lib/landing/templates";
import { ownTemplates, saveLandingTemplate } from "@/lib/landing/templates.server";
import { normalizePhone } from "@/lib/markets/phone";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import type { LandingSetting } from "@/lib/settings/keys/landing";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

const refresh = (handle: string) => revalidateStore(handle, "/settings/checkout");

async function done(ctx: WriteCtx, area: string): Promise<void> {
  await rerenderLive(ctx.scope, area);
  refresh(ctx.store.handle);
}

const ThankYou = z.object({ confirmWhatsapp: z.boolean(), expectation: z.boolean(), trackLink: z.boolean() });
export type ThankYouInput = z.input<typeof ThankYou>;

/** The three thank-you switches (`landing.thankYou`). */
export async function saveThankYouAction(opId: string, input: ThankYouInput): Promise<ActionResult<LandingSetting["thankYou"]>> {
  return storeAction("settings.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const thankYou = ThankYou.parse(input);
      const v = await updateStoreSetting(ctx.scope, "landing", { thankYou }, settingsActor(ctx.actor));
      await auditFrom(ctx, "store.landing_settings.updated", { meta: { fields: ["thankYou"] } });
      await done(ctx, "thank-you switches");
      return v.thankYou;
    }),
  );
}

const Confirmation = z.object({
  callerPhone: z.string().trim().max(32).nullable(),
  whatsapp: z.string().trim().max(32).nullable(),
  withinHours: z.number().int().min(1, { error: "Between 1 and 48 hours." }).max(48, { error: "Between 1 and 48 hours." }).nullable(),
});
export type ConfirmationInput = z.input<typeof Confirmation>;
export type ConfirmationValue = { callerPhone: string | null; whatsapp: string | null; withinHours: number | null };

/**
 * The caller phone (E.164), the "Confirm on WhatsApp" number (wa.me digits) and "We call within N hours"
 * (`store.confirmation`). Phones are normalised for the store's phone country; an empty field clears the value (no
 * promise is ever kept for a number the owner removed).
 */
export async function saveConfirmationAction(opId: string, input: ConfirmationInput): Promise<ActionResult<ConfirmationValue>> {
  return storeAction("settings.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const v = Confirmation.parse(input);
      const { phoneCountry } = await getStoreSetting(ctx.scope, "defaults");
      const phone = (raw: string | null, what: string): string | undefined => {
        if (!raw) return undefined;
        const n = normalizePhone(raw, phoneCountry);
        if (!n) fail(`Check the ${what}: it isn't a valid phone number.`);
        return n!.e164;
      };
      const callerPhone = phone(v.callerPhone, "number you call from");
      const wa = phone(v.whatsapp, "WhatsApp number")?.replace(/^\+/, "");
      const confirmation = { ...(callerPhone ? { callerPhone } : {}), ...(wa ? { whatsapp: wa } : {}), ...(v.withinHours ? { withinHours: v.withinHours } : {}) };
      const saved = await updateStoreSetting(ctx.scope, "store", { confirmation }, settingsActor(ctx.actor));
      await done(ctx, "confirmation");
      const c = saved.confirmation;
      return { callerPhone: c.callerPhone ?? null, whatsapp: c.whatsapp ?? null, withinHours: c.withinHours ?? null };
    }),
  );
}

const Locale = z.enum(["ar", "fr", "en"]);

/**
 * The `customer_confirm` text of one locale ("Confirm on WhatsApp" prefill); null or the default's own text goes back
 * to the default. Only `{order_id}` `{offer}` `{total}` `{name}` may appear (the chips); any other is refused by name.
 */
export async function saveConfirmTemplateAction(opId: string, locale: "ar" | "fr" | "en", body: string | null): Promise<ActionResult<Record<"ar" | "fr" | "en", string | null>>> {
  return storeAction("settings.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const loc = Locale.parse(locale);
      const text = z.string().trim().max(MAX_TEMPLATE_CHARS, { error: `At most ${MAX_TEMPLATE_CHARS} characters.` }).nullable().parse(body);
      const unknown = text ? unknownTemplateVars("customer_confirm", text) : [];
      if (unknown.length) fail(`Unknown variable ${unknown.map((u) => `{${u}}`).join(", ")}. Use the chips above the text.`);
      await saveLandingTemplate(ctx, "customer_confirm", loc, text || null);
      await auditFrom(ctx, "store.landing_settings.updated", { meta: { fields: ["customer_confirm"], locale: loc } });
      await done(ctx, "confirm template");
      return ownTemplates(ctx.scope, "customer_confirm");
    }),
  );
}

const CheckoutOptions = z
  .object({
    addressMode: z.enum(["required", "optional"]).nullable(),
    newPageForm: z.object({ city: z.enum(["select", "text", "hidden"]).optional(), note: z.enum(["optional", "hidden"]).optional() }),
    notServedWhatsapp: z.boolean(),
    confirmationCall: z.boolean(),
  })
  .partial();
export type CheckoutOptionsInput = z.input<typeof CheckoutOptions>;
export type CheckoutOptionsValue = Pick<CheckoutSetting, "addressMode" | "newPageForm" | "confirmationCall"> & { notServedWhatsapp: boolean };

/** The address field, the new-page form defaults, the not-served button and the confirmation call (`checkout.*`). */
export async function saveCheckoutOptionsAction(opId: string, patch: CheckoutOptionsInput): Promise<ActionResult<CheckoutOptionsValue>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const p = CheckoutOptions.parse(patch);
      const v = await updateStoreSetting(
        ctx.scope,
        "checkout",
        (cur) => ({
          ...(p.addressMode !== undefined ? { addressMode: p.addressMode } : {}),
          ...(p.newPageForm !== undefined ? { newPageForm: p.newPageForm } : {}),
          ...(p.notServedWhatsapp !== undefined ? { notServed: { ...cur.notServed, whatsapp: p.notServedWhatsapp } } : {}),
          ...(p.confirmationCall !== undefined ? { confirmationCall: p.confirmationCall } : {}),
        }),
        settingsActor(ctx.actor),
      );
      await done(ctx, "checkout options");
      return { addressMode: v.addressMode, newPageForm: v.newPageForm, confirmationCall: v.confirmationCall, notServedWhatsapp: v.notServed.whatsapp };
    }),
  );
}

const LandingOptions = z.object({ leadsCapture: z.enum(["market_default", "on", "off"]), trackingRequests: z.boolean() }).partial();
export type LandingOptionsInput = z.input<typeof LandingOptions>;
export type LandingOptionsValue = { leadsCapture: LandingSetting["leads"]["capture"]; trackingRequests: boolean };

/** Lead capture (`landing.leads.capture`) and the tracking page's requests (`landing.tracking.requests`). */
export async function saveLandingOptionsAction(opId: string, patch: LandingOptionsInput): Promise<ActionResult<LandingOptionsValue>> {
  return storeAction("settings.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const p = LandingOptions.parse(patch);
      const v = await updateStoreSetting(
        ctx.scope,
        "landing",
        (cur) => ({
          ...(p.leadsCapture !== undefined ? { leads: { ...cur.leads, capture: p.leadsCapture } } : {}),
          ...(p.trackingRequests !== undefined ? { tracking: { ...cur.tracking, requests: p.trackingRequests } } : {}),
        }),
        settingsActor(ctx.actor),
      );
      await auditFrom(ctx, "store.landing_settings.updated", { meta: { fields: Object.keys(p) } });
      await done(ctx, "landing options");
      return { leadsCapture: v.leads.capture, trackingRequests: v.tracking.requests };
    }),
  );
}
