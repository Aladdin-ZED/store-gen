/**
 * The field guide of a copy family's block 2 (P7 AI; ai.md AI-§B.5 row 2 "field guide with target lengths per
 * field", AI-§B.4). Rendered from the STRICT JSON projection of the output (copy-schema.ts), never hand-written: the
 * loose schema the API receives carries no length, so the lengths reach the model only here, and a limit changed in
 * the schema changes the guide (and the template hash) with it. Pure and isomorphic.
 */

type Json = { [k: string]: unknown };

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function range(min: unknown, max: unknown, unit: string): string {
  const lo = typeof min === "number" ? min : null;
  const hi = typeof max === "number" ? max : null;
  if (lo !== null && hi !== null) return lo === hi ? `exactly ${hi} ${unit}` : `${lo} to ${hi} ${unit}`;
  if (hi !== null) return `at most ${hi} ${unit}`;
  if (lo !== null) return `at least ${lo} ${unit}`;
  return "";
}

/** "8 to 84 characters", "4 to 5 items; each title 3 to 52 characters, text 12 to 170 characters, icon from the schema's list". */
export function describeField(schema: Json): string {
  if (schema.type === "string") return Array.isArray(schema.enum) ? "one value of the schema's list" : range(schema.minLength, schema.maxLength, "characters");
  if (schema.type === "array" && isObj(schema.items)) {
    const count = range(schema.minItems, schema.maxItems, "items");
    const item = schema.items;
    if (item.type === "object" && isObj(item.properties)) {
      const parts = Object.entries(item.properties).map(([k, v]) => `${k} ${isObj(v) ? describeField(v) : ""}`.trim());
      return `${count}; each ${parts.join(", ")}`;
    }
    return `${count}, each ${describeField(item)}`;
  }
  if (schema.type === "object" && isObj(schema.properties)) return Object.entries(schema.properties).map(([k, v]) => `${k} ${isObj(v) ? describeField(v) : ""}`.trim()).join(", ");
  return "";
}

/**
 * One line per field, in `order`: `name: <lengths>. <meaning>`. A field of `order` the schema lacks, or a schema
 * field without a meaning, throws at module load (a guide that drifts from the schema is a bug, not a prompt).
 */
export function renderFieldGuide(strict: Json, order: readonly string[], meaning: Readonly<Record<string, string>>): string {
  const props = isObj(strict.properties) ? strict.properties : {};
  const missing = Object.keys(props).filter((k) => !(k in meaning) || !order.includes(k));
  if (missing.length) throw new Error(`field guide: no meaning or order for ${missing.join(", ")}`);
  return order
    .map((k) => {
      const s = props[k];
      if (!isObj(s)) throw new Error(`field guide: ${k} is not in the schema`);
      return `- ${k}: ${describeField(s)}. ${meaning[k]}`;
    })
    .join("\n");
}
