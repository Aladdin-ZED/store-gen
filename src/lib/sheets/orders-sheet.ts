import "server-only";
/**
 * The "Commandes" tab: creation & formatting (one atomic batchUpdate), header write (proves Editor
 * access), row append, targeted cell updates, column-A lookup and status read-back.
 */
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/contract";
import { gapi, SheetsConfigError, SheetsError, type GapiOptions } from "./client";
import { a1, colLetter, parseSheetUrl, sheetUrl, type SheetLinkError } from "./format";

export const TAB = "Commandes";

/** [header, pixel width] — the column order is a contract with call centers and with php/gsheets.php. */
export const COLUMNS = [
  ["N° commande", 120],
  ["Date", 130],
  ["Statut", 140],
  ["Client", 180],
  ["Téléphone", 130],
  ["Ville", 120],
  ["Adresse", 260],
  ["Produit", 220],
  ["Variante", 170],
  ["Qté", 56],
  ["Total", 110],
  ["Note", 220],
  ["Source", 130],
] as const;

export const COL = {
  id: 0,
  date: 1,
  status: 2,
  name: 3,
  phone: 4,
  city: 5,
  address: 6,
  product: 7,
  variant: 8,
  qty: 9,
  total: 10,
  note: 11,
  source: 12,
} as const;

const LAST_COL = colLetter(COLUMNS.length - 1);

/** text colour + emphasis per status (backgrounds come from the shared contract) */
const STATUS_TEXT: Record<OrderStatus, { fg: string; bold?: boolean; strikethrough?: boolean }> = {
  new: { fg: "#1A4FA0" },
  confirmed: { fg: "#1D6B3A" },
  no_answer: { fg: "#8A5A00" },
  callback: { fg: "#5B3A8C" },
  shipped: { fg: "#1E6B63" },
  delivered: { fg: "#0F5A2A", bold: true },
  returned: { fg: "#9B2C22" },
  cancelled: { fg: "#80868B", strikethrough: true },
  fake: { fg: "#8C1D18", bold: true },
  // the R1 projections (operations.md OPE-§3.3), appended at P0 with the contract's rows
  refused: { fg: "#9B1C3A" },
  duplicate: { fg: "#5F6368" },
  unreachable: { fg: "#5B3A8C" },
  in_transit: { fg: "#00695C" },
  lost: { fg: "#3C4043" },
};

const LABEL_TO_STATUS = new Map<string, OrderStatus>(
  ORDER_STATUSES.flatMap((s) => [
    [foldLabel(s.fr), s.id],
    [foldLabel(s.id), s.id],
  ]),
);

function foldLabel(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .trim()
    .toLowerCase();
}

export const statusLabel = (id: string): string => ORDER_STATUSES.find((s) => s.id === id)?.fr ?? ORDER_STATUSES[0].fr;
export const statusFromLabel = (label: string): OrderStatus | null => LABEL_TO_STATUS.get(foldLabel(label)) ?? null;

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
};

/** whole column below the header (no endRowIndex = unbounded) */
const colRange = (sheetId: number, c: number) => ({ sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 });

const CURRENCY_SUFFIX: Record<string, string> = { MAD: "DH", EUR: "€" };
const moneyPattern = (currency: string) => {
  const suffix = (CURRENCY_SUFFIX[currency] ?? currency.replace(/[^A-Z]/g, "").slice(0, 3)) || "DH";
  return `#,##0.00 "${suffix}"`;
};

/** All formatting requests for a new tab — sent as ONE batchUpdate (atomic: all or nothing). */
export function setupRequests(sheetId: number, currency = "MAD", title: string = TAB): object[] {
  const n = COLUMNS.length;
  const ink = rgb("#1F2328");
  return [
    {
      addSheet: {
        properties: {
          sheetId,
          title,
          index: 0,
          gridProperties: { rowCount: 1000, columnCount: n, frozenRowCount: 1, frozenColumnCount: 1 },
          tabColorStyle: { rgbColor: ink },
        },
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: n },
        cell: {
          userEnteredFormat: {
            backgroundColorStyle: { rgbColor: ink },
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
            textFormat: { foregroundColorStyle: { rgbColor: rgb("#FFFFFF") }, fontSize: 10, bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColorStyle,horizontalAlignment,verticalAlignment,padding,textFormat)",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 34 },
        fields: "pixelSize",
      },
    },
    // body: middle-aligned, clipped (long addresses never change row heights)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: n },
        cell: { userEnteredFormat: { verticalAlignment: "MIDDLE", wrapStrategy: "CLIP", textFormat: { fontSize: 10 } } },
        fields: "userEnteredFormat(verticalAlignment,wrapStrategy,textFormat.fontSize)",
      },
    },
    ...COLUMNS.map(([, px], i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    })),
    // B = date (we write serial numbers), E = phone as text, J = integer, K = money
    {
      repeatCell: {
        range: colRange(sheetId, COL.date),
        cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd/mm/yyyy hh:mm" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: colRange(sheetId, COL.phone),
        cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: colRange(sheetId, COL.qty),
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" }, horizontalAlignment: "CENTER" } },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: colRange(sheetId, COL.total),
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: moneyPattern(currency) } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    // strict status dropdown with the French labels call-center agents use
    {
      setDataValidation: {
        range: colRange(sheetId, COL.status),
        rule: {
          condition: { type: "ONE_OF_LIST", values: ORDER_STATUSES.map((s) => ({ userEnteredValue: s.fr })) },
          strict: true,
          showCustomUi: true,
        },
      },
    },
    // one soft tint per status (TEXT_EQ needs no formula → independent of the sheet's locale)
    ...ORDER_STATUSES.map((s, i) => {
      const t = STATUS_TEXT[s.id];
      return {
        addConditionalFormatRule: {
          index: i,
          rule: {
            ranges: [colRange(sheetId, COL.status)],
            booleanRule: {
              condition: { type: "TEXT_EQ", values: [{ userEnteredValue: s.fr }] },
              format: {
                backgroundColor: rgb(s.color),
                textFormat: {
                  foregroundColor: rgb(t.fg),
                  ...(t.bold ? { bold: true } : {}),
                  ...(t.strikethrough ? { strikethrough: true } : {}),
                },
              },
            },
          },
        },
      };
    }),
    // filter buttons on the header (agents filter by status / city)
    { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: n } } } },
    // warn before editing the header or the order numbers (sync relies on both)
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: n },
          description: "En-têtes utilisés par la synchronisation",
          warningOnly: true,
        },
      },
    },
    {
      addProtectedRange: {
        protectedRange: {
          range: colRange(sheetId, COL.id),
          description: "N° de commande utilisés par la synchronisation",
          warningOnly: true,
        },
      },
    },
  ];
}

const sid = (spreadsheetId: string) => `/${encodeURIComponent(spreadsheetId)}`;
const rng = (title: string, range: string) => encodeURIComponent(a1(title, range));

async function writeHeader(spreadsheetId: string, title: string): Promise<void> {
  await gapi(`${sid(spreadsheetId)}/values/${rng(title, `A1:${LAST_COL}1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [COLUMNS.map((c) => c[0])] }),
  });
}

/** Invalid link pasted by the admin. */
export class SheetLinkInvalid extends Error {
  constructor(readonly code: SheetLinkError) {
    super(code);
    this.name = "SheetLinkInvalid";
  }
}

export interface ConnectResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetId: number;
  sheetTitle: string;
  created: boolean;
  url: string;
}

interface SpreadsheetMeta {
  properties?: { title?: string };
  sheets?: { properties?: { sheetId?: number; title?: string } }[];
}

/** Tab titles we may use, by preference: another tool may already own a "Commandes" tab with its own layout. */
export const TAB_TITLES = [TAB, `${TAB} COD`, `${TAB} COD 2`, `${TAB} COD 3`] as const;

async function readHeader(spreadsheetId: string, title: string): Promise<string[]> {
  const r = await gapi<{ values?: unknown[][] }>(`${sid(spreadsheetId)}/values/${rng(title, `A1:${LAST_COL}1`)}`);
  return (r.values?.[0] ?? []).map((v) => String(v ?? "").trim());
}

/**
 * Can this header row be (re)written with ours? Yes when it is empty or already our layout — also
 * after agents renamed a few cells (our "N° commande" id column, or most of our labels, are still there).
 */
export function headerUsable(header: readonly string[]): boolean {
  if (header.every((h) => !h)) return true;
  if (header[0] === COLUMNS[0][0]) return true;
  return COLUMNS.filter(([h], i) => header[i] === h).length >= Math.ceil(COLUMNS.length / 2);
}

/**
 * Admin "connect" flow: find or create the orders tab and prove Editor access by writing the header.
 * The previously connected tab is reused as is; a "Commandes" tab laid out by another tool is never
 * overwritten (a "Commandes COD" tab is created next to it). Existing tabs are never re-formatted
 * (conditional-format rules would be duplicated).
 */
export async function connectSheet(
  link: string,
  opts: { knownSheetId?: number | null; currency?: string } = {},
): Promise<ConnectResult> {
  const parsed = parseSheetUrl(link);
  if (!parsed.ok) throw new SheetLinkInvalid(parsed.error);
  const { spreadsheetId } = parsed;
  const meta = await gapi<SpreadsheetMeta>(
    `${sid(spreadsheetId)}?fields=${encodeURIComponent("properties(title),sheets(properties(sheetId,title))")}`,
  );
  const tabs = (meta.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is { sheetId: number; title: string } => typeof p?.sheetId === "number" && typeof p.title === "string");
  const spreadsheetTitle = meta.properties?.title ?? "";

  let existing = tabs.find((t) => t.sheetId === opts.knownSheetId);
  for (const title of TAB_TITLES) {
    if (existing) break;
    const tab = tabs.find((t) => t.title === title);
    if (tab && headerUsable(await readHeader(spreadsheetId, tab.title))) existing = tab;
  }
  if (existing) {
    // a Viewer share passes the reads above but fails this write with 403
    await writeHeader(spreadsheetId, existing.title);
    return {
      spreadsheetId,
      spreadsheetTitle,
      sheetId: existing.sheetId,
      sheetTitle: existing.title,
      created: false,
      url: sheetUrl(spreadsheetId, existing.sheetId),
    };
  }
  const title = TAB_TITLES.find((t) => !tabs.some((x) => x.title === t)) ?? `${TAB} ${Date.now().toString(36)}`;
  // we pick the id so the other requests of the same batch can reference the new tab
  let sheetId = 0;
  do sheetId = 1 + Math.floor(Math.random() * 2_000_000_000);
  while (tabs.some((t) => t.sheetId === sheetId));
  await gapi(`${sid(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: setupRequests(sheetId, opts.currency, title) }),
  });
  await writeHeader(spreadsheetId, title);
  return { spreadsheetId, spreadsheetTitle, sheetId, sheetTitle: title, created: true, url: sheetUrl(spreadsheetId, sheetId) };
}

/** Read-only access check: the header row must still be ours. */
export async function verifySheet(spreadsheetId: string, title: string): Promise<{ ok: boolean; header: string[] }> {
  const header = await readHeader(spreadsheetId, title);
  return { ok: COLUMNS.every(([h], i) => header[i] === h), header };
}

export type Cell = string | number;

/** Append rows in ONE request. RAW = stored literally (never parsed as formulas, leading zeros kept). */
export async function appendRows(spreadsheetId: string, title: string, rows: Cell[][], opts?: GapiOptions): Promise<void> {
  if (!rows.length) return;
  await gapi(
    `${sid(spreadsheetId)}/values/${rng(title, "A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) },
    opts,
  );
}

/** Write individual cells/ranges in ONE request: [{ range: "K12", values: [[349]] }, …]. */
export async function updateCells(
  spreadsheetId: string,
  title: string,
  data: { range: string; values: Cell[][] }[],
  opts?: GapiOptions,
): Promise<void> {
  if (!data.length) return;
  await gapi(
    `${sid(spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: data.map((d) => ({ range: a1(title, d.range), majorDimension: "ROWS", values: d.values })),
      }),
    },
    opts,
  );
}

/** Order id → 1-based sheet row number, from column A. */
export async function readOrderRows(spreadsheetId: string, title: string, opts?: GapiOptions): Promise<Map<string, number>> {
  const r = await gapi<{ values?: unknown[][] }>(
    `${sid(spreadsheetId)}/values/${rng(title, "A2:A")}?majorDimension=COLUMNS`,
    {},
    opts,
  );
  const out = new Map<string, number>();
  (r.values?.[0] ?? []).forEach((v, i) => {
    const id = String(v ?? "").trim();
    if (id && !out.has(id)) out.set(id, i + 2);
  });
  return out;
}

/** Order id → status id as set by agents in the sheet (unknown labels are skipped). */
export async function readStatuses(spreadsheetId: string, title: string, opts?: GapiOptions): Promise<Map<string, OrderStatus>> {
  const r = await gapi<{ values?: unknown[][] }>(
    `${sid(spreadsheetId)}/values/${rng(title, `A2:${colLetter(COL.status)}`)}?majorDimension=ROWS`,
    {},
    opts,
  );
  const out = new Map<string, OrderStatus>();
  for (const row of r.values ?? []) {
    const id = String(row[COL.id] ?? "").trim();
    const status = statusFromLabel(String(row[COL.status] ?? ""));
    if (id && status) out.set(id, status);
  }
  return out;
}

/** Admin-facing French explanation of a Sheets failure (shows the service-account e-mail to share with). */
export function explain(e: unknown, saEmail: string | null): string {
  const share = saEmail ?? "l'adresse du compte de service";
  if (e instanceof SheetLinkInvalid) {
    switch (e.code) {
      case "published_link":
        return "Ce lien est un lien « Publier sur le Web ». Copiez plutôt le lien de la barre d'adresse de la feuille (…/spreadsheets/d/…/edit).";
      case "not_google":
        return "Ce lien n'est pas un lien Google Sheets.";
      case "not_a_sheet":
        return "Ce lien ouvre un document Google, pas une feuille de calcul. Créez une feuille Google Sheets et collez son lien.";
      default:
        return "Lien invalide. Copiez le lien depuis la barre d'adresse de votre feuille Google Sheets.";
    }
  }
  if (e instanceof SheetsConfigError) {
    return e.code === "not_configured"
      ? "Le compte de service Google n'est pas configuré (variable GOOGLE_SA_JSON_B64, côté développeur)."
      : "La clé du compte de service (GOOGLE_SA_JSON_B64) est illisible. Recopiez le fichier JSON encodé en base64 (côté développeur).";
  }
  if (!(e instanceof SheetsError)) return "Connexion impossible pour le moment. Réessayez dans une minute.";
  const m = e.message;
  if (e.status === 0) return "Google Sheets ne répond pas. Les commandes en attente seront renvoyées automatiquement.";
  if (e.status === 403 && /SERVICE_DISABLED|has not been used|accessNotConfigured/i.test(m))
    return "L'API Google Sheets n'est pas activée sur le projet Google Cloud (côté développeur).";
  if (e.status === 403) return `Partagez la feuille avec ${share} en tant qu'Éditeur (sans notification), puis réessayez.`;
  if (e.status === 404) return "Feuille introuvable. Vérifiez le lien (copiez-le depuis la barre d'adresse de la feuille).";
  if (e.status === 400 && /not supported for this document/i.test(m))
    return "Ce fichier est un Excel (.xlsx). Ouvrez-le puis Fichier › Enregistrer au format Google Sheets, et collez le nouveau lien.";
  if (e.status === 400 && /Unable to parse range/i.test(m)) return "L'onglet des commandes a été supprimé ou renommé. Reconnectez la feuille pour le recréer.";
  if (e.status === 429) return "Google limite temporairement les écritures. Les commandes en attente seront renvoyées automatiquement.";
  if (e.reason === "invalid_grant" || e.reason === "disabled_client" || e.reason === "unauthorized_client")
    return "La clé du compte de service est invalide ou désactivée (côté développeur).";
  return `Erreur Google Sheets : ${m.slice(0, 300)}`;
}
