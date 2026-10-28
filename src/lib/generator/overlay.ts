/**
 * Copy overlay — writes generator copy onto a section's data without knowing its exact schema.
 *
 * A patch lists semantic values with the field names they may live under (first existing field
 * wins). Strings are fitted to the field's max length, lists are mapped item by item onto the
 * section's own item shape (inheriting non-copy fields such as positions, images or numbers from
 * the default item at the same index), and every write is re-validated with the section schema —
 * a write the schema rejects is simply skipped, so the defaults always remain a valid fallback.
 */
import type { z } from "zod";
import { fitText } from "@/lib/ai/copy-library";
import { accepts, elementOf, enumValues, kindOf, lengthBounds, shapeOf } from "./zod-tools";

export type SemanticItem = Record<string, string | number | boolean | undefined>;

export interface PatchEntry {
  /** candidate field names, most specific first */
  keys: readonly string[];
  /** undefined: no write, the section's default stays (an optional AI copy field left out; DES-R20, AI-D26) */
  value: string | boolean | number | readonly string[] | readonly SemanticItem[] | undefined;
}

/**
 * Which semantic keys may fill a target field, in priority order. Unknown target fields fall back
 * to a semantic key of the same name.
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  title: ["title", "label", "name", "q", "heading"],
  heading: ["title", "heading"],
  label: ["label", "title", "name", "text"],
  name: ["name", "title", "label"],
  text: ["text", "body", "a", "answer", "description", "pain", "title"],
  body: ["text", "body", "a", "answer", "title"],
  description: ["text", "description", "body"],
  detail: ["detail", "text"],
  caption: ["caption", "text"],
  q: ["q", "question", "title"],
  question: ["q", "question", "title"],
  a: ["a", "answer", "text"],
  answer: ["a", "answer", "text"],
  pain: ["pain", "text"],
  fix: ["fix", "solution"],
  us: ["us", "ours"],
  ours: ["us", "ours"],
  them: ["them", "others", "theirs"],
  theirs: ["them", "theirs"],
  others: ["them", "others"],
  feature: ["label", "title", "feature"],
  icon: ["icon"],
};

/** Fit a string to a field (null when it cannot satisfy the field's minimum length). */
function fitToField(value: string, field: z.ZodTypeAny): string | null {
  const { min, max } = lengthBounds(field);
  const v = Number.isFinite(max) ? fitText(value, max) : value;
  return v.length >= min ? v : null;
}

/** A field whose copy the generator owns: clearing it is better than keeping another product's text. */
function clearable(field: z.ZodTypeAny): boolean {
  return kindOf(field) === "string" && accepts(field, "");
}

/** Convert a semantic value into something the target field accepts (or undefined). */
function coerce(value: unknown, field: z.ZodTypeAny): unknown {
  const kind = kindOf(field);
  if (kind === "string" && typeof value === "string") return fitToField(value, field) ?? undefined;
  if (kind === "enum" && typeof value === "string") return enumValues(field).includes(value) ? value : undefined;
  if (kind === "boolean" && typeof value === "boolean") return value;
  if (kind === "number" && typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

/** Map one semantic item onto the target item schema, inheriting non-copy fields from `base`. */
function mapItem(sem: SemanticItem | string, element: z.ZodTypeAny, base: unknown): unknown {
  const shape = shapeOf(element);
  if (!shape) {
    // list of plain strings (or other scalars)
    const text = typeof sem === "string" ? sem : (sem.text ?? sem.title ?? sem.label);
    return typeof text === "string" ? coerce(text, element) : undefined;
  }
  const s: SemanticItem = typeof sem === "string" ? { text: sem } : sem;
  const b = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  // each semantic value fills one field at most (a one-line item never shows twice)
  const used = new Set<string>();
  for (const [key, field] of Object.entries(shape)) {
    let value: unknown;
    for (const cand of SYNONYMS[key] ?? [key]) {
      if (s[cand] === undefined || used.has(cand)) continue;
      value = coerce(s[cand], field);
      if (value !== undefined) {
        used.add(cand);
        break;
      }
    }
    if (value !== undefined) out[key] = value;
    else if (key in b) out[key] = clearable(field) ? "" : b[key];
  }
  return out;
}

function setList(field: z.ZodTypeAny, items: readonly (SemanticItem | string)[], current: unknown): unknown[] | null {
  const element = elementOf(field);
  if (!element) return null;
  const { min, max } = lengthBounds(field);
  const baseItems = Array.isArray(current) ? current : [];
  const mapped: unknown[] = [];
  for (const [i, sem] of items.slice(0, Number.isFinite(max) ? max : items.length).entries()) {
    const item = mapItem(sem, element, baseItems[i] ?? baseItems[baseItems.length - 1]);
    if (item !== undefined && accepts(element, item)) mapped.push(item);
  }
  // too few valid items: top up with the section's own defaults rather than failing
  for (let i = mapped.length; i < min && i < baseItems.length; i++) mapped.push(baseItems[i]);
  return mapped.length >= min ? mapped : null;
}

/**
 * Apply copy entries to section data. Returns new data; `data` itself is not mutated.
 * Every accepted write keeps the whole object valid against `schema`.
 */
export function applyPatch(schema: z.ZodTypeAny, data: Record<string, unknown>, patch: readonly PatchEntry[]): Record<string, unknown> {
  const shape = shapeOf(schema);
  if (!shape) return data;
  let out: Record<string, unknown> = { ...data };
  for (const entry of patch) {
    if (entry.value === undefined) continue;
    const key = entry.keys.find((k) => k in shape);
    if (!key) continue;
    const field = shape[key]!;
    let next: unknown;
    if (Array.isArray(entry.value)) {
      if (kindOf(field) !== "array" || entry.value.length === 0) continue;
      next = setList(field, entry.value as readonly (SemanticItem | string)[], out[key]);
    } else {
      next = coerce(entry.value, field);
    }
    if (next === undefined || next === null) continue;
    const candidate = { ...out, [key]: next };
    if (accepts(schema, candidate)) out = candidate;
  }
  return out;
}
