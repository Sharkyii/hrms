import XLSX from "xlsx";
import { writeFileSync } from "node:fs";

const days = ["2026-08-13", "2026-08-14", "2026-08-17", "2026-08-18"];
const people = [
  { code: "EMP-101", inTime: "09:12", outTime: "18:20" },
  { code: "EMP-102", inTime: "09:35", outTime: "19:05" },
  { code: "EMP-103", inTime: "09:50", outTime: "18:45" },
];

const rows = [["User ID", "DateTime", "In/Out"]];
for (const day of days) {
  for (const p of people) {
    rows.push([p.code, `${day} ${p.inTime}:00`, "IN"]);
    rows.push([p.code, `${day} ${p.outTime}:00`, "OUT"]);
  }
}

const sheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, "Punches");
const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
writeFileSync("/tmp/demo-biometric.xlsx", buffer);
console.log("Wrote /tmp/demo-biometric.xlsx with", rows.length - 1, "rows");
