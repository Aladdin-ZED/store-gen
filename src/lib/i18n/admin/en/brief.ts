/**
 * Admin messages (en) of the brief file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 * The Today brief's templates (PLA-§22.17 item 1): template lines from real counts, never a model text in R1. A line
 * whose source is unavailable is left out, never written with a made-up 0 (build note item 14).
 */
export const messages = {
  "brief.title": "Today",
  "brief.orders": "{confirmed, plural, one {# order confirmed today} other {# orders confirmed today}} · {callbacks, plural, one {# callback due} other {# callbacks due}}",
  "brief.confirmed": "{count, plural, one {# order confirmed today} other {# orders confirmed today}}",
  "brief.callbacks": "{count, plural, one {# callback due} other {# callbacks due}}",
  "brief.queue": "{count, plural, one {# order waiting in the queue} other {# orders waiting in the queue}}",
  "brief.health": "To fix first: {issue}",
  "brief.opportunity": "{a} delivered {rateA} % vs {rateB} % for {b} (n = {n})",
  "brief.empty": "No orders yet. Publish a page to start.",
  "brief.open": "Open",
} as const satisfies Record<string, string>;
