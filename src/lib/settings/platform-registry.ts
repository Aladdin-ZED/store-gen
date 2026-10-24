/**
 * Platform settings registry (docs/STORE-SAAS.md §D.10, TN-04): every R1 platform key, rows in `settings`, read
 * through `getPlatformSetting(key)` and written through `setPlatformSetting(key, input, actor)` from platform code
 * only (src/lib/settings/index.ts; T1). Isomorphic (no I/O), like the store registry.
 *
 * Owned by the core maintainer (§K.3); each schema lives in `./keys/*.ts`, owned by the part §D.10 names. Secret
 * keys are sealed whole with envelope v2, scope `platform` (§F.3), and never sent to the browser.
 *
 * R2 and R3 keys (platform_mail, platform_push, platform_cloudflare) are added by the contract step of their release.
 */
import type { z } from "zod";
import { def, redactFields } from "./fields";
import { DocSchemaMarker, TenancyV1Marker } from "./keys/markers";
import { PlatformSettingSchema } from "./keys/platform";
import { PlatformDesign } from "./keys/platform-design";
import { PlatformAi } from "./keys/platform_ai";
import { PlatformAiSecret } from "./keys/platform_ai_secret";
import { PlatformBackupSetting } from "./keys/platform_backup";
import { TurnstileSetting } from "./keys/turnstile";

export const PLATFORM_SETTINGS = {
  /** published-checksum marker (core, DB-19) */
  doc_schema: def({ schema: DocSchemaMarker, secret: false, defaults: () => 0 }),
  /** the store #1 conversion marker, written last (core, §D.8) */
  tenancy_v1: def({ schema: TenancyV1Marker, secret: false, defaults: () => null }),
  /** brand, signup, new-store defaults, reserved handles, analytics k, health and lifecycle tunables (platform, P1) */
  platform: def({ schema: PlatformSettingSchema, secret: false, defaults: () => ({}) }),
  /** AI classes, prices, caps, eval gate (ai, P7) */
  platform_ai: def({ schema: PlatformAi, secret: false, defaults: () => ({}) }),
  /** the provider key (ai, P7); env ANTHROPIC_API_KEY is the reader's fallback, never a default here */
  platform_ai_secret: def({ schema: PlatformAiSecret, secret: true, defaults: () => ({}), sensitive: ["apiKey"] }),
  /** publish-gate thresholds and the incident switch (design, P6) */
  platform_design: def({ schema: PlatformDesign, secret: false, defaults: () => ({}) }),
  /** the platform Turnstile widget (core); env TURNSTILE_* are its defaults until the console saves keys (SET-09) */
  platform_turnstile: def({
    schema: TurnstileSetting,
    secret: true,
    defaults: () => ({
      siteKey: process.env.TURNSTILE_SITE_KEY || undefined,
      secretKey: process.env.TURNSTILE_SECRET_KEY || undefined,
    }),
    sensitive: ["secretKey"],
  }),
  /** retention, tables, last download (core, §H.6) */
  platform_backup: def({ schema: PlatformBackupSetting, secret: false, defaults: () => ({}) }),
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS;
export type PlatformSettingValue<K extends PlatformSettingKey> = z.output<(typeof PLATFORM_SETTINGS)[K]["schema"]>;
export type PlatformSettingInput<K extends PlatformSettingKey> = z.input<(typeof PLATFORM_SETTINGS)[K]["schema"]>;
export const PLATFORM_SETTING_KEYS = Object.keys(PLATFORM_SETTINGS) as PlatformSettingKey[];

/** The schema of a platform key, typed by key. */
export function platformSettingSchema<K extends PlatformSettingKey>(key: K): z.ZodType<PlatformSettingValue<K>, PlatformSettingInput<K>> {
  return PLATFORM_SETTINGS[key].schema as unknown as z.ZodType<PlatformSettingValue<K>, PlatformSettingInput<K>>;
}

export function isPlatformSettingKey(value: unknown): value is PlatformSettingKey {
  return typeof value === "string" && Object.hasOwn(PLATFORM_SETTINGS, value);
}

/** Copy safe for the browser: the key's sensitive fields masked. */
export function redactPlatformSetting<K extends PlatformSettingKey>(key: K, value: PlatformSettingValue<K>): PlatformSettingValue<K> {
  return redactFields(value, PLATFORM_SETTINGS[key].sensitive);
}
