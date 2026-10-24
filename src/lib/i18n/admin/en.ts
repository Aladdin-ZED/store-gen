/**
 * The admin's base catalog (docs/STORE-SAAS.md §I.5, D36, D67), English: the reference every other catalog falls
 * back to. Maintainer-owned: it holds the core keys (the §E.2 action error codes the shell maps) and, from P0, one
 * spread per track file `./en/<track>.ts` (each track owns the keys under its own prefix). Values: ICU-lite `{var}`
 * placeholders and `{n, plural, one {…} other {…}}`; no em-dash and no "Step n" label (§I.8 rule 8).
 */
export const messages = {
  "error.invalid": "Some fields need a fix.",
  "error.not_found": "This item doesn't exist or is no longer available.",
  "error.forbidden": "Your role doesn't allow this action.",
  "error.read_only": "This store is read-only right now.",
  "error.impersonation_read_only": "View as store is read-only.",
  "error.quota": "You've reached a limit of your plan.",
  "error.feature_off": "This feature isn't available for this store right now.",
  "error.step_up": "Confirm it's you to continue.",
  "error.busy": "We're busy right now. Try again in a few seconds.",
  "error.job_queued": "This takes a moment. We'll let you know when it's ready.",
  "error.design_blocked": "The design needs a few fixes before publishing.",
  "error.honesty_blocked": "Some claims on the page need a source before publishing.",
  "error.budget_blocked": "The page is too long or too heavy to publish.",
  "error.rate_limited": "Too many attempts. Wait a few minutes and try again.",
  "error.conflict": "This was changed somewhere else. Reload and try again.",
  "error.server": "Something went wrong on our side. Please try again.",
  "error.session_ended": "Your session has ended. Sign in again.",
  "error.platform_2fa_required": "Turn on two-step verification to open the console.",
  // T1 lifecycle and handle refusals (CCR r1.0-t1-2; mapped in seam.ts actionFailure by T2)
  "error.status_changed": "This store was changed by someone else a moment ago. Check the latest state and try again.",
  "error.handle_format": "Use 3 to 30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.",
  "error.handle_reserved": "This address is reserved. Choose another one.",
  "error.handle_protected": "This address contains a protected brand name. Use your own brand, or contact Store Gen support if you own that brand.",
  "error.handle_unavailable": "This address is not available. Choose another one.",
  "error.handle_too_soon": "You can change your store address once every 30 days.",
} as const satisfies Record<string, string>;
