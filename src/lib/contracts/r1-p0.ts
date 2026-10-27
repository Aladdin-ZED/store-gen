/**
 * The R1 P0 contract (maintainer; docs/STORE-SAAS.md §K.2 P0, §K.3): a compile-time check that every cross-track stub
 * frozen at P0 keeps its file, its name and its signature, and that the shapes other tracks build against keep their
 * fields. Types only: nothing here runs and nothing imports it. A track that renames, removes or re-types a frozen
 * export breaks `tsc` (and so `npm run gate`); a change goes through a CCR (docs/saas/ccr/README.md) and the maintainer
 * updates the entry with it. Append-only lists (event types, template variables) are checked for their P0 members
 * only, so an append needs no change here.
 *
 * Part 1 (step D): P4 CALL CENTER, P5 INTEGRATIONS, P3 LANDING, P8 PLATFORM OPS. Step E appends P1, P2, P6 and P7.
 */
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import type { SearchHit } from "@/lib/admin-data/search/types";
import type * as aggregates from "@/lib/callcenter/aggregates";
import type { AggCell, AggDim, ISODate } from "@/lib/callcenter/aggregates";
import type * as defaults from "@/lib/callcenter/defaults";
import type { AttemptOutcome, DeliveryOutcome } from "@/lib/callcenter/outcomes";
import type * as window from "@/lib/callcenter/window";
import type { EffectiveWindow, IsoWeekday, Range } from "@/lib/callcenter/window";
import type * as windowServer from "@/lib/callcenter/window.server";
import type * as campaigns from "@/lib/campaigns/compile";
import type { CompileKitInput, CompileKitResult } from "@/lib/campaigns/compile";
import type { CampaignKit } from "@/lib/db/schema";
import type * as eta from "@/lib/delivery/eta";
import type * as match from "@/lib/delivery/match";
import type * as table from "@/lib/delivery/table";
import type { DeliveryZoneRow, EtaWindow, StoreCalendar, ZoneCityKey, ZoneLine, ZoneTable } from "@/lib/delivery/types";
import type * as zones from "@/lib/delivery/zones.server";
import type * as deliveries from "@/lib/integrations/deliveries";
import type { DeliveriesQuery, DeliveryRow } from "@/lib/integrations/deliveries";
import type * as integrationHealth from "@/lib/integrations/health";
import type { IntegrationHealthRow, SheetsBacklog } from "@/lib/integrations/health";
import type * as templates from "@/lib/integrations/templates";
import type { TemplateVar } from "@/lib/integrations/templates";
import type * as outbox from "@/lib/jobs/outbox";
import type { ClaimedItem, DrainReport, OutboxHandler, OutboxItem, OutboxKind, OutboxSummary, SendResult } from "@/lib/jobs/outbox";
import type * as renders from "@/lib/jobs/renders";
import type { RenderReason, RenderSummary } from "@/lib/jobs/renders";
import type * as backup from "@/lib/backup";
import type { BackupRunSummary } from "@/lib/backup";
import type * as exportsStore from "@/lib/exports-store";
import type { ExportJobSummary } from "@/lib/exports-store";
import type * as codInvariants from "@/lib/landing/cod-invariants";
import type { CodInvariantInputs, CodInvariants } from "@/lib/landing/cod-invariants";
import type * as facts from "@/lib/landing/honesty/facts.server";
import type * as modePlan from "@/lib/landing/mode-plan";
import type * as landingTemplates from "@/lib/landing/templates";
import type * as address from "@/lib/orders/address";
import type { CityKey } from "@/lib/orders/address";
import type { ORDER_STATUSES, OrderStatus } from "@/lib/orders/contract";
import type * as events from "@/lib/orders/events";
import type { AppendOrderEventInput, AppendOrderEventResult, OrderEventType } from "@/lib/orders/events";
import type { Move, OrderHook, OrderHookEvent, OrderRow, OrderSnapshot, Tx } from "@/lib/orders/hooks";
import type * as leads from "@/lib/orders/leads";
import type * as manual from "@/lib/orders/manual";
import type { ManualOrderInput } from "@/lib/orders/manual";
import type * as masking from "@/lib/orders/masking";
import type * as profile from "@/lib/orders/profile";
import type { ConsoleOrderDetail, ConsoleOrderRow, ConsoleTimelineItem, Kpi, OrderKpis, QueueCounts } from "@/lib/orders/profile";
import type * as queue from "@/lib/orders/queue";
import type { OpsPulse } from "@/lib/orders/queue";
import type * as state from "@/lib/orders/state";
import type { CancelReason, ConfirmState, MoneyState, OrderStates, ReturnReason, ShipState, TransitionSource } from "@/lib/orders/state";
import type * as transition from "@/lib/orders/transition";
import type { OrderActor, TransitionError, TransitionInput, TransitionResult } from "@/lib/orders/transition";
import type { Locale, PageDoc } from "@/lib/page/schema";
import type * as platformHealth from "@/lib/platform/health";
import type { PlatformHealth } from "@/lib/platform/health";
import type { PulseContributor } from "@/lib/pulse/types";
import type { StoreConfirmation } from "@/lib/settings/keys/store";
import type * as push from "@/lib/sheets/push";
import type * as testing from "@/lib/testing/links";
import type * as tracking from "@/lib/tracking/links";
import type { ActionResult, PlatformCtx, StoreCtx, StoreRow, StoreScope, SystemCtx, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import type { City } from "@/lib/markets/types";
import type { StoreAddress } from "@/lib/urls";
import type { z } from "zod";

/** true when A and B are the same type (parameter names aside; optionality and readonly count). */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Has<Sub, Of> = [Sub] extends [Of] ? true : false;
type Assert<T extends true> = T;

/* ------------------------------------------------------------------ */
/* P4 CALL CENTER (operations.md)                                      */
/* ------------------------------------------------------------------ */

export type P4StateMachine = [
  Assert<Equals<typeof state.CONFIRM_STATES, readonly ["new", "attempting", "callback", "confirmed", "cancelled", "fake", "duplicate", "unreachable"]>>,
  Assert<Equals<typeof state.SHIP_STATES, readonly ["none", "to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed", "delivered", "refused", "returned", "lost"]>>,
  Assert<Equals<typeof state.MONEY_STATES, readonly ["unpaid", "collected", "remitted", "disputed", "written_off", "refunded"]>>,
  Assert<Equals<typeof state.RETURN_REASONS, readonly ["customer_absent", "refused_price", "changed_mind", "wrong_item", "damaged", "unreachable", "no_cash", "address_wrong", "not_ordered", "other"]>>,
  Assert<Equals<typeof state.CANCEL_REASONS, readonly ["changed_mind", "price", "mistake", "bought_elsewhere", "not_ordered", "wrong_number", "out_of_zone", "delay", "see_first", "customer_request", "blocked", "attempts_exhausted", "other"]>>,
  Assert<Equals<OrderStates, { confirm: ConfirmState; ship: ShipState; money: MoneyState }>>,
  Assert<Equals<TransitionSource, "ui" | "bulk" | "outcome" | "sheet" | "carrier" | "import" | "api" | "bot" | "customer" | "system">>,
  Assert<Equals<state.MoveClass, "W" | "A" | "L" | "M" | "S">>,
  Assert<Equals<typeof state.projectStatus, (s: Pick<OrderStates, "confirm" | "ship">) => OrderStatus>>,
  Assert<Equals<typeof state.legacyToWanted, (label: OrderStatus, cur: OrderStates) => Partial<OrderStates> | "noop" | "reject">>,
  // the R1 projections are statuses (OPE-§3.3, appended to src/lib/orders/contract.ts at P0)
  Assert<Has<"refused" | "duplicate" | "unreachable" | "in_transit" | "lost", OrderStatus>>,
  Assert<Equals<(typeof ORDER_STATUSES)[9], { readonly id: "refused"; readonly fr: "Refusée"; readonly color: "#F8D7DD" }>>,
  // the hook registry hands P4's types to every track's hooks (OPE-§3.6)
  Assert<Equals<OrderHook["run"], (scope: WriteScope, e: OrderHookEvent, tx?: Tx) => Promise<void>>>,
  Assert<Equals<Extract<OrderHookEvent, { on: "transition" }>, { on: "transition"; before: OrderSnapshot; after: OrderSnapshot; moves: Move[]; actor: OrderActor; source: TransitionSource }>>,
];

export type P4Transition = [
  Assert<Equals<OrderActor, { kind: "user" | "system" | "api" | "bot" | "customer" | "sheet" | "carrier"; userId: string | null; can?: (p: StorePermission) => boolean; role?: StoreRole }>>,
  Assert<Equals<typeof transition.actorFrom, (ctx: StoreCtx | SystemCtx, kind?: OrderActor["kind"]) => OrderActor>>,
  Assert<
    Equals<
      TransitionInput,
      {
        orderId: string;
        want: Partial<OrderStates>;
        source: TransitionSource;
        expectRev?: number;
        reason?: CancelReason | string;
        note?: string;
        dueAt?: Date;
        duplicateOf?: string;
        force?: boolean;
        attempt?: { channel: "call" | "whatsapp"; outcome: AttemptOutcome | DeliveryOutcome; lane?: "confirm" | "delivery" };
        extra?: Partial<Pick<OrderRow, "dueAt" | "attempts" | "assigneeId" | "leaseUntil" | "claimToken" | "firstTouchAt" | "priority" | "cancelReason">>;
        ref?: string;
        returnReason?: ReturnReason;
        shipAfter?: Date | null;
        collectedCents?: number;
        lines?: { i: number; state: "delivered" | "refused" | "pending"; qty: number }[];
        inbound?: boolean;
      }
    >
  >,
  Assert<Equals<TransitionError, "not_found" | "illegal" | "conflict" | "reason_required" | "forbidden" | "locked_ship" | "bad_due" | "bad_duplicate" | "bad_hold" | "bad_amount">>,
  Assert<
    Equals<
      TransitionResult,
      | { ok: true; rev: number; states: OrderStates; status: OrderStatus; eventIds: number[]; changed: boolean }
      | { ok: false; error: TransitionError; current?: { rev: number; states: OrderStates; status: OrderStatus } }
    >
  >,
  Assert<Equals<typeof transition.transitionOrder, (actor: OrderActor, scope: WriteScope, input: TransitionInput) => Promise<TransitionResult>>>,
  Assert<
    Equals<
      typeof transition.applyExternalStatus,
      (
        scope: WriteScope,
        orderId: string,
        ext: { legacy?: OrderStatus; ship?: ShipState; money?: MoneyState; at?: Date },
        src: { kind: "sheet" | "carrier" | "import" | "api"; ref?: string },
      ) => Promise<TransitionResult | { ok: true; changed: false; noop: true }>
    >
  >,
];

export type P4OrdersApi = [
  // events (OPE-§2.2, §4.1; LAN Q17)
  Assert<Has<"created" | "state_changed" | "lead_attributed" | "track_opened" | "zone_not_served" | "kit_shared" | "customer_request" | "customer_confirm_intent" | "phone_revealed" | "released" | "manifest_exported", OrderEventType>>,
  Assert<Equals<AppendOrderEventInput, { actorKind: OrderActor["kind"]; actorId?: string | null; type: OrderEventType; reasonCode?: string; note?: string; meta?: Record<string, unknown> }>>,
  Assert<Equals<AppendOrderEventResult, { ok: true; id: number } | { ok: false; error: "not_found" | "bad_type" | "bad_meta" }>>,
  Assert<Equals<typeof events.appendOrderEvent, (scope: WriteScope, orderId: string, e: AppendOrderEventInput) => Promise<AppendOrderEventResult>>>,
  // city keys (OPE-§10.1, D68)
  Assert<Equals<CityKey, string & { readonly __city: true }>>,
  Assert<Equals<typeof address.CITY_KEYS, readonly CityKey[]>>,
  Assert<Equals<typeof address.cityKey, (value: string) => CityKey | null>>,
  Assert<
    Equals<
      typeof address.normalizeCity,
      (
        input: string,
        market: string,
        aliases?: Record<string, CityKey>,
      ) => { key: CityKey | null; value: string | null; confidence: "exact" | "alias" | "fuzzy" | "none"; suggestions: { key: CityKey; label: string }[] }
    >
  >,
  // masking (OPE-§8.1)
  Assert<Equals<typeof masking.maskPhone, (e164: string) => string>>,
  Assert<Equals<typeof masking.maskPhonesIn, (text: string, country: string) => string>>,
  // queue (OPE-§5.2, §27.3, §27.5)
  Assert<Equals<OpsPulse, { newOrders: number; dueCallbacks: number; queueNow: number; syncFailed: number }>>,
  Assert<Equals<typeof queue.opsPulse, (scope: StoreScope, viewer: Parameters<PulseContributor["contribute"]>[1]) => Promise<OpsPulse>>>,
  Assert<Equals<typeof queue.releaseAllLeases, (scope: WriteScope) => Promise<{ released: number }>>>,
  // manual orders and lead conversion (OPE-§11.1, §11.4; D72)
  Assert<
    Equals<
      ManualOrderInput,
      {
        pageId: string;
        selection: { offerId: string; units: manual.ManualOrderInput["selection"]["units"]; extras: Record<string, string>; bump: boolean };
        customer: { name: string; phone: string; city: string; address?: string; landmark?: string; note?: string; email?: string };
        source?: "manual" | "whatsapp";
        confirmed: boolean;
        adjustCents?: number;
        adjustReason?: string;
        fromLead?: { leadId: string };
        allowDuplicate?: boolean;
        idem: string;
      }
    >
  >,
  Assert<Equals<typeof manual.createManualOrder, (ctx: WriteCtx, input: ManualOrderInput) => Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>>>>,
  Assert<Equals<typeof manual.convertLeadToOrder, (ctx: WriteCtx, leadId: string, input: Omit<ManualOrderInput, "fromLead" | "pageId" | "source">) => Promise<ActionResult<{ orderId: string }>>>>,
];

export type P4ConsoleReads = [
  Assert<Equals<Kpi, { value: number; n: number; min: number } | { n: number; min: number; insufficient: true }>>,
  Assert<
    Equals<
      OrderKpis,
      {
        window: "today" | "7d" | "28d";
        placed: number;
        confirmed: number;
        delivered: number;
        decided: number;
        confirmationRate: Kpi;
        deliveryRate: Kpi;
        firstTouchP50Min: Kpi;
        unreachableRate: Kpi;
        riskyShare: Kpi;
        lastOrderAt: string | null;
        computedAt: string;
      }
    >
  >,
  Assert<
    Equals<
      QueueCounts,
      {
        toCallNow: number;
        callbacksDue: number;
        waitingRetry: number;
        firstTouchBreaches: number;
        abandonedToday: number;
        liveAgents: number;
        oldestCallbackOverdueMin: number | null;
        deliveryRescue: number;
        oldestRescueMin: number | null;
        toShip: number;
        oldestToShipDays: number | null;
        holds: number;
        nextHoldDay: string | null;
        inboundLookupsHour: number;
      }
    >
  >,
  Assert<
    Equals<
      ConsoleOrderRow,
      {
        id: string;
        createdAt: string;
        states: OrderStates;
        status: OrderStatus;
        totalCents: number;
        currency: string;
        city: string | null;
        customer: string;
        phoneMasked: string;
        risk: number;
        isTest: boolean;
        pageId: string | null;
        carrierLabel: string | null;
        trackingRef: string | null;
        carrierExportedAt: string | null;
      }
    >
  >,
  Assert<Equals<Omit<ConsoleOrderDetail, keyof ConsoleOrderRow>, { itemsText: string; timeline: ConsoleTimelineItem[]; integrations: { sheet: "pending" | "synced" | "failed" | "disabled"; outbox: { kind: string; topic: string; state: string }[] } }>>,
  Assert<Equals<typeof profile.orderKpis, (scope: StoreScope, window: OrderKpis["window"]) => Promise<OrderKpis>>>,
  Assert<Equals<typeof profile.queueCounts, (scope: StoreScope) => Promise<QueueCounts>>>,
  Assert<
    Equals<
      typeof profile.listOrdersForConsole,
      (scope: StoreScope, q: { state?: ConfirmState | ShipState; from?: string; to?: string; after?: string; limit?: number }) => Promise<{ items: ConsoleOrderRow[]; next: string | null }>
    >
  >,
  Assert<Equals<typeof profile.getOrderForConsole, (scope: StoreScope, orderId: string) => Promise<ConsoleOrderDetail | null>>>,
  Assert<Equals<typeof profile.recordPlatformReveal, (ctx: PlatformCtx, scope: StoreScope, orderId: string, reason: string) => Promise<{ e164: string } | null>>>,
  Assert<Equals<typeof profile.orderRiskMix, (scope: StoreScope, days: 28) => Promise<{ low: number; check: number; high: number; honeypot: number; n: number }>>>,
  Assert<Equals<typeof profile.searchOrders, (scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }, limit: 8) => Promise<SearchHit[]>>>,
];

export type P4CallingWindow = [
  Assert<Equals<Range, { from: string; to: string }>>,
  Assert<Equals<IsoWeekday, 1 | 2 | 3 | 4 | 5 | 6 | 7>>,
  Assert<
    Equals<
      EffectiveWindow,
      {
        tz: string;
        days: Record<IsoWeekday, Range[]>;
        closedDates: readonly string[];
        overrides: readonly { label: string; from: string; to: string; days: Record<IsoWeekday, Range[]> }[];
        openOverrideUntil: string | null;
        configured: boolean;
      }
    >
  >,
  Assert<Equals<window.CallingWindow, EffectiveWindow>>,
  Assert<Equals<typeof window.isoWeekday, (d: Date, tz: string) => IsoWeekday>>,
  Assert<Equals<typeof window.isCallable, (now: Date, w: EffectiveWindow) => { open: true } | { open: false; opensAt: Date | null }>>,
  Assert<Equals<typeof window.nextCallableAt, (t: Date, w: EffectiveWindow) => Date>>,
  Assert<Equals<typeof window.rangesForDay, (ymd: string, w: EffectiveWindow) => Range[]>>,
  Assert<Equals<typeof window.hoursText, (w: EffectiveWindow, locale: Locale, dateLocale: string, now: Date) => string>>,
  Assert<Equals<typeof window.shopperPromiseAllowed, (w: EffectiveWindow) => boolean>>,
  Assert<Equals<typeof windowServer.callingWindowFor, (scope: StoreScope) => Promise<EffectiveWindow>>>,
  Assert<Equals<typeof defaults.DEFAULT_WINDOW, { days: Record<IsoWeekday, Range[]>; closedDates: string[]; savedAt: string | null }>>,
];

export type P4Aggregates = [
  Assert<Equals<AggDim, "page" | "city" | "source" | "agent" | "offer" | "campaign" | "angle" | "carrier" | "hour" | "weekday">>,
  Assert<
    Equals<
      AggCell,
      {
        key: string;
        placed: number;
        confirmed: number;
        delivered: number;
        refused: number;
        cancelled: number;
        unreachable: number;
        fake: number;
        n: number;
        confirmationRate: Kpi;
        deliveryRate: Kpi;
        delta?: { prevPlaced: number; prevDeliveryRate: Kpi };
      }
    >
  >,
  Assert<
    Equals<
      typeof aggregates.opsAggregates,
      (
        scope: StoreScope,
        q: { from: ISODate; to: ISODate; dims: AggDim[]; compareWith?: "previous" },
      ) => Promise<{ cells: Record<AggDim, AggCell[]>; suppressed: number; computedAt: string }>
    >
  >,
  Assert<Equals<typeof aggregates.attemptStats, (scope: StoreScope, q?: { days?: 90 }) => Promise<{ weekday: number; hour: number; attempts: number; contacted: number }[]>>>,
];

/* ------------------------------------------------------------------ */
/* P5 INTEGRATIONS (operations.md)                                     */
/* ------------------------------------------------------------------ */

export type P5Integrations = [
  Assert<Has<"customer_first_name" | "order_id" | "eta_text" | "confirm_hours" | "tracking_link" | "carrier_label" | "carrier_tracking" | "ship_after_date", TemplateVar>>,
  Assert<Equals<typeof templates.renderTemplate, (src: string, values: Partial<Record<TemplateVar, string>>) => string>>,
  Assert<
    Equals<typeof templates.orderTemplateValues, (scope: StoreScope, order: OrderRow, viewer: { firstName: string | null; locale: Locale }) => Promise<Partial<Record<TemplateVar, string>>>>
  >,
  Assert<Equals<typeof push.scheduleSheetPush, (scope: WriteScope) => void>>,
  Assert<
    Equals<
      IntegrationHealthRow,
      {
        kind: integrationHealth.IntegrationKind;
        targetId: string;
        state: "ok" | "warn" | "failing" | "off";
        lastOkAt: string | null;
        lastErrorAt: string | null;
        lastErrorCode: string | null;
        lastErrorKey: IntegrationHealthRow["lastErrorKey"];
        failures: number;
        backlog: number;
        oldestPendingAt: string | null;
        updatedAt: string;
      }
    >
  >,
  Assert<Equals<SheetsBacklog, { pending: number; dirty: number; failed: number; oldestPendingAt: string | null; lastRunAt: string | null; lastRunFailedAt: string | null }>>,
  Assert<Equals<typeof integrationHealth.integrationHealth, (scope: StoreScope) => Promise<IntegrationHealthRow[]>>>,
  Assert<Equals<typeof integrationHealth.sheetsBacklog, (scope: StoreScope) => Promise<SheetsBacklog>>>,
  Assert<Equals<keyof DeliveryRow, "id" | "at" | "kind" | "topic" | "target" | "state" | "attempts" | "nextAt" | "lastStatus" | "lastErrorKey" | "summary">>,
  Assert<Equals<DeliveryRow["summary"], { orderId: string | null; event: string | null; amountCents: number | null }>>,
  Assert<Equals<typeof deliveries.listDeliveries, (scope: StoreScope, q: DeliveriesQuery) => Promise<{ rows: DeliveryRow[]; next: string | null }>>>,
];

/* ------------------------------------------------------------------ */
/* P3 LANDING (landing.md)                                             */
/* ------------------------------------------------------------------ */

export type P3Delivery = [
  Assert<Equals<ZoneCityKey, CityKey | "*">>,
  Assert<
    Equals<
      DeliveryZoneRow,
      {
        id: string;
        name: string;
        cities: ZoneCityKey[];
        feeCents: number | null;
        freeFromCents: number | null;
        etaMinDays: number | null;
        etaMaxDays: number | null;
        notServed: boolean;
        note: string | null;
        position: number;
      }
    >
  >,
  Assert<Equals<StoreCalendar, { tz: string; workdays: readonly number[]; cutoffHour: number | null; holidays: readonly string[]; leadDays: number }>>,
  Assert<Equals<EtaWindow, { from: string; to: string; minDays: number; maxDays: number; leadDays: number }>>,
  Assert<Equals<ZoneLine, { zoneId: string; zoneName: string; notServed: boolean; eta: EtaWindow | null; etaText: Record<"ar" | "fr" | "en", string> | null; feeCents: number | null }>>,
  Assert<
    Equals<
      ZoneTable,
      {
        v: 1;
        zones: { n: string; fee: number | null; freeFrom: number | null; d: [number, number] | null; ns: boolean }[];
        city: Record<string, number>;
        star: number | null;
        cal: StoreCalendar & { holidays: string[] };
      }
    >
  >,
  Assert<
    Equals<typeof zones.zoneLineFor, (scope: StoreScope, cityKey: CityKey | null, at?: Date, opts?: { stage: "before_call" | "after_call" }) => Promise<ZoneLine | null>>
  >,
  Assert<Equals<typeof zones.zonesForCheckout, (scope: StoreScope) => Promise<ZoneTable>>>,
  Assert<Equals<typeof zones.zoneFeesFor, (scope: StoreScope, keys: readonly CityKey[]) => Promise<Record<CityKey, number | null>>>>,
  Assert<Equals<typeof match.zoneForCity, (zones: readonly DeliveryZoneRow[], cityKey: CityKey | null) => DeliveryZoneRow | null>>,
  Assert<Equals<typeof table.buildZoneTable, (zones: readonly DeliveryZoneRow[], cal: StoreCalendar, cities: readonly City[]) => ZoneTable>>,
  Assert<Equals<typeof eta.etaWindow, (cal: StoreCalendar, zone: { etaMinDays: number; etaMaxDays: number }, now: Date) => EtaWindow | null>>,
  Assert<
    Equals<typeof eta.etaText, (w: EtaWindow | null, zone: { etaMinDays: number; etaMaxDays: number }, locale: "ar" | "fr" | "en", dateLocale: string, now: Date) => string>
  >,
  Assert<
    Equals<
      typeof eta.etaWindowText,
      (zone: { etaMinDays: number; etaMaxDays: number }, now: Date, cal: StoreCalendar, locale: "ar" | "fr" | "en", dateLocale?: string) => { from: Date; to: Date; text: string } | null
    >
  >,
];

export type P3Landing = [
  Assert<Equals<typeof tracking.signedTrackPath, (store: StoreAddress & { id: string }, orderId: string) => string>>,
  Assert<Equals<typeof landingTemplates.waConfirmText, (store: StoreRow & { confirmation: z.output<typeof StoreConfirmation> }, order: OrderRow, locale: Locale) => string>>,
  Assert<
    Equals<
      typeof leads.markLeadConverted,
      (scope: WriteScope, leadId: string, orderId: string, via: "agent") => Promise<{ ok: true; orderId: string; already: boolean } | { ok: false; error: "not_found" }>
    >
  >,
  Assert<Equals<typeof modePlan.landingModeSwitchPlan, (scope: StoreScope) => Promise<{ livePages: number; views7d: number; suggestInStoreMode: boolean }>>>,
  Assert<Equals<typeof testing.mintTestLink, (scope: WriteScope, pageId: string) => Promise<{ url: string; expiresAt: Date }>>>,
  Assert<Equals<typeof campaigns.compileKit, (input: CompileKitInput) => CompileKitResult>>,
  Assert<Equals<CompileKitResult, { kit: CampaignKit; offersHash: string; problems: { code: "no_structure_tags" | "no_locale" | "pixel_missing"; detail?: string }[] }>>,
  Assert<Equals<Parameters<typeof facts.recordFacts>[0], WriteScope>>,
  Assert<Equals<Parameters<typeof facts.recordFacts>[2], readonly string[]>>,
  // the result is frozen (LAN-§3.7); P3 may add inputs (`CodInvariantInputs` is P0's proposal, additive)
  Assert<
    Equals<
      CodInvariants,
      {
        formScreen: number;
        ctaTargetsForm: boolean;
        offerBeforeCta: boolean;
        deliveryLine: "present" | "absent" | "n/a";
        whatsappConfigured: boolean;
        urgencyReal: boolean;
        foldOk: boolean;
      }
    >
  >,
  Assert<Equals<typeof codInvariants.codInvariants, (doc: PageDoc, inputs: CodInvariantInputs) => CodInvariants>>,
];

/* ------------------------------------------------------------------ */
/* P8 PLATFORM OPS (core §G, §H; PLA Q.25)                             */
/* ------------------------------------------------------------------ */

export type P8Outbox = [
  Assert<Equals<OutboxKind, "webhook" | "capi" | "telegram" | "whatsapp" | "mail" | "carrier" | "push">>,
  Assert<Equals<OutboxItem, { kind: OutboxKind; topic: string; targetId?: string; dedupeKey: string; payload: unknown; pii?: boolean; notBefore?: Date }>>,
  Assert<Equals<SendResult, { ok: true; status?: number } | { ok: false; retry: boolean; status?: number; error: string }>>,
  Assert<Equals<keyof OutboxHandler<unknown>, "kind" | "maxPerTick" | "perStorePerTick" | "timeoutMs" | "send">>,
  Assert<Equals<OutboxHandler<unknown>["send"], (item: ClaimedItem<unknown>) => Promise<SendResult>>>,
  Assert<Equals<keyof ClaimedItem, "id" | "storeId" | "kind" | "topic" | "targetId" | "dedupeKey" | "payload" | "attempts" | "createdAt">>,
  Assert<Equals<typeof outbox.enqueue, (scope: WriteScope | "platform", items: readonly OutboxItem[]) => Promise<{ inserted: number; duplicates: number }>>>,
  Assert<Equals<typeof outbox.registerOutboxHandler, <P>(h: OutboxHandler<P>) => void>>,
  Assert<Equals<typeof outbox.drainOutbox, (opts: { budgetMs: number; storeId?: string; kinds?: OutboxKind[] }) => Promise<DrainReport>>>,
  Assert<Equals<typeof outbox.replay, (ctx: StoreCtx | PlatformCtx, id: string) => Promise<void>>>,
  Assert<Equals<typeof outbox.outboxSummary, (scope: StoreScope) => Promise<OutboxSummary>>>,
  Assert<Equals<typeof renders.enqueueRenders, (scope: WriteScope, pageIds: readonly string[] | "all-live", reason: RenderReason, priority?: number) => Promise<{ enqueued: number }>>>,
  Assert<Equals<typeof renders.renderSummary, (scope?: StoreScope) => Promise<RenderSummary>>>,
  Assert<Has<"address" | "brand" | "store_info" | "conversions" | "cutout", RenderReason>>,
];

export type P8HealthAndExports = [
  Assert<Equals<typeof platformHealth.getHealth, (ctx: PlatformCtx) => Promise<PlatformHealth>>>,
  Assert<Equals<PlatformHealth["edge"], { sMode: boolean; workerVersion: string | null; lastEdgeAt: string | null; prevKeyRequests24h: number; badKey24h: number; foreignHosts24h: number }>>,
  Assert<Equals<PlatformHealth["commerce"], { lastOrderAt: string | null; ordersPerHour24: number[] }>>,
  Assert<Equals<PlatformHealth["sheetsTop"], { storeId: string; oldestMin: number }[]>>,
  Assert<Equals<PlatformHealth["build"], { id: string | null; gateSha: string | null; gateAt: string | null }>>,
  Assert<Equals<PlatformHealth["dataDir"], { bytes: number; budgetBytes: number | null; files: number }>>,
  Assert<Equals<PlatformHealth["db"], { poolWaitP95Ms: number | null; lockPoolWaitP95Ms: number | null }>>,
  Assert<Equals<PlatformHealth["tick"], { lagP95Ms: number | null; skipped24h: number }>>,
  Assert<Equals<PlatformHealth["design"], { genomesBytes: number; shinglesBytes: number }>>,
  Assert<Equals<PlatformHealth["health"], { staleSnapshots: number; dirtyRows: number }>>,
  Assert<Equals<typeof exportsStore.requestStoreExport, (scope: StoreScope, by: { requestedAs: "member" | "platform"; requestedBy: string }) => Promise<{ jobId: string }>>>,
  Assert<Equals<typeof exportsStore.listExportJobs, (scope: StoreScope) => Promise<ExportJobSummary[]>>>,
  Assert<Equals<typeof exportsStore.exportPartStream, (scope: StoreScope, jobId: string, part: string) => Promise<ReadableStream | null>>>,
  Assert<Equals<typeof backup.listBackupRuns, () => Promise<BackupRunSummary[]>>>,
  Assert<Equals<typeof backup.backupFiles, (day: string) => Promise<{ name: string; path: string; bytes: number }[]>>>,
];
