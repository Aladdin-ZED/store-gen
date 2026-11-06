/**
 * The script editor's preview renderer (P4 CALL CENTER; operations.md OPE-§7.1, §7.4). It calls P5's `renderTemplate`
 * (the one template engine); until that engine ships (its P0 stub throws "not implemented") the preview falls back to
 * the documented language below, so a manager can still read the script. Staff-only: agents always get the engine's
 * output through `compileScript`.
 *
 *   "{var}" inserts a variable; "[[ … ]]" is an optional block dropped when a variable inside it is empty;
 *   "{{" and "}}" are literal braces.
 */
import { renderTemplate, type TemplateVar } from "@/lib/integrations/template-lang"; // the pure language (templates.ts is server-only since P5)

type Values = Partial<Record<TemplateVar, string>>;

function fallback(src: string, values: Values): string {
  const get = (v: string) => (values[v as TemplateVar] ?? "").trim();
  return src
    .replace(/\{\{/g, "\u0000")
    .replace(/\}\}/g, "\u0001")
    .replace(/\[\[([\s\S]*?)\]\]/g, (_, inner: string) => ([...inner.matchAll(/\{([a-z_]+)\}/g)].every((m) => get(m[1]!) !== "") ? inner : ""))
    .replace(/\{([a-z_]+)\}/g, (_, v: string) => get(v))
    .replace(/\u0000/g, "{")
    .replace(/\u0001/g, "}")
    .replace(/[ \t]{2,}/g, " ");
}

/** The engine's rendering, or the fallback while the engine is not available. */
export function previewRender(src: string, values: Values): string {
  try {
    return renderTemplate(src, values);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("not implemented")) return fallback(src, values);
    throw err;
  }
}
