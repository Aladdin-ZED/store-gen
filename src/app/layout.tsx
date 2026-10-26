import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
// Tailwind is precompiled by scripts/build-admin-css.mjs (prebuild/predev) — edit globals.css, not this
import "./globals.compiled.css";

/*
 * Admin typefaces, self-hosted from the installed @fontsource packages (no network at build time).
 * Landing pages don't use this layout — they are standalone documents with their own fonts.
 */
const sans = localFont({
  src: "./fonts/instrument-sans-latin-wght-normal.woff2",
  variable: "--font-sans",
  weight: "400 700",
  style: "normal",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Noto Sans Arabic", "sans-serif"],
});

const display = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
  preload: false,
  fallback: ["ui-serif", "Georgia", "serif"],
});

const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
});

/** Arabic face of the platform UI (DS21, CCR r1.0-t2-9 item 3): the `[lang="ar"]` rule of globals.css puts it first. */
const arabic = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-arabic",
  display: "swap",
  preload: false,
  fallback: ["Noto Sans Arabic", "Segoe UI", "Tahoma", "sans-serif"],
});

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { telephone: false, email: false, address: false },
};

/** Browser chrome = the admin's own --background (oklch(0.99 0.0015 265) / oklch(0.175 0.004 265)). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#101012" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: a theme provider may set the `class` on <html> before hydration.
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} ${arabic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
