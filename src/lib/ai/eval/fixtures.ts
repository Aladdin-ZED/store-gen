/**
 * The R1 eval sets, by family (P7 AI; ai.md AI-§F.3, AI-07 (2)). Isomorphic (no file access: `withPhotos` takes the
 * reader).
 *
 *   EVAL_SETS["copy.page"].fixtures      → the family's fixtures (sets/copy.page/fixtures.ts)
 *   fixturesHash("director.critique")    → sha256 of that family's fixtures alone (rev 3, ENGP-30): a fixture added to
 *                                          copy.page does not invalidate a live run of director.critique; a shared
 *                                          case is hashed into each family that imports it
 *   SMOKE_FIXTURES                       → the 20 committed smoke cases (`test:ai-eval --offline`, in test:slow)
 *   storeCtxOf(fixture)                  → the StoreBlockCtx a fixture's store gives (a synthetic store id per store)
 */
import { DEFAULT_WINDOW } from "@/lib/callcenter/defaults";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { PoliciesSetting } from "@/lib/settings/keys/policies";
import { BrandVoice } from "@/lib/settings/keys/store_ai";
import { callingHoursFor } from "../schema/tasks/types";
import type { StoreBlockCtx } from "../prompts/store-block";
import { R1_FAMILIES, type R1Family } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import { canonicalJson } from "../prompts/text";
import type { EvalFixture, FamilySet, FixtureStore } from "./types";
import { SET as ANALYZE } from "./sets/analyze/fixtures";
import { SET as BRIEF } from "./sets/brief/fixtures";
import { SET as COPY_FIELD } from "./sets/copy.field/fixtures";
import { SET as COPY_HERO } from "./sets/copy.hero/fixtures";
import { SET as COPY_PAGE } from "./sets/copy.page/fixtures";
import { SET as DIRECTOR_CRITIQUE } from "./sets/director.critique/fixtures";
import { SET as DIRECTOR_PLAN } from "./sets/director.plan/fixtures";
import { SET as JUDGE } from "./sets/judge/fixtures";
import { SET as SCREEN } from "./sets/screen/fixtures";
import { SET as SCRIPT } from "./sets/script/fixtures";

export const EVAL_SETS: Readonly<Record<R1Family, FamilySet>> = {
  "copy.page": COPY_PAGE as FamilySet,
  "copy.hero": COPY_HERO as FamilySet,
  "copy.field": COPY_FIELD as FamilySet,
  analyze: ANALYZE as FamilySet,
  "director.plan": DIRECTOR_PLAN as FamilySet,
  "director.critique": DIRECTOR_CRITIQUE as FamilySet,
  script: SCRIPT as FamilySet,
  brief: BRIEF as FamilySet,
  screen: SCREEN as FamilySet,
  judge: JUDGE as FamilySet,
};

/** sha256 of the family's fixtures as canonical JSON (RegExps as /source/flags, photos by path and file hash). */
export function fixturesHash(family: R1Family): string {
  return sha256Hex(canonicalJson(EVAL_SETS[family].fixtures));
}

/** The first 12 hex: the `<hash>` of `baseline/library@<hash>.json`. */
export const shortHash = (h: string): string => h.slice(0, 12);

export const ALL_FIXTURES: readonly EvalFixture[] = R1_FAMILIES.flatMap((f) => EVAL_SETS[f].fixtures);
export const SMOKE_FIXTURES: readonly EvalFixture[] = ALL_FIXTURES.filter((f) => f.smoke);

/** A fixture store's synthetic id: 26 characters of [0-9A-Z], like a real store id, stable per store. */
export function fixtureStoreId(store: FixtureStore): string {
  return sha256Hex(`fixture-store|${store.id}`).slice(0, 26).toUpperCase();
}

/** The instant the fixture stores' hours text is built at (a Monday morning in Casablanca). */
export const FIXTURE_NOW = new Date("2026-11-02T09:00:00.000Z");

/** The store's window as P4's `callingWindowFor` answers it: the default days, saved by the owner or not. */
export function fixtureWindow(store: FixtureStore): EffectiveWindow {
  return { tz: "Africa/Casablanca", days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured: store.window.configured };
}

/** The store layer a fixture runs with: the store's settings parsed as the real loader parses them. */
export function storeCtxOf(f: Pick<EvalFixture, "store">, storeId: string = fixtureStoreId(f.store)): StoreBlockCtx {
  const s = f.store;
  const hours = callingHoursFor(fixtureWindow(s), s.primaryLocale, `${s.primaryLocale}-MA`, FIXTURE_NOW, s.window.withinHours);
  return {
    storeId,
    market: s.market,
    currency: s.currency,
    primaryLocale: s.primaryLocale,
    policies: PoliciesSetting.parse(s.policies),
    hasWhatsapp: s.hasWhatsapp,
    callingHours: hours,
    voice: BrandVoice.parse(s.voice),
    memory: s.memory.map((m, i) => ({ id: `${s.id}-m${i + 1}`, storeId, kind: m.kind, text: m.text, locale: m.locale, source: "explicit", active: true, pinned: false, evidence: null })),
    exemplars: [],
  };
}

/** The fixture with its images' `data` filled from its photo files (base64), for a live or recorded run. */
export function withPhotos<F extends EvalFixture>(f: F, read: (path: string) => Uint8Array): F {
  if (!f.photos?.length) return f;
  const toB64 = (b: Uint8Array) => {
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const data = f.photos.map((p) => toB64(read(p.path)));
  const input = f.input as { images?: { data: string }[] };
  if (!Array.isArray(input.images)) return f;
  return { ...f, input: { ...input, images: input.images.map((img, i) => ({ ...img, data: data[i] ?? img.data })) } };
}
