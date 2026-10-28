/**
 * QrCode (P2 SHELL; platform.md PLA-§22.12, §22.7, PD1, PD47): a value (the store address, a preview link) as an SVG
 * QR code drawn from the `qrcode` package, named by `label`.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub draws the code's modules in `currentColor`
 * with the standard 4-module quiet zone; a value too long for a QR code draws the empty square, still named.
 */
import QRCode from "qrcode";
import type { ReactElement } from "react";

export interface QrCodeProps {
  value: string;
  size: number;
  label: string;
}

const QUIET = 4;

/** One `M x y h1 v1 h-1 z` square per dark module; null when the value does not fit a QR code. */
function modulesPath(value: string): { n: number; d: string } | null {
  try {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
    return { n: modules.size, d };
  } catch {
    return null;
  }
}

export function QrCode(p: QrCodeProps): ReactElement | null {
  const qr = modulesPath(p.value);
  const box = (qr?.n ?? 21) + QUIET * 2;
  return (
    <svg role="img" aria-label={p.label} width={p.size} height={p.size} viewBox={`0 0 ${box} ${box}`} shapeRendering="crispEdges">
      {qr && <path d={qr.d} fill="currentColor" />}
    </svg>
  );
}
