/**
 * The novelty items N01-N05 (P6 DESIGN; design.md DES-§8.2, DES-§7.4, DES-§7.8, DES-§9.8, DS50; core §M.4). Pure: they
 * read the server's verdict bands (`GateInput.novelty`; null or absent = not checked, nothing is reported) and the
 * headline service's per-field verdicts (`GateInput.headlines`) by origin class:
 *  - N01 → `design:N1`: `too_close` on the niche or platform band, or the clone flag: hard (the verified exhaustion
 *    path of DES-§7.9 step 4 softens the niche band on the server, never here);
 *  - N02: a `close` band, −1 each (platform, niche, own page);
 *  - N03 → `design:N2`: `own = too_close` against the store's last pages of the same product: hard;
 *  - N04 → `design:N8`: the `high` shingle band on an `engine`, `local` or `cloud` line: hard;
 *  - N05: the `high` band on an `owner` or `library` line: soft −2 with the line focused; an owner line `close` is C08.
 */
import { headlineItems } from "../cliche";
import type { DesignGateItem, GateInput } from "./types";

export function noveltyItems(input: Pick<GateInput, "novelty" | "headlines" | "origin">, texts: ReadonlyMap<string, string>): DesignGateItem[] {
  const out: DesignGateItem[] = [];
  const n = input.novelty;
  if (n) {
    if (n.niche === "too_close" || n.platform === "too_close" || n.clone) out.push({ id: "N01", target: "N1", level: "hard", penalty: 15, msg: "design.gate.N1", vars: { clone: n.clone ? 1 : 0 }, fix: [{ op: "differentiate", gene: "G2", seeds: 6 }] });
    for (const band of ["platform", "niche", "own"] as const) if (n[band] === "close") out.push({ id: "N02", level: "soft", penalty: 1, msg: `design.novelty.${band}.close`, vars: { band } });
    if (n.own === "too_close") out.push({ id: "N03", target: "N2", level: "hard", penalty: 15, msg: "design.gate.N2", fix: [{ op: "differentiate", gene: "G18", seeds: 6 }] });
  }
  for (const it of headlineItems(input.headlines ?? [], input.origin)) {
    const line = (it.field && texts.get(it.field)) ?? "";
    const vars = { line: line.slice(0, 80) };
    if (it.id === "N8") out.push({ ...it, id: "N04", target: "N8", msg: "design.gate.N8", vars });
    else if (it.id === "N05") out.push({ ...it, msg: "design.gate.N5", vars });
    else out.push(it);
  }
  return out;
}
