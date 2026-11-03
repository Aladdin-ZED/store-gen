/**
 * The shell's pure self-test (PLA-§O.1 `test:shell`, core §J.1; rev 6 P0b, CCR P2-1):
 *   npm run test:shell        (tsx src/components/admin/shell/selftest.ts; offline, no DB, no React render)
 *
 * Step p2-02 (viewer-locale rendering, core §I.5, D36): which screens render in the viewer's language
 * (`screenLocalesFor`), the fallback to English (`screenLocale`), the store-relative path (`storeRelativePath`), and
 * the settings tabs' labels in every locale (`settingsText`). Later steps add their pure checks here (PLA-§O.1 row).
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
import { ACTIVE_STORE_ROLES, can, STORE_ROLES } from "@/lib/auth/permissions";
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
import { KILL_SWITCHES } from "@/lib/flags/registry";
import type { HealthInputs, HealthIssue } from "@/lib/health/types";
import { fixtures as shellFixtures, localSetupIssues, rules as shellRules, shellFactsOf } from "@/lib/health/rules/shell";
import { ADMIN_LOCALES, messageOf, t } from "@/lib/i18n/admin";
import { appHref } from "@/lib/urls";
import { modeAllows, STORE_MODES } from "@/lib/tenancy/mode";
import type { ActionErrorCode, StoreRow, StoreScope } from "@/lib/tenancy/types";
import { dismissalActive, pickBanners, statePage, type BannerState } from "./banner-priority";
import { createChordParser, GO_CHORDS, isEditable, orderIdOf, overlayOpen, type ChordKey } from "./chords";
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
import { screenLocale, screenLocalesFor, settingsText, SETTINGS_NAV, storeRelativePath, TRILINGUAL_SCREENS } from "./store-nav";

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

/* ---- settingsText: every settings tab has its label and description in ar / fr / en ---- */
for (const item of SETTINGS_NAV) {
  for (const part of ["label", "description"] as const) {
    const key = part === "label" ? item.labelKey : item.descriptionKey;
    check(
      `settings ${item.id} ${part} has a catalog key`,
      ADMIN_LOCALES.every((l) => messageOf(key, l) !== undefined),
      key,
    );
    check(`settings ${item.id} ${part} in en is the fallback text`, settingsText(item, part, "en") === item[part], {
      en: settingsText(item, part, "en"),
      fallback: item[part],
    });
  }
  check(`settings ${item.id} is translated`, settingsText(item, "label", "ar") !== item.label);
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
  check("a settings section matches by its id for a French viewer, titled in French", general[0]?.id === "general" && general[0]?.title === settingsText(SETTINGS_NAV.find((i) => i.id === "general")!, "label", "fr") && general[0]?.href === "/app/atlas/settings/general", general);
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

ruleChecks()
  .then(searchChecks)
  .then(manifestChecks)
  .then(actionInputChecks)
  .then(primitiveChecks)
  .catch((err: unknown) => check("the rule and search checks ran", false, String(err)))
  .finally(() => {
    console.log(`test:shell: ${passed} passed, ${failures} failed`);
    if (failures) process.exit(1);
  });
