import localFont from "next/font/local";

/*
 * The Arabic display face of the marketing pages (Readex Pro, Arabic subset, variable weight): the h1 and h2 of `/`
 * in Arabic. Applied by MarketingFrame only when the locale is `ar`, so French and English never download it; Plex
 * Arabic (the root layout's `--font-arabic`) stays the text face and the fallback. Self-hosted from public/fonts.
 */
export const readexArabic = localFont({
  src: "../../../public/fonts/readex-pro/readex-pro-arabic-wght-normal.woff2",
  variable: "--mk-font-ar-display",
  weight: "160 700",
  style: "normal",
  display: "swap",
  preload: false,
  fallback: ["IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", "Tahoma", "sans-serif"],
});
