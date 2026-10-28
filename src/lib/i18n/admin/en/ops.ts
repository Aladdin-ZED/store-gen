/**
 * Admin messages (en) of the ops file (P4 CALL CENTER, operations.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one. The agent-facing keys ship in
 * ar / fr / en in R1 (OD34), every other `ops.` key in fr / en (OD58). Sentence case, no em dash, no exclamation mark.
 */
export const messages = {
  /* ---- cancel reasons (OPE-§6.4; `blocked` and `attempts_exhausted` are system codes, never in the picker) ---- */
  "ops.reason.changed_mind": "Changed their mind",
  "ops.reason.price": "Price",
  "ops.reason.mistake": "Ordered by mistake",
  "ops.reason.bought_elsewhere": "Bought elsewhere",
  "ops.reason.not_ordered": "Says they didn't order",
  "ops.reason.wrong_number": "Wrong number",
  "ops.reason.out_of_zone": "Outside delivery area",
  "ops.reason.delay": "Delivery too slow",
  "ops.reason.see_first": "Wants to see the product first",
  "ops.reason.customer_request": "Asked to cancel",
  "ops.reason.other": "Other",
  "ops.reason.blocked": "Blocked number",
  "ops.reason.attempts_exhausted": "No answer after every attempt",

  /* ---- refusal and return reasons (OD50, OPE-§N) ---- */
  "ops.reason.return.customer_absent": "Customer absent",
  "ops.reason.return.refused_price": "Refused the price",
  "ops.reason.return.changed_mind": "Changed their mind",
  "ops.reason.return.wrong_item": "Wrong item",
  "ops.reason.return.damaged": "Damaged",
  "ops.reason.return.unreachable": "Unreachable",
  "ops.reason.return.no_cash": "No cash",
  "ops.reason.return.address_wrong": "Wrong address",
  "ops.reason.return.not_ordered": "Says they didn't order",
  "ops.reason.return.other": "Other",
  "ops.reason.return.none": "No reason given",

  /* ---- shipping states (the axis chip, the drawer, the Sheet's optional "Statut livraison", OPE-§19.4) ---- */
  "ops.ship.none": "Not shipped",
  "ops.ship.to_pack": "To pack",
  "ops.ship.packed": "Packed",
  "ops.ship.shipped": "Shipped",
  "ops.ship.in_transit": "In transit",
  "ops.ship.out_for_delivery": "Out for delivery",
  "ops.ship.attempt_failed": "Attempt failed",
  "ops.ship.postponed": "Postponed",
  "ops.ship.delivered": "Delivered",
  "ops.ship.refused": "Refused",
  "ops.ship.returned": "Returned",
  "ops.ship.lost": "Lost",

  /* ---- risk (OPE-§10.2; one sentence per flag of src/lib/orders/risk.ts) ---- */
  "ops.risk.check": "To check",
  "ops.risk.high": "High risk",
  "ops.risk.calibration": "In your store, orders like this one ended fake, cancelled or unreachable {share} of the time ({n} orders)",
  "ops.risk.honeypot": "A hidden anti-bot field was filled in",
  "ops.risk.too_fast": "Form filled in under 3 seconds",
  "ops.risk.fast": "Form filled very quickly",
  "ops.risk.no_ua": "Sent by an automated tool",
  "ops.risk.bot_ua": "Sent by an automated tool",
  "ops.risk.captcha_missing": "Anti-spam check missing",
  "ops.risk.captcha_unverified": "Anti-spam check not confirmed",
  "ops.risk.no_origin": "Not sent from a web page",
  "ops.risk.ip_repeat": "Several orders from the same network today",
  "ops.risk.history_bad": "This number had {n, plural, one {# order} other {# orders}} that did not arrive",
  "ops.risk.history_bad_nocount": "This number had orders that did not arrive",
  "ops.risk.page_burst": "Unusual burst of orders on this page",
  "ops.risk.duplicate": "Same number ordered this page in the last 12 hours",
  "ops.risk.returning_customer": "Returning customer: {n} delivered",
  "ops.risk.returning_customer_nocount": "Returning customer",
} as const satisfies Record<string, string>;
