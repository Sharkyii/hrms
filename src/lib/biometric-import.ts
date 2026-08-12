import { unzipSync } from "fflate";

export interface RawPunchRow {
  deviceUserCode: string;
  punchDatetime: string; // ISO
  inOut: "in" | "out" | "unknown";
}

// Generic offline-biometric export layout assumed per the doc: Device ID (optional, single-device
// files often omit it), User/Card ID, Timestamp, In/Out. Column order varies by vendor, so we match
// on header text rather than position. Re-map here once a real exported file is available.
const USER_CODE_ALIASES = ["userid", "user id", "cardno", "card no", "employeeid", "employee id", "empcode", "device user id", "userid/card"];
const DATETIME_ALIASES = ["datetime", "date time", "timestamp", "punch time", "date & time"];
const IN_OUT_ALIASES = ["inout", "in/out", "status", "direction", "punch type"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function classifyColumn(header: string): "userCode" | "datetime" | "inOut" | null {
  const normalized = normalizeHeader(header);
  if (USER_CODE_ALIASES.includes(normalized)) return "userCode";
  if (DATETIME_ALIASES.includes(normalized)) return "datetime";
  if (IN_OUT_ALIASES.includes(normalized)) return "inOut";
  return null;
}

function parseInOut(value: string): "in" | "out" | "unknown" {
  const s = value.trim().toLowerCase();
  if (["in", "i", "check-in", "checkin", "entry"].includes(s)) return "in";
  if (["out", "o", "check-out", "checkout", "exit"].includes(s)) return "out";
  return "unknown";
}

function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString();
}

function parseDatetime(value: string): string | null {
  if (value === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return excelSerialToIso(Number(value));
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function colRefToIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "A";
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index; // 1-based
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siPattern = /<si\b[^>]*>(.*?)<\/si>/gs;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siPattern.exec(xml))) {
    const tPattern = /<t[^>]*>(.*?)<\/t>/gs;
    let text = "";
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tPattern.exec(siMatch[1]))) {
      text += unescapeXml(tMatch[1]);
    }
    strings.push(text);
  }
  return strings;
}

interface Cell {
  colIndex: number;
  value: string;
}

function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>(.*?)<\/row>/gs;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(xml))) {
    const cellPattern = /<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;
    let cellMatch: RegExpExecArray | null;
    const cells: Cell[] = [];

    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attrs.match(/r="([^"]+)"/)?.[1] ?? "A1";
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const colIndex = colRefToIndex(ref);

      let value = "";
      if (type === "inlineStr") {
        const t = /<t[^>]*>(.*?)<\/t>/s.exec(inner);
        value = t ? unescapeXml(t[1]) : "";
      } else {
        const v = /<v>(.*?)<\/v>/s.exec(inner);
        const raw = v ? unescapeXml(v[1]) : "";
        value = type === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
      }
      cells.push({ colIndex, value });
    }

    if (cells.length === 0) continue;
    const maxCol = Math.max(...cells.map((cell) => cell.colIndex));
    const rowArray: string[] = new Array(maxCol + 1).fill("");
    for (const cell of cells) rowArray[cell.colIndex] = cell.value;
    rows.push(rowArray);
  }

  return rows;
}

export interface ParsedFile {
  rows: RawPunchRow[];
  unmappedColumnCount: number;
}

export async function parseBiometricWorkbook(buffer: ArrayBuffer): Promise<ParsedFile> {
  const files = unzipSync(new Uint8Array(buffer));
  const decoder = new TextDecoder();

  const sheetEntry = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0];
  if (!sheetEntry) return { rows: [], unmappedColumnCount: 0 };

  const sharedStringsXml = files["xl/sharedStrings.xml"] ? decoder.decode(files["xl/sharedStrings.xml"]) : undefined;
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const sheetXml = decoder.decode(files[sheetEntry]);
  const rawRows = parseSheetRows(sheetXml, sharedStrings);
  if (rawRows.length === 0) return { rows: [], unmappedColumnCount: 0 };

  const [headerRow, ...dataRows] = rawRows;
  const columnRoles = headerRow.map((header) => classifyColumn(header));
  const unmappedColumnCount = headerRow.filter((header, i) => header && !columnRoles[i]).length;

  const rows: RawPunchRow[] = [];
  for (const dataRow of dataRows) {
    let userCode: string | null = null;
    let datetime: string | null = null;
    let inOut: "in" | "out" | "unknown" = "unknown";

    columnRoles.forEach((role, i) => {
      const cellValue = dataRow[i] ?? "";
      if (role === "userCode") userCode = cellValue.trim();
      if (role === "datetime") datetime = parseDatetime(cellValue);
      if (role === "inOut") inOut = parseInOut(cellValue);
    });

    if (userCode && datetime) {
      rows.push({ deviceUserCode: userCode, punchDatetime: datetime, inOut });
    }
  }

  return { rows, unmappedColumnCount };
}

export function computeRowHash(deviceCode: string, row: RawPunchRow): string {
  return `${deviceCode}|${row.deviceUserCode}|${row.punchDatetime}|${row.inOut}`;
}
