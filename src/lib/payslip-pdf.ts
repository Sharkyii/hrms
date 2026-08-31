import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface PayslipPdfData {
  company: {
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    panNumber: string | null;
    logoBase64: string | null;
    signatureBase64: string | null;
    signatoryLabel: string;
  };
  employee: {
    fullName: string;
    employeeCode: string;
    designation: string | null;
    department: string | null;
    dateOfJoining: string;
  };
  payrollDetails: {
    panNumber: string | null;
    uanNumber: string | null;
    pfAccountNumber: string | null;
    esiNumber: string | null;
    pranNumber: string | null;
    taxRegime: string | null;
    function: string | null;
    location: string | null;
  } | null;
  bankName: string | null;
  periodLabel: string; // e.g. "Nov -2025"
  attendance: {
    present: number;
    paidLeave: number;
    paidLeaveBalance: number;
  };
  earningLines: Array<{ name: string; amount: number }>;
  deductionLines: Array<{ name: string; amount: number }>;
  totalEarnings: number;
  totalDeductions: number;
  netAmount: number;
}

const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0, 0, 0);

function fmt(n: number): string {
  return n === 0 ? "-" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// Decodes a data-URI or raw base64 image string and embeds it in the PDF. Used for both the
// company logo and the signature/stamp — malformed data falls back to null so the caller can
// render its text-only fallback instead of failing the whole payslip.
async function embedBase64Image(doc: PDFDocument, base64: string | null) {
  if (!base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64.replace(/^data:image\/\w+;base64,/, "")), (c) => c.charCodeAt(0));
    const isPng = base64.includes("image/png") || bytes[0] === 0x89;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

class Sheet {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;

  constructor(page: PDFPage, font: PDFFont, bold: PDFFont) {
    this.page = page;
    this.font = font;
    this.bold = bold;
    this.y = PAGE_HEIGHT - MARGIN;
  }

  text(text: string, x: number, size: number, opts: { bold?: boolean; align?: "left" | "center" | "right"; width?: number } = {}) {
    const font = opts.bold ? this.bold : this.font;
    const w = font.widthOfTextAtSize(text, size);
    let drawX = x;
    if (opts.align === "center" && opts.width) drawX = x + (opts.width - w) / 2;
    if (opts.align === "right" && opts.width) drawX = x + opts.width - w;
    this.page.drawText(text, { x: drawX, y: this.y, size, font, color: BLACK });
  }

  hline(x1: number, x2: number, y: number, thickness = 0.75) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: BLACK });
  }

  vline(x: number, y1: number, y2: number, thickness = 0.75) {
    this.page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color: BLACK });
  }

  box(x: number, y: number, width: number, height: number, thickness = 0.75) {
    this.page.drawRectangle({ x, y, width, height, borderColor: BLACK, borderWidth: thickness });
  }

  // Draws a grid table: columns = widths array, rows = array of cell-text arrays (one string per column).
  // Returns the y coordinate of the bottom of the table.
  table(x: number, topY: number, columnWidths: number[], rows: string[][], opts: { rowHeight?: number; boldRows?: number[]; fontSize?: number } = {}) {
    const rowHeight = opts.rowHeight ?? 18;
    const fontSize = opts.fontSize ?? 8.5;
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    const bottomY = topY - rowHeight * rows.length;

    this.box(x, bottomY, totalWidth, rowHeight * rows.length);
    for (let r = 1; r < rows.length; r++) this.hline(x, x + totalWidth, topY - rowHeight * r);
    let colX = x;
    for (let c = 0; c < columnWidths.length - 1; c++) {
      colX += columnWidths[c];
      this.vline(colX, bottomY, topY);
    }

    rows.forEach((row, r) => {
      let cx = x;
      const rowY = topY - rowHeight * r - rowHeight + rowHeight / 2 - fontSize / 2 + 2;
      const isBold = opts.boldRows?.includes(r) ?? false;
      row.forEach((cell, c) => {
        const font = isBold ? this.bold : this.font;
        const maxWidth = columnWidths[c] - 8;
        let display = cell;
        while (font.widthOfTextAtSize(display, fontSize) > maxWidth && display.length > 3) {
          display = display.slice(0, -2);
        }
        if (display !== cell) display = display.slice(0, -1) + "…";
        this.page.drawText(display, { x: cx + 4, y: rowY, size: fontSize, font, color: BLACK });
        cx += columnWidths[c];
      });
    });

    this.y = bottomY;
    return bottomY;
  }
}

export async function generatePayslipPdf(data: PayslipPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = new Sheet(page, font, bold);

  // --- Header: logo + company info ---
  const headerHeight = 70;
  const headerTop = sheet.y;
  sheet.box(MARGIN, headerTop - headerHeight, CONTENT_WIDTH, headerHeight);

  let textX = MARGIN + 12;
  const logoImage = await embedBase64Image(doc, data.company.logoBase64);
  if (logoImage) {
    // Fit within a box rather than forcing a square — preserves aspect ratio for wide wordmark logos.
    const maxWidth = 140;
    const maxHeight = 44;
    const scale = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height, 1);
    const drawWidth = logoImage.width * scale;
    const drawHeight = logoImage.height * scale;
    page.drawImage(logoImage, {
      x: MARGIN + 10,
      y: headerTop - headerHeight / 2 - drawHeight / 2,
      width: drawWidth,
      height: drawHeight,
    });
    textX = MARGIN + 10 + drawWidth + 14;
  }

  sheet.y = headerTop - 22;
  sheet.text(data.company.name.toUpperCase(), textX, 13, { bold: true });
  if (data.company.addressLine1) {
    sheet.y -= 14;
    sheet.text(data.company.addressLine1, textX, 8);
  }
  if (data.company.addressLine2) {
    sheet.y -= 11;
    sheet.text(data.company.addressLine2, textX, 8);
  }
  if (data.company.panNumber) {
    sheet.y -= 11;
    sheet.text(`PAN NO: ${data.company.panNumber}`, textX, 8);
  }
  sheet.y = headerTop - headerHeight - 14;

  // --- Title ---
  const titleHeight = 40;
  sheet.box(MARGIN, sheet.y - titleHeight, CONTENT_WIDTH, titleHeight);
  sheet.y -= 16;
  sheet.text("Pay Slip", MARGIN, 16, { bold: true, align: "center", width: CONTENT_WIDTH });
  sheet.y -= 16;
  sheet.text(`for ${data.periodLabel}`, MARGIN, 9, { align: "center", width: CONTENT_WIDTH });
  sheet.y = sheet.y - (titleHeight - 32) - 10;

  // --- Employee details table ---
  const d = data.payrollDetails;
  const col = [78, 118, 145, CONTENT_WIDTH - 78 - 118 - 145];
  sheet.table(
    MARGIN,
    sheet.y,
    col,
    [
      ["Employee Name", data.employee.fullName, "", ""],
      ["Employee Number", data.employee.employeeCode, "Tax Regime", d?.taxRegime ?? ""],
      ["Function", d?.function ?? "", "Income Tax Number (PAN)", d?.panNumber ?? ""],
      ["Designation", data.employee.designation ?? "", "Universal Account Number (UAN)", d?.uanNumber ?? ""],
      ["Location", d?.location ?? data.employee.department ?? "", "PF account number", d?.pfAccountNumber ?? ""],
      ["Bank Details", data.bankName ?? "", "ESI Number", d?.esiNumber ?? ""],
      ["Date of joining", data.employee.dateOfJoining, "PR Account Number (PRAN)", d?.pranNumber ?? ""],
    ],
    { boldRows: [], fontSize: 7.5 },
  );
  sheet.y -= 10;

  // --- Attendance details ---
  const attCol = [CONTENT_WIDTH / 2, CONTENT_WIDTH / 2];
  sheet.table(
    MARGIN,
    sheet.y,
    attCol,
    [
      ["Attendance Details", "Value"],
      ["Present", String(data.attendance.present)],
      ["Paid Leave", String(data.attendance.paidLeave)],
      ["Paid Leave Balance", String(data.attendance.paidLeaveBalance)],
    ],
    { boldRows: [0] },
  );
  sheet.y -= 10;

  // --- Earnings / Deductions ---
  const rowCount = Math.max(data.earningLines.length, data.deductionLines.length) + 2; // header + rows + total
  const eCol = [80, 70, 90];
  const dCol = [110, 55, CONTENT_WIDTH - eCol[0] - eCol[1] - eCol[2] - 110 - 55];
  const cols = [...eCol, ...dCol];
  const rows: string[][] = [["Earnings", "Amount", "Gross Salary", "Deductions", "AMT.", "Gross Salary"]];
  const maxLines = Math.max(data.earningLines.length, data.deductionLines.length);
  for (let i = 0; i < maxLines; i++) {
    const e = data.earningLines[i];
    const dLine = data.deductionLines[i];
    rows.push([
      e?.name ?? "",
      e ? fmt(e.amount) : "",
      e ? fmt(e.amount) : "",
      dLine?.name ?? "",
      dLine ? fmt(dLine.amount) : "",
      dLine ? fmt(dLine.amount) : "",
    ]);
  }
  rows.push(["Total Earnings", fmt(data.totalEarnings), fmt(data.totalEarnings), "Total Deductions", fmt(data.totalDeductions), fmt(data.totalDeductions)]);
  rows.push(["", "", "", "Net Amount", fmt(data.netAmount), fmt(data.netAmount)]);

  sheet.table(MARGIN, sheet.y, cols, rows, { boldRows: [0, rows.length - 2, rows.length - 1] });
  sheet.y -= 50;

  // --- Footer / signature ---
  sheet.text(`For ${data.company.name}`, MARGIN, 9, { align: "right", width: CONTENT_WIDTH });
  sheet.y -= 8;

  const signatureImage = await embedBase64Image(doc, data.company.signatureBase64);
  if (signatureImage) {
    const maxWidth = 110;
    const maxHeight = 50;
    const scale = Math.min(maxWidth / signatureImage.width, maxHeight / signatureImage.height, 1);
    const drawWidth = signatureImage.width * scale;
    const drawHeight = signatureImage.height * scale;
    sheet.y -= drawHeight;
    page.drawImage(signatureImage, {
      x: MARGIN + CONTENT_WIDTH - drawWidth,
      y: sheet.y,
      width: drawWidth,
      height: drawHeight,
    });
    sheet.y -= 6;
  } else {
    sheet.y -= 20;
  }
  sheet.text(data.company.signatoryLabel, MARGIN, 9, { align: "right", width: CONTENT_WIDTH });

  return doc.save();
}
