/**
 * `injection.screen` (AI-08; ai.md AI-§E.3 control 4, AI-§D.3): the Fast-class screen of imported bulk text before it
 * can be a prompt input. The shapes are frozen at P0 (src/lib/contracts/r1-p0.ts).
 *
 * `screenFinalize(input)`: `{ suspicious: boolean; reason ≤ 120 chars }`, and `reason` never echoes more than 40
 * characters of the screened text: a longer echo is cut out (a screen must not become the channel that carries the
 * payload into the console).
 */
import { fitText } from "../../copy-library";
import { isRecord, type Finalize } from "./types";

export type InjectionScreenInput = { text: string; source: "import" | "sheet" | "note" };
export type InjectionScreenOut = { suspicious: boolean; reason: string };

export const REASON_MAX = 120;
/** the longest run of the screened text a reason may repeat */
export const ECHO_MAX = 40;

/** `reason` with every run of more than `max` characters it shares with `text` (case-insensitive) replaced by "…". */
export function redactEcho(reason: string, text: string, max = ECHO_MAX): { text: string; echoed: boolean } {
  const hay = text.toLowerCase();
  const low = reason.toLowerCase();
  let out = "";
  let echoed = false;
  for (let i = 0; i < reason.length; ) {
    if (i + max < reason.length + 1 && hay.includes(low.slice(i, i + max + 1))) {
      let j = i + max + 1;
      while (j < reason.length && hay.includes(low.slice(i, j + 1))) j++;
      out += "…";
      echoed = true;
      i = j;
    } else {
      out += reason[i];
      i++;
    }
  }
  return { text: out, echoed };
}

export function screenFinalize(input: Pick<InjectionScreenInput, "text">): Finalize<InjectionScreenOut> {
  return (raw) => {
    if (!isRecord(raw) || typeof raw.suspicious !== "boolean") return null;
    const clean = (typeof raw.reason === "string" ? raw.reason : "")
      .normalize("NFC")
      .slice(0, 600)
      .replace(/[<>{}[\]\\`|^~]/g, "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const { text, echoed } = redactEcho(clean, input.text);
    return { value: { suspicious: raw.suspicious, reason: fitText(text, REASON_MAX) }, rejected: echoed ? ["reason"] : [] };
  };
}
