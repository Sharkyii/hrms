import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  attendanceRecords,
  leaveRequests,
  leaveTypes,
  holidays,
  salaryStructures,
  salaryComponents,
  statutorySettings,
} from "../db/schema";

export interface PayableDaysResult {
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  lopDays: number;
  holidayDays: number;
  payableDays: number;
  otHours: number;
}

const FULL_DAY_HOURS = 6; // >=6h worked counts as a full present day
const HALF_DAY_HOURS = 3; // >=3h and <6h counts as a half day
const STANDARD_SHIFT_HOURS = 8; // hours beyond this on a present day count as overtime
const WORKING_DAYS_PER_MONTH_DIVISOR = 26; // used to prorate monthly salary — Sunday-off assumption

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isSunday(year: number, month: number, day: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}

// Reads approved attendance/leave/holiday records for the month and buckets them per the doc's
// list: present days, half days, paid leave, loss of pay, overtime, and holidays.
export async function computePayableDays(db: Db, employeeId: number, year: number, month: number): Promise<PayableDaysResult> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;

  const attendance = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.employeeId, employeeId),
        gte(attendanceRecords.date, from),
        lte(attendanceRecords.date, to),
      ),
    )
    .all();

  let presentDays = 0;
  let halfDays = 0;
  let otHours = 0;
  const presentDates = new Set<string>();

  for (const record of attendance) {
    if (record.status !== "approved" && record.status !== "auto_approved") continue;
    if (!record.punchInAt || !record.punchOutAt) continue;
    const hours = (new Date(record.punchOutAt).getTime() - new Date(record.punchInAt).getTime()) / 3_600_000;
    if (hours >= FULL_DAY_HOURS) {
      presentDays += 1;
      if (hours > STANDARD_SHIFT_HOURS) otHours += hours - STANDARD_SHIFT_HOURS;
    } else if (hours >= HALF_DAY_HOURS) {
      halfDays += 1;
    }
    presentDates.add(record.date);
  }

  const approvedLeave = await db
    .select({ leave: leaveRequests, type: leaveTypes })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.status, "approved")))
    .all();

  let paidLeaveDays = 0;
  let explicitLopDays = 0;
  const leaveDates = new Set<string>();
  for (const { leave, type } of approvedLeave) {
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (iso < from || iso > to) continue;
      leaveDates.add(iso);
      if (type.isPaid) paidLeaveDays += 1;
      else explicitLopDays += 1;
    }
  }

  const monthHolidays = await db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))).all();
  const holidayDates = new Set(monthHolidays.map((h) => h.date));
  const holidayDays = holidayDates.size;

  let unaccountedAbsence = 0;
  const totalDays = daysInMonth(year, month);
  for (let day = 1; day <= totalDays; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isSunday(year, month, day)) continue;
    if (holidayDates.has(iso) || presentDates.has(iso) || leaveDates.has(iso)) continue;
    unaccountedAbsence += 1;
  }

  const lopDays = explicitLopDays + unaccountedAbsence;
  const payableDays = presentDays + halfDays * 0.5 + paidLeaveDays + holidayDays;

  return { presentDays, halfDays, paidLeaveDays, lopDays, holidayDays, payableDays, otHours };
}

export interface StatutoryResult {
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  professionalTax: number;
}

interface PtSlab {
  upTo: number | null;
  amount: number;
}

export function computeStatutory(proratedBasic: number, grossEarnings: number, settings: typeof statutorySettings.$inferSelect): StatutoryResult {
  const pfWageBase = Math.min(proratedBasic, settings.pfWageCeiling);
  const pfEmployee = round2((pfWageBase * settings.pfEmployeePct) / 100);
  const pfEmployer = round2((pfWageBase * settings.pfEmployerPct) / 100);

  const esiApplicable = grossEarnings <= settings.esiWageCeiling;
  const esiEmployee = esiApplicable ? round2((grossEarnings * settings.esiEmployeePct) / 100) : 0;
  const esiEmployer = esiApplicable ? round2((grossEarnings * settings.esiEmployerPct) / 100) : 0;

  const slabs: PtSlab[] = JSON.parse(settings.professionalTaxSlabsJson);
  const sorted = [...slabs].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  const matched = sorted.find((slab) => slab.upTo === null || grossEarnings <= slab.upTo);
  const professionalTax = matched?.amount ?? 0;

  return { pfEmployee, pfEmployer, esiEmployee, esiEmployer, professionalTax };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface EarningsResult {
  proratedBasic: number;
  proratedHra: number;
  proratedOtherEarnings: number;
  grossEarnings: number;
  otAmount: number;
}

// Note: TDS (income tax withholding) is NOT auto-calculated — real slab/regime rules depend on
// each employee's declared exemptions and projected annual income, which this system doesn't model.
// HR/accounts should enter the TDS figure manually per payslip; see routes/payroll.ts.
export async function computeEarnings(db: Db, employeeId: number, payableDays: PayableDaysResult, standardWorkingDays: number): Promise<EarningsResult> {
  const structure = await db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, employeeId))
    .orderBy(salaryStructures.effectiveFrom)
    .all();
  const active = structure.at(-1);
  if (!active) {
    return { proratedBasic: 0, proratedHra: 0, proratedOtherEarnings: 0, grossEarnings: 0, otAmount: 0 };
  }

  const ratio = Math.min(payableDays.payableDays / standardWorkingDays, 1);
  const proratedBasic = round2(active.basic * ratio);
  const proratedHra = round2(active.hra * ratio);

  const components = await db.select().from(salaryComponents).where(eq(salaryComponents.structureId, active.id)).all();
  const otherEarnings = components.filter((c) => c.type === "earning").reduce((sum, c) => sum + c.amount, 0);
  const proratedOtherEarnings = round2(otherEarnings * ratio);

  const hourlyRate = active.basic / (standardWorkingDays * STANDARD_SHIFT_HOURS);
  const otAmount = round2(payableDays.otHours * hourlyRate);

  const grossEarnings = round2(proratedBasic + proratedHra + proratedOtherEarnings + otAmount);
  return { proratedBasic, proratedHra, proratedOtherEarnings, grossEarnings, otAmount };
}

export const STANDARD_WORKING_DAYS_PER_MONTH = WORKING_DAYS_PER_MONTH_DIVISOR;
