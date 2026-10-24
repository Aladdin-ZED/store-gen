/**
 * Store settings registry (docs/STORE-SAAS.md §D.10, TN-04): every R1 store key, rows in `store_settings`
 * (PK store_id + key), read and written only through the scoped API of src/lib/settings/index.ts
 * (`getStoreSetting(scope, key)`, …; T1). Isomorphic (no I/O) so forms validate with the same schemas.
 *
 * Owned by the core maintainer (§K.3). A key's schema lives in its extension file `./keys/<key>.ts`, owned by
 * the part §D.10 names, so tracks widen a schema without editing this file; whether a key is secret (sealed
 * whole with envelope v2, scope `store:<storeId>`, purpose `settings:<key>`, §F.3) and which fields are masked
 * are decided here. Defaults never read the environment: a store without its own Turnstile keys uses the
 * platform's (`platform_turnstile`), which the reader resolves.
 *
 * R2 and R3 keys (storefront, carrier_credentials, sheets_sa, whatsapp_cloud, feeds, reviews) are added by the
 * contract step of their release.
 */
import type { z } from "zod";
import { def, redactFields } from "./fields";
import { AccountingSetting } from "./keys/accounting";
import { BrandSetting } from "./keys/brand";
import { CheckoutSetting } from "./keys/checkout";
import { ConversionsSetting } from "./keys/conversions";
import { DefaultsSetting } from "./keys/defaults";
import { ExportKeySetting } from "./keys/export_key";
import { LandingSetting } from "./keys/landing";
import { NotificationsSetting } from "./keys/notifications";
import { OnboardingSchema } from "./keys/onboarding";
import { OpsSetting } from "./keys/ops";
import { PixelHealthSettings } from "./keys/pixel_health";
import { PixelLibrarySettings } from "./keys/pixel_library";
import { PoliciesSetting } from "./keys/policies";
import { SheetsSetting } from "./keys/sheets";
import { StoreSetting } from "./keys/store";
import { StoreAi } from "./keys/store_ai";
import { TelegramSetting } from "./keys/telegram";
import { TrackingSecretsSettings } from "./keys/tracking_secrets";
import { TurnstileSetting } from "./keys/turnstile";

export const STORE_SETTINGS = {
  /** contacts, legal facts, the LP-04 confirmation block (core) */
  store: def({ schema: StoreSetting, secret: false, defaults: () => ({}) }),
  /** new-page defaults (core) */
  defaults: def({ schema: DefaultsSetting, secret: false, defaults: () => ({}) }),
  /** the store's Google Sheet (operations, P5) */
  sheets: def({ schema: SheetsSetting, secret: false, defaults: () => ({}) }),
  /** every pixel the store knows (operations, P5) */
  pixel_library: def({ schema: PixelLibrarySettings, secret: false, defaults: () => ({ v: 1 as const, pixels: [] }) }),
  /** last server outcome per pixel (operations, P5) */
  pixel_health: def({ schema: PixelHealthSettings, secret: false, defaults: () => ({}) }),
  /** CAPI / Events API credentials per pixel id (operations, P5) */
  tracking_secrets: def({
    schema: TrackingSecretsSettings,
    secret: true,
    defaults: () => ({}),
    sensitive: ["metaTokens", "tiktokTokens", "metaCapiToken", "tiktokToken", "snapToken", "ga4ApiSecret"],
  }),
  /** the store's own Turnstile widget, overriding platform_turnstile (core; needed for custom domains, R3) */
  turnstile: def({ schema: TurnstileSetting, secret: true, defaults: () => ({}), sensitive: ["secretKey"] }),
  /** AI choices (ai, P7) */
  store_ai: def({ schema: StoreAi, secret: false, defaults: () => ({}) }),
  /** logo, colours, fonts, brand gene locks (design, P6) */
  brand: def({ schema: BrandSetting, secret: false, defaults: () => ({}) }),
  /** the onboarding wizard (platform, P2) */
  onboarding: def({ schema: OnboardingSchema, secret: false, defaults: () => ({}) }),
  /** landing behaviour (landing, P3) */
  landing: def({ schema: LandingSetting, secret: false, defaults: () => ({}) }),
  /** policy facts, the single source of promises (landing, P3) */
  policies: def({ schema: PoliciesSetting, secret: false, defaults: () => ({}) }),
  /** zones, calendar, address mode (landing, P3; storefront merges its R2 block) */
  checkout: def({ schema: CheckoutSetting, secret: false, defaults: () => ({}) }),
  /** Profit lite inputs (operations, P4) */
  accounting: def({ schema: AccountingSetting, secret: false, defaults: () => ({}) }),
  /** the call centre and the one calling window (operations, P4) */
  ops: def({ schema: OpsSetting, secret: false, defaults: () => ({}) }),
  /** Purchase trigger and custom events (operations, P5) */
  conversions: def({ schema: ConversionsSetting, secret: false, defaults: () => ({}) }),
  /** Telegram / in-app events, daily summary hour (operations, P5) */
  notifications: def({ schema: NotificationsSetting, secret: false, defaults: () => ({}) }),
  /** bot token and chat (operations, P5) */
  telegram: def({ schema: TelegramSetting, secret: true, defaults: () => ({}), sensitive: ["botToken"] }),
  /** the store-owned Google key of PHP exports (operations, P5) */
  export_key: def({ schema: ExportKeySetting, secret: true, defaults: () => ({}), sensitive: ["privateKey"] }),
} as const;

export type StoreSettingKey = keyof typeof STORE_SETTINGS;
export type StoreSettingValue<K extends StoreSettingKey> = z.output<(typeof STORE_SETTINGS)[K]["schema"]>;
export type StoreSettingInput<K extends StoreSettingKey> = z.input<(typeof STORE_SETTINGS)[K]["schema"]>;
export const STORE_SETTING_KEYS = Object.keys(STORE_SETTINGS) as StoreSettingKey[];

/** The schema of a store key, typed by key (the registry is a heterogeneous map). */
export function storeSettingSchema<K extends StoreSettingKey>(key: K): z.ZodType<StoreSettingValue<K>, StoreSettingInput<K>> {
  return STORE_SETTINGS[key].schema as unknown as z.ZodType<StoreSettingValue<K>, StoreSettingInput<K>>;
}

export function isStoreSettingKey(value: unknown): value is StoreSettingKey {
  return typeof value === "string" && Object.hasOwn(STORE_SETTINGS, value);
}

/** Copy safe for the browser: the key's sensitive fields masked (forms keep a field submitted as the mask). */
export function redactStoreSetting<K extends StoreSettingKey>(key: K, value: StoreSettingValue<K>): StoreSettingValue<K> {
  return redactFields(value, STORE_SETTINGS[key].sensitive);
}
