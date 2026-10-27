/**
 * The genome sampler and solver (P6 DESIGN; design.md DES-§4.3, DES-§4.4, QUAL-10, DES N9; docs/STORE-SAAS.md §K.2 P0
 * design stubs). Pure, deterministic per seed, ≤ 200 node expansions. The signature is frozen at P0
 * (src/lib/contracts/r1-p0.ts): the pin is `opts.pins` (≤ 1 bold gene, the only value when it passes the hard rules,
 * the photo facts and the locks, else `genome.hints.dropped` with `why: "pin"`), a sibling of `opts.hints`. The stub
 * throws: a genome is a design decision, and the stub never invents one. P6 replaces the body and adds `solve`.
 */
import type { DesignGenome, SampleInput, SampleOpts } from "./genome";

export function sampleGenome(input: SampleInput, opts: SampleOpts = {}): DesignGenome {
  void input;
  void opts;
  throw new Error("not implemented: P6 sampleGenome");
}
