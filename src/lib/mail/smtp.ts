import "server-only";
/**
 * A minimal SMTP submission client (RFC 5321 / 3207 / 4954) for the optional R1 mail transport (src/lib/mail/index.ts),
 * so the platform needs no new dependency: one message per connection, TLS always (implicit TLS on `smtps://`, or a
 * required STARTTLS on `smtp://`; a plaintext session is accepted only to a loopback relay), AUTH PLAIN, a
 * plain-text UTF-8 body in base64 (no line can start with "." and no 8-bit transport is needed). Every step has a
 * timeout; credentials and message bodies are never logged.
 *
 *   SMTP_URL   smtps://<user>:<password>@smtp.hostinger.com:465   (or smtp://…:587 with STARTTLS)
 *   MAIL_FROM  "Store Gen <no-reply@example.ma>" or a bare address
 */
import { randomBytes } from "node:crypto";
import net from "node:net";
import { hostname } from "node:os";
import tls from "node:tls";

export interface SmtpConfig {
  host: string;
  port: number;
  /** implicit TLS (smtps://) */
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: { address: string; name: string | null };
}

export interface SmtpMessage {
  to: string;
  subject: string;
  text: string;
}

const STEP_TIMEOUT_MS = 15_000;
const ADDRESS_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isMailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && ADDRESS_RE.test(value);
}

const isLoopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";

/** SMTP_URL + MAIL_FROM, or null (with the reason, never a secret) when either is missing or malformed. */
export function smtpConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): { config: SmtpConfig | null; problem: string | null } {
  const raw = env.SMTP_URL?.trim();
  const fromRaw = env.MAIL_FROM?.trim();
  if (!raw && !fromRaw) return { config: null, problem: null };
  if (!raw || !fromRaw) return { config: null, problem: "SMTP_URL and MAIL_FROM must both be set for mail to be sent" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { config: null, problem: "SMTP_URL is not a URL (smtps://user:password@host:465)" };
  }
  if (url.protocol !== "smtps:" && url.protocol !== "smtp:") return { config: null, problem: "SMTP_URL must start with smtps:// or smtp://" };
  const secure = url.protocol === "smtps:";
  const port = url.port ? Number(url.port) : secure ? 465 : 587;
  const host = url.hostname;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return { config: null, problem: "SMTP_URL has no usable host or port" };
  const m = /^\s*(?:"?([^"<>]*?)"?\s*<([^<>\s]+)>|([^<>\s]+))\s*$/.exec(fromRaw);
  const address = m?.[2] ?? m?.[3] ?? "";
  if (!isMailAddress(address)) return { config: null, problem: "MAIL_FROM is not an e-mail address" };
  const name = m?.[1]?.replace(/[\r\n]/g, " ").trim() || null;
  return {
    config: {
      host,
      port,
      secure,
      user: url.username ? decodeURIComponent(url.username) : null,
      pass: url.password ? decodeURIComponent(url.password) : null,
      from: { address, name },
    },
    problem: null,
  };
}

/** RFC 2047 encoded-word for a header text outside ASCII. */
function encodeHeader(text: string): string {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n");
}

/** The whole message (headers + base64 body), CRLF line ends. */
export function buildMessage(cfg: SmtpConfig, msg: SmtpMessage, now = new Date()): { data: string; messageId: string } {
  const domain = cfg.from.address.split("@")[1] ?? "localhost";
  const messageId = `<${randomBytes(12).toString("hex")}@${domain}>`;
  const from = cfg.from.name ? `${encodeHeader(cfg.from.name.replace(/["\\]/g, ""))} <${cfg.from.address}>` : cfg.from.address;
  const subject = encodeHeader(msg.subject.replace(/[\r\n]+/g, " "));
  const headers = [
    `From: ${from}`,
    `To: ${msg.to}`,
    `Subject: ${subject}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
  ];
  const body = wrap76(Buffer.from(msg.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"));
  return { data: `${headers.join("\r\n")}\r\n\r\n${body}`, messageId };
}

/** Reads SMTP replies (multi-line "250-…" until "250 …") from a socket that may be swapped for its TLS upgrade. */
class ReplyReader {
  private buffer = "";
  private waiting: { resolve: (r: { code: number; text: string }) => void; reject: (e: Error) => void } | null = null;
  private failed: Error | null = null;

  attach(socket: net.Socket | tls.TLSSocket): void {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 64_000) this.fail(new Error("smtp: reply too long"));
      this.drain();
    });
    socket.on("error", (err) => this.fail(err));
    socket.on("close", () => this.fail(new Error("smtp: connection closed")));
  }

  private fail(err: Error): void {
    this.failed ??= err;
    const w = this.waiting;
    this.waiting = null;
    w?.reject(this.failed);
  }

  private drain(): void {
    if (!this.waiting) return;
    const lines = this.buffer.split("\r\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!;
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const text = lines.slice(0, i + 1).join("\n");
        this.buffer = lines.slice(i + 1).join("\r\n");
        const w = this.waiting;
        this.waiting = null;
        w.resolve({ code: Number(line.slice(0, 3)), text });
        return;
      }
    }
  }

  next(): Promise<{ code: number; text: string }> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error("smtp: timeout"));
      }, STEP_TIMEOUT_MS);
      this.waiting = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.drain();
    });
  }
}

function connect(cfg: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const opts = { host: cfg.host, port: cfg.port, timeout: STEP_TIMEOUT_MS };
    const socket = cfg.secure ? tls.connect({ ...opts, servername: cfg.host }) : net.connect(opts);
    const onError = (err: Error) => reject(err);
    socket.once("error", onError);
    socket.once(cfg.secure ? "secureConnect" : "connect", () => {
      socket.off("error", onError);
      resolve(socket);
    });
    socket.once("timeout", () => socket.destroy(new Error("smtp: connect timeout")));
  });
}

function upgrade(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    socket.removeAllListeners("data");
    socket.removeAllListeners("close");
    socket.removeAllListeners("error");
    const secure = tls.connect({ socket, servername: host });
    secure.once("secureConnect", () => resolve(secure));
    secure.once("error", reject);
  });
}

/** Sends one message. Throws on any refusal or timeout (the caller logs the code only). */
export async function sendSmtp(cfg: SmtpConfig, msg: SmtpMessage): Promise<{ messageId: string }> {
  if (!isMailAddress(msg.to)) throw new Error("smtp: bad recipient");
  let socket = await connect(cfg);
  let reader = new ReplyReader();
  reader.attach(socket);
  const expect = async (codes: number[]) => {
    const reply = await reader.next();
    if (!codes.includes(reply.code)) throw new Error(`smtp: unexpected reply ${reply.code}`);
    return reply;
  };
  const send = (line: string) => socket.write(`${line}\r\n`);
  const helo = hostname().replace(/[^A-Za-z0-9.-]/g, "") || "localhost";
  try {
    await expect([220]);
    send(`EHLO ${helo}`);
    const ehlo = await expect([250]);
    if (!cfg.secure) {
      if (/\bSTARTTLS\b/i.test(ehlo.text)) {
        send("STARTTLS");
        await expect([220]);
        socket = await upgrade(socket as net.Socket, cfg.host);
        reader = new ReplyReader();
        reader.attach(socket);
        send(`EHLO ${helo}`);
        await expect([250]);
      } else if (!isLoopback(cfg.host)) {
        throw new Error("smtp: the server offers no STARTTLS");
      }
    }
    if (cfg.user && cfg.pass !== null) {
      send(`AUTH PLAIN ${Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass}`, "utf8").toString("base64")}`);
      await expect([235]);
    }
    const { data, messageId } = buildMessage(cfg, msg);
    send(`MAIL FROM:<${cfg.from.address}>`);
    await expect([250]);
    send(`RCPT TO:<${msg.to}>`);
    await expect([250, 251]);
    send("DATA");
    await expect([354]);
    socket.write(`${data}\r\n.\r\n`);
    await expect([250]);
    send("QUIT");
    await reader.next().catch(() => undefined);
    return { messageId };
  } finally {
    socket.destroy();
  }
}
