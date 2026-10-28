/**
 * Store Health rules of the shell track (P2 SHELL, platform.md PLA-§6.3.2, §22.16; SF-03).
 * Extension file (docs/STORE-SAAS.md §I.7, §K.3), created empty at P0 and imported by src/lib/health/registry.ts;
 * the track fills it (sentences `health.shell.<rule>.*` in its own i18n file, D67) and never edits the registry.
 *
 * Three setup rules, ids exactly as PLA-§6.3.2 writes them (there is no "no published page" rule here: P3's
 * `landing:no_live_page` is the one, rev 4):
 *
 *   shell:contact          no phone and no WhatsApp in the `store` setting         sev 3   link settings/general
 *   shell:legal_identity   the `store` setting's legal name is empty               sev 1   link settings/general
 *   shell:2fa_orders       a member with orders.read_all has no TOTP              sev 2   link settings/security
 *
 * The conditions are pure functions of `ShellFacts`, so the dashboard and the onboarding `done` step run the same
 * conditions in the browser before the first job (`localSetupIssues`, PLA-§22.16 item 1). A rule whose source is
 * missing (`settings` or `members` null) is silent. Evidence always carries `n`, never customer data; each rule is
 * synchronous work well under the 40 ms budget and reads only the inputs of its own store.
 */
import { appHref } from "@/lib/urls";
import type { HealthEvidence, HealthGroup, HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

/** The store facts the rules read: from `HealthInputs` on the server, from the layout's store data in the browser. */
export interface ShellFacts {
  /** the `store` setting's contact numbers; null = the setting could not be read */
  contact: { phone: string | null; whatsapp: string | null } | null;
  /** the `store` setting's legal name; undefined = the setting could not be read */
  legalName: string | null | undefined;
  /** members holding `orders.read_all` without TOTP, and the member count; null = members not read */
  members: { withoutTotpWithOrdersReadAll: number; total: number } | null;
}

type Severity = HealthIssue["severity"];
const POINTS: Record<Severity, HealthIssue["points"]> = { 1: 3, 2: 6, 3: 10 };

interface ShellRuleDef {
  id: "shell:contact" | "shell:legal_identity" | "shell:2fa_orders";
  group: HealthGroup;
  severity: Severity;
  path: "/settings/general" | "/settings/security";
  /** the evidence when the condition holds, null when it does not (or its source is missing) */
  condition(facts: ShellFacts): HealthEvidence | null;
}

const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

/** No way to reach the store: neither a phone nor a WhatsApp number. */
export function contactMissing(facts: ShellFacts): HealthEvidence | null {
  if (!facts.contact) return null;
  const channels = [facts.contact.phone, facts.contact.whatsapp].filter((v) => !blank(v)).length;
  return channels === 0 ? { metric: "contact_channels", value: 0, window: "now", n: 2 } : null;
}

/** The legal name is empty. */
export function legalIdentityMissing(facts: ShellFacts): HealthEvidence | null {
  if (facts.legalName === undefined) return null;
  return blank(facts.legalName) ? { metric: "legal_name_set", value: 0, window: "now", n: 1 } : null;
}

/** Members who see every order without two-step verification (the count only, never who). */
export function twoFactorGap(facts: ShellFacts): HealthEvidence | null {
  if (!facts.members) return null;
  const k = facts.members.withoutTotpWithOrdersReadAll;
  if (!Number.isSafeInteger(k) || k <= 0) return null;
  return { metric: "members_without_totp_read_all", value: k, window: "now", n: Math.max(k, facts.members.total) };
}

const DEFS: readonly ShellRuleDef[] = [
  { id: "shell:contact", group: "setup", severity: 3, path: "/settings/general", condition: contactMissing },
  { id: "shell:legal_identity", group: "setup", severity: 1, path: "/settings/general", condition: legalIdentityMissing },
  { id: "shell:2fa_orders", group: "setup", severity: 2, path: "/settings/security", condition: twoFactorGap },
];

/** The facts of one store's inputs (its own settings and members only). */
export function shellFactsOf(inputs: Pick<HealthInputs, "settings" | "members">): ShellFacts {
  const s = inputs.settings?.store ?? null;
  return {
    contact: s ? { phone: s.phone ?? null, whatsapp: s.whatsapp ?? null } : null,
    legalName: s ? (s.legalName ?? null) : undefined,
    members: inputs.members ? { withoutTotpWithOrdersReadAll: inputs.members.withoutTotpWithOrdersReadAll, total: inputs.members.total } : null,
  };
}

function issueOf(def: ShellRuleDef, evidence: HealthEvidence): HealthIssue {
  const rule = def.id.slice("shell:".length);
  const path = def.path;
  return {
    id: def.id,
    group: def.group,
    severity: def.severity,
    points: POINTS[def.severity],
    evidence,
    fix: { kind: "link", href: (handle: string) => appHref(handle, path), label: `health.shell.${rule}.fix` },
    text: `health.shell.${rule}.text`,
  };
}

/** The synchronous client pass (PLA-§22.16 item 1): the setup issues of the facts the page already has. */
export function localSetupIssues(facts: ShellFacts): HealthIssue[] {
  const out: HealthIssue[] = [];
  for (const def of DEFS) {
    const evidence = def.condition(facts);
    if (evidence) out.push(issueOf(def, evidence));
  }
  return out.sort((a, b) => b.points - a.points || (a.id < b.id ? -1 : 1));
}

export const rules: HealthRule[] = DEFS.map((def) => ({
  id: def.id,
  group: def.group,
  release: "R1",
  async collect(_scope, inputs) {
    const evidence = def.condition(shellFactsOf(inputs));
    return evidence ? issueOf(def, evidence) : null;
  },
}));

const SETTINGS_BASE = { country: "MA", socials: {}, confirmation: {} } as const;
type StoreSettingFixture = NonNullable<HealthInputs["settings"]>["store"];
/** A `settings` input whose `store` value is `store` (the other keys are not read by these rules). */
function settingsWith(store: Partial<StoreSettingFixture>): HealthInputs["settings"] {
  return { store: { ...SETTINGS_BASE, ...store } } as unknown as HealthInputs["settings"];
}
const MEMBERS = (k: number, total: number): HealthInputs["members"] => ({ total, withoutTotpWithOrdersReadAll: k, lastActiveAt: null, lastLoginAt: null });

/** `test:health` fixtures of this file's rules (one per rule, `HealthRuleFixture`, P0b), also run by `test:shell`. */
export const fixtures: HealthRuleFixture[] = [
  {
    rule: "shell:contact",
    fires: { settings: settingsWith({ legalName: "Atlas SARL" }) },
    silent: { settings: settingsWith({ whatsapp: "+212600000001", legalName: "Atlas SARL" }) },
    expect: { severity: 3, metric: "contact_channels" },
  },
  {
    rule: "shell:legal_identity",
    fires: { settings: settingsWith({ phone: "+212600000001" }) },
    silent: { settings: settingsWith({ phone: "+212600000001", legalName: "Atlas SARL" }) },
    expect: { severity: 1, metric: "legal_name_set" },
  },
  {
    rule: "shell:2fa_orders",
    fires: { members: MEMBERS(2, 4) },
    silent: { members: MEMBERS(0, 4) },
    expect: { severity: 2, metric: "members_without_totp_read_all" },
  },
];

/** The brief's name for the same fixtures (P1's `test:health` reads `fixtures`). */
export const shellRuleFixtures = fixtures;
