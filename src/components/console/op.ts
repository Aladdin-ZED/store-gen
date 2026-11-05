/**
 * The operation id a console sheet mints when it opens (platform.md PLA-§4.5 "Dangerous actions", §L): 32 hex
 * characters (the `OpId` format of src/lib/platform/op-once.ts), re-sent unchanged after a step-up or a retry so the
 * server answers the first result again instead of writing twice.
 *
 *   const op = newOpId();   // "3f9c…" (one per dialog opening or per decision)
 */
export function newOpId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
