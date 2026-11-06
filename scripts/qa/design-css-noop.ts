/**
 * Loaded first by `test:design` (scripts/qa/design-check.ts): the admin components the brand and builder groups reach
 * import their stylesheets (src/components/admin/styles/*.css, P2), which only the Next build reads. Offline, a `.css`
 * file is an empty module (as in scripts/qa/tenancy-check.ts). Added at the P6 merge.
 */
import Module from "node:module";

const M = Module as unknown as { _extensions: Record<string, (m: { exports: unknown }, filename: string) => void> };
M._extensions[".css"] = (m) => {
  m.exports = {};
};
