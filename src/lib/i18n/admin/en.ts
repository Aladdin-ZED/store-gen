/**
 * The admin's base catalog (docs/STORE-SAAS.md §I.5, D36, D67), English: the reference every other catalog falls
 * back to. Maintainer-owned: it holds the core keys (the §E.2 action error codes the shell maps) and, since P0, one
 * spread per track file `./en/<file>.ts` (each track owns the keys under its own prefix, D67). Values: ICU-lite `{var}`
 * placeholders and `{n, plural, one {…} other {…}}`; no em-dash and no "Step n" label (§I.8 rule 8).
 */
import { messages as aiMessages } from "./en/ai";
import { messages as authMessages } from "./en/auth";
import { messages as briefMessages } from "./en/brief";
import { messages as consoleMessages } from "./en/console";
import { messages as designMessages } from "./en/design";
import { messages as financeMessages } from "./en/finance";
import { messages as healthMessages } from "./en/health";
import { messages as integrationsMessages } from "./en/integrations";
import { messages as landingMessages } from "./en/landing";
import { messages as notifyMessages } from "./en/notify";
import { messages as onboardingMessages } from "./en/onboarding";
import { messages as opsMessages } from "./en/ops";
import { messages as shellMessages } from "./en/shell";
import { messages as teamMessages } from "./en/team";

export const messages = {
  // the tracks' files ./en/<file>.ts (D67; spread here at P0, `scripts/qa/registries-check.ts` proves none is left out):
  // P1 console + notify, P2 shell + auth + onboarding + team + health + brief, P3 landing, P4 ops + finance,
  // P5 integrations, P6 design, P7 ai; each owns the keys under its prefix, and the core keys below win on a clash
  ...consoleMessages,
  ...notifyMessages,
  ...shellMessages,
  ...authMessages,
  ...onboardingMessages,
  ...teamMessages,
  ...healthMessages,
  ...briefMessages,
  ...landingMessages,
  ...opsMessages,
  ...financeMessages,
  ...integrationsMessages,
  ...designMessages,
  ...aiMessages,
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
  // T2's identity action codes (D65; moved from src/lib/auth/i18n/en.ts at P0b, CCR P2-15)
  "error.challenge": "Complete the human check, then try again.",
  "error.totp_required": "Use the code from your authenticator app.",
  "error.last_owner": "A store needs at least one owner. Make someone else an owner first.",
  "error.owns_store": "You still own a store. Close it or hand it over first.",
  "error.is_staff": "This is a team account. Remove its team role first.",
  "error.member_2fa_required": "This store requires two-step verification. Turn it on to continue.",
  "error.platform_read_only": "Changes are paused for maintenance. Try again shortly.",
  "error.closed": "This is closed for now. Try again a little later.",
  "error.impersonation_member": "You're a member of this store. Open it from your stores.",
  "error.impersonation_state": "This store can't be viewed in its current state.",
  // T1 lifecycle and handle refusals (CCR r1.0-t1-2; mapped in seam.ts actionFailure by T2)
  "error.status_changed": "This store was changed by someone else a moment ago. Check the latest state and try again.",
  "error.handle_format": "Use 3 to 30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.",
  "error.handle_reserved": "This address is reserved. Choose another one.",
  "error.handle_protected": "This address contains a protected brand name. Use your own brand, or contact Store Gen support if you own that brand.",
  "error.handle_unavailable": "This address is not available. Choose another one.",
  "error.handle_too_soon": "You can change your store address once every 30 days.",
  // the budget gate's items (core §M.2; src/lib/render/prepublish/budget.ts): what was measured and the limit
  "budget.F5.weight": "Page weight {kb} KB compressed · limit {limit} KB",
  "budget.F5.pictures": "{count} pictures on the page · limit {limit}",
  "budget.F5.fonts": "{families} font families in {files} files · limit 2 families and 4 files",
  "budget.C3.sections": "{count} sections on the page · limit {limit}",
  "budget.C3.height": "Estimated page height {px} px on a phone · limit {limit} px",
  "budget.F1.missing": "The page has no order form",
  "budget.F1.position": "The order form starts at an estimated {px} px on a phone · limit {limit} px",
  "budget.C2.image": "The product photo starts at an estimated {px} px · it must show in the first {limit} px of a phone screen",
  "budget.C2.price": "The price starts at an estimated {px} px · it must show in the first {limit} px of a phone screen",
  "budget.C2.cta": "The order button starts at an estimated {px} px · it must show in the first {limit} px of a phone screen",
  "budget.C2.cod": "The cash on delivery line starts at an estimated {px} px · it must show in the first {limit} px of a phone screen",
  "budget.R1.ctas": "{count} order buttons on the page · limit {limit}",
  "budget.R4.glass": "{count} frosted glass surfaces · limit {limit}",
  "budget.R5.reveals": "{count} animated elements · limit {limit}",
  "budget.K2.moments": "{count} full-width colour bands · limit {limit}",
  "budget.I1.reuse": "One photo appears {count} times · limit {limit}",
  // the dashboard's navigation (CCR r1.0-t4-8; the keys of src/components/admin/shell/nav/t4.ts and the registry groups)
  "nav.overview": "Overview",
  "nav.orders": "Orders",
  "nav.pages": "Pages",
  "nav.generate": "Generate",
  "nav.media": "Media",
  "nav.history": "History",
  "nav.exports": "Exports",
  "nav.team": "Members & invites",
  "nav.sheets": "Google Sheets",
  "nav.pixels": "Pixels",
  "nav.settings": "Settings",
  "nav.group.workspace": "Workspace",
  "nav.group.sell": "Sell",
  "nav.group.landing": "Landing pages",
  "nav.group.catalog": "Catalog",
  "nav.group.library": "Library",
  "nav.group.team": "Team",
  "nav.group.connect": "Connect",
  "nav.group.money": "Money",
  "nav.group.settings": "Settings",
} as const satisfies Record<string, string>;
