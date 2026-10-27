/**
 * Typed settings registry: one zod schema + default per key, and which keys are stored encrypted.
 * Isomorphic (no I/O) so admin forms can validate with the same schemas before submitting.
 *
 * @deprecated as a registry from R1.0 (docs/STORE-SAAS.md §D.10): the platform and store registries
 * (./platform-registry.ts, ./store-registry.ts) replace SETTINGS once T1's scoped settings API and T4's callers
 * land; SETTINGS keeps today's single-tenant admin compiling until then. The pixel and tracking schemas below
 * are re-exported from their key files, so both registries read one definition.
 */
import { z } from "zod";
import { AssetRef, Locale, Market, Money, Tracking } from "@/lib/page/schema";
import { def, httpsUrl, isMaskedSecret, maskSecret, optional, optionalText, phone, redactFields, text } from "./fields";
import { PixelHealthSettings } from "./keys/pixel_health";
import { PixelLibrarySettings } from "./keys/pixel_library";
import { TrackingSecretsSettings } from "./keys/tracking_secrets";
import { TurnstileSetting } from "./keys/turnstile";

export { isMaskedSecret, maskSecret };
export { PIXEL_LIBRARY_UI_MAX, PixelLibraryEntry, PixelLibrarySettings, PixelTestWindow } from "./keys/pixel_library";
export { PixelHealth, PixelHealthEntry, PixelHealthSettings } from "./keys/pixel_health";
export { TestEventCode, TrackingSecretsSettings } from "./keys/tracking_secrets";

export const StoreSettings = z.object({
  /**
   * Required when the admin saves the form; "" until then (never a made-up "My store": landing
   * pages fall back to the product name, the dashboard checklist keeps asking for the real one).
   * zod 4: the default short-circuits — a missing value becomes "", a submitted "" is still refused.
   */
  storeName: text(80).pipe(z.string().min(1, { error: "Enter the store name." })).default(""),
  legalName: optionalText(160),
  logo: AssetRef.optional(),
  phone: optional(phone),
  whatsapp: optional(phone),
  email: optional(z.email({ error: "Enter a valid email address." }).max(160)),
  address: optionalText(300),
  city: optionalText(120),
  country: z.string().regex(/^[A-Z]{2}$/).default("MA"),
  /** Moroccan Identifiant Commun de l'Entreprise — 15 digits */
  ice: optional(z.string().regex(/^[0-9]{15}$/, { error: "ICE is 15 digits." })),
  /** Registre de commerce number (format varies by city) */
  rc: optional(z.string().trim().regex(/^[A-Za-z0-9 ./-]{1,30}$/, { error: "Invalid RC number." })),
  socials: z
    .object({
      facebook: optional(httpsUrl),
      instagram: optional(httpsUrl),
      tiktok: optional(httpsUrl),
      youtube: optional(httpsUrl),
      snapchat: optional(httpsUrl),
    })
    .default({}),
});

export const DefaultsSettings = z.object({
  market: Market.default("MA"),
  locale: Locale.default("ar"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("MAD"),
  phoneCountry: z.string().regex(/^[A-Z]{2}$/).default("MA"),
  shippingFee: Money.default(0),
  /** e.g. "Livraison gratuite 24–48h" / "التوصيل مجاني خلال 24–48 ساعة" */
  deliveryText: text(140).default(""),
});

export const SheetsSettings = z.object({
  enabled: z.boolean().default(false),
  url: optional(z.url({ protocol: /^https$/, hostname: /^docs\.google\.com$/ }).max(500)),
  spreadsheetId: optional(z.string().regex(/^[A-Za-z0-9_-]{20,100}$/)),
  sheetId: z.number().int().nonnegative().optional(),
  sheetTitle: optionalText(100),
  connectedAt: z.iso.datetime({ offset: true }).optional(),
});

/**
 * Store-level ad pixels from before per-page pixels (docs/OFFERS.md §A): read once by the pixel
 * library migration (the store #1 conversion, src/lib/tenancy/convert.server.ts), ignored afterwards, deleted in the cleanup
 * release. Pages own their pixels; nothing copies this value into pages any more.
 */
export const PixelsSettings = Tracking;

export const AiSettings = z.object({
  enabled: z.boolean().default(true),
  tier: z.enum(["lite", "full"]).default("lite"),
  bgRemoval: z.boolean().default(true),
});

export const TurnstileSettings = TurnstileSetting;

export const HomeSettings = z.object({
  /** page shown at "/" (null → none) */
  pageId: z
    .string()
    .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    .nullable()
    .default(null),
});

export const SETTINGS = {
  store: def({ schema: StoreSettings, secret: false, defaults: () => ({}) }),
  defaults: def({ schema: DefaultsSettings, secret: false, defaults: () => ({}) }),
  sheets: def({ schema: SheetsSettings, secret: false, defaults: () => ({ enabled: false }) }),
  pixels: def({ schema: PixelsSettings, secret: false, defaults: () => ({}) }),
  /** the pixel library (§A.2) — also the migration marker: written last by migrate.server.ts */
  pixel_library: def({ schema: PixelLibrarySettings, secret: false, defaults: () => ({ v: 1 as const, pixels: [] }) }),
  /** last server outcome per pixel, "platform:id" → entry (§A.2) */
  pixel_health: def({ schema: PixelHealthSettings, secret: false, defaults: () => ({}) }),
  tracking_secrets: def({
    schema: TrackingSecretsSettings,
    secret: true,
    defaults: () => ({}),
    sensitive: ["metaTokens", "tiktokTokens", "metaCapiToken", "tiktokToken", "snapToken", "ga4ApiSecret"],
  }),
  ai: def({ schema: AiSettings, secret: false, defaults: () => ({}) }),
  turnstile: def({
    schema: TurnstileSettings,
    secret: true,
    // environment keys act as defaults until the admin saves their own
    defaults: () => ({
      siteKey: process.env.TURNSTILE_SITE_KEY || undefined,
      secretKey: process.env.TURNSTILE_SECRET_KEY || undefined,
    }),
    sensitive: ["secretKey"],
  }),
  home: def({ schema: HomeSettings, secret: false, defaults: () => ({ pageId: null }) }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.output<(typeof SETTINGS)[K]["schema"]>;
export type SettingInput<K extends SettingKey> = z.input<(typeof SETTINGS)[K]["schema"]>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** The schema of a key, typed by key (the registry is a heterogeneous map). */
export function settingSchema<K extends SettingKey>(key: K): z.ZodType<SettingValue<K>, SettingInput<K>> {
  return SETTINGS[key].schema as unknown as z.ZodType<SettingValue<K>, SettingInput<K>>;
}

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === "string" && Object.hasOwn(SETTINGS, value);
}

/**
 * Copy of a value that is safe to send to the browser: sensitive fields are replaced by a mask.
 * Forms should treat an untouched masked field as "keep the stored secret" (see updateSetting()).
 */
export function redactSetting<K extends SettingKey>(key: K, value: SettingValue<K>): SettingValue<K> {
  return redactFields(value, SETTINGS[key].sensitive);
}
