import * as XLSX from "xlsx";

export interface RawPunchRow {
  deviceUserCode: string;
  employeeName?: string;
  punchDatetime: string; // ISO
  inOut: "in" | "out" | "unknown";
}

export interface ParsedFile {
  rows: RawPunchRow[];
  unmappedColumnCount: number;
  sourceFormat: "vendor_exception_stat" | "generic";
}

function cellStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

// Combines a date string ("2026-07-01") with a time string ("09:19") into an ISO datetime.
// Returns null if either half is missing/unparseable — used to skip half-punched days.
function combineDateTime(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  parsed.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
  return parsed.toISOString();
}

// Vendor biometric-software exports (eSSL/ZKTeco-style "Exception Statistic Report") ship a fixed,
// two-row-header sheet named like "Exception Stat." with one row per employee per date and separate
// On-duty/Off-duty columns — far more reliable than trying to reverse-engineer a generic layout.
// Columns: ID, Name, Department, Date, OnDuty(zone1), OffDuty(zone1), OnDuty(zone2), OffDuty(zone2), ...
function parseVendorExceptionSheet(sheet: XLSX.WorkSheet): RawPunchRow[] | null {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  if (grid.length < 4) return null;

  const headerRow = grid[2]?.map(cellStr) ?? [];
  const subHeaderRow = grid[3]?.map(cellStr) ?? [];
  const looksLikeVendorFormat =
    headerRow[0] === "ID" && headerRow[1] === "Name" && headerRow[3] === "Date" && subHeaderRow[4] === "On-duty";
  if (!looksLikeVendorFormat) return null;

  const rows: RawPunchRow[] = [];
  for (let i = 4; i < grid.length; i++) {
    const row = grid[i];
    if (!row) continue;
    const id = cellStr(row[0]);
    const name = cellStr(row[1]);
    const date = cellStr(row[3]);
    if (!id || !date) continue;

    const onDuty = cellStr(row[4]);
    const offDuty = cellStr(row[5]);
    const inIso = combineDateTime(date, onDuty);
    const outIso = combineDateTime(date, offDuty);
    if (inIso) rows.push({ deviceUserCode: id, employeeName: name, punchDatetime: inIso, inOut: "in" });
    if (outIso) rows.push({ deviceUserCode: id, employeeName: name, punchDatetime: outIso, inOut: "out" });
  }
  return rows;
}

// Generic fallback for simpler flat exports: a single header row with User/Card ID, DateTime, and
// In/Out columns matched by header text (order doesn't matter). Re-map aliases here as needed.
const USER_CODE_ALIASES = ["userid", "user id", "cardno", "card no", "employeeid", "employee id", "empcode", "id", "device user id"];
const DATETIME_ALIASES = ["datetime", "date time", "timestamp", "punch time", "date & time"];
const IN_OUT_ALIASES = ["inout", "in/out", "status", "direction", "punch type"];

function classifyColumn(header: string): "userCode" | "datetime" | "inOut" | null {
  const normalized = header.trim().toLowerCase().replace(/\s+/g, " ");
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

function parseDatetime(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseGenericSheet(sheet: XLSX.WorkSheet): { rows: RawPunchRow[]; unmappedColumnCount: number } {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  if (grid.length === 0) return { rows: [], unmappedColumnCount: 0 };

  const headerRow = grid[0].map(cellStr);
  const columnRoles = headerRow.map(classifyColumn);
  const unmappedColumnCount = headerRow.filter((h, i) => h && !columnRoles[i]).length;

  const rows: RawPunchRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const dataRow = grid[i];
    let userCode = "";
    let datetime: string | null = null;
    let inOut: "in" | "out" | "unknown" = "unknown";

    columnRoles.forEach((role, colIndex) => {
      const cellValue = cellStr(dataRow[colIndex]);
      if (role === "userCode") userCode = cellValue;
      if (role === "datetime") datetime = parseDatetime(cellValue);
      if (role === "inOut") inOut = parseInOut(cellValue);
    });

    if (userCode && datetime) rows.push({ deviceUserCode: userCode, punchDatetime: datetime, inOut });
  }
  return { rows, unmappedColumnCount };
}

export async function parseBiometricWorkbook(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = XLSX.read(buffer, { type: "array" });

  const exceptionSheetName = workbook.SheetNames.find((name) => /exception/i.test(name) && /stat/i.test(name));
  if (exceptionSheetName) {
    const vendorRows = parseVendorExceptionSheet(workbook.Sheets[exceptionSheetName]);
    if (vendorRows && vendorRows.length > 0) {
      return { rows: vendorRows, unmappedColumnCount: 0, sourceFormat: "vendor_exception_stat" };
    }
  }

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const { rows, unmappedColumnCount } = parseGenericSheet(firstSheet);
  return { rows, unmappedColumnCount, sourceFormat: "generic" };
}

export function computeRowHash(deviceCode: string, row: RawPunchRow): string {
  return `${deviceCode}|${row.deviceUserCode}|${row.punchDatetime}|${row.inOut}`;
}
