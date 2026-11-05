/**
 * Admin messages (en) of the finance file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 */
export const messages = {
  /* ---- notifications (OPE-§21.4) ---- */
  "notify.fin.profit_alert.title": "Profit alert: {alertKind}",
  "notify.fin.profit_alert.body": "A figure crossed your threshold: {value} against {threshold} (n = {n}). Open Profit to see the detail.",

  /* ---- alerts (OPE-§16.2, §21.2) ---- */
  "fin.alert.cpa_over_breakeven": "Cost per order above your break-even for 2 days: {value} for a break-even of {threshold}.",
  "fin.alert.refusal_spike": "Refusals are rising: {value} % in the last 7 days against {threshold} % over 28 days (n = {n}).",
  "fin.alert.city_refusal": "{city} refuses more than your other cities: {value} % against {threshold} % (n = {n}).",
  "fin.alert.city_refusal.reasons": "{count} of {total} refusals: {reason}",
  "fin.alert.city_refusal.fix": "Mark the city as not served or raise its fee",

  /* ---- what is missing before a figure can show (OPE-§16.1: never a guess) ---- */
  "fin.missing.title": "Add your costs to see profit",
  "fin.missing.item_costs": "The unit cost of every product you sold",
  "fin.missing.packaging": "Your packaging cost per order",
  "fin.missing.delivery_fee": "Your carrier's delivery fee",
  "fin.missing.return_fee": "Your carrier's return fee",
  "fin.missing.confirm_n": "{n} decided orders so far: the confirmation rate needs 30",
  "fin.missing.delivery_n": "{n} finished deliveries so far: the delivery rate needs 30",

  /* ---- break-even card ---- */
  "fin.be.headline": "You can pay up to {placed} per order placed ({delivered} per delivered order).",
  "fin.be.paid": "Last 28 days you paid {cpa} per order placed.",
  "fin.be.interval": "Likely between {low} and {high}",
  "fin.be.rateN": "{rate} % on {n} orders",
  "fin.be.noSpend": "Type your ad spend to compare it with your break-even.",
  "fin.be.converted": "Spend converted at your rate 1 {currency} = {rate} {storeCurrency} (from {day})",
  "fin.be.daysNotCounted": "{n, plural, one {# day not counted: it needs a rate} other {# days not counted: they need a rate}}",
  "fin.be.outcomesAsOf": "Delivery outcomes as of the last sync, {time}",
  "fin.be.byAngle": "By angle",
  "fin.be.byAngle.note": "Spend is not split per angle yet, so no cost per order is shown here.",
  "fin.be.suppressed": "{n, plural, one {# small group hidden (under 5 orders)} other {# small groups hidden (under 5 orders)}}",

  /* ---- costs ---- */
  "fin.costs.bySku": "Costs by SKU",
  "fin.costs.fromSku": "From SKU {sku}, {cost}",
  "fin.costs.packaging": "Packaging per order",
  "fin.costs.notSet": "Not set",
  "fin.carrier.title": "My carrier",
  "fin.carrier.default": "Every other city",
  "fin.carrier.feeCharged": "Fee charged",
  "fin.carrier.feePaid": "Fee paid",
  "fin.carrier.codFee": "{bp} % of the amount collected, minimum {min}, plus {flat} per parcel",
  "fin.settlement.question": "Who holds the cash after delivery?",
  "fin.settlement.at_delivery": "I deliver myself, or my courier hands me the cash",
  "fin.settlement.statement": "A carrier pays me later on a statement",
  "fin.cash.marked": "{n, plural, one {# order marked as cash received} other {# orders marked as cash received}}",

  /* ---- ad spend ---- */
  "fin.ads.billedIn": "Billed in {currency}",
  "fin.ads.needsRate": "Needs a rate",
  "fin.ads.rateEstimate": "Your rate, estimate",
  "fin.ads.rateLine": "1 {currency} = {rate} {storeCurrency} from {day}",

  /* ---- errors ---- */
  "fin.error.feature_off": "Profit is not available for this store yet.",
  "fin.error.invalid": "Check the amount and try again.",
  "fin.error.not_found": "This page or product is no longer live.",

  /* ---- Store Health (OPE-§27.2) ---- */
  "health.ops.fin_costs_missing.text": "{n, plural, one {# product you sell has no cost yet} other {# products you sell have no cost yet}}: profit cannot be shown for their orders.",
  "health.ops.fin_costs_missing.fix": "Add costs",
  "health.ops.fin_settlement_check.text": "{n} orders were delivered and you have not said who holds the cash after delivery.",
  "health.ops.fin_settlement_check.fix": "Answer in My carrier",
  "health.ops.fin_fee_gap.text": "{n, plural, one {# of your top cities is} other {# of your top cities are}} charged less than your carrier costs (up to {baseline} per order).",
  "health.ops.fin_fee_gap.fix": "Compare fees",
  "health.ops.fin_ad_rate_missing.text": "{n, plural, one {# day of ad spend in another currency has no rate and is} other {# days of ad spend in another currency have no rate and are}} left out of your cost per order.",
  "health.ops.fin_ad_rate_missing.fix": "Add a rate",
} as const satisfies Record<string, string>;
