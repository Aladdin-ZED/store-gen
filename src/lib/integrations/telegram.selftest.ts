/**
 * Telegram self test (P5 INTEGRATIONS; operations.md OPE-§21.1-§21.3, §26, §28.1, OPE-§L, OPE-§O.1 "telegram",
 * OPE-§O.4 IN-04; OD17, OD23, OD38, OD52; core §H.1). Offline: no database, no network, no server module. It is the
 * "telegram" section of scripts/qa/conversions-check.ts (`test:conversions`), and runs alone too:
 *
 *   npx tsx src/lib/integrations/telegram.selftest.ts      (exit code 1 on failure)
 *
 * - the batch: ≤ 10 order lines in one message, the rest counted, the header's count, window and total;
 * - "[TEST]" only on test orders and only with the switch (`notifications.testOrders`), "(renvoi)" on a re-send;
 * - the honest triad (OD38) over every `int.tg.*` string of the three catalogs: no string names two of placed /
 *   confirmed / delivered; every key exists in ar, fr and en;
 * - the minimum n (OD17): a rate only with its value and n ≥ min, the count alone otherwise; a missing figure left out;
 * - the cash-held line skipped for an account settled at delivery (OD52);
 * - ≤ 3,500 characters whatever the input; no emoji, no em dash in any text or catalog string;
 * - the masked level never shows the full phone or the address;
 * - the wire: 401 / 403 / "chat not found" final, 429 with retry_after, 5xx retried, another 4xx final for the message;
 *   the chats of an update list (titles and types only, once each);
 * - the items: dedupe keys, `pii` false, no token or customer field in a payload, the merge key, the incident rule.
 */
import { messages as arCatalog } from "@/lib/i18n/admin/ar/integrations";
import { messages as enCatalog } from "@/lib/i18n/admin/en/integrations";
import { messages as frCatalog } from "@/lib/i18n/admin/fr/integrations";
import { NotificationsSetting } from "@/lib/settings/keys/notifications";
import { incidentMessage, messageSkip, telegramBatchKey, telegramItem, TelegramPayload, SHEETS_INCIDENT_AFTER_MS } from "./telegram/items";
import {
  batchText,
  cashHeldLine,
  dailySummaryText,
  incidentText,
  newOrderText,
  orderMessage,
  profitAlertText,
  ratePercent,
  testMessageText,
  TG_BATCH_MAX,
  TG_TEXT_MAX,
  type TgEnv,
  type TgOrder,
} from "./telegram/messages";
import { chatsOf, tgFailure } from "./telegram/wire";

export interface SectionResult {
  pass: number;
  failures: string[];
  notes: string[];
  ms: number;
}

const BUDGET_MS = 1_500;
const PHONE_FULL = "0612345678";
const PHONE_MASKED = "06 •• •• 56 78";
const ADDRESS = "12 rue des Canaris, Maarif";

/** OD38: the three words, per locale (the lint's words and their forms). */
const TRIAD: Record<"en" | "fr" | "ar", [RegExp, RegExp, RegExp]> = {
  en: [/\bplaced\b/i, /\bconfirmed\b/i, /\bdelivered\b/i],
  fr: [/pass[ée]e?s?\b/i, /confirm[ée]e?s?/i, /livr[ée]e?s?/i],
  ar: [/الطلبات/, /المؤكد|مؤكد|مأكد/, /توصلو|توصل/],
};
const EMOJI = /\p{Extended_Pictographic}/u;
const EM_DASH = /[\u2014\u2015]/;

function order(i: number, over: Partial<TgOrder> = {}): TgOrder {
  return {
    id: `CMD-${String(i).padStart(2, "0")}QA${"XYZ"[i % 3]}9`.slice(0, 10),
    offer: "Pack Duo, 2 × Noir",
    totalCents: 34_900,
    currency: "MAD",
    firstName: "Samira",
    phoneMasked: PHONE_MASKED,
    phone: PHONE_FULL,
    address: ADDRESS,
    city: "Casablanca",
    createdAt: new Date(Date.UTC(2026, 9, 24, 13, 2 + i)),
    test: false,
    ...over,
  };
}

export function telegramSelftest(): SectionResult {
  const t0 = performance.now();
  let pass = 0;
  const failures: string[] = [];
  const notes: string[] = [];
  const ok = (label: string, cond: boolean, info?: unknown) => {
    if (cond) pass++;
    else failures.push(`telegram: ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
  };
  // money.ts groups digits and spaces the currency with no-break spaces: compared as plain spaces
  const plain = (v: unknown) => JSON.stringify(v)?.replace(/[\u00a0\u202f]/g, " ");
  const eq = (label: string, got: unknown, want: unknown) => ok(label, plain(got) === plain(want), { got, want });
  const env = (over: Partial<TgEnv> = {}): TgEnv => ({ locale: "fr", tz: "Africa/Casablanca", pii: "masked", ...over });
  const texts: string[] = [];
  const keep = (s: string | null) => (s !== null && texts.push(s), s);

  /* ---------------- one order (OPE-§21.2) ---------------- */
  const one = keep(newOrderText(order(1), env()))!;
  eq("new order (fr, masked): id, offer, total, first name, masked phone, city", one, `Nouvelle commande ${order(1).id} · Pack Duo, 2 × Noir · 349 DH · Samira · ${PHONE_MASKED} · Casablanca`);
  ok("masked: never the full phone or the address", !one.includes(PHONE_FULL) && !one.includes(ADDRESS));
  const full = keep(newOrderText(order(1), env({ pii: "full" })))!;
  ok("full: the phone and the address", full.includes(PHONE_FULL) && full.includes(ADDRESS) && !full.includes(PHONE_MASKED), full);
  const noMask = keep(newOrderText(order(1, { phoneMasked: null }), env()))!;
  ok("masked without a masking function: no phone at all", !noMask.includes(PHONE_FULL) && !noMask.includes("••"), noMask);
  ok("a missing city is left out (no empty separator)", !keep(newOrderText(order(1, { city: null }), env()))!.includes("·  ·"));
  for (const locale of ["ar", "fr", "en"] as const) keep(newOrderText(order(2), env({ locale })));

  /* ---------------- the batch (≤ 10) ---------------- */
  const thirteen = Array.from({ length: 13 }, (_, i) => order(i + 1));
  const batch = keep(batchText(thirteen, env()))!;
  const lines = batch.split("\n");
  eq("batch: the header names 13 orders, the window and the total", lines[0], "13 nouvelles commandes (14:03-14:15) · 4 537 DH");
  eq("batch: ≤ 10 order lines, the rest counted", [lines.length, lines.slice(1, 11).every((l) => /^CMD-/.test(l)), lines[11]], [12, true, "et 3 autres commandes"]);
  eq("batch: orderMessage merges ≥ 2 orders and keeps one order as its line", [orderMessage(thirteen.slice(0, 2), env())!.split("\n").length, orderMessage([order(1)], env())], [3, one]);
  ok("batch: TG_BATCH_MAX is 10", TG_BATCH_MAX === 10);
  const mixed = keep(batchText([order(1), order(2, { currency: "EUR", totalCents: 1_000 })], env()))!;
  ok("batch: two currencies are listed but never summed", !/· [\d\s ,.]+ DH$/.test(mixed.split("\n")[0]!), mixed.split("\n")[0]);

  /* ---------------- [TEST] and (renvoi) (OPE-§26, §28.1) ---------------- */
  const n = NotificationsSetting.parse({});
  const nOn = NotificationsSetting.parse({ testOrders: true });
  eq("[TEST]: a test order is not queued without the switch", messageSkip(n, { kind: "new_order", orderId: "CMD-ABCDEF", test: true }), "test_off");
  eq("[TEST]: with the switch it is", messageSkip(nOn, { kind: "new_order", orderId: "CMD-ABCDEF", test: true }), null);
  eq("[TEST]: a real order needs no switch", messageSkip(n, { kind: "new_order", orderId: "CMD-ABCDEF", test: false }), null);
  eq("new orders off: nothing", messageSkip(NotificationsSetting.parse({ telegram: { newOrders: false } }), { kind: "new_order", orderId: "CMD-ABCDEF", test: false }), "switch_off");
  const testText = keep(newOrderText(order(1, { test: true }), env()))!;
  ok("[TEST]: a test order's message starts with [TEST]", testText.startsWith("[TEST] Nouvelle commande"), testText);
  ok("[TEST]: never on a real order", !one.includes("[TEST]") && !batch.includes("[TEST]"));
  const testBatch = keep(batchText([order(1, { test: true }), order(2, { test: true })], env()))!;
  ok("[TEST]: a batch of test orders starts with [TEST]", testBatch.startsWith("[TEST] 2 nouvelles commandes"), testBatch);
  const resent = keep(batchText(thirteen.slice(0, 3), env({ resent: true })))!;
  ok("(renvoi): a re-sent batch is one message marked on its first line", resent.split("\n")[0]!.includes("(renvoi)") && (resent.match(/\(renvoi\)/g) ?? []).length === 1, resent);
  eq("merge key: real and test orders apart, other topics never merged", [
    telegramBatchKey({ topic: "new_order", payload: { m: "new_order", orderId: "CMD-ABCDEF", test: false } }),
    telegramBatchKey({ topic: "new_order", payload: { m: "new_order", orderId: "CMD-ABCDEF", test: true } }),
    telegramBatchKey({ topic: "daily_summary", payload: { m: "daily" } }),
  ], ["new_order", "new_order:test", null]);

  /* ---------------- the daily summary (OD17, OD38, OD48) ---------------- */
  const figures = { day: "2026-10-24", placed: 42, confirmed: 31, confirmationRate: { value: 0.775, n: 40, min: 30 }, delivered: 18, callbacksDue: 6, deliveryProblems: 4, sheets: "ok" as const };
  const summary = keep(dailySummaryText(figures, env()))!;
  eq("summary (fr): every figure, the rate with its n", summary, "Résumé du 24 oct. : 42 commandes · 31 confirmées (78 %, n = 40) · 18 livrées · 6 rappels en attente · 4 colis en tentative de livraison échouée · Google Sheets : OK");
  const below = keep(dailySummaryText({ ...figures, confirmationRate: { value: 0.9, n: 12, min: 30 } }, env({ locale: "en" })))!;
  ok("minimum n: below the minimum, the count without a rate", below.includes("31 confirmed") && !below.includes("%"), below);
  const insufficient = keep(dailySummaryText({ ...figures, confirmationRate: { n: 12, min: 30, insufficient: true } }, env({ locale: "en" })))!;
  ok("minimum n: an insufficient rate shows no rate", !insufficient.includes("%"), insufficient);
  eq("ratePercent: value and n ≥ min only", [ratePercent({ value: 0.5, n: 30, min: 30 }), ratePercent({ value: 0.5, n: 29, min: 30 }), ratePercent({ n: 50, min: 30, insufficient: true })], [{ rate: 50, n: 30 }, null, null]);
  const partial = keep(dailySummaryText({ day: "2026-10-24", sheets: "failing" }, env({ locale: "en" })))!;
  eq("a missing figure is left out, never 0", partial, "Summary for 24 Oct: Google Sheets: not syncing");
  eq("no figure at all: no message", dailySummaryText({ day: "2026-10-24" }, env()), null);
  ok("no delivery-problems line under 1", !keep(dailySummaryText({ ...figures, deliveryProblems: 0 }, env()))!.includes("colis"));
  for (const locale of ["ar", "fr", "en"] as const) keep(dailySummaryText(figures, env({ locale })));

  /* ---------------- cash held (R2, OD52) ---------------- */
  const held = { carrier: "Amana", amountCents: 324_000, currency: "MAD", days: 15, parcels: 12 };
  eq("cash held: a statement account's line", cashHeldLine({ ...held, settlement: "statement" }, env()), "Amana détient 3 240 DH depuis plus de 15 jours (12 colis).");
  eq("cash held: never for an account settled at delivery", cashHeldLine({ ...held, settlement: "at_delivery" }, env()), null);
  const withCash = keep(dailySummaryText({ ...figures, cashHeld: [{ ...held, settlement: "at_delivery" }, { ...held, carrier: "Sendit", settlement: "statement" }] }, env()))!;
  ok("cash held: the summary carries the statement account only", withCash.includes("Sendit") && !withCash.includes("Amana"), withCash);

  /* ---------------- incidents and alerts ---------------- */
  for (const locale of ["ar", "fr", "en"] as const) {
    keep(incidentText({ integration: "sheets", minutes: 15 }, env({ locale })));
    keep(incidentText({ integration: "capi", platform: "meta", pixelLast4: "1234" }, env({ locale })));
    keep(incidentText({ integration: "dead" }, env({ locale })));
    keep(profitAlertText({ code: "cpa_over_breakeven", days: 2, costCents: 4_800, thresholdCents: 4_200, currency: "MAD" }, env({ locale })));
    keep(profitAlertText({ code: "refusal_spike", rate7: 31, rate28: 19, n: 42 }, env({ locale })));
    keep(profitAlertText({ code: "city_refusal", city: "Tanger", rate: 40, storeRate: 22, n: 25 }, env({ locale })));
    keep(testMessageText("Ma boutique", env({ locale })));
  }
  eq("profit alert (fr): the OPE-§21.2 text", profitAlertText({ code: "cpa_over_breakeven", days: 2, costCents: 4_800, thresholdCents: 4_200, currency: "MAD" }, env()), "Coût par commande au-dessus de votre seuil depuis 2 jours : 48 DH pour un seuil de 42 DH.");
  const T = Date.UTC(2026, 9, 24, 10, 0);
  const inc = (over: object) => ({ kind: "sheets" as const, targetId: "", code: "sheet_not_shared", sinceMinutes: 5, backlog: 3, at: new Date(T).toISOString(), ...over });
  const sheets = incidentMessage(inc({}), T);
  eq("incident: Sheets failing for 5 min waits until the 15th minute", sheets?.notBefore?.getTime(), T - 5 * 60_000 + SHEETS_INCIDENT_AFTER_MS);
  eq("incident: Sheets failing for 20 min is due now", incidentMessage(inc({ sinceMinutes: 20 }), T)?.notBefore, null);
  eq("incident: a refused CAPI token names the platform and the pixel's last 4", incidentMessage(inc({ kind: "capi", targetId: "meta:111111111234", code: "token_revoked" }), T)?.message, { kind: "incident", incident: { integration: "capi", platform: "meta", pixelLast4: "1234" }, key: "capi:meta:111111111234" });
  eq("incident: a CAPI failure of another cause is not sent", incidentMessage(inc({ kind: "capi", targetId: "meta:111111111234", code: "pixel_not_found" }), T), null);
  eq("incident: Telegram's own failures never go to Telegram", [incidentMessage(inc({ kind: "telegram" }), T), incidentMessage(inc({ kind: "telegram", dead: true }), T)], [null, null]);
  eq("incident: dead deliveries of another kind are sent", incidentMessage(inc({ kind: "capi", dead: true }), T)?.message.kind, "incident");

  /* ---------------- items: dedupe keys, no secret, no customer field ---------------- */
  const TOKEN = "123456789:AAH-telegram-token-canary-xyz0";
  const item = telegramItem("01STOREAAAAAAAAAAAAAAAAAAA", "-1001234567890", { kind: "new_order", orderId: "CMD-7K3Q9X", test: false }, T);
  eq("item: kind, topic, target, dedupe, pii false", [item.kind, item.topic, item.targetId, item.dedupeKey, item.pii], ["telegram", "new_order", "chat:7890", "tg:new:CMD-7K3Q9X", false]);
  const daily = telegramItem("01STOREAAAAAAAAAAAAAAAAAAA", "-1001234567890", { kind: "daily", figures }, T);
  eq("item: the daily key is per store and day", daily.dedupeKey, "tg:daily:01STOREAAAAAAAAAAAAAAAAAAA:2026-10-24");
  const i1 = telegramItem("01STOREAAAAAAAAAAAAAAAAAAA", "1", { kind: "incident", incident: { integration: "dead" }, key: "dead" }, T);
  const i2 = telegramItem("01STOREAAAAAAAAAAAAAAAAAAA", "1", { kind: "incident", incident: { integration: "dead" }, key: "dead" }, T + 30 * 60_000);
  const i3 = telegramItem("01STOREBBBBBBBBBBBBBBBBBBB", "1", { kind: "incident", incident: { integration: "dead" }, key: "dead" }, T);
  ok("item: one incident per kind per hour, per store", i1.dedupeKey === i2.dedupeKey && i1.dedupeKey !== i3.dedupeKey && i1.dedupeKey.startsWith("tg:incident:01STOREAAAAAAAAAAAAAAAAAAA:"), [i1.dedupeKey, i3.dedupeKey]);
  const all = JSON.stringify([item, daily, i1]);
  ok("item: no token, no phone, no name in a payload", !all.includes(TOKEN) && !all.includes(PHONE_FULL) && !all.includes("Samira"));
  ok("payload: the handler's schema accepts its own items and refuses a tampered one", TelegramPayload.safeParse(item.payload).success && TelegramPayload.safeParse(daily.payload).success && !TelegramPayload.safeParse({ m: "new_order", orderId: "x; DROP", test: false }).success);

  /* ---------------- the wire (OPE-§21.3) ---------------- */
  const f401 = tgFailure(401, { ok: false, error_code: 401, description: "Unauthorized" });
  const f403 = tgFailure(403, { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
  const f400 = tgFailure(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
  const f429 = tgFailure(429, { ok: false, error_code: 429, description: "Too Many Requests: retry after 7", parameters: { retry_after: 7 } });
  const f500 = tgFailure(502, null);
  const fOther = tgFailure(400, { ok: false, error_code: 400, description: "Bad Request: message is too long" });
  const fNet = tgFailure(null, null);
  eq("wire: 401 / 403 / chat not found are final with their causes", [f401.code, f401.final, f403.code, f403.final, f400.code, f400.final], ["bot_token_revoked", true, "bot_blocked", true, "chat_not_found", true]);
  eq("wire: 429 carries retry_after and is retried", [f429.code, f429.final, f429.retryAfterSec], ["rate_limited", false, 7]);
  eq("wire: a 5xx and no answer are retried", [f500.final, fNet.final, fNet.code], [false, false, "network"]);
  eq("wire: another 4xx refuses this message only", [fOther.final, fOther.code !== "chat_not_found" && fOther.code !== "bot_blocked" && fOther.code !== "bot_token_revoked"], [true, true]);
  eq("wire: a group upgraded to a supergroup answers its new id", tgFailure(400, { ok: false, description: "Bad Request: group chat was upgraded to a supergroup chat", parameters: { migrate_to_chat_id: -1009876543210 } }).migrateTo, "-1009876543210");
  const chats = chatsOf([
    { update_id: 1, message: { chat: { id: 42, type: "private", first_name: "Sami", last_name: "Owner" }, text: "hello secret" } },
    { update_id: 2, my_chat_member: { chat: { id: -100555, type: "supergroup", title: "Équipe ventes" } } },
    { update_id: 3, message: { chat: { id: 42, type: "private", first_name: "Sami" }, text: "again" } },
    { update_id: 4, message: { chat: { id: 7, type: "weird" } } },
  ]);
  eq("wire: the chats seen, newest first, once each, titles and types only", chats, [
    { id: "42", title: "Sami", type: "private" },
    { id: "-100555", title: "Équipe ventes", type: "supergroup" },
  ]);
  ok("wire: no message text leaves chatsOf", !JSON.stringify(chats).includes("secret"));

  /* ---------------- the catalogs (OD38, OD45, no emoji, no em dash) ---------------- */
  const catalogs = { en: enCatalog as Record<string, string | undefined>, fr: frCatalog as Record<string, string | undefined>, ar: arCatalog as Record<string, string | undefined> };
  const tgKeys = Object.keys(enCatalog).filter((k) => k.startsWith("int.tg."));
  ok("catalog: the int.tg.* keys exist", tgKeys.length >= 20, tgKeys.length);
  for (const locale of ["en", "fr", "ar"] as const) {
    const missing = tgKeys.filter((k) => !catalogs[locale][k]);
    eq(`catalog ${locale}: every int.tg.* key is present`, missing, []);
    const two = tgKeys.filter((k) => TRIAD[locale].filter((re) => re.test(catalogs[locale][k] ?? "")).length > 1);
    eq(`catalog ${locale}: no int.tg.* string names two of placed / confirmed / delivered (OD38)`, two, []);
    const bad = tgKeys.filter((k) => EMOJI.test(catalogs[locale][k] ?? "") || EM_DASH.test(catalogs[locale][k] ?? "") || /!/.test(catalogs[locale][k] ?? ""));
    eq(`catalog ${locale}: no emoji, em dash or exclamation mark`, bad, []);
  }
  for (const s of texts) {
    if (EMOJI.test(s) || EM_DASH.test(s)) failures.push(`telegram: a built text has an emoji or an em dash: ${JSON.stringify(s.slice(0, 120))}`);
    else pass++;
  }

  /* ---------------- ≤ 3,500 characters ---------------- */
  const huge = Array.from({ length: 10 }, (_, i) => order(i + 1, { offer: "Ш".repeat(2_000), city: "C".repeat(500), address: "A".repeat(2_000) }));
  const capped = [batchText(huge, env({ pii: "full" })), newOrderText(order(1, { offer: "x".repeat(9_000), firstName: "N".repeat(5_000) }), env({ pii: "full" })), testMessageText("S".repeat(10_000), env())];
  ok("cap: every message ≤ 3,500 characters", capped.every((t) => Array.from(t).length <= TG_TEXT_MAX), capped.map((t) => Array.from(t).length));
  ok("cap: a capped batch keeps its header", capped[0]!.startsWith("10 nouvelles commandes"));
  ok("cap: control characters and line breaks never split a line", !newOrderText(order(1, { firstName: "Sa\nmi\u2028ra", city: "Casa\rblanca" }), env()).includes("\n"));

  const ms = performance.now() - t0;
  ok(`the section stays within ${BUDGET_MS} ms`, ms <= BUDGET_MS, Math.round(ms));
  notes.push(`telegram section: ${Math.round(ms)} ms, ${texts.length} texts checked`);
  return { pass, failures, notes, ms };
}

// standalone run: npx tsx src/lib/integrations/telegram.selftest.ts
if (process.argv[1] && /integrations[\\/]telegram\.selftest\.ts$/.test(process.argv[1])) {
  const r = telegramSelftest();
  for (const n of r.notes) console.log(`· ${n}`);
  for (const f of r.failures) console.log(`✗ ${f}`);
  console.log(r.failures.length ? `✗ ${r.failures.length} failure(s), ${r.pass} passed` : `✓ telegram self test passed (${r.pass} assertions)`);
  process.exit(r.failures.length ? 1 : 0);
}
