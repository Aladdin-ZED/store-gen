"use server";
/**
 * Delivery settings writes (P3 LANDING; landing.md LAN-§7.3, §7.1, §2.3; docs/STORE-SAAS.md §I.8 rule 2): the zones,
 * the calendar, the fixed holidays, the yearly review, the confirmation lead and the two switches. Every body is
 * `return storeAction("checkout.write", …)`: the store is the signed request path's, never the browser's; every write
 * carries the browser's op id (`onceForStore`), so a retried POST answers the first result. Cities arrive as keys and
 * are checked against the market's list by `saveZones` (unknown or twice → a `ZoneProblem`, nothing written). Each
 * write queues the store's live pages for a `store_info` re-render (the fallback line follows the calendar).
 *
 * The typical-days field of markets without a city list is `policies.delivery.typicalDays` (`settings.write`, the
 * policies key's permission, LAN-§23.1).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revalidateStore } from "@/lib/admin-data/shell";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { localParts } from "@/lib/delivery/eta";
import { MA_FIXED_HOLIDAYS } from "@/lib/delivery/holidays-ma";
import { confirmationLeadSuggestion } from "@/lib/delivery/lead.server";
import type { DeliveryZoneRow, ZoneInput, ZoneProblem } from "@/lib/delivery/types";
import { ZoneListSchema } from "@/lib/delivery/validate";
import { saveZones } from "@/lib/delivery/zones.server";
import { MAX_LEAD_DAYS } from "@/lib/landing/limits";
import { onceForStore } from "@/lib/landing/op-once.server";
import { rerenderLive } from "@/lib/landing/rerender.server";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

type Calendar = CheckoutSetting["calendar"];
const DEFAULT_TZ = "Africa/Casablanca";
/** `checkout.calendar.holidays` holds at most this many dates (the setting's own cap) */
const MAX_HOLIDAYS = 60;

const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CalendarPatch = z.object({
  workdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, { error: "Keep at least one working day." })
    .max(7)
    .transform((d) => [...new Set(d)].sort((a, b) => a - b))
    .optional(),
  /** none, or 10:00 … 20:00 (the editor's choices) */
  cutoffHour: z.number().int().min(10).max(20).nullable().optional(),
  holidays: z
    .array(YMD)
    .max(MAX_HOLIDAYS, { error: `At most ${MAX_HOLIDAYS} holidays.` })
    .transform((d) => [...new Set(d)].sort())
    .optional(),
  confirmationLeadDays: z.number().int().min(0).max(MAX_LEAD_DAYS).nullable().optional(),
});
export type CalendarPatch = z.input<typeof CalendarPatch>;

const refresh = (handle: string) => revalidateStore(handle, "/settings/delivery");

async function writeCalendar(ctx: WriteCtx, change: (cur: Calendar) => Calendar): Promise<Calendar> {
  const next = await updateStoreSetting(ctx.scope, "checkout", (cur) => ({ calendar: change(cur.calendar) }), settingsActor(ctx.actor));
  await rerenderLive(ctx.scope, "delivery calendar");
  refresh(ctx.store.handle);
  return next.calendar;
}

const storeToday = (ctx: WriteCtx): string => localParts(new Date(), ctx.store.timezone || DEFAULT_TZ)?.ymd ?? new Date().toISOString().slice(0, 10);

/** Replaces the store's zones (the whole list, in position order); problems come back with nothing written. */
export async function saveZonesAction(opId: string, zones: ZoneInput[]): Promise<ActionResult<{ zones: DeliveryZoneRow[]; problems: ZoneProblem[]; busy?: true }>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const r = await saveZones(ctx, ZoneListSchema.parse(zones));
      if (!r.problems.length && !r.busy) refresh(ctx.store.handle);
      return r;
    }),
  );
}

/** Working days, cut-off hour, holidays and the confirmation lead (any subset). */
export async function saveCalendarAction(opId: string, patch: CalendarPatch): Promise<ActionResult<Calendar>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const p = CalendarPatch.parse(patch);
      return writeCalendar(ctx, (cur) => ({
        ...cur,
        ...(p.workdays !== undefined ? { workdays: p.workdays } : {}),
        ...(p.cutoffHour !== undefined ? { cutoffHour: p.cutoffHour } : {}),
        ...(p.holidays !== undefined ? { holidays: p.holidays } : {}),
        ...(p.confirmationLeadDays !== undefined ? { confirmationLeadDays: p.confirmationLeadDays } : {}),
      }));
    }),
  );
}

/**
 * Adds the fixed Moroccan holidays of `year` (this year or the next, store-local) to the calendar: only the dates still
 * to come, never a movable one (they follow the moon sighting). Past dates make room when the list would pass its cap.
 */
export async function addFixedHolidaysAction(opId: string, year: number): Promise<ActionResult<Calendar>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      if (ctx.store.market !== "MA") fail("Fixed holidays are offered for Morocco only. Add your dates one by one.");
      const today = storeToday(ctx);
      const thisYear = Number(today.slice(0, 4));
      const y = z.number().int().min(thisYear).max(thisYear + 1).parse(year);
      const added = MA_FIXED_HOLIDAYS.map((h) => `${y}-${h.md}`).filter((d) => d >= today);
      return writeCalendar(ctx, (cur) => {
        let all = [...new Set([...cur.holidays, ...added])].sort();
        while (all.length > MAX_HOLIDAYS && all[0]! < today) all = all.slice(1);
        if (all.length > MAX_HOLIDAYS) fail(`At most ${MAX_HOLIDAYS} holidays. Remove past dates first.`);
        return { ...cur, holidays: all };
      });
    }),
  );
}

/** "I reviewed the holidays for <year>": stops the yearly reminder for that year. */
export async function markHolidaysReviewedAction(opId: string, year: number): Promise<ActionResult<Calendar>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const thisYear = Number(storeToday(ctx).slice(0, 4));
      const y = z.number().int().min(thisYear).max(thisYear + 1).parse(year);
      return writeCalendar(ctx, (cur) => ({ ...cur, holidaysReviewedYear: Math.max(cur.holidaysReviewedYear ?? 0, y) }));
    }),
  );
}

/**
 * Applies the confirmation-lead suggestion the server computes now (the browser's number is never trusted). Without
 * a suggestion (fewer than 30 confirmed orders in 28 days) nothing is written and `applied` is false.
 */
export async function applyLeadSuggestionAction(opId: string): Promise<ActionResult<{ calendar: Calendar; applied: boolean }>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const s = await confirmationLeadSuggestion(ctx.scope);
      if (!s) return { calendar: (await getStoreSetting(ctx.scope, "checkout", { fresh: true })).calendar, applied: false };
      return { calendar: await writeCalendar(ctx, (cur) => ({ ...cur, confirmationLeadDays: Math.min(s.days, MAX_LEAD_DAYS) })), applied: true };
    }),
  );
}

/** "Show delivery dates to shoppers" (`checkout.zonesEnabled`). */
export async function setZonesEnabledAction(opId: string, on: boolean): Promise<ActionResult<{ zonesEnabled: boolean }>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const v = await updateStoreSetting(ctx.scope, "checkout", { zonesEnabled: z.boolean().parse(on) }, settingsActor(ctx.actor));
      await rerenderLive(ctx.scope, "zones switch");
      refresh(ctx.store.handle);
      return { zonesEnabled: v.zonesEnabled };
    }),
  );
}

/** "On landing pages" (`checkout.lineOnLanding`). */
export async function setLineOnLandingAction(opId: string, on: boolean): Promise<ActionResult<{ lineOnLanding: boolean }>> {
  return storeAction("checkout.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const v = await updateStoreSetting(ctx.scope, "checkout", { lineOnLanding: z.boolean().parse(on) }, settingsActor(ctx.actor));
      await rerenderLive(ctx.scope, "landing line switch");
      refresh(ctx.store.handle);
      return { lineOnLanding: v.lineOnLanding };
    }),
  );
}

const TypicalDays = z
  .tuple([z.number().int().min(0).max(30), z.number().int().min(0).max(30)])
  .refine(([a, b]) => a <= b, { error: "The first number can't be larger than the second." })
  .nullable();

/** Markets without a city list: the typical delivery days of `policies.delivery` (null = not said). */
export async function saveTypicalDaysAction(opId: string, days: [number, number] | null): Promise<ActionResult<{ typicalDays: [number, number] | null }>> {
  return storeAction("settings.write", (ctx) =>
    onceForStore(ctx.scope, opId, async () => {
      const typicalDays = TypicalDays.parse(days);
      const cur = await getStoreSetting(ctx.scope, "policies", { fresh: true });
      const v = await updateStoreSetting(ctx.scope, "policies", { delivery: { ...cur.delivery, typicalDays } }, settingsActor(ctx.actor));
      await rerenderLive(ctx.scope, "typical days");
      refresh(ctx.store.handle);
      return { typicalDays: v.delivery.typicalDays };
    }),
  );
}
