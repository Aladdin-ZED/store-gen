"use client";
/**
 * QrCode (P2 SHELL; platform.md PLA-§22.12, §22.7, §22.10.2, PD1, PD47; design.md DES-§16.12, UX-30): a value (the
 * store address, a preview link) as an SVG QR code from the `qrcode` package: error correction M, square modules, the
 * 4-module quiet zone, no logo. Its size comes from the module count (`qrSize`, `qrPixels`): whole pixels per module,
 * never under 4, so `size` is the box the code is centred in, not a scale. Ink is `--foreground` on the lightest ground
 * (`.adm-qr`, ≥ 7:1; dark mode swaps the two tokens so the tile stays light).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). `QrDownloads` (same file) offers the PNG at 8 px
 * per module (3 cm at ≥ 300 dpi) and the SVG, drawn from the same modules in the light colours. A value too long for a
 * QR code renders the box with a sentence instead of a broken code.
 */
import QRCode from "qrcode";
import { DownloadIcon } from "lucide-react";
import { useMemo, type ReactElement } from "react";
import "@/components/admin/styles/primitives.css";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { QR_ECC, QR_PNG_PX_PER_MODULE, QR_QUIET_MODULES } from "./address-math";
import { qrPixels } from "./primitive-logic";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface QrCodeProps {
  value: string;
  size: number;
  label: string;
}

interface QrModules {
  n: number;
  /** one `M x y h1 v1 h-1 z` square per dark module, offset by the quiet zone */
  d: string;
  dark: (row: number, col: number) => boolean;
}

function qrModulesOf(value: string): QrModules | null {
  if (!value) return null;
  try {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: QR_ECC });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) d += `M${col + QR_QUIET_MODULES} ${row + QR_QUIET_MODULES}h1v1h-1z`;
    }
    return { n: modules.size, d, dark: (row, col) => !!modules.get(row, col) };
  } catch {
    return null;
  }
}

export function QrCode(p: QrCodeProps): ReactElement | null {
  const t = useT();
  const qr = useMemo(() => qrModulesOf(p.value), [p.value]);
  if (!qr) {
    return (
      <div
        role="img"
        aria-label={p.label}
        style={{ width: p.size, height: p.size }}
        className="grid place-items-center rounded-[var(--r-control)] p-3 text-center text-xs text-muted-foreground ring-1 ring-border ring-inset"
      >
        {t("shell.qr.too_long")}
      </div>
    );
  }
  const box = qr.n + QR_QUIET_MODULES * 2;
  const px = qrPixels(qr.n, p.size) * box;
  return (
    <svg
      role="img"
      aria-label={p.label}
      width={px}
      height={px}
      viewBox={`0 0 ${box} ${box}`}
      shapeRendering="crispEdges"
      data-modules={qr.n}
      className="adm-qr block shrink-0 rounded-[var(--r-chip)]"
    >
      <path d={qr.d} fill="currentColor" />
    </svg>
  );
}

/** The SVG file of `value` (light ground, dark ink, fixed colours so it prints the same from either mode). */
export function qrSvgFile(value: string): string | null {
  const qr = qrModulesOf(value);
  if (!qr) return null;
  const box = qr.n + QR_QUIET_MODULES * 2;
  const px = box * QR_PNG_PX_PER_MODULE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="#fff"/><path d="${qr.d}" fill="#000"/></svg>`;
}

/** The PNG of `value` at 8 px per module, quiet zone included. */
async function qrPngBlob(value: string): Promise<Blob | null> {
  const qr = qrModulesOf(value);
  if (!qr) return null;
  const box = qr.n + QR_QUIET_MODULES * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = box * QR_PNG_PX_PER_MODULE;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000";
  for (let row = 0; row < qr.n; row++) {
    for (let col = 0; col < qr.n; col++) {
      if (qr.dark(row, col)) g.fillRect((col + QR_QUIET_MODULES) * QR_PNG_PX_PER_MODULE, (row + QR_QUIET_MODULES) * QR_PNG_PX_PER_MODULE, QR_PNG_PX_PER_MODULE, QR_PNG_PX_PER_MODULE);
    }
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** "Download the QR code": PNG (8 px per module) and SVG, named after `fileName`. Renders nothing for an unencodable value. */
export function QrDownloads({ value, fileName, className }: { value: string; fileName: string; className?: string }) {
  const t = useT();
  const svg = useMemo(() => qrSvgFile(value), [value]);
  if (!svg) return null;
  const btn = cn("h-7 gap-1 px-2 text-xs", FOCUS_RING, TOUCH);
  return (
    <div role="group" aria-label={t("shell.address.qr_download")} className={cn("flex items-center gap-1", className)}>
      <DownloadIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <Button
        type="button"
        variant="ghost"
        className={btn}
        onClick={async () => {
          const blob = await qrPngBlob(value);
          if (blob) saveBlob(blob, `${fileName}.png`);
        }}
      >
        {t("shell.qr.png")}
      </Button>
      <Button type="button" variant="ghost" className={btn} onClick={() => saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${fileName}.svg`)}>
        {t("shell.qr.svg")}
      </Button>
    </div>
  );
}
