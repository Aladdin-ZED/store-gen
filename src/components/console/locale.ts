/**
 * The console's language (platform.md PLA-§N.1, UX-08; core D36): `console.ts` ships in English in R1 (French in R2,
 * Arabic in R3), so the console renders `lang="en" dir="ltr"` whatever the viewer's `users.locale`, as the store
 * dashboard does (src/app/app/[store]/layout.tsx). An Arabic viewer would otherwise get English sentences mirrored
 * under `dir="rtl"` (numbers and units reordered, full stops at the wrong end). The components stay RTL-correct by
 * construction (logical properties, `<bdi>`; `test:admin-rtl`), so the R3 switch is this constant and the catalogs.
 */
import type { AdminLocale } from "@/lib/i18n/admin";

export const CONSOLE_LOCALE: AdminLocale = "en";
