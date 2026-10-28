/**
 * The shell's pure self-test (PLA-§O.1 `test:shell`, core §J.1; rev 6 P0b, CCR P2-1):
 *   npm run test:shell        (tsx src/components/admin/shell/selftest.ts; offline, no DB, no React render)
 *
 * Step p2-02 (viewer-locale rendering, core §I.5, D36): which screens render in the viewer's language
 * (`screenLocalesFor`), the fallback to English (`screenLocale`), the store-relative path (`storeRelativePath`), and
 * the settings tabs' labels in every locale (`settingsText`). Later steps add their pure checks here (PLA-§O.1 row).
 * Exits 1 on any failure.
 */
import { ADMIN_LOCALES, messageOf } from "@/lib/i18n/admin";
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

console.log(`test:shell: ${passed} passed, ${failures} failed`);
if (failures) process.exit(1);
