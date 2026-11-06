/**
 * Store Health rules of the design track (P6 DESIGN; design.md DES-§2.10, DES-§8.11, DS46; docs/STORE-SAAS.md §I.7).
 * Extension file (§K.3) imported by src/lib/health/registry.ts; it exports the rules and their `test:health`
 * fixtures only. Every rule reads the store's own live `design_genomes` rows through `designHealth(scope)` (the job
 * passes it as `inputs.design`): ids, q, slop, hasLook and the store's own close pairs, never page text or another
 * store. `brand_empty` also reads the store's own brand setting (logo, colour locks) through the scope. Group
 * `design`, cap 15 (`HEALTH_CAPS.design`); the score never gates a publish.
 */
import { appHref } from "@/lib/urls";
import type { DesignHealth } from "@/lib/design/health.server";
import type { StoreScope } from "@/lib/tenancy/types";
import type { HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

const Q_LINE = 70;
const SLOP_LINE = 3;
const edit = (pageId: string) => (handle: string) => appHref(handle, `/pages/${pageId}/edit`);
const design = (inputs: HealthInputs): DesignHealth | null => inputs.design;

/** The brand's logo and colour locks: the inputs' when the job passes them (CCR r1-p6-11), else the store's setting. */
async function brandFacts(scope: StoreScope | null, inputs: HealthInputs): Promise<{ logo: boolean; colorLocked: boolean } | null> {
  const given = inputs.brand as (HealthInputs["brand"] & { logo?: boolean; colorLocked?: boolean }) | null;
  if (given && typeof given.logo === "boolean" && typeof given.colorLocked === "boolean") return { logo: given.logo, colorLocked: given.colorLocked };
  if (!scope) return null;
  try {
    const { getStoreSetting } = await import("@/lib/settings");
    const brand = await getStoreSetting(scope, "brand");
    return { logo: !!(brand.logo.primary || brand.logo.mark || brand.logo.wordmark), colorLocked: brand.colors.locks.length > 0 };
  } catch {
    return null;
  }
}

/** A rule whose body also runs without a store (`previewIssue`): only `brand_empty` reads the scope, and then only when the inputs carry no brand facts. */
type DesignRule = Omit<HealthRule, "collect"> & { check(scope: StoreScope | null, inputs: HealthInputs): Promise<HealthIssue | null> };

const RULES: DesignRule[] = [
  {
    id: "design:q_low",
    group: "design",
    release: "R1",
    async check(_scope, inputs): Promise<HealthIssue | null> {
      const d = design(inputs);
      if (!d?.pages.length) return null;
      const low = d.pages.filter((p) => p.q !== null && p.q < Q_LINE).sort((a, b) => (a.q ?? 0) - (b.q ?? 0));
      if (!low.length) return null;
      return {
        id: "design:q_low",
        group: "design",
        severity: 2,
        points: 6,
        evidence: { metric: "q", value: low[0]!.q ?? 0, baseline: Q_LINE, window: "live", n: d.pages.length },
        fix: { kind: "link", href: edit(low[0]!.pageId), label: "design.health.q_low.fix" },
        text: "design.health.q_low",
      };
    },
  },
  {
    id: "design:slop",
    group: "design",
    release: "R1",
    async check(_scope, inputs): Promise<HealthIssue | null> {
      const d = design(inputs);
      if (!d?.pages.length) return null;
      const sloppy = d.pages.filter((p) => p.slop !== null && p.slop >= SLOP_LINE);
      if (!sloppy.length) return null;
      return {
        id: "design:slop",
        group: "design",
        severity: 2,
        points: 6,
        evidence: { metric: "slop", value: Math.max(...sloppy.map((p) => p.slop ?? 0)), baseline: SLOP_LINE, window: "live", n: d.pages.length },
        fix: { kind: "action", actionId: "design.repair_all", label: "design.health.slop.fix" },
        text: "design.health.slop",
      };
    },
  },
  {
    id: "design:pages_close",
    group: "design",
    release: "R1",
    async check(_scope, inputs): Promise<HealthIssue | null> {
      const d = design(inputs);
      if (!d?.closePairs.length) return null;
      const newer = d.closePairs[0]![1];
      return {
        id: "design:pages_close",
        group: "design",
        severity: 1,
        points: 3,
        evidence: { metric: "close_pairs", value: d.closePairs.length, window: "live", n: d.pages.length },
        fix: { kind: "link", href: edit(newer), label: "design.health.pages_close.fix" },
        text: "design.health.pages_close",
      };
    },
  },
  {
    id: "design:no_dna",
    group: "design",
    release: "R1",
    async check(_scope, inputs): Promise<HealthIssue | null> {
      const d = design(inputs);
      if (!d?.pages.length) return null;
      const bare = d.pages.filter((p) => !p.hasLook);
      if (!bare.length) return null;
      return {
        id: "design:no_dna",
        group: "design",
        severity: 1,
        points: 3,
        evidence: { metric: "pages_without_dna", value: bare.length, window: "live", n: d.pages.length },
        fix: { kind: "link", href: edit(bare[0]!.pageId), label: "design.health.no_dna.fix" },
        text: "design.health.no_dna",
      };
    },
  },
  {
    id: "design:brand_empty",
    group: "design",
    release: "R1",
    mode: "landing",
    async check(scope, inputs): Promise<HealthIssue | null> {
      const d = design(inputs);
      const live = d?.pages.length ?? 0;
      if (live < 2) return null;
      const brand = await brandFacts(scope, inputs);
      if (!brand || brand.logo || brand.colorLocked) return null;
      return {
        id: "design:brand_empty",
        group: "design",
        severity: 1,
        points: 3,
        evidence: { metric: "live_pages", value: live, window: "live", n: live },
        fix: { kind: "link", href: (handle) => appHref(handle, "/brand"), label: "design.health.brand_empty.fix" },
        text: "design.health.brand_empty",
      };
    },
  },
];

export const rules: HealthRule[] = RULES.map(({ check, ...rule }) => ({ ...rule, collect: (scope: StoreScope, inputs: HealthInputs) => check(scope, inputs) }));

/** The issue a rule raises on the given inputs without a store (the dev fixture page; brand facts come from the inputs only). */
export function previewIssue(ruleId: string, inputs: HealthInputs): Promise<HealthIssue | null> {
  const rule = RULES.find((r) => r.id === ruleId);
  return rule ? rule.check(null, inputs) : Promise.resolve(null);
}

const page = (pageId: string, q: number | null, slop: number | null, hasLook = true) => ({ pageId, q, slop, hasLook, genomeId: `g-${pageId}` });
const health = (pages: DesignHealth["pages"], closePairs: [string, string][] = []): DesignHealth => ({ pages, closePairs });
/** brand facts as the job will pass them (CCR r1-p6-11); the rule reads the store's setting without them */
const brand = (logo: boolean, colorLocked: boolean) => ({ storeName: "Fixture", legalName: null, whatsappName: null, policyTexts: [], logo, colorLocked }) as HealthInputs["brand"];

/** `test:health` fixtures (one per rule, `HealthRuleFixture`, P0b). */
export const fixtures: HealthRuleFixture[] = [
  { rule: "design:q_low", fires: { design: health([page("p1", 62, 1), page("p2", 88, 0)]) }, silent: { design: health([page("p1", 82, 1), page("p2", 88, 0)]) }, expect: { severity: 2, metric: "q" } },
  { rule: "design:slop", fires: { design: health([page("p1", 80, 4)]) }, silent: { design: health([page("p1", 80, 2)]) }, expect: { severity: 2, metric: "slop" } },
  { rule: "design:pages_close", fires: { design: health([page("p1", 80, 1), page("p2", 81, 1)], [["p1", "p2"]]) }, silent: { design: health([page("p1", 80, 1), page("p2", 81, 1)]) }, expect: { severity: 1, metric: "close_pairs" } },
  { rule: "design:no_dna", fires: { design: health([page("p1", 75, 1, false)]) }, silent: { design: health([page("p1", 75, 1, true)]) }, expect: { severity: 1, metric: "pages_without_dna" } },
  { rule: "design:brand_empty", fires: { design: health([page("p1", 80, 1), page("p2", 80, 1)]), brand: brand(false, false) }, silent: { design: health([page("p1", 80, 1), page("p2", 80, 1)]), brand: brand(true, false) }, expect: { severity: 1, metric: "live_pages" } },
];
