/** A uniform integer in [0, n) from the Web Crypto API (Node 20+ and browsers alike): no `node:crypto` in the screen's bundle. */
export function randomInt(n: number): number {
  if (!(n > 0 && n <= 256)) throw new Error("randomInt: 0 < n <= 256");
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}
