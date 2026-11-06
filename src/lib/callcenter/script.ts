/**
 * The call script document (P4 CALL CENTER; operations.md OPE-§7.2, RA §4.5; docs/STORE-SAAS.md §K.2 P0). Frozen at
 * P0 because P3's Campaign Kit compiles the store's script into the kit (`CompileKitInput.templates.script`,
 * LAN-§13.3). Step texts are templates of P5's language (src/lib/integrations/templates.ts).
 *
 * Pure and isomorphic: the script editor (a client component, OPE-§7.4) validates with `ScriptDoc`, and P3's kit reads
 * the type. The server half, `compileScript` (selection of the store's row, the order's values, P5's renderer), is in
 * ./script.server.ts so this module never pulls a database import into a browser bundle.
 *
 *   compileScriptDoc   one document rendered for one order: every step and objection through the renderer it is
 *                      handed; an `upsell` step only when the upsell variables are filled; a step whose text renders
 *                      empty is dropped; an objection answer whose required fact (a variable outside its optional
 *                      blocks) is missing is dropped (OPE-§7.3: "each only restates stored facts")
 */
import { z } from "zod";
import type { TemplateVar } from "@/lib/integrations/templates";
import type { MessageRef } from "@/lib/orders/risk-explain";

/** The languages a call script exists in (the panel's ar / fr / en tabs, OPE-§7.2). */
export const SCRIPT_LOCALES = ["ar", "fr", "en"] as const;
export type ScriptLocale = (typeof SCRIPT_LOCALES)[number];
export const isScriptLocale = (v: unknown): v is ScriptLocale => typeof v === "string" && (SCRIPT_LOCALES as readonly string[]).includes(v);

/** The closed objection list (rev 2, RA §4.5): chip labels `ops.script.obj.<id>`. */
export const OBJECTION_IDS = ["price", "trust", "delivery_time", "think", "cheaper_elsewhere", "wrong_size"] as const;
export type ObjectionId = (typeof OBJECTION_IDS)[number];

export const ScriptDoc = z.object({
  v: z.literal(1),
  steps: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_]{1,20}$/),
        title: z.string().min(1).max(40),
        /** template */
        say: z.string().max(400),
        /** tick boxes, e.g. "Landmark noted" */
        checks: z.array(z.string().max(60)).max(4).default([]),
        /** "upsell": only when upsell_* are non-empty */
        when: z.enum(["always", "upsell"]).default("always"),
        action: z.enum(["none", "add_upsell", "edit_address"]).default("none"),
      }),
    )
    .min(1)
    .max(12),
  /** rev 2 (RA §4.5): objection answers shown as chips under the script; ≤ 6 */
  objections: z
    .array(
      z.object({
        id: z.enum(OBJECTION_IDS),
        /** template; may use eta_text, total, confirm_number, store_name; never a claim the store did not state */
        say: z.string().max(300),
      }),
    )
    .max(6)
    .default([]),
});
export type ScriptDoc = z.output<typeof ScriptDoc>;
export type ScriptStepAction = ScriptDoc["steps"][number]["action"];

/**
 * The script as the queue card carries it (OPE-§5.3, §7.2): each step's text already rendered for the order, no
 * template left in it. `templateId` is the `message_templates` row, or `builtin:script:<locale>`.
 */
export interface CompiledScript {
  locale: ScriptLocale;
  source: "builtin" | "store" | "ai";
  templateId: string;
  steps: { id: string; title: string; text: string; checks: string[]; action: ScriptStepAction }[];
  objections: { id: ObjectionId; label: MessageRef; text: string }[];
  /**
   * The template engine did not answer (P5's P0 stub before the P5 merge, or a failure): no step is shown rather than
   * a raw template or a guessed text. The panel says the script is unavailable.
   */
  unavailable?: true;
}

export type TemplateValues = Partial<Record<TemplateVar, string>>;
/** P5's `renderTemplate` (src/lib/integrations/templates.ts): pure, isomorphic. */
export type RenderTemplate = (src: string, values: TemplateValues) => string;

/** The variables a template needs outside its optional blocks (`[[ … ]]`), escaped braces ignored. */
export function requiredVars(src: string): string[] {
  const outside = src.replace(/\{\{|\}\}/g, "").replace(/\[\[[\s\S]*?\]\]/g, "");
  return [...outside.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!);
}

const filled = (values: TemplateValues, key: string): boolean => (values[key as TemplateVar] ?? "").trim() !== "";
/** OPE-§7.2: an "upsell" step only when the order's upsell is on offer (both variables filled). */
const upsellOffered = (values: TemplateValues): boolean => filled(values, "upsell_title") && filled(values, "upsell_price");

/** One document for one order (see the header). */
export function compileScriptDoc(doc: ScriptDoc, values: TemplateValues, render: RenderTemplate, meta: Pick<CompiledScript, "locale" | "source" | "templateId">): CompiledScript {
  const steps: CompiledScript["steps"] = [];
  for (const s of doc.steps) {
    if (s.when === "upsell" && !upsellOffered(values)) continue;
    const text = render(s.say, values).trim();
    if (!text) continue;
    steps.push({ id: s.id, title: s.title, text, checks: [...s.checks], action: s.action });
  }
  const objections: CompiledScript["objections"] = [];
  const seen = new Set<ObjectionId>();
  for (const o of doc.objections) {
    if (seen.has(o.id) || !requiredVars(o.say).every((v) => filled(values, v))) continue;
    const text = render(o.say, values).trim();
    if (!text) continue;
    seen.add(o.id);
    objections.push({ id: o.id, label: { key: `ops.script.obj.${o.id}` }, text });
  }
  return { ...meta, steps, objections };
}
