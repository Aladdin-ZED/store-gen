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
 * fixture with no cross-store evidence. Exits 1 on any failure.
 */
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
import { CORE_ERROR_CODES, errorUi, PLATFORM_ERROR_CODES, resultErrorUi, type CoreErrorCode } from "./error-map";
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

ruleChecks()
  .catch((err: unknown) => check("the rule checks ran", false, String(err)))
  .finally(() => {
    console.log(`test:shell: ${passed} passed, ${failures} failed`);
    if (failures) process.exit(1);
  });
