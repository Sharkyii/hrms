import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface EmployeeExitInfo {
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  lastWorkingDay: string;
  settlementAmount?: number;
}

export async function generateRelievingLetter(info: EmployeeExitInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 750;

  // Header
  page.drawText("RELIEVING LETTER", { x: margin, y, font: boldFont, size: 16 });
  y -= 40;

  const today = new Date().toISOString().split("T")[0];
  page.drawText(`Date: ${today}`, { x: margin, y, font, size: 10 });
  y -= 30;

  // Body
  page.drawText(`Dear ${info.employeeName},`, { x: margin, y, font, size: 11 });
  y -= 30;

  const paragraphs = [
    `This is to certify that you have been relieved of your duties as ${info.designation} in the ${info.department} department, effective ${info.lastWorkingDay}.`,
    `Your employment, which commenced on ${info.dateOfJoining}, has been satisfactorily concluded. You have been granted relieving from your position.`,
    `During your tenure, you have performed your duties diligently and to the satisfaction of the organization.`,
    `A full and final settlement has been processed. All dues and deductions have been accounted for. Your net settlement amount is ₹${info.settlementAmount ?? 0}.`,
    `We wish you all the very best in your future endeavors.`,
    `Please coordinate with the HR department for any pending documentation or handover procedures.`,
  ];

  for (const para of paragraphs) {
    const lines = wrapText(para, 85);
    for (const line of lines) {
      page.drawText(line, { x: margin, y, font, size: 10 });
      y -= 15;
    }
    y -= 10;
  }

  // Closing
  y -= 20;
  page.drawText("Yours faithfully,", { x: margin, y, font, size: 10 });
  y -= 60;
  page.drawText("_____________________", { x: margin, y, font, size: 10 });
  y -= 15;
  page.drawText("For the Organization", { x: margin, y, font, size: 10 });

  return doc.save();
}

export async function generateExperienceCertificate(info: EmployeeExitInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 750;

  // Header
  page.drawText("EXPERIENCE CERTIFICATE", { x: margin, y, font: boldFont, size: 16 });
  y -= 40;

  const today = new Date().toISOString().split("T")[0];
  page.drawText(`Date: ${today}`, { x: margin, y, font, size: 10 });
  y -= 30;

  // Body
  page.drawText(`To Whom It May Concern,`, { x: margin, y, font, size: 11 });
  y -= 30;

  const paragraphs = [
    `This is to certify that Mr./Ms. ${info.employeeName} (Employee Code: ${info.employeeCode}) was employed with our organization in the capacity of ${info.designation}, ${info.department} department.`,
    `Employment Period: From ${info.dateOfJoining} to ${info.lastWorkingDay}`,
    `During the period of employment, ${info.employeeName} has been a valuable team member and has demonstrated commendable professional conduct and dedication towards their responsibilities.`,
    `The employee has acquired substantial experience and expertise in their field during their tenure with us. We certify that ${info.employeeName} is a person of integrity and responsibility.`,
    `We wish ${info.employeeName} success in future endeavors.`,
  ];

  for (const para of paragraphs) {
    const lines = wrapText(para, 85);
    for (const line of lines) {
      page.drawText(line, { x: margin, y, font, size: 10 });
      y -= 15;
    }
    y -= 10;
  }

  // Closing
  y -= 20;
  page.drawText("Yours faithfully,", { x: margin, y, font, size: 10 });
  y -= 60;
  page.drawText("_____________________", { x: margin, y, font, size: 10 });
  y -= 15;
  page.drawText("For the Organization", { x: margin, y, font, size: 10 });

  return doc.save();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  return lines;
}
