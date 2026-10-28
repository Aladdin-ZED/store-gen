/**
 * The platform console's shared types (platform.md PLA-§2.1, §2.2). Isomorphic, type-only: no runtime import, so a
 * client component can import any of them.
 *
 * The signup-risk JSON shapes live with their column in src/lib/db/schema.ts (the maintainer's, frozen at P0) and the
 * Store Health shapes in src/lib/health/types.ts (core §I.7, the maintainer's skeleton); both are re-exported here so
 * console code has one place to import from and nothing is declared twice.
 */
import type { PlatformSetting } from "@/lib/settings/keys/platform";

export type { ReviewRequest, SignupBand, SignupFlag, SignupFlagCode, SignupSignals } from "@/lib/db/schema";
export type { HealthFlag, HealthFlagCode, HealthMetrics, Milestone, StoreHealthView } from "@/lib/health/types";

/** The platform signup mode (`platform.signup.mode`, core §B.2; `null` in the setting = derived, D9). */
export type SignupMode = "closed" | "invite" | "approval" | "waitlist" | "open";

/** `platform.signup.thresholds`: the band boundaries of PD3 (fast ≤ fastLaneMax < review < holdMin ≤ hold < rejectCandidateMin). */
export type SignupThresholds = PlatformSetting["signup"]["thresholds"];

/** The hashed identity-link kinds (`identity_links.kind`, core §D.4). */
export type IdentityKind = "email_norm" | "phone" | "net" | "device";
