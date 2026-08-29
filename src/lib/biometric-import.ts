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
  sourceFormat: "vendor_exception_stat" | "vendor_att_log" | "generic";
  detectedColumns?: string[]; // for diagnostics when parsing fails
}

export class BiometricParseError extends Error {
  detectedColumns: string[];
  constructor(message: string, detectedColumns: string[]) {
    super(message);
    this.detectedColumns = detectedColumns;
  }
}

function cellStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

// Biometric devices report punch times in local office time (IST, UTC+5:30), not UTC. Combines a
// date string ("2026-07-01") with a time string ("09:19" or "09:19:00") into a correct UTC ISO
// datetime. Building the offset explicitly avoids Date's local-timezone methods (setHours, etc.),
// which resolve against the *runtime's* timezone — UTC on Cloudflare Workers regardless of where
// the device/office actually is — and would otherwise silently store the wrong instant.
// Returns null if either half is missing/unparseable — used to skip half-punched days.
const OFFICE_UTC_OFFSET = "+05:30";

function combineDateTime(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const parsed = new Date(`${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}:00${OFFICE_UTC_OFFSET}`);
  if (isNaN(parsed.getTime())) return null;
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

// Same vendor software's raw "Attendance Record Report" sheet (e.g. "Att.log report") — a block
// format, not a normal table: each employee occupies two rows (an "ID:.../Name:.../Dept.:..." header
// row, then a data row with one cell per day-of-month), and each day's cell is every punch that day
// concatenated with no separator, e.g. "09:1918:33" = two punches, "09:3113:0518:34" = three. This is
// messier than the Exception Stat. sheet but present even when Exception Stat. is empty/absent —
// tried second, only if the Exception Stat. sheet didn't yield any rows.
function parseVendorAttLogSheet(sheet: XLSX.WorkSheet): RawPunchRow[] | null {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  if (grid.length < 6) return null;

  let periodStart: string | null = null;
  for (let i = 0; i < Math.min(grid.length, 5) && !periodStart; i++) {
    for (const cell of grid[i]) {
      const match = cellStr(cell).match(/(\d{4}-\d{2}-\d{2})\s*~\s*\d{4}-\d{2}-\d{2}/);
      if (match) periodStart = match[1];
    }
  }
  if (!periodStart) return null;

  const dayHeaderRowIndex = grid.findIndex((row) => cellStr(row?.[0]) === "1" && cellStr(row?.[1]) === "2");
  if (dayHeaderRowIndex === -1) return null;

  const rows: RawPunchRow[] = [];
  for (let i = dayHeaderRowIndex + 1; i < grid.length - 1; i += 2) {
    const headerRow = grid[i]?.map(cellStr) ?? [];
    const dataRow = grid[i + 1] ?? [];
    const idIndex = headerRow.findIndex((c) => c.toUpperCase() === "ID:");
    const nameIndex = headerRow.findIndex((c) => c.toUpperCase() === "NAME:");
    if (idIndex === -1) continue;
    const id = headerRow[idIndex + 2] ?? "";
    const name = nameIndex !== -1 ? headerRow[nameIndex + 2] ?? "" : "";
    if (!id) continue;

    for (let day = 0; day < dataRow.length; day++) {
      const cell = cellStr(dataRow[day]);
      if (!cell) continue;
      const times = cell.match(/\d{1,2}:\d{2}/g);
      if (!times || times.length === 0) continue;

      const date = new Date(periodStart);
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().slice(0, 10);

      const inIso = combineDateTime(dateStr, times[0]);
      if (inIso) rows.push({ deviceUserCode: id, employeeName: name || undefined, punchDatetime: inIso, inOut: "in" });
      if (times.length > 1) {
        const outIso = combineDateTime(dateStr, times[times.length - 1]);
        if (outIso) rows.push({ deviceUserCode: id, employeeName: name || undefined, punchDatetime: outIso, inOut: "out" });
      }
    }
  }
  return rows;
}

// Generic fallback for flat exports. Deliberately loose matching (substring, not exact) since real
// files vary a lot: "Emp ID" vs "Employee Code" vs "Card No", "Date"+"Time" split across two columns
// vs one combined "DateTime", "In Time"/"Out Time" as two columns vs a single "In/Out" flag column.
type ColumnRole = "userCode" | "name" | "datetime" | "date" | "time" | "inTime" | "outTime" | "inOut";

const COLUMN_PATTERNS: Array<{ role: ColumnRole; test: (h: string) => boolean }> = [
  { role: "inTime", test: (h) => /\bin\b/.test(h) && /time|punch/.test(h) },
  { role: "outTime", test: (h) => /\bout\b/.test(h) && /time|punch/.test(h) },
  { role: "datetime", test: (h) => /date\s*&?\s*time|timestamp|punch\s*time/.test(h) },
  { role: "date", test: (h) => /date/.test(h) },
  { role: "time", test: (h) => /time/.test(h) },
  { role: "inOut", test: (h) => /in\s*\/?\s*out|^status$|direction|punch\s*type/.test(h) },
  { role: "userCode", test: (h) => /user\s*id|card\s*no|emp\w*\s*(id|code)|device\s*user/.test(h) },
  { role: "name", test: (h) => /^name$|employee\s*name/.test(h) },
];

function classifyColumn(header: string): ColumnRole | null {
  const normalized = header.trim().toLowerCase().replace(/[_.]/g, " ").replace(/\s+/g, " ");
  if (!normalized) return null;
  for (const { role, test } of COLUMN_PATTERNS) {
    if (test(normalized)) return role;
  }
  return null;
}

function parseInOut(value: string): "in" | "out" | "unknown" {
  const s = value.trim().toLowerCase();
  if (["in", "i", "check-in", "checkin", "entry", "p"].includes(s)) return "in";
  if (["out", "o", "check-out", "checkout", "exit"].includes(s)) return "out";
  return "unknown";
}

function parseDatetime(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseGenericSheet(sheet: XLSX.WorkSheet): { rows: RawPunchRow[]; unmappedColumnCount: number; detectedColumns: string[] } {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  if (grid.length === 0) return { rows: [], unmappedColumnCount: 0, detectedColumns: [] };

  const headerRow = grid[0].map(cellStr);
  const columnRoles = headerRow.map(classifyColumn);
  const unmappedColumnCount = headerRow.filter((h, i) => h && !columnRoles[i]).length;
  const detectedColumns = headerRow.map((h, i) => `${h || `(col ${i + 1})`} → ${columnRoles[i] ?? "unrecognized"}`);

  const rows: RawPunchRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const dataRow = grid[i];
    let userCode = "";
    let name = "";
    let datetime = "";
    let date = "";
    let time = "";
    let inTime = "";
    let outTime = "";
    let inOut: "in" | "out" | "unknown" = "unknown";

    columnRoles.forEach((role, colIndex) => {
      const v = cellStr(dataRow[colIndex]);
      if (role === "userCode") userCode = v;
      if (role === "name") name = v;
      if (role === "datetime") datetime = v;
      if (role === "date") date = v;
      if (role === "time") time = v;
      if (role === "inTime") inTime = v;
      if (role === "outTime") outTime = v;
      if (role === "inOut") inOut = parseInOut(v);
    });

    if (!userCode) continue;

    // Layout: separate In Time / Out Time columns — one row = up to two punches for that person/day.
    if (inTime || outTime) {
      const day = date || datetime;
      const inIso = combineDateTime(day, inTime);
      const outIso = combineDateTime(day, outTime);
      if (inIso) rows.push({ deviceUserCode: userCode, employeeName: name || undefined, punchDatetime: inIso, inOut: "in" });
      if (outIso) rows.push({ deviceUserCode: userCode, employeeName: name || undefined, punchDatetime: outIso, inOut: "out" });
      continue;
    }

    // Layout: one combined DateTime column, or separate Date + Time columns, plus an In/Out flag.
    const resolvedDatetime = parseDatetime(datetime) ?? (date && time ? combineDateTime(date, time) : null) ?? parseDatetime(date);
    if (resolvedDatetime) rows.push({ deviceUserCode: userCode, employeeName: name || undefined, punchDatetime: resolvedDatetime, inOut });
  }

  return { rows, unmappedColumnCount, detectedColumns };
}

export async function parseBiometricWorkbook(buffer: ArrayBuffer): Promise<ParsedFile> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch (err) {
    throw new BiometricParseError("Could not read file — ensure it's a valid Excel file (.xlsx or .xls)", []);
  }
  if (workbook.SheetNames.length === 0) throw new BiometricParseError("The file has no readable sheet.", []);

  const exceptionSheetName = workbook.SheetNames.find((name) => /exception/i.test(name) && /stat/i.test(name));
  if (exceptionSheetName) {
    const vendorRows = parseVendorExceptionSheet(workbook.Sheets[exceptionSheetName]);
    if (vendorRows && vendorRows.length > 0) {
      return { rows: vendorRows, unmappedColumnCount: 0, sourceFormat: "vendor_exception_stat" };
    }
  }

  const logSheetName = workbook.SheetNames.find((name) => /att.*log|log.*report/i.test(name));
  if (logSheetName) {
    const vendorRows = parseVendorAttLogSheet(workbook.Sheets[logSheetName]);
    if (vendorRows && vendorRows.length > 0) {
      return { rows: vendorRows, unmappedColumnCount: 0, sourceFormat: "vendor_att_log" };
    }
  }

  // Generic fallback: try every sheet (not just the first), keep whichever yields the most rows —
  // exported workbooks often put punch data on a sheet other than the first.
  let best: { rows: RawPunchRow[]; unmappedColumnCount: number; detectedColumns: string[]; sheetName: string } | null = null;
  for (const name of workbook.SheetNames) {
    const result = parseGenericSheet(workbook.Sheets[name]);
    if (!best || result.rows.length > best.rows.length) best = { ...result, sheetName: name };
  }

  if (!best || best.rows.length === 0) {
    throw new BiometricParseError(
      `Could not find both a User/Card ID and a date/time in any row. Sheets in this file: ${workbook.SheetNames.join(", ")}.`,
      best?.detectedColumns ?? [],
    );
  }
  return { rows: best.rows, unmappedColumnCount: best.unmappedColumnCount, sourceFormat: "generic", detectedColumns: best.detectedColumns };
}

export function computeRowHash(deviceCode: string, row: RawPunchRow): string {
  return `${deviceCode}|${row.deviceUserCode}|${row.punchDatetime}|${row.inOut}`;
}
