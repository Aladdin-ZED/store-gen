/**
 * Partial structured output (P7 AI; ai.md AI-§B.6). Isomorphic, pure, no `eval`. The server forwards each text delta of
 * a streamed structured call here; `push` answers the top-level fields that completed with this delta (in the order
 * they completed) and, for the fields named in `arrays`, each completed item (`"benefits[2]"`). It tracks string
 * escapes, nesting depth and the current key, and emits a value only when its closing quote, bracket or brace (or, for
 * a number, `true`, `false` or `null`, the delimiter after it) has arrived. It never throws: on input that is not the
 * expected object it stops emitting, and the final parse of the whole message decides.
 */

export interface PartialField {
  path: string;
  value: unknown;
}

const isSpace = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t";

/** UTF-8 length of a string (a surrogate pair counts 4 at its high half). */
function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) n += 4;
    else if (c >= 0xdc00 && c <= 0xdfff) n += 0;
    else n += 3;
  }
  return n;
}

type Kind = "string" | "container" | "primitive" | null;

export class PartialJson {
  private readonly fields: ReadonlySet<string>;
  private readonly arrays: ReadonlySet<string>;
  private buf = "";
  private byteCount = 0;
  private depth = 0;
  private inString = false;
  private escape = false;
  private broken = false;
  private done = false;
  /** depth 1: what the root object expects next */
  private expect: "key" | "colon" | "value" | "comma" = "key";
  private keyStart = -1;
  private key: string | null = null;
  private valueStart = -1;
  private valueKind: Kind = null;
  /** the top-level array whose items are emitted one by one */
  private arrayKey: string | null = null;
  private itemIndex = 0;
  private itemStart = -1;
  private itemKind: Kind = null;

  constructor(opts: { fields: readonly string[]; arrays?: readonly string[] }) {
    this.fields = new Set(opts.fields);
    this.arrays = new Set(opts.arrays ?? []);
  }

  /** UTF-8 bytes received so far */
  get bytes(): number {
    return this.byteCount;
  }

  /** true once the root object closed */
  get complete(): boolean {
    return this.done && !this.broken;
  }

  push(delta: string): PartialField[] {
    const out: PartialField[] = [];
    if (typeof delta !== "string" || delta.length === 0) return out;
    this.byteCount += utf8Length(delta);
    const from = this.buf.length;
    this.buf += delta;
    if (this.broken) return out;
    for (let i = from; i < this.buf.length && !this.broken; i++) this.step(this.buf[i], i, out);
    return out;
  }

  private step(c: string, i: number, out: PartialField[]): void {
    if (this.inString) {
      if (this.escape) this.escape = false;
      else if (c === "\\") this.escape = true;
      else if (c === '"') {
        this.inString = false;
        this.stringEnded(i, out);
      }
      return;
    }
    if (this.done) {
      if (!isSpace(c)) this.broken = true;
      return;
    }
    if (isSpace(c)) {
      this.endPrimitive(i, out);
      return;
    }
    switch (c) {
      case '"':
        this.inString = true;
        if (this.depth === 0) this.broken = true;
        else if (this.depth === 1) {
          if (this.expect === "key") this.keyStart = i;
          else if (this.expect === "value" && this.valueKind === null) {
            this.valueStart = i;
            this.valueKind = "string";
          } else this.broken = true;
        } else if (this.depth === 2 && this.arrayKey !== null && this.itemKind === null) {
          this.itemStart = i;
          this.itemKind = "string";
        }
        return;
      case "{":
      case "[":
        if (this.depth === 0) {
          if (c === "{") {
            this.depth = 1;
            this.expect = "key";
          } else this.broken = true;
          return;
        }
        if (this.depth === 1) {
          if (this.expect !== "value" || this.valueKind !== null) {
            this.broken = true;
            return;
          }
          this.valueStart = i;
          this.valueKind = "container";
          if (c === "[" && this.key !== null && this.arrays.has(this.key)) {
            this.arrayKey = this.key;
            this.itemIndex = 0;
            this.itemKind = null;
          }
        } else if (this.depth === 2 && this.arrayKey !== null && this.itemKind === null) {
          this.itemStart = i;
          this.itemKind = "container";
        }
        this.depth++;
        return;
      case "}":
      case "]":
        this.endPrimitive(i, out);
        this.depth--;
        if (this.depth < 0) this.broken = true;
        else if (this.depth === 0) {
          if (c === "}" && (this.expect === "key" || this.expect === "comma")) this.done = true;
          else this.broken = true;
        } else if (this.depth === 1) {
          if (this.valueKind !== "container") {
            this.broken = true;
            return;
          }
          if (this.arrayKey !== null) this.arrayKey = null;
          else this.emitField(this.valueStart, i + 1, out);
          this.valueKind = null;
          this.expect = "comma";
        } else if (this.depth === 2 && this.arrayKey !== null && this.itemKind === "container") {
          this.emitItem(this.itemStart, i + 1, out);
        }
        return;
      case ":":
        if (this.depth === 1) {
          if (this.expect === "colon") this.expect = "value";
          else this.broken = true;
        }
        return;
      case ",":
        this.endPrimitive(i, out);
        if (this.depth === 1) {
          if (this.expect === "comma") this.expect = "key";
          else this.broken = true;
        }
        return;
      default:
        if (this.depth === 0) this.broken = true;
        else if (this.depth === 1) {
          if (this.expect === "value" && this.valueKind === null) {
            this.valueStart = i;
            this.valueKind = "primitive";
          } else if (this.valueKind !== "primitive") this.broken = true;
        } else if (this.depth === 2 && this.arrayKey !== null && this.itemKind === null) {
          this.itemStart = i;
          this.itemKind = "primitive";
        }
    }
  }

  private stringEnded(i: number, out: PartialField[]): void {
    if (this.depth === 1) {
      if (this.expect === "key") {
        try {
          const k: unknown = JSON.parse(this.buf.slice(this.keyStart, i + 1));
          this.key = typeof k === "string" ? k : null;
          this.expect = "colon";
        } catch {
          this.broken = true;
        }
      } else if (this.valueKind === "string") {
        this.emitField(this.valueStart, i + 1, out);
        this.valueKind = null;
        this.expect = "comma";
      }
    } else if (this.depth === 2 && this.arrayKey !== null && this.itemKind === "string") {
      this.emitItem(this.itemStart, i + 1, out);
    }
  }

  /** a number, true, false or null ends at the first delimiter after it */
  private endPrimitive(i: number, out: PartialField[]): void {
    if (this.depth === 1 && this.valueKind === "primitive") {
      this.emitField(this.valueStart, i, out);
      this.valueKind = null;
      this.expect = "comma";
    } else if (this.depth === 2 && this.arrayKey !== null && this.itemKind === "primitive") {
      this.emitItem(this.itemStart, i, out);
    }
  }

  private parse(start: number, end: number): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(this.buf.slice(start, end)) };
    } catch {
      this.broken = true;
      return { ok: false };
    }
  }

  private emitField(start: number, end: number, out: PartialField[]): void {
    const key = this.key;
    if (key === null) return;
    const v = this.parse(start, end);
    if (v.ok && (this.fields.has(key) || this.arrays.has(key))) out.push({ path: key, value: v.value });
  }

  private emitItem(start: number, end: number, out: PartialField[]): void {
    const key = this.arrayKey as string;
    const index = this.itemIndex++;
    this.itemKind = null;
    const v = this.parse(start, end);
    if (v.ok) out.push({ path: `${key}[${index}]`, value: v.value });
  }
}
