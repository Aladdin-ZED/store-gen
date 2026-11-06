/**
 * The test:jobs harness (docs/STORE-SAAS.md §J.1; R1 P8): named sections with printed timings, plain checks and a
 * fake clock. Offline: nothing here opens a connection or touches a file. Later P8 steps add sections to
 * src/lib/jobs/selftest.ts and helpers beside this file (src/lib/jobs/testing/**).
 *
 *   const h = new Harness("test:jobs");
 *   h.section("paths", (t) => { t.eq("exports layout", dataPath("exports", id), want); });
 *   await h.run();                     // prints each section's checks and ms, exits 1 on any failure
 */

/** A clock tests move by hand: `now()` only changes through `advance` / `set`. */
export class FakeClock {
  private t: number;
  constructor(start: number = Date.UTC(2026, 9, 28, 9, 0, 0)) {
    this.t = start;
  }
  /** a bound reader, safe to pass as a `() => number` */
  readonly now = (): number => this.t;
  advance(ms: number): number {
    this.t += ms;
    return this.t;
  }
  set(at: number): number {
    this.t = at;
    return this.t;
  }
}

export interface Checks {
  check(name: string, ok: boolean, detail?: string): void;
  /** deep equality through JSON */
  eq<T>(name: string, actual: T, expected: T): void;
  throws(name: string, fn: () => unknown, re?: RegExp): void;
  rejects(name: string, fn: () => Promise<unknown>, re?: RegExp): Promise<void>;
}

type SectionFn = (t: Checks) => void | Promise<void>;

/** Resolves after `ms` of real time (the lock timeout cases need the real timer). */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class Harness {
  private readonly sections: { name: string; fn: SectionFn }[] = [];
  private passes = 0;
  private readonly failures: string[] = [];

  constructor(private readonly title: string) {}

  section(name: string, fn: SectionFn): void {
    this.sections.push({ name, fn });
  }

  private checks(section: string): Checks {
    const record = (name: string, ok: boolean, detail?: string): void => {
      if (ok) this.passes++;
      else this.failures.push(`${section} › ${name}${detail ? ` (${detail})` : ""}`);
    };
    const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
    return {
      check: record,
      eq: (name, actual, expected) => {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        record(name, a === e, `got ${a}, expected ${e}`);
      },
      throws: (name, fn, re) => {
        try {
          fn();
          record(name, false, "did not throw");
        } catch (err) {
          record(name, !re || re.test(message(err)), `threw "${message(err)}"`);
        }
      },
      rejects: async (name, fn, re) => {
        try {
          await fn();
          record(name, false, "did not reject");
        } catch (err) {
          record(name, !re || re.test(message(err)), `rejected with "${message(err)}"`);
        }
      },
    };
  }

  /**
   * Runs every section in order (a section that throws is one failure), prints the timings, sets the exit code. A
   * process that exits before the last section finished (an awaited promise nothing keeps alive, so the event loop
   * emptied) exits 1 with the section it stopped in, never 0.
   */
  async run(): Promise<void> {
    const started = performance.now();
    let current = "(start)";
    let finished = false;
    process.once("exit", () => {
      if (finished) return;
      console.error(`\n  ✗ ${this.title}: the process ended inside section "${current}" before every section ran`);
      process.exitCode = 1;
    });
    const i = process.argv.indexOf("--only");
    const only = i >= 0 ? (process.argv[i + 1] ?? "").split(",").filter(Boolean) : [];
    for (const { name, fn } of this.sections) {
      if (only.length && !only.some((p) => name.startsWith(p))) continue;
      current = name;
      const t0 = performance.now();
      const before = this.passes + this.failures.length;
      try {
        await fn(this.checks(name));
      } catch (err) {
        this.failures.push(`${name} › threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      }
      const n = this.passes + this.failures.length - before;
      console.log(`  ${name.padEnd(28)} ${String(n).padStart(4)} checks  ${(performance.now() - t0).toFixed(0).padStart(5)} ms`);
    }
    finished = true;
    for (const f of this.failures) console.error(`  ✗ ${f}`);
    console.log(`\n${this.title}: ${this.passes} passed, ${this.failures.length} failed · ${((performance.now() - started) / 1000).toFixed(2)} s`);
    if (this.failures.length) process.exitCode = 1;
  }
}
