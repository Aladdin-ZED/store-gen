/**
 * Upload request body for POST /api/app/<handle>/media, read with ONE copy of the bytes.
 *
 * The declared Content-Length (capped by the caller) sizes a single buffer the stream is copied
 * into; the multipart parser then hands out the file as a view into that buffer. No concatenated
 * duplicate, no FormData/File/ArrayBuffer copies: one 25 MB upload costs ~25 MB, not 4–5 copies of
 * it. A body sent without Content-Length (chunked: a proxy or CDN in front of the app may forward an
 * upload that way) is streamed under a hard cap instead and joined once at the end.
 *
 * The parser follows RFC 7578 / the WHATWG multipart encoder (what browsers and undici send) and
 * stays deliberately small: bounded part count and header size, first `file` part wins, text
 * fields only when short.
 */

/** RFC 2046 boundary: 1–70 bchars, not ending with a space. */
const BOUNDARY_RE = /^[0-9A-Za-z'()+_,\-./:=? ]{0,69}[0-9A-Za-z'()+_,\-./:=?]$/;

export const MAX_PARTS = 16;
const MAX_PART_HEADER = 8 * 1024;
const MAX_FIELD = 4 * 1024;
/** a stalled upload gives its slot back */
const IDLE_TIMEOUT_MS = 30_000;

/** Boundary of a multipart/form-data Content-Type, or null when it is anything else. */
export function multipartBoundary(contentType: string | null): string | null {
  const m = /^\s*multipart\/form-data\s*;([\s\S]*)$/i.exec(contentType ?? "");
  if (!m) return null;
  const param = /(?:^|;)\s*boundary\s*=\s*(?:"([^"]*)"|([^;\s]*))/i.exec(m[1]!);
  const value = param ? (param[1] ?? param[2] ?? "") : "";
  return BOUNDARY_RE.test(value) ? value : null;
}

/** Declared Content-Length as a safe integer (null when absent or malformed). */
export function declaredLength(headers: Headers): number | null {
  const raw = headers.get("content-length")?.trim() ?? "";
  if (!/^\d{1,12}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export type ExactBody = { ok: true; value: Buffer } | { ok: false; status: 400 | 408 | 413 };

/** Next chunk of the stream, or "idle" when the client sent nothing for IDLE_TIMEOUT_MS. */
async function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ReadableStreamReadResult<Uint8Array> | "idle"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<"idle">((resolve) => {
    timer = setTimeout(() => resolve("idle"), IDLE_TIMEOUT_MS);
  });
  return Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
}

/** Read exactly `length` bytes (the validated Content-Length) into one buffer. */
export async function readExactBody(body: ReadableStream<Uint8Array> | null, length: number): Promise<ExactBody> {
  const out = Buffer.alloc(length);
  if (!body) return length === 0 ? { ok: true, value: out } : { ok: false, status: 400 };
  const reader = body.getReader();
  let filled = 0;
  try {
    for (;;) {
      const next = await nextChunk(reader);
      if (next === "idle") return { ok: false, status: 408 };
      if (next.done) break;
      const chunk = next.value;
      if (filled + chunk.byteLength > length) return { ok: false, status: 400 };
      out.set(chunk, filled);
      filled += chunk.byteLength;
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    // stop pulling (and release) whatever is left on any early exit
    reader.cancel().catch(() => undefined);
  }
  return filled === length ? { ok: true, value: out } : { ok: false, status: 400 };
}

/**
 * Read a body of unknown length (no Content-Length): refused with 413 as soon as it passes `max`
 * bytes, so an endless stream never holds more than the cap.
 */
export async function readCappedBody(body: ReadableStream<Uint8Array> | null, max: number): Promise<ExactBody> {
  if (!body) return { ok: false, status: 400 };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await nextChunk(reader);
      if (next === "idle") return { ok: false, status: 408 };
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) return { ok: false, status: 413 };
      chunks.push(next.value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return size > 0 ? { ok: true, value: Buffer.concat(chunks, size) } : { ok: false, status: 400 };
}

export interface MultipartFile {
  /** client file name (untrusted: clean before use) */
  name: string;
  /** view into the request body buffer */
  data: Buffer;
}

export interface MultipartForm {
  file: MultipartFile | null;
  fields: Map<string, string>;
}

/** `form-data; name="…"; filename="…"` → lower-cased parameter map (first occurrence wins). */
function dispositionParams(value: string): Map<string, string> | null {
  const m = /^\s*form-data\s*(;[\s\S]*)?$/i.exec(value);
  if (!m) return null;
  const params = new Map<string, string>();
  const re = /;\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]*))/g;
  for (const p of (m[1] ?? "").matchAll(re)) {
    const key = p[1]!.toLowerCase();
    const raw = p[2] !== undefined ? p[2].replace(/\\(.)/g, "$1") : (p[3] ?? "");
    // WHATWG encoder escapes these three in names and file names
    if (!params.has(key)) params.set(key, raw.replace(/%22/g, '"').replace(/%0D/gi, "\r").replace(/%0A/gi, "\n"));
  }
  return params;
}

/** Parse a multipart/form-data body; null when it is malformed or exceeds the part limits. */
export function parseMultipart(body: Buffer, boundary: string): MultipartForm | null {
  const open = Buffer.from(`--${boundary}`, "latin1");
  const delimiter = Buffer.from(`\r\n--${boundary}`, "latin1");
  const form: MultipartForm = { file: null, fields: new Map() };

  let pos: number;
  if (body.subarray(0, open.length).equals(open)) pos = open.length;
  else {
    const first = body.indexOf(delimiter); // preamble before the first boundary
    if (first < 0) return null;
    pos = first + delimiter.length;
  }

  for (let parts = 0; ; parts++) {
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) return form; // close delimiter "--"
    while (body[pos] === 0x20 || body[pos] === 0x09) pos++; // transport padding
    if (body[pos] !== 0x0d || body[pos + 1] !== 0x0a) return null;
    if (parts >= MAX_PARTS) return null;
    // the boundary line's CRLF doubles as the start of the header block (empty headers → "\r\n\r\n")
    const headerWindow = body.subarray(pos, Math.min(body.length, pos + MAX_PART_HEADER + 4));
    const rel = headerWindow.indexOf("\r\n\r\n", 0, "latin1");
    if (rel < 0) return null;
    const headers = body.toString("utf8", pos + 2, pos + rel);
    const dataStart = pos + rel + 4;
    const dataEnd = body.indexOf(delimiter, dataStart);
    if (dataEnd < 0) return null;
    pos = dataEnd + delimiter.length;

    let disposition: string | null = null;
    for (const line of headers.split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === "content-disposition") {
        disposition = line.slice(colon + 1);
        break;
      }
    }
    const params = disposition === null ? null : dispositionParams(disposition);
    const name = params?.get("name");
    if (!params || name === undefined) continue;
    const filename = params.get("filename");
    if (filename !== undefined) {
      if (name === "file" && !form.file) form.file = { name: filename, data: body.subarray(dataStart, dataEnd) };
    } else if (dataEnd - dataStart <= MAX_FIELD && !form.fields.has(name)) {
      form.fields.set(name, body.toString("utf8", dataStart, dataEnd));
    }
  }
}
