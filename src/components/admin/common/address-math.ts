/**
 * The live address card's arithmetic (P2 SHELL; design.md DES-§16.12 rev 3 UX-30; platform.md PLA-§22.10.2, §L).
 * Pure and isomorphic: `AddressCard` and `QrCode` size the code from these, and `test:shell` checks them.
 *
 * - The QR encodes the short canonical URL (`/go/<code>`) when one exists, else the store URL.
 * - Its size comes from the module count, never a fixed box: `modules × 4 px` on screen plus a 4-module quiet zone
 *   (so "≥ 4 px per module" holds by construction), error correction M; the PNG download is drawn at 8 px per module
 *   (3 cm at ≥ 300 dpi).
 * - The WhatsApp text is `{store}: {url}` (`shell.address.wa_text`) and at most 300 characters: a long store name is
 *   cut, the URL never is.
 */
import QRCode from "qrcode";

export const QR_SCREEN_PX_PER_MODULE = 4;
export const QR_PNG_PX_PER_MODULE = 8;
export const QR_QUIET_MODULES = 4;
export const QR_ECC = "M" as const;
/** The card's QR column (the code is centred in it). */
export const QR_COLUMN_PX = 160;
export const WA_TEXT_MAX = 300;

/** The modules per side of `value`'s QR code (error correction M), or null when it does not fit a QR code. */
export function qrModules(value: string): number | null {
  if (value.length === 0) return null;
  try {
    return QRCode.create(value, { errorCorrectionLevel: QR_ECC }).modules.size;
  } catch {
    return null;
  }
}

export interface QrSize {
  modules: number;
  /** side in CSS px on screen, quiet zone included */
  screenPx: number;
  /** side of the downloaded PNG, quiet zone included */
  pngPx: number;
  /** the code's own side on screen, without the quiet zone */
  codePx: number;
}

/** The sizes of a code with `modules` modules per side. */
export function qrSize(modules: number): QrSize {
  const box = modules + QR_QUIET_MODULES * 2;
  return {
    modules,
    codePx: modules * QR_SCREEN_PX_PER_MODULE,
    screenPx: box * QR_SCREEN_PX_PER_MODULE,
    pngPx: box * QR_PNG_PX_PER_MODULE,
  };
}

/** What the card's QR encodes: the short `/go/<code>` URL when given, else the canonical store URL. */
export function qrTarget(storeUrl: string, shortUrl?: string | null): string {
  const s = shortUrl?.trim();
  return s ? s : storeUrl;
}

/** The QR of the card: its target and sizes (null sizes when the target cannot be a QR code). */
export function addressQr(storeUrl: string, shortUrl?: string | null): { value: string; size: QrSize | null } {
  const value = qrTarget(storeUrl, shortUrl);
  const modules = qrModules(value);
  return { value, size: modules === null ? null : qrSize(modules) };
}

/**
 * The WhatsApp share text from the rendered template (`shell.address.wa_text` with `{store}` and `{url}`), at most
 * 300 characters: the store name is shortened with an ellipsis first; the URL is kept whole (a cut link is useless).
 */
export function whatsappText(template: string, store: string, url: string, max: number = WA_TEXT_MAX): string {
  const fill = (name: string) => template.replace("{store}", name).replace("{url}", url);
  const full = fill(store);
  if ([...full].length <= max) return full;
  const room = max - [...fill("")].length;
  if (room <= 1) return [...url].slice(0, max).join("");
  const chars = [...store.trim()];
  return fill(`${chars.slice(0, room - 1).join("").trimEnd()}…`);
}
