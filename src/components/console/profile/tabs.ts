/**
 * The store profile's tab router (platform.md PLA-§7.1, PD32): pure, so `test:platform` pins it.
 *
 * R1 tabs: overview (the default, `/admin/stores/<id>`), orders, team, activity (`?view=timeline` for the merged
 * stream), usage, notes; keys 1-6 jump to them. The R2 / R3 tab paths (pages, integrations, domains, risk, media, ops,
 * support) answer the console's own "Arrives with R2" page, a sentence and a link to the Overview strip that already
 * shows their R1 data: never a 404 and never placeholder numbers. Anything else is an unknown path.
 *
 *   resolveProfileTab(undefined)          // { kind: "tab", tab: "overview" }
 *   resolveProfileTab(["risk"])           // { kind: "deferred", tab: "risk", strip: "risk", release: "R2" }
 *   profileHref(id, "activity", "view=timeline")   // "/admin/stores/<id>/activity?view=timeline"
 */

export const PROFILE_TABS = ["overview", "orders", "team", "activity", "usage", "notes"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** The ten Overview strips (src/lib/platform/profile/overview-strips.ts `STRIPS`, in the same order). */
export type ProfileStrip = "identity" | "health" | "pages" | "orders" | "team" | "integrations" | "ai" | "usage" | "risk" | "timeline";

/** Each later tab and the strip that carries its R1 data (PLA-§7.5, §7.10, §7.13, §7.15). */
export const DEFERRED_TABS = {
  pages: { strip: "pages", release: "R2" },
  integrations: { strip: "integrations", release: "R2" },
  domains: { strip: "identity", release: "R2" },
  risk: { strip: "risk", release: "R2" },
  media: { strip: "usage", release: "R2" },
  ops: { strip: "orders", release: "R2" },
  support: { strip: "timeline", release: "R3" },
} as const satisfies Record<string, { strip: ProfileStrip; release: "R2" | "R3" }>;
export type DeferredTab = keyof typeof DEFERRED_TABS;

export type ResolvedTab =
  | { kind: "tab"; tab: ProfileTab }
  | { kind: "deferred"; tab: DeferredTab; strip: ProfileStrip; release: "R2" | "R3" }
  | { kind: "unknown" };

const isTab = (s: string): s is ProfileTab => (PROFILE_TABS as readonly string[]).includes(s);
const isDeferred = (s: string): s is DeferredTab => Object.hasOwn(DEFERRED_TABS, s);

/** The `[[...tab]]` segments as a tab, a later tab's page, or unknown (one segment at most). */
export function resolveProfileTab(segments: readonly string[] | undefined): ResolvedTab {
  if (!segments || segments.length === 0) return { kind: "tab", tab: "overview" };
  if (segments.length > 1) return { kind: "unknown" };
  const s = segments[0]!;
  if (isTab(s)) return { kind: "tab", tab: s };
  if (isDeferred(s)) return { kind: "deferred", tab: s, ...DEFERRED_TABS[s] };
  return { kind: "unknown" };
}

/** Keys 1-6 → the R1 tabs in order (the tabs the viewer may not open are skipped by the caller). */
export function tabOfKey(key: string): ProfileTab | null {
  const i = ["1", "2", "3", "4", "5", "6"].indexOf(key);
  return i >= 0 ? PROFILE_TABS[i]! : null;
}

/** The tabs a role sees: analysts never see notes (`stores.notes`, PLA-§7.12). */
export function visibleTabs(canNotes: boolean): ProfileTab[] {
  return PROFILE_TABS.filter((t) => t !== "notes" || canNotes);
}

/** A tab's path; the overview is the profile's own path. */
export function profileHref(storeId: string, tab: ProfileTab = "overview", search = ""): string {
  const base = `/admin/stores/${storeId}${tab === "overview" ? "" : `/${tab}`}`;
  return search ? `${base}?${search.replace(/^\?/, "")}` : base;
}

/** The anchor of an Overview strip (the "Arrives with R2" page links to it; the strip opens itself on a phone). */
export const stripAnchor = (strip: ProfileStrip): string => `strip-${strip}`;

/** The tab a pathname shows (`/admin/stores/<id>/team` → "team"), the overview for the bare profile path. */
export function tabOfPath(pathname: string, storeId: string): ProfileTab | DeferredTab | null {
  const rest = pathname.split(`/admin/stores/${storeId}`)[1];
  if (rest === undefined) return null;
  const seg = rest.replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
  if (!seg) return "overview";
  return isTab(seg) || isDeferred(seg) ? seg : null;
}
