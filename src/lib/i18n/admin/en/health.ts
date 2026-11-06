/**
 * Admin messages (en) of the health file (P2 SHELL, platform.md; D67).
 * Extension file (docs/STORE-SAAS.md §I.5, §K.3), created empty at P0 and spread by src/lib/i18n/admin/en.ts;
 * English is the reference: the fr and ar files type their keys against this one.
 * Chrome only (PLA-§N.1, §22.16): the ring, the groups, the issue list and snooze. Every rule sentence lives in the
 * emitting track's file (`health.shell.*` in ./shell.ts, `health.platform.*` in P1's ./notify.ts, …).
 */
export const messages = {
  "health.title": "Store health",
  "health.score": "{score} out of 100",
  "health.computing": "Your first health check runs within 5 minutes.",
  "health.recomputing": "Recomputing. Ready within 5 minutes.",
  "health.recompute": "Recompute now",
  "health.checked_at": "Checked at {time}",
  "health.stale": "This check is older than usual. Recompute it to see the latest.",
  "health.score_later": "{count, plural, one {The score appears after your first order.} other {The score appears after # orders.}}",
  "health.all_good": "Nothing to fix right now. Checked at {time}; it checks again after every change you make.",
  "health.celebrate": "Your store is in great shape.",
  "health.error": "The health check couldn't load. The rest of the dashboard works.",
  "health.retry": "Try again",
  "health.severity.3": "Fix now",
  "health.severity.2": "Should fix",
  "health.severity.1": "Suggestion",
  "health.group.setup": "Setup",
  "health.group.trust": "Trust",
  "health.group.design": "Design",
  "health.group.conversion": "Conversion",
  "health.group.operations": "Operations",
  "health.group.integrations": "Integrations",
  "health.group.quota": "Plan limits",
  "health.group.lost": "{lost} of {cap} points to win back",
  "health.after_approval": "After approval",
  "health.issues": "What to fix",
  "health.snooze": "Snooze 7 days",
  "health.snoozed": "Snoozed for 7 days.",
  "health.snoozed_count": "{count, plural, one {# snoozed} other {# snoozed}}",
  "health.snoozed_until": "Snoozed until {date}",
  "health.unsnooze": "Unsnooze",
  "health.evidence.n": "n = {n}",
  "health.evidence.window": "{days, plural, one {last # day} other {last # days}}",
  "health.snoozed_by": "Snoozed by {role}",
  "health.snoozed_title": "Snoozed issues",
  "health.hide_snoozed": "Hide snoozed",
  "health.all_good_short": "Nothing to fix right now.",
  "health.read_only": "The last check, read-only while the store is closed or suspended.",
} as const satisfies Record<string, string>;
