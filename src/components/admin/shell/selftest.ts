/**
 * The shell's pure self-test (PLA-§O.1 `test:shell`, core §J.1; rev 6 P0b, CCR P2-1):
 *   npm run test:shell        (tsx src/components/admin/shell/selftest.ts; offline, no DB, no React render)
 *
 * Step p2-02 (viewer-locale rendering, core §I.5, D36): which screens render in the viewer's language
 * (`screenLocalesFor`), the fallback to English (`screenLocale`), the store-relative path (`storeRelativePath`), and
 * the settings tabs' labels in every locale (`settingsTabs` since p2-08). Later steps add their pure checks here (PLA-§O.1 row).
 *
 * Step p2-03 (the shell's pure logic): `modeSummary` / `roleSummary` agree with `modeAllows` / `can()`; the zero-data
 * brief gives `brief.empty`; the honest-data guards refuse dishonest props (type level and runtime); the banner order;
 * error-map exhaustiveness; chords never fire in editable fields or open overlays; the QR size math and the WhatsApp
 * text cap; the store-switch storage sweep; the shell health rules' fixtures with and without data, and a two-store
 * fixture with no cross-store evidence.
 *
 * Step p2-04 (reads and routes): the ⌘K orchestration (the budget, `slow`, a throwing provider, malformed and
 * off-store hits dropped, groups capped and de-duplicated, `?q=` bounds, the shell provider's matching), and the
 * installable dashboard (the manifest's fields and token colours, the icons' geometry, safe zone and colours).
 *
 * Step p2-05 (server actions, PLA-§M.1, §L): the Zod inputs of P2's actions. No store input takes a store id (core §E.3
 * rule 4: a `storeId` beside valid fields is refused, every schema strict); money is integer minor units and the price
 * before exists only above the price (PD23); phones are E.164 after the separators people type; every free text is
 * capped and cleaned; a refusal names catalog keys only (never a zod sentence); and every message key and refusal code
 * the action files name exists in ar, fr and en (D65).
 *
 * Step p2-06 (the shared primitives, PLA-§22.12): the runtime prop guards of ../common/primitive-logic.ts (the lock
 * reasons and the surface each opens, the usage meter's share and tones without a platform figure, byte formatting,
 * the wa.me link, middle truncation, the issue list's order and snooze split, the pager keeping filters, freshness,
 * whole-pixel QR modules of at least 4 px, the ring geometry, the skeleton's timing); the type-level refusal of a 0 for
 * a funnel step R1 cannot measure; and every message key the primitives name exists in ar, fr and en.
 *
 * Step p2-07 (the shell chrome): `usePulse`'s reducer (a status, review, kill-switch or re-acceptance change refreshes,
 * a new build shows the update once, a new health snapshot ticks the ring, finished jobs wait as "Ready · Open" once
 * each), the banners from the pulse within one body (PL-12), the ribbon's countdown on the corrected clock (two tabs
 * under a second apart), the bell's count and day groups and its dashboard-only links, the Help sheet's error ring and
 * its diagnostic block without a query string, the density default, the visit counter and the install offer, and every
 * key the chrome names in ar, fr and en.
 *
 * Step p2-08 (the palette and the navigation, UX-02, §I.3, SF-01): `commandsFor` over permission, mode and release
 * (the campaign entry hidden without `campaigns.write` and in store mode), the shell commands and their services, a
 * health fix's command (PD66); the nav per mode (hide, never delete), interim items yielding to their owner's, the
 * folded Settings entry and the registry-driven tabs; the chord listener's guards; the palette's query modes, typed
 * order ids, timing, local index, recents and suggestions.
 * Exits 1 on any failure.
 */
import {
  flatHits,
  foldSearch,
  inStoreHref,
  KIND_GROUPS,
  memberHits,
  OTHER_GROUP,
  runSearchProviders,
  SEARCH_GROUP_MAX,
  SearchQuery,
  settingHits,
  SHELL_MAX,
} from "@/app/api/app/[store]/search/run";
import type { SearchHit, SearchProvider } from "@/lib/admin-data/search/types";
import { APP_ICONS, appColors, appIconSvg, appManifest, GRID, markReach, MONOGRAM_BOX, MONOGRAM_S, SAFE_RADIUS, shortName } from "@/lib/admin-theme/app-icon";
import { contrastRatio, inOrangeBand, oklchToHex } from "@/lib/admin-theme/contrast";
import { generateColors, SURFACES } from "@/lib/admin-theme/generate";
import { ACTIVE_STORE_ROLES, can, STORE_ROLES, type StorePermission, type StoreRole } from "@/lib/auth/permissions";
import { addressQr, qrModules, qrSize, qrTarget, QR_SCREEN_PX_PER_MODULE, whatsappText, WA_TEXT_MAX } from "@/components/admin/common/address-math";
import {
  evidenceVars,
  funnelStep,
  funnelView,
  healthBand,
  healthFresh,
  healthRingView,
  honestKpi,
  kpiTileView,
  RATE_MIN_N,
  sparkSeries,
} from "@/components/admin/common/honest";
import { bulletHolds, MODE_BULLETS, modeSelectable, modeSummary } from "@/components/admin/common/mode-summary";
import { capabilityOf, ROLE_CAPABILITIES, ROLE_CAN_MAX, ROLE_CANNOT_MAX, roleSummary } from "@/components/admin/common/role-summary";
import { todayBrief, type BriefInput } from "@/components/admin/dashboard/brief";
import { celebrates, composeTiles, confirmationPct, funnelSteps, healthIssuesFor, pctChange, scoreHidden, unwireIssue, wireIssue, workLines } from "@/components/admin/dashboard/compose";
import { KILL_SWITCHES } from "@/lib/flags/registry";
import type { HealthInputs, HealthIssue } from "@/lib/health/types";
import { fixtures as shellFixtures, localSetupIssues, rules as shellRules, shellFactsOf } from "@/lib/health/rules/shell";
import { ADMIN_LOCALES, messageOf, t } from "@/lib/i18n/admin";
import { appHref } from "@/lib/urls";
import { modeAllows, STORE_MODES, type StoreMode } from "@/lib/tenancy/mode";
import type { ActionErrorCode, StoreRow, StoreScope } from "@/lib/tenancy/types";
import { dismissalActive, pickBanners, statePage, type BannerState } from "./banner-priority";
import { attachChords, createChordParser, GO_CHORDS, GO_KEY_OF, GO_ORDER, isEditable, orderIdOf, overlayOpen, shortcutSections, type ChordCommand, type ChordEvent, type ChordKey } from "./chords";
import { COMMANDS, commandsFor, type CommandCtx, type CommandDef } from "./commands";
import { commands as shellCommands } from "./commands/shell";
import type { NavContribution } from "./nav";
import {
  buildLocalIndex,
  commandForFix,
  goHrefs,
  LOCAL_INDEX_MAX,
  matchLocal,
  orderDrawerHref,
  paletteSuggestions,
  parsePaletteQuery,
  pushRecent,
  readRecents,
  RECENTS_KEPT,
  recentsKey,
  revealAt,
  SEARCH_DEBOUNCE_MS,
  SKELETON_AFTER_MS,
  SKELETON_MIN_MS as PALETTE_SKELETON_MIN_MS,
  skeletonVisible,
  SUGGESTIONS,
  SUGGESTIONS_MAX,
  writeRecents,
  type RecentEntry,
} from "./palette-logic";
import { provideShellServices } from "./shell-bridge";
import { clearStoreClientState, onStoreClientClear, storeKeyMatches } from "./client-state";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { FieldsError } from "@/lib/auth/errors";
import { Archetype } from "@/lib/page/schema";
import {
  cleanLine,
  cleanText,
  E164,
  handleTyped,
  MARK_READ_MAX,
  MarkReadInput,
  OnboardingDetailsInput,
  parseInput,
  REVIEW_FIELD_MAX,
  REVIEW_TEXT_MAX,
  STORE_ACTION_INPUTS,
  typedPrices,
  USER_ACTION_INPUTS,
} from "./action-inputs";
import { CORE_ERROR_CODES, errorUi, PLATFORM_ERROR_CODES, resultErrorUi, type CoreErrorCode } from "./error-map";
import { r1Funnel } from "@/components/admin/common/honest";
import type { LockReason } from "@/components/admin/common/locked-control";
import {
  deltaTone,
  formatDay,
  formatUsage,
  freshness,
  issueBuckets,
  lockView,
  middleTruncate,
  monogramInitials,
  pagerHref,
  qrPixels,
  ringGeometry,
  SKELETON_DELAY_MS,
  SKELETON_MIN_MS,
  usageView,
  waHref,
} from "@/components/admin/common/primitive-logic";
import { activeNav, screenLocale, screenLocalesFor, settingsTabs, shellContributions, sidebarNav, storeNav, storeRelativePath, tabLeadKey, TRILINGUAL_SCREENS } from "./store-nav";
import { INTERIM_NAV, nav as shellNav } from "./nav/t4";
import type { StorePulse } from "@/lib/pulse/types";
import { countVisit, defaultDensity, HELP_SECTIONS, helpSection, helpTipKeys, installOffer } from "./chrome-logic";
import { clearClientErrors, CLIENT_ERROR_RING, diagnosticText, recentClientErrors, recordClientError } from "./client-errors";
import {
  bellCount,
  CENTRE_CURSOR_DEPTH,
  centrePager,
  clockOffset,
  decodeCentreCursor,
  encodeCentreCursor,
  formatCountdown,
  groupByDay,
  initialPulseState,
  needsRefresh,
  notificationHref,
  pulseAge,
  pulseBanners,
  READY_MAX,
  reducePulse,
  remainingMs,
  ribbonEndsAt,
  statusReasonKey,
} from "./pulse-state";

let failures = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) passed++;
  else {
    failures++;
    console.error(`FAIL ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  }
}

const ALL = ADMIN_LOCALES.join();
const EN = "en";
const ready = (path: string) => TRILINGUAL_SCREENS.find((s) => s.path === path)?.ready === true;

/* ---- screenLocalesFor: the trilingual list and its exceptions ---- */
check("team is trilingual (T2's translated page)", screenLocalesFor("/team").join() === ALL);
check("a team sub-path follows its screen", screenLocalesFor("/team/members").join() === ALL);
check(
  "P4's agents stay English under the trilingual team",
  screenLocalesFor("/team/agents").join() === EN && screenLocalesFor("/team/agents/42").join() === EN,
);
check("P4's call center stays English", screenLocalesFor("/team/callcenter").join() === EN);
check("a sibling with a shared prefix is not the screen", screenLocalesFor("/teams").join() === EN && screenLocalesFor("/settings/generalx").join() === EN);
check(
  "other tracks' screens are English",
  ["/orders", "/pages", "/media", "/generate", "/settings/ai", "/settings/anti-spam", "/integrations/sheets"].every((p) => screenLocalesFor(p).join() === EN),
);
check("the overview follows its ready flag", screenLocalesFor("").join() === (ready("") ? ALL : EN));
check("the overview is matched exactly, not as a prefix of everything", !ready("") || screenLocalesFor("/orders").join() === EN);
check("query, hash and trailing slash are ignored", screenLocalesFor("/team/?tab=invites").join() === ALL && screenLocalesFor("/team#x").join() === ALL);
check(
  "every listed screen is a P2 route (PLA-§P.2)",
  TRILINGUAL_SCREENS.every(
    (s) => s.path === "" || /^\/(?:welcome|notifications|team|settings\/(?:general|market|plan|address|security|danger|audit))$/.test(s.path),
  ),
);
check(
  "a screen not yet ready keeps English",
  TRILINGUAL_SCREENS.filter((s) => !s.ready).every((s) => screenLocalesFor(s.path).join() === EN),
);

/* ---- screenLocale: the viewer's locale when supported, else English ---- */
check("supported locale wins", screenLocale("ar", ADMIN_LOCALES) === "ar" && screenLocale("fr", ADMIN_LOCALES) === "fr");
check("unsupported locale falls back to English", screenLocale("ar", ["en"]) === "en" && screenLocale("fr", ["en", "ar"]) === "en");

/* ---- storeRelativePath ---- */
check("the store home is the empty path", storeRelativePath("/app/atlas-argan", "/app/atlas-argan") === "");
check("a sub-path keeps its leading slash", storeRelativePath("/app/atlas-argan/team", "/app/atlas-argan") === "/team");
check("another store is not this store", storeRelativePath("/app/atlas-argan-2/team", "/app/atlas-argan") === null);
check("outside the dashboard is null", storeRelativePath("/app/account", "/app/atlas-argan") === null);

/* ---- the settings tabs (the registry's `settings` group): label and one-line description in ar / fr / en ---- */
for (const { item } of [...shellNav, ...INTERIM_NAV].filter((c) => c.group === "settings")) {
  for (const key of [item.label, tabLeadKey(item.label)]) {
    check(`settings ${item.id}: ${key} has a catalog key in ar, fr and en`, ADMIN_LOCALES.every((l) => messageOf(key, l) !== undefined), key);
  }
  check(`settings ${item.id} is translated`, messageOf(item.label, "ar") !== messageOf(item.label, "en"));
}


/* ================================================================ step p2-03: the shell's pure logic */

const inCatalogs = (key: string) => ADMIN_LOCALES.every((l) => messageOf(key, l) !== undefined);

/* ---- modeSummary agrees with modeAllows (PLA-§22.1.5) ---- */
for (const mode of STORE_MODES) {
  const sum = modeSummary(mode);
  check(`mode ${mode}: three bullets`, sum.get.length === 3 && new Set(sum.get).size === 3);
  check(
    `mode ${mode}: every bullet's feature is allowed in the mode`,
    MODE_BULLETS[mode].every((b) => b.needs.every((f) => modeAllows(mode, f))),
  );
  check(`mode ${mode}: title, line, bullets and the change-later line exist in ar/fr/en`, [sum.title, sum.line, ...sum.get, sum.later].every(inCatalogs));
  check(
    `mode ${mode}: no bullet claims a number, a price or a result`,
    ADMIN_LOCALES.every((l) => [sum.line, ...sum.get].every((k) => !/[0-9٠-٩%$€]|\b(?:MAD|DH|dhs?)\b/i.test(t(k, undefined, l)))),
  );
}
const featureSet = (m: (typeof STORE_MODES)[number]) => [...new Set(MODE_BULLETS[m].flatMap((b) => b.needs))].sort().join();
check("the three modes' bullet sets differ", new Set(STORE_MODES.map((m) => modeSummary(m).get.join())).size === 3);
check("the three modes promise different feature sets", new Set(STORE_MODES.map(featureSet)).size === 3, STORE_MODES.map(featureSet));
check("a landing store is never promised a catalog", !bulletHolds("landing", { key: "x", needs: ["catalog"] }));
check(
  "landing is R1 and selectable; store and both are R2",
  modeSummary("landing").release === "R1" && modeSummary("store").release === "R2" && modeSummary("both").release === "R2" && modeSelectable("landing"),
);

/* ---- roleSummary agrees with can() for every active role (TN-08, TN-12) ---- */
check(
  "R1 offers exactly the active roles",
  !ACTIVE_STORE_ROLES.includes("logistics") && !ACTIVE_STORE_ROLES.includes("accountant") && ACTIVE_STORE_ROLES.includes("viewer"),
);
const capOfKey = (key: string) => ROLE_CAPABILITIES.find((c) => key.endsWith(`.${c.id}`))!;
for (const role of ACTIVE_STORE_ROLES) {
  const sum = roleSummary(role);
  check(`role ${role}: at most 4 can and 3 can't`, sum.can.length <= ROLE_CAN_MAX && sum.cannot.length <= ROLE_CANNOT_MAX && sum.can.length >= 1);
  check(`role ${role}: every "Can" holds in the matrix`, sum.can.every((k) => capOfKey(k).keys.every((p) => can(role, p))), sum.can);
  check(`role ${role}: every "Can't" holds in the matrix`, sum.cannot.every((k) => capabilityOf(role, capOfKey(k)) === false), sum.cannot);
  check(`role ${role}: no capability is both`, sum.can.every((k) => !sum.cannot.some((c) => c.endsWith(`.${capOfKey(k).id}`))));
  check(`role ${role}: label, line and bullets exist in ar/fr/en`, [sum.label, sum.line, ...sum.can, ...sum.cannot].every(inCatalogs));
}
check(
  "a role that sees every order without handling them (accountant) is described by neither bullet",
  STORE_ROLES.filter((r) => can(r, "orders.read_all") && !can(r, "orders.write")).every((r) => capabilityOf(r, capOfKey("x.orders_all")) === null),
);
check("the owner has no \"Can't\"", roleSummary("owner").cannot.length === 0);
check(
  "an agent can't see every order",
  roleSummary("agent").cannot.includes("team.role.cannot.orders_all") && roleSummary("agent").can.includes("team.role.can.orders_own"),
);
check("a viewer can't see customer details", roleSummary("viewer").cannot.includes("team.role.cannot.customers"));
check(
  "every capability has its can and can't keys",
  ROLE_CAPABILITIES.every((c) => inCatalogs(`team.role.can.${c.id}`) && inCatalogs(`team.role.cannot.${c.id}`)),
);

/* ---- the Today brief (SF-11, PLA-§22.17 item 1) ---- */
const H = "atlas-argan";
const brief = (p: Partial<BriefInput>) => todayBrief({ kpisToday: null, queue: null, worstIssue: null, href: (path) => appHref(H, path), ...p });
const ZERO_KPIS = { placed: 0, confirmed: 0, lastOrderAt: null };
const zero = brief({ kpisToday: ZERO_KPIS, queue: { queueNow: 0, dueCallbacks: 0 } });
check("zero data gives brief.empty, alone", zero.length === 1 && zero[0]!.key === "brief.empty" && zero[0]!.href === `/app/${H}/pages`, zero);
check("zero data without the queue source still gives brief.empty", brief({ kpisToday: ZERO_KPIS }).map((l) => l.key).join() === "brief.empty");
check("nothing readable gives no line (never \"No orders yet\" unmeasured)", brief({}).length === 0);
const ISSUE = { text: "Customers have no way to reach you", href: `/app/${H}/settings/general` };
check("unavailable order sources leave only the health line", brief({ worstIssue: ISSUE }).map((l) => l.key).join() === "brief.health");
const SOME = { placed: 4, confirmed: 1, lastOrderAt: "2026-10-28T09:00:00Z" };
const full = brief({ kpisToday: SOME, queue: { queueNow: 3, dueCallbacks: 2 }, worstIssue: ISSUE });
check("orders, health and queue lines in that order", full.map((l) => l.key).join() === "brief.orders,brief.health,brief.queue", full);
check("the orders line carries the real counts", full[0]!.vars.confirmed === 1 && full[0]!.vars.callbacks === 2 && full[0]!.href === `/app/${H}/orders`);
check("the health line links to the issue's fix", full[1]!.href === ISSUE.href && full[1]!.vars.issue === ISSUE.text);
const noQueue = brief({ kpisToday: SOME });
check(
  "without the queue source: confirmed only, no callbacks 0 and no queue line",
  noQueue.map((l) => l.key).join() === "brief.confirmed" && !("callbacks" in noQueue[0]!.vars),
);
const opp = { a: "Pack 2", b: "pack 1", rateA: 71, rateB: 58, href: `/app/${H}/orders` };
check(
  "the opportunity line needs n ≥ 30",
  brief({ kpisToday: SOME, queue: { queueNow: 3, dueCallbacks: 0 }, opportunity: { ...opp, n: 29 } }).at(-1)!.key === "brief.queue",
);
check(
  "with n = 30 the opportunity line replaces the queue line",
  brief({ kpisToday: SOME, queue: { queueNow: 3, dueCallbacks: 0 }, opportunity: { ...opp, n: 30 } }).at(-1)!.key === "brief.opportunity",
);
check("never more than three lines", full.length <= 3);
check("a malformed count is unavailable, not 0", brief({ kpisToday: { placed: Number.NaN, confirmed: 1, lastOrderAt: null } }).length === 0);
check(
  "every brief key exists in ar/fr/en",
  ["brief.empty", "brief.orders", "brief.confirmed", "brief.callbacks", "brief.queue", "brief.health", "brief.opportunity"].every(inCatalogs),
);

/* ---- honest-data guards (PLA-§22.18 rule 3) ---- */
// @ts-expect-error a rate tile without its sample size does not type-check
honestKpi({ kind: "rate", label: "Confirmed", value: "58", hint: "of placed orders" });
honestKpi({ kind: "count", label: "Orders placed", value: "12", hint: "7 days" });
const rateNoN = kpiTileView({ kind: "rate", label: "Confirmed", value: "58", hint: "" });
check(
  "a rate without n is refused and shows no number",
  rateNoN.value === null && rateNoN.refused.includes("rate_without_n") && rateNoN.needs?.vars.count === RATE_MIN_N,
);
const rateSmall = kpiTileView({ kind: "rate", label: "Confirmed", value: "58", hint: "", n: 12 });
check(
  "a rate below 30 orders shows 'Needs 30 orders'",
  rateSmall.value === null && rateSmall.needs?.key === "shell.honest.needs_orders" && t(rateSmall.needs.key, rateSmall.needs.vars) === "Needs 30 orders",
);
check("a rate with n ≥ 30 shows its value", kpiTileView({ kind: "rate", label: "Confirmed", value: "58", hint: "", n: 43 }).value === "58");
check("an impossible rate is refused", kpiTileView({ kind: "rate", label: "x", value: "140", hint: "", n: 43 }).refused.includes("rate_out_of_range"));
check("a count needs no n", kpiTileView({ kind: "count", label: "x", value: "12", hint: "" }).refused.length === 0);
check(
  "a sparkline under 7 points is not drawn",
  sparkSeries([1, 2, 3, 4, 5, 6]).points === null && sparkSeries([1, 2, 3, 4, 5, 6]).refused[0] === "spark_too_short",
);
check("a sparkline of 7 points is drawn", sparkSeries([1, 2, 3, 4, 5, 6, 7]).points?.length === 7);
check("a sparkline with a gap is not drawn", sparkSeries([1, 2, Number.NaN, 4, 5, 6, 7]).points === null);
check(
  "a funnel step without data is null, never 0",
  funnelStep("shipped", "Shipped", undefined).value === null && funnelStep("shipped", "Shipped", Number.NaN).value === null && funnelStep("orders", "Orders", 0).value === 0,
);
const funnel = funnelView(
  [
    { id: "orders", label: "Orders", value: 40 },
    { id: "confirmed", label: "Confirmed", value: 30, rate: 99 },
    { id: "shipped", label: "Shipped", value: 0 },
    { id: "delivered", label: "Delivered", value: null, rate: 50 },
    { id: "collected", label: "Collected", value: null },
  ],
  ["shipped", "delivered", "collected"],
);
check("a 0 for a step the release cannot measure is refused into the R2 line", funnel.rows[2]!.value === null && funnel.refused.includes("funnel_zero_for_missing"));
check("a rate without a value is refused", funnel.refused.includes("funnel_rate_without_value") && funnel.rows[3]!.rate === null);
check("rates are recomputed from the counts", funnel.rows[1]!.rate === 75 && funnel.rows[0]!.rate === null);
check("below 5 data points the funnel is a table", funnel.asTable && inCatalogs(funnel.missingKey));
check("a null score is the computing state", healthRingView({ score: null }).state === "computing");
check(
  "an impossible score is refused into the computing state",
  healthRingView({ score: 101 }).state === "computing" && healthRingView({ score: 50.5 }).refused[0] === "score_out_of_range",
);
check(
  "bands at 80 / 50 / 30",
  healthBand(80) === "good" && healthBand(79) === "fair" && healthBand(50) === "fair" && healthBand(49) === "low" && healthBand(30) === "low" && healthBand(29) === "poor",
);
const NOW3 = new Date("2026-10-28T10:00:00Z");
check(
  "freshness follows staleAfterMin",
  healthFresh("2026-10-28T09:30:00Z", 45, NOW3) && !healthFresh("2026-10-28T09:00:00Z", 45, NOW3) && !healthFresh(null, 45, NOW3),
);
check(
  "issue sentence variables are the evidence numbers",
  JSON.stringify(evidenceVars({ metric: "m", value: 2, window: "now", n: 4 })) === JSON.stringify({ value: 2, count: 2, n: 4, window: "now" }),
);

/* ---- the banner order (PLA-§22.8) ---- */
const BASE: BannerState = { status: "active", role: "owner", reason: null, kill: [] };
const everything: BannerState = {
  ...BASE,
  kill: ["uploads_enabled", "platform_read_only", "capi_enabled", "signups_enabled"],
  membersWithout2fa: 2,
  quota: [
    { metric: "media_bytes", used: 84, limit: 100 },
    { metric: "pages", used: 9, limit: 10 },
    { metric: "ai_credits_director", used: 99, limit: 100 },
  ],
};
const ids = (s: BannerState) => pickBanners(s).map((b) => b.id).join();
const TAIL = "platform_read_only,kill:capi_enabled,kill:uploads_enabled,require_2fa,quota:pages";
check("suspended first, then read-only, kill switches, 2FA, quota", ids({ ...everything, status: "suspended" }) === `suspended,${TAIL}`, ids({ ...everything, status: "suspended" }));
check("closed (owner) before the platform banners", ids({ ...everything, status: "closed" }) === `closed,${TAIL}`);
check("restricted before the platform banners", ids({ ...everything, status: "restricted" }) === `restricted,${TAIL}`);
check("pending before the platform banners", ids({ ...everything, status: "pending" }) === `pending,${TAIL}`);
check("an active store shows only the platform banners", ids({ ...everything }) === TAIL);
check("sign-ups paused is not a store banner", !ids(everything).includes("signups"));
check("the fullest meter ≥ 80 % wins; an AI sub-budget is not a store banner", pickBanners(everything).at(-1)!.vars.percent === 90);
check(
  "79 % and unlimited meters show nothing",
  ids({ ...BASE, quota: [{ metric: "pages", used: 79, limit: 100 }, { metric: "media_bytes", used: 999, limit: null }] }) === "",
);
check(
  "closed is a page for members other than owner and admin",
  statePage("closed", "agent") === "closed" && ids({ ...BASE, status: "closed", role: "agent" }) === "" && statePage("closed", "admin") === null,
);
check(
  "deletion and rejection are pages",
  statePage("scheduled_deletion", "owner") === "deletion" && statePage("rejected", "owner") === "rejected" && statePage("active", "owner") === null,
);
const dismissedAll = new Set(["suspended", "platform_read_only", "kill:capi_enabled", "kill:uploads_enabled", "require_2fa", "quota:pages"]);
check("dismissing hides informational banners only", ids({ ...everything, status: "suspended", dismissed: dismissedAll }) === "suspended,platform_read_only");
check(
  "state and read-only banners are not dismissible",
  pickBanners({ ...everything, status: "restricted" }).every((b) => b.dismissible === !["restricted", "platform_read_only"].includes(b.id)),
);
check("a dismissal lasts 24 h", dismissalActive(0, 23 * 3_600_000) && !dismissalActive(0, 24 * 3_600_000) && !dismissalActive(Number.NaN, 0));
check(
  "every banner key and quota meter name exists in ar/fr/en",
  pickBanners({ ...everything, status: "suspended" }).every((b) => inCatalogs(b.key) && Object.values(b.varKeys ?? {}).every(inCatalogs)) &&
    KILL_SWITCHES.filter((k) => k !== "signups_enabled").every((k) => inCatalogs(`shell.kill.${k}`)),
);

/* ---- error map exhaustiveness (PLA-§22.8, §E.2, D65) ---- */
type Literals<T> = T extends string ? (string extends T ? never : T) : never;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const coreIsTheUnion: Same<Literals<ActionErrorCode>, CoreErrorCode> = true;
check("CORE_ERROR_CODES is the §E.2 union", coreIsTheUnion && new Set(CORE_ERROR_CODES).size === 16);
const keyOf = (u: ReturnType<typeof errorUi>) => ("key" in u ? u.key : null);
for (const code of [...CORE_ERROR_CODES, ...PLATFORM_ERROR_CODES]) {
  const u = errorUi(code, { where: "action", ref: "E-42" });
  const k = keyOf(u);
  check(`error ${code} has a surface whose sentence exists in ar/fr/en`, k === null || inCatalogs(k), u);
  if (code !== "server") check(`error ${code} is not the generic message`, k !== "shell.err.generic", u);
}
check(
  "server is the generic message with its reference",
  JSON.stringify(errorUi("server", { ref: "E-42" })) === JSON.stringify({ ui: "toast", key: "shell.err.generic", vars: { ref: "E-42" } }),
);
check("not_found: the shell 404 on a page, a toast on an action", errorUi("not_found", { where: "page" }).ui === "page_not_found" && errorUi("not_found").ui === "toast");
check(
  "read_only names the state",
  keyOf(errorUi("read_only", { status: "suspended" })) === "shell.err.read_only.suspended" &&
    keyOf(errorUi("read_only", { status: "active", kill: ["platform_read_only"] })) === "shell.kill.platform_read_only",
);
check(
  "the gate refusals open the publish dialog with their items, never a toast",
  (["design_blocked", "honesty_blocked", "budget_blocked"] as const).every((c) => {
    const u = resultErrorUi({ error: c, items: [{ id: "g1" } as never] });
    return u.ui === "publish_dialog" && u.items.length === 1;
  }),
);
const chip = resultErrorUi({ error: "job_queued", jobId: "j-7" });
check("job_queued goes to the job chip with its job", chip.ui === "job_chip" && chip.jobId === "j-7");
const stepUp = errorUi("step_up", { opId: "op-1" });
check("step_up re-runs with the same opId", stepUp.ui === "step_up" && stepUp.opId === "op-1");
const pendingAi = errorUi("quota_platform_pending");
check("quota_platform_pending is the limit sheet without 'Ask for more'", pendingAi.ui === "limit_sheet" && pendingAi.variant === "pending_ai");
const brand = errorUi("brand_protected");
check("brand_protected is the limit sheet's brand variant", brand.ui === "limit_sheet" && brand.variant === "brand");
check("busy from sign-in is auth.busy", keyOf(errorUi("busy", { source: "auth" })) === "auth.busy" && keyOf(errorUi("busy")) === "shell.err.busy");
check(
  "a part code with a sentence renders it in the generic sheet",
  JSON.stringify(errorUi("already_requested")) === JSON.stringify({ ui: "sheet", key: "error.already_requested" }),
);
check(
  "an unknown code is the generic message, never the raw code",
  ["frobnicate", "<script>", "", "x".repeat(60)].every((c) => keyOf(errorUi(c, { ref: "E-1" })) === "shell.err.generic"),
);
check("a hostile reference is never echoed", JSON.stringify(errorUi("zzz", { ref: "<img src=x>" })).includes('"ref":"-"'));

/* ---- chords never fire in editable fields or open overlays (PLA-§22.13) ---- */
let clockMs = 0;
const parser = createChordParser(() => clockMs);
const key = (k: string, extra: Partial<ChordKey> = {}): ChordKey => ({ key: k, editable: false, overlay: false, ...extra });
const feed = (k: string, extra?: Partial<ChordKey>) => parser.feed(key(k, extra));
const go = (first: string, second: string, gap = 300, extra?: Partial<ChordKey>) => {
  parser.reset();
  feed(first);
  clockMs += gap;
  return parser.feed(key(second, extra));
};
check(
  "every G chord reaches its target",
  Object.entries(GO_CHORDS).every(([k, target]) => JSON.stringify(go("g", k)) === JSON.stringify({ kind: "go", target })),
);
check("G chords ignore case", JSON.stringify(go("G", "O")) === JSON.stringify({ kind: "go", target: "orders" }));
check("the window is 1 s", go("g", "o", 1_000) !== null && go("g", "o", 1_001) === null);
const gc = go("g", "c");
check("G then C is customers, not Create", gc?.kind === "go" && gc.target === "customers");
parser.reset();
check(
  "C, ?, / and > open create, shortcuts, search and actions",
  feed("c")?.kind === "create" && feed("?")?.kind === "shortcuts" && feed("/")?.kind === "search" && feed(">")?.kind === "actions",
);
check("screen keys pass through (N, 1-6, E, Enter, Esc, J/K)", ["n", "1", "6", "e", "Enter", "Escape", "j", "k"].every((k) => feed(k) === null));
check("nothing fires in an editable field", feed("c", { editable: true }) === null && go("g", "o", 100, { editable: true }) === null);
parser.reset();
feed("g", { editable: true });
check("a G typed in a field arms nothing", feed("o") === null);
check("nothing fires while an overlay is open", feed("c", { overlay: true }) === null && go("g", "o", 100, { overlay: true }) === null);
check(
  "modifiers, repeats and IME compositions never fire",
  feed("c", { ctrlKey: true }) === null &&
    feed("c", { metaKey: true }) === null &&
    feed("c", { altKey: true }) === null &&
    feed("c", { repeat: true }) === null &&
    feed("c", { isComposing: true }) === null,
);
parser.reset();
feed("g");
clockMs += 200;
check("pending shows while G waits", parser.pending());
clockMs += 900;
check("pending ends with the window", !parser.pending());
const el = (opts: { editable?: boolean; match?: boolean }) => ({ isContentEditable: !!opts.editable, closest: () => (opts.match ? {} : null) }) as unknown as EventTarget;
check(
  "isEditable: inputs and contenteditable yes, a button no, null no",
  isEditable(el({ match: true })) && isEditable(el({ editable: true })) && !isEditable(el({})) && !isEditable(null) && !isEditable({} as EventTarget),
);
check(
  "overlayOpen: an open dialog yes, none no, no document no",
  overlayOpen({ querySelector: () => ({}) as Element }) && !overlayOpen({ querySelector: () => null }) && !overlayOpen(null),
);
check(
  "a typed order id is recognised, trimmed and upper-cased",
  orderIdOf(" ab12-cdef9 ") === "AB12-CDEF9" &&
    orderIdOf("A-1234") === null &&
    orderIdOf("ABCDEFGHI-1234") === null &&
    orderIdOf("AB-123") === null &&
    orderIdOf("AB-1234567890123") === null &&
    orderIdOf("+212600000000") === null,
);

/* ---- QR size math and the WhatsApp text cap (DES-§16.12, PLA-§L) ---- */
const SHORT = "https://sg.example/go/a7Kx9Q2"; // ≈ 30 characters
const LONG = "https://lightgreen-hippopotamus-140853.hostingersite.com/s/atlas"; // ≈ 60 characters
const mShort = qrModules(SHORT)!;
const mLong = qrModules(LONG)!;
check("a short /go/ URL is version 2-3 (25-29 modules)", mShort >= 25 && mShort <= 29, mShort);
check("a store URL is version 4-5 (33-37 modules)", mLong >= 33 && mLong <= 37, mLong);
check("modules × 4 px plus the 4-module quiet zone", JSON.stringify(qrSize(25)) === JSON.stringify({ modules: 25, codePx: 100, screenPx: 132, pngPx: 264 }));
check("≥ 4 px per module on screen by construction", [mShort, mLong].every((m) => qrSize(m).codePx / m >= QR_SCREEN_PX_PER_MODULE));
check("the PNG is drawn at 8 px per module", qrSize(mLong).pngPx === (mLong + 8) * 8);
check("the short URL is preferred, a blank one is not", qrTarget(LONG, SHORT) === SHORT && qrTarget(LONG, "  ") === LONG && qrTarget(LONG, null) === LONG);
check(
  "addressQr sizes the code it encodes",
  addressQr(LONG, SHORT).value === SHORT && addressQr(LONG, SHORT).size?.modules === mShort && addressQr("", null).size === null,
);
const tpl = messageOf("shell.address.wa_text", "en")!;
check("the WhatsApp text is '{store}: {url}'", whatsappText(tpl, "Atlas Argan", LONG) === `Atlas Argan: ${LONG}`);
const capped = whatsappText(tpl, "متجر ".repeat(120), LONG);
check(
  "the WhatsApp text is capped at 300 characters with the URL whole",
  [...capped].length <= WA_TEXT_MAX && capped.endsWith(LONG) && capped.includes("…"),
  [...capped].length,
);
check(
  "every locale's WhatsApp template has {store} and {url}",
  ADMIN_LOCALES.every((l) => /\{store\}/.test(messageOf("shell.address.wa_text", l)!) && /\{url\}/.test(messageOf("shell.address.wa_text", l)!)),
);

/* ---- client state on a store switch (PLA-§22.3) ---- */
class FakeStorage implements Storage {
  private m = new Map<string, string>();
  constructor(keys: string[]) {
    for (const k of keys) this.m.set(k, "1");
  }
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  keys() {
    return [...this.m.keys()].sort().join();
  }
}
check(
  "the switch's keys: this store and member only",
  storeKeyMatches("bld:unsaved:s1:u1:p9:design", "s1", "u1") &&
    storeKeyMatches("bld:unsaved:u1:s1:p9:design", "s1", "u1") &&
    storeKeyMatches("sg:s1:u1:generate:v2", "s1", "u1") &&
    storeKeyMatches("sg:gen:s1:v2", "s1", "u1") &&
    !storeKeyMatches("bld:unsaved:s2:u1:p9:design", "s1", "u1") &&
    !storeKeyMatches("bld:unsaved:s1:u2:p9:design", "s1", "u1") &&
    !storeKeyMatches("sg:s10:u1:generate:v2", "s1", "u1") &&
    !storeKeyMatches("sg:s1:u1", "s1", "u1") &&
    !storeKeyMatches("sg-theme", "s1", "u1") &&
    !storeKeyMatches("bld:unsaved:s1:u1:x", "", "u1"),
);
const local = new FakeStorage(["bld:unsaved:s1:u1:p1:design", "bld:unsaved:s2:u1:p1:design", "bld:unsaved:s1:u2:p1:design", "sg-density"]);
const session = new FakeStorage(["sg:s1:u1:generate:v2", "sg:s1:u1:generate:copy:v1", "sg:gen:s1:v2", "sg:s2:u1:generate:v2"]);
const cleaned: string[] = [];
const off1 = onStoreClientClear((sid) => {
  throw new Error(`boom ${sid}`);
});
const off2 = onStoreClientClear((sid, uid) => cleaned.push(`${sid}/${uid}`));
const report = clearStoreClientState("s1", "u1", { local: () => local, session: () => session });
check(
  "the store's drafts go, other stores' and members' stay",
  local.keys() === "bld:unsaved:s1:u2:p1:design,bld:unsaved:s2:u1:p1:design,sg-density" && session.keys() === "sg:s2:u1:generate:v2",
  { l: local.keys(), s: session.keys() },
);
check("registered caches are cleared even when one throws", report.storageKeys === 4 && report.cleaners === 1 && cleaned.join() === "s1/u1", report);
off1();
off2();
const blocked = (): Storage => {
  throw new Error("SecurityError");
};
check("a blocked storage clears nothing and throws nothing", clearStoreClientState("s1", "u1", { local: blocked, session: blocked }).storageKeys === 0);

/* ---- the shell's health rules (PLA-§6.3.2, SF-03) ---- */
function storeRow(id: string, handle: string): StoreRow {
  return {
    id,
    handle,
    name: handle,
    mode: "landing",
    status: "active",
    planId: "free",
    market: "MA",
    currency: "MAD",
    timezone: "Africa/Casablanca",
    defaultLocale: "fr",
    homePageId: null,
    brandSeed: "seed",
    catalogVersion: 1,
    addressVersion: 1,
    requireMember2fa: false,
    primaryDomain: null,
  };
}
function baseInputs(id: string, handle: string, over: Partial<HealthInputs> = {}): HealthInputs {
  return {
    store: storeRow(id, handle),
    now: NOW3,
    slaHours: null,
    pages: null,
    brand: null,
    abuseReports: null,
    orders: null,
    integrations: null,
    sheets: null,
    ai: null,
    design: null,
    usage: null,
    settings: null,
    members: null,
    review: null,
    zones: null,
    ...over,
  };
}
const scope3 = (storeId: string) => ({ storeId, kind: "system" }) as unknown as StoreScope;
const POINTS = { 1: 3, 2: 6, 3: 10 } as const;
const issueOk = (i: HealthIssue, handle: string) =>
  i.group === "setup" &&
  i.points === POINTS[i.severity] &&
  Number.isInteger(i.evidence.n) &&
  i.evidence.n >= 1 &&
  Number.isFinite(i.evidence.value) &&
  Object.keys(i.evidence).every((k) => ["metric", "value", "baseline", "window", "n"].includes(k)) &&
  i.fix.kind === "link" &&
  i.fix.href(handle).startsWith(`/app/${handle}/settings/`) &&
  inCatalogs(i.text) &&
  inCatalogs(i.fix.label);

async function ruleChecks(): Promise<void> {
  check("the shell rules are exactly contact, legal_identity and 2fa_orders", shellRules.map((r) => r.id).join() === "shell:contact,shell:legal_identity,shell:2fa_orders");
  check("no shell rule duplicates landing's live-page rule", shellRules.every((r) => !/page/.test(r.id)));
  check("every rule has one fixture", shellFixtures.map((f) => f.rule).sort().join() === shellRules.map((r) => r.id).sort().join());
  for (const fx of shellFixtures) {
    const rule = shellRules.find((r) => r.id === fx.rule)!;
    const t0 = performance.now();
    const fired = await rule.collect(scope3("s-a"), baseInputs("s-a", "atlas", fx.fires));
    const took = performance.now() - t0;
    const silent = await rule.collect(scope3("s-a"), baseInputs("s-a", "atlas", fx.silent));
    check(`${fx.rule} fires on its fixture`, fired !== null && fired.severity === fx.expect?.severity && fired.evidence.metric === fx.expect?.metric, fired);
    check(`${fx.rule} is well formed (points, n, fix, keys)`, fired !== null && issueOk(fired, "atlas"), fired);
    check(`${fx.rule} is silent on its silent fixture`, silent === null, silent);
    check(`${fx.rule} is silent without its source`, (await rule.collect(scope3("s-a"), baseInputs("s-a", "atlas"))) === null);
    check(`${fx.rule} stays within 40 ms`, took <= 40, took);
  }
  const fixHref = async (id: string) => {
    const fx = shellFixtures.find((f) => f.rule === id)!;
    const issue = await shellRules.find((r) => r.id === id)!.collect(scope3("s"), baseInputs("s", "h", fx.fires));
    return issue?.fix.kind === "link" ? issue.fix.href("h") : null;
  };
  check(
    "contact and legal identity link to General, 2FA to Security",
    (await fixHref("shell:contact")) === "/app/h/settings/general" &&
      (await fixHref("shell:legal_identity")) === "/app/h/settings/general" &&
      (await fixHref("shell:2fa_orders")) === "/app/h/settings/security",
  );

  // two stores: each store's issues carry its own numbers only
  const settingsOf = (store: Record<string, unknown>) => ({ store: { country: "MA", socials: {}, confirmation: {}, ...store } }) as unknown as HealthInputs["settings"];
  const A = baseInputs("s-a", "atlas", { settings: settingsOf({}), members: { total: 5, withoutTotpWithOrdersReadAll: 3, lastActiveAt: null, lastLoginAt: null } });
  const B = baseInputs("s-b", "berber", {
    settings: settingsOf({ phone: "+212600000002", legalName: "Berber SARL" }),
    members: { total: 2, withoutTotpWithOrdersReadAll: 0, lastActiveAt: null, lastLoginAt: null },
  });
  const runAll = async (inputs: HealthInputs) =>
    (await Promise.all(shellRules.map((r) => r.collect(scope3(inputs.store.id), inputs)))).filter((i): i is HealthIssue => i !== null);
  const a1 = await runAll(A);
  const b1 = await runAll(B);
  const a2 = await runAll(A);
  check("store A gets its three issues", a1.map((i) => i.id).join() === "shell:contact,shell:legal_identity,shell:2fa_orders", a1.map((i) => i.id));
  check("store B, complete, gets none", b1.length === 0, b1);
  const twoFa = a1.find((i) => i.id === "shell:2fa_orders");
  check("A's 2FA evidence is A's count, not B's", twoFa?.evidence.value === 3 && twoFa.evidence.n === 5);
  check("running B between two runs of A changes nothing (no shared state)", JSON.stringify(a1.map((i) => i.evidence)) === JSON.stringify(a2.map((i) => i.evidence)));
  check("A's fixes point at A's handle", a1.every((i) => i.fix.kind === "link" && i.fix.href(A.store.handle).startsWith("/app/atlas/")));

  // the synchronous client pass agrees with the server rules
  const local3 = localSetupIssues(shellFactsOf(A));
  check("localSetupIssues finds the same issues as the rules", local3.map((i) => i.id).sort().join() === a1.map((i) => i.id).sort().join());
  check("localSetupIssues orders by points (contact first)", local3[0]?.id === "shell:contact");
  check("localSetupIssues of a complete store is empty", localSetupIssues(shellFactsOf(B)).length === 0);
  check("localSetupIssues without facts is empty (never a guess)", localSetupIssues({ contact: null, legalName: undefined, members: null }).length === 0);
  check("a blank phone is no phone", localSetupIssues({ contact: { phone: "  ", whatsapp: null }, legalName: "x", members: null })[0]?.id === "shell:contact");
}

/* ---- ⌘K search orchestration (PLA-§22.13, UX-02; step p2-04) ---- */
async function searchChecks(): Promise<void> {
  const HOME = appHref("atlas");
  const scopeA = { storeId: "s-atlas", kind: "member" } as unknown as StoreScope;
  const viewer = { userId: "u-owner", role: "owner" as const };
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const hit = (id: string, kind: string, extra: Partial<SearchHit> = {}): SearchHit => ({ id, kind, title: `T ${id}`, href: appHref("atlas", `/x/${id}`), ...extra });
  const seen: { q: string; userId: string; role: string; storeId: string }[] = [];
  const pages: SearchProvider = {
    id: "landing",
    kinds: ["page", "lead"],
    search: async (scope, q, v) => {
      seen.push({ q, userId: v.userId, role: v.role, storeId: scope.storeId });
      return [hit("p1", "page"), hit("p1", "page"), hit("l1", "lead", { group: "landing.cmdk.leads" }), hit("bad", "order"), hit("x", "page", { href: "/app/other-store/pages" }), hit("y", "page", { href: "https://evil.example/app/atlas" }), { id: "", kind: "page", title: "", href: HOME } as SearchHit];
    },
  };
  let slowFinished = false;
  const slowOps: SearchProvider = {
    id: "ops",
    kinds: ["order", "customer"],
    search: async () => {
      await wait(80);
      slowFinished = true;
      return [hit("o1", "order")];
    },
  };
  const broken: SearchProvider = {
    id: "design",
    kinds: ["page"],
    search: () => {
      throw new Error("boom");
    },
  };
  const many: SearchProvider = { id: "many", kinds: ["setting"], search: async () => Array.from({ length: 20 }, (_, i) => hit(`s${i}`, "setting")) };
  const t0 = performance.now();
  const { result, failures } = await runSearchProviders([pages, slowOps, broken, many], scopeA, "argan", viewer, { budgetMs: 40, home: HOME });
  const took = performance.now() - t0;
  check("the search answers at the budget, before the slow provider ends", took < 75 && !slowFinished, took);
  check("the slow provider is named in slow with its groups", result.slow.some((s) => s.id === "ops" && s.groups.join() === "shell.cmdk.group.orders,shell.cmdk.group.customers"), result.slow);
  check("a throwing provider is dropped, named in slow, and its failure returned", result.slow.some((s) => s.id === "design") && failures.some((f) => f.id === "design" && f.reason === "error") && failures.some((f) => f.id === "ops" && f.reason === "timeout"), failures);
  const pageGroup = result.groups.find((g) => g.id === "shell.cmdk.group.pages");
  check("hits are de-duplicated, of the provider's kinds, and link into this store only", pageGroup?.hits.map((h) => h.id).join() === "p1", pageGroup);
  check("a provider's own group label is kept", result.groups.some((g) => g.label === "landing.cmdk.leads" && g.hits[0]?.id === "l1"));
  check(`a group keeps at most ${SEARCH_GROUP_MAX} hits`, result.groups.find((g) => g.id === "shell.cmdk.group.settings")?.hits.length === SEARCH_GROUP_MAX);
  check("providers get the store's scope, the query and the viewer, nothing else", seen.length === 1 && seen[0]!.storeId === "s-atlas" && seen[0]!.q === "argan" && seen[0]!.role === "owner" && seen[0]!.userId === "u-owner");
  check("the answer is JSON-safe ({ groups, slow })", Object.keys(JSON.parse(JSON.stringify(result))).sort().join() === "groups,slow");
  check("flatHits lists the hits in group order", flatHits(result)[0]?.id === "p1");
  check(
    "inStoreHref: the store's root, paths, queries and fragments only",
    inStoreHref(HOME, HOME) &&
      inStoreHref(`${HOME}/orders?order=AB-1234`, HOME) &&
      inStoreHref(`${HOME}?x=1`, HOME) &&
      !inStoreHref(`${HOME}-evil/orders`, HOME) &&
      !inStoreHref("/app/berber/orders", HOME) &&
      !inStoreHref(`${HOME}//evil.example`, HOME) &&
      !inStoreHref(`https://x.example${HOME}`, HOME) &&
      !inStoreHref(`${HOME}/a\\b`, HOME) &&
      !inStoreHref(42, HOME),
  );
  check("no provider at all answers empty", JSON.stringify((await runSearchProviders([], scopeA, "argan", viewer, { budgetMs: 40, home: HOME })).result) === '{"groups":[],"slow":[]}');

  // ?q= (2-60 characters once trimmed)
  const q = (v: unknown) => SearchQuery.safeParse(v);
  check("q: 2-60 characters, trimmed and spaces collapsed", q("  ar ").success && q("a".repeat(60)).success && q("  argan   oil ").data === "argan oil");
  check("q: too short, too long or not a string is refused", !q("a").success && !q(" a ").success && !q("a".repeat(61)).success && !q(null).success && !q(7).success);

  // the shell provider's matching: settings by label in any language, members only by name or e-mail
  const owner = { can: (p: string) => p === "settings.read" || p === "audit.read", locale: "fr" as const, handle: "atlas" };
  const general = settingHits(owner, "general");
  check("a settings section matches by its id for a French viewer, titled in French", general[0]?.id === "general" && general[0]?.title === t("shell.settings.general", undefined, "fr") && general[0]?.href === "/app/atlas/settings/general", general);
  check("case does not matter", settingHits({ ...owner, locale: "en" }, "AUDIT").some((h) => h.id === "audit"));
  check("a section the viewer may not open is never found", settingHits({ ...owner, can: (p: string) => p === "settings.read" }, "audit").length === 0);
  const members = [
    { userId: "u1", name: "Salma Idrissi", email: "salma@atlas.ma", role: "manager" as const, status: "active" as const },
    { userId: "u2", name: "", email: "k•••@atlas.ma", role: "agent" as const, status: "suspended" as const },
  ];
  const found = memberHits(members, { locale: "ar", handle: "atlas" }, "salma");
  check("a member matches by name, with the role in the viewer's language", found.length === 1 && found[0]!.title === "Salma Idrissi" && found[0]!.subtitle === t("team.role.manager", undefined, "ar") && found[0]!.href === "/app/atlas/team");
  const paused = memberHits(members, { locale: "en", handle: "atlas" }, "atlas.ma");
  check("a nameless member shows the e-mail as listed; a paused one says so", paused.length === 2 && paused[1]!.title === "k•••@atlas.ma" && paused[1]!.subtitle === "Agent · Access paused", paused);
  check("the shell's hits never exceed SHELL_MAX", settingHits({ can: () => true, locale: "en", handle: "atlas" }, "s").length <= SHELL_MAX);
  check("every new search key exists in ar, fr and en", inCatalogs("shell.cmdk.member_paused") && Object.values(KIND_GROUPS).every(inCatalogs) && inCatalogs(OTHER_GROUP));
  check("folding is idempotent and diacritic-free", foldSearch("Écran  Général") === "ecran general" && foldSearch(foldSearch("Écran")) === "ecran");
}

/* ---- the installable dashboard: manifest and icons (PLA-§23.1, DES-§16.14; step p2-04) ---- */
function manifestChecks(): void {
  const m = appManifest({ name: "Store Gen", locale: "ar" });
  check(
    "the manifest has PLA-§23.1's fields",
    m.id === "/app/" && m.scope === "/app/" && m.start_url === "/app?source=pwa" && m.display === "standalone" && m.orientation === "portrait" && m.lang === "ar" && m.dir === "rtl",
    m,
  );
  check("lang and dir follow the locale", appManifest({ name: "Store Gen", locale: "fr" }).dir === "ltr" && appManifest({ name: "Store Gen", locale: "en" }).lang === "en");
  const light = generateColors(SURFACES.tenant, "light");
  check("theme_color is the tenant --sidebar, background_color the --background (light, hex; DES-§16.14)", m.theme_color === oklchToHex(light["--sidebar"]) && m.background_color === oklchToHex(light["--background"]) && /^#[0-9a-f]{6}$/.test(m.theme_color));
  check(
    "three icons: 192, 512 and the maskable 512",
    m.icons.map((i) => `${i.src}|${i.sizes}|${i.purpose ?? "any"}`).join() === "/icons/app-192.png|192x192|any,/icons/app-512.png|512x512|any,/icons/app-maskable-512.png|512x512|maskable",
  );
  check("short_name is at most 12 characters, never half a pair", shortName("Store Gen") === "Store Gen" && Array.from(shortName("متجر الأطلس الكبير جدا")).length <= 12 && shortName("A".repeat(11) + "😀😀") === "A".repeat(11) + "😀");
  check("an empty brand falls back to the platform's name", appManifest({ name: "  ", locale: "en" }).name === "Store Gen");
  const colors = appColors();
  check("no colour of the manifest or the icon is orange (owner rule 1)", Object.values(colors).every((c) => !inOrangeBand(c)), colors);
  check("the ink reads on the ground (≥ 7:1)", contrastRatio(colors.ink, colors.ground) >= 7 && contrastRatio(colors.ink, colors.groundTop) >= 7);
  check("the maskable mark stays inside the inner 80 % circle", markReach("maskable") <= SAFE_RADIUS && markReach("maskable") < markReach("any"), { maskable: markReach("maskable"), any: markReach("any") });
  check("the monogram's ink box is centred on the grid (DS32 optical centring)", (MONOGRAM_BOX.x0 + MONOGRAM_BOX.x1) / 2 === GRID / 2 && (MONOGRAM_BOX.y0 + MONOGRAM_BOX.y1) / 2 === GRID / 2);
  for (const icon of APP_ICONS) {
    const svg = appIconSvg(icon.size, icon.kind);
    check(`${icon.file}: paths and rects only, no <text>, sized ${icon.size}`, !/<text|<image|<foreignObject/.test(svg) && svg.includes(`width="${icon.size}"`) && svg.includes(MONOGRAM_S));
    check(`${icon.file}: deterministic`, appIconSvg(icon.size, icon.kind) === svg);
  }
}

/* ---- the inputs of P2's server actions (PLA-§M.1, §L; core §E.3 rule 4, D65; step p2-05) ---- */
function actionInputChecks(): void {
  const ID = "01J9ZK3M4N5P6Q7R8S9T0V1W2X";
  const ARCH = Archetype.options[0];
  const details = { category: "skincare", productName: "Huile d'argan", priceMinor: 14_900, compareAtMinor: 19_900, fact: null, assetIds: [] as string[] };
  // one valid input per action: a schema added without a sample is a type error here
  const samples: { [K in keyof typeof STORE_ACTION_INPUTS]: unknown } = {
    "review-actions#submitForReviewAction": { sells: "Huile d'argan", link: null, whatsapp: "+212612345678" },
    "review-actions#answerReviewQuestionAction": { answer: "Nous vendons de l'huile d'argan." },
    "review-actions#submitAppealAction": { message: "Merci de revoir la décision." },
    "review-actions#mintPreviewLinkAction": { pageId: ID },
    "review-actions#revokePreviewLinkAction": { tokenId: ID },
    "health-actions#snoozeHealthIssueAction": { issueId: "landing:no_live_page" },
    "health-actions#unsnoozeHealthIssueAction": { issueId: "shell:setup_whatsapp" },
    "notifications#markNotificationsReadAction": "all",
    "welcome#saveOnboardingDetailsAction": details,
    "welcome#useDirectionAction": { directionKey: ARCH, directions: [{ id: ARCH, label: "Direction 1", doc: {} }] },
    "welcome#reportRevealAction": { paintedAt: new Date().toISOString() },
    "welcome#saveOnboardingContactAction": { whatsapp: "+212612345678" },
    "settings/general#saveGeneralAction": { name: "Atlas Argan", defaultLocale: "fr" },
    "settings/general#setStoreModeAction": { mode: "landing" },
    "settings/address#renameHandleAction": { handle: "atlas-argan" },
    "settings/security#setRequireMember2faAction": { on: true },
    "settings/plan#createStoreRequestAction": { kind: "go_live", message: null },
    "settings/plan#withdrawStoreRequestAction": { requestId: ID },
    "settings/danger#requestStoreExportAction": { opId: "op-12345678" },
    "settings/danger#closeOwnStoreAction": { confirm: "atlas-argan", opId: "op-12345678" },
  };
  const withStore = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? { ...v, storeId: ID } : { storeId: ID });
  for (const [key, schema] of Object.entries(STORE_ACTION_INPUTS) as [keyof typeof STORE_ACTION_INPUTS, ZodType][]) {
    const ok = schema.safeParse(samples[key]);
    check(`${key}: its sample parses`, ok.success, ok.error?.issues);
    check(`${key}: a storeId beside valid fields is refused (core §E.3 rule 4)`, !schema.safeParse(withStore(samples[key])).success);
  }
  check("setLastStoreAction takes one store id, checked against the caller's memberships", USER_ACTION_INPUTS["app#setLastStoreAction"].safeParse(ID).success && !USER_ACTION_INPUTS["app#setLastStoreAction"].safeParse({ storeId: ID }).success);
  check("acceptLegalAction: 1-10 documents, nothing else", USER_ACTION_INPUTS["app#acceptLegalAction"].safeParse({ documentIds: [ID] }).success && !USER_ACTION_INPUTS["app#acceptLegalAction"].safeParse({ documentIds: [ID], storeId: ID }).success && !USER_ACTION_INPUTS["app#acceptLegalAction"].safeParse({ documentIds: [] }).success);

  // PD23: integer minor units; the price before only above the price
  const D = (over: Record<string, unknown>) => OnboardingDetailsInput.safeParse({ ...details, ...over });
  const fieldsOf = (input: unknown): Record<string, string> | null => {
    try {
      parseInput(OnboardingDetailsInput, input);
      return null;
    } catch (e) {
      return e instanceof FieldsError ? (e.fields as Record<string, string>) : null;
    }
  };
  check("price: integer minor units are taken", D({}).success && D({}).data?.priceMinor === 14_900);
  check("price: a float, zero, a negative or a string is refused", [149.5, 0, -100, "14900", Number.NaN].every((v) => !D({ priceMinor: v }).success));
  check("price before: equal to or below the price is refused", !D({ compareAtMinor: 14_900 }).success && !D({ compareAtMinor: 9_900 }).success && !D({ compareAtMinor: 19_900.5 }).success);
  check("price before: absent or null means none", D({ compareAtMinor: undefined }).data?.compareAtMinor === null && D({ compareAtMinor: null }).data?.compareAtMinor === null);
  check("price before: the refusal names its field with onboarding.compare_invalid", fieldsOf({ ...details, compareAtMinor: 100 })?.compareAtMinor === "onboarding.compare_invalid", fieldsOf({ ...details, compareAtMinor: 100 }));
  check("a name of spaces is required (onboarding.name_required)", fieldsOf({ ...details, productName: "   " })?.productName === "onboarding.name_required");
  check("the category tap is required, from the platform list", !D({ category: undefined }).success && !D({ category: "weapons" }).success);
  check("at most 5 photos", !D({ assetIds: ["a1b2c3d4e5f6", "a1b2c3d4e5f7", "a1b2c3d4e5f8", "a1b2c3d4e5f9", "a1b2c3d4e5fa", "a1b2c3d4e5fb"] }).success);
  check("typedPrices: the price before only when typed and higher", JSON.stringify(typedPrices({ priceMinor: 14_900, compareAtMinor: 14_900 })) === '{"price":14900,"compareAt":null}' && typedPrices({ priceMinor: 14_900, compareAtMinor: 19_900 })?.compareAt === 19_900);
  check("typedPrices: no typed price, no page", typedPrices({ priceMinor: null, compareAtMinor: 19_900 }) === null && typedPrices({ priceMinor: 149.5, compareAtMinor: null }) === null && typedPrices({ priceMinor: 0, compareAtMinor: null }) === null);

  // E.164 after the separators people type
  check("E.164: spaces, dashes, dots and brackets are dropped", E164.safeParse("+212 6 12-34.56 (78)").data === "+212612345678");
  check("E.164: a national number, a leading 0 after +, letters or 16 digits are refused", ["0612345678", "+0612345678", "212612345678", "+2126123x5678", "+2126123456789012", "+1234567"].every((v) => !E164.safeParse(v).success));
  check("E.164: the refusal sentence is shell.field.e164", (() => {
    try {
      parseInput(STORE_ACTION_INPUTS["welcome#saveOnboardingContactAction"], { whatsapp: "0612" });
      return false;
    } catch (e) {
      return e instanceof FieldsError && Object.values(e.fields).every((k) => k === "shell.field.e164" || k === "error.invalid");
    }
  })());

  // the caps of PLA-§L, after cleaning
  const sub = STORE_ACTION_INPUTS["review-actions#submitForReviewAction"];
  check(`business context: ${REVIEW_FIELD_MAX} characters each`, sub.safeParse({ sells: "a".repeat(REVIEW_FIELD_MAX), link: "b".repeat(REVIEW_FIELD_MAX) }).success && !sub.safeParse({ sells: "a".repeat(REVIEW_FIELD_MAX + 1) }).success && !sub.safeParse({ link: "b".repeat(REVIEW_FIELD_MAX + 1) }).success);
  check("business context: blank fields are none, an empty WhatsApp is none", JSON.stringify(sub.safeParse({ sells: "  ", link: null, whatsapp: "" }).data) === '{"sells":null,"link":null,"whatsapp":null}');
  check("business context: a link stays plain text (no scheme added, nothing parsed)", sub.safeParse({ link: "javascript:alert(1)" }).data?.link === "javascript:alert(1)");
  for (const key of ["review-actions#answerReviewQuestionAction", "review-actions#submitAppealAction"] as const) {
    const field = key.endsWith("answerReviewQuestionAction") ? "answer" : "message";
    const sc = STORE_ACTION_INPUTS[key];
    check(`${key}: ${REVIEW_TEXT_MAX} characters, not blank`, sc.safeParse({ [field]: "a".repeat(REVIEW_TEXT_MAX) }).success && !sc.safeParse({ [field]: "a".repeat(REVIEW_TEXT_MAX + 1) }).success && !sc.safeParse({ [field]: " \n\t " }).success);
  }
  check("cleanLine drops control characters and folds spaces", cleanLine("a\u0000b\nc   d\t") === "ab c d");
  check("cleanText keeps at most one blank line", cleanText("a\r\n\n\n\nb\u0007") === "a\n\nb");
  check(`mark read: "all", or 1-${MARK_READ_MAX} positive ids`, MarkReadInput.safeParse("all").success && MarkReadInput.safeParse(Array.from({ length: MARK_READ_MAX }, (_, i) => i + 1)).success && ![[], [0], [1.5], Array.from({ length: MARK_READ_MAX + 1 }, (_, i) => i + 1), "some", null].some((v) => MarkReadInput.safeParse(v).success));
  check("issue ids: <track>:<rule>", STORE_ACTION_INPUTS["health-actions#snoozeHealthIssueAction"].safeParse({ issueId: "landing:no_live_page" }).success && !STORE_ACTION_INPUTS["health-actions#snoozeHealthIssueAction"].safeParse({ issueId: "Landing:x" }).success && !STORE_ACTION_INPUTS["health-actions#snoozeHealthIssueAction"].safeParse({ issueId: "x" }).success);
  check("R1 requests: R3's domain kind is refused", !STORE_ACTION_INPUTS["settings/plan#createStoreRequestAction"].safeParse({ kind: "domain", host: "shop.example" }).success);
  check("store modes: only the three", !STORE_ACTION_INPUTS["settings/general#setStoreModeAction"].safeParse({ mode: "catalog" }).success);
  check("the typed handle: case and surrounding spaces ignored", handleTyped(" Atlas-Argan ", "atlas-argan") && !handleTyped("atlas", "atlas-argan") && !handleTyped("", "atlas-argan"));

  // a refusal names catalog keys only, never a zod sentence (D65)
  const refusals = [
    [STORE_ACTION_INPUTS["welcome#saveOnboardingDetailsAction"], { ...details, priceMinor: 1.5, productName: "", compareAtMinor: 1 }],
    [STORE_ACTION_INPUTS["review-actions#submitForReviewAction"], { sells: 7, whatsapp: "06" }],
    [STORE_ACTION_INPUTS["settings/general#saveGeneralAction"], { name: "", timezone: "Mars/Olympus", extra: 1 }],
    [STORE_ACTION_INPUTS["settings/plan#createStoreRequestAction"], { kind: "limit_raise", key: "nope", used: -1 }],
    [MarkReadInput, null],
  ] as const;
  for (const [schema, input] of refusals) {
    try {
      parseInput(schema as ZodType, input);
      check("a bad input is refused", false, input);
    } catch (e) {
      const keys = e instanceof FieldsError ? Object.values(e.fields) : [];
      check("a refused input answers catalog keys only", keys.length > 0 && keys.every((k) => inCatalogs(k)), keys);
    }
  }

  // every message key and refusal code the P2 action files name exists in ar, fr and en (D65)
  const files = [
    "src/app/app/actions.ts",
    "src/app/app/account/actions.ts",
    "src/app/app/[store]/review-actions.ts",
    "src/app/app/[store]/health-actions.ts",
    "src/app/app/[store]/notifications/actions.ts",
    "src/app/app/[store]/welcome/actions.ts",
    "src/app/app/[store]/team/actions.ts",
    "src/app/app/[store]/settings/general/actions.ts",
    "src/app/app/[store]/settings/address/actions.ts",
    "src/app/app/[store]/settings/security/actions.ts",
    "src/app/app/[store]/settings/plan/actions.ts",
    "src/app/app/[store]/settings/danger/actions.ts",
    "src/components/admin/shell/action-inputs.ts",
    "src/components/admin/shell/action-guards.ts",
  ];
  const keys = new Set<string>();
  const codes = new Set<string>();
  for (const file of files) {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    for (const m of src.matchAll(/"((?:error|shell|onboarding|account)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)"/g)) keys.add(m[1]!);
    for (const m of src.matchAll(/new (?:AuthRefusal|SeamError)\("([a-z_]+)"/g)) codes.add(m[1]!);
  }
  const missing = [...keys].filter((k) => !inCatalogs(k));
  check(`the ${keys.size} message keys of P2's action files exist in ar, fr and en`, keys.size > 20 && missing.length === 0, missing);
  const noSentence = [...codes].filter((c) => !inCatalogs(`error.${c}`));
  check(`every refusal code P2's actions throw (${codes.size}) has its error.<code> sentence`, codes.size >= 10 && noSentence.length === 0, noSentence);
}

/* ---- step p2-06: the shared primitives' runtime prop guards (PLA-§22.12) ---- */
async function primitiveChecks(): Promise<void> {
  // the lock reasons: every kind has a sentence in ar/fr/en and the surface PLA-§22.8 names
  const reasons: LockReason[] = [
    { kind: "pending" },
    { kind: "state", status: "pending" },
    { kind: "state", status: "restricted" },
    { kind: "state", status: "suspended" },
    { kind: "state", status: "closed" },
    { kind: "state", status: "scheduled_deletion" },
    { kind: "state", status: "rejected" },
    { kind: "plan", key: "sheets" },
    { kind: "kill", key: "publishing_enabled" },
    { kind: "role" },
    { kind: "release", release: "R2" },
    { kind: "release", release: "R3" },
    { kind: "impersonation" },
  ];
  const views = reasons.map(lockView);
  check(
    "every lock reason explains itself in ar/fr/en",
    views.every((v) => inCatalogs(v.key)),
    views.filter((v) => !inCatalogs(v.key)),
  );
  check(
    "pending opens the review card, a plan the limit sheet, the rest a sheet",
    lockView({ kind: "pending" }).opens === "review" &&
      lockView({ kind: "state", status: "pending" }).opens === "review" &&
      lockView({ kind: "plan", key: "sheets" }).opens === "limit" &&
      lockView({ kind: "kill", key: "publishing_enabled" }).opens === "sheet" &&
      lockView({ kind: "impersonation" }).opens === "sheet",
  );

  // the usage meter: the store's own share only (MED-13), warn from 0.8, full at the limit
  const u = (used: number, limit: number | null, warn?: number) => usageView(used, limit, warn);
  check("usage below warnAt is ok", u(7, 10).tone === "ok" && u(7, 10).pct === 70);
  check("usage at warnAt warns", u(8, 10).tone === "warn" && u(84, 100).pct === 84);
  check("usage at or over the limit is full, the bar never past 100 %", u(10, 10).tone === "full" && u(12, 10).share === 1 && u(12, 10).pct === 100);
  check("unlimited has no share and no bar", u(5, null).unlimited && u(5, null).share === null);
  check("a 0 limit with nothing used is not full", u(0, 0).tone === "ok" && u(3, 0).tone === "full");
  check("warnAt is honoured and a bad warnAt falls back to 0.8", u(6, 10, 0.5).tone === "warn" && u(7, 10, 7).tone === "ok" && u(8, 10, Number.NaN).tone === "warn");
  check("negative or NaN use reads as 0", u(-4, 10).pct === 0 && u(Number.NaN, 10).pct === 0);
  const mb = formatUsage(20 * 1024 * 1024, "bytes", "en").replace(/ /g, " ");
  check("bytes format in binary steps", mb === "20 MB", mb);
  check("bytes under a KB stay bytes; credits are integers", /^512/.test(formatUsage(512, "bytes", "en")) && formatUsage(1234.6, "credits", "en") === "1,235");
  check("Arabic amounts keep Western digits", /^[0-9]/.test(formatUsage(42, "count", "ar")));

  // sharing and truncation
  check("wa.me link: digits only, the text encoded", waHref("Atlas: https://x.test/s/a?b=1&c", "+212 6-12") === "https://wa.me/212612?text=Atlas%3A%20https%3A%2F%2Fx.test%2Fs%2Fa%3Fb%3D1%26c");
  check("wa.me link without a phone opens the picker", waHref("hi") === "https://wa.me/?text=hi" && waHref("hi", null) === "https://wa.me/?text=hi");
  const long = "store-gen.example/s/atlas-argan-cosmetiques-naturelles-du-souss/huile";
  const cut = middleTruncate(long, 30);
  check("middle truncation keeps both ends within max", [...cut].length === 30 && cut.startsWith("store-gen.example") && cut.endsWith("huile") && cut.includes("…"), cut);
  check("a short value is not truncated", middleTruncate("a.test/s/x", 30) === "a.test/s/x");

  // the issue list: points first, at most max, snoozed apart
  const issue = (id: string, points: 3 | 6 | 10, severity: 1 | 2 | 3): HealthIssue => ({
    id,
    group: "setup",
    severity,
    points,
    evidence: { metric: "m", value: 1, window: "7d", n: 1 },
    fix: { kind: "action", actionId: "x", label: "health.recompute" },
    text: "health.title",
  });
  const many = [issue("a", 3, 1), issue("b", 10, 3), issue("c", 6, 2), issue("d", 6, 3), issue("e", 3, 2), issue("f", 10, 2), issue("g", 3, 1)];
  const b = issueBuckets(many, { f: "2026-11-10T00:00:00Z" }, 5);
  check("issues sort by points, then severity, snoozed left out", b.shown.map((i) => i.id).join() === "b,d,c,e,a", b.shown.map((i) => i.id));
  check("at most max issues, the rest counted", b.shown.length === 5 && b.hidden === 1 && b.snoozed.length === 1 && b.snoozed[0]!.issue.id === "f");
  check("an inherited key is not a snooze", issueBuckets([issue("toString", 3, 1)], {}, 5).shown.length === 1);

  // the pager keeps the page's filters
  check("the cursor joins the query, filters kept", pagerHref("status=new&q=argan&cursor=old", "cursor", "abc") === "?status=new&q=argan&cursor=abc");
  check("a custom param", pagerHref("", "after", "z9") === "?after=z9");

  // freshness: the dot carries real state only
  const now = Date.parse("2026-11-03T12:00:00Z");
  check("never updated: no time, not fresh", freshness(null, 60_000, now, "en").key === "shell.fresh.never" && !freshness(null, 60_000, now, "en").fresh);
  check("just now within 45 s", freshness("2026-11-03T11:59:30Z", 60_000, now, "en").key === "shell.fresh.now");
  const f2 = freshness("2026-11-03T11:58:00Z", 5 * 60_000, now, "en");
  check("2 minutes ago, fresh within staleAfterMs", f2.key === "shell.fresh.ago" && f2.fresh && /2 minutes ago/.test(String(f2.vars.time)), f2);
  const f3 = freshness("2026-11-03T08:00:00Z", 60 * 60_000, now, "fr");
  check("hours ago, stale past staleAfterMs, in the viewer's locale", !f3.fresh && /il y a 4 heures/.test(String(f3.vars.time)), f3);
  check("a time in the future counts as now (clock skew)", freshness("2026-11-03T12:05:00Z", 60_000, now, "en").key === "shell.fresh.now");
  check("an unparsable time is never", freshness("soon", 60_000, now, "en").key === "shell.fresh.never");
  check("formatDay refuses a value that is not a date", formatDay("nope", "en") === "" && formatDay(null, "ar") === "" && formatDay("2026-11-03T12:00:00Z", "en").length > 0);

  // the QR: whole pixels per module, never under 4 (DES-§16.12, UX-30)
  const v3 = qrModules("https://store-gen.example/go/abc123")!;
  const v5 = qrModules("https://lightgreen-hippopotamus-140853.hostingersite.com/s/atlas-argan-cosmetiques")!;
  check("QR pixels per module ≥ 4 at every length", qrPixels(v3, 160) >= 4 && qrPixels(v5, 160) >= 4 && qrPixels(v5, 20) === 4);
  check("QR uses whole pixels per module", Number.isInteger(qrPixels(v3, 160)) && Number.isInteger(qrPixels(v5, 160)));

  // ring, delta, monogram, skeleton
  check(
    "ring stroke grows with size and stays inside",
    ([40, 56, 96] as const).every((s) => {
      const g = ringGeometry(s);
      return g.r + g.stroke / 2 <= s / 2 + 1e-9 && g.circumference > 0;
    }) && ringGeometry(96).stroke > ringGeometry(40).stroke,
  );
  check("delta tones", deltaTone(3) === "up" && deltaTone(-0.5) === "down" && deltaTone(0) === "flat" && deltaTone(Number.NaN) === "flat");
  check("monogram initials: two words, one word, one Arabic letter (a joining script)", monogramInitials("atlas argan") === "AA" && monogramInitials("Baraka") === "B" && monogramInitials("متجر النور") === "م", monogramInitials("متجر النور"));
  check("monogram initials keep an astral character whole", monogramInitials("🌿 Shop") === "🌿S" && monogramInitials("   ") === "");
  check("skeleton appears after 150-300 ms and stays ≥ 300 ms", SKELETON_DELAY_MS >= 150 && SKELETON_DELAY_MS <= 300 && SKELETON_MIN_MS >= 300);

  // the type-level funnel refusal: R1 cannot measure shipped / delivered / collected
  r1Funnel([
    { id: "orders", label: "Placed", value: 12 },
    { id: "confirmed", label: "Confirmed", value: 8 },
    // @ts-expect-error a 0 for a step R1 cannot measure does not type-check (null, never 0)
    { id: "shipped", label: "Shipped", value: 0 },
    { id: "delivered", label: "Delivered", value: null },
    { id: "collected", label: "Collected", value: null },
  ]);

  // every message key the primitives name exists in ar, fr and en (D65)
  const files = [
    "address-card.tsx",
    "copy-button.tsx",
    "empty-state.tsx",
    "freshness-dot.tsx",
    "funnel-chart.tsx",
    "health-groups.tsx",
    "health-ring.tsx",
    "issue-list.tsx",
    "job-chip.tsx",
    "keyset-pager.tsx",
    "kpi-tile.tsx",
    "locked-control.tsx",
    "masked-value.tsx",
    "mode-explainer.tsx",
    "panel-boundary.tsx",
    "primitive-logic.ts",
    "qr-code.tsx",
    "reason-picker.tsx",
    "review-card.tsx",
    "role-explainer.tsx",
    "sheet-close.tsx",
    "skeleton.tsx",
    "status-pill.tsx",
    "step-up-sheet.tsx",
    "today-brief.tsx",
    "typed-confirm-dialog.tsx",
    "usage-meter.tsx",
    "whatsapp-share-button.tsx",
  ].map((f) => path.join(process.cwd(), "src/components/admin/common", f));
  files.push(path.join(process.cwd(), "src/components/admin/shell/limit-sheet.tsx"));
  const keys = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/"((?:shell|health|auth|team|brief|error)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)"/g)) keys.add(m[1]!);
  }
  const missing = [...keys].filter((k) => !inCatalogs(k));
  check(`the ${keys.size} message keys the primitives name exist in ar, fr and en`, keys.size > 80 && missing.length === 0, missing);
  // the template keys the primitives build from a value: every status, mode, severity, group and role
  const built = [
    ...(["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"] as const).map((s) => `shell.status.${s}`),
    ...STORE_MODES.map((m) => `shell.mode.${m}`),
    ...[1, 2, 3].map((n) => `health.severity.${n}`),
    ...["setup", "trust", "design", "conversion", "operations", "integrations", "quota"].map((g) => `health.group.${g}`),
    ...STORE_ROLES.map((r) => `team.role.${r}`),
  ];
  check("every status, mode, severity, group and role label exists in ar/fr/en", built.every(inCatalogs), built.filter((k) => !inCatalogs(k)));
  // no em dash or en dash separator in anything the primitives say (rubric §9.G, core §I.8 rule 8)
  const dashed = [...keys].flatMap((k) => ADMIN_LOCALES.map((l) => [k, messageOf(k, l) ?? ""] as const)).filter(([, v]) => /[–—]/.test(v));
  check("no em or en dash in the primitives' strings", dashed.length === 0, dashed);
}

/* ---- step p2-07: the shell chrome (usePulse's reducer, banners from the pulse, the ribbon's countdown, the bell) ---- */
function pulseOf(over: Partial<StorePulse> & { status?: StorePulse["store"]["status"]; review?: StorePulse["store"]["review"] } = {}): StorePulse {
  const { status = "active", review = "approved", ...rest } = over;
  return {
    v: 1,
    at: "2026-11-03T10:00:00.000Z",
    build: "b1",
    unread: 0,
    store: { status, statusReason: null, review },
    kill: [],
    impersonation: null,
    reaccept: false,
    health: { score: 80, attention: 1, computedAt: "2026-11-03T09:00:00.000Z" },
    jobs: { running: 0, done: [] },
    counts: {},
    ...rest,
  };
}

async function chromeChecks(): Promise<void> {
  // usePulse's reducer: what each body change asks of the page
  let s = initialPulseState(pulseOf(), 1_000);
  check("the first paint's body is the state, its build the boot build", s.body?.build === "b1" && s.bootBuild === "b1" && s.receivedAt === 1_000 && s.refreshTick === 0);
  s = reducePulse(s, { t: "body", body: pulseOf({ unread: 3, counts: { newOrders: 2 } }), now: 16_000 });
  check("unread and counts alone refresh nothing", s.refreshTick === 0 && s.healthTick === 0 && !s.updateAvailable && s.body?.unread === 3 && pulseAge(s, 20_000) === 4_000);
  s = reducePulse(s, { t: "body", body: pulseOf({ status: "restricted" }), now: 31_000 });
  check("a status change asks for router.refresh() (PL-02)", s.refreshTick === 1);
  s = reducePulse(s, { t: "body", body: pulseOf({ status: "restricted", review: "rejected" }), now: 46_000 });
  check("a review change asks for router.refresh()", s.refreshTick === 2);
  s = reducePulse(s, { t: "body", body: pulseOf({ status: "restricted", review: "rejected", kill: ["publishing_enabled"] }), now: 61_000 });
  check("a kill switch change asks for router.refresh()", s.refreshTick === 3);
  s = reducePulse(s, { t: "body", body: pulseOf({ status: "restricted", review: "rejected", kill: ["publishing_enabled"], reaccept: true }), now: 76_000 });
  check("a re-acceptance asks for router.refresh() (the legal sheet)", s.refreshTick === 4);
  s = reducePulse(s, { t: "body", body: pulseOf({ status: "restricted", review: "rejected", kill: ["publishing_enabled"], reaccept: true, build: "b2" }), now: 91_000 });
  check("another build shows the update once and stays", s.updateAvailable && s.bootBuild === "b1" && s.refreshTick === 4);
  const health = pulseOf({ health: { score: 70, attention: 2, computedAt: "2026-11-03T10:05:00.000Z" } });
  const h = reducePulse(initialPulseState(pulseOf(), 0), { t: "body", body: health, now: 1 });
  check("a new health snapshot bumps the ring's tick, not the refresh", h.healthTick === 1 && h.refreshTick === 0);
  let j = reducePulse(initialPulseState(pulseOf(), 0), { t: "body", body: pulseOf({ jobs: { running: 1, done: ["job-1", "job-2"] } }), now: 5 });
  check("finished jobs become 'Ready · Open' once each", j.ready.map((r) => r.id).join() === "job-1,job-2");
  j = reducePulse(j, { t: "body", body: pulseOf({ jobs: { running: 0, done: ["job-2"] } }), now: 6 });
  check("a job named again is not added twice", j.ready.length === 2);
  j = reducePulse(j, { t: "dismiss_job", id: "job-1" });
  j = reducePulse(j, { t: "body", body: pulseOf({ jobs: { running: 0, done: ["job-2"] } }), now: 7 });
  check("a dismissed job leaves, the others stay", j.ready.map((r) => r.id).join() === "job-2");
  let many = initialPulseState(null, 0);
  many = reducePulse(many, { t: "body", body: pulseOf({ jobs: { running: 0, done: ["a", "b", "c", "d", "e", "f", "g"] } }), now: 1 });
  check(`at most ${READY_MAX} jobs wait, the newest kept`, many.ready.length === READY_MAX && many.ready[READY_MAX - 1]!.id === "g");
  check("no first body: the first poll is the boot build, nothing refreshes", many.bootBuild === "b1" && many.refreshTick === 0);
  check("needsRefresh ignores an order of kill switches", !needsRefresh(pulseOf({ kill: ["a" as never, "b" as never] }), pulseOf({ kill: ["b" as never, "a" as never] })));

  // banners from the pulse (PL-12: a state change shows within one body, no reload)
  const base = { role: "owner", reason: "some recent orders look fake", closedOn: null, reopenUntil: null };
  const ids = (b: ReturnType<typeof pulseBanners>) => b.map((x) => x.id).join();
  check("before a body, the first paint's state decides", ids(pulseBanners(base, { status: "pending", kill: [] }, null)) === "pending");
  check("a restricted body shows the restricted banner at once", ids(pulseBanners(base, { status: "active", kill: [] }, pulseOf({ status: "restricted" }))) === "restricted");
  check(
    "a suspended store with a kill switch: suspended first, the switch behind '1 more'",
    ids(pulseBanners(base, { status: "active", kill: [] }, pulseOf({ status: "suspended", kill: ["publishing_enabled"] }))) === "suspended,kill:publishing_enabled",
  );
  check("back to active: no banner", ids(pulseBanners(base, { status: "restricted", kill: [] }, pulseOf({ status: "active" }))) === "");
  check(
    "a closed store: the owner's banner, a manager's page",
    ids(pulseBanners(base, { status: "active", kill: [] }, pulseOf({ status: "closed" }))) === "closed" &&
      ids(pulseBanners({ ...base, role: "manager" }, { status: "active", kill: [] }, pulseOf({ status: "closed" }))) === "" &&
      statePage("closed", "manager") === "closed",
  );
  check("a status reason code becomes its catalog key; junk becomes nothing", statusReasonKey("fake_orders") === "shell.status_reason.fake_orders" && statusReasonKey("<b>") === null && statusReasonKey(null) === null);

  // the ribbon's countdown (PLA-§10.2): the offset once, the pulse's end first
  const offset = clockOffset("2026-11-03T10:00:00.000Z", Date.parse("2026-11-03T10:00:05.000Z"));
  check("the server offset: server minus client", offset === -5_000 && clockOffset("junk", 1) === 0);
  const ends = "2026-11-03T10:24:13.000Z";
  check("24:13 left on a corrected clock", formatCountdown(remainingMs(ends, Date.parse("2026-11-03T10:00:05.000Z"), offset)) === "24:13");
  check("never below 00:00, and 00:00 only when it is over", formatCountdown(remainingMs(ends, Date.parse("2026-11-03T11:00:00.000Z"), 0)) === "00:00" && formatCountdown(400) === "00:01");
  check("an hour reads 1:00:00", formatCountdown(3_600_000) === "1:00:00" && formatCountdown(Number.NaN) === "00:00");
  check("an unreadable end counts as over", remainingMs("nope", 0, 0) === 0 && remainingMs(null, 0, 0) === 0);
  check(
    "the pulse's endsAt wins over the first paint's",
    ribbonEndsAt(pulseOf({ impersonation: { endsAt: "2026-11-03T10:30:00.000Z" } }), ends) === "2026-11-03T10:30:00.000Z" && ribbonEndsAt(pulseOf(), ends) === ends && ribbonEndsAt(null, null) === null,
  );
  // two tabs: one navigated (a fresh first paint), the other on the pulse; both read the same end on the same clock
  const tabA = remainingMs(ribbonEndsAt(pulseOf({ impersonation: { endsAt: ends } }), "2026-11-03T10:20:00.000Z"), Date.parse("2026-11-03T10:10:00.400Z"), 0);
  const tabB = remainingMs(ribbonEndsAt(pulseOf({ impersonation: { endsAt: ends } }), ends), Date.parse("2026-11-03T10:10:00.000Z"), 0);
  check("two tabs differ by under a second", Math.abs(tabA - tabB) < 1_000);

  // the bell
  check("the bell: nothing at 0, the count to nine, 9+ above", bellCount(0) === null && bellCount(3) === "3" && bellCount(9) === "9" && bellCount(10) === "9+" && bellCount(Number.NaN) === null);
  const now = Date.parse("2026-11-03T12:00:00.000Z");
  const rows = [
    { createdAt: "2026-11-03T11:00:00.000Z" },
    { createdAt: "2026-11-03T08:00:00.000Z" },
    { createdAt: "2026-11-02T20:00:00.000Z" },
    { createdAt: "2026-10-30T10:00:00.000Z" },
    { createdAt: "junk" },
  ];
  check(
    "rows group by day in the store's zone: today, yesterday, then dates",
    groupByDay(rows, now, "Africa/Casablanca").map((g) => `${g.day}:${g.items.length}`).join() === "today:2,yesterday:1,2026-10-30:1,today:1",
    groupByDay(rows, now, "Africa/Casablanca").map((g) => `${g.day}:${g.items.length}`),
  );
  check(
    "a notification opens only a dashboard link",
    notificationHref("/app/atlas/orders") === "/app/atlas/orders" && notificationHref("/app/account") === "/app/account" && notificationHref("https://evil.example") === null && notificationHref("//evil") === null && notificationHref(null) === null,
  );

  // the Help sheet's ring and diagnostic block (PLA-§20.1)
  clearClientErrors();
  for (const c of ["forbidden", "quota", "Bad Code", "rate_limited", "server", "busy", "invalid", "conflict"]) recordClientError(c);
  check("the ring keeps the last five well-formed codes", recentClientErrors().join() === "rate_limited,server,busy,invalid,conflict" && CLIENT_ERROR_RING === 5);
  const diag = diagnosticText({ handle: "atlas-argan", path: "/app/atlas-argan/orders?q=0612345678#x", build: "abc123", ua: "Chrome · Android", errors: recentClientErrors(), locale: "ar" });
  check("the diagnostic block carries no query string (a phone typed in a search)", !diag.includes("0612345678") && diag.includes("screen: /app/atlas-argan/orders") && diag.includes("recent errors: rate_limited"));
  check("the diagnostic block has no token-looking field", !/token|cookie|session|password/i.test(diag));
  clearClientErrors();
  check("sign-out empties the ring", recentClientErrors().length === 0);

  // the chrome's small rules
  check("agents and managers start compact, the others comfortable", defaultDensity("agent") === "compact" && defaultDensity("manager") === "compact" && defaultDensity("owner") === "comfortable" && defaultDensity("viewer") === "comfortable");
  const lsV = new FakeStorage([]);
  const ssV = new FakeStorage([]);
  lsV.removeItem("x");
  const v1 = countVisit(() => lsV, () => ssV);
  const v1b = countVisit(() => lsV, () => ssV);
  const v2 = countVisit(() => lsV, () => new FakeStorage([]));
  check("a visit counts once per browser session", v1 === 1 && v1b === 1 && v2 === 2);
  check("a blocked storage counts nothing", countVisit(blocked, blocked) === 0);
  check(
    "the install hint: from the 3rd visit, never installed, native prompt first, iOS sheet, else nothing",
    installOffer({ visits: 2, standalone: false, native: true, ios: false }) === null &&
      installOffer({ visits: 3, standalone: false, native: true, ios: false }) === "native" &&
      installOffer({ visits: 3, standalone: false, native: false, ios: true }) === "ios" &&
      installOffer({ visits: 9, standalone: true, native: true, ios: true }) === null &&
      installOffer({ visits: 9, standalone: false, native: false, ios: false }) === null,
  );
  check("help tips: a known screen its own, the others the general ones", helpSection("orders") === "orders" && helpSection("history") === "general" && helpSection(null) === "general");
  const tipKeys = [...HELP_SECTIONS, "general"].flatMap(helpTipKeys);
  check("every help tip exists in ar, fr and en", tipKeys.length === (HELP_SECTIONS.length + 1) * 2 && tipKeys.every(inCatalogs), tipKeys.filter((k) => !inCatalogs(k)));

  // every message key the chrome names exists in ar/fr/en, with no em or en dash
  const dir = path.join(process.cwd(), "src/components/admin/shell");
  const files = ["notification-bell.tsx", "store-banner.tsx", "state-page.tsx", "impersonation-ribbon.tsx", "legal-sheet.tsx", "help-sheet.tsx", "install-hint.tsx", "store-switcher.tsx", "app-sidebar.tsx", "topbar.tsx", "use-action-error.ts", "use-pulse.ts", "limit-sheet.tsx"].map((f) => path.join(dir, f));
  const keys = new Set<string>();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(/"((?:shell|team|error)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)"/g)) keys.add(m[1]!);
  }
  const built = [
    ...(["ticket", "onboarding", "abuse_review", "bug", "other"] as const).map((r) => `shell.impersonation.reasons.${r}`),
    ...(["comfortable", "compact"] as const).map((d) => `shell.density.${d}`),
    ...KILL_SWITCHES.filter((k) => k !== "signups_enabled").map((k) => `shell.kill.${k}`),
  ];
  const missing = [...keys, ...built].filter((k) => !inCatalogs(k));
  check(`the ${keys.size} keys the chrome names (and the built ones) exist in ar, fr and en`, keys.size > 60 && missing.length === 0, missing);
  const dashed = [...keys, ...built].flatMap((k) => ADMIN_LOCALES.map((l) => [k, messageOf(k, l) ?? ""] as const)).filter(([, v]) => /[–—]/.test(v));
  check("no em or en dash in the chrome's strings", dashed.length === 0, dashed);
}

/* ================================================================ step p2-08: ⌘K, chords, commands, navigation */

/**
 * The palette's rules (PLA-§22.13, DES-§16.10, core §I.3, §A.2): `commandsFor` over the registry (permission, mode,
 * release; the SF-01 campaign entry), the navigation per mode (hidden, never deleted), the interim R1.0 items, the
 * settings tabs from the registry, the chord listener's guards, typed order ids, the skeleton timing, the local index,
 * the recents, the suggestions, the shortcut sheet, the shell commands and their keys in ar, fr and en.
 */
async function paletteChecks(): Promise<void> {
  const roleCan = (role: StoreRole) => (p: StorePermission) => can(role, p);
  const ctxOf = (role: StoreRole, mode: StoreMode = "landing") => ({ store: { id: "s1", handle: "atlas", name: "Atlas", mode, status: "active" as const }, can: roleCan(role) });
  const noop = () => undefined;

  /* ---- commandsFor: permission, mode, release (SF-01: the campaign entry) ---- */
  const campaign: CommandDef = { id: "landing.new_campaign", label: "shell.cmd.create_page", group: "create", permission: "campaigns.write", mode: "landing", run: noop };
  const product: CommandDef = { id: "catalog.new_product", label: "shell.cmd.create_page", group: "create", permission: "catalog.write", mode: "catalog", release: "R2", run: noop };
  const manual: CommandDef = { id: "ops.manual_order", label: "shell.cmd.create_page", group: "create", permission: "orders.create", run: noop };
  const fixture = [...shellCommands, campaign, product, manual];
  const ids = (role: StoreRole, mode: StoreMode = "landing") => commandsFor(ctxOf(role, mode), fixture).map((c) => c.id);
  check("Create for an owner (landing): page, invite, campaign and manual order; product is R2 and stays hidden", ["shell.create_page", "shell.invite", "landing.new_campaign", "ops.manual_order"].every((id) => ids("owner").includes(id)) && !ids("owner").includes("catalog.new_product"), ids("owner"));
  check("the campaign entry is hidden without campaigns.write (a manager, an agent)", !ids("manager").includes("landing.new_campaign") && !ids("agent").includes("landing.new_campaign"));
  check(
    "the campaign entry follows the landing feature in store mode (A.2: shown in R1, where store rows keep the landing set; hidden from R2 without 'also use landing pages')",
    ids("owner", "store").includes("landing.new_campaign") === modeAllows("store", "landing") && ids("owner", "both").includes("landing.new_campaign"),
  );
  check("an agent gets no Create page, no invite, but the run actions", !ids("agent").includes("shell.create_page") && !ids("agent").includes("shell.invite") && ids("agent").includes("shell.recompute_health") && ids("agent").includes("shell.help"));
  check("the registry holds the shell's commands once each, ids prefixed shell.", COMMANDS.filter((c) => c.id.startsWith("shell.")).length === shellCommands.length && new Set(COMMANDS.map((c) => c.id)).size === COMMANDS.length && shellCommands.every((c) => c.id.startsWith("shell.")));
  check("every shell command's label exists in ar, fr and en", shellCommands.every((c) => inCatalogs(c.label)), shellCommands.filter((c) => !inCatalogs(c.label)).map((c) => c.label));
  check("a health fix finds its command only when the member may run it (PD66)", commandForFix("shell.recompute_health", ctxOf("agent"), fixture)?.id === "shell.recompute_health" && commandForFix("shell.invite", ctxOf("agent"), fixture) === null && commandForFix("nope.missing", ctxOf("owner"), fixture) === null);

  // the shell commands reach the shell through its services (never a DOM in this file)
  const calls: string[] = [];
  const off = provideShellServices({
    openPalette: (page) => calls.push(`palette:${page ?? "root"}`),
    openShortcuts: () => calls.push("shortcuts"),
    openHelp: () => calls.push("help"),
    toggleTheme: () => calls.push("theme"),
    toggleDensity: () => calls.push("density"),
    recomputeHealth: async () => {
      calls.push("health");
    },
    installApp: () => calls.push("install"),
    available: (id) => id !== "shell.install_app",
  });
  const nav: string[] = [];
  const runCtx: CommandCtx = { ...ctxOf("owner"), navigate: (href) => nav.push(href) };
  for (const c of shellCommands) await c.run(runCtx);
  off();
  check(
    "the shell commands run through the services and the router",
    ["palette:stores", "help", "shortcuts", "theme", "density", "palette:language", "health", "install"].every((c) => calls.includes(c)) && nav.includes("/app/atlas/generate") && nav.includes("/app/atlas/team?invite=1") && nav.includes("/app/atlas/notifications"),
    { calls, nav },
  );
  const before = calls.length;
  for (const c of shellCommands) await c.run(runCtx);
  check("without a mounted shell the service commands do nothing (no throw)", calls.length === before);

  /* ---- navigation per mode: hidden, never deleted (§A.2, §I.3) ---- */
  const catalogItem: NavContribution = { group: "catalog", order: 10, item: { id: "products-fixture", label: "nav.pages", href: (h) => appHref(h, "/products"), icon: "Package", mode: "catalog" } };
  const contributions = [...shellContributions(), catalogItem];
  const frozen = contributions.length;
  const navIds = (mode: StoreMode, role: StoreRole = "owner") => storeNav({ handle: "atlas", mode, can: roleCan(role) }, "en", contributions).flatMap((g) => g.items.map((i) => i.id));
  const landing1 = navIds("landing");
  const storeIds = navIds("store");
  const landing2 = navIds("landing");
  check("a catalog item is hidden in landing mode and shown in store and both modes", !landing1.includes("products-fixture") && storeIds.includes("products-fixture") && navIds("both").includes("products-fixture"));
  check("switching back restores exactly the same items (hide, never delete)", JSON.stringify(landing1) === JSON.stringify(landing2) && contributions.length === frozen);
  check("landing items follow modeAllows in store mode (R1 keeps them)", storeIds.includes("pages") === modeAllows("store", "landing") && storeIds.includes("exports") === modeAllows("store", "landing"));
  check("the owner's nav: overview, notifications, media, history, exports, team and the P2 settings tabs", ["overview", "notifications", "media", "history", "exports", "team", "general", "market", "security", "address", "plan", "audit", "danger"].every((id) => landing1.includes(id)), landing1);
  const agentIds = navIds("landing", "agent");
  check("an agent: orders and notifications, no overview, library, team or settings", agentIds.includes("orders") && agentIds.includes("notifications") && !["overview", "media", "history", "team", "general", "audit"].some((id) => agentIds.includes(id)), agentIds);
  check("Plan and Audit need billing.read and audit.read: an editor sees neither", !navIds("landing", "editor").includes("plan") && !navIds("landing", "editor").includes("audit") && navIds("landing", "editor").includes("general"));

  // the interim R1.0 items leave once their owner contributes the item (by id or by link)
  const p4Orders: NavContribution = { group: "sell", order: 10, item: { id: "orders-list", label: "nav.orders", href: (h) => appHref(h, "/orders"), icon: "ReceiptText", permission: "orders.read" } };
  const p3Pages: NavContribution = { group: "landing", order: 10, item: { id: "pages", label: "nav.pages", href: (h) => appHref(h, "/landing-pages"), icon: "PanelsTopLeft", permission: "pages.read" } };
  const merged = shellContributions([...shellNav, p4Orders, p3Pages]);
  const mergedIds = merged.map((c) => c.item.id);
  check("an interim item yields to the owner's item with the same link or the same id", !mergedIds.includes("orders") && mergedIds.includes("orders-list") && mergedIds.filter((id) => id === "pages").length === 1 && mergedIds.includes("generate"));
  check("with no owner items yet every interim item shows exactly once", INTERIM_NAV.every((c) => shellContributions().filter((x) => x.item.id === c.item.id).length === 1));

  // the sidebar folds the settings group; the tabs come from the registry in its order
  const ownerNav = storeNav({ handle: "atlas", mode: "landing", can: roleCan("owner") });
  const side = sidebarNav(ownerNav, "atlas");
  const sideSettings = side.find((g) => g.id === "settings")?.items ?? [];
  check("the sidebar shows one Settings entry opening the first tab", sideSettings.length === 1 && sideSettings[0]!.id === "settings" && sideSettings[0]!.href === "/app/atlas/settings/general");
  check("the Settings entry is active on every settings path; the full nav names the tab", activeNav("/app/atlas/settings/plan", side, "atlas")?.id === "settings" && activeNav("/app/atlas/settings/plan", ownerNav, "atlas")?.id === "plan" && activeNav("/app/atlas", side, "atlas")?.id === "overview");
  const checkout: NavContribution = { group: "settings", order: 30, item: { id: "checkout-fixture", label: "nav.orders", href: (h) => appHref(h, "/settings/checkout"), icon: "Truck", permission: "settings.read" } };
  const tabs = settingsTabs({ handle: "atlas", mode: "landing", can: roleCan("owner") }, "fr", shellContributions([...shellNav, checkout]));
  const tabIds = tabs.map((x) => x.id);
  check("another track's tab appears in the settings sub-nav at its order, without a P2 edit", tabIds.indexOf("checkout-fixture") === tabIds.indexOf("market") + 1 && tabIds.indexOf("checkout-fixture") < tabIds.indexOf("security"), tabIds);
  check("a tab's description is its `_lead` key, none when the catalog has no such key", tabs.find((x) => x.id === "general")?.description === t("shell.settings.general_lead", undefined, "fr") && tabs.find((x) => x.id === "checkout-fixture")?.description === null);
  check("the settings tabs keep the sub-nav's order: General, Market, …, Danger zone last", tabIds[0] === "general" && tabIds[1] === "market" && tabIds.at(-1) === "danger", tabIds);

  /* ---- the chord listener: guards and prevention ---- */
  type Fn = (e: ChordEvent) => void;
  let listener: Fn | null = null;
  const target = { addEventListener: (_: "keydown", fn: Fn) => (listener = fn), removeEventListener: (_: "keydown", fn: Fn) => listener === fn && (listener = null) };
  let clock = 0;
  let overlay = false;
  const got: ChordCommand[] = [];
  const detach = attachChords(target, (c) => got.push(c), { parser: createChordParser(() => clock), overlay: () => overlay, editable: (el) => (el as unknown) === "field" });
  const press = (key: string, extra: Partial<ChordEvent> = {}) => {
    let prevented = false;
    listener?.({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault: () => (prevented = true), ...extra });
    clock += 100;
    return prevented;
  };
  const p1 = press("g");
  const p2 = press("o");
  check("G then O goes to Orders; the completing key is prevented, the G is not", !p1 && p2 && JSON.stringify(got.at(-1)) === JSON.stringify({ kind: "go", target: "orders" }));
  const n0 = got.length;
  press("c", { target: "field" as unknown as EventTarget });
  press("?", { target: "field" as unknown as EventTarget });
  check("nothing fires inside an editable field", got.length === n0);
  overlay = true;
  press("c");
  press("g");
  press("t");
  overlay = false;
  check("nothing fires while an overlay owns the keyboard", got.length === n0);
  const pc = press("k", { metaKey: true });
  check("⌘K and Ctrl chords pass through untouched (the palette's own listener)", !pc && got.length === n0);
  press("c");
  press("?");
  press("/");
  press(">");
  check("C, ?, / and > give Create, the sheet, search and actions", JSON.stringify(got.slice(n0).map((c) => c.kind)) === JSON.stringify(["create", "shortcuts", "search", "actions"]));
  const pn = press("n");
  const p6 = press("6");
  const pj = press("j");
  check("N, 1-6 and J/K are left to the screens (not prevented)", !pn && !p6 && !pj && got.length === n0 + 4);
  const dk = press("x", { defaultPrevented: true } as Partial<ChordEvent>);
  check("a key a screen already handled is ignored", !dk);
  detach();
  check("detaching removes the one listener", listener === null);

  /* ---- typed order ids and the query's mode ---- */
  const pq = parsePaletteQuery;
  check("a typed order id opens its drawer (any case, trimmed)", pq(" ab12-cdef9 ").orderId === "AB12-CDEF9" && pq("/AB12-CDEF9").orderId === "AB12-CDEF9" && pq("AB-123").orderId === null && pq("+212600000000").orderId === null);
  check("> filters actions (no order id), / searches, ? opens the sheet", pq(">ab12-cdef9").mode === "actions" && pq(">ab12-cdef9").orderId === null && pq("/argan").mode === "search" && pq("/argan").q === "argan" && pq("?").shortcuts && !pq("? help").shortcuts && pq("argan").mode === "all");
  check("the drawer link only for orders.read, in the store on screen", orderDrawerHref("atlas", "AB12-CDEF9", true) === "/app/atlas/orders?order=AB12-CDEF9" && orderDrawerHref("atlas", "AB12-CDEF9", false) === null && orderDrawerHref("atlas", null, true) === null);

  /* ---- the server answer's timing: 120 ms debounce, skeleton after 150 ms, held 300 ms ---- */
  check("the timing constants of PLA-§22.13", SEARCH_DEBOUNCE_MS === 120 && SKELETON_AFTER_MS === 150 && PALETTE_SKELETON_MIN_MS === 300);
  check("no skeleton before 150 ms; a fast answer never shows one", !skeletonVisible(0, null, 149) && skeletonVisible(0, null, 150) && !skeletonVisible(0, 120, 130) && revealAt(0, 120) === 120);
  check("a slow answer keeps the skeleton 300 ms after it appeared", skeletonVisible(0, 200, 300) && skeletonVisible(0, 200, 449) && !skeletonVisible(0, 200, 450) && revealAt(0, 200) === 450 && revealAt(0, 900) === 900);

  /* ---- the local index ---- */
  const many = Array.from({ length: 400 }, (_, i) => ({ userId: `u${i}`, name: `Member ${i}`, role: "agent" }));
  const base = { handle: "atlas", nav: ownerNav.flatMap((g) => g.items), tabs: settingsTabs({ handle: "atlas", mode: "landing", can: roleCan("owner") }), pages: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Argan oil ${i}`, slug: `argan-${i}`, status: "published" })), roleLabel: (r: string) => r };
  const big = buildLocalIndex({ ...base, members: many, canReadMembers: true });
  check("the local index holds at most 300 entries, nav and tabs first", big.length === LOCAL_INDEX_MAX && big[0]!.kind === "nav" && big.some((e) => e.kind === "setting"));
  const small = buildLocalIndex({ ...base, members: many.slice(0, 3), canReadMembers: false });
  check("20 recent pages at most, no member without members.read, every link in the store", small.filter((e) => e.kind === "page").length === 20 && !small.some((e) => e.kind === "member") && small.every((e) => e.href.startsWith("/app/atlas")));
  check("settings tabs are indexed as settings, not as nav items", !small.some((e) => e.kind === "nav" && e.id === "general") && small.some((e) => e.kind === "setting" && e.id === "general"));
  const m = matchLocal(small, "argan oil 1");
  check("matching: a title prefix ranks first, at most 6 per kind", m.page[0]?.title === "Argan oil 1" && m.page.length <= 6);
  check("matching folds case and accents, and reads keywords", matchLocal(small, "ÉQUIPE").nav.some((e) => e.id === "team") && matchLocal(small, "2fa").setting.some((e) => e.id === "security"));

  /* ---- recents: per store and member, swept with the store's client state ---- */
  const key = recentsKey("s1", "u1");
  check("the recents key is swept on a store switch and sign-out", storeKeyMatches(key, "s1", "u1") && !storeKeyMatches(key, "s2", "u1"));
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  let list: RecentEntry[] = [];
  for (let i = 0; i < 15; i++) list = pushRecent(list, { kind: "page", id: `p${i}`, title: `Page ${i}`, href: `/app/atlas/pages/p${i}/edit` }, i);
  list = pushRecent(list, { kind: "page", id: "p3", title: "Page 3", href: "/app/atlas/pages/p3/edit" }, 99);
  check("a reopened entry moves first, without a copy; at most 12 kept", list[0]!.id === "p3" && list.filter((r) => r.id === "p3").length === 1 && list.length === RECENTS_KEPT);
  check("a nav jump or an action is never a recent", pushRecent([], { kind: "nav", id: "orders", title: "Orders", href: "/app/atlas/orders" }, 1).length === 0);
  writeRecents(() => fake as unknown as Storage, key, list);
  store.set(key, JSON.stringify([...JSON.parse(store.get(key)!), { kind: "page", id: "x", title: "Elsewhere", href: "/app/baraka/pages/x/edit", at: 1000 }, { kind: "order", id: "y", title: "", href: "/app/atlas/orders", at: 1001 }, "junk"]));
  const back = readRecents(() => fake as unknown as Storage, key, "atlas");
  check("stored recents of another store, malformed ones and junk are dropped; newest first", back.length === RECENTS_KEPT && back.every((r) => r.href.startsWith("/app/atlas/")) && back[0]!.id === "p3");
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  check("a blocked storage reads nothing and writes nothing, without throwing", readRecents(() => blocked as unknown as Storage, key, "atlas").length === 0 && writeRecents(() => blocked as unknown as Storage, key, list) === false);

  /* ---- suggestions by role and mode (DES-§16.10 first open) ---- */
  const sug = (role: StoreRole, navIds: readonly string[] = ["orders", "pages"]) =>
    paletteSuggestions({ role, mode: "landing", can: roleCan(role), nav: new Map(navIds.map((id) => [id, `/app/atlas/${id}`])), handle: "atlas" }).map((s) => s.def.id);
  check("an owner starts with a new landing page, at most 4 suggestions", sug("owner")[0] === "new_page" && sug("owner").length === SUGGESTIONS_MAX, sug("owner"));
  check("an agent starts with the call queue and never gets a page to build", sug("agent")[0] === "call_queue" && !sug("agent").includes("new_page"), sug("agent"));
  check("Brand shows only once its screen is in the nav", !sug("owner").includes("brand") && sug("owner", ["orders", "brand"]).includes("brand"));
  check("every suggestion label exists in ar, fr and en", Object.values(SUGGESTIONS).every((s) => inCatalogs(s.label)));

  /* ---- the G targets and the shortcut sheet ---- */
  const navMap = new Map(ownerNav.flatMap((g) => g.items.map((i) => [i.id, i.href] as const)));
  const ownerGo = goHrefs({ handle: "atlas", nav: navMap, firstSettingsHref: "/app/atlas/settings/general", can: roleCan("owner") });
  const agentGo = goHrefs({ handle: "atlas", nav: new Map([["orders", "/app/atlas/orders"]]), firstSettingsHref: null, can: roleCan("agent") });
  // since the P4 merge the owner's nav carries P4's Queue item (agents.self), which an editor's nav never has
  const editorNavMap = new Map([...navMap].filter(([id]) => id !== "queue"));
  const editorGo = goHrefs({ handle: "atlas", nav: editorNavMap, firstSettingsHref: "/app/atlas/settings/general", can: roleCan("editor") });
  check("G targets: the member's screens, Settings to the first tab, the queue only with agents.self", ownerGo.orders === "/app/atlas/orders" && ownerGo.settings === "/app/atlas/settings/general" && ownerGo.queue === "/app/atlas/queue" && editorGo.queue === undefined && ownerGo.overview === "/app/atlas");
  check("an agent's G Q reaches the queue alias; no settings", agentGo.queue === "/app/atlas/queue" && agentGo.settings === undefined);
  const sections = shortcutSections({ mod: "Ctrl", show: (x) => x === "switch_store" || editorGo[x as keyof typeof editorGo] !== undefined, queue: false, label: (k) => t(k) });
  const goRows = sections.find((x) => x.id === "go")?.rows ?? [];
  check("the sheet lists only the G targets the member can open, as G then the key", goRows.some((r) => r.id === "go.orders" && JSON.stringify(r.keys) === '[["G"],["O"]]') && !goRows.some((r) => r.id === "go.queue") && goRows.some((r) => r.id === "go.switch_store"));
  check("the queue keys only for the call roles", !sections.some((x) => x.id === "queue") && shortcutSections({ mod: "⌘", show: () => true, queue: true, label: (k) => k }).some((x) => x.id === "queue"));
  check("every G target has a second key and a label in ar, fr and en", GO_ORDER.length === Object.keys(GO_CHORDS).length && GO_ORDER.every((g) => GO_KEY_OF[g] && inCatalogs(`shell.shortcuts.go.${g}`)));

  /* ---- every key the palette, the sheet, the commands and the settings frame name exists in ar, fr and en ---- */
  const dir = path.join(process.cwd(), "src/components/admin");
  const files = ["shell/command-palette.tsx", "shell/command-palette-body.tsx", "shell/shortcut-sheet.tsx", "shell/chords.ts", "shell/palette-logic.ts", "shell/commands/shell.ts", "shell/nav/t4.ts", "settings/settings-nav.tsx", "shell/topbar.tsx", "shell/app-sidebar.tsx"].map((f) => path.join(dir, f));
  const keys = new Set<string>();
  const commandIds = new Set(COMMANDS.map((c) => c.id));
  // command ids ("shell.help") are names, not catalog keys
  for (const file of files) for (const mm of readFileSync(file, "utf8").matchAll(/"((?:shell|team|nav)\.[a-z0-9_]+(?:\.[a-z0-9_]+)*)"/g)) if (!commandIds.has(mm[1]!)) keys.add(mm[1]!);
  const built = [
    ...ADMIN_LOCALES.map((l) => `shell.cmdk.lang.${l}`),
    ...["draft", "published", "archived"].map((s) => `shell.cmdk.page.${s}`),
    ...(["create", "run", "jump"] as const).map((g) => `shell.cmdk.group.${g}`),
    ...[...shellNav, ...INTERIM_NAV].filter((c) => c.group === "settings").map((c) => tabLeadKey(c.item.label)),
    ...ACTIVE_STORE_ROLES.map((r) => `team.role.${r}`),
  ];
  const missing = [...keys, ...built].filter((k) => !inCatalogs(k));
  check(`the ${keys.size} keys the palette and the nav name (and the built ones) exist in ar, fr and en`, keys.size > 60 && missing.length === 0, missing);
  const dashed = [...keys, ...built].flatMap((k) => ADMIN_LOCALES.map((l) => [k, messageOf(k, l) ?? ""] as const)).filter(([, v]) => /[–—]/.test(v));
  check("no em or en dash in the palette's strings", dashed.length === 0, dashed);
}

/* ---- the dashboard composer (p2-09; PLA-§22.17, §22.16, §22.6; D54) ---- */
async function dashboardChecks(): Promise<void> {
  const DAY = (i: number) => `2026-10-${String(i + 1).padStart(2, "0")}`;
  // two real orders (200 MAD each) and one test order (99 MAD) today: T3's stats never count the test order, P4's queue does
  const series = Array.from({ length: 28 }, (_, i) => ({ day: DAY(i), count: i === 27 ? 2 : 0, cents: i === 27 ? 40_000 : 0, visitors: 10 }));
  const placed = {
    ok: true as const,
    data: { from: DAY(21), to: DAY(27), count: 2, cents: 40_000, visitors: 70, previous: { count: 1, cents: 20_000, visitors: 60 }, today: { count: 2, cents: 40_000, visitors: 10 }, series },
  };
  const kpi = (value: number, n: number) => (n >= 30 ? { value, n } : { insufficient: true as const, n, min: 30 });
  const k = {
    window: "7d" as const,
    placed: 2,
    confirmed: 1,
    delivered: 0,
    decided: 2,
    confirmationRate: kpi(50, 2),
    deliveryRate: kpi(0, 0),
    firstTouchP50Min: kpi(4, 2),
    unreachableRate: kpi(0, 0),
    riskyShare: kpi(0, 2),
    lastOrderAt: "2026-10-28T09:00:00Z",
    computedAt: "2026-10-28T10:00:00Z",
  };
  type KpisPanel = Parameters<typeof composeTiles>[0]["kpis"];
  const kpis = { ok: true, data: { today: k, range: k } } as unknown as KpisPanel;
  const tiles = composeTiles({ kpis, placed, range: "7d" });
  const tile = (id: string) => tiles.find((x) => x.id === id);
  check("the six COD tiles in the spec's order", tiles.map((x) => x.id).join() === "placed_count,confirmed,delivered,first_touch,placed_money,cash", tiles.map((x) => x.id));
  check(
    "the money tile is the real orders' value: the test order is left out",
    tile("placed_money")?.value === 40_000 && tiles.filter((x) => x.kind === "money" && x.value !== null).every((x) => x.value === 40_000),
  );
  check(
    "delivered and cash to collect are R2: the hint, never a number",
    ["delivered", "cash"].every((id) => tile(id)?.value === null && tile(id)?.hint.key === "shell.honest.r2_delivery"),
  );
  check("the confirmation rate below 30 orders says what it needs, not a percent", tile("confirmed")?.hint.key === "shell.dash.tile.rate_needs" && tile("confirmed")?.n === 2);
  check("first touch below the sample has no number", tile("first_touch")?.value === null);
  check("placed, confirmed and delivered never share a tile", new Set(tiles.map((x) => x.label.key)).size === tiles.length);
  check("a delta needs a period that had something (no +∞ %)", pctChange(5, 0) === null && pctChange(3, 2) === 50 && tiles[0]?.delta?.pct === 100);
  check("the sparkline only from 7 daily points", tiles[0]?.spark?.length === 7);
  const noP4 = composeTiles({ kpis: { ok: false, reason: "unavailable" }, placed, range: "7d" });
  check("P4 unavailable: its tiles are left out, never a made-up 0", noP4.map((x) => x.id).join() === "placed_count,delivered,placed_money,cash");
  const big = { ...k, confirmed: 30, decided: 40, confirmationRate: kpi(75, 40) };
  const bigTiles = composeTiles({ kpis: { ok: true, data: { today: big, range: big } } as unknown as KpisPanel, placed, range: "7d" });
  check("with n ≥ 30 the rate is confirmed ÷ decided", confirmationPct(big) === 75 && bigTiles.find((x) => x.id === "confirmed")?.hint.vars?.rate === 75);
  type QueuePanel = Parameters<typeof workLines>[0]["queue"];
  const queue = { ok: true, data: { toCallNow: 3, callbacksDue: 0, waitingRetry: 0, firstTouchBreaches: 0, abandonedToday: 0, liveAgents: 0, oldestCallbackOverdueMin: null, deliveryRescue: 0, oldestRescueMin: null, toShip: 0 } } as unknown as QueuePanel;
  const all = () => true;
  const work = workLines({ queue, pulse: null, sheet: null, can: all });
  check("the test order is counted in the queue line (it is real work)", work.find((l) => l.id === "to_call")?.count === 3, work);
  check(
    "the queue line of the brief counts it too",
    todayBrief({ kpisToday: k, queue: { queueNow: 3, dueCallbacks: 0 }, worstIssue: null, href: (x) => appHref("atlas", x) }).some((l) => l.key === "brief.queue" && l.vars.count === 3),
  );
  check("the live pulse wins over the server's read", workLines({ queue, pulse: { queueNow: 4 }, sheet: null, can: all }).find((l) => l.id === "to_call")?.count === 4);
  check("a counter no source answers is left out", workLines({ queue: null, pulse: null, sheet: null, can: all }).length === 0);
  check("no order work list without orders.read", workLines({ queue, pulse: { queueNow: 4 }, sheet: null, can: (perm) => perm !== "orders.read" }).every((l) => l.id === "leads"));
  const steps = funnelSteps({
    window: "7d",
    steps: [
      { id: "placed", n: 2 },
      { id: "confirmed", n: 1 },
      { id: "shipped", n: null },
      { id: "delivered", n: null },
      { id: "collected", n: null },
    ],
    confirmationRate: kpi(50, 2),
  } as Parameters<typeof funnelSteps>[0]);
  check("the funnel: R1's two steps, the rest null (the R2 line)", steps.map((st) => st.value).join() === "2,1,,," && steps.every((st) => inCatalogs(st.label)));
  // Store Health: the local pass before the first run, the pending filter, the score policy, the celebration
  const local = healthIssuesFor({ health: null, setup: { contact: { phone: null, whatsapp: null }, legalName: null, members: null }, status: "active" });
  check("before the first run the local setup pass lists the setup issues", local?.source === "local" && local.issues.length > 0);
  type Snapshot = NonNullable<Parameters<typeof healthIssuesFor>[0]["health"]>;
  const first = local?.issues[0];
  if (first) {
    const snap = {
      score: 70,
      attention: 1,
      components: { setup: 0, trust: 0, design: 0, conversion: 0, operations: 0, integrations: 0, quota: 0 },
      issues: [{ ...first, id: "ops:x", group: "operations" }, first],
      snoozed: {},
      metrics: {},
      milestones: {},
      dormant: false,
      computedAt: "2026-10-28T10:00:00Z",
      dirty: false,
      staleAfterMin: 45,
    } as unknown as Snapshot;
    check("a pending store keeps the setup and trust groups only", healthIssuesFor({ health: snap, setup: null, status: "pending" })?.issues.every((i) => i.group === "setup" || i.group === "trust") === true);
    check("a restricted store keeps its operations issues", healthIssuesFor({ health: snap, setup: null, status: "restricted" })?.issues.some((i) => i.group === "operations") === true);
    const wired = wireIssue(first, "atlas-argan");
    const back = unwireIssue(JSON.parse(JSON.stringify(wired)) as typeof wired);
    check(
      "a link fix crosses to the browser as the store's path",
      wired.fix.kind === "link" && wired.fix.path.startsWith("/app/atlas-argan/") && back.fix.kind === "link" && back.fix.href("other") === wired.fix.path,
    );
  }
  check("nothing to list from: null, not an empty 'all good'", healthIssuesFor({ health: null, setup: null, status: "active" }) === null);
  check(
    "showScoreToTenantsBelowN hides the number below n orders",
    scoreHidden({ hideScoreBelow: 10, orders: 3 }) && !scoreHidden({ hideScoreBelow: 10, orders: 10 }) && !scoreHidden({ hideScoreBelow: 0, orders: null }) && scoreHidden({ hideScoreBelow: 5, orders: null }),
  );
  check("the celebration: ≥ 90 and no severity-3 issue", celebrates(90, [{ severity: 2 }]) && !celebrates(89, []) && !celebrates(95, [{ severity: 3 }]) && !celebrates(null, []));
  // the stale dot: neutral exactly past staleAfterMin, never a fixed hour
  const at = "2026-10-28T09:15:00Z";
  check(
    "stale-dot math follows staleAfterMin to the minute",
    healthFresh(at, 45, new Date("2026-10-28T10:00:00Z")) && !healthFresh(at, 45, new Date("2026-10-28T10:00:01Z")) && healthFresh(at, 24 * 60, new Date("2026-10-29T09:00:00Z")),
  );
  // "Revenue" appears nowhere in the dashboard's components (PLA-§22.17 acceptance)
  const dashDir = path.join(process.cwd(), "src", "components", "admin", "dashboard");
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(dashDir).filter((f) => /\.(tsx?|css)$/.test(f));
  const hits = files.filter((f) => /revenue/i.test(readFileSync(path.join(dashDir, f), "utf8")));
  check("'Revenue' appears nowhere in src/components/admin/dashboard/**", files.length >= 5 && hits.length === 0, hits);
  // the notification centre: the keyset cursor and the link rule
  check("the centre's cursor round-trips", decodeCentreCursor(encodeCentreCursor([900, 451])).join() === "900,451" && encodeCentreCursor([]) === "-" && decodeCentreCursor("-").length === 0);
  check(
    "a malformed cursor is the first page",
    decodeCentreCursor("zz.!").length === 0 && decodeCentreCursor("0").length === 0 && decodeCentreCursor(Array(CENTRE_CURSOR_DEPTH + 1).fill("a").join(".")).length === 0 && decodeCentreCursor(42).length === 0,
  );
  const pg1 = centrePager([], 120, true);
  const pg2 = centrePager([120], 70, false);
  check("Next carries the stack, Previous drops its last id", pg1.prev === null && decodeCentreCursor(pg1.next).join() === "120" && pg2.next === null && pg2.prev === "-");
  check(
    "a notification link follows the PLA-§18.1 rule, else plain text",
    notificationHref("/app/atlas-argan/") === "/app/atlas-argan/" &&
      notificationHref("/app/atlas-argan#health") !== null &&
      notificationHref("/app/account?doc=terms") !== null &&
      notificationHref("/app/ab") === null &&
      notificationHref("/app/Atlas/x") === null &&
      notificationHref("/app/atlas/x y") === null &&
      notificationHref("/app/atlas\\x") === null &&
      notificationHref("/s/atlas-argan") === null,
  );
  const dashKeys = ["shell.dash.meta", "shell.dash.lead", "shell.dash.kpis", "shell.dash.work.title", "shell.dash.integrations.title", "shell.dash.funnel.title", "shell.kpi.vs_period", "shell.notifications.lead", "shell.notifications.empty_group", "health.all_good_short", "health.read_only"];
  const missing = [...dashKeys, ...tiles.flatMap((x) => [x.label.key, x.hint.key]), ...work.map((l) => l.key)].filter((key) => !inCatalogs(key));
  check("the dashboard's and the centre's keys exist in ar, fr and en", missing.length === 0, missing);
}

/* ------------------------------------------------------------------ */
/* the welcome flow (p2-12; PLA-§22.2, UX-01, PD23, core D59)          */
/* ------------------------------------------------------------------ */

/** Files a module graph reaches from `entries`: relative and `@/` specifiers resolved, bare ones kept by name. */
function importGraph(entries: readonly string[]): { files: Set<string>; bare: Set<string> } {
  const root = process.cwd();
  const files = new Set<string>();
  const bare = new Set<string>();
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(path.join(root, from)), spec) : null;
    if (base === null) return null;
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      try {
        readFileSync(base + ext, "utf8");
        return path.relative(root, base + ext).split(path.sep).join("/");
      } catch {
        // the next extension
      }
    }
    return "";
  };
  const stack = [...entries];
  while (stack.length) {
    const file = stack.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const src = readFileSync(path.join(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // a server action module is a reference in the client graph, not code the browser loads
    if (/^\s*["']use server["']/.test(src)) continue;
    for (const m of src.matchAll(/(import|export)(\s+type)?\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|new URL\(\s*["']([^"']+)["']/g)) {
      if (m[2]) continue; // type-only: erased
      const spec = m[3] ?? m[4] ?? m[5] ?? m[6]!;
      const target = resolve(file, spec);
      if (target === null) bare.add(spec);
      else if (target) stack.push(target);
    }
  }
  return { files, bare };
}

/** What the welcome client graph must never load before the reveal (core D59): the local models and their runtimes. */
const MODEL_FILE = /^src\/lib\/ai\/(local|worker)\/|siglip|vlm|transformers/i;
const MODEL_PACKAGE = /transformers|onnxruntime|siglip|@mlc-ai|web-llm/i;
const modelImports = (g: { files: Set<string>; bare: Set<string> }) => [...[...g.files].filter((f) => MODEL_FILE.test(f)), ...[...g.bare].filter((b) => MODEL_PACKAGE.test(b))];

async function welcomeChecks(): Promise<void> {
  const W = await import("@/app/app/[store]/welcome/_components/flow-logic");
  const A = await import("@/app/app/[store]/welcome/_components/directions-adapter");

  // the step machine: resume, the views still open, transitions, skip
  check("a new flow opens on photos", W.initialView("photos", undefined, false) === "photos");
  check("a reload resumes on the saved step", W.initialView("reveal", undefined, false) === "reveal" && W.initialView("contact", undefined, true) === "contact");
  check("?step= opens an earlier step that is still open", W.initialView("reveal", "details", false) === "details" && W.initialView("reveal", "photos", false) === "photos");
  check("?step= never jumps ahead of the saved step", W.initialView("details", "reveal", false) === "details" && W.initialView("reveal", "contact", false) === "reveal");
  check("once the page exists the steps before contact are closed", W.initialView("contact", "reveal", true) === "contact" && W.initialView("done", "details", true) === "done");
  check("done shows only once the flow is done", W.initialView("contact", "done", true) === "contact" && W.initialView("done", "done", true) === "done" && W.initialView("done", "contact", true) === "contact");
  check("a skipped flow has no view (the dashboard)", W.initialView("skipped", "photos", false) === null);
  check("an unknown ?step= is ignored", W.initialView("details", "admin", false) === "details");
  check("the steps run photos → details → reveal → contact → done", W.FLOW_STEPS.slice(0, -1).map((s) => W.nextView(s)).join() === "details,reveal,contact,done" && W.nextView("done") === "done");
  check("details reached in the browser (not saved) keeps Back to photos", W.previousView("details", W.reachedStep("photos", "details"), false) === "photos");
  check("Back from the reveal edits the details", W.previousView("reveal", "reveal", false) === "details");
  check("no Back once the page exists, none on the first step", W.previousView("contact", "contact", true) === null && W.previousView("photos", "reveal", false) === null);
  check("skip is offered until the page exists", W.canSkip("photos", false) && W.canSkip("reveal", false) && !W.canSkip("contact", true) && !W.canSkip("reveal", true));
  check("the progress fills one segment per step, done fills all", W.progressOf("photos") === 1 && W.progressOf("contact") === 4 && W.progressOf("done") === W.PROGRESS_SEGMENTS);

  // the typed price (PD23): integer minor units, never rounded, never invented
  const prices: [string, number | null][] = [["199", 19_900], ["199.5", 19_950], ["199,50", 19_950], ["1 299", 129_900], ["١٩٩", 19_900], [" 45 ", 4_500], ["19.999", null], ["0", null], ["", null], ["abc", null], ["-5", null], ["1.299,00", null], ["1000000", 100_000_000], ["1000000.01", null]];
  const wrong = prices.filter(([text, minor]) => W.parsePrice(text) !== minor);
  check("prices parse to integer minor units (Latin and Arabic digits, comma or dot)", wrong.length === 0, wrong);
  check("the field shows minor units back as typed", W.priceText(19_900) === "199" && W.priceText(19_950) === "199.50" && W.priceText(5) === "0.05" && W.priceText(null) === "");
  check("the price before is kept only when higher", W.keptCompareAt(19_900, 25_000) === 25_000 && W.keptCompareAt(19_900, 19_900) === null && W.keptCompareAt(19_900, 10_000) === null && W.keptCompareAt(19_900, null) === null);
  const ok = { category: "beauty", productName: "Argan oil", price: "199", compareAt: "", fact: "" };
  check("complete details have no error", Object.keys(W.detailsErrors(ok)).length === 0);
  check("the category tap is required", W.detailsErrors({ ...ok, category: null }).category === "onboarding.category_required");
  check("the price is required and must be a price", W.detailsErrors({ ...ok, price: "" }).priceMinor === "onboarding.price_required" && W.detailsErrors({ ...ok, price: "12.345" }).priceMinor === "onboarding.price_invalid");
  check("a price before not above the price is refused", W.detailsErrors({ ...ok, compareAt: "150" }).compareAtMinor === "onboarding.compare_invalid" && W.detailsErrors({ ...ok, compareAt: "199" }).compareAtMinor === "onboarding.compare_invalid" && !W.detailsErrors({ ...ok, compareAt: "249" }).compareAtMinor);
  check("the name is required", W.detailsErrors({ ...ok, productName: "  " }).productName === "onboarding.name_required");

  // the reveal input: only what the owner typed (no rating, no stock), the store's own photos, the seed
  const draft = { category: "beauty" as const, productName: "Argan oil", priceMinor: 19_950, compareAtMinor: 15_000, fact: "100 ml", assetIds: ["a1b2c3d4e5f6a7b8"] };
  const ctxOf = { palette: null, photos: [], locale: "ar" as const, market: "MA" as const, seedBase: 7 };
  const input = A.revealInputOf(draft, ctxOf);
  const product = input.product as Record<string, unknown>;
  check("the reveal carries the typed price in major units", product.price === 199.5);
  check("a price before below the price never reaches the reveal", !("compareAt" in product));
  check("a higher price before does", (A.revealInputOf({ ...draft, compareAtMinor: 25_000 }, ctxOf).product as Record<string, unknown>).compareAt === 250);
  check("no rating, stock or review is put on the product", !["rating", "stock", "reviews", "sold"].some((k) => k in product));
  check("the typed fact is the only fact", input.facts.join() === "100 ml" && A.revealInputOf({ ...draft, fact: null }, ctxOf).facts.length === 0);
  check("the photos are the draft's", JSON.stringify(product.images) === JSON.stringify([{ id: "a1b2c3d4e5f6a7b8", alt: "" }]) && input.seedBase === 7 && input.category === "beauty");
  const packs = { id: "bloom", label: "Bloom", card: null, doc: { offers: { bundles: [{ lines: [{ qty: 1 }], price: 149, badge: "none" }, { lines: [{ qty: 2 }], price: 269, badge: "popular" }, { lines: [{ qty: 3 }], price: 349, badge: "best" }] } } } as unknown as Parameters<typeof A.typedOffersOnly>[0];
  const kept = A.typedOffersOnly(packs, 14_900).doc.offers.bundles;
  check("the reveal keeps the one-piece offer at the typed price, never a suggested pack or badge", kept.length === 1 && kept[0]!.price === 149 && kept[0]!.badge === "none", kept);
  check("a direction without a typed one-piece offer is left as made", A.typedOffersOnly(packs, 15_000) === packs);
  const base = W.revealSeed("brand-seed-1");
  check("the seed is stable per store and differs per round", base === W.revealSeed("brand-seed-1") && base !== W.revealSeed("brand-seed-2") && new Set([0, 1, 2].map((r) => W.roundSeed(base, r))).size === 3 && W.roundSeed(base, 5) < 2_147_483_647);

  // contact: the masked phone of the toggle and the typed number
  check("the signup phone is masked to its first and last digits", W.maskSignupPhone("+212612345634") === "+212 6•• ••• •34", W.maskSignupPhone("+212612345634"));
  check("a number that is not E.164 has no mask", W.maskSignupPhone("0612") === null);
  check(
    "a Moroccan number typed nationally becomes E.164",
    W.typedWhatsapp("06 12 34 56 78", "MA") === "+212612345678" && W.typedWhatsapp("00212612345678", "MA") === "+212612345678" && W.typedWhatsapp("+33 6 12 34 56 78", "MA") === "+33612345678" && W.typedWhatsapp("212712345678", "MA") === "+212712345678",
  );

  // the critical path has no model on it (core D59): the client graph of /welcome never reaches the local AI
  const dir = "src/app/app/[store]/welcome/_components";
  const graph = importGraph([`${dir}/welcome-flow.tsx`, `${dir}/welcome-header.tsx`]);
  check("the welcome client graph reaches the reveal and the generator", ["src/components/generate/reveal/RevealFolds.tsx", "src/components/generate/reveal/directions.ts", "src/components/generate/kit.ts"].every((f) => graph.files.has(f)), [...graph.files].filter((f) => f.includes("generate")));
  check("the welcome client graph imports no local model, worker, transformers, SigLIP or VLM code", modelImports(graph).length === 0, modelImports(graph));
  check("the import-graph check catches a model worker (control)", modelImports(importGraph(["src/lib/ai/client.ts"])).length > 0);

  // the onboarding copy exists in ar, fr and en
  const keys = new Set<string>();
  for (const f of ["welcome-flow.tsx", "step-photos.tsx", "step-reveal.tsx", "welcome-header.tsx", "done-step.tsx", "flow-logic.ts"]) for (const m of readFileSync(path.join(dir, f), "utf8").matchAll(/"((?:onboarding|shell\.field|shell\.review|shell\.address|health)\.[a-z0-9_.]+)"/g)) keys.add(m[1]!);
  const missingKeys = [...keys].filter((k) => !inCatalogs(k));
  check("the welcome flow's keys exist in ar, fr and en", keys.size > 20 && missingKeys.length === 0, missingKeys);
}

ruleChecks()
  .then(searchChecks)
  .then(manifestChecks)
  .then(actionInputChecks)
  .then(primitiveChecks)
  .then(chromeChecks)
  .then(paletteChecks)
  .then(dashboardChecks)
  .then(welcomeChecks)
  .catch((err: unknown) => check("the rule and search checks ran", false, String(err)))
  .finally(() => {
    console.log(`test:shell: ${passed} passed, ${failures} failed`);
    if (failures) process.exit(1);
  });
