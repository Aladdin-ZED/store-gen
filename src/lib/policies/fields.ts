/**
 * The policy template fields (P3 LANDING; platform.md PLA-§13.4, landing.md LAN-§2.3; P0b CCR P1-11): the placeholder
 * names `{{field}}` the platform's legal templates may use, filled by P3's renderer from the store's `policies` setting
 * (src/lib/settings/keys/policies.ts, `StorePolicyFacts`). Each name is the dotted path of a scalar leaf of
 * PoliciesSetting (`delivery.typicalDays` is the [min, max] pair, rendered as one range); the localized texts
 * (`returns.condition`, `warranty.text`), `extras`, `contact.channels` and the bookkeeping fields (`v`, `reviewedAt`)
 * are not template fields. P1's console legal editor refuses a template that names a field outside this list. P3 may
 * add entries and never renames one (a template already saved would lose its value).
 */
export const POLICY_TEMPLATE_FIELDS: readonly string[] = [
  "inspection",
  "delivery.coverage",
  "delivery.typicalDays",
  "delivery.freeFromCents",
  "returns.accepted",
  "returns.windowDays",
  "returns.whoPays",
  "exchange.accepted",
  "exchange.windowDays",
  "refund.method",
  "refund.withinDays",
  "warranty.months",
] as const;
